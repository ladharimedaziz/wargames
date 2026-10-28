// Keeps ships on water. The server loads a land mask (client/data/us-land.json, built by scripts/build-us-land.mjs: the lower 48,
// Canada and Mexico on a 0.1 degree grid, as run lengths) and routes sea orders with A* over it. With no mask loaded, ships go straight.
const KL = lat => 111.32 * Math.cos(lat * Math.PI / 180), KLAT = 110.57;
let M = null; // {x0, y0, step, w, h, land: Uint8Array, comp: Int32Array (which body of water each cell is in)}

export function loadLand(d) {
  const land = new Uint8Array(d.w * d.h); let k = 0, v = 0;
  for (const n of d.runs) { if (v) land.fill(1, k, k + n); k += n; v ^= 1; }
  const comp = new Int32Array(d.w * d.h), q = new Int32Array(d.w * d.h); let c = 0;
  for (let s = 0; s < comp.length; s++) {
    if (land[s] || comp[s]) continue;
    comp[s] = ++c; let h = 0, t = 0; q[t++] = s;
    while (h < t) {
      const k = q[h++], i = k % d.w, j = (k / d.w) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= d.w || nj >= d.h) continue;
        const nk = nj * d.w + ni; if (!land[nk] && !comp[nk]) { comp[nk] = c; q[t++] = nk; }
      }
    }
  }
  M = { x0: d.x0, y0: d.y0, step: d.step, w: d.w, h: d.h, land, comp };
  return land.length;
}
export const hasLand = () => !!M;
const cell = (lon, lat) => [Math.floor((lon - M.x0) / M.step), Math.floor((lat - M.y0) / M.step)];
const landAt = (i, j) => i < 0 || j < 0 || i >= M.w || j >= M.h || M.land[j * M.w + i] === 1;
const center = (i, j) => [+(M.x0 + (i + 0.5) * M.step).toFixed(3), +(M.y0 + (j + 0.5) * M.step).toFixed(3)];
// Outside the mask counts as water: only the map's own land blocks a ship.
export const isLand = (lon, lat) => { if (!M) return false; const [i, j] = cell(lon, lat); return i >= 0 && j >= 0 && i < M.w && j < M.h && M.land[j * M.w + i] === 1; };

// The nearest water cell's centre within maxKm (rings of cells outward), or null. With comp, only water of that body counts.
export function nearestWater(lon, lat, maxKm = 150, comp = 0) {
  if (!M) return [lon, lat];
  const [ci, cj] = cell(lon, lat), R = Math.ceil(maxKm / (M.step * 100));
  if (!comp && !landAt(ci, cj)) return [lon, lat];
  let best = null, bd = Infinity;
  for (let r = 1; r <= R; r++) {
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r || landAt(ci + di, cj + dj) || (comp && M.comp[(cj + dj) * M.w + ci + di] !== comp)) continue;
      const [x, y] = center(ci + di, cj + dj), d = Math.hypot((x - lon) * KL(lat), (y - lat) * KLAT);
      if (d < bd) { bd = d; best = [x, y]; }
    }
    if (best && bd <= r * M.step * 100) break;
  }
  return best && bd <= maxKm ? best : null;
}

// Can a ship sail straight from a to b? Samples the line at the grid's step.
function clear(a, b) {
  const n = Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / (M.step * 0.2)) || 1;
  // The line and a hair either side of it, so a leg never clips a corner of the coast.
  for (let k = 0; k <= n; k++) for (const o of [0, 0.04, -0.04]) if (isLand(a[0] + (b[0] - a[0]) * k / n + o, a[1] + (b[1] - a[1]) * k / n + o)) return false;
  return true;
}

// Waypoints from a to b over water, or null when there is no way (a lake with no outlet, a goal inland). The start and goal are moved to
// the nearest water first, since a port sits on the coast cell. A straight run is returned as just [a, b].
export function seaRoute(a, b) {
  if (!M) return [a, b];
  let s = nearestWater(a[0], a[1], 60), g = nearestWater(b[0], b[1], 150);
  if (!s || !g) return null;
  // A harbour that the coarse coast has walled in: leave it by the nearest water that joins the goal's sea.
  const gc = M.comp[cell(g[0], g[1])[1] * M.w + cell(g[0], g[1])[0]];
  if (M.comp[cell(s[0], s[1])[1] * M.w + cell(s[0], s[1])[0]] !== gc) { s = nearestWater(a[0], a[1], 150, gc); if (!s) return null; }
  if (clear(s, g)) return [s, g];
  const [si, sj] = cell(s[0], s[1]), [gi, gj] = cell(g[0], g[1]), W = M.w;
  const id = (i, j) => j * W + i, start = id(si, sj), goal = id(gi, gj);
  const gs = new Map([[start, 0]]), from = new Map(), done = new Set();
  const heap = [[0, start]];
  const push = it => { heap.push(it); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const hx = k => Math.hypot(((k % W) - gi) * M.step * KL(g[1]), (Math.floor(k / W) - gj) * M.step * KLAT);
  let n = 0;
  while (heap.length && n++ < 400000) {
    const [, k] = pop(); if (done.has(k)) continue; done.add(k);
    if (k === goal) break;
    const i = k % W, j = (k / W) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = i + di, nj = j + dj; if (landAt(ni, nj)) continue;
      if (di && dj && (landAt(i + di, j) || landAt(i, j + dj))) continue; // no squeezing between two land corners
      const nk = id(ni, nj), cost = gs.get(k) + Math.hypot(di * M.step * KL(M.y0 + j * M.step), dj * M.step * KLAT);
      if (cost < (gs.get(nk) ?? Infinity)) { gs.set(nk, cost); from.set(nk, k); push([cost + hx(nk), nk]); }
    }
  }
  if (!from.has(goal) && start !== goal) return null;
  const cells = [goal]; for (let k = goal; k !== start;) { k = from.get(k); cells.push(k); }
  cells.reverse();
  const pts = cells.map(k => center(k % W, (k / W) | 0)); pts[0] = s; pts[pts.length - 1] = g;
  // String-pull: from each waypoint jump to the furthest one it can see, so the ship sails long straight legs.
  const out = [pts[0]]; let at = 0;
  while (at < pts.length - 1) { let far = at + 1; for (let k = pts.length - 1; k > at + 1; k--) if (clear(pts[at], pts[k])) { far = k; break; } out.push(pts[far]); at = far; }
  return out;
}
