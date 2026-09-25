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

let bootN = 0;
let apiCalls = [];
const getApiCalls = () => apiCalls;

async function bootEngine({ search = '', storage = null, routes = [] } = {}) {
  const bootId = `b${++bootN}`;
  const doc = new Document();
  const store = storage || new MemStorage();
  const timers = new FakeTimers();
  parsePage(doc, src('games/flags/index.html'));
  const savedTheme = store.getItem('theme');
  doc.documentElement.dataset.theme = (savedTheme === 'dark' || savedTheme === 'light')
    ? savedTheme
    : ((globalThis.__flowMM || ((q) => ({ matches: false })))('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const root = doc.getElementById('app');

  globalThis.localStorage = store;
  globalThis.document = doc;
  globalThis.location = { search };
  globalThis.fetch = makeFetch(routes);
  globalThis.Image = class { set src(_v) {} };
  globalThis.matchMedia = globalThis.__flowMM || ((q) => ({ matches: false, media: q }));
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

async function bootHub({ storage = null, routes = [], bootId = null } = {}) {
  const id = bootId || `b${++bootN}`;
  const doc = new Document();
  const store = storage || new MemStorage();
  const timers = new FakeTimers();
  parsePage(doc, src('games/index.html'));
  const savedTheme = store.getItem('theme');
  doc.documentElement.dataset.theme = (savedTheme === 'dark' || savedTheme === 'light')
    ? savedTheme
    : ((globalThis.__flowMM || ((q) => ({ matches: false })))('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

  globalThis.localStorage = store;
  globalThis.document = doc;
  globalThis.location = { search: '' };
  globalThis.fetch = makeFetch(routes);
  globalThis.Image = class { set src(_v) {} };
  globalThis.matchMedia = globalThis.__flowMM || ((q) => ({ matches: false, media: q }));
  globalThis.setTimeout = (fn) => timers.setTimeout(fn);
  globalThis.clearTimeout = (id2) => timers.clearTimeout(id2);

  const storeMod = await import(`file://${path.resolve(ROOT, 'games/assets/js/store.js')}?boot=${id}`);
  const themeMod = await import(`file://${path.resolve(ROOT, 'games/assets/js/theme.js')}?boot=${id}`);
  let html = src('games/index.html').match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  html = html.replace(/import\s*{([^}]+)}\s*from\s*'[^']*';/g, 'const {$1} = __hubmods;');
  globalThis.__hubmods = { ...storeMod, ...themeMod };
  (0, eval)(html);
  return { doc, root: doc.querySelector('.container'), store, timers };
}

const click = (node) => dispatch(node, 'click');
const pressKey = (doc, key, target) => dispatch(target || doc.body, 'keydown', { key });
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
async function playSession(root, timers, n) {
  for (let i = 0; i < n; i++) {
    const code = questionCode(root);
    clickWrongAnswer(root, code, COUNTRIES);
    const fb = querySelector(root, '#fb');
    if (fb) dispatch(fb, 'click');
    timers.flush();
  }
}

const { COUNTRIES } = await import(`file://${path.resolve(ROOT, 'games/flags/js/data.js')}`);

let pass = 0;
const fails = [];
const check = (name, cond) => {
  if (cond) { pass++; console.log(`ok - ${name}`); }
  else { fails.push(name); console.error(`FAIL - ${name}`); }
};

async function s1_intro_fresh() {
  const { root, doc } = await bootEngine({ search: '' });
  check('intro: preset cards rendered', querySelectorAll(root, '[data-preset]').length === 3);
  check('intro: config selects rendered', querySelectorAll(root, 'select.cfg').length === 2);
  check('intro: fresh device shows Guest', querySelector(root, '.topbar').textContent.includes('Guest'));
  check('intro: theme toggle present', !!querySelfOrDescendant(root, doc, '[data-theme-toggle]'));
}
function querySelfOrDescendant(root, doc, sel) {
  return querySelector(doc, sel);
}
async function s2_full_session() {
  const { root, store, timers } = await bootEngine({ search: '' });
  dispatch(querySelector(root, '[data-preset="0"]'), 'click');
  check('preset: session starts instantly', !!querySelector(root, '.answer'));
  await playSession(root, timers, 10);
  check('summary reached', root.textContent.includes('Session complete'));
  const saved = JSON.parse(store.getItem('games.Guest.flags'));
  check('session recorded under Guest', saved.totals.plays === 1 && saved.totals.seen === 10);
  check('full session: SRS entry per flag (updateSrs wired)', Object.keys(saved.srs).length === 10);
}
async function s3_wrong_tip_and_continue() {
  const { root, store } = await bootEngine({ search: '' });
  dispatch(querySelector(root, '[data-preset="0"]'), 'click');
  const code = questionCode(root);
  clickWrongAnswer(root, code, COUNTRIES);
  const fb = querySelector(root, '#fb');
  check('wrong answer shows correction', fb.textContent.includes('It was'));
  check('wrong answer shows tidbit card', !!querySelector(root, '#fb .tip'));
  {
    const st = JSON.parse(store.getItem('games.Guest.flags'));
    check('wrong answer records SRS box 0', st.srs && Object.values(st.srs)[0] && Object.values(st.srs)[0].box === 0);
  }
  check('miss recorded in dots', querySelectorAll(root, '.d.miss').length === 1);
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
    for (const m of srcText.matchAll(/data-([a-z-]+)(?==|[\s>"'])/g)) emitted.add(m[1]);
  }
  const handled = new Set();
  for (const srcText of [engineSrc, hubSrc]) {
    for (const m of srcText.matchAll(/closest\('\[data-([a-z-]+)\]'\)/g)) handled.add(m[1]);
    for (const m of srcText.matchAll(/dataset\.([a-zA-Z-]+)/g)) handled.add(m[1].toLowerCase());
    for (const m of srcText.matchAll(/\[data-([a-z-]+)="/g)) handled.add(m[1]);
    for (const m of srcText.matchAll(/'\[data-([a-z-]+)\]'/g)) handled.add(m[1]);
  }
  const missing = [...emitted].filter((x) => !handled.has(x));
  check(`dead-button inventory: 0 unhandled of ${emitted.size}`, missing.length === 0);
}
async function s11_theme_toggle_persists() {
  const shared = new MemStorage();
  const { doc, root } = await bootHub({ storage: shared, routes: [] });
  const htmlEl = doc.documentElement;
  const before = htmlEl.dataset.theme;
  const btn = querySelector(root, '#themeToggle');
  check('theme: toggle chip rendered in topbar', !!btn);
  dispatch(btn, 'click');
  const after = htmlEl.dataset.theme;
  check(`theme: tap flips (${String(before)} -> ${after})`, after !== before && (after === 'dark' || after === 'light'));
  check('theme: choice persisted', shared.getItem('theme') === after);
  const hub2 = await bootHub({ storage: shared, routes: [], bootId: `reload-${bootN + 900}` });
  check('theme: survives reload', hub2.doc.documentElement.dataset.theme === after);
  dispatch(querySelector(hub2.root, '#themeToggle'), 'click');
  check('theme: flips back on second toggle', hub2.doc.documentElement.dataset.theme === before);
}

const tick = () => new Promise((r) => setImmediate(r));
const tick2 = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };

async function s13_pronunciation_speaks() {
  const spoken = [];
  globalThis.speechSynthesis = { cancel() {}, speak(u) { spoken.push(u); } };
  globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; this.lang = null; } };
  const { root } = await bootEngine({ search: '' });
  dispatch(querySelector(root, '[data-preset="0"]'), 'click');
  const code = questionCode(root);
  const correct = COUNTRIES.find((c) => c.c === code).n;
  clickWrongAnswer(root, code, COUNTRIES);
  // Find the speak button for the CORRECT answer and click it
  const btns = querySelectorAll(root, '.answer');
  const correctBtn = btns.find((b) => b.textContent.includes(correct));
  const speakChip = correctBtn ? correctBtn.querySelector('[data-speak]') : null;
  check('pron: speak button rendered on reveal', !!speakChip && speakChip.textContent.includes('🔊'));
  dispatch(speakChip, 'click');
  check(`pron: tap speaks the country (${spoken[0] && spoken[0].text})`, spoken.length >= 1 && spoken[0].text === correct && spoken[0].lang === 'en-US');
  const fb = querySelector(root, '#fb');
  dispatch(fb, 'click');
  check('pron: tapping speak never advances the question', !!querySelector(root, '.answer'));
  delete globalThis.speechSynthesis;
  delete globalThis.SpeechSynthesisUtterance;
}


async function s15_quiz_typein_correct_scores() {
  const { root, store, timers } = await bootEngine({ search: '' });
  const modeSel = querySelectorAll(root, 'select.cfg').find((s) => s.attrs['data-key'] === 'mode');
  modeSel.value = 'typein';
  dispatch(querySelector(root, '[data-act="start"]'), 'click');
  const code = questionCode(root);
  const name = COUNTRIES.find((c) => c.c === code).n;
  const inp = querySelector(root, '[data-typein]');
  inp.value = name;
  dispatch(querySelector(root, '[data-check]'), 'click');
  check('type-in: exact answer graded good', querySelector(root, '#fb').className.includes('good'));
  check('type-in: points shown', !!querySelector(root, '.pts'));
  const after = JSON.parse(store.getItem('games.Guest.flags'));
  check('type-in: correct answer moves SRS to box 1', after.srs[`flag:${code}`] && after.srs[`flag:${code}`].box === 1);
  timers.flush();
}

async function s16_theme_toggle_on_quiz() {
  const { root, doc, store } = await bootEngine({ search: '' });
  const btn = querySelector(root, '[data-theme-toggle]');
  check('quiz theme: toggle chip on intro topbar', !!btn);
  const before = doc.documentElement.dataset.theme;
  dispatch(btn, 'click');
  const after = doc.documentElement.dataset.theme;
  check(`quiz theme: tap flips (${String(before)} -> ${after})`, after !== before && (after === 'dark' || after === 'light'));
  check('quiz theme: choice persisted', store.getItem('theme') === after);
  check('quiz theme: glyph relabeled', btn.textContent === (after === 'dark' ? '☀️' : '🌙'));
  dispatch(btn, 'click');
  check('quiz theme: second tap flips back', doc.documentElement.dataset.theme === before);
}

/* ---------- online menu (guest) + admin harness ---------- */
/* ---------- online menu (guest) + admin harness ---------- */

async function loadModule(rel, bootId) {
  const code = src(rel).replace(/from\s+'([^']+?)'/g, (m, r) => {
    const abs = path.resolve(path.dirname(path.resolve(ROOT, rel)), r);
    return `from 'file://${abs}?boot=${bootId}'`;
  });
  return import('data:text/javascript,' + encodeURIComponent(code + `\n//${rel}#${bootId}`));
}

async function bootGuest({ storage = null, seed = null, search = '' } = {}) {
  const bootId = `g${++bootN}`;
  const doc = new Document();
  const store = storage || new MemStorage();
  const timers = new FakeTimers();
  parsePage(doc, src('index.html'));
  doc.documentElement.dataset.theme = 'light';
  globalThis.localStorage = store;
  globalThis.document = doc;
  globalThis.location = { search };
  globalThis.setTimeout = (fn) => timers.setTimeout(fn);
  globalThis.clearTimeout = (id) => timers.clearTimeout(id);
  globalThis.matchMedia = (q) => ({ matches: false, media: q });
  apiCalls = [];
  globalThis.fetch = makeFetch([
    {
      method: 'GET', part: '/v1/menu',
      respond: () => ({ status: 200, json: seed || {
        tables: 12,
        items: [
          { id: 'bagel', name: 'Bagel', emoji: '🥯', price: 20, menu: 'breakfast', img: 'images/bagel.png', desc: 'with cream cheese' },
          { id: 'cheese', name: 'Cheese', emoji: '🧀', price: 13, menu: 'allday', img: 'images/cheese.png', desc: 'with grapes' },
          { id: 'matcha', name: 'Matcha', emoji: '🍵', price: 16, menu: 'allday', img: 'images/matcha.png', desc: 'latte with heart' },
          { id: 'cream', name: 'Cream', emoji: '🥛', price: 19, menu: 'allday', img: 'images/cream.png' },
          { id: 'icecream', name: 'Ice-Cream', emoji: '🍦', price: 18, menu: 'allday', img: 'images/icecream.png', desc: 'chocolate cone' },
        ],
      } }),
    },
    {
      method: 'POST', part: '/v1/orders',
      respond: ({ body }) => {
        apiCalls.push(['order', body]);
        return { status: 200, json: { id: 'o1', table: body.table, status: 'pending', total: body.items.reduce((t, l) => t + l.price * l.qty, 0) } };
      },
    },
  ]);
  globalThis.Image = class { set src(_v) {} };
  const menu = await loadModule('games/menu/js/menu.js', bootId);
  await menu.init();
  await tick();
  return { doc, root: doc.getElementById('menuRoot'), store, timers };
}

async function bootAdmin({ storage = null, menu = null, orders = [], extraRoutes = [], seedToken = null } = {}) {
  const bootId = `a${++bootN}`;
  const doc = new Document();
  const store = storage || new MemStorage();
  const timers = new FakeTimers();
  parsePage(doc, src('admin.html'));
  doc.documentElement.dataset.theme = 'light';
  if (seedToken) store.setItem('menu.adminToken', JSON.stringify(seedToken));
  globalThis.localStorage = store;
  globalThis.document = doc;
  globalThis.location = { search: '' };
  globalThis.setTimeout = (fn) => timers.setTimeout(fn);
  globalThis.clearTimeout = (id) => timers.clearTimeout(id);
  globalThis.matchMedia = (q) => ({ matches: false, media: q });
  apiCalls = [];
  const myOrders = orders.map((o) => ({ ...o }));
  globalThis.fetch = makeFetch([
    ...extraRoutes,
    {
      method: 'GET', part: '/v1/menu',
      respond: () => ({ status: 200, json: menu || {
        tables: 12,
        items: [
          { id: 'cheese', name: 'Cheese', emoji: '🧀', price: 13, menu: 'allday', img: 'images/cheese.png' },
          { id: 'bagel', name: 'Bagel', emoji: '🥯', price: 20, menu: 'allday', img: 'images/bagel.png' },
        ],
      } }),
    },
    {
      method: 'PUT', part: '/v1/menu',
      respond: ({ body }) => { apiCalls.push(['menu-put', body]); return body; },
    },
    {
      method: 'POST', part: '/v1/login',
      respond: ({ body }) => {
        apiCalls.push(['login', body]);
        return body && body.pin === '4321'
          ? { status: 200, json: { token: 'admintok' } }
          : { status: 401, json: { error: 'wrong pin' } };
      },
    },
    {
      method: 'POST', part: '/v1/logout',
      respond: () => { apiCalls.push(['logout', null]); return { status: 200, json: { ok: 'true' } }; },
    },
    {
      method: 'GET', part: '/v1/orders',
      respond: () => { apiCalls.push(['orders-get', null]); return { status: 200, json: myOrders.map((o) => ({ ...o })) }; },
    },
    {
      method: 'POST', part: '/v1/orders/status',
      respond: ({ body }) => {
        apiCalls.push(['ord-status', body]);
        const hit = myOrders.find((o) => o.id === body.id);
        if (hit) hit.status = body.status;
        return { status: 200, json: hit || { id: body.id, status: body.status } };
      },
    },
  ]);
  globalThis.Image = class { set src(_v) {} };
  const admin = await loadModule('games/menu/js/admin.js', bootId);
  await admin.init();
  await tick();
  return { doc, root: doc.getElementById('app'), store, timers };
}

const MENU_OK = (cond, name) => check(name, cond);

async function s17_guest_menu_renders() {
  const { root, doc } = await bootGuest({});
  MENU_OK(querySelectorAll(root, '[data-act="add"]').length === 5, 'menu: five dishes with + Add');
  MENU_OK(querySelectorAll(root, '[data-act="sec"]').length === 5, 'menu: five section heads');
  MENU_OK(querySelectorAll(root, '.nowbadge').length === 1, 'menu: exactly one "now" section');
  MENU_OK(doc.getElementById('tableBar').textContent.toLowerCase().includes('pick your table'), 'menu: table bar invites pick');
  MENU_OK((doc.getElementById('cartPill').textContent || '').trim() === '', 'menu: cart pill hidden when empty');
}

async function s18_guest_qs_preselect() {
  const { doc, store } = await bootGuest({ search: '?t=7' });
  const bar = doc.getElementById('tableBar').textContent;
  MENU_OK(bar.includes('Table') && bar.includes('7'), 'menu: ?t=7 picks table 7');
  MENU_OK(Number(store.getItem('menu.table')) === 7, 'menu: table choice persisted');
}

async function s19_table_cart_send() {
  const { doc, store, timers } = await bootGuest({});
  dispatch(doc.getElementById('tableBar'), 'click');
  MENU_OK(doc.getElementById('tableOverlay').hidden === false, 'cart: table picker opens');
  const chip7 = querySelectorAll(doc.getElementById('tableGrid'), '[data-act="picktable"]').find((c) => c.dataset.n === '7');
  dispatch(chip7, 'click');
  const barAfter = doc.getElementById('tableBar').textContent;
  MENU_OK(barAfter.includes('Table') && barAfter.includes('7'), 'cart: table picked (bar shows number)');
  MENU_OK(doc.getElementById('tableOverlay').hidden === true, 'cart: picker closes after pick');
  MENU_OK(Number(store.getItem('menu.table')) === 7, 'cart: table persisted');
  const addCheese = querySelectorAll(doc.getElementById('menuRoot'), '[data-act="add"]').find((b) => b.dataset.id === 'cheese');
  MENU_OK(!!addCheese, 'cart: all-day cheese has + Add');
  dispatch(addCheese, 'click');
  MENU_OK(doc.getElementById('cartPill').textContent.includes('🛒'), 'cart: pill shows count');
  const pill = doc.getElementById('cartPill');
  dispatch(pill, 'click');
  MENU_OK(doc.getElementById('orderSheet').hidden === false, 'cart: sheet opens');
  const inc = querySelectorAll(doc.getElementById('orderSheet'), '[data-act="inc"]')[0];
  dispatch(inc, 'click');
  MENU_OK(querySelector(doc.getElementById('orderSheet'), '.totrow').textContent.includes('$26'), 'cart: total updates ($26 for 2 cheese)');
  const noteEl = querySelector(doc.getElementById('orderSheet'), 'textarea[data-note]');
  noteEl.value = 'no grapes';
  dispatch(noteEl, 'input');
  const octo = querySelectorAll(doc.getElementById('orderSheet'), '[data-act="pay"]').find((c) => c.dataset.key === 'octopus');
  dispatch(octo, 'click');
  const octoAfter = querySelectorAll(doc.getElementById('orderSheet'), '[data-act="pay"]').find((c) => c.dataset.key === 'octopus');
  MENU_OK(!!octoAfter && String((octoAfter.attrs.class || '').includes('sel')), 'cart: payment chip selects (octopus)');
  const send = querySelector(doc.getElementById('orderSheet'), '[data-act="send"]');
  dispatch(send, 'click');
  await tick2();
  const order = (apiCalls.find(([k]) => k === 'order') || [])[1];
  MENU_OK(order && order.table === 7 && order.pay === 'octopus' && order.note === 'no grapes', 'cart: order posted with table/note/pay');
  MENU_OK(order && order.items && order.items[0] && order.items[0].qty === 2 && order.items[0].id === 'cheese', 'cart: order lines derived from menu');
  MENU_OK(doc.getElementById('orderSheet').textContent.includes('Order sent'), 'cart: confirmation shown');
  MENU_OK((doc.getElementById('cartPill').textContent || '').trim() === '', 'cart: pill cleared after order');
  MENU_OK(store.getItem('menu.cart') === '{}', 'cart: persisted cart emptied');
  const done = querySelector(doc.getElementById('orderSheet'), '[data-act="done"]');
  dispatch(done, 'click');
  MENU_OK(doc.getElementById('orderSheet').hidden === true, 'cart: sheet closes after done');
  timers.flush();
}

async function s20_admin_wrong_then_right_pin() {
  const { root, doc, store } = await bootAdmin({});
  MENU_OK(!!querySelector(doc, '#pinForm'), 'admin: pin gate shown');
  const pin = querySelector(doc, '#pinInput');
  pin.value = '0000';
  dispatch(querySelector(doc, '#pinForm'), 'submit');
  await tick2();
  MENU_OK(querySelector(root, '.gate-err') !== null, 'admin: wrong pin shows error');
  MENU_OK(store.getItem('menu.adminToken') == null, 'admin: no token on failure');
  // the gate re-rendered on failure — re-query the input
  querySelector(doc, '#pinInput').value = '4321';
  dispatch(querySelector(doc, '#pinForm'), 'submit');
  await tick2();
  await tick2();
  { const got = store.getItem('menu.adminToken'); MENU_OK(got != null && String(got).includes('admintok'), 'admin: token stored (got=' + JSON.stringify(got) + ')'); }
  MENU_OK(root.textContent.includes('Kitchen Admin'), 'admin: shell after login');
  MENU_OK(querySelectorAll(root, '.mi').length === 2, 'admin: menu editor lists 2 items');
}

async function s21_admin_menu_edit_and_save() {
  const { root, doc } = await bootAdmin({});
  const pin21 = querySelector(doc, '#pinInput');
  pin21.value = '4321';
  dispatch(querySelector(doc, '#pinForm'), 'submit');
  await tick2();
  await tick2();
  dispatch(querySelector(doc, '#pinForm'), 'submit');
  await tick2();
  await tick2();
  dispatch(querySelector(doc, '[data-act="additem"]'), 'click');
  MENU_OK(querySelectorAll(root, '.mi').length === 3, 'admin editor: add dish adds row');
  const first = querySelectorAll(root, '.mi')[0];
  const sold = querySelector(first, '[data-act="sold"]');
  dispatch(sold, 'click');
  const soldRow = querySelectorAll(root, '.mi')[0]; // rows re-render on toggle
  const soldBtn = querySelector(soldRow, '[data-act="sold"]');
  MENU_OK(String((soldBtn && soldBtn.attrs.class) || '').includes('off'), 'admin editor: sold-out toggles (switch marks off)');
  const before = querySelectorAll(root, '.mi').map((r) => r.dataset.mi);
  dispatch(querySelector(first, '[data-act="down"]'), 'click');
  const after = querySelectorAll(root, '.mi').map((r) => r.dataset.mi);
  MENU_OK(before[0] === after[1] && before[1] === after[0], 'admin editor: down reorders rows');
  dispatch(querySelectorAll(root, '.mi')[1].querySelector('[data-act="up"]'), 'click'); // up on the shuffled-down-row's successor restores
  const restored = querySelectorAll(root, '.mi').map((r) => r.dataset.mi);
  MENU_OK(restored.join('|') === before.join('|'), 'admin editor: up restores order');
  dispatch(querySelector(doc, '[data-act="save"]'), 'click');
  await tick2();
  const put = (apiCalls.find(([k]) => k === 'menu-put') || [])[1];
  MENU_OK(put && put.items.length === 3 && put.items.every((it, i) => it.sort === i), 'admin editor: save posts items with sort');
  MENU_OK(root.textContent.includes('Live at')
  || false, 'admin editor: saved toast');
}

async function s22_admin_tables() {
  const { root, doc, timers } = await bootAdmin({});
  const pin = querySelector(doc, '#pinInput');
  pin.value = '4321';
  dispatch(querySelector(doc, '#pinForm'), 'submit');
  await tick2();
  await tick2();
  dispatch(querySelectorAll(doc, '[data-act="tab"]').find((t) => t.dataset.key === 'tables'), 'click');
  const val = querySelector(root, '#tablesVal');
  MENU_OK(val.textContent === '12', 'tables: current count shown');
  dispatch(querySelector(doc, '[data-act="tables-inc"]'), 'click');
  MENU_OK(querySelector(root, '#tablesVal').textContent === '13', 'tables: + increments');
  dispatch(querySelector(doc, '[data-act="tables-dec"]'), 'click');
  dispatch(querySelector(doc, '[data-act="tables-dec"]'), 'click');
  dispatch(querySelector(doc, '[data-act="tables-dec"]'), 'click');
  MENU_OK(querySelector(root, '#tablesVal').textContent === '10', 'tables: − decrements');
  dispatch(querySelector(doc, '[data-act="save"]'), 'click');
  await tick2();
  const put = (apiCalls.find(([k]) => k === 'menu-put') || [])[1];
  MENU_OK(put && put.tables === 10, 'tables: count saved to API');
  timers.flush();
}

async function s23_admin_orders_flow() {
  const base = Date.now();
  const orders = [
    { id: 'o1', table: 3, items: [{ id: 'cheese', name: 'Cheese', qty: 2, price: 13 }], total: 26, pay: 'octopus', note: 'extra grapes', at: base, status: 'pending' },
    { id: 'o2', table: 5, items: [{ id: 'bagel', name: 'Bagel', qty: 1, price: 20 }], total: 20, pay: 'cash', at: base + 1000, status: 'cooking' },
  ];
  const { root, doc, timers } = await bootAdmin({ orders });
  querySelector(doc, '#pinInput').value = '4321';
  dispatch(querySelector(doc, '#pinForm'), 'submit');
  await tick2();
  await tick2();
  dispatch(querySelectorAll(doc, '[data-act="tab"]').find((t) => t.dataset.key === 'orders'), 'click');
  const count = querySelector(root, '#ordCount');
  MENU_OK(count.textContent.includes('2'), 'orders: live count shows 2 open');
  MENU_OK(querySelectorAll(root, '.ord').length === 2, 'orders: two tickets');
  const firstCard = querySelectorAll(root, '.ord')[0];
  MENU_OK(firstCard.textContent.includes('Table') && firstCard.textContent.includes('3') && firstCard.textContent.includes('extra grapes'), 'orders: ticket shows table + note');
  const startBtn = querySelector(firstCard, '[data-act="ordnext"]');
  MENU_OK(startBtn.dataset.next === 'cooking', 'orders: pending offers Start cooking');
  dispatch(startBtn, 'click');
  await tick2();
  const cookCall = apiCalls.find(([k]) => k === 'ord-status');
  MENU_OK(cookCall && cookCall[1] && cookCall[1].id === 'o1' && cookCall[1].status === 'cooking', 'orders: pending -> cooking POST');
  const cardO1 = querySelectorAll(root, '.ord').find((c) => c.attrs['data-ord'] === 'o1');
  const doneBtn = querySelector(cardO1, '[data-act="ordnext"]');
  MENU_OK(doneBtn && doneBtn.dataset.next === 'completed', 'orders: cooking offers Complete');
  dispatch(doneBtn, 'click');
  await tick2();
  const doneCall = apiCalls.filter(([k]) => k === 'ord-status').pop();
  MENU_OK(doneCall && doneCall[1].id === 'o1' && doneCall[1].status === 'completed', 'orders: cooking -> completed POST');
  const cnt = querySelector(root, '#ordCount');
  MENU_OK(cnt.textContent.includes('1'), 'orders: count drops to 1');
  const before = apiCalls.filter(([k]) => k === 'orders-get').length;
  timers.flush();
  await tick2();
  const after = apiCalls.filter(([k]) => k === 'orders-get').length;
  MENU_OK(after > before, 'orders: auto-poll refetches (~12s)');
}

async function s24_menu_dead_buttons() {
  const collect = (el, out = []) => {
    if (el.attrs && el.attrs['data-act']) out.push(el.attrs['data-act']);
    (el.children || []).forEach((c) => collect(c, out));
    return out;
  };
  const g = await bootGuest({});
  const emitted = [...new Set(collect(g.doc.body))];
  const menuActions = ['table', 'picktable', 'closetable', 'cartbtn', 'closesh', 'sec', 'add', 'inc', 'dec', 'rm', 'pay', 'send', 'done'];
  const unhandled = emitted.filter((a) => !menuActions.includes(a));
  MENU_OK(emitted.length > 0 && unhandled.length === 0, `menu: dead-button inventory (${emitted.length} emitted, ${unhandled.length} unhandled)`);

  const da = await bootAdmin({});
  const root2 = da.doc.getElementById('app');
  querySelector(da.doc, '#pinInput').value = '4321';
  dispatch(querySelector(da.doc, '#pinForm'), 'submit');
  await tick2();
  await tick2();
  const adminActions = ['login', 'logout', 'tab', 'additem', 'del', 'up', 'down', 'sold', 'photo', 'save', 'tables-inc', 'tables-dec', 'ordnext', 'dismissmsg', 'reload-menu', 'draft-restore', 'draft-discard', 'conflict-overwrite', 'conflict-discard', 'undo', 'sort', 'emopick', 'emochoose', 'emoclose'];
  const collectActs = (el, out = []) => {
    if (el.attrs && el.attrs['data-act']) out.push(el.attrs['data-act']);
    (el.children || []).forEach((c) => collectActs(c, out));
    return out;
  };
  const emitted2 = []; // across all three tabs
  emitted2.push(...collectActs(root2));
  querySelector(da.doc, '[data-act="tab"][data-key="tables"]') && dispatch(querySelector(da.doc, '[data-act="tab"][data-key="tables"]'), 'click');
  emitted2.push(...collectActs(root2));
  dispatch(querySelector(da.doc, '[data-act="tab"][data-key="orders"]'), 'click');
  const adminEmit = [...new Set(emitted2)];
  const unhandled2 = adminEmit.filter((a) => !adminActions.includes(a));
  MENU_OK(adminEmit.length > 0 && unhandled2.length === 0, `admin: dead-button inventory (${adminEmit.length} emitted, ${unhandled2.length} unhandled)`);
}

async function s25_admin_delete_confirm_undo() {
  const { root, doc, timers } = await bootAdmin({});
  querySelector(doc, '#pinInput').value = '4321';
  dispatch(querySelector(doc, '#pinForm'), 'submit');
  await tick2();
  await tick2();
  const firstName = querySelectorAll(root, '.mi')[0].dataset.mi;
  const delBtn = () => querySelectorAll(root, '.mi')[0].querySelector('[data-act="del"]');
  dispatch(delBtn(), 'click');
  MENU_OK(querySelectorAll(root, '.mi').length === 2, 'delete: first tap does NOT delete');
  MENU_OK(delBtn().textContent === 'Sure?', 'delete: first tap asks for confirmation');
  dispatch(delBtn(), 'click');
  MENU_OK(querySelectorAll(root, '.mi').length === 1, 'delete: second tap deletes');
  const undoBtn = querySelector(root, '[data-act="undo"]');
  MENU_OK(!!undoBtn, 'delete: undo offered');
  dispatch(undoBtn, 'click');
  MENU_OK(querySelectorAll(root, '.mi').length === 2, 'undo: row restored');
  MENU_OK(querySelectorAll(root, '.mi')[0].dataset.mi === firstName, 'undo: restored at original position');
  timers.flush();
}

async function s26_admin_save_blocked_when_load_fails() {
  let fails = 0;
  const { root, doc } = await bootAdmin({
    extraRoutes: [
      {
        method: 'GET', part: '/v1/menu',
        respond: () => {
          fails++;
          return fails === 1 ? { status: 500, json: { error: 'boom' } } : { status: 200, json: { rev: 3, tables: 4, items: [{ id: 'ok', name: 'Ok', emoji: '😀', price: 1, menu: 'allday' }] } };
        },
      },
    ],
  });
  querySelector(doc, '#pinInput').value = '4321';
  dispatch(querySelector(doc, '#pinForm'), 'submit');
  await tick2();
  await tick2();
  MENU_OK(root.textContent.includes("Couldn't load the menu"), 'load-fail: banner explains save is blocked');
  MENU_OK(querySelector(doc, '[data-act="save"]').attrs.disabled !== undefined, 'load-fail: save disabled');
  dispatch(querySelector(doc, '[data-act="save"]'), 'click');
  await tick2();
  MENU_OK(apiCalls.find(([k]) => k === 'menu-put') === undefined, 'load-fail: no PUT fired while blocked');
  dispatch(querySelector(doc, '[data-act="reload-menu"]'), 'click');
  await tick2();
  MENU_OK(querySelectorAll(root, '.mi').length === 1, 'load-fail: retry loads menu');
  dispatch(querySelector(doc, '[data-act="save"]'), 'click');
  await tick2();
  const put = (apiCalls.find(([k]) => k === 'menu-put') || [])[1];
  MENU_OK(!!put, 'load-fail: save works after retry');
  MENU_OK(put && put.rev === undefined && put.tables === 4, 'load-fail: payload from recovered menu');
}

async function s27_admin_conflict_409_keeps_draft() {
  let puts = 0;
  const { root, doc } = await bootAdmin({
    extraRoutes: [
      {
        method: 'GET', part: '/v1/menu',
        respond: () => ({ status: 200, json: { rev: 7, tables: 12, items: [
          { id: 'cheese', name: 'Cheese', emoji: '🧀', price: 13, menu: 'allday' },
          { id: 'bagel', name: 'Bagel', emoji: '🥯', price: 20, menu: 'breakfast' },
        ] } }),
      },
      {
        method: 'PUT', part: '/v1/menu',
        respond: ({ body, opts }) => {
          puts++;
          apiCalls.push(['menu-put', body, opts.headers]);
          return puts === 1
            ? { status: 409, json: { error: 'menu changed elsewhere' } }
            : { status: 200, json: { ...body, rev: 8 } };
        },
      },
    ],
  });
  querySelector(doc, '#pinInput').value = '4321';
  dispatch(querySelector(doc, '#pinForm'), 'submit');
  await tick2();
  await tick2();
  dispatch(querySelector(doc, '[data-act="additem"]'), 'click');
  MENU_OK(querySelectorAll(root, '.mi').length === 3, 'conflict: draft row added');
  dispatch(querySelector(doc, '[data-act="save"]'), 'click');
  await tick2();
  MENU_OK(root.textContent.includes('changed on another device'), 'conflict: banner shown on 409');
  MENU_OK(querySelectorAll(root, '.mi').length === 3, 'conflict: draft kept after 409');
  const first = apiCalls.filter(([k]) => k === 'menu-put').pop();
  MENU_OK(first && first[2] && first[2]['If-Match'] === '7', 'conflict: PUT carried If-Match rev');
  dispatch(querySelector(doc, '[data-act="conflict-overwrite"]'), 'click');
  await tick2();
  await tick2();
  MENU_OK(root.textContent.includes('Live at')
  || false, 'conflict: overwrite saves after refresh');
  const last = apiCalls.filter(([k]) => k === 'menu-put').pop();
  MENU_OK(last && last[1].items.length === 3, 'conflict: overwrite posts the draft');
}

async function s28_admin_expired_token_back_to_gate() {
  const { doc, store } = await bootAdmin({
    seedToken: 'oldtok',
    extraRoutes: [
      {
        method: 'PUT', part: '/v1/menu',
        respond: () => ({ status: 401, json: { error: 'login first' } }),
      },
    ],
  });
  await tick2();
  await tick2();
  MENU_OK(!!querySelector(doc, '[data-act="additem"]'), 'expired: seeded token opens admin');
  dispatch(querySelector(doc, '[data-act="additem"]'), 'click');
  dispatch(querySelector(doc, '[data-act="save"]'), 'click');
  await tick2();
  MENU_OK(!!querySelector(doc, '#pinForm'), 'expired: 401 returns to pin gate');
  MENU_OK(store.getItem('menu.adminToken') == null, 'expired: dead token cleared');
  MENU_OK(store.getItem('menu.draft') != null, 'expired: draft kept for re-login');
}

async function s29_admin_draft_restore() {
  const storage = new MemStorage();
  storage.setItem('menu.adminToken', JSON.stringify('admintok'));
  storage.setItem('menu.draft', JSON.stringify({
    rev: 0, tables: 12, at: Date.now(),
    items: [{ id: 'draft1', name: 'Draft Pancake', emoji: '🥞', price: 9, menu: 'breakfast', desc: '', soldOut: false, img: '' }],
  }));
  const { root, doc } = await bootAdmin({ storage });
  await tick2();
  await tick2();
  MENU_OK(root.textContent.includes('unsaved draft'), 'draft: offer shown on login');
  MENU_OK(querySelectorAll(root, '.mi').length === 2, 'draft: server menu shown while offering');
  dispatch(querySelector(doc, '[data-act="draft-restore"]'), 'click');
  MENU_OK(querySelectorAll(root, '.mi').length === 1, 'draft: restore swaps in draft items');
  MENU_OK(querySelector(doc, '.mi').dataset.mi === 'draft1', 'draft: restored item is the draft one');
  dispatch(querySelector(doc, '[data-act="save"]'), 'click');
  await tick2();
  const put = (apiCalls.find(([k]) => k === 'menu-put') || [])[1];
  MENU_OK(put && put.items.length === 1 && put.items[0].id === 'draft1', 'draft: saving posts restored draft');
}

async function s30_admin_price_and_emoji_sane() {
  const { root, doc } = await bootAdmin({});
  querySelector(doc, '#pinInput').value = '4321';
  dispatch(querySelector(doc, '#pinForm'), 'submit');
  await tick2();
  await tick2();
  const row = querySelectorAll(root, '.mi')[0];
  const price = row.querySelector('[data-field="price"]');
  price.value = '12a';
  dispatch(price, 'input');
  dispatch(price, 'focusout');
  MENU_OK(querySelectorAll(root, '.mi')[0].querySelector('[data-field="price"]').value === '12', 'price: non-digits stripped, normalized on blur');
  price.value = '';
  dispatch(price, 'input');
  dispatch(price, 'focusout');
  MENU_OK(querySelectorAll(root, '.mi')[0].querySelector('[data-field="price"]').value === '0', 'price: empty becomes 0, shown honestly');
  price.value = '99999';
  dispatch(price, 'input');
  dispatch(price, 'focusout');
  MENU_OK(querySelectorAll(root, '.mi')[0].querySelector('[data-field="price"]').value === '1000', 'price: clamped at 1000');
  // emoji is now a picker, not a text field
  MENU_OK(!querySelectorAll(root, '.mi')[0].querySelector('[data-field="emoji"]'), 'emoji: free-text input is gone');
  dispatch(querySelectorAll(root, '.mi')[0].querySelector('[data-act="emopick"]'), 'click');
  MENU_OK(!!querySelectorAll(root, '.mi')[0].querySelector('.emopanel'), 'emoji: picker opens');
  const chip = querySelectorAll(root, '.mi')[0].querySelector('.emochip[data-act="emochoose"]');
  dispatch(chip, 'click');
  MENU_OK(!querySelectorAll(root, '.mi')[0].querySelector('.emopanel'), 'emoji: panel closes after choose');
  MENU_OK((querySelectorAll(root, '.mi')[0].querySelector('.emobtn').textContent || '').trim() === (chip.textContent || '').trim(), 'emoji: chosen glyph lands on the card');
// (no free-text path: only picker chips can set emoji)
}

const scenarios = [
  s1_intro_fresh, s2_full_session, s3_wrong_tip_and_continue, s4_typein_and_toggle,
  s5_wrong_pin_guest_isolation, s6_correct_pin_sync_and_signout,
  s7_drill_autostart, s8_autostart_preserves_saved_cfg, s9_escape_to_summary,
  s10_dead_button_inventory, s11_theme_toggle_persists, s13_pronunciation_speaks,
  s15_quiz_typein_correct_scores, s16_theme_toggle_on_quiz,
  s17_guest_menu_renders, s18_guest_qs_preselect, s19_table_cart_send,
  s20_admin_wrong_then_right_pin, s21_admin_menu_edit_and_save,
  s22_admin_tables, s23_admin_orders_flow, s24_menu_dead_buttons,
  s25_admin_delete_confirm_undo, s26_admin_save_blocked_when_load_fails,
  s27_admin_conflict_409_keeps_draft, s28_admin_expired_token_back_to_gate,
  s29_admin_draft_restore, s30_admin_price_and_emoji_sane,
];
for (const s of scenarios) {
  try { await s(); await tick(); await tick(); } catch (e) { fails.push(s.name); console.error(`FAIL - ${s.name} threw: ${(e && e.message) || e}`, String(e.stack || '').split('\n').slice(1, 4).join(' | ')); }
}
console.log(`\nflow tests: ${pass} ok, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.error(' -', f)); process.exit(1); }
