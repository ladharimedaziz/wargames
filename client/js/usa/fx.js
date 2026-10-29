// Animation for the US map: shells and bombs in flight and where they land, medevac and crowd-dispersal pulses, flames and smoke on a
// hit unit, an expanding ring where an order was given, and dust or vapour trails behind moving units. It draws on the overlay each
// frame. Flights are timed by the game clock (so every screen agrees) and impacts by the screen's own clock.
import { glidePos, typeOf } from '/shared/engine/usa-sim.js';

const KM_LAT = 110.57, KM_LON = lat => 111.32 * Math.cos(lat * Math.PI / 180);
const rnd = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); }; // steady pseudo-random, so a flame does not jump about

// Notices what changed since the last state: a unit that lost strength flares, one that was destroyed burns, and the picked units'
// new orders get a ring at their destination. Returns true when something new started.
export function detect(S, now) {
  const prev = S.fxPrev || null, cur = {}, list = S.fxLocal ||= [];
  let started = false;
  for (const u of Object.values(S.units || {})) {
    const o = u.order, oKey = o ? JSON.stringify([o.type, o.to, o.target]) : '';
    cur[u.id] = [u.strength, !!u.destroyed, oKey];
    const p = prev?.[u.id]; if (!p) continue;
    if (!p[1] && u.destroyed) { list.push({ k: 'burn', lon: u.lon, lat: u.lat, t0: now, dur: 4500 }); started = true; }
    else if (u.strength < p[0] - 0.5 && !u.destroyed) { list.push({ k: 'hit', lon: u.lon, lat: u.lat, t0: now, dur: 700 }); started = true; }
    if (oKey && oKey !== p[2] && S.selSet?.has(u.id) && (o.to || o.target)) {
      const t = o.target ? S.units[o.target] : null, g = o.to || (t && [t.lon, t.lat]);
      if (g) { list.push({ k: 'ping', lon: g[0], lat: g[1], t0: now, dur: 900, c: o.type === 'attack' ? '#ff5a4a' : o.type === 'escort' ? '#ffd166' : '#5fd08a' }); started = true; }
    }
  }
  S.fxPrev = cur;
  S.fxLocal = list.filter(f => now - f.t0 < f.dur);
  return started;
}

// Pixels per kilometre at a place, from the projection.
const pxPerKm = (proj, lon, lat) => { const a = proj([lon, lat]), b = proj([lon + 0.1, lat]); return a && b ? Math.hypot(b[0] - a[0], b[1] - a[1]) / (0.1 * KM_LON(lat)) : 1; };

// Where the game clock is now: the last tick plus what has passed since it arrived, at the clock's speed.
const gameNow = (S, now) => (S.usa.sim?.t || 0) + (S.usa.sim?.running ? Math.max(0, now - (S.recvAt || now)) / 1000 * (S.usa.sim.speed || 1) : 0);

