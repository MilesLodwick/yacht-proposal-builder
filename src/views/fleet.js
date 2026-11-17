// Fleet records screen.
//
//   #/fleet          every yacht, filterable by firm, with out-of-date flags
//   #/fleet/<id>     one yacht's record, to keep it current
//
// Filter by a firm to work as that firm's charter management assistant.

import { getCollection, saveCollection, getSettings } from '../store.js';
import { detailsAge, firms, parseLinks, validateFleetRecord } from '../fleet.js';
import { CHECK, checkPill } from '../yachts.js';
import { CURRENCIES, formatMoney } from '../calc/currency.js';
import { formatDate, todayISO } from '../calc/dates.js';
import { escapeHTML } from './html.js';

// Filters are remembered while the app is open.
const filters = { firm: '', search: '', staleOnly: false };
let flash = null;

const staleDays = () => getSettings().find((s) => s.id === 'alerts.staleListingDays')?.value ?? 90;

export function render(container, param, heading) {
  if (!param) return renderList(container);
  const yacht = getCollection('yachts').find((y) => y.id === param);
  if (!yacht) {
    heading.textContent = 'Yacht not found';
    container.insertAdjacentHTML('beforeend', '<p><a href="#/fleet">Back to fleet records</a></p>');
    return;
  }
  heading.textContent = yacht.name;
  renderRecord(container, yacht);
}

// The "details checked" pill: red when out of date.
function agePill(yacht, today) {
  const age = detailsAge(yacht, today, staleDays());
  if (age.days === null) return '<span class="pill pill--red">Never checked</span>';
  if (age.stale) return `<span class="pill pill--red">${age.days} days old</span>`;
  return `<span class="pill pill--green">Checked ${formatDate(yacht.dateChecked)}</span>`;
}

