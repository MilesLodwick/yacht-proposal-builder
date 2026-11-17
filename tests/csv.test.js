import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCSV, parseCSVObjects, toCSV } from '../src/csv.js';

test('simple rows', () => {
  assert.deepEqual(parseCSV('a,b\n1,2\n'), [['a', 'b'], ['1', '2']]);
});

test('quoted values with commas', () => {
  assert.deepEqual(parseCSV('Location\n"Lymington, UK"'), [['Location'], ['Lymington, UK']]);
});

test('doubled quotes inside quoted values', () => {
  assert.deepEqual(parseCSV('"The ""Big"" One",x'), [['The "Big" One', 'x']]);
});

test('line breaks inside quoted values', () => {
  assert.deepEqual(parseCSV('"line one\nline two",x'), [['line one\nline two', 'x']]);
});

test('Windows line endings, Excel BOM and blank lines', () => {
  assert.deepEqual(parseCSV('﻿a,b\r\n1,2\r\n\r\n'), [['a', 'b'], ['1', '2']]);
});

test('empty values are kept in place', () => {
  assert.deepEqual(parseCSV('a,,c'), [['a', '', 'c']]);
});

test('a row of nothing but commas counts as blank and is skipped', () => {
  assert.deepEqual(parseCSV('a,b\n,,\n1,2'), [['a', 'b'], ['1', '2']]);
});

test('parseCSVObjects uses the header row as names', () => {
  const { headers, rows } = parseCSVObjects('Firm,Yacht\nEdmiston,Arrow\nY.CO, Bold ');
  assert.deepEqual(headers, ['Firm', 'Yacht']);
  assert.deepEqual(rows, [{ Firm: 'Edmiston', Yacht: 'Arrow' }, { Firm: 'Y.CO', Yacht: 'Bold' }]);
});

test('toCSV quotes only when needed', () => {
  assert.equal(toCSV([['a', 'Lymington, UK', 'say "hi"', null]]), 'a,"Lymington, UK","say ""hi""",\r\n');
});

test('writing then reading gives back the same values', () => {
  const rows = [['Name', 'Note'], ['O\'Pari', 'Refit 2025, "check"\nsecond line']];
  assert.deepEqual(parseCSV(toCSV(rows)), rows);
});

test('the real yachts.csv reads with 158 yachts', () => {
  const text = readFileSync(new URL('../data/yachts.csv', import.meta.url), 'utf8');
  const { headers, rows } = parseCSVObjects(text);
  assert.ok(headers.includes('Source URL'));
  assert.equal(rows.length, 158);
});
