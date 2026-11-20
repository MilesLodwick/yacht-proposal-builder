// Import and export screen.
// - Yacht data: import and export the research sheet's yachts as CSV.
// - Everything: download all data as one JSON file and load it back,
//   so nothing is lost if the browser's storage is cleared.

import { getState, exportJSON, importJSON, countRecords, getCollection, saveCollection } from '../store.js';
import { KINDS, importCSV, exportCSV, summarise, fetchPublished } from '../yachts.js';
import { formatDate, todayISO } from '../calc/dates.js';
import { escapeHTML } from './html.js';
import { addAllMissingSamples } from '../samples.js';

let wrapper;
let status; // stays in place so screen readers announce messages put in it

export function render(container) {
  status = document.createElement('p');
  status.className = 'status-message';
  status.setAttribute('role', 'status');
  wrapper = document.createElement('div');
  container.append(status, wrapper);
  draw();
}

function draw(message = '', isError = false) {
  const state = getState();
  const total = Object.values(countRecords(state)).reduce((sum, n) => sum + n, 0);
  const lastSaved = state.savedAt ? `Last saved: ${formatDate(localDate(state.savedAt))}.` : 'Nothing saved yet.';

  wrapper.innerHTML = `
    <section class="section" aria-labelledby="yacht-data-heading">
      <h2 id="yacht-data-heading">Yacht data (CSV)</h2>
      <p>Real public listings from the research sheet, each with its source link and the date it was checked. Rates and prices are indicative. Open a CSV in Excel or Google Sheets, or import an updated one here.</p>
      ${Object.entries(KINDS).map(([kind, info]) => kindHTML(kind, info)).join('')}
      <p class="muted">To update the published list from the spreadsheet, run <code>python3 tools/sheet_to_csv.py</code> (see README).</p>
    </section>

    <section class="section" aria-labelledby="samples-heading">
      <h2 id="samples-heading">Sample data</h2>
      <p>Fill every screen with fictional examples: enquiries, itineraries, proposals, contracts, preference sheets, availability, buyer briefs, viewings, deals, compliance, crew and budgets. Useful for a demo. Your own records are not changed, and the Example data banner removes the samples again in one click.</p>
      <button type="button" class="button button--secondary" id="load-samples">Load sample data</button>
    </section>

    <section class="section" aria-labelledby="export-heading">
      <h2 id="export-heading">Back up everything (JSON)</h2>
      <p>Download everything saved in this browser as one file: yachts, enquiries, your settings, all of it. Keep it somewhere safe. If this browser's data is cleared, import the file to get it all back.</p>
      <p class="muted">Records in this browser: <span class="num">${total}</span>. ${lastSaved}</p>
      <button type="button" class="button" id="export-button">Download all data (JSON)</button>
      <div class="field import-field">
        <label for="import-file">Restore from a JSON backup</label>
        <input type="file" id="import-file" accept=".json,application/json">
      </div>
    </section>
  `;

  wrapper.querySelector('#export-button').addEventListener('click', () => {
    download(exportJSON(), `yacht-proposal-builder-${todayISO()}.json`, 'application/json');
  });
  wrapper.querySelector('#import-file').addEventListener('change', handleJSONImport);
  wrapper.querySelector('#load-samples').addEventListener('click', async (event) => {
    event.target.disabled = true;
    const added = await addAllMissingSamples();
    draw(added ? `Added ${added} sample records. Every screen now has examples to show.` : 'All the sample data is already here.');
  });

  for (const kind of Object.keys(KINDS)) {
    wrapper.querySelector(`#export-${kind}`).addEventListener('click', () => {
      download(exportCSV(kind, getCollection(kind)), `${KINDS[kind].file.replace('data/', '').replace('.csv', '')}-${todayISO()}.csv`, 'text/csv');
    });
    wrapper.querySelector(`#import-${kind}`).addEventListener('change', (event) => handleCSVImport(kind, event));
    wrapper.querySelector(`#restore-${kind}`).addEventListener('click', () => restorePublished(kind));
  }

  status.textContent = message;
  status.classList.toggle('is-error', isError);
}

// One block per kind of yacht data: counts, download, import, restore.
function kindHTML(kind, info) {
  const s = summarise(getCollection(kind));
  return `
    <div class="data-kind">
      <h3>${escapeHTML(info.label)}</h3>
      <p>
        <span class="num">${s.total}</span> records.
        ${s.toCheck ? `<span class="pill pill--amber">${s.toCheck} not yet verified</span>` : ''}
        ${s.verified ? `<span class="pill pill--green">${s.verified} verified</span>` : ''}
        ${s.wrong ? `<span class="pill pill--red">${s.wrong} wrong or out of date</span>` : ''}
      </p>
      <div class="button-row">
        <button type="button" class="button button--small" id="export-${kind}">Download CSV</button>
        <button type="button" class="button button--secondary button--small" id="restore-${kind}">Restore published list</button>
      </div>
      <div class="field import-field">
        <label for="import-${kind}">Import a CSV (replaces ${escapeHTML(info.label.toLowerCase())})</label>
        <input type="file" id="import-${kind}" accept=".csv,text/csv">
      </div>
    </div>`;
}

async function handleCSVImport(kind, event) {
  const input = event.target;
  const file = input.files[0];
  input.value = '';
  if (!file) return;

  const result = importCSV(kind, await file.text());
  if (!result.ok) return draw(`Not imported. ${result.error}`, true);

  const label = KINDS[kind].label.toLowerCase();
  if (!window.confirm(`Replace all ${label} in this browser with the ${result.records.length} in ${file.name}?`)) return;

  saveCollection(kind, result.records);
  const skipped = result.skipped === 1 ? ' 1 row had no name and was skipped.'
    : result.skipped > 1 ? ` ${result.skipped} rows had no name and were skipped.` : '';
  draw(`Imported ${result.records.length} ${label} from ${file.name}.${skipped}`);
}

async function restorePublished(kind) {
  const label = KINDS[kind].label.toLowerCase();
  if (!window.confirm(`Replace the ${label} in this browser with the published list? Changes you made to them here will be lost.`)) return;
  const result = await fetchPublished(kind);
  if (!result.ok) return draw(result.error, true);
  saveCollection(kind, result.records);
  draw(`Restored ${result.records.length} ${label} from the published list.`);
}

async function handleJSONImport(event) {
  const input = event.target;
  const file = input.files[0];
  input.value = '';
  if (!file) return;

  const confirmed = window.confirm(
    'Replace all data in this browser with this file? This cannot be undone. Download a backup first if you want to keep what is here.'
  );
  if (!confirmed) return;

  const result = importJSON(await file.text());
  if (result.ok) draw(`Restored everything from ${file.name}.`);
  else draw(`Not imported. ${result.error}`, true);
}

function download(text, filename, type) {
  const blob = new Blob([text], { type });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

// The saved time is stored in UTC; show the date in the user's own time zone.
function localDate(timestamp) {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
