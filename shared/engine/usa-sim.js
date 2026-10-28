// The real-time part of the US committee: units move along their orders and fight when sides are hostile.
// The server calls usaTick about once a second while the clock runs; the clients draw units gliding between ticks from `mv`.
// Nothing here uses fuel or ammunition. A unit fights at the strength it has until it is destroyed or routs.
import { clamp } from './core.js';
import { UNIT_TYPES } from '../data/usa-types.js';

export const SIM_SPEEDS = [1, 10, 60, 300, 1000]; // game seconds per real second
export const ROES = { hold: 'Hold fire', defend: 'Return fire', free: 'Fire at will' };
export const SIDE_NAMES = { fed: 'Federal', mil: 'Militia', foreign: 'Foreign', civil: 'Civilians' };
export const sideName = (side, stateName = c => c) => (side.startsWith('st:') ? `${stateName(side.slice(3))} state forces` : SIDE_NAMES[side] || side);
export const validSide = side => typeof side === 'string' && (side in SIDE_NAMES || /^st:[A-Z]{2}$/.test(side));
export const SIDE_COLORS = { fed: '#7fbf6a', mil: '#ff8a5a', foreign: '#ff4a6a', civil: '#e6e6f0', st: '#4f9bff' };
export const sideColor = side => (side.startsWith('st:') ? SIDE_COLORS.st : SIDE_COLORS[side] || '#ff8a5a');
// A federalized Guard or police unit answers to the President.
export const effSide = u => (u.federal ? 'fed' : u.side || 'fed');
export const typeOf = u => UNIT_TYPES[u.type] || UNIT_TYPES.hq;
export const menNow = u => Math.round(typeOf(u).men * (u.strength ?? 100) / 100);

const KM_LAT = 110.57, KM_LON = lat => 111.32 * Math.cos(lat * Math.PI / 180);
export const distKm = (a, b) => Math.hypot((a.lon - b.lon) * KM_LON((a.lat + b.lat) / 2), (a.lat - b.lat) * KM_LAT);
export const BOX = { x0: -135, x1: -50, y0: 14, y1: 60 }; // the lower 48 plus the Canadian and Mexican land on the map
export const inBox = (lon, lat) => Number.isFinite(lon) && Number.isFinite(lat) && lon >= BOX.x0 && lon <= BOX.x1 && lat >= BOX.y0 && lat <= BOX.y1;
const hostileKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
export const isHostile = (usa, a, b) => a !== b && (usa.hostile || []).includes(hostileKey(a, b));
export const hostileKeyOf = hostileKey;

