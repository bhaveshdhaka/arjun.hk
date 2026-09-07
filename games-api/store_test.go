package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func testState(srsLastAt int64, sessions int) State {
	st := newState()
	st.Srs["flag:de"] = SrsEntry{Box: 3, Attempts: 5, Correct: 4, Streak: 2, AvgMs: 900, Due: srsLastAt + 100, LastAt: srsLastAt}
	for i := 0; i < sessions; i++ {
		st.Sessions = append(st.Sessions, Session{At: "2026-09-07T10:0" + string(rune('0'+i)) + ":00Z", N: 10, Correct: 8, Score: 900 + i, Streak: 3, TimeMs: 60000})
	}
	st.recomputeTotals()
	return st
}

func TestMergeLWW(t *testing.T) {
	a := newState()
	a.Srs["flag:de"] = SrsEntry{Box: 2, LastAt: 100}
	b := newState()
	b.Srs["flag:de"] = SrsEntry{Box: 5, LastAt: 200}
	b.Srs["flag:fr"] = SrsEntry{Box: 1, LastAt: 150}
	a.merge(b)
	if a.Srs["flag:de"].Box != 5 {
		t.Fatalf("expected newer entry to win, got box %d", a.Srs["flag:de"].Box)
	}
	if a.Srs["flag:fr"].Box != 1 {
		t.Fatal("expected new key merged in")
	}
}

func TestMergeOlderDoesNotWin(t *testing.T) {
	a := newState()
	a.Srs["flag:de"] = SrsEntry{Box: 5, LastAt: 500}
	b := newState()
	b.Srs["flag:de"] = SrsEntry{Box: 1, LastAt: 100}
	a.merge(b)
	if a.Srs["flag:de"].Box != 5 {
		t.Fatalf("older entry must not overwrite newer")
	}
}

func TestSessionDedupeAndTotals(t *testing.T) {
	a := testState(100, 2)
	b := testState(100, 3)
	a.merge(b)
	if len(a.Sessions) != 3 {
		t.Fatalf("expected 3 unique sessions, got %d", len(a.Sessions))
	}
	if a.Totals.Plays != 3 || a.Totals.Score != 900+901+902 {
		t.Fatalf("totals not recomputed: %+v", a.Totals)
	}
}

func TestServerAuthAndSync(t *testing.T) {
	t.Setenv("ARJUN_PIN", "2909")
	dir := t.TempDir()
	st, err := newFileStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	tokens, err := newTokenStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	srv := &apiServer{store: st, tokens: tokens, limiter: newLoginLimiter(), pin: "2909"}
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/login":
			withCORS(srv.handleLogin)(w, r)
		case "/v1/sync":
			withCORS(srv.handleSync)(w, r)
		case "/v1/state":
			withCORS(srv.handleState)(w, r)
		default:
			http.NotFound(w, r)
		}
	}))
	defer ts.Close()

	post := func(path, body, token string) *http.Response {
		req, _ := http.NewRequest("POST", ts.URL+path, bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		return resp
	}

	if resp := post("/v1/login", `{"pin":"0000"}`, ""); resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("wrong pin should 401, got %d", resp.StatusCode)
	}
	resp := post("/v1/login", `{"pin":"2909"}`, "")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("right pin should 200, got %d", resp.StatusCode)
	}
	var lr struct {
		Token string `json:"token"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&lr)
	if lr.Token == "" {
		t.Fatal("expected token")
	}

	if resp := post("/v1/sync", `{"srs":{},"sessions":[]}`, ""); resp.StatusCode != http.StatusUnauthorized {
		t.Fatal("sync without token should 401")
	}

	local := testState(500, 1)
	payload, _ := json.Marshal(local)
	resp = post("/v1/sync", string(payload), lr.Token)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("sync should 200, got %d", resp.StatusCode)
	}
	var merged State
	_ = json.NewDecoder(resp.Body).Decode(&merged)
	if merged.Totals.Plays != 1 {
		t.Fatalf("expected 1 session on server, got %d", merged.Totals.Plays)
	}

	req, _ := http.NewRequest("GET", ts.URL+"/v1/state", nil)
	req.Header.Set("Authorization", "Bearer "+lr.Token)
	resp2, _ := http.DefaultClient.Do(req)
	var got State
	_ = json.NewDecoder(resp2.Body).Decode(&got)
	if len(got.Sessions) != 1 || got.Srs["flag:de"].Box != 3 {
		t.Fatalf("roundtrip mismatch: %+v", got)
	}

	if _, err := os.Stat(filepath.Join(dir, "state.json")); err != nil {
		t.Fatal("state.json should persist")
	}
}
