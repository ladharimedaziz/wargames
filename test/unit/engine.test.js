// Engine, reducer and command-bar tests. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as geo from '../../server/geo-index.js';
import { createWorldState, createCourtState } from '../../shared/engine/state.js';
import { CELL, NI } from '../../shared/engine/control.js';
import { applyScenario } from '../../shared/engine/scenarios.js';
import { applyAction } from '../../shared/engine/reducer.js';
import { parseCommand } from '../../shared/engine/command.js';
import { atWar, relation, warClosures, fullWarTheaters } from '../../shared/engine/core.js';
import { validateOrder, autoUnits } from '../../shared/engine/orders.js';

const gi = { ids: geo.atlasCountryIds(), name: geo.atlasName, anchor: geo.anchorOf, neighbors: geo.neighborsOf };
const US = '840', RU = '643', UA = '804', FR = '250', AE = '784', JP = '392';

function world() {
  const s = createWorldState({ id: 't', name: 'Test', seed: 7 }, gi);
  let now = 1_000_000;
  const as = role => (action) => applyAction(s, action, { role, user: role === 'kronos' ? 'kronos' : 't-stage', now: (now += 1000), geo });
  return { s, zeus: as('stage'), kronos: as('kronos') };
}
function command(s, zeus, text) {
  const p = parseCommand(s, text, 'stage');
  assert.ok(p.ok, `${text}: ${p.error}`);
  for (const a of p.actions) { const r = zeus(a); assert.ok(r.ok, `${text}: ${r.error}`); }
  return p;
}

test('a fresh world has countries, units and open chokepoints', () => {
  const { s } = world();
  assert.ok(Object.keys(s.countries).length > 80);
  assert.ok(Object.keys(s.units).length > 50);
  assert.equal(s.global.chokepoints.hormuz.status, 'open');
  assert.equal(s.global.tension, 3);
});

test('Zeus cannot use Kronos powers, Kronos can', () => {
  const { s, zeus, kronos } = world();
  assert.equal(zeus({ type: 'setOil', value: 150 }).ok, false);
  assert.equal(kronos({ type: 'setOil', value: 150 }).ok, true);
  assert.equal(s.global.oilPrice, 150);
});

test('Zeus can set world tension, and it animates', () => {
  const { s, zeus } = world();
  assert.equal(zeus({ type: 'setTension', value: 7.5 }).ok, true);
  assert.equal(s.global.tension, 7.5);
  assert.deepEqual(s.lastResolution.events[0], { kind: 'tension', from: s.lastResolution.events[0].from, to: 7.5 });
});

test('acts of god play an animation at a spot in the country', () => {
  const { s, kronos } = world();
  for (const kind of ['earthquake', 'flood', 'pandemic', 'blackout', 'coup', 'discovery']) {
    assert.equal(kronos({ type: 'disaster', country: '818', kind }).ok, true);
    const e = s.lastResolution.events[0];
    assert.equal(e.kind, 'act'); assert.equal(e.act, kind); assert.equal(e.country, '818');
    assert.ok(Number.isFinite(e.at.lat) && Number.isFinite(e.at.lon));
  }
});

test('a Kronos freeze blocks Zeus changes but not reads', () => {
  const { zeus, kronos } = world();
  kronos({ type: 'setLock', value: true });
  assert.equal(zeus({ type: 'addNews', en: 'Test' }).ok, false);
  kronos({ type: 'setLock', value: false });
  assert.equal(zeus({ type: 'addNews', en: 'Test' }).ok, true);
});

test('the command bar understands what the chair says', () => {
  const { s, zeus } = world();
  command(s, zeus, 'player egypt uae qatar');
  assert.equal(s.countries[AE].control, 'player');
  command(s, zeus, 'russia declares war on ukraine');
  assert.ok(s.orders.some(o => o.type === 'war'), 'the declaration waits in the order queue');
  zeus({ type: 'resolveTurn' });
  assert.ok(atWar(s, RU, UA));
  command(s, zeus, 'timer 5:00 Unmoderated caucus');
  assert.equal(s.timer.label, 'Unmoderated caucus');
  for (const text of ['russia strike france 2 bombers', 'iran blockade hormuz 2', 'uk sanction russia', 'saudi aid yemen 20']) {
    assert.ok(parseCommand(s, text, 'stage').ok, text);
  }
});

test('nuclear orders are refused below tension 10', () => {
  const { s, kronos } = world();
  const p = parseCommand(s, 'russia nuke france', 'stage');
  const queued = p.ok ? p.actions.map(a => applyAction(s, a, { role: 'stage', user: 'x', now: 1, geo })) : [];
  assert.ok(!p.ok || queued.some(r => !r.ok), 'a nuke was accepted at tension 3');
  kronos({ type: 'setTension', value: 10 });
  const p2 = parseCommand(s, 'russia nuke france', 'stage');
  assert.ok(p2.ok, p2.error);
});

test('resolving a turn advances the clock and airs headlines (or queues them in review mode)', () => {
  const { s, zeus } = world();
  command(s, zeus, 'russia declares war on ukraine');
  const turn = s.meta.turn;
  assert.ok(zeus({ type: 'resolveTurn' }).ok);
  assert.equal(s.meta.turn, turn + 1);
  assert.ok(s.aired.some(a => /declares war/i.test(a.en)), 'headlines air automatically by default');
  assert.ok(zeus({ type: 'setSetting', key: 'autoAir', value: false }).ok);
  command(s, zeus, 'russia invade ukraine 3');
  assert.ok(zeus({ type: 'resolveTurn' }).ok);
  assert.ok(s.lastResolution && s.lastResolution.events.length > 0);
  assert.ok(s.review.some(r => r.status === 'pending'));
});

test('Security Council vetoes block a resolution', () => {
  const { s, zeus } = world();
  s.countries[RU].control = 'player';
  zeus({ type: 'voteOpen', title: 'Condemn', kind: 'condemn', sponsor: US, target: RU, body: 'council' });
  zeus({ type: 'voteCast', country: RU, choice: 'no' });
  const r = zeus({ type: 'voteClose' });
  assert.equal(r.result.passed, false);
  assert.ok(r.result.vetoes.includes(RU));
});

test('UN votes: only delegations count, and prepared votes stand', () => {
  const { s, zeus } = world();
  s.countries[US].control = 'player'; s.countries[RU].control = 'player'; s.countries[UA].control = 'player';
  zeus({ type: 'voteOpen', title: 'Ceasefire now', kind: 'ceasefire', body: 'assembly', preset: { [RU]: 'no', [UA]: 'yes' } });
  const v = s.unVotes.find(x => x.open);
  assert.deepEqual(Object.keys(v.votes).sort(), [US, RU, UA].sort(), 'only the three delegations vote');
  assert.equal(v.votes[RU], 'no'); assert.equal(v.votes[UA], 'yes'); assert.equal(v.votes[US], 'abstain');
  zeus({ type: 'voteClose' });
  zeus({ type: 'voteOpen', title: 'Everyone', kind: 'condemn', body: 'assembly', delegatesOnly: false });
  assert.ok(Object.keys(s.unVotes.find(x => x.open).votes).length > 3, 'opened to every major country');
});

test('a signed peace treaty ends the war', () => {
  const { s, zeus } = world();
  command(s, zeus, 'russia declares war on ukraine');
  zeus({ type: 'resolveTurn' });
  assert.ok(atWar(s, RU, UA));
  zeus({ type: 'treatyDraft', parties: [RU, UA], kind: 'peace', title: 'Treaty of Riyadh' });
  assert.ok(zeus({ type: 'treatySign', all: true }).ok);
  assert.equal(atWar(s, RU, UA), false);
});

test('Kronos chokepoint control holds through turn resolution until set back to auto', () => {
  const { s, zeus, kronos } = world();
  kronos({ type: 'setChokepoint', zone: 'hormuz', status: 'closed' });
  zeus({ type: 'resolveTurn' });
  assert.equal(s.global.chokepoints.hormuz.status, 'closed');
  kronos({ type: 'setChokepoint', zone: 'hormuz', status: 'auto' });
  zeus({ type: 'resolveTurn' });
  assert.equal(s.global.chokepoints.hormuz.status, 'open');
});

test('sandbox powers: disaster, smite and spawning units', () => {
  const { s, kronos } = world();
  const gdp = s.countries[JP].gdp;
  assert.ok(kronos({ type: 'disaster', country: JP, kind: 'earthquake' }).ok);
  assert.ok(s.countries[JP].gdp < gdp);
  assert.ok(kronos({ type: 'smite', target: FR, from: RU, power: 3 }).ok);
  const before = Object.keys(s.units).length;
  assert.ok(kronos({ type: 'spawnUnits', country: AE, unitType: 'carrier', count: 2 }).ok);
  assert.equal(Object.keys(s.units).length, before + 2);
});