function ratesText(y) {
  const cur = y.currency;
  if (!cur) return '<span class="muted">Rate on enquiry</span>';
  const parts = [];
  if (y.summerRate != null) parts.push(`Summer ${formatMoney(y.summerRate, cur)}`);
  if (y.winterRate != null) parts.push(`Winter ${formatMoney(y.winterRate, cur)}`);
  if (y.rateFromWeekly != null) parts.push(`Listed ${formatMoney(y.rateFromWeekly, cur)}`);
  return parts.length ? parts.join('<br>') : '<span class="muted">Rate on enquiry</span>';
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

function renderList(container) {
  const all = getCollection('yachts');
  const message = flash;
  flash = null;

  container.insertAdjacentHTML('beforeend', `
    <p>Keep each yacht's details current: specs, seasonal rates, bases, crew notes and listing links. Details not checked for over ${staleDays()} days are flagged in red (change this in Settings).</p>
    <p class="status-message" role="status">${escapeHTML(message ?? '')}</p>
    <form class="section filter-bar" id="fleet-filters" role="search" novalidate>
      <div class="form-grid form-grid--3">
        <div class="field">
          <label for="firm">Firm</label>
          <select id="firm" name="firm">
            <option value="">All firms</option>
            ${firms(all).map((f) => `<option ${f === filters.firm ? 'selected' : ''}>${escapeHTML(f)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="search">Search by yacht name</label>
          <input id="search" name="search" type="search" value="${escapeHTML(filters.search)}">
        </div>
        <div class="field field--tick field--tick-bottom">
          <input type="checkbox" id="staleOnly" name="staleOnly" ${filters.staleOnly ? 'checked' : ''}>
          <label for="staleOnly">Only show out-of-date details</label>
        </div>
      </div>
    </form>
    <p class="results-summary" id="fleet-summary" role="status"></p>
    <div id="fleet-table"></div>
  `);

  const form = container.querySelector('#fleet-filters');
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('input', () => {
    filters.firm = form.elements.firm.value;
    filters.search = form.elements.search.value;
    filters.staleOnly = form.elements.staleOnly.checked;
    drawTable(container, all);
  });
  drawTable(container, all);
}

function drawTable(container, all) {
  const today = todayISO();
  const limit = staleDays();
  const byFirm = all.filter((y) => !filters.firm || y.firm === filters.firm);
  const stale = byFirm.filter((y) => detailsAge(y, today, limit).stale);
  let shown = byFirm.filter((y) => !filters.search || y.name.toLowerCase().includes(filters.search.trim().toLowerCase()));
  if (filters.staleOnly) shown = shown.filter((y) => detailsAge(y, today, limit).stale);
  shown = [...shown].sort((a, b) => (a.dateChecked ?? '').localeCompare(b.dateChecked ?? '') || a.name.localeCompare(b.name));

  container.querySelector('#fleet-summary').textContent =
    `${byFirm.length} yachts${filters.firm ? ` listed by ${filters.firm}` : ''}. ${stale.length} with details over ${limit} days old.${shown.length !== byFirm.length ? ` Showing ${shown.length}.` : ''}`;

  container.querySelector('#fleet-table').innerHTML = shown.length ? `
    <div class="table-wrap">
      <table class="data-table">
        <caption class="visually-hidden">Fleet records</caption>
        <thead><tr>
          <th scope="col">Yacht</th><th scope="col">Size</th><th scope="col" class="num">Weekly rates</th>
          <th scope="col">Bases</th><th scope="col">Details</th>
        </tr></thead>
        <tbody>
          ${shown.map((y) => {
            const check = checkPill(y);
            return `<tr>
              <th scope="row" data-label="Yacht"><a href="#/fleet/${escapeHTML(y.id)}">${escapeHTML(y.name)}</a>
                <span class="cell-sub">${escapeHTML(y.firm)}</span></th>
              <td data-label="Size"><span>${y.lengthM ? `${y.lengthM} m` : 'Length not stated'}<span class="cell-sub">${y.guests ? `${y.guests} guests` : 'Guests not stated'}</span></span></td>
              <td data-label="Weekly rates" class="num"><span>${ratesText(y)}</span></td>
              <td data-label="Bases"><span>${y.summerBase || y.winterBase
                ? `${y.summerBase ? `Summer: ${escapeHTML(y.summerBase)}` : ''}${y.summerBase && y.winterBase ? '<br>' : ''}${y.winterBase ? `Winter: ${escapeHTML(y.winterBase)}` : ''}`
                : '<span class="muted">Not recorded</span>'}</span></td>
              <td data-label="Details"><span class="pill-stack">${agePill(y, todayISO())}<span class="pill pill--${check.tone}">${check.text}</span></span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>` : '<p class="placeholder">No yachts match.</p>';
}

// ---------------------------------------------------------------------------
// One record
// ---------------------------------------------------------------------------

function renderRecord(container, yacht) {
  const today = todayISO();
  const v = (key) => yacht[key] ?? '';

  container.insertAdjacentHTML('beforeend', `
    <p><a href="#/fleet">Back to fleet records</a></p>
    <p class="pill-row">${agePill(yacht, today)}<span class="pill pill--${checkPill(yacht).tone}">${checkPill(yacht).text}</span>
      <span class="muted">${escapeHTML(yacht.firm)}</span></p>

    <form id="fleet-form" novalidate>
      <fieldset class="section">
        <legend>Specifications</legend>
        <div class="form-grid form-grid--3">
          ${field('lengthM', 'Length (m)', v('lengthM'), 'inputmode="decimal"')}
          ${field('guests', 'Guests', v('guests'), 'inputmode="numeric"')}
          ${field('cabins', 'Cabins', v('cabins'), 'inputmode="numeric"')}
          ${field('builder', 'Builder', v('builder'))}
          ${field('year', 'Year built', v('year'), 'inputmode="numeric"')}
        </div>
      </fieldset>

      <fieldset class="section">
        <legend>Weekly rates (indicative)</legend>
        <p class="hint">Quotes use the summer or winter rate for the charter's season (May to October is summer) and fall back to the listed rate.</p>
        <div class="form-grid form-grid--3">
          ${select('currency', 'Currency', [['', 'Not stated'], ...CURRENCIES.map((c) => [c, c])], v('currency'))}
          ${field('summerRate', 'Summer rate', v('summerRate'), 'inputmode="numeric"')}
          ${field('winterRate', 'Winter rate', v('winterRate'), 'inputmode="numeric"')}
          ${field('rateFromWeekly', 'Listed rate (season not stated)', v('rateFromWeekly'), 'inputmode="numeric"')}
        </div>
      </fieldset>

      <fieldset class="section">
        <legend>Where the yacht is based</legend>
        <div class="form-grid form-grid--3">
          ${field('summerBase', 'Summer base', v('summerBase'))}
          ${field('winterBase', 'Winter base', v('winterBase'))}
          ${field('cruisingArea', 'Cruising area (as listed)', v('cruisingArea'))}
        </div>
      </fieldset>

      <fieldset class="section">
        <legend>Crew and listings</legend>
        ${area('crewNotes', 'Crew profile notes', v('crewNotes'), 'For example: captain\'s experience, chef\'s style, languages, water sports instructors.')}
        ${area('otherLinks', 'Other listing links (one per line)', v('otherLinks'), 'For example the yacht\'s page on Yachtfolio or another broker\'s site.')}
        ${parseLinks(yacht.otherLinks).length ? `<ul class="link-list">${parseLinks(yacht.otherLinks).map((l) => `<li><a href="${escapeHTML(l)}" target="_blank" rel="noopener">${escapeHTML(l)}</a></li>`).join('')}</ul>` : ''}
      </fieldset>

      <fieldset class="section">
        <legend>Source and checks</legend>
        <div class="form-grid">
          ${field('source', 'Source name', v('source'))}
          ${field('sourceUrl', 'Source link', v('sourceUrl'), 'type="url"')}
          ${field('dateChecked', 'Details last checked', v('dateChecked'), `type="date" max="${today}"`)}
          ${select('check', 'Your check', Object.values(CHECK).map((c) => [c, c]), yacht.check)}
        </div>
        <div class="button-row"><button type="button" class="button button--secondary button--small" id="checked-today">Mark as checked today</button></div>
        ${yacht.sourceUrl ? `<p class="source-line">Open the source: <a href="${escapeHTML(yacht.sourceUrl)}" target="_blank" rel="noopener">${escapeHTML(yacht.source ?? yacht.sourceUrl)}</a></p>` : ''}
        ${area('notes', 'Notes', v('notes'))}
      </fieldset>

      <p class="status-message" role="status" id="fleet-status"></p>
      <div class="button-row">
        <button type="submit" class="button">Save record</button>
        <a class="button button--secondary" href="#/fleet">Cancel</a>
      </div>
    </form>
  `);

  const form = container.querySelector('#fleet-form');

  form.querySelector('#checked-today').addEventListener('click', () => {
    form.elements.dateChecked.value = today;
    container.querySelector('#fleet-status').textContent = 'Date set to today. Save to keep it.';
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const result = validateFleetRecord(Object.fromEntries(new FormData(form)), today);
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
    const list = getCollection('yachts');
    saveCollection('yachts', list.map((y) => (y.id === yacht.id ? { ...y, ...result.fields } : y)));
    flash = `Saved: ${yacht.name}.`;
    location.hash = '#/fleet';
  });
}

function field(name, label, value, extra = '') {
  return `
    <div class="field">
      <label for="${name}">${escapeHTML(label)}</label>
      <input id="${name}" name="${name}" value="${escapeHTML(value)}" aria-describedby="${name}-error" ${extra}>
      <p class="field-error" id="${name}-error"></p>
    </div>`;
}

function area(name, label, value, hint = '') {
  return `
    <div class="field">
      <label for="${name}">${escapeHTML(label)}</label>
      <textarea id="${name}" name="${name}" rows="3" aria-describedby="${hint ? `${name}-hint ` : ''}${name}-error">${escapeHTML(value)}</textarea>
      ${hint ? `<p class="hint" id="${name}-hint">${escapeHTML(hint)}</p>` : ''}
      <p class="field-error" id="${name}-error"></p>
    </div>`;
}

function select(name, label, options, selected) {
  return `
    <div class="field">
      <label for="${name}">${escapeHTML(label)}</label>
      <select id="${name}" name="${name}" aria-describedby="${name}-error">
        ${options.map(([value, text]) => `<option value="${escapeHTML(value)}" ${String(value) === String(selected ?? '') ? 'selected' : ''}>${escapeHTML(text)}</option>`).join('')}
      </select>
      <p class="field-error" id="${name}-error"></p>
    </div>`;
}
