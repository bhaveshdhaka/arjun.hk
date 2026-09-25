import { QuizEngine } from '../../assets/js/engine.js?v=09250901';
import { makeSpeaker } from '../../assets/js/pronunciation.js?v=09250901';
import { buildQuestions, describe, byRegion, WORLD_COUNT, GLOBE, applyResult, weakness, explainPair, checkTypein, tidbitFor } from './build.js?v=09250901';
import { REGIONS } from './data.js?v=09250901';

const speak = makeSpeaker(
  typeof speechSynthesis !== 'undefined' ? speechSynthesis : null,
  typeof SpeechSynthesisUtterance !== 'undefined' ? SpeechSynthesisUtterance : null,
);

QuizEngine.register({
  id: 'flags',
  title: 'Flags of the World',
  emoji: '🚩',
  tagline: 'Guess the flag — win dollarbucks!',
  presets: [
    { label: '⚡ Quick', sub: '10 · World', cfg: { region: ['World'], count: 10, mode: 'smart' } },
    { label: '🎯 Regular', sub: '25 · World', cfg: { region: ['World'], count: 25, mode: 'smart' } },
    { label: '🏔️ Marathon', sub: '50 · World', cfg: { region: ['World'], count: 50, mode: 'smart' } },
  ],
  config: [
    { key: 'region', type: 'chips', label: 'Regions — pick any mix', all: 'World', def: ['World'],
      options: [{ value: 'World', label: `🌍 Whole World · ${WORLD_COUNT}` },
        ...REGIONS.map((r) => ({ value: r, label: `${GLOBE[r] || '🌍'} ${r} · ${byRegion(r).length}` }))] },
    { key: 'count', type: 'number', label: 'How many flags?', def: 10, min: 1, max: WORLD_COUNT },
    { key: 'mode', type: 'select', label: 'Answer how?', def: 'smart',
      options: [{ value: 'smart', label: '🧠 Smart mix (recommended)' }, { value: 'choices', label: '🔢 Multiple choice' }, { value: 'typein', label: '⌨️ Type-in' }] },
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

  checkTypein,

  explain: (q, pickedName) => explainPair(q, pickedName),

  tidbit: (q) => tidbitFor(q.c),

  pronounce: (text) => speak(text, 'en-US'),

  weakCount: (srs) => Object.values(srs || {}).filter((e) => e && e.attempts && weakness(e) > 0).length,

  srsKey: (q) => `flag:${q.c}`,
});

if (typeof document !== 'undefined' && document.getElementById('app')) {
  const params = new URLSearchParams(location.search);
  const focus = params.get('focus');
  const cfg = focus === 'Weak' || focus === 'New' ? { focus } : undefined;
  QuizEngine.run(document.getElementById('app'), 'flags', { cfg, autostart: params.get('autostart') === '1' });
}
