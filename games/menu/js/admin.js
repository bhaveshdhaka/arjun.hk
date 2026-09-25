import { SLOTS, STATE_LABELS, payLabel } from './clock.js?v=09251453';

const API = 'https://api.arjun.hk';
export const ACTIONS = ['login', 'logout', 'tab', 'additem', 'del', 'up', 'down', 'sold', 'photo', 'save', 'tables-inc', 'tables-dec', 'ordnext', 'dismissmsg', 'reload-menu', 'draft-restore', 'draft-discard', 'conflict-overwrite', 'conflict-discard', 'undo', 'sort', 'emopick', 'emochoose', 'emoclose'];

export const STATUS_FLOW = ['pending', 'cooking', 'completed'];

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const codepoints = (s) => Array.from(String(s == null ? '' : s));

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
  menu: null,       // working copy: { rev, tables, items }
  menuLoaded: false,
  loadFailed: false,
  dirty: false,
  conflict: false,
  orders: [],
  tab: 'menu',
  pinErr: '',
  loading: false,
  msg: '',
  draftOffer: false,
  undoOffer: false,
  undo: null,       // { item, index }
  confirmDel: null, // item id awaiting second tap
  photoFor: null,
  pollTimer: null,
  expired: false,
  sortBy: 'menu',  // 'menu' | 'price' | 'name' — how the list is organized
  emojiFor: null,  // item id whose emoji picker is open
  saving: false,   // a PUT is in flight
  autosaveTimer: null,
};

const DRAFT_KEY = 'menu.draft';

/* ---------- draft ---------- */

function saveDraft() {
  if (!state.menu) return;
  lwrite(DRAFT_KEY, { rev: state.menu.rev, tables: state.menu.tables, items: state.menu.items, at: Date.now() });
  state.dirty = true;
  scheduleAutosave();
}

// Auto-save: ~1.2s after the last edit lands, push to the server so the live
// menu really is live without anyone hunting for a Save button. The conflict
// guard still protects against two admins racing.
function scheduleAutosave() {
  if (!state.token || !state.menuLoaded || state.loadFailed || state.conflict) return;
  if (state.autosaveTimer) clearTimeout(state.autosaveTimer);
  state.autosaveTimer = setTimeout(() => {
    state.autosaveTimer = null;
    if (!state.dirty || state.saving || state.conflict) return;
    void save();
  }, 1200);
}
function readDraft() {
  const d = lread(DRAFT_KEY, null);
  return d && Array.isArray(d.items) ? d : null;
}
function clearDraft() {
  ldel(DRAFT_KEY);
  state.dirty = false;
  state.draftOffer = false;
}
function beforeUnload(e) {
  if (state.dirty && state.token) {
    e.preventDefault();
    e.returnValue = '';
  }
}

/* ---------- api ---------- */

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (state.token) headers.Authorization = 'Bearer ' + state.token;
  if (opts.body && !(opts.body instanceof Blob) && !(opts.body instanceof ArrayBuffer)) headers['Content-Type'] = 'application/json';
  const res = await fetch(API + path, { method: opts.method || 'GET', body: opts.body, headers });
  if (res.status === 401 && state.token && path !== '/v1/login') sessionExpired();
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  return { ok: res.ok, status: res.status, data };
}

function sessionExpired() {
  state.token = null;
  state.expired = true;
  state.loading = false;
  ldel('menu.adminToken');
  if (state.pollTimer) clearTimeout(state.pollTimer);
  paint();
}

/* ---------- rendering ---------- */

let rootEl = null;

function toastHTML() {
  if (!state.msg) return '';
  const extra = state.draftOffer
    ? ' <button class="tool" data-act="draft-restore">Restore draft</button> <button class="tool" data-act="draft-discard">Discard</button>'
    : state.undoOffer
      ? ' <button class="tool" data-act="undo">Undo</button>'
      : '';
  return `<div id="toast" class="toast" data-act="dismissmsg">${esc(state.msg)}${extra}</div>`;
}