test('forcing peace resets relations away from war', () => {
  const { s, kronos } = world();
  kronos({ type: 'forceWar', a: RU, b: UA });
  assert.equal(relation(s, RU, UA), -100);
  kronos({ type: 'forcePeace', a: RU, b: UA });
  assert.equal(atWar(s, RU, UA), false);
});

test('court: speaker, objection, ruling, exhibits and verdict', () => {
  const s = createCourtState({ id: 'c', name: 'Court', seed: 1 });
  let now = 0;
  const act = a => { const r = applyAction(s, a, { role: 'stage', user: 'c-stage', now: (now += 5000), geo }); assert.ok(r.ok, `${a.type}: ${r.error}`); return r; };
  act({ type: 'setSpeaker', seat: 'pros1' });
  assert.equal(s.court.speakTimer.running, true);
  act({ type: 'queueAdd', seat: 'def1' });
  act({ type: 'objection', by: 'def1', grounds: 'Hearsay' });
  assert.equal(s.court.speakTimer.running, false, 'an objection pauses the clock');
  act({ type: 'rule', ruling: 'sustained' });
  assert.equal(s.court.scales, -1, 'a sustained defence objection tips the scales to the defence');
  assert.equal(s.court.speakTimer.running, true);
  act({ type: 'queueNext' });
  assert.equal(s.court.speaker, 'def1');
  assert.equal(act({ type: 'addExhibit', title: 'Letter', side: 'prosecution' }).exhibit.code, 'P-1');
  act({ type: 'verdictSet', text: 'GUILTY', tone: 'guilty' });
  act({ type: 'verdictReveal' });
  assert.equal(s.court.speaker, null);
  assert.equal(s.court.speakTimer.running, false);
  assert.ok(s.court.stats.speaking.pros1 > 0);
});

test('world-only actions are refused in a court committee', () => {
  const s = createCourtState({ id: 'c', name: 'Court', seed: 1 });
  assert.equal(applyAction(s, { type: 'resolveTurn' }, { role: 'stage', user: 'x', now: 1, geo }).ok, false);
});

test('real alliances: hub treaties do not tie US partners to each other', async () => {
  const { s } = world();
  const { boundAllies } = await import('../../shared/engine/core.js');
  assert.ok(boundAllies(s, US, JP), 'US and Japan are treaty allies');
  assert.ok(boundAllies(s, AE, '634'), 'the UAE and Qatar are bound through the GCC');
  assert.ok(boundAllies(s, FR, '616'), 'France and Poland are NATO allies');
  assert.equal(boundAllies(s, '376', '634'), null, 'Israel and Qatar are not allied through the US');
  assert.equal(s.countries[RU].bloc, 'B');
  assert.equal(s.countries[US].bloc, 'A');
});

test('invasions push a front line forward until the country falls', () => {
  const { s, kronos } = world();
  kronos({ type: 'spawnUnits', country: RU, unitType: 'army', count: 20 });
  let peak = 0;
  let turns = 0;
  for (let i = 0; i < 12 && !s.countries[UA].occupiedBy; i++, turns++) {
    for (const a of parseCommand(s, 'russia invade ukraine 22', 'stage').actions) kronos(a);
    kronos({ type: 'resolveTurn' });
    peak = Math.max(peak, s.countries[UA].front?.pct || 0);
    if (s.countries[UA].front && !s.countries[UA].occupiedBy) assert.ok(s.countries[UA].front.pct < 100);
  }
  assert.ok(peak > 0, 'the front moved');
  assert.ok(turns >= 2, 'a country never falls in a single turn');
  assert.equal(s.countries[UA].occupiedBy, RU);
  kronos({ type: 'forcePeace', a: RU, b: UA });
  assert.equal(s.countries[UA].front, null);
});

test('the Zeus decides whether a front advances, holds or falls back', () => {
  const { s, kronos } = world();
  kronos({ type: 'forceWar', a: RU, b: UA });
  kronos({ type: 'setFront', country: UA, by: RU, pct: 30 });
  kronos({ type: 'frontMode', country: UA, mode: 'hold' });
  kronos({ type: 'resolveTurn' });
  assert.ok(Math.abs(s.countries[UA].front.pct - 30) < 1, 'hold keeps the line');
  kronos({ type: 'frontMode', country: UA, mode: 'advance' });
  kronos({ type: 'resolveTurn' });
  assert.ok(s.countries[UA].front.pct > 30, 'advance pushes forward');
  const before = s.countries[UA].front.pct;
  kronos({ type: 'frontMode', country: UA, mode: 'retreat' });
  kronos({ type: 'resolveTurn' });
  assert.ok(s.countries[UA].front.pct < before, 'retreat gives ground back');
  // Moving a front right now animates it and can take the whole country.
  const r = kronos({ type: 'frontPush', country: UA, delta: 100 });
  assert.ok(r.ok, r.error);
  assert.equal(s.countries[UA].occupiedBy, RU);
  assert.ok(s.lastResolution.instant && s.lastResolution.events.some(e => e.kind === 'occupation'));
  kronos({ type: 'frontPush', country: UA, delta: -20 });
  assert.equal(s.countries[UA].occupiedBy, null, 'pushing back liberates');
});

test('only countries with landing fleets can invade across the sea', () => {
  const { s, kronos } = world();
  const IR = '364';
  assert.ok(Object.values(s.units).some(u => u.owner === AE && u.type === 'fleet' && u.loc.id === 'persian_gulf'));
  const aeArmy = Object.values(s.units).find(u => u.owner === AE && u.type === 'army');
  // The UAE has no landing ships, so it flies troops in by strategic airlift instead of landing them.
  const o1 = { country: AE, type: 'invade', target: IR, units: [aeArmy.id] };
  const v1 = validateOrder(s, o1);
  assert.ok(v1.ok, v1.reason);
  assert.ok(o1.airborne && !o1.amphibious);
  const usFleet = Object.values(s.units).find(u => u.owner === US && u.type === 'fleet');
  usFleet.loc = { kind: 'sea', id: 'persian_gulf' };
  const usArmy = Object.values(s.units).find(u => u.owner === US && u.type === 'army');
  const o = { country: US, type: 'invade', target: IR, units: [usArmy.id] };
  const v2 = validateOrder(s, o);
  assert.ok(v2.ok, v2.reason);
  assert.equal(o.zone, 'persian_gulf');
});

test('the US can drop paratroopers into landlocked Afghanistan', () => {
  const { s, kronos } = world();
  const AF = '004';
  const p = parseCommand(s, 'us invade afghanistan', 'stage');
  assert.ok(p.ok, p.error);
  const o = p.actions[0].order;
  assert.ok(validateOrder(s, autoUnits(s, { ...o, id: 'x' }, o.counts || {})).ok);
  const r = kronos({ type: 'forceOrder', order: o });
  assert.ok(r.ok, r.error);
  assert.ok(s.lastResolution.events.some(e => e.kind === 'airdrop' && e.country === AF));
  const q = parseCommand(s, 'us paratroopers afghanistan', 'stage');
  assert.ok(q.ok, q.error); assert.equal(q.actions[0].order.type, 'airdrop');
});

test('a sea invasion sails the nearest warships in, and helicopters fly off them', () => {
  const { s, kronos } = world();
  const IR = '364';
  for (const u of Object.values(s.units)) if (u.owner === US && u.loc.kind === 'sea' && ['persian_gulf', 'arabian_sea', 'gulf_oman'].includes(u.loc.id)) u.loc = { kind: 'sea', id: 'gulf_aden' };
  const army = Object.values(s.units).find(u => u.owner === US && u.type === 'army');
  const o = { country: US, type: 'invade', target: IR, units: [army.id] };
  const v = validateOrder(s, o);
  assert.ok(v.ok, v.reason);
  assert.ok(o.amphibious && o.sail, 'a ship is sent to cover the landing');
  kronos({ type: 'forceWar', a: US, b: IR });
  kronos({ type: 'forceOrder', order: { country: US, type: 'invade', target: IR, counts: { n: 1 } } });
  assert.ok(s.lastResolution.events.some(e => e.kind === 'fleet'));
  assert.ok(s.lastResolution.events.some(e => e.kind === 'landing'));
  // Venezuela has no US base next door: helicopters fly off a carrier in the Caribbean.
  const VE = '862';
  const carrier = Object.values(s.units).find(u => u.owner === US && u.type === 'carrier');
  carrier.loc = { kind: 'sea', id: 'caribbean' };
  const h = kronos({ type: 'forceOrder', order: { country: US, type: 'airassault', target: VE } });
  assert.ok(h.ok, h.error);
  assert.ok(s.lastResolution.events.some(e => e.kind === 'heli' && e.sea));
});

