// Civilian air and sea traffic for the map. Flights avoid closed airspace (detouring or cancelling),
// the last flights scramble out of a country as its airspace shuts, and shipping re-routes around closed chokepoints.
import { geoInterpolate, geoDistance } from 'd3-geo';
import { AIRPORTS, SHIPPING_LANES, SEA_ZONES } from '/shared/data/places.js';
import { seaRoute } from '/shared/geo.js';

const R = 6371;
const AP = AIRPORTS;
const rnd = (a, b) => a + Math.random() * (b - a);

function destination([lon, lat], bearingDeg, km) {
  const d = km / R, b = bearingDeg * Math.PI / 180, p1 = lat * Math.PI / 180, l1 = lon * Math.PI / 180;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [((l2 * 180 / Math.PI + 540) % 360) - 180, p2 * 180 / Math.PI];
}
function bearing([lon1, lat1], [lon2, lat2]) {
  const p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180, dl = (lon2 - lon1) * Math.PI / 180;
  return (Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) * 180 / Math.PI + 360) % 360;
}
const km = (a, b) => geoDistance(a, b) * R;

function arc(a, b) {
  const n = Math.max(8, Math.round(km(a, b) / 120));
  const f = geoInterpolate(a, b);
  return Array.from({ length: n + 1 }, (_, i) => f(i / n));
}
function polyLen(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += km(pts[i - 1], pts[i]); return s; }

// Samples a polyline at fraction t (by distance) and returns [lon, lat, headingDeg].
export function along(path, t) {
  if (!path.cum) { path.cum = [0]; for (let i = 1; i < path.length; i++) path.cum.push(path.cum[i - 1] + km(path[i - 1], path[i])); }
  const L = path.cum[path.cum.length - 1] * Math.min(1, Math.max(0, t));
  let i = 1; while (i < path.length - 1 && path.cum[i] < L) i++;
  const seg = path.cum[i] - path.cum[i - 1] || 1, u = (L - path.cum[i - 1]) / seg;
  const p = geoInterpolate(path[i - 1], path[i])(u);
  return [p[0], p[1], bearing(path[i - 1], path[i])];
}

