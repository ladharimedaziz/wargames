// Warships and blockades. Fleets sail as a small wedge of hulls with wakes; carrier groups as a flat-top with its
// escorts circling. American groups carry their real names: carriers by ship (USS Nimitz), surface fleets by the
// numbered fleet whose waters they are in (7th Fleet). A blockade shows as a cordon on the water: around a strait
// for a sea-zone blockade, or all along the coast for a blockade of a country.
import { SEA_ZONES } from '/shared/data/places.js';
import { navalLabel } from '/shared/data/militaries.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const hash = s => { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 9973; return h; };

// A hull seen from above, bow to the right.
function hull(ctx, x, y, len, beam) {
  ctx.beginPath();
  ctx.moveTo(x + len / 2, y);
  ctx.quadraticCurveTo(x + len * 0.22, y - beam / 2, x - len * 0.2, y - beam / 2);
  ctx.lineTo(x - len / 2, y - beam * 0.38); ctx.lineTo(x - len / 2, y + beam * 0.38); ctx.lineTo(x - len * 0.2, y + beam / 2);
  ctx.quadraticCurveTo(x + len * 0.22, y + beam / 2, x + len / 2, y);
  ctx.closePath();
}
function wake(ctx, x, y, len, a, time, seed) {
  const L = len * (0.7 + 0.15 * Math.sin(time * 2 + seed));
  ctx.strokeStyle = `rgba(220,235,255,${0.2 * a})`; ctx.lineWidth = 0.7;
  ctx.beginPath(); ctx.moveTo(x - len / 2, y - 0.7); ctx.lineTo(x - len / 2 - L, y - 1.8); ctx.moveTo(x - len / 2, y + 0.7); ctx.lineTo(x - len / 2 - L, y + 1.8); ctx.stroke();
}

