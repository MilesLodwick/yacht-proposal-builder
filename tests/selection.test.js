import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  REGIONS, REGION_FOR_COUNTRY, matchesRegion, yachtType, rateSeason, seasonForDate,
  filterYachts, quoteYacht, sortQuotes,
} from '../src/selection.js';
import { importCSV } from '../src/yachts.js';
import { ratesFromSettings } from '../src/calc/currency.js';
import { EMBARKATION_COUNTRIES } from '../src/calc/charter.js';

const { settings } = JSON.parse(readFileSync(new URL('../data/settings.json', import.meta.url), 'utf8'));
const realYachts = importCSV('yachts', readFileSync(new URL('../data/yachts.csv', import.meta.url), 'utf8')).records;

const noRates = ratesFromSettings(settings); // GBP and USD not set yet
const testRates = { EUR: { perEur: 1 }, GBP: { perEur: 0.8, dateChecked: '2026-11-17' }, USD: { perEur: 1.25, dateChecked: '2026-11-17' } };

const yacht = (fields) => ({ id: 'x', name: 'Test', guests: 12, rateFromWeekly: 350000, currency: 'EUR', cruisingArea: null, notes: null, ...fields });

const italyCharter = {
  days: 7, countryId: 'italy', greekEligible: false, budget: 600000, budgetCurrency: 'EUR',
  displayCurrency: 'EUR', startDate: '2027-07-07',
};

// ---- Regions ---------------------------------------------------------------

test('regions read the free-text cruising areas from the sheet', () => {
  assert.equal(matchesRegion(yacht({ cruisingArea: 'West Med and Turkey' }), 'west-med'), true);
  assert.equal(matchesRegion(yacht({ cruisingArea: 'West Med and Turkey' }), 'turkey'), true);
  assert.equal(matchesRegion(yacht({ cruisingArea: 'Med: Amalfi Coast, Sicily' }), 'italy'), true);
  assert.equal(matchesRegion(yacht({ cruisingArea: 'Rhodes, Greece' }), 'greece'), true);
  assert.equal(matchesRegion(yacht({ cruisingArea: 'Mallorca' }), 'spain'), true);
  assert.equal(matchesRegion(yacht({ cruisingArea: 'Caribbean & Bahamas (winter)' }), 'bahamas'), true);
});

test('a yacht listed just as "Mediterranean" counts for every Med region', () => {
  const med = yacht({ cruisingArea: 'Mediterranean & Caribbean' });
  for (const id of ['west-med', 'east-med', 'italy', 'greece', 'croatia']) assert.equal(matchesRegion(med, id), true, id);
  assert.equal(matchesRegion(med, 'caribbean'), true);
  assert.equal(matchesRegion(med, 'pacific'), false);
});

test('"East Mediterranean" does not count as the West Med, and the other way round', () => {
  assert.equal(matchesRegion(yacht({ cruisingArea: 'East Mediterranean' }), 'west-med'), false);
  assert.equal(matchesRegion(yacht({ cruisingArea: 'East Mediterranean' }), 'east-med'), true);
  assert.equal(matchesRegion(yacht({ cruisingArea: 'West Mediterranean' }), 'east-med'), false);
});

test('a blank cruising area is "not stated", not a match or a miss', () => {
  assert.equal(matchesRegion(yacht({ cruisingArea: null }), 'greece'), null);
  assert.equal(matchesRegion(yacht({ cruisingArea: null }), null), true); // no region chosen
});

test('every embarkation country has a region, and every region exists', () => {
  for (const c of EMBARKATION_COUNTRIES) {
    assert.ok(REGIONS.some((r) => r.id === REGION_FOR_COUNTRY[c.id]), c.id);
  }
});

// ---- Type and season -------------------------------------------------------

test('type comes from the notes only, otherwise not stated', () => {
  assert.equal(yachtType(yacht({ notes: 'Rate on request. Sailing yacht' })), 'Sail');
  assert.equal(yachtType(yacht({ notes: 'Classic motor yacht' })), 'Motor');
  assert.equal(yachtType(yacht({ notes: 'Refit 2025' })), null);
});

test('rate season comes from the notes or area, otherwise not stated', () => {
  assert.equal(rateSeason(yacht({ notes: 'Winter rate. Refit 2024' })), 'Winter');
  assert.equal(rateSeason(yacht({ cruisingArea: 'Bahamas (winter)' })), 'Winter');
  assert.equal(rateSeason(yacht({ notes: 'Refit 2025' })), null);
});

test('season from the start date: May to October is summer', () => {
  assert.equal(seasonForDate('2027-05-01'), 'Summer');
  assert.equal(seasonForDate('2027-10-31'), 'Summer');
  assert.equal(seasonForDate('2027-11-01'), 'Winter');
  assert.equal(seasonForDate('2027-04-30'), 'Winter');
});

// ---- Filtering -------------------------------------------------------------

test('guests filter keeps yachts that take at least that many', () => {
  const list = [yacht({ id: 'a', guests: 8 }), yacht({ id: 'b', guests: 12 }), yacht({ id: 'c', guests: null })];
  const result = filterYachts(list, { guests: 10 });
  assert.deepEqual(result.map((r) => r.yacht.id), ['b', 'c']);
  assert.deepEqual(result[1].notStated, ['guests']);
});

test('"not stated" yachts can be hidden', () => {
  const list = [yacht({ id: 'a', cruisingArea: 'Greece' }), yacht({ id: 'b', cruisingArea: null })];
  assert.equal(filterYachts(list, { regionId: 'greece', includeNotStated: true }).length, 2);
  assert.deepEqual(filterYachts(list, { regionId: 'greece', includeNotStated: false }).map((r) => r.yacht.id), ['a']);
});

