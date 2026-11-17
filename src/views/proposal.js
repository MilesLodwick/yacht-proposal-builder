// Proposal screen.
//
//   #/proposal               which enquiries have a proposal
//   #/proposal/<enquiryId>   the proposal for one enquiry
//
// A one-page proposal of three yachts (printable), a prompt to copy into
// Claude, and a plain email template as a fallback.

import { getCollection, saveCollection, getSettings } from '../store.js';
import { candidates, topThree, proposalContent } from '../proposal.js';
import { buildProposalPrompt, buildProposalEmail } from '../prompts/proposal.js';
import { ratesFromSettings, formatMoney } from '../calc/currency.js';
import { formatDateRange, todayISO } from '../calc/dates.js';
import { escapeHTML } from './html.js';

const COLLECTION = 'proposals';

export function render(container, param, heading) {
  if (!param) return renderList(container);
  const enquiry = getCollection('enquiries').find((e) => e.id === param);
  if (!enquiry) {
    heading.textContent = 'Enquiry not found';
    container.insertAdjacentHTML('beforeend', '<p><a href="#/proposal">Back to proposals</a></p>');
    return;
  }
  heading.textContent = `Proposal: ${enquiry.clientName}`;
  heading.classList.add('no-print');
  renderProposal(container, enquiry);
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

function renderList(container) {
  const open = getCollection('enquiries').filter((e) => !['Completed', 'Lost'].includes(e.status));
  const proposals = getCollection(COLLECTION);
  const yachts = getCollection('yachts');

  container.insertAdjacentHTML('beforeend', `
    <p>Choose an enquiry to build its proposal: three yachts with full costs, ready to print, plus a prompt for Claude and an email template.</p>
    ${open.length ? `
      <div class="table-wrap">
        <table class="data-table">
          <caption class="visually-hidden">Enquiries and their proposals</caption>
          <thead><tr><th scope="col">Client</th><th scope="col">Charter dates</th><th scope="col">Status</th><th scope="col">Proposal</th></tr></thead>
          <tbody>
            ${open.map((e) => {
              const p = proposals.find((x) => x.enquiryId === e.id);
              const names = p ? p.yachtIds.map((id) => yachts.find((y) => y.id === id)?.name).filter(Boolean).join(', ') : '';
              return `<tr>
                <th scope="row" data-label="Client"><a href="#/proposal/${escapeHTML(e.id)}">${escapeHTML(e.clientName)}</a></th>
                <td data-label="Dates">${formatDateRange(e.startDate, e.endDate)}</td>
                <td data-label="Status"><span class="pill pill--neutral">${escapeHTML(e.status)}</span></td>
                <td data-label="Proposal">${p ? escapeHTML(names || 'No yachts chosen') : '<span class="muted">Not started</span>'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : '<p class="placeholder">No open enquiries. Add one under Enquiries first.</p>'}
  `);
}

// ---------------------------------------------------------------------------
// One proposal
// ---------------------------------------------------------------------------

function renderProposal(container, enquiry) {
  const settings = getSettings();
  const rates = ratesFromSettings(settings);
  const yachts = getCollection('yachts');
  const options = candidates(enquiry, yachts, settings, rates);
  const itineraries = getCollection('itineraries');

  // Load the saved proposal, or start one with the default top three.
  let proposal = getCollection(COLLECTION).find((p) => p.enquiryId === enquiry.id);
  if (!proposal) {
    proposal = {
      id: `proposal-${enquiry.id}`,
      enquiryId: enquiry.id,
      ...(enquiry.example ? { example: true } : {}),
      yachtIds: topThree(options),
      deliveryFees: {},
      itineraryId: itineraries.find((i) => i.enquiryId === enquiry.id)?.id ?? null,
    };
    save(proposal);
  }

  const optionLabel = (c) => {
    const total = Math.max(...c.quote.options.map((o) => o.displayTotal ?? o.breakdown.total));
    const cur = c.quote.options[0].displayTotal != null ? enquiry.budgetCurrency : c.quote.currency;
    const band = c.quote.band ? c.quote.band.label.toLowerCase() : 'not compared';
    return `${c.yacht.name} (${c.yacht.firm}), ${formatMoney(total, cur)}, ${band}`;
  };

  container.insertAdjacentHTML('beforeend', `
    <div class="no-print">
      <p><a href="#/proposal">Back to proposals</a> · <a href="#/enquiries/${escapeHTML(enquiry.id)}">Open the enquiry</a></p>
      <form id="proposal-form" class="section" novalidate>
        <h2>Choose the yachts</h2>
        <p class="hint">Suggested: the yachts within budget that come closest to it. Only yachts with room for ${enquiry.guests} guests, in the right region or with the region not stated, and with a listed rate are offered.</p>
        ${[0, 1, 2].map((i) => `
          <div class="form-grid proposal-slot">
            <div class="field">
              <label for="yacht-${i}">Yacht ${i + 1}</label>
              <select id="yacht-${i}" name="yacht-${i}">
                <option value="">None</option>
                ${options.map((c) => `<option value="${escapeHTML(c.yacht.id)}" ${proposal.yachtIds[i] === c.yacht.id ? 'selected' : ''}>${escapeHTML(optionLabel(c))}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label for="delivery-${i}">Delivery fee, in the yacht's currency (optional)</label>
              <input id="delivery-${i}" name="delivery-${i}" inputmode="numeric" value="${proposal.deliveryFees[proposal.yachtIds[i]] ?? ''}">
            </div>
          </div>`).join('')}
        <div class="field">
          <label for="itineraryId">Itinerary to include</label>
          <select id="itineraryId" name="itineraryId">
            <option value="">None</option>
            ${itineraries.map((it) => `<option value="${escapeHTML(it.id)}" ${proposal.itineraryId === it.id ? 'selected' : ''}>${escapeHTML(it.name)}</option>`).join('')}
          </select>
        </div>
        <div class="button-row">
          <button type="button" class="button button--secondary button--small" id="reset-top-three">Reset to suggested three</button>
          <button type="button" class="button button--small" id="print">Print or save as PDF</button>
        </div>
      </form>
      <div id="warnings"></div>
    </div>

    <article id="proposal-doc" class="proposal-doc" aria-label="Proposal document"></article>

    <div class="no-print">
      <section class="section" aria-labelledby="prompt-heading">
        <h2 id="prompt-heading">Draft the email with Claude</h2>
        <p>Copy this prompt and paste it into Claude. It contains the figures above and asks Claude not to change them. Nothing is sent from this page.</p>
        <label for="prompt-text" class="visually-hidden">Prompt for Claude</label>
        <textarea id="prompt-text" class="copy-box" rows="12" readonly></textarea>
        <div class="button-row"><button type="button" class="button button--small" data-copy="prompt-text">Copy prompt</button></div>
        <p class="status-message" role="status" data-status-for="prompt-text"></p>
      </section>

      <section class="section" aria-labelledby="email-heading">
        <h2 id="email-heading">Or use the email template</h2>
        <p>A plain version to copy into your email and edit.</p>
        <label for="email-text" class="visually-hidden">Email template</label>
        <textarea id="email-text" class="copy-box" rows="12" readonly></textarea>
        <div class="button-row"><button type="button" class="button button--small" data-copy="email-text">Copy email</button></div>
        <p class="status-message" role="status" data-status-for="email-text"></p>
      </section>
    </div>
  `);

  const form = container.querySelector('#proposal-form');
  const doc = container.querySelector('#proposal-doc');
  const warningsEl = container.querySelector('#warnings');

  const draw = () => {
    const picks = proposal.yachtIds
      .map((id) => yachts.find((y) => y.id === id))
      .filter(Boolean)
      .map((yacht) => ({ yacht, deliveryFee: proposal.deliveryFees[yacht.id] ?? 0 }));
    const itinerary = itineraries.find((i) => i.id === proposal.itineraryId) ?? null;
    const content = proposalContent({ enquiry, picks, settings, rates, itinerary, today: todayISO() });

    warningsEl.innerHTML = content.warnings.length
      ? `<div class="notice notice--warn"><p><strong>Check before sending:</strong></p><ul>${content.warnings.map((w) => `<li>${escapeHTML(w)}</li>`).join('')}</ul></div>`
      : '';
    doc.innerHTML = documentHTML(content, enquiry);
    container.querySelector('#prompt-text').value = buildProposalPrompt(content);
    container.querySelector('#email-text').value = buildProposalEmail(content);
  };

  form.addEventListener('change', (event) => {
    // A different yacht in a slot starts with no delivery fee.
    const slot = event.target.name?.match(/^yacht-(\d)$/)?.[1];
    if (slot) form.elements[`delivery-${slot}`].value = '';

    const ids = [0, 1, 2].map((i) => form.elements[`yacht-${i}`].value).filter(Boolean);
    const fees = {};
    [0, 1, 2].forEach((i) => {
      const id = form.elements[`yacht-${i}`].value;
      const fee = Number(form.elements[`delivery-${i}`].value.replace(/[,\s]/g, ''));
      if (id && fee > 0) fees[id] = fee;
    });
    proposal = { ...proposal, yachtIds: ids, deliveryFees: fees, itineraryId: form.elements.itineraryId.value || null };
    save(proposal);
    draw();
  });

  form.querySelector('#reset-top-three').addEventListener('click', () => {
    proposal = { ...proposal, yachtIds: topThree(options), deliveryFees: {} };
    save(proposal);
    [0, 1, 2].forEach((i) => {
      form.elements[`yacht-${i}`].value = proposal.yachtIds[i] ?? '';
      form.elements[`delivery-${i}`].value = '';
    });
    draw();
  });

  form.querySelector('#print').addEventListener('click', () => window.print());

  // Copy buttons: use the clipboard, or select the text if that is blocked.
  for (const button of container.querySelectorAll('[data-copy]')) {
    button.addEventListener('click', async () => {
      const box = container.querySelector(`#${button.dataset.copy}`);
      const status = container.querySelector(`[data-status-for="${button.dataset.copy}"]`);
      try {
        await navigator.clipboard.writeText(box.value);
        status.textContent = 'Copied.';
      } catch {
        box.focus();
        box.select();
        status.textContent = 'Selected. Press Cmd+C (Mac) or Ctrl+C (Windows) to copy.';
      }
    });
  }

  draw();
}

function save(proposal) {
  const list = getCollection(COLLECTION).filter((p) => p.id !== proposal.id);
  saveCollection(COLLECTION, [...list, proposal]);
}

// ---------------------------------------------------------------------------
// The printable document
// ---------------------------------------------------------------------------

function documentHTML(c, enquiry) {
  return `
    <header class="proposal-head">
      <p class="proposal-kicker">Charter proposal</p>
      <h2>${escapeHTML(c.clientName)}</h2>
      <dl class="proposal-facts">
        <div><dt>Dates</dt><dd>${escapeHTML(c.dates)} (${c.days} days)</dd></div>
        <div><dt>Starting in</dt><dd>${escapeHTML(c.startsIn)}</dd></div>
        <div><dt>Guests</dt><dd>${c.guests}</dd></div>
        <div><dt>Budget</dt><dd>${escapeHTML(c.budget)}</dd></div>
        <div><dt>Prepared</dt><dd>${escapeHTML(c.prepared)}</dd></div>
      </dl>
      ${enquiry.example ? '<p class="proposal-example">Example proposal for a fictional client.</p>' : ''}
    </header>

    ${c.yachts.length ? `<div class="proposal-yachts">${c.yachts.map(yachtHTML).join('')}</div>` : '<p class="placeholder">Choose at least one yacht above.</p>'}

    ${c.itinerary ? `
      <section class="proposal-itinerary">
        <h3>Suggested itinerary</h3>
        <ol>${c.itinerary.days.map((d) => `<li><span class="num">${escapeHTML(d.date)}</span> ${escapeHTML(d.route)}${d.detail ? ` <span class="muted">(${escapeHTML(d.detail)})</span>` : ''}</li>`).join('')}</ol>
      </section>` : ''}

    <section class="proposal-notes">
      <h3>Notes</h3>
      <ul>${c.notes.map((n) => `<li>${escapeHTML(n)}</li>`).join('')}</ul>
    </section>`;
}

function yachtHTML(y) {
  return `
    <section class="proposal-yacht">
      <h3>${escapeHTML(y.name)}</h3>
      <p class="muted">${escapeHTML(y.specs)}</p>
      ${y.ok ? `
        <p class="proposal-rate">From ${escapeHTML(y.weeklyRate)} <span class="muted">(indicative)</span></p>
        <table class="breakdown-table">
          <caption class="visually-hidden">Costs for ${escapeHTML(y.name)}</caption>
          <tbody>
            ${y.lines.map((l) => `<tr><th scope="row">${escapeHTML(l.label)}</th><td class="num">${escapeHTML(l.amount)}</td></tr>`).join('')}
            <tr class="total-row"><th scope="row">Total</th><td class="num">${escapeHTML(y.total)}</td></tr>
          </tbody>
        </table>
        ${y.clientTotal ? `<p class="muted">That is ${escapeHTML(y.clientTotal)}.</p>` : ''}
        <p class="muted">Gratuity guide (optional, not included): ${escapeHTML(y.gratuity)}</p>
      ` : `<p>${escapeHTML(y.reason)}. Rate to be confirmed for your dates.</p>`}
      <p class="source-line">Rate source: ${y.sourceUrl ? `<a href="${escapeHTML(y.sourceUrl)}" target="_blank" rel="noopener">${escapeHTML(y.source)}</a>` : escapeHTML(y.source)}, checked ${escapeHTML(y.checked)}</p>
    </section>`;
}