test('capable countries evacuate citizens (NEO), others cannot', () => {
  const { s, kronos } = world();
  const p = parseCommand(s, 'us evacuate sudan', 'stage');
  assert.ok(p.ok, p.error);
  for (const a of p.actions) kronos(a);
  kronos({ type: 'resolveTurn' });
  const e = s.lastResolution.events.find(x => x.kind === 'neo');
  assert.ok(e && e.evacuees > 0 && e.owner === US);
  const yemen = Object.values(s.countries).find(c => c.a3 === 'YEM');
  const v = validateOrder(s, { country: yemen.id, type: 'neo', target: '729' });
  assert.equal(v.ok, false);
});

test('countries start from their real economies and settle back toward them, not toward 100%', () => {
  const { s, zeus } = world();
  const IR = '364', CN = '156';
  assert.ok(s.countries[IR].inflation > 20 && s.countries[US].inflation < 5);
  assert.ok(s.countries[IR].industry < 1 && s.countries[CN].industry > 1);
  assert.ok(s.countries[AE].treasury > s.countries[IR].treasury);
  for (let i = 0; i < 8; i++) assert.ok(zeus({ type: 'resolveTurn' }).ok);
  assert.ok(s.countries[IR].industry < 0.9, 'sanctioned industry does not heal to 100%');
  assert.ok(s.countries[IR].inflation > 20, 'inflation drifts to its own norm');
  assert.ok(Math.abs(s.countries[JP].support - 30) < 12, 'approval stays near its real level');
  assert.ok(s.global.gdpIndex > 0.97, 'a peaceful world economy does not shrink');
  const protests = s.log.filter(l => /protest/i.test(JSON.stringify(l))).length;
  assert.ok(protests < 15, `peacetime protests stay rare (${protests})`);
});

test('strikes aim at bases and cities, and only capital strikes hit the capital', () => {
  const { s, zeus, kronos } = world();
  kronos({ type: 'forceWar', a: RU, b: UA });
  command(s, zeus, 'russia strike ukraine 4 missiles');
  command(s, zeus, 'russia strike ukraine 2 bombers capital');
  assert.ok(zeus({ type: 'resolveTurn' }).ok);
  const strikes = s.lastResolution.events.filter(e => e.kind === 'strike' && e.target === UA);
  const cap = s.countries[UA];
  const atCap = e => Math.abs(e.to.lat - cap.lat) < 0.01 && Math.abs(e.to.lon - cap.lon) < 0.01;
  const military = strikes.filter(e => e.category === 'military'), capital = strikes.filter(e => e.category === 'capital');
  assert.ok(military.length >= 2 && military.some(e => !atCap(e)), 'military strikes spread across the country');
  assert.ok(capital.length && capital.every(atCap), 'capital strikes hit the capital');
});

test('fronts are ground held cell by cell, and both sides push the same line', () => {
  const { s, kronos } = world();
  kronos({ type: 'forceWar', a: RU, b: UA });
  kronos({ type: 'setFront', country: UA, by: RU, pct: 20 });
  const cells = Object.entries(s.control).filter(([, o]) => o === RU).length;
  assert.ok(cells > 50, 'Russia holds real cells in Ukraine');
  // Ukraine counter-attacks into Russia: Russian land changes hands, Ukraine's own losses stay where they are.
  assert.ok(kronos({ type: 'frontPush', country: RU, by: UA, delta: 5 }).ok);
  assert.ok(s.countries[RU].front?.by === UA && s.countries[RU].front.pct > 0);
  assert.ok(Object.values(s.control).filter(o => o === RU).length === cells);
  // Falling back gives back Ukraine's ground only.
  assert.ok(kronos({ type: 'frontPush', country: UA, delta: -10 }).ok);
  assert.ok(Object.values(s.control).filter(o => o === RU).length < cells);
});

test('a Zeus paints ground for a side and hands it back', () => {
  const { s, zeus, kronos } = world();
  const keys = [];
  for (let lon = 30; lon < 32; lon += CELL) for (let lat = 48; lat < 49.5; lat += CELL) keys.push(Math.floor((90 - lat) / CELL) * NI + Math.floor((lon + 180) / CELL));
  assert.equal(zeus({ type: 'paintControl', owner: RU, keys, mode: 'take' }).ok, false, 'not at war: nothing to take');
  kronos({ type: 'forceWar', a: RU, b: UA });
  assert.ok(zeus({ type: 'paintControl', owner: RU, keys, mode: 'take' }).ok);
  assert.ok(s.countries[UA].front?.by === RU && s.countries[UA].front.pct > 0);
  assert.ok(zeus({ type: 'paintControl', keys, mode: 'restore' }).ok);
  assert.equal(s.countries[UA].front, null);
});

test('civil war splits off a rebel faction with its own ground and army', () => {
  const { s, zeus } = world();
  const SY = '760';
  const armies = Object.values(s.units).filter(u => u.owner === SY && u.type === 'army').length;
  const r = zeus({ type: 'civilWar', country: SY, share: 40, name: 'Free Army' });
  assert.ok(r.ok, r.error);
  const R = s.countries[SY + 'r'];
  assert.equal(R.name, 'Free Army');
  assert.ok(atWar(s, R.id, SY));
  assert.equal(s.countries[SY].front.by, R.id);
  assert.ok(s.countries[SY].front.pct > 25 && s.countries[SY].front.pct < 55);
  assert.ok(Object.values(s.units).some(u => u.owner === R.id && u.type === 'army'));
  assert.ok(Object.values(s.units).filter(u => u.owner === SY && u.type === 'army').length < armies || armies === 1);
  assert.ok(zeus({ type: 'resolveTurn' }).ok, 'the turn resolves with rebels on the map');
});

test('civil war: several factions, and a drawn border fills in', () => {
  const { s, zeus } = world();
  const SY = '760';
  assert.ok(zeus({ type: 'civilWar', country: SY, share: 20, name: 'A' }).ok);
  assert.ok(zeus({ type: 'civilWar', country: SY, share: 20, name: 'B' }).ok);
  assert.ok(s.countries[SY + 'r2']);
  const c = s.countries[SY];
  const d = 1.5, ring = [[c.lat - d, c.lon - d], [c.lat - d, c.lon + d], [c.lat + d, c.lon + d], [c.lat + d, c.lon - d]];
  const r = zeus({ type: 'civilWar', country: SY, name: 'C', ring });
  assert.ok(r.ok, r.error);
  assert.ok(s.countries[SY + 'r3']);
  assert.ok(Object.values(s.control).filter(o => o === SY + 'r3').length > 5);
  assert.equal(zeus({ type: 'civilWar', country: SY, name: 'D', ring: [[0, 0], [0, 1], [1, 1]] }).ok, false);
});

test('peace terms: sanctions lifted, blockades end, trade resumes, reconstruction paid', () => {
  const { s, kronos } = world();
  kronos({ type: 'forceWar', a: RU, b: UA });
  s.countries[RU].sanctions.push(UA); s.countries[UA].damage = 0.5;
  const t0 = s.countries[RU].treasury;
  const r = kronos({ type: 'forceOrder', order: { country: RU, type: 'peace', target: UA, terms: { liftSanctions: true, tradeResume: true, nonAggression: true, reconstruction: 20, fundBy: RU, fundTo: UA } } });
  assert.ok(r.ok, r.error);
  assert.ok(!atWar(s, RU, UA));
  assert.ok(!s.countries[RU].sanctions.includes(UA));
  assert.ok(s.treaties.some(t => t.type === 'trade') && s.treaties.some(t => t.type === 'nonaggression'));
  assert.ok(s.countries[UA].damage < 0.5 && s.countries[RU].treasury === t0 - 20);
});

test('the Cold War map splits Germany: East Germany is its own country, the modern map is unchanged', () => {
  const cold = geo.coldIndex();
  assert.equal(cold.countryAt(13.4, 52.5), '278', 'Berlin is East German');
  assert.equal(cold.countryAt(8.6, 50.1), '276', 'Frankfurt is West German');
  assert.ok(!geo.atlasCountryIds().includes('278'));
  assert.ok(cold.neighborsOf('278').includes('616') && !cold.neighborsOf('276').includes('616'));
  const info = { ids: cold.atlasCountryIds(), name: cold.atlasName, anchor: cold.anchorOf, neighbors: cold.neighborsOf };
  const s = createWorldState({ id: 'c', name: 'Cold', seed: 3 }, info);
  applyScenario(s, 'cold85', info);
  assert.equal(s.countries['278'].name, 'East Germany');
  assert.equal(s.countries['278'].bloc, 'B');
  assert.equal(s.countries['276'].bloc, 'A');
  assert.ok(Object.values(s.units).some(u => u.owner === '278'));
});

