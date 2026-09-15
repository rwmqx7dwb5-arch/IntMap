/* ============================================================================
 *  #R738 · 幾何を持たない行の束・列の宣言・属性の編集と取り消し
 * ----------------------------------------------------------------------------
 *  docs/GIS-CORE.md §6 said two things were missing, and they are the same thing twice: the values
 *  that arrived were READ-ONLY, and a body of rows with no coordinates could not be registered at
 *  all. What this round claims, and therefore what has to stay true:
 *
 *    ① a table with no geometry is a dataset — `withGeometry` is 0, the columns are measured, and
 *      `count` is the number of ROWS (`geometryType` alone cannot say this: it is null for a table,
 *      null for an empty record, and null for a grid)
 *    ② a file where some rows have coordinates and some do not states the mixture, and does not
 *      silently become the claim of whichever side is bigger
 *    ③ a declared type is VERIFIED against the data, with the count and an example in the refusal —
 *      and a zero-padded code column cannot be declared a number, because that rule lives in
 *      asNumber and is asked, not restated
 *    ④ a unit carries WHO SAID IT: `reader` when it was declared here, `source` when it came with a
 *      grid's band. Nothing can verify a unit, so the author is the only honest thing to hold
 *    ⑤ an edit re-measures the record — a text column of digits becomes a number column, and a
 *      number column that receives a word LOSES the reader's declaration and says so
 *    ⑥ undo steps back one VALUE at a time, and the history holds inverse operations: twenty edits
 *      on four hundred features cost less than one copy of the features — MEASURED, not asserted
 *    ⑦ the three records that cannot be edited are refused by name: an op's output (its provenance
 *      is a recipe js/gis-project.js re-runs), a grid, and a stale record
 *    ⑧ a column something downstream was made from is not deleted out from under it
 *    ⑨ an edit reaches the subscribers, so the panel and the map can redraw what changed
 *
 *  ⚠ ⑥ COMPARES AGAINST A NUMBER DERIVED FROM THE DATA (the serialised size of the features), not
 *  against a size this file once saw. A recorded constant passes for whatever the code prints
 *  tomorrow; «smaller than one snapshot» is the claim, and it is what is measured.
 *  ⚠ ③ AND ⑤ ARE THE SAME RULE IN TWO DIRECTIONS: a declaration is refused when the data does not
 *  bear it out, and withdrawn when an edit stops it bearing it out. A field that says `number`
 *  because somebody once said so is the defect .agents/rules/historical-verification.md names.
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/* Same boot as tests/r735-gis-raster-time-checks: js/geodesy.js publishes onto `window` at top level
   and exports nothing, so it is evaluated the way a browser evaluates it. */
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
  await geometry.ready();
  return { w, data, ops };
}

const feat = (g, p) => ({ type: 'Feature', properties: p || {}, geometry: g });
const pt = (lng, lat, p) => feat({ type: 'Point', coordinates: [lng, lat] }, p);
/* A row of a statistical table: everything a feature is except a shape. ⚠ `geometry:null` is legal
   GeoJSON (RFC 7946 §3.2) and it is what a CSV with no coordinate columns produces. */
const row = (p) => feat(null, p);

/* ══ ① 幾何を持たない行の束が、データセットとして登録できる ═══════════════════════════════ */

