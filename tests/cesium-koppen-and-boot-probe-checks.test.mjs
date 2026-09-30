/* ============================================================================
 *  cesium-koppen-and-boot-probe — three defects, each EVALUATED (no source-shape check stands in for
 *  a behaviour here; the one browser-only claim is tests/cesium-koppen-and-boot-probe-cesium.spec.js).
 *
 *  ① On the Cesium engine every `image` source was absent. MEASURED on the built site, Cesium,
 *     Köppen on: `lyr-climate` and `src-climate` in the style, the row ticked, the legend drawn, and
 *     the layer record `imagery:false, provider:null`. The adapter called
 *     `new SingleTileImageryProvider({url, rectangle})`, which since Cesium 1.104 throws without
 *     tileWidth/tileHeight, into a catch that returned null. And the drape was geographic where
 *     MapLibre's is Mercator. js/cesium-layers.js makeImageSourceProvider is loaded here against the
 *     REAL Cesium the app ships; only the network read of the picture is stubbed.
 *
 *  ② The self-diagnosis sent every visitor's page to GDELT 25 s after boot. MEASURED from production
 *     2026-09-27 on the probe's own URL: gdelt-relay 502 `upstream_unavailable` /
 *     `x-intmap-gdelt-upstream: 429/1` after 11.4 s, then a direct read that aborted — two console
 *     errors per boot, and upstream load GDELT counts. The relay is evaluated (Deno.serve captured,
 *     as tests/r769 does) and so is js/proxy-fetch.js peekOwnRelay.
 *
 *  ③ `_minimizeOpenLegends` judged «open» by `display==='block'||'flex'` after the tiler had moved to
 *     the fact (hidden / inline none / computed display). Both are lifted from js/data-layers.js and
 *     RUN, over legends where the two spellings disagree.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { liftFunction } from './helpers/lift-function.mjs';
import { installDevice } from './helpers/ui-device.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ── shared globals: the relay (Deno), the page modules (window) ───────────────────────────── */
const ENV = { SUPABASE_URL: 'https://stub.supabase.test', GDELT_STORAGE_KEY: 'stub-service-key' };
let HANDLER = null;
const WAITED = [];
globalThis.Deno = { env: { get: (n) => ENV[n] || '' }, serve: (h) => { HANDLER = h; } };
globalThis.EdgeRuntime = { waitUntil: (p) => { WAITED.push(p); } };
globalThis.window = { SUPABASE_URL: 'https://stub.supabase.test' };

/* ══════════════════════════════════════════════════════════════════════════════════════════
   ①  an `image` source on the Cesium engine
   ══════════════════════════════════════════════════════════════════════════════════════════ */
const C = await import('@cesium/engine');
await import(pathToFileURL(join(ROOT, 'js/cesium-layers.js')).href);
const CL = globalThis.window.IntMapCesiumLayers;

/* the real namespace, with the one network read replaced by a picture of a known size */
const withPicture = (pic) => ({ ...C, ImageryProvider: { loadImage: (_p, url) => Promise.resolve(typeof pic === 'function' ? pic(url) : pic) } });
const KC = [[-180, 85.0511287798066], [180, 85.0511287798066], [180, -85.0511287798066], [-180, -85.0511287798066]];

test('① the path the adapter used cannot build a provider at all (why Köppen was never painted)', () => {
  /* a characterisation of the Cesium the app ships, not of our code: it is the reason the old
     `new SingleTileImageryProvider({url, rectangle})` landed in its catch every time */
  assert.throws(() => new C.SingleTileImageryProvider({ url: 'koppen.png', rectangle: C.Rectangle.fromDegrees(-180, -85, 180, 85) }),
    /tileWidth/, 'Cesium no longer requires tileWidth — if so the old path might have worked; re-measure');
});

test('① an image source becomes a provider, sized by the picture, over its own Mercator rectangle', async () => {
  const P = await CL.makeImageSourceProvider(withPicture({ width: 4096, height: 4096 }), { url: 'koppen_mercator_1991-2020_4k.png', coordinates: KC });
  assert.equal(P.tileWidth, 4096);
  assert.equal(P.tileHeight, 4096);
  assert.ok(P.tilingScheme.projection instanceof C.WebMercatorProjection,
    'draped geographically, the row MapLibre puts at 60° N lands near 35.6° N — the Köppen PNG is Mercator');
  assert.equal(P.minimumLevel, 0); assert.equal(P.maximumLevel, 0);
  const deg = (r) => C.Math.toDegrees(r);
  assert.ok(Math.abs(deg(P.rectangle.north) - 85.0511287798066) < 1e-6);
  assert.ok(Math.abs(deg(P.rectangle.west) + 180) < 1e-6 && Math.abs(deg(P.rectangle.east) - 180) < 1e-6);
  /* the one tile IS the picture, and there is no other */
  assert.equal(P.tilingScheme.getNumberOfXTilesAtLevel(0), 1);
  assert.equal(P.tilingScheme.getNumberOfYTilesAtLevel(0), 1);
  assert.ok(await P.requestImage(0, 0, 0));
  assert.equal(P.requestImage(1, 0, 1), undefined);
});

