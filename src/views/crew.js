// Crew records screen (yacht management).
//
//   #/crew          a managed yacht's crew with STCW, ENG1 and Certificate
//                   of Competency status, and a form to add a crew member
//   #/crew/<id>     one crew member's details and certificates

import { getCollection, saveCollection, getSettings } from '../store.js';
import { CERT_TYPES, ROLES, certLabel, memberStatus, typeStatus, crewSummary, validateMember, validateCertificate } from '../crew.js';
import { formatDate, todayISO } from '../calc/dates.js';
import { escapeHTML } from './html.js';

const amberDays = () => getSettings().find((s) => s.id === 'alerts.expiryAmberDays')?.value ?? 60;
let yachtId = null; // the yacht shown, remembered while the app is open

export function render(container, param, heading) {
  if (!param) return renderCrew(container);
  const member = getCollection('crew').find((m) => m.id === param);
  if (!member) {
    heading.textContent = 'Crew member not found';
    container.insertAdjacentHTML('beforeend', '<p><a href="#/crew">Back to crew records</a></p>');
    return;
  }
  heading.textContent = member.name;
  renderMember(container, member);
}

const pill = (status) => (status ? `<span class="pill pill--${status.tone}">${escapeHTML(status.text)}</span>` : '<span class="muted">-</span>');

// ---------------------------------------------------------------------------
// A yacht's crew
// ---------------------------------------------------------------------------

function renderCrew(container) {
  const today = todayISO();
  const yachts = getCollection('managedYachts');
  if (!yachts.length) {
    container.insertAdjacentHTML('beforeend', '<p class="placeholder">No managed yachts yet. Add one under <a href="#/compliance">Compliance</a> first.</p>');
    return;
  }
  if (!yachts.some((y) => y.id === yachtId)) yachtId = yachts[0].id;
  const yacht = yachts.find((y) => y.id === yachtId);
  const crew = getCollection('crew').filter((m) => m.yachtId === yachtId)
    .sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || a.name.localeCompare(b.name));
  const s = crewSummary(crew, today, amberDays());

  container.insertAdjacentHTML('beforeend', `
    <p>Each crew member's certificates, with the same colours as compliance: red expired, amber within ${amberDays()} days, green otherwise. STCW and ENG1 are expected for everyone, so a missing one is flagged.</p>
    <form class="section" novalidate>
      <div class="field">
        <label for="yacht">Yacht</label>
        <select id="yacht">${yachts.map((y) => `<option value="${escapeHTML(y.id)}" ${y.id === yachtId ? 'selected' : ''}>${escapeHTML(y.name)}</option>`).join('')}</select>
      </div>
      ${yacht.example ? '<p class="hint">Fictional yacht and crew, used as an example.</p>' : ''}
    </form>

    <p class="results-summary">${s.total} crew.
      ${s.red ? `<span class="pill pill--red">${s.red} with something expired</span>` : ''}
      ${s.amber ? `<span class="pill pill--amber">${s.amber} to act on soon</span>` : ''}
      <span class="pill pill--green">${s.green} all in date</span></p>

    ${crew.length ? `
      <div class="table-wrap">
        <table class="data-table data-table--wide">
          <caption class="visually-hidden">Crew and certificates</caption>
          <thead><tr><th scope="col">Crew member</th>${CERT_TYPES.slice(0, 3).map((t) => `<th scope="col">${t.label}</th>`).join('')}<th scope="col">Other</th></tr></thead>
          <tbody>
            ${crew.map((m) => {
              const others = (m.certificates ?? []).filter((c) => c.type === 'other');
              return `<tr>
                <th scope="row" data-label="Crew member"><a href="#/crew/${escapeHTML(m.id)}">${escapeHTML(m.name)}</a><span class="cell-sub">${escapeHTML(m.role)}</span></th>
                ${CERT_TYPES.slice(0, 3).map((t) => `<td data-label="${t.label}">${pill(typeStatus(m, t.id, today, amberDays()))}</td>`).join('')}
                <td data-label="Other"><span>${others.length ? others.map((c) => escapeHTML(c.detail)).join(', ') : '<span class="muted">-</span>'}</span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : '<p class="placeholder">No crew recorded for this yacht yet.</p>'}

    <form class="section" id="member-form" novalidate>
      <h2>Add a crew member</h2>
      <div class="form-grid form-grid--3">
        ${field('name', 'Name')}
        ${field('role', 'Role', 'text', '', 'list="roles"')}
        ${field('joined', 'Joined (optional)', 'date')}
      </div>
      <datalist id="roles">${ROLES.map((r) => `<option value="${r}">`).join('')}</datalist>
      <button type="submit" class="button">Add crew member</button>
    </form>
  `);

  container.querySelector('#yacht').addEventListener('change', (event) => {
    yachtId = event.target.value;
    container.replaceChildren(container.querySelector('h1'));
    renderCrew(container);
  });

  const form = container.querySelector('#member-form');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = Object.fromEntries(new FormData(form));
    const result = validateMember(input);
    showErrors(form, result.ok ? {} : result.errors);
    if (!result.ok) return;
    const member = {
      id: `crew-${Date.now().toString(36)}`, yachtId, name: input.name.trim(), role: input.role.trim(),
      joined: input.joined || null, notes: '', certificates: [],
    };
    saveCollection('crew', [...getCollection('crew'), member]);
    location.hash = `#/crew/${member.id}`;
  });
}

