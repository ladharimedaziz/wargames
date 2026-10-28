// The right-hand side of the US Zeus panel, like the country inspector of the world committees: the state that was clicked (its
// governor, numbers, status and the units inside it), a unit that was clicked, or the whole nation when nothing is picked.
import { html, useState, useEffect, useMemo, cls, run, toast } from '../lib.js';
import { geoContains } from 'd3-geo';
import { unitLabel, viewFor } from './map.js';
import { effSide, typeOf, menNow, sideName, ROES, SIDE_NAMES, sideColor, simClock, isHostile, hostileKeyOf } from '/shared/engine/usa-sim.js';
import { UNIT_TYPES, TYPE_GROUPS } from '/shared/data/usa-types.js';
import { GovPanel, IncidentCard } from './gov.js';
import { STATES } from '/shared/data/usa-units.js';
import { USA_UNIT_KINDS, SILS, STATE_STATUS, STATE_METRICS, BORDER_SIDES, BORDER_POSTURE, CROSSING_STATUS, CROSSING_LIST, getState, getUnits, crossingState } from '/shared/engine/usa.js';

const Bar = ({ label, value, onChange }) => html`<label class="stat"><div class="row between"><span class="dim small">${label}</span><b>${value}</b></div>
  <input type="range" min="0" max="100" value=${value} onChange=${e => onChange(Number(e.target.value))} class=${cls('us-meter', value < 30 ? 'low' : value < 55 ? 'mid' : 'hi')} /></label>`;

