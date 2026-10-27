// Runs The World Engine on this computer instead of Render.
//   node scripts/host.mjs            (or double-click start-world-engine.bat / start-world-engine.command)
// It starts the server, opens a public link with Cloudflare's free tunnel when `cloudflared` is installed (so
// Zeus on other networks can join), and keeps itself up to date: every minute it checks GitHub for new code
// and, once no Zeus panel is connected, installs it and restarts. Open pages reload themselves onto the new code.
// Settings (all optional): PORT, KRONOS_PASSWORD, SESSION_SECRET, DATA_DIR, NO_TUNNEL=1, NO_UPDATE=1, UPDATE_ANYTIME=1.
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = resolve(process.env.DATA_DIR || join(ROOT, 'data'));
const WIN = process.platform === 'win32';
mkdirSync(DATA_DIR, { recursive: true });

const log = (...a) => console.log(`[${new Date().toLocaleTimeString('en-GB')}]`, ...a);
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));

// --- the server ---
let server = null, stopping = false;
function startServer() {
  server = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, stdio: ['inherit', 'inherit', 'inherit', 'ipc'], env: { ...process.env, PORT: String(PORT), DATA_DIR } });
  server.on('exit', code => {
    if (stopping) return;
    log(`Server stopped (code ${code}). Starting it again in 3 seconds…`);
    setTimeout(startServer, 3000);
  });
}
async function stopServer() {
  if (!server || server.exitCode != null) return;
  stopping = true;
  const done = new Promise(r => server.once('exit', r));
  // Asked over IPC (Windows has no SIGTERM), the server saves every committee before it exits.
  try { server.send('shutdown'); } catch { server.kill('SIGTERM'); }
  await Promise.race([done, sleep(10000)]);
  if (server.exitCode == null) server.kill('SIGKILL');
  stopping = false;
}
async function health() {
  try { return await (await fetch(`http://127.0.0.1:${PORT}/healthz`)).json(); } catch { return null; }
}

// --- the public link ---
function startTunnel() {
  if (process.env.NO_TUNNEL) return;
  const cf = spawn(WIN ? 'cloudflared.exe' : 'cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://localhost:${PORT}`], { cwd: ROOT });
  cf.on('error', () => log('No public link: install cloudflared (see LOCAL_HOSTING.md) so Zeus outside this network can join.'));
  const scan = d => {
    const m = String(d).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (!m) return;
    writeFileSync(join(DATA_DIR, 'public-url.txt'), m[0] + '\n');
    log(`\n\n  PUBLIC LINK (send this to every Zeus):  ${m[0]}\n`);
  };
  cf.stdout.on('data', scan); cf.stderr.on('data', scan);
  cf.on('exit', code => { if (code != null) { log('The public link dropped. Reopening it in 5 seconds…'); setTimeout(startTunnel, 5000); } });
}

// --- updates ---
async function checkForUpdate() {
  try {
    if (git('status', '--porcelain', '--untracked-files=no')) return; // local edits: leave the code alone
    const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
    git('fetch', '--quiet', 'origin', branch);
    const here = git('rev-parse', 'HEAD'), there = git('rev-parse', `origin/${branch}`);
    if (here === there || git('merge-base', here, there) !== here) return;
    const h = await health();
    if (h?.panels && !process.env.UPDATE_ANYTIME) { log(`Update waiting: it installs once the ${h.panels} connected Zeus panel(s) close.`); return; }
    log('Installing an update…');
    const deps = git('diff', '--name-only', here, there).split('\n').some(f => f === 'package.json' || f === 'package-lock.json');
    git('merge', '--ff-only', '--quiet', there);
    if (deps) execFileSync(WIN ? 'npm.cmd' : 'npm', ['install', '--omit=dev'], { cwd: ROOT, stdio: 'inherit', shell: WIN });
    await stopServer();
    startServer();
    log(`Updated to ${there.slice(0, 7)}. Open pages reload by themselves.`);
  } catch (e) {
    log('Update check failed:', String(e.stderr || e.message).split('\n')[0]);
  }
}

// --- go ---
log('Starting The World Engine on this computer…');
startServer();
for (let i = 0; i < 60 && !(await health())?.ready; i++) await sleep(500);
const lan = Object.values(networkInterfaces()).flat().find(n => n && n.family === 'IPv4' && !n.internal)?.address;
log(`\n\n  On this computer:     http://localhost:${PORT}\n  On the same Wi-Fi:    ${lan ? `http://${lan}:${PORT}` : '(no network found)'}\n`);
startTunnel();
if (!process.env.NO_UPDATE) setInterval(checkForUpdate, (Number(process.env.UPDATE_SECONDS) || 60) * 1000);

const quit = async () => { log('Shutting down…'); await stopServer(); process.exit(0); };
process.on('SIGINT', quit);
process.on('SIGTERM', quit);
