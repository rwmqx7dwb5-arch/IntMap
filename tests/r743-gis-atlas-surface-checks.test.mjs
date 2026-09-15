/* ============================================================================
 *  #R743 · Atlas が GIS の処理を走らせられる — 宣言をそのまま公開する
 * ----------------------------------------------------------------------------
 *  What this round claimed, and therefore what has to stay true:
 *
 *    ⑧ the catalogue Atlas is handed IS js/gis-ops.js's declaration, not a copy of it
 *    ⑨ the text the planner reads names every declared op — a new op cannot hide in it
 *    ⑩ a step's output is a dataset id, and that id is the input of the next step
 *    ⑪ a refusal carries the vocabulary: what exists, or the op's own declaration
 *    ⑫ drawing is a separate capability from computing
 *
 *  ⚠ ⑧ AND ⑨ ARE THE SAME DEFECT MEASURED TWICE BEFORE. #R732 found `ORDER = [four ids]` in the
 *  panel while DECL held nine — an op that answered run() and was invisible on screen — under the
 *  paragraph forbidding hand-written lists. #R733 measured the other half in production: a planner
 *  told to SEARCH for capabilities it had already been handed spent all eight steps of a turn
 *  searching. So the catalogue is derived, and the prose that cannot be derived is MEASURED against
 *  what is.
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

function installWindow() {
  const w = {};
  globalThis.window = w;
  new Function('window', read('js/geodesy.js'))(w);
  return w;
}

/* The map is a stub here, and a small one on purpose: what this file measures is the SURFACE — what
   the planner is offered, how a reference resolves, what a refusal says — and a real renderer would
   only make those answers harder to read. js/gis-layers.js is measured against the real thing in
   tests/r732 ⑨ and tests/r735 ⑪. */
function stubLayers(rows) {
  return {
    sources: () => rows.map((r) => ({ id: r.id, label: r.label, geometryType: r.geometryType || 'Point', count: (r.features || []).length })),
    canSample: (id) => !!(rows.find((r) => r.id === id) || {}).samplable,
    toDataset: (id, o) => {
      const row = rows.find((r) => r.id === id);
      if (!row) return { ok: false, why: 'layer-unknown', detail: { id: id } };
      return { ok: true, dataset: globalThis.window.IntMapData.add({ title: (o && o.title) || row.label, features: row.features }) };
    },
    toRaster: async () => ({ ok: false, why: 'layer-not-sampling' }),
  };
}

async function boot(layerRows) {
  const w = installWindow();
  const { makeGisDatasets } = await import('../js/gis-datasets.js');
  const { makeGisGeometry } = await import('../js/gis-geometry.js');
  const { makeGisOps } = await import('../js/gis-ops.js');
  const { makeGisAtlas } = await import('../js/gis-atlas.js');
  const data = makeGisDatasets();
  const geometry = makeGisGeometry();
  const ops = makeGisOps();
  w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops;
  await geometry.ready();
  const layers = stubLayers(layerRows || []);
  w.IntMapGisLayers = layers;
  const drawn = [];
  const atlas = makeGisAtlas({
    data, ops, layers,
    draw: (id) => { drawn.push(id); return { ok: true, sid: 'ugj-' + drawn.length }; },
  });
  return { w, data, ops, atlas, drawn };
}

const feat = (g, p) => ({ type: 'Feature', properties: p || {}, geometry: g });
const pt = (lng, lat, p) => feat({ type: 'Point', coordinates: [lng, lat] }, p);
const poly = (rings, p) => feat({ type: 'Polygon', coordinates: rings }, p);
const box = (w, s, e, n) => [[w, s], [e, s], [e, n], [w, n], [w, s]];

/* ══ ⑧ 目録は宣言そのものである ═════════════════════════════════════════════════════════ */

