import {
  SLOTS, sectionOrder, currentSlot, cartCount, cartTotal, orderLines, PAY_METHODS,
} from './clock.js';

const API = 'https://api.arjun.hk';

const SEED = {
  tables: 10,
  items: [
    { id: 'bagel', name: 'Bagel', emoji: '🥯', price: 20, menu: 'breakfast', img: 'images/bagel.png', desc: 'with cream cheese' },
    { id: 'cheese', name: 'Cheese', emoji: '🧀', price: 13, menu: 'allday', img: 'images/cheese.png', desc: 'with grapes' },
    { id: 'matcha', name: 'Matcha', emoji: '🍵', price: 16, menu: 'allday', img: 'images/matcha.png', desc: 'latte with heart' },
    { id: 'cream', name: 'Cream', emoji: '🥛', price: 19, menu: 'allday', img: 'images/cream.png' },
    { id: 'icecream', name: 'Ice-Cream', emoji: '🍦', price: 18, menu: 'allday', img: 'images/icecream.png', desc: 'chocolate cone' },
  ],
};

export const ACTIONS = ['table', 'picktable', 'closetable', 'cartbtn', 'closesh', 'sec', 'add', 'inc', 'dec', 'rm', 'pay', 'send', 'done'];

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function lread(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch (e) {
    return fallback;
  }
}
function lwrite(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* private mode */ }
}

const state = {
  menu: null, // { tables, items } from API (or seed)
  offline: false,
  cart: {},
  table: null,
  pay: 'cash',
  note: '',
  sheetOpen: false,
  tableOpen: false,
  sent: null,
  sendErr: '',
};

/* ---------- helpers ---------- */

function items() {
  return (state.menu && state.menu.items) ? state.menu.items : SEED.items;
}

function tables() {
  if (state.menu && state.menu.tables > 0) return state.menu.tables;
  return SEED.tables; // sane default until admin configures
}

function sanitizeCart(obj) {
  const valid = new Map(items().map((it) => [it.id, it]));
  const out = {};
  if (obj && typeof obj === 'object') {
    for (const [id, qty] of Object.entries(obj)) {
      if (valid.has(id)) out[id] = Math.min(20, Math.max(1, Math.round(Number(qty) || 0)));
    }
  }
  return out;
}

function syncCart() {
  lwrite('menu.cart', state.cart);
}

function imgSrc(it) {
  if (!it.img) return '';
  return it.img.startsWith('/') ? API + it.img : it.img;
}

function payLabel(key) {
  const hit = PAY_METHODS.find((p) => p.key === key);
  return hit ? hit.label : 'Cash';
}

/* ---------- render ---------- */

function cardHTML(it, inCurrent) {
  const src = imgSrc(it);
  const visual = src
    ? `<img class="card-img" src="${esc(src)}" alt="${esc(it.name)}" loading="lazy" />`
    : `<div class="card-emoji">${esc(it.emoji || '🍽️')}</div>`;
  const action = it.soldOut
    ? '<div class="soldoutbadge">Sold out 💤</div>'
    : `<button class="addbtn${inCurrent ? ' hot' : ''}" data-act="add" data-id="${esc(it.id)}" aria-label="Add ${esc(it.name)} to order">+ Add</button>`;
  return `
    <div class="card${it.soldOut ? ' off' : ''}">
      ${visual}
      <div class="card-name">${esc(it.name)}</div>
      ${it.desc ? `<div class="card-desc">${esc(it.desc)}</div>` : ''}
      <div class="card-price">$${esc(it.price)} dollarbucks</div>
      ${action}
    </div>`;
}

function renderMenuGrid() {
  const current = currentSlot(new Date());
  return sectionOrder(current).map((secKey) => {
    const sec = SLOTS.find((s) => s.key === secKey) || { key: secKey, label: secKey, emoji: '🍽️', hours: '' };
    const now = secKey === current;
    const list = items().filter((it) => it.menu === secKey);
    const rows = list.length
      ? list.map((it) => cardHTML(it, now)).join('')
      : `<div class="emptynote">${now ? 'Nothing on this menu right now — check back later! 🙂' : 'Check back during serving hours! 🙂'}</div>`;
    return `
      <div class="menu-section${now ? ' now' : ' other'}">
        <button class="sec-head" data-act="sec" data-sec="${esc(secKey)}" aria-expanded="${now ? 'true' : 'false'}">
          <span class="sec-title">${esc(sec.emoji)} ${esc(sec.label)}${now ? ' <span class="nowbadge">now</span>' : ''}</span>
          <span class="sec-hours">${esc(sec.hours)}</span>
          <span class="sec-chev" aria-hidden="true">▾</span>
        </button>
        <div class="sec-body" data-secbody="${esc(secKey)}"${now ? '' : ' hidden'}>${rows}</div>
      </div>`;
  }).join('');
}

