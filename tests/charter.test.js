// Tests for the charter maths. Figures are chosen so they can be checked
// on a calculator.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  roundMoney, charterSettings, vatRatesFor, vatOnApaFor, proRataFee, costBreakdown,
  budgetBand, paymentSchedule, EMBARKATION_COUNTRIES, LINE_LABELS, VAT_NOTE,
} from '../src/calc/charter.js';

const { settings } = JSON.parse(readFileSync(new URL('../data/settings.json', import.meta.url), 'utf8'));

// A 7-day charter starting in Italy on a EUR 350,000 a week yacht, with a
// EUR 10,000 delivery fee and EUR 7,500 of extras. Used in several tests.
const italy = costBreakdown({
  weeklyRate: 350000, days: 7, vatRate: 22, apaPercent: 30,
  deliveryFee: 10000, extras: [{ label: 'Jet ski', amount: 5000 }, { label: 'Chef upgrade', amount: 2500 }],
  gratuityLowPercent: 10, gratuityHighPercent: 20,
});

// ---- Rounding --------------------------------------------------------------

test('roundMoney rounds to the cent', () => {
  assert.equal(roundMoney(0.1 + 0.2), 0.3);
  assert.equal(roundMoney(42857.142857), 42857.14);
  assert.equal(roundMoney(1.005), 1.01);
});

// ---- Settings --------------------------------------------------------------

test('charterSettings reads the defaults from settings.json', () => {
  assert.deepEqual(charterSettings(settings), {
    apaPercent: 30, gratuityLowPercent: 10, gratuityHighPercent: 20, budgetTolerancePercent: 10,
    depositPercent: 50, balanceDaysBefore: 30, apaDaysBefore: 30,
  });
});

// ---- VAT -------------------------------------------------------------------

test('VAT rate for each embarkation country comes from settings', () => {
  const rate = (country) => vatRatesFor(country, settings).map((v) => v.rate);
  assert.deepEqual(rate('france'), [20]);
  assert.deepEqual(rate('italy'), [22]);
  assert.deepEqual(rate('spain'), [21]);
  assert.deepEqual(rate('croatia'), [13]);
  assert.deepEqual(rate('montenegro'), [0]);
  assert.deepEqual(rate('caribbean'), [0]);
});

test('Greece: reduced rate when eligible, standard rate when not', () => {
  assert.deepEqual(vatRatesFor('greece', settings, { greekEligible: true }).map((v) => v.rate), [5.2]);
  assert.deepEqual(vatRatesFor('greece', settings, { greekEligible: false }).map((v) => v.rate), [24]);
});

test('Bahamas returns both rates because sources disagree', () => {
  assert.deepEqual(vatRatesFor('bahamas', settings).map((v) => v.rate), [10, 14]);
});

test('a changed VAT setting is used straight away', () => {
  const changed = settings.map((s) => (s.id === 'vat.italy' ? { ...s, value: 10 } : s));
  assert.deepEqual(vatRatesFor('italy', changed).map((v) => v.rate), [10]);
});

test('every embarkation country points at settings that exist', () => {
  for (const country of EMBARKATION_COUNTRIES) {
    for (const id of [...country.vat, ...(country.vatIfNotEligible ?? []), country.vatOnApa]) {
      assert.ok(settings.some((s) => s.id === id), `${country.id} uses missing setting ${id}`);
    }
  }
});

test('an unknown country gives no rate rather than a wrong one', () => {
  assert.deepEqual(vatRatesFor('atlantis', settings), []);
  assert.equal(vatOnApaFor('atlantis', settings), false);
});

test('VAT on APA is off by default and follows the per-country setting', () => {
  for (const country of EMBARKATION_COUNTRIES) assert.equal(vatOnApaFor(country.id, settings), false);
  const changed = settings.map((s) => (s.id === 'vatOnApa.france' ? { ...s, value: true } : s));
  assert.equal(vatOnApaFor('france', changed), true);
  assert.equal(vatOnApaFor('italy', changed), false);
});

// ---- Charter fee -----------------------------------------------------------

test('pro rata fee: weekly rate / 7 x days', () => {
  assert.equal(proRataFee(350000, 7), 350000);
  assert.equal(proRataFee(350000, 10), 500000);
  assert.equal(proRataFee(350000, 3), 150000);
  assert.equal(proRataFee(100000, 3), 42857.14);
});

// ---- Cost breakdown --------------------------------------------------------

