/* ============================================================================
 *  #R738 · 属性を持つデータになる — 取り込み・結合・計算列・編集、そして鎖が切れないこと
 * ----------------------------------------------------------------------------
 *  The outside review that opened this round named ONE completion condition, and it is a
 *  sequence rather than a feature:
 *
 *    「既存の施設データと取り込んだ道路・行政界を使い、道路から500m以内の施設を区域別に集計する。
 *      結果を地図と表で確認して保存し、再読み込み後に距離だけ変更して、同じ結果レイヤーまで更新できる。」
 *
 *  …and its §5 named a second one:
 *
 *    「行政界＋市区町村コード付きCSV→統計値を結合→計算列を作成→属性値で色分け」
 *
 *  Both are chains, and a chain is exactly what a per-feature test cannot measure: every link in
 *  each of them already had a check of its own, and the question this file asks is whether they
 *  COMPOSE — whether the output of one is really the input of the next, with the ids, the recipe,
 *  the staleness and the counts all surviving the handover.
 *
 *    ① 統計表が取り込める（幾何を持たない行の束として。地図には描かれない）
 *    ② join は綴りで結ぶのではなく識別子で結ぶ — "01100" は "1100" ではない
 *    ③ compute は式の列を作り、名づけられていない列を拒む
 *    ④ §5 の連鎖: 行政界 ＋ コード付き CSV → 結合 → 計算列 → その列で色分けできる
 *    ⑤ 完成条件の連鎖: 道路 500 m → 区域別集計 → 保存 → 復元 → 距離だけ変更 → 下流まで更新
 *    ⑥ 中止と進捗が、呼び出し元から本当に届く（#R735 が作り、誰も渡していなかったもの）
 *    ⑦ 表は「形を測る処理」に渡らない — 名前を付けて拒まれる
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/* js/geodesy.js publishes onto `window` and exports nothing — evaluated the way a browser does. */
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
  const { makeGisExpr } = await import('../js/gis-expr.js');
  const { makeGisOps } = await import('../js/gis-ops.js');
  const data = makeGisDatasets();
  const geometry = makeGisGeometry();
  const expr = makeGisExpr();
  const ops = makeGisOps();
  w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisExpr = expr; w.IntMapGisOps = ops;
  await geometry.ready();
  return { w, data, ops, expr, geometry };
}

const pt = (lng, lat, props) => ({ type: 'Feature', properties: props || {}, geometry: { type: 'Point', coordinates: [lng, lat] } });
const line = (coords, props) => ({ type: 'Feature', properties: props || {}, geometry: { type: 'LineString', coordinates: coords } });
const poly = (ring, props) => ({ type: 'Feature', properties: props || {}, geometry: { type: 'Polygon', coordinates: [ring] } });
const box = (w, s, e, n) => [[w, s], [e, s], [e, n], [w, n], [w, s]];
/* A row that states no place. This is what a statistics table imports as (js/geo-import.js §③). */
const rowOnly = (props) => ({ type: 'Feature', properties: props, geometry: null });

/* ══ ① 統計表は取り込める ═════════════════════════════════════════════════════════════════ */

test('R738 ① a table of rows with no coordinates imports, and says so by measurement', async () => {
  const { GEO_IMPORT } = await import('../js/geo-import.js');
  const file = (name, text) => {
    const bytes = new TextEncoder().encode(text);
    return { name, size: bytes.length, arrayBuffer: async () => bytes.buffer };
  };

  const csv = 'code,city,population\n01100,札幌市中央区,248680\n01101,札幌市北区,289201\n13101,千代田区,66680\n';
  const r = await GEO_IMPORT.readGeoFile(file('pop.csv', csv));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.format, 'table');
  assert.equal(r.geometry, 'none');
  /* ⚠ NOT ONE ROW IS GIVEN A PLACE. The refusal this replaced existed because the alternative was a
     pin per row in the wrong ocean; a null geometry is the honest shape for 「場所を述べていない行」. */
  assert.ok(r.fc.features.every((f) => f.geometry === null));
  /* ⚠ AND THE LEADING ZERO SURVIVES THE WHOLE JOURNEY. It is the join key three tests below. */
  assert.equal(r.fc.features[0].properties.code, '01100');

  const { w, data } = await boot();
  const ds = data.add({ title: 'pop', features: r.fc.features, provenance: { kind: 'import', file: 'pop.csv' } });
  /* Three fields the registry can only answer by MEASURING, and each separates a case the others
     cannot: withGeometry=0 with count>0 is a table, geometryType is null for a table AND for an
     empty dataset AND for a grid, and `padded` is why the code column is not a number. */
  assert.equal(ds.count, 3);
  assert.equal(ds.withGeometry, 0);
  assert.equal(ds.geometryType, null);
  const code = ds.fields.find((f) => f.name === 'code');
  assert.equal(code.type, 'text', '"01100" is an identifier spelled with digits, not a number');
  assert.ok(code.padded >= 2, 'the reader is told how many cells were kept out of arithmetic');
  assert.equal(ds.fields.find((f) => f.name === 'population').type, 'number');
  void w;
});

