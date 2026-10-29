// Canvas films for the Cold War committee's endings (shared/engine/cold-endings.js). Same rules as endings-fx.js:
// abstract light, shapes and numbers, never people or scenes of harm. Each film is a function of time.
const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = t => 1 - Math.pow(1 - clamp(t), 3);
const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
const WEST = '#6a9ccf', EAST = '#d9503f', GOLD = '#ffb64d';

function backdrop(c, W, H, inner, outer) {
  const g = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
  g.addColorStop(0, inner); g.addColorStop(1, outer); c.fillStyle = g; c.fillRect(0, 0, W, H);
}

// Film grain and a faint flicker, so every Cold War ending looks like the same reel as the intro.
function reel(c, W, H, t) {
  c.fillStyle = `rgba(255,190,110,${0.025 + 0.02 * Math.sin(t * 23)})`; c.fillRect(0, 0, W, H);
  const n = Math.floor(t * 12);
  for (let i = 0; i < 160; i++) { c.fillStyle = `rgba(255,240,210,${0.05 + 0.08 * hash(i + n * 7)})`; c.fillRect(hash(i * 3 + n) * W, hash(i * 5 + n * 3) * H, 1.5, 1.5); }
  if (hash(n) > 0.7) { c.fillStyle = 'rgba(255,240,210,.12)'; c.fillRect(hash(n + 1) * W, 0, 1.2, H); }
}

// ---- détente: a blue field and a red field drift together and, where they meet, warm gold light grows ----
function cw_detente(c, W, H, t) {
  backdrop(c, W, H, '#1c1610', '#070504');
  const p = ease(t / 8);
  const gap = W * (0.34 - 0.3 * p);
  for (const [x, col] of [[W / 2 - gap, WEST], [W / 2 + gap, EAST]]) {
    const g = c.createRadialGradient(x, H / 2, 0, x, H / 2, H * 0.55); g.addColorStop(0, rgba(col, 0.55)); g.addColorStop(1, rgba(col, 0));
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }
  const m = clamp((t - 4) / 4);
  const g = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, H * 0.7 * m + 1); g.addColorStop(0, `rgba(255,230,170,${0.7 * m})`); g.addColorStop(1, 'rgba(255,200,120,0)');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // signatures: two pen strokes written across the middle
  for (let k = 0; k < 2; k++) {
    const u = clamp((t - 5 - k * 1.2) / 1.6); if (!u) continue;
    c.strokeStyle = `rgba(255,244,220,${0.65})`; c.lineWidth = Math.max(1.5, H * 0.003); c.lineCap = 'round';
    c.beginPath();
    const x0 = W * (0.28 + k * 0.26), y0 = H * 0.78;
    for (let i = 0; i <= 60 * u; i++) { const s = i / 60; c.lineTo(x0 + s * W * 0.18, y0 + Math.sin(s * 19 + k * 2) * H * 0.018 * (1 - s * 0.5)); }
    c.stroke();
  }
  reel(c, W, H, t);
}

// ---- the wall comes down: a glowing dashed line splits the frame, breaks into blocks that fall, light pours through ----
function cw_wall(c, W, H, t) {
  backdrop(c, W, H, '#1a140c', '#060403');
  const x = W / 2, open = ease((t - 3) / 5), rows = 24;
  const light = c.createLinearGradient(x - W * 0.5 * open, 0, x + W * 0.5 * open, 0);
  light.addColorStop(0, 'rgba(255,220,160,0)'); light.addColorStop(0.5, `rgba(255,236,196,${0.55 * open})`); light.addColorStop(1, 'rgba(255,220,160,0)');
  c.fillStyle = light; c.fillRect(0, 0, W, H);
  for (let i = 0; i < rows; i++) {
    const h = H / rows, at = 2.4 + hash(i) * 2.6, u = Math.max(0, t - at);
    const y = i * h + u * u * H * 0.35, dx = (hash(i + 4) - 0.5) * u * W * 0.08, rot = (hash(i + 8) - 0.5) * u * 0.8;
    if (y > H * 1.2) continue;
    c.save(); c.translate(x + dx, y + h / 2); c.rotate(rot);
    c.fillStyle = `rgba(120,104,80,${0.9 - clamp(u / 3) * 0.5})`; c.fillRect(-W * 0.012, -h / 2 + 1, W * 0.024, h - 2);
    c.fillStyle = `rgba(255,182,77,${clamp(1 - u)})`; c.fillRect(-1, -h / 2 + 1, 2, h - 2);
    c.restore();
  }
  // doves of light: small sparks crossing the gap both ways
  for (let i = 0; i < 40; i++) {
    const at = 4.5 + i * 0.12, u = t - at; if (u < 0) continue;
    const dir = i % 2 ? 1 : -1, px = x + dir * u * W * 0.12, py = H * (0.15 + 0.7 * hash(i + 20));
    c.fillStyle = rgba(i % 2 ? WEST : EAST, clamp(u) * clamp(2.5 - u / 2)); c.beginPath(); c.arc(px, py, H * 0.004, 0, TAU); c.fill();
  }
  reel(c, W, H, t);
}

