// Preference sheets: what the crew need to know about the guests before
// they arrive, and the one-page handover summary for the captain.
// Pure functions, tested in tests/preferences.test.js.
//
// One sheet per enquiry:
// {
//   enquiryId,
//   guests:      [{ name, age, dietary, allergies }]   age is optional
//   arrival:     { date, time, place }
//   activities:  ['Snorkelling', ...]
//   otherActivities: 'free text'
//   occasions:   [{ date, occasion, guest }]
//   notes:       'free text'
// }

import { daysBetween, addDays, formatDate, parseDate } from './calc/dates.js';

export const ACTIVITIES = [
  'Swimming', 'Snorkelling', 'Scuba diving', 'Water-skiing and wakeboarding', 'Jet ski',
  'Paddleboarding and kayaking', 'Fishing', 'Hiking', 'Beach clubs', 'Dining ashore',
  'Cultural visits', 'Shopping', 'Spa and wellness', 'Yoga and fitness', 'Nightlife',
];

// A blank sheet for an enquiry: one row per guest, arrival on day 1.
export function emptySheet(enquiry) {
  return {
    enquiryId: enquiry.id,
    guests: Array.from({ length: enquiry.guests }, () => ({ name: '', age: '', dietary: '', allergies: '' })),
    arrival: { date: enquiry.startDate, time: '', place: '' },
    activities: [],
    otherActivities: '',
    occasions: [],
    notes: '',
  };
}

// Children are guests under 18 with an age given. Guests with no age
// given are counted as adults.
export function isChild(guest) {
  const age = Number(guest.age);
  return String(guest.age ?? '').trim() !== '' && Number.isFinite(age) && age < 18;
}

// Which day of the charter a date falls on: the first day is day 1.
// Returns null if the date is outside the charter.
export function charterDay(date, enquiry) {
  if (!parseDate(date)) return null;
  const day = daysBetween(enquiry.startDate, date) + 1;
  const length = daysBetween(enquiry.startDate, enquiry.endDate) + 1;
  return day >= 1 && day <= length ? day : null;
}

// Things to double-check. These never stop the sheet being saved.
export function sheetWarnings(sheet, enquiry) {
  const warnings = [];
  const named = sheet.guests.filter((g) => g.name.trim());
  if (sheet.guests.length !== enquiry.guests) {
    warnings.push(`The sheet lists ${sheet.guests.length} guests but the enquiry says ${enquiry.guests}.`);
  }
  if (named.length < sheet.guests.length) {
    warnings.push(`${sheet.guests.length - named.length} guest${sheet.guests.length - named.length === 1 ? ' has' : 's have'} no name yet.`);
  }
  for (const g of sheet.guests) {
    const age = String(g.age ?? '').trim();
    if (age && !(Number.isInteger(Number(age)) && Number(age) >= 0 && Number(age) <= 120)) {
      warnings.push(`Check the age for ${g.name || 'a guest'}: "${age}".`);
    }
  }
  if (!sheet.arrival.time) warnings.push('Arrival time not given yet.');
  if (!sheet.arrival.place) warnings.push('Arrival place not given yet.');
  if (sheet.arrival.time && !/^\d{2}:\d{2}$/.test(sheet.arrival.time)) warnings.push('Arrival time should be like 14:30.');
  for (const o of sheet.occasions) {
    if (o.occasion && !charterDay(o.date, enquiry)) {
      warnings.push(`"${o.occasion}" is not on a charter day (${formatDate(enquiry.startDate)} to ${formatDate(enquiry.endDate)}).`);
    }
  }
  return warnings;
}

// Everything the captain's one-page handover needs, ready to show.
export function handoverSummary(sheet, enquiry) {
  const guests = sheet.guests.map((g, i) => ({
    name: g.name.trim() || `Guest ${i + 1}`,
    ageText: isChild(g) ? `Child, ${Number(g.age)}` : (String(g.age ?? '').trim() ? `Adult, ${Number(g.age)}` : 'Adult'),
    dietary: g.dietary.trim(),
    allergies: g.allergies.trim(),
  }));
  const children = sheet.guests.filter(isChild).length;

  return {
    clientName: enquiry.clientName,
    dates: { start: formatDate(enquiry.startDate), end: formatDate(enquiry.endDate) },
    guestCount: { total: guests.length, adults: guests.length - children, children },
    arrival: {
      text: [formatDate(sheet.arrival.date), sheet.arrival.time, sheet.arrival.place].filter((x) => x && x !== 'Not set').join(', ') || 'To be confirmed',
    },
    // Allergies come first and separately: they are a safety matter.
    allergies: guests.filter((g) => g.allergies).map((g) => ({ guest: g.name, allergy: g.allergies })),
    dietary: guests.filter((g) => g.dietary).map((g) => ({ guest: g.name, needs: g.dietary })),
    guests,
    activities: [...sheet.activities, ...(sheet.otherActivities.trim() ? [sheet.otherActivities.trim()] : [])],
    occasions: sheet.occasions
      .filter((o) => o.occasion.trim())
      .map((o) => ({ ...o, dateText: formatDate(o.date), day: charterDay(o.date, enquiry) }))
      .sort((a, b) => String(a.date).localeCompare(String(b.date))),
    notes: sheet.notes.trim(),
  };
}

// Sample sheets store dates as days from the charter start.
// A template whose enquiry no longer exists is skipped.
export function buildSamplePreferences(templates, enquiries) {
  return templates.flatMap((t, i) => {
    const enquiry = enquiries.find((e) => e.id === t.enquiryId);
    if (!enquiry) return [];
    return {
      id: `sample-preferences-${i + 1}`,
      example: true,
      enquiryId: t.enquiryId,
      guests: t.guests.map((g) => ({ name: g.name, age: g.age ?? '', dietary: g.dietary ?? '', allergies: g.allergies ?? '' })),
      arrival: { date: addDays(enquiry.startDate, t.arrival.dayOffset ?? 0), time: t.arrival.time, place: t.arrival.place },
      activities: t.activities,
      otherActivities: t.otherActivities ?? '',
      occasions: t.occasions.map((o) => ({ date: addDays(enquiry.startDate, o.charterDay - 1), occasion: o.occasion, guest: o.guest ?? '' })),
      notes: t.notes ?? '',
      ...(t.addedIn ? { addedIn: t.addedIn } : {}),
    };
  });
}
