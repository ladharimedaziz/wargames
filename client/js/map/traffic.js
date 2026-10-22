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

// --- Shipping ---------------------------------------------------------------------------------------------
// Ships follow real sea lanes: the narrow straits use hand-drawn water channels, and every open-sea leg between
// them is found on a half-degree water grid so no route crosses land. Each ship then sails its own line within
// the lane, at its own speed, so traffic never looks like beads on a string.

// Water channels through each chokepoint, listed from one side to the other (lon, lat).
const STRAITS = {
  hormuz: [[54.6, 26.3], [55.8, 26.5], [56.4, 26.6], [56.75, 26.3], [57.1, 25.8], [57.6, 25.2]],
  bab: [[42.2, 14.6], [42.9, 13.5], [43.3, 12.7], [43.5, 12.45], [43.9, 12.25], [44.6, 12.15]],
  suez: [[33.9, 27.5], [33.2, 28.6], [32.56, 29.85], [32.57, 30.3], [32.35, 30.6], [32.31, 31.0], [32.33, 31.35], [32.4, 31.8]],
  bosporus: [[25.6, 39.6], [26.05, 40.0], [26.25, 40.08], [26.55, 40.3], [26.7, 40.42], [27.3, 40.62], [28.3, 40.85], [28.95, 40.98], [29.05, 41.12], [29.12, 41.22], [29.3, 41.45], [29.8, 41.8]],
  gibraltar: [[-7.5, 36.0], [-6.2, 35.95], [-5.6, 35.97], [-5.0, 36.05], [-4.0, 36.3]],
  danish: [[9.0, 57.9], [10.7, 57.85], [11.4, 57.3], [11.9, 56.6], [12.55, 56.05], [12.7, 55.7], [12.85, 55.35], [13.6, 55.15], [14.6, 55.1]],
  malacca: [[95.0, 6.3], [96.5, 6.0], [97.5, 5.7], [98.3, 5.2], [98.8, 4.6], [99.4, 4.0], [100.0, 3.5], [100.6, 2.9], [101.3, 2.4], [102.0, 2.0], [102.7, 1.6], [103.3, 1.2], [103.6, 1.17], [104.0, 1.22], [104.45, 1.35], [105.2, 1.9]],
  panama: [[-79.95, 9.5], [-79.9, 9.3], [-79.75, 9.15], [-79.6, 9.0], [-79.55, 8.85], [-79.5, 8.6], [-79.4, 8.2]],
};
// Extra water waypoints for legs that pass narrow straits that are not zones of their own.
const LEG_VIA = {
  'atlantic_east|north_sea': [[-5.5, 48.9], [-2.0, 49.9], [0.5, 50.4], [1.6, 51.0], [2.4, 51.6]],
  'java_sea|south_china': [[115.85, -9.2], [115.75, -8.4], [116.0, -6.5], [112.0, -4.0], [108.5, -2.0], [107.5, 1.5]],
  'east_china|japan_sea': [[128.7, 34.0], [129.7, 35.2]],
};

const R0 = 0.5; // grid step, degrees
const cellKey = (i, j) => `${i},${j}`;

