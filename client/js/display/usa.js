// The stage for the continental US committee. It has its own camera: it holds the view the Zeus showed on it and never moves by
// itself (automatic framing was removed at Dan's request), and nothing the Zeus does on their own map moves it. Anyone at the
// stage can scroll or drag to look around; Escape returns to the stage's own framing.
import { html, useState, useEffect } from '../lib.js';
import { UsMap } from '../usa/map.js';
import { useGameClock } from '../usa/fx.js';
import { simClock } from '/shared/engine/usa-sim.js';

export function UsaDisplay({ state }) {
  const u = state.usa, clock = useGameClock(state.usa.sim), [local, setLocal] = useState(null);
  useEffect(() => { const k = e => { if (e.key === 'Escape') setLocal(null); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  if (state.display.scene === 'blank') return html`<div class="standby"><div class="sb-sub">${u.subtitle}</div><div class="sb-name">${u.title}</div></div>`;
  const view = local || u.view;
  return html`<div class="us-stage">
    <${UsMap} usa=${u} view=${view} interactive=${true} stage=${true} onView=${setLocal} />
    <div class="us-head"><div class="us-title">${u.title}</div><div class="us-sub">${u.subtitle}</div></div>
    ${u.sim?.t > 0 && html`<div class="us-clock">${simClock(clock)}</div>`}
    ${u.note && html`<div class="us-note">${u.note}</div>`}
    ${Object.values(u.lightbars || {}).some(Boolean) && html`<div class="us-lights">EMERGENCY LIGHTS ON</div>`}
    ${local && html`<div class="us-note" style="bottom:12px;top:auto">Press Esc to go back to the stage view</div>`}
  </div>`;
}
