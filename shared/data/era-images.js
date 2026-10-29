// Coats of arms and flags as they stood in March 1985, for the Cold War committee. The period files live in
// client/img/coats/cold85/ and client/img/flags/cold85/ (made by scripts/rasterize-cold-images.mjs from Wikimedia
// Commons); a country not listed keeps its modern one, because it has not changed since.
export const COLD_COATS = ['004', '008', '031', '051', '070', '100', '104', '112', '116', '124', '178', '180', '191', '203', '204', '231', '233', '268', '278', '348', '368', '398', '408', '417', '418', '428', '434', '440', '450', '470', '496', '498', '499', '508', '516', '524', '608', '616', '642', '643', '646', '688', '703', '705', '710', '760', '762', '784', '795', '804', '807', '854', '860', '862', '887'];
export const COLD_FLAGS = ['004', '008', '031', '051', '070', '100', '104', '112', '116', '178', '180', '191', '203', '204', '231', '233', '268', '368', '398', '417', '428', '434', '440', '496', '498', '499', '642', '643', '646', '688', '705', '710', '760', '762', '795', '804', '807', '860', '862', '887'];
// Lands that were part of another state in 1985 show that state's coat or flag.
export const COLD_COAT_OF = { '232': '231', '728': '729', XKX: '688' };
export const COLD_FLAG_OF = { '232': '231', '728': '729', XKX: '688', '703': '203', '516': '710' };

const coldCoats = new Set(COLD_COATS), coldFlags = new Set(COLD_FLAGS);
function pick(kind, id, era, set, of) {
  if (era !== 'cold85') return `/client/img/${kind}/${id}.webp`;
  const src = of[id] || id;
  return set.has(src) ? `/client/img/${kind}/cold85/${src}.webp` : `/client/img/${kind}/${src}.webp`;
}
export const coatUrl = (id, era) => pick('coats', id, era, coldCoats, COLD_COAT_OF);
export const flagUrl = (id, era) => pick('flags', id, era, coldFlags, COLD_FLAG_OF);
