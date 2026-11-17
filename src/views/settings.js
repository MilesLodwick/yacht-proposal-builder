// Settings screen.
// Shows every rule of thumb the app uses, grouped, with its source and the
// date it was checked. Each one opens to a small form to change it.

import { getSettings, saveSetting, resetSetting, resetAllSettings, validateSettingInput, formatSettingValue } from '../store.js';
import { formatDate, todayISO } from '../calc/dates.js';
import { escapeHTML } from './html.js';

let wrapper; // the part of the page this screen redraws
let status;  // stays in place so screen readers announce messages put in it

export function render(container) {
  status = document.createElement('p');
  status.className = 'status-message';
  status.setAttribute('role', 'status');
  wrapper = document.createElement('div');
  container.append(status, wrapper);
  draw();
}

// Draw (or redraw) the whole screen. "openId" keeps one setting open after
// saving, and "message" is read out to screen reader users.
function draw({ openId = null, message = '' } = {}) {
  const settings = getSettings();
  const toCheck = settings.filter((s) => !s.dateChecked).length;
  const changed = settings.filter((s) => s.changed).length;

  // Group settings under their headings, keeping the order from the file.
  const groups = new Map();
  for (const s of settings) {
    if (!groups.has(s.group)) groups.set(s.group, []);
    groups.get(s.group).push(s);
  }

  wrapper.innerHTML = `
    <p>Every rule of thumb the app uses. Change one here and every screen uses the new value. Rules vary by contract, yacht and year, so each shows where it came from and when it was last checked.</p>
    <p class="muted">${settings.length} settings. <span class="num">${toCheck}</span> still to be checked. <span class="num">${changed}</span> changed from the defaults.</p>
    ${changed ? '<p><button type="button" class="button button--secondary button--small" id="reset-all">Reset all to defaults</button></p>' : ''}
    ${[...groups].map(([group, list]) => `
      <section class="section settings-group" aria-labelledby="${slug(group)}">
        <h2 id="${slug(group)}">${escapeHTML(group)}</h2>
        ${list.map((s) => settingHTML(s, s.id === openId)).join('')}
      </section>`).join('')}
  `;

  wrapper.querySelector('#reset-all')?.addEventListener('click', () => {
    if (!window.confirm('Reset every setting to its default? Your changes will be lost.')) return;
    resetAllSettings();
    draw({ message: 'All settings reset to defaults.' });
  });

  for (const form of wrapper.querySelectorAll('form[data-id]')) {
    form.addEventListener('submit', onSave);
    form.querySelector('[data-reset]')?.addEventListener('click', () => {
      resetSetting(form.dataset.id);
      draw({ openId: form.dataset.id, message: 'Reset to default.' });
      focusSetting(form.dataset.id);
    });
  }

  status.textContent = message;
  if (openId) focusSetting(openId);
}

// One setting: a summary line (always visible) that opens to the form.
function settingHTML(s, open) {
  const id = s.id;
  const pill = s.dateChecked
    ? `<span class="pill pill--green">Checked ${formatDate(s.dateChecked)}</span>`
    : '<span class="pill pill--amber">To be checked</span>';
  const sourceText = s.sourceUrl
    ? `<a href="${escapeHTML(s.sourceUrl)}" target="_blank" rel="noopener">${escapeHTML(s.source || s.sourceUrl)}</a>`
    : escapeHTML(s.source || 'No source yet');
  const defaultNote = s.changed ? `<p class="muted">Changed. Default: ${escapeHTML(formatSettingValue({ ...s, value: s.defaults.value }))}.</p>` : '';

  return `
    <details class="setting" data-setting="${escapeHTML(id)}" ${open ? 'open' : ''}>
      <summary>
        <span class="setting-label">${escapeHTML(s.label)}${s.changed ? ' <span class="muted">(changed)</span>' : ''}</span>
        <span class="setting-meta">
          <span class="setting-value">${escapeHTML(formatSettingValue(s))}</span>
          ${pill}
        </span>
      </summary>
      <div class="setting-body">
        ${s.note ? `<p>${escapeHTML(s.note)}</p>` : ''}
        <p class="muted">Source: ${sourceText}.</p>
        ${defaultNote}
        <form data-id="${escapeHTML(id)}" novalidate>
          <div class="form-grid">
            ${s.unit === 'on/off' ? tickBox(id, s.label, s.value) : field(id, 'value', `Value (${s.unit})`, s.value ?? '', 'text', 'inputmode="decimal"')}
            ${field(id, 'dateChecked', 'Date checked', s.dateChecked ?? '', 'date', `max="${todayISO()}"`)}
            ${field(id, 'source', 'Source name', s.source ?? '', 'text')}
            ${field(id, 'sourceUrl', 'Source link', s.sourceUrl ?? '', 'url', 'placeholder="https://"')}
          </div>
          <div class="button-row">
            <button type="submit" class="button button--small">Save</button>
            ${s.changed ? '<button type="button" class="button button--secondary button--small" data-reset>Reset to default</button>' : ''}
          </div>
        </form>
      </div>
    </details>`;
}

// A labelled input with a place for its error message underneath.
function field(settingId, name, label, value, type, extra = '') {
  const inputId = `${settingId}-${name}`;
  return `
    <div class="field">
      <label for="${escapeHTML(inputId)}">${escapeHTML(label)}</label>
      <input id="${escapeHTML(inputId)}" name="${name}" type="${type}" value="${escapeHTML(value)}" ${extra}
             aria-describedby="${escapeHTML(inputId)}-error">
      <p class="field-error" id="${escapeHTML(inputId)}-error"></p>
    </div>`;
}

// A labelled tick box for on/off settings. The country is the setting's own
// label, shown just above, so the box reads "Charge VAT on APA".
function tickBox(settingId, label, checked) {
  const inputId = `${settingId}-value`;
  return `
    <div class="field field--tick">
      <input id="${escapeHTML(inputId)}" name="value" type="checkbox" ${checked ? 'checked' : ''}
             aria-describedby="${escapeHTML(inputId)}-error">
      <label for="${escapeHTML(inputId)}">Charge VAT on APA <span class="visually-hidden">(${escapeHTML(label)})</span></label>
      <p class="field-error" id="${escapeHTML(inputId)}-error"></p>
    </div>`;
}

function onSave(event) {
  event.preventDefault();
  const form = event.target;
  const id = form.dataset.id;
  const setting = getSettings().find((s) => s.id === id);
  const input = Object.fromEntries(new FormData(form));
  const result = validateSettingInput(setting, input, todayISO());

  // Clear old errors, then show new ones next to the right inputs.
  for (const input of form.querySelectorAll('input')) {
    input.removeAttribute('aria-invalid');
    form.querySelector(`#${CSS.escape(input.id)}-error`).textContent = '';
  }
  if (!result.ok) {
    let first = null;
    for (const [name, message] of Object.entries(result.errors)) {
      const input = form.elements[name];
      input.setAttribute('aria-invalid', 'true');
      form.querySelector(`#${CSS.escape(input.id)}-error`).textContent = message;
      first ??= input;
    }
    first.focus();
    return;
  }

  saveSetting(id, result.fields);
  draw({ openId: id, message: `Saved: ${setting.label}.` });
}

function focusSetting(id) {
  wrapper.querySelector(`[data-setting="${CSS.escape(id)}"] summary`)?.focus();
}

function slug(text) {
  return 'group-' + text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}
