// Sign-in screen with a slowly turning globe behind it.
import { html, useState, useEffect, useRef } from '../lib.js';
import { geoOrthographic, geoPath, geoGraticule10 } from 'd3-geo';
import { loadAtlas } from '../map/atlas.js';
import { AIRPORTS } from '/shared/data/places.js';

export function Globe({ speed = 6, tilt = -18, className = 'login-globe', glow = '#ece6d6', arcs = true }) {
  const ref = useRef();
  useEffect(() => {
    const canvas = ref.current, ctx = canvas.getContext('2d');
    let raf, atlas, w, h, dpr;
    const proj = geoOrthographic().clipAngle(90);
    const path = geoPath(proj, ctx);
    const grat = geoGraticule10();
    const routes = Array.from({ length: 26 }, () => {
      const a = AIRPORTS[Math.floor(Math.random() * AIRPORTS.length)], b = AIRPORTS[Math.floor(Math.random() * AIRPORTS.length)];
      return { a: [a.lon, a.lat], b: [b.lon, b.lat], off: Math.random() };
    });
    const size = () => { const r = canvas.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); w = r.width; h = r.height; canvas.width = w * dpr; canvas.height = h * dpr; proj.translate([w / 2, h / 2]).scale(Math.min(w, h) * 0.46); };
    size();
    const ro = new ResizeObserver(size); ro.observe(canvas);
    loadAtlas().then(a => { atlas = a.lo; });
    const t0 = performance.now();
    const draw = now => {
      const t = (now - t0) / 1000;
      proj.rotate([t * speed - 40, tilt]);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const r = proj.scale();
      const g = ctx.createRadialGradient(w / 2 - r * 0.3, h / 2 - r * 0.3, r * 0.1, w / 2, h / 2, r * 1.05);
      g.addColorStop(0, '#0c2238'); g.addColorStop(1, '#03070d');
      ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = g; ctx.fill();
      ctx.beginPath(); path(grat); ctx.strokeStyle = 'rgba(236,230,214,0.07)'; ctx.lineWidth = 0.6; ctx.stroke();
      if (atlas) {
        ctx.beginPath(); for (const c of atlas.countries) path(c.feature); ctx.fillStyle = 'rgba(30,60,90,0.55)'; ctx.fill();
        ctx.beginPath(); path(atlas.borders); ctx.strokeStyle = 'rgba(236,230,214,0.18)'; ctx.lineWidth = 0.5; ctx.stroke();
      }
      if (arcs) for (const rt of routes) {
        const u = (t * 0.12 + rt.off) % 1;
        ctx.beginPath(); path({ type: 'LineString', coordinates: [rt.a, rt.b] }); ctx.strokeStyle = 'rgba(217,164,65,0.10)'; ctx.lineWidth = 0.8; ctx.stroke();
        const p = proj(interp(rt.a, rt.b, u));
        if (p && isVisible(proj, interp(rt.a, rt.b, u))) { ctx.fillStyle = 'rgba(255,200,120,0.9)'; ctx.beginPath(); ctx.arc(p[0], p[1], 1.6, 0, 7); ctx.fill(); }
      }
      ctx.beginPath(); path({ type: 'Sphere' }); ctx.strokeStyle = glow; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.2; ctx.stroke(); ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);
  return html`<canvas class=${className} ref=${ref}></canvas>`;
}

function interp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
function isVisible(proj, p) { const r = proj.rotate(); const lon = (p[0] + r[0]) * Math.PI / 180, lat = p[1] * Math.PI / 180, phi = -r[1] * Math.PI / 180; return Math.cos(lat) * Math.cos(lon) * Math.cos(phi) + Math.sin(lat) * Math.sin(phi) > 0; }

export function Login({ onDone }) {
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Sign-in failed.');
      onDone(j.user);
    } catch (err) { setError(err.message); setBusy(false); }
  };
  return html`
    <div class="login">
      <${Globe} />
      <div class="login-vignette"></div>
      <form class="login-card" onSubmit=${submit}>
        <div class="login-mark">
          <svg viewBox="0 0 64 64" width="46" height="46"><circle cx="32" cy="32" r="22" fill="none" stroke="#ece6d6" stroke-width="2.4"/><ellipse cx="32" cy="32" rx="10" ry="22" fill="none" stroke="#ece6d6" stroke-width="1.6" opacity=".7"/><path d="M10 32h44M13 21h38M13 43h38" stroke="#ece6d6" stroke-width="1.4" opacity=".5"/><circle cx="32" cy="32" r="4" fill="#d9a441"/></svg>
        </div>
        <h1>THE WORLD ENGINE</h1>
        <p class="login-sub">Crisis simulation control · Riyadh</p>
        <label class="field">Account<input class="input lg-in" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="e.g. ww3-stage" value=${username} onInput=${e => setU(e.target.value)} autofocus /></label>
        <label class="field">Password<input class="input lg-in" type="password" autocomplete="current-password" placeholder="amber-falcon-123" value=${password} onInput=${e => setP(e.target.value)} /></label>
        ${error && html`<div class="login-error">${error}</div>`}
        <button class="btn primary lg" disabled=${busy || !username || !password}>${busy ? 'Signing in…' : 'Enter'}</button>
        <p class="login-foot">Zeus accounts are named after their committee. Kronos signs in as <span class="mono">kronos</span>.</p>
      </form>
    </div>`;
}
