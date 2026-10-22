// The live world map, drawn on two canvases: a base layer (countries, borders, airspace) redrawn only when
// something changes, and an effects layer animated every frame (traffic, units, strikes, battles).
import { geoEqualEarth, geoPath, geoGraticule10, geoInterpolate } from 'd3-geo';
import { SEA_ZONES } from '/shared/data/places.js';
import { relation } from '/shared/engine/core.js';
import { loadAtlas, makeCountryAt } from './atlas.js';
import { AirTraffic, SeaTraffic } from './traffic.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function hatch(color, size = 7, width = 1.4) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'); x.strokeStyle = color; x.lineWidth = width;
  x.beginPath(); x.moveTo(-1, size + 1); x.lineTo(size + 1, -1); x.moveTo(-1, 1); x.lineTo(1, -1); x.moveTo(size - 1, size + 1); x.lineTo(size + 1, size - 1); x.stroke();
  return c;
}

export class WorldMap {
  constructor(el, opts = {}) {
    this.el = el;
    this.opts = { interactive: false, cinematic: false, lang: 'en', ...opts };
    this.base = document.createElement('canvas');
    this.fx = document.createElement('canvas');
    for (const c of [this.base, this.fx]) { c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block'; el.appendChild(c); }
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    this.bctx = this.base.getContext('2d');
    this.fctx = this.fx.getContext('2d');
    this.cam = { k: 1, x: 0, y: 0 };
    this.camTarget = { k: 1, x: 0, y: 0 };
    this.effects = [];
    this.state = null;
    this.selected = null;
    this.hover = null;
    this.dirty = true;
    this.layers = { air: true, naval: true, units: true, relations: false, labels: true, wars: true };
    this.lastRes = 0;
    this.flash = null;
    this.highlights = [];
    this.scars = [];
    this.ready = this.init();
  }

  async init() {
    const { lo, hi } = await loadAtlas();
    this.atlas = { lo, hi };
    this.countryAt = makeCountryAt(lo);
    this.air = new AirTraffic(this.countryAt);
    this.sea = new SeaTraffic();
    this.patterns = {};
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.el);
    if (this.opts.interactive) this.bindInput();
    this.t0 = performance.now();
    this.last = this.t0;
    const loop = now => { if (this.destroyed) return; this.frame(now); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
    if (this.state) this.setState(this.state);
  }

  destroy() { this.destroyed = true; cancelAnimationFrame(this.raf); this.ro?.disconnect(); this.el.innerHTML = ''; }

  resize() {
    const r = this.el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.w = r.width; this.h = r.height; this.dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const c of [this.base, this.fx]) { c.width = Math.round(this.w * this.dpr); c.height = Math.round(this.h * this.dpr); }
    // Frame the inhabited world (Antarctica cropped) so the map fills the screen.
    this.projection = geoEqualEarth().rotate([-12, 0]).fitExtent([[10, 10], [this.w - 10, this.h - 10]], { type: 'MultiPoint', coordinates: [[-168, 0], [192, 0], [12, 83], [12, -57], [-160, 70], [180, 70], [-160, -50], [180, -50]] });
    this.buildPaths();
    this.dirty = true;
    this.applyFocus(true);
  }

  buildPaths() {
    const proj = this.projection;
    const mk = obj => { const p = new Path2D(); geoPath(proj, p)(obj); return p; };
    this.sphere = mk({ type: 'Sphere' });
    this.graticule = mk(geoGraticule10());
    for (const key of ['lo', 'hi']) {
      const A = this.atlas[key];
      A.paths = new Map(A.countries.map(c => [c.id, mk(c.feature)]));
      A.borderPath = mk(A.borders);
      A.coastPath = mk(A.coast);
    }
    this.bounds = new Map(this.atlas.lo.countries.map(c => {
      // Bounds of the main landmass only, so France is not framed together with French Guiana.
      const main = c.parts.reduce((a, b) => (b.area > a.area ? b : a));
      const b = geoPath(proj).bounds(main.f);
      return [c.id, b];
    }));
    this.centroids = new Map(this.atlas.lo.countries.map(c => [c.id, proj(c.centroid)]));
  }

  // --- coordinates ---
  p(lon, lat) { const q = this.projection([lon, lat]); return q ? [q[0] * this.cam.k + this.cam.x, q[1] * this.cam.k + this.cam.y] : null; }
  pt(o) { return o ? this.p(o.lon, o.lat) : null; }
  countryPoint(id) {
    const c = this.state?.countries?.[id];
    if (c) return this.p(c.lon, c.lat);
    const q = this.centroids.get(id); return q ? [q[0] * this.cam.k + this.cam.x, q[1] * this.cam.k + this.cam.y] : null;
  }
  screenToLonLat(x, y) { return this.projection.invert([(x - this.cam.x) / this.cam.k, (y - this.cam.y) / this.cam.k]); }

  // --- state ---
  setState(state, extra = {}) {
    const prev = this.state;
    this.state = state;
    if (!this.atlas || !state || state.mode !== 'world') return;
    if (extra.layers) this.layers = { ...this.layers, ...extra.layers };
    this.air.sync(state);
    this.sea.sync(state);
    this.dirty = true;
    const res = state.lastResolution;
    if (res && res.at !== this.lastRes) {
      // Only animate resolutions that arrive while the map is open, including the very first one of a session.
      const first = !prev || prev === state;
      this.lastRes = res.at;
      if (!first && prev.lastResolution?.at !== res.at) this.playResolution(res);
    }
    this.syncFronts(state, !prev);
    if (!prev || JSON.stringify(prev.display?.focus) !== JSON.stringify(state.display?.focus)) this.applyFocus();
  }
  // Front lines ease from where they were to where the engine says they are now.
  syncFronts(state, first) {
    const now = performance.now(), delay = (this.frontDelay || 0) * 1000;
    this.frontDelay = 0;
    this.fronts ||= {};
    for (const c of Object.values(state.countries)) {
      const target = c.front ? c.front.pct : 0;
      const cur = this.fronts[c.id];
      if (!cur && !target) continue;
      if (!cur) { this.fronts[c.id] = { a: first ? target : (c.front.prev ?? 0), b: target, start: now + (first ? 0 : delay), dur: 3.2, by: c.front.by, from: c.front.from }; continue; }
      if (c.front) { cur.by = c.front.by; cur.from = c.front.from; }
      if (cur.b !== target) Object.assign(cur, { a: this.frontPct(c.id, now), b: target, start: now + delay, dur: 3.2 });
    }
    for (const id of Object.keys(this.fronts)) if (!state.countries[id]?.front && this.fronts[id].b === 0 && now > this.fronts[id].start + this.fronts[id].dur * 1000) delete this.fronts[id];
  }
  frontPct(id, now) {
    const f = this.fronts?.[id]; if (!f) return 0;
    const u = clamp((now - f.start) / (f.dur * 1000), 0, 1);
    return f.a + (f.b - f.a) * easeInOut(u);
  }
  // Geometry of a front in projected map coordinates: the attack direction and how far the line has pushed.
  frontGeom(id, from, pct) {
    const b = this.bounds.get(id), tc = this.centroids.get(id);
    const fp = from && this.projection([from.lon, from.lat]);
    if (!b || !tc || !fp) return null;
    let dx = tc[0] - fp[0], dy = tc[1] - fp[1];
    const len = Math.hypot(dx, dy);
    if (len < 1) { dx = 1; dy = 0; } else { dx /= len; dy /= len; }
    const corners = [[b[0][0], b[0][1]], [b[1][0], b[0][1]], [b[0][0], b[1][1]], [b[1][0], b[1][1]]];
    const ts = corners.map(q => (q[0] - fp[0]) * dx + (q[1] - fp[1]) * dy);
    const tmin = Math.min(...ts), tmax = Math.max(...ts);
    const R = Math.hypot(b[1][0] - b[0][0], b[1][1] - b[0][1]) + 20;
    return { fp, dx, dy, tmin, tmax, R, thr: tmin + (tmax - tmin) * pct / 100 };
  }

