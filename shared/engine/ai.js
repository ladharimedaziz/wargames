// Computer-run countries: rule-based behaviour for every country the Zeus has not given to a delegate.
import { SEA_ZONES } from '../data/places.js';
import { zonesTouching } from '../geo.js';
import { rand, chance, newId, atWar, enemiesOf, sameSide, relation, unitsOf, unitsAt, isActive, boundAllies, aggressorOf } from './core.js';
import { autoUnits, validateOrder } from './orders.js';
import { norms } from './economy.js';


// The computer never drags a country into a war on its own: it asks, and a Zeus approves or declines on the news desk.
// A declined request is not asked again for three turns.
// Requests to join a war are grouped: every country that wants in on the same side of the same fight shares one
// card, so the Zeus approves a coalition at once (or picks members out of it).
function proposeJoin(state, ctx, c, friend, foe, treaty, defending) {
  const turn = state.meta.turn;
  const members = r => r.countries || [r.country];
  const pair = (r, x, y) => r.kind === 'join' && members(r).includes(x) && r.target === y;
  // Already asked (or recently declined), or the other side has asked to fight this country: nothing new.
  if (state.review.some(r => pair(r, c.id, foe) && (r.status === 'pending' || (r.status === 'killed' && turn - r.turn < 3)))) return true;
  if (state.review.some(r => r.status === 'pending' && pair(r, foe, c.id))) return true;
  const card = state.review.find(r => r.kind === 'join' && r.status === 'pending' && r.target === foe && !!r.defending === !!defending);
  if (card) {
    card.countries = [...members(card), c.id]; card.country = card.countries[0];
    card.friends = [...new Set([...(card.friends || [card.friend]), friend.id])]; card.treaty ||= treaty;
    joinText(state, card); return true;
  }
  const r = { id: newId(state, 'j'), turn, kind: 'join', status: 'pending', priority: 6, at: ctx.now, country: c.id, countries: [c.id], target: foe, friend: friend.id, friends: [friend.id], treaty, defending };
  joinText(state, r);
  state.review.push(r);
  return true;
}

export function joinText(state, r) {
  const N = id => state.countries[id]?.name || id, list = r.countries || [r.country];
  const and = ids => ids.length === 1 ? N(ids[0]) : `${ids.slice(0, -1).map(N).join(', ')} and ${N(ids[ids.length - 1])}`;
  const friends = (r.friends || [r.friend]).filter(id => !list.includes(id)).slice(0, 3);
  const side = friends.length ? and(friends) : N(r.friend);
  r.en = `${and(list)} ${list.length === 1 ? 'wants' : 'want'} to join the war against ${N(r.target)}${r.defending ? `, ${r.treaty ? 'bound by treaty ' : ''}to defend ${side}` : `, backing ${side}'s offensive`}`;
  r.ar = '';
  r.detail = list.length > 1 ? 'Approve them all, or tap a name to approve or drop just that country.' : 'Approve to declare war, or decline to keep it out.';
}

