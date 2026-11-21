// Sales listings: status, price history and days on market.
// Pure functions, tested in tests/listings.test.js.
//
// The research sheet gives each boat's asking price on the day it was
// checked, but not when it was first listed or any past price changes.
// Those are never invented: the first entry in a price history is the
// price "when checked", and days on market stays "not recorded" until a
// listing date is entered.

import { daysBetween, parseDate } from './calc/dates.js';
import { roundMoney } from './calc/charter.js';

export const LISTING_STATUSES = ['Active', 'Under offer', 'Sold', 'Withdrawn'];

export function statusTone(status) {
  return { Active: 'neutral', 'Under offer': 'amber', Sold: 'green', Withdrawn: 'red' }[status] ?? 'neutral';
}

// The listing with its sales fields filled in, for boats imported from the
// sheet that have never been edited.
export function withListingDefaults(boat) {
  return {
    ...boat,
    status: boat.status ?? 'Active',
    listedOn: boat.listedOn ?? null,
    statusDate: boat.statusDate ?? null,
    priceHistory: boat.priceHistory ?? (boat.askingPrice != null
      // fromSheet marks the price taken from the research sheet: it is the
      // sourced fact, so it can never be removed, only added to.
      ? [{ date: boat.dateChecked, price: boat.askingPrice, note: 'Asking price when checked', fromSheet: true }]
      : []),
  };
}

// Apply status checks made against the firms' websites (data/sale-status.json).
// An update changes a boat only if it is still Active and the update has not
// been applied before (applied: keys of updates already applied in this
// browser), so a status the user has set is never overwritten.
// Returns { boats, applied: keys of the updates applied now }.
export function applyStatusUpdates(boats, updates, dateChecked, applied = []) {
  const keyOf = (u) => `${u.id}|${u.status}|${dateChecked}`;
  const now = [];
  const result = boats.map((boat) => {
    const update = updates.find((u) => u.id === boat.id);
    if (!update || applied.includes(keyOf(update)) || (boat.status ?? 'Active') !== 'Active') return boat;
    now.push(keyOf(update));
    return { ...boat, status: update.status, statusDate: dateChecked, statusNote: `${update.note}, checked ${dateChecked}`, statusSourceUrl: update.sourceUrl ?? null };
  });
  return { boats: result, applied: now };
}

// Days from listing to today, or to the day it sold or was withdrawn.
// null if the listing date is not recorded.
export function daysOnMarket(listing, today) {
  if (!parseDate(listing.listedOn)) return null;
  const closed = (listing.status === 'Sold' || listing.status === 'Withdrawn') && parseDate(listing.statusDate);
  return daysBetween(listing.listedOn, closed ? listing.statusDate : today);
}

// First and current asking price and the change between them.
// A reduction is a negative change: -8 means the price is 8% lower.
export function priceSummary(history) {
  if (!history.length) return null;
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0];
  const current = sorted[sorted.length - 1];
  const change = roundMoney(current.price - first.price);
  return {
    first: first.price,
    current: current.price,
    change,
    changePercent: Math.round((change / first.price) * 1000) / 10,
    reductions: sorted.filter((h, i) => i > 0 && h.price < sorted[i - 1].price).length,
    lastChanged: sorted.length > 1 ? current.date : null,
  };
}

// Add a price change. The history stays in date order and the asking
// price becomes the latest price.
export function addPriceChange(listing, change) {
  const priceHistory = [...listing.priceHistory, change].sort((a, b) => a.date.localeCompare(b.date));
  return { ...listing, priceHistory, askingPrice: priceHistory[priceHistory.length - 1].price };
}

// Remove one entry (by its position in the history). The price from the
// research sheet cannot be removed.
export function removePriceChange(listing, index) {
  if (listing.priceHistory[index]?.fromSheet) return listing;
  const priceHistory = listing.priceHistory.filter((_, i) => i !== index);
  return { ...listing, priceHistory, askingPrice: priceHistory.length ? priceHistory[priceHistory.length - 1].price : null };
}

// Check a price change before adding it.
export function validatePriceChange(input, listing, today) {
  const errors = {};
  if (!parseDate(input.date)) errors.date = 'Enter the date of the change.';
  else if (input.date > today) errors.date = 'The date cannot be in the future.';
  const price = Number(String(input.price ?? '').replace(/[,\s]/g, ''));
  if (!(price > 0)) errors.price = 'Enter the new asking price.';
  if (!listing.currency) errors.price = 'This listing has no currency. Set it on the listing first.';
  return Object.keys(errors).length
    ? { ok: false, errors }
    : { ok: true, change: { date: input.date, price, note: String(input.note ?? '').trim() } };
}

// Check the status and listing date before saving.
export function validateStatus(input, today) {
  const errors = {};
  if (!LISTING_STATUSES.includes(input.status)) errors.status = 'Choose a status.';
  if (input.listedOn && !parseDate(input.listedOn)) errors.listedOn = 'Enter a valid date.';
  else if (input.listedOn > today) errors.listedOn = 'The listing date cannot be in the future.';
  if (input.statusDate && !parseDate(input.statusDate)) errors.statusDate = 'Enter a valid date.';
  else if (input.statusDate && input.listedOn && input.statusDate < input.listedOn) errors.statusDate = 'This cannot be before the listing date.';
  if ((input.status === 'Sold' || input.status === 'Withdrawn') && !input.statusDate) {
    errors.statusDate = `Enter the date it was ${input.status.toLowerCase()}.`;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true };
}
