// Crew records: who is on each managed yacht and when their certificates
// expire. Pure functions, tested in tests/crew.test.js.
//
// All crew in the sample data are fictional.
//
// A crew member: { id, yachtId, name, role, joined, notes,
//                  certificates: [{ id, type, detail, number, expiresOn }] }
// Same colour rules as compliance: red expired, amber within the setting
// (default 60 days), green otherwise.

import { expiryStatus } from './calc/management.js';
import { parseDate, addDays } from './calc/dates.js';

// The three certificate types from the brief, plus "Other".
export const CERT_TYPES = [
  { id: 'stcw', label: 'STCW', hint: 'Basic safety training and any advanced courses' },
  { id: 'eng1', label: 'ENG1', hint: 'Seafarer medical certificate' },
  { id: 'coc', label: 'Certificate of Competency', hint: 'Deck or engineering licence, with its grade' },
  { id: 'other', label: 'Other', hint: 'For example a food hygiene or powerboat certificate' },
];

// STCW and ENG1 are expected for everyone on board, so a crew member with
// neither recorded is flagged "not recorded" to be checked.
const EXPECTED_FOR_ALL = ['stcw', 'eng1'];

export const ROLES = [
  'Captain', 'Chief Officer', 'Second Officer', 'Bosun', 'Deckhand',
  'Chief Engineer', 'Second Engineer', 'Chief Stew', 'Stewardess', 'Chef',
];

export const certLabel = (id) => CERT_TYPES.find((t) => t.id === id)?.label ?? id;

const TONE_RANK = { red: 0, amber: 1, green: 2 };

// Every certificate with its status, plus "not recorded" lines for STCW or
// ENG1 when missing. The worst status sets the crew member's overall colour.
export function memberStatus(member, today, amberDays) {
  const certs = (member.certificates ?? []).map((c) => ({ ...c, status: expiryStatus(c.expiresOn, today, amberDays) }));
  const missing = EXPECTED_FOR_ALL
    .filter((type) => !certs.some((c) => c.type === type))
    .map((type) => ({ type, missing: true, status: { tone: 'amber', text: `${certLabel(type)} not recorded`, days: null } }));
  const all = [...certs, ...missing].sort((a, b) => TONE_RANK[a.status.tone] - TONE_RANK[b.status.tone] || (a.status.days ?? -1) - (b.status.days ?? -1));
  const worst = all.length ? all[0].status.tone : 'amber';
  return { certificates: all, worst, needsAction: all.filter((c) => c.status.tone !== 'green') };
}

// The most urgent status for one certificate type, for the table columns.
export function typeStatus(member, type, today, amberDays) {
  const matching = memberStatus(member, today, amberDays).certificates.filter((c) => c.type === type);
  return matching[0]?.status ?? null;
}

// Counts across a crew: how many people are fine, need attention or have
// something expired.
export function crewSummary(crew, today, amberDays) {
  const worst = crew.map((m) => memberStatus(m, today, amberDays).worst);
  return {
    total: crew.length,
    red: worst.filter((w) => w === 'red').length,
    amber: worst.filter((w) => w === 'amber').length,
    green: worst.filter((w) => w === 'green').length,
  };
}

export function validateMember(input) {
  const errors = {};
  if (!String(input.name ?? '').trim()) errors.name = 'Enter the crew member\'s name.';
  if (!String(input.role ?? '').trim()) errors.role = 'Enter their role.';
  if (input.joined && !parseDate(input.joined)) errors.joined = 'Enter a valid date.';
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true };
}

export function validateCertificate(input) {
  const errors = {};
  if (!CERT_TYPES.some((t) => t.id === input.type)) errors.type = 'Choose the type of certificate.';
  if (input.type === 'other' && !String(input.detail ?? '').trim()) errors.detail = 'Say what the certificate is.';
  if (!parseDate(input.expiresOn)) errors.expiresOn = 'Enter the expiry date from the certificate.';
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true };
}

// Sample crew store expiry dates as days from today.
export function buildSampleCrew(templates, today) {
  return templates.map((t, i) => ({
    id: `sample-crew-${i + 1}`,
    example: true,
    yachtId: t.yachtId,
    name: t.name,
    role: t.role,
    joined: t.joinedDaysAgo == null ? null : addDays(today, -t.joinedDaysAgo),
    notes: t.notes ?? '',
    certificates: t.certificates.map((c, j) => ({
      id: `sample-crew-${i + 1}-cert-${j + 1}`,
      type: c.type,
      detail: c.detail ?? '',
      number: c.number ?? '',
      expiresOn: addDays(today, c.expiresInDays),
    })),
  }));
}
