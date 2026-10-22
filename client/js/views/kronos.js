// Kronos's command centre: every committee at a glance, the eye, freezes, global pause and broadcast, DMs and accounts.
import { html, useState, useEffect, toast, fmt, cls, useConnState, useNow, timerRemaining } from '../lib.js';
import { CommitteePanel } from '../app.js';
import { DMThread } from './dm.js';
import { Globe } from './login.js';
import { sfx } from '../fx/audio.js';

export function KronosHome({ conn, user, logout }) {
  const [inside, setInside] = useState(null);
  const [overview, setOverview] = useState([]);
  const [dmFor, setDmFor] = useState(null);
  const [accounts, setAccounts] = useState(null);
  const [status, setStatus] = useState(conn.status);
  useEffect(() => conn.on('status', setStatus), [conn]);
  useEffect(() => conn.on('overview:raw', m => setOverview(m.committees)), [conn]);
  useEffect(() => conn.on('accounts:raw', m => setAccounts(m.list)), [conn]);
  useEffect(() => conn.on('dm', m => { if (!m.msg.fromKronos) toast(`${m.msg.from}: ${m.msg.text.slice(0, 90)}`, m.msg.urgent ? 'error' : 'kronos'); }), [conn]);
  useEffect(() => { const t = setInterval(() => conn.raw({ t: 'overview' }), 5000); conn.raw({ t: 'overview' }); return () => clearInterval(t); }, [conn]);
  useEffect(() => { if (status === 'live') conn.raw({ t: 'overview' }); }, [status]);

  const enter = async id => { const r = await conn.join(id); if (!r.ok) return toast(r.error, 'error'); setInside(id); };
  const leave = () => { conn.raw({ t: 'leave' }); conn.committee = null; setInside(null); };

  if (inside) return html`<${Inside} conn=${conn} user=${user} committee=${inside} onBack=${leave} logout=${logout} />`;

  return html`
    <div class="kronos-home">
      <${Globe} className="kronos-globe" speed=${3} glow="#d4a72c" arcs=${false} />
      <header class="k-top">
        <div class="k-brand"><span class="k-hourglass">⌛</span><div><div class="k-title">KRONOS</div><div class="k-sub">The World Engine · all committees</div></div></div>
        <div class="grow"></div>
        <span class=${cls('conn', status)}><i class=${cls('dot', status === 'live' && 'live')}></i> ${status === 'live' ? 'Live' : status}</span>
        <button class="btn sm" onClick=${() => { conn.raw({ t: 'accounts' }); setAccounts(a => a || []); }}>Accounts</button>
        <button class="btn sm ghost" onClick=${logout}>Sign out</button>
      </header>
      <div class="k-body">
        <section class="k-grid">
          ${overview.length === 0 && html`<div class="empty">Connecting to the committees…</div>`}
          ${overview.map(c => html`<${CommitteeCard} conn=${conn} c=${c} key=${c.id} enter=${() => enter(c.id)} dm=${() => setDmFor(c.id)} />`)}
        </section>
        <aside class="k-side">
          <${GlobalControls} conn=${conn} />
          <div class="card k-inbox">
            <div class="card-h"><h3>Zeus messages</h3></div>
            <div class="k-threads">
              ${overview.map(c => html`<button class=${cls('k-thread', dmFor === c.id && 'on')} onClick=${() => setDmFor(c.id)}><span class="grow ellipsis">${c.name}</span>${c.unread > 0 && html`<i class="badge inline">${c.unread}</i>`}</button>`)}
            </div>
            ${dmFor ? html`<${KronosThread} conn=${conn} committee=${dmFor} name=${overview.find(o => o.id === dmFor)?.name} />` : html`<div class="empty">Pick a committee to read or send messages.</div>`}
          </div>
        </aside>
      </div>
      ${accounts && html`<${Accounts} conn=${conn} list=${accounts} close=${() => setAccounts(null)} />`}
    </div>`;
}

// Kronos reads any committee's messages without joining it.
function KronosThread({ conn, committee, name }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(false); conn.request({ t: 'dmHistory', committee }).then(() => setReady(true)); }, [committee]);
  if (!ready) return html`<div class="empty">Loading…</div>`;
  return html`<${DMThread} conn=${conn} committee=${committee} kronos=${true} name=${name} compact=${true} />`;
}

