package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	maxImageBytes  = 400 << 10 // 400 KB per photo
	maxOrderLines  = 40
	maxOrderNote   = 300
	ordersKeepDone = 24 * time.Hour
	maxTables      = 40
	maxMenuItems   = 80
)

var (
	validMenuSlot    = regexp.MustCompile(`^(breakfast|lunch|dinner|midnight|allday)$`)
	validImageName   = regexp.MustCompile(`^[a-f0-9]{16}\.(jpg|png)$`)
	validOrderStatus = regexp.MustCompile(`^(cooking|completed)$`)
)

type MenuItem struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Emoji   string `json:"emoji,omitempty"`
	Desc    string `json:"desc,omitempty"`
	Price   int    `json:"price"`
	Menu    string `json:"menu"`
	SoldOut bool   `json:"soldOut,omitempty"`
	Sort    int    `json:"sort"`
	Img     string `json:"img,omitempty"`
}

type Menu struct {
	Tables int        `json:"tables"`
	Items  []MenuItem `json:"items"`
}

type OrderLine struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Qty   int    `json:"qty"`
	Price int    `json:"price"`
}

type Order struct {
	ID     string      `json:"id"`
	Table  int         `json:"table"`
	Items  []OrderLine `json:"items"`
	Total  int         `json:"total"`
	Note   string      `json:"note,omitempty"`
	Pay    string      `json:"pay,omitempty"`
	At     int64       `json:"at"`
	Status string      `json:"status"`
}

// ---------- tiny JSON file doc ----------

type jsonDoc struct {
	mu   sync.Mutex
	path string
}

func newJSONDoc(dataDir, name string) *jsonDoc {
	_ = os.MkdirAll(dataDir, 0o755)
	return &jsonDoc{path: filepath.Join(dataDir, name)}
}

func (j *jsonDoc) read(v any) error {
	b, err := os.ReadFile(j.path)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, v)
}

func (j *jsonDoc) write(v any) error {
	j.mu.Lock()
	defer j.mu.Unlock()
	return j.writeLocked(v)
}

func (j *jsonDoc) writeLocked(v any) error {
	b, err := json.MarshalIndent(v, "", " ")
	if err != nil {
		return err
	}
	tmp := j.path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, j.path)
}

// ---------- menu store ----------

type menuStore struct {
	doc    *jsonDoc
	imgDir string
	mu     sync.Mutex
}

func newMenuStore(dataDir string) (*menuStore, error) {
	imgDir := filepath.Join(dataDir, "img")
	if err := os.MkdirAll(imgDir, 0o755); err != nil {
		return nil, err
	}
	return &menuStore{doc: newJSONDoc(dataDir, "menu.json"), imgDir: imgDir}, nil
}

func (m *Menu) byID() map[string]MenuItem {
	out := map[string]MenuItem{}
	for _, it := range m.Items {
		out[it.ID] = it
	}
	return out
}

func (m *Menu) normalize() error {
	if m.Tables < 0 || m.Tables > maxTables {
		return fmt.Errorf("tables must be 0..%d", maxTables)
	}
	if len(m.Items) > maxMenuItems {
		return fmt.Errorf("too many items (max %d)", maxMenuItems)
	}
	seen := map[string]bool{}
	for i, it := range m.Items {
		if it.ID == "" {
			return fmt.Errorf("item %d missing id", i+1)
		}
		if seen[it.ID] {
			return fmt.Errorf("duplicate item id %s", it.ID)
		}
		seen[it.ID] = true
		if strings.TrimSpace(it.Name) == "" {
			return fmt.Errorf("item %s missing name", it.ID)
		}
		if len(it.Name) > 40 || len(it.Desc) > 120 || len(it.Emoji) > 8 {
			return fmt.Errorf("item %s text too long", it.ID)
		}
		if it.Price < 0 || it.Price > 100000 {
			return fmt.Errorf("item %s price out of range", it.ID)
		}
		if !validMenuSlot.MatchString(it.Menu) {
			return fmt.Errorf("item %s bad menu slot %q", it.ID, it.Menu)
		}
	}
	sort.SliceStable(m.Items, func(i, j int) bool { return m.Items[i].Sort < m.Items[j].Sort })
	return nil
}

func (s *menuStore) get() (Menu, error) {
	var m Menu
	if err := s.doc.read(&m); err == nil {
		return m, nil
	}
	return Menu{}, s.doc.write(Menu{}) // seed empty on first read
}

