// The World Engine server: static files, login, and the live WebSocket hub.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { join, normalize, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initAuth, checkPassword, issueToken, verifyToken, parseCookies, throttled, noteFail, clearFails, accounts, passwordFor } from './auth.js';
import { Store, geo } from './store.js';
import { createHub } from './hub.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NM = join(ROOT, 'node_modules');
const DATA_DIR = resolve(process.env.DATA_DIR || join(ROOT, 'data'));
const PORT = Number(process.env.PORT) || 3000;
mkdirSync(DATA_DIR, { recursive: true });

initAuth(DATA_DIR);
const store = new Store(DATA_DIR);

// Third-party browser modules are served straight from node_modules; no build step.
const VENDOR = {
  '/vendor/preact.mjs': 'preact/dist/preact.mjs',
  '/vendor/preact-hooks.mjs': 'preact/hooks/dist/hooks.mjs',
  '/vendor/htm.mjs': 'htm/dist/htm.module.js',
  '/vendor/world-50m.json': 'world-atlas/countries-50m.json',
  '/vendor/world-110m.json': 'world-atlas/countries-110m.json',
};
const VENDOR_DIRS = { '/vendor/d3-geo/': 'd3-geo/src/', '/vendor/d3-array/': 'd3-array/src/', '/vendor/internmap/': 'internmap/src/', '/vendor/topojson-client/': 'topojson-client/src/' };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

const cache = new Map(); // path -> { body, gz, etag, type, mtime }
async function serveFile(req, res, file, { maxAge = 0 } = {}) {
  try {
    const st = await stat(file);
    if (!st.isFile()) return notFound(res);
    let entry = cache.get(file);
    if (!entry || entry.mtime !== st.mtimeMs) {
      const body = await readFile(file);
      const type = TYPES[extname(file)] || 'application/octet-stream';
      const gz = /text|json|svg|javascript/.test(type) && body.length > 1024 ? gzipSync(body) : null;
      entry = { body, gz, type, mtime: st.mtimeMs, etag: `"${createHash('sha1').update(body).digest('base64url').slice(0, 16)}"` };
      cache.set(file, entry);
    }
    if (req.headers['if-none-match'] === entry.etag) { res.writeHead(304, { ETag: entry.etag }); return res.end(); }
    const headers = { 'Content-Type': entry.type, ETag: entry.etag, 'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-cache', 'X-Content-Type-Options': 'nosniff' };
    if (entry.gz && /gzip/.test(req.headers['accept-encoding'] || '')) { headers['Content-Encoding'] = 'gzip'; headers.Vary = 'Accept-Encoding'; res.writeHead(200, headers); return res.end(entry.gz); }
    res.writeHead(200, headers); res.end(entry.body);
  } catch { notFound(res); }
}
const notFound = res => { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); };
const json = (res, code, data, headers = {}) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers }); res.end(JSON.stringify(data)); };
const safeJoin = (base, rel) => { const p = normalize(join(base, rel)); return p.startsWith(base) ? p : null; };

function readBody(req, limit = 64 * 1024) {
  return new Promise((ok, fail) => {
    let size = 0; const chunks = [];
    req.on('data', d => { size += d.length; if (size > limit) { fail(new Error('too large')); req.destroy(); } else chunks.push(d); });
    req.on('end', () => { try { ok(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { ok({}); } });
    req.on('error', fail);
  });
}

const secure = req => req.headers['x-forwarded-proto'] === 'https';
const cookie = (req, token, maxAge) => `we_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure(req) ? '; Secure' : ''}`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const path = decodeURIComponent(url.pathname);
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  const user = verifyToken(parseCookies(req.headers.cookie).we_session);

  if (path === '/api/login' && req.method === 'POST') {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
    if (throttled(ip)) return json(res, 429, { error: 'Too many attempts. Wait five minutes.' });
    const body = await readBody(req).catch(() => ({}));
    const acc = checkPassword(body.username, body.password);
    if (!acc) { noteFail(ip); return json(res, 401, { error: 'Wrong username or password.' }); }
    clearFails(ip);
    return json(res, 200, { ok: true, user: acc }, { 'Set-Cookie': cookie(req, issueToken(acc.username), 14 * 86400) });
  }
  if (path === '/api/logout') return json(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, '', 0) });
  if (path === '/api/me') return json(res, 200, { user: user || null });
  if (path === '/api/ping') return json(res, 200, { ok: true, bootId: store.bootId, t: Date.now() });
  if (path === '/healthz') return json(res, 200, { ok: true });
  if (path.startsWith('/api/export/')) {
    const id = path.slice('/api/export/'.length);
    if (!user || !(user.role === 'kronos' || user.committee === id) || !store.get(id)) return json(res, 403, { error: 'No access' });
    const s = store.get(id);
    return json(res, 200, s, { 'Content-Disposition': `attachment; filename="world-engine-${id}-turn${s.meta?.turn || 0}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.json"` });
  }

  if (VENDOR[path]) return serveFile(req, res, join(NM, VENDOR[path]), { maxAge: 86400 });
  for (const [prefix, dir] of Object.entries(VENDOR_DIRS)) {
    if (path.startsWith(prefix)) { const f = safeJoin(join(NM, dir), path.slice(prefix.length)); return f ? serveFile(req, res, f, { maxAge: 86400 }) : notFound(res); }
  }
  if (path.startsWith('/shared/')) { const f = safeJoin(join(ROOT, 'shared'), path.slice(8)); return f ? serveFile(req, res, f) : notFound(res); }
  if (path.startsWith('/client/')) { const f = safeJoin(join(ROOT, 'client'), path.slice(8)); return f ? serveFile(req, res, f) : notFound(res); }
  if (path === '/favicon.ico' || path === '/favicon.svg') return serveFile(req, res, join(ROOT, 'client/favicon.svg'), { maxAge: 86400 });
  if (path === '/display' || path === '/display.html') return serveFile(req, res, join(ROOT, 'client/display.html'));
  if (path === '/' || path === '/zeus' || path === '/kronos' || path === '/login') return serveFile(req, res, join(ROOT, 'client/index.html'));
  notFound(res);
});

const hub = createHub(server, store, geo);

server.listen(PORT, () => {
  console.log(`\n  THE WORLD ENGINE is running on http://localhost:${PORT}\n`);
  console.log('  Accounts (passwords stay the same across restarts while SESSION_SECRET is unchanged):');
  for (const a of accounts()) console.log(`    ${a.username.padEnd(18)} ${a.username === 'kronos' && process.env.KRONOS_PASSWORD ? '(set by KRONOS_PASSWORD)' : passwordFor(a.username)}`);
  console.log('');
});

const shutdown = () => { console.log('Saving all committees…'); try { store.flush(); } catch (e) { console.error(e); } process.exit(0); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export { server, store, hub };
