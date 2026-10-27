// Stage controls: what the projected/streamed display shows, the timer, language and endings.
import { html, useState, useEffect, run, toast, fmt, useNow, timerRemaining, cls } from '../lib.js';
import { ENDINGS } from '/shared/engine/core.js';
import { CountrySelect, ZoneSelect } from './tabs.js';

const SCENES = [
  ['disguise', 'Disguise', 'The cover story: a dull summit nobody prepared for'],
  ['reveal', 'Reveal', 'Glitch the disguise away and reveal the crisis'],
  ['intro', 'Intro', 'Cinematic opening: the globe, the date, the stakes'],
  ['map', 'Live map', 'The world, live: traffic, forces, strikes, ticker'],
  ['polls', 'Polls', 'Public support and economies of the delegate countries'],
  ['web', 'Relations', 'Who is friends with whom, drawn as a web'],
  ['vote', 'UN vote', 'The current or last UN vote'],
  ['treaty', 'Treaty', 'The treaty being signed'],
  ['report', 'Report', 'Post-war report: charts and awards'],
  ['blank', 'Standby', 'A calm holding screen'],
];

export function TimerControls({ conn, state }) {
  const now = useNow(conn, 250);
  const t = state.timer;
  const rem = timerRemaining(t, now);
  const [label, setLabel] = useState(t.label || '');
  const [mins, setMins] = useState('5:00');
  useEffect(() => setLabel(t.label || ''), [t.label]);
  const parse = s => { const m = String(s).match(/^(\d+)(?::(\d{1,2}))?$/); return m ? Number(m[1]) * 60 + Number(m[2] || 0) : null; };
  const set = async start => {
    const sec = parse(mins); if (sec == null) return toast('Write the time as minutes or m:ss', 'error');
    await run(conn, { type: 'timerSet', seconds: sec, label });
    if (start) await run(conn, { type: 'timerStart' });
  };
  return html`<div class="card timer-card"><div class="card-b col">
    <div class="row"><div class=${cls('big-timer mono', t.running && 'run', t.running && rem < 30 && 'low')}>${fmt.clock(rem)}</div>
      <div class="col grow" style="gap:4px"><div class="ellipsis"><b>${t.label || 'No label'}</b></div><div class="dim small">${t.running ? 'Running' : rem ? 'Paused' : 'Not set'}${t.visible === false ? ' · hidden' : ''}</div></div></div>
    <div class="row">
      <input class="input grow" placeholder="Label, e.g. Unmoderated caucus" value=${label} onInput=${e => setLabel(e.target.value)} />
      <input class="input mono" style="width:72px" value=${mins} onInput=${e => setMins(e.target.value)} onKeyDown=${e => e.key === 'Enter' && set(true)} />
    </div>
    <div class="row wrap">
      ${['1:00', '2:00', '5:00', '10:00', '15:00'].map(p => html`<button class="btn xs ghost" onClick=${() => setMins(p)}>${p}</button>`)}
    </div>
    <div class="row wrap">
      <button class="btn sm primary" onClick=${() => set(true)}>Set and start</button>
      ${t.running ? html`<button class="btn sm" onClick=${() => run(conn, { type: 'timerPause' })}>Pause</button>` : html`<button class="btn sm" disabled=${!rem} onClick=${() => run(conn, { type: 'timerStart' })}>Resume</button>`}
      <button class="btn sm" onClick=${() => run(conn, { type: 'timerAdd', seconds: 60 })}>+1:00</button>
      <button class="btn sm" onClick=${() => run(conn, { type: 'timerAdd', seconds: -30 })}>−0:30</button>
      <button class="btn sm ghost" onClick=${() => run(conn, { type: 'timerReset' })}>Reset</button>
      <button class="btn sm ghost" onClick=${() => run(conn, { type: 'timerHide' })}>${t.visible === false ? 'Show' : 'Hide'}</button>
    </div>
  </div></div>`;
}

