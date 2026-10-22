// Turn resolution: every queued order resolves at once, then the economy, AI, news and endings update.
import { SEA_ZONES, FLEET_MOVES_PER_TURN } from '../data/places.js';
import { distanceKm, countriesCrossed, seaRoute, zonesTouching } from '../geo.js';
import {
  UNIT_TYPES, rand, chance, between, clamp, newId, atWar, sameSide, relation, shiftRelation, anchor, unitsAt, unitsOf,
  enemiesOf, isActive, countryName, boundAllies,
} from './core.js';
import { validateOrder, blockedFor, describeOrder } from './orders.js';
import { tickEconomy } from './economy.js';
import { planAI } from './ai.js';
import { headlinesFrom } from './news.js';
import { detectEndings } from './endings.js';
import { snapshotStats } from './state.js';

const PRIORITY = ['roe', 'overflight', 'war', 'alliance', 'ceasefire', 'peace', 'sanction', 'unsanction', 'trade', 'aid', 'arms', 'lift',
  'rebase', 'cap', 'fleet', 'blockade', 'alert', 'cyber', 'satellite', 'intel', 'spy', 'propaganda', 'neo', 'strike', 'invade', 'nuke', 'election'];

const ANIMATED = ['strike', 'battle', 'naval', 'fleet', 'move', 'nuke', 'unit_lost', 'chokepoint', 'occupation', 'scrubbed', 'war', 'front', 'landing', 'liberation', 'neo'];

const pt = c => ({ lat: c.lat, lon: c.lon });
// A country's fighting quality in a domain (land, air or sea).
const Q = (state, id, domain) => state.countries[id]?.quality?.[domain] ?? 1;

export function declareWar(state, a, b, ev, why) {
  if (a === b || atWar(state, a, b)) return false;
  state.wars.push({ a, b, since: state.meta.turn });
  state.treaties = state.treaties.filter(t => !(t.type === 'ceasefire' && t.parties.includes(a) && t.parties.includes(b)));
  shiftRelation(state, a, b, -100);
  for (const id of [a, b]) state.countries[id].support = clamp(state.countries[id].support + 4, 0, 100); // rally round the flag
  ev.push({ kind: 'war', a, b, why });
  // Alliance trigger: allies of the defender are alerted, AI allies may join.
  for (const ally of Object.values(state.countries)) {
    if (!isActive(ally) || ally.id === a || ally.id === b) continue;
    const bound = boundAllies(state, ally.id, b);
    if (bound) {
      if (!ev.some(e => e.kind === 'treaty_trigger' && e.ally === b)) ev.push({ kind: 'treaty_trigger', ally: b, attacker: a, alliance: bound });
      shiftRelation(state, ally.id, a, -30);
    }
  }
  return true;
}

function interceptPower(state, cid, attackerOwner) {
  const c = state.countries[cid];
  if (!c) return 0;
  let ad = c.airDefense + 2 * unitsAt(state, 'country', cid).filter(u => u.type === 'airdef').length;
  if ((c.cyber.radar || 0) >= state.meta.turn) ad -= 3;
  const fighters = unitsAt(state, 'country', cid).filter(u => u.type === 'fighter' && u.owner !== attackerOwner && sameSide(state, u.owner, cid))
    .reduce((s, u) => s + u.strength / 100, 0);
  const cap = unitsAt(state, 'country', cid).some(u => u.cap && u.owner === cid) ? 0.1 : 0;
  // Better-trained air forces defend better, and better attackers slip through more often.
  const edge = Math.sqrt(Q(state, cid, 'air') / Q(state, attackerOwner, 'air'));
  return clamp((0.04 * Math.max(0, ad) + 0.05 * Math.min(fighters, 6) + cap) * edge, 0, 0.85);
}

function damageUnit(state, u, amount, ev, why) {
  u.strength = Math.max(0, Math.round(u.strength - amount));
  if (u.strength <= 5) {
    u.strength = 0;
    ev.push({ kind: 'unit_lost', owner: u.owner, unitType: u.type, at: anchor(state, u.loc), why });
    delete state.units[u.id];
  }
}

