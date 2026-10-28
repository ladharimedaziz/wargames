// Builds client/data/us-cities.json: the outlines of incorporated places (cities, towns, CDPs) in the lower 48 from the Census
// cartographic boundary files, keeping those with at least 12 square kilometres of land so the map stays light.
// Usage: node scripts/build-us-cities.mjs <scratch dir>   (needs the network, curl and unzip)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { open } from 'shapefile';
import { geoArea } from 'd3-geo';
import { topology } from 'topojson-server';
import { presimplify, simplify, quantile } from 'topojson-simplify';
import { quantize, feature } from 'topojson-client';

const dir = process.argv[2]; mkdirSync(dir, { recursive: true });
const FIPS = ['01', '04', '05', '06', '08', '09', '10', '11', '12', '13', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40', '41', '42', '44', '45', '46', '47', '48', '49', '50', '51', '53', '54', '55', '56'];
const MIN_LAND = 12e6;
const features = [];
for (const f of FIPS) {
  const name = `cb_2024_${f}_place_500k`, base = join(dir, name);
  if (!existsSync(base + '.shp')) {
    // Census occasionally cuts a transfer short or refuses a file, so retry; a state that still fails is skipped with a warning.
    let got = false;
    for (let t = 1; t <= 3 && !got; t++) {
      try {
        execFileSync('curl', ['-fsSL', '-m', '120', '-o', base + '.zip', `https://www2.census.gov/geo/tiger/GENZ2024/shp/${name}.zip`]);
        execFileSync('unzip', ['-qo', base + '.zip', '-d', dir]);
        got = true;
      } catch { /* try again */ }
    }
    if (!got) { console.warn(`${f}: could not download ${name}, skipped`); continue; }
  }
  const src = await open(base + '.shp', base + '.dbf');
  let n = 0;
  for (let r = await src.read(); !r.done; r = await src.read()) {
    const p = r.value.properties;
    if (p.ALAND < MIN_LAND) continue;
    const ft = { type: 'Feature', id: p.GEOID, properties: { name: p.NAME, a: Math.round(p.ALAND / 1e5) / 10 }, geometry: r.value.geometry };
    // A few shapes (Houston) have a polygon wound so that d3 reads it as "everything except this piece", which fills the whole
    // screen. Fix each polygon on its own: flip it when its area is more than half the globe, and drop any that stays too big.
    {
      const polys = ft.geometry.type === 'Polygon' ? [ft.geometry.coordinates] : ft.geometry.coordinates;
      const area = rings => geoArea({ type: 'Feature', geometry: { type: 'Polygon', coordinates: rings } });
      const fixed = [];
      for (const po of polys) {
        let q = po;
        if (area(q) > 2 * Math.PI) q = po.map(r => [...r].reverse());
        if (area(q) > 2 * Math.PI) q = [po[0]].map(r => [...r].reverse());
        if (area(q) < 0.01) fixed.push(q);
      }
      ft.geometry = { type: 'MultiPolygon', coordinates: fixed };
    }
    features.push(ft); n++;
  }
  console.log(f, n);
}
const topo = topology({ cities: { type: 'FeatureCollection', features } }, 1e6);
const pre = presimplify(topo);
const thin = quantize(simplify(pre, quantile(pre, 0.3)), 1e5);
// Thinning can collapse a sliver into a degenerate ring that d3 reads as the whole globe; drop any piece that does.
const kept = feature(thin, thin.objects.cities).features.map(f => {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const ok = polys.filter(po => geoArea({ type: 'Feature', geometry: { type: 'Polygon', coordinates: po } }) < 0.01);
  return ok.length ? { ...f, geometry: { type: 'MultiPolygon', coordinates: ok } } : null;
}).filter(Boolean);
writeFileSync('client/data/us-cities.json', JSON.stringify(topology({ cities: { type: 'FeatureCollection', features: kept } }, 1e5)));
console.log('places', kept.length);
