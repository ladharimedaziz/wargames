// Small shared client helpers: templating, the live connection, toasts, formatting.
import { h, render, createContext } from 'preact';
import { useState, useEffect, useRef, useMemo, useCallback, useContext, useReducer, useLayoutEffect } from 'preact/hooks';
import htm from 'htm';

export const html = htm.bind(h);
export { h, render, createContext, useState, useEffect, useRef, useMemo, useCallback, useContext, useReducer, useLayoutEffect };

// ---------- Live connection ----------
// One WebSocket per page. Keeps the latest state for the joined committee, re-joins after reconnects,
// and keeps a copy of the state in this browser in case the server restarts with an empty disk.
export class Connection {
  constructor({ view = 'panel' } = {}) {
    this.view = view;
    this.listeners = new Map();
    this.pending = new Map();
    this.seq = 1;
    this.offset = 0;
    this.status = 'connecting';
    this.committee = null;
    this.states = {};
    this.dms = {};
    this.snapshots = {};
    this.global = { pause: null, broadcast: null };
    this.retry = 0;
    this.connect();
    // Keeps free hosting awake while any panel or display is open.
    setInterval(() => fetch('/api/ping').catch(() => {}), 4 * 60 * 1000);
  }
  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    this.setStatus('connecting');
    ws.onopen = () => { this.retry = 0; this.setStatus('live'); };
    ws.onmessage = e => this.onMessage(JSON.parse(e.data));
    ws.onclose = e => {
      this.setStatus(e.code === 4001 ? 'signedout' : 'offline');
      for (const [, p] of this.pending) p.resolve({ ok: false, error: 'Connection lost. Retrying…' });
      this.pending.clear();
      if (e.code === 4001 || e.code === 4002) { this.emit('signedout', e.reason); return; }
      const wait = Math.min(8000, 400 * 2 ** this.retry++);
      setTimeout(() => this.connect(), wait);
    };
  }
  setStatus(s) { this.status = s; this.emit('status', s); }
  now() { return Date.now() + this.offset; }
  on(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); return () => this.listeners.get(type).delete(fn); }
  emit(type, data) { for (const fn of this.listeners.get(type) || []) fn(data); }
  onMessage(m) {
    if (m.serverNow) this.offset = m.serverNow - Date.now();
    switch (m.t) {
      case 'hello':
        this.user = m.user; this.committees = m.committees; this.global = m.global || this.global;
        // New code on the server (an update was installed): reload to run it.
        if (this.version && m.version && m.version !== this.version) { location.reload(); return; }
        this.version = m.version;
        if (this.bootId && this.bootId !== m.bootId) this.emit('restarted', m.bootId);
        this.bootId = m.bootId;
        if (this.committee) this.raw({ t: 'join', committee: this.committee, view: this.view });
        break;
      case 'state': {
        const prev = this.states[m.committee];
        this.states[m.committee] = m.state;
        this.backup(m.committee, m.state);
        if (m.joined && prev && this.view === 'panel') this.checkRestart(m.committee, prev, m.state);
        if (m.joined && !prev && this.view === 'panel') this.checkLocalBackup(m.committee, m.state);
        this.emit('state', { committee: m.committee, state: m.state, prev, rewound: m.rewound });
        break;
      }
      case 'ack': { const p = this.pending.get(m.id); if (p) { this.pending.delete(m.id); p.resolve(m); } break; }
      case 'dms': this.dms[m.committee] = m.list; this.emit('dms', m); break;
      case 'dm': (this.dms[m.committee] ||= []).push(m.msg); this.emit('dm', m); this.emit('dms', { committee: m.committee, list: this.dms[m.committee] }); break;
      case 'snapshots': this.snapshots[m.committee] = m.list; this.emit('snapshots', m); break;
      case 'global': this.global = { pause: m.pause, broadcast: m.broadcast }; this.emit('global', this.global); break;
    }
    this.emit(m.t + ':raw', m);
  }
  raw(msg) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(msg)); }
  request(msg) {
    return new Promise(resolve => {
      if (this.ws.readyState !== 1) {
        // Hold the request briefly while the socket reconnects instead of failing straight away.
        const off = this.on('status', st => { if (st === 'live') { off(); clearTimeout(t); this.request(msg).then(resolve); } });
        const t = setTimeout(() => { off(); resolve({ ok: false, error: 'Not connected. Retrying…' }); }, 8000);
        return;
      }
      const id = this.seq++;
      this.pending.set(id, { resolve });
      this.ws.send(JSON.stringify({ ...msg, id }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); resolve({ ok: false, error: 'The server did not answer in time.' }); } }, 20000);
    });
  }
  join(committee) { this.committee = committee; return this.request({ t: 'join', committee, view: this.view }); }
  act(action, committee) { return this.request({ t: 'act', action, committee: committee || this.committee }); }

  backup(committee, state) {
    if (this.view !== 'panel') return;
    clearTimeout(this.backupTimer);
    this.backupTimer = setTimeout(() => {
      try { localStorage.setItem(`we-backup-${committee}`, JSON.stringify({ at: Date.now(), state })); } catch { /* storage full or blocked */ }
    }, 1500);
  }
  localBackup(committee) {
    try { return JSON.parse(localStorage.getItem(`we-backup-${committee}`) || 'null'); } catch { return null; }
  }
  // If the server came back with a younger committee than this browser has seen, offer to restore.
  checkRestart(committee, prev, next) {
    if ((prev.meta?.turn || 0) > (next.meta?.turn || 0) || (prev.version || 0) > (next.version || 0) + 5) this.emit('older', { committee, local: prev, server: next });
  }
  checkLocalBackup(committee, server) {
    const b = this.localBackup(committee);
    if (!b?.state) return;
    const local = b.state;
    if ((local.meta?.turn || 0) > (server.meta?.turn || 0) && local.meta?.createdAt !== server.meta?.createdAt) this.emit('older', { committee, local, server, at: b.at });
  }
}

