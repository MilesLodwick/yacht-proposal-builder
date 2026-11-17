// Deal tracker: a yacht sale from offer to commission, following the
// stages of the MYBA Memorandum of Agreement (MOA).
// Pure functions, tested in tests/deals.test.js.
//
// A deal:
// { id, listingId, buyer, buyerBroker, agreedPrice, currency,
//   defectsOutcome: '' | 'resolved' | 'price reduced' | 'none found',
//   priceReduction,
//   stages: { offer: { date, docs: { writtenOffer: true }, notes }, ... } }
//
// A stage is done once it has a date. Its documents are a checklist; a
// done stage with documents still missing is flagged.

import { roundMoney } from './calc/charter.js';
import { moaDeposit, salesSettings } from './calc/sales.js';
import { paymentStatus } from './contracts.js';
import { parseDate, addDays } from './calc/dates.js';

export const DEAL_STAGES = [
  { id: 'offer', label: 'Offer agreed', docs: [
    { id: 'writtenOffer', label: 'Written offer from the buyer' },
    { id: 'offerAccepted', label: 'Offer accepted by the seller in writing' },
  ] },
  { id: 'moa', label: 'MOA signed', docs: [
    { id: 'moaBuyer', label: 'MYBA MOA signed by the buyer' },
    { id: 'moaSeller', label: 'MYBA MOA signed by the seller' },
    { id: 'kyc', label: 'Buyer KYC and anti-money-laundering checks done' },
  ] },
  { id: 'deposit', label: 'Deposit received', docs: [
    { id: 'depositCleared', label: 'Deposit cleared in the escrow or client account' },
  ] },
  { id: 'seaTrial', label: 'Sea trial', docs: [
    { id: 'seaTrialDone', label: 'Sea trial completed' },
  ] },
  { id: 'survey', label: 'Survey', docs: [
    { id: 'surveyReport', label: 'Survey report received' },
  ] },
  { id: 'defects', label: 'Defects resolved or price reduced', docs: [
    { id: 'defectsList', label: 'Defects list agreed between buyer and seller' },
  ] },
  { id: 'acceptance', label: 'Acceptance letter', docs: [
    { id: 'acceptanceSigned', label: 'Letter of acceptance signed by the buyer' },
  ] },
  { id: 'closing', label: 'Closing', docs: [
    { id: 'balancePaid', label: 'Balance paid' },
    { id: 'billOfSale', label: 'Bill of sale signed' },
    { id: 'protocol', label: 'Protocol of delivery and acceptance signed' },
  ] },
  { id: 'commission', label: 'Commission', docs: [
    { id: 'commissionInvoiced', label: 'Commission invoiced' },
    { id: 'commissionReceived', label: 'Commission received' },
  ] },
];

export const DEFECTS_OUTCOMES = ['', 'none found', 'resolved', 'price reduced'];

const stageOf = (deal, id) => deal.stages?.[id] ?? { date: null, docs: {}, notes: '' };

// The money: deposit and its deadline, final price after any reduction
// for defects, balance due at closing, and commission.
export function dealFigures(deal, settings) {
  const s = salesSettings(settings);
  const commissionPercent = settings.find((x) => x.id === 'sale.commissionPercent')?.value ?? 0;
  const reduction = deal.defectsOutcome === 'price reduced' ? (deal.priceReduction ?? 0) : 0;
  const finalPrice = roundMoney(deal.agreedPrice - reduction);

  // The deposit is a % of the price in the MOA, due a number of banking
  // days after the MOA is signed.
  const moaDate = stageOf(deal, 'moa').date;
  const deposit = moaDate
    ? moaDeposit(deal.agreedPrice, moaDate, s)
    : { amount: roundMoney(deal.agreedPrice * (s.depositPercent / 100)), dueDate: null };

  return {
    agreedPrice: deal.agreedPrice,
    reduction,
    finalPrice,
    deposit: { amount: deposit.amount, dueDate: deposit.dueDate, percent: s.depositPercent, bankingDays: s.depositBankingDays },
    balance: roundMoney(finalPrice - deposit.amount),
    commission: { percent: commissionPercent, amount: roundMoney(finalPrice * (commissionPercent / 100)) },
  };
}

// The deposit's status pill: received, overdue, due soon, or waiting for
// the MOA to be signed.
export function depositStatus(deal, settings, today) {
  const figures = dealFigures(deal, settings);
  const received = stageOf(deal, 'deposit').date;
  if (!figures.deposit.dueDate && !received) return { tone: 'neutral', text: 'Due after the MOA is signed' };
  const dueSoonDays = settings.find((x) => x.id === 'alerts.paymentDueSoonDays')?.value ?? 14;
  return paymentStatus({ dueDate: figures.deposit.dueDate, receivedOn: received, signed: true }, today, dueSoonDays);
}

// How far along the deal is.
export function dealProgress(deal) {
  const done = DEAL_STAGES.filter((st) => parseDate(stageOf(deal, st.id).date));
  const current = DEAL_STAGES.find((st) => !parseDate(stageOf(deal, st.id).date)) ?? null;
  return { done: done.length, total: DEAL_STAGES.length, current, closed: Boolean(parseDate(stageOf(deal, 'closing').date)) };
}

// Things to check on a deal. Never blocks saving.
export function dealWarnings(deal) {
  const warnings = [];
  let previous = null;
  for (const st of DEAL_STAGES) {
    const stage = stageOf(deal, st.id);
    if (!parseDate(stage.date)) continue;
    const missing = st.docs.filter((d) => !stage.docs?.[d.id]);
    if (missing.length) warnings.push(`${st.label}: still missing ${missing.map((d) => d.label.toLowerCase()).join('; ')}.`);
    if (previous && stage.date < previous.date) warnings.push(`${st.label} is dated before ${previous.label.toLowerCase()}. Check the dates.`);
    previous = { label: st.label, date: stage.date };
  }
  if (parseDate(stageOf(deal, 'defects').date) && !deal.defectsOutcome) {
    warnings.push('Defects stage: record whether defects were none, resolved, or the price was reduced.');
  }
  if (deal.defectsOutcome === 'price reduced' && !(deal.priceReduction > 0)) {
    warnings.push('Defects stage: enter the price reduction agreed.');
  }
  return warnings;
}

// Check a new deal.
export function validateDeal(input) {
  const errors = {};
  if (!input.listingId) errors.listingId = 'Choose the boat being sold.';
  if (!String(input.buyer ?? '').trim()) errors.buyer = 'Enter a buyer reference.';
  const price = Number(String(input.agreedPrice ?? '').replace(/[,\s]/g, ''));
  if (!(price > 0)) errors.agreedPrice = 'Enter the agreed price.';
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, agreedPrice: price };
}

// Sample deals store dates as days from today.
export function buildSampleDeals(templates, today) {
  return templates.map((t, i) => ({
    id: `sample-deal-${i + 1}`,
    example: true,
    listingId: t.listingId,
    buyer: t.buyer,
    buyerBroker: t.buyerBroker ?? '',
    agreedPrice: t.agreedPrice,
    currency: t.currency,
    defectsOutcome: t.defectsOutcome ?? '',
    priceReduction: t.priceReduction ?? null,
    stages: Object.fromEntries(Object.entries(t.stages).map(([id, st]) => [id, {
      date: st.daysAgo == null ? null : addDays(today, -st.daysAgo),
      docs: Object.fromEntries((st.docs ?? []).map((d) => [d, true])),
      notes: st.notes ?? '',
    }])),
  }));
}