function tableBarHTML() {
  return state.table != null
    ? `🍽️ Table <b>${esc(state.table)}</b>`
    : '🍽️ <b>Tap to pick your table</b>';
}

function tablePickerHTML() {
  const tables = (state.menu && state.menu.tables > 0) ? state.menu.tables : SEED.tables;
  return Array.from({ length: tables }, (_, i) => {
    const n = i + 1;
    const sel = state.table === n ? ' sel' : '';
    return `<button class="tablechip${sel}" data-act="picktable" data-n="${n}" aria-label="Table ${n}">${n}</button>`;
  }).join('');
}

function sheetHTML() {
  if (state.sent) {
    return `
      <div class="sh-head">🧾 Order sent!</div>
      <div class="sh-body center">
        <div class="sentcard">
          <div>Table <b>${esc(state.sent.table)}</b></div>
          <div>$${esc(state.sent.total)} dollarbucks</div>
          <div>Paying by <b>${esc(state.sent.payLabel)}</b></div>
        </div>
        <div class="sh-note count">We'll call your table when it's ready. Pay at the counter! 💳</div>
        <button class="bigbtn" data-act="done">Done, thanks!</button>
      </div>`;
  }
  const all = items();
  const lines = orderLines(state.cart, all);
  const total = cartTotal(state.cart, all);
  const noTable = state.table == null;
  const offline = state.offline;
  const canSend = lines.length > 0 && !noTable && !offline;
  return `
    <div class="sh-head">🛒 Your order${noTable ? ' — pick your table' : ` · Table ${esc(state.table)}`}</div>
    <div class="sh-body">
      ${noTable ? `<div class="tablewrap">${tablePickerHTML()}</div>` : ''}
      ${lines.length ? lines.map(cartLineHTML).join('') : '<div class="emptynote">Cart is empty — tap + Add on a dish!</div>'}
      <div class="totrow"${lines.length ? '' : ' hidden'}><span>Total</span><b>$${esc(total)} dollarbucks</b></div>
      <textarea class="notefield" rows="2" maxlength="300" data-note placeholder="Anything else? (no onions, birthday candles...)" aria-label="Order note">${esc(state.note)}</textarea>
      <div class="notecount"><span id="noteCount">${300 - state.note.length}</span> characters left</div>
      <div class="payrow" role="radiogroup" aria-label="How will you pay at the counter?">
        ${PAY_METHODS.map((p) => `<button class="paychip${state.pay === p.key ? ' sel' : ''}" data-act="pay" data-key="${esc(p.key)}">${esc(p.label)}</button>`).join('')}
      </div>
      ${offline ? '<div class="emptynote warn">⚠️ Can\'t reach the kitchen right now — please try again shortly.</div>' : ''}
      ${state.sendErr ? `<div class="emptynote warn">⚠️ ${esc(state.sendErr)}</div>` : ''}
      <button class="bigbtn" data-act="send"${canSend ? '' : ' disabled'}>Send order to the kitchen</button>
      <button class="sh-aux" data-act="closesh">Keep browsing the menu</button>
    </div>`;
}

function cartLineHTML(l) {
  return `
    <div class="cartline">
      <span class="cl-emoji" aria-hidden="true">${esc(l.emoji || '🍽️')}</span>
      <span class="cl-name">${esc(l.name)}</span>
      <span class="cl-qty">
        <button class="stepbtn" data-act="dec" data-id="${esc(l.id)}" aria-label="One less ${esc(l.name)}">−</button>
        <b>${esc(l.qty)}</b>
        <button class="stepbtn" data-act="inc" data-id="${esc(l.id)}" aria-label="One more ${esc(l.name)}">+</button>
      </span>
      <span class="cl-price">$${esc(l.price * l.qty)}</span>
      <button class="stepbtn rm" data-act="rm" data-id="${esc(l.id)}" aria-label="Remove ${esc(l.name)}">✕</button>
    </div>`;
}

function pillHTML() {
  const n = cartCount(state.cart);
  if (!n) return '';
  const t = cartTotal(state.cart, items());
  return `🛒 <b>${n}</b> · $${esc(t)}`;
}

/* ---------- wiring ---------- */

// Cart-only repaint: never re-renders the menu grid, so cards don't
// re-animate and rapid taps always land on the same button.
function cartRepaint() {
  const modal = state.sheetOpen || state.tableOpen;
  setHTML('cartPill', pillHTML());
  setHidden('tableBar', modal);
  setHidden('cartPill', modal || !cartCount(state.cart));
  if (state.sheetOpen && !state.tableOpen) setHTML('orderSheet', sheetHTML());
}

