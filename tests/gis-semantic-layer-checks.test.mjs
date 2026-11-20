/* ============================================================================
 *  gis-semantic-layer — 「この列は何を意味し、何と比べてよいか」を機械が読み、演算の前に警告する
 * ----------------------------------------------------------------------------
 *  ① 述べていない facet は `unstated` のままで、推測で埋められない
 *  ② 述べた facet は stated、記録・レシピから読めるものは derived（buffer の半径・格子の大きさ・系譜の基準）
 *  ③ Maddison 型の誤り: 現在の国境で数えた列を、過去の期間の形へ結ぶと `present-day-basis-on-historical-shapes`
 *  ④ 結合キーが別の識別子なら `join-key-kinds-differ`、有効期間が重ならなければ `time-periods-disjoint`
 *  ⑤ 集計: 量が禁じる集計（密度の合計）・宣言された規則との矛盾を、実行前に述べる
 *  ⑥ 宣言の形が間違っていれば名前つきで拒否し、半端に適用しない
 *  ⑦ 警告は結果を変えない（op の出力は check の有無で同じ）。strict は呼び手が選ぶ拒否
 *  ⚠ 期待値は本ファイルに手で書いた年・列から導いた。モジュールの補助関数には訊かない。
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installWindow } from './helpers/geo-shared.mjs';

async function boot() {
  const w = installWindow();
  const { makeGisDatasets } = await import('../js/gis-datasets.js');
  const { makeGisGeometry } = await import('../js/gis-geometry.js');
  const { makeGisUnits } = await import('../js/gis-units.js');
  const { makeGisOps } = await import('../js/gis-ops.js');
  const { makeGisSemantics } = await import('../js/gis-semantics.js');
  const { makeDataGovernance } = await import('../js/data-governance.js');
  const data = makeGisDatasets(), geometry = makeGisGeometry(), ops = makeGisOps(), sem = makeGisSemantics();
  w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops; w.IntMapGisUnits = makeGisUnits();
  w.IntMapDataGovernance = makeDataGovernance(); w.IntMapGisSemantics = sem;
  await geometry.ready();
  return { data, ops, sem };
}
const ring = (W, S, E, N) => [[W, S], [E, S], [E, N], [W, N], [W, S]];
const box = (W, S, E, N, p) => ({ type: 'Feature', properties: p || {}, geometry: { type: 'Polygon', coordinates: [ring(W, S, E, N)] } });
const day = (y, m, d) => { const t = new Date(0); t.setUTCFullYear(y, m - 1, d); t.setUTCHours(0, 0, 0, 0); return t.getTime(); };
const span = (a, b) => ({ kind: 'constant', start: a, end: b });
const codes = (r) => r.warnings.map((x) => x.code);

test('① nothing stated → every facet is unstated, never guessed', async () => {
  const B = await boot();
  const a = B.data.add({ title: 'a', features: [box(0, 0, 1, 1, { v: 3 })] });
  const d = B.sem.describe(a.id);
  assert.equal(d.ok, true);
  assert.equal(d.basis.state, 'unstated');
  assert.equal(d.time.valid.state, 'unstated');
  assert.equal(d.time.observed.state, 'unstated');
  assert.equal(d.scope.state, 'unstated');
  assert.ok(d.unstated.includes('basis') && d.unstated.includes('scope') && d.unstated.includes('time.observed'));
});

test('② stated vs derived: declared scope/basis, radius from the buffer recipe, basis through the lineage', async () => {
  const B = await boot();
  const pts = B.data.add({ title: 'p', features: [{ type: 'Feature', properties: { n: 1 }, geometry: { type: 'Point', coordinates: [1, 1] } }] });
  assert.equal(B.sem.describe(pts.id).scope.state, 'derived');           /* a Point layer: derived from the geometry */
  assert.equal(B.sem.describe(pts.id).scope.value.kind, 'point');
  const decl = B.sem.declare(pts.id, { basis: 'present-day', scope: { kind: 'facility' }, timeMeaning: { observed: '2020' } });
  assert.equal(decl.ok, true);
  const d = B.sem.describe(pts.id);
  assert.equal(d.scope.state, 'stated'); assert.equal(d.scope.value.kind, 'facility');
  assert.equal(d.basis.state, 'stated'); assert.equal(d.basis.value, 'present-day');
  assert.equal(d.time.observed.value, '2020'); assert.equal(d.time.published.state, 'unstated');
  const r = await B.ops.run({ op: 'buffer', inputs: [pts.id], params: { radiusKm: 5 } });
  assert.equal(r.ok, true, r.why);
  const out = B.sem.describe(r.dataset.id);
  assert.equal(out.scope.state, 'derived'); assert.equal(out.scope.value.kind, 'radius');
  assert.equal(out.scope.value.detail.radiusKm, 5);
  assert.equal(out.basis.state, 'derived'); assert.equal(out.basis.value, 'present-day'); /* carried through the recipe */
  assert.deepEqual(out.lineage, [pts.id]);
});