func (s *menuStore) update(m Menu) (Menu, error) {
	if err := m.normalize(); err != nil {
		return Menu{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.doc.writeLocked(m); err != nil {
		return Menu{}, err
	}
	return m, nil
}

func sniffImage(r io.Reader, limit int64) ([]byte, string, error) {
	b, err := io.ReadAll(io.LimitReader(r, limit))
	if err != nil {
		return nil, "", fmt.Errorf("read failed")
	}
	if len(b) < 8 {
		return nil, "", fmt.Errorf("image too small")
	}
	switch {
	case b[0] == 0xff && b[1] == 0xd8:
		return b, "jpg", nil
	case b[0] == 0x89 && b[1] == 0x50:
		return b, "png", nil
	default:
		return nil, "", fmt.Errorf("only jpeg or png allowed")
	}
}

func (s *menuStore) saveImage(b []byte, ext string) (string, error) {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	name := hex.EncodeToString(buf) + "." + ext
	if err := os.WriteFile(filepath.Join(s.imgDir, name), b, 0o644); err != nil {
		return "", err
	}
	return name, nil
}

func (s *menuStore) openImage(name string) (*os.File, error) {
	if !validImageName.MatchString(name) {
		return nil, fmt.Errorf("bad image name")
	}
	return os.Open(filepath.Join(s.imgDir, name))
}

// ---------- orders store ----------

type orderStore struct {
	doc *jsonDoc
	mu  sync.Mutex
}

func newOrderStore(dataDir string) *orderStore {
	return &orderStore{doc: newJSONDoc(dataDir, "orders.json")}
}

func (o *orderStore) listLocked() ([]Order, error) {
	var all []Order
	if err := o.doc.read(&all); err != nil {
		return []Order{}, nil // fresh store
	}
	kept := make([]Order, 0, len(all))
	now := time.Now().UnixMilli()
	for _, ord := range all {
		age := time.Duration(now-ord.At) * time.Millisecond
		if ord.Status == "completed" {
			if age > ordersKeepDone {
				continue
			}
		} else if age > 6*time.Hour {
			continue // stale un-served ticket, drop silently
		}
		kept = append(kept, ord)
	}
	sort.SliceStable(kept, func(i, j int) bool { return kept[i].At < kept[j].At })
	return kept, nil
}

func (o *orderStore) list() ([]Order, error) {
	o.mu.Lock()
	defer o.mu.Unlock()
	return o.listLocked()
}

func (o *orderStore) add(ord Order) error {
	o.mu.Lock()
	defer o.mu.Unlock()
	all, err := o.listLocked()
	if err != nil {
		return err
	}
	all = append(all, ord)
	return o.doc.writeLocked(all)
}

func (o *orderStore) setStatus(id, status string) (Order, error) {
	o.mu.Lock()
	defer o.mu.Unlock()
	all, err := o.listLocked()
	if err != nil {
		return Order{}, err
	}
	found := false
	for i, ord := range all {
		if ord.ID == id {
			all[i].Status = status
			found = true
			break
		}
	}
	if !found {
		return Order{}, fmt.Errorf("order not found")
	}
	if err := o.doc.writeLocked(all); err != nil {
		return Order{}, err
	}
	return all[0], nil // caller only needs ok; return list head
}

// ---------- handlers ----------

func (s *apiServer) handleMenu(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		m, err := s.menu.get()
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "menu load failed")
			return
		}
		writeJSON(w, http.StatusOK, m)
	case http.MethodPut:
		if !s.auth(r) {
			writeErr(w, http.StatusUnauthorized, "login first")
			return
		}
		var m Menu
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 256<<10)).Decode(&m); err != nil {
			writeErr(w, http.StatusBadRequest, "bad menu body")
			return
		}
		saved, err := s.menu.update(m)
		if err != nil {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, saved)
	default:
		writeErr(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *apiServer) handleImageUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if !s.auth(r) {
		writeErr(w, http.StatusUnauthorized, "login first")
		return
	}
	b, ext, err := sniffImage(http.MaxBytesReader(w, r.Body, maxImageBytes+1), maxImageBytes+1)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(b) > maxImageBytes {
		writeErr(w, http.StatusRequestEntityTooLarge, "image too large (max 400 KB after resize)")
		return
	}
	name, err := s.menu.saveImage(b, ext)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "image save failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"img": "/v1/img/" + name})
}

