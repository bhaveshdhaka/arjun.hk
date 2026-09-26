package main

import (
	"encoding/json"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

const allowOrigin = "https://arjun.hk"

type loginLimiter struct {
	mu      sync.Mutex
	fails   map[string][]time.Time
	maxFail int
	window  time.Duration
}

func newLoginLimiter() *loginLimiter {
	return &loginLimiter{fails: map[string][]time.Time{}, maxFail: 5, window: 5 * time.Minute}
}

func (l *loginLimiter) blocked(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	keep := l.fails[ip][:0]
	for _, t := range l.fails[ip] {
		if now.Sub(t) < l.window {
			keep = append(keep, t)
		}
	}
	l.fails[ip] = keep
	return len(keep) >= l.maxFail
}

func (l *loginLimiter) fail(ip string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.fails[ip] = append(l.fails[ip], time.Now())
}

func (l *loginLimiter) reset(ip string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.fails, ip)
}

func clientIP(r *http.Request) string {
	// The service is only reachable through the cloudflared tunnel, which
	// sets CF-Connecting-IP to the real visitor address. RemoteAddr here is
	// the tunnel itself — one shared IP for the whole world.
	if ip := r.Header.Get("CF-Connecting-IP"); ip != "" {
		return ip
	}
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if i := strings.IndexByte(xff, ','); i > 0 {
			xff = xff[:i]
		}
		return strings.TrimSpace(xff)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func withCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", allowOrigin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, If-Match")
		w.Header().Set("Vary", "Origin")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next(w, r)
	}
}

type apiServer struct {
	store   *fileStore
	tokens  *tokenStore
	limiter *loginLimiter
	orderIP *loginLimiter
	pin     string
	menu    *menuStore
	orders  *orderStore
}

func (s *apiServer) handleHealth(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("ok"))
}

func (s *apiServer) handleLogin(w http.ResponseWriter, r *http.Request) {
	ip := clientIP(r)
	if s.limiter.blocked(ip) {
		writeErr(w, http.StatusTooManyRequests, "too many attempts — wait five minutes")
		return
	}
	var body struct {
		Pin string `json:"pin"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&body); err != nil || body.Pin == "" {
		writeErr(w, http.StatusBadRequest, "send {\"pin\": \"...\"}")
		return
	}
	if body.Pin != s.pin {
		s.limiter.fail(ip)
		writeErr(w, http.StatusUnauthorized, "wrong pin")
		return
	}
	s.limiter.reset(ip)
	tok, err := newToken()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "token generation failed")
		return
	}
	if err := s.tokens.add(tok); err != nil {
		writeErr(w, http.StatusInternalServerError, "token storage failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"token": tok})
}

func (s *apiServer) handleLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	const prefix = "Bearer "
	authz := r.Header.Get("Authorization")
	if len(authz) > len(prefix) && authz[:len(prefix)] == prefix {
		s.tokens.revoke(authz[len(prefix):])
	}
	writeJSON(w, http.StatusOK, map[string]string{"ok": "true"})
}

func (s *apiServer) auth(r *http.Request) bool {
	const prefix = "Bearer "
	authz := r.Header.Get("Authorization")
	if len(authz) <= len(prefix) || authz[:len(prefix)] != prefix {
		return false
	}
	return s.tokens.valid(authz[len(prefix):])
}

func (s *apiServer) handleState(w http.ResponseWriter, r *http.Request) {
	if !s.auth(r) {
		writeErr(w, http.StatusUnauthorized, "login first")
		return
	}
	st, err := s.store.load()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "load failed")
		return
	}
	writeJSON(w, http.StatusOK, st)
}

func (s *apiServer) handleSync(w http.ResponseWriter, r *http.Request) {
	if !s.auth(r) {
		writeErr(w, http.StatusUnauthorized, "login first")
		return
	}
	var incoming State
	if err := json.NewDecoder(r.Body).Decode(&incoming); err != nil {
		writeErr(w, http.StatusBadRequest, "bad state body")
		return
	}
	if incoming.Srs == nil {
		incoming.Srs = map[string]SrsEntry{}
	}
	merged, err := s.store.mergeIn(incoming)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "merge failed")
		return
	}
	writeJSON(w, http.StatusOK, merged)
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

func main() {
	pin := os.Getenv("ARJUN_PIN")
	if pin == "" {
		log.Fatal("ARJUN_PIN not set")
	}
	dataDir := os.Getenv("DATA_DIR")
	if dataDir == "" {
		dataDir = "/data"
	}
	st, err := newFileStore(dataDir)
	if err != nil {
		log.Fatalf("data dir: %v", err)
	}
	tokens, err := newTokenStore(dataDir)
	if err != nil {
		log.Fatalf("token store: %v", err)
	}
	menu, err := newMenuStore(dataDir)
	if err != nil {
		log.Fatalf("menu store: %v", err)
	}
	srv := &apiServer{
		store: st, tokens: tokens, limiter: newLoginLimiter(), pin: pin,
		menu: menu, orders: newOrderStore(dataDir),
		orderIP: &loginLimiter{fails: map[string][]time.Time{}, maxFail: 12, window: 5 * time.Minute},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", srv.handleHealth)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"service": "arjun-games-api", "ok": "true"})
	})
	mux.HandleFunc("/v1/login", withCORS(srv.handleLogin))
	mux.HandleFunc("/v1/logout", withCORS(srv.handleLogout))
	mux.HandleFunc("/v1/state", withCORS(srv.handleState))
	mux.HandleFunc("/v1/sync", withCORS(srv.handleSync))
	mux.HandleFunc("/v1/menu", withCORS(srv.handleMenu))
	mux.HandleFunc("/v1/menu/img", withCORS(srv.handleImageUpload))
	mux.HandleFunc("/v1/img/", srv.handleImageGet)
	mux.HandleFunc("/v1/orders", withCORS(srv.handleOrdersRoute))
	mux.HandleFunc("/v1/orders/status", withCORS(srv.handleOrderStatus))
	mux.HandleFunc("/v1/orders/clear", withCORS(srv.handleOrderClear))

	addr := "0.0.0.0:8080"
	if p := os.Getenv("PORT"); p != "" {
		addr = "0.0.0.0:" + p
	}
	log.Printf("games-api listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}
