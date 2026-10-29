// Watches the world and suggests ending screens to the Stage Zeus. Nothing ends without a Zeus choosing to play it.
import { ENDINGS } from './core.js';
import { isColdEra, endingsFor, detectColdEndings, coldEndingDetail } from './cold-endings.js';

export function detectEndings(state, ev) {
  const g = state.global, out = [];
  const E = endingsFor(state);
  const add = (type, why) => out.push({ type, en: `Ending available: ${E[type].title}. ${why}`, ar: `نهاية متاحة: ${E[type].ar}` });
  if (isColdEra(state)) {
    if (ev.some(e => e.kind === 'nuke')) add('nuclear', 'A nuclear weapon was used.');
    detectColdEndings(state, ev, add);
    return out;
  }
  const hadWar = state.history.some(h => h.wars > 0) || ev.some(e => e.kind === 'war');
  if (ev.some(e => e.kind === 'nuke')) add('nuclear', 'A nuclear weapon was used.');
  if (hadWar && state.wars.length === 0 && ev.some(e => e.kind === 'peace')) add('peace', 'Every war has ended in a peace treaty.');
  else if (hadWar && state.wars.length === 0 && ev.some(e => e.kind === 'ceasefire')) add('ceasefire', 'All fighting has stopped under ceasefires.');
  if (g.gdpIndex < 0.6) add('collapse', `World output is down ${Math.round((1 - g.gdpIndex) * 100)}%.`);
  for (const bloc of ['A', 'B', 'C']) {
    const members = Object.values(state.countries).filter(c => c.bloc === bloc && c.major && c.base.gdp > 300);
    if (members.length && members.every(c => c.capitulated || c.occupiedBy || c.stability < 5)) {
      add('victory', `The ${state.blocs[bloc].name} has been defeated.`);
      break;
    }
  }
  if (state.wars.length && state.history.length > 12) {
    const last = state.history.slice(-5);
    const moving = ev.some(e => e.kind === 'occupation' || e.kind === 'capitulation');
    if (!moving && last.every(h => h.wars > 0)) add('stalemate', 'The front lines have not moved for weeks.');
  }
  if (ev.filter(e => e.kind === 'ai_join').length >= 2 || ev.filter(e => e.kind === 'alliance').length >= 2) add('neworder', 'Alliances are shifting fast.');
  return out;
}

// A specific ending for what actually happened, instead of a generic "a side won". Returns the title, a line that
// names the countries involved, a few numbers, and a `scene` the display uses to pick its animation.
export function endingDetail(state, type) {
  const N = id => state.countries[id]?.name || id, list = ids => ids.length > 3 ? `${ids.slice(0, 3).map(N).join(', ')} and ${ids.length - 3} more` : ids.map(N).join(' and ');
  const all = Object.values(state.countries).filter(c => !c.rebelOf && !c.oob);
  const g = state.global, weeks = Math.max(0, state.meta.turn - 1);
  const fallen = all.filter(c => c.capitulated || c.occupiedBy).map(c => c.id);
  const fronts = all.filter(c => c.front).map(c => c.id);
  const facts = [{ k: weeks, v: weeks === 1 ? 'week' : 'weeks' }];
  const d = { facts };
  if (type.startsWith('cw_')) return coldEndingDetail(state, type, d);
  if (type === 'victory') {
    const gdp = b => all.filter(c => c.bloc === b).reduce((s, c) => s + c.base.gdp, 0);
    const lost = ['A', 'B', 'C'].find(b => { const m = all.filter(c => c.bloc === b && c.major && c.base.gdp > 300); return m.length && m.every(c => c.capitulated || c.occupiedBy || c.stability < 5); });
    const win = ['A', 'B', 'C'].filter(b => b !== lost && state.blocs[b]).sort((a, b) => gdp(b) - gdp(a))[0];
    if (lost && win) {
      d.title = `${state.blocs[win].name} Prevails`; d.scene = 'victory'; d.bloc = win;
      d.line = `${state.blocs[lost].name} is broken${fallen.length ? `: ${list(fallen)} fell` : ''}. The map is redrawn by those left standing.`;
    }
    facts.push({ k: fallen.length, v: 'countries fallen' });
  } else if (type === 'peace') {
    d.scene = 'peace'; d.line = `After ${weeks} ${weeks === 1 ? 'week' : 'weeks'} of war the treaties are signed, and ${state.treaties.length} agreements now hold the peace.`;
    facts.push({ k: state.treaties.length, v: 'treaties' });
  } else if (type === 'ceasefire') {
    d.scene = 'ceasefire'; d.line = fronts.length ? `The guns stop along the lines in ${list(fronts)}. Nobody has agreed on what comes next.` : undefined;
    facts.push({ k: fronts.length, v: 'frozen fronts' });
  } else if (type === 'stalemate') {
    d.scene = 'stalemate'; d.line = fronts.length ? `The lines in ${list(fronts)} have not moved for weeks, and they begin to look like borders.` : undefined;
    facts.push({ k: fronts.length, v: 'frozen fronts' });
  } else if (type === 'collapse') {
    const shaky = all.filter(c => c.stability < 5).length;
    d.scene = 'collapse'; d.line = `World output is down ${Math.round((1 - g.gdpIndex) * 100)}%. ${shaky} governments are barely holding on, and none of the winners can pay for it.`;
    facts.push({ k: `-${Math.round((1 - g.gdpIndex) * 100)}%`, v: 'world economy' }, { k: shaky, v: 'unstable states' });
  } else if (type === 'neworder') {
    d.scene = 'neworder';
    const sizes = ['A', 'B', 'C'].filter(b => state.blocs[b]).map(b => `${state.blocs[b].name} (${all.filter(c => c.bloc === b).length})`);
    d.line = `Old pacts are broken. The new blocs: ${sizes.join(', ')}.`;
    facts.push({ k: state.treaties.length, v: 'treaties' });
  }
  return d;
}
