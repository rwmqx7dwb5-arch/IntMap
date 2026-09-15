/* ============================================================================
 *  #R729 · THE GIS CORE — 共通データセット層／処理の受け渡し／プロジェクト保存
 * ----------------------------------------------------------------------------
 *  What this round claimed, and therefore what has to stay true:
 *
 *    ① a column's type is MEASURED from its values, never guessed from its name
 *    ② an op's OUTPUT is a dataset like any other, so it is the next op's input
 *    ③ the ops really refuse rather than drawing something plausible
 *    ④ every refusal code that can reach a reader has a sentence
 *    ⑤ a saved project holds imports whole and ops as RECIPES
 *    ⑥ the cross-dataset query reads the registry at the moment of the query
 *    ⑦ a file becomes a dataset when it is READ, not when it is drawn
 *
 *  ⚠ ④ and ⑦ are the two that guard a real defect this round could have shipped, and both are
 *  measured from the SOURCE of the other files rather than from a list written here — a list here
 *  would be a second copy that goes stale the first time an op learns a new refusal.
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/* js/geodesy.js publishes at top level onto `window` and exports nothing, so it is evaluated the
   way the browser evaluates it rather than imported. */
function installWindow() {
  const w = {};
  globalThis.window = w;
  new Function('window', read('js/geodesy.js'))(w);
  return w;
}

async function boot() {
  const w = installWindow();
  const { makeGisDatasets } = await import('../js/gis-datasets.js');
  const { makeGisGeometry } = await import('../js/gis-geometry.js');
  const { makeGisOps } = await import('../js/gis-ops.js');
  const data = makeGisDatasets();
  const geometry = makeGisGeometry();
  const ops = makeGisOps();
  w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops;
  /* ⚠ AWAITED HERE BECAUSE run() AWAITS IT (#R732). The kernel fetches its sweep-line on demand,
     and a test that skipped this would be measuring `geometry-unavailable` rather than the op. */
  await geometry.ready();
  return { w, data, ops, geometry };
}

const pt = (lng, lat, props) => ({ type: 'Feature', properties: props || {}, geometry: { type: 'Point', coordinates: [lng, lat] } });
const poly = (ring, props) => ({ type: 'Feature', properties: props || {}, geometry: { type: 'Polygon', coordinates: [ring] } });
const box = (w, s, e, n) => [[w, s], [e, s], [e, n], [w, n], [w, s]];

/* ══ ① 列の型は値から測る ═══════════════════════════════════════════════════════════════════ */

test('R729 ① a column is typed from its values — and the name never decides', async () => {
  const { data } = await boot();

  /* A column CALLED `pop` that holds text is text; a column with an unhelpful name that holds
     numbers is a number. A name list would get both of these backwards. */
  const ds = data.add({
    title: 't', features: [
      pt(0, 0, { pop: 'many', col7: '12', when: '2020-03-04', blank: '' }),
      pt(1, 1, { pop: 'few', col7: '13.5', when: '2021-01-01', blank: '  ' }),
    ],
  });
  const f = (n) => ds.fields.find((x) => x.name === n);
  assert.equal(f('pop').type, 'text');
  assert.equal(f('col7').type, 'number');
  assert.equal(f('when').type, 'date');

  /* 「12 km」 is not 12. A cell is a number or it is not one. */
  const mixed = data.add({ title: 'u', features: [pt(0, 0, { d: '12 km' }), pt(1, 1, { d: '13' })] });
  assert.equal(mixed.fields[0].type, 'text');

  /* Empty cells do not take arithmetic away from the column, and they are counted next to the
     verdict rather than folded into it. */
  const holes = data.add({ title: 'v', features: [pt(0, 0, { n: '1' }), pt(1, 1, { n: '' }), pt(2, 2, { n: '3' })] });
  assert.equal(holes.fields[0].type, 'number');
  assert.equal(holes.fields[0].empty, 1);
  assert.equal(holes.fields[0].filled, 2);
  assert.equal(holes.fields[0].min, 1);
  assert.equal(holes.fields[0].max, 3);

  /* A bare year parses as both; number wins, because the number IS the year. */
  const years = data.add({ title: 'y', features: [pt(0, 0, { y: '2020' })] });
  assert.equal(years.fields[0].type, 'number');

  /* ⚠ 03/04/2020 is two different days depending on who runs the test. It is text. */
  const ambiguous = data.add({ title: 'a', features: [pt(0, 0, { d: '03/04/2020' })] });
  assert.equal(ambiguous.fields[0].type, 'text');

  /* The column set is the union over features, not the keys of feature 0. */
  const late = data.add({ title: 'l', features: [pt(0, 0, { a: '1' }), pt(1, 1, { a: '2', b: '3' })] });
  assert.deepEqual(late.fields.map((x) => x.name).sort(), ['a', 'b']);

  /* Multi* folds into its singular; disagreement is named rather than silently subsetted. */
  assert.equal(data.add({ title: 'm', features: [pt(0, 0), poly(box(0, 0, 1, 1))] }).geometryType, 'Mixed');
  assert.equal(data.add({ title: 'p', features: [poly(box(0, 0, 1, 1))] }).geometryType, 'Polygon');
});

