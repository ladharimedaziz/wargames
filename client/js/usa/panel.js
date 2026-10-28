// Zeus control for the continental US committee: steer the map the stage shows and switch its layers.
import { html, useState, useEffect, useRef, run, useMemo, cls, toast } from '../lib.js';
import { TimerControls } from '../world/display-tab.js';
import { DMDrawer, useUnread } from '../views/dm.js';
import { UsMap, loadUsa, viewFor, unitLabel } from './map.js';
import { USA_VIEW, USA_UNIT_KINDS, UNIT_LAYERS, LIGHT_SERVICES, LIGHT_PALETTE, LIGHT_PATTERNS, lightColors, getUnits, SILS } from '/shared/engine/usa.js';

const LAYERS = [['states', 'State borders'], ['cities', 'City borders'], ['highways', 'Highways'], ['labels', 'Names'], ['neighbors', 'Canada and Mexico']];

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
  const [sel, setSel] = useState(null), [placing, setPlacing] = useState(null); // placing: {id} to move a unit, or {spawn} to make one
  const units = useMemo(() => getUnits(u), [u.mods, u.custom]);
  const pickUnit = id => { setSel(id); const x = units[id]; if (x && live) { /* keep the map where it is */ } };
  const onPlace = (lon, lat) => {
    const p = placing; setPlacing(null);
    if (!p) return;
    if (p.id) act({ type: 'usaUnit', id: p.id, lon, lat });
    else act({ type: 'usaSpawn', ...p.spawn, lon, lat }).then(r => r.result?.id && setSel(r.result.id));
  };
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
            <label class="row"><input type="checkbox" checked=${live} onChange=${e => { setLive(e.target.checked); if (e.target.checked) send(view); }} /> Live to stage</label>
            <div class="dim small">Drag to move, scroll to zoom, click a state to zoom to it.</div>
            <select class="input sm" value="" onChange=${e => e.target.value && jump(viewFor(data, e.target.value, 1600, 900))}><option value="">Zoom to a state…</option>${states.map(s => html`<option value=${s.id}>${s.name}</option>`)}</select>
            <div class="row wrap"><button class="btn sm" onClick=${() => jump({ ...USA_VIEW })}>Whole country</button>${!live && html`<button class="btn sm gold" onClick=${() => send(view)}>Show on stage</button>`}</div>
          </div></div>
          ${sel && units[sel] && html`<${UnitCard} unit=${units[sel]} act=${act} placing=${placing} setPlacing=${setPlacing} close=${() => setSel(null)} jump=${v => jump(v)} />`}
          <div class="card"><div class="card-h"><h3>Units</h3></div><div class="card-b col">
            ${Object.entries(UNIT_LAYERS).map(([k, l]) => html`<label class="row"><input type="checkbox" checked=${!!u.layers[k]} onChange=${() => act({ type: 'usaLayer', layer: k })} /> ${l}</label>`)}
            <div class="dim small">Every unit is a dot with a badge above it. Click one to see it; click a governor to edit their seat.</div>
            <select class="input sm" value="" onChange=${e => e.target.value && setSel(e.target.value)}><option value="">Find a governor…</option>${Object.values(units).filter(x => x.kind === 'governor').sort((a, b) => a.owner.localeCompare(b.owner)).map(x => html`<option value=${x.id}>${x.owner} · ${x.person}${x.control === 'delegate' ? ' (delegate)' : ''}</option>`)}</select>
          </div></div>
          <${SpawnCard} placing=${placing} setPlacing=${setPlacing} count=${Object.keys(u.custom || {}).length} act=${act} />
          <${Lightbars} u=${u} states=${states} act=${act} />
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
        <div class="us-mapbox"><${UsMap} usa=${u} view=${view} interactive=${true} onView=${onView} onPick=${onPick} onPickUnit=${pickUnit} onPlace=${placing ? onPlace : null} selectedUnit=${sel} /><div class="us-readout mono">zoom ${view.k.toFixed(1)}×</div></div>
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

