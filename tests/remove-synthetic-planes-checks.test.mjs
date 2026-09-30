/* ============================================================================
 *  remove-synthetic-planes — a dead feed is said, never invented
 * ----------------------------------------------------------------------------
 *  MEASURED before this change (2026-09-30/10-01):
 *    · js/data-layers.js genSyntheticPlanes() put ~270 aircraft made of Math.random() on the map —
 *      positions around 44 airports, invented call signs, non-hexadecimal ICAO addresses — whenever
 *      the per-browser airplanes.live sweep came back empty, under a source line crediting
 *      airplanes.live (AGENTS.md §3-3 forbids exactly this);
 *    · that sweep was still reachable with `?aviation=v1` or localStorage `intmap_aviation_v2=0`,
 *      and api.airplanes.live answers HTTP 403 to every request (scripts/upstream-liveness.mjs
 *      recorded it refused) — so the rollback path could ONLY ever draw invented aircraft;
 *    · the path that is left (the aviation-feed Edge Function → src/aviation-worker.js →
 *      js/aviation-live.js) swallowed a failed poll into a counter: a feed that never answered left
 *      the row looking exactly like a row that had drawn.
 *
 *  WHAT IS RUN HERE (the shipped code, not a copy of it):
 *    ① the page side end to end — js/data-layers.js's own `_av2Start` / `_av2State` (lifted out of
 *      the module by the parser), the real js/aviation-live.js controller, the real
 *      src/aviation-worker-client.js, and the real js/layer-state.js — against a worker that answers
 *      a poll with HTTP 403: the row is marked failed with the status, the reader is told ONCE, and
 *      the renderer is handed no aircraft at all. When the feed answers, the row says so.
 *    ② a platform that cannot start rejects the row's request with a reason, and the row says it.
 *    ③ src/aviation-worker.js's own `poll` classifies what went wrong (http + status, network) and
 *      asks the aviation-feed endpoint — and no file the browser loads names api.airplanes.live
 *      (scripts/outbound-hosts.mjs's parser, over the discovered browser files).
 *    ④ the removed names are absent from the code (comments stripped).
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import { codeOnly } from '../scripts/code-only.mjs';
import { browserFiles, discover } from '../scripts/outbound-hosts.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const tick = () => new Promise((r) => setImmediate(r));
const settle = async (n = 8) => { for (let i = 0; i < n; i++) await tick(); };

/* ── the shipped declarations, lifted out of a module that only a browser can boot ─────────────── */
function lift(file, names) {
  const src = read(file);
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  const stmts = [];
  walk.full(ast, (n) => {
    const hit = (n.type === 'FunctionDeclaration' && names.includes(n.id && n.id.name))
      || (n.type === 'VariableDeclaration' && n.declarations.some((x) => names.includes(x.id && x.id.name)));
    if (hit && !stmts.includes(n)) stmts.push(n);
  });
  const found = stmts.flatMap((n) => (n.type === 'FunctionDeclaration' ? [n.id.name] : n.declarations.map((x) => x.id.name)));
  for (const want of names) assert.ok(found.includes(want), `${file} no longer declares ${want}`);
  return stmts.sort((a, b) => a.start - b.start).map((n) => src.slice(n.start, n.end)).join('\n');
}

/* ── one page: a window with the real plane glyph, the real controller and the real worker client ─ */
let booted = null;
async function page() {
  if (booted) return booted;
  const w = { IntMapModules: {}, addEventListener() { }, removeEventListener() { } };
  globalThis.window = w;
  /* the worker the real client talks to: it answers the protocol src/aviation-worker.js speaks, and
     each poll is answered by whatever the test says the feed is doing right now */
  const script = { poll: () => ({ type: 'error', error: 'http_403', reason: 'http', status: 403 }) };
  const seen = { posted: [] };
  class FakeWorker {
    constructor(url) { seen.url = String(url); }
    postMessage(m) {
      seen.posted.push(m);
      queueMicrotask(() => {
        let reply;
        if (m.cmd === 'poll') reply = Object.assign({ id: m.id }, script.poll(m));
        else if (m.cmd === 'config') reply = { id: m.id, type: 'ok' };
        else reply = { id: m.id, type: 'frame', n: 0, total: 0, buffers: {}, ids: [] };
        this.onmessage({ data: reply });
      });
    }
    terminate() { }
  }
  globalThis.Worker = FakeWorker;
  await import(pathToFileURL(join(ROOT, 'js/plane-glyph.js')).href);
  await import(pathToFileURL(join(ROOT, 'src/aviation-worker-client.js')).href);
  await import(pathToFileURL(join(ROOT, 'js/aviation-live.js')).href);
  /* the renderer: it records every aircraft buffer it is handed */
  const drawn = [];
  w.IntMapGeoEngine = {
    hasRenderer: () => true,
    layers: { hasAircraftCloud: () => false, addAircraftCloud: () => true,
      setAircraftCloud: (_id, o) => { if (o && o.buffers) drawn.push(o); }, removeAircraftCloud() { } },
    camera: { getZoom: () => 5, getBounds: () => ({ getWest: () => 0, getSouth: () => 40, getEast: () => 20, getNorth: () => 55 }) },
    events: { on() { } },
  };
  w.SUPABASE_URL = 'https://example-ref.supabase.co';
  const { makeLayerState } = await import(pathToFileURL(join(ROOT, 'js/layer-state.js')).href);
  booted = { w, script, seen, drawn, makeLayerState };
  return booted;
}

