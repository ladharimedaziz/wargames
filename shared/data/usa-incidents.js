// Incidents the Zeus or Kronos can set off anywhere. Each one drops units on the map, may change a state's status, and goes into the
// event log, where the government answers it. units: [unit type, name, side, how many, order]. An order of `drift` sends the units
// that far (degrees east, north) from where the incident is; `inward` sends them into the country from a border crossing.
// group tells the government who deals with it: disaster, unrest, attack, border, war.
export const INCIDENTS = {
  riot: { name: 'Riot', group: 'unrest', status: 'alert', text: 'A riot breaks out', units: [['rioters', 'Rioters', 'civil', 3, 'spread']] },
  protest: { name: 'Mass protest', group: 'unrest', text: 'A mass protest fills the streets', units: [['protest', 'Protesters', 'civil', 2, 'spread']] },
  trucker: { name: 'Trucker blockade', group: 'unrest', text: 'Truckers block the highway', units: [['trucker', 'Truck convoy', 'civil', 3, 'line']] },
  wildfire: { name: 'Wildfire', group: 'disaster', status: 'emergency', text: 'A wildfire spreads', units: [['fire_bn', 'Fire crews', 'st', 2, 'spread'], ['ems', 'Ambulances', 'st', 1, 'spread']] },
  flood: { name: 'Flood', group: 'disaster', status: 'emergency', text: 'Floodwater cuts off towns', units: [['usar', 'Rescue teams', 'st', 2, 'spread'], ['ems', 'Ambulances', 'st', 2, 'spread'], ['refugees', 'Evacuees', 'civil', 2, 'spread']] },
  hurricane: { name: 'Hurricane landfall', group: 'disaster', status: 'emergency', text: 'A hurricane makes landfall', units: [['usar', 'Rescue teams', 'st', 3, 'spread'], ['fire_co', 'Fire crews', 'st', 3, 'spread'], ['refugees', 'Evacuees', 'civil', 3, 'spread']] },
  earthquake: { name: 'Earthquake', group: 'disaster', status: 'emergency', text: 'An earthquake strikes', units: [['usar', 'Rescue teams', 'st', 3, 'spread'], ['ems', 'Ambulances', 'st', 3, 'spread'], ['hazmat', 'Hazmat teams', 'st', 1, 'spread']] },
  chemical: { name: 'Chemical spill', group: 'disaster', status: 'alert', text: 'A chemical spill forces evacuations', units: [['hazmat', 'Hazmat teams', 'st', 2, 'spread'], ['refugees', 'Evacuees', 'civil', 1, 'spread']] },
  shooting: { name: 'Mass shooting', group: 'attack', status: 'alert', text: 'A mass shooting is under way', units: [['swat', 'SWAT teams', 'st', 2, 'spread'], ['ems', 'Ambulances', 'st', 2, 'spread']] },
  prisonbreak: { name: 'Prison break', group: 'attack', status: 'alert', text: 'Inmates break out of a prison', units: [['militia_sq', 'Escaped inmates', 'mil', 2, 'spread'], ['state_patrol', 'State police', 'st', 2, 'spread']] },
  bombing: { name: 'Bombing', group: 'attack', status: 'emergency', text: 'A bomb goes off', units: [['ems', 'Ambulances', 'st', 3, 'spread'], ['fire_co', 'Fire crews', 'st', 2, 'spread'], ['fbi_hrt', 'FBI response team', 'fed', 1, 'spread']] },
  cyber: { name: 'Cyberattack', group: 'attack', status: 'alert', text: 'A cyberattack knocks out services', units: [] },
  uprising: { name: 'Militia uprising', group: 'war', status: 'emergency', text: 'An armed militia seizes buildings', units: [['militia_co', 'Militia', 'mil', 3, 'spread'], ['militia_sq', 'Militia cell', 'mil', 3, 'spread']] },
  breach: { name: 'Border breach', group: 'border', text: 'A group breaks through the border', units: [['refugees', 'Migrants', 'civil', 3, 'inward'], ['cartel_convoy', 'Armed convoy', 'mil', 1, 'inward']] },
  surge: { name: 'Migrant surge', group: 'border', text: 'A surge of migrants arrives at the border', units: [['refugees', 'Migrants', 'civil', 5, 'inward']] },
  incursion: { name: 'Foreign incursion', group: 'war', text: 'Foreign troops cross the border', units: [['foreign_bde', 'Foreign brigade', 'foreign', 2, 'inward']] },
};
