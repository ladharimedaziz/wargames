// Engine, reducer and command-bar tests. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as geo from '../../server/geo-index.js';
import { createWorldState, createCourtState } from '../../shared/engine/state.js';
import { applyAction } from '../../shared/engine/reducer.js';
import { parseCommand } from '../../shared/engine/command.js';
import { atWar, relation } from '../../shared/engine/core.js';
import { validateOrder } from '../../shared/engine/orders.js';

const gi = { ids: geo.atlasCountryIds(), name: geo.atlasName, anchor: geo.anchorOf, neighbors: geo.neighborsOf };
const US = '840', RU = '643', UA = '804', FR = '250', SA = '682', JP = '392';

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
  assert.equal(zeus({ type: 'setTension', value: 9 }).ok, false);
  assert.equal(kronos({ type: 'setTension', value: 9 }).ok, true);
  assert.equal(s.global.tension, 9);
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
  command(s, zeus, 'player saudi uae qatar');
  assert.equal(s.countries[SA].control, 'player');
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

test('resolving a turn advances the clock and queues headlines for review', () => {
  const { s, zeus } = world();
  command(s, zeus, 'russia declares war on ukraine');
  command(s, zeus, 'russia invade ukraine 3');
  const turn = s.meta.turn;
  assert.ok(zeus({ type: 'resolveTurn' }).ok);
  assert.equal(s.meta.turn, turn + 1);
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
  assert.ok(kronos({ type: 'spawnUnits', country: SA, unitType: 'carrier', count: 2 }).ok);
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
  assert.ok(boundAllies(s, SA, '586'), 'Saudi Arabia and Pakistan have a defence pact');
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
  assert.equal(s.countries[UA].front.pct, 30, 'hold keeps the line');
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
  assert.ok(Object.values(s.units).some(u => u.owner === SA && u.type === 'fleet' && u.loc.id === 'persian_gulf'));
  const saArmy = Object.values(s.units).find(u => u.owner === SA && u.type === 'army');
  const v1 = validateOrder(s, { country: SA, type: 'invade', target: IR, units: [saArmy.id] });
  assert.equal(v1.ok, false);
  assert.match(v1.reason, /landing ships/);
  const usFleet = Object.values(s.units).find(u => u.owner === US && u.type === 'fleet');
  usFleet.loc = { kind: 'sea', id: 'persian_gulf' };
  const usArmy = Object.values(s.units).find(u => u.owner === US && u.type === 'army');
  const o = { country: US, type: 'invade', target: IR, units: [usArmy.id] };
  const v2 = validateOrder(s, o);
  assert.ok(v2.ok, v2.reason);
  assert.equal(o.zone, 'persian_gulf');
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
  assert.ok(s.countries[SA].treasury > s.countries[IR].treasury);
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
