import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { candidates, topThree, proposalContent } from '../src/proposal.js';
import { buildProposalPrompt, buildProposalEmail } from '../src/prompts/proposal.js';
import { buildSamples } from '../src/enquiries.js';
import { buildSampleItineraries } from '../src/calc/itinerary.js';
import { importCSV } from '../src/yachts.js';
import { ratesFromSettings } from '../src/calc/currency.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const { settings } = JSON.parse(read('../data/settings.json'));
const yachts = importCSV('yachts', read('../data/yachts.csv')).records;
const enquiries = buildSamples(JSON.parse(read('../data/sample-enquiries.json')).enquiries, '2026-11-17');
const [itinerary] = buildSampleItineraries(JSON.parse(read('../data/sample-itineraries.json')).itineraries, '2026-11-17');
const noRates = ratesFromSettings(settings);
const testRates = { EUR: { perEur: 1 }, GBP: { perEur: 0.8, dateChecked: '2026-11-17' }, USD: { perEur: 1.25, dateChecked: '2026-11-17' } };

const ashworth = enquiries.find((e) => e.clientName === 'The Ashworth family'); // Italy, 10 guests, EUR 600,000
const whitcombe = enquiries.find((e) => e.clientName === 'The Whitcombe family'); // Bahamas, USD budget

// A made-up yacht for exact figures.
const testYacht = (fields) => ({
  id: 't', name: 'Test Yacht', firm: 'Test', lengthM: 50, guests: 12, cabins: 6, builder: 'Builder', year: 2015,
  rateFromWeekly: 350000, currency: 'EUR', cruisingArea: 'Italy', check: 'To check',
  source: 'Test listing', sourceUrl: 'https://example.com', dateChecked: '2026-11-17', notes: null, ...fields,
});

// ---- Choosing the top three ------------------------------------------------

test('candidates have room for the guests and a rate', () => {
  const list = candidates(ashworth, yachts, settings, noRates);
  assert.ok(list.length > 3);
  for (const c of list) {
    assert.ok(c.yacht.guests == null || c.yacht.guests >= 10, c.yacht.name);
    assert.equal(c.quote.ok, true);
  }
});

test('top three: within budget, closest to the budget first', () => {
  const list = candidates(ashworth, yachts, settings, noRates);
  const ids = topThree(list);
  assert.equal(ids.length, 3);
  const picked = ids.map((id) => list.find((c) => c.yacht.id === id));
  assert.ok(picked.every((p) => p.quote.band.id === 'within'));
  const percents = picked.map((p) => p.quote.band.percentOver);
  assert.deepEqual(percents, [...percents].sort((a, b) => b - a)); // nearest the budget first
  const others = list.filter((c) => c.quote.band?.id === 'within' && !ids.includes(c.yacht.id));
  assert.ok(others.every((o) => o.quote.band.percentOver <= percents[2]));
});

test('top three never picks a yacht that is over budget', () => {
  const items = [
    { yacht: { id: 'out' }, quote: { ok: true, band: { id: 'out', percentOver: 30 }, options: [{ breakdown: { total: 1 } }] } },
    { yacht: { id: 'over' }, quote: { ok: true, band: { id: 'over', percentOver: 5 }, options: [{ breakdown: { total: 1 } }] } },
    { yacht: { id: 'within' }, quote: { ok: true, band: { id: 'within', percentOver: -2 }, options: [{ breakdown: { total: 1 } }] } },
  ];
  assert.deepEqual(topThree(items), ['within', 'over']);
});

// ---- Proposal content ------------------------------------------------------

const content = proposalContent({
  enquiry: ashworth, picks: [{ yacht: testYacht({}), deliveryFee: 10000 }], settings, rates: noRates, itinerary, today: '2026-11-17',
});

test('proposal content: dates, client and budget in British format', () => {
  assert.equal(content.clientName, 'The Ashworth family');
  assert.equal(content.prepared, '17 Nov 2026');
  assert.equal(content.dates, '7 to 14 Jul 2027');
  assert.equal(content.budget, '€600,000 all in');
});

test('proposal content: cost lines match the charter maths, including delivery', () => {
  const [y] = content.yachts;
  assert.deepEqual(y.lines.map((l) => `${l.label}: ${l.amount}`), [
    'Charter fee (7 days): €350,000',
    'Delivery fee: €10,000',
    'VAT (22%): €79,200',
    'APA (refundable if unspent), 30%: €105,000',
  ]);
  assert.equal(y.total, '€544,200');
  assert.equal(y.gratuity, '€35,000 to €70,000');
  assert.equal(y.specs, '50 m, built by Builder in 2015, 12 guests in 6 cabins');
});

