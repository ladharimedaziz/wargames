// Panel entry point: sign-in, then the Zeus panel for a committee account or the Kronos command centre.
import { CouncilPanel } from './council/panel.js';
import { UsaPanel } from './usa/panel.js';
import { html, render, useState, useEffect, Connection, Toasts, toast, useConnState, fmt } from './lib.js';
import { Login } from './views/login.js';
import { KronosHome } from './views/kronos.js';
import { WorldPanel } from './world/panel.js';
import { CourtPanel } from './court/panel.js';
import { KronosEye } from './fx/eye.js';
import { unlockAudio, sfx } from './fx/audio.js';

function App() {
  const [user, setUser] = useState(undefined);
  const [conn, setConn] = useState(null);
  useEffect(() => {
    fetch('/api/me').then(r => (r.ok ? r.json() : null)).then(j => setUser(j?.user || null)).catch(() => setUser(null));
  }, []);
  useEffect(() => {
    if (!user) return;
    const c = new Connection({ view: 'panel' });
    c.on('signedout', reason => { toast(reason || 'Signed out.', 'error'); setUser(null); setConn(null); });
    setConn(c);
    return () => { try { c.ws.onclose = null; c.ws.close(); } catch { /* already closed */ } };
  }, [user?.username]);
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }, []);

  if (user === undefined) return html`<div class="boot"><div class="boot-ring"></div><div class="boot-text">THE WORLD ENGINE</div></div>`;
  if (!user) return html`<${Login} onDone=${setUser} /><${Toasts} />`;
  if (!conn) return null;
  const logout = async () => { await fetch('/api/logout'); location.href = '/'; };
  return html`
    ${user.role === 'kronos' ? html`<${KronosHome} conn=${conn} user=${user} logout=${logout} />` : html`<${ZeusHome} conn=${conn} user=${user} logout=${logout} />`}
    <${GlobalLayer} conn=${conn} />
    <${RestorePrompt} conn=${conn} />
    <${Toasts} />`;
}

function ZeusHome({ conn, user, logout }) {
  const [joined, setJoined] = useState(false);
  useEffect(() => { conn.join(user.committee).then(r => { if (!r.ok) toast(r.error, 'error'); setJoined(true); }); }, [conn]);
  const state = useConnState(conn, user.committee);
  if (!state) return html`<div class="boot"><div class="boot-ring"></div><div class="boot-text">CONNECTING</div></div>`;
  return html`<${CommitteePanel} conn=${conn} user=${user} state=${state} committee=${user.committee} logout=${logout} />`;
}

export function CommitteePanel({ conn, user, state, committee, logout, onBack }) {
  const props = { conn, user, state, committee, logout, onBack };
  return html`
    ${state.mode === 'court' ? html`<${CourtPanel} ...${props} />` : state.mode === 'usa' ? html`<${UsaPanel} ...${props} />` : state.mode === 'council' ? html`<${CouncilPanel} ...${props} />` : html`<${WorldPanel} ...${props} />`}
    ${user.role !== 'kronos' && html`<${KronosEye} on=${state.kronos.eye} />`}`;
}

function GlobalLayer({ conn }) {
  const [g, setG] = useState(conn.global);
  useEffect(() => conn.on('global', v => { setG({ ...v }); if (v.broadcast) sfx.alarm(); }), [conn]);
  useEffect(() => conn.on('hello:raw', m => setG({ ...(m.global || {}) })), [conn]);
  return html`
    ${g.broadcast && html`<div class="global-broadcast"><b>KRONOS</b> ${g.broadcast.text}</div>`}
    ${g.pause && html`<div class="pause-strip">⏸ ${g.pause.label} — every stage display is paused${g.pause.until ? ` until ${fmt.time(g.pause.until)}` : ''}</div>`}`;
}

// After a restart on a host with a throwaway disk, offer to bring back this browser's copy.
function RestorePrompt({ conn }) {
  const [offer, setOffer] = useState(null);
  useEffect(() => conn.on('older', o => setOffer(o)), [conn]);
  if (!offer) return null;
  const restore = async () => {
    const r = await conn.request({ t: 'restore', committee: offer.committee, state: offer.local });
    toast(r.ok ? 'Committee restored from this browser.' : r.error, r.ok ? 'good' : 'error');
    setOffer(null);
  };
  return html`
    <div class="modal-back">
      <div class="modal card">
        <div class="card-h"><h3>The server restarted</h3></div>
        <div class="card-b col">
          <p style="margin:0">The server came back with an older copy of <b>${offer.server.name}</b> (turn ${offer.server.meta?.turn ?? '–'}) than this browser has saved (turn ${offer.local.meta?.turn ?? '–'}${offer.at ? `, saved ${fmt.ago(offer.at)}` : ''}).</p>
          <p class="muted" style="margin:0">Free hosting can wipe its disk when it sleeps. Restore this browser's copy to carry on where you left off.</p>
          <div class="row" style="justify-content:flex-end;margin-top:8px">
            <button class="btn" onClick=${() => setOffer(null)}>Keep the server's copy</button>
            <button class="btn primary" onClick=${restore}>Restore my copy</button>
          </div>
        </div>
      </div>
    </div>`;
}

render(html`<${App} />`, document.getElementById('app'));