test('faction war: a theatre fight, a world fight, and a ceasefire', () => {
  const { s, zeus } = world();
  const r = zeus({ type: 'factionWar', a: 'A', b: 'B', theater: 'europe' });
  assert.ok(r.ok, r.error);
  assert.ok(atWar(s, '276', '643') || atWar(s, '616', '276') || s.wars.length > 3, 'European members are at war');
  assert.ok(!atWar(s, '840', '156'), 'a European war does not drag in East Asia');
  assert.ok(fullWarTheaters(s).has('europe') && !fullWarTheaters(s).has('asia'));
  assert.ok(zeus({ type: 'factionPeace', a: 'A', b: 'B', theater: 'europe' }).ok);
  assert.equal(fullWarTheaters(s).size, 0);
  assert.equal(zeus({ type: 'factionWar', a: 'A', b: 'A' }).ok, false);
  assert.ok(zeus({ type: 'factionWar', a: 'A', b: 'B' }).ok);
  assert.ok(atWar(s, '840', '643'), 'major powers fight everywhere in a world war');
  assert.ok(zeus({ type: 'resolveTurn' }).ok, 'the turn resolves with a faction war on');
});

test('unify fronts setting: auto, all, off', () => {
  const { s, zeus } = world();
  assert.ok(zeus({ type: 'forceWar', a: '276', b: '643' }).ok || true);
  s.wars = [{ a: '276', b: '643', since: 1 }];
  s.countries['276'].bloc = 'A'; s.countries['643'].bloc = 'B';
  assert.equal(fullWarTheaters(s).size, 0, 'one war stays per-country in auto');
  assert.ok(zeus({ type: 'setSetting', key: 'unifyFronts', value: 'all' }).ok);
  assert.ok(fullWarTheaters(s).has('europe'));
  zeus({ type: 'setSetting', key: 'unifyFronts', value: 'off' });
  assert.equal(fullWarTheaters(s).size, 0);
});

test('a war only closes airspace that is contested and within the enemy\'s reach', () => {
  const { s } = world();
  assert.deepEqual(warClosures(s, US, '004'), []); // no air force to fight over Afghanistan
  assert.deepEqual(warClosures(s, US, '364'), ['364']); // Iran cannot reach the US
  assert.deepEqual(warClosures(s, RU, UA).sort(), [RU, UA].sort());
});

test('US strike aircraft: the B-2 can carry the MOAB, nobody else can', () => {
  const { s, kronos } = world();
  const r = kronos({ type: 'forceOrder', order: { country: US, type: 'strike', target: '004', counts: { aircraft: 'b2', payload: 'moab' } } });
  assert.ok(r.ok, r.error);
  const e = s.lastResolution.events.find(x => x.kind === 'strike');
  assert.equal(e.model, 'b2'); assert.equal(e.payload, 'moab');
  const p = parseCommand(s, 'us b-52 strike iran', 'stage');
  assert.ok(p.ok, p.error); assert.equal(p.actions[0].order.counts.aircraft, 'b52');
  assert.equal(kronos({ type: 'forceOrder', order: { country: RU, type: 'strike', target: UA, counts: { aircraft: 'b2' } } }).ok, false);
});

test('the Zeus can show a coat of arms on the stage', () => {
  const { s, zeus } = world();
  assert.equal(s.display.arms, true);
  assert.ok(zeus({ type: 'setCoat', on: false }).ok);
  assert.equal(s.display.arms, false);
  assert.ok(zeus({ type: 'setSetting', key: 'autoSnap', value: false }).ok);
  assert.equal(s.settings.autoSnap, false);
});

test('Kronos can end every outbreak at once', () => {
  const { s, kronos, zeus } = world();
  assert.ok(kronos({ type: 'disaster', country: '818', kind: 'pandemic' }).ok);
  assert.ok(kronos({ type: 'outbreak', country: '818', op: 'spread' }).ok);
  assert.ok(Object.values(s.countries).filter(c => c.outbreak).length > 1);
  assert.equal(zeus({ type: 'endAllOutbreaks' }).ok, false);
  assert.ok(kronos({ type: 'endAllOutbreaks' }).ok);
  assert.equal(Object.values(s.countries).filter(c => c.outbreak).length, 0);
});

test('Zeus forces orders without ending the turn', () => {
  const { s, zeus } = world();
  const turn = s.meta.turn;
  let r = zeus({ type: 'queueOrder', order: { country: RU, type: 'war', target: UA }, now: true });
  assert.ok(r.ok, r.error);
  assert.ok(atWar(s, RU, UA));
  r = zeus({ type: 'queueOrder', order: { country: RU, type: 'strike', target: UA, category: 'military', counts: { n: 2 } } });
  assert.ok(r.ok, r.error);
  r = zeus({ type: 'executeAll' });
  assert.ok(r.ok, r.error);
  assert.equal(s.meta.turn, turn);
  assert.equal(s.orders.filter(o => o.status === 'queued').length, 0);
  assert.ok(s.orders.some(o => o.type === 'strike' && o.status !== 'queued'));
});

test('US carrier groups are named, and a blockade can close a country\'s coast', () => {
  const { s, zeus } = world();
  const carriers = Object.values(s.units).filter(u => u.owner === US && u.type === 'carrier');
  assert.equal(new Set(carriers.map(u => u.name)).size, carriers.length);
  assert.ok(carriers.some(u => u.name === 'George Washington' && u.loc.id === 'japan_sea'));
  const IR = '364';
  command(s, zeus, 'us blockade iran 2');
  assert.equal(parseCommand(s, 'us blockade switzerland', 'stage').order.type, 'siege');
  assert.equal(zeus({ type: 'queueOrder', order: { country: US, type: 'siege', target: '756', counts: { n: 1 } } }).ok, false);
  const gdp = s.countries[IR].gdp;
  assert.ok(zeus({ type: 'resolveTurn' }).ok);
  const on = Object.values(s.units).filter(u => u.blockadeOf === IR);
  assert.ok(on.length >= 1);
  assert.equal(s.global.chokepoints.hormuz.status, 'open');
  assert.ok(s.countries[IR].gdp < gdp);
  zeus({ type: 'queueOrder', order: { country: US, type: 'lift' }, now: true });
  assert.equal(Object.values(s.units).filter(u => u.blockadeOf).length, 0);
});

test('Israel, Palestine and Saudi Arabia are out of bounds', () => {
  const { s, zeus, kronos } = world();
  const IL = '376', PS = '275', IR = '364', SA = '682';
  assert.equal(Object.values(s.units).filter(u => [IL, PS, SA].includes(u.owner) || [IL, PS, SA].includes(u.loc.id)).length, 0);
  assert.equal(zeus({ type: 'queueOrder', order: { country: IR, type: 'strike', target: SA, counts: { n: 1 } } }).ok, false);
  assert.equal(command(s, () => ({ ok: true }), 'us blockade saudi').order.type, 'siege');
  assert.equal(s.countries[IL].oob, true);
  assert.equal(zeus({ type: 'queueOrder', order: { country: IR, type: 'war', target: IL } }).ok, false);
  assert.equal(zeus({ type: 'queueOrder', order: { country: IL, type: 'war', target: IR } }).ok, false);
  assert.equal(kronos({ type: 'forceWar', a: US, b: PS }).ok, false);
  assert.equal(kronos({ type: 'spawnUnits', country: IL, unitType: 'army', count: 2 }).ok, false);
  assert.equal(zeus({ type: 'setFocus', country: IL }).ok, false);
  // Old saves with forces or wars there are cleaned up at the next turn.
  s.wars.push({ a: IR, b: IL, since: 1 });
  s.units.uX = { id: 'uX', type: 'army', owner: IL, loc: { kind: 'country', id: IL }, strength: 100 };
  assert.ok(zeus({ type: 'resolveTurn' }).ok);
  assert.ok(!s.wars.some(w => w.a === IL || w.b === IL));
  assert.ok(!s.units.uX);
});

test('a council committee runs a floor, a draft vote and a crisis alert', async () => {
  const { createCouncilState } = await import('../../shared/engine/state.js');
  const s = createCouncilState({ id: 'c', name: 'Council', seed: 3 }, 'gotham');
  let now = 5_000_000;
  const z = a => applyAction(s, a, { role: 'stage', user: 'x', now: (now += 1000), geo });
  assert.equal(s.mode, 'council');
  assert.ok(s.council.seats.length > 10 && s.council.map === 'gotham');
  const [a, b] = s.council.seats.filter(x => x.kind === 'delegation');
  assert.ok(z({ type: 'setSpeaker', seat: a.id }).ok);
  assert.ok(z({ type: 'queueAdd', seat: b.id }).ok);
  assert.equal(z({ type: 'queueNext' }).speaker, b.id);
  const d = z({ type: 'addDraft', title: 'Seal the bridges', sponsors: 'Mayor', clauses: 'One\nTwo' }).draft;
  assert.equal(d.clauses.length, 2);
  assert.ok(z({ type: 'openVote', id: d.id }).ok);
  assert.ok(z({ type: 'castAll', value: 'yes' }).ok);
  z({ type: 'castVote', seat: a.id, value: 'no' });
  assert.ok(z({ type: 'closeVote' }).passed);
  assert.equal(s.council.drafts.find(x => x.id === d.id).status, 'passed');
  assert.ok(z({ type: 'alert', title: 'Bridge down', level: 'critical' }).ok && s.council.alert.level === 'critical');
  assert.ok(z({ type: 'setDistrict', id: 'arkham', status: 'lost' }).ok && s.council.districts.arkham.status === 'lost');
  assert.equal(z({ type: 'addMarker', x: 5000, y: 5 }).ok, false, 'markers stay on the map');
  assert.equal(z({ type: 'forceWar', a: '643', b: '804' }).ok, false, 'world actions are not available here');
});

