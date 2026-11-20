// Yacht selection screen.
// Describe the charter (or start from an enquiry), filter the fleet, and
// see each yacht's full cost against the budget.

import { getCollection, getSettings } from '../store.js';
import { charterDays } from '../enquiries.js';
import { checkPill } from '../yachts.js';
import { yachtPageLink } from '../fleet.js';
import { REGIONS, REGION_FOR_COUNTRY, filterYachts, quoteYacht, sortQuotes, yachtType, builders, rangeOf, sliderStep, weeklyRateIn } from '../selection.js';
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
  name: '',
  builder: '',
  // Slider ranges, { min, max }, or null when the slider is at its full extent.
  ranges: { length: null, rate: null, year: null },
};

// The range sliders. "values" reads the figure from a yacht; the slider's
// ends are the lowest and highest figures in the list.
const SLIDERS = [
  { key: 'length', label: 'Length', unit: 'm', values: (y) => y.lengthM, format: (v) => `${v} m`, step: () => 1 },
  {
    key: 'rate', label: 'Weekly rate', unit: 'weekly rate',
    values: (y, rates) => weeklyRateIn(y, state.displayCurrency, rates),
    format: (v) => formatMoney(v, state.displayCurrency),
    step: (span) => sliderStep(span),
  },
  { key: 'year', label: 'Year built', unit: 'year', values: (y) => y.year, format: (v) => String(v), step: () => 1 },
];

// Lowest and highest value and the step for one slider, from the whole list.
function sliderBounds(def) {
  const rates = ratesFromSettings(getSettings());
  const values = getCollection('yachts').map((y) => def.values(y, rates));
  const rough = rangeOf(values, 1);
  if (!rough) return null;
  const step = def.step(rough.max - rough.min);
  return { ...rangeOf(values, step), step };
}

// Delivery, redelivery and extras typed in for a particular yacht.
const perYacht = new Map();

// Which yachts have their cost breakdown open, so redrawing the list
// does not close them.
const openBreakdowns = new Set();

// Each yacht's own page on its firm's website, loaded once.
let yachtPages = {};
let yachtPhotos = {};
let yachtPagesLoaded = null;

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

      <div class="filter-panel">
      <h2>Find a yacht</h2>
      ${input('name', 'Search by name', 'search', 'placeholder="Yacht name" autocomplete="off"')}
      <div class="form-grid form-grid--3">
        ${select('type', 'Yacht type', [['', 'Any type'], ['Motor', 'Motor'], ['Sail', 'Sail']])}
        ${select('builder', 'Shipyard', [['', 'Any shipyard'], ...builders(getCollection('yachts')).map((b) => [b, b])])}
        ${select('regionId', 'Cruising region', [['', 'Any region'], ...REGIONS.map((r) => [r.id, r.label])])}
      </div>
      <div class="slider-grid">
        ${SLIDERS.map((def) => `<div data-slider="${def.key}">${sliderHTML(def)}</div>`).join('')}
      </div>
      <div class="form-grid form-grid--3">
        ${select('displayCurrency', 'Show totals and rates in', CURRENCIES.map((c) => [c, c]))}
      </div>
      <div class="field field--tick">
        <input type="checkbox" id="includeNotStated" name="includeNotStated" ${state.includeNotStated ? 'checked' : ''}>
        <label for="includeNotStated">Include yachts that do not state a detail you are filtering on</label>
      </div>
      <div class="field field--tick">
        <input type="checkbox" id="hideOverBudget" name="hideOverBudget" ${state.hideOverBudget ? 'checked' : ''}>
        <label for="hideOverBudget">Hide yachts more than the tolerance over budget</label>
      </div>
      <div class="button-row">
        <button type="submit" class="button" id="show-yachts">Show yachts</button>
      </div>
      </div>
    </form>

    <div class="notice">
      <p>Select a yacht's name to see its photos and full details on the firm's website. Where a firm's site could not be checked, the name searches that site instead. A link saved under "Other listing links" on a yacht's Fleet record is used first.</p>
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

  // Reset buttons put a slider back to its full extent.
  form.addEventListener('click', (event) => {
    const reset = event.target.closest('[data-reset]');
    if (!reset) return;
    const key = reset.dataset.reset;
    state.ranges[key] = null;
    redrawSlider(form, key);
    drawResults();
    form.querySelector(`#${key}Min`)?.focus();
  });

  form.addEventListener('input', (event) => onFormChange(form, event));
  form.addEventListener('change', (event) => onFormChange(form, event));

  // A photo the firm has since taken down: drop it rather than show a
  // broken image. ("error" does not bubble, so listen on the way down.)
  resultsEl.addEventListener('error', (event) => {
    if (event.target.tagName !== 'IMG') return;
    const card = event.target.closest('.yacht-card');
    event.target.closest('.yacht-card__photo')?.remove();
    card?.classList.remove('yacht-card--photo');
  }, true);

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

  yachtPagesLoaded ??= fetch('data/yacht-pages.json', { cache: 'no-cache' }).then((r) => r.json()).then((d) => { yachtPages = d.pages; yachtPhotos = d.images ?? {}; }).catch(() => {});
  yachtPagesLoaded.then(() => { if (resultsEl?.isConnected) drawResults(); });
}

