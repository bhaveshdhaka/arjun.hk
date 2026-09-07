const key = (profile, quizId) => `games.${profile}.${quizId}`;
const API = 'https://api.arjun.hk';

const emptyState = () => ({
  totals: { plays: 0, correct: 0, seen: 0, timeMs: 0, score: 0, best: 0 },
  sessions: [],
  srs: {},
});

const sig = (ses) => `${ses.at}|${ses.n}|${ses.score}`;

const recompute = (s) => {
  const t = { plays: 0, correct: 0, seen: 0, timeMs: 0, score: 0, best: 0 };
  for (const ses of s.sessions) {
    t.plays += 1;
    t.correct += ses.correct;
    t.seen += ses.n;
    t.timeMs += ses.timeMs;
    t.score += ses.score;
    if (ses.score > t.best) t.best = ses.score;
  }
  s.totals = t;
  return s;
};

const mergeStates = (local, remote) => {
  const out = emptyState();
  const srsKeys = new Set([...Object.keys(local.srs || {}), ...Object.keys(remote.srs || {})]);
  for (const k of srsKeys) {
    const a = local.srs[k];
    const b = remote.srs[k];
    if (a && (!b || (a.lastAt || 0) >= (b.lastAt || 0))) out.srs[k] = a;
    else if (b) out.srs[k] = b;
  }
  const seen = new Set();
  out.sessions = [...(local.sessions || []), ...(remote.sessions || [])]
    .filter((ses) => (seen.has(sig(ses)) ? false : (seen.add(sig(ses)), true)))
    .sort((a, b) => a.at < b.at ? -1 : 1);
  out.sessions = out.sessions.slice(-500);
  return recompute(out);
}

const emptyState = () => ({
  totals: { plays: 0, correct: 0, seen: 0, timeMs: 0, score: 0, best: 0 },
  sessions: [],
  srs: {},
});

const sig = (ses) => `${ses.at}|${ses.n}|${ses.score}`;

const hasStorage = () => {
  try {
    const test = '__storage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
};

const hasStorage = hasStorage();

const safeGet = (key) => {
  try { return localStorage.getItem(key); } catch { return null; }
};

const safeSet = (key, value) => { try { localStorage.setItem(key, value); } catch {} };

const safeRemove = (key) => { try { localStorage.removeItem(key); } catch {} };

const safeParse = (key) => { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; } };

const safeParseArray = (key) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : []; } catch { return []; } };

export const RESERVED = new Set(['arjun', 'guest']);
export const EMOJIS = ['🦊', '🐼', '🦁', '🐸', '🐵', '🦄', '🐯', '🐨', '🐙', '🦖', '🐳', '⭐'];

const normalizeName = (s) => String(s || '').trim().replace(/\s+/g, ' ').slice(0, 12);

export const validNewProfile = (name, existingNames = []) => {
  const n = normalizeName(name);
  if (!n) return 'Type a name first';
  if (['arjun', 'guest'].includes(n.toLowerCase())) return 'That name is reserved';
  if (existingNames.some((e) => String(e).toLowerCase() === n.toLowerCase())) return 'That profile already exists';
  return null;
};