function resolveStrike(state, o, ctx, ev, salvos) {
  const atk = state.countries[o.country], tgt = state.countries[o.target];
  if (!atWar(state, o.country, o.target)) declareWar(state, o.country, o.target, ev, 'strike');
  const to = pt(tgt);
  const escorts = (o.escort || []).map(id => state.units[id]).filter(Boolean);
  const category = o.category || 'military';
  salvos[o.target] = (salvos[o.target] || 0);
  for (const id of o.units) {
    const u = state.units[id];
    if (!u) continue;
    const from = anchor(state, u.loc);
    const isMissile = u.type === 'missile';
    const path = ctx.countryAt ? countriesCrossed(from, to, ctx.countryAt, 90) : [];
    let pSurvive = 1, interceptedOver = null, violations = [];
    // Weather can scrub aircraft before they reach the target.
    if (!isMissile && path.some(cid => state.global.weather[cid] === 'storm') && chance(state, 0.15)) {
      ev.push({ kind: 'scrubbed', owner: o.country, target: o.target, unitType: u.type, from, to });
      continue;
    }
    for (const cid of path) {
      if (cid === o.country || cid === o.target || sameSide(state, cid, o.country)) continue;
      const host = state.countries[cid];
      if (!host || host.overflight.includes(o.country)) continue;
      let p = interceptPower(state, cid, o.country);
      if (!atWar(state, cid, o.country)) {
        violations.push(cid);
        p *= host.roe === 'forward' ? 0.8 : host.roe === 'firm' ? 0.45 : 0.15;
      }
      if (isMissile) p *= 0.35;
      else {
        p = Math.max(0, p - Math.min(0.28, 0.07 * escorts.length));
        if (u.type === 'bomber' && atk.stealth) p *= 0.55;
        if (u.type === 'carrier') p *= 0.8;
      }
      if (interceptedOver === null && chance(state, p)) interceptedOver = cid;
      pSurvive *= 1 - p;
    }
    // Terminal defence over the target. Many missiles at once saturate air defence.
    if (interceptedOver === null) {
      let p = interceptPower(state, o.target, o.country);
      if (isMissile) { salvos[o.target]++; p = (p * 0.75) / (1 + 0.35 * (salvos[o.target] - 1)); }
      else {
        p = Math.max(0, p - Math.min(0.28, 0.07 * escorts.length));
        if (u.type === 'bomber' && atk.stealth) p *= 0.55;
      }
      if (chance(state, p)) interceptedOver = o.target;
    }
    for (const v of violations) {
      shiftRelation(state, v, o.country, -15);
      const host = state.countries[v];
      host.violations ||= {};
      host.violations[o.country] = (host.violations[o.country] || 0) + 1;
      ev.push({ kind: 'violation', by: o.country, over: v });
    }
    if (isMissile) u.strength = Math.max(0, u.strength - 25);
    if (interceptedOver) {
      const host = state.countries[interceptedOver];
      const at = interceptedOver === o.target ? to : pt(host);
      ev.push({ kind: 'strike', owner: o.country, target: o.target, unitType: u.type, category, from, to, intercepted: true, by: interceptedOver, at });
      if (!isMissile) damageUnit(state, u, between(state, 35, 70), ev, 'shot down');
      else if (u.strength <= 0) { delete state.units[u.id]; }
      if (interceptedOver !== o.target && !atWar(state, interceptedOver, o.country)) shiftRelation(state, interceptedOver, o.country, -10);
      continue;
    }
    // Hit.
    const power = (u.type === 'bomber' ? 0.07 : u.type === 'missile' ? 0.045 : u.type === 'carrier' ? 0.05 : 0.03) * (u.strength / 100 + 0.3) * (isMissile ? 1 : Math.sqrt(Q(state, o.country, 'air')));
    applyStrikeDamage(state, tgt, category, power, ev, o.country);
    tgt.lastStruck = state.meta.turn;
    state.global.closedAirspace[o.target] = state.global.closedAirspace[o.target] || { turn: state.meta.turn, at: ctx.now };
    ev.push({ kind: 'strike', owner: o.country, target: o.target, unitType: u.type, category, from, to, intercepted: false, at: to, power: Math.round(power * 100) });
    if (isMissile && u.strength <= 0) { ev.push({ kind: 'unit_lost', owner: u.owner, unitType: 'missile', at: from, why: 'stockpile spent' }); delete state.units[u.id]; }
  }
}

export function applyStrikeDamage(state, tgt, category, power, ev, attacker) {
  const cas = Math.round(power * 100 * between(state, 0.8, 1.6));
  tgt.casualties += cas; state.global.casualties += cas;
  tgt.damage = clamp(tgt.damage + power * 0.6, 0, 1);
  tgt.warWeariness += power * 40;
  switch (category) {
    case 'industry': tgt.industry = clamp(tgt.industry - power * 1.4, 0.05, 1.2); break;
    case 'energy': tgt.energy = clamp(tgt.energy - power * 1.6, 0.05, 1.2); break;
    case 'infrastructure': tgt.industry = clamp(tgt.industry - power * 0.7, 0.05, 1.2); tgt.energy = clamp(tgt.energy - power * 0.7, 0.05, 1.2); tgt.support -= power * 30; break;
    case 'capital': tgt.stability = clamp(tgt.stability - power * 120, 0, 100); tgt.support = clamp(tgt.support - power * 20, 0, 100); break;
    default: {
      const targets = unitsAt(state, 'country', tgt.id).filter(u => u.owner === tgt.id || sameSide(state, u.owner, tgt.id));
      if (targets.length) {
        const u = targets[Math.floor(rand(state) * targets.length)];
        damageUnit(state, u, power * 600, ev, attacker ? `struck by ${state.countries[attacker].name}` : 'destroyed');
      } else tgt.industry = clamp(tgt.industry - power * 0.5, 0.05, 1.2);
    }
  }
}

function supplyFactor(state, owner, targetId) {
  const d = distanceKm(pt(state.countries[owner]), pt(state.countries[targetId]));
  return d > 5000 ? 0.6 : d > 2500 ? 0.8 : 1;
}

