package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
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
		orderIP: &loginLimiter{fails: map[string][]time.Time{}, maxFail: 12, window: 5 * time.Minute},
		pin:     pin, menu: menu, orders: newOrderStore(dir),
	}
}

func do(t *testing.T, s *apiServer, method, path string, token string, body any) *httptest.ResponseRecorder {
	return doMatch(t, s, method, path, token, body, "")
}

func doMatch(t *testing.T, s *apiServer, method, path string, token string, body any, ifMatch string) *httptest.ResponseRecorder {
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
	if ifMatch != "" {
		req.Header.Set("If-Match", ifMatch)
	}
	rr := httptest.NewRecorder()
	s.handleMenu(rr, req)
	return rr
}

// menuRev fetches the current menu revision via the public GET.
func menuRev(t *testing.T, s *apiServer) int {
	t.Helper()
	rr := do(t, s, http.MethodGet, "/v1/menu", "", nil)
	if rr.Code != 200 {
		t.Fatalf("menuRev: %d", rr.Code)
	}
	var m Menu
	if err := json.Unmarshal(rr.Body.Bytes(), &m); err != nil {
		t.Fatal(err)
	}
	return m.Rev
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
	rr := doMatch(t, s, http.MethodPut, "/v1/menu", tok, m, strconv.Itoa(menuRev(t, s)))
	if code(t, rr) != 200 {
		t.Fatalf("put: %d %s", rr.Code, rr.Body.String())
	}
	rr = do(t, s, http.MethodGet, "/v1/menu", "", nil)
	var got Menu
	_ = json.Unmarshal(rr.Body.Bytes(), &got)
	if got.Tables != 8 || len(got.Items) != 2 || got.Items[0].ID != "cheese" {
		t.Fatalf("round trip wrong: %+v", got)
	}
	if got.Rev != 1 {
		t.Fatalf("expected rev to bump to 1, got %d", got.Rev)
	}
}

