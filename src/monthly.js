// Monthly management report: one page for a managed yacht's owner,
// pulling together compliance, crew certificates and the budget.
// Pure functions, tested in tests/monthly.test.js.
//
// The report is "as at" the last day of the month, or today if the month
// is not over yet, so a past month's report shows what was true then.

import { complianceList } from './compliance.js';
import { memberStatus, certLabel } from './crew.js';
import { BUDGET_CATEGORIES, MONTH_LABELS, monthlyBudget, categoryFigures, variance } from './calc/management.js';
import { addDays, formatDate } from './calc/dates.js';
import { roundMoney } from './calc/charter.js';
import { formatMoney } from './calc/currency.js';

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// "2026-10" -> last day "2026-10-31"
export function lastDayOf(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return addDays(next, -1);
}

export function monthLabel(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  return `${MONTHS_LONG[m - 1]} ${y}`;
}

// The months to offer: the last 12, newest first. The default is last
// month, the usual month to report on.
export function reportMonths(today, count = 12) {
  const [y, m] = today.split('-').map(Number);
  const months = [];
  for (let i = 0; i < count; i += 1) {
    const index = y * 12 + (m - 1) - i;
    months.push(`${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`);
  }
  return { months, defaultMonth: months[1] };
}

// Everything on the report.
export function monthlyReport({ items, crew, budget, month, today, amberDays, budgetAmberPercent }) {
  const end = lastDayOf(month);
  const asAt = end < today ? end : today;
  const monthIndex = Number(month.slice(5, 7)); // 1 to 12
  const keyPoints = [];

  // Compliance as at the report date.
  const compliance = complianceList(items, asAt, amberDays);
  const expired = compliance.filter((i) => i.status.tone === 'red');
  const dueSoon = compliance.filter((i) => i.status.tone === 'amber');
  if (expired.length) keyPoints.push({ tone: 'red', text: `${expired.length} compliance item${expired.length > 1 ? 's' : ''} overdue or expired: ${expired.map((i) => i.title).join(', ')}.` });
  if (dueSoon.length) keyPoints.push({ tone: 'amber', text: `${dueSoon.length} compliance item${dueSoon.length > 1 ? 's' : ''} due within ${amberDays} days.` });

  // Crew certificates as at the report date.
  const crewStatus = crew.map((m) => ({ ...m, s: memberStatus(m, asAt, amberDays) }));
  const crewActions = crewStatus.flatMap((m) => m.s.needsAction.map((c) => ({
    name: m.name, role: m.role, tone: c.status.tone,
    text: c.missing ? c.status.text : `${c.type === 'other' ? c.detail : certLabel(c.type)}: ${c.status.text.charAt(0).toLowerCase()}${c.status.text.slice(1)}`,
  }))).sort((a, b) => (a.tone === 'red' ? 0 : 1) - (b.tone === 'red' ? 0 : 1));
  const crewExpired = crewActions.filter((a) => a.tone === 'red');
  if (crewExpired.length) keyPoints.push({ tone: 'red', text: `Crew certificates expired: ${crewExpired.map((a) => `${a.name} (${a.text.split(':')[0]})`).join(', ')}.` });
  const crewSoon = crewActions.filter((a) => a.tone === 'amber');
  if (crewSoon.length) keyPoints.push({ tone: 'amber', text: `${crewSoon.length} crew certificate${crewSoon.length > 1 ? 's' : ''} due for renewal within ${amberDays} days or not yet recorded.` });

  // Budget for the month and the year to date, if this year has a budget.
  let money = null;
  if (budget && budget.year === Number(month.slice(0, 4))) {
    // If this month's spend is not fully entered, the year-to-date figures
    // stop at the end of last month. Counting the missing spend as zero
    // would make the yacht look under budget when it is not.
    const monthComplete = budget.categories.every((c) => c.actuals[monthIndex - 1] != null);
    const ytdThrough = monthComplete ? monthIndex : monthIndex - 1;
    const rows = budget.categories.map((c) => {
      const planned = monthlyBudget(c)[monthIndex - 1];
      const actual = c.actuals[monthIndex - 1];
      const f = categoryFigures(c, ytdThrough);
      return {
        id: c.id,
        label: BUDGET_CATEGORIES.find((x) => x.id === c.id)?.label ?? c.id,
        monthBudget: planned,
        monthActual: actual,
        month: actual == null ? null : variance(actual, planned),
        toDate: f.toDate,
        budgetToDate: f.budgetToDate,
        actualToDate: f.actualToDate,
        forecast: f.forecast,
        fullYear: f.fullYear,
      };
    });
    const sum = (key) => roundMoney(rows.reduce((t, r) => t + (r[key] ?? 0), 0));
    const missing = rows.filter((r) => r.monthActual == null).map((r) => r.label);
    const totals = {
      monthBudget: sum('monthBudget'), monthActual: sum('monthActual'),
      budgetToDate: sum('budgetToDate'), actualToDate: sum('actualToDate'), forecast: sum('forecast'),
      annual: roundMoney(budget.categories.reduce((t, c) => t + monthlyBudget(c).reduce((a, b) => a + b, 0), 0)),
    };
    totals.month = variance(totals.monthActual, totals.monthBudget);
    totals.toDate = variance(totals.actualToDate, totals.budgetToDate);
    totals.fullYear = variance(totals.forecast, totals.annual);
    const ytdLabel = ytdThrough ? `the year to end of ${MONTHS_LONG[ytdThrough - 1]}` : null;
    money = { currency: budget.currency, rows, totals, missing, ytdThrough, ytdLabel, ytdMonthName: ytdThrough ? MONTHS_LONG[ytdThrough - 1] : null };

    const cur = (n) => formatMoney(n, budget.currency);
    if (missing.length) keyPoints.push({ tone: 'amber', text: `Spend for ${monthLabel(month)} not yet entered for: ${missing.join(', ')}.` });
    const biggest = [...rows].sort((a, b) => b.toDate.amount - a.toDate.amount)[0];
    if (!ytdThrough) {
      // Nothing to compare yet (January with January not entered).
    } else if (totals.toDate.amount > 0) {
      const tone = totals.toDate.percent > budgetAmberPercent ? 'red' : 'amber';
      keyPoints.push({ tone, text: `Spending is ${cur(totals.toDate.amount)} (${totals.toDate.percent}%) over budget for ${ytdLabel}${biggest.toDate.amount > 0 ? `, mainly ${biggest.label.toLowerCase()} (${cur(biggest.toDate.amount)} over)` : ''}. Full-year forecast ${cur(totals.forecast)}.` });
    } else {
      keyPoints.push({ tone: 'green', text: `Spending is ${cur(-totals.toDate.amount)} under budget for ${ytdLabel}. Full-year forecast ${cur(totals.forecast)}.` });
    }
  }

  if (!keyPoints.some((k) => k.tone !== 'green')) keyPoints.unshift({ tone: 'green', text: 'No compliance or crew certificate issues.' });
  // Most serious first: red, then amber, then green.
  const rank = { red: 0, amber: 1, green: 2 };
  keyPoints.sort((a, b) => rank[a.tone] - rank[b.tone]);

  return {
    month,
    label: monthLabel(month),
    asAt,
    asAtText: formatDate(asAt),
    monthShort: MONTH_LABELS[monthIndex - 1],
    keyPoints,
    compliance: { expired, dueSoon, inDate: compliance.length - expired.length - dueSoon.length, total: compliance.length },
    crew: { total: crew.length, actions: crewActions },
    money,
  };
}
