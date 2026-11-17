// Fleet records: keeping each yacht's details current, as a charter
// management assistant does on Yachtfolio and listing sites.
// Pure functions, tested in tests/fleet.test.js.

import { daysBetween, parseDate } from './calc/dates.js';
import { CURRENCIES } from './calc/currency.js';
import { CHECK } from './yachts.js';

// How old a yacht's details are, and whether they need checking.
// Details older than the setting (default 90 days) are out of date.
// A yacht with no "checked" date is always out of date.
export function detailsAge(yacht, today, staleDays) {
  if (!parseDate(yacht.dateChecked)) return { days: null, stale: true };
  const days = daysBetween(yacht.dateChecked, today);
  return { days, stale: days > staleDays };
}

// The firms in the list, A to Z, for the filter.
export function firms(yachts) {
  return [...new Set(yachts.map((y) => y.firm).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

// Web addresses typed into "Other listing links", one per line or
// separated by spaces. Anything that is not a web address is ignored.
export function parseLinks(text) {
  return String(text ?? '').split(/\s+/).filter((t) => /^https?:\/\/\S+\.\S+/.test(t));
}

// Check the fleet record form before saving.
// Returns { ok: true, fields } or { ok: false, errors }.
export function validateFleetRecord(input, today) {
  const errors = {};
  const fields = {};
  const text = (name) => String(input[name] ?? '').trim();

  const number = (name, { whole = false, label }) => {
    const raw = text(name).replace(/[,\s]/g, '');
    if (raw === '') { fields[name] = null; return; }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) errors[name] = `Enter ${label} as a number.`;
    else if (whole && !Number.isInteger(n)) errors[name] = `Enter ${label} as a whole number.`;
    else fields[name] = n;
  };
  number('lengthM', { label: 'the length' });
  number('guests', { whole: true, label: 'the number of guests' });
  number('cabins', { whole: true, label: 'the number of cabins' });
  number('year', { whole: true, label: 'the build year' });
  number('rateFromWeekly', { label: 'the rate' });
  number('summerRate', { label: 'the rate' });
  number('winterRate', { label: 'the rate' });
  if (fields.year != null && (fields.year < 1850 || fields.year > Number(today.slice(0, 4)) + 3)) {
    errors.year = 'Check the build year.';
  }

  const currency = text('currency');
  fields.currency = CURRENCIES.includes(currency) ? currency : null;
  const hasRate = [fields.rateFromWeekly, fields.summerRate, fields.winterRate].some((r) => r != null);
  if (hasRate && !fields.currency) errors.currency = 'Choose the currency of the rates.';

  for (const name of ['builder', 'cruisingArea', 'summerBase', 'winterBase', 'crewNotes', 'notes', 'source']) {
    fields[name] = text(name) || null;
  }

  const url = text('sourceUrl');
  if (url && !/^https?:\/\/\S+\.\S+/.test(url)) errors.sourceUrl = 'Enter a full web address starting with https://';
  fields.sourceUrl = url || null;

  const links = text('otherLinks');
  const bad = links.split(/\s+/).filter((t) => t && !/^https?:\/\/\S+\.\S+/.test(t));
  if (bad.length) errors.otherLinks = `These are not full web addresses: ${bad.join(', ')}`;
  fields.otherLinks = links ? parseLinks(links).join('\n') : null;

  const checked = text('dateChecked');
  if (!parseDate(checked)) errors.dateChecked = 'Enter the date the details were last checked.';
  else if (checked > today) errors.dateChecked = 'The date cannot be in the future.';
  else fields.dateChecked = checked;

  fields.check = Object.values(CHECK).includes(text('check')) ? text('check') : CHECK.TO_CHECK;

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, fields };
}
