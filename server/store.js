// Holds every committee in memory, autosaves to disk, and keeps rewind points.
import { migrateGrid } from '../shared/engine/control.js';
import { gzipSync, gunzipSync } from 'node:zlib';
import { readJSON, writeJSON } from './files.js';
import { COMMITTEE_IDS } from './auth.js';
import { createWorldState, createCourtState, createCouncilState, createUsaState } from '../shared/engine/state.js';
import { applyScenario } from '../shared/engine/scenarios.js';
import { migrateUsa } from '../shared/engine/usa.js';
import { COUNCIL_PRESETS } from '../shared/data/councils.js';
import * as geo from './geo-index.js';
import { splitMapFor, stateSplit } from '../shared/data/german-split.js';

const infoOf = g => ({ ids: g.atlasCountryIds(), name: g.atlasName, anchor: g.anchorOf, neighbors: g.neighborsOf });
const geoInfo = infoOf(geo);
let coldInfo = null; // the 1985 map, with Germany split in two
const infoFor = preset => (splitMapFor(preset) ? (coldInfo ||= infoOf(geo.coldIndex())) : geoInfo);
const DEFAULTS = {
  ww3: { name: 'WW3 Crisis', mode: 'world', disguise: true },
  bravo: { name: 'Committee Bravo', mode: 'world' },
  charlie: { name: 'Court of Justice', mode: 'court' },
  delta: { name: 'Committee Delta', mode: 'world' },
};
const MAX_SNAPSHOTS = 40;
const PRESET_MODE = { modern: 'world', cold85: 'world', latam: 'world', usa: 'usa', court: 'court', ...Object.fromEntries(Object.keys(COUNCIL_PRESETS).map(k => [k, 'council'])) };
const PRESET_LABEL = { cold85: 'Cold War 1985', latam: 'The Americas South of the Border', usa: 'The United States', ...Object.fromEntries(Object.entries(COUNCIL_PRESETS).map(([k, p]) => [k, p.name])) };

// The map a committee is played on (the Cold War one has East and West Germany).
export const geoFor = state => (stateSplit(state) ? geo.coldIndex().geo : geo);

export class Store {
  constructor(dir) {
    this.dir = dir;
    this.committees = new Map();
    this.snapshots = new Map(); // id -> [{ id, label, turn, at, by, data: gzip Buffer }]
    this.timers = new Map();
    this.dms = readJSON(dir, 'dms.json', {});
    for (const id of COMMITTEE_IDS) {
      const saved = readJSON(dir, `committees/${id}.json.gz`, null);
      this.committees.set(id, saved && saved.id === id ? migrateUsa(migrateGrid(saved)) : this.fresh(id));
      const snaps = readJSON(dir, `committees/${id}.snapshots.json.gz`, []);
      this.snapshots.set(id, snaps.map(s => ({ ...s, data: Buffer.from(s.data, 'base64') })));
    }
    this.bootId = Date.now().toString(36);
  }

  // `kind` is a committee type: world, court, council, or a preset (a world scenario or a UN-style agenda).
  fresh(id, kind, name, keepName) {
    const d = DEFAULTS[id] || { name: id, mode: 'world' };
    const preset = kind && PRESET_MODE[kind] ? kind : null, m = preset ? PRESET_MODE[preset] : (kind || d.mode);
    const label = preset && PRESET_LABEL[preset];
    const nm = keepName && name ? name : label || name || d.name;
    const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    const s = m === 'court' ? createCourtState({ id, name: nm, seed })
      : m === 'usa' ? createUsaState({ id, name: nm, seed })
      : m === 'council' ? createCouncilState({ id, name: nm, seed }, preset || 'who')
      : createWorldState({ id, name: nm, seed }, infoFor(preset));
    s.meta.createdAt = Date.now(); s.meta.preset = preset || (m === 'world' ? 'modern' : m); migrateGrid(s);
    if (m === 'world') applyScenario(s, preset || 'modern', infoFor(preset));
    if (d.disguise && m === 'world') s.display.scene = 'disguise';
    return s;
  }

  get(id) { return this.committees.get(id); }
  list() { return [...this.committees.values()]; }

  // Debounced autosave: at most once a second per committee.
  touch(id) {
    if (this.timers.has(id)) return;
    this.timers.set(id, setTimeout(() => { this.timers.delete(id); this.save(id); }, 1000));
  }
  save(id) {
    try { writeJSON(this.dir, `committees/${id}.json.gz`, this.get(id)); } catch (e) { console.error('[store] save failed', id, e.message); }
  }
  saveSnapshots(id) {
    try { writeJSON(this.dir, `committees/${id}.snapshots.json.gz`, this.snapshots.get(id).map(s => ({ ...s, data: s.data.toString('base64') }))); } catch (e) { console.error('[store] snapshot save failed', e.message); }
  }
  flush() { for (const id of COMMITTEE_IDS) { this.save(id); this.saveSnapshots(id); } writeJSON(this.dir, 'dms.json', this.dms); }

  snapshot(id, label, by) {
    const s = this.get(id);
    const list = this.snapshots.get(id);
    const snap = { id: `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`, label, turn: s.meta?.turn || 0, clock: s.meta?.clock, at: Date.now(), by, data: gzipSync(JSON.stringify(s)) };
    list.push(snap);
    while (list.length > MAX_SNAPSHOTS) list.splice(list.findIndex(x => !x.keep) >= 0 ? list.findIndex(x => !x.keep) : 0, 1);
    this.saveSnapshots(id);
    return snap;
  }
  deleteSnapshot(id, snapId) {
    const list = this.snapshots.get(id), i = list.findIndex(s => s.id === snapId);
    if (i < 0) return false;
    list.splice(i, 1); this.saveSnapshots(id);
    return true;
  }
  snapshotList(id) { return this.snapshots.get(id).map(({ data, ...rest }) => ({ ...rest, size: data.length })); }
  rewind(id, snapId, by) {
    const snap = this.snapshots.get(id).find(s => s.id === snapId);
    if (!snap) return null;
    this.snapshot(id, `Before rewind to "${snap.label}"`, by);
    const state = migrateUsa(migrateGrid(JSON.parse(gunzipSync(snap.data).toString("utf8"))));
    state.version = (this.get(id).version || 0) + 1;
    state.kronos = this.get(id).kronos; // rewinding never undoes Kronos's eye or lock
    this.committees.set(id, state);
    this.touch(id);
    return state;
  }
  replace(id, state, by, label = 'Before restore') {
    this.snapshot(id, label, by);
    state.id = id; migrateGrid(state); migrateUsa(state);
    state.version = Math.max(state.version || 0, (this.get(id).version || 0) + 1);
    this.committees.set(id, state);
    this.touch(id);
    return state;
  }
  reset(id, kind, by) {
    this.snapshot(id, 'Before reset', by);
    const cur = this.get(id), same = !kind || kind === cur.mode || kind === cur.meta?.preset;
    const s = this.fresh(id, kind || cur.meta?.preset || cur.mode, cur.name, same);
    s.version = (this.get(id).version || 0) + 1;
    this.committees.set(id, s);
    this.touch(id);
    return s;
  }

  addDM(committee, msg) {
    (this.dms[committee] ||= []).push(msg);
    if (this.dms[committee].length > 500) this.dms[committee].shift();
    clearTimeout(this.dmTimer);
    this.dmTimer = setTimeout(() => writeJSON(this.dir, 'dms.json', this.dms), 500);
    return msg;
  }
}

export { geo };