test('R738 ① a body of rows with no geometry registers, and says so by measurement', async () => {
  const { data } = await boot();

  const ds = data.add({
    title: '市区町村別人口',
    provenance: { kind: 'import', file: 'pop.csv' },
    features: [
      row({ cd: '01100', name: '札幌市中央区', pop: '248680' }),
      row({ cd: '01101', name: '札幌市北区', pop: '289323' }),
      row({ cd: '13101', name: '千代田区', pop: '66680' }),
    ],
  });

  assert.equal(ds.kind, 'vector', 'a third payload was invented for rows that are still rows');
  assert.equal(ds.count, 3, 'count is the number of rows');
  assert.equal(ds.withGeometry, 0, 'the record does not state that none of its rows carry a shape');
  assert.equal(ds.geometryType, null);

  /* ⚠ THE FIELDS ARE MEASURED THE SAME WAY THEY ARE FOR A MAP FILE — which is the whole reason this
     is not a separate payload: the code column stays text (its zeros are notation), the population
     column can be compared. */
  const by = Object.fromEntries(ds.fields.map((f) => [f.name, f]));
  assert.equal(by.cd.type, 'text');
  /* Two of the three codes carry a leading zero; 13101 does not, and the evidence counts cells, not
     columns — which is how a reader learns why a column of numerals cannot be summed. */
  assert.equal(by.cd.padded, 2);
  assert.equal(by.pop.type, 'number');
  assert.equal(by.pop.min, 66680);

  /* ⚠ AND `geometryType` CANNOT BE ASKED THIS QUESTION: it answers null for all three of these. */
  const empty = data.add({ title: 'empty', features: [] });
  assert.equal(empty.geometryType, null);
  assert.equal(empty.withGeometry, 0);
  assert.equal(empty.count, 0, 'an empty record and a table are told apart by count, not by geometryType');

  const grid = data.add({
    kind: 'raster', title: 'g', width: 2, height: 2,
    grid: { west: 0, north: 2, pixelLng: 1, pixelLat: 1 },
    bands: [{ name: 'v' }], read: () => Float64Array.from([1, 2, 3, 4]),
  });
  assert.equal(grid.geometryType, null);
  /* ⚠ NOT 0. `count` on a grid is PIXELS, so «0 of them carry geometry» would read exactly like the
     table above — the one record this field exists to name. */
  assert.equal(grid.withGeometry, null, 'a grid answered a question about features');

  /* The record is describable and saveable like any other: describe() is what the panel lists and
     what js/gis-project.js writes, and the new field has to be in it. */
  assert.equal(data.describe(ds.id).withGeometry, 0);
});

/* ══ ② 混ざっているときは、混ざっていると述べる ═══════════════════════════════════════════ */

test('R738 ② a file where only some rows have coordinates states the mixture', async () => {
  const { data } = await boot();

  const ds = data.add({
    title: 'mixed',
    features: [pt(139.7, 35.7, { name: 'a' }), row({ name: 'b' }), row({ name: 'c' })],
  });

  assert.equal(ds.count, 3);
  assert.equal(ds.withGeometry, 1, 'the rows with no shape were counted as having one, or vice versa');
  /* ⚠ 'Mixed' IS A DIFFERENT CLAIM — «two KINDS of shape are present» — and answering it here would
     refuse this file from every op that needs points, for a reason that is not true. */
  assert.equal(ds.geometryType, 'Point', 'a row with no geometry voted on the geometry type');

  const lines = data.add({
    title: 'really mixed',
    features: [pt(0, 0, {}), feat({ type: 'LineString', coordinates: [[0, 0], [1, 1]] }, {})],
  });
  assert.equal(lines.geometryType, 'Mixed', 'two kinds of shape stopped being Mixed');
  assert.equal(lines.withGeometry, 2);
});

/* ══ ③ 宣言された型は実データに対して検証される ═════════════════════════════════════════ */

test('R738 ③ a declared type is verified against the data, with the evidence in the refusal', async () => {
  const { data } = await boot();

  const ds = data.add({
    title: 'codes', provenance: { kind: 'import', file: 'a.csv' },
    features: [row({ cd: '01100', n: '5', note: 'あ' }), row({ cd: '01101', n: '6', note: '' }), row({ cd: '01102', n: '7', note: 'う' })],
  });

  /* ⚠ THE PADDED CODE COLUMN CANNOT BE DECLARED A NUMBER. The rule is asNumber's, asked here rather
     than spelt again — a second spelling would drift from the one that decides, and the reader would
     get a column that compares one way in the panel and another in js/gis-ops.js. */
  const bad = data.declareField(ds.id, 'cd', { type: 'number' });
  assert.equal(bad.ok, false);
  assert.equal(bad.why, 'field-type-refused');
  assert.equal(bad.detail.bad, 3, 'the number of cells that are not of that type was not reported');
  assert.equal(bad.detail.checked, 3);
  assert.equal(bad.detail.example, '01100', 'the reader was refused without being shown one of the cells');
  assert.equal(ds.fields.find((f) => f.name === 'cd').typeStated, undefined, 'a refused declaration was recorded anyway');

  /* Empty cells do not decide a type and do not refuse a declaration either. */
  const words = data.declareField(ds.id, 'note', { type: 'number' });
  assert.equal(words.why, 'field-type-refused');
  assert.equal(words.detail.checked, 2, 'the empty cell was counted as a cell that is not a number');

  /* ⚠ `text` ALWAYS HOLDS — every value can be spelt as a string, so refusing it would be refusing a
     claim that cannot be wrong. This is the declaration that matters: a code column WITHOUT leading
     zeros measures as a number and only the reader knows it is an identifier. */
  const ok = data.declareField(ds.id, 'n', { type: 'text' });
  assert.equal(ok.ok, true);
  assert.equal(ok.field.type, 'number', 'the MEASURED verdict was overwritten by the declaration');
  assert.equal(ok.field.typeStated, 'text');
  assert.equal(ok.field.typeStatedBy, 'reader');

  assert.equal(data.declareField(ds.id, 'cd', { type: 'colour' }).why, 'field-type-unknown');
  assert.equal(data.declareField(ds.id, 'nope', { type: 'text' }).why, 'unknown-field');
  assert.equal(data.declareField(ds.id, 'cd', {}).why, 'nothing-declared');
});

