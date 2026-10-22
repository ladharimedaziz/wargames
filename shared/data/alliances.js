// Real-world alliances and rivalries the simulation starts from (as of autumn 2026, from the latest reporting available).
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
  // Wars, rivalries and frozen conflicts.
  ['RUS', 'UKR', -90], ['ISR', 'IRN', -95], ['USA', 'IRN', -30], ['IND', 'PAK', -75], ['CHN', 'TWN', -60], ['PRK', 'KOR', -45],
  ['PRK', 'JPN', -20], ['PRK', 'USA', -30], ['SAU', 'IRN', -5], ['CHN', 'USA', -10], ['RUS', 'USA', -15], ['RUS', 'GBR', -25],
  ['ARM', 'AZE', -25], ['CHN', 'IND', -15], ['CHN', 'JPN', -15], ['GRC', 'TUR', -20], ['ISR', 'LBN', -55], ['ISR', 'SYR', -30],
  ['ISR', 'YEM', -70], ['USA', 'YEM', -40], ['USA', 'VEN', -70], ['USA', 'CUB', -45], ['MAR', 'DZA', -45], ['ETH', 'EGY', -30],
  ['ETH', '232', -35], ['RUS', 'POL', -20], ['RUS', 'EST', -15], ['RUS', 'LVA', -15], ['RUS', 'LTU', -15], ['RUS', 'FIN', -10],
  ['CHN', 'PHL', -30], ['CHN', 'VNM', -15], ['PAK', 'AFG', -55], ['THA', '116', -35], ['ISR', 'PSE', -80], ['ISR', 'TUR', -45],
  ['ISR', 'QAT', -40], ['ISR', 'EGY', -10], ['ISR', 'IRQ', -40], ['SYR', 'IRN', -35], ['AZE', 'RUS', -25], ['SRB', 'XKX', -40],
  ['COD', '646', -25], ['DZA', '466', -30], ['DZA', 'FRA', -20], ['VEN', '328', -35], ['IND', 'BGD', -15], ['GBR', 'IRN', -20],
  ['FRA', 'IRN', -20], ['DEU', 'IRN', -20], ['USA', 'ZAF', -20], ['USA', 'CAN', -10], ['USA', 'BRA', -10], ['USA', 'DNK', -10],
  ['IND', 'USA', -5], ['SDN', 'ARE', -30],
  // Partnerships.
  ['USA', 'ISR', 70], ['USA', 'GBR', 30], ['USA', 'TWN', 35], ['RUS', 'CHN', 50], ['RUS', 'IRN', 35], ['CHN', 'IRN', 30],
  ['RUS', 'PRK', 60], ['CHN', 'PAK', 55], ['IND', 'RUS', 30], ['TUR', 'AZE', 50], ['RUS', 'SRB', 30], ['UKR', 'POL', 30],
  ['SAU', 'PAK', 45], ['SAU', 'ARE', 25], ['SAU', 'EGY', 35], ['ARE', 'EGY', 30], ['FRA', 'DEU', 25], ['JPN', 'AUS', 30],
  ['IND', 'ARE', 30], ['SAU', 'USA', 45], ['ARE', 'USA', 35], ['QAT', 'USA', 35], ['RUS', 'BLR', 45], ['CHN', 'PRK', 30],
  ['IRN', 'YEM', 35], ['IRN', 'IRQ', 25], ['USA', 'UKR', 20], ['GBR', 'UKR', 40], ['FRA', 'UKR', 35], ['DEU', 'UKR', 35],
  ['TUR', 'SYR', 40], ['SAU', 'SYR', 30], ['QAT', 'SYR', 30], ['USA', 'SYR', 5], ['TUR', 'QAT', 35], ['HUN', 'RUS', 20],
  ['JPN', 'KOR', 15], ['PAK', 'TUR', 35], ['ISR', 'IND', 30], ['ISR', 'ARE', 15], ['SAU', 'CHN', 20], ['ARE', 'CHN', 20],
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