test('proposal content warns about unverified yachts', () => {
  assert.ok(content.warnings.some((w) => w.includes('Test Yacht: not yet verified')));
  const verified = proposalContent({ enquiry: ashworth, picks: [{ yacht: testYacht({ check: 'Verified' }) }], settings, rates: noRates, today: '2026-11-17' });
  assert.equal(verified.warnings.length, 0);
});

test('proposal content warns when a yacht\'s cruising area is not stated', () => {
  const c = proposalContent({ enquiry: ashworth, picks: [{ yacht: testYacht({ check: 'Verified', cruisingArea: null }) }], settings, rates: noRates, today: '2026-11-17' });
  assert.deepEqual(c.warnings, ['Test Yacht: cruising area not stated. Check it will be in Italy for these dates.']);
});

test('a USD yacht for a EUR client shows both totals once a rate is set', () => {
  const usd = testYacht({ currency: 'USD', rateFromWeekly: 400000 });
  const without = proposalContent({ enquiry: ashworth, picks: [{ yacht: usd }], settings, rates: noRates, today: '2026-11-17' });
  assert.equal(without.yachts[0].clientTotal, null);
  assert.ok(without.warnings.some((w) => w.includes('Add a USD rate')));

  const withRate = proposalContent({ enquiry: ashworth, picks: [{ yacht: usd }], settings, rates: testRates, today: '2026-11-17' });
  assert.equal(withRate.yachts[0].total, '$608,000');
  assert.equal(withRate.yachts[0].clientTotal, 'about €486,400 (EUR 1 = USD 1.25, rate checked 17 Nov 2026)');
});

test('Bahamas shows both VAT figures', () => {
  const c = proposalContent({ enquiry: whitcombe, picks: [{ yacht: testYacht({ currency: 'USD' }) }], settings, rates: noRates, today: '2026-11-17' });
  assert.equal(c.yachts[0].lines[1].label, 'VAT (10% or 14%)');
  assert.equal(c.yachts[0].lines[1].amount, '$35,000 or $49,000');
  assert.equal(c.yachts[0].total, '$490,000 or $504,000');
});

test('a yacht with rate on enquiry is shown without costs', () => {
  const c = proposalContent({ enquiry: ashworth, picks: [{ yacht: testYacht({ rateFromWeekly: null, currency: null }) }], settings, rates: noRates, today: '2026-11-17' });
  assert.equal(c.yachts[0].ok, false);
  assert.equal(c.yachts[0].reason, 'Rate on enquiry');
});

test('the itinerary is included day by day', () => {
  assert.equal(content.itinerary.days.length, 7);
  assert.equal(content.itinerary.days[0].route, 'Naples to Capri');
  assert.equal(content.itinerary.days[3].detail, '112 nm, about 9 h 20 min, a long day');
});

// ---- Prompt and email ------------------------------------------------------

const prompt = buildProposalPrompt(content);
const email = buildProposalEmail(content);

test('the prompt gives Claude the figures and the house rules', () => {
  assert.match(prompt, /British English/);
  assert.match(prompt, /Do not use em dashes/);
  assert.match(prompt, /Do not invent/);
  assert.match(prompt, /Total: €544,200/);
  assert.match(prompt, /Rate from €350,000 a week\./);
  assert.match(prompt, /APA \(refundable if unspent\), 30%: €105,000/);
  assert.match(prompt, /Day 4, 10 Jul 2027: Amalfi to Stromboli \(112 nm, about 9 h 20 min, a long day\)/);
  assert.match(prompt, /VAT uses the rate of the country where the charter starts/);
});

test('the email has a subject, the yachts and a sign-off to fill in', () => {
  assert.match(email, /^Subject: Your yacht charter proposal, 7 to 14 Jul 2027/);
  assert.match(email, /Dear Ashworth family,/); // "The" dropped from the greeting
  assert.match(email, /Total for your dates: €544,200/);
  assert.match(email, /\[Your name\]/);
});

test('prompt and email: no em dashes, no blanks like "undefined" or "null"', () => {
  for (const text of [prompt, email]) {
    assert.ok(!text.includes('—'));
    assert.ok(!/undefined|null|NaN/.test(text));
  }
});

test('the prompt says not to price a rate-on-enquiry yacht', () => {
  const c = proposalContent({ enquiry: ashworth, picks: [{ yacht: testYacht({ rateFromWeekly: null, currency: null }) }], settings, rates: noRates, today: '2026-11-17' });
  assert.match(buildProposalPrompt(c), /Rate on enquiry: do not quote a price/);
});
