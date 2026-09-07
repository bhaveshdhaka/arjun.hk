import { QuizEngine } from '../../assets/js/engine.js';
import { COUNTRIES, REGIONS } from './data.js';

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const GLOBE = { Asia: '🌏', Europe: '🌍', Africa: '🌍', Oceania: '🌏', Americas: '🌎', Antarctica: '🐧' };
const byRegion = (r) => COUNTRIES.filter((c) => c.r === r);
const WORLD_COUNT = COUNTRIES.length;
const sizeLabel = (n) => (n <= 10 ? 'a Quick one ⚡' : n <= 25 ? 'Regular 🎯' : n <= 50 ? 'a Long one 🔥' : 'a MARATHON 🏔️');

const pickDistractors = (pool, q, n) => {
  const sameRegion = shuffle(pool.filter((c) => c.c !== q.c && c.r === q.r));
  const rest = shuffle(pool.filter((c) => c.c !== q.c && c.r !== q.r));
  return [...sameRegion, ...rest].slice(0, n);
};

const quotas = (n, pool) => {
  const groups = new Map();
  for (const c of pool) groups.set(c.r, (groups.get(c.r) || 0) + 1);
  const entries = [...groups.entries()]
    .map(([r, size]) => ({ r, size, base: Math.floor((n * size) / pool.length) }))
    .sort((a, b) => ((n * b.size) % pool.length) - ((n * a.size) % pool.length) || b.size - a.size);
  let left = n - entries.reduce((a, e) => a + e.base, 0);
  for (const e of entries) {
    if (left <= 0) break;
    e.base += 1;
    left -= 1;
  }
  return entries;
};

const dealSmart = (items) => {
  const rest = [...items];
  const out = [];
  while (rest.length) {
    const prev = out[out.length - 1];
    let i = prev ? rest.findIndex((x) => x.r !== prev.r) : 0;
    if (i === -1) i = 0;
    out.push(rest.splice(i, 1)[0]);
  }
  return out;
};

const poolSize = (cfg) => {
  if (!cfg.region || cfg.region.includes('World')) return WORLD_COUNT;
  return COUNTRIES.filter((c) => cfg.region.includes(c.r)).length;
};

QuizEngine.register({
  id: 'flags',
  title: 'Flags of the World',
  emoji: '🚩',
  tagline: 'Guess the flag — win dollarbucks!',
  presets: [
    { label: '⚡ Quick', sub: '10 · World', cfg: { region: ['World'], count: 10 } },
    { label: '🎯 Regular', sub: '25 · World', cfg: { region: ['World'], count: 25 } },
    { label: '🏔️ Marathon', sub: '50 · World', cfg: { region: ['World'], count: 50 } },
  ],
  config: [
    { key: 'region', type: 'chips', label: 'Regions — pick any mix', all: 'World', def: ['World'],
      options: [{ value: 'World', label: `🌍 Whole World · ${WORLD_COUNT}` },
        ...REGIONS.map((r) => ({ value: r, label: `${GLOBE[r] || '🌍'} ${r} · ${byRegion(r).length}` }))] },
    { key: 'count', type: 'number', label: 'How many flags?', def: 10, min: 1, max: WORLD_COUNT },
  ],

  describe(cfg) {
    const pool = poolSize(cfg);
    const want = Math.floor(Number(cfg.count)) || 0;
    if (want > pool) return { text: `Only ${pool} flags here → playing all ${pool}`, warn: true };
    return { text: `${pool} flags available → ${want} is ${sizeLabel(want)}`, warn: false };
  },

  buildQuestions(cfg) {
    const world = !cfg.region || cfg.region.includes('World');
    const pool = world ? COUNTRIES : COUNTRIES.filter((c) => cfg.region.includes(c.r));
    const n = Math.max(1, Math.min(Math.floor(Number(cfg.count)) || 10, pool.length));
    let picks;
    if (world) {
      picks = shuffle(COUNTRIES).slice(0, n);
    } else {
      picks = [];
      for (const e of quotas(n, pool)) picks.push(...shuffle(byRegion(e.r)).slice(0, e.base));
    }
    const deck = world ? dealSmart(picks) : dealSmart(shuffle(picks));
    return deck.map((c) => {
      const choices = shuffle([c, ...pickDistractors(pool, c, 3)]);
      return {
        c: c.c,
        country: c.n,
        region: c.r,
        choices: choices.map((x) => x.n),
        answer: choices.findIndex((x) => x.c === c.c),
      };
    });
  },

  render(stage, q) {
    stage.innerHTML = `
      <div class="flagcard"><img src="img/${q.c}.svg" alt="Mystery flag" draggable="false"/></div>
      <span class="hint">${GLOBE[q.region] || '🌍'} ${q.region === 'World' ? 'Somewhere in the world' : 'Somewhere in ' + q.region}</span>`;
  },

  srsKey: (q) => `flag:${q.c}`,
});

if (typeof document !== 'undefined' && document.getElementById('app')) {
  QuizEngine.run(document.getElementById('app'), 'flags');
}
