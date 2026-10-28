// The stage for the continental US committee: the map, following whatever the Zeus shows.
import { html, cls } from '../lib.js';
import { UsMap } from '../usa/map.js';

export function UsaDisplay({ state }) {
  const u = state.usa;
  if (state.display.scene === 'blank') return html`<div class="standby"><div class="sb-sub">${u.subtitle}</div><div class="sb-name">${u.title}</div></div>`;
  return html`<div class="us-stage">
    <${UsMap} usa=${u} view=${u.view} />
    <div class="us-head"><div class="us-title">${u.title}</div><div class="us-sub">${u.subtitle}</div></div>
    ${u.note && html`<div class="us-note">${u.note}</div>`}
    <div class="us-key">
      ${u.layers.highways && html`<span><i style="background:#f3b24a"></i>Interstate</span><span><i style="background:#c8aa78"></i>US highway</span>`}
    </div>
    ${Object.values(u.lightbars || {}).some(Boolean) && html`<div class="us-lights">EMERGENCY LIGHTS ON</div>`}
  </div>`;
}