function onFormChange(form, event) {
  // A slider handle moved.
  if (event.target.dataset.range) {
    readSlider(form, event.target);
    drawResults();
    return;
  }
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
      state.ranges.rate = null;
      redrawSlider(form, 'rate');
      form.elements.greekEligible.checked = state.greekEligible;
    }
  } else {
    const currencyBefore = state.displayCurrency;
    for (const name of ['startDate', 'days', 'guests', 'countryId', 'budget', 'budgetCurrency', 'displayCurrency', 'regionId', 'type', 'name', 'builder']) {
      state[name] = form.elements[name].value;
    }
    // Rates are shown in the display currency, so its slider starts again.
    if (state.displayCurrency !== currencyBefore) {
      state.ranges.rate = null;
      redrawSlider(form, 'rate');
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
    name: state.name, builder: state.builder || null,
    lengthRange: state.ranges.length, yearRange: state.ranges.year,
    rateRange: state.ranges.rate, rateCurrency: state.displayCurrency, rates,
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

const NOT_STATED_LABELS = {
  area: 'Area not stated', guests: 'Guests not stated', type: 'Type not stated', builder: 'Shipyard not stated',
  length: 'Length not stated', rate: 'Rate not comparable', year: 'Year not stated',
};

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

  const notStatedPills = notStated.map((n) => `<span class="pill pill--neutral">${NOT_STATED_LABELS[n]}</span>`).join('');

  const photo = photoHTML(yacht);
  return `
    <article class="yacht-card${photo ? ' yacht-card--photo' : ''}" aria-labelledby="yacht-${escapeHTML(yacht.id)}">
      ${photo}
      <div class="yacht-card__body">
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
      </div>
    </article>`;
}

// The yacht's headline photo from its page on the firm's website, linked
// to that page. Loaded only as it scrolls into view, so a long list stays
// quick on a phone. The name next to it is the link screen readers and
// keyboards use, so the photo link is skipped by both.
function photoHTML(yacht) {
  const src = yachtPhotos[yacht.id];
  if (!src) return '';
  const link = yachtPageLink(yacht, yachtPages);
  return `
    <a class="yacht-card__photo" href="${escapeHTML(link.url)}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">
      <img src="${escapeHTML(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" width="800" height="450">
    </a>`;
}

// The yacht's name, linked to its own page (or a search of its firm's
// site for it), opening in a new tab.
function nameLinkHTML(yacht) {
  const link = yachtPageLink(yacht, yachtPages);
  if (!link) return escapeHTML(yacht.name);
  const hint = link.kind === 'listing' ? `opens its page on the ${yacht.firm ?? 'firm'} website in a new tab` : `finds it on the ${yacht.firm ?? 'firm'} website, in a new tab`;
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
// Range sliders
// ---------------------------------------------------------------------------

// Two slider handles on one track: the lowest and highest value wanted.
// Each handle is a real range input with its own label, so it works with
// a keyboard (arrow keys) and a screen reader.
function sliderHTML(def) {
  const b = sliderBounds(def);
  if (!b) return '';
  const r = state.ranges[def.key] ?? b;
  const id = (end) => `${def.key}${end}`;
  return `
    <fieldset class="range-field">
      <legend>${escapeHTML(def.label)}</legend>
      <div class="dual-range" style="${fillStyle(r, b)}">
        <label class="visually-hidden" for="${id('Min')}">Lowest ${escapeHTML(def.label.toLowerCase())}</label>
        <input type="range" id="${id('Min')}" data-range="${def.key}" data-end="min" min="${b.min}" max="${b.max}" step="${b.step}" value="${r.min}" aria-valuetext="${escapeHTML(def.format(r.min))}">
        <label class="visually-hidden" for="${id('Max')}">Highest ${escapeHTML(def.label.toLowerCase())}</label>
        <input type="range" id="${id('Max')}" data-range="${def.key}" data-end="max" min="${b.min}" max="${b.max}" step="${b.step}" value="${r.max}" aria-valuetext="${escapeHTML(def.format(r.max))}">
      </div>
      <div class="range-field__foot">
        <output for="${id('Min')} ${id('Max')}" data-out="${def.key}">${escapeHTML(rangeText(def, r))}</output>
        <button type="button" class="button button--small range-reset" data-reset="${def.key}">Reset</button>
      </div>
    </fieldset>`;
}

function rangeText(def, r) {
  return `${def.format(r.min)} to ${def.format(r.max)}`;
}

// The filled part of the track, between the two handles.
function fillStyle(r, b) {
  const pct = (v) => (b.max === b.min ? 0 : ((v - b.min) / (b.max - b.min)) * 100);
  return `--lo:${pct(r.min)}%;--hi:${pct(r.max)}%`;
}

// Read both handles of a slider into the state. The handles cannot cross:
// the one being moved stops at the other.
function readSlider(form, moved) {
  const key = moved.dataset.range;
  const def = SLIDERS.find((d) => d.key === key);
  const b = sliderBounds(def);
  const lo = form.querySelector(`#${key}Min`);
  const hi = form.querySelector(`#${key}Max`);
  if (Number(lo.value) > Number(hi.value)) {
    if (moved === lo) lo.value = hi.value;
    else hi.value = lo.value;
  }
  const r = { min: Number(lo.value), max: Number(hi.value) };
  state.ranges[key] = r.min <= b.min && r.max >= b.max ? null : r;
  lo.setAttribute('aria-valuetext', def.format(r.min));
  hi.setAttribute('aria-valuetext', def.format(r.max));
  lo.parentElement.setAttribute('style', fillStyle(r, b));
  form.querySelector(`[data-out="${key}"]`).textContent = rangeText(def, r);
}

function redrawSlider(form, key) {
  const def = SLIDERS.find((d) => d.key === key);
  form.querySelector(`[data-slider="${key}"]`).innerHTML = sliderHTML(def);
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