function resolveInvasions(state, orders, ev) {
  const byTarget = {};
  for (const o of orders) (byTarget[o.target] ||= []).push(o);
  for (const [target, os] of Object.entries(byTarget)) {
    const T = state.countries[target];
    const hostile = os.filter(o => !(sameSide(state, o.country, target) || o.country === target || T.overflight.includes(o.country)));
    // Peaceful moves just relocate.
    for (const o of os.filter(x => !hostile.includes(x))) for (const id of o.units) {
      const u = state.units[id]; if (!u) continue;
      ev.push({ kind: 'move', owner: o.country, unitType: 'army', from: anchor(state, u.loc), to: pt(T) });
      u.loc = { kind: 'country', id: target };
    }
    if (!hostile.length) continue;
    for (const o of hostile) if (!atWar(state, o.country, target)) declareWar(state, o.country, target, ev, 'invasion');
    const attackers = hostile.flatMap(o => o.units.map(id => state.units[id]).filter(Boolean).map(u => ({ u, o })));
    if (!attackers.length) continue;
    const defenders = unitsAt(state, 'country', target).filter(u => u.type === 'army' && (u.owner === target || sameSide(state, u.owner, target) || T.occupiedBy === u.owner) && !attackers.some(a => a.u.id === u.id));
    const lead = hostile[0].country;
    // A landing comes ashore from the sea zone the fleet holds; enemy warships there make it costly.
    const sea = hostile.find(o => o.amphibious && o.zone && SEA_ZONES[o.zone]);
    const origin = sea ? { lat: SEA_ZONES[sea.zone].lat, lon: SEA_ZONES[sea.zone].lon } : anchor(state, attackers[0].u.loc);
    let landingPenalty = 1;
    if (sea) {
      const ships = unitsAt(state, 'sea', sea.zone).filter(u => u.strength > 0 && (u.type === 'fleet' || u.type === 'carrier'));
      const mine = ships.filter(u => u.owner === lead || sameSide(state, u.owner, lead)).reduce((t, u) => t + u.strength, 0);
      const theirs = ships.filter(u => u.owner === target || (atWar(state, u.owner, lead) && sameSide(state, u.owner, target))).reduce((t, u) => t + u.strength, 0);
      landingPenalty = theirs ? clamp(mine / (mine + theirs), 0.3, 0.9) : 1;
      ev.push({ kind: 'landing', owner: lead, country: target, zone: sea.zone, from: origin, to: pt(T), contested: theirs > 0, n: attackers.length });
    }
    const airBonus = Math.min(0.3, 0.1 * ev.filter(e => e.kind === 'strike' && e.target === target && !e.intercepted && sameSide(state, e.owner, lead)).length);
    let A = attackers.reduce((s, { u, o }) => s + u.strength * Q(state, u.owner, 'land') * supplyFactor(state, u.owner, target) * (o.amphibious ? 0.75 * landingPenalty : 1), 0) * (1 + airBonus) * between(state, 0.8, 1.2);
    const garrison = T.occupiedBy ? 10 : 20 + T.airDefense * 3 + (T.major ? 15 : 0);
    let D = (defenders.reduce((s, u) => s + u.strength * Q(state, u.owner, 'land'), 0) + garrison) * 1.35 * between(state, 0.8, 1.2) * (T.stability / 100 * 0.4 + 0.8);
    const at = pt(T);
    const ratio = A / Math.max(1, D);
    if (ratio > 1) {
      for (const u of defenders) damageUnit(state, u, u.strength * clamp(0.6 / ratio + 0.25, 0.3, 0.95), ev, 'overrun');
      for (const { u } of attackers) damageUnit(state, u, u.strength * clamp(0.3 / ratio, 0.05, 0.45), ev, 'battle losses');
      const remainingDef = unitsAt(state, 'country', target).filter(u => u.type === 'army' && sameSide(state, u.owner, target)).reduce((s, u) => s + u.strength, 0);
      const survivors = attackers.filter(({ u }) => state.units[u.id]);
      // The front moves forward a little each turn; the country falls once the attacker holds all of it.
      // The Zeus can overrule the engine for any front: advance, hold or fall back.
      const mine = T.front && (T.front.by === lead || sameSide(state, T.front.by, lead));
      if (!mine) T.front = { by: lead, pct: 0, prev: 0, from: origin, turn: state.meta.turn, mode: T.front?.mode || 'auto' };
      else if (sea && T.front.pct < 5) T.front.from = origin;
      const engine = survivors.length ? clamp(10 + 30 * (ratio - 1), 8, 30) + (remainingDef < 15 ? 12 : 0) : 0;
      const occupied = moveFront(state, T, frontDelta(T.front.mode, engine, 15), ev);
      if (occupied) for (const { u } of survivors) u.loc = { kind: 'country', id: target };
      const cas = Math.round((A + D) * between(state, 0.6, 1.2));
      T.casualties += cas; state.global.casualties += cas; T.warWeariness += 8;
      ev.push({ kind: 'battle', attacker: lead, defender: target, at, result: 'won', occupied, front: true });
    } else {
      for (const { u } of attackers) damageUnit(state, u, u.strength * clamp(0.5 * ratio + 0.2, 0.2, 0.8), ev, 'repelled');
      for (const u of defenders) damageUnit(state, u, u.strength * clamp(0.2 * ratio, 0.03, 0.3), ev, 'held the line');
      // A failed offensive gives ground back.
      if (T.front && !T.occupiedBy && (T.front.by === lead || sameSide(state, T.front.by, lead))) {
        moveFront(state, T, frontDelta(T.front.mode, -clamp(8 / Math.max(ratio, 0.2), 8, 25), 8), ev);
      }
      const cas = Math.round((A + D) * between(state, 0.4, 0.9));
      T.casualties += cas; state.global.casualties += cas;
      ev.push({ kind: 'battle', attacker: lead, defender: target, at, result: 'repelled', occupied: false });
    }
  }
}

