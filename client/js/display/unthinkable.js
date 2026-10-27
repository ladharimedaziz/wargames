// The ending for a nuclear exchange. It cuts in before the missiles land: a launch warning, streaks converging
// from every side, a whiteout, then ash falling on a dark world, the radiation sign, and nuclear winter.
// Abstract by design: no people, no scenes of harm, only light, dark and numbers.
import { html, useEffect, useRef, useState } from '../lib.js';
import { sfx } from '../fx/audio.js';

const WARN = 5.2, FLASH = 6.2; // seconds: launch warning ends, whiteout ends

export function Unthinkable({ state, now }) {
  const e = state.display.ending, ex = e.exchange || {};
  const cv = useRef(null);
  const start = useRef(Math.max(0, (now - state.display.endingAt) / 1000));
  const [t, setT] = useState(start.current);

  useEffect(() => {
    const c = cv.current, ctx = c.getContext('2d');
    let raf, last = performance.now(), el = start.current, fired = new Set();
    const size = () => { c.width = c.clientWidth * devicePixelRatio; c.height = c.clientHeight * devicePixelRatio; };
    size(); addEventListener('resize', size);
    const streaks = Array.from({ length: Math.min(48, ex.strikes || 24) }, (_, i) => {
      const side = i % 4, r = Math.random();
      const from = side === 0 ? [-0.05, r] : side === 1 ? [1.05, r] : side === 2 ? [r, -0.05] : [r, 1.05];
      return { from, to: [0.2 + Math.random() * 0.6, 0.25 + Math.random() * 0.5], at: 0.4 + (i / 48) * 3.6, dur: 1.4 + Math.random() * 0.7 };
    });
    const ash = Array.from({ length: 140 }, () => ({ x: Math.random(), y: Math.random(), v: 0.02 + Math.random() * 0.06, r: 0.6 + Math.random() * 1.8, ph: Math.random() * 6 }));
    const frame = nowMs => {
      const dt = Math.min(0.1, (nowMs - last) / 1000); last = nowMs; el += dt;
      const W = c.width, H = c.height, d = devicePixelRatio;
      ctx.clearRect(0, 0, W, H);
      if (el < FLASH) {
        // Launch warning: dark red, scanlines, streaks converging.
        const pulse = 0.5 + 0.5 * Math.sin(el * 7);
        ctx.fillStyle = `rgba(${40 + pulse * 30},0,6,1)`; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = 'rgba(255,60,60,0.06)'; ctx.lineWidth = 1;
        for (let y = 0; y < H; y += 5 * d) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
        let live = 0;
        for (const s of streaks) {
          const v = (el - s.at) / s.dur; if (v < 0) continue; live++;
          const p = Math.min(1, v), x0 = s.from[0] * W, y0 = s.from[1] * H, x1 = s.to[0] * W, y1 = s.to[1] * H;
          const cx = (x0 + x1) / 2, cy = Math.min(y0, y1) - H * 0.18;
          const at = q => [(1 - q) * (1 - q) * x0 + 2 * (1 - q) * q * cx + q * q * x1, (1 - q) * (1 - q) * y0 + 2 * (1 - q) * q * cy + q * q * y1];
          for (let i = 0; i < 24; i++) {
            const qa = Math.max(0, p - 0.3 + (i / 24) * 0.3), qb = Math.max(0, p - 0.3 + ((i + 1) / 24) * 0.3);
            const A = at(qa), B = at(qb);
            ctx.strokeStyle = `rgba(255,${150 + i * 4},${90 + i * 3},${(i / 24) * 0.9})`; ctx.lineWidth = (1 + (i / 24) * 2.2) * d;
            ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
          }
          const h = at(p);
          const g = ctx.createRadialGradient(h[0], h[1], 0, h[0], h[1], 14 * d);
          g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,120,60,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(h[0], h[1], 14 * d, 0, 6.2832); ctx.fill();
        }
        if (el < WARN && !fired.has('warn')) { fired.add('warn'); sfx.alarm?.(); }
        if (el >= WARN - 0.2 && !fired.has('boom')) { fired.add('boom'); sfx.boom?.(2); }
        // Whiteout, building into the flash and fading out after it.
        const wo = el < WARN ? 0 : Math.min(1, (el - WARN) / 0.35) * (el < FLASH - 0.6 ? 1 : Math.max(0, (FLASH - el) / 0.6));
        if (wo > 0) { ctx.fillStyle = `rgba(255,252,240,${wo})`; ctx.fillRect(0, 0, W, H); }
      } else {
        // After: ash drifting down through a dark, cold world.
        const k = Math.min(1, (el - FLASH) / 6);
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
        const sky = ctx.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, `rgba(40,30,28,${0.5 - k * 0.2})`); sky.addColorStop(1, `rgba(80,30,10,${0.35 * (1 - k)})`);
        ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
        for (const a of ash) {
          a.y += a.v * dt; a.x += Math.sin(el * 0.6 + a.ph) * 0.004 * dt * 60; if (a.y > 1.02) { a.y = -0.02; a.x = Math.random(); }
          ctx.fillStyle = `rgba(200,200,205,${0.25 + 0.4 * a.r / 2.4})`; ctx.beginPath(); ctx.arc(a.x * W, a.y * H, a.r * d, 0, 6.2832); ctx.fill();
        }
      }
      setT(el);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const timers = [setTimeout(() => sfx.heartbeat?.(), (FLASH - el) * 1000 + 600)].filter(Boolean);
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', size); timers.forEach(clearTimeout); };
  }, []);

  const after = Math.max(0, t - FLASH);
  const temp = Math.round(14 - Math.min(1, after / 14) * 23); // degrees C, falling to -9
  return html`<div class="unthinkable">
    <canvas ref=${cv}></canvas>
    ${t < WARN && html`<div class="ut-warn">
      <div class="ut-w1">LAUNCH DETECTED</div>
      <div class="ut-w2">${Math.min(ex.strikes || 0, Math.round(((t - 0.4) / 3.6) * (ex.strikes || 0)))} <span>WARHEADS IN FLIGHT</span></div>
      <div class="ut-w3">${(ex.firing || []).join(' · ')}</div>
    </div>`}
    ${t >= FLASH && html`<div class="ut-end">
      <div class="ut-sign" style=${`opacity:${Math.min(1, after / 1.5)}`}>☢</div>
      <h1 style=${`opacity:${Math.min(1, Math.max(0, after - 1) / 1.5)}`}>${e.title}</h1>
      <p style=${`opacity:${Math.min(1, Math.max(0, after - 3) / 1.5)}`}>${e.line}</p>
      ${after > 6 && html`<div class="ut-winter">
        <div><b>${temp > 0 ? '+' : ''}${temp}°C</b><span>average world temperature</span></div>
        <div><b>NUCLEAR WINTER</b><span>the sun is gone for years</span></div>
        <div><b>${ex.strikes}</b><span>warheads</span></div>
        <div><b>${ex.struck?.length}</b><span>countries struck</span></div>
      </div>`}
      ${after > 10 && html`<div class="ut-foot">Radiation across the northern hemisphere. Harvests fail. Estimated dead: more than ${Math.max(1, ex.deadMillions || 1).toLocaleString('en-US')} million.</div>`}
      ${after > 13 && html`<div class="ut-last">There is no winner.</div>`}
    </div>`}
  </div>`;
}
