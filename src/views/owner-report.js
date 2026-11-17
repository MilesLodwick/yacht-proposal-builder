// Owner report screen.
//
//   #/owner-report            choose a yacht and a season
//   #/owner-report/<yachtId>  the report, printable on one page
//
// Bookings come from the Availability calendar. Where a booking has no
// contract fee recorded, the fee is estimated from the yacht's rate and
// marked "estimated".

import { getCollection, getSettings } from '../store.js';
import { ownerReport, seasonList } from '../calc/owner.js';
import { weeklyRateFor } from '../selection.js';
import { formatMoney } from '../calc/currency.js';
import { formatDate, formatDateRange, todayISO, addDays } from '../calc/dates.js';
import { escapeHTML } from './html.js';

// The season chosen, remembered while the app is open.
let seasonId = null;

export function render(container, param, heading) {
  const today = todayISO();
  const seasons = seasonList(today, 4);
  seasonId ??= seasons[0].id;
  const yachts = getCollection('yachts');
  const entries = getCollection('availability');
  const withBookings = yachts.filter((y) => entries.some((e) => e.yachtId === y.id && e.type === 'booking'));
  const yacht = param ? yachts.find((y) => y.id === param) : null;
  if (yacht) heading.textContent = `Owner report: ${yacht.name}`;
  heading.classList.add('no-print');

  container.insertAdjacentHTML('beforeend', `
    <form class="section no-print" id="report-form" novalidate>
      <p>A season's charters for one yacht: income, commission, net to the owner and how busy the yacht was. Bookings come from the <a href="#/availability">availability calendar</a>.</p>
      <div class="form-grid">
        <div class="field">
          <label for="yacht">Yacht</label>
          <select id="yacht" name="yacht">
            <option value="">Choose a yacht</option>
            ${withBookings.length ? `<optgroup label="With bookings">${withBookings.map((y) => option(y, yacht)).join('')}</optgroup>` : ''}
            <optgroup label="All yachts">${[...yachts].sort((a, b) => a.name.localeCompare(b.name)).filter((y) => !withBookings.includes(y)).map((y) => option(y, yacht)).join('')}</optgroup>
          </select>
        </div>
        <div class="field">
          <label for="season">Season</label>
          <select id="season" name="season">
            ${seasons.map((s) => `<option value="${s.id}" ${s.id === seasonId ? 'selected' : ''}>${escapeHTML(s.label)}</option>`).join('')}
          </select>
        </div>
      </div>
      ${yacht ? '<div class="button-row"><button type="button" class="button" id="print">Print or save as PDF</button></div>' : ''}
    </form>
    <article id="report" class="proposal-doc owner-report" aria-label="Owner report"></article>
  `);

  const form = container.querySelector('#report-form');
  form.elements.yacht.addEventListener('change', () => {
    location.hash = form.elements.yacht.value ? `#/owner-report/${form.elements.yacht.value}` : '#/owner-report';
  });
  form.elements.season.addEventListener('change', () => {
    seasonId = form.elements.season.value;
    draw();
  });
  container.querySelector('#print')?.addEventListener('click', () => window.print());

  const reportEl = container.querySelector('#report');
  const draw = () => {
    if (!yacht) {
      reportEl.innerHTML = '<p class="placeholder">Choose a yacht to see its report.</p>';
      return;
    }
    const season = seasons.find((s) => s.id === seasonId);
    const report = ownerReport({
      yacht, entries: entries.filter((e) => e.yachtId === yacht.id), season, settings: getSettings(), rateFor: weeklyRateFor,
    });
    reportEl.innerHTML = reportHTML(report, yacht, season, today);
  };
  draw();
}

function option(y, selected) {
  return `<option value="${escapeHTML(y.id)}" ${selected?.id === y.id ? 'selected' : ''}>${escapeHTML(y.name)} (${escapeHTML(y.firm)})</option>`;
}

