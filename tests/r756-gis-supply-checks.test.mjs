/* ============================================================================
 *  #R756 · 地図が本当に持っているものを、供給元として訊けるようにした
 * ----------------------------------------------------------------------------
 *  ⚠ THE INVARIANTS ARE THE DEFECT, NOT THE FIX ([[intmap-restate-the-defect-not-the-fix]]).
 *  「supply() が呼ばれている」 is a sentence about an implementation and it passes over a wrong one.
 *  What was measured in the shipped code before this round, and what the reader LOST by it:
 *
 *    ① js/gis-sources.js supply() had ZERO call sites in the repository, and prepare() refuses
 *       `where` unless a registered implementation claims it — so 「M6 以上だけ渡せ」 came back
 *       `where-not-supported` FOR EVERY ID IN THE APP. Not for the rows that cannot filter: for all
 *       of them, always, because nothing could be asked. The same wall stood in front of `cursor`.
 *    ② a paged read was therefore impossible, so 「続きを」 had no answer that was not a refusal
 *    ③ `completeness:'all'` is reachable only from a declaration, and declare()'s only caller in the
 *       shipped app is the upload path — so a BUILT-IN layer could not reach it whatever it held.
 *       js/map-ui.js state() assembles six fields for a reader and a claim about what a source
 *       CONTAINS is not one of them, so the statement died at the registry door.
 *    ④ a capability is a claim, and a claim that is not executed is worse than a refusal: a supplier
 *       saying `where:true` and handing back every row answers a question nobody asked, with real
 *       data. So the executor is measured against js/gis-ops.js's own filter, operator by operator.
 *    ⑤ 「どのレイヤーが全件を持っているか」 written down anywhere is a photograph
 *       ([[intmap-discovered-list-is-a-photograph]]): the row registered next would be missing from
 *       it, silently. So a layer registered DURING this test must become suppliable by saying what
 *       it holds, with no list touched.
 *
 *  ⚠ THE REGISTRY HERE IS THE SHIPPED ONE. js/map-ui.js's layerRegistry is evaluated with a window
 *  shim and a renderer that holds features, so `heritage`, `aircraft` and `ships` are the rows the
 *  app registers, with the bodies the app registers them with — a stub registry would have measured
 *  this file's idea of the contract instead ([[intmap-r671-lessons]]: a stub that outdoes the thing
 *  it stands for repairs the bug on the way past).
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const pt = (lng, lat, p) => ({ type: 'Feature', properties: p || {}, geometry: { type: 'Point', coordinates: [lng, lat] } });

/* ── the app, with a renderer that holds what we put in it ────────────────────────────────────── */

let FACTORY = null;

async function boot() {
  const w = {};
  globalThis.window = w;
  /* the two globals js/map-ui.js's registry touches while it is being built */
  w.IntMapLang = { pick: () => ((en) => en), t: (l, en) => en, locale: () => 'en' };
  w.addEventListener = () => { };
  globalThis.document = {
    getElementById: () => null,
    createElement: () => ({ style: {}, setAttribute() { }, appendChild() { }, querySelector() { return null; } }),
  };
  w.document = globalThis.document;
  new Function('window', read('js/geodesy.js'))(w);

  /* the renderer: GeoJSON sources by id, and a camera. _srcFeatsIn reads exactly these two. */
  const sources = new Map();
  let camera = { w: -180, s: -90, e: 180, n: 90 };
  w.IntMapGeoEngine = {
    scene: { getStyle: () => ({ sources: {} }) },
    layers: {
      sourceData: (sid) => (sources.has(String(sid)) ? { type: 'FeatureCollection', features: sources.get(String(sid)) } : null),
      has: () => false, getLayout: () => 'none',
    },
    camera: { getBounds: () => ({ getWest: () => camera.w, getSouth: () => camera.s, getEast: () => camera.e, getNorth: () => camera.n }) },
    ready: () => false,
  };

  const { makeGisDatasets } = await import('../js/gis-datasets.js');
  const { makeGisOps } = await import('../js/gis-ops.js');
  const { makeGisLayers } = await import('../js/gis-layers.js');
  const { makeGisSources } = await import('../js/gis-sources.js');
  w.IntMapData = makeGisDatasets();
  w.IntMapGisOps = makeGisOps();

  /* ⚠ THE MODULE PUBLISHES ITS FACTORIES ONCE PER PROCESS, onto whatever `window` existed at import
     time; a second boot gets a fresh window and would find nothing there. The factory itself is
     re-run per boot, which is what builds a fresh registry. */
  if (!FACTORY) { await import('../js/map-ui.js'); FACTORY = w.IntMapModules.layerRegistry; }
  FACTORY({
    lang: 'en', mapType: 'flat', proj: 'mercator', globalData: null, toolMode: null,
    canDraw: () => false, demElevAt: () => null,
  });

  const layers = makeGisLayers();
  const sourcesApi = makeGisSources();
  return {
    w, layers, sources: sourcesApi, data: w.IntMapData, ops: w.IntMapGisOps, registry: w.IntMapLayers,
    put: (sid, fs) => sources.set(sid, fs),
  };
}

