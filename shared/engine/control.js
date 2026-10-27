// Territorial control for war fronts. The world is a grid of 0.3° cells; `state.control` lists only the cells held
// by someone other than the country they belong to. Every front, in either direction, is the edge between who
// holds which cells, so two armies pushing against each other share one line, and a Zeus can paint ground by hand.
import { clamp, rand, atWar, sameSide } from './core.js';

export const CELL = 0.3, NI = Math.round(360 / CELL), NJ = Math.round(180 / CELL);
export const cellKey = (i, j) => j * NI + (((i % NI) + NI) % NI);
export const cellIJ = k => [k % NI, Math.floor(k / NI)];
export const cellCenter = k => { const [i, j] = cellIJ(k); return [-180 + (i + 0.5) * CELL, 90 - (j + 0.5) * CELL]; };
export const cellAt = (lon, lat) => cellKey(Math.floor((lon + 180) / CELL), clamp(Math.floor((90 - lat) / CELL), 0, NJ - 1));
export function neighbors(k, eight) {
  const [i, j] = cellIJ(k), out = [];
  for (const [di, dj] of eight ? N8 : N4) { const jj = j + dj; if (jj >= 0 && jj < NJ) out.push(cellKey(i + di, jj)); }
  return out;
}
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const N8 = [...N4, [1, 1], [1, -1], [-1, 1], [-1, -1]];

// The engine needs the server's cell lookups (which country a cell belongs to, and each country's cells).
let G = null;
export function bindGeo(geo) { if (geo?.cellsOf && geo?.homeOf) G = geo; return !!G; }
export const hasGeo = () => !!G;
export const homeOf = k => G.homeOf(k);
export const cellsOf = id => (G ? G.cellsOf(id) : []);

export const controller = (state, k) => (state.control && state.control[k] != null ? state.control[k] : G.homeOf(k));
function setController(state, k, owner) {
  state.control ||= {};
  if (G.homeOf(k) === owner) delete state.control[k]; else state.control[k] = owner;
}

