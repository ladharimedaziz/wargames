// Real-world alliances and rivalries the simulation starts from (as of late 2025).
// binding: a mutual-defence commitment; AI members may join a member's defensive war.
// hub: a hub-and-spoke arrangement. Only pairs that include the hub count as allied (US partners are not allied to each other).
// Members are ISO alpha-3 codes for countries in the main dataset, or ISO numeric ids for smaller ones.
import { COUNTRIES } from './countries.js';

export const ALLIANCES = {
  NATO: { name: 'NATO', ar: 'حلف الناتو', binding: true, members: 'USA CAN GBR FRA DEU ITA ESP PRT NLD BEL 442 DNK NOR ISL TUR GRC POL CZE SVK HUN ROU BGR HRV 705 008 499 807 EST LVA LTU FIN SWE' },
  EU: { name: 'European Union', ar: 'الاتحاد الأوروبي', binding: true, members: 'AUT BEL BGR HRV CYP CZE DNK EST FIN FRA DEU GRC HUN IRL ITA LVA LTU 442 MLT NLD POL PRT ROU SVK 705 ESP SWE' },
  CSTO: { name: 'CSTO', ar: 'منظمة معاهدة الأمن الجماعي', binding: true, members: 'RUS BLR KAZ 417 762' },
  UNION: { name: 'Union State', ar: 'دولة الاتحاد', binding: true, members: 'RUS BLR' },
  GCC: { name: 'Gulf Cooperation Council', ar: 'مجلس التعاون الخليجي', binding: true, members: 'SAU ARE QAT KWT BHR OMN' },
  SAPK: { name: 'Saudi–Pakistan Defence Pact', ar: 'اتفاقية الدفاع السعودية الباكستانية', binding: true, members: 'SAU PAK' },
  RIO: { name: 'Rio Treaty', ar: 'معاهدة ريو', binding: true, members: 'USA ARG BRA CHL COL PER 044 188 214 222 320 332 340 591 600 780 858' },
  ANZUS: { name: 'ANZUS', ar: 'معاهدة أنزوس', binding: true, members: 'USA AUS NZL' },
  USJPN: { name: 'US–Japan Security Treaty', ar: 'المعاهدة الأمنية الأمريكية اليابانية', binding: true, members: 'USA JPN' },
  USKOR: { name: 'US–South Korea Defence Treaty', ar: 'معاهدة الدفاع الأمريكية الكورية', binding: true, members: 'USA KOR' },
  USPHL: { name: 'US–Philippines Defence Treaty', ar: 'معاهدة الدفاع الأمريكية الفلبينية', binding: true, members: 'USA PHL' },
  USTHA: { name: 'US–Thailand Alliance', ar: 'التحالف الأمريكي التايلاندي', binding: true, members: 'USA THA' },
  RUPRK: { name: 'Russia–North Korea Treaty', ar: 'المعاهدة الروسية الكورية الشمالية', binding: true, members: 'RUS PRK' },
  CNPRK: { name: 'China–North Korea Treaty', ar: 'المعاهدة الصينية الكورية الشمالية', binding: true, members: 'CHN PRK' },
  TURAZE: { name: 'Shusha Declaration', ar: 'إعلان شوشا', binding: true, members: 'TUR AZE' },
  AL: { name: 'Arab League', ar: 'جامعة الدول العربية', binding: false, members: 'DZA BHR 174 262 EGY IRQ JOR KWT LBN LBY 478 MAR OMN PSE QAT SAU 706 SDN SYR TUN ARE YEM' },
  SCO: { name: 'Shanghai Cooperation Org.', ar: 'منظمة شنغهاي للتعاون', binding: false, members: 'CHN RUS IND PAK IRN KAZ 417 762 UZB BLR' },
  BRICS: { name: 'BRICS', ar: 'بريكس', binding: false, members: 'BRA RUS IND CHN ZAF EGY ETH IRN ARE IDN' },
  ASEAN: { name: 'ASEAN', ar: 'آسيان', binding: false, members: '096 116 IDN 418 MYS MMR PHL SGP THA VNM 626' },
  QUAD: { name: 'The Quad', ar: 'الحوار الرباعي', binding: false, members: 'USA JPN IND AUS' },
  AUKUS: { name: 'AUKUS', ar: 'أوكوس', binding: false, members: 'AUS GBR USA' },
  FVEY: { name: 'Five Eyes', ar: 'العيون الخمس', binding: false, members: 'USA GBR CAN AUS NZL' },
  MNNA: { name: 'Major non-NATO ally', ar: 'حليف رئيسي من خارج الناتو', binding: false, hub: 'USA', members: 'USA ARG AUS BHR BRA COL EGY ISR JPN JOR KEN KWT MAR NZL PAK PHL QAT KOR THA TUN TWN' },
  RUIRN: { name: 'Russia–Iran Partnership', ar: 'الشراكة الروسية الإيرانية', binding: false, members: 'RUS IRN' },
  CNPAK: { name: 'China–Pakistan Partnership', ar: 'الشراكة الصينية الباكستانية', binding: false, members: 'CHN PAK' },
  TRA: { name: 'Taiwan Relations Act', ar: 'قانون العلاقات مع تايوان', binding: false, members: 'USA TWN' },
};