function paint() {
  if (!rootEl) return;
  if (!state.token) {
    rootEl.innerHTML = pinHTML();
    const pin = rootEl.querySelector('#pinInput');
    if (pin) pin.focus({ preventScroll: true });
    return;
  }
  if (!rootEl.querySelector('.ad-head')) {
    rootEl.innerHTML = shellHTML();
  }
  renderTab();
  updateOrdCount();
}

function renderTab() {
  const body = rootEl && rootEl.querySelector('#tabBody');
  if (!body) return;
  if (state.tab === 'menu') body.innerHTML = menuTabHTML();
  else if (state.tab === 'tables') body.innerHTML = tablesTabHTML();
  else body.innerHTML = ordersHTML();
  if (state.tab === 'menu') syncRowButtons();
}

function setMsg(msg) {
  state.msg = msg || '';
  const body = rootEl && rootEl.querySelector('#tabBody');
  if (!body) return;
  const t = body.querySelector('#toast');
  if (!state.msg) {
    if (t) t.remove();
    return;
  }
  if (t) t.outerHTML = toastHTML();
  else body.insertAdjacentHTML('afterbegin', toastHTML());
}

function updateOrdCount() {
  const count = rootEl && rootEl.querySelector('span#ordCount');
  if (!count) return;
  const live = state.orders.filter((o) => o.status !== 'completed').length;
  count.textContent = live ? ` (${live})` : '';
}

/* ---------- pin gate ---------- */

function pinHTML() {
  const note = state.expired ? '<div class="gate-sub">Session expired — your unsaved draft is kept on this device.</div>' : '';
  return `
    <div class="gate center">
      <div class="gate-emoji">🔐</div>
      <div class="gate-title">Kitchen Admin</div>
      <div class="gate-sub">Enter the restaurant PIN to manage the menu</div>
      ${note}
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

/* ---------- shell ---------- */

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
    <div id="tabBody"></div>`;
}

/* ---------- menu tab ---------- */

function saveDisabled() {
  return !state.menuLoaded || state.conflict;
}

const SORT_BY = {
  menu: '⌚ By menu time',
  price: '💰 By price',
  name: '🔤 By name A→Z',
};

const GROUP_ORDER = ['breakfast', 'lunch', 'dinner', 'midnight', 'allday'];

function sortChipsHTML() {
  return `
    <div class="sortchips" role="group" aria-label="Organize dishes">
      ${Object.keys(SORT_BY).map((k) => `<button class="schip${state.sortBy === k ? ' on' : ''}" data-act="sort" data-key="${esc(k)}">${SORT_BY[k]}</button>`).join('')}
    </div>`;
}

function menuTabHTML() {
  const items = state.menu ? state.menu.items : [];
  let banner = '';
  if (state.loadFailed) {
    banner = `<div class="gate-err">⚠️ Couldn't load the menu. Saving is disabled so nothing gets wiped.
      <button class="tool" data-act="reload-menu">↻ Retry</button></div>`;
  } else if (state.conflict) {
    banner = `<div class="gate-err">⚠️ The menu changed on another device. Your edits are kept in a draft.
      <button class="tool" data-act="conflict-overwrite">Save mine anyway</button>
      <button class="tool" data-act="conflict-discard">Load theirs</button></div>`;
  }
  const draftNote = state.dirty ? '<div class="mi-imgnote">unsaved edits are drafted on this device ✓</div>' : '';
  const cards = items.map(cardHTML).join('');
  return `
    ${banner}
    ${toastHTML()}
    ${sortChipsHTML()}
    ${state.sortBy === 'menu' ? groupedHTML(items) : `<div class="flatlist">${cards}</div>`}
    <button class="bigbtn add" data-act="additem" ${state.loadFailed ? 'disabled' : ''}>+ Add a dish</button>
    <button class="bigbtn" data-act="save" ${saveDisabled() ? 'disabled' : ''}>💾 Save menu</button>
    ${draftNote}`;
}

