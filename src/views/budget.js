// Budget vs actual screen (yacht management).
//
//   #/budget    choose a managed yacht and year; see budget against actual
//               by category, the variance and the full-year forecast;
//               enter a month's actual spend; change the annual budgets.

import { getCollection, saveCollection, getSettings } from '../store.js';
import { BUDGET_CATEGORIES, MONTH_LABELS, budgetReport, monthlyBudget, varianceTone } from '../calc/management.js';
import { emptyBudget, readAmount, setAnnual, setActual } from '../budget.js';
import { CURRENCIES, formatMoney } from '../calc/currency.js';
import { todayISO } from '../calc/dates.js';
import { escapeHTML } from './html.js';

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const choice = { yachtId: null, year: null, month: null };
const amberPercent = () => getSettings().find((s) => s.id === 'alerts.budgetOverspendAmberPercent')?.value ?? 5;
const label = (id) => BUDGET_CATEGORIES.find((c) => c.id === id)?.label ?? id;

export function render(container) {
  const yachts = getCollection('managedYachts');
  if (!yachts.length) {
    container.insertAdjacentHTML('beforeend', '<p class="placeholder">No managed yachts yet. Add one under <a href="#/compliance">Compliance</a> first.</p>');
    return;
  }
  if (!yachts.some((y) => y.id === choice.yachtId)) choice.yachtId = yachts[0].id;
  const budgets = getCollection('budgets').filter((b) => b.yachtId === choice.yachtId).sort((a, b) => b.year - a.year);
  if (!budgets.some((b) => b.year === choice.year)) choice.year = budgets[0]?.year ?? null;
  const budget = budgets.find((b) => b.year === choice.year) ?? null;
  const thisYear = Number(todayISO().slice(0, 4));

  container.insertAdjacentHTML('beforeend', `
    <p>The yacht's operating budget against what has actually been spent, by category and month, with a forecast for the full year.</p>
    <form class="section" id="choose" novalidate>
      <div class="form-grid">
        <div class="field">
          <label for="yacht">Yacht</label>
          <select id="yacht">${yachts.map((y) => `<option value="${escapeHTML(y.id)}" ${y.id === choice.yachtId ? 'selected' : ''}>${escapeHTML(y.name)}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label for="year">Year</label>
          <select id="year">
            ${budgets.map((b) => `<option value="${b.year}" ${b.year === choice.year ? 'selected' : ''}>${b.year}</option>`).join('')}
            ${budgets.some((b) => b.year === thisYear) ? '' : `<option value="new-${thisYear}">Start a ${thisYear} budget</option>`}
            ${budgets.some((b) => b.year === thisYear + 1) ? '' : `<option value="new-${thisYear + 1}">Start a ${thisYear + 1} budget</option>`}
          </select>
        </div>
      </div>
      ${budget?.example ? '<p class="hint">Fictional yacht and illustrative figures, used as an example.</p>' : ''}
    </form>
    <div id="budget-body"></div>
  `);

  const redraw = () => {
    container.replaceChildren(container.querySelector('h1'));
    render(container);
  };
  // A different yacht or year starts at its own next month to enter.
  container.querySelector('#yacht').addEventListener('change', (e) => { choice.yachtId = e.target.value; choice.year = null; choice.month = null; redraw(); });
  container.querySelector('#year').addEventListener('change', (e) => {
    choice.month = null;
    const value = e.target.value;
    if (value.startsWith('new-')) {
      const year = Number(value.slice(4));
      const fresh = emptyBudget(choice.yachtId, year);
      saveCollection('budgets', [...getCollection('budgets'), fresh]);
      choice.year = year;
    } else {
      choice.year = Number(value);
    }
    redraw();
  });

  const body = container.querySelector('#budget-body');
  if (!budget) {
    body.innerHTML = '<p class="placeholder">No budget for this yacht yet. Choose "Start a budget" above.</p>';
    return;
  }
  renderBudget(body, budget);
}

function renderBudget(body, saved) {
  let budget = saved;
  const save = () => saveCollection('budgets', getCollection('budgets').map((b) => (b.id === budget.id ? budget : b)));
  const money = (n) => formatMoney(n, budget.currency);

  const draw = (message = '') => {
    const r = budgetReport(budget.categories);
    choice.month ??= Math.min(Math.max(r.through + 1, 1), 12);
    const t = r.totals;
    const tone = (v) => varianceTone(v, amberPercent());
    const varText = (v) => `${v.amount > 0 ? '+' : v.amount < 0 ? '-' : ''}${money(Math.abs(v.amount))}${v.percent != null ? ` (${v.percent > 0 ? '+' : ''}${v.percent}%)` : ''}`;
    const missing = r.rows.filter((row) => row.missingMonths.length);

    body.innerHTML = `
      <p class="status-message" role="status">${escapeHTML(message)}</p>
      <div class="report-figures">
        <div><span class="figure-label">Annual budget ${budget.year}</span><span class="figure num">${money(t.annual)}</span></div>
        <div><span class="figure-label">${r.through ? `Spent to end of ${MONTHS_LONG[r.through - 1]}` : 'Spent so far'}</span><span class="figure num">${money(t.actualToDate)}</span>
          <span class="cell-sub">Budget to date ${money(t.budgetToDate)}</span>
          ${r.through ? `<span class="pill pill--${tone(t.toDate)}">${escapeHTML(varText(t.toDate))}</span>` : ''}</div>
        <div><span class="figure-label">Full-year forecast</span><span class="figure figure--main num">${money(t.forecast)}</span>
          <span class="pill pill--${tone(t.fullYear)}">${escapeHTML(varText(t.fullYear))}</span></div>
      </div>
      <p class="hint">Forecast = actual spend so far plus the budget for the months not yet reported, so it assumes the rest of the year goes to budget. Green on or under budget, amber up to ${amberPercent()}% over, red beyond (change this in Settings).</p>
      ${missing.length ? `<div class="notice notice--warn"><p><strong>Months with no figure entered:</strong> ${missing.map((row) => `${escapeHTML(label(row.id))} (${row.missingMonths.join(', ')})`).join('; ')}. Enter 0 if nothing was spent.</p></div>` : ''}

      <section aria-labelledby="by-category">
        <h2 id="by-category">By category${r.through ? `, to end of ${MONTHS_LONG[r.through - 1]}` : ''}</h2>
        <div class="table-wrap">
          <table class="data-table data-table--wide budget-table">
            <caption class="visually-hidden">Budget against actual by category</caption>
            <thead><tr>
              <th scope="col">Category</th><th scope="col" class="num">Annual budget</th><th scope="col" class="num">Budget to date</th>
              <th scope="col" class="num">Actual to date</th><th scope="col">Variance to date</th><th scope="col" class="num">Forecast</th><th scope="col">Full year</th>
            </tr></thead>
            <tbody>
              ${r.rows.map((row) => `<tr>
                <th scope="row" data-label="Category">${escapeHTML(label(row.id))}${row.monthly ? '<span class="cell-sub">Seasonal budget</span>' : ''}</th>
                <td data-label="Annual budget" class="num">${money(row.annual)}</td>
                <td data-label="Budget to date" class="num">${money(row.budgetToDate)}</td>
                <td data-label="Actual to date" class="num">${money(row.actualToDate)}</td>
                <td data-label="Variance to date"><span class="pill pill--${tone(row.toDate)}">${escapeHTML(varText(row.toDate))}</span></td>
                <td data-label="Forecast" class="num">${money(row.forecast)}</td>
                <td data-label="Full year"><span class="pill pill--${tone(row.fullYear)}">${escapeHTML(varText(row.fullYear))}</span></td>
              </tr>`).join('')}
              <tr class="total-row">
                <th scope="row" data-label="Total">Total</th>
                <td data-label="Annual budget" class="num">${money(t.annual)}</td>
                <td data-label="Budget to date" class="num">${money(t.budgetToDate)}</td>
                <td data-label="Actual to date" class="num">${money(t.actualToDate)}</td>
                <td data-label="Variance to date"><span class="pill pill--${tone(t.toDate)}">${escapeHTML(varText(t.toDate))}</span></td>
                <td data-label="Forecast" class="num">${money(t.forecast)}</td>
                <td data-label="Full year"><span class="pill pill--${tone(t.fullYear)}">${escapeHTML(varText(t.fullYear))}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <form class="section" id="actuals-form" novalidate>
        <h2>Enter a month's actual spend</h2>
        <div class="field field--inline month-pick">
          <label for="month">Month</label>
          <select id="month" name="month">${MONTHS_LONG.map((m, i) => `<option value="${i + 1}" ${i + 1 === choice.month ? 'selected' : ''}>${m} ${budget.year}</option>`).join('')}</select>
        </div>
        <div class="form-grid form-grid--3">
          ${budget.categories.map((c) => {
            const planned = monthlyBudget(c)[choice.month - 1];
            const value = c.actuals[choice.month - 1];
            return `<div class="field">
              <label for="actual-${c.id}">${escapeHTML(label(c.id))} (${budget.currency})</label>
              <input id="actual-${c.id}" name="actual-${c.id}" inputmode="decimal" value="${value ?? ''}" aria-describedby="actual-${c.id}-hint actual-${c.id}-error">
              <p class="hint" id="actual-${c.id}-hint">Budget for ${MONTH_LABELS[choice.month - 1]}: ${money(planned)}</p>
              <p class="field-error" id="actual-${c.id}-error"></p>
            </div>`;
          }).join('')}
        </div>
        <button type="submit" class="button">Save ${MONTHS_LONG[choice.month - 1]}</button>
      </form>

      <form class="section" id="annual-form" novalidate>
        <h2>Annual budgets</h2>
        <p class="hint">Seasonal budgets keep their monthly shape when the total changes. Others are spread evenly across the year.</p>
        <div class="form-grid form-grid--3">
          <div class="field">
            <label for="currency">Currency</label>
            <select id="currency" name="currency">${CURRENCIES.map((c) => `<option ${c === budget.currency ? 'selected' : ''}>${c}</option>`).join('')}</select>
          </div>
          ${budget.categories.map((c) => `<div class="field">
            <label for="annual-${c.id}">${escapeHTML(label(c.id))}</label>
            <input id="annual-${c.id}" name="annual-${c.id}" inputmode="decimal" value="${c.annual || ''}" aria-describedby="annual-${c.id}-error">
            <p class="field-error" id="annual-${c.id}-error"></p>
          </div>`).join('')}
        </div>
        <button type="submit" class="button button--secondary">Save annual budgets</button>
      </form>`;

    body.querySelector('#month').addEventListener('change', (e) => { choice.month = Number(e.target.value); draw(); body.querySelector('#month').focus(); });

    body.querySelector('#actuals-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const form = event.target;
      let next = budget;
      let firstError = null;
      for (const c of budget.categories) {
        const result = readAmount(form.elements[`actual-${c.id}`].value);
        form.querySelector(`#actual-${c.id}-error`).textContent = result.ok ? '' : result.error;
        if (!result.ok) { firstError ??= form.elements[`actual-${c.id}`]; continue; }
        next = setActual(next, c.id, choice.month, result.value);
      }
      if (firstError) { firstError.focus(); return; }
      budget = next;
      save();
      draw(`Saved ${MONTHS_LONG[choice.month - 1]}.`);
    });

    body.querySelector('#annual-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const form = event.target;
      let next = { ...budget, currency: form.elements.currency.value };
      let firstError = null;
      for (const c of budget.categories) {
        const result = readAmount(form.elements[`annual-${c.id}`].value);
        form.querySelector(`#annual-${c.id}-error`).textContent = result.ok ? '' : result.error;
        if (!result.ok) { firstError ??= form.elements[`annual-${c.id}`]; continue; }
        next = setAnnual(next, c.id, result.value ?? 0);
      }
      if (firstError) { firstError.focus(); return; }
      budget = next;
      save();
      draw('Annual budgets saved.');
    });
  };

  draw();
}
