import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ratesFromSettings, convert, formatMoney, rateNote, groupThousands } from '../src/calc/currency.js';

// Made-up round rates for testing only. Real rates live in Settings.
const rates = {
  EUR: { perEur: 1, dateChecked: null },
  GBP: { perEur: 0.8, dateChecked: '2026-11-17' },
  USD: { perEur: 1.25, dateChecked: '2026-11-17' },
};

test('convert from euros', () => {
  assert.equal(convert(100000, 'EUR', 'GBP', rates), 80000);
  assert.equal(convert(100000, 'EUR', 'USD', rates), 125000);
});

test('convert into euros (e.g. a yacht priced in USD against a euro budget)', () => {
  assert.equal(convert(125000, 'USD', 'EUR', rates), 100000);
});

test('convert between GBP and USD goes via euros', () => {
  assert.equal(convert(80000, 'GBP', 'USD', rates), 125000);
});

test('same currency comes back unchanged', () => {
  assert.equal(convert(555, 'USD', 'USD', rates), 555);
});

test('a missing rate gives null, never a wrong number', () => {
  const noRates = ratesFromSettings([]);
  assert.equal(convert(100000, 'EUR', 'GBP', noRates), null);
  assert.equal(convert(null, 'EUR', 'GBP', rates), null);
});

test('ratesFromSettings reads rates and dates from the settings list', () => {
  const settings = [
    { id: 'currency.gbpPerEur', value: 0.8, dateChecked: '2026-11-17' },
    { id: 'currency.usdPerEur', value: null, dateChecked: null },
  ];
  const result = ratesFromSettings(settings);
  assert.equal(result.EUR.perEur, 1);
  assert.equal(result.GBP.perEur, 0.8);
  assert.equal(result.GBP.dateChecked, '2026-11-17');
  assert.equal(result.USD.perEur, null);
});

test('formatMoney uses symbols and thousands separators', () => {
  assert.equal(formatMoney(1150000, 'EUR'), '€1,150,000');
  assert.equal(formatMoney(255000, 'USD'), '$255,000');
  assert.equal(formatMoney(80000, 'GBP'), '£80,000');
  assert.equal(formatMoney(1234.5, 'EUR', 2), '€1,234.50');
  assert.equal(formatMoney(-5000, 'EUR'), '-€5,000');
  assert.equal(formatMoney(null, 'EUR'), 'Not set');
});

test('rateNote says which rate was used and when it was checked', () => {
  assert.equal(rateNote('EUR', rates), '');
  assert.equal(rateNote('USD', rates), 'EUR 1 = USD 1.25, rate checked 17 Nov 2026');
  assert.equal(rateNote('GBP', ratesFromSettings([])), 'No GBP rate set. Add one in Settings.');
});

test('groupThousands adds commas as an amount is typed', () => {
  assert.equal(groupThousands('250000'), '250,000');
  assert.equal(groupThousands('1250000'), '1,250,000');
  assert.equal(groupThousands('999'), '999');
  assert.equal(groupThousands('2,50,000'), '250,000');
  assert.equal(groupThousands(250000), '250,000');
  assert.equal(groupThousands('1234.5'), '1,234.5');
  assert.equal(groupThousands('1234.567'), '1,234.56');
  assert.equal(groupThousands('1234.'), '1,234.');
  assert.equal(groupThousands('.5'), '0.5');
  assert.equal(groupThousands('00250'), '250');
  assert.equal(groupThousands('€250k'), '250');
  assert.equal(groupThousands(''), '');
  assert.equal(groupThousands(null), '');
});
