// Yacht data from the research sheet.
//
// Two kinds of record:
//   yachts   charter yachts, from the "Fleets" tab   (data/yachts.csv)
//   forSale  boats for sale, from the "For sale" tab (data/for-sale.csv)
//
// Each kind has one list of columns. The same list is used to read a CSV
// into records and to write records back out, so an exported file can
// always be imported again. Column headers match the research sheet.
//
// These are real public listings. Every record keeps its source link and
// the date it was checked, and "Your check" says whether Miles has
// verified it yet. Nothing missing is ever guessed: blank stays blank.

import { parseCSVObjects, toCSV } from './csv.js';
import { parseDate } from './calc/dates.js';
import { CURRENCIES } from './calc/currency.js';

// type: text | number | currency | date | check
const CHARTER_COLUMNS = [
  { key: 'firm', header: 'Firm', type: 'text' },
  { key: 'name', header: 'Yacht', type: 'text' },
  { key: 'lengthM', header: 'Length (m)', type: 'number' },
  { key: 'guests', header: 'Guests', type: 'number' },
  { key: 'rateFromWeekly', header: 'Rate from p/w', type: 'number' },
  { key: 'currency', header: 'Currency', type: 'currency' },
  { key: 'cruisingArea', header: 'Cruising area (as listed)', type: 'text' },
  { key: 'listingStatus', header: 'Managed status', type: 'text' },
  { key: 'check', header: 'Your check', type: 'check' },
  { key: 'include', header: 'Include in tool?', type: 'text' },
  { key: 'builder', header: 'Builder', type: 'text' },
  { key: 'year', header: 'Year', type: 'number' },
  { key: 'cabins', header: 'Cabins', type: 'number' },
  { key: 'source', header: 'Source', type: 'text' },
  { key: 'sourceUrl', header: 'Source URL', type: 'text' },
  { key: 'dateChecked', header: 'Checked', type: 'date' },
  { key: 'notes', header: 'Notes', type: 'text' },
];

const SALE_COLUMNS = [
  { key: 'firm', header: 'Firm', type: 'text' },
  { key: 'name', header: 'Boat', type: 'text' },
  { key: 'lengthM', header: 'Length (m)', type: 'number' },
  { key: 'year', header: 'Year', type: 'number' },
  { key: 'askingPrice', header: 'Asking price', type: 'number' },
  { key: 'currency', header: 'Currency', type: 'currency' },
  { key: 'location', header: 'Location', type: 'text' },
  { key: 'vatStatus', header: 'VAT status', type: 'text' },
  { key: 'check', header: 'Your check', type: 'check' },
  { key: 'include', header: 'Include in tool?', type: 'text' },
  { key: 'type', header: 'Type', type: 'text' },
  { key: 'lengthFt', header: 'Length (ft)', type: 'number' },
  { key: 'source', header: 'Source', type: 'text' },
  { key: 'sourceUrl', header: 'Source URL', type: 'text' },
  { key: 'dateChecked', header: 'Checked', type: 'date' },
  { key: 'notes', header: 'Notes', type: 'text' },
];

export const KINDS = {
  yachts: { label: 'Charter yachts', file: 'data/yachts.csv', columns: CHARTER_COLUMNS },
  forSale: { label: 'Boats for sale', file: 'data/for-sale.csv', columns: SALE_COLUMNS },
};

// The three values of "Your check" in the research sheet.
export const CHECK = { TO_CHECK: 'To check', VERIFIED: 'Verified', WRONG: 'Wrong or out of date' };

// ---------------------------------------------------------------------------
// Reading values from text
// ---------------------------------------------------------------------------

function readText(raw) {
  return raw === '' ? null : raw;
}

