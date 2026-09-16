/* ============================================================================
 *  #R749 · 保存は「続きから」と「同じ結果」の両方を支えているか
 * ----------------------------------------------------------------------------
 *  Two different requests were being answered by one save file, and each was missing a half.
 *
 *  ⚠ THE INVARIANTS BELOW ARE WRITTEN AS THE DEFECT, NOT AS THE FIX (the memory note
 *  「不変条件には、到達した答えではなく元の欠陥を書く」). 「宣言が保存される」 is a sentence about an
 *  implementation and it would go on passing over a save that writes the declaration and a load that
 *  copies it in unverified. What is measured here is what the reader loses:
 *
 *    ① after a save and a fresh registry, THE TYPE AND UNIT THE READER STATED ARE STILL THERE.
 *       They used to be held beside the undo stack, so they had the undo stack's lifetime: the reload
 *       brought back the edited VALUES and dropped what they mean, and nothing said so
 *    ② a unit that a SOURCE stated (a raster band's) does not come back as something the READER
 *       declared. Who said it is the only thing about a unit that can be verified at all
 *    ③ a saved declaration that the data no longer bears out is NOT written back. The features may
 *       have changed between the save and the load — a column may be gone, a column of numbers may
 *       now hold words — and a declaration copied in blind is a claim with no author behind it. It
 *       comes back NAMED, in `refused`
 *    ④ an op step records WHICH IMPLEMENTATION computed it. #R743 corrected `union` and the distance
 *       search — the answers themselves — so the same recipe re-run today can produce different
 *       numbers, and before this round neither the record nor the reader was told
 *    ⑤ when the version cannot be measured on one side (an old record, a build whose kernels do not
 *       state one), the load DOES NOT REPORT AGREEMENT. 「読めなかった」 was reported as 「同じ」 in
 *       #R745 and it is the same shape here
 *    ⑥ a record saved under the OLD RECORD_VERSION still loads, and today's version is not written
 *       into the place where the old record says nothing
 *    ⑦ the undo history is NOT saved — which is what makes ① a statement about lifetimes rather than
 *       about serialisation: the two used to share a bag, and only one of them belongs in the file
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/* Same boot as tests/r738-gis-edits-checks: js/geodesy.js publishes onto `window` at top level and
   exports nothing, so it is evaluated the way a browser evaluates it. */
function installWindow() {
  const w = {};
  globalThis.window = w;
  new Function('window', read('js/geodesy.js'))(w);
  return w;
}

/* An in-memory IndexedDB that answers the calls js/gis-project.js makes and nothing else. ⚠ Node has
   no IndexedDB, and the store says `storage-unavailable` rather than pretending — so a shim is the
   only way to evaluate the SHIPPED module rather than a description of it. Copied in shape from
   tests/r729-gis-core-checks; `complete` fires after the requests made on the transaction. */
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
        transaction: () => { const tx = { objectStore: () => os, oncomplete: null, onerror: null, onabort: null, error: null }; setTimeout(() => fire(tx, 'complete'), 0); return tx; },
        close: () => { },
      };
      const r = { result: db, error: null, onupgradeneeded: null };
      setTimeout(() => { if (r.onupgradeneeded) r.onupgradeneeded({ target: r }); if (r.onsuccess) r.onsuccess({ target: r }); }, 0);
      return r;
    },
  };
}

async function boot() {
  const w = installWindow();
  const store = new Map();
  w.indexedDB = globalThis.indexedDB = fakeIDB(store);
  const { makeGisDatasets } = await import('../js/gis-datasets.js');
  const { makeGisGeometry } = await import('../js/gis-geometry.js');
  const { makeGisOps } = await import('../js/gis-ops.js');
  const { makeGisProject } = await import('../js/gis-project.js');
  const data = makeGisDatasets();
  const geometry = makeGisGeometry();
  const ops = makeGisOps();
  const project = makeGisProject();
  w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops; w.IntMapGisProject = project;
  await geometry.ready();
  return { w, data, geometry, ops, project, store };
}

const feat = (g, p) => ({ type: 'Feature', properties: p || {}, geometry: g });
const pt = (lng, lat, p) => feat({ type: 'Point', coordinates: [lng, lat] }, p);
const row = (p) => feat(null, p);

/* ══ ① 読み直したあと、利用者が述べた型と単位が失われていない ═══════════════════════════════ */

