import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CERT_TYPES, memberStatus, typeStatus, crewSummary, validateMember, validateCertificate, buildSampleCrew } from '../src/crew.js';

const TODAY = '2026-11-17';
const crew = buildSampleCrew(JSON.parse(readFileSync(new URL('../data/sample-crew.json', import.meta.url), 'utf8')).crew, TODAY);
const person = (name) => crew.find((c) => c.name === name);

test('the certificate types from the brief: STCW, ENG1, Certificate of Competency', () => {
  assert.deepEqual(CERT_TYPES.map((t) => t.label), ['STCW', 'ENG1', 'Certificate of Competency', 'Other']);
});

test('a crew member\'s colour is their worst certificate', () => {
  assert.equal(memberStatus(person('Tom Hadley'), TODAY, 60).worst, 'green');
  assert.equal(memberStatus(person('Ana Moreno'), TODAY, 60).worst, 'amber');  // STCW in 31 days
  assert.equal(memberStatus(person('Piet de Wit'), TODAY, 60).worst, 'red');    // ENG1 expired
});

test('certificates are listed most urgent first', () => {
  const s = memberStatus(person('Piet de Wit'), TODAY, 60);
  assert.equal(s.certificates[0].type, 'eng1');
  assert.equal(s.certificates[0].status.text, 'Expired 12 Nov 2026');
  assert.equal(s.needsAction.length, 1);
});

test('a missing STCW or ENG1 is flagged "not recorded"', () => {
  const s = memberStatus(person('Sam Okafor'), TODAY, 60);
  assert.equal(s.worst, 'amber');
  assert.deepEqual(s.needsAction.map((c) => c.status.text), ['ENG1 not recorded']);
});

test('a Certificate of Competency is not expected of everyone', () => {
  const chef = memberStatus(person('Marco Bellini'), TODAY, 60);
  assert.ok(!chef.certificates.some((c) => c.type === 'coc'));
  assert.ok(!chef.needsAction.some((c) => c.type === 'coc'));
});

test('status for one type, for the table', () => {
  assert.equal(typeStatus(person('Marco Bellini'), 'eng1', TODAY, 60).text, 'Expires in 15 days');
  assert.equal(typeStatus(person('Marco Bellini'), 'coc', TODAY, 60), null);
  assert.equal(typeStatus(person('Sam Okafor'), 'eng1', TODAY, 60).text, 'ENG1 not recorded');
});

test('crew summary: 8 crew, 1 red, 4 amber, 3 green', () => {
  // red: Piet (ENG1 expired). amber: Ana (31), Liam (44), Sam (no ENG1), Marco (15).
  assert.deepEqual(crewSummary(crew, TODAY, 60), { total: 8, red: 1, amber: 4, green: 3 });
});

test('the amber window follows the setting', () => {
  assert.deepEqual(crewSummary(crew, TODAY, 30), { total: 8, red: 1, amber: 2, green: 5 }); // only Sam and Marco
});

test('a crew member needs a name and role', () => {
  assert.equal(validateMember({ name: 'A', role: 'Deckhand' }).ok, true);
  assert.deepEqual(Object.keys(validateMember({ name: '', role: '', joined: 'soon' }).errors).sort(), ['joined', 'name', 'role']);
});

test('a certificate needs a type and an expiry date; "Other" needs a description', () => {
  assert.equal(validateCertificate({ type: 'eng1', expiresOn: '2027-01-01' }).ok, true);
  assert.deepEqual(Object.keys(validateCertificate({ type: 'other', detail: '', expiresOn: '' }).errors).sort(), ['detail', 'expiresOn']);
});

test('the sample crew are fictional examples on the fictional yacht', () => {
  assert.equal(crew.length, 8);
  assert.ok(crew.every((c) => c.example && c.yachtId === 'managed-example-1'));
});
