// Country dataset for the World Engine. Figures are rounded approximations for gameplay, not official statistics.
// Columns: id | alpha3 | name | Arabic name | GDP ($bn) | population (m) | capital lat | capital lon |
//          army groups | fighter wings | bomber wings | fleets | carriers | missile batteries |
//          air defence (0-10) | nuclear (0/1) | oil net (mb/d, + exporter, - importer) | alliances | flags
// Flags: S = stealth bombers, P = permanent UN Security Council member (veto)
const RAW = `
840|USA|United States|الولايات المتحدة|28000|335|38.9|-77.04|9|14|3|7|4|3|8|1|1.5|NATO,USPAC|SP
124|CAN|Canada|كندا|2200|40|45.42|-75.7|1|2|0|1|0|0|5|0|4|NATO|
484|MEX|Mexico|المكسيك|1800|129|19.43|-99.13|2|1|0|1|0|0|3|0|0.4||
076|BRA|Brazil|البرازيل|2200|216|-15.79|-47.88|3|2|0|2|0|0|4|0|1.2||
032|ARG|Argentina|الأرجنتين|640|46|-34.6|-58.38|1|1|0|1|0|0|3|0|0.2||
152|CHL|Chile|تشيلي|340|20|-33.45|-70.67|1|1|0|1|0|0|3|0|-0.3||
170|COL|Colombia|كولومبيا|360|52|4.71|-74.07|2|1|0|1|0|0|3|0|0.4||
862|VEN|Venezuela|فنزويلا|100|28|10.48|-66.9|1|1|0|1|0|0|4|0|0.6||
604|PER|Peru|بيرو|270|34|-12.05|-77.04|1|1|0|1|0|0|3|0|-0.1||
192|CUB|Cuba|كوبا|110|11|23.11|-82.37|1|0|0|0|0|0|3|0|-0.1||
826|GBR|United Kingdom|المملكة المتحدة|3500|68|51.51|-0.13|2|4|0|3|1|1|7|1|-0.6|NATO,EU0|P
250|FRA|France|فرنسا|3100|68|48.86|2.35|2|4|0|3|1|1|7|1|-1.4|NATO,EU|P
276|DEU|Germany|ألمانيا|4500|84|52.52|13.4|2|3|0|1|0|0|6|0|-2.1|NATO,EU|
380|ITA|Italy|إيطاليا|2300|59|41.9|12.5|2|3|0|2|1|0|6|0|-1.1|NATO,EU|
724|ESP|Spain|إسبانيا|1600|48|40.42|-3.7|1|2|0|1|1|0|5|0|-1.2|NATO,EU|
620|PRT|Portugal|البرتغال|290|10|38.72|-9.14|1|1|0|1|0|0|4|0|-0.2|NATO,EU|
528|NLD|Netherlands|هولندا|1100|18|52.37|4.9|1|1|0|1|0|0|5|0|-0.8|NATO,EU|
056|BEL|Belgium|بلجيكا|650|12|50.85|4.35|1|1|0|0|0|0|4|0|-0.6|NATO,EU|
616|POL|Poland|بولندا|850|37|52.23|21.01|3|2|0|1|0|1|6|0|-0.6|NATO,EU|
804|UKR|Ukraine|أوكرانيا|180|37|50.45|30.52|5|1|0|0|0|1|6|0|-0.2||
112|BLR|Belarus|بيلاروسيا|70|9|53.9|27.57|1|1|0|0|0|0|5|0|-0.1|CSTO|
643|RUS|Russia|روسيا|2000|144|55.76|37.62|8|10|2|4|1|4|9|1|7|CSTO,SCO|P
752|SWE|Sweden|السويد|600|10.5|59.33|18.07|1|2|0|1|0|0|6|0|-0.3|NATO,EU|
578|NOR|Norway|النرويج|480|5.5|59.91|10.75|1|1|0|1|0|0|6|0|1.8|NATO|
246|FIN|Finland|فنلندا|300|5.6|60.17|24.94|2|1|0|0|0|0|6|0|-0.2|NATO,EU|
208|DNK|Denmark|الدنمارك|400|6|55.68|12.57|1|1|0|1|0|0|5|0|0|NATO,EU|
372|IRL|Ireland|أيرلندا|550|5.3|53.35|-6.26|0|0|0|0|0|0|2|0|-0.1|EU|
040|AUT|Austria|النمسا|520|9.1|48.21|16.37|1|1|0|0|0|0|4|0|-0.2|EU|
756|CHE|Switzerland|سويسرا|900|8.9|46.95|7.45|1|1|0|0|0|0|6|0|-0.2||
203|CZE|Czechia|التشيك|340|10.5|50.08|14.44|1|1|0|0|0|0|4|0|-0.2|NATO,EU|
703|SVK|Slovakia|سلوفاكيا|140|5.4|48.15|17.11|1|0|0|0|0|0|3|0|-0.1|NATO,EU|
348|HUN|Hungary|المجر|220|9.6|47.5|19.04|1|1|0|0|0|0|3|0|-0.1|NATO,EU|
642|ROU|Romania|رومانيا|350|19|44.43|26.1|2|1|0|1|0|0|4|0|-0.1|NATO,EU|
100|BGR|Bulgaria|بلغاريا|100|6.4|42.7|23.32|1|1|0|1|0|0|3|0|-0.1|NATO,EU|
300|GRC|Greece|اليونان|240|10.4|37.98|23.73|2|2|0|1|0|0|6|0|-0.3|NATO,EU|
792|TUR|Turkey|تركيا|1100|86|39.93|32.86|4|3|0|2|0|1|6|0|-1|NATO|
688|SRB|Serbia|صربيا|80|6.7|44.79|20.45|1|0|0|0|0|0|4|0|-0.1||
191|HRV|Croatia|كرواتيا|85|3.9|45.81|15.98|1|0|0|0|0|0|3|0|0|NATO,EU|
233|EST|Estonia|إستونيا|40|1.3|59.44|24.75|0|0|0|0|0|0|3|0|0|NATO,EU|
428|LVA|Latvia|لاتفيا|43|1.9|56.95|24.11|0|0|0|0|0|0|3|0|0|NATO,EU|
440|LTU|Lithuania|ليتوانيا|80|2.8|54.69|25.28|0|0|0|0|0|0|3|0|0|NATO,EU|
498|MDA|Moldova|مولدوفا|17|2.5|47.01|28.86|0|0|0|0|0|0|1|0|0||
682|SAU|Saudi Arabia|المملكة العربية السعودية|1100|36|24.71|46.68|3|4|0|2|0|1|7|0|9|GCC,AL|
784|ARE|United Arab Emirates|الإمارات العربية المتحدة|520|10|24.45|54.38|1|2|0|1|0|0|7|0|3.2|GCC,AL|
634|QAT|Qatar|قطر|240|2.7|25.29|51.53|0|1|0|0|0|0|5|0|1.3|GCC,AL|
414|KWT|Kuwait|الكويت|160|4.3|29.37|47.98|0|1|0|0|0|0|5|0|2.4|GCC,AL|
048|BHR|Bahrain|البحرين|45|1.5|26.23|50.59|0|0|0|0|0|0|4|0|0.1|GCC,AL|
512|OMN|Oman|عُمان|110|4.6|23.59|58.41|1|1|0|1|0|0|4|0|0.9|GCC,AL|
887|YEM|Yemen|اليمن|20|34|15.37|44.19|1|0|0|0|0|1|1|0|0|AL|
364|IRN|Iran|إيران|400|89|35.69|51.39|5|2|0|2|0|3|6|0|1.6|SCO|
368|IRQ|Iraq|العراق|260|45|33.31|44.37|2|1|0|0|0|0|3|0|3.4|AL|
760|SYR|Syria|سوريا|20|23|33.51|36.29|1|1|0|0|0|0|3|0|0|AL|
400|JOR|Jordan|الأردن|50|11|31.95|35.93|1|1|0|0|0|0|4|0|-0.1|AL|
422|LBN|Lebanon|لبنان|20|5.5|33.89|35.5|0|0|0|0|0|0|1|0|-0.1|AL|
376|ISR|Israel|إسرائيل|520|9.8|31.78|35.22|2|3|0|1|0|1|9|1|-0.3||
275|PSE|Palestine|فلسطين|18|5.4|31.9|35.2|0|0|0|0|0|0|0|0|0|AL|
818|EGY|Egypt|مصر|400|112|30.04|31.24|4|3|0|2|0|0|6|0|-0.1|AL|
434|LBY|Libya|ليبيا|45|7|32.89|13.19|1|0|0|0|0|0|2|0|1|AL|
012|DZA|Algeria|الجزائر|240|46|36.75|3.06|2|2|0|1|0|0|5|0|0.6|AL|
504|MAR|Morocco|المغرب|140|37|34.02|-6.84|2|1|0|1|0|0|4|0|-0.3|AL|
788|TUN|Tunisia|تونس|50|12|36.81|10.18|1|0|0|0|0|0|2|0|0|AL|
729|SDN|Sudan|السودان|30|48|15.5|32.56|1|0|0|0|0|0|1|0|0|AL|
356|IND|India|الهند|3900|1430|28.61|77.21|8|7|0|3|1|2|7|1|-4.8|SCO,QUAD|
586|PAK|Pakistan|باكستان|340|240|33.68|73.05|4|3|0|1|0|2|5|1|-0.4|SCO|
004|AFG|Afghanistan|أفغانستان|15|41|34.53|69.17|1|0|0|0|0|0|0|0|0||
156|CHN|China|الصين|18500|1410|39.9|116.4|9|12|2|6|2|4|8|1|-11|SCO|SP
408|PRK|North Korea|كوريا الشمالية|20|26|39.02|125.75|5|1|0|1|0|2|5|1|0||
410|KOR|South Korea|كوريا الجنوبية|1800|52|37.57|126.98|4|4|0|2|0|1|7|0|-2.5|USPAC|
392|JPN|Japan|اليابان|4200|124|35.68|139.69|2|4|0|3|0|1|8|0|-3.3|USPAC,QUAD|
158|TWN|Taiwan|تايوان|790|23|25.03|121.56|2|3|0|1|0|1|7|0|-1||
496|MNG|Mongolia|منغوليا|20|3.4|47.92|106.92|0|0|0|0|0|0|1|0|0||
398|KAZ|Kazakhstan|كازاخستان|260|20|51.17|71.45|1|1|0|0|0|0|4|0|1.6|CSTO,SCO|
860|UZB|Uzbekistan|أوزبكستان|90|36|41.31|69.28|1|0|0|0|0|0|3|0|0|SCO|
704|VNM|Vietnam|فيتنام|430|100|21.03|105.85|4|1|0|1|0|0|5|0|-0.3||
764|THA|Thailand|تايلاند|510|72|13.76|100.5|2|1|0|1|0|0|4|0|-0.9||
360|IDN|Indonesia|إندونيسيا|1400|278|-6.21|106.85|3|1|0|2|0|0|4|0|-0.9|QUAD0|
458|MYS|Malaysia|ماليزيا|420|34|3.14|101.69|1|1|0|1|0|0|4|0|0.1||
608|PHL|Philippines|الفلبين|440|117|14.6|120.98|1|1|0|1|0|0|3|0|-0.4|USPAC|
104|MMR|Myanmar|ميانمار|65|54|19.76|96.08|2|0|0|0|0|0|3|0|0||
050|BGD|Bangladesh|بنغلاديش|450|173|23.81|90.41|2|0|0|1|0|0|3|0|-0.1||
144|LKA|Sri Lanka|سريلانكا|85|22|6.93|79.85|1|0|0|0|0|0|2|0|0||
702|SGP|Singapore|سنغافورة|500|5.9|1.35|103.82|0|1|0|1|0|0|7|0|-1.4||
036|AUS|Australia|أستراليا|1700|27|-35.28|149.13|1|2|0|2|0|0|6|0|-0.6|USPAC,QUAD|
554|NZL|New Zealand|نيوزيلندا|250|5.2|-41.29|174.78|0|0|0|1|0|0|3|0|-0.1||
566|NGA|Nigeria|نيجيريا|360|224|9.08|7.4|2|0|0|1|0|0|2|0|1.2||
231|ETH|Ethiopia|إثيوبيا|160|127|9.03|38.74|3|0|0|0|0|0|2|0|-0.1||
710|ZAF|South Africa|جنوب أفريقيا|380|60|-25.75|28.19|1|1|0|1|0|0|4|0|-0.4||
404|KEN|Kenya|كينيا|110|55|-1.29|36.82|1|0|0|0|0|0|2|0|-0.1||
024|AGO|Angola|أنغولا|90|36|-8.84|13.23|1|0|0|0|0|0|2|0|1.1||
180|COD|DR Congo|الكونغو الديمقراطية|65|102|-4.44|15.27|1|0|0|0|0|0|1|0|0||
031|AZE|Azerbaijan|أذربيجان|75|10|40.41|49.87|1|0|0|0|0|0|4|0|0.6||
051|ARM|Armenia|أرمينيا|24|2.8|40.18|44.51|1|0|0|0|0|0|4|0|0|CSTO|
268|GEO|Georgia|جورجيا|30|3.7|41.72|44.79|0|0|0|0|0|0|3|0|0||
352|ISL|Iceland|آيسلندا|30|0.4|64.15|-21.94|0|0|0|0|0|0|1|0|0|NATO|
196|CYP|Cyprus|قبرص|33|1.3|35.17|33.36|0|0|0|0|0|0|3|0|0|EU|
470|MLT|Malta|مالطا|22|0.5|35.9|14.51|0|0|0|0|0|0|1|0|0|EU|
`;