/* ══ ④ 単位は検証できないので、誰が述べたかを持つ ═══════════════════════════════════════ */

test('R738 ④ a unit carries its author, and a band\'s author is not the reader', async () => {
  const { data } = await boot();

  const ds = data.add({ title: 'd', features: [row({ len: '4.2' }), row({ len: '9.1' })] });
  const r = data.declareField(ds.id, 'len', { unit: 'km' });
  assert.equal(r.ok, true);
  assert.equal(r.field.unit, 'km');
  /* ⚠ NOTHING HERE MEASURED THAT THE COLUMN IS IN KILOMETRES, and nothing could. What is recorded is
     that the reader said so. */
  assert.equal(r.field.unitStated, 'reader');
  assert.equal(r.field.type, 'number', 'declaring a unit changed the measured type');

  const grid = data.add({
    kind: 'raster', title: 'dem', width: 1, height: 1,
    grid: { west: 0, north: 1, pixelLng: 1, pixelLat: 1 },
    bands: [{ name: 'elev', unit: 'm' }, { name: 'flags' }],
    read: () => Float64Array.from([0]),
  });
  const bands = Object.fromEntries(grid.fields.map((f) => [f.name, f]));
  assert.equal(bands.elev.unit, 'm');
  /* The grid's unit arrived WITH the grid. One `unit` field with no author would let a panel present
     a reader's guess as the source's statement. */
  assert.equal(bands.elev.unitStated, 'source');
  assert.equal(bands.flags.unit, null);
  assert.equal(bands.flags.unitStated, null, 'a band with no unit claimed an author for one');

  assert.equal(data.declareField(grid.id, 'elev', { unit: 'ft' }).why, 'edit-needs-features');
  assert.equal(data.declareField(ds.id, 'len', { unit: { v: 'km' } }).why, 'unit-not-a-string');
});

/* ══ ⑤ 編集すると測り直され、成り立たなくなった宣言は外れる ═════════════════════════════ */

