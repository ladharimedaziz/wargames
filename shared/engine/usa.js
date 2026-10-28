// The continental US committee. Step one is the map: a layered view of the lower 48 that the Zeus steers and the stage shows.
import { clamp } from './core.js';

const err = error => ({ ok: false, error });
const ok = (r = {}) => ({ ok: true, ...r });
export const USA_LAYERS = ['states', 'counties', 'cities', 'highways', 'labels', 'military', 'hospital', 'police', 'fire', 'ambulance', 'prison', 'power'];
// The dot layers: what each one shows, its colour, the zoom at which its dots appear and the zoom at which they carry a label.
export const USA_DOTS = {
  military: { name: 'Military sites', color: '#7fbf6a', dot: 1, label: 3.5 },
  power: { name: 'Power plants', color: '#f5d34a', dot: 2, label: 7 },
  hospital: { name: 'Hospitals', color: '#ffffff', dot: 4, label: 12 },
  prison: { name: 'Prisons', color: '#a9a9b8', dot: 6, label: 12 },
  police: { name: 'Police stations', color: '#4f9bff', dot: 8, label: 22 },
  fire: { name: 'Fire stations', color: '#ff5a4a', dot: 10, label: 26 },
  ambulance: { name: 'Ambulance services', color: '#ffb347', dot: 12, label: 26 },
};
// Military dots take the colour of their service.
export const MIL_COLORS = { usa: '#7fbf6a', usar: '#7fbf6a', armyNationalGuard: '#b9a66a', airNationalGuard: '#8fc6ff', usaf: '#6aa8ff', afr: '#6aa8ff', usn: '#4a78e0', usnr: '#4a78e0', usmc: '#ff6a5a', usmcr: '#ff6a5a', whs: '#d0d0d8', other: '#d0d0d8' };
export const MIL_NAMES = { usa: 'Army', usar: 'Army Reserve', armyNationalGuard: 'Army National Guard', airNationalGuard: 'Air National Guard', usaf: 'Air Force', afr: 'Air Force Reserve', usn: 'Navy', usnr: 'Navy Reserve', usmc: 'Marine Corps', usmcr: 'Marine Corps Reserve', whs: 'Washington HQ Services', other: 'Other' };

