import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  SLOTS, slotFromMinutes, hkMinutes, currentSlot, sectionOrder,
  cartCount, cartTotal, orderLines, payLabel, PAY_METHODS, STATE_LABELS,
} from '../games/menu/js/clock.js';
import { readFileSync } from 'node:fs';

test('slot boundaries exact', () => {
  assert.equal(slotFromMinutes(0), 'midnight');
  assert.equal(slotFromMinutes(359), 'midnight');
  assert.equal(slotFromMinutes(360), 'breakfast');
  assert.equal(slotFromMinutes(689), 'breakfast');
  assert.equal(slotFromMinutes(690), 'lunch');
  assert.equal(slotFromMinutes(1049), 'lunch');
  assert.equal(slotFromMinutes(1050), 'dinner');
  assert.equal(slotFromMinutes(1379), 'dinner');
  assert.equal(slotFromMinutes(1380), 'midnight');
  assert.equal(slotFromMinutes(1439), 'midnight');
});

test('every slot reachable from clock config', () => {
  const found = new Set(
    Array.from({ length: 1440 }, (_, m) => slotFromMinutes(m)),
  );
  assert.deepEqual([...found].sort(), ['breakfast', 'dinner', 'lunch', 'midnight']);
});

test(' hkMinutes uses Asia/Hong_Kong', () => {
  // 12:00 UTC on 2026-01-01 = 20:00 HK
  const d = new Date(Date.UTC(2026, 0, 1, 12, 0, 0));
  assert.equal(hkMinutes(d), 20 * 60);
  assert.equal(currentSlot(d), 'dinner');
  // 16:30 UTC = 00:30 HK next day -> midnight
  const d2 = new Date(Date.UTC(2026, 0, 1, 16, 30, 0));
  assert.equal(hkMinutes(d2), 30);
  assert.equal(currentSlot(d2), 'midnight');
  // 22:30 HK = late dinner
  const d3 = new Date(Date.UTC(2026, 5, 15, 14, 30, 0));
  assert.equal(hkMinutes(d3), 22 * 60 + 30);
  assert.equal(currentSlot(d3), 'dinner');
});

test('sectionOrder puts current first, allday last', () => {
  assert.deepEqual(sectionOrder('breakfast'), ['breakfast', 'lunch', 'dinner', 'midnight', 'allday']);
  assert.deepEqual(sectionOrder('dinner'), ['dinner', 'midnight', 'breakfast', 'lunch', 'allday']);
  assert.deepEqual(sectionOrder('midnight'), ['midnight', 'breakfast', 'lunch', 'dinner', 'allday']);
});

test('cart math', () => {
  const items = [{ id: 'a', price: 13 }, { id: 'b', price: 20 }];
  const cart = { a: 2, b: 1 };
  assert.equal(cartCount(cart), 3);
  assert.equal(cartTotal(cart, items), 46);
});

test('orderLines shapes + skips empty', () => {
  const items = [{ id: 'a', name: 'Cheese', price: 13 }, { id: 'b', name: 'Bagel', price: 20 }];
  assert.deepEqual(orderLines({ a: 2 }, items), [{ id: 'a', qty: 2, name: 'Cheese', price: 13 }]);
  assert.deepEqual(orderLines({ b: 1, a: 0 }, items), [{ id: 'b', qty: 1, name: 'Bagel', price: 20 }]);
  assert.deepEqual(orderLines({}, items), []);
  assert.equal(cartTotal({ zzz: 2 }, items), 0); // unknown id ignored
});

test('pay labels resolve', () => {
  assert.equal(payLabel('octopus'), 'Octopus');
  assert.equal(payLabel('cash'), 'Cash 💵');
  assert.equal(payLabel('mystery'), 'mystery');
});

test('PAY_METHODS covers name labels', () => {
  for (const p of PAY_METHODS) assert.ok(p.key && p.label, `${p}`);
});

test('STATE_LABELS complete for status flow', () => {
  assert.deepEqual(Object.keys(STATE_LABELS), ['pending', 'cooking', 'completed']);
});

test('SLOTS config covers five sections', () => {
  assert.equal(SLOTS.length, 5);
  assert.ok(SLOTS.every((s) => s.key && s.label && s.hours));
});

test('clock.js + menu.js stay node-safe (no top-level DOM)', () => {
  const clock = readFileSync(new URL('../games/menu/js/clock.js', import.meta.url), 'utf8');
  assert.ok(!/document\.|window\./.test(clock), 'clock.js must be DOM-free');
});
