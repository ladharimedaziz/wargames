// Right-hand inspector: the selected country (or sea zone), or a world overview when nothing is selected.
import { html, useState, useEffect, run, fmt, cls } from '../lib.js';
import { SEA_ZONES } from '/shared/data/places.js';
import { UNIT_TYPES, ROE, BLOCS, tensionLevel, TENSION_LEVELS, relation, isOOB, OOB_ERROR } from '/shared/engine/core.js';
import { ALLIANCE_NAMES } from '/shared/data/countries.js';
import { navalLabel, aircraftFor } from '/shared/data/militaries.js';

const Stat = ({ label, value, pct, tone, hint }) => html`
  <div class="stat" title=${hint || ''}>
    <div class="row between"><span class="dim small">${label}</span><b class=${tone || ''}>${value}</b></div>
    ${pct !== undefined && html`<div class="bar"><i style=${`width:${Math.max(0, Math.min(100, pct))}%;background:${pct < 30 ? 'var(--red)' : pct < 55 ? 'var(--gold)' : 'var(--green)'}`}></i></div>`}
  </div>`;

export function Inspector(props) {
  const { state, selected, selZone } = props;
  if (selected && isOOB(selected)) return html`<div class="pane inspector"><div class="empty">${OOB_ERROR}</div></div>`;
  if (selected && state.countries[selected]) return html`<${CountryCard} ...${props} />`;
  if (selZone && SEA_ZONES[selZone]) return html`<${ZoneCard} ...${props} />`;
  return html`<${WorldOverview} ...${props} />`;
}