  setLayers(l) { this.layers = { ...this.layers, ...l }; this.dirty = true; }
  setSelected(id) { this.selected = id; }
  setLang(lang) { this.opts.lang = lang; this.dirty = true; }

  // --- camera ---
  viewFor(focus) {
    if (!focus || !this.w) return { k: 1, x: 0, y: 0 };
    let bx;
    if (focus.kind === 'country' && this.bounds.get(focus.id)) bx = this.bounds.get(focus.id);
    else if (focus.kind === 'sea' && SEA_ZONES[focus.id]) { const q = this.projection([SEA_ZONES[focus.id].lon, SEA_ZONES[focus.id].lat]); bx = [[q[0] - 60, q[1] - 40], [q[0] + 60, q[1] + 40]]; }
    else if (focus.kind === 'box') bx = focus.box;
    else if (focus.kind === 'point') { const q = this.projection([focus.lon, focus.lat]); const r = focus.r || 80; bx = [[q[0] - r, q[1] - r * 0.6], [q[0] + r, q[1] + r * 0.6]]; }
    if (!bx) return { k: 1, x: 0, y: 0 };
    const [[x0, y0], [x1, y1]] = bx;
    const bw = Math.max(40, x1 - x0), bh = Math.max(30, y1 - y0);
    const k = clamp(Math.min(this.w / bw, this.h / bh) * (focus.pad || 0.42), 1, focus.maxK || 7);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    return this.clampView({ k, x: this.w / 2 - cx * k, y: this.h / 2 - cy * k });
  }
  clampView(v) {
    const k = clamp(v.k, 1, 12);
    return { k, x: clamp(v.x, this.w - this.w * k, 0), y: clamp(v.y, this.h - this.h * k, 0) };
  }
  applyFocus(instant) {
    if (!this.w) return;
    const f = this.opts.interactive ? this.userFocus : (this.state?.display?.focus || null);
    this.camTarget = this.viewFor(f);
    if (instant) this.cam = { ...this.camTarget };
  }
  flyTo(focus) { this.userFocus = focus; this.camTarget = this.viewFor(focus); }