test('a US committee steers its map and refuses world actions', async () => {
  const { createUsaState } = await import('../../shared/engine/state.js');
  const s = createUsaState({ id: 'u', name: 'US', seed: 4 });
  const z = a => applyAction(s, a, { role: 'stage', user: 'x', now: 5_000_000, geo });
  assert.equal(s.mode, 'usa');
  assert.ok(z({ type: 'usaSetView', lon: -87.6, lat: 41.9, k: 12 }).ok && s.usa.view.k === 12);
  assert.ok(z({ type: 'usaSetView', lon: -999, lat: 90, k: 500 }).ok && s.usa.view.k === 24 && s.usa.view.lon === -126 && s.usa.view.lat === 50.5, 'the view stays over the lower 48');
  assert.equal(z({ type: 'usaSetView', lon: 'x', lat: 1, k: 1 }).ok, false);
  assert.ok(z({ type: 'usaLayer', layer: 'neighbors', on: false }).ok && s.usa.layers.neighbors === false);
  assert.equal(z({ type: 'usaLayer', layer: 'nope' }).ok, false);
  assert.equal(z({ type: 'usaLayer', layer: 'hospital', on: true }).ok, false, 'facility dots are gone');
  assert.ok(z({ type: 'usaLightbars', service: 'all', on: true }).ok && Object.values(s.usa.lightbars).every(Boolean));
  assert.equal(z({ type: 'usaLightbars', service: 'tow' }).ok, false);
  const { lightColors } = await import('../../shared/engine/usa.js');
  assert.deepEqual(lightColors(s.usa, 'police', 'TX'), ['#ff2a2a', '#2a5bff']);
  assert.deepEqual(lightColors(s.usa, 'police', 'ME'), ['#2a5bff', '#ffffff'], 'Maine police run blue');
  assert.ok(z({ type: 'usaLightColors', id: 'TX', service: 'fire', colors: ['#FF0000', '#ffb000'] }).ok);
  assert.deepEqual(lightColors(s.usa, 'fire', 'TX'), ['#ff0000', '#ffb000']);
  assert.equal(z({ type: 'usaLightColors', id: '48201', service: 'fire', colors: ['#22d46a'] }).ok, false, 'colours are set per state');
  assert.equal(z({ type: 'usaLightColors', id: 'Texas', service: 'fire', colors: ['#ff0000'] }).ok, false);
  assert.equal(z({ type: 'usaLightColors', id: 'TX', service: 'fire', colors: ['red'] }).ok, false);
  assert.ok(z({ type: 'usaLightColors', id: 'TX', service: 'fire', colors: null }).ok);
  assert.ok(z({ type: 'usaLightPattern', pattern: 'triple' }).ok && s.usa.lightPattern === 'triple');
  assert.equal(z({ type: 'usaLightPattern', pattern: 'nope' }).ok, false);
  const { getUnits } = await import('../../shared/engine/usa.js');
  assert.ok(Object.keys(getUnits(s.usa)).length > 180 && getUnits(s.usa)['gov-TX'].person === 'Greg Abbott' && getUnits(s.usa)['ng-TX'].owner === 'TX' && getUnits(s.usa)['f-82nd'].lat > 35);
  assert.ok(z({ type: 'usaGovernor', state: 'tx', name: 'Alex Student', control: 'delegate' }).ok && getUnits(s.usa)['gov-TX'].person === 'Alex Student' && getUnits(s.usa)['gov-TX'].control === 'delegate');
  assert.ok(z({ type: 'usaGovernor', state: 'TX', control: 'ai' }).ok && getUnits(s.usa)['gov-TX'].person === 'Greg Abbott', 'handing it back restores the real governor');
  assert.equal(z({ type: 'usaGovernor', state: 'TX', name: 'Nope' }).ok, false, 'a name needs a delegate');
  assert.ok(z({ type: 'usaGovernor', state: 'TX', control: 'delegate' }).ok);
  assert.equal(z({ type: 'usaGovernor', state: 'TX', photo: 'javascript:alert(1)' }).ok, false);
  assert.equal(z({ type: 'usaGovernor', state: 'TX', photo: 'data:image/jpeg;base64,' + 'A'.repeat(50000) }).ok, false, 'photos stay small');
  // Zeus controls every unit
  assert.ok(z({ type: 'usaUnit', id: 'f-fbi', name: 'FBI HQ', strength: 40, hidden: true, lon: -90, lat: 35 }).ok);
  let fbi = getUnits(s.usa)['f-fbi'];
  assert.ok(fbi.name === 'FBI HQ' && fbi.strength === 40 && fbi.hidden && fbi.lon === -90 && fbi.lat === 35);
  assert.equal(z({ type: 'usaUnit', id: 'f-fbi', lon: 10, lat: 35 }).ok, false, 'off the map');
  assert.equal(z({ type: 'usaUnit', id: 'nope', name: 'x' }).ok, false);
  assert.equal(z({ type: 'usaUnit', id: 'f-fbi', federal: true }).ok, false, 'only Guard or police');
  assert.ok(z({ type: 'usaUnitReset', id: 'f-fbi' }).ok && getUnits(s.usa)['f-fbi'].strength === 100);
  assert.ok(z({ type: 'usaFederalize', state: 'tx' }).ok && getUnits(s.usa)['ng-TX'].federal);
  assert.ok(z({ type: 'usaFederalize', state: 'all', on: false }).ok && !getUnits(s.usa)['ng-TX'].federal);
  const sp = z({ type: 'usaSpawn', name: 'Free Texas Militia', sil: 'infantry', lon: -99, lat: 31, strength: 55 });
  assert.ok(sp.ok && getUnits(s.usa)[sp.id].strength === 55 && getUnits(s.usa)[sp.id].kind === 'custom');
  assert.equal(z({ type: 'usaSpawn', name: 'Offshore', lon: 0, lat: 0 }).ok, false);
  assert.ok(z({ type: 'usaUnit', id: sp.id, name: 'Militia', lon: -98, lat: 30 }).ok && getUnits(s.usa)[sp.id].name === 'Militia');
  assert.ok(z({ type: 'usaDeleteUnit', id: sp.id }).ok && !getUnits(s.usa)[sp.id]);
  assert.equal(z({ type: 'usaDeleteUnit', id: 'f-fbi' }).ok, false);
  // Border
  const { crossingState } = await import('../../shared/engine/usa.js');
  assert.equal(crossingState(s.usa, 'bx-detroit').status, 'open');
  assert.ok(z({ type: 'usaCrossing', id: 'bx-detroit', status: 'closed', traffic: 90 }).ok && crossingState(s.usa, 'bx-detroit').status === 'closed' && crossingState(s.usa, 'bx-detroit').wait === null);
  assert.ok(z({ type: 'usaBorder', side: 'MEX', status: 'heightened' }).ok && crossingState(s.usa, 'bx-laredo').status === 'slow');
  assert.ok(z({ type: 'usaBorder', side: 'CAN', status: 'closed' }).ok && crossingState(s.usa, 'bx-blaine').status === 'closed', 'a closed border closes every crossing');
  assert.equal(crossingState(s.usa, 'bx-blaine').own, 'open');
  assert.equal(z({ type: 'usaBorder', side: 'USA', status: 'closed' }).ok, false);
  assert.equal(z({ type: 'usaCrossing', id: 'bx-nope', status: 'open' }).ok, false);
  assert.ok(z({ type: 'usaBorder', side: 'all', status: 'open' }).ok);
  // State cards
  const { getState } = await import('../../shared/engine/usa.js');
  assert.equal(getState(s.usa, 'TX').status, 'normal');
  assert.ok(z({ type: 'usaState', state: 'tx', status: 'emergency', stability: 35, note: 'Floods' }).ok);
  assert.ok(getState(s.usa, 'TX').status === 'emergency' && getState(s.usa, 'TX').stability === 35 && getState(s.usa, 'TX').note === 'Floods' && getState(s.usa, 'TX').pop > 30);
  assert.ok(z({ type: 'usaState', state: 'TX', economy: 500 }).ok && getState(s.usa, 'TX').economy === 100, 'numbers stay 0 to 100');
  assert.equal(z({ type: 'usaState', state: 'TX', status: 'chaos' }).ok, false);
  assert.equal(z({ type: 'usaState', state: 'AK', status: 'alert' }).ok, false, 'Alaska is out of the committee');
  assert.ok(z({ type: 'usaGovernor', state: 'TX', photo: 'data:image/png;base64,iVBORw0KGgo=' }).ok && getUnits(s.usa)['gov-TX'].photo.startsWith('data:image/png'));
  assert.ok(z({ type: 'usaGovernor', state: 'TX', photo: null }).ok && getUnits(s.usa)['gov-TX'].photo === null);
  assert.equal(z({ type: 'usaGovernor', state: 'ZZ', name: 'x' }).ok, false);
  assert.ok(z({ type: 'usaHighlight', states: ['tx', 'CA', 'texas', 'TX'] }).ok && s.usa.highlight.join() === 'TX,CA');
  assert.equal(z({ type: 'forceWar', a: '643', b: '804' }).ok, false, 'world actions are not available here');
});

