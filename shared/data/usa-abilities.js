// Special abilities, by unit type. Each is used on the unit and then rests for `cd` game seconds. `target` says what it is aimed at:
// a point on the map, or nothing (the unit itself). `reach` is how far from the unit the point may be: 'range' is the unit's own
// weapon range, a number is kilometres, and 'radius' (air units) is its combat radius from base.
export const ABILITIES = {
  barrage: { name: 'Barrage', target: 'point', reach: 'range', radius: 3, dmg: 24, cd: 600, hits: 'ground', desc: 'Shells fall on a 3 km circle; hostile ground units there are badly hurt.',
    types: ['ng_arty', 'art_bn', 'himars'] },
  airstrike: { name: 'Air strike', target: 'point', reach: 'radius', radius: 2.5, dmg: 32, cd: 900, hits: 'ground', desc: 'The aircraft flies to the point, hits everything hostile on the ground there and carries on.',
    types: ['f35_sqn', 'f22_sqn', 'f15_sqn', 'a10_sqn', 'ng_air_wing', 'air_wing', 'ah64', 'mq9', 'foreign_air'] },
  carpet: { name: 'Bombing run', target: 'point', reach: 'radius', radius: 6, dmg: 40, cd: 1800, hits: 'ground', desc: 'A bomber pass over a wide area. Heavy damage to hostile ground units and bases.',
    types: ['bomber'] },
  airlift: { name: 'Airlift', target: 'point', reach: 'radius', radius: 0, cd: 600, desc: 'Picks up the nearest friendly ground unit within 12 km and sets it down at the point.',
    types: ['uh60', 'cab', 'ng_aviation', 'c130'] },
  medevac: { name: 'Medevac', target: 'self', radius: 6, heal: 22, cd: 600, desc: 'Treats friendly units within 6 km and restores part of their strength.',
    types: ['ems', 'med_co', 'usar', 'hazmat', 'uh60', 'ng_aviation', 'ng_csd'] },
  fortify: { name: 'Dig in', target: 'self', cd: 0, desc: 'Takes cover: much tougher, but cannot move until given a new order.',
    types: ['inf_bn', 'inf_co', 'inf_bct', 'ng_bct', 'ng_inf_bn', 'ranger_bn', 'meu', 'mef', 'engineer', 'ng_engineer', 'div_light', 'militia_co', 'militia_sq'] },
  disperse: { name: 'Disperse crowd', target: 'point', reach: 4, radius: 4, cd: 600, desc: 'Riot teams push a crowd back; civilians and rioters within 4 km lose strength and move away.',
    types: ['swat', 'state_patrol', 'sheriff', 'mp_co', 'ng_mp', 'ng_bct', 'marshals', 'ice_team'] },
  forcedmarch: { name: 'Forced march', target: 'self', cd: 1800, dur: 600, desc: 'Moves 60% faster for ten minutes, then must rest.',
    types: ['division', 'div_light', 'arm_bct', 'stryker_bct', 'inf_bct', 'ng_bct', 'ng_inf_bn', 'cav_sqn', 'inf_bn', 'ranger_bn', 'mp_co', 'ng_mp', 'meu', 'mef', 'convoy'] },
};
export const abilitiesOf = type => Object.entries(ABILITIES).filter(([, a]) => a.types.includes(type)).map(([id]) => id);
