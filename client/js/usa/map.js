// The continental US map: states, counties and highways drawn on a canvas. The stage follows the Zeus's view;
// on the Zeus panel it can be dragged and zoomed (`interactive`).
import { feature, mesh } from 'topojson-client';
import { geoAlbers, geoPath, geoCentroid, geoContains } from 'd3-geo';
import { html, useRef, useEffect, useMemo, cls } from '../lib.js';
import { drawSil, getImage, sealUrl } from './art.js';
import { USA_VIEW, USA_MAX_ZOOM, USA_DOTS, USA_UNIT_KINDS, MIL_COLORS, LIGHT_PATTERNS, LIGHT_PATTERN_IDS, lightColors, getUnits } from '/shared/engine/usa.js';

let loading = null;
// Loads and indexes the two map files once.
export function loadUsa() {
  loading ||= Promise.all([fetch('/client/data/us-counties.json').then(r => r.json()), fetch('/client/data/us-roads.json').then(r => r.json())]).then(([topo, rd]) => {
    const states = feature(topo, topo.objects.states).features.map(f => ({ f, id: f.id, name: f.properties.name, centroid: geoCentroid(f) }));
    const counties = feature(topo, topo.objects.counties).features.map(f => ({ f, id: f.id, name: f.properties.name, state: f.properties.state, centroid: geoCentroid(f) }));
    const lines = (list, type) => list.flatMap(([name, ls]) => ls.map(d => {
      let x = d[0], y = d[1]; const coordinates = [[x / 1000, y / 1000]];
      for (let i = 2; i < d.length; i += 2) { x += d[i]; y += d[i + 1]; coordinates.push([x / 1000, y / 1000]); }
      return { type, name, coordinates };
    }));
    return {
      states, counties,
      byState: new Map(states.map(s => [s.id, s])),
      nation: { type: 'FeatureCollection', features: states.map(s => s.f) },
      countyMesh: mesh(topo, topo.objects.counties, (a, b) => a !== b),
      stateMesh: mesh(topo, topo.objects.states, (a, b) => a !== b),
      outline: mesh(topo, topo.objects.states, (a, b) => a === b),
      interstates: lines(rd.i, 'i'), highways: lines(rd.u, 'u'),
    };
  });
  return loading;
}

// The Albers projection with the lower 48 fitted into w x h at zoom 1. A view {lon, lat, k} puts that point in the middle at zoom k.
function baseProjection(data, w, h) {
  return geoAlbers().rotate([96, 0]).center([0, 38.5]).parallels([29.5, 45.5]).fitExtent([[w * 0.03, h * 0.05], [w * 0.97, h * 0.95]], data.nation);
}
function viewProjection(base, view, w, h) {
  const t0 = base.translate(), s0 = base.scale(), p = base([view.lon, view.lat]);
  return geoAlbers().rotate([96, 0]).center([0, 38.5]).parallels([29.5, 45.5]).scale(s0 * view.k)
    .translate([w / 2 - (p[0] - t0[0]) * view.k, h / 2 - (p[1] - t0[1]) * view.k]).clipExtent([[-20, -20], [w + 20, h + 20]]);
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

// One file per dot layer, fetched the first time a layer is shown. Rows: [lon, lat, name, city, county index, extra].
const pts = new Map(), ptsLoading = new Map();
export function loadPoints(kind) {
  if (pts.has(kind)) return Promise.resolve(pts.get(kind));
  if (!ptsLoading.has(kind)) ptsLoading.set(kind, fetch(`/client/data/us-points-${kind}.json`).then(r => r.json()).then(list => { pts.set(kind, list); return list; }));
  return ptsLoading.get(kind);
}

const COL = { sea: '#06101f', land: '#142640', hi: '#2a4f86', county: 'rgba(120,160,215,.16)', state: 'rgba(190,215,255,.7)', coast: 'rgba(190,215,255,.85)', i: '#f3b24a', u: 'rgba(200,170,120,.7)', label: '#dfe9fb', hover: 'rgba(255,255,255,.14)' };

// `view` is the view to show, `onView` is called as the viewer drags or zooms, `onPick` with a state code on click.
// What a unit's badge says.
export const unitLabel = u => (u.kind === 'governor' ? `${u.owner === 'DC' ? 'Mayor' : 'Gov.'} ${u.person}${u.party ? ` (${u.party})` : ''}` : u.federal ? `${u.short} · federal` : u.short);
const roundRect = (ctx, x, y, w, h, r) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); };

