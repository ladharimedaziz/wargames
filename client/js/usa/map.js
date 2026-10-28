// The continental US map: states, counties and highways drawn on a canvas. The stage follows the Zeus's view;
// on the Zeus panel it can be dragged and zoomed (`interactive`).
import { feature, mesh } from 'topojson-client';
import { geoAlbers, geoPath, geoCentroid, geoContains } from 'd3-geo';
import { html, useRef, useEffect, cls } from '../lib.js';
import { USA_VIEW, USA_MAX_ZOOM } from '/shared/engine/usa.js';

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

const COL = { sea: '#06101f', land: '#142640', hi: '#2a4f86', county: 'rgba(120,160,215,.16)', state: 'rgba(190,215,255,.7)', coast: 'rgba(190,215,255,.85)', i: '#f3b24a', u: 'rgba(200,170,120,.7)', label: '#dfe9fb', hover: 'rgba(255,255,255,.14)' };

// `view` is the view to show, `onView` is called as the viewer drags or zooms, `onPick` with a state code on click.
export function UsMap({ usa, view, onView, onPick, interactive = false, className = '' }) {
  const cv = useRef(), st = useRef({ data: null, w: 0, h: 0, cur: { ...USA_VIEW }, want: { ...USA_VIEW }, hover: null, raf: 0, onView, onPick, usa });
  st.current.onView = onView; st.current.onPick = onPick; st.current.usa = usa;

  const draw = () => {
    const S = st.current, c = cv.current;
    S.raf = 0;
    if (!c || !S.data || !S.w) return;
    const dpr = window.devicePixelRatio || 1, ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Glide towards the wanted view on the stage; the Zeus panel jumps straight there.
    const w = S.want, v = S.cur;
    if (interactive) Object.assign(v, w);
    else {
      const a = 0.18;
      v.lon += (w.lon - v.lon) * a; v.lat += (w.lat - v.lat) * a; v.k += (w.k - v.k) * a;
      if (Math.abs(w.lon - v.lon) + Math.abs(w.lat - v.lat) + Math.abs(w.k - v.k) < 1e-3 * Math.max(1, v.k)) Object.assign(v, w); else if (!S.raf) S.raf = requestAnimationFrame(draw);
    }
    const base = baseProjection(S.data, S.w, S.h), proj = viewProjection(base, v, S.w, S.h), path = geoPath(proj, ctx);
    const L = S.usa.layers, k = v.k;
    ctx.fillStyle = COL.sea; ctx.fillRect(0, 0, S.w, S.h);
    ctx.beginPath(); path(S.data.nation); ctx.fillStyle = COL.land; ctx.fill();
    const hi = new Set(S.usa.highlight || []);
    if (hi.size) { ctx.beginPath(); for (const s of S.data.states) if (hi.has(s.id)) path(s.f); ctx.fillStyle = COL.hi; ctx.fill(); }
    if (S.hover && S.hover !== null) { const s = S.data.byState.get(S.hover); if (s) { ctx.beginPath(); path(s.f); ctx.fillStyle = COL.hover; ctx.fill(); } }
    if (L.counties) { ctx.beginPath(); path(S.data.countyMesh); ctx.strokeStyle = COL.county; ctx.lineWidth = k < 2 ? 0.4 : k < 8 ? 0.6 : 0.9; ctx.stroke(); }
    if (L.highways) {
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      const draw = (list, color, wd) => { ctx.beginPath(); for (const l of list) path({ type: 'LineString', coordinates: l.coordinates }); ctx.strokeStyle = color; ctx.lineWidth = wd; ctx.stroke(); };
      if (k >= 1.6) draw(S.data.highways, COL.u, k > 6 ? 1.2 : 0.7);
      draw(S.data.interstates, COL.i, k > 6 ? 2 : k > 2.5 ? 1.4 : 0.9);
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
  const redraw = () => { if (!st.current.raf) st.current.raf = requestAnimationFrame(draw); };

  useEffect(() => {
    let dead = false;
    loadUsa().then(d => { if (dead) return; st.current.data = d; redraw(); });
    const c = cv.current, ro = new ResizeObserver(() => {
      const r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      st.current.w = r.width; st.current.h = r.height; c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); redraw();
    });
    ro.observe(c);
    return () => { dead = true; ro.disconnect(); cancelAnimationFrame(st.current.raf); };
  }, []);
  useEffect(() => { st.current.want = { ...USA_VIEW, ...view }; if (!st.current.data) return; redraw(); }, [view?.lon, view?.lat, view?.k]);
  useEffect(redraw, [usa.layers.counties, usa.layers.states, usa.layers.highways, usa.layers.labels, (usa.highlight || []).join(',')]);

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
      const g = geoAt(m); let hit = null;
      if (g) for (const s of st.current.data.states) if (geoContains(s.f, g)) { hit = s.id; break; }
      if (hit !== st.current.hover) { st.current.hover = hit; c.title = hit ? st.current.data.byState.get(hit).name : ''; redraw(); }
    };
    const up = e => { if (drag && moved < 4 && st.current.hover) st.current.onPick?.(st.current.hover); drag = null; try { c.releasePointerCapture(e.pointerId); } catch {} };
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

  return html`<canvas ref=${cv} class=${cls('us-canvas', className, interactive && 'interactive')}></canvas>`;
}
