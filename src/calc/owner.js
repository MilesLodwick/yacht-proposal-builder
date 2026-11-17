// Owner report maths. Pure functions.
//
// What the owner earns from a charter:
//   gross charter income   the charter fee (not VAT, which goes to the tax
//                          authority, and not APA, which pays the yacht's
//                          running costs during the charter)
//   commission             a % of the charter fee (a setting, e.g. 20%),
//                          split between the retail broker who found the
//                          client (e.g. 15%) and the central agent who
//                          manages the yacht (e.g. 5%). If there was no
//                          retail broker, the central agent keeps it all.
//   net to owner           gross charter income minus commission
//
// Utilisation is the share of nights in a season the yacht was booked.

import { roundMoney, proRataFee } from './charter.js';
import { daysBetween } from './dates.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Read the commission settings.
export function commissionSettings(settings) {
  const value = (id) => settings.find((s) => s.id === id)?.value ?? 0;
  return {
    totalPercent: value('commission.total'),
    retailPercent: value('commission.retailBroker'),
    centralPercent: value('commission.centralAgent'),
  };
}

// The commission on one charter fee, and what is left for the owner.
// commissionSplit(400000, {20, 15, 5}, true)
//   -> { total: 80000, retail: 60000, central: 20000, net: 320000 }
export function commissionSplit(charterFee, { totalPercent, retailPercent, centralPercent }, hasRetailBroker) {
  const total = roundMoney(charterFee * (totalPercent / 100));
  const retail = hasRetailBroker ? roundMoney(charterFee * (retailPercent / 100)) : 0;
  // The central agent gets their share, plus the retail share when they
  // found the client themselves. Worked out as total minus retail so the
  // parts always add up exactly.
  const central = roundMoney(total - retail);
  return { total, retail, central, net: roundMoney(charterFee - total) };
}

// Seasons: summer is May to October, winter November to April (the same
// rule the selection screen uses). end is the first day after the season.
export function seasonFor(date) {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  if (month >= 5 && month <= 10) {
    return { id: `summer-${year}`, label: `Summer ${year}`, start: `${year}-05-01`, end: `${year}-11-01` };
  }
  const startYear = month >= 11 ? year : year - 1;
  return {
    id: `winter-${startYear}`,
    label: `Winter ${startYear}/${String(startYear + 1).slice(2)}`,
    start: `${startYear}-11-01`,
    end: `${startYear + 1}-05-01`,
  };
}

// The season a date falls in, plus the next few, for the season picker.
export function seasonList(today, count = 4) {
  const list = [seasonFor(today)];
  while (list.length < count) list.push(seasonFor(list[list.length - 1].end));
  return list;
}

// Nights of a period that fall between from and to (to not included).
export function nightsWithin(entry, from, to) {
  const start = entry.start > from ? entry.start : from;
  const end = entry.end < to ? entry.end : to;
  return Math.max(0, daysBetween(start, end));
}

// The whole owner report for one yacht and one season.
// rateFor(yacht, date) gives { rate } for estimating fees not recorded.
export function ownerReport({ yacht, entries, season, settings, rateFor }) {
  const split = commissionSettings(settings);
  const seasonNights = daysBetween(season.start, season.end);

  // Bookings that start in the season count towards its income.
  const bookings = entries
    .filter((e) => e.type === 'booking' && e.start >= season.start && e.start < season.end)
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((e) => {
      const nights = daysBetween(e.start, e.end);
      let charterFee = e.charterFee ?? null;
      let estimated = false;
      if (charterFee == null) {
        const rate = rateFor(yacht, e.start);
        if (rate) { charterFee = proRataFee(rate.rate, nights); estimated = true; }
      }
      const commission = charterFee == null ? null : commissionSplit(charterFee, split, Boolean(e.retailBroker));
      return { ...e, nights, charterFee, estimated, commission };
    });

  const priced = bookings.filter((b) => b.charterFee != null);
  const sum = (fn) => roundMoney(priced.reduce((t, b) => t + fn(b), 0));
  const bookedNights = entries.filter((e) => e.type === 'booking').reduce((t, e) => t + nightsWithin(e, season.start, season.end), 0);
  const ownerNights = entries.filter((e) => e.type === 'owner').reduce((t, e) => t + nightsWithin(e, season.start, season.end), 0);

  // Month by month through the season.
  const months = [];
  for (let from = season.start; from < season.end;) {
    const next = `${from.slice(0, 5)}${String(Number(from.slice(5, 7)) + 1).padStart(2, '0')}-01`;
    const to = from.slice(5, 7) === '12' ? `${Number(from.slice(0, 4)) + 1}-01-01` : next;
    const days = daysBetween(from, to);
    const booked = entries.filter((e) => e.type === 'booking').reduce((t, e) => t + nightsWithin(e, from, to), 0);
    const owner = entries.filter((e) => e.type === 'owner').reduce((t, e) => t + nightsWithin(e, from, to), 0);
    months.push({
      label: `${MONTHS[Number(from.slice(5, 7)) - 1]} ${from.slice(0, 4)}`,
      days, booked, owner,
      percent: Math.round((booked / days) * 100),
    });
    from = to;
  }

  return {
    currency: yacht.currency,
    bookings,
    unpriced: bookings.length - priced.length,
    anyEstimated: priced.some((b) => b.estimated),
    totals: {
      charters: bookings.length,
      weeks: Math.round((bookedNights / 7) * 10) / 10,
      gross: sum((b) => b.charterFee),
      commission: sum((b) => b.commission.total),
      retail: sum((b) => b.commission.retail),
      central: sum((b) => b.commission.central),
      net: sum((b) => b.commission.net),
    },
    utilisation: {
      seasonNights,
      bookedNights,
      ownerNights,
      percent: Math.round((bookedNights / seasonNights) * 100),
      // Nights the yacht could have been chartered: the season less owner use.
      ofAvailablePercent: seasonNights - ownerNights > 0 ? Math.round((bookedNights / (seasonNights - ownerNights)) * 100) : 0,
    },
    months,
    split,
  };
}
