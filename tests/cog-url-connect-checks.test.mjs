/* ============================================================================
 *  A COG AT A URL — js/gis-cog.js and the `url:` input of data.gis
 * ----------------------------------------------------------------------------
 *  js/gis-geotiff.js `readUrl` had no caller. What has to stay true now:
 *    ① only the tiles a window needs are fetched (HTTP Range), and the values are the file's own
 *    ② a window past the file's edge is `partial` with a reason, and the outside is NaN — not 0
 *    ③ non-https, credentialed, non-4326 and unreachable URLs are refused BY NAME
 *    ④ through data.gis a `url:` ref becomes a registered raster dataset whose provenance carries
 *       the coverage, and a feature slot handed a URL is refused
 *
 *  ⚠ THE FIXTURE IS WRITTEN HERE (a minimal tiled float32 TIFF) and the expected values are
 *  computed here from the pixel pattern; nothing in js/gis-geotiff.js helps build it.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const W = 512, H = 512, TILE = 128, ORIGIN_LNG = 130, ORIGIN_LAT = 40, PX = 0.01;

/* value = x + 1000*y, so a decoded value names the source pixel it came from */
function buildCog(crsKeys, geo) {
  const G = geo || { x0: ORIGIN_LNG, y0: ORIGIN_LAT, px: PX };
  const nT = (W / TILE) * (H / TILE);
  const chunks = [];
  for (let ty = 0; ty < H / TILE; ty++) for (let tx = 0; tx < W / TILE; tx++) {
    const b = new Uint8Array(TILE * TILE * 4), dv = new DataView(b.buffer);
    for (let r = 0; r < TILE; r++) for (let c = 0; c < TILE; c++) dv.setFloat32((r * TILE + c) * 4, (tx * TILE + c) + 1000 * (ty * TILE + r), true);
    chunks.push(b);
  }
  const offs = new Array(nT).fill(0), counts = chunks.map((c) => c.length);
  const keys = crsKeys || [1024, 0, 1, 2, 1025, 0, 1, 1, 2048, 0, 1, 4326];
  const E = [];
  const add = (tag, type, v) => E.push({ tag, type, v });
  add(256, 3, [W]); add(257, 3, [H]); add(258, 3, [32]); add(259, 3, [1]); add(262, 3, [1]); add(277, 3, [1]);
  add(284, 3, [1]); add(322, 3, [TILE]); add(323, 3, [TILE]); add(324, 4, offs); add(325, 4, counts); add(339, 3, [3]);
  add(33550, 12, [G.px, G.px, 0]); add(33922, 12, [0, 0, 0, G.x0, G.y0, 0]);
  add(34735, 3, [1, 1, 0, keys.length / 4].concat(keys));
  E.sort((a, b) => a.tag - b.tag);
  const SZ = { 3: 2, 4: 4, 12: 8 };
  const n = E.length;
  let p = 8 + 2 + 12 * n + 4;
  const extra = E.map((e) => { const s = SZ[e.type] * e.v.length; if (s > 4) { const at = p; p += s + (s & 1); return at; } return -1; });
  let q = p + (p & 1);
  for (let i = 0; i < nT; i++) { offs[i] = q; q += chunks[i].length; }
  const buf = new Uint8Array(q), dv = new DataView(buf.buffer);
  buf[0] = 0x49; buf[1] = 0x49; dv.setUint16(2, 42, true); dv.setUint32(4, 8, true); dv.setUint16(8, n, true);
  const put = (at, t, v) => { if (t === 3) dv.setUint16(at, v, true); else if (t === 4) dv.setUint32(at, v, true); else dv.setFloat64(at, v, true); };
  E.forEach((e, i) => {
    const at = 10 + i * 12;
    dv.setUint16(at, e.tag, true); dv.setUint16(at + 2, e.type, true); dv.setUint32(at + 4, e.v.length, true);
    if (extra[i] >= 0) { dv.setUint32(at + 8, extra[i], true); e.v.forEach((v, k) => put(extra[i] + k * SZ[e.type], e.type, v)); }
    else e.v.forEach((v, k) => put(at + 8 + k * SZ[e.type], e.type, v));
  });
  dv.setUint32(10 + n * 12, 0, true);
  chunks.forEach((c, i) => buf.set(c, offs[i]));
  return buf;
}

