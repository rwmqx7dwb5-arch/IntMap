/* ============================================================================
 *  IntMap · sat-mobile-speed — speculation yields to the tiles on screen
 * ----------------------------------------------------------------------------
 *  src/sat-worker.js is the one scheduler for the Esri hosts: the renderer's tiles (need) first, the
 *  camera's destination and the ring around the view (speculation, js/tile-warm.js) only in idle
 *  capacity. Every claim here is made by RUNNING the worker in a sandbox whose `fetch` is held open
 *  until the test answers it — no claim is read off the source text.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import * as esriImagery from '../js/esri-imagery.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (n = 8) => { for (let i = 0; i < n; i++) await tick(); };

const IMPORT_RE = /^import \{([^}]*)\} from '\.\.\/js\/esri-imagery\.js';$/m;
const KEYLESS = { ...esriImagery, imageryKeyed: () => false, imageryRefused: () => {}, imageryTileUrl: esriImagery.keylessTileUrl };
function bootWorker() {
  const calls = [];          /* every fetch handed to the browser: {u, init} */
  const pending = [];
  const ctx = {
    console, Blob, Promise, Map, Set, Error, Math, isFinite, setTimeout, AbortController,
    fetch: (u, init) => { calls.push({ u, init }); return new Promise((res) => pending.push({ u, ok: () => res({ ok: true, status: 200, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => new ArrayBuffer(9000) }) })); },
    __esri: KEYLESS,
    createImageBitmap: async () => ({ width: 256, height: 256, close() { } }),
    OffscreenCanvas: class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return { drawImage() { } }; } transferToImageBitmap() { return { width: this.width, close() { } }; } },
  };
  ctx.self = ctx;
  const posted = [];
  ctx.postMessage = (m) => posted.push(m);
  vm.createContext(ctx);
  const src = read('src/sat-worker.js');
  assert.match(src, IMPORT_RE, 'the worker takes its URLs from js/esri-imagery.js');
  vm.runInContext(src.replace(IMPORT_RE, 'const {$1} = __esri;'), ctx);
  const send = (m) => ctx.self.onmessage({ data: m });
  const tail = (c) => c.u.replace(/^.*tile\//, '');
  const answer = (pred = () => true) => { const i = pending.findIndex((p) => pred(p.u)); assert.ok(i >= 0, 'a fetch to answer'); pending.splice(i, 1)[0].ok(); };
  return { calls, pending, posted, send, tail, answer, fetched: () => calls.map(tail) };
}
/* (x+y) even → one host (server.arcgisonline.com); odd → the other */
const HOST_A = (i) => [15, 1000, 2000 + 2 * i];
const HOST_B = (i) => [15, 1000, 2001 + 2 * i];

test('① a speculative tile is not handed to the browser while a visible tile waits for the same host', async () => {
  const W = bootWorker();
  W.send({ type: 'config', lanes: 1, specCap: 2 });
  W.send({ type: 'tile', id: 1, z: 15, y: 1000, x: 2000, hi: false });   /* takes the one lane */
  W.send({ type: 'tile', id: 2, z: 15, y: 1000, x: 2002, hi: false });   /* waits for it */
  W.send({ type: 'spec', kind: 'ring', tiles: [HOST_A(5), HOST_B(5)] });
  await settle();
  assert.deepEqual(W.fetched(), ['15/1000/2000', '15/1000/2011'], 'host A: the visible tile only; host B (nothing waiting there) may speculate');
  W.answer((u) => /2000$/.test(u)); await settle();
  assert.equal(W.fetched()[2], '15/1000/2002', 'the waiting visible tile goes before the speculation on its host');
  W.answer((u) => /2002$/.test(u)); await settle();
  assert.ok(W.fetched().includes('15/1000/2010'), 'and the speculation runs once nothing visible is waiting');
});

test('② speculation runs at most `specCap` at a time per host, and `specCap: 0` speculates nothing', async () => {
  const W = bootWorker();
  W.send({ type: 'config', specCap: 1 });
  W.send({ type: 'spec', kind: 'ring', tiles: [HOST_A(0), HOST_A(1), HOST_A(2)] });
  await settle();
  assert.equal(W.calls.length, 1, 'one speculative fetch on the host');
  assert.equal(W.calls[0].init.priority, 'low', 'and the browser is told it is low priority');
  W.answer(); await settle();
  assert.equal(W.calls.length, 2, 'the next one when it finishes');
  const Z = bootWorker();
  Z.send({ type: 'config', specCap: 0 });
  Z.send({ type: 'spec', kind: 'dest', tiles: [HOST_A(0)] });
  await settle();
  assert.equal(Z.calls.length, 0, 'no speculation at all');
});

test('③ a host whose sockets are all in use by visible tiles gets no speculation', async () => {
  const W = bootWorker();
  W.send({ type: 'config', lanes: 12, specCap: 2 });
  for (let i = 0; i < 6; i++) { const [z, y, x] = HOST_A(i); W.send({ type: 'tile', id: i + 1, z, y, x, hi: false }); }
  W.send({ type: 'spec', kind: 'ring', tiles: [HOST_A(20)] });
  await settle();
  assert.equal(W.calls.length, 6, 'six visible fetches = every socket of an HTTP/1.1 host; the speculation waits');
  W.answer(); await settle();
  assert.equal(W.fetched().filter((t) => t === '15/1000/2040').length, 1, 'a freed socket takes it');
});

