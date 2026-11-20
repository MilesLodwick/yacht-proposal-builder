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

// The weekly rate to quote for a charter starting on a date:
//   1. the yacht's rate for that season, if entered on its fleet record
//   2. otherwise the rate listed in the research sheet
//   3. otherwise the other season's rate, flagged as such
// Returns { rate, label, otherSeason } or null if there is no rate at all.
export function weeklyRateFor(yacht, startDate) {
  const season = startDate ? seasonForDate(startDate) : null;
  const seasonal = season === 'Summer' ? yacht.summerRate : season === 'Winter' ? yacht.winterRate : null;
  if (seasonal != null) return { rate: seasonal, label: `${season} rate`, otherSeason: false };
  if (yacht.rateFromWeekly != null) return { rate: yacht.rateFromWeekly, label: 'Listed rate', otherSeason: false };
  if (yacht.summerRate != null) return { rate: yacht.summerRate, label: 'Summer rate', otherSeason: season === 'Winter' };
  if (yacht.winterRate != null) return { rate: yacht.winterRate, label: 'Winter rate', otherSeason: season === 'Summer' };
  return null;
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

// The listed weekly rate converted into another currency, for the rate
// slider. null when there is no rate or no exchange rate to convert with.
export function weeklyRateIn(yacht, currency, rates) {
  const weekly = weeklyRateFor(yacht, null);
  if (!weekly || !yacht.currency) return null;
  return convert(weekly.rate, yacht.currency, currency, rates);
}

// The builders (shipyards) in the list, A to Z, for the Shipyard filter.
export function builders(yachts) {
  return [...new Set(yachts.map((y) => y.builder).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

// Lowest and highest of some values, rounded outwards to a whole step, so
// a slider's ends sit on round numbers. null when there are no values.
// rangeOf([24, 126.2], 1) -> { min: 24, max: 127 }
export function rangeOf(values, step) {
  const known = values.filter((v) => v != null && Number.isFinite(v));
  if (!known.length) return null;
  return { min: Math.floor(Math.min(...known) / step) * step, max: Math.ceil(Math.max(...known) / step) * step };
}

// A round step that splits a span into roughly a hundred slider positions:
// 1, 2 or 5 times a power of ten. sliderStep(1150000) -> 10000
export function sliderStep(span) {
  if (!(span > 0)) return 1;
  const rough = span / 100;
  const power = 10 ** Math.floor(Math.log10(rough));
  const nice = [1, 2, 5, 10].find((m) => m * power >= rough);
  return Math.max(1, nice * power);
}

// Does a value fall inside a slider range? true, false, or null when the
// yacht does not state the value. No range set means everything matches.
function inRange(value, range) {
  if (!range) return true;
  if (value == null) return null;
  return value >= range.min && value <= range.max;
}

// criteria: { guests, regionId, type, includeNotStated, name, builder,
//             lengthRange, yearRange, rateRange, rateCurrency, rates }
// Ranges are { min, max }, or null when the slider is at its full extent.
// The rate range is in rateCurrency; each yacht's rate is converted.
// Returns the yachts that match, each with "notStated": the filters it
// could not be checked against (e.g. ['area', 'guests']).
export function filterYachts(yachts, {
  guests = null, regionId = null, type = null, includeNotStated = true,
  name = '', builder = null, lengthRange = null, yearRange = null, rateRange = null, rateCurrency = 'EUR', rates = null,
}) {
  const searchFor = String(name ?? '').trim().toLowerCase();
  const results = [];
  for (const yacht of yachts) {
    const notStated = [];

    if (searchFor && !String(yacht.name ?? '').toLowerCase().includes(searchFor)) continue;

    if (builder) {
      if (!yacht.builder) notStated.push('builder');
      else if (yacht.builder !== builder) continue;
    }

    const checks = [
      ['length', inRange(yacht.lengthM, lengthRange)],
      ['year', inRange(yacht.year, yearRange)],
      ['rate', rateRange ? inRange(weeklyRateIn(yacht, rateCurrency, rates), rateRange) : true],
    ];
    if (checks.some(([, ok]) => ok === false)) continue;
    for (const [what, ok] of checks) if (ok === null) notStated.push(what);

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
  const weekly = weeklyRateFor(yacht, charter.startDate);
  if (!weekly || !yacht.currency) {
    return { ok: false, reason: 'Rate on enquiry' };
  }
  const vatOptions = vatRatesFor(charter.countryId, settings, { greekEligible: charter.greekEligible });
  if (!vatOptions.length) return { ok: false, reason: 'Choose where the charter starts' };

  const cs = charterSettings(settings);
  const vatOnApa = vatOnApaFor(charter.countryId, settings);

  const options = vatOptions.map((v) => {
    const breakdown = costBreakdown({
      weeklyRate: weekly.rate,
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

  // Flag a rate that is for the other season.
  const charterSeason = charter.startDate ? seasonForDate(charter.startDate) : null;
  let seasonWarning = null;
  if (weekly.otherSeason) {
    seasonWarning = `Only a ${weekly.label.toLowerCase()} is recorded. The ${charterSeason.toLowerCase()} rate may differ.`;
  } else if (weekly.label === 'Listed rate') {
    const listedSeason = rateSeason(yacht);
    if (listedSeason && charterSeason && listedSeason !== charterSeason) {
      seasonWarning = `Listed rate is a ${listedSeason.toLowerCase()} rate. The ${charterSeason.toLowerCase()} rate may differ.`;
    }
  }

  return {
    ok: true, currency: yacht.currency, weeklyRate: weekly.rate, rateLabel: weekly.label,
    options, band, bandNote, seasonWarning,
  };
}

// Sort order for results: within budget first, then slightly over, then
// over, then those that cannot be compared; cheapest first inside each.
const BAND_ORDER = { within: 0, over: 1, out: 2 };

export function sortQuotes(items) {
  const rank = (q) => (!q.ok ? 4 : q.band ? BAND_ORDER[q.band.id] : 3);
  const total = (q) => (q.ok ? Math.max(...q.options.map((o) => o.displayTotal ?? o.breakdown.total)) : Infinity);
  return [...items].sort((a, b) => rank(a.quote) - rank(b.quote) || total(a.quote) - total(b.quote));
}
