// Left-hand tools of the world panel: news desk, orders, countries, saves and log.
import { html, useState, useMemo, useEffect, run, toast, fmt, cls, download, useEvent } from '../lib.js';
import { SEA_ZONES } from '/shared/data/places.js';
import { UNIT_TYPES, TARGET_TYPES, ENDINGS, BLOCS, isOOB } from '/shared/engine/core.js';
import { ORDER_TYPES, CYBER_KINDS, SPY_KINDS, validateOrder, autoUnits, describeOrder } from '/shared/engine/orders.js';

export function sortedCountries(state, filter = () => true) {
  return Object.values(state.countries).filter(c => !isOOB(c.id)).filter(filter).sort((a, b) => (b.control === 'player') - (a.control === 'player') || (b.major - a.major) || a.name.localeCompare(b.name));
}

export function CountrySelect({ state, value, onChange, placeholder = 'Choose a country', filter, sm }) {
  const list = useMemo(() => sortedCountries(state, c => c.control !== 'inactive' && (!filter || filter(c))), [state.countries, filter]);
  const players = list.filter(c => c.control === 'player'), majors = list.filter(c => c.control !== 'player' && c.major), rest = list.filter(c => c.control !== 'player' && !c.major);
  return html`
    <select class=${cls('input', sm && 'sm')} value=${value || ''} onChange=${e => onChange(e.target.value || null)}>
      <option value="">${placeholder}</option>
      ${players.length > 0 && html`<optgroup label="Delegates">${players.map(c => html`<option value=${c.id}>${c.name}</option>`)}</optgroup>`}
      <optgroup label="Computer-run">${majors.map(c => html`<option value=${c.id}>${c.name}</option>`)}</optgroup>
      ${rest.length > 0 && html`<optgroup label="Others">${rest.map(c => html`<option value=${c.id}>${c.name}</option>`)}</optgroup>`}
    </select>`;
}

export function ZoneSelect({ value, onChange, sm }) {
  return html`<select class=${cls('input', sm && 'sm')} value=${value || ''} onChange=${e => onChange(e.target.value || null)}>
    <option value="">Choose a sea zone</option>
    <optgroup label="Chokepoints">${Object.entries(SEA_ZONES).filter(([, z]) => z.choke).map(([k, z]) => html`<option value=${k}>${z.name}</option>`)}</optgroup>
    <optgroup label="Seas and oceans">${Object.entries(SEA_ZONES).filter(([, z]) => !z.choke).sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([k, z]) => html`<option value=${k}>${z.name}</option>`)}</optgroup>
  </select>`;
}

