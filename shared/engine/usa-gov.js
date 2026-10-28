// Office holders are the people in post at the end of 2025 and may be out of date; the Zeus can rename anyone, and a delegate
// who takes an office types their own name.
// The rest of the US government, run by the computer unless a delegate takes an office: President, cabinet, military chiefs,
// Congress and the Supreme Court. It watches the events of the simulation and answers them after a realistic delay, and the
// Zeus can make any office act, queue an order, or put a bill to a vote.
import { sideName } from './usa-sim.js';

export const OFFICES = [
  ['pres', 'President of the United States', 'exec', 'Donald Trump'], ['vp', 'Vice President', 'exec', 'JD Vance'], ['nsa', 'National Security Adviser', 'exec', 'Marco Rubio'],
  ['state', 'Secretary of State', 'cabinet', 'Marco Rubio'], ['treasury', 'Secretary of the Treasury', 'cabinet', 'Scott Bessent'], ['defense', 'Secretary of Defense', 'cabinet', 'Pete Hegseth'],
  ['justice', 'Attorney General', 'cabinet', 'Pam Bondi'], ['dhs', 'Secretary of Homeland Security', 'cabinet', 'Kristi Noem'], ['hhs', 'Secretary of Health and Human Services', 'cabinet', 'Robert F. Kennedy Jr.'],
  ['transport', 'Secretary of Transportation', 'cabinet', 'Sean Duffy'], ['energy', 'Secretary of Energy', 'cabinet', 'Chris Wright'], ['commerce', 'Secretary of Commerce', 'cabinet', 'Howard Lutnick'],
  ['fema', 'FEMA Administrator', 'cabinet', ''], ['fbi', 'Director of the FBI', 'cabinet', 'Kash Patel'],
  ['joint', 'Chairman of the Joint Chiefs of Staff', 'military', 'Gen. Dan Caine'],
  ['speaker', 'Speaker of the House', 'congress', 'Mike Johnson'], ['senate', 'Senate Majority Leader', 'congress', 'John Thune'],
  ['scotus', 'Chief Justice of the United States', 'judiciary', 'John Roberts'],
];
export const OFFICE_BRANCH = { exec: 'White House', cabinet: 'Cabinet and agencies', military: 'Military', congress: 'Congress', judiciary: 'Courts' };
export const OFFICE_BY_ID = Object.fromEntries(OFFICES.map(o => [o[0], { id: o[0], title: o[1], branch: o[2], person: o[3] }]));
// What an order or a passed bill can do to the simulation.
export const GOV_EFFECTS = {
  none: 'Nothing but the words',
  federalize_all: 'Federalize every National Guard',
  release_all: 'Release every Guard to the governors',
  border_closed: 'Close both borders',
  border_open: 'Reopen both borders',
  border_heightened: 'Heightened checks on both borders',
};

export const govDefaults = () => ({ auto: true, approval: 50, offices: {}, pending: [], last: '', snap: { st: {}, bd: {} }, cool: {} });
export function getGov(usa) {
  const g = usa.gov ||= govDefaults();
  g.offices ||= {}; g.pending ||= []; g.cool ||= {}; g.snap ||= { st: {}, bd: {} };
  return g;
}
export const officeState = (usa, id) => ({ ...OFFICE_BY_ID[id], control: 'ai', ...(getGov(usa).offices[id] || {}) });
const clock = usa => Math.round(usa.sim?.t || 0);
export function govLog(usa, text, extra = {}) {
  usa.events.push({ t: clock(usa), text, kind: 'gov', ...extra });
  if (usa.events.length > 100) usa.events.shift();
}
const who = (usa, id) => { const o = officeState(usa, id); return o.person ? `${o.title} ${o.person}` : o.title; };

