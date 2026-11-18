// Currency helpers. Pure functions.
//
// The app works in euros. GBP and USD use manual rates typed into
// Settings, each with the date it was checked, because a public site
// cannot call a live rates service without an API key.
//
// Rates are stored as "how many of the other currency for 1 EUR",
// e.g. USD 1.08 means EUR 1 = USD 1.08.

import { formatDate } from './dates.js';

export const CURRENCIES = ['EUR', 'GBP', 'USD'];

const SYMBOLS = { EUR: '€', GBP: '£', USD: '$' };

// Pull the GBP and USD rates out of the settings list into a simple object:
// { EUR: { perEur: 1, dateChecked: null }, GBP: { perEur: 0.87, dateChecked: '2026-11-17' }, ... }
// A rate that has not been entered yet is null.
export function ratesFromSettings(settings) {
  const find = (id) => settings.find((s) => s.id === id) || { value: null, dateChecked: null };
  const gbp = find('currency.gbpPerEur');
  const usd = find('currency.usdPerEur');
  return {
    EUR: { perEur: 1, dateChecked: null },
    GBP: { perEur: gbp.value, dateChecked: gbp.dateChecked },
    USD: { perEur: usd.value, dateChecked: usd.dateChecked },
  };
}

// Convert an amount between any two of EUR, GBP and USD.
// Goes via euros: USD -> EUR -> GBP. Returns null if a rate is missing,
// so the screen can say "rate not set" instead of showing a wrong number.
// convert(1080, 'USD', 'EUR', rates) with USD 1.08 -> 1000
export function convert(amount, from, to, rates) {
  if (amount === null || amount === undefined) return null;
  if (from === to) return amount;
  const fromRate = rates[from]?.perEur;
  const toRate = rates[to]?.perEur;
  if (!fromRate || !toRate) return null;
  const inEuros = amount / fromRate;
  return inEuros * toRate;
}

// 1150000, 'EUR' -> "€1,150,000". Whole units by default, as yacht
// prices and charter fees are quoted. Missing amounts show as "Not set".
export function formatMoney(amount, currency = 'EUR', decimals = 0) {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return 'Not set';
  const number = Math.abs(amount).toLocaleString('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const sign = amount < 0 ? '-' : '';
  return `${sign}${SYMBOLS[currency] ?? ''}${number}`;
}

// The line shown under any converted total so the reader knows which rate
// was used and how old it is, e.g. "EUR 1 = USD 1.08, rate checked 17 Nov 2026".
export function rateNote(currency, rates) {
  if (currency === 'EUR') return '';
  const rate = rates[currency];
  if (!rate?.perEur) return `No ${currency} rate set. Add one in Settings.`;
  return `EUR 1 = ${currency} ${rate.perEur}, rate checked ${formatDate(rate.dateChecked)}`;
}

// Put commas into a typed amount so it is easier to read, e.g.
// "250000" becomes "250,000". Anything that is not a digit or the first
// decimal point is dropped, so "€250k" becomes "250". Pennies are kept
// (up to two places). Empty in, empty out.
export function groupThousands(text) {
  const cleaned = String(text ?? '').replace(/[^\d.]/g, '');
  if (cleaned === '') return '';
  const [whole, ...rest] = cleaned.split('.');
  const grouped = whole.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return rest.length ? `${grouped || '0'}.${rest.join('').slice(0, 2)}` : grouped;
}
