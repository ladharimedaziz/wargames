// Every change to a committee goes through here. The server calls applyAction for both Zeus accounts and Kronos;
// actions tagged 'kronos' are sandbox powers only Kronos has.
import { SEA_ZONES } from '../data/places.js';
import { carrierName } from '../data/militaries.js';
import { zonesTouching } from '../geo.js';
import {
  UNIT_TYPES, ROE, BLOCS, ENDINGS, clamp, round1, newId, atWar, relation, shiftRelation, sameSide, isActive, airContested, warClosures, isOOB, OOB_ERROR,
} from './core.js';
import { ORDER_TYPES, validateOrder, autoUnits, describeOrder } from './orders.js';
import { resolveTurn, resolveNow, declareWar, applyStrikeDamage, pushFrontNow, syncFront, clearFront, publishInstant } from './resolve.js';
import { bindGeo, hasGeo, paintCells, advance, cellsOf, releaseCells, holdings, cellAt, cellCenter, heldCenter, mainland } from './control.js';
import { courtActions } from './court.js';

const SCENES = ['map', 'disguise', 'intro', 'reveal', 'ending', 'report', 'blank', 'pause', 'vote', 'treaty', 'polls', 'web', 'court'];
const STAT_FIELDS = { gdp: [0.5, 1e6], treasury: [-1e5, 1e5], support: [0, 100], stability: [0, 100], industry: [0.05, 1.2], energy: [0.05, 1.2], damage: [0, 1], inflation: [-2, 80], airDefense: [0, 12], influence: [0, 100] };
const DISASTERS = {
  earthquake: { en: 'A major earthquake strikes', ar: 'زلزال قوي يضرب', gdp: 0.04, industry: 0.12, support: 3 },
  flood: { en: 'Catastrophic floods hit', ar: 'فيضانات كارثية تجتاح', gdp: 0.03, industry: 0.08, support: 2 },
  pandemic: { en: 'A fast-spreading outbreak is reported in', ar: 'تفشي وباء سريع الانتشار في', gdp: 0.06, industry: 0.05, support: 6 },
  blackout: { en: 'A nationwide blackout leaves millions in the dark in', ar: 'انقطاع شامل للكهرباء في', gdp: 0.02, energy: 0.3, support: 4 },
  coup: { en: 'Military officers seize power in', ar: 'ضباط عسكريون يستولون على السلطة في', gdp: 0.03, support: 0, stability: 40 },
  discovery: { en: 'Huge new oil and gas fields are discovered in', ar: 'اكتشاف حقول نفط وغاز ضخمة في', gdp: -0.05, support: -5 },
};

const err = error => ({ ok: false, error });
const ok = (result = {}) => ({ ok: true, ...result });
const C = (s, id) => s.countries?.[id];
const at = c => ({ lat: c.lat, lon: c.lon });

// Sandbox powers play an animation on every map without adding headlines of their own.
function sandboxFx(s, ctx, events) {
  s.lastResolution = { turn: s.meta.turn, at: ctx.now, instant: true, events };
}

// A random point inside a country, for where an act of god strikes.
function spotIn(s, c) {
  const cells = hasGeo() ? cellsOf(c.id) : [];
  if (!cells.length) return at(c);
  const [lon, lat] = cellCenter(cells[Math.floor(Math.random() * cells.length)]);
  return { lat, lon };
}

function log(s, ctx, text) {
  s.log.push({ turn: s.meta.turn, at: ctx.now, by: ctx.user, text });
  if (s.log.length > 200) s.log.shift();
}

function news(s, ctx, en, ar, priority = 3, kind = 'news') {
  const item = { id: newId(s, 'n'), turn: s.meta.turn, kind, status: 'pending', priority, en, ar: ar || en, detail: '', at: ctx.now };
  s.review.push(item);
  // Headlines go straight to the stage unless the Zeus has switched to reviewing them first.
  if (kind === 'news' && s.settings.airMode !== 'manual') air(s, item, ctx);
  return item;
}

function air(s, item, ctx) {
  if (s.aired.some(x => x.id === item.id)) return;
  item.status = 'aired';
  s.aired.push({ ...item, airedAt: ctx.now });
  if (s.aired.length > 120) s.aired.shift();
}

function trimReview(s) {
  if (s.review.length > 300) s.review = s.review.filter(r => r.status === 'pending').concat(s.review.filter(r => r.status !== 'pending').slice(-150));
}

// Votes the computer casts for AI countries on a UN resolution, from their relations with the sponsor and the target.
function aiVote(s, c, v) {
  if (v.target && (c.id === v.target)) return 'no';
  if (c.id === v.sponsor) return 'yes';
  const rs = relation(s, c.id, v.sponsor);
  const rt = v.target ? relation(s, c.id, v.target) : 0;
  const score = rs * 0.6 - rt * 0.6 + (v.kind === 'ceasefire' || v.kind === 'humanitarian' ? 25 : 0);
  return score > 12 ? 'yes' : score < -12 ? 'no' : 'abstain';
}

function tallyVote(s, v) {
  const t = { yes: 0, no: 0, abstain: 0, vetoes: [] };
  for (const [id, choice] of Object.entries(v.votes)) {
    t[choice]++;
    if (choice === 'no' && v.body === 'council' && C(s, id)?.veto) t.vetoes.push(id);
  }
  return t;
}

function voters(s, body) {
  const all = Object.values(s.countries).filter(c => isActive(c) && c.major);
  if (body !== 'council') return all;
  const p5 = all.filter(c => c.veto);
  const rest = all.filter(c => !c.veto).sort((a, b) => b.influence - a.influence).slice(0, 10);
  return [...p5, ...rest];
}

