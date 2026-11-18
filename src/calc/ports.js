// Port distances. Pure functions, tested in tests/ports.test.js.
//
// The port list (data/ports.json) gives each harbour's latitude and
// longitude. The distance between two ports is the great-circle distance
// (the shortest line over the earth's surface) in nautical miles, plus a
// route allowance (a setting, default 10%) because a yacht has to go round
// headlands and islands rather than in a straight line.
//
// This is an estimate for planning. The captain plans the real passage.

const EARTH_RADIUS_NM = 3440.065; // mean radius of the earth in nautical miles

// Lower case, accents removed, punctuation and "the" ignored, so
// "Saint-Tropez", "saint tropez" and "St. Tropez" all compare the same.
export function normalisePortName(text) {
  return String(text ?? '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/[-,/()]/g, ' ')
    .replace(/\bsaint\b/g, 'st')
    .replace(/\s+/g, ' ')
    .trim();
}

// The text shown in the port suggestions list: "Capri, Italy".
export function portLabel(port) {
  return `${port.name}, ${port.country}`;
}

// Find a port by what the user typed: its name, another name it goes by
// ("Napoli" for Naples), or "Name, Country" as picked from the
// suggestions. Returns the port, or null if it is not in the list.
// If a name matches ports in more than one country, the one nearest
// `near` (the other end of the leg) is used, as that is almost always
// the one meant.
export function findPort(text, ports, near = null) {
  const typed = normalisePortName(text);
  if (!typed) return null;
  const matches = ports.filter((p) => {
    const names = [p.name, ...(p.aliases ?? [])].map(normalisePortName);
    return names.includes(typed) || normalisePortName(portLabel(p)) === typed;
  });
  if (matches.length <= 1 || !near) return matches[0] ?? null;
  return matches.reduce((best, p) => (greatCircleNm(p, near) < greatCircleNm(best, near) ? p : best));
}

// Shortest distance over the earth's surface between two points, in
// nautical miles (the haversine formula).
export function greatCircleNm(a, b) {
  const rad = (deg) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.sqrt(h));
}

// Estimated sailing distance between two ports typed by the user, rounded
// to the nearest whole nautical mile.
// Returns { nm } or { nm: null, reason } when it cannot be worked out.
export function estimateLegNm(fromText, toText, ports, allowancePercent) {
  if (!String(fromText ?? '').trim() || !String(toText ?? '').trim()) return { nm: null, reason: '' };
  // Look each end up near the other, so a name used in two countries
  // picks the sensible one.
  const roughFrom = findPort(fromText, ports);
  const roughTo = findPort(toText, ports);
  const from = findPort(fromText, ports, roughTo);
  const to = findPort(toText, ports, roughFrom);
  if (!from && !to) return { nm: null, reason: `${fromText} and ${toText} are not in the port list` };
  if (!from) return { nm: null, reason: `${fromText} is not in the port list` };
  if (!to) return { nm: null, reason: `${toText} is not in the port list` };
  const straight = greatCircleNm(from, to);
  return { nm: Math.round(straight * (1 + allowancePercent / 100)) };
}
