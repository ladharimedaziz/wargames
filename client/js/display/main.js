// The stage display: what the room sees on the projector or stream. View-only; the Stage Zeus drives it.
import { CouncilDisplay } from './council.js';
import { UsaDisplay } from './usa.js';
import { html, render, useState, useEffect, useRef, useMemo, Connection, useConnState, useNow, timerRemaining, fmt, cls } from '../lib.js';
import { WorldMap } from '../map/renderer.js';
import { KronosEye } from '../fx/eye.js';
import { setAudio, sfx, unlockAudio, audioReady } from '../fx/audio.js';
import { tensionLevel, ENDINGS, UNIT_TYPES } from '/shared/engine/core.js';
import { SEA_ZONES } from '/shared/data/places.js';
import { t, tt } from './i18n.js';
import { Globe } from '../views/login.js';
import { CourtDisplay } from './court.js';
import { Unthinkable } from './unthinkable.js';
import { EndingFilm, hasEndingFilm } from './endings-fx.js';
import { stateSplit } from '/shared/data/german-split.js';
import { ColdWarIntro, COLD_INTRO_MS, isColdIntro } from './cold-intro.js';
import { endingsFor } from '/shared/engine/cold-endings.js';

const committee = new URLSearchParams(location.search).get('c');

function Bi({ k, lang, cls: c = '' }) {
  const [a, b] = tt(k, lang);
  return html`<span class=${c}>${a}${b && html`<span class="bi-ar">${b}</span>`}</span>`;
}
const isAr = lang => lang === 'ar';
const nameOf = (c, lang) => (isAr(lang) ? c.ar : c.name);
const textOf = (item, lang) => (isAr(lang) ? item.ar || item.en : item.en);

function Display() {
  const [me, setMe] = useState(undefined);
  const [conn, setConn] = useState(null);
  useEffect(() => { fetch('/api/me').then(r => r.json()).then(j => setMe(j.user)).catch(() => setMe(null)); }, []);
  useEffect(() => {
    if (!me || !committee) return;
    const c = new Connection({ view: 'display' });
    c.on('status', s => { if (s === 'live') c.join(committee); });
    setConn(c);
  }, [me]);
  if (me === undefined) return null;
  if (!committee) return html`<div class="d-msg">Open this page from a Zeus panel (Stage display button).</div>`;
  if (!me) return html`<div class="d-msg">Sign in first. <a href="/">Go to sign-in</a></div>`;
  if (!conn) return null;
  return html`<${Stage} conn=${conn} />`;
}

function Stage({ conn }) {
  const state = useConnState(conn, committee);
  const [global, setGlobal] = useState(conn.global);
  useEffect(() => conn.on('global', g => setGlobal({ ...g })), [conn]);
  useEffect(() => conn.on('hello:raw', m => setGlobal({ ...(m.global || {}) })), [conn]);
  const [soundOn, setSoundOn] = useState(false);
  useEffect(() => {
    if (!state) return;
    setAudio({ sfx: state.settings.sfx, vol: state.settings.volume ?? 0.7 });
  }, [state?.settings.sfx, state?.settings.volume]);
  const enableSound = () => { unlockAudio(); setSoundOn(true); };
  useEffect(() => { document.title = state ? `${state.name} · Stage` : 'Stage'; }, [state?.name]);
  // Fullscreen on double-click for projectors.
  useEffect(() => { const f = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()); window.addEventListener('dblclick', f); return () => window.removeEventListener('dblclick', f); }, []);
  if (!state) return html`<div class="d-standby"><div class="boot-ring"></div></div>`;
  const lang = 'en'; // the stage is English only
  const bannerShown = state.display.banner && !['disguise', 'ending', 'intro', 'reveal'].includes(state.display.scene);
  const timerShown = state.timer.visible !== false && (state.timer.running || state.timer.remaining > 0) && !['disguise', 'ending', 'intro', 'reveal'].includes(state.display.scene);
  return html`
    <div class=${cls('stage', `lang-${lang}`, state.settings.year && 'era-cold', bannerShown && 'has-banner', timerShown && 'has-timer', state.kronos.eye && 'has-eye')} dir=${isAr(lang) ? 'rtl' : 'ltr'} onClick=${!soundOn ? enableSound : undefined}>
      ${state.mode === 'court' ? html`<${CourtDisplay} conn=${conn} state=${state} lang=${lang} />` : state.mode === 'usa' ? html`<${UsaDisplay} state=${state} />` : state.mode === 'council' ? html`<${CouncilDisplay} conn=${conn} state=${state} />` : html`<${WorldStage} conn=${conn} state=${state} lang=${lang} />`}
      ${bannerShown && html`<${Banner} b=${state.display.banner} lang=${lang} />`}
      ${timerShown && html`<${StageTimer} conn=${conn} timer=${state.timer} />`}
      ${(global.pause || state.display.scene === 'pause') && html`<${PauseScreen} p=${global.pause} lang=${lang} />`}
      <${KronosEye} on=${state.kronos.eye} big=${true} />
      ${!soundOn && html`<div class="sound-pill">Click once to hide this · double-click for full screen · click a country or scroll to zoom, Esc to zoom out</div>`}
    </div>`;
}

