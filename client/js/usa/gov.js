// The rest of the US government for the Zeus panel: the offices (computer-run unless a delegate takes one), what the government
// has queued to do, and controls to make it speak, give an order or put a bill to a vote.
import { html, useState, cls } from '../lib.js';
import { OFFICES, OFFICE_BRANCH, GOV_EFFECTS, getGov, officeState } from '/shared/engine/usa-gov.js';
import { INCIDENTS } from '/shared/data/usa-incidents.js';
import { STATES } from '/shared/data/usa-units.js';
import { CROSSING_LIST } from '/shared/engine/usa.js';
import { simClock } from '/shared/engine/usa-sim.js';

export function GovPanel({ u, act }) {
  const g = getGov(u), [open, setOpen] = useState(null), [office, setOffice] = useState('pres'), [text, setText] = useState(''), [effect, setEffect] = useState('none'), [delay, setDelay] = useState(0), [bill, setBill] = useState('');
  const delegates = OFFICES.filter(o => g.offices[o[0]]?.control === 'delegate').length;
  return html`<div>
    <div class="us-bside"><div class="row between"><b>Government AI</b><button class=${cls('btn xs', g.auto && 'on')} onClick=${() => act({ type: 'usaGov', auto: !g.auto })}>${g.auto ? 'On' : 'Off'}</button></div>
      <div class="dim small">${g.auto ? 'The White House, cabinet, Congress and courts answer events by themselves.' : 'Nobody answers events unless you make them.'}</div>
      <label class="stat"><div class="row between"><span class="dim small">Presidential approval</span><b>${g.approval}%</b></div><input type="range" min="0" max="100" value=${g.approval} onChange=${e => act({ type: 'usaGov', approval: Number(e.target.value) })} class=${cls('us-meter', g.approval < 30 ? 'low' : g.approval < 55 ? 'mid' : 'hi')} /></label></div>
    <div class="sub-h">Offices ${delegates ? `· ${delegates} played by delegates` : ''}</div>
    ${Object.entries(OFFICE_BRANCH).map(([br, label]) => html`<div class="dim small" style="margin:6px 0 2px">${label}</div>
      <div class="us-unitlist">${OFFICES.filter(o => o[2] === br).map(([id]) => { const o = officeState(u, id); return html`<div>
        <button class=${cls('us-urow', open === id && 'on')} onClick=${() => { setOpen(open === id ? null : id); setOffice(id); }}><i class="us-sw" style=${`background:${o.control === 'delegate' ? '#ffd166' : '#6b7a99'}`}></i><span>${o.title}</span><em>${o.person || (o.control === 'delegate' ? 'Delegate' : 'AI')}</em></button>
        ${open === id && html`<${OfficeEdit} key=${id} o=${o} act=${act} />`}</div>`; })}</div>`)}
    <div class="sub-h">Queued</div>
    ${g.pending.length ? html`<div class="us-unitlist">${[...g.pending].sort((a, b) => a.at - b.at).map(p => html`<div class="row between small" style="gap:6px"><span class="mono dim">${simClock(p.at).replace('Day ', 'D')}</span><span class="grow">${p.act === 'vote' ? `Vote: ${p.title}` : p.text}</span><button class="btn xs ghost" onClick=${() => act({ type: 'usaGov', cancel: p.id })}>✕</button></div>`)}</div>` : html`<p class="pane-hint">Nothing queued.</p>`}
    <div class="sub-h">Make them act</div>
    <div class="us-bside">
      <select class="input sm" value=${office} onChange=${e => setOffice(e.target.value)}>${OFFICES.map(o => html`<option value=${o[0]}>${o[1]}</option>`)}</select>
      <input class="input sm" placeholder="What they say" value=${text} onInput=${e => setText(e.target.value)} />
      <div class="row wrap"><select class="input sm grow" value=${effect} onChange=${e => setEffect(e.target.value)}>${Object.entries(GOV_EFFECTS).map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select>
        <select class="input sm" value=${delay} onChange=${e => setDelay(Number(e.target.value))}>${[[0, 'Now'], [5, 'In 5 min'], [30, 'In 30 min'], [120, 'In 2 hours']].map(([v, l]) => html`<option value=${v}>${l}</option>`)}</select></div>
      <button class="btn sm" onClick=${() => act({ type: 'usaGovAct', office, text, effect, delay }).then?.(r => r?.ok !== false && setText(''))}>Do it</button>
    </div>
    <div class="sub-h">Congress</div>
    <div class="us-bside">
      <input class="input sm" placeholder="Name of a bill" value=${bill} onInput=${e => setBill(e.target.value)} />
      <div class="row wrap"><select class="input sm grow" value=${effect} onChange=${e => setEffect(e.target.value)}>${Object.entries(GOV_EFFECTS).map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select></div>
      <div class="row wrap"><button class="btn sm" onClick=${() => act({ type: 'usaBill', title: bill, effect })}>Let them vote</button><button class="btn sm" onClick=${() => act({ type: 'usaBill', title: bill, effect, force: 'pass', delay: 5 })}>Pass it</button><button class="btn sm danger" onClick=${() => act({ type: 'usaBill', title: bill, effect, force: 'fail', delay: 5 })}>Sink it</button></div>
    </div>
  </div>`;
}

function OfficeEdit({ o, act }) {
  const [name, setName] = useState(o.person);
  return html`<div class="us-bside"><div class="row"><input class="input sm grow" placeholder="Name of the person" value=${name} onInput=${e => setName(e.target.value)} onBlur=${() => name !== o.person && act({ type: 'usaGov', office: o.id, person: name })} />
    </div><div class="row wrap"><button class=${cls('btn sm', o.control !== 'delegate' && 'on')} onClick=${() => act({ type: 'usaGov', office: o.id, control: 'ai' })}>AI plays</button><button class=${cls('btn sm gold', o.control === 'delegate' && 'on')} onClick=${() => act({ type: 'usaGov', office: o.id, control: 'delegate' })}>Delegate plays</button></div></div>`;
}

// Sandbox for Zeus and Kronos: set off something at a state or a border crossing and watch the government deal with it.
export function IncidentCard({ act }) {
  const [kind, setKind] = useState('riot'), [place, setPlace] = useState('st:TX');
  const go = () => act(place.startsWith('st:') ? { type: 'usaIncident', kind, state: place.slice(3) } : { type: 'usaIncident', kind, crossing: place.slice(3) });
  return html`<div class="us-bside">
    <select class="input sm" value=${kind} onChange=${e => setKind(e.target.value)}>${Object.entries(INCIDENTS).map(([k, v]) => html`<option value=${k}>${v.name}</option>`)}</select>
    <select class="input sm" value=${place} onChange=${e => setPlace(e.target.value)}>
      <optgroup label="Border crossings">${CROSSING_LIST.map(c => html`<option value=${`cx:${c.id}`}>${c.name}</option>`)}</optgroup>
      <optgroup label="States">${STATES.map(r => html`<option value=${`st:${r[0]}`}>${r[1]}</option>`)}</optgroup></select>
    <button class="btn sm danger" onClick=${go}>Set it off</button>
    <div class="dim small">Drops units on the map, may put the state under alert or emergency, and the government reacts. Units made this way can be ordered, fought or deleted like any other.</div>
  </div>`;
}
