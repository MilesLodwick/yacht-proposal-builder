// Yacht management maths. Pure functions.
//
// 1. Expiry status for certificates, audits and crew qualifications:
//      red     expired
//      amber   expires within X days (a setting, default 60)
//      green   otherwise
//
// 2. Operating budget against actual spend, by category and month:
//      variance             actual minus budget (positive = overspent)
//      full-year forecast   actual spend so far, plus the budget for the
//                           months not yet reported
//
// Every threshold comes from Settings.

import { daysBetween, formatDate, parseDate } from './dates.js';
import { roundMoney } from './charter.js';

// ---------------------------------------------------------------------------
// Expiry status
// ---------------------------------------------------------------------------

// The colour and wording for an expiry date.
// A certificate is valid up to and including its expiry date.
export function expiryStatus(expiryDate, today, amberDays) {
  if (!parseDate(expiryDate)) return { tone: 'amber', text: 'Expiry date not recorded', days: null };
  const days = daysBetween(today, expiryDate);
  if (days < 0) return { tone: 'red', text: `Expired ${formatDate(expiryDate)}`, days };
  if (days === 0) return { tone: 'amber', text: 'Expires today', days };
  if (days <= amberDays) return { tone: 'amber', text: `Expires in ${days} day${days === 1 ? '' : 's'}`, days };
  return { tone: 'green', text: `Valid until ${formatDate(expiryDate)}`, days };
}

// How many items are red, amber and green, e.g. for a summary line.
export function expiryCounts(dates, today, amberDays) {
  const counts = { red: 0, amber: 0, green: 0 };
  for (const date of dates) counts[expiryStatus(date, today, amberDays).tone] += 1;
  return counts;
}

// ---------------------------------------------------------------------------
// Budget against actual
// ---------------------------------------------------------------------------

// The operating budget categories from the brief.
export const BUDGET_CATEGORIES = [
  { id: 'crew', label: 'Crew' },
  { id: 'insurance', label: 'Insurance' },
  { id: 'berthing', label: 'Berthing' },
  { id: 'fuel', label: 'Fuel' },
  { id: 'maintenance', label: 'Maintenance and refit' },
  { id: 'provisions', label: 'Provisions' },
  { id: 'admin', label: 'Admin and fees' },
];

export const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// A category's budget month by month. If no monthly split is given, the
// annual budget is spread evenly (the last month takes any rounding).
export function monthlyBudget({ annual, monthly }) {
  if (Array.isArray(monthly) && monthly.length === 12) return monthly.map((m) => m ?? 0);
  const even = roundMoney(annual / 12);
  return [...Array(11).fill(even), roundMoney(annual - even * 11)];
}

// The last month (1 to 12) with any actual spend recorded in any
// category, or 0 if none yet. Months after this are "not yet reported".
export function reportedThrough(categories) {
  let last = 0;
  for (const c of categories) {
    (c.actuals ?? []).forEach((value, i) => { if (value != null && i + 1 > last) last = i + 1; });
  }
  return last;
}

// Actual minus budget. Positive means overspent.
// variance(110, 100) -> { amount: 10, percent: 10 }
export function variance(actual, budget) {
  const amount = roundMoney(actual - budget);
  return { amount, percent: budget ? Math.round((amount / budget) * 1000) / 10 : null };
}

// The colour for a variance: green on or under budget, amber when
// overspent by up to X% (a setting, default 5%), red beyond that.
export function varianceTone(v, amberPercent) {
  if (v.amount <= 0) return 'green';
  if (v.percent != null && v.percent <= amberPercent) return 'amber';
  return 'red';
}

// One category's figures for the year so far and the full year.
// through: the last reported month (1 to 12).
export function categoryFigures(category, through) {
  const budget = monthlyBudget(category);
  const actuals = Array.from({ length: 12 }, (_, i) => category.actuals?.[i] ?? null);
  const sum = (list) => roundMoney(list.reduce((t, v) => t + (v ?? 0), 0));

  const budgetToDate = sum(budget.slice(0, through));
  const actualToDate = sum(actuals.slice(0, through));
  const remainingBudget = sum(budget.slice(through));

  // Forecast: what has been spent, plus what is budgeted for the rest of
  // the year. It assumes the remaining months go to budget.
  const forecast = roundMoney(actualToDate + remainingBudget);

  return {
    budget,
    actuals,
    annual: sum(budget),
    budgetToDate,
    actualToDate,
    toDate: variance(actualToDate, budgetToDate),
    forecast,
    fullYear: variance(forecast, sum(budget)),
    missingMonths: actuals.slice(0, through).map((v, i) => (v == null ? MONTH_LABELS[i] : null)).filter(Boolean),
  };
}

// Every category plus totals.
export function budgetReport(categories) {
  const through = reportedThrough(categories);
  const rows = categories.map((c) => ({ ...c, ...categoryFigures(c, through) }));
  const total = (key) => roundMoney(rows.reduce((t, r) => t + r[key], 0));
  const totals = {
    annual: total('annual'),
    budgetToDate: total('budgetToDate'),
    actualToDate: total('actualToDate'),
    forecast: total('forecast'),
  };
  totals.toDate = variance(totals.actualToDate, totals.budgetToDate);
  totals.fullYear = variance(totals.forecast, totals.annual);
  return { through, throughLabel: through ? MONTH_LABELS[through - 1] : null, rows, totals };
}
