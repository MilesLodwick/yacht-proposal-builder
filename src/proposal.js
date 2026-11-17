// Proposal: the three yachts presented to a client for an enquiry.
// Pure functions, tested in tests/proposal.test.js.

import { filterYachts, quoteYacht, REGION_FOR_COUNTRY } from './selection.js';
import { EMBARKATION_COUNTRIES, LINE_LABELS, VAT_NOTE, charterSettings } from './calc/charter.js';
import { convert, formatMoney, rateNote } from './calc/currency.js';
import { formatDate, formatDateRange } from './calc/dates.js';
import { planItinerary, formatHours } from './calc/itinerary.js';
import { charterDays } from './enquiries.js';
import { checkPill } from './yachts.js';

// The charter details the selection maths needs, taken from an enquiry.
export function charterFromEnquiry(enquiry) {
  return {
    days: charterDays(enquiry),
    countryId: enquiry.embarkationCountry,
    greekEligible: enquiry.greekEligible,
    budget: enquiry.budget,
    budgetCurrency: enquiry.budgetCurrency,
    displayCurrency: enquiry.budgetCurrency,
    startDate: enquiry.startDate,
  };
}

// The yachts that could go in a proposal: enough berths, in the right
// region (or region not stated), with a rate, each with its quote.
export function candidates(enquiry, yachts, settings, rates) {
  const charter = charterFromEnquiry(enquiry);
  return filterYachts(yachts, {
    guests: enquiry.guests,
    regionId: REGION_FOR_COUNTRY[enquiry.embarkationCountry] ?? null,
    includeNotStated: true,
  })
    .map(({ yacht, notStated }) => ({ yacht, notStated, quote: quoteYacht(yacht, charter, settings, rates) }))
    .filter((c) => c.quote.ok);
}

// The default "top three": yachts within budget, closest to the budget
// first (the most yacht for the client's money), then yachts slightly
// over budget, least over first. Yachts that cannot be compared with the
// budget (e.g. no exchange rate yet) come last, and over-budget ones are
// never picked.
export function topThree(items) {
  const total = (i) => Math.max(...i.quote.options.map((o) => o.breakdown.total));
  const within = items.filter((i) => i.quote.band?.id === 'within').sort((a, b) => b.quote.band.percentOver - a.quote.band.percentOver);
  const over = items.filter((i) => i.quote.band?.id === 'over').sort((a, b) => a.quote.band.percentOver - b.quote.band.percentOver);
  const unknown = items.filter((i) => !i.quote.band).sort((a, b) => total(a) - total(b));
  return [...within, ...over, ...unknown].slice(0, 3).map((i) => i.yacht.id);
}

// ---------------------------------------------------------------------------
// Everything the proposal page, prompt and email need, worked out once
// ---------------------------------------------------------------------------