// Naval battles: every pair of warring navies sharing a zone fights. Carriers bring their air wings, ships near
// their own coast get shore-based air and missile cover, and crew quality matters most of all at sea.
function resolveNaval(state, ev) {
  const zones = {};
  for (const u of Object.values(state.units)) if (u.loc.kind === 'sea' && u.strength > 0) (zones[u.loc.id] ||= []).push(u);
  for (const [zone, all] of Object.entries(zones)) {
    const fought = new Set();
    for (;;) {
      const ships = all.filter(u => state.units[u.id] && u.loc.id === zone);
      const owners = [...new Set(ships.map(u => u.owner))];
      let pair = null;
      for (let i = 0; i < owners.length && !pair; i++) for (let j = i + 1; j < owners.length && !pair; j++) {
        const key = [owners[i], owners[j]].sort().join('|');
        if (!fought.has(key) && atWar(state, owners[i], owners[j])) pair = [owners[i], owners[j], key];
      }
      if (!pair) break;
      const [a, b, key] = pair; fought.add(key);
      // Each side is the belligerent plus any of its allies also at war with the other side.
      const side = (x, y) => ships.filter(u => u.owner === x || (sameSide(state, u.owner, x) && atWar(state, u.owner, y)));
      const sideA = side(a, b), sideB = side(b, a);
      const coast = SEA_ZONES[zone]?.coasts || [];
      const power = (list, lead) => list.reduce((t, u) => t + u.strength * (u.type === 'carrier' ? 2 : 1) * Q(state, u.owner, 'sea'), 0) * (coast.includes(lead) ? 1.2 : 1);
      const PA = power(sideA, a) * between(state, 0.85, 1.15), PB = power(sideB, b) * between(state, 0.85, 1.15);
      const aWins = PA >= PB;
      const win = aWins ? sideA : sideB, lose = aWins ? sideB : sideA;
      const r = Math.max(PA, PB) / Math.max(1, Math.min(PA, PB));
      const count = list => list.filter(u => state.units[u.id]).length;
      const before = { w: count(win), l: count(lose) };
      for (const u of lose) damageUnit(state, u, u.strength * clamp(0.3 + 0.18 * r, 0.35, 1), ev, 'sunk in battle');
      for (const u of win) damageUnit(state, u, u.strength * clamp(0.3 / r, 0.02, 0.3), ev, 'battle damage');
      // Losers that survive withdraw towards home waters.
      for (const u of lose) if (state.units[u.id]) {
        const home = zonesTouching(u.owner)[0];
        if (home && home !== zone) { const route = seaRoute(zone, home, new Set()); if (route && route[1]) u.loc = { kind: 'sea', id: route[1] }; }
        u.blockade = false;
      }
      const cas = Math.round((PA + PB) * 0.3);
      state.global.casualties += cas;
      ev.push({ kind: 'naval', zone, winner: win[0].owner, loser: lose[0].owner, at: { lat: SEA_ZONES[zone].lat, lon: SEA_ZONES[zone].lon },
        ships: { winner: before.w, loser: before.l }, lost: { winner: before.w - count(win), loser: before.l - count(lose) }, decisive: r >= 2 });
    }
  }
}

function updateChokepoints(state, ev) {
  for (const [zone, cp] of Object.entries(state.global.chokepoints)) {
    if (cp.forced) continue;
    const ships = unitsAt(state, 'sea', zone);
    const blockaders = ships.filter(u => u.blockade);
    const prev = cp.status;
    if (!blockaders.length) { cp.status = 'open'; cp.by = null; }
    else {
      const owner = blockaders[0].owner;
      const contested = ships.some(u => atWar(state, u.owner, owner));
      cp.status = contested ? 'contested' : 'closed'; cp.by = owner;
    }
    if (prev !== cp.status) ev.push({ kind: 'chokepoint', zone, status: cp.status, by: cp.by, prev });
  }
}

// How far a front moves this turn: the engine's figure, unless the Zeus has told this front to advance, hold or fall back.
function frontDelta(mode, engine, push) {
  if (mode === 'hold') return 0;
  if (mode === 'advance') return Math.max(engine, push);
  if (mode === 'retreat') return -Math.max(12, push);
  return engine;
}

// Moves a front by `delta` points. Reaching 100 occupies the country; falling to 0 ends the front.
// Pushing back an occupied country liberates it. Returns true when the country falls this call.
export function moveFront(state, T, delta, ev) {
  const f = T.front; if (!f || !delta) { if (f) f.turn = state.meta.turn; return false; }
  const prev = f.pct;
  f.prev = prev; f.pct = clamp(prev + delta, 0, 100); f.turn = state.meta.turn;
  ev.push({ kind: 'front', by: f.by, country: T.id, from: f.from, prev, pct: f.pct });
  if (f.pct >= 100 && prev < 100) { occupy(state, T, f.by, ev); return true; }
  if (f.pct < 100 && T.occupiedBy) {
    ev.push({ kind: 'liberation', country: T.id, from: T.occupiedBy });
    T.occupiedBy = null;
  }
  if (f.pct <= 0) T.front = null;
  return false;
}

