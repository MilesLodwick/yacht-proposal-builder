// Enquiries screen: the enquiry log (a simple CRM).
//
//   #/enquiries          the list, with a status filter
//   #/enquiries/new      a blank form
//   #/enquiries/<id>     the form for one enquiry, to edit it

import { getCollection, saveCollection } from '../store.js';
import { STATUSES, SOURCES, statusTone, charterDays, validateEnquiry, newEnquiryId } from '../enquiries.js';
import { EMBARKATION_COUNTRIES } from '../calc/charter.js';
import { CURRENCIES, formatMoney } from '../calc/currency.js';
import { formatDateRange, nowLocalDateTime } from '../calc/dates.js';
import { escapeHTML, groupThousandsAsYouType } from './html.js';

const COLLECTION = 'enquiries';

// A message to show on the list after saving or deleting (then cleared).
let flash = null;

// The status filter on the list is remembered while the app is open.
let statusFilter = 'all';

export function render(container, param, heading) {
  if (!param) return renderList(container);

  const enquiry = param === 'new' ? null : getCollection(COLLECTION).find((e) => e.id === param);
  if (param !== 'new' && !enquiry) {
    heading.textContent = 'Enquiry not found';
    container.insertAdjacentHTML('beforeend', '<p>This enquiry may have been deleted.</p><p><a href="#/enquiries">Back to enquiries</a></p>');
    return;
  }
  heading.textContent = enquiry ? enquiry.clientName : 'New enquiry';
  renderForm(container, enquiry);
}

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

function renderList(container) {
  const all = getCollection(COLLECTION);

  // Sort by pipeline stage, then by charter start date.
  const sorted = [...all].sort((a, b) =>
    STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || a.startDate.localeCompare(b.startDate));
  const shown = statusFilter === 'all' ? sorted : sorted.filter((e) => e.status === statusFilter);

  const message = flash;
  flash = null;

  container.insertAdjacentHTML('beforeend', `
    <p class="status-message ${message?.isError ? 'is-error' : ''}" role="status">${escapeHTML(message?.text ?? '')}</p>
    ${message?.warnings?.length ? `<p class="notice">${message.warnings.map(escapeHTML).join(' ')}</p>` : ''}

    <div class="toolbar">
      <a class="button" href="#/enquiries/new">Add enquiry</a>
      <div class="field field--inline">
        <label for="status-filter">Show</label>
        <select id="status-filter">
          <option value="all">All statuses (${all.length})</option>
          ${STATUSES.map((s) => {
            const count = all.filter((e) => e.status === s).length;
            return `<option value="${s}" ${s === statusFilter ? 'selected' : ''}>${s} (${count})</option>`;
          }).join('')}
        </select>
      </div>
    </div>

    ${shown.length ? tableHTML(shown) : `<p class="placeholder">${all.length ? 'No enquiries at this status.' : 'No enquiries yet. Use Add enquiry to log the first one.'}</p>`}
  `);

  container.querySelector('#status-filter').addEventListener('change', (event) => {
    statusFilter = event.target.value;
    container.replaceChildren(container.querySelector('h1'));
    renderList(container);
    container.querySelector('#status-filter').focus();
  });
}

