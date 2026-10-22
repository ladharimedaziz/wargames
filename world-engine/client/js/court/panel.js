// Court control: the chair runs the room out loud; the Zeus mirrors it here with clicks or keyboard shortcuts.
import { html, useState, useEffect, useRef, run, toast, fmt, useNow, timerRemaining, cls } from '../lib.js';
import { OBJECTION_GROUNDS } from '/shared/engine/core.js';
import { TimerControls } from '../world/display-tab.js';
import { DMDrawer, useUnread } from '../views/dm.js';

const SIDE_LABEL = { bench: 'Bench', prosecution: 'Prosecution', defence: 'Defence', witness: 'Witness stand', jury: 'Jury', gallery: 'Gallery' };

export function CourtPanel({ conn, user, state, committee, logout, onBack }) {
  const c = state.court;
  const kronos = user.role === 'kronos';
  const [dmOpen, setDmOpen] = useState(false);
  const [objPick, setObjPick] = useState(null); // seat id choosing grounds
  const unread = useUnread(conn, committee, dmOpen, kronos);
  const now = useNow(conn, 200);
  const act = a => run(conn, a);
  const speaker = c.seats.find(s => s.id === c.speaker);
  const sp = c.speakTimer, rem = timerRemaining(sp, now);
  const [status, setStatus] = useState(conn.status);
  useEffect(() => conn.on('status', setStatus), [conn]);

  // Keyboard shortcuts for whoever is mirroring the chair.
  const ref = useRef(); ref.current = { c, objPick };
  useEffect(() => {
    const onKey = e => {
      if (e.target.closest('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
      const { c, objPick } = ref.current;
      const k = e.key.toLowerCase();
      if (objPick) {
        const i = Number(e.key) - 1;
        if (i >= 0 && i < OBJECTION_GROUNDS.length) { act({ type: 'objection', by: objPick, grounds: OBJECTION_GROUNDS[i] }); setObjPick(null); }
        if (k === 'escape') setObjPick(null);
        return;
      }
      if (k === ' ') { e.preventDefault(); act({ type: 'speakTimerToggle' }); }
      else if (k === 'n') act({ type: 'queueNext' });
      else if (k === 'o') { const side = c.seats.find(s => s.id === c.speaker)?.side; const opp = c.seats.find(s => s.side === (side === 'prosecution' ? 'defence' : 'prosecution')); if (opp) setObjPick(opp.id); }
      else if (k === 's' && c.objection && !c.objection.ruling) act({ type: 'rule', ruling: 'sustained' });
      else if (k === 'r' && c.objection && !c.objection.ruling) act({ type: 'rule', ruling: 'overruled' });
      else if (k === 'g') act({ type: 'gavel' });
      else if (k === 'x') act({ type: 'setSpeaker', seat: null });
      else if (k === 'arrowright') act({ type: 'setPhase', delta: 1 });
      else if (k === 'arrowleft') act({ type: 'setPhase', delta: -1 });
      else if (/^[1-9]$/.test(k)) { const s = c.seats[Number(k) - 1]; if (s) act({ type: 'setSpeaker', seat: s.id }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return html`
    <div class=${cls('shell court-shell', kronos && 'is-kronos')}>
      <header class="topbar">
        ${onBack && html`<button class="btn sm ghost" onClick=${onBack}>← All committees</button>`}
        <div class="brand"><span class="brand-orb gold"></span><span class="brand-name">WORLD ENGINE</span></div>
        <div class="tb-committee"><div class="tb-name">${state.name}</div><div class=${cls('chip', kronos ? 'gold' : 'cyan')}>${kronos ? 'Kronos' : user.role === 'stage' ? 'Stage Zeus' : 'Back Room Zeus'}</div></div>
        <div class="tb-stat"><span class="dim up">Phase</span><b>${c.phases[c.phase]}</b></div>
        <div class="grow"></div>
        <button class="btn sm" onClick=${() => window.open(`/display?c=${committee}`, `display-${committee}`, 'width=1280,height=720')}>▣ Stage display</button>
        <button class=${cls('btn sm', unread && 'gold')} onClick=${() => setDmOpen(true)}>✉ ${kronos ? 'Zeus chat' : 'Kronos'}${unread ? html` <i class="badge inline">${unread}</i>` : ''}</button>
        <span class=${cls('conn', status)}><i class=${cls('dot', status === 'live' && 'live')}></i></span>
        ${!onBack && html`<button class="btn sm ghost" onClick=${logout}>⎋</button>`}
      </header>
      <div class="court-body">
        <section class="court-left">
          <${CaseCard} conn=${conn} c=${c} />
          <div class="card"><div class="card-h"><h3>Phases</h3><div class="grow"></div><span class="kbd">←</span><span class="kbd">→</span></div>
            <div class="card-b phase-list">${c.phases.map((p, i) => html`<button class=${cls('phase-item', i === c.phase && 'on', i < c.phase && 'done')} onClick=${() => act({ type: 'setPhase', index: i })}><span class="mono">${i + 1}</span>${p}</button>`)}</div>
          </div>
          <${Exhibits} conn=${conn} c=${c} />
        </section>

        <section class="court-center">
          <div class="card floor">
            <div class="card-h"><h3>The floor</h3><div class="grow"></div><span class="dim small">Click: speak · Right-click or ＋: queue · <span class="kbd">1</span>–<span class="kbd">9</span> seats</span></div>
            <div class="floor-grid">
              ${['bench', 'prosecution', 'witness', 'defence', 'jury', 'gallery'].map(side => {
                const seats = c.seats.filter(s => s.side === side);
                if (!seats.length && side === 'gallery') return null;
                return html`<div class=${`floor-zone z-${side}`}>
                  <div class="zone-label">${SIDE_LABEL[side]}</div>
                  ${seats.map(s => html`<${Seat} conn=${conn} s=${s} c=${c} idx=${c.seats.indexOf(s)} now=${now} onObject=${() => setObjPick(s.id)} key=${s.id} />`)}
                </div>`;
              })}
            </div>
            <div class="row wrap" style="padding:0 12px 12px">
              <${AddSeat} conn=${conn} />
            </div>
          </div>

          <div class="court-controls">
            <div class="card speaker-card">
              <div class="card-b row">
                <div class=${cls('ring-timer', sp.running && 'run', rem < 15 && sp.running && 'low')} style=${`--p:${sp.duration ? (rem / sp.duration) * 100 : 0}`}><span class="mono">${fmt.clock(rem)}</span></div>
                <div class="grow col" style="gap:4px">
                  <div class="dim up">Speaking</div>
                  <div class="speaker-name">${speaker ? speaker.person || speaker.name : 'Nobody has the floor'}</div>
                  ${speaker?.person && html`<div class="dim small">${speaker.name}</div>`}
                  <div class="row wrap">
                    <button class="btn sm" onClick=${() => act({ type: 'speakTimerToggle' })}>${sp.running ? 'Pause' : 'Start'} <span class="kbd">Space</span></button>
                    <button class="btn sm" onClick=${() => act({ type: 'speakTimerReset', start: true })}>Restart</button>
                    <button class="btn sm primary" onClick=${() => act({ type: 'queueNext' })} disabled=${!c.queue.length}>Next <span class="kbd">N</span></button>
                    <button class="btn sm ghost" onClick=${() => act({ type: 'setSpeaker', seat: null })}>Clear <span class="kbd">X</span></button>
                  </div>
                  <div class="row"><span class="dim small">Speech length</span>${[30, 60, 90, 120, 180, 300].map(s => html`<button class=${cls('btn xs', sp.duration === s && 'on')} onClick=${() => act({ type: 'speakTimerSet', seconds: s })}>${fmt.clock(s)}</button>`)}</div>
                </div>
              </div>
            </div>
            <div class="card queue-card">
              <div class="card-h"><h3>Up next</h3></div>
              <div class="card-b">
                ${c.queue.length === 0 && html`<div class="empty">Queue is empty.</div>`}
                ${c.queue.map((id, i) => { const s = c.seats.find(x => x.id === id); return s && html`<div class="row q-row"><span class="mono dim">${i + 1}</span><span class="grow">${s.person || s.name}</span><button class="btn xs ghost" onClick=${() => act({ type: 'queueMove', seat: id, delta: -1 })}>↑</button><button class="btn xs ghost" onClick=${() => act({ type: 'queueRemove', seat: id })}>✕</button></div>`; })}
              </div>
            </div>
          </div>

          <${ObjectionCard} conn=${conn} c=${c} objPick=${objPick} setObjPick=${setObjPick} />
        </section>

        <section class="court-right">
          <div class="card"><div class="card-h"><h3>Stage</h3></div><div class="card-b col">
            <div class="row wrap">${[['court', 'Courtroom'], ['blank', 'Standby']].map(([k, l]) => html`<button class=${cls('btn sm', state.display.scene === k && 'on')} onClick=${() => act({ type: 'setScene', scene: k })}>${l}</button>`)}
              <button class="btn sm gold" onClick=${() => act({ type: 'gavel', text: 'ORDER' })}>⚒ Gavel <span class="kbd">G</span></button>
              <button class=${cls('btn sm', c.recess && 'on')} onClick=${() => act({ type: 'recess', value: !c.recess })}>${c.recess ? 'End recess' : 'Recess'}</button></div>
            <div class="row wrap"><div class="seg">${[['en', 'EN'], ['ar', 'ع'], ['both', 'Both']].map(([k, l]) => html`<button class=${state.settings.lang === k ? 'on' : ''} onClick=${() => act({ type: 'setSetting', key: 'lang', value: k })}>${l}</button>`)}</div>
              <button class=${cls('btn sm', state.settings.music && 'on')} onClick=${() => act({ type: 'setSetting', key: 'music', value: !state.settings.music })}>♫</button>
              <button class=${cls('btn sm', state.settings.sfx && 'on')} onClick=${() => act({ type: 'setSetting', key: 'sfx', value: !state.settings.sfx })}>◖</button>
              <div class="grow"></div>
              <a class="btn sm ghost" href=${`/api/export/${state.id}`} download title="Download a save of this courtroom">⤓ Save</a></div>
          </div></div>
          <${Scales} conn=${conn} c=${c} />
          <${Verdict} conn=${conn} c=${c} />
          <div class="sub-h">Session timer</div>
          <${TimerControls} conn=${conn} state=${state} />
          <${Stats} c=${c} now=${now} />
          ${kronos && html`<div class="card k-card" style="margin-top:10px"><div class="card-b row wrap">
            <button class=${cls('btn sm', state.kronos.eye ? 'kronos' : 'gold')} onClick=${() => act({ type: 'setEye', value: !state.kronos.eye })}>👁 ${state.kronos.eye ? 'Close the eye' : 'Open the eye'}</button>
            <button class=${cls('btn sm', state.kronos.locked && 'solid-danger')} onClick=${() => act({ type: 'setLock', value: !state.kronos.locked })}>${state.kronos.locked ? 'Unfreeze' : 'Freeze Zeus'}</button>
          </div></div>`}
        </section>
      </div>
      ${state.kronos.locked && !kronos && html`<div class="lock-veil"><div class="lock-card"><div class="lock-ico">⌛</div><h2>Kronos has frozen this panel</h2><p>Nothing can be changed until Kronos unlocks it.</p></div></div>`}
      ${state.kronos.note && html`<div class="kronos-note"><b>KRONOS</b> ${state.kronos.note}</div>`}
      <div class="shortcut-hint"><span class="kbd">Space</span> timer <span class="kbd">N</span> next <span class="kbd">O</span> objection <span class="kbd">S</span>/<span class="kbd">R</span> rule <span class="kbd">G</span> gavel</div>
      <${DMDrawer} conn=${conn} committee=${committee} open=${dmOpen} onClose=${() => setDmOpen(false)} kronos=${kronos} name=${state.name} />
    </div>`;
}

function CaseCard({ conn, c }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ title: c.caseTitle, subtitle: c.caseSubtitle, charge: c.charge || '' });
  return html`<div class="card"><div class="card-h"><h3>The case</h3><div class="grow"></div><button class="btn xs ghost" onClick=${() => { setF({ title: c.caseTitle, subtitle: c.caseSubtitle, charge: c.charge || '' }); setEdit(e => !e); }}>${edit ? 'Cancel' : 'Edit'}</button></div>
    <div class="card-b">${edit ? html`<div class="col">
      <input class="input" value=${f.title} onInput=${e => setF({ ...f, title: e.target.value })} placeholder="Case title" />
      <input class="input" value=${f.subtitle} onInput=${e => setF({ ...f, subtitle: e.target.value })} placeholder="Case number or subtitle" />
      <textarea class="input" rows="3" value=${f.charge} onInput=${e => setF({ ...f, charge: e.target.value })} placeholder="The charge or question before the court"></textarea>
      <button class="btn sm primary" onClick=${async () => { await run(conn, { type: 'setCase', ...f }); setEdit(false); }}>Save</button>
    </div>` : html`<div class="case-title">${c.caseTitle}</div><div class="dim">${c.caseSubtitle}</div>${c.charge && html`<p class="small" style="margin:8px 0 0">${c.charge}</p>`}`}</div>
  </div>`;
}

function Seat({ conn, s, c, idx, now, onObject }) {
  const [edit, setEdit] = useState(false);
  const [person, setPerson] = useState(s.person || '');
  const speaking = c.speaker === s.id;
  const queued = c.queue.indexOf(s.id);
  const total = (c.stats.speaking[s.id] || 0) + (speaking && c.speakerSince ? now - c.speakerSince : 0);
  return html`<div class=${cls('seat', speaking && 'speaking', `side-${s.side}`)} onClick=${() => !edit && run(conn, { type: 'setSpeaker', seat: speaking ? null : s.id })} onContextMenu=${e => { e.preventDefault(); run(conn, { type: queued >= 0 ? 'queueRemove' : 'queueAdd', seat: s.id }); }}>
    ${idx < 9 && html`<span class="seat-key">${idx + 1}</span>`}
    ${edit ? html`<div class="col" onClick=${e => e.stopPropagation()}>
      <input class="input sm" placeholder="Delegate's name" value=${person} onInput=${e => setPerson(e.target.value)} autofocus onKeyDown=${e => { if (e.key === 'Enter') { run(conn, { type: 'editSeat', id: s.id, person }); setEdit(false); } }} />
      <div class="row"><button class="btn xs primary" onClick=${() => { run(conn, { type: 'editSeat', id: s.id, person }); setEdit(false); }}>Save</button><button class="btn xs danger" onClick=${() => run(conn, { type: 'removeSeat', id: s.id })}>Remove</button></div>
    </div>` : html`
      <div class="seat-name">${s.person || s.name}</div>
      ${s.person && html`<div class="seat-role">${s.name}</div>`}
      <div class="seat-meta">${total > 0 ? fmt.clock(total / 1000) : ''}${queued >= 0 ? html` <span class="chip cyan">#${queued + 1}</span>` : ''}</div>
      <div class="seat-tools" onClick=${e => e.stopPropagation()}>
        <button class="btn xs ghost" title="Queue" onClick=${() => run(conn, { type: queued >= 0 ? 'queueRemove' : 'queueAdd', seat: s.id })}>${queued >= 0 ? '−' : '＋'}</button>
        ${(s.side === 'prosecution' || s.side === 'defence') && html`<button class="btn xs danger" title="Objection!" onClick=${onObject}>!</button>`}
        <button class="btn xs ghost" title="Edit" onClick=${() => { setPerson(s.person || ''); setEdit(true); }}>✎</button>
      </div>`}
  </div>`;
}

function AddSeat({ conn }) {
  const [name, setName] = useState('');
  const [side, setSide] = useState('witness');
  return html`<div class="row grow"><input class="input sm grow" placeholder="Add a seat (e.g. Expert witness)" value=${name} onInput=${e => setName(e.target.value)} />
    <select class="input sm" value=${side} onChange=${e => setSide(e.target.value)}>${Object.entries(SIDE_LABEL).map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select>
    <button class="btn sm" disabled=${!name.trim()} onClick=${() => { run(conn, { type: 'addSeat', name, side }); setName(''); }}>Add</button></div>`;
}

function ObjectionCard({ conn, c, objPick, setObjPick }) {
  const o = c.objection;
  const by = o && c.seats.find(s => s.id === o.by);
  const sides = c.seats.filter(s => s.side === 'prosecution' || s.side === 'defence');
  return html`<div class=${cls('card objection-card', o && !o.ruling && 'live')}>
    <div class="card-h"><h3>Objections</h3><div class="grow"></div><span class="kbd">O</span><span class="kbd">S</span><span class="kbd">R</span></div>
    <div class="card-b">
      ${objPick ? html`<div class="col">
        <div><b>${c.seats.find(s => s.id === objPick)?.person || c.seats.find(s => s.id === objPick)?.name}</b> objects on the grounds of…</div>
        <div class="grounds">${OBJECTION_GROUNDS.map((g, i) => html`<button class="btn sm" onClick=${() => { run(conn, { type: 'objection', by: objPick, grounds: g }); setObjPick(null); }}><span class="kbd">${i + 1}</span> ${g}</button>`)}</div>
        <button class="btn xs ghost" onClick=${() => setObjPick(null)}>Cancel</button>
      </div>` : o && !o.ruling ? html`<div class="col">
        <div class="obj-live">OBJECTION! <span>${by?.person || by?.name} · ${o.grounds}</span></div>
        <div class="row"><button class="btn lg good grow" onClick=${() => run(conn, { type: 'rule', ruling: 'sustained' })}>Sustained <span class="kbd">S</span></button><button class="btn lg danger grow" onClick=${() => run(conn, { type: 'rule', ruling: 'overruled' })}>Overruled <span class="kbd">R</span></button></div>
      </div>` : html`<div class="row wrap">${sides.map(s => html`<button class="btn sm danger" onClick=${() => setObjPick(s.id)}>! ${s.person || s.name}</button>`)}</div>
        ${o?.ruling && html`<div class="small" style="margin-top:8px">Last: <b>${o.grounds}</b> — <span class=${o.ruling === 'sustained' ? 'pos' : 'neg'}>${o.ruling}</span> <button class="btn xs ghost" onClick=${() => run(conn, { type: 'clearObjection' })}>Clear from stage</button></div>`}`}
      <div class="dim small" style="margin-top:8px">${c.objections.filter(x => x.ruling === 'sustained').length} sustained · ${c.objections.filter(x => x.ruling === 'overruled').length} overruled</div>
    </div>
  </div>`;
}

function Exhibits({ conn, c }) {
  const [f, setF] = useState({ title: '', text: '', side: 'prosecution', image: null });
  const [open, setOpen] = useState(false);
  const onFile = e => {
    const file = e.target.files[0]; if (!file) return;
    const img = new Image(), rd = new FileReader();
    rd.onload = () => { img.onload = () => {
      // Shrink large photos so the committee stays light.
      const s = Math.min(1, 1100 / Math.max(img.width, img.height)), cv = document.createElement('canvas');
      cv.width = img.width * s; cv.height = img.height * s; cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      setF(x => ({ ...x, image: cv.toDataURL('image/jpeg', 0.82) }));
    }; img.src = rd.result; };
    rd.readAsDataURL(file);
  };
  return html`<div class="card"><div class="card-h"><h3>Evidence board</h3><div class="grow"></div><button class="btn xs" onClick=${() => setOpen(o => !o)}>${open ? 'Close' : '＋ Exhibit'}</button></div>
    <div class="card-b">
      ${open && html`<div class="col" style="margin-bottom:10px">
        <div class="seg sm">${[['prosecution', 'Prosecution'], ['defence', 'Defence'], ['court', 'Court']].map(([k, l]) => html`<button class=${f.side === k ? 'on' : ''} onClick=${() => setF({ ...f, side: k })}>${l}</button>`)}</div>
        <input class="input" placeholder="Title, e.g. Intercepted letter" value=${f.title} onInput=${e => setF({ ...f, title: e.target.value })} />
        <textarea class="input" rows="2" placeholder="What it shows" value=${f.text} onInput=${e => setF({ ...f, text: e.target.value })}></textarea>
        <label class="btn sm">${f.image ? '✓ Image attached' : 'Attach image'}<input type="file" accept="image/*" hidden onChange=${onFile} /></label>
        <button class="btn sm primary" disabled=${!f.title.trim()} onClick=${async () => { const r = await run(conn, { type: 'addExhibit', ...f }); if (r.ok) { setF({ title: '', text: '', side: f.side, image: null }); setOpen(false); } }}>Add exhibit</button>
      </div>`}
      ${c.exhibits.length === 0 && html`<div class="empty">No exhibits yet.</div>`}
      <div class="exhibits">${c.exhibits.map(ex => html`<div class=${cls('exhibit', `ex-${ex.side}`, c.shownExhibit?.id === ex.id && 'shown')} key=${ex.id}>
        <div class="row"><span class="ex-code mono">${ex.code}</span><b class="grow ellipsis">${ex.title}</b></div>
        ${ex.image && html`<img src=${ex.image} alt="" />`}
        <div class="row wrap">
          <button class=${cls('btn xs', c.shownExhibit?.id === ex.id && 'on')} onClick=${() => run(conn, { type: 'showExhibit', id: c.shownExhibit?.id === ex.id ? null : ex.id })}>${c.shownExhibit?.id === ex.id ? 'Hide' : 'Show on stage'}</button>
          <button class=${cls('btn xs', ex.admitted === true && 'good')} onClick=${() => run(conn, { type: 'editExhibit', id: ex.id, admitted: ex.admitted === true ? null : true })}>Admitted</button>
          <button class=${cls('btn xs', ex.admitted === false && 'danger')} onClick=${() => run(conn, { type: 'editExhibit', id: ex.id, admitted: ex.admitted === false ? null : false })}>Struck</button>
          <button class="btn xs ghost" onClick=${() => run(conn, { type: 'removeExhibit', id: ex.id })}>✕</button>
        </div>
      </div>`)}</div>
    </div>
  </div>`;
}

function Scales({ conn, c }) {
  return html`<div class="card"><div class="card-h"><h3>Scales of justice</h3></div><div class="card-b">
    <div class="scales-mini"><span>Defence</span><input type="range" min="-10" max="10" value=${c.scales} onChange=${e => run(conn, { type: 'setScales', value: +e.target.value })} /><span>Prosecution</span></div>
    <div class="row" style="justify-content:center"><button class="btn xs" onClick=${() => run(conn, { type: 'setScales', delta: -1 })}>◀ Defence</button><span class="mono">${c.scales > 0 ? `+${c.scales}` : c.scales}</span><button class="btn xs" onClick=${() => run(conn, { type: 'setScales', delta: 1 })}>Prosecution ▶</button></div>
  </div></div>`;
}

function Verdict({ conn, c }) {
  const v = c.verdict;
  const [f, setF] = useState({ text: v.text, detail: v.detail, tone: v.tone || 'neutral' });
  return html`<div class="card"><div class="card-h"><h3>Verdict</h3>${v.revealedAt ? html`<span class="chip gold">revealed</span>` : ''}</div><div class="card-b col">
    <div class="row wrap">${[['GUILTY', 'guilty'], ['NOT GUILTY', 'innocent'], ['LIABLE', 'guilty'], ['NOT LIABLE', 'innocent'], ['MISTRIAL', 'neutral']].map(([t, tone]) => html`<button class=${cls('btn xs', f.text === t && 'on')} onClick=${() => setF({ ...f, text: t, tone })}>${t}</button>`)}</div>
    <input class="input" placeholder="Verdict" value=${f.text} onInput=${e => setF({ ...f, text: e.target.value.toUpperCase() })} />
    <textarea class="input" rows="2" placeholder="Sentence or reasoning (optional)" value=${f.detail} onInput=${e => setF({ ...f, detail: e.target.value })}></textarea>
    <div class="row">
      <button class="btn sm" onClick=${() => run(conn, { type: 'verdictSet', ...f }, 'Verdict sealed')}>Seal</button>
      <div class="grow"></div>
      ${v.revealedAt ? html`<button class="btn sm ghost" onClick=${() => run(conn, { type: 'verdictReveal', hide: true })}>Hide</button>`
        : html`<button class="btn sm gold" disabled=${!f.text.trim()} onClick=${async () => { await run(conn, { type: 'verdictSet', ...f }); run(conn, { type: 'verdictReveal' }); }}>Reveal on stage</button>`}
    </div>
  </div></div>`;
}

function Stats({ c, now }) {
  const rows = c.seats.map(s => ({ s, ms: (c.stats.speaking[s.id] || 0) + (c.speaker === s.id && c.speakerSince ? now - c.speakerSince : 0), turns: c.stats.turns?.[s.id] || 0 })).filter(r => r.ms > 0).sort((a, b) => b.ms - a.ms);
  if (!rows.length) return null;
  const max = rows[0].ms;
  return html`<div class="card" style="margin-top:10px"><div class="card-h"><h3>Floor time</h3></div><div class="card-b">
    ${rows.map(r => html`<div class="ft-row"><span class="ellipsis">${r.s.person || r.s.name}</span><div class="bar grow"><i style=${`width:${(r.ms / max) * 100}%`}></i></div><span class="mono small">${fmt.clock(r.ms / 1000)}</span></div>`)}
  </div></div>`;
}
