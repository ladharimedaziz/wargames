// Builds client/data/us-land.json: a land mask of the map area (the lower 48, Canada and Mexico) on a 0.1 degree grid, so ships can
// be kept on water. Run it after the state or neighbour maps change: node scripts/build-us-land.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { feature } from 'topojson-client';
import { geoContains, geoBounds } from 'd3-geo';

const X0 = -134, Y0 = 15, STEP = 0.1, W = Math.round((-51 - X0) / STEP), H = Math.round((59 - Y0) / STEP);
const read = f => JSON.parse(readFileSync(new URL(`../client/data/${f}`, import.meta.url), 'utf8'));
const polys = [];
for (const [file, obj] of [['us-states.json', 'states'], ['us-neighbors.json', 'regions']]) {
  const topo = read(file);
  for (const f of feature(topo, topo.objects[obj]).features) polys.push({ f, b: geoBounds(f) });
}
const bits = new Uint8Array(Math.ceil(W * H / 8));
let land = 0;
for (let j = 0; j < H; j++) {
  const lat = Y0 + (j + 0.5) * STEP;
  for (let i = 0; i < W; i++) {
    const lon = X0 + (i + 0.5) * STEP;
    let on = false;
    for (const { f, b } of polys) {
      if (lon < b[0][0] || lon > b[1][0] || lat < b[0][1] || lat > b[1][1]) continue;
      if (geoContains(f, [lon, lat])) { on = true; break; }
    }
    if (on) { const k = j * W + i; bits[k >> 3] |= 1 << (k & 7); land++; }
  }
}
// Run lengths of alternating water and land keep the file small.
const runs = []; let cur = 0, n = 0;
for (let k = 0; k < W * H; k++) { const b = (bits[k >> 3] >> (k & 7)) & 1; if (b === cur) n++; else { runs.push(n); cur = b; n = 1; } }
runs.push(n);
writeFileSync(new URL('../client/data/us-land.json', import.meta.url), JSON.stringify({ x0: X0, y0: Y0, step: STEP, w: W, h: H, runs }));
console.log(`${W}x${H} cells, ${(100 * land / (W * H)).toFixed(1)}% land, ${runs.length} runs`);
