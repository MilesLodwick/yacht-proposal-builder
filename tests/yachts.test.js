import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { importCSV, exportCSV, checkPill, summarise, CHECK } from '../src/yachts.js';

const realYachts = readFileSync(new URL('../data/yachts.csv', import.meta.url), 'utf8');
const realForSale = readFileSync(new URL('../data/for-sale.csv', import.meta.url), 'utf8');

const HEADER = 'Firm,Yacht,Length (m),Guests,Rate from p/w,Currency,Your check,Source,Source URL,Checked,Notes';

test('a row becomes a yacht record with numbers, dates and source kept', () => {
  const { ok, records } = importCSV('yachts', `${HEADER}\nEdmiston,Sunrays,85.5,12,"1,150,000",EUR,To check,Edmiston management,https://www.edmiston.com/x,2026-11-17,Refit 2025`);
  assert.equal(ok, true);
  const y = records[0];
  assert.equal(y.id, 'edmiston-sunrays');
  assert.equal(y.lengthM, 85.5);
  assert.equal(y.guests, 12);
  assert.equal(y.rateFromWeekly, 1150000);
  assert.equal(y.currency, 'EUR');
  assert.equal(y.sourceUrl, 'https://www.edmiston.com/x');
  assert.equal(y.dateChecked, '2026-11-17');
  assert.equal(y.check, CHECK.TO_CHECK);
});

test('blank values stay blank, never guessed', () => {
  const { records } = importCSV('yachts', `${HEADER}\nEdmiston,Lady S,93,12,,,To check,,,,Rate on enquiry`);
  assert.equal(records[0].rateFromWeekly, null);
  assert.equal(records[0].currency, null);
  assert.equal(records[0].cruisingArea, null);
  assert.equal(records[0].dateChecked, null);
});

test('Excel-style UK dates are understood', () => {
  const { records } = importCSV('yachts', `${HEADER}\nY.CO,Bold,85,12,875000,EUR,To check,,,17/11/2026,`);
  assert.equal(records[0].dateChecked, '2026-11-17');
});

test('currency wording like "USD (Rightboat)" keeps the code and the wording', () => {
  const header = 'Firm,Boat,Asking price,Currency';
  const { records } = importCSV('forSale', `${header}\nBerthon,Swan 48,324732,USD (Rightboat)\nAncasta,Parker 750CC,45000,Not shown\nBerthon,Corby 30,,POA`);
  assert.equal(records[0].currency, 'USD');
  assert.equal(records[0].currencyAsListed, 'USD (Rightboat)');
  assert.equal(records[1].currency, null);
  assert.equal(records[1].currencyAsListed, 'Not shown');
  assert.equal(records[2].askingPrice, null);
  assert.equal(records[2].currencyAsListed, 'POA');
});

test('"Your check" becomes one of three statuses', () => {
  const rows = ['A,One,,,,,Verified', 'A,Two,,,,,Wrong or out of date', 'A,Three,,,,,To check', 'A,Four,,,,,'];
  const { records } = importCSV('yachts', `${HEADER}\n${rows.join('\n')}`);
  assert.deepEqual(records.map((r) => r.check), [CHECK.VERIFIED, CHECK.WRONG, CHECK.TO_CHECK, CHECK.TO_CHECK]);
});

test('the same yacht from two firms is two listings; same firm and name gets a suffix', () => {
  const { records } = importCSV('yachts', `${HEADER}\nY.CO,Whisper\nBurgess,WHISPER\nBerthon,Nautor Swan 48\nBerthon,Nautor Swan 48`);
  assert.deepEqual(records.map((r) => r.id), ['y-co-whisper', 'burgess-whisper', 'berthon-nautor-swan-48', 'berthon-nautor-swan-48-2']);
});

test('ids handle accents', () => {
  const { records } = importCSV('yachts', `${HEADER}\nY.CO,Kenshō`);
  assert.equal(records[0].id, 'y-co-kensho');
});

test('rows with no yacht name are skipped and counted', () => {
  const { records, skipped } = importCSV('yachts', `${HEADER}\nEdmiston,Arrow\nEdmiston,`);
  assert.equal(records.length, 1);
  assert.equal(skipped, 1);
});

test('a file without the right columns is rejected with a reason', () => {
  const result = importCSV('yachts', 'Name,Price\nArrow,900000');
  assert.equal(result.ok, false);
  assert.match(result.error, /"Firm" or "Yacht"/);
});

test('export then import gives back the same records', () => {
  const first = importCSV('yachts', realYachts).records;
  const again = importCSV('yachts', exportCSV('yachts', first)).records;
  assert.deepEqual(again, first);
  const sale = importCSV('forSale', realForSale).records;
  assert.deepEqual(importCSV('forSale', exportCSV('forSale', sale)).records, sale);
});

test('the real research sheet: every row imports with its source link and date', () => {
  const yachts = importCSV('yachts', realYachts);
  const sale = importCSV('forSale', realForSale);
  assert.equal(yachts.records.length, 158);
  assert.equal(sale.records.length, 134);
  for (const r of [...yachts.records, ...sale.records]) {
    assert.ok(r.sourceUrl?.startsWith('https://'), `${r.id} has no source link`);
    assert.ok(r.dateChecked, `${r.id} has no date checked`);
  }
});

test('checkPill: amber until verified', () => {
  assert.deepEqual(checkPill({ check: CHECK.TO_CHECK }), { tone: 'amber', text: 'Not yet verified' });
  assert.deepEqual(checkPill({ check: CHECK.VERIFIED }), { tone: 'green', text: 'Verified' });
  assert.deepEqual(checkPill({ check: CHECK.WRONG }), { tone: 'red', text: 'Wrong or out of date' });
});

test('summarise counts each status', () => {
  const records = [{ check: CHECK.VERIFIED }, { check: CHECK.TO_CHECK }, { check: CHECK.TO_CHECK }];
  assert.deepEqual(summarise(records), { total: 3, verified: 1, wrong: 0, toCheck: 2 });
});
