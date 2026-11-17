import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEAL_STAGES, dealFigures, depositStatus, dealProgress, dealWarnings, validateDeal, buildSampleDeals } from '../src/deals.js';
import { importCSV } from '../src/yachts.js';

const TODAY = '2026-11-17';
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const { settings } = JSON.parse(read('../data/settings.json'));
const forSale = importCSV('forSale', read('../data/for-sale.csv')).records;
const [sample] = buildSampleDeals(JSON.parse(read('../data/sample-deals.json')).deals, TODAY);

const deal = (fields = {}) => ({ id: 'd', listingId: 'x', buyer: 'B-1', agreedPrice: 2500000, currency: 'EUR', defectsOutcome: '', priceReduction: null, stages: {}, ...fields });
const at = (date, docs = []) => ({ date, docs: Object.fromEntries(docs.map((d) => [d, true])), notes: '' });

test('the nine stages from the brief, in MOA order', () => {
  assert.deepEqual(DEAL_STAGES.map((s) => s.label), [
    'Offer agreed', 'MOA signed', 'Deposit received', 'Sea trial', 'Survey',
    'Defects resolved or price reduced', 'Acceptance letter', 'Closing', 'Commission',
  ]);
  const closing = DEAL_STAGES.find((s) => s.id === 'closing');
  assert.deepEqual(closing.docs.map((d) => d.label), ['Balance paid', 'Bill of sale signed', 'Protocol of delivery and acceptance signed']);
});

test('sale commission setting: 10% by default', () => {
  assert.equal(settings.find((s) => s.id === 'sale.commissionPercent').value, 10);
});

// ---- Money -----------------------------------------------------------------

test('figures: 10% deposit due 4 banking days after the MOA, balance, commission', () => {
  const f = dealFigures(deal({ stages: { moa: at('2026-11-17') } }), settings);
  assert.deepEqual(f.deposit, { amount: 250000, dueDate: '2026-11-23', percent: 10, bankingDays: 4 });
  assert.equal(f.finalPrice, 2500000);
  assert.equal(f.balance, 2250000);
  assert.deepEqual(f.commission, { percent: 10, amount: 250000 });
});

test('before the MOA is signed the deposit has an amount but no due date', () => {
  const f = dealFigures(deal(), settings);
  assert.equal(f.deposit.amount, 250000);
  assert.equal(f.deposit.dueDate, null);
});

test('a price reduction for defects lowers the final price, balance and commission, not the deposit', () => {
  const f = dealFigures(deal({ defectsOutcome: 'price reduced', priceReduction: 100000, stages: { moa: at('2026-11-17') } }), settings);
  assert.equal(f.finalPrice, 2400000);
  assert.equal(f.deposit.amount, 250000);   // set by the MOA price
  assert.equal(f.balance, 2150000);
  assert.equal(f.commission.amount, 240000);
});

test('a reduction only counts when the outcome is "price reduced"', () => {
  assert.equal(dealFigures(deal({ defectsOutcome: 'resolved', priceReduction: 100000 }), settings).finalPrice, 2500000);
});

// ---- Deposit status --------------------------------------------------------

test('deposit status: waiting, due, overdue, received', () => {
  assert.equal(depositStatus(deal(), settings, TODAY).text, 'Due after the MOA is signed');
  assert.deepEqual(depositStatus(deal({ stages: { moa: at('2026-11-17') } }), settings, TODAY), { tone: 'amber', text: 'Due in 6 days' });
  assert.deepEqual(depositStatus(deal({ stages: { moa: at('2026-11-02') } }), settings, TODAY), { tone: 'red', text: 'Overdue by 11 days' });
  assert.deepEqual(depositStatus(deal({ stages: { moa: at('2026-11-02'), deposit: at('2026-11-05') } }), settings, TODAY), { tone: 'green', text: 'Received 5 Nov 2026' });
});

// ---- Progress and warnings -------------------------------------------------

test('progress: stages with a date are done; the first without is current', () => {
  const p = dealProgress(deal({ stages: { offer: at('2026-11-01'), moa: at('2026-11-03') } }));
  assert.equal(p.done, 2);
  assert.equal(p.total, 9);
  assert.equal(p.current.label, 'Deposit received');
  assert.equal(p.closed, false);
});

test('warnings: missing documents, dates out of order, defects outcome', () => {
  const w = dealWarnings(deal({
    stages: { offer: at('2026-11-05', ['writtenOffer']), moa: at('2026-11-03', ['moaBuyer', 'moaSeller', 'kyc']), defects: at('2026-11-10', ['defectsList']) },
  }));
  assert.ok(w.some((x) => x.startsWith('Offer agreed: still missing offer accepted by the seller in writing')));
  assert.ok(w.some((x) => x === 'MOA signed is dated before offer agreed. Check the dates.'));
  assert.ok(w.some((x) => x.startsWith('Defects stage: record whether')));
  assert.ok(dealWarnings(deal({ defectsOutcome: 'price reduced' })).some((x) => x.includes('enter the price reduction')));
});

test('a new deal needs a boat, a buyer reference and a price', () => {
  assert.equal(validateDeal({ listingId: 'x', buyer: 'B-1', agreedPrice: '640,000' }).agreedPrice, 640000);
  assert.deepEqual(Object.keys(validateDeal({ listingId: '', buyer: '', agreedPrice: '0' }).errors).sort(), ['agreedPrice', 'buyer', 'listingId']);
});

// ---- The sample deal -------------------------------------------------------

test('sample deal: on a real listing, four stages done, survey next, no warnings', () => {
  assert.ok(forSale.some((b) => b.id === sample.listingId));
  assert.equal(sample.example, true);
  const p = dealProgress(sample);
  assert.equal(p.done, 4);
  assert.equal(p.current.label, 'Survey');
  assert.deepEqual(dealWarnings(sample), []);
});

test('sample deal figures: USD 640,000', () => {
  const f = dealFigures(sample, settings);
  assert.deepEqual(f.deposit, { amount: 64000, dueDate: '2026-11-09', percent: 10, bankingDays: 4 }); // MOA Tue 3 Nov
  assert.equal(f.balance, 576000);
  assert.equal(f.commission.amount, 64000);
  assert.equal(depositStatus(sample, settings, TODAY).text, 'Received 6 Nov 2026');
});
