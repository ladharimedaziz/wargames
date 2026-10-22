// Named aircraft and order animations, installed as methods on WorldMap (see renderer.js), so `this` is the map.
// American strike aircraft get their own silhouettes and runs (B-2, F-117, B-52, B-1B), helicopters get AH-64
// and CH-47 shapes for the US, paratroopers drop from transports, and every diplomatic or covert order has a
// short animation. Nothing graphic: light, motion and labels.
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const fade = (u, a = 0.1, b = 0.85) => (u < a ? u / a : u > b ? (1 - u) / (1 - b) : 1);

// Half outlines (y >= 0, mirrored), nose along +x, in units of the aircraft's half-length.
const SHAPES = {
  // Flying wing with the W-shaped trailing edge.
  b2: [[0.62, 0], [0.42, 0.12], [-0.34, 1.18], [-0.5, 1.12], [-0.3, 0.78], [-0.52, 0.46], [-0.32, 0.2], [-0.44, 0]],
  // Faceted arrowhead with the V tail.
  f117: [[1.05, 0], [0.55, 0.12], [-0.45, 0.66], [-0.62, 0.6], [-0.52, 0.2], [-0.9, 0.46], [-1.0, 0.4], [-0.82, 0.08], [-0.86, 0]],
  // Long fuselage, wide shoulder wing, tall tail.
  b52: [[1.1, 0], [0.95, 0.07], [0.3, 0.08], [-0.12, 1.32], [-0.28, 1.32], [-0.14, 0.08], [-0.82, 0.07], [-0.98, 0.46], [-1.1, 0.46], [-1.06, 0]],
  // Blended body with wings swept back for the dash.
  b1b: [[1.18, 0], [0.8, 0.08], [0.35, 0.16], [0.1, 0.36], [-0.48, 0.92], [-0.6, 0.88], [-0.28, 0.2], [-0.78, 0.16], [-0.98, 0.52], [-1.1, 0.52], [-1.08, 0]],
  // C-17 style transport: high straight wing, T-tail.
  transport: [[1, 0], [0.82, 0.12], [0.2, 0.14], [0.02, 1.1], [-0.16, 1.1], [-0.12, 0.14], [-0.76, 0.12], [-0.86, 0.42], [-0.98, 0.42], [-0.96, 0]],
};
const LABEL = { b2: 'B-2 SPIRIT', f117: 'F-117 NIGHTHAWK', b52: 'B-52 STRATOFORTRESS', b1b: 'B-1B LANCER' };

