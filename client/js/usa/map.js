// The continental US map: states, cities, highways and the land beside the border drawn on a canvas. The stage follows the Zeus's view;
// on the Zeus panel it can be dragged and zoomed (`interactive`). Only the stage (`stage`) applies the force filter.
import { feature, mesh } from 'topojson-client';
import { geoAlbers, geoPath, geoCentroid } from 'd3-geo';
import { html, useRef, useEffect, useMemo, cls } from '../lib.js';
import { drawSil, getImage, sealUrl } from './art.js';
import { USA_VIEW, USA_MAX_ZOOM, USA_UNIT_KINDS, LIGHT_PATTERNS, LIGHT_PATTERN_IDS, lightColors, getUnits, CROSSING_LIST, crossingState } from '/shared/engine/usa.js';
import { sideColor, effSide, glidePos, typeOf } from '/shared/engine/usa-sim.js';
import { forceShown } from '/shared/engine/core.js';
import { detect, drawFx, drawTrails } from './fx.js';

let loading = null;
// Loads and indexes the map files once: the states, the roads, and the Canadian and Mexican regions beside them.
export function loadUsa() {
  loading ||= Promise.all(['us-states', 'us-roads', 'us-neighbors'].map(n => fetch(`/client/data/${n}.json`).then(r => r.json()))).then(([topo, rd, nb]) => {
    const states = feature(topo, topo.objects.states).features.map(f => ({ f, id: f.id, name: f.properties.name, centroid: geoCentroid(f) }));
    const lines = (list, type) => list.flatMap(([name, ls]) => ls.map(d => {
      let x = d[0], y = d[1]; const coordinates = [[x / 1000, y / 1000]];
      for (let i = 2; i < d.length; i += 2) { x += d[i]; y += d[i + 1]; coordinates.push([x / 1000, y / 1000]); }
      return { type, name, coordinates };
    }));
    const regions = feature(nb, nb.objects.regions).features.map(f => ({ f, id: f.id, c: f.properties.c, name: f.properties.n, centroid: geoCentroid(f) }));
    return {
      states, regions,
      byState: new Map(states.map(s => [s.id, s])),
      nation: { type: 'FeatureCollection', features: states.map(s => s.f) },
      neighbors: { type: 'FeatureCollection', features: regions.map(r => r.f) },
      regionMesh: mesh(nb, nb.objects.regions, (a, b) => a !== b),
      stateMesh: mesh(topo, topo.objects.states, (a, b) => a !== b),
      outline: mesh(topo, topo.objects.states, (a, b) => a === b),
      interstates: lines(rd.i, 'i'), highways: lines(rd.u, 'u'),
    };
  });
  return loading;
}

// The Albers projection with the lower 48 fitted into w x h at zoom 1. A view {lon, lat, k} puts that point in the middle at zoom k.
// Fitting streams the whole nation through the projection, so the result is kept per size: the pointer handlers ask for it on
// every move. Callers must not change the returned projection.
const fitted = new WeakMap();
function baseProjection(data, w, h) {
  const m = fitted.get(data) || fitted.set(data, new Map()).get(data), key = `${w}x${h}`;
  if (!m.has(key)) m.set(key, geoAlbers().rotate([96, 0]).center([0, 38.5]).parallels([29.5, 45.5]).fitExtent([[w * 0.03, h * 0.05], [w * 0.97, h * 0.95]], data.nation));
  return m.get(key);
}
function viewProjection(base, view, w, h) {
  const t0 = base.translate(), s0 = base.scale(), p = base([view.lon, view.lat]);
  return geoAlbers().rotate([96, 0]).center([0, 38.5]).parallels([29.5, 45.5]).scale(s0 * view.k)
    .translate([w / 2 - (p[0] - t0[0]) * view.k, h / 2 - (p[1] - t0[1]) * view.k]).clipExtent([[-20, -20], [w + 20, h + 20]]);
}

// Every shape projected once into Path2D objects at zoom 1, for the current base projection (S.bp). Re-projecting ~3,000
// counties and every road on each frame of a pan or zoom made the map crawl; a view is just this picture scaled and moved.
function basePaths(S) {
  const B = S.bp, proj = B.fine ||= geoAlbers().rotate([96, 0]).center([0, 38.5]).parallels([29.5, 45.5]).scale(B.p.scale()).translate(B.p.translate()).precision(0.05);
  const mk = obj => { const p = new Path2D(); geoPath(proj, p)(obj); return p; };
  if (!B.paths) {
    const roads = list => { const p = new Path2D(), path = geoPath(proj, p); for (const l of list) path({ type: 'LineString', coordinates: l.coordinates }); return p; };
    B.paths = {
      nation: mk(S.data.nation), neighbors: mk(S.data.neighbors), regions: mk(S.data.regionMesh), states: mk(S.data.stateMesh), outline: mk(S.data.outline),
      highways: roads(S.data.highways), interstates: roads(S.data.interstates),
      byState: new Map(S.data.states.map(s => [s.id, mk(s.f)])),
    };
  }
  if (cityData && !B.paths.cities) B.paths.cities = mk(cityData.all);
  return B.paths;
}
let hitCtx = null;
// The state under base-projection point b, tested against the cached paths (geoContains on every state was slow).
function stateAt(S, b) {
  hitCtx ||= new OffscreenCanvas(1, 1).getContext('2d');
  for (const [id, p] of basePaths(S).byState) if (hitCtx.isPointInPath(p, b[0], b[1])) return id;
  return null;
}

// The view that frames one state (or the whole country with no id).
export function viewFor(data, id, w = 1600, h = 900) {
  const st = id && data.byState.get(id);
  if (!st) return { ...USA_VIEW };
  const base = baseProjection(data, w, h), [[x0, y0], [x1, y1]] = geoPath(base).bounds(st.f);
  const k = Math.max(1, Math.min(USA_MAX_ZOOM, 0.7 * Math.min(w / (x1 - x0), h / (y1 - y0)) * 0.9));
  const c = base.invert([(x0 + x1) / 2, (y0 + y1) / 2]);
  return { lon: c[0], lat: c[1], k: Math.round(k * 100) / 100 };
}