// "1,150,000" -> 1150000. Blank or not a number -> null (never a guess).
function readNumber(raw) {
  const cleaned = raw.replace(/[,\s]/g, '');
  if (cleaned === '') return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

// Accepts 2026-11-17 (from the script) or 17/11/2026 (Excel's own CSV).
function readDate(raw) {
  if (parseDate(raw)) return raw;
  const uk = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (uk) {
    const iso = `${uk[3]}-${uk[2].padStart(2, '0')}-${uk[1].padStart(2, '0')}`;
    if (parseDate(iso)) return iso;
  }
  return null;
}

// "EUR" -> EUR. "USD (Rightboat)" -> USD, remembering the original wording.
// "Not shown" or "POA" -> no currency, remembering the wording.
function readCurrency(raw) {
  const code = raw.slice(0, 3).toUpperCase();
  const currency = CURRENCIES.includes(code) ? code : null;
  const asListed = raw !== '' && raw !== currency ? raw : null;
  return { currency, asListed };
}

function readCheck(raw) {
  const lower = raw.toLowerCase();
  if (lower === 'verified') return CHECK.VERIFIED;
  if (lower.startsWith('wrong')) return CHECK.WRONG;
  return CHECK.TO_CHECK;
}

function slug(text) {
  return String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ---------------------------------------------------------------------------
// Import and export
// ---------------------------------------------------------------------------

// CSV text -> records.
// Returns { ok: true, records, skipped } or { ok: false, error }.
export function importCSV(kind, text) {
  const { columns } = KINDS[kind];
  const { headers, rows } = parseCSVObjects(text);
  const nameHeader = columns.find((c) => c.key === 'name').header;

  const missing = ['Firm', nameHeader].filter((h) => !headers.includes(h));
  if (missing.length) {
    return { ok: false, error: `This file has no ${missing.map((h) => `"${h}"`).join(' or ')} column. Check you chose the right file.` };
  }

  const records = [];
  const usedIds = new Set();
  let skipped = 0;

  for (const row of rows) {
    if (!row[nameHeader]) { skipped += 1; continue; }

    const record = {};
    for (const col of columns) {
      const raw = row[col.header] ?? '';
      if (col.type === 'number') record[col.key] = readNumber(raw);
      else if (col.type === 'date') record[col.key] = readDate(raw);
      else if (col.type === 'check') record[col.key] = readCheck(raw);
      else if (col.type === 'currency') {
        const { currency, asListed } = readCurrency(raw);
        record.currency = currency;
        record.currencyAsListed = asListed;
      } else record[col.key] = readText(raw);
    }

    // A stable id from firm and name, e.g. "edmiston-lady-s". The same
    // yacht listed by two firms gets two ids, because they are two listings.
    let id = `${slug(record.firm ?? 'unknown')}-${slug(record.name)}`;
    for (let n = 2; usedIds.has(id); n += 1) id = `${slug(record.firm ?? 'unknown')}-${slug(record.name)}-${n}`;
    usedIds.add(id);

    records.push({ id, ...record });
  }

  return { ok: true, records, skipped };
}

// Records -> CSV text, with the same headers as the research sheet.
export function exportCSV(kind, records) {
  const { columns } = KINDS[kind];
  const header = columns.map((c) => c.header);
  const rows = records.map((r) => columns.map((c) => (c.type === 'currency' ? (r.currencyAsListed ?? r.currency) : r[c.key])));
  return toCSV([header, ...rows]);
}

// ---------------------------------------------------------------------------
// Verification status
// ---------------------------------------------------------------------------

// The pill shown next to a yacht: green, red, or amber until checked.
export function checkPill(record) {
  if (record.check === CHECK.VERIFIED) return { tone: 'green', text: 'Verified' };
  if (record.check === CHECK.WRONG) return { tone: 'red', text: 'Wrong or out of date' };
  return { tone: 'amber', text: 'Not yet verified' };
}

// Counts for the Import and export screen.
export function summarise(records) {
  return {
    total: records.length,
    verified: records.filter((r) => r.check === CHECK.VERIFIED).length,
    wrong: records.filter((r) => r.check === CHECK.WRONG).length,
    toCheck: records.filter((r) => r.check === CHECK.TO_CHECK).length,
  };
}

// ---------------------------------------------------------------------------
// Loading the published files (uses fetch, so not run in the Node tests)
// ---------------------------------------------------------------------------

export async function fetchPublished(kind) {
  const response = await fetch(KINDS[kind].file);
  if (!response.ok) return { ok: false, error: `Could not load ${KINDS[kind].file}.` };
  return importCSV(kind, await response.text());
}
