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
    .sort((a, b) => (a.at < b.at ? -1 : 1));
  out.sessions = out.sessions.slice(-500);
  return recompute(out);
};

export const RESERVED = new Set(['arjun', 'guest']);
export const EMOJIS = ['🦊', '🐼', '🦁', '🐸', '🐵', '🦄', '🐯', '🐨', '🐙', '🦖', '🐳', '⭐'];
export const normalizeName = (s) => String(s || '').trim().replace(/\s+/g, ' ').slice(0, 12);
export const validNewProfile = (name, existingNames = []) => {
  const n = normalizeName(name);
  if (!n) return 'Type a name first';
  if (RESERVED.has(n.toLowerCase())) return 'That name is reserved';
  if (existingNames.some((e) => String(e).toLowerCase() === n.toLowerCase())) return 'That profile already exists';
  return null;
};

export const Store = {
  profile() {
    const p = localStorage.getItem('games.profile');
    if (!p) return 'Guest';
    if (p === 'Arjun' && !this.token()) return 'Guest';
    return p;
  },
  setProfile(p) {
    if (p === 'Arjun' && !this.token()) return;
    localStorage.setItem('games.profile', p);
  },

  profiles() {
    try {
      const l = JSON.parse(localStorage.getItem('games.profiles'));
      if (Array.isArray(l)) return l;
    } catch {}
    return [];
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
    localStorage.setItem('games.profiles', JSON.stringify(list));
    return null;
  },
  removeProfile(name) {
    localStorage.setItem('games.profiles', JSON.stringify(this.profiles().filter((p) => p.name !== name)));
    const kill = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(`games.${name}.`)) kill.push(k);
    }
    kill.forEach((k) => localStorage.removeItem(k));
    if (this.profile() === name) this.setProfile('Guest');
  },

  token() {
    return localStorage.getItem('games.token') || '';
  },
  setToken(t) {
    if (t) localStorage.setItem('games.token', t);
    else localStorage.removeItem('games.token');
  },
  syncEnabled() {
    return this.profile() === 'Arjun' && !!this.token();
  },

  load(quizId) {
    try {
      const s = JSON.parse(localStorage.getItem(key(this.profile(), quizId))) || emptyState();
      if (!s.srs) s.srs = {};
      if (!Array.isArray(s.sessions)) s.sessions = [];
      return s;
    } catch {
      return emptyState();
    }
  },

  save(quizId, state) {
    localStorage.setItem(key(this.profile(), quizId), JSON.stringify(state));
  },

  recordSession(quizId, session) {
    const s = this.load(quizId);
    const t = s.totals;
    t.plays += 1;
    t.correct += session.correct;
    t.seen += session.total;
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

  async login(pin) {
    const res = await fetch(`${API}/v1/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    this.setToken(data.token);
    return true;
  },

  async push(quizId) {
    const res = await fetch(`${API}/v1/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token()}` },
      body: JSON.stringify(this.load(quizId)),
    });
    if (!res.ok) throw new Error(`sync ${res.status}`);
    const canonical = await res.json();
    if (canonical.srs) this.save(quizId, canonical);
    return canonical;
  },

  async pull(quizId) {
    const res = await fetch(`${API}/v1/state`, {
      headers: { Authorization: `Bearer ${this.token()}` },
    });
    if (!res.ok) throw new Error(`pull ${res.status}`);
    const remote = await res.json();
    const merged = mergeStates(this.load(quizId), remote);
    this.save(quizId, merged);
    return merged;
  },
};
