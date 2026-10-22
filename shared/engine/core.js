// Shared constants and small helpers for the simulation engine.
import { SEA_ZONES } from '../data/places.js';
import { MISSILE_RANGE_KM } from '../data/countries.js';
import { distanceKm } from '../geo.js';
import { CITIES } from '../data/cities.js';
import { ALLIANCES, sharedAlliances, BASE_RELATIONS } from '../data/alliances.js';

export const UNIT_TYPES = {
  army:     { name: 'Army group', ar: 'مجموعة جيش', icon: 'army', domain: 'land', upkeep: 0.7, cost: 12 },
  fighter:  { name: 'Fighter wing', ar: 'سرب مقاتلات', icon: 'fighter', domain: 'air', range: 1500, upkeep: 0.6, cost: 10 },
  bomber:   { name: 'Bomber wing', ar: 'سرب قاذفات', icon: 'bomber', domain: 'air', range: 9000, upkeep: 0.9, cost: 18 },
  missile:  { name: 'Missile battery', ar: 'بطارية صواريخ', icon: 'missile', domain: 'land', upkeep: 0.4, cost: 8 },
  airdef:   { name: 'Air defence battery', ar: 'بطارية دفاع جوي', icon: 'airdef', domain: 'land', upkeep: 0.3, cost: 6 },
  fleet:    { name: 'Fleet', ar: 'أسطول', icon: 'fleet', domain: 'sea', upkeep: 0.8, cost: 15 },
  carrier:  { name: 'Carrier group', ar: 'مجموعة حاملة طائرات', icon: 'carrier', domain: 'sea', range: 1200, upkeep: 1.4, cost: 30 },
};

export const TARGET_TYPES = ['military', 'industry', 'energy', 'infrastructure', 'capital'];
export const ROE = ['defensive', 'firm', 'forward'];
export const BLOCS = ['N', 'A', 'B', 'C'];

export const TENSION_LEVELS = [
  { max: 2, name: 'Calm', ar: 'هدوء' },
  { max: 4, name: 'Friction', ar: 'احتكاك' },
  { max: 6, name: 'Crisis', ar: 'أزمة' },
  { max: 8, name: 'Confrontation', ar: 'مواجهة' },
  { max: 10, name: 'Brink', ar: 'حافة الهاوية' },
];
export const tensionLevel = t => TENSION_LEVELS.find(l => t <= l.max) || TENSION_LEVELS[4];

export const ENDINGS = {
  peace:     { title: 'Peace in Our Time', ar: 'السلام', tone: 'good', line: 'The guns fall silent. A treaty is signed and the world exhales.' },
  ceasefire: { title: 'An Uneasy Ceasefire', ar: 'وقف إطلاق نار هش', tone: 'neutral', line: 'The fighting stops, but nobody has forgotten how close it came.' },
  victory:   { title: 'Total Victory', ar: 'نصر كامل', tone: 'neutral', line: 'One side stands, the other has fallen. The map is redrawn.' },
  collapse:  { title: 'Global Collapse', ar: 'انهيار عالمي', tone: 'bad', line: 'The war is lost by everyone: markets have crumbled and governments with them.' },
  stalemate: { title: 'Frozen Conflict', ar: 'صراع مجمّد', tone: 'neutral', line: 'Neither side can win, neither will yield. The front lines harden into borders.' },
  neworder:  { title: 'A New World Order', ar: 'نظام عالمي جديد', tone: 'neutral', line: 'Old alliances are broken and new ones rise in their place.' },
  nuclear:   { title: 'The Unthinkable', ar: 'ما لا يُتصوَّر', tone: 'dark', line: 'A nuclear weapon has been used. The simulation ends here, with a silence no treaty can fill.' },
  custom:    { title: 'The End', ar: 'النهاية', tone: 'neutral', line: '' },
};

export const COURT_PHASES = ['Opening statements', 'Prosecution case', 'Defence case', 'Closing arguments', 'Deliberation', 'Verdict'];
export const OBJECTION_GROUNDS = ['Hearsay', 'Leading the witness', 'Relevance', 'Speculation', 'Badgering', 'Asked and answered', 'Lack of foundation'];