// A view that frames a box of longitudes and latitudes [west, south, east, north], with room around it.
export function viewForBox(data, [w0, s0, e0, n0], w = 1600, h = 900) {
  const base = baseProjection(data, w, h), pts = [[w0, s0], [e0, s0], [w0, n0], [e0, n0]].map(g => base(g));
  const x0 = Math.min(...pts.map(p => p[0])), x1 = Math.max(...pts.map(p => p[0])), y0 = Math.min(...pts.map(p => p[1])), y1 = Math.max(...pts.map(p => p[1]));
  const k = Math.max(1, Math.min(14, 0.7 * Math.min(w / Math.max(40, x1 - x0), h / Math.max(40, y1 - y0))));
  const c = base.invert([(x0 + x1) / 2, (y0 + y1) / 2]);
  return { lon: c[0], lat: c[1], k: Math.round(k * 100) / 100 };
}

// City outlines (places of 12 km² and up), loaded the first time the layer is shown. Largest first, so their names win clashes.
let cityData = null, cityLoading = null;
export function loadCities() {
  cityLoading ||= fetch('/client/data/us-cities.json').then(r => r.json()).then(topo => {
    const fs = feature(topo, topo.objects.cities).features.sort((a, b) => b.properties.a - a.properties.a);
    cityData = { fs, all: { type: 'FeatureCollection', features: fs }, centroids: fs.map(f => geoCentroid(f)) };
    return cityData;
  });
  return cityLoading;
}

const STATUS_TINT = { alert: 'rgba(255,209,102,.16)', emergency: 'rgba(255,138,74,.28)', martial: 'rgba(255,74,74,.36)' };
const COL = { sea: '#06101f', land: '#142640', hi: '#2a4f86', neighbor: '#0f2038', region: 'rgba(150,180,230,.22)', state: 'rgba(190,215,255,.7)', coast: 'rgba(190,215,255,.85)', i: '#f3b24a', u: 'rgba(200,170,120,.7)', label: '#dfe9fb', hover: 'rgba(255,255,255,.14)' };

// `view` is the view to show, `onView` is called as the viewer drags or zooms, `onPick` with a state code on click.
// What a unit's badge says.
export const unitLabel = u => (u.kind === 'governor' ? `${u.owner === 'DC' ? 'Mayor' : 'Gov.'} ${u.person}${u.party ? ` (${u.party})` : ''}` : u.federal ? `${u.short} · federal` : u.short);
const roundRect = (ctx, x, y, w, h, r) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); };

