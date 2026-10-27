// The World Engine server entry. It opens the port and answers the health check first, then loads the app:
// building the map grid takes several seconds on a small host, and Render gives up after five.
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT) || 3000;
let app = null, hub = null;

const WARMING = `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="2"><title>The World Engine</title>
<body style="background:#07090c;color:#9aa4ad;font:15px system-ui;display:grid;place-items:center;height:100vh;margin:0">Starting up…</body>`;

const server = createServer((req, res) => {
  if (req.url === '/healthz') {
    // `panels` lets the local updater wait until no Zeus is connected before it restarts the server.
    const panels = hub ? [...hub.clients].filter(c => c.user.role !== 'kronos' && c.view === 'panel').length : 0;
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ ok: true, ready: !!app, panels }));
  }
  if (app) return app.handle(req, res);
  res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '2', 'Cache-Control': 'no-store' });
  res.end(WARMING);
});

server.listen(PORT, async () => {
  console.log(`  Port ${PORT} open, loading the world…`);
  try {
    const mod = await import('./app.js');
    hub = mod.start(server, PORT);
    app = mod;
  } catch (e) {
    console.error('The World Engine failed to start:', e);
    process.exit(1);
  }
});

export { server };
