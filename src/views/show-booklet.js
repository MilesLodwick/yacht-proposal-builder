// Show booklet screen.
//
//   #/show-booklet         booklets, and a button to start one
//   #/show-booklet/<id>    choose the show and yachts; the pages appear below
//
// Changes save as you make them. Printing gives a cover page, then one
// page per yacht.

import { getCollection, saveCollection, getSettings } from '../store.js';
import { bookletPage } from '../booklet.js';
import { firms } from '../fleet.js';
import { formatDate, todayISO } from '../calc/dates.js';
import { escapeHTML } from './html.js';

const COLLECTION = 'booklets';
const picker = { firm: '', search: '' };

const staleDays = () => getSettings().find((s) => s.id === 'alerts.staleListingDays')?.value ?? 90;

export function render(container, param, heading) {
  if (!param) return renderList(container);
  const booklet = getCollection(COLLECTION).find((b) => b.id === param);
  if (!booklet) {
    heading.textContent = 'Booklet not found';
    container.insertAdjacentHTML('beforeend', '<p><a href="#/show-booklet">Back to show booklets</a></p>');
    return;
  }
  heading.textContent = `Show booklet: ${booklet.showName || 'untitled'}`;
  heading.classList.add('no-print');
  renderBooklet(container, booklet, heading);
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

function renderList(container) {
  const booklets = getCollection(COLLECTION);
  container.insertAdjacentHTML('beforeend', `
    <p>A printed page per yacht for brokers to carry at a boat show: specs, indicative rates, bases and which dates are already held. Client names are never shown.</p>
    <div class="toolbar"><button type="button" class="button" id="new-booklet">New booklet</button></div>
    ${booklets.length ? `
      <div class="table-wrap">
        <table class="data-table">
          <caption class="visually-hidden">Show booklets</caption>
          <thead><tr><th scope="col">Show</th><th scope="col">Date</th><th scope="col" class="num">Yachts</th></tr></thead>
          <tbody>
            ${booklets.map((b) => `<tr>
              <th scope="row" data-label="Show"><a href="#/show-booklet/${escapeHTML(b.id)}">${escapeHTML(b.showName || 'Untitled show')}</a></th>
              <td data-label="Date">${b.showDate ? formatDate(b.showDate) : 'Not set'}</td>
              <td data-label="Yachts" class="num">${b.yachtIds.length}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` : '<p class="placeholder">No booklets yet.</p>'}
  `);
  container.querySelector('#new-booklet').addEventListener('click', () => {
    const booklet = { id: `booklet-${Date.now().toString(36)}`, showName: '', showDate: null, yachtIds: [], notes: '' };
    saveCollection(COLLECTION, [...getCollection(COLLECTION), booklet]);
    location.hash = `#/show-booklet/${booklet.id}`;
  });
}

// ---------------------------------------------------------------------------
// One booklet
// ---------------------------------------------------------------------------

function renderBooklet(container, booklet, heading) {
  const yachts = getCollection('yachts');
  const entries = getCollection('availability');
  let current = booklet;

  const save = () => {
    saveCollection(COLLECTION, getCollection(COLLECTION).map((b) => (b.id === current.id ? current : b)));
    heading.textContent = `Show booklet: ${current.showName || 'untitled'}`;
  };

  container.insertAdjacentHTML('beforeend', `
    <div class="no-print">
      <p><a href="#/show-booklet">Back to show booklets</a></p>
      <form class="section" id="booklet-form" novalidate>
        <h2>The show</h2>
        <div class="form-grid">
          <div class="field">
            <label for="showName">Show name</label>
            <input id="showName" name="showName" value="${escapeHTML(current.showName)}">
          </div>
          <div class="field">
            <label for="showDate">Show date (optional)</label>
            <input id="showDate" name="showDate" type="date" value="${current.showDate ?? ''}">
          </div>
        </div>
        <div class="field">
          <label for="notes">Note for the cover page (optional)</label>
          <input id="notes" name="notes" value="${escapeHTML(current.notes ?? '')}">
        </div>

        <h2>Yachts in the booklet <span class="muted" id="chosen-count"></span></h2>
        <ul class="chosen-list" id="chosen"></ul>

        <div class="form-grid">
          <div class="field">
            <label for="pick-firm">Find yachts by firm</label>
            <select id="pick-firm">
              <option value="">All firms</option>
              ${firms(yachts).map((f) => `<option ${f === picker.firm ? 'selected' : ''}>${escapeHTML(f)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="pick-search">or by name</label>
            <input id="pick-search" type="search" value="${escapeHTML(picker.search)}">
          </div>
        </div>
        <fieldset class="pick-box">
          <legend class="visually-hidden">Tick yachts to add them</legend>
          <div id="pick-list"></div>
        </fieldset>
        <p class="status-message" role="status" id="booklet-status"></p>
        <div class="button-row">
          <button type="button" class="button" id="print">Print the booklet</button>
          <button type="button" class="button button--danger" id="delete-booklet">Delete booklet</button>
        </div>
      </form>
      <div id="warnings"></div>
    </div>
    <div id="pages" class="booklet-pages"></div>
  `);

  const form = container.querySelector('#booklet-form');

  const drawChosen = () => {
    container.querySelector('#chosen-count').textContent = `(${current.yachtIds.length})`;
    container.querySelector('#chosen').innerHTML = current.yachtIds.length
      ? current.yachtIds.map((id, i) => {
        const y = yachts.find((x) => x.id === id);
        return `<li><span>${i + 1}. ${escapeHTML(y?.name ?? id)} <span class="muted">${escapeHTML(y?.firm ?? '')}</span></span>
          <span class="button-row">
            <button type="button" class="button button--secondary button--small" data-up="${i}" ${i === 0 ? 'disabled' : ''}>Up<span class="visually-hidden"> ${escapeHTML(y?.name ?? '')}</span></button>
            <button type="button" class="button button--secondary button--small" data-remove="${escapeHTML(id)}">Remove<span class="visually-hidden"> ${escapeHTML(y?.name ?? '')}</span></button>
          </span></li>`;
      }).join('')
      : '<li class="muted">None yet. Tick yachts below.</li>';
  };

  const drawPicker = () => {
    const matches = yachts
      .filter((y) => (!picker.firm || y.firm === picker.firm) && (!picker.search || y.name.toLowerCase().includes(picker.search.trim().toLowerCase())))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 60);
    container.querySelector('#pick-list').innerHTML = matches.map((y) => `
      <div class="field field--tick">
        <input type="checkbox" id="pick-${escapeHTML(y.id)}" value="${escapeHTML(y.id)}" ${current.yachtIds.includes(y.id) ? 'checked' : ''}>
        <label for="pick-${escapeHTML(y.id)}">${escapeHTML(y.name)} <span class="muted">${escapeHTML(y.firm)}${y.lengthM ? `, ${y.lengthM} m` : ''}</span></label>
      </div>`).join('') || '<p class="muted">No yachts match.</p>';
  };

  const drawPages = () => {
    const today = todayISO();
    const pages = current.yachtIds
      .map((id) => yachts.find((y) => y.id === id))
      .filter(Boolean)
      .map((yacht) => bookletPage({ yacht, entries: entries.filter((e) => e.yachtId === yacht.id), today, staleDays: staleDays() }));
    const warnings = pages.flatMap((p) => p.warnings);
    container.querySelector('#warnings').innerHTML = warnings.length
      ? `<div class="notice notice--warn"><p><strong>Check before printing:</strong></p><ul>${warnings.map((w) => `<li>${escapeHTML(w)}</li>`).join('')}</ul></div>`
      : '';
    container.querySelector('#pages').innerHTML = pages.length ? `
      ${coverHTML(current, pages)}
      ${pages.map(pageHTML).join('')}` : '';
  };

  form.addEventListener('input', (event) => {
    if (['showName', 'showDate', 'notes'].includes(event.target.name)) {
      current = { ...current, showName: form.elements.showName.value, showDate: form.elements.showDate.value || null, notes: form.elements.notes.value };
      save();
      drawPages();
    }
    if (event.target.id === 'pick-firm' || event.target.id === 'pick-search') {
      picker.firm = container.querySelector('#pick-firm').value;
      picker.search = container.querySelector('#pick-search').value;
      drawPicker();
    }
  });

  // Ticking a yacht adds it; unticking removes it.
  container.querySelector('#pick-list').addEventListener('change', (event) => {
    const id = event.target.value;
    current = {
      ...current,
      yachtIds: event.target.checked ? [...current.yachtIds, id] : current.yachtIds.filter((x) => x !== id),
    };
    save();
    drawChosen();
    drawPages();
    container.querySelector('#booklet-status').textContent = event.target.checked ? 'Added.' : 'Removed.';
  });

  container.querySelector('#chosen').addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const ids = [...current.yachtIds];
    if (button.dataset.remove) {
      current = { ...current, yachtIds: ids.filter((x) => x !== button.dataset.remove) };
    } else {
      const i = Number(button.dataset.up);
      [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
      current = { ...current, yachtIds: ids };
    }
    save();
    drawChosen();
    drawPicker();
    drawPages();
  });

  container.querySelector('#print').addEventListener('click', () => window.print());
  container.querySelector('#delete-booklet').addEventListener('click', () => {
    if (!window.confirm('Delete this booklet? The yachts themselves are not affected.')) return;
    saveCollection(COLLECTION, getCollection(COLLECTION).filter((b) => b.id !== current.id));
    location.hash = '#/show-booklet';
  });

  drawChosen();
  drawPicker();
  drawPages();
}

// ---------------------------------------------------------------------------
// Printed pages
// ---------------------------------------------------------------------------

function coverHTML(booklet, pages) {
  return `
    <section class="booklet-page booklet-cover" aria-label="Cover">
      <p class="proposal-kicker">Charter yachts</p>
      <h2>${escapeHTML(booklet.showName || 'Boat show')}</h2>
      ${booklet.showDate ? `<p class="booklet-date">${formatDate(booklet.showDate)}</p>` : ''}
      ${booklet.notes ? `<p>${escapeHTML(booklet.notes)}</p>` : ''}
      <ol class="booklet-contents">${pages.map((p) => `<li>${escapeHTML(p.name)} <span class="muted">${p.specs.find(([k]) => k === 'Length')?.[1] ?? ''}${p.specs.find(([k]) => k === 'Guests') ? `, ${p.specs.find(([k]) => k === 'Guests')[1]} guests` : ''}</span></li>`).join('')}</ol>
      <p class="proposal-example">Rates are indicative weekly charter fees from public listings, excluding VAT, APA and delivery, and subject to availability and contract. ${booklet.example ? 'Example booklet: the show is fictional.' : ''}</p>
    </section>`;
}

function pageHTML(p) {
  return `
    <section class="booklet-page" aria-label="${escapeHTML(p.name)}">
      <header class="proposal-head">
        <p class="proposal-kicker">Central agent: ${escapeHTML(p.centralAgent)}</p>
        <h2>${escapeHTML(p.name)}</h2>
      </header>
      <div class="booklet-grid">
        <div>
          <h3>Specifications</h3>
          <dl class="spec-list">${p.specs.map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHTML(v)}</dd></div>`).join('')}</dl>
          <h3>Weekly rate (indicative)</h3>
          ${p.rates.length
            ? `<dl class="spec-list">${p.rates.map((r) => `<div><dt>${r.label}</dt><dd class="num">${escapeHTML(r.amount)}</dd></div>`).join('')}</dl>`
            : '<p>Rate on request.</p>'}
          <p class="muted">Plus VAT where charged, APA and any delivery.</p>
        </div>
        <div>
          <h3>Where</h3>
          ${p.bases.length ? `<p>${p.bases.map(escapeHTML).join('<br>')}</p>` : ''}
          <p>${p.cruisingArea ? `Cruising area: ${escapeHTML(p.cruisingArea)}` : 'Cruising area: ask the central agent.'}</p>
          ${p.crewNotes ? `<h3>Crew</h3><p>${escapeHTML(p.crewNotes)}</p>` : ''}
          <h3>Dates already held</h3>
          <p class="muted">${escapeHTML(p.availabilityWindow)}</p>
          ${p.busy.length
            ? `<dl class="spec-list held-list">${p.busy.map((b) => `<div><dt>${escapeHTML(b.dates)}</dt><dd>${escapeHTML(b.status)}</dd></div>`).join('')}</dl>`
            : '<p>No dates held. Ask for availability.</p>'}
        </div>
      </div>
      <p class="source-line">Source: ${p.sourceUrl ? `<a href="${escapeHTML(p.sourceUrl)}" target="_blank" rel="noopener">${escapeHTML(p.source)}</a>` : escapeHTML(p.source)}, details checked ${escapeHTML(p.checked)}. Availability changes daily: confirm with the central agent before offering dates.</p>
    </section>`;
}
