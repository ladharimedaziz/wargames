// Small drawn side-view silhouettes for units without a seal or flag, and a cache for the seal, flag and photo images.
// Silhouettes are drawn here as plain shapes, so there is nothing to license. Each is designed in a 48 x 26 box facing right.
const SIL = {
  tank: 'M4 17 L8 13 H40 L44 17 L40 22 H8Z M16 13 L18 8 H32 L34 13Z M33 9 H47 V11 H33Z',
  infantry: 'M22 2 a3 3 0 1 0 .01 0Z M19 7 H26 L28 17 H18Z M19 17 H22 V25 H19Z M23 17 H26 V25 H23Z M26 10 L41 8 V10 L26 13Z',
  fighter: 'M2 14 L14 12 L36 11 L46 13 L36 15 L14 16Z M8 13 L4 4 L10 4 L15 12Z M20 14 L29 22 L34 22 L30 14Z',
  bomber: 'M2 13 L40 11 L46 13 L40 15Z M6 12 L3 3 L9 3 L14 12Z M14 14 L30 23 L35 23 L27 14Z M19 18 H26 V22 H19Z',
  helicopter: 'M12 15 Q12 9 22 9 Q32 9 32 15 Q32 20 22 20 Q12 20 12 15Z M30 13 L46 12 V14 L30 17Z M44 7 H46 V15 H44Z M6 6 H40 V8 H6Z M21 6 H23 V10 H21Z M11 22 H34 V23.5 H11Z',
  carrier: 'M1 15 H47 V17 L42 23 H8Z M30 7 H36 V15 H30Z M33 2 H34.5 V7 H33Z',
  destroyer: 'M2 16 H46 L40 23 H6Z M16 10 H32 V16 H16Z M24 3 H25.5 V10 H24Z M7 13 H14 V16 H7Z',
  ship: 'M3 16 H45 L39 23 H8Z M14 10 H30 V16 H14Z M22 5 H24 V10 H22Z M33 12 H40 V16 H33Z',
  sub: 'M2 17 Q4 11 12 11 H38 Q46 11 46 17 Q46 23 38 23 H12 Q4 23 2 17Z M20 5 H28 V11 H20Z M27 2 H29 V6 H27Z',
  missile: 'M2 14 L10 12 H38 L46 14 L38 16 H10Z M8 12 L4 5 L13 12Z M8 16 L4 23 L13 16Z',
  satellite: 'M18 8 H30 V18 H18Z M3 10 H16 V16 H3Z M32 10 H45 V16 H32Z M22 18 H26 V23 H22Z',
  shield: 'M24 1 L42 5 V14 Q42 22 24 25 Q6 22 6 14 V5Z',
  guard: 'M24 1 L42 5 V14 Q42 22 24 25 Q6 22 6 14 V5Z',
  police: 'M3 18 L8 12 L16 9 H31 L38 12 L45 13 V20 H3Z M20 5 H27 V9 H20Z',
  person: 'M24 2 a5 5 0 1 0 .01 0Z M12 25 Q12 12 24 12 Q36 12 36 25Z',
  truck: 'M2 7 H29 V19 H2Z M30 11 H40 L46 16 V19 H30Z M9 18 a3.5 3.5 0 1 0 .01 0Z M23 18 a3.5 3.5 0 1 0 .01 0Z M38 18 a3.5 3.5 0 1 0 .01 0Z',
  fire: 'M2 9 H34 V19 H2Z M35 11 H43 L46 16 V19 H35Z M3 5 H30 V7 H3Z M10 18 a3.5 3.5 0 1 0 .01 0Z M26 18 a3.5 3.5 0 1 0 .01 0Z M40 18 a3.5 3.5 0 1 0 .01 0Z',
  ambulance: 'M2 7 H30 V19 H2Z M31 10 H41 L46 15 V19 H31Z M20 3 H25 V7 H20Z M9 18 a3.5 3.5 0 1 0 .01 0Z M38 18 a3.5 3.5 0 1 0 .01 0Z',
  artillery: 'M3 19 H27 V23 H3Z M12 15 H24 V19 H12Z M20 14 L44 5 L45 8 L22 17Z M8 22 a3 3 0 1 0 .01 0Z M22 22 a3 3 0 1 0 .01 0Z',
  crowd: 'M10 3 a3 3 0 1 0 .01 0Z M5 25 Q5 9 10 9 Q15 9 15 25Z M24 1 a3 3 0 1 0 .01 0Z M19 25 Q19 7 24 7 Q29 7 29 25Z M38 3 a3 3 0 1 0 .01 0Z M33 25 Q33 9 38 9 Q43 9 43 25Z',
  plane: 'M2 14 L20 12 L21 3 L25 3 L26 12 L46 14 L26 16 L25 23 L21 23 L20 16Z',
};
const PATHS = Object.fromEntries(Object.entries(SIL).map(([k, d]) => [k, new Path2D(d)]));
const WHEELS = { police: [[13, 20], [35, 20]] };

// Draws silhouette `sil` centred on (x, y), `h` pixels tall.
export function drawSil(ctx, sil, x, y, h, color) {
  const p = PATHS[sil] || PATHS.shield, s = h / 26;
  ctx.save(); ctx.translate(x - 24 * s, y - 13 * s); ctx.scale(s, s);
  ctx.fillStyle = color; ctx.fill(p);
  for (const [wx, wy] of WHEELS[sil] || []) { ctx.beginPath(); ctx.arc(wx, wy, 3, 0, 6.2832); ctx.fill(); }
  if (sil === 'guard') { ctx.fillStyle = '#10192c'; ctx.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 3.2 : 7.5, a = -Math.PI / 2 + i * Math.PI / 5; ctx.lineTo(24 + r * Math.cos(a), 12 + r * Math.sin(a)); } ctx.closePath(); ctx.fill(); }
  ctx.restore();
}

// Images are fetched once; `onLoad` is called so the map can repaint. A failed image is remembered and the silhouette is used instead.
const imgs = new Map();
export function getImage(src, onLoad) {
  if (!src) return null;
  let e = imgs.get(src);
  if (!e) {
    e = { img: new Image(), ok: false, bad: false };
    e.img.onload = () => { e.ok = true; onLoad?.(); };
    e.img.onerror = () => { e.bad = true; };
    e.img.src = src;
    imgs.set(src, e);
  }
  return e.ok ? e.img : null;
}
export const sealUrl = key => `/client/img/us/${key}.png`;