// Deterministic random numbers so a turn can be replayed or rewound exactly.
export function rand(state) {
  let t = (state.rng.seed + 0x6d2b79f5 * ++state.rng.n) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const chance = (state, p) => rand(state) < p;
export const between = (state, lo, hi) => lo + rand(state) * (hi - lo);
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const round1 = v => Math.round(v * 10) / 10;

let idCounter = 0;
export function newId(state, prefix) {
  state.meta.idSeq = (state.meta.idSeq || 0) + 1;
  return `${prefix}${state.meta.idSeq.toString(36)}${(idCounter++ % 36).toString(36)}`;
}

export const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function shareAlliance(state, a, b) {
  const A = state.countries[a], B = state.countries[b];
  if (!A || !B) return false;
  return sharedAlliances(A, B).length > 0 || state.treaties.some(t => t.type === 'alliance' && t.parties.includes(a) && t.parties.includes(b));
}
// Mutual-defence obligations between two countries: real treaties, or an alliance signed in the game.
export function boundAllies(state, a, b) {
  const A = state.countries[a], B = state.countries[b];
  if (!A || !B) return null;
  return sharedAlliances(A, B).find(k => ALLIANCES[k].binding) || (state.treaties.some(t => t.type === 'alliance' && t.parties.includes(a) && t.parties.includes(b)) ? 'treaty' : null);
}

export function atWar(state, a, b) {
  return state.wars.some(w => (w.a === a && w.b === b) || (w.a === b && w.b === a));
}
// How much a country can fight in the air: its jets and bombers, weighted by training, plus ground air defences.
export function airPower(state, id) {
  const c = state.countries[id]; if (!c) return 0;
  let p = (c.airDefense || 0) * 3;
  for (const u of Object.values(state.units)) if (u.owner === id && u.strength > 0 && (u.type === 'fighter' || u.type === 'bomber' || u.type === 'carrier')) p += (u.strength / 100) * 10 * (c.quality?.air ?? 1);
  return p;
}
// A war only shuts the skies when both sides can fight for them: a great power fighting a force with no air
// force or air defences to speak of (NATO in Afghanistan) leaves civilian airspace open.
export function airContested(state, a, b) {
  const pa = airPower(state, a), pb = airPower(state, b);
  const lo = Math.min(pa, pb);
  return lo >= 8 && (lo >= 20 || lo >= Math.max(pa, pb) * 0.12);
}
// Whether `by` can actually bring air power over `over`: a neighbour, or aircraft and missiles within range.
// A war with a distant regional power doesn't empty the skies over the far side of the world.
export function threatensAir(state, by, over) {
  if (state.adjacency?.[over]?.includes(by)) return true;
  const T = state.countries[over]; if (!T) return false;
  // Its centre and its larger cities, so a big country is in reach when its coast is.
  const pts = [T, ...CITIES.filter(c => c.a3 === T.a3 && c.tier <= 2)];
  for (const u of Object.values(state.units)) {
    if (u.owner !== by || u.strength <= 0 || !['fighter', 'bomber', 'missile', 'carrier'].includes(u.type)) continue;
    const at = anchor(state, u.loc), r = unitRange(state, u);
    if (at && pts.some(p => distanceKm(at, p) <= r)) return true;
  }
  return false;
}
// The countries whose airspace a war between a and b shuts.
export function warClosures(state, a, b) {
  if (!airContested(state, a, b)) return [];
  return [[a, b], [b, a]].filter(([x, y]) => threatensAir(state, y, x)).map(([x]) => x);
}
export function closesAirspace(state, id) {
  return state.wars.some(w => (w.a === id || w.b === id) && warClosures(state, w.a, w.b).includes(id));
}

export function enemiesOf(state, id) {
  return state.wars.flatMap(w => (w.a === id ? [w.b] : w.b === id ? [w.a] : []));
}
export function sameSide(state, a, b) {
  if (a === b) return true;
  const A = state.countries[a], B = state.countries[b];
  if (A.bloc !== 'N' && A.bloc === B.bloc) return true;
  return state.treaties.some(t => t.type === 'alliance' && t.parties.includes(a) && t.parties.includes(b));
}

export function relation(state, a, b) {
  const k = pairKey(a, b);
  if (state.relations[k] !== undefined) return state.relations[k];
  const A = state.countries[a], B = state.countries[b];
  let r = 0;
  if (A.bloc !== 'N' && A.bloc === B.bloc) r += 60;
  else if (A.bloc !== 'N' && B.bloc !== 'N') r -= 55;
  const shared = sharedAlliances(A, B);
  if (shared.some(x => ALLIANCES[x].binding)) r += 40;
  else if (shared.length) r += 12;
  r += BASE_RELATIONS[k] || 0;
  if (atWar(state, a, b)) r = -100;
  return clamp(r, -100, 100);
}
export function shiftRelation(state, a, b, delta) {
  if (a === b) return;
  state.relations[pairKey(a, b)] = clamp(relation(state, a, b) + delta, -100, 100);
}

export function anchor(state, loc) {
  if (!loc) return null;
  if (loc.kind === 'sea') { const z = SEA_ZONES[loc.id]; return z && { lat: z.lat, lon: z.lon }; }
  const c = state.countries[loc.id];
  return c && { lat: c.lat, lon: c.lon };
}

export function unitRange(state, unit) {
  if (unit.type === 'missile') return MISSILE_RANGE_KM[unit.owner] || 1000;
  // With its tanker fleet the US bomber force can reach any country on Earth.
  if (unit.type === 'bomber' && state.countries[unit.owner]?.a3 === 'USA') return 20000;
  return UNIT_TYPES[unit.type].range || 0;
}

export function unitsOf(state, owner, type) {
  return Object.values(state.units).filter(u => u.owner === owner && (!type || u.type === type) && u.strength > 0);
}
export function unitsAt(state, kind, id) {
  return Object.values(state.units).filter(u => u.loc.kind === kind && u.loc.id === id && u.strength > 0);
}

export function countryName(state, id, lang = 'en') {
  const c = state.countries[id];
  if (!c) return SEA_ZONES[id] ? (lang === 'ar' ? SEA_ZONES[id].ar : SEA_ZONES[id].name) : id;
  return lang === 'ar' ? c.ar : c.name;
}

export function isActive(c) { return c && c.control !== 'inactive' && !c.capitulated; }
