// Dashboard: today's to-do list from every module, and pipeline counts.
// Each to-do links to the screen where it is dealt with.

import { getCollection, getSettings } from '../store.js';
import { todoList, pipelines, todayHeading } from '../dashboard.js';
import { ratesFromSettings } from '../calc/currency.js';
import { todayISO, nowLocalDateTime } from '../calc/dates.js';
import { escapeHTML } from './html.js';

const AREAS = ['Charter', 'Charter management', 'Sales', 'Yacht management'];
let area = ''; // filter, remembered while the app is open

export function render(container) {
  const today = todayISO();
  const settings = getSettings();
  const data = {
    yachts: getCollection('yachts'),
    forSale: getCollection('forSale'),
    enquiries: getCollection('enquiries'),
    availability: getCollection('availability'),
    contracts: getCollection('contracts'),
    managedYachts: getCollection('managedYachts'),
    compliance: getCollection('compliance'),
    crew: getCollection('crew'),
    deals: getCollection('deals'),
  };
  const todo = todoList({ data, settings, rates: ratesFromSettings(settings), today, now: nowLocalDateTime() });
  const p = pipelines(data, settings, today);

  container.insertAdjacentHTML('beforeend', `
    <p class="dashboard-date">${escapeHTML(todayHeading(today))}</p>

    <section class="section" aria-labelledby="todo-heading">
      <div class="todo-head">
        <h2 id="todo-heading">Today's to-do list</h2>
        <div class="field field--inline">
          <label for="area">Show</label>
          <select id="area">
            <option value="">Everything (${todo.length})</option>
            ${AREAS.map((a) => `<option value="${a}" ${a === area ? 'selected' : ''}>${a} (${todo.filter((t) => t.area === a).length})</option>`).join('')}
          </select>
        </div>
      </div>
      <p class="hint">Enquiries waiting over ${settingValue(settings, 'alerts.enquiryReplyHours', 24)} hours, options expiring within ${settingValue(settings, 'alerts.optionExpirySoonDays', 3)} days, payments due within ${settingValue(settings, 'alerts.paymentDueSoonDays', 14)} days and certificates expiring within ${settingValue(settings, 'alerts.expiryAmberDays', 60)} days. Change these in <a href="#/settings">Settings</a>.</p>
      <p class="results-summary" id="todo-summary" role="status"></p>
      <ul class="todo-list" id="todo-list"></ul>
    </section>

    <h2>Pipelines</h2>
    <div class="pipeline-grid">
      ${pipelineCard('Charter enquiries', '#/enquiries', p.charter.counts, p.charter.total)}
      ${pipelineCard('Boats for sale', '#/listings', p.sales.counts, p.sales.total)}
      ${pipelineCard('Sales in progress', '#/deals', p.deals.counts, p.deals.total, 'No deals yet.')}
      <section class="pipeline-card" aria-labelledby="pipe-management">
        <h3 id="pipe-management"><a href="#/compliance">Yacht management</a></h3>
        <dl class="pipeline-counts">
          <div><dt>Compliance items</dt><dd>${ragPills(p.management.compliance)}</dd></div>
          <div><dt>Crew</dt><dd>${ragPills(p.management.crew)}</dd></div>
        </dl>
      </section>
    </div>
  `);

  const drawTodo = () => {
    const shown = area ? todo.filter((t) => t.area === area) : todo;
    const red = shown.filter((t) => t.tone === 'red').length;
    const amber = shown.length - red;
    container.querySelector('#todo-summary').innerHTML = shown.length
      ? `${shown.length} to do: ${red ? `<span class="pill pill--red">${red} overdue or urgent</span>` : ''} ${amber ? `<span class="pill pill--amber">${amber} coming up</span>` : ''}`
      : 'Nothing to do here today.';
    container.querySelector('#todo-list').innerHTML = shown.map((t) => `
      <li class="todo todo--${t.tone}">
        <span class="todo-area">${escapeHTML(t.area)}</span>
        <a href="${escapeHTML(t.link)}">${escapeHTML(t.text)}</a>
        <span class="visually-hidden">${t.tone === 'red' ? 'Overdue or urgent' : 'Coming up'}</span>
      </li>`).join('');
  };

  container.querySelector('#area').addEventListener('change', (e) => { area = e.target.value; drawTodo(); });
  drawTodo();
}

function settingValue(settings, id, fallback) {
  return settings.find((s) => s.id === id)?.value ?? fallback;
}

function pipelineCard(title, link, counts, total, emptyText = 'Nothing yet.') {
  const max = Math.max(1, ...counts.map((c) => c.count));
  return `
    <section class="pipeline-card" aria-label="${escapeHTML(title)}">
      <h3><a href="${link}">${escapeHTML(title)}</a> <span class="muted">${total}</span></h3>
      ${total ? `<dl class="pipeline-counts">
        ${counts.map((c) => `<div>
          <dt>${escapeHTML(c.status)}</dt>
          <dd><span class="pipe-bar" aria-hidden="true"><span style="width:${Math.round((c.count / max) * 100)}%"></span></span><span class="num">${c.count}</span></dd>
        </div>`).join('')}
      </dl>` : `<p class="muted">${escapeHTML(emptyText)}</p>`}
    </section>`;
}

function ragPills(c) {
  return `<span class="pill-row pill-row--tight">
    ${c.red ? `<span class="pill pill--red">${c.red} expired</span>` : ''}
    ${c.amber ? `<span class="pill pill--amber">${c.amber} due soon</span>` : ''}
    <span class="pill pill--green">${c.green} fine</span>
  </span>`;
}
