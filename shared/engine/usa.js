// The continental US committee. Step one is the map: a layered view of the lower 48 that the Zeus steers and the stage shows.
import { clamp, FORCE_FILTERS } from './core.js';
import { SCENARIOS } from '../data/usa-scenarios.js';
import { STATES, FEDERAL, STATE_INFO } from '../data/usa-units.js';
import { CROSSINGS } from '../data/usa-border.js';
import { UNIT_TYPES } from '../data/usa-types.js';
import { route as roadRoute } from './usa-route.js';
import { seaRoute, nearestWater, isLand } from './usa-water.js';
import { ABILITIES } from '../data/usa-abilities.js';
import { AIRBASES, AIR_RADIUS } from '../data/usa-airbases.js';
import { INCIDENTS } from '../data/usa-incidents.js';
import { getGov, govTick, govLog, queue, applyEffect, officeState, OFFICE_BY_ID, GOV_EFFECTS } from './usa-gov.js';
import { distKm, baseWorks, nearestBase, TAKEOFF, usaTick, SIM_SPEEDS, ROES, validSide, effSide, typeOf, menNow, inBox, isHostile, hostileKeyOf, sideName } from './usa-sim.js';

const err = error => ({ ok: false, error });
const ok = (r = {}) => ({ ok: true, ...r });
export const USA_LAYERS = ['states', 'cities', 'highways', 'labels', 'neighbors', 'border', 'uGov', 'uFed', 'uAgency', 'uGuard', 'uState', 'uBase', 'uAir', 'uCustom'];

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
  base: { layer: 'uBase', name: 'Air bases', color: '#9ad0ff', dot: 1.2, label: 3.5 },
  air: { layer: 'uAir', name: 'Aircraft', color: '#8fe0ff', dot: 1, label: 4.5 },
  custom: { layer: 'uCustom', name: 'Zeus-made units', color: '#ff8a5a', dot: 1, label: 3 },
};
// The drawn pictures a unit can use (see client/js/usa/art.js).
export const SILS = ['base', 'tank', 'infantry', 'fighter', 'bomber', 'helicopter', 'carrier', 'destroyer', 'ship', 'sub', 'missile', 'satellite', 'shield', 'guard', 'police', 'person', 'truck', 'fire', 'ambulance', 'artillery', 'crowd', 'plane'];
export const UNIT_LAYERS = Object.fromEntries(Object.values(USA_UNIT_KINDS).map(k => [k.layer, k.name]));
const AGENCIES = new Set(['fbi', 'dhs', 'fema', 'cdc', 'ice', 'cbp', 'usss', 'dea', 'atf', 'usms']);

