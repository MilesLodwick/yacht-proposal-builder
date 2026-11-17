// Enquiry log: the simple CRM for charter enquiries.
//
// An enquiry is one client asking about one charter. It moves along a
// pipeline from New to Completed, or drops out as Lost (with a reason, so
// the team can learn why business was lost).
//
// Pure functions only, so they are tested in tests/enquiries.test.js.

import { parseDate, daysBetween, addDays } from './calc/dates.js';
import { CURRENCIES } from './calc/currency.js';
import { EMBARKATION_COUNTRIES } from './calc/charter.js';

// The pipeline, in order.
export const STATUSES = [
  'New',
  'Proposal sent',
  'Option held',
  'Contract out',
  'Signed',
  'Balance paid',
  'On charter',
  'Completed',
  'Lost',
];

// Where the enquiry came from: straight to us, or through a retail broker.
export const SOURCES = ['Direct', 'Broker'];

// Pill colour for each status. Most are neutral; Completed is green and
// Lost is red.
export function statusTone(status) {
  if (status === 'Completed') return 'green';
  if (status === 'Lost') return 'red';
  return 'neutral';
}

// Number of charter days, embarkation to disembarkation.
// 10 Jul to 17 Jul is a 7-day (one week) charter.
export function charterDays(enquiry) {
  return daysBetween(enquiry.startDate, enquiry.endDate);
}

// How many enquiries are at each status, in pipeline order.
export function statusCounts(enquiries) {
  return STATUSES.map((status) => ({ status, count: enquiries.filter((e) => e.status === status).length }));
}

// Is a New enquiry still waiting for a first reply after the set number of
// hours (a setting, default 24)? Used by the dashboard.
// "now" is passed in as "YYYY-MM-DDTHH:MM" so the function stays testable.
export function needsReply(enquiry, now, hours) {
  if (enquiry.status !== 'New' || enquiry.firstReplyAt) return false;
  const waitedMs = new Date(now) - new Date(enquiry.receivedAt);
  return waitedMs > hours * 60 * 60 * 1000;
}

// A new, unique id such as "enq-lx3k9a-4f2c".
export function newEnquiryId() {
  return `enq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// ---------------------------------------------------------------------------
// Checking the form
// ---------------------------------------------------------------------------

// Check what the user typed before saving. "input" is the raw form text.
// Returns { ok: true, record, warnings } or { ok: false, errors }.
// Warnings do not stop saving; they flag things to double-check.
export function validateEnquiry(input) {
  const errors = {};
  const warnings = [];
  const text = (name) => String(input[name] ?? '').trim();

  const record = {
    clientName: text('clientName'),
    sourceType: SOURCES.includes(text('sourceType')) ? text('sourceType') : 'Direct',
    brokerName: null,
    receivedAt: text('receivedAt'),
    firstReplyAt: text('firstReplyAt') || null,
    startDate: text('startDate'),
    endDate: text('endDate'),
    guests: null,
    budget: null,
    budgetCurrency: CURRENCIES.includes(text('budgetCurrency')) ? text('budgetCurrency') : 'EUR',
    embarkationCountry: text('embarkationCountry'),
    greekEligible: input.greekEligible === 'on' || input.greekEligible === true,
    status: STATUSES.includes(text('status')) ? text('status') : 'New',
    lostReason: null,
    notes: text('notes') || null,
  };

  if (!record.clientName) errors.clientName = 'Enter the client name.';

  if (record.sourceType === 'Broker') {
    record.brokerName = text('brokerName') || null;
    if (!record.brokerName) errors.brokerName = 'Enter which broker sent the enquiry.';
  }

  if (!isDateTime(record.receivedAt)) errors.receivedAt = 'Enter when the enquiry arrived.';
  if (record.firstReplyAt && !isDateTime(record.firstReplyAt)) errors.firstReplyAt = 'Enter a valid date and time.';
  else if (record.firstReplyAt && isDateTime(record.receivedAt) && record.firstReplyAt < record.receivedAt) {
    errors.firstReplyAt = 'The reply cannot be before the enquiry arrived.';
  }

  if (!parseDate(record.startDate)) errors.startDate = 'Enter the embarkation date.';
  if (!parseDate(record.endDate)) errors.endDate = 'Enter the disembarkation date.';
  else if (parseDate(record.startDate) && record.endDate <= record.startDate) {
    errors.endDate = 'Disembarkation must be after embarkation.';
  }

  const guests = Number(text('guests'));
  if (text('guests') === '' || !Number.isInteger(guests) || guests < 1) {
    errors.guests = 'Enter the number of guests (a whole number).';
  } else {
    record.guests = guests;
    // Most charter yachts are licensed for up to 12 guests. Larger groups
    // need a yacht licensed for more, so flag it rather than block it.
    if (guests > 12) warnings.push('More than 12 guests: check the yacht is licensed for this many.');
  }

  const budgetText = text('budget').replace(/[,\s]/g, '');
  if (budgetText !== '') {
    const budget = Number(budgetText);
    if (!Number.isFinite(budget) || budget <= 0) errors.budget = 'Enter the budget as a number, e.g. 250000.';
    else record.budget = budget;
  }

  if (!EMBARKATION_COUNTRIES.some((c) => c.id === record.embarkationCountry)) {
    errors.embarkationCountry = 'Choose where the charter starts.';
  }
  if (record.embarkationCountry !== 'greece') record.greekEligible = false;

  if (record.status === 'Lost') {
    record.lostReason = text('lostReason') || null;
    if (!record.lostReason) errors.lostReason = 'Say why the enquiry was lost.';
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, record, warnings };
}

function isDateTime(value) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) && parseDate(value.slice(0, 10)) !== null;
}

// ---------------------------------------------------------------------------
// Sample enquiries
// ---------------------------------------------------------------------------

// The sample file stores dates as "days from today" so the demo never looks
// out of date: an enquiry "received 2 days ago" is always 2 days ago.
// Every sample is marked example: true, which shows the Example data banner.
export function buildSamples(templates, today) {
  return templates.map((t, i) => {
    const received = addDays(today, -t.receivedDaysAgo);
    const start = addDays(today, t.startInDays);
    return {
      id: `sample-enquiry-${i + 1}`,
      example: true,
      clientName: t.clientName,
      sourceType: t.sourceType,
      brokerName: t.brokerName ?? null,
      receivedAt: `${received}T${t.receivedTime}`,
      firstReplyAt: t.repliedHoursLater == null ? null : addHours(`${received}T${t.receivedTime}`, t.repliedHoursLater),
      startDate: start,
      endDate: addDays(start, t.days),
      guests: t.guests,
      budget: t.budget,
      budgetCurrency: t.budgetCurrency,
      embarkationCountry: t.embarkationCountry,
      greekEligible: t.greekEligible ?? false,
      status: t.status,
      lostReason: t.lostReason ?? null,
      notes: t.notes ?? null,
    };
  });
}

// "2026-11-17T09:15" plus 3 hours -> "2026-11-17T12:15" (in UTC arithmetic,
// so clock changes never shift it).
function addHours(dateTime, hours) {
  const d = new Date(`${dateTime}:00Z`);
  d.setUTCHours(d.getUTCHours() + hours);
  return d.toISOString().slice(0, 16);
}
