// Checks that data/settings.json is complete and sensible.
// If someone edits the file by hand and makes a mistake, these tests fail.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const file = new URL('../data/settings.json', import.meta.url);
const { settings } = JSON.parse(readFileSync(file, 'utf8'));

// Look up one setting's value by its id, e.g. value('apa.default') gives 30.
const value = (id) => settings.find((s) => s.id === id).value;

test('every setting has all the required fields', () => {
  const required = ['id', 'group', 'label', 'value', 'unit', 'source', 'sourceUrl', 'dateChecked', 'note'];
  for (const s of settings) {
    for (const field of required) {
      assert.ok(field in s, `${s.id} is missing "${field}"`);
    }
  }
});

test('setting ids are unique', () => {
  const ids = settings.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('values are numbers, or null when not yet set', () => {
  for (const s of settings) {
    assert.ok(s.value === null || typeof s.value === 'number', `${s.id} value is not a number`);
  }
});

test('percentages are between 0 and 100', () => {
  for (const s of settings.filter((s) => s.unit.startsWith('%'))) {
    assert.ok(s.value >= 0 && s.value <= 100, `${s.id} is ${s.value}%`);
  }
});

test('dates checked are YYYY-MM-DD or null', () => {
  for (const s of settings) {
    assert.ok(s.dateChecked === null || /^\d{4}-\d{2}-\d{2}$/.test(s.dateChecked), `${s.id} date is "${s.dateChecked}"`);
  }
});

test('APA default sits inside its usual range', () => {
  const apa = settings.find((s) => s.id === 'apa.default');
  assert.ok(apa.value >= apa.min && apa.value <= apa.max);
});

// The retail broker and central agent shares are parts of the total
// commission, so they must add up to it exactly.
test('commission shares add up to the total commission', () => {
  assert.equal(value('commission.retailBroker') + value('commission.centralAgent'), value('commission.total'));
});

test('Bahamas keeps both figures because sources disagree', () => {
  assert.equal(value('vat.bahamas.lower'), 10);
  assert.equal(value('vat.bahamas.higher'), 14);
});

test('no em dashes in any user-facing text', () => {
  const text = JSON.stringify(settings);
  assert.ok(!text.includes('—'), 'found an em dash in settings.json');
});
