// Direct messages between each committee's Zeus team and Kronos. The Zeus side appears under the committee's name.
import { html, useState, useEffect, useRef, fmt, cls, toast } from '../lib.js';
import { sfx } from '../fx/audio.js';

export function useUnread(conn, committee, open, kronos) {
  const key = `we-dm-seen-${committee}`;
  const [seen, setSeen] = useState(() => Number(localStorage.getItem(key) || 0));
  const [list, setList] = useState(conn.dms[committee] || []);
  useEffect(() => conn.on('dms', m => { if (m.committee === committee) setList([...m.list]); }), [conn, committee]);
  useEffect(() => conn.on('dm', m => {
    if (m.committee !== committee) return;
    const mine = kronos ? m.msg.fromKronos : !m.msg.fromKronos;
    if (!mine) { sfx.dm(); if (!open) toast(`${m.msg.from}: ${m.msg.text.slice(0, 80)}`, kronos ? '' : 'kronos'); }
  }), [conn, committee, open, kronos]);
  useEffect(() => { if (open) { const t = Date.now() + conn.offset; setSeen(t); try { localStorage.setItem(key, String(t)); } catch { /* ignore */ } } }, [open, list.length]);
  return list.filter(m => (kronos ? !m.fromKronos : m.fromKronos) && m.at > seen).length;
}

export function DMThread({ conn, committee, kronos, name, compact }) {
  const [list, setList] = useState(conn.dms[committee] || []);
  const [text, setText] = useState('');
  const [urgent, setUrgent] = useState(false);
  const end = useRef();
  useEffect(() => { setList(conn.dms[committee] || []); return conn.on('dms', m => { if (m.committee === committee) setList([...m.list]); }); }, [conn, committee]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [list.length]);
  useEffect(() => { if (kronos) conn.request({ t: 'dmRead', committee }); }, [list.length, committee]);
  const send = async e => {
    e?.preventDefault();
    if (!text.trim()) return;
    const r = await conn.request({ t: 'dm', committee, text, urgent });
    if (!r.ok) toast(r.error, 'error'); else { setText(''); setUrgent(false); }
  };
  return html`<div class=${cls('dm-thread', compact && 'compact')}>
    <div class="dm-list">
      ${list.length === 0 && html`<div class="empty">${kronos ? `No messages from ${name} yet.` : 'Message Kronos: ask for an intervention, report a problem, or request a ruling.'}</div>`}
      ${list.map(m => html`<div class=${cls('dm', m.fromKronos ? 'k' : 'z', m.urgent && 'urgent')} key=${m.id}>
        <div class="dm-meta"><b>${m.from}</b>${!m.fromKronos && m.role ? html` <span class="dim">${m.role === 'stage' ? 'Stage' : 'Back room'}</span>` : ''}<span class="dim"> · ${fmt.time(m.at)}</span>${m.urgent ? html` <span class="chip red">urgent</span>` : ''}</div>
        <div class="dm-text">${m.text}</div>
      </div>`)}
      <div ref=${end}></div>
    </div>
    <form class="dm-compose" onSubmit=${send}>
      <textarea class="input" rows="2" placeholder=${kronos ? `Message ${name}…` : 'Message Kronos…'} value=${text} onInput=${e => setText(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}></textarea>
      <div class="row"><label class="row small dim"><input type="checkbox" checked=${urgent} onChange=${e => setUrgent(e.target.checked)} /> Urgent</label><div class="grow"></div><button class="btn sm primary" disabled=${!text.trim()}>Send</button></div>
    </form>
  </div>`;
}

export function DMDrawer({ conn, committee, open, onClose, kronos, name }) {
  return html`<div class=${cls('drawer', open && 'open')}>
    <div class="drawer-h"><h3>${kronos ? `Chat with ${name}` : 'Direct line to Kronos'}</h3><div class="grow"></div><button class="btn xs ghost" onClick=${onClose}>✕</button></div>
    ${open && html`<${DMThread} conn=${conn} committee=${committee} kronos=${kronos} name=${name} />`}
  </div>`;
}