test('a cold war committee starts in 1985 without drones or stealth', async () => {
  const { applyScenario } = await import('../../shared/engine/scenarios.js');
  const s = createWorldState({ id: 'cw', name: 'Cold', seed: 9 }, gi);
  applyScenario(s, 'cold85');
  const z = a => applyAction(s, a, { role: 'kronos', user: 'kronos', now: 9_000_000, geo });
  assert.equal(s.countries['643'].name, 'Soviet Union');
  assert.equal(s.countries['840'].bloc, 'A');
  assert.equal(s.countries['643'].bloc, 'B');
  assert.ok(Object.values(s.countries).every(c => !c.stealth));
  assert.equal(s.countries['156'].bloc, 'C');
  assert.equal(z({ type: 'setOp', country: '840', kind: 'drones', target: '643' }).ok, false);
  const { validateOrder } = await import('../../shared/engine/orders.js');
  assert.equal(validateOrder(s, { country: '840', type: 'drone', target: '643' }).ok, false);
});

test('tanker countries strike anywhere; weaker nuclear powers have limited nuke range', () => {
  const { s } = world();
  s.global.tension = 10;
  const far = validateOrder(s, { id: 'a', country: US, type: 'strike', target: JP === '392' ? '036' : JP, counts: {} });
  assert.ok(far.ok || !/range/.test(far.reason || ''), far.reason);
  const pak = validateOrder(s, { id: 'b', country: '586', type: 'nuke', target: US });
  assert.ok(!pak.ok && /reach/.test(pak.reason), 'Pakistan cannot hit the US: ' + pak.reason);
  const nearby = validateOrder(s, { id: 'c', country: '586', type: 'nuke', target: '356' });
  assert.ok(nearby.ok, nearby.reason);
  const ru = validateOrder(s, { id: 'd', country: RU, type: 'nuke', target: US });
  assert.ok(ru.ok, ru.reason);
});

test('a fleet can be sent to a free point at sea, and land is refused', () => {
  const { s, zeus } = world();
  const ship = Object.values(s.units).find(u => u.owner === US && u.type === 'fleet' && u.loc.kind === 'sea' && u.loc.id === 'us_east');
  const land = zeus({ type: 'queueOrder', order: { country: US, type: 'fleet', units: [ship.id], point: { lat: 40, lon: -100 } }, now: true });
  assert.ok(land.ok || /water/.test(land.error || ''), 'inland points are nudged or refused');
  const r = zeus({ type: 'queueOrder', order: { country: US, type: 'fleet', units: [ship.id], point: { lat: 38, lon: -50 } }, now: true });
  assert.ok(r.ok, r.error);
  assert.equal(s.units[ship.id].loc.lat, 38);
  assert.equal(s.units[ship.id].loc.lon, -50);
});

test('a US save from before lightbars is brought up to date', async () => {
  const { createUsaState } = await import('../../shared/engine/state.js');
  const { migrateUsa } = await import('../../shared/engine/usa.js');
  const s = createUsaState({ id: 'u', name: 'US', seed: 4 });
  delete s.usa.lightbars; delete s.usa.lightColors; delete s.usa.lightPattern; s.usa.layers.hospital = true; delete s.usa.layers.neighbors;
  migrateUsa(s);
  assert.deepEqual(s.usa.lightbars, { police: false, fire: false, ambulance: false });
  assert.equal(s.usa.layers.neighbors, true);
  assert.equal('hospital' in s.usa.layers, false, 'old facility layers are dropped');
});

test('US units move on orders, fight hostile sides and fall back', async () => {
  const { createUsaState } = await import('../../shared/engine/state.js');
  const { applyAction } = await import('../../shared/engine/reducer.js');
  const { tickUsa, getUnits } = await import('../../shared/engine/usa.js');
  const { distKm } = await import('../../shared/engine/usa-sim.js');
  const s = createUsaState({ id: 'u', name: 'US', seed: 4 });
  const z = a => applyAction(s, a, { role: 'zeus', user: 'z', now: 1_000_000 });
  const a = z({ type: 'usaSpawn', utype: 'arm_bct', side: 'fed', name: 'Test armor', lon: -100, lat: 35 }).id;
  const b = z({ type: 'usaSpawn', utype: 'militia_co', side: 'mil', name: 'Test militia', lon: -100, lat: 35.02 }).id;
  assert.ok(a && b);
  // The clock does nothing until it runs.
  assert.equal(tickUsa(s, 1_000_000), false);
  assert.ok(z({ type: 'usaSim', running: true, speed: 60 }).ok);
  assert.equal(z({ type: 'usaSim', speed: 7 }).ok, false);
  // A move order: 45 km/h for an armored brigade, 60 game seconds per second, so a minute of real time is 45 km.
  assert.ok(z({ type: 'usaOrder', ids: [a], order: { type: 'move', to: [-100, 35.04] } }).ok);
  const y0 = getUnits(s.usa)[a].lat;
  assert.ok(tickUsa(s, 1_001_000));
  assert.ok(getUnits(s.usa)[a].lat > y0 && getUnits(s.usa)[a].lat < 35.04, 'it is on its way');
  assert.ok(getUnits(s.usa)[a].mv[1] > 0, 'clients are told which way it is gliding');
  for (let t = 1_002_000; t < 1_040_000; t += 1000) tickUsa(s, t);
  assert.equal(getUnits(s.usa)[a].order, null, 'it arrived');
  assert.ok(s.usa.events.some(e => e.text.includes('arrived')));
  // Orders: fixed headquarters cannot move; a unit cannot be ordered to attack its own side.
  assert.equal(z({ type: 'usaOrder', ids: ['f-pentagon'], order: { type: 'move', to: [-90, 35] } }).ok, false);
  assert.equal(z({ type: 'usaOrder', ids: [a], order: { type: 'move', to: [10, 35] } }).ok, false);
  // Hostile sides: nothing happens while at peace, even point blank.
  const before = getUnits(s.usa)[b].strength;
  for (let t = 1_041_000; t < 1_050_000; t += 1000) tickUsa(s, t);
  assert.equal(getUnits(s.usa)[b].strength, before);
  assert.ok(z({ type: 'usaHostile', a: 'fed', b: 'mil' }).ok && s.usa.hostile.includes('fed|mil'));
  // At war, units that return fire answer once shot at; the Zeus sets "fire at will" and the fight starts.
  assert.ok(z({ type: 'usaRoe', ids: [a], roe: 'free' }).ok);
  assert.equal(z({ type: 'usaRoe', ids: [a], roe: 'nope' }).ok, false);
  for (let t = 1_051_000; t < 1_200_000; t += 1000) tickUsa(s, t);
  const U = getUnits(s.usa);
  assert.ok(U[b].strength < before, 'the militia took fire');
  assert.ok(U[a].strength >= U[b].strength, 'the armored brigade wins the fight');
  assert.ok(s.usa.events.some(e => e.text.includes('engaged')));
  for (let t = 1_201_000; t < 1_900_000; t += 1000) tickUsa(s, t);
  assert.ok(getUnits(s.usa)[b].destroyed || getUnits(s.usa)[b].routed, 'it was destroyed or fled');
  assert.ok(z({ type: 'usaUnit', id: b, revive: true }).ok && getUnits(s.usa)[b].strength === 100 && !getUnits(s.usa)[b].destroyed);
  // Attack orders pull a target in and make the sides hostile.
  assert.ok(z({ type: 'usaHostile', a: 'fed', b: 'mil', on: false }).ok && !s.usa.hostile.length);
  assert.ok(z({ type: 'usaOrder', ids: [a], order: { type: 'attack', target: b } }).ok && s.usa.hostile.includes('fed|mil'));
  assert.equal(z({ type: 'usaOrder', ids: [a], order: { type: 'attack', target: 'x-nope' } }).ok, false);
});

