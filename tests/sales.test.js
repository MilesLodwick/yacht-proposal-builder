import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ASKING_NOT_SOLD, salesSettings, pricePerMetre, runningCostEstimate, median,
  findComparables, priceStats, pricePosition, moaDeposit,
} from '../src/calc/sales.js';
import { importCSV } from '../src/yachts.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const { settings } = JSON.parse(read('../data/settings.json'));
const forSale = importCSV('forSale', read('../data/for-sale.csv')).records;
const s = salesSettings(settings);
const ranges = { lengthPercent: s.compLengthPercent, years: s.compYears };

const testRates = { EUR: { perEur: 1 }, GBP: { perEur: 0.8 }, USD: { perEur: 1.25 } };
const noRates = { EUR: { perEur: 1 }, GBP: { perEur: null }, USD: { perEur: null } };

// ---- Settings --------------------------------------------------------------

test('sales settings come from settings.json', () => {
  assert.deepEqual(s, { depositPercent: 10, depositBankingDays: 4, runningCostPercent: 10, compLengthPercent: 15, compYears: 7 });
});

test('the asking-price label is exact', () => {
  assert.equal(ASKING_NOT_SOLD, 'Asking prices, not sold prices.');
});

// ---- Price per metre and running costs -------------------------------------

test('price per metre', () => {
  assert.equal(pricePerMetre(3000000, 30), 100000);
  assert.equal(pricePerMetre(1000000, 14.5), 68965.52);
  assert.equal(pricePerMetre(null, 14.5), null);
  assert.equal(pricePerMetre(1000000, null), null);
});

test('running cost estimate: 10% of value a year by default', () => {
  assert.equal(runningCostEstimate(3000000, s.runningCostPercent), 300000);
  assert.equal(runningCostEstimate(3000000, 8), 240000);
  assert.equal(runningCostEstimate(null, 10), null);
});

// ---- Median ----------------------------------------------------------------

test('median: middle value, or the average of the two middle values', () => {
  assert.equal(median([1, 5, 3]), 3);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([7]), 7);
  assert.equal(median([]), null);
});

// ---- Comparables -----------------------------------------------------------

const boat = (id, fields) => ({ id, name: id, type: 'Sail', lengthM: 15, year: 2015, askingPrice: 750000, currency: 'EUR', ...fields });
const subject = boat('subject', { lengthM: 15, year: 2015, askingPrice: 900000 });

test('comparables: same type, length within 15%, built within 7 years', () => {
  const listings = [
    subject,
    boat('ok'),
    boat('motor', { type: 'Motor' }),
    boat('too-long', { lengthM: 17.3 }),   // 15.3% longer
    boat('long-ok', { lengthM: 17.25 }),   // exactly 15% longer
    boat('too-old', { year: 2007 }),       // 8 years older
    boat('old-ok', { year: 2008 }),        // exactly 7 years older
  ];
  const { comparables } = findComparables(subject, listings, ranges, testRates);
  assert.deepEqual(comparables.map((c) => c.id).sort(), ['long-ok', 'ok', 'old-ok']);
});

test('the subject boat is never its own comparable', () => {
  const { comparables } = findComparables(subject, [subject], ranges, testRates);
  assert.equal(comparables.length, 0);
});

test('boats with missing details are counted, not guessed', () => {
  const listings = [
    boat('no-type', { type: null }),
    boat('no-length', { lengthM: null }),
    boat('no-year', { year: null }),
    boat('poa', { askingPrice: null, currency: null }),
    boat('usd', { currency: 'USD' }),
  ];
  const { comparables, excluded } = findComparables(subject, listings, ranges, noRates);
  assert.equal(comparables.length, 0);
  assert.deepEqual(excluded, { noPrice: 1, noLength: 1, noYear: 1, noType: 1, noRate: 1 });
});

test('prices in another currency are converted before comparing', () => {
  const { comparables } = findComparables(subject, [boat('usd', { currency: 'USD', askingPrice: 1250000 })], ranges, testRates);
  assert.equal(comparables[0].priceInSubjectCurrency, 1000000); // USD 1,250,000 at 1.25
  assert.equal(comparables[0].pricePerMetre, 66666.67);
});

test('comparables are sorted cheapest per metre first', () => {
  const listings = [boat('a', { askingPrice: 900000 }), boat('b', { askingPrice: 600000 }), boat('c', { askingPrice: 750000 })];
  const { comparables } = findComparables(subject, listings, ranges, testRates);
  assert.deepEqual(comparables.map((c) => c.id), ['b', 'c', 'a']);
});

test('the ranges follow the settings', () => {
  const listings = [boat('long', { lengthM: 17.25 })];
  assert.equal(findComparables(subject, listings, { lengthPercent: 10, years: 7 }, testRates).comparables.length, 0);
});

// ---- Stats and position ----------------------------------------------------

const three = [boat('a', { askingPrice: 600000 }), boat('b', { askingPrice: 750000 }), boat('c', { askingPrice: 900000 })];
const comps = findComparables(subject, three, ranges, testRates).comparables; // 40,000 / 50,000 / 60,000 a metre

test('price stats: median, lowest and highest per metre', () => {
  assert.deepEqual(priceStats(comps), { count: 3, median: 50000, min: 40000, max: 60000 });
  assert.deepEqual(priceStats([]), { count: 0, median: null, min: null, max: null });
});

test('where the asking price sits against the comparables', () => {
  assert.deepEqual(pricePosition(60000, comps), { vsMedian: 20, cheaper: 2, of: 3, text: '20% above the median' });
  assert.deepEqual(pricePosition(45000, comps), { vsMedian: -10, cheaper: 1, of: 3, text: '10% below the median' });
  assert.equal(pricePosition(50000, comps).text, 'at the median');
  assert.equal(pricePosition(50000, []), null);
});

// ---- MOA deposit -----------------------------------------------------------

test('MOA deposit: 10% within 4 banking days of signing', () => {
  // Signed Tuesday 17 Nov 2026: 4 banking days later is Monday 23 Nov.
  assert.deepEqual(moaDeposit(2500000, '2026-11-17', s), { amount: 250000, balance: 2250000, dueDate: '2026-11-23' });
  // Signed on a Friday: the weekend does not count.
  assert.equal(moaDeposit(2500000, '2026-11-20', s).dueDate, '2026-11-26');
});

test('MOA deposit follows the settings', () => {
  assert.deepEqual(moaDeposit(1000000, '2026-11-17', { depositPercent: 5, depositBankingDays: 2 }), { amount: 50000, balance: 950000, dueDate: '2026-11-19' });
});

// ---- The real "For sale" sheet --------------------------------------------

test('real sheet: every comparable found meets every rule', () => {
  const swan = forSale.find((b) => b.name === 'Nautor Swan 48' && b.year === 2019); // 14.7 m, 2019, sail, USD
  const { comparables } = findComparables(swan, forSale, ranges, testRates);
  assert.ok(comparables.length > 0);
  for (const c of comparables) {
    assert.equal(c.type, 'Sail');
    assert.ok(Math.abs(c.lengthM - 14.7) <= 14.7 * 0.15 + 1e-9, `${c.name} length ${c.lengthM}`);
    assert.ok(Math.abs(c.year - 2019) <= 7, `${c.name} year ${c.year}`);
  }
});

test('real sheet: Ancasta boats have no length or currency, so they are counted out', () => {
  const nimbus = forSale.find((b) => b.name === 'Nimbus T9'); // a Berthon motor boat, 9.3 m, 2021
  const { excluded } = findComparables(nimbus, forSale, ranges, testRates);
  assert.ok(excluded.noLength > 0); // Ancasta motor boats near the right age
});
