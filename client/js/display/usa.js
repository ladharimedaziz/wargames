// The stage for the continental US committee. It has its own camera, like the other committees: it frames the fighting and any
// incident by itself, or holds the view the Zeus showed on it, and nothing the Zeus does on their own map moves it. Anyone at the
// stage can scroll or drag to look around; Escape returns to the stage's own framing.
import { html, cls, useState, useEffect, useMemo } from '../lib.js';
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

export function UsaDisplay({ state }) {
  const u = state.usa, clock = useGameClock(state.usa.sim), [data, setData] = useState(null), [local, setLocal] = useState(null), [auto, setAuto] = useState(null);
  useEffect(() => { loadUsa().then(setData); }, []);
  useEffect(() => { const k = e => { if (e.key === 'Escape') setLocal(null); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  // The frame is worked out every few seconds, so units drifting a little do not make the camera hunt.
  const box = useMemo(() => (u.stageAuto ? hotBox(u) : null), [u]);
  useEffect(() => {
    if (!data || !u.stageAuto) { setAuto(null); return; }
    const t = setTimeout(() => setAuto(box ? viewForBox(data, box) : { ...USA_VIEW }), 600);
    return () => clearTimeout(t);
  }, [data, u.stageAuto, box && box.map(v => Math.round(v * 2)).join()]);
  if (state.display.scene === 'blank') return html`<div class="standby"><div class="sb-sub">${u.subtitle}</div><div class="sb-name">${u.title}</div></div>`;
  const view = local || (u.stageAuto ? auto || { ...USA_VIEW } : u.view);
  return html`<div class="us-stage">
    <${UsMap} usa=${u} view=${view} interactive=${true} onView=${setLocal} />
    <div class="us-head"><div class="us-title">${u.title}</div><div class="us-sub">${u.subtitle}</div></div>
    ${u.sim?.t > 0 && html`<div class="us-clock">${simClock(clock)}</div>`}
    ${u.note && html`<div class="us-note">${u.note}</div>`}
    ${Object.values(u.lightbars || {}).some(Boolean) && html`<div class="us-lights">EMERGENCY LIGHTS ON</div>`}
    ${local && html`<div class="us-note" style="bottom:12px;top:auto">Press Esc to go back to the stage view</div>`}
  </div>`;
}