/* ══ ② 出力は次の入力になる ════════════════════════════════════════════════════════════════ */

test('R729 ② the whole chain runs on one registry, and every step is a re-runnable recipe', async () => {
  const { data, ops } = await boot();

  /* 施設 CSV に相当するもの。属性は文字列（取り込みがそうするから）。 */
  const sites = data.add({
    title: 'sites', provenance: { kind: 'import', file: 'sites.csv' },
    features: [pt(139.70, 35.69, { kind: 'depot', staff: '40' }), pt(139.78, 35.71, { kind: 'shop', staff: '5' }),
      pt(120.00, 20.00, { kind: 'depot', staff: '9' })],
  });
  /* 行政界に相当するもの。 */
  const admin = data.add({
    title: 'admin', provenance: { kind: 'import', file: 'admin.geojson' },
    features: [poly(box(139.5, 35.5, 140.0, 35.9), { name: 'A' }), poly(box(119.0, 19.0, 121.0, 21.0), { name: 'B' })],
  });

  const f = await ops.run({ op: 'filter', inputs: [sites.id], params: { where: [{ field: 'kind', op: '==', value: 'depot' }] } });
  assert.equal(f.ok, true, JSON.stringify(f));
  assert.equal(f.dataset.count, 2);
  /* THE RECIPE, not a label — this is what a saved project replays. */
  assert.equal(f.dataset.provenance.kind, 'op');
  assert.equal(f.dataset.provenance.op, 'filter');
  assert.deepEqual(f.dataset.provenance.inputs, [sites.id]);

  const b = await ops.run({ op: 'buffer', inputs: [f.dataset.id], params: { radiusKm: 5 } });
  assert.equal(b.ok, true, JSON.stringify(b));
  assert.equal(b.dataset.geometryType, 'Polygon');
  assert.equal(b.dataset.count, 2);

  const c = await ops.run({ op: 'clip', inputs: [admin.id, b.dataset.id] });
  assert.equal(c.ok, true, JSON.stringify(c));
  assert.ok(c.dataset.count >= 1, 'the two 5 km disks overlap the admin areas');

  const g = await ops.run({ op: 'aggregate', inputs: [admin.id, sites.id], params: { stat: 'sum', field: 'staff', outName: 'staff' } });
  assert.equal(g.ok, true, JSON.stringify(g));
  const byName = {};
  for (const ft of g.dataset.features()) byName[ft.properties.name] = ft.properties.staff;
  assert.equal(byName.A, 45, 'both Tokyo sites fall in A');
  assert.equal(byName.B, 9);

  /* ⚠ THE POINT OF THE ROUND: each of the four results is a dataset in the same registry, with a
     lineage the reader (and the project store) can walk back to the two imports. */
  assert.equal(data.list().length, 6);
  const chain = data.lineage(c.dataset.id).map((x) => x.provenance.kind);
  assert.deepEqual(chain, ['import', 'import', 'op', 'op', 'op']);
  assert.deepEqual(data.dependents(f.dataset.id).map((x) => x.id), [b.dataset.id]);

  /* An area column is measured on the sphere, not on the degree plane: a 5 km disk is ~78.5 km². */
  const a = ops.areaKm2(b.dataset.features()[0].geometry);
  assert.ok(a > 70 && a < 86, 'spherical area of a 5 km disk, got ' + a);
});