function groupedHTML(items) {
  const sections = [
    ['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner'], ['midnight', 'Midnight Snacks'], ['allday', 'All Day'],
  ];
  return sections.map(([key, label]) => {
    const group = items.filter((it) => it.menu === key);
    const info = SLOTS.find((s) => s.key === key) || { emoji: '♾️' };
    return `
      <div class="adgroup">
        <div class="adgroup-head">${esc(info.emoji)} ${esc(label)} <span class="cnt">(${esc(group.length)})</span></div>
        <div class="adgroup-body">
          ${group.length ? group.map((it) => cardHTML(it)).join('') : '<div class="emptynote">Nothing here yet — add one 👇 or drag from All Day when editing its section</div>'}
        </div>
      </div>`;
  }).join('');
}

function cardHTML(it) {
  const confirming = state.confirmDel === it.id;
  const delLabel = confirming ? 'Sure?' : '🗑';
  const imgSrc = it.img ? (it.img.startsWith('/') ? API + it.img : it.img) : '';
  const thumb = imgSrc
    ? `<img class="thumb-img" src="${esc(imgSrc)}" alt="${esc(it.name)} photo" loading="lazy" />`
    : '<span class="thumb-empty">🍽️</span>';
  return `
    <div class="mi${it.soldOut ? ' off' : ''}" data-mi="${esc(it.id)}">
      <button class="mi-photo${imgSrc ? '' : ' empty'}" data-act="photo" data-id="${esc(it.id)}" aria-label="Change the photo of ${esc(it.name)}">
        ${thumb}<span class="thumb-badge">📷</span>
      </button>
      <div class="mi-main">
        <div class="mi-row">
          <button class="emobtn" data-act="emopick" data-id="${esc(it.id)}" aria-label="Change the emoji of ${esc(it.name)}">${esc(it.emoji || '🍽️')}</button>
          <input class="in name" data-field="name" value="${esc(it.name)}" maxlength="40" aria-label="dish name" />
          <span class="pricewrap">$<input class="in price" data-field="price" value="${esc(it.price)}" inputmode="numeric" aria-label="price in dollarbucks" /></span>
        </div>
        <div class="mi-row">
          <input class="in desc" data-field="desc" value="${esc(it.desc || '')}" maxlength="120" placeholder="description (optional)" aria-label="description" />
          <select class="in slot" data-field="slot" aria-label="menu section">
            ${SLOTS.filter((s) => s.key !== 'allday').map((s) => `<option value="${esc(s.key)}"${it.menu === s.key ? ' selected' : ''}>${esc(s.emoji)} ${esc(s.label)}</option>`).join('')}
            <option value="allday"${it.menu === 'allday' ? ' selected' : ''}>♾️ All Day</option>
          </select>
        </div>
        <div class="mi-tools">
          <button class="sw${it.soldOut ? ' off' : ''}" data-act="sold" data-id="${esc(it.id)}" role="switch" aria-checked="${it.soldOut ? 'true' : 'false'}" aria-label="${it.soldOut ? `${it.name} is sold out — tap to make available` : `${it.name} is available — tap to mark sold out`}">
            <span class="sw-pill"><span class="sw-dot"></span></span>
            <span class="sw-lbl">${it.soldOut ? 'Sold out' : 'Available'}</span>
          </button>
          <span class="tool-sp"></span>
          <button class="tool" data-act="up" data-id="${esc(it.id)}" aria-label="Move up">↑</button>
          <button class="tool" data-act="down" data-id="${esc(it.id)}" aria-label="Move down">↓</button>
          <button class="tool danger" data-act="del" data-id="${esc(it.id)}" aria-label="Delete ${esc(it.name)}">${delLabel}</button>
        </div>
        <div class="mi-imgnote">${imgSrc ? (it.img.startsWith('/') ? 'photo saved ✓ — tap to replace' : 'stock photo — tap to replace') : 'no photo yet — tap to add'}</div>
      </div>
      ${confirmEmojiPanelHTML(it)}
    </div>`;
}

