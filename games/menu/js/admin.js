import { SLOTS, STATE_LABELS, payLabel } from './clock.js';

const API = 'https://api.arjun.hk';
export const ACTIONS = ['login', 'logout', 'tab', 'additem', 'del', 'up', 'down', 'sold', 'photo', 'save', 'tables-inc', 'tables-dec', 'ordnext', 'dismissmsg'];

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
function ldel(key) {
  try { localStorage.removeItem(key); } catch (e) { /* private mode */ }
}

const state = {
  token: null,
  menu: null,
  orders: [],
  tab: 'menu',
  pinErr: '',
  loading: true,
  msg: '',
  photoFor: null, // item id waiting for a photo
  pollTimer: null,
};

export const STATUS_FLOW = ['pending', 'cooking', 'completed'];

/* ---------- api ---------- */
async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (state.token) headers.Authorization = 'Bearer ' + state.token;
  if (opts.body && !(opts.body instanceof Blob) && !(opts.body instanceof ArrayBuffer)) headers['Content-Type'] = 'application/json';
  const res = await fetch(API + path, { method: opts.method || 'GET', body: opts.body, headers });
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  return { ok: res.ok, status: res.status, data };
}

/* ---------- render: pin gate ---------- */

function pinHTML() {
  return `
    <div class="gate center">
      <div class="gate-emoji">🔐</div>
      <div class="gate-title">Kitchen Admin</div>
      <div class="gate-sub">Enter the restaurant PIN to manage the menu</div>
      ${state.pinErr ? `<div class="gate-err">⚠️ ${esc(state.pinErr)}</div>` : ''}
      <form id="pinForm" data-actform="1">
        <input id="pinInput" class="pinfield" type="password" inputmode="numeric" autocomplete="off"
          placeholder="••••" aria-label="Restaurant PIN" maxlength="12" />
        <button class="bigbtn" type="submit">Unlock</button>
      </form>
      <a class="sh-aux" href="/">← Back to the menu</a>
      ${state.loading ? '<div class="emptynote">loading…</div>' : ''}
    </div>`;
}

/* ---------- render: shell ---------- */

function shellHTML() {
  return `
    <div class="ad-head">
      <span class="ad-title">🍳 Kitchen Admin</span>
      <button class="chip-alt" data-act="logout">Sign out</button>
    </div>
    <div class="tabs" role="tablist">
      <button class="tab${state.tab === 'menu' ? ' on' : ''}" data-act="tab" data-key="menu" role="tab">📋 Menu</button>
      <button class="tab${state.tab === 'tables' ? ' on' : ''}" data-act="tab" data-key="tables" role="tab">🪑 Tables</button>
      <button class="tab${state.tab === 'orders' ? ' on' : ''}" data-act="tab" data-key="orders" role="tab">🧾 Orders<span id="ordCount"></span></button>
    </div>
    ${state.msg ? `<div class="toast" data-act="dismissmsg">${esc(state.msg)}</div>` : ''}
    <div id="tabBody"></div>`;
}

/* ---------- render: menu tab ---------- */

function editorRowHTML(it, i, n) {
  return `
    <div class="mi" data-mi="${esc(it.id)}">
      <div class="mi-row">
        <input class="in emoji" data-field="emoji" value="${esc(it.emoji || '')}" maxlength="4" aria-label="dish emoji" />
        <input class="in name" data-field="name" value="${esc(it.name)}" maxlength="40" aria-label="dish name" />
        <input class="in price" data-field="price" value="${esc(it.price)}" inputmode="numeric" aria-label="price" />
      </div>
      <div class="mi-row">
        <input class="in desc" data-field="desc" value="${esc(it.desc || '')}" maxlength="120" placeholder="description (optional)" aria-label="description" />
        <select class="in slot" data-field="slot" aria-label="menu section">
          ${SLOTS.filter((s) => s.key !== 'allday').map((s) => `<option value="${esc(s.key)}"${it.menu === s.key ? ' selected' : ''}>${esc(s.emoji)} ${esc(s.label)}</option>`).join('')}
          <option value="allday"${it.menu === 'allday' ? ' selected' : ''}>♾️ All Day</option>
        </select>
      </div>
      <div class="mi-tools">
        <button class="tool${it.soldOut ? ' sel' : ''}" data-act="sold" data-i="${i}">${it.soldOut ? '💤 Sold out' : '👁️ On sale'}</button>
        <button class="tool" data-act="photo" data-i="${i}">📷 ${it.img ? 'Replace photo' : 'Add photo'}</button>
        <span class="tool-sp"></span>
        <button class="tool" data-act="up" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
        <button class="tool" data-act="down" data-i="${i}" ${i === n - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
        <button class="tool danger" data-act="del" data-i="${i}" aria-label="Delete ${esc(it.name)}">🗑</button>
      </div>
      <div class="mi-imgnote">${it.img ? (it.img.startsWith('/') ? 'photo saved ✓' : 'stock photo') : 'no photo'}</div>
    </div>`;
}