/* js/data-layers.js's own start and report, with the closure they live in supplied */
function dataLayersPlanes(w, layerState) {
  const code = lift('js/data-layers.js', ['AVIATION_ENDPOINT', '_av2State', '_av2Start']);
  return new Function('window', 'layerState', 'opacities', 'trafficFilters', 'GE', '_av2TrackApply', `
    let _av2=null, _av2Starting=false, _av2Zoom=null; const planes3D=true;
    ${code}
    return { start: _av2Start, endpoint: AVIATION_ENDPOINT, controller: () => _av2 };`)(
    w, layerState, { planes: 0.9 }, { planes: 'all' }, () => w.IntMapGeoEngine, () => { });
}

test('① a feed that refuses every request is said on the row, once — and no aircraft is drawn', async () => {
  const { w, script, drawn, makeLayerState } = await page();
  const told = [];
  const layerState = makeLayerState({ doc: null, notify: { show: (s) => told.push(s) }, lang: () => 'en', name: () => 'Live aircraft traffic' });
  w.IntMapAviation = w.IntMapModules.aviationLive({});
  w.IntMapLazy = { need: async () => true };
  const DL = dataLayersPlanes(w, layerState);
  script.poll = () => ({ type: 'error', error: 'http_403', reason: 'http', status: 403 });

  const started = await DL.start();
  assert.equal(started, w.IntMapAviation, 'the platform started — the failure is the FEED, not the page');
  await settle();
  const rec = layerState.get('dl-planes');
  assert.ok(rec, 'the row has a record');
  assert.equal(rec.state, 'failed', 'a refused poll with nothing held is a layer that could not draw');
  assert.equal(rec.reason, 'http', 'and the row knows WHICH failure it was');
  assert.equal(rec.status, 403, 'down to the status the feed answered with');
  assert.equal(told.length, 1, 'the reader is told once, not once per channel or per poll');
  assert.match(told[0], /refused the request \(HTTP 403\)/, 'in the words js/layer-state.js has for it');
  /* the renderer may be handed an EMPTY frame (a filter change repacks what is held — nothing); it may
     not be handed an aircraft that the feed never sent */
  const aircraftHanded = drawn.reduce((n, o) => n + ((o.buffers && o.buffers.pos) ? (o.buffers.pos.length >> 1) : 0), 0);
  assert.equal(aircraftHanded, 0, 'NOTHING is drawn — there is no fallback that invents aircraft');
  assert.equal(w.IntMapAviation.stats().aircraftReceived, 0);

  /* a second failed round says nothing new — the same failure is not a new announcement */
  await w.IntMapAviation.pollWorld(); await w.IntMapAviation.pollView(); await settle();
  assert.equal(told.length, 1, 'a repeated failure is not repeated to the reader');

  /* the feed recovers: the worker publishes a frame that carries a snapshot and real aircraft */
  script.poll = () => ({ type: 'frame', n: 3, total: 3, stat: { bytes: 100, decodeMs: 1, applyMs: 1 },
    provider: 'adsblol', attribution: 'adsb.lol — ODbL 1.0', buffers: { pos: new Float32Array(6) }, ids: [1, 2, 3] });
  await w.IntMapAviation.pollWorld(); await settle();
  assert.equal(layerState.get('dl-planes').state, 'ok', 'a feed that answers again is said to have recovered');
  assert.equal(told.length, 1, 'and a recovery is not announced as a failure');
  assert.equal(w.IntMapAviation.stats().attribution, 'adsb.lol — ODbL 1.0', 'the credit is the one the feed sent');

  /* a failure while real aircraft are HELD is not «could not draw» — they are real and ageing */
  script.poll = () => ({ type: 'error', error: 'Failed to fetch', reason: 'network' });
  await w.IntMapAviation.pollView(); await settle();
  assert.equal(layerState.get('dl-planes').state, 'ok', 'aircraft on screen are not replaced by a failure badge');
  w.IntMapAviation.stop();
});