// Minor countries (everything else in the atlas) get sensible defaults by size class.
const MINOR_AR = {
  '706': 'الصومال', '262': 'جيبوتي', '232': 'إريتريا', '478': 'موريتانيا', '174': 'جزر القمر', '728': 'جنوب السودان',
  '148': 'تشاد', '562': 'النيجر', '466': 'مالي', '686': 'السنغال', '800': 'أوغندا', '834': 'تنزانيا', '795': 'تركمانستان',
  '762': 'طاجيكستان', '417': 'قيرغيزستان', '524': 'نيبال', '064': 'بوتان', '418': 'لاوس', '116': 'كمبوديا', '096': 'بروناي',
  '598': 'بابوا غينيا الجديدة', '304': 'غرينلاند', '732': 'الصحراء الغربية', '218': 'الإكوادور', '068': 'بوليفيا', '600': 'باراغواي',
  '858': 'الأوروغواي', '508': 'موزمبيق', '716': 'زيمبابوي', '894': 'زامبيا', '072': 'بوتسوانا', '516': 'ناميبيا', '450': 'مدغشقر',
  '120': 'الكاميرون', '288': 'غانا', '384': 'ساحل العاج', '008': 'ألبانيا', '807': 'مقدونيا الشمالية', '070': 'البوسنة والهرسك',
  '499': 'الجبل الأسود', '705': 'سلوفينيا', '442': 'لوكسمبورغ', '462': 'جزر المالديف', '480': 'موريشيوس', '690': 'سيشل',
  'XKX': 'كوسوفو',
};

