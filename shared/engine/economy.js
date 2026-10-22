// The automatic economy: damage, blockades, sanctions, oil and war costs ripple through every country each turn.
import { SEA_ZONES } from '../data/places.js';
import { distanceKm } from '../geo.js';
import { UNIT_TYPES, clamp, chance, atWar, enemiesOf } from './core.js';

const BASE_OIL = 82;
let tradeCache = null;

// Gravity-model trade web between major economies (computed once; sanctions and wars cut links at runtime).
export function tradeWeb(state) {
  if (tradeCache && tradeCache.key === Object.keys(state.countries).length) return tradeCache.web;
  const majors = Object.values(state.countries).filter(c => c.major);
  const web = {};
  for (const a of majors) {
    const scores = majors.filter(b => b.id !== a.id).map(b => ({ id: b.id, s: (b.base.gdp) / Math.pow(distanceKm(a, b) + 800, 1.1) }));
    scores.sort((x, y) => y.s - x.s);
    const top = scores.slice(0, 8);
    const total = top.reduce((s, x) => s + x.s, 0) || 1;
    web[a.id] = Object.fromEntries(top.map(x => [x.id, x.s / total]));
  }
  tradeCache = { key: Object.keys(state.countries).length, web };
  return web;
}

function blockadedCountries(state) {
  const out = new Set();
  for (const u of Object.values(state.units)) {
    if (!u.blockade || u.loc.kind !== 'sea') continue;
    for (const coast of SEA_ZONES[u.loc.id].coasts) if (atWar(state, u.owner, coast)) out.add(coast);
  }
  return out;
}

// A country's own normal: its real pre-crisis economy. Saves made before these figures existed fall back to the old flat values.
export function norms(c) {
  const b = c.base;
  return { industry: b.industry ?? 1, energy: b.energy ?? 1, support: b.support ?? 55, stability: b.stability ?? 70, inflation: b.inflation ?? 2, growth: b.growth ?? 0 };
}

