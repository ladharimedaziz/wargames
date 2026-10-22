// Watches the world and suggests ending screens to the Stage Zeus. Nothing ends without a Zeus choosing to play it.
import { ENDINGS } from './core.js';

export function detectEndings(state, ev) {
  const g = state.global, out = [];
  const add = (type, why) => out.push({ type, en: `Ending available: ${ENDINGS[type].title}. ${why}`, ar: `نهاية متاحة: ${ENDINGS[type].ar}` });
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