// ---- the union dissolves: one red mass splits into fifteen pieces that drift apart, each taking its own colour ----
function cw_dissolve(c, W, H, t) {
  backdrop(c, W, H, '#1a110c', '#060303');
  const s = ease((t - 2) / 6), cx = W / 2, cy = H * 0.45;
  for (let i = 0; i < 15; i++) {
    const a = (i / 15) * TAU + 0.3, r0 = H * 0.08 * Math.sqrt(hash(i + 2)), r = r0 + s * H * (0.22 + 0.12 * hash(i));
    const x = cx + Math.cos(a) * r * 1.5, y = cy + Math.sin(a) * r, size = H * (0.035 + 0.03 * hash(i + 5)) * (1 - 0.3 * s);
    const hue = Math.round(hash(i + 11) * 360);
    c.fillStyle = s < 0.4 ? rgba(EAST, 0.85) : `hsla(${hue},${45 * s}%,${45 + 10 * s}%,0.85)`;
    c.beginPath();
    for (let k = 0; k < 7; k++) { const aa = k / 7 * TAU + i, rr = size * (0.7 + 0.5 * hash(i * 9 + k)); c.lineTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr); }
    c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,240,210,.25)'; c.lineWidth = 1; c.stroke();
  }
  // the red glow at the centre fades as the pieces leave
  const g = c.createRadialGradient(cx, cy, 0, cx, cy, H * 0.3); g.addColorStop(0, rgba(EAST, 0.5 * (1 - s))); g.addColorStop(1, rgba(EAST, 0));
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  reel(c, W, H, t);
}

// ---- the alliance unravels: a web of blue nodes loses its links, and the nodes drift east one by one ----
function cw_westfalls(c, W, H, t) {
  backdrop(c, W, H, '#10131a', '#040506');
  const nodes = Array.from({ length: 22 }, (_, i) => ({ x: W * (0.2 + 0.3 * hash(i)), y: H * (0.2 + 0.6 * hash(i + 3)), at: 3 + hash(i + 7) * 5 }));
  const pos = n => { const u = ease((t - n.at) / 3); return [n.x + u * W * (0.35 + 0.15 * hash(n.at)), n.y + Math.sin(u * 3 + n.at) * H * 0.03, u]; };
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const A = nodes[i], B = nodes[j]; if (Math.hypot(A.x - B.x, A.y - B.y) > H * 0.22) continue;
    const cut = Math.min(A.at, B.at), a = clamp(1 - (t - cut) / 0.6); if (a <= 0) continue;
    c.strokeStyle = rgba(WEST, 0.45 * a); c.lineWidth = 1.2; c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); c.stroke();
  }
  const g = c.createRadialGradient(W * 0.8, H / 2, 0, W * 0.8, H / 2, H * 0.5); g.addColorStop(0, rgba(EAST, 0.35)); g.addColorStop(1, rgba(EAST, 0)); c.fillStyle = g; c.fillRect(0, 0, W, H);
  for (const n of nodes) { const [x, y, u] = pos(n); c.fillStyle = u > 0.5 ? rgba(EAST, 0.9) : rgba(WEST, 0.95); c.shadowColor = c.fillStyle; c.shadowBlur = 10; c.beginPath(); c.arc(x, y, H * 0.008, 0, TAU); c.fill(); c.shadowBlur = 0; }
  reel(c, W, H, t);
}