// ---------------- News desk ----------------
export function ReviewTab({ conn, state }) {
  const [en, setEn] = useState('');
  const [ar, setAr] = useState('');
  const [editing, setEditing] = useState(null);
  const pending = state.review.filter(r => r.status === 'pending').sort((a, b) => (b.kind === 'join') - (a.kind === 'join') || (b.kind === 'ending') - (a.kind === 'ending') || b.priority - a.priority || b.at - a.at);
  const aired = state.aired.slice(-30).reverse();
  const add = async airNow => {
    const r = await run(conn, { type: 'addNews', en, ar, priority: airNow ? 7 : 4, airNow });
    if (r.ok) { setEn(''); setAr(''); }
  };
  return html`
    <div class="pane">
      <div class="pane-h">
        <h2>News desk</h2>
        <label class="row dim" title="Air automatic headlines without review"><input type="checkbox" checked=${state.settings.airMode !== 'manual'} onChange=${e => run(conn, { type: 'setSetting', key: 'autoAir', value: e.target.checked })} /> Auto-air</label>
      </div>
      <p class="pane-hint">Automatic headlines and ending suggestions wait here. Nothing reaches the stage until you air it.</p>
      <div class="row" style="margin-bottom:8px">
        <button class="btn sm good" disabled=${!pending.some(p => p.kind === 'news')} onClick=${() => run(conn, { type: 'airAll' })}>Air all</button>
        <button class="btn sm danger" disabled=${!pending.some(p => p.kind === 'news')} onClick=${() => run(conn, { type: 'killAll' })}>Kill all</button>
        <div class="grow"></div><span class="dim">${pending.length} waiting</span>
      </div>
      <div class="list">
        ${pending.length === 0 && html`<div class="empty">Nothing waiting. Resolve a turn and the headlines appear here.</div>`}
        ${pending.map(r => html`
          <div class=${cls('news-item', r.kind === 'ending' && 'ending', r.priority >= 6 && 'hot')} key=${r.id}>
            ${editing === r.id ? html`<${EditNews} conn=${conn} item=${r} done=${() => setEditing(null)} />` : html`
              <div class="news-en">${r.kind === 'ending' ? html`<span class="chip gold">Ending</span> ` : r.kind === 'join' ? html`<span class="chip red">Needs approval</span> ` : ''}${r.en}</div>
              ${r.ar && r.ar !== r.en && html`<div class="news-ar ar" dir="rtl">${r.ar}</div>`}
              ${r.detail && html`<div class="dim small">${r.detail}</div>`}
              <div class="row news-actions">
                <span class="dim small">T${r.turn} · P${r.priority}</span><div class="grow"></div>
                ${r.kind === 'join'
                  ? html`<button class="btn xs danger" onClick=${() => run(conn, { type: 'airItem', id: r.id }, 'War declared')}>Approve: join the war</button>`
                  : r.kind === 'ending'
                  ? html`<button class="btn xs gold" onClick=${() => run(conn, { type: 'airItem', id: r.id }, 'Ending is playing on stage')}>Play ending</button>`
                  : html`<button class="btn xs ghost" onClick=${() => setEditing(r.id)}>Edit</button><button class="btn xs good" onClick=${() => run(conn, { type: 'airItem', id: r.id })}>Air</button>`}
                <button class="btn xs danger" onClick=${() => run(conn, { type: 'killItem', id: r.id })}>${r.kind === 'join' ? 'Decline' : 'Kill'}</button>
              </div>`}
          </div>`)}
      </div>
      <div class="sub-h">Write a headline</div>
      <div class="col">
        <input class="input" placeholder="English headline" value=${en} onInput=${e => setEn(e.target.value)} />
        <input class="input ar" dir="rtl" placeholder="العنوان بالعربية (اختياري)" value=${ar} onInput=${e => setAr(e.target.value)} />
        <div class="row"><button class="btn sm" disabled=${!en.trim()} onClick=${() => add(false)}>Queue</button><button class="btn sm solid-danger" disabled=${!en.trim()} onClick=${() => add(true)}>Air now as breaking</button></div>
      </div>
      <div class="sub-h">On air</div>
      <div class="list compact">
        ${aired.length === 0 && html`<div class="empty">The ticker is empty.</div>`}
        ${aired.map(r => html`<div class="aired" key=${r.id}><span class="ellipsis grow">${r.en}</span><button class="btn xs ghost" title="Take off the ticker" onClick=${() => run(conn, { type: 'unairItem', id: r.id })}>✕</button></div>`)}
      </div>
    </div>`;
}

function EditNews({ conn, item, done }) {
  const [en, setEn] = useState(item.en), [ar, setAr] = useState(item.ar);
  return html`<div class="col">
    <textarea class="input" rows="2" value=${en} onInput=${e => setEn(e.target.value)}></textarea>
    <textarea class="input ar" dir="rtl" rows="2" value=${ar} onInput=${e => setAr(e.target.value)}></textarea>
    <div class="row"><button class="btn xs" onClick=${done}>Cancel</button><button class="btn xs primary" onClick=${async () => { await run(conn, { type: 'editItem', id: item.id, en, ar }); done(); }}>Save</button>
    <button class="btn xs good" onClick=${async () => { await run(conn, { type: 'editItem', id: item.id, en, ar }); await run(conn, { type: 'airItem', id: item.id }); done(); }}>Save and air</button></div>
  </div>`;
}

