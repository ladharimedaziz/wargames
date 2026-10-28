// Builds client/data/us-neighbors.json: the Canadian provinces and Mexican states that sit around the lower 48, for the US committee.
// Usage: node scripts/build-us-neighbors.mjs <folder holding the unzipped ne_10m_admin_1_states_provinces files>
// The land is cut to the part that "fits" beside the US map (north to 60 N, west to 135 W, south to the Yucatan), thinned hard,
// and stored as a TopoJSON so shared borders stay in one piece.
import { open } from 'shapefile';
import { topology } from 'topojson-server';
import { presimplify, simplify, quantile } from 'topojson-simplify';
import { quantize } from 'topojson-client';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) { console.error('Give the folder with the unzipped Natural Earth files.'); process.exit(1); }
const BOX = { x0: -135, x1: -50, y0: 14, y1: 60 };
const src = await open(join(dir, 'ne_10m_admin_1_states_provinces.shp'), join(dir, 'ne_10m_admin_1_states_provinces.dbf'));
const area = ring => { let a = 0; for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]; return Math.abs(a / 2); };
const features = [];
for (let r = await src.read(); !r.done; r = await src.read()) {
  const f = r.value, c = f.properties.adm0_a3;
  if (c !== 'CAN' && c !== 'MEX') continue;
  const polys = (f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates])
    // Drop islands and anything wholly outside the box; keep each polygon whole so borders still meet.
    .filter(p => { const xs = p[0].map(q => q[0]), ys = p[0].map(q => q[1]); return Math.max(...xs) > BOX.x0 && Math.min(...xs) < BOX.x1 && Math.max(...ys) > BOX.y0 && Math.min(...ys) < BOX.y1 && area(p[0]) > 0.6; });
  if (!polys.length) continue;
  features.push({ type: 'Feature', id: `${c}-${f.properties.name}`, properties: { c, n: f.properties.name }, geometry: { type: 'MultiPolygon', coordinates: polys } });
}
const topo = topology({ regions: { type: 'FeatureCollection', features } }, 1e6);
const pre = presimplify(topo), simple = simplify(pre, quantile(pre, 0.55));
const out = quantize(simple, 1e5);
writeFileSync(join(process.cwd(), 'client/data/us-neighbors.json'), JSON.stringify(out));
console.log('regions', features.length);
