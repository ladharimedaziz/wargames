// Court mode: the chair runs proceedings out loud, the Stage Zeus mirrors them on screen with these actions.
import { OBJECTION_GROUNDS, clamp, newId } from './core.js';

const err = error => ({ ok: false, error });
const ok = (r = {}) => ({ ok: true, ...r });
const SIDES = ['bench', 'prosecution', 'defence', 'witness', 'jury', 'gallery'];

// Adds the time the current speaker has held the floor to their running total.
function closeSpeaker(c, now) {
  if (c.speaker && c.speakerSince) c.stats.speaking[c.speaker] = (c.stats.speaking[c.speaker] || 0) + (now - c.speakerSince);
  c.speakerSince = 0;
}

function startSpeaker(c, seat, now) {
  closeSpeaker(c, now);
  c.speaker = seat;
  c.speakerSince = seat ? now : 0;
  c.stats.turns = c.stats.turns || {};
  if (seat) c.stats.turns[seat] = (c.stats.turns[seat] || 0) + 1;
  const t = c.speakTimer;
  t.remaining = t.duration; t.endsAt = seat && t.auto !== false ? now + t.duration * 1000 : 0; t.running = !!(seat && t.auto !== false);
}

const seat = (c, id) => c.seats.find(s => s.id === id);

