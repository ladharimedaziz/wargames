// Order definitions, validation and unit selection. Used for live previews in the panel and again at resolution.
import { SEA_ZONES, FLEET_MOVES_PER_TURN } from '../data/places.js';
import { AMPHIBIOUS_A3, NEO_A3, AIRBORNE_KM, US_AIRCRAFT } from '../data/militaries.js';
import { distanceKm, seaRoute, zonesTouching } from '../geo.js';
import { clamp, UNIT_TYPES, TARGET_TYPES, ROE, anchor, unitRange, unitsOf, atWar, sameSide, countryName, isActive, isOOB, OOB_ERROR } from './core.js';

export const ORDER_TYPES = {
  strike:     { label: 'Air or missile strike', group: 'military', needs: ['target'] },
  invade:     { label: 'Invade / move armies', group: 'military', needs: ['target'] },
  rebase:     { label: 'Rebase air wings', group: 'military', needs: ['target'] },
  fleet:      { label: 'Move fleet', group: 'military', needs: ['zone'] },
  blockade:   { label: 'Blockade a sea zone', group: 'military', needs: ['zone'] },
  siege:      { label: 'Naval blockade of a country', group: 'military', needs: ['target'] },
  lift:       { label: 'Lift blockade', group: 'military', needs: [] },
  cap:        { label: 'Air patrol over home', group: 'military', needs: [] },
  alert:      { label: 'Nuclear alert', group: 'military', needs: [] },
  nuke:       { label: 'Nuclear launch', group: 'military', needs: ['target'] },
  war:        { label: 'Declare war', group: 'diplomacy', needs: ['target'] },
  ceasefire:  { label: 'Ceasefire', group: 'diplomacy', needs: ['target'] },
  peace:      { label: 'Peace treaty', group: 'diplomacy', needs: ['target'] },
  alliance:   { label: 'Form alliance', group: 'diplomacy', needs: ['target'] },
  sanction:   { label: 'Impose sanctions', group: 'economy', needs: ['target'] },
  unsanction: { label: 'Lift sanctions', group: 'economy', needs: ['target'] },
  trade:      { label: 'Trade deal', group: 'economy', needs: ['target'] },
  aid:        { label: 'Send money or aid', group: 'economy', needs: ['target', 'amount'] },
  arms:       { label: 'Arms transfer', group: 'economy', needs: ['target', 'unitType'] },
  overflight: { label: 'Grant overflight rights', group: 'diplomacy', needs: ['target'] },
  cyber:      { label: 'Cyber attack', group: 'covert', needs: ['target', 'kind'] },
  intel:      { label: 'Intelligence sweep', group: 'covert', needs: ['target'] },
  spy:        { label: 'Spy operation', group: 'covert', needs: ['target', 'kind'] },
  satellite:  { label: 'Blind enemy satellites', group: 'covert', needs: ['target'] },
  propaganda: { label: 'Propaganda campaign', group: 'covert', needs: [] },
  neo:        { label: 'Evacuate citizens (NEO)', group: 'military', needs: ['target'] },
  helistrike: { label: 'Helicopter strike', group: 'military', needs: ['target'] },
  airassault: { label: 'Air assault behind the lines', group: 'military', needs: ['target'] },
  airdrop:    { label: 'Paratroop drop', group: 'military', needs: ['target'] },
  roe:        { label: 'Rules of engagement', group: 'military', needs: ['kind'] },
  election:   { label: 'Call an election', group: 'politics', needs: [] },
};

export const CYBER_KINDS = ['grid', 'banks', 'radar'];
export const SPY_KINDS = ['steal', 'sabotage', 'defector'];

const fail = reason => ({ ok: false, reason });