// Applies what an order or bill does. `fed` marks every Guard federalized or not through the same mods the Zeus buttons use.
export function applyEffect(usa, effect, guards) {
  if (effect === 'federalize_all' || effect === 'release_all') for (const id of guards) (usa.mods[id] ||= {}).federal = effect === 'federalize_all';
  else if (effect === 'border_closed' || effect === 'border_open' || effect === 'border_heightened') {
    const v = effect.slice(7); usa.border = { ...usa.border, CAN: v, MEX: v };
  }
}

export function queue(usa, item, delayMin = 0) {
  const g = getGov(usa);
  if (g.pending.length >= 30) g.pending.shift();
  g.pending.push({ id: `p${Math.round(usa.sim.t)}-${g.pending.length}-${Math.floor(Math.random() * 1e4)}`, at: clock(usa) + Math.round(delayMin * 60), ...item });
}
// Cooldown so one long war does not make the White House speak every second.
const ready = (g, key, t, wait) => { if (g.cool[key] !== undefined && t - g.cool[key] < wait * 60) return false; g.cool[key] = t; return true; };
const nudge = (g, d) => { g.approval = Math.max(0, Math.min(100, g.approval + d)); };

// Runs once per clock tick. Returns true when something changed.
export function govTick(usa, guards) {
  const g = getGov(usa), t = clock(usa); let changed = false;
  // Events since the last one handled.
  const key = e => `${e.t}|${e.text}`, evs = usa.events;
  let from = g.last ? evs.map(key).lastIndexOf(g.last) + 1 : Math.max(0, evs.length - 5);
  if (from < 0) from = 0;
  const fresh = evs.slice(from).filter(e => e.kind !== 'gov');
  if (evs.length) g.last = key(evs[evs.length - 1]);
  // Status changes of states and the border.
  const st = {}, notes = [];
  for (const [c, v] of Object.entries(usa.states || {})) if (v?.status && v.status !== 'normal') st[c] = v.status;
  for (const [c, s] of Object.entries(st)) if (g.snap.st[c] !== s) notes.push({ k: 'state', c, s });
  const bd = { CAN: usa.border?.CAN || 'open', MEX: usa.border?.MEX || 'open' };
  for (const side of ['CAN', 'MEX']) if ((g.snap.bd[side] || 'open') !== bd[side]) notes.push({ k: 'border', side, s: bd[side] });
  g.snap = { st, bd };
  if (usa.gov.auto) {
    for (const e of fresh) {
      if (e.kind === 'war' && ready(g, 'war', t, 20)) {
        queue(usa, { office: 'pres', act: 'statement', text: `The President addresses the nation on the fighting: ${e.text.replace(/\.$/, '')}.` }, 5);
        queue(usa, { office: 'defense', act: 'statement', text: 'The Secretary of Defense puts forces on alert and asks the Joint Chiefs for options.' }, 8);
        queue(usa, { office: 'pres', act: 'order', text: 'The President invokes the Insurrection Act and federalizes the National Guard.', effect: 'federalize_all', ifWar: true }, 45);
        nudge(g, -2); changed = true;
      } else if (e.kind === 'kill' && ready(g, 'kill', t, 15)) {
        queue(usa, { office: 'speaker', act: 'statement', text: 'The Speaker calls for hearings on the losses.' }, 30);
        queue(usa, { office: 'joint', act: 'statement', text: 'The Joint Chiefs brief the President on casualties.' }, 10);
        nudge(g, -3); changed = true;
      } else if (e.kind === 'incident' && ready(g, `inc${e.grp}`, t, 20)) {
        const R = {
          disaster: [['fema', 'FEMA begins a federal response and the President offers help to the governor.', 10], ['pres', 'The President declares a major disaster and promises federal aid.', 40]],
          unrest: [['justice', 'The Attorney General warns that federal charges will follow any violence.', 10], ['pres', 'The President calls for calm and says the Guard is ready if the governor asks.', 25]],
          attack: [['fbi', 'The FBI takes the lead on the investigation.', 8], ['dhs', 'Homeland Security raises the alert level.', 12], ['pres', 'The President addresses the nation and orders a full response.', 30]],
          border: [['dhs', 'Homeland Security surges officers to the crossing.', 8], ['pres', 'The President demands the border be secured.', 30]],
          war: [['nsa', 'The National Security Adviser convenes the Situation Room.', 5], ['joint', 'The Joint Chiefs put forces on alert.', 12], ['pres', 'The President addresses the nation on the crisis.', 25]],
        }[e.grp] || [];
        for (const [office, text, delay] of R) queue(usa, { office, act: 'statement', text }, delay);
        nudge(g, e.grp === 'disaster' ? 0 : -2); changed = true;
      } else if (e.kind === 'peace' && ready(g, 'peace', t, 10)) {
        queue(usa, { office: 'pres', act: 'statement', text: 'The President welcomes the end of the fighting and orders the Guard released.', effect: 'release_all' }, 20);
        nudge(g, 2); changed = true;
      }
    }
    for (const n of notes) {
      if (n.k === 'state' && ready(g, `st${n.c}`, t, 30)) {
        const word = n.s === 'martial' ? 'martial law' : n.s === 'emergency' ? 'a state of emergency' : 'a state alert';
        queue(usa, { office: 'fema', act: 'statement', text: `FEMA opens a coordination centre for ${n.c}, which is under ${word}.` }, 12);
        if (n.s === 'martial') queue(usa, { office: 'pres', act: 'statement', text: `The President speaks with the governor of ${n.c} about martial law.` }, 6);
        nudge(g, n.s === 'martial' ? -4 : -1); changed = true;
      } else if (n.k === 'border' && n.s !== 'open' && ready(g, `bd${n.side}`, t, 30)) {
        const nm = n.side === 'CAN' ? 'Canadian' : 'Mexican';
        queue(usa, { office: 'dhs', act: 'statement', text: `Homeland Security posts extra officers along the ${nm} border (${n.s === 'closed' ? 'closed' : 'heightened checks'}).` }, 10);
        queue(usa, { office: 'commerce', act: 'statement', text: `Commerce warns of delays and losses to trade across the ${nm} border.` }, 40);
        nudge(g, -1); changed = true;
      }
    }
  }
  // Things that are due.
  if (g.pending.some(p => p.at <= t)) {
    const due = g.pending.filter(p => p.at <= t); g.pending = g.pending.filter(p => p.at > t);
    for (const p of due) { runItem(usa, p, guards); changed = true; }
  }
  return changed;
}