// A unit's card. Governors can be edited: the AI plays them, or a delegate does under their own name and photo.
export function UnitCard({ unit: x, units, act, close, jump, placing, setPlacing }) {
  const gov = x.kind === 'governor', code = x.owner;
  const [name, setName] = useState(x.person || ''), [party, setParty] = useState(x.party || '');
  const [uname, setUname] = useState(x.name), [short, setShort] = useState(x.short || ''), [desc, setDesc] = useState(x.desc || '');
  useEffect(() => { setName(x.person || ''); setParty(x.party || ''); setUname(x.name); setShort(x.short || ''); setDesc(x.desc || ''); }, [x.id, x.person, x.party, x.name, x.short, x.desc]);
  const edit = patch => act({ type: 'usaUnit', id: x.id, ...patch });
  const builtIn = !x.id.startsWith('x-'), moving = placing?.id === x.id;
  const photo = e => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    const img = new Image(), url = URL.createObjectURL(f);
    img.onload = () => {
      // Crop to a centred square and shrink to 96 px so the photo is a few kilobytes.
      const s = Math.min(img.width, img.height), cv = document.createElement('canvas'); cv.width = cv.height = 96;
      cv.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 96, 96);
      URL.revokeObjectURL(url);
      act({ type: 'usaGovernor', state: code, photo: cv.toDataURL('image/jpeg', 0.82) });
    };
    img.onerror = () => toast('That file is not an image.', 'error');
    img.src = url;
  };
  return html`<div class="card"><div class="card-h"><h3>${gov ? (code === 'DC' ? 'Mayor' : 'Governor') : 'Selected'}</h3><button class="btn xs ghost" onClick=${close}>✕</button></div><div class="card-b col">
    <div class="row">${x.photo ? html`<img class="us-photo" src=${x.photo} alt="" />` : x.img ? html`<img class="us-photo flag" src=${`/client/img/us/${x.img}.png`} alt="" onError=${e => { e.target.style.display = 'none'; }} />` : ''}<div><b>${gov ? unitLabel(x) : x.name}</b><div class="dim small">${x.name}</div></div></div>
    <div class="dim small">${x.desc}</div>
    ${gov ? html`
      <div class="row wrap"><button class=${cls('btn sm', x.control !== 'delegate' && 'on')} onClick=${() => act({ type: 'usaGovernor', state: code, control: 'ai' })}>AI plays</button><button class=${cls('btn sm gold', x.control === 'delegate' && 'on')} onClick=${() => act({ type: 'usaGovernor', state: code, control: 'delegate' })}>Delegate plays</button></div>
      <input class="input sm" placeholder="Name" value=${name} disabled=${x.control !== 'delegate'} onInput=${e => setName(e.target.value)} />
      <input class="input sm" placeholder="Party (R, D, I…)" value=${party} disabled=${x.control !== 'delegate'} onInput=${e => setParty(e.target.value)} />
      ${x.control !== 'delegate' && html`<div class="dim small">The real governor is in office. Choose “Delegate plays” to put a student in the seat under their own name.</div>`}
      <div class="row wrap"><button class="btn sm gold" disabled=${x.control !== 'delegate'} onClick=${() => act({ type: 'usaGovernor', state: code, name, party })}>Save name</button>
        <label class=${cls('btn sm', x.control !== 'delegate' && 'disabled')}>Upload photo<input type="file" accept="image/*" disabled=${x.control !== 'delegate'} hidden onChange=${photo} /></label>${x.photo && html`<button class="btn sm ghost" onClick=${() => act({ type: 'usaGovernor', state: code, photo: null })}>Remove photo</button>`}</div>`
      : html`<div class="row wrap"><button class=${cls('btn sm', x.control !== 'delegate' && 'on')} onClick=${() => edit({ control: 'ai' })}>AI plays</button><button class=${cls('btn sm gold', x.control === 'delegate' && 'on')} onClick=${() => edit({ control: 'delegate' })}>Delegate plays</button></div>`}
    <${ForceInfo} x=${x} units=${units} />
    <${OrderBar} ids=${[x.id]} act=${act} placing=${placing} setPlacing=${setPlacing} roe=${x.roe} fixed=${!typeOf(x).speed} />
    ${(x.destroyed || x.strength < 100) && html`<button class="btn sm" onClick=${() => edit({ revive: true })}>Repair and revive</button>`}
    <label class="field small">Side<select class="input sm" value=${x.side} onChange=${e => edit({ side: e.target.value })}><${SideOptions} /></select></label>
    <div class="sub-h">Any unit: Zeus controls it</div>
    <input class="input sm" placeholder="Full name" value=${uname} onInput=${e => setUname(e.target.value)} />
    <input class="input sm" placeholder="Short name on the badge" value=${short} onInput=${e => setShort(e.target.value)} />
    <textarea class="input" rows="2" placeholder="Description" value=${desc} onInput=${e => setDesc(e.target.value)}></textarea>
    <button class="btn sm gold" onClick=${() => edit({ name: uname, short: short || uname, desc })}>Save names</button>
    <label class="row small">Strength <input type="range" min="0" max="100" value=${x.strength} onChange=${e => edit({ strength: e.target.value })} /> <b>${x.strength}%</b></label>
    <select class="input sm" value=${x.sil} onChange=${e => edit({ sil: e.target.value })}>${SILS.map(k => html`<option value=${k}>Picture: ${k}</option>`)}</select>
    <div class="row wrap">
      <button class=${cls('btn sm', moving && 'on')} onClick=${() => setPlacing(moving ? null : { id: x.id })}>${moving ? 'Click the map…' : 'Teleport'}</button>
      <button class="btn sm" onClick=${() => edit({ hidden: !x.hidden })}>${x.hidden ? 'Show' : 'Hide'}</button>
      ${(x.kind === 'guard' || x.kind === 'police') && html`<button class=${cls('btn sm', x.federal && 'on')} onClick=${() => edit({ federal: !x.federal })}>${x.federal ? 'Federalized' : 'Federalize'}</button>`}
      ${builtIn ? html`<button class="btn sm ghost" onClick=${() => act({ type: 'usaUnitReset', id: x.id })}>Reset</button>` : html`<button class="btn sm ghost" onClick=${() => { act({ type: 'usaDeleteUnit', id: x.id }); close(); }}>Delete</button>`}
    </div>
  </div></div>`;
}