test('R743 ⑧ the catalogue Atlas is handed is the ops declaration itself', async () => {
  const { ops, atlas, data } = await boot([{ id: 'rail', label: 'Railways', features: [pt(0, 0)] }]);
  const cat = atlas.catalogue();
  assert.deepEqual(cat.ops, ops.ops(), 'the catalogue is a copy that has already drifted from DECL');
  assert.ok(cat.ops.length >= 16, 'only ' + cat.ops.length + ' ops reached the planner');

  /* What the reader has, and what the map has — both asked, neither listed. */
  data.add({ title: 'Clinics', features: [pt(1, 1, { n: 'a' })] });
  const again = atlas.catalogue();
  assert.equal(again.datasets.length, 1);
  assert.equal(again.datasets[0].title, 'Clinics');
  assert.deepEqual(again.layers.map((l) => l.ref), ['layer:rail']);
});

/* ══ ⑨ 案内文は宣言された op を全部名指す ═══════════════════════════════════════════════ */

test('R743 ⑨ the planner text names every declared op — a new op cannot hide in it', async () => {
  const { ops } = await boot();
  const src = read('js/atlas-catalog-text.js');

  /* ⚠ THIS IS THE ONE HAND-WRITTEN LIST THE ROUND COULD NOT REMOVE: the catalogue is prose sent to
     a model, and js/atlas-catalog-text.js is evaluated before the GIS chunk is loaded, so it cannot
     ask DECL what exists. It is therefore MEASURED against DECL instead — an op added tomorrow
     fails this line until the sentence the planner reads knows about it. #R733 is why it must be
     named rather than searched for: a capability the model is not told it can pass is a capability
     it does not use. */
  const block = src.split('/* 02b */')[1];
  assert.ok(block, 'the GIS catalogue block is gone');
  const text = block.split("\\n' }")[0];
  const named = new Set();
  const re = /([a-zA-Z][a-zA-Z0-9]*)\((1|2)[:)]/g;
  let m;
  while ((m = re.exec(text))) named.add(m[1]);
  const declared = ops.ops().map((d) => d.id).sort();
  const missing = declared.filter((id) => !named.has(id));
  assert.deepEqual(missing, [], 'declared ops the planner is never told about: ' + missing.join(', '));
  const invented = [...named].filter((id) => declared.indexOf(id) < 0).sort();
  assert.deepEqual(invented, [], 'the text offers ops that do not exist: ' + invented.join(', '));
});

/* ══ ⑩ 出力の id が次の入力になる ═══════════════════════════════════════════════════════ */

test('R743 ⑩ a step answers with a dataset id, and that id is the next step input', async () => {
  const { atlas, data } = await boot([
    { id: 'rail', label: 'Railways', features: [pt(139.7, 35.68), pt(139.8, 35.68)] },
  ]);
  const wards = data.add({
    title: 'Wards',
    features: [poly([box(139.5, 35.5, 140.0, 35.9)], { ward: 'central' })],
  });

  /* ⚠ THE CHAIN STARTS FROM A LAYER OF THE MAP. A session that has imported nothing has an empty
     registry and a map full of data; without this door Atlas could never begin. */
  const buf = await atlas.run({ op: 'buffer', inputs: ['layer:rail'], params: { radiusKm: 5 } });
  assert.equal(buf.ok, true, 'buffer refused: ' + buf.why + ' ' + JSON.stringify(buf.detail));
  assert.ok(buf.dataset.id, 'the step did not say what it made');
  assert.equal(buf.dataset.count, 2);

  const merged = await atlas.run({ op: 'dissolve', inputs: [buf.dataset.id] });
  assert.equal(merged.ok, true, 'dissolve refused: ' + merged.why);
  assert.equal(merged.dataset.count, 1, 'the two overlapping buffers did not become one shape');

  const counted = await atlas.run({ op: 'aggregate', inputs: [wards.id, merged.dataset.id], params: { stat: 'count' } });
  assert.equal(counted.ok, true, 'aggregate refused: ' + counted.why);
  assert.equal(counted.dataset.count, 1);
  assert.equal(data.get(counted.dataset.id).features()[0].properties.count, 1);

  /* The reply tells the planner the id, in the reader's own languages, and says what to do with it. */
  assert.ok(buf.html.indexOf(buf.dataset.id) >= 0, 'the answer does not carry the id it made');

  /* ⚠ RESOLVING THE SAME LAYER TWICE DOES NOT BAKE IT TWICE within one step. */
  const before = data.list().length;
  await atlas.run({ op: 'relate', inputs: ['layer:rail', 'layer:rail'], params: { predicate: 'intersects' } });
  assert.equal(data.list().length, before + 2, 'one layer referenced twice was copied twice into the registry');
});

