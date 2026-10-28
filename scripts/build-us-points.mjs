// Builds client/data/us-points-<kind>.json for the continental US committee: military sites, hospitals, police, fire and EMS stations,
// ambulance services, prisons and power plants from public US federal layers (ArcGIS, no key needed). Needs the network.
// Usage: node scripts/build-us-points.mjs   (run scripts/build-us-map.mjs first: each point is tagged with its county)
import { readFileSync, writeFileSync } from 'node:fs';
import { feature } from 'topojson-client';
import { geoBounds, geoContains } from 'd3-geo';

const B = 'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services';
const OUT = new Set(['AK', 'HI', 'PR', 'GU', 'VI', 'AS', 'MP', 'UM']);
const topo = JSON.parse(readFileSync('client/data/us-counties.json', 'utf8'));
const counties = feature(topo, topo.objects.counties).features;
const cells = new Map(); // 1 degree cell -> county indexes whose box touches it
counties.forEach((f, i) => {
  const [[x0, y0], [x1, y1]] = geoBounds(f);
  for (let x = Math.floor(x0); x <= Math.floor(x1); x++) for (let y = Math.floor(y0); y <= Math.floor(y1); y++) { const k = `${x},${y}`; (cells.get(k) || cells.set(k, []).get(k)).push(i); }
});
const countyAt = (lon, lat) => {
  const near = cells.get(`${Math.floor(lon)},${Math.floor(lat)}`) || [];
  for (const i of near) if (geoContains(counties[i], [lon, lat])) return i;
  return -1;
};

async function pull(url, fields) {
  const rows = [];
  for (let off = 0; ; off += 2000) {
    const q = `${url}/query?where=1%3D1&outFields=${fields}&outSR=4326&returnGeometry=true&resultOffset=${off}&resultRecordCount=2000&f=json`;
    let d;
    for (let t = 0; t < 4 && !d; t++) { try { d = await (await fetch(q)).json(); } catch { await new Promise(r => setTimeout(r, 1500 * (t + 1))); } }
    if (!d?.features) throw new Error('bad page at ' + url + ' ' + off);
    rows.push(...d.features);
    if (!d.exceededTransferLimit && d.features.length < 2000) break;
  }
  return rows;
}
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
const title = s => clean(s).toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()).replace(/\b(Us|Ems|Vamc|Ii|Iii|Nas|Afb)\b/gi, m => m.toUpperCase());

// kind -> [layer url, fields, how a row becomes [lon, lat, name, city, extra]]
const SOURCES = {
  hospital: [`${B}/Structures_Medical_Emergency_Response_v1/FeatureServer/0`, 'NAME,CITY,STATE', a => [a.NAME, a.CITY, a.STATE]],
  ambulance: [`${B}/Structures_Medical_Emergency_Response_v1/FeatureServer/1`, 'NAME,CITY,STATE', a => [a.NAME, a.CITY, a.STATE]],
  fire: [`${B}/Structures_Medical_Emergency_Response_v1/FeatureServer/2`, 'NAME,CITY,STATE', a => [a.NAME, a.CITY, a.STATE]],
  police: [`${B}/Structures_Law_Enforcement_v1/FeatureServer/0`, 'NAME,CITY,STATE', a => [a.NAME, a.CITY, a.STATE]],
  prison: [`${B}/Structures_Law_Enforcement_v1/FeatureServer/1`, 'NAME,CITY,STATE', a => [a.NAME, a.CITY, a.STATE]],
  military: [`${B}/MIRTA_Points_A_view/FeatureServer/0`, 'siteName,featureName,stateNameCode,siteReportingComponent,countryName', a => [a.siteName || a.featureName, '', a.stateNameCode, a.siteReportingComponent]],
  power: [`${B}/Power_Plants_in_the_US/FeatureServer/0`, 'Plant_Name,City,State,PrimSource,Total_MW', a => [a.Plant_Name, a.City, a.State, `${a.PrimSource}|${Math.round(a.Total_MW || 0)}`]],
};
for (const [kind, [url, fields, pick]] of Object.entries(SOURCES)) {
  const rows = await pull(url, fields);
  const list = [];
  for (const r of rows) {
    const g = r.geometry; if (!g) continue;
    // Web Mercator metres to degrees when the server ignored outSR.
    const lon = Math.abs(g.x) > 180 ? g.x / 111319.49079327357 : g.x;
    const lat = Math.abs(g.y) > 90 ? (Math.atan(Math.exp(g.y / 6378137)) * 360) / Math.PI - 90 : g.y;
    const [name, city, state, extra] = pick(r.attributes);
    if (OUT.has(String(state).toUpperCase()) || (r.attributes.countryName && r.attributes.countryName !== 'USA')) continue;
    if (lon < -125 || lon > -66.5 || lat < 24 || lat > 49.6) continue;
    const ci = countyAt(lon, lat);
    if (ci < 0) continue;
    if (kind === 'power' && !/^nuclear$/i.test(String(extra).split('|')[0]) && Number(String(extra).split('|')[1]) < 500) continue; // only the big plants
    list.push([Math.round(lon * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4, title(name), title(city), ci, extra ?? 0]);
  }
  writeFileSync(`client/data/us-points-${kind}.json`, JSON.stringify(list));
  console.log(kind, rows.length, '->', list.length);
}