function menuTabHTML() {
  const items = state.menu ? state.menu.items : [];
  return `
    <div class="tab-note">Edit dishes, then press <b>Save menu</b>. Changes go live instantly.</div>
    ${items.map((it, i) => editorRowHTML(it, i, items.length)).join('')}
    <button class="bigbtn add" data-act="additem">+ Add a dish</button>
    <button class="bigbtn" data-act="save">💾 Save menu</button>`;
}

/* ---------- render: tables tab ---------- */

function tablesTabHTML() {
  const n = state.menu ? state.menu.tables : 0;
  return `
    <div class="gate center">
      <div class="gate-emoji">🪑</div>
      <div class="gate-title">Number of tables</div>
      <div class="gate-sub">Guests will tap their table number after scanning the QR</div>
      <div class="tstep">
        <button class="stepbtn big" data-act="tables-dec" aria-label="One table less" ${n <= 0 ? 'disabled' : ''}>−</button>
        <b id="tablesVal" class="tablesval">${esc(n)}</b>
        <button class="stepbtn big" data-act="tables-inc" aria-label="One table more" ${n >= 40 ? 'disabled' : ''}>+</button>
      </div>
      <button class="bigbtn" data-act="save">💾 Save</button>
    </div>`;
}

/* ---------- render: orders tab ---------- */

