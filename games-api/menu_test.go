package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"
)

func newTestServer(t *testing.T, pin string) *apiServer {
	t.Helper()
	dir := t.TempDir()
	st, err := newFileStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	tokens, err := newTokenStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	menu, err := newMenuStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	return &apiServer{
		store: st, tokens: tokens,
		limiter: newLoginLimiter(),
		orderIP: &loginLimiter{fails: map[string][]time.Time{}, maxFail: 6, window: 5 * time.Minute},
		pin:     pin, menu: menu, orders: newOrderStore(dir),
	}
}

func do(t *testing.T, s *apiServer, method, path string, token string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatal(err)
		}
	}
	req := httptest.NewRequest(method, path, &buf)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rr := httptest.NewRecorder()
	s.handleMenu(rr, req)
	return rr
}

func code(t *testing.T, rr *httptest.ResponseRecorder) int {
	t.Helper()
	return rr.Result().StatusCode
}

func tokenFor(t *testing.T, s *apiServer) string {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/v1/login", bytes.NewBufferString(`{"pin":"`+s.pin+`"}`))
	rr := httptest.NewRecorder()
	s.handleLogin(rr, req)
	if rr.Code != 200 {
		t.Fatalf("login failed: %d", rr.Code)
	}
	var out map[string]string
	if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	return out["token"]
}

func TestMenuPublicReadFresh(t *testing.T) {
	s := newTestServer(t, "x")
	rr := do(t, s, http.MethodGet, "/v1/menu", "", nil)
	if rr.Code != 200 {
		t.Fatalf("get: %d", rr.Code)
	}
	var m Menu
	if err := json.Unmarshal(rr.Body.Bytes(), &m); err != nil {
		t.Fatal(err)
	}
	if m.Tables != 0 || m.Items != nil {
		t.Fatalf("expected fresh empty menu, got %+v", m)
	}
}

func TestMenuUpdateRoundTrip(t *testing.T) {
	s := newTestServer(t, "x")
	tok := tokenFor(t, s)
	m := Menu{Tables: 8, Items: []MenuItem{
		{ID: "bagel", Name: "Bagel", Price: 20, Menu: "breakfast", Sort: 1},
		{ID: "cheese", Name: "Cheese", Price: 13, Menu: "allday", Sort: 0},
	}}
	rr := do(t, s, http.MethodPut, "/v1/menu", tok, m)
	if code(t, rr) != 200 {
		t.Fatalf("put: %d %s", rr.Code, rr.Body.String())
	}
	rr = do(t, s, http.MethodGet, "/v1/menu", "", nil)
	var got Menu
	_ = json.Unmarshal(rr.Body.Bytes(), &got)
	if got.Tables != 8 || len(got.Items) != 2 || got.Items[0].ID != "cheese" {
		t.Fatalf("round trip wrong: %+v", got)
	}
}

func TestMenuUpdateRequiresAuth(t *testing.T) {
	s := newTestServer(t, "x")
	rr := do(t, s, http.MethodPut, "/v1/menu", "", Menu{Tables: 2})
	if code(t, rr) != 401 {
		t.Fatalf("expected 401, got %d", rr.Code)
	}
}

func TestMenuNormalizeRejects(t *testing.T) {
	cases := []struct {
		name string
		menu Menu
	}{
		{"bad slot", Menu{Tables: 2, Items: []MenuItem{{ID: "a", Name: "A", Menu: "brunch", Price: 1}}}},
		{"dup id", Menu{Tables: 2, Items: []MenuItem{{ID: "a", Name: "A", Menu: "allday"}, {ID: "a", Name: "B", Menu: "allday"}}}},
		{"too many tables", Menu{Tables: 999}},
		{"no name", Menu{Tables: 2, Items: []MenuItem{{ID: "a", Name: "  ", Menu: "allday"}}}},
	}
	s := newTestServer(t, "x")
	tok := tokenFor(t, s)
	for _, tc := range cases {
		if rr := do(t, s, http.MethodPut, "/v1/menu", tok, tc.menu); code(t, rr) != 400 {
			t.Fatalf("%s: expected 400, got %d", tc.name, rr.Code)
		}
	}
}