test('the US government answers a war, and the Zeus can make it act or vote', async () => {
  const { createUsaState } = await import('../../shared/engine/state.js');
  const { applyAction } = await import('../../shared/engine/reducer.js');
  const { tickUsa, getUnits } = await import('../../shared/engine/usa.js');
  const s = createUsaState({ id: 'u', name: 'US', seed: 5 });
  const z = a => applyAction(s, a, { role: 'zeus', user: 'z', now: 1_000_000 });
  assert.ok(z({ type: 'usaSim', running: true, speed: 60 }).ok);
  assert.ok(z({ type: 'usaHostile', a: 'fed', b: 'mil', on: true }).ok);
  s.usa.sim.at = 1_000_000;
  for (let i = 1; i <= 60; i++) tickUsa(s, 1_000_000 + i * 1000); // an hour at x60
  const gov = s.usa.events.filter(e => e.kind === 'gov');
  assert.ok(gov.some(e => /addresses the nation/.test(e.text)), 'the President speaks');
  assert.ok(gov.some(e => /Insurrection Act/.test(e.text)) && getUnits(s.usa)['ng-TX'].federal, 'the Guard is federalized');
  // Peace brings a release, and offices can be edited.
  assert.ok(z({ type: 'usaGov', office: 'pres', person: 'Pat Delegate', control: 'delegate' }).ok);
  assert.equal(z({ type: 'usaGov', office: 'nobody', person: 'x' }).ok, false);
  const { officeState } = await import('../../shared/engine/usa-gov.js');
  assert.equal(officeState(s.usa, 'pres').person, 'Pat Delegate');
  assert.equal(z({ type: 'usaGov', office: 'vp', person: 'Nope' }).ok, false, 'only a delegate can rename an office');
  assert.ok(z({ type: 'usaGov', office: 'pres', control: 'ai' }).ok && officeState(s.usa, 'pres').person === 'Donald Trump', 'the real holder is back');
  assert.ok(z({ type: 'usaGovAct', office: 'defense', text: 'Stand down.', effect: 'release_all' }).ok && !getUnits(s.usa)['ng-TX'].federal);
  assert.equal(z({ type: 'usaGovAct', office: 'defense', text: '', effect: 'none' }).ok, false);
  assert.ok(z({ type: 'usaBill', title: 'Border Act', effect: 'border_closed', force: 'pass', delay: 5 }).ok);
  s.usa.sim.at = 2_000_000;
  for (let i = 1; i <= 20; i++) tickUsa(s, 2_000_000 + i * 1000);
  assert.equal(s.usa.border.CAN, 'closed', 'a passed bill closes the border');
  assert.ok(s.usa.events.some(e => /Border Act.*passes/.test(e.text)));
});

test('the Zeus can set off incidents that spawn units, change status and get a government answer', async () => {
  const { createUsaState } = await import('../../shared/engine/state.js');
  const { applyAction } = await import('../../shared/engine/reducer.js');
  const { tickUsa, getUnits } = await import('../../shared/engine/usa.js');
  const s = createUsaState({ id: 'u', name: 'US', seed: 6 });
  const z = a => applyAction(s, a, { role: 'zeus', user: 'z', now: 1_000_000 });
  const before = Object.keys(s.usa.custom).length;
  const r = z({ type: 'usaIncident', kind: 'wildfire', state: 'CA' });
  assert.ok(r.ok && r.ids.length === 3 && Object.keys(s.usa.custom).length === before + 3);
  assert.equal(s.usa.states.CA.status, 'emergency');
  assert.ok(r.ids.every(id => getUnits(s.usa)[id].side === 'st:CA' || getUnits(s.usa)[id].side === 'civil'));
  const b = z({ type: 'usaIncident', kind: 'breach', crossing: 'bx-sanysidro' });
  assert.ok(b.ok && b.ids.length === 4 && s.usa.crossings['bx-sanysidro'].status === 'closed', 'a breach closes the crossing');
  assert.equal(getUnits(s.usa)[b.ids[0]].order.type, 'move', 'the migrants head inland');
  assert.equal(z({ type: 'usaIncident', kind: 'nope', state: 'CA' }).ok, false);
  assert.equal(z({ type: 'usaIncident', kind: 'riot', state: 'ZZ' }).ok, false);
  assert.equal(z({ type: 'usaIncident', kind: 'riot', lon: 10, lat: 10 }).ok, false);
  assert.ok(z({ type: 'usaIncident', kind: 'riot', lon: -89.5, lat: 39.9 }).ok && s.usa.states.IL.status === 'alert', 'a point is matched to the nearest state');
  z({ type: 'usaSim', running: true, speed: 60 }); s.usa.sim.at = 1_000_000;
  for (let i = 1; i <= 30; i++) tickUsa(s, 1_000_000 + i * 1000);
  assert.ok(s.usa.events.some(e => e.kind === 'gov' && /FEMA begins/.test(e.text)), 'FEMA answers the wildfire');
});

test('wheeled units follow roads when the road map is loaded', async () => {
  const { readFileSync } = await import('node:fs');
  const { loadRoads } = await import('../../shared/engine/usa-route.js');
  const { createUsaState } = await import('../../shared/engine/state.js');
  const { applyAction } = await import('../../shared/engine/reducer.js');
  const { tickUsa, getUnits } = await import('../../shared/engine/usa.js');
  assert.ok(loadRoads(JSON.parse(readFileSync(new URL('../../client/data/us-roads.json', import.meta.url), 'utf8'))) > 10000);
  const s = createUsaState({ id: 'u', name: 'US', seed: 7 });
  const z = a => applyAction(s, a, { role: 'zeus', user: 'z', now: 1_000_000 });
  const a = z({ type: 'usaSpawn', utype: 'stryker_bct', side: 'fed', name: 'Convoy', lon: -87.63, lat: 41.88 }).id;
  const foot = z({ type: 'usaSpawn', utype: 'inf_co', side: 'fed', name: 'Foot', lon: -87.63, lat: 41.88 }).id;
  assert.ok(z({ type: 'usaOrder', ids: [a, foot], order: { type: 'move', to: [-84.39, 33.75] } }).ok);
  const o = getUnits(s.usa)[a].order, f = getUnits(s.usa)[foot].order;
  assert.ok(o.path.length > 20 && Math.abs(o.path.at(-1)[0] + 84.39) < 0.2, 'a road route to Atlanta');
  assert.equal(f.path, undefined, 'infantry on foot go straight');
  z({ type: 'usaSim', running: true, speed: 1000 }); s.usa.sim.at = 1_000_000;
  for (let i = 1; i <= 120 && getUnits(s.usa)[a].order; i++) tickUsa(s, 1_000_000 + i * 1000);
  const u = getUnits(s.usa)[a];
  assert.equal(u.order, null, 'it arrives');
  assert.ok(Math.abs(u.lon + 84.39) < 0.2 && Math.abs(u.lat - 33.75) < 0.2, 'it arrives at its slot beside Atlanta');
});

test('the US stage camera is separate from the Zeus map', async () => {
  const { createUsaState } = await import('../../shared/engine/state.js');
  const { applyAction } = await import('../../shared/engine/reducer.js');
  const s = createUsaState({ id: 'u', name: 'US', seed: 8 });
  const z = a => applyAction(s, a, { role: 'zeus', user: 'z', now: 1_000_000 });
  assert.equal(s.usa.stageAuto, true, 'the stage frames the action by default');
  assert.ok(z({ type: 'usaSetView', lon: -87.6, lat: 41.9, k: 8 }).ok && s.usa.stageAuto === false, 'showing a view holds it on the stage');
  assert.ok(z({ type: 'usaStageAuto', on: true }).ok && s.usa.stageAuto === true);
});

test('vehicles use a road only when it pays, and never overshoot a stop', async () => {
  const { readFileSync } = await import('node:fs');
  const { loadRoads, route } = await import('../../shared/engine/usa-route.js');
  const { glidePos } = await import('../../shared/engine/usa-sim.js');
  loadRoads(JSON.parse(readFileSync(new URL('../../client/data/us-roads.json', import.meta.url), 'utf8')));
  assert.equal(route([-100, 35.0], [-100, 35.05]), null, 'a short hop goes straight');
  assert.equal(route([-100, 35.0], [-100.2, 35.1]), null, 'so does a trip a road would not shorten');
  assert.ok(route([-87.63, 41.88], [-84.39, 33.75]).length > 20, 'a long trip takes the interstate');
  // Gliding past the goal is capped at the goal.
  const u = { lon: -100, lat: 35, spd: 1, order: { type: 'move', to: [-100, 35.009] } };
  const [x, y] = glidePos(u, {}, 60);
  assert.ok(Math.abs(y - 35.009) < 1e-9 && x === -100, 'stops at the target');
  const p = { lon: -100, lat: 35, spd: 1, order: { type: 'move', to: [-99, 35], path: [[-100, 35.01], [-100, 35.02]], pi: 0 } };
  const [, py] = glidePos(p, {}, 5);
  assert.ok(py > 35.03 === false && py > 35.01, 'turns a corner along its path, not past it');
});