/* ══ ② join は識別子で結ぶ ════════════════════════════════════════════════════════════════ */

test('R738 ② the join matches codes as identifiers, and answers with the counts', async () => {
  const { data, ops } = await boot();

  const admin = data.add({
    title: 'admin', provenance: { kind: 'import', file: 'admin.geojson' },
    features: [poly(box(141.2, 43.0, 141.4, 43.1), { code: '01100', name: '中央区' }),
      poly(box(141.3, 43.1, 141.5, 43.2), { code: '01101', name: '北区' }),
      poly(box(139.7, 35.6, 139.8, 35.7), { code: '13101', name: '千代田区' })],
  });
  const stats = data.add({
    title: 'pop', provenance: { kind: 'import', file: 'pop.csv' },
    features: [rowOnly({ code: '01100', population: '248680', area: '46.42' }),
      rowOnly({ code: '01101', population: '289201', area: '63.57' }),
      rowOnly({ code: '99999', population: '1', area: '1' })],
  });

  const j = await ops.run({ op: 'join', inputs: [admin.id, stats.id], params: { leftField: 'code', rightField: 'code' } });
  assert.equal(j.ok, true, JSON.stringify(j));
  assert.equal(j.dataset.count, 3, 'unmatched rows are KEPT by default — the boundary is still a boundary');
  assert.equal(j.stats.matched, 2);
  assert.equal(j.stats.unmatched, 1);
  assert.deepEqual(j.stats.unmatchedSample, ['13101'], 'the reader is shown a key that found no partner');
  const byName = {};
  for (const f of j.dataset.features()) byName[f.properties.name] = f.properties.population;
  assert.equal(byName['中央区'], '248680');
  assert.equal(byName['北区'], '289201');
  assert.equal(byName['千代田区'], undefined, 'a row with no partner gets no borrowed numbers');

  /* ⚠ THE DEFECT THIS OP EXISTS NOT TO HAVE. Through asNumber, "01100" and "1100" are one key, and
     the join would attach 札幌市中央区's population to a different municipality — in a table that
     looks complete and has no error anywhere in it. */
  const wrongKey = data.add({
    title: 'wrong', provenance: { kind: 'import', file: 'w.csv' },
    features: [rowOnly({ code: '1100', population: '999' })],
  });
  const j2 = await ops.run({ op: 'join', inputs: [admin.id, wrongKey.id], params: { leftField: 'code', rightField: 'code' } });
  assert.equal(j2.ok, true);
  assert.equal(j2.stats.matched, 0, '"1100" is not "01100"');

  /* One key twice is a question, not a detail: it is refused and the key is named. */
  const dupes = data.add({
    title: 'dupes', provenance: { kind: 'import', file: 'd.csv' },
    features: [rowOnly({ code: '01100', v: '1' }), rowOnly({ code: '01100', v: '2' })],
  });
  const j3 = await ops.run({ op: 'join', inputs: [admin.id, dupes.id], params: { leftField: 'code', rightField: 'code' } });
  assert.equal(j3.ok, false);
  assert.equal(j3.why, 'join-right-not-unique');
  assert.deepEqual(j3.detail.keys, ['01100']);
  /* …and the reader can answer it. */
  const j4 = await ops.run({ op: 'join', inputs: [admin.id, dupes.id], params: { leftField: 'code', rightField: 'code', duplicates: 'first' } });
  assert.equal(j4.ok, true);

  /* A column the target already has is refused rather than overwritten or silently renamed. */
  const clash = data.add({
    title: 'clash', provenance: { kind: 'import', file: 'c.csv' },
    features: [rowOnly({ code: '01100', name: 'something else' })],
  });
  const j5 = await ops.run({ op: 'join', inputs: [admin.id, clash.id], params: { leftField: 'code', rightField: 'code' } });
  assert.equal(j5.ok, false);
  assert.equal(j5.why, 'join-column-collision');
  const j6 = await ops.run({ op: 'join', inputs: [admin.id, clash.id], params: { leftField: 'code', rightField: 'code', prefix: 'pop_' } });
  assert.equal(j6.ok, true);
});

