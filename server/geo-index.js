// Builds a point-in-country index and land adjacency from the world atlas (server side).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { feature, neighbors as topoNeighbors } from 'topojson-client';
import { geoContains, geoBounds, geoCentroid, geoArea } from 'd3-geo';
import { featureCountryId } from '../shared/data/places.js';

const require = createRequire(import.meta.url);
const topo = JSON.parse(readFileSync(require.resolve('world-atlas/countries-50m.json'), 'utf8'));
const geoms = topo.objects.countries.geometries;
const fc = feature(topo, topo.objects.countries);

const byCountry = new Map(); // id -> [{ f, bbox }]
const names = new Map();
fc.features.forEach((f, i) => {
  const id = featureCountryId(f);
  if (!id) return;
  const b = geoBounds(f);
  if (!byCountry.has(id)) byCountry.set(id, []);
  byCountry.get(id).push({ f, bbox: b, area: geoArea(f) });
  if (f.id === id || !names.has(id)) names.set(id, f.properties.name);
});

const adjacency = new Map();
const nb = topoNeighbors(geoms);
geoms.forEach((g, i) => {
  const a = featureCountryId(fc.features[i]);
  if (!a) return;
  for (const j of nb[i]) {
    const b = featureCountryId(fc.features[j]);
    if (!b || b === a) continue;
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a).add(b); adjacency.get(b).add(a);
  }
});
// Land links the atlas misses (bridges, tunnels, narrow straits armies realistically cross).
for (const [a, b] of [['826', '250'], ['208', '752'], ['682', '048'], ['792', '300'], ['818', '682'], ['156', '158']]) {
  if (a === '156' && b === '158') continue; // Taiwan needs an amphibious crossing
  adjacency.get(a)?.add(b); adjacency.get(b)?.add(a);
}

function inBox(b, lon, lat) {
  const [[x0, y0], [x1, y1]] = b;
  if (lat < y0 - 0.01 || lat > y1 + 0.01) return false;
  if (x0 <= x1) return lon >= x0 - 0.01 && lon <= x1 + 0.01;
  return lon >= x0 - 0.01 || lon <= x1 + 0.01; // crosses the antimeridian
}

const cache = new Map();
let lastHit = null;
function hit(id, lon, lat) {
  for (const p of byCountry.get(id)) if (inBox(p.bbox, lon, lat) && geoContains(p.f, [lon, lat])) return true;
  return false;
}
export function countryAt(lon, lat) {
  const key = Math.round(lon * 5) + ':' + Math.round(lat * 5);
  if (cache.has(key)) return cache.get(key);
  let found = null;
  if (lastHit && hit(lastHit, lon, lat)) found = lastHit;
  else for (const id of byCountry.keys()) if (id !== lastHit && hit(id, lon, lat)) { found = id; break; }
  if (found) lastHit = found;
  if (cache.size < 400000) cache.set(key, found);
  return found;
}

export function neighborsOf(id) { return [...(adjacency.get(id) || [])]; }
export function atlasCountryIds() { return [...byCountry.keys()]; }
export function atlasName(id) { return names.get(id); }

// A representative point: centroid of the largest polygon piece.
export function anchorOf(id) {
  const parts = byCountry.get(id);
  if (!parts) return null;
  const big = parts.reduce((m, p) => (p.area > m.area ? p : m), parts[0]);
  let f = big.f;
  if (f.geometry.type === 'MultiPolygon') {
    let best = null, bestA = -1;
    for (const poly of f.geometry.coordinates) {
      const g = { type: 'Feature', geometry: { type: 'Polygon', coordinates: poly } };
      const a = geoArea(g);
      if (a > bestA && a < 2 * Math.PI) { bestA = a; best = g; }
    }
    if (best) f = best;
  }
  const [lon, lat] = geoCentroid(f);
  return { lat, lon };
}

export const geo = { countryAt, neighborsOf, anchorOf };

// Territory cells for war fronts: the coarse atlas rasterised onto the 0.3° grid (the browsers build the same one).
import { buildCellRaster, cellAt } from '../shared/engine/control.js';
const lo = JSON.parse(readFileSync(require.resolve('world-atlas/countries-110m.json'), 'utf8'));
const raster = buildCellRaster(feature(lo, lo.objects.countries).features.map(f => ({ id: featureCountryId(f), geometry: f.geometry })));
const tinyCells = new Map();
export function homeOf(key) { return raster.homeOf(key) || tinyCells.get(key) || null; }
export function cellsOf(id) {
  const list = raster.cellsOf(id);
  if (list.length || !byCountry.has(id)) return list;
  // Countries smaller than a cell still get the cell at their centre.
  const a = anchorOf(id), k = cellAt(a.lon, a.lat);
  if (!raster.homeOf(k)) tinyCells.set(k, id);
  return [k];
}
geo.homeOf = homeOf;
geo.cellsOf = cellsOf;
