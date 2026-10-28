// The sandbox tab: the Zeus builds and breaks things freely. Bring in units by the dozen, design a new kind, copy, edit or move
// the picked units together, run a ready-made crisis, and save or undo.
import { html, useState, cls, toast } from '../lib.js';
import { UNIT_TYPES, TYPE_GROUPS } from '/shared/data/usa-types.js';
import { SCENARIOS } from '/shared/data/usa-scenarios.js';
import { ROES } from '/shared/engine/usa-sim.js';
import { SideOptions } from './inspector.js';

const STAT_FIELDS = [['men', 'People'], ['speed', 'Speed km/h'], ['def', 'Defence'], ['range', 'Range km']];

function Spawn({ placing, setPlacing, act, states, count }) {
  const [f, setF] = useState({ utype: 'ng_bct', name: '', side: 'fed', strength: 100, keep: true, state: 'TX', count: 1, spread: 15, design: false, stats: {} });
  const ty = UNIT_TYPES[f.utype], arming = placing?.spawn;
  const stats = f.design ? Object.fromEntries([...STAT_FIELDS.map(([k]) => [k, f.stats[k]]), ['atk', { ground: f.stats.ag, air: f.stats.aa, sea: f.stats.as }]].filter(([, v]) => v !== undefined && v !== '' && !(typeof v === 'object' && Object.values(v).every(x => x === undefined || x === '')))) : undefined;
  const spawn = { utype: f.utype, name: f.name.trim() || undefined, side: f.side, strength: Number(f.strength), count: Number(f.count), spread: Number(f.spread), ...(stats && Object.keys(stats).length ? { stats } : {}) };
  const setStat = (k, v) => setF({ ...f, stats: { ...f.stats, [k]: v } });
  return html`<div class="card"><div class="card-h"><h3>Bring in units</h3></div><div class="card-b col">
    <select class="input sm" value=${f.utype} onChange=${e => setF({ ...f, utype: e.target.value, side: UNIT_TYPES[e.target.value].group === 'National Guard' ? `st:${f.state}` : f.side })}>
      ${TYPE_GROUPS.map(g => html`<optgroup label=${g}>${Object.values(UNIT_TYPES).filter(t => t.group === g).map(t => html`<option value=${t.id}>${t.name}</option>`)}</optgroup>`)}</select>
    <div class="dim small">${ty.desc} ${ty.men.toLocaleString('en-US')} people${ty.speed ? `, ${ty.speed} km/h` : ''}.</div>
    <input class="input sm" placeholder=${`Name (default: ${ty.name})`} value=${f.name} onInput=${e => setF({ ...f, name: e.target.value })} />
    <select class="input sm" value=${f.side} onChange=${e => setF({ ...f, side: e.target.value })}><${SideOptions} /></select>
    <label class="row small">Strength <input type="range" min="0" max="100" value=${f.strength} onInput=${e => setF({ ...f, strength: e.target.value })} /> <b>${f.strength}%</b></label>
    <div class="row small">How many <input class="input sm" type="number" min="1" max="50" style="width:4.5em" value=${f.count} onInput=${e => setF({ ...f, count: e.target.value })} />
      scattered over <input class="input sm" type="number" min="1" max="300" style="width:4.5em" value=${f.spread} onInput=${e => setF({ ...f, spread: e.target.value })} /> km</div>
    <label class="row small"><input type="checkbox" checked=${f.design} onChange=${e => setF({ ...f, design: e.target.checked })} /> Design its numbers</label>
    ${f.design && html`<div class="col"><div class="dim small">Leave a box empty to keep the ${ty.name.toLowerCase()} value.</div>
      <div class="row wrap">${STAT_FIELDS.map(([k, l]) => html`<label class="small">${l} <input class="input sm" type="number" min="0" style="width:5.5em" placeholder=${ty[k]} value=${f.stats[k] ?? ''} onInput=${e => setStat(k, e.target.value)} /></label>`)}</div>
      <div class="row wrap">${[['ag', 'Attack ground', ty.atk.ground], ['aa', 'air', ty.atk.air], ['as', 'sea', ty.atk.sea]].map(([k, l, d]) => html`<label class="small">${l} <input class="input sm" type="number" min="0" style="width:5.5em" placeholder=${d} value=${f.stats[k] ?? ''} onInput=${e => setStat(k, e.target.value)} /></label>`)}</div></div>`}
    <label class="row small"><input type="checkbox" checked=${f.keep} onChange=${e => setF({ ...f, keep: e.target.checked })} /> Keep placing (press Esc to stop)</label>
    <button class=${cls('btn sm gold', arming && 'on')} onClick=${() => setPlacing(arming ? null : { spawn, keep: f.keep })}>${arming ? 'Click the map to place…' : 'Place on the map'}</button>
    <div class="row wrap"><select class="input sm grow" value=${f.state} onChange=${e => setF({ ...f, state: e.target.value })}>${states.map(s => html`<option value=${s.id}>${s.name}</option>`)}</select>
      <button class="btn sm" onClick=${() => act({ type: 'usaSpawn', ...spawn, at: 'capital', state: f.state })}>At the capital</button></div>
    <div class="dim small">${count} unit${count === 1 ? '' : 's'} made by you (500 at most).</div>
  </div></div>`;
}