export function DisplayTab({ conn, state, committee }) {
  const d = state.display, st = state.settings;
  const [banner, setBanner] = useState(d.banner?.text || '');
  const [bannerAr, setBannerAr] = useState(d.banner?.ar || '');
  const [dis, setDis] = useState(false);
  const [endingCustom, setEndingCustom] = useState({ title: '', line: '' });
  const setScene = scene => run(conn, { type: 'setScene', scene });
  return html`
    <div class="pane">
      <div class="pane-h"><h2>Stage</h2><button class="btn xs" onClick=${() => window.open(`/display?c=${committee}`, `display-${committee}`, 'width=1280,height=720')}>Open display ↗</button></div>
      <p class="pane-hint">The Stage Zeus streams or projects the display window. Everything here changes it instantly.</p>
      <div class="scene-grid">
        ${SCENES.map(([k, l, hint]) => html`<button class=${cls('scene-btn', d.scene === k && 'on', k === 'reveal' && 'danger')} onClick=${() => setScene(k)} title=${hint}><span class="scene-name">${l}</span><span class="scene-hint">${hint}</span></button>`)}
      </div>
      <div class="sub-h">Timer</div>
      <${TimerControls} conn=${conn} state=${state} />

      <div class="sub-h">Banner</div>
      <div class="col">
        <input class="input" placeholder="e.g. EMERGENCY SESSION CALLED" value=${banner} onInput=${e => setBanner(e.target.value)} />
        <div class="row wrap">${['alert', 'info', 'good', 'dark'].map(tone => html`<button class=${cls('btn sm', tone === 'alert' ? 'danger' : tone === 'good' ? 'good' : tone === 'info' ? 'on' : '')} disabled=${!banner.trim()} onClick=${() => run(conn, { type: 'setBanner', text: banner, ar: bannerAr, tone })}>${tone}</button>`)}
          <button class="btn sm ghost" disabled=${!d.banner} onClick=${() => run(conn, { type: 'setBanner', text: '' })}>Clear</button></div>
      </div>

      <div class="sub-h">Camera</div>
      <div class="row"><div class="grow"><${CountrySelect} state=${state} value=${d.focus?.kind === 'country' ? d.focus.id : null} onChange=${v => run(conn, { type: 'setFocus', country: v })} placeholder="Whole world" /></div></div>
      <div class="row" style="margin-top:6px"><div class="grow"><${ZoneSelect} value=${d.focus?.kind === 'sea' ? d.focus.id : null} onChange=${v => run(conn, { type: 'setFocus', zone: v })} /></div><button class="btn sm" onClick=${() => run(conn, { type: 'setFocus' })}>World</button></div>

      <div class="sub-h">World tension</div>
      <div class="row">
        <button class="btn sm" disabled=${state.global.tension <= 0} onClick=${() => run(conn, { type: 'setTension', value: Math.max(0, state.global.tension - 1) })}>▼</button>
        <input type="range" min="0" max="10" step="0.5" value=${state.global.tension} class="grow" onChange=${e => run(conn, { type: 'setTension', value: +e.target.value })} />
        <button class="btn sm" disabled=${state.global.tension >= 10} onClick=${() => run(conn, { type: 'setTension', value: Math.min(10, state.global.tension + 1) })}>▲</button>
        <b class="mono" style="width:34px;text-align:right">${state.global.tension}</b>
      </div>
      <p class="pane-hint">Changing it plays the tension meter on the display. Nuclear weapons unlock only at 10.</p>

      <div class="sub-h">Map look</div>
      <div class="row wrap">
        <button class=${cls('btn sm', st.night && 'on')} onClick=${() => run(conn, { type: 'setSetting', key: 'night', value: !st.night })} title="Dark map with glowing city lights">☾ Night mode</button>
        <button class=${cls('btn sm', st.showStrikes !== false && 'on')} onClick=${() => run(conn, { type: 'setSetting', key: 'showStrikes', value: st.showStrikes === false })} title="Jets fly precision strikes along active fronts every few seconds, for show only">✈ Show strikes</button>
        <button class=${cls('btn sm', d.arms !== false && 'on')} onClick=${() => run(conn, { type: 'setCoat', on: d.arms === false })} title="Show the coat of arms of a country when it is selected or zoomed to, on every map">⚜ Coats of arms</button>
      </div>

      <div class="sub-h">Map layers on stage</div>
      <div class="row wrap">${[['air', '✈ Air traffic'], ['naval', '⛴ Shipping'], ['units', '▲ Forces'], ['relations', '◎ Relations'], ['labels', 'Aa Labels']].map(([k, l]) => html`<button class=${cls('btn sm', st.layers[k] && 'on')} onClick=${() => run(conn, { type: 'setSetting', key: 'layer', layer: k, value: !st.layers[k] })}>${l}</button>`)}</div>
      <label class="field" style="margin-top:8px">Fog of war
        <select class="input" value=${st.fog} onChange=${e => run(conn, { type: 'setSetting', key: 'fog', value: e.target.value })}>
          <option value="public">Public: only deployed forces are visible</option>
          <option value="all">Everything visible</option>
          <optgroup label="Seen through the eyes of…">${Object.values(state.countries).filter(c => c.control === 'player').map(c => html`<option value=${c.id}>${c.name}</option>`)}</optgroup>
        </select></label>

      <div class="sub-h">Sound</div>
      <div class="row wrap">
        <button class=${cls('btn sm', st.sfx && 'on')} onClick=${() => run(conn, { type: 'setSetting', key: 'sfx', value: !st.sfx })}>◖ Effects</button>
      </div>
      <label class="row" style="margin-top:8px"><span class="dim small" style="width:60px">Volume</span><input type="range" min="0" max="1" step="0.05" value=${st.volume ?? 0.7} class="grow" onChange=${e => run(conn, { type: 'setSetting', key: 'volume', value: +e.target.value })} /></label>

      <div class="sub-h row between"><span>Disguise</span><button class="btn xs ghost" onClick=${() => setDis(x => !x)}>${dis ? 'Done' : 'Edit'}</button></div>
      ${dis ? html`<${DisguiseEditor} conn=${conn} d=${d.disguise} />` : html`<div class="dim small">${d.disguise.title} — ${d.disguise.subtitle}</div>`}

      <div class="sub-h">Endings</div>
      <p class="pane-hint">Any ending can be played at any time. Suggestions also appear on the news desk when the world reaches one.</p>
      <div class="ending-grid">${Object.entries(ENDINGS).filter(([k]) => k !== 'custom').map(([k, e]) => html`<button class=${cls('ending-btn', e.tone)} onClick=${() => run(conn, { type: 'playEnding', ending: k })}><b>${e.title}</b><span>${e.line}</span></button>`)}</div>
      <div class="col" style="margin-top:8px">
        <input class="input" placeholder="Custom ending title" value=${endingCustom.title} onInput=${e => setEndingCustom({ ...endingCustom, title: e.target.value })} />
        <textarea class="input" rows="2" placeholder="What happened, in one or two sentences" value=${endingCustom.line} onInput=${e => setEndingCustom({ ...endingCustom, line: e.target.value })}></textarea>
        <button class="btn sm gold" disabled=${!endingCustom.title.trim()} onClick=${() => run(conn, { type: 'playEnding', ending: 'custom', ...endingCustom })}>Play custom ending</button>
      </div>
    </div>`;
}

function DisguiseEditor({ conn, d }) {
  const [f, setF] = useState({ title: d.title, subtitle: d.subtitle, agenda: d.agenda.join('\n') });
  const save = () => run(conn, { type: 'setDisguise', title: f.title, subtitle: f.subtitle, agenda: f.agenda.split('\n').map(s => s.trim()).filter(Boolean) }, 'Disguise updated');
  return html`<div class="col">
    <input class="input" value=${f.title} onInput=${e => setF({ ...f, title: e.target.value })} />
    <input class="input" value=${f.subtitle} onInput=${e => setF({ ...f, subtitle: e.target.value })} />
    <textarea class="input" rows="4" value=${f.agenda} onInput=${e => setF({ ...f, agenda: e.target.value })}></textarea>
    <button class="btn sm primary" onClick=${save}>Save disguise</button>
  </div>`;
}