test('④ the renderer asking for a tile that is being speculated joins that fetch — one request', async () => {
  const W = bootWorker();
  W.send({ type: 'spec', kind: 'dest', tiles: [HOST_A(0)] });
  await settle();
  W.send({ type: 'tile', id: 9, z: 15, y: 1000, x: 2000, hi: false });
  await settle();
  assert.equal(W.calls.length, 1, 'not asked twice');
  W.answer(); await settle(12);
  assert.ok(W.posted.find((m) => m.id === 9 && m.ok), 'the visible tile is answered from the speculative fetch');
});

test('⑤ a newer destination replaces the old list; a tile already fetched is not speculated again', async () => {
  const W = bootWorker();
  W.send({ type: 'config', lanes: 1, specCap: 1 });
  W.send({ type: 'tile', id: 1, z: 15, y: 1000, x: 2000, hi: false });
  W.send({ type: 'tile', id: 2, z: 15, y: 1000, x: 2002, hi: false });   /* host A has a visible tile waiting */
  W.send({ type: 'spec', kind: 'dest', tiles: [HOST_A(7), HOST_A(8)] });
  W.send({ type: 'spec', kind: 'dest', tiles: [HOST_A(9), HOST_A(0)] });  /* the camera changed its mind */
  for (let k = 0; k < 6; k++) { if (W.pending.length) W.answer(); await settle(); }
  const f = W.fetched();
  assert.ok(!f.includes('15/1000/2014') && !f.includes('15/1000/2016'), 'the abandoned destination cost nothing');
  assert.ok(f.includes('15/1000/2018'), 'the new one ran');
  assert.equal(f.filter((t) => t === '15/1000/2000').length, 1, 'a tile already fetched is not asked again');
});


/* js/tile-warm.js, run against a fake camera: the ring around the view is handed to the satellite worker
   (js/sat-proto.js `speculate`) as [z,y,x] at the level the renderer asks for, and only falls back to its
   own fetches when the worker does not take it */
function bootWarm(speculateAnswer) {
  const handed = [], fetched = [];
  const at = { lng: 139.7 };
  const camera = { getZoom: () => 12, getCenter: () => ({ lng: at.lng, lat: 35.68 }), getPitch: () => 0,
    getBounds: () => ({ getWest: () => at.lng - 0.1, getEast: () => at.lng + 0.1, getNorth: () => 35.75, getSouth: () => 35.6 }) };
  const handlers = {};
  const GE = { hasRenderer: () => true, camera, events: { on: (n, f) => { handlers[n] = f; } } };
  const win = { __imSatProto: true, IntMapMemBudget: { deviceIsPhone: () => true },
    IntMapSatProto: { netLevelBias: () => 1, tileUrl: (z, y, x) => esriImagery.keylessTileUrl(z, y, x),
      speculate: (tiles, more) => { handed.push({ tiles, more }); return speculateAnswer; } } };
  const ctx = { window: win, navigator: {}, location: { protocol: 'https:', hostname: 'x' }, Math, Set, Promise, console, setTimeout, clearTimeout, Date,
    fetch: (u) => { fetched.push(u); return Promise.resolve({}); }, __GE: GE, __note: () => {} };
  vm.createContext(ctx);
  const src = read('js/tile-warm.js')
    .replace(/^import \{ IntMapGeoEngine \} from '\.\/geo-engine\.js';/m, 'const IntMapGeoEngine = __GE;')
    .replace(/^import \{ noteShellStatus \} from '\.\/installable-app\.js';.*$/m, 'const noteShellStatus = __note;')
    .replace(/^export function tileWarm/m, 'function tileWarm');
  vm.runInContext(src + '\n;globalThis.__tileWarm = tileWarm;', ctx);
  ctx.__tileWarm({ isMobile: () => true, mapType: 'sat', satState: { providerId: 'esri' }, satProviderById: () => ({ id: 'esri', maxzoom: 19 }), satBuildTiles: () => ['https://a/{z}/{y}/{x}'] });
  return { handed, fetched, at, run: () => win._imPredictivePrefetch() };
}

test('⑥ the Esri ring goes to the worker as [z,y,x] at the renderer\'s level — nothing is fetched beside it', async () => {
  const T = bootWarm(true);
  T.run(); await settle();
  assert.equal(T.handed.length, 1, 'one batch handed to the worker');
  const { tiles, more } = T.handed[0];
  assert.equal(more, false, 'a new view replaces what the worker had');
  assert.ok(tiles.length > 0 && tiles.length <= 60, 'within the phone ring cap');
  assert.ok(tiles.every((t) => Array.isArray(t) && t.length === 3), '[z, y, x]');
  assert.deepEqual([...new Set(tiles.map((t) => t[0]))].sort(), [14, 15], 'standing still: the zoom-in anticipation, one and two levels below the renderer’s (13)');
  assert.equal(new Set(tiles.map((t) => t.join('/'))).size, tiles.length, 'no tile twice');
  T.run(); await settle();
  assert.equal(T.handed[1].more, true, 'the same tile rectangle continues the ring instead of replacing it');
  T.at.lng += 0.05; T.run(); await settle();
  const moved = T.handed[2];
  assert.equal(moved.more, false, 'a moved view replaces it');
  assert.ok(moved.tiles.some((t) => t[0] === 13), 'moving: the ring ahead, at the level the renderer asks for (round(zoom)+1)');
  assert.equal(T.fetched.length, 0, 'no fetch of its own while the worker takes the ring');
});

test('⑦ …and without a worker to take it, the ring is still warmed (the old page path)', async () => {
  const T = bootWarm(false);
  T.run(); await settle();
  assert.equal(T.handed.length, 1);
  assert.ok(T.fetched.length > 0, 'warmed through the page lanes');
  assert.ok(T.fetched.every((u) => /World_Imagery\/MapServer\/tile\//.test(u)), 'the URLs the render path asks for');
});
