// Live connections: every panel and stage display holds a WebSocket. Any change is applied on the server
// and the new committee state is pushed to everyone in that room within milliseconds.
import { WebSocketServer } from 'ws';
import { applyAction } from '../shared/engine/reducer.js';
import { tensionLevel } from '../shared/engine/core.js';
import { verifyToken, parseCookies, accounts, passwordFor, rotatePassword, COMMITTEE_IDS } from './auth.js';
import { readJSON, writeJSON } from './files.js';

export function createHub(server, store, geo) {
  const wss = new WebSocketServer({ server, path: '/ws', perMessageDeflate: { threshold: 1024 }, maxPayload: 8 * 1024 * 1024 });
  const clients = new Set();
  const globalState = readJSON(store.dir, 'global.json', { pause: null, broadcast: null });
  let overviewTimer = null;

  const send = (c, msg) => { if (c.ws.readyState === 1) c.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); };
  const canAccess = (user, committee) => user.role === 'kronos' || user.committee === committee;
  const dmName = committee => store.get(committee)?.name || committee;

  function broadcastState(committee, extra = {}) {
    const state = store.get(committee);
    const msg = JSON.stringify({ t: 'state', committee, state, serverNow: Date.now(), ...extra });
    for (const c of clients) if (c.committee === committee) send(c, msg);
    scheduleOverview();
  }

  function summary(id) {
    const s = store.get(id);
    const here = [...clients].filter(c => c.committee === id);
    const pending = s.review ? s.review.filter(r => r.status === 'pending').length : 0;
    return {
      id, name: s.name, mode: s.mode, version: s.version,
      turn: s.meta?.turn, clock: s.meta?.clock, phase: s.meta?.phase,
      tension: s.global?.tension, tensionName: s.global ? tensionLevel(s.global.tension).name : null, oil: s.global?.oilPrice, wars: s.wars?.length,
      players: s.countries ? Object.values(s.countries).filter(c => c.control === 'player').length : 0,
      scene: s.display?.scene, eye: s.kronos.eye, locked: s.kronos.locked, pending,
      court: s.court ? { phase: s.court.phases[s.court.phase], speaker: s.court.seats.find(x => x.id === s.court.speaker)?.name || null, verdict: !!s.court.verdict.revealedAt } : null,
      timer: s.timer,
      online: here.filter(c => c.user.role !== 'kronos').map(c => ({ user: c.user.username, view: c.view })),
      kronosHere: here.some(c => c.user.role === 'kronos'),
      lastLog: s.log.slice(-3),
      unread: (store.dms[id] || []).filter(m => !m.fromKronos && !m.readByKronos).length,
    };
  }

  function scheduleOverview() {
    if (overviewTimer) return;
    overviewTimer = setTimeout(() => {
      overviewTimer = null;
      const msg = JSON.stringify({ t: 'overview', committees: COMMITTEE_IDS.map(summary), serverNow: Date.now() });
      for (const c of clients) if (c.user.role === 'kronos') send(c, msg);
    }, 400);
  }

  function pushGlobal() {
    writeJSON(store.dir, 'global.json', globalState);
    const msg = JSON.stringify({ t: 'global', ...globalState, serverNow: Date.now() });
    for (const c of clients) send(c, msg);
  }

  function dmsFor(user, committee) {
    return (store.dms[committee] || []);
  }

  function pushDM(committee, msg) {
    const out = JSON.stringify({ t: 'dm', committee, msg });
    for (const c of clients) if (c.user.role === 'kronos' || (c.user.committee === committee && c.view === 'panel')) send(c, out);
    scheduleOverview();
  }

  wss.on('connection', (ws, req) => {
    const user = verifyToken(parseCookies(req.headers.cookie).we_session);
    if (!user) { ws.close(4001, 'Not signed in'); return; }
    const c = { ws, user, committee: null, view: 'panel', alive: true };
    clients.add(c);
    ws.on('pong', () => { c.alive = true; });
    const committees = COMMITTEE_IDS.filter(id => canAccess(user, id)).map(id => ({ id, name: store.get(id).name, mode: store.get(id).mode }));
    send(c, { t: 'hello', user: { username: user.username, role: user.role, committee: user.committee }, committees, bootId: store.bootId, serverNow: Date.now(), global: globalState });
    if (user.role === 'kronos') scheduleOverview();

    ws.on('message', raw => {
      let m;
      try { m = JSON.parse(raw); } catch { return; }
      try { handle(c, m); } catch (e) { console.error('[hub]', e); send(c, { t: 'ack', id: m.id, ok: false, error: 'Server error: ' + e.message }); }
    });
    ws.on('close', () => { clients.delete(c); scheduleOverview(); });
  });

  function handle(c, m) {
    const { user } = c;
    const ack = (ok, extra = {}) => send(c, { t: 'ack', id: m.id, ok, ...extra });
    const isKronos = user.role === 'kronos';
    switch (m.t) {
      case 'ping': return send(c, { t: 'pong', serverNow: Date.now() });
      case 'join': {
        if (!COMMITTEE_IDS.includes(m.committee) || !canAccess(user, m.committee)) return ack(false, { error: 'You do not have access to that committee.' });
        c.committee = m.committee;
        c.view = m.view === 'display' ? 'display' : 'panel';
        send(c, { t: 'state', committee: m.committee, state: store.get(m.committee), serverNow: Date.now(), joined: true });
        if (c.view === 'panel') {
          send(c, { t: 'dms', committee: m.committee, list: dmsFor(user, m.committee) });
          send(c, { t: 'snapshots', committee: m.committee, list: store.snapshotList(m.committee) });
        }
        scheduleOverview();
        return ack(true);
      }
      case 'leave': c.committee = null; scheduleOverview(); return ack(true);
      case 'act': {
        const id = m.committee || c.committee;
        if (!id || !canAccess(user, id)) return ack(false, { error: 'Join a committee first.' });
        if (c.view === 'display') return ack(false, { error: 'The stage display is view-only.' });
        const state = store.get(id);
        const ctx = { role: user.role, user: user.username, now: Date.now(), geo };
        const def = m.action?.type === 'resolveTurn';
        if (def) store.snapshot(id, `Start of turn ${state.meta.turn}`, user.username);
        const r = applyAction(state, m.action, ctx);
        ack(r.ok, { error: r.error, result: r.ok ? strip(r) : undefined });
        if (r.ok && !r.readOnly) {
          store.touch(id);
          broadcastState(id);
          if (def) for (const cl of clients) if (cl.committee === id && cl.view === 'panel') send(cl, { t: 'snapshots', committee: id, list: store.snapshotList(id) });
        }
        return;
      }
      case 'snapshot': {
        const id = m.committee || c.committee;
        if (!id || !canAccess(user, id)) return ack(false, { error: 'No access.' });
        const snap = store.snapshot(id, String(m.label || 'Save point').slice(0, 60), user.username);
        snap.keep = true;
        sendSnapshots(id);
        return ack(true);
      }
      case 'rewind': {
        const id = m.committee || c.committee;
        if (!id || !canAccess(user, id)) return ack(false, { error: 'No access.' });
        if (store.get(id).kronos.locked && !isKronos) return ack(false, { error: 'Kronos has locked this panel.' });
        const s = store.rewind(id, m.snapId, user.username);
        if (!s) return ack(false, { error: 'That save point no longer exists.' });
        s.log.push({ turn: s.meta?.turn, at: Date.now(), by: user.username, text: 'Rewound to an earlier save point' });
        broadcastState(id, { rewound: true });
        sendSnapshots(id);
        return ack(true);
      }
      case 'restore': {
        // Upload a backup (from a file or this browser's automatic copy) after a server restart wiped the disk.
        const id = m.committee || c.committee;
        if (!id || !canAccess(user, id)) return ack(false, { error: 'No access.' });
        const st = m.state;
        if (!st || typeof st !== 'object' || !st.meta || !['world', 'court'].includes(st.mode) || !st.kronos) return ack(false, { error: 'That file is not a World Engine save.' });
        if (st.mode === 'world' && (!st.countries || !st.units)) return ack(false, { error: 'That save is incomplete.' });
        if (st.mode === 'court' && !st.court) return ack(false, { error: 'That save is incomplete.' });
        store.replace(id, st, user.username);
        broadcastState(id, { rewound: true });
        sendSnapshots(id);
        return ack(true);
      }
      case 'snapshots': {
        const id = m.committee || c.committee;
        if (!id || !canAccess(user, id)) return ack(false);
        return send(c, { t: 'snapshots', committee: id, list: store.snapshotList(id) });
      }
      case 'dm': {
        const committee = isKronos ? m.committee : user.committee;
        if (!COMMITTEE_IDS.includes(committee)) return ack(false, { error: 'Pick a committee.' });
        const text = String(m.text || '').trim().slice(0, 2000);
        if (!text) return ack(false, { error: 'Empty message.' });
        const msg = store.addDM(committee, {
          id: `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`, at: Date.now(), text,
          fromKronos: isKronos, from: isKronos ? 'Kronos' : dmName(committee), sender: user.username, role: user.role,
          urgent: !!m.urgent, readByKronos: isKronos,
        });
        pushDM(committee, msg);
        return ack(true);
      }
      case 'dmHistory': {
        if (!COMMITTEE_IDS.includes(m.committee) || !canAccess(user, m.committee)) return ack(false);
        send(c, { t: 'dms', committee: m.committee, list: dmsFor(user, m.committee) });
        return ack(true);
      }
      case 'dmRead': {
        if (!isKronos) return ack(true);
        for (const msg of store.dms[m.committee] || []) msg.readByKronos = true;
        scheduleOverview();
        return ack(true);
      }
      // ----- Kronos only -----
      default: if (!isKronos) return ack(false, { error: 'Only Kronos can do that.' });
    }
    switch (m.t) {
      case 'overview': scheduleOverview(); return ack(true);
      case 'pauseAll': {
        globalState.pause = m.on ? { label: String(m.label || 'Prayer break').slice(0, 60), ar: String(m.ar || 'استراحة الصلاة').slice(0, 60), at: Date.now(), until: m.minutes ? Date.now() + Number(m.minutes) * 60000 : 0 } : null;
        pushGlobal(); return ack(true);
      }
      case 'broadcast': {
        const text = String(m.text || '').trim().slice(0, 200);
        globalState.broadcast = text ? { text, at: Date.now(), until: Date.now() + (Number(m.seconds) || 20) * 1000, onDisplays: !!m.onDisplays } : null;
        pushGlobal(); return ack(true);
      }
      case 'reset': {
        if (!COMMITTEE_IDS.includes(m.committee)) return ack(false, { error: 'Unknown committee.' });
        store.reset(m.committee, m.mode === 'court' ? 'court' : m.mode === 'world' ? 'world' : undefined, user.username);
        broadcastState(m.committee, { rewound: true });
        sendSnapshots(m.committee);
        return ack(true);
      }
      case 'resetAll': {
        // Every committee starts over in its current mode and name. Each one keeps a "Before reset" save point.
        for (const id of COMMITTEE_IDS) {
          store.reset(id, store.get(id).mode === 'court' ? 'court' : 'world', user.username);
          broadcastState(id, { rewound: true });
          sendSnapshots(id);
        }
        scheduleOverview();
        return ack(true);
      }
      case 'accounts': return send(c, { t: 'accounts', list: accounts().map(a => ({ ...a, password: passwordFor(a.username), committeeName: a.committee ? store.get(a.committee).name : null, online: [...clients].some(x => x.user.username === a.username) })) });
      case 'rotate': {
        const pw = rotatePassword(m.username);
        if (!pw) return ack(false, { error: 'Cannot rotate that account.' });
        for (const x of clients) if (x.user.username === m.username) x.ws.close(4001, 'Password changed');
        handle(c, { t: 'accounts' });
        return ack(true, { result: { password: pw } });
      }
      case 'kick': {
        for (const x of clients) if (x.user.username === m.username && x.user.role !== 'kronos') x.ws.close(4002, 'Disconnected by Kronos');
        return ack(true);
      }
      default: return ack(false, { error: `Unknown message "${m.t}".` });
    }
  }

  function sendSnapshots(id) {
    const msg = JSON.stringify({ t: 'snapshots', committee: id, list: store.snapshotList(id) });
    for (const cl of clients) if (cl.committee === id && cl.view === 'panel') send(cl, msg);
  }

  // Drop dead connections so presence stays honest.
  const beat = setInterval(() => {
    for (const c of clients) {
      if (!c.alive) { c.ws.terminate(); clients.delete(c); continue; }
      c.alive = false;
      try { c.ws.ping(); } catch { /* closed */ }
    }
    if (globalState.broadcast && globalState.broadcast.until < Date.now()) { globalState.broadcast = null; pushGlobal(); }
    if (globalState.pause?.until && globalState.pause.until < Date.now()) { globalState.pause = null; pushGlobal(); }
  }, 15000);
  wss.on('close', () => clearInterval(beat));

  return { wss, clients, broadcastState };
}

function strip(r) {
  const { ok, error, snapshot, readOnly, ...rest } = r;
  return rest;
}
