// Contracts and payments screen.
//
//   #/contracts               charters from "Option held" onwards
//   #/contracts/<enquiryId>   the checklist and payment schedule for one
//
// Changes save as you make them.

import { getCollection, saveCollection, getSettings } from '../store.js';
import { CHECKLIST, TERMS_NOTICE, checklistProgress, contractSchedule } from '../contracts.js';
import { STATUSES } from '../enquiries.js';
import { ratesFromSettings, formatMoney } from '../calc/currency.js';
import { charterSettings } from '../calc/charter.js';
import { formatDate, formatDateRange, todayISO } from '../calc/dates.js';
import { escapeHTML } from './html.js';

const COLLECTION = 'contracts';

// Contracts are relevant once an option is held, and not for lost enquiries.
const FROM_STATUS = STATUSES.indexOf('Option held');
const isContractStage = (e) => e.status !== 'Lost' && STATUSES.indexOf(e.status) >= FROM_STATUS;

export function render(container, param, heading) {
  if (!param) return renderList(container);
  const enquiry = getCollection('enquiries').find((e) => e.id === param);
  if (!enquiry) {
    heading.textContent = 'Enquiry not found';
    container.insertAdjacentHTML('beforeend', '<p><a href="#/contracts">Back to contracts</a></p>');
    return;
  }
  heading.textContent = `Contract: ${enquiry.clientName}`;
  renderContract(container, enquiry);
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

function renderList(container) {
  const settings = getSettings();
  const rates = ratesFromSettings(settings);
  const today = todayISO();
  const enquiries = getCollection('enquiries').filter(isContractStage)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const contracts = getCollection(COLLECTION);
  const yachts = getCollection('yachts');

  const rows = enquiries.map((e) => {
    const contract = contracts.find((c) => c.enquiryId === e.id);
    const yacht = contract && yachts.find((y) => y.id === contract.yachtId);
    const progress = checklistProgress(contract?.checklist);
    let next = '<span class="muted">No yacht chosen</span>';
    if (yacht) {
      const s = contractSchedule({ contract, enquiry: e, yacht, settings, rates, today });
      const due = s.ok ? s.payments.find((p) => !p.receivedOn) : null;
      next = !s.ok ? escapeHTML(s.reason)
        : due ? `${{ deposit: 'Deposit', balance: 'Balance', apa: 'APA' }[due.id]} ${formatMoney(due.amount, s.currency)} <span class="pill pill--${due.status.tone}">${escapeHTML(due.status.text)}</span>`
          : '<span class="pill pill--green">All paid</span>';
    }
    return `<tr>
      <th scope="row" data-label="Client"><a href="#/contracts/${escapeHTML(e.id)}">${escapeHTML(e.clientName)}</a>
        <span class="cell-sub">${yacht ? escapeHTML(yacht.name) : ''}</span></th>
      <td data-label="Charter">${formatDateRange(e.startDate, e.endDate)}</td>
      <td data-label="Status"><span class="pill pill--neutral">${escapeHTML(e.status)}</span></td>
      <td data-label="Checklist" class="num">${progress.done} of ${progress.total}</td>
      <td data-label="Next payment"><span>${next}</span></td>
    </tr>`;
  });

  container.insertAdjacentHTML('beforeend', `
    <p>Charters from "Option held" onwards: the contract checklist and when each payment is due.</p>
    ${rows.length ? `
      <div class="table-wrap">
        <table class="data-table">
          <caption class="visually-hidden">Contracts and payments</caption>
          <thead><tr><th scope="col">Client</th><th scope="col">Charter</th><th scope="col">Status</th><th scope="col" class="num">Checklist</th><th scope="col">Next payment</th></tr></thead>
          <tbody>${rows.join('')}</tbody>
        </table>
      </div>` : '<p class="placeholder">No charters at the contract stage yet.</p>'}
  `);
}

// ---------------------------------------------------------------------------
// One contract
// ---------------------------------------------------------------------------

function renderContract(container, enquiry) {
  const settings = getSettings();
  const rates = ratesFromSettings(settings);
  const cs = charterSettings(settings);
  const yachts = getCollection('yachts');

  // Load or start the contract. A new one starts with the first yacht
  // from the proposal, if there is one.
  let contract = getCollection(COLLECTION).find((c) => c.enquiryId === enquiry.id);
  if (!contract) {
    const proposal = getCollection('proposals').find((p) => p.enquiryId === enquiry.id);
    contract = {
      id: `contract-${enquiry.id}`,
      enquiryId: enquiry.id,
      ...(enquiry.example ? { example: true } : {}),
      yachtId: proposal?.yachtIds[0] ?? '',
      vatOption: 0,
      deliveryFee: 0,
      signingDate: null,
      checklist: {},
    };
  }

  // Yachts to choose from: the proposal's yachts first, then all with a rate.
  const proposalIds = getCollection('proposals').find((p) => p.enquiryId === enquiry.id)?.yachtIds ?? [];
  const choices = [
    ...proposalIds.map((id) => yachts.find((y) => y.id === id)).filter(Boolean),
    ...yachts.filter((y) => y.rateFromWeekly != null && !proposalIds.includes(y.id)).sort((a, b) => a.name.localeCompare(b.name)),
  ];

  container.insertAdjacentHTML('beforeend', `
    <p><a href="#/contracts">Back to contracts</a> · <a href="#/enquiries/${escapeHTML(enquiry.id)}">Open the enquiry</a></p>
    <p class="muted">${formatDateRange(enquiry.startDate, enquiry.endDate)} · ${enquiry.guests} guests · status: ${escapeHTML(enquiry.status)}</p>
    ${enquiry.example ? '<p class="notice">This is a fictional example. The yacht is a real public listing.</p>' : ''}

    <form id="contract-form" novalidate>
      <fieldset class="section">
        <legend>The contract</legend>
        <div class="form-grid">
          <div class="field">
            <label for="yachtId">Yacht</label>
            <select id="yachtId" name="yachtId">
              <option value="">Choose a yacht</option>
              ${choices.map((y, i) => `<option value="${escapeHTML(y.id)}" ${y.id === contract.yachtId ? 'selected' : ''}>${escapeHTML(y.name)} (${escapeHTML(y.firm)})${i < proposalIds.length ? ', from the proposal' : ''}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="signingDate">Contract signed on</label>
            <input type="date" id="signingDate" name="signingDate" value="${contract.signingDate ?? ''}" max="${todayISO()}" aria-describedby="signingDate-hint">
            <p class="hint" id="signingDate-hint">Leave empty until signed. Dates below are then projected from today.</p>
          </div>
          <div class="field">
            <label for="deliveryFee">Delivery fee, in the yacht's currency (optional)</label>
            <input id="deliveryFee" name="deliveryFee" inputmode="numeric" value="${contract.deliveryFee || ''}">
          </div>
          <div class="field" id="vat-option-field" hidden>
            <label for="vatOption">VAT rate on the contract</label>
            <select id="vatOption" name="vatOption"></select>
          </div>
        </div>
      </fieldset>

      <section class="section" aria-labelledby="schedule-heading">
        <h2 id="schedule-heading">Payment schedule</h2>
        <p class="notice">${escapeHTML(TERMS_NOTICE)} Current settings: ${cs.depositPercent}% deposit on signing, balance ${cs.balanceDaysBefore} days and APA ${cs.apaDaysBefore} days before embarkation.</p>
        <div id="schedule"></div>
      </section>

      <fieldset class="section">
        <legend>Checklist <span class="muted" id="progress"></span></legend>
        <p class="hint">Tick each item when it is done. The date is filled in as today; change it if it happened earlier.</p>
        <ul class="checklist">
          ${CHECKLIST.map((item) => `
            <li>
              <div class="field field--tick">
                <input type="checkbox" id="check-${item.id}" name="check-${item.id}" ${contract.checklist[item.id] ? 'checked' : ''}>
                <label for="check-${item.id}">${escapeHTML(item.label)}</label>
              </div>
              <div class="checklist-date">
                <label for="date-${item.id}" class="visually-hidden">Date: ${escapeHTML(item.label)}</label>
                <input type="date" id="date-${item.id}" name="date-${item.id}" value="${contract.checklist[item.id] ?? ''}" max="${todayISO()}" ${contract.checklist[item.id] ? '' : 'hidden'}>
              </div>
            </li>`).join('')}
        </ul>
      </fieldset>
      <p class="status-message" role="status" id="saved-status"></p>
    </form>
  `);

  const form = container.querySelector('#contract-form');
  const scheduleEl = container.querySelector('#schedule');

  const draw = () => {
    const yacht = yachts.find((y) => y.id === contract.yachtId);
    const progress = checklistProgress(contract.checklist);
    container.querySelector('#progress').textContent = `(${progress.done} of ${progress.total} done)`;

    if (!yacht) {
      scheduleEl.innerHTML = '<p class="placeholder">Choose the yacht to work out the payments.</p>';
      form.querySelector('#vat-option-field').hidden = true;
      return;
    }
    const s = contractSchedule({ contract, enquiry, yacht, settings, rates, today: todayISO() });
    if (!s.ok) {
      scheduleEl.innerHTML = `<p class="placeholder">${escapeHTML(s.reason)}. Enter the agreed rate on the yacht's listing first.</p>`;
      return;
    }

    // Bahamas: let the user pick which VAT rate the contract uses.
    const vatField = form.querySelector('#vat-option-field');
    vatField.hidden = s.vatOptions.length < 2;
    form.elements.vatOption.innerHTML = s.vatOptions.map((label, i) => `<option value="${i}" ${i === (contract.vatOption ?? 0) ? 'selected' : ''}>${escapeHTML(label)}</option>`).join('');

    scheduleEl.innerHTML = `
      ${s.signed ? '' : '<p class="hint">Not signed yet: dates are projected as if the contract were signed today.</p>'}
      <div class="table-wrap">
        <table class="data-table">
          <caption class="visually-hidden">Payment schedule for ${escapeHTML(yacht.name)}</caption>
          <thead><tr><th scope="col">Payment</th><th scope="col" class="num">Amount</th><th scope="col">Due</th><th scope="col">Status</th></tr></thead>
          <tbody>
            ${s.payments.map((p) => `<tr>
              <th scope="row" data-label="Payment">${escapeHTML(p.label)}</th>
              <td data-label="Amount" class="num">${formatMoney(p.amount, s.currency)}</td>
              <td data-label="Due">${p.dueOnSigning && !s.signed ? 'On signing' : `${formatDate(p.dueDate)}${p.onSigning && p.id !== 'deposit' ? ' (on signing, late booking)' : ''}`}</td>
              <td data-label="Status"><span class="pill pill--${p.status.tone}">${escapeHTML(p.status.text)}</span></td>
            </tr>`).join('')}
            <tr class="total-row"><th scope="row" data-label="Total">Total</th><td data-label="Amount" class="num">${formatMoney(s.total, s.currency)}</td><td></td><td></td></tr>
          </tbody>
        </table>
      </div>
      ${s.vatOptions.length > 1 ? `<p class="hint">VAT: ${escapeHTML(s.vatLabel)}.</p>` : ''}`;
  };

  // Save on every change.
  form.addEventListener('change', (event) => {
    const name = event.target.name ?? '';

    // Ticking an item fills in today's date; unticking clears it.
    if (name.startsWith('check-')) {
      const id = name.slice(6);
      const dateBox = form.elements[`date-${id}`];
      dateBox.hidden = !event.target.checked;
      dateBox.value = event.target.checked ? (dateBox.value || todayISO()) : '';
      // Signing the contract also sets the signing date, and the other way round.
      if (id === 'contractSigned') form.elements.signingDate.value = dateBox.value;
    }
    if (name === 'date-contractSigned') form.elements.signingDate.value = event.target.value;
    if (name === 'signingDate') {
      form.elements['check-contractSigned'].checked = Boolean(event.target.value);
      form.elements['date-contractSigned'].value = event.target.value;
      form.elements['date-contractSigned'].hidden = !event.target.value;
    }
    if (name === 'yachtId') form.elements.vatOption.value = '0';

    const fee = Number(form.elements.deliveryFee.value.replace(/[,\s]/g, ''));
    contract = {
      ...contract,
      yachtId: form.elements.yachtId.value,
      signingDate: form.elements.signingDate.value || null,
      deliveryFee: fee > 0 ? fee : 0,
      vatOption: Number(form.elements.vatOption.value) || 0,
      checklist: Object.fromEntries(CHECKLIST.map((item) => [item.id, form.elements[`date-${item.id}`].value || null])),
    };
    const list = getCollection(COLLECTION).filter((c) => c.id !== contract.id);
    saveCollection(COLLECTION, [...list, contract]);
    container.querySelector('#saved-status').textContent = 'Saved.';
    draw();
  });

  draw();
}
