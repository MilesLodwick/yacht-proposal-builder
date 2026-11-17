// Contracts and payments: what has to happen between "yes" and embarkation.
// Pure functions, tested in tests/contracts.test.js.
//
// One contract record per enquiry:
//   { enquiryId, yachtId, vatOption, signingDate, deliveryFee,
//     checklist: { kyc: '2026-11-01' or null, contractSigned: ..., ... } }
// Each checklist item holds the date it was done, or null if not yet.

import { quoteYacht } from './selection.js';
import { paymentSchedule, charterSettings } from './calc/charter.js';
import { daysBetween, formatDate, addDays } from './calc/dates.js';
import { charterFromEnquiry } from './proposal.js';

// The checklist, in the order things usually happen.
// "payment" links an item to a row of the payment schedule.
export const CHECKLIST = [
  { id: 'kyc', label: 'KYC done (client identity and source of funds checked)' },
  { id: 'contractSigned', label: 'Contract signed' },
  { id: 'depositReceived', label: 'Deposit received', payment: 'deposit' },
  { id: 'balanceReceived', label: 'Balance received', payment: 'balance' },
  { id: 'apaReceived', label: 'APA received', payment: 'apa' },
  { id: 'preferenceSheet', label: 'Preference sheet received' },
  { id: 'guestList', label: 'Guest list received' },
];

export const TERMS_NOTICE = 'Payment terms vary by contract. These dates use the defaults in Settings. Always check the signed contract.';

// "4 of 7 done"
export function checklistProgress(checklist) {
  const done = CHECKLIST.filter((item) => checklist?.[item.id]).length;
  return { done, total: CHECKLIST.length };
}

// The pill for one payment.
//   received          green  "Received 3 Nov 2026"
//   past due date     red    "Overdue by 4 days"
//   due soon          amber  "Due in 6 days" / "Due today"
//   otherwise                "Due 10 Jun 2027"
// dueSoonDays is a setting (default 14).
export function paymentStatus({ dueDate, receivedOn, dueOnSigning, signed }, today, dueSoonDays) {
  if (receivedOn) return { tone: 'green', text: `Received ${formatDate(receivedOn)}` };
  if (dueOnSigning && !signed) return { tone: 'neutral', text: 'Due on signing' };
  const days = daysBetween(today, dueDate);
  if (days < 0) return { tone: 'red', text: `Overdue by ${-days} day${days === -1 ? '' : 's'}` };
  if (days === 0) return { tone: 'amber', text: 'Due today' };
  if (days <= dueSoonDays) return { tone: 'amber', text: `Due in ${days} day${days === 1 ? '' : 's'}` };
  return { tone: 'neutral', text: `Due ${formatDate(dueDate)}` };
}

// The payment schedule for a contract, with each payment's status.
// Until the contract is signed, dates are projected as if it were signed
// today, and the deposit shows "Due on signing".
export function contractSchedule({ contract, enquiry, yacht, settings, rates, today }) {
  const quote = quoteYacht(yacht, charterFromEnquiry(enquiry), settings, rates, { deliveryFee: contract.deliveryFee ?? 0 });
  if (!quote.ok) return { ok: false, reason: quote.reason };

  const option = quote.options[Math.min(contract.vatOption ?? 0, quote.options.length - 1)];
  const cs = charterSettings(settings);
  const signed = Boolean(contract.signingDate);
  const dueSoonDays = settings.find((s) => s.id === 'alerts.paymentDueSoonDays')?.value ?? 14;

  const payments = paymentSchedule({
    breakdown: option.breakdown,
    signingDate: contract.signingDate || today,
    embarkationDate: enquiry.startDate,
    depositPercent: cs.depositPercent,
    balanceDaysBefore: cs.balanceDaysBefore,
    apaDaysBefore: cs.apaDaysBefore,
  }).map((p) => {
    const item = CHECKLIST.find((c) => c.payment === p.id);
    const receivedOn = contract.checklist?.[item.id] ?? null;
    const dueOnSigning = p.onSigning;
    return {
      ...p,
      receivedOn,
      dueOnSigning,
      status: paymentStatus({ dueDate: p.dueDate, receivedOn, dueOnSigning, signed }, today, dueSoonDays),
    };
  });

  return {
    ok: true,
    currency: quote.currency,
    vatOptions: quote.options.map((o) => o.vatLabel),
    vatLabel: option.vatLabel,
    total: option.breakdown.total,
    signed,
    payments,
  };
}

// Sample contracts store dates as "days ago" or "days from now" so the
// demo always looks current. A checklist value of null means not done yet.
export function buildSampleContracts(templates, today) {
  return templates.map((t, i) => ({
    id: `sample-contract-${i + 1}`,
    example: true,
    enquiryId: t.enquiryId,
    yachtId: t.yachtId,
    vatOption: t.vatOption ?? 0,
    deliveryFee: t.deliveryFee ?? 0,
    signingDate: t.signedDaysAgo == null ? null : addDays(today, -t.signedDaysAgo),
    checklist: Object.fromEntries(CHECKLIST.map((item) => {
      const daysAgo = t.checklistDaysAgo?.[item.id];
      return [item.id, daysAgo == null ? null : addDays(today, -daysAgo)];
    })),
  }));
}