// Smooth value noise, so pushes form salients and pockets rather than neat circles.
function hash(i, j, seed) { const h = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453; return h - Math.floor(h); }
function noise(i, j, seed, scale) {
  const x = i / scale, y = j / scale, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0, seed), b = hash(x0 + 1, y0, seed), c = hash(x0, y0 + 1, seed), d = hash(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// X takes up to n cells from Y, growing from wherever X already holds ground next to Y.
//   target        prefer cells belonging to this country (the country the front is in)
//   liberateOnly  only take back X's own land
//   from          where to land if X touches nothing of Y's yet (a beachhead, a border crossing, a drop zone)
//   toward        a point the push leans toward (usually the enemy capital)
// Returns the cells that changed hands, in the order they fell.
export function advance(state, X, Y, n, opts = {}) {
  if (!G || n <= 0) return [];
  const { target = null, liberateOnly = false, from = null, toward = null } = opts;
  const ctl = k => controller(state, k);
  // Ground X can push from: its own, or an ally's that is not in the fight.
  const fr = new Map();
  // Rebels only grow from ground they hold themselves, never across a friendly border.
  const rebels = !!state.countries[X]?.rebelOf;
  const friendly = o => { if (o === X) return true; if (rebels || !o || o === Y || !state.countries[o]) return false; if (!fr.has(o)) fr.set(o, sameSide(state, o, X)); return fr.get(o); };
  const seed = (Number(String(X).replace(/\D/g, '')) || 7) * 0.13 + (Number(String(Y).replace(/\D/g, '')) || 3) * 0.29 + (state.meta?.turn || 1) * 0.71;
  const eligible = k => ctl(k) === Y && (!liberateOnly || G.homeOf(k) === X);
  const tw = toward ? [Math.floor((toward.lon + 180) / CELL), Math.floor((90 - toward.lat) / CELL)] : null;
  const score = k => {
    const [i, j] = cellIJ(k);
    let xn = 0; for (const m of neighbors(k, true)) if (friendly(ctl(m))) xn++;
    if (!xn) return -Infinity;
    let s = xn * 0.9 + noise(i, j, seed, 4.5) * 3.2 + noise(i, j, seed + 9, 1.6) * 0.8;
    const home = G.homeOf(k);
    if (target && home === target) s += 2.5;
    if (home === X && (!target || target === X)) s += 3; // retaking your own land comes first
    if (tw) { let di = tw[0] - i; if (di > NI / 2) di -= NI; if (di < -NI / 2) di += NI; const d = Math.hypot(di, tw[1] - j); s += 2.2 / (1 + d / 25); }
    return s;
  };
  // The starting frontier: every cell Y holds that touches ground X holds.
  const pool = new Map();
  const yCells = new Set();
  if (!liberateOnly) for (const k of G.cellsOf(Y)) if (ctl(k) === Y) yCells.add(k);
  for (const [k, o] of Object.entries(state.control || {})) if (o === Y) yCells.add(Number(k));
  for (const k of yCells) {
    if (!eligible(k)) continue;
    if (neighbors(k, false).some(m => friendly(ctl(m)))) pool.set(k, score(k));
  }
  const taken = [];
  // Nowhere to grow from: land at `from`, or wherever Y's ground is closest to it.
  if (!pool.size && from) {
    const fi = (from.lon + 180) / CELL, fj = (90 - from.lat) / CELL;
    let best = null, bd = Infinity;
    for (const k of yCells) {
      if ((target && G.homeOf(k) !== target) || !eligible(k)) continue;
      const [i, j] = cellIJ(k); let di = Math.abs(i + 0.5 - fi); if (di > NI / 2) di = NI - di;
      const d = Math.hypot(di, j + 0.5 - fj);
      if (d < bd) { bd = d; best = k; }
    }
    if (best != null) { setController(state, best, X); taken.push(best); for (const m of neighbors(best, false)) if (eligible(m)) pool.set(m, score(m)); }
  }
  while (taken.length < n && pool.size) {
    // The strongest candidate wins, with a little chance so no two pushes look alike.
    let bestK = null, bestS = -Infinity;
    for (const [k, s] of pool) { const v = s + rand(state) * 0.6; if (v > bestS) { bestS = v; bestK = k; } }
    pool.delete(bestK);
    if (!eligible(bestK)) continue;
    setController(state, bestK, X); taken.push(bestK);
    for (const m of neighbors(bestK, true)) {
      if (pool.has(m)) pool.set(m, score(m));
      else if (eligible(m) && neighbors(m, false).some(q => friendly(ctl(q)))) pool.set(m, score(m));
    }
  }
  return taken;
}

// The connected stretch of a country's cells that holds `near` (its capital, say), or its largest one: the
// mainland, without the islands. Cached, since the grid never changes.
const landCache = new Map();
export function mainland(id, near) {
  const key = id + '|' + (near ? cellAt(near.lon, near.lat) : '');
  if (landCache.has(key)) return landCache.get(key);
  const all = new Set(cellsOf(id)), seen = new Set(), parts = [];
  for (const k of all) {
    if (seen.has(k)) continue;
    const part = [k]; seen.add(k);
    for (let q = 0; q < part.length; q++) for (const m of neighbors(part[q], true)) if (all.has(m) && !seen.has(m)) { seen.add(m); part.push(m); }
    parts.push(part);
  }
  parts.sort((a, b) => b.length - a.length);
  const c = near && cellAt(near.lon, near.lat);
  const out = (c != null && parts.find(p => p.length > 20 && p.includes(c))) || parts[0] || [];
  landCache.set(key, out);
  return out;
}

// Who holds how much of a country: { total, held: { owner: cells } }.
export function holdings(state, countryId) {
  const total = cellsOf(countryId).length;
  const held = {};
  for (const [k, o] of Object.entries(state.control || {})) if (G.homeOf(Number(k)) === countryId) held[o] = (held[o] || 0) + 1;
  return { total, held };
}

// Drops every cell `owner` holds inside `countryId` (peace returning territory, a front collapsing).
export function releaseCells(state, countryId, owner) {
  for (const [k, o] of Object.entries(state.control || {})) if ((owner == null || o === owner) && G.homeOf(Number(k)) === countryId) delete state.control[k];
}

// Hands every cell of a country to an occupier (the country has fallen).
export function occupyCells(state, countryId, owner) {
  state.control ||= {};
  for (const k of cellsOf(countryId)) state.control[k] = owner;
}

// Paints cells by hand. 'take' gives them to `owner` when owner is at war with whoever holds them (or they are
// owner's own land); 'restore' hands them back to the country they belong to. Returns the countries touched.
export function paintCells(state, owner, keys, mode) {
  state.control ||= {};
  const touched = new Set();
  for (const raw of keys.slice(0, 4000)) {
    const k = Number(raw); if (!Number.isInteger(k) || k < 0 || k >= NI * NJ) continue;
    const home = G.homeOf(k); if (!home || !state.countries[home]) continue;
    const cur = controller(state, k);
    if (mode === 'restore') { if (cur !== home) { delete state.control[k]; touched.add(home); } continue; }
    if (cur === owner) continue;
    if (home !== owner && !atWar(state, owner, cur) && !(cur === home && atWar(state, owner, home))) continue;
    if (sameSide(state, owner, cur) && home !== owner) continue;
    setController(state, k, owner); touched.add(home);
  }
  return [...touched];
}

// The middle of the ground `owner` holds in a country (for labels, strikes and helicopters).
export function heldCenter(state, countryId, owner) {
  let x = 0, y = 0, n = 0, ref = null;
  for (const [k, o] of Object.entries(state.control || {})) {
    if (o !== owner || G.homeOf(Number(k)) !== countryId) continue;
    let [lon, lat] = cellCenter(Number(k));
    // Measured from the first cell, so ground either side of the antimeridian averages to the right place.
    if (ref == null) ref = lon; else if (lon - ref > 180) lon -= 360; else if (lon - ref < -180) lon += 360;
    x += lon; y += lat; n++;
  }
  if (!n) return null;
  const lon = x / n;
  return { lon: lon > 180 ? lon - 360 : lon < -180 ? lon + 360 : lon, lat: y / n };
}

// Cells on the front line: held by `owner` in `countryId` and touching ground the country still holds.
export function frontierCells(state, countryId, owner) {
  const out = [];
  for (const [k, o] of Object.entries(state.control || {})) {
    const key = Number(k);
    if (o !== owner || G.homeOf(key) !== countryId) continue;
    if (neighbors(key, false).some(m => controller(state, m) === countryId)) out.push(key);
  }
  return out;
}

// Rasterises the coarse world atlas onto the cell grid with a scanline fill (planar lon/lat, even-odd rule), so
// the server and every browser agree exactly on which cells belong to which country. `features` are GeoJSON
// features with an `id` already resolved to a World Engine country id (null to skip).
export function buildCellRaster(features) {
  const home = new Int16Array(NI * NJ), ids = [null], index = new Map();
  for (const f of features) {
    if (!f.id) continue;
    if (!index.has(f.id)) { index.set(f.id, ids.length); ids.push(f.id); }
    const v = index.get(f.id), g = f.geometry; if (!g) continue;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const raw of polys) {
      // Rings that cross the antimeridian jump from +180 to -180; unwrap them so the scanline sees one closed
      // shape (cellKey wraps the columns back). A ring around a pole cannot close that way and keeps the jump.
      const rings = raw.map(r => {
        const out = [r[0]];
        for (let a = 1; a < r.length; a++) { let x = r[a][0]; const px = out[a - 1][0]; while (x - px > 180) x -= 360; while (x - px < -180) x += 360; out.push([x, r[a][1]]); }
        return Math.abs(out[out.length - 1][0] - out[0][0]) < 1e-6 ? out : r;
      });
      let y0 = 90, y1 = -90;
      for (const r of rings) for (const p of r) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
      const j0 = clamp(Math.floor((90 - y1) / CELL), 0, NJ - 1), j1 = clamp(Math.floor((90 - y0) / CELL), 0, NJ - 1);
      for (let j = j0; j <= j1; j++) {
        const lat = 90 - (j + 0.5) * CELL, xs = [];
        for (const r of rings) for (let a = 0, b = r.length - 1; a < r.length; b = a++) {
          const [xa, ya] = r[a], [xb, yb] = r[b];
          if ((ya > lat) === (yb > lat) || Math.abs(xa - xb) > 180) continue;
          xs.push(xa + ((lat - ya) / (yb - ya)) * (xb - xa));
        }
        xs.sort((p, q) => p - q);
        for (let t = 0; t + 1 < xs.length; t += 2) {
          const i0 = Math.ceil((xs[t] + 180) / CELL - 0.5), i1 = Math.floor((xs[t + 1] + 180) / CELL - 0.5);
          for (let i = i0; i <= i1; i++) { const k = cellKey(i, j); if (!home[k]) home[k] = v; }
        }
      }
    }
  }
  const lists = new Map();
  for (let k = 0; k < home.length; k++) if (home[k]) { const id = ids[home[k]]; if (!lists.has(id)) lists.set(id, []); lists.get(id).push(k); }
  return { homeOf: k => ids[home[k]] || null, cellsOf: id => lists.get(id) || [] };
}

