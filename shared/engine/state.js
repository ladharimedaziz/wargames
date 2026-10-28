// Builds fresh committee states for world (map) mode and court mode.
import { COUNTRIES, minorCountry } from '../data/countries.js';
import { alliancesOf, defaultBloc } from '../data/alliances.js';
import { MILITARIES, DEPLOYMENTS, AIR_BASES, carrierName } from '../data/militaries.js';
import { ECONOMIES, ECONOMY_DEFAULT } from '../data/economies.js';
import { SEA_ZONES } from '../data/places.js';
import { zonesTouching } from '../geo.js';
import { COURT_PHASES, newId, isOOB } from './core.js';
import { createCouncilFields } from './council.js';
import { createUsaFields } from './usa.js';

function baseState({ id, name, mode, seed }) {
  return {
    id, name, mode, version: 1,
    meta: { turn: 1, clock: '2027-03-14', turnDays: 7, idSeq: 0, createdAt: 0, phase: 'setup' },
    rng: { seed: seed >>> 0, n: 0 },
    settings: { lang: 'en', sfx: true, airMode: 'auto', night: false, showStrikes: true, aesthetic: false, layers: { air: true, naval: true, units: true, relations: false, labels: true }, fog: 'public' },
    display: {
      scene: mode === 'court' ? 'court' : 'map',
      introAt: 0, revealAt: 0, endingAt: 0, ending: null, reportAt: 0,
      disguise: { title: 'Global Fisheries Summit', subtitle: 'Sustainable quotas for a shared ocean', agenda: ['Opening remarks', 'Quota allocation for the Indian Ocean', 'Coffee break', 'Coastal livelihoods panel'] },
      banner: null, focus: null, arms: true,
    },
    timer: { label: '', duration: 0, endsAt: 0, remaining: 0, running: false },
    kronos: { eye: false, eyeAt: 0, locked: false, note: '' },
    log: [],
  };
}

export function createWorldState(opts, geoInfo) {
  const s = baseState({ ...opts, mode: 'world' });
  s.countries = {};
  for (const id of geoInfo.ids) {
    const d = COUNTRIES[id] ? structuredClone(COUNTRIES[id]) : minorCountry(id, geoInfo.name(id) || id);
    const a = (d.lat == null) ? geoInfo.anchor(id) : { lat: d.lat, lon: d.lon };
    if (!a) continue;
    const e = ECONOMIES[d.a3] || ECONOMY_DEFAULT;
    s.countries[id] = {
      id, a3: d.a3, name: d.name, ar: d.ar, major: d.major, lat: a.lat, lon: a.lon,
      control: d.major ? 'ai' : 'inactive', bloc: defaultBloc(id),
      base: { gdp: d.gdp, pop: d.pop, industry: e.industry, energy: e.energy, support: e.support, stability: e.stability, inflation: e.inflation, growth: e.growth },
      gdp: d.gdp, treasury: e.reserves ?? Math.round(d.gdp * 0.08 * 10) / 10,
      industry: e.industry, energy: e.energy, support: e.support, stability: e.stability, inflation: e.inflation, influence: Math.min(100, Math.round(10 + Math.log10(d.gdp + 1) * 18)),
      airDefense: d.airDefense, nuclear: { has: d.nuclear, alert: false }, oilNet: d.oilNet,
      alliances: alliancesOf(id), stealth: d.stealth, veto: d.veto,
      roe: 'firm', damage: 0, casualties: 0, refugees: 0, occupiedBy: null, front: null, capitulated: false,
      sanctions: [], overflight: [], intel: {}, blindUntil: 0, cyber: {}, lastStruck: 0, warWeariness: 0,
      quality: MILITARIES[d.a3]?.quality || { land: 1, air: 1, sea: 1 },
      forces0: MILITARIES[d.a3]?.forces || d.forces,
    };
  }
  s.units = {};
  const place = (owner, type, loc) => {
    const uid = newId(s, 'u'); s.units[uid] = { id: uid, type, owner, loc, strength: 100, blockade: false, cap: false };
    if (type === 'carrier') { const name = carrierName(s.units, s.countries[owner].a3); if (name) s.units[uid].name = name; }
  };
  const byA3 = Object.fromEntries(Object.values(s.countries).map(c => [c.a3, c.id]));
  for (const c of Object.values(s.countries)) {
    const f = c.forces0; delete c.forces0;
    if (isOOB(c.id)) { Object.assign(c, { control: 'inactive', oob: true, bloc: 'N', alliances: [] }); continue; }
    const bases = AIR_BASES[c.a3] || {};
    for (const type of ['army', 'fighter', 'bomber', 'missile']) for (let i = 0; i < f[type]; i++) {
      const host = bases[type]?.[i] && !isOOB(byA3[bases[type][i]]) && byA3[bases[type][i]];
      place(c.id, type, { kind: 'country', id: host || c.id });
    }
    const zones = zonesTouching(c.id), dep = DEPLOYMENTS[c.a3] || {};
    if (zones.length || dep.fleet) {
      const at = (type, i, shift) => dep[type]?.[i] && SEA_ZONES[dep[type][i]] ? dep[type][i] : zones[(i + shift) % zones.length];
      for (let i = 0; i < f.fleet; i++) { const z = at('fleet', i, 0); if (z) place(c.id, 'fleet', { kind: 'sea', id: z }); }
      for (let i = 0; i < f.carrier; i++) { const z = at('carrier', i, 1); if (z) place(c.id, 'carrier', { kind: 'sea', id: z }); }
    }
  }
  s.adjacency = Object.fromEntries(Object.keys(s.countries).map(id => [id, geoInfo.neighbors(id).filter(n => s.countries[n])]));
  s.relations = {};
  s.wars = [];
  s.treaties = [];
  s.orders = [];
  s.review = [];
  s.aired = [];
  s.history = [];
  s.unVotes = [];
  s.lastResolution = null;
  s.global = {
    tension: 3, oilPrice: 82, gdpIndex: 1, nukesUsed: 0, nukeOverride: false, pauseUntil: 0,
    chokepoints: Object.fromEntries(Object.entries(SEA_ZONES).filter(([, z]) => z.choke).map(([k]) => [k, { status: 'open', by: null }])),
    closedAirspace: {}, weather: {}, casualties: 0, refugees: 0,
  };
  s.blocs = {
    A: { name: 'Western Alliance', ar: 'التحالف الغربي', color: '#6a9ccf' },
    B: { name: 'Eastern Coalition', ar: 'التحالف الشرقي', color: '#d9503f' },
    C: { name: 'Third Bloc', ar: 'الكتلة الثالثة', color: '#f5a524' },
    N: { name: 'Neutral', ar: 'محايد', color: '#6b7280' },
  };
  s.history.push(snapshotStats(s));
  return s;
}

