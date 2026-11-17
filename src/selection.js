// Yacht selection: which yachts suit an enquiry, and what each would cost.
// Pure functions, tested in tests/selection.test.js.
//
// The research sheet is honest about gaps: many yachts have no cruising
// area, type or rate listed. So every filter has three outcomes for a
// yacht: matches, does not match, or "not stated". The user decides
// whether "not stated" yachts are shown, and they are always labelled.

import { vatRatesFor, vatOnApaFor, costBreakdown, budgetBand, charterSettings } from './calc/charter.js';
import { convert } from './calc/currency.js';

// ---------------------------------------------------------------------------
// Regions
// ---------------------------------------------------------------------------

// Cruising areas in the sheet are free text, e.g. "West Med and Turkey" or
// "Med: Amalfi Coast, Sicily". Each region lists words that mean a yacht
// cruises there. A yacht listed just as "Mediterranean" counts for every
// Mediterranean region.
const ANY_MED = /(^|[^a-z])(?<!east )(?<!west )(mediterranean|med)([^a-z]|$)/i;

export const REGIONS = [
  { id: 'west-med', label: 'West Mediterranean', words: /west med|france|riviera|monaco|corsica|sardinia|spain|mallorca|balearic|ibiza|italy|amalfi|sicily/i, med: true },
  { id: 'east-med', label: 'East Mediterranean', words: /east med|greece|rhodes|cyclad|turkey|istanbul|croatia|montenegro/i, med: true },
  { id: 'italy', label: 'Italy', words: /italy|amalfi|sicily|sardinia/i, med: true },
  { id: 'spain', label: 'Spain and Balearics', words: /spain|mallorca|balearic|ibiza/i, med: true },
  { id: 'croatia', label: 'Croatia', words: /croatia/i, med: true },
  { id: 'greece', label: 'Greece', words: /greece|rhodes|cyclad/i, med: true },
  { id: 'turkey', label: 'Turkey', words: /turkey|istanbul/i, med: true },
  { id: 'caribbean', label: 'Caribbean', words: /caribbean/i, med: false },
  { id: 'bahamas', label: 'Bahamas', words: /bahamas/i, med: false },
  { id: 'pacific', label: 'Pacific', words: /pacific|polynesia/i, med: false },
  { id: 'northern-europe', label: 'Northern Europe', words: /northern europe|norway|baltic/i, med: false },
];

// The region that best fits where an enquiry's charter starts.
export const REGION_FOR_COUNTRY = {
  france: 'west-med', italy: 'italy', spain: 'spain', croatia: 'croatia',
  greece: 'greece', montenegro: 'east-med', caribbean: 'caribbean', bahamas: 'bahamas',
};

// true, false, or null when the yacht's area is not stated.
export function matchesRegion(yacht, regionId) {
  if (!regionId) return true;
  if (!yacht.cruisingArea) return null;
  const region = REGIONS.find((r) => r.id === regionId);
  return region.words.test(yacht.cruisingArea) || (region.med && ANY_MED.test(yacht.cruisingArea));
}

// ---------------------------------------------------------------------------
// Facts read from the Notes column (never guessed)
// ---------------------------------------------------------------------------

// "Sail", "Motor", or null when the sheet does not say.
export function yachtType(yacht) {
  const notes = yacht.notes ?? '';
  if (/sailing yacht/i.test(notes)) return 'Sail';
  if (/motor yacht/i.test(notes)) return 'Motor';
  return null;
}

// "Winter" or "Summer" if the notes say which season the listed rate is
// for, otherwise null.
export function rateSeason(yacht) {
  const text = `${yacht.notes ?? ''} ${yacht.cruisingArea ?? ''}`;
  if (/winter rate|\(winter\)/i.test(text)) return 'Winter';
  if (/summer rate|\(summer\)/i.test(text)) return 'Summer';
  return null;
}

