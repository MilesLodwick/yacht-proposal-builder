// Tests for the owner report: commission split, net to owner, utilisation.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { commissionSettings, commissionSplit, seasonFor, seasonList, nightsWithin, ownerReport } from '../src/calc/owner.js';
import { roundMoney } from '../src/calc/charter.js';
import { buildSampleAvailability, validateEntry } from '../src/calc/availability.js';
import { weeklyRateFor } from '../src/selection.js';
import { importCSV } from '../src/yachts.js';

const TODAY = '2026-11-17';
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const { settings } = JSON.parse(read('../data/settings.json'));
const yachts = importCSV('yachts', read('../data/yachts.csv')).records;
const entries = buildSampleAvailability(JSON.parse(read('../data/sample-availability.json')).entries, TODAY);
const split = commissionSettings(settings);

// ---- Commission ------------------------------------------------------------

test('commission settings come from settings.json: 20% = 15% + 5%', () => {
  assert.deepEqual(split, { totalPercent: 20, retailPercent: 15, centralPercent: 5 });
});

test('with a retail broker: 15% to the broker, 5% to the central agent', () => {
  assert.deepEqual(commissionSplit(400000, split, true), { total: 80000, retail: 60000, central: 20000, net: 320000 });
});

test('booked direct: the central agent keeps the whole 20%', () => {
  assert.deepEqual(commissionSplit(400000, split, false), { total: 80000, retail: 0, central: 80000, net: 320000 });
});

test('the owner nets the same either way; only the brokers\' shares change', () => {
  assert.equal(commissionSplit(250000, split, true).net, commissionSplit(250000, split, false).net);
});

test('awkward figures still add up to the cent', () => {
  const c = commissionSplit(571428.57, split, true);
  assert.equal(c.total, 114285.71);
  // Adding decimals in JavaScript can give 114285.70999999999, so round
  // to the cent, exactly as the app does with roundMoney.
  assert.equal(roundMoney(c.retail + c.central), c.total);
  assert.equal(roundMoney(c.total + c.net), 571428.57);
});

test('a different commission setting is used straight away', () => {
  assert.deepEqual(commissionSplit(100000, { totalPercent: 15, retailPercent: 10, centralPercent: 5 }, true), { total: 15000, retail: 10000, central: 5000, net: 85000 });
});

// ---- Seasons ---------------------------------------------------------------

test('seasons: summer May to October, winter November to April', () => {
  assert.deepEqual(seasonFor('2027-07-10'), { id: 'summer-2027', label: 'Summer 2027', start: '2027-05-01', end: '2027-11-01' });
  assert.deepEqual(seasonFor('2026-11-17'), { id: 'winter-2026', label: 'Winter 2026/27', start: '2026-11-01', end: '2027-05-01' });
  assert.equal(seasonFor('2027-02-01').id, 'winter-2026');
});

test('season list runs on without gaps', () => {
  const list = seasonList(TODAY, 4);
  assert.deepEqual(list.map((s) => s.label), ['Winter 2026/27', 'Summer 2027', 'Winter 2027/28', 'Summer 2028']);
  for (let i = 1; i < list.length; i += 1) assert.equal(list[i].start, list[i - 1].end);
});

test('nights are counted only inside the period', () => {
  const e = { start: '2027-04-28', end: '2027-05-05' };
  assert.equal(nightsWithin(e, '2026-11-01', '2027-05-01'), 3); // 28, 29, 30 April
  assert.equal(nightsWithin(e, '2027-05-01', '2027-11-01'), 4);
  assert.equal(nightsWithin(e, '2027-06-01', '2027-07-01'), 0);
});

// ---- The SANTOSHA sample report: winter 2026/27 -----------------------------

const santosha = yachts.find((y) => y.id === 'burgess-santosha');
const report = ownerReport({
  yacht: santosha,
  entries: entries.filter((e) => e.yachtId === 'burgess-santosha'),
  season: seasonFor(TODAY),
  settings,
  rateFor: weeklyRateFor,
});

test('four charters, one fee estimated from the rate', () => {
  assert.deepEqual(report.bookings.map((b) => b.label), ['Whitcombe family', 'Haldane party', 'Okonkwo family', 'Varga']);
  const okonkwo = report.bookings[2];
  assert.equal(okonkwo.estimated, true);
  assert.equal(okonkwo.charterFee, 571428.57); // USD 400,000 a week for 10 nights
  assert.equal(report.anyEstimated, true);
});

test('totals: gross, commission split and net to owner', () => {
  assert.deepEqual(report.totals, {
    charters: 4,
    weeks: 4.4,               // 31 nights
    gross: 1791428.57,        // 400,000 + 420,000 + 571,428.57 + 400,000
    commission: 358285.71,    // 20%
    retail: 183000,           // 15% on the three broker bookings
    central: 175285.71,       // 5% on those, plus the full 20% on the direct one
    net: 1433142.86,
  });
  assert.equal(roundMoney(report.totals.retail + report.totals.central), report.totals.commission);
});

test('utilisation through the season', () => {
  assert.deepEqual(report.utilisation, {
    seasonNights: 181, bookedNights: 31, ownerNights: 12, percent: 17, ofAvailablePercent: 18,
  });
  assert.deepEqual(report.months.map((m) => m.label), ['Nov 2026', 'Dec 2026', 'Jan 2027', 'Feb 2027', 'Mar 2027', 'Apr 2027']);
  const jan = report.months[2];
  assert.deepEqual({ booked: jan.booked, owner: jan.owner, days: jan.days, percent: jan.percent }, { booked: 7, owner: 6, days: 31, percent: 23 });
});

test('options do not count as income or utilisation', () => {
  assert.ok(!report.bookings.some((b) => b.label === 'Marchetti party'));
});

test('a booking with no fee and no rate is left out of the money, and counted', () => {
  const r = ownerReport({
    yacht: { ...santosha, rateFromWeekly: null },
    entries: [{ id: 'x', type: 'booking', start: '2027-02-01', end: '2027-02-08', label: 'X' }],
    season: seasonFor(TODAY), settings, rateFor: weeklyRateFor,
  });
  assert.equal(r.unpriced, 1);
  assert.equal(r.totals.gross, 0);
  assert.equal(r.utilisation.bookedNights, 7);
});

test('a booking\'s charter fee must be a number if given', () => {
  assert.ok(validateEntry({ type: 'booking', start: '2027-01-01', end: '2027-01-08', charterFee: 'lots' }).errors.charterFee);
  assert.equal(validateEntry({ type: 'booking', start: '2027-01-01', end: '2027-01-08', charterFee: '400,000' }).ok, true);
});