// What kind of formation each federal catalog entry is.
const FED_TYPE = { '82nd': 'div_light', '101st': 'div_light', '10mtn': 'div_light', '1cav': 'division', '1ad': 'division', '1id': 'division', '3id': 'division', '4id': 'division', icorps: 'hq',
  '2mef': 'mef', '1mef': 'mef', norfolk: 'csg', sandiego: 'csg', mayport: 'ddg', kingsbay: 'ssn', bangor: 'ssn',     
  malmstrom: 'icbm', warren: 'icbm',    offutt: 'hq', peterson: 'hq', macdill: 'hq', pentagon: 'hq', ngb: 'hq', meade: 'hq', cgatl: 'cg_area', cgpac: 'cg_area',
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
  // Air bases, and the squadrons parked on them. A parked squadron is not drawn; the base shows how many it holds.
  for (const [id, name, short, branch, lon, lat, st, squads] of AIRBASES) {
    const ang = branch === 'ang', side = ang ? `st:${st}` : 'fed', owner = ang ? st : 'US';
    u[`ab-${id}`] = { id: `ab-${id}`, kind: 'base', name, short, owner, lon, lat, type: 'airbase', side, roe: 'defend', sil: 'base', img: null, ang, branch, desc: `${{ usaf: 'Air Force', navy: 'Navy', usmc: 'Marine Corps', ang: 'Air National Guard' }[branch]} air base. Aircraft launch from here and land back on it; if the base is destroyed, the aircraft parked on it are lost.`, strength: 100, control: 'ai', hidden: false };
    let n = 0;
    for (const [type, count] of squads) for (let i = 1; i <= count; i++) {
      const ty = UNIT_TYPES[type], aid = `ac-${id}-${++n}`;
      u[aid] = { id: aid, kind: 'air', name: `${short}: ${ty.name} ${i}`, short: `${short} ${ty.name.split(' ')[0]} ${i}`, owner, lon, lat, type, side, roe: 'defend', sil: ty.sil, img: null, ang, base: `ab-${id}`, air: 'parked', desc: ty.desc, strength: 100, control: 'ai', hidden: false };
    }
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
  u.sim ||= { running: false, speed: 60, t: 0, at: 0 }; u.hostile ||= []; u.events ||= []; u.fx ||= [];
  for (const c of Object.values(u.custom)) { c.type ||= 'militia_sq'; c.side ||= 'mil'; c.roe ||= 'defend'; c.home ||= [c.lon, c.lat]; }
  getGov(u); u.stageAuto = false; u.forces ||= 'all';
  u.lightbars ||= { police: false, fire: false, ambulance: false }; u.lightPattern ||= 'mixed'; u.lightColors ||= {};
  return s;
}

const DEFAULT_LAYERS = { states: true, cities: true, highways: true, labels: true, neighbors: true, border: true, uGov: true, uFed: true, uAgency: true, uGuard: true, uState: true, uBase: true, uAir: true, uCustom: true };

export function createUsaFields(s) {
  s.display.scene = 'usa';
  s.usa = {
    title: 'The United States', subtitle: 'Governors in session',
    accent: '#4aa8ff',
    view: { ...USA_VIEW },
    layers: { ...DEFAULT_LAYERS },
    mods: {}, custom: {}, states: {}, border: { CAN: 'open', MEX: 'open' }, crossings: {}, sim: { running: false, speed: 60, t: 0, at: 0 }, hostile: [], events: [], fx: [],
    lightbars: { police: false, fire: false, ambulance: false }, lightPattern: 'mixed', lightColors: {},
    forces: 'all', // which forces the stage shows: all, naval, ground or air (the Zeus map always shows everything)
    stageAuto: false, // automatic stage framing was removed at Dan's request; the stage holds the Zeus's view
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
  const moved = usaTick(s, now, getUnits, putUnit, (id, w) => homeOf(s.usa, id, w));
  return govTick(s.usa, GUARD_IDS) || moved;
}
const GUARD_IDS = Object.values(CATALOG).filter(x => x.kind === 'guard' || x.ang).map(x => x.id);
// A move order. Wheeled and tracked units go by road where the server has the road map; everything else goes straight.
// Where a unit will end up once its current move and any queued moves are done; a queued order starts from there.
function lastStop(u) {
  const o = u.order; let end = o?.to || null;
  for (const n of o?.q || []) if (n.to) end = n.to;
  return end || [u.lon, u.lat];
}
// Slots for n units around a point: a rough square, about 4 km apart, so a column does not stack on one pixel.
function formation(to, n, kind) {
  const cols = kind === 'line' ? n : kind === 'column' ? 1 : Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols), gap = 4, out = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols, r = Math.floor(i / cols);
    out.push([to[0] + (c - (cols - 1) / 2) * gap / (111.32 * Math.cos(to[1] * Math.PI / 180)), to[1] + (r - (rows - 1) / 2) * gap / 110.57]);
  }
  return out.map(([x, y]) => [Math.max(-134, Math.min(-51, x)), Math.max(15, Math.min(59, y))]);
}
// Ships stay on water: a place on land moves to the nearest water, or is refused (null) when there is none.
function seaSpot(ty, lon, lat) {
  if (ty.domain !== 'sea' || !isLand(lon, lat)) return [lon, lat];
  const w = nearestWater(lon, lat, 150);
  return w && inBox(w[0], w[1]) ? w : null;
}
// Null when a ship has no way there by water.
function movement(u, to, budget, from) {
  const order = { type: 'move', to };
  if (typeOf(u).domain === 'sea') {
    const path = seaRoute(from || [u.lon, u.lat], to);
    if (!path) return null;
    order.to = path[path.length - 1];
    if (path.length > 2 || distKm({ lon: path[0][0], lat: path[0][1] }, u) > 1) { order.path = path; order.pi = 0; }
    return order;
  }
  // Routing is a search, so a big group order routes only its first few units; the rest go straight.
  if (typeOf(u).domain === 'ground' && typeOf(u).speed >= 30 && budget.n-- > 0) {
    const path = roadRoute(from || [u.lon, u.lat], to);
    if (path && path.length > 2) { order.path = path; order.pi = 0; }
  }
  return order;
}
function addHostile(usa, a, b) {
  if (isHostile(usa, a, b)) return false;
  usa.hostile.push(hostileKeyOf(a, b));
  usa.events.push({ t: Math.round(usa.sim.t), text: `${sideName(a)} and ${sideName(b)} are now at war.`, kind: 'war' });
  if (usa.events.length > 100) usa.events.shift();
  return true;
}

