// "The Unthinkable": the nuclear ending. It picks up straight from the stage map: the flat map, as it stands (each
// country in its camp's colour, occupied lands in their occupier's, fronts hatched), with the missiles already in the
// air where the map left them, bends into a 3D globe while they fly. Then the warheads land, smoke spreads, the
// winter covers everything, the Doomsday Clock reaches midnight, and the title. The Cold War committee gets it as a
// newsreel matching its intro (teletype, film grain, sepia); other committees as a clean command-centre feed.
// Abstract by design: no people, no scenes of harm, only light, dark and numbers.
import { html, useEffect, useRef, useState, cls, fmt } from '../lib.js';
import { geoEqualEarth, geoEqualEarthRaw, geoOrthographicRaw, geoProjectionMutator, geoPath, geoGraticule10, geoInterpolate, geoRotation, geoCircle, geoDistance } from 'd3-geo';
import { loadAtlas } from '../map/atlas.js';
import { isOOB } from '/shared/engine/core.js';
import { stateSplit } from '/shared/data/german-split.js';
import { arsenalOf } from '/shared/data/launch-sites.js';

const clamp01 = x => Math.max(0, Math.min(1, x));
const ease = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOut = x => 1 - Math.pow(1 - clamp01(x), 3);
const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const TAU = Math.PI * 2, RAD = Math.PI / 180;

// Seconds into the film. MORPH: the flat map bends into the globe.
const MORPH = 3.6, SMOKE_AT = 9.5, CLOCK_AT = 18, TITLE_AT = 23.5;
export const UNTHINKABLE_MS = 44000;
// The stage map's own timing for an exchange (client/js/map/renderer.js): the first missile launches 1.2 s into the
// turn and flies 4.6 s; every salvo launches 0.8 s later, 0.02 s apart, and flies 3.8 s.
const MAP_FIRST = 1.2, MAP_GAP = 0.8, MAP_STEP = 0.02, MAP_FLIGHT0 = 4.6, MAP_FLIGHT = 3.8;

const THEMES = {
  cold: { A: '#6a9ccf', B: '#d9503f', C: '#d9a441', N: '#7a6a50', land: 'rgba(120,96,60,0.55)', sea0: '#2a1e10', sea1: '#0a0704', rim: 'rgba(255,182,77,0.55)', grat: 'rgba(255,200,120,0.08)', border: 'rgba(243,230,200,0.25)', halo: '255,170,90', trail: '255,214,150' },
  modern: { A: '#4f8fe0', B: '#e0473c', C: '#f5a524', N: '#4b5563', land: 'rgba(70,90,110,0.6)', sea0: '#0c2238', sea1: '#02060c', rim: 'rgba(120,190,255,0.5)', grat: 'rgba(140,200,255,0.07)', border: 'rgba(200,225,255,0.22)', halo: '90,160,255', trail: '255,200,140' },
};

