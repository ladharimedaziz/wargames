// "The Unthinkable": the nuclear ending, filmed on a turning 3D globe built from the map as it stands (each country in
// its camp's colour, occupied lands in their occupier's, fronts hatched). Every warhead of the exchange flies its
// real track between the countries that fired and the countries hit; smoke spreads, the Doomsday Clock reaches
// midnight, then the title. The Cold War committee gets it as a newsreel matching its intro (teletype, film grain,
// sepia); other committees get the same film as a cold, clean command-centre feed.
// Abstract by design: no people, no scenes of harm, only light, dark and numbers.
import { html, useEffect, useRef, useState, cls, fmt } from '../lib.js';
import { geoOrthographic, geoPath, geoGraticule10, geoInterpolate, geoRotation, geoCircle, geoDistance } from 'd3-geo';
import { loadAtlas } from '../map/atlas.js';
import { isOOB } from '/shared/engine/core.js';
import { stateSplit } from '/shared/data/german-split.js';

const clamp01 = x => Math.max(0, Math.min(1, x));
const ease = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOut = x => 1 - Math.pow(1 - clamp01(x), 3);
const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const TAU = Math.PI * 2, RAD = Math.PI / 180;

// Seconds into the film.
const GLOBE_AT = 4.6, FIRST_AT = 5.6, ANSWER_AT = 6.2, SALVO_SPAN = 2.2, SMOKE_AT = 13.5, CLOCK_AT = 22, TITLE_AT = 27.5;
export const UNTHINKABLE_MS = 48000;

