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
        <div class="os-ground">${obj.grounds}</div>
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

// The scales: an engraved brass balance, drawn flat. The beam tips with the case and the pans stay level as it
// does, hanging from their chains.
function Scales({ value, lang }) {
  const tilt = Math.max(-14, Math.min(14, value * 2.4)); // positive = prosecution heavier (right pan drops)
  const ease = 'transform 1.6s cubic-bezier(.34,1.3,.5,1)';
  const pan = (cx, band) => html`<g style=${`transform: rotate(${-tilt}deg); transform-origin: ${cx}px 31px; transition: ${ease}`}>
    <path d=${`M${cx} 31 L${cx - 29} 90 M${cx} 31 L${cx} 90 M${cx} 31 L${cx + 29} 90`} class="sc-chain" />
    <path d=${`M${cx - 33} 90 Q${cx} 112 ${cx + 33} 90 Z`} class="sc-pan" />
    <path d=${`M${cx - 33} 90 L${cx + 33} 90`} class="sc-rim" style=${`stroke:${band}`} />
  </g>`;
  return html`<div class="scales">
    <svg viewBox="0 0 240 150" aria-hidden="true">
      <path d="M96 140 L104 126 L136 126 L144 140 Z" class="sc-base" /><rect x="88" y="140" width="64" height="6" rx="1" class="sc-base" />
      <rect x="117" y="30" width="6" height="96" class="sc-col" /><rect x="112" y="118" width="16" height="9" class="sc-base" />
      <g style=${`transform: rotate(${tilt}deg); transform-origin: 120px 31px; transition: ${ease}`}>
        <path d="M34 31 Q120 22 206 31 Q120 38 34 31 Z" class="sc-beam" />
        <circle cx="34" cy="31" r="3.6" class="sc-beam" /><circle cx="206" cy="31" r="3.6" class="sc-beam" />
        ${pan(34, '#5b8def')}${pan(206, '#d9534f')}
      </g>
      <circle cx="120" cy="31" r="6.5" class="sc-pivot" /><circle cx="120" cy="20" r="3.4" class="sc-pivot" />
    </svg>
    <div class="scales-l"><span style="color:#8cb8ff">${t('defence', lang)}</span><span style="color:#ff9a96">${t('prosecution', lang)}</span></div>
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
