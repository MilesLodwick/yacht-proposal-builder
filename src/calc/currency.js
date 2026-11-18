// Currency helpers. Pure functions.
//
// The app works in euros. GBP and USD rates come from the European
// Central Bank's daily reference rates. A GitHub Action
// (.github/workflows/update-rates.yml) fetches them each weekday and
// saves them into data/settings.json, so the site never calls an API
// itself. A rate typed into Settings is used until a newer daily rate
// arrives.
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
  const find = (id) => newestRate(settings.find((s) => s.id === id) || { value: null, dateChecked: null });
  const gbp = find('currency.gbpPerEur');
  const usd = find('currency.usdPerEur');
  return {
    EUR: { perEur: 1, dateChecked: null },
    GBP: { perEur: gbp.value, dateChecked: gbp.dateChecked },
    USD: { perEur: usd.value, dateChecked: usd.dateChecked },
  };
}

// A rate typed into Settings wins until the daily ECB rate saved in
// data/settings.json is newer, so a hand-typed rate never goes stale.
function newestRate(setting) {
  const daily = setting.defaults;
  if (setting.changed && daily?.value && (daily.dateChecked ?? '') > (setting.dateChecked ?? '')) {
    return { value: daily.value, dateChecked: daily.dateChecked };
  }
  return { value: setting.value, dateChecked: setting.dateChecked };
}

// Read the GBP and USD rates out of the ECB daily reference rates file
// (https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml).
// Returns { date: '2026-11-17', GBP: 0.8712, USD: 1.0812 }, or null if
// the file is not in the expected shape, so a bad download never
// overwrites a good rate.
export function parseEcbRates(xml) {
  const date = /<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]/.exec(xml)?.[1];
  const rate = (code) => {
    const match = new RegExp(`<Cube\\s+currency=['"]${code}['"]\\s+rate=['"]([\\d.]+)['"]`).exec(xml);
    const value = Number(match?.[1]);
    return value > 0 ? value : null;
  };
  const GBP = rate('GBP');
  const USD = rate('USD');
  if (!date || !GBP || !USD) return null;
  return { date, GBP, USD };
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