/* The shipped World-Heritage row reads `whs-src`, and it is the row this file uses as 「全件を持って
   いるもの」 because that is what it says about itself — not because this file decided so. */
const HERITAGE_SRC = 'whs-src';

function quakeSet() {
  const out = [];
  for (let i = 0; i < 12; i++) out.push(pt(i * 0.5, 10 + i * 0.25, { id: 'q' + i, mag: 3 + i * 0.5, place: (i % 2 ? 'Honshu' : 'Kyushu') }));
  return out;
}

/* ══ ① 属性条件は、どのレイヤーに出しても断られていた ═══════════════════════════════════════ */

test('R756 ① a condition on a layer that holds everything is executed, and only matching rows come back', async () => {
  const { layers, sources, put } = await boot();
  put(HERITAGE_SRC, quakeSet());

  const all = await sources.acquire('heritage', {});
  assert.equal(all.ok, true, JSON.stringify(all));
  assert.equal(all.features.length, 12);

  const got = await sources.acquire('heritage', { where: [{ field: 'mag', op: '>=', value: 6 }] });
  /* THE DEFECT ITSELF: this was `where-not-supported` for every id in the app. */
  assert.notEqual(got.ok === false && got.why, 'where-not-supported', 'the condition was refused, as it always was');
  assert.equal(got.ok, true, JSON.stringify(got));
  assert.ok(got.features.length > 0 && got.features.length < 12, 'nothing was narrowed: ' + got.features.length);
  for (const f of got.features) {
    assert.ok(f.properties.mag >= 6, 'a row that does not meet the condition came back: ' + JSON.stringify(f.properties));
  }
  /* every row that DOES meet it is there — a filter that drops matches is as wrong as one that keeps
     non-matches, and only one of the two is visible from the answer alone */
  const expected = quakeSet().filter((f) => f.properties.mag >= 6).length;
  assert.equal(got.features.length, expected);
  /* and the record says what the answer is the answer to */
  assert.equal(got.coverage.filteredBy, 'supplier');
  assert.deepEqual(got.coverage.requested.where, [{ field: 'mag', op: '>=', value: 6 }]);

  /* ⚠ AND THE SYNCHRONOUS DOOR IS STILL SYNCHRONOUS. js/gis-panel.js and js/gis-atlas.js call
     toDataset() from a click handler without an await, and js/gis-sources.js refuses a supplier that
     answers with a promise — so an implementation that awaited anything would have turned every one
     of those clicks into `supplier-is-async`, for the rows this round supplies. */
  const made = layers.toDataset('heritage', { where: [{ field: 'mag', op: '>=', value: 6 }] });
  assert.ok(made && typeof made.then !== 'function', 'toDataset stopped answering synchronously');
  assert.equal(made.ok, true, JSON.stringify(made));
  assert.equal(made.dataset.count, expected);
  assert.equal(made.dataset.provenance.coverage.completeness, 'all');
});

/* ══ ② ページ送りは頼めず、頼めても継ぎ目で失われうる ═══════════════════════════════════════ */

test('R756 ② two pages joined are the one read — no duplicate, no gap', async () => {
  const { sources, put } = await boot();
  put(HERITAGE_SRC, quakeSet());

  const whole = await sources.acquire('heritage', {});
  assert.equal(whole.ok, true);
  const ids = whole.features.map((f) => f.properties.id);

  const p1 = await sources.acquire('heritage', { limit: 5 });
  assert.notEqual(p1.ok === false && p1.why, 'cursor-not-supported');
  assert.equal(p1.ok, true, JSON.stringify(p1));
  assert.equal(p1.features.length, 5);
  assert.ok(p1.next != null, 'the supplier said nothing about continuation while 7 rows remained');
  /* ⚠ 「まだある」 は供給元が述べたときだけ。三値の真ん中を使っている */
  assert.equal(p1.coverage.continues, true);

  const p2 = await sources.acquire('heritage', { cursor: p1.next });
  assert.equal(p2.ok, true, JSON.stringify(p2));
  assert.equal(p2.coverage.continues, false, 'the last page did not say it was the last');

  const joined = p1.features.concat(p2.features).map((f) => f.properties.id);
  assert.deepEqual(joined, ids, 'the pages are not the list: ' + joined.length + ' vs ' + ids.length);
  assert.equal(new Set(joined).size, joined.length, 'a row arrived twice');

  /* a cursor belonging to another layer is refused rather than read as an offset into this one */
  const alien = await sources.acquire('heritage', { cursor: 'volcanoes@3' });
  assert.equal(alien.ok, false);
  assert.equal(alien.why, 'bad-param');
});

