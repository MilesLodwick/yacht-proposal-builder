import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { priceFor, matchingBoats, shortlistRow, validateBrief, buildSampleBriefs } from '../src/buyer.js';
import { importCSV } from '../src/yachts.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const forSale = importCSV('forSale', read('../data/for-sale.csv')).records;
const [sample] = buildSampleBriefs(JSON.parse(read('../data/sample-briefs.json')).briefs);

const testRates = { EUR: { perEur: 1 }, GBP: { perEur: 0.8 }, USD: { perEur: 1.25 } };
const noRates = { EUR: { perEur: 1 }, GBP: { perEur: null }, USD: { perEur: null } };

const boat = (id, fields) => ({ id, name: id, type: 'Sail', lengthM: 15, year: 2015, askingPrice: 500000, currency: 'EUR', ...fields });

test('prices are shown in the buyer\'s currency', () => {
  assert.equal(priceFor(boat('a', { currency: 'USD', askingPrice: 1250000 }), 'EUR', testRates), 1000000);
  assert.equal(priceFor(boat('a', { currency: 'USD' }), 'EUR', noRates), null);
  assert.equal(priceFor(boat('a', { askingPrice: null }), 'EUR', testRates), null);
});

test('matching: type, length range, earliest year and budget', () => {
  const brief = { currency: 'EUR', budget: 600000, type: 'Sail', minLength: 14, maxLength: 16, minYear: 2010 };
  const boats = [
    boat('ok'),
    boat('motor', { type: 'Motor' }),
    boat('short', { lengthM: 13.9 }),
    boat('long', { lengthM: 16.1 }),
    boat('old', { year: 2009 }),
    boat('dear', { askingPrice: 600001 }),
    boat('edge', { lengthM: 16, year: 2010, askingPrice: 600000 }),
  ];
  const { matches } = matchingBoats(boats, brief, testRates);
  assert.deepEqual(matches.map((m) => m.boat.id), ['ok', 'edge']); // cheapest first
});

test('boats missing a detail the brief needs are counted, not guessed', () => {
  const brief = { currency: 'EUR', budget: 600000, type: 'Sail', minLength: 14, maxLength: 16, minYear: 2010 };
  const boats = [boat('t', { type: null }), boat('l', { lengthM: null }), boat('y', { year: null }), boat('p', { currency: 'USD' })];
  const { matches, left } = matchingBoats(boats, brief, noRates);
  assert.equal(matches.length, 0);
  assert.deepEqual(left, { noPrice: 1, noLength: 1, noYear: 1, noType: 1 });
});

test('an open brief matches everything', () => {
  const { matches } = matchingBoats(forSale, { currency: 'USD' }, testRates);
  assert.equal(matches.length, forSale.length);
});

test('shortlist row: price, per metre and running costs in the buyer\'s currency', () => {
  const row = shortlistRow(boat('a', { currency: 'USD', askingPrice: 1250000, lengthM: 20 }), { currency: 'EUR', budget: 900000 }, testRates, 10);
  assert.deepEqual(
    { price: row.price, ppm: row.pricePerMetre, running: row.runningCost, over: row.overBudget, converted: row.converted },
    { price: 1000000, ppm: 50000, running: 100000, over: true, converted: true },
  );
});

test('shortlist row with an unconvertible price shows blanks, not guesses', () => {
  const row = shortlistRow(boat('a', { currency: 'USD' }), { currency: 'EUR' }, noRates, 10);
  assert.deepEqual([row.price, row.pricePerMetre, row.runningCost, row.overBudget], [null, null, null, false]);
});

test('the sample brief\'s shortlist all meet its brief', () => {
  const { matches } = matchingBoats(forSale, sample, testRates);
  for (const id of sample.boatIds) assert.ok(matches.some((m) => m.boat.id === id), `${id} does not match the sample brief`);
  assert.equal(sample.example, true);
});

test('brief checks: name needed, ranges in order, numbers positive', () => {
  assert.equal(validateBrief({ buyerName: 'A', currency: 'USD', budget: '800,000', minLength: '14', maxLength: '18' }).fields.budget, 800000);
  const bad = validateBrief({ buyerName: '', currency: 'USD', budget: '-1', minLength: '20', maxLength: '18', minYear: '1700' });
  assert.deepEqual(Object.keys(bad.errors).sort(), ['budget', 'buyerName', 'maxLength', 'minYear']);
});