// A point on the line where X meets ground Y holds, and a point `depth` cells behind it on Y's side (toward
// Y's capital): where helicopters cross and where an air assault lands.
export function behindLines(state, X, Y, depth, pick = Math.random) {
  if (!G) return null;
  const friendly = o => o === X || (o && o !== Y && state.countries[o] && sameSide(state, o, X));
  const contact = [];
  const cand = new Set(G.cellsOf(Y));
  for (const [k, o] of Object.entries(state.control || {})) if (o === Y) cand.add(Number(k));
  for (const k of cand) {
    if (controller(state, k) !== Y) continue;
    if (neighbors(k, false).some(m => friendly(controller(state, m)))) contact.push(k);
    if (contact.length > 4000) break;
  }
  if (!contact.length) return null;
  const c0 = contact[Math.floor(pick() * contact.length)];
  const T = state.countries[Y], [ci, cj] = cellIJ(c0);
  const ti = (T.lon + 180) / CELL, tj = (90 - T.lat) / CELL;
  let dx = ti - ci, dy = tj - cj; if (dx > NI / 2) dx -= NI; if (dx < -NI / 2) dx += NI;
  const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
  // Walk inland; settle on the nearest cell Y still holds.
  let best = null;
  for (let d = depth; d >= 2 && best == null; d--) {
    const k = cellKey(Math.round(ci + dx * d), clamp(Math.round(cj + dy * d), 0, NJ - 1));
    if (controller(state, k) === Y && G.homeOf(k) === Y) best = k;
  }
  if (best == null) best = c0;
  const [fl, fa] = cellCenter(c0), [tl, ta] = cellCenter(best);
  return { from: { lon: fl, lat: fa }, to: { lon: tl, lat: ta }, key: best, contact: c0 };
}

