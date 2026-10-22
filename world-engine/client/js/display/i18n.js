// Stage display strings in English and Arabic. 'both' shows English with Arabic beneath.
export const STR = {
  turn: ['Turn', 'الجولة'],
  tension: ['Global Tension', 'التوتر العالمي'],
  oil: ['Oil', 'النفط'],
  economy: ['World economy', 'الاقتصاد العالمي'],
  wars: ['Active wars', 'حروب قائمة'],
  refugees: ['Refugees', 'لاجئون'],
  flights: ['Flights airborne', 'رحلات في الجو'],
  ships: ['Ships at sea', 'سفن في البحر'],
  stranded: ['Ships waiting', 'سفن عالقة'],
  breaking: ['BREAKING', 'عاجل'],
  live: ['LIVE', 'مباشر'],
  calm: ['Calm', 'هدوء'], friction: ['Friction', 'احتكاك'], crisis: ['Crisis', 'أزمة'], confrontation: ['Confrontation', 'مواجهة'], brink: ['Brink', 'حافة الهاوية'],
  notDrill: ['THIS IS NOT A DRILL', 'هذا ليس تمريناً'],
  ww3: ['WORLD WAR III', 'الحرب العالمية الثالثة'],
  polls: ['Public opinion', 'الرأي العام'],
  support: ['Support', 'التأييد'],
  gdp: ['Economy', 'الاقتصاد'],
  relations: ['Relations', 'العلاقات'],
  allies: ['Allies', 'حلفاء'], rivals: ['Rivals', 'خصوم'],
  vote: ['United Nations', 'الأمم المتحدة'],
  yes: ['Yes', 'نعم'], no: ['No', 'لا'], abstain: ['Abstain', 'امتناع'],
  passed: ['ADOPTED', 'اعتُمد'], failed: ['REJECTED', 'رُفض'], vetoed: ['VETOED', 'فيتو'],
  treaty: ['Treaty', 'معاهدة'], signed: ['Signed', 'وُقِّع'], inForce: ['IN FORCE', 'نافذة'], awaiting: ['Awaiting signature', 'بانتظار التوقيع'],
  report: ['After-action report', 'تقرير ما بعد الأزمة'],
  awards: ['Awards', 'الجوائز'],
  standby: ['Standing by', 'في الانتظار'],
  pause: ['Prayer break', 'استراحة الصلاة'],
  resumes: ['The session will resume shortly', 'ستُستأنف الجلسة قريباً'],
  nations: ['nations', 'دولة'],
  delegates: ['delegations', 'وفود'],
  stakes: ['One world. No second chances.', 'عالم واحد. لا فرص ثانية.'],
  week: ['Week', 'الأسبوع'],
  phase: ['Phase', 'المرحلة'],
  speaking: ['Has the floor', 'الكلمة لـ'],
  upNext: ['Up next', 'التالي'],
  evidence: ['Evidence', 'الأدلة'],
  objection: ['OBJECTION!', 'اعتراض!'],
  sustained: ['SUSTAINED', 'مقبول'], overruled: ['OVERRULED', 'مرفوض'],
  verdict: ['The verdict', 'الحكم'],
  recess: ['Court is in recess', 'المحكمة في استراحة'],
  order: ['ORDER', 'نظام'],
  prosecution: ['Prosecution', 'الادعاء'], defence: ['Defence', 'الدفاع'],
  admitted: ['Admitted', 'مقبول'], struck: ['Struck', 'مستبعد'],
};

export function t(key, lang) {
  const s = STR[key]; if (!s) return key;
  return lang === 'ar' ? s[1] : s[0];
}
// Both languages for 'both' mode: [primary, secondary|null]
export function tt(key, lang) {
  const s = STR[key]; if (!s) return [key, null];
  if (lang === 'ar') return [s[1], null];
  if (lang === 'both') return [s[0], s[1]];
  return [s[0], null];
}