test('R749 ① a save and a reload do not lose the type and the unit the reader stated', async () => {
  const { data, project, store } = await boot();
  if (!project.available()) { assert.ok(true, 'IndexedDB shim not accepted — the store says so rather than pretending'); return; }

  const ds = data.add({
    title: '市区町村別人口',
    provenance: { kind: 'import', file: 'pop.csv' },
    features: [
      row({ cd: '01100', name: '札幌市中央区', pop: '248680', dens: '3123.4' }),
      row({ cd: '13101', name: '千代田区', pop: '66680', dens: '5758.1' }),
    ],
  });
  /* 「この列は人口密度で、単位は 人/km²」 — a statement nothing can re-derive from the digits. */
  assert.equal(data.declareField(ds.id, 'dens', { type: 'number', unit: '人/km2' }).ok, true);
  assert.equal(data.declareField(ds.id, 'pop', { unit: '人' }).ok, true);
  const declaredAt = data.declarations(ds.id).dens.at;
  assert.ok(typeof declaredAt === 'number' && declaredAt > 0, 'a declaration does not carry WHEN it was made');

  const saved = await project.save('p');
  assert.equal(saved.ok, true, JSON.stringify(saved));

  /* A fresh registry AND a fresh project module — the reader closed the tab. Nothing of the session
     survives except the bytes in the store. */
  const second = await boot();
  second.w.indexedDB = globalThis.indexedDB = fakeIDB(store);
  const { makeGisProject } = await import('../js/gis-project.js');
  const project2 = makeGisProject();
  second.w.IntMapGisProject = project2;
  const back = await project2.load(saved.id);
  assert.equal(back.ok, true, JSON.stringify(back));
  assert.deepEqual(back.declarationsRefused, [], 'a declaration the data still bears out was refused on the way in');

  const rec = second.data.get(ds.id);
  assert.ok(rec, 'the dataset did not come back at all');
  const dens = rec.fields.find((f) => f.name === 'dens');
  assert.equal(dens.typeStated, 'number', 'the reader stated a type and the reload lost it');
  assert.equal(dens.typeStatedBy, 'reader');
  assert.equal(dens.unit, '人/km2', 'the reader stated a unit and the reload lost it');
  assert.equal(dens.unitStated, 'reader');
  const pop = rec.fields.find((f) => f.name === 'pop');
  assert.equal(pop.unit, '人');

  /* And WHEN it was stated is the reader's statement too, not the moment the project was opened. */
  const backDecl = second.data.declarations(ds.id);
  assert.equal(backDecl.dens.at, declaredAt, 'the restored declaration was re-dated to the reload');
  assert.equal(backDecl.dens.type, 'number');
  assert.equal(backDecl.dens.unit, '人/km2');

  /* ⚠ null と「空」を同じ扱いにしない: a registry that has no such record cannot say 「宣言は無い」. */
  assert.equal(second.data.declarations('ds-nope'), null, 'a dataset that does not exist is answered as though it existed and had declared nothing');
  const plain = second.data.add({ title: 'plain', provenance: { kind: 'import', file: 'b.csv' }, features: [row({ a: '1' })] });
  assert.deepEqual(second.data.declarations(plain.id), {}, 'a record with no declarations is answered as though it could not be found');
});

/* ══ ② 出典が述べた単位が、利用者の宣言として復活しない ═════════════════════════════════════ */

test('R749 ② a unit the SOURCE stated does not come back as one the reader declared', async () => {
  const { data, project, store } = await boot();
  if (!project.available()) { assert.ok(true, 'IndexedDB shim not accepted'); return; }

  const grid = data.add({
    kind: 'raster', title: 'dem', provenance: { kind: 'import', file: 'dem.tif' },
    width: 2, height: 2, grid: { west: 139, north: 36, pixelLng: 0.01, pixelLat: 0.01 },
    bands: [{ name: 'elev', unit: 'm' }],
    read: () => Float64Array.from([1, 2, 3, 4]),
  });
  assert.equal(grid.fields[0].unitStated, 'source');
  /* The declarations door answers about the READER, and the reader has declared nothing here. */
  assert.deepEqual(data.declarations(grid.id), {}, 'a source-stated unit was reported as the reader having declared it');

  const saved = await project.save('p');
  assert.equal(saved.ok, true, JSON.stringify(saved));
  const rec = Array.from(store.values())[0];
  const st = rec.steps.find((s) => s.id === grid.id);
  assert.equal(st.kind, 'raster-body');
  assert.ok(st.declarations == null, 'the grid was saved as though the reader had declared its band units');

  const second = await boot();
  second.w.indexedDB = globalThis.indexedDB = fakeIDB(store);
  const { makeGisProject } = await import('../js/gis-project.js');
  const p2 = makeGisProject();
  second.w.IntMapGisProject = p2;
  assert.equal((await p2.load(saved.id)).ok, true);
  const bandField = second.data.get(grid.id).fields[0];
  assert.equal(bandField.unit, 'm', 'the source stated the unit and the reload lost it');
  assert.equal(bandField.unitStated, 'source', 'a unit the source stated came back attributed to the reader');
  assert.deepEqual(second.data.declarations(grid.id), {}, 'the reload invented a reader declaration out of a band');
});