export function drawFx(ctx, S, proj, now, posOf) {
  let busy = false;
  const gn = gameNow(S, now);
  // Abilities in flight and just landed.
  for (const f of S.usa.fx || []) {
    const pa = proj(f.from), pb = proj(f.to); if (!pa || !pb) continue;
    const span = Math.max(1, f.at - f.t0), pr = (gn - f.t0) / span, ppk = pxPerKm(proj, f.to[0], f.to[1]), R = Math.max(6, f.r * ppk);
    if (f.k === 'medevac' || f.k === 'disperse') {
      const col = f.k === 'medevac' ? '95,208,138' : '240,240,255', e = Math.max(0, Math.min(1.4, pr));
      if (pr < 1.6) { busy = true; ctx.strokeStyle = `rgba(${col},${Math.max(0, 1 - e / 1.4)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(pa[0], pa[1], R * Math.min(1, e), 0, 6.2832); ctx.stroke(); if (f.k === 'medevac') { ctx.fillStyle = `rgba(${col},${Math.max(0, 1 - e / 1.4)})`; ctx.font = `700 ${Math.max(10, R * 0.4)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('+', pa[0], pa[1] + R * 0.15); } }
      continue;
    }
    if (pr < 1) {
      busy = true;
      if (f.k === 'barrage') {
        // A salvo of shells in high arcs.
        for (let i = 0; i < 5; i++) {
          const t = Math.max(0, Math.min(1, pr * 1.15 - i * 0.04)); if (t <= 0 || t >= 1) continue;
          const x = pa[0] + (pb[0] - pa[0]) * t + (rnd(i, 1) - 0.5) * R * t, y = pa[1] + (pb[1] - pa[1]) * t - Math.sin(t * Math.PI) * (30 + Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) * 0.18);
          ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.arc(x, y, 3.4, 0, 6.2832); ctx.fill();
          ctx.strokeStyle = 'rgba(255,233,168,.45)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - (pb[0] - pa[0]) * 0.02, y + 4); ctx.stroke();
        }
      } else {
        // Aircraft run: a bright streak flying from the aircraft to the target.
        const t = Math.min(1, pr), x = pa[0] + (pb[0] - pa[0]) * t, y = pa[1] + (pb[1] - pa[1]) * t;
        const g = ctx.createLinearGradient(pa[0], pa[1], x, y); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,.85)');
        ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(pa[0] + (x - pa[0]) * 0.2, pa[1] + (y - pa[1]) * 0.2); ctx.lineTo(x, y); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 3, 0, 6.2832); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,120,80,.5)'; ctx.setLineDash([4, 5]); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(pb[0], pb[1], R, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]); // where it will land
    } else if (pr < 1 + 1.2) {
      // Impact: flashes and fireballs across the ring.
      busy = true; const e = (pr - 1) / 1.2, n = f.k === 'carpet' ? 14 : 8;
      ctx.strokeStyle = `rgba(255,220,160,${Math.max(0, 0.8 - e)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(pb[0], pb[1], R * (0.4 + e * 1.1), 0, 6.2832); ctx.stroke(); // shock ring
      for (let i = 0; i < n; i++) {
        const a = rnd(i, f.at) * 6.2832, d = Math.sqrt(rnd(i, f.at + 3)) * R, delay = rnd(i, 9) * 0.5, ee = Math.max(0, Math.min(1, (e - delay) / 0.5));
        if (ee <= 0) continue;
        const x = pb[0] + Math.cos(a) * d, y = pb[1] + Math.sin(a) * d, rad = (12 + rnd(i, 4) * 18) * Math.sin(ee * Math.PI * 0.9 + 0.2);
        const gr = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, rad)); gr.addColorStop(0, `rgba(255,245,200,${1 - ee})`); gr.addColorStop(0.4, `rgba(255,150,60,${0.9 * (1 - ee)})`); gr.addColorStop(1, 'rgba(90,40,30,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, Math.max(1, rad), 0, 6.2832); ctx.fill();
      }
    }
  }
  // Local effects: hits, burning wrecks, order rings.
  for (const f of S.fxLocal || []) {
    const p = proj([f.lon, f.lat]); if (!p) continue;
    const e = (now - f.t0) / f.dur; if (e >= 1) continue; busy = true;
    if (f.k === 'ping') { ctx.strokeStyle = f.c; ctx.globalAlpha = 1 - e; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(p[0], p[1], 5 + (1 - e) * 22, 0, 6.2832); ctx.stroke(); ctx.globalAlpha = 1; }
    else if (f.k === 'hit') { const gr = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], 16); gr.addColorStop(0, `rgba(255,240,180,${1 - e})`); gr.addColorStop(1, 'rgba(255,100,50,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p[0], p[1], 16, 0, 6.2832); ctx.fill(); }
    else if (f.k === 'burn') {
      // A fireball that settles into smoke rising off the wreck.
      const r = 8 + 20 * Math.sin(Math.min(1, e * 3) * Math.PI / 2);
      if (e < 0.35) { const gr = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r); gr.addColorStop(0, `rgba(255,250,210,${1 - e * 2})`); gr.addColorStop(0.5, `rgba(255,140,50,${0.9 - e})`); gr.addColorStop(1, 'rgba(120,40,20,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 6.2832); ctx.fill(); }
      for (let i = 0; i < 5; i++) { const t = Math.max(0, e - i * 0.07), y = p[1] - t * 46, x = p[0] + Math.sin(t * 9 + i) * 5 * t; ctx.fillStyle = `rgba(70,70,76,${Math.max(0, 0.5 - t * 0.5)})`; ctx.beginPath(); ctx.arc(x, y, 4 + t * 12, 0, 6.2832); ctx.fill(); }
    }
  }
  return busy;
}

// A fading trail behind each moving unit: tan dust for vehicles, a pale vapour trail for aircraft. Called with the drawn positions.
export function drawTrails(ctx, S, proj, now, posOf) {
  const tr = S.trail ||= {};
  let busy = false;
  for (const u of Object.values(S.units || {})) {
    const pos = posOf.get(u.id); if (!pos) continue;
    const moving = u.mv && !u.destroyed && !u.carry && u.air !== 'parked', t = tr[u.id] ||= [];
    if (moving) { const last = t[t.length - 1]; if (!last || now - last[2] > 140) { t.push([pos[0], pos[1], now]); if (t.length > 14) t.shift(); } }
    while (t.length && now - t[0][2] > 2200) t.shift();
    if (t.length < 2) continue;
    busy = true;
    const air = u.air === 'flying' || (u.type && /f35|f22|f15|a10|bomber|c130|tanker|awacs|mq9|air_wing/.test(u.type));
    if (!air && typeOf(u).domain === 'sea') { seaWake(ctx, t, proj, now); continue; }
    for (let i = 1; i < t.length; i++) {
      const a = proj([t[i - 1][0], t[i - 1][1]]), b = proj([t[i][0], t[i][1]]); if (!a || !b) continue;
      const age = Math.min(1, (now - t[i][2]) / 2200);
      ctx.strokeStyle = air ? `rgba(235,245,255,${0.7 * (1 - age)})` : `rgba(196,170,120,${0.55 * (1 - age)})`; ctx.lineWidth = air ? 2 : 3.2 * (1 - age) + 0.8;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
  }
  return busy;
}
// A ship's wake: two arms of white water that spread apart as they age, with foam down the middle.
function seaWake(ctx, t, proj, now) {
  const pts = t.map(([lon, lat, at]) => { const q = proj([lon, lat]); return q && [q[0], q[1], Math.min(1, (now - at) / 2200)]; }).filter(Boolean);
  if (pts.length < 2) return;
  for (const side of [-1, 1]) {
    ctx.strokeStyle = 'rgba(225,240,255,.5)'; ctx.lineWidth = 1;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
      const sa = side * (2 + a[2] * 9), sb = side * (2 + b[2] * 9);
      ctx.globalAlpha = 1 - a[2]; ctx.beginPath(); ctx.moveTo(a[0] + nx * sa, a[1] + ny * sa); ctx.lineTo(b[0] + nx * sb, b[1] + ny * sb); ctx.stroke();
    }
  }
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    ctx.globalAlpha = 1; ctx.strokeStyle = `rgba(240,248,255,${0.55 * (1 - b[2])})`; ctx.lineWidth = 3.5 * (1 - b[2]) + 0.6;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
// The game clock as a screen shows it: the server only sends a state when something changes, so between sends the clock is carried
// on from the last one at the clock's speed.
import { useState, useEffect, useRef } from '../lib.js';
export function useGameClock(sim) {
  const [, tick] = useState(0), at = useRef({ t: sim?.t || 0, from: performance.now() });
  if (at.current.t !== (sim?.t || 0) || at.current.running !== !!sim?.running) at.current = { t: sim?.t || 0, from: performance.now(), running: !!sim?.running };
  useEffect(() => { if (!sim?.running) return; const i = setInterval(() => tick(n => n + 1), 250); return () => clearInterval(i); }, [!!sim?.running]);
  return (sim?.t || 0) + (sim?.running ? (performance.now() - at.current.from) / 1000 * (sim.speed || 1) : 0);
}
export { glidePos };