function runItem(usa, p, guards) {
  const g = getGov(usa);
  if (p.ifWar && !(usa.hostile || []).length) return; // the war ended first
  if (p.act === 'vote') {
    const yes = p.force ? p.force === 'pass' : Math.random() * 100 < 25 + g.approval * 0.6;
    const hs = 435, ys = yes ? 218 + Math.floor(Math.random() * 60) : 120 + Math.floor(Math.random() * 97);
    govLog(usa, `${p.title}: the House votes ${ys}–${hs - ys}, and the bill ${yes ? 'passes' : 'fails'}.`);
    if (yes) {
      applyEffect(usa, p.effect, guards);
      if (p.effect && p.effect !== 'none') govLog(usa, `The President signs ${p.title}: ${GOV_EFFECTS[p.effect].toLowerCase()}.`);
      nudge(g, 1);
    }
    return;
  }
  applyEffect(usa, p.effect, guards);
  govLog(usa, p.text || `${who(usa, p.office)} acts.`, { office: p.office });
  // Orders that touch the Guard can be taken to court by the AI Supreme Court.
  if (p.act === 'order' && p.effect === 'federalize_all' && g.auto && ready(g, 'court', clock(usa), 120))
    queue(usa, { office: 'scotus', act: 'statement', text: 'The Supreme Court agrees to hear a challenge to the federalization of the Guard.' }, 90);
}
