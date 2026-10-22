// Automatic headlines in English and Arabic, generated from what happened in a turn.
import { SEA_ZONES } from '../data/places.js';
import { ALLIANCES } from '../data/alliances.js';
import { UNIT_TYPES } from './core.js';

const CAT_EN = { military: 'military targets', industry: 'factories', energy: 'power and oil sites', infrastructure: 'infrastructure', capital: 'the capital' };
const CAT_AR = { military: 'أهدافاً عسكرية', industry: 'مصانع', energy: 'منشآت الطاقة والنفط', infrastructure: 'البنية التحتية', capital: 'العاصمة' };
const KIND_EN = { grid: 'power grid', banks: 'banking system', radar: 'radar network' };
const KIND_AR = { grid: 'شبكة الكهرباء', banks: 'النظام المصرفي', radar: 'شبكة الرادار' };

export function headlinesFrom(state, ev) {
  const N = id => state.countries[id]?.name || SEA_ZONES[id]?.name || id;
  const A = id => state.countries[id]?.ar || SEA_ZONES[id]?.ar || id;
  const out = [];
  const push = (priority, en, ar, detail) => out.push({ priority, en, ar, detail });

  // Strikes grouped by attacker and target.
  const groups = {};
  for (const e of ev.filter(e => e.kind === 'strike')) (groups[`${e.owner}>${e.target}`] ||= []).push(e);
  for (const list of Object.values(groups)) {
    const { owner, target, category } = list[0];
    const hit = list.filter(e => !e.intercepted).length, shot = list.length - hit;
    const over = [...new Set(list.filter(e => e.intercepted && e.by !== target).map(e => e.by))];
    const types = [...new Set(list.map(e => e.unitType))];
    const what = types.includes('missile') && types.length === 1 ? 'missiles' : 'warplanes';
    const whatAr = what === 'missiles' ? 'صواريخ' : 'طائرات حربية';
    if (hit) push(4, `${N(owner)} ${what} strike ${CAT_EN[category] || 'targets'} in ${N(target)}${shot ? `; ${shot} of ${list.length} intercepted` : ''}`,
      `${whatAr} ${A(owner)} تضرب ${CAT_AR[category] || 'أهدافاً'} في ${A(target)}${shot ? ` واعتراض ${shot} من ${list.length}` : ''}`,
      over.length ? `Intercepted over ${over.map(N).join(', ')}.` : '');
    else push(3, `${N(owner)} attack on ${N(target)} fails: all ${list.length} ${what === 'missiles' ? 'missiles' : 'aircraft'} intercepted${over.length ? ` over ${over.map(N).join(', ')}` : ''}`,
      `فشل هجوم ${A(owner)} على ${A(target)}: اعتراض جميع ${whatAr}${over.length ? ` فوق ${over.map(A).join('، ')}` : ''}`);
  }
  // Grouped declarations: several countries joining a war against the same enemy in one turn.
  const warsBy = {};
  for (const e of ev.filter(e => e.kind === 'war')) (warsBy[e.b] ||= []).push(e.a);
  for (const [target, list] of Object.entries(warsBy)) {
    if (list.length < 3) continue;
    const names = list.slice(0, 3).map(N).join(', '), namesAr = list.slice(0, 3).map(A).join('، ');
    const more = list.length > 3 ? ` and ${list.length - 3} more` : '', moreAr = list.length > 3 ? ` و${list.length - 3} دول أخرى` : '';
    push(5, `BREAKING: ${names}${more} declare war on ${N(target)}`, `عاجل: ${namesAr}${moreAr} تعلن الحرب على ${A(target)}`);
  }
  const groupedWar = new Set(Object.entries(warsBy).filter(([, l]) => l.length >= 3).map(([t]) => t));
  const violBy = {};
  for (const e of ev.filter(e => e.kind === 'violation')) (violBy[e.by] ||= new Set()).add(e.over);
  for (const [by, set] of Object.entries(violBy)) {
    const list = [...set];
    push(2, `${list.slice(0, 4).map(N).join(', ')}${list.length > 4 ? ' and others' : ''} protest as ${N(by)} aircraft violate their airspace`,
      `${list.slice(0, 4).map(A).join('، ')} تحتج على انتهاك طائرات ${A(by)} لمجالها الجوي`);
  }
  const seen = new Set();
  for (const e of ev) {
    switch (e.kind) {
      case 'war': if (groupedWar.has(e.b)) break; push(5, `BREAKING: ${N(e.a)} declares war on ${N(e.b)}`, `عاجل: ${A(e.a)} تعلن الحرب على ${A(e.b)}`); break;
      case 'treaty_trigger': {
        const al = ALLIANCES[e.alliance] || { name: 'Treaty', ar: 'المعاهدة' };
        push(4, `${al.name} allies called to defend ${N(e.ally)} after attack by ${N(e.attacker)}`, `حلفاء ${al.ar} مدعوون للدفاع عن ${A(e.ally)} بعد هجوم ${A(e.attacker)}`); break;
      }
      case 'front': if (e.pct >= 100) break; push(4, e.pct > e.prev ? `${N(e.by)} forces advance deeper into ${N(e.country)}, now holding ${Math.round(e.pct)}% of its territory` : `${N(e.country)} pushes ${N(e.by)} back, retaking ground (${Math.round(e.pct)}% still held)`,
        e.pct > e.prev ? `قوات ${A(e.by)} تتقدم داخل ${A(e.country)} وتسيطر على ${Math.round(e.pct)}% من أراضيها` : `${A(e.country)} تصد ${A(e.by)} وتستعيد أراضي (${Math.round(e.pct)}% ما زالت محتلة)`); break;
      case 'ceasefire': push(4, `${N(e.a)} and ${N(e.b)} agree to a ceasefire`, `${A(e.a)} و${A(e.b)} تتفقان على وقف إطلاق النار`); break;
      case 'peace': push(5, `Peace treaty signed between ${N(e.a)} and ${N(e.b)}`, `توقيع معاهدة سلام بين ${A(e.a)} و${A(e.b)}`); break;
      case 'alliance': push(3, `${N(e.a)} and ${N(e.b)} announce a military alliance`, `${A(e.a)} و${A(e.b)} تعلنان تحالفاً عسكرياً`); break;
      case 'sanction': push(2, `${N(e.a)} imposes sanctions on ${N(e.b)}`, `${A(e.a)} تفرض عقوبات على ${A(e.b)}`); break;
      case 'unsanction': push(1, `${N(e.a)} lifts sanctions on ${N(e.b)}`, `${A(e.a)} ترفع العقوبات عن ${A(e.b)}`); break;
      case 'trade': push(1, `${N(e.a)} and ${N(e.b)} sign a trade deal`, `${A(e.a)} و${A(e.b)} توقعان اتفاقية تجارية`); break;
      case 'aid': push(2, `${N(e.a)} sends $${e.amount}bn in aid to ${N(e.b)}`, `${A(e.a)} ترسل مساعدات بقيمة ${e.amount} مليار دولار إلى ${A(e.b)}`); break;
      case 'arms': push(2, `${N(e.a)} transfers a ${UNIT_TYPES[e.unitType].name.toLowerCase()} to ${N(e.b)}`, `${A(e.a)} تنقل ${UNIT_TYPES[e.unitType].ar} إلى ${A(e.b)}`); break;
      case 'overflight': push(1, `${N(e.a)} opens its airspace and bases to ${N(e.b)}`, `${A(e.a)} تفتح مجالها الجوي وقواعدها أمام ${A(e.b)}`); break;
      case 'battle':
        if (e.result === 'won' && e.front && !e.occupied) break; // the front headline tells this story
        if (e.result === 'won') push(4, e.occupied ? `${N(e.attacker)} forces overrun ${N(e.defender)}` : `${N(e.attacker)} forces push into ${N(e.defender)}`, e.occupied ? `قوات ${A(e.attacker)} تجتاح ${A(e.defender)}` : `قوات ${A(e.attacker)} تتوغل في ${A(e.defender)}`);
        else push(4, `${N(e.defender)} repels ${N(e.attacker)} offensive`, `${A(e.defender)} تصد هجوم ${A(e.attacker)}`);
        break;
      case 'landing': push(4, e.contested ? `${N(e.owner)} troops storm the beaches of ${N(e.country)} under fire from its navy` : `${N(e.owner)} launches an amphibious landing on ${N(e.country)}`,
        e.contested ? `قوات ${A(e.owner)} تقتحم شواطئ ${A(e.country)} تحت نيران بحريتها` : `${A(e.owner)} تشن إنزالاً برمائياً على ${A(e.country)}`); break;
      case 'neo': push(e.danger ? 4 : 2, `${N(e.owner)} evacuates ${e.evacuees.toLocaleString('en-US')} citizens from ${N(e.country)}${e.zone ? ' by sea' : ''}`,
        `${A(e.owner)} تجلي ${e.evacuees.toLocaleString('en-US')} من مواطنيها من ${A(e.country)}${e.zone ? ' بحراً' : ''}`); break;
      case 'airdrop': push(5, `${N(e.owner)} paratroopers drop into ${N(e.country)}${e.lost ? `; ${e.lost} transport${e.lost > 1 ? 's' : ''} shot down on the way in` : ''}`,
        `مظليو ${A(e.owner)} يهبطون في ${A(e.country)}${e.lost ? ' وسط خسائر في طائرات النقل' : ''}`); break;
      case 'heli': if (e.mode === 'assault') push(4, e.lost ? `${N(e.target)} shoots down ${N(e.owner)} helicopters carrying troops behind its lines` : e.sea ? `${N(e.owner)} flies troops ashore in ${N(e.target)} by helicopter from its ships` : `${N(e.owner)} lands troops by helicopter deep behind ${N(e.target)}'s front`,
          e.lost ? `${A(e.target)} تسقط مروحيات ${A(e.owner)} المحملة بالجنود خلف خطوطها` : `${A(e.owner)} تنزل قوات بالمروحيات خلف خطوط ${A(e.target)}`);
        else push(e.lost ? 3 : 2, e.lost ? `${N(e.target)} downs ${N(e.owner)} attack helicopters` : `${N(e.owner)} attack helicopters hit ${N(e.target)} positions behind the front`,
          e.lost ? `${A(e.target)} تسقط مروحيات هجومية لـ${A(e.owner)}` : `مروحيات ${A(e.owner)} الهجومية تضرب مواقع ${A(e.target)} خلف الجبهة`); break;
      case 'civil_war': push(7, `BREAKING: Civil war erupts in ${N(e.country)} as ${N(e.rebels)} seize territory`, `عاجل: اندلاع حرب أهلية في ${A(e.country)} مع سيطرة ${A(e.rebels)} على أراضٍ`); break;
      case 'liberation': push(5, `${N(e.country)} breaks the ${N(e.from)} occupation`, `${A(e.country)} تكسر احتلال ${A(e.from)}`); break;
      case 'occupation': push(5, `${N(e.country)} under ${N(e.by)} occupation`, `${A(e.country)} تحت احتلال ${A(e.by)}`); break;
      case 'capitulation': push(5, `${N(e.country)} capitulates`, `${A(e.country)} تستسلم`); break;
      case 'siege': push(5, `${N(e.owner)} warships blockade the coast of ${N(e.target)}`, `سفن ${A(e.owner)} الحربية تفرض حصاراً على سواحل ${A(e.target)}`); break;
      case 'naval': push(4, `Naval battle in the ${SEA_ZONES[e.zone].name}: ${N(e.winner)} fleet prevails over ${N(e.loser)}`, `معركة بحرية في ${SEA_ZONES[e.zone].ar}: أسطول ${A(e.winner)} يتفوق على ${A(e.loser)}`); break;
      case 'chokepoint':
        if (e.status === 'closed') push(5, `${SEA_ZONES[e.zone].name} CLOSED by ${N(e.by)} blockade`, `إغلاق ${SEA_ZONES[e.zone].ar} بحصار من ${A(e.by)}`);
        else if (e.status === 'contested') push(4, `Warships clash for control of the ${SEA_ZONES[e.zone].name}`, `سفن حربية تتصارع للسيطرة على ${SEA_ZONES[e.zone].ar}`);
        else push(3, `${SEA_ZONES[e.zone].name} reopens to shipping`, `إعادة فتح ${SEA_ZONES[e.zone].ar} أمام الملاحة`);
        break;
      case 'cyber': if (e.detected) push(3, `${N(e.target)}'s ${KIND_EN[e.type]} hit by cyber attack traced to ${N(e.owner)}`, `هجوم إلكتروني على ${KIND_AR[e.type]} في ${A(e.target)} يُنسب إلى ${A(e.owner)}`); else push(3, `Mysterious cyber attack cripples ${N(e.target)}'s ${KIND_EN[e.type]}`, `هجوم إلكتروني غامض يشل ${KIND_AR[e.type]} في ${A(e.target)}`); break;
      case 'spy': if (e.detected) push(3, `${N(e.target)} exposes ${N(e.owner)} spy ring`, `${A(e.target)} تكشف شبكة تجسس تابعة لـ${A(e.owner)}`); else if (e.type === 'defector') push(3, `High-ranking official defects from ${N(e.target)}`, `انشقاق مسؤول رفيع من ${A(e.target)}`); else if (e.type === 'sabotage') push(2, `Explosion at ${N(e.target)} industrial site; cause unknown`, `انفجار في موقع صناعي في ${A(e.target)} والسبب مجهول`); break;
      case 'satellite': push(3, `${N(e.target)} loses contact with its satellites`, `${A(e.target)} تفقد الاتصال بأقمارها الصناعية`); break;
      case 'propaganda': if (e.backfire) push(2, `${N(e.owner)} disinformation campaign exposed`, `كشف حملة تضليل تابعة لـ${A(e.owner)}`); break;
      case 'alert': push(5, `${N(e.a)} places nuclear forces on high alert`, `${A(e.a)} تضع قواتها النووية في حالة تأهب قصوى`); break;
      case 'nuke': push(9, `NUCLEAR DETONATION in ${N(e.target)}. Launched by ${N(e.owner)}.`, `تفجير نووي في ${A(e.target)} أطلقته ${A(e.owner)}`); break;
      case 'election': push(3, e.outcome === 'ousted' ? `${N(e.a)} government voted out; new leadership calls for calm` : `${N(e.a)} government re-elected`, e.outcome === 'ousted' ? `سقوط حكومة ${A(e.a)} في الانتخابات والقيادة الجديدة تدعو للتهدئة` : `إعادة انتخاب حكومة ${A(e.a)}`); break;
      case 'oil': push(e.to > e.from ? 4 : 2, `Oil ${e.to > e.from ? 'soars' : 'falls'} to $${e.to} a barrel`, `النفط ${e.to > e.from ? 'يقفز' : 'يتراجع'} إلى ${e.to} دولاراً للبرميل`); break;
      case 'protest': push(2, `Mass protests in ${N(e.country)} as public support falls to ${e.support}%`, `احتجاجات واسعة في ${A(e.country)} مع تراجع التأييد إلى ${e.support}٪`); break;
      case 'no_confidence': push(4, `${N(e.country)} government faces no-confidence vote`, `حكومة ${A(e.country)} تواجه تصويتاً بحجب الثقة`); break;
      case 'bankrupt': push(4, `${N(e.country)} runs out of money; central bank prints to pay for the war`, `نفاد أموال ${A(e.country)} والبنك المركزي يطبع النقود لتمويل الحرب`); break;
      case 'refugees': push(2, `${e.millions}m refugees cross into ${N(e.country)}`, `${e.millions} مليون لاجئ يعبرون إلى ${A(e.country)}`); break;
      case 'recession': push(4, `World economy ${e.level >= 0.9 ? 'slides into recession' : e.level >= 0.7 ? 'in deep depression' : 'in freefall'}: global output down ${Math.round((1 - e.index) * 100)}%`, `الاقتصاد العالمي ${e.level >= 0.9 ? 'ينزلق إلى الركود' : e.level >= 0.7 ? 'في كساد عميق' : 'في سقوط حر'}: الناتج العالمي ينخفض ${Math.round((1 - e.index) * 100)}٪`); break;
      case 'ai_join': push(4, `${N(e.country)} abandons neutrality and joins the ${state.blocs[e.bloc].name}`, `${A(e.country)} تتخلى عن الحياد وتنضم إلى ${state.blocs[e.bloc].ar}`); break;
      case 'ceasefire_offer': push(3, `${N(e.country)} signals it is ready to talk to ${N(e.to)}`, `${A(e.country)} تلمح إلى استعدادها للتفاوض مع ${A(e.to)}`); break;
      case 'tension': if (e.to > e.from) push(3, `World on edge: Global Tension rises to ${e.to}`, `العالم على حافة الهاوية: التوتر العالمي يرتفع إلى ${e.to}`); break;
      case 'scrubbed': push(1, `Storms ground ${N(e.owner)} aircraft`, `العواصف تمنع طائرات ${A(e.owner)} من الإقلاع`); break;
    }
  }
  return out.sort((a, b) => b.priority - a.priority);
}
