// Turns the SVGs fetched by scripts/fetch-us-images.py into 96 px PNGs in client/img/us/ using headless Chromium.
// Usage: node scripts/rasterize-us-images.mjs <scratch dir>
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const dir = process.argv[2], res = JSON.parse(readFileSync(join(dir, 'img-result.json'), 'utf8'));
const out = join(process.cwd(), 'client/img/us'); mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 140, height: 140 }, deviceScaleFactor: 1 });
let ok = 0;
for (const [key, name] of Object.entries(res)) {
  if (!name) continue;
  const svg = readFileSync(join(dir, 'img', name), 'utf8');
  // Wrapped in an <img> so every SVG scales the same way, inside a 96 px box with a transparent background.
  const uri = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  await page.setContent(`<body style="margin:0;background:transparent"><div id=b style="width:96px;height:96px;display:flex;align-items:center;justify-content:center"><img id=i src="${uri}"></div></body>`);
  await page.waitForFunction(() => document.getElementById('i').complete, null, { timeout: 8000 }).catch(() => {});
  const fit = await page.evaluate(() => { const i = document.getElementById('i'); if (!i.naturalWidth) return false; const r = Math.min(96 / i.naturalWidth, 96 / i.naturalHeight); i.style.width = i.naturalWidth * r + 'px'; i.style.height = i.naturalHeight * r + 'px'; return true; });
  if (!fit) { console.log('could not draw', key, name); continue; }
  await page.locator('#b').screenshot({ path: join(out, key + '.png'), omitBackground: true });
  ok++;
}
console.log('rasterized', ok);
await browser.close();