// The season a charter falls in, from its start month.
// May to October is the Mediterranean summer season; November to April
// is the winter (Caribbean and Bahamas) season.
export function seasonForDate(iso) {
  const month = Number(iso.slice(5, 7));
  return month >= 5 && month <= 10 ? 'Summer' : 'Winter';
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

// criteria: { guests, regionId, type, includeNotStated }
// Returns the yachts that match, each with "notStated": the filters it
// could not be checked against (e.g. ['area', 'guests']).
export function filterYachts(yachts, { guests = null, regionId = null, type = null, includeNotStated = true }) {
  const results = [];
  for (const yacht of yachts) {
    const notStated = [];

    if (guests) {
      if (yacht.guests == null) notStated.push('guests');
      else if (yacht.guests < guests) continue;
    }

    const region = matchesRegion(yacht, regionId);
    if (region === false) continue;
    if (region === null) notStated.push('area');

    if (type) {
      const t = yachtType(yacht);
      if (t === null) notStated.push('type');
      else if (t !== type) continue;
    }

    if (notStated.length && !includeNotStated) continue;
    results.push({ yacht, notStated });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Quoting one yacht
// ---------------------------------------------------------------------------

// The full cost of one yacht for one charter.
//
// charter: { days, countryId, greekEligible, budget, budgetCurrency,
//            displayCurrency, startDate }
// extras:  { deliveryFee, redeliveryFee, extras } for this yacht
// settings: the settings list.  rates: from ratesFromSettings().
//
// The breakdown is worked out in the yacht's own currency (as listed),
// then the total is converted for display and for the budget check.
// The Bahamas gives two breakdowns (10% and 14% VAT).
export function quoteYacht(yacht, charter, settings, rates, extras = {}) {
  if (yacht.rateFromWeekly == null || !yacht.currency) {
    return { ok: false, reason: 'Rate on enquiry' };
  }
  const vatOptions = vatRatesFor(charter.countryId, settings, { greekEligible: charter.greekEligible });
  if (!vatOptions.length) return { ok: false, reason: 'Choose where the charter starts' };

  const cs = charterSettings(settings);
  const vatOnApa = vatOnApaFor(charter.countryId, settings);

  const options = vatOptions.map((v) => {
    const breakdown = costBreakdown({
      weeklyRate: yacht.rateFromWeekly,
      days: charter.days,
      vatRate: v.rate,
      apaPercent: cs.apaPercent,
      vatOnApa,
      deliveryFee: extras.deliveryFee ?? 0,
      redeliveryFee: extras.redeliveryFee ?? 0,
      extras: extras.extras ?? [],
      gratuityLowPercent: cs.gratuityLowPercent,
      gratuityHighPercent: cs.gratuityHighPercent,
    });
    return {
      vatLabel: v.label,
      breakdown,
      displayTotal: convert(breakdown.total, yacht.currency, charter.displayCurrency, rates),
    };
  });

  // For the budget check use the highest total (the safe side when the
  // Bahamas gives two VAT rates).
  const highest = options.reduce((a, b) => (b.breakdown.total > a.breakdown.total ? b : a));
  let band = null;
  let bandNote = null;
  if (!charter.budget) {
    bandNote = 'No budget set';
  } else {
    const inBudgetCurrency = convert(highest.breakdown.total, yacht.currency, charter.budgetCurrency, rates);
    if (inBudgetCurrency == null) bandNote = `Add a ${[yacht.currency, charter.budgetCurrency].find((c) => c !== 'EUR')} rate in Settings to compare with the budget`;
    else band = budgetBand(inBudgetCurrency, charter.budget, cs.budgetTolerancePercent);
  }

  // Flag a rate listed for the other season.
  const listedSeason = rateSeason(yacht);
  const charterSeason = charter.startDate ? seasonForDate(charter.startDate) : null;
  const seasonWarning = listedSeason && charterSeason && listedSeason !== charterSeason
    ? `Listed rate is a ${listedSeason.toLowerCase()} rate. The ${charterSeason.toLowerCase()} rate may differ.`
    : null;

  return { ok: true, currency: yacht.currency, options, band, bandNote, seasonWarning };
}

// Sort order for results: within budget first, then slightly over, then
// over, then those that cannot be compared; cheapest first inside each.
const BAND_ORDER = { within: 0, over: 1, out: 2 };

export function sortQuotes(items) {
  const rank = (q) => (!q.ok ? 4 : q.band ? BAND_ORDER[q.band.id] : 3);
  const total = (q) => (q.ok ? Math.max(...q.options.map((o) => o.displayTotal ?? o.breakdown.total)) : Infinity);
  return [...items].sort((a, b) => rank(a.quote) - rank(b.quote) || total(a.quote) - total(b.quote));
}