function paint() {
  const modal = state.sheetOpen || state.tableOpen;
  setHTML('menuRoot', renderMenuGrid());
  setHTML('tableBar', tableBarHTML());
  setHTML('cartPill', pillHTML());
  setHTML('tableGrid', tablePickerHTML());
  setHTML('orderSheet', sheetHTML());
  setHidden('tableBar', modal);
  setHidden('cartPill', modal || !cartCount(state.cart));
  setHidden('tableOverlay', !state.tableOpen);
  setHidden('orderSheet', !state.sheetOpen || state.tableOpen);
}

function setHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function setHidden(id, v) {
  const el = document.getElementById(id);
  if (el) el.hidden = v;
}

async function act(btn) {
  const key = btn.dataset.act;
  if (key === 'sec') {
    const body = document.querySelector(`[data-secbody="${btn.dataset.sec}"]`);
    if (body) {
      body.hidden = !body.hidden;
      btn.setAttribute('aria-expanded', body.hidden ? 'false' : 'true');
    }
    return;
  }
  if (key === 'table') {
    state.tableOpen = !state.tableOpen;
    state.sheetOpen = false;
    paint();
    return;
  }
  if (key === 'picktable') {
    state.table = Number(btn.dataset.n);
    lwrite('menu.table', state.table);
    state.tableOpen = false;
    if (cartCount(state.cart)) state.sheetOpen = true;
    paint();
    return;
  }
  if (key === 'cartbtn') {
    state.sheetOpen = true;
    paint();
    return;
  }
  if (key === 'closesh' || key === 'done') {
    if (key === 'done') { state.sent = null; }
    state.sheetOpen = false;
    paint();
    return;
  }
  if (key === 'add') {
    const id = btn.dataset.id;
    state.cart[id] = Math.min(20, (state.cart[id] || 0) + 1);
    syncCart();
    cartRepaint();
    return;
  }
  if (key === 'inc') {
    const id = btn.dataset.id;
    state.cart[id] = Math.min(20, (state.cart[id] || 0) + 1);
    syncCart();
    cartRepaint();
    return;
  }
  if (key === 'dec') {
    const id = btn.dataset.id;
    state.cart[id] = Math.max(1, (state.cart[id] || 1) - 1);
    syncCart();
    cartRepaint();
    return;
  }
  if (key === 'rm') {
    delete state.cart[btn.dataset.id];
    syncCart();
    cartRepaint();
    return;
  }
  if (key === 'pay') {
    state.pay = btn.dataset.key;
    cartRepaint();
    return;
  }
}

async function sendOrder() {
  state.sendErr = '';
  const lines = orderLines(state.cart, items());
  if (!lines.length || state.table == null) return;
  try {
    const res = await fetch(`${API}/v1/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: state.table,
        items: lines.map(({ id, qty, name, price }) => ({ id, qty, name, price })),
        note: state.note,
        pay: state.pay,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      state.sendErr = data.error || 'The kitchen didn\'t take that — please try again.';
      paint();
      return;
    }
    state.sent = {

      table: state.table,
      total: cartTotal(state.cart, items()),
      payLabel: payLabel(state.pay),
    };
    state.cart = {};
    state.note = '';
    syncCart();
    paint();
  } catch (e) {
    state.sendErr = 'Can\'t reach the kitchen — please try again shortly.';
    paint();
  }
}

export async function init() {
  state.cart = sanitizeCart(lread('menu.cart', {}));
  const savedTable = lread('menu.table', null);

  try {
    const res = await fetch(`${API}/v1/menu`);
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.items)) state.menu = data;
    }
  } catch (e) {
    /* fall through to offline */
  }

  // Query tables before binding so any configured table is pickable.
  const valid = state.menu && state.menu.tables > 0 ? state.menu.tables : SEED.tables;
  const urls = new URLSearchParams(location.search || '');
  const urlTable = Number(urls.get('t'));
  if (urlTable >= 1 && urlTable <= valid) {
    state.table = urlTable;
    lwrite('menu.table', state.table);
  } else if (Number.isFinite(savedTable) && savedTable >= 1 && savedTable <= valid) {
    state.table = savedTable;
  }

  if (!state.menu) state.offline = true;

  const rootEl = document;
  rootEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    btn.dataset.act === 'send' ? sendOrder() : act(btn);
  });
  rootEl.addEventListener('input', (e) => {
    const el = e.target.closest('textarea[data-note]');
    if (el) {
      state.note = el.value.slice(0, 300);
      const counter = document.getElementById('noteCount');
      if (counter) counter.textContent = String(300 - state.note.length);
    }
  });

  state.offline = state.offline || !(state.menu && Array.isArray(state.menu.items));
  paint();
}