/* a server that answers Range with 206 and counts the bytes it sent */
function server(bytes, opts) {
  const o = opts || {};
  const s = { sent: 0, calls: 0, urls: [] };
  s.fetch = async (url, init) => {
    s.calls++; s.urls.push(String(url));
    if (o.status) return { status: o.status, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) };
    const m = /bytes=(\d+)-(\d+)/.exec((init && init.headers && init.headers.Range) || '');
    const from = Number(m[1]), to = Math.min(Number(m[2]), bytes.length - 1);
    const part = bytes.slice(from, to + 1);
    s.sent += part.length;
    return {
      status: 206,
      headers: { get: (k) => (String(k).toLowerCase() === 'content-range' ? 'bytes ' + from + '-' + to + '/' + bytes.length : null) },
      arrayBuffer: async () => part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength),
    };
  };
  return s;
}

async function boot() {
  const w = {};
  globalThis.window = w;
  new Function('window', readFileSync(join(ROOT, 'js/geodesy.js'), 'utf8'))(w);
  const { makeGisRaster } = await import('../js/gis-raster.js');
  const { makeGisCrs } = await import('../js/gis-crs.js');
  const { makeGisWarp } = await import('../js/gis-warp.js');
  const { makeGisGeotiff } = await import('../js/gis-geotiff.js');
  const { makeGisCog } = await import('../js/gis-cog.js');
  w.IntMapGisRaster = makeGisRaster();
  w.IntMapGisCrs = makeGisCrs();
  w.IntMapGisWarp = makeGisWarp();
  await w.IntMapGisCrs.ready();
  return { w, cog: makeGisCog({ geotiff: makeGisGeotiff(), warp: w.IntMapGisWarp, crs: w.IntMapGisCrs }) };
}

const URL_OK = 'https://example.org/dem/japan.tif';
const decode = (v) => ({ x: v % 1000, y: Math.round((v - (v % 1000)) / 1000) });

test('① only the tiles a window needs are fetched, and the values are the file\'s own', async () => {
  const { cog } = await boot();
  const bytes = buildCog();
  const srv = server(bytes);
  const win = [131, 38, 133, 39], width = 100, height = 50;
  const r = await cog.readWindow(URL_OK, { bounds: win, width, height, fetch: srv.fetch });
  assert.equal(r.ok, true, JSON.stringify(r.why) + JSON.stringify(r.detail));
  assert.ok(srv.sent < bytes.length / 2, 'the whole file was downloaded: ' + srv.sent + ' of ' + bytes.length);
  assert.ok(srv.calls > 1, 'the file was read in one request, so nothing was ranged');
  const cells = r.raster.read(0), pxL = (win[2] - win[0]) / width, pxT = (win[3] - win[1]) / height;
  let checked = 0;
  for (let j = 0; j < height; j += 7) for (let i = 0; i < width; i += 9) {
    const v = cells[j * width + i];
    assert.ok(Number.isFinite(v), 'hole inside the file at ' + i + ',' + j);
    const { x, y } = decode(v);
    const lng = ORIGIN_LNG + (x + 0.5) * PX, lat = ORIGIN_LAT - (y + 0.5) * PX;
    assert.ok(Math.abs(lng - (win[0] + (i + 0.5) * pxL)) <= PX / 2 + 1e-9, 'column ' + i + ' came from the wrong ground');
    assert.ok(Math.abs(lat - (win[3] - (j + 0.5) * pxT)) <= PX / 2 + 1e-9, 'row ' + j + ' came from the wrong ground');
    checked++;
  }
  assert.ok(checked > 50);
  assert.equal(r.coverage.completeness, 'all');
  assert.equal(r.coverage.resolution.meets, true);
  assert.equal(r.source.url, URL_OK);
});

