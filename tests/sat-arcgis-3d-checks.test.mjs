/* ============================================================================
 *  IntMap · sat-arcgis-3d — a satellite fetch that has not left can be taken back
 * ----------------------------------------------------------------------------
 *  src/sat-worker.js hands at most `lanes` fetches per host to the browser and keeps the rest in a
 *  queue it owns; a waiting fetch that no tile wants any more is withdrawn, a fetch already handed to
 *  the browser is never cancelled (#R196). src/sat-worker-client.js answers an abandoned tile at once
 *  so MapLibre's shared image-request slot is free again. js/app-body.js warms the readout's DEM tiles
 *  over the SCREEN, not over the bounds. Every claim here is made by RUNNING the code — the worker and
 *  the client are evaluated in a sandbox with a fake network, the prefetch with a fake camera.
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

/* the worker, in a sandbox whose `fetch` is held open until the test lets it answer */
/* the worker imports js/esri-imagery.js; the sandbox hands it that module (or a stand-in with a key) */
const IMPORT_RE = /^import \{([^}]*)\} from '\.\.\/js\/esri-imagery\.js';$/m;
/* the keyless hosts (HTTP/1.1, where the lane cap applies), whatever key the shipped module carries */
const KEYLESS = { ...esriImagery, imageryKeyed: () => false, imageryRefused: () => {}, imageryTileUrl: esriImagery.keylessTileUrl };
function bootWorker(esri = KEYLESS, reply = () => ({ ok: true, status: 200, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => new ArrayBuffer(9000) })) {
  const calls = [];          /* every URL handed to the browser, in order */
  const pending = [];        /* their resolvers */
  const posted = [];
  const ctx = {
    console, Blob, Promise, Map, Set, Error, Math, isFinite, setTimeout, AbortController,
    fetch: (u) => { calls.push(u); return new Promise((res) => pending.push({ u, ok: () => res(reply(u)) })); },
    __esri: esri,
    createImageBitmap: async () => ({ width: 256, height: 256, close() { } }),
    OffscreenCanvas: class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return { drawImage() { } }; } transferToImageBitmap() { return { width: this.width, close() { } }; } },
  };
  ctx.self = ctx;
  ctx.postMessage = (m) => posted.push(m);
  vm.createContext(ctx);
  const src = read('src/sat-worker.js');
  assert.match(src, IMPORT_RE, 'the worker takes its URLs from js/esri-imagery.js');
  vm.runInContext(src.replace(IMPORT_RE, 'const {$1} = __esri;'), ctx);
  const send = (m) => ctx.self.onmessage({ data: m });
  const answer = (pred) => { const i = pending.findIndex((p) => pred(p.u)); assert.ok(i >= 0, 'a fetch to answer'); pending.splice(i, 1)[0].ok(); };
  return { calls, pending, posted, send, answer };
}
/* tiles on ONE host: the host is picked by (x+y)&1, so x+y even throughout */
const ONE_HOST = [[14, 100, 200], [14, 100, 202], [14, 100, 204], [14, 100, 206], [14, 100, 208]];

test('① no more than `lanes` fetches per host are handed to the browser; the rest wait in the worker', async () => {
  const W = bootWorker();
  W.send({ type: 'config', lanes: 2 });
  ONE_HOST.forEach(([z, y, x], i) => W.send({ type: 'tile', id: i + 1, z, y, x, hi: false }));
  await settle();
  assert.equal(W.calls.length, 2, 'two lanes → two fetches on the wire');
  W.answer(() => true);
  await settle();
  assert.equal(W.calls.length, 3, 'a finished fetch frees its lane for the next waiting one');
});

