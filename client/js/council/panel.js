// Council control: the chair runs the committee out loud; the Zeus mirrors the room, the drafts, the votes and the crisis here.
import { html, useState, useEffect, useRef, run, fmt, useNow, timerRemaining, cls } from '../lib.js';
import { TimerControls } from '../world/display-tab.js';
import { DMDrawer, useUnread } from '../views/dm.js';
import { GOTHAM_DISTRICTS, DISTRICT_STATUS } from '/shared/data/councils.js';
import { GothamMap, MARKER_LABEL } from './gotham.js';

const SESSIONS = [['formal', 'Formal debate'], ['moderated', 'Moderated caucus'], ['unmoderated', 'Unmoderated caucus'], ['crisis', 'Crisis update'], ['recess', 'Recess']];

export function CouncilPanel({ conn, user, state, committee, logout, onBack }) {
  const c = state.council;
  const kronos = user.role === 'kronos';
  const [dmOpen, setDmOpen] = useState(false);
  const unread = useUnread(conn, committee, dmOpen, kronos);
  const now = useNow(conn, 200);
  const act = a => run(conn, a);
  const [status, setStatus] = useState(conn.status);
  useEffect(() => { setStatus(conn.status); return conn.on('status', setStatus); }, [conn]);

  const ref = useRef(); ref.current = { c };
  useEffect(() => {
    const onKey = e => {
      if (e.target.closest('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
      const { c } = ref.current, k = e.key.toLowerCase();
      if (k === ' ') { e.preventDefault(); act({ type: 'speakTimerToggle' }); }
      else if (k === 'n') act({ type: 'queueNext' });
      else if (k === 'x') act({ type: 'setSpeaker', seat: null });
      else if (k === 'g') act({ type: 'gavel' });
      else if (/^[1-9]$/.test(k)) { const s = c.seats.filter(x => x.kind !== 'observer')[Number(k) - 1]; if (s) act({ type: 'setSpeaker', seat: s.id }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return html`
    <div class=${cls('shell court-shell council-shell', kronos && 'is-kronos', state.settings.year && 'era-cold')} style=${`--cn:${c.accent}`}>
      <header class="topbar">
        ${onBack && html`<button class="btn sm ghost" onClick=${onBack}>← All committees</button>`}
        <div class="brand"><span class="brand-orb gold"></span><span class="brand-name">WORLD ENGINE</span></div>
        <div class="tb-committee"><div class="tb-name">${state.name}</div><div class=${cls('chip', kronos ? 'gold' : 'cyan')}>${kronos ? 'Kronos' : 'Back Room Zeus'}</div></div>
        <div class="tb-stat"><span class="dim up">Session</span><b>${SESSIONS.find(s => s[0] === c.session)?.[1]}</b></div>
        <div class="grow"></div>
        <button class="btn sm" onClick=${() => window.open(`/display?c=${committee}`, `display-${committee}`, 'width=1280,height=720')}>▣ Stage display</button>
        <button class=${cls('btn sm', unread && 'gold')} onClick=${() => setDmOpen(true)}>✉ ${kronos ? 'Zeus chat' : 'Kronos'}${unread ? html` <i class="badge inline">${unread}</i>` : ''}</button>
        <span class=${cls('conn', status)}><i class=${cls('dot', status === 'live' && 'live')}></i></span>
        ${!onBack && html`<button class="btn sm ghost" onClick=${logout}>⎋</button>`}
      </header>
      <div class="court-body">
        <section class="court-left">
          <${Topic} conn=${conn} c=${c} />
          <${Agenda} conn=${conn} c=${c} />
          <${Crisis} conn=${conn} c=${c} />
        </section>
        <section class="court-center">
          ${c.map === 'gotham' && html`<${GothamControls} conn=${conn} c=${c} />`}
          <${Floor} conn=${conn} c=${c} now=${now} />
          <${Speaker} conn=${conn} c=${c} now=${now} />
        </section>
        <section class="court-right">
          <div class="card"><div class="card-h"><h3>Stage</h3></div><div class="card-b col">
            <div class="row wrap">${[['council', 'Committee'], ['blank', 'Standby']].map(([k, l]) => html`<button class=${cls('btn sm', state.display.scene === k && 'on')} onClick=${() => act({ type: 'setScene', scene: k })}>${l}</button>`)}
              <button class="btn sm gold" onClick=${() => act({ type: 'gavel' })}>⚒ Gavel <span class="kbd">G</span></button></div>
            <div class="row wrap"><div class="grow"></div><a class="btn sm ghost" href=${`/api/export/${state.id}`} download>⤓ Save</a></div>
          </div></div>
          <${Drafts} conn=${conn} c=${c} />
          <${VotePanel} conn=${conn} c=${c} />
          <div class="sub-h">Session timer</div>
          <${TimerControls} conn=${conn} state=${state} />
          ${kronos && html`<div class="card k-card" style="margin-top:10px"><div class="card-b row wrap">
            <button class=${cls('btn sm', state.kronos.eye ? 'kronos' : 'gold')} onClick=${() => act({ type: 'setEye', value: !state.kronos.eye })}>👁 ${state.kronos.eye ? 'Close the eye' : 'Open the eye'}</button>
            <button class=${cls('btn sm', state.kronos.locked && 'solid-danger')} onClick=${() => act({ type: 'setLock', value: !state.kronos.locked })}>${state.kronos.locked ? 'Unfreeze' : 'Freeze Zeus'}</button>
          </div></div>`}
        </section>
      </div>
      ${state.kronos.locked && !kronos && html`<div class="lock-veil"><div class="lock-card"><div class="lock-ico">⌛</div><h2>Kronos has frozen this panel</h2><p>Nothing can be changed until Kronos unlocks it.</p></div></div>`}
      ${state.kronos.note && html`<div class="kronos-note"><b>KRONOS</b> ${state.kronos.note}</div>`}
      <div class="shortcut-hint"><span class="kbd">Space</span> timer <span class="kbd">N</span> next speaker <span class="kbd">X</span> clear <span class="kbd">G</span> gavel <span class="kbd">1</span>–<span class="kbd">9</span> delegations</div>
      <${DMDrawer} conn=${conn} committee=${committee} open=${dmOpen} onClose=${() => setDmOpen(false)} kronos=${kronos} name=${state.name} />
    </div>`;
}

function Topic({ conn, c }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({});
  const open = () => { setF({ title: c.title, subtitle: c.subtitle, brief: c.brief, facts: c.facts.join('\n') }); setEdit(true); };
  return html`<div class="card"><div class="card-h"><h3>The topic</h3><div class="grow"></div><button class="btn xs ghost" onClick=${() => (edit ? setEdit(false) : open())}>${edit ? 'Cancel' : 'Edit'}</button></div>
    <div class="card-b">${edit ? html`<div class="col">
      <input class="input" value=${f.title} onInput=${e => setF({ ...f, title: e.target.value })} placeholder="Agenda title" />
      <input class="input" value=${f.subtitle} onInput=${e => setF({ ...f, subtitle: e.target.value })} placeholder="Subtitle" />
      <textarea class="input" rows="4" value=${f.brief} onInput=${e => setF({ ...f, brief: e.target.value })} placeholder="Briefing paragraph"></textarea>
      <textarea class="input" rows="6" value=${f.facts} onInput=${e => setF({ ...f, facts: e.target.value })} placeholder="One fact per line"></textarea>
      <button class="btn sm primary" onClick=${async () => { await run(conn, { type: 'setTopic', title: f.title, subtitle: f.subtitle, brief: f.brief, facts: f.facts.split('\n') }); setEdit(false); }}>Save</button>
    </div>` : html`<div class="case-title">${c.title}</div><div class="dim">${c.subtitle}</div><p class="small" style="margin:8px 0 0">${c.brief}</p>`}</div></div>`;
}

function Agenda({ conn, c }) {
  const [add, setAdd] = useState('');
  return html`<div class="card"><div class="card-h"><h3>Agenda</h3></div><div class="card-b phase-list">
    ${c.agenda.map((p, i) => html`<button class=${cls('phase-item', i === c.agendaIdx && 'on', i < c.agendaIdx && 'done')} onClick=${() => run(conn, { type: 'setAgenda', index: i })}><span class="mono">${i + 1}</span>${p}</button>`)}
    <div class="row"><input class="input sm grow" placeholder="Add an item" value=${add} onInput=${e => setAdd(e.target.value)} /><button class="btn sm" disabled=${!add.trim()} onClick=${() => { run(conn, { type: 'setTopic', agenda: [...c.agenda, add] }); setAdd(''); }}>Add</button></div>
  </div></div>`;
}

function Crisis({ conn, c }) {
  const [f, setF] = useState({ title: '', text: '', level: 'warning' });
  const send = async () => { const r = await run(conn, { type: 'alert', ...f }); if (r.ok) setF({ ...f, title: '', text: '' }); };
  return html`<div class="card"><div class="card-h"><h3>Crisis updates</h3><div class="grow"></div>${c.alert && html`<button class="btn xs" onClick=${() => run(conn, { type: 'clearAlert' })}>Clear screen</button>`}</div><div class="card-b col">
    <input class="input sm" placeholder="Headline" value=${f.title} onInput=${e => setF({ ...f, title: e.target.value })} />
    <textarea class="input sm" rows="2" placeholder="What the room is told" value=${f.text} onInput=${e => setF({ ...f, text: e.target.value })}></textarea>
    <div class="row"><div class="seg sm">${[['info', 'Info'], ['warning', 'Warning'], ['critical', 'Critical']].map(([k, l]) => html`<button class=${f.level === k ? 'on' : ''} onClick=${() => setF({ ...f, level: k })}>${l}</button>`)}</div><div class="grow"></div><button class="btn sm danger" disabled=${!f.title.trim()} onClick=${send}>Send to screen</button></div>
    ${c.feed.slice(0, 6).map(x => html`<div class=${cls('cn-feed', `lv-${x.level}`)} key=${x.id}><b>${x.title}</b>${x.text && html`<div class="small dim">${x.text}</div>`}<button class="btn xs ghost" onClick=${() => run(conn, { type: 'removeFeed', id: x.id })}>✕</button></div>`)}
  </div></div>`;
}

function Floor({ conn, c, now }) {
  const [name, setName] = useState(''), [edit, setEdit] = useState(null), [person, setPerson] = useState('');
  const groups = [['chair', 'Chair'], ['delegation', 'Delegations'], ['observer', 'Observers']];
  return html`<div class="card floor"><div class="card-h"><h3>The floor</h3><div class="grow"></div><span class="dim small">Click: speak · Right-click: queue · ✎ edit</span></div>
    ${groups.map(([kind, label]) => { const list = c.seats.filter(s => s.kind === kind); return list.length > 0 && html`<div class="cn-zone"><div class="zone-label">${label}</div><div class="cn-seats">${list.map(s => {
      const speaking = c.speaker === s.id, queued = c.queue.indexOf(s.id), idx = c.seats.filter(x => x.kind !== 'observer').indexOf(s);
      const total = (c.stats.speaking[s.id] || 0) + (speaking && c.speakerSince ? now - c.speakerSince : 0);
      return html`<div class=${cls('seat cn-seat', speaking && 'speaking', !s.present && 'absent')} key=${s.id} onClick=${() => edit !== s.id && run(conn, { type: 'setSpeaker', seat: speaking ? null : s.id })} onContextMenu=${e => { e.preventDefault(); run(conn, { type: queued >= 0 ? 'queueRemove' : 'queueAdd', seat: s.id }); }}>
        ${idx >= 0 && idx < 9 && html`<span class="seat-key">${idx + 1}</span>`}
        ${edit === s.id ? html`<div class="col" onClick=${e => e.stopPropagation()}>
          <input class="input sm" placeholder="Delegate's name" value=${person} onInput=${e => setPerson(e.target.value)} autofocus onKeyDown=${e => { if (e.key === 'Enter') { run(conn, { type: 'editSeat', id: s.id, person }); setEdit(null); } }} />
          <div class="row wrap"><button class="btn xs primary" onClick=${() => { run(conn, { type: 'editSeat', id: s.id, person }); setEdit(null); }}>Save</button><button class="btn xs" onClick=${() => run(conn, { type: 'editSeat', id: s.id, present: !s.present })}>${s.present ? 'Mark absent' : 'Mark present'}</button><button class="btn xs danger" onClick=${() => run(conn, { type: 'removeSeat', id: s.id })}>Remove</button></div>
        </div>` : html`<div class="seat-name">${s.name}</div>${s.person && html`<div class="seat-role">${s.person}</div>`}
          <div class="seat-meta">${total > 0 ? fmt.clock(total / 1000) : ''}${queued >= 0 ? html` <span class="chip cyan">#${queued + 1}</span>` : ''}</div>
          <div class="seat-tools" onClick=${e => e.stopPropagation()}><button class="btn xs ghost" onClick=${() => run(conn, { type: queued >= 0 ? 'queueRemove' : 'queueAdd', seat: s.id })}>${queued >= 0 ? '−' : '＋'}</button><button class="btn xs ghost" onClick=${() => { setPerson(s.person || ''); setEdit(s.id); }}>✎</button></div>`}
      </div>`;
    })}</div></div>`; })}
    <div class="row wrap" style="padding:0 12px 12px"><input class="input sm grow" placeholder="Add a delegation or observer" value=${name} onInput=${e => setName(e.target.value)} />
      <button class="btn sm" disabled=${!name.trim()} onClick=${() => { run(conn, { type: 'addSeat', name, kind: 'delegation' }); setName(''); }}>Delegation</button>
      <button class="btn sm ghost" disabled=${!name.trim()} onClick=${() => { run(conn, { type: 'addSeat', name, kind: 'observer' }); setName(''); }}>Observer</button></div>
  </div>`;
}

function Speaker({ conn, c, now }) {
  const sp = c.speakTimer, rem = timerRemaining(sp, now), speaker = c.seats.find(s => s.id === c.speaker);
  const act = a => run(conn, a);
  return html`<div class="court-controls">
    <div class="card speaker-card"><div class="card-b row">
      <div class=${cls('ring-timer', sp.running && 'run', rem < 15 && sp.running && 'low')} style=${`--p:${sp.duration ? (rem / sp.duration) * 100 : 0}`}><span class="mono">${fmt.clock(rem)}</span></div>
      <div class="grow col" style="gap:4px">
        <div class="dim up">Speaking</div>
        <div class="speaker-name">${speaker ? speaker.name : 'Nobody has the floor'}</div>
        ${speaker?.person && html`<div class="dim small">${speaker.person}</div>`}
        <div class="row wrap">
          <button class="btn sm" onClick=${() => act({ type: 'speakTimerToggle' })}>${sp.running ? 'Pause' : 'Start'} <span class="kbd">Space</span></button>
          <button class="btn sm" onClick=${() => act({ type: 'speakTimerReset', start: true })}>Restart</button>
          <button class="btn sm primary" onClick=${() => act({ type: 'queueNext' })} disabled=${!c.queue.length}>Next <span class="kbd">N</span></button>
          <button class="btn sm ghost" onClick=${() => act({ type: 'setSpeaker', seat: null })}>Clear <span class="kbd">X</span></button>
        </div>
        <div class="row wrap"><span class="dim small">Speech</span>${[30, 45, 60, 90, 120, 180].map(s => html`<button class=${cls('btn xs', sp.duration === s && 'on')} onClick=${() => act({ type: 'speakTimerSet', seconds: s })}>${fmt.clock(s)}</button>`)}</div>
        <div class="row wrap"><span class="dim small">Session</span>${SESSIONS.map(([k, l]) => html`<button class=${cls('btn xs', c.session === k && 'on')} onClick=${() => act({ type: 'setSession', session: k })}>${l}</button>`)}</div>
      </div>
    </div></div>
    <div class="card queue-card"><div class="card-h"><h3>Speakers list</h3></div><div class="card-b">
      ${c.queue.length === 0 && html`<div class="empty">Nobody is waiting.</div>`}
      ${c.queue.map((id, i) => { const s = c.seats.find(x => x.id === id); return s && html`<div class="row q-row"><span class="mono dim">${i + 1}</span><span class="grow">${s.name}</span><button class="btn xs ghost" onClick=${() => act({ type: 'queueMove', seat: id, delta: -1 })}>↑</button><button class="btn xs ghost" onClick=${() => act({ type: 'queueRemove', seat: id })}>✕</button></div>`; })}
    </div></div>
  </div>`;
}

function Drafts({ conn, c }) {
  const [open, setOpen] = useState(false), [f, setF] = useState({ title: '', sponsors: '', clauses: '' });
  const [edit, setEdit] = useState(null), [ef, setEf] = useState({});
  const add = async () => { const r = await run(conn, { type: 'addDraft', ...f }); if (r.ok) { setF({ title: '', sponsors: '', clauses: '' }); setOpen(false); } };
  return html`<div class="card"><div class="card-h"><h3>Draft resolutions</h3><div class="grow"></div><button class="btn xs" onClick=${() => setOpen(!open)}>${open ? 'Cancel' : '＋ New'}</button></div><div class="card-b col">
    ${open && html`<div class="col">
      <input class="input sm" placeholder="Title" value=${f.title} onInput=${e => setF({ ...f, title: e.target.value })} />
      <input class="input sm" placeholder="Sponsors, separated by commas" value=${f.sponsors} onInput=${e => setF({ ...f, sponsors: e.target.value })} />
      <textarea class="input sm" rows="5" placeholder="One operative clause per line" value=${f.clauses} onInput=${e => setF({ ...f, clauses: e.target.value })}></textarea>
      <button class="btn sm primary" disabled=${!f.title.trim()} onClick=${add}>Add draft</button></div>`}
    ${c.drafts.length === 0 && !open && html`<div class="empty">No drafts yet.</div>`}
    ${c.drafts.map(d => html`<div class=${cls('cn-draft', `st-${d.status}`)} key=${d.id}>
      ${edit === d.id ? html`<div class="col">
        <input class="input sm" value=${ef.title} onInput=${e => setEf({ ...ef, title: e.target.value })} />
        <textarea class="input sm" rows="5" value=${ef.clauses} onInput=${e => setEf({ ...ef, clauses: e.target.value })}></textarea>
        <div class="row"><button class="btn xs primary" onClick=${async () => { await run(conn, { type: 'editDraft', id: d.id, title: ef.title, clauses: ef.clauses }); setEdit(null); }}>Save</button><button class="btn xs ghost" onClick=${() => setEdit(null)}>Cancel</button></div>
      </div>` : html`<div class="row"><b class="grow">${d.title}</b>${d.status !== 'draft' && html`<span class=${cls('chip', d.status === 'passed' ? 'green' : 'red')}>${d.status}</span>`}</div>
        <div class="small dim">${d.sponsors.join(', ') || 'No sponsors'} · ${d.clauses.length} clauses</div>
        <div class="row wrap" style="margin-top:4px">
          <button class=${cls('btn xs', c.shownDraft?.id === d.id && 'on')} onClick=${() => run(conn, { type: 'showDraft', id: c.shownDraft?.id === d.id ? null : d.id })}>${c.shownDraft?.id === d.id ? 'Hide' : 'Show on stage'}</button>
          <button class="btn xs gold" disabled=${!!c.vote?.open} onClick=${() => run(conn, { type: 'openVote', id: d.id })}>Vote</button>
          <button class="btn xs ghost" onClick=${() => { setEf({ title: d.title, clauses: d.clauses.join('\n') }); setEdit(d.id); }}>✎</button>
          <button class="btn xs ghost" onClick=${() => run(conn, { type: 'removeDraft', id: d.id })}>✕</button>
        </div>`}
    </div>`)}
  </div></div>`;
}

function VotePanel({ conn, c }) {
  const v = c.vote; if (!v) return null;
  const d = c.drafts.find(x => x.id === v.draftId);
  const list = c.seats.filter(s => s.present && s.kind === 'delegation');
  const t = { yes: 0, no: 0, abstain: 0 }; for (const s of list) if (v.votes[s.id]) t[v.votes[s.id]]++;
  const cast = (seat, value) => run(conn, { type: 'castVote', seat, value: v.votes[seat] === value ? null : value });
  return html`<div class="card cn-vote"><div class="card-h"><h3>Vote · ${d?.title}</h3></div><div class="card-b col">
    <div class="row"><span class="chip green">Yes ${t.yes}</span><span class="chip red">No ${t.no}</span><span class="chip">Abstain ${t.abstain}</span><div class="grow"></div><span class="dim small">${Object.keys(v.votes).length}/${list.length} voted</span></div>
    ${v.open ? html`<div class="row wrap"><span class="dim small">Rest of the room</span>${[['yes', 'Yes'], ['no', 'No'], ['abstain', 'Abstain']].map(([k, l]) => html`<button class="btn xs" onClick=${() => run(conn, { type: 'castAll', value: k })}>${l}</button>`)}<button class="btn xs ghost" onClick=${() => run(conn, { type: 'castAll', value: null })}>Reset</button></div>
      <div class="cn-roll">${list.map(s => html`<div class="cn-roll-row" key=${s.id}><span class="grow">${s.name}</span>${[['yes', '✓', 'good'], ['no', '✕', 'danger'], ['abstain', '–', '']].map(([k, l, cl]) => html`<button class=${cls('btn xs', v.votes[s.id] === k && 'on', v.votes[s.id] === k && cl)} onClick=${() => cast(s.id, k)}>${l}</button>`)}</div>`)}</div>
      <div class="row"><button class="btn sm gold" onClick=${() => run(conn, { type: 'closeVote' })}>Close the vote and reveal</button><button class="btn sm ghost" onClick=${() => run(conn, { type: 'clearVote' })}>Cancel</button></div>`
      : html`<div class=${cls('cn-result', v.passed ? 'pass' : 'fail')}>${v.passed ? 'PASSED' : 'FAILED'} · ${v.tally.yes}–${v.tally.no}–${v.tally.abstain}</div><button class="btn sm ghost" onClick=${() => run(conn, { type: 'clearVote' })}>Clear from the screen</button>`}
  </div></div>`;
}

function GothamControls({ conn, c }) {
  const [tool, setTool] = useState({ mode: 'district', status: 'unrest', kind: 'fire', label: '' });
  const onDistrict = id => tool.mode === 'district' && run(conn, { type: 'setDistrict', id, status: (c.districts[id]?.status === tool.status ? 'secure' : tool.status) });
  const onPoint = (x, y) => tool.mode === 'marker' && run(conn, { type: 'addMarker', x, y, kind: tool.kind, label: tool.label });
  return html`<div class="card"><div class="card-h"><h3>Map of Gotham</h3><div class="grow"></div>
    <div class="seg sm"><button class=${tool.mode === 'district' ? 'on' : ''} onClick=${() => setTool({ ...tool, mode: 'district' })}>Districts</button><button class=${tool.mode === 'marker' ? 'on' : ''} onClick=${() => setTool({ ...tool, mode: 'marker' })}>Markers</button></div></div>
    <div class="card-b col">
      ${tool.mode === 'district' ? html`<div class="row wrap"><span class="dim small">Click a district to set it to</span>${DISTRICT_STATUS.filter(s => s[0] !== 'secure').map(([k, l, col]) => html`<button class=${cls('btn xs', tool.status === k && 'on')} style=${tool.status === k ? `border-color:${col};color:${col}` : ''} onClick=${() => setTool({ ...tool, status: k })}>${l}</button>`)}<span class="dim small">Click again to make it secure.</span></div>`
        : html`<div class="row wrap"><span class="dim small">Click the map to place</span>${Object.entries(MARKER_LABEL).map(([k, l]) => html`<button class=${cls('btn xs', tool.kind === k && 'on')} onClick=${() => setTool({ ...tool, kind: k })}>${l}</button>`)}
          <input class="input sm" style="width:150px" placeholder="Label (optional)" value=${tool.label} onInput=${e => setTool({ ...tool, label: e.target.value })} />
          ${c.markers.length > 0 && html`<button class="btn xs ghost" onClick=${() => run(conn, { type: 'clearMarkers' })}>Clear all</button>`}</div>`}
      <${GothamMap} c=${c} onDistrict=${onDistrict} onPoint=${onPoint} />
      <div class="row"><input class="input sm grow" placeholder="Line under the map on the stage (e.g. All bridges sealed)" value=${c.mapNote} onChange=${e => run(conn, { type: 'setMapNote', text: e.target.value })} /></div>
      ${c.markers.length > 0 && html`<div class="row wrap">${c.markers.map(m => html`<span class="chip" key=${m.id}>${MARKER_LABEL[m.kind]}${m.label ? ` · ${m.label}` : ''} <b class="click" onClick=${() => run(conn, { type: 'removeMarker', id: m.id })}>✕</b></span>`)}</div>`}
    </div></div>`;
}