// ---------------- Orders ----------------
const GROUPS = { military: 'Military', diplomacy: 'Diplomacy', economy: 'Economy', covert: 'Covert', politics: 'Politics' };

export function OrdersTab({ conn, state, draft, setDraft, picking, setPicking, selected }) {
  const turn = state.meta.turn;
  const queued = state.orders.filter(o => o.turn === turn && o.status === 'queued');
  const last = state.orders.filter(o => o.turn === turn - 1 && o.by !== 'AI').slice(-40).reverse();
  const lastAI = state.orders.filter(o => o.turn === turn - 1 && o.by === 'AI');
  const d = draft || { type: 'strike', country: selected, counts: {}, category: 'military' };
  const set = patch => setDraft({ ...d, ...patch });
  const needs = ORDER_TYPES[d.type]?.needs || [];
  const preview = useMemo(() => {
    if (!d.country || !d.type) return null;
    const o = autoUnits(state, { ...d, turn, units: undefined }, d.counts || {});
    const v = validateOrder(state, o);
    return { ok: v.ok, reason: v.ok ? '' : `${v.reason}${o._why ? ' ' + o._why : ''}`, text: describeOrder(state, o), units: o.units || [] };
  }, [d, state]);
  const submit = async (now = false) => {
    const r = await run(conn, { type: 'queueOrder', order: d, now });
    if (r.ok) { toast(now ? `Forced: ${preview?.text || 'order'}` : `Queued: ${r.result.text}`, 'good'); setDraft({ ...d, target: d.type === 'strike' ? d.target : null }); }
  };
  const actor = state.countries[d.country];
  return html`
    <div class="pane">
      <div class="pane-h"><h2>Orders</h2><span class="dim">Turn ${turn}</span></div>
      <div class="composer card">
        <div class="card-b col">
          <label class="field">Country acting<${CountrySelect} state=${state} value=${d.country} onChange=${v => set({ country: v })} /></label>
          <label class="field">Order
            <select class="input" value=${d.type} onChange=${e => set({ type: e.target.value, counts: {} })}>
              ${Object.entries(GROUPS).map(([g, gl]) => html`<optgroup label=${gl}>${Object.entries(ORDER_TYPES).filter(([, t]) => t.group === g).map(([k, t]) => html`<option value=${k}>${t.label}</option>`)}</optgroup>`)}
            </select>
          </label>
          ${needs.includes('target') && html`<label class="field">Target
            <div class="row"><div class="grow"><${CountrySelect} state=${state} value=${d.target} onChange=${v => set({ target: v })} filter=${c => c.id !== d.country || ['invade', 'rebase'].includes(d.type)} /></div>
            <button class=${cls('btn icon', picking === 'target' && 'on')} title="Pick on the map" onClick=${() => setPicking(picking === 'target' ? null : 'target')}>⌖</button></div></label>`}
          ${needs.includes('zone') && html`<label class="field">Sea zone
            <div class="row"><div class="grow"><${ZoneSelect} value=${d.zone} onChange=${v => set({ zone: v })} /></div>
            <button class=${cls('btn icon', picking === 'zone' && 'on')} title="Pick on the map" onClick=${() => setPicking(picking === 'zone' ? null : 'zone')}>⌖</button></div></label>`}
          ${d.type === 'strike' && html`
            <div class="row">
              <label class="field grow">Weapon<select class="input" value=${d.counts?.type || ''} onChange=${e => set({ counts: { ...d.counts, type: e.target.value || undefined } })}>
                <option value="">Best available</option>${['bomber', 'missile', 'fighter', 'carrier'].map(t => html`<option value=${t}>${UNIT_TYPES[t].name}s</option>`)}
              </select></label>
              <label class="field" style="width:70px">How many<input class="input" type="number" min="1" max="12" value=${d.counts?.n || 1} onInput=${e => set({ counts: { ...d.counts, n: +e.target.value } })} /></label>
              <label class="field" style="width:70px">Escort<input class="input" type="number" min="0" max="8" value=${d.counts?.escort || 0} onInput=${e => set({ counts: { ...d.counts, escort: +e.target.value } })} /></label>
            </div>
            ${state.countries[d.country]?.a3 === 'USA' && html`<label class="field">US aircraft<div class="seg wrap">
              ${[['', 'Any'], ['b2', 'B-2 Spirit'], ['f117', 'F-117 Nighthawk'], ['b52', 'B-52'], ['b1b', 'B-1B Lancer']].map(([k, l]) => html`<button class=${(d.counts?.aircraft || '') === k ? 'on' : ''} onClick=${() => set({ counts: { ...d.counts, aircraft: k || undefined, type: k ? undefined : d.counts?.type, payload: k === 'b2' ? d.counts?.payload : undefined } })}>${l}</button>`)}
            </div>${d.counts?.aircraft === 'b2' && html`<label class="row small" style="margin-top:4px"><input type="checkbox" checked=${d.counts?.payload === 'moab'} onChange=${e => set({ counts: { ...d.counts, payload: e.target.checked ? 'moab' : undefined } })} /> Carry the heavy bomb (MOAB)</label>`}</label>`}
            <label class="field">Target type<div class="seg wrap">${TARGET_TYPES.map(t => html`<button class=${d.category === t ? 'on' : ''} onClick=${() => set({ category: t })}>${t}</button>`)}</div></label>`}
          ${['invade', 'fleet', 'blockade', 'siege', 'rebase'].includes(d.type) && html`<label class="field">Units<input class="input" type="number" min="1" max="10" value=${d.counts?.n || 1} onInput=${e => set({ counts: { ...d.counts, n: +e.target.value } })} /></label>`}
          ${d.type === 'rebase' && html`<label class="field">Unit type<select class="input" value=${d.counts?.type || 'fighter'} onChange=${e => set({ counts: { ...d.counts, type: e.target.value } })}>${['fighter', 'bomber', 'missile', 'airdef'].map(t => html`<option value=${t}>${UNIT_TYPES[t].name}</option>`)}</select></label>`}
          ${needs.includes('amount') && html`<label class="field">Amount ($ billion)<input class="input" type="number" min="1" value=${d.amount || 10} onInput=${e => set({ amount: +e.target.value })} /></label>`}
          ${needs.includes('unitType') && html`<label class="field">What to transfer<select class="input" value=${d.unitType || 'fighter'} onChange=${e => set({ unitType: e.target.value })}>${Object.entries(UNIT_TYPES).map(([k, t]) => html`<option value=${k}>${t.name}</option>`)}</select></label>`}
          ${needs.includes('kind') && html`<label class="field">${d.type === 'roe' ? 'Posture' : 'Operation'}<div class="seg">${(d.type === 'cyber' ? CYBER_KINDS : d.type === 'spy' ? SPY_KINDS : ['defensive', 'firm', 'forward']).map(k => html`<button class=${d.kind === k ? 'on' : ''} onClick=${() => set({ kind: k })}>${k}</button>`)}</div></label>`}
          ${d.type === 'peace' && html`<${PeaceTerms} state=${state} d=${d} set=${set} />`}
          ${d.type === 'nuke' && html`<div class="warn-box">Nuclear launch is locked below Global Tension 10. The ending will be shown without graphic imagery.</div>`}
          ${preview && html`<div class=${cls('preview', preview.ok ? 'ok' : 'bad')}>${preview.ok ? '✓' : '✗'} ${preview.ok ? preview.text : preview.reason}</div>`}
          <div class="row">
            <button class="btn primary" disabled=${!preview?.ok} onClick=${() => submit()}>Queue order</button>
            ${d.type !== 'nuke' && html`<button class="btn gold" disabled=${!preview?.ok} title="Resolve it right away without ending the turn" onClick=${() => submit(true)}>Force now</button>`}
          </div>
        </div>
      </div>

      <div class="sub-h row">Queued this turn <span class="dim">(${queued.length})</span>
        ${queued.some(o => o.type !== 'nuke') && html`<button class="btn xs gold" style="margin-left:auto" title="Resolve every queued order now without ending the turn" onClick=${() => run(conn, { type: 'executeAll' }, 'Orders forced')}>Force all now</button>`}
      </div>
      <div class="list compact">
        ${queued.length === 0 && html`<div class="empty">No orders yet. Computer-run countries decide when you resolve the turn.</div>`}
        ${queued.map(o => html`<div class=${cls('order', o.type === 'nuke' && 'nuke')} key=${o.id}>
          <div class="grow"><div>${describeOrder(state, o)}</div><div class="dim small">${o.by} · ${fmt.time(o.at)}</div></div>
          ${o.type !== 'nuke' && html`<button class="btn xs gold" title="Force it now instead of waiting for the turn" onClick=${() => run(conn, { type: 'executeNow', id: o.id }, 'Done')}>Now</button>`}
          <button class="btn xs danger" onClick=${() => run(conn, { type: 'cancelOrder', id: o.id })}>✕</button>
        </div>`)}
      </div>
      ${last.length > 0 && html`<div class="sub-h">Last turn's results</div>
      <div class="list compact">${last.map(o => html`<div class=${cls('order', o.status)} key=${o.id}><span class=${o.status === 'done' ? 'pos' : 'neg'}>${o.status === 'done' ? '✓' : '✗'}</span><div class="grow">${describeOrder(state, o)}${o.result && html`<div class="neg small">${o.result}</div>`}</div></div>`)}</div>`}
      ${lastAI.length > 0 && html`<details class="ai-moves"><summary>${lastAI.length} computer moves last turn</summary>${lastAI.slice(0, 60).map(o => html`<div class="small muted">${o.status === 'done' ? '•' : '✗'} ${describeOrder(state, o)}</div>`)}</details>`}
    </div>`;
}

