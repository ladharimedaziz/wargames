// Geography for the World Engine: sea zones, chokepoints, airports and atlas id fixes.

// Dependent territories are drawn in their sovereign's colours and count as that country.
export const PARENT = {
  '304': '208', '234': '208', '630': '840', '316': '840', '850': '840', '016': '840', '580': '840',
  '238': '826', '060': '826', '136': '826', '092': '826', '796': '826', '500': '826', '660': '826', '654': '826',
  '612': '826', '086': '826', '239': '826', '832': '826', '831': '826', '833': '826',
  '540': '250', '258': '250', '260': '250', '666': '250', '876': '250', '663': '250', '652': '250',
  '533': '528', '531': '528', '534': '528', '248': '246', '446': '156', '344': '156',
  '574': '036', '334': '036', '184': '554', '570': '554',
};

// Atlas features that ship without an id.
export const NAMED_IDS = { 'Somaliland': '706', 'Kosovo': 'XKX', 'N. Cyprus': '196', 'Indian Ocean Ter.': '036', 'Siachen Glacier': '356' };

// Never playable or drawn as a country.
export const SKIP_IDS = new Set(['010']);

export function featureCountryId(f) {
  let id = f.id ?? NAMED_IDS[f.properties?.name];
  if (!id || SKIP_IDS.has(id)) return null;
  return PARENT[id] || id;
}