// A state: click one on the map. Everything on the card is the Zeus's to change.
export function StateInspector({ u, units, code, data, act, setSel, close, jump }) {
  const st = getState(u, code), gov = units[`gov-${code}`], guard = units[`ng-${code}`];
  const [note, setNote] = useState(st.note);
  useEffect(() => setNote(st.note), [code, st.note]);
  const here = useMemo(() => {
    const f = data?.byState.get(code)?.f; if (!f) return [];
    return Object.values(units).filter(x => x.kind !== 'governor' && !x.hidden && geoContains(f, [x.lon, x.lat]));
  }, [data, code, units]);
  const set = patch => act({ type: 'usaState', state: code, ...patch });
  return html`<div class="pane inspector">
    <div class="insp-head"><div class="grow"><div class="insp-name">${st.name}</div><div class="dim small">${st.capital} · ${st.pop} million people · ${st.ev} electoral votes</div></div>
      <button class="btn xs ghost" onClick=${close}>✕</button></div>
    ${gov && html`<div class="row us-gov" onClick=${() => setSel(gov.id)}>
      ${gov.photo ? html`<img class="us-photo" src=${gov.photo} alt="" />` : html`<img class="us-photo flag" src=${`/client/img/us/${gov.img}.png`} alt="" onError=${e => { e.target.style.display = 'none'; }} />`}
      <div class="grow"><b>${unitLabel(gov)}</b><div class="dim small">${gov.control === 'delegate' ? 'Played by a delegate' : 'Played by the computer'} · click to edit</div></div></div>`}
    <div class="sub-h">Status</div>
    <div class="row wrap">${Object.entries(STATE_STATUS).map(([k, l]) => html`<button class=${cls('btn sm', st.status === k && 'on', k === 'martial' && 'danger')} onClick=${() => set({ status: k })}>${l}</button>`)}</div>
    <div class="sub-h">Numbers</div>
    ${Object.entries(STATE_METRICS).map(([k, l]) => html`<${Bar} label=${l} value=${st[k]} onChange=${v => set({ [k]: v })} />`)}
    <input class="input sm" placeholder="Note on this state" value=${note} maxlength="200" onInput=${e => setNote(e.target.value)} onBlur=${() => note !== st.note && set({ note })} />
    <div class="sub-h">Forces</div>
    <div class="row wrap">
      <button class="btn sm" onClick=${() => jump(viewFor(data, code, 1600, 900))}>Zoom here</button>
      ${guard && html`<button class=${cls('btn sm', guard.federal && 'on')} onClick=${() => act({ type: 'usaFederalize', state: code })}>${guard.federal ? 'Guard federalized' : 'Federalize the Guard'}</button>`}
    </div>
    <div class="sub-h">Units in ${st.name} (${here.length})</div>
    <div class="us-unitlist">${here.length ? here.map(x => html`<button class="us-urow" onClick=${() => setSel(x.id)}><i class="us-sw" style=${`background:${USA_UNIT_KINDS[x.kind]?.color}`}></i><span>${x.name}</span>${x.federal && html`<em>federal</em>`}</button>`) : html`<p class="pane-hint">No units here yet. Place one from the Units tab.</p>`}</div>
  </div>`;
}

