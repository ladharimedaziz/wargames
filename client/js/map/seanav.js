// Sea pathfinding for ship animations and fleet orders. The engine moves fleets between named sea zones; this works
// out the water between them so ships steer round headlands and through straits instead of cutting across land.
// A 0.5 degree grid of water cells is built once from the map's own land shapes, then searched with A*. Installed
// as methods on WorldMap (see renderer.js), so `this` is the map.
import { SEA_ZONES } from '/shared/data/places.js';

const NX = 720, NY = 360, STEP = 0.5;
const cellOf = (lon, lat) => [((Math.floor((lon + 180) / STEP) % NX) + NX) % NX, Math.max(0, Math.min(NY - 1, Math.floor((90 - lat) / STEP)))];
const lonLatOf = (x, y) => ({ lon: x * STEP - 180 + STEP / 2, lat: 90 - y * STEP - STEP / 2 });

class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(k, v) {
    const a = this.a; a.push([k, v]); let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top[1];
  }
}

export const SEA_NAV = {
  // Water cells: 1 = open water. Rebuilt when the map is resized.
  seaGrid() {
    const key = `${this.w}x${this.h}`;
    if (this._sg && this._sg.key === key) return this._sg.grid;
    const W = Math.ceil(this.w), H = Math.ceil(this.h);
    const land = new Path2D(); for (const p of this.atlas.lo.paths.values()) land.addPath(p);
    const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#000'; g.fill(land);
    const px = g.getImageData(0, 0, W, H).data;
    const grid = new Uint8Array(NX * NY);
    for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
      const ll = lonLatOf(x, y), q = this.projection([ll.lon, ll.lat]);
      if (!q || q[0] < 0 || q[1] < 0 || q[0] >= W || q[1] >= H) continue; // off the framed map (polar waters): not sailable
      grid[y * NX + x] = px[((q[1] | 0) * W + (q[0] | 0)) * 4 + 3] > 100 ? 0 : 1;
    }
    // Straits and canals are narrower than a cell: open a disc round every zone centre and a channel from each
    // chokepoint to its neighbours, so a route can always thread them.
    const open = (x, y) => { if (y >= 0 && y < NY) grid[y * NX + (((x % NX) + NX) % NX)] = 1; };
    const carve = (a, b, r) => {
      const [x0, y0] = cellOf(a.lon, a.lat), [x1, y1] = cellOf(b.lon, b.lat);
      if (Math.abs(x1 - x0) > NX / 2) return;
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
      for (let i = 0; i <= n; i++) { const cx = Math.round(x0 + (x1 - x0) * i / n), cy = Math.round(y0 + (y1 - y0) * i / n); for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) open(cx + dx, cy + dy); }
    };
    for (const [id, z] of Object.entries(SEA_ZONES)) {
      carve(z, z, z.choke ? 2 : 3);
      if (z.choke) for (const nb of z.n) carve(z, SEA_ZONES[nb], 1);
    }
    this._sg = { key, grid };
    this._seaWays = new Map();
    return grid;
  },

  // Nearest water cell to a position (searching outward), as grid coordinates.
  nearestSea(grid, lon, lat) {
    const [cx, cy] = cellOf(lon, lat);
    for (let r = 0; r <= 12; r++) {
      let best = null, bd = 1e9;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const y = cy + dy; if (y < 0 || y >= NY) continue;
        const x = (((cx + dx) % NX) + NX) % NX;
        if (grid[y * NX + x] && dx * dx + dy * dy < bd) { bd = dx * dx + dy * dy; best = [x, y]; }
      }
      if (best) return best;
    }
    return null;
  },

  // Water route between two points as a list of {lat, lon}. Falls back to the straight line if no sea route exists.
  seaWay(a, b) {
    const grid = this.seaGrid();
    const ck = `${a.lat.toFixed(1)},${a.lon.toFixed(1)}>${b.lat.toFixed(1)},${b.lon.toFixed(1)}`;
    const hit = this._seaWays.get(ck); if (hit) return hit;
    const s = this.nearestSea(grid, a.lon, a.lat), t = this.nearestSea(grid, b.lon, b.lat);
    let out = [a, b];
    if (s && t) {
      const goal = t[1] * NX + t[0], dist = new Float32Array(NX * NY).fill(1e9), prev = new Int32Array(NX * NY).fill(-1), done = new Uint8Array(NX * NY);
      const cost = (x0, y0, x1, y1) => { const dx = Math.min(Math.abs(x1 - x0), NX - Math.abs(x1 - x0)), dy = Math.abs(y1 - y0), la = Math.cos(((90 - (y0 + 0.5) * STEP) * Math.PI) / 180); return Math.hypot(dx * Math.max(0.2, la), dy); };
      const h = new Heap(); const si = s[1] * NX + s[0]; dist[si] = 0; h.push(cost(s[0], s[1], t[0], t[1]), si);
      let found = false, guard = 0;
      while (h.size && guard++ < 400000) {
        const cur = h.pop(); if (done[cur]) continue; done[cur] = 1;
        if (cur === goal) { found = true; break; }
        const cx = cur % NX, cy = (cur / NX) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const ny = cy + dy; if (ny < 0 || ny >= NY) continue;
          const nx = (((cx + dx) % NX) + NX) % NX, ni = ny * NX + nx;
          if (!grid[ni] || done[ni]) continue;
          // Do not squeeze diagonally between two land corners.
          if (dx && dy && !grid[cy * NX + nx] && !grid[ny * NX + cx]) continue;
          const nd = dist[cur] + cost(cx, cy, nx, ny);
          if (nd < dist[ni]) { dist[ni] = nd; prev[ni] = cur; h.push(nd + cost(nx, ny, t[0], t[1]), ni); }
        }
      }
      if (found) {
        const cells = []; for (let c = goal; c !== -1; c = prev[c]) cells.push(c);
        cells.reverse();
        // String pulling: drop every cell that has a clear line of water from the last kept one.
        const clear = (c0, c1) => {
          const x0 = c0 % NX, y0 = (c0 / NX) | 0; let x1 = c1 % NX; const y1 = (c1 / NX) | 0;
          if (x1 - x0 > NX / 2) x1 -= NX; else if (x0 - x1 > NX / 2) x1 += NX;
          const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2) || 1;
          for (let i = 1; i < n; i++) { const x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n); if (!grid[y * NX + (((x % NX) + NX) % NX)]) return false; }
          return true;
        };
        const keep = [cells[0]]; let anchor = 0;
        for (let i = 2; i < cells.length; i++) if (!clear(cells[anchor], cells[i])) { keep.push(cells[i - 1]); anchor = i - 1; }
        keep.push(cells[cells.length - 1]);
        out = [a, ...keep.slice(1, -1).map(c => lonLatOf(c % NX, (c / NX) | 0)), b];
      }
    }
    this._seaWays.set(ck, out);
    return out;
  },

  // The nearest open-water point to a longitude/latitude: the point itself at sea, or the closest water cell off a coast.
  seaPoint(lon, lat) {
    const grid = this.seaGrid(), [cx, cy] = cellOf(lon, lat);
    if (grid[cy * NX + cx]) return { lat, lon };
    const c = this.nearestSea(grid, lon, lat);
    return c ? lonLatOf(c[0], c[1]) : null;
  },

  // Full water route through a list of zone ids (or points): the waypoints of every leg joined up.
  seaWayVia(points) {
    const out = [];
    for (let i = 1; i < points.length; i++) { const leg = this.seaWay(points[i - 1], points[i]); out.push(...(i > 1 ? leg.slice(1) : leg)); }
    return out.length ? out : points;
  },

  // Screen positions along a lat/lon route, with a break wherever it wraps round the edge of the map.
  screenRoute(route) {
    const pts = []; let prev = null;
    for (const r of route) {
      const q = this.pt(r); if (!q) continue;
      q.gap = !!prev && Math.abs(q[0] - prev[0]) > this.w * 0.5; pts.push(q); prev = q;
    }
    return pts;
  },
};