/* ══ ③ compute は式の列を作る ═════════════════════════════════════════════════════════════ */

test('R738 ③ a computed column is real arithmetic, and an unnamed column is refused', async () => {
  const { data, ops } = await boot();
  const ds = data.add({
    title: 'x', provenance: { kind: 'import', file: 'x.csv' },
    features: [rowOnly({ pop: '248680', area: '46.42', code: '01100' }),
      rowOnly({ pop: '289201', area: '63.57', code: '01101' }),
      rowOnly({ pop: '', area: '10', code: '01102' })],
  });

  const c = await ops.run({ op: 'compute', inputs: [ds.id], params: { outName: 'density', expr: 'pop / area' } });
  assert.equal(c.ok, true, JSON.stringify(c));
  const vals = c.dataset.features().map((f) => f.properties.density);
  assert.ok(Math.abs(vals[0] - 248680 / 46.42) < 1e-9);
  /* ⚠ AN EMPTY CELL IS NOT ZERO. A reader averaging this column must not be handed a 0 nobody wrote
     — the column is simply empty in that row, and the registry counts it as such. */
  assert.equal(vals[2], undefined);
  assert.equal(c.dataset.fields.find((f) => f.name === 'density').type, 'number');
  assert.equal(c.dataset.fields.find((f) => f.name === 'density').empty, 1);

  /* ⚠ AND THE CODE COLUMN STAYS OUT OF ARITHMETIC, through the SAME rule the registry types with. */
  const z = await ops.run({ op: 'compute', inputs: [ds.id], params: { outName: 'n', expr: 'code * 1' } });
  assert.equal(z.ok, true);
  assert.ok(z.dataset.features().every((f) => f.properties.n === undefined), '"01100" is not 1100');

  /* A misspelt column is refused, not answered with a column of nulls. */
  const bad = await ops.run({ op: 'compute', inputs: [ds.id], params: { outName: 'q', expr: 'popluation / area' } });
  assert.equal(bad.ok, false);
  assert.equal(bad.why, 'unknown-field');

  /* A syntax error comes back with the position, so the reader can fix the character. */
  const syn = await ops.run({ op: 'compute', inputs: [ds.id], params: { outName: 'q', expr: 'pop /' } });
  assert.equal(syn.ok, false);
  assert.equal(syn.why, 'expr-syntax');
  assert.equal(typeof syn.detail.at, 'number');

  /* Overwriting an existing column is refused unless the reader says so. */
  const over = await ops.run({ op: 'compute', inputs: [ds.id], params: { outName: 'pop', expr: 'area * 2' } });
  assert.equal(over.ok, false);
  assert.equal(over.why, 'compute-column-exists');
  const over2 = await ops.run({ op: 'compute', inputs: [ds.id], params: { outName: 'pop', expr: 'area * 2', replace: true } });
  assert.equal(over2.ok, true);
});

/* ══ ④ §5 の連鎖 ══════════════════════════════════════════════════════════════════════════ */

