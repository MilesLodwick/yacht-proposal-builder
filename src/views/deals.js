// Deal tracker screen (brokerage sales).
//
//   #/deals          every deal, with its stage and deposit status, and a
//                    form to start a new one
//   #/deals/<id>     one deal: the money, then each MYBA MOA stage with its
//                    date and document checklist. Saves as you go.

import { getCollection, saveCollection, getSettings } from '../store.js';
import { DEAL_STAGES, DEFECTS_OUTCOMES, dealFigures, depositStatus, dealProgress, dealWarnings, validateDeal } from '../deals.js';
import { formatMoney } from '../calc/currency.js';
import { formatDate, todayISO } from '../calc/dates.js';
import { boatPhoto } from './boat-photos.js';
import { escapeHTML } from './html.js';

const COLLECTION = 'deals';

export function render(container, param, heading) {
  if (!param) return renderList(container);
  const deal = getCollection(COLLECTION).find((d) => d.id === param);
  if (!deal) {
    heading.textContent = 'Deal not found';
    container.insertAdjacentHTML('beforeend', '<p><a href="#/deals">Back to the deal tracker</a></p>');
    return;
  }
  const listing = getCollection('forSale').find((b) => b.id === deal.listingId);
  heading.textContent = `Deal: ${listing?.name ?? 'Boat'}`;
  renderDeal(container, deal, listing);
}

// ---------------------------------------------------------------------------
// List and new deal
// ---------------------------------------------------------------------------

