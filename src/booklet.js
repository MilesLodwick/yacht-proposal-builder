// Show booklet: one printed page per yacht for brokers to carry at a boat
// show. Pure functions, tested in tests/booklet.test.js.
//
// The booklet goes to other brokers, so it shows when a yacht is booked or
// under option but never who the client is.
//
// A booklet record: { id, showName, showDate, yachtIds: [...], notes }

import { formatMoney } from './calc/currency.js';
import { formatDate, formatDateRange, addDays } from './calc/dates.js';
import { isExpired } from './calc/availability.js';
import { detailsAge } from './fleet.js';
import { checkPill } from './yachts.js';
import { yachtType } from './selection.js';

// What a broker sees for each kind of calendar entry. No client names.
const PUBLIC_LABEL = { owner: 'Owner use', booking: 'Booked', option1: 'Under option', option2: 'Under option' };

// Everything on one yacht's page.
// entries: that yacht's calendar entries. months: how far ahead to show.
export function bookletPage({ yacht, entries, today, staleDays, months = 6 }) {
  const until = addDays(today, Math.round(months * 30.4));
  const cur = yacht.currency;

  const rates = [];
  if (cur && yacht.summerRate != null) rates.push({ label: 'Summer', amount: formatMoney(yacht.summerRate, cur) });
  if (cur && yacht.winterRate != null) rates.push({ label: 'Winter', amount: formatMoney(yacht.winterRate, cur) });
  if (cur && yacht.rateFromWeekly != null) rates.push({ label: rates.length ? 'Listed' : 'From', amount: formatMoney(yacht.rateFromWeekly, cur) });

  // Upcoming dates that are not free. An option to one broker is an option
  // to all: other brokers need to know the dates are held.
  const busy = entries
    .filter((e) => !isExpired(e, today) && e.end > today && e.start < until)
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((e) => ({ status: PUBLIC_LABEL[e.type], dates: formatDateRange(e.start, e.end) }));

  const warnings = [];
  const age = detailsAge(yacht, today, staleDays);
  if (age.stale) warnings.push(`${yacht.name}: details ${age.days == null ? 'never checked' : `${age.days} days old`}. Update the fleet record before the show.`);
  const check = checkPill(yacht);
  if (check.tone !== 'green') warnings.push(`${yacht.name}: ${check.text.toLowerCase()}.`);
  if (!rates.length) warnings.push(`${yacht.name}: no rate recorded, so the page says "Rate on request".`);

  return {
    id: yacht.id,
    name: yacht.name,
    centralAgent: yacht.firm,
    specs: [
      ['Length', yacht.lengthM ? `${yacht.lengthM} m` : null],
      ['Guests', yacht.guests ? String(yacht.guests) : null],
      ['Cabins', yacht.cabins ? String(yacht.cabins) : null],
      ['Builder', yacht.builder],
      ['Built', yacht.year ? String(yacht.year) : null],
      ['Type', yachtType(yacht)],
    ].filter(([, value]) => value),
    rates,
    currency: cur,
    bases: [
      yacht.summerBase ? `Summer: ${yacht.summerBase}` : null,
      yacht.winterBase ? `Winter: ${yacht.winterBase}` : null,
    ].filter(Boolean),
    cruisingArea: yacht.cruisingArea,
    crewNotes: yacht.crewNotes,
    busy,
    availabilityWindow: `${formatDate(today)} to ${formatDate(until)}`,
    source: yacht.source ?? yacht.firm,
    sourceUrl: yacht.sourceUrl,
    checked: formatDate(yacht.dateChecked),
    warnings,
  };
}

// Check a booklet before saving.
export function validateBooklet(input) {
  const errors = {};
  if (!String(input.showName ?? '').trim()) errors.showName = 'Enter the name of the show.';
  if (!input.yachtIds?.length) errors.yachtIds = 'Choose at least one yacht.';
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true };
}

// The sample booklet stores its date as days from today.
export function buildSampleBooklets(templates, today) {
  return templates.map((t, i) => ({
    id: `sample-booklet-${i + 1}`,
    example: true,
    showName: t.showName,
    showDate: t.showInDays == null ? null : addDays(today, t.showInDays),
    yachtIds: t.yachtIds,
    notes: t.notes ?? '',
    ...(t.addedIn ? { addedIn: t.addedIn } : {}),
  }));
}