// ---------- Toasts ----------
let toastFn = null;
export function toast(text, tone = '') { toastFn?.(text, tone); }
export function Toasts() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    toastFn = (text, tone) => {
      const id = Math.random();
      setItems(list => [...list.slice(-3), { id, text, tone }]);
      setTimeout(() => setItems(list => list.filter(x => x.id !== id)), tone === 'error' ? 5200 : 3200);
    };
    return () => { toastFn = null; };
  }, []);
  return html`<div class="toasts">${items.map(t => html`<div class=${`toast ${t.tone}`} key=${t.id}>${t.text}</div>`)}</div>`;
}

// Runs an action and shows the error, if any, as a toast.
export async function run(conn, action, okText) {
  const r = await conn.act(action);
  if (!r.ok) toast(r.error || 'That did not work.', 'error');
  else if (okText) toast(typeof okText === 'function' ? okText(r.result) : okText, 'good');
  return r;
}

// ---------- Formatting ----------
export const fmt = {
  money: v => (Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(2)}T` : `$${Math.round(v)}B`),
  pct: v => `${Math.round(v * 100)}%`,
  int: v => Math.round(v).toLocaleString('en-US'),
  refugees: m => (m >= 1 ? `${m.toFixed(1)}M` : m > 0 ? `${Math.round(m * 1000)}K` : '0'),
  big: v => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : `${Math.round(v)}`),
  clock: sec => { sec = Math.max(0, Math.ceil(sec)); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`; },
  date: (iso, lang = 'en') => new Date(iso + 'T00:00:00Z').toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }),
  ago: (t, now = Date.now()) => { const s = Math.round((now - t) / 1000); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`; },
  time: t => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
};

// Ticks every `ms` so countdowns re-render.
export function useNow(conn, ms = 250) {
  const [now, setNow] = useState(() => conn.now());
  useEffect(() => { const i = setInterval(() => setNow(conn.now()), ms); return () => clearInterval(i); }, [conn, ms]);
  return now;
}

export function useConnState(conn, committee) {
  const [state, setState] = useState(() => conn.states[committee] || null);
  useEffect(() => {
    setState(conn.states[committee] || null);
    return conn.on('state', e => { if (e.committee === committee) setState(e.state); });
  }, [conn, committee]);
  return state;
}

export function useEvent(conn, type, fn, deps = []) {
  useEffect(() => conn.on(type, fn), [conn, ...deps]);
}

export function timerRemaining(t, now) {
  if (!t) return 0;
  return t.running ? Math.max(0, (t.endsAt - now) / 1000) : t.remaining || 0;
}

export function download(name, data) {
  const blob = new Blob([typeof data === 'string' ? data : JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export const cls = (...xs) => xs.filter(Boolean).join(' ');