export function snapshotStats(s) {
  const top = Object.values(s.countries).filter(c => c.major).sort((a, b) => b.base.gdp - a.base.gdp).slice(0, 12);
  return {
    turn: s.meta.turn, clock: s.meta.clock, tension: s.global.tension, oil: Math.round(s.global.oilPrice),
    gdpIndex: Math.round(s.global.gdpIndex * 1000) / 1000, casualties: Math.round(s.global.casualties), refugees: Math.round(s.global.refugees),
    wars: s.wars.length, gdp: Object.fromEntries(top.map(c => [c.id, Math.round(c.gdp)])),
  };
}

export function createCourtState(opts) {
  const s = baseState({ ...opts, mode: 'court' });
  s.court = {
    caseTitle: 'The Tribunal of History',
    caseSubtitle: 'Case No. 1',
    phase: 0, phases: [...COURT_PHASES],
    seats: [
      { id: 'judge', role: 'judge', name: 'Presiding Judge', side: 'bench' },
      { id: 'pros1', role: 'prosecution', name: 'Lead Prosecutor', side: 'prosecution' },
      { id: 'pros2', role: 'prosecution', name: 'Co-Prosecutor', side: 'prosecution' },
      { id: 'def1', role: 'defence', name: 'Lead Defence Counsel', side: 'defence' },
      { id: 'def2', role: 'defence', name: 'Co-Defence Counsel', side: 'defence' },
      { id: 'witness', role: 'witness', name: 'Witness', side: 'witness' },
      { id: 'jury', role: 'jury', name: 'The Jury', side: 'jury' },
    ],
    speaker: null, speakerSince: 0, queue: [],
    speakTimer: { duration: 120, endsAt: 0, remaining: 120, running: false },
    objection: null, objections: [],
    exhibits: [],
    scales: 0,
    verdict: { text: '', revealedAt: 0, detail: '' },
    stats: { speaking: {} },
  };
  return s;
}

export function createCouncilState(opts, preset) {
  return createCouncilFields(baseState({ ...opts, mode: 'council' }), preset);
}

export function createUsaState(opts) {
  return createUsaFields(baseState({ ...opts, mode: 'usa' }));
}
