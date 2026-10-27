// Kronos-only sandbox: bend the world however the story needs.
import { html, useState, run, cls } from '../lib.js';
import { SEA_ZONES } from '/shared/data/places.js';
import { UNIT_TYPES, TARGET_TYPES } from '/shared/engine/core.js';
import { CountrySelect, ZoneSelect } from './tabs.js';
import { altFlagUrl, randomFlag } from '../map/altflag.js';

const EVENTS = [['earthquake', 'Earthquake'], ['flood', 'Floods'], ['pandemic', 'Outbreak'], ['blackout', 'Blackout'], ['discovery', 'Oil discovery']];
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
        <button class=${cls('btn sm', state.settings.nuclearExchange === false && 'solid-danger')} onClick=${() => k({ type: 'setNuclearExchange', value: state.settings.nuclearExchange === false })}>${state.settings.nuclearExchange === false ? 'Nukes: single strikes only' : 'Nukes: full exchange'}</button>
        <button class=${cls('btn sm', state.settings.autoNavy === false && 'solid-danger')} onClick=${() => k({ type: 'setWarOption', key: 'autoNavy', value: state.settings.autoNavy === false })}>${state.settings.autoNavy === false ? 'Computer fleets: idle' : 'Computer fleets: hunt and blockade'}</button>
        <button class=${cls('btn sm', state.settings.combinedArms === false && 'solid-danger')} onClick=${() => k({ type: 'setWarOption', key: 'combinedArms', value: state.settings.combinedArms === false })}>${state.settings.combinedArms === false ? 'Combined arms: off' : 'Combined arms: on'}</button>
        <button class="btn sm good" onClick=${() => k({ type: 'forcePeace', all: true }, 'Every war is over')}>End every war</button>
        <button class="btn sm good" disabled=${!Object.values(state.countries).some(c => c.outbreak)} onClick=${() => k({ type: 'endAllOutbreaks' }, 'Every outbreak is over')}>☣ End all outbreaks</button>
        <button class="btn sm good" disabled=${!Object.values(state.countries).some(c => c.blackout)} onClick=${() => k({ type: 'restoreAllPower' }, 'Power is back everywhere')}>⚡ Restore all power</button>
      </div>
      <div class="row"><span class="dim small">Date</span><input class="input sm" type="date" value=${state.meta.clock} onChange=${e => k({ type: 'setClock', clock: e.target.value })} /><span class="dim small">Days per turn</span><input class="input sm" style="width:60px" type="number" min="1" max="90" value=${state.meta.turnDays} onChange=${e => k({ type: 'setClock', turnDays: +e.target.value })} /></div>

      <${CivilWars} conn=${conn} state=${state} />

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

        <${CoupBox} conn=${conn} c=${c} />

        <div class="sub-h">Acts of god</div>
        <div class="row wrap">${EVENTS.map(([e, l]) => html`<button class="btn xs" onClick=${() => k({ type: 'disaster', country: cid, kind: e }, `${l} in ${c.name}`)}>${l}</button>`)}</div>
        ${c.outbreak && html`<div class="row" style="margin-top:6px"><span class="chip" style="color:#b8ff6a">Outbreak ${c.outbreak.level}%</span>
          <button class="btn xs" title="Worse" onClick=${() => k({ type: 'outbreak', country: cid, op: 'up' })}>▲</button>
          <button class="btn xs" title="Ease" onClick=${() => k({ type: 'outbreak', country: cid, op: 'down' })}>▼</button>
          <button class="btn xs danger" title="Spread to every neighbour" onClick=${() => k({ type: 'outbreak', country: cid, op: 'spread' })}>Spread</button>
          <button class="btn xs good" onClick=${() => k({ type: 'outbreak', country: cid, op: 'end' })}>End</button></div>`}
        ${c.blackout && html`<div class="row" style="margin-top:6px"><span class="chip">Blackout</span><button class="btn xs good" onClick=${() => k({ type: 'restorePower', country: cid })}>Restore power</button></div>`}

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
          <span class="dim small">${c.name} holds of ${state.countries[other].name}</span>
          ${[0, 25, 50, 75].map(p => html`<button class=${cls('btn xs', (state.countries[other].front?.by === cid ? Math.round(state.countries[other].front.pct) : 0) === p && 'on')} onClick=${() => k({ type: 'setFront', country: other, by: cid, pct: p }, p ? `Front moved to ${p}%` : 'Front cleared')}>${p}%</button>`)}
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