/* ══ ③ 今のデータで成り立たない宣言は、無検証で写されない ═══════════════════════════════════ */

test('R749 ③ a saved declaration the data no longer bears out is refused by name, not copied in', async () => {
  const { data, project, store } = await boot();
  if (!project.available()) { assert.ok(true, 'IndexedDB shim not accepted'); return; }

  const ds = data.add({
    id: 'ds-1', title: 'obs', provenance: { kind: 'import', file: 'o.csv' },
    features: [row({ v: '10', gone: 'x' }), row({ v: '20', gone: 'y' })],
  });
  assert.equal(data.declareField(ds.id, 'v', { type: 'number', unit: 'm' }).ok, true);
  assert.equal(data.declareField(ds.id, 'gone', { unit: 'kg' }).ok, true);
  const saved = await project.save('p');
  assert.equal(saved.ok, true, JSON.stringify(saved));

  /* ⚠ THE FEATURES CHANGE BETWEEN THE SAVE AND THE LOAD, which is the whole situation this guards:
     the reader dropped a newer file under the same project. `v` now holds a word and `gone` is gone. */
  const rec = store.get(saved.id);
  const body = rec.steps.find((s) => s.id === ds.id);
  body.features = [row({ v: '不明' }), row({ v: '20' })];
  store.set(saved.id, rec);

  const second = await boot();
  second.w.indexedDB = globalThis.indexedDB = fakeIDB(store);
  const { makeGisProject } = await import('../js/gis-project.js');
  const p2 = makeGisProject();
  second.w.IntMapGisProject = p2;
  const back = await p2.load(saved.id);
  assert.equal(back.ok, true, 'a declaration that no longer holds must not stop the project from opening');

  const whys = back.declarationsRefused.map((r) => r.why).sort();
  assert.deepEqual(whys, ['field-type-refused', 'unknown-field'], 'the refusals did not reach the caller: ' + JSON.stringify(back.declarationsRefused));
  for (const r of back.declarationsRefused) {
    assert.equal(r.id, ds.id);
    assert.ok(r.field === 'v' || r.field === 'gone', 'a refusal that does not name the column tells the reader nothing');
  }

  const v = second.data.get(ds.id).fields.find((f) => f.name === 'v');
  assert.equal(v.type, 'text', 'the column measures as text now');
  assert.equal(v.typeStated, undefined, 'a `number` declaration was written back over cells that are not numbers');
  assert.ok(v.unit == null, 'the unit rode in on a type declaration the data refused');
  assert.equal(second.data.declarations(ds.id).gone, undefined, 'a declaration about a column that no longer exists was restored');
});

/* ══ ④ 処理レコードに版が入り、違う版で読み込むと述べられる ═════════════════════════════════ */

