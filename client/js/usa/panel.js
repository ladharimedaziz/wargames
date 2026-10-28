// Zeus control for the continental US committee: steer the map the stage shows and switch its layers.
import { html, useState, useEffect, useRef, run, useMemo, cls, toast } from '../lib.js';
import { TimerControls } from '../world/display-tab.js';
import { DMDrawer, useUnread } from '../views/dm.js';
import { UnitCard, StateInspector, NationOverview, CrossingCard, GroupCard, SideOptions } from './inspector.js';
import { UNIT_TYPES, TYPE_GROUPS } from '/shared/data/usa-types.js';
import { effSide, simClock, simSeconds, SIM_SPEEDS } from '/shared/engine/usa-sim.js';
import { UsMap, loadUsa, viewFor, unitLabel } from './map.js';
import { USA_VIEW, USA_UNIT_KINDS, UNIT_LAYERS, LIGHT_SERVICES, LIGHT_PALETTE, LIGHT_PATTERNS, lightColors, getUnits, SILS } from '/shared/engine/usa.js';

const LAYERS = [['states', 'State borders'], ['cities', 'City borders'], ['highways', 'Highways'], ['labels', 'Names'], ['neighbors', 'Canada and Mexico'], ['border', 'Border crossings']];

export function UsaPanel({ conn, user, state, committee, logout, onBack }) {
  const u = state.usa, kronos = user.role === 'kronos';
  const [dmOpen, setDmOpen] = useState(false);
  const unread = useUnread(conn, committee, dmOpen, kronos);
  const act = a => run(conn, a);
  const [status, setStatus] = useState(conn.status);
  useEffect(() => { setStatus(conn.status); return conn.on('status', setStatus); }, [conn]);
  const [data, setData] = useState(null);
  useEffect(() => { loadUsa().then(setData); }, []);

  // The Zeus's map is their own: dragging or zooming it never moves the stage. "Show on stage" sends the view across, or the stage
  // frames the action by itself.
  const [view, setView] = useState(u.view);
  const send = v => conn.act({ type: 'usaSetView', ...v });
  const onView = v => setView(v);
  const jump = v => setView(v);
  const [marking, setMarking] = useState(false);
  const [tab, setTab] = useState('map'), [selState, setSelState] = useState(null), [selX, setSelX] = useState(null);
  const [selIds, setSelIds] = useState([]), [placing, setPlacing] = useState(null); // placing: {id} teleports a unit, {incident} sets one off where you click, {spawn} makes one, {order} gives the picked units an order
  const sel = selIds.length === 1 ? selIds[0] : null, setSel = id => setSelIds(id ? [id] : []);
  const units = useMemo(() => getUnits(u), [u.mods, u.custom]);
  const pickUnit = (id, add) => {
    if (id.startsWith('bx-')) { setSelX(id); setSelIds([]); return; }
    if (placing?.pickTarget && selIds.length && !selIds.includes(id)) { act({ type: 'usaOrder', ids: selIds, order: { type: placing.order, target: id } }); setPlacing(null); return; }
    setSelX(null);
    if (add) { setSelIds(ids => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])); return; }
    setSelIds([id]); const x = units[id]; if (x && x.owner?.length === 2) setSelState(x.owner);
  };
  const onBox = ids => { setSelX(null); setSelIds(ids.filter(id => units[id])); };
  // Right-click: an enemy is attacked, a friend escorted, open ground is where the picked units go.
  const onOrder = ({ lon, lat, target }) => {
    if (!selIds.length) return;
    const t = target && units[target], first = units[selIds[0]];
    if (t && !selIds.includes(target)) act({ type: 'usaOrder', ids: selIds, order: { type: first && effSide(first) !== effSide(t) ? 'attack' : 'escort', target } });
    else if (!t) act({ type: 'usaOrder', ids: selIds, order: { type: 'move', to: [lon, lat] } });
  };
  // Esc drops whatever is armed (a placement or an order) and clears the pick.
  useEffect(() => {
    const k = e => { if (e.key === 'Escape' && !/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) setPlacing(null); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, []);
  const onPlace = (lon, lat) => {
    const p = placing; if (!p) return;
    if (p.incident) { setPlacing(null); act({ type: 'usaIncident', kind: p.incident, lon, lat }); return; }
    if (p.order) { setPlacing(null); act({ type: 'usaOrder', ids: selIds, order: { type: p.order, to: [lon, lat] } }); return; }
    if (p.id) { setPlacing(null); act({ type: 'usaUnit', id: p.id, lon, lat }); return; }
    if (!p.keep) setPlacing(null);
    act({ type: 'usaSpawn', ...p.spawn, lon, lat }).then(r => { if (!p.keep && r.result?.id) setSel(r.result.id); });
  };
  const onPick = id => {
    if (placing?.order && !placing.pickTarget) return;
    if (!marking) { setSelState(id); setSelIds([]); setSelX(null); return; }
    act({ type: 'usaHighlight', states: u.highlight.includes(id) ? u.highlight.filter(x => x !== id) : [...u.highlight, id] });
  };
  const states = useMemo(() => (data ? [...data.states].sort((a, b) => a.name.localeCompare(b.name)) : []), [data]);
  const [topic, setTopic] = useState({ title: u.title, subtitle: u.subtitle, note: u.note });
  useEffect(() => setTopic({ title: u.title, subtitle: u.subtitle, note: u.note }), [u.title, u.subtitle, u.note]);

  return html`
    <div class=${cls('shell court-shell council-shell', kronos && 'is-kronos')} style=${`--cn:${u.accent}`}>
      <header class="topbar">
        ${onBack && html`<button class="btn sm ghost" onClick=${onBack}>← All committees</button>`}
        <div class="brand"><span class="brand-orb gold"></span><span class="brand-name">WORLD ENGINE</span></div>
        <div class="tb-committee"><div class="tb-name">${state.name}</div><div class=${cls('chip', kronos ? 'gold' : 'cyan')}>${kronos ? 'Kronos' : 'Back Room Zeus'}</div></div>
        <div class="grow"></div>
        <button class="btn sm" onClick=${() => window.open(`/display?c=${committee}`, `display-${committee}`, 'width=1280,height=720')}>▣ Stage display</button>
        <button class=${cls('btn sm', unread && 'gold')} onClick=${() => setDmOpen(true)}>✉ ${kronos ? 'Zeus chat' : 'Kronos'}${unread ? html` <i class="badge inline">${unread}</i>` : ''}</button>
        <span class=${cls('conn', status)}><i class=${cls('dot', status === 'live' && 'live')}></i></span>
        ${!onBack && html`<button class="btn sm ghost" onClick=${logout}>⎋</button>`}
      </header>
      <div class="us-body">
        <aside class="us-side">
          <nav class="us-tabs">${[['map', 'Map'], ['units', 'Units'], ['stage', 'Stage']].map(([k, l]) => html`<button class=${cls('btn sm', tab === k && 'on')} onClick=${() => setTab(k)}>${l}</button>`)}</nav>
          ${tab === 'map' && html`<div class="card"><div class="card-h"><h3>Map</h3></div><div class="card-b col">
            ${LAYERS.map(([k, l]) => html`<label class="row"><input type="checkbox" checked=${u.layers[k]} onChange=${() => act({ type: 'usaLayer', layer: k })} /> ${l}</label>`)}
            <hr class="sep" />
            <div class="dim small">Drag to move, scroll to zoom, click a state for its card. This map is yours: the stage does not follow it.</div>
            <select class="input sm" value="" onChange=${e => e.target.value && jump(viewFor(data, e.target.value, 1600, 900))}><option value="">Zoom to a state…</option>${states.map(s => html`<option value=${s.id}>${s.name}</option>`)}</select>
            <div class="row wrap"><button class="btn sm" onClick=${() => jump({ ...USA_VIEW })}>Whole country</button><button class="btn sm gold" onClick=${() => send(view)}>Show this on stage</button></div>
            <div class="row wrap"><button class="btn sm" onClick=${() => send({ ...USA_VIEW })}>Whole country on stage</button><button class=${cls('btn sm', u.stageAuto && 'on')} onClick=${() => act({ type: 'usaStageAuto' })}>${u.stageAuto ? 'Stage frames the action' : 'Frame the action'}</button></div>
          </div></div>
          <${Lightbars} u=${u} states=${states} act=${act} />
          <div class="card"><div class="card-h"><h3>Mark states</h3></div><div class="card-b col">
            <button class=${cls('btn sm', marking && 'on')} onClick=${() => setMarking(!marking)}>${marking ? 'Clicking marks states' : 'Click to mark states'}</button>
            <div class="dim small">${u.highlight.length ? u.highlight.join(', ') : 'Nothing marked.'}</div>
            ${u.highlight.length > 0 && html`<button class="btn sm ghost" onClick=${() => act({ type: 'usaHighlight', states: [] })}>Clear marks</button>`}
          </div></div>`}
          ${tab === 'units' && html`<div class="card"><div class="card-h"><h3>Units</h3></div><div class="card-b col">
            ${Object.entries(UNIT_LAYERS).map(([k, l]) => html`<label class="row"><input type="checkbox" checked=${!!u.layers[k]} onChange=${() => act({ type: 'usaLayer', layer: k })} /> ${l}</label>`)}
            <div class="dim small">Every unit is a dot with a badge above it. Click one to see it on the right.</div>
            <select class="input sm" value="" onChange=${e => e.target.value && pickUnit(e.target.value)}><option value="">Find a governor…</option>${Object.values(units).filter(x => x.kind === 'governor').sort((a, b) => a.owner.localeCompare(b.owner)).map(x => html`<option value=${x.id}>${x.owner} · ${x.person}${x.control === 'delegate' ? ' (delegate)' : ''}</option>`)}</select>
          </div></div>
          <${SpawnCard} placing=${placing} setPlacing=${setPlacing} count=${Object.keys(u.custom || {}).length} act=${act} states=${states} />`}
          ${tab === 'stage' && html`<div class="card"><div class="card-h"><h3>Stage</h3></div><div class="card-b col">
            <input class="input sm" placeholder="Title" value=${topic.title} onInput=${e => setTopic({ ...topic, title: e.target.value })} />
            <input class="input sm" placeholder="Subtitle" value=${topic.subtitle} onInput=${e => setTopic({ ...topic, subtitle: e.target.value })} />
            <textarea class="input" rows="2" placeholder="Note on screen (leave empty for none)" value=${topic.note} onInput=${e => setTopic({ ...topic, note: e.target.value })}></textarea>
            <button class="btn sm gold" onClick=${() => act({ type: 'usaSetTopic', ...topic })}>Update stage</button>
            <div class="row wrap">${[['usa', 'Map'], ['blank', 'Standby']].map(([k, l]) => html`<button class=${cls('btn sm', state.display.scene === k && 'on')} onClick=${() => act({ type: 'setScene', scene: k })}>${l}</button>`)}</div>
          </div></div>
          <${TimerControls} conn=${conn} state=${state} />`}
        </aside>
        <div class="us-mapbox"><${UsMap} usa=${u} view=${view} interactive=${true} onView=${onView} onPick=${onPick} onPickUnit=${pickUnit} onPlace=${placing && !placing.pickTarget ? onPlace : null} selectedUnit=${sel} selectedUnits=${selIds} selectedState=${selState} selectedCrossing=${selX} onBox=${onBox} onOrder=${onOrder} /><${SimBar} u=${u} act=${act} /><div class="us-readout mono">zoom ${view.k.toFixed(1)}×</div></div>
        <aside class="us-right">
          ${selX ? html`<${CrossingCard} u=${u} id=${selX} act=${act} close=${() => setSelX(null)} />`
            : selIds.length > 1 ? html`<${GroupCard} ids=${selIds} units=${units} act=${act} placing=${placing} setPlacing=${setPlacing} close=${() => setSelIds([])} setSelIds=${setSelIds} />`
            : sel && units[sel] ? html`<${UnitCard} unit=${units[sel]} units=${units} act=${act} placing=${placing} setPlacing=${setPlacing} close=${() => setSel(null)} jump=${v => jump(v)} />`
            : selState ? html`<${StateInspector} u=${u} units=${units} code=${selState} data=${data} act=${act} setSel=${setSel} placing=${placing} close=${() => setSelState(null)} jump=${jump} />`
            : html`<${NationOverview} u=${u} units=${units} act=${act} placing=${placing} setPlacing=${setPlacing} setSel=${setSel} setState=${setSelState} setCrossing=${setSelX} />`}
        </aside>
      </div>
      <${DMDrawer} conn=${conn} committee=${committee} open=${dmOpen} onClose=${() => setDmOpen(false)} kronos=${kronos} name=${state.name} />
    </div>`;
}

// Emergency lightbars: switch them on per service, pick the flash pattern, and set the colours for a state or one county.
function Lightbars({ u, states, act }) {
  const [scope, setScope] = useState(''), [svc, setSvc] = useState('police');
  const cur = scope ? lightColors(u, svc, scope) : null;
  const set = colors => act({ type: 'usaLightColors', id: scope, service: svc, colors });
  const swatch = c => html`<i class="us-sw big" style=${`background:${c}`}></i>`;
  return html`<div class="card"><div class="card-h"><h3>Lightbars</h3></div><div class="card-b col">
    ${Object.entries(LIGHT_SERVICES).map(([k, l]) => html`<label class="row"><input type="checkbox" checked=${!!u.lightbars[k]} onChange=${() => act({ type: 'usaLightbars', service: k })} /> ${l}</label>`)}
    <div class="row wrap"><button class="btn sm" onClick=${() => act({ type: 'usaLightbars', service: 'all', on: true })}>All on</button><button class="btn sm ghost" onClick=${() => act({ type: 'usaLightbars', service: 'all', on: false })}>All off</button></div>
    <select class="input sm" value=${u.lightPattern} onChange=${e => act({ type: 'usaLightPattern', pattern: e.target.value })}><option value="mixed">Pattern: mixed</option>${Object.entries(LIGHT_PATTERNS).map(([k, p]) => html`<option value=${k}>${p.name}</option>`)}</select>
    <div class="dim small">Police, fire and EMS units flash when their lights are on. Starting colours are police red and blue, fire and EMS red and white; set the real ones for a state below.</div>
    <hr class="sep" />
    <div class="sub-h">Colours for a state</div>
    <select class="input sm" value=${scope} onChange=${e => setScope(e.target.value)}><option value="">Choose a state…</option>${states.map(s => html`<option value=${s.id}>${s.name}</option>`)}</select>
    ${scope && html`<div class="row wrap">${Object.entries(LIGHT_SERVICES).map(([k, l]) => html`<button class=${cls('btn sm', svc === k && 'on')} onClick=${() => setSvc(k)}>${l}</button>`)}</div>
      <div class="row">${cur.map(swatch)}<span class="dim small">${u.lightColors[`${scope}:${svc}`] ? 'set by you' : 'starting colours'}</span></div>
      <div class="dim small">Pick one to three colours in order:</div>
      <${ColorPick} onSet=${set} />
      ${u.lightColors[`${scope}:${svc}`] && html`<button class="btn sm ghost" onClick=${() => set(null)}>Clear this setting</button>`}`}
  </div></div>`;
}

function ColorPick({ onSet }) {
  const [picked, setPicked] = useState([]);
  return html`<div class="col"><div class="row wrap">${Object.entries(LIGHT_PALETTE).map(([k, c]) => html`<button class="btn sm" disabled=${picked.length >= 3} onClick=${() => setPicked([...picked, c])}><i class="us-sw" style=${`background:${c}`}></i> ${k}</button>`)}</div>
    <div class="row">${picked.map(c => html`<i class="us-sw big" style=${`background:${c}`}></i>`)}<span class="dim small">${picked.length ? '' : 'nothing picked'}</span></div>
    <div class="row wrap"><button class="btn sm gold" disabled=${!picked.length} onClick=${() => { onSet(picked); setPicked([]); }}>Set colours</button><button class="btn sm ghost" disabled=${!picked.length} onClick=${() => setPicked([])}>Reset pick</button></div></div>`;
}

// The game clock on the map: play or pause, how fast, and the date and time in the committee.
function SimBar({ u, act }) {
  const sim = u.sim || { running: false, speed: 60, t: 0 }, at = useRef(Date.now()), [, tick] = useState(0);
  useEffect(() => { at.current = Date.now(); }, [u.sim?.t, u.sim?.running, u.sim?.speed]);
  useEffect(() => { if (!sim.running) return; const i = setInterval(() => tick(n => n + 1), 500); return () => clearInterval(i); }, [sim.running]);
  return html`<div class="us-sim">
    <button class=${cls('btn sm', sim.running ? 'danger' : 'gold')} onClick=${() => act({ type: 'usaSim', running: !sim.running })}>${sim.running ? '⏸ Pause' : '▶ Start'}</button>
    <b class="mono">${simClock(simSeconds(u, Date.now() - at.current))}</b>
    <div class="row">${SIM_SPEEDS.map(v => html`<button class=${cls('btn xs', sim.speed === v && 'on')} onClick=${() => act({ type: 'usaSim', speed: v })} title=${`${v} game seconds per second`}>×${v}</button>`)}</div>
  </div>`;
}

// Bring in units: pick a kind, a side, and click the map (or send it to a state capital).
function SpawnCard({ placing, setPlacing, count, act, states }) {
  const [f, setF] = useState({ utype: 'ng_bct', name: '', side: 'fed', strength: 100, keep: true, state: 'TX' });
  const arming = placing?.spawn;
  const ty = UNIT_TYPES[f.utype], spawn = { utype: f.utype, name: f.name.trim() || undefined, side: f.side, strength: Number(f.strength) };
  return html`<div class="card"><div class="card-h"><h3>New unit</h3></div><div class="card-b col">
    <select class="input sm" value=${f.utype} onChange=${e => setF({ ...f, utype: e.target.value, side: UNIT_TYPES[e.target.value].group === 'National Guard' ? `st:${f.state}` : f.side })}>
      ${TYPE_GROUPS.map(g => html`<optgroup label=${g}>${Object.values(UNIT_TYPES).filter(t => t.group === g).map(t => html`<option value=${t.id}>${t.name}</option>`)}</optgroup>`)}</select>
    <div class="dim small">${ty.desc} ${ty.men.toLocaleString('en-US')} people${ty.speed ? `, ${ty.speed} km/h` : ''}.</div>
    <input class="input sm" placeholder=${`Name (default: ${ty.name})`} value=${f.name} onInput=${e => setF({ ...f, name: e.target.value })} />
    <select class="input sm" value=${f.side} onChange=${e => setF({ ...f, side: e.target.value })}><${SideOptions} /></select>
    <label class="row small">Strength <input type="range" min="0" max="100" value=${f.strength} onInput=${e => setF({ ...f, strength: e.target.value })} /> <b>${f.strength}%</b></label>
    <label class="row small"><input type="checkbox" checked=${f.keep} onChange=${e => setF({ ...f, keep: e.target.checked })} /> Keep placing (press Esc to stop)</label>
    <button class=${cls('btn sm gold', arming && 'on')} onClick=${() => setPlacing(arming ? null : { spawn, keep: f.keep })}>${arming ? 'Click the map to place it…' : 'Place on the map'}</button>
    <div class="row wrap"><select class="input sm grow" value=${f.state} onChange=${e => setF({ ...f, state: e.target.value })}>${states.map(s => html`<option value=${s.id}>${s.name}</option>`)}</select>
      <button class="btn sm" onClick=${() => act({ type: 'usaSpawn', ...spawn, at: 'capital', state: f.state })}>At the capital</button></div>
    <div class="row wrap"><button class="btn sm" onClick=${() => act({ type: 'usaFederalize', state: 'all', on: true })}>Federalize every Guard</button><button class="btn sm ghost" onClick=${() => act({ type: 'usaFederalize', state: 'all', on: false })}>Release them</button></div>
    <div class="dim small">${count} unit${count === 1 ? '' : 's'} made by you. Click a dot to see it; Shift-drag on the map picks many.</div>
  </div></div>`;
}
