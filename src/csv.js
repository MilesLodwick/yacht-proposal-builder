// Read and write CSV (comma-separated values), the format Excel and
// Google Sheets can open and save. Pure functions.
//
// The awkward cases CSV has to handle:
//   - a value containing a comma is wrapped in quotes:   "Lymington, UK"
//   - a quote inside a quoted value is doubled:           "The ""Big"" One"
//   - a quoted value can even contain a line break
//   - files saved on Windows end lines with \r\n, and Excel often adds an
//     invisible marker (BOM) at the very start of the file

// CSV text -> list of rows, each a list of values.
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let value = '';
  let inQuotes = false;
  const input = text.replace(/^﻿/, ''); // drop Excel's BOM

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (inQuotes) {
      if (char === '"' && input[i + 1] === '"') { value += '"'; i += 1; } // doubled quote
      else if (char === '"') inQuotes = false;                            // closing quote
      else value += char;
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(value); value = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i += 1;
      row.push(value); rows.push(row);
      row = []; value = '';
    } else {
      value += char;
    }
  }
  // Last line (files do not always end with a line break).
  if (value !== '' || row.length) { row.push(value); rows.push(row); }

  // Ignore completely blank lines.
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

// CSV text -> list of objects keyed by the header row.
// "Firm,Yacht\nEdmiston,Arrow" -> [{ Firm: 'Edmiston', Yacht: 'Arrow' }]
export function parseCSVObjects(text) {
  const [headers = [], ...rows] = parseCSV(text);
  const cleanHeaders = headers.map((h) => h.trim());
  return {
    headers: cleanHeaders,
    rows: rows.map((r) => Object.fromEntries(cleanHeaders.map((h, i) => [h, (r[i] ?? '').trim()]))),
  };
}

// List of rows -> CSV text. Values are quoted only when they need it.
export function toCSV(rows) {
  return rows.map((row) => row.map(quote).join(',')).join('\r\n') + '\r\n';
}

function quote(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