test('③ the Maddison case: a present-day-border series joined onto the borders of 1914', async () => {
  const B = await boot();
  const series = B.data.add({ title: 'pop', features: [{ type: 'Feature', properties: { iso3: 'DEU', pop: 67 }, geometry: null }] });
  B.sem.declare(series.id, { basis: 'present-day', columns: { iso3: { keyKind: 'country-code' }, pop: { definition: 'population counted inside present-day borders', timeMeaning: { target: '1913' } } } });
  const shapes = B.data.add({ title: 'borders1914', features: [box(0, 0, 4, 4, { iso3: 'DEU' })], time: span(day(1914, 7, 1), day(1914, 7, 2)) });
  B.sem.declare(shapes.id, { basis: 'as-of-time', columns: { iso3: { keyKind: 'country-code' } } });
  const r = B.sem.check({ op: 'join', inputs: [shapes.id, series.id], params: { leftField: 'iso3', rightField: 'iso3' } });
  assert.equal(r.ok, true);
  assert.ok(codes(r).includes('present-day-basis-on-historical-shapes'), codes(r).join());
  assert.ok(codes(r).includes('basis-differs'));
  assert.ok(r.caution >= 1);
  /* the same join with the shapes ALSO declared present-day is not warned about */
  B.sem.declare(shapes.id, { basis: 'present-day', columns: { iso3: { keyKind: 'country-code' } } });
  assert.ok(!codes(B.sem.check({ op: 'join', inputs: [shapes.id, series.id], params: { leftField: 'iso3', rightField: 'iso3' } })).includes('present-day-basis-on-historical-shapes'));
});

test('④ join keys of different kinds, and periods that do not overlap', async () => {
  const B = await boot();
  const a = B.data.add({ title: 'a', features: [box(0, 0, 1, 1, { k: 'X1' })], time: span(day(1900, 1, 1), day(1910, 1, 1)) });
  const b = B.data.add({ title: 'b', features: [box(0, 0, 1, 1, { k: 'X1' })], time: span(day(1950, 1, 1), day(1960, 1, 1)) });
  B.sem.declare(a.id, { columns: { k: { keyKind: 'facility-id' } } });
  B.sem.declare(b.id, { columns: { k: { keyKind: 'company-id' } } });
  const r = B.sem.check({ op: 'join', inputs: [a.id, b.id], params: { leftField: 'k', rightField: 'k' } });
  assert.ok(codes(r).includes('join-key-kinds-differ'));
  assert.ok(codes(r).includes('time-periods-disjoint'));
  /* overlapping periods and equal key kinds: silent */
  const c = B.data.add({ title: 'c', features: [box(0, 0, 1, 1, { k: 'X1' })], time: span(day(1905, 1, 1), day(1920, 1, 1)) });
  B.sem.declare(c.id, { columns: { k: { keyKind: 'facility-id' } } });
  const ok = B.sem.check({ op: 'join', inputs: [a.id, c.id], params: { leftField: 'k', rightField: 'k' } });
  assert.deepEqual(codes(ok), []);
});

