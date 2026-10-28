// The busiest land crossings on the Canadian and Mexican borders, for the continental US committee.
// [id, name, side, lon, lat, bearing, size]
//   bearing: the compass direction a vehicle drives to go from the foreign side into the US (0 north, 90 east, 180 south, 270 west)
//   size: 1 to 3, how busy the crossing is (traffic is drawn in proportion)
export const CROSSINGS = [
  ['bx-detroit', 'Ambassador Bridge, Detroit', 'CAN', -83.074, 42.312, 315, 3],
  ['bx-porthuron', 'Blue Water Bridge, Port Huron', 'CAN', -82.425, 42.999, 270, 3],
  ['bx-buffalo', 'Peace Bridge, Buffalo', 'CAN', -78.905, 42.906, 90, 3],
  ['bx-lewiston', 'Lewiston-Queenston Bridge', 'CAN', -79.049, 43.153, 180, 2],
  ['bx-ogdensburg', 'Ogdensburg-Prescott', 'CAN', -75.5, 44.71, 160, 1],
  ['bx-champlain', 'Champlain-Lacolle', 'CAN', -73.448, 45.0, 180, 3],
  ['bx-derbyline', 'Derby Line-Stanstead', 'CAN', -72.1, 45.0, 180, 1],
  ['bx-calais', 'Calais-St. Stephen', 'CAN', -67.28, 45.19, 225, 1],
  ['bx-houlton', 'Houlton-Woodstock', 'CAN', -67.84, 46.13, 270, 1],
  ['bx-sault', 'Sault Ste. Marie International Bridge', 'CAN', -84.35, 46.5, 200, 2],
  ['bx-intlfalls', 'International Falls-Fort Frances', 'CAN', -93.41, 48.6, 180, 1],
  ['bx-pembina', 'Pembina-Emerson', 'CAN', -97.24, 49.0, 180, 2],
  ['bx-sweetgrass', 'Sweetgrass-Coutts', 'CAN', -111.96, 49.0, 180, 2],
  ['bx-blaine', 'Peace Arch, Blaine', 'CAN', -122.757, 49.0, 180, 3],
  ['bx-sanysidro', 'San Ysidro-Tijuana', 'MEX', -117.03, 32.54, 350, 3],
  ['bx-otaymesa', 'Otay Mesa', 'MEX', -116.94, 32.55, 0, 3],
  ['bx-calexico', 'Calexico-Mexicali', 'MEX', -115.5, 32.67, 0, 2],
  ['bx-nogales', 'Nogales', 'MEX', -110.94, 31.33, 0, 2],
  ['bx-douglas', 'Douglas-Agua Prieta', 'MEX', -109.55, 31.33, 0, 1],
  ['bx-elpaso', 'El Paso-Ciudad Juarez', 'MEX', -106.45, 31.75, 10, 3],
  ['bx-presidio', 'Presidio-Ojinaga', 'MEX', -104.37, 29.56, 0, 1],
  ['bx-delrio', 'Del Rio-Acuna', 'MEX', -100.9, 29.33, 20, 1],
  ['bx-eaglepass', 'Eagle Pass-Piedras Negras', 'MEX', -100.5, 28.7, 30, 2],
  ['bx-laredo', 'Laredo-Nuevo Laredo', 'MEX', -99.5, 27.6, 20, 3],
  ['bx-hidalgo', 'Hidalgo-Reynosa', 'MEX', -98.27, 26.1, 0, 2],
  ['bx-brownsville', 'Brownsville-Matamoros', 'MEX', -97.5, 25.9, 350, 2],
];