export const Store = {
  profile() {
    const p = safeGet('games.profile');
    if (!p) return 'Guest';
    if (p === 'Arjun' && !this.token()) return 'Guest';
    return p;
  },
  setProfile(p) {
    if (p === 'Arjun' && !this.token()) return;
    try { localStorage.setItem('games.profile', p); } catch {}
  },

  profiles() {
    try { return JSON.parse(localStorage.getItem('games.profiles') || '[]'); } catch { return []; }
  },

  profileEmoji(name) {
    if (name === 'Arjun') return '👑';
    if (name === 'Guest') return '👤';
    const p = this.profiles().find((x) => x.name === name);
    return (p && p.emoji) || '🎮';
  },

  addProfile(name, emoji) {
    const err = validNewProfile(name, this.profiles().map((p) => p.name));
    if (err) return err;
    const list = this.profiles();
    list.push({ name: normalizeName(name), emoji: emoji || '🎮' });
    try { localStorage.setItem('games.profiles', JSON.stringify(list)); } catch {}
    return null;
  },

  removeProfile(name) {
    try { localStorage.removeItem('games.profiles'); } catch {}
    const list = this.profiles().filter((p) => p.name !== name);
    try { localStorage.setItem('games.profiles', JSON.stringify(list)); } catch {}
    safeRemove(`games.${name}.flags`);
    if (this.profile() === name) this.setProfile('Guest');
  },

  token() { return safeGet('games.token'); },
  setToken(t) { if (t) safeSet('games.token', t); else safeRemove('games.token'); },

  syncEnabled() {
    try {
      return this.profile() === 'Arjun' && !!this.token();
    } catch { return false; }
  },

  load(quizId) {
    try {
      const s = JSON.parse(localStorage.getItem(key(this.profile(), quizId))) || emptyState();
      if (!s.srs) s.srs = {};
      if (!Array.isArray(s.sessions)) s.sessions = [];
      return s;
    } catch { return emptyState(); }
  },

  save(quizId, state) {
    try { localStorage.setItem(key(this.profile(), quizId), JSON.stringify(state)); } catch {}
  },

  recordSession(quizId, session) {
    const s = this.load(quizId);
    const t = s.totals;
    t.plays += 1;
    t.correct += session.correct;
    t.seen += session.n;
    t.timeMs += session.timeMs;
    t.score += session.score;
    t.best = Math.max(t.best, session.score);
    s.sessions.push(session);
    if (s.sessions.length > 500) s.sessions = s.sessions.slice(-500);
    this.save(quizId, s);
    if (this.syncEnabled()) this.push(quizId).catch(() => {});
    return s;
  },

  updateSrs(quizId, srsKey, entry) {
    const s = this.load(quizId);
    s.srs[srsKey] = entry;
    this.save(quizId, s);
    return s;
  },

  async push(quizId) {
    try {
      const res = await fetch(`${API}/v1/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token()}` },
        body: JSON.stringify(this.load('flags')),
      });
      if (!res.ok) throw new Error(`sync ${res.status}`);
      const canonical = await res.json();
      if (canonical.srs) this.save('flags', canonical);
      return canonical;
    } catch { return null; }
  },
};

function safeGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function safeSet(key, value) { try { localStorage.setItem(key, value); } catch {} }
function safeRemove(key) { try { localStorage.removeItem(key); } catch {} }
function safeParse(key) { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; }
function safeParseArray(key) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : []; } catch { return []; } }

export const RESERVED = new Set(['arjun', 'guest']);
export const EMOJIS = ['🦊', '🐼', '🦁', '🐸', '🐵', '🦄', '🐯', '🐨', '🐙', '🦖', '🐳', '⭐'];

const normalizeName = (s) => String(s || '').trim().replace(/\s+/g, ' ').slice(0, 12);

export const validNewProfile = (name, existingNames = []) => {
  const n = normalizeName(name);
  if (!n) return 'Type a name first';
  if (['arjun', 'guest'].includes(n.toLowerCase())) return 'That name is reserved';
  if (existingNames.some((e) => String(e).toLowerCase() === n.toLowerCase())) return 'That profile already exists';
  return null;
}

