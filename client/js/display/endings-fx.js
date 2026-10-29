// A canvas film for each ending of the simulation, so no two endings look alike. Abstract by design: light, shapes and
// numbers, never people or scenes of harm. Each film is a function of time since the ending began.
import { html, useEffect, useRef } from '../lib.js';
import { COLD_FILMS } from './cold-endings-fx.js';

const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = t => 1 - Math.pow(1 - clamp(t), 3);
const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

// ---- peace: a dawn, a sun climbing over the hills and a flock of white birds leaving it ----
function peace(c, W, H, t) {
  const p = ease(t / 9);
  const sky = c.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, `rgb(${11 + 40 * p},${15 + 40 * p},${34 + 60 * p})`); sky.addColorStop(0.6, `rgb(${60 + 170 * p},${40 + 90 * p},${90 - 10 * p})`); sky.addColorStop(1, `rgb(${120 + 135 * p},${70 + 120 * p},${60 + 30 * p})`);
  c.fillStyle = sky; c.fillRect(0, 0, W, H);
  const sx = W / 2, sy = H * (1.08 - 0.5 * p), R = H * 0.15;
  c.save(); c.translate(sx, sy); c.rotate(t * 0.05);
  for (let i = 0; i < 28; i++) { c.rotate(TAU / 28); c.fillStyle = `rgba(255,236,190,${0.07 * p})`; c.beginPath(); c.moveTo(0, 0); c.lineTo(H * 1.6, -H * 0.03); c.lineTo(H * 1.6, H * 0.03); c.fill(); }
  c.restore();
  const g = c.createRadialGradient(sx, sy, 0, sx, sy, R * 4); g.addColorStop(0, 'rgba(255,248,220,1)'); g.addColorStop(0.2, 'rgba(255,214,140,.9)'); g.addColorStop(1, 'rgba(255,170,90,0)');
  c.fillStyle = g; c.beginPath(); c.arc(sx, sy, R * 4, 0, TAU); c.fill();
  // birds leaving the sun
  for (let i = 0; i < 46; i++) {
    const at = 1.5 + i * 0.16, u = t - at; if (u < 0) continue;
    const ang = -Math.PI / 2 + (hash(i) - 0.5) * 2.4, sp = H * (0.16 + hash(i + 9) * 0.14), size = H * (0.012 + hash(i + 4) * 0.012) * (1 + u * 0.15);
    const x = sx + Math.cos(ang) * sp * u * 1.6, y = sy + Math.sin(ang) * sp * u * 1.2 - u * u * H * 0.004, flap = Math.sin(u * 9 + i) * 0.7;
    c.strokeStyle = `rgba(255,255,255,${clamp(u * 2) * clamp(1.4 - u / 9)})`; c.lineWidth = Math.max(1.4, size * 0.22); c.lineCap = 'round';
    c.beginPath(); c.moveTo(x - size, y - size * flap); c.quadraticCurveTo(x - size * 0.4, y - size * (0.5 + flap * 0.4), x, y); c.quadraticCurveTo(x + size * 0.4, y - size * (0.5 + flap * 0.4), x + size, y - size * flap); c.stroke();
  }
  // hills
  for (let l = 0; l < 3; l++) {
    c.fillStyle = `rgb(${30 - l * 8},${22 - l * 6},${44 - l * 10})`; c.beginPath(); c.moveTo(0, H);
    for (let x = 0; x <= W; x += W / 40) c.lineTo(x, H * (0.86 + l * 0.04) - Math.sin(x / W * 5 + l * 2) * H * 0.03 - Math.sin(x / W * 11 + l) * H * 0.012);
    c.lineTo(W, H); c.fill();
  }
}

