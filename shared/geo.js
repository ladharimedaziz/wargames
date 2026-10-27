// Geometry helpers shared by the server engine and the browser.
import { SEA_ZONES } from './data/places.js';

const R = 6371;
const rad = d => d * Math.PI / 180;
const deg = r => r * 180 / Math.PI;

export function distanceKm(a, b) {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Point at fraction t along the great circle from a to b.
export function interpolate(a, b, t) {
  const φ1 = rad(a.lat), λ1 = rad(a.lon), φ2 = rad(b.lat), λ2 = rad(b.lon);
  const d = 2 * Math.asin(Math.sqrt(Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2));
  if (d < 1e-9) return { lat: a.lat, lon: a.lon };
  const A = Math.sin((1 - t) * d) / Math.sin(d), B = Math.sin(t * d) / Math.sin(d);
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);
  return { lat: deg(Math.atan2(z, Math.hypot(x, y))), lon: deg(Math.atan2(y, x)) };
}

export function bearing(a, b) {
  const φ1 = rad(a.lat), φ2 = rad(b.lat), Δλ = rad(b.lon - a.lon);
  return (deg(Math.atan2(Math.sin(Δλ) * Math.cos(φ2), Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ))) + 360) % 360;
}

// Samples a great-circle path every `stepKm`, returning points (inclusive of both ends).
export function samplePath(a, b, stepKm = 80) {
  const d = distanceKm(a, b);
  const n = Math.max(2, Math.ceil(d / stepKm));
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(interpolate(a, b, i / n));
  return pts;
}

// Ordered list of distinct countries a flight path crosses, given a point -> country lookup.
export function countriesCrossed(a, b, countryAt, stepKm = 80) {
  const out = [];
  for (const p of samplePath(a, b, stepKm)) {
    const c = countryAt(p.lon, p.lat);
    if (c && out[out.length - 1] !== c) out.push(c);
  }
  return [...new Set(out)];
}

export function zonePoint(id) { const z = SEA_ZONES[id]; return z ? { lat: z.lat, lon: z.lon } : null; }

// Shortest path between sea zones avoiding `blocked` zones (a Set). Returns zone ids or null.
export function seaRoute(from, to, blocked = new Set()) {
  if (!SEA_ZONES[from] || !SEA_ZONES[to]) return null;
  const dist = { [from]: 0 }, prev = {}, done = new Set();
  const queue = [from];
  while (queue.length) {
    queue.sort((x, y) => dist[x] - dist[y]);
    const cur = queue.shift();
    if (cur === to) break;
    if (done.has(cur)) continue;
    done.add(cur);
    for (const nb of SEA_ZONES[cur].n) {
      if (done.has(nb) || (blocked.has(nb) && nb !== to)) continue;
      const nd = dist[cur] + distanceKm(SEA_ZONES[cur], SEA_ZONES[nb]);
      if (dist[nb] === undefined || nd < dist[nb]) { dist[nb] = nd; prev[nb] = cur; queue.push(nb); }
    }
  }
  if (dist[to] === undefined) return null;
  const path = [to];
  while (path[0] !== from) path.unshift(prev[path[0]]);
  return path;
}

export function routeLengthKm(route) {
  let d = 0;
  for (let i = 1; i < route.length; i++) d += distanceKm(SEA_ZONES[route[i - 1]], SEA_ZONES[route[i]]);
  return d;
}

// Sea zones whose coast touches a country.
export function zonesTouching(countryId) {
  return Object.keys(SEA_ZONES).filter(z => SEA_ZONES[z].coasts.includes(countryId));
}

// The sea zone whose centre is closest to a point: the zone a ship parked there counts as being in.
export function nearestZone(lat, lon) {
  let best = null, bd = Infinity;
  for (const [id, z] of Object.entries(SEA_ZONES)) { const d = distanceKm({ lat, lon }, z); if (d < bd) { bd = d; best = id; } }
  return best;
}