function CommitteeCard({ conn, c, enter, dm }) {
  const now = useNow(conn, 1000);
  const [confirm, setConfirm] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(c.name);
  const act = (action, ok) => conn.act(action, c.id).then(r => { if (!r.ok) toast(r.error, 'error'); else if (ok) toast(ok, 'good'); });
  const t = c.tension ?? 0;
  const rem = timerRemaining(c.timer, now);
  const reset = async mode => { const r = await conn.request({ t: 'reset', committee: c.id, mode }); toast(r.ok ? `${c.name} reset as a ${mode} committee.` : r.error, r.ok ? 'good' : 'error'); setConfirm(false); };
  return html`
    <div class=${cls('k-card-c card', c.eye && 'watching', c.locked && 'frozen')}>
      <div class="kc-top">
        <div class="grow">
          ${renaming ? html`<form onSubmit=${e => { e.preventDefault(); act({ type: 'rename', name }); setRenaming(false); }}><input class="input sm" value=${name} onInput=${e => setName(e.target.value)} autofocus onBlur=${() => setRenaming(false)} /></form>`
            : html`<div class="kc-name" onDblClick=${() => setRenaming(true)} title="Double-click to rename">${c.name}</div>`}
          <div class="dim small">${c.mode === 'court' ? 'Court' : 'World'} · ${c.id}${c.mode === 'world' ? ` · turn ${c.turn} · ${c.clock}` : c.court ? ` · ${c.court.phase}` : ''}</div>
        </div>
        ${c.mode === 'world' && html`<div class="kc-ring" style=${`--p:${t * 10};--c:${t >= 8 ? '#ff4d5e' : t >= 6 ? '#ff7a45' : t >= 4 ? '#ffb224' : '#3ddc97'}`}><b>${t}</b><span>${c.tensionName}</span></div>`}
      </div>
      <div class="kc-stats">
        <div><span class="dim small">Zeus online</span><b>${c.online.length ? c.online.map(o => o.user.replace(`${c.id}-`, '') + (o.view === 'display' ? ' (display)' : '')).join(', ') : html`<span class="neg">nobody</span>`}</b></div>
        <div><span class="dim small">On stage</span><b>${c.scene}</b></div>
        ${c.mode === 'world' ? html`<div><span class="dim small">Wars · Delegates</span><b>${c.wars} · ${c.players}</b></div><div><span class="dim small">Waiting news</span><b class=${c.pending ? 'gold-t' : ''}>${c.pending}</b></div>`
          : html`<div><span class="dim small">Speaking</span><b>${c.court?.speaker || '—'}</b></div><div><span class="dim small">Verdict</span><b>${c.court?.verdict ? 'Revealed' : 'Pending'}</b></div>`}
        ${(c.timer?.running || rem > 0) && html`<div><span class="dim small">${c.timer.label || 'Timer'}</span><b class="mono">${fmt.clock(rem)}</b></div>`}
      </div>
      <div class="kc-log">${(c.lastLog || []).slice().reverse().map(l => html`<div class="ellipsis small dim">${l.text || l.summary}</div>`)}</div>
      <div class="kc-actions">
        <button class="btn sm kronos" onClick=${enter}>Enter</button>
        <button class=${cls('btn sm eye-btn', c.eye && 'on-eye')} onClick=${() => { act({ type: 'setEye', value: !c.eye }); if (!c.eye) sfx.glitch(); }} title="Show KRONOS IS WATCHING on their screens">👁 ${c.eye ? 'Watching' : 'Eye'}</button>
        <button class=${cls('btn sm', c.locked && 'solid-danger')} onClick=${() => act({ type: 'setLock', value: !c.locked })}>${c.locked ? 'Frozen' : 'Freeze'}</button>
        <button class="btn sm" onClick=${dm}>✉${c.unread ? html` <i class="badge inline">${c.unread}</i>` : ''}</button>
        <button class="btn sm ghost" onClick=${() => window.open(`/display?c=${c.id}`, `display-${c.id}`, 'width=1280,height=720')} title="Watch their stage display">▣</button>
        <div class="grow"></div>
        ${confirm ? html`<button class="btn xs" onClick=${() => setConfirm(false)}>Cancel</button><button class="btn xs solid-danger" onClick=${() => reset('world')}>Reset world</button><button class="btn xs solid-danger" onClick=${() => reset('court')}>Reset court</button>`
          : html`<button class="btn xs ghost" onClick=${() => setConfirm(true)}>Reset…</button>`}
      </div>
    </div>`;
}

