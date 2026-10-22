// Browser smoke test: starts a throwaway server, signs in as a Zeus and as Kronos, drives the panel and the
// stage display, and fails on any page error. Screenshots land in test/e2e/shots/.
// Run with: npm run test:e2e   (set CHROMIUM_PATH if Playwright's own browser is not installed)
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHOTS = join(ROOT, 'test', 'e2e', 'shots');
mkdirSync(SHOTS, { recursive: true });
const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PORT}`;

const server = spawn(process.execPath, ['server/index.js'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), DATA_DIR: mkdtempSync(join(tmpdir(), 'we-e2e-')), SESSION_SECRET: 'e2e-secret', KRONOS_PASSWORD: 'kronos-e2e' },
});
let log = '';
server.stdout.on('data', d => { log += d; });
server.stderr.on('data', d => { log += d; });
const stop = code => { server.kill(); process.exit(code); };

const passwordOf = user => (user === 'kronos' ? 'kronos-e2e' : log.match(new RegExp(`\\s${user}\\s+(\\S+)`))?.[1]);
const failures = [];
const check = (ok, what) => { console.log(`${ok ? '✓' : '✗'} ${what}`); if (!ok) failures.push(what); };

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${BASE}/healthz`)).ok) return; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('Server did not start:\n' + log);
}

async function page(browser, user) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(BASE + '/');
  await p.fill('input[autocomplete=username]', user);
  await p.fill('input[type=password]', passwordOf(user));
  await p.click('button.primary');
  return { p, ctx, errors };
}

try {
  await waitForServer();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });

  // Stage Zeus: the panel loads, the map draws, the command bar queues an order.
  const zeus = await page(browser, 'ww3-stage');
  await zeus.p.waitForSelector('.cmd-input', { timeout: 15000 });
  await zeus.p.waitForTimeout(2500);
  const mapSize = await zeus.p.evaluate(() => { const c = document.querySelector('.map-wrap canvas, .mid canvas'); return c ? [c.width, c.height] : [0, 0]; });
  check(mapSize[0] > 200 && mapSize[1] > 200, `panel map renders (${mapSize.join('x')})`);
  await zeus.p.fill('.cmd-input', 'russia declares war on ukraine');
  await zeus.p.press('.cmd-input', 'Enter');
  await zeus.p.waitForTimeout(800);
  await zeus.p.screenshot({ path: join(SHOTS, 'zeus-panel.png') });

  // Stage display opens with the same session and shows the disguise.
  const display = await zeus.ctx.newPage();
  const displayErrors = [];
  display.on('pageerror', e => displayErrors.push(e.message));
  await display.goto(BASE + '/display?c=ww3');
  await display.waitForTimeout(3000);
  check(await display.locator('text=Global Fisheries Summit').count() > 0, 'stage display shows the disguise');
  await display.screenshot({ path: join(SHOTS, 'display-disguise.png') });

  // Kronos sees every committee and can open the eye on WW3.
  const kronos = await page(browser, 'kronos');
  await kronos.p.waitForTimeout(2500);
  check(await kronos.p.locator('text=Court of Justice').count() > 0, 'Kronos sees every committee');
  await kronos.p.locator('button:has-text("Eye")').first().click();
  await zeus.p.waitForTimeout(1500);
  check(await zeus.p.locator('.kronos-eye').count() > 0, 'the eye appears on the Zeus panel');
  await zeus.p.screenshot({ path: join(SHOTS, 'zeus-eye.png') });
  await kronos.p.screenshot({ path: join(SHOTS, 'kronos-home.png') });

  // Court Zeus: the court panel loads.
  const court = await page(browser, 'charlie-stage');
  await court.p.waitForTimeout(2500);
  check(await court.p.locator('text=Presiding Judge').count() > 0, 'court panel shows the bench');
  await court.p.screenshot({ path: join(SHOTS, 'court-panel.png') });

  for (const [who, errs] of [['zeus', zeus.errors], ['display', displayErrors], ['kronos', kronos.errors], ['court', court.errors]]) check(errs.length === 0, `no page errors on ${who}${errs.length ? ': ' + errs.join(' | ') : ''}`);
  await browser.close();
} catch (e) {
  console.error(e);
  failures.push(e.message);
}
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nAll browser checks passed');
stop(failures.length ? 1 : 0);