test('① a partial box is placed by its Mercator corners (texture linear in Mercator Y, as MapLibre)', async () => {
  const box = [[100, 70.3], [160, 70.3], [160, 6.3], [100, 6.3]];
  const P = await CL.makeImageSourceProvider(withPicture({ width: 300, height: 200 }), { url: 'data:image/png;base64,AA', coordinates: box });
  const proj = new C.WebMercatorProjection();
  const sw = proj.project(C.Cartographic.fromDegrees(100, 6.3)), ne = proj.project(C.Cartographic.fromDegrees(160, 70.3));
  const nr = P.tilingScheme.tileXYToNativeRectangle(0, 0, 0);
  for (const [a, b] of [[nr.west, sw.x], [nr.south, sw.y], [nr.east, ne.x], [nr.north, ne.y]]) assert.ok(Math.abs(a - b) < 1e-3, `${a} vs ${b}`);
  /* the latitude of the picture's middle row is the Mercator middle, not the arithmetic 38.3° */
  const midY = (sw.y + ne.y) / 2;
  const midLat = C.Math.toDegrees(proj.unproject(new C.Cartesian3(0, midY)).latitude);
  assert.ok(midLat > 40, `middle row at ${midLat.toFixed(2)}° — a geographic drape would put it at 38.3°`);
});

test('① a picture that cannot be had is a rejection (the layer then records why), not a silent blank', async () => {
  await assert.rejects(CL.makeImageSourceProvider(withPicture({ width: 0, height: 0 }), { url: 'x.png', coordinates: KC }));
  await assert.rejects(CL.makeImageSourceProvider(withPicture(() => { throw new Error('404'); }), { url: 'x.png', coordinates: KC }));
  await assert.rejects(CL.makeImageSourceProvider(withPicture({ width: 1, height: 1 }), { url: 'x.png' }));
});

/* ══════════════════════════════════════════════════════════════════════════════════════════
   ②  the boot probe asks our relay what the upstream last said
   ══════════════════════════════════════════════════════════════════════════════════════════ */
await import(pathToFileURL(join(ROOT, 'supabase/functions/gdelt-relay/index.ts')).href);
const { peekOwnRelay } = await import(pathToFileURL(join(ROOT, 'js/proxy-fetch.js')).href);
const { upstreamRefused } = await import(pathToFileURL(join(ROOT, 'scripts/probe-relay-ladder.mjs')).href);

const PROBE_URL = 'https://api.gdeltproject.org/api/v2/doc/doc?query=news&mode=artlist&maxrecords=1&format=json&timespan=1d';
let STORE = new Map(), UP = 0, WRITES = [];
const REAL_NOW = Date.now;
let VCLOCK = 0;
function relayWorld(upstream) {
  globalThis.fetch = async (input, init) => {
    const u = String((input && input.url) || input);
    const m = /\/storage\/v1\/object\/(?:public\/)?gdelt\/([^?]+)/.exec(u);
    if (m && u.includes('/object/public/')) { const v = STORE.get(m[1]); return v ? new Response(v, { status: 200 }) : new Response('nothing', { status: 404 }); }
    if (m) { const body = String(init && init.body); STORE.set(m[1], body); WRITES.push(m[1]); return new Response('{}', { status: 200 }); }
    if (u.includes('/storage/v1/')) return new Response('{}', { status: 200 });
    /* ⚠ the clock is virtual and each upstream answer costs 10 s of it, as in tests/r769: the warm's
       budget is the implementation's own, and the check does not wait it out in real time */
    if (u.startsWith('https://api.gdeltproject.org/')) { UP++; VCLOCK += 10000; return upstream(); }
    throw new Error('this check must not reach the network: ' + u);
  };
}
const relayAsk = async (qs) => {
  WAITED.length = 0;
  VCLOCK = REAL_NOW(); Date.now = () => VCLOCK;
  try {
    const res = await HANDLER(new Request('https://edge.test/functions/v1/gdelt-relay?' + qs));
    await Promise.all(WAITED.splice(0).map((p) => Promise.resolve(p).catch(() => {})));
    return res;
  } finally { Date.now = REAL_NOW; }
};
const REFUSED = () => new Response('{"error":"rate limited"}', { status: 429, headers: { 'content-type': 'application/json' } });
const receipt = (note, ageMs) => JSON.stringify({ t: Date.now() - ageMs, b: JSON.stringify({ note }) });