// ---------------- World ----------------
function WorldStage({ conn, state, lang }) {
  const scene = state.display.scene;
  const now = useNow(conn, 200);
  const introDone = now - state.display.introAt > (isColdIntro(state) ? COLD_INTRO_MS : 15500);
  const revealDone = now - state.display.revealAt > 10500;
  // A nuclear exchange keeps the map up until every country has fired, then the ending cuts in.
  const endingHeld = scene === 'ending' && now < state.display.endingAt;
  const effective = scene === 'intro' && introDone ? 'map' : scene === 'reveal' && revealDone ? 'map' : endingHeld ? 'map' : scene;
  const mapVisible = ['map', 'web', 'polls', 'vote', 'treaty', 'intro', 'reveal', 'report'].includes(effective);
  return html`
    <div class=${cls('map-layer', mapVisible ? 'show' : 'hide', ['polls', 'vote', 'treaty', 'report'].includes(effective) && 'blur')}>
      <${StageMap} state=${state} lang=${lang} relations=${effective === 'web'} />
    </div>
    ${['map', 'web'].includes(effective) && html`<${Hud} conn=${conn} state=${state} lang=${lang} web=${effective === 'web'} />`}
    ${effective === 'disguise' && html`<${Disguise} state=${state} now=${now} />`}
    ${effective === 'reveal' && html`<${Reveal} state=${state} lang=${lang} elapsed=${now - state.display.revealAt} />`}
    ${effective === 'intro' && (isColdIntro(state) ? html`<${ColdWarIntro} state=${state} elapsed=${now - state.display.introAt} />` : html`<${Intro} state=${state} lang=${lang} elapsed=${now - state.display.introAt} />`)}
    ${effective === 'polls' && html`<${Polls} state=${state} lang=${lang} />`}
    ${effective === 'vote' && html`<${VoteBoard} state=${state} lang=${lang} />`}
    ${effective === 'treaty' && html`<${TreatyCard} state=${state} lang=${lang} />`}
    ${effective === 'report' && html`<${Report} state=${state} lang=${lang} />`}
    ${effective === 'ending' && html`<${Ending} state=${state} lang=${lang} now=${now} />`}
    ${effective === 'blank' && html`<${Standby} state=${state} lang=${lang} now=${now} />`}
    <${Sounds} state=${state} />`;
}

function StageMap({ state, lang, relations }) {
  const ref = useRef(), map = useRef();
  const stRef = useRef(state); stRef.current = state;
  useEffect(() => {
    const m = new WorldMap(ref.current, { split: stateSplit(stRef.current), cinematic: true, stageControl: true, lang, onNukeLaunch: () => sfx.alarm(), onNukeImpact: () => sfx.boom(2) });
    map.current = m; window.__map = m;
    m.ready.then(() => m.setState(stRef.current, { layers: { ...stRef.current.settings.layers, wars: true } }));
    return () => m.destroy();
  }, []);
  useEffect(() => { map.current?.setState(state); }, [state]);
  useEffect(() => { map.current?.setLayers({ ...state.settings.layers, relations: relations || state.settings.layers.relations }); }, [state.settings.layers, relations]);
  useEffect(() => { map.current?.setLang(lang); }, [lang]);
  return html`<div class="stage-map" ref=${ref}></div>`;
}

