// Availability calendar maths. Pure functions.
//
// Each yacht has calendar entries:
//   { id, yachtId, type, start, end, label, expiresOn }
// where type is one of:
//   owner     the owner is using the yacht. Owner use takes priority.
//   booking   a confirmed charter
//   option1   a first option: a client has first refusal until expiresOn
//   option2   a second option: next in line if the first option lapses
//
// "start" is embarkation and "end" is disembarkation. Two periods only
// clash if they genuinely overlap: a charter ending on the 21st and the
// next starting on the 21st is a same-day changeover, not a clash.

import { daysBetween, addDays, formatDate, parseDate } from './dates.js';

export const ENTRY_TYPES = [
  { id: 'owner', label: 'Owner use', priority: 1 },
  { id: 'booking', label: 'Booked', priority: 2 },
  { id: 'option1', label: 'First option', priority: 3 },
  { id: 'option2', label: 'Second option', priority: 4 },
];

export const typeLabel = (id) => ENTRY_TYPES.find((t) => t.id === id)?.label ?? id;
const priority = (id) => ENTRY_TYPES.find((t) => t.id === id)?.priority ?? 9;
const isOption = (e) => e.type === 'option1' || e.type === 'option2';

// Do two periods overlap? (A same-day changeover does not count.)
export function overlaps(a, b) {
  return a.start < b.end && b.start < a.end;
}

// Is an option past its expiry date? Only options expire.
export function isExpired(entry, today) {
  return isOption(entry) && Boolean(entry.expiresOn) && entry.expiresOn < today;
}

// The pill for an option's expiry:
//   expired           red    "Expired 15 Nov 2026"
//   expires soon      amber  "Expires in 2 days" / "Expires today"
//   otherwise                "Expires 30 Nov 2026"
// soonDays is a setting (default 3).
export function optionStatus(entry, today, soonDays) {
  if (!isOption(entry)) return null;
  if (!entry.expiresOn) return { tone: 'amber', text: 'No expiry date set' };
  const days = daysBetween(today, entry.expiresOn);
  if (days < 0) return { tone: 'red', text: `Expired ${formatDate(entry.expiresOn)}` };
  if (days === 0) return { tone: 'amber', text: 'Expires today' };
  if (days <= soonDays) return { tone: 'amber', text: `Expires in ${days} day${days === 1 ? '' : 's'}` };
  return { tone: 'neutral', text: `Expires ${formatDate(entry.expiresOn)}` };
}

// Every problem in one yacht's calendar.
// Expired options are left out of clash checks: they no longer hold dates.
// Returns [{ ids: [a, b], message }]
export function findClashes(entries, today) {
  const live = entries.filter((e) => !isExpired(e, today));
  const problems = [];
  const name = (e) => `${typeLabel(e.type).toLowerCase()}${e.label ? ` (${e.label})` : ''}`;

  for (let i = 0; i < live.length; i += 1) {
    for (let j = i + 1; j < live.length; j += 1) {
      // Put the higher-priority entry first, e.g. owner use before a booking.
      const [a, b] = [live[i], live[j]].sort((x, y) => priority(x.type) - priority(y.type));
      if (!overlaps(a, b)) continue;
      // A second option overlapping a first option is how options work.
      if (a.type === 'option1' && b.type === 'option2') continue;

      let message;
      if (a.type === 'owner') message = `Owner use clashes with the ${name(b)}. Owner use takes priority.`;
      else if (a.type === 'booking' && b.type === 'booking') message = `Two bookings overlap: ${a.label || 'one'} and ${b.label || 'another'}.`;
      else if (a.type === 'booking') message = `The ${name(b)} overlaps a confirmed booking (${a.label || 'booking'}). Release the option.`;
      else message = `Two ${typeLabel(a.type).toLowerCase()}s overlap: ${a.label || 'one'} and ${b.label || 'another'}. Only one can be held.`;

      problems.push({ ids: [a.id, b.id], message });
    }
  }

  // A second option needs a first option over the same dates.
  for (const second of live.filter((e) => e.type === 'option2')) {
    if (!live.some((e) => e.type === 'option1' && overlaps(e, second))) {
      problems.push({ ids: [second.id], message: `The second option (${second.label || 'unnamed'}) has no first option ahead of it. Make it a first option.` });
    }
  }
  return problems;
}

// Options that have expired and should be released or extended.
export function expiredOptions(entries, today) {
  return entries.filter((e) => isExpired(e, today));
}

// What to show on one calendar day: the highest-priority live entry
// (owner use beats a booking, which beats an option), plus whether any
// entry on that day is part of a clash.
export function dayStatus(entries, date, clashes, today) {
  const onDay = entries
    .filter((e) => !isExpired(e, today) && e.start <= date && date <= e.end)
    .sort((a, b) => priority(a.type) - priority(b.type));
  const clashIds = new Set(clashes.flatMap((c) => c.ids));
  return {
    top: onDay[0] ?? null,
    count: onDay.length,
    clash: onDay.some((e) => clashIds.has(e.id)) && onDay.length > 1,
  };
}

// The weeks of a month for a calendar grid, Monday first.
// Days from the previous or next month are null.
// monthGrid(2027, 1) -> [[null, null, null, '2027-01-01', ...], ...]
export function monthGrid(year, month) {
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const weekday = (parseDate(first).getUTCDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells = [...Array(weekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => addDays(first, i))];
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// Check a calendar entry before saving.
export function validateEntry(input) {
  const errors = {};
  if (!ENTRY_TYPES.some((t) => t.id === input.type)) errors.type = 'Choose what this period is.';
  if (!parseDate(input.start)) errors.start = 'Enter the start date.';
  if (!parseDate(input.end)) errors.end = 'Enter the end date.';
  else if (parseDate(input.start) && input.end <= input.start) errors.end = 'The end must be after the start.';
  if ((input.type === 'option1' || input.type === 'option2') && !parseDate(input.expiresOn)) {
    errors.expiresOn = 'Options need an expiry date.';
  }
  // The contract's charter fee is optional; the owner report estimates it
  // from the yacht's rate when it is missing.
  const fee = String(input.charterFee ?? '').replace(/[,\s]/g, '');
  if (fee !== '' && !(Number(fee) >= 0)) errors.charterFee = 'Enter the charter fee as a number.';
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true };
}

// Sample entries store dates as days from today.
export function buildSampleAvailability(templates, today) {
  return templates.map((t, i) => ({
    id: `sample-availability-${i + 1}`,
    example: true,
    yachtId: t.yachtId,
    type: t.type,
    start: addDays(today, t.startInDays),
    end: addDays(today, t.startInDays + t.days),
    label: t.label ?? '',
    expiresOn: t.expiresInDays == null ? null : addDays(today, t.expiresInDays),
    charterFee: t.charterFee ?? null,
    retailBroker: t.retailBroker ?? null,
  }));
}
