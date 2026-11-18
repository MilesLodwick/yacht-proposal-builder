import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalisePortName, findPort, greatCircleNm, estimateLegNm, portLabel } from '../src/calc/ports.js';

const { ports } = JSON.parse(readFileSync(new URL('../data/ports.json', import.meta.url), 'utf8'));
const { settings } = JSON.parse(readFileSync(new URL('../data/settings.json', import.meta.url), 'utf8'));
const allowance = settings.find((s) => s.id === 'itinerary.routeAllowancePercent').value;

test('port names compare without accents, case or punctuation', () => {
  assert.equal(normalisePortName('Saint-Tropez'), normalisePortName('st. tropez'));
  assert.equal(normalisePortName('Korčula'), 'korcula');
  assert.equal(normalisePortName('  Port d’Andratx '), normalisePortName("port dandratx"));
});

test('findPort matches names, other names and "Name, Country"', () => {
  assert.equal(findPort('Naples', ports).name, 'Naples');
  assert.equal(findPort('napoli', ports).name, 'Naples');
  assert.equal(findPort('Capri, Italy', ports).name, 'Capri');
  assert.equal(findPort('St Barts', ports).name, 'Gustavia');
  assert.equal(findPort('Atlantis', ports), null);
  assert.equal(findPort('', ports), null);
});

test('a name used in two places picks the one nearest the other port', () => {
  const twoMarigots = ports.filter((p) => p.name.startsWith('Marigot'));
  assert.equal(twoMarigots.length, 2); // Marigot (Saint-Martin) and Marigot Bay (St Lucia)
  const list = [
    { name: 'Portsmouth', country: 'Dominica', lat: 15.58, lon: -61.465 },
    { name: 'Portsmouth', country: 'England', lat: 50.8, lon: -1.1 },
  ];
  assert.equal(findPort('Portsmouth', list, { lat: 15.3, lon: -61.39 }).country, 'Dominica');
  assert.equal(findPort('Portsmouth', list, { lat: 50.7, lon: -1.3 }).country, 'England');
});

test('great-circle distance: one degree of latitude is 60 nm', () => {
  assert.ok(Math.abs(greatCircleNm({ lat: 40, lon: 14 }, { lat: 41, lon: 14 }) - 60) < 0.1);
  assert.equal(greatCircleNm({ lat: 40, lon: 14 }, { lat: 40, lon: 14 }), 0);
});

test('estimated legs are close to the known passage distances', () => {
  // Known passages, roughly: Naples to Capri about 17 to 19 nm, Positano
  // to Amalfi about 6 nm, Amalfi to Stromboli about 112 nm.
  const leg = (a, b) => estimateLegNm(a, b, ports, allowance).nm;
  assert.ok(leg('Naples', 'Capri') >= 16 && leg('Naples', 'Capri') <= 20);
  assert.ok(leg('Positano', 'Amalfi') >= 5 && leg('Positano', 'Amalfi') <= 7);
  assert.ok(leg('Amalfi', 'Stromboli') >= 105 && leg('Amalfi', 'Stromboli') <= 130);
});

test('the route allowance is added to the straight line', () => {
  const straight = estimateLegNm('Naples', 'Capri', ports, 0).nm;
  const withAllowance = estimateLegNm('Naples', 'Capri', ports, 20).nm;
  assert.ok(withAllowance > straight);
  assert.equal(withAllowance, Math.round(greatCircleNm(findPort('Naples', ports), findPort('Capri', ports)) * 1.2));
});

test('an unknown port gives a reason instead of a distance', () => {
  assert.deepEqual(estimateLegNm('Naples', 'Atlantis', ports, 10), { nm: null, reason: 'Atlantis is not in the port list' });
  assert.deepEqual(estimateLegNm('Naples', '', ports, 10), { nm: null, reason: '' });
});

test('every port in the list has a sensible position and a unique label', () => {
  for (const p of ports) {
    assert.ok(p.lat > 10 && p.lat < 47 && p.lon > -80 && p.lon < 31, `${p.name} looks out of area`);
  }
  const labels = ports.map(portLabel);
  assert.equal(new Set(labels).size, labels.length);
});
