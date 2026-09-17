/* ============================================================================
 *  #R783 · 供給元が本当に届く範囲を、供給元自身に述べさせる（カメラではなく窓で取る）
 * ----------------------------------------------------------------------------
 *  ⚠ THE INVARIANTS ARE THE DEFECT, NOT THE FIX ([[intmap-restate-the-defect-not-the-fix]]).
 *  The external audit (§3.1–§3.3) found the acquisition CONTRACT complete — bbox / time / where /
 *  fields / limit / cursor / signal / onProgress, and a `coverage` on every answer — and the
 *  SUPPLIERS not reaching it. Two shapes, measured on the shipped code:
 *
 *    ① THE LIVE ROWS HAD NO WINDOW AT ALL, ONLY A CAMERA. js/aviation-live.js's every read went
 *       through pollView(), whose box is `GE().camera.getBounds()`, and js/gis-layers.js
 *       supplierFor() refuses a row declaring `viewBound:true` — so an analysis over 「この範囲の
 *       航空機」 was served out of whatever the renderer happened to be holding for wherever the
 *       reader had last panned. MEASURED against production 2026-09-17, the upstream the layer
 *       already uses answers a NAMED box exactly:
 *
 *           ?ch=view&bbox=128,30,146,40   → 605 records, 0 outside the box
 *           ?ch=view&bbox=-10,40,10,55    → 2661 records, 0 outside, 0 in common with the above
 *           ?ch=view&bbox=-180,-90,180,90 → 15116 records
 *
 *       The window was askable all along. Nothing asked.
 *    ② AND THE SECOND DOOR WAS THREE SPELLED-OUT KEYS. js/layer-packs.js has had a door 「with no
 *       row and no toggle involved」 since #R311, and it was an if/else over 'dc' / 'pharma' /
 *       'rail' inside load() — so a fourth bundle was reachable from the Layers panel and from
 *       nowhere else, and every branch of it could return WITHOUT CALLING BACK (`if(!M||!M.features)
 *       return;`), which is a promise that never settles for the one caller that wraps it
 *       (js/map-ui.js's pharma `load:`).
 *
 *  ⚠ AND THE HALF THE AUDIT NAMED LOUDEST: 「宣言を書き足すだけでは、持っていない全件データを取得
 *  できるようにはならない」. The feed states `x-intmap-coverage: lattice 856/980` — 124 of its 980
 *  lattice tiles had NEVER been asked about — so an answer for a box is a part of that box whatever
 *  its count, and `completeness:'all'` must be unreachable from this supplier however the request
 *  is phrased. ③ below is that test, and it is the one that must not be «fixed» by relaxing it.
 *
 *  ⚠ THE FIXTURE IS THE REAL WIRE. Snapshots are built with js/aviation-codec.js's own encoder and
 *  handed to the shipped module through a stubbed `fetch`, so what is measured is the module's
 *  decoding, its box test, its per-record observation times and its reading of the feed's own
 *  sentence — not a paraphrase of them written next to the assertions
 *  ([[intmap-co-designed-reader-cannot-falsify]]).
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';

/* ── the boxes, and the aircraft that live in them ─────────────────────────────────────────────
   ⚠ THE TWO BOXES ARE DISJOINT ON PURPOSE. A test whose windows overlap cannot tell 「窓で取った」
   from 「カメラで取った」 when the camera happens to sit in the overlap. */
const JP = { w: 128, s: 30, e: 146, n: 40 };
const EU = { w: -10, s: 40, e: 10, n: 55 };

const FLEET = {
  /* hex, lon, lat, ageSec — the ages differ because one answer holding positions of different ages
     is the measured production case (oldest 899 s), and a single `asOf` would be a claim about all
     of them that only holds for the newest. */
  jp: [
    ['86a1b0', 139.7, 35.6, 2],
    ['86a2cd', 135.5, 34.7, 90],
    ['86a3ef', 141.3, 38.2, 880],
  ],
  eu: [
    ['3c4ab1', 2.35, 48.85, 5],
    ['400def', -0.45, 51.47, 61],
  ],
};