const THEMES = {
  cold: { A: '#6a9ccf', B: '#d9503f', C: '#d9a441', N: '#7a6a50', land: 'rgba(120,96,60,0.55)', sea0: '#2a1e10', sea1: '#0a0704', rim: 'rgba(255,182,77,0.55)', grat: 'rgba(255,200,120,0.08)', border: 'rgba(243,230,200,0.25)', halo: '255,170,90', trail: [255, 214, 150] },
  modern: { A: '#4f8fe0', B: '#e0473c', C: '#f5a524', N: '#4b5563', land: 'rgba(70,90,110,0.6)', sea0: '#0c2238', sea1: '#02060c', rim: 'rgba(120,190,255,0.5)', grat: 'rgba(140,200,255,0.07)', border: 'rgba(200,225,255,0.22)', halo: '90,160,255', trail: [255, 200, 140] },
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

// When each warhead launches and lands. Launch on warning: the moment the first missile is detected, every arsenal on
// both sides goes up within a couple of seconds.
export function schedule(tracks) {
  return tracks.map((tr, i) => {
    const km = geoDistance(tr.f, tr.to) * 6371;
    const launch = i === 0 ? FIRST_AT : ANSWER_AT + hash(i * 13.7) * SALVO_SPAN;
    const flight = 2.6 + Math.min(1.8, km / 6500);
    return { ...tr, launch, land: launch + flight, i, interp: geoInterpolate(tr.f, tr.to), loft: 0.05 + Math.min(0.22, km / 40000) };
  });
}

export function Unthinkable({ state, now }) {
  const e = state.display.ending, ex = e.exchange || {};
  const cold = state.settings.era === 'cold85';
  const theme = cold ? 'cold' : 'modern';
  const t = useFilmClock(Math.max(0, (now - state.display.endingAt) / 1000));
  const tracks = useRef(null);
  if (!tracks.current) tracks.current = schedule((ex.tracks || []).filter(tr => tr.f && tr.to));
  const tr = tracks.current;
  const lastLand = tr.length ? Math.max(...tr.map(s => s.land)) : FIRST_AT + 3;
  const N = id => state.countries[id]?.name || id;
  // Only some warheads are drawn; the counter shows the whole arsenal going up.
  const total = Math.max(ex.strikes || tr.length, tr.length), per = tr.length > 1 ? (total - 1) / (tr.length - 1) : 1;
  const up = tr.filter(s => t >= s.launch).length, launched = up ? Math.round(1 + (up - 1) * per) : 0;
  const landed = tr.filter(s => t >= s.land);
  const struckNow = new Set(landed.map(s => s.t));
  const firingNow = [...new Set(tr.filter(s => t >= s.launch).map(s => s.o))];
  const scene = t < GLOBE_AT ? 'wire' : t < CLOCK_AT ? 'globe' : t < TITLE_AT ? 'clock' : 'title';

  const nations = (ex.struckIds || []).length || struckNow.size;
  const caption = t < ANSWER_AT ? `${N(ex.first)} fires on ${N(ex.hit)}${tr[0]?.s ? `, from ${tr[0].s.replace(/^(Missile|Mobile)\b/, m => m.toLowerCase())}` : ''}.`
    : t < ANSWER_AT + 2.6 ? (tr.length > 1 ? 'Detected. Every nuclear power on both sides launches everything it has.' : 'One warhead. One flash.')
    : t < ANSWER_AT + 5.6 ? (tr.length > 1 ? 'Every silo. Every submarine. Every bomber.' : 'The world holds its breath.')
    : t < SMOKE_AT + 2.5 ? `${total.toLocaleString('en-US')} ${total === 1 ? 'warhead' : 'warheads'}. ${nations} ${nations === 1 ? 'nation' : 'nations'}. Under an hour.`
    : 'Then the smoke rises, and keeps rising.';

  return html`<div class=${cls('nuke-film', `nf-${theme}`, cold && 'ci')}>
    ${scene === 'wire' && (cold ? html`<${Wire} t=${t} state=${state} ex=${ex} N=${N} />` : html`<${Warning} t=${t} ex=${ex} N=${N} />`)}
    ${t >= GLOBE_AT - 0.4 && html`<${Globe} t=${t} state=${state} theme=${theme} tracks=${tr} lastLand=${lastLand} />`}
    ${scene === 'globe' && html`<div class="nf-hud">
      <div class="nf-count"><b>${launched.toLocaleString('en-US')}</b><span>${launched === 1 ? 'warhead launched' : 'warheads launched'}</span></div>
      <div class="nf-count"><b>${struckNow.size}</b><span>${struckNow.size === 1 ? 'nation struck' : 'nations struck'}</span></div>
      <div class="nf-firing">${firingNow.map(id => html`<div key=${id} class="nf-fire" style=${{ '--c': THEMES[theme][state.countries[id]?.bloc] || THEMES[theme].N }}><i></i>${N(id)}</div>`)}</div>
    </div>`}
    ${scene === 'globe' && html`<div class="nf-caption" key=${caption}>${caption}</div>`}
    ${scene === 'clock' && html`<${Midnight} t=${t} theme=${theme} />`}
    ${scene === 'title' && html`<${Title} t=${t} state=${state} e=${e} ex=${ex} cold=${cold} />`}
    ${cold && html`<div class="ci-grain"></div><div class="ci-vignette"></div><div class="ci-scratches"><i></i><i></i><i></i></div><div class="ci-bars"></div>`}
    ${!cold && html`<div class="nf-scan"></div>`}
  </div>`;
}

function Typed({ t, at, text, cps = 30 }) {
  if (t < at) return null;
  const n = Math.min(text.length, Math.floor((t - at) * cps));
  return html`<span>${text.slice(0, n)}${n < text.length && html`<i class="ci-caret">█</i>`}</span>`;
}

// Cold War: the same wire service as the intro, now carrying the flash nobody wanted to send.
function Wire({ t, state, ex, N }) {
  const date = fmt.date(state.meta.clock, 'en').toUpperCase();
  const lines = [
    [0.2, 'FLASH // FLASH // FLASH', 'hot'],
    [1.0, `DTG ${date}`],
    [1.5, `LAUNCH DETECTED: ${String(N(ex.first) || 'UNKNOWN').toUpperCase()}`],
    ...(ex.tracks?.[0]?.s ? [[2.1, `ORIGIN: ${ex.tracks[0].s.toUpperCase()}`]] : []),
    [ex.tracks?.[0]?.s ? 2.9 : 2.3, `IMPACT PREDICTED: ${String(N(ex.hit) || 'UNKNOWN').toUpperCase()}`],
    ...(ex.strikes > 1 ? [[3.3, 'ALL FORCES: LAUNCH ON WARNING']] : []),
    [3.9, 'THIS IS NOT AN EXERCISE.', 'big'],
  ];
  return html`<div class="ci-wire nf-wire">
    <div class="ci-paper">
      <div class="ci-paper-head"><span>WORLD ENGINE WIRE SERVICE</span><span>NO. 0000-00</span></div>
      ${lines.map(([at, text, c]) => t > at && html`<div class=${cls('ci-wline', c)} key=${at}><${Typed} t=${t} at=${at} text=${text} /></div>`)}
    </div>
    ${t > 3.0 && html`<div class="ci-stamp">DEFCON 1</div>`}
  </div>`;
}

// Other committees: a command-centre launch warning.
function Warning({ t, ex, N }) {
  return html`<div class="nf-warn">
    <div class="nf-w1">LAUNCH DETECTED</div>
    <div class="nf-w2">${N(ex.first) || 'Unknown'} <span>→</span> ${N(ex.hit) || 'Unknown'}</div>
    ${ex.tracks?.[0]?.s && t > 0.8 && html`<div class="nf-w3">Origin: ${ex.tracks[0].s}</div>`}
    ${t > 1.6 && html`<div class="nf-w3">${ex.strikes > 1 ? `${ex.strikes} warheads expected · every arsenal on both sides` : 'One warhead in flight'}</div>`}
  </div>`;
}

// The globe, drawn from the map as it stands right now.
function Globe({ t, state, theme, tracks, lastLand }) {
  const ref = useRef();
  const tRef = useRef(t); tRef.current = t;
  const stRef = useRef(state); stRef.current = state;
  useEffect(() => {
    const canvas = ref.current, ctx = canvas.getContext('2d');
    const P = THEMES[theme];
    let raf, atlas, w, h, dpr, rot;
    const proj = geoOrthographic().clipAngle(90).precision(0.6);
    const path = geoPath(proj, ctx);
    const grat = geoGraticule10();
    const size = () => { const r = canvas.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); w = r.width; h = r.height; canvas.width = w * dpr; canvas.height = h * dpr; };
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
    const smokeOf = [...new Map(tracks.map(s => [s.t, s])).values()];
    const winter = tracks.length > 1;
    // Each launch site is named once, on the first warhead that leaves it (the busiest frames name only a few).
    const labelled = new Map();
    for (const s of tracks) if (s.s && !labelled.has(s.s) && labelled.size < 6) labelled.set(s.s, s.i);
    // A point on the sphere, lifted `alt` (fraction of the radius) above it, on screen. Null when behind the globe.
    const lift = (lonlat, alt) => {
      const r = rot(lonlat);
      const l = r[0] * RAD, p = r[1] * RAD, x = Math.cos(p) * Math.sin(l), y = Math.sin(p), z = Math.cos(p) * Math.cos(l);
      const k = proj.scale() * (1 + alt), [tx, ty] = proj.translate();
      const behind = z < 0 && (1 + alt) * (1 + alt) * (x * x + y * y) < 1;
      return behind ? null : [tx + k * x, ty - k * y];
    };
    const colourOf = (c, P) => {
      if (!c) return P.land;
      const occ = c.occupiedBy && stRef.current.countries[c.occupiedBy];
      return P[(occ || c).bloc] || P.N;
    };
    const draw = () => {
      const tt = tRef.current;
      const k = ease(clamp01((tt - GLOBE_AT) / 16));
      const zoom = 0.4 + 0.07 * k - 0.05 * clamp01((tt - TITLE_AT) / 4);
      proj.translate([w / 2, h / 2 + (tt > TITLE_AT ? h * 0.1 * easeOut((tt - TITLE_AT) / 3) : 0)]).scale(Math.min(w, h) * zoom).rotate([-(aimLon - 38 + 38 * k) - (tt - GLOBE_AT) * 0.5, -(aimLat - 8 + 8 * k)]);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const R = proj.scale(), [ox, oy] = proj.translate();
      rot = geoRotation(proj.rotate());
      // Night falls on the world as the smoke spreads.
      const dark = clamp01((tt - SMOKE_AT) / 9);
      // Atmosphere halo, dimming into the smoke.
      const halo = ctx.createRadialGradient(ox, oy, R * 0.96, ox, oy, R * 1.22);
      halo.addColorStop(0, `rgba(${P.halo},${0.35 * (1 - dark * 0.8)})`); halo.addColorStop(1, `rgba(${P.halo},0)`);
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(ox, oy, R * 1.22, 0, TAU); ctx.fill();
      const g = ctx.createRadialGradient(ox - R * 0.35, oy - R * 0.4, R * 0.1, ox, oy, R * 1.05);
      g.addColorStop(0, P.sea0); g.addColorStop(1, P.sea1);
      ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = g; ctx.fill();
      ctx.beginPath(); path(grat); ctx.strokeStyle = P.grat; ctx.lineWidth = 0.6; ctx.stroke();
      if (atlas) {
        const C = stRef.current.countries;
        // Countries in their camp's colours as they stand now; scorched once the first warhead lands on them.
        for (const c of atlas.countries) {
          const sc = C[c.id];
          ctx.beginPath(); path(c.feature);
          if (isOOB(c.id)) { ctx.fillStyle = 'rgba(16,12,8,0.92)'; ctx.fill(); continue; }
          ctx.fillStyle = sc && sc.control !== 'inactive' ? colourOf(sc, P) : P.land;
          ctx.globalAlpha = sc?.bloc === 'N' || !sc ? 0.55 : 0.82; ctx.fill(); ctx.globalAlpha = 1;
          const hit = struckAt.get(c.id);
          if (hit !== undefined && tt > hit) {
            const s = clamp01((tt - hit) / 2.5);
            ctx.fillStyle = `rgba(${Math.round(70 - 50 * s)},${Math.round(22 - 14 * s)},${Math.round(10 - 6 * s)},${0.25 + 0.6 * s})`; ctx.fill();
          }
          // A front still being fought: hatched in the attacker's colour.
          if (sc?.front && C[sc.front.by] && !sc.occupiedBy) {
            ctx.save(); ctx.clip();
            const b = path.bounds(c.feature);
            ctx.strokeStyle = P[C[sc.front.by].bloc] || P.N; ctx.globalAlpha = 0.7; ctx.lineWidth = 1.4;
            ctx.beginPath(); for (let x = b[0][0] - (b[1][1] - b[0][1]); x < b[1][0]; x += 6) { ctx.moveTo(x, b[1][1]); ctx.lineTo(x + (b[1][1] - b[0][1]), b[0][1]); } ctx.stroke();
            ctx.restore(); ctx.globalAlpha = 1;
          }
        }
        ctx.beginPath(); path(atlas.borders); ctx.strokeStyle = P.border; ctx.lineWidth = 0.5; ctx.stroke();
        // The winter: frost creeps over every country on Earth, struck or not.
        if (winter) {
          const fr = clamp01((tt - SMOKE_AT - 2) / 8);
          if (fr) { ctx.beginPath(); for (const c of atlas.countries) path(c.feature); ctx.fillStyle = `rgba(196,212,228,${0.42 * fr})`; ctx.fill(); }
        }
      }
      // Smoke: soot spreading out from every city hit, then the whole sky darkening.
      if (tt > SMOKE_AT - 2) {
        smokeOf.forEach((s, i) => {
          const u = clamp01((tt - Math.max(s.land, SMOKE_AT - 2)) / 10);
          if (!u) return;
          for (let j = 0; j < 3; j++) {
            const drift = [s.to[0] + (tt - s.land) * (2.2 + j) + j * 4, s.to[1] + (hash(i * 7 + j) - 0.5) * 8];
            ctx.beginPath(); path(geoCircle().center(drift).radius(2 + easeOut(u) * (16 + j * 7) + hash(i + j) * 4)());
            ctx.fillStyle = `rgba(18,14,12,${0.16 + 0.08 * j})`; ctx.fill();
          }
        });
      }
      if (dark) { ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = `rgba(6,5,4,${(winter ? 0.5 : 0.62) * dark})`; ctx.fill(); }
      // Embers where warheads landed, glowing through the smoke.
      for (const s of tracks) {
        if (tt < s.land) continue;
        const p = lift(s.to, 0); if (!p) continue;
        const age = tt - s.land, glow = Math.max(0.25, 1 - age / 10) * (0.8 + 0.2 * Math.sin(tt * 5 + s.i));
        const r = 3 + 3 * glow;
        const eg = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r * 2.4);
        eg.addColorStop(0, `rgba(255,${150 + 80 * glow},90,${glow})`); eg.addColorStop(1, 'rgba(255,90,30,0)');
        ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(p[0], p[1], r * 2.4, 0, TAU); ctx.fill();
      }
      // Missiles: lofted arcs that leave the atmosphere, with a fading trail and a bright head.
      ctx.lineCap = 'round';
      const [tr0, tr1, tr2] = P.trail;
      for (const s of tracks) {
        if (tt < s.launch) continue;
        const v = clamp01((tt - s.launch) / (s.land - s.launch)), fade = tt < s.land ? 1 : Math.max(0, 1 - (tt - s.land) / 3);
        if (!fade) continue;
        const head = Math.max(1, Math.round(v * 48));
        let prev = null;
        for (let i = 0; i <= head; i++) {
          const q = i / 48, at = lift(s.interp(q), Math.sin(Math.PI * q) * s.loft);
          if (at && prev) {
            const age = (head - i) / 48;
            ctx.strokeStyle = `rgba(${tr0},${tr1},${tr2},${fade * Math.max(0.08, 0.9 - age * 1.6)})`; ctx.lineWidth = Math.max(0.6, 2.4 - age * 3);
            ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(at[0], at[1]); ctx.stroke();
          }
          prev = at;
        }
        if (tt < s.land) {
          const hp = lift(s.interp(v), Math.sin(Math.PI * v) * s.loft);
          if (hp) {
            const hg = ctx.createRadialGradient(hp[0], hp[1], 0, hp[0], hp[1], 10);
            hg.addColorStop(0, 'rgba(255,255,255,1)'); hg.addColorStop(0.4, 'rgba(255,200,120,0.8)'); hg.addColorStop(1, 'rgba(255,140,60,0)');
            ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(hp[0], hp[1], 10, 0, TAU); ctx.fill();
          }
          if (s.s && labelled.get(s.s) === s.i && v < 0.7) {
            const lp = lift(s.f, 0);
            if (lp) {
              ctx.font = `600 ${theme === 'cold' ? 11 : 12}px ${theme === 'cold' ? "'IBM Plex Mono', monospace" : "'IBM Plex Sans Condensed', sans-serif"}`;
              ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.globalAlpha = Math.min(1, (0.7 - v) * 4);
              ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillText(s.s.toUpperCase(), lp[0] + 9, lp[1] + 1);
              ctx.fillStyle = theme === 'cold' ? '#ffe2b0' : '#cfe3ff'; ctx.fillText(s.s.toUpperCase(), lp[0] + 8, lp[1]); ctx.globalAlpha = 1;
            }
          }
          if (v < 0.12) { const lp = lift(s.f, 0); if (lp) { ctx.strokeStyle = `rgba(255,220,170,${1 - v / 0.12})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(lp[0], lp[1], 3 + v * 120, 0, TAU); ctx.stroke(); } }
        }
      }
      // Detonations: a flash of light and a ring racing out across the surface.
      for (const s of tracks) {
        const age = tt - s.land; if (age < 0 || age > 3) continue;
        const p = lift(s.to, 0);
        if (p) {
          const f = Math.max(0, 1 - age / 1.2), fr = R * (0.03 + 0.09 * easeOut(age / 0.5));
          const fg = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], fr);
          fg.addColorStop(0, `rgba(255,255,245,${f})`); fg.addColorStop(0.5, `rgba(255,214,150,${0.6 * f})`); fg.addColorStop(1, 'rgba(255,170,90,0)');
          ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(p[0], p[1], fr, 0, TAU); ctx.fill();
        }
        ctx.beginPath(); path(geoCircle().center(s.to).radius(0.5 + easeOut(age / 3) * 9)());
        ctx.strokeStyle = `rgba(255,236,200,${0.85 * (1 - age / 3)})`; ctx.lineWidth = 1.6; ctx.stroke();
      }
      ctx.beginPath(); path({ type: 'Sphere' }); ctx.strokeStyle = P.rim; ctx.globalAlpha = 1 - dark * 0.6; ctx.lineWidth = 1.2; ctx.stroke(); ctx.globalAlpha = 1;
      // The whole frame flares white for an instant as the first warhead lands, and as the salvos arrive.
      const first = tracks[0];
      if (first) {
        const a = tt - first.land;
        if (a > 0 && a < 1.2) { ctx.fillStyle = `rgba(255,250,236,${0.7 * (1 - a / 1.2)})`; ctx.fillRect(0, 0, w, h); }
      }
      const landing = tracks.filter(s => tt >= s.land && tt - s.land < 0.25).length;
      if (landing) { ctx.fillStyle = `rgba(255,236,200,${Math.min(0.22, landing * 0.04)})`; ctx.fillRect(0, 0, w, h); }
      // Ash falling over everything once the title is up.
      if (tt > CLOCK_AT) {
        const a = clamp01((tt - CLOCK_AT) / 4);
        for (let i = 0; i < 120; i++) {
          const x = (hash(i) * w + Math.sin(tt * 0.5 + i) * 14) % w, y = ((hash(i + 99) + tt * (0.012 + hash(i + 7) * 0.03)) % 1) * h;
          ctx.fillStyle = `rgba(205,200,195,${a * (0.18 + 0.3 * hash(i + 3))})`; ctx.beginPath(); ctx.arc(x, y, 0.6 + hash(i + 5) * 1.6, 0, TAU); ctx.fill();
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);
  return html`<canvas class=${cls('nf-globe', t > CLOCK_AT && 'dim')} ref=${ref} data-last-land=${lastLand}></canvas>`;
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