function occupy(state, T, by, ev) {
  if (by === T.id) return;
  T.occupiedBy = by;
  T.stability = clamp(T.stability - 30, 0, 100);
  state.countries[by].influence = clamp(state.countries[by].influence + 4, 0, 100);
  state.global.closedAirspace[T.id] = state.global.closedAirspace[T.id] || { turn: state.meta.turn, at: 0 };
  ev.push({ kind: 'occupation', by, country: T.id });
}

// Fronts nobody fought over this turn: a ceasefire freezes them, peace clears them, and otherwise they follow
// their mode. On auto, a strong defender slowly retakes ground.
function updateFronts(state, ev) {
  const turn = state.meta.turn;
  for (const T of Object.values(state.countries)) {
    const f = T.front; if (!f) continue;
    if (f.turn === turn) continue;
    if (!atWar(state, f.by, T.id)) {
      const frozen = state.treaties.some(t => t.type === 'ceasefire' && t.parties.includes(f.by) && t.parties.includes(T.id));
      if (!frozen && !T.occupiedBy) T.front = null;
      continue;
    }
    const held = unitsAt(state, 'country', T.id).filter(u => u.type === 'army' && (u.owner === T.id || sameSide(state, u.owner, T.id))).reduce((t, u) => t + u.strength, 0);
    const press = unitsOf(state, f.by, 'army').reduce((t, u) => t + u.strength, 0);
    const mode = f.mode || 'auto';
    let delta = 0;
    if (mode === 'advance') delta = T.occupiedBy ? 0 : clamp(12 + 8 * (press / Math.max(40, held) - 1), 10, 22);
    else if (mode === 'retreat') delta = -15;
    else if (mode === 'auto' && !T.occupiedBy && held >= 40) delta = -6;
    if (delta) moveFront(state, T, delta, ev); else f.prev = f.pct;
  }
}

// A Zeus moves a front right now, outside the turn. Starts a front if `by` has none in this country yet.
export function pushFrontNow(state, countryId, by, delta, ctx) {
  const T = state.countries[countryId], B = state.countries[by];
  if (!T || !B || countryId === by) return 'Pick a country and who is attacking it.';
  if (!atWar(state, by, countryId) && !T.front) return `${B.name} is not at war with ${T.name}.`;
  if (T.front && T.front.by !== by && !sameSide(state, T.front.by, by)) return `${state.countries[T.front.by].name} already holds the front in ${T.name}.`;
  if (!T.front) {
    if (delta <= 0) return `${B.name} holds no ground in ${T.name}.`;
    T.front = { by, pct: 0, prev: 0, from: { lat: B.lat, lon: B.lon }, turn: state.meta.turn, mode: 'auto' };
  }
  const ev = [];
  moveFront(state, T, delta, ev);
  state.lastResolution = { turn: state.meta.turn, at: ctx.now, instant: true, events: ev.filter(e => ANIMATED.includes(e.kind)) };
  publish(state, ev, ctx);
  return null;
}

function moveFleet(state, o, ev) {
  for (const id of o.units) {
    const u = state.units[id]; if (!u) continue;
    const route = seaRoute(u.loc.id, o.zone, blockedFor(state, o.country));
    if (!route) continue;
    const steps = route.slice(0, FLEET_MOVES_PER_TURN * 2 + 1);
    ev.push({ kind: 'fleet', owner: o.country, unitType: u.type, path: steps.map(z => ({ lat: SEA_ZONES[z].lat, lon: SEA_ZONES[z].lon })) });
    u.loc = { kind: 'sea', id: steps[steps.length - 1] };
    if (o.type === 'blockade') u.blockade = steps[steps.length - 1] === o.zone;
  }
}

function resolveCovert(state, o, ev) {
  const c = state.countries[o.country], t = o.target && state.countries[o.target];
  const turn = state.meta.turn;
  switch (o.type) {
    case 'cyber': {
      const detected = chance(state, 0.35);
      if (o.kind === 'grid') { t.cyber.grid = turn + 2; t.energy = clamp(t.energy - 0.15, 0.05, 1.2); }
      if (o.kind === 'banks') { t.treasury -= t.gdp * 0.02; t.inflation += 2; }
      if (o.kind === 'radar') t.cyber.radar = turn + 1;
      if (detected) shiftRelation(state, o.country, o.target, -20);
      ev.push({ kind: 'cyber', owner: o.country, target: o.target, type: o.kind, detected });
      break;
    }
    case 'intel': {
      const blind = c.blindUntil >= turn;
      if (!blind) c.intel[o.target] = turn + 3;
      ev.push({ kind: 'intel', owner: o.country, target: o.target, blind });
      break;
    }
    case 'spy': {
      const detected = chance(state, 0.3);
      if (o.kind === 'steal') c.intel[o.target] = turn + 4;
      if (o.kind === 'sabotage') t.industry = clamp(t.industry - 0.05, 0.05, 1.2);
      if (o.kind === 'defector') { t.stability = clamp(t.stability - 5, 0, 100); c.intel[o.target] = turn + 2; }
      if (detected) shiftRelation(state, o.country, o.target, -20);
      ev.push({ kind: 'spy', owner: o.country, target: o.target, type: o.kind, detected });
      break;
    }
    case 'satellite': t.blindUntil = turn + 3; ev.push({ kind: 'satellite', owner: o.country, target: o.target }); break;
    case 'propaganda': {
      const backfire = chance(state, 0.2);
      if (backfire) { c.influence = clamp(c.influence - 5, 0, 100); c.support = clamp(c.support - 3, 0, 100); }
      else if (t) t.support = clamp(t.support - 4, 0, 100);
      else c.support = clamp(c.support + 6, 0, 100);
      ev.push({ kind: 'propaganda', owner: o.country, target: o.target || null, backfire });
      break;
    }
  }
}