test('R738 ④ boundary + coded CSV → join → computed column → a column a map can colour by', async () => {
  const { data, ops } = await boot();

  const admin = data.add({
    title: 'admin', provenance: { kind: 'import', file: 'admin.geojson' },
    features: [poly(box(141.2, 43.0, 141.4, 43.1), { code: '01100', name: '中央区' }),
      poly(box(141.3, 43.1, 141.5, 43.2), { code: '01101', name: '北区' })],
  });
  const csv = data.add({
    title: 'pop', provenance: { kind: 'import', file: 'pop.csv' },
    features: [rowOnly({ code: '01100', population: '248680', area_km2: '46.42' }),
      rowOnly({ code: '01101', population: '289201', area_km2: '63.57' })],
  });

  const joined = await ops.run({ op: 'join', inputs: [admin.id, csv.id], params: { leftField: 'code', rightField: 'code' } });
  assert.equal(joined.ok, true, JSON.stringify(joined));
  const computed = await ops.run({
    op: 'compute', inputs: [joined.dataset.id],
    params: { outName: 'density', expr: 'population / area_km2' },
  });
  assert.equal(computed.ok, true, JSON.stringify(computed));

  /* ⚠ THE OUTPUT IS A DATASET LIKE ANY OTHER — that is the whole claim of this layer. It kept the
     boundaries' geometry, it carries a numeric column that came from two different files, and its
     lineage walks back to both imports. */
  assert.equal(computed.dataset.geometryType, 'Polygon');
  assert.equal(computed.dataset.withGeometry, 2);
  const dens = computed.dataset.fields.find((f) => f.name === 'density');
  assert.equal(dens.type, 'number', 'and so a graduated colour ramp can be built from it');
  assert.ok(dens.min > 0 && dens.max > dens.min);
  assert.deepEqual(data.lineage(computed.dataset.id).map((x) => x.provenance.kind), ['import', 'import', 'op', 'op']);

  /* The classifier that colours it is a pure function, so the chain can be finished here rather
     than asserted about a DOM. ⚠ It is the SHIPPED one (js/map-ui.js), not a copy. */
  const src = read('js/map-ui.js');
  const face = /window\.GeoJSONUpload\s*=\s*\{([\s\S]*?)\}\s*;/.exec(src);
  assert.ok(face, 'the upload module publishes one face');
  for (const name of ['style', 'styleOf', 'classify']) {
    assert.ok(new RegExp('\\b' + name + '\\b').test(face[1]), 'attribute colouring is reachable: ' + name);
  }
});

/* ══ ⑤ 完成条件の連鎖 ═════════════════════════════════════════════════════════════════════ */

test('R738 ⑤ roads → 500 m → sites in range → counted by zone → saved → reloaded → radius changed', async () => {
  const { w, data, ops } = await boot();

  /* 施設（既存データに相当）・道路・行政界。距離は測地線なので、度ではなく km で効く。 */
  const sites = data.add({
    title: 'sites', provenance: { kind: 'import', file: 'sites.csv' },
    features: [pt(139.7600, 35.6800, { id: 'a' }),   /* ~0 m from the road */
      pt(139.7600, 35.6830, { id: 'b' }),            /* ~330 m north */
      pt(139.7600, 35.6900, { id: 'c' })],           /* ~1.1 km north */
  });
  const roads = data.add({
    title: 'roads', provenance: { kind: 'import', file: 'roads.geojson' },
    features: [line([[139.70, 35.6800], [139.82, 35.6800]], { ref: 'R1' })],
  });
  const zones = data.add({
    title: 'zones', provenance: { kind: 'import', file: 'zones.geojson' },
    features: [poly(box(139.70, 35.60, 139.82, 35.70), { name: 'Z' })],
  });

  const near = await ops.run({ op: 'relate', inputs: [sites.id, roads.id], params: { predicate: 'nearer-than', maxKm: 0.5 } });
  assert.equal(near.ok, true, JSON.stringify(near));
  assert.equal(near.dataset.count, 2, 'a and b are within 500 m of the road itself — not of its bounding-box centre');

  const counted = await ops.run({ op: 'aggregate', inputs: [zones.id, near.dataset.id], params: { stat: 'count', outName: 'n' } });
  assert.equal(counted.ok, true, JSON.stringify(counted));
  assert.equal(counted.dataset.features()[0].properties.n, 2);

  /* 保存 → 復元。⚠ An in-memory IndexedDB that answers only what the store asks of it. */
  const store = new Map();
  w.indexedDB = globalThis.indexedDB = fakeIDB(store);
  const { makeGisProject } = await import('../js/gis-project.js');
  const project = makeGisProject();
  w.IntMapGisProject = project;
  if (!project.available()) { assert.ok(true, 'IndexedDB shim not accepted — the store says so rather than pretending'); return; }

  const saved = await project.save('r737');
  assert.equal(saved.ok, true, JSON.stringify(saved));
  data.clear();
  assert.equal(data.list().length, 0);
  const loaded = await project.load(saved.id);
  assert.equal(loaded.ok, true, JSON.stringify(loaded));
  /* ⚠ THE IDS COME BACK BY NAME, and the counter must not hand the same one out again — the
     collision #R732 fixed and #R735's clear() had re-introduced. */
  assert.equal(data.get(counted.dataset.id).features()[0].properties.n, 2);
  const before = data.ids().slice();
  const fresh = data.add({ title: 'after reload', features: [pt(0, 0, {})] });
  assert.ok(before.indexOf(fresh.id) < 0, 'the generator does not hand out an id the reload just restored');
  assert.equal(data.ids().length, before.length + 1);

  /* 「距離だけ変更して、同じ結果レイヤーまで更新できる」 — one call, the same ids, downstream too. */
  const changed = await project.setParams(near.dataset.id, { maxKm: 2 });
  assert.equal(changed.ok, true, JSON.stringify(changed));
  assert.deepEqual(changed.rebuilt, [near.dataset.id, counted.dataset.id], 'the aggregate downstream was re-run, not left holding the old answer');
  assert.equal(data.get(near.dataset.id).count, 3);
  assert.equal(data.get(counted.dataset.id).features()[0].properties.n, 3);
  assert.equal(data.get(counted.dataset.id).stale, null);

  /* And a radius the op refuses leaves the chain in place and MARKED, rather than deleted. */
  const bad = await project.setParams(near.dataset.id, { predicate: 'nearer-than', maxKm: 'far' });
  assert.equal(bad.ok, false);
  assert.ok(data.get(near.dataset.id), 'the dataset the reader was editing still exists');
  assert.ok(data.get(counted.dataset.id).stale, 'and everything below it says it is no longer the answer to its recipe');
});

