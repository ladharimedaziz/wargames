// The stage for a United Nations style committee: the topic, the speaker, the room, drafts, votes and crisis alerts.
import { html, useState, useEffect, useNow, timerRemaining, fmt, cls } from '../lib.js';
import { GothamMap } from '../council/gotham.js';
import { COUNTRIES } from '/shared/data/countries.js';

// A delegation named after a country shows that country's flag.
const ISO = { ...Object.fromEntries(Object.entries(COUNTRIES).map(([id, c]) => [c.name, id])), 'Türkiye': '792', Tuvalu: '798', Kiribati: '296', Maldives: '462', 'Marshall Islands': '584', Fiji: '242', Vanuatu: '548' };
const Flag = ({ name, cls: c = 'cn-flag' }) => ISO[name] ? html`<img class=${c} src=${`/client/img/flags/${ISO[name]}.webp`} alt="" />` : null;

const initials = s => (s || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

export function CouncilDisplay({ conn, state }) {
  const c = state.council, now = useNow(conn, 200);
  if (state.display.scene === 'blank') return html`<div class="standby cn-standby" style=${`--cn:${c.accent}`}><div class="sb-sub">${c.org}</div><div class="sb-name">${c.title}</div><div class="sb-sub">${c.subtitle}</div></div>`;
  const speaker = c.seats.find(s => s.id === c.speaker);
  const sp = c.speakTimer, rem = timerRemaining(sp, now);
  const v = c.vote, shown = c.shownDraft && c.drafts.find(d => d.id === c.shownDraft.id);
  const alertAge = c.alert ? now - c.alert.at : 1e9;
  const gavel = c.gavelAt && now - c.gavelAt < 1400;
  const voting = v && (v.open || now - v.revealedAt < 20000);
  const roll = c.seats.filter(s => s.kind === 'delegation');
  return html`<div class=${cls('council', c.map && 'with-map', c.alert && alertAge < 9000 && c.alert.level === 'critical' && 'shake')} style=${`--cn:${c.accent}`}>
    <div class="cn-bg"></div>
    <header class="cn-head">
      <div class="cn-org">${c.org}</div>
      <div class="cn-title">${c.title}</div>
      <div class="cn-sub">${c.subtitle}</div>
    </header>
    <main class="cn-main">
      <aside class="cn-side">
        <div class="cn-h">Agenda</div>
        ${c.agenda.map((a, i) => html`<div class=${cls('cn-ag', i === c.agendaIdx && 'on', i < c.agendaIdx && 'done')} key=${i}><span>${i + 1}</span>${a}</div>`)}
        ${c.facts.length > 0 && html`<${Fact} facts=${c.facts} now=${now} />`}
      </aside>
      <section class="cn-center">
        ${c.map === 'gotham' ? html`<${GothamMap} c=${c} big=${true} />` : html`<div class="cn-brief">${c.brief}</div>`}
        <div class=${cls('cn-speaker', !speaker && 'empty', sp.running && 'run', rem < 15 && sp.running && 'low')} key=${speaker?.id || 'none'}>
          ${speaker ? html`<div class="cn-ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="54" class="sr-bg" /><circle cx="60" cy="60" r="54" class="sr-fg" style=${`stroke-dashoffset:${339.3 * (1 - (sp.duration ? rem / sp.duration : 0))}`} /></svg>${ISO[speaker.name] ? html`<img class="cn-ring-flag" src=${`/client/img/flags/${ISO[speaker.name]}.webp`} alt="" />` : html`<div class="cn-init">${initials(speaker.name)}</div>`}</div>
            <div><div class="cn-k">${c.session === 'moderated' ? 'Moderated caucus · speaking' : 'Speaking'}</div><div class="cn-name">${speaker.name}</div>${speaker.person && html`<div class="cn-person">${speaker.person}</div>`}</div>
            <div class="cn-time mono">${fmt.clock(rem)}</div>`
            : html`<div class="cn-k">${c.session === 'unmoderated' ? 'Unmoderated caucus' : c.session === 'crisis' ? 'Crisis update' : 'The floor is open'}</div>`}
        </div>
      </section>
      <aside class="cn-side">
        <div class="cn-h">Speakers list</div>
        ${c.queue.length === 0 && html`<div class="cn-dim">Nobody is waiting.</div>`}
        ${c.queue.slice(0, 7).map((id, i) => { const s = c.seats.find(x => x.id === id); return s && html`<div class="cn-q" style=${`--d:${i * 0.05}s`} key=${id}><span>${i + 1}</span><${Flag} name=${s.name} />${s.name}</div>`; })}
        <div class="cn-h" style="margin-top:18px">In the room · ${roll.filter(s => s.present).length}</div>
        <div class="cn-roll-grid">${roll.map(s => html`<i class=${cls(s.id === c.speaker && 'on', c.queue.includes(s.id) && 'q', !s.present && 'off')} title=${s.name} key=${s.id}>${s.name.length > 14 ? s.name.slice(0, 13) + '…' : s.name}</i>`)}</div>
      </aside>
    </main>
    ${c.alert && alertAge >= 9000 && html`<div class=${cls('cn-strip', `lv-${c.alert.level}`)}><b>${c.alert.level === 'critical' ? 'ALERT' : 'UPDATE'}</b> ${c.alert.title}</div>`}
    ${c.session === 'recess' && html`<div class="cn-recess"><div>Recess</div></div>`}
    ${shown && !voting && html`<${DraftCard} d=${shown} key=${shown.id} />`}
    ${voting && html`<${VoteBoard} c=${c} v=${v} now=${now} />`}
    ${c.alert && alertAge < 9000 && html`<div class=${cls('cn-alert', `lv-${c.alert.level}`)} key=${c.alert.id}>
      <div class="cn-al-k">${c.alert.level === 'critical' ? 'CRITICAL' : c.alert.level === 'info' ? 'INFORMATION' : 'CRISIS UPDATE'}</div>
      <div class="cn-al-t">${c.alert.title}</div>${c.alert.text && html`<p>${c.alert.text}</p>`}</div>`}
    ${gavel && html`<div class="cn-gavel" key=${c.gavelAt}>ORDER</div>`}
  </div>`;
}

// One fact at a time, changing every so often.
function Fact({ facts, now }) {
  const i = Math.floor(now / 14000) % facts.length;
  return html`<div class="cn-fact" key=${i}><div class="cn-h">Did you know</div><p>${facts[i]}</p></div>`;
}

function DraftCard({ d }) {
  return html`<div class="cn-draft-show"><div class="cn-paper">
    <div class="cn-p-k">Draft resolution</div><h2>${d.title}</h2>
    ${d.sponsors.length > 0 && html`<div class="cn-p-sp">Sponsors: ${d.sponsors.join(', ')}</div>`}
    <ol>${d.clauses.map((x, i) => html`<li style=${`animation-delay:${0.25 + i * 0.12}s`}>${x}</li>`)}</ol>
  </div></div>`;
}

function VoteBoard({ c, v, now }) {
  const d = c.drafts.find(x => x.id === v.draftId);
  const list = c.seats.filter(s => s.present && s.kind === 'delegation');
  const t = { yes: 0, no: 0, abstain: 0 }; for (const s of list) if (v.votes[s.id]) t[v.votes[s.id]]++;
  const total = Math.max(1, list.length), done = !v.open, el = (now - v.revealedAt) / 1000;
  return html`<div class="cn-vote-show"><div class="cn-vs-card">
    <div class="cn-p-k">${v.open ? 'Voting in progress' : 'Result'}</div><h2>${d?.title}</h2>
    <div class="cn-bars"><div class="b-yes" style=${`width:${t.yes / total * 100}%`}></div><div class="b-abs" style=${`width:${t.abstain / total * 100}%`}></div><div class="b-no" style=${`width:${t.no / total * 100}%`}></div></div>
    <div class="cn-counts"><span class="y">Yes <b>${t.yes}</b></span><span class="a">Abstain <b>${t.abstain}</b></span><span class="n">No <b>${t.no}</b></span></div>
    <div class="cn-dots">${list.map(s => html`<i class=${cls(v.votes[s.id] || 'none')} title=${s.name} key=${s.id}><em>${s.name.length > 12 ? s.name.slice(0, 11) + '…' : s.name}</em></i>`)}</div>
    ${done && el > 1.2 && html`<div class=${cls('cn-verdict', v.passed ? 'pass' : 'fail')} key=${v.revealedAt}>${v.passed ? 'RESOLUTION PASSED' : 'RESOLUTION FAILED'}</div>`}
  </div></div>`;
}
