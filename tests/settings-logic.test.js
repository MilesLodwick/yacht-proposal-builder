// Tests for how settings are combined with the user's changes, checked
// before saving, and shown on screen.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeSettings, validateSettingInput, formatSettingValue } from '../src/store.js';

const TODAY = '2026-11-17';

const defaults = [
  { id: 'apa.default', label: 'APA', value: 30, unit: '% of charter fee', source: 'IYC', sourceUrl: null, dateChecked: null },
  { id: 'currency.usdPerEur', label: 'USD per 1 EUR', value: null, unit: 'rate', source: null, sourceUrl: null, dateChecked: null },
  { id: 'sale.depositBankingDays', label: 'Deposit due', value: 4, unit: 'banking days', source: 'Breeze', sourceUrl: null, dateChecked: null },
];

const apa = mergeSettings(defaults, {})[0];
const usd = mergeSettings(defaults, {})[1];
const bankingDays = mergeSettings(defaults, {})[2];

// A valid form submission, changed one field at a time in each test.
const form = { value: '30', source: 'IYC', sourceUrl: '', dateChecked: '' };

test('with no changes, defaults show through', () => {
  const merged = mergeSettings(defaults, {});
  assert.equal(merged[0].value, 30);
  assert.equal(merged[0].changed, false);
});

test('a saved change replaces the default and remembers the original', () => {
  const merged = mergeSettings(defaults, { 'apa.default': { value: 35, dateChecked: '2026-11-17' } });
  assert.equal(merged[0].value, 35);
  assert.equal(merged[0].dateChecked, '2026-11-17');
  assert.equal(merged[0].source, 'IYC'); // not changed, so the default stays
  assert.equal(merged[0].changed, true);
  assert.equal(merged[0].defaults.value, 30);
});

test('changes for settings that no longer exist are ignored', () => {
  const merged = mergeSettings(defaults, { 'old.setting': { value: 1 } });
  assert.equal(merged.length, 3);
});

test('a valid entry is accepted and tidied', () => {
  const result = validateSettingInput(apa, { ...form, value: ' 35 ', source: '  IYC charter guide ', sourceUrl: 'https://example.com/apa', dateChecked: '2026-11-17' }, TODAY);
  assert.equal(result.ok, true);
  assert.deepEqual(result.fields, { value: 35, source: 'IYC charter guide', sourceUrl: 'https://example.com/apa', dateChecked: '2026-11-17' });
});

test('empty source, link and date are saved as empty (shown as "to be checked")', () => {
  const result = validateSettingInput(apa, { value: '30', source: '', sourceUrl: '', dateChecked: '' }, TODAY);
  assert.equal(result.ok, true);
  assert.equal(result.fields.source, null);
  assert.equal(result.fields.dateChecked, null);
});

test('value must be a number', () => {
  const result = validateSettingInput(apa, { ...form, value: 'thirty' }, TODAY);
  assert.equal(result.ok, false);
  assert.ok(result.errors.value);
});

test('value cannot be empty unless the default is empty', () => {
  assert.equal(validateSettingInput(apa, { ...form, value: '' }, TODAY).ok, false);
  const rate = validateSettingInput(usd, { ...form, value: '' }, TODAY);
  assert.equal(rate.ok, true);
  assert.equal(rate.fields.value, null);
});

test('percentages must be between 0 and 100', () => {
  assert.equal(validateSettingInput(apa, { ...form, value: '120' }, TODAY).ok, false);
  assert.equal(validateSettingInput(apa, { ...form, value: '-5' }, TODAY).ok, false);
  assert.equal(validateSettingInput(apa, { ...form, value: '5.2' }, TODAY).ok, true);
});

test('currency rates must be above 0 and may have decimals', () => {
  assert.equal(validateSettingInput(usd, { ...form, value: '0' }, TODAY).ok, false);
  assert.equal(validateSettingInput(usd, { ...form, value: '1.1634' }, TODAY).fields.value, 1.1634);
});

test('days must be whole numbers', () => {
  assert.equal(validateSettingInput(bankingDays, { ...form, value: '4.5' }, TODAY).ok, false);
  assert.equal(validateSettingInput(bankingDays, { ...form, value: '5' }, TODAY).ok, true);
});

test('source link must be a full web address', () => {
  assert.equal(validateSettingInput(apa, { ...form, sourceUrl: 'iyc.com' }, TODAY).ok, false);
  assert.equal(validateSettingInput(apa, { ...form, sourceUrl: 'https://www.iyc.com/apa' }, TODAY).ok, true);
});

test('date checked must be real and not in the future', () => {
  assert.equal(validateSettingInput(apa, { ...form, dateChecked: '2026-02-30' }, TODAY).ok, false);
  assert.equal(validateSettingInput(apa, { ...form, dateChecked: '2026-11-18' }, TODAY).ok, false);
  assert.equal(validateSettingInput(apa, { ...form, dateChecked: '2026-11-17' }, TODAY).ok, true);
});

test('formatSettingValue reads naturally', () => {
  assert.equal(formatSettingValue(apa), '30% of charter fee');
  assert.equal(formatSettingValue(bankingDays), '4 banking days');
  assert.equal(formatSettingValue(usd), 'Not set');
  assert.equal(formatSettingValue({ ...usd, value: 1.1634 }), '1.1634');
  assert.equal(formatSettingValue({ value: 5.2, unit: '%' }), '5.2%');
});