test('⑤ aggregation: the quantity forbids summing a density; a declared rule is honoured', async () => {
  const B = await boot();
  const zones = B.data.add({ title: 'z', features: [box(0, 0, 4, 4, { z: 1 })] });
  const cells = B.data.add({ title: 'c', features: [box(1, 1, 2, 2, { dens: 10, tot: 5 })] });
  const col = (id, name, spec) => { const g = B.data.declareField(id, name, spec); assert.equal(g.ok, true, g.why); };
  col(cells.id, 'dens', { unit: 'people/km2', quantity: { kind: 'density', unit: 'people/km2' } });
  const r = B.sem.check({ op: 'aggregate', inputs: [zones.id, cells.id], params: { stat: 'sum', field: 'dens' } });
  assert.ok(codes(r).includes('aggregation-refused'), codes(r).join());
  B.sem.declare(cells.id, { columns: { tot: { aggregation: 'sum' } } });
  const bad = B.sem.check({ op: 'aggregate', inputs: [zones.id, cells.id], params: { stat: 'mean', field: 'tot' } });
  assert.ok(codes(bad).includes('aggregation-contradicts-declared-rule'));
  const fine = B.sem.check({ op: 'aggregate', inputs: [zones.id, cells.id], params: { stat: 'sum', field: 'tot' } });
  assert.deepEqual(codes(fine), []);
  const blind = B.data.add({ title: 'b', features: [box(1, 1, 2, 2, { mystery: 4 })] });
  assert.ok(codes(B.sem.check({ op: 'aggregate', inputs: [zones.id, blind.id], params: { stat: 'sum', field: 'mystery' } })).includes('aggregation-rule-unstated'));
});

test('⑥ a malformed declaration is refused by name and applied to nothing', async () => {
  const B = await boot();
  const a = B.data.add({ title: 'a', features: [box(0, 0, 1, 1, { v: 1 })] });
  assert.equal(B.sem.declare(a.id, { bogus: 1 }).why, 'semantics-field-unknown');
  assert.equal(B.sem.declare(a.id, { basis: 'yesterday' }).why, 'semantics-basis-unknown');
  assert.equal(B.sem.declare(a.id, { columns: { nope: { keyKind: 'iso' } } }).why, 'unknown-field');
  assert.equal(B.sem.declare(a.id, { columns: { v: { keyKind: 'zip' } } }).why, 'semantics-key-kind-unknown');
  assert.equal(B.sem.declare(a.id, { timeMeaning: { sometime: '2020' } }).why, 'semantics-time-meaning-unknown');
  assert.equal(B.sem.declare('ds-none', { basis: 'present-day' }).why, 'dataset-missing');
  assert.equal(B.sem.describe(a.id).basis.state, 'unstated');           /* nothing leaked in */
  /* a loader's own statement is read from provenance.semantics */
  const p = B.data.add({ title: 'p', features: [box(0, 0, 1, 1, { v: 1 })], provenance: { kind: 'import', semantics: { basis: 'present-day' } } });
  assert.equal(B.sem.describe(p.id).basis.value, 'present-day');
});