function resolveDiplomacy(state, o, ev) {
  const a = o.country, b = o.target, A = state.countries[a], B = b && state.countries[b];
  switch (o.type) {
    case 'war': declareWar(state, a, b, ev, 'declared'); break;
    case 'ceasefire': case 'peace': {
      state.wars = state.wars.filter(w => !((w.a === a && w.b === b) || (w.a === b && w.b === a)));
      state.treaties = state.treaties.filter(t => !(t.type === 'ceasefire' && t.parties.includes(a) && t.parties.includes(b)));
      state.treaties.push({ type: o.type, parties: [a, b], turn: state.meta.turn, terms: o.terms || null });
      shiftRelation(state, a, b, o.type === 'peace' ? 60 : 30);
      if (o.type === 'peace') {
        const t = o.terms || {};
        for (const [x, y] of [[a, b], [b, a]]) {
          const X = state.countries[x];
          if (t.returnTerritory !== false && (X.occupiedBy === y || X.front?.by === y)) { X.occupiedBy = null; X.front = null; }
        }
        if (t.reparations > 0 && t.payer && t.payee) { state.countries[t.payer].treasury -= t.reparations; state.countries[t.payee].treasury += t.reparations; }
        if (t.demilitarize) for (const u of Object.values(state.units)) if ((u.owner === a && u.loc.id === b) || (u.owner === b && u.loc.id === a)) u.loc = { kind: u.loc.kind, id: u.loc.kind === 'country' ? u.owner : u.loc.id };
      }
      ev.push({ kind: o.type, a, b });
      break;
    }
    case 'alliance': state.treaties.push({ type: 'alliance', parties: [a, b], turn: state.meta.turn }); shiftRelation(state, a, b, 40); ev.push({ kind: 'alliance', a, b }); break;
    case 'sanction': if (!A.sanctions.includes(b)) A.sanctions.push(b); shiftRelation(state, a, b, -25); ev.push({ kind: 'sanction', a, b }); break;
    case 'unsanction': A.sanctions = A.sanctions.filter(x => x !== b); shiftRelation(state, a, b, 10); ev.push({ kind: 'unsanction', a, b }); break;
    case 'trade': state.treaties.push({ type: 'trade', parties: [a, b], turn: state.meta.turn }); shiftRelation(state, a, b, 15); ev.push({ kind: 'trade', a, b }); break;
    case 'aid': A.treasury -= o.amount; B.treasury += o.amount; B.support = clamp(B.support + 2, 0, 100); shiftRelation(state, a, b, 10); ev.push({ kind: 'aid', a, b, amount: o.amount }); break;
    case 'arms': {
      const u = unitsOf(state, a, o.unitType).sort((x, y) => y.strength - x.strength)[0];
      if (!u) break;
      u.owner = b;
      if (u.loc.kind === 'country') u.loc = { kind: 'country', id: b };
      else { const z = zonesTouching(b)[0]; if (z) u.loc = { kind: 'sea', id: z }; }
      shiftRelation(state, a, b, 15);
      ev.push({ kind: 'arms', a, b, unitType: o.unitType });
      break;
    }
    case 'overflight': if (!A.overflight.includes(b)) A.overflight.push(b); shiftRelation(state, a, b, 10); ev.push({ kind: 'overflight', a, b }); break;
    case 'roe': A.roe = o.kind; ev.push({ kind: 'roe', a, value: o.kind }); break;
    case 'election': {
      if (A.support < 40) { A.support = 55; A.stability = clamp(A.stability + 10, 0, 100); A.roe = 'defensive'; ev.push({ kind: 'election', a, outcome: 'ousted' }); }
      else { A.support = clamp(A.support + 5, 0, 100); ev.push({ kind: 'election', a, outcome: 're-elected' }); }
      break;
    }
  }
}