// Nothing picked: the nation at a glance.
export function NationOverview({ u, units, act, setSel, setState, setCrossing, placing, setPlacing }) {
  const govs = Object.values(units).filter(x => x.kind === 'governor');
  const parties = {}; for (const g of govs) parties[g.party || '?'] = (parties[g.party || '?'] || 0) + 1;
  const delegates = govs.filter(g => g.control === 'delegate');
  const hot = Object.keys(u.states || {}).map(c => getState(u, c)).filter(x => x.status !== 'normal');
  const fed = Object.values(units).filter(x => x.federal).length;
  return html`<div class="pane inspector">
    <div class="insp-head"><div class="grow"><div class="insp-name">United States</div><div class="dim small">Click a state or a unit on the map.</div></div></div>
    <div class="sub-h">Governors</div>
    <div class="row wrap" style="gap:6px">${Object.entries(parties).map(([p, n]) => html`<span class="chip">${p} ${n}</span>`)}<span class="chip gold">${delegates.length} played by delegates</span></div>
    ${delegates.length > 0 && html`<div class="us-unitlist">${delegates.map(g => html`<button class="us-urow" onClick=${() => { setState(g.owner); setSel(null); }}><i class="us-sw" style="background:#ffd166"></i><span>${g.owner} · ${g.person}</span></button>`)}</div>`}
    <div class="sub-h">States not at normal</div>
    ${hot.length ? html`<div class="us-unitlist">${hot.map(x => html`<button class="us-urow" onClick=${() => { setState(x.code); setSel(null); }}><i class="us-sw" style=${`background:${x.status === 'martial' ? '#ff4a4a' : x.status === 'emergency' ? '#ff9a4a' : '#ffd166'}`}></i><span>${x.name}</span><em>${STATE_STATUS[x.status]}</em></button>`)}</div>` : html`<p class="pane-hint">Every state is at normal.</p>`}
    <div class="sub-h">The border</div>
    ${Object.entries(BORDER_SIDES).map(([side, name]) => html`<div class="us-bside"><div class="row between"><b>${name}</b><span class="dim small">${CROSSING_LIST.filter(c => c.side === side).length} crossings</span></div>
      <div class="row wrap">${Object.entries(BORDER_POSTURE).map(([k, l]) => html`<button class=${cls('btn xs', (u.border?.[side] || 'open') === k && 'on', k === 'closed' && 'danger')} onClick=${() => act({ type: 'usaBorder', side, status: k })}>${l}</button>`)}</div></div>`)}
    <div class="us-unitlist">${CROSSING_LIST.map(c => ({ c, cs: crossingState(u, c.id) })).filter(x => x.cs.status !== 'open').map(({ c, cs }) => html`<button class="us-urow" onClick=${() => setCrossing(c.id)}><i class="us-sw" style=${`background:${cs.status === 'closed' ? '#f87171' : '#fbbf24'}`}></i><span>${c.name}</span><em>${CROSSING_STATUS[cs.status]}</em></button>`)}</div>
    <div class="sub-h">Conflicts</div>
    <${ConflictCard} u=${u} act=${act} />
    <div class="sub-h">Incidents</div>
    <${IncidentCard} act=${act} placing=${placing} setPlacing=${setPlacing} />
    <div class="sub-h">Federal government</div>
    <${GovPanel} u=${u} act=${act} />
    <div class="sub-h">Latest events</div>
    <${EventLog} u=${u} units=${units} setSel=${setSel} />
    <div class="sub-h">Federal forces</div>
    <div class="dim small">${fed} unit${fed === 1 ? '' : 's'} federalized.</div>
    <div class="row wrap"><button class="btn sm" onClick=${() => act({ type: 'usaFederalize', state: 'all', on: true })}>Federalize every Guard</button><button class="btn sm ghost" onClick=${() => act({ type: 'usaFederalize', state: 'all', on: false })}>Release them</button></div>
  </div>`;
}