function tableHTML(enquiries) {
  return `
    <div class="table-wrap">
      <table class="data-table">
        <caption class="visually-hidden">Charter enquiries</caption>
        <thead>
          <tr>
            <th scope="col">Client</th>
            <th scope="col">Charter dates</th>
            <th scope="col">Starts in</th>
            <th scope="col" class="num">Guests</th>
            <th scope="col" class="num">Budget</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          ${enquiries.map((e) => `
            <tr>
              <th scope="row" data-label="Client">
                <a href="#/enquiries/${escapeHTML(e.id)}">${escapeHTML(e.clientName)}</a>
                <span class="cell-sub">${e.sourceType === 'Broker' ? `via ${escapeHTML(e.brokerName)}` : 'Direct'}</span>
              </th>
              <td data-label="Dates"><span>${formatDateRange(e.startDate, e.endDate)}<span class="cell-sub">${charterDays(e)} days</span></span></td>
              <td data-label="Starts in">${escapeHTML(countryLabel(e.embarkationCountry))}</td>
              <td data-label="Guests" class="num">${e.guests}</td>
              <td data-label="Budget" class="num">${e.budget ? formatMoney(e.budget, e.budgetCurrency) : 'Not set'}</td>
              <td data-label="Status"><span>
                <span class="pill pill--${statusTone(e.status)}">${escapeHTML(e.status)}</span>
                ${e.status === 'Lost' && e.lostReason ? `<span class="cell-sub">${escapeHTML(e.lostReason)}</span>` : ''}
              </span></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function countryLabel(id) {
  return EMBARKATION_COUNTRIES.find((c) => c.id === id)?.label ?? 'Not set';
}

// ---------------------------------------------------------------------------
// The form (add and edit)
// ---------------------------------------------------------------------------

function renderForm(container, enquiry) {
  // Starting values: the saved enquiry, or sensible defaults for a new one.
  const v = enquiry ?? {
    clientName: '', sourceType: 'Direct', brokerName: '', receivedAt: nowLocalDateTime(), firstReplyAt: '',
    startDate: '', endDate: '', guests: '', budget: '', budgetCurrency: 'EUR',
    embarkationCountry: '', greekEligible: false, status: 'New', lostReason: '', notes: '',
  };

  container.insertAdjacentHTML('beforeend', `
    <p><a href="#/enquiries">Back to enquiries</a></p>
    ${enquiry?.example ? '<p class="notice">This is a fictional example enquiry.</p>' : ''}

    <form id="enquiry-form" class="form" novalidate>
      <fieldset class="section">
        <legend>Client</legend>
        ${field('clientName', 'Client name', v.clientName)}
        <div class="form-grid">
          ${select('sourceType', 'Source', SOURCES.map((s) => [s, s === 'Broker' ? 'Retail broker' : 'Direct']), v.sourceType)}
          <div data-show-when="broker" ${v.sourceType === 'Broker' ? '' : 'hidden'}>
            ${field('brokerName', 'Which broker', v.brokerName ?? '')}
          </div>
          ${field('receivedAt', 'Enquiry received', v.receivedAt, 'datetime-local')}
          ${field('firstReplyAt', 'First reply sent', v.firstReplyAt ?? '', 'datetime-local', 'Leave empty until you have replied.')}
        </div>
      </fieldset>

      <fieldset class="section">
        <legend>Charter</legend>
        <div class="form-grid">
          ${field('startDate', 'Embarkation date', v.startDate, 'date')}
          ${field('endDate', 'Disembarkation date', v.endDate, 'date')}
          ${field('guests', 'Guests', v.guests, 'text', '', 'inputmode="numeric"')}
          ${select('embarkationCountry', 'Starts in (sets the VAT rate)', [['', 'Choose a country'], ...EMBARKATION_COUNTRIES.map((c) => [c.id, c.label])], v.embarkationCountry)}
          ${field('budget', 'Budget (all in)', v.budget ?? '', 'text', 'Optional. Compared with the total including VAT and APA.', 'inputmode="numeric"')}
          ${select('budgetCurrency', 'Budget currency', CURRENCIES.map((c) => [c, c]), v.budgetCurrency)}
        </div>
        <div data-show-when="greece" ${v.embarkationCountry === 'greece' ? '' : 'hidden'}>
          <div class="field field--tick">
            <input type="checkbox" id="greekEligible" name="greekEligible" ${v.greekEligible ? 'checked' : ''} aria-describedby="greekEligible-hint">
            <label for="greekEligible">Eligible for Greece's reduced charter VAT rate</label>
            <p class="hint" id="greekEligible-hint">Unticked uses the standard rate. Both rates are in Settings.</p>
          </div>
        </div>
      </fieldset>

      <fieldset class="section">
        <legend>Status</legend>
        ${select('status', 'Status', STATUSES.map((s) => [s, s]), v.status)}
        <div data-show-when="lost" ${v.status === 'Lost' ? '' : 'hidden'}>
          ${field('lostReason', 'Why was it lost?', v.lostReason ?? '')}
        </div>
        <div class="field">
          <label for="notes">Notes</label>
          <textarea id="notes" name="notes" rows="4">${escapeHTML(v.notes ?? '')}</textarea>
        </div>
      </fieldset>

      <div class="button-row">
        <button type="submit" class="button">Save enquiry</button>
        <a class="button button--secondary" href="#/enquiries">Cancel</a>
        ${enquiry ? '<button type="button" class="button button--danger" id="delete-enquiry">Delete</button>' : ''}
      </div>
    </form>
  `);

  const form = container.querySelector('#enquiry-form');
  groupThousandsAsYouType(form.elements.budget);

  // Show the broker name, Greek VAT tick box and lost reason only when they apply.
  const toggle = () => {
    form.querySelector('[data-show-when="broker"]').hidden = form.elements.sourceType.value !== 'Broker';
    form.querySelector('[data-show-when="greece"]').hidden = form.elements.embarkationCountry.value !== 'greece';
    form.querySelector('[data-show-when="lost"]').hidden = form.elements.status.value !== 'Lost';
  };
  form.addEventListener('change', toggle);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const result = validateEnquiry(Object.fromEntries(new FormData(form)));
    showErrors(form, result.ok ? {} : result.errors);
    if (!result.ok) return;

    const list = getCollection(COLLECTION);
    if (enquiry) {
      // Keep the id and the example flag; replace everything else.
      saveCollection(COLLECTION, list.map((e) => (e.id === enquiry.id ? { id: e.id, ...(e.example ? { example: true } : {}), ...result.record } : e)));
    } else {
      saveCollection(COLLECTION, [...list, { id: newEnquiryId(), ...result.record }]);
    }
    flash = { text: `Saved: ${result.record.clientName}.`, warnings: result.warnings };
    location.hash = '#/enquiries';
  });

  form.querySelector('#delete-enquiry')?.addEventListener('click', () => {
    if (!window.confirm(`Delete the enquiry from ${enquiry.clientName}? This cannot be undone.`)) return;
    saveCollection(COLLECTION, getCollection(COLLECTION).filter((e) => e.id !== enquiry.id));
    flash = { text: `Deleted: ${enquiry.clientName}.` };
    location.hash = '#/enquiries';
  });
}