const EMOJIS = ['🥯', '🍞', '🥐', '🥞', '🧇', '🍳', '🥪', '🌯', '🌮', '🍕', '🍔', '🌭', '🥨', '🍟', '🧀', '🥑', '🥗', '🍜', '🍲', '🍛', '🍣', '🥟', '🥢', '🧆', '🍗', '🥩', '🥓', '🥚', '🍎', '🍓', '🍌', '🍇', '🍉', '🍊', '🍍', '🥭', '🍒', '🧁', '🍰', '🎂', '🍩', '🍪', '🍫', '🍬', '🍭', '🍦', '🥤', '🧋', '🍵', '☕', '🧀', '🥛', '🍯', '🧂', '🥄', '🍽️'];

function confirmEmojiPanelHTML(it) {
  if (state.emojiFor !== it.id) return '';
  return `
    <div class="emopanel" role="dialog" aria-label="Pick an emoji for ${esc(it.name)}">
      <div class="emopanel-grid">
        ${EMOJIS.map((e, i) => `<button class="emochip${it.emoji === e ? ' on' : ''}" data-act="emochoose" data-id="${esc(it.id)}" data-emoji="${esc(e)}" aria-label="Use ${esc(e)}">${e}</button>`).join('')}
      </div>
      <button class="sh-aux" data-act="emoclose">Close</button>
    </div>`;
}

function itemById(id) {
  return (state.menu ? state.menu.items : []).find((it) => it.id === id) || null;
}

function refreshCard(it) {
  const row = cardRow(it.id);
  if (row) row.outerHTML = cardHTML(it);
}

function cardRow(id) {
  return rootEl ? rootEl.querySelector(`.mi[data-mi="${esc(id)}"]`) : null;
}

function syncRowButtons() {
  const rows = rootEl ? rootEl.querySelectorAll('.mi') : [];
  rows.forEach((row, i) => {
    const up = row.querySelector('[data-act="up"]');
    const down = row.querySelector('[data-act="down"]');
    if (up) {
      if (i === 0) up.setAttribute('disabled', '');
      else up.removeAttribute('disabled');
    }
    if (down) {
      if (i === rows.length - 1) down.setAttribute('disabled', '');
      else down.removeAttribute('disabled');
    }
  });
}

/* ---------- tables tab ---------- */

function tablesTabHTML() {
  const n = state.menu ? state.menu.tables : 0;
  return `
    ${toastHTML()}
    <div class="gate center">
      <div class="gate-emoji">🪑</div>
      <div class="gate-title">Number of tables</div>
      <div class="gate-sub">Guests will tap their table number after scanning the QR</div>
      <div class="tstep">
        <button class="stepbtn big" data-act="tables-dec" aria-label="One table less" ${n <= 0 ? 'disabled' : ''}>−</button>
        <b id="tablesVal" class="tablesval">${esc(n)}</b>
        <button class="stepbtn big" data-act="tables-inc" aria-label="One table more" ${n >= 40 ? 'disabled' : ''}>+</button>
      </div>
      <button class="bigbtn" data-act="save" ${saveDisabled() ? 'disabled' : ''}>💾 Save</button>
    </div>`;
}

