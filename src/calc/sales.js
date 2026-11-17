// Brokerage sales maths. Pure functions.
//
// Every rule of thumb comes from Settings: the running cost %, the
// comparables ranges (length and age) and the MYBA MOA deposit terms.
//
// Prices in the research sheet are ASKING prices from public listings.
// Sold prices are private, so anything worked out here is labelled
// "asking prices, not sold prices".

import { roundMoney } from './charter.js';
import { convert } from './currency.js';
import { addBankingDays } from './dates.js';

export const ASKING_NOT_SOLD = 'Asking prices, not sold prices.';

// Read the sales settings by id.
export function salesSettings(settings) {
  const value = (id) => settings.find((s) => s.id === id)?.value ?? null;
  return {
    depositPercent: value('sale.depositPercent'),
    depositBankingDays: value('sale.depositBankingDays'),
    runningCostPercent: value('sale.runningCostPercent'),
    compLengthPercent: value('sale.compLengthPercent'),
    compYears: value('sale.compYears'),
  };
}

// ---------------------------------------------------------------------------
// Price per metre and running costs
// ---------------------------------------------------------------------------

// The asking price divided by the length: the usual way to compare yachts
// of different sizes. 3,000,000 for a 30 m yacht is 100,000 a metre.
export function pricePerMetre(price, lengthM) {
  if (price == null || !lengthM) return null;
  return roundMoney(price / lengthM);
}

// A rough annual running cost: a % of the yacht's value each year (a
// setting, about 10% by industry rule of thumb). It covers crew, berthing,
// insurance, maintenance and fuel. Real costs depend on size, age and use.
export function runningCostEstimate(price, percent) {
  if (price == null) return null;
  return roundMoney(price * (percent / 100));
}

// ---------------------------------------------------------------------------
// Comparables
// ---------------------------------------------------------------------------

// The middle value of a list. With an even number of values, the average
// of the two in the middle. median([1, 5, 3]) -> 3; median([1, 2, 3, 4]) -> 2.5
export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Find comparable boats for a subject boat:
//   same type (motor or sail)
//   length within plus or minus X% (a setting, default 15%)
//   built within plus or minus Y years (a setting, default 7)
//   with an asking price we can convert into the subject's currency
//
// Returns { comparables, excluded } where comparables carry their price
// and price per metre in the subject's currency, and excluded counts the
// boats that could not be checked, by reason, so the screen can be honest
// about what was left out.
export function findComparables(subject, listings, { lengthPercent, years }, rates) {
  const excluded = { noPrice: 0, noLength: 0, noYear: 0, noType: 0, noRate: 0 };
  const minLength = subject.lengthM * (1 - lengthPercent / 100);
  const maxLength = subject.lengthM * (1 + lengthPercent / 100);
  const comparables = [];

  for (const boat of listings) {
    if (boat.id === subject.id) continue;

    // Check the criteria that can be checked; skip boats that clearly differ.
    if (boat.type && subject.type && boat.type !== subject.type) continue;
    if (boat.lengthM && (boat.lengthM < minLength || boat.lengthM > maxLength)) continue;
    if (boat.year && Math.abs(boat.year - subject.year) > years) continue;

    // Then count boats that might match but are missing something.
    if (!boat.type) { excluded.noType += 1; continue; }
    if (!boat.lengthM) { excluded.noLength += 1; continue; }
    if (!boat.year) { excluded.noYear += 1; continue; }
    if (boat.askingPrice == null || !boat.currency) { excluded.noPrice += 1; continue; }

    const price = convert(boat.askingPrice, boat.currency, subject.currency, rates);
    if (price == null) { excluded.noRate += 1; continue; }

    comparables.push({ ...boat, priceInSubjectCurrency: roundMoney(price), pricePerMetre: pricePerMetre(price, boat.lengthM) });
  }

  comparables.sort((a, b) => a.pricePerMetre - b.pricePerMetre);
  return { comparables, excluded };
}

// Median, lowest and highest price per metre of the comparables.
export function priceStats(comparables) {
  const values = comparables.map((c) => c.pricePerMetre);
  return {
    count: values.length,
    median: values.length ? roundMoney(median(values)) : null,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
  };
}

// Where the subject's price per metre sits against the comparables:
// the % above or below the median, and how many comparables are cheaper
// per metre. No "fair price" judgement: that is the broker's call.
export function pricePosition(subjectPpm, comparables) {
  const stats = priceStats(comparables);
  if (!stats.count || subjectPpm == null) return null;
  const vsMedian = Math.round(((subjectPpm - stats.median) / stats.median) * 100);
  const cheaper = comparables.filter((c) => c.pricePerMetre < subjectPpm).length;
  let text;
  if (vsMedian === 0) text = 'at the median';
  else text = `${Math.abs(vsMedian)}% ${vsMedian > 0 ? 'above' : 'below'} the median`;
  return { vsMedian, cheaper, of: stats.count, text };
}

// ---------------------------------------------------------------------------
// MYBA MOA deposit
// ---------------------------------------------------------------------------

// Under the MYBA Memorandum of Agreement the buyer pays a deposit (a
// setting, usually 10% of the price) within a number of banking days of
// signing (a setting, usually 4). Weekends are skipped; public holidays
// are not, so the screen tells the user to check bank holidays.
export function moaDeposit(price, signingDate, { depositPercent, depositBankingDays }) {
  return {
    amount: roundMoney(price * (depositPercent / 100)),
    balance: roundMoney(price - roundMoney(price * (depositPercent / 100))),
    dueDate: addBankingDays(signingDate, depositBankingDays),
  };
}