// A labelled input with an optional hint and a place for its error.
function field(name, label, value, type = 'text', hint = '', extra = '') {
  const describedBy = [hint ? `${name}-hint` : '', `${name}-error`].filter(Boolean).join(' ');
  return `
    <div class="field">
      <label for="${name}">${escapeHTML(label)}</label>
      <input id="${name}" name="${name}" type="${type}" value="${escapeHTML(value ?? '')}" aria-describedby="${describedBy}" ${extra}>
      ${hint ? `<p class="hint" id="${name}-hint">${escapeHTML(hint)}</p>` : ''}
      <p class="field-error" id="${name}-error"></p>
    </div>`;
}

// A labelled drop-down. options is a list of [value, text] pairs.
function select(name, label, options, selected) {
  return `
    <div class="field">
      <label for="${name}">${escapeHTML(label)}</label>
      <select id="${name}" name="${name}" aria-describedby="${name}-error">
        ${options.map(([value, text]) => `<option value="${escapeHTML(value)}" ${value === selected ? 'selected' : ''}>${escapeHTML(text)}</option>`).join('')}
      </select>
      <p class="field-error" id="${name}-error"></p>
    </div>`;
}

// Put each error message under its box and move the cursor to the first one.
function showErrors(form, errors) {
  for (const el of form.querySelectorAll('.field-error')) el.textContent = '';
  for (const el of form.querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
  let first = null;
  for (const [name, message] of Object.entries(errors)) {
    const input = form.elements[name];
    if (!input) continue;
    input.setAttribute('aria-invalid', 'true');
    form.querySelector(`#${name}-error`).textContent = message;
    first ??= input;
  }
  first?.focus();
}
