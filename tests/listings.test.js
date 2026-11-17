import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LISTING_STATUSES, statusTone, withListingDefaults, daysOnMarket, priceSummary,
  addPriceChange, removePriceChange, validatePriceChange, validateStatus,
} from '../src/listings.js';
import { importCSV } from '../src/yachts.js';

const TODAY = '2026-11-17';
const forSale = importCSV('forSale', readFileSync(new URL('../data/for-sale.csv', import.meta.url), 'utf8')).records;

const listing = (fields = {}) => withListingDefaults({
  id: 'x', name: 'Test 48', askingPrice: 1000000, currency: 'EUR', dateChecked: '2026-11-17', ...fields,
});

test('the four statuses from the brief', () => {
  assert.deepEqual(LISTING_STATUSES, ['Active', 'Under offer', 'Sold', 'Withdrawn']);
  assert.equal(statusTone('Under offer'), 'amber');
  assert.equal(statusTone('Sold'), 'green');
});

test('imported boats start Active, with the checked price as the only history', () => {
  const l = listing();
  assert.equal(l.status, 'Active');
  assert.equal(l.listedOn, null);
  assert.deepEqual(l.priceHistory, [{ date: '2026-11-17', price: 1000000, note: 'Asking price when checked', fromSheet: true }]);
});

test('a boat with no price has no history (never invented)', () => {
  assert.deepEqual(listing({ askingPrice: null }).priceHistory, []);
});

test('every real for-sale boat gets defaults without errors', () => {
  const all = forSale.map(withListingDefaults);
  assert.equal(all.length, 134);
  assert.ok(all.every((l) => l.status === 'Active'));
});

// ---- Days on market --------------------------------------------------------

test('days on market: from the listing date to today', () => {
  assert.equal(daysOnMarket(listing({ listedOn: '2026-08-19' }), TODAY), 90);
});

test('days on market stop when sold or withdrawn', () => {
  assert.equal(daysOnMarket(listing({ listedOn: '2026-08-19', status: 'Sold', statusDate: '2026-10-01' }), TODAY), 43);
  assert.equal(daysOnMarket(listing({ listedOn: '2026-08-19', status: 'Withdrawn', statusDate: '2026-09-18' }), TODAY), 30);
});

test('under offer still counts as on the market', () => {
  assert.equal(daysOnMarket(listing({ listedOn: '2026-08-19', status: 'Under offer', statusDate: '2026-10-01' }), TODAY), 90);
});

test('no listing date: days on market not recorded', () => {
  assert.equal(daysOnMarket(listing(), TODAY), null);
});

// ---- Price history ---------------------------------------------------------

test('a reduction updates the asking price and the summary', () => {
  let l = listing({ listedOn: '2026-06-01' });
  l = addPriceChange(l, { date: '2026-11-20', price: 920000, note: 'Owner reduced' });
  assert.equal(l.askingPrice, 920000);
  assert.deepEqual(priceSummary(l.priceHistory), {
    first: 1000000, current: 920000, change: -80000, changePercent: -8, reductions: 1, lastChanged: '2026-11-20',
  });
});

test('price changes stay in date order, even if entered out of order', () => {
  let l = listing();
  l = addPriceChange(l, { date: '2026-12-15', price: 900000, note: '' });
  l = addPriceChange(l, { date: '2026-12-01', price: 950000, note: '' });
  assert.deepEqual(l.priceHistory.map((h) => h.price), [1000000, 950000, 900000]);
  assert.equal(l.askingPrice, 900000);
  assert.equal(priceSummary(l.priceHistory).reductions, 2);
});

test('a price increase is not counted as a reduction', () => {
  const l = addPriceChange(listing(), { date: '2026-12-01', price: 1050000, note: '' });
  const s = priceSummary(l.priceHistory);
  assert.equal(s.reductions, 0);
  assert.equal(s.changePercent, 5);
});

test('removing a change puts the asking price back', () => {
  let l = addPriceChange(listing(), { date: '2026-12-01', price: 950000, note: '' });
  l = removePriceChange(l, 1);
  assert.equal(l.askingPrice, 1000000);
  assert.equal(l.priceHistory.length, 1);
});

test('an earlier, higher price entered later reads as a reduction to the checked price', () => {
  // Listed in August at 1,100,000; the sheet shows 1,000,000 on 17 Nov.
  const l = addPriceChange(listing(), { date: '2026-08-01', price: 1100000, note: 'Original asking price' });
  assert.equal(l.askingPrice, 1000000); // the latest price is still the checked one
  const s = priceSummary(l.priceHistory);
  assert.equal(s.changePercent, -9.1);
  assert.equal(s.reductions, 1);
});

test('the price from the research sheet can never be removed', () => {
  let l = addPriceChange(listing(), { date: '2026-08-01', price: 1100000, note: '' });
  const sheetIndex = l.priceHistory.findIndex((h) => h.fromSheet);
  l = removePriceChange(l, sheetIndex);
  assert.ok(l.priceHistory.some((h) => h.fromSheet));
  assert.equal(l.askingPrice, 1000000);
  l = removePriceChange(l, l.priceHistory.findIndex((h) => !h.fromSheet));
  assert.equal(l.priceHistory.length, 1);
});

test('no history, no summary', () => {
  assert.equal(priceSummary([]), null);
});

// ---- Checks ----------------------------------------------------------------

test('a price change needs a real past date and a positive price', () => {
  assert.equal(validatePriceChange({ date: '2026-11-17', price: '950,000' }, listing(), TODAY).change.price, 950000);
  assert.deepEqual(Object.keys(validatePriceChange({ date: '2026-12-01', price: '0' }, listing(), TODAY).errors).sort(), ['date', 'price']);
  assert.ok(validatePriceChange({ date: '2026-11-01', price: '1' }, listing({ currency: null }), TODAY).errors.price);
});

test('sold or withdrawn needs a date, after the listing date', () => {
  assert.equal(validateStatus({ status: 'Active', listedOn: '2026-06-01', statusDate: '' }, TODAY).ok, true);
  assert.ok(validateStatus({ status: 'Sold', listedOn: '2026-06-01', statusDate: '' }, TODAY).errors.statusDate);
  assert.ok(validateStatus({ status: 'Sold', listedOn: '2026-06-01', statusDate: '2026-05-01' }, TODAY).errors.statusDate);
  assert.ok(validateStatus({ status: 'Active', listedOn: '2027-01-01' }, TODAY).errors.listedOn);
});