const WORLD = {
  // Countries
  setControl: { perm: 'zeus', run(s, a, ctx) {
    const c = C(s, a.country); if (!c) return err('Unknown country.');
    if (!['player', 'ai', 'inactive'].includes(a.control)) return err('Control must be player, ai or inactive.');
    c.control = a.control;
    if (a.control === 'player' && a.delegate !== undefined) c.delegate = String(a.delegate).slice(0, 60);
    log(s, ctx, `${c.name} is now ${a.control === 'player' ? 'played by a delegate' : a.control === 'ai' ? 'run by the computer' : 'inactive'}`);
    return ok();
  } },
  setControlMany: { perm: 'zeus', run(s, a, ctx) {
    for (const id of a.countries || []) if (C(s, id)) C(s, id).control = a.control;
    log(s, ctx, `${(a.countries || []).length} countries set to ${a.control}`);
    return ok();
  } },
  // War fronts: the Zeus decides whether each front advances, holds or falls back, or moves it right now.
  frontMode: { perm: 'zeus', run(s, a, ctx) {
    const c = C(s, a.country); if (!c?.front) return err('There is no front in that country.');
    if (!['auto', 'advance', 'hold', 'retreat'].includes(a.mode)) return err('Unknown front order.');
    c.front.mode = a.mode;
    log(s, ctx, `${C(s, c.front.by).name}'s front in ${c.name}: ${{ auto: 'left to the battle', advance: 'ordered to advance', hold: 'ordered to hold', retreat: 'ordered to fall back' }[a.mode]}`);
    return ok();
  } },
  frontPush: { perm: 'zeus', run(s, a, ctx) {
    const c = C(s, a.country); if (!c) return err('Unknown country.');
    const by = a.by || c.front?.by;
    const delta = clamp(Number(a.delta) || 0, -100, 100); if (!delta) return err('Pick how far to move the front.');
    const e = pushFrontNow(s, c.id, by, delta, ctx); if (e) return err(e);
    log(s, ctx, `${C(s, by).name}'s front in ${c.name} moved ${delta > 0 ? 'forward' : 'back'} to ${Math.round(c.front?.pct ?? 0)}%`);
    return ok({ broadcastAnim: true });
  } },
  setDelegate: { perm: 'zeus', run(s, a) { const c = C(s, a.country); if (!c) return err('Unknown country.'); c.delegate = String(a.delegate || '').slice(0, 60); return ok(); } },
  setBloc: { perm: 'zeus', run(s, a, ctx) {
    const c = C(s, a.country); if (!c || !BLOCS.includes(a.bloc)) return err('Unknown country or bloc.');
    c.bloc = a.bloc; log(s, ctx, `${c.name} joins ${s.blocs[a.bloc].name}`); return ok();
  } },
  editBloc: { perm: 'zeus', run(s, a) {
    const b = s.blocs[a.bloc]; if (!b) return err('Unknown bloc.');
    if (a.name) b.name = String(a.name).slice(0, 40);
    if (a.ar) b.ar = String(a.ar).slice(0, 40);
    if (/^#[0-9a-f]{6}$/i.test(a.color || '')) b.color = a.color;
    return ok();
  } },
  setRoe: { perm: 'zeus', run(s, a) { const c = C(s, a.country); if (!c || !ROE.includes(a.roe)) return err('Pick defensive, firm or forward.'); c.roe = a.roe; return ok(); } },
  setBrief: { perm: 'zeus', run(s, a) { const c = C(s, a.country); if (!c) return err('Unknown country.'); c.brief = String(a.text || '').slice(0, 4000); return ok(); } },

  // Orders
  queueOrder: { perm: 'zeus', run(s, a, ctx) {
    const src = a.order || {};
    if (!ORDER_TYPES[src.type]) return err('Unknown order type.');
    let o = { id: newId(s, 'o'), turn: s.meta.turn, status: 'queued', by: ctx.user, at: ctx.now,
      country: src.country, type: src.type, target: src.target || null, zone: src.zone || null, category: src.category || 'military',
      units: Array.isArray(src.units) ? src.units.filter(id => s.units[id]) : undefined, escort: src.escort, amount: Number(src.amount) || 0,
      unitType: src.unitType, kind: src.kind, terms: src.terms || null, note: src.note ? String(src.note).slice(0, 200) : '' };
    if (!o.units || !o.units.length) o = autoUnits(s, o, src.counts || {});
    const v = validateOrder(s, o);
    if (!v.ok) return err(o._why ? `${v.reason} ${o._why}` : v.reason);
    delete o._why;
    if (o.type === 'nuke') o.flagged = true;
    s.orders.push(o);
    if (s.orders.length > 3000) s.orders = s.orders.slice(-2500);
    log(s, ctx, `Queued: ${describeOrder(s, o)}`);
    // "Force now": resolve straight away instead of waiting for the turn.
    if (a.now && o.type !== 'nuke') return WORLD.executeNow.run(s, { id: o.id }, ctx);
    return ok({ order: o, text: describeOrder(s, o) });
  } },
  previewOrder: { perm: 'zeus', readOnly: true, run(s, a) {
    const src = a.order || {};
    let o = { ...src, turn: s.meta.turn, category: src.category || 'military' };
    if (!o.units || !o.units.length) o = autoUnits(s, o, src.counts || {});
    const v = validateOrder(s, o);
    return ok({ valid: v.ok, reason: v.ok ? '' : (o._why ? `${v.reason} ${o._why}` : v.reason), text: describeOrder(s, o), units: o.units || [] });
  } },
  cancelOrder: { perm: 'zeus', run(s, a, ctx) {
    const o = s.orders.find(x => x.id === a.id && x.status === 'queued'); if (!o) return err('That order is no longer queued.');
    s.orders = s.orders.filter(x => x !== o); log(s, ctx, `Cancelled: ${describeOrder(s, o)}`); return ok();
  } },
  executeNow: { perm: 'zeus', run(s, a, ctx) {
    // Zeus can force any queued order now instead of waiting for the turn. A nuclear launch still waits for the turn.
    const o = s.orders.find(x => x.id === a.id && x.status === 'queued'); if (!o) return err('That order is no longer queued.');
    if (o.type === 'nuke') return err('A nuclear launch resolves with the turn.');
    s.orders = s.orders.filter(x => x !== o);
    const ev = resolveNow(s, [o], { ...ctx, countryAt: ctx.geo?.countryAt });
    log(s, ctx, `Executed now: ${describeOrder(s, o)}`);
    return ok({ events: ev.length, broadcastAnim: true });
  } },
  executeAll: { perm: 'zeus', run(s, a, ctx) {
    const list = s.orders.filter(x => x.status === 'queued' && x.type !== 'nuke');
    if (!list.length) return err('No queued orders to force.');
    s.orders = s.orders.filter(x => !list.includes(x));
    const ev = resolveNow(s, list, { ...ctx, countryAt: ctx.geo?.countryAt });
    log(s, ctx, `Forced ${list.length} queued order${list.length > 1 ? 's' : ''} without ending the turn`);
    return ok({ events: ev.length, broadcastAnim: true });
  } },
  resolveTurn: { perm: 'zeus', snapshot: true, run(s, a, ctx) {
    if (s.meta.resolving) return err('A turn is already resolving.');
    const t0 = Date.now();
    const ev = resolveTurn(s, { now: ctx.now, countryAt: ctx.geo?.countryAt });
    s.meta.phase = 'running';
    trimReview(s);
    log(s, ctx, `Resolved turn ${s.meta.turn - 1} in ${Date.now() - t0} ms: ${ev.length} events`);
    return ok({ events: ev.length, broadcastAnim: true });
  } },

  // Review queue: nothing automatic reaches the screen until a Zeus airs it (unless auto-air is on).
  airItem: { perm: 'zeus', run(s, a, ctx) {
    const r = s.review.find(x => x.id === a.id && x.status === 'pending'); if (!r) return err('Already handled.');
    if (r.kind === 'ending') { r.status = 'aired'; return WORLD.playEnding.run(s, { ending: r.ending }, ctx); }
    if (r.kind === 'join') {
      // Approved: the country enters the war and the headline airs.
      r.status = 'approved';
      const A = C(s, r.country), B = C(s, r.target); if (!A || !B) return err('Those countries are gone.');
      if (atWar(s, A.id, B.id)) return ok();
      const ev = []; declareWar(s, A.id, B.id, ev, 'alliance');
      for (const id of warClosures(s, A.id, B.id)) s.global.closedAirspace[id] ||= { turn: s.meta.turn, at: ctx.now, war: true };
      sandboxFx(s, ctx, ev.filter(e => e.kind === 'war'));
      air(s, news(s, ctx, `BREAKING: ${A.name} joins the war against ${B.name}`, `عاجل: ${A.ar} تدخل الحرب ضد ${B.ar}`, 6), ctx);
      log(s, ctx, `Approved: ${A.name} joins the war against ${B.name}`);
      return ok({ broadcastAnim: true });
    }
    air(s, r, ctx); return ok();
  } },
  killItem: { perm: 'zeus', run(s, a) { const r = s.review.find(x => x.id === a.id && x.status === 'pending'); if (!r) return err('Already handled.'); r.status = 'killed'; return ok(); } },
  editItem: { perm: 'zeus', run(s, a) {
    const r = s.review.find(x => x.id === a.id); if (!r) return err('Unknown item.');
    if (a.en !== undefined) r.en = String(a.en).slice(0, 300);
    if (a.ar !== undefined) r.ar = String(a.ar).slice(0, 300);
    if (a.priority !== undefined) r.priority = clamp(Number(a.priority) || 1, 1, 9);
    return ok();
  } },
  airAll: { perm: 'zeus', run(s, a, ctx) { for (const r of s.review.filter(x => x.status === 'pending' && x.kind === 'news')) air(s, r, ctx); return ok(); } },
  killAll: { perm: 'zeus', run(s) { for (const r of s.review.filter(x => x.status === 'pending' && x.kind === 'news')) r.status = 'killed'; return ok(); } },
  addNews: { perm: 'zeus', run(s, a, ctx) {
    const en = String(a.en || '').trim().slice(0, 300); if (!en) return err('Write a headline first.');
    const item = news(s, ctx, en, String(a.ar || '').trim().slice(0, 300) || en, clamp(Number(a.priority) || 4, 1, 9), 'manual');
    if (a.airNow) air(s, item, ctx);
    return ok({ item });
  } },
  unairItem: { perm: 'zeus', run(s, a) { s.aired = s.aired.filter(x => x.id !== a.id); return ok(); } },

  // Display (the Stage Zeus streams this)
  setScene: { perm: 'zeus', run(s, a, ctx) {
    if (!SCENES.includes(a.scene)) return err('Unknown scene.');
    s.display.scene = a.scene; s.display.sceneAt = ctx.now;
    if (a.scene === 'intro') s.display.introAt = ctx.now;
    if (a.scene === 'reveal') s.display.revealAt = ctx.now;
    if (a.scene === 'report') s.display.reportAt = ctx.now;
    if (a.scene === 'map' && s.meta.phase === 'setup') s.meta.phase = 'running';
    return ok();
  } },
  setDisguise: { perm: 'zeus', run(s, a) {
    const d = s.display.disguise;
    if (a.title !== undefined) d.title = String(a.title).slice(0, 80);
    if (a.subtitle !== undefined) d.subtitle = String(a.subtitle).slice(0, 120);
    if (Array.isArray(a.agenda)) d.agenda = a.agenda.map(x => String(x).slice(0, 80)).slice(0, 8);
    return ok();
  } },
  setBanner: { perm: 'zeus', run(s, a, ctx) {
    const text = String(a.text || '').slice(0, 160);
    s.display.banner = text ? { text, ar: String(a.ar || '').slice(0, 160), tone: ['alert', 'info', 'good', 'dark'].includes(a.tone) ? a.tone : 'alert', at: ctx.now } : null;
    return ok();
  } },
  setFocus: { perm: 'zeus', run(s, a, ctx) {
    if (a.country && C(s, a.country)) s.display.focus = { kind: 'country', id: a.country, at: ctx.now };
    else if (a.zone && SEA_ZONES[a.zone]) s.display.focus = { kind: 'sea', id: a.zone, at: ctx.now };
    else s.display.focus = null;
    return ok();
  } },
  // Coats of arms for the selected or focused country, on every map. On unless the Zeus turns it off.
  setCoat: { perm: 'zeus', run(s, a) { s.display.arms = !!a.on; return ok(); } },
  playEnding: { perm: 'zeus', run(s, a, ctx) {
    if (!ENDINGS[a.ending]) return err('Unknown ending.');
    s.display.ending = { type: a.ending, title: String(a.title || ENDINGS[a.ending].title).slice(0, 80), line: String(a.line || ENDINGS[a.ending].line).slice(0, 400), ar: a.ar || ENDINGS[a.ending].ar };
    s.display.endingAt = ctx.now; s.display.scene = 'ending'; s.meta.phase = 'ended';
    log(s, ctx, `Ending played: ${s.display.ending.title}`);
    return ok();
  } },
  setSetting: { perm: 'zeus', run(s, a) {
    const st = s.settings;
    if (a.key === 'lang' && ['en', 'ar', 'both'].includes(a.value)) st.lang = a.value;
    else if (['sfx', 'night', 'showStrikes', 'autoSnap'].includes(a.key)) st[a.key] = !!a.value;
    else if (a.key === 'autoAir') st.airMode = a.value ? 'auto' : 'manual';
    else if (a.key === 'layer' && a.layer in st.layers) st.layers[a.layer] = !!a.value;
    else if (a.key === 'fog') st.fog = a.value === 'public' || a.value === 'all' || C(s, a.value) ? a.value : 'public';
    else if (a.key === 'volume') st.volume = clamp(Number(a.value) || 0, 0, 1);
    else return err('Unknown setting.');
    return ok();
  } },

  // Zeus timer: label + countdown shown on the display.
  timerSet: { perm: 'zeus', run(s, a) {
    const sec = clamp(Math.round(Number(a.seconds) || 0), 0, 6 * 3600);
    s.timer = { label: String(a.label ?? s.timer.label ?? '').slice(0, 60), duration: sec, remaining: sec, endsAt: 0, running: false, visible: true };
    return ok();
  } },
  timerStart: { perm: 'zeus', run(s, a, ctx) { const t = s.timer; if (!t.remaining) return err('Set a time first.'); t.endsAt = ctx.now + t.remaining * 1000; t.running = true; t.visible = true; return ok(); } },
  timerPause: { perm: 'zeus', run(s, a, ctx) { const t = s.timer; if (t.running) { t.remaining = Math.max(0, Math.round((t.endsAt - ctx.now) / 1000)); t.running = false; } return ok(); } },
  timerReset: { perm: 'zeus', run(s) { const t = s.timer; t.remaining = t.duration; t.running = false; t.endsAt = 0; return ok(); } },
  timerAdd: { perm: 'zeus', run(s, a, ctx) {
    const t = s.timer, d = Math.round(Number(a.seconds) || 0);
    if (t.running) t.endsAt = Math.max(ctx.now, t.endsAt + d * 1000); else t.remaining = Math.max(0, t.remaining + d);
    t.duration = Math.max(t.duration, t.remaining); return ok();
  } },
  timerHide: { perm: 'zeus', run(s, a) { s.timer.visible = a.visible === undefined ? !s.timer.visible : !!a.visible; return ok(); } },

  // Diplomacy tools
  humanitarianPause: { perm: 'zeus', run(s, a, ctx) {
    const turns = clamp(Math.round(Number(a.turns) || 1), 1, 6);
    s.global.pauseUntil = s.meta.turn + turns - 1;
    news(s, ctx, `Humanitarian pause agreed: ${turns} week${turns > 1 ? 's' : ''} without strikes`, `الاتفاق على هدنة إنسانية لمدة ${turns} أسبوع`, 5);
    log(s, ctx, `Humanitarian pause for ${turns} turns`);
    return ok();
  } },
  voteOpen: { perm: 'zeus', run(s, a, ctx) {
    if (s.unVotes.some(v => v.open)) return err('Close the current vote first.');
    const title = String(a.title || '').slice(0, 160); if (!title) return err('Give the resolution a title.');
    const body = a.body === 'council' ? 'council' : 'assembly';
    const kinds = ['condemn', 'sanction', 'ceasefire', 'humanitarian', 'custom'];
    const v = { id: newId(s, 'v'), title, ar: String(a.ar || '').slice(0, 160), body, kind: kinds.includes(a.kind) ? a.kind : 'custom', sponsor: C(s, a.sponsor) ? a.sponsor : null, target: C(s, a.target) ? a.target : null, open: true, openedAt: ctx.now, votes: {}, result: null };
    for (const c of voters(s, body)) v.votes[c.id] = c.control === 'player' ? 'abstain' : aiVote(s, c, v);
    s.unVotes.push(v);
    s.display.scene = 'vote'; s.display.sceneAt = ctx.now;
    return ok({ vote: v });
  } },
  voteCast: { perm: 'zeus', run(s, a) {
    const v = s.unVotes.find(x => x.open); if (!v) return err('No vote is open.');
    if (!(a.country in v.votes)) return err('That country does not sit in this body.');
    if (!['yes', 'no', 'abstain'].includes(a.choice)) return err('Vote yes, no or abstain.');
    v.votes[a.country] = a.choice; return ok();
  } },
  voteClose: { perm: 'zeus', run(s, a, ctx) {
    const v = s.unVotes.find(x => x.open); if (!v) return err('No vote is open.');
    const t = tallyVote(s, v);
    const passed = t.yes > t.no && (v.body !== 'council' || (t.vetoes.length === 0 && t.yes >= 9));
    v.open = false; v.closedAt = ctx.now; v.result = { ...t, passed };
    if (passed && v.target) {
      if (v.kind === 'sanction') for (const id of Object.keys(v.votes).filter(id => v.votes[id] === 'yes' && id !== v.target)) { const c = C(s, id); if (!c.sanctions.includes(v.target)) c.sanctions.push(v.target); }
      if (v.kind === 'condemn') { const T = C(s, v.target); T.support = clamp(T.support - 3, 0, 100); T.influence = clamp(T.influence - 5, 0, 100); }
    }
    if (passed && (v.kind === 'ceasefire' || v.kind === 'humanitarian')) s.global.pauseUntil = Math.max(s.global.pauseUntil, s.meta.turn);
    const head = passed ? `UN ${v.body === 'council' ? 'Security Council' : 'General Assembly'} passes: ${v.title}` : `UN resolution fails: ${v.title}${t.vetoes.length ? ` (vetoed by ${t.vetoes.map(id => C(s, id).name).join(', ')})` : ''}`;
    const headAr = passed ? `الأمم المتحدة تقر: ${v.ar || v.title}` : `فشل قرار الأمم المتحدة: ${v.ar || v.title}`;
    news(s, ctx, `${head} (${t.yes}-${t.no}-${t.abstain})`, headAr, 4);
    return ok({ result: v.result });
  } },
  treatyDraft: { perm: 'zeus', run(s, a, ctx) {
    const parties = (a.parties || []).filter(id => C(s, id));
    if (parties.length < 2) return err('A treaty needs at least two parties.');
    s.draftTreaty = {
      id: s.draftTreaty?.id || newId(s, 't'), title: String(a.title || 'Treaty of Riyadh').slice(0, 80), parties,
      kind: ['peace', 'ceasefire', 'alliance', 'trade'].includes(a.kind) ? a.kind : 'peace',
      terms: { returnTerritory: a.terms?.returnTerritory !== false, reparations: clamp(Number(a.terms?.reparations) || 0, 0, 500), payer: C(s, a.terms?.payer) ? a.terms.payer : null, payee: C(s, a.terms?.payee) ? a.terms.payee : null, demilitarize: !!a.terms?.demilitarize, clauses: (a.terms?.clauses || []).map(x => String(x).slice(0, 200)).slice(0, 10) },
      signed: [], updatedAt: ctx.now,
    };
    return ok({ treaty: s.draftTreaty });
  } },
  treatySign: { perm: 'zeus', run(s, a, ctx) {
    const t = s.draftTreaty; if (!t) return err('Draft a treaty first.');
    if (a.country && t.parties.includes(a.country) && !t.signed.includes(a.country)) t.signed.push(a.country);
    if (a.all) t.signed = [...t.parties];
    if (t.signed.length < t.parties.length) return ok({ treaty: t });
    // Everyone has signed: bind every pair.
    const orders = [];
    for (let i = 0; i < t.parties.length; i++) for (let j = i + 1; j < t.parties.length; j++) {
      const [x, y] = [t.parties[i], t.parties[j]];
      if ((t.kind === 'peace' || t.kind === 'ceasefire') && !atWar(s, x, y) && !s.treaties.some(tr => tr.type === 'ceasefire' && tr.parties.includes(x) && tr.parties.includes(y))) continue;
      orders.push({ id: newId(s, 'o'), country: x, target: y, type: t.kind, terms: t.terms, by: ctx.user, at: ctx.now });
    }
    if (orders.length) resolveNow(s, orders, { ...ctx, countryAt: ctx.geo?.countryAt });
    t.signedAt = ctx.now;
    s.treatiesSigned = [...(s.treatiesSigned || []), { ...t }].slice(-30);
    news(s, ctx, `${t.title} signed by ${t.parties.map(id => C(s, id).name).join(', ')}`, `توقيع ${t.title}`, 5);
    log(s, ctx, `Treaty signed: ${t.title}`);
    return ok({ treaty: t, signedAll: true });
  } },
  treatyClear: { perm: 'zeus', run(s) { s.draftTreaty = null; return ok(); } },
  noteAdd: { perm: 'zeus', run(s, a, ctx) { log(s, ctx, String(a.text || '').slice(0, 300)); return ok(); } },

  // ---------- Kronos sandbox ----------
  setTension: { perm: 'zeus', run(s, a, ctx) {
    const from = s.global.tension, to = clamp(Math.round(Number(a.value) * 2) / 2, 0, 10);
    if (!Number.isFinite(to)) return err('Pick a tension level from 0 to 10.');
    s.global.tension = to;
    log(s, ctx, `${ctx.role === 'kronos' ? 'Kronos' : 'Zeus'} set world tension to ${to}`);
    if (to === from) return ok();
    sandboxFx(s, ctx, [{ kind: 'tension', from, to }]);
    return ok({ broadcastAnim: true });
  } },
  setOil: { perm: 'kronos', run(s, a) { s.global.oilPrice = clamp(Number(a.value) || 82, 10, 400); return ok(); } },
  setStat: { perm: 'kronos', run(s, a, ctx) {
    const c = C(s, a.country), r = STAT_FIELDS[a.field]; if (!c || !r) return err('Unknown country or field.');
    c[a.field] = clamp(Number(a.value), r[0], r[1]); log(s, ctx, `Kronos set ${c.name} ${a.field} to ${c[a.field]}`); return ok();
  } },
  setFlag: { perm: 'kronos', run(s, a) {
    const c = C(s, a.country); if (!c) return err('Unknown country.');
    if (a.flag === 'nuclear') c.nuclear.has = !!a.value;
    else if (a.flag === 'stealth' || a.flag === 'veto') c[a.flag] = !!a.value;
    else if (a.flag === 'capitulated') { c.capitulated = !!a.value; if (a.value) s.wars = s.wars.filter(w => w.a !== c.id && w.b !== c.id); }
    else if (a.flag === 'occupiedBy') { c.occupiedBy = C(s, a.value) ? a.value : null; c.front = null; }
    else return err('Unknown flag.');
    return ok();
  } },
  spawnUnits: { perm: 'kronos', run(s, a, ctx) {
    const c = C(s, a.country); if (!c || !UNIT_TYPES[a.unitType]) return err('Pick a country and unit type.');
    const sea = UNIT_TYPES[a.unitType].domain === 'sea';
    let loc;
    if (sea) { const z = SEA_ZONES[a.zone] ? a.zone : zonesTouching(c.id)[0]; if (!z) return err(`${c.name} has no coastline. Pick a sea zone.`); loc = { kind: 'sea', id: z }; }
    else loc = { kind: 'country', id: C(s, a.at) ? a.at : c.id };
    const n = clamp(Math.round(Number(a.count) || 1), 1, 20);
    for (let i = 0; i < n; i++) {
      const id = newId(s, 'u'); s.units[id] = { id, type: a.unitType, owner: c.id, loc: { ...loc }, strength: 100, blockade: false, cap: false };
      if (a.unitType === 'carrier') { const name = carrierName(s.units, c.a3); if (name) s.units[id].name = name; }
    }
    log(s, ctx, `Kronos spawned ${n} ${UNIT_TYPES[a.unitType].name.toLowerCase()} for ${c.name}`);
    const spot = sea ? { lat: SEA_ZONES[loc.id].lat, lon: SEA_ZONES[loc.id].lon } : at(C(s, loc.id));
    sandboxFx(s, ctx, [{ kind: 'spawn', country: c.id, unitType: a.unitType, n, at: spot }]);
    return ok({ broadcastAnim: true });
  } },
  removeUnit: { perm: 'kronos', run(s, a) { if (!s.units[a.id]) return err('Unknown unit.'); delete s.units[a.id]; return ok(); } },
  moveUnit: { perm: 'kronos', run(s, a) {
    const u = s.units[a.id]; if (!u) return err('Unknown unit.');
    if (a.zone && SEA_ZONES[a.zone]) u.loc = { kind: 'sea', id: a.zone };
    else if (a.country && C(s, a.country)) u.loc = { kind: 'country', id: a.country };
    else return err('Pick where to move it.');
    return ok();
  } },
  setUnit: { perm: 'kronos', run(s, a) {
    const u = s.units[a.id]; if (!u) return err('Unknown unit.');
    if (a.strength !== undefined) u.strength = clamp(Math.round(a.strength), 1, 200);
    if (a.owner && C(s, a.owner)) u.owner = a.owner;
    return ok();
  } },
  forceWar: { perm: 'kronos', run(s, a, ctx) {
    if (!C(s, a.a) || !C(s, a.b)) return err('Pick two countries.');
    const ev = []; declareWar(s, a.a, a.b, ev, 'declared');
    for (const id of warClosures(s, a.a, a.b)) s.global.closedAirspace[id] ||= { turn: s.meta.turn, at: ctx.now, war: true };
    news(s, ctx, `BREAKING: ${C(s, a.a).name} declares war on ${C(s, a.b).name}`, `عاجل: ${C(s, a.a).ar} تعلن الحرب على ${C(s, a.b).ar}`, 6);
    sandboxFx(s, ctx, ev.filter(e => e.kind === 'war').length ? ev.filter(e => e.kind === 'war') : [{ kind: 'war', a: a.a, b: a.b }]);
    return ok({ broadcastAnim: true });
  } },
  forcePeace: { perm: 'kronos', run(s, a, ctx) {
    const pairs = a.all ? s.wars.map(w => [w.a, w.b]) : [[a.a, a.b]];
    for (const [x, y] of pairs) {
      s.wars = s.wars.filter(w => !((w.a === x && w.b === y) || (w.a === y && w.b === x))); shiftRelation(s, x, y, 40);
      for (const [p, q] of [[x, y], [y, x]]) if (s.countries[p]?.front?.by === q) clearFront(s, s.countries[p], q);
    }
    log(s, ctx, a.all ? 'Kronos ended every war' : `Kronos ended the war between ${C(s, a.a)?.name} and ${C(s, a.b)?.name}`);
    sandboxFx(s, ctx, pairs.slice(0, 30).map(([x, y]) => ({ kind: 'peace', a: x, b: y })));
    return ok({ broadcastAnim: true });
  } },
  setFront: { perm: 'kronos', run(s, a, ctx) {
    const c = C(s, a.country), by = C(s, a.by); if (!c || !by || c === by) return err('Pick two countries.');
    const pct = clamp(Number(a.pct) || 0, 0, 99);
    if (!hasGeo()) {
      if (!pct) { c.front = null; return ok(); }
      const prev = c.front?.by === a.by ? c.front.pct : 0;
      c.front = { by: a.by, pct, prev, from: c.front?.by === a.by ? c.front.from : { lat: by.lat, lon: by.lon }, turn: s.meta.turn, mode: c.front?.mode || 'auto' };
      return ok();
    }
    // Sets the share exactly: grow or shrink the attacker's ground until it covers pct of the country.
    const total = cellsOf(c.id).length, want = Math.round((pct / 100) * total), have = holdings(s, c.id).held[a.by] || 0;
    if (want > have) advance(s, a.by, c.id, want - have, { target: c.id, from: { lat: by.lat, lon: by.lon }, toward: { lat: c.lat, lon: c.lon } });
    else if (want < have) advance(s, c.id, a.by, have - want, { liberateOnly: true, toward: { lat: by.lat, lon: by.lon } });
    const ev = []; syncFront(s, c, ev);
    publishInstant(s, ev, ctx);
    log(s, ctx, `Kronos set ${by.name}'s hold on ${c.name} to ${pct}%`);
    return ok({ broadcastAnim: true });
  } },
  // A Zeus paints ground by hand: 'take' hands the cells to a side, 'restore' gives them back to their country.
  paintControl: { perm: 'zeus', run(s, a, ctx) {
    const owner = C(s, a.owner); if (!owner && a.mode !== 'restore') return err('Pick which side takes the ground.');
    if (!hasGeo()) return err('Territory painting is not available here.');
    const keys = Array.isArray(a.keys) ? a.keys : [];
    const touched = paintCells(s, a.owner, keys, a.mode === 'restore' ? 'restore' : 'take');
    if (!touched.length) return err(a.mode === 'restore' ? 'Nothing to give back there.' : `${owner.name} can only take ground from countries it is at war with.`);
    const ev = [];
    for (const id of touched) syncFront(s, C(s, id), ev);
    publishInstant(s, ev, ctx);
    log(s, ctx, a.mode === 'restore' ? `Ground handed back in ${touched.map(id => C(s, id).name).join(', ')}` : `${owner.name} takes ground in ${touched.map(id => C(s, id).name).join(', ')}`);
    return ok({ broadcastAnim: true });
  } },
  // Civil war: part of a country's army breaks away as a rebel faction that holds its own ground.
  civilWar: { perm: 'zeus', run(s, a, ctx) {
    const P = C(s, a.country); if (!P) return err('Pick the country that splits.');
    if (P.rebelOf) return err('Rebels cannot split again.');
    const id = `${P.id}r`;
    if (s.countries[id] && s.countries[id].control !== 'inactive' && atWar(s, id, P.id)) return err(`${P.name} is already in a civil war.`);
    const share = clamp(Number(a.share) || 30, 5, 80);
    const name = String(a.name || '').trim().slice(0, 40) || `${P.name} Rebels`;
    const ar = String(a.ar || '').trim().slice(0, 40) || `متمردو ${P.ar}`;
    const bloc = BLOCS.includes(a.bloc) ? a.bloc : (P.bloc === 'A' ? 'B' : P.bloc === 'B' ? 'A' : 'C');
    const R = {
      ...structuredClone(P), id, a3: `${P.a3}-R`, name, ar, rebelOf: P.id, bloc, control: 'ai', delegate: '',
      base: { ...P.base, gdp: P.base.gdp * share / 100, pop: P.base.pop * share / 100 }, gdp: P.gdp * share / 100, treasury: Math.round(Math.max(0, P.treasury) * 0.1),
      support: 60, stability: 40, alliances: [], veto: false, nuclear: { has: false, alert: false }, influence: Math.round(P.influence * 0.4),
      front: null, occupiedBy: null, capitulated: false, sanctions: [], overflight: [], intel: {}, cyber: {}, casualties: 0, refugees: 0, damage: 0, warWeariness: 0, airDefense: Math.max(1, Math.round(P.airDefense / 3)),
    };
    s.countries[id] = R;
    // Rebels border everything the country borders, and the country itself.
    s.adjacency[id] = [...new Set([P.id, ...(s.adjacency[P.id] || [])])];
    for (const n of s.adjacency[id]) if (s.adjacency[n] && !s.adjacency[n].includes(id)) s.adjacency[n].push(id);
    // A share of the army defects.
    const armies = Object.values(s.units).filter(u => u.owner === P.id && u.type === 'army' && u.loc.kind === 'country' && u.loc.id === P.id);
    armies.slice(0, Math.max(1, Math.round(armies.length * share / 100))).forEach(u => { u.owner = id; });
    const jets = Object.values(s.units).filter(u => u.owner === P.id && u.type === 'fighter');
    jets.slice(0, Math.floor(jets.length * share / 200)).forEach(u => { u.owner = id; });
    s.wars.push({ a: id, b: P.id, since: s.meta.turn, civil: true });
    shiftRelation(s, id, P.id, -100);
    P.stability = clamp(P.stability - 25, 0, 100); P.support = clamp(P.support - 10, 0, 100);
    if (warClosures(s, id, P.id).includes(P.id)) s.global.closedAirspace[P.id] ||= { turn: s.meta.turn, at: ctx.now, war: true };
    const ev = [{ kind: 'civil_war', country: P.id, rebels: id }];
    // The rebels rise far from the capital, or where the Zeus clicked.
    if (hasGeo()) {
      const cells = cellsOf(P.id);
      let seed = a.at && Number.isFinite(a.at.lat) ? a.at : null;
      if (!seed && cells.length) {
        // The far end of the mainland, so the rising does not start (and stay stuck) on a distant island.
        let best = null, bd = -1;
        for (const k of mainland(P.id, P)) {
          const [lon, lat] = cellCenter(k); let dl = Math.abs(lon - P.lon); if (dl > 180) dl = 360 - dl;
          const d = (dl * Math.cos(lat * Math.PI / 180)) ** 2 + (lat - P.lat) ** 2; if (d > bd) { bd = d; best = { lat, lon }; }
        }
        seed = best;
      }
      const n = Math.max(1, Math.round(cells.length * share / 100));
      advance(s, id, P.id, n, { target: P.id, from: seed, toward: seed });
      const c = heldCenter(s, P.id, id); if (c) { R.lat = c.lat; R.lon = c.lon; }
      syncFront(s, P, ev);
    } else {
      P.front = { by: id, pct: share, prev: 0, from: { lat: P.lat, lon: P.lon }, turn: s.meta.turn, mode: 'auto' };
    }
    publishInstant(s, ev, ctx);
    log(s, ctx, `Civil war: ${name} break away from ${P.name}`);
    return ok({ broadcastAnim: true });
  } },
  setRelation: { perm: 'kronos', run(s, a) { if (!C(s, a.a) || !C(s, a.b)) return err('Pick two countries.'); s.relations[[a.a, a.b].sort().join('|')] = clamp(Number(a.value) || 0, -100, 100); return ok(); } },
  setChokepoint: { perm: 'kronos', run(s, a) {
    const cp = s.global.chokepoints[a.zone]; if (!cp) return err('Not a chokepoint.');
    if (!['auto', 'open', 'contested', 'closed'].includes(a.status)) return err('Auto, open, contested or closed.');
    // A forced status holds through turn resolution until Kronos hands it back to the fleets.
    if (a.status === 'auto') { cp.forced = false; return ok(); }
    cp.status = a.status; cp.by = a.status === 'open' ? null : (C(s, a.by) ? a.by : cp.by); cp.forced = true;
    return ok();
  } },
  setAirspace: { perm: 'kronos', run(s, a, ctx) {
    if (!C(s, a.country)) return err('Unknown country.');
    if (a.closed) s.global.closedAirspace[a.country] = { turn: s.meta.turn, at: ctx.now, forced: true }; else delete s.global.closedAirspace[a.country];
    return ok();
  } },
  setWeather: { perm: 'kronos', run(s, a, ctx) {
    if (!C(s, a.country)) return err('Unknown country.');
    if (a.kind === 'storm') s.global.weather[a.country] = 'storm'; else delete s.global.weather[a.country];
    if (a.kind !== 'storm') return ok();
    sandboxFx(s, ctx, [{ kind: 'act', act: 'storm', country: a.country, at: at(C(s, a.country)) }]);
    return ok({ broadcastAnim: true });
  } },
  setNukeOverride: { perm: 'kronos', run(s, a, ctx) { s.global.nukeOverride = !!a.value; log(s, ctx, `Kronos ${a.value ? 'unlocked' : 'locked'} nuclear weapons below tension 10`); return ok(); } },
  setAiNukes: { perm: 'kronos', run(s, a) { s.settings.aiNukes = !!a.value; return ok(); } },
  disaster: { perm: 'kronos', run(s, a, ctx) {
    const c = C(s, a.country), d = DISASTERS[a.kind]; if (!c || !d) return err('Pick a country and event.');
    c.gdp = Math.max(0.5, c.gdp * (1 - d.gdp));
    if (d.industry) c.industry = clamp(c.industry - d.industry, 0.05, 1.2);
    if (d.energy) c.energy = clamp(c.energy - d.energy, 0.05, 1.2);
    c.support = clamp(c.support - d.support, 0, 100);
    if (d.stability) c.stability = clamp(c.stability - d.stability, 0, 100);
    if (a.kind === 'coup') { c.roe = 'forward'; c.support = 35; }
    if (a.kind === 'discovery') c.oilNet = round1((c.oilNet || 0) + 2);
    // Blackouts and outbreaks stay until Kronos ends them.
    if (a.kind === 'blackout') c.blackout = { since: s.meta.turn };
    if (a.kind === 'pandemic') c.outbreak = { level: Math.max(c.outbreak?.level || 0, 30), since: c.outbreak?.since ?? s.meta.turn };
    const mag = a.kind === 'earthquake' ? round1(6.6 + Math.random() * 1.6) : null;
    const en = mag ? `A magnitude ${mag} earthquake strikes` : d.en, ar = mag ? `زلزال بقوة ${mag} درجات يضرب` : d.ar;
    news(s, ctx, `${en} ${c.name}`, `${ar} ${c.ar}`, 5);
    log(s, ctx, `Kronos event: ${a.kind} in ${c.name}`);
    // Earthquakes and floods hit somewhere in the country; the rest centre on the capital.
    const where = ['earthquake', 'flood', 'discovery'].includes(a.kind) ? spotIn(s, c) : at(c);
    sandboxFx(s, ctx, [{ kind: 'act', act: a.kind, country: c.id, at: where, mag }]);
    return ok({ broadcastAnim: true });
  } },
  // Running an outbreak: make it worse, ease it, spread it to every neighbour, or end it.
  outbreak: { perm: 'kronos', run(s, a, ctx) {
    const c = C(s, a.country); if (!c) return err('Pick a country.');
    const lvl = c.outbreak?.level || 0;
    if (a.op === 'up') { c.outbreak = { level: clamp(lvl + 20, 10, 100), since: c.outbreak?.since ?? s.meta.turn }; }
    else if (a.op === 'down') { const v = lvl - 20; c.outbreak = v > 0 ? { ...c.outbreak, level: v } : null; }
    else if (a.op === 'end') c.outbreak = null;
    else if (a.op === 'spread') {
      if (!lvl) return err(`There is no outbreak in ${c.name} to spread.`);
      const to = (s.adjacency[c.id] || []).map(id => C(s, id)).filter(n => n && !n.rebelOf && (n.outbreak?.level || 0) < lvl * 0.6);
      if (!to.length) return err('Every neighbour already has it.');
      for (const n of to) { n.outbreak = { level: Math.round(Math.max(n.outbreak?.level || 0, lvl * 0.6)), since: n.outbreak?.since ?? s.meta.turn }; n.support = clamp(n.support - 3, 0, 100); }
      news(s, ctx, `The outbreak spreads from ${c.name} to ${to.map(n => n.name).join(', ')}`, `الوباء ينتشر من ${c.ar} إلى ${to.map(n => n.ar).join('، ')}`, 5);
      sandboxFx(s, ctx, to.map(n => ({ kind: 'act', act: 'pandemic', country: n.id, at: at(n), from: at(c) })));
      return ok({ broadcastAnim: true });
    } else return err('Up, down, spread or end.');
    if (a.op === 'end' || !c.outbreak) news(s, ctx, `The outbreak in ${c.name} is declared over`, `إعلان انتهاء الوباء في ${c.ar}`, 3);
    log(s, ctx, `Kronos set the outbreak in ${c.name} to ${c.outbreak?.level || 0}%`);
    return ok();
  } },
  endAllOutbreaks: { perm: 'kronos', run(s, a, ctx) {
    const hit = Object.values(s.countries).filter(c => c.outbreak); if (!hit.length) return err('There are no outbreaks.');
    for (const c of hit) c.outbreak = null;
    news(s, ctx, hit.length === 1 ? `The outbreak in ${hit[0].name} is declared over` : `The WHO declares the outbreak over in ${hit.length} countries`, hit.length === 1 ? `إعلان انتهاء الوباء في ${hit[0].ar}` : `منظمة الصحة العالمية تعلن انتهاء الوباء في ${hit.length} دولة`, 4);
    log(s, ctx, `Kronos ended every outbreak (${hit.map(c => c.name).join(', ')})`);
    return ok();
  } },
  restoreAllPower: { perm: 'kronos', run(s, a, ctx) {
    const hit = Object.values(s.countries).filter(c => c.blackout); if (!hit.length) return err('There are no blackouts.');
    for (const c of hit) c.blackout = null;
    news(s, ctx, `Power is restored across ${hit.map(c => c.name).join(', ')}`, `عودة التيار الكهربائي في ${hit.map(c => c.ar).join('، ')}`, 3);
    return ok();
  } },
  restorePower: { perm: 'kronos', run(s, a, ctx) {
    const c = C(s, a.country); if (!c?.blackout) return err('No blackout there.');
    c.blackout = null; news(s, ctx, `Power is restored across ${c.name}`, `عودة التيار الكهربائي في ${c.ar}`, 3);
    return ok();
  } },
  smite: { perm: 'kronos', run(s, a, ctx) {
    // A strike with no units behind it: for when the story needs something to happen now.
    const T = C(s, a.target); if (!T) return err('Pick a target.');
    const ev = [];
    applyStrikeDamage(s, T, a.category || 'military', clamp(Number(a.power) || 1, 1, 5) * 0.08, ev, C(s, a.from) ? a.from : null);
    T.lastStruck = s.meta.turn;
    s.lastResolution = { turn: s.meta.turn, at: ctx.now, instant: true, events: [{ kind: 'strike', owner: a.from || null, target: T.id, from: C(s, a.from) ? { lat: C(s, a.from).lat, lon: C(s, a.from).lon } : null, to: { lat: T.lat, lon: T.lon }, intercepted: false, unitType: 'missile', divine: true }] };
    return ok({ broadcastAnim: true });
  } },
  forceOrder: { perm: 'kronos', run(s, a, ctx) {
    // Run any order immediately, skipping the queue.
    const src = a.order || {};
    let o = { id: newId(s, 'o'), country: src.country, type: src.type, target: src.target || null, zone: src.zone || null, category: src.category || 'military', amount: Number(src.amount) || 0, unitType: src.unitType, kind: src.kind, terms: src.terms || null, by: ctx.user, at: ctx.now };
    o = autoUnits(s, o, src.counts || {});
    const v = validateOrder(s, o); if (!v.ok) return err(v.reason);
    resolveNow(s, [o], { ...ctx, countryAt: ctx.geo?.countryAt });
    return ok({ broadcastAnim: true, text: describeOrder(s, o) });
  } },
  setClock: { perm: 'kronos', run(s, a) {
    if (a.clock && /^\d{4}-\d{2}-\d{2}$/.test(a.clock)) s.meta.clock = a.clock;
    if (a.turnDays) s.meta.turnDays = clamp(Math.round(a.turnDays), 1, 90);
    return ok();
  } },
  setKronosNote: { perm: 'kronos', run(s, a) { s.kronos.note = String(a.text || '').slice(0, 500); return ok(); } },
  kronosBanner: { perm: 'kronos', run(s, a, ctx) {
    const text = String(a.text || '').slice(0, 160);
    s.display.banner = text ? { text, ar: String(a.ar || '').slice(0, 160), tone: 'dark', at: ctx.now, kronos: true } : null;
    return ok();
  } },
};

// Actions shared by every committee mode.
const COMMON = {
  setEye: { perm: 'kronos', run(s, a, ctx) { s.kronos.eye = !!a.value; s.kronos.eyeAt = ctx.now; return ok(); } },
  setLock: { perm: 'kronos', run(s, a, ctx) { s.kronos.locked = !!a.value; log(s, ctx, a.value ? 'Kronos locked the Zeus panels' : 'Kronos unlocked the Zeus panels'); return ok(); } },
  rename: { perm: 'kronos', run(s, a) { const n = String(a.name || '').trim().slice(0, 60); if (!n) return err('Give it a name.'); s.name = n; return ok(); } },
};

export function actionsFor(state) {
  return { ...COMMON, ...(state.mode === 'court' ? { ...courtActions, ...pick(WORLD, ['setScene', 'setBanner', 'setSetting', 'timerSet', 'timerStart', 'timerPause', 'timerReset', 'timerAdd', 'timerHide', 'noteAdd', 'kronosBanner', 'setKronosNote', 'playEnding']) } : WORLD) };
}

function pick(obj, keys) { return Object.fromEntries(keys.filter(k => obj[k]).map(k => [k, obj[k]])); }

// ctx: { role: 'stage'|'backroom'|'kronos', user, now, geo }
// Any action naming Israel or Palestine is refused, whoever sends it.
function touchesOOB(a) {
  const ids = [a.country, a.target, a.a, a.b, a.by, a.at, a.owner, a.order?.country, a.order?.target, ...(Array.isArray(a.countries) ? a.countries : []), ...(Array.isArray(a.parties) ? a.parties : [])];
  return ids.some(id => typeof id === 'string' && isOOB(id));
}

export function applyAction(state, action, ctx) {
  const def = actionsFor(state)[action?.type];
  if (!def) return err(`Unknown action "${action?.type}".`);
  if (def.perm === 'kronos' && ctx.role !== 'kronos') return err('Only Kronos can do that.');
  if (state.kronos.locked && ctx.role !== 'kronos' && !def.readOnly) return err('Kronos has locked this panel.');
  if (!def.readOnly && touchesOOB(action)) return err(OOB_ERROR);
  bindGeo(ctx.geo);
  try {
    const r = def.run(state, action, ctx);
    if (r.ok && !def.readOnly) state.version = (state.version || 0) + 1;
    return { ...r, snapshot: !!def.snapshot, readOnly: !!def.readOnly };
  } catch (e) {
    return err(`Something went wrong: ${e.message}`);
  }
}

export const ACTION_LIST = { world: Object.fromEntries(Object.entries({ ...COMMON, ...WORLD }).map(([k, v]) => [k, v.perm])) };
export { SCENES, DISASTERS };
