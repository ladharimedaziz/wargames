// Nuclear rules shared by the turn resolver and the ending screens.
// A warhead fired by one camp's nuclear power at the other camp's nuclear power (NATO against the Warsaw Pact on the
// Cold War committee, the Western Alliance against the Eastern Coalition elsewhere) starts the full exchange, and
// "The Unthinkable" follows once every arsenal has fired. Any other nuclear strike is a single detonation.
import { clamp, sameSide, unitsOf, isActive } from './core.js';
import { launchSite } from '../data/launch-sites.js';

const pt = c => ({ lat: c.lat, lon: c.lon });
const CAMPS = ['A', 'B'];

export function isBlocExchange(state, a, b) {
  const A = state.countries[a], B = state.countries[b];
  if (!A?.nuclear?.has || !B?.nuclear?.has) return false;
  return CAMPS.includes(A.bloc) && CAMPS.includes(B.bloc) && A.bloc !== B.bloc;
}

// Who answers, who fires at whom. Pure: nothing in the state changes. `first` fired on `hit`; the side that was hit
// answers first, then the first side fires everything else it has. At most 48 warheads are drawn.
export function planExchange(state, first, hit) {
  const sideOf = c => Object.values(state.countries).filter(x => isActive(x) && !x.rebelOf && (x.id === c || sameSide(state, x.id, c)));
  const A = sideOf(first), B = sideOf(hit);
  const shared = new Set(A.map(c => c.id));
  const sideB = B.filter(c => !shared.has(c.id)); // a country on both sides' books sits it out
  if (!sideB.length) return null;
  const warheads = c => clamp(unitsOf(state, c.id, 'missile').length + 2, 2, 8);
  const strikes = [], struck = new Set([hit]);
  const fired = { [first]: 1 }; // the first warhead flew from the first country's first site
  const siteFor = id => { const n = fired[id] || 0; fired[id] = n + 1; return launchSite(state, id, n); };
  const salvo = (from, to) => {
    const targets = to.filter(c => c.major).sort((a, b) => b.gdp - a.gdp);
    for (const f of from.filter(c => c.nuclear?.has)) {
      const n = warheads(f);
      for (let i = 0; i < n && targets.length; i++) {
        const T = targets[i % targets.length];
        if (T.id === hit && f.id === first) continue; // that one already landed
        const site = siteFor(f.id);
        strikes.push({ kind: 'nuke', owner: f.id, target: T.id, from: pt(site), site: site.name, to: pt(T), at: pt(T), salvo: true });
        struck.add(T.id);
      }
    }
  };
  salvo(sideB, A); // the answer: every nuclear power on the side that was hit fires the moment the first missile launches
  const answer = Math.min(strikes.length, 48);
  salvo(A, sideB); // then the first side fires everything else it has
  strikes.splice(48);
  return { first, hit, sideA: A.map(c => c.id), sideB: sideB.map(c => c.id), strikes, struck: [...struck], answer };
}

// The film's data: every warhead with its track, and the countries that fired and were hit, by id and by name.
export function exchangeSummary(state, first, hit, strikes, struck, answer = 0) {
  const C = state.countries, N = id => C[id]?.name || id;
  const site = launchSite(state, first, 0);
  const all = [{ owner: first, target: hit, from: pt(site), site: site.name, to: pt(C[hit]) }, ...strikes];
  const firing = [...new Set(all.map(s => s.owner))];
  // Each warhead in the abstract model costs a country about 8% of its people, up to 40%.
  const hits = id => Math.max(1, all.filter(s => s.target === id).length);
  const dead = struck.reduce((s, id) => s + (C[id]?.base?.pop || 0) * Math.min(0.4, 0.08 * hits(id)), 0);
  return {
    first, hit, strikes: all.length, answer: Math.min(answer, all.length - 1),
    tracks: all.slice(0, 49).map(s => ({ o: s.owner, t: s.target, s: s.site, f: [+s.from.lon.toFixed(2), +s.from.lat.toFixed(2)], to: [+s.to.lon.toFixed(2), +s.to.lat.toFixed(2)] })),
    firingIds: firing, struckIds: [...struck],
    firing: firing.map(N), struck: struck.map(N), deadMillions: Math.round(dead),
    // Then the winter: smoke blots out the sun for years and nobody, anywhere, survives it.
    worldMillions: Math.round(Object.values(C).reduce((s, c) => s + (c.rebelOf ? 0 : c.base?.pop || 0), 0)),
  };
}

// The biggest nuclear power of each camp, for a nuclear ending played before anyone has fired.
export function likelyExchange(state) {
  const top = bloc => Object.values(state.countries).filter(c => c.bloc === bloc && c.nuclear?.has && isActive(c)).sort((a, b) => b.gdp - a.gdp)[0];
  const a = top('A'), b = top('B');
  return a && b ? { first: a.id, hit: b.id } : null;
}