func TestImageUploadSniff(t *testing.T) {
	s := newTestServer(t, "x")
	tok := tokenFor(t, s)
	jpeg := append([]byte{0xff, 0xd8, 0xff, 0xe0}, make([]byte, 64)...)
	req := httptest.NewRequest(http.MethodPost, "/v1/menu/img", bytes.NewReader(jpeg))
	req.Header.Set("Authorization", "Bearer "+tok)
	rr := httptest.NewRecorder()
	s.handleImageUpload(rr, req)
	if rr.Code != 200 {
		t.Fatalf("jpeg upload: %d %s", rr.Code, rr.Body.String())
	}
	var out map[string]string
	if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if filepath.Ext(out["img"]) != ".jpg" {
		t.Fatalf("wrong ext: %s", out["img"])
	}
	// text must reject
	req2 := httptest.NewRequest(http.MethodPost, "/v1/menu/img", bytes.NewReader([]byte("hello, not an image")))
	req2.Header.Set("Authorization", "Bearer "+tok)
	rr2 := httptest.NewRecorder()
	s.handleImageUpload(rr2, req2)
	if code(t, rr2) != 400 {
		t.Fatalf("text upload: expected 400, got %d", rr2.Code)
	}
	// oversized must reject
	big := bytes.Repeat([]byte{0xff, 0xd8, 0xaa}, maxImageBytes)
	req3 := httptest.NewRequest(http.MethodPost, "/v1/menu/img", bytes.NewReader(big))
	req3.Header.Set("Authorization", "Bearer "+tok)
	rr3 := httptest.NewRecorder()
	s.handleImageUpload(rr3, req3)
	if rr3.Code == 200 {
		t.Fatalf("oversized upload accepted")
	}
	// unauth
	req4 := httptest.NewRequest(http.MethodPost, "/v1/menu/img", bytes.NewReader(jpeg))
	rr4 := httptest.NewRecorder()
	s.handleImageUpload(rr4, req4)
	if code(t, rr4) != 401 {
		t.Fatalf("unauth upload: expected 401, got %d", rr4.Code)
	}
}

func TestImageGetTraversalSafe(t *testing.T) {
	s := newTestServer(t, "x")
	name, err := s.menu.saveImage([]byte{0xff, 0xd8, 0x00, 0x01}, "jpg")
	if err != nil {
		t.Fatal(err)
	}
	f, err := s.menu.openImage(name)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	f.Close()
	if _, err := s.menu.openImage("../../etc/passwd"); err == nil {
		t.Fatal("traversal accepted")
	}
	if _, err := s.menu.openImage("deadbeef.txt"); err == nil {
		t.Fatal("bad ext accepted")
	}
}

func postOrder(t *testing.T, s *apiServer, body any) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	_ = json.NewEncoder(&buf).Encode(body)
	req := httptest.NewRequest(http.MethodPost, "/v1/orders", &buf)
	rr := httptest.NewRecorder()
	s.handleOrdersRoute(rr, req)
	return rr
}

func TestOrderCreateHappyPath(t *testing.T) {
	s := newTestServer(t, "x")
	_, err := s.menu.update(Menu{Tables: 6, Items: []MenuItem{
		{ID: "cheese", Name: "Cheese", Price: 13, Menu: "allday"},
		{ID: "bagel", Name: "Bagel", Price: 20, Menu: "breakfast", SoldOut: true},
	}})
	if err != nil {
		t.Fatal(err)
	}
	rr := postOrder(t, s, map[string]any{
		"table": 3,
		"items": []map[string]any{{"id": "cheese", "qty": 2}, {"id": "cheese", "qty": 1}},
		"note":  "no grapes please",
		"pay":   "octopus",
	})
	if rr.Code != 200 {
		t.Fatalf("create: %d %s", rr.Code, rr.Body.String())
	}
	var ord Order
	_ = json.Unmarshal(rr.Body.Bytes(), &ord)
	if ord.Total != 39 || ord.Status != "pending" || len(ord.Items) != 2 {
		t.Fatalf("order wrong: %+v", ord)
	}
	if ord.Items[0].Name != "Cheese" || ord.Items[0].Price != 13 {
		t.Fatalf("name/price not derived from menu: %+v", ord.Items[0])
	}
	// sold out item rejected
	rr = postOrder(t, s, map[string]any{"table": 1, "items": []map[string]any{{"id": "bagel", "qty": 1}}, "pay": "cash"})
	if rr.Code != 400 {
		t.Fatalf("sold-out order: expected 400, got %d", rr.Code)
	}
	// unknown id rejected
	rr = postOrder(t, s, map[string]any{"table": 1, "items": []map[string]any{{"id": "ghost", "qty": 1}}, "pay": "cash"})
	if rr.Code != 400 {
		t.Fatalf("unknown id: expected 400, got %d", rr.Code)
	}
	// bad table rejected + counts toward rate limit
	ip := "1.2.3.4"
	for i := 0; i < 6; i++ {
		r2 := httptest.NewRequest(http.MethodPost, "/v1/orders", bytes.NewBufferString(`{"table":99,"items":[{"id":"cheese","qty":1}],"pay":"cash"}`))
		r2.RemoteAddr = ip + ":5555"
		rr2 := httptest.NewRecorder()
		s.handleOrdersRoute(rr2, r2)
	}
	r3 := httptest.NewRequest(http.MethodPost, "/v1/orders", bytes.NewBufferString(`{"table":1,"items":[{"id":"cheese","qty":1}],"pay":"cash"}`))
	r3.RemoteAddr = ip + ":5555"
	rr3 := httptest.NewRecorder()
	s.handleOrdersRoute(rr3, r3)
	if code(t, rr3) != 429 {
		t.Fatalf("rate limit: expected 429, got %d", rr3.Code)
	}
}

