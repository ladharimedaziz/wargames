// Adds one state's city outlines to client/data/us-cities.json, for a state the main build (build-us-cities.mjs) could not download.
// The Census firewall refuses the 2024 file for South Carolina (45) but serves the 2023 one.
// Usage: node scripts/add-us-cities-state.mjs <scratch dir> <state FIPS> <year> [min square km, default 40]
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { open } from 'shapefile';
import { geoArea } from 'd3-geo';
import { topology } from 'topojson-server';
import { presimplify, simplify, quantile } from 'topojson-simplify';
import { quantize, feature } from 'topojson-client';

const [dir, fips, year, minArg] = process.argv.slice(2), min = Number(minArg) || 40, file = 'client/data/us-cities.json';
mkdirSync(dir, { recursive: true });
const name = `cb_${year}_${fips}_place_500k`, base = join(dir, name);
execFileSync('curl', ['-fsSL', '-m', '120', '-o', base + '.zip', `https://www2.census.gov/geo/tiger/GENZ${year}/shp/${name}.zip`]);
execFileSync('unzip', ['-qo', base + '.zip', '-d', dir]);
const t = JSON.parse(readFileSync(file, 'utf8'));
const old = feature(t, t.objects.cities).features.filter(f => !String(f.id).startsWith(fips));
const src = await open(base + '.shp', base + '.dbf'), added = [];
for (let r = await src.read(); !r.done; r = await src.read()) {
  const p = r.value.properties;
  if (p.ALAND / 1e6 < min) continue;
  // Same winding repair as the main build: a ring d3 reads as "everything but this piece" would fill the screen.
  const polys = r.value.geometry.type === 'Polygon' ? [r.value.geometry.coordinates] : r.value.geometry.coordinates;
  const area = rings => geoArea({ type: 'Feature', geometry: { type: 'Polygon', coordinates: rings } });
  const fixed = [];
  for (const po of polys) {
    let q = po;
    if (area(q) > 2 * Math.PI) q = po.map(r => [...r].reverse());
    if (area(q) > 2 * Math.PI) q = [po[0]].map(r => [...r].reverse());
    if (area(q) < 0.01) fixed.push(q);
  }
  if (fixed.length) added.push({ type: 'Feature', id: p.GEOID, properties: { name: p.NAME, a: Math.round(p.ALAND / 1e5) / 10 }, geometry: { type: 'MultiPolygon', coordinates: fixed } });
}
const pre = presimplify(topology({ cities: { type: 'FeatureCollection', features: added } }, 1e6));
const thin = quantize(simplify(pre, quantile(pre, 0.4)), 1e5);
const kept = feature(thin, thin.objects.cities).features.filter(f => {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  return polys.every(po => geoArea({ type: 'Feature', geometry: { type: 'Polygon', coordinates: po } }) < 0.01);
});
writeFileSync(file, JSON.stringify(topology({ cities: { type: 'FeatureCollection', features: [...old, ...kept] } }, 1e5)));
console.log('state', fips, 'added', kept.length, 'total', old.length + kept.length);
