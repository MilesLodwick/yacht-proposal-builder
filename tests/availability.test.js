import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  overlaps, isExpired, optionStatus, findClashes, expiredOptions, dayStatus, monthGrid,
  validateEntry, buildSampleAvailability,
} from '../src/calc/availability.js';
import { importCSV } from '../src/yachts.js';

const TODAY = '2026-11-17';
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const samples = buildSampleAvailability(JSON.parse(read('../data/sample-availability.json')).entries, TODAY);
const yachts = importCSV('yachts', read('../data/yachts.csv')).records;
const forYacht = (id) => samples.filter((e) => e.yachtId === id);

const entry = (id, type, start, end, extra = {}) => ({ id, type, start, end, label: id, expiresOn: null, ...extra });

// ---- Overlaps --------------------------------------------------------------

test('periods overlap only if they share a night', () => {
  const a = { start: '2027-01-14', end: '2027-01-21' };
  assert.equal(overlaps(a, { start: '2027-01-20', end: '2027-01-27' }), true);
  assert.equal(overlaps(a, { start: '2027-01-21', end: '2027-01-28' }), false); // same-day changeover
  assert.equal(overlaps(a, { start: '2027-01-07', end: '2027-01-14' }), false);
  assert.equal(overlaps(a, { start: '2027-01-15', end: '2027-01-16' }), true);  // inside
});

// ---- Option expiry ---------------------------------------------------------

test('option status: expired, today, soon, later', () => {
  const s = (expiresOn) => optionStatus(entry('o', 'option1', '2027-01-01', '2027-01-08', { expiresOn }), TODAY, 3);
  assert.deepEqual(s('2026-11-16'), { tone: 'red', text: 'Expired 16 Nov 2026' });
  assert.deepEqual(s('2026-11-17'), { tone: 'amber', text: 'Expires today' });
  assert.deepEqual(s('2026-11-19'), { tone: 'amber', text: 'Expires in 2 days' });
  assert.deepEqual(s('2026-11-20'), { tone: 'amber', text: 'Expires in 3 days' });
  assert.deepEqual(s('2026-11-21'), { tone: 'neutral', text: 'Expires 21 Nov 2026' });
  assert.deepEqual(s(null), { tone: 'amber', text: 'No expiry date set' });
});

test('bookings and owner use never expire', () => {
  assert.equal(isExpired(entry('b', 'booking', '2027-01-01', '2027-01-08', { expiresOn: '2020-01-01' }), TODAY), false);
  assert.equal(optionStatus(entry('b', 'booking', '2027-01-01', '2027-01-08'), TODAY, 3), null);
});

// ---- Clashes ---------------------------------------------------------------

test('owner use over a first option is a clash, and owner use takes priority', () => {
  const clashes = findClashes(forYacht('burgess-santosha'), TODAY);
  assert.equal(clashes.length, 1);
  assert.match(clashes[0].message, /^Owner use clashes with the first option \(Marchetti party\)\. Owner use takes priority\.$/);
});

test('two overlapping bookings are a clash; a same-day changeover is not', () => {
  const clashes = findClashes(forYacht('tww-yachts-dakota'), TODAY);
  assert.equal(clashes.length, 1);
  assert.equal(clashes[0].message, 'Two bookings overlap: Nakamura and Petrov.');
});

test('a first and second option on the same dates is normal', () => {
  assert.deepEqual(findClashes(forYacht('tww-yachts-aeterna'), TODAY), []);
});

test('an expired first option is ignored, so the second option is flagged to move up', () => {
  const entries = forYacht('tww-yachts-te-manu');
  assert.deepEqual(expiredOptions(entries, TODAY).map((e) => e.label), ['Kowalski']);
  const clashes = findClashes(entries, TODAY);
  assert.equal(clashes.length, 1);
  assert.match(clashes[0].message, /second option \(Lindqvist\) has no first option ahead of it/);
});

test('an option over a confirmed booking must be released', () => {
  const clashes = findClashes([
    entry('b', 'booking', '2027-07-01', '2027-07-08'),
    entry('o', 'option1', '2027-07-05', '2027-07-12', { expiresOn: '2027-01-01' }),
  ], TODAY);
  assert.match(clashes[0].message, /overlaps a confirmed booking \(b\)\. Release the option\./);
});

test('two first options on the same dates clash', () => {
  const clashes = findClashes([
    entry('x', 'option1', '2027-07-01', '2027-07-08', { expiresOn: '2027-01-01' }),
    entry('y', 'option1', '2027-07-03', '2027-07-10', { expiresOn: '2027-01-01' }),
  ], TODAY);
  assert.match(clashes[0].message, /Two first options overlap/);
});

// ---- Calendar days ---------------------------------------------------------

test('each day shows the highest-priority entry and whether it clashes', () => {
  const entries = forYacht('burgess-santosha');
  const clashes = findClashes(entries, TODAY);
  const ownerOverOption = '2027-01-29'; // day 73: owner's guests over the Marchetti option
  const s = dayStatus(entries, ownerOverOption, clashes, TODAY);
  assert.equal(s.top.type, 'owner');
  assert.equal(s.count, 2);
  assert.equal(s.clash, true);
  const free = dayStatus(entries, '2026-12-01', clashes, TODAY);
  assert.equal(free.top, null);
});

test('expired options do not show on the calendar', () => {
  const entries = forYacht('tww-yachts-te-manu');
  const s = dayStatus(entries, '2027-01-08', findClashes(entries, TODAY), TODAY);
  assert.equal(s.top.label, 'Lindqvist'); // the expired Kowalski option is gone
});

test('month grid starts on Monday and pads with blanks', () => {
  const jan = monthGrid(2027, 1); // 1 Jan 2027 is a Friday
  assert.deepEqual(jan[0], [null, null, null, null, '2027-01-01', '2027-01-02', '2027-01-03']);
  assert.equal(jan.flat().filter(Boolean).length, 31);
  assert.ok(jan.every((week) => week.length === 7));
  assert.equal(monthGrid(2028, 2).flat().filter(Boolean).length, 29); // leap year
});

// ---- Validation and samples ------------------------------------------------

test('entries need a type, dates in order, and options need an expiry date', () => {
  assert.equal(validateEntry({ type: 'booking', start: '2027-01-01', end: '2027-01-08' }).ok, true);
  const bad = validateEntry({ type: 'option1', start: '2027-01-08', end: '2027-01-01', expiresOn: '' });
  assert.deepEqual(Object.keys(bad.errors).sort(), ['end', 'expiresOn']);
});

test('sample entries are on real yachts and marked as examples', () => {
  for (const e of samples) {
    assert.ok(yachts.some((y) => y.id === e.yachtId), e.yachtId);
    assert.equal(e.example, true);
    assert.equal(validateEntry(e).ok, true);
  }
});