test('cost breakdown with a delivery fee: Italy, 7 days, EUR 350,000 a week', () => {
  assert.equal(italy.charterFee, 350000);
  assert.equal(italy.deliveryFee, 10000);
  assert.equal(italy.vatBase, 360000);   // charter fee + delivery fee
  assert.equal(italy.vat, 79200);        // 22% of 360,000
  assert.equal(italy.apa, 105000);       // 30% of 350,000 (charter fee only)
  assert.equal(italy.apaVat, 0);         // no VAT on APA by default
  assert.equal(italy.extrasTotal, 7500); // 5,000 + 2,500, no VAT
  assert.equal(italy.total, 551700);     // 350,000 + 10,000 + 7,500 + 79,200 + 105,000
});

test('VAT is charged on the delivery fee', () => {
  const without = costBreakdown({ weeklyRate: 350000, days: 7, vatRate: 22, apaPercent: 30 });
  assert.equal(italy.vat - without.vat, 2200); // 22% of the 10,000 delivery fee
});

test('VAT is charged on delivery and redelivery fees: Croatia', () => {
  const croatia = costBreakdown({ weeklyRate: 140000, days: 7, vatRate: 13, apaPercent: 30, deliveryFee: 8000, redeliveryFee: 8000 });
  assert.equal(croatia.vatBase, 156000);  // 140,000 + 8,000 + 8,000
  assert.equal(croatia.vat, 20280);       // 13% of 156,000
  assert.equal(croatia.apa, 42000);       // 30% of 140,000
  assert.equal(croatia.total, 218280);    // 156,000 + 20,280 + 42,000
});

test('VAT is not charged on APA unless the country setting is on', () => {
  const off = costBreakdown({ weeklyRate: 100000, days: 7, vatRate: 20, apaPercent: 30 });
  assert.equal(off.apaVat, 0);
  assert.equal(off.total, 150000);       // 100,000 + 20,000 VAT + 30,000 APA

  const on = costBreakdown({ weeklyRate: 100000, days: 7, vatRate: 20, apaPercent: 30, vatOnApa: true });
  assert.equal(on.apaVat, 6000);         // 20% of 30,000 APA
  assert.equal(on.vat, 20000);           // VAT on the fee is unchanged
  assert.equal(on.total, 156000);
});

test('APA is worked out on the charter fee before VAT, not on delivery', () => {
  assert.equal(italy.apa, 350000 * 0.3);
});

test('gratuity is a guide only: not in the total, never with VAT', () => {
  assert.deepEqual(italy.gratuityGuide, { low: 35000, high: 70000 }); // 10% and 20% of 350,000
  const withApaVat = costBreakdown({ weeklyRate: 350000, days: 7, vatRate: 22, apaPercent: 30, vatOnApa: true, gratuityLowPercent: 10, gratuityHighPercent: 20 });
  assert.deepEqual(withApaVat.gratuityGuide, { low: 35000, high: 70000 });
  assert.equal(italy.total, italy.charterFee + italy.deliveryFee + italy.extrasTotal + italy.vat + italy.apa);
});

test('Greek eligible charter at 5.2% VAT', () => {
  const greece = costBreakdown({ weeklyRate: 100000, days: 7, vatRate: 5.2, apaPercent: 30 });
  assert.equal(greece.vat, 5200);
  assert.equal(greece.total, 135200);
});

test('no VAT in Montenegro, even with a delivery fee', () => {
  const montenegro = costBreakdown({ weeklyRate: 100000, days: 7, vatRate: 0, apaPercent: 30, deliveryFee: 5000 });
  assert.equal(montenegro.vat, 0);
  assert.equal(montenegro.total, 135000);
});

test('no delivery fee or extras means they count as zero', () => {
  const plain = costBreakdown({ weeklyRate: 70000, days: 7, vatRate: 20, apaPercent: 25 });
  assert.equal(plain.deliveryFee, 0);
  assert.equal(plain.redeliveryFee, 0);
  assert.equal(plain.extrasTotal, 0);
  assert.equal(plain.total, 70000 + 14000 + 17500);
});

// ---- Wording ---------------------------------------------------------------

test('APA is labelled refundable if unspent', () => {
  assert.equal(LINE_LABELS.apa, 'APA (refundable if unspent)');
});

test('the VAT note explains the embarkation country rule', () => {
  assert.equal(VAT_NOTE, 'VAT uses the rate of the country where the charter starts. Some countries, such as Croatia, charge VAT on days spent in their waters, so multi-country charters can differ.');
  assert.ok(!VAT_NOTE.includes('—') && !Object.values(LINE_LABELS).join('').includes('—'));
});

