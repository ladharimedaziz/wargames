// Warships and blockades. Fleets sail as a small wedge of hulls with wakes; carrier groups as a flat-top with its
// escorts circling. American groups carry their real names: carriers by ship (USS Nimitz), surface fleets by the
// numbered fleet whose waters they are in (7th Fleet). A blockade shows as a cordon on the water: around a strait
// for a sea-zone blockade, or all along the coast for a blockade of a country.
import { SEA_ZONES } from '/shared/data/places.js';
import { navalLabel, hasNamedNavy } from '/shared/data/militaries.js';

// Icons and sprites keep one on-screen size at every zoom, so nothing grows or shrinks as the camera moves.
const ICON = 1.3;

const TAU = Math.PI * 2;
const hexA = (hex, a) => `rgba(${hexRgb(hex)},${a})`;
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
// A V of churned water behind a hull. `speed` (0 at rest, 1 at full speed) stretches it out and widens it.
function wake(ctx, x, y, len, a, time, seed, speed = 0) {
  const L = len * (0.7 + 0.15 * Math.sin(time * 2 + seed)) * (1 + speed * 1.2), spread = 1.8 + speed * 2;
  ctx.strokeStyle = `rgba(220,235,255,${(0.2 + speed * 0.25) * a})`; ctx.lineWidth = 0.7;
  ctx.beginPath(); ctx.moveTo(x - len / 2, y - 0.7); ctx.lineTo(x - len / 2 - L, y - spread); ctx.moveTo(x - len / 2, y + 0.7); ctx.lineTo(x - len / 2 - L, y + spread); ctx.stroke();
  if (speed > 0.05) {
    // Under way: a band of foam down the middle of the wake and a bow wave curling off the stem.
    const g = ctx.createLinearGradient(x - len / 2, 0, x - len / 2 - L, 0);
    g.addColorStop(0, `rgba(235,245,255,${0.45 * speed * a})`); g.addColorStop(1, 'rgba(235,245,255,0)');
    ctx.strokeStyle = g; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x - len / 2, y); ctx.lineTo(x - len / 2 - L * 0.8, y); ctx.stroke();
    const b = 0.5 + 0.5 * Math.sin(time * 6 + seed);
    ctx.strokeStyle = `rgba(240,248,255,${(0.35 + 0.25 * b) * speed * a})`; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(x + len / 2 + 0.4, y); ctx.quadraticCurveTo(x + len * 0.25, y - 1.6 - b * 0.6, x, y - 2.2 - b); ctx.moveTo(x + len / 2 + 0.4, y); ctx.quadraticCurveTo(x + len * 0.25, y + 1.6 + b * 0.6, x, y + 2.2 + b); ctx.stroke();
  }
}
const wrapAng = a => Math.atan2(Math.sin(a), Math.cos(a));

