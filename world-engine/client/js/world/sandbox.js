// Kronos-only sandbox: bend the world however the story needs.
import { html, useState, run, cls } from '../lib.js';
import { SEA_ZONES } from '/shared/data/places.js';
import { UNIT_TYPES, TARGET_TYPES } from '/shared/engine/core.js';
import { CountrySelect, ZoneSelect } from './tabs.js';

const EVENTS = [['earthquake', 'Earthquake'], ['flood', 'Floods'], ['pandemic', 'Outbreak'], ['blackout', 'Blackout'], ['coup', 'Military coup'], ['discovery', 'Oil discovery']];
const STATS = [['support', 'Support %', 0, 100, 1], ['stability', 'Stability %', 0, 100, 1], ['gdp', 'GDP $bn', 1, 30000, 1], ['treasury', 'Treasury $bn', -2000, 5000, 1], ['industry', 'Industry', 0.05, 1.2, 0.05], ['energy', 'Energy', 0.05, 1.2, 0.05], ['damage', 'Damage', 0, 1, 0.05], ['airDefense', 'Air defence', 0, 12, 1], ['inflation', 'Inflation %', -2, 80, 0.5]];

export function SandboxTab({ conn, state, selected, selZone }) {
  const g = state.global;
  const [country, setCountry] = useState(selected);
  const [other, setOther] = useState(null);
  const [unitType, setUnitType] = useState('army');
  const [count, setCount] = useState(2);
  const [zone, setZone] = useState(selZone);
  const [cat, setCat] = useState('military');
  const [power, setPower] = useState(2);
  const [note, setNote] = useState(state.kronos.note || '');
  const [banner, setBanner] = useState('');
  const c = state.countries[country || selected];
  const cid = country || selected;
  const k = (action, ok) => run(conn, action, ok);
  return html`
    <div class="pane sandbox">
      <div class="pane-h"><h2 class="gold-t">✦ Sandbox</h2><span class="chip gold">Kronos only</span></div>
      <p class="pane-hint">Powers no Zeus has. Every change is instant and logged.</p>

      <div class="card k-card"><div class="card-b col">
        <div class="row between"><b>Watch and control</b></div>
        <div class="row wrap">
          <button class=${cls('btn sm', state.kronos.eye ? 'kronos' : 'gold')} onClick=${() => k({ type: 'setEye', value: !state.kronos.eye })}>👁 ${state.kronos.eye ? 'Close the eye' : 'Open the eye'}</button>
          <button class=${cls('btn sm', state.kronos.locked ? 'solid-danger' : '')} onClick=${() => k({ type: 'setLock', value: !state.kronos.locked })}>${state.kronos.locked ? 'Unfreeze Zeus panels' : 'Freeze Zeus panels'}</button>
        </div>
        <div class="row"><input class="input sm grow" placeholder="Note pinned on the Zeus panels" value=${note} onInput=${e => setNote(e.target.value)} /><button class="btn sm" onClick=${() => k({ type: 'setKronosNote', text: note })}>Pin</button></div>
        <div class="row"><input class="input sm grow" placeholder="Kronos banner on the stage display" value=${banner} onInput=${e => setBanner(e.target.value)} /><button class="btn sm gold" onClick=${() => k({ type: 'kronosBanner', text: banner })}>Show</button><button class="btn sm ghost" onClick=${() => k({ type: 'kronosBanner', text: '' })}>✕</button></div>
      </div></div>

      <div class="sub-h">World dials</div>
      <label class="row"><span class="dim small" style="width:90px">Tension ${g.tension}</span><input type="range" min="0" max="10" step="0.5" value=${g.tension} class="grow" onChange=${e => k({ type: 'setTension', value: +e.target.value })} /></label>
      <label class="row"><span class="dim small" style="width:90px">Oil $${Math.round(g.oilPrice)}</span><input type="range" min="20" max="300" step="1" value=${g.oilPrice} class="grow" onChange=${e => k({ type: 'setOil', value: +e.target.value })} /></label>
      <div class="row wrap">
        <button class=${cls('btn sm', g.nukeOverride && 'solid-danger')} onClick=${() => k({ type: 'setNukeOverride', value: !g.nukeOverride })}>☢ ${g.nukeOverride ? 'Re-lock nukes' : 'Unlock nukes below 10'}</button>
        <button class=${cls('btn sm', state.settings.aiNukes && 'solid-danger')} onClick=${() => k({ type: 'setAiNukes', value: !state.settings.aiNukes })}>${state.settings.aiNukes ? 'Computer may NOT use nukes' : 'Let computer use nukes'}</button>
        <button class="btn sm good" onClick=${() => k({ type: 'forcePeace', all: true }, 'Every war is over')}>End every war</button>
      </div>
      <div class="row"><span class="dim small">Date</span><input class="input sm" type="date" value=${state.meta.clock} onChange=${e => k({ type: 'setClock', clock: e.target.value })} /><span class="dim small">Days per turn</span><input class="input sm" style="width:60px" type="number" min="1" max="90" value=${state.meta.turnDays} onChange=${e => k({ type: 'setClock', turnDays: +e.target.value })} /></div>

      <div class="sub-h">Country</div>
      <${CountrySelect} state=${state} value=${cid} onChange=${setCountry} />
      ${c && html`
        <div class="stat-edit">
          ${STATS.map(([f, l, mn, mx, st]) => html`<label class="row"><span class="dim small" style="width:96px">${l}</span><input type="range" min=${mn} max=${mx} step=${st} value=${c[f]} class="grow" onChange=${e => k({ type: 'setStat', country: cid, field: f, value: +e.target.value })} /><span class="mono small" style="width:56px;text-align:right">${typeof c[f] === 'number' ? (Math.abs(c[f]) < 2 && st < 1 ? c[f].toFixed(2) : Math.round(c[f])) : ''}</span></label>`)}
        </div>
        <div class="row wrap">
          <button class=${cls('btn xs', c.nuclear.has && 'on')} onClick=${() => k({ type: 'setFlag', country: cid, flag: 'nuclear', value: !c.nuclear.has })}>☢ Nuclear</button>
          <button class=${cls('btn xs', c.stealth && 'on')} onClick=${() => k({ type: 'setFlag', country: cid, flag: 'stealth', value: !c.stealth })}>Stealth</button>
          <button class=${cls('btn xs', c.veto && 'on')} onClick=${() => k({ type: 'setFlag', country: cid, flag: 'veto', value: !c.veto })}>UN veto</button>
          <button class=${cls('btn xs', c.capitulated && 'solid-danger')} onClick=${() => k({ type: 'setFlag', country: cid, flag: 'capitulated', value: !c.capitulated })}>Capitulated</button>
          <button class=${cls('btn xs', state.global.closedAirspace[cid] && 'danger')} onClick=${() => k({ type: 'setAirspace', country: cid, closed: !state.global.closedAirspace[cid] })}>${state.global.closedAirspace[cid] ? 'Open airspace' : 'Close airspace'}</button>
          <button class=${cls('btn xs', state.global.weather[cid] && 'on')} onClick=${() => k({ type: 'setWeather', country: cid, kind: state.global.weather[cid] ? null : 'storm' })}>⛈ Storm</button>
        </div>

        <div class="sub-h">Spawn forces for ${c.name}</div>
        <div class="row">
          <select class="input sm grow" value=${unitType} onChange=${e => setUnitType(e.target.value)}>${Object.entries(UNIT_TYPES).map(([t, u]) => html`<option value=${t}>${u.name}</option>`)}</select>
          <input class="input sm" style="width:54px" type="number" min="1" max="20" value=${count} onInput=${e => setCount(+e.target.value)} />
          <button class="btn sm gold" onClick=${() => k({ type: 'spawnUnits', country: cid, unitType, count, zone }, `${count} spawned`)}>Spawn</button>
        </div>
        ${UNIT_TYPES[unitType].domain === 'sea' && html`<div style="margin-top:6px"><${ZoneSelect} sm value=${zone} onChange=${setZone} /></div>`}

        <div class="sub-h">Acts of god</div>
        <div class="row wrap">${EVENTS.map(([e, l]) => html`<button class="btn xs" onClick=${() => k({ type: 'disaster', country: cid, kind: e }, `${l} in ${c.name}`)}>${l}</button>`)}</div>

        <div class="sub-h">Between ${c.name} and…</div>
        <${CountrySelect} state=${state} value=${other} onChange=${setOther} placeholder="Another country" sm />
        ${other && html`<div class="row wrap" style="margin-top:6px">
          <button class="btn xs danger" onClick=${() => k({ type: 'forceWar', a: cid, b: other }, 'War declared')}>Force war</button>
          <button class="btn xs good" onClick=${() => k({ type: 'forcePeace', a: cid, b: other }, 'War ended')}>Force peace</button>
          <button class="btn xs" onClick=${() => k({ type: 'setRelation', a: cid, b: other, value: 90 })}>Best friends</button>
          <button class="btn xs" onClick=${() => k({ type: 'setRelation', a: cid, b: other, value: -90 })}>Bitter rivals</button>
          <button class="btn xs" onClick=${() => k({ type: 'setFlag', country: other, flag: 'occupiedBy', value: cid })}>${state.countries[other].name} occupied by ${c.name}</button>
        </div>
        <div class="row" style="margin-top:6px">
          <select class="input sm" value=${cat} onChange=${e => setCat(e.target.value)}>${TARGET_TYPES.map(t => html`<option value=${t}>${t}</option>`)}</select>
          <span class="dim small">Power</span><input type="range" min="1" max="5" value=${power} onInput=${e => setPower(+e.target.value)} />
          <button class="btn xs solid-danger" title="A strike nothing can intercept" onClick=${() => k({ type: 'smite', from: cid, target: other, category: cat, power }, 'Strike landed')}>Unstoppable strike</button>
        </div>`}
      `}

      <div class="sub-h">Chokepoints</div>
      ${Object.entries(state.global.chokepoints).map(([z, cp]) => html`<div class="row small" style="margin-bottom:4px"><span class="grow">${SEA_ZONES[z].name}</span>
        <div class="seg sm">${['auto', 'open', 'contested', 'closed'].map(s => html`<button class=${(s === 'auto' ? !cp.forced : cp.forced && cp.status === s) ? 'on' : ''} title=${s === 'auto' ? 'Let fleets and blockades decide' : `Hold it ${s} until set back to auto`} onClick=${() => k({ type: 'setChokepoint', zone: z, status: s, by: cid })}>${s}</button>`)}</div></div>`)}
    </div>`;
}
