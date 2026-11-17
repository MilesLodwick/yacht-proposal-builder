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

import { parseDate } from './calc/dates.js';

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
// Settings (pure functions)
//
// Defaults live in data/settings.json. When the user changes a setting,
// only their version is saved (in state.settings), so "Reset to default"
// just deletes it and the default shows through again.
// ---------------------------------------------------------------------------

// The fields a user can change on each setting.
const EDITABLE = ['value', 'source', 'sourceUrl', 'dateChecked'];

// Combine defaults with the user's changes. Each setting gets
//   changed: true/false   and   defaults: { the original values }
// so the screen can show "Changed from default" and offer a reset.
export function mergeSettings(defaults, overrides) {
  return defaults.map((setting) => {
    const override = overrides[setting.id];
    const defaultsCopy = Object.fromEntries(EDITABLE.map((field) => [field, setting[field]]));
    if (!override) return { ...setting, changed: false, defaults: defaultsCopy };
    const changes = Object.fromEntries(EDITABLE.filter((f) => f in override).map((f) => [f, override[f]]));
    return { ...setting, ...changes, changed: true, defaults: defaultsCopy };
  });
}

// Check what the user typed for one setting before saving it.
// "input" holds the raw text from the form: { value, source, sourceUrl, dateChecked }.
// "today" is passed in (YYYY-MM-DD) so the function stays testable.
// Returns { ok: true, fields } or { ok: false, errors: { field: 'message' } }.
export function validateSettingInput(setting, input, today) {
  const errors = {};
  const fields = {};
  const unit = setting.unit;

  // Value.
  if (unit === 'on/off') {
    // A tick box. A ticked box sends "on"; an unticked box sends nothing.
    fields.value = input.value === 'on' || input.value === true;
  } else {
    // A number. Settings whose default is empty (currency rates) may be left empty.
    const rawValue = String(input.value ?? '').trim().replace(/,/g, '');
    const valueMayBeEmpty = setting.defaults ? setting.defaults.value === null : setting.value === null;
    const number = Number(rawValue);
    if (rawValue === '') {
      if (valueMayBeEmpty) fields.value = null;
      else errors.value = 'Enter a number.';
    } else if (!Number.isFinite(number)) {
      errors.value = 'Enter a number, e.g. 30 or 5.2.';
    } else if (number < 0) {
      errors.value = 'This cannot be negative.';
    } else if (unit.startsWith('%') && number > 100) {
      errors.value = 'A percentage cannot be more than 100.';
    } else if (unit === 'rate' && number === 0) {
      errors.value = 'A currency rate must be more than 0.';
    } else if (/days|years/.test(unit) && !Number.isInteger(number)) {
      errors.value = 'Use a whole number.';
    } else {
      fields.value = number;
    }
  }

  // Source name: free text, or empty.
  const source = String(input.source ?? '').trim();
  fields.source = source === '' ? null : source;

  // Source link: must be a web address if given.
  const url = String(input.sourceUrl ?? '').trim();
  if (url === '') fields.sourceUrl = null;
  else if (!/^https?:\/\/\S+\.\S+/.test(url)) errors.sourceUrl = 'Enter a full web address starting with https://';
  else fields.sourceUrl = url;

  // Date checked: a real date, not in the future.
  const date = String(input.dateChecked ?? '').trim();
  if (date === '') fields.dateChecked = null;
  else if (!parseDate(date)) errors.dateChecked = 'Enter a valid date.';
  else if (date > today) errors.dateChecked = 'The date checked cannot be in the future.';
  else fields.dateChecked = date;

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, fields };
}

// How a setting's value reads on screen: "30% of charter fee", "4 banking days",
// "1.08", or "Not set".
export function formatSettingValue(setting) {
  if (setting.unit === 'on/off') return setting.value ? 'On' : 'Off';
  if (setting.value === null || setting.value === undefined) return 'Not set';
  const number = setting.value.toLocaleString('en-GB', { maximumFractionDigits: 4 });
  if (setting.unit === 'rate') return number;
  if (setting.unit.startsWith('%')) return `${number}${setting.unit}`;
  return `${number} ${setting.unit}`;
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

// True once a collection has ever been saved, even if it is now empty.
// Used to load the published yacht list on a first visit only.
export function hasCollection(name) {
  return name in state.collections;
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

// Settings: defaults are fetched from data/settings.json once at start-up.
let defaultSettings = [];

export async function loadDefaultSettings(url = 'data/settings.json') {
  const response = await fetch(url);
  const data = await response.json();
  defaultSettings = data.settings;
}

// Every setting with the user's changes applied. Screens use this.
export function getSettings() {
  return mergeSettings(defaultSettings, state.settings);
}

export function saveSetting(id, fields) {
  state.settings[id] = fields;
  save();
}

export function resetSetting(id) {
  delete state.settings[id];
  save();
}

export function resetAllSettings() {
  state.settings = {};
  save();
}

// Everything as nicely spaced JSON text, ready to download.
export function exportJSON() {
  return JSON.stringify(state, null, 2);
}
