// The live world map, drawn on two canvases: a base layer (countries, borders, airspace) redrawn only when
// something changes, and an effects layer animated every frame (traffic, units, strikes, battles).
import { geoEqualEarth, geoPath, geoGraticule10, geoInterpolate } from 'd3-geo';
import { SEA_ZONES } from '/shared/data/places.js';
import { CITIES } from '/shared/data/cities.js';
import { relation } from '/shared/engine/core.js';
import { loadAtlas, makeCountryAt, makeLandAt, pairBorder } from './atlas.js';
import { AirTraffic, SeaTraffic } from './traffic.js';

const TAU = Math.PI * 2;
const withCamOn = (ctx, dpr, cam, fn) => { ctx.save(); ctx.setTransform(dpr * cam.k, 0, 0, dpr * cam.k, dpr * cam.x, dpr * cam.y); fn(); ctx.restore(); };
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
    this.sea = new SeaTraffic(makeLandAt(hi));
    this.patterns = {};
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.el);
    if (this.opts.interactive || this.opts.stageControl) this.bindInput();
    if (this.opts.stageControl) {
      this.onKey = e => { if (e.key === 'Escape' && this.localFocus) { this.localFocus = null; this.applyFocus(); } };
      window.addEventListener('keydown', this.onKey);
    }
    this.t0 = performance.now();
    this.last = this.t0;
    const loop = now => { if (this.destroyed) return; this.frame(now); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
    if (this.state) this.setState(this.state);
  }

  destroy() { this.destroyed = true; cancelAnimationFrame(this.raf); this.ro?.disconnect(); if (this.onKey) window.removeEventListener('keydown', this.onKey); this.el.innerHTML = ''; }

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
    this.borderCache = new Map();
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
    // The stage display follows the Zeus's focus, unless someone has clicked a country on the display itself.
    const f = this.opts.interactive ? this.userFocus : (this.localFocus || this.state?.display?.focus || null);
    this.camTarget = this.viewFor(f);
    if (instant) this.cam = { ...this.camTarget };
  }
  flyTo(focus) { this.userFocus = focus; this.camTarget = this.viewFor(focus); }
  // The country the camera is centred on, if any: its cities are all shown.
  focusedCountry() {
    const f = this.opts.interactive ? this.userFocus : (this.localFocus || this.state?.display?.focus);
    if (f?.kind === 'country') return f.id;
    return this.opts.interactive ? this.selected : null;
  }
  // On the stage display, clicking a country zooms to it; clicking it again, the sea, or pressing Escape zooms back out.
  stageClick(id) {
    this.localFocus = id && id !== this.localFocus?.id && this.bounds.get(id) ? { kind: 'country', id } : null;
    this.userAt = performance.now();
    this.applyFocus();
  }

  bindInput() {
    const fx = this.fx;
    fx.style.cursor = 'grab';
    let drag = null, moved = false;
    fx.addEventListener('wheel', e => {
      e.preventDefault();
      const r = fx.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      const t = this.camTarget, k = clamp(t.k * Math.exp(-e.deltaY * 0.0016), 1, 12);
      this.camTarget = this.clampView({ k, x: mx - (mx - t.x) * (k / t.k), y: my - (my - t.y) * (k / t.k) });
      this.userAt = performance.now();
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
        this.dragging = true; this.dirty = true; this.userAt = performance.now();
        return;
      }
      if (!this.opts.interactive) return;
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
        if (this.opts.stageControl) this.stageClick(id && this.state?.countries?.[id] ? id : null);
        else this.opts.onSelect?.(zone && !id ? { zone } : zone && this.state?.countries?.[id] == null ? { zone } : { id, zone: null }, e);
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
    const placed = this.labelBoxes = [];
    list.sort((a, b) => (b.control === 'player') - (a.control === 'player') || b.base.gdp - a.base.gdp);
    for (const c of list) {
      const b = this.bounds.get(c.id); if (!b) continue;
      const wpx = (b[1][0] - b[0][0]) * k;
      if (wpx < 34 && c.control !== 'player') continue;
      // Names sit in the middle of the main landmass, leaving the capital free for its city marker.
      const cc = this.centroids.get(c.id), q = cc ? [cc[0] * k + this.cam.x, cc[1] * k + this.cam.y] : this.p(c.lon, c.lat);
      if (!q || q[0] < -40 || q[0] > this.w + 40 || q[1] < -20 || q[1] > this.h + 20) continue;
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
    // Points of interest by importance (0 = most), so a busy turn frames the headline action instead of the whole world.
    const tiers = [[], [], [], [], [], [], []];
    const mark = (tier, ...qs) => tiers[tier].push(...qs.filter(Boolean));
    const strikes = evs.filter(e => e.kind === 'strike' || e.kind === 'scrubbed');
    const add = (fx, delay) => { fx.start = performance.now() + delay * 1000; this.effects.push(fx); };
    for (const e of evs.filter(e => e.kind === 'war')) { add({ type: 'war', a: e.a, b: e.b, dur: 2.4 }, 0); }
    for (const e of evs.filter(e => e.kind === 'move')) { add({ type: 'move', e, dur: 2.6 }, t); mark(6, e.from, e.to); }
    for (const e of evs.filter(e => e.kind === 'fleet')) { add({ type: 'fleet', e, dur: 3.2 }, t); mark(6, ...e.path); }
    t += 0.6;
    strikes.slice(0, 80).forEach((e, i) => { add({ type: e.kind, e, dur: e.kind === 'scrubbed' ? 3 : e.unitType === 'missile' ? 2.4 : e.unitType === 'bomber' ? 5.2 : 3.8 }, t + i * 0.12); mark(3, e.from, e.to); });
    t += Math.min(80, strikes.length) * 0.12 + (strikes.some(e => e.unitType === 'bomber') ? 4.4 : strikes.some(e => e.unitType !== 'missile') ? 3.2 : 2.2);
    for (const e of evs.filter(e => e.kind === 'battle')) { add({ type: 'battle', e, dur: 3 }, t); mark(5, e.at); }
    for (const e of evs.filter(e => e.kind === 'front')) {
      if (e.pct > e.prev) add({ type: 'advance', e, dur: 3.6 }, t - 0.4);
      const c = this.state?.countries?.[e.country];
      mark(4, e.from, c && { lat: c.lat, lon: c.lon });
    }
    this.frontDelay = t;
    for (const e of evs.filter(e => e.kind === 'landing')) { add({ type: 'landing', e, dur: 4.6 }, t - 1.2); mark(1, e.from, e.to); }
    for (const e of evs.filter(e => e.kind === 'naval')) { add({ type: 'naval', e, dur: 5 }, t); mark(2, e.at); }
    for (const e of evs.filter(e => e.kind === 'neo')) { add({ type: 'neo', e, dur: 7 }, t); mark(1, e.from, e.sea || e.to); }
    for (const e of evs.filter(e => e.kind === 'unit_lost')) add({ type: 'lost', e, dur: 3.5 }, t + 0.8);
    for (const e of evs.filter(e => e.kind === 'occupation')) { add({ type: 'occupy', e, dur: 3.5 }, t + 1); }
    for (const e of evs.filter(e => e.kind === 'chokepoint')) { add({ type: 'choke', e, dur: 3.5 }, t); const z = SEA_ZONES[e.zone]; mark(2, z && { lat: z.lat, lon: z.lon }); }
    for (const e of evs.filter(e => e.kind === 'nuke')) { add({ type: 'nuke', e, dur: 11 }, t + 1.2); mark(0, e.at, e.from); t += 4.6; }
    // Hold the shot until any front has finished sweeping across its country.
    const tail = evs.some(e => e.kind === 'neo') ? 7.5 : evs.some(e => e.kind === 'naval' || e.kind === 'landing') ? 5.5 : 4;
    const hold = evs.some(e => e.kind === 'front') ? Math.max(tail, this.frontDelay - t + 5.4) : tail;
    this.sequenceEnd = performance.now() + (t + hold) * 1000;
    // On the stage display, frame the action automatically unless the Zeus has set a focus.
    const handsOn = this.localFocus || (this.userAt && performance.now() - this.userAt < 20000);
    const box = this.actionBox(tiers);
    if (this.opts.cinematic && box && !this.state?.display?.focus && !handsOn) {
      this.camTarget = this.viewFor({ kind: 'box', box, pad: 0.8, maxK: 4 });
      clearTimeout(this.camReturn);
      this.camReturn = setTimeout(() => this.applyFocus(), (t + hold) * 1000);
    }
    return t + hold;
  }

  // Grow the shot from the most important action outward, stopping before it zooms out past about a third of the world.
  actionBox(tiers) {
    const maxW = this.w * 0.36, maxH = this.h * 0.5;
    let box = null;
    for (const group of tiers) {
      const proj = group.map(q => this.projection([q.lon, q.lat])).filter(Boolean);
      if (!proj.length) continue;
      const xs = proj.map(q => q[0]), ys = proj.map(q => q[1]);
      const next = box ? [[Math.min(box[0][0], ...xs), Math.min(box[0][1], ...ys)], [Math.max(box[1][0], ...xs), Math.max(box[1][1], ...ys)]]
        : [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
      if (box && (next[1][0] - next[0][0] > maxW || next[1][1] - next[0][1] > maxH)) break;
      box = next;
    }
    return box && [[box[0][0] - 30, box[0][1] - 30], [box[1][0] + 30, box[1][1] + 30]];
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
    this.drawCities(ctx, time);
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

  // Cities appear as the camera zooms in: capitals and megacities first, then major and regional cities.
  // Every city of the country in focus is shown.
  drawCities(ctx, time) {
    const s = this.state, k = this.cam.k, focus = this.focusedCountry();
    const focusA3 = focus && s.countries[focus]?.a3;
    if (k < 2.6 && !focusA3) return;
    const ar = this.opts.lang === 'ar';
    const placed = (this.labelBoxes || []).slice(), own = [];
    const minTier = k >= 5.5 ? 3 : k >= 3.6 ? 2 : 1;
    const list = CITIES.filter(c => c.a3 === focusA3 ? k >= 1.4 : c.tier <= minTier && k >= 2.6).sort((a, b) => (b.a3 === focusA3) - (a.a3 === focusA3) || a.tier - b.tier);
    ctx.textBaseline = 'middle';
    for (const c of list) {
      const q = this.p(c.lon, c.lat); if (!q || q[0] < -20 || q[0] > this.w + 20 || q[1] < -20 || q[1] > this.h + 20) continue;
      const mine = c.a3 === focusA3, capital = c.tier === 1;
      const size = mine ? (capital ? 13 : c.tier === 2 ? 11.5 : 10.5) : capital ? 11 : 10;
      ctx.font = ar ? `600 ${size + 1}px Cairo, sans-serif` : `600 ${size}px Inter, sans-serif`;
      const text = ar ? c.ar : c.name;
      const tw = ctx.measureText(text).width;
      const box = [q[0] - 4, q[1] - size / 2 - 1, q[0] + 8 + tw, q[1] + size / 2 + 1];
      // Cities of the country in focus only avoid each other; other cities also stay clear of country names.
      const hit = (mine ? own : placed).some(p => !(box[2] < p[0] || box[0] > p[2] || box[3] < p[1] || box[1] > p[3]));
      // Always draw the dot; drop the label if it would collide.
      const pulse = mine && capital ? 0.5 + 0.5 * Math.sin(time * 2.4) : 0;
      if (pulse) { ctx.strokeStyle = `rgba(255,214,120,${0.5 * (1 - pulse)})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(q[0], q[1], 4 + pulse * 6, 0, TAU); ctx.stroke(); }
      ctx.fillStyle = capital ? '#ffd678' : mine ? '#e9f2ff' : 'rgba(220,230,245,0.85)';
      ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      if (capital) { ctx.rect(q[0] - 2.6, q[1] - 2.6, 5.2, 5.2); } else ctx.arc(q[0], q[1], mine ? 2.4 : 1.9, 0, TAU);
      ctx.fill(); ctx.stroke();
      if (hit) continue;
      placed.push(box); own.push(box);
      ctx.textAlign = 'left';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(4,7,12,0.85)'; ctx.strokeText(text, q[0] + 6, q[1]);
      ctx.fillStyle = capital ? '#ffe4a6' : mine ? 'rgba(235,242,255,0.95)' : 'rgba(205,218,236,0.8)';
      ctx.fillText(text, q[0] + 6, q[1]);
    }
  }

  // A front between neighbours grows out of their real shared border. Per defender and attacker this keeps the
  // border in projected coordinates, how deep the defender's land lies behind it (so 30% of the bar is 30% of the
  // territory), and anchor points along the border with the direction that leads inland.
  frontBorder(def, att, A) {
    const key = `${def}|${att}|${A === this.atlas.hi ? 'hi' : 'lo'}`;
    if (this.borderCache.has(key)) return this.borderCache.get(key);
    let out = null;
    const ml = pairBorder(A, def, att), path = A.paths.get(def), bx = this.bounds.get(def);
    const lines = (ml?.coordinates || []).map(l => l.map(q => this.projection(q)).filter(Boolean)).filter(l => l.length > 1);
    if (lines.length && path && bx) {
      const segs = [];
      for (const l of lines) for (let i = 1; i < l.length; i++) segs.push([l[i - 1], l[i]]);
      const dist = (x, y) => {
        let m = Infinity;
        for (const [p, q] of segs) {
          const vx = q[0] - p[0], vy = q[1] - p[1], L = vx * vx + vy * vy || 1;
          const t = clamp(((x - p[0]) * vx + (y - p[1]) * vy) / L, 0, 1);
          const d = Math.hypot(x - p[0] - vx * t, y - p[1] - vy * t);
          if (d < m) m = d;
        }
        return m;
      };
      const probe = (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas')).getContext('2d');
      const [[x0, y0], [x1, y1]] = bx, N = 44, ds = [];
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const x = x0 + (x1 - x0) * (i + 0.5) / N, y = y0 + (y1 - y0) * (j + 0.5) / N;
        if (probe.isPointInPath(path, x, y)) ds.push(dist(x, y));
      }
      if (ds.length > 8) {
        ds.sort((p, q) => p - q);
        // Chunks of the border, each with its position along the line, for an uneven, living edge.
        const chunks = [], anchors = [];
        let run = 0;
        const total = segs.reduce((t, [p, q]) => t + Math.hypot(q[0] - p[0], q[1] - p[1]), 0);
        const step = Math.max(2.5, total / 60);
        for (const l of lines) {
          let cur = [l[0]], acc = 0;
          for (let i = 1; i < l.length; i++) {
            const d = Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1]);
            cur.push(l[i]); acc += d; run += d;
            if (acc >= step || i === l.length - 1) {
              chunks.push({ pts: cur, s: run });
              const mid = cur[Math.floor(cur.length / 2)], a = cur[0], b = cur[cur.length - 1];
              let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
              const probeD = Math.max(1.5, ds[ds.length - 1] * 0.05);
              if (!probe.isPointInPath(path, mid[0] + nx * probeD, mid[1] + ny * probeD)) { nx = -nx; ny = -ny; }
              if (probe.isPointInPath(path, mid[0] + nx * probeD, mid[1] + ny * probeD)) anchors.push({ x: mid[0], y: mid[1], nx, ny, s: run });
              cur = [l[i]]; acc = 0;
            }
          }
        }
        out = { lines, quant: ds, chunks, anchors, maxD: ds[ds.length - 1] };
      }
    }
    this.borderCache.set(key, out);
    return out;
  }
  frontDepth(fb, pct) {
    const q = fb.quant;
    if (pct >= 99.5) return fb.maxD * 1.08 + 2;
    const i = clamp(pct / 100, 0, 1) * (q.length - 1), lo = Math.floor(i);
    return q[lo] + (q[Math.min(q.length - 1, lo + 1)] - q[lo]) * (i - lo);
  }
  // Salients and pockets: the depth of the front varies along the border and drifts slowly while the war goes on.
  frontWave(fb, sPos, d, time, seed) {
    const z = sPos / Math.max(10, fb.chunks[fb.chunks.length - 1].s);
    const w = Math.sin(z * 11 + seed) * 0.5 + Math.sin(z * 27 + seed * 1.7 + time * 0.3) * 0.3 + Math.sin(z * 5 + time * 0.18 + seed * 0.3) * 0.2;
    return Math.max(0.6, d * (1 + 0.32 * w) + 1.4 * w);
  }

  drawBorderFront(ctx, { id, f, c, pct, time, k, fb, A, col, by, fighting }) {
    const seed = (Number(id) || 1) + (Number(f.by) || 0) * 0.37;
    const d = this.frontDepth(fb, pct);
    const path = A.paths.get(id);
    // The band is drawn opaque on its own layer, then laid over the map translucently, so overlapping strokes
    // don't stack into darker blotches.
    const W = this.fx.width, H = this.fx.height;
    const layer = this.frontLayer || (this.frontLayer = document.createElement('canvas'));
    if (layer.width !== W || layer.height !== H) { layer.width = W; layer.height = H; }
    const L = layer.getContext('2d'), dpr = this.dpr;
    L.setTransform(1, 0, 0, 1, 0, 0); L.clearRect(0, 0, W, H);
    L.setTransform(dpr * k, 0, 0, dpr * k, dpr * this.cam.x, dpr * this.cam.y);
    L.save(); L.clip(path);
    L.lineCap = 'round'; L.lineJoin = 'round';
    const strokeBand = (extra, style) => {
      L.strokeStyle = style;
      for (const ch of fb.chunks) {
        L.lineWidth = 2 * (this.frontWave(fb, ch.s, d, time, seed) + extra);
        L.beginPath(); ch.pts.forEach((q, i) => (i ? L.lineTo(q[0], q[1]) : L.moveTo(q[0], q[1]))); L.stroke();
      }
    };
    strokeBand(2.2 / k, '#ffb36b');          // the hot edge where the line is
    strokeBand(0, col);                       // ground the attacker holds
    L.globalCompositeOperation = 'source-atop';
    const pat = this.pattern('front' + col, 'rgba(255,255,255,0.28)'); pat.setTransform(new DOMMatrix().scale(1 / k)); L.fillStyle = pat;
    L.fillRect(-1e4, -1e4, 2e4, 2e4);
    L.globalCompositeOperation = 'source-over';
    L.restore();
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 0.66; ctx.drawImage(layer, 0, 0); ctx.restore();
    // The front itself: chevrons pressing inland and flashes of artillery along the edge.
    withCamOn(ctx, dpr, this.cam, () => {
      const sz = 7 / k, n = fb.anchors.length;
      for (let j = 0; j < n; j += Math.max(1, Math.round(n / 9))) {
        const an = fb.anchors[j], dd = this.frontWave(fb, an.s, d, time, seed);
        const v = (time * 0.6 + j * 0.13) % 1, off = dd - 14 / k + v * 12 / k;
        if (off < 0) continue;
        ctx.save(); ctx.translate(an.x + an.nx * off, an.y + an.ny * off); ctx.rotate(Math.atan2(an.ny, an.nx)); ctx.globalAlpha = Math.sin(v * Math.PI) * 0.9;
        ctx.beginPath(); ctx.moveTo(sz, 0); ctx.lineTo(-sz * 0.6, sz * 0.8); ctx.lineTo(-sz * 0.1, 0); ctx.lineTo(-sz * 0.6, -sz * 0.8); ctx.closePath();
        ctx.fillStyle = '#ffe2bd'; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1 / k; ctx.stroke(); ctx.restore();
      }
      if (fighting) this.contactFlashes(ctx, fb, d, time, seed, k);
    });
    // Label at the deepest point of the advance.
    const mid = fb.anchors[Math.floor(fb.anchors.length / 2)];
    if (mid && fb.maxD * k > 30) {
      const dd = this.frontWave(fb, mid.s, d, time, seed);
      const x = (mid.x + mid.nx * dd) * k + this.cam.x, y = (mid.y + mid.ny * dd) * k + this.cam.y;
      this.frontLabel(ctx, x, y, by, pct, col);
    }
  }
  contactFlashes(ctx, fb, d, time, seed, k) {
    const n = fb.anchors.length; if (!n) return;
    for (let j = 0; j < 12; j++) {
      const cyc = time * 1.4 + j * 0.57 + seed * 0.07, m = Math.floor(cyc), v = cyc - m;
      const r = Math.abs(Math.sin(m * 12.9898 + j * 78.233 + seed) * 43758.5453) % 1;
      const an = fb.anchors[Math.floor(r * n)];
      const dd = d > 0 ? this.frontWave(fb, an.s, d, time, seed) : 0;
      const off = dd + ((r * 7.31) % 1 - 0.5) * 8 / k;
      const x = an.x + an.nx * off, y = an.y + an.ny * off, a = Math.max(0, 1 - v * 2.2);
      if (!a) continue;
      ctx.fillStyle = `rgba(255,${200 - v * 120},${120 - v * 80},${a})`;
      ctx.beginPath(); ctx.arc(x, y, (1.1 + v * 3.2) / k, 0, TAU); ctx.fill();
    }
  }
  frontLabel(ctx, x, y, by, pct, col) {
    const name = by ? (this.opts.lang === 'ar' ? by.ar : by.name.toUpperCase()) : '';
    const text = `${name} ${Math.round(pct)}%`;
    ctx.font = this.opts.lang === 'ar' ? '700 11px Cairo, sans-serif' : '700 10px Rajdhani, Inter, sans-serif';
    const tw = ctx.measureText(text).width + 12;
    ctx.fillStyle = 'rgba(8,10,16,0.85)'; ctx.strokeStyle = hexA(col, 0.9); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x - tw / 2, y - 18, tw, 15, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd9b0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y - 10.5);
  }
  // Neighbours at war with no ground taken yet: their shared border glows and flickers with shelling.
  drawContactLines(ctx, time, A) {
    const s = this.state, k = this.cam.k;
    for (const w of s.wars.slice(0, 60)) {
      if (!(s.adjacency[w.a] || []).includes(w.b)) continue;
      if (s.countries[w.a]?.front || s.countries[w.b]?.front) continue;
      if (s.countries[w.a]?.occupiedBy || s.countries[w.b]?.occupiedBy) continue;
      const fb = this.frontBorder(w.b, w.a, A); if (!fb) continue;
      withCamOn(ctx, this.dpr, this.cam, () => {
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.strokeStyle = `rgba(255,90,60,${0.35 + 0.2 * Math.sin(time * 3 + (w.since || 0))})`; ctx.lineWidth = 6 / k;
        for (const l of fb.lines) { ctx.beginPath(); l.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.stroke(); }
        ctx.strokeStyle = '#ffc07a'; ctx.lineWidth = 1.4 / k; ctx.setLineDash([4 / k, 3 / k]); ctx.lineDashOffset = -time * 10 / k;
        for (const l of fb.lines) { ctx.beginPath(); l.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.stroke(); }
        ctx.setLineDash([]);
        this.contactFlashes(ctx, fb, 0, time, (Number(w.a) || 1) * 0.3 + (Number(w.b) || 1), k);
      });
    }
  }

  drawFronts(ctx, now, time, withCam) {
    const s = this.state, k = this.cam.k;
    const A = (this.moving || k < 1.7) ? this.atlas.lo : this.atlas.hi;
    if (this.layers.wars !== false) this.drawContactLines(ctx, time, A);
    for (const [id, f] of Object.entries(this.fronts || {})) {
      const c = s.countries[id], path = this.atlas.lo.paths.get(id);
      if (!c || !path) continue;
      const pct = this.frontPct(id, now);
      const settled = now > f.start + f.dur * 1000;
      if (settled && !f.drawnBase) { f.drawnBase = true; this.dirty = true; }
      if (!settled) f.drawnBase = false;
      if (pct < 0.5 || (c.occupiedBy && settled)) continue; // a fully occupied country is drawn by the base layer
      {
        // Neighbours: the real border bends. Otherwise (a landing, or an attacker from further away) the line sweeps in.
        const fb = this.frontBorder(id, f.by, A);
        if (fb) {
          const by = s.countries[f.by];
          const col = by && by.bloc !== 'N' ? s.blocs[by.bloc].color : '#ff8a3d';
          const fighting = s.wars.some(w => (w.a === f.by && w.b === id) || (w.b === f.by && w.a === id));
          this.drawBorderFront(ctx, { id, f, c, pct, time, k, fb, A, col, by, fighting });
          continue;
        }
      }
      const g = this.frontGeom(id, f.from, pct); if (!g) continue;
      const by = s.countries[f.by];
      const col = by && by.bloc !== 'N' ? s.blocs[by.bloc].color : '#ff8a3d';
      const { fp, dx, dy, R, thr } = g, nx = -dy, ny = dx;
      // An organic line: salients and pockets that shift slowly, like a real front.
      const span = g.tmax - g.tmin, amp = Math.max(1.2, span * 0.06), seed = Number(id) || 1;
      const line = [];
      for (let i = 0; i <= 48; i++) {
        const sN = -R + (2 * R * i) / 48, z = sN / Math.max(8, span);
        const w = amp * (Math.sin(z * 9 + seed) * 0.45 + Math.sin(z * 23 + seed * 1.7 + time * 0.35) * 0.25 + Math.sin(z * 4.1 + time * 0.22 + seed * 0.3) * 0.3);
        line.push([fp[0] + dx * (thr + w) + nx * sN, fp[1] + dy * (thr + w) + ny * sN]);
      }
      const fighting = s.wars.some(w => (w.a === f.by && w.b === id) || (w.b === f.by && w.a === id));
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
        // Artillery and contact flashes flicker along a front that is still being fought over.
        if (fighting) {
          for (let j = 0; j < 9; j++) {
            const cyc = time * 1.3 + j * 0.61 + seed * 0.07, n = Math.floor(cyc), v = cyc - n;
            const r = Math.abs(Math.sin(n * 12.9898 + j * 78.233 + seed) * 43758.5453) % 1;
            const q = line[Math.floor(r * (line.length - 1))];
            const off = ((r * 7.31) % 1 - 0.5) * 10 / k;
            const x = q[0] + dx * off, y = q[1] + dy * off;
            const a = Math.max(0, 1 - v * 2.2);
            if (!a) continue;
            ctx.fillStyle = `rgba(255,${200 - v * 120},${120 - v * 80},${a})`;
            ctx.beginPath(); ctx.arc(x, y, (1.2 + v * 3.4) / k, 0, TAU); ctx.fill();
          }
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
    const k = this.cam.k, hull = k >= 2.6;
    const COL = { tanker: '255,190,100', container: '120,200,240', bulk: '190,200,215', lng: '150,235,200' };
    for (const sh of this.sea.ships) {
      const pos = this.sea.position(sh);
      const q = this.p(pos[0], pos[1]); if (!q || q[0] < -10 || q[0] > this.w + 10 || q[1] < -10 || q[1] > this.h + 10) continue;
      const col = sh.stuck ? '255,178,36' : COL[sh.kind] || COL.container;
      const a = sh.stuck ? 0.55 + 0.3 * Math.sin(time * 3 + pos[0]) : 0.85;
      if (hull && !sh.stuck) {
        // Zoomed in: a small hull pointing along the ship's heading, with a wake.
        const ahead = this.sea.position({ ...sh, t: Math.min(1, sh.t + 0.002) });
        const q2 = this.p(ahead[0], ahead[1]); const ang = q2 ? Math.atan2(q2[1] - q[1], q2[0] - q[0]) : 0;
        const L = (sh.kind === 'tanker' || sh.kind === 'bulk' ? 5 : 4.4) * Math.min(1.6, 0.7 + k * 0.1);
        ctx.save(); ctx.translate(q[0], q[1]); ctx.rotate(ang);
        ctx.strokeStyle = 'rgba(220,240,255,0.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(-L * 3, -L * 0.5); ctx.moveTo(-L, 0); ctx.lineTo(-L * 3, L * 0.5); ctx.stroke();
        ctx.fillStyle = `rgba(${col},${a})`; ctx.beginPath(); ctx.moveTo(L, 0); ctx.lineTo(L * 0.4, -L * 0.38); ctx.lineTo(-L, -L * 0.38); ctx.lineTo(-L, L * 0.38); ctx.lineTo(L * 0.4, L * 0.38); ctx.closePath(); ctx.fill();
        ctx.restore();
      } else {
        const r = (sh.kind === 'tanker' || sh.kind === 'bulk' ? 2 : 1.7) * Math.min(1.8, 0.8 + k * 0.18);
        ctx.fillStyle = `rgba(${col},${a})`; ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, TAU); ctx.fill();
      }
      if (sh.rerouted && !sh.stuck) { ctx.strokeStyle = 'rgba(255,178,36,0.4)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(q[0], q[1], 4, 0, TAU); ctx.stroke(); }
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
      if (u >= 1) { if (fx.type === 'strike' && !fx.e.intercepted && fx.e.to) for (const sp of fx.parts || [{ dx: 0, dy: 0 }]) this.scars.push({ at: fx.e.to, dx: sp.dx || 0, dy: sp.dy || 0, born: now }); continue; }
      keep.push(fx);
      this[`fx_${fx.type}`]?.(ctx, fx, u, now, withCam);
    }
    this.effects = keep;
    // Fading impact marks
    this.scars = (this.scars || []).filter(sc => now - sc.born < 14000);
    for (const sc of this.scars) {
      const q = this.pt(sc.at); if (!q) continue;
      const a = 1 - (now - sc.born) / 14000, x = q[0] + (sc.dx || 0), y = q[1] + (sc.dy || 0);
      ctx.fillStyle = `rgba(255,120,60,${0.5 * a})`; ctx.beginPath(); ctx.arc(x, y, 1.8, 0, TAU); ctx.fill();
      // A thin smoke column drifting off the impact.
      ctx.fillStyle = `rgba(150,150,160,${0.18 * a})`;
      for (let i = 1; i <= 3; i++) { const age = ((now - sc.born) / 1000 + i * 0.7) % 2.1; ctx.beginPath(); ctx.arc(x + age * 2.5, y - age * 6, 1.5 + age * 1.6, 0, TAU); ctx.fill(); }
    }
  }

  // Each weapon has its own look: missiles fly in salvos on ballistic arcs, bombers make a long carpet-bombing run,
  // and fighter jets go in fast as a pair, lock a single target and drop precision-guided bombs.
  fx_strike(ctx, fx, u, now) {
    const t = fx.e.unitType;
    if (t === 'missile') return this.strikeMissiles(ctx, fx, u);
    if (t === 'bomber') return this.strikeBomber(ctx, fx, u, now);
    return this.strikeJets(ctx, fx, u, now);
  }

  // A salvo, not a single dot: several missiles leave together, spread out, and either get through to scattered
  // impact points or are met by interceptors rising from the target.
  strikeMissiles(ctx, fx, u) {
    const e = fx.e;
    const a = this.pt(e.from) || this.countryPoint(e.owner), endPt = e.intercepted ? (e.at || e.to) : e.to;
    const b = this.pt(endPt) || this.countryPoint(e.target);
    if (!a || !b) return;
    const m = e.unitType === 'missile';
    if (!fx.parts) {
      const n = m ? 5 : e.unitType === 'bomber' ? 4 : 3;
      let seed = Math.floor(Math.random() * 1e9);
      const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      fx.parts = Array.from({ length: n }, (_, i) => {
        const ang = rnd() * TAU, r = 4 + rnd() * 13;
        return { delay: i * 0.05 + rnd() * 0.05, bend: (m ? -0.3 : 0.1) + (rnd() - 0.5) * 0.16, dx: Math.cos(ang) * r, dy: Math.sin(ang) * r * 0.7,
          ox: (rnd() - 0.5) * 6, oy: (rnd() - 0.5) * 6, stopped: e.intercepted || (m && rnd() < 0.2), meet: 0.66 + rnd() * 0.14 };
      });
    }
    const col = m ? '255,96,70' : '255,196,100';
    const travel = 0.62;
    for (const sp of fx.parts) {
      const su = clamp((u - sp.delay) / (1 - sp.delay), 0, 1); if (!su) continue;
      const A = [a[0] + sp.ox, a[1] + sp.oy], B = [b[0] + sp.dx, b[1] + sp.dy];
      const end = sp.stopped ? sp.meet : 1;
      const v = Math.min(end, ease(su / travel));
      if (su < travel || (sp.stopped ? false : v < 1)) {
        // Trail and glowing head.
        ctx.strokeStyle = `rgba(${col},0.5)`; ctx.lineWidth = m ? 1.3 : 1;
        ctx.beginPath();
        const v0 = Math.max(0, v - 0.3);
        for (let i = 0; i <= 16; i++) { const q = this.onCurve(A, B, v0 + (v - v0) * i / 16, sp.bend); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
        ctx.stroke();
        if (v < end) {
          const h = this.onCurve(A, B, v, sp.bend);
          ctx.fillStyle = `rgba(${col},1)`; ctx.shadowColor = `rgba(${col},1)`; ctx.shadowBlur = 8;
          if (m) { ctx.beginPath(); ctx.arc(h[0], h[1], 1.8, 0, TAU); ctx.fill(); }
          else { ctx.save(); ctx.translate(h[0], h[1]); ctx.rotate(h[2]); ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(-3, 3); ctx.lineTo(-1.5, 0); ctx.lineTo(-3, -3); ctx.closePath(); ctx.fill(); ctx.restore(); }
          ctx.shadowBlur = 0;
        }
      }
      if (sp.stopped) {
        // An interceptor climbs from the defended area and meets the incoming weapon.
        const meetPt = this.onCurve(A, B, sp.meet, sp.bend);
        const launchAt = 0.25, iv = clamp((su - launchAt) / (travel - launchAt), 0, 1);
        if (iv > 0 && iv < 1) {
          const src = [b[0] + sp.dy * 0.6, b[1] + 6], hp = [src[0] + (meetPt[0] - src[0]) * ease(iv), src[1] + (meetPt[1] - src[1]) * ease(iv)];
          ctx.strokeStyle = 'rgba(160,230,255,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(src[0], src[1]); ctx.lineTo(hp[0], hp[1]); ctx.stroke();
          ctx.fillStyle = '#d8f6ff'; ctx.beginPath(); ctx.arc(hp[0], hp[1], 1.4, 0, TAU); ctx.fill();
        }
        const bv = (su - travel) / (1 - travel);
        if (bv > 0 && bv < 1) {
          ctx.strokeStyle = `rgba(210,245,255,${1 - bv})`; ctx.lineWidth = 1.2;
          for (let i = 0; i < 6; i++) { const ang = i * TAU / 6; ctx.beginPath(); ctx.moveTo(meetPt[0] + Math.cos(ang) * 1.5, meetPt[1] + Math.sin(ang) * 1.5); ctx.lineTo(meetPt[0] + Math.cos(ang) * (3 + bv * 7), meetPt[1] + Math.sin(ang) * (3 + bv * 7)); ctx.stroke(); }
          ctx.fillStyle = `rgba(255,255,255,${0.8 * (1 - bv)})`; ctx.beginPath(); ctx.arc(meetPt[0], meetPt[1], 2 + bv * 2, 0, TAU); ctx.fill();
        }
        continue;
      }
      // Impact: a hot flash, a ring and rising smoke.
      const iv = (su - travel) / (1 - travel);
      if (iv > 0) {
        const r = 2.5 + ease(iv) * 13;
        const g = ctx.createRadialGradient(B[0], B[1], 0, B[0], B[1], r);
        g.addColorStop(0, `rgba(255,245,210,${0.95 * (1 - iv)})`); g.addColorStop(0.45, `rgba(255,130,50,${0.6 * (1 - iv)})`); g.addColorStop(1, 'rgba(255,60,30,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(B[0], B[1], r, 0, TAU); ctx.fill();
        ctx.strokeStyle = `rgba(255,170,100,${0.8 * (1 - iv)})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(B[0], B[1], r * 1.4, 0, TAU); ctx.stroke();
        ctx.fillStyle = `rgba(120,120,130,${0.35 * (1 - iv)})`;
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(B[0] + (i - 1) * 2 + iv * 3, B[1] - iv * (8 + i * 4), 2 + iv * 3, 0, TAU); ctx.fill(); }
      }
    }
  }
  fx_scrubbed(ctx, fx, u) {
    // Storms over the route: the aircraft head out, then turn back to base.
    const e = fx.e, a = this.pt(e.from) || this.countryPoint(e.owner), b = this.pt(e.to) || this.countryPoint(e.target);
    if (!a || !b) return;
    const out = [a[0] + (b[0] - a[0]) * 0.3, a[1] + (b[1] - a[1]) * 0.3];
    const v = u < 0.5 ? ease(u / 0.5) : 1 - easeInOut((u - 0.5) / 0.5);
    const x = a[0] + (out[0] - a[0]) * v, y = a[1] + (out[1] - a[1]) * v;
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + (u < 0.5 ? 0 : Math.PI);
    ctx.globalAlpha = u > 0.85 ? (1 - u) / 0.15 : 1;
    this.drawJet(ctx, x, y, ang, 5, '#ffd27a');
    if (u > 0.35 && u < 0.75) this.tag(ctx, x, y - 12, 'WEATHER ABORT', '#9fd8ff');
    ctx.globalAlpha = 1;
  }

  // Aircraft silhouettes, nose along +x. Drawn in screen pixels so they read at any zoom.
  drawJet(ctx, x, y, ang, s, color) {
    const P = [[1, 0], [0.25, 0.12], [-0.05, 0.72], [-0.3, 0.72], [-0.25, 0.16], [-0.68, 0.14], [-0.86, 0.42], [-1, 0.42], [-0.92, 0]];
    this.silhouette(ctx, x, y, ang, s, color, P);
  }
  drawBomber(ctx, x, y, ang, s, color) {
    const P = [[1.1, 0], [0.55, 0.07], [0.15, 0.1], [-0.2, 1.05], [-0.38, 1.05], [-0.22, 0.1], [-0.8, 0.08], [-0.98, 0.42], [-1.1, 0.42], [-1.02, 0]];
    this.silhouette(ctx, x, y, ang, s, color, P);
  }
  silhouette(ctx, x, y, ang, s, color, P) {
    // A faint ground shadow sells the altitude.
    ctx.save(); ctx.translate(x + s * 0.5, y + s * 0.9); ctx.rotate(ang); ctx.scale(s, s);
    ctx.beginPath(); P.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); for (let i = P.length - 1; i >= 0; i--) ctx.lineTo(P[i][0], -P[i][1]);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(s, s);
    ctx.beginPath(); P.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); for (let i = P.length - 1; i >= 0; i--) ctx.lineTo(P[i][0], -P[i][1]);
    ctx.closePath(); ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 6; ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 0.6 / s; ctx.stroke();
    ctx.restore();
  }
  tag(ctx, x, y, text, color) {
    ctx.font = '700 9px Rajdhani, Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 10;
    ctx.fillStyle = 'rgba(8,10,16,0.82)'; ctx.beginPath(); ctx.roundRect(x - w / 2, y - 7, w, 14, 7); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke(); ctx.fillStyle = color; ctx.fillText(text, x, y + 0.5);
  }
  boom(ctx, x, y, r, iv, hot = 1) {
    const R = r * (0.35 + ease(iv) * 0.9);
    const g = ctx.createRadialGradient(x, y, 0, x, y, R);
    g.addColorStop(0, `rgba(255,248,220,${0.95 * (1 - iv) * hot})`); g.addColorStop(0.45, `rgba(255,140,55,${0.7 * (1 - iv)})`); g.addColorStop(1, 'rgba(255,60,30,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(110,110,120,${0.4 * (1 - iv)})`;
    for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.arc(x + (i - 0.5) * 2 + iv * 3, y - iv * (6 + i * 4), 1.6 + iv * r * 0.25, 0, TAU); ctx.fill(); }
  }
  // A surface-to-air missile climbing to meet an aircraft, and the aircraft breaking up into a falling smoke trail.
  shootDown(ctx, src, hit, iv, fall) {
    if (iv > 0 && iv < 1) {
      const hp = [src[0] + (hit[0] - src[0]) * ease(iv), src[1] + (hit[1] - src[1]) * ease(iv)];
      ctx.strokeStyle = 'rgba(160,230,255,0.65)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(src[0], src[1]); ctx.lineTo(hp[0], hp[1]); ctx.stroke();
      ctx.fillStyle = '#e4f8ff'; ctx.beginPath(); ctx.arc(hp[0], hp[1], 1.4, 0, TAU); ctx.fill();
    }
    if (fall > 0 && fall < 1) {
      this.boom(ctx, hit[0], hit[1], 9, Math.min(1, fall * 2.5));
      ctx.strokeStyle = `rgba(140,140,150,${0.55 * (1 - fall)})`; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(hit[0], hit[1]);
      for (let i = 1; i <= 10; i++) { const f = fall * i / 10; ctx.lineTo(hit[0] + Math.sin(f * 9) * 3 + f * 8, hit[1] + f * f * 26); }
      ctx.stroke();
    }
  }
  pathPoint(pts, v) {
    // Position and heading along a polyline at fraction v of its length.
    let total = 0; const seg = [];
    for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); total += d; }
    let d = clamp(v, 0, 1) * total;
    for (let i = 0; i < seg.length; i++) {
      if (d <= seg[i] || i === seg.length - 1) { const f = seg[i] ? Math.min(1, d / seg[i]) : 0, A = pts[i], B = pts[i + 1]; return [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, Math.atan2(B[1] - A[1], B[0] - A[0])]; }
      d -= seg[i];
    }
    return [...pts[pts.length - 1], 0];
  }

  // Carpet bombing: a heavy bomber cruises in, flies a straight run across the target and walks a line of
  // explosions behind it, then turns for home. Escort fighters fly alongside when the order had them.
  strikeBomber(ctx, fx, u, now) {
    const e = fx.e, a = this.pt(e.from) || this.countryPoint(e.owner), b = this.pt(e.to) || this.countryPoint(e.target);
    if (!a || !b) return;
    const sc = clamp(Math.sqrt(this.cam.k), 1, 2.2);
    let dx = b[0] - a[0], dy = b[1] - a[1]; const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    const L = 46 * sc, nx = -dy, ny = dx;
    const run0 = [b[0] - dx * L / 2, b[1] - dy * L / 2], run1 = [b[0] + dx * L / 2, b[1] + dy * L / 2];
    const exit = [run1[0] + dx * 30 * sc + nx * 40 * sc, run1[1] + dy * 30 * sc + ny * 40 * sc];
    if (!fx.parts) {
      const n = 11;
      fx.parts = Array.from({ length: n }, (_, i) => { const f = i / (n - 1) - 0.5; return { f: i / (n - 1), dx: dx * L * f + nx * (Math.random() - 0.5) * 9 * sc, dy: dy * L * f + ny * (Math.random() - 0.5) * 9 * sc }; });
    }
    const T1 = 0.5, T2 = 0.78; // transit ends, bomb run ends
    const route = [a, run0], egress = [run1, exit];
    let pos, ang;
    if (u < T1) [pos, ang] = (() => { const q = this.pathPoint(route, easeInOut(u / T1)); return [q, q[2]]; })();
    else if (u < T2) { const v = (u - T1) / (T2 - T1); pos = [run0[0] + (run1[0] - run0[0]) * v, run0[1] + (run1[1] - run0[1]) * v]; ang = Math.atan2(dy, dx); }
    else { const q = this.pathPoint(egress, ease((u - T2) / (1 - T2))); pos = q; ang = q[2]; }
    const downed = e.intercepted, meet = 0.42;
    // Contrails: two thin white lines streaming off the wings.
    const trail = [];
    for (let i = 0; i <= 14; i++) {
      const w = Math.max(0, (downed ? Math.min(u, meet) : u) - i * 0.012);
      const q = w < T1 ? this.pathPoint(route, easeInOut(w / T1)) : w < T2 ? [run0[0] + (run1[0] - run0[0]) * (w - T1) / (T2 - T1), run0[1] + (run1[1] - run0[1]) * (w - T1) / (T2 - T1)] : this.pathPoint(egress, ease((w - T2) / (1 - T2)));
      trail.push(q);
    }
    for (const side of [-1, 1]) {
      ctx.strokeStyle = 'rgba(235,240,255,0.32)'; ctx.lineWidth = 1; ctx.beginPath();
      trail.forEach((q, i) => { const x = q[0] + nx * side * 3 * sc, y = q[1] + ny * side * 3 * sc; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
    }
    const owner = this.state.countries[e.owner];
    const col = owner && owner.bloc !== 'N' ? this.state.blocs[owner.bloc].color : '#ffd27a';
    if (downed) {
      const hitPt = this.pathPoint(route, easeInOut(meet / T1));
      if (u < meet) { this.drawBomber(ctx, pos[0], pos[1], ang, 8 * sc, '#e8eef8'); this.escorts(ctx, e, pos, ang, sc, col); }
      else this.escorts(ctx, e, this.pathPoint([hitPt, a], ease((u - meet) / (1 - meet))), ang + Math.PI, sc, col);
      this.shootDown(ctx, this.pt(e.at) || b, hitPt, (u - 0.22) / (meet - 0.22), (u - meet) / 0.35);
      return;
    }
    const fade = u > 0.9 ? (1 - u) / 0.1 : 1;
    ctx.globalAlpha = fade;
    this.drawBomber(ctx, pos[0], pos[1], ang, 8 * sc, '#e8eef8');
    this.escorts(ctx, e, pos, ang, sc, col);
    ctx.globalAlpha = 1;
    // Bombs fall behind the aircraft and burst one after another along the line.
    for (const sp of fx.parts) {
      const rel = T1 + sp.f * (T2 - T1), fallT = 0.035;
      const x = b[0] + sp.dx, y = b[1] + sp.dy;
      if (u > rel && u < rel + fallT) { ctx.fillStyle = '#2a2f3a'; ctx.beginPath(); ctx.arc(x, y - (1 - (u - rel) / fallT) * 4, 1.1, 0, TAU); ctx.fill(); }
      const iv = (u - rel - fallT) / 0.22;
      if (iv > 0 && iv < 1) this.boom(ctx, x, y, 7 * sc, iv);
    }
    if (u > T1 - 0.05 && u < T2 + 0.08) this.tag(ctx, b[0], b[1] - 22 * sc, 'CARPET BOMBING', '#ffb36b');
  }
  escorts(ctx, e, pos, ang, sc, col) {
    if (!e.escort) return;
    for (const side of [-1, 1]) {
      const ox = Math.cos(ang + side * 2.3) * 13 * sc, oy = Math.sin(ang + side * 2.3) * 13 * sc;
      this.drawJet(ctx, pos[0] + ox, pos[1] + oy, ang, 3.6 * sc, col);
    }
  }

  // Precision strike: a pair of fast jets races in, the lead paints the target with a laser, each drops one
  // guided bomb that lands exactly on the mark, and both pull a hard turn for home.
  strikeJets(ctx, fx, u, now) {
    const e = fx.e, a = this.pt(e.from) || this.countryPoint(e.owner), b = this.pt(e.to) || this.countryPoint(e.target);
    if (!a || !b) return;
    const sc = clamp(Math.sqrt(this.cam.k), 1, 2.2);
    let dx = b[0] - a[0], dy = b[1] - a[1]; const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    const nx = -dy, ny = dx;
    const stand = Math.min(len * 0.4, 38 * sc);
    const rel = [b[0] - dx * stand, b[1] - dy * stand];
    const turnDir = fx.turn || (fx.turn = Math.random() < 0.5 ? -1 : 1);
    const away = [rel[0] + nx * turnDir * 26 * sc - dx * 8 * sc, rel[1] + ny * turnDir * 26 * sc - dy * 8 * sc];
    const home = [a[0] + nx * turnDir * 10, a[1] + ny * turnDir * 10];
    if (!fx.parts) fx.parts = [{ dx: 0, dy: 0 }, { dx: nx * 5 * sc + dx * 2, dy: ny * 5 * sc + dy * 2 }];
    const T1 = 0.42, TR = 0.62; // release point reached; bombs land
    const inbound = [a, rel], outbound = [rel, away, home];
    const where = w => (w < T1 ? this.pathPoint(inbound, easeInOut(w / T1)) : this.pathPoint(outbound, ease((w - T1) / (1 - T1))));
    const owner = this.state.countries[e.owner];
    const col = e.unitType === 'carrier' ? '#9fe0ff' : '#ffd27a';
    const downed = e.intercepted, meet = 0.34;
    for (const [k, side] of [[0, -1], [1, 1]]) {
      const lag = k * 0.02, w = Math.max(0, u - lag);
      if (downed && k === 0 && u > meet) continue;
      const q = where(downed && k === 1 && u > meet ? Math.min(w, meet) - (w - meet) * 0.5 : w);
      // Afterburner streak.
      const p0 = where(Math.max(0, w - 0.05));
      const off = [nx * side * 4 * sc, ny * side * 4 * sc];
      ctx.strokeStyle = 'rgba(255,200,140,0.35)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(p0[0] + off[0], p0[1] + off[1]); ctx.lineTo(q[0] + off[0], q[1] + off[1]); ctx.stroke();
      const fade = u > 0.9 ? (1 - u) / 0.1 : 1;
      ctx.globalAlpha = fade;
      this.drawJet(ctx, q[0] + off[0], q[1] + off[1], downed && k === 1 && u > meet ? q[2] + Math.PI : q[2], 4.6 * sc, col);
      ctx.globalAlpha = 1;
    }
    if (downed) { this.shootDown(ctx, this.pt(e.at) || b, where(meet), (u - 0.18) / (meet - 0.18), (u - meet) / 0.35); return; }
    // Target lock: closing brackets, then the laser spot.
    const lockIv = (u - 0.18) / (T1 - 0.18);
    if (lockIv > 0 && u < TR + 0.08) {
      const r = (14 - 8 * ease(Math.min(1, lockIv))) * sc, c = lockIv >= 1 ? '#7dffb0' : '#c8ffd9';
      ctx.strokeStyle = c; ctx.lineWidth = 1.2;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        ctx.beginPath(); ctx.moveTo(b[0] + sx * r, b[1] + sy * r * 0.5); ctx.lineTo(b[0] + sx * r, b[1] + sy * r); ctx.lineTo(b[0] + sx * r * 0.5, b[1] + sy * r); ctx.stroke();
      }
      if (lockIv >= 1) this.tag(ctx, b[0], b[1] - 20 * sc, 'TARGET LOCKED', '#7dffb0');
      const lead = where(u);
      if (u > T1 - 0.08) { ctx.strokeStyle = 'rgba(120,255,170,0.55)'; ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.moveTo(lead[0], lead[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]); }
      ctx.fillStyle = `rgba(140,255,180,${0.6 + 0.4 * Math.sin(now / 60)})`; ctx.beginPath(); ctx.arc(b[0], b[1], 1.6, 0, TAU); ctx.fill();
    }
    // Guided bombs glide from the release point onto the mark.
    for (const [i, sp] of fx.parts.entries()) {
      const r0 = T1 + i * 0.02, gv = (u - r0) / (TR - T1);
      const tx = b[0] + sp.dx, ty = b[1] + sp.dy;
      if (gv > 0 && gv < 1) {
        const x = rel[0] + (tx - rel[0]) * gv, y = rel[1] + (ty - rel[1]) * gv - Math.sin(gv * Math.PI) * 6;
        ctx.fillStyle = '#e8eef8'; ctx.beginPath(); ctx.arc(x, y, 1.3, 0, TAU); ctx.fill();
      }
      const iv = (u - r0 - (TR - T1)) / 0.25;
      if (iv > 0 && iv < 1) {
        // A tight, bright hit: small radius, sharp ring. Precision, not area damage.
        this.boom(ctx, tx, ty, 5 * sc, iv, 1.2);
        ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - iv)})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(tx, ty, 2 + iv * 7 * sc, 0, TAU); ctx.stroke();
      }
    }
    if (u > TR && u < TR + 0.25) this.tag(ctx, b[0], b[1] - 20 * sc, 'PRECISION STRIKE', '#ffd27a');
  }
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
  // A naval battle: two battle groups trade missile salvos; the losing side takes hits and loses ships.
  fx_naval(ctx, fx, u) {
    const e = fx.e, q = this.pt(e.at); if (!q) return;
    const S = this.state, colOf = id => { const c = S.countries[id]; return c && c.bloc !== 'N' ? S.blocs[c.bloc].color : '#c8d2e0'; };
    if (!fx.geo) {
      const ang = Math.random() * Math.PI, gap = 22;
      const n = x => clamp(x || 3, 1, 7);
      const ships = (cx, cy, count, lost) => Array.from({ length: count }, (_, i) => ({ x: cx + (i % 3 - 1) * 7 + (Math.random() - 0.5) * 3, y: cy + (Math.floor(i / 3) - 0.5) * 7 + (Math.random() - 0.5) * 3, sunk: i < lost, at: 0.35 + Math.random() * 0.45 }));
      const wc = [Math.cos(ang) * -gap, Math.sin(ang) * -gap], lc = [Math.cos(ang) * gap, Math.sin(ang) * gap];
      const wN = n(e.ships?.winner), lN = n(e.ships?.loser);
      fx.geo = { win: ships(wc[0], wc[1], wN, Math.min(wN - 1, e.lost?.winner || 0)), lose: ships(lc[0], lc[1], lN, Math.min(lN, e.lost?.loser ?? Math.ceil(lN / 2))),
        shots: Array.from({ length: 16 }, (_, i) => ({ fromWin: i % 4 !== 3, t: 0.05 + (i / 16) * 0.6, bend: (Math.random() - 0.5) * 0.5, si: Math.floor(Math.random() * 7), ti: Math.floor(Math.random() * 7) })) };
    }
    const { win, lose, shots } = fx.geo;
    const fade = u > 0.85 ? 1 - (u - 0.85) / 0.15 : 1;
    ctx.save(); ctx.globalAlpha = fade;
    const drawShip = (sh, col, flip) => {
      if (sh.sunk && u > sh.at + 0.25) return;
      const sinking = sh.sunk && u > sh.at ? (u - sh.at) / 0.25 : 0;
      ctx.save(); ctx.translate(q[0] + sh.x, q[1] + sh.y + sinking * 3); ctx.scale(flip, 1); ctx.globalAlpha = fade * (1 - sinking);
      ctx.fillStyle = 'rgba(4,6,11,0.9)'; ctx.strokeStyle = col; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-5, -1); ctx.lineTo(5, -1); ctx.lineTo(3, 2.5); ctx.lineTo(-4, 2.5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-1, -1); ctx.lineTo(-1, -4); ctx.lineTo(1.5, -1); ctx.stroke();
      ctx.restore();
      if (sinking > 0 && sinking < 1) { ctx.fillStyle = `rgba(255,150,60,${1 - sinking})`; ctx.beginPath(); ctx.arc(q[0] + sh.x, q[1] + sh.y, 2 + sinking * 7, 0, TAU); ctx.fill(); }
    };
    win.forEach(sh => drawShip(sh, colOf(e.winner), 1));
    lose.forEach(sh => drawShip(sh, colOf(e.loser), -1));
    // Missile exchange.
    for (const sh of shots) {
      const v = (u - sh.t) / 0.22; if (v <= 0 || v >= 1.25) continue;
      const src = (sh.fromWin ? win : lose)[sh.si % (sh.fromWin ? win : lose).length], dst = (sh.fromWin ? lose : win)[sh.ti % (sh.fromWin ? lose : win).length];
      const A = [q[0] + src.x, q[1] + src.y], B = [q[0] + dst.x, q[1] + dst.y];
      if (v < 1) {
        const h = this.onCurve(A, B, ease(v), sh.bend);
        ctx.strokeStyle = sh.fromWin ? 'rgba(255,220,150,0.6)' : 'rgba(255,140,140,0.5)'; ctx.lineWidth = 1;
        ctx.beginPath(); const t0 = this.onCurve(A, B, Math.max(0, ease(v) - 0.25), sh.bend); ctx.moveTo(t0[0], t0[1]); ctx.lineTo(h[0], h[1]); ctx.stroke();
        ctx.fillStyle = '#fff1d6'; ctx.beginPath(); ctx.arc(h[0], h[1], 1.3, 0, TAU); ctx.fill();
      } else {
        // Losers' missiles are mostly shot down short of the target; the winners' land.
        const w = (v - 1) / 0.25, hitPt = sh.fromWin ? B : this.onCurve(A, B, 0.85, sh.bend);
        ctx.fillStyle = sh.fromWin ? `rgba(255,170,80,${1 - w})` : `rgba(200,240,255,${1 - w})`;
        ctx.beginPath(); ctx.arc(hitPt[0], hitPt[1], 2 + w * 5, 0, TAU); ctx.fill();
      }
    }
    // Spray and the battle label.
    ctx.strokeStyle = `rgba(54,226,255,${0.5 * (1 - u)})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(q[0], q[1], 34 + u * 18, 0, TAU); ctx.stroke();
    const name = SEA_ZONES[e.zone] ? (this.opts.lang === 'ar' ? SEA_ZONES[e.zone].ar : SEA_ZONES[e.zone].name.toUpperCase()) : '';
    ctx.font = this.opts.lang === 'ar' ? '700 11px Cairo, sans-serif' : '700 10px Rajdhani, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const label = this.opts.lang === 'ar' ? `معركة بحرية · ${name}` : `NAVAL BATTLE · ${name}`;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(label, q[0] + 1, q[1] - 45);
    ctx.fillStyle = '#bff3ff'; ctx.fillText(label, q[0], q[1] - 46);
    ctx.restore();
  }
  // Amphibious landing: landing craft run in from the fleet and come ashore on the nearest coast.
  fx_landing(ctx, fx, u) {
    const e = fx.e, path = this.atlas.lo.paths.get(e.country);
    if (!fx.beach) {
      const zp = this.projection([e.from.lon, e.from.lat]), tc = this.centroids.get(e.country);
      if (!zp || !tc || !path) return;
      this.hitCtx ||= new OffscreenCanvas(1, 1).getContext('2d');
      let hit = tc;
      for (let i = 1; i <= 60; i++) { const t = i / 60, x = zp[0] + (tc[0] - zp[0]) * t, y = zp[1] + (tc[1] - zp[1]) * t; if (this.hitCtx.isPointInPath(path, x, y)) { hit = [x, y]; break; } }
      fx.beach = hit; fx.zp = zp;
    }
    const k = this.cam.k, S = p => [p[0] * k + this.cam.x, p[1] * k + this.cam.y];
    const A = S(fx.zp), B = S(fx.beach);
    const own = this.state.countries[e.owner], col = own && own.bloc !== 'N' ? this.state.blocs[own.bloc].color : '#c8d2e0';
    const ang = Math.atan2(B[1] - A[1], B[0] - A[0]), nx = -Math.sin(ang), ny = Math.cos(ang);
    const fade = u > 0.85 ? 1 - (u - 0.85) / 0.15 : 1;
    ctx.save(); ctx.globalAlpha = fade;
    // Escorts holding offshore.
    for (let i = -1; i <= 1; i++) {
      const x = A[0] + nx * i * 10, y = A[1] + ny * i * 10;
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.fillStyle = 'rgba(4,6,11,0.9)'; ctx.strokeStyle = col; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-5, -2.5); ctx.lineTo(-5, 2.5); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    // Landing craft in waves, each with a white wake.
    const n = clamp((e.n || 2) * 2, 4, 10);
    for (let i = 0; i < n; i++) {
      const lane = (i - (n - 1) / 2) * 5, start = (i % 3) * 0.08;
      const v = clamp((u - start) / 0.55, 0, 1); if (!v) continue;
      const t = ease(v), x = A[0] + (B[0] - A[0]) * t + nx * lane * (1 - t * 0.5), y = A[1] + (B[1] - A[1]) * t + ny * lane * (1 - t * 0.5);
      ctx.strokeStyle = 'rgba(220,240,255,0.55)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - Math.cos(ang) * 9 * (1 - t * 0.6), y - Math.sin(ang) * 9 * (1 - t * 0.6)); ctx.stroke();
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.fillStyle = col; ctx.fillRect(-2.5, -1.6, 5, 3.2); ctx.restore();
      if (e.contested && v < 1 && (i + Math.floor(u * 20)) % 4 === 0) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(x + nx * 4, y + ny * 4, 1.6, 0, TAU); ctx.fill(); }
    }
    // The beachhead.
    const bv = clamp((u - 0.5) / 0.3, 0, 1);
    if (bv > 0) {
      ctx.strokeStyle = hexA(col, 1 - bv * 0.5); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(B[0], B[1], 6 + bv * 10, ang - 1.4, ang + 1.4); ctx.stroke();
      ctx.fillStyle = '#ffe2bd'; ctx.beginPath(); ctx.moveTo(B[0], B[1]); ctx.lineTo(B[0], B[1] - 12); ctx.lineTo(B[0] + 7, B[1] - 9); ctx.lineTo(B[0], B[1] - 6); ctx.fill();
      ctx.font = '700 10px Rajdhani, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(this.opts.lang === 'ar' ? 'إنزال برمائي' : 'AMPHIBIOUS LANDING', B[0] + 1, B[1] + 17);
      ctx.fillStyle = '#ffe2bd'; ctx.fillText(this.opts.lang === 'ar' ? 'إنزال برمائي' : 'AMPHIBIOUS LANDING', B[0], B[1] + 16);
    }
    ctx.restore();
  }
  // Evacuation (NEO): an embassy beacon, a counter of people brought out, and a stream of transports to safety,
  // or helicopters shuttling to a ship offshore when the airspace is shut.
  fx_neo(ctx, fx, u, now) {
    const e = fx.e, A = this.pt(e.from), B = this.pt(e.to), Sea = e.sea && this.pt(e.sea);
    if (!A || !B) return;
    const own = this.state.countries[e.owner];
    const col = '#ffd678';
    const fade = u > 0.88 ? 1 - (u - 0.88) / 0.12 : 1;
    const time = now / 1000;
    ctx.save(); ctx.globalAlpha = fade;
    // Beacon at the embassy.
    for (let i = 0; i < 3; i++) { const v = (time * 0.8 + i / 3) % 1; ctx.strokeStyle = `rgba(255,214,120,${0.8 * (1 - v)})`; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(A[0], A[1], 4 + v * 22, 0, TAU); ctx.stroke(); }
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(A[0], A[1] - 6); ctx.lineTo(A[0] + 5, A[1]); ctx.lineTo(A[0], A[1] + 6); ctx.lineTo(A[0] - 5, A[1]); ctx.closePath(); ctx.fill();
    if (Sea) {
      // Ship offshore, helicopters shuttling back and forth, then the ship sails for safety.
      const sail = clamp((u - 0.7) / 0.3, 0, 1), shipPt = [Sea[0] + (B[0] - Sea[0]) * ease(sail) * 0.35, Sea[1] + (B[1] - Sea[1]) * ease(sail) * 0.35];
      ctx.save(); ctx.translate(shipPt[0], shipPt[1]); ctx.fillStyle = 'rgba(4,6,11,0.9)'; ctx.strokeStyle = col; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-9, -2); ctx.lineTo(9, -2); ctx.lineTo(6, 4); ctx.lineTo(-6, 4); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = col; ctx.fillRect(-4, -5, 8, 3); ctx.restore();
      for (let h = 0; h < 3; h++) {
        const cyc = clamp(u / 0.72, 0, 1) * 2.2 - h * 0.25; if (cyc < 0 || cyc > 2) continue;
        const leg = cyc % 1, out = Math.floor(cyc) % 2 === 0;
        const t = easeInOut(leg), P = out ? [A[0] + (shipPt[0] - A[0]) * t, A[1] + (shipPt[1] - A[1]) * t] : [shipPt[0] + (A[0] - shipPt[0]) * t, shipPt[1] + (A[1] - shipPt[1]) * t];
        ctx.fillStyle = '#fff3d1'; ctx.beginPath(); ctx.arc(P[0], P[1], 1.8, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255,243,209,0.7)'; ctx.lineWidth = 0.8; const r = (time * 30) % TAU;
        ctx.beginPath(); ctx.moveTo(P[0] + Math.cos(r) * 4, P[1] + Math.sin(r) * 4); ctx.lineTo(P[0] - Math.cos(r) * 4, P[1] - Math.sin(r) * 4); ctx.stroke();
      }
    } else {
      // Transport aircraft streaming out along the air bridge.
      ctx.setLineDash([3, 5]); ctx.lineDashOffset = -time * 20; ctx.strokeStyle = 'rgba(255,214,120,0.35)'; ctx.lineWidth = 1;
      this.curve(ctx, A, B, 0.15); ctx.stroke(); ctx.setLineDash([]);
      for (let i = 0; i < 7; i++) {
        const v = clamp((u - i * 0.08) / 0.42, 0, 1); if (!v || v >= 1) continue;
        const h = this.onCurve(A, B, easeInOut(v), 0.15);
        ctx.save(); ctx.translate(h[0], h[1]); ctx.rotate(h[2]); ctx.fillStyle = '#fff3d1'; ctx.shadowColor = col; ctx.shadowBlur = 6;
        ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, 1.2); ctx.lineTo(-5, 0); ctx.lineTo(-4, -1.2); ctx.closePath(); ctx.fill();
        ctx.fillRect(-1, -5, 2.2, 10); ctx.fillRect(-5, -2.2, 1.6, 4.4); ctx.restore();
      }
      ctx.strokeStyle = `rgba(255,214,120,0.7)`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(B[0], B[1], 5, 0, TAU); ctx.stroke();
    }
    // Counter.
    const count = Math.round(e.evacuees * clamp(u / 0.8, 0, 1) / 10) * 10;
    const name = own ? (this.opts.lang === 'ar' ? own.ar : own.name.toUpperCase()) : '';
    const l1 = this.opts.lang === 'ar' ? `إجلاء · ${name}` : `EVACUATION · ${name}`;
    const l2 = this.opts.lang === 'ar' ? `${count.toLocaleString('en-US')} تم إجلاؤهم` : `${count.toLocaleString('en-US')} evacuated`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = this.opts.lang === 'ar' ? '700 12px Cairo, sans-serif' : '700 11px Rajdhani, sans-serif';
    const tw = Math.max(ctx.measureText(l1).width, ctx.measureText(l2).width) + 16;
    ctx.fillStyle = 'rgba(8,10,16,0.85)'; ctx.strokeStyle = 'rgba(255,214,120,0.8)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(A[0] - tw / 2, A[1] - 52, tw, 32, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffe4a6'; ctx.fillText(l1, A[0], A[1] - 43);
    ctx.font = '600 11px JetBrains Mono, monospace'; ctx.fillStyle = '#fff'; ctx.fillText(l2, A[0], A[1] - 29);
    ctx.restore();
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
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(h[0], h[1], v > 0.3 ? 8 : 14, 0, TAU); ctx.fill();
      }
      // Stage separation: two small flashes as spent boosters fall away.
      for (const sep of [0.12, 0.26]) {
        const w = (v - sep) / 0.08; if (w <= 0 || w >= 1) continue;
        const sp = at(Math.round(easeInOut(sep) * 60)); if (!sp) continue;
        ctx.strokeStyle = `rgba(255,230,180,${1 - w})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(sp[0], sp[1], 3 + w * 9, 0, TAU); ctx.stroke();
        ctx.fillStyle = `rgba(200,200,210,${1 - w})`; ctx.beginPath(); ctx.arc(sp[0] + w * 3, sp[1] + w * 14, 1.5, 0, TAU); ctx.fill();
      }
      // Terminal phase: the bus releases decoys alongside the warhead, and air defences fire at them.
      if (v > 0.72 && h) {
        const w = (v - 0.72) / 0.28;
        if (!fx.decoys) fx.decoys = Array.from({ length: 4 }, (_, i) => ({ dx: (i - 1.5) * 9 + (Math.random() - 0.5) * 6, dy: (Math.random() - 0.5) * 10, kill: 0.35 + i * 0.15 }));
        for (const d of fx.decoys) {
          const p = [h[0] + d.dx * w, h[1] + d.dy * w];
          if (w < d.kill) {
            ctx.fillStyle = 'rgba(255,220,180,0.9)'; ctx.beginPath(); ctx.arc(p[0], p[1], 1.6, 0, TAU); ctx.fill();
            const iv = clamp((w - d.kill + 0.25) / 0.25, 0, 1);
            if (iv > 0) { const src = [b[0] + d.dx, b[1] + 8]; ctx.strokeStyle = 'rgba(160,230,255,0.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(src[0], src[1]); ctx.lineTo(src[0] + (p[0] - src[0]) * iv, src[1] + (p[1] - src[1]) * iv); ctx.stroke(); }
          } else if (w < d.kill + 0.15) {
            const bv = (w - d.kill) / 0.15; ctx.fillStyle = `rgba(220,245,255,${1 - bv})`; ctx.beginPath(); ctx.arc(p[0], p[1], 2 + bv * 5, 0, TAU); ctx.fill();
          }
        }
      }
      // Incoming warning text.
      if (Math.floor(u * T * 3) % 2 === 0) {
        ctx.font = '700 11px Rajdhani, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const warn = this.opts.lang === 'ar' ? 'صاروخ باليستي قادم' : 'BALLISTIC MISSILE INBOUND';
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(warn, b[0] + 1, b[1] - 33); ctx.fillStyle = '#ff6a72'; ctx.fillText(warn, b[0], b[1] - 34);
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