// ---- ceasefire: the tracers thin out and die, a pale flag is hoisted over a still line ----
function ceasefire(c, W, H, t) {
  c.fillStyle = '#0a1214'; c.fillRect(0, 0, W, H);
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(30,60,70,.5)'); g.addColorStop(1, 'rgba(10,14,16,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  const rate = clamp(1 - t / 6.5);
  for (let i = 0; i < 120; i++) {
    const side = i % 2 ? 1 : -1, start = hash(i) * 7, u = (t - start) % 2.2; if (start > 6 || t < start) continue;
    const a = (1 - u / 2.2) * rate; if (a <= 0.02) continue;
    const x = W / 2 + side * (W * 0.08 + hash(i + 3) * W * 0.4) * (0.6 + u * 0.2), y = H * (0.5 - u * 0.1 * hash(i + 5)) - hash(i + 7) * H * 0.25;
    c.fillStyle = `rgba(255,${150 + hash(i) * 80},90,${a})`; c.beginPath(); c.arc(x, y, 1.5 + hash(i + 1) * 2.5, 0, TAU); c.fill();
  }
  // the line of contact, wavering, then steady
  const sway = clamp(1 - t / 8);
  c.strokeStyle = `rgba(200,230,240,${0.35 + 0.15 * Math.sin(t * 1.2)})`; c.lineWidth = 2; c.setLineDash([14, 10]); c.lineDashOffset = -t * 6 * sway;
  c.beginPath(); for (let y = 0; y <= H; y += H / 60) { const x = W / 2 + Math.sin(y / H * 9 + t * 2) * W * 0.012 * sway; y ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); c.setLineDash([]);
  // a white flag climbs its pole and waves
  const fx = W / 2, top = H * 0.2, bottom = H * 0.82, hoist = ease((t - 2) / 4.5);
  c.strokeStyle = 'rgba(220,230,235,.8)'; c.lineWidth = Math.max(2, W * 0.002); c.beginPath(); c.moveTo(fx, bottom); c.lineTo(fx, top); c.stroke();
  const fy = bottom - (bottom - top - H * 0.12) * hoist - H * 0.12, fw = W * 0.09, fh = H * 0.1;
  c.fillStyle = 'rgba(245,248,250,.95)'; c.beginPath(); c.moveTo(fx, fy);
  for (let i = 0; i <= 12; i++) c.lineTo(fx + fw * i / 12, fy + Math.sin(i * 0.9 - t * 4) * fh * 0.1 * (i / 12));
  for (let i = 12; i >= 0; i--) c.lineTo(fx + fw * i / 12, fy + fh + Math.sin(i * 0.9 - t * 4) * fh * 0.1 * (i / 12));
  c.fill();
}

// ---- victory: fireworks and a turning crown of light in the winner's colour ----
function victory(c, W, H, t, S) {
  const col = S.color || '#f2c230';
  c.fillStyle = '#070b18'; c.fillRect(0, 0, W, H);
  const a = clamp(t / 2);
  c.save(); c.translate(W / 2, H / 2); c.rotate(t * 0.08);
  for (let i = 0; i < 18; i++) { c.rotate(TAU / 18); const g = c.createLinearGradient(0, 0, H, 0); g.addColorStop(0, rgba(col, 0.28 * a)); g.addColorStop(1, rgba(col, 0)); c.fillStyle = g; c.beginPath(); c.moveTo(0, 0); c.lineTo(H, -H * 0.05); c.lineTo(H, H * 0.05); c.fill(); }
  c.restore();
  // laurel wreath: two branches rising from the bottom, leaves along the stem, then a star
  const R = H * 0.3, cx = W / 2, cy = H * 0.5, n = 22, draw = clamp((t - 0.6) / 4) * n;
  for (const side of [-1, 1]) {
    c.strokeStyle = rgba('#d9b95a', 0.7 * a); c.lineWidth = Math.max(2, H * 0.004); c.beginPath();
    for (let i = 0; i <= Math.min(draw, n); i++) { const th = Math.PI / 2 + side * (0.25 + i / n * 2.35); const x = cx + Math.cos(th) * R, y = cy + Math.sin(th) * R; i ? c.lineTo(x, y) : c.moveTo(x, y); }
    c.stroke();
    for (let i = 1; i < n; i++) {
      if (i > draw) break;
      const th = Math.PI / 2 + side * (0.25 + i / n * 2.35), x = cx + Math.cos(th) * R, y = cy + Math.sin(th) * R, tan = th + side * Math.PI / 2, k = 1 - i / n * 0.35;
      for (const o of [-1, 1]) { c.save(); c.translate(x, y); c.rotate(tan + o * 0.7); c.fillStyle = rgba(o > 0 ? '#e8cd75' : '#c9a747', 0.9 * clamp(draw - i)); c.beginPath(); c.ellipse(H * 0.03 * k, 0, H * 0.034 * k, H * 0.0125 * k, 0, 0, TAU); c.fill(); c.restore(); }
    }
  }
  const sa = clamp((t - 3) / 1.2), pulse = 1 + Math.sin(t * 2.4) * 0.03;
  c.save(); c.translate(cx, H * 0.21); c.scale(sa * pulse, sa * pulse); c.shadowColor = col; c.shadowBlur = 40; c.fillStyle = col; c.beginPath();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? H * 0.04 : H * 0.1, ang = -Math.PI / 2 + i * Math.PI / 5; i ? c.lineTo(Math.cos(ang) * r, Math.sin(ang) * r) : c.moveTo(Math.cos(ang) * r, Math.sin(ang) * r); }
  c.closePath(); c.fill(); c.restore();
  // fireworks
  for (let b = 0; b < 14; b++) {
    const at = 1 + b * 1.1, u = t - at; if (u < 0 || u > 3) continue;
    const bx = W * (0.12 + hash(b) * 0.76), by = H * (0.12 + hash(b + 3) * 0.4), hue = b % 2 ? col : '#ffe9a8';
    for (let i = 0; i < 42; i++) {
      const ang = i / 42 * TAU + hash(b * 9 + i) * 0.3, sp = H * (0.12 + hash(i + b) * 0.16), x = bx + Math.cos(ang) * sp * u, y = by + Math.sin(ang) * sp * u + u * u * H * 0.05;
      c.fillStyle = rgba(hue, clamp(1 - u / 3)); c.beginPath(); c.arc(x, y, 2.4 * (1 - u / 4), 0, TAU); c.fill();
    }
  }
}