// Sea zones. `n` = neighbouring zones, `coasts` = countries with a shore on the zone, `choke` = strategic chokepoint.
// Oil weight is how much closing the chokepoint moves the world oil price ($/barrel when fully closed).
export const SEA_ZONES = {
  persian_gulf:  { name: 'Persian Gulf', ar: 'الخليج العربي', lat: 27.2, lon: 51.3, n: ['hormuz'], coasts: ['682', '784', '634', '414', '048', '364', '368'] },
  hormuz:        { name: 'Strait of Hormuz', ar: 'مضيق هرمز', lat: 26.4, lon: 56.6, n: ['persian_gulf', 'arabian_sea'], coasts: ['364', '512', '784'], choke: true, oil: 48 },
  arabian_sea:   { name: 'Arabian Sea', ar: 'بحر العرب', lat: 17, lon: 63, n: ['hormuz', 'gulf_aden', 'indian_ocean'], coasts: ['512', '586', '356', '364'] },
  gulf_aden:     { name: 'Gulf of Aden', ar: 'خليج عدن', lat: 12.6, lon: 48.5, n: ['arabian_sea', 'bab'], coasts: ['887', '706', '262'] },
  bab:           { name: 'Bab el-Mandeb', ar: 'باب المندب', lat: 12.6, lon: 43.4, n: ['gulf_aden', 'red_sea'], coasts: ['887', '262', '232'], choke: true, oil: 14 },
  red_sea:       { name: 'Red Sea', ar: 'البحر الأحمر', lat: 21, lon: 38.4, n: ['bab', 'suez'], coasts: ['682', '818', '729', '232', '887', '400'] },
  suez:          { name: 'Suez Canal', ar: 'قناة السويس', lat: 30.4, lon: 32.4, n: ['red_sea', 'east_med'], coasts: ['818'], choke: true, oil: 10 },
  east_med:      { name: 'Eastern Mediterranean', ar: 'شرق المتوسط', lat: 33.8, lon: 30.5, n: ['suez', 'aegean', 'central_med'], coasts: ['818', '376', '422', '760', '792', '196', '275', '434'] },
  aegean:        { name: 'Aegean Sea', ar: 'بحر إيجه', lat: 38.6, lon: 25.2, n: ['east_med', 'bosporus', 'central_med'], coasts: ['300', '792'] },
  bosporus:      { name: 'Bosporus', ar: 'مضيق البوسفور', lat: 41.1, lon: 29.05, n: ['aegean', 'black_sea'], coasts: ['792'], choke: true, oil: 6 },
  black_sea:     { name: 'Black Sea', ar: 'البحر الأسود', lat: 43.2, lon: 34.2, n: ['bosporus'], coasts: ['792', '643', '804', '642', '100', '268'] },
  central_med:   { name: 'Central Mediterranean', ar: 'وسط المتوسط', lat: 35.8, lon: 17.5, n: ['east_med', 'aegean', 'west_med'], coasts: ['380', '434', '788', '470', '300'] },
  west_med:      { name: 'Western Mediterranean', ar: 'غرب المتوسط', lat: 39.2, lon: 5.2, n: ['central_med', 'gibraltar'], coasts: ['724', '250', '380', '012', '788'] },
  gibraltar:     { name: 'Strait of Gibraltar', ar: 'مضيق جبل طارق', lat: 35.95, lon: -5.6, n: ['west_med', 'atlantic_east'], coasts: ['724', '504'], choke: true, oil: 5 },
  atlantic_east: { name: 'Eastern Atlantic', ar: 'شرق الأطلسي', lat: 43, lon: -17, n: ['gibraltar', 'north_atlantic', 'north_sea', 'west_africa'], coasts: ['620', '724', '250', '826', '504', '372'] },
  north_sea:     { name: 'North Sea', ar: 'بحر الشمال', lat: 56, lon: 3, n: ['atlantic_east', 'danish', 'norwegian_sea'], coasts: ['826', '578', '208', '276', '528', '056', '250'] },
  danish:        { name: 'Danish Straits', ar: 'المضائق الدنماركية', lat: 57.7, lon: 11, n: ['north_sea', 'baltic'], coasts: ['208', '752', '578'], choke: true, oil: 3 },
  baltic:        { name: 'Baltic Sea', ar: 'بحر البلطيق', lat: 57.2, lon: 19.6, n: ['danish'], coasts: ['752', '246', '233', '428', '440', '616', '276', '643', '208'] },
  norwegian_sea: { name: 'Norwegian Sea', ar: 'البحر النرويجي', lat: 67.5, lon: 4, n: ['north_sea', 'north_atlantic', 'barents'], coasts: ['578', '352'] },
  barents:       { name: 'Barents Sea', ar: 'بحر بارنتس', lat: 72.5, lon: 38, n: ['norwegian_sea'], coasts: ['643', '578'] },
  north_atlantic:{ name: 'North Atlantic', ar: 'شمال الأطلسي', lat: 45, lon: -40, n: ['atlantic_east', 'norwegian_sea', 'us_east', 'caribbean', 'south_atlantic'], coasts: ['352', '124'] },
  us_east:       { name: 'US East Coast', ar: 'الساحل الشرقي الأمريكي', lat: 36, lon: -70.5, n: ['north_atlantic', 'caribbean'], coasts: ['840', '124'] },
  caribbean:     { name: 'Caribbean Sea', ar: 'البحر الكاريبي', lat: 15.5, lon: -75, n: ['us_east', 'north_atlantic', 'panama'], coasts: ['484', '192', '862', '170', '591', '840'] },
  panama:        { name: 'Panama Canal', ar: 'قناة بنما', lat: 9.1, lon: -79.7, n: ['caribbean', 'east_pacific'], coasts: ['591'], choke: true, oil: 4 },
  east_pacific:  { name: 'Eastern Pacific', ar: 'شرق المحيط الهادئ', lat: 8, lon: -100, n: ['panama', 'us_west', 'south_pacific'], coasts: ['484', '604', '218', '170', '152'] },
  us_west:       { name: 'US West Coast', ar: 'الساحل الغربي الأمريكي', lat: 35, lon: -128, n: ['east_pacific', 'north_pacific'], coasts: ['840', '124', '484'] },
  north_pacific: { name: 'North Pacific', ar: 'شمال المحيط الهادئ', lat: 38, lon: 172, n: ['us_west', 'philippine_sea', 'japan_sea'], coasts: [] },
  philippine_sea:{ name: 'Philippine Sea', ar: 'بحر الفلبين', lat: 20, lon: 133, n: ['north_pacific', 'east_china', 'south_china', 'coral_sea'], coasts: ['392', '608', '158'] },
  east_china:    { name: 'East China Sea', ar: 'بحر الصين الشرقي', lat: 29.5, lon: 125.5, n: ['philippine_sea', 'japan_sea', 'south_china'], coasts: ['156', '392', '410', '158', '408'] },
  japan_sea:     { name: 'Sea of Japan', ar: 'بحر اليابان', lat: 40, lon: 135, n: ['east_china', 'north_pacific'], coasts: ['392', '410', '408', '643'] },
  south_china:   { name: 'South China Sea', ar: 'بحر الصين الجنوبي', lat: 13, lon: 114, n: ['east_china', 'philippine_sea', 'malacca', 'java_sea'], coasts: ['156', '704', '608', '458', '096', '360', '158', '764', '116'] },
  malacca:       { name: 'Strait of Malacca', ar: 'مضيق ملقا', lat: 2.6, lon: 101.2, n: ['south_china', 'bay_bengal'], coasts: ['458', '702', '360'], choke: true, oil: 20 },
  bay_bengal:    { name: 'Bay of Bengal', ar: 'خليج البنغال', lat: 13, lon: 88, n: ['malacca', 'indian_ocean'], coasts: ['356', '050', '104', '144'] },
  indian_ocean:  { name: 'Indian Ocean', ar: 'المحيط الهندي', lat: -8, lon: 75, n: ['arabian_sea', 'bay_bengal', 'java_sea', 'mozambique'], coasts: ['144', '462'] },
  java_sea:      { name: 'Java Sea', ar: 'بحر جاوة', lat: -9, lon: 113, n: ['south_china', 'indian_ocean', 'coral_sea'], coasts: ['360', '036', '626'] },
  coral_sea:     { name: 'Coral Sea', ar: 'بحر المرجان', lat: -18, lon: 156, n: ['java_sea', 'philippine_sea', 'south_pacific'], coasts: ['036', '598', '554', '090'] },
  south_pacific: { name: 'South Pacific', ar: 'جنوب المحيط الهادئ', lat: -30, lon: -125, n: ['east_pacific', 'coral_sea'], coasts: [] },
  west_africa:   { name: 'Gulf of Guinea', ar: 'خليج غينيا', lat: 2, lon: 2, n: ['atlantic_east', 'south_atlantic'], coasts: ['566', '288', '120', '024', '384', '266'] },
  south_atlantic:{ name: 'South Atlantic', ar: 'جنوب الأطلسي', lat: -24, lon: -20, n: ['west_africa', 'cape', 'north_atlantic'], coasts: ['076', '032', '024', '516', '858'] },
  cape:          { name: 'Cape of Good Hope', ar: 'رأس الرجاء الصالح', lat: -37, lon: 20, n: ['south_atlantic', 'mozambique'], coasts: ['710'] },
  mozambique:    { name: 'Mozambique Channel', ar: 'قناة موزمبيق', lat: -18, lon: 41, n: ['cape', 'indian_ocean'], coasts: ['508', '450', '834', '404', '706'] },
};

