// Real-world military strength (approximate, as of 2025), replacing the rough figures in countries.js.
// One unit stands for roughly:
//   army group      75,000 active ground troops (army and marines)
//   fighter wing    150 combat aircraft (air force, navy and marine aviation)
//   bomber wing     25 to 35 long-range bombers
//   fleet           15 major warships and submarines (frigate size and up)
//   carrier group   one fixed-wing or large-deck aircraft carrier with its escorts
//   missile battery a significant ballistic or cruise missile force
// Quality multiplies a unit's fighting power in that domain: training, equipment, logistics and combat experience.
// The US Navy is in a class of its own: eleven supercarriers and decades of continuous deployment.
//
// Columns: army | fighter | bomber | fleet | carrier | missile | quality land | quality air | quality sea
const RAW = `
USA 9 21 6 13 11 6 1.5 2.0 3.0
CHN 12 14 4 13 3 8 1.0 1.0 1.2
RUS 7 8 4 9 1 7 1.0 0.95 0.9
IND 16 5 0 4 2 4 0.9 0.9 0.95
PAK 7 3 0 1 0 4 0.85 0.9 0.8
GBR 1 1 0 2 2 1 1.35 1.4 1.5
FRA 2 2 0 2 1 1 1.25 1.3 1.35
DEU 1 2 0 1 0 0 1.15 1.2 1.1
ITA 1 2 0 2 1 0 1.1 1.15 1.15
ESP 1 1 0 1 1 0 1.1 1.1 1.1
NLD 1 1 0 1 0 0 1.15 1.2 1.15
POL 2 1 0 0 0 1 1.1 1.1 1
GRC 1 2 0 2 0 0 1 1.05 1.05
TUR 4 2 0 3 1 1 1.05 1.05 1.05
UKR 9 1 0 0 0 2 1.15 0.9 1
JPN 2 2 0 5 2 0 1.25 1.35 1.5
KOR 5 3 0 3 0 3 1.2 1.25 1.2
PRK 15 3 0 2 0 5 0.55 0.4 0.45
TWN 2 3 0 2 0 2 1.05 1.15 1.05
AUS 1 1 0 1 0 0 1.3 1.35 1.3
CAN 1 1 0 1 0 0 1.2 1.2 1.15
ISR 3 2 0 1 0 2 1.5 1.8 1.1
IRN 7 2 0 2 0 6 0.85 0.5 0.6
SAU 3 3 0 2 0 1 0.95 1.1 0.9
ARE 1 1 0 1 0 0 1.1 1.15 0.95
QAT 1 1 0 0 0 0 1 1.1 0.9
EGY 4 4 0 2 0 1 0.85 0.85 0.85
IRQ 2 1 0 0 0 0 0.75 0.7 0.6
SYR 1 1 0 0 0 1 0.6 0.5 0.5
DZA 2 1 0 1 0 1 0.85 0.85 0.8
BRA 3 1 0 1 0 0 0.85 0.85 0.85
VNM 5 1 0 1 0 1 0.85 0.8 0.8
IDN 4 1 0 2 0 0 0.8 0.8 0.8
THA 3 1 0 1 0 0 0.85 0.85 0.85
PHL 1 1 0 1 0 0 0.8 0.75 0.75
BLR 1 1 0 0 0 1 0.85 0.85 1
`;

// Where navies start: forward-deployed fleets, by sea zone. Anything not listed starts in home waters.
export const DEPLOYMENTS = {
  USA: { fleet: ['us_east', 'us_east', 'us_west', 'us_west', 'east_med', 'persian_gulf', 'arabian_sea', 'philippine_sea', 'east_china', 'japan_sea', 'south_china', 'north_atlantic', 'north_pacific'],
    carrier: ['us_east', 'us_east', 'us_west', 'us_west', 'us_west', 'east_med', 'arabian_sea', 'philippine_sea', 'japan_sea', 'north_atlantic', 'south_china'] },
  CHN: { fleet: ['east_china', 'east_china', 'east_china', 'east_china', 'south_china', 'south_china', 'south_china', 'south_china', 'japan_sea', 'south_china', 'east_china', 'philippine_sea', 'gulf_aden'], carrier: ['east_china', 'south_china', 'south_china'] },
  RUS: { fleet: ['barents', 'barents', 'baltic', 'black_sea', 'black_sea', 'japan_sea', 'north_pacific', 'east_med', 'norwegian_sea'], carrier: ['barents'] },
  GBR: { fleet: ['north_sea', 'atlantic_east'], carrier: ['north_sea', 'east_med'] },
  FRA: { fleet: ['west_med', 'atlantic_east'], carrier: ['central_med'] },
  JPN: { fleet: ['japan_sea', 'philippine_sea', 'east_china', 'east_china', 'north_pacific'], carrier: ['philippine_sea', 'east_china'] },
  IND: { fleet: ['arabian_sea', 'bay_bengal', 'arabian_sea', 'indian_ocean'], carrier: ['arabian_sea', 'bay_bengal'] },
  ITA: { fleet: ['central_med', 'central_med'], carrier: ['central_med'] },
  TUR: { fleet: ['aegean', 'black_sea', 'east_med'], carrier: ['east_med'] },
  SAU: { fleet: ['persian_gulf', 'red_sea'] },
  IRN: { fleet: ['persian_gulf', 'hormuz'] },
  EGY: { fleet: ['east_med', 'red_sea'] },
};