test('② a platform that cannot start rejects the row\'s request with a reason, and the row says so', async () => {
  const { w, makeLayerState } = await page();
  const told = [];
  const layerState = makeLayerState({ doc: null, notify: { show: (s) => told.push(s) }, lang: () => 'en', name: () => 'Live aircraft traffic' });
  /* the lazy module arrived, but the renderer cannot take the GPU cloud (no WebGL2 adapter) */
  const saved = w.IntMapGeoEngine.layers.addAircraftCloud;
  w.IntMapGeoEngine.layers.addAircraftCloud = () => false;
  w.IntMapAviation = w.IntMapModules.aviationLive({});
  w.IntMapLazy = { need: async () => true };
  const DL = dataLayersPlanes(w, layerState);
  /* the row's path: toggleLayer's `req` → js/layer-rows.js layerInflight.track → layerState.request */
  const req = DL.start();
  layerState.request('dl-planes', req);
  await req.catch(() => { }); await settle();
  const rec = layerState.get('dl-planes');
  assert.equal(rec && rec.state, 'failed', 'the row is marked, not left looking like a row that drew');
  assert.equal(rec.reason, 'unsupported');
  assert.equal(told.length, 1, 'and the reader is told');
  assert.equal(DL.controller(), null, 'no half-started controller is kept');
  w.IntMapGeoEngine.layers.addAircraftCloud = saved;

  /* …and a session with no feed address is the same answer, not a silent empty layer */
  const saveUrl = w.SUPABASE_URL; w.SUPABASE_URL = '';
  const DL2 = dataLayersPlanes(w, layerState);
  await assert.rejects(DL2.start(), (e) => e && e.reason === 'unsupported');
  w.SUPABASE_URL = saveUrl;
});

test('③ what is asked is the aviation-feed relay, and a failure carries its reason out of the worker', async () => {
  const { w, seen } = await page();
  const DL = dataLayersPlanes(w, null);
  assert.equal(DL.endpoint, 'https://example-ref.supabase.co/functions/v1/aviation-feed', 'the one endpoint is the server relay');
  const cfg = seen.posted.find((m) => m.cmd === 'config');
  assert.ok(cfg && cfg.endpoint === DL.endpoint, 'and it is what the worker was configured with');

  /* src/aviation-worker.js's own poll, with the fetch it would make recorded */
  const code = lift('src/aviation-worker.js', ['ENDPOINT', 'inflight', 'poll']);
  const run = (fetchImpl) => new Function('fetch', 'performance', `${code}
    ENDPOINT = 'https://example-ref.supabase.co/functions/v1/aviation-feed';
    return poll;`)(fetchImpl, { now: () => 0 });
  const urls = [];
  const refused = run(async (u) => { urls.push(u); return { ok: false, status: 403 }; });
  await assert.rejects(refused('world'), (e) => e.reason === 'http' && e.status === 403 && e.message === 'http_403');
  const offline = run(async (u) => { urls.push(u); throw new TypeError('Failed to fetch'); });
  await assert.rejects(offline('view', '&bbox=0,40,20,55'), (e) => e.reason === 'network');
  assert.deepEqual(urls, [
    'https://example-ref.supabase.co/functions/v1/aviation-feed?ch=world',
    'https://example-ref.supabase.co/functions/v1/aviation-feed?ch=view&bbox=0,40,20,55',
  ], 'every request the worker makes is to the relay');

  /* the host that refused every request: no file the browser loads can ask it any more */
  const hits = discover(browserFiles(ROOT)).filter((o) => /(^|\.)airplanes\.live$/i.test(o.host) && !o.link);
  assert.deepEqual(hits.map((h) => h.file + ':' + h.line), [], 'no browser request to airplanes.live survives');
});

test('④ the generator, the sweep and the switch that selected it are gone', () => {
  const dl = codeOnly(read('js/data-layers.js'));
  for (const gone of ['genSyntheticPlanes', 'AIRPORTS', 'planesSynthetic', 'AVIATION_V2', 'fetchPlanes', '_sweep(',
    'planeCircles', 'adsbToPlane', 'intmap_aviation_v2', "get('aviation')", 'updatePlanesZoomHint', 'Simulated placeholder']) {
    assert.ok(!dl.includes(gone), `${gone} is still in js/data-layers.js`);
  }
  /* the card's credit falls back to naming no provider, never the removed one */
  assert.doesNotMatch(codeOnly(read('js/aircraft-detail.js')), /airplanes\.live/, 'the detail card no longer credits airplanes.live');
  /* the ledger of what the browser talks to no longer carries the host (rule ③ of outbound-hosts) */
  const ledger = JSON.parse(read('scripts/outbound-hosts.json'));
  assert.ok(!ledger.hosts.some((h) => /airplanes\.live/.test(h.host)), 'scripts/outbound-hosts.json no longer lists it');
});

/* #R246 「民間機：シアン #00D9FF 軍用機：鮮赤 #FF3040」 — the live renderer's palette, evaluated. The only path that
   honoured it was the one removed above; the worker drew civil traffic on an altitude ramp instead. */
test('the live aircraft are the colours the reader asked for: civil #00D9FF, military #FF3040', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/aviation-worker.js', import.meta.url), 'utf8');
  const m = /const COL = (\{[\s\S]*?\n\});/.exec(src.replace(/\r\n/g, '\n'));
  if (!m) throw new Error('the worker palette COL is gone');
  const COL = new Function('return ' + m[1])();
  const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
  if (hex(COL.civ) !== '#00D9FF') throw new Error('civil is ' + hex(COL.civ));
  if (hex(COL.mil) !== '#FF3040') throw new Error('military is ' + hex(COL.mil));
  if (/civLow|civHigh/.test(codeOnly(src))) throw new Error('an altitude ramp is back in the civil colour');
});
