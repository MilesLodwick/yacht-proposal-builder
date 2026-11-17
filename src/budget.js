// Operating budgets: one per managed yacht per year.
// Pure functions, tested in tests/budget.test.js. The maths (variance,
// forecast) lives in src/calc/management.js.
//
// A budget: { id, yachtId, year, currency,
//             categories: [{ id, annual, monthly: [12] or null, actuals: [12] }] }
// actuals[i] is null until that month's spend is entered.

import { BUDGET_CATEGORIES, monthlyBudget } from './calc/management.js';
import { roundMoney } from './calc/charter.js';

export function emptyBudget(yachtId, year, currency = 'EUR') {
  return {
    id: `budget-${yachtId}-${year}`,
    yachtId,
    year,
    currency,
    categories: BUDGET_CATEGORIES.map((c) => ({ id: c.id, annual: 0, monthly: null, actuals: Array(12).fill(null) })),
  };
}

// Read a money box: blank is "not entered" (null), otherwise a number of
// 0 or more. Returns { ok, value } or { ok: false, error }.
export function readAmount(text) {
  const raw = String(text ?? '').replace(/[,\s]/g, '');
  if (raw === '') return { ok: true, value: null };
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return { ok: false, error: 'Enter an amount of 0 or more.' };
  return { ok: true, value: roundMoney(n) };
}

// Change a category's annual budget. A seasonal split is scaled so its
// shape is kept and its total matches the new annual figure.
export function setAnnual(budget, categoryId, annual) {
  return {
    ...budget,
    categories: budget.categories.map((c) => {
      if (c.id !== categoryId) return c;
      if (!c.monthly || !c.annual) return { ...c, annual, monthly: null };
      const scaled = c.monthly.map((m) => roundMoney((m / c.annual) * annual));
      scaled[11] = roundMoney(annual - scaled.slice(0, 11).reduce((t, v) => t + v, 0));
      return { ...c, annual, monthly: scaled };
    }),
  };
}

// Set one month's actual spend for one category (month is 1 to 12).
export function setActual(budget, categoryId, month, value) {
  return {
    ...budget,
    categories: budget.categories.map((c) => {
      if (c.id !== categoryId) return c;
      const actuals = [...c.actuals];
      actuals[month - 1] = value;
      return { ...c, actuals };
    }),
  };
}

// The sample budget is for the current year, with actuals up to last
// month. Early in the year (January or February) there is too little to
// show, so the sample uses last year in full instead.
// Each month's actual is the monthly budget times a factor from the
// template, so overspends and savings are built in on purpose.
export function buildSampleBudget(template, today) {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const useLastYear = month <= 2;
  const through = useLastYear ? 12 : month - 1;
  return {
    id: `sample-budget-${template.yachtId}`,
    example: true,
    yachtId: template.yachtId,
    year: useLastYear ? year - 1 : year,
    currency: template.currency,
    categories: template.categories.map((c) => {
      const budget = monthlyBudget(c);
      return {
        id: c.id,
        annual: c.annual,
        monthly: c.monthly ?? null,
        actuals: budget.map((b, i) => (i < through ? roundMoney(b * c.factors[i]) : null)),
      };
    }),
  };
}
