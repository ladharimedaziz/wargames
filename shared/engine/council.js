// Council mode: a United Nations style committee. The chair runs the room out loud; the Zeus mirrors it here:
// the speakers list, drafts on screen, roll-call votes, crisis updates and, for Gotham, a district map.
import { clamp, newId } from './core.js';
import { COUNCIL_PRESETS } from '../data/councils.js';

const err = error => ({ ok: false, error });
const ok = (r = {}) => ({ ok: true, ...r });
const seat = (c, id) => c.seats.find(s => s.id === id);
const STATUSES = ['secure', 'tense', 'unrest', 'lost', 'dark'];
export const MARKER_KINDS = ['fire', 'riot', 'breach', 'hostage', 'sighting', 'blackout', 'help'];

export function createCouncilFields(s, presetId) {
  const p = COUNCIL_PRESETS[presetId] || COUNCIL_PRESETS.who;
  const seats = p.seats.map(x => ({ ...x }));
  let n = seats.length;
  for (const e of p.extras || []) seats.push({ id: `d${++n}`, name: e.name, person: '', present: true, kind: e.kind });
  const drafts = (p.drafts || []).map((d, i) => ({ id: `dr${i + 1}`, title: d.title, sponsors: [...d.sponsors], clauses: [...d.clauses], status: 'draft' }));
  s.display.scene = 'council';
  s.council = {
    preset: presetId in COUNCIL_PRESETS ? presetId : 'who', org: p.org, title: p.title, subtitle: p.subtitle, accent: p.accent, brief: p.brief,
    facts: [...p.facts], agenda: [...p.agenda], agendaIdx: 0,
    session: 'formal',
    seats, speaker: null, speakerSince: 0, queue: [], stats: { speaking: {} },
    speakTimer: { duration: 90, endsAt: 0, remaining: 90, running: false },
    drafts, shownDraft: null, vote: null,
    alert: null, feed: [],
    map: p.map || null, districts: {}, markers: [], mapNote: '',
    gavelAt: 0,
  };
  return s;
}

function closeSpeaker(c, now) {
  if (c.speaker && c.speakerSince) c.stats.speaking[c.speaker] = (c.stats.speaking[c.speaker] || 0) + (now - c.speakerSince);
  c.speakerSince = 0;
}
function startSpeaker(c, id, now) {
  closeSpeaker(c, now);
  c.speaker = id; c.speakerSince = id ? now : 0;
  const t = c.speakTimer;
  t.remaining = t.duration; t.endsAt = id ? now + t.duration * 1000 : 0; t.running = !!id;
}
const tally = (c, v) => {
  const t = { yes: 0, no: 0, abstain: 0 };
  for (const [id, x] of Object.entries(v.votes)) if (seat(c, id)?.present && t[x] !== undefined) t[x]++;
  return t;
};
export const eligibleSeats = c => c.seats.filter(x => x.present && x.kind === 'delegation');

