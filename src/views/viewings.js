// Viewings screen (brokerage sales).
//
//   #/viewings          listings with sales activity, and coming viewings
//   #/viewings/<id>     one listing's log of enquiries and viewings, and the
//                       owner activity report (printable)

import { getCollection, saveCollection } from '../store.js';
import {
  ACTIVITY_TYPES, INTEREST_LEVELS, interestTone, isBooked, validateActivity, reportPeriods, activityReport,
} from '../activity.js';
import { withListingDefaults, daysOnMarket, statusTone, priceSummary } from '../listings.js';
import { formatMoney } from '../calc/currency.js';
import { formatDate, todayISO } from '../calc/dates.js';
import { escapeHTML } from './html.js';

const COLLECTION = 'saleActivity';
let periodId = '30';

export function render(container, param, heading) {
  if (!param) return renderOverview(container);
  const saved = getCollection('forSale').find((b) => b.id === param);
  if (!saved) {
    heading.textContent = 'Listing not found';
    container.insertAdjacentHTML('beforeend', '<p><a href="#/viewings">Back to viewings</a></p>');
    return;
  }
  heading.textContent = `Viewings: ${saved.name}`;
  heading.classList.add('no-print');
  renderListing(container, withListingDefaults(saved));
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function renderOverview(container) {
  const today = todayISO();
  const entries = getCollection(COLLECTION);
  const listings = getCollection('forSale');
  const withActivity = listings.filter((l) => entries.some((e) => e.listingId === l.id));
  const upcoming = entries.filter((e) => isBooked(e, today)).sort((a, b) => a.date.localeCompare(b.date));

  container.insertAdjacentHTML('beforeend', `
    <p>Log every enquiry and viewing on a listing, with the buyer's feedback, then send the owner an activity report.</p>
    <form class="section" novalidate>
      <div class="field">
        <label for="listing-pick">Open a listing's log</label>
        <select id="listing-pick">
          <option value="">Choose a listing</option>
          ${[...listings].sort((a, b) => a.name.localeCompare(b.name)).map((l) => `<option value="${escapeHTML(l.id)}">${escapeHTML(l.name)} (${escapeHTML(l.firm)}${l.year ? `, ${l.year}` : ''})</option>`).join('')}
        </select>
      </div>
    </form>

    <section class="section" aria-labelledby="upcoming-heading">
      <h2 id="upcoming-heading">Viewings coming up</h2>
      ${upcoming.length ? `<ul class="plain-list">${upcoming.map((e) => {
        const l = listings.find((x) => x.id === e.listingId);
        return `<li><span class="num">${formatDate(e.date)}${e.time ? ` ${e.time}` : ''}</span> <a href="#/viewings/${escapeHTML(e.listingId)}">${escapeHTML(l?.name ?? 'Listing')}</a> with ${escapeHTML(e.who)}${e.broker ? ` (${escapeHTML(e.broker)})` : ''}</li>`;
      }).join('')}</ul>` : '<p class="muted">None booked.</p>'}
    </section>

    ${withActivity.length ? `
      <div class="table-wrap">
        <table class="data-table">
          <caption class="visually-hidden">Listings with activity</caption>
          <thead><tr><th scope="col">Listing</th><th scope="col" class="num">Enquiries</th><th scope="col" class="num">Viewings held</th><th scope="col">Last activity</th></tr></thead>
          <tbody>
            ${withActivity.map((l) => {
              const mine = entries.filter((e) => e.listingId === l.id);
              const last = mine.filter((e) => e.date <= today).sort((a, b) => b.date.localeCompare(a.date))[0];
              return `<tr>
                <th scope="row" data-label="Listing"><a href="#/viewings/${escapeHTML(l.id)}">${escapeHTML(l.name)}</a><span class="cell-sub">${escapeHTML(l.firm)}</span></th>
                <td data-label="Enquiries" class="num">${mine.filter((e) => e.type === 'enquiry').length}</td>
                <td data-label="Viewings held" class="num">${mine.filter((e) => e.type === 'viewing' && !isBooked(e, today)).length}</td>
                <td data-label="Last activity">${last ? formatDate(last.date) : '-'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : '<p class="placeholder">No activity logged yet.</p>'}
  `);

  container.querySelector('#listing-pick').addEventListener('change', (event) => {
    if (event.target.value) location.hash = `#/viewings/${event.target.value}`;
  });
}

// ---------------------------------------------------------------------------
// One listing
// ---------------------------------------------------------------------------

function renderListing(container, listing) {
  const today = todayISO();
  let editingId = null;
  const mine = () => getCollection(COLLECTION).filter((e) => e.listingId === listing.id);
  const periods = reportPeriods(listing, today);
  if (!periods.some((p) => p.id === periodId)) periodId = '30';

  container.insertAdjacentHTML('beforeend', `
    <div class="no-print">
      <p><a href="#/viewings">Back to viewings</a> · <a href="#/listings/${escapeHTML(listing.id)}">Open the listing</a></p>
      ${mine().some((e) => e.example) ? '<p class="notice">The activity here is a fictional example on a real listing. These enquiries and viewings did not happen.</p>' : ''}

      <form class="section" id="activity-form" novalidate>
        <h2 id="form-heading">Log an enquiry or viewing</h2>
        <div class="form-grid form-grid--3">
          <div class="field">
            <label for="type">Type</label>
            <select id="type" name="type">${ACTIVITY_TYPES.map((t) => `<option value="${t.id}">${t.label}</option>`).join('')}</select>
          </div>
          ${field('date', 'Date', 'date', today)}
          ${field('time', 'Time (optional)', 'time')}
          ${field('who', 'Buyer (reference or name)')}
          ${field('broker', 'Through which broker (or Direct)')}
          <div class="field" data-viewing-only>
            <label for="interest">Interest after the viewing</label>
            <select id="interest" name="interest"><option value="">Not recorded yet</option>${INTEREST_LEVELS.map((l) => `<option>${l}</option>`).join('')}</select>
          </div>
        </div>
        <div class="field" data-viewing-only>
          <label for="feedback">Feedback from the viewing</label>
          <textarea id="feedback" name="feedback" rows="3"></textarea>
        </div>
        <p class="status-message" role="status" id="activity-status"></p>
        <div class="button-row">
          <button type="submit" class="button" id="save-activity">Add to the log</button>
          <button type="button" class="button button--secondary" id="cancel-edit" hidden>Cancel editing</button>
        </div>
      </form>

      <section class="section" aria-labelledby="log-heading">
        <h2 id="log-heading">Activity log</h2>
        <div id="log"></div>
      </section>

      <form class="section" id="report-form" novalidate>
        <h2>Owner activity report</h2>
        <div class="form-grid">
          <div class="field">
            <label for="period">Period</label>
            <select id="period">${periods.map((p) => `<option value="${p.id}" ${p.id === periodId ? 'selected' : ''}>${escapeHTML(p.label)}</option>`).join('')}</select>
          </div>
        </div>
        <div class="button-row"><button type="button" class="button button--small" id="print">Print or save as PDF</button></div>
      </form>
    </div>
    <article id="report" class="proposal-doc owner-report" aria-label="Owner activity report"></article>
  `);

  const form = container.querySelector('#activity-form');
  const showViewingFields = () => {
    for (const el of form.querySelectorAll('[data-viewing-only]')) el.hidden = form.elements.type.value !== 'viewing';
  };
  form.elements.type.addEventListener('change', showViewingFields);
  showViewingFields();

  const drawLog = () => {
    const entries = mine().sort((a, b) => b.date.localeCompare(a.date) || String(b.time).localeCompare(String(a.time)));
    container.querySelector('#log').innerHTML = entries.length ? `
      <div class="table-wrap">
        <table class="data-table data-table--wide">
          <caption class="visually-hidden">Enquiries and viewings, newest first</caption>
          <thead><tr><th scope="col">Date</th><th scope="col">Type</th><th scope="col">Buyer</th><th scope="col">Interest and feedback</th><th scope="col">Actions</th></tr></thead>
          <tbody>
            ${entries.map((e) => `<tr>
              <th scope="row" data-label="Date">${formatDate(e.date)}${e.time ? ` <span class="muted">${e.time}</span>` : ''}</th>
              <td data-label="Type"><span>${e.type === 'viewing' ? (isBooked(e, today) ? '<span class="pill pill--amber">Viewing booked</span>' : 'Viewing') : 'Enquiry'}</span></td>
              <td data-label="Buyer"><span>${escapeHTML(e.who)}${e.broker ? `<span class="cell-sub">${escapeHTML(e.broker)}</span>` : ''}</span></td>
              <td data-label="Interest and feedback"><span>${e.interest ? `<span class="pill pill--${interestTone(e.interest)}">${e.interest}</span>` : ''}${e.feedback ? `<span class="cell-sub feedback-text">${escapeHTML(e.feedback)}</span>` : (e.type === 'viewing' && !isBooked(e, today) ? '<span class="cell-sub">No feedback yet</span>' : '')}</span></td>
              <td data-label="Actions"><span class="button-row">
                <button type="button" class="button button--secondary button--small" data-edit="${escapeHTML(e.id)}">Edit<span class="visually-hidden"> ${escapeHTML(e.who)} on ${formatDate(e.date)}</span></button>
                <button type="button" class="button button--danger button--small" data-delete="${escapeHTML(e.id)}">Delete<span class="visually-hidden"> ${escapeHTML(e.who)} on ${formatDate(e.date)}</span></button>
              </span></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` : '<p class="placeholder">Nothing logged yet.</p>';
  };

  const drawReport = () => {
    const period = periods.find((p) => p.id === periodId);
    const r = activityReport({ listing, entries: getCollection(COLLECTION), from: period.from, to: period.to, today });
    container.querySelector('#report').innerHTML = reportHTML(listing, period, r, today);
  };

  const resetForm = () => {
    editingId = null;
    form.reset();
    form.elements.date.value = today;
    showViewingFields();
    container.querySelector('#form-heading').textContent = 'Log an enquiry or viewing';
    container.querySelector('#save-activity').textContent = 'Add to the log';
    container.querySelector('#cancel-edit').hidden = true;
  };
  container.querySelector('#cancel-edit').addEventListener('click', resetForm);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = Object.fromEntries(new FormData(form));
    const result = validateActivity(input, today);
    for (const el of form.querySelectorAll('.field-error')) el.textContent = '';
    for (const el of form.querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
    if (!result.ok) {
      let first = null;
      for (const [name, message] of Object.entries(result.errors)) {
        form.elements[name].setAttribute('aria-invalid', 'true');
        const errorEl = form.querySelector(`#${name}-error`);
        if (errorEl) errorEl.textContent = message;
        else container.querySelector('#activity-status').textContent = message;
        first ??= form.elements[name];
      }
      first.focus();
      return;
    }
    const isViewing = input.type === 'viewing';
    const record = {
      listingId: listing.id, type: input.type, date: input.date, time: input.time || '',
      who: input.who.trim(), broker: input.broker.trim(),
      interest: isViewing ? input.interest : '', feedback: isViewing ? input.feedback.trim() : '',
    };
    const all = getCollection(COLLECTION);
    if (editingId) {
      saveCollection(COLLECTION, all.map((e) => (e.id === editingId ? { id: e.id, ...(e.example ? { example: true } : {}), ...record } : e)));
    } else {
      saveCollection(COLLECTION, [...all, { id: `act-${Date.now().toString(36)}`, ...record }]);
    }
    container.querySelector('#activity-status').textContent = editingId ? 'Saved.' : 'Added to the log.';
    resetForm();
    drawLog();
    drawReport();
  });

  container.querySelector('#log').addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const all = getCollection(COLLECTION);
    const id = button.dataset.edit || button.dataset.delete;
    const entry = all.find((e) => e.id === id);
    if (!entry) return;
    if (button.dataset.delete) {
      if (!window.confirm(`Delete the ${entry.type} with ${entry.who} on ${formatDate(entry.date)}?`)) return;
      saveCollection(COLLECTION, all.filter((e) => e.id !== id));
      container.querySelector('#activity-status').textContent = 'Deleted.';
      drawLog();
      drawReport();
      return;
    }
    editingId = id;
    for (const name of ['type', 'date', 'time', 'who', 'broker', 'interest', 'feedback']) form.elements[name].value = entry[name] ?? '';
    showViewingFields();
    container.querySelector('#form-heading').textContent = 'Edit entry';
    container.querySelector('#save-activity').textContent = 'Save changes';
    container.querySelector('#cancel-edit').hidden = false;
    form.elements.type.focus();
  });

  container.querySelector('#period').addEventListener('change', (event) => {
    periodId = event.target.value;
    drawReport();
  });
  container.querySelector('#print').addEventListener('click', () => window.print());

  drawLog();
  drawReport();
}

