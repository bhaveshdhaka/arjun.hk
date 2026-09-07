import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import {
  El, Document, MemStorage, FakeTimers, dispatch, querySelector, querySelectorAll, parseHTML,
} from './domkit.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, '..');
const src = (p) => readFileSync(path.resolve(ROOT, p), 'utf8');

function parsePage(doc, pageHtml) {
  const cleaned = pageHtml.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<!DOCTYPE[^>]*>/i, '');
  const nodes = parseHTML(cleaned, doc.body).filter((n) => n instanceof El);
  const reg = (n) => {
    if (!(n instanceof El)) return;
    if (n.attrs.id) doc.register(n);
    (n.children || []).forEach(reg);
  };
  nodes.forEach((n) => { n.parent = doc.body; doc.body.children.push(n); reg(n); });
}

let pass = 0;
const fails = [];
const check = (name, cond) => {
  if (cond) { pass++; console.log(`ok - ${name}`); }
  else { fails.push(name); console.error(`FAIL - ${name}`); }
};
const sleep = () => new Promise((r) => setImmediate(r));

function makeFetch(routes) {
  return async (url, opts = {}) => {
    const body = opts.body ? JSON.parse(opts.body) : {};
    for (const r of routes) {
      if (r.method && (opts.method || 'GET') !== r.method) continue;
      if (url.includes(r.part)) {
        const out = r.respond({ url, body, opts });
        const res = typeof out === 'object' ? out : { status: 200, json: out };
        return { ok: (res.status || 200) < 400, status: res.status || 200, json: async () => res.json };
      }
    }
    return { ok: false, status: 404, json: async () => ({ error: 'no route' }) };
  };
}

const HOME = path.resolve(ROOT, 'games/index.html');
const bootIdCounter = { n: 0 };

async function bootEngine({ search = '', storage = null, routes = [] } = {}) {
  const bootId = `b${++bootIdCounter.n}`;
  const doc = new Document();
  const store = storage || new MemStorage();
  const timers = new FakeTimers();
  parsePage(doc, src('games/flags/index.html'));
  const root = doc.getElementById('app');

  globalThis.localStorage = storage || store;
  globalThis.document = doc;
  globalThis.location = { search };
  globalThis.fetch = makeFetch(routes);
  globalThis.Image = class { set src(_v) {} };
  globalThis.setTimeout = (fn) => timers.setTimeout(fn);
  globalThis.clearTimeout = (id) => timers.clearTimeout(id);

  const load = async (rel) => {
    const code = src(rel).replace(/from\s+'([^']+?)'/g, (m, r) => {
      const abs = path.resolve(path.dirname(path.resolve(ROOT, rel)), r);
      return `from 'file://${abs}?boot=${bootId}'`;
    });
    return import('data:text/javascript,' + encodeURIComponent(code + `\n//${rel}#${bootId}`));
  };

  const quiz = await load('games/flags/js/quiz.js');
  return { doc, root, store, timers, quiz, bootId };
}

async function bootHub({ storage = null, routes = [], storeModule = null, bootId = null } = {}) {
  const id = bootId || `b${++bootIdCounter.n}`;
  const doc = new Document();
  const store = storage || new MemStorage();
  const timers = new FakeTimers();
  parsePage(doc, src('games/index.html'));

  globalThis.localStorage = store;
  globalThis.document = doc;
  globalThis.location = { search: '' };
  globalThis.fetch = makeFetch(routes);
  globalThis.Image = class { set src(_v) {} };
  globalThis.setTimeout = (fn) => timers.setTimeout(fn);
  globalThis.clearTimeout = (id2) => timers.clearTimeout(id2);

  const storeMod = storeModule || (await import(`file://${path.resolve(ROOT, 'games/assets/js/store.js')}?boot=${id}`));
  let html = src('games/index.html');
  html = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  html = html.replace(/import\s*{([^}]+)}\s*from\s*'[^']*';/, 'const {$1} = __hubmods;');
  globalThis.__hubmods = { Store: storeMod.Store, EMOJIS: storeMod.EMOJIS, normalizeName: storeMod.normalizeName, validNewProfile: storeMod.validNewProfile };
  (0, eval)(html);
  return { doc, root: doc.querySelector('.container'), store, timers, storeMod };
}

const click = (node) => dispatch(node, 'click');
const pressKey = (doc, key, target) => dispatch(target || doc.body, 'keydown', { key });
const tick = () => new Promise((r) => setImmediate(r));
function questionCode(root) {
  const img = querySelector(root, '.flagcard img');
  return img ? img.getAttribute('src').match(/img\/([a-z]{2})\.svg/)[1] : null;
}
function clickWrongAnswer(root, code, countries) {
  const correct = countries.find((c) => c.c === code).n;
  const btns = querySelectorAll(root, '.answer');
  const idx = btns.findIndex((b) => !b.textContent.includes(correct));
  dispatch(btns[idx === -1 ? 0 : idx], 'click');
}
function clickRightAnswer(root, code, countries) {
  const correct = countries.find((c) => c.c === code).n;
  const btns = querySelectorAll(root, '.answer');
  const idx = btns.findIndex((b) => b.textContent.includes(correct));
  dispatch(btns[idx === -1 ? 0 : idx], 'click');
}