test('② a window past the file is partial with a reason, and the outside is NaN, not 0', async () => {
  const { cog } = await boot();
  const srv = server(buildCog());
  /* the file spans lng 130..135.12 — this window runs 2° off its east edge */
  const r = await cog.readWindow(URL_OK, { bounds: [134, 38, 137, 39], width: 60, height: 20, fetch: srv.fetch });
  assert.equal(r.ok, true, JSON.stringify(r.why));
  assert.equal(r.coverage.completeness, 'partial');
  assert.match(r.coverage.reason, /window-extends-past-the-file/);
  const cells = r.raster.read(0);
  assert.ok(Number.isNaN(cells[59]), 'east of the file was filled instead of left missing: ' + cells[59]);
  assert.ok(Number.isFinite(cells[0]), 'the part inside the file is missing');
  assert.ok(!Array.from(cells).some((v) => v === 0), 'a missing pixel was written as 0');
});

test('③ http, credentials and unreachable are refused by name', async () => {
  const { cog } = await boot();
  const srv = server(buildCog());
  const ask = (url, f) => cog.readWindow(url, { bounds: [131, 38, 132, 39], width: 10, height: 10, fetch: (f || srv).fetch || f });
  assert.equal((await ask('http://example.org/a.tif')).why, 'url-not-https');
  assert.equal((await ask('https://user:pw@example.org/a.tif')).why, 'url-has-credentials');
  assert.equal((await ask('not a url')).why, 'url-invalid');
  assert.equal(srv.calls, 0, 'a refused URL was fetched anyway');
  const gone = await cog.readWindow(URL_OK, { bounds: [131, 38, 132, 39], width: 10, height: 10, fetch: server(buildCog(), { status: 404 }).fetch });
  assert.equal(gone.ok, false);
  assert.equal(gone.why, 'http-status');
});

test('④ through data.gis a url: ref is a registered raster dataset; a feature slot refuses a URL', async () => {
  const w = (await boot()).w;
  const { makeGisDatasets } = await import('../js/gis-datasets.js');
  const { makeGisGeometry } = await import('../js/gis-geometry.js');
  const { makeGisOps } = await import('../js/gis-ops.js');
  const { makeGisAtlas } = await import('../js/gis-atlas.js');
  const data = makeGisDatasets(), geometry = makeGisGeometry(), ops = makeGisOps();
  w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops;
  await geometry.ready();
  const layers = { acquireFields: (k) => (k === 'raster' ? ['bounds', 'width', 'height', 'where', 'unit', 'time', 'band'] : ['bounds']) };
  const atlas = makeGisAtlas({ data, ops, layers, warp: w.IntMapGisWarp, crs: w.IntMapGisCrs, draw: () => ({ ok: true }) });
  const srv = server(buildCog());
  const prevFetch = globalThis.fetch;
  globalThis.fetch = srv.fetch;
  try {
    const action = { acquire: { bounds: [131, 38, 133, 39], width: 40, height: 20 }, title: 'DEM' };
    const r = await atlas.resolve('url:' + URL_OK, 0, { kinds: ['raster'] }, action);
    assert.equal(r.ok, true, JSON.stringify(r.why) + JSON.stringify(r.detail));
    const ds = data.get(r.id);
    assert.equal(ds.kind, 'raster');
    assert.equal(ds.width, 40);
    assert.equal(ds.provenance.kind, 'url-raster');
    assert.equal(ds.provenance.url, URL_OK);
    assert.equal(ds.provenance.coverage.completeness, 'all');

    /* the acquisition-only step answers with the row, and the row says where it came from */
    const got = await atlas.run({ inputs: ['url:' + URL_OK], acquire: action.acquire, kind: 'raster' });
    assert.equal(got.ok, true, JSON.stringify(got.why) + JSON.stringify(got.detail));
    assert.equal(got.dataset.acquiredFrom, 'url:' + URL_OK);
    assert.equal(got.dataset.kind, 'raster');

    /* and an op runs on it: the grid goes straight into the chain */
    const win = await atlas.run({ op: 'rasterMask', inputs: ['url:' + URL_OK], acquire: action.acquire, params: { op: '>=', value: 0 } });
    assert.equal(win.ok, true, JSON.stringify(win.why) + JSON.stringify(win.detail));

    /* a window nobody stated is refused, not invented */
    const nowin = await atlas.resolve('url:' + URL_OK, 0, { kinds: ['raster'] }, {});
    assert.equal(nowin.ok, false);
    assert.equal(nowin.why, 'raster-sample-needs-window');
    /* a feature slot is not a grid */
    const feat = await atlas.resolve('url:' + URL_OK, 0, { kinds: ['vector'] }, action);
    assert.equal(feat.ok, false);
    assert.equal(feat.why, 'url-needs-a-grid-slot');
  } finally { globalThis.fetch = prevFetch; }
});

