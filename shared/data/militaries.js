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

// Countries with the amphibious fleets to land troops on a defended coast. Any country with a carrier group also qualifies.
export const AMPHIBIOUS_A3 = ['USA', 'CHN', 'RUS', 'GBR', 'FRA', 'JPN', 'KOR', 'IND', 'ITA', 'ESP', 'TUR', 'AUS', 'NLD', 'BRA', 'EGY'];

// Countries able to run a non-combatant evacuation (NEO): long-range airlift, or ships and marines that can reach a crisis zone.
export const NEO_A3 = ['USA', 'GBR', 'FRA', 'CHN', 'RUS', 'IND', 'JPN', 'KOR', 'DEU', 'ITA', 'ESP', 'TUR', 'SAU', 'ARE', 'EGY', 'AUS', 'CAN', 'NLD', 'PAK', 'ISR', 'QAT', 'BRA'];