// Plays sounds for things that happen on stage.
function Sounds({ state }) {
  const prev = useRef(state);
  useEffect(() => {
    const p = prev.current; prev.current = state;
    if (!p || p === state) return;
    const res = state.lastResolution;
    if (res && res.at !== p.lastResolution?.at) {
      sfx.whoosh();
      const strikes = res.events.filter(e => e.kind === 'strike');
      strikes.slice(0, 10).forEach((e, i) => setTimeout(() => (e.intercepted ? sfx.tick() : sfx.impact()), 1600 + i * 180));
      if (res.events.some(e => e.kind === 'chokepoint' && e.status === 'closed')) setTimeout(() => sfx.alarm(), 2500);
      for (const e of res.events) {
        if (e.kind === 'act') ({ earthquake: () => sfx.boom(1.5), flood: () => sfx.whoosh(), pandemic: () => sfx.heartbeat(), blackout: () => sfx.glitch(), coup: () => sfx.alarm(), discovery: () => sfx.chime(), storm: () => sfx.boom(0.6) })[e.act]?.();
        if (e.kind === 'spawn') sfx.ping();
        if (e.kind === 'strike' && e.divine) setTimeout(() => sfx.boom(1.2), 1100);
        if (e.kind === 'peace') sfx.chime();
        if (e.kind === 'strike' && e.payload === 'moab') setTimeout(() => sfx.boom(1.8), 3200);
        if (e.kind === 'airdrop') setTimeout(() => sfx.whoosh(), 1500);
        if (['cyber', 'spy', 'satellite'].includes(e.kind)) sfx.glitch();
        if (['ceasefire', 'alliance', 'trade', 'aid', 'unsanction', 'lift'].includes(e.kind)) sfx.chime();
        if (e.kind === 'alert') sfx.alarm();
      }
    }
    const newAired = state.aired.filter(a => !p.aired.some(x => x.id === a.id));
    if (newAired.some(a => a.priority >= 6)) sfx.breaking(); else if (newAired.length) sfx.news();
    if (state.display.scene !== p.display.scene) {
      if (state.display.scene === 'reveal') sfx.reveal();
      if (state.display.scene === 'intro') sfx.whoosh();
      if (state.display.scene === 'ending') state.display.ending?.type === 'nuclear' ? sfx.heartbeat() : sfx.chime();
    }
    if (state.display.banner && state.display.banner.at !== p.display.banner?.at) state.display.banner.tone === 'alert' ? sfx.alarm() : sfx.ping();
    if (Math.floor(state.global.tension) > Math.floor(p.global.tension) && state.global.tension >= 7) sfx.heartbeat();
  }, [state]);
  return null;
}

function Hud({ conn, state, lang, web }) {
  const g = state.global;
  const lvl = tensionLevel(g.tension);
  const [, force] = useState(0);
  useEffect(() => { const i = setInterval(() => force(x => x + 1), 1000); return () => clearInterval(i); }, []);
  const m = window.__map;
  const flights = m?.air?.flights.length || 0, ships = m?.sea?.ships.filter(s => !s.stuck).length || 0, stuck = m?.sea?.waiting || 0;
  const res = state.lastResolution;
  const showTurnCard = res && conn.now() - res.at < 3200 && !res.instant;
  const lvlKey = lvl.name.toLowerCase();
  return html`
    <div class="hud">
      <div class="hud-tl">
        <div class="hud-live"><i></i><${Bi} k="live" lang=${lang} /></div>
        <div class="hud-title">${state.name}</div>
        <div class="hud-date">${fmt.date(state.meta.clock, isAr(lang) ? 'ar' : 'en')} · <${Bi} k="week" lang=${lang} /> ${state.meta.turn}</div>
      </div>
      <div class="hud-tr">
        <div class=${`tension-meter lvl-${Math.min(4, Math.floor(g.tension / 2.01))}`}>
          <div class="tm-head"><${Bi} k="tension" lang=${lang} /><b>${g.tension}</b></div>
          <div class="tm-bar">${Array.from({ length: 10 }, (_, i) => html`<i class=${cls(i < g.tension && 'on', i < g.tension && i + 1 > g.tension && 'half')} style=${`--i:${i}`}></i>`)}</div>
          <div class="tm-level"><${Bi} k=${lvlKey} lang=${lang} /></div>
        </div>
        <div class="hud-stats">
          <div><span><${Bi} k="oil" lang=${lang} /></span><b class=${g.oilPrice > 110 ? 'neg' : ''}>$${Math.round(g.oilPrice)}</b></div>
          <div><span><${Bi} k="economy" lang=${lang} /></span><b class=${g.gdpIndex < 0.97 ? 'neg' : ''}>${Math.round(g.gdpIndex * 100)}%</b></div>
          <div><span><${Bi} k="wars" lang=${lang} /></span><b class=${state.wars.length ? 'neg' : ''}>${state.wars.length}</b></div>
        </div>
      </div>
      <div class="hud-bl">
        <div><span>✈</span><b class="mono">${flights}</b> <${Bi} k="flights" lang=${lang} /></div>
        <div><span>⛴</span><b class="mono">${ships}</b> <${Bi} k="ships" lang=${lang} /></div>
        ${stuck > 0 && html`<div class="neg"><span>⚓</span><b class="mono">${stuck}</b> <${Bi} k="stranded" lang=${lang} /></div>`}
        ${web && html`<div class="web-legend"><i class="pos-l"></i><${Bi} k="allies" lang=${lang} /> <i class="neg-l"></i><${Bi} k="rivals" lang=${lang} /></div>`}
      </div>
      <${Ticker} state=${state} lang=${lang} />
      <${BreakingLower} conn=${conn} state=${state} lang=${lang} />
      ${showTurnCard && html`<div class="turn-card"><div class="tc-k"><${Bi} k="week" lang=${lang} /> ${state.meta.turn}</div><div class="tc-d">${fmt.date(state.meta.clock, isAr(lang) ? 'ar' : 'en')}</div></div>`}
    </div>`;
}

