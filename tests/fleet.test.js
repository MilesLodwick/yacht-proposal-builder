import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detailsAge, firms, parseLinks, validateFleetRecord, yachtPageLink } from '../src/fleet.js';
import { weeklyRateFor, quoteYacht } from '../src/selection.js';
import { importCSV, exportCSV } from '../src/yachts.js';
import { ratesFromSettings } from '../src/calc/currency.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const { settings } = JSON.parse(read('../data/settings.json'));
const yachts = importCSV('yachts', read('../data/yachts.csv')).records;
const TODAY = '2026-11-17';

const yacht = (fields) => ({ id: 'x', name: 'Test', guests: 12, currency: 'EUR', rateFromWeekly: 300000, summerRate: null, winterRate: null, notes: null, dateChecked: '2026-11-17', ...fields });

// ---- Details older than 90 days -------------------------------------------

test('details checked 90 days ago are fine; 91 days ago are out of date', () => {
  assert.deepEqual(detailsAge(yacht({ dateChecked: '2026-08-19' }), TODAY, 90), { days: 90, stale: false });
  assert.deepEqual(detailsAge(yacht({ dateChecked: '2026-08-18' }), TODAY, 90), { days: 91, stale: true });
});

test('no checked date means out of date', () => {
  assert.deepEqual(detailsAge(yacht({ dateChecked: null }), TODAY, 90), { days: null, stale: true });
});

test('the limit follows the setting', () => {
  assert.equal(detailsAge(yacht({ dateChecked: '2026-10-01' }), TODAY, 30).stale, true);
});

test('the research sheet was checked today, so nothing is out of date yet', () => {
  assert.ok(yachts.every((y) => !detailsAge(y, TODAY, 90).stale));
  assert.ok(yachts.every((y) => detailsAge(y, '2027-02-16', 90).stale)); // 91 days later
});

test('firms are listed once each, A to Z', () => {
  const list = firms(yachts);
  assert.equal(list.length, 8);
  assert.equal(list[0], 'Burgess');
  assert.deepEqual(list, [...new Set(list)].sort());
});

test('listing links: web addresses only', () => {
  assert.deepEqual(parseLinks('https://a.com/x\nnot a link https://b.org'), ['https://a.com/x', 'https://b.org']);
  assert.deepEqual(parseLinks(''), []);
});

// ---- Seasonal rates --------------------------------------------------------

test('a summer charter uses the summer rate when one is recorded', () => {
  const y = yacht({ summerRate: 350000, winterRate: 280000 });
  assert.deepEqual(weeklyRateFor(y, '2027-07-10'), { rate: 350000, label: 'Summer rate', otherSeason: false });
  assert.deepEqual(weeklyRateFor(y, '2027-01-10'), { rate: 280000, label: 'Winter rate', otherSeason: false });
});

test('without a seasonal rate, the listed rate is used', () => {
  assert.deepEqual(weeklyRateFor(yacht({}), '2027-07-10'), { rate: 300000, label: 'Listed rate', otherSeason: false });
});

test('only the other season\'s rate: used, but flagged', () => {
  const y = yacht({ rateFromWeekly: null, winterRate: 280000 });
  assert.deepEqual(weeklyRateFor(y, '2027-07-10'), { rate: 280000, label: 'Winter rate', otherSeason: true });
  const charter = { days: 7, countryId: 'italy', greekEligible: false, budget: null, budgetCurrency: 'EUR', displayCurrency: 'EUR', startDate: '2027-07-10' };
  const q = quoteYacht(y, charter, settings, ratesFromSettings(settings));
  assert.equal(q.ok, true);
  assert.equal(q.seasonWarning, 'Only a winter rate is recorded. The summer rate may differ.');
});

test('a quote uses the seasonal rate and says so', () => {
  const charter = { days: 7, countryId: 'italy', greekEligible: false, budget: null, budgetCurrency: 'EUR', displayCurrency: 'EUR', startDate: '2027-07-10' };
  const q = quoteYacht(yacht({ summerRate: 350000 }), charter, settings, ratesFromSettings(settings));
  assert.equal(q.weeklyRate, 350000);
  assert.equal(q.rateLabel, 'Summer rate');
  assert.equal(q.options[0].breakdown.total, 532000); // 350,000 + 22% VAT + 30% APA
});

test('no rate of any kind: rate on enquiry', () => {
  assert.equal(weeklyRateFor(yacht({ rateFromWeekly: null }), '2027-07-10'), null);
});

test('fleet fields survive CSV export and import', () => {
  const edited = yachts.map((y, i) => (i === 0 ? { ...y, summerRate: 1200000, winterBase: 'Antigua', crewNotes: 'Captain: 20 years in command', otherLinks: 'https://example.com/a\nhttps://example.com/b' } : y));
  const back = importCSV('yachts', exportCSV('yachts', edited)).records;
  assert.equal(back[0].summerRate, 1200000);
  assert.equal(back[0].winterBase, 'Antigua');
  assert.equal(back[0].otherLinks, 'https://example.com/a\nhttps://example.com/b');
});

// ---- The record form -------------------------------------------------------

const form = {
  lengthM: '55', guests: '12', cabins: '6', builder: 'Heesen', year: '2023', cruisingArea: 'Mediterranean',
  rateFromWeekly: '400,000', summerRate: '', winterRate: '', currency: 'EUR', summerBase: 'Naples', winterBase: '',
  crewNotes: '', otherLinks: '', notes: '', source: 'C&N', sourceUrl: 'https://example.com', dateChecked: '2026-11-17', check: 'Verified',
};

test('a valid record is accepted and tidied', () => {
  const r = validateFleetRecord(form, TODAY);
  assert.equal(r.ok, true);
  assert.equal(r.fields.rateFromWeekly, 400000);
  assert.equal(r.fields.summerRate, null);
  assert.equal(r.fields.winterBase, null);
  assert.equal(r.fields.check, 'Verified');
});

test('numbers, year, links and dates are checked', () => {
  const r = validateFleetRecord({ ...form, guests: '11.5', year: '1700', sourceUrl: 'example.com', otherLinks: 'https://ok.com nope', dateChecked: '2026-12-01' }, TODAY);
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ['dateChecked', 'guests', 'otherLinks', 'sourceUrl', 'year']);
});

test('rates need a currency', () => {
  assert.ok(validateFleetRecord({ ...form, currency: '' }, TODAY).errors.currency);
  assert.equal(validateFleetRecord({ ...form, currency: '', rateFromWeekly: '' }, TODAY).ok, true);
});

test('a yacht name links to its saved listing page first', () => {
  const link = yachtPageLink({ name: 'Lady S', firm: 'Edmiston', sourceUrl: 'https://www.edmiston.com/yachts-for-charter', otherLinks: 'https://example.com/lady-s\nhttps://example.com/other' });
  assert.deepEqual(link, { url: 'https://example.com/lady-s', kind: 'listing' });
});

test('without a saved page, a yacht name searches its firm\'s site', () => {
  const link = yachtPageLink({ name: 'Lady S', firm: 'Edmiston', sourceUrl: 'https://www.edmiston.com/yachts-for-charter/management' });
  assert.equal(link.kind, 'search');
  assert.equal(new URL(link.url).searchParams.get('q'), '"Lady S" site:edmiston.com');
});

test('with no source link either, the search uses the firm name', () => {
  const link = yachtPageLink({ name: 'Lady S', firm: 'Edmiston', sourceUrl: null });
  assert.equal(new URL(link.url).searchParams.get('q'), '"Lady S" Edmiston yacht charter');
  assert.equal(yachtPageLink({ name: '' }), null);
});