export const NAVAL_FX = {
  // One marker per owner, type and sea zone. Called inside drawUnits with the origin at the marker.
  drawNavalGroup(ctx, g, time, color, scale) {
    const s = this.state, owner = s.countries[g.owner], us = owner?.a3 === 'USA';
    const carrier = g.type === 'carrier', count = g.units.length, blockade = g.units.some(u => u.blockade);
    const seed = hash(g.loc.id + g.owner + g.type), heading = (seed % 628) / 100 + Math.sin(time * 0.15 + seed) * 0.08;
    scale *= 1.2;
    ctx.save(); ctx.scale(scale, scale);
    if (blockade) {
      const p = 0.5 + 0.5 * Math.sin(time * 4);
      ctx.strokeStyle = `rgba(255,77,94,${0.5 + 0.4 * p})`; ctx.lineWidth = 1.3; ctx.setLineDash([3, 2]);
      ctx.beginPath(); ctx.arc(0, 0, carrier ? 22 : 15, time * 0.6, time * 0.6 + TAU); ctx.stroke(); ctx.setLineDash([]);
    }
    if (carrier && us) {
      // The air wing: a dashed umbrella with a jet flying the circuit.
      ctx.strokeStyle = `rgba(${hexRgb(color)},0.35)`; ctx.lineWidth = 0.9; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.arc(0, 0, 19, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      const ja = time * 0.9 + seed;
      ctx.save(); ctx.translate(Math.cos(ja) * 19, Math.sin(ja) * 19); ctx.rotate(ja + Math.PI / 2);
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(2.6, 0); ctx.lineTo(-2, -2); ctx.lineTo(-1, 0); ctx.lineTo(-2, 2); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    ctx.rotate(heading);
    ctx.lineJoin = 'round';
    if (carrier) {
      // Escorts circle the carrier: a full screen of cruisers, destroyers and a submarine for an American group.
      const n = us ? 4 : 2;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + time * 0.12, x = Math.cos(a) * 12, y = Math.sin(a) * 9;
        wake(ctx, x, y, 5, 0.8, time, i);
        hull(ctx, x, y, 5.5, 1.8); ctx.fillStyle = 'rgba(4,6,11,0.9)'; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 0.9; ctx.stroke();
      }
      if (us) { ctx.fillStyle = `rgba(${hexRgb(color)},0.55)`; ctx.beginPath(); ctx.ellipse(-13, 4, 2.2, 0.9, 0, 0, TAU); ctx.fill(); }
      wake(ctx, 0, 0, 16, 1, time, 3);
      // Flat-top: straight deck, angled landing deck and the island on the starboard side.
      ctx.beginPath(); ctx.moveTo(9, -1.6); ctx.lineTo(6, -3.4); ctx.lineTo(-8, -3.4); ctx.lineTo(-8.5, 2.6); ctx.lineTo(5, 2.6); ctx.lineTo(9, 1.2); ctx.closePath();
      ctx.fillStyle = 'rgba(4,6,11,0.92)'; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 1.3; ctx.stroke();
      ctx.strokeStyle = `rgba(${hexRgb(color)},0.7)`; ctx.lineWidth = 0.6; ctx.setLineDash([1.4, 1.2]);
      ctx.beginPath(); ctx.moveTo(-7.5, 1.6); ctx.lineTo(3, -2.8); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = color; ctx.fillRect(0.5, 1.2, 2.6, 1.6);
      if (us) { ctx.fillStyle = 'rgba(230,240,255,0.85)'; ctx.beginPath(); ctx.moveTo(-3, -1.8); ctx.lineTo(-5, -2.7); ctx.lineTo(-4.4, -1.8); ctx.lineTo(-5, -0.9); ctx.closePath(); ctx.fill(); }
    } else {
      // A surface group in wedge formation; American fleets sail four Aegis ships.
      const slots = us ? [[5, 0], [-1, -4.5], [-1, 4.5], [-7, 0]] : [[4, 0], [-3, -4.2], [-3, 4.2]];
      slots.forEach(([x, y], i) => {
        wake(ctx, x, y, 7, 1, time, i);
        hull(ctx, x, y, 8, 2.4); ctx.fillStyle = 'rgba(4,6,11,0.9)'; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 1.1; ctx.stroke();
        ctx.fillStyle = color; ctx.fillRect(x - 0.8, y - 0.5, 1.6, 1);
      });
    }
    ctx.restore();
    // Labels stay upright.
    const k = this.cam.k, ar = this.opts.lang === 'ar';
    if (us && !carrier) {
      const n = navalLabel(g.units[0], 'USA', true).split(' ')[0];
      const badge = n.replace(/\D/g, '') + 'F';
      ctx.font = '700 8px JetBrains Mono, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(4,6,11,0.85)'; ctx.beginPath(); ctx.roundRect(-8 * scale - 13, -9 * scale - 5, 14, 10, 3); ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 0.8; ctx.stroke(); ctx.fillStyle = color; ctx.fillText(badge, -8 * scale - 6, -9 * scale);
    }
    if (count > 1) { ctx.fillStyle = color; ctx.font = '700 9px JetBrains Mono, monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(`×${count}`, (carrier ? 14 : 10) * scale, -6 * scale); }
    if ((us && k >= 1.6) || k >= 2.6) {
      let text = us ? navalLabel(g.units[0], 'USA', true) : (carrier ? (ar ? 'مجموعة حاملة' : 'Carrier group') : (ar ? 'أسطول' : 'Fleet'));
      if (us && carrier && count > 1) text += ` +${count - 1}`;
      ctx.font = '700 9px Rajdhani, Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.save(); ctx.letterSpacing = '0.8px';
      ctx.strokeStyle = 'rgba(4,6,11,0.85)'; ctx.lineWidth = 3; ctx.strokeText(text.toUpperCase(), 0, (carrier ? 26 : 17) * scale);
      ctx.fillStyle = color; ctx.fillText(text.toUpperCase(), 0, (carrier ? 26 : 17) * scale); ctx.restore();
    }
  },

  // Everything land, as one path, so effects can be clipped to the water.
  seaClip(ctx) {
    if (!this.atlas?.lo) return false;
    const dpr = this.dpr, c = this.cam;
    const A = (this.moving || c.k < 1.7 || !this.atlas.hi) ? this.atlas.lo : this.atlas.hi;
    this._lands ||= new Map();
    if (!this._lands.has(A)) { const land = new Path2D(); for (const p of A.paths.values()) land.addPath(p); this._lands.set(A, land); }
    ctx.setTransform(dpr * c.k, 0, 0, dpr * c.k, dpr * c.x, dpr * c.y);
    const r = new Path2D(); r.rect(-c.x / c.k - 10, -c.y / c.k - 10, this.w / c.k + 20, this.h / c.k + 20); r.addPath(this._lands.get(A));
    ctx.clip(r, 'evenodd');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  },

  // Standing blockades, drawn every frame under the units.
  drawBlockades(ctx, time) {
    const s = this.state; if (!s?.units) return;
    const sieges = new Map(), zones = new Map();
    for (const u of Object.values(s.units)) {
      if (!u.blockade || u.loc.kind !== 'sea' || u.strength <= 0) continue;
      if (u.blockadeOf) { if (!sieges.has(u.blockadeOf)) sieges.set(u.blockadeOf, { by: u.owner, zones: new Set() }); sieges.get(u.blockadeOf).zones.add(u.loc.id); }
      else if (!zones.has(u.loc.id)) zones.set(u.loc.id, u.owner);
    }
    if (!sieges.size && !zones.size) return;
    const k = this.cam.k, pulse = 0.5 + 0.5 * Math.sin(time * 2.4), ar = this.opts.lang === 'ar';
    ctx.save();
    if (!this.seaClip(ctx)) { ctx.restore(); return; }
    const dpr = this.dpr, c = this.cam;
    for (const [id, sg] of sieges) {
      const path = this.pathOf(id); if (!path) continue;
      // Nearby water glows red where the warships hold station, and a band of red runs along the whole coast.
      for (const z of sg.zones) {
        const zz = SEA_ZONES[z], q = zz && this.p(zz.lon, zz.lat); if (!q) continue;
        const R = 70 * Math.sqrt(k);
        const gr = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], R);
        gr.addColorStop(0, `rgba(255,60,70,${0.2 + 0.08 * pulse})`); gr.addColorStop(1, 'rgba(255,60,70,0)');
        ctx.fillStyle = gr; ctx.fillRect(q[0] - R, q[1] - R, R * 2, R * 2);
      }
      ctx.setTransform(dpr * c.k, 0, 0, dpr * c.k, dpr * c.x, dpr * c.y);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = `rgba(255,50,60,${0.14 + 0.06 * pulse})`; ctx.lineWidth = 30 / c.k; ctx.stroke(path);
      ctx.strokeStyle = `rgba(255,70,80,${0.28 + 0.12 * pulse})`; ctx.lineWidth = 11 / c.k; ctx.stroke(path);
      // The cordon itself: a dashed line on the water that crawls along the coast.
      ctx.strokeStyle = 'rgba(255,140,120,0.9)'; ctx.lineWidth = 1.6 / c.k;
      ctx.setLineDash([5 / c.k, 4 / c.k]); ctx.lineDashOffset = -time * 14 / c.k; ctx.stroke(path);
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.patrolShips(ctx, id, sg, time);
    }
    for (const [z, by] of zones) {
      const zz = SEA_ZONES[z], q = zz && this.p(zz.lon, zz.lat); if (!q) continue;
      const R = 46 * Math.sqrt(k);
      const gr = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], R);
      gr.addColorStop(0, `rgba(255,60,70,${0.26 + 0.1 * pulse})`); gr.addColorStop(1, 'rgba(255,60,70,0)');
      ctx.fillStyle = gr; ctx.fillRect(q[0] - R, q[1] - R, R * 2, R * 2);
      ctx.strokeStyle = 'rgba(255,120,100,0.75)'; ctx.lineWidth = 1.3; ctx.setLineDash([5, 4]); ctx.lineDashOffset = -time * 10;
      ctx.beginPath(); ctx.arc(q[0], q[1], R * 0.62, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
    }
    ctx.restore();
    // Tags off the blockaded coast.
    for (const [id, sg] of sieges) {
      const zs = [...sg.zones].map(z => SEA_ZONES[z]).filter(Boolean);
      if (!zs.length) continue;
      const q = this.p(zs[0].lon, zs[0].lat); if (!q) continue;
      this.tag(ctx, q[0], q[1] - 34, (ar ? 'حصار بحري: ' : '⚓ NAVAL BLOCKADE · ') + (ar ? (s.countries[id]?.ar || s.countries[id]?.name) : s.countries[id]?.name?.toUpperCase()), '#ff8a6b');
    }
  },

  // The coast of a country's main landmass as a thinned ring of [lon, lat], cached.
  coastRing(id) {
    this._rings ||= new Map();
    if (this._rings.has(id)) return this._rings.get(id);
    const c = this.atlas?.lo?.byId.get(id); let ring = null;
    if (c) {
      const main = c.parts.reduce((a, b) => (b.area > a.area ? b : a));
      const g = main.f.geometry, r = g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0]?.[0];
      if (r?.length > 8) { const step = Math.max(1, Math.floor(r.length / 140)); ring = r.filter((_, i) => i % step === 0); }
    }
    this._rings.set(id, ring); return ring;
  },

  // Warships on patrol off a blockaded coast: a few hulls sail back and forth along the stretch of coast nearest
  // the blockading fleet, held just beyond the edge of the country's waters, with a dotted line marking where
  // international waters begin.
  patrolShips(ctx, id, sg, time) {
    const ring = this.coastRing(id); if (!ring) return;
    const T = this.state.countries[id], zone = SEA_ZONES[[...sg.zones][0]]; if (!T || !zone) return;
    const pts = ring.map(([lo, la]) => this.p(lo, la)).filter(Boolean); if (pts.length < 8) return;
    const cen = this.p(T.lon, T.lat) || pts[0];
    const zq = this.p(zone.lon, zone.lat) || pts[0];
    const off = 7 + 5 * Math.min(2.2, Math.sqrt(this.cam.k));
    // Pushed out from the land, away from the country's centre.
    const out = pts.map(q => { const dx = q[0] - cen[0], dy = q[1] - cen[1], d = Math.hypot(dx, dy) || 1; return [q[0] + dx / d * off, q[1] + dy / d * off]; });
    let near = 0, best = Infinity; out.forEach((q, i) => { const d = Math.hypot(q[0] - zq[0], q[1] - zq[1]); if (d < best) { best = d; near = i; } });
    const span = Math.max(6, Math.floor(out.length * 0.28)), arc = [];
    for (let i = 0; i < span; i++) arc.push(out[(near - Math.floor(span / 2) + i + out.length * 2) % out.length]);
    const cum = [0]; for (let i = 1; i < arc.length; i++) cum.push(cum[i - 1] + Math.hypot(arc[i][0] - arc[i - 1][0], arc[i][1] - arc[i - 1][1]));
    const total = cum[cum.length - 1]; if (total < 20) return;
    const owner = this.state.countries[sg.by], col = owner && owner.bloc !== 'N' ? this.state.blocs[owner.bloc].color : '#ff8a6b';
    ctx.save();
    ctx.strokeStyle = 'rgba(255,170,150,0.45)'; ctx.lineWidth = 1; ctx.setLineDash([1.5, 5]);
    ctx.beginPath(); arc.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.stroke(); ctx.setLineDash([]);
    const at = d => { let i = 1; while (i < cum.length - 1 && cum[i] < d) i++; const f = (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1); return [arc[i - 1][0] + (arc[i][0] - arc[i - 1][0]) * f, arc[i - 1][1] + (arc[i][1] - arc[i - 1][1]) * f, Math.atan2(arc[i][1] - arc[i - 1][1], arc[i][0] - arc[i - 1][0])]; };
    const sc = clamp(Math.sqrt(this.cam.k), 1, 2);
    for (let n = 0; n < 3; n++) {
      // Ping-pong along the arc at a steady pace, ships spaced out so they cover it between them.
      const speed = 9 + n * 1.5, ph = ((time * speed + n * total / 3) % (total * 2)), d = ph < total ? ph : total * 2 - ph, fwd = ph < total;
      const [x, y, a] = at(d);
      ctx.save(); ctx.translate(x, y); ctx.rotate(fwd ? a : a + Math.PI); ctx.scale(sc, sc);
      wake(ctx, 0, 0, 8, 1, time, n);
      hull(ctx, 0, 0, 7, 2.2); ctx.fillStyle = 'rgba(4,6,11,0.92)'; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  },

  // The moment a blockade starts: the cordon is drawn along the coast and the country flashes red.
  fx_siege(ctx, fx, u) {
    const e = fx.e, path = this.pathOf(e.target); if (!path) return;
    const dpr = this.dpr, c = this.cam, fade = u > 0.8 ? 1 - (u - 0.8) / 0.2 : 1, v = ease(u / 0.6);
    ctx.save();
    if (this.seaClip(ctx)) {
      ctx.setTransform(dpr * c.k, 0, 0, dpr * c.k, dpr * c.x, dpr * c.y);
      ctx.strokeStyle = `rgba(255,90,90,${0.8 * fade})`; ctx.lineWidth = (3 + 30 * (1 - v)) / c.k;
      ctx.globalAlpha = v; ctx.stroke(path);
    }
    ctx.restore();
    this.clipTo(ctx, e.target, () => { ctx.fillStyle = `rgba(255,40,50,${0.18 * fade * Math.sin(Math.PI * Math.min(1, u * 1.6))})`; ctx.fillRect(0, 0, this.w, this.h); });
    const T = this.state.countries[e.target], q = T && this.p(T.lon, T.lat);
    if (q && u > 0.25) this.tag(ctx, q[0], q[1] - 30, this.opts.lang === 'ar' ? 'حصار بحري' : 'NAVAL BLOCKADE', '#ff8a6b');
  },
};

function hexRgb(col) {
  if (col.startsWith('#') && col.length >= 7) return `${parseInt(col.slice(1, 3), 16)},${parseInt(col.slice(3, 5), 16)},${parseInt(col.slice(5, 7), 16)}`;
  return '200,210,224';
}
