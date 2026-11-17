import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emptySheet, isChild, charterDay, sheetWarnings, handoverSummary, buildSamplePreferences } from '../src/preferences.js';
import { buildSamples } from '../src/enquiries.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const enquiries = buildSamples(read('../data/sample-enquiries.json').enquiries, '2026-11-17');
const whitcombe = enquiries.find((e) => e.clientName === 'The Whitcombe family'); // 14 to 21 Jan 2027, 10 guests
const [sample] = buildSamplePreferences(read('../data/sample-preferences.json').sheets, enquiries);

test('a blank sheet has one row per guest and arrival on the first day', () => {
  const sheet = emptySheet(whitcombe);
  assert.equal(sheet.guests.length, 10);
  assert.equal(sheet.arrival.date, whitcombe.startDate);
});

test('children are under 18; no age given counts as an adult', () => {
  assert.equal(isChild({ age: 6 }), true);
  assert.equal(isChild({ age: '17' }), true);
  assert.equal(isChild({ age: 18 }), false);
  assert.equal(isChild({ age: '' }), false);
});

test('charter day: embarkation is day 1, dates outside the charter are null', () => {
  assert.equal(charterDay('2027-01-14', whitcombe), 1);
  assert.equal(charterDay('2027-01-16', whitcombe), 3);
  assert.equal(charterDay('2027-01-21', whitcombe), 8); // disembarkation day
  assert.equal(charterDay('2027-01-22', whitcombe), null);
  assert.equal(charterDay('', whitcombe), null);
});

test('the sample sheet is complete: no warnings', () => {
  assert.deepEqual(sheetWarnings(sample, whitcombe), []);
});

test('warnings: guest count, unnamed guests, odd ages, missing arrival, occasions outside the charter', () => {
  const sheet = {
    ...emptySheet(whitcombe),
    guests: [{ name: 'A', age: 'ten', dietary: '', allergies: '' }, { name: '', age: '', dietary: '', allergies: '' }],
    occasions: [{ date: '2027-02-01', occasion: 'Birthday', guest: '' }],
  };
  const w = sheetWarnings(sheet, whitcombe);
  assert.ok(w.some((x) => x.includes('lists 2 guests but the enquiry says 10')));
  assert.ok(w.some((x) => x.includes('1 guest has no name')));
  assert.ok(w.some((x) => x.includes('Check the age for A')));
  assert.ok(w.some((x) => x.includes('Arrival time not given')));
  assert.ok(w.some((x) => x.includes('"Birthday" is not on a charter day')));
});

test('handover: allergies listed separately, by guest', () => {
  const h = handoverSummary(sample, whitcombe);
  assert.deepEqual(h.allergies, [
    { guest: 'Helen Whitcombe', allergy: 'Shellfish (severe, carries an adrenaline pen)' },
    { guest: 'Maya Whitcombe', allergy: 'Peanuts and tree nuts' },
  ]);
  assert.equal(h.dietary.length, 4);
});

test('handover: adults and children counted', () => {
  const h = handoverSummary(sample, whitcombe);
  assert.deepEqual(h.guestCount, { total: 10, adults: 6, children: 4 });
  assert.equal(h.guests[5].ageText, 'Child, 6');
  assert.equal(h.guests[0].ageText, 'Adult, 68');
});

test('handover: occasions in date order with their charter day', () => {
  const h = handoverSummary(sample, whitcombe);
  assert.deepEqual(h.occasions.map((o) => `Day ${o.day} ${o.dateText}: ${o.occasion}`), [
    "Day 3 16 Jan 2027: Richard's 69th birthday",
    "Day 6 19 Jan 2027: Helen and Richard's 45th wedding anniversary",
  ]);
});

test('handover: arrival and activities read naturally', () => {
  const h = handoverSummary(sample, whitcombe);
  assert.equal(h.arrival.text, '14 Jan 2027, 15:30, Nassau, Lynden Pindling Airport (transfer to the yacht)');
  assert.ok(h.activities.includes('Swimming pigs at Big Major Cay'));
});

test('handover for a blank sheet: placeholders, never "undefined"', () => {
  const h = handoverSummary(emptySheet(whitcombe), whitcombe);
  assert.equal(h.guests[0].name, 'Guest 1');
  assert.equal(h.arrival.text, '14 Jan 2027');
  assert.ok(!JSON.stringify(h).includes('undefined'));
});