function Ticker({ state, lang }) {
  const items = state.aired.slice(-14).reverse();
  if (!items.length) return null;
  const line = items.map(i => textOf(i, lang)).join('   ◆   ');
  const dur = Math.max(30, line.length * 0.22);
  return html`<div class="ticker">
    <div class="ticker-tag">${t('breaking', lang)}</div>
    <div class="ticker-track"><div class="ticker-move" key=${items[0].id} style=${`animation-duration:${dur}s`}><span>${line}</span><span>${line}</span></div></div>
  </div>`;
}

// A big lower-third for important headlines as they air.
function BreakingLower({ conn, state, lang }) {
  const last = state.aired[state.aired.length - 1];
  const fresh = last && last.priority >= 5 && conn.now() - (last.airedAt || 0) < 9000;
  if (!fresh) return null;
  return html`<div class="lower-third" key=${last.id}>
    <div class="lt-tag">${t('breaking', lang)}</div>
    <div class="lt-text">${textOf(last, lang)}${lang === 'both' && last.ar && html`<div class="bi-ar">${last.ar}</div>`}</div>
  </div>`;
}

function Banner({ b, lang }) {
  return html`<div class=${cls('stage-banner', `tone-${b.tone}`, b.kronos && 'kronos')} key=${b.at}>
    ${b.kronos && html`<span class="sb-k">KRONOS</span>`}
    <span>${isAr(lang) && b.ar ? b.ar : b.text}</span>${lang === 'both' && b.ar && html`<span class="bi-ar">${b.ar}</span>`}
  </div>`;
}

function StageTimer({ conn, timer }) {
  const now = useNow(conn, 200);
  const rem = timerRemaining(timer, now);
  const done = useRef(false);
  useEffect(() => { if (timer.running && rem <= 0 && !done.current) { done.current = true; sfx.timerEnd(); } if (rem > 0) done.current = false; }, [rem <= 0]);
  const pct = timer.duration ? rem / timer.duration : 0;
  return html`<div class=${cls('stage-timer', timer.running && 'run', rem <= 30 && timer.running && 'low', rem <= 0 && 'zero')}>
    <svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" class="st-bg" /><circle cx="22" cy="22" r="19" class="st-fg" style=${`stroke-dashoffset:${119.4 * (1 - pct)}`} /></svg>
    <div><div class="st-label">${timer.label || ''}</div><div class="st-time mono">${fmt.clock(rem)}</div></div>
  </div>`;
}

// ---------- Disguise: deliberately dull ----------
function Disguise({ state, now }) {
  const d = state.display.disguise;
  return html`<div class="disguise">
    <div class="dz-waves"><i></i><i></i><i></i></div>
    <div class="dz-card">
      <div class="dz-logo"><svg viewBox="0 0 64 64" width="64" height="64"><circle cx="32" cy="32" r="30" fill="#e8f3f8" /><path d="M14 34c6-8 16-10 24-6 4 2 8 2 12-1-2 6-7 10-14 10-7 0-11-2-16-1-3 1-5 0-6-2z" fill="#2c7da0" /><circle cx="44" cy="30" r="1.6" fill="#fff" /><path d="M10 44c8 3 14 3 22 0s14-3 22 0" stroke="#61a5c2" stroke-width="2.5" fill="none" /></svg></div>
      <div class="dz-org">UNITED NATIONS · FOOD AND AGRICULTURE</div>
      <h1>${d.title}</h1>
      <h2>${d.subtitle}</h2>
      <div class="dz-agenda">
        <div class="dz-ah">Agenda</div>
        ${d.agenda.map((a, i) => html`<div class="dz-item"><span>${String(9 + i).padStart(2, '0')}:${i % 2 ? '30' : '00'}</span>${a}</div>`)}
      </div>
      <div class="dz-foot">Session ${state.meta.turn} · ${new Date(now).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · Riyadh</div>
    </div>
  </div>`;
}