export const councilActions = {
  setTopic: { perm: 'zeus', run(s, a) {
    const c = s.council;
    for (const [k, n] of [['title', 140], ['subtitle', 140], ['brief', 700]]) if (a[k] !== undefined) c[k] = String(a[k]).slice(0, n);
    if (Array.isArray(a.facts)) c.facts = a.facts.map(x => String(x).trim().slice(0, 300)).filter(Boolean).slice(0, 12);
    if (Array.isArray(a.agenda)) { c.agenda = a.agenda.map(x => String(x).trim().slice(0, 100)).filter(Boolean).slice(0, 12); c.agendaIdx = clamp(c.agendaIdx, 0, Math.max(0, c.agenda.length - 1)); }
    return ok();
  } },
  setAgenda: { perm: 'zeus', run(s, a) { const c = s.council, i = a.delta ? c.agendaIdx + a.delta : Number(a.index); if (!(i >= 0 && i < c.agenda.length)) return err('No such item.'); c.agendaIdx = i; return ok(); } },
  setSession: { perm: 'zeus', run(s, a) {
    if (!['formal', 'moderated', 'unmoderated', 'crisis', 'recess'].includes(a.session)) return err('Unknown session type.');
    s.council.session = a.session; if (a.session !== 'formal' && a.session !== 'moderated') startSpeaker(s.council, null, 0); return ok();
  } },
  editSeat: { perm: 'zeus', run(s, a) {
    const st = seat(s.council, a.id); if (!st) return err('Unknown seat.');
    if (a.name !== undefined) st.name = String(a.name).slice(0, 60);
    if (a.person !== undefined) st.person = String(a.person).slice(0, 60);
    if (a.present !== undefined) st.present = !!a.present;
    if (a.kind && ['delegation', 'observer', 'chair'].includes(a.kind)) st.kind = a.kind;
    return ok();
  } },
  addSeat: { perm: 'zeus', run(s, a) {
    const c = s.council; if (c.seats.length >= 60) return err('That is a full chamber.');
    const st = { id: newId(s, 'd'), name: String(a.name || 'New delegation').slice(0, 60), person: '', present: true, kind: ['delegation', 'observer', 'chair'].includes(a.kind) ? a.kind : 'delegation' };
    c.seats.push(st); return ok({ seat: st });
  } },
  removeSeat: { perm: 'zeus', run(s, a, ctx) {
    const c = s.council; if (c.speaker === a.id) startSpeaker(c, null, ctx.now);
    c.seats = c.seats.filter(x => x.id !== a.id); c.queue = c.queue.filter(x => x !== a.id); if (c.vote) delete c.vote.votes[a.id]; return ok();
  } },
  setSpeaker: { perm: 'zeus', run(s, a, ctx) {
    const c = s.council; if (a.seat && !seat(c, a.seat)) return err('Unknown seat.');
    c.queue = c.queue.filter(x => x !== a.seat); startSpeaker(c, a.seat || null, ctx.now); return ok();
  } },
  queueAdd: { perm: 'zeus', run(s, a) { const c = s.council; if (!seat(c, a.seat)) return err('Unknown seat.'); if (!c.queue.includes(a.seat) && c.speaker !== a.seat) c.queue.push(a.seat); return ok(); } },
  queueRemove: { perm: 'zeus', run(s, a) { s.council.queue = s.council.queue.filter(x => x !== a.seat); return ok(); } },
  queueMove: { perm: 'zeus', run(s, a) { const q = s.council.queue, i = q.indexOf(a.seat), j = i + (a.delta || 0); if (i < 0 || j < 0 || j >= q.length) return ok(); [q[i], q[j]] = [q[j], q[i]]; return ok(); } },
  queueNext: { perm: 'zeus', run(s, a, ctx) { const c = s.council; const next = c.queue.shift() || null; startSpeaker(c, next, ctx.now); return ok({ speaker: next }); } },
  speakTimerSet: { perm: 'zeus', run(s, a) { const t = s.council.speakTimer, sec = clamp(Math.round(Number(a.seconds) || 0), 10, 3600); t.duration = sec; t.remaining = sec; t.running = false; t.endsAt = 0; return ok(); } },
  speakTimerToggle: { perm: 'zeus', run(s, a, ctx) {
    const t = s.council.speakTimer;
    if (t.running) { t.remaining = Math.max(0, Math.round((t.endsAt - ctx.now) / 1000)); t.running = false; }
    else { if (!t.remaining) t.remaining = t.duration; t.endsAt = ctx.now + t.remaining * 1000; t.running = true; }
    return ok();
  } },
  speakTimerReset: { perm: 'zeus', run(s, a, ctx) { const t = s.council.speakTimer; t.remaining = t.duration; t.running = !!a.start; t.endsAt = a.start ? ctx.now + t.duration * 1000 : 0; return ok(); } },

  // Draft resolutions and directives.
  addDraft: { perm: 'zeus', run(s, a) {
    const c = s.council; if (c.drafts.length >= 30) return err('Too many drafts.');
    const clauses = (Array.isArray(a.clauses) ? a.clauses : String(a.clauses || '').split('\n')).map(x => String(x).trim().slice(0, 400)).filter(Boolean).slice(0, 20);
    const sponsors = (Array.isArray(a.sponsors) ? a.sponsors : String(a.sponsors || '').split(',')).map(x => String(x).trim().slice(0, 40)).filter(Boolean).slice(0, 12);
    const d = { id: newId(s, 'dr'), title: String(a.title || 'Untitled draft').slice(0, 140), sponsors, clauses, status: 'draft' };
    c.drafts.push(d); return ok({ draft: d });
  } },
  editDraft: { perm: 'zeus', run(s, a) {
    const d = s.council.drafts.find(x => x.id === a.id); if (!d) return err('Unknown draft.');
    if (a.title !== undefined) d.title = String(a.title).slice(0, 140);
    if (a.clauses !== undefined) d.clauses = (Array.isArray(a.clauses) ? a.clauses : String(a.clauses).split('\n')).map(x => String(x).trim().slice(0, 400)).filter(Boolean).slice(0, 20);
    if (a.sponsors !== undefined) d.sponsors = (Array.isArray(a.sponsors) ? a.sponsors : String(a.sponsors).split(',')).map(x => String(x).trim().slice(0, 40)).filter(Boolean).slice(0, 12);
    return ok();
  } },
  removeDraft: { perm: 'zeus', run(s, a) { const c = s.council; c.drafts = c.drafts.filter(x => x.id !== a.id); if (c.shownDraft?.id === a.id) c.shownDraft = null; if (c.vote?.draftId === a.id) c.vote = null; return ok(); } },
  showDraft: { perm: 'zeus', run(s, a, ctx) {
    const c = s.council; if (a.id && !c.drafts.find(x => x.id === a.id)) return err('Unknown draft.');
    c.shownDraft = a.id ? { id: a.id, at: ctx.now } : null; return ok();
  } },

  // Voting: open it, mark each delegation (or mark everyone yes/no/abstain), then reveal.
  openVote: { perm: 'zeus', run(s, a, ctx) {
    const c = s.council; if (!c.drafts.find(x => x.id === a.id)) return err('Pick a draft to vote on.');
    c.vote = { draftId: a.id, votes: {}, open: true, revealedAt: 0, threshold: a.threshold === 'twothirds' ? 'twothirds' : 'majority', at: ctx.now };
    c.shownDraft = { id: a.id, at: ctx.now }; c.session = 'formal'; startSpeaker(c, null, ctx.now); return ok();
  } },
  castVote: { perm: 'zeus', run(s, a) {
    const c = s.council, v = c.vote; if (!v || !v.open) return err('No vote is open.');
    if (!seat(c, a.seat)) return err('Unknown seat.');
    if (a.value === null || a.value === undefined) delete v.votes[a.seat]; else if (['yes', 'no', 'abstain'].includes(a.value)) v.votes[a.seat] = a.value; else return err('Yes, no or abstain.');
    return ok();
  } },
  castAll: { perm: 'zeus', run(s, a) {
    const c = s.council, v = c.vote; if (!v || !v.open) return err('No vote is open.');
    if (a.value === null) v.votes = {}; else if (['yes', 'no', 'abstain'].includes(a.value)) for (const x of eligibleSeats(c)) if (!v.votes[x.id]) v.votes[x.id] = a.value;
    return ok();
  } },
  closeVote: { perm: 'zeus', run(s, a, ctx) {
    const c = s.council, v = c.vote; if (!v || !v.open) return err('No vote is open.');
    const t = tally(c, v), need = v.threshold === 'twothirds' ? (t.yes + t.no) * 2 / 3 : (t.yes + t.no) / 2;
    v.open = false; v.revealedAt = ctx.now; v.tally = t; v.passed = t.yes > need && t.yes > 0;
    const d = c.drafts.find(x => x.id === v.draftId); if (d) d.status = v.passed ? 'passed' : 'failed';
    return ok({ passed: v.passed });
  } },
  clearVote: { perm: 'zeus', run(s) { s.council.vote = null; return ok(); } },

  // Crisis updates: a directive-style alert on the screen, kept in a feed.
  alert: { perm: 'zeus', run(s, a, ctx) {
    const c = s.council, title = String(a.title || '').trim().slice(0, 120); if (!title) return err('Write the headline.');
    const item = { id: newId(s, 'al'), title, text: String(a.text || '').slice(0, 500), level: ['info', 'warning', 'critical'].includes(a.level) ? a.level : 'warning', at: ctx.now };
    c.alert = item; c.feed.unshift(item); if (c.feed.length > 40) c.feed.pop(); return ok();
  } },
  clearAlert: { perm: 'zeus', run(s) { s.council.alert = null; return ok(); } },
  removeFeed: { perm: 'zeus', run(s, a) { const c = s.council; c.feed = c.feed.filter(x => x.id !== a.id); if (c.alert?.id === a.id) c.alert = null; return ok(); } },

  // The Gotham map.
  setDistrict: { perm: 'zeus', run(s, a, ctx) {
    const c = s.council; if (!c.map) return err('This committee has no map.');
    if (!STATUSES.includes(a.status)) return err('Unknown status.');
    if (a.status === 'secure') delete c.districts[a.id]; else c.districts[a.id] = { status: a.status, at: ctx.now };
    return ok();
  } },
  addMarker: { perm: 'zeus', run(s, a, ctx) {
    const c = s.council; if (!c.map) return err('This committee has no map.'); if (c.markers.length >= 60) return err('Too many markers.');
    const x = Number(a.x), y = Number(a.y); if (!(x >= 0 && x <= 1000 && y >= 0 && y <= 700)) return err('Off the map.');
    const m = { id: newId(s, 'mk'), x, y, kind: MARKER_KINDS.includes(a.kind) ? a.kind : 'fire', label: String(a.label || '').slice(0, 40), at: ctx.now };
    c.markers.push(m); return ok({ marker: m });
  } },
  removeMarker: { perm: 'zeus', run(s, a) { const c = s.council; c.markers = c.markers.filter(x => x.id !== a.id); return ok(); } },
  clearMarkers: { perm: 'zeus', run(s) { s.council.markers = []; return ok(); } },
  setMapNote: { perm: 'zeus', run(s, a) { s.council.mapNote = String(a.text || '').slice(0, 120); return ok(); } },
  gavel: { perm: 'zeus', run(s, a, ctx) { s.council.gavelAt = ctx.now; return ok(); } },
};