/* ---------- orders tab ---------- */

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
        ${(o.items || []).map((l) => `<div>${esc(l.qty)}× ${esc(l.name)} <span class="ol-price">$${esc((Number(l.price) || 0) * (Number(l.qty) || 0))}</span></div>`).join('')}
      </div>
      <div class="ord-foot">
        <span>Total <b>$${esc(o.total)}</b> · ${esc(payLabel(o.pay))}</span>
      </div>
      ${o.note ? `<div class="ord-note">📝 ${esc(o.note)}</div>` : ''}
      ${next ? `<button class="bigbtn${next === 'cooking' ? ' warm' : ''}" data-act="ordnext" data-id="${esc(o.id)}" data-next="${esc(next)}">
        ${next === 'cooking' ? '🍳 Start cooking' : '✓ Complete'}</button>` : ''}
    </div>`;
}

function ordersHTML() {
  const live = state.orders.filter((o) => o.status !== 'completed');
  const done = state.orders.filter((o) => o.status === 'completed');
  return `
    ${toastHTML()}
    <div id="ordersList">
    ${live.length ? live.map(orderCardHTML).join('') : '<div class="emptynote">No open orders — kitchen is quiet 🎈</div>'}
    ${done.length ? `<div class="done-head">Done (${done.length})</div>${done.map(orderCardHTML).join('')}` : ''}
    </div>`;
}

function renderOrders() {
  const body = rootEl && rootEl.querySelector('#tabBody');
  if (!body) return;
  if (state.tab === 'orders') body.innerHTML = ordersHTML();
  updateOrdCount();
}

/* ---------- data loads ---------- */

async function loadMenu() {
  const r = await api('/v1/menu');
  if (r.ok && r.data && Array.isArray(r.data.items)) {
    state.menu = { rev: Number(r.data.rev) || 0, tables: r.data.tables || 0, items: r.data.items };
    state.menuLoaded = true;
    state.loadFailed = false;
    maybeOfferDraft();
    return true;
  }
  if (r.status !== 401) {
    state.loadFailed = true;
    state.menuLoaded = false;
    setMsg("Couldn't load the menu — saving is blocked to protect the live menu. Tap Retry.");
  }
  return false;
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
    renderOrders();
  }, 12000);
}

function maybeOfferDraft() {
  const d = readDraft();
  if (!d || !state.menu) return;
  const ours = JSON.stringify({ tables: state.menu.tables, items: state.menu.items });
  const theirs = JSON.stringify({ tables: d.tables, items: d.items });
  if (ours === theirs) {
    clearDraft();
    return;
  }
  state.dirty = true;
  state.draftOffer = true;
  const stale = Number(d.rev) !== Number(state.menu.rev);
  setMsg(stale
    ? 'You have an unsaved draft from an older menu.'
    : 'You have unsaved drafted edits.');
}

/* ---------- auth ---------- */

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
    state.expired = false;
    lwrite('menu.adminToken', state.token);
    state.loading = true;
    paint();
    const okMenu = await loadMenu();
    await loadOrders();
    state.loading = false;
    paint();
    if (okMenu) schedulePoll();
  } catch (e) {
    state.pinErr = 'Can\'t reach the kitchen server.';
    paint();
  }
}

async function logout() {
  const tok = state.token;
  state.token = null;
  state.orders = [];
  state.menu = null;
  state.menuLoaded = false;
  state.loadFailed = false;
  state.conflict = false;
  state.tab = 'menu';
  state.confirmDel = null;
  state.msg = '';
  if (state.pollTimer) clearTimeout(state.pollTimer);
  paint();
  if (tok) {
    try { await fetch(`${API}/v1/logout`, { method: 'POST', headers: { Authorization: 'Bearer ' + tok } }); } catch (e) { /* best effort */ }
  }
  ldel('menu.adminToken');
}

/* ---------- save ---------- */

function payload() {
  return {
    tables: state.menu ? state.menu.tables : 0,
    items: (state.menu ? state.menu.items : []).map((it, i) => ({ ...it, sort: i })),
  };
}

async function save() {
  if (!state.menuLoaded || state.conflict) {
    setMsg(state.loadFailed
      ? "Menu isn't loaded — saving is blocked. Tap Retry first."
      : 'Resolve the conflict banner first.');
    return;
  }
  if (state.saving) return; // one PUT at a time; a queued one follows anyway
  if (state.autosaveTimer) { clearTimeout(state.autosaveTimer); state.autosaveTimer = null; }
  state.saving = true;
  setMsg('⏳ Saving…');
  const saveBtn = rootEl ? rootEl.querySelector('[data-act="save"]') : null;
  if (saveBtn) saveBtn.classList.add('saving');
  const rev = state.menu.rev;
  const res = await fetch(`${API}/v1/menu`, {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + state.token, 'Content-Type': 'application/json', 'If-Match': String(rev) },
    body: JSON.stringify(payload()),
  });
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  if (res.status === 401) { sessionExpired(); return; }
  if (!res.ok) {
    state.saving = false;
    if (saveBtn) saveBtn.classList.remove('saving');
    if (res.status === 409) {
      state.conflict = true;
      renderTab();
      setMsg('Someone saved a newer menu. Your edits are kept — choose in the banner.');
    } else {
      setMsg('Could not save: ' + ((data && data.error) || 'unknown'));
    }
    return;
  }
  const newRev = data && typeof data.rev === 'number' ? data.rev : rev + 1;
  state.menu = { rev: newRev, tables: (data && data.tables) != null ? data.tables : state.menu.tables, items: (data && Array.isArray(data.items) ? data.items : state.menu.items) };
  state.conflict = false;
  const when = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  clearDraft();
  state.saving = false;
  if (saveBtn) saveBtn.classList.remove('saving');
  renderTab();
  setMsg(`✓ Live at ${when}`);
}

async function discardDraftAndReload() {
  clearDraft();
  state.dirty = false;
  await loadMenu();
  renderTab();
}

async function overwriteWithMine() {
  const r = await api('/v1/menu');
  if (r.ok && r.data) state.menu.rev = Number(r.data.rev) || 0;
  state.conflict = false;
  await save();
}

/* ---------- photo ---------- */

async function uploadPhoto(file, item) {
  const img = new Image();
  const url = URL.createObjectURL ? URL.createObjectURL(file) : '';
  img.src = url;
  await new Promise((ok) => { img.onload = ok; img.onerror = ok; });
  if (img.decode) { try { await img.decode(); } catch (e) { throw new Error('photo could not be read — try a JPEG or PNG'); } }
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error('photo could not be read — try a JPEG or PNG');
  const canvas = document.createElement('canvas');
  const max = 800;
  const scale = Math.min(1, max / Math.max(w, h));
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  let blank = false;
  try {
    const px = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const first = [px[0], px[1], px[2]];
    let varied = false;
    for (let i = 4; i < px.length; i += 40) {
      if (Math.abs(px[i] - first[0]) > 8 || Math.abs(px[i + 1] - first[1]) > 8 || Math.abs(px[i + 2] - first[2]) > 8) { varied = true; break; }
    }
    blank = !varied;
  } catch (e) { blank = false; }
  if (blank) throw new Error('photo looks blank — try a different picture');
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

/* ---------- item mutations (no full repaints) ---------- */

function addItem() {
  if (!state.menu) return;
  const id = 'it' + Math.random().toString(16).slice(2, 8) + Date.now().toString(16).slice(-4);
  state.menu.items.push({ id, name: 'New dish', emoji: '🍽️', price: 10, menu: 'allday', desc: '', soldOut: false, img: '' });
  renderTab();
  saveDraft();
  const rows = rootEl.querySelectorAll('.mi');
  const last = rows[rows.length - 1];
  if (last) {
    const name = last.querySelector('[data-field="name"]');
    if (name) name.focus({ preventScroll: true });
    if (last.scrollIntoView) last.scrollIntoView({ block: 'nearest' });
  }
}

function deleteItem(id) {
  const it = itemById(id);
  if (!it) return;
  if (state.confirmDel !== id) {
    state.confirmDel = id;
    const btn = cardRow(id) && cardRow(id).querySelector('[data-act="del"]');
    if (btn) btn.textContent = 'Sure?';
    setTimeout(() => {
      if (state.confirmDel === id) {
        state.confirmDel = null;
        refreshCard(it);
      }
    }, 3000);
    return;
  }
  const items = state.menu.items;
  const index = items.findIndex((x) => x.id === id);
  if (index < 0) return;
  items.splice(index, 1);
  state.confirmDel = null;
  state.undo = { item: it, index };
  state.undoOffer = true;
  renderTab();
  saveDraft();
  setMsg(`Deleted ${it.name || 'dish'}.`);
}

function undoDelete() {
  if (!state.undo || !state.menu) return;
  const { item, index } = state.undo;
  state.menu.items.splice(Math.min(index, state.menu.items.length), 0, item);
  state.undo = null;
  state.undoOffer = false;
  renderTab();
  saveDraft();
  setMsg('');
}

function moveItem(id, dir) {
  const items = state.menu ? state.menu.items : [];
  const i = items.findIndex((x) => x.id === id);
  if (i < 0) return;
  // fine-tune inside the dish's own section: find the next item in the same
  // menu group (in either direction); a section-hopping edit is done via the
  // section select on the card instead.
  const slot = items[i].menu;
  const sameSlot = items.map((it, idx) => ({ it, idx })).filter(({ it }) => it.menu === slot);
  const pos = sameSlot.findIndex(({ it }) => it.id === id);
  const dest = sameSlot[dir === 'up' ? pos - 1 : pos + 1];
  if (!dest || dest.idx === i) return;
  const j = dest.idx;
  [items[i], items[j]] = [items[j], items[i]];
  renderTab();
  saveDraft();
}

function toggleSold(id) {
  const it = itemById(id);
  if (!it) return;
  it.soldOut = !it.soldOut;
  refreshCard(it);
  saveDraft();
}

/* ---------- events ---------- */

export async function init() {
  state.token = lread('menu.adminToken', null);
  rootEl = document.getElementById('app');
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = 'image/*';
  picker.setAttribute('data-id', 'photoPicker');
  picker.hidden = true;
  document.body.appendChild(picker);
  picker.addEventListener('change', async () => {
    const file = picker.files && picker.files[0];
    picker.value = '';
    if (!file || state.photoFor == null) return;
    const item = itemById(state.photoFor);
    state.photoFor = null;
    if (!item) return;
    setMsg('Uploading photo…');
    try {
      await uploadPhoto(file, item);
      refreshCard(item);
      setMsg('Photo added ✓ — press Save menu');
      saveDraft();
    } catch (err) {
      setMsg('Photo failed: ' + (err && err.message));
    }
  });
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('beforeunload', beforeUnload);
  }

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'dismissmsg') { setMsg(''); return; }
    if (!state.token) return;
    if (act === 'sort') {
      state.sortBy = btn.dataset.key;
      renderTab();
      return;
    }
    if (act === 'emopick') {
      state.emojiFor = btn.dataset.id;
      const it = itemById(btn.dataset.id);
      if (it) refreshCard(it);
      return;
    }
    if (act === 'emochoose') {
      const id = btn.dataset.id;
      const it = itemById(id);
      state.emojiFor = null;
      if (it) {
        if (!/^(\p{Extended_Pictographic}|\u20e3)+$/u.test(btn.dataset.emoji || '')) {
          setMsg('That does not look like an emoji — pick one from the grid');
          renderTab();
          return;
        }
        it.emoji = String(btn.dataset.emoji);
        refreshCard(it);
        saveDraft();
      }
      return;
    }
    if (act === 'emoclose') {
      state.emojiFor = null;
      renderTab();
      return;
    }
    if (act === 'logout') { await logout(); return; }
    if (act === 'tab') {
      if (state.tab !== btn.dataset.key) {
        state.tab = btn.dataset.key;
        const tabs = rootEl.querySelectorAll('.tab');
        tabs.forEach((t) => t.classList.toggle('on', t.dataset.key === state.tab));
        renderTab();
      }
      return;
    }
    if (act === 'additem') { addItem(); return; }
    if (act === 'del') { deleteItem(btn.dataset.id); return; }
    if (act === 'undo') { undoDelete(); return; }
    if (act === 'up' || act === 'down') { moveItem(btn.dataset.id, act); return; }
    if (act === 'sold') { toggleSold(btn.dataset.id); return; }
    if (act === 'photo') {
      const it = itemById(btn.dataset.id);
      if (it) {
        state.photoFor = it.id;
        picker.click();
      }
      return;
    }
    if (act === 'tables-inc' || act === 'tables-dec') {
      if (!state.menu) return;
      const d = act === 'tables-inc' ? 1 : -1;
      state.menu.tables = Math.min(40, Math.max(0, state.menu.tables + d));
      const val = rootEl.querySelector('#tablesVal');
      if (val) val.textContent = String(state.menu.tables);
      const dec = rootEl.querySelector('[data-act="tables-dec"]');
      const inc = rootEl.querySelector('[data-act="tables-inc"]');
      if (dec) { state.menu.tables <= 0 ? dec.setAttribute('disabled', '') : dec.removeAttribute('disabled'); }
      if (inc) { state.menu.tables >= 40 ? inc.setAttribute('disabled', '') : inc.removeAttribute('disabled'); }
      saveDraft();
      return;
    }
    if (act === 'save') { await save(); return; }
    if (act === 'reload-menu') {
      await loadMenu();
      renderTab();
      return;
    }
    if (act === 'draft-restore') {
      const d = readDraft();
      if (d && state.menu) {
        state.menu.tables = d.tables;
        state.menu.items = d.items;
        saveDraft();
        state.draftOffer = false;
        renderTab();
        setMsg('Draft restored — press Save menu when ready.');
      }
      return;
    }
    if (act === 'draft-discard') {
      clearDraft();
      setMsg('Draft discarded.');
      return;
    }
    if (act === 'conflict-overwrite') { await overwriteWithMine(); return; }
    if (act === 'conflict-discard') { await discardDraftAndReload(); return; }
    if (act === 'ordnext') {
      try {
        const res = await fetch(`${API}/v1/orders/status`, {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + state.token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: btn.dataset.id, status: btn.dataset.next }),
        });
        if (res.status === 401) { sessionExpired(); return; }
        if (res.ok) {
          await loadOrders();
          renderOrders();
        } else {
          setMsg('Could not update that order');
        }
      } catch (err) {
        setMsg('Can\'t reach the server');
      }
      return;
    }
  });

  document.addEventListener('input', (e) => {
    const el = e.target.closest && e.target.closest('.mi');
    if (!el) return;
    const item = itemById(el.dataset.mi);
    if (!item) return;
    const f = e.target.dataset.field;
    if (f === 'emoji') item.emoji = codepoints(e.target.value).slice(0, 8).join('');
    else if (f === 'name') item.name = e.target.value.slice(0, 40);
    else if (f === 'desc') item.desc = e.target.value.slice(0, 120);
    else if (f === 'price') {
      const digits = e.target.value.replace(/[^\d]/g, '').slice(0, 4);
      item.price = digits === '' ? 0 : Math.min(1000, parseInt(digits, 10));
    } else if (f === 'slot' && e.target.tagName === 'SELECT') {
      item.menu = e.target.value;
    }
    saveDraft();
  });

  document.addEventListener('focusout', (e) => {
    const el = e.target.closest ? e.target.closest('.mi') : null;
    if (!el) return;
    const item = itemById(el.dataset.mi);
    if (!item) return;
    const f = e.target.dataset && e.target.dataset.field;
    if (f === 'price') e.target.value = String(item.price);
    if (f === 'emoji') e.target.value = item.emoji || '';
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

  paint();
  if (state.token) {
    state.loading = true;
    paint();
    const okMenu = await loadMenu();
    await loadOrders();
    state.loading = false;
    paint();
    if (okMenu) schedulePoll();
  }
}