export const MILITARIES = Object.fromEntries(RAW.trim().split('\n').map(line => {
  const [a3, army, fighter, bomber, fleet, carrier, missile, land, air, sea] = line.trim().split(/\s+/);
  return [a3, { forces: { army: +army, fighter: +fighter, bomber: +bomber, fleet: +fleet, carrier: +carrier, missile: +missile }, quality: { land: +land, air: +air, sea: +sea } }];
}));

// Where air forces start when they are based abroad (alpha-3 of the host). The US keeps fighter wings at its real
// overseas air bases: Lakenheath, Ramstein, Aviano, Incirlik, Al Udeid, Al Dhafra, Ali Al Salem, Prince Sultan,
// Muwaffaq Salti, Camp Lemonnier, Kadena, Misawa, Osan, Kunsan, Rota, Lask and Ørland; bombers rotate through
// Fairford and RAAF Tindal. Anything not listed stays at home.
export const AIR_BASES = {
  USA: {
    fighter: ['GBR', 'DEU', 'ITA', 'TUR', 'QAT', 'ARE', 'KWT', 'SAU', 'JOR', 'DJI', 'JPN', 'JPN', 'KOR', 'KOR', 'ESP', 'POL', 'NOR'],
    bomber: ['GBR', 'AUS'],
  },
  GBR: { fighter: [] },
  FRA: { fighter: ['ARE'] },
  RUS: { fighter: ['SYR', 'BLR'] },
};

