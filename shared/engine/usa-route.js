// Road routing for vehicles. The server loads the road map once (client/data/us-roads.json: interstates and US highways as delta
// encoded lines in thousandths of a degree) and builds a graph from it; a unit ordered across country then follows roads between
// waypoints instead of cutting straight over the land. With no graph loaded, or no road near the start or goal, routes are straight.
const CELL = 0.02; // degrees; vertices in one cell are one junction, which is what joins roads that only touch
const KL = lat => 111.32 * Math.cos(lat * Math.PI / 180), KLAT = 110.57;
let nodes = null, adj = null, grid = null;
const key = (x, y) => `${Math.round(x / CELL)},${Math.round(y / CELL)}`;

export function loadRoads(data) {
  const index = new Map(); nodes = []; adj = [];
  const node = (x, y) => {
    const k = key(x, y); let id = index.get(k);
    if (id === undefined) { id = nodes.length; index.set(k, id); nodes.push([x, y]); adj.push([]); }
    return id;
  };
  const link = (a, b) => {
    if (a === b) return;
    const d = Math.hypot((nodes[a][0] - nodes[b][0]) * KL(nodes[a][1]), (nodes[a][1] - nodes[b][1]) * KLAT);
    adj[a].push([b, d]); adj[b].push([a, d]);
  };
  for (const [, lines] of [...(data.i || []), ...(data.u || [])]) for (const d of lines) {
    let x = d[0], y = d[1], prev = node(x / 1000, y / 1000);
    for (let i = 2; i < d.length; i += 2) { x += d[i]; y += d[i + 1]; const cur = node(x / 1000, y / 1000); link(prev, cur); prev = cur; }
  }
  grid = new Map();
  nodes.forEach(([x, y], id) => { const k = `${Math.floor(x)},${Math.floor(y)}`; (grid.get(k) || grid.set(k, []).get(k)).push(id); });
  return nodes.length;
}
export const hasRoads = () => !!nodes;

function nearest(lon, lat, maxKm) {
  let best = -1, bd = maxKm;
  const r = Math.ceil(maxKm / 90);
  for (let gx = Math.floor(lon) - r; gx <= Math.floor(lon) + r; gx++) for (let gy = Math.floor(lat) - r; gy <= Math.floor(lat) + r; gy++)
    for (const id of grid.get(`${gx},${gy}`) || []) {
      const d = Math.hypot((nodes[id][0] - lon) * KL(lat), (nodes[id][1] - lat) * KLAT);
      if (d < bd) { bd = d; best = id; }
    }
  return best;
}

// Waypoints [[lon, lat], ...] from a to b along roads, or null when the roads do not help (no graph, no road near either end, or no
// connection between them). The first leg from a to the road, and the last from the road to b, are straight.
export function route(a, b, { near = 60, spacing = 6 } = {}) {
  if (!nodes) return null;
  const from = nearest(a[0], a[1], near), to = nearest(b[0], b[1], near);
  if (from < 0 || to < 0) return null;
  const h = id => Math.hypot((nodes[id][0] - nodes[to][0]) * KL(nodes[id][1]), (nodes[id][1] - nodes[to][1]) * KLAT);
  const g = new Map([[from, 0]]), came = new Map(), open = [[h(from), from]], done = new Set();
  let found = false, guard = 0;
  while (open.length && guard++ < 400000) {
    // A binary heap would be quicker; the open list stays a few thousand long, so a sorted insert is fine.
    const [, cur] = open.shift();
    if (done.has(cur)) continue;
    if (cur === to) { found = true; break; }
    done.add(cur);
    for (const [nx, w] of adj[cur]) {
      const ng = g.get(cur) + w;
      if (ng < (g.get(nx) ?? Infinity)) {
        g.set(nx, ng); came.set(nx, cur);
        const f = ng + h(nx); let lo = 0, hi = open.length;
        while (lo < hi) { const m = (lo + hi) >> 1; if (open[m][0] < f) lo = m + 1; else hi = m; }
        open.splice(lo, 0, [f, nx]);
      }
    }
  }
  if (!found) return null;
  const ids = []; for (let c = to; c !== undefined; c = came.get(c)) ids.push(c);
  ids.reverse();
  const out = [], push = p => out.push([+p[0].toFixed(3), +p[1].toFixed(3)]);
  let last = null;
  for (let i = 0; i < ids.length; i++) {
    const p = nodes[ids[i]];
    // Thin the route: keep a point every `spacing` km, and always the end of the road.
    if (!last || i === ids.length - 1 || Math.hypot((p[0] - last[0]) * KL(p[1]), (p[1] - last[1]) * KLAT) >= spacing) { push(p); last = p; }
  }
  push(b);
  return out;
}