test('R738 ⑤ editing re-measures the columns, and withdraws a declaration the data no longer bears out', async () => {
  const { data } = await boot();

  const ds = data.add({
    title: 'd', provenance: { kind: 'import', file: 'a.csv' },
    features: [row({ v: 'いち', n: '1' }), row({ v: 'に', n: '2' })],
  });
  assert.equal(ds.fields.find((f) => f.name === 'v').type, 'text');

  const e = data.editValues(ds.id, [{ index: 0, field: 'v', value: '1' }, { index: 1, field: 'v', value: '2' }]);
  assert.equal(e.ok, true);
  assert.equal(e.changed, 2);
  const v = ds.fields.find((f) => f.name === 'v');
  assert.equal(v.type, 'number', 'the column was not typed again after the values changed');
  assert.equal(v.min, 1);
  assert.equal(v.max, 2);
  /* The features the map and the save file read are the ones that changed — there is one array. */
  assert.equal(data.get(ds.id).features()[0].properties.v, '1');

  /* ⚠ THE DECLARATION IS WITHDRAWN, NOT KEPT. A field that says `number` because somebody once said
     so, over a cell holding 「abc」, is the claim-with-no-author this repository has paid for before. */
  assert.equal(data.declareField(ds.id, 'n', { type: 'number' }).ok, true);
  assert.equal(ds.fields.find((f) => f.name === 'n').typeStated, 'number');
  data.editValues(ds.id, [{ index: 1, field: 'n', value: 'abc' }]);
  const n = ds.fields.find((f) => f.name === 'n');
  assert.equal(n.type, 'text', 'the measured type did not follow the edit');
  assert.equal(n.typeStated, undefined, 'the reader\'s declaration survived an edit that contradicts it');
  assert.equal(n.typeRefused.type, 'number');
  assert.equal(n.typeRefused.example, 'abc');
  /* And the refusal does not evaporate on the NEXT edit, when `fields` is rebuilt again. */
  data.editValues(ds.id, [{ index: 0, field: 'v', value: '7' }]);
  assert.equal(ds.fields.find((f) => f.name === 'n').typeRefused.type, 'number');

  /* Nothing is created silently: an unknown column and an index off the end are refused by name. */
  assert.equal(data.editValues(ds.id, [{ index: 0, field: 'zzz', value: '1' }]).why, 'unknown-field');
  assert.equal(data.editValues(ds.id, [{ index: 9, field: 'v', value: '1' }]).why, 'index-out-of-range');
  assert.equal(data.editValues(ds.id, []).why, 'no-edits');
  /* ⚠ AND A BATCH IS ALL OR NOTHING: the good edit in front of the bad one did not land. */
  const before = data.get(ds.id).features()[0].properties.v;
  assert.equal(data.editValues(ds.id, [{ index: 0, field: 'v', value: 'X' }, { index: 99, field: 'v', value: 'Y' }]).why, 'index-out-of-range');
  assert.equal(data.get(ds.id).features()[0].properties.v, before, 'half of a refused batch was applied');

  /* Columns come and go by name, and an added one exists on every row. */
  assert.equal(data.addField(ds.id, 'note', 'x').ok, true);
  assert.equal(data.get(ds.id).features()[1].properties.note, 'x');
  assert.equal(data.addField(ds.id, 'note').why, 'field-exists');
  assert.equal(data.renameField(ds.id, 'note', 'memo').ok, true);
  assert.equal(ds.fields.some((f) => f.name === 'memo'), true);
  assert.equal(data.removeField(ds.id, 'memo').removed, 2);
  assert.equal(ds.fields.some((f) => f.name === 'memo'), false);
});

/* ══ ⑥ 取り消しは値ごとで、履歴は逆操作しか持たない ═════════════════════════════════════ */

test('R738 ⑥ undo steps back one value at a time, and the history is inverse operations, not snapshots', async () => {
  const { data } = await boot();

  const N = 400;
  const feats = [];
  for (let i = 0; i < N; i++) feats.push(row({ id: 'r' + i, v: String(i), pad: 'x'.repeat(40) }));
  const ds = data.add({ title: 'big', provenance: { kind: 'import', file: 'big.csv' }, features: feats });

  const EDITS = 20;
  for (let i = 0; i < EDITS; i++) {
    const r = data.editValues(ds.id, [{ index: i, field: 'v', value: 'e' + i }]);
    assert.equal(r.ok, true);
  }

  const h = data.history(ds.id);
  assert.equal(h.undo, EDITS);
  assert.equal(h.redo, 0);
  assert.equal(h.entries.length, EDITS);
  /* ⚠ ONE INVERSE CELL PER EDITED CELL — not one copy of the dataset per edit. */
  assert.equal(h.entries.reduce((s, e) => s + e.cells, 0), EDITS, 'the history is holding more than the cells that changed');

  /* ⚠ MEASURED AGAINST THE DATA, not against a number written here. One snapshot of the features is
     the smallest thing a snapshotting history could hold for a single edit; twenty of them would be
     twenty times this. */
  const oneSnapshot = JSON.stringify(data.get(ds.id).features()).length;
  assert.ok(h.bytes != null && h.bytes > 0, 'the history did not report what it holds');
  assert.ok(h.bytes < oneSnapshot / 20,
    'the undo history is the size of a snapshot (' + h.bytes + ' vs one copy ' + oneSnapshot + ')');

  /* Stepping back is one value at a time, in reverse order. */
  for (let i = EDITS - 1; i >= 0; i--) {
    const u = data.undo(ds.id);
    assert.equal(u.ok, true);
    assert.equal(u.applied, 'values');
    assert.equal(data.get(ds.id).features()[i].properties.v, String(i), 'undo did not restore the previous value');
    if (i > 0) assert.equal(data.get(ds.id).features()[i - 1].properties.v, 'e' + (i - 1), 'undo stepped back more than one edit');
  }
  assert.equal(data.undo(ds.id).why, 'nothing-to-undo');
  assert.equal(data.history(ds.id).redo, EDITS);

  for (let i = 0; i < EDITS; i++) assert.equal(data.redo(ds.id).ok, true);
  assert.equal(data.get(ds.id).features()[0].properties.v, 'e0');
  assert.equal(data.redo(ds.id).why, 'nothing-to-redo');

  /* A column that did not exist goes back to not existing — undo does not leave a null the reader
     never typed. */
  const small = data.add({ title: 's', features: [row({ a: '1' })] });
  data.addField(small.id, 'b', 'z');
  assert.equal(data.get(small.id).features()[0].properties.b, 'z');
  data.undo(small.id);
  assert.equal(Object.prototype.hasOwnProperty.call(data.get(small.id).features()[0].properties, 'b'), false,
    'undoing an added column left the column behind');
  assert.equal(small.fields.some((f) => f.name === 'b'), false);
  data.redo(small.id);
  assert.equal(data.get(small.id).features()[0].properties.b, 'z');

  /* Removing a column and undoing it restores only the cells that were there. */
  const sparse = data.add({ title: 'sp', features: [row({ a: '1', b: '2' }), row({ a: '3' })] });
  assert.equal(data.removeField(sparse.id, 'b').removed, 1);
  data.undo(sparse.id);
  assert.equal(data.get(sparse.id).features()[0].properties.b, '2');
  assert.equal(Object.prototype.hasOwnProperty.call(data.get(sparse.id).features()[1].properties, 'b'), false,
    'undoing a removed column invented a cell that never existed');
});