function useFilmClock(startS) {
  const base = useRef(performance.now() - startS * 1000);
  const [t, setT] = useState(startS);
  useEffect(() => {
    let raf;
    const tick = () => { setT((performance.now() - base.current) / 1000); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return t;
}

// Where each warhead is when the film starts, and when it lands. After an exchange on the stage the missiles are
// already in the air (`lead`: how long the map ran first), so each picks up where the map left it and the last
// stretch plays slower as the camera pulls into 3D. Played by hand there is no map before: every arsenal goes up in
// the first seconds of the film.
export function schedule(tracks, lead) {
  return tracks.map((tr, i) => {
    const km = geoDistance(tr.f, tr.to) * 6371;
    let launch, p0;
    if (lead) {
      const ml = i === 0 ? MAP_FIRST : MAP_FIRST + MAP_GAP + (i - 1) * MAP_STEP, mf = i === 0 ? MAP_FLIGHT0 : MAP_FLIGHT;
      p0 = clamp01((lead - ml) / mf) * 0.85;
      launch = p0 > 0 ? 0 : ml - lead;
    } else {
      p0 = 0;
      launch = i === 0 ? 0.3 : 1.1 + hash(i * 13.7) * 1.6;
    }
    const flight = (1 - p0) * (3.4 + Math.min(1.6, km / 7000)) + 1.4 + hash(i * 3.1) * 1.2;
    return { ...tr, launch, p0, land: launch + flight, i, interp: geoInterpolate(tr.f, tr.to), loft: 0.05 + Math.min(0.22, km / 40000) };
  });
}

export function Unthinkable({ state, now }) {
  const e = state.display.ending, ex = e.exchange || {};
  const cold = state.settings.era === 'cold85';
  const theme = cold ? 'cold' : 'modern';
  // Straight after the stage map's exchange, start from the top and pick the missiles up where the map has them
  // (`exchangeClock` from client/js/map/renderer.js); otherwise (a reload, a hand-played ending) go by the clock.
  const handoff = useRef(null);
  if (!handoff.current) {
    const c = window.__map?.exchangeClock, p = performance.now();
    handoff.current = c && p - c.cut < 4000 ? { start: 0, lead: (p - c.zero) / 1000 } : { start: Math.max(0, (now - state.display.endingAt) / 1000), lead: ex.mapLead || 0 };
  }
  const t = useFilmClock(handoff.current.start);
  const tracks = useRef(null);
  if (!tracks.current) tracks.current = schedule((ex.tracks || []).filter(tr => tr.f && tr.to), handoff.current.lead);
  const tr = tracks.current;
  const N = id => state.countries[id]?.name || id;
  // Only some warheads are drawn; the counter shows the whole arsenals going up. An ending saved before arsenals
  // were counted gets them from the countries that fired.
  const firingAll = [...new Set(tr.map(s => s.o))];
  const total = ex.drawn ? Math.max(ex.strikes, tr.length) : tr.length > 1 ? Math.max(tr.length, firingAll.reduce((s, id) => s + arsenalOf(state, id), 0)) : tr.length || 1;
  const per = tr.length > 1 ? (total - 1) / (tr.length - 1) : 1;
  const up = tr.filter(s => t >= s.launch).length, launched = up ? Math.min(total, Math.round(1 + (up - 1) * per)) : 0;
  const struckNow = new Set(tr.filter(s => t >= s.land).map(s => s.t));
  const firingNow = [...new Set(tr.filter(s => t >= s.launch).map(s => s.o))];
  const scene = t < CLOCK_AT ? 'globe' : t < TITLE_AT ? 'clock' : 'title';
  const nations = (ex.struckIds || []).length || struckNow.size;
  const all = tr.length > 1;
  const caption = t < 2.6 ? (all ? 'Detected. Every nuclear power on both sides launches everything it has.' : `${N(ex.first)} fires on ${N(ex.hit)}.`)
    : t < 5.4 ? (all ? 'Every silo. Every submarine. Every bomber.' : 'One warhead. One flash.')
    : t < SMOKE_AT + 1.5 ? `${total.toLocaleString('en-US')} ${total === 1 ? 'warhead' : 'warheads'}. ${nations} ${nations === 1 ? 'nation' : 'nations'}. Under an hour.`
    : 'Then the smoke rises, and keeps rising.';
  const view = { ...ex, strikes: total };

  return html`<div class=${cls('nuke-film', `nf-${theme}`, cold && 'ci')}>
    <${Globe} t=${t} state=${state} theme=${theme} tracks=${tr} />
    ${scene === 'globe' && t < 7 && html`<${Ticker} t=${t} state=${state} ex=${view} N=${N} cold=${cold} />`}
    ${scene === 'globe' && t > 0.6 && html`<div class="nf-hud">
      <div class="nf-count"><b>${launched.toLocaleString('en-US')}</b><span>${launched === 1 ? 'warhead launched' : 'warheads launched'}</span></div>
      <div class="nf-count"><b>${struckNow.size}</b><span>${struckNow.size === 1 ? 'nation struck' : 'nations struck'}</span></div>
      <div class="nf-firing">${firingNow.map(id => html`<div key=${id} class="nf-fire" style=${{ '--c': THEMES[theme][state.countries[id]?.bloc] || THEMES[theme].N }}><i></i>${N(id)}</div>`)}</div>
    </div>`}
    ${scene === 'globe' && t > 0.4 && html`<div class="nf-caption" key=${caption}>${caption}</div>`}
    ${scene === 'clock' && html`<${Midnight} t=${t} theme=${theme} />`}
    ${scene === 'title' && html`<${Title} t=${t} state=${state} e=${e} ex=${view} cold=${cold} />`}
    ${cold && html`<div class="ci-grain"></div><div class="ci-vignette"></div><div class="ci-scratches"><i></i><i></i><i></i></div><div class="ci-bars"></div>`}
    ${!cold && html`<div class="nf-scan"></div>`}
  </div>`;
}

function Typed({ t, at, text, cps = 34 }) {
  if (t < at) return null;
  const n = Math.min(text.length, Math.floor((t - at) * cps));
  return html`<span>${text.slice(0, n)}${n < text.length && html`<i class="ci-caret">█</i>`}</span>`;
}

// The flash, typed across the top of the frame while the map bends into the globe: the intro's wire service on the
// Cold War committee, a command-centre strip elsewhere.
function Ticker({ t, state, ex, N, cold }) {
  const date = fmt.date(state.meta.clock, 'en').toUpperCase();
  const site = ex.tracks?.[0]?.s;
  const lines = [
    [0.1, `FLASH // ${date} // LAUNCH DETECTED: ${String(N(ex.first) || 'UNKNOWN').toUpperCase()}${site ? `, ${site.toUpperCase()}` : ''}`],
    [1.6, ex.strikes > 1 ? `ALL FORCES: LAUNCH ON WARNING // ${ex.strikes.toLocaleString('en-US')} WARHEADS // THIS IS NOT AN EXERCISE` : `IMPACT PREDICTED: ${String(N(ex.hit) || 'UNKNOWN').toUpperCase()} // THIS IS NOT AN EXERCISE`],
  ];
  return html`<div class=${cls('nf-ticker', cold ? 'paper' : 'hud', t > 6.2 && 'out')}>
    <div class="nf-ticker-head"><span>${cold ? 'WORLD ENGINE WIRE SERVICE' : 'STRATEGIC WARNING'}</span>${t > 2.4 && html`<b>DEFCON 1</b>`}</div>
    ${lines.map(([at, text]) => t > at && html`<div class="nf-tline" key=${at}><${Typed} t=${t} at=${at} text=${text} /></div>`)}
  </div>`;
}

// The world, drawn from the map as it stands, bending from the stage's flat map into a globe.
function Globe({ t, state, theme, tracks }) {
  const ref = useRef();
  const tRef = useRef(t); tRef.current = t;
  const stRef = useRef(state); stRef.current = state;
  useEffect(() => {
    const canvas = ref.current, ctx = canvas.getContext('2d');
    const P = THEMES[theme];
    let raf, atlas, w = 0, h = 0, dpr = 1, rot, flat;
    // One projection that is the stage's Equal Earth map at k = 0 and an orthographic globe at k = 1.
    let sE = 1, sO = 1;
    const mix = k => (l, p) => {
      const a = geoEqualEarthRaw(l, p), b = geoOrthographicRaw(l, p);
      return [a[0] * sE * (1 - k) + b[0] * sO * k, a[1] * sE * (1 - k) + b[1] * sO * k];
    };
    const mutate = geoProjectionMutator(mix);
    const proj = mutate(0).scale(1).precision(1.5);
    const path = geoPath(proj, ctx);
    const grat = geoGraticule10();
    const size = () => {
      const r = canvas.getBoundingClientRect(); dpr = Math.min(1.5, devicePixelRatio || 1); w = r.width; h = r.height; canvas.width = w * dpr; canvas.height = h * dpr;
      // The stage map's framing (client/js/map/renderer.js) and camera, so frame one is what was on screen.
      const m = window.__map, f = geoEqualEarth().rotate([-12, 0]).fitExtent([[10, 10], [w - 10, h - 10]], { type: 'MultiPoint', coordinates: [[-168, 0], [192, 0], [12, 83], [12, -57], [-160, 70], [180, 70], [-160, -50], [180, -50]] });
      if (m?.projection && m.cam && m.w === w) { const [px, py] = m.projection.translate(); flat = { s: m.projection.scale() * m.cam.k, t: [px * m.cam.k + m.cam.x, py * m.cam.k + m.cam.y] }; }
      else flat = { s: f.scale(), t: f.translate() };
    };
    size();
    const ro = new ResizeObserver(size); ro.observe(canvas);
    loadAtlas(stateSplit(stRef.current)).then(a => { atlas = a.lo; });
    // Aim the camera at the middle of the exchange (the mean of every launch and impact point on the sphere).
    const pts = tracks.flatMap(s => [s.f, s.to]);
    let cx = 0, cy = 0, cz = 0;
    for (const [lo, la] of pts) { cx += Math.cos(la * RAD) * Math.cos(lo * RAD); cy += Math.cos(la * RAD) * Math.sin(lo * RAD); cz += Math.sin(la * RAD); }
    const aimLon = pts.length ? Math.atan2(cy, cx) / RAD : 20, aimLat = pts.length ? Math.max(-10, Math.min(62, Math.atan2(cz, Math.hypot(cx, cy)) / RAD)) : 45;
    const struckAt = new Map();
    for (const s of tracks) if (!struckAt.has(s.t) || struckAt.get(s.t) > s.land) struckAt.set(s.t, s.land);
    const targets = [...struckAt.keys()].map(id => tracks.find(s => s.t === id));
    const winter = tracks.length > 1;
    const labelled = new Map();
    for (const s of tracks) if (s.s && !labelled.has(s.s) && labelled.size < 6) labelled.set(s.s, s.i);
    const circle = geoCircle().precision(6);
    let k = 0;
    // A point lifted `alt` (fraction of the radius) above the surface, on screen; null when behind the globe.
    const lift = (lonlat, alt) => {
      const r = rot(lonlat), l = r[0] * RAD, p = r[1] * RAD;
      const [tx, ty] = proj.translate();
      const o = [Math.cos(p) * Math.sin(l), Math.sin(p), Math.cos(p) * Math.cos(l)];
      const ok = [tx + sO * (1 + alt) * o[0], ty - sO * (1 + alt) * o[1]];
      if (k >= 1) return o[2] < 0 && (1 + alt) ** 2 * (o[0] ** 2 + o[1] ** 2) < 1 ? null : ok;
      const e = geoEqualEarthRaw(l, p), fl = [tx + sE * e[0], ty - sE * e[1] - alt * sO * 0.7];
      if (k > 0.55 && o[2] < 0 && (1 + alt) ** 2 * (o[0] ** 2 + o[1] ** 2) < 1) return null;
      return [fl[0] * (1 - k) + ok[0] * k, fl[1] * (1 - k) + ok[1] * k];
    };
    const colourOf = c => {
      if (!c || c.control === 'inactive') return P.land;
      const occ = c.occupiedBy && stRef.current.countries[c.occupiedBy];
      return P[(occ || c).bloc] || P.N;
    };
    const draw = () => {
      const tt = tRef.current;
      if (!w || !flat) { raf = requestAnimationFrame(draw); return; }
      k = ease(clamp01(tt / MORPH));
      const kp = ease(clamp01((tt / MORPH - 0.25) / 0.75)); // tilt toward the pole only once the map is curving
      const drift = Math.max(0, tt - MORPH) * 0.6;
      const zoom = 0.43 - 0.05 * clamp01((tt - TITLE_AT) / 4);
      sE = flat.s; sO = Math.min(w, h) * zoom;
      const [fx, fy] = flat.t, gx = w / 2, gy = h / 2 + (tt > TITLE_AT ? h * 0.1 * easeOut((tt - TITLE_AT) / 3) : 0);
      const lam = 12 + (aimLon - 12) * k + drift;
      mutate(k);
      proj.scale(1).translate([fx + (gx - fx) * k, fy + (gy - fy) * k]).rotate([-lam, -aimLat * kp]).clipAngle(k < 0.02 ? null : Math.max(90, 179.9 - 89.9 * k));
      rot = geoRotation(proj.rotate());
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const R = sO, [ox, oy] = proj.translate();
      const dark = clamp01((tt - SMOKE_AT) / 8);
      if (k > 0.3) {
        const halo = ctx.createRadialGradient(ox, oy, R * 0.96, ox, oy, R * 1.22);
        halo.addColorStop(0, `rgba(${P.halo},${0.35 * (1 - dark * 0.8) * clamp01((k - 0.3) / 0.7)})`); halo.addColorStop(1, `rgba(${P.halo},0)`);
        ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(ox, oy, R * 1.22, 0, TAU); ctx.fill();
      }
      const g = ctx.createRadialGradient(ox - R * 0.35, oy - R * 0.4, R * 0.1, ox, oy, R * 1.05 + sE * (1 - k) * 2);
      g.addColorStop(0, P.sea0); g.addColorStop(1, P.sea1);
      ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = g; ctx.fill();
      ctx.beginPath(); path(grat); ctx.strokeStyle = P.grat; ctx.lineWidth = 0.6; ctx.stroke();
      if (atlas) {
        const C = stRef.current.countries;
        // Each country is projected once a frame (into a Path2D) and then filled as often as it needs.
        const shapes = new Map(), pathTo = geoPath(proj);
        for (const c of atlas.countries) { const d = new Path2D(); pathTo.context(d)(c.feature); shapes.set(c.id, d); }
        for (const c of atlas.countries) {
          const sc = C[c.id], d = shapes.get(c.id);
          if (isOOB(c.id)) { ctx.fillStyle = 'rgba(16,12,8,0.92)'; ctx.fill(d); continue; }
          ctx.globalAlpha = sc?.bloc === 'N' || !sc ? 0.55 : 0.82; ctx.fillStyle = colourOf(sc); ctx.fill(d); ctx.globalAlpha = 1;
          const hit = struckAt.get(c.id);
          if (hit !== undefined && tt > hit) {
            const q = clamp01((tt - hit) / 2.5);
            ctx.fillStyle = `rgba(${Math.round(70 - 50 * q)},${Math.round(22 - 14 * q)},${Math.round(10 - 6 * q)},${0.25 + 0.6 * q})`; ctx.fill(d);
          }
          // A front still being fought: hatched in the attacker's colour.
          if (sc?.front && C[sc.front.by] && !sc.occupiedBy) {
            ctx.save(); ctx.clip(d);
            const b = path.bounds(c.feature), hgt = b[1][1] - b[0][1];
            ctx.strokeStyle = P[C[sc.front.by].bloc] || P.N; ctx.globalAlpha = 0.7; ctx.lineWidth = 1.4;
            ctx.beginPath(); for (let x = b[0][0] - hgt; x < b[1][0]; x += 6) { ctx.moveTo(x, b[1][1]); ctx.lineTo(x + hgt, b[0][1]); } ctx.stroke();
            ctx.restore(); ctx.globalAlpha = 1;
          }
        }
        ctx.beginPath(); path(atlas.borders); ctx.strokeStyle = P.border; ctx.lineWidth = 0.5; ctx.stroke();
        // The winter: frost creeps over every country on Earth, struck or not.
        if (winter) {
          const fr = clamp01((tt - SMOKE_AT - 1) / 7);
          if (fr) { ctx.fillStyle = `rgba(196,212,228,${0.42 * fr})`; for (const d of shapes.values()) ctx.fill(d); }
        }
      }
      // Smoke: soot spreading out from every country hit.
      if (tt > SMOKE_AT - 3) {
        ctx.fillStyle = 'rgba(18,14,12,0.22)';
        targets.slice(0, 48).forEach((s, i) => {
          const u = clamp01((tt - Math.max(s.land, SMOKE_AT - 3)) / 9); if (!u) return;
          ctx.beginPath();
          for (let j = 0; j < 2; j++) path(circle.center([s.to[0] + (tt - s.land) * (2.2 + j) + j * 4, s.to[1] + (hash(i * 7 + j) - 0.5) * 8]).radius(2 + easeOut(u) * (16 + j * 8) + hash(i + j) * 4)());
          ctx.fill();
        });
      }
      if (dark) { ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = `rgba(6,5,4,${(winter ? 0.5 : 0.62) * dark})`; ctx.fill(); }
      // Embers, one per country hit, glowing through the smoke.
      for (const s of targets) {
        if (tt < struckAt.get(s.t)) continue;
        const p = lift(s.to, 0); if (!p) continue;
        const age = tt - struckAt.get(s.t), glow = Math.max(0.25, 1 - age / 10) * (0.8 + 0.2 * Math.sin(tt * 5 + s.i));
        const r = (3 + 3 * glow) * 2.4;
        const eg = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r);
        eg.addColorStop(0, `rgba(255,${Math.round(150 + 80 * glow)},90,${glow})`); eg.addColorStop(1, 'rgba(255,90,30,0)');
        ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, TAU); ctx.fill();
      }
      // Missiles: lofted arcs with a fading trail and a bright head. Two strokes per missile, not one per segment.
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const heads = [];
      for (const s of tracks) {
        if (tt < s.launch) continue;
        const u = clamp01((tt - s.launch) / (s.land - s.launch)), v = s.p0 + (1 - s.p0) * (s.p0 > 0 ? easeOut(u) * 0.3 + u * 0.7 : u);
        const fade = tt < s.land ? 1 : Math.max(0, 1 - (tt - s.land) / 2.5);
        if (!fade) continue;
        const head = Math.max(1, Math.round(v * 24)), tail = Math.max(0, head - 9);
        const seg = (a, b) => { let on = false; ctx.beginPath(); for (let i = a; i <= b; i++) { const q = Math.min(v, i / 24), at = lift(s.interp(q), Math.sin(Math.PI * q) * s.loft); if (!at) { on = false; continue; } on ? ctx.lineTo(at[0], at[1]) : ctx.moveTo(at[0], at[1]); on = true; } ctx.stroke(); };
        ctx.strokeStyle = `rgba(${P.trail},${0.22 * fade})`; ctx.lineWidth = 1; seg(0, tail);
        ctx.strokeStyle = `rgba(${P.trail},${0.85 * fade})`; ctx.lineWidth = 2; seg(tail, head + 1);
        if (tt < s.land) {
          const hp = lift(s.interp(v), Math.sin(Math.PI * v) * s.loft);
          if (hp) heads.push(hp);
          if (s.s && labelled.get(s.s) === s.i && u < 0.6) {
            const lp = lift(s.f, 0);
            if (lp) {
              ctx.font = `600 ${theme === 'cold' ? 11 : 12}px ${theme === 'cold' ? "'IBM Plex Mono', monospace" : "'IBM Plex Sans Condensed', sans-serif"}`;
              ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.globalAlpha = Math.min(1, (0.6 - u) * 4);
              ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillText(s.s.toUpperCase(), lp[0] + 9, lp[1] + 1);
              ctx.fillStyle = theme === 'cold' ? '#ffe2b0' : '#cfe3ff'; ctx.fillText(s.s.toUpperCase(), lp[0] + 8, lp[1]); ctx.globalAlpha = 1;
            }
          }
          if (s.p0 === 0 && u < 0.12) { const lp = lift(s.f, 0); if (lp) { ctx.strokeStyle = `rgba(255,220,170,${1 - u / 0.12})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(lp[0], lp[1], 3 + u * 120, 0, TAU); ctx.stroke(); } }
        }
      }
      // Warhead heads: a soft glow and a white core, batched.
      ctx.fillStyle = 'rgba(255,190,110,0.35)'; ctx.beginPath(); for (const [x, y] of heads) { ctx.moveTo(x + 7, y); ctx.arc(x, y, 7, 0, TAU); } ctx.fill();
      ctx.fillStyle = '#fff8ea'; ctx.beginPath(); for (const [x, y] of heads) { ctx.moveTo(x + 2.4, y); ctx.arc(x, y, 2.4, 0, TAU); } ctx.fill();
      // Detonations: a flash of light and a ring racing out across the surface.
      let landing = 0;
      for (const s of tracks) {
        const age = tt - s.land; if (age < 0 || age > 3) continue;
        if (age < 0.25) landing++;
        const p = lift(s.to, 0);
        if (p && age < 1.2) {
          const f = 0.7 * (1 - age / 1.2), fr = R * (0.02 + 0.05 * easeOut(age / 0.5));
          const fg = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], fr);
          fg.addColorStop(0, `rgba(255,255,245,${f})`); fg.addColorStop(0.5, `rgba(255,214,150,${0.6 * f})`); fg.addColorStop(1, 'rgba(255,170,90,0)');
          ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(p[0], p[1], fr, 0, TAU); ctx.fill();
        }
        if (s.i % 3 === 0) { ctx.beginPath(); path(circle.center(s.to).radius(0.5 + easeOut(age / 3) * 9)()); ctx.strokeStyle = `rgba(255,236,200,${0.85 * (1 - age / 3)})`; ctx.lineWidth = 1.4; ctx.stroke(); }
      }
      ctx.beginPath(); path({ type: 'Sphere' }); ctx.strokeStyle = P.rim; ctx.globalAlpha = (1 - dark * 0.6) * clamp01(k * 2); ctx.lineWidth = 1.2; ctx.stroke(); ctx.globalAlpha = 1;
      // The whole frame flares as the salvos arrive.
      const first = tracks[0];
      if (first && tt > first.land && tt - first.land < 1.2) { ctx.fillStyle = `rgba(255,250,236,${0.25 * (1 - (tt - first.land) / 1.2)})`; ctx.fillRect(0, 0, w, h); }
      if (landing) { ctx.fillStyle = `rgba(255,236,200,${Math.min(0.05, landing * 0.01)})`; ctx.fillRect(0, 0, w, h); }
      // Ash falling over everything once the clock is up.
      if (tt > CLOCK_AT) {
        const a = clamp01((tt - CLOCK_AT) / 4);
        ctx.fillStyle = `rgba(205,200,195,${a * 0.35})`; ctx.beginPath();
        for (let i = 0; i < 120; i++) {
          const x = (hash(i) * w + Math.sin(tt * 0.5 + i) * 14) % w, y = ((hash(i + 99) + tt * (0.012 + hash(i + 7) * 0.03)) % 1) * h, r = 0.6 + hash(i + 5) * 1.6;
          ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU);
        }
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);
  return html`<canvas class=${cls('nf-globe', t > CLOCK_AT && 'dim')} ref=${ref}></canvas>`;
}

// The Doomsday Clock reaches midnight.
function Midnight({ t, theme }) {
  const k = ease(clamp01((t - CLOCK_AT - 0.3) / 2.4));
  const minute = 57 + 3 * k;
  const mAng = minute * 6, hAng = (11 + minute / 60) * 30;
  const strike = t - CLOCK_AT - 2.8;
  const ticks = Array.from({ length: 60 }, (_, i) => i);
  return html`<div class=${cls('ci-clock nf-clock', strike > 0 && 'struck')}>
    <svg viewBox="-110 -110 220 220" class="ci-clock-svg">
      <circle r="100" class="face" />
      ${ticks.map(i => html`<line key=${i} x1="0" y1=${i % 5 ? -92 : -86} x2="0" y2="-97" transform=${`rotate(${i * 6})`} class=${i % 5 ? 'tick' : 'tick big'} />`)}
      ${minute < 59.95 && html`<path d=${`M0 0 L0 -100 A100 100 0 0 0 ${(-Math.sin((60 - minute) * 6 * RAD) * 100).toFixed(2)} ${(-Math.cos((60 - minute) * 6 * RAD) * 100).toFixed(2)} Z`} class="danger" />`}
      <line x1="0" y1="10" x2="0" y2="-55" transform=${`rotate(${hAng})`} class="hand hour" />
      <line x1="0" y1="14" x2="0" y2="-84" transform=${`rotate(${mAng})`} class="hand min" />
      <circle r="4" class="pin" />
    </svg>
    <div class="ci-clock-text">
      <div class="ci-clock-kicker">The Doomsday Clock</div>
      <div class="ci-clock-big">${strike > 0 ? 'Midnight' : ' '}</div>
      <div class="ci-clock-sub">${strike > 0.8 ? (theme === 'cold' ? 'For forty years the hands stood a few minutes short. Tonight they did not stop.' : 'The hands did not stop.') : ' '}</div>
    </div>
    ${strike > 0 && strike < 1 && html`<div class="nf-white" style=${{ opacity: 1 - strike }}></div>`}
  </div>`;
}

function Title({ t, state, e, ex, cold }) {
  const a = t - TITLE_AT;
  const winter = (ex.strikes || 1) > 1;
  const temp = Math.round(14 - Math.min(1, Math.max(0, a - 6) / 12) * (winter ? 34 : 4)); // degrees C, falling to -20 in a winter
  const struck = (ex.struckIds || []).length || (ex.struck || []).length;
  // The dead: the blasts first, then the winter takes everyone else.
  const blast = Math.max(1, ex.deadMillions || 1), world = Math.max(blast, ex.worldMillions || blast);
  const w = winter ? easeOut(clamp01((a - 7) / 7)) : 0;
  const dead = Math.round(blast + (world - blast) * w);
  return html`<div class="nf-title">
    <div class="nf-date">${fmt.date(state.meta.clock, 'en')}</div>
    <div class="nf-sign">☢</div>
    <h1 class="nf-name">${e.title}</h1>
    <div class="nf-rule"></div>
    ${a > 1.6 && html`<p class="nf-line">${e.line}</p>`}
    ${a > 5 && html`<div class="nf-facts">
      <div><b>${(ex.strikes || 1).toLocaleString('en-US')}</b><span>${(ex.strikes || 1) === 1 ? 'warhead' : 'warheads'}</span></div>
      <div><b>${struck || 1}</b><span>${struck === 1 ? 'nation struck' : 'nations struck'}</span></div>
      <div><b>${temp > 0 ? '+' : ''}${temp}°C</b><span>average world temperature</span></div>
      <div class=${cls(w >= 1 && 'nf-all')}><b>${w >= 1 ? 'Everyone' : `${dead.toLocaleString('en-US')}M`}</b><span>${w >= 1 ? `all ${world.toLocaleString('en-US')} million` : w > 0 ? 'dead, as the winter spreads' : 'dead in the blasts'}</span></div>
    </div>`}
    ${a > 9 && html`<div class="nf-foot">${winter ? 'Smoke blots out the sun for years. The winter reaches every country on Earth, and the harvests never come back.' : 'The world has crossed a line it swore it never would.'}</div>`}
    ${a > 14.5 && html`<div class="nf-last">${winter ? (cold ? 'No one survives the winter. The reel ends here.' : 'No one survives the winter. There is no winner.') : 'There is no winner.'}</div>`}
  </div>`;
}