// Executes a batch of orders in priority order. Invasions are collected and fought together afterwards.
function runOrders(state, list, ctx, ev) {
  const turn = state.meta.turn;
  const invasions = [];
  const salvos = {};
  list.sort((x, y) => PRIORITY.indexOf(x.type) - PRIORITY.indexOf(y.type));
  for (const o of list) {
    // Units may have been destroyed by earlier orders this turn.
    if (o.units) o.units = o.units.filter(id => state.units[id]);
    const v = validateOrder(state, o);
    if (!v.ok) { o.status = 'refused'; o.result = v.reason; ev.push({ kind: 'refused', country: o.country, text: describeOrder(state, o), reason: v.reason }); continue; }
    o.status = 'done';
    switch (o.type) {
      case 'strike': resolveStrike(state, o, ctx, ev, salvos); break;
      case 'invade': invasions.push(o); break;
      case 'rebase': for (const id of o.units) { const u = state.units[id]; if (u) { ev.push({ kind: 'move', owner: o.country, unitType: u.type, from: anchor(state, u.loc), to: pt(state.countries[o.target]) }); u.loc = { kind: 'country', id: o.target }; } } break;
      case 'fleet': case 'blockade': moveFleet(state, o, ev); break;
      case 'lift': for (const u of unitsOf(state, o.country)) u.blockade = false; ev.push({ kind: 'lift', a: o.country }); break;
      case 'cap': for (const u of unitsOf(state, o.country, 'fighter')) if (u.loc.id === o.country) u.cap = true; break;
      case 'alert': state.countries[o.country].nuclear.alert = true; ev.push({ kind: 'alert', a: o.country }); break;
      case 'nuke': {
        const T = state.countries[o.target];
        T.damage = 1; T.gdp *= 0.3; T.industry = 0.1; T.energy = 0.1; T.stability = 5; T.support = 10;
        const cas = Math.round(T.base.pop * 15);
        T.casualties += cas; state.global.casualties += cas; state.global.nukesUsed++;
        state.global.closedAirspace[o.target] = { turn, at: ctx.now };
        if (!atWar(state, o.country, o.target)) declareWar(state, o.country, o.target, ev, 'nuclear');
        ev.push({ kind: 'nuke', owner: o.country, target: o.target, from: pt(state.countries[o.country]), to: pt(T), at: pt(T) });
        break;
      }
      case 'cyber': case 'intel': case 'spy': case 'satellite': case 'propaganda': resolveCovert(state, o, ev); break;
      case 'neo': resolveEvacuation(state, o, ev); break;
      default: resolveDiplomacy(state, o, ev);
    }
  }
  return invasions;
}

// Non-combatant evacuation: citizens are flown out of a crisis, or taken off by sea when the airspace is shut.
function resolveEvacuation(state, o, ev) {
  const c = state.countries[o.country], T = state.countries[o.target];
  const zone = zonesTouching(o.target).find(z => unitsAt(state, 'sea', z).some(u => u.owner === o.country && u.strength > 0))
    || (state.global.closedAirspace[o.target] ? zonesTouching(o.target)[0] : null);
  const danger = enemiesOf(state, o.target).length > 0 || !!state.global.closedAirspace[o.target] || T.stability < 35;
  const evacuees = Math.round((danger ? 2500 : 800) * (0.6 + Math.sqrt(c.base.pop) / 12) * between(state, 0.7, 1.3) / 100) * 100;
  c.support = clamp(c.support + (danger ? 4 : 1), 0, 100);
  if (enemiesOf(state, o.target).some(e => sameSide(state, e, o.country))) shiftRelation(state, o.country, o.target, -3);
  // A friendly staging point: the nearest allied capital, or home.
  const allies = Object.values(state.countries).filter(x => x.id !== o.target && (x.id === o.country || sameSide(state, x.id, o.country) || relation(state, x.id, o.country) > 40) && !enemiesOf(state, x.id).length && x.lat != null);
  const stage = allies.sort((a, b) => distanceKm(pt(a), pt(T)) - distanceKm(pt(b), pt(T)))[0] || c;
  ev.push({ kind: 'neo', owner: o.country, country: o.target, from: pt(T), to: pt(stage), stage: stage.id, zone, sea: zone ? { lat: SEA_ZONES[zone].lat, lon: SEA_ZONES[zone].lon } : null, evacuees, danger });
}