export class AirTraffic {
  constructor(countryAt) {
    this.countryAt = countryAt;
    this.flights = [];
    this.target = 160;
    this.closed = new Set();
    this.routeCache = new Map();
    this.cancelled = 0;
    this.diverted = 0;
    this.lastOut = [];
  }
  crossed(path) {
    const out = new Set();
    for (let i = 1; i < path.length - 1; i++) { const c = this.countryAt(path[i][0], path[i][1]); if (c) out.add(c); }
    return out;
  }
  // Finds a path from a to b that avoids closed airspace, trying detours to either side of the direct line.
  plan(a, b, allow = new Set()) {
    const key = `${a}|${b}|${[...this.closed].sort().join(',')}|${[...allow].join(',')}`;
    if (this.routeCache.has(key)) return this.routeCache.get(key);
    const blocked = set => [...set].some(c => this.closed.has(c) && !allow.has(c));
    let result = null;
    const direct = arc(a, b);
    if (!blocked(this.crossed(direct))) result = direct;
    else {
      const mid = geoInterpolate(a, b)(0.5), br = bearing(a, b), d = km(a, b);
      outer: for (const off of [600, 1100, 1700, 2400, 3200]) {
        for (const side of [90, -90]) {
          const w = destination(mid, br + side, off);
          const p = [...arc(a, w), ...arc(w, b).slice(1)];
          if (polyLen(p) > d * 1.9) continue;
          if (!blocked(this.crossed(p))) { result = p; result.detour = true; break outer; }
        }
      }
    }
    if (this.routeCache.size > 3000) this.routeCache.clear();
    this.routeCache.set(key, result);
    return result;
  }
  pickAirport(exclude) {
    const pool = AP.filter(x => !this.closed.has(x.country) && x !== exclude);
    let total = pool.reduce((s, x) => s + x.w, 0), r = Math.random() * total;
    for (const x of pool) { r -= x.w; if (r <= 0) return x; }
    return pool[0];
  }
  spawn(kind = 'normal', from = null, to = null) {
    const A = from || this.pickAirport();
    let B = to;
    for (let tries = 0; !B && tries < 8; tries++) { const c = this.pickAirport(A); if (c && km([A.lon, A.lat], [c.lon, c.lat]) > 700) B = c; }
    if (!A || !B) return null;
    const allow = kind === 'last' ? new Set([A.country]) : new Set();
    const path = this.plan([A.lon, A.lat], [B.lon, B.lat], allow);
    if (!path) { this.cancelled++; return null; }
    const len = polyLen(path);
    const f = { path, t: 0, speed: 1 / (Math.max(22, len / 260) * rnd(0.85, 1.2)), kind, from: A, to: B, born: performance.now(), detour: !!path.detour };
    this.flights.push(f);
    return f;
  }
  // Called when the committee state changes.
  sync(state) {
    const now = new Set(Object.keys(state.global?.closedAirspace || {}));
    const newly = [...now].filter(c => !this.closed.has(c));
    this.closed = now;
    if (!newly.length) return;
    // Last flights out: a burst of departures from every airport in a country whose airspace is closing.
    for (const c of newly) {
      const ports = AP.filter(x => x.country === c);
      for (const p of ports) for (let i = 0; i < Math.min(6, 2 + p.w); i++) {
        const dest = this.pickAirport(p);
        const f = dest && this.spawn('last', p, dest);
        if (f) { f.t = -i * 0.03; f.label = i === 0 ? `LAST FLIGHT OUT · ${p.city}` : null; }
      }
      this.lastOut.push({ country: c, at: performance.now() });
    }
    // Flights already in the air re-route or turn back.
    for (const f of this.flights) {
      if (f.kind === 'last') continue;
      const ahead = f.path.slice(Math.floor(f.t * (f.path.length - 1)));
      if (![...this.crossed(ahead)].some(c => newly.includes(c))) continue;
      const [lon, lat] = along(f.path, f.t);
      const here = [lon, lat];
      const inside = newly.includes(this.countryAt(lon, lat));
      const p = this.plan(here, [f.to.lon, f.to.lat], inside ? new Set([this.countryAt(lon, lat)]) : new Set());
      if (p && !newly.includes(f.to.country)) { f.path = p; f.t = 0; f.speed = 1 / Math.max(14, polyLen(p) / 260); f.kind = 'diverted'; }
      else { f.path = arc(here, [f.from.lon, f.from.lat]); f.t = 0; f.speed = 1 / Math.max(10, polyLen(f.path) / 260); f.kind = 'diverted'; f.turnedBack = true; }
      this.diverted++;
    }
  }
  tick(dt) {
    for (const f of this.flights) f.t += f.speed * dt;
    this.flights = this.flights.filter(f => f.t < 1);
    const normal = this.flights.filter(f => f.kind === 'normal').length;
    // Fewer flights as more of the world closes.
    const closedShare = Math.min(0.7, this.closed.size / 40);
    const want = Math.round(this.target * (1 - closedShare));
    if (normal < want) for (let i = 0; i < Math.min(4, want - normal); i++) { const f = this.spawn(); if (f && this.flights.length < 60) f.t = Math.random() * 0.9; }
  }
}

function zonePath(zones) {
  const pts = zones.map(z => [SEA_ZONES[z].lon, SEA_ZONES[z].lat]);
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) out.push(...arc(pts[i - 1], pts[i]).slice(1));
  return out;
}