// ---------- The reveal ----------
function Reveal({ state, lang, elapsed }) {
  const e = elapsed / 1000;
  const d = state.display.disguise;
  const phase = e < 2.4 ? 'glitch' : e < 3.4 ? 'black' : e < 6.4 ? 'drill' : e < 9.6 ? 'title' : 'out';
  return html`<div class=${cls('reveal', `rv-${phase}`)}>
    ${phase === 'glitch' && html`<div class="rv-glitch"><div class="disguise ghost"><div class="dz-card"><h1>${d.title}</h1><h2>${d.subtitle}</h2></div></div>
      <div class="rv-bars">${Array.from({ length: 14 }, (_, i) => html`<i style=${`top:${(i * 37) % 100}%;animation-delay:${(i % 5) * 0.11}s`}></i>`)}</div></div>`}
    ${phase === 'drill' && html`<div class="rv-drill"><span class="typing" style=${`--n:${t('notDrill', lang).length}`}>${t('notDrill', lang)}</span></div>`}
    ${(phase === 'title' || phase === 'out') && html`<div class="rv-title">
      <div class="rv-sub">${fmt.date(state.meta.clock, isAr(lang) ? 'ar' : 'en')}</div>
      <h1>${t('ww3', lang)}</h1>
      ${lang === 'both' && html`<div class="rv-ar">${tt('ww3', 'both')[1]}</div>`}
      <div class="rv-line"></div>
    </div>`}
    <div class="rv-scan"></div>
  </div>`;
}

// ---------- Cinematic intro ----------
function Intro({ state, lang, elapsed }) {
  const e = elapsed / 1000;
  const players = Object.values(state.countries).filter(c => c.control === 'player');
  const active = Object.values(state.countries).filter(c => c.control !== 'inactive').length;
  const lines = [
    [1.5, fmt.date(state.meta.clock, isAr(lang) ? 'ar' : 'en')],
    [3.6, `${active} ${t('nations', lang)} · ${players.length} ${t('delegates', lang)}`],
    [5.6, `${t('tension', lang)}: ${state.global.tension}/10`],
  ];
  return html`<div class=${cls('intro', e > 12.5 && 'fade')}>
    <div class="intro-stars"></div>
    <div class=${cls('intro-globe', e > 9.5 && 'zoom')}><${Globe} className="intro-globe-c" speed=${Math.max(4, 40 - e * 5)} tilt=${-20} glow="#ece6d6" /></div>
    <div class="intro-text">
      ${lines.map(([at, txt], i) => e > at && html`<div class="intro-line" key=${i}>${txt}</div>`)}
      ${e > 7.4 && html`<h1 class="intro-title">${state.name}</h1>`}
      ${e > 8.6 && html`<div class="intro-stakes">${t('stakes', lang)}</div>`}
    </div>
    <div class="intro-bars"></div>
  </div>`;
}

// ---------- Polls ----------
function Polls({ state, lang }) {
  let list = Object.values(state.countries).filter(c => c.control === 'player');
  if (!list.length) list = Object.values(state.countries).filter(c => c.major && c.control !== 'inactive').sort((a, b) => b.base.gdp - a.base.gdp).slice(0, 10);
  list = list.sort((a, b) => b.support - a.support);
  return html`<div class="panel-scene">
    <div class="ps-head"><${Bi} k="polls" lang=${lang} cls="ps-title" /></div>
    <div class="poll-legend"><span></span><span><${Bi} k="support" lang=${lang} /></span><span><${Bi} k="gdp" lang=${lang} /></span></div>
    <div class="polls">
      ${list.map((c, i) => {
        const g = c.gdp / c.base.gdp;
        return html`<div class="poll-row" style=${`--d:${i * 0.08}s`} key=${c.id}>
          <div class="poll-name"><i style=${`background:${state.blocs[c.bloc].color}`}></i>${nameOf(c, lang)}</div>
          <div class="poll-bar"><i style=${`width:${c.support}%;background:${c.support < 30 ? 'var(--red)' : c.support < 50 ? 'var(--gold)' : 'var(--green)'}`}></i><span>${Math.round(c.support)}%</span></div>
          <div class=${cls('poll-gdp', g < 0.98 ? 'neg' : g > 1.02 ? 'pos' : '')}>${g < 0.98 ? '▼' : g > 1.02 ? '▲' : '•'} ${Math.abs(Math.round((g - 1) * 100))}%</div>
        </div>`;
      })}
    </div>
  </div>`;
}