// Rough great-circle distance between zones, used for fleet movement and ship routing.
export const FLEET_MOVES_PER_TURN = 3;

// Commercial shipping: each lane is a list of zones; ships re-route around closed chokepoints automatically.
export const SHIPPING_LANES = [
  { id: 'gulf_europe', from: 'persian_gulf', to: 'north_sea', weight: 5 },
  { id: 'gulf_asia', from: 'persian_gulf', to: 'east_china', weight: 6 },
  { id: 'gulf_india', from: 'persian_gulf', to: 'bay_bengal', weight: 3 },
  { id: 'asia_europe', from: 'east_china', to: 'north_sea', weight: 6 },
  { id: 'asia_med', from: 'south_china', to: 'west_med', weight: 3 },
  { id: 'transpacific', from: 'east_china', to: 'us_west', weight: 5 },
  { id: 'transatlantic', from: 'north_sea', to: 'us_east', weight: 4 },
  { id: 'black_sea_grain', from: 'black_sea', to: 'east_med', weight: 2 },
  { id: 'panama_route', from: 'us_east', to: 'east_pacific', weight: 2 },
  { id: 'baltic_trade', from: 'baltic', to: 'atlantic_east', weight: 2 },
  { id: 'brazil_china', from: 'south_atlantic', to: 'south_china', weight: 2 },
  { id: 'australia_asia', from: 'coral_sea', to: 'east_china', weight: 2 },
  { id: 'red_sea_gulf', from: 'red_sea', to: 'persian_gulf', weight: 2 },
  { id: 'west_africa_europe', from: 'west_africa', to: 'north_sea', weight: 2 },
];

