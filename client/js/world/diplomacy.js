// Diplomacy tools: UN votes, the peace treaty builder, humanitarian pauses, and the list of wars.
import { html, useState, run, toast, cls } from '../lib.js';
import { CountrySelect } from './tabs.js';
import { PeaceOptions } from './peaceterms.js';
import { unVoters, aiVote } from '/shared/engine/core.js';

export function DiplomacyTab({ conn, state }) {
  const [section, setSection] = useState('un');
  return html`
    <div class="pane">
      <div class="pane-h"><h2>Diplomacy</h2></div>
      <div class="seg" style="margin-bottom:10px">${[['un', 'UN vote'], ['treaty', 'Treaty'], ['wars', 'Wars & pacts']].map(([k, l]) => html`<button class=${section === k ? 'on' : ''} onClick=${() => setSection(k)}>${l}</button>`)}</div>
      ${section === 'un' && html`<${UNVote} conn=${conn} state=${state} />`}
      ${section === 'treaty' && html`<${TreatyBuilder} conn=${conn} state=${state} />`}
      ${section === 'wars' && html`<${WarsList} conn=${conn} state=${state} />`}
    </div>`;
}

function UNVote({ conn, state }) {
  const open = state.unVotes.find(v => v.open);
  const [f, setF] = useState({ title: '', body: 'assembly', kind: 'condemn', sponsor: null, target: null, delegatesOnly: true, preset: {} });
  const set = p => setF({ ...f, ...p });
  if (open) {
    const ids = Object.keys(open.votes);
    const tally = { yes: 0, no: 0, abstain: 0 };
    for (const id of ids) tally[open.votes[id]]++;
    const vetoes = open.body === 'council' ? ids.filter(id => open.votes[id] === 'no' && state.countries[id].veto) : [];
    return html`<div class="col">
      <div class="card"><div class="card-b">
        <div class="up dim">${open.body === 'council' ? 'Security Council' : 'General Assembly'} · ${open.kind}</div>
        <div style="font-size:16px;font-weight:700;margin:4px 0 10px">${open.title}</div>
        <div class="vote-bars">
          <div class="vb yes" style=${`flex:${tally.yes || 0.001}`}>${tally.yes} yes</div>
          <div class="vb abs" style=${`flex:${tally.abstain || 0.001}`}>${tally.abstain}</div>
          <div class="vb no" style=${`flex:${tally.no || 0.001}`}>${tally.no} no</div>
        </div>
        ${vetoes.length > 0 && html`<div class="neg small" style="margin-top:6px">Veto: ${vetoes.map(id => state.countries[id].name).join(', ')}</div>`}
      </div></div>
      <p class="pane-hint">Computer-run countries have voted. Set each delegate's vote as the chair reads them out.</p>
      <div class="list compact">
        ${ids.sort((a, b) => (state.countries[b].control === 'player') - (state.countries[a].control === 'player') || state.countries[a].name.localeCompare(state.countries[b].name)).map(id => {
          const c = state.countries[id];
          return html`<div class="row vote-row" key=${id}>
            <span class="grow ellipsis">${c.control === 'player' ? html`<b>${c.name}</b>` : c.name}${c.veto && open.body === 'council' ? html` <span class="chip gold">P5</span>` : ''}</span>
            <div class="seg sm">${['yes', 'abstain', 'no'].map(ch => html`<button class=${cls(open.votes[id] === ch && 'on', ch)} onClick=${() => run(conn, { type: 'voteCast', country: id, choice: ch })}>${ch}</button>`)}</div>
          </div>`;
        })}
      </div>
      <div class="row"><button class="btn" onClick=${() => run(conn, { type: 'setScene', scene: 'vote' })}>Show on stage</button><div class="grow"></div><button class="btn primary" onClick=${() => run(conn, { type: 'voteClose' }, r => (r.result.passed ? 'Resolution passed' : 'Resolution failed'))}>Close vote</button></div>
    </div>`;
  }
  const lastVote = [...state.unVotes].reverse().find(v => !v.open);
  return html`<div class="col">
    <label class="field">Resolution<input class="input" placeholder="e.g. Demands an immediate ceasefire in the Gulf" value=${f.title} onInput=${e => set({ title: e.target.value })} /></label>
    <div class="row">
      <label class="field grow">Body<select class="input" value=${f.body} onChange=${e => set({ body: e.target.value })}><option value="assembly">General Assembly</option><option value="council">Security Council (veto)</option></select></label>
      <label class="field grow">Type<select class="input" value=${f.kind} onChange=${e => set({ kind: e.target.value })}><option value="condemn">Condemn</option><option value="sanction">Sanctions</option><option value="ceasefire">Ceasefire</option><option value="humanitarian">Humanitarian</option><option value="custom">Other</option></select></label>
    </div>
    <label class="field">Sponsor<${CountrySelect} state=${state} value=${f.sponsor} onChange=${v => set({ sponsor: v })} placeholder="None" /></label>
    <label class="field">Directed at<${CountrySelect} state=${state} value=${f.target} onChange=${v => set({ target: v })} placeholder="Nobody in particular" /></label>
    <label class="field">Who votes<div class="seg">
      <button class=${f.delegatesOnly ? 'on' : ''} onClick=${() => set({ delegatesOnly: true })}>Delegations only</button>
      <button class=${!f.delegatesOnly ? 'on' : ''} onClick=${() => set({ delegatesOnly: false })}>Every major country</button></div></label>
    <${VotePrep} state=${state} f=${f} set=${set} />
    <button class="btn primary" disabled=${!f.title.trim()} onClick=${async () => { const r = await run(conn, { type: 'voteOpen', ...f }); if (r?.ok) set({ preset: {} }); }}>Open the vote and show it on stage</button>
    ${lastVote && html`<div class="card"><div class="card-b small"><b>${lastVote.result.passed ? 'Passed' : 'Failed'}:</b> ${lastVote.title} (${lastVote.result.yes}–${lastVote.result.no}–${lastVote.result.abstain})${lastVote.result.vetoes.length ? `, vetoed by ${lastVote.result.vetoes.map(id => state.countries[id].name).join(', ')}` : ''}</div></div>`}
  </div>`;
}