function PeaceTerms({ state, d, set }) {
  const t = d.terms || { returnTerritory: true };
  const st = patch => set({ terms: { ...t, ...patch } });
  return html`<div class="col terms">
    <label class="row"><input type="checkbox" checked=${t.returnTerritory !== false} onChange=${e => st({ returnTerritory: e.target.checked })} /> Occupied land is returned</label>
    <label class="row"><input type="checkbox" checked=${!!t.demilitarize} onChange=${e => st({ demilitarize: e.target.checked })} /> Troops withdraw from each other's land</label>
    <div class="row"><label class="field grow">Reparations ($bn)<input class="input" type="number" min="0" value=${t.reparations || 0} onInput=${e => st({ reparations: +e.target.value, payer: t.payer || d.country, payee: t.payee || d.target })} /></label>
    <label class="field grow">Paid by<select class="input" value=${t.payer || d.country || ''} onChange=${e => st({ payer: e.target.value, payee: e.target.value === d.country ? d.target : d.country })}>${[d.country, d.target].filter(Boolean).map(id => html`<option value=${id}>${state.countries[id].name}</option>`)}</select></label></div>
  </div>`;
}

// ---------------- Countries ----------------
export function CountriesTab({ conn, state, selected, setSelected }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('major');
  const [blocEdit, setBlocEdit] = useState(false);
  const list = sortedCountries(state, c => (filter === 'all' || (filter === 'major' && c.major) || (filter === 'player' && c.control === 'player') || (filter === 'war' && state.wars.some(w => w.a === c.id || w.b === c.id)) || (filter === 'minor' && !c.major))
    && (!q || c.name.toLowerCase().includes(q.toLowerCase()) || c.ar.includes(q)));
  const players = Object.values(state.countries).filter(c => c.control === 'player').length;
  return html`
    <div class="pane">
      <div class="pane-h"><h2>Countries</h2><span class="chip cyan">${players} delegate${players === 1 ? '' : 's'}</span></div>
      <p class="pane-hint">Pick which countries delegates play. Everything else is run by the computer, or switched off.</p>
      <input class="input" placeholder="Search countries…" value=${q} onInput=${e => setQ(e.target.value)} />
      <div class="seg sm" style="margin:8px 0">${[['major', 'Major'], ['player', 'Delegates'], ['war', 'At war'], ['minor', 'Minor'], ['all', 'All']].map(([k, l]) => html`<button class=${filter === k ? 'on' : ''} onClick=${() => setFilter(k)}>${l}</button>`)}</div>
      <div class="list country-list">
        ${list.map(c => html`
          <div class=${cls('crow', selected === c.id && 'sel')} key=${c.id} onClick=${() => setSelected(c.id)}>
            <i class="bloc-sw" style=${`background:${state.blocs[c.bloc].color}`}></i>
            <div class="grow"><div class="ellipsis"><b>${c.name}</b>${c.delegate && html` <span class="dim small">· ${c.delegate}</span>`}</div>
              <div class="dim small">${fmt.money(c.gdp)} · ${Math.round(c.support)}% support${c.occupiedBy ? ' · occupied' : ''}</div></div>
            <div class="seg sm" onClick=${e => e.stopPropagation()}>
              ${[['player', 'Delegate'], ['ai', 'AI'], ['inactive', 'Off']].map(([k, l]) => html`<button class=${c.control === k ? 'on' : ''} onClick=${() => run(conn, { type: 'setControl', country: c.id, control: k })}>${l}</button>`)}
            </div>
            <select class="input sm bloc-pick" value=${c.bloc} onClick=${e => e.stopPropagation()} onChange=${e => run(conn, { type: 'setBloc', country: c.id, bloc: e.target.value })}>${BLOCS.map(b => html`<option value=${b}>${b === 'N' ? 'Neutral' : `Bloc ${b}`}</option>`)}</select>
          </div>`)}
        ${list.length === 0 && html`<div class="empty">No countries match.</div>`}
      </div>
      <div class="row" style="margin-top:8px">
        <button class="btn sm" onClick=${() => setBlocEdit(b => !b)}>Edit blocs</button>
        <div class="grow"></div>
        <button class="btn sm ghost" title="All minor countries become computer-run" onClick=${() => run(conn, { type: 'setControlMany', countries: Object.values(state.countries).filter(c => !c.major && c.control === 'inactive').map(c => c.id), control: 'ai' }, 'Minor countries activated')}>Activate minors</button>
      </div>
      ${blocEdit && html`<div class="col" style="margin-top:8px">${['A', 'B', 'C'].map(b => html`<${BlocEditor} conn=${conn} id=${b} bloc=${state.blocs[b]} />`)}</div>`}
    </div>`;
}