test('② a cold miss that GDELT refused is 503 (temporarily unavailable), and leaves what it heard for the whole relay', async () => {
  STORE = new Map(); WRITES = []; UP = 0;
  relayWorld(REFUSED);
  const res = await relayAsk('u=' + encodeURIComponent(PROBE_URL));
  assert.equal(res.status, 503, 'GDELT\'s 429 is a valid «not now»; 502 says the upstream answered with something invalid');
  assert.ok(WRITES.includes('upstream-last.json'), 'the upstream\'s refusal was not recorded for peek to read');
  /* and an answer that is not an artlist stays 502 — that one IS an invalid response */
  STORE = new Map(); WRITES = [];
  relayWorld(() => new Response('{"status":"ok"}', { status: 200, headers: { 'content-type': 'application/json' } }));
  assert.equal((await relayAsk('u=' + encodeURIComponent(PROBE_URL))).status, 502);
});

test('② ?peek=1 answers from the record — 200, never a request to GDELT, never a warm', async () => {
  for (const [note, state] of [['429/1', 'busy'], ['200/1', 'ok'], ['not-artlist/1', 'fault'], ['upstream_timeout/2', 'busy']]) {
    STORE = new Map([['upstream-last.json', receipt(note, 120000)]]); UP = 0; WRITES = [];
    relayWorld(REFUSED);
    const res = await relayAsk('peek=1');
    assert.equal(res.status, 200, 'the relay answering IS the relay being up — a 5xx here would be a console error in every visitor\'s page');
    const j = await res.json();
    assert.equal(j.state, state, `upstream note ${note}`);
    assert.equal(j.upstream, note);
    assert.ok(j.upstreamAgeMs >= 120000);
    assert.equal(UP, 0, 'peek sent a request to GDELT');
    assert.equal(WRITES.length, 0, 'peek wrote something');
  }
  STORE = new Map(); UP = 0;
  const none = await (await relayAsk('peek=1')).json();
  assert.equal(none.state, 'unobserved', 'no record is «nothing observed», not «down»');
  assert.equal(UP, 0);
});

test('② peekOwnRelay: one request, to our relay, and the three facts stay apart', async () => {
  const seen = [];
  const pageWorld = (answer) => { globalThis.fetch = async (input) => { const u = String((input && input.url) || input); seen.push(u); return answer(u); }; };
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });

  const cases = [
    [() => json({ relay: 'up', upstream: '429/1', state: 'busy', upstreamAgeMs: 5 }), { ok: false, state: 'busy', status: 429 }],
    [() => json({ relay: 'up', upstream: 'upstream_timeout/1', state: 'busy', upstreamAgeMs: 5 }), { ok: false, state: 'busy', status: 503 }],
    [() => json({ relay: 'up', upstream: '200/1', state: 'ok', upstreamAgeMs: 5 }), { ok: true, state: 'ok' }],
    [() => json({ relay: 'up', upstream: 'none', state: 'unobserved', upstreamAgeMs: null }), { ok: null, state: 'unobserved' }],
    [() => json({ relay: 'up', upstream: 'not-artlist/1', state: 'fault', upstreamAgeMs: 5 }), { ok: false, state: 'fault', status: 502 }],
    [() => { throw new TypeError('Failed to fetch'); }, { ok: false, state: 'down' }],
    [() => json({ code: 'BOOT_ERROR' }, 503), { ok: false, state: 'down', status: 503 }],
  ];
  for (const [answer, want] of cases) {
    seen.length = 0;
    pageWorld(answer);
    const got = await peekOwnRelay(PROBE_URL, 2000);
    for (const k of Object.keys(want)) assert.equal(got[k], want[k], `${k} for ${JSON.stringify(want)}`);
    assert.equal(seen.length, 1, 'exactly one request');
    assert.match(seen[0], /\/functions\/v1\/gdelt-relay\?peek=1$/, 'the request went to our relay\'s peek');
    assert.ok(!seen.some((u) => u.startsWith('https://api.gdeltproject.org/')), 'the probe reached GDELT');
  }
});

test('② the relay probe reads «relay up, upstream refusing» as not dead', () => {
  assert.equal(upstreamRefused(503, '{"error":"upstream_unavailable","upstream":"429/1"}'), true);
  assert.equal(upstreamRefused(503, '{"error":"upstream_timeout"}'), true);
  assert.equal(upstreamRefused(503, '{"code":"BOOT_ERROR","message":"Function failed to start"}'), false, 'the gateway\'s own 503 is a relay that did not run');
  assert.equal(upstreamRefused(502, '{"error":"upstream_unavailable"}'), false);
  assert.equal(upstreamRefused(503, 'not json'), false);
});

/* ══════════════════════════════════════════════════════════════════════════════════════════
   ③  one answer to «is this legend on screen», read by the tiler and by the tap-to-fold
   ══════════════════════════════════════════════════════════════════════════════════════════ */