func TestMenuConflictRejected(t *testing.T) {
	s := newTestServer(t, "x")
	tok := tokenFor(t, s)
	m := Menu{Tables: 4, Items: []MenuItem{{ID: "a", Name: "A", Price: 5, Menu: "allday"}}}
	// stale If-Match (rev 5, current 0) → conflict
	rr := doMatch(t, s, http.MethodPut, "/v1/menu", tok, m, "5")
	if code(t, rr) != 409 {
		t.Fatalf("expected 409 conflict, got %d", rr.Code)
	}
	// missing If-Match → 428
	rr = do(t, s, http.MethodPut, "/v1/menu", tok, m)
	if code(t, rr) != http.StatusPreconditionRequired {
		t.Fatalf("expected 428 missing If-Match, got %d", rr.Code)
	}
	// correct rev → ok, then the SAME rev again → conflict (someone else saved)
	rr = doMatch(t, s, http.MethodPut, "/v1/menu", tok, m, strconv.Itoa(menuRev(t, s)))
	if code(t, rr) != 200 {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	rr = doMatch(t, s, http.MethodPut, "/v1/menu", tok, m, "0")
	if code(t, rr) != 409 {
		t.Fatalf("expected 409 on stale second save, got %d", rr.Code)
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
		{"bad img ref", Menu{Tables: 2, Items: []MenuItem{{ID: "a", Name: "A", Menu: "allday", Img: "https://evil.example/x.png"}}}},
		{"img traversal", Menu{Tables: 2, Items: []MenuItem{{ID: "a", Name: "A", Menu: "allday", Img: "images/../../etc/passwd"}}}},
	}
	s := newTestServer(t, "x")
	tok := tokenFor(t, s)
	rev := menuRev(t, s)
	for i, tc := range cases {
		_ = i
		if rr := doMatch(t, s, http.MethodPut, "/v1/menu", tok, tc.menu, strconv.Itoa(rev)); code(t, rr) != 400 {
			t.Fatalf("%s: expected 400, got %d", tc.name, rr.Code)
		}
	}
	// valid refs accepted: stock + uploaded forms
	ok := Menu{Tables: 2, Items: []MenuItem{
		{ID: "a", Name: "A", Menu: "allday", Img: "images/cream.png"},
		{ID: "b", Name: "B", Menu: "allday", Img: "/v1/img/8c01c2eb16c4dedb.jpg"},
	}}
	if rr := doMatch(t, s, http.MethodPut, "/v1/menu", tok, ok, strconv.Itoa(menuRev(t, s))); code(t, rr) != 200 {
		t.Fatalf("valid refs rejected: %d %s", rr.Code, rr.Body.String())
	}
}

func TestMenuSurvivesCorruptFile(t *testing.T) {
	s := newTestServer(t, "x")
	tok := tokenFor(t, s)
	m := Menu{Tables: 3, Items: []MenuItem{{ID: "a", Name: "A", Price: 2, Menu: "allday"}}}
	if rr := doMatch(t, s, http.MethodPut, "/v1/menu", tok, m, strconv.Itoa(menuRev(t, s))); code(t, rr) != 200 {
		t.Fatalf("seed save failed: %d", rr.Code)
	}
	// second save rotates the first into .bak
	m.Tables = 5
	if rr := doMatch(t, s, http.MethodPut, "/v1/menu", tok, m, strconv.Itoa(menuRev(t, s))); code(t, rr) != 200 {
		t.Fatalf("second save failed: %d", rr.Code)
	}
	// corrupt the live file; the rotated .bak must rescue it (one save back)
	if err := os.WriteFile(s.menu.doc.path, []byte("{corrupt"), 0o600); err != nil {
		t.Fatal(err)
	}
	got, err := s.menu.get()
	if err != nil {
		t.Fatalf("get after corruption: %v", err)
	}
	if got.Tables != 3 || len(got.Items) != 1 {
		t.Fatalf("expected .bak rescue, got %+v", got)
	}
	// corrupt with NO backup: get() must error, never return empty-and-wipe
	dir := t.TempDir()
	m2, err := newMenuStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "menu.json"), []byte("{corrupt"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := m2.get(); err == nil {
		t.Fatal("expected error for corrupt file with no backup, got nil")
	}
	if b, rerr := os.ReadFile(filepath.Join(dir, "menu.json")); rerr != nil || string(b) != "{corrupt" {
		t.Fatal("get() must never overwrite a corrupt file it cannot read")
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
	}}, 0)
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
	for i := 0; i < 12; i++ {
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

func TestOrderDefaultTablesWhenUnconfigured(t *testing.T) {
	s := newTestServer(t, "x")
	_, _ = s.menu.update(Menu{Tables: 0, Items: []MenuItem{{ID: "a", Name: "A", Price: 5, Menu: "allday"}}}, 0)
	rr := postOrder(t, s, map[string]any{"table": 10, "items": []map[string]any{{"id": "a", "qty": 1}}, "pay": "cash"})
	if code(t, rr) != 200 {
		t.Fatalf("unconfigured tables should still accept table 10 (default), got %d", rr.Code)
	}
	rr = postOrder(t, s, map[string]any{"table": 11, "items": []map[string]any{{"id": "a", "qty": 1}}, "pay": "cash"})
	if code(t, rr) != 400 {
		t.Fatalf("table 11 should exceed default 10, got %d", rr.Code)
	}
}

func TestOrderStatusTransition(t *testing.T) {
	s := newTestServer(t, "x")
	tok := tokenFor(t, s)
	_, _ = s.menu.update(Menu{Tables: 4, Items: []MenuItem{{ID: "a", Name: "A", Price: 5, Menu: "allday"}}}, 0)
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
	// advance twice; each response must be the UPDATED order itself
	for _, want := range []string{"cooking", "completed"} {
		req := httptest.NewRequest(http.MethodPost, "/v1/orders/status", bytes.NewBufferString(`{"id":"`+ord.ID+`","status":"`+want+`"}`))
		req.Header.Set("Authorization", "Bearer "+tok)
		rec := httptest.NewRecorder()
		s.handleOrderStatus(rec, req)
		if rec.Code != 200 {
			t.Fatalf("status %s: %d", want, rec.Code)
		}
		var updated Order
		if err := json.Unmarshal(rec.Body.Bytes(), &updated); err != nil {
			t.Fatal(err)
		}
		if updated.ID != ord.ID || updated.Status != want {
			t.Fatalf("status response wrong: want %s/%s got %s/%s", ord.ID, want, updated.ID, updated.Status)
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

func TestTokenExpiryAndRevocation(t *testing.T) {
	dir := t.TempDir()
	ts, err := newTokenStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	tok, _ := newToken()
	if err := ts.add(tok); err != nil {
		t.Fatal(err)
	}
	if !ts.valid(tok) {
		t.Fatal("fresh token must be valid")
	}
	// expire it manually
	ts.mu.Lock()
	ts.cache[hashToken(tok)] = time.Now().Add(-time.Minute).Unix()
	ts.mu.Unlock()
	if ts.valid(tok) {
		t.Fatal("expired token must not validate")
	}
	// revocation
	tok2, _ := newToken()
	_ = ts.add(tok2)
	ts.revoke(tok2)
	if ts.valid(tok2) {
		t.Fatal("revoked token must not validate")
	}
}

func TestLogoutRevokesServerSide(t *testing.T) {
	s := newTestServer(t, "x")
	tok := tokenFor(t, s)
	if !s.tokens.valid(tok) {
		t.Fatal("precondition: token valid after login")
	}
	req := httptest.NewRequest(http.MethodPost, "/v1/logout", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	rec := httptest.NewRecorder()
	s.handleLogout(rec, req)
	if rec.Code != 200 {
		t.Fatalf("logout: %d", rec.Code)
	}
	if s.tokens.valid(tok) {
		t.Fatal("token must be revoked server-side after logout")
	}
	// admin write with revoked token now fails
	rr := doMatch(t, s, http.MethodPut, "/v1/menu", tok, Menu{Tables: 1}, "0")
	if code(t, rr) != 401 {
		t.Fatalf("revoked token write: expected 401, got %d", rr.Code)
	}
}

func TestLegacyTokenFormatDropped(t *testing.T) {
	dir := t.TempDir()
	legacy := []string{"deadbeef"}
	b, _ := json.Marshal(legacy)
	if err := os.WriteFile(filepath.Join(dir, "tokens.json"), b, 0o600); err != nil {
		t.Fatal(err)
	}
	ts, err := newTokenStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	if ts.valid("deadbeef") {
		t.Fatal("legacy (no-expiry) tokens must be dropped, not honored")
	}
}

func TestLoginBodyLimit(t *testing.T) {
	s := newTestServer(t, "x")
	big := bytes.Repeat([]byte("a"), 64<<10)
	req := httptest.NewRequest(http.MethodPost, "/v1/login", bytes.NewReader(big))
	rec := httptest.NewRecorder()
	s.handleLogin(rec, req)
	if rec.Code != 400 {
		t.Fatalf("oversized login body: expected 400, got %d", rec.Code)
	}
}

func TestOrderClearServed(t *testing.T) {
	s := newTestServer(t, "x")
	tok := tokenFor(t, s)
	_, _ = s.menu.update(Menu{Tables: 4, Items: []MenuItem{{ID: "a", Name: "A", Price: 5, Menu: "allday"}}}, 0)
	// two live + one served (create three; complete the last)
	for i := 0; i < 3; i++ {
		rr := postOrder(t, s, map[string]any{"table": i + 1, "items": []map[string]any{{"id": "a", "qty": 1}}, "pay": "cash"})
		if code(t, rr) != 200 {
			t.Fatalf("order %d create: %d", i, rr.Code)
		}
	}
	live, _ := s.orders.list()
	last := live[len(live)-1].ID
	_, _ = s.orders.setStatus(last, "completed")

	// unauthenticated clear rejected
	req0 := httptest.NewRequest(http.MethodPost, "/v1/orders/clear", nil)
	rec0 := httptest.NewRecorder()
	s.handleOrderClear(rec0, req0)
	if rec0.Code != 401 {
		t.Fatalf("clear unauth: expected 401, got %d", rec0.Code)
	}

	// authenticated clear removes only served
	req := httptest.NewRequest(http.MethodPost, "/v1/orders/clear", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	rec := httptest.NewRecorder()
	s.handleOrderClear(rec, req)
	if rec.Code != 200 {
		t.Fatalf("clear: %d", rec.Code)
	}
	var out map[string]int
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if out["cleared"] != 1 {
		t.Fatalf("expected 1 cleared, got %+v", out)
	}
	got, _ := s.orders.list()
	if len(got) != 2 {
		t.Fatalf("live orders should remain 2, got %d", len(got))
	}
}

func TestClientIPPrefersCFHeader(t *testing.T) {
	s := newTestServer(t, "x")
	// 5 wrong PINs from CF-Connecting-IP 9.9.9.9 must lock that IP out...
	for i := 0; i < 5; i++ {
		req := httptest.NewRequest(http.MethodPost, "/v1/login", bytes.NewBufferString(`{"pin":"wrong"}`))
		req.Header.Set("CF-Connecting-IP", "9.9.9.9")
		rec := httptest.NewRecorder()
		s.handleLogin(rec, req)
	}
	req := httptest.NewRequest(http.MethodPost, "/v1/login", bytes.NewBufferString(`{"pin":"wrong"}`))
	req.Header.Set("CF-Connecting-IP", "9.9.9.9")
	rec := httptest.NewRecorder()
	s.handleLogin(rec, req)
	if rec.Code != 429 {
		t.Fatalf("expected 429 for locked-out CF IP, got %d", rec.Code)
	}
	// ...while a different real IP is NOT locked out by the shared tunnel addr
	req2 := httptest.NewRequest(http.MethodPost, "/v1/login", bytes.NewBufferString(`{"pin":"wrong"}`))
	req2.Header.Set("CF-Connecting-IP", "8.8.8.8")
	rec2 := httptest.NewRecorder()
	s.handleLogin(rec2, req2)
	if rec2.Code != 401 {
		t.Fatalf("other IP must be independent, got %d", rec2.Code)
	}
}
