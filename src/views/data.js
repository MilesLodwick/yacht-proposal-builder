// Import and export screen.
// Lets the user download everything as a JSON file and load it back,
// so nothing is lost if the browser's storage is cleared.

import { getState, exportJSON, importJSON, countRecords } from '../store.js';
import { formatDate, todayISO } from '../calc/dates.js';

export function render(container) {
  const state = getState();
  const total = Object.values(countRecords(state)).reduce((sum, n) => sum + n, 0);
  const lastSaved = state.savedAt ? `Last saved: ${formatDate(localDate(state.savedAt))}.` : 'Nothing saved yet.';

  container.insertAdjacentHTML('beforeend', `
    <section class="section" aria-labelledby="export-heading">
      <h2 id="export-heading">Export</h2>
      <p>Download everything saved in this browser as one file. Keep it somewhere safe. If this browser's data is cleared, you can import the file to get it all back.</p>
      <p class="muted">Records in this browser: <span class="num">${total}</span>. ${lastSaved}</p>
      <button type="button" class="button" id="export-button">Download data (JSON)</button>
    </section>

    <section class="section" aria-labelledby="import-heading">
      <h2 id="import-heading">Import</h2>
      <p>Load a file exported from this app. It replaces everything currently saved in this browser.</p>
      <div class="field">
        <label for="import-file">Choose a JSON file</label>
        <input type="file" id="import-file" accept=".json,application/json">
      </div>
      <p class="status-message" id="import-status" aria-live="polite"></p>
    </section>

    <p class="muted">Importing yachts from your research sheet (CSV) is added in build step 0.6.</p>
  `);

  container.querySelector('#export-button').addEventListener('click', downloadJSON);
  container.querySelector('#import-file').addEventListener('change', handleImport);
}

// Turn the saved data into a file and start a download,
// named e.g. yacht-proposal-builder-2026-11-17.json
function downloadJSON() {
  const blob = new Blob([exportJSON()], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `yacht-proposal-builder-${todayISO()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function handleImport(event) {
  const input = event.target;
  const status = document.getElementById('import-status');
  const file = input.files[0];
  if (!file) return;

  const confirmed = window.confirm(
    'Replace all data in this browser with this file? This cannot be undone. Export first if you want to keep what is here.'
  );
  if (!confirmed) {
    input.value = '';
    return;
  }

  const result = importJSON(await file.text());
  status.classList.toggle('is-error', !result.ok);
  status.textContent = result.ok ? `Imported ${file.name}.` : `Not imported. ${result.error}`;
  input.value = '';
}

// The saved time is stored in UTC; show the date in the user's own time zone.
function localDate(timestamp) {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