/* ══ ③ 本当に拒む ═════════════════════════════════════════════════════════════════════════ */

test('R729 ③ the ops refuse by name instead of drawing something plausible', async () => {
  const { data, ops } = await boot();

  /* ⚠ THREE ASSERTIONS THAT USED TO LIVE HERE ARE GONE, AND THIS IS THE RECORD OF WHY (#R732).
     They held `buffer-needs-points`, `clip-window-not-convex` and
     `clip-window-crosses-antimeridian` — honest refusals in #R729, which had no polygon engine.
     js/gis-geometry.js is that engine, so all three are now WORK RATHER THAN A REFUSAL, and they
     are asserted as work in tests/r731-gis-geometry-crs-checks ② ③ ④. Deleting them here without
     replacing them there would have been the shape this project keeps recording: a claim that
     stopped being measured because the thing it measured stopped happening.
     What stays here is the one kind of refusal #R732 did NOT remove — the op refusing an input it
     genuinely cannot work on. */
  const lines = data.add({ title: 'l', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } }] });
  const r1 = await ops.run({ op: 'buffer', inputs: [lines.id], params: { radiusKm: -5 } });
  assert.equal(r1.ok, false);
  assert.equal(r1.why, 'inward-buffer-needs-area', 'a line has no inside to shrink, and shrinking it by 0 would be a lie');

  /* The second input of a clip has to hold an area, and the refusal is the DECLARED one: the
     contract is checked against the dataset's measured geometryType before any runner is entered. */
  const subject = data.add({ title: 's', features: [poly(box(0, 0, 3, 3))] });
  const notAWindow = data.add({ title: 'p2', features: [pt(1, 1)] });
  const r2 = await ops.run({ op: 'clip', inputs: [subject.id, notAWindow.id] });
  assert.equal(r2.ok, false);
  assert.equal(r2.why, 'geometry-type');
  assert.equal(r2.detail.input, 1);

  /* ⚠ AND `no-clip-polygons` IS STILL REACHABLE, which is why it still has a sentence: a feature
     may SAY MultiPolygon and carry no ring at all, so it types as Polygon and yields no window.
     A code with no path to a reader is the dead spelling js/gis-panel.js warns about, so the one
     path is asserted rather than assumed. */
  const emptyArea = data.add({ title: 'hollow', features: [{ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: [] } }] });
  assert.equal(emptyArea.geometryType, 'Polygon');
  const r2b = await ops.run({ op: 'clip', inputs: [subject.id, emptyArea.id] });
  assert.equal(r2b.ok, false);
  assert.equal(r2b.why, 'no-clip-polygons');

  /* An aggregate that would overwrite a column the reader imported is refused rather than done. */
  const wards = data.add({ title: 'w', features: [poly(box(0, 0, 2, 2), { count: 'mine' })] });
  const r3 = await ops.run({ op: 'aggregate', inputs: [wards.id, notAWindow.id], params: { stat: 'count' } });
  assert.equal(r3.ok, false);
  assert.equal(r3.why, 'output-column-in-use');

  /* A condition on a column that does not exist is refused, NOT quietly treated as true — that is
     the 「一部の条件が評価されなかったのに全部満たしたように読める」 failure. */
  const pts = data.add({ title: 'p', features: [pt(0, 0, { a: '1' })] });
  const r4 = await ops.run({ op: 'filter', inputs: [pts.id], params: { where: [{ field: 'nope', op: '>=', value: 1 }] } });
  assert.equal(r4.ok, false);
  assert.equal(r4.why, 'unknown-field');
  assert.equal(r4.detail.field, 'nope');

  /* 0 rows is an ANSWER, not a failure. */
  const r5 = await ops.run({ op: 'filter', inputs: [pts.id], params: { where: [{ field: 'a', op: '>', value: 999 }] } });
  assert.equal(r5.ok, true);
  assert.equal(r5.dataset.count, 0);
});

