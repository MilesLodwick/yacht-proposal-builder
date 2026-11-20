// Seller view: how an owner's asking price compares with similar boats.
//
//   #/seller-view          choose a listing
//   #/seller-view/<id>     comparables, median and range per metre, and
//                          where the owner's price sits. Printable.
//
// Always labelled: asking prices, not sold prices.

import { getCollection, getSettings } from '../store.js';
import { findComparables, priceStats, pricePosition, pricePerMetre, salesSettings, ASKING_NOT_SOLD } from '../calc/sales.js';
import { ratesFromSettings, formatMoney, rateNote } from '../calc/currency.js';
import { formatDate, todayISO } from '../calc/dates.js';
import { boatPhoto } from './boat-photos.js';
import { escapeHTML } from './html.js';

export function render(container, param, heading) {
  const boats = getCollection('forSale');
  const subject = param ? boats.find((b) => b.id === param) : null;
  if (subject) heading.textContent = `Seller view: ${subject.name}`;
  heading.classList.add('no-print');

  // Only boats that can be compared: type, length, year and a price.
  const usable = boats.filter((b) => b.type && b.lengthM && b.year && b.askingPrice != null && b.currency)
    .sort((a, b) => a.name.localeCompare(b.name));

  container.insertAdjacentHTML('beforeend', `
    <form class="section no-print" novalidate>
      <p>How an owner's asking price compares with similar boats for sale. ${ASKING_NOT_SOLD}</p>
      <div class="field">
        <label for="subject">Listing</label>
        <select id="subject">
          <option value="">Choose a listing</option>
          ${usable.map((b) => `<option value="${escapeHTML(b.id)}" ${b.id === subject?.id ? 'selected' : ''}>${escapeHTML(b.name)}, ${b.lengthM} m, ${b.year} (${escapeHTML(b.firm)})</option>`).join('')}
        </select>
        <p class="hint">Only listings with a type, length, year and price can be compared (${usable.length} of ${boats.length}).</p>
      </div>
      ${subject ? `<div class="button-row"><a class="button button--secondary button--small" href="#/listings/${escapeHTML(subject.id)}">Open the listing</a><button type="button" class="button button--small" id="print">Print or save as PDF</button></div>` : ''}
    </form>
    <article id="seller-doc" class="proposal-doc owner-report" aria-label="Seller view"></article>
  `);

  container.querySelector('#subject').addEventListener('change', (event) => {
    location.hash = event.target.value ? `#/seller-view/${event.target.value}` : '#/seller-view';
  });
  container.querySelector('#print')?.addEventListener('click', () => window.print());

  const doc = container.querySelector('#seller-doc');
  if (!subject) {
    doc.innerHTML = '<p class="placeholder">Choose a listing to compare.</p>';
    return;
  }
  if (!usable.includes(subject)) {
    doc.innerHTML = '<p class="placeholder">This listing is missing its type, length, year or price, so it cannot be compared. Fill them in on the listing first.</p>';
    return;
  }

  const settings = getSettings();
  const s = salesSettings(settings);
  const rates = ratesFromSettings(settings);
  const ranges = { lengthPercent: s.compLengthPercent, years: s.compYears };
  const { comparables, excluded } = findComparables(subject, boats, ranges, rates);
  const stats = priceStats(comparables);
  const subjectPpm = pricePerMetre(subject.askingPrice, subject.lengthM);
  const position = pricePosition(subjectPpm, comparables);
  const cur = subject.currency;
  const money = (n) => formatMoney(n, cur);

  const left = [
    excluded.noLength && `${excluded.noLength} with no length`,
    excluded.noYear && `${excluded.noYear} with no year`,
    excluded.noType && `${excluded.noType} with no type`,
    excluded.noPrice && `${excluded.noPrice} with no price`,
    excluded.noRate && `${excluded.noRate} priced in another currency (add the rate in Settings)`,
  ].filter(Boolean);

  // Where things sit on a line from the lowest to the highest per metre.
  const lo = Math.min(stats.min ?? subjectPpm, subjectPpm);
  const hi = Math.max(stats.max ?? subjectPpm, subjectPpm);
  const at = (v) => (hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100);
  // Near either end, a label hangs inwards so it is not cut off.
  const edge = (pos) => (pos > 85 ? 'at-end' : pos < 15 ? 'at-start' : '');

  doc.innerHTML = `
    <header class="proposal-head">
      <p class="proposal-kicker">Seller view: price comparison</p>
      <h2>${escapeHTML(subject.name)}</h2>
      ${boatPhoto(subject.id, 'large')}
      <dl class="proposal-facts">
        <div><dt>Asking price</dt><dd>${money(subject.askingPrice)}</dd></div>
        <div><dt>Length and year</dt><dd>${subject.lengthM} m, ${subject.year}</dd></div>
        <div><dt>Type</dt><dd>${escapeHTML(subject.type)}</dd></div>
        <div><dt>Prepared</dt><dd>${formatDate(todayISO())}</dd></div>
      </dl>
    </header>

    <p class="asking-label"><strong>${ASKING_NOT_SOLD}</strong> Sold prices are private. These are what sellers are asking for similar boats on public listings.</p>

    <div class="report-figures">
      <div><span class="figure-label">This boat, per metre</span><span class="figure figure--main num">${money(subjectPpm)}</span></div>
      <div><span class="figure-label">Comparables' median</span><span class="figure num">${stats.count ? money(stats.median) : '-'}</span></div>
      <div><span class="figure-label">Range</span><span class="figure figure--range">${stats.count ? `${money(stats.min)} to ${money(stats.max)}` : '-'}</span></div>
      <div><span class="figure-label">Comparables</span><span class="figure num">${stats.count}</span></div>
    </div>

    ${position ? `
      <p class="position-line">At ${money(subjectPpm)} a metre, the asking price is <strong>${position.text}</strong>. ${position.cheaper} of ${position.of} comparable${position.of === 1 ? ' is' : 's are'} cheaper per metre.</p>
      <div class="range-line" aria-hidden="true">
        <span class="range-track"></span>
        ${comparables.map((c) => `<span class="range-dot" style="left:${at(c.pricePerMetre)}%"></span>`).join('')}
        <span class="range-median ${edge(at(stats.median))}" style="left:${at(stats.median)}%"><span>Median</span></span>
        <span class="range-subject ${edge(at(subjectPpm))}" style="left:${at(subjectPpm)}%"><span>This boat</span></span>
      </div>
      <p class="range-ends num"><span>${money(lo)}</span><span>${money(hi)} a metre</span></p>`
      : '<p class="placeholder">No comparable boats found. Try widening the ranges in Settings.</p>'}

    <section>
      <h3>Comparable boats</h3>
      <p class="hint">Same type (${escapeHTML(subject.type.toLowerCase())}), length within ${s.compLengthPercent}% (${(subject.lengthM * (1 - s.compLengthPercent / 100)).toFixed(1)} to ${(subject.lengthM * (1 + s.compLengthPercent / 100)).toFixed(1)} m), built within ${s.compYears} years (${subject.year - s.compYears} to ${Math.min(subject.year + s.compYears, Number(todayISO().slice(0, 4)))}). Ranges are set in Settings.${left.length ? ` Left out: ${left.join(', ')}.` : ''}</p>
      ${comparables.length ? `
        <div class="table-wrap">
          <table class="handover-table report-table">
            <caption class="visually-hidden">Comparable boats, cheapest per metre first</caption>
            <thead><tr>
              <th scope="col">Boat</th><th scope="col">Location</th><th scope="col" class="num">Length</th><th scope="col" class="num">Year</th>
              <th scope="col" class="num">Asking price</th><th scope="col" class="num">Per metre</th>
            </tr></thead>
            <tbody>
              ${comparables.map((c) => `<tr>
                <th scope="row">${boatPhoto(c.id)}${c.sourceUrl ? `<a href="${escapeHTML(c.sourceUrl)}" target="_blank" rel="noopener">${escapeHTML(c.name)}</a>` : escapeHTML(c.name)}<span class="cell-sub">${escapeHTML(c.firm)}</span></th>
                <td>${escapeHTML(c.location ?? '-')}</td>
                <td class="num">${c.lengthM} m</td>
                <td class="num">${c.year}</td>
                <td class="num">${money(c.priceInSubjectCurrency)}${c.currency !== cur ? `<span class="cell-sub">from ${escapeHTML(c.currency)}</span>` : ''}</td>
                <td class="num">${money(c.pricePerMetre)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>` : ''}
    </section>

    <section class="proposal-notes">
      <h3>Notes</h3>
      <ul>
        <li>${ASKING_NOT_SOLD} Boats often sell below their asking price, so treat these as a ceiling, not a valuation.</li>
        <li>Price per metre ignores condition, equipment, refits, VAT status and location, which can all move the price.</li>
        ${comparables.some((c) => c.currency !== cur) ? `<li>Some prices are converted. ${escapeHTML(rateNote(cur === 'EUR' ? comparables.find((c) => c.currency !== cur).currency : cur, rates))}.</li>` : ''}
        ${[subject, ...comparables].some((b) => b.currencyAsListed?.includes('Rightboat')) ? '<li>Prices marked "USD (Rightboat)" were converted by the listing site from the seller\'s own currency.</li>' : ''}
        <li>Sources: each boat's public listing, checked ${formatDate(subject.dateChecked)}.</li>
      </ul>
    </section>`;
}
