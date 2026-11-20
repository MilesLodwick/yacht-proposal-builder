// Listings screen (brokerage sales).
//
//   #/listings          boats for sale, filterable, with status and price changes
//   #/listings/<id>     one listing: status, listing date and price history
//
// Filter by a firm to work as that firm's sales assistant.

import { getCollection, saveCollection, getSettings } from '../store.js';
import {
  LISTING_STATUSES, statusTone, withListingDefaults, daysOnMarket, priceSummary,
  addPriceChange, removePriceChange, validatePriceChange, validateStatus,
} from '../listings.js';
import { pricePerMetre, runningCostEstimate, salesSettings, ASKING_NOT_SOLD } from '../calc/sales.js';
import { firms } from '../fleet.js';
import { checkPill } from '../yachts.js';
import { formatMoney } from '../calc/currency.js';
import { formatDate, todayISO } from '../calc/dates.js';
import { boatPhoto } from './boat-photos.js';
import { escapeHTML } from './html.js';

const COLLECTION = 'forSale';
const filters = { firm: '', status: '', search: '' };

export function render(container, param, heading) {
  if (!param) return renderList(container);
  const boat = getCollection(COLLECTION).find((b) => b.id === param);
  if (!boat) {
    heading.textContent = 'Listing not found';
    container.insertAdjacentHTML('beforeend', '<p><a href="#/listings">Back to listings</a></p>');
    return;
  }
  heading.textContent = boat.name;
  renderListing(container, boat);
}

const priceText = (l) => (l.askingPrice != null && l.currency ? formatMoney(l.askingPrice, l.currency)
  : l.currencyAsListed === 'POA' ? 'Price on application' : l.askingPrice != null ? `${l.askingPrice.toLocaleString('en-GB')} (currency not shown)` : 'Not stated');

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

