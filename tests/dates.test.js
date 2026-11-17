import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDate, formatDate, daysBetween, addDays, isWeekend, addBankingDays } from '../src/calc/dates.js';

test('formatDate shows dates as 17 Nov 2026', () => {
  assert.equal(formatDate('2026-11-17'), '17 Nov 2026');
  assert.equal(formatDate('2027-01-05'), '5 Jan 2027');
  assert.equal(formatDate('2027-09-01'), '1 Sep 2027');
});

test('formatDate shows "Not set" for empty or invalid dates', () => {
  assert.equal(formatDate(''), 'Not set');
  assert.equal(formatDate(null), 'Not set');
  assert.equal(formatDate('17/11/2026'), 'Not set');
});

test('parseDate rejects dates that do not exist', () => {
  assert.equal(parseDate('2026-02-30'), null);
  assert.equal(parseDate('2026-13-01'), null);
  assert.ok(parseDate('2028-02-29')); // leap year
});

test('daysBetween counts whole days', () => {
  assert.equal(daysBetween('2026-11-17', '2026-11-24'), 7);
  assert.equal(daysBetween('2026-11-24', '2026-11-17'), -7);
  assert.equal(daysBetween('2026-11-17', '2026-11-17'), 0);
});

test('daysBetween is not thrown off by clocks changing', () => {
  // UK clocks go back on 25 Oct 2026; it must still be exactly 7 days.
  assert.equal(daysBetween('2026-10-22', '2026-10-29'), 7);
});

test('addDays works forwards, backwards and across months and years', () => {
  assert.equal(addDays('2026-11-17', 7), '2026-11-24');
  assert.equal(addDays('2027-07-10', -30), '2027-06-10');
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
});

test('isWeekend spots Saturdays and Sundays', () => {
  assert.equal(isWeekend('2026-11-21'), true);  // Saturday
  assert.equal(isWeekend('2026-11-22'), true);  // Sunday
  assert.equal(isWeekend('2026-11-23'), false); // Monday
});

test('addBankingDays skips weekends (MOA deposit deadline)', () => {
  // Signed Tuesday 17 Nov: 4 banking days later is Monday 23 Nov.
  assert.equal(addBankingDays('2026-11-17', 4), '2026-11-23');
  // Signed Friday 20 Nov: 4 banking days later is Thursday 26 Nov.
  assert.equal(addBankingDays('2026-11-20', 4), '2026-11-26');
  // Signed Saturday 21 Nov: counting starts Monday, so Thursday 26 Nov.
  assert.equal(addBankingDays('2026-11-21', 4), '2026-11-26');
});