  bindInput() {
    const fx = this.fx;
    fx.style.cursor = 'grab';
    let drag = null, moved = false;
    fx.addEventListener('wheel', e => {
      e.preventDefault();
      const r = fx.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      const t = this.camTarget, k = clamp(t.k * Math.exp(-e.deltaY * 0.0016), 1, 12);
      this.camTarget = this.clampView({ k, x: mx - (mx - t.x) * (k / t.k), y: my - (my - t.y) * (k / t.k) });
    }, { passive: false });
    fx.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, cx: this.camTarget.x, cy: this.camTarget.y }; moved = false; fx.setPointerCapture(e.pointerId); fx.style.cursor = 'grabbing'; });
    fx.addEventListener('pointermove', e => {
      const r = fx.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
        this.camTarget = this.clampView({ k: this.camTarget.k, x: drag.cx + dx, y: drag.cy + dy });
        this.cam = { ...this.cam, x: this.camTarget.x, y: this.camTarget.y, k: this.cam.k };
        if (!this.dragging && this.hover) { this.hover = null; this.opts.onHover?.(null); }
        this.dragging = true; this.dirty = true;
        return;
      }
      const ll = this.screenToLonLat(mx, my);
      const id = ll ? this.countryAt(ll[0], ll[1]) : null;
      const zone = !id ? this.zoneAt(mx, my) : null;
      if (id !== this.hover?.id || zone !== this.hover?.zone) this.hover = id || zone ? { id, zone } : null;
      this.opts.onHover?.(this.hover, mx, my);
    });
    fx.addEventListener('pointerup', e => {
      fx.style.cursor = 'grab';
      if (this.dragging) { this.dragging = false; this.dirty = true; }
      if (drag && !moved) {
        const r = fx.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
        const zone = this.zoneAt(mx, my);
        const ll = this.screenToLonLat(mx, my);
        const id = ll ? this.countryAt(ll[0], ll[1]) : null;
        this.opts.onSelect?.(zone && !id ? { zone } : zone && this.state?.countries?.[id] == null ? { zone } : { id, zone: null }, e);
      }
      drag = null;
    });
    fx.addEventListener('pointerleave', () => { this.hover = null; this.opts.onHover?.(null); });
    fx.addEventListener('dblclick', () => { this.userFocus = null; this.camTarget = { k: 1, x: 0, y: 0 }; });
  }
  zoneAt(mx, my) {
    let best = null, bd = 14;
    for (const [id, z] of Object.entries(SEA_ZONES)) {
      const q = this.p(z.lon, z.lat); if (!q) continue;
      const d = Math.hypot(q[0] - mx, q[1] - my);
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  }

  // --- styling ---
  fillFor(id) {
    const s = this.state, c = s?.countries?.[id];
    if (!c) return '#0d1422';
    if (c.control === 'inactive') return '#101827';
    const bloc = s.blocs[c.bloc];
    if (c.bloc === 'N') return c.control === 'player' ? '#3a4760' : '#232d40';
    return hexA(bloc.color, c.control === 'player' ? 0.78 : 0.42);
  }
  pattern(key, color) {
    if (!this.patterns[key]) this.patterns[key] = this.bctx.createPattern(hatch(color), 'repeat');
    return this.patterns[key];
  }

  // --- base layer ---
  drawBase() {
    const ctx = this.bctx, s = this.state, { k, x, y } = this.cam, dpr = this.dpr;
    const A = (this.moving || k < 1.7) ? this.atlas.lo : this.atlas.hi;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * x, dpr * y);
    // Ocean
    ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#040810'; ctx.fillRect(0, 0, this.w, this.h); ctx.restore();
    const g = ctx.createRadialGradient(this.w / 2, this.h / 2, 10, this.w / 2, this.h / 2, this.w * 0.62);
    g.addColorStop(0, '#0a1a2c'); g.addColorStop(1, '#050b14');
    ctx.fillStyle = g; ctx.fill(this.sphere);
    ctx.strokeStyle = 'rgba(80,160,220,0.07)'; ctx.lineWidth = 0.6 / k; ctx.stroke(this.graticule);
    ctx.strokeStyle = 'rgba(54,226,255,0.25)'; ctx.lineWidth = 1.2 / k; ctx.stroke(this.sphere);
    // Land
    ctx.fillStyle = '#0f1726';
    for (const p of A.paths.values()) ctx.fill(p);
    if (s?.countries) {
      const fog = s.settings?.fog;
      const pov = fog && fog !== 'public' && fog !== 'all' ? fog : null;
      for (const [id, path] of A.paths) {
        const c = s.countries[id];
        ctx.fillStyle = this.fillFor(id); ctx.fill(path);
        if (!c) continue;
        if (c.damage > 0.05) { ctx.fillStyle = `rgba(0,0,0,${Math.min(0.45, c.damage * 0.5)})`; ctx.fill(path); }
        // While a front is still sweeping across, the front layer draws the advance and the hatch waits for it.
        const sweeping = this.fronts?.[id] && performance.now() < this.fronts[id].start + this.fronts[id].dur * 1000;
        if (c.occupiedBy && s.countries[c.occupiedBy] && !sweeping) {
          const oc = s.blocs[s.countries[c.occupiedBy].bloc]?.color || '#ff4d5e';
          const pat = this.pattern('occ' + oc, hexA(oc, 0.85)); pat.setTransform(new DOMMatrix().scale(1 / k)); ctx.fillStyle = pat; ctx.fill(path);
        }
        if (c.capitulated) { ctx.fillStyle = 'rgba(30,30,30,0.55)'; ctx.fill(path); }
        if (s.global.closedAirspace?.[id] && this.layers.air !== false) {
          const pat = this.pattern('air', 'rgba(255,77,94,0.55)'); pat.setTransform(new DOMMatrix().scale(1 / k)); ctx.fillStyle = pat; ctx.fill(path);
        }
        if (pov && id !== pov && !(s.countries[pov] && (s.countries[pov].bloc !== 'N' && s.countries[pov].bloc === c.bloc))) { ctx.fillStyle = 'rgba(3,5,10,0.35)'; ctx.fill(path); }
      }
    }
    ctx.strokeStyle = 'rgba(160,200,255,0.16)'; ctx.lineWidth = 0.5 / k; ctx.stroke(A.borderPath);
    ctx.strokeStyle = 'rgba(90,180,255,0.32)'; ctx.lineWidth = 0.7 / k; ctx.stroke(A.coastPath);
    // Delegate-played countries get a bright outline.
    if (s?.countries) {
      for (const [id, path] of A.paths) {
        const c = s.countries[id];
        if (c?.control !== 'player') continue;
        ctx.strokeStyle = c.bloc === 'N' ? 'rgba(230,237,247,0.75)' : hexA(s.blocs[c.bloc].color, 1);
        ctx.lineWidth = 1.4 / k; ctx.stroke(path);
      }
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.layers.labels !== false) this.drawLabels(ctx);
    this.dirty = false;
    this.drawnCam = { ...this.cam };
  }

  drawLabels(ctx) {
    const s = this.state; if (!s?.countries) return;
    const k = this.cam.k;
    const ar = this.opts.lang === 'ar';
    const list = Object.values(s.countries).filter(c => c.control !== 'inactive' || k > 3.5);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const placed = [];
    list.sort((a, b) => (b.control === 'player') - (a.control === 'player') || b.base.gdp - a.base.gdp);
    for (const c of list) {
      const b = this.bounds.get(c.id); if (!b) continue;
      const wpx = (b[1][0] - b[0][0]) * k;
      if (wpx < 34 && c.control !== 'player') continue;
      const q = this.p(c.lon, c.lat); if (!q || q[0] < -40 || q[0] > this.w + 40 || q[1] < -20 || q[1] > this.h + 20) continue;
      const size = clamp(Math.sqrt(wpx) * 1.25, 9, 17);
      const text = ar ? c.ar : c.name.toUpperCase();
      ctx.font = ar ? `700 ${size + 1}px Cairo, sans-serif` : `700 ${size}px Rajdhani, Inter, sans-serif`;
      const tw = ctx.measureText(text).width;
      const box = [q[0] - tw / 2 - 2, q[1] - size / 2, q[0] + tw / 2 + 2, q[1] + size / 2];
      if (placed.some(p => !(box[2] < p[0] || box[0] > p[2] || box[3] < p[1] || box[1] > p[3]))) continue;
      placed.push(box);
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(text, q[0] + 1, q[1] + 1);
      ctx.fillStyle = c.control === 'player' ? 'rgba(255,255,255,0.95)' : 'rgba(200,215,235,0.62)';
      if (!ar) { ctx.save(); ctx.letterSpacing = '1.5px'; ctx.fillText(text, q[0], q[1]); ctx.restore(); } else ctx.fillText(text, q[0], q[1]);
    }
  }

  // --- animation ---
  playResolution(res) {
    const evs = res.events || [];
    let t = 0.3;
    const pts = [];
    const strikes = evs.filter(e => e.kind === 'strike' || e.kind === 'scrubbed');
    const add = (fx, delay) => { fx.start = performance.now() + delay * 1000; this.effects.push(fx); };
    for (const e of evs.filter(e => e.kind === 'war')) { add({ type: 'war', a: e.a, b: e.b, dur: 2.4 }, 0); }
    for (const e of evs.filter(e => e.kind === 'move')) { add({ type: 'move', e, dur: 2.6 }, t); pts.push(e.from, e.to); }
    for (const e of evs.filter(e => e.kind === 'fleet')) { add({ type: 'fleet', e, dur: 3.2 }, t); pts.push(...e.path); }
    t += 0.6;
    strikes.slice(0, 80).forEach((e, i) => { add({ type: 'strike', e, dur: e.unitType === 'missile' ? 1.5 : 2.2 }, t + i * 0.09); if (e.from) pts.push(e.from); if (e.to) pts.push(e.to); });
    t += Math.min(80, strikes.length) * 0.09 + 1.6;
    for (const e of evs.filter(e => e.kind === 'battle')) { add({ type: 'battle', e, dur: 3 }, t); pts.push(e.at); }
    for (const e of evs.filter(e => e.kind === 'front')) {
      if (e.pct > e.prev) add({ type: 'advance', e, dur: 3.6 }, t - 0.4);
      const c = this.state?.countries?.[e.country];
      pts.push(e.from); if (c) pts.push({ lat: c.lat, lon: c.lon });
    }
    this.frontDelay = t;
    for (const e of evs.filter(e => e.kind === 'naval')) { add({ type: 'naval', e, dur: 3 }, t); pts.push(e.at); }
    for (const e of evs.filter(e => e.kind === 'unit_lost')) add({ type: 'lost', e, dur: 3.5 }, t + 0.8);
    for (const e of evs.filter(e => e.kind === 'occupation')) { add({ type: 'occupy', e, dur: 3.5 }, t + 1); }
    for (const e of evs.filter(e => e.kind === 'chokepoint')) { add({ type: 'choke', e, dur: 3.5 }, t); const z = SEA_ZONES[e.zone]; if (z) pts.push({ lat: z.lat, lon: z.lon }); }
    for (const e of evs.filter(e => e.kind === 'nuke')) { add({ type: 'nuke', e, dur: 11 }, t + 1.2); pts.push(e.at, e.from); t += 4.6; }
    // Hold the shot until any front has finished sweeping across its country.
    const hold = evs.some(e => e.kind === 'front') ? Math.max(4, this.frontDelay - t + 5.4) : 4;
    this.sequenceEnd = performance.now() + (t + hold) * 1000;
    // On the stage display, frame the action automatically unless the Zeus has set a focus.
    if (this.opts.cinematic && pts.filter(Boolean).length && !this.state?.display?.focus) {
      const proj = pts.filter(Boolean).map(q => this.projection([q.lon, q.lat])).filter(Boolean);
      const xs = proj.map(q => q[0]), ys = proj.map(q => q[1]);
      const box = [[Math.min(...xs) - 30, Math.min(...ys) - 30], [Math.max(...xs) + 30, Math.max(...ys) + 30]];
      this.camTarget = this.viewFor({ kind: 'box', box, pad: 0.8, maxK: 4 });
      clearTimeout(this.camReturn);
      this.camReturn = setTimeout(() => this.applyFocus(), (t + hold) * 1000);
    }
    return t + hold;
  }

  frame(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (!this.w || !this.atlas) return;
    // Camera easing
    const c = this.cam, tg = this.camTarget, rate = this.opts.cinematic ? 2.2 : 9;
    const f = 1 - Math.exp(-rate * dt);
    const dk = tg.k - c.k, dx = tg.x - c.x, dy = tg.y - c.y;
    this.moving = this.dragging || Math.abs(dk) > 0.002 || Math.abs(dx) > 0.4 || Math.abs(dy) > 0.4;
    if (this.moving) { c.k += dk * f; c.x += dx * f; c.y += dy * f; this.dirty = true; }
    else if (this.wasMoving) this.dirty = true; // final redraw at full resolution
    this.wasMoving = this.moving;
    if (this.dirty) this.drawBase();
    if (this.state?.mode === 'world') {
      if (this.layers.air !== false) this.air.tick(dt);
      if (this.layers.naval !== false) this.sea.tick(dt);
    }
    this.drawFx(now, dt);
  }

  drawFx(now) {
    const ctx = this.fctx, s = this.state, dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    if (!s || s.mode !== 'world') return;
    const time = (now - this.t0) / 1000;
    const k = this.cam.k;
    const pathFor = id => this.atlas.lo.paths.get(id);
    const withCam = fn => { ctx.save(); ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * this.cam.x, dpr * this.cam.y); fn(); ctx.restore(); };

    // Selection and hover
    withCam(() => {
      if (this.hover?.id && pathFor(this.hover.id)) { ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill(pathFor(this.hover.id)); }
      if (this.selected && pathFor(this.selected)) {
        ctx.shadowColor = 'rgba(54,226,255,0.9)'; ctx.shadowBlur = 12;
        ctx.strokeStyle = `rgba(54,226,255,${0.75 + 0.25 * Math.sin(time * 4)})`; ctx.lineWidth = 1.8 / k; ctx.stroke(pathFor(this.selected));
        ctx.shadowBlur = 0;
      }
      for (const h of this.highlights) if (pathFor(h.id)) { ctx.fillStyle = h.color; ctx.fill(pathFor(h.id)); }
    });

    // Relations web
    if (this.layers.relations) this.drawRelations(ctx, time);
    // Wars: pulsing arcs between capitals
    if (this.layers.wars !== false) {
      const wars = s.wars.slice(0, 80);
      ctx.lineWidth = 1.3;
      ctx.setLineDash([5, 6]);
      ctx.lineDashOffset = -time * 14;
      for (const w of wars) {
        const a = this.countryPoint(w.a), b = this.countryPoint(w.b);
        if (!a || !b) continue;
        ctx.strokeStyle = `rgba(255,77,94,${0.35 + 0.15 * Math.sin(time * 2 + w.since)})`;
        this.curve(ctx, a, b, 0.18);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    this.drawFronts(ctx, now, time, withCam);
    if (this.layers.naval !== false) this.drawShips(ctx, time);
    if (this.layers.air !== false) this.drawFlights(ctx, time);
    this.drawChokepoints(ctx, time);
    if (this.layers.units !== false) this.drawUnits(ctx, time);
    this.drawEffects(ctx, now, withCam);
    if (this.flash) {
      const u = (now - this.flash.start) / (this.flash.dur * 1000);
      if (u >= 1) this.flash = null;
      else { ctx.fillStyle = `rgba(255,250,235,${(1 - u) * this.flash.alpha})`; ctx.fillRect(0, 0, this.w, this.h); }
    }
  }

  drawFronts(ctx, now, time, withCam) {
    const s = this.state, k = this.cam.k;
    for (const [id, f] of Object.entries(this.fronts || {})) {
      const c = s.countries[id], path = this.atlas.lo.paths.get(id);
      if (!c || !path) continue;
      const pct = this.frontPct(id, now);
      const settled = now > f.start + f.dur * 1000;
      if (settled && !f.drawnBase) { f.drawnBase = true; this.dirty = true; }
      if (!settled) f.drawnBase = false;
      if (pct < 0.5 || (c.occupiedBy && settled)) continue; // a fully occupied country is drawn by the base layer
      const g = this.frontGeom(id, f.from, pct); if (!g) continue;
      const by = s.countries[f.by];
      const col = by && by.bloc !== 'N' ? s.blocs[by.bloc].color : '#ff8a3d';
      const { fp, dx, dy, R, thr } = g, nx = -dy, ny = dx;
      const amp = Math.max(1.1, (g.tmax - g.tmin) * 0.035), seed = Number(id) || 1;
      const line = [];
      for (let i = 0; i <= 32; i++) {
        const sN = -R + (2 * R * i) / 32;
        const w = amp * (Math.sin(sN * 0.35 + seed) * 0.6 + Math.sin(sN * 0.13 + time * 0.7 + seed) * 0.4);
        line.push([fp[0] + dx * (thr + w) + nx * sN, fp[1] + dy * (thr + w) + ny * sN]);
      }
      const trace = () => { ctx.beginPath(); line.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); };
      withCam(() => {
        ctx.save();
        ctx.clip(path);
        // Ground the attacker holds: everything behind the line.
        trace();
        const back = R * 3, last = line[line.length - 1], first = line[0];
        ctx.lineTo(last[0] - dx * back, last[1] - dy * back); ctx.lineTo(first[0] - dx * back, first[1] - dy * back); ctx.closePath();
        ctx.fillStyle = 'rgba(6,8,14,0.35)'; ctx.fill();
        ctx.fillStyle = hexA(col, 0.62); ctx.fill();
        const pat = this.pattern('front' + col, 'rgba(255,255,255,0.22)'); pat.setTransform(new DOMMatrix().scale(1 / k)); ctx.fillStyle = pat; ctx.fill();
        // The front line itself: a hot glow with marching dashes.
        trace();
        ctx.strokeStyle = 'rgba(255,110,50,0.35)'; ctx.lineWidth = 7 / k; ctx.stroke();
        ctx.strokeStyle = '#ffc07a'; ctx.lineWidth = 1.7 / k; ctx.setLineDash([5 / k, 3 / k]); ctx.lineDashOffset = -time * 12 / k; ctx.stroke(); ctx.setLineDash([]);
        // Chevrons pushing forward along the line.
        const ang = Math.atan2(dy, dx), sz = 8 / k;
        for (let j = -3; j <= 3; j++) {
          const sN = (j * R) / 7, v = (time * 0.6 + (j + 3) / 7) % 1;
          const d = thr - 18 / k + v * 14 / k;
          const q = [fp[0] + dx * d + nx * sN, fp[1] + dy * d + ny * sN];
          ctx.save(); ctx.translate(q[0], q[1]); ctx.rotate(ang); ctx.globalAlpha = Math.sin(v * Math.PI) * 0.95;
          ctx.beginPath(); ctx.moveTo(sz, 0); ctx.lineTo(-sz * 0.6, sz * 0.8); ctx.lineTo(-sz * 0.1, 0); ctx.lineTo(-sz * 0.6, -sz * 0.8); ctx.closePath();
          ctx.fillStyle = '#ffe2bd'; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1 / k; ctx.stroke();
          ctx.restore();
        }
        ctx.restore();
      });
      // Label where the line crosses the middle of the country.
      if ((g.tmax - g.tmin) * k > 36) {
        const wx = fp[0] + dx * thr, wy = fp[1] + dy * thr;
        const x = wx * k + this.cam.x, y = wy * k + this.cam.y;
        const name = by ? (this.opts.lang === 'ar' ? by.ar : by.name.toUpperCase()) : '';
        const text = `${name} ${Math.round(pct)}%`;
        ctx.font = this.opts.lang === 'ar' ? '700 11px Cairo, sans-serif' : '700 10px Rajdhani, Inter, sans-serif';
        const tw = ctx.measureText(text).width + 12;
        ctx.fillStyle = 'rgba(8,10,16,0.85)'; ctx.strokeStyle = hexA(col, 0.9); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(x - tw / 2, y - 18, tw, 15, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffd9b0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y - 10.5);
      }
    }
  }

  curve(ctx, a, b, bend = 0.2) {
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1];
    const cx = mx - dy * bend, cy = my + dx * bend;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(cx, cy, b[0], b[1]);
    return [cx, cy];
  }
  onCurve(a, b, u, bend = 0.2) {
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1];
    const cx = mx - dy * bend, cy = my + dx * bend, v = 1 - u;
    const x = v * v * a[0] + 2 * v * u * cx + u * u * b[0], y = v * v * a[1] + 2 * v * u * cy + u * u * b[1];
    const tx = 2 * v * (cx - a[0]) + 2 * u * (b[0] - cx), ty = 2 * v * (cy - a[1]) + 2 * u * (b[1] - cy);
    return [x, y, Math.atan2(ty, tx)];
  }

  drawRelations(ctx) {
    const s = this.state;
    const majors = Object.values(s.countries).filter(c => c.major && c.control !== 'inactive').sort((a, b) => b.base.gdp - a.base.gdp).slice(0, 30);
    for (let i = 0; i < majors.length; i++) for (let j = i + 1; j < majors.length; j++) {
      const A = majors[i], B = majors[j];
      const r = relation(s, A.id, B.id);
      if (Math.abs(r) < 35) continue;
      const a = this.countryPoint(A.id), b = this.countryPoint(B.id);
      if (!a || !b) continue;
      ctx.strokeStyle = r > 0 ? `rgba(61,220,151,${Math.abs(r) / 260})` : `rgba(255,77,94,${Math.abs(r) / 260})`;
      ctx.lineWidth = 0.5 + Math.abs(r) / 50;
      this.curve(ctx, a, b, 0.12); ctx.stroke();
    }
  }

  drawFlights(ctx, time) {
    const flights = this.air.flights;
    for (const f of flights) {
      if (f.t < 0) continue;
      const pos = alongFast(f.path, f.t);
      const q = this.p(pos[0], pos[1]); if (!q) continue;
      const tail = alongFast(f.path, Math.max(0, f.t - 0.04));
      const qt = this.p(tail[0], tail[1]);
      const last = f.kind === 'last', div = f.kind === 'diverted';
      const col = last ? '255,178,36' : div ? '255,138,150' : '200,230,255';
      if (qt && Math.abs(qt[0] - q[0]) < this.w / 3) {
        const g = ctx.createLinearGradient(qt[0], qt[1], q[0], q[1]);
        g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(1, `rgba(${col},${last ? 0.6 : 0.28})`);
        ctx.strokeStyle = g; ctx.lineWidth = last ? 1.4 : 0.9; ctx.beginPath(); ctx.moveTo(qt[0], qt[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      }
      const ang = qt ? Math.atan2(q[1] - qt[1], q[0] - qt[0]) : 0;
      const sz = (last ? 4.2 : 2.8) * Math.min(1.6, 0.8 + this.cam.k * 0.15);
      ctx.save(); ctx.translate(q[0], q[1]); ctx.rotate(ang);
      ctx.fillStyle = `rgba(${col},${last ? 1 : 0.85})`;
      ctx.beginPath(); ctx.moveTo(sz * 1.4, 0); ctx.lineTo(-sz, sz * 0.9); ctx.lineTo(-sz * 0.5, 0); ctx.lineTo(-sz, -sz * 0.9); ctx.closePath(); ctx.fill();
      ctx.restore();
      if (f.label && f.t < 0.35) {
        ctx.font = '700 10px Rajdhani, sans-serif'; ctx.fillStyle = `rgba(255,178,36,${1 - f.t / 0.35})`;
        ctx.fillText(f.label, q[0] + 8, q[1] - 8);
      }
    }
  }

  drawShips(ctx, time) {
    for (const sh of this.sea.ships) {
      const pos = this.sea.position(sh);
      const q = this.p(pos[0], pos[1]); if (!q) continue;
      const col = sh.stuck ? '255,178,36' : sh.tanker ? '255,196,110' : '140,200,230';
      const r = (sh.tanker ? 2.1 : 1.7) * Math.min(1.8, 0.8 + this.cam.k * 0.18);
      ctx.fillStyle = `rgba(${col},${sh.stuck ? 0.55 + 0.3 * Math.sin(time * 3 + pos[0]) : 0.8})`;
      ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, TAU); ctx.fill();
      if (sh.rerouted && !sh.stuck) { ctx.strokeStyle = 'rgba(255,178,36,0.4)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(q[0], q[1], r + 2, 0, TAU); ctx.stroke(); }
    }
  }

  drawChokepoints(ctx, time) {
    const cps = this.state.global?.chokepoints || {};
    for (const [z, cp] of Object.entries(cps)) {
      const zone = SEA_ZONES[z]; const q = this.p(zone.lon, zone.lat); if (!q) continue;
      const col = cp.status === 'closed' ? '255,77,94' : cp.status === 'contested' ? '255,178,36' : '61,220,151';
      const pulse = cp.status === 'open' ? 0 : (time * 0.8) % 1;
      ctx.strokeStyle = `rgba(${col},0.95)`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(q[0], q[1], 5, 0, TAU); ctx.stroke();
      if (cp.status !== 'open') {
        ctx.strokeStyle = `rgba(${col},${1 - pulse})`; ctx.beginPath(); ctx.arc(q[0], q[1], 5 + pulse * 14, 0, TAU); ctx.stroke();
        if (cp.status === 'closed') { ctx.strokeStyle = `rgba(${col},1)`; ctx.beginPath(); ctx.moveTo(q[0] - 3, q[1] - 3); ctx.lineTo(q[0] + 3, q[1] + 3); ctx.moveTo(q[0] + 3, q[1] - 3); ctx.lineTo(q[0] - 3, q[1] + 3); ctx.stroke(); }
      } else { ctx.fillStyle = `rgba(${col},0.9)`; ctx.beginPath(); ctx.arc(q[0], q[1], 2, 0, TAU); ctx.fill(); }
      if (this.cam.k > 1.6 || cp.status !== 'open') {
        ctx.font = '700 10px Rajdhani, sans-serif'; ctx.fillStyle = `rgba(${col},0.95)`; ctx.textAlign = 'left';
        ctx.fillText((this.opts.lang === 'ar' ? zone.ar : zone.name).toUpperCase() + (cp.status !== 'open' ? `  ${cp.status.toUpperCase()}` : ''), q[0] + 9, q[1] + 3);
      }
    }
  }

  visibleTo(u) {
    const s = this.state, fog = s.settings?.fog || 'public';
    if (fog === 'all') return true;
    if (fog === 'public') {
      // Deployed forces only: armies and wings abroad, and warships that are away from home, blockading, or at war.
      if (u.loc.kind === 'country') return u.loc.id !== u.owner;
      if (u.blockade || s.countries[u.owner]?.control === 'player') return true;
      if (s.wars.some(w => w.a === u.owner || w.b === u.owner)) return true;
      return !(SEA_ZONES[u.loc.id]?.coasts || []).includes(u.owner);
    }
    const pov = s.countries[fog]; if (!pov) return true;
    if (u.owner === fog) return true;
    const own = s.countries[u.owner];
    if (own && pov.bloc !== 'N' && own.bloc === pov.bloc) return true;
    if (u.loc.kind === 'country' && (u.loc.id === fog || (s.adjacency[fog] || []).includes(u.loc.id))) return true;
    if (pov.intel && pov.intel[u.owner] >= s.meta.turn) return true;
    return false;
  }

  drawUnits(ctx, time) {
    const s = this.state;
    const groups = new Map();
    for (const u of Object.values(s.units)) {
      if (u.strength <= 0 || !this.visibleTo(u)) continue;
      const key = `${u.loc.kind}:${u.loc.id}:${u.owner}`;
      if (!groups.has(key)) groups.set(key, { loc: u.loc, owner: u.owner, units: [] });
      groups.get(key).units.push(u);
    }
    const perLoc = new Map();
    for (const g of groups.values()) {
      const lk = `${g.loc.kind}:${g.loc.id}`;
      const i = perLoc.get(lk) || 0; perLoc.set(lk, i + 1);
      let base;
      if (g.loc.kind === 'sea') { const z = SEA_ZONES[g.loc.id]; base = z && this.p(z.lon, z.lat); }
      else base = this.countryPoint(g.loc.id);
      if (!base) continue;
      const ang = i * 2.1 + 0.6, rr = i ? 11 + i * 2 : 0;
      const q = [base[0] + Math.cos(ang) * rr, base[1] + Math.sin(ang) * rr + (g.loc.kind === 'country' ? 12 : 0)];
      const owner = s.countries[g.owner];
      const color = owner && owner.bloc !== 'N' ? s.blocs[owner.bloc].color : '#c8d2e0';
      const sea = g.loc.kind === 'sea';
      const blockade = g.units.some(u => u.blockade);
      const count = g.units.length;
      const scale = Math.min(1.5, 0.85 + this.cam.k * 0.12);
      ctx.save(); ctx.translate(q[0], q[1]); ctx.scale(scale, scale);
      ctx.fillStyle = 'rgba(4,6,11,0.85)'; ctx.strokeStyle = color; ctx.lineWidth = 1.4;
      if (sea) {
        ctx.beginPath(); ctx.moveTo(-8, -2); ctx.lineTo(8, -2); ctx.lineTo(5, 4); ctx.lineTo(-5, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-1, -2); ctx.lineTo(-1, -7); ctx.lineTo(4, -4); ctx.stroke();
        if (blockade) { ctx.strokeStyle = `rgba(255,77,94,${0.6 + 0.4 * Math.sin(time * 4)})`; ctx.beginPath(); ctx.arc(0, 0, 12, 0, TAU); ctx.stroke(); }
      } else {
        const air = g.units.every(u => ['fighter', 'bomber'].includes(u.type));
        if (air) { ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(6, 5); ctx.lineTo(0, 2); ctx.lineTo(-6, 5); ctx.closePath(); ctx.fill(); ctx.stroke(); }
        else { ctx.beginPath(); ctx.rect(-7, -5, 14, 10); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-7, -5); ctx.lineTo(7, 5); ctx.moveTo(7, -5); ctx.lineTo(-7, 5); ctx.stroke(); }
      }
      if (count > 1) { ctx.fillStyle = color; ctx.font = '700 9px JetBrains Mono, monospace'; ctx.textAlign = 'left'; ctx.fillText(String(count), 9, -4); }
      ctx.restore();
    }
  }

  drawEffects(ctx, now, withCam) {
    const keep = [];
    for (const fx of this.effects) {
      const u = (now - fx.start) / (fx.dur * 1000);
      if (u < 0) { keep.push(fx); continue; }
      if (u >= 1) { if (fx.type === 'strike' && !fx.e.intercepted && fx.e.to) this.scars.push({ at: fx.e.to, born: now }); continue; }
      keep.push(fx);
      this[`fx_${fx.type}`]?.(ctx, fx, u, now, withCam);
    }
    this.effects = keep;
    // Fading impact marks
    this.scars = (this.scars || []).filter(sc => now - sc.born < 14000);
    for (const sc of this.scars) {
      const q = this.pt(sc.at); if (!q) continue;
      const a = 1 - (now - sc.born) / 14000;
      ctx.fillStyle = `rgba(255,120,60,${0.5 * a})`; ctx.beginPath(); ctx.arc(q[0], q[1], 2.2, 0, TAU); ctx.fill();
    }
  }

  fx_strike(ctx, fx, u) {
    const e = fx.e;
    const a = this.pt(e.from) || this.countryPoint(e.owner), endPt = e.intercepted ? (e.at || e.to) : e.to;
    const b = this.pt(endPt) || this.countryPoint(e.target);
    if (!a || !b) return;
    const travel = 0.72;
    const m = e.unitType === 'missile';
    const col = m ? '255,90,70' : '255,190,90';
    const bend = m ? -0.28 : 0.12;
    if (u < travel) {
      const v = ease(u / travel);
      const head = this.onCurve(a, b, v, bend);
      ctx.strokeStyle = `rgba(${col},0.55)`; ctx.lineWidth = m ? 1.6 : 1.2;
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) { const pp = this.onCurve(a, b, Math.max(0, v - 0.35) + (v - Math.max(0, v - 0.35)) * i / 24, bend); i ? ctx.lineTo(pp[0], pp[1]) : ctx.moveTo(pp[0], pp[1]); }
      ctx.stroke();
      ctx.fillStyle = `rgba(${col},1)`; ctx.shadowColor = `rgba(${col},1)`; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(head[0], head[1], m ? 2.4 : 2, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
    } else {
      const v = (u - travel) / (1 - travel);
      if (e.intercepted) {
        ctx.strokeStyle = `rgba(200,240,255,${1 - v})`; ctx.lineWidth = 1.5;
        for (let i = 0; i < 6; i++) { const ang = i * TAU / 6; ctx.beginPath(); ctx.moveTo(b[0] + Math.cos(ang) * 2, b[1] + Math.sin(ang) * 2); ctx.lineTo(b[0] + Math.cos(ang) * (4 + v * 9), b[1] + Math.sin(ang) * (4 + v * 9)); ctx.stroke(); }
      } else {
        const r = 4 + ease(v) * 22;
        const g = ctx.createRadialGradient(b[0], b[1], 0, b[0], b[1], r);
        g.addColorStop(0, `rgba(255,240,200,${0.9 * (1 - v)})`); g.addColorStop(0.4, `rgba(255,120,40,${0.6 * (1 - v)})`); g.addColorStop(1, 'rgba(255,60,30,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b[0], b[1], r, 0, TAU); ctx.fill();
        ctx.strokeStyle = `rgba(255,150,80,${1 - v})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(b[0], b[1], r * 1.3, 0, TAU); ctx.stroke();
      }
    }
  }
  fx_scrubbed(ctx, fx, u) { this.fx_strike(ctx, { e: { ...fx.e, intercepted: true, at: fx.e.from } }, Math.min(u, 0.7)); }
  fx_move(ctx, fx, u) {
    const e = fx.e, a = this.pt(e.from), b = this.pt(e.to); if (!a || !b) return;
    const owner = this.state.countries[e.owner];
    const col = owner && owner.bloc !== 'N' ? this.state.blocs[owner.bloc].color : '#c8d2e0';
    const v = ease(Math.min(1, u * 1.4)), fade = u > 0.75 ? 1 - (u - 0.75) / 0.25 : 1;
    ctx.globalAlpha = fade; ctx.strokeStyle = col; ctx.lineWidth = 2.2; ctx.setLineDash([2, 4]);
    ctx.beginPath();
    for (let i = 0; i <= 20; i++) { const pp = this.onCurve(a, b, v * i / 20, 0.08); i ? ctx.lineTo(pp[0], pp[1]) : ctx.moveTo(pp[0], pp[1]); }
    ctx.stroke(); ctx.setLineDash([]);
    const h = this.onCurve(a, b, v, 0.08);
    ctx.save(); ctx.translate(h[0], h[1]); ctx.rotate(h[2]); ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-4, 5); ctx.lineTo(-1, 0); ctx.lineTo(-4, -5); ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.globalAlpha = 1;
  }
  fx_fleet(ctx, fx, u) {
    const pts = fx.e.path.map(q => this.pt(q)).filter(Boolean); if (pts.length < 2) return;
    const owner = this.state.countries[fx.e.owner];
    const col = owner && owner.bloc !== 'N' ? this.state.blocs[owner.bloc].color : '#c8d2e0';
    const v = ease(Math.min(1, u * 1.2)) * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(v)), w = v - i;
    ctx.strokeStyle = hexA(col, 0.5 * (1 - Math.max(0, u - 0.8) / 0.2)); ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
    ctx.beginPath(); pts.forEach((q, j) => (j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.stroke(); ctx.setLineDash([]);
    const x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * w, y = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * w;
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = hexA(col, 0.4); ctx.beginPath(); ctx.arc(x, y, 6 + 3 * Math.sin(u * 20), 0, TAU); ctx.stroke();
  }
  // A thick campaign arrow from where the attack came from to the new front line.
  fx_advance(ctx, fx, u, now, withCam) {
    const e = fx.e, g = this.frontGeom(e.country, e.from, e.pct); if (!g) return;
    const by = this.state.countries[e.by];
    const col = by && by.bloc !== 'N' ? this.state.blocs[by.bloc].color : '#ff8a3d';
    const k = this.cam.k, toS = (x, y) => [x * k + this.cam.x, y * k + this.cam.y];
    const a = toS(g.fp[0], g.fp[1]), b = toS(g.fp[0] + g.dx * g.thr, g.fp[1] + g.dy * g.thr);
    const v = ease(Math.min(1, u * 1.6)), fade = u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1;
    const pts = [];
    for (let i = 0; i <= 24; i++) pts.push(this.onCurve(a, b, (v * i) / 24, 0.12));
    ctx.save(); ctx.globalAlpha = fade; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [w, c] of [[11, 'rgba(0,0,0,0.45)'], [8, hexA(col, 0.9)], [2.5, 'rgba(255,255,255,0.55)']]) {
      ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.stroke();
    }
    const h = pts[pts.length - 1];
    ctx.translate(h[0], h[1]); ctx.rotate(h[2]); ctx.fillStyle = hexA(col, 1); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-6, 11); ctx.lineTo(-2, 0); ctx.lineTo(-6, -11); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  fx_battle(ctx, fx, u) {
    const q = this.pt(fx.e.at); if (!q) return;
    for (let i = 0; i < 3; i++) {
      const v = (u * 2.2 + i / 3) % 1;
      ctx.strokeStyle = `rgba(255,${fx.e.result === 'won' ? 90 : 190},70,${(1 - v) * (1 - u * 0.6)})`; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(q[0], q[1], 4 + v * 26, 0, TAU); ctx.stroke();
    }
    ctx.strokeStyle = `rgba(255,220,180,${1 - u})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(q[0] - 6, q[1] - 6); ctx.lineTo(q[0] + 6, q[1] + 6); ctx.moveTo(q[0] + 6, q[1] - 6); ctx.lineTo(q[0] - 6, q[1] + 6); ctx.stroke();
  }
  fx_naval(ctx, fx, u) {
    const q = this.pt(fx.e.at); if (!q) return;
    for (let i = 0; i < 5; i++) {
      const v = clamp(u * 1.5 - i * 0.12, 0, 1); if (!v || v >= 1) continue;
      const ang = i * 1.3, r = 6 + i * 3;
      ctx.fillStyle = `rgba(200,235,255,${1 - v})`; ctx.beginPath(); ctx.arc(q[0] + Math.cos(ang) * r, q[1] + Math.sin(ang) * r, 1.5 + v * 3, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = `rgba(54,226,255,${1 - u})`; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(q[0], q[1], 8 + u * 28, 0, TAU); ctx.stroke();
  }
  fx_lost(ctx, fx, u) {
    const q = this.pt(fx.e.at); if (!q) return;
    ctx.strokeStyle = `rgba(180,190,205,${1 - u})`; ctx.lineWidth = 1.4;
    const r = 4 + u * 3;
    ctx.beginPath(); ctx.moveTo(q[0] - r, q[1] - r + 14); ctx.lineTo(q[0] + r, q[1] + r + 14); ctx.moveTo(q[0] + r, q[1] - r + 14); ctx.lineTo(q[0] - r, q[1] + r + 14); ctx.stroke();
  }
  fx_occupy(ctx, fx, u, now, withCam) {
    const path = this.atlas.lo.paths.get(fx.e.country); if (!path) return;
    const by = this.state.countries[fx.e.by];
    const col = by && by.bloc !== 'N' ? this.state.blocs[by.bloc].color : '#ff4d5e';
    withCam(() => { ctx.fillStyle = hexA(col, 0.55 * Math.sin(u * Math.PI) * (0.6 + 0.4 * Math.sin(u * 18))); ctx.fill(path); ctx.strokeStyle = hexA(col, 1 - u); ctx.lineWidth = 2 / this.cam.k; ctx.stroke(path); });
  }
  fx_war(ctx, fx, u, now, withCam) {
    withCam(() => {
      for (const id of [fx.a, fx.b]) {
        const path = this.atlas.lo.paths.get(id); if (!path) continue;
        ctx.strokeStyle = `rgba(255,77,94,${(1 - u) * (0.6 + 0.4 * Math.sin(u * 30))})`; ctx.lineWidth = 2.4 / this.cam.k; ctx.stroke(path);
      }
    });
  }
  fx_choke(ctx, fx, u) {
    const z = SEA_ZONES[fx.e.zone]; const q = z && this.p(z.lon, z.lat); if (!q) return;
    const col = fx.e.status === 'closed' ? '255,77,94' : fx.e.status === 'contested' ? '255,178,36' : '61,220,151';
    for (let i = 0; i < 3; i++) { const v = (u * 1.8 + i / 3) % 1; ctx.strokeStyle = `rgba(${col},${(1 - v) * (1 - u)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(q[0], q[1], 6 + v * 40, 0, TAU); ctx.stroke(); }
  }
  // Nuclear strike, kept abstract: a ballistic missile track, an incoming warning, then a flash and shockwave. Nothing graphic.
  fx_nuke(ctx, fx, u) {
    const e = fx.e, FLIGHT = 0.42, T = fx.dur;
    const from = e.from || e.at, to = e.to || e.at;
    if (!fx.track) {
      const interp = geoInterpolate([from.lon, from.lat], [to.lon, to.lat]);
      fx.track = Array.from({ length: 61 }, (_, i) => interp(i / 60));
      fx.km = geoDistanceKm(from, to);
    }
    const proj = i => { const g = fx.track[i]; return this.p(g[0], g[1]); };
    const a = proj(0), b = proj(60); if (!a || !b) return;
    const loft = Math.min(0.32, 0.12 + fx.km / 40000) * Math.hypot(b[0] - a[0], b[1] - a[1]) + 18;
    const at = i => { const q = proj(i); if (!q) return null; return [q[0], q[1] - Math.sin(Math.PI * i / 60) * loft]; };
    if (u < FLIGHT) {
      const v = u / FLIGHT, head = Math.max(1, Math.round(easeInOut(v) * 60));
      if (!fx.launched) { fx.launched = true; this.opts.onNukeLaunch?.(); }
      // Launch bloom at the silo.
      const lb = clamp(v * 4, 0, 1);
      ctx.strokeStyle = `rgba(255,200,120,${1 - lb})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(a[0], a[1], 4 + lb * 18, 0, TAU); ctx.stroke();
      // Contrail.
      ctx.lineCap = 'round';
      for (let i = 1; i <= head; i++) {
        const p0 = at(i - 1), p1 = at(i); if (!p0 || !p1 || Math.abs(p1[0] - p0[0]) > this.w / 3) continue;
        const age = (head - i) / 60;
        ctx.strokeStyle = `rgba(255,${190 - age * 120},${120 - age * 80},${Math.max(0, 0.9 - age * 1.4)})`; ctx.lineWidth = 3.2 - age * 2; ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
      }
      const h = at(head);
      if (h) {
        const g = ctx.createRadialGradient(h[0], h[1], 0, h[0], h[1], 14);
        g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,190,90,0.8)'); g.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(h[0], h[1], 14, 0, TAU); ctx.fill();
      }
      // Incoming warning at the target.
      const pulse = (u * T * 1.6) % 1;
      ctx.strokeStyle = `rgba(255,60,70,${0.9 - pulse * 0.8})`; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(b[0], b[1], 10 + pulse * 22, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,80,90,0.9)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(b[0] - 16, b[1]); ctx.lineTo(b[0] - 6, b[1]); ctx.moveTo(b[0] + 6, b[1]); ctx.lineTo(b[0] + 16, b[1]);
      ctx.moveTo(b[0], b[1] - 16); ctx.lineTo(b[0], b[1] - 6); ctx.moveTo(b[0], b[1] + 6); ctx.lineTo(b[0], b[1] + 16); ctx.stroke();
      return;
    }
    const v = (u - FLIGHT) / (1 - FLIGHT);
    if (!fx.flashed) { fx.flashed = true; this.flash = { start: performance.now(), dur: 3.5, alpha: 0.8 }; this.opts.onNukeImpact?.(); }
    const span = Math.min(this.w, this.h);
    // Expanding light.
    const r = ease(v) * span * 0.22;
    const g = ctx.createRadialGradient(b[0], b[1], 0, b[0], b[1], r + 1);
    g.addColorStop(0, `rgba(255,255,240,${0.6 * (1 - v)})`); g.addColorStop(0.55, `rgba(255,215,150,${0.28 * (1 - v)})`); g.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b[0], b[1], r + 1, 0, TAU); ctx.fill();
    // Shockwave rings.
    for (let i = 0; i < 3; i++) {
      const w = clamp(v * 1.4 - i * 0.18, 0, 1); if (!w || w >= 1) continue;
      ctx.strokeStyle = `rgba(255,240,210,${(1 - w) * 0.9})`; ctx.lineWidth = 2.4 - i * 0.6;
      ctx.beginPath(); ctx.arc(b[0], b[1], ease(w) * span * (0.3 + i * 0.08), 0, TAU); ctx.stroke();
    }
    // A lingering marker so the place stays readable.
    ctx.strokeStyle = `rgba(255,200,120,${0.8 * (1 - v * 0.6)})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(b[0], b[1], 7, 0, TAU); ctx.stroke();
    ctx.fillStyle = `rgba(255,236,200,${0.9 * (1 - v * 0.5)})`; ctx.beginPath(); ctx.arc(b[0], b[1], 2.5, 0, TAU); ctx.fill();
  }
}

function geoDistanceKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Fast polyline sampling by index (good enough for drawing).
function alongFast(path, t) {
  const n = path.length - 1, x = clamp(t, 0, 1) * n, i = Math.min(n - 1, Math.floor(x)), u = x - i;
  const a = path[i], b = path[i + 1] || a;
  let dl = b[0] - a[0]; if (dl > 180) dl -= 360; if (dl < -180) dl += 360;
  return [a[0] + dl * u, a[1] + (b[1] - a[1]) * u];
}

export { geoInterpolate, easeInOut };