export class SeaTraffic {
  constructor(landAt) {
    this.landAt = landAt || (() => false);
    this.ships = [];
    this.blocked = new Set();
    this.contested = new Set();
    this.routes = new Map();
    this.legs = new Map();
    this.target = 110;
    this.waiting = 0;
    this.recompute();
  }
  water(lon, lat) { return !this.landAt(lon, lat); }
  // Nearest water to a point, searching outward in rings.
  toWater(p) {
    if (this.water(p[0], p[1])) return p;
    for (const r of [0.1, 0.2, 0.35, 0.5, 0.75, 1, 1.5, 2, 3]) {
      for (let a = 0; a < 16; a++) {
        const q = [p[0] + Math.cos(a * Math.PI / 8) * r / Math.max(0.3, Math.cos(p[1] * Math.PI / 180)), p[1] + Math.sin(a * Math.PI / 8) * r];
        if (this.water(q[0], q[1])) return q;
      }
    }
    return p;
  }
  // Is the whole segment a→b at sea (sampled every ~0.2°)?
  clear(a, b) {
    let dl = b[0] - a[0]; if (dl > 180) dl -= 360; if (dl < -180) dl += 360;
    const n = Math.max(2, Math.ceil(Math.hypot(dl, b[1] - a[1]) / 0.2));
    for (let i = 1; i < n; i++) if (!this.water(a[0] + dl * i / n, a[1] + (b[1] - a[1]) * i / n)) return false;
    return true;
  }
  // A* across the water grid between two sea points, then pulled taut. Falls back to a straight line.
  leg(a, b) {
    const key = `${a.join()}>${b.join()}`;
    if (this.legs.has(key)) return this.legs.get(key);
    let out = [a, b];
    if (!this.clear(a, b)) {
      const wrap = i => ((i % 720) + 720) % 720;
      const toCell = p => [wrap(Math.round((p[0] + 180) / R0)), Math.round((p[1] + 90) / R0)];
      const center = (i, j) => [i * R0 - 180, j * R0 - 90];
      const [si, sj] = toCell(a), [ti, tj] = toCell(b);
      const h = (i, j) => { let di = Math.abs(i - ti); di = Math.min(di, 720 - di); return Math.hypot(di * Math.cos(((j * R0 - 90) * Math.PI) / 180), j - tj); };
      const open = [[h(si, sj), 0, si, sj]], g = new Map([[cellKey(si, sj), 0]]), from = new Map();
      const wet = new Map(), isWet = (i, j) => { const k = cellKey(i, j); if (!wet.has(k)) { const c = center(i, j); wet.set(k, this.water(c[0], c[1])); } return wet.get(k); };
      let found = false, steps = 0;
      while (open.length && steps++ < 25000) {
        let bi = 0; for (let x = 1; x < open.length; x++) if (open[x][0] < open[bi][0]) bi = x;
        const [, gc, ci, cj] = open[bi]; open.splice(bi, 1);
        if (ci === ti && cj === tj) { found = true; break; }
        if (gc > g.get(cellKey(ci, cj))) continue;
        for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
          if (!di && !dj) continue;
          const ni = wrap(ci + di), nj = cj + dj; if (nj < 4 || nj > 356) continue;
          const goal = ni === ti && nj === tj;
          if (!goal && !isWet(ni, nj)) continue;
          // Hug the open sea: cells next to land cost more.
          const coast = goal ? 0 : (!isWet(wrap(ni + 1), nj) || !isWet(wrap(ni - 1), nj) || !isWet(ni, nj + 1) || !isWet(ni, nj - 1)) ? 0.6 : 0;
          const step = Math.hypot(di * Math.cos(((nj * R0 - 90) * Math.PI) / 180), dj) + coast;
          const ng = gc + step, k = cellKey(ni, nj);
          if (ng < (g.get(k) ?? Infinity)) { g.set(k, ng); from.set(k, cellKey(ci, cj)); open.push([ng + h(ni, nj), ng, ni, nj]); }
        }
      }
      if (found) {
        const cells = [];
        for (let k = cellKey(ti, tj); k; k = from.get(k)) { const [i, j] = k.split(',').map(Number); cells.unshift(center(i, j)); }
        const raw = [a, ...cells.slice(1, -1), b];
        // String pulling: skip ahead to the farthest point still reachable in a straight line over water.
        out = [raw[0]];
        for (let i = 0; i < raw.length - 1;) {
          let j = raw.length - 1;
          while (j > i + 1 && !this.clear(raw[i], raw[j])) j--;
          out.push(raw[j]); i = j;
        }
      }
    }
    this.legs.set(key, out);
    return out;
  }
  // The full lane for a list of zones: strait channels, extra waypoints, and open-sea legs between them.
  build(zones) {
    const marks = []; // { p, fixed }
    const push = (p, fixed) => marks.push({ p, fixed });
    zones.forEach((z, i) => {
      const prev = zones[i - 1];
      if (prev) {
        const via = LEG_VIA[[prev, z].sort().join('|')];
        if (via) { const last = marks[marks.length - 1].p; const seq = km(last, via[0]) <= km(last, via[via.length - 1]) ? via : [...via].reverse(); seq.forEach(p => push(p, true)); }
      }
      const st = STRAITS[z];
      if (st) {
        const ref = marks.length ? marks[marks.length - 1].p : (zones[1] ? [SEA_ZONES[zones[1]].lon, SEA_ZONES[zones[1]].lat] : st[0]);
        const fwd = marks.length ? km(ref, st[0]) <= km(ref, st[st.length - 1]) : km(ref, st[st.length - 1]) <= km(ref, st[0]);
        (fwd ? st : [...st].reverse()).forEach(p => push(p, true));
      } else push(this.toWater([SEA_ZONES[z].lon, SEA_ZONES[z].lat]), false);
    });
    const pts = [], fixed = [];
    for (let i = 0; i < marks.length; i++) {
      if (i === 0) { pts.push(marks[0].p); fixed.push(marks[0].fixed); continue; }
      const a = marks[i - 1], b = marks[i];
      const legPts = a.fixed && b.fixed ? [a.p, b.p] : this.leg(a.fixed ? a.p : this.toWater(a.p), b.fixed ? b.p : this.toWater(b.p));
      for (let j = 1; j < legPts.length; j++) {
        const seg = arc(legPts[j - 1], legPts[j]).slice(1);
        for (const q of seg) { pts.push(q); fixed.push(a.fixed && b.fixed); }
      }
    }
    // Last check: any open-sea point that still touches land (a small island, a cape) is pushed into the water.
    for (let i = 0; i < pts.length; i++) if (!fixed[i] && !this.water(pts[i][0], pts[i][1])) pts[i] = this.toWater(pts[i]);
    return { pts, fixed };
  }
  recompute() {
    for (const lane of SHIPPING_LANES) {
      const r = seaRoute(lane.from, lane.to, this.blocked);
      this.routes.set(lane.id, r ? { zones: r, ...this.build(r) } : null);
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
      if (s.stuck) { if (!now.has(s.stuckAt)) { s.stuck = false; this.assign(s, this.routes.get(s.lane), s.rev); s.t = 0.5; } continue; }
      const i = Math.floor(s.t * (s.zones.length - 1));
      const hitZone = s.zones.slice(i + 1).find(z => newly.includes(z));
      if (!hitZone) continue;
      const [lon, lat] = this.position(s);
      const r = seaRoute(s.zones[Math.max(0, i)], s.zones[s.zones.length - 1], this.blocked);
      if (r) {
        const lane = this.build(r);
        this.personalise(s, { zones: r, pts: [[lon, lat], ...lane.pts], fixed: [true, ...lane.fixed] }, false);
        s.t = 0; s.rerouted = true;
      } else {
        // Nowhere to go: drop anchor outside the closed strait.
        const z = SEA_ZONES[hitZone];
        s.stuck = true; s.stuckAt = hitZone; s.from = [lon, lat]; s.anchorT = 0;
        s.anchor = this.toWater([z.lon + rnd(-2.5, 2.5), z.lat + rnd(-1.6, 1.6)]);
      }
    }
  }
  // Gives a ship its own line inside the lane: a gentle sideways offset away from the straits, kept in the water.
  personalise(s, route, rev) {
    const pts = rev ? [...route.pts].reverse() : route.pts, fixed = rev ? [...route.fixed].reverse() : route.fixed;
    s.zones = rev ? [...route.zones].reverse() : route.zones;
    const n = pts.length, off = rnd(-1, 1) * rnd(0.3, 1.1), wob = rnd(0.15, 0.5), ph = rnd(0, 6.28);
    // Distance (in points) to the nearest fixed channel point: offsets fade to nothing near the straits.
    const near = new Array(n).fill(99);
    for (let i = 0, d = 99; i < n; i++) { d = fixed[i] ? 0 : d + 1; near[i] = d; }
    for (let i = n - 1, d = 99; i >= 0; i--) { d = fixed[i] ? 0 : d + 1; near[i] = Math.min(near[i], d); }
    const path = pts.map((p, i) => {
      if (fixed[i] || i === 0 || i === n - 1) return p;
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let dx = b[0] - a[0]; if (dx > 180) dx -= 360; if (dx < -180) dx += 360;
      const dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
      const taper = Math.min(1, near[i] / 6);
      const o = (off + Math.sin(i * 0.18 + ph) * wob) * taper;
      for (const f of [1, 0.5, 0.25]) {
        const q = [p[0] - (dy / L) * o * f, p[1] + (dx / L) * o * f];
        if (this.water(q[0], q[1])) return q;
      }
      return p;
    });
    s.path = path;
    s.speed = (1 / Math.max(40, polyLen(path) / 160)) * s.pace;
  }
  assign(s, route, rev) { s.rev = rev; this.personalise(s, route, rev); }
  spawn() {
    const total = SHIPPING_LANES.reduce((t, l) => t + l.weight, 0);
    let r = Math.random() * total, lane = SHIPPING_LANES[0];
    for (const l of SHIPPING_LANES) { r -= l.weight; if (r <= 0) { lane = l; break; } }
    const route = this.routes.get(lane.id);
    const oil = lane.from === 'persian_gulf' || lane.to === 'persian_gulf';
    const kind = oil && Math.random() < 0.7 ? 'tanker' : Math.random() < 0.55 ? 'container' : Math.random() < 0.6 ? 'bulk' : 'lng';
    // Container ships are fast; laden tankers and bulk carriers are slow.
    const pace = { container: rnd(1.05, 1.35), lng: rnd(0.95, 1.15), tanker: rnd(0.7, 0.9), bulk: rnd(0.65, 0.85) }[kind];
    if (!route) {
      const choke = [...this.blocked][Math.floor(Math.random() * this.blocked.size)];
      if (!choke || this.ships.filter(s => s.stuck).length > 40) return null;
      const z = SEA_ZONES[choke];
      const ship = { lane: lane.id, zones: [], path: [[z.lon, z.lat]], t: 0, speed: 0, kind, tanker: kind === 'tanker', pace, stuck: true, stuckAt: choke, anchorT: 0,
        anchor: this.toWater([z.lon + rnd(-3, 3), z.lat + rnd(-1.8, 1.8)]), from: this.toWater([z.lon + rnd(-6, 6), z.lat + rnd(-4, 4)]) };
      this.ships.push(ship);
      return ship;
    }
    const ship = { lane: lane.id, t: 0, kind, tanker: kind === 'tanker', pace };
    this.assign(ship, route, Math.random() < 0.5);
    this.ships.push(ship);
    return ship;
  }
  tick(dt) {
    for (const s of this.ships) {
      if (s.stuck) { s.anchorT = Math.min(1, s.anchorT + dt * 0.15); continue; }
      // Ships slow down while crossing a contested strait.
      const i = Math.min(s.zones.length - 1, Math.floor(s.t * s.zones.length));
      s.t += s.speed * dt * (this.contested.has(s.zones[i]) ? 0.45 : 1);
    }
    this.ships = this.ships.filter(s => s.t < 1);
    this.waiting = this.ships.filter(s => s.stuck).length;
    const moving = this.ships.length - this.waiting;
    // At start-up the sea fills quickly with ships already under way; afterwards one new departure at a time.
    if (moving < this.target) for (let i = 0; i < (this.ships.length < this.target * 0.5 ? 4 : 1); i++) { const s = this.spawn(); if (s && !s.stuck && this.ships.length < this.target * 0.5) s.t = Math.random() * 0.95; }
  }
  position(s) {
    if (s.stuck) { const k = s.anchorT; return [s.from[0] + (s.anchor[0] - s.from[0]) * k, s.from[1] + (s.anchor[1] - s.from[1]) * k, 0]; }
    return along(s.path, s.t);
  }
}

export { arc, km };