// Prepare votes before opening: set any country's vote by hand; the rest are picked automatically when it opens.
function VotePrep({ state, f, set }) {
  const list = unVoters(state, f.body, f.delegatesOnly).sort((a, b) => a.name.localeCompare(b.name));
  const preview = { title: f.title, kind: f.kind, sponsor: f.sponsor, target: f.target };
  const setVote = (id, ch) => { const p = { ...f.preset }; if (ch === 'auto') delete p[id]; else p[id] = ch; set({ preset: p }); };
  const fill = () => { const p = { ...f.preset }; for (const c of list) if (!p[c.id]) p[c.id] = aiVote(state, c, preview); set({ preset: p }); };
  return html`<details class="vote-prep" open=${Object.keys(f.preset).length > 0}>
    <summary>Prepare votes <span class="dim small">· ${list.length} voting · ${Object.keys(f.preset).length} set by hand</span></summary>
    <div class="row" style="margin:6px 0"><button class="btn xs" onClick=${fill}>Suggest the rest</button><button class="btn xs ghost" onClick=${() => set({ preset: {} })}>Clear</button><span class="dim small grow">Anything left on auto is picked when the vote opens.</span></div>
    <div class="list compact">${list.map(c => html`<div class="row vote-row" key=${c.id}>
      <span class="grow ellipsis">${c.control === 'player' ? html`<b>${c.name}</b>` : c.name}${c.veto && f.body === 'council' ? html` <span class="chip gold">P5</span>` : ''}</span>
      <div class="seg sm">${['auto', 'yes', 'abstain', 'no'].map(ch => html`<button class=${cls((f.preset[c.id] || 'auto') === ch && 'on', ch)} onClick=${() => setVote(c.id, ch)}>${ch}</button>`)}</div>
    </div>`)}</div>
  </details>`;
}

