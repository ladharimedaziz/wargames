// The quick command bar. A Zeus types what the chair just said, e.g. "russia strike france 3 bombers industry escort 2",
// and gets back actions plus a plain-English preview before pressing Enter.
import { ALIASES } from '../data/countries.js';
import { SEA_ZONES } from '../data/places.js';
import { UNIT_TYPES } from './core.js';

const VERBS = [
  ['unsanction', ['unsanction', 'unsanctions', 'lift sanctions', 'lifts sanctions', 'drop sanctions', 'drops sanctions']],
  ['lift', ['lift blockade', 'lifts blockade', 'end blockade', 'lift']],
  ['war', ['declare war', 'declares war', 'declares war on', 'declare war on', 'war on', 'war']],
  ['nuke', ['nuke', 'nukes', 'nuclear strike', 'nuclear launch', 'launch nuclear']],
  ['alert', ['nuclear alert', 'alert']],
  ['strike', ['strike', 'strikes', 'bomb', 'bombs', 'attack', 'attacks', 'hit', 'hits', 'airstrike', 'airstrikes', 'shell', 'shells']],
  ['invade', ['invade', 'invades', 'invasion of', 'invasion', 'march into', 'marches into', 'push into', 'pushes into', 'send troops to', 'sends troops to', 'move troops to', 'moves troops to']],
  ['blockade', ['blockade', 'blockades', 'close', 'closes', 'seal', 'seals']],
  ['fleet', ['sail to', 'sails to', 'sail', 'sails', 'move fleet to', 'moves fleet to', 'fleet to', 'navy to', 'deploy fleet to', 'deploys fleet to']],
  ['rebase', ['rebase', 'rebases', 'redeploy', 'redeploys', 'deploy', 'deploys', 'station', 'stations', 'base']],
  ['cap', ['air patrol', 'air patrols', 'patrol', 'patrols', 'cap']],
  ['ceasefire', ['ceasefire', 'cease fire', 'truce', 'armistice']],
  ['peace', ['peace treaty', 'peace', 'make peace']],
  ['alliance', ['alliance', 'ally', 'allies with', 'ally with', 'allies', 'form alliance', 'forms alliance']],
  ['sanction', ['sanction', 'sanctions', 'embargo', 'embargoes']],
  ['trade', ['trade deal', 'trade', 'trades']],
  ['aid', ['aid', 'sends aid to', 'send aid to', 'fund', 'funds', 'loan', 'loans', 'pay', 'pays', 'give money', 'gives money']],
  ['arms', ['arms', 'sell', 'sells', 'give', 'gives', 'transfer', 'transfers', 'supply', 'supplies', 'arm', 'arms deal']],
  ['overflight', ['overflight', 'basing rights', 'grant overflight', 'grants overflight', 'airspace to', 'open airspace']],
  ['cyber', ['cyber attack', 'cyberattack', 'cyber', 'hack', 'hacks']],
  ['intel', ['intel', 'intelligence', 'recon', 'spy on', 'spies on', 'surveil', 'surveils']],
  ['spy', ['spy', 'spies', 'sabotage', 'sabotages', 'steal', 'steals', 'defector', 'covert op']],
  ['satellite', ['blind satellites', 'blind', 'blinds', 'satellite', 'satellites', 'asat']],
  ['propaganda', ['propaganda', 'disinformation', 'campaign']],
  ['roe', ['roe', 'rules of engagement', 'posture']],
  ['election', ['election', 'elections', 'snap election', 'calls election', 'call election', 'vote']],
];
const UNIT_WORDS = {
  bomber: ['bomber', 'bombers'], fighter: ['fighter', 'fighters', 'jet', 'jets', 'planes', 'plane', 'aircraft'], missile: ['missile', 'missiles', 'rocket', 'rockets'],
  army: ['army', 'armies', 'troops', 'division', 'divisions', 'brigade', 'brigades', 'tanks'], fleet: ['fleet', 'fleets', 'ships', 'navy', 'warships', 'destroyers'],
  carrier: ['carrier', 'carriers'], airdef: ['air defence', 'air defense', 'sam', 'sams', 'patriot', 'patriots'],
};
const CATEGORY_WORDS = {
  military: ['military', 'bases', 'base', 'troops'], industry: ['industry', 'factories', 'factory', 'industrial'],
  energy: ['energy', 'oil', 'power', 'refinery', 'refineries', 'grid', 'pipelines'], infrastructure: ['infrastructure', 'bridges', 'ports', 'rail'], capital: ['capital', 'government', 'leadership'],
};
const KIND_WORDS = { grid: ['grid', 'power'], banks: ['banks', 'bank', 'finance', 'banking'], radar: ['radar', 'radars', 'air defence', 'air defense'], steal: ['steal', 'steals', 'tech', 'secrets'], sabotage: ['sabotage', 'sabotages'], defector: ['defector', 'defect', 'turn'], defensive: ['defensive', 'restrained'], firm: ['firm', 'normal'], forward: ['forward', 'aggressive', 'offensive'] };
const ZONE_ALIASES = { hormuz: 'hormuz', 'strait of hormuz': 'hormuz', 'bab el mandeb': 'bab', 'bab al mandab': 'bab', 'bab el-mandeb': 'bab', mandeb: 'bab', suez: 'suez', 'suez canal': 'suez', bosporus: 'bosporus', bosphorus: 'bosporus', gibraltar: 'gibraltar', panama: 'panama', 'panama canal': 'panama', malacca: 'malacca', 'strait of malacca': 'malacca', danish: 'danish', 'danish straits': 'danish' };

