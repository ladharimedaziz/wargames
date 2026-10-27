// A drawn map of Gotham City: islands, bridges and fifteen districts that the Zeus can darken, set alight or lose.
import { html, cls } from '../lib.js';
import { GOTHAM_DISTRICTS, DISTRICT_STATUS } from '/shared/data/councils.js';

const P = (...pts) => pts.map(p => p.join(',')).join(' ');
// Rounded coastlines: a closed Catmull-Rom curve through the district's corners.
function smooth(str) {
  const pts = str.split(' ').map(p => p.split(',').map(Number)), n = pts.length;
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0]} ${p2[1]}`;
  }
  return d + 'Z';
}
export const SHAPES = {
  heights: P([60, 60], [250, 50], [300, 130], [280, 210], [90, 220], [50, 140]),
  otis: P([90, 225], [280, 215], [312, 300], [292, 382], [100, 392], [62, 302]),
  bowery: P([100, 398], [292, 388], [340, 435], [322, 522], [120, 522], [76, 452]),
  narrows: P([130, 545], [312, 545], [330, 622], [242, 672], [110, 632]),
  diamond: P([395, 70], [535, 60], [560, 120], [545, 205], [400, 215], [385, 140]),
  old: P([400, 220], [545, 210], [565, 285], [535, 335], [405, 340], [390, 272]),
  crime: P([405, 345], [535, 340], [545, 412], [500, 452], [415, 447], [398, 392]),
  miller: P([340, 545], [520, 562], [560, 622], [420, 667], [332, 622]),
  amusement: P([585, 432], [700, 472], [690, 540], [600, 560], [560, 500]),
  founders: P([600, 150], [680, 140], [700, 200], [640, 235], [590, 205]),
  sprang: P([612, 262], [666, 256], [676, 306], [632, 332], [602, 302]),
  burnley: P([682, 262], [860, 232], [940, 302], [920, 402], [722, 412], [672, 342]),
  robbins: P([722, 418], [920, 408], [952, 492], [882, 562], [742, 542], [702, 472]),
  arkham: P([790, 70], [880, 60], [930, 110], [900, 170], [820, 182], [775, 122]),
  blackgate: P([602, 582], [692, 592], [702, 642], [632, 667], [582, 632]),
};
const ROT = { heights: 12, otis: 8, bowery: -6, narrows: 20, diamond: 0, old: 0, crime: 0, miller: 14, amusement: 30, founders: 0, sprang: 40, burnley: -10, robbins: 16, arkham: 0, blackgate: 0 };
const PATHS = Object.fromEntries(Object.entries(SHAPES).map(([k, v]) => [k, smooth(v)]));
const LANDMARKS = [
  ['tower', 505, 150, 'Wayne Tower'], ['news', 425, 165, 'Gotham Gazette'], ['hq', 492, 292, 'GCPD HQ'], ['church', 425, 312, 'Cathedral'], ['train', 525, 318, 'Central Station'],
  ['alley', 438, 402, 'Crime Alley'], ['theatre', 512, 412, 'Monarch Theatre'], ['hospital', 195, 345, 'Gotham General'], ['wheel', 640, 520, 'Ferris wheel'],
  ['plant', 805, 350, 'Ace Chemicals'], ['port', 430, 640, 'Port Authority'], ['prison', 645, 645, 'Blackgate'], ['asylum', 850, 138, 'Arkham Asylum'], ['grid', 205, 642, 'Substation 4'],
  ['uni', 125, 335, 'Gotham University'], ['fort', 880, 525, 'Robbins Yards'],
];
const PARKS = [['heights', 168, 160, 56, 34], ['otis', 215, 280, 32, 22], ['burnley', 790, 290, 40, 22]];
const CENTER = { heights: [170, 130], otis: [190, 300], bowery: [205, 455], narrows: [215, 605], diamond: [470, 135], old: [470, 275], crime: [470, 395], miller: [440, 610], amusement: [640, 500], founders: [645, 190], sprang: [640, 295], burnley: [800, 330], robbins: [830, 485], arkham: [850, 120], blackgate: [642, 625] };
const ICON = {
  tower: () => html`<rect x="-3" y="-8" width="6" height="16" fill="#7cc4ff" /><rect x="-0.8" y="-14" width="1.6" height="7" fill="#7cc4ff" />`,
  news: () => html`<rect x="-6" y="-5" width="12" height="10" fill="#b9c6e0" /><rect x="-4" y="-3" width="8" height="1.6" fill="#10192c" /><rect x="-4" y="0" width="5" height="1.6" fill="#10192c" />`,
  hq: () => html`<rect x="-6" y="-4" width="12" height="9" fill="#5aa0ff" /><path d="M-7 -4 L0 -9 L7 -4Z" fill="#5aa0ff" />`,
  church: () => html`<rect x="-5" y="-2" width="10" height="8" fill="#c7b8ff" /><path d="M-5 -2 L0 -10 L5 -2Z" fill="#c7b8ff" />`,
  train: () => html`<rect x="-7" y="-4" width="14" height="8" rx="2" fill="#ffd27a" /><circle cx="-3" cy="5" r="1.6" fill="#ffd27a" /><circle cx="3" cy="5" r="1.6" fill="#ffd27a" />`,
  alley: () => html`<path d="M-6 6 L0 -7 L6 6Z" fill="none" stroke="#ff7a6b" stroke-width="2" />`,
  theatre: () => html`<path d="M-7 -4 Q0 -10 7 -4 L7 5 L-7 5Z" fill="#e5a0ff" />`,
  hospital: () => html`<rect x="-6" y="-6" width="12" height="12" fill="#e6f6ee" /><rect x="-4" y="-1" width="8" height="2" fill="#d9503f" /><rect x="-1" y="-4" width="2" height="8" fill="#d9503f" />`,
  wheel: () => html`<circle r="7" fill="none" stroke="#ff9ad2" stroke-width="1.6" /><path d="M-7 0H7M0 -7V7M-5 -5L5 5M5 -5L-5 5" stroke="#ff9ad2" stroke-width="1" />`,
  plant: () => html`<rect x="-7" y="-2" width="14" height="8" fill="#9dff7a" /><rect x="-5" y="-9" width="3" height="8" fill="#9dff7a" /><rect x="1" y="-6" width="3" height="5" fill="#9dff7a" />`,
  port: () => html`<path d="M-7 5 H7 M-3 5 V-7 H5 M5 -7 V0" stroke="#6ad7ff" stroke-width="2" fill="none" />`,
  prison: () => html`<rect x="-7" y="-6" width="14" height="12" fill="#2c3550" stroke="#a9b7d6" stroke-width="1.4" /><path d="M-3 -6V6M0 -6V6M3 -6V6" stroke="#a9b7d6" />`,
  asylum: () => html`<rect x="-9" y="-3" width="18" height="9" fill="#d7a8ff" /><rect x="-3" y="-9" width="6" height="7" fill="#d7a8ff" /><rect x="-1.2" y="1" width="2.4" height="5" fill="#1a0f26" />`,
  grid: () => html`<path d="M3 -8 L-4 1 L0 1 L-3 8 L5 -2 L0 -2Z" fill="#ffe08a" />`,
  uni: () => html`<path d="M-8 -1 L0 -7 L8 -1Z M-6 0V6M-2 0V6M2 0V6M6 0V6" fill="#9cb4ff" stroke="#9cb4ff" stroke-width="1.4" />`,
  fort: () => html`<rect x="-6" y="-4" width="12" height="9" fill="#8aa07a" /><path d="M-6 -4 v-3 h3 v3 M-1.5 -4 v-3 h3 v3 M3 -4 v-3 h3 v3" fill="#8aa07a" />`,
};
const BRIDGES = [
  { n: 'Gotham Bridge', d: 'M385 135 L300 130' }, { n: 'Cathedral Bridge', d: 'M392 300 L312 300' }, { n: 'Sprang Bridge', d: 'M565 285 L602 290 M676 300 L682 300' },
  { n: 'Wayne Bridge', d: 'M555 150 L592 175' }, { n: 'Arkham Bridge', d: 'M880 232 L860 176' }, { n: 'Miller Bridge', d: 'M470 452 L452 545' }, { n: 'Mile Bridge', d: 'M545 420 L590 450' },
  { n: 'Narrows Bridge', d: 'M322 470 L340 560' }, { n: 'Blackgate Ferry', d: 'M545 545 L610 590', ferry: true }, { n: 'Robbins Link', d: 'M692 500 L704 478' },
];
const MK = {
  fire: (c) => html`<path d="M0 -9 C5 -3 6 2 3 6 C1 8 -1 8 -3 6 C-6 2 -4 -3 0 -9Z" fill="#ff8a3d" /><path d="M0 -3 C2 0 2 3 0 5 C-2 3 -2 0 0 -3Z" fill="#ffe08a" />`,
  riot: () => html`<circle r="7" fill="#e2574a" /><rect x="-1" y="-4" width="2" height="5" fill="#fff" /><rect x="-1" y="2" width="2" height="2" fill="#fff" />`,
  breach: () => html`<path d="M-7 -7 L-1 -7 L-3 -1 L2 -3 L7 -7 L7 7 L-7 7Z" fill="#c85cff" />`,
  hostage: () => html`<path d="M0 -8 L8 0 L0 8 L-8 0Z" fill="#ffd166" /><circle r="2" fill="#2a1a00" />`,
  sighting: () => html`<circle r="8" fill="none" stroke="#7dffd8" stroke-width="2" /><circle r="3" fill="#7dffd8" />`,
  blackout: () => html`<path d="M2 -9 L-5 1 L0 1 L-2 9 L6 -2 L1 -2Z" fill="#cdd7ff" />`,
  help: () => html`<rect x="-7" y="-2.5" width="14" height="5" fill="#7fbf9a" /><rect x="-2.5" y="-7" width="5" height="14" fill="#7fbf9a" />`,
};
export const MARKER_LABEL = { fire: 'Fire', riot: 'Riot', breach: 'Breach', hostage: 'Hostages', sighting: 'Sighting', blackout: 'Blackout', help: 'Help point' };
const COL = Object.fromEntries(DISTRICT_STATUS.map(([k, , c]) => [k, c]));

export function GothamMap({ c, onDistrict, onPoint, big }) {
  const dist = c.districts || {};
  const click = e => {
    if (!onPoint) return;
    const svg = e.currentTarget.closest('svg'), pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const q = pt.matrixTransform(svg.getScreenCTM().inverse()); onPoint(Math.round(q.x), Math.round(q.y));
  };
  return html`<div class=${cls('gotham', big && 'big')}>
    <svg viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid meet" onClick=${click}>
      <defs>
        <pattern id="gt-grid" width="14" height="14" patternUnits="userSpaceOnUse"><path d="M14 0H0V14" fill="none" stroke="#7aa2ff" stroke-opacity=".10" /></pattern>
        <pattern id="gt-hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="9" fill="#e2574a" fill-opacity=".38" /></pattern>
        ${GOTHAM_DISTRICTS.map(d => html`<clipPath id=${`gt-clip-${d.id}`}><path d=${PATHS[d.id]} /></clipPath>`)}
        <pattern id="gt-ave" width="56" height="56" patternUnits="userSpaceOnUse"><path d="M0 0H56M0 28H56" stroke="#9db8ff" stroke-opacity=".13" stroke-width="2.4" fill="none" /><path d="M0 0V56" stroke="#9db8ff" stroke-opacity=".08" stroke-width="1.6" /></pattern>
        <radialGradient id="gt-sea" cx="50%" cy="48%" r="70%"><stop offset="0" stop-color="#0b1730" /><stop offset="1" stop-color="#050a16" /></radialGradient>
        <filter id="gt-glow"><feGaussianBlur stdDeviation="3" /><feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <rect width="1000" height="700" fill="url(#gt-sea)" />
      ${[0, 1, 2, 3, 4, 5].map(i => html`<path class="gt-wave" style=${`animation-delay:${-i * 1.4}s`} d=${`M0 ${90 + i * 105} q125 -14 250 0 t250 0 t250 0 t250 0`} />`)}
      <g class="gt-bridges">${BRIDGES.map(b => html`<path d=${b.d} class=${cls('gt-bridge', b.ferry && 'ferry')} />`)}</g>
      <g>${GOTHAM_DISTRICTS.map(d => {
        const st = dist[d.id]?.status || 'secure', col = COL[st];
        return html`<g class=${cls('gt-d', `st-${st}`, onDistrict && 'pick')} onClick=${e => { if (onDistrict) { e.stopPropagation(); onDistrict(d.id); } }}>
          <path d=${PATHS[d.id]} class="gt-land" />
          <path d=${PATHS[d.id]} fill="url(#gt-grid)" style=${`transform-box:fill-box;transform-origin:center;`} clip-path=${`url(#gt-clip-${d.id})`} />
          <g clip-path=${`url(#gt-clip-${d.id})`}><rect x="0" y="0" width="1000" height="700" fill="url(#gt-ave)" transform=${`rotate(${ROT[d.id]} ${CENTER[d.id][0]} ${CENTER[d.id][1]})`} /></g>
          ${st !== 'secure' && html`<path d=${PATHS[d.id]} class="gt-tint" style=${`fill:${col}`} />`}
          ${st === 'lost' && html`<path d=${PATHS[d.id]} fill="url(#gt-hatch)" />`}
          <path d=${PATHS[d.id]} class="gt-edge" style=${`stroke:${st === 'secure' ? '#33507f' : col}`} />
          <text x=${CENTER[d.id][0]} y=${CENTER[d.id][1] - 24} class="gt-name">${d.name.toUpperCase()}</text>
          ${st !== 'secure' && html`<text x=${CENTER[d.id][0]} y=${CENTER[d.id][1] - 10} class="gt-st" style=${`fill:${col}`}>${DISTRICT_STATUS.find(x => x[0] === st)[1].toUpperCase()}</text>`}
        </g>`;
      })}</g>
      <g class="gt-parks">${PARKS.map(([d, x, y, rx, ry]) => html`<ellipse cx=${x} cy=${y} rx=${rx} ry=${ry} class="gt-park" />`)}</g>
      <g class="gt-lm">${LANDMARKS.map(([k, x, y, label]) => html`<g transform=${`translate(${x} ${y})`} key=${label}><g class="gt-ico">${ICON[k]()}</g><text y="19" class="gt-lbl">${label}</text></g>`)}</g>
      <g class="gt-off"><path d="M958 18 l30 -12 l-6 20 z" fill="#c7a56a" opacity=".8" /><text x="968" y="44" class="gt-lbl" style="text-anchor:end">To Wayne Manor</text><text x="40" y="690" class="gt-lbl" style="text-anchor:start;opacity:.7">Fort Kane · 2 hrs by road</text></g>
      <g class="gt-markers">${(c.markers || []).map(m => html`<g transform=${`translate(${m.x} ${m.y})`} key=${m.id}>
        <circle r="14" class="gt-ping" /><circle r="14" class="gt-ping p2" />
        <g filter="url(#gt-glow)">${(MK[m.kind] || MK.fire)()}</g>
        ${m.label && html`<text y="25" class="gt-mk">${m.label}</text>`}
      </g>`)}</g>
      <line class="gt-sweep" x1="500" y1="350" x2="500" y2="-200" />
    </svg>
    ${c.mapNote && html`<div class="gt-note">${c.mapNote}</div>`}
  </div>`;
}
