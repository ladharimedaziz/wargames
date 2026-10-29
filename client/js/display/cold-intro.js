// The Cold War committee's own opening: a 30-second newsreel from March 1985. Film leader, a teletype dispatch,
// the world dividing into its camps on a turning globe, the Doomsday Clock, then the committee's title.
import { html, useState, useEffect, useRef, cls, fmt } from '../lib.js';
import { geoOrthographic, geoPath, geoGraticule10 } from 'd3-geo';
import { loadAtlas } from '../map/atlas.js';
import { isOOB } from '/shared/engine/core.js';
import { stateSplit } from '/shared/data/german-split.js';

export const COLD_INTRO_MS = 30500;
export const isColdIntro = state => state.settings.era === 'cold85';

const BLOC_COLORS = { A: '#6a9ccf', B: '#d9503f', C: '#d9a441' };
// When each camp floods its colour onto the globe (seconds into the intro).
const BLOC_AT = { A: 11.2, B: 13.4, C: 15.6 };

// A smooth local clock, started from the elapsed time the stage clock reported on mount.
function useIntroClock(elapsed) {
  const base = useRef(performance.now() - elapsed);
  const [t, setT] = useState(elapsed / 1000);
  useEffect(() => {
    let raf;
    const tick = () => { setT((performance.now() - base.current) / 1000); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return t;
}

const clamp01 = x => Math.max(0, Math.min(1, x));
const ease = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

// Types text out at a steady rate from `at` seconds.
function Typed({ t, at, text, cps = 26 }) {
  if (t < at) return null;
  const n = Math.min(text.length, Math.floor((t - at) * cps));
  return html`<span>${text.slice(0, n)}${n < text.length && html`<i class="ci-caret">█</i>`}</span>`;
}

export function ColdWarIntro({ state, elapsed }) {
  const t = useIntroClock(elapsed);
  const scene = t < 3.6 ? 'leader' : t < 10 ? 'wire' : t < 19.4 ? 'globe' : t < 24.4 ? 'clock' : 'title';
  return html`<div class=${cls('ci', t > 28 && 'fade')}>
    <div class="ci-grain"></div>
    ${scene === 'leader' && html`<${Leader} t=${t} />`}
    ${scene === 'wire' && html`<${Wire} t=${t} state=${state} />`}
    ${(scene === 'globe' || (t > 18.6 && t < 19.4)) && html`<${Divided} t=${t} state=${state} />`}
    ${scene === 'clock' && html`<${DoomsdayClock} t=${t} state=${state} />`}
    ${scene === 'title' && html`<${Title} t=${t} state=${state} />`}
    <div class="ci-vignette"></div>
    <div class="ci-scratches"><i></i><i></i><i></i></div>
    <div class="ci-bars"></div>
  </div>`;
}

// 0 – 3.6 s: a film-leader countdown.
function Leader({ t }) {
  const n = 3 - Math.floor(t / 1.2);
  const frac = (t % 1.2) / 1.2;
  return html`<div class="ci-leader">
    <svg viewBox="-100 -100 200 200" class="ci-leader-svg">
      <defs><clipPath id="ci-leader-clip"><circle r="92" /></clipPath></defs>
      <path class="sweep" d=${sweepPath(frac)} clip-path="url(#ci-leader-clip)" />
      <circle r="92" class="ring" />
      <circle r="74" class="ring thin" />
      <line x1="-100" y1="0" x2="100" y2="0" class="cross" />
      <line x1="0" y1="-100" x2="0" y2="100" class="cross" />
      <text y="30" class="num">${Math.max(1, n)}</text>
    </svg>
    <div class="ci-leader-cap">WORLD ENGINE NEWSREEL · REEL 1985</div>
  </div>`;
}
function sweepPath(f) {
  if (f <= 0) return '';
  const a = f * Math.PI * 2 - Math.PI / 2, r = 140;
  const x = Math.cos(a) * r, y = Math.sin(a) * r;
  return `M0 0 L0 ${-r} A${r} ${r} 0 ${f > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`;
}

// 3.6 – 10 s: a teletype dispatch.
function Wire({ t, state }) {
  const date = fmt.date(state.meta.clock, 'en').toUpperCase();
  const lines = [
    [3.9, 'FLASH // PRIORITY // EYES ONLY', 'hot'],
    [5.0, `DTG ${date}`],
    [6.0, 'SUBJECT: THE STATE OF THE WORLD'],
    [7.2, 'TWO ALLIANCES. MORE THAN 60,000 NUCLEAR WARHEADS.'],
    [8.7, 'ONE PLANET.', 'big'],
  ];
  return html`<div class="ci-wire">
    <div class="ci-paper">
      <div class="ci-paper-head"><span>WORLD ENGINE WIRE SERVICE</span><span>NO. 0311-85</span></div>
      ${lines.map(([at, text, c]) => t > at && html`<div class=${cls('ci-wline', c)} key=${at}><${Typed} t=${t} at=${at} text=${text} /></div>`)}
    </div>
    ${t > 8.4 && html`<div class="ci-stamp">TOP SECRET</div>`}
  </div>`;
}

// 10 – 19.4 s: the globe turns from the Atlantic to the Iron Curtain as each camp takes its colour.
function Divided({ t, state }) {
  const ref = useRef();
  const tRef = useRef(t); tRef.current = t;
  const stRef = useRef(state); stRef.current = state;
  useEffect(() => {
    const canvas = ref.current, ctx = canvas.getContext('2d');
    let raf, atlas, w, h, dpr;
    const proj = geoOrthographic().clipAngle(90);
    const path = geoPath(proj, ctx);
    const grat = geoGraticule10();
    const size = () => { const r = canvas.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); w = r.width; h = r.height; canvas.width = w * dpr; canvas.height = h * dpr; };
    size();
    const ro = new ResizeObserver(size); ro.observe(canvas);
    loadAtlas(stateSplit(stRef.current)).then(a => { atlas = a.lo; });
    const draw = () => {
      const tt = tRef.current, k = ease(clamp01((tt - 10) / 9));
      proj.translate([w / 2, h / 2]).scale(Math.min(w, h) * (0.42 + 0.1 * k)).rotate([40 - 75 * k, -28 - 14 * k]);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const r = proj.scale();
      const g = ctx.createRadialGradient(w / 2 - r * 0.3, h / 2 - r * 0.3, r * 0.1, w / 2, h / 2, r * 1.05);
      g.addColorStop(0, '#2a1e10'); g.addColorStop(1, '#0a0704');
      ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = g; ctx.fill();
      ctx.beginPath(); path(grat); ctx.strokeStyle = 'rgba(255,200,120,0.08)'; ctx.lineWidth = 0.6; ctx.stroke();
      if (atlas) {
        const countries = stRef.current.countries;
        ctx.beginPath(); for (const c of atlas.countries) path(c.feature); ctx.fillStyle = 'rgba(120,96,60,0.35)'; ctx.fill();
        for (const bloc of ['A', 'B', 'C']) {
          const a = clamp01((tt - BLOC_AT[bloc]) / 1.4);
          if (!a) continue;
          ctx.beginPath();
          for (const c of atlas.countries) if (countries[c.id]?.bloc === bloc && !isOOB(c.id)) path(c.feature);
          ctx.globalAlpha = 0.85 * a; ctx.fillStyle = BLOC_COLORS[bloc]; ctx.fill(); ctx.globalAlpha = 1;
        }
        ctx.beginPath(); for (const c of atlas.countries) if (isOOB(c.id)) path(c.feature); ctx.fillStyle = 'rgba(20,16,10,0.9)'; ctx.fill();
        ctx.beginPath(); path(atlas.borders); ctx.strokeStyle = 'rgba(243,230,200,0.22)'; ctx.lineWidth = 0.5; ctx.stroke();
        // The Iron Curtain, drawn from the Baltic to the Adriatic once both camps are lit.
        const ic = clamp01((tt - 16.4) / 1.6);
        if (ic > 0) {
          const pts = IRON_CURTAIN.slice(0, Math.max(2, Math.ceil(IRON_CURTAIN.length * ic)));
          ctx.beginPath(); path({ type: 'LineString', coordinates: pts });
          ctx.strokeStyle = '#ffe2b0'; ctx.lineWidth = 2.4; ctx.setLineDash([6, 4]); ctx.shadowColor = '#ffb64d'; ctx.shadowBlur = 10; ctx.stroke();
          ctx.setLineDash([]); ctx.shadowBlur = 0;
        }
      }
      ctx.beginPath(); path({ type: 'Sphere' }); ctx.strokeStyle = 'rgba(255,182,77,0.55)'; ctx.lineWidth = 1.2; ctx.stroke();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);
  const all = Object.values(state.countries);
  const count = b => all.filter(c => c.bloc === b && c.control !== 'inactive' && !isOOB(c.id)).length;
  const players = b => all.filter(c => c.bloc === b && c.control === 'player').length;
  const legend = [['A', state.blocs?.A?.name || 'NATO and allies'], ['B', state.blocs?.B?.name || 'Warsaw Pact and allies'], ['C', state.blocs?.C?.name || 'Non-Aligned']];
  const caption = t < 11 ? 'The world, 1985.' : t < 13.4 ? 'In the West, an alliance of democracies.' : t < 15.6 ? 'In the East, the Soviet Union and its Pact.' : t < 16.4 ? 'Between them, those who refuse to choose.' : 'Across Europe, an Iron Curtain.';
  return html`<div class=${cls('ci-divided', t > 18.6 && 'out')}>
    <canvas class="ci-globe" ref=${ref}></canvas>
    <div class="ci-legend">
      ${legend.map(([b, name]) => t > BLOC_AT[b] && html`<div class="ci-leg" key=${b} style=${{ '--c': BLOC_COLORS[b] }}>
        <i></i><div><b>${name}</b><span>${count(b)} nations${players(b) ? ` · ${players(b)} at this table` : ''}</span></div>
      </div>`)}
    </div>
    <div class="ci-caption" key=${caption}>${caption}</div>
  </div>`;
}

// Roughly Churchill's line, Stettin to Trieste, then on around Austria and Yugoslavia's border with the Pact.
const IRON_CURTAIN = [[14.3, 54.2], [11.0, 54.0], [10.9, 53.3], [10.6, 52.4], [10.2, 51.6], [10.0, 50.7], [11.0, 50.4], [12.2, 50.3], [12.5, 49.9], [13.0, 49.3], [13.8, 48.8], [14.9, 48.9], [16.0, 48.7], [16.9, 48.6], [17.1, 48.0], [16.5, 47.5], [16.1, 46.9], [16.6, 46.4], [18.8, 45.9], [20.3, 46.2], [22.4, 44.6], [22.6, 44.2], [23.0, 43.1], [22.4, 42.3], [23.0, 41.4], [26.0, 41.7], [27.8, 42.0], [28.0, 42.0]];

// 19.4 – 24.4 s: the Doomsday Clock stands at three minutes to midnight (set by the Bulletin in January 1984).
function DoomsdayClock({ t, state }) {
  const k = ease(clamp01((t - 19.6) / 2.6));
  const minute = 45 + 12 * k; // sweeps from a quarter to, up to 11:57
  const mAng = minute * 6, hAng = (11 + minute / 60) * 30;
  const ticks = Array.from({ length: 60 }, (_, i) => i);
  return html`<div class="ci-clock">
    <svg viewBox="-110 -110 220 220" class="ci-clock-svg">
      <circle r="100" class="face" />
      ${ticks.map(i => html`<line key=${i} x1="0" y1=${i % 5 ? -92 : -86} x2="0" y2="-97" transform=${`rotate(${i * 6})`} class=${i % 5 ? 'tick' : 'tick big'} />`)}
      <path d="M0 0 L0 -100 A100 100 0 0 0 ${(-Math.sin((60 - minute) * 6 * Math.PI / 180) * 100).toFixed(2)} ${(-Math.cos((60 - minute) * 6 * Math.PI / 180) * 100).toFixed(2)} Z" class="danger" />
      <line x1="0" y1="10" x2="0" y2="-55" transform=${`rotate(${hAng})`} class="hand hour" />
      <line x1="0" y1="14" x2="0" y2="-84" transform=${`rotate(${mAng})`} class="hand min" />
      <circle r="4" class="pin" />
    </svg>
    <div class="ci-clock-text">
      <div class="ci-clock-kicker">The Doomsday Clock</div>
      <div class="ci-clock-big">${t > 22.2 ? '3 minutes to midnight' : '\u00a0'}</div>
      <div class="ci-clock-sub">${t > 22.9 ? `Global tension ${state.global.tension}/10 · every decision in this room moves the hands` : '\u00a0'}</div>
    </div>
  </div>`;
}

// 24.4 – 30 s: the committee's title, stamped onto the reel.
function Title({ t, state }) {
  const date = fmt.date(state.meta.clock, 'en');
  return html`<div class="ci-title">
    <div class="ci-title-date">${date}</div>
    <h1 class="ci-title-name">${state.name}</h1>
    <div class="ci-title-rule"></div>
    ${t > 25.6 && html`<div class="ci-title-line">Two superpowers. One world. No second chances.</div>`}
  </div>`;
}