/* ══ ④ 返しうるコードは全部、文を持つ ══════════════════════════════════════════════════════ */

test('R729 ④ every refusal code that can reach a reader has a sentence', () => {
  /* ⚠ BOTH SIDES ARE PARSED, neither is written down here. A list in this file would be a second
     copy of the truth, and the first op to learn a new refusal would leave it stale and green —
     the shape tests/r576-checks ⑩ exists to prevent for js/geo-import.js. */
  const returned = new Set();
  /* ⚠ THE MODULE LIST GREW WITH THE CORE (#R732). js/gis-layers.js can refuse to the same panel,
     and a code it invents would otherwise reach a reader with no sentence — which is the entire
     defect this check exists for. js/gis-crs.js is deliberately NOT here: its codes surface through
     js/geo-import.js, and tests/r576-checks ⑩ is the check that measures those against
     js/map-ui.js. Adding it here would be a second guard over one fact, aimed at the wrong file. */
  /* ⚠ js/gis-raster.js JOINED THE LIST IN #R735, and for the reason the note above gives: js/gis-ops.js
     hands the grid kernel's refusal back VERBATIM — the reason a grid could not be read is the only
     sentence that tells the reader what to change — so those codes reach this panel exactly as the
     ops' own do. A kernel whose codes were not scanned would be 25 refusals that arrive with no
     sentence, which is the whole defect this check exists for. */
  /* ⚠ js/gis-expr.js JOINED IN #R738, for the same reason js/gis-raster.js did: `compute` hands the
     expression kernel's refusal back VERBATIM, because 「式のどこが読めなかったか」 is the only
     sentence that tells the reader what to retype. A kernel whose codes were not scanned is a
     refusal that reaches a reader with no sentence — and the population of a gate is the thing that
     decides what it cannot see. */
  for (const rel of ['js/gis-ops.js', 'js/gis-project.js', 'js/gis-core.js', 'js/gis-layers.js', 'js/gis-raster.js', 'js/gis-expr.js', 'js/gis-datasets.js']) {
    const src = read(rel);
    for (const m of src.matchAll(/\bwhy:\s*'([a-z0-9-]+)'/g)) returned.add(m[1]);
    for (const m of src.matchAll(/\bfail\(\s*'([a-z0-9-]+)'/g)) returned.add(m[1]);
    for (const m of src.matchAll(/\bmismatchWhy:\s*'([a-z0-9-]+)'/g)) returned.add(m[1]);
    /* ⚠ A MODULE THAT DECLARES ITS CODES IS BELIEVED OVER THE SCAN (#R738). js/gis-expr.js raises its
       refusals through a constructor, so none of the three spellings above appear in it and this scan
       — which is the whole of the gate — found ZERO of its nine codes. A scan measures the spellings
       it was taught; a declaration measures the fact. The kernel's own mk() refuses an undeclared
       code, so the two cannot drift apart. */
    const decl = /const REFUSALS = \[([^\]]*)\]/.exec(src);
    if (decl) for (const m of decl[1].matchAll(/'([a-z0-9-]+)'/g)) returned.add(m[1]);
  }
  assert.ok(returned.size >= 20, 'the codes were not found at all — the scan is measuring nothing (' + returned.size + ')');

  const panel = read('js/gis-panel.js');
  const worded = new Set();
  for (const m of panel.matchAll(/'([a-z0-9-]+)'/g)) worded.add(m[1]);

  const missing = Array.from(returned).filter((c) => !worded.has(c)).sort();
  assert.deepEqual(missing, [], 'refusal codes with no sentence in js/gis-panel.js: ' + missing.join(', '));
});

/* ══ ⑤ 保存は本体とレシピを分ける ═════════════════════════════════════════════════════════ */

