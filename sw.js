// Always-fresh service worker.
//
// GitHub Pages lets browsers reuse its files for up to 10 minutes, so
// after an update a phone could keep showing the old site. This worker
// sends every request for the site's own files to the network with
// "no-cache": the browser must ask GitHub whether the file has changed
// (a quick "not modified" answer if not) before using its saved copy.
//
// It stores nothing itself and does nothing offline. Requests to other
// sites (yacht photos, fonts) are left alone.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  // A page load cannot be copied with new options, so fetch its address.
  const fresh = request.mode === 'navigate'
    ? fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' })
    : fetch(request, { cache: 'no-cache' });
  event.respondWith(fresh.catch(() => fetch(request)));
});
