// Zero-dependency static file server for local dev + CI (Playwright webServer).
// Serves the IntMap repo root exactly as GitHub Pages would (index.html at /).
// No framework, no build step — matches the "keep the current structure" constraint.
//
//   node scripts/serve.mjs [--port 4173] [--root .]
//   PORT=4173 node scripts/serve.mjs
//
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, normalize, extname, resolve, sep } from 'node:path';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const argv = process.argv.slice(2);
function argVal(name, dflt) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
}
const ROOT = resolve(argVal('--root', join(HERE, '..')));
const PORT = Number(process.env.PORT || argVal('--port', '4173'));
const HOST = process.env.HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.geojson': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.map': 'application/json; charset=utf-8', '.wasm': 'application/wasm',
  '.pbf': 'application/x-protobuf',
};

const server = createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
    if (pathname.endsWith('/')) pathname += 'index.html';
    // Resolve inside ROOT only — reject path traversal.
    const filePath = normalize(join(ROOT, pathname));
    if (filePath !== ROOT && !filePath.startsWith(ROOT + sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    let s;
    try {
      s = await stat(filePath);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found: ' + pathname);
      return;
    }
    if (s.isDirectory()) {
      res.writeHead(301, { location: pathname.replace(/\/?$/, '/') }).end();
      return;
    }
    const body = await readFile(filePath);
    res.writeHead(200, {
      'content-type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'content-length': body.length,
      'cache-control': 'no-store',
      // The app registers a Service Worker; the test context blocks SWs, but make
      // doubly sure a stale SW from a previous run can't take over the origin.
      'service-worker-allowed': '/',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain' }).end('Server error: ' + (err && err.message));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[serve] IntMap static server on http://${HOST}:${PORT}/  (root: ${ROOT})`);
});
