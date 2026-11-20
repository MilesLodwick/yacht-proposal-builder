// Yacht selection screen.
// Describe the charter (or start from an enquiry), filter the fleet, and
// see each yacht's full cost against the budget.

import { getCollection, getSettings } from '../store.js';
import { charterDays } from '../enquiries.js';
import { checkPill } from '../yachts.js';
import { yachtPageLink } from '../fleet.js';
import { REGIONS, REGION_FOR_COUNTRY, filterYachts, quoteYacht, sortQuotes, yachtType } from '../selection.js';
import { EMBARKATION_COUNTRIES, LINE_LABELS, VAT_NOTE } from '../calc/charter.js';
import { CURRENCIES, ratesFromSettings, formatMoney, rateNote, groupThousands } from '../calc/currency.js';
import { formatDate } from '../calc/dates.js';
import { escapeHTML, groupThousandsAsYouType } from './html.js';

// What the user has entered. Kept while the app is open, so moving to
// another screen and back does not lose it.
const state = {
  enquiryId: '',
  startDate: '',
  days: 7,
  guests: '',
  countryId: '',
  greekEligible: false,
  budget: '',
  budgetCurrency: 'EUR',
  displayCurrency: 'EUR',
  regionId: '',
  type: '',
  includeNotStated: true,
  hideOverBudget: false,
};

// Delivery, redelivery and extras typed in for a particular yacht.
const perYacht = new Map();

// Which yachts have their cost breakdown open, so redrawing the list
// does not close them.
const openBreakdowns = new Set();

let resultsEl;
let summaryEl;
let showButton;

export function render(container) {
  const openEnquiries = getCollection('enquiries').filter((e) => !['Completed', 'Lost'].includes(e.status));

  container.insertAdjacentHTML('beforeend', `
    <form id="selection-form" class="section" novalidate>
      <h2>The charter</h2>
      <div class="field">
        <label for="enquiryId">Start from an enquiry</label>
        <select id="enquiryId" name="enquiryId">
          <option value="">None, enter details below</option>
          ${openEnquiries.map((e) => `<option value="${escapeHTML(e.id)}" ${e.id === state.enquiryId ? 'selected' : ''}>${escapeHTML(e.clientName)} (${escapeHTML(e.status)})</option>`).join('')}
        </select>
      </div>
      <div class="form-grid form-grid--3">
        ${input('startDate', 'Embarkation date', 'date')}
        ${input('days', 'Days', 'text', 'inputmode="numeric"')}
        ${input('guests', 'Guests', 'text', 'inputmode="numeric"')}
        ${select('countryId', 'Starts in (sets VAT)', [['', 'Choose a country'], ...EMBARKATION_COUNTRIES.map((c) => [c.id, c.label])])}
        ${input('budget', 'Budget (all in)', 'text', 'inputmode="numeric"')}
        ${select('budgetCurrency', 'Budget currency', CURRENCIES.map((c) => [c, c]))}
      </div>
      <div class="field field--tick" data-show-when="greece" ${state.countryId === 'greece' ? '' : 'hidden'}>
        <input type="checkbox" id="greekEligible" name="greekEligible" ${state.greekEligible ? 'checked' : ''}>
        <label for="greekEligible">Eligible for Greece's reduced charter VAT rate</label>
      </div>

      <h2>Filter and display</h2>
      <div class="form-grid form-grid--3">
        ${select('regionId', 'Cruising region', [['', 'Any region'], ...REGIONS.map((r) => [r.id, r.label])])}
        ${select('type', 'Type', [['', 'Any type'], ['Motor', 'Motor'], ['Sail', 'Sail']])}
        ${select('displayCurrency', 'Show totals in', CURRENCIES.map((c) => [c, c]))}
      </div>
      <div class="field field--tick">
        <input type="checkbox" id="includeNotStated" name="includeNotStated" ${state.includeNotStated ? 'checked' : ''}>
        <label for="includeNotStated">Include yachts where the area, guests or type is not stated</label>
      </div>
      <div class="field field--tick">
        <input type="checkbox" id="hideOverBudget" name="hideOverBudget" ${state.hideOverBudget ? 'checked' : ''}>
        <label for="hideOverBudget">Hide yachts more than the tolerance over budget</label>
      </div>
      <div class="button-row">
        <button type="submit" class="button" id="show-yachts">Show yachts</button>
      </div>
    </form>

    <div class="notice">
      <p>Select a yacht's name to see its photos and full details on the firm's website. To link straight to a yacht's own page, add it under "Other listing links" on its Fleet record.</p>
      <p>Rates are indicative "from" weekly rates as listed by each firm on the date shown. They are not an offer. Totals include VAT and APA but not the gratuity.</p>
      <p>${escapeHTML(VAT_NOTE)}</p>
    </div>

    <p class="results-summary" id="results-summary" role="status" tabindex="-1"></p>
    <div id="results" class="yacht-list"></div>
  `);

  resultsEl = container.querySelector('#results');
  summaryEl = container.querySelector('#results-summary');
  const form = container.querySelector('#selection-form');
  showButton = container.querySelector('#show-yachts');
  groupThousandsAsYouType(form.elements.budget);

  // The list already updates as you type, but on a phone the results sit
  // well below the filters. This button jumps down to them.
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    drawResults();
    summaryEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    summaryEl.focus({ preventScroll: true });
  });

  form.addEventListener('input', (event) => onFormChange(form, event));
  form.addEventListener('change', (event) => onFormChange(form, event));

  // Remember open breakdowns. ("toggle" does not bubble, so listen while
  // the event travels down to the details element.)
  resultsEl.addEventListener('toggle', (event) => {
    const id = event.target.dataset?.yacht;
    if (!id) return;
    if (event.target.open) openBreakdowns.add(id);
    else openBreakdowns.delete(id);
  }, true);

  // Delivery, redelivery and extras boxes inside each yacht's breakdown.
  resultsEl.addEventListener('change', (event) => {
    const box = event.target.closest('[data-yacht][data-extra]');
    if (!box) return;
    const entry = perYacht.get(box.dataset.yacht) ?? {};
    const amount = Number(box.value.replace(/[,\s]/g, ''));
    entry[box.dataset.extra] = Number.isFinite(amount) && amount > 0 ? amount : 0;
    perYacht.set(box.dataset.yacht, entry);
    drawResults();
    resultsEl.querySelector(`#${CSS.escape(box.id)}`)?.focus();
  });

  drawResults();
}