function reportHTML(r, yacht, season, today) {
  const money = (n) => formatMoney(n, r.currency);
  const t = r.totals;
  const u = r.utilisation;
  const hasExample = getCollection('availability').some((e) => e.yachtId === yacht.id && e.example);

  return `
    <header class="proposal-head">
      <p class="proposal-kicker">Owner report</p>
      <h2>${escapeHTML(yacht.name)} <span class="muted">${escapeHTML(season.label)}</span></h2>
      <dl class="proposal-facts">
        <div><dt>Season</dt><dd>${formatDate(season.start)} to ${formatDate(addDays(season.end, -1))}</dd></div>
        <div><dt>Charters</dt><dd>${t.charters} (${t.weeks} weeks)</dd></div>
        <div><dt>Currency</dt><dd>${escapeHTML(r.currency ?? 'Not stated')}</dd></div>
        <div><dt>Prepared</dt><dd>${formatDate(today)}</dd></div>
      </dl>
      ${hasExample ? '<p class="proposal-example">Includes fictional example bookings.</p>' : ''}
    </header>

    <div class="report-figures">
      <div><span class="figure-label">Gross charter income</span><span class="figure num">${money(t.gross)}</span></div>
      <div><span class="figure-label">Commission (${r.split.totalPercent}%)</span><span class="figure num">${money(t.commission)}</span></div>
      <div><span class="figure-label">Net to owner</span><span class="figure figure--main num">${money(t.net)}</span></div>
      <div><span class="figure-label">Utilisation</span><span class="figure num">${u.percent}%</span></div>
    </div>

    <section>
      <h3>Charters</h3>
      ${r.bookings.length ? `
        <div class="table-wrap">
          <table class="handover-table report-table">
            <caption class="visually-hidden">Charters this season</caption>
            <thead><tr>
              <th scope="col">Charter</th><th scope="col">Dates</th><th scope="col" class="num">Nights</th>
              <th scope="col" class="num">Charter fee</th><th scope="col" class="num">Commission</th><th scope="col" class="num">Net to owner</th>
            </tr></thead>
            <tbody>
              ${r.bookings.map((b) => `<tr>
                <th scope="row" data-label="Charter">${escapeHTML(b.label || 'Booking')}<span class="cell-sub">${b.retailBroker ? `via ${escapeHTML(b.retailBroker)}` : 'Direct'}</span></th>
                <td data-label="Dates">${formatDateRange(b.start, b.end)}</td>
                <td data-label="Nights" class="num">${b.nights}</td>
                <td data-label="Charter fee" class="num">${b.charterFee == null ? 'Not recorded' : `${money(b.charterFee)}${b.estimated ? '<span class="cell-sub">estimated</span>' : ''}`}</td>
                <td data-label="Commission" class="num">${b.commission ? money(b.commission.total) : '-'}</td>
                <td data-label="Net to owner" class="num">${b.commission ? money(b.commission.net) : '-'}</td>
              </tr>`).join('')}
              <tr class="total-row">
                <th scope="row" data-label="Total">Total</th><td></td>
                <td data-label="Nights" class="num">${r.bookings.reduce((s, b) => s + b.nights, 0)}</td>
                <td data-label="Charter fee" class="num">${money(t.gross)}</td>
                <td data-label="Commission" class="num">${money(t.commission)}</td>
                <td data-label="Net to owner" class="num">${money(t.net)}</td>
              </tr>
            </tbody>
          </table>
        </div>` : '<p class="muted">No charters booked this season yet.</p>'}
    </section>

    <section>
      <h3>Commission split</h3>
      <table class="breakdown-table">
        <caption class="visually-hidden">How the commission is shared</caption>
        <tbody>
          <tr><th scope="row">Retail brokers (${r.split.retailPercent}% on charters they found)</th><td class="num">${money(t.retail)}</td></tr>
          <tr><th scope="row">Central agent (${r.split.centralPercent}%, or the full ${r.split.totalPercent}% on direct charters)</th><td class="num">${money(t.central)}</td></tr>
          <tr class="total-row"><th scope="row">Total commission</th><td class="num">${money(t.commission)}</td></tr>
        </tbody>
      </table>
    </section>

    <section>
      <h3>Utilisation through the season</h3>
      <p>${u.bookedNights} of ${u.seasonNights} nights chartered (${u.percent}%). Owner use: ${u.ownerNights} nights. Of the nights not used by the owner, ${u.ofAvailablePercent}% were chartered.</p>
      <table class="utilisation-table">
        <caption class="visually-hidden">Nights chartered each month</caption>
        <thead><tr><th scope="col">Month</th><th scope="col" class="num">Chartered</th><th scope="col" class="num">Owner</th><th scope="col">Share of nights chartered</th></tr></thead>
        <tbody>
          ${r.months.map((m) => `<tr>
            <th scope="row">${m.label}</th>
            <td class="num">${m.booked}</td>
            <td class="num">${m.owner}</td>
            <td><span class="bar" aria-hidden="true"><span class="bar__fill" style="width:${m.percent}%"></span><span class="bar__owner" style="width:${Math.round((m.owner / m.days) * 100)}%"></span></span><span class="num bar-value">${m.percent}%</span></td>
          </tr>`).join('')}
        </tbody>
      </table>
      <p class="hint"><span class="bar-key bar-key--fill"></span> Chartered <span class="bar-key bar-key--owner"></span> Owner use</p>
    </section>

    <section class="proposal-notes">
      <h3>Notes</h3>
      <ul>
        <li>Charter fees exclude VAT (paid to the tax authority) and APA (spent on the yacht's running costs during each charter).</li>
        <li>Commission follows the current settings: ${r.split.totalPercent}% of the charter fee, ${r.split.retailPercent}% to the retail broker and ${r.split.centralPercent}% to the central agent. Check each charter's contract.</li>
        ${r.anyEstimated ? '<li>Fees marked "estimated" are worked out from the yacht\'s weekly rate because no contract fee was recorded. Replace them with the contract figures.</li>' : ''}
        ${r.unpriced ? `<li>${r.unpriced} charter${r.unpriced > 1 ? 's have' : ' has'} no fee and no rate, so ${r.unpriced > 1 ? 'they are' : 'it is'} not in the totals.</li>` : ''}
        <li>A charter counts towards the season it starts in. Nights are counted in the month and season they fall in.</li>
      </ul>
    </section>`;
}