test('R749 ④ an op step records which implementation computed it, and a different one is reported', async () => {
  const { w, data, ops, project, store } = await boot();
  if (!project.available()) { assert.ok(true, 'IndexedDB shim not accepted'); return; }

  const src = data.add({ id: 'ds-1', title: 'src', provenance: { kind: 'import', file: 'a.csv' }, features: [pt(139, 35, { a: '1' })] });
  const buf = await ops.run({ op: 'buffer', inputs: [src.id], params: { radiusKm: 5 } });
  assert.equal(buf.ok, true, JSON.stringify(buf));

  const saved = await project.save('p');
  assert.equal(saved.ok, true, JSON.stringify(saved));
  const step = store.get(saved.id).steps.find((s) => s.id === buf.dataset.id);
  assert.ok(step.engine && typeof step.engine === 'object', 'a step was saved with no record of what computed it');
  assert.equal(typeof step.engine.ops, 'string', 'the ops kernel did not state a version');
  assert.equal(typeof step.engine.geometry, 'string', 'the geometry kernel did not state a version');
  /* ⚠ The version is the KERNEL'S; this check asks the module rather than spelling a number, so a
     release that moves the version does not have to move this line as well. */
  assert.equal(step.engine.ops, w.IntMapGisOps.version());
  assert.equal(step.engine.geometry, w.IntMapGisGeometry.version());

  /* Same record, a build whose ops kernel says something else — #R743 in one line. */
  const second = await boot();
  second.w.indexedDB = globalThis.indexedDB = fakeIDB(store);
  second.w.IntMapGisOps = { run: (s, o) => second.ops.run(s, o), version: () => 'ops-999' };
  const { makeGisProject } = await import('../js/gis-project.js');
  const p2 = makeGisProject();
  second.w.IntMapGisProject = p2;
  const back = await p2.load(saved.id);
  assert.equal(back.ok, true, JSON.stringify(back));
  assert.equal(back.engineChanged.length, 1, 'the same recipe ran under a different kernel and the load said nothing: ' + JSON.stringify(back.engineChanged));
  const ch = back.engineChanged[0];
  assert.equal(ch.id, buf.dataset.id);
  assert.equal(ch.op, 'buffer');
  assert.equal(ch.saved.ops, step.engine.ops);
  assert.equal(ch.now.ops, 'ops-999');
  assert.deepEqual(back.engineUnknown, [], 'both versions were known — this is not the unmeasurable case');

  /* And the same kernel is not reported as a change: a warning on every load is a warning nobody
     reads, which is how the real one gets missed. */
  const third = await boot();
  third.w.indexedDB = globalThis.indexedDB = fakeIDB(store);
  const p3 = makeGisProject();
  third.w.IntMapGisProject = p3;
  const same = await p3.load(saved.id);
  assert.equal(same.ok, true, JSON.stringify(same));
  assert.deepEqual(same.engineChanged, []);
  assert.deepEqual(same.engineUnknown, []);
});

/* ══ ⑤ 版を測れなかったとき「同じ」と報告しない ════════════════════════════════════════════ */

test('R749 ⑤ a version that could not be measured is not reported as agreement', async () => {
  const { data, ops, project, store } = await boot();
  if (!project.available()) { assert.ok(true, 'IndexedDB shim not accepted'); return; }

  const src = data.add({ id: 'ds-1', title: 'src', provenance: { kind: 'import', file: 'a.csv' }, features: [pt(139, 35, { a: '1' })] });
  const buf = await ops.run({ op: 'buffer', inputs: [src.id], params: { radiusKm: 5 } });
  assert.equal(buf.ok, true, JSON.stringify(buf));
  const saved = await project.save('p');
  assert.equal(saved.ok, true, JSON.stringify(saved));

  /* A build whose ops kernel does not state a version at all — the state the `typeof` guard exists
     to reach. ⚠ 「読めなかった」 must not become 「同じ」: that is the shape #R745 recorded, where a
     tool reported an unreadable comparison as a match. */
  const second = await boot();
  second.w.indexedDB = globalThis.indexedDB = fakeIDB(store);
  second.w.IntMapGisOps = { run: (s, o) => second.ops.run(s, o) };     /* no version() */
  const { makeGisProject } = await import('../js/gis-project.js');
  const p2 = makeGisProject();
  second.w.IntMapGisProject = p2;
  /* ⚠ (#R752) `== null`, NOT `=== null`, AND THE LOOSENING IS THE POINT. The defect this line
     records is 「版を述べなかったものに版が与えられた」; it is not 「the key is spelled null rather
     than absent」. #R752 made js/gis-project.js DISCOVER its kernels — a part exists because a module
     declared a version — so a module that declares none contributes no key at all, which is the same
     statement in a different spelling. Pinning the spelling was the shape
     [[intmap-restate-the-defect-not-the-fix]] records: an invariant written as the shape of one fix
     stops the next correct change instead of the next defect. What must still hold is below — the
     unmeasurable part is reported, and never as agreement. */
  assert.ok(p2.engine().ops == null, 'a kernel with no version() was given one: ' + JSON.stringify(p2.engine()));

  const back = await p2.load(saved.id);
  assert.equal(back.ok, true, JSON.stringify(back));
  assert.deepEqual(back.engineChanged, [], 'an unmeasurable version was reported as a difference');
  assert.equal(back.engineUnknown.length, 1, 'an unmeasurable version was passed over in silence, which reads as agreement: ' + JSON.stringify(back));
  assert.equal(back.engineUnknown[0].id, buf.dataset.id);
  assert.ok(back.engineUnknown[0].now.ops == null);
  assert.ok(back.engineUnknown[0].saved.ops, 'the saved side was known — only the running side was not');
});