function Picked({ ids, units, act, placing, setPlacing }) {
  const [strength, setStrength] = useState(100), [side, setSide] = useState(''), [roe, setRoe] = useState(''), [copies, setCopies] = useState(1);
  const mine = ids.filter(id => units[id] && units[id].kind === 'custom').length;
  const set = (what) => act({ type: 'usaBulk', ids, set: what });
  return html`<div class="card"><div class="card-h"><h3>The ${ids.length} picked</h3></div><div class="card-b col">
    <div class="dim small">Shift-drag on the map, double-click a unit for all of its kind, or Ctrl+A. ${mine} of them ${mine === 1 ? 'is' : 'are'} yours to delete.</div>
    <label class="row small">Strength <input type="range" min="0" max="100" value=${strength} onInput=${e => setStrength(e.target.value)} /> <b>${strength}%</b> <button class="btn xs" onClick=${() => set({ strength: Number(strength) })}>Set</button></label>
    <div class="row wrap"><select class="input sm grow" value=${side} onChange=${e => setSide(e.target.value)}><option value="">Change side…</option><${SideOptions} /></select><button class="btn sm" disabled=${!side} onClick=${() => set({ side })}>Apply</button></div>
    <div class="row wrap"><select class="input sm grow" value=${roe} onChange=${e => setRoe(e.target.value)}><option value="">Rules of engagement…</option>${Object.entries(ROES).map(([k, v]) => html`<option value=${k}>${v}</option>`)}</select><button class="btn sm" disabled=${!roe} onClick=${() => set({ roe })}>Apply</button></div>
    <div class="row wrap"><button class="btn sm" onClick=${() => set({ revive: true })}>Repair and revive</button><button class="btn sm" onClick=${() => set({ stop: true })}>Stop</button><button class="btn sm" onClick=${() => set({ hidden: true })}>Hide</button><button class="btn sm" onClick=${() => set({ hidden: false })}>Show</button></div>
    <div class="row wrap"><button class=${cls('btn sm', placing?.teleport && 'on')} onClick=${() => setPlacing(placing?.teleport ? null : { teleport: true })}>${placing?.teleport ? 'Click where they go…' : 'Teleport them…'}</button>
      <span class="row small">Copy ×<input class="input sm" type="number" min="1" max="10" style="width:3.5em" value=${copies} onInput=${e => setCopies(e.target.value)} /></span><button class="btn sm" onClick=${() => act({ type: 'usaClone', ids, copies: Number(copies) })}>Copy</button></div>
    ${mine > 0 && html`<button class="btn sm danger" onClick=${() => act({ type: 'usaBulk', ids, delete: true })}>Delete the ${mine} of yours</button>`}
  </div></div>`;
}

export function Sandbox({ u, units, selIds, act, placing, setPlacing, states }) {
  const [name, setName] = useState('');
  const count = Object.keys(u.custom || {}).length;
  const run = (a, ok) => act(a).then(r => { if (r?.ok && ok) toast(ok, 'good'); });
  return html`<${Spawn} placing=${placing} setPlacing=${setPlacing} act=${act} states=${states} count=${count} />
    ${selIds.length > 0 && html`<${Picked} ids=${selIds} units=${units} act=${act} placing=${placing} setPlacing=${setPlacing} />`}
    <div class="card"><div class="card-h"><h3>Ready-made crises</h3></div><div class="card-b col">
      ${Object.entries(SCENARIOS).map(([k, sc]) => html`<div class="row"><div class="grow"><b>${sc.name}</b><div class="dim small">${sc.desc}</div></div><button class="btn sm gold" onClick=${() => run({ type: 'usaScenario', id: k }, `${sc.name} is under way.`)}>Run</button></div>`)}
    </div></div>
    <div class="card"><div class="card-h"><h3>Save, undo, clean up</h3></div><div class="card-b col">
      <div class="row wrap"><button class="btn sm" disabled=${!u.undo?.length} onClick=${() => run({ type: 'usaUndo' })}>↶ Undo (${u.undo?.length || 0})</button>
        <button class="btn sm danger" disabled=${!count} onClick=${() => { if (confirm(`Remove all ${count} units you made?`)) run({ type: 'usaClear' }); }}>Remove all of mine</button></div>
      <div class="row wrap"><input class="input sm grow" placeholder="Name this moment" value=${name} onInput=${e => setName(e.target.value)} /><button class="btn sm gold" onClick=${() => { run({ type: 'usaSnap', name }, 'Saved.'); setName(''); }}>Save</button></div>
      ${(u.snaps || []).map(sv => html`<div class="row"><div class="grow"><b>${sv.name}</b><div class="dim small">${sv.n} of yours</div></div>
        <button class="btn xs" onClick=${() => run({ type: 'usaSnapLoad', id: sv.id }, 'Loaded. Undo goes back.')}>Load</button><button class="btn xs ghost" onClick=${() => act({ type: 'usaSnapDelete', id: sv.id })}>✕</button></div>`)}
      <div class="dim small">A save keeps your units, edits, wars and state numbers (not the clock or the government). Four saves at most.</div>
    </div></div>`;
}