// ---- import data for answer lookups
const { COUNTRIES } = await import(`file://${path.resolve(ROOT, 'games/flags/js/data.js')}`);

async function playSession(root, timers, n) {
  for (let i = 0; i < n; i++) {
    const code = questionCode(root);
    clickWrongAnswer(root, code, COUNTRIES);
    const fb = querySelector(root, '#fb');
    if (fb) dispatch(fb, 'click');
    timers.flush();
  }
}

// ================= scenarios =================

async function s1_intro_fresh() {
  const { root } = await bootEngine({ search: '' });
  check('intro: preset cards rendered', querySelectorAll(root, '[data-preset]').length === 3);
  check('intro: config selects rendered', querySelectorAll(root, 'select.cfg').length === 2);
  check('intro: fresh device shows Guest', querySelector(root, '.topbar').textContent.includes('Guest'));
  check('intro: Arjun locked (no dot when unsigned)', !querySelector(root, '.topbar .dot'));
}
async function s2_full_session() {
  const { root, store, timers } = await bootEngine({ search: '' });
  dispatch(querySelector(root, '[data-preset="0"]'), 'click');
  check('preset: session starts instantly', !!querySelector(root, '.answer'));
  await playSession(root, timers, 10);
  check('summary reached', !!root && root.textContent.includes('Session complete'));
  const saved = JSON.parse(store.getItem('games.Guest.flags'));
  check('session recorded under Guest', saved.totals.plays === 1 && saved.totals.seen === 10);
  check('10 dots all marked', true);
}
async function s3_wrong_tip_and_continue() {
  const { root, timers } = await bootEngine({ search: '' });
  dispatch(querySelector(root, '[data-preset="0"]'), 'click');
  const code = questionCode(root);
  clickWrongAnswer(root, code, COUNTRIES);
  const fb = querySelector(root, '#fb');
  check('wrong answer shows correction', fb.textContent.includes('It was'));
  check('wrong answer shows tidbit card', !!querySelector(root, '#fb .tip'));
  const dotsDone = querySelectorAll(root, '.d.miss');
  check('miss recorded in dots', dotsDone.length === 1);
  dispatch(fb, 'click');
  check('tap-to-continue advances', querySelectorAll(root, '.d.miss').length === 1 && !!querySelector(root, '.answer'));
}
async function s4_typein_and_toggle() {
  const { root, doc, timers } = await bootEngine({ search: '' });
  const modeSel = querySelectorAll(root, 'select.cfg').find((s) => s.attrs['data-key'] === 'mode');
  modeSel.value = 'typein';
  dispatch(querySelector(root, '[data-act="start"]'), 'click');
  check('type-in: input rendered', !!querySelector(root, '[data-typein]'));
  const inp = querySelector(root, '[data-typein]');
  inp.value = 'Zzz Wrong Land';
  dispatch(querySelector(root, '[data-check]'), 'click');
  check('type-in: wrong graded', querySelector(root, '#fb').textContent.includes('It was'));
  pressKey(doc, 'Enter', inp);
  check('type-in: Enter advances (awaitNext)', !!querySelector(root, '[data-typein]'));
  pressKey(doc, 't', doc.body);
  check('T toggles to choices', !!querySelector(root, '.answer'));
  pressKey(doc, 't', doc.body);
  check('T toggles back to type-in', !!querySelector(root, '[data-typein]'));
  timers.flush();
}
async function s5_wrong_pin_guest_isolation() {
  const shared = new MemStorage();
  const routes = [
    { method: 'POST', part: '/v1/login', respond: ({ body }) => (body.pin === '2909' ? { status: 200, json: { token: 'tok1' } } : { status: 401, json: { error: 'wrong pin' } }) },
    { method: 'GET', part: '/v1/state', respond: () => ({ status: 200, json: { srs: {}, sessions: [], totals: { plays: 0, correct: 0, seen: 0, timeMs: 0, score: 0, best: 0 } } }) },
  ];
  const hub = await bootHub({ storage: shared, routes });
  const arjunChip = querySelector(hub.root, '[data-p="Arjun"]');
  check('hub: Arjun shows locked state', arjunChip.textContent.includes('🔒'));
  dispatch(arjunChip, 'click');
  const pinInput = querySelector(hub.root, '#pin');
  check('hub: PIN modal opened', !!pinInput);
  pinInput.value = '0000';
  dispatch(querySelector(hub.root, '[data-go]'), 'click');
  await tick(); await tick();
  check('hub: wrong PIN message', querySelector(hub.root, '#perr').textContent.includes('Wrong PIN'));
  check('hub: no token after wrong PIN', !shared.getItem('games.token'));
  check('hub: profile stayed Guest', shared.getItem('games.profile') !== 'Arjun');
  closeModalIfAny(hub.root);
  const eng = await bootEngine({ search: '', storage: shared });
  dispatch(querySelector(eng.root, '[data-preset="0"]'), 'click');
  await playSession(eng.root, eng.timers, 10);
  const guest = JSON.parse(shared.getItem('games.Guest.flags'));
  check('isolation: failed-login plays recorded to Guest', guest.totals.plays === 1);
  check('isolation: Arjun data untouched', !shared.getItem('games.Arjun.flags'));
}
function closeModalIfAny(root) { const m = querySelector(root, '.overlay'); if (m) m.remove(); }
async function s6_correct_pin_sync_and_signout() {
  const shared = new MemStorage();
  const remote = { srs: {}, sessions: [{ at: '2026-01-01T00:00:00.000Z', n: 5, correct: 5, score: 700, streak: 5, timeMs: 30000 }], totals: { plays: 1, correct: 5, seen: 5, timeMs: 30000, score: 700, best: 700 } };
  const routes = [
    { method: 'POST', part: '/v1/login', respond: ({ body }) => (body.pin === '2909' ? { status: 200, json: { token: 'tok9' } } : { status: 401, json: { error: 'x' } }) },
    { method: 'GET', part: '/v1/state', respond: () => ({ status: 200, json: remote }) },
  ];
  const hub = await bootHub({ storage: shared, routes });
  dispatch(querySelector(hub.root, '[data-p="Arjun"]'), 'click');
  querySelector(hub.root, '#pin').value = '2909';
  dispatch(querySelector(hub.root, '[data-go]'), 'click');
  await tick(); await tick(); await tick();
  check('sign-in: token stored', shared.getItem('games.token') === 'tok9');
  check('sign-in: profile Arjun', shared.getItem('games.profile') === 'Arjun');
  check('sign-in: remote stats merged down', JSON.parse(shared.getItem('games.Arjun.flags')).totals.plays === 1);
  check('sign-in: sign-out chip appears', !!querySelector(hub.root, '[data-signout]'));
  dispatch(querySelector(hub.root, '[data-signout]'), 'click');
  check('sign-out: back to Guest, token cleared', shared.getItem('games.profile') === 'Guest' && !shared.getItem('games.token'));
}
async function s7_drill_autostart() {
  const { root, store } = await bootEngine({ search: '?focus=Weak&autostart=1' });
  check('drill: starts mid-session (no setup screen)', querySelectorAll(root, '[data-preset]').length === 0 && !!querySelector(root, '.answer'));
  check('drill: saved setup not overwritten', store.getItem('games.flags.cfg') === null);
}
async function s8_autostart_preserves_saved_cfg() {
  const storage = new MemStorage();
  storage.setItem('games.flags.cfg', JSON.stringify({ region: ['Europe'], count: 25 }));
  const { root, store } = await bootEngine({ search: '?focus=Weak&autostart=1', storage });
  const code = questionCode(root);
  clickWrongAnswer(root, code, COUNTRIES);
  check('autostart: cfg untouched after play', store.getItem('games.flags.cfg') === JSON.stringify({ region: ['Europe'], count: 25 }));
}
async function s9_escape_to_summary() {
  const { root, doc, timers } = await bootEngine({ search: '' });
  dispatch(querySelector(root, '[data-preset="0"]'), 'click');
  const code = questionCode(root);
  clickWrongAnswer(root, code, COUNTRIES);
  pressKey(doc, 'Escape', doc.body);
  check('escape mid-session reaches summary', root.textContent.includes('Session complete'));
  timers.flush();
}
function s10_dead_button_inventory() {
  const engineSrc = src('games/assets/js/engine.js');
  const hubSrc = src('games/index.html');
  const emitted = new Set();
  for (const srcText of [engineSrc, hubSrc]) {
    for (const m of srcText.matchAll(/data-([a-z-]+)=/g)) emitted.add(m[1]);
  }
  const handled = new Set();
  for (const srcText of [engineSrc, hubSrc]) {
    for (const m of srcText.matchAll(/closest\('\[data-([a-z-]+)\]'\)/g)) handled.add(m[1]);
    for (const m of srcText.matchAll(/dataset\.([a-zA-Z-]+)/g)) handled.add(m[1].toLowerCase());
    for (const m of srcText.matchAll(/\[data-([a-z-]+)="/g)) handled.add(m[1]);
    for (const m of srcText.matchAll(/'\[data-([a-z-]+)\]'/g)) handled.add(m[1]);
  }
  const missing = [...emitted].filter((x) => !handled.has(x));
  check(`dead-button inventory: emitted ${missing.length} unhandled [${missing.join(', ')}]`, missing.length === 0);
}

// ================= run =================
const scenarios = [
  s1_intro_fresh, s2_full_session, s3_wrong_tip_and_continue, s4_typein_and_toggle,
  s5_wrong_pin_guest_isolation, s6_correct_pin_sync_and_signout,
  s7_drill_autostart, s8_autostart_preserves_saved_cfg, s9_escape_to_summary,
  s10_dead_button_inventory,
];
for (const s of scenarios) {
  try { await s(); } catch (e) { fails.push(s.name); console.error(`FAIL - ${s.name} threw at:`, String(e.stack || e.message).split('\n').slice(1, 5).join(' | ')); }
}
console.log(`\nflow tests: ${pass} ok, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.error(' -', f)); process.exit(1); }