const A3_STOP = new Set(['CAN', 'AND', 'PER', 'ARM', 'NOR', 'MAR', 'PAN', 'GAB', 'COM', 'FIN', 'TON', 'BEN', 'TOGO']);
const norm = t => t.toLowerCase().replace(/[’']/g, '').replace(/[^\p{L}\p{N}:$.\s-]/gu, ' ').replace(/\s+/g, ' ').trim();

// Phrase dictionary: country names, aliases, ISO codes and sea zones, matched longest first.
const dictCache = new WeakMap();
function dictionary(state) {
  if (dictCache.has(state.countries)) return dictCache.get(state.countries);
  const d = new Map();
  const add = (phrase, val) => { const p = norm(phrase); if (p && !d.has(p)) d.set(p, val); };
  for (const [k, z] of Object.entries(ZONE_ALIASES)) add(k, { zone: z });
  for (const c of Object.values(state.countries)) { add(c.name, { country: c.id }); if (c.ar) add(c.ar, { country: c.id }); }
  for (const [k, id] of Object.entries(ALIASES)) if (state.countries[id]) add(k, { country: id });
  for (const c of Object.values(state.countries)) if (c.a3 && !A3_STOP.has(c.a3)) add(c.a3, { country: c.id });
  for (const [k, z] of Object.entries(SEA_ZONES)) { add(z.name, { zone: k }); add(z.name.replace(/^the /i, ''), { zone: k }); add(k, { zone: k }); if (z.ar) add(z.ar, { zone: k }); }
  dictCache.set(state.countries, d);
  return d;
}

function scan(words, phrases, i) {
  for (let len = Math.min(5, words.length - i); len > 0; len--) {
    const p = words.slice(i, i + len).join(' ');
    if (phrases.has(p)) return { len, val: phrases.get(p) };
  }
  return null;
}

const verbMap = new Map(VERBS.flatMap(([type, list]) => list.map(w => [w, { verb: type }])));
const unitMap = new Map(Object.entries(UNIT_WORDS).flatMap(([t, l]) => l.map(w => [w, { unit: t }])));
const catMap = new Map(Object.entries(CATEGORY_WORDS).flatMap(([t, l]) => l.map(w => [w, { category: t }])));
const kindMap = new Map(Object.entries(KIND_WORDS).flatMap(([t, l]) => l.map(w => [w, { kind: t }])));

// Splits a sentence into typed tokens: countries, zones, verbs, unit words, numbers.
function tokenize(state, text) {
  const words = norm(text).split(' ').filter(Boolean);
  const dict = dictionary(state);
  const out = [];
  for (let i = 0; i < words.length;) {
    const w = words[i];
    const num = w.match(/^\$?(\d+(?:\.\d+)?)(bn|b|k)?$/);
    if (num) { out.push({ num: Number(num[1]), money: w.startsWith('$') || !!num[2] }); i++; continue; }
    const hit = scan(words, verbMap, i) || scan(words, dict, i) || scan(words, unitMap, i) || scan(words, catMap, i) || scan(words, kindMap, i);
    if (hit) { out.push({ ...hit.val, word: words.slice(i, i + hit.len).join(' ') }); i += hit.len; continue; }
    out.push({ word: w }); i++;
  }
  return out;
}

function parseDuration(str) {
  const m = str.match(/^(\d+):(\d{1,2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const n = str.match(/^(\d+(?:\.\d+)?)(s|sec|m|min|h)?$/);
  if (!n) return null;
  const v = Number(n[1]);
  return n[2] === 's' || n[2] === 'sec' ? v : n[2] === 'h' ? v * 3600 : v * 60; // bare numbers are minutes
}

// System commands that start with a keyword.
function system(state, raw, role) {
  const text = raw.trim();
  const [head, ...rest] = text.split(/\s+/);
  const h = head.toLowerCase();
  const tail = rest.join(' ');
  const countriesIn = s => tokenize(state, s).filter(t => t.country).map(t => t.country);
  const name = id => state.countries[id]?.name;
  switch (h) {
    case 'timer': case 't': {
      if (/^(stop|pause)$/i.test(tail)) return { actions: [{ type: 'timerPause' }], preview: 'Pause the timer' };
      if (/^(go|start|resume)$/i.test(tail)) return { actions: [{ type: 'timerStart' }], preview: 'Start the timer' };
      if (/^(hide|show)$/i.test(tail)) return { actions: [{ type: 'timerHide', visible: /show/i.test(tail) }], preview: `${tail} the timer` };
      const [dur, ...label] = rest; const sec = dur ? parseDuration(dur) : null;
      if (sec == null) return { error: 'Try "timer 5:00 Unmoderated caucus" or "timer 90s Speech".' };
      const lbl = label.join(' ');
      return { actions: [{ type: 'timerSet', seconds: sec, label: lbl }, { type: 'timerStart' }], preview: `Start a ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} timer${lbl ? ` labelled "${lbl}"` : ''}` };
    }
    case 'news': case 'headline': return tail ? { actions: [{ type: 'addNews', en: tail, priority: 4 }], preview: `Queue headline: "${tail}"` } : { error: 'Write the headline after "news".' };
    case 'breaking': return tail ? { actions: [{ type: 'addNews', en: `BREAKING: ${tail}`, priority: 7, airNow: true }], preview: `Air now: "BREAKING: ${tail}"` } : { error: 'Write the headline after "breaking".' };
    case 'banner':
      if (!tail || /^(off|clear|hide)$/i.test(tail)) return { actions: [{ type: 'setBanner', text: '' }], preview: 'Clear the banner' };
      return { actions: [{ type: 'setBanner', text: tail, tone: 'alert' }], preview: `Show banner: "${tail}"` };
    case 'resolve': case 'next': case 'endturn': return { actions: [{ type: 'resolveTurn' }], preview: `Resolve turn ${state.meta.turn} and advance ${state.meta.turnDays} days` };
    case 'player': case 'players': case 'ai': case 'inactive': {
      const ids = countriesIn(tail); if (!ids.length) return { error: 'Name the countries.' };
      const control = h.startsWith('player') ? 'player' : h;
      return { actions: ids.map(id => ({ type: 'setControl', country: id, control })), preview: `${ids.map(name).join(', ')} → ${control === 'player' ? 'delegate' : control === 'ai' ? 'computer' : 'inactive'}` };
    }
    case 'bloc': {
      const b = (rest[0] || '').toUpperCase(); const ids = countriesIn(rest.slice(1).join(' '));
      if (!['A', 'B', 'C', 'N'].includes(b) || !ids.length) return { error: 'Try "bloc A usa uk france".' };
      return { actions: ids.map(id => ({ type: 'setBloc', country: id, bloc: b })), preview: `${ids.map(name).join(', ')} join ${state.blocs[b].name}` };
    }
    case 'focus': case 'zoom': {
      if (!tail || /^(off|world|clear)$/i.test(tail)) return { actions: [{ type: 'setFocus' }], preview: 'Show the whole world' };
      const t = tokenize(state, tail).find(x => x.country || x.zone); if (!t) return { error: 'Focus on which country or sea?' };
      return { actions: [{ type: 'setFocus', country: t.country, zone: t.zone }], preview: `Zoom the display to ${name(t.country) || SEA_ZONES[t.zone].name}` };
    }
    case 'scene': case 'show': {
      const sc = { map: 'map', disguise: 'disguise', fisheries: 'disguise', intro: 'intro', reveal: 'reveal', report: 'report', blank: 'blank', black: 'blank', pause: 'pause', prayer: 'pause', vote: 'vote', treaty: 'treaty', polls: 'polls', web: 'web', relations: 'web' }[(rest[0] || '').toLowerCase()];
      return sc ? { actions: [{ type: 'setScene', scene: sc }], preview: `Switch the display to ${sc}` } : { error: 'Scenes: map, disguise, intro, reveal, report, pause, vote, treaty, polls, web, blank.' };
    }
    case 'intro': return { actions: [{ type: 'setScene', scene: 'intro' }], preview: 'Play the cinematic intro' };
    case 'reveal': return { actions: [{ type: 'setScene', scene: 'reveal' }], preview: 'Drop the disguise and reveal the crisis' };
    case 'pause': case 'humanitarian': {
      const n = Number(rest.find(x => /^\d+$/.test(x))) || 1;
      return { actions: [{ type: 'humanitarianPause', turns: n }], preview: `Humanitarian pause for ${n} week${n > 1 ? 's' : ''}` };
    }
    case 'tension': {
      if (role !== 'kronos') return { error: 'Only Kronos can set tension directly.' };
      const v = Number(rest[0]); if (!(v >= 0 && v <= 10)) return { error: 'Tension goes from 0 to 10.' };
      return { actions: [{ type: 'setTension', value: v }], preview: `Set Global Tension to ${v}` };
    }
    case 'oil': {
      if (role !== 'kronos') return { error: 'Only Kronos can set the oil price.' };
      const v = Number(String(rest[0] || '').replace('$', '')); if (!(v > 0)) return { error: 'Give a price, e.g. "oil 140".' };
      return { actions: [{ type: 'setOil', value: v }], preview: `Set oil to $${v}` };
    }
    case 'air': if (/^all$/i.test(tail)) return { actions: [{ type: 'airAll' }], preview: 'Air every pending headline' }; break;
    case 'note': return tail ? { actions: [{ type: 'noteAdd', text: tail }], preview: `Log note: "${tail}"` } : { error: 'Write the note.' };
  }
  return null;
}

export function parseCommand(state, text, role = 'stage') {
  const raw = String(text || '').trim();
  if (!raw) return { ok: false, error: '' };
  if (state.mode !== 'world') return { ok: false, error: 'The command bar works in world committees.' };
  const sys = system(state, raw, role);
  if (sys) return sys.error ? { ok: false, error: sys.error } : { ok: true, ...sys };

  const toks = tokenize(state, raw);
  const countries = toks.filter(t => t.country).map(t => t.country);
  const verbTok = toks.find(t => t.verb);
  let verb = verbTok?.verb;
  const zone = toks.find(t => t.zone)?.zone;
  const nums = toks.filter(t => t.num !== undefined);
  const unitToks = toks.filter(t => t.unit);
  const category = toks.find(t => t.category)?.category;
  const kind = toks.find(t => t.kind)?.kind;
  const words = toks.map(t => t.word);

  if (!countries.length) return { ok: false, error: 'Start with a country, e.g. "iran blockade hormuz" or "us sanction russia".' };
  // "lift" + "sanction" means lifting sanctions, not a blockade.
  if (verb === 'lift' && toks.some(t => t.verb === 'sanction')) verb = 'unsanction';
  if (verb === 'strike' && words.some(w => /^nuc/.test(w || ''))) verb = 'nuke';
  if (!verb && zone && unitToks.some(t => t.unit === 'fleet' || t.unit === 'carrier')) verb = 'fleet';
  if (!verb && kind && ['defensive', 'firm', 'forward'].includes(kind)) verb = 'roe';
  if (!verb) return { ok: false, error: 'What should happen? Try strike, invade, blockade, sail, sanction, war, ceasefire, peace, aid, arms, cyber, spy…' };

  const actor = countries[0];
  const target = countries.find(c => c !== actor) || null;
  const order = { country: actor, type: verb };
  const counts = {};
  // The number right after "escort" is the escort size; the first other number is the unit count or the amount.
  const escortIdx = toks.findIndex(t => /^escort/.test(t.word || '') || t.word === 'escorts');
  let escortNum = null;
  if (escortIdx >= 0) escortNum = toks.slice(escortIdx + 1).find(t => t.num !== undefined) || toks.slice(0, escortIdx).reverse().find(t => t.num !== undefined);
  const mainNum = nums.find(n => n !== escortNum);

  switch (verb) {
    case 'strike': case 'nuke':
      order.target = target; order.category = category || 'military';
      if (unitToks[0]) counts.type = unitToks.find(u => u.unit !== 'fighter' || unitToks.length === 1)?.unit || unitToks[0].unit;
      if (counts.type && !['bomber', 'missile', 'carrier', 'fighter'].includes(counts.type)) delete counts.type;
      if (mainNum) counts.n = Math.min(12, mainNum.num);
      if (escortIdx >= 0) counts.escort = Math.min(8, escortNum?.num || 1);
      break;
    case 'invade': case 'rebase':
      order.target = target || (verb === 'rebase' ? actor : null);
      if (verb === 'invade' && !target && countries.length === 1) order.target = actor; // "russia invade russia" = bring armies home
      counts.n = Math.min(10, mainNum?.num || 1);
      if (verb === 'rebase') counts.type = unitToks.find(u => ['fighter', 'bomber', 'missile', 'airdef'].includes(u.unit))?.unit || 'fighter';
      break;
    case 'fleet': case 'blockade':
      order.zone = zone; counts.n = Math.min(8, mainNum?.num || 1);
      if (unitToks.some(u => u.unit === 'carrier')) counts.type = 'carrier';
      if (!zone) return { ok: false, error: 'Which sea? e.g. "iran blockade hormuz", "us sail to south china sea".' };
      break;
    case 'aid': order.target = target; order.amount = mainNum?.num || 10; break;
    case 'arms': order.target = target; order.unitType = unitToks[0]?.unit || 'fighter'; break;
    case 'cyber': order.target = target; order.kind = ['grid', 'banks', 'radar'].includes(kind) ? kind : 'grid'; break;
    case 'spy': order.target = target; order.kind = ['steal', 'sabotage', 'defector'].includes(kind) ? kind : (verbTok.word.startsWith('sabot') ? 'sabotage' : verbTok.word.startsWith('steal') ? 'steal' : 'sabotage'); break;
    case 'roe': order.kind = ['defensive', 'firm', 'forward'].includes(kind) ? kind : null; if (!order.kind) return { ok: false, error: 'ROE is defensive, firm or forward.' }; break;
    case 'propaganda': order.target = target; break;
    default: order.target = target;
  }
  order.counts = counts;
  if (verb === 'peace') {
    order.terms = { returnTerritory: !words.includes('keep'), demilitarize: words.some(w => /^demil/.test(w || '')) };
    const rep = nums.find(n => n.money); if (rep) { order.terms.reparations = rep.num; order.terms.payer = actor; order.terms.payee = target; }
  }
  return { ok: true, actions: [{ type: 'queueOrder', order }], order, preview: null };
}

export const COMMAND_HELP = [
  ['russia strike ukraine 3 bombers energy escort 2', 'Air strike with chosen units, target type and fighter escort'],
  ['iran blockade hormuz 2', 'Blockade a sea zone with two fleets'],
  ['us sail to south china sea carrier', 'Move a carrier group'],
  ['china invade taiwan 3', 'Send three army groups (needs a land border or ships nearby)'],
  ['uk sanction russia · us lift sanctions iran', 'Economic pressure'],
  ['saudi aid yemen 20 · us arms ukraine fighter', 'Money and arms transfers'],
  ['israel cyber iran radar · uk spy russia sabotage', 'Covert operations'],
  ['egypt ceasefire israel · russia peace ukraine $50', 'Diplomacy (peace with reparations)'],
  ['france roe forward · india alert', 'Posture and nuclear alert'],
  ['timer 5:00 Unmoderated caucus', 'Labelled countdown on the display'],
  ['news Oil tankers turn back · breaking Embassy stormed', 'Queue or instantly air a headline'],
  ['player saudi uae qatar · ai russia', 'Hand countries to delegates or the computer'],
  ['bloc A usa uk · focus iran · resolve', 'Blocs, zoom the display, resolve the turn'],
];
export { UNIT_TYPES };