export const Store = {
  profile() {
    try {
      const p = localStorage.getItem('games.profile');
      if (!p) return 'Guest';
      if (p === 'Arjun' && !this.token()) return 'Guest';
      return p;
    } catch { return 'Guest'; }
  },
  setProfile(p) {
    if (p === 'Arjun' && !this.token()) return;
    try { localStorage.setItem('games.profile', p); } catch {}
  },
  profiles() {
    try { return JSON.parse(localStorage.getItem('games.profiles') || '[]'); } catch { return []; }
  },
  profileEmoji(name) {
    if (name === 'Arjun') return '👑';
    if (name === 'Guest') return '👤';
    const p = this.profiles().find((x) => x.name === name);
    return (p && p.emoji) || '🎮';
  },
  addProfile(name, emoji) {
    const err = validNewProfile(name, this.profiles().map((p) => p.name));
    if (err) return err;
    const list = this.profiles();
    list.push({ name: normalizeName(name), emoji: emoji || '🎮' });
    try { localStorage.setItem('games.profiles', JSON.stringify(list)); } catch {}
    return null;
  },
  removeProfile(name) {
    try { localStorage.removeItem('games.profiles'); } catch {}
    const list = this.profiles().filter((p) => p.name !== name);
    try { localStorage.setItem('games.profiles', JSON.stringify(list)); } catch {}
    try { localStorage.removeItem(`games.${name}.flags`); } catch {}
    if (this.profile() === name) this.setProfile('Guest');
  },

  token() { try { return localStorage.getItem('games.token'); } catch { return ''; } },
  setToken(t) { if (t) { try { localStorage.setItem('games.token', t); } catch {} } else { try { localStorage.removeItem('games.token'); } catch {} } },
  syncEnabled() {
    try { return this.profile() === 'Arjun' && !!this.token(); } catch { return false; }
  },

  load(quizId) {
    try {
      const s = JSON.parse(localStorage.getItem(key(this.profile(), quizId))) || emptyState();
      if (!s.srs) s.srs = {};
      if (!Array.isArray(s.sessions)) s.sessions = [];
      return s;
    } catch { return emptyState(); }
  },

  save(quizId, state) {
    try { localStorage.setItem(key(this.profile(), quizId), JSON.stringify(state)); } catch {}
  },

  recordSession(quizId, session) {
    const s = this.load(quizId);
    const t = s.totals;
    t.plays += 1;
    t.correct += session.correct;
    t.seen += session.n;
    t.timeMs += session.timeMs;
    t.score += session.score;
    t.best = Math.max(t.best, session.score);
    s.sessions.push(session);
    if (s.sessions.length > 500) s.sessions = s.sessions.slice(-500);
    this.save(quizId, s);
    if (this.syncEnabled()) this.push(quizId).catch(() => {});
    return s;
  },

  updateSrs(quizId, srsKey, entry) {
    const s = this.load(quizId);
    s.srs[srsKey] = entry;
    this.save(quizId, s);
    return s;
  },

  async push(quizId) {
    try {
      const res = await fetch(`${API}/v1/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token()}` },
        body: JSON.stringify(this.load('flags')),
      });
      if (!res.ok) throw new Error(`sync ${res.status}`);
      const canonical = await res.json();
      if (canonical.srs) this.save('flags', canonical);
      return canonical;
    } catch { return null; }
  },
};

function safeGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function safeSet(key, value) { try { localStorage.setItem(key, value); } catch {} }
function safeRemove(key) { try { localStorage.removeItem(key); } catch {} }
function safeParse(key) { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; }
function safeParseArray(key) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : []; } catch { return []; }
function safeRemove(key) { try { localStorage.removeItem(key); } catch {} }

export const RESERVED = new Set(['arjun', 'guest']);
export const EMOJIS = ['🦊', '🐼', '🦁', '🐸', '🐵', '🦄', '🐯', '🐨', '🐙', '🦖', '🐳', '⭐'];

const normalizeName = (s) => String(s || '').trim().replace(/\s+/g, ' ').slice(0, 12);

export const validNewProfile = (name, existingNames = []) => {
  const n = normalizeName(name);
  if (!n) return 'Type a name first';
  if (['arjun', 'guest'].includes(n.toLowerCase())) return 'That name is reserved';
  if (existingNames.some((e) => String(e).toLowerCase() === n.toLowerCase())) return 'That profile already exists';
  return null;
}

