// Buyer brief: what a buyer is looking for, the boats that match, and a
// shortlist with the figures a buyer asks about first.
// Pure functions, tested in tests/buyer.test.js.
//
// A brief: { id, buyerName, currency, budget, type, minLength, maxLength,
//            minYear, boatIds: [...], notes }
// All prices are shown in the buyer's currency, converted with the rates
// in Settings. A boat whose price cannot be converted is not guessed at.

import { convert } from './calc/currency.js';
import { pricePerMetre, runningCostEstimate } from './calc/sales.js';
import { roundMoney } from './calc/charter.js';

// A boat's asking price in the buyer's currency, or null if unknown.
export function priceFor(boat, currency, rates) {
  if (boat.askingPrice == null || !boat.currency) return null;
  const p = convert(boat.askingPrice, boat.currency, currency, rates);
  return p == null ? null : roundMoney(p);
}

// Boats that meet the brief, cheapest first, and a count of boats left out
// because a detail the brief depends on is missing.
export function matchingBoats(boats, brief, rates) {
  const left = { noPrice: 0, noLength: 0, noYear: 0, noType: 0 };
  const matches = [];
  for (const boat of boats) {
    if (brief.type) {
      if (!boat.type) { left.noType += 1; continue; }
      if (boat.type !== brief.type) continue;
    }
    if (brief.minLength || brief.maxLength) {
      if (!boat.lengthM) { left.noLength += 1; continue; }
      if (brief.minLength && boat.lengthM < brief.minLength) continue;
      if (brief.maxLength && boat.lengthM > brief.maxLength) continue;
    }
    if (brief.minYear) {
      if (!boat.year) { left.noYear += 1; continue; }
      if (boat.year < brief.minYear) continue;
    }
    const price = priceFor(boat, brief.currency, rates);
    if (brief.budget) {
      if (price == null) { left.noPrice += 1; continue; }
      if (price > brief.budget) continue;
    }
    matches.push({ boat, price });
  }
  matches.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  return { matches, left };
}

// One row of the shortlist: price, price per metre and running costs, all
// in the buyer's currency.
export function shortlistRow(boat, brief, rates, runningCostPercent) {
  const price = priceFor(boat, brief.currency, rates);
  return {
    boat,
    price,
    pricePerMetre: pricePerMetre(price, boat.lengthM),
    runningCost: runningCostEstimate(price, runningCostPercent),
    overBudget: brief.budget != null && price != null && price > brief.budget,
    converted: price != null && boat.currency !== brief.currency,
  };
}

// Check a brief's numbers before saving. Everything is optional except
// the currency; ranges must make sense.
export function validateBrief(input) {
  const errors = {};
  const num = (name) => {
    const raw = String(input[name] ?? '').replace(/[,\s]/g, '');
    if (raw === '') return null;
    const n = Number(raw);
    if (!(n > 0)) { errors[name] = 'Enter a number greater than 0.'; return null; }
    return n;
  };
  const fields = {
    buyerName: String(input.buyerName ?? '').trim(),
    currency: ['EUR', 'GBP', 'USD'].includes(input.currency) ? input.currency : 'EUR',
    budget: num('budget'),
    type: ['Motor', 'Sail'].includes(input.type) ? input.type : null,
    minLength: num('minLength'),
    maxLength: num('maxLength'),
    minYear: num('minYear'),
    notes: String(input.notes ?? '').trim(),
  };
  if (fields.minLength && fields.maxLength && fields.minLength > fields.maxLength) errors.maxLength = 'The maximum must be at least the minimum.';
  if (fields.minYear && (fields.minYear < 1850 || !Number.isInteger(fields.minYear))) errors.minYear = 'Enter a year such as 2005.';
  if (!fields.buyerName) errors.buyerName = 'Enter the buyer\'s name or a reference.';
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, fields };
}

// Sample briefs need no date offsets; they are marked as examples.
export function buildSampleBriefs(templates) {
  return templates.map((t, i) => ({ id: `sample-brief-${i + 1}`, example: true, ...t }));
}