function BlocEditor({ conn, id, bloc }) {
  const [name, setName] = useState(bloc.name);
  useEffect(() => setName(bloc.name), [bloc.name]);
  return html`<div class="row">
    <input type="color" value=${bloc.color} onChange=${e => run(conn, { type: 'editBloc', bloc: id, color: e.target.value })} class="color-in" />
    <input class="input sm grow" value=${name} onInput=${e => setName(e.target.value)} onBlur=${() => name !== bloc.name && run(conn, { type: 'editBloc', bloc: id, name })} />
  </div>`;
}

// ---------------- Saves ----------------
export function SavesTab({ conn, state, committee, kronos }) {
  const [list, setList] = useState(conn.snapshots[committee] || []);
  useEffect(() => conn.on('snapshots', m => { if (m.committee === committee) setList(m.list); }), [conn, committee]);
  useEffect(() => { conn.request({ t: 'snapshots', committee }); }, []);
  const [label, setLabel] = useState('');
  const [confirm, setConfirm] = useState(null);
  const save = async () => { const r = await conn.request({ t: 'snapshot', committee, label: label || `Save point, turn ${state.meta.turn}` }); toast(r.ok ? 'Saved.' : r.error, r.ok ? 'good' : 'error'); setLabel(''); };
  const remove = async id => { const r = await conn.request({ t: 'deleteSnapshot', committee, snapId: id }); if (!r.ok) toast(r.error, 'error'); };
  const auto = state.settings.autoSnap !== false;
  const mine = list.filter(s => s.keep), autos = list.filter(s => !s.keep);
  const row = s => html`<div class="snap" key=${s.id}>
    <div class="grow"><div><b>${s.label}</b></div><div class="dim small">Turn ${s.turn}${s.clock ? ` · ${s.clock}` : ''} · ${fmt.time(s.at)} · ${s.by}</div></div>
    ${confirm === s.id ? html`<button class="btn xs" onClick=${() => setConfirm(null)}>No</button><button class="btn xs solid-danger" onClick=${() => rewind(s.id)}>Load</button>`
      : html`<button class="btn xs" onClick=${() => setConfirm(s.id)}>⟲ Load</button><button class="btn xs ghost" title="Delete this save point" onClick=${() => remove(s.id)}>✕</button>`}
  </div>`;
  const rewind = async id => { const r = await conn.request({ t: 'rewind', committee, snapId: id }); toast(r.ok ? 'Rewound. The world is as it was.' : r.error, r.ok ? 'good' : 'error'); setConfirm(null); };
  const importFile = e => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = async () => { try { const st = JSON.parse(rd.result); const r = await conn.request({ t: 'restore', committee, state: st }); toast(r.ok ? 'Save loaded.' : r.error, r.ok ? 'good' : 'error'); } catch { toast('That file is not valid JSON.', 'error'); } };
    rd.readAsText(f); e.target.value = '';
  };
  return html`
    <div class="pane">
      <div class="pane-h"><h2>Saves and rewind</h2></div>
      <p class="pane-hint">Save whenever you like (Ctrl+S anywhere in the panel), name it, and load it later. Manual saves are never cleared out. The live committee still keeps itself safe on disk every second.</p>
      <div class="row"><input class="input grow" placeholder="Name this save" value=${label} onInput=${e => setLabel(e.target.value)} onKeyDown=${e => e.key === 'Enter' && save()} /><button class="btn primary" onClick=${save}>💾 Save</button></div>
      <div class="sub-h">Your saves</div>
      <div class="list compact">
        ${mine.length === 0 && html`<div class="empty">No manual saves yet.</div>`}
        ${[...mine].reverse().map(row)}
      </div>
      <div class="sub-h row"><span class="grow">Automatic rewind points</span>
        <label class="small dim" style="text-transform:none;letter-spacing:0"><input type="checkbox" checked=${auto} onChange=${e => run(conn, { type: 'setSetting', key: 'autoSnap', value: e.target.checked })} /> before every turn</label></div>
      <div class="list compact">
        ${autos.length === 0 && html`<div class="empty">${auto ? 'None yet.' : 'Off: only your own saves are kept.'}</div>`}
        ${[...autos].reverse().map(row)}
      </div>
      <div class="sub-h">Files</div>
      <div class="row wrap">
        <a class="btn sm" href=${`/api/export/${committee}`} download>⤓ Download save</a>
        <label class="btn sm">⤒ Load save file<input type="file" accept="application/json,.json" hidden onChange=${importFile} /></label>
        <button class="btn sm ghost" onClick=${() => { const b = conn.localBackup(committee); if (b) download(`browser-backup-${committee}.json`, b.state); else toast('No copy in this browser yet.', 'error'); }}>Browser copy</button>
      </div>
      <p class="dim small" style="margin-top:10px">Free hosting may wipe its disk when it sleeps. Every open panel keeps a copy of the committee in its browser and offers to restore it if that happens. Download a save at the end of each session too.</p>
    </div>`;
}

// ---------------- Log ----------------
export function LogTab({ state }) {
  const log = [...state.log].reverse();
  return html`
    <div class="pane">
      <div class="pane-h"><h2>Log</h2></div>
      <div class="list compact">
        ${log.map((l, i) => html`<div class="log-row" key=${i}><span class="dim mono small">T${l.turn}</span><span class="grow">${l.text || l.summary}</span><span class="dim small">${l.by || ''} ${l.at ? fmt.time(l.at) : ''}</span></div>`)}
        ${log.length === 0 && html`<div class="empty">Nothing has happened yet.</div>`}
      </div>
    </div>`;
}

export { ENDINGS };
