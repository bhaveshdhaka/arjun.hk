// Pure menu logic — no DOM. Node-testable (tools/test-menu.mjs).

export const SLOTS = [
  { key: 'midnight', label: 'Midnight Snacks', emoji: '🌙', hours: '23:00 – 06:00' },
  { key: 'breakfast', label: 'Breakfast', emoji: '🥞', hours: '06:00 – 11:30' },
  { key: 'lunch', label: 'Lunch', emoji: '🍜', hours: '11:30 – 17:30' },
  { key: 'dinner', label: 'Dinner', emoji: '🍲', hours: '17:30 – 23:00' },
  { key: 'allday', label: 'All Day', emoji: '♾️', hours: 'always' },
];

const BOUNDS = { midnight: [0, 359], breakfast: [360, 689], lunch: [690, 1049], dinner: [1050, 1379], eveMidnight: [1380, 1439] };

export function slotFromMinutes(m) {
  for (const [key, [lo, hi]] of Object.entries(BOUNDS)) {
    if (m >= lo && m <= hi) return key === 'eveMidnight' ? 'midnight' : key;
  }
  return 'midnight';
}

const CHRONO = ['breakfast', 'lunch', 'dinner', 'midnight'];

// Reorder sections: the serving slot first, then the rest chronologically
// (wrapping past midnight), allday always last.
export function sectionOrder(current) {
  const i = CHRONO.indexOf(current);
  const rest = i < 0 ? [...CHRONO] : [...CHRONO.slice(i + 1), ...CHRONO.slice(0, i)];
  return [current, ...rest, 'allday'];
}

export function hkMinutes(date) {
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Hong_Kong', hour: '2-digit', minute: '2-digit', hour12: false });
    const [h, m] = fmt.format(date).split(':').map(Number);
    if (Number.isFinite(h) && Number.isFinite(m)) return h * 60 + m;
  } catch (e) { /* fall through */ }
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

export function currentSlot(date) {
  return slotFromMinutes(hkMinutes(date));
}

export const SLOT_ORDER = ['midnight', 'breakfast', 'lunch', 'dinner', 'allday'];

// ---- cart (plain object {itemId: qty}) ----

export function cartCount(cart) {
  return Object.values(cart).reduce((a, b) => a + b, 0);
}

export function cartTotal(cart, items) {
  const byId = items instanceof Map ? items : new Map((items || []).map((it) => [it.id, it]));
  let total = 0;
  for (const [id, qty] of Object.entries(cart)) {
    const it = byId.get(id);
    if (it) total += it.price * qty;
  }
  return total;
}

export function orderLines(cart, items) {
  const byId = items instanceof Map ? items : new Map((items || []).map((it) => [it.id, it]));
  const lines = [];
  for (const [id, qty] of Object.entries(cart)) {
    const it = byId.get(id);
    if (it && qty > 0) lines.push({ id, qty, name: it.name, price: it.price });
  }
  return lines;
}

export const PAY_METHODS = [
  { key: 'tappay', label: 'Tap / NFC' },
  { key: 'octopus', label: 'Octopus' },
  { key: 'visa', label: 'Visa' },
  { key: 'mastercard', label: 'Mastercard' },
  { key: 'cash', label: 'Cash 💵' },
];

export function payLabel(key) {
  const hit = PAY_METHODS.find((p) => p.key === key);
  return hit ? hit.label : key;
}

export const STATE_LABELS = { pending: '🆕 New', cooking: '🍳 Cooking', completed: '✓ Done' };