/* ⑤ a PROJECTED file (UTM 54N, 100 m pixels) is read through the window. ⚠ Two witnesses, one
   independent of js/gis-crs.js: a pixel's easting maps to a longitude by the UTM definition itself
   (central meridian 141°E sits at easting 500000), and the rest are compared to the crs module. */
test('⑤ a UTM file is read: only its tiles, on the right ground, and the central meridian is where UTM says', async () => {
  const { w, cog } = await boot();
  const X0 = 470000, Y0 = 4100000, PXM = 100;
  const bytes = buildCog([1024, 0, 1, 1, 1025, 0, 1, 1, 3072, 0, 1, 32654], { x0: X0, y0: Y0, px: PXM });
  const srv = server(bytes);
  const win = [140.8, 36.7, 141.0, 36.9], width = 40, height = 40;
  const r = await cog.readWindow(URL_OK, { bounds: win, width, height, fetch: srv.fetch });
  assert.equal(r.ok, true, JSON.stringify(r.why) + JSON.stringify(r.detail));
  assert.ok(srv.sent < bytes.length, 'the whole projected file was downloaded');
  const cells = r.raster.read(0), pxL = (win[2] - win[0]) / width, pxT = (win[3] - win[1]) / height;
  let checked = 0;
  for (let j = 0; j < height; j += 5) for (let i = 0; i < width; i += 5) {
    const v = cells[j * width + i];
    assert.ok(Number.isFinite(v), 'hole at ' + i + ',' + j);
    const { x, y } = decode(v);
    const ll = w.IntMapGisCrs.toWgs84(X0 + (x + 0.5) * PXM, Y0 - (y + 0.5) * PXM, 'EPSG:32654');
    assert.ok(Math.abs(ll[0] - (win[0] + (i + 0.5) * pxL)) < 0.002, 'column ' + i + ' is from the wrong ground');
    assert.ok(Math.abs(ll[1] - (win[3] - (j + 0.5) * pxT)) < 0.002, 'row ' + j + ' is from the wrong ground');
    checked++;
  }
  assert.ok(checked > 40);
  assert.equal(r.coverage.completeness, 'all');
  assert.equal(r.source.fileBoundsCrs, 'EPSG:32654');

  /* the independent witness: a window 0.02° wide on the central meridian reads eastings near 500000 */
  const mid = await cog.readWindow(URL_OK, { bounds: [140.99, 36.7, 141.01, 36.8], width: 10, height: 10, fetch: srv.fetch });
  assert.equal(mid.ok, true, JSON.stringify(mid.why));
  const m = mid.raster.read(0);
  for (let i = 0; i < m.length; i += 7) {
    assert.ok(Number.isFinite(m[i]));
    const easting = X0 + (decode(m[i]).x + 0.5) * PXM;
    assert.ok(Math.abs(easting - 500000) < 1500, 'easting ' + easting + ' is not on the central meridian');
  }

  /* a window past the file is partial, and the outside is NaN */
  const edge = await cog.readWindow(URL_OK, { bounds: [141.1, 36.7, 141.6, 36.9], width: 50, height: 20, fetch: srv.fetch });
  assert.equal(edge.ok, true, JSON.stringify(edge.why));
  assert.equal(edge.coverage.completeness, 'partial');
  assert.ok(Number.isNaN(edge.raster.read(0)[49]));
});
