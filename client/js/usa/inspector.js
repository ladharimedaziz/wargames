// The right-hand side of the US Zeus panel, like the country inspector of the world committees: the state that was clicked (its
// governor, numbers, status and the units inside it), a unit that was clicked, or the whole nation when nothing is picked.
import { html, useState, useEffect, useMemo, cls, run, toast } from '../lib.js';
import { geoContains } from 'd3-geo';
import { unitLabel, viewFor } from './map.js';
import { USA_UNIT_KINDS, SILS, STATE_STATUS, STATE_METRICS, getState, getUnits } from '/shared/engine/usa.js';

const Bar = ({ label, value, onChange }) => html`<label class="stat"><div class="row between"><span class="dim small">${label}</span><b>${value}</b></div>
  <input type="range" min="0" max="100" value=${value} onChange=${e => onChange(Number(e.target.value))} class=${cls('us-meter', value < 30 ? 'low' : value < 55 ? 'mid' : 'hi')} /></label>`;

// A unit's card. Governors can be edited: the AI plays them, or a delegate does under their own name and photo.
export function UnitCard({ unit: x, act, close, jump, placing, setPlacing }) {
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
export function NationOverview({ u, units, act, setSel, setState }) {
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
    <div class="sub-h">Federal forces</div>
    <div class="dim small">${fed} unit${fed === 1 ? '' : 's'} federalized.</div>
    <div class="row wrap"><button class="btn sm" onClick=${() => act({ type: 'usaFederalize', state: 'all', on: true })}>Federalize every Guard</button><button class="btn sm ghost" onClick=${() => act({ type: 'usaFederalize', state: 'all', on: false })}>Release them</button></div>
  </div>`;
}