/* ══ ⑦ 編集できないものは、名前を付けて断る ═══════════════════════════════════════════════ */

test('R738 ⑦ an op output, a grid and a stale record are refused by name', async () => {
  const { data, ops } = await boot();

  const src = data.add({ title: 'src', provenance: { kind: 'import', file: 'a.csv' }, features: [pt(0, 0, { a: '1' })] });
  const buf = await ops.run({ op: 'buffer', inputs: [src.id], params: { radiusKm: 5 } });
  assert.equal(buf.ok, true, JSON.stringify(buf));

  /* ⚠ THE RECORD IS WHAT ITS RECIPE PRODUCES. Editing it would be erased by the next setParams and,
     until then, would make its own provenance false. */
  const r = data.editValues(buf.dataset.id, [{ index: 0, field: 'a', value: '2' }]);
  assert.equal(r.ok, false);
  assert.equal(r.why, 'edit-would-contradict-recipe');
  assert.equal(r.detail.op, 'buffer', 'the refusal does not say which recipe is in the way');
  assert.deepEqual(r.detail.inputs, [src.id], 'the refusal does not name what an editable copy would be made from');
  assert.equal(data.editable(buf.dataset.id).why, 'edit-would-contradict-recipe');
  assert.equal(data.addField(buf.dataset.id, 'x').why, 'edit-would-contradict-recipe');
  assert.equal(data.undo(buf.dataset.id).why, 'edit-would-contradict-recipe');

  const grid = data.add({
    kind: 'raster', title: 'g', width: 2, height: 1,
    grid: { west: 0, north: 1, pixelLng: 1, pixelLat: 1 },
    bands: [{ name: 'v' }], read: () => Float64Array.from([1, 2]),
  });
  assert.equal(data.editValues(grid.id, [{ index: 0, field: 'v', value: 3 }]).why, 'edit-needs-features');

  /* ⚠ SPELT THE WAY js/gis-ops.js SPELLS IT. Two spellings of one fact are two facts to the panel,
     and the second one reaches the reader with no sentence. */
  const old = data.add({ title: 'old', provenance: { kind: 'import', file: 'b.csv' }, features: [row({ a: '1' })] });
  data.invalidate(old.id, 'radius-refused');
  const s = data.editValues(old.id, [{ index: 0, field: 'a', value: '2' }]);
  assert.equal(s.why, 'input-stale');
  assert.equal(s.detail.why, 'radius-refused', 'the root reason was replaced by its own consequence');

  assert.equal(data.editable('nope').why, 'no-such-dataset');
  assert.equal(data.editable(src.id).ok, true);
});

/* ══ ⑧ 下流があるレコードの列は消さない ═══════════════════════════════════════════════════ */

