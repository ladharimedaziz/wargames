// Shared constants and small helpers for the simulation engine.
import { SEA_ZONES } from '../data/places.js';
import { MISSILE_RANGE_KM, TANKER_COUNTRIES } from '../data/countries.js';
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

// Who started the war between two countries: the one that declared it, except where an ally joined to defend a
// friend, when the side that attacked first stays the aggressor. Treaty obligations hinge on this.
export function aggressorOf(state, a, b) {
  const w = state.wars.find(w => (w.a === a && w.b === b) || (w.a === b && w.b === a));
  return w ? (w.aggressor ?? w.a) : null;
}

// Theatres: where a war is fought. A country belongs to the theatre its capital is in.
export const THEATERS = { europe: 'European theatre', mideast: 'Middle East', asia: 'Indo-Pacific', south: 'South Asia', africa: 'Africa', americas: 'The Americas' };
export function theaterOf(c) {
  if (!c || c.lat == null) return null;
  const { lat, lon } = c;
  if (lon < -30 && lon > -170) return 'americas';
  if (lat >= 34 && lon >= -25 && lon <= 45 && !(lat < 42 && lon > 26)) return 'europe';
  if (lat >= 12 && lat <= 42 && lon > 25 && lon <= 62) return 'mideast';
  if (lon > 62 && lon <= 93) return 'south';
  if (lon > 93 || lon <= -170) return 'asia';
  if (lat < 38 && lon >= -20 && lon <= 52) return 'africa';
  return null;
}

// Theatres in full conflict: at least three wars between members of blocs A and B inside the theatre, or one the Zeus
// opened as a faction war. Their fronts are drawn as one line per bloc, under the bloc's flag. Returns a Set of theatre keys.
export function fullWarTheaters(state) {
  const count = {}, out = new Set();
  const cross = (a, b) => (a.bloc === 'A' && b.bloc === 'B') || (a.bloc === 'B' && b.bloc === 'A');
  for (const w of state.wars || []) {
    const a = state.countries[w.a], b = state.countries[w.b]; if (!a || !b || a.rebelOf || b.rebelOf || !cross(a, b)) continue;
    for (const t of new Set([theaterOf(a), theaterOf(b)])) if (t) count[t] = (count[t] || 0) + 1;
  }
  // settings.unifyFronts: 'auto' (three wars, or a faction war), 'all' (any A-v-B war), 'off'
  const mode = state.settings?.unifyFronts || 'auto';
  if (mode === 'off') return out;
  for (const [t, n] of Object.entries(count)) if (mode === 'all' || n >= 3 || state.global?.theaterWar?.[t]) out.add(t);
  return out;
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
  if (loc.kind === 'sea') { if (loc.lat != null && loc.lon != null) return { lat: loc.lat, lon: loc.lon }; const z = SEA_ZONES[loc.id]; return z && { lat: z.lat, lon: z.lon }; }
  const c = state.countries[loc.id];
  return c && { lat: c.lat, lon: c.lon };
}

export function unitRange(state, unit) {
  if (unit.type === 'missile') return MISSILE_RANGE_KM[unit.owner] || 1000;
  // With air-to-air tankers a country's fighter and bomber wings can reach any country on Earth.
  if ((unit.type === 'bomber' || unit.type === 'fighter') && TANKER_COUNTRIES.has(unit.owner)) return 20000;
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

// Countries permanently out of bounds: no orders, no forces, no sandbox powers, and every map draws an OUT OF BOUNDS
// zone over each group (one zone for Israel and Palestine, one for Saudi Arabia).
export const OOB_GROUPS = [['376', '275'], ['682']];
export const OUT_OF_BOUNDS = OOB_GROUPS.flat();
export const isOOB = id => OUT_OF_BOUNDS.includes(id);
export const OOB_ERROR = 'Israel, Palestine and Saudi Arabia are out of bounds in this simulation.';
export function isActive(c) { return c && c.control !== 'inactive' && !c.capitulated && !isOOB(c.id); }

// Who sits in a UN vote. With delegatesOnly, only countries a delegation plays (when the room has any).
export function unVoters(state, body, delegatesOnly = true) {
  let all = Object.values(state.countries).filter(c => isActive(c) && (c.major || c.control === 'player'));
  if (delegatesOnly && all.some(c => c.control === 'player')) all = all.filter(c => c.control === 'player');
  if (body !== 'council') return all;
  const p5 = all.filter(c => c.veto);
  const rest = all.filter(c => !c.veto).sort((a, b) => b.influence - a.influence).slice(0, 10);
  return [...p5, ...rest];
}

// How a computer-run country votes on a resolution: with its friends, against its rivals, and for peace.
export function aiVote(s, c, v) {
  if (v.target && (c.id === v.target)) return 'no';
  if (c.id === v.sponsor) return 'yes';
  const rs = v.sponsor ? relation(s, c.id, v.sponsor) : 0;
  const rt = v.target ? relation(s, c.id, v.target) : 0;
  const score = rs * 0.6 - rt * 0.6 + (v.kind === 'ceasefire' || v.kind === 'humanitarian' ? 25 : 0);
  return score > 12 ? 'yes' : score < -12 ? 'no' : 'abstain';
}