export function planAI(state, ctx) {
  const turn = state.meta.turn;
  const out = [];
  const add = (country, type, extra, counts) => {
    let o = { id: newId(state, 'o'), turn, country, type, status: 'queued', by: 'AI', at: ctx.now, ...extra };
    if (counts) o = autoUnits(state, o, counts);
    if (validateOrder(state, o).ok) { out.push(o); return true; }
    return false;
  };
  const playerOrdered = new Set(state.orders.filter(o => o.turn === turn).map(o => o.country));
  const ais = Object.values(state.countries).filter(c => c.control === 'ai' && c.major && isActive(c));

  for (const c of ais) {
    if (playerOrdered.has(c.id)) continue; // a Zeus already gave this country orders
    const enemies = enemiesOf(state, c.id).filter(e => isActive(state.countries[e]));
    const n = norms(c);
    const exhausted = c.support < Math.min(25, n.support - 15) || c.gdp / c.base.gdp < 0.6 || c.stability < Math.min(20, n.stability - 15);

    // Neutrals pushed too far by airspace violations pick a side.
    if (c.bloc === 'N' && c.violations) {
      for (const [by, n] of Object.entries(c.violations)) {
        const offender = state.countries[by];
        if (n >= 2 && offender.bloc !== 'N' && relation(state, c.id, by) < -30) {
          const other = offender.bloc === 'A' ? 'B' : 'A';
          c.bloc = other;
          state._aiEvents?.push({ kind: 'ai_join', country: c.id, bloc: other, why: by });
          break;
        }
      }
      c.violations = {};
    }

    // Treaty and bloc obligations: join a friend's war (at most one new war per country per turn). Each enemy is
    // weighed once, by the strongest reason to fight it, so a country with many friends is not asked many times.
    const reasons = new Map();
    for (const friend of Object.values(state.countries)) {
      if (friend.id === c.id || !isActive(friend)) continue;
      const treaty = !!boundAllies(state, c.id, friend.id);
      const bloc = c.bloc !== 'N' && c.bloc === friend.bloc;
      if (!treaty && !bloc) continue;
      for (const foe of enemiesOf(state, friend.id)) {
        if (foe === c.id || atWar(state, c.id, foe) || sameSide(state, c.id, foe)) continue;
        // Treaties oblige a country to defend an ally that was attacked, not to join an ally's invasion.
        const defending = aggressorOf(state, foe, friend.id) === foe;
        const p = defending ? (treaty ? 0.5 : 0.35) : (bloc ? 0.08 : 0);
        if (p > (reasons.get(foe)?.p || 0)) reasons.set(foe, { friend, treaty: treaty && defending, defending, p });
      }
    }
    for (const [foe, r] of [...reasons].sort((x, y) => y[1].p - x[1].p)) {
      let p = r.p * (c.roe === 'defensive' ? 0.4 : c.roe === 'forward' ? 1.3 : 1) * (state.countries[foe].major ? 1 : 0.5);
      if (relation(state, c.id, foe) < 10 && chance(state, p)) { proposeJoin(state, ctx, c, r.friend, foe, r.treaty, r.defending); break; }
    }

    if (enemies.length) {
      add(c.id, 'cap', {});
      // Primary enemy: whoever hit us most recently, else the strongest.
      const primary = enemies.sort((a, b) => (state.countries[b].lastStruck === turn - 1) - (state.countries[a].lastStruck === turn - 1) || state.countries[b].gdp - state.countries[a].gdp)[0];
      const struckRecently = c.lastStruck >= turn - 1;
      if (struckRecently || chance(state, c.roe === 'forward' ? 0.6 : 0.35)) {
        const cat = chance(state, 0.6) ? 'military' : chance(state, 0.5) ? 'industry' : 'energy';
        const n = 1 + Math.floor(rand(state) * 2);
        for (const type of ['missile', 'bomber', 'carrier', 'fighter']) if (add(c.id, 'strike', { target: primary, category: cat }, { type, n })) break;
      }
      // Bring armies home if the homeland is threatened.
      const threatened = (state.adjacency[c.id] || []).some(n => unitsAt(state, 'country', n).some(u => u.type === 'army' && atWar(state, u.owner, c.id)));
      const abroad = unitsOf(state, c.id, 'army').filter(u => u.loc.id !== c.id);
      if (threatened && abroad.length && (state.adjacency[abroad[0].loc.id] || []).includes(c.id)) add(c.id, 'invade', { target: c.id, units: [abroad[0].id] });
      // Offensive when clearly stronger than a neighbouring enemy.
      if (!exhausted && state.global.tension >= 6 && c.roe !== 'defensive') {
        for (const foe of enemies) {
          if (!(state.adjacency[c.id] || []).includes(foe)) continue;
          const F = state.countries[foe];
          const def = unitsAt(state, 'country', foe).filter(u => u.type === 'army' && sameSide(state, u.owner, foe)).reduce((s, u) => s + u.strength, 0) + 20 + F.airDefense * 3 + (F.major ? 15 : 0);
          const home = unitsOf(state, c.id, 'army').filter(u => u.loc.id === c.id).sort((a, b) => b.strength - a.strength);
          const usable = home.slice(0, Math.max(0, home.length - 1));
          const atk = usable.reduce((s, u) => s + u.strength, 0);
          if (usable.length && atk > def * 1.35 * 1.6) { add(c.id, 'invade', { target: foe, units: usable.slice(0, 3).map(u => u.id) }); break; }
        }
      }
      // Chokepoint pressure from countries that sit on one.
      if (state.global.tension >= 8 && chance(state, 0.25)) {
        const choke = zonesTouching(c.id).find(z => SEA_ZONES[z].choke && state.global.chokepoints[z]?.status === 'open');
        if (choke && enemies.some(e => state.countries[e].oilNet < 0)) add(c.id, 'blockade', { zone: choke }, { n: 1 });
      }
      if (state.global.tension >= 8 && c.nuclear.has && !c.nuclear.alert && (exhausted || c.occupiedBy) && chance(state, 0.3)) add(c.id, 'alert', {});
      if (state.settings.aiNukes && state.global.tension >= 10 && c.nuclear.has && c.occupiedBy && chance(state, 0.2)) add(c.id, 'nuke', { target: c.occupiedBy });
      // Exhausted countries look for a way out.
      if (exhausted && chance(state, 0.45)) {
        const other = state.countries[primary];
        const otherTired = other.control === 'ai' && (other.support < Math.min(35, norms(other).support - 10) || other.gdp / other.base.gdp < 0.7);
        if (otherTired) add(c.id, 'ceasefire', { target: primary });
        else state._aiEvents?.push({ kind: 'ceasefire_offer', country: c.id, to: primary });
      }
    }

    // Economic tit-for-tat.
    for (const other of Object.values(state.countries)) {
      if (other.sanctions.includes(c.id) && !c.sanctions.includes(other.id) && relation(state, c.id, other.id) < -30 && chance(state, 0.5)) add(c.id, 'sanction', { target: other.id });
    }
    if (c.support < Math.min(40, n.support - 5) && chance(state, 0.25)) add(c.id, 'propaganda', {});
  }
  return out;
}