/* ══ ③ 内蔵レイヤーは `all` に原理的に到達できなかった ═══════════════════════════════════════ */

test('R756 ③ the layer that holds everything reaches all, and the camera-bound one does not', async () => {
  const { sources, registry, put } = await boot();
  put(HERITAGE_SRC, quakeSet());
  put('src-planes', quakeSet());

  const held = await sources.acquire('heritage', {});
  assert.equal(held.ok, true);
  assert.equal(held.coverage.completeness, 'all', 'reason: ' + held.coverage.reason);

  /* ⚠ BOTH DIRECTIONS. A rule that answers `all` for everything is not a measurement, and it is the
     answer a 「とりあえず complete:true」 would give. The aircraft row fetches the CAMERA'S rectangle
     from airplanes.live, says so, and must not be able to reach it. */
  const camBound = await sources.acquire('aircraft', {});
  assert.equal(camBound.ok, true, JSON.stringify(camBound));
  assert.notEqual(camBound.coverage.completeness, 'all');
  assert.equal(camBound.coverage.reason, 'supplier-view-bound');

  /* and the two verdicts come from what the rows SAY, which is the thing that had no road here */
  assert.equal(registry.declarationOf('heritage').complete, true);
  assert.equal(registry.declarationOf('aircraft').viewBound, true);
  assert.notEqual(registry.declarationOf('aircraft').complete, true);
  assert.equal(registry.declarationOf('ships').viewBound, true);
  /* a row that says nothing about its holdings still says nothing — an absent statement is not a
     `false` one ([[intmap-data-must-not-claim-an-author-it-lacks]]) */
  assert.equal(registry.declarationOf('temp'), null);
});

/* ══ ④ 申告した能力は、実際に効く ═══════════════════════════════════════════════════════════ */

test('R756 ④ what the supplier claims it executes, it executes — measured against js/gis-ops.js', async () => {
  const { sources, data, ops, put } = await boot();

  /* rows with the three shapes a comparison has to survive: numbers, text, and an empty cell */
  const rows = [
    pt(0, 0, { id: 'a', mag: 4, place: 'Kyushu', depth: '12 km' }),
    pt(1, 0, { id: 'b', mag: 6.5, place: 'honshu', depth: '30 km' }),
    pt(2, 0, { id: 'c', mag: 6.5, place: 'Hokkaido', depth: '' }),
    pt(3, 0, { id: 'd', mag: 9, place: '', depth: '5 km' }),
  ];
  put(HERITAGE_SRC, rows);

  const claim = sources.supplierOf('heritage');
  assert.ok(claim, 'no supplier was adopted for a row that says it holds everything');
  assert.equal(claim.can.where, true, 'the supplier does not claim `where`, so ④ measures nothing');

  const ds = data.add({ title: 'rows', provenance: { kind: 'import', file: 'x' }, features: rows });

  /* ⚠ EVERY OPERATOR THE APP PUBLISHES, through both executors, with the same rows. The vocabulary
     is asked for rather than typed: an operator added to js/gis-ops.js appears here by existing. */
  const vocab = sources.conditionOps();
  assert.ok(Array.isArray(vocab) && vocab.length >= 9, 'the condition vocabulary was not readable');
  const VALUE = {
    '>=': { field: 'mag', value: 6.5 }, '>': { field: 'mag', value: 6.5 },
    '<=': { field: 'mag', value: 6.5 }, '<': { field: 'mag', value: 6.5 },
    '==': { field: 'place', value: 'Kyushu' }, '!=': { field: 'place', value: 'Kyushu' },
    'contains': { field: 'place', value: 'HON' },
    'in': { field: 'mag', value: [4, 9] },
    'between': { field: 'mag', value: [5, 7] },
    /* and the empty cell, which is where the two could most easily disagree */
    'empty': { field: 'depth', value: '' },
  };
  for (const op of vocab) {
    const spec = VALUE[op];
    assert.ok(spec, 'js/gis-ops.js publishes an operator this check has no case for: ' + op);
    const where = [{ field: spec.field, op: op, value: spec.value }];

    const mine = await sources.acquire('heritage', { where: where });
    const theirs = await ops.run({ op: 'filter', inputs: [ds.id], params: { where: where } });
    assert.equal(theirs.ok, true, op + ': the kernel refused — ' + JSON.stringify(theirs));

    const kernelIds = theirs.dataset.features().map((f) => f.properties.id).sort();
    /* ⚠ 0 件は答えであって拒否ではない — js/gis-ops.js says so about its own filter, and a supplier
       that refused an empty result would make 「該当なし」 unchainable. */
    assert.equal(mine.ok, true, op + ': ' + JSON.stringify(mine));
    assert.deepEqual(mine.features.map((f) => f.properties.id).sort(), kernelIds,
      op + ': the two executors disagree — ' + JSON.stringify(mine.features.map((f) => f.properties.id)) + ' vs ' + JSON.stringify(kernelIds));
  }

  /* ⚠ AND AN OPERATOR NAME IT DOES NOT EXECUTE IS REFUSED BY NAME. Answering false for a condition
     nobody ran hands back rows as if the question had been asked. */
  const bogus = await sources.acquire('heritage', { where: [{ field: 'mag', op: 'starts-with', value: 'x' }] });
  assert.equal(bogus.ok, false);
  assert.ok(bogus.why === 'bad-param' || bogus.why === 'where-not-supported', 'got ' + bogus.why);
});