// ---- Budget band -----------------------------------------------------------

test('budget band: within, slightly over (up to 10%), over budget', () => {
  assert.equal(budgetBand(90000, 100000, 10).id, 'within');
  assert.equal(budgetBand(100000, 100000, 10).id, 'within');  // exactly on budget
  assert.equal(budgetBand(105000, 100000, 10).id, 'over');
  assert.equal(budgetBand(110000, 100000, 10).id, 'over');    // exactly 10% over still counts
  assert.equal(budgetBand(110001, 100000, 10).id, 'out');
});

test('budget band gives the % over (negative when under)', () => {
  assert.equal(budgetBand(105000, 100000, 10).percentOver, 5);
  assert.equal(budgetBand(90000, 100000, 10).percentOver, -10);
});

test('budget band follows the tolerance setting', () => {
  assert.equal(budgetBand(115000, 100000, 20).id, 'over');
  assert.equal(budgetBand(115000, 100000, 10).id, 'out');
});

test('budget compares the all-in total, without the gratuity guide', () => {
  // Italy total is 551,700. A 550,000 budget is slightly over, not out,
  // even though adding a gratuity would push it far over.
  assert.equal(budgetBand(italy.total, 550000, 10).id, 'over');
});

// ---- Payment schedule ------------------------------------------------------

const normalBooking = paymentSchedule({
  breakdown: italy, signingDate: '2027-03-01', embarkationDate: '2027-07-10',
  depositPercent: 50, balanceDaysBefore: 30, apaDaysBefore: 30,
});

test('payment schedule with a delivery fee: deposit, balance, APA', () => {
  const [deposit, balance, apa] = normalBooking;
  assert.equal(deposit.amount, 175000);   // 50% of 350,000
  assert.equal(deposit.dueDate, '2027-03-01');
  assert.equal(balance.amount, 271700);   // 175,000 + 10,000 delivery + 7,500 extras + 79,200 VAT
  assert.equal(balance.dueDate, '2027-06-10');
  assert.equal(apa.amount, 105000);
  assert.equal(apa.label, 'APA');
  assert.equal(apa.dueDate, '2027-06-10');
});

test('payments always add up to the total', () => {
  const sum = normalBooking.reduce((s, p) => s + p.amount, 0);
  assert.equal(roundMoney(sum), italy.total);

  // Awkward numbers too: 3 days on EUR 100,000 a week, with delivery and redelivery.
  const awkward = costBreakdown({ weeklyRate: 100000, days: 3, vatRate: 22, apaPercent: 30, deliveryFee: 3333.33, redeliveryFee: 1234.56 });
  const payments = paymentSchedule({ breakdown: awkward, signingDate: '2027-01-04', embarkationDate: '2027-05-01', depositPercent: 50, balanceDaysBefore: 30, apaDaysBefore: 30 });
  assert.equal(roundMoney(payments.reduce((s, p) => s + p.amount, 0)), awkward.total);
});

test('VAT on APA is paid with the APA', () => {
  const breakdown = costBreakdown({ weeklyRate: 100000, days: 7, vatRate: 20, apaPercent: 30, vatOnApa: true });
  const [deposit, balance, apa] = paymentSchedule({ breakdown, signingDate: '2027-03-01', embarkationDate: '2027-07-10', depositPercent: 50, balanceDaysBefore: 30, apaDaysBefore: 30 });
  assert.equal(apa.amount, 36000);        // 30,000 APA + 6,000 VAT on APA
  assert.equal(apa.label, 'APA plus VAT on APA');
  assert.equal(deposit.amount + balance.amount + apa.amount, breakdown.total);
});

test('late booking: payments already overdue are due on signing', () => {
  const [, balance, apa] = paymentSchedule({
    breakdown: italy, signingDate: '2027-06-20', embarkationDate: '2027-07-10',
    depositPercent: 50, balanceDaysBefore: 30, apaDaysBefore: 30,
  });
  assert.equal(balance.dueDate, '2027-06-20');
  assert.equal(balance.onSigning, true);
  assert.equal(apa.dueDate, '2027-06-20');
});

test('payment terms follow the settings', () => {
  const [deposit, balance, apa] = paymentSchedule({
    breakdown: italy, signingDate: '2027-03-01', embarkationDate: '2027-07-10',
    depositPercent: 30, balanceDaysBefore: 45, apaDaysBefore: 14,
  });
  assert.equal(deposit.amount, 105000);
  assert.equal(balance.dueDate, '2027-05-26');
  assert.equal(apa.dueDate, '2027-06-26');
});