function onFormChange(form, event) {
  // Choosing an enquiry fills in the charter details from it.
  if (event.target.name === 'enquiryId' && event.type === 'change') {
    state.enquiryId = form.elements.enquiryId.value;
    const e = getCollection('enquiries').find((x) => x.id === state.enquiryId);
    if (e) {
      Object.assign(state, {
        startDate: e.startDate, days: charterDays(e), guests: e.guests, countryId: e.embarkationCountry,
        greekEligible: e.greekEligible, budget: groupThousands(e.budget), budgetCurrency: e.budgetCurrency,
        displayCurrency: e.budgetCurrency, regionId: REGION_FOR_COUNTRY[e.embarkationCountry] ?? '',
      });
      for (const name of ['startDate', 'days', 'guests', 'countryId', 'budget', 'budgetCurrency', 'displayCurrency', 'regionId']) {
        form.elements[name].value = state[name];
      }
      form.elements.greekEligible.checked = state.greekEligible;
    }
  } else {
    for (const name of ['startDate', 'days', 'guests', 'countryId', 'budget', 'budgetCurrency', 'displayCurrency', 'regionId', 'type']) {
      state[name] = form.elements[name].value;
    }
    for (const name of ['greekEligible', 'includeNotStated', 'hideOverBudget']) state[name] = form.elements[name].checked;
  }
  form.querySelector('[data-show-when="greece"]').hidden = state.countryId !== 'greece';
  drawResults();
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

function drawResults() {
  const settings = getSettings();
  const rates = ratesFromSettings(settings);
  const guests = toNumber(state.guests);
  const days = toNumber(state.days);

  if (!days || days < 1 || !Number.isInteger(days)) {
    summaryEl.textContent = 'Enter the number of charter days (a whole number) to see costs.';
    resultsEl.replaceChildren();
    showButton.textContent = 'Show yachts';
    return;
  }

  const charter = {
    days,
    countryId: state.countryId,
    greekEligible: state.greekEligible,
    budget: toNumber(state.budget),
    budgetCurrency: state.budgetCurrency,
    displayCurrency: state.displayCurrency,
    startDate: state.startDate || null,
  };

  const matches = filterYachts(getCollection('yachts'), {
    guests, regionId: state.regionId || null, type: state.type || null, includeNotStated: state.includeNotStated,
  });
  let items = matches.map(({ yacht, notStated }) => ({
    yacht, notStated, quote: quoteYacht(yacht, charter, settings, rates, extrasFor(yacht.id)),
  }));
  if (state.hideOverBudget) items = items.filter((i) => i.quote.band?.id !== 'out');
  items = sortQuotes(items);

  // Summary line, read out by screen readers when it changes.
  const count = (id) => items.filter((i) => i.quote.band?.id === id).length;
  const noRate = items.filter((i) => !i.quote.ok).length;
  const parts = [`${items.length} yachts`];
  if (charter.budget && state.countryId) parts.push(`${count('within')} within budget`, `${count('over')} slightly over`, `${count('out')} over budget`);
  const needRate = items.filter((i) => i.quote.ok && !i.quote.band && i.quote.bandNote !== 'No budget set').length;
  if (needRate) parts.push(`${needRate} priced in another currency (add its rate in Settings to compare)`);
  if (noRate) parts.push(`${noRate} with rate on enquiry`);
  summaryEl.textContent = `${parts.join(', ')}.`;
  showButton.textContent = `Show ${items.length} ${items.length === 1 ? 'yacht' : 'yachts'}`;

  const note = rateNote(state.displayCurrency, rates);
  resultsEl.innerHTML = `
    ${!state.countryId ? '<p class="notice">Choose where the charter starts to work out VAT and totals.</p>' : ''}
    ${note ? `<p class="muted">${escapeHTML(note)}</p>` : ''}
    ${items.map((item) => cardHTML(item, charter)).join('')}
  `;
}

function cardHTML({ yacht, notStated, quote }, charter) {
  const check = checkPill(yacht);
  const specs = [
    yacht.lengthM ? `${yacht.lengthM} m` : null,
    yacht.guests ? `${yacht.guests} guests` : 'Guests not stated',
    yacht.cabins ? `${yacht.cabins} cabins` : null,
    yacht.builder,
    yacht.year,
    yachtType(yacht),
  ].filter(Boolean).join(' · ');

  const notStatedPills = notStated.map((n) => `<span class="pill pill--neutral">${{ area: 'Area not stated', guests: 'Guests not stated', type: 'Type not stated' }[n]}</span>`).join('');

  return `
    <article class="yacht-card" aria-labelledby="yacht-${escapeHTML(yacht.id)}">
      <div class="yacht-card__head">
        <div>
          <h3 id="yacht-${escapeHTML(yacht.id)}">${nameLinkHTML(yacht)}</h3>
          <p class="cell-sub">${escapeHTML(yacht.firm)} · ${escapeHTML(specs)}</p>
          <p class="cell-sub">${escapeHTML(yacht.cruisingArea ?? 'Cruising area not stated')}</p>
        </div>
        <div class="yacht-card__total">${totalHTML(quote, charter, yacht)}</div>
      </div>
      <p class="pill-row">
        ${quote.band ? `<span class="pill pill--${quote.band.tone}">${quote.band.label}${quote.band.id !== 'within' ? ` (${quote.band.percentOver}% over)` : ''}</span>` : ''}
        <span class="pill pill--${check.tone}">${check.text}</span>
        ${notStatedPills}
      </p>
      ${quote.ok && quote.bandNote ? `<p class="hint">${escapeHTML(quote.bandNote)}.</p>` : ''}
      ${quote.ok && quote.seasonWarning ? `<p class="hint hint--warn">${escapeHTML(quote.seasonWarning)}</p>` : ''}
      ${quote.ok ? breakdownHTML(yacht, quote, charter.days) : ''}
      <p class="source-line">
        Source: ${yacht.sourceUrl ? `<a href="${escapeHTML(yacht.sourceUrl)}" target="_blank" rel="noopener">${escapeHTML(yacht.source ?? yacht.firm)}</a>` : escapeHTML(yacht.source ?? 'not stated')},
        checked ${formatDate(yacht.dateChecked)}${yacht.notes ? `. Notes: ${escapeHTML(yacht.notes)}` : ''}
      </p>
    </article>`;
}

// The yacht's name, linked to its own page (or a search of its firm's
// site for it), opening in a new tab.
function nameLinkHTML(yacht) {
  const link = yachtPageLink(yacht);
  if (!link) return escapeHTML(yacht.name);
  const hint = link.kind === 'listing' ? 'opens its listing in a new tab' : `finds it on the ${yacht.firm ?? 'firm'} website, in a new tab`;
  return `<a href="${escapeHTML(link.url)}" target="_blank" rel="noopener" title="${escapeHTML(hint)}">${escapeHTML(yacht.name)}<span class="visually-hidden"> (${escapeHTML(hint)})</span></a>`;
}

// The headline figure: total in the chosen currency (two figures for the
// Bahamas), or the reason there is no figure.
function totalHTML(quote, charter, yacht) {
  if (!quote.ok) return `<span class="total-label">${escapeHTML(quote.reason)}</span>`;
  const totals = quote.options.map((o) => (o.displayTotal != null
    ? formatMoney(o.displayTotal, charter.displayCurrency)
    : formatMoney(o.breakdown.total, quote.currency)));
  return `
    <span class="total-label">Total</span>
    <span class="total-figure num">${totals.join(' to ')}</span>
    <span class="cell-sub num">${escapeHTML(quote.rateLabel)}: ${formatMoney(quote.weeklyRate, quote.currency)} a week</span>`;
}

// The line-by-line cost, in the yacht's own currency, with boxes for
// delivery, redelivery and extras for this yacht.
function breakdownHTML(yacht, quote, days) {
  const cur = quote.currency;
  const extra = perYacht.get(yacht.id) ?? {};
  const two = quote.options.length > 1;
  const b = quote.options.map((o) => o.breakdown);
  const row = (label, values, cls = '') => `
    <tr class="${cls}"><th scope="row">${escapeHTML(label)}</th>${values.map((v) => `<td class="num">${formatMoney(v, cur)}</td>`).join('')}</tr>`;
  const id = (name) => `${yacht.id}-${name}`;

  return `
    <details class="breakdown" data-yacht="${escapeHTML(yacht.id)}" ${openBreakdowns.has(yacht.id) ? 'open' : ''}>
      <summary>Cost breakdown (${cur})</summary>
      <table class="breakdown-table">
        ${two ? `<thead><tr><td></td>${quote.options.map((o) => `<th scope="col" class="num">${escapeHTML(o.vatLabel)}</th>`).join('')}</tr></thead>` : ''}
        <tbody>
          ${row(`${LINE_LABELS.charterFee} (pro rata, ${days} days)`, b.map((x) => x.charterFee))}
          ${b[0].deliveryFee ? row(LINE_LABELS.deliveryFee, b.map((x) => x.deliveryFee)) : ''}
          ${b[0].redeliveryFee ? row(LINE_LABELS.redeliveryFee, b.map((x) => x.redeliveryFee)) : ''}
          ${row(`${LINE_LABELS.vat} (${b.map((x) => `${x.vatRate}%`).join(' / ')})`, b.map((x) => x.vat))}
          ${row(`${LINE_LABELS.apa}, ${b[0].apaPercent}%`, b.map((x) => x.apa))}
          ${b[0].apaVat ? row(LINE_LABELS.apaVat, b.map((x) => x.apaVat)) : ''}
          ${b[0].extrasTotal ? row(LINE_LABELS.extras, b.map((x) => x.extrasTotal)) : ''}
          ${row(LINE_LABELS.total, b.map((x) => x.total), 'total-row')}
          <tr class="muted"><th scope="row">${escapeHTML(LINE_LABELS.gratuity)}</th><td class="num" colspan="${b.length}">${formatMoney(b[0].gratuityGuide.low, cur)} to ${formatMoney(b[0].gratuityGuide.high, cur)}</td></tr>
        </tbody>
      </table>
      <div class="form-grid form-grid--3 breakdown-extras">
        ${extraBox(id('delivery'), yacht.id, 'deliveryFee', `Delivery fee (${cur})`, extra.deliveryFee)}
        ${extraBox(id('redelivery'), yacht.id, 'redeliveryFee', `Redelivery fee (${cur})`, extra.redeliveryFee)}
        ${extraBox(id('extras'), yacht.id, 'extrasAmount', `Extras (${cur})`, extra.extrasAmount)}
      </div>
    </details>`;
}

function extraBox(inputId, yachtId, key, label, value) {
  return `
    <div class="field">
      <label for="${escapeHTML(inputId)}">${escapeHTML(label)}</label>
      <input id="${escapeHTML(inputId)}" type="text" inputmode="numeric" data-yacht="${escapeHTML(yachtId)}" data-extra="${key}" value="${value ? value : ''}">
    </div>`;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

// The delivery, redelivery and extras typed in for one yacht, in the shape
// the charter maths expects.
function extrasFor(yachtId) {
  const e = perYacht.get(yachtId) ?? {};
  return {
    deliveryFee: e.deliveryFee ?? 0,
    redeliveryFee: e.redeliveryFee ?? 0,
    extras: e.extrasAmount ? [{ label: 'Extras', amount: e.extrasAmount }] : [],
  };
}

function input(name, label, type, extra = '') {
  return `
    <div class="field">
      <label for="${name}">${escapeHTML(label)}</label>
      <input id="${name}" name="${name}" type="${type}" value="${escapeHTML(state[name] ?? '')}" ${extra}>
    </div>`;
}

function select(name, label, options) {
  return `
    <div class="field">
      <label for="${name}">${escapeHTML(label)}</label>
      <select id="${name}" name="${name}">
        ${options.map(([value, text]) => `<option value="${escapeHTML(value)}" ${String(value) === String(state[name]) ? 'selected' : ''}>${escapeHTML(text)}</option>`).join('')}
      </select>
    </div>`;
}

function toNumber(value) {
  const text = String(value ?? '').replace(/[,\s]/g, '');
  if (text === '') return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}
