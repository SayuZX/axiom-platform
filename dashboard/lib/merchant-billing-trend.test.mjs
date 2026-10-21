import assert from 'node:assert/strict';
import { billingTrendWindow } from './merchant-billing-trend.mjs';

// Catches UTC-day bucketing, dropped zero days, and inclusive upper bounds.
const before = billingTrendWindow(new Date('2024-02-29T16:59:59.999Z'));
assert.equal(before.trend.length, 30);
assert.deepEqual(before.trend[0], { date: '2024-01-31', amount: 0 });
assert.deepEqual(before.trend.at(-1), { date: '2024-02-29', amount: 0 });
assert.equal(before.start, '2024-01-30 17:00:00');
assert.equal(before.end, '2024-02-29 17:00:00');
assert.ok(before.trend.every(day => day.amount === 0));
assert.equal(new Set(before.trend.map(day => day.date)).size, 30);
const after = billingTrendWindow(new Date('2024-02-29T17:00:00.000Z'));
assert.deepEqual(after.trend[0], { date: '2024-02-01', amount: 0 });
assert.deepEqual(after.trend.at(-1), { date: '2024-03-01', amount: 0 });
assert.equal(after.start, '2024-01-31 17:00:00');
assert.equal(after.end, '2024-03-01 17:00:00');
const year = billingTrendWindow(new Date('2025-12-31T17:00:00.000Z'));
assert.deepEqual(year.trend.at(-1), { date: '2026-01-01', amount: 0 });
assert.equal(year.end, '2026-01-01 17:00:00');
console.log('Billing trend: WIB midnight, leap day, year boundary, zero filling passed.');
