// Courtroom display: phases, speaker spotlight with ring timer, queue, evidence, scales, objections and the verdict.
import { html, useState, useEffect, useRef, useNow, timerRemaining, fmt, cls } from '../lib.js';
import { sfx } from '../fx/audio.js';
import { t, tt } from './i18n.js';

const SIDE_COLOR = { prosecution: '#e5484d', defence: '#3d8bfd', bench: '#ffb224', witness: '#9b7bff', jury: '#3ddc97', gallery: '#8a96aa' };
const initials = s => (s || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

export function CourtDisplay({ conn, state, lang }) {
  const c = state.court;
  const now = useNow(conn, 100);
  const speaker = c.seats.find(s => s.id === c.speaker);
  const sp = c.speakTimer, rem = timerRemaining(sp, now);
  useCourtSounds(c, now, rem);
  if (state.display.scene === 'blank') return html`<div class="standby"><div class="sb-name">${c.caseTitle}</div><div class="sb-sub">${c.caseSubtitle}</div></div>`;
  const obj = c.objection;
  const objFresh = obj && !obj.ruling;
  const ruled = !!obj?.ruling && now - obj.ruledAt < 4500;
  const shown = c.shownExhibit && c.exhibits.find(e => e.id === c.shownExhibit.id);
  const verdictShown = !!c.verdict.revealedAt;
  const gavel = !!c.gavelAt && now - c.gavelAt < 2200;
  return html`
    <div class=${cls('court', objFresh && 'shake')}>
      <div class="court-bg"></div>
      <header class="ct-head">
        <div class="ct-case">
          <div class="ct-title">${c.caseTitle}</div>
          <div class="ct-sub">${c.caseSubtitle}</div>
        </div>
        <${Scales} value=${c.scales} lang=${lang} />
      </header>
      <div class="ct-phases">${c.phases.map((p, i) => html`<div class=${cls('ct-phase', i === c.phase && 'on', i < c.phase && 'done')}><span>${i + 1}</span>${p}</div>`)}</div>
      <main class="ct-main">
        <section class="ct-evidence">
          <div class="ct-h">${t('evidence', lang)}</div>
          ${c.exhibits.slice(-6).map(ex => html`<div class=${cls('ct-ex', `ex-${ex.side}`, ex.admitted === false && 'struck')} key=${ex.id}>
            ${ex.image ? html`<img src=${ex.image} alt="" />` : html`<div class="ct-ex-doc">❡</div>`}
            <div><div class="ct-ex-code">${ex.code}</div><div class="ct-ex-t">${ex.title}</div>${ex.admitted != null && html`<div class=${ex.admitted ? 'pos' : 'neg'}>${ex.admitted ? t('admitted', lang) : t('struck', lang)}</div>`}</div>
          </div>`)}
        </section>
        <section class="ct-spot">
          ${speaker ? html`<div class="spot" key=${speaker.id} style=${`--side:${SIDE_COLOR[speaker.side] || '#fff'}`}>
            <div class="spot-light"></div>
            <div class=${cls('spot-ring', sp.running && 'run', rem < 15 && sp.running && 'low')}>
              <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="54" class="sr-bg" /><circle cx="60" cy="60" r="54" class="sr-fg" style=${`stroke-dashoffset:${339.3 * (1 - (sp.duration ? rem / sp.duration : 0))}`} /></svg>
              <div class="spot-init">${initials(speaker.person || speaker.name)}</div>
            </div>
            <div class="spot-k">${t('speaking', lang)}</div>
            <div class="spot-name">${speaker.person || speaker.name}</div>
            ${speaker.person && html`<div class="spot-role">${speaker.name}</div>`}
            <div class="spot-time mono">${fmt.clock(rem)}</div>
          </div>` : html`<div class="spot empty"><div class="spot-name dim">${c.recess ? t('recess', lang) : '—'}</div></div>`}
        </section>
        <section class="ct-queue">
          <div class="ct-h">${t('upNext', lang)}</div>
          ${c.queue.slice(0, 6).map((id, i) => { const s = c.seats.find(x => x.id === id); return s && html`<div class="ct-q" style=${`--side:${SIDE_COLOR[s.side]};--d:${i * 0.05}s`} key=${id}><span class="ct-q-n">${i + 1}</span><span class="ct-q-i">${initials(s.person || s.name)}</span><div><div class="ct-q-name">${s.person || s.name}</div>${s.person && html`<div class="ct-q-role">${s.name}</div>`}</div></div>`; })}
        </section>
      </main>
      <footer class="ct-bench">${c.seats.map(s => html`<div class=${cls('ct-seat', c.speaker === s.id && 'on', c.queue.includes(s.id) && 'queued')} style=${`--side:${SIDE_COLOR[s.side]}`}>${s.person || s.name}</div>`)}</footer>

      ${objFresh && html`<div class="objection-slam" key=${obj.id}>
        <div class="os-burst"></div>
        <div class="os-word">${t('objection', lang)}</div>
        <div class="os-ground">${obj.grounds} · ${(c.seats.find(s => s.id === obj.by) || {}).person || (c.seats.find(s => s.id === obj.by) || {}).name || ''}</div>
      </div>`}
      ${ruled && html`<div class=${cls('ruling-stamp', obj.ruling)} key=${obj.id + obj.ruling}>${t(obj.ruling, lang)}</div>`}
      ${shown && html`<div class="exhibit-show" key=${shown.id}><div class=${cls('es-card', `ex-${shown.side}`)}>
        <div class="es-code">${shown.code}</div><h2>${shown.title}</h2>
        ${shown.image && html`<img src=${shown.image} alt="" />`}
        ${shown.text && html`<p>${shown.text}</p>`}
      </div></div>`}
      ${gavel && html`<div class="gavel-fx" key=${c.gavelAt}><svg viewBox="0 0 120 120" class="gavel-svg"><g class="gavel-head"><rect x="30" y="18" width="56" height="26" rx="6" fill="#8a5a2b" stroke="#ffcf8a" stroke-width="2"/><rect x="54" y="40" width="8" height="58" rx="3" fill="#6b4320" /></g><rect x="20" y="100" width="80" height="10" rx="3" fill="#5a3818" /></svg><div class="gavel-word">${c.gavelText === 'ORDER' ? t('order', lang) : c.gavelText}</div></div>`}
      ${verdictShown && html`<${VerdictReveal} c=${c} lang=${lang} now=${now} />`}
      ${c.recess && html`<div class="recess"><div>${c.recess.label || t('recess', lang)}</div></div>`}
    </div>`;
}

function Scales({ value, lang }) {
  const tilt = value * 2.4; // positive = prosecution heavier (right pan drops)
  return html`<div class="scales">
    <svg viewBox="0 0 200 120">
      <rect x="96" y="20" width="8" height="86" fill="#c9a227" /><rect x="70" y="104" width="60" height="8" rx="3" fill="#c9a227" />
      <g style=${`transform: rotate(${tilt}deg); transform-origin: 100px 24px; transition: transform 1.2s cubic-bezier(.3,1.4,.5,1)`}>
        <rect x="24" y="21" width="152" height="5" rx="2" fill="#e8c55a" />
        <g style=${`transform: rotate(${-tilt}deg); transform-origin: 28px 24px; transition: transform 1.2s cubic-bezier(.3,1.4,.5,1)`}><path d="M28 24 L12 70 M28 24 L44 70" stroke="#e8c55a" stroke-width="1.5" /><path d="M6 70 Q28 86 50 70 Z" fill="#3d8bfd" opacity=".85" /></g>
        <g style=${`transform: rotate(${-tilt}deg); transform-origin: 172px 24px; transition: transform 1.2s cubic-bezier(.3,1.4,.5,1)`}><path d="M172 24 L156 70 M172 24 L188 70" stroke="#e8c55a" stroke-width="1.5" /><path d="M150 70 Q172 86 194 70 Z" fill="#e5484d" opacity=".85" /></g>
      </g>
      <circle cx="100" cy="22" r="6" fill="#ffd877" />
    </svg>
    <div class="scales-l"><span style="color:#8cb8ff">${t('defence', lang)}</span><span style="color:#ff8a8d">${t('prosecution', lang)}</span></div>
  </div>`;
}

function VerdictReveal({ c, lang, now }) {
  const el = (now - c.verdict.revealedAt) / 1000;
  const text = c.verdict.text;
  return html`<div class=${cls('verdict', `v-${c.verdict.tone || 'neutral'}`)}>
    <div class="v-k">${t('verdict', lang)}</div>
    <div class="v-word">${[...text].map((ch, i) => html`<span style=${`animation-delay:${2.2 + i * 0.09}s`}>${ch === ' ' ? ' ' : ch}</span>`)}</div>
    ${el > 3.2 + text.length * 0.09 && c.verdict.detail && html`<p class="v-detail">${c.verdict.detail}</p>`}
  </div>`;
}

function useCourtSounds(c, now, rem) {
  const prev = useRef(c);
  const ticked = useRef(0);
  useEffect(() => {
    const p = prev.current; prev.current = c;
    if (p === c) return;
    if (c.objection && !c.objection.ruling && c.objection.id !== p.objection?.id) sfx.objection();
    if (c.objection?.ruling && !p.objection?.ruling) sfx.stamp(c.objection.ruling === 'sustained');
    if (c.gavelAt && c.gavelAt !== p.gavelAt) sfx.gavel();
    if (c.verdict.revealedAt && c.verdict.revealedAt !== p.verdict.revealedAt) { sfx.heartbeat(); setTimeout(() => sfx.heartbeat(), 900); setTimeout(() => sfx.boom(0.7), 2200); }
    if (c.speaker && c.speaker !== p.speaker) sfx.ping();
    if (c.shownExhibit?.id && c.shownExhibit.id !== p.shownExhibit?.id) sfx.whoosh();
  }, [c]);
  useEffect(() => {
    const s = Math.ceil(rem);
    if (c.speakTimer.running && s <= 10 && s > 0 && s !== ticked.current) { ticked.current = s; sfx.tick(); }
    if (c.speakTimer.running && s === 0 && ticked.current !== 0) { ticked.current = 0; sfx.timerEnd(); }
  }, [Math.ceil(rem)]);
}