function GlobalControls({ conn }) {
  const [g, setG] = useState(conn.global);
  useEffect(() => conn.on('global', v => setG({ ...v })), [conn]);
  const [label, setLabel] = useState('Prayer break');
  const [mins, setMins] = useState(20);
  const [text, setText] = useState('');
  return html`<div class="card"><div class="card-h"><h3>Every committee</h3></div><div class="card-b col">
    <div class="row"><input class="input sm grow" value=${label} onInput=${e => setLabel(e.target.value)} /><input class="input sm" style="width:56px" type="number" min="0" value=${mins} onInput=${e => setMins(+e.target.value)} title="Minutes (0 = until lifted)" /><span class="dim small">min</span></div>
    ${g.pause ? html`<button class="btn solid-danger" onClick=${() => conn.request({ t: 'pauseAll', on: false })}>End the pause everywhere</button>`
      : html`<button class="btn gold" onClick=${() => conn.request({ t: 'pauseAll', on: true, label, minutes: mins })}>⏸ Pause every stage display</button>`}
    <hr class="sep" />
    <textarea class="input" rows="2" placeholder="Broadcast to every Zeus and display" value=${text} onInput=${e => setText(e.target.value)}></textarea>
    <div class="row"><button class="btn sm kronos" disabled=${!text.trim()} onClick=${() => { conn.request({ t: 'broadcast', text, seconds: 25 }); setText(''); }}>Broadcast</button>${g.broadcast && html`<button class="btn sm ghost" onClick=${() => conn.request({ t: 'broadcast', text: '' })}>Clear</button>`}</div>
  </div></div>`;
}

function Inside({ conn, user, committee, onBack, logout }) {
  const state = useConnState(conn, committee);
  if (!state) return html`<div class="boot"><div class="boot-ring"></div><div class="boot-text">ENTERING</div></div>`;
  return html`<${CommitteePanel} conn=${conn} user=${user} state=${state} committee=${committee} onBack=${onBack} logout=${logout} />`;
}

function Accounts({ conn, list, close }) {
  const [show, setShow] = useState(false);
  return html`<div class="modal-back" onClick=${e => e.target === e.currentTarget && close()}>
    <div class="modal wide card">
      <div class="card-h"><h3>Accounts</h3><div class="grow"></div><button class="btn xs" onClick=${() => setShow(s => !s)}>${show ? 'Hide' : 'Show'} passwords</button><button class="btn xs ghost" onClick=${close}>✕</button></div>
      <div class="card-b">
        <p class="muted" style="margin-top:0">Passwords are generated from the server's secret and survive restarts. Changing one signs that account out everywhere.</p>
        <table class="acct-table">
          <thead><tr><th>Account</th><th>Role</th><th>Committee</th><th>Password</th><th></th></tr></thead>
          <tbody>${list.map(a => html`<tr>
            <td class="mono">${a.username}</td><td>${a.role === 'kronos' ? 'Kronos' : a.role === 'stage' ? 'Stage Zeus' : 'Back Room Zeus'}</td><td>${a.committeeName || '—'}</td>
            <td class="mono">${show ? a.password : '••••••••••••'}</td>
            <td class="row">${a.online && html`<span class="chip green">online</span>`}${a.role !== 'kronos' && html`
              <button class="btn xs" onClick=${async () => { const r = await conn.request({ t: 'rotate', username: a.username }); toast(r.ok ? `New password: ${r.result.password}` : r.error, r.ok ? 'good' : 'error'); }}>New password</button>
              ${a.online && html`<button class="btn xs danger" onClick=${() => conn.request({ t: 'kick', username: a.username })}>Kick</button>`}`}</td>
          </tr>`)}</tbody>
        </table>
        <button class="btn sm" style="margin-top:10px" onClick=${() => { const txt = list.map(a => `${a.username}\t${a.password}`).join('\n'); navigator.clipboard.writeText(txt).then(() => toast('Copied all accounts', 'good')); }}>Copy all</button>
      </div>
    </div>
  </div>`;
}