func (s *apiServer) handleImageGet(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/v1/img/")
	f, err := s.menu.openImage(name)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer f.Close()
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	if strings.HasSuffix(name, ".png") {
		w.Header().Set("Content-Type", "image/png")
	} else {
		w.Header().Set("Content-Type", "image/jpeg")
	}
	_, _ = io.Copy(w, f)
}

func (s *apiServer) handleOrderCreate(w http.ResponseWriter, r *http.Request) {
	ip := clientIP(r)
	if s.orderIP.blocked(ip) {
		writeErr(w, http.StatusTooManyRequests, "too many orders — wait five minutes")
		return
	}
	var in struct {
		Table int         `json:"table"`
		Items []OrderLine `json:"items"`
		Note  string      `json:"note"`
		Pay   string      `json:"pay"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32<<10)).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "bad order body")
		return
	}
	if in.Table < 1 || in.Table > effectiveTables(s.menuTables()) {
		s.orderIP.fail(ip)
		writeErr(w, http.StatusBadRequest, "table number not available")
		return
	}
	if len(in.Items) < 1 || len(in.Items) > maxOrderLines {
		writeErr(w, http.StatusBadRequest, fmt.Sprintf("order needs 1..%d lines", maxOrderLines))
		return
	}
	if len(in.Note) > maxOrderNote {
		writeErr(w, http.StatusBadRequest, "note too long")
		return
	}
	switch in.Pay {
	case "cash", "tappay", "octopus", "visa", "mastercard":
	default:
		writeErr(w, http.StatusBadRequest, "unknown payment method")
		return
	}
	menu, err := s.menu.get()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "menu load failed")
		return
	}
	items := menu.byID()
	out := make([]OrderLine, 0, len(in.Items))
	total := 0
	for _, line := range in.Items {
		it, ok := items[line.ID]
		if !ok || it.SoldOut {
			writeErr(w, http.StatusBadRequest, "unavailable item: "+line.ID)
			return
		}
		qty := line.Qty
		if qty < 1 || qty > 20 {
			writeErr(w, http.StatusBadRequest, "quantity must be 1..20")
			return
		}
		out = append(out, OrderLine{ID: it.ID, Name: it.Name, Qty: qty, Price: it.Price})
		total += it.Price * qty
	}
	id, err := newToken()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "id generation failed")
		return
	}
	ord := Order{
		ID:     id[:16],
		Table:  in.Table,
		Items:  out,
		Total:  total,
		Note:   strings.TrimSpace(in.Note),
		Pay:    in.Pay,
		At:     nowMillis(),
		Status: "pending",
	}
	if err := s.orders.add(ord); err != nil {
		writeErr(w, http.StatusInternalServerError, "order save failed")
		return
	}
	writeJSON(w, http.StatusOK, ord)
}

func (s *apiServer) handleOrdersRoute(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		s.handleOrderList(w, r)
	case http.MethodPost:
		s.handleOrderCreate(w, r)
	default:
		writeErr(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *apiServer) handleOrderList(w http.ResponseWriter, r *http.Request) {
	if !s.auth(r) {
		writeErr(w, http.StatusUnauthorized, "login first")
		return
	}
	ords, err := s.orders.list()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "orders load failed")
		return
	}
	writeJSON(w, http.StatusOK, ords)
}

func (s *apiServer) handleOrderStatus(w http.ResponseWriter, r *http.Request) {
	if !s.auth(r) {
		writeErr(w, http.StatusUnauthorized, "login first")
		return
	}
	if r.Method != http.MethodPost {
		writeErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var in struct {
		ID     string `json:"id"`
		Status string `json:"status"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "bad body")
		return
	}
	switch in.Status {
	case "cooking", "completed":
	default:
		writeErr(w, http.StatusBadRequest, "bad status")
		return
	}
	if !validOrderStatus.MatchString(in.Status) {
		writeErr(w, http.StatusBadRequest, "bad status")
		return
	}
	updated, err := s.orders.setStatus(in.ID, in.Status)
	if err != nil {
		writeErr(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (s *apiServer) menuTables() int {
	m, err := s.menu.get()
	if err != nil {
		return 0
	}
	return m.Tables
}

// defaultTables matches the guest page fallback: until the admin configures
// the restaurant, both sides agree on this many tables.
const defaultTables = 10

func effectiveTables(n int) int {
	if n <= 0 {
		return defaultTables
	}
	return n
}