export class SeaTraffic {
  constructor() {
    this.ships = [];
    this.blocked = new Set();
    this.routes = new Map();
    this.target = 90;
    this.waiting = 0;
    this.recompute();
  }
  recompute() {
    for (const lane of SHIPPING_LANES) {
      const r = seaRoute(lane.from, lane.to, this.blocked);
      this.routes.set(lane.id, r ? { zones: r, path: zonePath(r) } : null);
    }
  }
  sync(state) {
    const cps = state.global?.chokepoints || {};
    const now = new Set(Object.entries(cps).filter(([, c]) => c.status === 'closed').map(([z]) => z));
    const changed = now.size !== this.blocked.size || [...now].some(z => !this.blocked.has(z));
    this.contested = new Set(Object.entries(cps).filter(([, c]) => c.status === 'contested').map(([z]) => z));
    if (!changed) return;
    const newly = [...now].filter(z => !this.blocked.has(z));
    this.blocked = now;
    this.recompute();
    for (const s of this.ships) {
      if (s.stuck) { if (!now.has(s.stuckAt)) { s.stuck = false; s.path = this.routes.get(s.lane)?.path || s.path; s.t = 0.5; } continue; }
      const i = Math.floor(s.t * (s.zones.length - 1));
      const ahead = s.zones.slice(i + 1);
      const hitZone = ahead.find(z => newly.includes(z));
      if (!hitZone) continue;
      const from = s.zones[Math.max(0, i)];
      const r = seaRoute(from, s.zones[s.zones.length - 1], this.blocked);
      const [lon, lat] = along(s.path, s.t);
      if (r) { s.zones = r; s.path = [[lon, lat], ...zonePath(r)]; s.t = 0; s.speed = 1 / Math.max(30, polyLen(s.path) / 200); s.rerouted = true; }
      else { s.stuck = true; s.stuckAt = hitZone; s.anchor = [SEA_ZONES[hitZone].lon + rnd(-2.5, 2.5), SEA_ZONES[hitZone].lat + rnd(-1.6, 1.6)]; s.from = [lon, lat]; s.anchorT = 0; }
    }
  }
  spawn() {
    const total = SHIPPING_LANES.reduce((s, l) => s + l.weight, 0);
    let r = Math.random() * total, lane = SHIPPING_LANES[0];
    for (const l of SHIPPING_LANES) { r -= l.weight; if (r <= 0) { lane = l; break; } }
    const route = this.routes.get(lane.id);
    const tanker = lane.from === 'persian_gulf' || lane.from === 'red_sea';
    if (!route) {
      // No way through: ships pile up at anchor outside the closed chokepoint.
      const choke = [...this.blocked][Math.floor(Math.random() * this.blocked.size)];
      if (!choke || this.ships.filter(s => s.stuck).length > 40) return;
      const z = SEA_ZONES[choke];
      this.ships.push({ lane: lane.id, zones: [], path: [[z.lon, z.lat]], t: 0, speed: 0, tanker, stuck: true, stuckAt: choke, anchor: [z.lon + rnd(-3, 3), z.lat + rnd(-1.8, 1.8)], from: [z.lon + rnd(-6, 6), z.lat + rnd(-4, 4)], anchorT: 0 });
      return;
    }
    const rev = Math.random() < 0.5;
    const zones = rev ? [...route.zones].reverse() : route.zones;
    const path = rev ? [...route.path].reverse() : route.path;
    this.ships.push({ lane: lane.id, zones, path, t: 0, speed: 1 / Math.max(40, polyLen(path) / 160) * rnd(0.8, 1.2), tanker });
  }
  tick(dt) {
    for (const s of this.ships) {
      if (s.stuck) { s.anchorT = Math.min(1, s.anchorT + dt * 0.15); continue; }
      s.t += s.speed * dt;
    }
    this.ships = this.ships.filter(s => s.t < 1);
    this.waiting = this.ships.filter(s => s.stuck).length;
    const moving = this.ships.length - this.waiting;
    if (moving < this.target) for (let i = 0; i < 3; i++) { this.spawn(); const s = this.ships[this.ships.length - 1]; if (s && !s.stuck && this.ships.length < 40) s.t = Math.random() * 0.95; }
  }
  position(s) {
    if (s.stuck) { const k = s.anchorT; return [s.from[0] + (s.anchor[0] - s.from[0]) * k, s.from[1] + (s.anchor[1] - s.from[1]) * k, 0]; }
    return along(s.path, s.t);
  }
}

export { arc, km };