// The cell Y still holds that lies closest to a point (a beach for helicopters coming off a ship, an airfield
// near the capital for paratroopers).
export function nearestHeld(state, Y, point) {
  if (!G || !point) return null;
  const pi = (point.lon + 180) / CELL, pj = (90 - point.lat) / CELL;
  let best = null, bd = Infinity;
  for (const k of G.cellsOf(Y)) {
    if (controller(state, k) !== Y) continue;
    const [i, j] = cellIJ(k);
    let dx = i + 0.5 - pi; if (dx > NI / 2) dx -= NI; if (dx < -NI / 2) dx += NI;
    const d = dx * dx + (j + 0.5 - pj) ** 2;
    if (d < bd) { bd = d; best = k; }
  }
  if (best == null) return null;
  const [lon, lat] = cellCenter(best);
  return { key: best, at: { lon, lat } };
}

// An air assault takes a pocket of n cells around a landing zone, cut off from the main line.
export function dropPocket(state, X, Y, center, n) {
  const taken = [], seen = new Set([center]);
  let q = [center];
  while (q.length && taken.length < n) {
    const nq = [];
    for (const k of q) {
      if (taken.length >= n) break;
      if (controller(state, k) === Y && G.homeOf(k) === Y) { setController(state, k, X); taken.push(k); }
      for (const m of neighbors(k, false)) if (!seen.has(m)) { seen.add(m); nq.push(m); }
    }
    q = nq;
  }
  return taken;
}