export const courtActions = {
  setCase: { perm: 'zeus', run(s, a) {
    const c = s.court;
    if (a.title !== undefined) c.caseTitle = String(a.title).slice(0, 100);
    if (a.subtitle !== undefined) c.caseSubtitle = String(a.subtitle).slice(0, 140);
    if (a.charge !== undefined) c.charge = String(a.charge).slice(0, 300);
    return ok();
  } },
  setPhase: { perm: 'zeus', run(s, a, ctx) {
    const c = s.court, i = a.delta ? c.phase + a.delta : Number(a.index);
    if (!(i >= 0 && i < c.phases.length)) return err('No such phase.');
    c.phase = i; c.phaseAt = ctx.now; return ok();
  } },
  editPhases: { perm: 'zeus', run(s, a) {
    const list = (a.phases || []).map(x => String(x).trim().slice(0, 40)).filter(Boolean).slice(0, 12);
    if (list.length < 2) return err('Keep at least two phases.');
    s.court.phases = list; s.court.phase = Math.min(s.court.phase, list.length - 1); return ok();
  } },
  editSeat: { perm: 'zeus', run(s, a) {
    const st = seat(s.court, a.id); if (!st) return err('Unknown seat.');
    if (a.name !== undefined) st.name = String(a.name).slice(0, 60);
    if (a.person !== undefined) st.person = String(a.person).slice(0, 60);
    if (a.side && SIDES.includes(a.side)) st.side = a.side;
    return ok();
  } },
  addSeat: { perm: 'zeus', run(s, a) {
    if (s.court.seats.length >= 24) return err('That is a full courtroom.');
    const side = SIDES.includes(a.side) ? a.side : 'witness';
    const st = { id: newId(s, 'seat'), role: side, name: String(a.name || 'New seat').slice(0, 60), side };
    s.court.seats.push(st); return ok({ seat: st });
  } },
  removeSeat: { perm: 'zeus', run(s, a, ctx) {
    const c = s.court; if (c.speaker === a.id) startSpeaker(c, null, ctx.now);
    c.seats = c.seats.filter(x => x.id !== a.id); c.queue = c.queue.filter(x => x !== a.id); return ok();
  } },
  setSpeaker: { perm: 'zeus', run(s, a, ctx) {
    const c = s.court; if (a.seat && !seat(c, a.seat)) return err('Unknown seat.');
    c.queue = c.queue.filter(x => x !== a.seat);
    startSpeaker(c, a.seat || null, ctx.now); return ok();
  } },
  queueAdd: { perm: 'zeus', run(s, a) {
    const c = s.court; if (!seat(c, a.seat)) return err('Unknown seat.');
    if (!c.queue.includes(a.seat)) c.queue.push(a.seat); return ok();
  } },
  queueRemove: { perm: 'zeus', run(s, a) { s.court.queue = s.court.queue.filter(x => x !== a.seat); return ok(); } },
  queueMove: { perm: 'zeus', run(s, a) {
    const q = s.court.queue, i = q.indexOf(a.seat), j = i + (a.delta || 0);
    if (i < 0 || j < 0 || j >= q.length) return ok();
    [q[i], q[j]] = [q[j], q[i]]; return ok();
  } },
  queueNext: { perm: 'zeus', run(s, a, ctx) {
    const c = s.court; const next = c.queue.shift() || null;
    startSpeaker(c, next, ctx.now); return ok({ speaker: next });
  } },
  speakTimerSet: { perm: 'zeus', run(s, a) {
    const t = s.court.speakTimer, sec = clamp(Math.round(Number(a.seconds) || 0), 10, 3600);
    t.duration = sec; t.remaining = sec; t.running = false; t.endsAt = 0;
    if (a.auto !== undefined) t.auto = !!a.auto;
    return ok();
  } },
  speakTimerToggle: { perm: 'zeus', run(s, a, ctx) {
    const t = s.court.speakTimer;
    if (t.running) { t.remaining = Math.max(0, Math.round((t.endsAt - ctx.now) / 1000)); t.running = false; }
    else { if (!t.remaining) t.remaining = t.duration; t.endsAt = ctx.now + t.remaining * 1000; t.running = true; }
    return ok();
  } },
  speakTimerReset: { perm: 'zeus', run(s, a, ctx) { const t = s.court.speakTimer; t.remaining = t.duration; t.running = !!a.start; t.endsAt = a.start ? ctx.now + t.duration * 1000 : 0; return ok(); } },
  objection: { perm: 'zeus', run(s, a, ctx) {
    const c = s.court;
    // One click raises it: who objected is optional (the side opposite the speaker is assumed), and a new
    // objection simply replaces one still open.
    const by = a.by ? seat(c, a.by) : null; if (a.by && !by) return err('Unknown seat.');
    const speakerSide = seat(c, c.speaker)?.side;
    const side = by?.side || (speakerSide === 'prosecution' ? 'defence' : speakerSide === 'defence' ? 'prosecution' : null);
    // Pause the speaker's clock while the bench rules.
    const t = c.speakTimer; if (t.running) { t.remaining = Math.max(0, Math.round((t.endsAt - ctx.now) / 1000)); t.running = false; t.pausedBy = 'objection'; }
    c.objection = { id: newId(s, 'obj'), by: by?.id || null, side, against: c.speaker, grounds: String(a.grounds || OBJECTION_GROUNDS[0]).slice(0, 60), at: ctx.now, ruling: null, ruledAt: 0 };
    return ok();
  } },
  rule: { perm: 'zeus', run(s, a, ctx) {
    const c = s.court, o = c.objection;
    if (!o || o.ruling) return err('There is no open objection.');
    if (!['sustained', 'overruled'].includes(a.ruling)) return err('Sustained or overruled.');
    o.ruling = a.ruling; o.ruledAt = ctx.now;
    c.objections.push({ ...o });
    if (c.objections.length > 100) c.objections.shift();
    const side = o.side || seat(c, o.by)?.side;
    // A sustained objection tips the scales toward the objecting side.
    if (a.ruling === 'sustained' && (side === 'prosecution' || side === 'defence')) c.scales = clamp(c.scales + (side === 'prosecution' ? 1 : -1), -10, 10);
    const t = c.speakTimer; if (t.pausedBy === 'objection') { t.pausedBy = null; if (c.speaker) { t.endsAt = ctx.now + t.remaining * 1000; t.running = true; } }
    return ok();
  } },
  clearObjection: { perm: 'zeus', run(s) { s.court.objection = null; return ok(); } },
  addExhibit: { perm: 'zeus', run(s, a, ctx) {
    const c = s.court; if (c.exhibits.length >= 40) return err('Too many exhibits.');
    const side = a.side === 'defence' ? 'defence' : a.side === 'court' ? 'court' : 'prosecution';
    const letter = side === 'prosecution' ? 'P' : side === 'defence' ? 'D' : 'C';
    const n = c.exhibits.filter(e => e.side === side).length + 1;
    const img = typeof a.image === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(a.image) && a.image.length < 900_000 ? a.image : null;
    const ex = { id: newId(s, 'ex'), code: `${letter}-${n}`, side, title: String(a.title || 'Exhibit').slice(0, 80), text: String(a.text || '').slice(0, 1200), image: img, at: ctx.now, admitted: null };
    c.exhibits.push(ex); return ok({ exhibit: ex });
  } },
  editExhibit: { perm: 'zeus', run(s, a) {
    const ex = s.court.exhibits.find(e => e.id === a.id); if (!ex) return err('Unknown exhibit.');
    if (a.title !== undefined) ex.title = String(a.title).slice(0, 80);
    if (a.text !== undefined) ex.text = String(a.text).slice(0, 1200);
    if (a.admitted !== undefined) ex.admitted = a.admitted === null ? null : !!a.admitted;
    return ok();
  } },
  showExhibit: { perm: 'zeus', run(s, a, ctx) {
    const c = s.court;
    if (a.id && !c.exhibits.find(e => e.id === a.id)) return err('Unknown exhibit.');
    c.shownExhibit = a.id ? { id: a.id, at: ctx.now } : null; return ok();
  } },
  removeExhibit: { perm: 'zeus', run(s, a) { const c = s.court; c.exhibits = c.exhibits.filter(e => e.id !== a.id); if (c.shownExhibit?.id === a.id) c.shownExhibit = null; return ok(); } },
  setScales: { perm: 'zeus', run(s, a) { const c = s.court; c.scales = clamp(a.delta !== undefined ? c.scales + Number(a.delta) : Number(a.value) || 0, -10, 10); return ok(); } },
  verdictSet: { perm: 'zeus', run(s, a) {
    const v = s.court.verdict;
    if (a.text !== undefined) v.text = String(a.text).slice(0, 60);
    if (a.detail !== undefined) v.detail = String(a.detail).slice(0, 400);
    if (a.tone !== undefined) v.tone = ['guilty', 'innocent', 'neutral'].includes(a.tone) ? a.tone : 'neutral';
    return ok();
  } },
  verdictReveal: { perm: 'zeus', run(s, a, ctx) {
    const c = s.court; if (!c.verdict.text) return err('Write the verdict first.');
    startSpeaker(c, null, ctx.now);
    c.verdict.revealedAt = a.hide ? 0 : ctx.now;
    if (!a.hide) c.phase = c.phases.length - 1;
    return ok();
  } },
  gavel: { perm: 'zeus', run(s, a, ctx) { s.court.gavelAt = ctx.now; s.court.gavelText = String(a.text || 'ORDER').slice(0, 30); return ok(); } },
  recess: { perm: 'zeus', run(s, a, ctx) {
    const c = s.court; c.recess = a.value ? { at: ctx.now, label: String(a.label || 'Court is in recess').slice(0, 60) } : null;
    if (a.value) { startSpeaker(c, null, ctx.now); }
    return ok();
  } },
};
