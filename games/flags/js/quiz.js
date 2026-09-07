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

const pickDistractors = (pool, q, n) => {
  const sameRegion = shuffle(pool.filter((c) => c.c !== q.c && c.r === q.r));
  const rest = shuffle(pool.filter((c) => c.c !== q.c && c.r !== q.r));
  return [...sameRegion, ...rest].slice(0, n);
};

QuizEngine.register({
  id: 'flags',
  title: 'Flags of the World',
  emoji: '🚩',
  tagline: 'Guess the flag — win dollarbucks!',
  config: [
    { key: 'region', type: 'select', label: 'Where in the world?', def: 'World',
      options: [{ value: 'World', label: '🌍 Whole World' }, ...REGIONS.map((r) => ({ value: r, label: `${GLOBE[r] || '🌍'} ${r}` }))] },
    { key: 'count', type: 'select', label: 'How many flags?', def: 10,
      options: [5, 10, 15, 25, 40].map((n) => ({ value: n, label: `${n} flags` })) },
  ],

  buildQuestions(cfg) {
    const pool = cfg.region === 'World' ? COUNTRIES : COUNTRIES.filter((c) => c.r === cfg.region);
    const picked = shuffle(pool).slice(0, cfg.count);
    return picked.map((c) => {
      const distract = pickDistractors(pool, c, 3);
      const choices = shuffle([c, ...distract]);
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

QuizEngine.run(document.getElementById('app'), 'flags');