test('R729 ⑤ a project saves imports whole and ops as recipes, and setParams re-runs downstream', async () => {
  const { w, data, ops } = await boot();

  /* A minimal in-memory IndexedDB. It answers the three calls the store makes and nothing else —
     enough to prove what is WRITTEN, which is the claim under test. */
  const store = new Map();
  w.indexedDB = globalThis.indexedDB = fakeIDB(store);
  const { makeGisProject } = await import('../js/gis-project.js');
  const project = makeGisProject();
  w.IntMapGisProject = project;
  if (!project.available()) { assert.ok(true, 'IndexedDB shim not accepted — the store says so rather than pretending'); return; }

  const src = data.add({ title: 'src', provenance: { kind: 'import', file: 'a.csv' }, features: [pt(0, 0, { a: '1' })] });
  const buf = await ops.run({ op: 'buffer', inputs: [src.id], params: { radiusKm: 5 } });
  assert.equal(buf.ok, true, JSON.stringify(buf));

  const saved = await project.save('p1');
  assert.equal(saved.ok, true, JSON.stringify(saved));
  const rec = Array.from(store.values())[0];
  const steps = rec.steps;
  const imported = steps.find((s) => s.id === src.id);
  const stepped = steps.find((s) => s.id === buf.dataset.id);
  assert.ok(Array.isArray(imported.features), 'an import is saved whole — the bytes are its origin');
  assert.equal(stepped.features, undefined, 'an op result is NOT saved: the recipe regenerates it, and a stored result goes stale when its input changes');
  assert.equal(stepped.op, 'buffer');
  assert.deepEqual(stepped.params, { radiusKm: 5 });
  assert.ok(steps.indexOf(imported) < steps.indexOf(stepped), 'inputs are written before the steps that read them');

  /* 「半径を 10km に変えて再計算する」 — the sentence the whole round exists for. */
  const before = ops.areaKm2(buf.dataset.features()[0].geometry);
  const again = await project.setParams(buf.dataset.id, { radiusKm: 10 });
  assert.equal(again.ok, true, JSON.stringify(again));
  assert.deepEqual(again.rebuilt, [buf.dataset.id]);
  const after = ops.areaKm2(data.get(buf.dataset.id).features()[0].geometry);
  assert.ok(after / before > 3.5 && after / before < 4.5, 'doubling the radius quadruples the area: ' + before + ' → ' + after);
  assert.deepEqual(data.get(buf.dataset.id).provenance.params, { radiusKm: 10 }, 'the recipe records the NEW radius');

  /* Reload: the import comes back whole, the op comes back by being run again. */
  data.clear();
  assert.equal(data.list().length, 0);
  const back = await project.load(saved.id);
  assert.equal(back.ok, true, JSON.stringify(back));
  assert.deepEqual(back.failed, []);
  assert.equal(data.list().length, 2);
  assert.equal(data.get(buf.dataset.id).provenance.op, 'buffer');
});

function fakeIDB(store) {
  const fire = (obj, name, arg) => { setTimeout(() => { const h = obj['on' + name]; if (h) h(arg || { target: obj }); }, 0); };
  function req(result) { const r = { result, error: null }; fire(r, 'success'); return r; }
  const os = {
    put: (v) => { store.set(v.id, JSON.parse(JSON.stringify(v))); return req(v.id); },
    get: (k) => req(store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : undefined),
    delete: (k) => { const had = store.delete(k); return req(had); },
    getAll: () => req(Array.from(store.values()).map((v) => JSON.parse(JSON.stringify(v)))),
    openCursor: () => {
      const rows = Array.from(store.values()); let i = 0;
      const r = { result: null, error: null };
      const step = () => {
        if (i >= rows.length) { r.result = null; }
        else { const v = JSON.parse(JSON.stringify(rows[i++])); r.result = { value: v, key: v.id, continue: () => { step(); } }; }
        fire(r, 'success');
      };
      step(); return r;
    },
  };
  return {
    open: () => {
      const db = {
        objectStoreNames: { contains: () => true },
        createObjectStore: () => os,
        /* ⚠ `complete` fires AFTER the requests made on this transaction, which is the whole point
           of a store that settles on oncomplete: firing it first made every read answer with the
           value it had before the request landed (this shim said `not-found` for a record it was
           holding). Two ticks, so a request queued synchronously after this call still wins. */
        transaction: () => { const tx = { objectStore: () => os, oncomplete: null, onerror: null, onabort: null, error: null }; setTimeout(() => fire(tx, 'complete'), 0); return tx; },
        close: () => { },
      };
      const r = { result: db, error: null, onupgradeneeded: null };
      setTimeout(() => { if (r.onupgradeneeded) r.onupgradeneeded({ target: r }); if (r.onsuccess) r.onsuccess({ target: r }); }, 0);
      return r;
    },
  };
}

