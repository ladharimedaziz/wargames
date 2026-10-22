// Roads and highways between cities, drawn only when the camera is close. The network is synthesised from the
// city list: each city links to the neighbours it can see without a closer city in between (a relative
// neighbourhood graph), links that would cross open water are dropped, and every link stops at the edge of the
// cities it joins so roads never run through a city's centre.
import { CITIES } from '/shared/data/cities.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// A rough footprint in degrees for each tier: roads end here.
const FOOT = { 1: 0.32, 2: 0.2, 3: 0.12, 4: 0.07 };

function buildNetwork(landAt) {
  const C = CITIES.filter(c => c.tier >= 1);
  const dist = (a, b) => Math.hypot((a.lon - b.lon) * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180), a.lat - b.lat);
  // Bucket cities on a 5° grid so neighbour searches stay local.
  const grid = new Map(), key = (i, j) => `${i},${j}`;
  for (const c of C) { const k = key(Math.floor(c.lon / 5), Math.floor(c.lat / 5)); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(c); }
  const near = (c, r) => {
    const out = [], ci = Math.floor(c.lon / 5), cj = Math.floor(c.lat / 5), n = Math.ceil(r / 5) + 1;
    for (let i = ci - n; i <= ci + n; i++) for (let j = cj - n; j <= cj + n; j++) for (const d of grid.get(key(i, j)) || []) if (d !== c && dist(c, d) <= r) out.push(d);
    return out;
  };
  const roads = [], seen = new Set();
  for (const a of C) {
    const reach = a.tier <= 2 ? 9.5 : 5;
    const cands = near(a, reach);
    for (const b of cands) {
      const id = a.name < b.name ? a.name + '|' + b.name : b.name + '|' + a.name;
      if (seen.has(id)) continue;
      const d = dist(a, b);
      if (d > (b.tier <= 2 && a.tier <= 2 ? 9.5 : 5)) continue;
      // Across a border only between nearby cities.
      if (a.a3 !== b.a3 && d > 3.5) continue;
      // Relative neighbourhood: skip if some city is closer to both ends than they are to each other.
      if (cands.some(c => c !== b && Math.max(dist(a, c), dist(b, c)) < d)) continue;
      seen.add(id);
      // No roads across the sea.
      let wet = 0;
      for (let t = 1; t < 16; t++) { const f = t / 16; if (!landAt(a.lon + (b.lon - a.lon) * f, a.lat + (b.lat - a.lat) * f)) wet++; }
      if (wet > 1) continue;
      const highway = a.tier <= 2 && b.tier <= 3 || b.tier <= 2 && a.tier <= 3;
      // Trim at each city's edge and bend the line a little so it reads as a road, not a ruler.
      const t0 = FOOT[a.tier] / d, t1 = 1 - FOOT[b.tier] / d;
      if (t1 - t0 < 0.15) continue;
      const nx = -(b.lat - a.lat), ny = b.lon - a.lon, seed = (a.lat * 13.7 + b.lon * 7.3) % 10;
      const pts = [];
      const N = Math.max(4, Math.round(d * 3));
      for (let i = 0; i <= N; i++) {
        const f = t0 + (t1 - t0) * (i / N), w = Math.sin(f * Math.PI) * (0.05 * Math.sin(f * 5 + seed) + 0.025 * Math.sin(f * 13 + seed * 2));
        pts.push([a.lon + (b.lon - a.lon) * f + nx * w, a.lat + (b.lat - a.lat) * f + ny * w]);
      }
      roads.push({ highway, pts, a3: [a.a3, b.a3] });
    }
  }
  return roads;
}

export const ROAD_FX = {
  drawRoads(ctx) {
    const k = this.cam.k;
    // The country in focus (on the stage, or selected in the panel) shows its roads as soon as the camera moves in.
    const fid = this.focusedCountry?.(), fa3 = fid && this.state?.countries?.[fid]?.a3;
    if ((k < 3 && !(fa3 && k >= 1.3)) || this.layers?.roads === false) return;
    if (!this.roads) this.roads = buildNetwork(this.landAt);
    const sizeKey = `${this.w}x${this.h}`;
    if (this.roadsKey !== sizeKey) { this.roadsKey = sizeKey; this.roadProj = this.roads.map(r => ({ highway: r.highway, a3: r.a3, pts: r.pts.map(q => this.projection(q)).filter(Boolean) })); }
    const fadeIn = clamp((k - 3) / 1.6, 0, 1), night = this.night;
    const mine = r => fa3 && r.a3.includes(fa3), focusIn = clamp((k - 1.3) / 0.8, 0, 1);
    const cx = this.cam.x, cy = this.cam.y, W = this.w, H = this.h;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const pass = (filter, width, style) => {
      ctx.strokeStyle = style; ctx.lineWidth = width; ctx.beginPath();
      for (const r of this.roadProj) {
        if (!filter(r) || r.pts.length < 2) continue;
        const a = r.pts[0], b = r.pts[r.pts.length - 1];
        const ax = a[0] * k + cx, ay = a[1] * k + cy, bx = b[0] * k + cx, by = b[1] * k + cy;
        if (Math.max(ax, bx) < -20 || Math.min(ax, bx) > W + 20 || Math.max(ay, by) < -20 || Math.min(ay, by) > H + 20) continue;
        r.pts.forEach((q, i) => (i ? ctx.lineTo(q[0] * k + cx, q[1] * k + cy) : ctx.moveTo(q[0] * k + cx, q[1] * k + cy)));
      }
      ctx.stroke();
    };
    // Local roads appear a little later than highways.
    const local = clamp((k - 4.2) / 1.6, 0, 1), localMine = clamp((k - 1.8) / 1, 0, 1);
    const roadCol = a => (night ? `rgba(255,190,120,${0.22 * a})` : `rgba(205,214,228,${0.28 * a})`);
    const hwCol = a => (night ? `rgba(255,170,80,${0.75 * a})` : `rgba(245,205,125,${0.7 * a})`);
    if (local > 0) pass(r => !r.highway && !mine(r), 1, roadCol(local));
    if (fa3 && localMine > 0) pass(r => !r.highway && mine(r), 1, roadCol(Math.max(local, localMine)));
    if (fadeIn > 0) { pass(r => r.highway && !mine(r), 3.2, `rgba(5,8,14,${0.55 * fadeIn})`); pass(r => r.highway && !mine(r), 1.8, hwCol(fadeIn)); }
    if (fa3) { const a = Math.max(fadeIn, focusIn); pass(r => r.highway && mine(r), 3.2, `rgba(5,8,14,${0.55 * a})`); pass(r => r.highway && mine(r), 1.8, hwCol(a)); }
    ctx.restore();
  },
};