// Named aircraft a Zeus can pick for a strike. `by` is the countries (alpha-3) that fly it; stealth scales the chance of
// being intercepted; `shape` picks the silhouette the map draws.
export const AIRCRAFT = {
  b2:   { y: 1997, name: 'B-2 Spirit', type: 'bomber', stealth: 0.12, power: 0.1, precise: true, by: ['USA'], shape: 'b2' },
  f117: { y: 1990, name: 'F-117 Nighthawk', type: 'fighter', stealth: 0.22, power: 0.055, precise: true, by: ['USA'], shape: 'f117' },
  b52:  { y: 1955, name: 'B-52 Stratofortress', type: 'bomber', stealth: 1, power: 0.085, by: ['USA'], shape: 'b52' },
  b1b:  { y: 1986, name: 'B-1B Lancer', type: 'bomber', stealth: 0.7, power: 0.085, by: ['USA'], shape: 'b1b' },
  f15:  { y: 1976, name: 'F-15E Strike Eagle', type: 'fighter', stealth: 0.9, power: 0.05, by: ['USA'], shape: 'twin' },
  f16:  { y: 1978, name: 'F-16 Fighting Falcon', type: 'fighter', stealth: 0.9, power: 0.04, by: ['USA'], shape: 'single' },
  f22:  { y: 2005, name: 'F-22 Raptor', type: 'fighter', stealth: 0.3, power: 0.05, by: ['USA'], shape: 'twin' },
  f35:  { y: 2016, name: 'F-35 Lightning II', type: 'fighter', stealth: 0.28, power: 0.05, precise: true, by: ['USA', 'GBR', 'ITA', 'JPN', 'KOR', 'AUS', 'NLD', 'NOR', 'POL', 'DNK'], shape: 'single' },
  su34: { y: 1990, name: 'Su-34 Fullback', type: 'fighter', stealth: 0.85, power: 0.055, by: ['RUS'], shape: 'twin' },
  su35: { y: 2014, name: 'Su-35S Flanker-E', type: 'fighter', stealth: 0.8, power: 0.045, by: ['RUS'], shape: 'twin' },
  su57: { y: 2020, name: 'Su-57 Felon', type: 'fighter', stealth: 0.45, power: 0.05, by: ['RUS'], shape: 'twin' },
  tu95: { y: 1956, name: 'Tu-95 Bear', type: 'bomber', stealth: 1, power: 0.08, by: ['RUS'], shape: 'b52' },
  tu160:{ y: 1987, name: 'Tu-160 Blackjack', type: 'bomber', stealth: 0.7, power: 0.09, by: ['RUS'], shape: 'b1b' },
  j10:  { y: 2005, name: 'J-10C Vigorous Dragon', type: 'fighter', stealth: 0.85, power: 0.04, by: ['CHN'], shape: 'delta' },
  j16:  { y: 2013, name: 'J-16 Flanker', type: 'fighter', stealth: 0.8, power: 0.05, by: ['CHN'], shape: 'twin' },
  j20:  { y: 2017, name: 'J-20 Mighty Dragon', type: 'fighter', stealth: 0.4, power: 0.05, by: ['CHN'], shape: 'twin' },
  h6:   { y: 2011, name: 'H-6K Bomber', type: 'bomber', stealth: 1, power: 0.08, by: ['CHN'], shape: 'b52' },
  typhoon: { y: 2003, name: 'Eurofighter Typhoon', type: 'fighter', stealth: 0.8, power: 0.045, by: ['GBR', 'DEU', 'ITA', 'ESP', 'AUT', 'SAU'], shape: 'delta' },
  tornado: { y: 1979, name: 'Panavia Tornado', type: 'fighter', stealth: 0.9, power: 0.045, by: ['DEU', 'GBR', 'ITA', 'SAU'], shape: 'single' },
  rafale: { y: 2001, name: 'Dassault Rafale', type: 'fighter', stealth: 0.75, power: 0.05, precise: true, by: ['FRA', 'IND', 'EGY', 'QAT', 'ARE', 'GRC'], shape: 'delta' },
  m2000: { y: 1984, name: 'Mirage 2000D', type: 'fighter', stealth: 0.85, power: 0.04, by: ['FRA'], shape: 'delta' },
};
// Aircraft of the 1980s, for the Cold War committee.
Object.assign(AIRCRAFT, {
  f14:   { y: 1974, name: 'F-14 Tomcat', type: 'fighter', stealth: 0.9, power: 0.05, by: ['USA'], shape: 'twin' },
  f111:  { y: 1967, name: 'F-111 Aardvark', type: 'bomber', stealth: 0.85, power: 0.07, by: ['USA'], shape: 'b1b' },
  mig29: { y: 1983, name: 'MiG-29 Fulcrum', type: 'fighter', stealth: 0.9, power: 0.04, by: ['RUS'], shape: 'twin' },
  su27:  { y: 1985, name: 'Su-27 Flanker', type: 'fighter', stealth: 0.9, power: 0.05, by: ['RUS'], shape: 'twin' },
  mig25: { y: 1970, name: 'MiG-25 Foxbat', type: 'fighter', stealth: 0.95, power: 0.04, by: ['RUS'], shape: 'twin' },
  su24:  { y: 1974, name: 'Su-24 Fencer', type: 'fighter', stealth: 0.9, power: 0.05, by: ['RUS'], shape: 'delta' },
  tu22m: { y: 1972, name: 'Tu-22M Backfire', type: 'bomber', stealth: 0.9, power: 0.08, by: ['RUS'], shape: 'b1b' },
  h6d:   { y: 1969, name: 'H-6 Bomber', type: 'bomber', stealth: 1, power: 0.07, by: ['CHN'], shape: 'b52' },
  j7:    { y: 1967, name: 'J-7 (MiG-21)', type: 'fighter', stealth: 0.95, power: 0.03, by: ['CHN'], shape: 'delta' },
  jaguar:{ y: 1973, name: 'SEPECAT Jaguar', type: 'fighter', stealth: 0.9, power: 0.035, by: ['GBR', 'FRA'], shape: 'single' },
  harrier:{ y: 1969, name: 'Harrier GR3', type: 'fighter', stealth: 0.9, power: 0.03, by: ['GBR'], shape: 'single' },
  mirf1: { y: 1973, name: 'Mirage F1', type: 'fighter', stealth: 0.9, power: 0.035, by: ['FRA'], shape: 'delta' },
});
export const US_AIRCRAFT = AIRCRAFT; // older name
// The named aircraft a country can send: [id, spec] pairs.
export const aircraftFor = (a3, year = 9999) => Object.entries(AIRCRAFT).filter(([, v]) => v.by.includes(a3) && (v.y || 0) <= year);

// Countries with the amphibious fleets to land troops on a defended coast. Any country with a carrier group also qualifies.
export const AMPHIBIOUS_A3 = ['USA', 'CHN', 'RUS', 'GBR', 'FRA', 'JPN', 'KOR', 'IND', 'ITA', 'ESP', 'TUR', 'AUS', 'NLD', 'BRA', 'EGY'];