test('type filter keeps matching types and labels unknown ones', () => {
  const list = [yacht({ id: 's', notes: 'Sailing yacht' }), yacht({ id: 'm', notes: 'Classic motor yacht' }), yacht({ id: 'u' })];
  const sail = filterYachts(list, { type: 'Sail' });
  assert.deepEqual(sail.map((r) => r.yacht.id), ['s', 'u']);
  assert.deepEqual(sail[1].notStated, ['type']);
});

test('the real sheet: Greece for 8 guests gives listed matches plus not-stated ones', () => {
  const all = filterYachts(realYachts, { guests: 8, regionId: 'greece', includeNotStated: true });
  const stated = filterYachts(realYachts, { guests: 8, regionId: 'greece', includeNotStated: false });
  assert.ok(stated.length > 0);
  assert.ok(all.length > stated.length);
  assert.ok(stated.every((r) => r.notStated.length === 0));
});

// ---- Quoting ---------------------------------------------------------------

test('quote: Italy, 7 days, EUR 350,000 a week, within a EUR 600,000 budget', () => {
  const q = quoteYacht(yacht({}), italyCharter, settings, noRates);
  assert.equal(q.ok, true);
  assert.equal(q.options.length, 1);
  assert.equal(q.options[0].breakdown.total, 532000); // 350,000 + 77,000 VAT + 105,000 APA
  assert.equal(q.options[0].displayTotal, 532000);
  assert.equal(q.band.id, 'within');
});

test('quote includes the delivery fee and its VAT', () => {
  const q = quoteYacht(yacht({}), italyCharter, settings, noRates, { deliveryFee: 10000 });
  assert.equal(q.options[0].breakdown.vat, 79200);
  assert.equal(q.options[0].breakdown.total, 544200);
});

test('rate on enquiry cannot be quoted', () => {
  const q = quoteYacht(yacht({ rateFromWeekly: null, currency: null }), italyCharter, settings, noRates);
  assert.deepEqual(q, { ok: false, reason: 'Rate on enquiry' });
});

test('a USD yacht against a EUR budget needs a USD rate first', () => {
  const usd = yacht({ rateFromWeekly: 400000, currency: 'USD' });
  const without = quoteYacht(usd, italyCharter, settings, noRates);
  assert.equal(without.band, null);
  assert.match(without.bandNote, /USD rate/);
  assert.equal(without.options[0].displayTotal, null);

  const withRates = quoteYacht(usd, italyCharter, settings, testRates);
  // USD 400,000 + 22% VAT + 30% APA = USD 608,000 = EUR 486,400 at 1.25
  assert.equal(withRates.options[0].breakdown.total, 608000);
  assert.equal(withRates.options[0].displayTotal, 486400);
  assert.equal(withRates.band.id, 'within');
});

test('totals can be shown in GBP', () => {
  const q = quoteYacht(yacht({}), { ...italyCharter, displayCurrency: 'GBP' }, settings, testRates);
  assert.equal(q.options[0].displayTotal, 425600); // 532,000 x 0.8
});

test('Bahamas: two totals, and the budget check uses the higher one', () => {
  const charter = { ...italyCharter, countryId: 'bahamas', budget: 500000, budgetCurrency: 'EUR', startDate: '2027-01-10' };
  const q = quoteYacht(yacht({ rateFromWeekly: 350000 }), charter, settings, noRates);
  assert.deepEqual(q.options.map((o) => o.breakdown.total), [490000, 504000]); // 10% and 14% VAT
  assert.equal(q.band.id, 'over'); // 504,000 is 0.8% over 500,000
});

test('Greece uses the rate for the enquiry\'s eligibility', () => {
  const charter = { ...italyCharter, countryId: 'greece' };
  assert.equal(quoteYacht(yacht({}), { ...charter, greekEligible: true }, settings, noRates).options[0].breakdown.vat, 18200);
  assert.equal(quoteYacht(yacht({}), { ...charter, greekEligible: false }, settings, noRates).options[0].breakdown.vat, 84000);
});

test('a winter rate for a summer charter is flagged', () => {
  const q = quoteYacht(yacht({ notes: 'Winter rate' }), italyCharter, settings, noRates);
  assert.equal(q.seasonWarning, 'Listed rate is a winter rate. The summer rate may differ.');
  assert.equal(quoteYacht(yacht({}), italyCharter, settings, noRates).seasonWarning, null);
});

test('no budget means no band, with a note', () => {
  const q = quoteYacht(yacht({}), { ...italyCharter, budget: null }, settings, noRates);
  assert.equal(q.band, null);
  assert.equal(q.bandNote, 'No budget set');
});

// ---- Sorting ---------------------------------------------------------------

test('sort: within budget first, cheapest first, unquotable last', () => {
  const items = [
    { id: 'out', quote: quoteYacht(yacht({ rateFromWeekly: 600000 }), italyCharter, settings, noRates) },
    { id: 'none', quote: { ok: false, reason: 'Rate on enquiry' } },
    { id: 'within-dear', quote: quoteYacht(yacht({ rateFromWeekly: 390000 }), italyCharter, settings, noRates) },
    { id: 'within-cheap', quote: quoteYacht(yacht({ rateFromWeekly: 200000 }), italyCharter, settings, noRates) },
  ];
  assert.deepEqual(sortQuotes(items).map((i) => i.id), ['within-cheap', 'within-dear', 'out', 'none']);
});