// picks: [{ yacht, deliveryFee }]  itinerary: a saved itinerary or null.
export function proposalContent({ enquiry, picks, settings, rates, itinerary = null, today }) {
  const charter = charterFromEnquiry(enquiry);
  const cs = charterSettings(settings);
  const country = EMBARKATION_COUNTRIES.find((c) => c.id === enquiry.embarkationCountry);
  const warnings = [];

  const yachts = picks.map(({ yacht, deliveryFee = 0 }) => {
    const quote = quoteYacht(yacht, charter, settings, rates, { deliveryFee });
    const check = checkPill(yacht);
    if (check.tone !== 'green') warnings.push(`${yacht.name}: ${check.text.toLowerCase()}. Check the listing before sending.`);
    if (!yacht.cruisingArea) warnings.push(`${yacht.name}: cruising area not stated. Check it will be in ${country?.label ?? 'the right area'} for these dates.`);

    const base = {
      id: yacht.id,
      name: yacht.name,
      specs: [
        yacht.lengthM ? `${yacht.lengthM} m` : null,
        yacht.builder && yacht.year ? `built by ${yacht.builder} in ${yacht.year}` : yacht.builder ?? (yacht.year ? `built ${yacht.year}` : null),
        yacht.guests ? `${yacht.guests} guests${yacht.cabins ? ` in ${yacht.cabins} cabins` : ''}` : null,
      ].filter(Boolean).join(', '),
      source: yacht.source ?? yacht.firm,
      sourceUrl: yacht.sourceUrl,
      checked: formatDate(yacht.dateChecked),
    };

    if (!quote.ok) {
      warnings.push(`${yacht.name}: ${quote.reason.toLowerCase()}, so no costs can be shown.`);
      return { ...base, ok: false, reason: quote.reason };
    }
    if (quote.seasonWarning) warnings.push(`${yacht.name}: ${quote.seasonWarning}`);

    const cur = quote.currency;
    const b = quote.options.map((o) => o.breakdown);
    const money = (key) => b.map((x) => formatMoney(x[key], cur)).join(' or ');
    const lines = [
      { label: `${LINE_LABELS.charterFee} (${charter.days} days)`, amount: money('charterFee') },
      ...(deliveryFee ? [{ label: LINE_LABELS.deliveryFee, amount: money('deliveryFee') }] : []),
      { label: `VAT (${b.map((x) => `${x.vatRate}%`).join(' or ')})`, amount: money('vat') },
      { label: `${LINE_LABELS.apa}, ${b[0].apaPercent}%`, amount: money('apa') },
      ...(b[0].apaVat ? [{ label: LINE_LABELS.apaVat, amount: money('apaVat') }] : []),
    ];

    // The total in the client's currency too, if the yacht is priced in another.
    let clientTotal = null;
    if (cur !== charter.budgetCurrency) {
      const converted = quote.options.map((o) => convert(o.breakdown.total, cur, charter.budgetCurrency, rates));
      if (converted.every((v) => v != null)) {
        clientTotal = `about ${converted.map((v) => formatMoney(v, charter.budgetCurrency)).join(' or ')} (${rateNote(cur === 'EUR' ? charter.budgetCurrency : cur, rates)})`;
      } else {
        warnings.push(`${yacht.name} is priced in ${cur}. Add a ${[cur, charter.budgetCurrency].find((c) => c !== 'EUR')} rate in Settings to show the total in ${charter.budgetCurrency}.`);
      }
    }

    return {
      ...base,
      ok: true,
      weeklyRate: `${formatMoney(yacht.rateFromWeekly, cur)} a week`,
      lines,
      total: money('total'),
      clientTotal,
      gratuity: `${formatMoney(b[0].gratuityGuide.low, cur)} to ${formatMoney(b[0].gratuityGuide.high, cur)}`,
    };
  });

  const plan = itinerary ? planItinerary(itinerary, settings.find((s) => s.id === 'alerts.longDayHours').value) : null;

  return {
    clientName: enquiry.clientName,
    prepared: formatDate(today),
    dates: formatDateRange(enquiry.startDate, enquiry.endDate),
    days: charter.days,
    startsIn: country?.label ?? 'Not set',
    guests: enquiry.guests,
    budget: enquiry.budget ? `${formatMoney(enquiry.budget, enquiry.budgetCurrency)} all in` : 'Not stated',
    clientNotes: enquiry.notes ?? '',
    yachts,
    itinerary: plan ? {
      speedKnots: itinerary.speedKnots,
      days: plan.days.map((d) => ({
        day: d.day,
        date: d.date ? formatDate(d.date) : '',
        route: d.fromPort === d.toPort || !d.nm ? `${d.toPort || d.fromPort} (no passage)` : `${d.fromPort} to ${d.toPort}`,
        detail: d.nm ? `${d.nm} nm, about ${formatHours(d.hours)}${d.longDay ? ', a long day' : ''}` : '',
        notes: d.notes,
      })),
    } : null,
    notes: [
      'Rates are indicative, taken from public listings on the dates shown, and subject to availability and contract.',
      VAT_NOTE,
      'APA (Advance Provisioning Allowance) pays for fuel, food, drink and berthing during the charter. Any unspent APA is refunded.',
      `Crew gratuity is optional and at your discretion, usually ${cs.gratuityLowPercent}% to ${cs.gratuityHighPercent}% of the charter fee. It is not included above.`,
    ],
    warnings,
  };
}