const CUSTOM_MAX = 500;
// A designed unit's numbers, kept only when sane: men, speed (km/h), defence, range (km) and attack against ground, air and sea.
function cleanStats(st) {
  if (!st || typeof st !== 'object') return null;
  const out = {}, num = (v, hi) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? clamp(Math.round(Number(v)), 0, hi) : undefined);
  for (const [k, hi] of [['men', 100000], ['speed', 3000], ['def', 5000], ['range', 2000]]) { const v = num(st[k], hi); if (v !== undefined) out[k] = v; }
  const atk = {}; for (const k of ['ground', 'air', 'sea']) { const v = num(st.atk?.[k], 5000); if (v !== undefined) atk[k] = v; }
  if (Object.keys(atk).length) out.atk = atk;
  return Object.keys(out).length ? out : null;
}
// Sandbox safety net: what a Zeus can lose by a slip. Undo keeps the last 3 states of the units, wars and states; named saves keep 4.
const capture = u => JSON.parse(JSON.stringify({ custom: u.custom, mods: u.mods, hostile: u.hostile, states: u.states, crossings: u.crossings, border: u.border }));
function pushUndo(u) { (u.undo ||= []).push({ at: Math.round(u.sim?.t || 0), data: capture(u) }); while (u.undo.length > 3) u.undo.shift(); }
function restore(u, data) { const d = JSON.parse(JSON.stringify(data)); for (const k of Object.keys(d)) u[k] = d[k]; u.fx = []; }
// One unit of Zeus's own.
function spawnOne(s, a) {
    if (Object.keys(s.usa.custom).length >= CUSTOM_MAX) return err(`That is the most custom units (${CUSTOM_MAX}).`);
    const ty = a.utype === undefined ? null : UNIT_TYPES[a.utype];
    if (a.utype !== undefined && !ty) return err('Unknown kind of unit.');
    const name = String(a.name || ty?.name || '').trim().slice(0, 80);
    if (!name) return err('Give the unit a name.');
    let lon = Number(a.lon), lat = Number(a.lat);
    if (a.at === 'capital') { const row = STATES.find(r => r[0] === String(a.state || '').toUpperCase()); if (!row) return err('No such state.'); lon = row[3]; lat = row[4]; }
    const baseU = a.base ? getUnits(s.usa)[a.base] : null;
    if (a.base) { if (!baseU || baseU.type !== 'airbase') return err('Pick an air base.'); if (ty?.domain !== 'air') return err('Only aircraft can be based on an air base.'); lon = baseU.lon; lat = baseU.lat; }
    if (!inBox(lon, lat)) return err('Place it on the map.');
    if (ty?.domain === 'sea' && isLand(lon, lat)) { const w = nearestWater(lon, lat, 150); if (!w) return err('Ships need water: that is too far inland.'); [lon, lat] = w; }
    const side = a.side === undefined ? (baseU ? effSide(baseU) : 'mil') : a.side;
    if (!validSide(side) || (side.startsWith('st:') && !STATE_INFO[side.slice(3)])) return err('Unknown side.');
    const sil = a.sil === undefined ? ty?.sil || 'infantry' : a.sil;
    if (!SILS.includes(sil)) return err('Unknown picture.');
    let n = (s.usa.nextCustom || 1); while (s.usa.custom[`x-${n}`]) n++;
    const id = `x-${n}`; s.usa.nextCustom = n + 1;
    const st = Number(a.strength);
    lon = +lon.toFixed(3); lat = +lat.toFixed(3);
    s.usa.custom[id] = { id, kind: 'custom', type: a.utype || 'militia_sq', side, roe: a.roe in ROES ? a.roe : ty?.group === 'Civilians' ? 'hold' : 'defend', home: [lon, lat], name, short: String(a.short || name).trim().slice(0, 40),
      owner: side.startsWith('st:') ? side.slice(3) : 'US', lon, lat, sil, img: null, photo: null, desc: String(a.desc ?? ty?.desc ?? '').slice(0, 300), strength: Number.isFinite(st) ? clamp(Math.round(st), 0, 100) : 100, control: a.control === 'delegate' ? 'delegate' : 'ai', hidden: false, ...(cleanStats(a.stats) ? { stats: cleanStats(a.stats) } : {}), order: null, ...(baseU ? { base: baseU.id, air: 'parked' } : {}) };
    return ok({ id });
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
    if (!['hold', 'move', 'amove', 'patrol', 'attack', 'escort', 'rtb', 'cap'].includes(o.type)) return err('Unknown order.');
    let target = null;
    if (o.type === 'attack' || o.type === 'escort') { target = units[o.target]; if (!target || target.destroyed || target.hidden) return err('Pick a target.'); }
    const to = Array.isArray(o.to) ? [Number(o.to[0]), Number(o.to[1])] : null;
    if ((o.type === 'move' || o.type === 'amove' || o.type === 'patrol' || o.type === 'cap') && !(to && inBox(to[0], to[1]))) return err('Place it on the map.');
    const aim = o.type === 'attack' || o.type === 'escort' ? (target && [target.lon, target.lat]) : to;
    let refused = '';
    const movers = ids.filter(id => {
      const u = units[id];
      if (!u || u.destroyed || u.hidden || id === o.target || !(o.type === 'hold' || typeOf(u).speed) || (o.type === 'attack' && effSide(u) === effSide(target))) return false;
      if (o.type === 'rtb' || o.type === 'cap') { if (typeOf(u).domain !== 'air') return false; }
      if (o.type === 'rtb' && (!u.base || u.air === 'parked')) return false;
      // An aircraft based on an airfield needs a working field to leave from, and may only be sent within its combat radius of it.
      if (u.base && o.type !== 'hold' && o.type !== 'rtb') {
        const b = units[u.base];
        if (u.air === 'parked' && !baseWorks(b)) { refused = 'Its air base is too damaged to launch aircraft.'; return false; }
        if (aim && b && distKm(b, { lon: aim[0], lat: aim[1] }) > (AIR_RADIUS[u.type] ?? 1200)) { refused = 'That is beyond the aircraft\'s combat radius from its base.'; return false; }
      }
      return true;
    });
    // A group sent to one point spreads out around it instead of stacking on it.
    const spread = (to && movers.length > 1 && a.formation !== 'none') ? formation(to, movers.length, a.formation) : null;
    let n = 0; const budget = { n: 12 };
    movers.forEach((id, i) => {
      const u = units[id], dest = spread ? spread[i] : to;
      let next;
      if (o.type === 'rtb') { const b = baseWorks(units[u.base]) ? units[u.base] : nearestBase(u, units); if (!b) return; next = { type: 'rtb', to: [b.lon, b.lat] }; }
      else if (o.type === 'cap') next = { type: 'patrol', cap: true, a: [+(dest[0] - 0.3).toFixed(3), +dest[1].toFixed(3)], b: [+(dest[0] + 0.3).toFixed(3), +dest[1].toFixed(3)], toB: true };
      else if (o.type === 'move' || o.type === 'amove') {
        const mv = movement(u, [+dest[0].toFixed(3), +dest[1].toFixed(3)], budget, a.queue ? lastStop(u) : null);
        if (!mv) { refused = 'A ship cannot get there by water.'; return; }
        next = { ...mv, type: o.type };
      } else if (o.type === 'patrol') {
        const b = seaSpot(typeOf(u), +dest[0].toFixed(3), +dest[1].toFixed(3));
        if (!b) { refused = 'A ship cannot patrol there: it is nowhere near water.'; return; }
        next = { type: 'patrol', a: a.queue ? lastStop(u) : [+u.lon.toFixed(3), +u.lat.toFixed(3)], b, toB: true };
      } else next = o.type === 'hold' ? null : { type: o.type, target: o.target };
      // Shift-queued orders wait their turn behind a move the unit is already making.
      const cur = u.order;
      if (a.queue && next && cur && (cur.type === 'move' || cur.type === 'amove') && next.type !== 'attack') {
        if ((cur.q?.length || 0) >= 8) return;
        putUnit(s.usa, id, { order: { ...cur, q: [...(cur.q || []), next] } });
      } else putUnit(s.usa, id, { order: next, mv: null, spd: null, routed: false, ...(next ? { fort: false } : {}) });
      // A parked aircraft taxis and lifts off before it starts the order.
      if (next && u.air === 'parked') putUnit(s.usa, id, { air: 'takeoff', tk: Math.round(s.usa.sim.t) + TAKEOFF });
      if (o.type === 'attack') addHostile(s.usa, effSide(u), effSide(target));
      n++;
    });
    if (!n) return err(refused || 'None of those units can take that order.');
    return ok({ count: n });
  } },
  // A unit's special ability (barrage, air strike, airlift, medevac, dig in, disperse a crowd, forced march). Each has a rest time.
  usaAbility: { perm: 'zeus', run(s, a) {
    migrateUsa(s);
    const units = getUnits(s.usa), u = units[a.id], ab = ABILITIES[a.ability];
    if (!u || u.destroyed || u.hidden || !ab || !ab.types.includes(u.type)) return err('That unit cannot do that.');
    const ty = typeOf(u), t = Math.round(s.usa.sim.t), wait = (u.cd?.[a.ability] || 0) - t;
    if (wait > 0) return err(`${ab.name} is not ready for another ${Math.ceil(wait / 60)} minutes of game time.`);
    if (u.carry) return err('It is being carried.');
    if (ty.domain === 'air' && u.base && u.air !== 'flying') return err('Launch the aircraft first.');
    let to = null;
    if (ab.target === 'point') {
      to = Array.isArray(a.to) ? [Number(a.to[0]), Number(a.to[1])] : null;
      if (!(to && inBox(to[0], to[1]))) return err('Pick a place on the map.');
      const d = distKm(u, { lon: to[0], lat: to[1] });
      if (ab.reach === 'range' && d > ty.range) return err(`Out of range: it reaches ${ty.range} km.`);
      if (typeof ab.reach === 'number' && d > ab.reach) return err(`Too far: it reaches ${ab.reach} km.`);
      const b = u.base && units[u.base];
      if (ab.reach === 'radius' && b && distKm(b, { lon: to[0], lat: to[1] }) > (AIR_RADIUS[u.type] ?? 1200)) return err('That is beyond the aircraft\'s combat radius from its base.');
    }
    const dur = Math.max(20, Math.round(3 * s.usa.sim.speed)), fx = s.usa.fx;
    const mk = (k, extra) => { fx.push({ k, by: u.id, side: effSide(u), t0: t, at: t + dur, ...extra }); if (fx.length > 60) fx.shift(); };
    if (a.ability === 'barrage' || a.ability === 'airstrike' || a.ability === 'carpet') mk(a.ability, { from: [u.lon, u.lat], to, r: ab.radius, dmg: ab.dmg });
    else if (a.ability === 'disperse') mk('disperse', { from: [u.lon, u.lat], to, r: ab.radius });
    else if (a.ability === 'medevac') mk('medevac', { from: [u.lon, u.lat], to: [u.lon, u.lat], r: ab.radius, heal: ab.heal });
    else if (a.ability === 'fortify') { putUnit(s.usa, u.id, { fort: !u.fort, order: null, mv: null, spd: null }); s.usa.events.push({ t, text: `${u.short || u.name} ${u.fort ? 'leaves its positions' : 'digs in'}.`, id: u.id }); return ok(); }
    else if (a.ability === 'forcedmarch') putUnit(s.usa, u.id, { boost: t + ab.dur });
    else if (a.ability === 'airlift') {
      const cap = u.type === 'c130' ? 4500 : 800;
      const cargo = Object.values(units).filter(x => x.id !== u.id && !x.destroyed && !x.hidden && !x.carry && effSide(x) === effSide(u) && typeOf(x).domain !== 'air' && typeOf(x).domain !== 'sea' && typeOf(x).speed > 0 && menNow(x) <= cap && distKm(u, x) <= 12)
        .sort((p, q) => distKm(u, p) - distKm(u, q))[0];
      if (!cargo) return err('There is no friendly ground unit within 12 km small enough to lift.');
      putUnit(s.usa, cargo.id, { carry: u.id, order: null, mv: null, spd: null });
      putUnit(s.usa, u.id, { order: { type: 'move', to: [+to[0].toFixed(3), +to[1].toFixed(3)], lift: true }, mv: null, spd: null, ...(u.air === 'parked' ? { air: 'takeoff', tk: t + TAKEOFF } : {}) });
      s.usa.events.push({ t, text: `${u.short || u.name} lifts ${cargo.short || cargo.name}.`, id: u.id });
    }
    putUnit(s.usa, u.id, { cd: { ...(u.cd || {}), [a.ability]: t + (a.ability === 'forcedmarch' ? ab.dur + ab.cd : ab.cd) } });
    if (!['airlift', 'forcedmarch'].includes(a.ability)) s.usa.events.push({ t, text: `${u.short || u.name}: ${ab.name}.`, id: u.id });
    if (a.ability === 'forcedmarch') s.usa.events.push({ t, text: `${u.short || u.name} begins a forced march.`, id: u.id });
    return ok();
  } },
  // Scramble: every aircraft parked at a base lifts off and flies a combat air patrol over it. Recall: every one in the air returns.
  usaScramble: { perm: 'zeus', run(s, a) {
    migrateUsa(s);
    const units = getUnits(s.usa), b = units[a.base];
    if (!b || b.type !== 'airbase') return err('Pick an air base.');
    const mine = Object.values(units).filter(x => x.base === b.id && !x.destroyed && !x.hidden);
    if (a.recall) {
      const flying = mine.filter(x => x.air === 'flying');
      if (!flying.length) return err('No aircraft from this base are in the air.');
      return usaActions.usaOrder.run(s, { ids: flying.map(x => x.id), order: { type: 'rtb' } });
    }
    if (!baseWorks(b)) return err('The base is too damaged to launch aircraft.');
    const parked = mine.filter(x => x.air === 'parked');
    if (!parked.length) return err('Nothing is parked at this base.');
    return usaActions.usaOrder.run(s, { ids: parked.map(x => x.id), order: { type: 'cap', to: [b.lon, b.lat] }, formation: 'none' });
  } },
  // The computer-run government: switch it on or off, and edit an office (who holds it, delegate or AI).
  usaGov: { perm: 'zeus', run(s, a) {
    migrateUsa(s); const g = getGov(s.usa);
    if (a.auto !== undefined) g.auto = !!a.auto;
    if (a.approval !== undefined) { const v = Number(a.approval); if (!Number.isFinite(v)) return err('Approval is a number.'); g.approval = Math.max(0, Math.min(100, Math.round(v))); }
    if (a.office !== undefined) {
      if (!OFFICE_BY_ID[a.office]) return err('No such office.');
      const o = (g.offices[a.office] ||= {});
      if (a.control !== undefined && !['ai', 'delegate'].includes(a.control)) return err('AI or delegate.');
      if (a.person !== undefined && (a.control ?? o.control ?? 'ai') !== 'delegate') return err('Give the office to a delegate before renaming it.');
      if (a.control === 'ai') delete o.person; // the real office holder is back
      if (a.control !== undefined) o.control = a.control;
      if (a.person !== undefined) o.person = String(a.person).trim().slice(0, 60);
    }
    if (a.cancel) g.pending = g.pending.filter(p => p.id !== a.cancel);
    return ok();
  } },
  // Makes an office speak or give an order, now or after a delay in game minutes.
  usaGovAct: { perm: 'zeus', run(s, a) {
    migrateUsa(s); const g = getGov(s.usa);
    if (!OFFICE_BY_ID[a.office]) return err('Pick an office.');
    const effect = a.effect || 'none'; if (!(effect in GOV_EFFECTS)) return err('Unknown effect.');
    const text = String(a.text || '').trim().slice(0, 240); if (!text && effect === 'none') return err('Write what they say or pick an effect.');
    const o = officeState(s.usa, a.office), delay = Math.max(0, Math.min(1440, Number(a.delay) || 0));
    const line = text || `${o.title} acts: ${GOV_EFFECTS[effect].toLowerCase()}.`;
    if (delay === 0) { applyEffect(s.usa, effect, GUARD_IDS); govLog(s.usa, line, { office: a.office }); }
    else queue(s.usa, { office: a.office, act: effect === 'none' ? 'statement' : 'order', text: line, effect }, delay);
    return ok();
  } },
  // Puts a bill to the House after a delay; the AI votes on how the public feels about the President unless the Zeus forces it.
  usaBill: { perm: 'zeus', run(s, a) {
    migrateUsa(s);
    const title = String(a.title || '').trim().slice(0, 100); if (!title) return err('Name the bill.');
    const effect = a.effect || 'none'; if (!(effect in GOV_EFFECTS)) return err('Unknown effect.');
    if (a.force !== undefined && !['pass', 'fail'].includes(a.force)) return err('Pass or fail.');
    queue(s.usa, { act: 'vote', title, effect, force: a.force }, Math.max(0, Math.min(1440, Number(a.delay) || 30)));
    govLog(s.usa, `Congress takes up ${title}.`, { office: 'speaker' });
    return ok();
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
    s.usa.stageAuto = false; // a view the Zeus chose stays on the stage
    return ok();
  } },
  // The stage frames the fighting and incidents by itself, or holds the view the Zeus last showed on it.
  usaStageAuto: { perm: 'zeus', run(s, a) { migrateUsa(s); s.usa.stageAuto = a.on === undefined ? !s.usa.stageAuto : !!a.on; return ok(); } },
  usaForces: { perm: 'zeus', run(s, a) {
    migrateUsa(s);
    if (!(a.value in FORCE_FILTERS)) return err('Unknown force filter.');
    s.usa.forces = a.value;
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
    // The real governor plays while the AI does; a name, party or photo can only be set once a delegate has the seat, and handing it back to the AI restores the real one.
    const control = a.control ?? getUnits(s.usa)[id].control;
    if ((a.name !== undefined || a.party !== undefined || (a.photo !== undefined && a.photo !== null)) && control !== 'delegate') return err('Set the state to delegate before changing the governor.');
    if (a.control === 'ai') { delete g.person; delete g.short; delete g.party; delete g.photo; }
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
    if (a.stats !== undefined) { if (a.stats === null) delete g.stats; else { const st = cleanStats(a.stats); if (!st) return err('Give at least one number.'); g.stats = st; } }
    if (a.lon !== undefined || a.lat !== undefined) {
      const lon = Number(a.lon ?? base.lon), lat = Number(a.lat ?? base.lat);
      if (!inBox(lon, lat)) return err('That place is not on the map.');
      const at = seaSpot(typeOf(base), lon, lat); if (!at) return err('Ships need water: that is too far inland.');
      g.lon = +at[0].toFixed(3); g.lat = +at[1].toFixed(3);
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
    // The state's Air National Guard bases and aircraft go with its Guard.
    const ids = codes.flatMap(c => [`ng-${c}`, ...Object.values(CATALOG).filter(x => x.ang && x.owner === c).map(x => x.id)]);
    if (!codes.every(c => CATALOG[`ng-${c}`])) return err('No such Guard.');
    for (const id of ids) (s.usa.mods[id] ||= {}).federal = a.on === undefined ? !getUnits(s.usa)[id].federal : !!a.on;
    return ok();
  } },
  // A unit of Zeus's own: a militia, a task force, a protest, a convoy. It sits on the map like any other.
  usaSpawn: { perm: 'zeus', run(s, a) {
    migrateUsa(s);
    const n = clamp(Math.round(Number(a.count) || 1), 1, 50);
    if (Object.keys(s.usa.custom).length + n > CUSTOM_MAX) return err(`That would be more than ${CUSTOM_MAX} custom units.`);
    pushUndo(s.usa);
    if (n === 1) return spawnOne(s, a);
    let lon = Number(a.lon), lat = Number(a.lat);
    if (a.at === 'capital') { const row = STATES.find(r => r[0] === String(a.state || '').toUpperCase()); if (!row) return err('No such state.'); lon = row[3]; lat = row[4]; }
    const r = clamp(Number(a.spread) || 15, 1, 300) / 111, ids = [];
    for (let i = 0; i < n; i++) {
      const ang = i * 2.4, d = r * Math.sqrt((i + 0.5) / n);
      const res = spawnOne(s, { ...a, at: undefined, lon: lon + Math.cos(ang) * d * 1.25, lat: lat + Math.sin(ang) * d, name: a.name ? `${a.name} ${i + 1}` : undefined });
      if (!res.ok) { if (ids.length) break; return res; }
      ids.push(res.id);
    }
    return ok({ ids, id: ids[0] });
  } },
  // Sets off an incident at a state capital, a border crossing or a point on the map: units appear, the state's status may change,
  // and the government answers it.
  usaIncident: { perm: 'zeus', run(s, a) {
    migrateUsa(s);
    const inc = INCIDENTS[a.kind]; if (!inc) return err('Pick an incident.');
    let lon, lat, code = String(a.state || '').toUpperCase(), cross = null;
    if (a.crossing) { cross = CROSSING_LIST.find(c => c.id === a.crossing); if (!cross) return err('No such crossing.'); lon = cross.lon; lat = cross.lat; }
    else if (code) { const row = STATES.find(r => r[0] === code); if (!row) return err('No such state.'); lon = row[3]; lat = row[4]; }
    else { lon = Number(a.lon); lat = Number(a.lat); if (!inBox(lon, lat)) return err('Pick a place on the map.'); }
    if (!code) { let best = 1e9; for (const r of STATES) { const d = distKm({ lon, lat }, { lon: r[3], lat: r[4] }); if (d < best) { best = d; code = r[0]; } } }
    const total = inc.units.reduce((n, u) => n + u[3], 0);
    if (Object.keys(s.usa.custom).length + total > CUSTOM_MAX) return err(`That would be more than ${CUSTOM_MAX} custom units. Delete some first.`);
    pushUndo(s.usa);
    const where = cross ? cross.name : STATES.find(r => r[0] === code)?.[1] || code;
    let k = 0; const ids = [];
    for (const [utype, name, sideKey, n, how] of inc.units) for (let i = 0; i < n; i++, k++) {
      const ang = k * 2.4, r = how === 'spread' ? 0.05 + 0.04 * (k % 4) : 0.02 * (k % 3);
      let x = lon + Math.cos(ang) * r, y = lat + Math.sin(ang) * r;
      if (how === 'line') { x = lon + 0.06 * (i - n / 2); y = lat; }
      const side = sideKey === 'st' ? `st:${code}` : sideKey;
      if (how === 'inward' && cross) y = lat + (cross.side === 'CAN' ? -0.05 : 0.05) * (1 + k % 3); // just on the far side, then they drive in
      const res = spawnOne(s, { utype, name: `${name} (${where})`, short: name, side, lon: x, lat: y });
      if (!res.ok) return res;
      ids.push(res.id);
      if (how === 'inward' && cross) {
        const to = [+(lon + (k - 2) * 0.05).toFixed(3), +(lat + (cross.side === 'CAN' ? -0.5 : 0.4)).toFixed(3)];
        putUnit(s.usa, res.id, { order: { type: 'move', to } });
      }
    }
    if (inc.status && STATE_INFO[code]) (s.usa.states[code] ||= {}).status = inc.status;
    if (cross && (inc.group === 'border' || inc.group === 'war')) (s.usa.crossings[cross.id] ||= {}).status = 'closed';
    if (inc.group === 'war' && a.kind === 'incursion') addHostile(s.usa, 'fed', 'foreign');
    if (a.kind === 'uprising') addHostile(s.usa, `st:${code}`, 'mil');
    s.usa.events.push({ t: Math.round(s.usa.sim.t), text: `${inc.text} at ${where}.`, kind: 'incident', grp: inc.group, id: ids[0], state: code });
    if (s.usa.events.length > 100) s.usa.events.shift();
    return ok({ ids });
  } },
  // ---- Sandbox: many units at once, copies, teleports, scenarios, save points and undo ----
  usaClone: { perm: 'zeus', run(s, a) {
    migrateUsa(s);
    const all = getUnits(s.usa), ids = [...new Set(a.ids || [])].filter(id => all[id]).slice(0, 50);
    if (!ids.length) return err('Pick a unit to copy.');
    const copies = clamp(Math.round(Number(a.copies) || 1), 1, 10);
    if (Object.keys(s.usa.custom).length + ids.length * copies > CUSTOM_MAX) return err(`That would be more than ${CUSTOM_MAX} custom units.`);
    pushUndo(s.usa);
    const out = [];
    for (let c = 1; c <= copies; c++) for (const id of ids) {
      const u = all[id], d = 0.04 * c;
      const res = spawnOne(s, { utype: u.type, name: `${u.name} (copy)`, short: u.short, side: u.side, lon: u.lon + d, lat: u.lat - d * 0.6, strength: u.strength ?? 100, roe: u.roe, sil: u.sil, desc: u.desc, control: u.control, stats: u.stats, base: u.base });
      if (!res.ok) return out.length ? ok({ ids: out }) : res;
      out.push(res.id);
    }
    return ok({ ids: out });
  } },
  // One edit for many units. Built-in units can be changed or hidden; only your own can be deleted.
  usaBulk: { perm: 'zeus', run(s, a) {
    migrateUsa(s);
    const all = getUnits(s.usa), ids = [...new Set(a.ids || [])].filter(id => all[id]);
    if (!ids.length) return err('Pick some units first.');
    const set = a.set || {};
    if (set.strength !== undefined && !Number.isFinite(Number(set.strength))) return err('Strength is 0 to 100.');
    if (set.roe !== undefined && !(set.roe in ROES)) return err('Unknown rules of engagement.');
    if (set.side !== undefined && !validSide(set.side)) return err('Unknown side.');
    if (set.control !== undefined && !['ai', 'delegate'].includes(set.control)) return err('Control is ai or delegate.');
    pushUndo(s.usa);
    let n = 0;
    for (const id of ids) {
      if (a.delete) { if (s.usa.custom[id]) { delete s.usa.custom[id]; n++; } continue; }
      const g = CATALOG[id] ? (s.usa.mods[id] ||= {}) : s.usa.custom[id];
      if (set.strength !== undefined) g.strength = Math.round(clamp(Number(set.strength), 0, 100));
      if (set.roe !== undefined) g.roe = set.roe;
      if (set.side !== undefined) g.side = set.side;
      if (set.control !== undefined) g.control = set.control;
      if (set.hidden !== undefined) g.hidden = !!set.hidden;
      if (set.revive) Object.assign(g, { strength: 100, destroyed: false, routed: false, order: null, mv: null, eng: null, hitAt: null });
      if (set.stop) Object.assign(g, { order: null, mv: null, eng: null });
      n++;
    }
    return ok({ n });
  } },
  // Moves a group to one place, spread out so they do not stack.
  usaTeleport: { perm: 'zeus', run(s, a) {
    migrateUsa(s);
    const all = getUnits(s.usa), ids = [...new Set(a.ids || [])].filter(id => all[id] && all[id].type !== 'airbase' && !(all[id].kind === 'air' && all[id].air && all[id].air !== 'parked')).slice(0, 200);
    const lon = Number(a.lon), lat = Number(a.lat);
    if (!ids.length) return err('Pick some units first.');
    if (!inBox(lon, lat)) return err('Pick a place on the map.');
    pushUndo(s.usa);
    ids.forEach((id, i) => {
      const ang = i * 2.4, d = ids.length > 1 ? 0.03 * Math.sqrt(i + 1) : 0;
      const at = seaSpot(typeOf(all[id]), lon + Math.cos(ang) * d * 1.25, lat + Math.sin(ang) * d); // ships land on the nearest water
      if (at) putUnit(s.usa, id, { lon: +at[0].toFixed(3), lat: +at[1].toFixed(3), order: null, mv: null, eng: null });
    });
    return ok({ n: ids.length });
  } },
  // Removes every unit Zeus made (or only a kind of them).
  usaClear: { perm: 'zeus', run(s, a) {
    migrateUsa(s);
    const ids = Object.keys(s.usa.custom).filter(id => !a.utype || s.usa.custom[id].type === a.utype);
    if (!ids.length) return err('There are none to remove.');
    pushUndo(s.usa);
    for (const id of ids) delete s.usa.custom[id];
    return ok({ n: ids.length });
  } },
  usaScenario: { perm: 'zeus', run(s, a) {
    migrateUsa(s);
    const sc = SCENARIOS[a.id]; if (!sc) return err('Pick a scenario.');
    const before = capture(s.usa), prev = (s.usa.undo || []).slice(), ids = [];
    for (const step of sc.steps) {
      const res = usaActions.usaIncident.run(s, step);
      if (!res.ok) { restore(s.usa, before); return res; }
      ids.push(...(res.ids || []));
    }
    s.usa.undo = [...prev, { at: Math.round(s.usa.sim.t), data: before }].slice(-3); // the whole scenario undoes in one step
    s.usa.events.push({ t: Math.round(s.usa.sim.t), text: `Scenario: ${sc.name}.`, kind: 'incident', grp: 'war', id: ids[0] });
    return ok({ ids });
  } },
  usaUndo: { perm: 'zeus', run(s) {
    migrateUsa(s);
    const last = s.usa.undo?.pop(); if (!last) return err('Nothing to undo.');
    restore(s.usa, last.data);
    return ok();
  } },
  usaSnap: { perm: 'zeus', run(s, a) {
    migrateUsa(s);
    const snaps = (s.usa.snaps ||= []);
    if (snaps.length >= 4) return err('Four save points is the most. Delete one first.');
    const name = String(a.name || '').trim().slice(0, 40) || `Save ${snaps.length + 1}`;
    snaps.push({ id: `sv${s.usa.nextSnap = (s.usa.nextSnap || 0) + 1}`, name, at: Math.round(s.usa.sim.t), n: Object.keys(s.usa.custom).length, data: capture(s.usa) });
    return ok();
  } },
  usaSnapLoad: { perm: 'zeus', run(s, a) {
    migrateUsa(s);
    const sv = s.usa.snaps?.find(x => x.id === a.id); if (!sv) return err('No such save point.');
    pushUndo(s.usa);
    restore(s.usa, sv.data);
    return ok();
  } },
  usaSnapDelete: { perm: 'zeus', run(s, a) {
    migrateUsa(s);
    s.usa.snaps = (s.usa.snaps || []).filter(x => x.id !== a.id);
    return ok();
  } },
  usaDeleteUnit: { perm: 'zeus', run(s, a) {
    migrateUsa(s);
    if (!s.usa.custom[a.id]) return err('Only units you made can be deleted. Hide the others.');
    pushUndo(s.usa);
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
