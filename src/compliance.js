// Yacht management: the yachts being managed, and their compliance
// certificates and audits. Pure functions, tested in tests/compliance.test.js.
//
// Managed yachts are separate from the charter and sale listings. Their
// compliance records are private, so the sample yacht is fictional: dates
// on a real yacht's ISM or class certificates would be false statements
// about a real vessel.
//
// A managed yacht: { id, name, lengthM, flag, classSociety, notes }
// A compliance item: { id, yachtId, category, title, reference, expiresOn, notes }
// "expiresOn" is the expiry date of a certificate or policy, or the date an
// audit or survey is due.

import { expiryStatus } from './calc/management.js';
import { parseDate, addDays } from './calc/dates.js';

// The categories from the brief, with typical items as suggestions. The
// user types the actual title and dates from the certificate itself.
export const COMPLIANCE_CATEGORIES = [
  { id: 'ism', label: 'ISM (safety management)', suggestions: ['Safety Management Certificate', 'ISM internal audit', 'ISM external audit'] },
  { id: 'isps', label: 'ISPS (security)', suggestions: ['International Ship Security Certificate', 'ISPS audit'] },
  { id: 'mlc', label: 'MLC (crew welfare)', suggestions: ['Maritime Labour Certificate', 'MLC inspection'] },
  { id: 'class', label: 'Class surveys', suggestions: ['Class certificate', 'Annual class survey', 'Intermediate survey', 'Special survey'] },
  { id: 'flag', label: 'Flag', suggestions: ['Certificate of Registry', 'Flag state inspection'] },
  { id: 'insurance', label: 'Insurance', suggestions: ['Hull and machinery policy', 'P&I cover'] },
];

export const categoryLabel = (id) => COMPLIANCE_CATEGORIES.find((c) => c.id === id)?.label ?? id;

// Audits, surveys, inspections and reviews fall due rather than expire,
// so their wording changes: "Due in 24 days", "Overdue since 11 Nov 2026".
export function isDueItem(item) {
  return /audit|survey|inspection|review/i.test(item.title ?? '');
}

export function itemStatus(item, today, amberDays) {
  const status = expiryStatus(item.expiresOn, today, amberDays);
  if (!isDueItem(item)) return status;
  const text = status.text
    .replace(/^Expired /, 'Overdue since ')
    .replace(/^Expires today$/, 'Due today')
    .replace(/^Expires in /, 'Due in ')
    .replace(/^Valid until /, 'Next due ')
    .replace(/^Expiry date not recorded$/, 'Due date not recorded');
  return { ...status, text };
}

// Every item with its status, most urgent first: expired, then soonest.
// Items with no date sort just after expired ones so they get chased.
export function complianceList(items, today, amberDays) {
  const rank = (s) => (s.tone === 'red' ? 0 : s.days == null ? 1 : 2);
  return items
    .map((item) => ({ ...item, status: itemStatus(item, today, amberDays) }))
    .sort((a, b) => rank(a.status) - rank(b.status) || (a.status.days ?? 0) - (b.status.days ?? 0) || a.title.localeCompare(b.title));
}

// Red, amber and green counts for one yacht, and per category.
export function complianceSummary(items, today, amberDays) {
  const listed = complianceList(items, today, amberDays);
  const count = (list) => ({
    red: list.filter((i) => i.status.tone === 'red').length,
    amber: list.filter((i) => i.status.tone === 'amber').length,
    green: list.filter((i) => i.status.tone === 'green').length,
  });
  return {
    total: count(listed),
    byCategory: COMPLIANCE_CATEGORIES.map((c) => ({ ...c, ...count(listed.filter((i) => i.category === c.id)) })),
    missingCategories: COMPLIANCE_CATEGORIES.filter((c) => !items.some((i) => i.category === c.id)).map((c) => c.label),
  };
}

export function validateItem(input) {
  const errors = {};
  if (!COMPLIANCE_CATEGORIES.some((c) => c.id === input.category)) errors.category = 'Choose a category.';
  if (!String(input.title ?? '').trim()) errors.title = 'Enter what the certificate, audit or policy is.';
  if (input.expiresOn && !parseDate(input.expiresOn)) errors.expiresOn = 'Enter a valid date.';
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true };
}

export function validateManagedYacht(input) {
  const errors = {};
  if (!String(input.name ?? '').trim()) errors.name = 'Enter the yacht\'s name.';
  const length = String(input.lengthM ?? '').trim();
  if (length && !(Number(length) > 0)) errors.lengthM = 'Enter the length in metres.';
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true };
}

// Sample data: dates as days from today.
export function buildSampleManaged({ yachts, items }, today) {
  return {
    yachts: yachts.map((y) => ({ ...y, example: true })),
    items: items.map((it, i) => ({
      id: `sample-compliance-${i + 1}`,
      example: true,
      yachtId: it.yachtId,
      category: it.category,
      title: it.title,
      reference: it.reference ?? '',
      expiresOn: it.expiresInDays == null ? null : addDays(today, it.expiresInDays),
      notes: it.notes ?? '',
    })),
  };
}
