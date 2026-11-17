// Monthly management report screen (yacht management).
//
//   #/monthly-report   choose a managed yacht and month; one printable page
//                      with key points, compliance, crew, budget and the
//                      manager's notes for the month.

import { getCollection, saveCollection, getSettings } from '../store.js';
import { monthlyReport, reportMonths, monthLabel } from '../monthly.js';
import { categoryLabel } from '../compliance.js';
import { varianceTone, MONTH_LABELS } from '../calc/management.js';
import { formatMoney } from '../calc/currency.js';
import { formatDate, todayISO } from '../calc/dates.js';
import { escapeHTML } from './html.js';

const choice = { yachtId: null, month: null };
const setting = (id, fallback) => getSettings().find((s) => s.id === id)?.value ?? fallback;

export function render(container, param, heading) {
  heading.classList.add('no-print');
  const today = todayISO();
  const yachts = getCollection('managedYachts');
  if (!yachts.length) {
    container.insertAdjacentHTML('beforeend', '<p class="placeholder">No managed yachts yet. Add one under <a href="#/compliance">Compliance</a> first.</p>');
    return;
  }
  if (!yachts.some((y) => y.id === choice.yachtId)) choice.yachtId = yachts[0].id;
  const { months, defaultMonth } = reportMonths(today);
  if (!months.includes(choice.month)) choice.month = defaultMonth;

  container.insertAdjacentHTML('beforeend', `
    <form class="section no-print" id="report-form" novalidate>
      <p>One page for the owner each month: key points, compliance, crew certificates, spending against budget and your notes.</p>
      <div class="form-grid">
        <div class="field">
          <label for="yacht">Yacht</label>
          <select id="yacht">${yachts.map((y) => `<option value="${escapeHTML(y.id)}" ${y.id === choice.yachtId ? 'selected' : ''}>${escapeHTML(y.name)}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label for="month">Month</label>
          <select id="month">${months.map((m) => `<option value="${m}" ${m === choice.month ? 'selected' : ''}>${monthLabel(m)}${m === months[0] ? ' (so far)' : ''}</option>`).join('')}</select>
        </div>
      </div>
      <div class="field">
        <label for="notes">Manager's notes for the month</label>
        <textarea id="notes" rows="4" aria-describedby="notes-hint"></textarea>
        <p class="hint" id="notes-hint">For example: operations, berths and fuel arranged with agents, works carried out, owner trips. Saved for this yacht and month, and printed on the report.</p>
      </div>
      <p class="status-message" role="status" id="notes-status"></p>
      <button type="button" class="button" id="print">Print or save as PDF</button>
    </form>
    <article id="report" class="proposal-doc owner-report monthly-report" aria-label="Monthly management report"></article>
  `);

  const notesKey = () => `${choice.yachtId}:${choice.month}`;
  const notesBox = container.querySelector('#notes');
  const loadNotes = () => {
    notesBox.value = getCollection('monthlyNotes').find((n) => n.id === notesKey())?.text ?? '';
  };

  const draw = () => {
    const yacht = yachts.find((y) => y.id === choice.yachtId);
    const budget = getCollection('budgets').find((b) => b.yachtId === yacht.id && b.year === Number(choice.month.slice(0, 4))) ?? null;
    const r = monthlyReport({
      items: getCollection('compliance').filter((i) => i.yachtId === yacht.id),
      crew: getCollection('crew').filter((m) => m.yachtId === yacht.id),
      budget,
      month: choice.month,
      today,
      amberDays: setting('alerts.expiryAmberDays', 60),
      budgetAmberPercent: setting('alerts.budgetOverspendAmberPercent', 5),
    });
    container.querySelector('#report').innerHTML = reportHTML(r, yacht, notesBox.value, today);
  };

  container.querySelector('#yacht').addEventListener('change', (e) => { choice.yachtId = e.target.value; loadNotes(); draw(); });
  container.querySelector('#month').addEventListener('change', (e) => { choice.month = e.target.value; loadNotes(); draw(); });

  // Notes save as you type, one record per yacht and month.
  notesBox.addEventListener('input', () => {
    const others = getCollection('monthlyNotes').filter((n) => n.id !== notesKey());
    const text = notesBox.value;
    saveCollection('monthlyNotes', text.trim() ? [...others, { id: notesKey(), yachtId: choice.yachtId, month: choice.month, text }] : others);
    container.querySelector('#notes-status').textContent = 'Saved.';
    draw();
  });

  container.querySelector('#print').addEventListener('click', () => window.print());

  loadNotes();
  draw();
}

function reportHTML(r, yacht, notes, today) {
  const m = r.money;
  const cur = (n) => formatMoney(n, m.currency);
  const amber = setting('alerts.budgetOverspendAmberPercent', 5);
  const vText = (v) => (v ? `${v.amount > 0 ? '+' : v.amount < 0 ? '-' : ''}${cur(Math.abs(v.amount))}${v.percent != null ? ` (${v.percent > 0 ? '+' : ''}${v.percent}%)` : ''}` : 'Not entered');
  const vPill = (v) => (v ? `<span class="pill pill--${varianceTone(v, amber)}">${escapeHTML(vText(v))}</span>` : '<span class="muted">Not entered</span>');

  return `
    <header class="proposal-head">
      <p class="proposal-kicker">Monthly management report</p>
      <h2>${escapeHTML(yacht.name)} <span class="muted">${escapeHTML(r.label)}</span></h2>
      <dl class="proposal-facts">
        <div><dt>Status as at</dt><dd>${escapeHTML(r.asAtText)}</dd></div>
        <div><dt>Flag</dt><dd>${escapeHTML(yacht.flag || 'Not recorded')}</dd></div>
        <div><dt>Crew</dt><dd>${r.crew.total}</dd></div>
        <div><dt>Prepared</dt><dd>${formatDate(today)}</dd></div>
      </dl>
      ${yacht.example ? '<p class="proposal-example">Example report for a fictional yacht with illustrative figures.</p>' : ''}
    </header>

    <section>
      <h3>Key points</h3>
      <ul class="key-points">${r.keyPoints.map((k) => `<li class="key-point key-point--${k.tone}">${escapeHTML(k.text)}</li>`).join('')}</ul>
    </section>

    <div class="report-two-col">
      <section>
        <h3>Compliance</h3>
        <p class="pill-row pill-row--tight">
          ${r.compliance.expired.length ? `<span class="pill pill--red">${r.compliance.expired.length} expired or overdue</span>` : ''}
          ${r.compliance.dueSoon.length ? `<span class="pill pill--amber">${r.compliance.dueSoon.length} due soon</span>` : ''}
          <span class="pill pill--green">${r.compliance.inDate} in date</span>
        </p>
        ${[...r.compliance.expired, ...r.compliance.dueSoon].length
          ? `<ul class="plain-list">${[...r.compliance.expired, ...r.compliance.dueSoon].map((i) => `<li>${escapeHTML(i.title)} <span class="muted">(${escapeHTML(categoryLabel(i.category))})</span>: ${escapeHTML(i.status.text.charAt(0).toLowerCase() + i.status.text.slice(1))}</li>`).join('')}</ul>`
          : '<p class="muted">Nothing due in the next period.</p>'}
      </section>
      <section>
        <h3>Crew certificates</h3>
        ${r.crew.actions.length
          ? `<ul class="plain-list">${r.crew.actions.map((a) => `<li>${escapeHTML(a.name)} <span class="muted">(${escapeHTML(a.role)})</span>: ${escapeHTML(a.text)}</li>`).join('')}</ul>`
          : '<p class="muted">All crew certificates in date.</p>'}
      </section>
    </div>

    <section>
      <h3>Spending against budget</h3>
      ${m ? `
        <div class="table-wrap">
          <table class="handover-table report-table">
            <caption class="visually-hidden">Spending for ${escapeHTML(r.label)} and the year to date</caption>
            <thead><tr>
              <th scope="col">Category</th>
              <th scope="col" class="num">${escapeHTML(r.monthShort)} budget</th><th scope="col" class="num">${escapeHTML(r.monthShort)} actual</th><th scope="col">${escapeHTML(r.monthShort)} variance</th>
              <th scope="col">${m.ytdThrough ? `Year to end of ${MONTH_LABELS[m.ytdThrough - 1]}` : 'Year to date'}</th><th scope="col" class="num">Full-year forecast</th>
            </tr></thead>
            <tbody>
              ${m.rows.map((row) => `<tr>
                <th scope="row">${escapeHTML(row.label)}</th>
                <td class="num">${cur(row.monthBudget)}</td>
                <td class="num">${row.monthActual == null ? '<span class="muted">Not entered</span>' : cur(row.monthActual)}</td>
                <td>${vPill(row.month)}</td>
                <td>${vPill(row.toDate)}</td>
                <td class="num">${cur(row.forecast)}</td>
              </tr>`).join('')}
              <tr class="total-row">
                <th scope="row">Total</th>
                <td class="num">${cur(m.totals.monthBudget)}</td>
                <td class="num">${m.missing.length ? `${cur(m.totals.monthActual)}<span class="cell-sub">part entered</span>` : cur(m.totals.monthActual)}</td>
                <td>${m.missing.length ? '<span class="muted">-</span>' : vPill(m.totals.month)}</td>
                <td>${vPill(m.totals.toDate)}</td>
                <td class="num">${cur(m.totals.forecast)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="hint">${m.missing.length ? `${escapeHTML(r.label)} is not fully entered, so the year-to-date figures and forecast run to the end of ${m.ytdMonthName ?? 'last year'}. ` : ''}Forecast = actual spend so far plus the budget for the rest of the year. Annual budget ${cur(m.totals.annual)}.</p>`
        : `<p class="muted">No budget recorded for ${escapeHTML(r.label.split(' ')[1])}. Add one under <a href="#/budget">Budget vs actual</a>.</p>`}
    </section>

    <section>
      <h3>Manager's notes</h3>
      ${notes.trim() ? `<p class="notes-text">${escapeHTML(notes.trim())}</p>` : '<p class="muted">No notes for this month.</p>'}
    </section>`;
}
