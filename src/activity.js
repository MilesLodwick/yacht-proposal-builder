// Sales activity on a listing: enquiries and viewings, and the owner
// activity report built from them. Pure functions, tested in
// tests/activity.test.js.
//
// An entry: { id, listingId, type: 'enquiry' | 'viewing', date, time,
//             who, broker, interest, feedback }
// A viewing dated in the future is "booked"; on or before today it is
// "held" and should have feedback.

import { parseDate, daysBetween, addDays, formatDate } from './calc/dates.js';

export const ACTIVITY_TYPES = [
  { id: 'enquiry', label: 'Enquiry' },
  { id: 'viewing', label: 'Viewing' },
];

export const INTEREST_LEVELS = ['High', 'Medium', 'Low', 'Not interested'];

export function interestTone(level) {
  return { High: 'green', Medium: 'amber', Low: 'neutral', 'Not interested': 'red' }[level] ?? 'neutral';
}

// Is a viewing still to come?
export function isBooked(entry, today) {
  return entry.type === 'viewing' && entry.date > today;
}

// Check an entry before saving.
export function validateActivity(input, today) {
  const errors = {};
  if (!ACTIVITY_TYPES.some((t) => t.id === input.type)) errors.type = 'Choose enquiry or viewing.';
  if (!parseDate(input.date)) errors.date = 'Enter the date.';
  else if (input.type === 'enquiry' && input.date > today) errors.date = 'An enquiry cannot be in the future.';
  if (input.time && !/^\d{2}:\d{2}$/.test(input.time)) errors.time = 'Enter a time like 14:30.';
  if (!String(input.who ?? '').trim()) errors.who = 'Enter who it was (a buyer reference or broker).';
  if (input.interest && !INTEREST_LEVELS.includes(input.interest)) errors.interest = 'Choose a level of interest.';
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true };
}

// The reporting periods offered, ending today.
export function reportPeriods(listing, today) {
  const periods = [
    { id: '30', label: 'Last 30 days', from: addDays(today, -30), to: today },
    { id: '90', label: 'Last 90 days', from: addDays(today, -90), to: today },
  ];
  if (parseDate(listing.listedOn)) periods.push({ id: 'listed', label: `Since listed (${formatDate(listing.listedOn)})`, from: listing.listedOn, to: today });
  periods.push({ id: 'all', label: 'All recorded activity', from: null, to: today });
  return periods;
}

// Everything the owner activity report needs for one listing and period.
// Booked viewings after the period are listed separately as "coming up".
export function activityReport({ listing, entries, from, to, today }) {
  const mine = entries.filter((e) => e.listingId === listing.id);
  const inPeriod = mine.filter((e) => (!from || e.date >= from) && e.date <= to);

  const enquiries = inPeriod.filter((e) => e.type === 'enquiry');
  const held = inPeriod.filter((e) => e.type === 'viewing' && !isBooked(e, today));
  const upcoming = mine.filter((e) => isBooked(e, today)).sort((a, b) => a.date.localeCompare(b.date));

  const interest = Object.fromEntries(INTEREST_LEVELS.map((level) => [level, held.filter((v) => v.interest === level).length]));
  const feedback = held
    .filter((v) => String(v.feedback ?? '').trim())
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((v) => ({ date: v.date, who: v.who, broker: v.broker, interest: v.interest, feedback: v.feedback.trim() }));

  // Price changes in the period, from the listing's own history.
  const history = [...(listing.priceHistory ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const priceChanges = history
    .map((h, i) => ({ ...h, previous: history[i - 1]?.price }))
    .filter((h, i) => i > 0 && (!from || h.date >= from) && h.date <= to);

  return {
    period: { from, to, days: from ? daysBetween(from, to) : null },
    counts: {
      enquiries: enquiries.length,
      viewingsHeld: held.length,
      viewingsBooked: upcoming.length,
    },
    interest,
    feedback,
    heldWithoutFeedback: held.filter((v) => !String(v.feedback ?? '').trim()).length,
    upcoming,
    priceChanges,
    timeline: inPeriod.sort((a, b) => b.date.localeCompare(a.date) || String(b.time).localeCompare(String(a.time))),
  };
}

// Sample entries store dates as days from today.
export function buildSampleActivity(templates, today) {
  return templates.map((t, i) => ({
    id: `sample-activity-${i + 1}`,
    example: true,
    listingId: t.listingId,
    type: t.type,
    date: addDays(today, t.daysFromToday),
    time: t.time ?? '',
    who: t.who,
    broker: t.broker ?? '',
    interest: t.interest ?? '',
    feedback: t.feedback ?? '',
  }));
}
