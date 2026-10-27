// Starting positions for world committees: the modern world by default, plus the Cold War in 1985 and the
// Americas south of the border.
import { declareWar } from './resolve.js';

const NATO = ['840', '124', '826', '250', '276', '380', '724', '620', '528', '056', '442', '208', '578', '352', '300', '792', '392', '410', '036', '554', '818', '586', '764', '608'];
const PACT = ['643', '804', '112', '398', '860', '795', '762', '417', '031', '051', '268', '498', '440', '428', '233', '616', '348', '642', '100', '203', '703', '192', '704', '024', '231', '496', '408', '004', '434', '760', '558'];
const NONALIGNED = ['156', '356', '364', '368', '710', '566', '076', '032', '484', '862'];
const SSR = { '804': 'Ukrainian SSR', '112': 'Byelorussian SSR', '398': 'Kazakh SSR', '860': 'Uzbek SSR', '795': 'Turkmen SSR', '762': 'Tajik SSR', '417': 'Kirghiz SSR', '031': 'Azerbaijan SSR', '051': 'Armenian SSR', '268': 'Georgian SSR', '498': 'Moldavian SSR', '440': 'Lithuanian SSR', '428': 'Latvian SSR', '233': 'Estonian SSR' };

function coldWar(s) {
  s.meta.clock = '1985-03-11'; s.meta.turnDays = 7;
  s.settings.year = 1985; s.settings.era = 'cold85'; s.settings.aiNukes = false;
  s.global.oilPrice = 28; s.global.tension = 5;
  s.blocs.A = { name: 'NATO and allies', ar: 'الناتو', color: '#3d8bfd' };
  s.blocs.B = { name: 'Warsaw Pact and allies', ar: 'حلف وارسو', color: '#e5484d' };
  s.blocs.C = { name: 'Non-Aligned', ar: 'عدم الانحياز', color: '#ffb224' };
  const bloc = id => NATO.includes(id) ? 'A' : PACT.includes(id) ? 'B' : NONALIGNED.includes(id) ? 'C' : 'N';
  for (const c of Object.values(s.countries)) {
    c.bloc = bloc(c.id); c.stealth = false; c.cyber = {};
    c.nuclear.has = ['840', '643', '826', '250', '156'].includes(c.id);
    if (SSR[c.id]) { c.name = SSR[c.id]; c.control = 'ai'; c.nuclear.has = false; c.veto = false; }
  }
  const R = s.countries['643']; if (R) { R.name = 'Soviet Union'; R.veto = true; R.major = true; }
  const D = s.countries['276']; if (D) D.name = 'West Germany';
  // Treaties that held the camps together.
  const pair = (type, ids) => s.treaties.push({ type, parties: ids.filter(i => s.countries[i]), turn: 0 });
  pair('alliance', NATO.filter(i => !['036', '554', '410', '392', '818', '586', '764', '608'].includes(i)));
  pair('alliance', ['643', '616', '348', '642', '100', '203', '703']);
  // The Iran–Iraq war was in its fifth year.
  if (s.countries['364'] && s.countries['368']) declareWar(s, '368', '364', [], 'declared');
  s.log.push({ at: 0, text: 'Cold War scenario: March 1985. Nuclear arsenals at their peak; no drones, no stealth, no cyber.' });
}

function americas(s) {
  s.meta.clock = '2027-03-14';
  s.settings.detail = 'americas';
  s.display.focus = { kind: 'country', id: '484', at: 0 };
  s.log.push({ at: 0, text: 'Americas scenario: state borders are drawn for Mexico and South America. Use Civil wars to raise cartels, militias or breakaway regions.' });
}

export function applyScenario(s, preset) {
  if (preset === 'cold85') coldWar(s);
  else if (preset === 'latam') americas(s);
  return s;
}
