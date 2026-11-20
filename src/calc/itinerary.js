// Itinerary maths. Pure functions.
//
// Cruising time for a leg = distance (nautical miles) / speed (knots).
// A knot is one nautical mile per hour, so 36 nm at 12 knots is 3 hours.
//
// This is time at a steady cruising speed. Weather, sea state, and leaving
// and entering port all add time, so the screen says to check with the
// captain. Legs longer than a set number of hours (a setting, default 6)
// are flagged as long days: guests on a holiday charter rarely want to
// spend most of a day under way.

import { addDays } from './dates.js';

// Hours to cover a distance at a speed. 36 nm at 12 knots -> 3.
export function legHours(nauticalMiles, knots) {
  if (!knots || knots <= 0) return null;
  return nauticalMiles / knots;
}

// 3.3333 hours -> "3 h 20 min". 0 -> "No passage". Rounded to the minute.
export function formatHours(hours) {
  if (hours === null || hours === undefined) return 'Not set';
  const totalMinutes = Math.round(hours * 60);
  if (totalMinutes === 0) return 'No passage';
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

// Work out every day of an itinerary.
//
// itinerary: { startDate, embarkPort, speedKnots, days: [{ toPort, nm, notes }] }
// Each day starts where the day before ended; day 1 starts at the
// embarkation port.
//
// Returns { days: [{ day, date, fromPort, toPort, nm, hours, longDay, notes }],
//           totalNm, totalHours, longDays }
export function planItinerary(itinerary, longDayHours) {
  let fromPort = itinerary.embarkPort || '';
  const days = itinerary.days.map((d, i) => {
    const nm = Number(d.nm) || 0;
    const hours = legHours(nm, itinerary.speedKnots);
    const day = {
      day: i + 1,
      date: itinerary.startDate ? addDays(itinerary.startDate, i) : null,
      fromPort,
      toPort: d.toPort || '',
      nm,
      hours,
      longDay: hours !== null && hours > longDayHours,
      notes: d.notes || '',
    };
    fromPort = day.toPort;
    return day;
  });

  const totalNm = days.reduce((sum, d) => sum + d.nm, 0);
  return {
    days,
    totalNm,
    totalHours: legHours(totalNm, itinerary.speedKnots),
    longDays: days.filter((d) => d.longDay).length,
  };
}

// Sample itineraries store their start as "days from today" (like the
// sample enquiries) so the demo never looks out of date.
export function buildSampleItineraries(templates, today) {
  return templates.map((t, i) => ({
    id: `sample-itinerary-${i + 1}`,
    example: true,
    name: t.name,
    enquiryId: t.enquiryId ?? null,
    startDate: addDays(today, t.startInDays),
    embarkPort: t.embarkPort,
    speedKnots: t.speedKnots,
    days: t.days.map((d) => ({ toPort: d.toPort, nm: d.nm, notes: d.notes ?? '', ...(d.nmEstimated ? { nmEstimated: true } : {}) })),
    ...(t.addedIn ? { addedIn: t.addedIn } : {}),
  }));
}

// Check an itinerary before saving.
// Returns { ok: true } or { ok: false, errors: { field: message } } where
// day fields are named like "day-3-nm".
export function validateItinerary(itinerary) {
  const errors = {};
  if (!String(itinerary.name ?? '').trim()) errors.name = 'Give the itinerary a name.';
  if (!(Number(itinerary.speedKnots) > 0)) errors.speedKnots = 'Enter a cruising speed in knots, e.g. 12.';
  else if (Number(itinerary.speedKnots) > 40) errors.speedKnots = 'That is faster than almost any yacht cruises. Check the speed.';
  if (!String(itinerary.embarkPort ?? '').trim()) errors.embarkPort = 'Enter the embarkation port.';
  itinerary.days.forEach((d, i) => {
    const nm = String(d.nm ?? '').trim();
    if (nm !== '' && !(Number(nm) >= 0)) errors[`day-${i + 1}-nm`] = 'Enter the distance in nautical miles, or 0.';
  });
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true };
}