/* ══ ⑥ 古いレコードが読め、今の版が代入されていない ════════════════════════════════════════ */

test('R749 ⑥ a record saved under the old RECORD_VERSION loads, and today’s version is not put into it', async () => {
  const { data, ops, project, store } = await boot();
  if (!project.available()) { assert.ok(true, 'IndexedDB shim not accepted'); return; }
  assert.ok(project.recordVersion >= 2, 'the record version was not raised for the two new fields');

  const src = data.add({ id: 'ds-1', title: 'src', provenance: { kind: 'import', file: 'a.csv' }, features: [pt(139, 35, { a: '1' })] });
  const buf = await ops.run({ op: 'buffer', inputs: [src.id], params: { radiusKm: 5 } });
  assert.equal(buf.ok, true, JSON.stringify(buf));
  const saved = await project.save('p');
  assert.equal(saved.ok, true);

  /* Roll the stored bytes back to what version 1 held: no `engine`, no `declarations`. This is the
     reader's project from last week, not a hypothetical. */
  const rec = store.get(saved.id);
  rec.version = 1;
  for (const st of rec.steps) { delete st.engine; delete st.declarations; }
  store.set(saved.id, rec);

  const second = await boot();
  second.w.indexedDB = globalThis.indexedDB = fakeIDB(store);
  const { makeGisProject } = await import('../js/gis-project.js');
  const p2 = makeGisProject();
  second.w.IntMapGisProject = p2;
  const back = await p2.load(saved.id);
  assert.equal(back.ok, true, 'a project saved under the previous record version no longer opens: ' + JSON.stringify(back));
  assert.equal(back.savedVersion, 1);
  assert.equal(second.data.list().length, 2, 'the steps did not come back');

  /* ⚠ THE OLD RECORD SAYS NOTHING ABOUT THE KERNEL, and nothing is what it must keep saying. */
  assert.deepEqual(back.engineChanged, [], 'an absent version was read as a different one');
  assert.equal(back.engineUnknown.length, 1, 'an absent version was read as agreement with today’s');
  assert.equal(back.engineUnknown[0].saved, null, 'today’s version was written into a record that never stated one');
  assert.ok(back.engineUnknown[0].now.ops, 'the running side is known and was reported as unknown too');
  assert.deepEqual(back.declarationsRefused, []);
});

/* ══ ⑦ 取り消し履歴は保存されない（宣言と寿命が違うことが見える）══════════════════════════ */

test('R749 ⑦ the undo history is not saved — it is the half of that bag with a session lifetime', async () => {
  const { data, project, store } = await boot();
  if (!project.available()) { assert.ok(true, 'IndexedDB shim not accepted'); return; }

  const ds = data.add({ id: 'ds-1', title: 't', provenance: { kind: 'import', file: 'a.csv' }, features: [row({ v: '1' }), row({ v: '2' })] });
  assert.equal(data.declareField(ds.id, 'v', { type: 'number', unit: 'm' }).ok, true);
  assert.equal(data.editValues(ds.id, [{ index: 0, field: 'v', value: '11' }]).ok, true);
  assert.equal(data.history(ds.id).undo, 1, 'the edit did not reach the history');

  const saved = await project.save('p');
  assert.equal(saved.ok, true, JSON.stringify(saved));
  const text = JSON.stringify(store.get(saved.id));
  assert.ok(!/"undo"|"redo"/.test(text), 'the undo stack went into the save file: it is keystrokes, not data');

  const second = await boot();
  second.w.indexedDB = globalThis.indexedDB = fakeIDB(store);
  const { makeGisProject } = await import('../js/gis-project.js');
  const p2 = makeGisProject();
  second.w.IntMapGisProject = p2;
  assert.equal((await p2.load(saved.id)).ok, true);

  /* ⚠ THE TWO HALVES, SIDE BY SIDE. The edited VALUE is back (it is the data), the DECLARATION is
     back (it is what the data means), and the HISTORY is not (it is what the reader typed). Before
     this round the second and third shared one lifetime and the second was lost with the third. */
  const rec = second.data.get(ds.id);
  assert.equal(rec.features()[0].properties.v, '11', 'the edited value did not survive the save');
  assert.equal(rec.fields.find((f) => f.name === 'v').typeStated, 'number', 'the declaration shared the history’s lifetime again');
  assert.equal(second.data.history(ds.id).undo, 0, 'a saved undo stack came back: it would be a history of features it no longer matches');
  assert.equal(second.data.undo(ds.id).ok, false, 'there is something to step back over after a reload');
});