// Warships are drawn from above as hulls that point the way they sail. Lengths are in screen pixels and never change with zoom.
const HULL_LEN = { carrier: 24, ship: 18, destroyer: 17, sub: 15 };
const wrapAng = a => Math.atan2(Math.sin(a), Math.cos(a));
// Turns a ship smoothly towards its course: where its order takes it next, or the way it last moved. It keeps that heading
// when it stops. Returns true while it is still turning or under way, so the overlay keeps animating.
function shipHeading(S, u, p, proj, now, glide) {
  const H = (S.helm ||= {}), h = H[u.id] ||= { a: null, p, t: now, v: 0 };
  let want = null;
  if (u.mv && (u.mv[0] || u.mv[1])) {
    // `mv` is the way the ship is sailing right now (towards its next waypoint), in degrees a second.
    const at = glide ? glidePos(u, S.units, glide) : [u.lon, u.lat], f = 0.05 / Math.hypot(u.mv[0], u.mv[1]), a = proj(at), q = proj([at[0] + u.mv[0] * f, at[1] + u.mv[1] * f]);
    if (a && q) want = Math.atan2(q[1] - a[1], q[0] - a[0]);
  }
  if (want == null && Math.hypot(p[0] - h.p[0], p[1] - h.p[1]) > 1.5 && Math.hypot(p[0] - h.p[0], p[1] - h.p[1]) < 80 && h.k === S.cur.k) want = Math.atan2(p[1] - h.p[1], p[0] - h.p[0]);
  const dt = Math.min(0.1, Math.max(0, (now - h.t) / 1000));
  if (h.a == null) h.a = want ?? ((u.id.length * 131 + u.id.charCodeAt(0) * 17) % 628) / 100;
  else if (want != null) { const d = wrapAng(want - h.a); h.a = wrapAng(h.a + Math.sign(d) * Math.min(Math.abs(d), Math.max(0.5, Math.abs(d) * 2.4) * dt)); }
  const going = !!(u.mv && glide);
  h.v += ((going ? 1 : 0) - h.v) * Math.min(1, dt * (going ? 1.6 : 0.8));
  h.p = p; h.t = now; h.k = S.cur.k;
  return { a: h.a, v: h.v, busy: going || h.v > 0.02 || (want != null && Math.abs(wrapAng(want - h.a)) > 0.01) };
}
function drawShip(ctx, S, u, p, proj, now, fill, glide, edge) {
  const { a, v, busy } = shipHeading(S, u, p, proj, now, glide), L = HULL_LEN[u.sil] || 14, B = L * (u.sil === 'carrier' ? 0.34 : 0.26), t = now / 1000;
  ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(a + Math.sin(t * 0.7 + u.id.length) * 0.03 * (1 - v));
  if (v > 0.05) {
    // Under way: a bow wave curling off the stem.
    const b = 0.5 + 0.5 * Math.sin(t * 6 + u.id.length);
    ctx.strokeStyle = `rgba(240,248,255,${(0.45 + 0.3 * b) * v})`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(L / 2 + 1, 0); ctx.quadraticCurveTo(L * 0.3, -B * 0.9 - b, L * 0.05, -B - 1.5 - b); ctx.moveTo(L / 2 + 1, 0); ctx.quadraticCurveTo(L * 0.3, B * 0.9 + b, L * 0.05, B + 1.5 + b); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(1, 1.5, L / 2, B / 2 + 0.5, 0, 0, 6.2832); ctx.fill(); // shadow on the water
  ctx.fillStyle = fill; ctx.beginPath();
  if (u.sil === 'carrier') { ctx.moveTo(L / 2, -B * 0.15); ctx.lineTo(L * 0.32, -B / 2); ctx.lineTo(-L / 2, -B / 2); ctx.lineTo(-L / 2, B * 0.4); ctx.lineTo(L * 0.3, B * 0.4); ctx.lineTo(L / 2, B * 0.1); }
  else if (u.sil === 'sub') ctx.ellipse(0, 0, L / 2, B / 2, 0, 0, 6.2832);
  else { ctx.moveTo(L / 2, 0); ctx.quadraticCurveTo(L * 0.2, -B / 2, -L * 0.2, -B / 2); ctx.lineTo(-L / 2, -B * 0.38); ctx.lineTo(-L / 2, B * 0.38); ctx.lineTo(-L * 0.2, B / 2); ctx.quadraticCurveTo(L * 0.2, B / 2, L / 2, 0); }
  ctx.closePath(); ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = edge; ctx.stroke();
  // Deck detail: the carrier's island and angled deck, a sail on a submarine, a bridge on anything else.
  ctx.fillStyle = 'rgba(6,16,31,.75)';
  if (u.sil === 'carrier') { ctx.fillRect(L * 0.02, B * 0.12, L * 0.14, B * 0.26); ctx.strokeStyle = 'rgba(6,16,31,.55)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-L * 0.45, B * 0.25); ctx.lineTo(L * 0.15, -B * 0.4); ctx.stroke(); }
  else if (u.sil === 'sub') { ctx.beginPath(); ctx.ellipse(L * 0.1, 0, L * 0.09, B * 0.22, 0, 0, 6.2832); ctx.fill(); }
  else ctx.fillRect(-L * 0.12, -B * 0.22, L * 0.22, B * 0.44);
  ctx.restore();
  return busy;
}

export function UsMap({ usa, view, onView, onPick, onPickUnit, onPlace, onOrder, onBox, selectedUnit = null, selectedUnits = null, selectedState = null, selectedCrossing = null, interactive = false, stage = false, className = '', onMapClick = null }) {
  const cv = useRef(), ov = useRef(), st = useRef({ data: null, w: 0, h: 0, cur: { ...USA_VIEW }, want: { ...USA_VIEW }, hover: null, raf: 0, onView, onPick, usa });
  st.current.onView = onView; st.current.onPick = onPick; st.current.onPickUnit = onPickUnit; st.current.onPlace = onPlace; st.current.usa = usa; st.current.selUnit = selectedUnit; st.current.selSet = new Set(selectedUnits || (selectedUnit ? [selectedUnit] : [])); st.current.onOrder = onOrder; st.current.onBox = onBox;
  if (st.current.usaPrev !== usa) { st.current.usaPrev = usa; st.current.recvAt = performance.now(); } st.current.selState = selectedState; st.current.selX = selectedCrossing;
  st.current.crossings = useMemo(() => Object.fromEntries(CROSSING_LIST.map(c => [c.id, crossingState(usa, c.id)])), [usa.border, usa.crossings]);
  st.current.units = useMemo(() => getUnits(usa), [usa.mods, usa.custom]);
  st.current.unitSig = useMemo(() => { let h = 0; for (const ch of JSON.stringify([usa.mods, usa.custom])) h = (h * 31 + ch.charCodeAt(0)) | 0; return h; }, [usa.mods, usa.custom]); // changes whenever a unit is edited, so badges re-lay out


  // The terrain, roads, borders and names are painted into an off-screen canvas that is reused while the view and layers stay the
  // same, so flashing lightbars only repaint the dots on top.
  // Shapes are pre-projected at zoom 1 (basePaths), and every view is that picture scaled by k and shifted, so a pan or zoom
  // only re-fills cached paths. Widths are given in screen pixels and divided by k.
  const paintBase = (ctx, S, proj, k) => {
    const L = S.usa.layers, P = basePaths(S), o = S.bp.p([S.cur.lon, S.cur.lat]);
    const geo = fn => { ctx.save(); ctx.transform(k, 0, 0, k, S.w / 2 - k * o[0], S.h / 2 - k * o[1]); fn(); ctx.restore(); };
    const line = (p, color, wd) => geo(() => { ctx.strokeStyle = color; ctx.lineWidth = wd / k; ctx.stroke(p); });
    ctx.fillStyle = COL.sea; ctx.fillRect(0, 0, S.w, S.h);
    if (L.neighbors) geo(() => { ctx.fillStyle = COL.neighbor; ctx.fill(P.neighbors); ctx.lineWidth = 2 / k; ctx.strokeStyle = COL.neighbor; ctx.stroke(P.neighbors); });
    if (L.neighbors) line(P.regions, COL.region, 0.7);
    geo(() => {
      ctx.fillStyle = COL.land; ctx.fill(P.nation);
      ctx.fillStyle = COL.hi; for (const id of new Set(S.usa.highlight || [])) { const p = P.byState.get(id); if (p) ctx.fill(p); }
      for (const [code, g] of Object.entries(S.usa.states || {})) { const tint = STATUS_TINT[g.status], p = tint && P.byState.get(code); if (p) { ctx.fillStyle = tint; ctx.fill(p); } }
      if (S.hover && P.byState.has(S.hover)) { ctx.fillStyle = COL.hover; ctx.fill(P.byState.get(S.hover)); }
    });
    if (L.cities && k >= 2) {
      if (!cityData) loadCities().then(() => { S.baseKey = null; redraw(); });
      else {
        line(P.cities, 'rgba(255,196,120,.8)', k < 6 ? 0.7 : 1.2); // hollow: the outline only
        if (L.labels && k >= 5) {
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '500 11px "IBM Plex Sans", sans-serif';
          const placed = [];
          cityData.fs.forEach((f, i) => {
            const p = proj(cityData.centroids[i]); if (!p || p[0] < 10 || p[0] > S.w - 10 || p[1] < 10 || p[1] > S.h - 10) return;
            const name = f.properties.name, w = ctx.measureText(name).width + 4;
            if (placed.some(q => Math.abs(q[0] - p[0]) < (q[2] + w) / 2 && Math.abs(q[1] - p[1]) < 13)) return;
            placed.push([p[0], p[1], w]);
            ctx.fillStyle = 'rgba(255,214,160,.95)'; ctx.fillText(name, p[0], p[1]);
          });
        }
      }
    }
    if (L.highways) {
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      if (k >= 1.6) line(P.highways, COL.u, k > 6 ? 1.2 : 0.7);
      line(P.interstates, COL.i, k > 6 ? 2 : k > 2.5 ? 1.4 : 0.9);
    }
    if (S.selState && P.byState.has(S.selState)) line(P.byState.get(S.selState), '#ffffff', 2.2);
    if (L.states) line(P.states, COL.state, k < 4 ? 1.1 : 1.8);
    line(P.outline, COL.coast, 1.2);
    if (L.labels) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = COL.label;
      if (k < 9) {
        ctx.font = '600 15px "IBM Plex Sans Condensed", sans-serif';
        for (const s of S.data.states) { const p = proj(s.centroid); if (p && p[0] > 0 && p[0] < S.w && p[1] > 0 && p[1] < S.h) ctx.fillText(s.id, p[0], p[1]); }
      }
      if (L.neighbors) {
        ctx.fillStyle = 'rgba(160,185,225,.55)';
        ctx.font = '600 14px "IBM Plex Sans Condensed", sans-serif';
        for (const r of S.data.regions) {
          if (k < 2 && r.c === 'CAN' && r.name !== 'Ontario' && r.name !== 'Quebec' && r.name !== 'British Columbia' && r.name !== 'Alberta') continue;
          const p = proj(r.centroid); if (p && p[0] > 0 && p[0] < S.w && p[1] > 0 && p[1] < S.h) ctx.fillText(r.name.toUpperCase(), p[0], p[1]);
        }
      }
    }
  };

  const draw = () => {
    const S = st.current, c = cv.current;
    S.raf = 0;
    if (!c || !S.data || !S.w) return;
    const dpr = window.devicePixelRatio || 1, ctx = c.getContext('2d', { alpha: false });
    // Glide towards the wanted view on the stage (and on overview maps); the Zeus panel, and a drag or scroll on the stage
    // itself, jump straight there. The glide is a critically damped spring on the centre and the log of the zoom: it starts
    // gently, carries its speed into a new target instead of lurching, and settles without overshoot. (The stage map takes
    // input too, and used to jump to every new framing because of that.)
    const w = S.want, v = S.cur, now0 = performance.now(), dt = Math.min(0.1, (now0 - (S.glideAt || now0)) / 1000) || 1 / 60;
    let moving = false;
    if ((interactive && !stage) || now0 - (S.directAt || -1e9) < 300) { Object.assign(v, w); S.vel = null; }
    else {
      const om = 2.6, at = [v.lon, v.lat, Math.log(v.k)], to = [w.lon, w.lat, Math.log(w.k)], vel = S.vel ||= [0, 0, 0];
      for (let i = 0; i < 3; i++) { vel[i] += (om * om * (to[i] - at[i]) - 2 * om * vel[i]) * dt; at[i] += vel[i] * dt; }
      [v.lon, v.lat] = at; v.k = Math.exp(at[2]);
      const off = Math.abs(w.lon - v.lon) + Math.abs(w.lat - v.lat) + Math.abs(Math.log(w.k / v.k)), speed = Math.abs(vel[0]) + Math.abs(vel[1]) + Math.abs(vel[2]);
      if (off < 1e-3 / Math.max(1, v.k) && speed < 1e-2 / Math.max(1, v.k)) { Object.assign(v, w); S.vel = null; } else moving = true;
    }
    S.glideAt = moving ? now0 : 0;
    if (!S.bp || S.bp.w !== S.w || S.bp.h !== S.h) S.bp = { w: S.w, h: S.h, p: baseProjection(S.data, S.w, S.h) };
    const proj = viewProjection(S.bp.p, v, S.w, S.h), k = v.k, L = S.usa.layers;
    const rest = [S.w, S.h, dpr, L.states, L.neighbors, L.cities, L.highways, L.labels, (S.usa.highlight || []).join(), S.hover, S.selState, Object.entries(S.usa.states || {}).map(([c, g]) => c + g.status).join()].join('|');
    const key = [v.lon.toFixed(5), v.lat.toFixed(5), k.toFixed(4), rest].join('|'), now = performance.now();
    // The map itself lives on the bottom canvas and is repainted only when the view or layers change; the dots live on a canvas
    // above it, cleared and redrawn every frame, so flashing never repaints the map.
    // While the view keeps changing (a drag, a wheel, a glide), the last sharp paint is stretched into place instead: rasterising
    // every county line each frame stutters even on a good GPU. A full paint follows once the view has been still for 150 ms.
    if (S.baseKey !== key) {
      const snap = S.snap;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (snap && snap.rest === rest && now - S.changedAt < 150) {
        const ps = S.bp.p([snap.lon, snap.lat]), p = S.bp.p([v.lon, v.lat]), r = k / snap.k;
        ctx.fillStyle = COL.sea; ctx.fillRect(0, 0, S.w, S.h);
        ctx.transform(r, 0, 0, r, S.w / 2 * (1 - r) + k * (ps[0] - p[0]), S.h / 2 * (1 - r) + k * (ps[1] - p[1]));
        ctx.drawImage(snap.c, 0, 0, S.w, S.h);
        clearTimeout(S.settle); S.settle = setTimeout(() => { S.baseKey = null; redraw(); }, 150);
      } else {
        paintBase(ctx, S, proj, k);
        const sc = snap?.c || document.createElement('canvas');
        if (sc.width !== c.width || sc.height !== c.height) { sc.width = c.width; sc.height = c.height; }
        sc.getContext('2d').drawImage(c, 0, 0);
        S.snap = { c: sc, rest, lon: v.lon, lat: v.lat, k };
      }
      S.baseKey = key; S.changedAt = now;
    }
    const octx = ov.current.getContext('2d');
    octx.setTransform(1, 0, 0, 1, 0, 0); octx.clearRect(0, 0, ov.current.width, ov.current.height); octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const flashing = drawDots(octx, S, proj, k, performance.now());
    if (moving && !S.raf) S.raf = requestAnimationFrame(draw);
    else if (flashing && !S.raf) S.raf = setTimeout(() => { S.raf = 0; requestAnimationFrame(draw); }, 33); // about 25 flashes a second is plenty
  };

  // Every unit is a dot with a badge above it once zoomed in far enough; badges never overlap. A unit that is a police, fire or EMS
  // service flashes like a lightbar when that service's lights are on. Returns true while something is flashing.
  // Kept cheap on purpose: the label layout is reused until the view, the layers or a unit changes.
  const svcOf = u => u.svc || (u.kind === 'police' ? 'police' : null);
  const drawDots = (ctx, S, proj, k, now) => {
    const L = S.usa.layers, LB = S.usa.lightbars || {}, pat = S.usa.lightPattern || 'mixed', forces = stage ? S.usa.forces : 'all';
    // The stage can show only one kind of force; air bases count with the aircraft. The Zeus map always shows everything.
    const shown = u => forceShown(forces, u.type === 'airbase' ? 'air' : typeOf(u).domain);
    const lo = proj.invert([-30, S.h + 30]), hi = proj.invert([S.w + 30, -30]);
    const [x0, x1] = [Math.min(lo[0], hi[0]) - 0.2, Math.max(lo[0], hi[0]) + 0.2], [y0, y1] = [Math.min(lo[1], hi[1]) - 0.2, Math.max(lo[1], hi[1]) + 0.2];
    const layout = `${S.baseKey}|${Object.entries(L).join()}|${forces}|${S.unitSig}|${[...S.selSet].join()}`;
    const moving = !!S.usa.sim?.running && Object.values(S.units || {}).some(u => u.mv), wantLabels = S.labelKey !== layout || moving, labels = [];
    let flashing = false;
    S.hits = [];
    // Border crossings: a gate marker coloured by its status, and vehicles driving through. Vehicles fade in as they arrive and fade
    // out once they have crossed, in both directions. Positions come from the clock alone, so every screen shows the same traffic.
    if (L.border && k >= 1.6) {
      const t = now / 1000, len = 40, ring = k >= 2.4;
      for (const cx of CROSSING_LIST) {
        if (cx.lon < x0 || cx.lon > x1 || cx.lat < y0 || cx.lat > y1) continue;
        const cs = S.crossings[cx.id], p = proj([cx.lon, cx.lat]); if (!p || !cs) continue;
        const b = cx.bearing * Math.PI / 180, dx = Math.sin(b), dy = -Math.cos(b), ang = Math.atan2(dy, dx);
        if (ring && cs.status !== 'closed' && cs.traffic > 0) {
          const n = Math.max(1, Math.round(cs.traffic / 100 * (2 + cx.size * 2))), T = cs.status === 'slow' ? 22 : 11, w = 4.5;
          flashing = true;
          for (let i = 0; i < n; i++) {
            const into = i % 3 !== 2, u = ((t / T + i / n - cx.lon * 0.37) % 1 + 1) % 1;
            const pos = into ? -len + 2 * len * u : len - 2 * len * u, a = Math.min(1, u / 0.2, (1 - u) / 0.25), truck = i % 4 === 3;
            ctx.save(); ctx.translate(p[0] + dx * pos, p[1] + dy * pos); ctx.rotate(into ? ang : ang + Math.PI);
            ctx.fillStyle = into ? `rgba(232,243,255,${a})` : `rgba(255,207,106,${a})`;
            ctx.fillRect(-w * (truck ? 1.6 : 1), -w * 0.4, w * (truck ? 3.2 : 2), w * 0.8);
            ctx.restore();
          }
          if (cs.status === 'slow') { ctx.fillStyle = 'rgba(255,170,60,.85)'; for (let i = 1; i <= 4; i++) ctx.fillRect(p[0] - dx * len * i * 0.18 - 2, p[1] - dy * len * i * 0.18 - 1.2, 4, 2.4); }
        }
        const col = cs.status === 'closed' ? '#f87171' : cs.status === 'slow' ? '#fbbf24' : '#4ade80', r = 5;
        if (cx.id === S.selX) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p[0], p[1], r + 6, 0, 6.2832); ctx.stroke(); }
        ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(p[0], p[1] - r); ctx.lineTo(p[0] + r, p[1]); ctx.lineTo(p[0], p[1] + r); ctx.lineTo(p[0] - r, p[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
        if (cs.status === 'closed') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(p[0] - r * 0.5, p[1] - r * 0.5); ctx.lineTo(p[0] + r * 0.5, p[1] + r * 0.5); ctx.moveTo(p[0] + r * 0.5, p[1] - r * 0.5); ctx.lineTo(p[0] - r * 0.5, p[1] + r * 0.5); ctx.stroke(); }
        S.hits.push([p[0], p[1], cx.id]);
        if (k >= 4.5) { ctx.font = '500 11px "IBM Plex Sans", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = 'rgba(8,18,36,.8)'; const tw = ctx.measureText(cx.name).width; ctx.fillRect(p[0] - tw / 2 - 3, p[1] + r + 2, tw + 6, 15); ctx.fillStyle = '#e6eefc'; ctx.fillText(cx.name, p[0], p[1] + r + 4); }
      }
    }
    // Units: governors, federal forces, agencies, Guard, state police and the Zeus's own. Their badges are placed before any dot label.
    // A moving unit glides from where the last tick put it, in the direction `mv` says, until the next tick arrives.
    const ulabels = [], posOf = new Map(), glide = S.usa.sim?.running ? Math.min(2.5, (now - (S.recvAt || now)) / 1000) : 0;
    let anyMv = false;
    // Aircraft parked at a base are not drawn; the base shows how many it holds.
    const parked = {}; for (const u of Object.values(S.units || {})) if (u.air === 'parked' && !u.destroyed && !u.hidden) parked[u.base] = (parked[u.base] || 0) + 1;
    for (const u of Object.values(S.units || {})) {
      const kd = USA_UNIT_KINDS[u.kind];
      if (!kd || u.hidden || !L[kd.layer] || k < kd.dot || u.air === 'parked' || !shown(u)) continue;
      const gp = u.mv && glide ? glidePos(u, S.units, glide) : null, lon = gp ? gp[0] : u.lon, lat = gp ? gp[1] : u.lat;
      if (u.mv && glide) anyMv = true;
      posOf.set(u.id, [lon, lat]);
      if (lon < x0 || lon > x1 || lat < y0 || lat > y1) continue;
      const p = proj([lon, lat]); if (!p) continue;
      // Every dot and hull keeps the same size on screen at every zoom.
      const ship = !u.destroyed && typeOf(u).domain === 'sea', r = ship ? HULL_LEN[u.sil] / 2 || 6 : 5, chosen = S.selSet.has(u.id);
      if (chosen) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p[0], p[1], r + 6, 0, 6.2832); ctx.stroke(); }
      let fill = u.destroyed ? '#5b6378' : u.federal ? '#ff6b5a' : u.kind === 'custom' ? sideColor(effSide(u)) : kd.color; const svc = svcOf(u);
      if (svc && LB[svc] && !u.destroyed) {
        flashing = true;
        const h = (u.id.length * 131 + u.id.charCodeAt(u.id.length - 1) * 17) % 9973, def = LIGHT_PATTERNS[pat] || LIGHT_PATTERNS[LIGHT_PATTERN_IDS[h % LIGHT_PATTERN_IDS.length]], cols = lightColors(S.usa, svc, u.owner);
        let total = 0; for (const st of def.steps) total += st[1];
        let t = (now + h * 37) % total, ci = -1;
        for (const st of def.steps) { if (t < st[1]) { ci = st[0]; break; } t -= st[1]; }
        fill = ci >= 0 ? cols[ci % cols.length] : '#2a3144';
      }
      if (u.air === 'flying' && !u.destroyed) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.arc(p[0] + 4, p[1] + 7, r * 0.9, 0, 6.2832); ctx.fill(); } // its shadow on the ground
      if (u.air === 'takeoff' || u.air === 'landing') { const ph = (now / 500) % 1; ctx.strokeStyle = `rgba(143,224,255,${1 - ph})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p[0], p[1], r + 3 + ph * 12, 0, 6.2832); ctx.stroke(); }
      const edge = u.routed ? '#ffffff' : u.control === 'delegate' ? '#ffd166' : 'rgba(0,0,0,.75)';
      if (ship) { if (drawShip(ctx, S, u, p, proj, now, fill, glide, edge)) flashing = true; }
      else if (u.type === 'airbase') { ctx.fillStyle = fill; ctx.fillRect(p[0] - r, p[1] - r, r * 2, r * 2); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.strokeRect(p[0] - r, p[1] - r, r * 2, r * 2); ctx.strokeStyle = '#06101f'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(p[0] - r + 1, p[1] + r - 1); ctx.lineTo(p[0] + r - 1, p[1] - r + 1); ctx.stroke(); }
      else { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(p[0], p[1], u.air === 'flying' ? r + 1 : r, 0, 6.2832); ctx.fill(); }
      if (!ship) { ctx.lineWidth = 2; ctx.strokeStyle = edge; ctx.stroke(); }
      if (u.destroyed) { ctx.strokeStyle = '#ff6a5a'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(p[0] - r, p[1] - r); ctx.lineTo(p[0] + r, p[1] + r); ctx.moveTo(p[0] + r, p[1] - r); ctx.lineTo(p[0] - r, p[1] + r); ctx.stroke(); }
      else if (k >= 2 && (u.strength < 100 || chosen)) {
        const w = 16, f = Math.max(0, u.strength) / 100;
        ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(p[0] - w / 2 - 1, p[1] + r + 2, w + 2, 5);
        ctx.fillStyle = f > 0.6 ? '#5fd08a' : f > 0.3 ? '#ffd166' : '#ff5a4a'; ctx.fillRect(p[0] - w / 2, p[1] + r + 3, w * f, 3);
      }
      S.hits.push([p[0], p[1], u.id]);
      if (k >= kd.label || chosen) ulabels.push([p[0], p[1] - r - 4, unitLabel(u) + (u.type === 'airbase' && parked[u.id] ? ` ✈${parked[u.id]}` : ''), u]);
    }
    // What the picked units are doing: a dashed line to where they are going (green move, blue patrol, red attack, gold escort).
    const proj2 = g => proj(g);
    for (const id of S.selSet) {
      const u = S.units?.[id], o = u?.order, from = posOf.get(id); if (!o || !from) continue;
      const colr = o.type === 'attack' ? '#ff5a4a' : o.type === 'patrol' ? '#4aa8ff' : o.type === 'escort' ? '#ffd166' : '#5fd08a';
      const pts = o.path?.length ? o.path.slice(o.pi || 0) : o.type === 'patrol' ? [o.a, o.b] : o.target ? [posOf.get(o.target) || (S.units[o.target] && [S.units[o.target].lon, S.units[o.target].lat])] : [o.to];
      ctx.strokeStyle = colr; ctx.fillStyle = colr; ctx.lineWidth = 1.6; ctx.setLineDash([6, 5]); ctx.beginPath();
      const p0 = proj2(from); if (!p0) continue; ctx.moveTo(p0[0], p0[1]);
      for (const g of pts) { const q = g && proj2(g); if (q) ctx.lineTo(q[0], q[1]); }
      ctx.stroke(); ctx.setLineDash([]);
      const last = pts[pts.length - 1], q = last && proj2(last); if (q) { ctx.beginPath(); ctx.arc(q[0], q[1], 4, 0, 6.2832); ctx.fill(); }
    }
    // Fighting: a flickering tracer from each firing unit to its target, and a burst on the target.
    let shots = 0;
    for (const u of Object.values(S.units || {})) {
      if (!u.eng || u.destroyed || shots > 150) continue;
      const a = posOf.get(u.id), b = posOf.get(u.eng); if (!a || !b) continue;
      const pa = proj2(a), pb = proj2(b); if (!pa || !pb) continue;
      if ((pa[0] < -50 && pb[0] < -50) || (pa[0] > S.w + 50 && pb[0] > S.w + 50)) continue;
      shots++; flashing = true;
      const ph = ((now / 120) + u.id.length * 7) % 3;
      ctx.strokeStyle = ph < 1.5 ? 'rgba(255,90,70,.95)' : 'rgba(255,220,120,.9)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke();
      ctx.fillStyle = ph < 1 ? 'rgba(255,200,80,.9)' : 'rgba(255,90,60,.7)'; ctx.beginPath(); ctx.arc(pb[0], pb[1], 3 + (ph % 1) * 6, 0, 6.2832); ctx.fill();
    }
    if (anyMv) flashing = true;
    if (S.fxFor !== S.units) { S.fxFor = S.units; if (detect(S, now)) flashing = true; }
    if (drawTrails(ctx, S, proj, now, posOf)) flashing = true;
    if (drawFx(ctx, S, proj, now, posOf)) flashing = true;
    if (S.box) { const b = S.box; ctx.fillStyle = 'rgba(74,168,255,.15)'; ctx.strokeStyle = 'rgba(74,168,255,.9)'; ctx.lineWidth = 1; ctx.fillRect(Math.min(b[0], b[2]), Math.min(b[1], b[3]), Math.abs(b[2] - b[0]), Math.abs(b[3] - b[1])); ctx.strokeRect(Math.min(b[0], b[2]), Math.min(b[1], b[3]), Math.abs(b[2] - b[0]), Math.abs(b[3] - b[1])); }
    // Labels go in priority order (units first, then the layers in order); one that would overlap a placed label is dropped.
    if (wantLabels) {
      const placed = [], grid = new Map(), G = 64;
      ctx.font = '500 11px "IBM Plex Sans", sans-serif';
      for (const [x, y, text, u] of [...ulabels, ...labels]) {
        if (placed.length >= 700) break;
        const w = ctx.measureText(text).width + (u ? 32 : 6), hh = u ? 22 : 14, rx = x - w / 2, ry = y - hh + 1;
        let clash = false;
        for (let gx = Math.floor(rx / G); gx <= Math.floor((rx + w) / G) && !clash; gx++) for (let gy = Math.floor(ry / G); gy <= Math.floor((ry + hh) / G) && !clash; gy++) {
          for (const q of grid.get(`${gx},${gy}`) || []) if (rx < q[0] + q[2] && rx + w > q[0] && ry < q[1] + q[3] && ry + hh > q[1]) { clash = true; break; }
        }
        if (clash) continue;
        const rect = [rx, ry, w, hh];
        for (let gx = Math.floor(rx / G); gx <= Math.floor((rx + w) / G); gx++) for (let gy = Math.floor(ry / G); gy <= Math.floor((ry + hh) / G); gy++) { const k2 = `${gx},${gy}`; (grid.get(k2) || grid.set(k2, []).get(k2)).push(rect); }
        placed.push([rx, ry, w, hh, x, y, text, u]);
      }
      S.labelKey = layout; S.labelDraw = placed;
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.font = '500 11px "IBM Plex Sans", sans-serif';
    for (const [rx, ry, w, hh, x, y, text, u] of S.labelDraw || []) {
      if (!u) { ctx.fillStyle = 'rgba(6,16,31,.78)'; ctx.fillRect(rx, ry, w, hh); ctx.fillStyle = '#eef2fa'; ctx.fillText(text, x, y); continue; }
      // A unit badge: its seal, flag or photo (or a drawn silhouette) and its name.
      const kd = USA_UNIT_KINDS[u.kind], live = S.units?.[u.id] || u;
      roundRect(ctx, rx, ry, w, hh, 6); ctx.fillStyle = 'rgba(8,18,36,.92)'; ctx.fill();
      ctx.lineWidth = live.control === 'delegate' ? 2 : 1; ctx.strokeStyle = live.control === 'delegate' ? '#ffd166' : kd.color; ctx.stroke();
      const cx = rx + 13, cy = ry + hh / 2, redraw2 = () => { S.labelKey = null; redraw(); };
      const photo = live.photo && getImage(live.photo, redraw2), seal = !photo && live.img && getImage(sealUrl(live.img), redraw2);
      if (photo) { ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, 9, 0, 6.2832); ctx.clip(); ctx.drawImage(photo, cx - 9, cy - 9, 18, 18); ctx.restore(); }
      else if (seal) { const s = Math.min(18 / seal.width, 18 / seal.height); ctx.drawImage(seal, cx - seal.width * s / 2, cy - seal.height * s / 2, seal.width * s, seal.height * s); }
      else drawSil(ctx, live.sil, cx, cy, 16, kd.color);
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#eef2fa'; ctx.fillText(text, rx + 25, cy + 0.5);
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    }
    return flashing;
  };
  const redraw = () => { if (!st.current.raf) st.current.raf = requestAnimationFrame(draw); };

  useEffect(() => {
    let dead = false;
    loadUsa().then(d => { if (dead) return; st.current.data = d; redraw(); });
    const c = cv.current, ro = new ResizeObserver(() => {
      const r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      st.current.w = r.width; st.current.h = r.height; st.current.baseKey = null;
      for (const el of [c, ov.current]) { el.width = Math.round(r.width * dpr); el.height = Math.round(r.height * dpr); }
      redraw();
    });
    ro.observe(c);
    return () => { dead = true; ro.disconnect(); cancelAnimationFrame(st.current.raf); clearTimeout(st.current.raf); clearTimeout(st.current.settle); };
  }, []);
  useEffect(() => { st.current.want = { ...USA_VIEW, ...view }; if (!st.current.data) return; redraw(); }, [view?.lon, view?.lat, view?.k]);
  useEffect(redraw, [selectedUnit, selectedUnits, usa, usa.forces, usa.mods, usa.custom, Object.entries(usa.layers).join(), Object.entries(usa.lightbars || {}).join(), usa.lightPattern, JSON.stringify(usa.lightColors || {}), (usa.highlight || []).join(',')]);

  // Pointer handling for the Zeus panel: drag to pan, wheel to zoom around the cursor, click to pick a state.
  useEffect(() => {
    const c = cv.current;
    // A small overview map has no dragging of its own: a click on it sends the main view there.
    if (!interactive) {
      if (!onMapClick) return;
      const click = e => {
        const S = st.current; if (!S.data) return;
        const r = c.getBoundingClientRect(), g = viewProjection(baseProjection(S.data, S.w, S.h), S.want, S.w, S.h).invert([e.clientX - r.left, e.clientY - r.top]);
        if (g) onMapClick({ lon: g[0], lat: g[1] });
      };
      c.addEventListener('pointerdown', click); return () => c.removeEventListener('pointerdown', click);
    }
    const setup = () => { const S = st.current, base = baseProjection(S.data, S.w, S.h); return { S, base, t0: base.translate() }; };
    // Moves the view so the geographic point `g` sits under screen position `m` at zoom `k`.
    const anchor = (g, m, k) => {
      const { S, base } = setup(), gp = base(g), t0 = base.translate();
      const cp = [gp[0] - (m[0] - S.w / 2) / k, gp[1] - (m[1] - S.h / 2) / k];
      void t0;
      const ll = base.invert(cp);
      return ll ? { lon: ll[0], lat: ll[1], k } : null;
    };
    const cur = () => st.current.want;
    const pos = e => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const commit = v => { if (!v) return; Object.assign(st.current.want, v); st.current.directAt = performance.now(); redraw(); st.current.onView?.({ ...st.current.want }); };
    const geoAt = m => { const S = st.current; return viewProjection(baseProjection(S.data, S.w, S.h), cur(), S.w, S.h).invert(m); };
    let drag = null, moved = 0;
    // Grabbing the stage mid-glide holds the map where it is on screen, not where the glide was heading.
    const grab = () => { const S = st.current; if (stage && S.vel) { Object.assign(S.want, S.cur); S.vel = null; } };
    const down = e => {
      if (!st.current.data || e.button === 2) return;
      grab();
      drag = { m: pos(e), g: geoAt(pos(e)), box: e.shiftKey && !st.current.hoverUnit }; moved = 0; c.setPointerCapture(e.pointerId);
    };
    // Right-click is the RTS order: on a unit it means attack or escort, anywhere else it means go there.
    const ctxMenu = e => {
      e.preventDefault();
      const o = st.current.onOrder; if (!o || !st.current.data) return;
      const g = geoAt(pos(e)); if (g) o({ queue: e.shiftKey, lon: g[0], lat: g[1], target: st.current.hoverUnit && st.current.units[st.current.hoverUnit] ? st.current.hoverUnit : null });
    };
    const move = e => {
      if (!st.current.data) return;
      const m = pos(e);
      if (drag?.box) { st.current.box = [drag.m[0], drag.m[1], m[0], m[1]]; redraw(); return; }
      if (drag) { moved += Math.abs(e.movementX) + Math.abs(e.movementY); if (drag.g) commit(anchor(drag.g, m, cur().k)); return; }
      let uh = null, ud = 12;
      for (const h of st.current.hits || []) { const d = Math.hypot(h[0] - m[0], h[1] - m[1]); if (d < ud) { ud = d; uh = h[2]; } }
      if (uh !== st.current.hoverUnit) { st.current.hoverUnit = uh; const u = uh && (st.current.units[uh] || st.current.crossings?.[uh]); c.title = u ? `${u.name}${u.person ? ` — ${u.person}` : ''}` : ''; c.style.cursor = uh ? 'pointer' : ''; }
      if (uh) return;
      const S = st.current, v = cur();
      if (!S.bp) return;
      const o = S.bp.p([v.lon, v.lat]), hit = stateAt(S, [(m[0] - S.w / 2) / v.k + o[0], (m[1] - S.h / 2) / v.k + o[1]]);
      if (hit !== st.current.hover) { st.current.hover = hit; c.title = hit ? st.current.data.byState.get(hit).name : ''; redraw(); }
    };
    const up = e => {
      if (drag?.box) {
        const b = st.current.box; st.current.box = null;
        if (b) { const x0 = Math.min(b[0], b[2]), x1 = Math.max(b[0], b[2]), y0 = Math.min(b[1], b[3]), y1 = Math.max(b[1], b[3]); st.current.onBox?.((st.current.hits || []).filter(h => !h[2].startsWith('bx-') && h[0] >= x0 && h[0] <= x1 && h[1] >= y0 && h[1] <= y1).map(h => h[2])); }
        drag = null; redraw(); try { c.releasePointerCapture(e.pointerId); } catch {} return;
      }
      if (drag && moved < 4) { if (st.current.onPlace) { const g = geoAt(pos(e)); if (g) st.current.onPlace(g[0], g[1]); } else if (st.current.hoverUnit) st.current.onPickUnit?.(st.current.hoverUnit, e.shiftKey || e.ctrlKey || e.metaKey); else if (st.current.hover) st.current.onPick?.(st.current.hover); } drag = null; try { c.releasePointerCapture(e.pointerId); } catch {} };
    const wheel = e => {
      e.preventDefault();
      if (!st.current.data) return;
      grab();
      const m = pos(e), g = geoAt(m);
      const k = Math.max(1, Math.min(USA_MAX_ZOOM, cur().k * Math.exp(-e.deltaY * 0.0015)));
      if (g) commit(anchor(g, m, k));
    };
    c.addEventListener('pointerdown', down); c.addEventListener('pointermove', move); c.addEventListener('pointerup', up); c.addEventListener('wheel', wheel, { passive: false }); c.addEventListener('contextmenu', ctxMenu);
    return () => { c.removeEventListener('contextmenu', ctxMenu); c.removeEventListener('pointerdown', down); c.removeEventListener('pointermove', move); c.removeEventListener('pointerup', up); c.removeEventListener('wheel', wheel); };
  }, [interactive, !!onMapClick]);

  return html`<div class="us-wrap"><canvas ref=${cv} class=${cls('us-canvas', className, interactive && 'interactive')}></canvas><canvas ref=${ov} class="us-canvas us-over"></canvas></div>`;
}
