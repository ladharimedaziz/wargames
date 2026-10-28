// Zeus control for the continental US committee: steer the map the stage shows and switch its layers.
import { html, useState, useEffect, useRef, run, useMemo, cls } from '../lib.js';
import { TimerControls } from '../world/display-tab.js';
import { DMDrawer, useUnread } from '../views/dm.js';
import { UsMap, loadUsa, viewFor } from './map.js';
import { USA_VIEW, USA_DOTS, LIGHT_SERVICES, LIGHT_PALETTE, LIGHT_PATTERNS, lightColors } from '/shared/engine/usa.js';

const LAYERS = [['states', 'State borders'], ['counties', 'County borders'], ['cities', 'City borders'], ['highways', 'Highways'], ['labels', 'Names']];

export function UsaPanel({ conn, user, state, committee, logout, onBack }) {
  const u = state.usa, kronos = user.role === 'kronos';
  const [dmOpen, setDmOpen] = useState(false);
  const unread = useUnread(conn, committee, dmOpen, kronos);
  const act = a => run(conn, a);
  const [status, setStatus] = useState(conn.status);
  useEffect(() => { setStatus(conn.status); return conn.on('status', setStatus); }, [conn]);
  const [data, setData] = useState(null);
  useEffect(() => { loadUsa().then(setData); }, []);

  // The Zeus drags the map locally; with "Live to stage" on, the view is sent on (at most ten times a second).
  const [view, setView] = useState(u.view);
  const [live, setLive] = useState(true);
  const sent = useRef(0), timer = useRef();
  const send = v => {
    clearTimeout(timer.current);
    const wait = Math.max(0, 100 - (Date.now() - sent.current));
    timer.current = setTimeout(() => { sent.current = Date.now(); conn.act({ type: 'usaSetView', ...v }); }, wait);
  };
  const onView = v => { setView(v); if (live) send(v); };
  const jump = v => { setView(v); if (live) send(v); };
  const [marking, setMarking] = useState(false);
  const onPick = id => {
    if (!marking) { if (data) jump(viewFor(data, id, 1600, 900)); return; }
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
          <div class="card"><div class="card-h"><h3>Map</h3></div><div class="card-b col">
            ${LAYERS.map(([k, l]) => html`<label class="row"><input type="checkbox" checked=${u.layers[k]} onChange=${() => act({ type: 'usaLayer', layer: k })} /> ${l}</label>`)}
            <hr class="sep" />
            <div class="sub-h">Dots</div>
            ${Object.entries(USA_DOTS).map(([k, d]) => html`<label class="row"><input type="checkbox" checked=${!!u.layers[k]} onChange=${() => act({ type: 'usaLayer', layer: k })} /><i class="us-sw" style=${`background:${d.color}`}></i> ${d.name}</label>`)}
            <hr class="sep" />
            <label class="row"><input type="checkbox" checked=${live} onChange=${e => { setLive(e.target.checked); if (e.target.checked) send(view); }} /> Live to stage</label>
            <div class="dim small">Drag to move, scroll to zoom, click a state to zoom to it.</div>
            <select class="input sm" value="" onChange=${e => e.target.value && jump(viewFor(data, e.target.value, 1600, 900))}><option value="">Zoom to a state…</option>${states.map(s => html`<option value=${s.id}>${s.name}</option>`)}</select>
            <div class="row wrap"><button class="btn sm" onClick=${() => jump({ ...USA_VIEW })}>Whole country</button>${!live && html`<button class="btn sm gold" onClick=${() => send(view)}>Show on stage</button>`}</div>
          </div></div>
          <${Lightbars} u=${u} data=${data} states=${states} act=${act} />
          <div class="card"><div class="card-h"><h3>Mark states</h3></div><div class="card-b col">
            <button class=${cls('btn sm', marking && 'on')} onClick=${() => setMarking(!marking)}>${marking ? 'Clicking marks states' : 'Click to mark states'}</button>
            <div class="dim small">${u.highlight.length ? u.highlight.join(', ') : 'Nothing marked.'}</div>
            ${u.highlight.length > 0 && html`<button class="btn sm ghost" onClick=${() => act({ type: 'usaHighlight', states: [] })}>Clear marks</button>`}
          </div></div>
          <div class="card"><div class="card-h"><h3>Stage</h3></div><div class="card-b col">
            <input class="input sm" placeholder="Title" value=${topic.title} onInput=${e => setTopic({ ...topic, title: e.target.value })} />
            <input class="input sm" placeholder="Subtitle" value=${topic.subtitle} onInput=${e => setTopic({ ...topic, subtitle: e.target.value })} />
            <textarea class="input" rows="2" placeholder="Note on screen (leave empty for none)" value=${topic.note} onInput=${e => setTopic({ ...topic, note: e.target.value })}></textarea>
            <button class="btn sm gold" onClick=${() => act({ type: 'usaSetTopic', ...topic })}>Update stage</button>
            <div class="row wrap">${[['usa', 'Map'], ['blank', 'Standby']].map(([k, l]) => html`<button class=${cls('btn sm', state.display.scene === k && 'on')} onClick=${() => act({ type: 'setScene', scene: k })}>${l}</button>`)}</div>
          </div></div>
          <${TimerControls} conn=${conn} state=${state} />
        </aside>
        <div class="us-mapbox"><${UsMap} usa=${u} view=${view} interactive=${true} onView=${onView} onPick=${onPick} /><div class="us-readout mono">zoom ${view.k.toFixed(1)}×</div></div>
      </div>
      <${DMDrawer} conn=${conn} committee=${committee} open=${dmOpen} onClose=${() => setDmOpen(false)} kronos=${kronos} name=${state.name} />
    </div>`;
}

// Emergency lightbars: switch them on per service, pick the flash pattern, and set the colours for a state or one county.
function Lightbars({ u, data, states, act }) {
  const [scope, setScope] = useState(''), [county, setCounty] = useState(''), [svc, setSvc] = useState('police');
  const counties = useMemo(() => (data && scope ? data.counties.filter(c => c.state === scope).sort((a, b) => a.name.localeCompare(b.name)) : []), [data, scope]);
  const id = county || scope, st = scope;
  const cur = id ? lightColors(u, svc, st, county || '') : null;
  const set = colors => act({ type: 'usaLightColors', id, service: svc, colors });
  const swatch = c => html`<i class="us-sw big" style=${`background:${c}`}></i>`;
  return html`<div class="card"><div class="card-h"><h3>Lightbars</h3></div><div class="card-b col">
    ${Object.entries(LIGHT_SERVICES).map(([k, l]) => html`<label class="row"><input type="checkbox" checked=${!!u.lightbars[k]} onChange=${() => act({ type: 'usaLightbars', service: k })} /> ${l}</label>`)}
    <div class="row wrap"><button class="btn sm" onClick=${() => act({ type: 'usaLightbars', service: 'all', on: true })}>All on</button><button class="btn sm ghost" onClick=${() => act({ type: 'usaLightbars', service: 'all', on: false })}>All off</button></div>
    <select class="input sm" value=${u.lightPattern} onChange=${e => act({ type: 'usaLightPattern', pattern: e.target.value })}><option value="mixed">Pattern: mixed</option>${Object.entries(LIGHT_PATTERNS).map(([k, p]) => html`<option value=${k}>${p.name}</option>`)}</select>
    <div class="dim small">Lightbars show from about 3× zoom. Starting colours are police red and blue, fire and EMS red and white; set the real ones below.</div>
    <hr class="sep" />
    <div class="sub-h">Colours for a place</div>
    <select class="input sm" value=${scope} onChange=${e => { setScope(e.target.value); setCounty(''); }}><option value="">Choose a state…</option>${states.map(s => html`<option value=${s.id}>${s.name}</option>`)}</select>
    ${scope && html`<select class="input sm" value=${county} onChange=${e => setCounty(e.target.value)}><option value="">Whole state</option>${counties.map(c => html`<option value=${c.id}>${c.name}</option>`)}</select>
      <div class="row wrap">${Object.entries(LIGHT_SERVICES).map(([k, l]) => html`<button class=${cls('btn sm', svc === k && 'on')} onClick=${() => setSvc(k)}>${l}</button>`)}</div>
      <div class="row">${cur.map(swatch)}<span class="dim small">${u.lightColors[`${id}:${svc}`] ? 'set by you' : 'starting colours'}</span></div>
      <div class="dim small">Pick one to three colours in order:</div>
      <${ColorPick} onSet=${set} />
      ${u.lightColors[`${id}:${svc}`] && html`<button class="btn sm ghost" onClick=${() => set(null)}>Clear this setting</button>`}`}
  </div></div>`;
}

function ColorPick({ onSet }) {
  const [picked, setPicked] = useState([]);
  return html`<div class="col"><div class="row wrap">${Object.entries(LIGHT_PALETTE).map(([k, c]) => html`<button class="btn sm" disabled=${picked.length >= 3} onClick=${() => setPicked([...picked, c])}><i class="us-sw" style=${`background:${c}`}></i> ${k}</button>`)}</div>
    <div class="row">${picked.map(c => html`<i class="us-sw big" style=${`background:${c}`}></i>`)}<span class="dim small">${picked.length ? '' : 'nothing picked'}</span></div>
    <div class="row wrap"><button class="btn sm gold" disabled=${!picked.length} onClick=${() => { onSet(picked); setPicked([]); }}>Set colours</button><button class="btn sm ghost" disabled=${!picked.length} onClick=${() => setPicked([])}>Reset pick</button></div></div>`;
}
