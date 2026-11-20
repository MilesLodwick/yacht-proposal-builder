// Photos of boats for sale, for the brokerage screens.
//
// data/sale-pages.json gives each boat's page on the selling firm's
// website and that page's headline photo. A screen marks where a photo
// should go with boatPhoto(id); this file fills every such mark as it
// appears on the page, so screens do not have to wait for the file.
// Boats with no photo, and photos that fail to load, show nothing.

import { escapeHTML } from './html.js';

let data = null;
const loaded = fetch('data/sale-pages.json', { cache: 'no-cache' })
  .then((r) => r.json())
  .then((d) => { data = d; fillAll(document); })
  .catch(() => { data = { pages: {}, images: {} }; });

// Where a boat's photo goes. size: 'thumb' (small, in lists) or 'large'.
export function boatPhoto(id, size = 'thumb') {
  return `<span class="boat-photo boat-photo--${size}" data-boat-photo="${escapeHTML(id)}"></span>`;
}

// The boat's own page on the firm's website, or null.
export function boatPage(id) {
  return data?.pages?.[id] ?? null;
}

function fill(mark) {
  if (!data || mark.dataset.filled) return;
  mark.dataset.filled = 'yes';
  const src = data.images[mark.dataset.boatPhoto];
  if (!src) { mark.remove(); return; }
  const page = data.pages[mark.dataset.boatPhoto];
  const img = `<img src="${escapeHTML(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
  // The photo is a shortcut to the boat's page. The boat's name is the
  // link screen readers and keyboards use, so the photo link is hidden from both.
  mark.innerHTML = page
    ? `<a href="${escapeHTML(page)}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">${img}</a>`
    : img;
  mark.querySelector('img').addEventListener('error', () => mark.remove());
}

function fillAll(root) {
  root.querySelectorAll?.('[data-boat-photo]').forEach(fill);
}

// Fill marks whenever a screen draws or redraws.
new MutationObserver((changes) => {
  if (!data) return;
  for (const change of changes) {
    for (const node of change.addedNodes) {
      if (node.nodeType !== 1) continue;
      if (node.matches('[data-boat-photo]')) fill(node);
      fillAll(node);
    }
  }
}).observe(document.documentElement, { childList: true, subtree: true });

export { loaded as boatPhotosLoaded };