// Civil wars: every faction's stance toward every other, and outside powers backing a side.
const STANCES = [['war', 'War'], ['peace', 'Truce'], ['ally', 'Allied']];
function CivilWars({ conn, state }) {
  const [backer, setBacker] = useState('');
  const seed = state.settings.detail === 'americas' && !Object.values(state.countries).some(f => f.rebelOf === '484')
    ? html`<div class="row"><button class="btn sm gold" onClick=${() => run(conn, { type: 'seedFactions' }, 'Four armed groups rise in Mexico')}>Raise Mexico's armed groups</button></div>` : null;
  const roots = [...new Set(Object.values(state.countries).filter(f => f.rebelOf && state.wars.some(w => w.civil && (w.a === f.id || w.b === f.id))).map(f => f.rebelOf))];
  if (!roots.length) return html`<div class="sub-h">Civil wars</div>${seed}<p class="pane-hint">None yet. Pick a country on the map and use "Start a civil war", then add more factions from the same card.</p>`;
  const stance = (a, b) => state.wars.some(w => (w.a === a && w.b === b) || (w.a === b && w.b === a)) ? 'war' : state.treaties.some(t => t.type === 'alliance' && t.parties.includes(a) && t.parties.includes(b)) ? 'ally' : 'peace';
  return html`<div class="sub-h">Civil wars</div>
    ${roots.map(r => {
      const members = [state.countries[r], ...Object.values(state.countries).filter(f => f.rebelOf === r)];
      const pairs = members.flatMap((A, i) => members.slice(i + 1).map(B => [A, B]));
      return html`<div class="card"><div class="card-b col">
        <b>${state.countries[r].name}</b>
        ${pairs.map(([A, B]) => html`<div class="row small wrap"><span class="grow">${A.name} ↔ ${B.name}</span><div class="seg sm">${STANCES.map(([k, l]) => html`<button class=${stance(A.id, B.id) === k ? 'on' : ''} onClick=${() => run(conn, { type: 'factionStance', a: A.id, b: B.id, stance: k })}>${l}</button>`)}</div></div>`)}
        <div class="row small wrap"><span class="dim">Outside power backs</span>
          <${CountrySelect} state=${state} value=${backer} onChange=${setBacker} />
          ${members.map(m => html`<button class="btn xs" disabled=${!backer} onClick=${() => run(conn, { type: 'civilAssist', country: backer, side: m.id })}>${m.name}</button>`)}
        </div>
      </div></div>`;
    })}`;
}

// A coup, planned ahead: the regime that takes over, its made-up flag, then success or failure.
function CoupBox({ conn, c }) {
  const plan = c.coupPlan || {};
  const [regime, setRegime] = useState(plan.regime || '');
  const [flag, setFlag] = useState(plan.flag || null);
  const save = (r = regime, f = flag) => run(conn, { type: 'setCoupPlan', country: c.id, regime: r, flag: f });
  const reroll = () => { const f = randomFlag(); setFlag(f); save(regime, f); };
  return html`<div class="sub-h">Coup in ${c.name}</div>
    <div class="row"><input class="input sm grow" placeholder=${`New regime, e.g. National Salvation Council`} value=${regime} onInput=${e => setRegime(e.target.value)} onChange=${() => save()} />
      <button class="btn xs" onClick=${reroll} title="Invent a flag for the new regime">🎲 Flag</button>${flag && html`<img src=${altFlagUrl(flag)} alt="" style="height:26px;border-radius:2px;border:1px solid #fff3" />`}</div>
    <div class="row wrap" style="margin-top:6px">
      <button class="btn xs danger" onClick=${async () => { await save(); run(conn, { type: 'coup', country: c.id, outcome: 'success' }, `Coup succeeds in ${c.name}`); }}>Coup succeeds</button>
      <button class="btn xs" onClick=${() => run(conn, { type: 'coup', country: c.id, outcome: 'fail' }, `Coup fails in ${c.name}`)}>Coup fails</button>
      ${c.origName && html`<button class="btn xs good" onClick=${() => run(conn, { type: 'setCoupPlan', country: c.id, regime: c.origName, flag: null }).then(() => run(conn, { type: 'restoreRegime', country: c.id }))}>Restore old regime</button>`}
    </div>`;
}
