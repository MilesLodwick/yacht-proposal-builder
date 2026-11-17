import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bookletPage, validateBooklet, buildSampleBooklets } from '../src/booklet.js';
import { buildSampleAvailability } from '../src/calc/availability.js';
import { importCSV } from '../src/yachts.js';

const TODAY = '2026-11-17';
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const yachts = importCSV('yachts', read('../data/yachts.csv')).records;
const entries = buildSampleAvailability(JSON.parse(read('../data/sample-availability.json')).entries, TODAY);
const [sample] = buildSampleBooklets(JSON.parse(read('../data/sample-booklets.json')).booklets, TODAY);

const page = (id, extra = {}) => bookletPage({
  yacht: { ...yachts.find((y) => y.id === id), ...extra },
  entries: entries.filter((e) => e.yachtId === id),
  today: TODAY, staleDays: 90,
});

test('a page shows the specs that are known, and leaves out the rest', () => {
  const p = page('burgess-santosha');
  assert.deepEqual(p.specs, [['Length', '56.7 m'], ['Guests', '12'], ['Cabins', '6'], ['Builder', 'Heesen'], ['Built', '2024']]);
  assert.equal(p.centralAgent, 'Burgess');
});

test('rates: "From" when only the listed rate is known; seasons when recorded', () => {
  assert.deepEqual(page('burgess-santosha').rates, [{ label: 'From', amount: '$400,000' }]);
  assert.deepEqual(page('burgess-santosha', { winterRate: 420000 }).rates, [{ label: 'Winter', amount: '$420,000' }, { label: 'Listed', amount: '$400,000' }]);
});

test('availability shows dates held, never client names', () => {
  const p = page('burgess-santosha');
  // Owner's Christmas, Whitcombe, Marchetti option, owner's guests, Haldane, Okonkwo, Varga
  assert.deepEqual(p.busy.map((b) => b.status), ['Owner use', 'Booked', 'Under option', 'Owner use', 'Booked', 'Booked', 'Booked']);
  const text = JSON.stringify(p.busy);
  for (const name of ['Whitcombe', 'Marchetti', 'Haldane', 'Okonkwo', 'Varga']) assert.ok(!text.includes(name), `${name} leaked`);
});

test('expired options and past charters are left out', () => {
  const p = page('tww-yachts-te-manu');
  assert.deepEqual(p.busy, [
    { status: 'Booked', dates: '23 to 30 Dec 2026' },
    { status: 'Under option', dates: '6 to 13 Jan 2027' }, // the second option; the expired first option is gone
  ]);
});

test('only the next six months are shown', () => {
  const p = page('burgess-santosha');
  assert.equal(p.availabilityWindow, '17 Nov 2026 to 18 May 2027');
  assert.ok(!p.busy.some((b) => b.dates.includes('Jun')));
});

test('warnings: not verified, out-of-date details, no rate', () => {
  assert.deepEqual(page('burgess-santosha', { check: 'Verified' }).warnings, []);
  assert.match(page('burgess-santosha').warnings[0], /not yet verified/);
  assert.match(page('burgess-santosha', { check: 'Verified', dateChecked: '2026-07-01' }).warnings[0], /details 139 days old/);
  assert.match(page('edmiston-lady-s', { check: 'Verified' }).warnings[0], /Rate on request/);
});

test('a booklet needs a show name and at least one yacht', () => {
  assert.equal(validateBooklet(sample).ok, true);
  assert.deepEqual(Object.keys(validateBooklet({ showName: ' ', yachtIds: [] }).errors).sort(), ['showName', 'yachtIds']);
});

test('the sample booklet uses real yachts and is marked as an example', () => {
  assert.equal(sample.example, true);
  assert.equal(sample.showDate, '2026-12-07');
  for (const id of sample.yachtIds) assert.ok(yachts.some((y) => y.id === id), id);
});