export function UsMap({ usa, view, onView, onPick, onPickUnit, onPlace, selectedUnit = null, interactive = false, className = '' }) {
  const cv = useRef(), ov = useRef(), st = useRef({ data: null, w: 0, h: 0, cur: { ...USA_VIEW }, want: { ...USA_VIEW }, hover: null, raf: 0, onView, onPick, usa });
  st.current.onView = onView; st.current.onPick = onPick; st.current.onPickUnit = onPickUnit; st.current.onPlace = onPlace; st.current.usa = usa; st.current.selUnit = selectedUnit;
  st.current.units = useMemo(() => getUnits(usa), [usa.mods, usa.custom]);
  st.current.unitSig = useMemo(() => { let h = 0; for (const ch of JSON.stringify([usa.mods, usa.custom])) h = (h * 31 + ch.charCodeAt(0)) | 0; return h; }, [usa.mods, usa.custom]); // changes whenever a unit is edited, so badges re-lay out


  // The terrain, roads, borders and names are painted into an off-screen canvas that is reused while the view and layers stay the
  // same, so flashing lightbars only repaint the dots on top.
  const paintBase = (ctx, S, proj, k) => {
    const path = geoPath(proj, ctx), L = S.usa.layers;
    ctx.fillStyle = COL.sea; ctx.fillRect(0, 0, S.w, S.h);
    ctx.beginPath(); path(S.data.nation); ctx.fillStyle = COL.land; ctx.fill();
    const hi = new Set(S.usa.highlight || []);
    if (hi.size) { ctx.beginPath(); for (const s of S.data.states) if (hi.has(s.id)) path(s.f); ctx.fillStyle = COL.hi; ctx.fill(); }
    if (S.hover) { const s = S.data.byState.get(S.hover); if (s) { ctx.beginPath(); path(s.f); ctx.fillStyle = COL.hover; ctx.fill(); } }
    if (L.counties) { ctx.beginPath(); path(S.data.countyMesh); ctx.strokeStyle = COL.county; ctx.lineWidth = k < 2 ? 0.4 : k < 8 ? 0.6 : 0.9; ctx.stroke(); }
    if (L.cities && k >= 2) {
      if (!cityData) loadCities().then(() => { S.baseKey = null; redraw(); });
      else {
        ctx.beginPath(); path(cityData.all); ctx.fillStyle = 'rgba(255,196,120,.10)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,196,120,.7)'; ctx.lineWidth = k < 6 ? 0.6 : 1.1; ctx.stroke();
        if (L.labels && k >= 5) {
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `500 ${Math.round(Math.min(14, 9 + k * 0.1))}px "IBM Plex Sans", sans-serif`;
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
      const road = (list, color, wd) => { ctx.beginPath(); for (const l of list) path({ type: 'LineString', coordinates: l.coordinates }); ctx.strokeStyle = color; ctx.lineWidth = wd; ctx.stroke(); };
      if (k >= 1.6) road(S.data.highways, COL.u, k > 6 ? 1.2 : 0.7);
      road(S.data.interstates, COL.i, k > 6 ? 2 : k > 2.5 ? 1.4 : 0.9);
    }
    if (L.states) { ctx.beginPath(); path(S.data.stateMesh); ctx.strokeStyle = COL.state; ctx.lineWidth = k < 4 ? 1.1 : 1.8; ctx.stroke(); }
    ctx.beginPath(); path(S.data.outline); ctx.strokeStyle = COL.coast; ctx.lineWidth = 1.2; ctx.stroke();
    if (L.labels) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = COL.label;
      if (k < 9) {
        ctx.font = `600 ${Math.round(Math.min(26, 11 + k * 1.2))}px "IBM Plex Sans Condensed", sans-serif`;
        for (const s of S.data.states) { const p = proj(s.centroid); if (p && p[0] > 0 && p[0] < S.w && p[1] > 0 && p[1] < S.h) ctx.fillText(s.id, p[0], p[1]); }
      }
      if (k >= 7) {
        ctx.font = `500 ${Math.round(Math.min(15, 9 + k * 0.12))}px "IBM Plex Sans", sans-serif`; ctx.fillStyle = 'rgba(223,233,251,.82)';
        for (const co of S.data.counties) { const p = proj(co.centroid); if (p && p[0] > 20 && p[0] < S.w - 20 && p[1] > 10 && p[1] < S.h - 10) ctx.fillText(co.name, p[0], p[1]); }
      }
    }
  };

  const draw = () => {
    const S = st.current, c = cv.current;
    S.raf = 0;
    if (!c || !S.data || !S.w) return;
    const dpr = window.devicePixelRatio || 1, ctx = c.getContext('2d', { alpha: false });
    // Glide towards the wanted view on the stage; the Zeus panel jumps straight there.
    const w = S.want, v = S.cur;
    let moving = false;
    if (interactive) Object.assign(v, w);
    else {
      const a = 0.18;
      v.lon += (w.lon - v.lon) * a; v.lat += (w.lat - v.lat) * a; v.k += (w.k - v.k) * a;
      if (Math.abs(w.lon - v.lon) + Math.abs(w.lat - v.lat) + Math.abs(w.k - v.k) < 1e-3 * Math.max(1, v.k)) Object.assign(v, w); else moving = true;
    }
    if (!S.bp || S.bp.w !== S.w || S.bp.h !== S.h) S.bp = { w: S.w, h: S.h, p: baseProjection(S.data, S.w, S.h) };
    const proj = viewProjection(S.bp.p, v, S.w, S.h), k = v.k, L = S.usa.layers;
    const key = [v.lon.toFixed(5), v.lat.toFixed(5), k.toFixed(4), S.w, S.h, dpr, L.states, L.counties, L.cities, L.highways, L.labels, (S.usa.highlight || []).join(), S.hover].join('|');
    // The map itself lives on the bottom canvas and is repainted only when the view or layers change; the dots live on a canvas
    // above it, cleared and redrawn every frame, so flashing never repaints the map.
    if (S.baseKey !== key) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); paintBase(ctx, S, proj, k); S.baseKey = key; }
    const octx = ov.current.getContext('2d');
    octx.setTransform(1, 0, 0, 1, 0, 0); octx.clearRect(0, 0, ov.current.width, ov.current.height); octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const flashing = drawDots(octx, S, proj, k, performance.now());
    if (moving && !S.raf) S.raf = requestAnimationFrame(draw);
    else if (flashing && !S.raf) S.raf = setTimeout(() => { S.raf = 0; requestAnimationFrame(draw); }, 33); // about 25 flashes a second is plenty
  };

  // Dots for every shown layer, with a small label above each once zoomed in far enough. Labels never overlap.
  // Police, fire and EMS dots flash like lightbars when theirs are on. Returns true while something is flashing.
  // Kept cheap on purpose: dots are batched into one path per colour, at most MAX_BAR flashing dots are drawn (thinned evenly when
  // more are in view), the glow is dropped when crowded, and the label layout is reused until the view or layers change.
  const MAX_BAR = 1000;
  const drawDots = (ctx, S, proj, k, now) => {
    const L = S.usa.layers, LB = S.usa.lightbars || {}, pat = S.usa.lightPattern || 'mixed';
    const lo = proj.invert([-30, S.h + 30]), hi = proj.invert([S.w + 30, -30]);
    const [x0, x1] = [Math.min(lo[0], hi[0]) - 0.2, Math.max(lo[0], hi[0]) + 0.2], [y0, y1] = [Math.min(lo[1], hi[1]) - 0.2, Math.max(lo[1], hi[1]) + 0.2];
    const sig = JSON.stringify(S.usa.lightColors || {});
    if (S.lbSig !== sig) { S.lbSig = sig; S.lbCache = new Map(); }
    const layout = `${pts.size}|${S.baseKey}|${Object.entries(L).join()}|${Object.entries(LB).join()}|${S.unitSig}|${S.selUnit}`;
    const wantLabels = S.labelKey !== layout, labels = [];
    let flashing = false;
    for (const [kind, d] of Object.entries(USA_DOTS)) {
      const bar = !!LB[kind];
      if (!(L[kind] || bar) || k < (bar ? Math.min(d.dot, 3) : d.dot)) continue;
      const list = pts.get(kind);
      if (!list) { loadPoints(kind).then(redraw); continue; }
      const r = Math.min(7, 2 + k * 0.12) + (bar ? 1 : 0), withLabel = k >= d.label;
      let stride = 1;
      if (bar) {
        let n = 0; for (const row of list) if (row[0] >= x0 && row[0] <= x1 && row[1] >= y0 && row[1] <= y1) n++;
        stride = Math.max(1, Math.ceil(n / MAX_BAR));
      }
      const groups = new Map(); // colour -> screen points
      for (const row of list) {
        const lon = row[0], lat = row[1];
        if (lon < x0 || lon > x1 || lat < y0 || lat > y1) continue;
        const h = ((Math.round(lon * 1e4) * 31 + Math.round(lat * 1e4)) >>> 0) % 9973;
        if (bar && h % stride) continue;
        const p = proj([lon, lat]); if (!p) continue;
        let fill = kind === 'military' ? MIL_COLORS[row[5]] || d.color : d.color;
        if (bar) {
          flashing = true;
          const cc = S.data.counties[row[4]], ck = `${kind}|${row[4]}`;
          let cols = S.lbCache.get(ck);
          if (!cols) S.lbCache.set(ck, cols = lightColors(S.usa, kind, cc.state, cc.id));
          const def = LIGHT_PATTERNS[pat] || LIGHT_PATTERNS[LIGHT_PATTERN_IDS[h % LIGHT_PATTERN_IDS.length]];
          let total = 0; for (const st of def.steps) total += st[1];
          let t = (now + h * 37) % total, ci = -1;
          for (const st of def.steps) { if (t < st[1]) { ci = st[0]; break; } t -= st[1]; }
          fill = ci >= 0 ? cols[ci % cols.length] : '#2a3144';
        }
        (groups.get(fill) || groups.set(fill, []).get(fill)).push(p);
        if (wantLabels && withLabel && row[2]) labels.push([p[0], p[1] - r - 3, row[2]]);
      }
      const crowded = bar && stride > 1 || [...groups.values()].reduce((n, g) => n + g.length, 0) > 400;
      for (const [fill, g] of groups) {
        if (bar && !crowded && fill !== '#2a3144') { // glow
          ctx.globalAlpha = 0.28; ctx.fillStyle = fill; ctx.beginPath();
          for (const p of g) { ctx.moveTo(p[0] + r * 2.4, p[1]); ctx.arc(p[0], p[1], r * 2.4, 0, 6.2832); }
          ctx.fill(); ctx.globalAlpha = 1;
        }
        ctx.fillStyle = fill; ctx.beginPath();
        for (const p of g) { ctx.moveTo(p[0] + r, p[1]); ctx.arc(p[0], p[1], r, 0, 6.2832); }
        ctx.fill();
        if (!crowded) { ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.stroke(); }
      }
    }
    // Units: governors, federal forces, agencies, Guard and state police. Their badges are placed before any dot label.
    const ulabels = [];
    S.hits = [];
    for (const u of Object.values(S.units || {})) {
      const kd = USA_UNIT_KINDS[u.kind];
      if (!kd || u.hidden || !L[kd.layer] || k < kd.dot) continue;
      if (u.lon < x0 || u.lon > x1 || u.lat < y0 || u.lat > y1) continue;
      const p = proj([u.lon, u.lat]); if (!p) continue;
      const r = Math.min(8, 3.5 + k * 0.1), chosen = u.id === S.selUnit;
      if (chosen) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p[0], p[1], r + 6, 0, 6.2832); ctx.stroke(); }
      ctx.fillStyle = u.federal ? '#ff6b5a' : kd.color; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 6.2832); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = u.control === 'delegate' ? '#ffd166' : 'rgba(0,0,0,.75)'; ctx.stroke();
      S.hits.push([p[0], p[1], u.id]);
      if (k >= kd.label || chosen) ulabels.push([p[0], p[1] - r - 4, unitLabel(u), u]);
    }
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
    return () => { dead = true; ro.disconnect(); cancelAnimationFrame(st.current.raf); clearTimeout(st.current.raf); };
  }, []);
  useEffect(() => { st.current.want = { ...USA_VIEW, ...view }; if (!st.current.data) return; redraw(); }, [view?.lon, view?.lat, view?.k]);
  useEffect(redraw, [selectedUnit, usa.mods, usa.custom, Object.entries(usa.layers).join(), Object.entries(usa.lightbars || {}).join(), usa.lightPattern, JSON.stringify(usa.lightColors || {}), (usa.highlight || []).join(',')]);

  // Pointer handling for the Zeus panel: drag to pan, wheel to zoom around the cursor, click to pick a state.
  useEffect(() => {
    if (!interactive) return;
    const c = cv.current;
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
    const commit = v => { if (!v) return; Object.assign(st.current.want, v); redraw(); st.current.onView?.({ ...st.current.want }); };
    const geoAt = m => { const S = st.current; return viewProjection(baseProjection(S.data, S.w, S.h), cur(), S.w, S.h).invert(m); };
    let drag = null, moved = 0;
    const down = e => { if (!st.current.data) return; drag = { m: pos(e), g: geoAt(pos(e)) }; moved = 0; c.setPointerCapture(e.pointerId); };
    const move = e => {
      if (!st.current.data) return;
      const m = pos(e);
      if (drag) { moved += Math.abs(e.movementX) + Math.abs(e.movementY); if (drag.g) commit(anchor(drag.g, m, cur().k)); return; }
      let uh = null, ud = 12;
      for (const h of st.current.hits || []) { const d = Math.hypot(h[0] - m[0], h[1] - m[1]); if (d < ud) { ud = d; uh = h[2]; } }
      if (uh !== st.current.hoverUnit) { st.current.hoverUnit = uh; const u = uh && st.current.units[uh]; c.title = u ? `${u.name}${u.person ? ` — ${u.person}` : ''}` : ''; c.style.cursor = uh ? 'pointer' : ''; }
      if (uh) return;
      const g = geoAt(m); let hit = null;
      if (g) for (const s of st.current.data.states) if (geoContains(s.f, g)) { hit = s.id; break; }
      if (hit !== st.current.hover) { st.current.hover = hit; c.title = hit ? st.current.data.byState.get(hit).name : ''; redraw(); }
    };
    const up = e => { if (drag && moved < 4) { if (st.current.onPlace) { const g = geoAt(pos(e)); if (g) st.current.onPlace(g[0], g[1]); } else if (st.current.hoverUnit) st.current.onPickUnit?.(st.current.hoverUnit); else if (st.current.hover) st.current.onPick?.(st.current.hover); } drag = null; try { c.releasePointerCapture(e.pointerId); } catch {} };
    const wheel = e => {
      e.preventDefault();
      if (!st.current.data) return;
      const m = pos(e), g = geoAt(m);
      const k = Math.max(1, Math.min(USA_MAX_ZOOM, cur().k * Math.exp(-e.deltaY * 0.0015)));
      if (g) commit(anchor(g, m, k));
    };
    c.addEventListener('pointerdown', down); c.addEventListener('pointermove', move); c.addEventListener('pointerup', up); c.addEventListener('wheel', wheel, { passive: false });
    return () => { c.removeEventListener('pointerdown', down); c.removeEventListener('pointermove', move); c.removeEventListener('pointerup', up); c.removeEventListener('wheel', wheel); };
  }, [interactive]);

  return html`<div class="us-wrap"><canvas ref=${cv} class=${cls('us-canvas', className, interactive && 'interactive')}></canvas><canvas ref=${ov} class="us-canvas us-over"></canvas></div>`;
}
