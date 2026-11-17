import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lastDayOf, monthLabel, reportMonths, monthlyReport } from '../src/monthly.js';
import { buildSampleManaged } from '../src/compliance.js';
import { buildSampleCrew } from '../src/crew.js';
import { buildSampleBudget } from '../src/budget.js';

const TODAY = '2026-11-17';
const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const managed = buildSampleManaged(read('../data/sample-managed.json'), TODAY);
const crew = buildSampleCrew(read('../data/sample-crew.json').crew, TODAY);
const budget = buildSampleBudget(read('../data/sample-budget.json').budget, TODAY);

const report = (month) => monthlyReport({
  items: managed.items, crew, budget, month, today: TODAY, amberDays: 60, budgetAmberPercent: 5,
});

test('month helpers', () => {
  assert.equal(lastDayOf('2026-10'), '2026-10-31');
  assert.equal(lastDayOf('2028-02'), '2028-02-29');
  assert.equal(lastDayOf('2026-12'), '2026-12-31');
  assert.equal(monthLabel('2026-10'), 'October 2026');
});

test('months offered: the last 12, defaulting to last month', () => {
  const { months, defaultMonth } = reportMonths(TODAY);
  assert.equal(months.length, 12);
  assert.equal(months[0], '2026-11');
  assert.equal(defaultMonth, '2026-10');
  assert.equal(months[11], '2025-12');
});

test('a past month is reported as at its last day; the current month as at today', () => {
  assert.equal(report('2026-10').asAt, '2026-10-31');
  assert.equal(report('2026-11').asAt, TODAY);
});

test('October: compliance as at 31 Oct (the drill review was not yet overdue)', () => {
  const r = report('2026-10');
  // The drill review is due 11 Nov, so on 31 Oct it was due soon, not overdue.
  assert.equal(r.compliance.expired.length, 0);
  assert.ok(r.compliance.dueSoon.some((i) => i.title === 'Ship security drill record review'));
});

test('November so far: the overdue drill review and the expired ENG1 lead the key points', () => {
  const r = report('2026-11');
  assert.equal(r.keyPoints[0].tone, 'red');
  assert.match(r.keyPoints[0].text, /^1 compliance item overdue or expired: Ship security drill record review\.$/);
  assert.ok(r.keyPoints.some((k) => k.tone === 'red' && /Crew certificates expired: Piet de Wit \(ENG1\)/.test(k.text)));
});

test('October budget: month figures, year to date and the main overspend', () => {
  const r = report('2026-10');
  assert.equal(r.money.missing.length, 0);
  const maintenance = r.money.rows.find((x) => x.id === 'maintenance');
  assert.equal(maintenance.monthBudget, 30000);
  assert.equal(maintenance.monthActual, 31500);
  assert.deepEqual(maintenance.month, { amount: 1500, percent: 5 });
  const point = r.keyPoints.find((k) => /over budget for the year to end of October/.test(k.text));
  assert.match(point.text, /mainly maintenance and refit \(€54,500 over\)/);
  assert.equal(point.tone, 'amber'); // 3.5% over in total is within the 5% amber band
});

test('November: spend not entered yet is a key point, not a zero', () => {
  const r = report('2026-11');
  assert.equal(r.money.missing.length, 7);
  assert.ok(r.keyPoints.some((k) => k.text.startsWith('Spend for November 2026 not yet entered')));
});

test('November: with November not entered, year to date stops at October (no false "under budget")', () => {
  const r = report('2026-11');
  assert.equal(r.money.ytdThrough, 10);
  assert.equal(r.money.totals.toDate.amount, report('2026-10').money.totals.toDate.amount);
  const point = r.keyPoints.find((k) => /budget for the year/.test(k.text));
  assert.match(point.text, /over budget for the year to end of October/);
  assert.ok(!r.keyPoints.some((k) => /under budget/.test(k.text)));
});

test('key points are ordered red, amber, green', () => {
  const tones = report('2026-11').keyPoints.map((k) => k.tone);
  assert.deepEqual(tones, [...tones].sort((a, b) => ['red', 'amber', 'green'].indexOf(a) - ['red', 'amber', 'green'].indexOf(b)));
  assert.equal(tones[0], 'red');
});

test('a month in a year with no budget has no money section', () => {
  const r = monthlyReport({ items: [], crew: [], budget, month: '2025-12', today: TODAY, amberDays: 60, budgetAmberPercent: 5 });
  assert.equal(r.money, null);
  assert.deepEqual(r.keyPoints, [{ tone: 'green', text: 'No compliance or crew certificate issues.' }]);
});

test('October key points: compliance due, crew renewals due, and the budget', () => {
  const r = report('2026-10');
  assert.deepEqual(r.keyPoints.map((k) => k.tone), ['amber', 'amber', 'amber']);
  // As at 31 Oct: Ana's STCW (48 days), Piet's ENG1 (12), Sam's missing ENG1, Marco's ENG1 (32).
  assert.equal(r.keyPoints[1].text, '4 crew certificates due for renewal within 60 days or not yet recorded.');
});

test('crew actions list expired certificates first', () => {
  const r = report('2026-11');
  assert.equal(r.crew.actions[0].tone, 'red');
  assert.equal(r.crew.actions[0].name, 'Piet de Wit');
  assert.ok(r.crew.actions.some((a) => a.text === 'ENG1 not recorded'));
});
