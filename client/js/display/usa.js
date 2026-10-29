// The stage for the continental US committee. It has its own camera, like the other committees: it frames the fighting and any
// incident by itself, or holds the view the Zeus showed on it, and nothing the Zeus does on their own map moves it. Anyone at the
// stage can scroll or drag to look around; Escape returns to the stage's own framing.
import { html, cls, useState, useEffect, useRef } from '../lib.js';
import { UsMap, loadUsa, viewForBox } from '../usa/map.js';
import { useGameClock } from '../usa/fx.js';
import { getUnits } from '/shared/engine/usa.js';
import { simClock } from '/shared/engine/usa-sim.js';
import { USA_VIEW } from '/shared/engine/usa.js';

// What deserves the camera: units in a fight, units ordered to attack (and their targets), and the place of a recent incident.
function hotBox(u) {
  const units = getUnits(u), pts = [];
  for (const x of Object.values(units)) {
    if (x.hidden || x.destroyed) continue;
    if (x.eng && units[x.eng]) pts.push([x.lon, x.lat], [units[x.eng].lon, units[x.eng].lat]);
    else if (x.order?.type === 'attack' && units[x.order.target]) pts.push([x.lon, x.lat], [units[x.order.target].lon, units[x.order.target].lat]);
  }
  const now = u.sim?.t || 0;
  for (const e of u.events || []) if (e.kind === 'incident' && now - e.t < 1800 && e.id && units[e.id]) pts.push([units[e.id].lon, units[e.id].lat]);
  if (!pts.length) return null;
  const pad = 0.8, xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return [Math.min(...xs) - pad, Math.min(...ys) - pad * 0.7, Math.max(...xs) + pad, Math.max(...ys) + pad * 0.7];
}

// The camera holds a shot instead of chasing every unit: a frame is kept while the action stays inside it, widened only after it
// has been up a few seconds, tightened only after a long while, and let go of only once things have been quiet for a while.
const HOLD = 3000, TIGHTEN = 12000, QUIET = 15000;
const inside = (a, b) => a[0] >= b[0] && a[1] >= b[1] && a[2] <= b[2] && a[3] <= b[3];
const area = b => Math.max(0.5, b[2] - b[0]) * Math.max(0.5, b[3] - b[1]);
// Room around the action, so units drifting about a little stay in the shot.
const roomy = b => { const dx = Math.max(1, (b[2] - b[0]) * 0.25), dy = Math.max(0.7, (b[3] - b[1]) * 0.25); return [b[0] - dx, b[1] - dy, b[2] + dx, b[3] + dy]; };
export function nextFrame(F, hot, now) {
  if (hot) {
    F.hotAt = now;
    if (!F.box) return roomy(hot);
    if (!inside(hot, F.box)) return now - F.at > HOLD ? roomy(hot) : F.box;
    if (area(roomy(hot)) < area(F.box) * 0.3 && now - F.at > TIGHTEN) return roomy(hot);
    return F.box;
  }
  return F.box && now - F.hotAt > QUIET ? null : F.box;
}

export function UsaDisplay({ state }) {
  const u = state.usa, clock = useGameClock(state.usa.sim), [data, setData] = useState(null), [local, setLocal] = useState(null), [auto, setAuto] = useState(null);
  useEffect(() => { loadUsa().then(setData); }, []);
  useEffect(() => { const k = e => { if (e.key === 'Escape') setLocal(null); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  // The frame is checked once a second against the latest state (not on every broadcast), so the camera never hunts.
  const latest = useRef(u), frame = useRef(null);
  latest.current = u;
  useEffect(() => {
    if (!data || !u.stageAuto) { setAuto(null); return; }
    const F = frame.current = { box: null, at: 0, hotAt: 0 };
    const tick = () => {
      const now = performance.now(), box = nextFrame(F, hotBox(latest.current), now);
      if (box === F.box) return;
      F.box = box; F.at = now;
      setAuto(box ? viewForBox(data, box) : { ...USA_VIEW });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [data, u.stageAuto]);
  if (state.display.scene === 'blank') return html`<div class="standby"><div class="sb-sub">${u.subtitle}</div><div class="sb-name">${u.title}</div></div>`;
  const view = local || (u.stageAuto ? auto || { ...USA_VIEW } : u.view);
  return html`<div class="us-stage">
    <${UsMap} usa=${u} view=${view} interactive=${true} stage=${true} onView=${setLocal} />
    <div class="us-head"><div class="us-title">${u.title}</div><div class="us-sub">${u.subtitle}</div></div>
    ${u.sim?.t > 0 && html`<div class="us-clock">${simClock(clock)}</div>`}
    ${u.note && html`<div class="us-note">${u.note}</div>`}
    ${Object.values(u.lightbars || {}).some(Boolean) && html`<div class="us-lights">EMERGENCY LIGHTS ON</div>`}
    ${local && html`<div class="us-note" style="bottom:12px;top:auto">Press Esc to go back to the stage view</div>`}
  </div>`;
}