const ALLIANCE_NAMES = {
  NATO: 'NATO', EU: 'European Union', CSTO: 'CSTO', SCO: 'Shanghai Cooperation Org.', GCC: 'Gulf Cooperation Council',
  AL: 'Arab League', USPAC: 'US Pacific treaties', QUAD: 'The Quad',
};

export const MISSILE_RANGE_KM = { '643': 2500, '156': 3000, '840': 1800, '364': 2000, '408': 1500, '376': 1500, '356': 2000, '586': 1500, '682': 2600, '826': 1600, '250': 1600, '792': 1000, '887': 1500, '410': 800, '392': 1000, '158': 1000, '616': 300, '804': 600 };

export const COUNTRIES = {};
for (const line of RAW.trim().split('\n')) {
  const [id, a3, name, ar, gdp, pop, lat, lon, armies, fighters, bombers, fleets, carriers, missiles, ad, nuclear, oil, alliances, flags] = line.split('|');
  COUNTRIES[id] = {
    id, a3, name, ar, gdp: +gdp, pop: +pop, lat: +lat, lon: +lon,
    forces: { army: +armies, fighter: +fighters, bomber: +bombers, fleet: +fleets, carrier: +carriers, missile: +missiles },
    airDefense: +ad, nuclear: nuclear === '1', oilNet: +oil,
    alliances: alliances ? alliances.split(',').filter(a => ALLIANCE_NAMES[a]) : [],
    stealth: (flags || '').includes('S'), veto: (flags || '').includes('P'), major: true,
  };
}