export function resolveTurn(state, ctx) {
  const ev = [];
  const turn = state.meta.turn;
  // AI countries decide at the same moment as everyone else.
  Object.defineProperty(state, '_aiEvents', { value: ev, configurable: true, enumerable: false });
  const aiOrders = planAI(state, ctx);
  delete state._aiEvents;
  for (const o of aiOrders) state.orders.push(o);
  const queued = state.orders.filter(o => o.turn === turn && o.status === 'queued');
  // CAP resets every turn; it only lasts while ordered.
  for (const u of Object.values(state.units)) u.cap = false;
  const invasions = runOrders(state, queued, ctx, ev);
  resolveNaval(state, ev);
  resolveInvasions(state, invasions, ev);
  updateFronts(state, ev);
  updateChokepoints(state, ev);

  // Capitulation: occupied, exhausted countries stop fighting.
  for (const c of Object.values(state.countries)) {
    if (c.occupiedBy && c.support < 20 && !c.capitulated && unitsOf(state, c.id, 'army').length === 0) {
      c.capitulated = true;
      state.wars = state.wars.filter(w => w.a !== c.id && w.b !== c.id);
      ev.push({ kind: 'capitulation', country: c.id, to: c.occupiedBy });
    }
  }

  // Airspace: countries at war stay closed; others reopen after two quiet turns.
  for (const id of Object.keys(state.global.closedAirspace)) {
    const atWarNow = enemiesOf(state, id).length > 0;
    const c = state.countries[id];
    if (!atWarNow && c && turn - Math.max(c.lastStruck || 0, state.global.closedAirspace[id].turn) >= 2) delete state.global.closedAirspace[id];
  }
  for (const w of state.wars) for (const id of [w.a, w.b]) if (!state.global.closedAirspace[id]) state.global.closedAirspace[id] = { turn, at: ctx.now };

  tickEconomy(state, ev, ctx);
  updateTension(state, ev);

  state.lastResolution = { turn, at: ctx.now, events: ev.filter(e => ANIMATED.includes(e.kind)) };
  publish(state, ev, ctx);
  state.log.push({ turn, at: ctx.now, events: ev.length, summary: summarize(state, ev) });
  if (state.log.length > 200) state.log.shift();
  state.meta.turn += 1;
  const d = new Date(state.meta.clock + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + state.meta.turnDays);
  state.meta.clock = d.toISOString().slice(0, 10);
  for (const c of Object.values(state.countries)) c.nuclear.alert = c.nuclear.alert && state.global.tension >= 7;
  state.history.push(snapshotStats(state));
  if (state.history.length > 300) state.history.shift();
  return ev;
}

// Sends headlines and ending suggestions to the review queue.
function publish(state, ev, ctx) {
  const turn = state.meta.turn;
  const headlines = headlinesFrom(state, ev);
  for (const h of headlines) {
    const item = { id: newId(state, 'n'), turn, kind: 'news', status: state.settings.autoAir ? 'aired' : 'pending', priority: h.priority || 1, en: h.en, ar: h.ar, detail: h.detail || '', at: ctx.now };
    state.review.push(item);
    if (item.status === 'aired') state.aired.push({ ...item, airedAt: ctx.now });
  }
  for (const e of detectEndings(state, ev)) {
    if (state.review.some(r => r.kind === 'ending' && r.ending === e.type && r.status === 'pending')) continue;
    state.review.push({ id: newId(state, 'e'), turn, kind: 'ending', ending: e.type, status: 'pending', priority: e.type === 'nuclear' ? 9 : 5, en: e.en, ar: e.ar, at: ctx.now });
  }
}

// Runs orders immediately, outside the weekly turn (signed treaties, Kronos interventions). The clock does not advance.
export function resolveNow(state, orders, ctx) {
  const ev = [];
  for (const o of orders) { o.turn = state.meta.turn; o.status = 'queued'; state.orders.push(o); }
  const invasions = runOrders(state, orders, ctx, ev);
  resolveInvasions(state, invasions, ev);
  updateChokepoints(state, ev);
  for (const w of state.wars) for (const id of [w.a, w.b]) if (!state.global.closedAirspace[id]) state.global.closedAirspace[id] = { turn: state.meta.turn, at: ctx.now };
  state.lastResolution = { turn: state.meta.turn, at: ctx.now, instant: true, events: ev.filter(e => ANIMATED.includes(e.kind)) };
  publish(state, ev, ctx);
  return ev;
}

function updateTension(state, ev) {
  const g = state.global;
  let d = 0;
  const has = k => ev.some(e => e.kind === k);
  if (ev.some(e => e.kind === 'war' && state.countries[e.a]?.major && state.countries[e.b]?.major)) d += 1;
  if (ev.filter(e => e.kind === 'strike' && !e.intercepted).some(e => state.countries[e.target]?.major)) d += 0.5;
  if (has('occupation')) d += 1;
  if (has('alert')) d += 1.5;
  if (ev.some(e => e.kind === 'chokepoint' && e.status === 'closed')) d += 0.5;
  if (has('naval')) d += 0.5;
  d = Math.min(d, 2);
  if (has('nuke')) d += 3;
  if (has('ceasefire') || has('peace')) d -= 1;
  if (g.pauseUntil >= state.meta.turn) d -= 1;
  const hostile = ev.some(e => ['war', 'strike', 'battle', 'naval', 'alert', 'nuke'].includes(e.kind));
  if (!hostile && g.tension > 3 && state.wars.length === 0) d -= 1;
  if (state.wars.length && !hostile) d -= 0.5;
  const before = g.tension;
  g.tension = clamp(Math.round((g.tension + d) * 2) / 2, 0, 10);
  if (Math.floor(g.tension) !== Math.floor(before)) ev.push({ kind: 'tension', from: before, to: g.tension });
}

function summarize(state, ev) {
  const n = k => ev.filter(e => e.kind === k).length;
  const parts = [];
  if (n('strike')) parts.push(`${n('strike')} strikes (${ev.filter(e => e.kind === 'strike' && e.intercepted).length} intercepted)`);
  if (n('battle')) parts.push(`${n('battle')} land battles`);
  if (n('naval')) parts.push(`${n('naval')} naval battles`);
  if (n('war')) parts.push(`${n('war')} new wars`);
  if (n('refused')) parts.push(`${n('refused')} orders refused`);
  return parts.join(', ') || 'A quiet week.';
}
