import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHECKLIST, checklistProgress, paymentStatus, contractSchedule, buildSampleContracts } from '../src/contracts.js';
import { buildSamples } from '../src/enquiries.js';
import { importCSV } from '../src/yachts.js';
import { ratesFromSettings } from '../src/calc/currency.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const TODAY = '2026-11-17';
const { settings } = JSON.parse(read('../data/settings.json'));
const rates = ratesFromSettings(settings);
const yachts = importCSV('yachts', read('../data/yachts.csv')).records;
const enquiries = buildSamples(JSON.parse(read('../data/sample-enquiries.json')).enquiries, TODAY);
const contracts = buildSampleContracts(JSON.parse(read('../data/sample-contracts.json')).contracts, TODAY);

const scheduleFor = (clientName, overrides = {}) => {
  const enquiry = enquiries.find((e) => e.clientName === clientName);
  const contract = { ...contracts.find((c) => c.enquiryId === enquiry.id), ...overrides };
  const yacht = yachts.find((y) => y.id === contract.yachtId);
  return contractSchedule({ contract, enquiry, yacht, settings, rates, today: TODAY });
};

// ---- Checklist -------------------------------------------------------------

test('the checklist has the seven items from the brief, in order', () => {
  assert.deepEqual(CHECKLIST.map((c) => c.id), ['kyc', 'contractSigned', 'depositReceived', 'balanceReceived', 'apaReceived', 'preferenceSheet', 'guestList']);
});

test('checklist progress counts the items done', () => {
  assert.deepEqual(checklistProgress({ kyc: '2026-11-01', contractSigned: '2026-11-02', guestList: null }), { done: 2, total: 7 });
  assert.deepEqual(checklistProgress(undefined), { done: 0, total: 7 });
});

// ---- Payment status --------------------------------------------------------

test('payment status: received, overdue, due today, due soon, later', () => {
  const s = (fields) => paymentStatus({ signed: true, ...fields }, TODAY, 14);
  assert.deepEqual(s({ dueDate: '2026-11-10', receivedOn: '2026-11-09' }), { tone: 'green', text: 'Received 9 Nov 2026' });
  assert.deepEqual(s({ dueDate: '2026-11-13' }), { tone: 'red', text: 'Overdue by 4 days' });
  assert.deepEqual(s({ dueDate: '2026-11-16' }), { tone: 'red', text: 'Overdue by 1 day' });
  assert.deepEqual(s({ dueDate: '2026-11-17' }), { tone: 'amber', text: 'Due today' });
  assert.deepEqual(s({ dueDate: '2026-11-18' }), { tone: 'amber', text: 'Due in 1 day' });
  assert.deepEqual(s({ dueDate: '2026-12-01' }), { tone: 'amber', text: 'Due in 14 days' });
  assert.deepEqual(s({ dueDate: '2026-12-02' }), { tone: 'neutral', text: 'Due 2 Dec 2026' });
});

test('deposit before signing is "due on signing", not overdue', () => {
  assert.deepEqual(paymentStatus({ dueDate: '2026-01-01', dueOnSigning: true, signed: false }, TODAY, 14), { tone: 'neutral', text: 'Due on signing' });
});

// ---- Schedules for the sample contracts ------------------------------------

test('Ruiz (signed, Caribbean, Te Manu): balance and APA due in 6 days', () => {
  const s = scheduleFor('Sofia and Mateo Ruiz');
  assert.equal(s.total, 254800); // 196,000 + 0% VAT + 58,800 APA
  const [deposit, balance, apa] = s.payments;
  assert.equal(deposit.amount, 98000);
  assert.equal(deposit.status.text, 'Received 30 Oct 2026');
  assert.equal(balance.amount, 98000);
  assert.equal(balance.dueDate, '2026-11-23');
  assert.deepEqual(balance.status, { tone: 'amber', text: 'Due in 6 days' });
  assert.equal(apa.amount, 58800);
  assert.deepEqual(apa.status, { tone: 'amber', text: 'Due in 6 days' });
});

test('Whitcombe (Bahamas, Santosha in USD): uses the 14% VAT option chosen', () => {
  const s = scheduleFor('The Whitcombe family');
  assert.equal(s.currency, 'USD');
  assert.equal(s.vatLabel, 'Bahamas (higher figure)');
  assert.equal(s.total, 576000); // 400,000 + 56,000 VAT + 120,000 APA
  const [deposit, balance, apa] = s.payments;
  assert.equal(deposit.amount, 200000);
  assert.equal(balance.amount, 256000);
  assert.equal(balance.status.tone, 'green');
  assert.deepEqual(apa.status, { tone: 'neutral', text: 'Due 15 Dec 2026' });
});

test('switching to the other Bahamas VAT figure changes the balance', () => {
  const s = scheduleFor('The Whitcombe family', { vatOption: 0 });
  assert.equal(s.total, 560000); // 10% VAT
  assert.equal(s.payments[1].amount, 240000);
});

test('Brennan (contract out, not signed): deposit due on signing', () => {
  const s = scheduleFor('The Brennan party');
  assert.equal(s.signed, false);
  assert.equal(s.total, 164450); // 115,000 + 13% VAT + 30% APA
  assert.deepEqual(s.payments[0].status, { tone: 'neutral', text: 'Due on signing' });
});

test('a delivery fee is added to the balance, with its VAT', () => {
  const s = scheduleFor('The Brennan party', { deliveryFee: 10000 });
  assert.equal(s.total, 164450 + 10000 + 1300);
  assert.equal(s.payments[1].amount, 57500 + 10000 + 14950 + 1300);
});

test('payments add up to the total for every sample contract', () => {
  for (const name of ['The Brennan party', 'Sofia and Mateo Ruiz', 'The Whitcombe family', 'The Ostrowski party']) {
    const s = scheduleFor(name);
    assert.equal(Math.round(s.payments.reduce((t, p) => t + p.amount, 0) * 100) / 100, s.total, name);
  }
});

test('Ostrowski (on charter): every payment received', () => {
  const s = scheduleFor('The Ostrowski party');
  assert.ok(s.payments.every((p) => p.status.tone === 'green'));
});

// ---- Sample data -----------------------------------------------------------

test('sample contracts point at real yachts and sample enquiries', () => {
  for (const c of contracts) {
    assert.ok(yachts.some((y) => y.id === c.yachtId), `${c.yachtId} is not in yachts.csv`);
    assert.ok(enquiries.some((e) => e.id === c.enquiryId), `${c.enquiryId} is not a sample enquiry`);
    assert.equal(c.example, true);
  }
});

test('sample checklists match each enquiry status', () => {
  const progress = (name) => checklistProgress(contracts.find((c) => c.enquiryId === enquiries.find((e) => e.clientName === name).id).checklist).done;
  assert.equal(progress('The Brennan party'), 1);    // contract out: KYC only
  assert.equal(progress('Sofia and Mateo Ruiz'), 3); // signed, deposit paid
  assert.equal(progress('The Ostrowski party'), 7);  // on charter: all done
});
