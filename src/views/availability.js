// Availability screen.
//
//   #/availability            yachts with calendar entries, and their problems
//   #/availability/<yachtId>  one yacht's month calendar and entries
//
// Owner use takes priority over bookings, bookings over options.

import { getCollection, saveCollection, getSettings } from '../store.js';
import {
  ENTRY_TYPES, typeLabel, optionStatus, findClashes, expiredOptions, dayStatus, monthGrid, validateEntry,
} from '../calc/availability.js';
import { formatDate, formatDateRange, todayISO } from '../calc/dates.js';
import { formatMoney } from '../calc/currency.js';
import { escapeHTML } from './html.js';

const COLLECTION = 'availability';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// The month shown for each yacht, remembered while the app is open.
const shownMonth = new Map();

const soonDays = () => getSettings().find((s) => s.id === 'alerts.optionExpirySoonDays')?.value ?? 3;

export function render(container, param, heading) {
  if (!param) return renderOverview(container);
  const yacht = getCollection('yachts').find((y) => y.id === param);
  if (!yacht) {
    heading.textContent = 'Yacht not found';
    container.insertAdjacentHTML('beforeend', '<p><a href="#/availability">Back to availability</a></p>');
    return;
  }
  heading.textContent = `Availability: ${yacht.name}`;
  renderYacht(container, yacht);
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function renderOverview(container) {
  const today = todayISO();
  const entries = getCollection(COLLECTION);
  const yachts = getCollection('yachts');
  const withEntries = yachts.filter((y) => entries.some((e) => e.yachtId === y.id));

  const rows = withEntries.map((y) => {
    const mine = entries.filter((e) => e.yachtId === y.id);
    const clashes = findClashes(mine, today);
    const expired = expiredOptions(mine, today);
    const soon = mine.filter((e) => optionStatus(e, today, soonDays())?.tone === 'amber');
    const pills = [
      clashes.length ? `<span class="pill pill--red">${clashes.length} clash${clashes.length > 1 ? 'es' : ''}</span>` : '',
      expired.length ? `<span class="pill pill--red">${expired.length} expired option${expired.length > 1 ? 's' : ''}</span>` : '',
      soon.length ? `<span class="pill pill--amber">${soon.length} option${soon.length > 1 ? 's' : ''} expiring soon</span>` : '',
    ].filter(Boolean);
    return { y, mine, pills, problems: clashes.length + expired.length };
  }).sort((a, b) => b.problems - a.problems || a.y.name.localeCompare(b.y.name));

  container.insertAdjacentHTML('beforeend', `
    <p>Each yacht's calendar of owner use, bookings and options. Owner use takes priority. Clashes and expired options are flagged.</p>
    <form class="section" id="open-yacht" novalidate>
      <div class="field">
        <label for="yacht-pick">Open any yacht's calendar</label>
        <select id="yacht-pick">
          <option value="">Choose a yacht</option>
          ${[...yachts].sort((a, b) => a.name.localeCompare(b.name)).map((y) => `<option value="${escapeHTML(y.id)}">${escapeHTML(y.name)} (${escapeHTML(y.firm)})</option>`).join('')}
        </select>
      </div>
    </form>
    ${rows.length ? `
      <div class="table-wrap">
        <table class="data-table">
          <caption class="visually-hidden">Yachts with calendar entries</caption>
          <thead><tr><th scope="col">Yacht</th><th scope="col" class="num">Booked</th><th scope="col" class="num">Options</th><th scope="col" class="num">Owner use</th><th scope="col">To act on</th></tr></thead>
          <tbody>
            ${rows.map(({ y, mine, pills }) => `<tr>
              <th scope="row" data-label="Yacht"><a href="#/availability/${escapeHTML(y.id)}">${escapeHTML(y.name)}</a><span class="cell-sub">${escapeHTML(y.firm)}</span></th>
              <td data-label="Booked" class="num">${mine.filter((e) => e.type === 'booking').length}</td>
              <td data-label="Options" class="num">${mine.filter((e) => e.type.startsWith('option')).length}</td>
              <td data-label="Owner use" class="num">${mine.filter((e) => e.type === 'owner').length}</td>
              <td data-label="To act on"><span class="pill-row pill-row--tight">${pills.join('') || '<span class="pill pill--green">Nothing</span>'}</span></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` : '<p class="placeholder">No calendar entries yet. Open a yacht above to add one.</p>'}
  `);

  container.querySelector('#yacht-pick').addEventListener('change', (event) => {
    if (event.target.value) location.hash = `#/availability/${event.target.value}`;
  });
}

// ---------------------------------------------------------------------------
// One yacht
// ---------------------------------------------------------------------------

function renderYacht(container, yacht) {
  const today = todayISO();
  let editingId = null;

  const mine = () => getCollection(COLLECTION).filter((e) => e.yachtId === yacht.id)
    .sort((a, b) => a.start.localeCompare(b.start));

  // Start on this month, or the month of the next entry if there is none this month.
  if (!shownMonth.has(yacht.id)) {
    const next = mine().find((e) => e.end >= today);
    const from = next && next.start > today ? next.start : today;
    shownMonth.set(yacht.id, { year: Number(from.slice(0, 4)), month: Number(from.slice(5, 7)) });
  }

  container.insertAdjacentHTML('beforeend', `
    <p><a href="#/availability">Back to availability</a> · <a href="#/fleet/${escapeHTML(yacht.id)}">Fleet record</a></p>
    <div id="problems"></div>

    <section class="section" aria-labelledby="month-heading">
      <div class="calendar-nav">
        <button type="button" class="button button--secondary button--small" id="prev-month">Previous<span class="visually-hidden"> month</span></button>
        <h2 id="month-heading" aria-live="polite"></h2>
        <button type="button" class="button button--secondary button--small" id="next-month">Next<span class="visually-hidden"> month</span></button>
      </div>
      <ul class="calendar-legend" aria-label="Key">
        ${ENTRY_TYPES.map((t) => `<li><span class="cal-swatch cal--${t.id}"></span>${escapeHTML(t.label)}</li>`).join('')}
        <li><span class="cal-swatch cal--clash"></span>Clash</li>
      </ul>
      <div id="calendar"></div>
    </section>

    <section class="section" aria-labelledby="entries-heading">
      <h2 id="entries-heading">Entries</h2>
      <div id="entries"></div>
    </section>

    <form class="section" id="entry-form" novalidate>
      <h2 id="form-heading">Add an entry</h2>
      <div class="form-grid">
        <div class="field">
          <label for="type">What is it?</label>
          <select id="type" name="type" aria-describedby="type-error">
            ${ENTRY_TYPES.map((t) => `<option value="${t.id}">${escapeHTML(t.label)}</option>`).join('')}
          </select>
          <p class="field-error" id="type-error"></p>
        </div>
        ${field('label', 'Client, owner or note')}
        ${field('start', 'Start (embarkation)', 'date')}
        ${field('end', 'End (disembarkation)', 'date')}
        <div id="expiry-field">${field('expiresOn', 'Option expires on', 'date')}</div>
        <div id="booking-fields" class="form-grid form-grid--span">
          ${field('charterFee', `Charter fee in the contract (${yacht.currency ?? 'yacht\'s currency'}, optional)`)}
          ${field('retailBroker', 'Retail broker (leave empty if booked direct)')}
        </div>
      </div>
      <p class="status-message" role="status" id="entry-status"></p>
      <div class="button-row">
        <button type="submit" class="button" id="save-entry">Add entry</button>
        <button type="button" class="button button--secondary" id="cancel-edit" hidden>Cancel editing</button>
      </div>
    </form>
  `);

  const form = container.querySelector('#entry-form');
  // Options need an expiry date; bookings can record the fee and broker
  // (used by the owner report).
  const showExpiry = () => {
    container.querySelector('#expiry-field').hidden = !form.elements.type.value.startsWith('option');
    container.querySelector('#booking-fields').hidden = form.elements.type.value !== 'booking';
  };
  form.elements.type.addEventListener('change', showExpiry);
  showExpiry();

  const draw = () => {
    const entries = mine();
    const clashes = findClashes(entries, today);
    const expired = expiredOptions(entries, today);

    // Problems to act on.
    const problems = [
      ...clashes.map((c) => c.message),
      ...expired.map((e) => `The ${typeLabel(e.type).toLowerCase()} for ${e.label || 'a client'} expired on ${formatDate(e.expiresOn)}. Release it or agree a new expiry date.`),
    ];
    container.querySelector('#problems').innerHTML = problems.length
      ? `<div class="notice notice--warn"><p><strong>To act on:</strong></p><ul>${problems.map((p) => `<li>${escapeHTML(p)}</li>`).join('')}</ul></div>`
      : '<p class="notice">No clashes or expired options.</p>';

    // The month grid.
    const { year, month } = shownMonth.get(yacht.id);
    container.querySelector('#month-heading').textContent = `${MONTHS[month - 1]} ${year}`;
    container.querySelector('#calendar').innerHTML = `
      <table class="calendar">
        <caption class="visually-hidden">${MONTHS[month - 1]} ${year} for ${escapeHTML(yacht.name)}</caption>
        <thead><tr>${DAYS.map((d) => `<th scope="col">${d}</th>`).join('')}</tr></thead>
        <tbody>
          ${monthGrid(year, month).map((week) => `<tr>${week.map((date) => {
            if (!date) return '<td class="cal-empty"></td>';
            const s = dayStatus(entries, date, clashes, today);
            const what = s.top ? `${typeLabel(s.top.type)}${s.top.label ? `, ${s.top.label}` : ''}${s.count > 1 ? ` and ${s.count - 1} more` : ''}` : 'Free';
            return `<td class="${s.top ? `cal--${s.top.type}` : ''}${s.clash ? ' cal--clash' : ''}${date === today ? ' cal-today' : ''}">
              <span class="cal-day" aria-hidden="true">${Number(date.slice(8))}</span>
              ${s.top ? `<span class="cal-label" aria-hidden="true">${escapeHTML(s.top.label || typeLabel(s.top.type))}</span>` : ''}
              ${s.clash ? '<span class="cal-flag" aria-hidden="true">!</span>' : ''}
              <span class="visually-hidden">${formatDate(date)}: ${escapeHTML(what)}${s.clash ? '. Clash' : ''}</span>
            </td>`;
          }).join('')}</tr>`).join('')}
        </tbody>
      </table>`;

    // The list of entries.
    container.querySelector('#entries').innerHTML = entries.length ? `
      <div class="table-wrap">
        <table class="data-table">
          <caption class="visually-hidden">Calendar entries for ${escapeHTML(yacht.name)}</caption>
          <thead><tr><th scope="col">Dates</th><th scope="col">What</th><th scope="col">Who</th><th scope="col">Option</th><th scope="col">Actions</th></tr></thead>
          <tbody>
            ${entries.map((e) => {
              const status = optionStatus(e, today, soonDays());
              const inClash = clashes.some((c) => c.ids.includes(e.id));
              return `<tr>
                <th scope="row" data-label="Dates">${formatDateRange(e.start, e.end)}</th>
                <td data-label="What"><span class="pill cal-pill cal--${e.type}">${escapeHTML(typeLabel(e.type))}</span>${inClash ? ' <span class="pill pill--red">Clash</span>' : ''}</td>
                <td data-label="Who"><span>${escapeHTML(e.label || '-')}${e.type === 'booking'
                  ? `<span class="cell-sub">${e.charterFee != null ? `Fee ${formatMoney(e.charterFee, yacht.currency)}` : 'Fee not recorded'} · ${e.retailBroker ? `via ${escapeHTML(e.retailBroker)}` : 'direct'}</span>`
                  : ''}</span></td>
                <td data-label="Option">${status ? `<span class="pill pill--${status.tone}">${escapeHTML(status.text)}</span>` : '-'}</td>
                <td data-label="Actions"><span class="button-row">
                  ${e.type === 'option2' ? `<button type="button" class="button button--secondary button--small" data-promote="${escapeHTML(e.id)}">Make first option</button>` : ''}
                  <button type="button" class="button button--secondary button--small" data-edit="${escapeHTML(e.id)}">Edit<span class="visually-hidden"> ${escapeHTML(e.label)}</span></button>
                  <button type="button" class="button button--danger button--small" data-delete="${escapeHTML(e.id)}">${e.type.startsWith('option') ? 'Release' : 'Delete'}<span class="visually-hidden"> ${escapeHTML(e.label)}</span></button>
                </span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : '<p class="placeholder">No entries yet. Add one below.</p>';
  };

  const saveAll = (list) => saveCollection(COLLECTION, list);

  // Month buttons.
  const moveMonth = (step) => {
    const m = shownMonth.get(yacht.id);
    const index = m.year * 12 + (m.month - 1) + step;
    shownMonth.set(yacht.id, { year: Math.floor(index / 12), month: (index % 12) + 1 });
    draw();
  };
  container.querySelector('#prev-month').addEventListener('click', () => moveMonth(-1));
  container.querySelector('#next-month').addEventListener('click', () => moveMonth(1));

  // Edit, promote and delete buttons in the entries table.
  container.querySelector('#entries').addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const all = getCollection(COLLECTION);
    const id = button.dataset.edit || button.dataset.promote || button.dataset.delete;
    const e = all.find((x) => x.id === id);
    if (!e) return;

    if (button.dataset.promote) {
      saveAll(all.map((x) => (x.id === id ? { ...x, type: 'option1' } : x)));
      container.querySelector('#entry-status').textContent = `${e.label || 'The option'} is now the first option.`;
    } else if (button.dataset.delete) {
      const what = e.type.startsWith('option') ? 'Release the option for' : 'Delete the entry for';
      if (!window.confirm(`${what} ${e.label || 'this period'}?`)) return;
      saveAll(all.filter((x) => x.id !== id));
      container.querySelector('#entry-status').textContent = 'Removed.';
    } else {
      editingId = id;
      for (const name of ['type', 'label', 'start', 'end', 'expiresOn', 'charterFee', 'retailBroker']) form.elements[name].value = e[name] ?? '';
      showExpiry();
      container.querySelector('#form-heading').textContent = 'Edit entry';
      container.querySelector('#save-entry').textContent = 'Save changes';
      container.querySelector('#cancel-edit').hidden = false;
      form.elements.type.focus();
      return;
    }
    draw();
  });

  const resetForm = () => {
    editingId = null;
    form.reset();
    showExpiry();
    container.querySelector('#form-heading').textContent = 'Add an entry';
    container.querySelector('#save-entry').textContent = 'Add entry';
    container.querySelector('#cancel-edit').hidden = true;
  };
  container.querySelector('#cancel-edit').addEventListener('click', resetForm);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = Object.fromEntries(new FormData(form));
    if (!input.type.startsWith('option')) input.expiresOn = '';
    const result = validateEntry(input);
    for (const el of form.querySelectorAll('.field-error')) el.textContent = '';
    for (const el of form.querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
    if (!result.ok) {
      let first = null;
      for (const [name, message] of Object.entries(result.errors)) {
        form.elements[name].setAttribute('aria-invalid', 'true');
        form.querySelector(`#${name}-error`).textContent = message;
        first ??= form.elements[name];
      }
      first.focus();
      return;
    }
    const isBooking = input.type === 'booking';
    const fee = String(input.charterFee ?? '').replace(/[,\s]/g, '');
    const record = {
      yachtId: yacht.id, type: input.type, start: input.start, end: input.end,
      label: input.label.trim(), expiresOn: input.expiresOn || null,
      charterFee: isBooking && fee !== '' ? Number(fee) : null,
      retailBroker: isBooking ? (input.retailBroker.trim() || null) : null,
    };
    const all = getCollection(COLLECTION);
    if (editingId) {
      saveAll(all.map((x) => (x.id === editingId ? { id: x.id, ...(x.example ? { example: true } : {}), ...record } : x)));
    } else {
      saveAll([...all, { id: `avail-${Date.now().toString(36)}`, ...record }]);
    }
    container.querySelector('#entry-status').textContent = editingId ? 'Saved.' : 'Added.';
    // Jump the calendar to the entry's month.
    shownMonth.set(yacht.id, { year: Number(record.start.slice(0, 4)), month: Number(record.start.slice(5, 7)) });
    resetForm();
    draw();
  });

  draw();
}

function field(name, label, type = 'text') {
  return `
    <div class="field">
      <label for="${name}">${escapeHTML(label)}</label>
      <input id="${name}" name="${name}" type="${type}" aria-describedby="${name}-error">
      <p class="field-error" id="${name}-error"></p>
    </div>`;
}