function renderList(container) {
  const all = getCollection(COLLECTION).map(withListingDefaults);

  container.insertAdjacentHTML('beforeend', `
    <p>Boats for sale from the research sheet: status, asking price, price changes and days on market. ${ASKING_NOT_SOLD}</p>
    <form class="section filter-bar" id="listing-filters" role="search" novalidate>
      <div class="form-grid form-grid--3">
        <div class="field">
          <label for="firm">Firm</label>
          <select id="firm" name="firm"><option value="">All firms</option>
            ${firms(all).map((f) => `<option ${f === filters.firm ? 'selected' : ''}>${escapeHTML(f)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="status">Status</label>
          <select id="status" name="status"><option value="">All statuses</option>
            ${LISTING_STATUSES.map((s) => `<option ${s === filters.status ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="search">Search by boat</label>
          <input id="search" name="search" type="search" value="${escapeHTML(filters.search)}">
        </div>
      </div>
    </form>
    <p class="results-summary" id="listing-summary" role="status"></p>
    <div id="listing-table"></div>
  `);

  const form = container.querySelector('#listing-filters');
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('input', () => {
    filters.firm = form.elements.firm.value;
    filters.status = form.elements.status.value;
    filters.search = form.elements.search.value;
    draw();
  });

  const draw = () => {
    const today = todayISO();
    const byFirm = all.filter((l) => !filters.firm || l.firm === filters.firm);
    const shown = byFirm
      .filter((l) => !filters.status || l.status === filters.status)
      .filter((l) => !filters.search || l.name.toLowerCase().includes(filters.search.trim().toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));
    const counts = LISTING_STATUSES.map((s) => `${byFirm.filter((l) => l.status === s).length} ${s.toLowerCase()}`).join(', ');
    container.querySelector('#listing-summary').textContent = `${byFirm.length} boats${filters.firm ? ` listed by ${filters.firm}` : ''}: ${counts}.${shown.length !== byFirm.length ? ` Showing ${shown.length}.` : ''}`;

    container.querySelector('#listing-table').innerHTML = shown.length ? `
      <div class="table-wrap">
        <table class="data-table data-table--wide">
          <caption class="visually-hidden">Boats for sale</caption>
          <thead><tr>
            <th scope="col">Boat</th><th scope="col">Size and year</th><th scope="col" class="num">Asking price</th>
            <th scope="col" class="num">Per metre</th><th scope="col">Status and days on market</th>
          </tr></thead>
          <tbody>
            ${shown.map((l) => {
              const summary = priceSummary(l.priceHistory);
              const ppm = l.currency ? pricePerMetre(l.askingPrice, l.lengthM) : null;
              const dom = daysOnMarket(l, today);
              return `<tr>
                <th scope="row" data-label="Boat">${boatPhoto(l.id)}<a href="#/listings/${escapeHTML(l.id)}">${escapeHTML(l.name)}</a>
                  <span class="cell-sub">${escapeHTML(l.firm)}${l.location ? ` · ${escapeHTML(l.location)}` : ''}</span></th>
                <td data-label="Size and year"><span>${l.lengthM ? `${l.lengthM} m` : 'Length not stated'}<span class="cell-sub">${[l.type, l.year].filter(Boolean).join(', ') || 'Type and year not stated'}</span></span></td>
                <td data-label="Asking price" class="num"><span>${escapeHTML(priceText(l))}${summary && summary.change < 0 ? `<span class="cell-sub"><span class="pill pill--amber">Reduced ${Math.abs(summary.changePercent)}%</span></span>` : ''}</span></td>
                <td data-label="Per metre" class="num">${ppm != null ? formatMoney(ppm, l.currency) : '-'}</td>
                <td data-label="Status"><span><span class="pill pill--${statusTone(l.status)}">${l.status}</span>
                  <span class="cell-sub">${dom == null ? 'Days on market not recorded' : `${dom} days on market`}</span></span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : '<p class="placeholder">No boats match.</p>';
  };
  draw();
}

// ---------------------------------------------------------------------------
// One listing
// ---------------------------------------------------------------------------

function renderListing(container, saved) {
  const today = todayISO();
  const s = salesSettings(getSettings());
  let listing = withListingDefaults(saved);

  const save = () => {
    saveCollection(COLLECTION, getCollection(COLLECTION).map((b) => (b.id === listing.id ? listing : b)));
  };

  container.insertAdjacentHTML('beforeend', `
    <p><a href="#/listings">Back to listings</a> · <a href="#/seller-view/${escapeHTML(saved.id)}">Compare with similar boats</a></p>
    ${boatPhoto(saved.id, 'large')}
    <div id="listing-facts"></div>

    <form class="section" id="status-form" novalidate>
      <h2>Status</h2>
      <div class="form-grid form-grid--3">
        <div class="field">
          <label for="status">Status</label>
          <select id="status" name="status" aria-describedby="status-error">
            ${LISTING_STATUSES.map((st) => `<option ${st === listing.status ? 'selected' : ''}>${st}</option>`).join('')}
          </select>
          <p class="field-error" id="status-error"></p>
        </div>
        <div class="field">
          <label for="listedOn">Listed on</label>
          <input id="listedOn" name="listedOn" type="date" max="${today}" value="${listing.listedOn ?? ''}" aria-describedby="listedOn-hint listedOn-error">
          <p class="hint" id="listedOn-hint">Not in the research sheet. Enter it to count days on market.</p>
          <p class="field-error" id="listedOn-error"></p>
        </div>
        <div class="field">
          <label for="statusDate">Date of the status</label>
          <input id="statusDate" name="statusDate" type="date" max="${today}" value="${listing.statusDate ?? ''}" aria-describedby="statusDate-hint statusDate-error">
          <p class="hint" id="statusDate-hint">For example the day it went under offer or sold.</p>
          <p class="field-error" id="statusDate-error"></p>
        </div>
      </div>
      <div class="button-row"><button type="submit" class="button button--small">Save status</button></div>
    </form>

    <section class="section" aria-labelledby="history-heading">
      <h2 id="history-heading">Price history</h2>
      <p class="hint">${ASKING_NOT_SOLD} The first entry is the price when the listing was checked. Add each change as it happens.</p>
      <div id="history"></div>
      <form id="price-form" novalidate>
        <h3>Add a price change</h3>
        <div class="form-grid form-grid--3">
          <div class="field">
            <label for="date">Date</label>
            <input id="date" name="date" type="date" max="${today}" value="${today}" aria-describedby="date-error">
            <p class="field-error" id="date-error"></p>
          </div>
          <div class="field">
            <label for="price">New asking price (${escapeHTML(listing.currency ?? 'currency not set')})</label>
            <input id="price" name="price" inputmode="numeric" aria-describedby="price-error">
            <p class="field-error" id="price-error"></p>
          </div>
          <div class="field">
            <label for="note">Note (optional)</label>
            <input id="note" name="note" placeholder="For example: owner reduced after the show">
          </div>
        </div>
        <div class="button-row"><button type="submit" class="button button--small">Add price change</button></div>
      </form>
    </section>
    <p class="status-message" role="status" id="listing-status"></p>
  `);

  const draw = () => {
    const summary = priceSummary(listing.priceHistory);
    const ppm = listing.currency ? pricePerMetre(listing.askingPrice, listing.lengthM) : null;
    const dom = daysOnMarket(listing, today);
    const check = checkPill(listing);
    const running = listing.currency ? runningCostEstimate(listing.askingPrice, s.runningCostPercent) : null;

    container.querySelector('#listing-facts').innerHTML = `
      <p class="pill-row"><span class="pill pill--${statusTone(listing.status)}">${listing.status}</span><span class="pill pill--${check.tone}">${check.text}</span></p>
      <div class="report-figures">
        <div><span class="figure-label">Asking price</span><span class="figure num">${escapeHTML(priceText(listing))}</span></div>
        <div><span class="figure-label">Per metre</span><span class="figure num">${ppm != null ? formatMoney(ppm, listing.currency) : '-'}</span></div>
        <div><span class="figure-label">Days on market</span><span class="figure num">${dom ?? 'Not recorded'}</span></div>
        <div><span class="figure-label">Running costs, about (${s.runningCostPercent}% a year)</span><span class="figure num">${running != null ? formatMoney(running, listing.currency) : '-'}</span></div>
      </div>
      <dl class="spec-list listing-specs">
        <div><dt>Firm</dt><dd>${escapeHTML(listing.firm)}</dd></div>
        <div><dt>Type</dt><dd>${escapeHTML(listing.type ?? 'Not stated')}</dd></div>
        <div><dt>Length</dt><dd>${listing.lengthM ? `${listing.lengthM} m${listing.lengthFt ? ` (${listing.lengthFt} ft)` : ''}` : 'Not stated'}</dd></div>
        <div><dt>Year</dt><dd>${listing.year ?? 'Not stated'}</dd></div>
        <div><dt>Location</dt><dd>${escapeHTML(listing.location ?? 'Not stated')}</dd></div>
        <div><dt>VAT status</dt><dd>${escapeHTML(listing.vatStatus ?? 'Not stated')}</dd></div>
        ${listing.currencyAsListed ? `<div><dt>Currency as listed</dt><dd>${escapeHTML(listing.currencyAsListed)}</dd></div>` : ''}
      </dl>
      ${listing.notes ? `<p class="hint">Notes: ${escapeHTML(listing.notes)}</p>` : ''}
      <p class="source-line">Source: ${listing.sourceUrl ? `<a href="${escapeHTML(listing.sourceUrl)}" target="_blank" rel="noopener">${escapeHTML(listing.source)}</a>` : escapeHTML(listing.source ?? 'not stated')}, checked ${formatDate(listing.dateChecked)}.</p>`;

    container.querySelector('#history').innerHTML = listing.priceHistory.length ? `
      <table class="handover-table price-history">
        <caption class="visually-hidden">Asking price history</caption>
        <thead><tr><th scope="col">Date</th><th scope="col" class="num">Asking price</th><th scope="col" class="num">Change</th><th scope="col">Note</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr></thead>
        <tbody>
          ${listing.priceHistory.map((h, i) => {
            const prev = listing.priceHistory[i - 1];
            const change = prev ? h.price - prev.price : null;
            return `<tr>
              <th scope="row">${formatDate(h.date)}</th>
              <td class="num">${formatMoney(h.price, listing.currency)}</td>
              <td class="num">${change == null ? '-' : `${change < 0 ? '-' : '+'}${formatMoney(Math.abs(change), listing.currency)} (${Math.round((change / prev.price) * 1000) / 10}%)`}</td>
              <td>${escapeHTML(h.note || '')}</td>
              <td>${!h.fromSheet ? `<button type="button" class="button button--secondary button--small" data-remove="${i}">Remove<span class="visually-hidden"> change on ${formatDate(h.date)}</span></button>` : ''}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      ${summary && summary.lastChanged ? `<p><strong>${summary.change < 0 ? `Reduced ${Math.abs(summary.changePercent)}%` : `Up ${summary.changePercent}%`}</strong> since the first recorded price (${formatMoney(summary.first, listing.currency)} to ${formatMoney(summary.current, listing.currency)}), ${summary.reductions} reduction${summary.reductions === 1 ? '' : 's'}.</p>` : ''}`
      : '<p class="muted">No asking price recorded.</p>';
  };

  const showErrors = (form, errors) => {
    for (const el of form.querySelectorAll('.field-error')) el.textContent = '';
    for (const el of form.querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
    let first = null;
    for (const [name, message] of Object.entries(errors)) {
      form.elements[name].setAttribute('aria-invalid', 'true');
      form.querySelector(`#${name}-error`).textContent = message;
      first ??= form.elements[name];
    }
    first?.focus();
  };

  const statusForm = container.querySelector('#status-form');
  statusForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = Object.fromEntries(new FormData(statusForm));
    const result = validateStatus(input, today);
    showErrors(statusForm, result.ok ? {} : result.errors);
    if (!result.ok) return;
    listing = { ...listing, status: input.status, listedOn: input.listedOn || null, statusDate: input.statusDate || null };
    save();
    draw();
    container.querySelector('#listing-status').textContent = 'Status saved.';
  });

  const priceForm = container.querySelector('#price-form');
  priceForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const result = validatePriceChange(Object.fromEntries(new FormData(priceForm)), listing, today);
    showErrors(priceForm, result.ok ? {} : result.errors);
    if (!result.ok) return;
    listing = addPriceChange(listing, result.change);
    save();
    draw();
    priceForm.elements.price.value = '';
    priceForm.elements.note.value = '';
    container.querySelector('#listing-status').textContent = `Price change added: ${formatMoney(result.change.price, listing.currency)}.`;
  });

  container.querySelector('#history').addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove]');
    if (!button) return;
    if (!window.confirm('Remove this price change?')) return;
    listing = removePriceChange(listing, Number(button.dataset.remove));
    save();
    draw();
    container.querySelector('#listing-status').textContent = 'Price change removed.';
  });

  draw();
}
