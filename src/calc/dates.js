// Date helpers. Pure functions: same input, same output, no side effects.
//
// Dates are stored as text in the form YYYY-MM-DD (e.g. "2026-11-17").
// That form sorts correctly, saves cleanly to JSON and CSV, and has no
// time zone, so a date never shifts by a day for someone abroad.
// Inside these functions we work in UTC for the same reason.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Written out by hand rather than using the browser's date formatter,
// because some browsers write September as "Sept" in British English.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2026-11-17" -> a Date at midnight UTC. Returns null for anything invalid.
export function parseDate(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  // Reject dates that do not exist, such as 2026-02-30.
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

// A Date -> "2026-11-17".
export function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

// "2026-11-17" -> "17 Nov 2026". Empty or invalid dates show as "Not set".
export function formatDate(iso) {
  const date = parseDate(iso);
  if (!date) return 'Not set';
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

// Whole days from one date to another. Positive if "to" is later.
// daysBetween("2026-11-17", "2026-11-24") -> 7
export function daysBetween(from, to) {
  return Math.round((parseDate(to) - parseDate(from)) / MS_PER_DAY);
}

// Move a date forwards (or backwards with a negative number) by calendar days.
// Used for payment deadlines, e.g. balance due 30 days before embarkation:
// addDays("2027-07-10", -30) -> "2027-06-10"
export function addDays(iso, days) {
  const date = parseDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toISODate(date);
}

// Saturday or Sunday?
export function isWeekend(iso) {
  const day = parseDate(iso).getUTCDay(); // 0 = Sunday, 6 = Saturday
  return day === 0 || day === 6;
}

// Move forward by banking days, skipping Saturdays and Sundays.
// Used for the MYBA MOA deposit, due within a set number of banking days
// of signing. Public holidays are NOT skipped, because they differ by
// country and bank, so the result is the earliest possible date and the
// UI should say "check bank holidays".
// addBankingDays("2026-11-20", 4) -> "2026-11-26" (Fri + 4 banking days = Thu)
export function addBankingDays(iso, bankingDays) {
  let current = iso;
  let counted = 0;
  while (counted < bankingDays) {
    current = addDays(current, 1);
    if (!isWeekend(current)) counted += 1;
  }
  return current;
}

// Today's date in the user's own time zone, as "YYYY-MM-DD".
// Not pure (it reads the clock), so calculations take "today" as an input
// instead of calling this, which keeps them testable.
export function todayISO() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
