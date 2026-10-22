// Loads the world atlas once and indexes countries by World Engine id (dependent territories merge into their sovereign).
import { feature, mesh } from 'topojson-client';
import { geoBounds, geoContains, geoArea, geoCentroid, geoPath, geoEquirectangular } from 'd3-geo';
import { featureCountryId } from '/shared/data/places.js';
import { buildCellRaster } from '/shared/engine/control.js';

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
    // One part per polygon, so the main landmass is found even when a feature carries overseas pieces
    // (France with French Guiana, the US with Alaska and Hawaii).
    const parts = fs.flatMap(f => (f.geometry?.type === 'MultiPolygon'
      ? f.geometry.coordinates.map(coordinates => ({ type: 'Feature', properties: f.properties, geometry: { type: 'Polygon', coordinates } }))
      : [f])).map(f => {
      const a = geoArea(f);
      return { f, bbox: geoBounds(f), area: a > 2 * Math.PI ? 4 * Math.PI - a : a };
    });
    const main = parts.reduce((a, b) => (b.area > a.area ? b : a));
    return { id, feature: merged, parts, centroid: geoCentroid(main.f), area: parts.reduce((s, p) => s + p.area, 0) };
  });
  const borders = mesh(topo, topo.objects.countries, (a, b) => a !== b);
  const coast = mesh(topo, topo.objects.countries, (a, b) => a === b);
  // The coarse atlas also defines the territory grid fronts are held on (identical to the server's).
  const cells = /110m/.test(url) ? buildCellRaster(fc.features.map(f => ({ id: featureCountryId(f), geometry: f.geometry }))) : null;
  return { countries, byId: new Map(countries.map(c => [c.id, c])), borders, coast, topo, pairs: new Map(), cells };
}

// The land border two countries share, as a MultiLineString (empty when they do not touch). Cached per pair.
export function pairBorder(atlas, a, b) {
  const key = a < b ? `${a}|${b}` : `${b}|${a}`;
  if (!atlas.pairs.has(key)) {
    const { topo } = atlas;
    atlas.pairs.set(key, mesh(topo, topo.objects.countries, (x, y) => {
      const i = featureCountryId(x), j = featureCountryId(y);
      return (i === a && j === b) || (i === b && j === a);
    }));
  }
  return atlas.pairs.get(key);
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

// Fast land test for keeping ships in the water: the detailed atlas painted once into a 0.1° land mask.
export function makeLandAt(atlas, res = 0.1) {
  const W = Math.round(360 / res), H = Math.round(180 / res);
  let mask = null;
  const build = () => {
    const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const path = geoPath(geoEquirectangular().scale(W / (2 * Math.PI)).translate([W / 2, H / 2]), ctx);
    ctx.fillStyle = '#fff'; ctx.beginPath();
    for (const c of atlas.countries) path(c.feature);
    ctx.fill();
    const data = ctx.getImageData(0, 0, W, H).data;
    mask = new Uint8Array(W * H);
    for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] > 127 ? 1 : 0;
  };
  return (lon, lat) => {
    if (!mask) build();
    const x = ((Math.floor((lon + 180) / res) % W) + W) % W, y = Math.floor((90 - lat) / res);
    return y >= 0 && y < H && mask[y * W + x] === 1;
  };
}
