// Engine, reducer and command-bar tests. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as geo from '../../server/geo-index.js';
import { createWorldState, createCourtState } from '../../shared/engine/state.js';
import { applyAction } from '../../shared/engine/reducer.js';
import { parseCommand } from '../../shared/engine/command.js';
import { atWar, relation } from '../../shared/engine/core.js';

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