test('⑦ comparable(): same quantity vs different basis; warnings never change an op\'s result', async () => {
  const B = await boot();
  const a = B.data.add({ title: 'a', features: [box(0, 0, 1, 1, { pop: 5 })] });
  const b = B.data.add({ title: 'b', features: [box(0, 0, 1, 1, { pop: 6 })] });
  for (const d of [a, b]) assert.equal(B.data.declareField(d.id, 'pop', { quantity: { kind: 'count', space: 'total', unit: 'people' } }).ok, true);
  B.sem.declare(a.id, { basis: 'present-day' });
  B.sem.declare(b.id, { basis: 'as-of-time' });
  const c = B.sem.comparable({ dataset: a.id, field: 'pop' }, { dataset: b.id, field: 'pop' });
  assert.equal(c.ok, true);
  assert.equal(c.quantity.verdict, 'comparable');
  assert.equal(c.comparable, false);
  assert.ok(codes(c).includes('basis-differs'));
  assert.equal(B.sem.comparable({ dataset: a.id, field: 'zz' }, { dataset: b.id, field: 'pop' }).why, 'unknown-field');
  /* the op's output is the same with and without the layer reading the inputs */
  const before = await B.ops.run({ op: 'union', inputs: [a.id, b.id] });
  B.sem.check({ op: 'union', inputs: [a.id, b.id] });
  const after = await B.ops.run({ op: 'union', inputs: [a.id, b.id] });
  assert.equal(before.ok, true); assert.equal(after.ok, true);
  assert.equal(before.dataset.count, after.dataset.count);
});

test('⑧ the module has no table of sources and is wired once (core mounts it, the kernel ledger excuses it)', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../js/gis-semantics.js', import.meta.url), 'utf8');
  const { codeOnly } = await import('../scripts/code-only.mjs');
  assert.ok(!/maddison|cshapes|worldpop|openstreetmap/i.test(codeOnly(src, { lang: 'js' })), 'a named source in code');
  const core = fs.readFileSync(new URL('../js/gis-core.js', import.meta.url), 'utf8');
  assert.ok(/makeGisSemantics\(\)/.test(core) && /\['IntMapGisSemantics', semantics\]/.test(core));
  const { NOT_A_KERNEL } = await import('../scripts/gis-kernel-versions.mjs');
  assert.ok(NOT_A_KERNEL['js/gis-semantics.js']);
});

test('⑨ through the Atlas door: describe, check-only, strict refusal, and warnings riding on a real run', async () => {
  const B = await boot();
  const w = globalThis.window || globalThis;
  w.IntMapSafe = w.IntMapSafe || { html: (s) => String(s) };
  const { makeGisAtlas } = await import('../js/gis-atlas.js');
  const atlas = makeGisAtlas({ data: B.data, ops: B.ops, layers: { list: () => [] }, semantics: B.sem, draw: () => ({ ok: true }) });
  const a = B.data.add({ title: 'a', features: [box(0, 0, 4, 4, { k: 'X' })], time: span(day(1900, 1, 1), day(1905, 1, 1)) });
  const b = B.data.add({ title: 'b', features: [box(1, 1, 2, 2, { k: 'X' })], time: span(day(1950, 1, 1), day(1955, 1, 1)) });
  /* no op + semantics:true → the description, nothing run */
  const d = await atlas.run({ inputs: [a.id], semantics: true });
  assert.equal(d.ok, true); assert.equal(d.semantics[0].id, a.id);
  /* op + semantics:true → the check only */
  const n = B.data.list ? B.data.list().length : null;
  const chk = await atlas.run({ op: 'join', inputs: [a.id, b.id], params: { leftField: 'k', rightField: 'k' }, semantics: true });
  assert.equal(chk.ok, true); assert.equal(chk.dryRun, true);
  assert.ok(chk.semantic.warnings.some((x) => x.code === 'time-periods-disjoint'));
  if (n != null) assert.equal(B.data.list().length, n, 'a check must not register a dataset');
  /* strict refuses on a caution; the same step without it runs and carries the warning */
  const strict = await atlas.run({ op: 'join', inputs: [a.id, b.id], params: { leftField: 'k', rightField: 'k' }, strict: true });
  assert.equal(strict.ok, false); assert.equal(strict.why, 'semantic-mismatch');
  const ran = await atlas.run({ op: 'join', inputs: [a.id, b.id], params: { leftField: 'k', rightField: 'k', duplicates: 'first' } });
  assert.equal(ran.ok, true, ran.why);
  assert.ok(ran.semantic.warnings.some((x) => x.code === 'time-periods-disjoint'));
  assert.ok(ran.html.includes('atlas-gis-semantic'));
});