export const NAVAL_FX = {
  // Turns a fleet smoothly towards the heading it wants, like a ship coming about, and remembers where it points so it
  // keeps facing its last course once it has dropped anchor. Returns { heading, speed, turn }.
  helm(key, want, moving, seed) {
    const H = (this._helm ||= new Map()), now = performance.now() / 1000;
    let h = H.get(key);
    if (!h) { h = { a: want ?? (seed % 628) / 100, v: 0, w: 0, t: now }; H.set(key, h); }
    const dt = Math.min(0.1, Math.max(0, now - h.t)); h.t = now;
    const prev = h.a;
    if (want != null) { const d = wrapAng(want - h.a); h.a = wrapAng(h.a + Math.sign(d) * Math.min(Math.abs(d), Math.max(0.4, Math.abs(d) * 2.2) * dt)); }
    h.v += ((moving ? 1 : 0) - h.v) * Math.min(1, dt * (moving ? 1.6 : 0.8));
    h.w += (wrapAng(h.a - prev) / (dt || 1) - h.w) * Math.min(1, dt * 5);
    return { heading: h.a, speed: h.v, turn: h.w };
  },

  // One marker per owner, type and sea zone. Called inside drawUnits with the origin at the marker. `nav` is the fleet's
  // heading and speed from helm(); without one the group swings at anchor on a heading of its own.
  drawNavalGroup(ctx, g, time, color, scale, nav) {
    const s = this.state, owner = s.countries[g.owner], us = ['USA', 'CHN', 'RUS'].includes(owner?.a3), named = hasNamedNavy(owner?.a3), a3 = owner?.a3;
    const carrier = g.type === 'carrier', count = g.units.length, blockade = g.units.some(u => u.blockade);
    const seed = hash(g.loc.id + g.owner + g.type), sp = nav?.speed || 0;
    // At anchor the group swings gently on its cable; under way it holds its course and swings its bows a little into a turn.
    const heading = (nav ? nav.heading : (seed % 628) / 100) + Math.sin(time * 0.15 + seed) * 0.08 * (1 - sp);
    const heel = clamp((nav?.turn || 0) * 0.35, -0.25, 0.25);
    scale *= 1.2;
    ctx.save(); ctx.scale(scale, scale);
    if (blockade) {
      const p = 0.5 + 0.5 * Math.sin(time * 4);
      ctx.strokeStyle = `rgba(226,87,74,${0.5 + 0.4 * p})`; ctx.lineWidth = 1.3; ctx.setLineDash([3, 2]);
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
      // Under way they leave the circle and take station: one ahead, one on each beam, one astern.
      const n = us ? 4 : 2, station = us ? [[13, 0], [0, -10], [0, 10], [-14, 0]] : [[0, -10], [0, 10]];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + time * 0.12, x = Math.cos(a) * 12 * (1 - sp) + station[i][0] * sp, y = Math.sin(a) * 9 * (1 - sp) + station[i][1] * sp;
        // Circling, an escort points along its orbit; on station it points along the carrier's course.
        const orbit = wrapAng(a + Math.PI / 2), own = orbit + wrapAng(-orbit) * sp;
        ctx.save(); ctx.translate(x, y); ctx.rotate(own);
        wake(ctx, 0, 0, 5, 0.8, time, i, Math.max(sp, 0.25));
        hull(ctx, 0, 0, 5.5, 1.8); ctx.fillStyle = 'rgba(4,6,11,0.9)'; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 0.9; ctx.stroke();
        ctx.restore();
      }
      ctx.rotate(heel);
      if (us) { ctx.fillStyle = `rgba(${hexRgb(color)},0.55)`; ctx.beginPath(); ctx.ellipse(-13, 4, 2.2, 0.9, 0, 0, TAU); ctx.fill(); }
      wake(ctx, 0, 0, 16, 1, time, 3, sp);
      // Flat-top: straight deck, angled landing deck and the island on the starboard side.
      ctx.beginPath(); ctx.moveTo(9, -1.6); ctx.lineTo(6, -3.4); ctx.lineTo(-8, -3.4); ctx.lineTo(-8.5, 2.6); ctx.lineTo(5, 2.6); ctx.lineTo(9, 1.2); ctx.closePath();
      ctx.fillStyle = 'rgba(4,6,11,0.92)'; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 1.3; ctx.stroke();
      ctx.strokeStyle = `rgba(${hexRgb(color)},0.7)`; ctx.lineWidth = 0.6; ctx.setLineDash([1.4, 1.2]);
      ctx.beginPath(); ctx.moveTo(-7.5, 1.6); ctx.lineTo(3, -2.8); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = color; ctx.fillRect(0.5, 1.2, 2.6, 1.6);
      if (us) { ctx.fillStyle = 'rgba(230,240,255,0.85)'; ctx.beginPath(); ctx.moveTo(-3, -1.8); ctx.lineTo(-5, -2.7); ctx.lineTo(-4.4, -1.8); ctx.lineTo(-5, -0.9); ctx.closePath(); ctx.fill(); }
    } else {
      // A surface group in wedge formation; American fleets sail four Aegis ships.
      // Under way the wedge opens out a little so each ship sails clear of the wake ahead.
      const slots = us ? [[5, 0], [-1, -4.5], [-1, 4.5], [-7, 0]] : [[4, 0], [-3, -4.2], [-3, 4.2]];
      ctx.rotate(heel);
      slots.forEach(([x, y0], i) => {
        const y = y0 * (1 + sp * 0.25);
        wake(ctx, x, y, 7, 1, time, i, sp);
        hull(ctx, x, y, 8, 2.4); ctx.fillStyle = 'rgba(4,6,11,0.9)'; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 1.1; ctx.stroke();
        ctx.fillStyle = color; ctx.fillRect(x - 0.8, y - 0.5, 1.6, 1);
      });
    }
    ctx.restore();
    // Labels stay upright.
    const k = this.cam.k, ar = this.opts.lang === 'ar';
    if (a3 === 'USA' && !carrier) {
      const n = navalLabel(g.units[0], 'USA', true).split(' ')[0];
      const badge = n.replace(/\D/g, '') + 'F';
      ctx.font = '700 8px JetBrains Mono, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(4,6,11,0.85)'; ctx.beginPath(); ctx.roundRect(-8 * scale - 13, -9 * scale - 5, 14, 10, 3); ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 0.8; ctx.stroke(); ctx.fillStyle = color; ctx.fillText(badge, -8 * scale - 6, -9 * scale);
    }
    if (count > 1) { ctx.fillStyle = color; ctx.font = '700 9px JetBrains Mono, monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(`×${count}`, (carrier ? 14 : 10) * scale, -6 * scale); }
    if ((named && k >= 1.6) || k >= 2.6) {
      let text = named ? navalLabel(g.units[0], a3, true) : (carrier ? (ar ? 'مجموعة حاملة' : 'Carrier group') : (ar ? 'أسطول' : 'Fleet'));
      if (named && carrier && count > 1) text += ` +${count - 1}`;
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
      if (!zz.choke) { ctx.strokeStyle = 'rgba(255,120,100,0.75)'; ctx.lineWidth = 1.3; ctx.setLineDash([5, 4]); ctx.lineDashOffset = -time * 10; ctx.beginPath(); ctx.arc(q[0], q[1], R * 0.62, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0; }
    }
    ctx.restore();
    // Blockaded straits get the full gate: chain of buoys, pickets, radar sweep, and crossfire when contested.
    for (const [z] of zones) {
      if (!SEA_ZONES[z].choke) continue;
      const g = this.straitGate(z), st = s.global.chokepoints?.[z]?.status; if (!g) continue;
      this.drawGate(ctx, g, time, 1, st === 'contested' ? '230,170,70' : '226,87,74', st === 'contested');
    }
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
    const off = 7 + 5 * ICON;
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
    const sc = ICON;
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


  // A naval battle in three rounds, replayed from the engine's own record. Each side forms a line facing the other:
  // carriers launch jets that dive on a target, surface ships fire missile salvos that are sometimes shot down short.
  // Hits start fires, ships that were sunk break up and go under, and the loser's survivors turn away.
  fx_naval(ctx, fx, u, now) {
    const e = fx.e, q = this.pt(e.at); if (!q) return;
    const S = this.state, sc = ICON * 1.6;
    const colOf = id => this.colorOf(S.countries[id], '#c8d2e0');
    if (!fx.geo) {
      const ang = (hash(e.zone) % 628) / 100 + Math.random() * 0.4, gap = 30 * sc, sp = 10 * sc;
      const ax = [Math.cos(ang), Math.sin(ang)], pr = [-ax[1], ax[0]];
      const fallback = (n, lost, owner) => Array.from({ length: Math.max(1, n || 3) }, (_, i) => ({ id: owner + i, owner, type: 'fleet', hp0: 100, hp1: i < lost ? 0 : 60, sunk: i < lost }));
      const sides = e.sides || { winner: fallback(e.ships?.winner, e.lost?.winner, e.winner), loser: fallback(e.ships?.loser, e.lost?.loser ?? 1, e.loser) };
      const lay = (list, dir) => list.map((sh, i) => {
        const o = (i - (list.length - 1) / 2) * sp;
        return { ...sh, x: dir * -gap * ax[0] + pr[0] * o + (Math.random() - 0.5) * 2, y: dir * -gap * ax[1] + pr[1] * o + (Math.random() - 0.5) * 2, face: dir > 0 ? ang : ang + Math.PI, sinkAt: 0.45 + Math.random() * 0.3, seed: Math.random() * 9 };
      });
      const win = lay(sides.winner, 1), lose = lay(sides.loser, -1), byId = new Map([...win, ...lose].map(x => [x.id, x]));
      const shots = (e.shots || []).filter(sh => byId.has(sh.from) && byId.has(sh.to));
      const perRound = [0, 0, 0];
      fx.geo = { win, lose, byId, ax, shots: shots.map(sh => ({ ...sh, bend: (Math.random() - 0.5) * 0.5, stop: sh.dmg < 14 && Math.random() < 0.6, idx: perRound[sh.round]++ })), perRound };
    }
    const { win, lose, shots, perRound, ax } = fx.geo;
    const fade = u > 0.9 ? 1 - (u - 0.9) / 0.1 : u < 0.05 ? u / 0.05 : 1;
    const prog = clamp((u - 0.1) / 0.68, 0, 1), retreat = clamp((u - 0.8) / 0.2, 0, 1);
    ctx.save(); ctx.globalAlpha = fade;
    // The sea over the fight is churned and darkened.
    const rg = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], 70 * sc); rg.addColorStop(0, `rgba(255,120,60,${0.12 * Math.sin(Math.PI * clamp(u * 1.1, 0, 1))})`); rg.addColorStop(1, 'rgba(255,120,60,0)');
    ctx.fillStyle = rg; ctx.fillRect(q[0] - 80 * sc, q[1] - 80 * sc, 160 * sc, 160 * sc);
    const pos = sh => { const rt = !sh.sunk && sh.isLoser ? retreat * 34 * sc : 0; return [q[0] + sh.x - ax[0] * rt, q[1] + sh.y - ax[1] * rt]; };
    for (const sh of lose) sh.isLoser = true;
    const drawShip = sh => {
      const sinkU = sh.sunk ? clamp((u - sh.sinkAt) / 0.22, 0, 1) : 0;
      if (sinkU >= 1) { const [x, y] = pos(sh); ctx.fillStyle = `rgba(20,20,26,${0.35 * (1 - clamp((u - sh.sinkAt - 0.2) / 0.3, 0, 1))})`; ctx.beginPath(); ctx.ellipse(x, y, 9 * sc, 4 * sc, sh.face, 0, TAU); ctx.fill(); return; }
      const [x, y] = pos(sh), col = colOf(sh.owner), hp = sh.hp0 + (sh.hp1 - sh.hp0) * prog, dmg = clamp(1 - hp / Math.max(1, sh.hp0), 0, 1);
      ctx.save(); ctx.translate(x, y + sinkU * 3 * sc); ctx.rotate(sh.face + sinkU * 0.5 * (sh.seed > 4.5 ? 1 : -1)); ctx.globalAlpha = fade * (1 - sinkU * 0.9);
      wake(ctx, 0, 0, sh.type === 'carrier' ? 11 * sc : 7 * sc, 1, now / 1000, sh.seed);
      const L = (sh.type === 'carrier' ? 12 : 7.5) * sc, B = (sh.type === 'carrier' ? 4.4 : 2.4) * sc;
      hull(ctx, 0, 0, L, B); ctx.fillStyle = 'rgba(4,6,11,0.92)'; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.stroke();
      if (sh.type === 'carrier') { ctx.fillStyle = hexA(col, 0.7); ctx.fillRect(-L * 0.1, B * 0.1, L * 0.18, B * 0.32); }
      ctx.restore();
      // Damage: a health pip and a fire that grows with it.
      if (dmg > 0.12 || sinkU > 0) {
        const fl = 0.6 + 0.4 * Math.sin(now / 70 + sh.seed);
        ctx.fillStyle = `rgba(255,${120 + 60 * fl | 0},50,${(0.25 + 0.5 * Math.max(dmg, sinkU)) * fade})`; ctx.beginPath(); ctx.arc(x, y - 1 * sc, (1.4 + 2.6 * Math.max(dmg, sinkU)) * sc * fl, 0, TAU); ctx.fill();
        ctx.fillStyle = `rgba(95,95,105,${0.3 * fade})`; ctx.beginPath(); ctx.arc(x + 2 * sc, y - (5 + 8 * dmg) * sc, (2 + 3 * dmg) * sc, 0, TAU); ctx.fill();
      }
      if (u > 0.1 && u < 0.85 && !sinkU) { const w = 11 * sc; ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x - w / 2, y + 6 * sc, w, 1.8); ctx.fillStyle = hp > 50 ? '#7fd9a0' : hp > 25 ? '#f0c060' : '#ff6a5a'; ctx.fillRect(x - w / 2, y + 6 * sc, w * clamp(hp / 100, 0, 1), 1.8); }
    };
    win.forEach(drawShip); lose.forEach(drawShip);
    // Rounds: each shot is staggered inside its round's window.
    for (const sh of shots) {
      const t0 = 0.1 + sh.round * 0.22 + (sh.idx / Math.max(1, perRound[sh.round])) * 0.12, dur = sh.kind === 'air' ? 0.12 : 0.1, v = (u - t0) / dur;
      if (v <= 0 || v >= 1.4) continue;
      const A = pos(fx.geo.byId.get(sh.from)), B = pos(fx.geo.byId.get(sh.to)), tgt = fx.geo.byId.get(sh.to);
      if (sh.kind === 'air') {
        // A jet leaves the carrier, circles in and dives on the target.
        const f = clamp(v, 0, 1), c = this.onCurve(A, B, ease(f), 0.45 * (sh.bend > 0 ? 1 : -1));
        if (v < 1) {
          ctx.strokeStyle = 'rgba(235,240,255,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); const c0 = this.onCurve(A, B, Math.max(0, ease(f) - 0.3), 0.45 * (sh.bend > 0 ? 1 : -1)); ctx.moveTo(c0[0], c0[1]); ctx.lineTo(c[0], c[1]); ctx.stroke();
          this.drawJet(ctx, c[0], c[1], c[2], 3.2 * sc, colOf(sh.fromWinner ? e.winner : e.loser));
        } else if (!sh.stop) this.boom(ctx, B[0], B[1], 6 * sc, clamp((v - 1) / 0.4, 0, 1));
      } else if (v < 1) {
        const h = this.onCurve(A, B, ease(v), sh.bend), t1 = this.onCurve(A, B, Math.max(0, ease(v) - 0.25), sh.bend);
        ctx.strokeStyle = sh.fromWinner ? 'rgba(255,220,150,0.65)' : 'rgba(255,150,140,0.6)'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(t1[0], t1[1]); ctx.lineTo(h[0], h[1]); ctx.stroke();
        ctx.fillStyle = '#fff1d6'; ctx.beginPath(); ctx.arc(h[0], h[1], 1.4, 0, TAU); ctx.fill();
        if (sh.stop && v > 0.6) { const ip = this.onCurve(A, B, 0.62, sh.bend); ctx.strokeStyle = 'rgba(190,240,255,0.7)'; ctx.beginPath(); ctx.moveTo(B[0], B[1] - 2); ctx.lineTo(ip[0], ip[1]); ctx.stroke(); }
      } else {
        const w = clamp((v - 1) / 0.4, 0, 1);
        if (sh.stop) { const ip = this.onCurve(A, B, 0.62, sh.bend); ctx.fillStyle = `rgba(200,240,255,${1 - w})`; ctx.beginPath(); ctx.arc(ip[0], ip[1], 1.5 + w * 4, 0, TAU); ctx.fill(); }
        else this.boom(ctx, B[0], B[1], 5 * sc, w);
      }
      if (tgt.sunk && u > tgt.sinkAt && u < tgt.sinkAt + 0.04) this.boom(ctx, B[0], B[1], 12 * sc, (u - tgt.sinkAt) / 0.04);
    }
    ctx.strokeStyle = `rgba(236,230,214,${0.4 * (1 - u)})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(q[0], q[1], 46 * sc + u * 14, 0, TAU); ctx.stroke();
    const name = SEA_ZONES[e.zone] ? SEA_ZONES[e.zone].name.toUpperCase() : '';
    this.tag(ctx, q[0], q[1] - 58 * sc, `NAVAL BATTLE · ${name}`, '#bff3ff');
    if (u > 0.78) { const W = S.countries[e.winner]; this.tag(ctx, q[0], q[1] + 56 * sc, `${(W?.name || '').toUpperCase()} HOLDS THE SEA${e.lost?.loser ? ` · ${e.lost.loser} SUNK` : ''}`, e.decisive ? '#ffd27a' : '#bff3ff'); }
    ctx.restore();
  },

  // --- straits: gates, forced passages ---
  // The line across a strait, in screen space: its centre, the way ships run through it, and the barrier at right angles.
  straitGate(zone) {
    const Z = SEA_ZONES[zone], q = Z && this.p(Z.lon, Z.lat); if (!q) return null;
    const nb = Z.n.map(id => SEA_ZONES[id]).map(n => this.p(n.lon, n.lat)).filter(p => p && Math.abs(p[0] - q[0]) < this.w / 2);
    let ax = [1, 0];
    if (nb.length >= 2) ax = [nb[0][0] - nb[nb.length - 1][0], nb[0][1] - nb[nb.length - 1][1]]; else if (nb.length) ax = [nb[0][0] - q[0], nb[0][1] - q[1]];
    const d = Math.hypot(ax[0], ax[1]) || 1; ax = [ax[0] / d, ax[1] / d];
    return { q, ax, bar: [-ax[1], ax[0]], sc: ICON };
  },
  // The barrier itself: a chain of buoys and mines strung between two picket ships, blinking, with a radar sweep.
  // `open` runs 0..1 for the chain closing across the strait, `tone` is the rgb of the warning colour.
  drawGate(ctx, g, time, open, tone, contested) {
    const { q, bar, ax, sc } = g, half = 30 * sc * open;
    if (half < 2) return;
    const A = [q[0] - bar[0] * half, q[1] - bar[1] * half], B = [q[0] + bar[0] * half, q[1] + bar[1] * half];
    ctx.save();
    // Radar sweep from the centre.
    const sw = time * 1.6, R = 44 * sc;
    const gr = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], R); gr.addColorStop(0, `rgba(${tone},0.0)`); gr.addColorStop(1, `rgba(${tone},0.22)`);
    ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.arc(q[0], q[1], R, sw, sw + 0.55); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = `rgba(${tone},0.35)`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(q[0], q[1], R, 0, TAU); ctx.stroke();
    // Hazard line with buoys.
    ctx.strokeStyle = `rgba(${tone},0.8)`; ctx.lineWidth = 1.6; ctx.setLineDash([5, 4]); ctx.lineDashOffset = -time * 8; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke(); ctx.setLineDash([]);
    const n = Math.max(2, Math.round(half / (5 * sc)));
    for (let i = 0; i <= n; i++) {
      const f = i / n - 0.5, x = q[0] + bar[0] * half * 2 * f, y = q[1] + bar[1] * half * 2 * f + Math.sin(time * 2 + i) * 0.8;
      const on = (Math.floor(time * 2 + i) % 2) === 0;
      ctx.fillStyle = on ? `rgba(${tone},0.95)` : 'rgba(30,20,22,0.9)'; ctx.beginPath(); ctx.arc(x, y, 1.6 * sc, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(${tone},0.8)`; ctx.lineWidth = 0.7; ctx.stroke();
    }
    // Pickets at each end, bows pointing out along the strait.
    for (const [p, side] of [[A, -1], [B, 1]]) {
      ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(Math.atan2(ax[1], ax[0]) + (side > 0 ? 0 : Math.PI)); ctx.scale(sc, sc);
      wake(ctx, 0, 0, 7, 1, time, side); hull(ctx, 0, 0, 8, 2.6); ctx.fillStyle = 'rgba(4,6,11,0.94)'; ctx.fill(); ctx.strokeStyle = `rgba(${tone},0.95)`; ctx.lineWidth = 1.1; ctx.stroke();
      ctx.restore();
    }
    if (contested) {
      // Crossfire: tracer streaks fly between the two sides in short bursts.
      for (let i = 0; i < 4; i++) {
        const ph = (time * 1.3 + i * 0.37) % 1.2; if (ph > 0.35) continue;
        const f = ph / 0.35, from = i % 2 ? A : B, to = i % 2 ? B : A, off = (i - 1.5) * 2.5 * sc;
        const x = from[0] + (to[0] - from[0]) * f + ax[0] * off, y = from[1] + (to[1] - from[1]) * f + ax[1] * off;
        ctx.strokeStyle = 'rgba(255,230,160,0.9)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - bar[0] * 4 * (i % 2 ? 1 : -1), y - bar[1] * 4 * (i % 2 ? 1 : -1)); ctx.stroke();
      }
    }
    ctx.restore();
  },
  // A strait closing, contested or reopening: the chain of buoys runs across from the pickets (or is cut and drifts
  // apart when it reopens), with expanding rings at the centre.
  fx_choke(ctx, fx, u, now) {
    const e = fx.e, g = this.straitGate(e.zone); if (!g) return;
    const closing = e.status !== 'open', tone = e.status === 'closed' ? '226,87,74' : e.status === 'contested' ? '230,170,70' : '127,191,154';
    const fade = u > 0.85 ? 1 - (u - 0.85) / 0.15 : 1;
    ctx.save(); ctx.globalAlpha = fade;
    this.drawGate(ctx, g, now / 1000, closing ? ease(u / 0.5) : 1 - ease((u - 0.1) / 0.5), tone, e.status === 'contested');
    for (let i = 0; i < 3; i++) { const v = (u * 1.8 + i / 3) % 1; ctx.strokeStyle = `rgba(${tone},${(1 - v) * (1 - u)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(g.q[0], g.q[1], 6 + v * 40 * g.sc, 0, TAU); ctx.stroke(); }
    const Z = SEA_ZONES[e.zone], by = this.state.countries[e.by];
    const word = e.status === 'closed' ? 'CLOSED' : e.status === 'contested' ? 'CONTESTED' : 'REOPENED';
    this.tag(ctx, g.q[0], g.q[1] - 34 * g.sc, `${Z.name.toUpperCase()} ${word}${by && e.status !== 'open' ? ` · ${by.name.toUpperCase()}` : ''}`, `rgb(${tone})`);
    ctx.restore();
  },
  // Forcing a strait: a squadron steams in along the channel, shore batteries on both banks fire on it, shells throw
  // up columns of water, mines go off at the chain, and the ships either break through (the strait reopens) or are
  // turned back.
  fx_force(ctx, fx, u, now) {
    const e = fx.e, g = this.straitGate(e.zone); if (!g) return;
    const { q, ax, bar, sc } = g, S = this.state, col = this.colorOf(S.countries[e.owner], '#c8d2e0');
    const cp = S.global.chokepoints?.[e.zone], through = !cp || cp.status === 'open' || cp.forced;
    const fade = u > 0.9 ? 1 - (u - 0.9) / 0.1 : 1, t = now / 1000;
    ctx.save(); ctx.globalAlpha = fade;
    const run = 90 * sc, from = [q[0] - ax[0] * run, q[1] - ax[1] * run], to = [q[0] + ax[0] * run, q[1] + ax[1] * run];
    const chainBroken = clamp((u - 0.45) / 0.15, 0, 1);
    this.drawGate(ctx, g, t, 1 - chainBroken * 0.9, '226,87,74', true);
    // The squadron: four hulls in line ahead, going through or turning at the chain.
    for (let i = 0; i < 4; i++) {
      const lag = i * 0.05, v = clamp((u - 0.08 - lag) / 0.62, 0, 1);
      let f = v; if (!through && u > 0.5) f = clamp(0.5 - (u - 0.5) * 0.9, 0.12, 0.5) * 1 + 0.0;
      const x = from[0] + (to[0] - from[0]) * f + bar[0] * (i % 2 ? 5 : -5) * sc, y = from[1] + (to[1] - from[1]) * f + bar[1] * (i % 2 ? 5 : -5) * sc;
      const heading = Math.atan2(ax[1], ax[0]) + (!through && u > 0.5 ? Math.PI : 0);
      ctx.save(); ctx.translate(x, y); ctx.rotate(heading); ctx.scale(sc, sc);
      wake(ctx, 0, 0, 10, 1, t, i); hull(ctx, 0, 0, 9, 2.8); ctx.fillStyle = 'rgba(4,6,11,0.95)'; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.restore();
      if (u > 0.2 && u < 0.7 && Math.sin(t * 9 + i) > 0.2) { ctx.fillStyle = `rgba(255,170,90,${0.3 + 0.3 * Math.sin(t * 20 + i)})`; ctx.beginPath(); ctx.arc(x, y - 1, 2.4 * sc, 0, TAU); ctx.fill(); }
    }
    // Shore batteries on both banks.
    for (const side of [-1, 1]) {
      const bat = [q[0] + bar[0] * side * 48 * sc, q[1] + bar[1] * side * 48 * sc];
      ctx.fillStyle = '#d88a5a'; ctx.beginPath(); ctx.arc(bat[0], bat[1], 2.2 * sc, 0, TAU); ctx.fill();
      for (let k = 0; k < 3; k++) {
        const ph = ((t * 1.4 + k * 0.33 + side * 0.17) % 1), tx = from[0] + (to[0] - from[0]) * clamp((u - 0.08) / 0.62, 0, 1) + (k - 1) * 8 * sc, ty = from[1] + (to[1] - from[1]) * clamp((u - 0.08) / 0.62, 0, 1);
        if (u < 0.18 || u > 0.7) continue;
        const hx = bat[0] + (tx - bat[0]) * ph, hy = bat[1] + (ty - bat[1]) * ph - Math.sin(ph * Math.PI) * 10 * sc;
        ctx.fillStyle = '#ffe0a8'; ctx.beginPath(); ctx.arc(hx, hy, 1.3, 0, TAU); ctx.fill();
        if (ph > 0.9) { ctx.fillStyle = 'rgba(210,235,255,0.7)'; ctx.beginPath(); ctx.ellipse(tx, ty + 2, 2.5 * sc, 4 * sc * (1.1 - ph), 0, 0, TAU); ctx.fill(); }
      }
    }
    // Mines at the chain.
    if (u > 0.45 && u < 0.62) this.boom(ctx, q[0] + bar[0] * 6 * sc, q[1] + bar[1] * 6 * sc, 10 * sc, (u - 0.45) / 0.17);
    const Z = SEA_ZONES[e.zone], by = e.by && S.countries[e.by];
    this.tag(ctx, q[0], q[1] - 50 * sc, `FORCING ${Z.name.toUpperCase()}${by ? ` · ${by.name.toUpperCase()} HOLDS IT` : ''}`, '#ff8a6b');
    if (u > 0.72) this.tag(ctx, q[0], q[1] + 44 * sc, through ? 'STRAIT OPEN' : 'FORCE TURNED BACK', through ? '#9fe8b6' : '#ff8a6b');
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
