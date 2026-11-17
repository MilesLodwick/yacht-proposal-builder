import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isBooked, validateActivity, reportPeriods, activityReport, buildSampleActivity, interestTone } from '../src/activity.js';
import { importCSV } from '../src/yachts.js';
import { withListingDefaults, addPriceChange } from '../src/listings.js';

const TODAY = '2026-11-17';
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const forSale = importCSV('forSale', read('../data/for-sale.csv')).records;
const entries = buildSampleActivity(JSON.parse(read('../data/sample-activity.json')).entries, TODAY);
const oyster = withListingDefaults(forSale.find((b) => b.id === 'berthon-oyster-54'));

test('a viewing in the future is booked; today or earlier is held', () => {
  assert.equal(isBooked({ type: 'viewing', date: '2026-11-18' }, TODAY), true);
  assert.equal(isBooked({ type: 'viewing', date: '2026-11-17' }, TODAY), false);
  assert.equal(isBooked({ type: 'enquiry', date: '2026-11-18' }, TODAY), false);
});

test('interest colours', () => {
  assert.equal(interestTone('High'), 'green');
  assert.equal(interestTone('Not interested'), 'red');
});

test('entries need a type, date and who; enquiries cannot be in the future', () => {
  assert.equal(validateActivity({ type: 'viewing', date: '2026-11-20', time: '10:00', who: 'B-1' }, TODAY).ok, true);
  const bad = validateActivity({ type: 'enquiry', date: '2026-11-20', time: '10', who: ' ' }, TODAY);
  assert.deepEqual(Object.keys(bad.errors).sort(), ['date', 'time', 'who']);
});

test('periods: 30 days, 90 days, since listed (if known), all', () => {
  assert.deepEqual(reportPeriods(oyster, TODAY).map((p) => p.id), ['30', '90', 'all']);
  assert.deepEqual(reportPeriods({ ...oyster, listedOn: '2026-09-01' }, TODAY).map((p) => p.id), ['30', '90', 'listed', 'all']);
  assert.equal(reportPeriods(oyster, TODAY)[0].from, '2026-10-18');
});

test('last 30 days on the sample listing', () => {
  const r = activityReport({ listing: oyster, entries, from: '2026-10-18', to: TODAY, today: TODAY });
  assert.deepEqual(r.counts, { enquiries: 2, viewingsHeld: 2, viewingsBooked: 1 });
  assert.deepEqual(r.interest, { High: 1, Medium: 0, Low: 0, 'Not interested': 1 });
  assert.equal(r.period.days, 30);
});

test('all activity: feedback newest first, with the booked viewing listed as coming up', () => {
  const r = activityReport({ listing: oyster, entries, from: null, to: TODAY, today: TODAY });
  assert.deepEqual(r.counts, { enquiries: 4, viewingsHeld: 3, viewingsBooked: 1 });
  assert.deepEqual(r.feedback.map((f) => f.interest), ['Not interested', 'High', 'Medium']);
  assert.equal(r.upcoming[0].date, '2026-11-22');
  assert.equal(r.heldWithoutFeedback, 0);
});

test('a held viewing without feedback is counted so it can be chased', () => {
  const extra = [...entries, { id: 'x', listingId: oyster.id, type: 'viewing', date: '2026-11-16', who: 'B-200', feedback: '' }];
  assert.equal(activityReport({ listing: oyster, entries: extra, from: null, to: TODAY, today: TODAY }).heldWithoutFeedback, 1);
});

test('price changes in the period come from the listing\'s history', () => {
  const reduced = addPriceChange(oyster, { date: '2026-11-17', price: 620000, note: 'Reduced' });
  const r = activityReport({ listing: reduced, entries, from: '2026-10-18', to: TODAY, today: TODAY });
  // The sheet price and the reduction share a date; the reduction sorts after it.
  assert.equal(r.priceChanges.length, 1);
  assert.equal(r.priceChanges[0].price, 620000);
});

test('activity on other listings is ignored', () => {
  const other = withListingDefaults(forSale.find((b) => b.id !== oyster.id));
  const r = activityReport({ listing: other, entries, from: null, to: TODAY, today: TODAY });
  assert.deepEqual(r.counts, { enquiries: 0, viewingsHeld: 0, viewingsBooked: 0 });
});

test('sample activity is on a real listing and marked as an example', () => {
  assert.ok(forSale.some((b) => b.id === 'berthon-oyster-54'));
  assert.ok(entries.every((e) => e.example === true));
  for (const e of entries) assert.equal(validateActivity(e, TODAY).ok, true, e.who);
});
