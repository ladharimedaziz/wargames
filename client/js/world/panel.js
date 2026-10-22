// The Zeus panel for world (map) committees: live map in the middle, tools on the left, country inspector on the right,
// and the quick command bar along the bottom.
import { html, useState, useEffect, useRef, useMemo, useCallback, run, toast, fmt, useNow, timerRemaining, cls, useEvent } from '../lib.js';
import { WorldMap } from '../map/renderer.js';
import { SEA_ZONES } from '/shared/data/places.js';
import { tensionLevel, ENDINGS } from '/shared/engine/core.js';
import { parseCommand, COMMAND_HELP } from '/shared/engine/command.js';
import { validateOrder, autoUnits, describeOrder } from '/shared/engine/orders.js';
import { ReviewTab, OrdersTab, CountriesTab, LogTab, SavesTab } from './tabs.js';
import { DiplomacyTab } from './diplomacy.js';
import { DisplayTab } from './display-tab.js';
import { Inspector } from './inspector.js';
import { SandboxTab } from './sandbox.js';
import { DMDrawer, useUnread } from '../views/dm.js';
import { sfx } from '../fx/audio.js';

const TABS = [
  { id: 'review', label: 'News desk', icon: '◉' },
  { id: 'orders', label: 'Orders', icon: '➤' },
  { id: 'countries', label: 'Countries', icon: '▦' },
  { id: 'diplomacy', label: 'Diplomacy', icon: '⚖' },
  { id: 'display', label: 'Stage', icon: '▣' },
  { id: 'saves', label: 'Saves', icon: '⟲' },
  { id: 'log', label: 'Log', icon: '≡' },
];

