// Bring the boats for sale up to date with the latest status checks
// (data/sale-status.json), e.g. a boat the firm now shows as under offer.
// Each update is applied once per browser; see applyStatusUpdates.

import { hasCollection, getCollection, saveCollection } from './store.js';
import { applyStatusUpdates } from './listings.js';

const APPLIED_KEY = 'yacht-proposal-builder-status-updates-applied';

function readApplied() {
  try { return JSON.parse(localStorage.getItem(APPLIED_KEY) ?? '[]'); } catch { return []; }
}

export async function applySaleStatusChecks() {
  if (!hasCollection('forSale')) return;
  try {
    const response = await fetch('data/sale-status.json', { cache: 'no-cache' });
    if (!response.ok) return;
    const { updates, dateChecked } = await response.json();
    const applied = readApplied();
    const result = applyStatusUpdates(getCollection('forSale'), updates, dateChecked, applied);
    if (result.applied.length) {
      saveCollection('forSale', result.boats);
      localStorage.setItem(APPLIED_KEY, JSON.stringify([...applied, ...result.applied]));
    }
  } catch {
    // Offline or storage blocked: try again next time.
  }
}
