// Loads the world atlas once and indexes countries by World Engine id (dependent territories merge into their sovereign).
import { feature, mesh } from 'topojson-client';
import { geoBounds, geoContains, geoArea, geoCentroid } from 'd3-geo';
import { featureCountryId } from '/shared/data/places.js';

let loading = null;

async function load(url) {
  const topo = await (await fetch(url)).json();
  const fc = feature(topo, topo.objects.countries);
  const byId = new Map();
  for (const f of fc.features) {
    const id = featureCountryId(f);
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(f);
  }
  const countries = [...byId.entries()].map(([id, fs]) => {
    const merged = { type: 'Feature', id, properties: { name: fs[0].properties.name }, geometry: { type: 'GeometryCollection', geometries: fs.map(f => f.geometry) } };
    const parts = fs.map(f => ({ f, bbox: geoBounds(f), area: geoArea(f) }));
    const main = parts.reduce((a, b) => (b.area > a.area ? b : a));
    return { id, feature: merged, parts, centroid: geoCentroid(main.f), area: parts.reduce((s, p) => s + p.area, 0) };
  });
  const borders = mesh(topo, topo.objects.countries, (a, b) => a !== b);
  const coast = mesh(topo, topo.objects.countries, (a, b) => a === b);
  return { countries, byId: new Map(countries.map(c => [c.id, c])), borders, coast };
}

export function loadAtlas() {
  if (!loading) loading = Promise.all([load('/vendor/world-110m.json'), load('/vendor/world-50m.json')]).then(([lo, hi]) => ({ lo, hi }));
  return loading;
}

function inBox([[x0, y0], [x1, y1]], lon, lat) {
  if (lat < y0 || lat > y1) return false;
  return x0 <= x1 ? lon >= x0 && lon <= x1 : lon >= x0 || lon <= x1;
}

// Point-in-country lookup on the coarse atlas, cached on a 0.5° grid.
export function makeCountryAt(atlas) {
  const cache = new Map();
  return (lon, lat) => {
    const key = `${Math.round(lon * 2)},${Math.round(lat * 2)}`;
    if (cache.has(key)) return cache.get(key);
    let hit = null;
    for (const c of atlas.countries) {
      if (c.parts.some(p => inBox(p.bbox, lon, lat) && geoContains(p.f, [lon, lat]))) { hit = c.id; break; }
    }
    cache.set(key, hit);
    return hit;
  };
}
