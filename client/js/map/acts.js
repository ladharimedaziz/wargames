// Animations for Kronos's sandbox powers and Zeus's world dials: acts of god, reinforcements out of nowhere,
// divine strikes, ceasefires and the world tension meter. Installed as methods on WorldMap (see renderer.js),
// so `this` is the map. Everything stays non-graphic: light, colour and motion, never casualties.
import { CITIES } from '/shared/data/cities.js';
import { tensionLevel } from '/shared/engine/core.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const fade = (u, a = 0.12, b = 0.82) => (u < a ? u / a : u > b ? (1 - u) / (1 - b) : 1);
const rnd = seed => { let x = seed | 0 || 1; return () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); };

const ACT_LABEL = {
  earthquake: ['EARTHQUAKE', 'زلزال', '#ffb36b'],
  flood: ['FLOODS', 'فيضانات', '#7cc8ff'],
  pandemic: ['OUTBREAK', 'تفشي وباء', '#b8ff6a'],
  blackout: ['BLACKOUT', 'انقطاع الكهرباء', '#c9d4ff'],
  coup: ['MILITARY COUP', 'انقلاب عسكري', '#ff7a6b'],
  discovery: ['OIL DISCOVERY', 'اكتشاف نفطي', '#ffd166'],
  storm: ['STORM', 'عاصفة', '#a9c6ff'],
};