// Starting relations for well-known pairs, added on top of alliances and blocs (-100 to 100).
// Pairs across the Western/Eastern blocs already start 55 lower, so their figures here are smaller.
const RELATIONS = [
  ['ISR', 'IRN', -85], ['IND', 'PAK', -65], ['CHN', 'TWN', -60], ['PRK', 'KOR', -40], ['PRK', 'JPN', -15], ['PRK', 'USA', -30],
  ['RUS', 'UKR', -90], ['USA', 'IRN', -20], ['SAU', 'IRN', -15], ['CHN', 'USA', -5], ['RUS', 'USA', -20], ['RUS', 'GBR', -20],
  ['ARM', 'AZE', -55], ['CHN', 'IND', -30], ['CHN', 'JPN', -5], ['GRC', 'TUR', -25], ['ISR', 'LBN', -50], ['ISR', 'SYR', -35],
  ['ISR', 'YEM', -60], ['USA', 'VEN', -50], ['USA', 'CUB', -45], ['MAR', 'DZA', -45], ['ETH', 'EGY', -30], ['RUS', 'POL', -15],
  ['RUS', 'EST', -10], ['RUS', 'LVA', -10], ['RUS', 'LTU', -10], ['CHN', 'PHL', -5], ['CHN', 'VNM', -15], ['PAK', 'AFG', -30],
  ['USA', 'ISR', 70], ['USA', 'GBR', 30], ['USA', 'TWN', 35], ['RUS', 'CHN', 45], ['RUS', 'IRN', 40], ['CHN', 'IRN', 30],
  ['RUS', 'PRK', 50], ['CHN', 'PAK', 55], ['IND', 'RUS', 25], ['TUR', 'AZE', 45], ['RUS', 'SRB', 35], ['UKR', 'POL', 35],
  ['SAU', 'PAK', 40], ['SAU', 'ARE', 30], ['SAU', 'EGY', 35], ['ARE', 'EGY', 30], ['FRA', 'DEU', 25], ['JPN', 'AUS', 30],
  ['IND', 'ARE', 25], ['SAU', 'USA', 35], ['ARE', 'USA', 30], ['RUS', 'BLR', 40], ['CHN', 'PRK', 30], ['IRN', 'YEM', 35],
  ['IRN', 'IRQ', 25], ['USA', 'UKR', 25], ['GBR', 'UKR', 35],
];

export const DEFAULT_BLOCS = {
  A: 'USA CAN GBR FRA DEU ITA ESP PRT NLD BEL 442 DNK NOR ISL TUR GRC POL CZE SVK HUN ROU BGR HRV 705 008 499 807 EST LVA LTU FIN SWE JPN KOR AUS NZL PHL',
  B: 'RUS CHN IRN PRK BLR',
};

const byA3 = new Map(Object.values(COUNTRIES).map(c => [c.a3, c.id]));
const idOf = code => byA3.get(code) || code;
const split = s => s.split(/\s+/).filter(Boolean).map(idOf);

export const ALLIANCE_MEMBERS = Object.fromEntries(Object.entries(ALLIANCES).map(([k, a]) => [k, new Set(split(a.members))]));
const HUB_ID = Object.fromEntries(Object.entries(ALLIANCES).filter(([, a]) => a.hub).map(([k, a]) => [k, idOf(a.hub)]));

export function alliancesOf(id) {
  return Object.keys(ALLIANCES).filter(k => ALLIANCE_MEMBERS[k].has(id));
}

// Alliance codes two countries share, honouring hub-and-spoke arrangements.
export function sharedAlliances(A, B) {
  if (!A?.alliances || !B?.alliances) return [];
  return A.alliances.filter(k => B.alliances.includes(k) && (!HUB_ID[k] || A.id === HUB_ID[k] || B.id === HUB_ID[k]));
}

export const BASE_RELATIONS = Object.fromEntries(RELATIONS.map(([a, b, v]) => {
  const x = idOf(a), y = idOf(b);
  return [x < y ? `${x}|${y}` : `${y}|${x}`, v];
}));

export function defaultBloc(id) {
  for (const [bloc, list] of Object.entries(DEFAULT_BLOCS)) if (split(list).includes(id)) return bloc;
  return 'N';
}