function TreatyBuilder({ conn, state }) {
  const t = state.draftTreaty;
  const [f, setF] = useState(() => t ? { title: t.title, kind: t.kind, parties: t.parties, terms: t.terms } : { title: 'Treaty of Riyadh', kind: 'peace', parties: [], terms: { returnTerritory: true, reparations: 0, demilitarize: false, clauses: [] } });
  const [clause, setClause] = useState('');
  const set = p => setF({ ...f, ...p });
  const terms = f.terms;
  const push = async next => { setF(next); await conn.act({ type: 'treatyDraft', ...next }); };
  return html`<div class="col">
    <label class="field">Title<input class="input" value=${f.title} onInput=${e => set({ title: e.target.value })} onBlur=${() => f.parties.length > 1 && push(f)} /></label>
    <label class="field">Kind<div class="seg">${['peace', 'ceasefire', 'alliance', 'trade'].map(k => html`<button class=${f.kind === k ? 'on' : ''} onClick=${() => push({ ...f, kind: k })}>${k}</button>`)}</div></label>
    <label class="field">Parties
      <div class="chips">${f.parties.map(id => html`<span class="chip">${state.countries[id].name} <button class="x" onClick=${() => push({ ...f, parties: f.parties.filter(x => x !== id) })}>✕</button></span>`)}</div>
      <${CountrySelect} state=${state} value=${null} onChange=${v => v && !f.parties.includes(v) && push({ ...f, parties: [...f.parties, v] })} placeholder="Add a party…" />
    </label>
    ${f.kind === 'peace' && html`<${PeaceOptions} state=${state} terms=${terms} parties=${f.parties} onChange=${t => push({ ...f, terms: t })} />`}
    <label class="field">Clauses
      ${(terms.clauses || []).map((c, i) => html`<div class="row clause"><span class="dim mono">${i + 1}.</span><span class="grow">${c}</span><button class="btn xs ghost" onClick=${() => push({ ...f, terms: { ...terms, clauses: terms.clauses.filter((_, j) => j !== i) } })}>✕</button></div>`)}
      <div class="row"><input class="input grow" placeholder="Add a clause the delegates agreed" value=${clause} onInput=${e => setClause(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter' && clause.trim()) { push({ ...f, terms: { ...terms, clauses: [...(terms.clauses || []), clause.trim()] } }); setClause(''); } }} /></div>
    </label>
    ${t && html`<div class="card"><div class="card-b">
      <div class="up dim" style="margin-bottom:6px">Signatures</div>
      ${t.parties.map(id => html`<div class="row sig-row"><span class="grow">${state.countries[id].name}</span>${t.signed.includes(id) ? html`<span class="chip green">✓ Signed</span>` : html`<button class="btn xs" onClick=${() => run(conn, { type: 'treatySign', country: id })}>Sign</button>`}</div>`)}
      ${t.signedAt ? html`<div class="pos" style="margin-top:6px">Treaty in force.</div>` : ''}
    </div></div>`}
    <div class="row wrap">
      <button class="btn" disabled=${!t} onClick=${() => run(conn, { type: 'setScene', scene: 'treaty' })}>Show on stage</button>
      <button class="btn primary" disabled=${!t || t.signedAt} onClick=${() => run(conn, { type: 'treatySign', all: true }, 'Treaty signed by every party')}>Everyone signs</button>
      <button class="btn ghost" disabled=${!t} onClick=${() => { conn.act({ type: 'treatyClear' }); setF({ title: 'Treaty of Riyadh', kind: 'peace', parties: [], terms: { returnTerritory: true, reparations: 0, demilitarize: false, clauses: [] } }); }}>New</button>
    </div>
  </div>`;
}

function WarsList({ conn, state }) {
  const [turns, setTurns] = useState(1);
  const name = id => state.countries[id]?.name || id;
  const pacts = state.treaties.filter(t => t.type !== 'trade').slice(-30).reverse();
  return html`<div class="col">
    <div class="card"><div class="card-b col">
      <div class="row"><b class="grow">Humanitarian pause</b>${state.global.pauseUntil >= state.meta.turn && html`<span class="chip green">until turn ${state.global.pauseUntil}</span>`}</div>
      <div class="row"><input class="input sm" style="width:64px" type="number" min="1" max="6" value=${turns} onInput=${e => setTurns(+e.target.value)} /><span class="dim">weeks</span><div class="grow"></div><button class="btn sm good" onClick=${() => run(conn, { type: 'humanitarianPause', turns }, 'Pause agreed. Tension will ease.')}>Agree pause</button></div>
    </div></div>
    <div class="sub-h">Wars <span class="dim">(${state.wars.length})</span></div>
    <div class="list compact">
      ${state.wars.length === 0 && html`<div class="empty">The world is at peace. For now.</div>`}
      ${state.wars.map(w => html`<div class="row war-row" key=${w.a + w.b}><span class="grow"><b>${name(w.a)}</b> <span class="neg">⚔</span> <b>${name(w.b)}</b> <span class="dim small">since T${w.since}</span></span>
        <button class="btn xs" onClick=${() => run(conn, { type: 'queueOrder', order: { country: w.a, type: 'ceasefire', target: w.b } }, 'Ceasefire queued')}>Ceasefire</button></div>`)}
    </div>
    <div class="sub-h">Pacts in force</div>
    <div class="list compact">
      ${pacts.length === 0 && html`<div class="empty">No treaties yet.</div>`}
      ${pacts.map((p, i) => html`<div class="row small" key=${i}><span class="chip">${p.type}</span><span class="grow">${p.parties.map(name).join(' · ')}</span><span class="dim">T${p.turn}</span></div>`)}
    </div>
  </div>`;
}