export function WorldPanel({ conn, user, state, committee, logout, onBack }) {
  const kronos = user.role === 'kronos';
  const [tab, setTab] = useState(() => (user.role === 'stage' ? 'display' : 'review'));
  const [selected, setSelected] = useState(null);
  const [selZone, setSelZone] = useState(null);
  const [draft, setDraft] = useState(null); // order being composed
  const [picking, setPicking] = useState(null); // 'target' | 'zone' while choosing on the map
  const [dmOpen, setDmOpen] = useState(false);
  const [layers, setLayers] = useState({ air: true, naval: true, units: true, relations: false, labels: true, wars: true });
  const pending = state.review.filter(r => r.status === 'pending').length;
  const unread = useUnread(conn, committee, dmOpen, kronos);
  const tabs = kronos ? [...TABS, { id: 'sandbox', label: 'Sandbox', icon: '✦' }] : TABS;

  // Map clicks either pick a target for the order being composed or select a country.
  const onMapSelect = useCallback(({ id, zone }) => {
    if (picking === 'target' && id) { setDraft(d => ({ ...d, target: id })); setPicking(null); setTab('orders'); return; }
    if (picking === 'zone' && zone) { setDraft(d => ({ ...d, zone })); setPicking(null); setTab('orders'); return; }
    if (zone) { setSelZone(zone); setSelected(null); return; }
    setSelected(id || null); setSelZone(null);
  }, [picking]);

  const startOrder = (type, extra = {}) => { setDraft({ type, country: selected, counts: {}, category: 'military', ...extra }); setTab('orders'); };

  useEffect(() => {
    const onKey = e => {
      if (e.target.closest('input, textarea, select')) return;
      if (e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); document.querySelector('.cmd-input')?.focus(); }
      if (e.key === 'Escape') { setPicking(null); setSelected(null); setSelZone(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return html`
    <div class=${cls('shell', kronos && 'is-kronos', state.kronos.locked && !kronos && 'is-locked')}>
      <${TopBar} conn=${conn} user=${user} state=${state} logout=${logout} onBack=${onBack} pending=${pending} unread=${unread} openDm=${() => setDmOpen(true)} committee=${committee} />
      <div class="body">
        <nav class="rail">
          ${tabs.map(t => html`<button class=${cls('rail-btn', tab === t.id && 'on', t.id === 'sandbox' && 'gold')} onClick=${() => setTab(t.id)} title=${t.label}>
            <span class="rail-ico">${t.icon}</span><span class="rail-lbl">${t.label}</span>
            ${t.id === 'review' && pending > 0 && html`<i class="badge">${pending}</i>`}
          </button>`)}
        </nav>
        <aside class="left">
          ${tab === 'review' && html`<${ReviewTab} conn=${conn} state=${state} />`}
          ${tab === 'orders' && html`<${OrdersTab} conn=${conn} state=${state} draft=${draft} setDraft=${setDraft} picking=${picking} setPicking=${setPicking} selected=${selected} />`}
          ${tab === 'countries' && html`<${CountriesTab} conn=${conn} state=${state} selected=${selected} setSelected=${id => { setSelected(id); setSelZone(null); }} />`}
          ${tab === 'diplomacy' && html`<${DiplomacyTab} conn=${conn} state=${state} />`}
          ${tab === 'display' && html`<${DisplayTab} conn=${conn} state=${state} committee=${committee} />`}
          ${tab === 'saves' && html`<${SavesTab} conn=${conn} state=${state} committee=${committee} kronos=${kronos} />`}
          ${tab === 'log' && html`<${LogTab} state=${state} />`}
          ${tab === 'sandbox' && html`<${SandboxTab} conn=${conn} state=${state} selected=${selected} selZone=${selZone} />`}
        </aside>
        <main class="mid">
          <${MapView} state=${state} selected=${selected} onSelect=${onMapSelect} layers=${layers} picking=${picking} draft=${draft} />
          <${MapOverlay} state=${state} conn=${conn} layers=${layers} setLayers=${setLayers} picking=${picking} cancelPick=${() => setPicking(null)} />
          <${CommandBar} conn=${conn} state=${state} role=${user.role} />
        </main>
        <aside class="right">
          <${Inspector} conn=${conn} state=${state} selected=${selected} selZone=${selZone} setSelected=${setSelected} startOrder=${startOrder} kronos=${kronos} />
        </aside>
      </div>
      ${state.kronos.locked && !kronos && html`<div class="lock-veil"><div class="lock-card"><div class="lock-ico">⌛</div><h2>Kronos has frozen this panel</h2><p>You can still watch, but nothing can be changed until Kronos unlocks it.</p></div></div>`}
      ${state.kronos.note && html`<div class="kronos-note" title="Note from Kronos"><b>KRONOS</b> ${state.kronos.note}</div>`}
      <${DMDrawer} conn=${conn} committee=${committee} open=${dmOpen} onClose=${() => setDmOpen(false)} kronos=${kronos} name=${state.name} />
    </div>`;
}

function TopBar({ conn, user, state, logout, onBack, pending, unread, openDm, committee }) {
  const [status, setStatus] = useState(conn.status);
  useEffect(() => { setStatus(conn.status); return conn.on('status', setStatus); }, [conn]);
  const t = state.global.tension, lvl = tensionLevel(t);
  const now = useNow(conn, 500);
  const rem = timerRemaining(state.timer, now);
  const roleName = user.role === 'kronos' ? 'Kronos' : user.role === 'stage' ? 'Stage Zeus' : 'Back Room Zeus';
  const resolve = async () => {
    const r = await run(conn, { type: 'resolveTurn' });
    if (r.ok) toast(`Turn resolved: ${r.result.events} events. Headlines are waiting on the news desk.`, 'good');
  };
  return html`
    <header class="topbar">
      ${onBack && html`<button class="btn sm ghost" onClick=${onBack}>← All committees</button>`}
      <div class="brand"><span class="brand-orb"></span><span class="brand-name">WORLD ENGINE</span></div>
      <div class="tb-committee">
        <div class="tb-name">${state.name}</div>
        <div class=${cls('chip', user.role === 'kronos' ? 'gold' : 'cyan')}>${roleName}</div>
      </div>
      <div class="tb-stat"><span class="dim up">Turn</span><b class="mono">${state.meta.turn}</b></div>
      <div class="tb-stat"><span class="dim up">Date</span><b>${fmt.date(state.meta.clock)}</b></div>
      <div class="tb-tension" title=${`Global Tension ${t}: ${lvl.name}`}>
        <span class="dim up">Tension</span>
        <div class="tension-mini">${Array.from({ length: 10 }, (_, i) => html`<i class=${cls(i < Math.floor(t) && 'on', i === Math.floor(t) && t % 1 && 'half')} style=${`--i:${i}`}></i>`)}</div>
        <b class=${`t-${Math.min(4, Math.floor(t / 2.01))}`}>${t} · ${lvl.name}</b>
      </div>
      <div class="tb-stat"><span class="dim up">Oil</span><b class="mono">$${Math.round(state.global.oilPrice)}</b></div>
      ${(state.timer.running || rem > 0) && html`<div class=${cls('tb-timer', state.timer.running && 'run', rem < 30 && state.timer.running && 'low')}><span class="dim up">${state.timer.label || 'Timer'}</span><b class="mono">${fmt.clock(rem)}</b></div>`}
      <div class="grow"></div>
      <button class="btn sm" onClick=${() => window.open(`/display?c=${committee}`, `display-${committee}`, 'width=1280,height=720')} title="Open the stage display in a new window to stream or project">▣ Stage display</button>
      <button class=${cls('btn sm', unread && 'gold')} onClick=${openDm}>✉ ${user.role === 'kronos' ? 'Zeus chat' : 'Kronos'}${unread ? html` <i class="badge inline">${unread}</i>` : ''}</button>
      <button class="btn primary resolve-btn" onClick=${resolve} title="Resolve this turn: every queued order plays out, the computer moves its countries, the economy updates">⏵ Resolve turn ${state.meta.turn}</button>
      <span class=${cls('conn', status)} title=${status}><i class=${cls('dot', status === 'live' && 'live')}></i>${status === 'live' ? '' : status}</span>
      ${!onBack && html`<button class="btn sm ghost" onClick=${logout} title="Sign out">⎋</button>`}
    </header>`;
}

function MapView({ state, selected, onSelect, layers, picking }) {
  const ref = useRef(), mapRef = useRef(), tipRef = useRef();
  const [tip, setTip] = useState(null);
  const onSelectRef = useRef(onSelect); onSelectRef.current = onSelect;
  const stateRef = useRef(state); stateRef.current = state;
  useEffect(() => {
    const m = new WorldMap(ref.current, { interactive: true, onSelect: (...a) => onSelectRef.current(...a), onHover: (h, x, y) => setTip(h ? { ...h, x, y } : null) });
    mapRef.current = m;
    m.ready.then(() => m.setState(stateRef.current, { layers }));
    window.__map = m;
    return () => m.destroy();
  }, []);
  useEffect(() => { mapRef.current?.setState(state); }, [state]);
  useEffect(() => { mapRef.current?.setSelected(selected); }, [selected]);
  useEffect(() => { mapRef.current?.setLayers(layers); }, [layers]);
  const c = tip?.id && state.countries[tip.id];
  const z = tip?.zone && SEA_ZONES[tip.zone];
  return html`
    <div class=${cls('map', picking && 'picking')} ref=${ref}></div>
    ${tip && (c || z) && html`<div class="map-tip" ref=${tipRef} style=${`left:${tip.x + 14}px;top:${tip.y + 14}px`}>
      ${c ? html`
        <div class="row"><i class="dot" style=${`background:${state.blocs[c.bloc].color}`}></i><b>${c.name}</b><span class="dim ar">${c.ar}</span></div>
        <div class="tip-grid">
          <span>Control</span><b>${c.control === 'player' ? `Delegate${c.delegate ? ` · ${c.delegate}` : ''}` : c.control === 'ai' ? 'Computer' : 'Inactive'}</b>
          <span>Bloc</span><b>${state.blocs[c.bloc].name}</b>
          <span>GDP</span><b>${fmt.money(c.gdp)} <span class=${c.gdp < c.base.gdp * 0.98 ? 'neg' : 'dim'}>${c.gdp < c.base.gdp * 0.98 ? `▼${Math.round((1 - c.gdp / c.base.gdp) * 100)}%` : ''}</span></b>
          <span>Support</span><b>${Math.round(c.support)}%</b>
          ${state.wars.some(w => w.a === c.id || w.b === c.id) && html`<span>At war</span><b class="neg">${state.wars.filter(w => w.a === c.id || w.b === c.id).length} enem${state.wars.filter(w => w.a === c.id || w.b === c.id).length === 1 ? 'y' : 'ies'}</b>`}
          ${c.occupiedBy && html`<span>Occupied</span><b class="neg">by ${state.countries[c.occupiedBy]?.name}</b>`}
          ${state.global.closedAirspace[c.id] && html`<span>Airspace</span><b class="neg">Closed</b>`}
        </div>` : html`
        <div class="row"><b>${z.name}</b><span class="dim ar">${z.ar}</span></div>
        ${z.choke && html`<div class="tip-grid"><span>Chokepoint</span><b class=${state.global.chokepoints[tip.zone]?.status !== 'open' ? 'neg' : 'pos'}>${state.global.chokepoints[tip.zone]?.status}</b><span>Oil impact</span><b>+$${z.oil}/bbl if closed</b></div>`}`}
      ${picking && html`<div class="tip-pick">Click to choose as ${picking}</div>`}
    </div>`}`;
}

function MapOverlay({ state, conn, layers, setLayers, picking, cancelPick }) {
  const toggle = k => setLayers(l => ({ ...l, [k]: !l[k] }));
  const g = state.global;
  const closedChokes = Object.entries(g.chokepoints).filter(([, c]) => c.status !== 'open');
  return html`
    <div class="map-layers">
      ${[['air', '✈ Air'], ['naval', '⛴ Sea'], ['units', '▲ Forces'], ['wars', '⚔ Wars'], ['relations', '◎ Relations'], ['labels', 'Aa Labels']].map(([k, l]) => html`<button class=${cls('btn xs', layers[k] && 'on')} onClick=${() => toggle(k)}>${l}</button>`)}
    </div>
    <div class="map-legend">
      ${Object.entries(state.blocs).filter(([k]) => k !== 'N').map(([k, b]) => html`<span class="row"><i class="dot" style=${`background:${b.color}`}></i>${b.name}</span>`)}
      <span class="row"><i class="dot" style="background:#3a4760;outline:1px solid #e6edf7"></i>Delegate</span>
      <span class="row"><i class="hatch-sw"></i>Airspace closed</span>
    </div>
    <div class="map-status">
      ${state.wars.length > 0 && html`<span class="chip red">⚔ ${state.wars.length} war${state.wars.length > 1 ? 's' : ''}</span>`}
      ${closedChokes.map(([z, c]) => html`<span class=${cls('chip', c.status === 'closed' ? 'red' : 'gold')}>${SEA_ZONES[z].name} ${c.status}</span>`)}
      ${Object.keys(g.closedAirspace).length > 0 && html`<span class="chip red">✈ ${Object.keys(g.closedAirspace).length} airspaces closed</span>`}
      ${g.pauseUntil >= state.meta.turn && html`<span class="chip green">Humanitarian pause</span>`}
      ${g.nukeOverride && html`<span class="chip gold">☢ Nuclear lock lifted</span>`}
    </div>
    ${picking && html`<div class="pick-banner">Click a ${picking === 'zone' ? 'sea zone (dot)' : 'country'} on the map <button class="btn xs" onClick=${cancelPick}>Cancel</button></div>`}`;
}

// Type what the chair said; see what will happen; press Enter.
function CommandBar({ conn, state, role }) {
  const [text, setText] = useState('');
  const [help, setHelp] = useState(false);
  const [hist, setHist] = useState([]);
  const [hi, setHi] = useState(-1);
  const parsed = useMemo(() => (text.trim() ? parseCommand(state, text, role) : null), [text, state, role]);
  const preview = useMemo(() => {
    if (!parsed?.ok) return null;
    if (parsed.order) {
      const o = autoUnits(state, { ...parsed.order, turn: state.meta.turn, units: undefined }, parsed.order.counts || {});
      const v = validateOrder(state, o);
      return { ok: v.ok, text: describeOrder(state, o), reason: v.ok ? '' : `${v.reason}${o._why ? ' ' + o._why : ''}` };
    }
    return { ok: true, text: parsed.preview };
  }, [parsed, state]);
  const submit = async e => {
    e.preventDefault();
    if (!parsed?.ok) { if (parsed?.error) toast(parsed.error, 'error'); return; }
    if (preview && !preview.ok) { toast(preview.reason, 'error'); return; }
    // Clear straight away so the next instruction can be typed while this one is sent.
    const cmd = text, label = preview?.text || text;
    setText(''); setHi(-1);
    setHist(h => [cmd, ...h.filter(x => x !== cmd)].slice(0, 30));
    for (const a of parsed.actions) { const r = await conn.act(a); if (!r.ok) { toast(r.error, 'error'); setText(t => t || cmd); return; } }
    toast(parsed.order ? `Queued: ${label}` : `Done: ${label}`, 'good');
  };
  const onKey = e => {
    if (e.key === 'ArrowUp') { e.preventDefault(); const i = Math.min(hist.length - 1, hi + 1); if (hist[i]) { setHi(i); setText(hist[i]); } }
    if (e.key === 'ArrowDown') { e.preventDefault(); const i = hi - 1; setHi(Math.max(-1, i)); setText(i >= 0 ? hist[i] : ''); }
    if (e.key === 'Escape') { setText(''); e.target.blur(); }
  };
  return html`
    <form class="cmdbar" onSubmit=${submit}>
      <div class="cmd-row">
        <span class="cmd-prompt">❯</span>
        <input class="cmd-input" value=${text} onInput=${e => { setText(e.target.value); setHi(-1); }} onKeyDown=${onKey} placeholder='Type what the chair says, e.g. "russia strike ukraine 2 missiles energy" — press / to focus' spellcheck="false" autocomplete="off" />
        <button type="button" class="btn sm ghost" onClick=${() => setHelp(h => !h)}>?</button>
        <button class="btn sm primary" disabled=${!parsed?.ok || (preview && !preview.ok)}>Enter ↵</button>
      </div>
      ${text.trim() && html`<div class=${cls('cmd-preview', parsed?.ok && preview?.ok ? 'ok' : 'bad')}>
        ${parsed?.ok ? (preview?.ok ? html`<span>✓</span> ${preview.text}` : html`<span>✗</span> ${preview?.text ? html`<b>${preview.text}</b> — ` : ''}${preview?.reason}`) : html`<span>…</span> ${parsed?.error || 'Keep typing'}`}
      </div>`}
      ${help && html`<div class="cmd-help card">
        <div class="card-h"><h3>Command bar</h3><div class="grow"></div><button type="button" class="btn xs ghost" onClick=${() => setHelp(false)}>✕</button></div>
        <div class="card-b">${COMMAND_HELP.map(([ex, d]) => html`<div class="help-row"><code onClick=${() => { setText(ex.split(' · ')[0]); setHelp(false); document.querySelector('.cmd-input')?.focus(); }}>${ex}</code><span class="muted">${d}</span></div>`)}
        <p class="dim" style="margin:10px 0 0">Every military order is checked for range, borders, interception routes and sea lanes before it is queued. ↑/↓ recalls earlier commands.</p></div>
      </div>`}
    </form>`;
}

export { ENDINGS };