// ---------- UN vote ----------
function VoteBoard({ state, lang }) {
  const v = [...state.unVotes].reverse().find(x => x.open) || state.unVotes[state.unVotes.length - 1];
  if (!v) return html`<div class="panel-scene"><div class="ps-head"><${Bi} k="vote" lang=${lang} cls="ps-title" /></div></div>`;
  const ids = Object.keys(v.votes).sort((a, b) => state.countries[a].name.localeCompare(state.countries[b].name));
  const tally = { yes: 0, no: 0, abstain: 0 };
  for (const id of ids) tally[v.votes[id]]++;
  const total = ids.length || 1;
  const res = v.result;
  return html`<div class="panel-scene vote-scene">
    <div class="ps-head"><div class="un-emblem">◎</div><div><div class="ps-kicker">${v.body === 'council' ? 'Security Council' : 'General Assembly'}</div><div class="ps-title">${isAr(lang) && v.ar ? v.ar : v.title}</div></div></div>
    <div class="vote-tally">
      <div class="vt yes" style=${`flex:${tally.yes || 0.01}`}><b>${tally.yes}</b><${Bi} k="yes" lang=${lang} /></div>
      <div class="vt abs" style=${`flex:${tally.abstain || 0.01}`}><b>${tally.abstain}</b><${Bi} k="abstain" lang=${lang} /></div>
      <div class="vt no" style=${`flex:${tally.no || 0.01}`}><b>${tally.no}</b><${Bi} k="no" lang=${lang} /></div>
    </div>
    <div class="vote-grid">${ids.map((id, i) => html`<div class=${cls('vtile', v.votes[id])} style=${`--d:${(i % 30) * 0.02}s`} key=${id}><span>${nameOf(state.countries[id], lang)}</span>${v.body === 'council' && state.countries[id].veto ? html`<em>P5</em>` : ''}</div>`)}</div>
    ${res && html`<div class=${cls('vote-stamp', res.passed ? 'pass' : 'fail')}>${res.passed ? t('passed', lang) : res.vetoes.length ? t('vetoed', lang) : t('failed', lang)}</div>`}
  </div>`;
}

// ---------- Treaty ----------
function TreatyCard({ state, lang }) {
  const tr = state.draftTreaty || (state.treatiesSigned || [])[state.treatiesSigned?.length - 1];
  if (!tr) return html`<div class="panel-scene"><div class="ps-head"><${Bi} k="treaty" lang=${lang} cls="ps-title" /></div></div>`;
  const terms = tr.terms || {};
  const clauses = [
    ...(tr.kind === 'peace' && terms.returnTerritory !== false ? ['All occupied territory shall be returned.'] : []),
    ...(terms.demilitarize ? ['All forces shall withdraw from the territory of the other parties.'] : []),
    ...(terms.reparations > 0 && terms.payer ? [`${state.countries[terms.payer]?.name} shall pay reparations of $${terms.reparations} billion to ${state.countries[terms.payee]?.name}.`] : []),
    ...(terms.liftSanctions ? ['Sanctions between the parties shall be lifted.'] : []),
    ...(terms.liftBlockades ? ['All blockades shall end.'] : []),
    ...(terms.reopenAirspace ? ['Airspace shall be reopened.'] : []),
    ...(terms.tradeResume ? ['Trade shall resume.'] : []),
    ...(terms.prisoners ? ['Prisoners shall be exchanged.'] : []),
    ...(terms.nonAggression ? ['The parties shall not attack one another.'] : []),
    ...(terms.reconstruction > 0 && terms.fundBy ? [`${state.countries[terms.fundBy]?.name} shall fund $${terms.reconstruction} billion of reconstruction in ${state.countries[terms.fundTo]?.name}.`] : []),
    ...(terms.clauses || []),
  ];
  return html`<div class="panel-scene treaty-scene">
    <div class="parchment">
      <div class="pc-kicker">${tr.kind === 'peace' ? 'Treaty of Peace' : tr.kind === 'ceasefire' ? 'Ceasefire Agreement' : tr.kind === 'alliance' ? 'Treaty of Alliance' : 'Trade Agreement'}</div>
      <h1>${tr.title}</h1>
      <div class="pc-parties">${tr.parties.map(id => nameOf(state.countries[id], lang)).join(' · ')}</div>
      <ol class="pc-clauses">${clauses.map((c, i) => html`<li style=${`--d:${0.3 + i * 0.15}s`}>${c}</li>`)}</ol>
      <div class="pc-sigs">${tr.parties.map(id => html`<div class=${cls('sig', tr.signed.includes(id) && 'done')}>
        <div class="sig-line">${tr.signed.includes(id) ? html`<span class="sig-ink">${state.countries[id].name}</span>` : ''}</div>
        <div class="sig-name">${nameOf(state.countries[id], lang)}</div>
      </div>`)}</div>
      ${tr.signedAt && html`<div class="pc-seal">${t('inForce', lang)}</div>`}
    </div>
  </div>`;
}

