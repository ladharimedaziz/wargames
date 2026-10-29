// Nuclear rules shared by the turn resolver and the ending screens.
// A warhead fired by one camp's nuclear power at the other camp's nuclear power (NATO against the Warsaw Pact on the
// Cold War committee, the Western Alliance against the Eastern Coalition elsewhere) starts the full exchange, and
// "The Unthinkable" follows once every arsenal has fired. Any other nuclear strike is a single detonation.
import { sameSide, unitsOf, isActive } from './core.js';
import { launchSite, arsenalOf } from '../data/launch-sites.js';

const pt = c => ({ lat: c.lat, lon: c.lon });
const CAMPS = ['A', 'B'];

export function isBlocExchange(state, a, b) {
  const A = state.countries[a], B = state.countries[b];
  if (!A?.nuclear?.has || !B?.nuclear?.has) return false;
  return CAMPS.includes(A.bloc) && CAMPS.includes(B.bloc) && A.bloc !== B.bloc;
}

// Launch on warning: the moment the first missile is detected, every nuclear power on both sides fires its whole
// arsenal at the other side, and every country of the other side is hit. Pure: nothing in the state changes.
// `total` is every warhead launched; at most DRAWN of them get a track on the map and in the film.
const DRAWN = 140;
export function planExchange(state, first, hit) {
  const sideOf = c => Object.values(state.countries).filter(x => isActive(x) && !x.rebelOf && (x.id === c || sameSide(state, x.id, c)));
  const A = sideOf(first), B = sideOf(hit);
  const shared = new Set(A.map(c => c.id));
  const sideB = B.filter(c => !shared.has(c.id)); // a country on both sides' books sits it out
  if (!sideB.length) return null;
  const firers = [...sideB, ...A].filter(c => c.nuclear?.has);
  const arsenal = Object.fromEntries(firers.map(c => [c.id, arsenalOf(state, c.id, unitsOf(state, c.id, 'missile').length)]));
  const total = Object.values(arsenal).reduce((s, n) => s + n, 0);
  const strikes = [], struck = new Set([hit]), labelled = new Set([hit]);
  const fired = { [first]: 1 }; // the first warhead flew from the first country's first site
  const siteFor = id => { const n = fired[id] || 0; fired[id] = n + 1; return launchSite(state, id, n); };
  let k = 0;
  for (const f of firers) {
    const targets = (shared.has(f.id) ? sideB : A).slice().sort((a, b) => b.gdp - a.gdp);
    if (!targets.length) continue;
    const n = Math.max(3, Math.round((DRAWN * arsenal[f.id]) / total));
    for (let i = 0; i < n; i++) {
      const T = targets[(k++) % targets.length];
      const site = siteFor(f.id);
      strikes.push({ kind: 'nuke', owner: f.id, target: T.id, from: pt(site), site: site.name, to: pt(T), at: pt(T), salvo: true, label: !labelled.has(T.id) });
      labelled.add(T.id); struck.add(T.id);
    }
  }
  // Every country of both sides is struck, drawn or not.
  for (const c of [...A, ...sideB]) struck.add(c.id);
  strikes.splice(DRAWN);
  return { first, hit, sideA: A.map(c => c.id), sideB: sideB.map(c => c.id), strikes, struck: [...struck], answer: strikes.length, total: Math.max(total, strikes.length + 1) };
}

// The film's data: the warheads drawn with their tracks, how many were launched in all, and who fired and was hit.
export function exchangeSummary(state, first, hit, strikes, struck, answer = 0, total = 0) {
  const C = state.countries, N = id => C[id]?.name || id;
  const site = launchSite(state, first, 0);
  const all = [{ owner: first, target: hit, from: pt(site), site: site.name, to: pt(C[hit]) }, ...strikes];
  const firing = [...new Set(all.map(s => s.owner))];
  // Each warhead in the abstract model costs a country about 8% of its people, up to 40% in the blasts.
  const hits = id => Math.max(1, all.filter(s => s.target === id).length) * (total > all.length ? 5 : 1);
  const dead = struck.reduce((s, id) => s + (C[id]?.base?.pop || 0) * Math.min(0.4, 0.08 * hits(id)), 0);
  return {
    first, hit, strikes: Math.max(total, all.length), drawn: all.length, answer: Math.min(answer, all.length - 1),
    tracks: all.slice(0, DRAWN + 1).map(s => ({ o: s.owner, t: s.target, s: s.site, f: [+s.from.lon.toFixed(2), +s.from.lat.toFixed(2)], to: [+s.to.lon.toFixed(2), +s.to.lat.toFixed(2)] })),
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