// ---- collapse: a chart plunges, the lights of the world go out one by one, cracks spread ----
function collapse(c, W, H, t) {
  c.fillStyle = '#0b0204'; c.fillRect(0, 0, W, H);
  const g = c.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, H); g.addColorStop(0, 'rgba(120,20,30,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  // city lights dying
  for (let i = 0; i < 220; i++) {
    const off = 2 + hash(i + 1) * 9; if (t > off + 0.3) continue;
    const x = W * hash(i), y = H * (0.45 + hash(i + 50) * 0.5), flick = t > off - 1 ? (Math.sin(t * 40 + i) > 0 ? 1 : 0.2) : 1;
    c.fillStyle = `rgba(255,214,140,${0.8 * flick})`; c.fillRect(x, y, 2.5, 2.5);
  }
  // the chart
  const pts = 90, prog = clamp(t / 5.5);
  c.strokeStyle = '#ff5a4a'; c.lineWidth = Math.max(2, W * 0.003); c.shadowColor = '#ff2a1a'; c.shadowBlur = 18; c.beginPath();
  for (let i = 0; i <= pts * prog; i++) { const u = i / pts, x = W * (0.08 + u * 0.84), y = H * (0.14 + 0.62 * Math.pow(u, 1.6)) + (hash(i) - 0.5) * H * 0.03 * (1 + u * 3); i ? c.lineTo(x, y) : c.moveTo(x, y); }
  c.stroke(); c.shadowBlur = 0;
  // bars falling away
  for (let i = 0; i < 16; i++) { const x = W * (0.1 + i * 0.05), h0 = H * (0.12 + hash(i) * 0.12), fall = clamp((t - 3 - i * 0.12) / 2); c.fillStyle = 'rgba(255,90,74,.22)'; c.fillRect(x, H * 0.84 - h0 * (1 - fall), W * 0.03, h0 * (1 - fall)); }
  // cracks
  const cracks = clamp((t - 3.5) / 5);
  c.strokeStyle = `rgba(255,120,100,${0.5 * cracks})`; c.lineWidth = 1.4;
  for (let k = 0; k < 7; k++) { let x = W / 2, y = H * 0.5, ang = k / 7 * TAU; c.beginPath(); c.moveTo(x, y); for (let s = 0; s < 40 * cracks; s++) { ang += (hash(k * 99 + s) - 0.5) * 0.9; x += Math.cos(ang) * W * 0.015; y += Math.sin(ang) * W * 0.015; c.lineTo(x, y); } c.stroke(); }
  // static tearing
  if (t > 4) for (let i = 0; i < 3; i++) { const y = hash(Math.floor(t * 12) + i) * H; c.fillStyle = 'rgba(255,255,255,.05)'; c.fillRect(0, y, W, 2 + hash(i) * 6); }
}