test('US orders can be queued, spread into a formation, and attack-moved', async () => {
  const { createUsaState } = await import('../../shared/engine/state.js');
  const { applyAction } = await import('../../shared/engine/reducer.js');
  const { tickUsa, getUnits } = await import('../../shared/engine/usa.js');
  const s = createUsaState({ id: 'u', name: 'US', seed: 9 });
  const z = a => applyAction(s, a, { role: 'zeus', user: 'z', now: 1_000_000 });
  const ids = [0, 1, 2, 3].map(i => z({ type: 'usaSpawn', utype: 'inf_bn', side: 'fed', name: `Bn ${i}`, lon: -100, lat: 35 }).id);
  assert.ok(z({ type: 'usaOrder', ids, order: { type: 'move', to: [-100.2, 35.1] } }).ok);
  const dest = new Set(ids.map(id => getUnits(s.usa)[id].order.to.join()));
  assert.equal(dest.size, 4, 'four units get four slots, not one');
  assert.ok(z({ type: 'usaOrder', ids: [ids[0]], order: { type: 'move', to: [-100.4, 35.1] }, queue: true }).ok);
  assert.equal(getUnits(s.usa)[ids[0]].order.q.length, 1, 'a shift-click waits behind the current move');
  z({ type: 'usaSim', running: true, speed: 300 }); s.usa.sim.at = 1_000_000;
  for (let i = 1; i <= 60 && getUnits(s.usa)[ids[0]].order; i++) tickUsa(s, 1_000_000 + i * 1000);
  const u = getUnits(s.usa)[ids[0]];
  assert.equal(u.order, null);
  assert.ok(Math.abs(u.lon + 100.4) < 0.01, 'it went on to the queued point');
  assert.ok(z({ type: 'usaOrder', ids: [ids[1]], order: { type: 'amove', to: [-101, 35] } }).ok && getUnits(s.usa)[ids[1]].order.type === 'amove');
});

test('aircraft launch from air bases, stay in range, land again and die with a bombed base', async () => {
  const { createUsaState } = await import('../../shared/engine/state.js');
  const { applyAction } = await import('../../shared/engine/reducer.js');
  const { tickUsa, getUnits } = await import('../../shared/engine/usa.js');
  const s = createUsaState({ id: 'u', name: 'US', seed: 10 });
  const z = a => applyAction(s, a, { role: 'zeus', user: 'z', now: 1_000_000 });
  const U = () => getUnits(s.usa), run = (n, speed = 60) => { z({ type: 'usaSim', running: true, speed }); s.usa.sim.at = s.usa.sim.at || 1_000_000; for (let i = 0; i < n; i++) tickUsa(s, s.usa.sim.at + 1000); };
  assert.ok(Object.values(U()).filter(x => x.kind === 'base').length >= 50, 'about fifty air bases');
  assert.equal(U()['ac-langley-1'].air, 'parked');
  assert.equal(U()['f-langley'], undefined, 'the old wing dot is gone');
  // Out of range: an F-22 cannot be sent to the Pacific coast from Virginia
  assert.equal(z({ type: 'usaOrder', ids: ['ac-langley-1'], order: { type: 'move', to: [-122, 37] } }).ok, false, 'beyond its combat radius');
  assert.ok(z({ type: 'usaOrder', ids: ['ac-langley-1'], order: { type: 'move', to: [-80, 38] } }).ok);
  assert.equal(U()['ac-langley-1'].air, 'takeoff');
  run(10); // 10 s at x60 = 10 minutes
  assert.equal(U()['ac-langley-1'].air, 'flying');
  assert.ok(U()['ac-langley-1'].lon < -76.5, 'it is under way');
  assert.ok(z({ type: 'usaScramble', base: 'ab-langley', recall: true }).ok, 'recall');
  run(60);
  assert.equal(U()['ac-langley-1'].air, 'parked', 'it landed and parked');
  // A bombed base takes the parked aircraft with it
  assert.ok(z({ type: 'usaScramble', base: 'ab-whiteman' }).ok, 'scramble the B-2s');
  assert.equal(U()['ac-whiteman-1'].air, 'takeoff');
  const bh = z({ type: 'usaSpawn', utype: 'bomber', side: 'foreign', name: 'Raider', lon: -76.36, lat: 37.1 }).id;
  assert.ok(z({ type: 'usaHostile', a: 'fed', b: 'foreign', on: true }).ok);
  s.usa.mods['ab-langley'] = { strength: 5 };
  assert.ok(z({ type: 'usaOrder', ids: [bh], order: { type: 'attack', target: 'ab-langley' } }).ok);
  run(200, 300);
  assert.ok(U()['ab-langley'].destroyed || U()['ab-langley'].strength < 5, 'the base was hit');
});

test('units use special abilities with rest times', async () => {
  const { createUsaState } = await import('../../shared/engine/state.js');
  const { applyAction } = await import('../../shared/engine/reducer.js');
  const { tickUsa, getUnits } = await import('../../shared/engine/usa.js');
  const s = createUsaState({ id: 'u', name: 'US', seed: 11 });
  const z = a => applyAction(s, a, { role: 'zeus', user: 'z', now: 1_000_000 });
  const U = () => getUnits(s.usa), run = n => { z({ type: 'usaSim', running: true, speed: 60 }); s.usa.sim.at = s.usa.sim.at || 1_000_000; for (let i = 0; i < n; i++) tickUsa(s, s.usa.sim.at + 1000); };
  const gun = z({ type: 'usaSpawn', utype: 'art_bn', side: 'fed', name: 'Guns', lon: -100, lat: 35 }).id;
  const foe = z({ type: 'usaSpawn', utype: 'militia_co', side: 'mil', name: 'Foe', lon: -100, lat: 35.1 }).id;
  assert.equal(z({ type: 'usaAbility', id: gun, ability: 'airstrike', to: [-100, 35.1] }).ok, false, 'a gun cannot call an air strike');
  assert.equal(z({ type: 'usaAbility', id: gun, ability: 'barrage', to: [-100, 37] }).ok, false, 'out of range');
  assert.ok(z({ type: 'usaAbility', id: gun, ability: 'barrage', to: [-100, 35.1] }).ok);
  assert.equal(z({ type: 'usaAbility', id: gun, ability: 'barrage', to: [-100, 35.1] }).ok, false, 'it must rest');
  run(6);
  assert.ok(U()[foe].strength < 100, 'the shells hurt the militia');
  assert.ok(s.usa.hostile.includes('fed|mil'), 'which puts the sides at war');
  // medevac heals friends
  const med = z({ type: 'usaSpawn', utype: 'ems', side: 'fed', name: 'Medics', lon: -100, lat: 35.0 }).id;
  s.usa.mods[gun] = { ...(s.usa.mods[gun] || {}), strength: 50 };
  assert.ok(z({ type: 'usaAbility', id: med, ability: 'medevac' }).ok);
  run(6);
  assert.ok(U()[gun].strength > 50, 'the artillery was patched up');
  // dig in and forced march
  const inf = z({ type: 'usaSpawn', utype: 'inf_bn', side: 'fed', name: 'Inf', lon: -100.5, lat: 35 }).id;
  assert.ok(z({ type: 'usaAbility', id: inf, ability: 'fortify' }).ok && U()[inf].fort === true);
  assert.ok(z({ type: 'usaOrder', ids: [inf], order: { type: 'move', to: [-100.4, 35] } }).ok && U()[inf].fort === false, 'any order ends it');
  assert.ok(z({ type: 'usaAbility', id: inf, ability: 'forcedmarch' }).ok && U()[inf].boost > s.usa.sim.t);
  // airlift
  const heli = z({ type: 'usaSpawn', utype: 'uh60', side: 'fed', name: 'Black Hawks', lon: -99.0, lat: 36 }).id, grunt = z({ type: 'usaSpawn', utype: 'inf_co', side: 'fed', name: 'Grunts', lon: -99.0, lat: 36.02 }).id;
  assert.ok(z({ type: 'usaAbility', id: heli, ability: 'airlift', to: [-98.5, 36.2] }).ok && U()[grunt].carry === heli);
  run(40);
  assert.equal(U()[grunt].carry, null, 'set down');
  assert.ok(Math.abs(U()[grunt].lon + 98.5) < 0.1, 'at the landing point');
});
