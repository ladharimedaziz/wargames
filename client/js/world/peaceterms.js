// The terms of a peace treaty, shared by the order card and the treaty drafter. Everything is optional.
import { html } from '../lib.js';

const FLAGS = [
  ['returnTerritory', 'Occupied land is returned', true],
  ['demilitarize', 'Troops withdraw from each other\'s land'],
  ['liftSanctions', 'Sanctions between them are lifted'],
  ['liftBlockades', 'Blockades and naval siege end'],
  ['reopenAirspace', 'Airspace reopens'],
  ['tradeResume', 'Trade resumes'],
  ['prisoners', 'Prisoner exchange'],
  ['nonAggression', 'Non-aggression pact'],
];

export function PeaceOptions({ state, terms, parties, onChange }) {
  const t = terms || {}, set = patch => onChange({ ...t, ...patch }), name = id => state.countries[id]?.name || '—';
  const pair = parties.filter(Boolean), two = pair.length >= 2;
  const sel = (value, key, other) => html`<select class="input" value=${value || ''} onChange=${e => set({ [key]: e.target.value })}><option value="">—</option>${pair.map(id => html`<option value=${id}>${name(id)}</option>`)}</select>`;
  return html`<div class="col terms">
    ${FLAGS.map(([k, label, dflt]) => html`<label class="row"><input type="checkbox" checked=${dflt ? t[k] !== false : !!t[k]} onChange=${e => set({ [k]: e.target.checked })} /> ${label}</label>`)}
    ${two && html`<div class="row"><label class="field grow">Reparations ($bn)<input class="input" type="number" min="0" value=${t.reparations || 0} onChange=${e => set({ reparations: +e.target.value, payer: t.payer || pair[0], payee: t.payee || pair[1] })} /></label>
      <label class="field grow">Paid by${sel(t.payer || pair[0], 'payer')}</label>
      <label class="field grow">Paid to${sel(t.payee || pair[1], 'payee')}</label></div>
    <div class="row"><label class="field grow">Reconstruction fund ($bn)<input class="input" type="number" min="0" value=${t.reconstruction || 0} onChange=${e => set({ reconstruction: +e.target.value, fundBy: t.fundBy || pair[0], fundTo: t.fundTo || pair[1] })} /></label>
      <label class="field grow">Funded by${sel(t.fundBy || pair[0], 'fundBy')}</label>
      <label class="field grow">Rebuilds${sel(t.fundTo || pair[1], 'fundTo')}</label></div>`}
  </div>`;
}