// ---- stalemate: two walls of pressure meet on a line and freeze solid ----
function stalemate(c, W, H, t) {
  c.fillStyle = '#060a12'; c.fillRect(0, 0, W, H);
  const freeze = clamp((t - 2) / 7);
  // arrows pressing in from both sides, trembling, then turning to ice
  for (let row = 0; row < 14; row++) for (const side of [-1, 1]) {
    const y = H * (0.12 + row * 0.056), push = ease(t / 3.5) * W * 0.36, tremble = Math.sin(t * 18 + row) * W * 0.004 * (1 - freeze);
    const x = W / 2 + side * (W * 0.46 - push) + tremble, col = freeze > 0.55 ? `rgba(190,225,255,${0.8})` : side < 0 ? 'rgba(106,156,207,.85)' : 'rgba(217,80,63,.85)';
    c.strokeStyle = col; c.lineWidth = Math.max(2, W * 0.003); c.beginPath(); c.moveTo(x - side * W * 0.05, y); c.lineTo(x, y); c.lineTo(x - side * W * 0.012, y - W * 0.01); c.moveTo(x, y); c.lineTo(x - side * W * 0.012, y + W * 0.01); c.stroke();
  }
  // the line, glowing then crystallising
  c.strokeStyle = `rgba(200,235,255,${0.3 + freeze * 0.6})`; c.lineWidth = 2 + freeze * 5; c.shadowColor = '#9fd4ff'; c.shadowBlur = 12 + freeze * 20; c.beginPath(); c.moveTo(W / 2, 0); c.lineTo(W / 2, H); c.stroke(); c.shadowBlur = 0;
  for (let i = 0; i < 26; i++) {
    const g0 = clamp((freeze * 26 - i) / 3); if (g0 <= 0) continue;
    const y = H * (0.04 + hash(i) * 0.92), r = H * (0.015 + hash(i + 5) * 0.03) * g0;
    c.strokeStyle = `rgba(210,240,255,${0.7 * g0})`; c.lineWidth = 1.4;
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + hash(i) ; c.beginPath(); c.moveTo(W / 2, y); c.lineTo(W / 2 + Math.cos(a) * r, y + Math.sin(a) * r); c.stroke(); }
  }
  // snow
  for (let i = 0; i < 170; i++) { const x = (hash(i) * W + Math.sin(t * 0.7 + i) * 18) % W, y = ((hash(i + 7) * H + t * H * (0.04 + hash(i + 3) * 0.05)) % H); c.fillStyle = `rgba(230,244,255,${0.25 + 0.5 * hash(i + 2)})`; c.beginPath(); c.arc(x, y, 1 + hash(i + 4) * 2, 0, TAU); c.fill(); }
  // frost creeping in from the edges
  const fg = c.createRadialGradient(W / 2, H / 2, H * (1 - freeze * 0.35), W / 2, H / 2, H * 1.1); fg.addColorStop(0, 'rgba(180,220,255,0)'); fg.addColorStop(1, `rgba(180,220,255,${0.3 * freeze})`); c.fillStyle = fg; c.fillRect(0, 0, W, H);
}

