// The continental US committee. Step one is the map: a layered view of the lower 48 that the Zeus steers and the stage shows.
import { clamp } from './core.js';
import { STATES, FEDERAL, STATE_INFO } from '../data/usa-units.js';
import { CROSSINGS } from '../data/usa-border.js';
import { UNIT_TYPES } from '../data/usa-types.js';
import { usaTick, SIM_SPEEDS, ROES, validSide, effSide, typeOf, inBox, isHostile, hostileKeyOf, sideName } from './usa-sim.js';

const err = error => ({ ok: false, error });
const ok = (r = {}) => ({ ok: true, ...r });
export const USA_LAYERS = ['states', 'cities', 'highways', 'labels', 'neighbors', 'border', 'uGov', 'uFed', 'uAgency', 'uGuard', 'uState', 'uCustom'];

// ---- Emergency lightbars ----
export const LIGHT_SERVICES = { police: 'Police', fire: 'Fire', ambulance: 'EMS' };
export const LIGHT_PALETTE = { red: '#ff2a2a', blue: '#2a5bff', white: '#ffffff', amber: '#ffb000', green: '#22d46a' };
const R = LIGHT_PALETTE.red, Bl = LIGHT_PALETTE.blue, W = LIGHT_PALETTE.white, A = LIGHT_PALETTE.amber;
// Starting colours, used where nothing more specific is set. Police run red and blue, fire and EMS red and white. Only the cases
// below are written down: Maine (statute: police blue, fire and ambulances red) and Arizona (police red forward and blue, fire red
// and white, volunteers amber or white). Everything else is an approximation the Zeus can correct per state.
export const LIGHT_DEFAULT = { police: [R, Bl], fire: [R, W], ambulance: [R, W] };
export const LIGHT_STATE = { 'ME:police': [Bl, W], 'ME:fire': [R, W], 'ME:ambulance': [R, W] };
// Flash patterns: steps of [colour index, milliseconds]; -1 is dark. Index 0 and 1 are the two colours of the bar.
export const LIGHT_PATTERNS = {
  alternate: { name: 'Alternate', steps: [[0, 130], [-1, 20], [1, 130], [-1, 20]] },
  wigwag: { name: 'Wig-wag (fast)', steps: [[0, 70], [1, 70]] },
  double: { name: 'Double flash', steps: [[0, 45], [-1, 45], [0, 45], [-1, 45], [1, 45], [-1, 45], [1, 45], [-1, 45]] },
  triple: { name: 'Triple burst', steps: [[0, 40], [-1, 40], [0, 40], [-1, 40], [0, 40], [-1, 110], [1, 40], [-1, 40], [1, 40], [-1, 40], [1, 40], [-1, 110]] },
  quad: { name: 'Quad flash', steps: [[0, 35], [-1, 35], [0, 35], [-1, 35], [0, 35], [-1, 35], [0, 35], [-1, 90], [1, 35], [-1, 35], [1, 35], [-1, 35], [1, 35], [-1, 35], [1, 35], [-1, 90]] },
  rotate: { name: 'Rotating', steps: [[0, 160], [-1, 40], [1, 160], [-1, 40], [2, 160], [-1, 40]] },
  strobe: { name: 'Strobe', steps: [[0, 25], [-1, 55], [1, 25], [-1, 55]] },
};
export const LIGHT_PATTERN_IDS = Object.keys(LIGHT_PATTERNS);
const isColors = c => Array.isArray(c) && c.length >= 1 && c.length <= 3 && c.every(x => /^#[0-9a-fA-F]{6}$/.test(x));
// A state's colours: a setting by the Zeus wins, then the written-down state cases, then the default.
export function lightColors(usa, service, state) {
  const o = usa.lightColors || {};
  return o[`${state}:${service}`] || LIGHT_STATE[`${state}:${service}`] || LIGHT_DEFAULT[service];
}

// ---- States: the numbers the Zeus steers, like a country card in the world committees ----
export const STATE_STATUS = { normal: 'Normal', alert: 'On alert', emergency: 'State of emergency', martial: 'Martial law' };
export const STATE_METRICS = { stability: 'Stability', economy: 'Economy', order: 'Public order', approval: 'Governor approval', federal: 'Relations with Washington' };
const STATE_DEFAULT = { stability: 80, economy: 70, order: 85, approval: 55, federal: 60, status: 'normal', note: '' };
// A state's facts: the fixed ones from the table, then the numbers and status the Zeus has changed.
export function getState(usa, code) {
  const row = STATES.find(r => r[0] === code); if (!row) return null;
  const [pop, ev] = STATE_INFO[code] || [0, 0];
  return { code, name: row[1], capital: row[2], pop, ev, ...STATE_DEFAULT, ...(usa.states?.[code] || {}) };
}

// ---- The border: two postures (one per neighbour) and each crossing's own status and traffic ----
export const BORDER_SIDES = { CAN: 'Canada', MEX: 'Mexico' };
export const BORDER_POSTURE = { open: 'Open', heightened: 'Heightened checks', closed: 'Closed' };
export const CROSSING_STATUS = { open: 'Open', slow: 'Slow', closed: 'Closed' };
export const CROSSING_LIST = CROSSINGS.map(([id, name, side, lon, lat, bearing, size]) => ({ id, name, side, lon, lat, bearing, size }));
const CROSSING_BY_ID = Object.fromEntries(CROSSING_LIST.map(c => [c.id, c]));
// What a crossing is doing now: its own setting, tightened by the posture of its side (a closed border closes every crossing on it,
// heightened checks slow the open ones). Traffic is 0 to 100; the wait is a rough estimate in minutes.
export function crossingState(usa, id) {
  const c = CROSSING_BY_ID[id]; if (!c) return null;
  const own = usa.crossings?.[id] || {}, posture = usa.border?.[c.side] || 'open';
  let status = own.status || 'open';
  if (posture === 'closed') status = 'closed'; else if (posture === 'heightened' && status === 'open') status = 'slow';
  const traffic = own.traffic ?? 50;
  const wait = status === 'closed' ? null : Math.round((8 + traffic * 0.5 + c.size * 6) * (status === 'slow' ? 3 : 1));
  return { ...c, status, own: own.status || 'open', traffic, wait };
}

export const USA_VIEW = { lon: -96.5, lat: 38.5, k: 1 }; // k = zoom, 1 shows the whole lower 48
export const USA_MAX_ZOOM = 24;

// ---- Units: governors, state forces and federal formations. Every one is a dot with a small badge above it. ----
// kind -> the layer that shows it, what it is called, and the zoom at which its dot and its badge appear.
export const USA_UNIT_KINDS = {
  governor: { layer: 'uGov', name: 'Governors', color: '#ffd166', dot: 1.2, label: 3 },
  military: { layer: 'uFed', name: 'Federal forces', color: '#7fbf6a', dot: 1, label: 3.5 },
  agency: { layer: 'uAgency', name: 'Federal agencies', color: '#b79cff', dot: 1.4, label: 4 },
  guard: { layer: 'uGuard', name: 'National Guard', color: '#b9a66a', dot: 2.5, label: 5 },
  police: { layer: 'uState', name: 'State police', color: '#4f9bff', dot: 4.5, label: 7 },
  custom: { layer: 'uCustom', name: 'Zeus-made units', color: '#ff8a5a', dot: 1, label: 3 },
};
// The drawn pictures a unit can use (see client/js/usa/art.js).
export const SILS = ['tank', 'infantry', 'fighter', 'bomber', 'helicopter', 'carrier', 'destroyer', 'ship', 'sub', 'missile', 'satellite', 'shield', 'guard', 'police', 'person', 'truck', 'fire', 'ambulance', 'artillery', 'crowd', 'plane'];
export const UNIT_LAYERS = Object.fromEntries(Object.values(USA_UNIT_KINDS).map(k => [k.layer, k.name]));
const AGENCIES = new Set(['fbi', 'dhs', 'fema', 'cdc', 'ice', 'cbp', 'usss', 'dea', 'atf', 'usms']);

// What kind of formation each federal catalog entry is.
const FED_TYPE = { '82nd': 'div_light', '101st': 'div_light', '10mtn': 'div_light', '1cav': 'division', '1ad': 'division', '1id': 'division', '3id': 'division', '4id': 'division', icorps: 'hq',
  '2mef': 'mef', '1mef': 'mef', norfolk: 'csg', sandiego: 'csg', mayport: 'ddg', kingsbay: 'ssn', bangor: 'ssn', oceana: 'air_wing', langley: 'f22_sqn', barksdale: 'bomber', whiteman: 'bomber', minot: 'bomber',
  malmstrom: 'icbm', warren: 'icbm', nellis: 'air_wing', edwards: 'air_wing', eglin: 'air_wing', offutt: 'hq', peterson: 'hq', macdill: 'hq', pentagon: 'hq', ngb: 'hq', meade: 'hq', cgatl: 'cg_area', cgpac: 'cg_area',
  fbi: 'fbi_hrt', dhs: 'hq', fema: 'usar', cdc: 'hq', ice: 'ice_team', cbp: 'bp_sector', usss: 'usss_detail', dea: 'atf_team', atf: 'atf_team', usms: 'marshals' };

function makeUnits() {
  const u = {};
  for (const [code, name, cap, lon, lat, gov, party, police] of STATES) {
    u[`gov-${code}`] = { id: `gov-${code}`, kind: 'governor', name: code === 'DC' ? 'Mayor of Washington' : `Governor of ${name}`, person: gov, party, short: gov, owner: code, lon, lat, type: 'vip', side: `st:${code}`, roe: 'hold', sil: 'person', img: `flag-${code}`, photo: null, desc: `${code === 'DC' ? 'Mayor' : 'Governor'} of ${name}, seated in ${cap}.`, strength: 100, control: 'ai', hidden: false };
    if (code === 'DC') continue; // the District has a mayor, but its Guard answers to the President
    u[`ng-${code}`] = { id: `ng-${code}`, kind: 'guard', name: `${name} National Guard`, short: `${code} Guard`, owner: code, lon: lon + 0.1, lat: lat + 0.07, type: 'ng_bct', side: `st:${code}`, roe: 'defend', sil: 'guard', img: 'ngb', desc: `The ${name} Army and Air National Guard, commanded by the governor until the President federalizes it.`, strength: 100, control: 'ai', hidden: false };
    u[`sp-${code}`] = { id: `sp-${code}`, kind: 'police', name: police, short: police, owner: code, lon: lon - 0.1, lat: lat - 0.07, type: 'state_patrol', side: `st:${code}`, roe: 'defend', sil: 'police', img: null, desc: `${police}, the state's highway and state police force.`, strength: 100, control: 'ai', hidden: false };
  }
  for (const [id, name, short, lon, lat, sil, img, desc] of FEDERAL) {
    u[`f-${id}`] = { id: `f-${id}`, kind: AGENCIES.has(id) || id.startsWith('bp-') ? 'agency' : 'military', name, short, owner: 'US', side: 'fed', type: id.startsWith('bp-') ? 'bp_sector' : FED_TYPE[id] || 'hq', roe: 'defend', lon, lat, sil, img, desc, strength: 100, control: 'ai', hidden: false };
  }
  return u;
}
// The starting roster is fixed data; a save only stores what the Zeus has changed (`mods`) and the units the Zeus has made (`custom`).
export const CATALOG = makeUnits();
export function getUnits(usa) {
  const out = {};
  for (const id in CATALOG) out[id] = usa.mods?.[id] ? { ...CATALOG[id], ...usa.mods[id] } : CATALOG[id];
  for (const id in usa.custom || {}) out[id] = usa.custom[id];
  return out;
}

// Fills in anything a save made by an older version lacks.
export function migrateUsa(s) {
  const u = s.usa; if (!u) return s;
  u.layers = { ...DEFAULT_LAYERS, ...Object.fromEntries(Object.entries(u.layers || {}).filter(([k]) => USA_LAYERS.includes(k))) };
  u.mods ||= {}; u.custom ||= {}; u.states ||= {}; u.border ||= { CAN: 'open', MEX: 'open' }; u.crossings ||= {};
  u.sim ||= { running: false, speed: 60, t: 0, at: 0 }; u.hostile ||= []; u.events ||= [];
  for (const c of Object.values(u.custom)) { c.type ||= 'militia_sq'; c.side ||= 'mil'; c.roe ||= 'defend'; c.home ||= [c.lon, c.lat]; }
  u.lightbars ||= { police: false, fire: false, ambulance: false }; u.lightPattern ||= 'mixed'; u.lightColors ||= {};
  return s;
}

const DEFAULT_LAYERS = { states: true, cities: true, highways: true, labels: true, neighbors: true, border: true, uGov: true, uFed: true, uAgency: true, uGuard: true, uState: true, uCustom: true };

export function createUsaFields(s) {
  s.display.scene = 'usa';
  s.usa = {
    title: 'The United States', subtitle: 'Governors in session',
    accent: '#4aa8ff',
    view: { ...USA_VIEW },
    layers: { ...DEFAULT_LAYERS },
    mods: {}, custom: {}, states: {}, border: { CAN: 'open', MEX: 'open' }, crossings: {}, sim: { running: false, speed: 60, t: 0, at: 0 }, hostile: [], events: [],
    lightbars: { police: false, fire: false, ambulance: false }, lightPattern: 'mixed', lightColors: {},
    highlight: [], // state postal codes marked on the stage
    note: '',
  };
  return s;
}

// Writes dynamic fields (position, strength, orders) onto a unit: built-in units keep them as overrides, made ones in place.
function putUnit(usa, id, patch) {
  const g = CATALOG[id] ? (usa.mods[id] ||= {}) : usa.custom[id];
  if (g) Object.assign(g, patch);
}
const homeOf = (usa, id, w) => (CATALOG[id] ? [CATALOG[id].lon, CATALOG[id].lat] : usa.custom[id]?.home || [w.lon, w.lat]);
// One step of the clock; the server calls this about once a second. True when the map changed and clients need the state.
export function tickUsa(s, now) {
  migrateUsa(s);
  return usaTick(s, now, getUnits, putUnit, (id, w) => homeOf(s.usa, id, w));
}
function addHostile(usa, a, b) {
  if (isHostile(usa, a, b)) return false;
  usa.hostile.push(hostileKeyOf(a, b));
  usa.events.push({ t: Math.round(usa.sim.t), text: `${sideName(a)} and ${sideName(b)} are now at war.`, kind: 'war' });
  if (usa.events.length > 100) usa.events.shift();
  return true;
}

export const usaActions = {
  // The game clock: start or stop it, and how fast it runs (game seconds per real second).
  usaSim: { perm: 'zeus', run(s, a, ctx) {
    migrateUsa(s);
    if (a.speed !== undefined) { if (!SIM_SPEEDS.includes(Number(a.speed))) return err('Pick a speed from the list.'); s.usa.sim.speed = Number(a.speed); }
    if (a.running !== undefined) s.usa.sim.running = !!a.running;
    s.usa.sim.at = ctx?.now || Date.now();
    return ok();
  } },
  // Orders for one or many units: hold, move, patrol, attack or escort. An attack order puts the two sides at war.
  usaOrder: { perm: 'zeus', run(s, a) {
    migrateUsa(s);
    const ids = [...new Set(Array.isArray(a.ids) ? a.ids : [])].slice(0, 200), o = a.order || {}, units = getUnits(s.usa);
    if (!ids.length) return err('Pick at least one unit.');
    if (!['hold', 'move', 'patrol', 'attack', 'escort'].includes(o.type)) return err('Unknown order.');
    let target = null;
    if (o.type === 'attack' || o.type === 'escort') { target = units[o.target]; if (!target || target.destroyed || target.hidden) return err('Pick a target.'); }
    const to = Array.isArray(o.to) ? [Number(o.to[0]), Number(o.to[1])] : null;
    if ((o.type === 'move' || o.type === 'patrol') && !(to && inBox(to[0], to[1]))) return err('Place it on the map.');
    let n = 0;
    for (const id of ids) {
      const u = units[id];
      if (!u || u.destroyed || u.hidden || id === o.target) continue;
      if (o.type !== 'hold' && !typeOf(u).speed) continue;
      if (o.type === 'attack' && effSide(u) === effSide(target)) continue;
      const order = o.type === 'hold' ? null : o.type === 'move' ? { type: 'move', to: [+to[0].toFixed(3), +to[1].toFixed(3)] }
        : o.type === 'patrol' ? { type: 'patrol', a: [+u.lon.toFixed(3), +u.lat.toFixed(3)], b: [+to[0].toFixed(3), +to[1].toFixed(3)], toB: true } : { type: o.type, target: o.target };
      putUnit(s.usa, id, { order, mv: null, routed: false });
      if (o.type === 'attack') addHostile(s.usa, effSide(u), effSide(target));
      n++;
    }
    if (!n) return err('None of those units can take that order.');
    return ok({ count: n });
  } },
  usaRoe: { perm: 'zeus', run(s, a) {
    migrateUsa(s);
    if (!(a.roe in ROES)) return err('Pick hold fire, return fire or fire at will.');
    const units = getUnits(s.usa); let n = 0;
    for (const id of new Set(Array.isArray(a.ids) ? a.ids : [])) if (units[id]) { putUnit(s.usa, id, { roe: a.roe }); n++; }
    return n ? ok({ count: n }) : err('Pick at least one unit.');
  } },
  // Two sides at war (or not). Units only fight units of a side they are at war with.
  usaHostile: { perm: 'zeus', run(s, a) {
    migrateUsa(s);
    if (!validSide(a.a) || !validSide(a.b) || a.a === a.b) return err('Pick two different sides.');
    const key = hostileKeyOf(a.a, a.b), has = s.usa.hostile.includes(key), want = a.on === undefined ? !has : !!a.on;
    if (want) addHostile(s.usa, a.a, a.b); else if (has) {
      s.usa.hostile = s.usa.hostile.filter(k => k !== key);
      s.usa.events.push({ t: Math.round(s.usa.sim.t), text: `${sideName(a.a)} and ${sideName(a.b)} are at peace.`, kind: 'peace' });
    }
    return ok();
  } },
  usaSetView: { perm: 'zeus', run(s, a) {
    migrateUsa(s);
    const lon = Number(a.lon), lat = Number(a.lat), k = Number(a.k);
    if (![lon, lat, k].every(Number.isFinite)) return err('That view is not valid.');
    s.usa.view = { lon: clamp(lon, -126, -65), lat: clamp(lat, 23, 50.5), k: clamp(k, 1, USA_MAX_ZOOM) };
    return ok();
  } },
  usaLayer: { perm: 'zeus', run(s, a) {
    migrateUsa(s);
    if (!USA_LAYERS.includes(a.layer)) return err('Unknown layer.');
    s.usa.layers[a.layer] = a.on === undefined ? !s.usa.layers[a.layer] : !!a.on;
    return ok();
  } },
  usaLightbars: { perm: 'zeus', run(s, a) {
    migrateUsa(s);
    const list = a.service === 'all' ? Object.keys(LIGHT_SERVICES) : [a.service];
    if (!list.every(x => x in LIGHT_SERVICES)) return err('Unknown service.');
    for (const x of list) s.usa.lightbars[x] = a.on === undefined ? !s.usa.lightbars[x] : !!a.on;
    return ok();
  } },
  usaLightPattern: { perm: 'zeus', run(s, a) {
    migrateUsa(s);
    if (a.pattern !== 'mixed' && !LIGHT_PATTERNS[a.pattern]) return err('Unknown pattern.');
    s.usa.lightPattern = a.pattern;
    return ok();
  } },
  // Colours for one service in a state ("TX"); no colours clears the setting.
  usaLightColors: { perm: 'zeus', run(s, a) {
    migrateUsa(s);
    if (!(a.service in LIGHT_SERVICES)) return err('Unknown service.');
    const id = String(a.id || '');
    if (!/^[A-Z]{2}$/.test(id)) return err('Name a state, like TX.');
    const key = `${id}:${a.service}`;
    if (a.colors == null) delete s.usa.lightColors[key];
    else if (isColors(a.colors)) s.usa.lightColors[key] = a.colors.map(c => c.toLowerCase());
    else return err('Give one to three colours.');
    return ok();
  } },
  // A governor's seat: rename them, set the party, give the seat to a delegate or back to the AI, and set their photo (a small
  // image as a data URL; send photo: null to remove it).
  usaGovernor: { perm: 'zeus', run(s, a) {
    migrateUsa(s);
    const id = `gov-${String(a.state || '').toUpperCase()}`;
    if (!CATALOG[id]) return err('No such state.');
    const g = (s.usa.mods[id] ||= {});
    if (a.name !== undefined) { const n = String(a.name).trim().slice(0, 60); if (!n) return err('Give them a name.'); g.person = n; g.short = n; }
    if (a.party !== undefined) g.party = String(a.party).slice(0, 12);
    if (a.control !== undefined) { if (!['ai', 'delegate'].includes(a.control)) return err('Control is ai or delegate.'); g.control = a.control; }
    if (a.photo !== undefined) {
      if (a.photo === null) g.photo = null;
      else if (typeof a.photo === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(a.photo) && a.photo.length <= 40000) g.photo = a.photo;
      else return err('That photo is not a small JPEG, PNG or WebP.');
    }
    return ok();
  } },
  // Zeus controls any unit: rename it, move it, set its strength, hide it, hand it to a delegate. Edits to catalog units are kept
  // as small overrides (`mods`), so the saved state stays small; `usaUnitReset` drops them.
  usaUnit: { perm: 'zeus', run(s, a) {
    migrateUsa(s);
    const base = getUnits(s.usa)[a.id];
    if (!base) return err('No such unit.');
    const g = CATALOG[a.id] ? (s.usa.mods[a.id] ||= {}) : s.usa.custom[a.id];
    const num = (v, lo, hi) => (Number.isFinite(Number(v)) ? clamp(Number(v), lo, hi) : null);
    for (const [k, n] of [['name', 80], ['short', 40], ['desc', 300]]) if (a[k] !== undefined) { const t = String(a[k]).trim().slice(0, n); if (!t && k !== 'desc') return err('Give it a name.'); g[k] = t; }
    if (a.strength !== undefined) { const v = num(a.strength, 0, 100); if (v == null) return err('Strength is 0 to 100.'); g.strength = Math.round(v); }
    if (a.control !== undefined) { if (!['ai', 'delegate'].includes(a.control)) return err('Control is ai or delegate.'); g.control = a.control; }
    if (a.hidden !== undefined) g.hidden = !!a.hidden;
    if (a.roe !== undefined) { if (!(a.roe in ROES)) return err('Unknown rules of engagement.'); g.roe = a.roe; }
    if (a.side !== undefined) { if (!validSide(a.side)) return err('Unknown side.'); g.side = a.side; }
    if (a.revive) Object.assign(g, { strength: 100, destroyed: false, routed: false, order: null, mv: null, eng: null, hitAt: null });
    if (a.federal !== undefined) { if (!['guard', 'police'].includes(base.kind)) return err('Only a Guard or police unit can be federalized.'); g.federal = !!a.federal; }
    if (a.sil !== undefined) { if (!SILS.includes(a.sil)) return err('Unknown picture.'); g.sil = a.sil; }
    if (a.lon !== undefined || a.lat !== undefined) {
      const lon = Number(a.lon ?? base.lon), lat = Number(a.lat ?? base.lat);
      if (!inBox(lon, lat)) return err('That place is not on the map.');
      g.lon = +lon.toFixed(3); g.lat = +lat.toFixed(3);
    }
    return ok();
  } },
  usaUnitReset: { perm: 'zeus', run(s, a) {
    migrateUsa(s);
    if (!CATALOG[a.id]) return err('Only the built-in units can be reset.');
    delete s.usa.mods[a.id];
    return ok();
  } },
  // Federalizing a state's Guard puts it under the President: every Guard unit in it (or all of them) flips together.
  usaFederalize: { perm: 'zeus', run(s, a) {
    migrateUsa(s);
    const codes = a.state === 'all' ? Object.values(CATALOG).filter(x => x.kind === 'guard').map(x => x.owner) : [String(a.state || '').toUpperCase()];
    const ids = codes.map(c => `ng-${c}`);
    if (!ids.every(id => CATALOG[id])) return err('No such Guard.');
    for (const id of ids) (s.usa.mods[id] ||= {}).federal = a.on === undefined ? !getUnits(s.usa)[id].federal : !!a.on;
    return ok();
  } },
  // A unit of Zeus's own: a militia, a task force, a protest, a convoy. It sits on the map like any other.
  usaSpawn: { perm: 'zeus', run(s, a) {
    migrateUsa(s);
    if (Object.keys(s.usa.custom).length >= 300) return err('That is the most custom units (300).');
    const ty = a.utype === undefined ? null : UNIT_TYPES[a.utype];
    if (a.utype !== undefined && !ty) return err('Unknown kind of unit.');
    const name = String(a.name || ty?.name || '').trim().slice(0, 80);
    if (!name) return err('Give the unit a name.');
    let lon = Number(a.lon), lat = Number(a.lat);
    if (a.at === 'capital') { const row = STATES.find(r => r[0] === String(a.state || '').toUpperCase()); if (!row) return err('No such state.'); lon = row[3]; lat = row[4]; }
    if (!inBox(lon, lat)) return err('Place it on the map.');
    const side = a.side === undefined ? 'mil' : a.side;
    if (!validSide(side) || (side.startsWith('st:') && !STATE_INFO[side.slice(3)])) return err('Unknown side.');
    const sil = a.sil === undefined ? ty?.sil || 'infantry' : a.sil;
    if (!SILS.includes(sil)) return err('Unknown picture.');
    let n = (s.usa.nextCustom || 1); while (s.usa.custom[`x-${n}`]) n++;
    const id = `x-${n}`; s.usa.nextCustom = n + 1;
    const st = Number(a.strength);
    lon = +lon.toFixed(3); lat = +lat.toFixed(3);
    s.usa.custom[id] = { id, kind: 'custom', type: a.utype || 'militia_sq', side, roe: a.roe in ROES ? a.roe : ty?.group === 'Civilians' ? 'hold' : 'defend', home: [lon, lat], name, short: String(a.short || name).trim().slice(0, 40),
      owner: side.startsWith('st:') ? side.slice(3) : 'US', lon, lat, sil, img: null, photo: null, desc: String(a.desc ?? ty?.desc ?? '').slice(0, 300), strength: Number.isFinite(st) ? clamp(Math.round(st), 0, 100) : 100, control: a.control === 'delegate' ? 'delegate' : 'ai', hidden: false, order: null };
    return ok({ id });
  } },
  usaDeleteUnit: { perm: 'zeus', run(s, a) {
    migrateUsa(s);
    if (!s.usa.custom[a.id]) return err('Only units you made can be deleted. Hide the others.');
    delete s.usa.custom[a.id];
    return ok();
  } },
  // A state's numbers (0 to 100), its status and a note; only what is sent changes.
  usaState: { perm: 'zeus', run(s, a) {
    migrateUsa(s);
    const code = String(a.state || '').toUpperCase();
    if (!STATE_INFO[code]) return err('No such state.');
    const g = (s.usa.states[code] ||= {});
    for (const k of Object.keys(STATE_METRICS)) if (a[k] !== undefined) { const v = Number(a[k]); if (!Number.isFinite(v)) return err(`${STATE_METRICS[k]} is 0 to 100.`); g[k] = Math.round(clamp(v, 0, 100)); }
    if (a.status !== undefined) { if (!(a.status in STATE_STATUS)) return err('Unknown status.'); g.status = a.status; }
    if (a.note !== undefined) g.note = String(a.note).slice(0, 200);
    return ok();
  } },
  usaBorder: { perm: 'zeus', run(s, a) {
    migrateUsa(s);
    const sides = a.side === 'all' ? Object.keys(BORDER_SIDES) : [a.side];
    if (!sides.every(x => x in BORDER_SIDES)) return err('Name Canada (CAN) or Mexico (MEX).');
    if (!(a.status in BORDER_POSTURE)) return err('Unknown border posture.');
    for (const x of sides) s.usa.border[x] = a.status;
    return ok();
  } },
  usaCrossing: { perm: 'zeus', run(s, a) {
    migrateUsa(s);
    if (!CROSSING_BY_ID[a.id]) return err('No such crossing.');
    const g = (s.usa.crossings[a.id] ||= {});
    if (a.status !== undefined) { if (!(a.status in CROSSING_STATUS)) return err('Unknown status.'); g.status = a.status; }
    if (a.traffic !== undefined) { const v = Number(a.traffic); if (!Number.isFinite(v)) return err('Traffic is 0 to 100.'); g.traffic = Math.round(clamp(v, 0, 100)); }
    return ok();
  } },
  usaHighlight: { perm: 'zeus', run(s, a) {
    const list = (Array.isArray(a.states) ? a.states : []).map(x => String(x).toUpperCase()).filter(x => /^[A-Z]{2}$/.test(x)).slice(0, 49);
    s.usa.highlight = [...new Set(list)];
    return ok();
  } },
  usaSetTopic: { perm: 'zeus', run(s, a) {
    for (const [k, n] of [['title', 100], ['subtitle', 140], ['note', 300]]) if (a[k] !== undefined) s.usa[k] = String(a[k]).slice(0, n);
    return ok();
  } },
};