// ---------- Report ----------
function computeAwards(state) {
  const by = {};
  for (const o of state.orders) {
    if (o.status !== 'done') continue;
    const b = (by[o.country] ||= { strikes: 0, peace: 0, covert: 0, aid: 0, war: 0 });
    if (o.type === 'strike' || o.type === 'invade') b.strikes++;
    if (['peace', 'ceasefire', 'alliance', 'trade'].includes(o.type)) b.peace++;
    if (['cyber', 'spy', 'intel', 'satellite', 'propaganda'].includes(o.type)) b.covert++;
    if (o.type === 'aid' || o.type === 'arms') b.aid += o.amount || 5;
    if (o.type === 'war') b.war++;
  }
  const players = Object.values(state.countries).filter(c => c.control === 'player');
  const pool = players.length ? players : Object.values(state.countries).filter(c => c.major && c.control !== 'inactive');
  const top = (f, filter = () => true) => pool.filter(filter).sort((a, b) => f(b) - f(a))[0];
  const out = [];
  const add = (title, ar, c, why) => c && out.push({ title, ar, c, why });
  add('Peacemaker', 'صانع السلام', top(c => by[c.id]?.peace || 0, c => by[c.id]?.peace), c => `${by[c.id].peace} ${by[c.id].peace === 1 ? 'agreement' : 'agreements'} signed`);
  add('Iron Fist', 'القبضة الحديدية', top(c => by[c.id]?.strikes || 0, c => by[c.id]?.strikes), c => `${by[c.id].strikes} military operations`);
  add('Economic Fortress', 'الحصن الاقتصادي', top(c => c.gdp / c.base.gdp), c => `kept ${Math.round((c.gdp / c.base.gdp) * 100)}% of its economy`);
  add('People\'s Choice', 'خيار الشعب', top(c => c.support), c => `${Math.round(c.support)}% public support`);
  add('Spymaster', 'سيد الجواسيس', top(c => by[c.id]?.covert || 0, c => by[c.id]?.covert), c => `${by[c.id].covert} covert operations`);
  add('Generous Hand', 'اليد السخية', top(c => by[c.id]?.aid || 0, c => by[c.id]?.aid), c => `$${by[c.id].aid}bn sent abroad`);
  return out;
}