test('② a waiting fetch whose tile was abandoned is withdrawn — and never reaches the network', async () => {
  const W = bootWorker();
  W.send({ type: 'config', lanes: 2 });
  ONE_HOST.forEach(([z, y, x], i) => W.send({ type: 'tile', id: i + 1, z, y, x, hi: false }));
  await settle();
  W.send({ type: 'abort', id: 3 }); W.send({ type: 'abort', id: 4 });
  await settle();
  for (let k = 0; k < 3; k++) { if (W.pending.length) W.answer(() => true); await settle(); }
  const fetched = W.calls.map((u) => u.replace(/^.*tile\//, ''));
  assert.deepEqual(fetched, ['14/100/200', '14/100/202', '14/100/208'], 'tiles 3 and 4 were never fetched');
  const r3 = W.posted.find((m) => m.id === 3);
  assert.ok(r3 && r3.ok === false, 'the abandoned tile is answered (as not delivered), not left hanging');
  assert.ok(W.posted.find((m) => m.id === 5 && m.ok), 'the tile that is still wanted arrives');
});

test('③ #R196 stands: a fetch already on the wire is NOT cancelled, and its bytes serve the next ask', async () => {
  const W = bootWorker();
  W.send({ type: 'config', lanes: 2 });
  W.send({ type: 'tile', id: 1, z: 14, y: 100, x: 200, hi: false });
  await settle();
  assert.equal(W.calls.length, 1);
  W.send({ type: 'abort', id: 1 });
  await settle();
  W.answer(() => true);        /* the response still lands */
  await settle();
  W.send({ type: 'tile', id: 2, z: 14, y: 100, x: 200, hi: false });
  await settle();
  assert.equal(W.calls.length, 1, 'asked again → answered from the bytes that finished, no second fetch');
  assert.ok(W.posted.find((m) => m.id === 2 && m.ok));
});

test('④ a waiting fetch two tiles share survives one of them letting go', async () => {
  const W = bootWorker();
  W.send({ type: 'config', lanes: 1 });
  W.send({ type: 'tile', id: 1, z: 14, y: 100, x: 200, hi: false });    /* takes the only lane */
  W.send({ type: 'tile', id: 2, z: 14, y: 100, x: 202, hi: false });    /* waits */
  W.send({ type: 'tile', id: 3, z: 14, y: 100, x: 202, hi: false });    /* same tile, waits on the same fetch */
  await settle();
  W.send({ type: 'abort', id: 2 });
  await settle();
  W.answer(() => true); await settle();
  assert.equal(W.calls.length, 2, 'the shared fetch was still made');
  W.answer(() => true); await settle();
  assert.ok(W.posted.find((m) => m.id === 3 && m.ok), 'and the tile still holding it got its picture');
});

test('⑤ `lanes: 0` hands everything to the browser at once (no cap — the h2/h3 setting)', async () => {
  const W = bootWorker();
  W.send({ type: 'config', lanes: 0 });
  ONE_HOST.forEach(([z, y, x], i) => W.send({ type: 'tile', id: i + 1, z, y, x, hi: false }));
  await settle();
  assert.equal(W.calls.length, ONE_HOST.length);
});

test('⑥ a newer destination replaces the old one: what never left is dropped, what left is not cancelled', async () => {
  const W = bootWorker();
  W.send({ type: 'config', lanes: 1 });
  W.send({ type: 'tile', id: 1, z: 14, y: 100, x: 200, hi: false });     /* occupies the lane */
  /* (sat-mobile-speed) a destination is speculation: one at a time per host, in a socket nothing visible uses */
  W.send({ type: 'spec', kind: 'dest', tiles: [[14, 100, 202], [14, 100, 204]] });
  await settle();
  W.send({ type: 'spec', kind: 'dest', tiles: [[14, 100, 206]] });
  await settle();
  for (let k = 0; k < 4; k++) { if (W.pending.length) W.answer(() => true); await settle(); }
  const fetched = W.calls.map((u) => u.replace(/^.*tile\//, ''));
  assert.deepEqual(fetched, ['14/100/200', '14/100/202', '14/100/206'], 'the abandoned destination\'s waiting tile (204) cost nothing; 202 had already left (#R196)');
});

/* the client, with a fake Worker: an abandoned tile is answered at once, a late bitmap is closed */
test('⑦ the client gives the renderer\'s slot back the moment the tile is abandoned', async () => {
  let worker = null;
  class FakeWorker { constructor() { worker = this; this.sent = []; } postMessage(m) { this.sent.push(m); } terminate() { } }
  const ctx = { console, Promise, Map, Error, URL, Worker: FakeWorker, OffscreenCanvas: class { }, createImageBitmap: () => { } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('src/sat-worker-client.js').replace(/import\.meta\.url/g, "'http://x/src/sat-worker-client.js'"), ctx);
  const C = ctx.window.IntMapSatWorker;
  const ac = new AbortController();
  const p = C.tile(14, 100, 200, false, ac.signal, 0);
  let outcome = null; p.then(() => { outcome = 'resolved'; }, (e) => { outcome = e.name; });
  ac.abort();
  await settle();
  assert.equal(outcome, 'AbortError', 'settled at once, without waiting for the worker');
  assert.ok(worker.sent.some((m) => m.type === 'abort'), 'and the worker was told');
  let closed = false;
  worker.onmessage({ data: { id: worker.sent.find((m) => m.type === 'tile').id, ok: true, bitmap: { close() { closed = true; } } } });
  assert.ok(closed, 'a bitmap that arrives for an abandoned tile is closed, not leaked');
});

/* the readout's DEM warm-up, evaluated with a fake camera */
function prefetchFn() {
  const s = read('js/app-body.js');
  const a = s.indexOf('function prefetchDEMViewport(){');
  assert.ok(a >= 0, 'prefetchDEMViewport exists');
  let i = s.indexOf('{', a), d = 0;
  for (; i < s.length; i++) { if (s[i] === '{') d++; else if (s[i] === '}' && --d === 0) break; }
  return s.slice(a, i + 1);
}
test('⑧ the DEM warm-up samples the SCREEN: sky is skipped, and the bounds are not asked', () => {
  const asked = [];
  const ge = {
    hasRenderer: () => true,
    render: { size: () => ({ width: 600, height: 600 }) },
    coords: {
      onSurface: (pt) => pt[1] >= 200,                            /* the top third is sky */
      unproject: (pt) => ({ lng: pt[0] / 100, lat: pt[1] / 100 }),
    },
    camera: { getBounds: () => { throw new Error('the bounds run to the horizon when pitched — not to be used'); } },
  };
  const f = new Function('GE', '_imPhoneClass', 'demZoomForMap', 'demElevAt', prefetchFn() + '; return prefetchDEMViewport;')(
    () => ge, () => false, () => 12, (lng, lat, cb, z) => asked.push([lng, lat, z]));
  f();
  assert.ok(asked.length > 0, 'the ground is warmed');
  assert.ok(asked.every(([, lat]) => lat >= 2), 'nothing above the horizon');
  assert.ok(asked.every(([, , z]) => z === 12), 'at the zoom the readout reads');
  assert.ok(asked.length <= 49, 'never more than the 7×7 it always was');
});

/* ⑨ a refused key never blanks the map — run against the worker's real fetch path, with a key that the
   service refuses the way ibasemaps-api does (HTTP 200, JSON body) */
function keyedEsri() {
  let refused = false; const why = [];
  return { why, imageryKeyed: () => !refused, imageryRefused: (w) => { refused = true; why.push(w); }, isImageryReply: esriImagery.isImageryReply, isImageryPlaceholder: esriImagery.isImageryPlaceholder,
    imageryTileUrl: (z, y, x) => (refused ? esriImagery.keylessTileUrl(z, y, x) : 'https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/' + z + '/' + y + '/' + x + '?token=K') };
}
const refusing = (u) => /token=/.test(u)
  ? { ok: true, status: 200, headers: { get: () => 'text/plain; charset=utf-8' }, arrayBuffer: async () => new ArrayBuffer(60) }
  : { ok: true, status: 200, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => new ArrayBuffer(9000) };
test('⑨ worker: a keyed reply that is not an image → the same tile again, keyless, and the picture arrives', async () => {
  const E = keyedEsri();
  const W = bootWorker(E, refusing);
  W.send({ type: 'tile', id: 1, z: 14, y: 100, x: 200, hi: false });
  for (let k = 0; k < 4; k++) { await settle(); if (W.pending.length) W.answer(() => true); }
  await settle();
  assert.equal(W.calls.length, 2, 'asked twice');
  assert.match(W.calls[0], /ibasemaps-api.*token=/);
  assert.equal(W.calls[1], esriImagery.keylessTileUrl(14, 100, 200), 'the second ask is the keyless URL of the SAME tile');
  assert.deepEqual(E.why, ['text/plain; charset=utf-8'], 'the refusal is reported once, with what came back');
  const r = W.posted.find((m) => m.id === 1);
  assert.ok(r && r.ok && r.mode === 'native', 'a real tile, not the 60-byte refusal read as a placeholder');
  /* after the refusal every later tile goes keyless straight away */
  W.send({ type: 'tile', id: 2, z: 14, y: 100, x: 202, hi: false });
  await settle(); W.answer(() => true); await settle();
  assert.equal(W.calls[2], esriImagery.keylessTileUrl(14, 100, 202));
});

test('⑩ main thread (the fallback path): the same refusal, the same one retry', async () => {
  const s = read('js/sat-proto.js');
  const a = s.indexOf('async function _satGet(');
  assert.ok(a >= 0, '_satGet exists');
  let i = s.indexOf('{', a), d = 0;
  for (; i < s.length; i++) { if (s[i] === '{') d++; else if (s[i] === '}' && --d === 0) break; }
  const E = keyedEsri(); const calls = [];
  const get = new Function('fetch', 'imageryKeyed', 'imageryRefused', 'isImageryReply', '_satUrl', s.slice(a, i + 1) + '; return _satGet;')(
    async (u) => { calls.push(u); return refusing(u); }, E.imageryKeyed, E.imageryRefused, E.isImageryReply, E.imageryTileUrl);
  const r = await get(14, 100, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[1], esriImagery.keylessTileUrl(14, 100, 200));
  assert.ok(esriImagery.isImageryReply(r), 'what is returned is the image');
  /* keyless from the start: one ask, no retry, even for a non-image */
  const calls2 = [];
  const get2 = new Function('fetch', 'imageryKeyed', 'imageryRefused', 'isImageryReply', '_satUrl', s.slice(a, i + 1) + '; return _satGet;')(
    async (u) => { calls2.push(u); return { ok: false, status: 404, headers: { get: () => '' } }; }, () => false, () => { throw new Error('not keyed'); }, E.isImageryReply, esriImagery.keylessTileUrl);
  await get2(14, 100, 200);
  assert.equal(calls2.length, 1, 'the keyless path is asked once, as before');
});
