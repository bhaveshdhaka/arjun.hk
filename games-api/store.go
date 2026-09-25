package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

type SrsEntry struct {
	Box      int   `json:"box"`
	Attempts int   `json:"attempts"`
	Correct  int   `json:"correct"`
	Streak   int   `json:"streak"`
	AvgMs    int   `json:"avgMs"`
	Due      int64 `json:"due"`
	LastAt   int64 `json:"lastAt"`
}

type Session struct {
	At      string         `json:"at"`
	N       int            `json:"n"`
	Correct int            `json:"correct"`
	Score   int            `json:"score"`
	Streak  int            `json:"streak"`
	TimeMs  int            `json:"timeMs"`
	Cfg     map[string]any `json:"cfg,omitempty"`
}

type Totals struct {
	Plays   int `json:"plays"`
	Correct int `json:"correct"`
	Seen    int `json:"seen"`
	TimeMs  int `json:"timeMs"`
	Score   int `json:"score"`
	Best    int `json:"best"`
}

type State struct {
	Srs      map[string]SrsEntry `json:"srs"`
	Sessions []Session           `json:"sessions"`
	Totals   Totals              `json:"totals"`
}

func newState() State {
	return State{Srs: map[string]SrsEntry{}}
}

func (s *State) recomputeTotals() {
	t := Totals{}
	for _, ses := range s.Sessions {
		t.Plays++
		t.Correct += ses.Correct
		t.Seen += ses.N
		t.TimeMs += ses.TimeMs
		t.Score += ses.Score
		if ses.Score > t.Best {
			t.Best = ses.Score
		}
	}
	s.Totals = t
}

func (s *State) merge(other State) {
	for k, e := range other.Srs {
		cur, ok := s.Srs[k]
		if !ok || e.LastAt > cur.LastAt {
			s.Srs[k] = e
		}
	}
	seen := map[string]bool{}
	for _, ses := range s.Sessions {
		seen[ses.At+"|"+fmt.Sprint(ses.N)+"|"+fmt.Sprint(ses.Score)] = true
	}
	for _, ses := range other.Sessions {
		key := ses.At + "|" + fmt.Sprint(ses.N) + "|" + fmt.Sprint(ses.Score)
		if !seen[key] {
			s.Sessions = append(s.Sessions, ses)
			seen[key] = true
		}
	}
	sort.Slice(s.Sessions, func(i, j int) bool { return s.Sessions[i].At < s.Sessions[j].At })
	if len(s.Sessions) > 500 {
		s.Sessions = s.Sessions[len(s.Sessions)-500:]
	}
	s.recomputeTotals()
}

type fileStore struct {
	mu   sync.Mutex
	path string
}

func newFileStore(dataDir string) (*fileStore, error) {
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return nil, err
	}
	return &fileStore{path: filepath.Join(dataDir, "state.json")}, nil
}

func (f *fileStore) load() (State, error) {
	st := newState()
	b, err := os.ReadFile(f.path)
	if err != nil {
		if os.IsNotExist(err) {
			return st, nil
		}
		return st, err
	}
	if err := json.Unmarshal(b, &st); err != nil {
		return newState(), nil
	}
	if st.Srs == nil {
		st.Srs = map[string]SrsEntry{}
	}
	return st, nil
}

func (f *fileStore) save(st State) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	b, err := json.MarshalIndent(st, "", " ")
	if err != nil {
		return err
	}
	tmp := f.path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, f.path)
}

func (f *fileStore) mergeIn(other State) (State, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	cur, err := f.load()
	if err != nil {
		return cur, err
	}
	cur.merge(other)
	if err := f.saveLocked(cur); err != nil {
		return cur, err
	}
	return cur, nil
}

func (f *fileStore) saveLocked(st State) error {
	b, err := json.MarshalIndent(st, "", " ")
	if err != nil {
		return err
	}
	tmp := f.path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, f.path)
}

type tokenStore struct {
	mu    sync.Mutex
	path  string
	cache map[string]bool
}

func newTokenStore(dataDir string) (*tokenStore, error) {
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return nil, err
	}
	ts := &tokenStore{path: filepath.Join(dataDir, "tokens.json"), cache: map[string]bool{}}
	b, err := os.ReadFile(ts.path)
	if err == nil {
		var toks []string
		if json.Unmarshal(b, &toks) == nil {
			for _, t := range toks {
				ts.cache[t] = true
			}
		}
	}
	return ts, nil
}

func hashToken(tok string) string {
	h := sha256.Sum256([]byte(tok))
	return hex.EncodeToString(h[:])
}

func (ts *tokenStore) add(tok string) error {
	ts.mu.Lock()
	defer ts.mu.Unlock()
	ts.cache[hashToken(tok)] = true
	toks := make([]string, 0, len(ts.cache))
	for t := range ts.cache {
		toks = append(toks, t)
	}
	b, err := json.Marshal(toks)
	if err != nil {
		return err
	}
	tmp := ts.path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, ts.path)
}

func (ts *tokenStore) valid(tok string) bool {
	ts.mu.Lock()
	defer ts.mu.Unlock()
	return ts.cache[hashToken(tok)]
}

func newToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func nowMillis() int64 { return time.Now().UnixMilli() }
