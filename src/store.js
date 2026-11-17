// The store: where the app keeps its data.
//
// Everything is saved in this browser's localStorage. Nothing is sent to
// a server. Because browser storage can be cleared, the user can export
// everything to a JSON file and import it again later.
//
// Shape of the saved data:
// {
//   app: 'yacht-proposal-builder',
//   version: 1,
//   savedAt: '2026-11-17T14:30:00.000Z',
//   settings: { 'apa.default': { value: 35, dateChecked: '2026-11-17' } },  // only settings the user changed
//   collections: { enquiries: [ ... ], yachts: [ ... ] }                       // one list per kind of record
// }
//
// Sample records carry  example: true  so the app can show the
// "Example data" banner and remove them all with one button.

export const APP_ID = 'yacht-proposal-builder';
export const DATA_VERSION = 1;
const STORAGE_KEY = APP_ID;

// ---------------------------------------------------------------------------
// Pure functions (no browser needed, so they are tested in tests/store.test.js)
// ---------------------------------------------------------------------------

export function createEmptyState() {
  return { app: APP_ID, version: DATA_VERSION, savedAt: null, settings: {}, collections: {} };
}

// Check a file the user is importing before it replaces anything.
// Returns { ok: true, state } or { ok: false, error: 'plain English reason' }.
export function validateImport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not valid JSON.' };
  }
  if (!data || data.app !== APP_ID) {
    return { ok: false, error: 'This file was not exported from Yacht Proposal Builder.' };
  }
  if (typeof data.version !== 'number' || data.version > DATA_VERSION) {
    return { ok: false, error: 'This file comes from a newer version of the app.' };
  }
  const collections = data.collections ?? {};
  if (typeof collections !== 'object' || Array.isArray(collections)) {
    return { ok: false, error: 'The records in this file are not in the expected format.' };
  }
  for (const [name, records] of Object.entries(collections)) {
    if (!Array.isArray(records)) {
      return { ok: false, error: `"${name}" in this file is not a list of records.` };
    }
  }
  const settings = data.settings ?? {};
  if (typeof settings !== 'object' || Array.isArray(settings)) {
    return { ok: false, error: 'The settings in this file are not in the expected format.' };
  }
  return { ok: true, state: { ...createEmptyState(), savedAt: data.savedAt ?? null, settings, collections } };
}

// True if any saved record is a sample record.
export function hasExampleData(state) {
  return Object.values(state.collections).some((records) => records.some((r) => r.example === true));
}

// A copy of the state with every sample record taken out. The user's own
// records are kept untouched.
export function removeExampleData(state) {
  const collections = {};
  for (const [name, records] of Object.entries(state.collections)) {
    collections[name] = records.filter((r) => r.example !== true);
  }
  return { ...state, collections };
}

// How many records of each kind, e.g. { enquiries: 12, yachts: 158 }.
export function countRecords(state) {
  return Object.fromEntries(Object.entries(state.collections).map(([name, records]) => [name, records.length]));
}

// ---------------------------------------------------------------------------
// Browser storage (uses localStorage, so not run in the Node tests)
// ---------------------------------------------------------------------------

let state = createEmptyState();
let storageWorks = true;
const listeners = [];

// Read saved data when the app starts. If nothing is saved yet, or the
// saved data is damaged, start empty rather than crash.
export function load() {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (text) {
      const result = validateImport(text);
      state = result.ok ? result.state : createEmptyState();
    }
  } catch {
    // Some browsers block storage (e.g. strict private browsing).
    storageWorks = false;
  }
  return state;
}

function save() {
  state.savedAt = new Date().toISOString();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    storageWorks = true;
  } catch {
    storageWorks = false;
  }
  for (const listener of listeners) listener(state);
}

// False if the browser is refusing to save, so the app can warn the user
// to export before closing the tab.
export function isStorageWorking() {
  return storageWorks;
}

// Run a function whenever data changes (used to show or hide the banner).
export function onChange(listener) {
  listeners.push(listener);
}

export function getState() {
  return state;
}

export function getCollection(name) {
  return state.collections[name] ?? [];
}

export function saveCollection(name, records) {
  state.collections[name] = records;
  save();
}

export function clearExampleData() {
  state = removeExampleData(state);
  save();
}

// Replace everything with an imported file. Returns the same
// { ok, error } result as validateImport so the screen can explain failures.
export function importJSON(text) {
  const result = validateImport(text);
  if (result.ok) {
    state = result.state;
    save();
  }
  return result;
}

// Everything as nicely spaced JSON text, ready to download.
export function exportJSON() {
  return JSON.stringify(state, null, 2);
}