/* ══ ⑪ 拒否は語彙を運ぶ ═════════════════════════════════════════════════════════════════ */

test('R743 ⑪ a refusal carries what exists, or the declaration of the op that refused', async () => {
  const { atlas, ops, data } = await boot([{ id: 'rail', label: 'Railways', features: [pt(0, 0)] }]);
  data.add({ title: 'Clinics', features: [pt(1, 1)] });

  const bad = await atlas.run({ op: 'bufferr', inputs: ['Clinics'], params: {} });
  assert.equal(bad.ok, false);
  assert.equal(bad.why, 'op-unknown');
  assert.deepEqual(bad.detail.ops, ops.ops().map((d) => d.id), 'a misspelled op was refused without the list');

  const lost = await atlas.run({ op: 'buffer', inputs: ['Clinic'], params: { radiusKm: 1 } });
  assert.equal(lost.ok, false);
  assert.equal(lost.why, 'input-unresolved');
  assert.deepEqual(lost.detail.datasets.map((d) => d.title), ['Clinics']);
  assert.deepEqual(lost.detail.layers.map((l) => l.ref), ['layer:rail']);

  /* ⚠ A REFUSED STEP HANDS BACK THE OP'S SHAPE. js/gis-ops.js names the parameter it refused; what
     it cannot know is that its caller has never seen the op. */
  const noRadius = await atlas.run({ op: 'buffer', inputs: ['Clinics'], params: {} });
  assert.equal(noRadius.ok, false);
  assert.equal(noRadius.why, 'missing-param');
  assert.equal(noRadius.declaration.id, 'buffer');
  assert.ok(noRadius.declaration.params.some((p) => p.name === 'radiusKm' && p.required));

  /* A grid slot fed a samplable layer says exactly what it is missing, rather than inventing a
     window and a resolution nobody asked for. */
  const { atlas: a2, data: d2 } = await boot([{ id: 'elev', label: 'Elevation', samplable: true, features: [] }]);
  d2.add({ title: 'Zones', features: [poly([box(0, 0, 1, 1)], {})] });
  const grid = await a2.run({ op: 'zonal', inputs: ['Zones', 'layer:elev'], params: { stat: 'mean' } });
  assert.equal(grid.ok, false);
  assert.equal(grid.why, 'raster-sample-needs-window');
  assert.deepEqual(grid.detail.needs, ['sample.bounds', 'sample.width', 'sample.height']);
});

/* ══ ⑫ 描くことは別の約束である ═════════════════════════════════════════════════════════ */

test('R743 ⑫ computing and drawing are two capabilities, not one', async () => {
  const { atlas, drawn, data } = await boot();
  data.add({ title: 'Clinics', features: [pt(1, 1)] });

  /* ⚠ A STEP DOES NOT PAINT. Four intermediate results of a chain on the map are four layers the
     reader did not ask for — and a capability that paints only sometimes cannot declare that it
     paints, which is how a correct answer gets reported `not_rendered` (#R736/#R737). */
  const buf = await atlas.run({ op: 'buffer', inputs: ['Clinics'], params: { radiusKm: 1 } });
  assert.equal(buf.ok, true, 'buffer refused: ' + buf.why);
  assert.deepEqual(drawn, [], 'a computing step drew on the map without being asked');

  const shown = await atlas.draw({ dataset: buf.dataset.id });
  assert.equal(shown.ok, true, 'draw refused: ' + shown.why);
  assert.deepEqual(drawn, [buf.dataset.id]);
  assert.equal(shown.drawn, true);

  /* And the two are registered as two capabilities with two schemas — the audit in
     scripts/atlas-capability-audit.mjs measures the rest of that claim. */
  const caps = read('js/atlas-capabilities.js');
  assert.ok(caps.indexOf("'data.gis'") > 0 && caps.indexOf("'map.drawDataset'") > 0);
  const sch = read('js/atlas-schemas.js');
  assert.ok(sch.indexOf("'data.gis':") > 0 && sch.indexOf("'map.drawDataset':") > 0);
});