// ---- new world order: the old web of alliances snaps; new clusters form in the blocs' colours ----
function neworder(c, W, H, t, S) {
  c.fillStyle = '#05080f'; c.fillRect(0, 0, W, H);
  const cols = S.colors, centers = [[0.28, 0.4], [0.72, 0.4], [0.5, 0.74]];
  // the old order: a grid that shatters
  const shatter = clamp((t - 0.6) / 4);
  c.lineWidth = 1;
  for (let i = 0; i <= 24; i++) for (const horiz of [0, 1]) {
    const gone = hash(i * 3 + horiz) * 0.9; if (shatter > gone + 0.1) continue;
    const a = 0.22 * (1 - clamp((shatter - gone) / 0.1)), j = (shatter > gone ? 1 : 0) * (hash(i) - 0.5) * 30;
    c.strokeStyle = `rgba(160,180,210,${a})`; c.beginPath();
    if (horiz) { c.moveTo(0, H * i / 24 + j); c.lineTo(W, H * i / 24 - j); } else { c.moveTo(W * i / 24 + j, 0); c.lineTo(W * i / 24 - j, H); }
    c.stroke();
  }
  // the new clusters
  const nodes = [];
  centers.forEach((ct, k) => { for (let i = 0; i < 16; i++) { const a = hash(k * 40 + i) * TAU, r = hash(k * 40 + i + 7) * H * 0.2; nodes.push({ x: W * ct[0] + Math.cos(a) * r * 1.4, y: H * ct[1] + Math.sin(a) * r, k, at: 2 + k * 0.5 + i * 0.12 }); } });
  const link = clamp((t - 3) / 4);
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const A = nodes[i], B = nodes[j], d = Math.hypot(A.x - B.x, A.y - B.y); if (d > H * 0.17 || A.k !== B.k) continue;
    const u = clamp(link * 3 - (i + j) / (nodes.length * 2) * 2); if (u <= 0) continue;
    c.strokeStyle = rgba(cols[A.k], 0.55 * u); c.lineWidth = 1.5; c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(A.x + (B.x - A.x) * u, A.y + (B.y - A.y) * u); c.stroke();
  }
  for (const n of nodes) { const u = ease((t - n.at) / 0.8); if (u <= 0) continue; c.fillStyle = rgba(cols[n.k], 0.95); c.shadowColor = cols[n.k]; c.shadowBlur = 12; c.beginPath(); c.arc(n.x, n.y, 4 * u, 0, TAU); c.fill(); c.shadowBlur = 0; }
  // bridges between the blocs, pulsing
  const br = clamp((t - 6.5) / 2.5);
  for (const [a, b] of [[0, 1], [1, 2], [0, 2]]) {
    const A = centers[a], B = centers[b]; c.strokeStyle = `rgba(230,240,255,${0.35 * br})`; c.setLineDash([6, 8]); c.lineDashOffset = -t * 20; c.beginPath(); c.moveTo(W * A[0], H * A[1]); c.lineTo(W * (A[0] + (B[0] - A[0]) * br), H * (A[1] + (B[1] - A[1]) * br)); c.stroke(); c.setLineDash([]);
  }
  for (let r = 0; r < 3; r++) { const u = ((t * 0.18 + r / 3) % 1); c.strokeStyle = `rgba(150,200,255,${0.4 * (1 - u)})`; c.lineWidth = 1.2; c.beginPath(); c.arc(W / 2, H / 2, u * H * 0.9, 0, TAU); c.stroke(); }
}

// ---- a custom ending: a quiet field of stars, slowly turning ----
function custom(c, W, H, t) {
  const g = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, H); g.addColorStop(0, '#162036'); g.addColorStop(1, '#04060c'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.save(); c.translate(W / 2, H / 2); c.rotate(t * 0.01);
  for (let i = 0; i < 220; i++) { const a = hash(i) * TAU, r = Math.sqrt(hash(i + 9)) * H * 0.95, tw = 0.4 + 0.6 * Math.sin(t * (0.6 + hash(i + 3)) + i); c.fillStyle = `rgba(230,238,255,${(0.25 + 0.6 * hash(i + 5)) * tw * clamp(t / 2)})`; c.beginPath(); c.arc(Math.cos(a) * r * 1.4, Math.sin(a) * r, 0.8 + hash(i + 2) * 1.8, 0, TAU); c.fill(); }
  c.restore();
}

const FILMS = { custom, peace, ceasefire, victory, collapse, stalemate, neworder, ...COLD_FILMS };
export const hasEndingFilm = type => !!FILMS[type];

export function EndingFilm({ state, type }) {
  const cv = useRef(null);
  useEffect(() => {
    const c = cv.current, ctx = c.getContext('2d'), film = FILMS[type]; if (!film) return;
    const blocs = state.blocs || {}, e = state.display.ending || {};
    const S = { color: blocs[e.bloc]?.color, colors: ['A', 'B', 'C'].map(k => blocs[k]?.color || '#9aa7b8') };
    let raf, t = Math.max(0, (Date.now() - state.display.endingAt) / 1000), last = performance.now();
    const size = () => { const d = Math.min(2, devicePixelRatio || 1); c.width = c.clientWidth * d; c.height = c.clientHeight * d; };
    size(); addEventListener('resize', size);
    const frame = now => { t += Math.min(0.1, (now - last) / 1000); last = now; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height); film(ctx, c.width, c.height, t, S); raf = requestAnimationFrame(frame); };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', size); };
  }, [type, state.display.endingAt]);
  return html`<canvas class="end-film" ref=${cv}></canvas>`;
}