// A border crossing: open it, slow it or close it, and set how much traffic uses it.
export function CrossingCard({ u, id, act, close }) {
  const cs = crossingState(u, id);
  if (!cs) return null;
  return html`<div class="pane inspector">
    <div class="insp-head"><div class="grow"><div class="insp-name">${cs.name}</div><div class="dim small">${BORDER_SIDES[cs.side]} border · ${cs.size === 3 ? 'major' : cs.size === 2 ? 'busy' : 'smaller'} crossing</div></div><button class="btn xs ghost" onClick=${close}>✕</button></div>
    <div class="sub-h">Status</div>
    <div class="row wrap">${Object.entries(CROSSING_STATUS).map(([k, l]) => html`<button class=${cls('btn sm', cs.own === k && 'on', k === 'closed' && 'danger')} onClick=${() => act({ type: 'usaCrossing', id, status: k })}>${l}</button>`)}</div>
    ${cs.status !== cs.own && html`<div class="dim small">The ${BORDER_SIDES[cs.side]} border is set to “${BORDER_POSTURE[u.border?.[cs.side] || 'open']}”, so this crossing is running as ${CROSSING_STATUS[cs.status].toLowerCase()}.</div>`}
    <label class="stat"><div class="row between"><span class="dim small">Traffic</span><b>${cs.traffic}</b></div><input type="range" min="0" max="100" value=${cs.traffic} onChange=${e => act({ type: 'usaCrossing', id, traffic: Number(e.target.value) })} class="us-meter hi" /></label>
    <div class="dim small">${cs.wait == null ? 'Closed: nothing crosses.' : `About ${cs.wait} minutes to cross.`}</div>
    <div class="dim small">Cars and trucks drive through and fade out after crossing; those arriving fade in. White vehicles are entering the US, amber ones leaving.</div>
  </div>`;
}

// Every side a unit can be on, for a select.
export function SideOptions() {
  return html`<optgroup label="Sides">${Object.entries(SIDE_NAMES).map(([k, l]) => html`<option value=${k}>${l}</option>`)}</optgroup>
    <optgroup label="State forces">${STATES.map(r => html`<option value=${`st:${r[0]}`}>${r[1]} forces</option>`)}</optgroup>`;
}

// What a unit is, how strong it is and what it is doing now.
function ForceInfo({ x, units }) {
  const ty = typeOf(x), tg = x.eng && units?.[x.eng], o = x.order, to = o?.target && units?.[o.target];
  const doing = x.destroyed ? 'Destroyed' : x.routed ? 'Routing back to base' : !o ? (ty.speed ? 'Holding position' : 'Fixed in place') : o.type === 'move' ? 'Moving' : o.type === 'return' ? 'Falling back' : o.type === 'patrol' ? 'On patrol' : o.type === 'attack' ? `Attacking ${to?.short || to?.name || 'a target'}` : `Escorting ${to?.short || to?.name || 'a unit'}`;
  return html`<div class="us-force">
    <div class="row between"><b>${ty.name}</b><span class="chip" style=${`border-color:${sideColor(effSide(x))};color:${sideColor(effSide(x))}`}>${sideName(effSide(x))}${x.federal ? ' · federalized' : ''}</span></div>
    <div class="dim small">${menNow(x).toLocaleString('en-US')} of ${ty.men.toLocaleString('en-US')} people · ${ty.speed ? `${ty.speed} km/h` : 'does not move'} · range ${ty.range} km</div>
    <div class="dim small">Hits ground ${ty.atk.ground} · air ${ty.atk.air} · sea ${ty.atk.sea} · toughness ${ty.def}</div>
    <div class="dim small"><b>${doing}</b>${tg ? ` · firing at ${tg.short || tg.name}` : ''}</div>
  </div>`;
}

// RTS orders for one or many units. Move and patrol wait for a click on the map; attack and escort wait for a click on a unit.
export function OrderBar({ ids, act, placing, setPlacing, roe, fixed }) {
  const arm = (order, pickTarget) => setPlacing(placing?.order === order ? null : { order, pickTarget });
  const btn = (order, label, pick) => html`<button class=${cls('btn sm', placing?.order === order && 'on', order === 'attack' && 'danger')} disabled=${fixed} onClick=${() => arm(order, pick)}>${placing?.order === order ? (pick ? 'Click a unit…' : 'Click the map…') : label}</button>`;
  return html`<div class="sub-h">Orders</div>
    <div class="row wrap">${btn('move', 'Move')}${btn('patrol', 'Patrol')}${btn('attack', 'Attack', true)}${btn('escort', 'Escort', true)}<button class="btn sm" onClick=${() => { setPlacing(null); act({ type: 'usaOrder', ids, order: { type: 'hold' } }); }}>Hold</button></div>
    <div class="row wrap">${Object.entries(ROES).map(([k, l]) => html`<button class=${cls('btn xs', roe === k && 'on')} onClick=${() => act({ type: 'usaRoe', ids, roe: k })}>${l}</button>`)}</div>
    <div class="dim small">Right-click the map to send the picked units there; right-click an enemy to attack, a friend to escort. Shift-click or Shift-drag picks more units.</div>`;
}

