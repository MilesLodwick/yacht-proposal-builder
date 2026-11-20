import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, validateImport, hasExampleData, removeExampleData, countRecords, newSamplesToAdd } from '../src/store.js';

// A small saved state with one sample enquiry and one real one.
function sampleState() {
  return {
    ...createEmptyState(),
    collections: {
      enquiries: [
        { id: 'e1', client: 'Fictional Client', example: true },
        { id: 'e2', client: 'My own entry' },
      ],
      yachts: [{ id: 'y1', name: 'Sunrays' }],
    },
  };
}

test('an exported file can be imported again', () => {
  const exported = JSON.stringify(sampleState());
  const result = validateImport(exported);
  assert.equal(result.ok, true);
  assert.equal(result.state.collections.enquiries.length, 2);
});

test('import rejects a file that is not JSON', () => {
  const result = validateImport('not json at all');
  assert.equal(result.ok, false);
  assert.equal(result.error, 'This file is not valid JSON.');
});

test('import rejects JSON from another app', () => {
  const result = validateImport(JSON.stringify({ some: 'thing' }));
  assert.equal(result.ok, false);
  assert.equal(result.error, 'This file was not exported from Yacht Proposal Builder.');
});

test('import rejects a file from a newer version', () => {
  const result = validateImport(JSON.stringify({ ...createEmptyState(), version: 99 }));
  assert.equal(result.ok, false);
});

test('import rejects records that are not lists', () => {
  const bad = { ...createEmptyState(), collections: { enquiries: 'oops' } };
  const result = validateImport(JSON.stringify(bad));
  assert.equal(result.ok, false);
  assert.match(result.error, /enquiries/);
});

test('hasExampleData spots sample records', () => {
  assert.equal(hasExampleData(sampleState()), true);
  assert.equal(hasExampleData(createEmptyState()), false);
});

test('removeExampleData keeps the user\'s own records', () => {
  const cleaned = removeExampleData(sampleState());
  assert.equal(hasExampleData(cleaned), false);
  assert.deepEqual(cleaned.collections.enquiries.map((r) => r.id), ['e2']);
  assert.equal(cleaned.collections.yachts.length, 1);
});

test('removeExampleData does not change the original', () => {
  const original = sampleState();
  removeExampleData(original);
  assert.equal(original.collections.enquiries.length, 2);
});

test('countRecords counts each kind of record', () => {
  assert.deepEqual(countRecords(sampleState()), { enquiries: 2, yachts: 1 });
});

test('later samples are added once to a browser that already has data', () => {
  const samples = [{ id: 's1' }, { id: 's2', addedIn: '2026-11-20' }, { id: 's3', addedIn: '2026-11-20' }];
  // Has the first sample only: the two new ones are added, the old one is not re-added.
  assert.deepEqual(newSamplesToAdd([{ id: 'mine' }], samples, []).map((s) => s.id), ['s2', 's3']);
  // Already offered (the user deleted s3): nothing comes back.
  assert.deepEqual(newSamplesToAdd([{ id: 's2' }], samples, ['s2', 's3']), []);
  // Already there: not added twice.
  assert.deepEqual(newSamplesToAdd([{ id: 's2' }], samples, []).map((s) => s.id), ['s3']);
});