export const ACT_FX = {
  // --- helpers ---
  // Screen-space box of a country's main landmass.
  screenBox(id) {
    const b = this.bounds?.get(id); if (!b) return null;
    const { k, x, y } = this.cam;
    return [b[0][0] * k + x, b[0][1] * k + y, b[1][0] * k + x, b[1][1] * k + y];
  },
  // Run fn in screen coordinates, clipped to a country's outline.
  clipTo(ctx, id, fn) {
    const path = this.atlas?.lo?.paths.get(id); if (!path) return;
    const dpr = this.dpr, c = this.cam;
    ctx.save();
    ctx.setTransform(dpr * c.k, 0, 0, dpr * c.k, dpr * c.x, dpr * c.y); ctx.clip(path);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fn();
    ctx.restore();
  },
  outline(ctx, id, style, width) {
    const path = this.atlas?.lo?.paths.get(id); if (!path) return;
    const dpr = this.dpr, c = this.cam;
    ctx.save(); ctx.setTransform(dpr * c.k, 0, 0, dpr * c.k, dpr * c.x, dpr * c.y);
    ctx.strokeStyle = style; ctx.lineWidth = width / c.k; ctx.stroke(path); ctx.restore();
  },
  citiesOf(id) {
    const a3 = this.state?.countries?.[id]?.a3;
    return CITIES.filter(c => c.a3 === a3);
  },
  actTag(ctx, x, y, act, extra = '') {
    const [en, ar, col] = ACT_LABEL[act] || [act.toUpperCase(), act, '#fff'];
    this.tag(ctx, x, y, (this.opts.lang === 'ar' ? ar : en) + extra, col);
  },
  shakeScreen(amp, dur) { this.shake = { start: performance.now(), amp, dur }; },
  // Applied each frame by the renderer: jolts both canvases, settling quickly.
  applyShake(now) {
    const sh = this.shake; if (!sh) return;
    const u = (now - sh.start) / (sh.dur * 1000);
    const els = [this.base, this.fx];
    if (u >= 1) { this.shake = null; for (const c of els) c.style.transform = ''; return; }
    const a = sh.amp * (1 - u) * (1 - u), t = now / 1000;
    const dx = (Math.sin(t * 71) + Math.sin(t * 113) * 0.6) * a, dy = (Math.cos(t * 89) + Math.sin(t * 131) * 0.5) * a * 0.7;
    for (const c of els) c.style.transform = `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px)`;
  },
  bolt(ctx, x0, y0, x1, y1, seed, width = 1.6, color = 'rgba(235,240,255,0.95)') {
    const r = rnd(seed), n = 10, pts = [[x0, y0]];
    for (let i = 1; i < n; i++) { const t = i / n; pts.push([x0 + (x1 - x0) * t + (r() - 0.5) * 14, y0 + (y1 - y0) * t + (r() - 0.5) * 6]); }
    pts.push([x1, y1]);
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [w, c] of [[width * 4, 'rgba(150,180,255,0.25)'], [width, color]]) {
      ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
    }
    // A forked branch.
    const m = pts[4 + Math.floor(r() * 3)];
    ctx.strokeStyle = color; ctx.lineWidth = width * 0.6; ctx.beginPath(); ctx.moveTo(m[0], m[1]);
    ctx.lineTo(m[0] + (r() - 0.3) * 18, m[1] + 8 + r() * 10); ctx.lineTo(m[0] + (r() - 0.3) * 26, m[1] + 18 + r() * 12); ctx.stroke();
    ctx.restore();
  },

  // --- lasting conditions ---
  // Blackouts and outbreaks Kronos started stay on the map until they end: a blacked-out country sits in the dark,
  // an outbreak tints the country and pulses over its cities, stronger the worse it is.
  drawConditions(ctx, time) {
    const s = this.state; if (!s?.countries) return;
    const ar = this.opts.lang === 'ar', tags = [];
    for (const c of Object.values(s.countries)) {
      if (c.blackout) {
        // The grid is down: the country goes dark, with the odd flicker as backup power cuts in and out.
        const flick = Math.sin(time * 7.3 + c.lon) > 0.97 ? 0.12 : 0;
        this.clipTo(ctx, c.id, () => { ctx.fillStyle = `rgba(0,2,10,${(this.night ? 0.62 : 0.48) - flick})`; ctx.fillRect(0, 0, this.w, this.h); });
        tags.push([c, ar ? 'انقطاع الكهرباء' : '⚡ BLACKOUT', '#9fb4d8']);
      }
      const lvl = (c.outbreak?.level || 0) / 100; if (!lvl) continue;
      this.clipTo(ctx, c.id, () => {
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = `rgba(90,200,60,${(0.1 + lvl * 0.2) * (0.75 + 0.25 * Math.sin(time * 1.6 + c.lon))})`;
        ctx.fillRect(0, 0, this.w, this.h);
      });
      const cities = (this._obCache ||= {})[c.id] ||= this.citiesOf(c.id).slice(0, 10);
      const n = Math.max(1, Math.round(cities.length * Math.min(1, lvl * 1.4)));
      for (let i = 0; i < Math.min(n, cities.length); i++) {
        const p = this.p(cities[i].lon, cities[i].lat); if (!p) continue;
        for (const off of [0, 0.5]) {
          const v = (time * 0.6 + i * 0.37 + off) % 1;
          ctx.strokeStyle = `rgba(190,255,110,${(1 - v) * (0.4 + lvl * 0.5)})`; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(p[0], p[1], 2 + v * (8 + lvl * 14), 0, TAU); ctx.stroke();
        }
      }
      tags.push([c, ar ? `وباء ${c.outbreak.level}%` : `☣ OUTBREAK ${c.outbreak.level}%`, '#b8ff6a']);
    }
    // Labels under the country's name, so the audience knows why it looks that way.
    const stack = {};
    for (const [c, text, col] of tags) {
      const q = this.p(c.lon, c.lat); if (!q) continue;
      const n = (stack[c.id] = (stack[c.id] || 0) + 1);
      ctx.globalAlpha = 0.85 + 0.15 * Math.sin(time * 2 + n);
      this.tag(ctx, q[0], q[1] + 14 + n * 15, text, col);
      ctx.globalAlpha = 1;
    }
  },

  // --- dispatch ---
  fx_act(ctx, fx, u, now) {
    const e = fx.e, q = this.pt(e.at) || this.countryPoint(e.country);
    if (!q || !this.state?.countries?.[e.country]) return;
    const sc = clamp(Math.sqrt(this.cam.k), 1, 2.6);
    this[`act_${e.act}`]?.(ctx, fx, u, now, q, sc);
  },

  // Seismic rings ripple out from the epicentre, the ground cracks, the screen shakes and a seismograph spikes.
  act_earthquake(ctx, fx, u, now, q, sc) {
    const e = fx.e;
    if (!fx.shook) { fx.shook = true; this.shakeScreen(7, 2.4); }
    if (!fx.cracks) {
      const r = rnd(Math.round(q[0] * 7 + q[1] * 13));
      fx.cracks = Array.from({ length: 8 }, (_, i) => {
        let a = i / 8 * TAU + r() * 0.5, x = 0, y = 0; const pts = [[0, 0]];
        for (let j = 0; j < 9; j++) { a += (r() - 0.5) * 0.9; const st = 6 + r() * 7; x += Math.cos(a) * st; y += Math.sin(a) * st; pts.push([x, y]); }
        return pts;
      });
    }
    const f = fade(u, 0.04, 0.8);
    // The whole country trembles in a warm flicker.
    this.clipTo(ctx, e.country, () => {
      ctx.fillStyle = `rgba(255,150,70,${0.16 * f * (0.5 + 0.5 * Math.sin(now / 45))})`; ctx.fillRect(0, 0, this.w, this.h);
    });
    // Rings with a ragged, shuddering edge.
    // Main shock, then aftershocks rolling out until the end.
    for (let i = 0; i < 10; i++) {
      const v = (u * 2.6 - i * 0.22); if (v <= 0 || v >= 1) continue;
      const R = (10 + ease(v) * (i < 3 ? 170 : 110)) * sc;
      ctx.strokeStyle = `rgba(255,${170 - i * 18},${90 - i * 10},${(1 - v) * 0.85})`; ctx.lineWidth = 2.2 - v * 1.4;
      ctx.beginPath();
      for (let s = 0; s <= 72; s++) { const a = s / 72 * TAU, rr = R * (1 + 0.035 * Math.sin(a * 11 + now / 70 + i) + 0.02 * Math.sin(a * 23 - now / 50)); const x = q[0] + Math.cos(a) * rr, y = q[1] + Math.sin(a) * rr * 0.8; s ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
    }
    // Cracks spread from the epicentre with a molten line inside.
    const grow = ease(u / 0.35), ca = fade(u, 0.02, 0.75);
    for (const pts of fx.cracks) {
      const m = Math.max(1, Math.round(grow * (pts.length - 1)));
      for (const [w, c] of [[3.2, `rgba(40,20,10,${0.75 * ca})`], [1.1, `rgba(255,160,70,${0.95 * ca})`]]) {
        ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath();
        for (let j = 0; j <= m; j++) { const x = q[0] + pts[j][0] * sc, y = q[1] + pts[j][1] * sc; j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.stroke();
      }
    }
    // Epicentre.
    const pr = 5 + Math.sin(now / 90) * 1.5;
    const g = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], pr * 3 * sc);
    g.addColorStop(0, `rgba(255,240,200,${f})`); g.addColorStop(0.4, `rgba(255,120,50,${0.7 * f})`); g.addColorStop(1, 'rgba(255,60,20,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q[0], q[1], pr * 3 * sc, 0, TAU); ctx.fill();
    // Seismograph card.
    const bx = q[0] + 26 * sc, by = q[1] - 64 * sc, bw = 120, bh = 40;
    ctx.save(); ctx.globalAlpha = f;
    ctx.fillStyle = 'rgba(8,10,16,0.85)'; ctx.strokeStyle = 'rgba(255,179,107,0.8)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 6); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.rect(bx + 4, by + 4, bw - 8, bh - 8); ctx.clip();
    ctx.strokeStyle = '#ffb36b'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 0; x <= bw - 8; x++) {
      const tt = u * 6 - (bw - 8 - x) / 40, amp = Math.exp(-((tt - 1.2) ** 2) * 1.4) * 15 + 0.6;
      const y = by + bh / 2 + Math.sin(x * 1.7 + now / 30) * amp * Math.sin(x * 0.37 + tt * 5);
      x ? ctx.lineTo(bx + 4 + x, y) : ctx.moveTo(bx + 4, y);
    }
    ctx.stroke(); ctx.restore();
    ctx.save(); ctx.globalAlpha = f;
    ctx.font = '700 11px JetBrains Mono, monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillStyle = '#fff';
    if (e.mag) ctx.fillText(`M${e.mag.toFixed(1)}`, bx + bw - 6, by + 5);
    ctx.restore();
    ctx.globalAlpha = f; this.actTag(ctx, q[0], q[1] + 22 * sc, 'earthquake'); ctx.globalAlpha = 1;
  },

  // Water spreads across the country with rippling rings while rain sweeps over it.
  act_flood(ctx, fx, u, now, q, sc) {
    const e = fx.e, box = this.screenBox(e.country); if (!box) return;
    const span = Math.max(box[2] - box[0], box[3] - box[1], 40), f = fade(u, 0.05, 0.78);
    // A regional flood around the river basin, not the whole country.
    const R = 8 + ease(u / 0.6) * Math.min(span * 0.4, 150 * Math.sqrt(this.cam.k));
    this.clipTo(ctx, e.country, () => {
      // Darkened sky.
      ctx.fillStyle = `rgba(10,20,40,${0.25 * f})`; ctx.fillRect(box[0] - 20, box[1] - 20, box[2] - box[0] + 40, box[3] - box[1] + 40);
      const g = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], R);
      g.addColorStop(0, `rgba(60,150,230,${0.55 * f})`); g.addColorStop(0.75, `rgba(70,170,240,${0.45 * f})`); g.addColorStop(1, 'rgba(90,190,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q[0], q[1], R, 0, TAU); ctx.fill();
      // Ripples moving through the water.
      for (let i = 0; i < 7; i++) {
        const v = ((now / 1600) + i / 7) % 1, rr = v * R;
        ctx.strokeStyle = `rgba(190,235,255,${0.35 * (1 - v) * f})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(q[0], q[1], rr, rr * 0.85, 0, 0, TAU); ctx.stroke();
      }
      // Shimmer bands.
      ctx.strokeStyle = `rgba(210,240,255,${0.18 * f})`; ctx.lineWidth = 1;
      for (let y = box[1]; y < box[3]; y += 7) {
        ctx.beginPath();
        for (let x = box[0]; x <= box[2]; x += 6) { const yy = y + Math.sin(x / 9 + now / 400 + y) * 1.6; x === box[0] ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy); }
        ctx.stroke();
      }
    });
    // Rain over the region.
    ctx.strokeStyle = `rgba(170,210,255,${0.45 * f})`; ctx.lineWidth = 1;
    const r = rnd(7), pad = 30;
    ctx.beginPath();
    for (let i = 0; i < 140; i++) {
      const x0 = box[0] - pad + r() * (box[2] - box[0] + pad * 2), sp = 0.6 + r() * 0.6;
      const y0 = box[1] - pad + (((r() + now / 900 * sp) % 1) * (box[3] - box[1] + pad * 2));
      ctx.moveTo(x0, y0); ctx.lineTo(x0 - 3, y0 + 9);
    }
    ctx.stroke();
    ctx.globalAlpha = f; this.actTag(ctx, q[0], box[1] - 12, 'flood'); ctx.globalAlpha = 1;
  },

  // An outbreak lights up the capital, jumps city to city, then arcs out to the neighbours.
  act_pandemic(ctx, fx, u, now, q, sc) {
    const e = fx.e, c = this.state.countries[e.country], f = fade(u, 0.05, 0.85);
    if (!fx.spots) {
      const cities = this.citiesOf(e.country).map(ct => ({ ct, d: Math.hypot(ct.lat - c.lat, ct.lon - c.lon) })).sort((a, b) => a.d - b.d).slice(0, 14);
      const dmax = Math.max(1, ...cities.map(x => x.d));
      fx.spots = cities.map(x => ({ ll: { lat: x.ct.lat, lon: x.ct.lon }, t: 0.08 + 0.42 * (x.d / dmax) }));
      fx.next = (this.state.adjacency?.[e.country] || []).filter(id => this.state.countries[id]).slice(0, 7);
    }
    const box = this.screenBox(e.country);
    this.clipTo(ctx, e.country, () => {
      ctx.globalCompositeOperation = 'screen';
      const R = 10 + ease(u / 0.55) * (box ? Math.max(box[2] - box[0], box[3] - box[1]) : 120);
      const g = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], R);
      g.addColorStop(0, `rgba(120,230,80,${0.28 * f})`); g.addColorStop(0.8, `rgba(90,200,60,${0.12 * f * (0.7 + 0.3 * Math.sin(now / 260))})`); g.addColorStop(1, 'rgba(150,240,90,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q[0], q[1], R, 0, TAU); ctx.fill();
    });
    for (const s of fx.spots) {
      const p = this.pt(s.ll); if (!p || u < s.t) continue;
      const v = clamp((u - s.t) / 0.12, 0, 1), pulse = (now / 900 + s.t * 7) % 1;
      ctx.fillStyle = `rgba(200,255,120,${0.9 * f})`; ctx.beginPath(); ctx.arc(p[0], p[1], 1.5 + v * 1.6, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(190,255,110,${(1 - pulse) * 0.8 * f})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(p[0], p[1], 3 + pulse * 10 * sc, 0, TAU); ctx.stroke();
    }
    // Spread to neighbours along dashed arcs.
    fx.next.forEach((id, i) => {
      const t0 = 0.5 + i * 0.04, v = clamp((u - t0) / 0.2, 0, 1); if (v <= 0) return;
      const b = this.countryPoint(id); if (!b) return;
      const mx = (q[0] + b[0]) / 2, my = (q[1] + b[1]) / 2 - Math.hypot(b[0] - q[0], b[1] - q[1]) * 0.22;
      ctx.strokeStyle = `rgba(190,255,110,${0.75 * f})`; ctx.lineWidth = 1.2; ctx.setLineDash([3, 4]); ctx.lineDashOffset = -now / 40;
      ctx.beginPath(); ctx.moveTo(q[0], q[1]);
      for (let s = 1; s <= 20; s++) { const t = s / 20 * v; const x = (1 - t) * (1 - t) * q[0] + 2 * (1 - t) * t * mx + t * t * b[0], y = (1 - t) * (1 - t) * q[1] + 2 * (1 - t) * t * my + t * t * b[1]; ctx.lineTo(x, y); }
      ctx.stroke(); ctx.setLineDash([]);
      if (v >= 1) { const pl = (now / 700 + i * 0.3) % 1; ctx.strokeStyle = `rgba(190,255,110,${(1 - pl) * 0.7 * f})`; ctx.beginPath(); ctx.arc(b[0], b[1], 3 + pl * 8, 0, TAU); ctx.stroke(); }
    });
    // Drifting spores around the origin.
    const r = rnd(3);
    for (let i = 0; i < 26; i++) {
      const a = r() * TAU + now / (2000 + r() * 3000), d = (8 + r() * 40) * sc * ease(u / 0.4);
      ctx.fillStyle = `rgba(200,255,140,${0.5 * f * r()})`; ctx.beginPath(); ctx.arc(q[0] + Math.cos(a) * d, q[1] + Math.sin(a) * d * 0.8, 1.1, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = f; this.actTag(ctx, q[0], q[1] - 22 * sc, 'pandemic'); ctx.globalAlpha = 1;
  },

  // City lights flicker, spark and go out one after another until the country sits in the dark.
  act_blackout(ctx, fx, u, now, q, sc) {
    const e = fx.e, f = fade(u, 0.04, 0.88);
    if (!fx.lights) {
      const r = rnd(e.country.length * 97 + 5);
      fx.lights = this.citiesOf(e.country).slice(0, 24).map(ct => ({ ll: { lat: ct.lat, lon: ct.lon }, off: 0.22 + r() * 0.45, big: ct.tier <= 1 }));
      if (!fx.lights.length) fx.lights = [{ ll: e.at, off: 0.4, big: true }];
    }
    const dark = clamp((u - 0.2) / 0.5, 0, 1) * (u > 0.9 ? (1 - u) / 0.1 : 1);
    this.clipTo(ctx, e.country, () => { ctx.fillStyle = `rgba(0,2,10,${0.85 * dark})`; ctx.fillRect(0, 0, this.w, this.h); });
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const L of fx.lights) {
      const p = this.pt(L.ll); if (!p) continue;
      const before = u < L.off, near = L.off - u;
      // Stuttering in the moments before it fails.
      const on = before && !(near < 0.08 && Math.sin(now / 23 + L.off * 50) > 0.2);
      if (on) {
        const rr = (L.big ? 9 : 5) * sc, g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], rr);
        g.addColorStop(0, 'rgba(255,235,170,0.95)'); g.addColorStop(0.35, 'rgba(255,190,90,0.45)'); g.addColorStop(1, 'rgba(255,160,60,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p[0], p[1], rr, 0, TAU); ctx.fill();
      } else if (!before && u - L.off < 0.06) {
        // Transformer spark as it goes.
        const v = (u - L.off) / 0.06;
        ctx.strokeStyle = `rgba(170,210,255,${1 - v})`; ctx.lineWidth = 1;
        for (let s = 0; s < 4; s++) { const a = s * 1.7 + L.off * 9; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + Math.cos(a) * (3 + v * 7), p[1] + Math.sin(a) * (3 + v * 7)); ctx.stroke(); }
      }
    }
    ctx.restore();
    // Arcing grid lines near the capital at the start.
    if (u < 0.3) for (let i = 0; i < 2; i++) if (Math.sin(now / 40 + i * 3) > 0.4) this.bolt(ctx, q[0] - 14 * sc + i * 10, q[1] - 10 * sc, q[0] + 10 * sc - i * 8, q[1] + 8 * sc, Math.floor(now / 80) + i, 1, 'rgba(190,220,255,0.9)');
    ctx.globalAlpha = f; this.actTag(ctx, q[0], q[1] - 22 * sc, 'blackout'); ctx.globalAlpha = 1;
  },

  // Armoured columns converge on the capital, a ring closes, and a new flag goes up.
  act_coup(ctx, fx, u, now, q, sc) {
    const e = fx.e, f = fade(u, 0.04, 0.85);
    this.outline(ctx, e.country, `rgba(255,110,90,${f * (0.5 + 0.5 * Math.sin(now / 120))})`, 2);
    const close = ease(u / 0.5);
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU + 0.4, d0 = 70 * sc, d = d0 * (1 - close) + 10 * sc;
      for (let j = 0; j < 4; j++) {
        // A chevron train rolling inward.
        const dd = d + j * 7 * sc, x = q[0] + Math.cos(a) * dd, y = q[1] + Math.sin(a) * dd * 0.8, an = a + Math.PI;
        ctx.save(); ctx.translate(x, y); ctx.rotate(an);
        ctx.strokeStyle = `rgba(255,${130 + j * 20},${100 + j * 15},${f * (1 - j * 0.2)})`; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(-3 * sc, -3 * sc); ctx.lineTo(0, 0); ctx.lineTo(-3 * sc, 3 * sc); ctx.stroke(); ctx.restore();
      }
    }
    // The noose: a ring tightening on the capital.
    const ringR = (60 - close * 46) * sc;
    ctx.strokeStyle = `rgba(255,90,80,${0.8 * f})`; ctx.lineWidth = 1.4; ctx.setLineDash([6, 4]); ctx.lineDashOffset = now / 30;
    ctx.beginPath(); ctx.arc(q[0], q[1], ringR, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    if (u > 0.5) {
      const v = (u - 0.5) / 0.5;
      if (!fx.burst) { fx.burst = true; this.flash = { start: performance.now(), dur: 0.5, alpha: 0.18 }; }
      // Starburst.
      ctx.strokeStyle = `rgba(255,220,150,${(1 - v) * 0.9})`; ctx.lineWidth = 1.2;
      for (let s = 0; s < 12; s++) { const a = s / 12 * TAU, r0 = 6 * sc + v * 10 * sc, r1 = r0 + 8 * sc; ctx.beginPath(); ctx.moveTo(q[0] + Math.cos(a) * r0, q[1] + Math.sin(a) * r0); ctx.lineTo(q[0] + Math.cos(a) * r1, q[1] + Math.sin(a) * r1); ctx.stroke(); }
      // Flag rising on a pole above the capital.
      const h = ease(v / 0.5) * 26 * sc, px = q[0], py = q[1] - 4;
      ctx.strokeStyle = `rgba(230,230,235,${f})`; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - 30 * sc); ctx.stroke();
      const fy = py - h, wv = Math.sin(now / 160) * 1.5;
      ctx.fillStyle = `rgba(200,40,40,${f})`; ctx.beginPath(); ctx.moveTo(px, fy - 8 * sc); ctx.quadraticCurveTo(px + 7 * sc, fy - 8 * sc + wv, px + 14 * sc, fy - 8 * sc); ctx.lineTo(px + 14 * sc, fy); ctx.quadraticCurveTo(px + 7 * sc, fy + wv, px, fy); ctx.closePath(); ctx.fill();
      ctx.fillStyle = `rgba(255,230,140,${f})`; ctx.beginPath(); ctx.arc(px + 7 * sc, fy - 4 * sc, 1.8 * sc, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = `rgba(255,120,100,${f})`; ctx.fillRect(q[0] - 3, q[1] - 3, 6, 6);
    ctx.globalAlpha = f; this.actTag(ctx, q[0], q[1] + 20 * sc, 'coup'); ctx.globalAlpha = 1;
  },

  // A gusher erupts: a dark column, golden spray, rings of light and a gold shimmer across the country.
  act_discovery(ctx, fx, u, now, q, sc) {
    const e = fx.e, f = fade(u, 0.04, 0.85), box = this.screenBox(e.country);
    if (box) this.clipTo(ctx, e.country, () => {
      const w = box[2] - box[0], x = box[0] - w * 0.4 + ((u * 1.6) % 1.2) * w * 1.6;
      const g = ctx.createLinearGradient(x - 40, box[1], x + 40, box[3]);
      g.addColorStop(0, 'rgba(255,210,100,0)'); g.addColorStop(0.5, `rgba(255,215,110,${0.3 * f})`); g.addColorStop(1, 'rgba(255,210,100,0)');
      ctx.fillStyle = g; ctx.fillRect(box[0] - 20, box[1] - 20, w + 40, box[3] - box[1] + 40);
    });
    for (let i = 0; i < 4; i++) {
      const v = ((u * 2.5) + i / 4) % 1;
      ctx.strokeStyle = `rgba(255,210,110,${(1 - v) * 0.7 * f})`; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(q[0], q[1], 4 + v * 36 * sc, (4 + v * 36 * sc) * 0.4, 0, 0, TAU); ctx.stroke();
    }
    const H = ease(u / 0.25) * 46 * sc * (u > 0.85 ? (1 - u) / 0.15 : 1);
    const cg = ctx.createLinearGradient(q[0], q[1], q[0], q[1] - H);
    cg.addColorStop(0, 'rgba(30,22,15,0.95)'); cg.addColorStop(0.7, 'rgba(60,45,25,0.85)'); cg.addColorStop(1, 'rgba(255,210,110,0.6)');
    ctx.fillStyle = cg; ctx.beginPath(); ctx.moveTo(q[0] - 2 * sc, q[1]); ctx.lineTo(q[0] - 3.5 * sc, q[1] - H); ctx.lineTo(q[0] + 3.5 * sc, q[1] - H); ctx.lineTo(q[0] + 2 * sc, q[1]); ctx.closePath(); ctx.fill();
    // Spray arcing out and falling back.
    const r = rnd(11);
    for (let i = 0; i < 40; i++) {
      const life = 1.2 + r() * 0.8, t = ((now / 1000 + r() * 3) % life) / life, vx = (r() - 0.5) * 30 * sc, vy = (24 + r() * 16) * sc;
      const x = q[0] + vx * t, y = q[1] - H + (-vy * t + 40 * sc * t * t);
      ctx.fillStyle = i % 3 ? `rgba(40,30,20,${0.8 * f})` : `rgba(255,215,120,${0.9 * f})`; ctx.beginPath(); ctx.arc(x, y, 1.3, 0, TAU); ctx.fill();
    }
    // Derrick.
    ctx.strokeStyle = `rgba(220,220,230,${f})`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(q[0] - 7 * sc, q[1] + 2); ctx.lineTo(q[0], q[1] - 16 * sc); ctx.lineTo(q[0] + 7 * sc, q[1] + 2); ctx.moveTo(q[0] - 4 * sc, q[1] - 6 * sc); ctx.lineTo(q[0] + 4 * sc, q[1] - 6 * sc); ctx.stroke();
    if (u > 0.3) {
      const v = clamp((u - 0.3) / 0.5, 0, 1);
      ctx.save(); ctx.globalAlpha = f * (1 - v * 0.3); ctx.font = '700 12px JetBrains Mono, monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffd166';
      ctx.fillText('+2 mb/d', q[0] + 26 * sc, q[1] - 20 * sc - v * 16); ctx.restore();
    }
    ctx.globalAlpha = f; this.actTag(ctx, q[0], q[1] + 16 * sc, 'discovery'); ctx.globalAlpha = 1;
  },

  // Storm clouds roll over the country with sheets of rain and lightning.
  act_storm(ctx, fx, u, now, q, sc) {
    const e = fx.e, f = fade(u, 0.08, 0.8), box = this.screenBox(e.country); if (!box) return;
    if (!fx.strikes) { const r = rnd(Math.round(q[0] + q[1])); fx.strikes = Array.from({ length: 5 }, (_, i) => ({ t: 0.12 + i * 0.14 + r() * 0.06, x: box[0] + r() * (box[2] - box[0]), y: box[1] + (0.3 + r() * 0.6) * (box[3] - box[1]), seed: i * 31 + 7 })); }
    const lit = fx.strikes.find(s => u > s.t && u < s.t + 0.04);
    this.clipTo(ctx, e.country, () => {
      ctx.fillStyle = lit ? `rgba(210,220,255,${0.3 * f})` : `rgba(15,20,35,${0.45 * f})`; ctx.fillRect(0, 0, this.w, this.h);
      // Rolling cloud mass.
      for (let i = 0; i < 14; i++) {
        const cx = box[0] + ((i * 0.137 + now / 14000) % 1) * (box[2] - box[0]), cy = box[1] + ((i * 0.71) % 1) * (box[3] - box[1]), rr = 14 + (i % 4) * 8;
        ctx.fillStyle = `rgba(60,68,90,${0.22 * f})`; ctx.beginPath(); ctx.arc(cx, cy, rr * sc, 0, TAU); ctx.fill();
      }
    });
    ctx.strokeStyle = `rgba(170,200,240,${0.4 * f})`; ctx.lineWidth = 1;
    const r = rnd(5); ctx.beginPath();
    for (let i = 0; i < 120; i++) { const x0 = box[0] + r() * (box[2] - box[0]), y0 = box[1] + ((r() + now / 700) % 1) * (box[3] - box[1]); ctx.moveTo(x0, y0); ctx.lineTo(x0 - 4, y0 + 10); }
    ctx.stroke();
    for (const s of fx.strikes) if (u > s.t && u < s.t + 0.05) this.bolt(ctx, s.x + 8, box[1] - 30, s.x, s.y, s.seed, 1.6);
    ctx.globalAlpha = f; this.actTag(ctx, q[0], box[1] - 12, 'storm'); ctx.globalAlpha = 1;
  },

  // Forces conjured by Kronos: a column of gold light lands, rings spread and unit markers pop into place.
  fx_spawn(ctx, fx, u, now) {
    const e = fx.e, q = this.pt(e.at); if (!q) return;
    const sc = clamp(Math.sqrt(this.cam.k), 1, 2.6), f = fade(u, 0.06, 0.8);
    const H = 160 * sc, w = (7 - ease(u / 0.3) * 3) * sc;
    const g = ctx.createLinearGradient(q[0], q[1] - H, q[0], q[1]);
    g.addColorStop(0, 'rgba(255,214,120,0)'); g.addColorStop(0.7, `rgba(255,226,150,${0.55 * f})`); g.addColorStop(1, `rgba(255,248,220,${0.95 * f})`);
    const drop = ease(u / 0.22);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g; ctx.fillRect(q[0] - w / 2, q[1] - H * drop, w, H * drop);
    for (let i = 0; i < 3; i++) {
      const v = clamp(u * 2 - 0.3 - i * 0.12, 0, 1); if (!v || v >= 1) continue;
      ctx.strokeStyle = `rgba(255,214,120,${(1 - v) * 0.9})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(q[0], q[1], 4 + v * 34 * sc, (4 + v * 34 * sc) * 0.45, 0, 0, TAU); ctx.stroke();
    }
    const r = rnd(9);
    for (let i = 0; i < 18; i++) {
      const t = ((now / 1400) + r()) % 1, x = q[0] + (r() - 0.5) * 22 * sc, y = q[1] - t * 50 * sc;
      ctx.fillStyle = `rgba(255,236,170,${(1 - t) * f})`; ctx.beginPath(); ctx.arc(x, y, 1.1, 0, TAU); ctx.fill();
    }
    ctx.restore();
    const owner = this.state.countries[e.country], col = owner && owner.bloc !== 'N' ? this.state.blocs[owner.bloc].color : '#ffd678';
    const n = Math.min(12, e.n || 1);
    for (let i = 0; i < n; i++) {
      const t0 = 0.25 + i * 0.03, v = clamp((u - t0) / 0.1, 0, 1); if (!v) continue;
      const a = i / n * TAU - Math.PI / 2, d = (14 + (i % 2) * 6) * sc, x = q[0] + Math.cos(a) * d, y = q[1] + Math.sin(a) * d * 0.6;
      ctx.save(); ctx.globalAlpha = f; ctx.translate(x, y); ctx.scale(0.4 + ease(v) * 0.6, 0.4 + ease(v) * 0.6);
      ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, -4 * sc); ctx.lineTo(3.5 * sc, 3 * sc); ctx.lineTo(-3.5 * sc, 3 * sc); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    const label = `+${e.n} ${String(e.unitType).replace(/_/g, ' ').toUpperCase()}`;
    ctx.globalAlpha = f; this.tag(ctx, q[0], q[1] - 32 * sc, label, '#ffd678'); ctx.globalAlpha = 1;
  },

  // Kronos's unstoppable strike: a lance of light falls from the sky onto the target.
  fx_divine(ctx, fx, u, now) {
    const e = fx.e, q = this.pt(e.to); if (!q) return;
    const sc = clamp(Math.sqrt(this.cam.k), 1, 2.6), HIT = 0.32;
    // Warning sigil while the light gathers.
    if (u < HIT) {
      const v = u / HIT;
      ctx.strokeStyle = `rgba(255,214,120,${0.4 + v * 0.6})`; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(q[0], q[1], (26 - v * 18) * sc, 0, TAU); ctx.stroke();
      for (let s = 0; s < 4; s++) { const a = s / 4 * TAU + v * 3; ctx.beginPath(); ctx.moveTo(q[0] + Math.cos(a) * 30 * sc, q[1] + Math.sin(a) * 30 * sc); ctx.lineTo(q[0] + Math.cos(a) * (30 - 10) * sc, q[1] + Math.sin(a) * (30 - 10) * sc); ctx.stroke(); }
      const top = q[1] - this.h, y = top + (q[1] - top) * ease(v);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(q[0], top, q[0], y); g.addColorStop(0, 'rgba(255,220,140,0)'); g.addColorStop(1, 'rgba(255,245,210,0.95)');
      ctx.fillStyle = g; ctx.fillRect(q[0] - 2 * sc, top, 4 * sc, y - top); ctx.restore();
      return;
    }
    const v = (u - HIT) / (1 - HIT);
    if (!fx.hit) { fx.hit = true; this.flash = { start: performance.now(), dur: 0.6, alpha: 0.2 }; this.shakeScreen(4, 0.8); this.scars.push({ at: e.to, dx: 0, dy: 0, born: now }); }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const w = (10 * (1 - v)) * sc;
    if (w > 0.3) { const g = ctx.createLinearGradient(q[0] - w, 0, q[0] + w, 0); g.addColorStop(0, 'rgba(255,220,140,0)'); g.addColorStop(0.5, `rgba(255,250,230,${1 - v})`); g.addColorStop(1, 'rgba(255,220,140,0)'); ctx.fillStyle = g; ctx.fillRect(q[0] - w, 0, w * 2, q[1]); }
    ctx.restore();
    for (let i = 0; i < 3; i++) { const t = clamp(v * 1.5 - i * 0.15, 0, 1); if (!t || t >= 1) continue; ctx.strokeStyle = `rgba(255,226,160,${1 - t})`; ctx.lineWidth = 2 - i * 0.5; ctx.beginPath(); ctx.ellipse(q[0], q[1], ease(t) * 60 * sc, ease(t) * 60 * sc * 0.5, 0, 0, TAU); ctx.stroke(); }
    this.boom(ctx, q[0], q[1], 16 * sc, Math.min(1, v * 1.4));
    if (v < 0.8) this.tag(ctx, q[0], q[1] - 26 * sc, this.opts.lang === 'ar' ? 'ضربة كرونوس' : 'STRIKE FROM ABOVE', '#ffd678');
  },

  // Peace: both countries glow, rings of light leave each capital and the war line turns white.
  fx_peace(ctx, fx, u, now) {
    const e = fx.e, a = this.countryPoint(e.a), b = this.countryPoint(e.b); if (!a || !b) return;
    const f = fade(u, 0.1, 0.75);
    for (const id of [e.a, e.b]) this.outline(ctx, id, `rgba(200,255,225,${0.8 * f})`, 2);
    for (const p of [a, b]) for (let i = 0; i < 3; i++) { const v = ((u * 1.6) + i / 3) % 1; ctx.strokeStyle = `rgba(220,255,235,${(1 - v) * 0.7 * f})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(p[0], p[1], 4 + v * 30, 0, TAU); ctx.stroke(); }
    ctx.strokeStyle = `rgba(235,255,245,${0.9 * f})`; ctx.lineWidth = 1.6; ctx.beginPath(); this.curve(ctx, a, b, 0.18); ctx.stroke();
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.09];
    ctx.globalAlpha = f; this.tag(ctx, m[0], m[1] - 12, this.opts.lang === 'ar' ? 'وقف إطلاق النار' : 'CEASEFIRE', '#c8ffe0'); ctx.globalAlpha = 1;
  },

  // World tension: the screen edges glow hotter or cooler and a meter slides to the new level.
  fx_tension(ctx, fx, u, now) {
    const e = fx.e, up = e.to > e.from, f = fade(u, 0.08, 0.8);
    const col = up ? (e.to >= 8 ? '255,50,60' : '255,140,60') : '90,200,255';
    const pulse = 0.6 + 0.4 * Math.sin(u * Math.PI * 4);
    const W = this.w, H = this.h, v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.72);
    v.addColorStop(0, `rgba(${col},0)`); v.addColorStop(1, `rgba(${col},${0.5 * f * pulse})`);
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    if (up && e.to >= 10 && !fx.flashed) { fx.flashed = true; this.flash = { start: performance.now(), dur: 0.9, alpha: 0.25 }; this.shakeScreen(3, 0.9); }
    const val = e.from + (e.to - e.from) * ease((u - 0.12) / 0.45), lvl = tensionLevel(e.to);
    const bw = Math.min(360, W - 40), bh = 70, bx = W / 2 - bw / 2, by = Math.max(70, H * 0.14) - (1 - ease(u / 0.15)) * 20;
    ctx.save(); ctx.globalAlpha = f;
    ctx.fillStyle = 'rgba(6,8,14,0.88)'; ctx.strokeStyle = `rgba(${col},0.9)`; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 10); ctx.fill(); ctx.stroke();
    const ar = this.opts.lang === 'ar';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.font = ar ? '700 13px Cairo, sans-serif' : '700 12px Rajdhani, sans-serif'; ctx.fillStyle = `rgba(${col},1)`;
    ctx.fillText(ar ? 'التوتر العالمي' : 'WORLD TENSION', bx + 14, by + 16);
    ctx.textAlign = 'right'; ctx.font = '700 22px JetBrains Mono, monospace'; ctx.fillStyle = '#fff';
    ctx.fillText((Math.round(val * 2) / 2).toFixed(1), bx + bw - 14, by + 18);
    // Ten segments, filled up to the current value.
    const gx = bx + 14, gw = bw - 28, sw = gw / 10;
    for (let i = 0; i < 10; i++) {
      const fill = clamp(val - i, 0, 1), x = gx + i * sw;
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x + 1, by + 34, sw - 2, 12);
      if (fill > 0) { const hot = i >= 7 ? '255,60,70' : i >= 4 ? '255,170,60' : '90,210,160'; ctx.fillStyle = `rgba(${hot},${0.9})`; ctx.fillRect(x + 1, by + 34, (sw - 2) * fill, 12); }
    }
    ctx.textAlign = 'center'; ctx.font = ar ? '600 12px Cairo, sans-serif' : '600 11px Inter, sans-serif'; ctx.fillStyle = 'rgba(230,236,245,0.9)';
    ctx.fillText(`${up ? '▲' : '▼'} ${ar ? (lvl.ar || lvl.name) : lvl.name}`, W / 2, by + 58);
    ctx.restore();
  },
};
