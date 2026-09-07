import { QuizEngine } from '../../assets/js/engine.js?v=09070529';
import { buildQuestions, describe, byRegion, WORLD_COUNT, GLOBE, applyResult, weakness, explainPair } from './build.js?v=09070529';
import { REGIONS } from './data.js?v=09070529';

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
    { key: 'focus', type: 'select', label: 'Practice what?', def: 'All',
      options: [{ value: 'All', label: '🎲 Mixed' }, { value: 'Weak', label: '🔁 My weak flags' }, { value: 'New', label: '✨ New flags' }] },
  ],

  describe,

  buildQuestions,

  render(stage, q) {
    stage.innerHTML = `
      <div class="flagcard"><img src="img/${q.c}.svg" alt="Mystery flag" draggable="false"/></div>
      <span class="hint">${GLOBE[q.region] || '🌍'} ${q.region === 'World' ? 'Somewhere in the world' : 'Somewhere in ' + q.region}</span>`;
  },

  preload(q) {
    new Image().src = `img/${q.c}.svg`;
  },

  flagSrc: (code) => `img/${code}.svg`,

  updateSrs: (entry, ok, ms, now) => applyResult(entry, ok, ms, now),

  explain: (q, pickedName) => explainPair(q, pickedName),

  weakCount: (srs) => Object.values(srs || {}).filter((e) => e && e.attempts && weakness(e) > 0).length,

  srsKey: (q) => `flag:${q.c}`,
});

if (typeof document !== 'undefined' && document.getElementById('app')) {
  const focus = new URLSearchParams(location.search).get('focus');
  const cfg = focus === 'Weak' || focus === 'New' ? { focus } : undefined;
  QuizEngine.run(document.getElementById('app'), 'flags', { cfg });
}