export function tickEconomy(state, ev, ctx) {
  const g = state.global;
  const turn = state.meta.turn;
  g.marks ||= {};

  // Oil price: chokepoints, damage to exporters, nuclear use.
  let target = BASE_OIL;
  for (const [z, cp] of Object.entries(g.chokepoints)) {
    const w = SEA_ZONES[z].oil || 0;
    if (cp.status === 'closed') target += w; else if (cp.status === 'contested') target += w * 0.5;
  }
  for (const c of Object.values(state.countries)) if (c.oilNet > 0.5) target += c.oilNet * (1 - c.energy) * 5 + (c.occupiedBy ? c.oilNet * 2 : 0);
  target += g.nukesUsed * 25 + Math.max(0, g.tension - 5) * 2.5;
  target = clamp(target, 40, 280);
  const oldOil = g.oilPrice;
  g.oilPrice = Math.round((g.oilPrice + (target - g.oilPrice) * 0.4) * 10) / 10;
  if (Math.abs(g.oilPrice - oldOil) >= 8) ev.push({ kind: 'oil', from: Math.round(oldOil), to: Math.round(g.oilPrice) });
  const oilShift = (g.oilPrice - BASE_OIL) / BASE_OIL;

  const web = tradeWeb(state);
  const blockaded = blockadedCountries(state);
  const upkeepBy = {};
  for (const u of Object.values(state.units)) upkeepBy[u.owner] = (upkeepBy[u.owner] || 0) + UNIT_TYPES[u.type].upkeep * (0.4 + u.strength / 166);

  let sumGdp = 0, sumBase = 0, refugeesTotal = 0;
  const refugeeIn = {};
  const years = (turn - 1) * (state.meta.turnDays || 7) / 365;
  for (const c of Object.values(state.countries)) {
    const b = norms(c);
    const struckNow = c.lastStruck === turn;
    if (!struckNow) {
      // Industry and energy recover toward the country's own pre-crisis level, not a universal 100%.
      c.industry = clamp(c.industry + (c.industry < b.industry ? Math.min(0.025, b.industry - c.industry) : 0), 0.05, 1.2);
      if (!((c.cyber.grid || 0) >= turn) && !c.blackout) c.energy = clamp(c.energy + (c.energy < b.energy ? Math.min(0.03, b.energy - c.energy) : 0), 0.05, 1.2);
      c.damage = clamp(c.damage - 0.015, 0, 1);
    }
    if (c.blackout) c.energy = Math.min(c.energy, 0.3);
    const sick = (c.outbreak?.level || 0) / 100;
    const enemies = enemiesOf(state, c.id);
    const atWarNow = enemies.length > 0;
    let tradeFactor = 1;
    const links = web[c.id];
    if (links) {
      let health = 0;
      for (const [pid, w] of Object.entries(links)) {
        const p = state.countries[pid];
        const cut = c.sanctions.includes(pid) || p.sanctions.includes(c.id) || atWar(state, c.id, pid);
        const boost = state.treaties.some(t => t.type === 'trade' && t.parties.includes(c.id) && t.parties.includes(pid)) ? 1.1 : 1;
        health += w * (cut ? 0 : Math.min(1.2, (p.gdp / p.base.gdp) * boost));
      }
      tradeFactor = 1 - 0.28 * (1 - health);
    }
    if (blockaded.has(c.id)) tradeFactor *= 0.75;
    const oilEffect = clamp(c.oilNet * oilShift * 0.012, -0.12, 0.25);
    const occ = c.occupiedBy ? 0.6 : 1 - 0.4 * (c.front?.pct || 0) / 100;
    const warDrag = atWarNow ? 0.03 : 0;
    const trend = Math.pow(1 + b.growth / 100, years);
    const targetGdp = c.base.gdp * trend * Math.pow(c.industry / b.industry, 0.5) * Math.pow(c.energy / b.energy, 0.3) * tradeFactor * (1 + oilEffect) * occ * (1 - warDrag) * (1 - sick * 0.25) * (c.blackout ? 0.88 : 1) * (1 - Math.min(0.3, Math.max(0, c.inflation - Math.max(2, b.inflation)) / 100));
    c.gdp = Math.max(0.5, c.gdp + (targetGdp - c.gdp) * 0.4);

    // Peacetime budgets balance with a small surplus; war adds the cost of fighting on top.
    const income = c.gdp * 0.0035;
    const warCost = atWarNow ? (upkeepBy[c.id] || 0) * 0.004 * Math.sqrt(c.base.gdp) * 3 : 0;
    c.treasury = Math.round((c.treasury + income * 0.2 - warCost) * 10) / 10;
    if (c.treasury < 0) { c.inflation += 1.5; c.support -= 1; }
    else c.inflation += (b.inflation - c.inflation) * 0.15;
    if (oilShift > 0 && c.oilNet < 0) c.inflation += oilShift * 1.2;
    c.inflation = clamp(Math.round(c.inflation * 10) / 10, -2, 80);

    c.warWeariness = c.warWeariness * 0.9;
    c.support += (b.support - c.support) * 0.03 - c.warWeariness * 0.15 - Math.max(0, c.inflation - Math.max(5, b.inflation + 3)) * 0.35 - c.damage * 3 - (c.occupiedBy ? 2 : 0) - sick * 2 - (c.blackout ? 1 : 0);
    c.support = clamp(c.support, 0, 100);
    c.stability = clamp(c.stability + (c.support - b.support) * 0.04 + (b.stability - c.stability) * 0.02 - c.damage * 2 - (c.occupiedBy ? 3 : 0), 0, 100);

    if ((c.damage > 0.25 || c.occupiedBy) && c.major) {
      const flow = c.base.pop * (c.damage + (c.occupiedBy ? 0.2 : 0)) * 0.004; // millions per turn
      c.refugees += flow;
      refugeesTotal += flow;
      const nbs = (state.adjacency[c.id] || []).filter(n => !atWar(state, n, c.id));
      for (const n of nbs) refugeeIn[n] = (refugeeIn[n] || 0) + flow / nbs.length;
    }
    if (c.control !== 'inactive' && c.major) {
      if (c.support < Math.min(30, b.support - 10) && chance(state, 0.35)) ev.push({ kind: 'protest', country: c.id, support: Math.round(c.support) });
      if (c.support < Math.min(15, b.support - 15) && !c.noConfidence) { c.noConfidence = true; ev.push({ kind: 'no_confidence', country: c.id }); }
      if (c.support > Math.min(25, b.support - 5)) c.noConfidence = false;
      if (c.treasury < -c.base.gdp * 0.05 && !c.bankrupt) { c.bankrupt = true; ev.push({ kind: 'bankrupt', country: c.id }); }
      if (c.treasury > 0) c.bankrupt = false;
    }
    sumGdp += c.gdp; sumBase += c.base.gdp;
  }
  for (const [id, flow] of Object.entries(refugeeIn)) {
    const c = state.countries[id];
    c.support = clamp(c.support - Math.min(2, flow * 2), 0, 100);
    c.gdp *= 1 - Math.min(0.01, flow * 0.002);
    if (flow > 0.15 && chance(state, 0.4)) ev.push({ kind: 'refugees', country: id, millions: Math.round(flow * 10) / 10 });
  }
  g.refugees += refugeesTotal;
  const oldIdx = g.gdpIndex;
  g.gdpIndex = sumGdp / sumBase;
  for (const th of [0.97, 0.9, 0.8, 0.65, 0.5]) {
    if (oldIdx >= th && g.gdpIndex < th && !g.marks['gdp' + th]) { g.marks['gdp' + th] = true; ev.push({ kind: 'recession', level: th, index: g.gdpIndex }); }
  }
}