// ---------------------------------------------------------------------------
// One crew member
// ---------------------------------------------------------------------------

function renderMember(container, saved) {
  const today = todayISO();
  let member = structuredClone(saved);
  let editingCertId = null;
  const yacht = getCollection('managedYachts').find((y) => y.id === member.yachtId);

  const save = () => saveCollection('crew', getCollection('crew').map((m) => (m.id === member.id ? member : m)));

  container.insertAdjacentHTML('beforeend', `
    <p><a href="#/crew">Back to crew records</a></p>
    <p class="muted">${escapeHTML(member.role)}${yacht ? ` on ${escapeHTML(yacht.name)}` : ''}${member.joined ? `, joined ${formatDate(member.joined)}` : ''}</p>
    ${member.example ? '<p class="notice">This is a fictional crew member, used as an example.</p>' : ''}
    <div id="needs-action"></div>

    <section class="section" aria-labelledby="certs-heading">
      <h2 id="certs-heading">Certificates</h2>
      <div id="certs"></div>
      <form id="cert-form" novalidate>
        <h3 id="cert-form-heading">Add a certificate</h3>
        <div class="form-grid">
          <div class="field">
            <label for="type">Type</label>
            <select id="type" name="type" aria-describedby="type-hint type-error">
              ${CERT_TYPES.map((t) => `<option value="${t.id}">${escapeHTML(t.label)}</option>`).join('')}
            </select>
            <p class="hint" id="type-hint"></p>
            <p class="field-error" id="type-error"></p>
          </div>
          ${field('detail', 'Details (grade or course)')}
          ${field('number', 'Certificate number (optional)')}
          ${field('expiresOn', 'Expires on', 'date')}
        </div>
        <p class="status-message" role="status" id="cert-status"></p>
        <div class="button-row">
          <button type="submit" class="button" id="save-cert">Add certificate</button>
          <button type="button" class="button button--secondary" id="cancel-cert" hidden>Cancel editing</button>
        </div>
      </form>
    </section>

    <form class="section" id="details-form" novalidate>
      <h2>Details</h2>
      <div class="form-grid form-grid--3">
        ${field('name', 'Name', 'text', member.name)}
        ${field('role', 'Role', 'text', member.role, 'list="roles"')}
        ${field('joined', 'Joined', 'date', member.joined ?? '')}
      </div>
      <datalist id="roles">${ROLES.map((r) => `<option value="${r}">`).join('')}</datalist>
      ${field('notes', 'Notes', 'text', member.notes ?? '')}
      <p class="status-message" role="status" id="details-status"></p>
      <div class="button-row">
        <button type="submit" class="button button--small">Save details</button>
        <button type="button" class="button button--danger button--small" id="delete-member">Remove crew member</button>
      </div>
    </form>
  `);

  const certForm = container.querySelector('#cert-form');
  const showHint = () => {
    container.querySelector('#type-hint').textContent = CERT_TYPES.find((t) => t.id === certForm.elements.type.value).hint;
  };
  certForm.elements.type.addEventListener('change', showHint);
  showHint();

  const draw = () => {
    const s = memberStatus(member, today, amberDays());
    container.querySelector('#needs-action').innerHTML = s.needsAction.length
      ? `<div class="notice notice--warn"><p><strong>To act on:</strong></p><ul>${s.needsAction.map((c) => `<li>${escapeHTML(c.missing ? c.status.text : `${certLabel(c.type)}${c.detail ? ` (${c.detail})` : ''}: ${c.status.text.charAt(0).toLowerCase()}${c.status.text.slice(1)}`)}</li>`).join('')}</ul></div>`
      : '<p class="notice">All certificates in date.</p>';
    const certs = s.certificates.filter((c) => !c.missing);
    container.querySelector('#certs').innerHTML = certs.length ? `
      <table class="handover-table cert-table">
        <caption class="visually-hidden">Certificates, most urgent first</caption>
        <thead><tr><th scope="col">Certificate</th><th scope="col">Expires</th><th scope="col">Status</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr></thead>
        <tbody>
          ${certs.map((c) => `<tr>
            <th scope="row">${escapeHTML(certLabel(c.type))}${c.detail ? `<span class="cell-sub">${escapeHTML(c.detail)}</span>` : ''}${c.number ? `<span class="cell-sub">${escapeHTML(c.number)}</span>` : ''}</th>
            <td>${formatDate(c.expiresOn)}</td>
            <td>${pill(c.status)}</td>
            <td><span class="button-row">
              <button type="button" class="button button--secondary button--small" data-edit="${escapeHTML(c.id)}">Edit<span class="visually-hidden"> ${escapeHTML(certLabel(c.type))}</span></button>
              <button type="button" class="button button--danger button--small" data-delete="${escapeHTML(c.id)}">Delete<span class="visually-hidden"> ${escapeHTML(certLabel(c.type))}</span></button>
            </span></td>
          </tr>`).join('')}
        </tbody>
      </table>` : '<p class="muted">No certificates recorded yet.</p>';
  };

  const resetCertForm = () => {
    editingCertId = null;
    certForm.reset();
    showHint();
    container.querySelector('#cert-form-heading').textContent = 'Add a certificate';
    container.querySelector('#save-cert').textContent = 'Add certificate';
    container.querySelector('#cancel-cert').hidden = true;
  };
  container.querySelector('#cancel-cert').addEventListener('click', resetCertForm);

  certForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = Object.fromEntries(new FormData(certForm));
    const result = validateCertificate(input);
    showErrors(certForm, result.ok ? {} : result.errors);
    if (!result.ok) return;
    const cert = { type: input.type, detail: input.detail.trim(), number: input.number.trim(), expiresOn: input.expiresOn };
    member = {
      ...member,
      certificates: editingCertId
        ? member.certificates.map((c) => (c.id === editingCertId ? { id: c.id, ...cert } : c))
        : [...(member.certificates ?? []), { id: `cert-${Date.now().toString(36)}`, ...cert }],
    };
    save();
    container.querySelector('#cert-status').textContent = editingCertId ? 'Saved.' : 'Certificate added.';
    resetCertForm();
    draw();
  });

  container.querySelector('#certs').addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const id = button.dataset.edit || button.dataset.delete;
    const cert = member.certificates.find((c) => c.id === id);
    if (!cert) return;
    if (button.dataset.delete) {
      if (!window.confirm(`Delete the ${certLabel(cert.type)} certificate?`)) return;
      member = { ...member, certificates: member.certificates.filter((c) => c.id !== id) };
      save();
      container.querySelector('#cert-status').textContent = 'Deleted.';
      draw();
      return;
    }
    editingCertId = id;
    for (const name of ['type', 'detail', 'number', 'expiresOn']) certForm.elements[name].value = cert[name] ?? '';
    showHint();
    container.querySelector('#cert-form-heading').textContent = 'Edit certificate';
    container.querySelector('#save-cert').textContent = 'Save changes';
    container.querySelector('#cancel-cert').hidden = false;
    certForm.elements.type.focus();
  });

  const detailsForm = container.querySelector('#details-form');
  detailsForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = Object.fromEntries(new FormData(detailsForm));
    const result = validateMember(input);
    showErrors(detailsForm, result.ok ? {} : result.errors);
    if (!result.ok) return;
    member = { ...member, name: input.name.trim(), role: input.role.trim(), joined: input.joined || null, notes: input.notes.trim() };
    save();
    container.querySelector('h1').textContent = member.name;
    container.querySelector('#details-status').textContent = 'Saved.';
  });

  container.querySelector('#delete-member').addEventListener('click', () => {
    if (!window.confirm(`Remove ${member.name} from the crew records?`)) return;
    saveCollection('crew', getCollection('crew').filter((m) => m.id !== member.id));
    location.hash = '#/crew';
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
    const errorEl = form.querySelector(`#${name}-error`);
    if (errorEl) errorEl.textContent = message;
    first ??= form.elements[name];
  }
  first?.focus();
}