// A unit's card. Governors can be edited: the AI plays them, or a delegate does under their own name and photo.
function UnitCard({ unit: x, act, close, jump, placing, setPlacing }) {
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
      <input class="input sm" placeholder="Name" value=${name} onInput=${e => setName(e.target.value)} />
      <input class="input sm" placeholder="Party (R, D, I…)" value=${party} onInput=${e => setParty(e.target.value)} />
      <div class="row wrap"><button class="btn sm gold" onClick=${() => act({ type: 'usaGovernor', state: code, name, party })}>Save name</button>
        <label class="btn sm">Upload photo<input type="file" accept="image/*" hidden onChange=${photo} /></label>${x.photo && html`<button class="btn sm ghost" onClick=${() => act({ type: 'usaGovernor', state: code, photo: null })}>Remove photo</button>`}</div>`
      : html`<div class="row wrap"><button class=${cls('btn sm', x.control !== 'delegate' && 'on')} onClick=${() => edit({ control: 'ai' })}>AI plays</button><button class=${cls('btn sm gold', x.control === 'delegate' && 'on')} onClick=${() => edit({ control: 'delegate' })}>Delegate plays</button></div>`}
    <div class="sub-h">Any unit: Zeus controls it</div>
    <input class="input sm" placeholder="Full name" value=${uname} onInput=${e => setUname(e.target.value)} />
    <input class="input sm" placeholder="Short name on the badge" value=${short} onInput=${e => setShort(e.target.value)} />
    <textarea class="input" rows="2" placeholder="Description" value=${desc} onInput=${e => setDesc(e.target.value)}></textarea>
    <button class="btn sm gold" onClick=${() => edit({ name: uname, short: short || uname, desc })}>Save names</button>
    <label class="row small">Strength <input type="range" min="0" max="100" value=${x.strength} onChange=${e => edit({ strength: e.target.value })} /> <b>${x.strength}%</b></label>
    <select class="input sm" value=${x.sil} onChange=${e => edit({ sil: e.target.value })}>${SILS.map(k => html`<option value=${k}>Picture: ${k}</option>`)}</select>
    <div class="row wrap">
      <button class=${cls('btn sm', moving && 'on')} onClick=${() => setPlacing(moving ? null : { id: x.id })}>${moving ? 'Click the map…' : 'Move on map'}</button>
      <button class="btn sm" onClick=${() => edit({ hidden: !x.hidden })}>${x.hidden ? 'Show' : 'Hide'}</button>
      ${(x.kind === 'guard' || x.kind === 'police') && html`<button class=${cls('btn sm', x.federal && 'on')} onClick=${() => edit({ federal: !x.federal })}>${x.federal ? 'Federalized' : 'Federalize'}</button>`}
      ${builtIn ? html`<button class="btn sm ghost" onClick=${() => act({ type: 'usaUnitReset', id: x.id })}>Reset</button>` : html`<button class="btn sm ghost" onClick=${() => { act({ type: 'usaDeleteUnit', id: x.id }); close(); }}>Delete</button>`}
    </div>
  </div></div>`;
}

// Make a unit of your own (a militia, a task force, a convoy): fill this in, press Place, then click the map.
function SpawnCard({ placing, setPlacing, count, act }) {
  const [f, setF] = useState({ name: '', sil: 'infantry', strength: 100 });
  const arming = placing && !placing.id;
  return html`<div class="card"><div class="card-h"><h3>New unit</h3></div><div class="card-b col">
    <input class="input sm" placeholder="Name, e.g. Free Texas Militia" value=${f.name} onInput=${e => setF({ ...f, name: e.target.value })} />
    <select class="input sm" value=${f.sil} onChange=${e => setF({ ...f, sil: e.target.value })}>${SILS.map(k => html`<option value=${k}>Picture: ${k}</option>`)}</select>
    <label class="row small">Strength <input type="range" min="0" max="100" value=${f.strength} onInput=${e => setF({ ...f, strength: e.target.value })} /> <b>${f.strength}%</b></label>
    <button class=${cls('btn sm gold', arming && 'on')} disabled=${!f.name.trim()} onClick=${() => setPlacing(arming ? null : { spawn: { name: f.name, sil: f.sil, strength: Number(f.strength) } })}>${arming ? 'Click the map to place it…' : 'Place on map'}</button>
    <div class="row wrap"><button class="btn sm" onClick=${() => act({ type: 'usaFederalize', state: 'all', on: true })}>Federalize every Guard</button><button class="btn sm ghost" onClick=${() => act({ type: 'usaFederalize', state: 'all', on: false })}>Release them</button></div>
    <div class="dim small">${count} unit${count === 1 ? '' : 's'} made by you. Click any dot to rename, move, resize or hide it.</div>
  </div></div>`;
}
