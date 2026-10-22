// Right-hand inspector: the selected country (or sea zone), or a world overview when nothing is selected.
import { html, useState, useEffect, run, fmt, cls } from '../lib.js';
import { SEA_ZONES } from '/shared/data/places.js';
import { UNIT_TYPES, ROE, BLOCS, tensionLevel, TENSION_LEVELS, relation } from '/shared/engine/core.js';
import { ALLIANCE_NAMES } from '/shared/data/countries.js';

const Stat = ({ label, value, pct, tone, hint }) => html`
  <div class="stat" title=${hint || ''}>
    <div class="row between"><span class="dim small">${label}</span><b class=${tone || ''}>${value}</b></div>
    ${pct !== undefined && html`<div class="bar"><i style=${`width:${Math.max(0, Math.min(100, pct))}%;background:${pct < 30 ? 'var(--red)' : pct < 55 ? 'var(--gold)' : 'var(--green)'}`}></i></div>`}
  </div>`;

export function Inspector(props) {
  const { state, selected, selZone } = props;
  if (selected && state.countries[selected]) return html`<${CountryCard} ...${props} />`;
  if (selZone && SEA_ZONES[selZone]) return html`<${ZoneCard} ...${props} />`;
  return html`<${WorldOverview} ...${props} />`;
}

function CountryCard({ conn, state, selected: id, setSelected, startOrder, kronos }) {
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
        <div class="grow">
          <div class="insp-name">${c.name}</div>
          <div class="ar dim" dir="rtl">${c.ar}</div>
        </div>
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
      </div>

      <div class="sub-h">Quick orders</div>
      <div class="quick-grid">
        ${[['strike', '✦ Strike'], ['invade', '➤ Invade'], ['fleet', '⛴ Fleet'], ['blockade', '⛓ Blockade'], ['war', '⚔ War'], ['ceasefire', '✋ Ceasefire'], ['peace', '☮ Peace'], ['sanction', '$ Sanction'], ['aid', '+ Aid'], ['arms', '⇄ Arms'], ['cyber', '⌁ Cyber'], ['spy', '◐ Spy']].map(([t, l]) => html`<button class="btn xs" onClick=${() => startOrder(t)}>${l}</button>`)}
      </div>
      <div class="row" style="margin-top:6px"><span class="dim small">Posture</span><div class="seg sm">${ROE.map(r => html`<button class=${c.roe === r ? 'on' : ''} onClick=${() => run(conn, { type: 'setRoe', country: id, roe: r })}>${r}</button>`)}</div></div>

      <div class="sub-h">Economy</div>
      <div class="stats">
        <${Stat} label="GDP" value=${html`${fmt.money(c.gdp)} <span class=${gdpPct < 98 ? 'neg small' : 'dim small'}>${gdpPct < 98 ? `▼${Math.round(100 - gdpPct)}%` : gdpPct > 102 ? `▲${Math.round(gdpPct - 100)}%` : ''}</span>`} />
        <${Stat} label="Treasury" value=${fmt.money(c.treasury)} tone=${c.treasury < 0 ? 'neg' : ''} />
        <${Stat} label="Industry" value=${`${Math.round(c.industry * 100)}%`} pct=${c.industry * 100} />
        <${Stat} label="Energy" value=${`${Math.round(c.energy * 100)}%`} pct=${c.energy * 100} />
        <${Stat} label="Inflation" value=${`${c.inflation.toFixed(1)}%`} tone=${c.inflation > 8 ? 'neg' : ''} />
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

function ZoneCard({ conn, state, selZone, startOrder }) {
  const z = SEA_ZONES[selZone], cp = state.global.chokepoints[selZone];
  const ships = Object.values(state.units).filter(u => u.loc.kind === 'sea' && u.loc.id === selZone && u.strength > 0);
  const owners = [...new Set(ships.map(u => u.owner))];
  return html`<div class="pane inspector">
    <div class="insp-head" style="--bloc:#36e2ff"><div class="grow"><div class="insp-name">${z.name}</div><div class="ar dim" dir="rtl">${z.ar}</div></div></div>
    ${cp && html`<div class="card" style="margin:10px 0"><div class="card-b"><div class="row between"><b>Chokepoint</b><span class=${cls('chip', cp.status === 'closed' ? 'red' : cp.status === 'contested' ? 'gold' : 'green')}>${cp.status}${cp.by ? ` by ${state.countries[cp.by]?.name}` : ''}</span></div><div class="dim small" style="margin-top:4px">Closing it adds about $${z.oil} to a barrel of oil and forces shipping the long way round.</div></div></div>`}
    <div class="sub-h">Coastal states</div>
    <div class="small">${z.coasts.map(id => state.countries[id]?.name).filter(Boolean).join(', ') || 'Open ocean'}</div>
    <div class="sub-h">Warships here</div>
    ${owners.length === 0 && html`<div class="empty">No warships.</div>`}
    ${owners.map(o => html`<div class="row small"><i class="dot" style=${`background:${state.blocs[state.countries[o].bloc].color}`}></i><span class="grow">${state.countries[o].name}</span><span class="mono">${ships.filter(u => u.owner === o).map(u => (u.type === 'carrier' ? 'CV' : 'F')).join(' ')}</span>${ships.some(u => u.owner === o && u.blockade) ? html`<span class="chip red">blockading</span>` : ''}</div>`)}
    <div class="row" style="margin-top:12px"><button class="btn sm" onClick=${() => startOrder('fleet', { zone: selZone, country: null })}>Send a fleet here</button><button class="btn sm" onClick=${() => startOrder('blockade', { zone: selZone, country: null })}>Blockade</button></div>
    <button class="btn sm ghost" style="margin-top:6px" onClick=${() => run(conn, { type: 'setFocus', zone: selZone })}>Zoom stage here</button>
  </div>`;
}

function WorldOverview({ state, setSelected }) {
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
    <div class="sub-h">Delegates (${players.length})</div>
    ${players.length === 0 && html`<div class="empty">No delegate countries yet. Use the Countries tab or type <span class="mono">player saudi uae</span>.</div>`}
    ${players.map(c => html`<div class="crow" onClick=${() => setSelected(c.id)}><i class="bloc-sw" style=${`background:${state.blocs[c.bloc].color}`}></i><div class="grow"><b>${c.name}</b>${c.delegate ? html` <span class="dim small">${c.delegate}</span>` : ''}<div class="dim small">${fmt.money(c.gdp)} · ${Math.round(c.support)}% support</div></div>${state.wars.some(w => w.a === c.id || w.b === c.id) && html`<span class="chip red">war</span>`}</div>`)}
    <div class="sub-h">Chokepoints</div>
    ${Object.entries(g.chokepoints).map(([z, cp]) => html`<div class="row small"><i class="dot" style=${`background:${cp.status === 'closed' ? 'var(--red)' : cp.status === 'contested' ? 'var(--gold)' : 'var(--green)'}`}></i><span class="grow">${SEA_ZONES[z].name}</span><span class="dim">${cp.status}</span></div>`)}
  </div>`;
}