function LineChart({ data, color, max, label }) {
  if (data.length < 2) data = [data[0] ?? 0, data[0] ?? 0];
  const mx = max ?? Math.max(...data) * 1.1, mn = Math.min(0, ...data);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 300},${100 - ((v - mn) / (mx - mn || 1)) * 92}`).join(' ');
  return html`<div class="chart"><div class="chart-l">${label}</div><svg viewBox="0 0 300 100" preserveAspectRatio="none">
    <polygon points=${`0,100 ${pts} 300,100`} fill=${color} opacity=".12" /><polyline points=${pts} fill="none" stroke=${color} stroke-width="2.5" vector-effect="non-scaling-stroke" class="draw" />
  </svg><div class="chart-v" style=${`color:${color}`}>${data[data.length - 1]}</div></div>`;
}

function Report({ state, lang }) {
  const h = state.history;
  const awards = useMemo(() => computeAwards(state), [state.orders.length, state.meta.turn]);
  const g = state.global;
  return html`<div class="panel-scene report">
    <div class="ps-head"><${Bi} k="report" lang=${lang} cls="ps-title" /><span class="ps-kicker">${state.name} · ${state.meta.turn - 1} ${state.meta.turn - 1 === 1 ? 'week' : 'weeks'}</span></div>
    <div class="rep-grid">
      <${LineChart} data=${h.map(x => x.tension)} max=${10} color="#ff7a45" label=${t('tension', lang)} />
      <${LineChart} data=${h.map(x => x.oil)} color="#d9a441" label=${t('oil', lang) + ' $'} />
      <${LineChart} data=${h.map(x => Math.round(x.gdpIndex * 100))} max=${110} color="#ece6d6" label=${t('economy', lang) + ' %'} />
      <${LineChart} data=${h.map(x => x.wars)} color="#e2574a" label=${t('wars', lang)} />
    </div>
    <div class="rep-figs">
      <div><b>${state.treaties.filter(x => x.type === 'peace' || x.type === 'ceasefire').length}</b><span>agreements</span></div>
      <div><b>${fmt.refugees(g.refugees)}</b><span>${t('refugees', lang)}</span></div>
      <div><b>${Object.keys(g.closedAirspace).length}</b><span>airspaces closed</span></div>
      <div><b>${Math.round((1 - g.gdpIndex) * 100)}%</b><span>output lost</span></div>
    </div>
    <div class="awards-h"><${Bi} k="awards" lang=${lang} /></div>
    <div class="awards">${awards.map((a, i) => html`<div class="award" style=${`--d:${0.4 + i * 0.18}s`}><div class="aw-medal">★</div><div class="aw-t">${isAr(lang) ? a.ar : a.title}</div><div class="aw-c">${nameOf(a.c, lang)}</div><div class="aw-w">${a.why(a.c)}</div></div>`)}</div>
  </div>`;
}

// ---------- Endings ----------
function Ending({ state, lang, now }) {
  const e = state.display.ending || { type: 'custom', title: 'The End', line: '' };
  const tone = endingsFor(state)[e.type]?.tone || 'neutral';
  const el = (now - state.display.endingAt) / 1000;
  if (e.type === 'nuclear') return html`<${Unthinkable} state=${state} now=${now} />`;
  return html`<div class=${cls('ending', `end-${tone}`, `end-${e.type}`)}>
    ${hasEndingFilm(e.type) ? html`<${EndingFilm} state=${state} type=${e.type} />` : e.scene && html`<div class=${`end-scene es-${e.scene}`}><i></i><i></i><i></i><i></i><i></i><i></i></div>`}
    ${tone === 'good' && html`<div class="end-dawn"></div>`}
    ${tone === 'dark' && html`<div class="end-line"></div>`}
    <div class="end-content">
      <div class="end-kicker" style="animation-delay:.6s">${state.name} · ${fmt.date(state.meta.clock, isAr(lang) ? 'ar' : 'en')}</div>
      <h1 style=${tone === 'dark' ? 'animation-delay:3s' : 'animation-delay:1.2s'}>${isAr(lang) ? e.ar || e.title : e.title}</h1>
      <p style=${tone === 'dark' ? 'animation-delay:5.5s' : 'animation-delay:2.4s'}>${e.line}</p>
      ${el > 7 && e.facts?.length && html`<div class="end-stats">${e.facts.map(f => html`<div><b>${f.k}</b><span>${f.v}</span></div>`)}</div>`}
      ${el > 7 && !e.facts?.length && html`<div class="end-stats">
        <div><b>${state.meta.turn - 1}</b><span>${state.meta.turn - 1 === 1 ? 'week' : 'weeks'}</span></div>
        <div><b>${state.wars.length}</b><span>wars still open</span></div>
        <div><b>${Math.round(state.global.gdpIndex * 100)}%</b><span>world economy</span></div>
        <div><b>${state.treaties.length}</b><span>treaties</span></div>
      </div>`}
    </div>
  </div>`;
}

function Standby({ state, lang, now }) {
  const clock = new Date(now).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  // PasionMUN's own card, full bleed on white, unless the Zeus switches it off.
  if (state.display.brand !== false) return html`<div class="standby sb-card">
    <img class="sb-logo" src="/client/img/pasionmun.png" alt="PasionMUN, Model United Nations" />
    <div class="sb-card-name">${state.name}</div>
    <div class="sb-card-clock mono">${clock}</div>
  </div>`;
  return html`<div class="standby">
    <div class="sb-orb"><${Globe} className="sb-globe" speed=${4} glow="#ece6d6" arcs=${false} /></div>
    <div class="sb-name">${state.name}</div>
    <div class="sb-sub"><${Bi} k="standby" lang=${lang} /></div>
    <div class="sb-clock mono">${clock}</div>
  </div>`;
}

function PauseScreen({ p, lang }) {
  return html`<div class="global-pause">
    <div class="crescent"></div>
    <h1>${p?.label || t('pause', 'en')}</h1>
    <p>${t('resumes', 'en')}${p?.until ? ` · ${fmt.time(p.until)}` : ''}</p>
  </div>`;
}

render(html`<${Display} />`, document.getElementById('app'));