// ---- Emergency lightbars ----
export const LIGHT_SERVICES = { police: 'Police', fire: 'Fire', ambulance: 'EMS' };
export const LIGHT_PALETTE = { red: '#ff2a2a', blue: '#2a5bff', white: '#ffffff', amber: '#ffb000', green: '#22d46a' };
const R = LIGHT_PALETTE.red, Bl = LIGHT_PALETTE.blue, W = LIGHT_PALETTE.white, A = LIGHT_PALETTE.amber;
// Starting colours, used where nothing more specific is set. Police run red and blue, fire and EMS red and white. Only the cases
// below are written down: Maine (statute: police blue, fire and ambulances red) and Arizona (police red forward and blue, fire red
// and white, volunteers amber or white). Everything else is an approximation the Zeus can correct per state or county.
export const LIGHT_DEFAULT = { police: [R, Bl], fire: [R, W], ambulance: [R, W] };
export const LIGHT_STATE = { 'ME:police': [Bl, W], 'ME:fire': [R, W], 'ME:ambulance': [R, W] };
// Flash patterns: steps of [colour index, milliseconds]; -1 is dark. Index 0 and 1 are the two colours of the bar.
export const LIGHT_PATTERNS = {
  alternate: { name: 'Alternate', steps: [[0, 130], [-1, 20], [1, 130], [-1, 20]] },
  wigwag: { name: 'Wig-wag (fast)', steps: [[0, 70], [1, 70]] },
  double: { name: 'Double flash', steps: [[0, 45], [-1, 45], [0, 45], [-1, 45], [1, 45], [-1, 45], [1, 45], [-1, 45]] },
  triple: { name: 'Triple burst', steps: [[0, 40], [-1, 40], [0, 40], [-1, 40], [0, 40], [-1, 110], [1, 40], [-1, 40], [1, 40], [-1, 40], [1, 40], [-1, 110]] },
  quad: { name: 'Quad flash', steps: [[0, 35], [-1, 35], [0, 35], [-1, 35], [0, 35], [-1, 35], [0, 35], [-1, 90], [1, 35], [-1, 35], [1, 35], [-1, 35], [1, 35], [-1, 35], [1, 35], [-1, 90]] },
  rotate: { name: 'Rotating', steps: [[0, 160], [-1, 40], [1, 160], [-1, 40], [2, 160], [-1, 40]] },
  strobe: { name: 'Strobe', steps: [[0, 25], [-1, 55], [1, 25], [-1, 55]] },
};
export const LIGHT_PATTERN_IDS = Object.keys(LIGHT_PATTERNS);
const isColors = c => Array.isArray(c) && c.length >= 1 && c.length <= 3 && c.every(x => /^#[0-9a-fA-F]{6}$/.test(x));
// A county's colours: a county setting wins, then a state setting, then the written-down state cases, then the default.
export function lightColors(usa, service, state, geoid) {
  const o = usa.lightColors || {};
  return o[`${geoid}:${service}`] || o[`${state}:${service}`] || LIGHT_STATE[`${state}:${service}`] || LIGHT_DEFAULT[service];
}

export const USA_VIEW = { lon: -96.5, lat: 38.5, k: 1 }; // k = zoom, 1 shows the whole lower 48
export const USA_MAX_ZOOM = 60;

// Fills in anything a save made by an older version lacks.
export function migrateUsa(s) {
  const u = s.usa; if (!u) return s;
  u.layers = { ...createUsaFields({ display: {} }).usa.layers, ...u.layers };
  u.lightbars ||= { police: false, fire: false, ambulance: false }; u.lightPattern ||= 'mixed'; u.lightColors ||= {};
  return s;
}

export function createUsaFields(s) {
  s.display.scene = 'usa';
  s.usa = {
    title: 'The United States', subtitle: 'Governors in session',
    accent: '#4aa8ff',
    view: { ...USA_VIEW },
    layers: { states: true, counties: true, cities: true, highways: true, labels: true, military: true, hospital: true, police: false, fire: false, ambulance: false, prison: false, power: false },
    lightbars: { police: false, fire: false, ambulance: false }, lightPattern: 'mixed', lightColors: {},
    highlight: [], // state postal codes marked on the stage
    note: '',
  };
  return s;
}

export const usaActions = {
  usaSetView: { perm: 'zeus', run(s, a) {
    migrateUsa(s);
    const lon = Number(a.lon), lat = Number(a.lat), k = Number(a.k);
    if (![lon, lat, k].every(Number.isFinite)) return err('That view is not valid.');
    s.usa.view = { lon: clamp(lon, -126, -65), lat: clamp(lat, 23, 50.5), k: clamp(k, 1, USA_MAX_ZOOM) };
    return ok();
  } },
  usaLayer: { perm: 'zeus', run(s, a) {
    migrateUsa(s);
    if (!USA_LAYERS.includes(a.layer)) return err('Unknown layer.');
    s.usa.layers[a.layer] = a.on === undefined ? !s.usa.layers[a.layer] : !!a.on;
    return ok();
  } },
  usaLightbars: { perm: 'zeus', run(s, a) {
    migrateUsa(s);
    const list = a.service === 'all' ? Object.keys(LIGHT_SERVICES) : [a.service];
    if (!list.every(x => x in LIGHT_SERVICES)) return err('Unknown service.');
    for (const x of list) s.usa.lightbars[x] = a.on === undefined ? !s.usa.lightbars[x] : !!a.on;
    return ok();
  } },
  usaLightPattern: { perm: 'zeus', run(s, a) {
    migrateUsa(s);
    if (a.pattern !== 'mixed' && !LIGHT_PATTERNS[a.pattern]) return err('Unknown pattern.');
    s.usa.lightPattern = a.pattern;
    return ok();
  } },
  // Colours for one service in a state ("TX") or a county (its five-digit FIPS code); no colours clears the setting.
  usaLightColors: { perm: 'zeus', run(s, a) {
    migrateUsa(s);
    if (!(a.service in LIGHT_SERVICES)) return err('Unknown service.');
    const id = String(a.id || '');
    if (!/^([A-Z]{2}|\d{5})$/.test(id)) return err('Name a state (like TX) or a county code.');
    const key = `${id}:${a.service}`;
    if (a.colors == null) delete s.usa.lightColors[key];
    else if (isColors(a.colors)) s.usa.lightColors[key] = a.colors.map(c => c.toLowerCase());
    else return err('Give one to three colours.');
    return ok();
  } },
  usaHighlight: { perm: 'zeus', run(s, a) {
    const list = (Array.isArray(a.states) ? a.states : []).map(x => String(x).toUpperCase()).filter(x => /^[A-Z]{2}$/.test(x)).slice(0, 49);
    s.usa.highlight = [...new Set(list)];
    return ok();
  } },
  usaSetTopic: { perm: 'zeus', run(s, a) {
    for (const [k, n] of [['title', 100], ['subtitle', 140], ['note', 300]]) if (a[k] !== undefined) s.usa[k] = String(a[k]).slice(0, n);
    return ok();
  } },
};
