// Keep the open page on the newest published version.
//
// GitHub Pages stamps every file with the time it was published, and the
// browser records that time for this page (document.lastModified). This
// asks the server for the page's current time:
//   - when the site opens,
//   - when the user comes back to the tab,
//   - and every few minutes while it is open.
// If the server's copy is newer, the page reloads itself (the service
// worker in sw.js then fetches every file fresh). If the user has typed
// into a form since the page loaded, it shows an "Update now" banner
// instead, so nothing they have typed is lost.

const CHECK_EVERY_MINUTES = 5;
const TRIED_KEY = 'yacht-proposal-builder-update-tried';

const loadedAt = Date.parse(document.lastModified);
let typedSinceLoad = false;
document.addEventListener('input', () => { typedSinceLoad = true; });

async function publishedAt() {
  try {
    const response = await fetch(location.pathname, { method: 'HEAD', cache: 'no-store' });
    return Date.parse(response.headers.get('last-modified'));
  } catch {
    return NaN; // offline: try again later
  }
}

function reload(serverTime) {
  // Reload at most once for each published version, so a browser that
  // keeps serving an old copy cannot get stuck reloading.
  try {
    if (sessionStorage.getItem(TRIED_KEY) === String(serverTime)) return;
    sessionStorage.setItem(TRIED_KEY, String(serverTime));
  } catch { /* storage blocked: reload anyway */ }
  location.reload();
}

async function check() {
  const serverTime = await publishedAt();
  if (!Number.isFinite(serverTime) || !Number.isFinite(loadedAt) || serverTime <= loadedAt) return;
  if (!typedSinceLoad) {
    reload(serverTime);
    return;
  }
  const banner = document.getElementById('update-banner');
  if (banner) banner.hidden = false;
}

export function keepUpToDate() {
  if (location.protocol !== 'https:') return; // only on the published site
  document.getElementById('update-now')?.addEventListener('click', () => location.reload());
  check();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  setInterval(check, CHECK_EVERY_MINUTES * 60 * 1000);
}