/* ══ ⑤ 供給元の一覧は、書かれた瞬間から古い ═══════════════════════════════════════════════ */

test('R756 ⑤ a layer registered now is suppliable by saying what it holds — no list is touched', async () => {
  const { sources, layers, registry } = await boot();

  const fs = [pt(0, 0, { id: 'n1', v: 1 }), pt(1, 1, { id: 'n2', v: 9 })];
  const inBox = (f, b) => {
    const c = f.geometry.coordinates;
    return !b || (c[0] >= b[0][0] && c[0] <= b[1][0] && c[1] >= b[0][1] && c[1] <= b[1][1]);
  };
  registry.register('r754-new-row', {
    label: () => 'A row registered after every list was written',
    on: () => true,
    featuresIn: (b) => fs.filter((f) => inBox(f, b)),
    holds: () => ({ extent: { w: -180, s: -90, e: 180, n: 90 }, complete: true, viewBound: false, live: false }),
  });

  assert.ok(layers.supplierFor('r754-new-row'), 'a row that declares what it holds got no supplier');
  const got = await sources.acquire('r754-new-row', { where: [{ field: 'v', op: '>=', value: 5 }] });
  assert.equal(got.ok, true, JSON.stringify(got));
  assert.deepEqual(got.features.map((f) => f.properties.id), ['n2']);
  assert.equal(got.coverage.completeness, 'all');

  /* ⚠ AND THE DISCRIMINATION IS THE STATEMENT, NOT THE ID. The same body, saying it keeps only what
     the camera needs, gets no supplier — otherwise 「全部です」 would be answered out of whatever the
     renderer happened to be holding. */
  registry.register('r754-view-row', {
    label: () => 'A row that only keeps the camera\'s rectangle',
    on: () => true,
    featuresIn: (b) => fs.filter((f) => inBox(f, b)),
    holds: () => ({ complete: false, viewBound: true, live: true }),
  });
  assert.equal(layers.supplierFor('r754-view-row'), null);
  const refused = await sources.acquire('r754-view-row', { where: [{ field: 'v', op: '>=', value: 5 }] });
  assert.equal(refused.ok, false);
  assert.equal(refused.why, 'where-not-supported', 'a view-bound row executed a condition it cannot answer');
});

/* ══ ⑥ 宣言は state() の6欄を越えて届く ═════════════════════════════════════════════════════ */

test('R756 ⑥ the declaration reaches js/gis-sources.js without anybody calling declare()', async () => {
  const { sources, put, registry } = await boot();
  put(HERITAGE_SRC, quakeSet());

  /* nothing in this test declared anything; the statement comes from the registration itself */
  const d = sources.declarationOf('heritage');
  assert.ok(d, 'the row\'s own statement did not reach the supply layer');
  assert.equal(d.complete, true);
  assert.equal(d.viewBound, false);
  assert.ok(d.extent && d.extent.w === -180 && d.extent.e === 180);

  /* ⚠ AND IT IS NOT state()'s SIX FIELDS WEARING A NEW NAME. The state a reader is shown says
     nothing about what the source contains, which is why the claim could not travel. */
  const st = registry.state('heritage');
  assert.deepEqual(Object.keys(st).sort(), ['id', 'label', 'legend', 'on', 'source', 'time']);

  /* an explicit declare() still wins — it is about the id as the caller just filled it */
  sources.declare('heritage', { extent: { w: 0, s: 0, e: 1, n: 1 }, complete: false, viewBound: false });
  assert.equal(sources.declarationOf('heritage').complete, false);
});