// ---------------------------------------------------------------------------
// The owner activity report
// ---------------------------------------------------------------------------

function reportHTML(listing, period, r, today) {
  const dom = daysOnMarket(listing, today);
  const summary = priceSummary(listing.priceHistory);
  const example = getCollection(COLLECTION).some((e) => e.listingId === listing.id && e.example);
  const c = r.counts;

  return `
    <header class="proposal-head">
      <p class="proposal-kicker">Owner activity report</p>
      <h2>${escapeHTML(listing.name)}</h2>
      <dl class="proposal-facts">
        <div><dt>Period</dt><dd>${period.from ? `${formatDate(period.from)} to ${formatDate(period.to)}` : `All activity to ${formatDate(period.to)}`}</dd></div>
        <div><dt>Status</dt><dd><span class="pill pill--${statusTone(listing.status)}">${listing.status}</span></dd></div>
        <div><dt>Asking price</dt><dd>${listing.askingPrice != null && listing.currency ? formatMoney(listing.askingPrice, listing.currency) : 'Not stated'}</dd></div>
        <div><dt>Days on market</dt><dd>${dom ?? 'Not recorded'}</dd></div>
      </dl>
      ${example ? '<p class="proposal-example">Example report: the activity is fictional.</p>' : ''}
    </header>

    <div class="report-figures">
      <div><span class="figure-label">Enquiries</span><span class="figure num">${c.enquiries}</span></div>
      <div><span class="figure-label">Viewings held</span><span class="figure num">${c.viewingsHeld}</span></div>
      <div><span class="figure-label">Viewings booked</span><span class="figure num">${c.viewingsBooked}</span></div>
      <div><span class="figure-label">Price changes in the period</span><span class="figure num">${r.priceChanges.length}</span></div>
    </div>

    ${c.viewingsHeld ? `
      <section>
        <h3>Interest after viewings</h3>
        <p class="pill-row">${Object.entries(r.interest).filter(([, n]) => n).map(([level, n]) => `<span class="pill pill--${interestTone(level)}">${level}: ${n}</span>`).join('')}</p>
      </section>` : ''}

    <section>
      <h3>Buyer feedback</h3>
      ${r.feedback.length ? `<ul class="feedback-list">${r.feedback.map((f) => `<li><strong>${formatDate(f.date)}, ${escapeHTML(f.who)}${f.broker ? ` (${escapeHTML(f.broker)})` : ''}${f.interest ? `, ${f.interest === 'Not interested' ? 'not interested' : `interest ${escapeHTML(f.interest.toLowerCase())}`}` : ''}:</strong> ${escapeHTML(f.feedback)}</li>`).join('')}</ul>` : '<p class="muted">No feedback recorded in this period.</p>'}
      ${r.heldWithoutFeedback ? `<p class="hint no-print">${r.heldWithoutFeedback} viewing${r.heldWithoutFeedback > 1 ? 's have' : ' has'} no feedback yet. Chase the broker.</p>` : ''}
    </section>

    ${r.upcoming.length ? `
      <section>
        <h3>Coming up</h3>
        <ul class="plain-list">${r.upcoming.map((e) => `<li>Viewing on ${formatDate(e.date)}${e.time ? ` at ${e.time}` : ''}${e.broker ? ` (${escapeHTML(e.broker)})` : ''}</li>`).join('')}</ul>
      </section>` : ''}

    <section>
      <h3>Asking price</h3>
      ${r.priceChanges.length
        ? `<ul class="plain-list">${r.priceChanges.map((p) => `<li>${formatDate(p.date)}: ${formatMoney(p.previous, listing.currency)} to ${formatMoney(p.price, listing.currency)}${p.note ? ` (${escapeHTML(p.note)})` : ''}</li>`).join('')}</ul>`
        : `<p>No change in this period.${summary && summary.lastChanged ? ` Last changed ${formatDate(summary.lastChanged)}.` : ''}</p>`}
    </section>

    <section class="proposal-notes">
      <h3>Notes</h3>
      <ul>
        <li>Buyers are referred to by reference to protect their privacy.</li>
        <li>Feedback is as reported by the buyer or their broker after each viewing.</li>
        <li>Prepared ${formatDate(today)}.</li>
      </ul>
    </section>`;
}

function field(name, label, type = 'text', value = '') {
  return `
    <div class="field">
      <label for="${name}">${escapeHTML(label)}</label>
      <input id="${name}" name="${name}" type="${type}" value="${escapeHTML(value)}" aria-describedby="${name}-error">
      <p class="field-error" id="${name}-error"></p>
    </div>`;
}