export function minorCountry(id, name) {
  return {
    id, a3: id, name, ar: MINOR_AR[id] || name, gdp: 12, pop: 3, lat: null, lon: null,
    forces: { army: 0, fighter: 0, bomber: 0, fleet: 0, carrier: 0, missile: 0 },
    airDefense: 1, nuclear: false, oilNet: 0, alliances: [], stealth: false, veto: false, major: false,
  };
}

export { ALLIANCE_NAMES };

// Common names, abbreviations and demonyms used by the quick command bar.
export const ALIASES = {
  us: '840', usa: '840', america: '840', 'united states': '840', american: '840', states: '840',
  uk: '826', britain: '826', 'great britain': '826', england: '826', british: '826',
  russia: '643', russian: '643', rf: '643', china: '156', chinese: '156', prc: '156',
  saudi: '682', ksa: '682', 'saudi arabia': '682', uae: '784', emirates: '784', iran: '364', iranian: '364',
  'north korea': '408', dprk: '408', nk: '408', 'south korea': '410', rok: '410', korea: '410',
  france: '250', french: '250', germany: '276', german: '276', japan: '392', japanese: '392', india: '356', indian: '356',
  turkey: '792', turkiye: '792', israel: '376', egypt: '818', pakistan: '586', taiwan: '158', ukraine: '804',
  poland: '616', italy: '380', spain: '724', canada: '124', australia: '036', brazil: '076', mexico: '484',
  qatar: '634', kuwait: '414', oman: '512', bahrain: '048', yemen: '887', iraq: '368', syria: '760', jordan: '400',
  lebanon: '422', palestine: '275', libya: '434', algeria: '012', morocco: '504', sudan: '729', belarus: '112',
  netherlands: '528', holland: '528', belgium: '056', sweden: '752', norway: '578', finland: '246', denmark: '208',
  greece: '300', romania: '642', vietnam: '704', philippines: '608', indonesia: '360', singapore: '702', kazakhstan: '398',
};
