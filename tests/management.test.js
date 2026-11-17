import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  expiryStatus, expiryCounts, BUDGET_CATEGORIES, monthlyBudget, reportedThrough,
  variance, varianceTone, categoryFigures, budgetReport,
} from '../src/calc/management.js';
import { roundMoney } from '../src/calc/charter.js';

const TODAY = '2026-11-17';
const { settings } = JSON.parse(readFileSync(new URL('../data/settings.json', import.meta.url), 'utf8'));
const setting = (id) => settings.find((s) => s.id === id).value;

// ---- Expiry status ---------------------------------------------------------

test('the thresholds come from settings: amber within 60 days, amber overspend up to 5%', () => {
  assert.equal(setting('alerts.expiryAmberDays'), 60);
  assert.equal(setting('alerts.budgetOverspendAmberPercent'), 5);
});

test('expired is red, within 60 days amber, otherwise green', () => {
  assert.deepEqual(expiryStatus('2026-11-16', TODAY, 60), { tone: 'red', text: 'Expired 16 Nov 2026', days: -1 });
  assert.deepEqual(expiryStatus('2026-11-17', TODAY, 60), { tone: 'amber', text: 'Expires today', days: 0 });
  assert.deepEqual(expiryStatus('2026-11-18', TODAY, 60), { tone: 'amber', text: 'Expires in 1 day', days: 1 });
  assert.deepEqual(expiryStatus('2027-01-16', TODAY, 60), { tone: 'amber', text: 'Expires in 60 days', days: 60 });
  assert.deepEqual(expiryStatus('2027-01-17', TODAY, 60), { tone: 'green', text: 'Valid until 17 Jan 2027', days: 61 });
});

test('a certificate is still valid on its expiry date', () => {
  assert.notEqual(expiryStatus(TODAY, TODAY, 60).tone, 'red');
});

test('no expiry date recorded is flagged amber to be checked', () => {
  assert.deepEqual(expiryStatus(null, TODAY, 60), { tone: 'amber', text: 'Expiry date not recorded', days: null });
});

test('the amber window follows the setting', () => {
  assert.equal(expiryStatus('2027-01-01', TODAY, 30).tone, 'green');
  assert.equal(expiryStatus('2027-01-01', TODAY, 60).tone, 'amber');
});

test('expiry counts', () => {
  assert.deepEqual(expiryCounts(['2026-01-01', '2026-12-01', '2028-01-01', null], TODAY, 60), { red: 1, amber: 2, green: 1 });
});

// ---- Budget ----------------------------------------------------------------

test('the seven budget categories from the brief', () => {
  assert.deepEqual(BUDGET_CATEGORIES.map((c) => c.label), ['Crew', 'Insurance', 'Berthing', 'Fuel', 'Maintenance and refit', 'Provisions', 'Admin and fees']);
});

test('an annual budget is spread evenly, the last month taking any rounding', () => {
  assert.deepEqual(monthlyBudget({ annual: 1200000 }), Array(12).fill(100000));
  const odd = monthlyBudget({ annual: 100000 });
  assert.equal(odd[0], 8333.33);
  assert.equal(odd[11], 8333.37);
  assert.equal(roundMoney(odd.reduce((a, b) => a + b, 0)), 100000);
});

test('a monthly split is used when given (e.g. fuel heavier in summer)', () => {
  const split = [10000, 10000, 20000, 30000, 30000, 30000, 30000, 30000, 20000, 10000, 10000, 10000];
  assert.deepEqual(monthlyBudget({ annual: 240000, monthly: split }), split);
});

test('reported through: the last month with any actual', () => {
  assert.equal(reportedThrough([{ actuals: [1, 2, 3] }, { actuals: [1, null, null, 4] }]), 4);
  assert.equal(reportedThrough([{ actuals: [] }]), 0);
});

test('variance: positive means overspent', () => {
  assert.deepEqual(variance(110000, 100000), { amount: 10000, percent: 10 });
  assert.deepEqual(variance(95000, 100000), { amount: -5000, percent: -5 });
  assert.deepEqual(variance(500, 0), { amount: 500, percent: null });
});

test('variance colour: on or under budget green, up to 5% over amber, beyond red', () => {
  assert.equal(varianceTone(variance(100000, 100000), 5), 'green');
  assert.equal(varianceTone(variance(90000, 100000), 5), 'green');
  assert.equal(varianceTone(variance(105000, 100000), 5), 'amber');
  assert.equal(varianceTone(variance(105100, 100000), 5), 'red');
  assert.equal(varianceTone(variance(500, 0), 5), 'red'); // spend with no budget
});

const crew = { id: 'crew', annual: 1200000, actuals: [98000, 102000, 105000] };
const fuel = {
  id: 'fuel', annual: 240000,
  monthly: [10000, 10000, 20000, 30000, 30000, 30000, 30000, 30000, 20000, 10000, 10000, 10000],
  actuals: [12000, 9000, 26000],
};

test('crew to March: 305,000 spent against 300,000 budgeted', () => {
  const f = categoryFigures(crew, 3);
  assert.equal(f.budgetToDate, 300000);
  assert.equal(f.actualToDate, 305000);
  assert.deepEqual(f.toDate, { amount: 5000, percent: 1.7 });
});

test('full-year forecast = actual so far + budget for the rest of the year', () => {
  const f = categoryFigures(crew, 3);
  assert.equal(f.forecast, 1205000); // 305,000 + 9 x 100,000
  assert.deepEqual(f.fullYear, { amount: 5000, percent: 0.4 });
});

test('fuel with a seasonal budget: 17.5% over to date', () => {
  const f = categoryFigures(fuel, 3);
  assert.equal(f.budgetToDate, 40000);
  assert.equal(f.actualToDate, 47000);
  assert.deepEqual(f.toDate, { amount: 7000, percent: 17.5 });
  assert.equal(f.forecast, 247000);
  assert.equal(varianceTone(f.toDate, 5), 'red');
});

test('a month with no actual inside the reported period is flagged', () => {
  const f = categoryFigures({ id: 'x', annual: 12000, actuals: [1000, null, 1000] }, 3);
  assert.deepEqual(f.missingMonths, ['Feb']);
});

test('report totals add up across categories', () => {
  const r = budgetReport([crew, fuel]);
  assert.equal(r.through, 3);
  assert.equal(r.throughLabel, 'Mar');
  assert.deepEqual(r.totals.annual, 1440000);
  assert.equal(r.totals.budgetToDate, 340000);
  assert.equal(r.totals.actualToDate, 352000);
  assert.equal(r.totals.forecast, 1452000);
  assert.deepEqual(r.totals.fullYear, { amount: 12000, percent: 0.8 });
});

test('nothing reported yet: forecast equals budget', () => {
  const r = budgetReport([{ id: 'crew', annual: 1200000, actuals: [] }]);
  assert.equal(r.through, 0);
  assert.equal(r.totals.forecast, 1200000);
  assert.equal(r.totals.fullYear.amount, 0);
});
