// Itinerary screen.
//
//   #/itinerary          list of itineraries
//   #/itinerary/new      a new itinerary
//   #/itinerary/<id>     edit one
//
// Day by day: where the yacht goes, how far (nautical miles), and how long
// that takes at the chosen speed. Long days are flagged as you type.

import { getCollection, saveCollection, getSettings } from '../store.js';
import { planItinerary, formatHours, validateItinerary } from '../calc/itinerary.js';
import { charterDays } from '../enquiries.js';
import { formatDate, formatDateRange, addDays } from '../calc/dates.js';
import { escapeHTML } from './html.js';
import { estimateLegNm, portLabel } from '../calc/ports.js';

const COLLECTION = 'itineraries';
let flash = null;

// The port list with each harbour's position, loaded once when an
// itinerary is first opened. Used to estimate the distance of each leg.
let portsPromise = null;
function loadPorts() {
  portsPromise ??= fetch('data/ports.json').then((r) => r.json()).catch(() => ({ ports: [] }));
  return portsPromise;
}

function setting(id) {
  return getSettings().find((s) => s.id === id)?.value;
}

export function render(container, param, heading) {
  if (!param) return renderList(container);
  const saved = param === 'new' ? null : getCollection(COLLECTION).find((i) => i.id === param);
  if (param !== 'new' && !saved) {
    heading.textContent = 'Itinerary not found';
    container.insertAdjacentHTML('beforeend', '<p><a href="#/itinerary">Back to itineraries</a></p>');
    return;
  }
  heading.textContent = saved ? saved.name : 'New itinerary';
  renderEditor(container, saved);
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

function renderList(container) {
  const itineraries = getCollection(COLLECTION);
  const longDayHours = setting('alerts.longDayHours');
  const message = flash;
  flash = null;

  container.insertAdjacentHTML('beforeend', `
    <p class="status-message" role="status">${escapeHTML(message ?? '')}</p>
    <div class="toolbar"><a class="button" href="#/itinerary/new">New itinerary</a></div>
    ${itineraries.length ? `
      <div class="table-wrap">
        <table class="data-table">
          <caption class="visually-hidden">Itineraries</caption>
          <thead><tr>
            <th scope="col">Itinerary</th><th scope="col">Dates</th>
            <th scope="col" class="num">Days</th><th scope="col" class="num">Distance</th><th scope="col">Long days</th>
          </tr></thead>
          <tbody>
            ${itineraries.map((it) => {
              const plan = planItinerary(it, longDayHours);
              const end = it.startDate ? addDays(it.startDate, it.days.length) : null;
              return `<tr>
                <th scope="row" data-label="Itinerary"><a href="#/itinerary/${escapeHTML(it.id)}">${escapeHTML(it.name)}</a>
                  <span class="cell-sub">From ${escapeHTML(it.embarkPort)} at ${it.speedKnots} knots</span></th>
                <td data-label="Dates">${it.startDate ? formatDateRange(it.startDate, end) : 'Not set'}</td>
                <td data-label="Days" class="num">${it.days.length}</td>
                <td data-label="Distance" class="num">${plan.totalNm} nm</td>
                <td data-label="Long days">${plan.longDays ? `<span class="pill pill--amber">${plan.longDays} long day${plan.longDays > 1 ? 's' : ''}</span>` : '<span class="pill pill--green">None</span>'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : '<p class="placeholder">No itineraries yet.</p>'}
  `);
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

function renderEditor(container, saved) {
  const longDayHours = setting('alerts.longDayHours');
  const allowance = setting('itinerary.routeAllowancePercent');
  let ports = [];

  // A working copy. Nothing is saved until the Save button.
  const draft = saved ? structuredClone(saved) : {
    name: '', enquiryId: null, startDate: '', embarkPort: '',
    speedKnots: setting('itinerary.defaultSpeedKnots'),
    days: Array.from({ length: 7 }, () => ({ toPort: '', nm: '', notes: '' })),
  };
  const enquiries = getCollection('enquiries').filter((e) => e.status !== 'Lost');

  container.insertAdjacentHTML('beforeend', `
    <p><a href="#/itinerary">Back to itineraries</a></p>
    ${saved?.example ? '<p class="notice">This is a fictional example. Distances are approximate, for illustration only.</p>' : ''}

    <form id="itinerary-form" novalidate>
      <fieldset class="section">
        <legend>Details</legend>
        <div class="form-grid">
          ${field('name', 'Itinerary name', draft.name)}
          <div class="field">
            <label for="enquiryId">For enquiry (optional)</label>
            <select id="enquiryId" name="enquiryId">
              <option value="">None</option>
              ${enquiries.map((e) => `<option value="${escapeHTML(e.id)}" ${e.id === draft.enquiryId ? 'selected' : ''}>${escapeHTML(e.clientName)}</option>`).join('')}
            </select>
            <p class="hint">Choosing one fills in the dates and number of days.</p>
          </div>
          ${field('startDate', 'Embarkation date', draft.startDate, 'date')}
          ${field('embarkPort', 'Embarkation port', draft.embarkPort, 'text', 'list="port-list" autocomplete="off"', 'Pick from the list to have distances worked out for you.')}
          ${field('speedKnots', 'Cruising speed (knots)', draft.speedKnots, 'text', 'inputmode="decimal"', 'Use the yacht\'s own cruising speed if you know it.')}
        </div>
      </fieldset>

      <fieldset class="section">
        <legend>Day by day</legend>
        <datalist id="port-list"></datalist>
        <p class="hint">Distances fill in by themselves when both ports are in the port list: the straight line between the harbours plus ${allowance}% for going round headlands and islands. Type over any distance to use your own figure. Cruising time is distance ÷ speed at a steady speed. Weather, sea state and time in and out of port add to it, so check passages with the captain. Legs over ${longDayHours} hours are flagged as long days.</p>
        <div class="table-wrap">
          <table class="data-table itinerary-table">
            <caption class="visually-hidden">Day by day itinerary</caption>
            <thead><tr>
              <th scope="col">Day</th><th scope="col">From</th><th scope="col">To</th>
              <th scope="col" class="num">Distance (nm)</th><th scope="col" class="num">Cruising time</th><th scope="col">Notes</th>
            </tr></thead>
            <tbody id="day-rows"></tbody>
          </table>
        </div>
        <div class="button-row day-buttons">
          <button type="button" class="button button--secondary button--small" id="add-day">Add a day</button>
          <button type="button" class="button button--secondary button--small" id="remove-day">Remove last day</button>
        </div>
        <p class="itinerary-summary" id="itinerary-summary" role="status"></p>
      </fieldset>

      <p class="field-error" id="form-error"></p>
      <div class="button-row">
        <button type="submit" class="button">Save itinerary</button>
        <a class="button button--secondary" href="#/itinerary">Cancel</a>
        ${saved ? '<button type="button" class="button button--danger" id="delete-itinerary">Delete</button>' : ''}
      </div>
    </form>
  `);

  const form = container.querySelector('#itinerary-form');
  const rowsEl = form.querySelector('#day-rows');
  const summaryEl = form.querySelector('#itinerary-summary');

  // Draw the day rows (only when days are added or removed, so typing
  // never loses the cursor).
  const drawRows = () => {
    rowsEl.innerHTML = draft.days.map((d, i) => {
      const n = i + 1;
      return `<tr data-day="${n}">
        <th scope="row" data-label="Day">Day ${n}<span class="cell-sub" data-cell="date"></span></th>
        <td data-label="From" data-cell="from"></td>
        <td data-label="To"><label class="visually-hidden" for="day-${n}-toPort">Day ${n} to</label>
          <input id="day-${n}-toPort" name="day-${n}-toPort" value="${escapeHTML(d.toPort)}" list="port-list" autocomplete="off"></td>
        <td data-label="Distance (nm)" class="num"><label class="visually-hidden" for="day-${n}-nm">Day ${n} distance in nautical miles</label>
          <input id="day-${n}-nm" name="day-${n}-nm" class="num-input" inputmode="decimal" value="${escapeHTML(d.nm)}" aria-describedby="day-${n}-nm-note day-${n}-nm-error">
          <span class="cell-sub" id="day-${n}-nm-note" data-cell="nm-note"></span>
          <span class="field-error" id="day-${n}-nm-error"></span></td>
        <td data-label="Cruising time" class="num" data-cell="time"></td>
        <td data-label="Notes"><label class="visually-hidden" for="day-${n}-notes">Day ${n} notes</label>
          <input id="day-${n}-notes" name="day-${n}-notes" value="${escapeHTML(d.notes)}"></td>
      </tr>`;
    }).join('');
    form.querySelector('#remove-day').disabled = draft.days.length <= 1;
    update();
  };

  // Read the form into the draft, then refresh the worked-out cells.
  const readForm = () => {
    draft.name = form.elements.name.value;
    draft.enquiryId = form.elements.enquiryId.value || null;
    draft.startDate = form.elements.startDate.value;
    draft.embarkPort = form.elements.embarkPort.value;
    draft.speedKnots = form.elements.speedKnots.value;
    draft.days = draft.days.map((d, i) => ({
      ...d,
      toPort: form.elements[`day-${i + 1}-toPort`].value,
      nm: form.elements[`day-${i + 1}-nm`].value,
      notes: form.elements[`day-${i + 1}-notes`].value,
    }));
  };

  // Fill in estimated distances. A leg is worked out when its distance box
  // is empty or holds an earlier estimate; a figure the user typed is left
  // alone, and so is the box being typed in (editingDay), so it can be
  // cleared and retyped.
  const fillDistances = (editingDay = null) => {
    let fromPort = draft.embarkPort;
    draft.days.forEach((d, i) => {
      const n = i + 1;
      const box = form.elements[`day-${n}-nm`];
      const note = rowsEl.querySelector(`[data-day="${n}"] [data-cell="nm-note"]`);
      const estimate = estimateLegNm(fromPort, d.toPort, ports, allowance);
      fromPort = d.toPort;
      // 0 counts as empty: blank days are saved as 0, and a day that stays
      // in port works out at 0 anyway.
      const empty = ['', '0'].includes(String(d.nm).trim());
      if (n !== editingDay && (d.nmEstimated || empty)) {
        if (estimate.nm !== null) {
          d.nm = String(estimate.nm);
          d.nmEstimated = true;
        } else if (d.nmEstimated) {
          d.nm = '';
          d.nmEstimated = false;
        }
        box.value = d.nm;
      }
      note.textContent = d.nmEstimated ? 'Estimated' : (['', '0'].includes(String(d.nm).trim()) ? estimate.reason : '');
    });
  };

  const update = (editingDay = null) => {
    if (ports.length) fillDistances(editingDay);
    const plan = planItinerary({ ...draft, speedKnots: Number(draft.speedKnots) }, longDayHours);
    plan.days.forEach((d) => {
      const row = rowsEl.querySelector(`[data-day="${d.day}"]`);
      row.querySelector('[data-cell="date"]').textContent = d.date ? formatDate(d.date) : '';
      row.querySelector('[data-cell="from"]').textContent = d.fromPort || '-';
      row.querySelector('[data-cell="time"]').innerHTML = `<span class="time-value">${formatHours(d.hours)}${d.longDay ? ' <span class="pill pill--amber">Long day</span>' : ''}</span>`;
      row.classList.toggle('is-long-day', d.longDay);
    });
    summaryEl.textContent = plan.totalHours === null
      ? 'Enter a cruising speed to work out times.'
      : `Total ${plan.totalNm} nm, about ${formatHours(plan.totalHours)} under way. ${plan.longDays ? `${plan.longDays} long day${plan.longDays > 1 ? 's' : ''}.` : 'No long days.'}`;
  };

  form.addEventListener('input', (event) => {
    readForm();
    // Typing in a distance box means the user's own figure from now on.
    const typed = /^day-(\d+)-nm$/.exec(event.target.name ?? '');
    if (typed) draft.days[typed[1] - 1].nmEstimated = false;
    update(typed ? Number(typed[1]) : null);
  });

  // Linking an enquiry fills in the start date, a name and one row per day.
  form.elements.enquiryId.addEventListener('change', () => {
    const e = getCollection('enquiries').find((x) => x.id === form.elements.enquiryId.value);
    if (!e) return;
    readForm();
    draft.startDate = e.startDate;
    form.elements.startDate.value = e.startDate;
    if (!draft.name) { draft.name = `${e.clientName}: itinerary`; form.elements.name.value = draft.name; }
    const days = charterDays(e);
    while (draft.days.length < days) draft.days.push({ toPort: '', nm: '', notes: '' });
    if (draft.days.length > days && draft.days.slice(days).every((d) => !d.toPort && !d.nm)) draft.days.length = days;
    drawRows();
  });

  form.querySelector('#add-day').addEventListener('click', () => {
    readForm();
    draft.days.push({ toPort: '', nm: '', notes: '' });
    drawRows();
    form.elements[`day-${draft.days.length}-toPort`].focus();
  });

  form.querySelector('#remove-day').addEventListener('click', () => {
    readForm();
    if (draft.days.length > 1) draft.days.pop();
    drawRows();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    readForm();
    const result = validateItinerary(draft);
    for (const el of form.querySelectorAll('.field-error')) el.textContent = '';
    for (const el of form.querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
    if (!result.ok) {
      let first = null;
      for (const [name, message] of Object.entries(result.errors)) {
        const input = form.elements[name];
        input.setAttribute('aria-invalid', 'true');
        form.querySelector(`#${CSS.escape(name)}-error`).textContent = message;
        first ??= input;
      }
      first.focus();
      return;
    }

    const record = {
      name: draft.name.trim(),
      enquiryId: draft.enquiryId,
      startDate: draft.startDate || null,
      embarkPort: draft.embarkPort.trim(),
      speedKnots: Number(draft.speedKnots),
      days: draft.days.map((d) => ({
        toPort: d.toPort.trim(), nm: Number(d.nm) || 0, notes: d.notes.trim(), ...(d.nmEstimated ? { nmEstimated: true } : {}),
      })),
    };
    const list = getCollection(COLLECTION);
    if (saved) {
      saveCollection(COLLECTION, list.map((i) => (i.id === saved.id ? { id: i.id, ...(i.example ? { example: true } : {}), ...record } : i)));
    } else {
      saveCollection(COLLECTION, [...list, { id: `itin-${Date.now().toString(36)}`, ...record }]);
    }
    flash = `Saved: ${record.name}.`;
    location.hash = '#/itinerary';
  });

  form.querySelector('#delete-itinerary')?.addEventListener('click', () => {
    if (!window.confirm(`Delete the itinerary "${saved.name}"? This cannot be undone.`)) return;
    saveCollection(COLLECTION, getCollection(COLLECTION).filter((i) => i.id !== saved.id));
    flash = `Deleted: ${saved.name}.`;
    location.hash = '#/itinerary';
  });

  drawRows();

  loadPorts().then((data) => {
    ports = data.ports;
    form.querySelector('#port-list').innerHTML = ports
      .map((p) => `<option value="${escapeHTML(portLabel(p))}"></option>`).join('');
    update();
  });
}

function field(name, label, value, type = 'text', extra = '', hint = '') {
  return `
    <div class="field">
      <label for="${name}">${escapeHTML(label)}</label>
      <input id="${name}" name="${name}" type="${type}" value="${escapeHTML(value ?? '')}" ${extra}
             aria-describedby="${hint ? `${name}-hint ` : ''}${name}-error">
      ${hint ? `<p class="hint" id="${name}-hint">${escapeHTML(hint)}</p>` : ''}
      <p class="field-error" id="${name}-error"></p>
    </div>`;
}