func TestOrderStatusTransition(t *testing.T) {
	s := newTestServer(t, "x")
	tok := tokenFor(t, s)
	_, _ = s.menu.update(Menu{Tables: 4, Items: []MenuItem{{ID: "a", Name: "A", Price: 5, Menu: "allday"}}})
	rr := postOrder(t, s, map[string]any{"table": 2, "items": []map[string]any{{"id": "a", "qty": 1}}, "pay": "cash"})
	var ord Order
	_ = json.Unmarshal(rr.Body.Bytes(), &ord)
	// list requires auth
	unauth := httptest.NewRequest(http.MethodGet, "/v1/orders", nil)
	rec0 := httptest.NewRecorder()
	s.handleOrdersRoute(rec0, unauth)
	if rec0.Code != 401 {
		t.Fatalf("list: expected 401, got %d", rec0.Code)
	}
	// advance twice
	for _, want := range []string{"cooking", "completed"} {
		req := httptest.NewRequest(http.MethodPost, "/v1/orders/status", bytes.NewBufferString(`{"id":"`+ord.ID+`","status":"`+want+`"}`))
		req.Header.Set("Authorization", "Bearer "+tok)
		rec := httptest.NewRecorder()
		s.handleOrderStatus(rec, req)
		if rec.Code != 200 {
			t.Fatalf("status %s: %d", want, rec.Code)
		}
	}
	// back to pending rejected
	req := httptest.NewRequest(http.MethodPost, "/v1/orders/status", bytes.NewBufferString(`{"id":"`+ord.ID+`","status":"pending"}`))
	req.Header.Set("Authorization", "Bearer "+tok)
	rec := httptest.NewRecorder()
	s.handleOrderStatus(rec, req)
	if rec.Code != 400 {
		t.Fatalf("revert: expected 400, got %d", rec.Code)
	}
	// unknown order
	req2 := httptest.NewRequest(http.MethodPost, "/v1/orders/status", bytes.NewBufferString(`{"id":"nope","status":"cooking"}`))
	req2.Header.Set("Authorization", "Bearer "+tok)
	rec2 := httptest.NewRecorder()
	s.handleOrderStatus(rec2, req2)
	if rec2.Code != 404 {
		t.Fatalf("unknown: expected 404, got %d", rec2.Code)
	}
}

func TestCompletedOrdersOnly24h(t *testing.T) {
	dir := t.TempDir()
	store := newOrderStore(dir)
	oldDone := Order{ID: "old-done", At: time.Now().Add(-25 * time.Hour).UnixMilli(), Status: "completed"}
	recentDone := Order{ID: "recent-done", At: time.Now().Add(-1 * time.Hour).UnixMilli(), Status: "completed"}
	stale := Order{ID: "stale", At: time.Now().Add(-7 * time.Hour).UnixMilli(), Status: "pending"}
	fresh := Order{ID: "fresh", At: time.Now().UnixMilli(), Status: "pending"}
	if err := store.doc.write([]Order{oldDone, recentDone, stale, fresh}); err != nil {
		t.Fatal(err)
	}
	got, err := store.list()
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0].ID != "recent-done" || got[1].ID != "fresh" {
		t.Fatalf("expiry wrong: %+v", got)
	}
}