function encodeBox(codec, rows, seq) {
  return codec.encode({
    seq: seq || 1,
    serverTimeMs: Date.now(),
    aircraft: rows.map((r, i) => ({
      hex: r[0], lon: r[1], lat: r[2],
      altFt: 30000 + i * 1000, geometric: false,
      track: 90, gsKt: 450, vrFpm: 0,
      ageSec: r[3],
      onGround: false, military: false, emergency: false, spi: false,
      stale: r[3] > 30, category: 5,
    })),
    identity: rows.map((r) => ({ hex: r[0], callsign: r[0].toUpperCase(), type: 'B738', registration: '', operator: '' })),
  });
}

/* ── a registry that answers what js/map-ui.js's answers ───────────────────────────────────────
   ⚠ NO MORE CAPABLE THAN THE REAL ONE ([[intmap-r671-lessons]]): `featuresIn` answers null for a row
   the renderer has not drawn, `narrow` is the app's one box predicate, and the `aircraft` row states
   exactly what js/map-ui.js's states — `viewBound:true`, which is TRUE of the drawn source and is
   what ③ needs a stronger claimant to override. */
function makeRegistry(w) {
  const rows = new Map();
  let camera = { w: -180, s: -90, e: 180, n: 90 };
  const inBox = (f, b) => {
    const c = f && f.geometry && f.geometry.coordinates;
    return !!c && c[0] >= b.w && c[0] <= b.e && c[1] >= b.s && c[1] <= b.n;
  };
  const asBox = (bounds) => (bounds ? { w: bounds[0][0], s: bounds[0][1], e: bounds[1][0], n: bounds[1][1] } : { ...camera });

  /* the two rows js/map-ui.js ships, written the way js/map-ui.js writes them: `on`/`label`/`holds`
     are FUNCTIONS read at call time, which is the half a stub gets wrong most easily. */
  rows.set('aircraft', {
    label: () => 'Live aircraft', on: () => false,
    holds: () => ({ complete: false, viewBound: true, live: true }),
  });
  rows.set('pharma', {
    label: () => 'Pharma manufacturing hubs', on: () => false,
    holds: () => ({ extent: { w: -180, s: -90, e: 180, n: 90 }, complete: true, viewBound: false, live: false }),
    /* the row js/map-ui.js gave a loader in #R763 — it reaches THROUGH js/layer-packs.js's door */
    load: () => new Promise((res, rej) => { try { w.IntMapBeta2.load('pharma', (fc) => res(fc)); } catch (e) { rej(e); } }),
  });

  const g = (r, k, fb) => { try { return r[k] ? r[k]() : fb; } catch (_) { return fb; } };
  w.IntMapLayers = {
    /* the same door js/layer-packs.js already registers the GIBS rasters through, and
       js/outbreaks.js and js/precip-annual.js each register one through */
    register: (id, impl) => { rows.set(String(id), impl || {}); },
    list: () => Array.from(rows.keys()),
    state: (id) => {
      const r = rows.get(String(id));
      return r ? { id: String(id), on: !!g(r, 'on', false), label: g(r, 'label', String(id)), time: g(r, 'time', null), source: g(r, 'source', null), legend: g(r, 'legend', null) } : null;
    },
    featuresIn: (id, bounds) => {
      const r = rows.get(String(id));
      if (!r || !r.features) return null;
      return r.features.filter((f) => inBox(f, asBox(bounds)));
    },
    featuresInSource: () => null,
    sampleAt: async () => [],
    loaderOf: (id) => { const r = rows.get(String(id)); return (r && typeof r.load === 'function') ? (() => r.load()) : null; },
    narrow: (features, bounds) => {
      if (!Array.isArray(features)) return null;
      if (!bounds) return features.slice();
      const b = asBox(bounds);
      return features.filter((f) => inBox(f, b));
    },
    /* read at call time, and a function is accepted as well as an object — js/map-ui.js
       declarationOf()'s own two shapes */
    declarationOf: (id) => {
      const r = rows.get(String(id));
      if (!r || r.holds == null) return null;
      try { const d = (typeof r.holds === 'function') ? r.holds() : r.holds; return (d && typeof d === 'object') ? d : null; } catch (_) { return null; }
    },
    active: () => Array.from(rows.keys()).filter((id) => !!g(rows.get(id), 'on', false)),
    context: () => [],
  };
  return { rows, setCamera: (b) => { camera = b; }, cameraBox: () => camera };
}