export const AIRCRAFT_FX = {
  drawModel(ctx, model, x, y, ang, s, color) {
    const P = SHAPES[model]; if (!P) return this.drawBomber(ctx, x, y, ang, s, color);
    this.silhouette(ctx, x, y, ang, s, color, P);
    // B-52: eight engines in four pods under the wings.
    if (model === 'b52') {
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.fillStyle = '#9aa3ae';
      for (const side of [-1, 1]) for (const f of [0.32, 0.68]) { const px = 0.18 - f * 0.42, py = side * (0.1 + f * 1.15); ctx.fillRect((px - 0.12) * s, (py - 0.04) * s, 0.22 * s, 0.08 * s); }
      ctx.restore();
    }
  },

  // B-2 and F-117: dark shapes that are hard to see, no contrail, a quiet glide in, and precision hits
  // (several bombs on separate marks for the B-2). The B-2 can instead drop the heavy bomb (MOAB): one large weapon
  // under a parachute, then a wide pressure ring across the area.
  strikeStealth(ctx, fx, u, now) {
    const e = fx.e, model = e.model, moab = e.payload === 'moab';
    const a = this.pt(e.from) || this.countryPoint(e.owner), b = this.pt(e.to) || this.countryPoint(e.target);
    if (!a || !b) return;
    const sc = clamp(Math.sqrt(this.cam.k), 1, 2.2);
    let dx = b[0] - a[0], dy = b[1] - a[1]; const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    const nx = -dy, ny = dx;
    const over = [b[0] + dx * 12 * sc, b[1] + dy * 12 * sc], exit = [b[0] + dx * 60 * sc + nx * 30 * sc, b[1] + dy * 60 * sc + ny * 30 * sc];
    const start = len > 220 ? [b[0] - dx * 220, b[1] - dy * 220] : a;
    const T1 = 0.5, TR = moab ? 0.78 : 0.66;
    const where = w => (w < T1 ? this.pathPoint([start, over], easeInOut(w / T1)) : this.pathPoint([over, exit], ease((w - T1) / (1 - T1))));
    const downed = e.intercepted, meet = 0.4;
    const s = (model === 'b2' ? 9 : 6) * sc;
    // A faint shimmer instead of a contrail: the aircraft only shows clearly close to the target.
    const q = where(downed ? Math.min(u, meet) : u);
    const vis = downed ? 1 : clamp(0.35 + 0.65 * (1 - Math.abs(u - T1) / 0.35), 0.35, 1);
    ctx.globalAlpha = vis * fade(u, 0.06, 0.9);
    const body = model === 'b2' ? '#2c323c' : '#1d2026';
    this.drawModel(ctx, model, q[0], q[1], q[2], s, body);
    // Rim light so the dark shape reads on a dark map.
    ctx.save(); ctx.translate(q[0], q[1]); ctx.rotate(q[2]); ctx.scale(s, s);
    const P = SHAPES[model]; ctx.beginPath(); P.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); for (let i = P.length - 1; i >= 0; i--) ctx.lineTo(P[i][0], -P[i][1]);
    ctx.closePath(); ctx.strokeStyle = 'rgba(170,200,255,0.75)'; ctx.lineWidth = 0.9 / s; ctx.stroke(); ctx.restore();
    ctx.globalAlpha = 1;
    if (downed) { this.shootDown(ctx, this.pt(e.at) || b, where(meet), (u - 0.2) / (meet - 0.2), (u - meet) / 0.35); return; }
    if (u > 0.2 && u < TR + 0.2) this.tag(ctx, q[0], q[1] - 16 * sc, LABEL[model], '#c9d6ff');
    if (moab) {
      // One large bomb leaves the bay, a parachute opens, it settles onto the target, then the pressure wave.
      const rel = T1 - 0.04;
      const relPt = where(rel);
      if (u > rel && u < TR) {
        const v = (u - rel) / (TR - rel), x = relPt[0] + (b[0] - relPt[0]) * ease(v), y = relPt[1] + (b[1] - relPt[1]) * v;
        if (v > 0.15) { ctx.strokeStyle = 'rgba(230,230,235,0.8)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3 * sc, y - 7 * sc); ctx.moveTo(x, y); ctx.lineTo(x + 3 * sc, y - 7 * sc); ctx.stroke();
          ctx.fillStyle = 'rgba(240,240,245,0.85)'; ctx.beginPath(); ctx.arc(x, y - 8 * sc, 4 * sc, Math.PI, 0); ctx.fill(); }
        ctx.fillStyle = '#c8ccd2'; ctx.beginPath(); ctx.ellipse(x, y, 2.6 * sc, 1.2 * sc, 0, 0, TAU); ctx.fill();
      }
      const iv = (u - TR) / (1 - TR);
      if (iv > 0) {
        if (!fx.hit) { fx.hit = true; this.flash = { start: performance.now(), dur: 0.8, alpha: 0.28 }; this.shakeScreen?.(5, 1.1); }
        const R = ease(iv) * 70 * sc;
        const g = ctx.createRadialGradient(b[0], b[1], 0, b[0], b[1], R + 1);
        g.addColorStop(0, `rgba(255,250,225,${0.9 * (1 - iv)})`); g.addColorStop(0.4, `rgba(255,170,80,${0.55 * (1 - iv)})`); g.addColorStop(1, 'rgba(255,120,50,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b[0], b[1], R + 1, 0, TAU); ctx.fill();
        for (let i = 0; i < 3; i++) { const w = clamp(iv * 1.4 - i * 0.15, 0, 1); if (!w || w >= 1) continue; ctx.strokeStyle = `rgba(255,236,200,${1 - w})`; ctx.lineWidth = 2 - i * 0.5; ctx.beginPath(); ctx.ellipse(b[0], b[1], ease(w) * 95 * sc, ease(w) * 60 * sc, 0, 0, TAU); ctx.stroke(); }
        ctx.fillStyle = `rgba(150,140,130,${0.4 * (1 - iv)})`; ctx.beginPath(); ctx.arc(b[0], b[1] - iv * 22 * sc, 6 * sc + iv * 14 * sc, 0, TAU); ctx.fill();
        if (iv < 0.8) this.tag(ctx, b[0], b[1] + 26 * sc, 'MOAB · GBU-43', '#ffd27a');
      }
      return;
    }
    // Precision: brackets on each mark, then guided bombs land together.
    if (!fx.marks) {
      const n = model === 'b2' ? 4 : 1;
      fx.marks = Array.from({ length: n }, (_, i) => { const an = (i / n) * TAU + 0.6; const r = n > 1 ? 9 * sc : 0; return { dx: Math.cos(an) * r, dy: Math.sin(an) * r * 0.6 }; });
    }
    const lock = (u - 0.25) / (T1 - 0.25);
    for (const m of fx.marks) {
      const tx = b[0] + m.dx, ty = b[1] + m.dy;
      if (lock > 0 && u < TR) {
        const r = (8 - 4 * ease(Math.min(1, lock))) * sc; ctx.strokeStyle = lock >= 1 ? '#7dffb0' : '#c8ffd9'; ctx.lineWidth = 1;
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.beginPath(); ctx.moveTo(tx + sx * r, ty + sy * r * 0.5); ctx.lineTo(tx + sx * r, ty + sy * r); ctx.lineTo(tx + sx * r * 0.5, ty + sy * r); ctx.stroke(); }
      }
      // F-117: its own laser on the mark.
      if (model === 'f117' && u > T1 - 0.1 && u < TR) { ctx.strokeStyle = 'rgba(120,255,170,0.6)'; ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]); }
      const relPt = where(T1 - 0.02), gv = (u - T1 + 0.02) / (TR - T1 + 0.02);
      if (gv > 0 && gv < 1) { ctx.fillStyle = '#e8eef8'; ctx.beginPath(); ctx.arc(relPt[0] + (tx - relPt[0]) * gv, relPt[1] + (ty - relPt[1]) * gv, 1.3, 0, TAU); ctx.fill(); }
      const iv = (u - TR) / 0.22;
      if (iv > 0 && iv < 1) { this.boom(ctx, tx, ty, 6 * sc, iv, 1.3); ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - iv)})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(tx, ty, 2 + iv * 8 * sc, 0, TAU); ctx.stroke(); }
    }
    if (u > TR && u < TR + 0.25) this.tag(ctx, b[0], b[1] + 22 * sc, 'PRECISION STRIKE', '#ffd27a');
  },

  // --- helicopters: AH-64 Apache and CH-47 Chinook for the US ---
  drawApache(ctx, x, y, ang, s, now) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(s * 0.5, s * 0.9, s * 1.3, s * 0.35, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#4a5240'; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 0.7;
    // Narrow fuselage with the tandem cockpit, long tail boom, tail fin and rotor.
    ctx.beginPath(); ctx.moveTo(s * 1.0, 0); ctx.quadraticCurveTo(s * 0.8, -s * 0.24, s * 0.2, -s * 0.24); ctx.lineTo(-s * 0.2, -s * 0.14); ctx.lineTo(-s * 1.55, -s * 0.06); ctx.lineTo(-s * 1.55, s * 0.06); ctx.lineTo(-s * 0.2, s * 0.14); ctx.lineTo(s * 0.2, s * 0.24); ctx.quadraticCurveTo(s * 0.8, s * 0.24, s * 1.0, 0); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#9fb6c8'; ctx.beginPath(); ctx.ellipse(s * 0.62, 0, s * 0.2, s * 0.1, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(s * 0.32, 0, s * 0.16, s * 0.1, 0, 0, TAU); ctx.fill();
    // Stub wings with rocket pods and Hellfire rails.
    ctx.fillStyle = '#3c4334'; ctx.fillRect(-s * 0.05, -s * 0.62, s * 0.22, s * 1.24);
    ctx.fillStyle = '#2a2f25'; for (const yy of [-0.56, -0.38, 0.38, 0.56]) { ctx.beginPath(); ctx.ellipse(s * 0.06, yy * s, s * 0.17, s * 0.06, 0, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#3c4334'; ctx.fillRect(-s * 1.6, -s * 0.3, s * 0.12, s * 0.6);
    // Four-blade main rotor, tail rotor.
    const r = s * 1.35, a0 = now / 35;
    ctx.fillStyle = 'rgba(220,230,240,0.1)'; ctx.beginPath(); ctx.arc(s * 0.15, 0, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(230,236,245,0.85)'; ctx.lineWidth = 0.9;
    for (let i = 0; i < 4; i++) { const t = a0 + i * Math.PI / 2; ctx.beginPath(); ctx.moveTo(s * 0.15, 0); ctx.lineTo(s * 0.15 + Math.cos(t) * r, Math.sin(t) * r); ctx.stroke(); }
    const ta = now / 20; ctx.beginPath(); ctx.moveTo(-s * 1.55 + Math.cos(ta) * s * 0.28, -s * 0.12 + Math.sin(ta) * s * 0.28); ctx.lineTo(-s * 1.55 - Math.cos(ta) * s * 0.28, -s * 0.12 - Math.sin(ta) * s * 0.28); ctx.stroke();
    ctx.restore();
  },
  drawChinook(ctx, x, y, ang, s, now) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(s * 0.5, s * 0.9, s * 1.6, s * 0.45, 0, 0, TAU); ctx.fill();
    // Long boxy fuselage, rear pylon, side fuel pods, cockpit glazing.
    ctx.fillStyle = '#596150'; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.roundRect(-s * 1.45, -s * 0.3, s * 2.75, s * 0.6, s * 0.28); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#4b5243'; ctx.fillRect(-s * 0.9, -s * 0.42, s * 1.3, s * 0.12); ctx.fillRect(-s * 0.9, s * 0.3, s * 1.3, s * 0.12);
    ctx.beginPath(); ctx.roundRect(-s * 1.5, -s * 0.22, s * 0.5, s * 0.44, s * 0.1); ctx.fill();
    ctx.fillStyle = '#9fb6c8'; ctx.beginPath(); ctx.ellipse(s * 1.12, 0, s * 0.16, s * 0.2, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; for (let i = 0; i < 5; i++) ctx.fillRect(s * (0.6 - i * 0.35), -s * 0.04, s * 0.14, s * 0.08);
    // Tandem three-blade rotors turning in opposite directions.
    for (const [hx, dir] of [[s * 0.95, 1], [-s * 1.2, -1]]) {
      const r = s * 1.15, a0 = dir * now / 45;
      ctx.fillStyle = 'rgba(220,230,240,0.1)'; ctx.beginPath(); ctx.arc(hx, 0, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(230,236,245,0.85)'; ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) { const t = a0 + i * TAU / 3; ctx.beginPath(); ctx.moveTo(hx, 0); ctx.lineTo(hx + Math.cos(t) * r, Math.sin(t) * r); ctx.stroke(); }
    }
    ctx.restore();
  },

  // Paratroopers: transports cross at altitude and canopies open behind them, drifting down onto the drop zone.
  fx_airdrop(ctx, fx, u, now) {
    const e = fx.e, b = this.pt(e.to) || this.countryPoint(e.country); if (!b) return;
    const a0 = this.pt(e.from) || this.countryPoint(e.owner);
    const sc = clamp(Math.sqrt(this.cam.k), 1, 2.2);
    let dx = a0 ? b[0] - a0[0] : 1, dy = a0 ? b[1] - a0[1] : 0; const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    const nx = -dy, ny = dx, span = 120 * sc;
    const p0 = [b[0] - dx * span, b[1] - dy * span], p1 = [b[0] + dx * span, b[1] + dy * span];
    const owner = this.state.countries[e.owner], col = owner && owner.bloc !== 'N' ? this.state.blocs[owner.bloc].color : '#d5dbe4';
    const n = clamp((e.n || 1) + 1, 2, 3);
    if (!fx.chutes) fx.chutes = Array.from({ length: 22 }, (_, i) => ({ t: 0.36 + (i / 22) * 0.2, side: (Math.random() - 0.5) * 18 * sc, drift: (Math.random() - 0.5) * 8 * sc, ship: i % n }));
    for (let i = 0; i < n; i++) {
      const lag = i * 0.03, v = clamp((u - lag) / 0.8, 0, 1);
      const off = (i - (n - 1) / 2) * 10 * sc;
      const x = p0[0] + (p1[0] - p0[0]) * v + nx * off, y = p0[1] + (p1[1] - p0[1]) * v + ny * off;
      ctx.strokeStyle = 'rgba(235,240,255,0.28)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - dx * 30 * sc, y - dy * 30 * sc); ctx.lineTo(x, y); ctx.stroke();
      ctx.globalAlpha = v > 0.92 ? (1 - v) / 0.08 : 1;
      this.drawModel(ctx, 'transport', x, y, Math.atan2(dy, dx), 7 * sc, '#cfd6df');
      ctx.globalAlpha = 1;
    }
    for (const c of fx.chutes) {
      const v = (u - c.t) / 0.4; if (v <= 0 || v >= 1.3) continue;
      const off = (c.ship - (n - 1) / 2) * 10 * sc;
      const sx = b[0] + (c.t - 0.46) / 0.2 * span * 0.5 * dx + nx * (off + c.side), sy = b[1] + (c.t - 0.46) / 0.2 * span * 0.5 * dy + ny * (off + c.side);
      const t = clamp(v, 0, 1), x = sx + c.drift * t, y = sy - (1 - t) * 20 * sc;
      ctx.globalAlpha = v > 1 ? 1 - (v - 1) / 0.3 : 1;
      if (t < 1) {
        ctx.fillStyle = '#eef2f6'; ctx.beginPath(); ctx.arc(x, y - 3.2 * sc, 2.6 * sc, Math.PI, 0); ctx.fill();
        ctx.strokeStyle = 'rgba(230,235,240,0.7)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(x - 2.6 * sc, y - 3.2 * sc); ctx.lineTo(x, y); ctx.lineTo(x + 2.6 * sc, y - 3.2 * sc); ctx.stroke();
      }
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 1.2, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (u > 0.3 && u < 0.95) this.tag(ctx, b[0], b[1] + 24 * sc, e.lost ? `PARATROOPERS · ${e.lost} TRANSPORT${e.lost > 1 ? 'S' : ''} LOST` : 'PARATROOPERS', '#9fe0ff');
  },

  // --- every other order ---
  fx_diplo(ctx, fx, u, now) {
    const e = fx.e, S = this.state, ar = this.opts.lang === 'ar';
    const A = this.countryPoint(e.a || e.owner), B = (e.b || e.target) ? this.countryPoint(e.b || e.target) : null;
    if (!A) return;
    const f = fade(u, 0.1, 0.82), sc = clamp(Math.sqrt(this.cam.k), 1, 2);
    const blocCol = id => { const c = S.countries[id]; return c && c.bloc !== 'N' ? S.blocs[c.bloc].color : '#c8d2e0'; };
    const arc = (col, dash, w = 1.4, bend = 0.2, upto = 1) => {
      if (!B) return; ctx.strokeStyle = col; ctx.lineWidth = w; ctx.setLineDash(dash || []); ctx.lineDashOffset = -now / 40;
      ctx.beginPath(); for (let i = 0; i <= 24; i++) { const q = this.onCurve(A, B, (i / 24) * upto, bend); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); } ctx.stroke(); ctx.setLineDash([]);
    };
    const mid = B ? this.onCurve(A, B, 0.5, 0.2) : [A[0], A[1] - 18];
    const label = (en, arTxt, col, at = mid) => { ctx.globalAlpha = f; this.tag(ctx, at[0], at[1] - 12, ar ? arTxt : en, col); ctx.globalAlpha = 1; };
    const travel = (n, draw, bend = 0.2) => { if (!B) return; for (let i = 0; i < n; i++) { const v = ((u * 1.4) - i * 0.08); if (v <= 0 || v >= 1) continue; const q = this.onCurve(A, B, ease(v), bend); draw(q, v); } };
    ctx.globalAlpha = f;
    switch (e.kind) {
      case 'aid':
        arc('rgba(255,214,120,0.45)', [3, 4]);
        travel(6, q => { ctx.fillStyle = '#ffd678'; ctx.beginPath(); ctx.arc(q[0], q[1], 2.4, 0, TAU); ctx.fill(); ctx.fillStyle = '#7a5a10'; ctx.font = '700 4px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('$', q[0], q[1] + 0.3); });
        label(`$${e.amount}BN AID`, `مساعدات ${e.amount} مليار$`, '#ffd678'); break;
      case 'arms':
        arc('rgba(200,210,225,0.4)', [2, 4]);
        travel(1, q => this.drawModel(ctx, 'transport', q[0], q[1], q[2], 6 * sc, '#cfd6df'));
        label('ARMS SHIPMENT', 'شحنة أسلحة', '#d5dbe4'); break;
      case 'trade':
        arc('rgba(61,220,151,0.5)', [4, 4], 1.3, 0.16); arc('rgba(61,220,151,0.35)', [4, 4], 1.3, -0.16);
        travel(4, q => { ctx.fillStyle = '#3ddc97'; ctx.fillRect(q[0] - 1.8, q[1] - 1.8, 3.6, 3.6); }, 0.16);
        label('TRADE DEAL', 'اتفاق تجاري', '#3ddc97'); break;
      case 'alliance':
        for (const id of [e.a, e.b]) this.outline?.(ctx, id, `rgba(120,200,255,${0.8 * f})`, 2);
        arc(`rgba(150,220,255,${0.9 * f})`, null, 2);
        label('ALLIANCE', 'تحالف', '#9fd8ff'); break;
      case 'sanction': case 'unsanction': {
        const lift = e.kind === 'unsanction';
        arc(lift ? 'rgba(61,220,151,0.6)' : 'rgba(255,90,90,0.6)', [6, 4], 1.6, 0.2, ease(u / 0.5));
        if (B && u > 0.45) { const r = 8 + 3 * Math.sin(now / 150); ctx.strokeStyle = lift ? '#3ddc97' : '#ff5a5a'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(B[0], B[1], r, 0, TAU); ctx.stroke();
          if (!lift) { ctx.beginPath(); ctx.moveTo(B[0] - r * 0.7, B[1] - r * 0.7); ctx.lineTo(B[0] + r * 0.7, B[1] + r * 0.7); ctx.stroke(); } }
        label(lift ? 'SANCTIONS LIFTED' : 'SANCTIONS', lift ? 'رفع العقوبات' : 'عقوبات', lift ? '#3ddc97' : '#ff7a7a'); break;
      }
      case 'ceasefire': case 'peace':
        ctx.globalAlpha = 1; this.fx_peace?.(ctx, { e: { a: e.a, b: e.b } }, u, now);
        if (e.kind === 'peace') label('PEACE TREATY', 'معاهدة سلام', '#c8ffe0', [mid[0], mid[1] - 16]);
        break;
      case 'overflight':
        arc('rgba(160,220,255,0.55)', [2, 3]);
        travel(1, q => this.drawJet(ctx, q[0], q[1], q[2], 4 * sc, '#cfe8ff'));
        label('OVERFLIGHT RIGHTS', 'حق العبور الجوي', '#9fd8ff'); break;
      case 'cyber': {
        // Streams of digits along the link, then the target's outline glitches.
        if (B) { ctx.font = '600 7px JetBrains Mono, monospace'; ctx.fillStyle = '#7dffb0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          for (let i = 0; i < 14; i++) { const v = ((u * 1.6) + i / 14) % 1; const q = this.onCurve(A, B, v, 0.18); ctx.globalAlpha = f * (1 - Math.abs(v - 0.5)); ctx.fillText(((i * 7 + Math.floor(now / 90)) % 2) ? '1' : '0', q[0], q[1]); } }
        ctx.globalAlpha = f;
        if (u > 0.45 && Math.sin(now / 30) > 0) { const jx = (Math.random() - 0.5) * 3; ctx.save(); ctx.translate(jx, 0); this.outline?.(ctx, e.target, 'rgba(125,255,176,0.8)', 1.5); ctx.restore(); }
        label(e.detected ? 'CYBER ATTACK · DETECTED' : 'CYBER ATTACK', 'هجوم إلكتروني', '#7dffb0', B || A); break;
      }
      case 'intel': case 'satellite': {
        // A satellite sweeps across the target with a scanning beam.
        const T = B || A, x = T[0] - 60 + 120 * u, y = T[1] - 48;
        ctx.fillStyle = '#dfe8f5'; ctx.fillRect(x - 2, y - 1.5, 4, 3); ctx.fillStyle = '#6aa8ff'; ctx.fillRect(x - 8, y - 1, 5, 2); ctx.fillRect(x + 3, y - 1, 5, 2);
        const g = ctx.createLinearGradient(x, y, x, T[1]); g.addColorStop(0, `rgba(120,200,255,${0.4 * f})`); g.addColorStop(1, 'rgba(120,200,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 16, T[1] + 6); ctx.lineTo(x + 16, T[1] + 6); ctx.closePath(); ctx.fill();
        label(e.kind === 'satellite' ? 'SATELLITES BLINDED' : 'INTELLIGENCE SWEEP', e.kind === 'satellite' ? 'تعطيل الأقمار الصناعية' : 'مسح استخباراتي', '#9fd8ff', [T[0], T[1] + 26]); break;
      }
      case 'spy': {
        // A small figure-dot slips across in hops.
        if (B) { const hop = Math.floor(u * 6) / 6 + ease((u * 6) % 1) / 6, q = this.onCurve(A, B, Math.min(1, hop), -0.15); ctx.fillStyle = '#e6e6e6'; ctx.beginPath(); ctx.arc(q[0], q[1], 1.8, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(230,230,230,0.35)'; ctx.setLineDash([1, 3]); arc('rgba(230,230,230,0.25)', [1, 3], 1, -0.15, Math.min(1, hop)); }
        label(e.detected ? 'COVERT OPERATION · EXPOSED' : 'COVERT OPERATION', 'عملية سرية', '#e6e6e6', B || A); break;
      }
      case 'propaganda':
        for (let i = 0; i < 4; i++) { const v = ((u * 2) + i / 4) % 1; ctx.strokeStyle = `rgba(255,180,90,${(1 - v) * 0.7 * f})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(A[0], A[1], 4 + v * 40, -0.9, 0.9); ctx.stroke(); ctx.beginPath(); ctx.arc(A[0], A[1], 4 + v * 40, Math.PI - 0.9, Math.PI + 0.9); ctx.stroke(); }
        label(e.backfire ? 'PROPAGANDA BACKFIRES' : 'PROPAGANDA CAMPAIGN', 'حملة دعائية', '#ffb45a', A); break;
      case 'alert':
        for (let i = 0; i < 3; i++) { const v = ((u * 1.5) + i / 3) % 1; ctx.strokeStyle = `rgba(255,190,60,${(1 - v) * 0.8 * f})`; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(A[0], A[1], 5 + v * 26, 0, TAU); ctx.stroke(); }
        label('NUCLEAR FORCES ON ALERT', 'القوات النووية في حالة تأهب', '#ffbe3c', A); break;
      case 'lift':
        for (let i = 0; i < 3; i++) { const v = ((u * 1.5) + i / 3) % 1; ctx.strokeStyle = `rgba(61,220,151,${(1 - v) * 0.7 * f})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(A[0], A[1], 5 + v * 22, 0, TAU); ctx.stroke(); }
        label('BLOCKADES LIFTED', 'رفع الحصار', '#3ddc97', A); break;
      case 'roe': {
        const col = e.value === 'forward' ? '#ff8a5c' : e.value === 'defensive' ? '#9fd8ff' : '#ffd678';
        for (let i = 0; i < 3; i++) { const y = A[1] - 6 - i * 5 - (u * 10) % 5; ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(A[0] - 5, y + 3); ctx.lineTo(A[0], y); ctx.lineTo(A[0] + 5, y + 3); ctx.stroke(); }
        label(`POSTURE: ${String(e.value).toUpperCase()}`, 'تغيير الجاهزية', col, A); break;
      }
      case 'election': {
        const good = e.outcome !== 'ousted';
        ctx.strokeStyle = good ? '#3ddc97' : '#ff8a5c'; ctx.lineWidth = 1.4; ctx.strokeRect(A[0] - 5, A[1] - 22, 10, 9);
        if (u > 0.3) { ctx.beginPath(); ctx.moveTo(A[0] - 3, A[1] - 18); ctx.lineTo(A[0] - 1, A[1] - 15.5); ctx.lineTo(A[0] + 3.5, A[1] - 21); ctx.stroke(); }
        label(good ? 'GOVERNMENT RE-ELECTED' : 'GOVERNMENT OUSTED', good ? 'إعادة انتخاب الحكومة' : 'سقوط الحكومة', good ? '#3ddc97' : '#ff8a5c', A); break;
      }
    }
    ctx.globalAlpha = 1;
  },
};

export const DIPLO_KINDS = ['aid', 'arms', 'trade', 'alliance', 'sanction', 'unsanction', 'ceasefire', 'peace', 'overflight', 'cyber', 'intel', 'satellite', 'spy', 'propaganda', 'alert', 'lift', 'roe', 'election'];