// Countries able to run a non-combatant evacuation (NEO): long-range airlift, or ships and marines that can reach a crisis zone.
// Countries with paratroopers or strategic airlift, and the transport aircraft to fly them in, with how far they can reach (km from home or
// from wherever their troops are). The big powers can drop anywhere in the world.
export const AIRBORNE_KM = {
  USA: 20000, RUS: 20000, CHN: 20000, GBR: 20000, FRA: 20000,
  IND: 3500, TUR: 3000, ISR: 2500, ITA: 3000, ESP: 3000, DEU: 3000, POL: 2500, UKR: 2000, JPN: 3000, KOR: 2000,
  PAK: 2500, IRN: 2500, EGY: 2500, SAU: 3000, ARE: 2500, AUS: 6000, CAN: 6000, BRA: 4000,
  // Strategic airlift fleets (C-17, A400M, Il-76) without a large parachute force still fly troops in.
  QAT: 5000, KWT: 3000, NLD: 4000, BEL: 3000, DZA: 2500, JOR: 1500, IDN: 3000, ZAF: 3000, MEX: 3000,
};

export const NEO_A3 = ['USA', 'GBR', 'FRA', 'CHN', 'RUS', 'IND', 'JPN', 'KOR', 'DEU', 'ITA', 'ESP', 'TUR', 'SAU', 'ARE', 'EGY', 'AUS', 'CAN', 'NLD', 'PAK', 'ISR', 'QAT', 'BRA'];

// The US Navy's eleven carriers. Each American carrier group is named after one, in this order, which matches the
// starting deployments above (George Washington is forward-deployed to Japan).
export const US_CARRIERS = [
  ['Gerald R. Ford', 'CVN-78'], ['Dwight D. Eisenhower', 'CVN-69'], ['Nimitz', 'CVN-68'], ['Carl Vinson', 'CVN-70'],
  ['Abraham Lincoln', 'CVN-72'], ['Harry S. Truman', 'CVN-75'], ['Theodore Roosevelt', 'CVN-71'], ['Ronald Reagan', 'CVN-76'],
  ['George Washington', 'CVN-73'], ['George H.W. Bush', 'CVN-77'], ['John C. Stennis', 'CVN-74'],
];

// Which numbered US fleet commands a sea zone. An American surface fleet takes the name of the fleet whose waters it is in.
const US_FLEET_ZONES = {
  2: ['us_east', 'north_atlantic'],
  3: ['us_west', 'north_pacific', 'east_pacific', 'south_pacific'],
  4: ['caribbean', 'panama', 'south_atlantic', 'west_africa', 'cape'],
  5: ['persian_gulf', 'hormuz', 'arabian_sea', 'gulf_aden', 'bab', 'red_sea', 'mozambique'],
  6: ['east_med', 'central_med', 'west_med', 'aegean', 'bosporus', 'black_sea', 'suez', 'gibraltar', 'atlantic_east', 'north_sea', 'danish', 'baltic', 'norwegian_sea', 'barents'],
  7: ['philippine_sea', 'east_china', 'japan_sea', 'south_china', 'malacca', 'bay_bengal', 'indian_ocean', 'java_sea', 'coral_sea'],
};
const ORD = { 2: '2nd', 3: '3rd', 4: '4th', 5: '5th', 6: '6th', 7: '7th' };
export function usFleetOf(zone) {
  for (const [n, zs] of Object.entries(US_FLEET_ZONES)) if (zs.includes(zone)) return ORD[n];
  return '2nd';
}

// A name for a new carrier group, if its navy names them: the first American carrier not already at sea.
export function carrierName(units, a3) {
  if (a3 !== 'USA') return undefined;
  const used = new Set(Object.values(units).filter(u => u.type === 'carrier' && u.name).map(u => u.name));
  const free = US_CARRIERS.find(([n]) => !used.has(n));
  return free ? free[0] : undefined;
}

// How a warship group is called in the panel and on the map. Short form for map labels.
export function navalLabel(u, a3, short = false) {
  if (a3 === 'USA') {
    if (u.type === 'carrier') {
      const hull = US_CARRIERS.find(([n]) => n === u.name)?.[1];
      return u.name ? (short ? `USS ${u.name}` : `USS ${u.name}${hull ? ` (${hull})` : ''} carrier strike group`) : (short ? 'Carrier strike group' : 'US carrier strike group');
    }
    if (u.type === 'fleet' && u.loc?.kind === 'sea') return short ? `${usFleetOf(u.loc.id)} Fleet` : `${usFleetOf(u.loc.id)} Fleet surface action group`;
  }
  return u.type === 'carrier' ? 'Carrier group' : 'Fleet';
}