function CountryCard({ conn, state, selected: id, setSelected, startOrder, kronos, setBrush }) {
  const c = state.countries[id];
  const [brief, setBrief] = useState(false);
  const enemies = state.wars.filter(w => w.a === id || w.b === id).map(w => (w.a === id ? w.b : w.a));
  const units = Object.values(state.units).filter(u => u.owner === id && u.strength > 0);
  const byType = Object.keys(UNIT_TYPES).map(t => ({ t, home: units.filter(u => u.type === t && u.loc.id === id).length, away: units.filter(u => u.type === t && u.loc.id !== id).length })).filter(x => x.home + x.away);
  const foreign = Object.values(state.units).filter(u => u.loc.kind === 'country' && u.loc.id === id && u.owner !== id && u.strength > 0);
  const gdpPct = (c.gdp / c.base.gdp) * 100;
  const majors = Object.values(state.countries).filter(o => o.major && o.id !== id && o.control !== 'inactive');
  const rels = majors.map(o => ({ o, r: relation(state, id, o.id) })).sort((a, b) => b.r - a.r);
  const friends = rels.filter(x => x.r > 25).slice(0, 4), foes = rels.filter(x => x.r < -25).slice(-4).reverse();
  return html`
    <div class="pane inspector">
      <div class="insp-head" style=${`--bloc:${state.blocs[c.bloc].color}`}>
        <img class="insp-coat" src=${`/client/img/coats/${id}.webp`} alt="" onError=${e => { e.target.style.display = 'none'; }} />
        <div class="grow">
          <div class="insp-name">${c.name}</div>
        </div>
        <button class=${cls('btn xs', state.display.arms !== false ? 'on' : 'ghost')} title="Coats of arms on every map when a country is selected or in focus (click to turn off or on)"
          onClick=${() => run(conn, { type: 'setCoat', on: state.display.arms === false })}>⚜ Arms ${state.display.arms !== false ? 'on' : 'off'}</button>
        <button class="btn xs ghost" onClick=${() => setSelected(null)}>✕</button>
      </div>
      <div class="row wrap" style="margin:8px 0">
        <div class="seg sm">${[['player', 'Delegate'], ['ai', 'Computer'], ['inactive', 'Off']].map(([k, l]) => html`<button class=${c.control === k ? 'on' : ''} onClick=${() => run(conn, { type: 'setControl', country: id, control: k })}>${l}</button>`)}</div>
        <select class="input sm" value=${c.bloc} onChange=${e => run(conn, { type: 'setBloc', country: id, bloc: e.target.value })}>${BLOCS.map(b => html`<option value=${b}>${state.blocs[b].name}</option>`)}</select>
      </div>
      ${c.control === 'player' && html`<${DelegateName} conn=${conn} c=${c} />`}
      <div class="tags">
        ${c.nuclear.has && html`<span class=${cls('chip', c.nuclear.alert ? 'red' : 'gold')}>☢ ${c.nuclear.alert ? 'Nuclear alert' : 'Nuclear'}</span>`}
        ${c.veto && html`<span class="chip">UN veto</span>`}
        ${c.stealth && html`<span class="chip">Stealth</span>`}
        ${c.alliances.map(a => html`<span class="chip cyan" title=${ALLIANCE_NAMES?.[a] || a}>${a}</span>`)}
        ${enemies.length > 0 && html`<span class="chip red">At war × ${enemies.length}</span>`}
        ${c.occupiedBy && html`<span class="chip red">Occupied by ${state.countries[c.occupiedBy]?.name}</span>`}
        ${c.capitulated && html`<span class="chip red">Capitulated</span>`}
        ${state.global.closedAirspace[id] && html`<span class="chip red">Airspace closed</span>`}
        ${c.bankrupt && html`<span class="chip red">Bankrupt</span>`}
        ${c.blackout && html`<span class="chip">Blackout</span>`}
        ${c.outbreak && html`<span class="chip" style="color:#b8ff6a">Outbreak ${c.outbreak.level}%</span>`}
        ${(() => { const by = [...new Set(Object.values(state.units).filter(u => u.blockadeOf === id && u.strength > 0).map(u => state.countries[u.owner]?.name))]; return by.length ? html`<span class="chip red">⚓ Blockaded by ${by.join(', ')}</span>` : ''; })()}
      </div>

      <${Fronts} conn=${conn} state=${state} id=${id} enemies=${enemies} setSelected=${setSelected} setBrush=${setBrush} />
      <${CivilWar} conn=${conn} state=${state} c=${c} setSelected=${setSelected} />

      <div class="sub-h">Quick orders</div>
      <div class="quick-grid">
        ${[['strike', '✦ Strike'], ['drone', '✈ Drone attack'], ['invade', '➤ Invade'], ['fleet', '⛴ Fleet'], ['blockade', '⛓ Blockade sea'], ['siege', '⚓ Blockade country'], ['war', '⚔ War'], ['ceasefire', '✋ Ceasefire'], ['peace', '☮ Peace'], ['sanction', '$ Sanction'], ['aid', '+ Aid'], ['arms', '⇄ Arms'], ['cyber', '⌁ Cyber'], ['spy', '◐ Spy'], ['neo', '✈ Evacuate'], ['helistrike', '🚁 Heli strike'], ['airassault', '⇣ Air assault'], ['airdrop', '☂ Paratroops']].map(([t, l]) => html`<button class="btn xs" onClick=${() => startOrder(t)}>${l}</button>`)}
      </div>
      ${aircraftFor(c.a3).length > 0 && html`<div class="quick-grid" style="margin-top:6px">
        ${aircraftFor(c.a3).flatMap(([k, v]) => k === 'b2' ? [[k, v.name.split(' ')[0] + ' strike', {}], ['b2moab', 'B-2 MOAB', { payload: 'moab' }]] : [[k, v.name.replace(/ .*/, '') + (v.type === 'bomber' ? ' run' : ' strike'), {}]]).map(([k, l, extra]) => html`<button class="btn xs" onClick=${() => startOrder('strike', { counts: { aircraft: k === 'b2moab' ? 'b2' : k, ...extra } })}>✈ ${l}</button>`)}
      </div>`}
      <${Ops} conn=${conn} state=${state} id=${id} />
      ${c.a3 === 'USA' && html`<${UsNavy} state=${state} id=${id} />`}
      <div class="row" style="margin-top:6px"><span class="dim small">Posture</span><div class="seg sm">${ROE.map(r => html`<button class=${c.roe === r ? 'on' : ''} onClick=${() => run(conn, { type: 'setRoe', country: id, roe: r })}>${r}</button>`)}</div></div>

      <div class="sub-h">Economy</div>
      <div class="stats">
        <${Stat} label="GDP" value=${html`${fmt.money(c.gdp)} <span class=${gdpPct < 98 ? 'neg small' : 'dim small'}>${gdpPct < 98 ? `▼${Math.round(100 - gdpPct)}%` : gdpPct > 102 ? `▲${Math.round(gdpPct - 100)}%` : ''}</span>`} />
        <${Stat} label="Treasury" value=${fmt.money(c.treasury)} tone=${c.treasury < 0 ? 'neg' : ''} />
        <${Stat} label="Industry" value=${`${Math.round(c.industry * 100)}%`} pct=${c.industry * 100} />
        <${Stat} label="Energy" value=${`${Math.round(c.energy * 100)}%`} pct=${c.energy * 100} />
        <${Stat} label="Inflation" value=${`${c.inflation.toFixed(1)}%`} tone=${c.inflation > 8 ? 'neg' : ''} />
        ${c.base.growth != null && html`<${Stat} label="Growth" value=${`${c.base.growth > 0 ? '+' : ''}${c.base.growth}% a year`} tone=${c.base.growth < 0 ? 'neg' : ''} />`}
        <${Stat} label="Oil" value=${c.oilNet > 0 ? `exports ${c.oilNet} mb/d` : c.oilNet < 0 ? `imports ${-c.oilNet} mb/d` : 'balanced'} />
      </div>
      <div class="sub-h">Home front</div>
      <div class="stats">
        <${Stat} label="Public support" value=${`${Math.round(c.support)}%`} pct=${c.support} />
        <${Stat} label="Stability" value=${`${Math.round(c.stability)}%`} pct=${c.stability} />
        <${Stat} label="Damage" value=${`${Math.round(c.damage * 100)}%`} tone=${c.damage > 0.2 ? 'neg' : ''} />
        <${Stat} label="Casualties" value=${fmt.big(c.casualties)} />
      </div>

      <div class="sub-h">Forces</div>
      <table class="mini-table">
        <thead><tr><th></th><th>Home</th><th>Deployed</th></tr></thead>
        <tbody>${byType.map(x => html`<tr><td>${UNIT_TYPES[x.t].name}</td><td class="mono">${x.home || '–'}</td><td class="mono">${x.away || '–'}</td></tr>`)}</tbody>
      </table>
      <div class="dim small">Air defence ${c.airDefense}/10${c.cyber?.radar >= state.meta.turn ? ' · radar hacked' : ''}${c.blindUntil >= state.meta.turn ? ' · satellites blinded' : ''}</div>
      ${foreign.length > 0 && html`<div class="small" style="margin-top:6px">Foreign forces here: ${[...new Set(foreign.map(u => u.owner))].map(o => `${state.countries[o].name} (${foreign.filter(u => u.owner === o).length})`).join(', ')}</div>`}

      <div class="sub-h">Relations</div>
      <div class="rel-cols">
        <div>${friends.map(({ o, r }) => html`<div class="rel pos" onClick=${() => setSelected(o.id)}>${o.name}<span>+${Math.round(r)}</span></div>`)}${!friends.length && html`<div class="dim small">No close friends</div>`}</div>
        <div>${foes.map(({ o, r }) => html`<div class="rel neg" onClick=${() => setSelected(o.id)}>${o.name}<span>${Math.round(r)}</span></div>`)}${!foes.length && html`<div class="dim small">No rivals</div>`}</div>
      </div>
      ${enemies.length > 0 && html`<div class="small" style="margin-top:6px"><span class="neg">At war with</span> ${enemies.map(e => state.countries[e].name).join(', ')}</div>`}
      ${c.sanctions.length > 0 && html`<div class="small">Sanctioning ${c.sanctions.map(e => state.countries[e]?.name).join(', ')}</div>`}

      <div class="row" style="margin-top:12px"><button class="btn sm" onClick=${() => setBrief(true)}>Private brief</button><button class="btn sm ghost" onClick=${() => run(conn, { type: 'setFocus', country: id })}>Zoom stage here</button></div>
      ${brief && html`<${BriefModal} conn=${conn} state=${state} c=${c} close=${() => setBrief(false)} />`}
    </div>`;
}