// Several units picked together.
export function GroupCard({ ids, units, act, placing, setPlacing, close, setSelIds }) {
  const list = ids.map(i => units[i]).filter(Boolean), men = list.reduce((n, x) => n + menNow(x), 0);
  const avg = Math.round(list.reduce((n, x) => n + x.strength, 0) / Math.max(1, list.length));
  const byType = {}; for (const x of list) byType[typeOf(x).name] = (byType[typeOf(x).name] || 0) + 1;
  return html`<div class="pane inspector">
    <div class="insp-head"><div class="grow"><div class="insp-name">${list.length} units picked</div><div class="dim small">${men.toLocaleString('en-US')} people · average strength ${avg}%</div></div><button class="btn xs ghost" onClick=${close}>✕</button></div>
    <div class="row wrap" style="gap:4px">${Object.entries(byType).map(([n, c]) => html`<span class="chip">${c} × ${n}</span>`)}</div>
    <${OrderBar} ids=${ids} act=${act} placing=${placing} setPlacing=${setPlacing} />
    <div class="us-unitlist">${list.map(x => html`<button class="us-urow" onClick=${() => setSelIds([x.id])}><i class="us-sw" style=${`background:${sideColor(effSide(x))}`}></i><span>${x.name}</span><em>${x.strength}%</em></button>`)}</div>
  </div>`;
}

// Sides at war: units only fight units of a side they are at war with.
function ConflictCard({ u, act }) {
  const [a, setA] = useState('fed'), [b, setB] = useState('mil');
  const war = isHostile(u, a, b), pairs = (u.hostile || []).map(k => k.split('|'));
  const name = side => sideName(side, c => STATES.find(r => r[0] === c)?.[1] || c);
  return html`<div class="us-bside">
    <div class="row wrap"><select class="input sm grow" value=${a} onChange=${e => setA(e.target.value)}><${SideOptions} /></select><span class="dim">vs</span><select class="input sm grow" value=${b} onChange=${e => setB(e.target.value)}><${SideOptions} /></select></div>
    <button class=${cls('btn sm', !war && 'danger')} disabled=${a === b} onClick=${() => act({ type: 'usaHostile', a, b, on: !war })}>${war ? 'Make peace' : 'Declare war'}</button>
    ${pairs.length ? pairs.map(([x, y]) => html`<div class="row between small"><span>${name(x)} ⚔ ${name(y)}</span><button class="btn xs ghost" onClick=${() => act({ type: 'usaHostile', a: x, b: y, on: false })}>Peace</button></div>`) : html`<div class="dim small">Nobody is at war.</div>`}
  </div>`;
}

function EventLog({ u, units, setSel }) {
  const list = (u.events || []).slice(-14).reverse();
  if (!list.length) return html`<p class="pane-hint">Nothing has happened yet. Start the clock and give some orders.</p>`;
  return html`<div class="us-unitlist">${list.map(e => html`<button class=${cls('us-urow', e.kind)} disabled=${!e.id || !units[e.id]} onClick=${() => e.id && units[e.id] && setSel(e.id)}><span class="mono dim small">${simClock(e.t).replace('Day ', 'D')}</span><span>${e.text}</span></button>`)}</div>`;
}
