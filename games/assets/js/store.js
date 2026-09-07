const key = (profile, quizId) => `games.${profile}.${quizId}`;

const emptyState = () => ({
  totals: { plays: 0, correct: 0, seen: 0, timeMs: 0, score: 0, best: 0 },
  sessions: [],
});

export const Store = {
  profile() {
    return localStorage.getItem('games.profile') || 'Arjun';
  },
  setProfile(p) {
    localStorage.setItem('games.profile', p);
  },
  profiles: ['Arjun', 'Guest'],

  load(quizId) {
    try {
      return JSON.parse(localStorage.getItem(key(this.profile(), quizId))) || emptyState();
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
    if (s.sessions.length > 50) s.sessions = s.sessions.slice(-50);
    this.save(quizId, s);
    return s;
  },
};