/* ── the feed, on the wire ─────────────────────────────────────────────────────────────────────
   Serves the box the URL names, out of FLEET, with whatever reach sentence the test has set. Keeps
   every URL it was asked for, so 「どの箱を訊いたか」 is measurable rather than assumed. */
function makeFeed(codec) {
  const F = {
    asked: [],
    reachLine: 'lattice 856/980',
    status: 200,
    ageMs: 12,
    oldestMs: 880000,
  };
  F.fetch = async (url) => {
    F.asked.push(String(url));
    const m = /bbox=([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)/.exec(String(url));
    if (!m) throw new Error('no bbox in ' + url);
    const box = { w: +m[1], s: +m[2], e: +m[3], n: +m[4] };
    const rows = FLEET.jp.concat(FLEET.eu)
      .filter((r) => r[1] >= box.w && r[1] <= box.e && r[2] >= box.s && r[2] <= box.n);
    const bytes = encodeBox(codec, rows, F.asked.length);
    const H = {
      'x-intmap-coverage': F.reachLine,
      'x-intmap-age-ms': String(F.ageMs),
      'x-intmap-oldest-ms': String(F.oldestMs),
      'x-intmap-provider': 'adsblol',
      'x-intmap-attribution': 'adsb.lol - ODbL 1.0',
    };
    return {
      ok: F.status >= 200 && F.status < 300,
      status: F.status,
      headers: { get: (k) => (Object.prototype.hasOwnProperty.call(H, String(k).toLowerCase()) ? H[String(k).toLowerCase()] : null) },
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    };
  };
  return F;
}

/* ── the page ──────────────────────────────────────────────────────────────────────────────── */

const stubEl = () => ({
  style: { cssText: '' }, classList: { add() { }, remove() { }, contains: () => false },
  appendChild() { }, insertBefore() { }, remove() { }, setAttribute() { }, getAttribute: () => null,
  querySelector: () => null, querySelectorAll: () => [], addEventListener() { },
  innerHTML: '', textContent: '', children: [], dataset: {},
});

/* ⚠ ONE `window` FOR THE WHOLE FILE, AND THAT IS NOT TIDINESS. js/layer-packs.js and
   js/aviation-live.js publish their factories onto `window` at MODULE SCOPE, and an ES module body
   runs once per process — so a boot() that handed out a fresh object would find `IntMapModules`
   undefined from the second test onwards, and the suite would measure the harness. boot() therefore
   resets the mutable half (registry, engine, kernels, feed) on the same object and re-runs the
   factories, which is what a page reload does to them anyway. */
const W = {};
globalThis.window = W;
globalThis.document = {
  createElement: stubEl, createTextNode: stubEl, getElementById: () => null,
  querySelector: () => null, querySelectorAll: () => [], addEventListener() { },
  readyState: 'complete', body: stubEl(), head: stubEl(),
};
W.document = globalThis.document;
W.addEventListener = () => { };
W.matchMedia = () => ({ matches: false, addEventListener() { }, addListener() { } });
W.localStorage = { getItem: () => null, setItem() { }, removeItem() { } };
W.IntMapLang = { pick: () => ((...a) => a[0]), pickArgs: () => ((...a) => a[0]), t: (l, ...a) => a[0] };
W.IntMapLabelScale = { sub: (x) => x, main: (x) => x };
W.SUPABASE_URL = 'https://example.supabase.co';

async function boot(opts) {
  const o = opts || {};
  const w = W;
  const reg = makeRegistry(w);
  w.IntMapGeoEngine = {
    hasRenderer: () => true, ready: () => true,
    layers: {
      has: () => false, hasSource: () => false, add() { }, addSource() { }, setLayout() { },
      setPaint() { }, setSourceData() { }, get: () => null, getLayout: () => 'none',
      sourceData: () => null, remove() { }, removeSource() { },
      hasAircraftCloud: () => false, addAircraftCloud: () => true, setAircraftCloud() { },
    },
    events: { on() { }, once() { }, onLayer() { } },
    ui: { popup: () => ({ setLngLat() { return this; }, setHTML() { return this; }, remove() { } }), attach: (x) => x },
    render: { canvas: () => ({ style: {} }) },
    camera: {
      getBounds: () => { const c = reg.cameraBox(); return { getWest: () => c.w, getSouth: () => c.s, getEast: () => c.e, getNorth: () => c.n }; },
      getZoom: () => 3,
    },
    coords: {}, scene: { getStyle: () => ({ sources: {} }) },
  };
  /* the lazy modules the pack's bundles ask for */
  w.IntMapDataCenters = { features: () => ({ type: 'FeatureCollection', features: [fc(2.3, 48.9, { n: 'Paris DC' }), fc(139.8, 35.7, { n: 'Tokyo DC' })] }) };
  w.IntMapRailways = { load: (cb) => cb({ type: 'FeatureCollection', features: [fc(7.4, 46.9, { gauge: 1435 }), fc(139.7, 35.7, { gauge: 1067 })] }) };
  w.IntMapLazy = { need: () => Promise.resolve(true) };

  /* the real kernels, in the order they publish */
  const { makeGisDatasets } = await import('../js/gis-datasets.js');
  const { makeGisOps } = await import('../js/gis-ops.js');
  const { makeGisRaster } = await import('../js/gis-raster.js');
  const { makeGisSources } = await import('../js/gis-sources.js');
  const { makeGisLayers } = await import('../js/gis-layers.js');
  w.IntMapData = makeGisDatasets();
  w.IntMapGisOps = makeGisOps();
  w.IntMapGisRaster = makeGisRaster();
  w.IntMapGisSources = makeGisSources();
  w.IntMapGisLayers = makeGisLayers();

  await import('../js/layer-packs.js');
  await import('../js/aviation-live.js');
  /* js/aviation-{codec,model}.js publish onto `globalThis` when there is one, because they are also
     the Edge Function's and the Worker's copies (scripts/sync-aviation.mjs) — and in a browser that
     IS `window`. Node is the one place where the two are different objects. */
  W.IntMapAviationModel = globalThis.IntMapAviationModel;
  W.IntMapAviationCodec = globalThis.IntMapAviationCodec;
  const codec = globalThis.IntMapAviationCodec;
  const feed = makeFeed(codec);
  globalThis.fetch = feed.fetch;

  const HOST = {
    lang: 'en', proj: 'mercator', countryGeo: null, imToast() { }, canDraw: () => true,
    layerCbInfo: {}, saveSettings() { }, renderLayerFavs() { }, loadCountryData() { }, countryStats: {},
  };
  if (o.packs !== false) w.IntMapModules.betaPack2(HOST);
  const av = (o.aviation === false) ? null : w.IntMapModules.aviationLive(HOST);
  return { w, reg, feed, codec, av, sources: w.IntMapGisSources, model: w.IntMapAviationModel || globalThis.IntMapAviationModel };
}

const fc = (lng, lat, p) => ({ type: 'Feature', properties: p || {}, geometry: { type: 'Point', coordinates: [lng, lat] } });
const idsOf = (r) => (r.ok ? r.features.map((f) => f.id).sort() : ['REFUSED:' + r.why]);

/* ══ ① 指定した窓で取る — カメラを別の大陸へ動かしても、同じ窓は同じ ID 集合を返す ═══════════ */

test('R783 ① 同じ範囲の取得は、カメラをどこへ動かしても同じ航空機を返す', async () => {
  const { reg, sources } = await boot();

  reg.setCamera(JP);
  const a = await sources.acquire('aircraft', { bbox: JP });
  assert.equal(a.ok, true, JSON.stringify(a));
  /* ⚠ MEASURED BEFORE THIS ROUND: there was no answer to compare — `aircraft` had no supplier and
     no loader, so this request was served from the renderer's source, i.e. from the camera. */
  assert.deepEqual(idsOf(a), ['86a1b0', '86a2cd', '86a3ef']);

  /* the camera goes to the other end of the planet, and to a box holding OTHER aircraft */
  reg.setCamera(EU);
  const b = await sources.acquire('aircraft', { bbox: JP });
  assert.equal(b.ok, true, JSON.stringify(b));
  assert.deepEqual(idsOf(b), idsOf(a), 'カメラを動かしたら、同じ範囲の取得結果が変わった');
  assert.equal(b.coverage.count, a.coverage.count);

  /* …and the other window is still the other window, from the same camera */
  const e = await sources.acquire('aircraft', { bbox: EU });
  assert.deepEqual(idsOf(e), ['3c4ab1', '400def']);
  assert.equal(idsOf(e).filter((x) => idsOf(a).indexOf(x) >= 0).length, 0, '素の窓が交わっている');
});

test('R783 ① 範囲を指定しない取得は「世界」で、カメラの箱ではない', async () => {
  const { reg, feed, sources } = await boot();
  reg.setCamera(JP);
  const r = await sources.acquire('aircraft', {});
  assert.equal(r.ok, true, JSON.stringify(r));
  /* ⚠ THE CAMERA IS OVER JAPAN AND THE ANSWER HOLDS EUROPE. 「範囲の指定が無い」 is the world
     (js/gis-sources.js coverageOf reads an un-narrowed window as the world), and answering it with
     the camera's box would be answering a different question with real data. */
  assert.deepEqual(idsOf(r), ['3c4ab1', '400def', '86a1b0', '86a2cd', '86a3ef'].sort());
  assert.ok(feed.asked.some((u) => /bbox=-180\.000,-90\.000,180\.000,90\.000/.test(u)), '世界の箱で訊いていない: ' + feed.asked.join(' '));
});

test('R783 ① 訊いた箱は、要求された箱である（カメラの箱が URL に出てはならない）', async () => {
  const { reg, feed, sources } = await boot();
  reg.setCamera(EU);
  await sources.acquire('aircraft', { bbox: JP });
  assert.equal(feed.asked.length, 1);
  assert.match(feed.asked[0], /bbox=128\.000,30\.000,146\.000,40\.000/);
  assert.ok(!/bbox=-10\.000/.test(feed.asked[0]), 'カメラの箱で訊いている');
});

/* ══ ② 一部しか答えられない供給元は、部分だと述べる（黙って all にならない） ════════════════ */

test('R783 ② 上流が「格子 856/980」と述べているのに all を返してはならない', async () => {
  const { sources } = await boot();
  const r = await sources.acquire('aircraft', { bbox: JP });
  assert.equal(r.ok, true);
  /* ⚠ THIS IS THE ASSERTION THE AUDIT ASKED FOR AND THE ONE THAT MUST NOT BE RELAXED. 124 of the
     feed's 980 lattice tiles had never been asked about, so aircraft it has never been told about
     are inside this window. 「取れないことを取れるように宣言する」 is what this refuses. */
  assert.equal(r.coverage.completeness, 'partial', JSON.stringify(r.coverage));
  assert.ok(r.coverage.reason, '部分だと言いながら理由が無い');
  /* the feed's own sentence travels with the answer, so a reader sees 「856/980 の空から」 rather
     than only 「一部」 ([[intmap-coverage-counted-is-not-coverage-seen]]) */
  assert.equal(r.coverage.resolution.stated, 'lattice 856/980');
  assert.equal(r.coverage.resolution.probed, 856);
  assert.equal(r.coverage.resolution.tiles, 980);
});

test('R783 ② 格子が満ちても all にはならない — 一度訊いた空は、いま持っている空ではない', async () => {
  const { feed, sources } = await boot();
  feed.reachLine = 'lattice 980/980';
  const r = await sources.acquire('aircraft', { bbox: JP });
  assert.equal(r.ok, true);
  /* A tile asked about once is not a tile whose aircraft are still held (the feed drops a record at
     STALE_DROP_S), so a full lattice is SILENCE about completeness and not a claim of it. */
  assert.equal(r.coverage.completeness, 'partial', JSON.stringify(r.coverage));
});

test('R783 ② 上流が何も述べないときも部分であり、「述べなかった」が理由になる', async () => {
  const { feed, sources } = await boot();
  feed.reachLine = '';
  const r = await sources.acquire('aircraft', { bbox: JP });
  assert.equal(r.ok, true);
  assert.equal(r.coverage.completeness, 'partial');
  assert.equal(r.coverage.resolution.kind, 'unstated');
});

test('R783 ② 時点を訊かれた取得は、いまの空を「その時点のもの」として渡さない', async () => {
  const { sources } = await boot();
  const r = await sources.acquire('aircraft', { bbox: JP, time: '1889-05-06' });
  assert.equal(r.ok, true);
  /* ⚠ THE VERDICT IS THE ASSERTION, NOT THE REASON. js/gis-sources.js coverageOf() is ORDERED and
     the first rule that holds decides — this supplier is already `partial` for not claiming
     completeness, so the timed request never reaches `time-not-established`. Pinning the reason
     here would be pinning that ordering, and what the record has to carry is that the answer is
     not 「1889 年の空」 and that the time it was asked for is in the record for a reader to see. */
  assert.notEqual(r.coverage.completeness, 'all', JSON.stringify(r.coverage));
  assert.equal(r.coverage.requested.time, '1889-05-06');
  /* and the answer's own moment is NOW, said out loud, so the two cannot be confused */
  assert.ok(new Date(r.coverage.asOf).getUTCFullYear() > 2000, JSON.stringify(r.coverage.asOf));
});

test('R783 ② 観測時刻は 1 件ずつ運ばれる — 1 つの asOf は最新の 1 機についてしか正しくない', async () => {
  const { sources } = await boot();
  const r = await sources.acquire('aircraft', { bbox: JP });
  const ages = r.features.map((f) => f.properties.observedAgeSec).sort((a, b) => a - b);
  /* MEASURED in production: one answer held positions spanning fifteen minutes. */
  assert.deepEqual(ages, [2, 90, 880]);
  const fresh = r.features.map((f) => f.properties.freshness).sort();
  assert.deepEqual(fresh, ['lagging', 'live', 'stale']);
  r.features.forEach((f) => {
    assert.match(f.properties.observedAt, /^\d{4}-\d{2}-\d{2}T/, '観測時刻が ISO ではない');
    /* the id is the aircraft's own identifier, so two reads of one box are comparable */
    assert.equal(f.id, f.properties.hex);
    assert.match(f.id, /^[0-9a-f]{6}$/);
  });
  /* the ANSWER's own time is a different fact and is stated separately */
  assert.match(r.coverage.asOf, /^\d{4}-\d{2}-\d{2}T/);
});

test('R783 ② 実行できない条件は名指しで断られる（できると宣言して素通しにしない）', async () => {
  const { sources } = await boot();
  const bad = await sources.acquire('aircraft', { bbox: JP, where: [{ field: 'gsKt', op: '>=', value: 400 }] });
  assert.equal(bad.ok, false);
  assert.equal(bad.why, 'where-not-supported', JSON.stringify(bad));
  /* ⚠ AND THE LIMIT IS STILL EXECUTED, by the one implementation of paging there is, with a
     truthful count of what was there (js/gis-sources.js fromSupplier). */
  const one = await sources.acquire('aircraft', { bbox: JP, limit: 1 });
  assert.equal(one.ok, true);
  assert.equal(one.features.length, 1);
  assert.equal(one.coverage.available, 3);
  assert.equal(one.coverage.completeness, 'sample');
  assert.equal(one.coverage.reason, 'limit-truncated');
});

/* ══ ③ 失敗した試みも受領証を残す ══════════════════════════════════════════════════════════ */

test('R783 ③ 届かなかった取得は、届かなかったと記録する（走らなかったのと同じに見せない）', async () => {
  const { feed, av, sources } = await boot();
  assert.equal(av.reach(), null, '一度も使っていない扉に受領証がある');

  feed.status = 503;
  const r = await sources.acquire('aircraft', { bbox: JP });
  assert.equal(r.ok, false);
  /* js/gis-sources.js's own vocabulary — a code its REFUSALS list does not name comes back
     marked `undeclared`, and this one must not be */
  assert.equal(r.why, 'supplier-failed', JSON.stringify(r));
  assert.ok(!r.undeclared, '宣言されていない拒否コードを返している');

  const rec = av.reach();
  assert.ok(rec, '失敗した試みの受領証が無い — [[intmap-background-work-needs-a-receipt]]');
  assert.equal(rec.ok, false);
  assert.equal(rec.why, 'http_503');
  assert.deepEqual(rec.box, JP, '受領証がどの窓を訊いたか述べていない');

  feed.status = 200;
  const ok = await sources.acquire('aircraft', { bbox: EU });
  assert.equal(ok.ok, true);
  const rec2 = av.reach();
  assert.equal(rec2.ok, true);
  assert.equal(rec2.count, 2);
  assert.equal(rec2.reach.probed, 856);
  assert.equal(rec2.provider, 'adsblol');
  assert.match(rec2.attribution, /ODbL/, 'ODbL の出典表記が受領証に無い');
  /* §24: the same receipt is on the measurement surface the UI reads */
  assert.equal(av.status().acquire.count, 2);
});

/* ══ ④ 束は発見される — 一覧を手で書かない ═══════════════════════════════════════════════ */

const firstGeom = (fc) => JSON.stringify(fc.features[0] && fc.features[0].geometry);

test('R783 ④ 宣言された束は、1 つ残らず取得可能である（この検査は鍵も id も1つも名指さない）', async () => {
  const { w, sources } = await boot();
  const B = w.IntMapBeta2;
  assert.ok(B && typeof B.loadable === 'function', 'js/layer-packs.js の第2の入口が一覧を述べない');
  const keys = B.loadable();
  assert.ok(keys.length >= 3, '束が減っている: ' + keys.join(','));

  /* ⚠ THE QUESTION IS ASKED BEHAVIOURALLY AND WITHOUT NAMING ANYTHING. For each bundle the pack
     declares, SOME id reachable through js/gis-sources.js must hand over that very collection —
     whether the road is the bundle's own registration or a row that already speaks for it. A bundle
     added tomorrow is covered by this assertion the day it is added, which is the whole point of
     the table replacing the if/else (.agents/rules/no-ad-hoc-hardcoding.md §2-4). */
  const ids = sources.list().map((e) => e.id);
  for (const key of keys) {
    const fc = await B.acquireBundle(key);
    assert.ok(fc && fc.features.length, key + ': 束そのものが読めない');
    let reached = null;
    for (const id of ids) {
      const r = await sources.acquire(id, {});
      if (r.ok && r.features.length === fc.features.length && firstGeom(r) === firstGeom(fc)) { reached = id; break; }
    }
    assert.ok(reached, key + ' はどの id からも取得できない — 第2の入口が取得に繋がっていない');
  }
});

test('R783 ④ 登録行が既にその束を渡しているなら、鍵となる2人目を立てない', async () => {
  const { w, sources } = await boot();
  /* `pharma` has a row with a loader (js/map-ui.js, #R763), so the pack must NOT register a rival
     row for the same holding — two readers of one field list, with a loader on each side. */
  const id = w.IntMapBeta2.idOf('pharma');
  assert.ok(!w.IntMapLayers.list().includes(id), '登録行が渡している束に、2 人目を立てている: ' + id);
  /* and the row's own road still answers, through the very door this round rebuilt */
  const r = await sources.acquire('pharma', { bbox: { w: 0, s: 40, e: 20, n: 60 } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(r.features.length > 0, '束の入口が空を返した');
  assert.equal(r.coverage.completeness, 'all', JSON.stringify(r.coverage));

  /* ⚠ AND THE DECISION IS ASKED OF THE REGISTRY, NOT KEPT IN A LIST. Take the row's loader away and
     publish again: the pack now has to speak for the bundle itself. */
  w.IntMapLayers.loaderOf = () => null;
  assert.ok(w.IntMapBeta2.publish() >= 1, '登録行が黙ったあとも何も立てない');
  assert.ok(w.IntMapLayers.list().includes(id), '登録行が黙ったのに束が取得できない');
});

test('R783 ④ 束の取得は、範囲・条件・件数・続きを 1 つの実装から受け取る', async () => {
  const { w, sources } = await boot();
  const id = w.IntMapBeta2.idOf('rail');
  /* the railway world file, reachable with no row and no toggle — #R311's door, now discovered */
  const all = await sources.acquire(id, {});
  assert.equal(all.ok, true, JSON.stringify(all));
  assert.equal(all.features.length, 2);
  assert.equal(all.coverage.completeness, 'all');

  const jp = await sources.acquire(id, { bbox: JP });
  assert.equal(jp.ok, true);
  assert.equal(jp.features.length, 1, '範囲が実行されていない');
  assert.equal(jp.features[0].properties.gauge, 1067);

  /* ⚠ AND THESE THREE ARE THE REASON THE PACK DOES NOT SUPPLY ITSELF. Routing the bundle through
     js/map-ui.js's registration means js/gis-layers.js's one executor answers the conditions, the
     page and the continuation — a supply() of the pack's own would have been a fourth spelling of
     them, and the #R783 round next door is about exactly what happens then. */
  const narrow = await sources.acquire(id, { where: [{ field: 'gauge', op: '>=', value: 1400 }] });
  assert.equal(narrow.ok, true, JSON.stringify(narrow));
  assert.deepEqual(narrow.features.map((f) => f.properties.gauge), [1435]);
  assert.equal(narrow.coverage.filteredBy, 'supplier');

  const page = await sources.acquire(id, { limit: 1 });
  assert.equal(page.features.length, 1);
  assert.equal(page.coverage.available, 2);
  assert.ok(page.next, '続きについて黙っている');
  const page2 = await sources.acquire(id, { limit: 1, cursor: page.next });
  assert.equal(page2.features.length, 1);
  assert.notDeepEqual(page2.features[0].geometry, page.features[0].geometry, '同じ行を2度返した');
});

test('R783 ④ 第2の入口は必ず決着する — 応えられない束は null で返り、待ち続けない', async () => {
  const { w } = await boot();
  /* MEASURED BEFORE THIS ROUND: every branch of the if/else could return without calling back
     (`if(!M||!M.features) return;`), so js/map-ui.js's `load:` — which wraps this in a promise —
     waited for ever whenever the lazy module had not published. */
  w.IntMapRailways = null;
  const r = await w.IntMapBeta2.acquireBundle('rail');
  assert.equal(r, null, '応えられなかった束が null で決着していない');
  /* an unknown key settles too, and says the same thing */
  assert.equal(await w.IntMapBeta2.acquireBundle('no-such-bundle'), null);
});

/* ══ ⑤ 宣言は、供給元自身が述べたものである ══════════════════════════════════════════════ */

test('R783 ⑤ 画面に依存しない扉は、登録行の viewBound を上書きする（弱い主張に負けない）', async () => {
  const { w, sources } = await boot();
  /* js/map-ui.js's row says `viewBound:true` — true of the DRAWN source, false of this door — and
     js/gis-sources.js prefers an explicit declare() because the module holding the data is the
     stronger claimant (#R756). Without the override the answer would read `supplier-view-bound`,
     i.e. 「画面の分しか無い」 about a read the camera was never in. */
  const d = w.IntMapGisSources.declarationOf('aircraft');
  assert.ok(d, '扉が自分の保持について何も述べていない');
  assert.equal(d.viewBound, false);
  assert.equal(d.complete, false, '生きている供給元が全件を主張している');
  assert.deepEqual(d.extent, { w: -180, s: -90, e: 180, n: 90 });

  /* …and the row is still readable undrawn, which is what `needsVisible:false` states */
  const e = sources.list().filter((x) => x.id === 'aircraft')[0];
  assert.ok(e, 'aircraft が取得可能な一覧に無い');
  assert.equal(e.needsVisible, false, '表示しないと読めないと述べている');
  assert.equal(e.live, true);
});

test('R783 ⑤ 登録は 1 バイトも取りに行かない — 扉が在ることと、上流を叩くことは別', async () => {
  const { feed } = await boot();
  assert.equal(feed.asked.length, 0, 'モジュールを組んだだけで上流を叩いている');
});
