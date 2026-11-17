import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { legHours, formatHours, planItinerary, validateItinerary, buildSampleItineraries } from '../src/calc/itinerary.js';
import { buildSamples } from '../src/enquiries.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));

test('the sample itinerary matches its sample enquiry and has one long day', () => {
  const [itinerary] = buildSampleItineraries(read('../data/sample-itineraries.json').itineraries, '2026-11-17');
  const enquiry = buildSamples(read('../data/sample-enquiries.json').enquiries, '2026-11-17').find((e) => e.id === itinerary.enquiryId);
  assert.ok(itinerary.example);
  assert.equal(itinerary.startDate, enquiry.startDate);
  assert.equal(itinerary.days.length, 7); // a 7-day charter
  assert.equal(validateItinerary(itinerary).ok, true);
  const plan = planItinerary(itinerary, 6);
  assert.equal(plan.longDays, 1); // Amalfi to Stromboli, 112 nm at 12 knots
  assert.equal(formatHours(plan.days[3].hours), '9 h 20 min');
});

const sample = {
  name: 'Amalfi test',
  startDate: '2027-07-07',
  embarkPort: 'Naples',
  speedKnots: 12,
  days: [
    { toPort: 'Capri', nm: 18 },
    { toPort: 'Positano', nm: 14 },
    { toPort: 'Positano', nm: 0, notes: 'Day at anchor' },
    { toPort: 'Stromboli', nm: 108 },
  ],
};

test('cruising time = distance / speed', () => {
  assert.equal(legHours(36, 12), 3);
  assert.equal(legHours(18, 12), 1.5);
  assert.equal(legHours(0, 12), 0);
});

test('no speed means no time, never a wrong one', () => {
  assert.equal(legHours(36, 0), null);
  assert.equal(legHours(36, null), null);
});

test('hours read as hours and minutes', () => {
  assert.equal(formatHours(3), '3 h');
  assert.equal(formatHours(1.5), '1 h 30 min');
  assert.equal(formatHours(14 / 12), '1 h 10 min');
  assert.equal(formatHours(0.25), '15 min');
  assert.equal(formatHours(0), 'No passage');
  assert.equal(formatHours(null), 'Not set');
});

test('each day starts where the last one ended, with its date', () => {
  const plan = planItinerary(sample, 6);
  assert.deepEqual(plan.days.map((d) => `${d.day} ${d.date} ${d.fromPort} > ${d.toPort}`), [
    '1 2027-07-07 Naples > Capri',
    '2 2027-07-08 Capri > Positano',
    '3 2027-07-09 Positano > Positano',
    '4 2027-07-10 Positano > Stromboli',
  ]);
});

test('legs over 6 hours are long days', () => {
  const plan = planItinerary(sample, 6);
  assert.deepEqual(plan.days.map((d) => d.longDay), [false, false, false, true]); // 108 nm = 9 h
  assert.equal(plan.longDays, 1);
});

test('exactly 6 hours is not a long day; just over is', () => {
  const at = (nm) => planItinerary({ ...sample, days: [{ toPort: 'X', nm }] }, 6).days[0].longDay;
  assert.equal(at(72), false); // 6 h exactly
  assert.equal(at(73), true);  // 6 h 5 min
});

test('the long-day limit follows the setting', () => {
  assert.equal(planItinerary(sample, 10).longDays, 0);
});

test('a slower yacht turns the same legs into long days', () => {
  const slow = planItinerary({ ...sample, speedKnots: 8 }, 6);
  assert.equal(slow.days[3].hours, 13.5); // 108 / 8
  assert.equal(slow.longDays, 1);
  const verySlow = planItinerary({ ...sample, speedKnots: 2 }, 6);
  assert.equal(verySlow.longDays, 3); // 18, 14 and 108 nm all take more than 6 h
});

test('totals add up all the legs', () => {
  const plan = planItinerary(sample, 6);
  assert.equal(plan.totalNm, 140);
  assert.equal(formatHours(plan.totalHours), '11 h 40 min');
});

test('blank distances count as no passage', () => {
  const plan = planItinerary({ ...sample, days: [{ toPort: 'Capri', nm: '' }] }, 6);
  assert.equal(plan.days[0].nm, 0);
  assert.equal(plan.days[0].longDay, false);
});

test('validation: name, speed, embarkation port and distances', () => {
  assert.equal(validateItinerary(sample).ok, true);
  const bad = validateItinerary({ ...sample, name: '', speedKnots: 0, embarkPort: '', days: [{ toPort: 'X', nm: '-3' }] });
  assert.deepEqual(Object.keys(bad.errors).sort(), ['day-1-nm', 'embarkPort', 'name', 'speedKnots']);
  assert.ok(validateItinerary({ ...sample, speedKnots: 55 }).errors.speedKnots);
});
