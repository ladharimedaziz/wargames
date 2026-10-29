// Turns the Cold War coats of arms and flags fetched from Wikimedia Commons into the WebP files the Cold War committee
// shows (client/img/coats/cold85/ and client/img/flags/cold85/), using headless Chromium.
// The scratch dir holds raw/<id>.svg|png for coats and raw/f<id>.svg|png for flags.
// Usage: node scripts/rasterize-cold-images.mjs <scratch dir>
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';

const dir = join(process.argv[2], 'raw');
const coats = join(process.cwd(), 'client/img/coats/cold85'), flags = join(process.cwd(), 'client/img/flags/cold85');
mkdirSync(coats, { recursive: true }); mkdirSync(flags, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
let ok = 0;
for (const file of readdirSync(dir).sort()) {
  const ext = extname(file).slice(1).toLowerCase(); if (!['svg', 'png'].includes(ext)) continue;
  const flag = file.startsWith('f'), id = file.slice(flag ? 1 : 0, -ext.length - 1);
  const uri = `data:image/${ext === 'svg' ? 'svg+xml' : 'png'};base64,` + readFileSync(join(dir, file)).toString('base64');
  // Coats keep their shape at 220 px high, like the modern ones; flags fill 192 x 128 like every other flag.
  const data = await page.evaluate(async ({ uri, flag }) => {
    const img = new Image(); img.src = uri;
    await img.decode().catch(() => {});
    if (!img.naturalWidth) return null;
    let w = 192, h = 128;
    if (!flag) { h = 220; w = Math.round(220 * img.naturalWidth / img.naturalHeight); if (w > 300) { w = 300; h = Math.round(300 * img.naturalHeight / img.naturalWidth); } }
    const cv = Object.assign(document.createElement('canvas'), { width: w, height: h });
    const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, w, h);
    return cv.toDataURL('image/webp', 0.9);
  }, { uri, flag });
  if (!data) { console.log('could not draw', file); continue; }
  writeFileSync(join(flag ? flags : coats, id + '.webp'), Buffer.from(data.split(',')[1], 'base64'));
  ok++;
}
console.log('rasterized', ok);
await browser.close();