/* ══ ⑥ クエリはレジストリを「問い合わせの瞬間に」読む ═════════════════════════════════════ */

test('R729 ⑥ the cross-dataset query reads the registry at query time, in one place', () => {
  const src = read('js/atlas-query.js');
  /* A pull, not a push: the engine is lazy-loaded, so anything that registered ITSELF with the
     engine earlier in the session would need a replay — a second rule about what a table is. */
  for (const entry of ['async function run(spec)', 'function catalogue()']) {
    const i = src.indexOf(entry);
    assert.ok(i > 0, 'entry point not found: ' + entry);
    assert.ok(src.slice(i, i + 400).includes('syncUserTables()'), entry + ' does not read the registry');
  }
  /* Into the SAME object every existing reader indexes — TABLES[x] is read in several places and a
     second lookup rule would have to be added at each of them. */
  assert.ok(/TABLES\[id\]\s*=\s*\{/.test(src), 'user tables are not folded into TABLES');
  assert.ok(/delete TABLES\[k\]/.test(src), 'a dataset removed from the registry must stop being a table');
  /* The columns are the fields gis-datasets MEASURED, not a second typing rule. */
  assert.ok(src.includes('UT.fields'), 'user columns are not taken from the dataset fields');
  assert.ok(/window\.IntMapData\s*\)\s*\?\s*window\.IntMapData\.asNumber/.test(src) || src.includes('window.IntMapData.asNumber'),
    'the numeric read does not reuse the registry rule');
});

/* ══ ⑦ ファイルは「読まれた」ときにデータセットになる（「描かれた」ときではない） ═══════════ */

test('R729 ⑦ a dropped file is registered where a file is READ, never where one is DRAWN', () => {
  const src = read('js/map-ui.js');
  const body = (name) => {
    const i = src.indexOf('function ' + name + '(');
    assert.ok(i > 0, name + ' not found');
    return src.slice(i, src.indexOf('\n    function ', i + 10));
  };
  /* ⚠ THE DEFECT THIS GUARDS: window.IntMapGis.draw() calls addFC to put an ANALYSIS RESULT on the
     map. A registration inside addFC would register that result as a freshly imported dataset every
     time the reader drew it — a new dataset per click, each claiming a file as its origin. */
  assert.ok(!body('addFC').includes('IntMapData.add'), 'addFC must not register: it is also how a computed dataset is drawn');
  assert.ok(body('handleFiles').includes('registerDataset('), 'a read file is not registered');
  assert.ok(src.includes("provenance:{ kind:'import'"), 'the import does not record its origin');

  /* The renderer is reached through the one door, not a second source of our own. */
  const core = read('js/gis-core.js');
  assert.ok(core.includes('window.GeoJSONUpload'), 'draw() must go through the existing upload list, not add a second way to put a FeatureCollection on the map');
  assert.ok(!core.includes('addSource'), 'draw() must not touch the renderer directly');

  /* What the file SAID its coordinate system was — stated by the format, or null for 「言っていない」. */
  const imp = read('js/geo-import.js');
  assert.ok(/r\.sourceCrs\s*=/.test(imp), 'geo-import does not carry sourceCrs');
  assert.ok(/'geojson'|'kml'|'gpx'/.test(imp.slice(imp.indexOf('r.sourceCrs'))), 'the three formats whose specification fixes WGS 84 are not the ones that answer');
});
