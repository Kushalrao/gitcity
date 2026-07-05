#!/usr/bin/env node
/**
 * agentview — watch a coding agent move through your codebase, live in the browser.
 *
 * Usage:  node server.js [dir-to-watch]   (defaults to cwd)
 * Then open http://localhost:4517
 *
 * Event sources:
 *   1. POST /event        — Claude Code hooks (see hook.js) report which file a tool touches
 *   2. fs.watch fallback  — raw filesystem changes from any other agent/editor
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const license = require('./license.js');

const PORT = process.env.PORT || process.env.AGENTVIEW_PORT || 4517;
let WATCH_DIR = path.resolve(process.argv[2] || process.cwd());
const PUBLIC_DIR = path.join(__dirname, 'public');

const IGNORE = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt',
  '__pycache__', '.venv', 'venv', '.cache', 'coverage', '.turbo', '.DS_Store',
]);
const MAX_DEPTH = 8;
const MAX_ENTRIES = 4000;

/* ---------------- SSE clients ---------------- */
let clients = [];
function broadcast(ev) {
  const frame = `data: ${JSON.stringify(ev)}\n\n`;
  clients = clients.filter((res) => {
    try { res.write(frame); return true; } catch { return false; }
  });
}
setInterval(() => broadcast({ type: 'ping' }), 25000);

/* ---------------- file tree ---------------- */
function buildTree(absDir, relDir = '', depth = 0, counter = { n: 0 }) {
  const node = { name: relDir === '' ? path.basename(WATCH_DIR) : path.basename(relDir), path: relDir, type: 'dir', children: [] };
  if (depth > MAX_DEPTH || counter.n > MAX_ENTRIES) return node;
  let entries;
  try { entries = fs.readdirSync(absDir, { withFileTypes: true }); } catch { return node; }
  entries.sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1));
  for (const e of entries) {
    if (IGNORE.has(e.name) || e.name.startsWith('.') && e.name !== '.claude') continue;
    if (counter.n++ > MAX_ENTRIES) break;
    const rel = relDir ? `${relDir}/${e.name}` : e.name;
    if (e.isDirectory()) {
      node.children.push(buildTree(path.join(absDir, e.name), rel, depth + 1, counter));
    } else if (e.isFile()) {
      node.children.push({ name: e.name, path: rel, type: 'file' });
    }
  }
  return node;
}

/* ---------------- fs.watch fallback ---------------- */
const recentHookFiles = new Map(); // rel path -> timestamp, to suppress duplicate fs events
let watcher = null;
function startWatching(dir) {
  if (watcher) { try { watcher.close(); } catch {} watcher = null; }
  WATCH_DIR = dir;
  recentHookFiles.clear();
  try {
    watcher = fs.watch(WATCH_DIR, { recursive: true }, (event, filename) => {
      if (!filename) return;
      const rel = filename.split(path.sep).join('/');
      if (rel.split('/').some((seg) => IGNORE.has(seg) || (seg.startsWith('.') && seg !== '.claude'))) return;
      const hookTs = recentHookFiles.get(rel);
      if (hookTs && Date.now() - hookTs < 3000) return; // hook already reported this, skip noise
      broadcast({ type: 'activity', source: 'fs', agent: 'fs-watcher', tool: 'FsChange', file: rel, ts: Date.now() });
    });
  } catch (err) {
    console.error('fs.watch unavailable:', err.message);
  }
}
startWatching(WATCH_DIR);

/* ---------------- http ---------------- */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(`data: ${JSON.stringify({ type: 'hello', watchDir: WATCH_DIR, licensed: license.isLicensed(), buyUrl: license.BUY_URL })}\n\n`);
    clients.push(res);
    req.on('close', () => { clients = clients.filter((c) => c !== res); });
    return;
  }

  if (url.pathname === '/tree') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(buildTree(WATCH_DIR)));
    return;
  }

  if (url.pathname === '/license') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ licensed: license.isLicensed(), buyUrl: license.BUY_URL }));
    return;
  }

  if (url.pathname === '/activate' && req.method === 'POST') {
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 1e4) req.destroy(); });
    req.on('end', async () => {
      let key = '';
      try { key = JSON.parse(body).key; } catch {}
      const r = await license.activate(key);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(r));
    });
    return;
  }

  if (url.pathname === '/watch' && req.method === 'POST') {
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const dir = path.resolve(JSON.parse(body).dir || '');
        if (dir && fs.existsSync(dir) && dir !== WATCH_DIR) {
          console.log('rewatching', dir);
          startWatching(dir);
          broadcast({ type: 'rewatch', watchDir: WATCH_DIR });
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, watchDir: WATCH_DIR }));
      } catch { res.writeHead(400); res.end('bad json'); }
    });
    return;
  }

  if (url.pathname === '/event' && req.method === 'POST') {
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try {
        const p = JSON.parse(body);
        const abs = p.file ? path.resolve(p.file) : null;
        let rel = null, external = false;
        if (abs) {
          rel = path.relative(WATCH_DIR, abs).split(path.sep).join('/');
          if (rel.startsWith('..')) { external = true; rel = abs; }
          else recentHookFiles.set(rel, Date.now());
        }
        broadcast({
          type: 'activity',
          source: 'hook',
          agent: p.session ? String(p.session).slice(0, 8) : 'agent',
          tool: p.tool || 'Tool',
          phase: p.phase || 'pre',
          file: rel,
          external,
          ts: Date.now(),
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch {
        res.writeHead(400); res.end('bad json');
      }
    });
    return;
  }

  // static files
  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  const abs = path.join(PUBLIC_DIR, path.normalize(file));
  if (!abs.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end(); return; }
  fs.readFile(abs, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(abs)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`agentview watching ${WATCH_DIR}`);
  console.log(`open http://localhost:${PORT}`);
});
