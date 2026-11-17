import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  COMPLIANCE_CATEGORIES, complianceList, complianceSummary, validateItem, validateManagedYacht, buildSampleManaged,
} from '../src/compliance.js';
import { importCSV } from '../src/yachts.js';

const TODAY = '2026-11-17';
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const sample = buildSampleManaged(JSON.parse(read('../data/sample-managed.json')), TODAY);
const realYachts = importCSV('yachts', read('../data/yachts.csv')).records;

test('the six categories from the brief', () => {
  assert.deepEqual(COMPLIANCE_CATEGORIES.map((c) => c.id), ['ism', 'isps', 'mlc', 'class', 'flag', 'insurance']);
});

test('the sample managed yacht is fictional, not a real listing', () => {
  const [yacht] = sample.yachts;
  assert.match(yacht.name, /fictional/);
  assert.equal(yacht.example, true);
  assert.ok(!realYachts.some((y) => y.name.toLowerCase() === yacht.name.toLowerCase()));
});

test('items are listed most urgent first', () => {
  const list = complianceList(sample.items, TODAY, 60);
  assert.equal(list[0].title, 'Ship security drill record review'); // expired 6 days ago
  assert.deepEqual(list.slice(1, 4).map((i) => i.status.days), [12, 12, 24]);
  assert.equal(list.at(-1).title, 'Class certificate'); // furthest away
});

test('audits, surveys and reviews are "due", certificates and policies "expire"', () => {
  const list = complianceList(sample.items, TODAY, 60);
  const text = (title) => list.find((i) => i.title === title).status.text;
  assert.equal(text('Ship security drill record review'), 'Overdue since 11 Nov 2026');
  assert.equal(text('ISM internal audit'), 'Due in 24 days');
  assert.equal(text('Annual class survey'), 'Next due 20 Feb 2027');
  assert.equal(text('P&I cover'), 'Expires in 12 days');
  assert.equal(text('Maritime Labour Certificate'), 'Expires in 47 days');
});

test('a missing date sorts straight after expired items', () => {
  const list = complianceList([
    { title: 'Later', expiresOn: '2027-06-01' },
    { title: 'No date', expiresOn: null },
    { title: 'Expired', expiresOn: '2026-11-01' },
  ], TODAY, 60);
  assert.deepEqual(list.map((i) => i.title), ['Expired', 'No date', 'Later']);
});

test('summary: red, amber and green counts for the sample yacht', () => {
  const s = complianceSummary(sample.items, TODAY, 60);
  assert.deepEqual(s.total, { red: 1, amber: 4, green: 5 }); // amber: 12, 12, 24 and 47 days
  const insurance = s.byCategory.find((c) => c.id === 'insurance');
  assert.deepEqual({ red: insurance.red, amber: insurance.amber, green: insurance.green }, { red: 0, amber: 2, green: 0 });
  assert.deepEqual(s.missingCategories, []);
});

test('categories with nothing recorded are listed', () => {
  const s = complianceSummary(sample.items.filter((i) => i.category !== 'flag'), TODAY, 60);
  assert.deepEqual(s.missingCategories, ['Flag']);
});

test('the amber window follows the setting', () => {
  assert.equal(complianceSummary(sample.items, TODAY, 30).total.amber, 3); // the MLC at 47 days turns green
});

test('items need a category and a title; dates must be real', () => {
  assert.equal(validateItem({ category: 'ism', title: 'SMC', expiresOn: '2027-01-01' }).ok, true);
  assert.equal(validateItem({ category: 'ism', title: 'SMC', expiresOn: '' }).ok, true); // date can be added later
  assert.deepEqual(Object.keys(validateItem({ category: 'x', title: ' ', expiresOn: '2027-02-30' }).errors).sort(), ['category', 'expiresOn', 'title']);
});

test('a managed yacht needs a name; length is optional but must be a number', () => {
  assert.equal(validateManagedYacht({ name: 'Test', lengthM: '' }).ok, true);
  assert.deepEqual(Object.keys(validateManagedYacht({ name: '', lengthM: 'long' }).errors).sort(), ['lengthM', 'name']);
});
