// The dashboard is built from all the sample data, as a first visitor
// would see it on 17 Nov 2026 at noon.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { todoList, pipelines, todayHeading } from '../src/dashboard.js';
import { importCSV } from '../src/yachts.js';
import { ratesFromSettings } from '../src/calc/currency.js';
import { buildSamples } from '../src/enquiries.js';
import { buildSampleAvailability } from '../src/calc/availability.js';
import { buildSampleContracts } from '../src/contracts.js';
import { buildSampleManaged } from '../src/compliance.js';
import { buildSampleCrew } from '../src/crew.js';
import { buildSampleDeals } from '../src/deals.js';

const TODAY = '2026-11-17';
const NOW = '2026-11-17T12:00';
const text = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const json = (path) => JSON.parse(text(path));
const { settings } = json('../data/settings.json');
const managed = buildSampleManaged(json('../data/sample-managed.json'), TODAY);

const data = {
  yachts: importCSV('yachts', text('../data/yachts.csv')).records,
  forSale: importCSV('forSale', text('../data/for-sale.csv')).records,
  enquiries: buildSamples(json('../data/sample-enquiries.json').enquiries, TODAY),
  availability: buildSampleAvailability(json('../data/sample-availability.json').entries, TODAY),
  contracts: buildSampleContracts(json('../data/sample-contracts.json').contracts, TODAY),
  managedYachts: managed.yachts,
  compliance: managed.items,
  crew: buildSampleCrew(json('../data/sample-crew.json').crew, TODAY),
  deals: buildSampleDeals(json('../data/sample-deals.json').deals, TODAY),
};
const todo = todoList({ data, settings, rates: ratesFromSettings(settings), today: TODAY, now: NOW });
const find = (pattern) => todo.filter((t) => pattern.test(t.text));

test('the heading shows the day and date', () => {
  assert.equal(todayHeading(TODAY), 'Tuesday 17 Nov 2026');
});

test('red items come before amber ones', () => {
  const firstAmber = todo.findIndex((t) => t.tone === 'amber');
  assert.ok(firstAmber > 0);
  assert.ok(todo.slice(firstAmber).every((t) => t.tone === 'amber'));
});

test('1. enquiries not answered within 24 hours', () => {
  // Lena Hartmann wrote 2 days ago at 16:05 (43 hours by noon today); the
  // Ashworths wrote this morning, so they are not overdue yet.
  assert.deepEqual(find(/^Reply to/).map((t) => t.text), ['Reply to Lena Hartmann: enquiry waiting 43 hours.']);
});

test('2. options expiring, expired, and calendar clashes', () => {
  assert.equal(find(/option on Te Manu for Kowalski: expired/).length, 1);
  assert.equal(find(/option on SANTOSHA for Marchetti party: expires in 2 days/).length, 1);
  assert.equal(find(/option on Aeterna for Corvel Partners: expires in 1 day/).length, 1);
  assert.equal(find(/Dakota: Two bookings overlap: Nakamura and Petrov/).length, 1);
  assert.equal(find(/SANTOSHA: Owner use clashes/).length, 1);
});

test('3. payments due: the Ruiz balance and APA in 6 days', () => {
  const ruiz = find(/^Sofia and Mateo Ruiz/).map((t) => t.text);
  assert.deepEqual(ruiz, [
    'Sofia and Mateo Ruiz: balance of €98,000 on Te Manu, due in 6 days.',
    'Sofia and Mateo Ruiz: APA of €58,800 on Te Manu, due in 6 days.',
  ]);
  // The sample sale deposit was received, so it is not on the list.
  assert.equal(find(/Sale deposit/).length, 0);
});

test('4. certificates: the overdue drill review, the expired ENG1 and those due soon', () => {
  assert.equal(find(/Ship security drill record review, overdue since/).length, 1);
  assert.equal(find(/^Piet de Wit \(Chief Engineer\): ENG1, expired/).length, 1);
  assert.equal(find(/^Sam Okafor \(Deckhand\): ENG1 not recorded/).length, 1);
  assert.equal(find(/P&I cover, expires in 12 days/).length, 1);
});

test('every item links to the screen where it is dealt with', () => {
  assert.ok(todo.every((t) => /^#\/[a-z-]+\/[\w-]+$/.test(t.link)));
});

test('pipelines: enquiries, listings, deals and yacht management', () => {
  const p = pipelines(data, settings, TODAY);
  assert.equal(p.charter.total, 10);
  // Two New enquiries (Ashworth, Hartmann), then one sample at each other stage.
  assert.deepEqual(p.charter.counts.map((c) => c.count), [2, 1, 1, 1, 1, 1, 1, 1, 1]);
  assert.deepEqual(p.sales.counts.map((c) => c.count), [134, 0, 0, 0]);
  assert.deepEqual(p.deals.counts, [{ status: 'Next: Survey', count: 1 }]);
  assert.deepEqual(p.management.compliance, { red: 1, amber: 4, green: 5 });
  assert.deepEqual(p.management.crew, { red: 1, amber: 4, green: 3 });
});

test('an empty app has an empty to-do list', () => {
  const empty = { yachts: [], forSale: [], enquiries: [], availability: [], contracts: [], managedYachts: [], compliance: [], crew: [], deals: [] };
  assert.deepEqual(todoList({ data: empty, settings, rates: ratesFromSettings(settings), today: TODAY, now: NOW }), []);
});