export const Store = {
  profile() { try { const p = localStorage.getItem('games.profile'); if (!p) return 'Guest'; if (p === 'Arjun' && !this.token()) return 'Guest'; return p; } catch { return 'Guest'; } },
  setProfile(p) { if (p === 'Arjun' && !this.token()) return; try { localStorage.setItem('games.profile', p); } catch {} },
  profiles() { try { return JSON.parse(localStorage.getItem('games.profiles') || '[]'); } catch { return []; } },
  profileEmoji(name) { if (name === 'Arjun') return '👑'; if (name === 'Guest') return '👤'; const p = this.profiles().find((x) => x.name === name); return (p && p.emoji) || '🎮'; },
  addProfile(name, emoji) { const err = validNewProfile(name, this.profiles().map((p) => p.name)); if (err) return err; const list = this.profiles(); list.push({ name: normalizeName(name), emoji: emoji || '🎮' }); try { localStorage.setItem('games.profiles', JSON.stringify(list)); } catch {} return null; },
  removeProfile(name) { try { localStorage.removeItem('games.profiles'); } catch {} const list = this.profiles().filter((p) => p.name !== name); try { localStorage.setItem('games.profiles', JSON.stringify(list)); } catch {} try { localStorage.removeItem(`games.${name}.flags`); } catch {} if (this.profile() === name) this.setProfile('Guest'); },
  token() { try { return localStorage.getItem('games.token'); } catch { return ''; } },
  setToken(t) { if (t) { try { localStorage.setItem('games.token', t); } catch {} } else { try { localStorage.removeItem('games.token'); } catch {} } },
  syncEnabled() { try { return this.profile() === 'Arjun' && !!this.token(); } catch { return false; } },
  load(quizId) { try { const s = JSON.parse(localStorage.getItem(key(this.profile(), quizId))) || emptyState(); if (!s.srs) s.srs = {}; if (!Array.isArray(s.sessions)) s.sessions = []; return s; } catch { return emptyState(); } },
  save(quizId, state) { try { localStorage.setItem(key(this.profile(), quizId), JSON.stringify(state)); } catch {} },
  recordSession(quizId, session) { const s = this.load(quizId); const t = s.totals; t.plays += 1; t.correct += session.correct; t.seen += session.n; t.timeMs += session.timeMs; t.score += session.score; t.best = Math.max(t.best, session.score); s.sessions.push(session); if (s.sessions.length > 500) s.sessions = s.sessions.slice(-500); this.save(quizId, s); if (this.syncEnabled()) this.push(quizId).catch(() => {}); return s; },
  updateSrs(quizId, srsKey, entry) { const s = this.load(quizId); s.srs[srsKey] = entry; this.save(quizId, s); return s; },
  async push(quizId) { try { const res = await fetch(`${API}/v1/sync`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token()}` }, body: JSON.stringify(this.load('flags'))); if (!res.ok) throw new Error(`sync ${res.status}`); const canonical = await res.json(); if (canonical.srs) this.save('flags', canonical); return canonical; } catch { return null; } },
};

function safeGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function safeSet(key, value) { try { localStorage.setItem(key, value); } catch {} }
function safeRemove(key) { try { localStorage.removeItem(key); } catch {} }
function safeParse(key) { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; }
function safeParseArray(key) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : []; } catch { return []; }
function safeRemove(key) { try { localStorage.removeItem(key); } catch {} }

export const RESERVED = new Set(['arjun', 'guest']);
export const EMOJIS = ['🦊', '🐼', '🦁', '🐸', '🐵', '🦄', '🐯', '🐨', '🐙', '🦖', '🐳', '⭐'];
const normalizeName = (s) => String(s || '').trim().replace(/\s+/g, ' ').slice(0, 12);
export const validNewProfile = (name, existingNames = []) => {
  const n = normalizeName(name);
  if (!n) return 'Type a name first';
  if (['arjun', 'guest'].includes(n.toLowerCase())) return 'That name is reserved';
  if (existingNames.some((e) => String(e).toLowerCase() === n.toLowerCase())) return 'That profile already exists';
  return null;
}

export const Store = { ... };