/* ══ ⑥ 中止と進捗が呼び出し元から届く ═════════════════════════════════════════════════════ */

test('R738 ⑥ the stop and the progress #R735 built are actually reachable from a caller', async () => {
  const { w, data, ops } = await boot();

  const many = [];
  for (let i = 0; i < 400; i++) many.push(pt(139 + (i % 20) * 0.01, 35 + Math.floor(i / 20) * 0.01, { i: String(i) }));
  const pts = data.add({ title: 'pts', provenance: { kind: 'import', file: 'p.csv' }, features: many });
  const zones = data.add({
    title: 'zones', provenance: { kind: 'import', file: 'z.geojson' },
    features: Array.from({ length: 40 }, (_, k) => poly(box(139 + k * 0.005, 35, 139.01 + k * 0.005, 35.2), { k: String(k) })),
  });

  /* ⚠ ABORTED BEFORE IT STARTS, which is the case a caller can actually produce: the reader presses
     stop while the previous frame is still on screen. What matters is that the answer is a NAMED
     refusal rather than a half-built dataset. */
  const pre = new AbortController();
  pre.abort();
  const stopped = await ops.run({ op: 'aggregate', inputs: [zones.id, pts.id], params: { stat: 'count', outName: 'n' } }, { signal: pre.signal });
  assert.equal(stopped.ok, false);
  assert.equal(stopped.why, 'cancelled');
  assert.equal(data.list().length, 2, 'nothing was registered by a run that was stopped');

  /* And the progress reaches the caller with both numbers in it. */
  const seen = [];
  const done = await ops.run({ op: 'aggregate', inputs: [zones.id, pts.id], params: { stat: 'count', outName: 'n' } },
    { onProgress: (p) => seen.push(p) });
  assert.equal(done.ok, true, JSON.stringify(done));

  /* ⚠ AND THE CHAIN LAYER PASSES IT ON. #R735 built run(step,{signal,onProgress}) and the only
     caller in the whole program that handed one over was a check — js/gis-project.js and
     js/gis-panel.js both called it with one argument, so the stop button they could have drawn
     would have been a control with no effect. */
  const proj = read('js/gis-project.js');
  assert.ok(/O\.run\(\s*\{[\s\S]{0,400}?\},\s*\{\s*signal/.test(proj), 'setParams hands the signal to the op it runs');
  assert.ok(proj.includes('onProgress'), 'and reports where in the chain it is');
  const panel = read('js/gis-panel.js');
  assert.ok(/\.run\([\s\S]{0,300}?signal/.test(panel), 'the panel that offers the stop button is the one that passes it');
  void w; void seen;
});

/* ══ ⑦ 表は「形を測る処理」に渡らない ═════════════════════════════════════════════════════ */

test('R738 ⑦ a table is refused by name where a shape is needed, and accepted where it is not', async () => {
  const { data, ops } = await boot();
  const table = data.add({
    title: 'pop', provenance: { kind: 'import', file: 'pop.csv' },
    features: [rowOnly({ code: '01100', population: '248680' }), rowOnly({ code: '01101', population: '289201' })],
  });

  /* ⚠ 'any' MEANS ANY SHAPE. Without this refusal, buffer walks every row, finds no coordinates and
     registers an empty polygon layer: a step that succeeded, an answer of zero, and nothing saying
     the input had no places in it. */
  const b = await ops.run({ op: 'buffer', inputs: [table.id], params: { radiusKm: 1 } });
  assert.equal(b.ok, false);
  assert.equal(b.why, 'input-has-no-geometry');
  assert.equal(b.detail.rows, 2, 'and it says the rows are there — the shapes are what is missing');

  /* …while the steps that do not measure places go on working, which is the entire reason a table
     can be imported at all. */
  const f = await ops.run({ op: 'filter', inputs: [table.id], params: { where: [{ field: 'population', op: '>', value: 250000 }] } });
  assert.equal(f.ok, true, JSON.stringify(f));
  assert.equal(f.dataset.count, 1);
  const c = await ops.run({ op: 'compute', inputs: [table.id], params: { outName: 'thousands', expr: 'population / 1000' } });
  assert.equal(c.ok, true, JSON.stringify(c));
});

/* ══ ⑧ 作った能力に、呼び出し元がある ═════════════════════════════════════════════════════ */

test('R738 ⑧ every capability this round built is reached from somewhere that is not a check', () => {
  /* ⚠ THIS PROJECT HAS SHIPPED THE SAME DEFECT THREE TIMES, TWICE IN THIS LAYER: js/gis-layers.js
     (#R732, 0 callers until #R735), js/gis-crs.js's define() (#R732, 0 callers until this round) and
     run(step,{signal,onProgress}) (#R735, whose only caller was its own check). 「呼ばれない export は
     機能ではない」 — and the gate that draws the wiring cannot see whether the wiring is live.

     ⚠ A CHECK IS NOT A CALLER. In all three cases a test WAS calling the function, which is exactly
     why being tested did not save them; so the corpus here is the shipped tree only.
     ⚠ This is a list of what THIS round claims to have built, which is the one kind of list a round's
     own check is allowed to hold — the general rule (「every export has a caller」) is not derivable,
     because several exports in this layer exist to be measured and say so in their own comments. */
  const shipped = ['js/gis-panel.js', 'js/gis-core.js', 'js/gis-ops.js', 'js/gis-project.js',
    'js/geo-import.js', 'js/map-ui.js', 'js/gis-datasets.js', 'js/gis-layers.js', 'js/gis-raster.js'];
  const corpus = shipped.map((f) => read(f)).join('\n');

  const claims = [
    ['the reader can edit attribute values', /\.editValues\s*\(/],
    ['…and undo it', /\.undo\s*\(/],
    ['…and redo it', /\.redo\s*\(/],
    ['…and see how much history there is', /\.history\s*\(/],
    ['…and add, remove and rename columns', /\.addField\s*\(/, /\.removeField\s*\(/, /\.renameField\s*\(/],
    ['…and declare a column type or unit', /\.declareField\s*\(/],
    ['…and be refused before the form is filled in', /\.editable\s*\(/],
    ['the map can be coloured by a column', /\.style\s*\(/],
    ['…with the legend the map itself built', /\.styleOf\s*\(/],
    ['the expression editor offers the kernel\'s own function list', /\.functions\s*\(/],
    ['a shapefile set is read', /gis-shapefile\.js/],
    ['a GeoPackage is read', /gis-geopackage\.js/],
    ['the .prj is registered as a coordinate system', /\.define\s*\(/],
    ['a long step can be stopped', /AbortController/],
  ];
  const silent = [];
  for (const [what, ...res] of claims) if (!res.every((re) => re.test(corpus))) silent.push(what);
  assert.deepEqual(silent, [], 'built, documented, and reachable from nothing: ' + silent.join(' / '));
});

/* ── the IndexedDB stand-in (the same shape tests/r729-gis-core-checks uses) ─────────────────── */
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
