// Compliance screen (yacht management).
//
//   #/compliance          managed yachts with red, amber and green counts,
//                         and a form to add a managed yacht
//   #/compliance/<id>     one yacht's certificates, audits, surveys and
//                         policies, most urgent first

import { getCollection, saveCollection, getSettings } from '../store.js';
import {
  COMPLIANCE_CATEGORIES, categoryLabel, complianceList, complianceSummary, validateItem, validateManagedYacht,
} from '../compliance.js';
import { formatDate, todayISO } from '../calc/dates.js';
import { escapeHTML } from './html.js';

const amberDays = () => getSettings().find((s) => s.id === 'alerts.expiryAmberDays')?.value ?? 60;

export function render(container, param, heading) {
  if (!param) return renderOverview(container);
  const yacht = getCollection('managedYachts').find((y) => y.id === param);
  if (!yacht) {
    heading.textContent = 'Yacht not found';
    container.insertAdjacentHTML('beforeend', '<p><a href="#/compliance">Back to compliance</a></p>');
    return;
  }
  heading.textContent = `Compliance: ${yacht.name}`;
  renderYacht(container, yacht);
}

function countPills(c) {
  return `<span class="pill-row pill-row--tight">
    ${c.red ? `<span class="pill pill--red">${c.red} expired</span>` : ''}
    ${c.amber ? `<span class="pill pill--amber">${c.amber} due soon</span>` : ''}
    <span class="pill pill--green">${c.green} in date</span>
  </span>`;
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function renderOverview(container) {
  const today = todayISO();
  const yachts = getCollection('managedYachts');
  const items = getCollection('compliance');

  container.insertAdjacentHTML('beforeend', `
    <p>Certificates, audits, surveys and insurance for each managed yacht. Red when expired, amber within ${amberDays()} days (change this in Settings), green otherwise.</p>
    ${yachts.length ? `
      <div class="table-wrap">
        <table class="data-table">
          <caption class="visually-hidden">Managed yachts</caption>
          <thead><tr><th scope="col">Yacht</th><th scope="col">Flag and class</th><th scope="col">Status</th></tr></thead>
          <tbody>
            ${yachts.map((y) => {
              const s = complianceSummary(items.filter((i) => i.yachtId === y.id), today, amberDays());
              return `<tr>
                <th scope="row" data-label="Yacht"><a href="#/compliance/${escapeHTML(y.id)}">${escapeHTML(y.name)}</a><span class="cell-sub">${y.lengthM ? `${y.lengthM} m` : ''}</span></th>
                <td data-label="Flag and class"><span>${escapeHTML(y.flag || 'Flag not recorded')}<span class="cell-sub">${escapeHTML(y.classSociety || '')}</span></span></td>
                <td data-label="Status">${countPills(s.total)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : '<p class="placeholder">No managed yachts yet. Add one below.</p>'}

    <form class="section" id="yacht-form" novalidate>
      <h2>Add a managed yacht</h2>
      <p class="hint">Managed yachts are kept separate from the charter and sale listings, because their compliance records are private.</p>
      <div class="form-grid">
        ${field('name', 'Yacht name')}
        ${field('lengthM', 'Length (m)', 'text', '', 'inputmode="decimal"')}
        ${field('flag', 'Flag')}
        ${field('classSociety', 'Classification society')}
      </div>
      <button type="submit" class="button">Add yacht</button>
    </form>
  `);

  const form = container.querySelector('#yacht-form');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = Object.fromEntries(new FormData(form));
    const result = validateManagedYacht(input);
    showErrors(form, result.ok ? {} : result.errors);
    if (!result.ok) return;
    const yacht = {
      id: `managed-${Date.now().toString(36)}`, name: input.name.trim(), lengthM: input.lengthM ? Number(input.lengthM) : null,
      flag: input.flag.trim(), classSociety: input.classSociety.trim(), notes: '',
    };
    saveCollection('managedYachts', [...yachts, yacht]);
    location.hash = `#/compliance/${yacht.id}`;
  });
}

// ---------------------------------------------------------------------------
// One yacht
// ---------------------------------------------------------------------------

function renderYacht(container, yacht) {
  const today = todayISO();
  let editingId = null;
  const mine = () => getCollection('compliance').filter((i) => i.yachtId === yacht.id);

  container.insertAdjacentHTML('beforeend', `
    <p><a href="#/compliance">Back to compliance</a></p>
    <p class="muted">${[yacht.lengthM && `${yacht.lengthM} m`, yacht.flag, yacht.classSociety].filter(Boolean).map(escapeHTML).join(' · ')}</p>
    ${yacht.example ? '<p class="notice">This is a fictional yacht with made-up certificates, used as an example.</p>' : ''}
    <div id="summary"></div>
    <div id="items"></div>

    <form class="section" id="item-form" novalidate>
      <h2 id="form-heading">Add a certificate, audit or policy</h2>
      <div class="form-grid">
        <div class="field">
          <label for="category">Category</label>
          <select id="category" name="category" aria-describedby="category-error">
            ${COMPLIANCE_CATEGORIES.map((c) => `<option value="${c.id}">${escapeHTML(c.label)}</option>`).join('')}
          </select>
          <p class="field-error" id="category-error"></p>
        </div>
        ${field('title', 'What it is', 'text', '', 'list="title-suggestions"')}
        ${field('reference', 'Certificate or policy number (optional)')}
        ${field('expiresOn', 'Expires or due on', 'date')}
      </div>
      <datalist id="title-suggestions"></datalist>
      ${field('notes', 'Notes (optional)')}
      <p class="status-message" role="status" id="item-status"></p>
      <div class="button-row">
        <button type="submit" class="button" id="save-item">Add</button>
        <button type="button" class="button button--secondary" id="cancel-edit" hidden>Cancel editing</button>
      </div>
    </form>
  `);

  const form = container.querySelector('#item-form');
  // Suggested titles for the chosen category (the user can type anything).
  const suggest = () => {
    const cat = COMPLIANCE_CATEGORIES.find((c) => c.id === form.elements.category.value);
    container.querySelector('#title-suggestions').innerHTML = cat.suggestions.map((s) => `<option value="${escapeHTML(s)}">`).join('');
  };
  form.elements.category.addEventListener('change', suggest);
  suggest();

  const draw = () => {
    const items = mine();
    const s = complianceSummary(items, today, amberDays());
    container.querySelector('#summary').innerHTML = `
      <div class="section">
        <p class="results-summary">${countPills(s.total)}</p>
        <div class="category-grid">
          ${s.byCategory.map((c) => `<div class="category-chip ${c.red ? 'is-red' : c.amber ? 'is-amber' : c.green ? 'is-green' : 'is-empty'}">
            <span class="category-name">${escapeHTML(c.label)}</span>
            <span class="cell-sub">${c.red + c.amber + c.green ? `${c.red ? `${c.red} expired` : c.amber ? `${c.amber} due soon` : 'All in date'}` : 'Nothing recorded'}</span>
          </div>`).join('')}
        </div>
        ${s.missingCategories.length ? `<p class="hint">Nothing recorded yet for: ${s.missingCategories.map(escapeHTML).join(', ')}.</p>` : ''}
      </div>`;

    const list = complianceList(items, today, amberDays());
    container.querySelector('#items').innerHTML = list.length ? `
      <div class="table-wrap">
        <table class="data-table data-table--wide">
          <caption class="visually-hidden">Certificates, audits and policies, most urgent first</caption>
          <thead><tr><th scope="col">Item</th><th scope="col">Category</th><th scope="col">Expires or due</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
          <tbody>
            ${list.map((i) => `<tr>
              <th scope="row" data-label="Item">${escapeHTML(i.title)}${i.reference ? `<span class="cell-sub">${escapeHTML(i.reference)}</span>` : ''}${i.notes ? `<span class="cell-sub feedback-text">${escapeHTML(i.notes)}</span>` : ''}</th>
              <td data-label="Category">${escapeHTML(categoryLabel(i.category))}</td>
              <td data-label="Expires or due">${i.expiresOn ? formatDate(i.expiresOn) : 'Not recorded'}</td>
              <td data-label="Status"><span class="pill pill--${i.status.tone}">${escapeHTML(i.status.text)}</span></td>
              <td data-label="Actions"><span class="button-row">
                <button type="button" class="button button--secondary button--small" data-edit="${escapeHTML(i.id)}">Edit<span class="visually-hidden"> ${escapeHTML(i.title)}</span></button>
                <button type="button" class="button button--danger button--small" data-delete="${escapeHTML(i.id)}">Delete<span class="visually-hidden"> ${escapeHTML(i.title)}</span></button>
              </span></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` : '<p class="placeholder">No certificates or audits recorded yet.</p>';
  };

  const resetForm = () => {
    editingId = null;
    form.reset();
    suggest();
    container.querySelector('#form-heading').textContent = 'Add a certificate, audit or policy';
    container.querySelector('#save-item').textContent = 'Add';
    container.querySelector('#cancel-edit').hidden = true;
  };
  container.querySelector('#cancel-edit').addEventListener('click', resetForm);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = Object.fromEntries(new FormData(form));
    const result = validateItem(input);
    showErrors(form, result.ok ? {} : result.errors);
    if (!result.ok) return;
    const record = {
      yachtId: yacht.id, category: input.category, title: input.title.trim(),
      reference: input.reference.trim(), expiresOn: input.expiresOn || null, notes: input.notes.trim(),
    };
    const all = getCollection('compliance');
    if (editingId) {
      saveCollection('compliance', all.map((i) => (i.id === editingId ? { id: i.id, ...(i.example ? { example: true } : {}), ...record } : i)));
    } else {
      saveCollection('compliance', [...all, { id: `comp-${Date.now().toString(36)}`, ...record }]);
    }
    container.querySelector('#item-status').textContent = editingId ? 'Saved.' : 'Added.';
    resetForm();
    draw();
  });

  container.querySelector('#items').addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const all = getCollection('compliance');
    const id = button.dataset.edit || button.dataset.delete;
    const item = all.find((i) => i.id === id);
    if (!item) return;
    if (button.dataset.delete) {
      if (!window.confirm(`Delete "${item.title}"?`)) return;
      saveCollection('compliance', all.filter((i) => i.id !== id));
      container.querySelector('#item-status').textContent = 'Deleted.';
      draw();
      return;
    }
    editingId = id;
    for (const name of ['category', 'title', 'reference', 'expiresOn', 'notes']) form.elements[name].value = item[name] ?? '';
    suggest();
    container.querySelector('#form-heading').textContent = 'Edit';
    container.querySelector('#save-item').textContent = 'Save changes';
    container.querySelector('#cancel-edit').hidden = false;
    form.elements.title.focus();
  });

  draw();
}

function field(name, label, type = 'text', value = '', extra = '') {
  return `
    <div class="field">
      <label for="${name}">${escapeHTML(label)}</label>
      <input id="${name}" name="${name}" type="${type}" value="${escapeHTML(value)}" aria-describedby="${name}-error" ${extra}>
      <p class="field-error" id="${name}-error"></p>
    </div>`;
}

function showErrors(form, errors) {
  for (const el of form.querySelectorAll('.field-error')) el.textContent = '';
  for (const el of form.querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
  let first = null;
  for (const [name, message] of Object.entries(errors)) {
    form.elements[name].setAttribute('aria-invalid', 'true');
    form.querySelector(`#${name}-error`).textContent = message;
    first ??= form.elements[name];
  }
  first?.focus();
}