function renderList(container) {
  const today = todayISO();
  const settings = getSettings();
  const deals = getCollection(COLLECTION);
  const listings = getCollection('forSale');
  const priced = listings.filter((l) => l.currency).sort((a, b) => a.name.localeCompare(b.name));

  container.insertAdjacentHTML('beforeend', `
    <p>Each sale from offer to commission, following the MYBA Memorandum of Agreement (MOA). Every stage has a date and a document checklist.</p>
    ${deals.length ? `
      <div class="table-wrap">
        <table class="data-table data-table--wide">
          <caption class="visually-hidden">Deals</caption>
          <thead><tr><th scope="col">Boat and buyer</th><th scope="col" class="num">Agreed price</th><th scope="col">Stage</th><th scope="col">Deposit</th></tr></thead>
          <tbody>
            ${deals.map((d) => {
              const l = listings.find((x) => x.id === d.listingId);
              const p = dealProgress(d);
              const dep = depositStatus(d, settings, today);
              return `<tr>
                <th scope="row" data-label="Boat and buyer">${l ? boatPhoto(l.id) : ''}<a href="#/deals/${escapeHTML(d.id)}">${escapeHTML(l?.name ?? 'Boat')}</a><span class="cell-sub">${escapeHTML(d.buyer)}${d.buyerBroker ? ` via ${escapeHTML(d.buyerBroker)}` : ''}</span></th>
                <td data-label="Agreed price" class="num">${formatMoney(d.agreedPrice, d.currency)}</td>
                <td data-label="Stage"><span>${p.current ? `Next: ${escapeHTML(p.current.label)}` : 'Complete'}<span class="cell-sub">${p.done} of ${p.total} stages done</span></span></td>
                <td data-label="Deposit"><span class="pill pill--${dep.tone}">${escapeHTML(dep.text)}</span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : '<p class="placeholder">No deals yet.</p>'}

    <form class="section" id="new-deal" novalidate>
      <h2>Start a deal</h2>
      <div class="form-grid form-grid--3">
        <div class="field">
          <label for="listingId">Boat</label>
          <select id="listingId" name="listingId" aria-describedby="listingId-error">
            <option value="">Choose a listing</option>
            ${priced.map((l) => `<option value="${escapeHTML(l.id)}">${escapeHTML(l.name)} (${escapeHTML(l.firm)}${l.year ? `, ${l.year}` : ''})</option>`).join('')}
          </select>
          <p class="field-error" id="listingId-error"></p>
        </div>
        ${field('buyer', 'Buyer reference')}
        ${field('buyerBroker', 'Buyer\'s broker (optional)')}
        ${field('agreedPrice', 'Agreed price', 'inputmode="numeric"')}
      </div>
      <p class="hint" id="price-hint">Choose a boat to see its currency and asking price.</p>
      <button type="submit" class="button">Start deal</button>
    </form>
  `);

  const form = container.querySelector('#new-deal');
  form.elements.listingId.addEventListener('change', () => {
    const l = listings.find((x) => x.id === form.elements.listingId.value);
    container.querySelector('#price-hint').textContent = l
      ? `Prices in ${l.currency}. Asking price ${l.askingPrice != null ? formatMoney(l.askingPrice, l.currency) : 'not stated'}.`
      : 'Choose a boat to see its currency and asking price.';
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = Object.fromEntries(new FormData(form));
    const result = validateDeal(input);
    for (const el of form.querySelectorAll('.field-error')) el.textContent = '';
    if (!result.ok) {
      let first = null;
      for (const [name, message] of Object.entries(result.errors)) {
        form.querySelector(`#${name}-error`).textContent = message;
        first ??= form.elements[name];
      }
      first.focus();
      return;
    }
    const listing = listings.find((x) => x.id === input.listingId);
    const deal = {
      id: `deal-${Date.now().toString(36)}`, listingId: listing.id, buyer: input.buyer.trim(),
      buyerBroker: input.buyerBroker.trim(), agreedPrice: result.agreedPrice, currency: listing.currency,
      defectsOutcome: '', priceReduction: null, stages: {},
    };
    saveCollection(COLLECTION, [...getCollection(COLLECTION), deal]);
    location.hash = `#/deals/${deal.id}`;
  });
}

// ---------------------------------------------------------------------------
// One deal
// ---------------------------------------------------------------------------

function renderDeal(container, saved, listing) {
  const today = todayISO();
  const settings = getSettings();
  let deal = structuredClone(saved);
  const stage = (id) => deal.stages[id] ?? { date: null, docs: {}, notes: '' };

  container.insertAdjacentHTML('beforeend', `
    <p><a href="#/deals">Back to the deal tracker</a>${listing ? ` · <a href="#/listings/${escapeHTML(listing.id)}">Open the listing</a>` : ''}</p>
    ${listing ? boatPhoto(listing.id, 'large') : ''}
    <p class="muted">${escapeHTML(deal.buyer)}${deal.buyerBroker ? ` via ${escapeHTML(deal.buyerBroker)}` : ''}</p>
    ${deal.example ? '<p class="notice">This deal is a fictional example on a real listing. It did not happen.</p>' : ''}
    <div id="figures"></div>
    <div id="deal-warnings"></div>
    <div id="listing-hint"></div>

    <form id="deal-form" novalidate>
      <ol class="stage-list">
        ${DEAL_STAGES.map((st, i) => `
          <li class="section stage" data-stage="${st.id}">
            <div class="stage-head">
              <h2><span class="stage-number">${i + 1}</span> ${escapeHTML(st.label)}</h2>
              <span class="stage-pill"></span>
            </div>
            <div class="form-grid">
              <div class="field">
                <label for="${st.id}-date">Date</label>
                <input type="date" id="${st.id}-date" name="${st.id}-date" max="${today}" value="${stage(st.id).date ?? ''}">
              </div>
              ${st.id === 'defects' ? `
                <div class="field">
                  <label for="defectsOutcome">Outcome</label>
                  <select id="defectsOutcome" name="defectsOutcome">
                    ${DEFECTS_OUTCOMES.map((o) => `<option value="${o}" ${o === deal.defectsOutcome ? 'selected' : ''}>${o ? o[0].toUpperCase() + o.slice(1) : 'Not decided yet'}</option>`).join('')}
                  </select>
                </div>
                <div class="field" id="reduction-field" ${deal.defectsOutcome === 'price reduced' ? '' : 'hidden'}>
                  <label for="priceReduction">Price reduction agreed (${escapeHTML(deal.currency)})</label>
                  <input id="priceReduction" name="priceReduction" inputmode="numeric" value="${deal.priceReduction ?? ''}">
                </div>` : ''}
            </div>
            <fieldset class="doc-checklist">
              <legend>Documents</legend>
              ${st.docs.map((d) => `
                <div class="field field--tick">
                  <input type="checkbox" id="${st.id}-${d.id}" name="${st.id}-${d.id}" ${stage(st.id).docs?.[d.id] ? 'checked' : ''}>
                  <label for="${st.id}-${d.id}">${escapeHTML(d.label)}</label>
                </div>`).join('')}
            </fieldset>
            <div class="field">
              <label for="${st.id}-notes">Notes</label>
              <input id="${st.id}-notes" name="${st.id}-notes" value="${escapeHTML(stage(st.id).notes ?? '')}">
            </div>
          </li>`).join('')}
      </ol>
      <p class="status-message" role="status" id="deal-status"></p>
    </form>
    <div class="button-row"><button type="button" class="button button--danger" id="delete-deal">Delete deal</button></div>
  `);

  const form = container.querySelector('#deal-form');

  const draw = () => {
    const f = dealFigures(deal, settings);
    const dep = depositStatus(deal, settings, today);
    const p = dealProgress(deal);
    const money = (n) => formatMoney(n, deal.currency);

    container.querySelector('#figures').innerHTML = `
      <div class="report-figures">
        <div><span class="figure-label">Agreed price</span><span class="figure num">${money(f.agreedPrice)}</span></div>
        <div><span class="figure-label">Deposit (${f.deposit.percent}%)</span><span class="figure num">${money(f.deposit.amount)}</span>
          <span class="cell-sub">${f.deposit.dueDate ? `Due ${formatDate(f.deposit.dueDate)} (${f.deposit.bankingDays} banking days after the MOA)` : `Due ${f.deposit.bankingDays} banking days after the MOA`}</span>
          <span class="pill pill--${dep.tone}">${escapeHTML(dep.text)}</span></div>
        <div><span class="figure-label">Balance at closing</span><span class="figure num">${money(f.balance)}</span>${f.reduction ? `<span class="cell-sub">After a ${money(f.reduction)} reduction for defects</span>` : ''}</div>
        <div><span class="figure-label">Commission (${f.commission.percent}%)</span><span class="figure num">${money(f.commission.amount)}</span><span class="cell-sub">On the final price of ${money(f.finalPrice)}</span></div>
      </div>
      <p class="hint">${p.current ? `${p.done} of ${p.total} stages done. Next: <strong>${escapeHTML(p.current.label)}</strong>.` : 'All stages done.'} Banking days skip weekends but not public holidays: check bank holidays. Terms follow Settings; check them against the signed MOA.</p>`;

    const warnings = dealWarnings(deal);
    container.querySelector('#deal-warnings').innerHTML = warnings.length
      ? `<div class="notice notice--warn"><p><strong>To check:</strong></p><ul>${warnings.map((w) => `<li>${escapeHTML(w)}</li>`).join('')}</ul></div>`
      : '';

    // Suggest the listing status to match, without changing it automatically.
    const suggested = p.closed ? 'Sold' : p.done > 0 ? 'Under offer' : null;
    container.querySelector('#listing-hint').innerHTML = listing && suggested && listing.status !== suggested
      ? `<p class="hint">The listing is marked "${escapeHTML(listing.status ?? 'Active')}". Consider changing it to "${suggested}" on the <a href="#/listings/${escapeHTML(listing.id)}">listing</a>.</p>`
      : '';

    for (const st of DEAL_STAGES) {
      const el = form.querySelector(`[data-stage="${st.id}"]`);
      const s = stage(st.id);
      const done = Boolean(s.date);
      const docsDone = st.docs.filter((d) => s.docs?.[d.id]).length;
      el.classList.toggle('is-done', done);
      el.classList.toggle('is-current', p.current?.id === st.id);
      el.querySelector('.stage-pill').innerHTML = done
        ? `<span class="pill pill--${docsDone === st.docs.length ? 'green' : 'amber'}">Done ${formatDate(s.date)}${docsDone < st.docs.length ? `, ${st.docs.length - docsDone} document${st.docs.length - docsDone > 1 ? 's' : ''} missing` : ''}</span>`
        : p.current?.id === st.id ? '<span class="pill pill--neutral">Next</span>' : '';
    }
  };

  form.addEventListener('change', (event) => {
    // Ticking every document does not complete a stage: it needs a date.
    deal = {
      ...deal,
      defectsOutcome: form.elements.defectsOutcome.value,
      priceReduction: Number(String(form.elements.priceReduction.value).replace(/[,\s]/g, '')) || null,
      stages: Object.fromEntries(DEAL_STAGES.map((st) => [st.id, {
        date: form.elements[`${st.id}-date`].value || null,
        docs: Object.fromEntries(st.docs.map((d) => [d.id, form.elements[`${st.id}-${d.id}`].checked])),
        notes: form.elements[`${st.id}-notes`].value.trim(),
      }])),
    };
    form.querySelector('#reduction-field').hidden = deal.defectsOutcome !== 'price reduced';
    saveCollection(COLLECTION, getCollection(COLLECTION).map((d) => (d.id === deal.id ? deal : d)));
    container.querySelector('#deal-status').textContent = 'Saved.';
    draw();
    if (event.target.name === 'defectsOutcome' && deal.defectsOutcome === 'price reduced') form.elements.priceReduction.focus();
  });

  container.querySelector('#delete-deal').addEventListener('click', () => {
    if (!window.confirm('Delete this deal? This cannot be undone.')) return;
    saveCollection(COLLECTION, getCollection(COLLECTION).filter((d) => d.id !== deal.id));
    location.hash = '#/deals';
  });

  draw();
}

function field(name, label, extra = '') {
  return `
    <div class="field">
      <label for="${name}">${escapeHTML(label)}</label>
      <input id="${name}" name="${name}" aria-describedby="${name}-error" ${extra}>
      <p class="field-error" id="${name}-error"></p>
    </div>`;
}
