import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emptyBudget, readAmount, setAnnual, setActual, buildSampleBudget } from '../src/budget.js';
import { budgetReport, monthlyBudget, varianceTone, BUDGET_CATEGORIES } from '../src/calc/management.js';
import { roundMoney } from '../src/calc/charter.js';

const { budget: template } = JSON.parse(readFileSync(new URL('../data/sample-budget.json', import.meta.url), 'utf8'));

test('a new budget has every category, nothing budgeted and no actuals', () => {
  const b = emptyBudget('y1', 2027);
  assert.equal(b.id, 'budget-y1-2027');
  assert.deepEqual(b.categories.map((c) => c.id), BUDGET_CATEGORIES.map((c) => c.id));
  assert.ok(b.categories.every((c) => c.annual === 0 && c.actuals.every((a) => a === null)));
});

test('money boxes: blank is not entered, negatives and words are refused', () => {
  assert.deepEqual(readAmount(''), { ok: true, value: null });
  assert.deepEqual(readAmount('12,500.5'), { ok: true, value: 12500.5 });
  assert.deepEqual(readAmount('0'), { ok: true, value: 0 });
  assert.equal(readAmount('-1').ok, false);
  assert.equal(readAmount('lots').ok, false);
});

test('changing the annual budget keeps a seasonal shape and its total', () => {
  const b = { categories: [{ id: 'fuel', annual: 240000, monthly: [10000, 10000, 20000, 30000, 30000, 30000, 30000, 30000, 20000, 10000, 10000, 10000], actuals: [] }] };
  const doubled = setAnnual(b, 'fuel', 480000).categories[0];
  assert.equal(doubled.monthly[3], 60000);
  assert.equal(roundMoney(doubled.monthly.reduce((t, v) => t + v, 0)), 480000);
});

test('an even budget stays even when changed', () => {
  const b = setAnnual(emptyBudget('y1', 2027), 'crew', 1200000);
  const crew = b.categories.find((c) => c.id === 'crew');
  assert.equal(crew.monthly, null);
  assert.deepEqual(monthlyBudget(crew), Array(12).fill(100000));
});

test('entering a month\'s actual changes only that month and category', () => {
  const b = setActual(emptyBudget('y1', 2027), 'fuel', 3, 8500);
  assert.equal(b.categories.find((c) => c.id === 'fuel').actuals[2], 8500);
  assert.ok(b.categories.find((c) => c.id === 'crew').actuals.every((a) => a === null));
});

test('sample in November: this year, actuals to October', () => {
  const b = buildSampleBudget(template, '2026-11-17');
  assert.equal(b.year, 2026);
  assert.equal(b.example, true);
  const r = budgetReport(b.categories);
  assert.equal(r.throughLabel, 'Oct');
  assert.equal(r.totals.annual, 2270000);
});

test('sample in February: last year in full', () => {
  const b = buildSampleBudget(template, '2027-02-10');
  assert.equal(b.year, 2026);
  assert.equal(budgetReport(b.categories).through, 12);
});

test('sample story: the refit overran (red), fuel is a little over (amber), provisions under (green)', () => {
  const r = budgetReport(buildSampleBudget(template, '2026-11-17').categories);
  const tone = (id) => varianceTone(r.rows.find((x) => x.id === id).toDate, 5);
  assert.equal(tone('maintenance'), 'red');
  assert.equal(tone('fuel'), 'amber');
  assert.equal(tone('provisions'), 'green');
  const maintenance = r.rows.find((x) => x.id === 'maintenance');
  assert.equal(maintenance.budgetToDate, 430000);
  // 123,200 + 129,800 + 112,500 + 30,000 + 13,500 + 10,000 + 8,000 + 11,000 + 15,000 + 31,500
  assert.equal(maintenance.actualToDate, 484500);
  assert.deepEqual(maintenance.toDate, { amount: 54500, percent: 12.7 });
  assert.equal(maintenance.forecast, 554500); // 484,500 + 70,000 still budgeted for Nov and Dec
});
