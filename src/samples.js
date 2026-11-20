// Fictional sample data, so every screen has something to show.
//
// Each data/sample-*.json file is built into records (dates are stored as
// "days from today", so the demo never looks out of date). Every sample
// record has example: true, so the Example data banner shows and one
// button removes them all.
//
// Three ways samples arrive:
//   1. First visit: each empty section gets its samples.
//   2. A later version of the app adds more samples (marked "addedIn"):
//      a browser that still has the earlier samples gets the new ones once.
//      A sample the user deletes is never brought back this way.
//   3. The "Load sample data" button (Import and export screen) puts back
//      every missing sample, for a demo after the samples were cleared.

import { hasCollection, getCollection, saveCollection, newSamplesToAdd, getOfferedSamples, markSamplesOffered } from './store.js';
import { todayISO } from './calc/dates.js';
import { buildSamples } from './enquiries.js';
import { buildSampleItineraries } from './calc/itinerary.js';
import { buildSampleContracts } from './contracts.js';
import { buildSamplePreferences } from './preferences.js';
import { buildSampleAvailability } from './calc/availability.js';
import { buildSampleBooklets } from './booklet.js';
import { buildSampleBriefs } from './buyer.js';
import { buildSampleActivity } from './activity.js';
import { buildSampleDeals } from './deals.js';
import { buildSampleManaged } from './compliance.js';
import { buildSampleCrew } from './crew.js';
import { buildSampleBudget } from './budget.js';

// Raise this date whenever samples marked "addedIn" are added, so browsers
// that already have data check for them once.
const SAMPLES_VERSION = '2026-11-20';
const VERSION_KEY = 'yacht-proposal-builder-samples-version';

// In order: preference sheets are built from the enquiries.
const SOURCES = [
  { file: 'data/sample-enquiries.json', names: ['enquiries'], build: (d, today) => ({ enquiries: buildSamples(d.enquiries, today) }) },
  { file: 'data/sample-itineraries.json', names: ['itineraries'], build: (d, today) => ({ itineraries: buildSampleItineraries(d.itineraries, today) }) },
  { file: 'data/sample-contracts.json', names: ['contracts'], build: (d, today) => ({ contracts: buildSampleContracts(d.contracts, today) }) },
  { file: 'data/sample-preferences.json', names: ['preferences'], build: (d) => ({ preferences: buildSamplePreferences(d.sheets, getCollection('enquiries')) }) },
  { file: 'data/sample-availability.json', names: ['availability'], build: (d, today) => ({ availability: buildSampleAvailability(d.entries, today) }) },
  { file: 'data/sample-booklets.json', names: ['booklets'], build: (d, today) => ({ booklets: buildSampleBooklets(d.booklets, today) }) },
  { file: 'data/sample-briefs.json', names: ['buyerBriefs'], build: (d) => ({ buyerBriefs: buildSampleBriefs(d.briefs) }) },
  { file: 'data/sample-activity.json', names: ['saleActivity'], build: (d, today) => ({ saleActivity: buildSampleActivity(d.entries, today) }) },
  { file: 'data/sample-deals.json', names: ['deals'], build: (d, today) => ({ deals: buildSampleDeals(d.deals, today) }) },
  { file: 'data/sample-managed.json', names: ['managedYachts', 'compliance'], build: (d, today) => { const s = buildSampleManaged(d, today); return { managedYachts: s.yachts, compliance: s.items }; } },
  { file: 'data/sample-crew.json', names: ['crew'], build: (d, today) => ({ crew: buildSampleCrew(d.crew, today) }) },
  { file: 'data/sample-budget.json', names: ['budgets'], build: (d, today) => ({ budgets: [buildSampleBudget(d.budget, today)] }) },
];

async function built(source) {
  const response = await fetch(source.file, { cache: 'no-cache' });
  if (!response.ok) return {};
  return source.build(await response.json(), todayISO());
}

function readVersion() {
  try { return localStorage.getItem(VERSION_KEY) ?? ''; } catch { return SAMPLES_VERSION; }
}
function writeVersion() {
  try { localStorage.setItem(VERSION_KEY, SAMPLES_VERSION); } catch { /* storage blocked */ }
}

// Run when the app starts (ways 1 and 2 above). Only fetches sample files
// when a section is empty or this browser has not seen the latest samples.
export async function addStartupSamples() {
  const checkNew = readVersion() < SAMPLES_VERSION;
  for (const source of SOURCES) {
    if (!checkNew && source.names.every(hasCollection)) continue;
    const records = await built(source);
    for (const [name, samples] of Object.entries(records)) {
      const later = samples.filter((s) => s.addedIn).map((s) => s.id);
      if (!hasCollection(name)) {
        saveCollection(name, samples);
      } else if (checkNew && getCollection(name).some((r) => r.example)) {
        const toAdd = newSamplesToAdd(getCollection(name), samples, getOfferedSamples());
        if (toAdd.length) saveCollection(name, [...getCollection(name), ...toAdd]);
      }
      markSamplesOffered(later);
    }
  }
  writeVersion();
}

// The "Load sample data" button (way 3): add every sample that is not
// there. The user's own records are never touched. Returns how many
// records were added.
export async function addAllMissingSamples() {
  let added = 0;
  for (const source of SOURCES) {
    const records = await built(source);
    for (const [name, samples] of Object.entries(records)) {
      const have = new Set((hasCollection(name) ? getCollection(name) : []).map((r) => r.id));
      const missing = samples.filter((s) => !have.has(s.id));
      if (missing.length || !hasCollection(name)) {
        saveCollection(name, [...(hasCollection(name) ? getCollection(name) : []), ...missing]);
        added += missing.length;
      }
    }
  }
  return added;
}
