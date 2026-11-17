// Preference sheets screen.
//
//   #/preferences               which charters have a sheet
//   #/preferences/<enquiryId>   the sheet, and the captain's handover below
//
// The sheet saves as you type. The handover underneath updates with it and
// prints on its own (the form is hidden when printing).

import { getCollection, saveCollection } from '../store.js';
import { ACTIVITIES, emptySheet, sheetWarnings, handoverSummary } from '../preferences.js';
import { formatDateRange, formatDate, todayISO } from '../calc/dates.js';
import { escapeHTML } from './html.js';

const COLLECTION = 'preferences';
const isActive = (e) => !['Lost', 'Completed', 'New', 'Proposal sent'].includes(e.status);

export function render(container, param, heading) {
  if (!param) return renderList(container);
  const enquiry = getCollection('enquiries').find((e) => e.id === param);
  if (!enquiry) {
    heading.textContent = 'Enquiry not found';
    container.insertAdjacentHTML('beforeend', '<p><a href="#/preferences">Back to preference sheets</a></p>');
    return;
  }
  heading.textContent = `Preference sheet: ${enquiry.clientName}`;
  heading.classList.add('no-print');
  renderSheet(container, enquiry);
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

function renderList(container) {
  const enquiries = getCollection('enquiries').filter(isActive).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const sheets = getCollection(COLLECTION);

  container.insertAdjacentHTML('beforeend', `
    <p>Guest details for the crew: dietary needs, allergies, activities, arrival and special occasions. Each sheet produces a one-page handover for the captain.</p>
    ${enquiries.length ? `
      <div class="table-wrap">
        <table class="data-table">
          <caption class="visually-hidden">Preference sheets</caption>
          <thead><tr><th scope="col">Client</th><th scope="col">Charter</th><th scope="col">Status</th><th scope="col">Sheet</th></tr></thead>
          <tbody>
            ${enquiries.map((e) => {
              const sheet = sheets.find((s) => s.enquiryId === e.id);
              const allergies = sheet ? sheet.guests.filter((g) => g.allergies.trim()).length : 0;
              return `<tr>
                <th scope="row" data-label="Client"><a href="#/preferences/${escapeHTML(e.id)}">${escapeHTML(e.clientName)}</a></th>
                <td data-label="Charter">${formatDateRange(e.startDate, e.endDate)}</td>
                <td data-label="Status"><span class="pill pill--neutral">${escapeHTML(e.status)}</span></td>
                <td data-label="Sheet"><span>${sheet
                  ? `${sheet.guests.filter((g) => g.name.trim()).length} of ${sheet.guests.length} guests named${allergies ? ` <span class="pill pill--red">${allergies} with allergies</span>` : ''}`
                  : '<span class="muted">Not started</span>'}</span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : '<p class="placeholder">No charters from "Option held" onwards yet.</p>'}
  `);
}

// ---------------------------------------------------------------------------
// One sheet
// ---------------------------------------------------------------------------

function renderSheet(container, enquiry) {
  let sheet = getCollection(COLLECTION).find((s) => s.enquiryId === enquiry.id)
    ?? { id: `preferences-${enquiry.id}`, ...(enquiry.example ? { example: true } : {}), ...emptySheet(enquiry) };
  const contract = getCollection('contracts').find((c) => c.enquiryId === enquiry.id);
  const yacht = contract && getCollection('yachts').find((y) => y.id === contract.yachtId);

  container.insertAdjacentHTML('beforeend', `
    <div class="no-print">
      <p><a href="#/preferences">Back to preference sheets</a> · <a href="#/contracts/${escapeHTML(enquiry.id)}">Contract and payments</a></p>
      <p class="muted">${formatDateRange(enquiry.startDate, enquiry.endDate)} · ${enquiry.guests} guests${yacht ? ` · ${escapeHTML(yacht.name)}` : ''}</p>
      ${enquiry.example ? '<p class="notice">This is a fictional example. Every guest name is made up.</p>' : ''}
      ${contract && !contract.checklist?.preferenceSheet ? `<p class="hint">When the sheet is complete, tick "Preference sheet received" on the <a href="#/contracts/${escapeHTML(enquiry.id)}">contract checklist</a>.</p>` : ''}

      <form id="pref-form" novalidate>
        <fieldset class="section">
          <legend>Guests</legend>
          <p class="hint">Age is optional; under 18 counts as a child. Allergies are shown first and highlighted on the captain's handover.</p>
          <div id="guest-rows"></div>
          <div class="button-row">
            <button type="button" class="button button--secondary button--small" id="add-guest">Add a guest</button>
          </div>
        </fieldset>

        <fieldset class="section">
          <legend>Arrival</legend>
          <div class="form-grid form-grid--3">
            ${field('arrival-date', 'Date', sheet.arrival.date, 'date')}
            ${field('arrival-time', 'Time', sheet.arrival.time, 'time')}
            ${field('arrival-place', 'Place (port, marina or airport)', sheet.arrival.place)}
          </div>
        </fieldset>

        <fieldset class="section">
          <legend>Activities</legend>
          <div class="tick-grid">
            ${ACTIVITIES.map((a, i) => `
              <div class="field field--tick">
                <input type="checkbox" id="activity-${i}" name="activity" value="${escapeHTML(a)}" ${sheet.activities.includes(a) ? 'checked' : ''}>
                <label for="activity-${i}">${escapeHTML(a)}</label>
              </div>`).join('')}
          </div>
          ${field('otherActivities', 'Anything else', sheet.otherActivities)}
        </fieldset>

        <fieldset class="section">
          <legend>Special occasions</legend>
          <div id="occasion-rows"></div>
          <div class="button-row">
            <button type="button" class="button button--secondary button--small" id="add-occasion">Add an occasion</button>
          </div>
        </fieldset>

        <fieldset class="section">
          <legend>Notes for the crew</legend>
          <div class="field">
            <label for="notes">Notes</label>
            <textarea id="notes" name="notes" rows="4">${escapeHTML(sheet.notes)}</textarea>
          </div>
        </fieldset>
        <p class="status-message" role="status" id="saved-status"></p>
      </form>

      <div id="warnings"></div>
      <div class="button-row"><button type="button" class="button" id="print">Print the captain's handover</button></div>
    </div>

    <article id="handover" class="proposal-doc handover" aria-label="Captain's handover"></article>
  `);

  const form = container.querySelector('#pref-form');
  const guestRows = form.querySelector('#guest-rows');
  const occasionRows = form.querySelector('#occasion-rows');

  const drawGuests = () => {
    guestRows.innerHTML = sheet.guests.map((g, i) => `
      <div class="guest-row" data-guest="${i}">
        <p class="guest-row__title">Guest ${i + 1}</p>
        <div class="guest-row__fields">
          ${field(`guest-${i}-name`, 'Name', g.name)}
          ${field(`guest-${i}-age`, 'Age', g.age, 'text', 'inputmode="numeric" class="age-input"')}
          ${field(`guest-${i}-dietary`, 'Dietary needs', g.dietary)}
          ${field(`guest-${i}-allergies`, 'Allergies', g.allergies)}
        </div>
        <button type="button" class="button button--secondary button--small" data-remove-guest="${i}">Remove<span class="visually-hidden"> guest ${i + 1}</span></button>
      </div>`).join('');
  };

  const drawOccasions = () => {
    occasionRows.innerHTML = sheet.occasions.length ? sheet.occasions.map((o, i) => `
      <div class="guest-row" data-occasion="${i}">
        <div class="guest-row__fields">
          ${field(`occasion-${i}-date`, 'Date', o.date, 'date')}
          ${field(`occasion-${i}-occasion`, 'Occasion', o.occasion)}
          ${field(`occasion-${i}-guest`, 'For', o.guest)}
        </div>
        <button type="button" class="button button--secondary button--small" data-remove-occasion="${i}">Remove<span class="visually-hidden"> occasion ${i + 1}</span></button>
      </div>`).join('') : '<p class="muted">None yet. Birthdays and anniversaries let the crew plan a cake or a surprise.</p>';
  };

  // Read the whole form into the sheet.
  const readForm = () => {
    sheet = {
      ...sheet,
      guests: sheet.guests.map((_, i) => ({
        name: form.elements[`guest-${i}-name`].value,
        age: form.elements[`guest-${i}-age`].value.trim(),
        dietary: form.elements[`guest-${i}-dietary`].value,
        allergies: form.elements[`guest-${i}-allergies`].value,
      })),
      arrival: {
        date: form.elements['arrival-date'].value,
        time: form.elements['arrival-time'].value,
        place: form.elements['arrival-place'].value,
      },
      activities: [...form.querySelectorAll('input[name="activity"]:checked')].map((b) => b.value),
      otherActivities: form.elements.otherActivities.value,
      occasions: sheet.occasions.map((_, i) => ({
        date: form.elements[`occasion-${i}-date`].value,
        occasion: form.elements[`occasion-${i}-occasion`].value,
        guest: form.elements[`occasion-${i}-guest`].value,
      })),
      notes: form.elements.notes.value,
    };
  };

  const saveAndRefresh = () => {
    const list = getCollection(COLLECTION).filter((s) => s.id !== sheet.id);
    saveCollection(COLLECTION, [...list, sheet]);
    container.querySelector('#saved-status').textContent = 'Saved.';
    const warnings = sheetWarnings(sheet, enquiry);
    container.querySelector('#warnings').innerHTML = warnings.length
      ? `<div class="notice notice--warn"><p><strong>To check:</strong></p><ul>${warnings.map((w) => `<li>${escapeHTML(w)}</li>`).join('')}</ul></div>`
      : '';
    container.querySelector('#handover').innerHTML = handoverHTML(handoverSummary(sheet, enquiry), yacht, enquiry);
  };

  form.addEventListener('input', () => { readForm(); saveAndRefresh(); });
  form.addEventListener('change', () => { readForm(); saveAndRefresh(); });

  form.addEventListener('click', (event) => {
    const removeGuest = event.target.closest('[data-remove-guest]');
    const removeOccasion = event.target.closest('[data-remove-occasion]');
    if (!removeGuest && !removeOccasion && !['add-guest', 'add-occasion'].includes(event.target.id)) return;
    readForm();
    if (event.target.id === 'add-guest') sheet.guests.push({ name: '', age: '', dietary: '', allergies: '' });
    if (event.target.id === 'add-occasion') sheet.occasions.push({ date: enquiry.startDate, occasion: '', guest: '' });
    if (removeGuest) sheet.guests.splice(Number(removeGuest.dataset.removeGuest), 1);
    if (removeOccasion) sheet.occasions.splice(Number(removeOccasion.dataset.removeOccasion), 1);
    drawGuests();
    drawOccasions();
    saveAndRefresh();
    if (event.target.id === 'add-guest') form.elements[`guest-${sheet.guests.length - 1}-name`].focus();
    if (event.target.id === 'add-occasion') form.elements[`occasion-${sheet.occasions.length - 1}-occasion`].focus();
  });

  container.querySelector('#print').addEventListener('click', () => window.print());

  drawGuests();
  drawOccasions();
  // Show the handover straight away, without saving an untouched blank sheet.
  container.querySelector('#handover').innerHTML = handoverHTML(handoverSummary(sheet, enquiry), yacht, enquiry);
  const warnings = sheetWarnings(sheet, enquiry);
  container.querySelector('#warnings').innerHTML = warnings.length
    ? `<div class="notice notice--warn"><p><strong>To check:</strong></p><ul>${warnings.map((w) => `<li>${escapeHTML(w)}</li>`).join('')}</ul></div>`
    : '';
}

// ---------------------------------------------------------------------------
// The captain's handover (one printable page)
// ---------------------------------------------------------------------------

function handoverHTML(h, yacht, enquiry) {
  return `
    <header class="proposal-head">
      <p class="proposal-kicker">Captain's handover</p>
      <h2>${escapeHTML(h.clientName)}${yacht ? ` <span class="muted">on ${escapeHTML(yacht.name)}</span>` : ''}</h2>
      <dl class="proposal-facts">
        <div><dt>Embark</dt><dd>${escapeHTML(h.dates.start)}</dd></div>
        <div><dt>Disembark</dt><dd>${escapeHTML(h.dates.end)}</dd></div>
        <div><dt>Guests</dt><dd>${h.guestCount.total} (${h.guestCount.adults} adults, ${h.guestCount.children} children)</dd></div>
        <div><dt>Arrival</dt><dd>${escapeHTML(h.arrival.text)}</dd></div>
      </dl>
      ${enquiry.example ? '<p class="proposal-example">Example for fictional guests.</p>' : ''}
    </header>

    <section class="handover-alert" aria-labelledby="allergies-heading">
      <h3 id="allergies-heading">Allergies</h3>
      ${h.allergies.length
        ? `<ul>${h.allergies.map((a) => `<li><strong>${escapeHTML(a.guest)}:</strong> ${escapeHTML(a.allergy)}</li>`).join('')}</ul>`
        : '<p>None recorded. Confirm with the guests on arrival.</p>'}
    </section>

    <div class="handover-columns">
      <section>
        <h3>Dietary needs</h3>
        ${h.dietary.length ? `<ul>${h.dietary.map((d) => `<li><strong>${escapeHTML(d.guest)}:</strong> ${escapeHTML(d.needs)}</li>`).join('')}</ul>` : '<p class="muted">None recorded.</p>'}
      </section>
      <section>
        <h3>Special occasions</h3>
        ${h.occasions.length ? `<ul>${h.occasions.map((o) => `<li><strong>${o.day ? `Day ${o.day}, ` : ''}${escapeHTML(o.dateText)}:</strong> ${escapeHTML(o.occasion)}</li>`).join('')}</ul>` : '<p class="muted">None recorded.</p>'}
      </section>
      <section>
        <h3>Activities</h3>
        ${h.activities.length ? `<p>${h.activities.map(escapeHTML).join(', ')}.</p>` : '<p class="muted">None recorded.</p>'}
      </section>
    </div>

    <section>
      <h3>Guest list</h3>
      <table class="handover-table">
        <caption class="visually-hidden">Guests</caption>
        <thead><tr><th scope="col">Guest</th><th scope="col">Age</th><th scope="col">Dietary</th><th scope="col">Allergies</th></tr></thead>
        <tbody>
          ${h.guests.map((g) => `<tr>
            <th scope="row">${escapeHTML(g.name)}</th>
            <td>${escapeHTML(g.ageText)}</td>
            <td>${escapeHTML(g.dietary || '-')}</td>
            <td${g.allergies ? ' class="allergy-cell"' : ''}>${escapeHTML(g.allergies || '-')}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </section>

    ${h.notes ? `<section><h3>Notes</h3><p>${escapeHTML(h.notes)}</p></section>` : ''}
    <p class="proposal-example">Prepared ${formatDate(todayISO())}. Confirm allergies and dietary needs with each guest on board.</p>`;
}

function field(name, label, value, type = 'text', extra = '') {
  return `
    <div class="field">
      <label for="${name}">${escapeHTML(label)}</label>
      <input id="${name}" name="${name}" type="${type}" value="${escapeHTML(value ?? '')}" ${extra}>
    </div>`;
}