function orderCardHTML(o) {
  const done = o.status === 'completed';
  const next = o.status === 'pending' ? 'cooking' : o.status === 'cooking' ? 'completed' : null;
  const when = new Date(o.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Hong_Kong' });
  return `
    <div class="ord${done ? ' done' : ''}" data-ord="${esc(o.id)}">
      <div class="ord-top">
        <span class="ord-table">🍽️ Table <b>${esc(o.table)}</b></span>
        <span class="ord-when">${esc(when)}</span>
        <span class="ord-state ${esc(o.status)}">${esc(STATE_LABELS[o.status] || o.status)}</span>
      </div>
      <div class="ord-lines">
        ${o.items.map((l) => `<div>${l.qty}× ${esc(l.name)} <span class="ol-price">$${esc(l.price * l.qty)}</span></div>`).join('')}
      </div>
      <div class="ord-foot">
        <span>Total <b>$${esc(o.total)}</b> · ${esc(payLabel(o.pay))}</span>
      </div>
      ${o.note ? `<div class="ord-note">📝 ${esc(o.note)}</div>` : ''}
      ${next ? `<button class="bigbtn${next === 'cooking' ? ' warm' : ''}" data-act="ordnext" data-id="${esc(o.id)}" data-next="${esc(next)}">
        ${next === 'cooking' ? '🍳 Start cooking' : '✓ Complete'}</button>` : ''}
    </div>`;
}

function ordersTabHTML() {
  const live = state.orders.filter((o) => o.status !== 'completed');
  const done = state.orders.filter((o) => o.status === 'completed');
  return `
    ${live.length ? live.map(orderCardHTML).join('') : '<div class="emptynote">No open orders — kitchen is quiet 🎈</div>'}
    ${done.length ? `<div class="done-head">Done (${done.length})</div>${done.map(orderCardHTML).join('')}` : ''}`;
}

/* ---------- paint ---------- */

function paint() {
  const root = document.getElementById('app');
  if (!root) return;
  if (!state.token) {
    root.innerHTML = pinHTML();
    const pin = root.querySelector('#pinInput');
    if (pin) pin.focus({ preventScroll: true });
    return;
  }
  root.innerHTML = shellHTML();
  const body = root.querySelector('#tabBody');
  if (body) body.innerHTML = state.tab === 'menu' ? menuTabHTML() : state.tab === 'tables' ? tablesTabHTML() : ordersTabHTML();
  const count = document.querySelector('span#ordCount');
  if (count) {
    const live = state.orders.filter((o) => o.status !== 'completed').length;
    count.textContent = live ? ` (${live})` : '';
  }
}

/* ---------- data loads ---------- */

async function loadMenu() {
  const r = await api('/v1/menu');
  if (r.ok && r.data && Array.isArray(r.data.items)) state.menu = r.data;
}

async function loadOrders() {
  const r = await api('/v1/orders');
  if (r.ok && Array.isArray(r.data)) state.orders = r.data;
  schedulePoll();
}

function schedulePoll() {
  if (state.pollTimer) clearTimeout(state.pollTimer);
  state.pollTimer = setTimeout(async () => {
    await loadOrders();
    if (state.tab === 'orders') paint();
  }, 12000);
}

async function login(pin) {
  state.pinErr = '';
  try {
    const res = await fetch(`${API}/v1/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    const data = await res.json();
    if (!res.ok) {
      state.pinErr = res.status === 429 ? 'Too many tries — wait 5 minutes.' : 'Wrong PIN — try again.';
      paint();
      return;
    }
    state.token = data.token;
    lwrite('menu.adminToken', state.token);
    state.loading = true;
    paint();
    await loadMenu();
    await loadOrders();
    state.loading = false;
    paint();
    schedulePoll();
  } catch (e) {
    state.pinErr = 'Can\'t reach the kitchen server.';
    paint();
  }
}

async function logout() {
  ldel('menu.adminToken');
  state.token = null;
  state.orders = [];
  state.menu = null;
  paint();
}

function freshItem() {
  const id = 'it' + Math.random().toString(16).slice(2, 8) + Date.now().toString(16).slice(-4);
  return { id, name: 'New dish', emoji: '🍽️', price: 10, menu: 'allday', desc: '', soldOut: false, img: '' };
}

/* ---------- actions ---------- */

async function save() {
  state.msg = '';
  const body = {
    tables: state.menu ? state.menu.tables : 0,
    items: (state.menu ? state.menu.items : []).map((it, i) => ({ ...it, sort: i })),
  };
  try {
    const res = await fetch(`${API}/v1/menu`, {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + state.token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      state.msg = 'Could not save: ' + (data.error || 'unknown');
    } else {
      state.menu = data;
      state.msg = 'Saved! Menu is live ✓';
    }
  } catch (e) {
    state.msg = 'Can\'t reach the kitchen server.';
  }
  paint();
}

async function uploadPhoto(file, item) {
  const img = new Image();
  img.src = URL.createObjectURL ? URL.createObjectURL(file) : '';
  await new Promise((ok) => { img.onload = ok; img.onerror = ok; });
  const canvas = document.createElement('canvas');
  const max = 800;
  const scale = Math.min(1, max / Math.max(img.naturalWidth || img.width || max, img.naturalHeight || img.height || max));
  canvas.width = Math.max(1, Math.round((img.naturalWidth || img.width || max) * scale));
  canvas.height = Math.max(1, Math.round((img.naturalHeight || img.height || max) * scale));
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', 0.75));
  if (!blob) throw new Error('resize failed');
  const res = await fetch(`${API}/v1/menu/img`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + state.token, 'Content-Type': 'image/jpeg' },
    body: blob,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'upload failed');
  item.img = data.img;
}

export async function init() {
  state.token = lread('menu.adminToken', null);
  const root = document.getElementById('app');
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = 'image/*';
  picker.setAttribute('data-id', 'photoPicker');
  picker.hidden = true;
  document.body.appendChild(picker);
  if (true) {
    picker.addEventListener('change', async () => {
      const file = picker.files && picker.files[0];
      picker.value = '';
      if (!file || state.photoFor == null) return;
      const item = (state.menu ? state.menu.items : []).find((i) => i.id === state.photoFor);
      state.photoFor = null;
      if (!item) return;
      state.msg = 'Uploading photo…';
      paint();
      try {
        await uploadPhoto(file, item);
        state.msg = 'Photo added ✓ — press Save menu';
      } catch (err) {
        state.msg = 'Photo failed: ' + (err && err.message);
      }
      paint();
    });
  }

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || !state.token) return;
    const act = btn.dataset.act;
    if (act === 'dismissmsg') {
      state.msg = '';
      paint();
      return;
    }
    if (act === 'logout') {
      ldel('menu.adminToken');
      state.token = null;
      paint();
      return;
    }
    if (act === 'tab') {
      state.tab = btn.dataset.key;
      paint();
      return;
    }
    if (act === 'additem') {
      if (!state.menu) state.menu = { tables: 0, items: [] };
      state.menu.items.push(freshItem());
      paint();
      return;
    }
    if (act === 'del') {
      const items = state.menu ? state.menu.items : [];
      items.splice(Number(btn.dataset.i), 1);
      paint();
      return;
    }
    if (act === 'up' || act === 'down') {
      const items = state.menu.items || [];
      const i = Number(btn.dataset.i);
      const j = act === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= items.length) return;
      [items[i], items[j]] = [items[j], items[i]];
      paint();
      return;
    }
    if (act === 'sold') {
      const items = state.menu.items || [];
      const it = items[Number(btn.dataset.i)];
      if (it) it.soldOut = !it.soldOut;
      paint();
      return;
    }
    if (act === 'photo') {
      const items = state.menu.items || [];
      const it = items[Number(btn.dataset.i)];
      if (it) {
        state.photoFor = it.id;
        if (picker) picker.click();
      }
      return;
    }
    if (act === 'tables-inc' || act === 'tables-dec') {
      if (!state.menu) state.menu = { tables: 0, items: [] };
      const d = act === 'tables-inc' ? 1 : -1;
      state.menu.tables = Math.min(40, Math.max(0, state.menu.tables + d));
      paint();
      return;
    }
    if (act === 'save') {
      await save();
      return;
    }
    if (act === 'ordnext') {
      try {
        const res = await fetch(`${API}/v1/orders/status`, {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + state.token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: btn.dataset.id, status: btn.dataset.next }),
        });
        if (res.ok) {
          await loadOrders();
          paint();
        } else {
          state.msg = 'Could not update that order';
          paint();
        }
      } catch (err) {
        state.msg = 'Can\'t reach the server';
        paint();
      }
      return;
    }
  });

  document.addEventListener('input', (e) => {
    const el = e.target.closest('.mi');
    if (!el) return;
    const id = el.dataset.mi;
    const item = (state.menu ? state.menu.items : []).find((i) => i.id === id);
    if (!item) return;
    const f = e.target.dataset.field;
    if (f === 'emoji') item.emoji = e.target.value.slice(0, 4);
    else if (f === 'name') item.name = e.target.value.slice(0, 40);
    else if (f === 'desc') item.desc = e.target.value.slice(0, 120);
    else if (f === 'price') item.price = Math.max(0, Math.round(Number(e.target.value) || 0));
    else if (f === 'slot' && e.target.tagName === 'SELECT') {
      item.menu = e.target.value;
    }
  });

  document.addEventListener('submit', async (e) => {
    const form = e.target.closest('#pinForm');
    if (!form) return;
    if (e.preventDefault) e.preventDefault();
    const input = form.querySelector('#pinInput');
    const pin = input ? input.value.trim() : '';
    if (!pin) return;
    state.pinErr = '';
    await login(pin);
  });

  if (state.token) {
    await loadMenu();
    await loadOrders();
  }
  paint();
}
