// Buyer brief screen.
//
//   #/buyer-brief         briefs, and a button to start one
//   #/buyer-brief/<id>    the buyer's criteria, matching boats and the shortlist
//
// The shortlist prints on its own (the criteria and matches are hidden).

import { getCollection, saveCollection, getSettings } from '../store.js';
import { matchingBoats, shortlistRow, validateBrief } from '../buyer.js';
import { salesSettings, ASKING_NOT_SOLD } from '../calc/sales.js';
import { CURRENCIES, ratesFromSettings, formatMoney, rateNote } from '../calc/currency.js';
import { formatDate, todayISO } from '../calc/dates.js';
import { escapeHTML } from './html.js';

const COLLECTION = 'buyerBriefs';

export function render(container, param, heading) {
  if (!param) return renderList(container);
  const brief = getCollection(COLLECTION).find((b) => b.id === param);
  if (!brief) {
    heading.textContent = 'Brief not found';
    container.insertAdjacentHTML('beforeend', '<p><a href="#/buyer-brief">Back to buyer briefs</a></p>');
    return;
  }
  heading.textContent = 'Buyer brief';
  heading.classList.add('no-print');
  renderBrief(container, brief);
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

function renderList(container) {
  const briefs = getCollection(COLLECTION);
  container.insertAdjacentHTML('beforeend', `
    <p>What a buyer is looking for, the boats that match, and a shortlist with asking price, price per metre and estimated running costs. ${ASKING_NOT_SOLD}</p>
    <div class="toolbar"><button type="button" class="button" id="new-brief">New buyer brief</button></div>
    ${briefs.length ? `
      <div class="table-wrap">
        <table class="data-table">
          <caption class="visually-hidden">Buyer briefs</caption>
          <thead><tr><th scope="col">Buyer</th><th scope="col" class="num">Budget</th><th scope="col" class="num">Shortlisted</th></tr></thead>
          <tbody>
            ${briefs.map((b) => `<tr>
              <th scope="row" data-label="Buyer"><a href="#/buyer-brief/${escapeHTML(b.id)}">${escapeHTML(b.buyerName || 'Unnamed buyer')}</a></th>
              <td data-label="Budget" class="num">${b.budget ? formatMoney(b.budget, b.currency) : 'Not set'}</td>
              <td data-label="Shortlisted" class="num">${b.boatIds.length}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` : '<p class="placeholder">No buyer briefs yet.</p>'}
  `);
  container.querySelector('#new-brief').addEventListener('click', () => {
    const brief = { id: `brief-${Date.now().toString(36)}`, buyerName: '', currency: 'EUR', budget: null, type: null, minLength: null, maxLength: null, minYear: null, boatIds: [], notes: '' };
    saveCollection(COLLECTION, [...getCollection(COLLECTION), brief]);
    location.hash = `#/buyer-brief/${brief.id}`;
  });
}

// ---------------------------------------------------------------------------
// One brief
// ---------------------------------------------------------------------------

function renderBrief(container, saved) {
  const settings = getSettings();
  const rates = ratesFromSettings(settings);
  const s = salesSettings(settings);
  const boats = getCollection('forSale');
  let brief = saved;

  const save = () => saveCollection(COLLECTION, getCollection(COLLECTION).map((b) => (b.id === brief.id ? brief : b)));
  const v = (k) => brief[k] ?? '';

  container.insertAdjacentHTML('beforeend', `
    <div class="no-print">
      <p><a href="#/buyer-brief">Back to buyer briefs</a></p>
      ${brief.example ? '<p class="notice">This is a fictional example buyer. The boats are real public listings.</p>' : ''}
      <form class="section" id="brief-form" novalidate>
        <h2>What the buyer wants</h2>
        <div class="form-grid form-grid--3">
          ${field('buyerName', 'Buyer name or reference', v('buyerName'))}
          ${select('currency', 'Currency', CURRENCIES.map((c) => [c, c]), brief.currency)}
          ${field('budget', 'Budget (most they will pay)', v('budget'), 'inputmode="numeric"')}
          ${select('type', 'Type', [['', 'Motor or sail'], ['Motor', 'Motor'], ['Sail', 'Sail']], brief.type ?? '')}
          ${field('minLength', 'Length from (m)', v('minLength'), 'inputmode="decimal"')}
          ${field('maxLength', 'Length to (m)', v('maxLength'), 'inputmode="decimal"')}
          ${field('minYear', 'Built in or after', v('minYear'), 'inputmode="numeric"')}
        </div>
        ${field('notes', 'Notes', v('notes'))}
        <p class="status-message" role="status" id="brief-status"></p>
      </form>

      <section class="section" aria-labelledby="matches-heading">
        <h2 id="matches-heading">Matching boats</h2>
        <p class="hint" id="matches-summary"></p>
        <div id="matches" class="pick-box"></div>
      </section>
    </div>

    <article id="shortlist" class="proposal-doc" aria-label="Shortlist"></article>
    <div class="button-row no-print"><button type="button" class="button" id="print">Print the shortlist</button></div>
  `);

  const form = container.querySelector('#brief-form');

  const drawMatches = () => {
    const { matches, left } = matchingBoats(boats, brief, rates);
    const leftOut = [
      left.noPrice && `${left.noPrice} with no price in ${brief.currency}${brief.currency !== 'EUR' || boats.some((b) => b.currency && b.currency !== brief.currency) ? ' (set exchange rates in Settings)' : ''}`,
      left.noLength && `${left.noLength} with no length`,
      left.noYear && `${left.noYear} with no year`,
      left.noType && `${left.noType} with no type`,
    ].filter(Boolean);
    container.querySelector('#matches-summary').textContent =
      `${matches.length} boats match.${leftOut.length ? ` Left out: ${leftOut.join(', ')}.` : ''} Tick a boat to add it to the shortlist.`;
    container.querySelector('#matches').innerHTML = matches.slice(0, 80).map(({ boat, price }) => `
      <div class="field field--tick">
        <input type="checkbox" id="pick-${escapeHTML(boat.id)}" value="${escapeHTML(boat.id)}" ${brief.boatIds.includes(boat.id) ? 'checked' : ''}>
        <label for="pick-${escapeHTML(boat.id)}">${escapeHTML(boat.name)}
          <span class="muted">${[boat.lengthM && `${boat.lengthM} m`, boat.year, price != null ? formatMoney(price, brief.currency) : null].filter(Boolean).join(', ')}</span></label>
      </div>`).join('') || '<p class="muted">No boats match. Widen the brief.</p>';
  };

  const drawShortlist = () => {
    const rows = brief.boatIds.map((id) => boats.find((b) => b.id === id)).filter(Boolean)
      .map((b) => shortlistRow(b, brief, rates, s.runningCostPercent));
    const anyConverted = rows.some((r) => r.converted);
    const criteria = [
      brief.type,
      brief.minLength || brief.maxLength ? `${brief.minLength ?? 'any'} to ${brief.maxLength ?? 'any'} m` : null,
      brief.minYear ? `built ${brief.minYear} or later` : null,
      brief.budget ? `up to ${formatMoney(brief.budget, brief.currency)}` : null,
    ].filter(Boolean).join(', ');

    container.querySelector('#shortlist').innerHTML = `
      <header class="proposal-head">
        <p class="proposal-kicker">Buyer shortlist</p>
        <h2>${escapeHTML(brief.buyerName || 'Buyer')}</h2>
        <dl class="proposal-facts">
          <div><dt>Looking for</dt><dd>${escapeHTML(criteria || 'Open brief')}</dd></div>
          <div><dt>Prepared</dt><dd>${formatDate(todayISO())}</dd></div>
        </dl>
        ${brief.notes ? `<p>${escapeHTML(brief.notes)}</p>` : ''}
      </header>
      ${rows.length ? `
        <div class="table-wrap">
          <table class="handover-table report-table">
            <caption class="visually-hidden">Shortlisted boats</caption>
            <thead><tr>
              <th scope="col">Boat</th><th scope="col">Length and year</th><th scope="col" class="num">Asking price</th>
              <th scope="col" class="num">Per metre</th><th scope="col" class="num">Running costs a year</th><th scope="col" class="no-print"><span class="visually-hidden">Actions</span></th>
            </tr></thead>
            <tbody>
              ${rows.map((r) => `<tr>
                <th scope="row">${escapeHTML(r.boat.name)}<span class="cell-sub">${escapeHTML(r.boat.firm)}${r.boat.location ? `, ${escapeHTML(r.boat.location)}` : ''}</span></th>
                <td>${r.boat.lengthM ? `${r.boat.lengthM} m` : '-'}${r.boat.year ? `, ${r.boat.year}` : ''}</td>
                <td class="num">${r.price != null ? formatMoney(r.price, brief.currency) : 'Not available'}${r.converted ? `<span class="cell-sub">from ${escapeHTML(r.boat.currencyAsListed ?? r.boat.currency)} ${r.boat.askingPrice.toLocaleString('en-GB')}</span>` : ''}${r.overBudget ? '<span class="cell-sub"><span class="pill pill--red">Over budget</span></span>' : ''}</td>
                <td class="num">${r.pricePerMetre != null ? formatMoney(r.pricePerMetre, brief.currency) : '-'}</td>
                <td class="num">${r.runningCost != null ? formatMoney(r.runningCost, brief.currency) : '-'}</td>
                <td class="no-print"><button type="button" class="button button--secondary button--small" data-remove="${escapeHTML(r.boat.id)}">Remove<span class="visually-hidden"> ${escapeHTML(r.boat.name)}</span></button></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>` : '<p class="placeholder">Tick boats under Matching boats to build the shortlist.</p>'}
      <section class="proposal-notes">
        <h3>Notes</h3>
        <ul>
          <li>${ASKING_NOT_SOLD} Taken from public listings on the date each was checked.</li>
          <li>Running costs are a rough guide: about ${s.runningCostPercent}% of the price a year for crew, berthing, insurance, maintenance and fuel. Real costs depend on size, age and use.</li>
          ${anyConverted ? `<li>Some prices are converted into ${brief.currency}. ${escapeHTML(rateNote(rows.find((r) => r.converted).boat.currency === 'EUR' ? brief.currency : rows.find((r) => r.converted).boat.currency, rates))}.</li>` : ''}
          ${rows.some((r) => r.boat.currencyAsListed?.includes('Rightboat')) ? '<li>Prices marked "USD (Rightboat)" were converted by the listing site, not by the seller.</li>' : ''}
        </ul>
      </section>`;
  };

  form.addEventListener('input', () => {
    const result = validateBrief(Object.fromEntries(new FormData(form)));
    for (const el of form.querySelectorAll('.field-error')) el.textContent = '';
    for (const el of form.querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
    if (!result.ok) {
      for (const [name, message] of Object.entries(result.errors)) {
        form.elements[name].setAttribute('aria-invalid', 'true');
        form.querySelector(`#${name}-error`).textContent = message;
      }
      return;
    }
    brief = { ...brief, ...result.fields };
    save();
    container.querySelector('#brief-status').textContent = 'Saved.';
    drawMatches();
    drawShortlist();
  });

  container.querySelector('#matches').addEventListener('change', (event) => {
    const id = event.target.value;
    brief = { ...brief, boatIds: event.target.checked ? [...brief.boatIds, id] : brief.boatIds.filter((x) => x !== id) };
    save();
    drawShortlist();
  });

  container.querySelector('#shortlist').addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove]');
    if (!button) return;
    brief = { ...brief, boatIds: brief.boatIds.filter((x) => x !== button.dataset.remove) };
    save();
    drawMatches();
    drawShortlist();
  });

  container.querySelector('#print').addEventListener('click', () => window.print());

  drawMatches();
  drawShortlist();
}

function field(name, label, value, extra = '') {
  return `
    <div class="field">
      <label for="${name}">${escapeHTML(label)}</label>
      <input id="${name}" name="${name}" value="${escapeHTML(value)}" aria-describedby="${name}-error" ${extra}>
      <p class="field-error" id="${name}-error"></p>
    </div>`;
}

function select(name, label, options, selected) {
  return `
    <div class="field">
      <label for="${name}">${escapeHTML(label)}</label>
      <select id="${name}" name="${name}">
        ${options.map(([value, text]) => `<option value="${escapeHTML(value)}" ${String(value) === String(selected ?? '') ? 'selected' : ''}>${escapeHTML(text)}</option>`).join('')}
      </select>
    </div>`;
}