const DL = codeOnly(readLF(join(ROOT, 'js/data-layers.js')));
const DL_DECL = DL.replace('window._minimizeOpenLegends=function(', 'function minimizeOpenLegends(');
const DL_BODY = ['legendShown', 'toggleLegendMin', 'ensureLegendMinimize', 'discoverLegends', 'placeLegends'].map((n) => liftFunction(DL, n))
  .concat([liftFunction(DL_DECL, 'minimizeOpenLegends')]).join('\n');
/* the free names the discovery reads are DISCOVERED from its own body, not listed here */
const TILE = liftFunction(DL, 'discoverLegends');
const LGD = [...new Set(TILE.match(/\blgd[A-Z]\w*/g) || [])];
/* `tileLegends` is the next-frame request (legend-layout-frame); the placement is `placeLegends` */
const STUBS = ['ensureLegendOpacity', 'ensureContourSwitch', 'ensureContourDensity', 'watchLegendSize', 'tileLegends'];

function legend(id, { inline = '', computed = 'block', hidden = false, docked = false } = {}) {
  const cls = new Set(docked ? ['im-docked'] : []);
  const children = [{ tagName: 'H4', classList: { contains: () => false }, style: {} }, { tagName: 'DIV', classList: { contains: () => false }, style: {} }];
  const el = {
    id, hidden, dataset: {}, children, style: { display: inline }, __computed: computed, generic: true,
    classList: { contains: (c) => cls.has(c), add: (c) => cls.add(c), remove: (c) => cls.delete(c),
      toggle: (c) => { if (cls.has(c)) { cls.delete(c); return false; } cls.add(c); return true; } },
    appendChild: (c) => children.push(c),
    querySelector: (sel) => children.find((c) => c.classList.contains(sel.replace('.', ''))) || null,
    get folded() { return cls.has('legend-collapsed'); },
    get hasMinButton() { return children.some((c) => c.className === 'legend-min'); },
    getBoundingClientRect: () => ({ height: 120, width: 199 }),
    scrollHeight: 120,
  };
  return el;
}
function run(legends) {
  const document = {
    getElementById: (id) => (id === 'map-container' ? { getBoundingClientRect: () => ({ height: 900, width: 1100 }) } : null),
    getElementsByClassName: (c) => (c === 'data-legend generic-legend' || c === 'data-legend' ? legends : []),
    querySelector: () => null,
    createElement: () => { const e = { tagName: 'BUTTON', className: '', style: {}, textContent: '', title: '' };
      e.classList = { contains: (c) => String(e.className).split(/\s+/).includes(c) }; return e; },
    body: { classList: { contains: () => false } },
  };
  const window = { innerHeight: 900, innerWidth: 1100, matchMedia: () => ({ matches: false }), IntMapLang: { t: (...a) => a[1] } };
  installDevice(window);   /* (ui-layer-owner) js/ asks window.IntMapDevice now — the real owner, wired to this fake */
  /* the page's computed style, per element — what the stylesheet says, which the inline value may not */
  const getComputedStyle = (el) => ({ display: el.__computed });
  /* eslint-disable no-new-func */
  const make = new Function('document', 'window', 'getComputedStyle', 'HOST', ...LGD, ...STUBS, DL_BODY + '\nreturn { placeLegends, minimizeOpenLegends, legendShown };');
  return make(document, window, getComputedStyle, { lang: 'en' }, ...LGD.map(() => null), ...STUBS.map(() => () => {}));
}

test('③ tap-to-fold folds exactly the legends the tiler places — the two spellings that disagreed', () => {
  const legends = [
    legend('by-stylesheet', { inline: '', computed: 'flex' }),      /* shown by its class; the old test said «closed» */
    legend('suppressed', { inline: 'flex', computed: 'none' }),     /* a stylesheet hides every legend (a flight); the old test said «open» */
    legend('plain', { inline: 'block', computed: 'block' }),
    legend('hidden-attr', { inline: 'block', computed: 'block', hidden: true }),
    legend('inline-none', { inline: 'none', computed: 'none' }),
    legend('docked', { inline: 'block', computed: 'block', docked: true }),
  ];
  const api = run(legends);
  api.placeLegends();
  const tiled = new Set(legends.filter((el) => el.hasMinButton).map((el) => el.id));
  assert.deepEqual([...tiled].sort(), ['by-stylesheet', 'docked', 'plain'], 'the tiler\'s own verdict');
  api.minimizeOpenLegends();
  const folded = legends.filter((el) => el.folded).map((el) => el.id).sort();
  /* the docked one is exempt by design (#R240) — it is not over the map */
  assert.deepEqual(folded, [...tiled].filter((id) => id !== 'docked').sort(),
    'tap-to-fold and the tiler disagree about which legends are on screen');
});