function DelegateName({ conn, c }) {
  const [v, setV] = useState(c.delegate || '');
  useEffect(() => setV(c.delegate || ''), [c.id]);
  return html`<input class="input sm" placeholder="Delegate's name (optional)" value=${v} onInput=${e => setV(e.target.value)} onBlur=${() => v !== (c.delegate || '') && run(conn, { type: 'setDelegate', country: c.id, delegate: v })} />`;
}

// A printable one-page brief for the chair to hand to a delegate: generated from the live world plus the Zeus's notes.
function BriefModal({ conn, state, c, close }) {
  const [notes, setNotes] = useState(c.brief || '');
  const enemies = state.wars.filter(w => w.a === c.id || w.b === c.id).map(w => state.countries[w.a === c.id ? w.b : w.a].name);
  const allies = Object.values(state.countries).filter(o => o.id !== c.id && o.major && (c.bloc !== 'N' && o.bloc === c.bloc)).map(o => o.name);
  const units = Object.values(state.units).filter(u => u.owner === c.id);
  const count = t => units.filter(u => u.type === t).length;
  const print = () => {
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Brief: ${c.name}</title><style>body{font:14px/1.5 Georgia,serif;max-width:680px;margin:40px auto;color:#111}h1{font:700 26px Arial;letter-spacing:.08em;margin:0}h2{font:700 12px Arial;letter-spacing:.2em;text-transform:uppercase;color:#a00;margin:24px 0 6px}.stamp{border:3px solid #a00;color:#a00;display:inline-block;padding:2px 10px;font:700 12px Arial;letter-spacing:.3em;transform:rotate(-3deg);margin-bottom:12px}td{padding:2px 14px 2px 0}</style></head><body>
      <div class="stamp">EYES ONLY</div><h1>${c.name.toUpperCase()}</h1><div>${state.name} · ${fmt.date(state.meta.clock)}</div>
      <h2>Situation</h2><p>${enemies.length ? `You are at war with ${enemies.join(', ')}.` : 'You are not at war.'} ${allies.length ? `Your bloc: ${allies.slice(0, 8).join(', ')}.` : 'You stand outside the blocs.'} Global tension is ${state.global.tension}/10 (${tensionLevel(state.global.tension).name}). Oil trades at $${Math.round(state.global.oilPrice)}.</p>
      <h2>Your country</h2><table><tr><td>Economy</td><td>${fmt.money(c.gdp)} (${Math.round((c.gdp / c.base.gdp) * 100)}% of pre-crisis)</td></tr><tr><td>Treasury</td><td>${fmt.money(c.treasury)}</td></tr><tr><td>Public support</td><td>${Math.round(c.support)}%</td></tr><tr><td>Nuclear</td><td>${c.nuclear.has ? 'Yes' : 'No'}</td></tr></table>
      <h2>Forces</h2><table>${Object.keys(UNIT_TYPES).filter(count).map(t => `<tr><td>${UNIT_TYPES[t].name}s</td><td>${count(t)}</td></tr>`).join('')}</table>
      ${notes ? `<h2>From the crisis team</h2><p>${notes.replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>` : ''}
      </body></html>`);
    w.document.close(); w.focus(); w.print();
  };
  return html`<div class="modal-back" onClick=${e => e.target === e.currentTarget && close()}>
    <div class="modal card">
      <div class="card-h"><h3>Private brief · ${c.name}</h3><div class="grow"></div><button class="btn xs ghost" onClick=${close}>✕</button></div>
      <div class="card-b col">
        <p class="muted" style="margin:0">Generated from the live world. Add anything the delegate should know (secret objectives come from the chair).</p>
        <textarea class="input" rows="6" placeholder="Notes for this delegate" value=${notes} onInput=${e => setNotes(e.target.value)}></textarea>
        <div class="row"><div class="grow"></div><button class="btn" onClick=${() => run(conn, { type: 'setBrief', country: c.id, text: notes }, 'Saved')}>Save notes</button><button class="btn primary" onClick=${print}>Print brief</button></div>
      </div>
    </div>
  </div>`;
}

// The US Navy by name: each carrier strike group and where the numbered fleets are.
function UsNavy({ state, id }) {
  const ships = Object.values(state.units).filter(u => u.owner === id && u.strength > 0 && (u.type === 'carrier' || u.type === 'fleet') && u.loc.kind === 'sea');
  if (!ships.length) return '';
  const carriers = ships.filter(u => u.type === 'carrier');
  const fleets = new Map();
  for (const u of ships.filter(u => u.type === 'fleet')) { const n = navalLabel(u, 'USA', true); fleets.set(n, [...(fleets.get(n) || []), u]); }
  const where = u => SEA_ZONES[u.loc.id]?.name || u.loc.id;
  return html`<details class="us-navy" style="margin-top:8px"><summary class="sub-h" style="cursor:pointer">US Navy at sea <span class="dim">(${carriers.length} carrier groups, ${ships.length - carriers.length} surface groups)</span></summary>
    ${carriers.map(u => html`<div class="row small"><span class="grow">✈ ${navalLabel(u, 'USA').replace(' carrier strike group', '')}</span><span class="dim">${where(u)}${u.blockade ? ' · blockading' : ''}</span></div>`)}
    ${[...fleets].map(([n, us]) => html`<div class="row small"><span class="grow">⛴ ${n} · ${us.length} surface group${us.length > 1 ? 's' : ''}</span><span class="dim">${[...new Set(us.map(where))].join(', ')}</span></div>`)}
  </details>`;
}

function ZoneCard({ conn, state, selZone, startOrder }) {
  const z = SEA_ZONES[selZone], cp = state.global.chokepoints[selZone];
  const ships = Object.values(state.units).filter(u => u.loc.kind === 'sea' && u.loc.id === selZone && u.strength > 0);
  const owners = [...new Set(ships.map(u => u.owner))];
  return html`<div class="pane inspector">
    <div class="insp-head" style="--bloc:#36e2ff"><div class="grow"><div class="insp-name">${z.name}</div></div></div>
    ${cp && html`<div class="card" style="margin:10px 0"><div class="card-b"><div class="row between"><b>Chokepoint</b><span class=${cls('chip', cp.status === 'closed' ? 'red' : cp.status === 'contested' ? 'gold' : 'green')}>${cp.status}${cp.by ? ` by ${state.countries[cp.by]?.name}` : ''}</span></div><div class="dim small" style="margin-top:4px">Closing it adds about $${z.oil} to a barrel of oil and forces shipping the long way round.</div></div></div>`}
    <div class="sub-h">Coastal states</div>
    <div class="small">${z.coasts.map(id => state.countries[id]?.name).filter(Boolean).join(', ') || 'Open ocean'}</div>
    <div class="sub-h">Warships here</div>
    ${owners.length === 0 && html`<div class="empty">No warships.</div>`}
    ${owners.map(o => html`<div class="row small"><i class="dot" style=${`background:${state.blocs[state.countries[o].bloc].color}`}></i><span class="grow">${state.countries[o].name}</span><span class="mono">${ships.filter(u => u.owner === o).map(u => (u.type === 'carrier' ? 'CV' : 'F')).join(' ')}</span>${ships.some(u => u.owner === o && u.blockade) ? html`<span class="chip red">blockading${(() => { const t = ships.find(u => u.owner === o && u.blockadeOf)?.blockadeOf; return t ? ` ${state.countries[t]?.name}` : ''; })()}</span>` : ''}</div>
      ${state.countries[o].a3 === 'USA' && ships.filter(u => u.owner === o).map(u => html`<div class="dim small" style="padding-left:16px">${u.type === 'carrier' ? '✈' : '⛴'} ${navalLabel(u, 'USA')}</div>`)}`)}
    <div class="row" style="margin-top:12px"><button class="btn sm" onClick=${() => startOrder('fleet', { zone: selZone, country: null })}>Send a fleet here</button><button class="btn sm" onClick=${() => startOrder('blockade', { zone: selZone, country: null })}>Blockade</button>${SEA_ZONES[selZone]?.choke && html`<button class="btn sm danger" title="Sail in against the blockade: shore batteries and the blockading fleet fight back" onClick=${() => startOrder('force', { zone: selZone, country: null })}>Force open</button>`}</div>
    <button class="btn sm ghost" style="margin-top:6px" onClick=${() => run(conn, { type: 'setFocus', zone: selZone })}>Zoom stage here</button>
  </div>`;
}

function WorldOverview({ conn, state, setSelected }) {
  const fronts = Object.values(state.countries).filter(c => c.front);
  const g = state.global, lvl = tensionLevel(g.tension);
  const h = state.history.slice(-16);
  const spark = (key, max) => {
    const vals = h.map(x => x[key]);
    const mx = max ?? Math.max(...vals, 1), mn = Math.min(...vals, 0);
    return vals.map((v, i) => `${(i / Math.max(1, vals.length - 1)) * 100},${30 - ((v - mn) / (mx - mn || 1)) * 28}`).join(' ');
  };
  const players = Object.values(state.countries).filter(c => c.control === 'player');
  return html`<div class="pane inspector">
    <div class="pane-h"><h2>The world</h2><span class="dim small">Click a country or sea</span></div>
    <div class="tension-ladder">
      ${[...TENSION_LEVELS].reverse().map((l, i) => html`<div class=${cls('tl-row', lvl.name === l.name && 'on')} style=${`--c:${['#ff4d5e', '#ff7a45', '#ffb224', '#7fd4ff', '#3ddc97'][i]}`}><span>${l.name}</span><span class="dim">${l.max - 1.5 > 0 ? l.max - 2 + 0.5 : 0}–${l.max}</span></div>`)}
      <div class="tl-val">${g.tension}<span>/10</span></div>
    </div>
    <div class="spark-grid">
      <div class="spark"><span class="dim small">Tension</span><b>${g.tension}</b><svg viewBox="0 0 100 32" preserveAspectRatio="none"><polyline points=${spark('tension', 10)} /></svg></div>
      <div class="spark"><span class="dim small">Oil $/bbl</span><b>${Math.round(g.oilPrice)}</b><svg viewBox="0 0 100 32" preserveAspectRatio="none"><polyline points=${spark('oil')} /></svg></div>
      <div class="spark"><span class="dim small">World economy</span><b>${Math.round(g.gdpIndex * 100)}%</b><svg viewBox="0 0 100 32" preserveAspectRatio="none"><polyline points=${spark('gdpIndex')} /></svg></div>
      <div class="spark"><span class="dim small">Refugees</span><b>${fmt.refugees(g.refugees)}</b><svg viewBox="0 0 100 32" preserveAspectRatio="none"><polyline points=${spark('refugees')} /></svg></div>
    </div>
    ${fronts.length > 0 && html`<div class="sub-h">War fronts (${fronts.length})</div>${fronts.map(c => html`<${FrontRow} conn=${conn} state=${state} c=${c} setSelected=${setSelected} named />`)}`}
    <div class="sub-h">Delegates (${players.length})</div>
    ${players.length === 0 && html`<div class="empty">No delegate countries yet. Use the Countries tab or type <span class="mono">player egypt uae</span>.</div>`}
    ${players.map(c => html`<div class="crow" onClick=${() => setSelected(c.id)}><i class="bloc-sw" style=${`background:${state.blocs[c.bloc].color}`}></i><div class="grow"><b>${c.name}</b>${c.delegate ? html` <span class="dim small">${c.delegate}</span>` : ''}<div class="dim small">${fmt.money(c.gdp)} · ${Math.round(c.support)}% support</div></div>${state.wars.some(w => w.a === c.id || w.b === c.id) && html`<span class="chip red">war</span>`}</div>`)}
    <div class="sub-h">Chokepoints</div>
    ${Object.entries(g.chokepoints).map(([z, cp]) => html`<div class="row small"><i class="dot" style=${`background:${cp.status === 'closed' ? 'var(--red)' : cp.status === 'contested' ? 'var(--gold)' : 'var(--green)'}`}></i><span class="grow">${SEA_ZONES[z].name}</span><span class="dim">${cp.status}</span></div>`)}
  </div>`;
}

// War fronts: how much ground each attacker holds, and the Zeus's orders for each front.
const MODES = [['auto', 'Battle decides', 'The engine moves the front from each turn\'s fighting'], ['advance', 'Advance', 'The attacker gains ground every turn'], ['hold', 'Hold', 'The line does not move'], ['retreat', 'Fall back', 'The defender retakes ground every turn']];

function Fronts({ conn, state, id, enemies, setSelected, setBrush }) {
  const c = state.countries[id];
  const mine = Object.values(state.countries).filter(o => o.front?.by === id);
  // Enemies this country is at war with but has no front in yet.
  const open = enemies.filter(e => state.countries[e].front?.by !== id && !state.countries[e].front);
  // Enemies that could open a front inside this country.
  const invaders = c.front ? [] : enemies;
  if (!c.front && !mine.length && !open.length && !enemies.length) return null;
  const draw = owner => setBrush?.({ owner, mode: 'take', r: 9 });
  return html`<div class="sub-h">War fronts</div>
    ${c.front && html`<${FrontRow} conn=${conn} state=${state} c=${c} setSelected=${setSelected} />`}
    ${mine.map(o => html`<${FrontRow} conn=${conn} state=${state} c=${o} setSelected=${setSelected} named />`)}
    ${open.length > 0 && html`<div class="row wrap small" style="gap:6px;margin-top:4px"><span class="dim">Push into</span>${open.map(e => html`<button class="btn xs" title=${`Open a front: ${c.name} takes ground in ${state.countries[e].name} right now`} onClick=${() => run(conn, { type: 'frontPush', country: e, by: id, delta: 10 })}>${state.countries[e].name} +10%</button>`)}</div>`}
    ${invaders.length > 0 && html`<div class="row wrap small" style="gap:6px;margin-top:4px"><span class="dim">Advance here</span>${invaders.map(e => html`<button class="btn xs" title=${`Open a front: ${state.countries[e].name} takes ground in ${c.name} right now`} onClick=${() => run(conn, { type: 'frontPush', country: id, by: e, delta: 10 })}>${state.countries[e].name} +10%</button>`)}</div>`}
    ${setBrush && enemies.length > 0 && html`<div class="row wrap small" style="gap:6px;margin-top:6px"><span class="dim">Draw on the map</span>
      <button class="btn xs gold" title=${`Paint ground ${c.name} takes`} onClick=${() => draw(id)}>✎ ${c.name}</button>
      ${enemies.slice(0, 4).map(e => html`<button class="btn xs" title=${`Paint ground ${state.countries[e].name} takes`} onClick=${() => draw(e)}>✎ ${state.countries[e].name}</button>`)}
      <button class="btn xs ghost" title="Paint over held ground to give it back" onClick=${() => setBrush({ owner: id, mode: 'restore', r: 9 })}>⌫ Give back</button>
    </div>`}`;
}

// Civil war: part of the country breaks away under a rebel banner.
function CivilWar({ conn, state, c, setSelected }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [share, setShare] = useState(30);
  if (c.rebelOf) return null;
  const factions = Object.values(state.countries).filter(f => f.rebelOf === c.id && state.wars.some(w => w.civil && (w.a === f.id || w.b === f.id)));
  const fight = factions.length ? html`<div class="row small wrap" style="margin-top:6px"><span class="chip gold">Civil war</span>${factions.map(f => html`<b class="click" onClick=${() => setSelected(f.id)}>${f.name}</b>`)}<span class="dim">vs ${c.name}</span></div>` : null;
  const go = async () => {
    const r = await run(conn, { type: 'civilWar', country: c.id, share, name: name.trim() });
    if (r.ok) { setOpen(false); setName(''); }
  };
  if (!open) return html`${fight}<div class="row" style="margin-top:6px"><button class="btn xs" onClick=${() => setOpen(true)} title="A rebel faction seizes part of the country, with defecting troops">✊ ${factions.length ? 'Add another faction' : 'Start a civil war'}</button></div>`;
  return html`<div class="civil-box col">
    <div class="row between"><b class="small">Civil war in ${c.name}</b><button class="btn xs ghost" onClick=${() => setOpen(false)}>✕</button></div>
    <input class="input sm" placeholder=${`Rebel name, e.g. Free ${c.name} Army`} value=${name} onInput=${e => setName(e.target.value)} />
    <div class="row small"><span class="dim">Rebels take</span><div class="seg sm">${[15, 30, 45, 60].map(p => html`<button class=${share === p ? 'on' : ''} onClick=${() => setShare(p)}>${p}%</button>`)}</div></div>
    <button class="btn sm danger" onClick=${go}>Start the civil war</button>
  </div>`;
}

function FrontRow({ conn, state, c, setSelected, named }) {
  const f = c.front, by = state.countries[f.by];
  const col = by.bloc !== 'N' ? state.blocs[by.bloc].color : '#ff8a3d';
  const mode = f.mode || 'auto';
  const push = delta => run(conn, { type: 'frontPush', country: c.id, delta });
  return html`<div class="front-row">
    <div class="row between small">
      <span><b style=${`color:${col}`} class="click" onClick=${() => setSelected(by.id)}>${by.name}</b> holds <b class=${named ? 'click' : ''} onClick=${() => named && setSelected(c.id)}>${f.pct > 0 && f.pct < 1 ? '<1' : Math.round(f.pct)}%</b> of ${named ? html`<b class="click" onClick=${() => setSelected(c.id)}>${c.name}</b>` : c.name}</span>
      ${c.occupiedBy && html`<span class="chip red">occupied</span>`}
    </div>
    <div class="front-bar"><i style=${`width:${f.pct}%;background:${col}`}></i></div>
    <div class="seg sm front-modes">${MODES.map(([k, l, t]) => html`<button class=${mode === k ? 'on' : ''} title=${t} onClick=${() => run(conn, { type: 'frontMode', country: c.id, mode: k })}>${l}</button>`)}</div>
    <div class="row small" style="gap:4px;margin-top:4px"><span class="dim grow">Move now</span>
      <button class="btn xs" onClick=${() => push(-25)}>−25</button><button class="btn xs" onClick=${() => push(-10)}>−10</button>
      <button class="btn xs" onClick=${() => push(10)}>+10</button><button class="btn xs" onClick=${() => push(25)}>+25</button>
    </div>
  </div>`;
}

// Standing operations for a country: set once, they repeat every turn until stopped.
const OPS = [['bombing', '✦ Bombing campaign', 'Strikes every turn on a rotating target type'], ['drones', '✈ Drone raids', 'A drone swarm every turn'], ['invasion', '➤ Combined-arms invasion', 'Invasion each turn, with bombing and air patrols alongside (Kronos can switch the extras off)'], ['patrol', '◎ Air patrol', 'Fighters fly patrols over home each turn']];
function Ops({ conn, state, id }) {
  const c = state.countries[id];
  const mine = (state.ops || []).filter(o => o.country === id);
  const foes = [...new Set(state.wars.filter(w => w.a === id || w.b === id).map(w => (w.a === id ? w.b : w.a)))];
  const [target, setTarget] = useState('');
  const t = target || foes[0] || '';
  const others = Object.values(state.countries).filter(o => o.id !== id && !isOOB(o.id) && o.control !== 'inactive' && !o.rebelOf).sort((a, b) => a.name.localeCompare(b.name));
  return html`<div class="sub-h" style="margin-top:8px">Standing operations</div>
    <div class="row wrap" style="gap:6px"><select class="input" style="flex:1" value=${t} onChange=${e => setTarget(e.target.value)}>
      <option value="">Target…</option>${foes.length ? html`<optgroup label="At war">${foes.map(f => html`<option value=${f}>${state.countries[f].name}</option>`)}</optgroup>` : ''}<optgroup label="Everyone">${others.map(o => html`<option value=${o.id}>${o.name}</option>`)}</optgroup>
    </select></div>
    <div class="quick-grid" style="margin-top:4px">${OPS.map(([k, l, hint]) => html`<button class=${cls('btn xs', mine.some(o => o.kind === k && (k === 'patrol' || o.target === t)) && 'on')} title=${hint} onClick=${() => run(conn, { type: 'setOp', country: id, kind: k, target: t || undefined, on: !mine.some(o => o.kind === k && (k === 'patrol' || o.target === t)) })}>${l}</button>`)}</div>
    ${mine.length > 0 && html`<div class="small dim" style="margin-top:4px">${mine.map(o => html`<span class="chip" style="margin-right:4px">${OPS.find(x => x[0] === o.kind)?.[1].slice(2)}${o.target ? ` → ${state.countries[o.target]?.name}` : ''} <a onClick=${() => run(conn, { type: 'setOp', country: id, kind: o.kind, target: o.target, on: false })} style="cursor:pointer">✕</a></span>`)}</div>`}`;
}
