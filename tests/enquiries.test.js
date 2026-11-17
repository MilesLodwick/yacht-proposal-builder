import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STATUSES, statusTone, charterDays, statusCounts, needsReply, validateEnquiry, buildSamples } from '../src/enquiries.js';

const { enquiries: templates } = JSON.parse(readFileSync(new URL('../data/sample-enquiries.json', import.meta.url), 'utf8'));

// A valid form, changed one field at a time in the tests below.
const form = {
  clientName: 'Test Client', sourceType: 'Direct', brokerName: '',
  receivedAt: '2026-11-17T09:00', firstReplyAt: '',
  startDate: '2027-07-10', endDate: '2027-07-17', guests: '8',
  budget: '250,000', budgetCurrency: 'EUR', embarkationCountry: 'italy',
  status: 'New', lostReason: '', notes: '',
};

test('the pipeline is in the order from the brief', () => {
  assert.deepEqual(STATUSES, ['New', 'Proposal sent', 'Option held', 'Contract out', 'Signed', 'Balance paid', 'On charter', 'Completed', 'Lost']);
});

test('status colours: Completed green, Lost red, the rest neutral', () => {
  assert.equal(statusTone('Completed'), 'green');
  assert.equal(statusTone('Lost'), 'red');
  assert.equal(statusTone('Option held'), 'neutral');
});

test('charterDays: 10 Jul to 17 Jul is 7 days', () => {
  assert.equal(charterDays({ startDate: '2027-07-10', endDate: '2027-07-17' }), 7);
});

test('statusCounts counts each status in pipeline order', () => {
  const counts = statusCounts([{ status: 'New' }, { status: 'New' }, { status: 'Lost' }]);
  assert.equal(counts[0].status, 'New');
  assert.equal(counts[0].count, 2);
  assert.equal(counts.find((c) => c.status === 'Lost').count, 1);
  assert.equal(counts.find((c) => c.status === 'Signed').count, 0);
});

test('needsReply: New, no reply, older than 24 hours', () => {
  const enquiry = { status: 'New', receivedAt: '2026-11-16T08:00', firstReplyAt: null };
  assert.equal(needsReply(enquiry, '2026-11-17T07:59', 24), false); // 23h59m
  assert.equal(needsReply(enquiry, '2026-11-17T08:01', 24), true);
  assert.equal(needsReply({ ...enquiry, firstReplyAt: '2026-11-16T09:00' }, '2026-11-18T08:00', 24), false);
  assert.equal(needsReply({ ...enquiry, status: 'Proposal sent' }, '2026-11-18T08:00', 24), false);
});

test('a valid form is accepted and tidied', () => {
  const result = validateEnquiry(form);
  assert.equal(result.ok, true);
  assert.equal(result.record.guests, 8);
  assert.equal(result.record.budget, 250000);
  assert.equal(result.record.brokerName, null);
  assert.equal(result.record.notes, null);
  assert.deepEqual(result.warnings, []);
});

test('client name, dates, guests and country are required', () => {
  const result = validateEnquiry({ ...form, clientName: '', startDate: '', guests: '', embarkationCountry: '' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.clientName);
  assert.ok(result.errors.startDate);
  assert.ok(result.errors.guests);
  assert.ok(result.errors.embarkationCountry);
});

test('disembarkation must be after embarkation', () => {
  assert.ok(validateEnquiry({ ...form, endDate: '2027-07-10' }).errors.endDate);
  assert.ok(validateEnquiry({ ...form, endDate: '2027-07-01' }).errors.endDate);
});

test('guests must be a whole number of at least 1', () => {
  assert.ok(validateEnquiry({ ...form, guests: '0' }).errors.guests);
  assert.ok(validateEnquiry({ ...form, guests: '7.5' }).errors.guests);
});

test('more than 12 guests saves, with a licensing warning', () => {
  const result = validateEnquiry({ ...form, guests: '14' });
  assert.equal(result.ok, true);
  assert.match(result.warnings[0], /licensed/);
});

test('budget is optional, but must be a positive number if given', () => {
  assert.equal(validateEnquiry({ ...form, budget: '' }).record.budget, null);
  assert.ok(validateEnquiry({ ...form, budget: 'lots' }).errors.budget);
  assert.ok(validateEnquiry({ ...form, budget: '-5' }).errors.budget);
});

test('a broker enquiry needs the broker name', () => {
  assert.ok(validateEnquiry({ ...form, sourceType: 'Broker' }).errors.brokerName);
  assert.equal(validateEnquiry({ ...form, sourceType: 'Broker', brokerName: 'Saltmarsh' }).record.brokerName, 'Saltmarsh');
});

test('a broker name is dropped if the source is Direct', () => {
  assert.equal(validateEnquiry({ ...form, brokerName: 'Leftover' }).record.brokerName, null);
});

test('Lost needs a reason', () => {
  assert.ok(validateEnquiry({ ...form, status: 'Lost' }).errors.lostReason);
  const ok = validateEnquiry({ ...form, status: 'Lost', lostReason: 'Chose another yacht' });
  assert.equal(ok.record.lostReason, 'Chose another yacht');
});

test('Greek VAT eligibility only applies to charters starting in Greece', () => {
  assert.equal(validateEnquiry({ ...form, embarkationCountry: 'greece', greekEligible: 'on' }).record.greekEligible, true);
  assert.equal(validateEnquiry({ ...form, embarkationCountry: 'italy', greekEligible: 'on' }).record.greekEligible, false);
});

test('first reply cannot be before the enquiry arrived', () => {
  assert.ok(validateEnquiry({ ...form, firstReplyAt: '2026-11-17T08:00' }).errors.firstReplyAt);
  assert.equal(validateEnquiry({ ...form, firstReplyAt: '2026-11-17T10:00' }).ok, true);
});

test('sample enquiries are dated relative to today and marked as examples', () => {
  const samples = buildSamples(templates, '2026-11-17');
  assert.equal(samples.length, templates.length);
  assert.ok(samples.every((s) => s.example === true));

  const ashworth = samples[0];
  assert.equal(ashworth.receivedAt, '2026-11-17T08:40');
  assert.equal(ashworth.startDate, '2027-07-07'); // 232 days on
  assert.equal(charterDays(ashworth), 7);

  // The same templates a year later move with the calendar.
  assert.equal(buildSamples(templates, '2027-11-17')[0].receivedAt, '2027-11-17T08:40');
});

test('every sample passes the same checks as the form', () => {
  for (const s of buildSamples(templates, '2026-11-17')) {
    const result = validateEnquiry({ ...s, guests: String(s.guests), budget: String(s.budget ?? ''), greekEligible: s.greekEligible });
    assert.equal(result.ok, true, `${s.clientName}: ${JSON.stringify(result.errors)}`);
  }
});

test('samples cover every status in the pipeline', () => {
  const statuses = new Set(buildSamples(templates, '2026-11-17').map((s) => s.status));
  for (const status of STATUSES) assert.ok(statuses.has(status), `no sample for ${status}`);
});

test('samples include one New enquiry overdue a reply, for the dashboard', () => {
  const samples = buildSamples(templates, '2026-11-17');
  assert.ok(samples.some((s) => needsReply(s, '2026-11-17T12:00', 24)));
});