// Major airports for the civilian air traffic layer. `w` = hub size.
export const AIRPORTS = [
  ['RUH', 'Riyadh', 24.96, 46.70, '682', 5], ['JED', 'Jeddah', 21.68, 39.16, '682', 5], ['DMM', 'Dammam', 26.47, 49.80, '682', 2],
  ['DXB', 'Dubai', 25.25, 55.36, '784', 9], ['DOH', 'Doha', 25.27, 51.61, '634', 7], ['KWI', 'Kuwait', 29.24, 47.97, '414', 3],
  ['BAH', 'Bahrain', 26.27, 50.63, '048', 2], ['MCT', 'Muscat', 23.59, 58.28, '512', 3], ['CAI', 'Cairo', 30.12, 31.41, '818', 5],
  ['IST', 'Istanbul', 41.26, 28.74, '792', 9], ['IKA', 'Tehran', 35.42, 51.15, '364', 4], ['BGW', 'Baghdad', 33.26, 44.23, '368', 2],
  ['AMM', 'Amman', 31.72, 35.99, '400', 3], ['TLV', 'Tel Aviv', 32.01, 34.89, '376', 4], ['BEY', 'Beirut', 33.82, 35.49, '422', 2],
  ['LHR', 'London', 51.47, -0.45, '826', 10], ['CDG', 'Paris', 49.01, 2.55, '250', 9], ['FRA', 'Frankfurt', 50.03, 8.57, '276', 8],
  ['AMS', 'Amsterdam', 52.31, 4.76, '528', 7], ['MAD', 'Madrid', 40.47, -3.56, '724', 6], ['FCO', 'Rome', 41.80, 12.25, '380', 6],
  ['WAW', 'Warsaw', 52.17, 20.97, '616', 4], ['KBP', 'Kyiv', 50.34, 30.89, '804', 3], ['SVO', 'Moscow', 55.97, 37.41, '643', 8],
  ['LED', 'St Petersburg', 59.80, 30.26, '643', 3], ['ARN', 'Stockholm', 59.65, 17.92, '752', 4], ['ATH', 'Athens', 37.94, 23.94, '300', 4],
  ['JFK', 'New York', 40.64, -73.78, '840', 10], ['ORD', 'Chicago', 41.98, -87.90, '840', 7], ['ATL', 'Atlanta', 33.64, -84.43, '840', 7],
  ['LAX', 'Los Angeles', 33.94, -118.41, '840', 8], ['SFO', 'San Francisco', 37.62, -122.38, '840', 6], ['YYZ', 'Toronto', 43.68, -79.63, '124', 6],
  ['MEX', 'Mexico City', 19.44, -99.07, '484', 5], ['GRU', 'São Paulo', -23.43, -46.47, '076', 6], ['EZE', 'Buenos Aires', -34.82, -58.54, '032', 4],
  ['BOG', 'Bogotá', 4.70, -74.15, '170', 4], ['DEL', 'Delhi', 28.56, 77.10, '356', 8], ['BOM', 'Mumbai', 19.09, 72.87, '356', 7],
  ['KHI', 'Karachi', 24.91, 67.16, '586', 3], ['PEK', 'Beijing', 40.08, 116.60, '156', 9], ['PVG', 'Shanghai', 31.14, 121.81, '156', 9],
  ['CAN', 'Guangzhou', 23.39, 113.30, '156', 7], ['HKG', 'Hong Kong', 22.31, 113.92, '156', 8], ['ICN', 'Seoul', 37.46, 126.44, '410', 8],
  ['NRT', 'Tokyo', 35.77, 140.39, '392', 9], ['TPE', 'Taipei', 25.08, 121.23, '158', 6], ['SIN', 'Singapore', 1.36, 103.99, '702', 9],
  ['BKK', 'Bangkok', 13.69, 100.75, '764', 7], ['KUL', 'Kuala Lumpur', 2.75, 101.71, '458', 6], ['CGK', 'Jakarta', -6.13, 106.66, '360', 6],
  ['MNL', 'Manila', 14.51, 121.02, '608', 5], ['SYD', 'Sydney', -33.94, 151.18, '036', 7], ['AKL', 'Auckland', -37.01, 174.79, '554', 3],
  ['JNB', 'Johannesburg', -26.14, 28.25, '710', 5], ['NBO', 'Nairobi', -1.32, 36.93, '404', 4], ['ADD', 'Addis Ababa', 8.98, 38.80, '231', 5],
  ['LOS', 'Lagos', 6.58, 3.32, '566', 4], ['CMN', 'Casablanca', 33.37, -7.59, '504', 4], ['ALG', 'Algiers', 36.69, 3.22, '012', 3],
  ['ALA', 'Almaty', 43.35, 77.04, '398', 3], ['TAS', 'Tashkent', 41.26, 69.28, '860', 3], ['HEL', 'Helsinki', 60.32, 24.96, '246', 3],
  ['VIE', 'Vienna', 48.11, 16.57, '040', 4], ['ZRH', 'Zurich', 47.46, 8.55, '756', 5], ['MIA', 'Miami', 25.79, -80.29, '840', 6],
].map(([code, city, lat, lon, country, w]) => ({ code, city, lat, lon, country, w }));
