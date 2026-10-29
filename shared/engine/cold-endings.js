// Endings of the Cold War committee (era 'cold85'). They replace the modern endings on that committee's panel and
// stage; the nuclear ending and a custom one stay shared. Like every ending, a Zeus has to choose to play them.
import { ENDINGS, atWar } from './core.js';

export const COLD_ENDINGS = {
  cw_detente:   { title: 'Détente', ar: 'الانفراج', tone: 'good', line: 'Summits, handshakes and arms-control treaties. The two camps learn to live side by side.' },
  cw_wall:      { title: 'The Wall Comes Down', ar: 'سقوط الجدار', tone: 'good', line: 'The Iron Curtain lifts. The borders open and Europe is whole again.' },
  cw_dissolve:  { title: 'The Union Dissolves', ar: 'تفكك الاتحاد', tone: 'neutral', line: 'The Soviet Union breaks into its republics. A superpower ends without a shot between the giants.' },
  cw_westfalls: { title: 'The Alliance Unravels', ar: 'تفكك الحلف', tone: 'neutral', line: 'The Western alliance comes apart, and one by one its members make their own terms with Moscow.' },
  cw_brink:     { title: 'Back from the Brink', ar: 'التراجع عن الحافة', tone: 'neutral', line: 'The world came within minutes of midnight and stepped back. The hotline rings; the missiles stay in their silos.' },
  cw_proxy:     { title: 'The Proxy Wars', ar: 'حروب الوكالة', tone: 'bad', line: 'The superpowers never fight each other, but their rivalry burns on through other nations’ wars.' },
  cw_frozen:    { title: 'The Long Twilight', ar: 'الشفق الطويل', tone: 'neutral', line: 'Neither camp blinks. The arms race grinds on and the clock stays close to midnight.' },
};

export const isColdEra = state => state?.settings?.era === 'cold85';
// The endings a committee can play, in the order the panel shows them.
export const endingsFor = state => (isColdEra(state) ? { ...COLD_ENDINGS, nuclear: ENDINGS.nuclear, custom: ENDINGS.custom } : ENDINGS);

const US = '840', USSR = '643', WEST_GERMANY = '276', EAST_GERMANY = '278';
const broken = c => !c || c.capitulated || c.occupiedBy || c.stability < 10;

export function detectColdEndings(state, ev, add) {
  const C = state.countries, g = state.global, hist = state.history;
  const both = (t, a, b) => t.parties.includes(a) && t.parties.includes(b);
  if (broken(C[USSR])) add('cw_dissolve', 'The Soviet Union is no longer holding together.');
  if (broken(C[US])) add('cw_westfalls', 'The United States can no longer lead the West.');
  const eg = C[EAST_GERMANY];
  if (eg && (eg.bloc !== 'B' || eg.capitulated || state.treaties.some(t => t.type === 'alliance' && both(t, WEST_GERMANY, EAST_GERMANY)))) add('cw_wall', 'East Germany has left the Warsaw Pact.');
  if (g.tension <= 3 && !atWar(state, US, USSR) && state.treaties.some(t => both(t, US, USSR))) add('cw_detente', 'Washington and Moscow have a treaty and tension is low.');
  if (hist.length > 3 && Math.max(...hist.map(h => h.tension)) >= 9 && g.tension <= 6 && !ev.some(e => e.kind === 'nuke')) add('cw_brink', 'Tension reached 9 and has come back down.');
  const proxy = state.wars.filter(w => ![w.a, w.b].some(id => id === US || id === USSR));
  if (proxy.length >= 3 && !atWar(state, US, USSR)) add('cw_proxy', `${proxy.length} wars are burning while the superpowers stay out of each other’s way.`);
  if (hist.length > 16 && hist.slice(-8).every(h => h.tension >= 4 && h.tension <= 8)) add('cw_frozen', 'Nothing has broken either way for weeks.');
}

export function coldEndingDetail(state, type, d) {
  const C = state.countries, g = state.global, facts = d.facts;
  const N = id => C[id]?.name || id;
  if (type === 'cw_detente') {
    const pacts = state.treaties.filter(t => t.parties.includes(US) && t.parties.includes(USSR)).length;
    facts.push({ k: pacts, v: pacts === 1 ? 'superpower treaty' : 'superpower treaties' }, { k: `${g.tension}/10`, v: 'tension' });
  } else if (type === 'cw_wall') {
    d.line = `${N(EAST_GERMANY)} and ${N(WEST_GERMANY)} stand on the same side at last. The Iron Curtain lifts and Europe is whole again.`;
    facts.push({ k: state.treaties.length, v: 'treaties' });
  } else if (type === 'cw_dissolve') {
    const reps = Object.values(C).filter(c => /SSR$/.test(c.name)).length;
    if (reps) d.line = `The Soviet Union breaks apart, and its ${reps} republics go their own way. A superpower ends without a shot between the giants.`;
    facts.push({ k: reps, v: 'republics' });
  } else if (type === 'cw_proxy') {
    const proxy = state.wars.filter(w => ![w.a, w.b].some(id => id === US || id === USSR));
    if (proxy.length) d.line = `The superpowers never fight each other, but their rivalry burns on in ${proxy.slice(0, 3).map(w => `${N(w.a)} against ${N(w.b)}`).join(', ')}${proxy.length > 3 ? ` and ${proxy.length - 3} more` : ''}.`;
    facts.push({ k: proxy.length, v: 'proxy wars' });
  } else if (type === 'cw_brink') {
    const peak = Math.max(g.tension, ...state.history.map(h => h.tension));
    facts.push({ k: `${peak}/10`, v: 'peak tension' }, { k: `${g.tension}/10`, v: 'tension now' });
  } else {
    facts.push({ k: `${g.tension}/10`, v: 'tension' }, { k: state.wars.length, v: 'wars still open' });
  }
  return d;
}