// Picks the best units of a type for reaching a point: in range first, nearest first, strongest first.
export function pickUnits(state, owner, type, toPoint, count = 1, exclude = []) {
  const units = unitsOf(state, owner, type).filter(u => !exclude.includes(u.id));
  const scored = units.map(u => ({ u, d: distanceKm(anchor(state, u.loc), toPoint), range: unitRange(state, u) }));
  scored.sort((a, b) => (a.d <= a.range) === (b.d <= b.range) ? a.d - b.d || b.u.strength - a.u.strength : (a.d <= a.range ? -1 : 1));
  return { chosen: scored.filter(s => s.d <= s.range || !s.range).slice(0, count), nearest: scored[0] };
}

export function validateOrder(state, o) {
  const c = state.countries[o.country];
  if (!c) return fail('Unknown country.');
  if (c.capitulated) return fail(`${c.name} has capitulated and can no longer act.`);
  if (isOOB(o.country) || isOOB(o.target)) return fail(OOB_ERROR);
  const T = o.target ? state.countries[o.target] : null;
  if (ORDER_TYPES[o.type]?.needs.includes('target') && !T) return fail('Pick a target country.');
  if (T && o.target === o.country && !['roe', 'propaganda', 'election', 'cap', 'alert'].includes(o.type) && o.type !== 'rebase' && o.type !== 'invade') return fail('A country cannot target itself.');
  const units = (o.units || []).map(id => state.units[id]).filter(Boolean);

  switch (o.type) {
    case 'strike': {
      if (!units.length) return fail(`${c.name} has no bomber, fighter, missile or carrier unit able to reach ${T.name}.`);
      const to = { lat: T.lat, lon: T.lon };
      for (const u of units) {
        if (u.owner !== o.country) return fail('Units must belong to the acting country.');
        if (!['bomber', 'fighter', 'missile', 'carrier'].includes(u.type)) return fail(`${UNIT_TYPES[u.type].name} cannot carry out strikes.`);
        const d = distanceKm(anchor(state, u.loc), to), r = unitRange(state, u);
        if (d > r) return fail(`${UNIT_TYPES[u.type].name} based in ${countryName(state, u.loc.id)} is ${Math.round(d)} km from ${T.name}; its range is ${r} km.`);
      }
      if (o.category && !TARGET_TYPES.includes(o.category)) return fail('Unknown target type.');
      if (o.aircraft) {
        const spec = US_AIRCRAFT[o.aircraft];
        if (!spec) return fail('Unknown aircraft.');
        if (c.a3 !== 'USA') return fail(`Only the United States flies the ${spec.name}.`);
        if (units.some(u => u.type !== spec.type)) return fail(`The ${spec.name} flies from ${spec.type === 'bomber' ? 'bomber' : 'fighter'} wings.`);
        if (o.payload === 'moab' && o.aircraft !== 'b2') return fail('The heavy bomb is a B-2 option.');
      }
      if (sameSide(state, o.country, o.target)) return fail(`${T.name} is on the same side as ${c.name}.`);
      return { ok: true };
    }
    case 'invade': {
      const armies = units.filter(u => u.type === 'army');
      if (!armies.length) return fail(`${c.name} has no army groups available.`);
      const friendly = sameSide(state, o.country, o.target) || o.target === o.country || T.overflight.includes(o.country);
      for (const u of armies) {
        if (u.loc.kind !== 'country') return fail('Army is not on land.');
        const from = u.loc.id;
        if (from === o.target) return fail('That army is already there.');
        const adjacent = (state.adjacency[from] || []).includes(o.target);
        if (adjacent) continue;
        const seaOk = friendly || canLandBySea(state, o.country);
        const zone = seaOk && liftZone(state, o.country, o.target);
        if (zone) { o.amphibious = true; o.zone = zone; continue; }
        // No fleet off the coast yet: the nearest warships in range sail there as part of the order.
        const plan = seaOk && sailPlan(state, o.country, o.target);
        if (plan) { o.amphibious = true; o.zone = plan.zone; o.sail = plan.unit; continue; }
        // Landlocked, or out of reach by sea: countries with paratroopers fly the spearhead in.
        if (airdropReach(state, o.country, o.target, u)) { o.airborne = true; continue; }
        return fail(`${T.name} does not border ${countryName(state, from)}${zonesTouching(o.target).length ? `, and ${c.name} has no warships within reach of its coast for a landing` : ' and has no coast'}${AIRBORNE_KM[c.a3] ? `; ${T.name} is also beyond ${c.name}'s paratroop range` : `, and ${c.name} has no paratroopers to fly in`}.`);
      }
      if (o.airborne && armies.length > 2) return fail('Paratroopers can drop at most two army groups at once.');
      if (sameSide(state, o.country, o.target) || o.target === o.country) return { ok: true, peaceful: true };
      if (T.overflight.includes(o.country)) return { ok: true, peaceful: true };
      return { ok: true };
    }
    case 'rebase': {
      const air = units.filter(u => ['fighter', 'bomber', 'missile', 'airdef'].includes(u.type));
      if (!air.length) return fail('Pick air or missile units to rebase.');
      if (!(o.target === o.country || sameSide(state, o.country, o.target) || T.overflight.includes(o.country))) return fail(`${T.name} has not agreed to host ${c.name}'s forces.`);
      return { ok: true };
    }
    case 'fleet': case 'blockade': {
      if (!SEA_ZONES[o.zone]) return fail('Pick a sea zone.');
      const ships = units.filter(u => u.type === 'fleet' || u.type === 'carrier');
      if (!ships.length) return fail(`${c.name} has no fleet available.`);
      for (const u of ships) {
        const route = seaRoute(u.loc.id, o.zone, blockedFor(state, o.country));
        if (!route) return fail(`No open sea route from ${SEA_ZONES[u.loc.id].name} to ${SEA_ZONES[o.zone].name}.`);
        if (route.length - 1 > FLEET_MOVES_PER_TURN * 2) return fail(`${SEA_ZONES[o.zone].name} is ${route.length - 1} zones away; a fleet can sail at most ${FLEET_MOVES_PER_TURN * 2} in one turn.`);
      }
      return { ok: true };
    }
    case 'siege': {
      const coast = zonesTouching(o.target);
      if (!coast.length) return fail(`${T.name} has no coastline to blockade.`);
      if (sameSide(state, o.country, o.target)) return fail(`${T.name} is on the same side as ${c.name}.`);
      const ships = units.filter(u => u.type === 'fleet' || u.type === 'carrier');
      if (!ships.length) return fail(`${c.name} has no warships able to reach ${T.name}'s coast.`);
      const blocked = blockedFor(state, o.country);
      for (const u of ships) {
        const best = coast.map(z => seaRoute(u.loc.id, z, blocked)).filter(Boolean).sort((a, b) => a.length - b.length)[0];
        if (!best) return fail(`No open sea route from ${SEA_ZONES[u.loc.id].name} to ${T.name}'s coast.`);
        if (best.length - 1 > FLEET_MOVES_PER_TURN * 2) return fail(`${T.name}'s coast is ${best.length - 1} zones from ${SEA_ZONES[u.loc.id].name}; a fleet can sail at most ${FLEET_MOVES_PER_TURN * 2} in one turn.`);
      }
      return { ok: true };
    }
    case 'nuke': {
      if (!c.nuclear.has) return fail(`${c.name} has no nuclear weapons.`);
      if (state.global.tension < 10 && !state.global.nukeOverride) return fail(`Nuclear launch is impossible below Global Tension 10 (currently ${state.global.tension}).`);
      return { ok: true };
    }
    case 'alert': if (!c.nuclear.has) return fail(`${c.name} has no nuclear weapons.`); return { ok: true };
    case 'war': if (atWar(state, o.country, o.target)) return fail('Already at war.'); return { ok: true };
    case 'ceasefire': case 'peace': if (!atWar(state, o.country, o.target)) return fail(`${c.name} is not at war with ${T.name}.`); return { ok: true };
    case 'aid': if (!(o.amount > 0)) return fail('Enter an amount in $bn.'); if (o.amount > c.treasury + c.gdp * 0.02) return fail(`${c.name} cannot afford $${o.amount}bn (treasury $${Math.round(c.treasury)}bn).`); return { ok: true };
    case 'arms': {
      if (!UNIT_TYPES[o.unitType]) return fail('Pick a unit type to transfer.');
      if (!unitsOf(state, o.country, o.unitType).length) return fail(`${c.name} has no ${UNIT_TYPES[o.unitType].name.toLowerCase()} to give.`);
      return { ok: true };
    }
    case 'cyber': if (!CYBER_KINDS.includes(o.kind)) return fail('Pick grid, banks or radar.'); return { ok: true };
    case 'spy': if (!SPY_KINDS.includes(o.kind)) return fail('Pick steal, sabotage or defector.'); return { ok: true };
    case 'roe': if (!ROE.includes(o.kind)) return fail('Pick defensive, firm or forward.'); return { ok: true };
    case 'neo': {
      if (!canEvacuate(state, o.country)) return fail(`${c.name} does not have the long-range airlift or ships for an evacuation.`);
      if (atWar(state, o.country, o.target)) return fail(`${c.name} is at war with ${T.name}; its citizens cannot be flown out.`);
      return { ok: true };
    }
    case 'airdrop': {
      if (!AIRBORNE_KM[c.a3]) return fail(`${c.name} has no paratroopers. Countries with airborne forces include the US, Russia, China, the UK, France, India and Turkey.`);
      const armies = units.filter(u => u.type === 'army' && u.loc.kind === 'country' && u.loc.id !== o.target);
      if (!armies.length) return fail(`${c.name} has no army group available to drop.`);
      if (armies.length > 2) return fail('Paratroopers can drop at most two army groups at once.');
      if (!armies.every(u => airdropReach(state, o.country, o.target, u))) return fail(`${T.name} is beyond ${c.name}'s paratroop range (${AIRBORNE_KM[c.a3].toLocaleString('en-US')} km).`);
      o.airborne = true;
      if (sameSide(state, o.country, o.target) || T.overflight.includes(o.country)) return { ok: true, peaceful: true };
      return { ok: true };
    }
    case 'helistrike': case 'airassault': {
      // Helicopters fly from the front line: the two sides touch on land, one holds ground in the other, or the
      // attacker has forces based in a friendly country next door (US troops in Kuwait next to Iraq).
      if (sameSide(state, o.country, o.target)) return fail(`${T.name} is on the same side as ${c.name}.`);
      const touch = (state.adjacency[o.country] || []).includes(o.target) || T.front?.by === o.country || c.front?.by === o.target
        || Object.values(state.units).some(u => u.owner === o.country && u.loc.kind === 'country' && (u.loc.id === o.target
          || ((state.adjacency[u.loc.id] || []).includes(o.target) && sameSide(state, u.loc.id, o.country))));
      // Or from the sea: a carrier group, or a navy with landing ships, sitting off the coast.
      const deck = !touch && heliDeck(state, o.country, o.target);
      if (!touch && !deck) return fail(`${c.name} has no front line with ${T.name} for helicopters to cross, and no strike group off its coast to fly them from.`);
      o.fromSea = deck || null;
      const army = Object.values(state.units).filter(u => u.owner === o.country && u.type === 'army' && u.strength > 20);
      if (!army.length) return fail(`${c.name} has no army aviation left.`);
      if (o.type === 'airassault') o.units = [army.find(u => u.loc.id === o.target)?.id || army[0].id];
      return { ok: true };
    }
    case 'lift': case 'cap': case 'propaganda': case 'election': case 'intel': case 'satellite':
    case 'alliance': case 'sanction': case 'unsanction': case 'trade': case 'overflight':
      return { ok: true };
    default: return fail('Unknown order type.');
  }
}

export function hasSeaLift(state, owner, target) { return !!liftZone(state, owner, target); }

// The sea zone off `target` where `owner` has warships to cover a landing (the strongest group if several).
export function liftZone(state, owner, target) {
  const zones = zonesTouching(target), power = {};
  for (const u of Object.values(state.units)) if (u.owner === owner && u.strength > 0 && (u.type === 'fleet' || u.type === 'carrier') && zones.includes(u.loc.id)) power[u.loc.id] = (power[u.loc.id] || 0) + u.strength;
  return Object.keys(power).sort((a, b) => power[b] - power[a])[0] || null;
}

// Long-range airlift, or ships and marines that can reach a crisis: these countries can run evacuations.
export function canEvacuate(state, owner) {
  return NEO_A3.includes(state.countries[owner]?.a3) || Object.values(state.units).some(u => u.owner === owner && u.type === 'carrier' && u.strength > 0);
}

// Large navies with landing ships, or any country with a carrier group, can land troops on a defended coast.
export function canLandBySea(state, owner) {
  return AMPHIBIOUS_A3.includes(state.countries[owner]?.a3) || Object.values(state.units).some(u => u.owner === owner && u.type === 'carrier' && u.strength > 0);
}

// Warships of `owner` that can reach a sea zone off `target` this turn: the closest one sails there to cover a landing.
export function sailPlan(state, owner, target) {
  const coast = zonesTouching(target); if (!coast.length) return null;
  const blocked = blockedFor(state, owner);
  let best = null;
  for (const u of Object.values(state.units)) {
    if (u.owner !== owner || u.strength <= 0 || (u.type !== 'fleet' && u.type !== 'carrier') || u.loc.kind !== 'sea') continue;
    for (const z of coast) {
      const r = seaRoute(u.loc.id, z, blocked);
      if (r && r.length - 1 <= FLEET_MOVES_PER_TURN * 2 && (!best || r.length < best.len || (r.length === best.len && u.type === 'carrier'))) best = { unit: u.id, zone: z, len: r.length };
    }
  }
  return best;
}

// Paratroopers fly from home or from wherever the army group is, up to the country's airborne range.
export function airdropReach(state, owner, target, u) {
  const km = AIRBORNE_KM[state.countries[owner]?.a3]; if (!km) return false;
  const T = state.countries[target], to = { lat: T.lat, lon: T.lon };
  const from = u ? anchor(state, u.loc) : null, home = state.countries[owner];
  return Math.min(distanceKm({ lat: home.lat, lon: home.lon }, to), from ? distanceKm(from, to) : Infinity) <= km;
}

// A sea zone off `target` holding a deck for helicopters: a carrier, or warships of a navy with landing ships.
export function heliDeck(state, owner, target) {
  const zones = zonesTouching(target), amphib = AMPHIBIOUS_A3.includes(state.countries[owner]?.a3);
  const ships = Object.values(state.units).filter(u => u.owner === owner && u.strength > 0 && zones.includes(u.loc.id) && (u.type === 'carrier' || (amphib && u.type === 'fleet')));
  ships.sort((a, b) => (b.type === 'carrier') - (a.type === 'carrier'));
  return ships[0]?.loc.id || null;
}

// Chokepoints closed by an enemy of `owner` are impassable for its fleets.
export function blockedFor(state, owner) {
  const b = new Set();
  for (const [z, cp] of Object.entries(state.global.chokepoints)) if (cp.status === 'closed' && cp.by && cp.by !== owner && !sameSide(state, owner, cp.by)) b.add(z);
  return b;
}

// Fills in units automatically for an order that names only a count (used by the command bar and quick buttons).
export function autoUnits(state, o, counts = {}) {
  const T = o.target && state.countries[o.target];
  if (o.type === 'strike' && T) {
    const to = { lat: T.lat, lon: T.lon };
    // A named American aircraft flies from the matching wings; the B-2 can carry the heavy bomb instead.
    const spec = counts.aircraft && US_AIRCRAFT[counts.aircraft];
    if (spec) { o.aircraft = counts.aircraft; o.payload = counts.aircraft === 'b2' && counts.payload === 'moab' ? 'moab' : null; counts = { ...counts, type: spec.type }; }
    const want = counts.type ? [[counts.type, counts.n || 1]] : [['bomber', counts.n || 1]];
    let units = [];
    for (const [type, n] of want) units.push(...pickUnits(state, o.country, type, to, n).chosen.map(s => s.u.id));
    if (!units.length && !counts.type) for (const type of ['missile', 'carrier', 'fighter']) { const p = pickUnits(state, o.country, type, to, counts.n || 1).chosen; if (p.length) { units = p.map(s => s.u.id); break; } }
    o.units = units;
    if (counts.escort) o.escort = pickUnits(state, o.country, 'fighter', to, counts.escort, units).chosen.map(s => s.u.id);
    if (!o.units.length) {
      const near = ['bomber', 'missile', 'carrier', 'fighter'].map(t => pickUnits(state, o.country, t, to, 1).nearest).filter(Boolean).sort((a, b) => a.d - b.d)[0];
      o._why = near ? `Nearest ${UNIT_TYPES[near.u.type].name.toLowerCase()} is ${Math.round(near.d)} km away (range ${near.range} km).` : `${state.countries[o.country].name} has no strike units left.`;
    }
  } else if (o.type === 'invade' && T) {
    let armies = unitsOf(state, o.country, 'army').filter(u => u.loc.kind === 'country' && u.loc.id !== o.target);
    const borders = armies.filter(u => (state.adjacency[u.loc.id] || []).includes(o.target));
    const bySea = canLandBySea(state, o.country) || sameSide(state, o.country, o.target);
    const sea = bySea && (hasSeaLift(state, o.country, o.target) || sailPlan(state, o.country, o.target));
    const air = !sea && armies.filter(u => airdropReach(state, o.country, o.target, u));
    const pool = borders.length ? borders : sea ? armies : air;
    pool.sort((a, b) => b.strength - a.strength);
    // Left on auto, half of what can reach goes in (up to six army groups); the rest holds home.
    const n = counts.n || clamp(Math.ceil(pool.length / 2), 1, 6);
    o.units = pool.slice(0, air && !borders.length ? Math.min(n, 2) : n).map(u => u.id);
  } else if (o.type === 'airdrop' && T) {
    const armies = unitsOf(state, o.country, 'army').filter(u => u.loc.kind === 'country' && u.loc.id !== o.target && u.strength > 20 && airdropReach(state, o.country, o.target, u));
    armies.sort((a, b) => b.strength - a.strength);
    o.units = armies.slice(0, Math.min(counts.n || 1, 2)).map(u => u.id);
  } else if ((o.type === 'fleet' || o.type === 'blockade') && SEA_ZONES[o.zone]) {
    const ships = unitsOf(state, o.country).filter(u => (u.type === 'fleet' || u.type === 'carrier') && !(counts.type && u.type !== counts.type));
    const blocked = blockedFor(state, o.country);
    const scored = ships.map(u => ({ u, r: seaRoute(u.loc.id, o.zone, blocked) })).filter(x => x.r).sort((a, b) => a.r.length - b.r.length);
    o.units = scored.slice(0, counts.n || 1).map(x => x.u.id);
  } else if (o.type === 'siege' && T) {
    // The nearest warships, each heading for the closest stretch of the target's coast.
    const coast = zonesTouching(o.target), blocked = blockedFor(state, o.country);
    const ships = unitsOf(state, o.country).filter(u => (u.type === 'fleet' || u.type === 'carrier') && u.loc.kind === 'sea' && !(counts.type && u.type !== counts.type));
    const scored = ships.map(u => ({ u, r: coast.map(z => seaRoute(u.loc.id, z, blocked)).filter(Boolean).sort((a, b) => a.length - b.length)[0] }))
      .filter(x => x.r && x.r.length - 1 <= FLEET_MOVES_PER_TURN * 2).sort((a, b) => a.r.length - b.r.length);
    o.units = scored.slice(0, counts.n || 2).map(x => x.u.id);
  } else if (o.type === 'rebase' && T) {
    const type = counts.type || 'fighter';
    o.units = unitsOf(state, o.country, type).filter(u => u.loc.id !== o.target).slice(0, counts.n || 1).map(u => u.id);
  }
  return o;
}

export function describeOrder(state, o, lang = 'en') {
  const n = id => countryName(state, id, lang);
  const c = n(o.country), t = o.target ? n(o.target) : '';
  const units = (o.units || []).map(id => state.units[id]).filter(Boolean);
  const count = type => units.filter(u => u.type === type).length;
  const parts = ['bomber', 'missile', 'carrier', 'fighter', 'army', 'fleet'].filter(count).map(tp => `${count(tp)} ${UNIT_TYPES[tp].name.toLowerCase().replace(/y$/, count(tp) > 1 ? 'ie' : 'y')}${count(tp) > 1 ? 's' : ''}`);
  switch (o.type) {
    case 'strike': return `${c} strikes ${t}${o.category ? ` (${o.category})` : ''} with ${o.aircraft ? `${US_AIRCRAFT[o.aircraft]?.name.replace(/s$/, 'se')}s${o.payload === 'moab' ? ' carrying the heavy bomb (MOAB)' : ''}` : parts.join(', ') || 'no units'}${o.escort?.length ? `, ${o.escort.length} fighter escort` : ''}`;
    case 'invade': return `${c} sends ${parts.join(', ')} into ${t}${o.amphibious ? ` by sea${o.sail ? ', its fleet sailing in to cover the landing' : ''}` : o.airborne ? ' by parachute' : ''}`;
    case 'airdrop': return `${c} drops paratroopers into ${t} (${parts.join(', ') || 'no units'})`;
    case 'rebase': return `${c} rebases ${parts.join(', ')} to ${t}`;
    case 'fleet': return `${c} sails ${parts.join(', ')} to ${n(o.zone)}`;
    case 'blockade': return `${c} blockades ${n(o.zone)} with ${parts.join(', ')}`;
    case 'siege': return `${c} blockades the coast of ${t} with ${parts.join(', ') || 'no warships'}`;
    case 'lift': return `${c} lifts its blockades`;
    case 'cap': return `${c} flies air patrols over its territory`;
    case 'alert': return `${c} puts its nuclear forces on alert`;
    case 'nuke': return `${c} launches a nuclear weapon at ${t}`;
    case 'war': return `${c} declares war on ${t}`;
    case 'ceasefire': return `${c} agrees a ceasefire with ${t}`;
    case 'peace': return `${c} signs a peace treaty with ${t}`;
    case 'alliance': return `${c} forms an alliance with ${t}`;
    case 'sanction': return `${c} sanctions ${t}`;
    case 'unsanction': return `${c} lifts sanctions on ${t}`;
    case 'trade': return `${c} signs a trade deal with ${t}`;
    case 'aid': return `${c} sends $${o.amount}bn to ${t}`;
    case 'arms': return `${c} transfers a ${UNIT_TYPES[o.unitType]?.name.toLowerCase()} to ${t}`;
    case 'overflight': return `${c} grants ${t} overflight and basing rights`;
    case 'cyber': return `${c} launches a cyber attack on ${t}'s ${o.kind === 'grid' ? 'power grid' : o.kind === 'banks' ? 'banks' : 'radar network'}`;
    case 'intel': return `${c} runs an intelligence sweep on ${t}`;
    case 'spy': return `${c} spy operation in ${t}: ${o.kind}`;
    case 'satellite': return `${c} blinds ${t}'s satellites`;
    case 'neo': return `${c} evacuates its citizens from ${t}`;
    case 'helistrike': return `${c} attack helicopters strike ${t}'s forces behind the front`;
    case 'airassault': return o.fromSea ? `${c} flies troops ashore in ${t} by helicopter from its ships off the coast` : `${c} lands troops by helicopter behind ${t}'s lines`;
    case 'propaganda': return o.target ? `${c} runs propaganda against ${t}` : `${c} runs a propaganda campaign at home`;
    case 'roe': return `${c} sets rules of engagement to ${o.kind}`;
    case 'election': return `${c} holds an election`;
    default: return `${c}: ${o.type}`;
  }
}

export { isActive };
