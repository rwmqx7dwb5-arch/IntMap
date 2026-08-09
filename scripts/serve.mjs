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
import { gzip } from 'node:zlib';

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
  /* (#R208) data/gazetteer-world.json.gz is a gzip-typed BODY, not a gzip-ENCODED response — the
     client un-gzips it itself (js/gazetteer.js). Serving it with `Content-Encoding: gzip` instead
     would make the browser decompress it first and hand the client plain JSON. */
  '.gz': 'application/gzip',
};

/* ══ (#R208) …AND "EXACTLY AS GITHUB PAGES WOULD" HAS TO INCLUDE THE COMPRESSION ══════════════════
   The line at the top of this file has claimed since #R133 that this server stands in for Pages.
   It did not: Pages answers `Accept-Encoding: gzip` with `Content-Encoding: gzip`, and this server
   sent every byte raw. MEASURED against the live site: `assets/main-*.js` is 3,603 kB on the wire
   here and **1,331 kB** from Pages — 2.7×. Every local measurement of load time over an emulated
   phone network was therefore wrong in the same direction, and by enough to change what looks
   expensive: a boot measured at 7.4 s on fast-4G is 3.4 s when the bytes are compressed the way the
   user actually receives them. ⚠ This is #R202's lesson again — the instrument lied, in the
   direction that makes the work look more urgent than it is.

   ⚠ `.gz` IS DELIBERATELY EXCLUDED. data/gazetteer-world.json.gz is a gzip-typed BODY that
   js/gazetteer.js un-gzips itself (see MIME above); adding Content-Encoding would make the browser
   decompress it first and hand the client plain JSON — the exact hazard #R208 wrote that note for.
   Already-compressed image and font formats are excluded because compressing them costs CPU and
   returns nothing, which is what Pages does too. */
const COMPRESSIBLE = /^(text\/|application\/(javascript|json|manifest\+json|xml|x-protobuf|wasm))/;
function pickEncoding(accept, filePath, size) {
  if (!accept || size < 1024) return null;
  if (extname(filePath).toLowerCase() === '.gz') return null;
  const type = MIME[extname(filePath).toLowerCase()] || '';
  if (!COMPRESSIBLE.test(type)) return null;
  /* ⚠ GZIP EVEN THOUGH BROTLI IS ON OFFER, because that is what Pages does. MEASURED against the
     live site with `Accept-Encoding: br, gzip, deflate, zstd`: it answered `Content-Encoding: gzip`,
     1,331,346 bytes. Brotli would be 1,128,303 here — 16 % smaller — so preferring it would make
     every local load measurement optimistic by exactly the amount the user never receives. */
  return /\bgzip\b/.test(String(accept).toLowerCase()) ? 'gzip' : null;
}
/* ⚠ AND IT IS CACHED, or this would be a tax on the test suite rather than a fidelity fix. Gzipping
   the 3.6 MB bundle costs ~200 ms, `cache-control` here is `no-store`, and the suite boots the app
   on the order of 185 times — that is ~40 s of pure server CPU added to a run the standing
   instruction says is already far too long. The key is path + mtime + size, so an edit-and-rebuild
   loop still serves the new bytes. */
const zcache = new Map();
function compress(buf, enc, key) {
  const hit = zcache.get(key);
  if (hit) return hit;
  const p = new Promise((ok, no) => {
    /* level 6 is zlib's default and lands within 1.4 % of what Pages returns for the same file
       (1,349,648 against 1,331,346) — close enough that the difference is not what a measurement
       would be reading. */
    gzip(buf, { level: 6 }, (e, out) => (e ? no(e) : ok(out)));
  });
  zcache.set(key, p);
  if (zcache.size > 300) zcache.delete(zcache.keys().next().value);
  return p;
}

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
    const raw = await readFile(filePath);
    const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
    const enc = pickEncoding(req.headers['accept-encoding'], filePath, raw.length);
    const body = enc ? await compress(raw, enc, `${enc}:${filePath}:${s.mtimeMs}:${s.size}`) : raw;
    res.writeHead(200, {
      'content-type': type,
      'content-length': body.length,
      ...(enc ? { 'content-encoding': enc, vary: 'Accept-Encoding' } : {}),
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