// ---- back from the brink: the Doomsday Clock at a minute to midnight, its hands winding back as the red drains ----
// Drawn large and faint behind the ending's title.
function clockFace(c, W, H, minute, danger) {
  const cx = W / 2, cy = H / 2, R = H * 0.44;
  c.save(); c.globalAlpha = 0.42;
  c.fillStyle = '#120d07'; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.fill();
  const a0 = -Math.PI / 2, a1 = a0 + (minute / 60) * TAU;
  c.fillStyle = rgba(EAST, 0.35 * danger); c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, R, a1, a0 + TAU); c.closePath(); c.fill();
  c.strokeStyle = '#f3e6c8'; c.lineWidth = Math.max(2, H * 0.004); c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.stroke();
  for (let i = 0; i < 60; i++) { const a = i / 60 * TAU, r1 = R * (i % 5 ? 0.93 : 0.86); c.lineWidth = i % 5 ? 1 : 3; c.strokeStyle = i % 5 ? '#8a7650' : '#f3e6c8'; c.beginPath(); c.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); c.lineTo(cx + Math.cos(a) * R * 0.97, cy + Math.sin(a) * R * 0.97); c.stroke(); }
  const hand = (ang, len, w, col) => { c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len); c.stroke(); };
  hand(a0 + ((11 + minute / 60) / 12) * TAU, R * 0.55, H * 0.012, '#f3e6c8');
  hand(a1, R * 0.85, H * 0.007, GOLD);
  c.fillStyle = EAST; c.beginPath(); c.arc(cx, cy, H * 0.009, 0, TAU); c.fill();
  c.restore();
}
function cw_brink(c, W, H, t) {
  const back = ease((t - 2) / 6);
  backdrop(c, W, H, `rgb(${40 - 14 * back},${14 + 8 * back},${10 + 6 * back})`, '#050303');
  clockFace(c, W, H, 59 - 14 * back, 1 - back * 0.8);
  reel(c, W, H, t);
}

// ---- the proxy wars: two poles of light, and lines from each reaching out to flare at scattered points between ----
function cw_proxy(c, W, H, t) {
  backdrop(c, W, H, '#1c0f0c', '#060303');
  const P = [[W * 0.12, H * 0.45, WEST], [W * 0.88, H * 0.45, EAST]];
  for (const [x, y, col] of P) { const g = c.createRadialGradient(x, y, 0, x, y, H * 0.25); g.addColorStop(0, rgba(col, 0.75)); g.addColorStop(1, rgba(col, 0)); c.fillStyle = g; c.fillRect(0, 0, W, H); }
  for (let i = 0; i < 12; i++) {
    const at = 1.5 + i * 0.6, u = t - at; if (u < 0) continue;
    const x = W * (0.3 + 0.4 * hash(i)), y = H * (0.15 + 0.7 * hash(i + 5)), reach = ease(u / 1.2);
    for (const [px, py, col] of P) { c.strokeStyle = rgba(col, 0.35); c.lineWidth = 1.2; c.setLineDash([4, 6]); c.beginPath(); c.moveTo(px, py); c.lineTo(px + (x - px) * reach, py + (y - py) * reach); c.stroke(); }
    c.setLineDash([]);
    if (reach >= 1) { const f = 0.5 + 0.5 * Math.sin(t * 3 + i); const g = c.createRadialGradient(x, y, 0, x, y, H * 0.05); g.addColorStop(0, `rgba(255,190,110,${0.8 * f})`); g.addColorStop(1, 'rgba(255,120,60,0)'); c.fillStyle = g; c.beginPath(); c.arc(x, y, H * 0.05, 0, TAU); c.fill(); }
  }
  reel(c, W, H, t);
}

// ---- the long twilight: the Doomsday Clock frozen near midnight, frost creeping in from the edges ----
function cw_frozen(c, W, H, t) {
  backdrop(c, W, H, '#16181c', '#040506');
  clockFace(c, W, H, 57 + Math.sin(t * 1.3) * 0.25, 0.8);
  const f = ease(t / 9);
  for (let i = 0; i < 90; i++) {
    const edge = i % 4, s = hash(i), len = H * (0.05 + 0.12 * hash(i + 3)) * f;
    const [x, y, a] = edge === 0 ? [s * W, 0, Math.PI / 2] : edge === 1 ? [s * W, H, -Math.PI / 2] : edge === 2 ? [0, s * H, 0] : [W, s * H, Math.PI];
    c.strokeStyle = `rgba(210,230,255,${0.25 + 0.2 * hash(i + 6)})`; c.lineWidth = 1;
    c.beginPath(); c.moveTo(x, y); const ex = x + Math.cos(a + (hash(i + 1) - 0.5)) * len, ey = y + Math.sin(a + (hash(i + 1) - 0.5)) * len; c.lineTo(ex, ey);
    c.moveTo(x + (ex - x) * 0.5, y + (ey - y) * 0.5); c.lineTo(x + (ex - x) * 0.5 + Math.cos(a + 0.8) * len * 0.3, y + (ey - y) * 0.5 + Math.sin(a + 0.8) * len * 0.3); c.stroke();
  }
  reel(c, W, H, t);
}

export const COLD_FILMS = { cw_detente, cw_wall, cw_dissolve, cw_westfalls, cw_brink, cw_proxy, cw_frozen };