test('R738 ⑧ a column something was made from is not deleted out from under it, and an edit marks the downstream stale', async () => {
  const { data, ops } = await boot();

  const src = data.add({
    title: 'src', provenance: { kind: 'import', file: 'a.csv' },
    features: [pt(0, 0, { a: '1' }), pt(1, 1, { a: '2' })],
  });
  const buf = await ops.run({ op: 'buffer', inputs: [src.id], params: { radiusKm: 5 } });
  assert.equal(buf.ok, true, JSON.stringify(buf));

  const rm = data.removeField(src.id, 'a');
  assert.equal(rm.ok, false);
  assert.equal(rm.why, 'field-has-dependents');
  assert.deepEqual(rm.detail.dependents, [buf.dataset.id], 'the reader is not told what is in the way');
  assert.equal(data.renameField(src.id, 'a', 'b').why, 'field-has-dependents');
  assert.equal(src.fields.some((f) => f.name === 'a'), true, 'the column was removed despite the refusal');

  /* ⚠ AND A VALUE THAT CHANGES MAKES WHAT WAS MADE FROM IT NO LONGER THE ANSWER TO ITS OWN RECIPE.
     That is exactly what `stale` is for (§4.1), and js/gis-ops.js then refuses it as an input — a
     downstream record left looking current would be the defect #R732 measured. */
  assert.equal(data.stale(buf.dataset.id), null);
  assert.equal(data.editValues(src.id, [{ index: 0, field: 'a', value: '9' }]).ok, true);
  const st = data.stale(buf.dataset.id);
  assert.ok(st && st.why === 'input-edited', 'the buffer still claims to be the answer to values that changed');
  const again = await ops.run({ op: 'buffer', inputs: [buf.dataset.id], params: { radiusKm: 1 } });
  assert.equal(again.ok, false);
  assert.equal(again.why, 'input-stale', 'a stale record was consumed as an input');

  /* A column with no dependents is removable, and the time axis is not: a declaration naming a
     column that is gone would be a declaration about nothing. */
  const t = data.add({
    title: 't', provenance: { kind: 'import', file: 'c.csv' },
    features: [row({ y: '1889', label: 'a' }), row({ y: '1890', label: 'b' })],
    time: { kind: 'instant', field: 'y' },
  });
  assert.equal(t.time.kind, 'instant');
  assert.equal(data.removeField(t.id, 'y').why, 'field-in-time-axis');
  assert.equal(data.renameField(t.id, 'y', 'year').why, 'field-in-time-axis');
  assert.equal(data.removeField(t.id, 'label').ok, true);

  /* ⚠ AND AN EDIT RE-VERIFIES THE AXIS. A year column edited into something no engine parses is no
     longer a time axis, and saying it still is would be the shape §1.5 exists to prevent. */
  assert.equal(data.editValues(t.id, [{ index: 0, field: 'y', value: '明治22年' }, { index: 1, field: 'y', value: '明治23年' }]).ok, true);
  assert.equal(t.time, null, 'the time declaration outlived the cells it was verified against');
  assert.equal(t.timeRefused.why, 'time-unreadable');
});

/* ══ ⑨ 編集は購読者に届く ═══════════════════════════════════════════════════════════════ */

test('R738 ⑨ an edit reaches the subscribers', async () => {
  const { data } = await boot();

  const seen = [];
  const off = data.subscribe((what, rec) => seen.push([what, rec && rec.id]));
  const ds = data.add({ title: 'd', provenance: { kind: 'import', file: 'a.csv' }, features: [row({ a: '1' })] });
  assert.deepEqual(seen, [['add', ds.id]]);

  data.editValues(ds.id, [{ index: 0, field: 'a', value: '2' }]);
  assert.deepEqual(seen[seen.length - 1], ['edit', ds.id], 'the panel and the map were never told the values changed');
  data.undo(ds.id);
  assert.deepEqual(seen[seen.length - 1], ['edit', ds.id], 'an undo redraws nothing');
  data.declareField(ds.id, 'a', { unit: 'km' });
  assert.deepEqual(seen[seen.length - 1], ['edit', ds.id]);

  /* A refused edit says nothing to anybody: a redraw for a change that did not happen. */
  const n = seen.length;
  data.editValues(ds.id, [{ index: 5, field: 'a', value: '3' }]);
  assert.equal(seen.length, n, 'a refused edit still woke the subscribers');

  off();
  data.editValues(ds.id, [{ index: 0, field: 'a', value: '4' }]);
  assert.equal(seen.length, n, 'unsubscribing did not stop the events');

  /* The history goes with the record: an id is never reissued, so nothing can inherit it. */
  const id = ds.id;
  data.remove(id);
  assert.deepEqual(data.history(id), { undo: 0, redo: 0, bytes: 0, entries: [] });
});
