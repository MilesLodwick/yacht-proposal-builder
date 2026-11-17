// Charter maths. Pure functions: numbers in, numbers out.
//
// Every percentage and deadline comes from Settings (data/settings.json),
// passed in as an argument. Nothing here is a hidden "magic number".
//
// Money is rounded to the cent at each step, the way an invoice would be,
// so the parts of a payment schedule always add up to the total.

import { addDays, daysBetween } from './dates.js';

// Round to 2 decimal places (cents). Avoids results like 0.1 + 0.2 = 0.30000000000000004.
export function roundMoney(amount) {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Wording shown with a cost breakdown
// ---------------------------------------------------------------------------

export const LINE_LABELS = {
  charterFee: 'Charter fee',
  deliveryFee: 'Delivery fee',
  redeliveryFee: 'Redelivery fee',
  extras: 'Extras',
  vat: 'VAT on charter fee and delivery',
  apa: 'APA (refundable if unspent)',
  apaVat: 'VAT on APA',
  total: 'Total',
  gratuity: 'Crew gratuity guide (optional, not included, no VAT)',
};

export const VAT_NOTE = 'VAT uses the rate of the country where the charter starts. Some countries, such as Croatia, charge VAT on days spent in their waters, so multi-country charters can differ.';

// ---------------------------------------------------------------------------
// Reading the charter settings
// ---------------------------------------------------------------------------

// Pull the numbers this file needs out of the settings list, by id.
export function charterSettings(settings) {
  const value = (id) => settings.find((s) => s.id === id)?.value ?? null;
  return {
    apaPercent: value('apa.default'),
    gratuityLowPercent: value('gratuity.low'),
    gratuityHighPercent: value('gratuity.high'),
    budgetTolerancePercent: value('budget.overTolerance'),
    depositPercent: value('payment.depositPercent'),
    balanceDaysBefore: value('payment.balanceDaysBefore'),
    apaDaysBefore: value('payment.apaDaysBefore'),
  };
}

// ---------------------------------------------------------------------------
// VAT by embarkation country
// ---------------------------------------------------------------------------

// VAT uses the rate of the country where the charter starts (embarkation).
// Each country points at its VAT rate setting(s) and its "VAT on APA" setting.
//   Greece   reduced rate if the charter is eligible, standard rate if not
//   Bahamas  two rates because the sources disagree; the screen shows both
export const EMBARKATION_COUNTRIES = [
  { id: 'france', label: 'France', vat: ['vat.france'], vatOnApa: 'vatOnApa.france' },
  { id: 'italy', label: 'Italy', vat: ['vat.italy'], vatOnApa: 'vatOnApa.italy' },
  { id: 'spain', label: 'Spain (incl. Balearics)', vat: ['vat.spain'], vatOnApa: 'vatOnApa.spain' },
  { id: 'croatia', label: 'Croatia', vat: ['vat.croatia'], vatOnApa: 'vatOnApa.croatia' },
  { id: 'greece', label: 'Greece', vat: ['vat.greece.eligible'], vatIfNotEligible: ['vat.greece.standard'], vatOnApa: 'vatOnApa.greece' },
  { id: 'montenegro', label: 'Montenegro', vat: ['vat.montenegro'], vatOnApa: 'vatOnApa.montenegro' },
  { id: 'caribbean', label: 'Caribbean', vat: ['vat.caribbean'], vatOnApa: 'vatOnApa.caribbean' },
  { id: 'bahamas', label: 'Bahamas', vat: ['vat.bahamas.lower', 'vat.bahamas.higher'], vatOnApa: 'vatOnApa.bahamas' },
];

// The VAT rate(s) for the embarkation country, e.g.
//   vatRatesFor('italy', settings)    -> [{ rate: 22, label: 'Italy', settingId: 'vat.italy' }]
//   vatRatesFor('bahamas', settings)  -> two entries, 10 and 14
// "greekEligible" is the tick box on the enquiry.
export function vatRatesFor(countryId, settings, { greekEligible = true } = {}) {
  const country = EMBARKATION_COUNTRIES.find((c) => c.id === countryId);
  if (!country) return [];
  const ids = country.vatIfNotEligible && !greekEligible ? country.vatIfNotEligible : country.vat;
  return ids.map((id) => {
    const setting = settings.find((s) => s.id === id);
    return { rate: setting.value, label: setting.label, settingId: id };
  });
}

// Does this country charge VAT on the APA? A setting per country, off by default.
export function vatOnApaFor(countryId, settings) {
  const country = EMBARKATION_COUNTRIES.find((c) => c.id === countryId);
  if (!country) return false;
  return settings.find((s) => s.id === country.vatOnApa)?.value === true;
}

// ---------------------------------------------------------------------------
// Charter fee and cost breakdown
// ---------------------------------------------------------------------------

// Pro rata charter fee: the weekly rate divided by 7, times the number of
// days. A 10-day charter on a EUR 350,000 a week yacht costs EUR 500,000.
export function proRataFee(weeklyRate, days) {
  return roundMoney((weeklyRate / 7) * days);
}

// The full cost of chartering one yacht, in the yacht's own currency.
//
//   charter fee     pro rata from the weekly rate
//   delivery fee    if the yacht must travel to the start port
//   redelivery fee  if it must travel back from the end port
//   extras          anything else agreed, e.g. a jet ski
//   VAT             at the embarkation country's rate, on the charter fee
//                   plus any delivery and redelivery fee
//   APA             Advance Provisioning Allowance: a % of the charter fee
//                   (before VAT) that pays for fuel, food, drink and berths
//                   during the charter. Refundable if unspent.
//   VAT on APA      only where the country charges it (a setting, off by default)
//   total           everything above: what the client pays
//
// Gratuity is NOT in the total and never has VAT. It is a guide only, at
// the client's discretion and not part of the contract.
export function costBreakdown({
  weeklyRate, days, vatRate, apaPercent, vatOnApa = false,
  deliveryFee = 0, redeliveryFee = 0, extras = [],
  gratuityLowPercent = 0, gratuityHighPercent = 0,
}) {
  const charterFee = proRataFee(weeklyRate, days);
  const extrasTotal = roundMoney(extras.reduce((sum, e) => sum + (e.amount || 0), 0));

  const vatBase = roundMoney(charterFee + deliveryFee + redeliveryFee);
  const vat = roundMoney(vatBase * (vatRate / 100));

  const apa = roundMoney(charterFee * (apaPercent / 100));
  const apaVat = vatOnApa ? roundMoney(apa * (vatRate / 100)) : 0;

  const total = roundMoney(charterFee + deliveryFee + redeliveryFee + extrasTotal + vat + apa + apaVat);

  return {
    charterFee,
    deliveryFee: roundMoney(deliveryFee),
    redeliveryFee: roundMoney(redeliveryFee),
    extrasTotal,
    vatRate,
    vatBase,
    vat,
    apaPercent,
    apa,
    vatOnApa,
    apaVat,
    total,
    gratuityGuide: {
      low: roundMoney(charterFee * (gratuityLowPercent / 100)),
      high: roundMoney(charterFee * (gratuityHighPercent / 100)),
    },
  };
}

// ---------------------------------------------------------------------------
// Budget band
// ---------------------------------------------------------------------------

export const BUDGET_BANDS = {
  WITHIN: { id: 'within', label: 'Within budget', tone: 'green' },
  OVER: { id: 'over', label: 'Slightly over', tone: 'amber' },
  OUT: { id: 'out', label: 'Over budget', tone: 'red' },
};

// Compare the all-in total (not including the gratuity guide) with the
// client's budget, in the same currency.
// Within budget, up to X% over (a setting, default 10%), or out.
// budgetBand(105000, 100000, 10) -> Slightly over (5% over)
export function budgetBand(total, budget, tolerancePercent) {
  const percentOver = roundMoney(((total - budget) / budget) * 100);
  let band = BUDGET_BANDS.OUT;
  if (total <= budget) band = BUDGET_BANDS.WITHIN;
  else if (total <= budget * (1 + tolerancePercent / 100)) band = BUDGET_BANDS.OVER;
  return { ...band, percentOver };
}

// ---------------------------------------------------------------------------
// Payment schedule
// ---------------------------------------------------------------------------

// When the client pays what. Terms vary by contract, so every figure comes
// from Settings and the screen must say "check the signed contract".
//
//   Deposit   a % of the charter fee, on signing the contract
//   Balance   the rest of the charter fee, plus delivery, redelivery,
//             extras and VAT on them, due a set number of days before
//             embarkation
//   APA       (plus VAT on APA where charged) due a set number of days
//             before embarkation
//
// Late bookings: if a due date has already passed when the contract is
// signed, that payment is due on signing instead.
export function paymentSchedule({ breakdown, signingDate, embarkationDate, depositPercent, balanceDaysBefore, apaDaysBefore }) {
  const deposit = roundMoney(breakdown.charterFee * (depositPercent / 100));
  const apaPayment = roundMoney(breakdown.apa + breakdown.apaVat);
  const balance = roundMoney(breakdown.total - deposit - apaPayment);

  const dueBy = (daysBefore) => {
    const date = addDays(embarkationDate, -daysBefore);
    const late = daysBetween(signingDate, date) < 0;
    return { dueDate: late ? signingDate : date, onSigning: late };
  };

  return [
    { id: 'deposit', label: `Deposit (${depositPercent}% of charter fee)`, amount: deposit, dueDate: signingDate, onSigning: true },
    { id: 'balance', label: 'Balance (rest of charter fee, delivery, extras and VAT)', amount: balance, ...dueBy(balanceDaysBefore) },
    { id: 'apa', label: breakdown.apaVat ? 'APA plus VAT on APA' : 'APA', amount: apaPayment, ...dueBy(apaDaysBefore) },
  ];
}