// Game clock: the committee starts on day 1 at 06:00.
export const simSeconds = (usa, realMsSinceTick = 0) => (usa.sim?.t || 0) + (usa.sim?.running ? realMsSinceTick / 1000 * (usa.sim.speed || 1) : 0);
export function simClock(seconds) {
  const total = 6 * 3600 + Math.max(0, Math.floor(seconds)), day = Math.floor(total / 86400) + 1, h = Math.floor(total % 86400 / 3600), m = Math.floor(total % 3600 / 60);
  return `Day ${day} · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// A repeatable pseudo-random number in [0.8, 1.2] so a fight does not play out as a perfectly flat curve, and tests stay deterministic.
const jitter = (n, a, b) => { let h = (n * 2654435761 + a * 40503 + b * 9973) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; return 0.8 + 0.4 * ((h >>> 8) % 1000) / 1000; };
const hash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
export const OFFROAD = 0.6; // share of road speed a vehicle makes across country
const DYN = ['lon', 'lat', 'strength', 'order', 'mv', 'spd', 'eng', 'routed', 'destroyed', 'hitAt'];
const domainKey = ty => (ty.domain === 'air' ? 'air' : ty.domain === 'sea' ? 'sea' : 'ground');

function log(usa, text, extra = {}) {
  usa.events ||= [];
  usa.events.push({ t: Math.round(usa.sim.t), text, ...extra });
  if (usa.events.length > 100) usa.events.shift();
}

// Moves w toward (tx, ty) by km; returns the distance left.
function step(w, tx, ty, km) {
  const kl = KM_LON(w.lat), dx = (tx - w.lon) * kl, dy = (ty - w.lat) * KM_LAT, d = Math.hypot(dx, dy);
  if (d <= km) { w.lon = tx; w.lat = ty; return 0; }
  w.lon += dx / d * km / kl; w.lat += dy / d * km / KM_LAT;
  return d - km;
}

// A unit that has reached the end of a move goes on to the next queued order, or stops.
function arrive(usa, w, o) {
  if (o.type === 'return') w.routed = false;
  const next = o.q?.length ? o.q[0] : null;
  w.order = next ? { ...next, q: o.q.slice(1) } : null; w.mv = null; w.spd = null;
  if (!next) log(usa, `${w.short || w.name} arrived.`, { id: w.id });
}

// Advances the clock to `now` (milliseconds). Returns true when anything on the map changed and clients should be sent the state.
export function usaTick(s, now, getUnits, put, home) {
  const usa = s.usa, sim = usa.sim;
  if (!sim?.running) return false;
  const real = clamp((now - (sim.at || now)) / 1000, 0, 5);
  sim.at = now;
  if (real <= 0) return false;
  const dt = real * sim.speed;
  sim.t += dt;
  const src = getUnits(usa), W = {};
  for (const id in src) { const u = src[id]; if (!u.hidden) W[id] = { ...u, order: u.order ? { ...u.order } : null }; }
  const touched = new Set();
  const dirty = id => touched.add(id);

  // Movement
  for (const w of Object.values(W)) {
    if (w.destroyed) continue;
    const ty = typeOf(w), o = w.order;
    if (!o || !ty.speed) { if (w.mv) { w.mv = null; dirty(w.id); } continue; }
    // Wheeled and tracked units are slower off the road, so a road only pays on a longer trip (see usa-route.js).
    const onRoad = !!(o.path?.length && o.pi > 0 && o.pi < o.path.length - 1);
    const km = ty.speed * (w.strength < 30 ? 0.6 : 1) * (ty.domain === 'ground' && ty.speed >= 30 && !onRoad ? OFFROAD : 1) * dt / 3600;
    let tx = null, tyy = null, stopAt = 0, finish = null;
    // Along a road route the unit runs through its waypoints, carrying the rest of the tick's distance from one to the next.
    if ((o.type === 'move' || o.type === 'amove' || o.type === 'return') && o.path?.length) {
      // An attack-move halts while its unit has something to shoot at, and goes on when the fight is over.
      if (o.type === 'amove' && w.eng) { if (w.mv) { w.mv = null; w.spd = null; } continue; }
      let rem = km, arrived = false; o.pi ||= 0;
      while (rem > 0) {
        const [px, py] = o.path[o.pi], d = distKm(w, { lon: px, lat: py });
        if (d <= rem) { w.lon = px; w.lat = py; rem -= d; if (o.pi >= o.path.length - 1) { arrived = true; break; } o.pi++; }
        else { step(w, px, py, rem); rem = 0; }
      }
      dirty(w.id);
      if (arrived) { arrive(usa, w, o); continue; }
      [tx, tyy] = o.path[o.pi];
      const d = Math.hypot((tx - w.lon) * KM_LON(w.lat), (tyy - w.lat) * KM_LAT) || 1, perReal = km / real;
      w.mv = [+((tx - w.lon) / d * perReal).toFixed(6), +((tyy - w.lat) / d * perReal).toFixed(6)]; w.spd = +perReal.toFixed(5);
      continue;
    }
    if (o.type === 'amove' && w.eng) { if (w.mv) { w.mv = null; w.spd = null; dirty(w.id); } continue; }
    if (o.type === 'move' || o.type === 'amove' || o.type === 'return') { [tx, tyy] = o.to; finish = 'arrive'; }
    else if (o.type === 'patrol') { [tx, tyy] = o.toB ? o.b : o.a; finish = 'turn'; }
    else if (o.type === 'attack' || o.type === 'escort') {
      const t = W[o.target];
      if (!t || t.destroyed) { w.order = null; w.mv = null; dirty(w.id); continue; }
      tx = t.lon; tyy = t.lat; stopAt = o.type === 'attack' ? Math.max(0.3, ty.range * 0.8) : 1.5;
    }
    const before = distKm(w, { lon: tx, lat: tyy });
    if (before <= stopAt) { if (w.mv) { w.mv = null; dirty(w.id); } continue; }
    const left = step(w, tx, tyy, Math.min(km, before - stopAt));
    dirty(w.id);
    if (finish && left <= 0.001) {
      if (finish === 'arrive') { arrive(usa, w, o); continue; }
      o.toB = !o.toB;
    }
    // Degrees per real second, for clients to glide the dot between ticks.
    const d = Math.hypot((tx - w.lon) * KM_LON(w.lat), (tyy - w.lat) * KM_LAT) || 1, perReal = km / real;
    w.mv = [+((tx - w.lon) * KM_LON(w.lat) / d * perReal / KM_LON(w.lat)).toFixed(6), +((tyy - w.lat) * KM_LAT / d * perReal / KM_LAT).toFixed(6)]; w.spd = +perReal.toFixed(5);
  }

  // Engagement: every unit that may fire at a hostile unit in range does so at the same moment.
  const hostile = (usa.hostile || []).map(k => k.split('|'));
  const wasEng = new Map(Object.values(W).filter(w => w.eng).map(w => [w.id, w.eng]));
  const firing = new Map(), damage = new Map();
  if (hostile.length) {
    const bySide = new Map();
    for (const w of Object.values(W)) { if (w.destroyed) continue; const sd = effSide(w); (bySide.get(sd) || bySide.set(sd, []).get(sd)).push(w); }
    const recently = w => w.hitAt != null && sim.t - w.hitAt < 300;
    const canFire = (a, b, d) => {
      const ta = typeOf(a), tb = typeOf(b), atk = ta.atk[domainKey(tb)];
      if (!atk || d > ta.range) return 0;
      const ordered = a.order?.type === 'attack' && a.order.target === b.id;
      if (!(ordered || a.roe === 'free' || a.order?.type === 'amove' || (a.roe === 'defend' && (recently(a) || d <= Math.min(ta.range, 3))))) return 0;
      return atk;
    };
    for (const [sa, sb] of hostile) for (const [x, y] of [[sa, sb], [sb, sa]]) {
      for (const a of bySide.get(x) || []) {
        let best = null, bestD = 1e9;
        for (const b of bySide.get(y) || []) { const d = distKm(a, b); if (d < bestD && canFire(a, b, d)) { best = b; bestD = d; } }
        if (!best) continue;
        const ta = typeOf(a), tb = typeOf(best), atk = ta.atk[domainKey(tb)];
        const dmg = Math.min(50, 0.02 * dt * atk * (a.strength / 100) / Math.max(1, tb.def) * jitter(Math.floor(sim.t / 5), hash(a.id), hash(best.id)));
        firing.set(a.id, best.id);
        damage.set(best.id, (damage.get(best.id) || 0) + dmg);
      }
    }
  }
  for (const [id, dmg] of damage) {
    const b = W[id], men = menNow(b);
    b.strength = Math.max(0, +(b.strength - dmg).toFixed(2)); b.hitAt = sim.t; dirty(id);
    if (b.strength <= 0) {
      b.destroyed = true; b.order = null; b.mv = null; b.eng = null;
      log(usa, `${b.short || b.name} destroyed (${men.toLocaleString('en-US')} lost).`, { id, kind: 'kill' });
    }
  }
  for (const w of Object.values(W)) {
    const t = firing.get(w.id) || null;
    if (!w.destroyed && (w.eng || null) !== t) {
      if (t && !wasEng.has(w.id)) log(usa, `${w.short || w.name} engaged ${W[t].short || W[t].name}.`, { id: w.id, kind: 'fight' });
      w.eng = t; dirty(w.id);
    }
    // A badly hurt unit that is not holding its ground falls back to where it started.
    const ty = typeOf(w);
    if (!w.destroyed && !w.routed && ty.speed > 0 && w.strength < 25 && w.roe !== 'hold' && damage.has(w.id)) {
      const h = home(w.id, w); w.routed = true; w.order = { type: 'return', to: h }; w.eng = null; dirty(w.id);
      log(usa, `${w.short || w.name} is routing.`, { id: w.id, kind: 'rout' });
    }
  }
  for (const id of touched) { const w = W[id], patch = {}; for (const k of DYN) patch[k] = w[k] ?? null; put(usa, id, patch); }
  return touched.size > 0 || damage.size > 0;
}

// Where a moving unit is `secs` real seconds after the server last placed it, walking its own route at its own speed and stopping
// where the server will stop it, so the screen never carries a unit past its goal or round a corner. Used by every screen.
export function glidePos(u, units, secs) {
  if (!u.spd || !u.order || secs <= 0) return [u.lon, u.lat];
  const o = u.order; let pts, stop = 0;
  if ((o.type === 'move' || o.type === 'return') && o.path?.length) pts = o.path.slice(o.pi || 0);
  else if (o.type === 'move' || o.type === 'return') pts = [o.to];
  else if (o.type === 'patrol') pts = [o.toB ? o.b : o.a];
  else if (o.type === 'attack' || o.type === 'escort') {
    const t = units[o.target]; if (!t) return [u.lon, u.lat];
    pts = [[t.lon, t.lat]]; stop = o.type === 'attack' ? Math.max(0.3, typeOf(u).range * 0.8) : 1.5;
  } else return [u.lon, u.lat];
  const w = { lon: u.lon, lat: u.lat }; let rem = u.spd * secs;
  for (let i = 0; i < pts.length && rem > 0; i++) {
    const [tx, ty] = pts[i], d = distKm(w, { lon: tx, lat: ty }), last = i === pts.length - 1, room = last ? Math.max(0, d - stop) : d;
    if (room <= rem) { if (last) { const f = d ? (d - stop) / d : 0; w.lon += (tx - w.lon) * f; w.lat += (ty - w.lat) * f; return [w.lon, w.lat]; } w.lon = tx; w.lat = ty; rem -= d; }
    else { const f = rem / d; w.lon += (tx - w.lon) * f; w.lat += (ty - w.lat) * f; return [w.lon, w.lat]; }
  }
  return [w.lon, w.lat];
}
