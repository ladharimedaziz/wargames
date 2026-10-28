// Builds client/data/us-counties.json and us-roads.json for the continental US committee from Census files.
// Usage: node scripts/build-us-map.mjs <dir holding the unzipped cb_2024_us_county_500k, cb_2024_us_state_500k and tl_2024_us_primaryroads folders>
import { open } from 'shapefile';
import { topology } from 'topojson-server';
import { presimplify, simplify, quantile } from 'topojson-simplify';
import { quantize } from 'topojson-client';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) { console.error('Give the folder with the unzipped Census files.'); process.exit(1); }
// Alaska, Hawaii and the territories are left out of the committee; DC stays.
const OUT = new Set(['02', '15', '60', '66', '69', '72', '78']);
const out = join(process.cwd(), 'client/data');

async function read(name, keep) {
  const src = await open(join(dir, name, `${name}.shp`), join(dir, name, `${name}.dbf`));
  const features = [];
  for (let r = await src.read(); !r.done; r = await src.read()) if (keep(r.value)) features.push(r.value);
  return features;
}
const round = (n, p) => Math.round(n * 10 ** p) / 10 ** p;

const states = await read('cb_2024_us_state_500k', f => !OUT.has(f.properties.STATEFP));
const counties = await read('cb_2024_us_county_500k', f => !OUT.has(f.properties.STATEFP));
const fp2abbr = Object.fromEntries(states.map(f => [f.properties.STATEFP, f.properties.STUSPS]));
const topo = topology({
  states: { type: 'FeatureCollection', features: states.map(f => ({ type: 'Feature', id: f.properties.STUSPS, properties: { name: f.properties.NAME, fips: f.properties.STATEFP }, geometry: f.geometry })) },
  counties: { type: 'FeatureCollection', features: counties.map(f => ({ type: 'Feature', id: f.properties.GEOID, properties: { name: f.properties.NAME, state: fp2abbr[f.properties.STATEFP] }, geometry: f.geometry })) },
}, 1e6);
const simple = simplify(presimplify(topo), quantile(presimplify(topo), 0.2));
writeFileSync(join(out, 'us-counties.json'), JSON.stringify(quantize(simple, 1e5)));
console.log('states', states.length, 'counties', counties.length);

// Interstates and US highways only. Coordinates are rounded to 3 decimals (about 100 m).
const roads = await read('tl_2024_us_primaryroads', f => ['I', 'U'].includes(f.properties.RTTYP) && f.geometry);
const lines = { I: new Map(), U: new Map() };
for (const f of roads) {
  const parts = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates];
  const name = (f.properties.FULLNAME || '').replace(/^(Interstate|US Hwy)\s*/i, '').trim();
  for (const p of parts) {
    if (p.some(([x, y]) => x < -125 || x > -66 || y < 24 || y > 50)) continue; // outside the lower 48
    const m = lines[f.properties.RTTYP], key = name || '?';
    if (!m.has(key)) m.set(key, []);
    m.get(key).push(p.map(([x, y]) => [round(x, 3), round(y, 3)]));
  }
}

// Join each route's pieces end to end, thin them with Douglas-Peucker (0.002 degrees, about 200 m), and store each line as
// integer thousandths of a degree: [x0, y0, dx1, dy1, ...]. Much smaller than a topology for lines that share no borders.
const K = p => `${p[0]},${p[1]}`;
function join_(segs) {
  const byEnd = new Map(), used = new Set(), res = [];
  segs.forEach((sg, i) => { for (const e of [sg[0], sg[sg.length - 1]]) { const k = K(e); (byEnd.get(k) || byEnd.set(k, []).get(k)).push(i); } });
  const take = (end, line, atEnd) => {
    for (;;) {
      const next = (byEnd.get(K(end)) || []).find(j => !used.has(j));
      if (next === undefined) return;
      used.add(next);
      let sg = segs[next];
      if (K(sg[0]) !== K(end)) sg = [...sg].reverse();
      if (atEnd) { line.push(...sg.slice(1)); end = sg[sg.length - 1]; } else { line.unshift(...[...sg].reverse().slice(0, -1)); end = sg[sg.length - 1]; }
    }
  };
  segs.forEach((sg, i) => { if (used.has(i)) return; used.add(i); const line = [...sg]; take(sg[sg.length - 1], line, true); take(sg[0], line, false); res.push(line); });
  return res;
}
function dp(pts, tol) {
  if (pts.length < 3) return pts;
  // The two carriageways of a divided highway join into a ring, whose chord is empty: split it at its farthest point first.
  if (pts.length > 3 && Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]) < tol * 4) {
    let far = 1, best = 0;
    pts.forEach((q, i) => { const d = Math.hypot(q[0] - pts[0][0], q[1] - pts[0][1]); if (d > best) { best = d; far = i; } });
    return [...core(pts.slice(0, far + 1), tol), ...core(pts.slice(far), tol).slice(1)];
  }
  return core(pts, tol);
}
function core(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let max = 0, at = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-9;
    for (let i = a + 1; i < b; i++) { const d = Math.abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / len; if (d > max) { max = d; at = i; } }
    if (max > tol && at > 0) { keep[at] = 1; stack.push([a, at], [at, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const pack = line => { const o = [Math.round(line[0][0] * 1000), Math.round(line[0][1] * 1000)]; let px = o[0], py = o[1]; for (const [x, y] of line.slice(1)) { const X = Math.round(x * 1000), Y = Math.round(y * 1000); o.push(X - px, Y - py); px = X; py = Y; } return o; };
const outRoads = { i: [], u: [] };
for (const t of ['I', 'U']) for (const [name, segs] of lines[t]) {
  const packed = join_(segs).map(l => dp(l, 0.002)).filter(l => l.length > 1).map(pack);
  if (packed.length) outRoads[t.toLowerCase()].push([name, packed]);
}
writeFileSync(join(out, 'us-roads.json'), JSON.stringify(outRoads));
console.log('road routes', outRoads.i.length, outRoads.u.length);
