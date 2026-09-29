/* ============================================================================
 *  GIS · PROJECTS, MANIFESTS AND THE HEADLESS RUNTIME — 保存・再現・由来
 * ----------------------------------------------------------------------------
 *  A saved analysis: what is saved and what is recomputed, which engine version computed a step, the
 *  manifest that lets a third party re-run it, fingerprints, and the same GIS assembled without a
 *  browser.
 *
 *  ⚠ ONE BLOCK PER ROUND, AND EACH BLOCK IS ISOLATED. The rounds below used to be files of their own,
 *  each in its own process; `isolate()` (tests/helpers/geo-shared.mjs) gives every block back the
 *  globalThis a fresh process had, so no block reads a `window` another one left behind. Test titles
 *  carry the round that wrote them (#R<N>), and each block keeps that round's own account of WHY.
 * ==========================================================================*/

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, fakeIDB, installWindow, isolate, read } from './helpers/geo-shared.mjs';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R749 · persistence   (was tests/r749-gis-persistence-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
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
describe('§ #R749 · persistence', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

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

  ISOLATED.built();
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R765 · the analysis manifest   (was tests/r765-gis-analysis-manifest-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* ============================================================================
 *  #R765 · 「作業を再開できる」と「その結果をもう一度出せる」は別のこと
 * ----------------------------------------------------------------------------
 *  js/gis-project.js save()/load() make an analysis RESUMABLE — the inputs come back whole, the ops
 *  replay, and a changed engine is reported (#R749). That is right, and it is not reproducibility.
 *  A recipe replayed on a different engine, against an upstream that has refreshed, at a different
 *  hour, is a NEW answer wearing the old one's name; the version comparison can only say 「違う」
 *  afterwards, to whoever happens to be looking.
 *
 *  ⚠ WHAT WAS MISSING IS A DOCUMENT, NOT A STORE. 「この数は何から、どうやって出たのか」 had an
 *  answer spread across four modules and reachable only by walking them by hand. `manifest()` walks
 *  them once and writes it down; `verify()` makes 「同じ結果が出たか」 a measurement instead of a hope.
 *
 *  ⚠⚠ THE MOST IMPORTANT FIELD IS `gaps`. A manifest that listed only what the app knows would be
 *  「知らない」を「全部だ」の代わりにする ([[intmap-one-store-was-asked]]) — and the things this app
 *  genuinely cannot establish about its own answer (an upstream nobody versions, an import whose
 *  bytes are not kept, a step computed before the engine stamped itself) are the first thing a
 *  reader checking somebody else's number needs. So the tests below measure that the gaps are
 *  PRESENT and TRUE, not merely that the happy fields are filled.
 *
 *  ⚠⚠⚠ AND ONE DEFECT FOUND ON THE WAY: a record carried no statement of what computed it. #R749
 *  stamped the engine into steps js/gis-project.js SAVES — which covers a reopened project and
 *  nothing else. The record sitting in the registry right now, the one about to be exported, said
 *  nothing, and asking the kernels later answers a different question («what is loaded now»).
 * ==========================================================================*/
describe('§ #R765 · the analysis manifest', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  async function boot() {
    const w = {};
    globalThis.window = w;
    new Function('window', read('js/geodesy.js'))(w);
    const { makeGisDatasets } = await import('../js/gis-datasets.js');
    const { makeGisGeometry } = await import('../js/gis-geometry.js');
    const { makeGisRaster } = await import('../js/gis-raster.js');
    const { makeGisExpr } = await import('../js/gis-expr.js');
    const { makeGisOps } = await import('../js/gis-ops.js');
    const { makeGisProject } = await import('../js/gis-project.js');
    const data = makeGisDatasets(), geometry = makeGisGeometry(), ops = makeGisOps();
    w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops;
    w.IntMapGisRaster = makeGisRaster(); w.IntMapGisExpr = makeGisExpr();
    const project = makeGisProject();
    w.IntMapGisProject = project;
    await geometry.ready();
    return { w, data, ops, project };
  }

  const pt = (lng, lat, p) => ({ type: 'Feature', properties: p || {}, geometry: { type: 'Point', coordinates: [lng, lat] } });

  /* ══ ① 記録が、自分を計算したエンジンを述べる ═══════════════════════════════════════════════ */

  test('#R765 ① 演算の出力は、計算した瞬間のエンジンの版を持って登録される', async () => {
    const { data, ops } = await boot();
    const src = data.add({ title: 's', features: [pt(0, 0, { n: 1 }), pt(1, 1, { n: 5 })] });
    const r = await ops.run({ op: 'filter', inputs: [src.id], params: { where: [{ field: 'n', op: '>=', value: 2 }] } });
    assert.equal(r.ok, true, r.why);
    const eng = r.dataset.provenance.engine;
    assert.ok(eng && typeof eng === 'object', '計算したエンジンの版が記録に無い');
    assert.ok(eng.ops, 'ops の版が入っていない: ' + JSON.stringify(eng));
    /* ⚠ 「いま載っている版」を後から訊くのとは別の問い。両方が在って、混ざっていないこと。 */
    assert.equal(typeof eng.ops, 'string');
  });

  test('#R765 ① そのモジュールが載っていなければ、今日の版で埋めずに黙る', async () => {
    const { w, data, ops } = await boot();
    delete w.IntMapGisProject;                     /* 版を配る者が居ない状態 */
    const src = data.add({ title: 's', features: [pt(0, 0, { n: 1 })] });
    const r = await ops.run({ op: 'filter', inputs: [src.id], params: { where: [{ field: 'n', op: '>=', value: 0 }] } });
    assert.equal(r.ok, true, r.why);
    assert.equal(r.dataset.provenance.engine, undefined, '測れなかった版が、何かで埋められている');
  });

  /* ══ ② manifest が鎖を 1 つの文書にする ═════════════════════════════════════════════════════ */

  test('#R765 ② manifest は、入力から答えまでを入力が先の順で並べ、各段の由来を述べる', async () => {
    const { data, ops, project } = await boot();
    const src = data.add({
      title: '施設', features: [pt(0, 0, { n: 1, mass: 3 }), pt(1, 1, { n: 5, mass: 8 })],
      provenance: { kind: 'layer', layer: 'pharma', coverage: { completeness: 'all', reason: null } },
    });
    data.declareField(src.id, 'mass', { unit: 'kg' });
    const f = await ops.run({ op: 'filter', inputs: [src.id], params: { where: [{ field: 'n', op: '>=', value: 2 }] } });
    assert.equal(f.ok, true, f.why);

    const m = await project.manifest(f.dataset.id);
    assert.equal(m.ok, true, m.why);
    assert.equal(m.steps.length, 2, '鎖が 2 段になっていない');
    assert.equal(m.steps[0].id, src.id, '入力が先に来ていない');
    assert.equal(m.steps[1].id, f.dataset.id);

    /* 取得の段は、どのレイヤーから・どこまで答えられたかを持つ */
    assert.equal(m.steps[0].origin, 'layer');
    assert.equal(m.steps[0].acquisition.layer, 'pharma');
    assert.equal(m.steps[0].coverage.completeness, 'all');
    /* 単位は、誰が述べたかごと運ばれる */
    const mass = m.steps[0].fields.find((x) => x.name === 'mass');
    assert.equal(mass.unit, 'kg');
    /* 演算の段は、もう一度走らせられる形のレシピを持つ */
    assert.equal(m.steps[1].origin, 'op');
    assert.equal(m.steps[1].recipe.op, 'filter');
    assert.deepEqual(m.steps[1].recipe.inputs, [src.id]);
    assert.ok(m.steps[1].engineThen && m.steps[1].engineThen.ops, 'その段を計算した版が無い');
    /* そして「いま」と「そのとき」は別の欄で、混ざっていない */
    assert.ok(m.engineNow && m.engineNow.ops);
  });

  /* ══ ③ 述べられないことを、述べる ═══════════════════════════════════════════════════════════ */

  test('#R765 ③ 上流に版が無いことは、黙って省かれず gap として出る', async () => {
    const { data, ops, project } = await boot();
    const src = data.add({
      title: 'L', features: [pt(0, 0, { n: 1 })],
      provenance: { kind: 'layer', layer: 'aircraft', coverage: { completeness: 'partial', reason: 'supplier-view-bound' } },
    });
    const f = await ops.run({ op: 'filter', inputs: [src.id], params: { where: [{ field: 'n', op: '>=', value: 0 }] } });
    const m = await project.manifest(f.dataset.id);
    const kinds = m.gaps.map((g) => g.gap);
    assert.ok(kinds.indexOf('upstream-not-versioned') >= 0,
      '上流に版が無いことが述べられていない: ' + JSON.stringify(kinds));
    /* ⚠ gap は理由の文を持つ — コードだけでは読者に届かない */
    const g = m.gaps.find((x) => x.gap === 'upstream-not-versioned');
    assert.ok(g.means && g.means.length > 5, 'gap に読者向けの説明が無い');
    assert.equal(g.step, src.id, 'どの段の話かが述べられていない');
  });

  test('#R765 ③ 取り込んだファイルは、元のバイトを保持していないことを述べる', async () => {
    const { data, project } = await boot();
    const src = data.add({
      title: 'f', features: [pt(0, 0, {})],
      provenance: { kind: 'import', file: 'x.geojson', format: 'geojson', readAt: 1 },
    });
    const m = await project.manifest(src.id);
    const kinds = m.gaps.map((g) => g.gap);
    assert.ok(kinds.indexOf('source-bytes-not-kept') >= 0, JSON.stringify(kinds));
    assert.equal(m.steps[0].file, 'x.geojson');
  });

  test('#R765 ③ 供給元が完全性を述べていなければ、それも gap になる', async () => {
    const { data, project } = await boot();
    const src = data.add({
      title: 'L', features: [pt(0, 0, {})],
      provenance: { kind: 'layer', layer: 'webcams' },       /* coverage なし */
    });
    const m = await project.manifest(src.id);
    const kinds = m.gaps.map((g) => g.gap);
    assert.ok(kinds.indexOf('coverage-unstated') >= 0, JSON.stringify(kinds));
  });

  /* ══ ④ 指紋は「同じ答えか」を測れるようにする ═══════════════════════════════════════════════ */

  test('#R765 ④ 同じ中身は同じ指紋、違う中身は違う指紋', async () => {
    const { data, project } = await boot();
    const a = data.add({ title: 'a', features: [pt(0, 0, { n: 1 }), pt(1, 1, { n: 2 })] });
    const b = data.add({ title: 'b', features: [pt(0, 0, { n: 1 }), pt(1, 1, { n: 2 })] });
    const c = data.add({ title: 'c', features: [pt(0, 0, { n: 1 }), pt(1, 1, { n: 3 })] });
    const ma = await project.manifest(a.id), mb = await project.manifest(b.id), mc = await project.manifest(c.id);
    assert.ok(ma.answer.fingerprint, '指紋が取れていない');
    assert.equal(ma.answer.fingerprint, mb.answer.fingerprint, '同じ中身が違う指紋になった');
    assert.notEqual(ma.answer.fingerprint, mc.answer.fingerprint, '違う中身が同じ指紋になった');
  });

  test('#R765 ④ 属性の書き順は指紋を変えない — 並びが違うだけの同じ答えは同じ答え', async () => {
    const { data, project } = await boot();
    const a = data.add({ title: 'a', features: [{ type: 'Feature', properties: { x: 1, y: 2 }, geometry: { type: 'Point', coordinates: [0, 0] } }] });
    const b = data.add({ title: 'b', features: [{ type: 'Feature', properties: { y: 2, x: 1 }, geometry: { type: 'Point', coordinates: [0, 0] } }] });
    const ma = await project.manifest(a.id), mb = await project.manifest(b.id);
    assert.equal(ma.answer.fingerprint, mb.answer.fingerprint,
      'キーの順だけが違うものが、別の答えとして数えられている');
  });

  test('#R765 ④ 地物の並び順は指紋を変える — 順序は答えの一部である', async () => {
    const { data, project } = await boot();
    const a = data.add({ title: 'a', features: [pt(0, 0, { n: 1 }), pt(1, 1, { n: 2 })] });
    const b = data.add({ title: 'b', features: [pt(1, 1, { n: 2 }), pt(0, 0, { n: 1 })] });
    const ma = await project.manifest(a.id), mb = await project.manifest(b.id);
    assert.notEqual(ma.answer.fingerprint, mb.answer.fingerprint);
  });

  test('#R765 ④ 格子は、画素の並びと「どこに置かれているか」の両方から指紋を取る', async () => {
    const { data, project } = await boot();
    const mk = (west) => {
      const cells = Float64Array.from([1, 2, 3, 4]);
      return { kind: 'raster', title: 'g', width: 2, height: 2, grid: { west: west, north: 10, pixelLng: 1, pixelLat: 1 }, bands: [{ name: 'v', unit: null, nodata: null }], read: () => cells };
    };
    const a = data.add(mk(0)), b = data.add(mk(50));
    const ma = await project.manifest(a.id), mb = await project.manifest(b.id);
    assert.ok(ma.answer.fingerprint);
    assert.notEqual(ma.answer.fingerprint, mb.answer.fingerprint,
      '同じ画素が別の場所に置かれたものが、同じ答えとして数えられている');
  });

  /* ══ ⑤ verify は 3 つを答える ═══════════════════════════════════════════════════════════════ */

  test('#R765 ⑤ verify は「同じ」「違う」「測れなかった」を分ける', async () => {
    const { data, ops, project } = await boot();
    const src = data.add({ title: 's', features: [pt(0, 0, { n: 1 }), pt(1, 1, { n: 5 })] });
    const f = await ops.run({ op: 'filter', inputs: [src.id], params: { where: [{ field: 'n', op: '>=', value: 2 }] } });
    const m = await project.manifest(f.dataset.id);

    const same = await project.verify(f.dataset.id, m);
    assert.equal(same.verdict, 'same', JSON.stringify(same));

    const diff = await project.verify(src.id, m);
    assert.equal(diff.verdict, 'different', '別の記録が「同じ」と判定された');

    /* 指紋が無ければ「同じ」ではない——ここが潰れると、この仕組みは何も保証しない */
    const un = await project.verify(f.dataset.id, { answer: { fingerprint: null } });
    assert.equal(un.verdict, 'unmeasurable', '測れなかったものが「同じ」に潰れている');
  });

  test('#R765 ⑤ 指紋を取らないよう頼めば、そう述べる（黙って null にしない）', async () => {
    const { data, project } = await boot();
    const a = data.add({ title: 'a', features: [pt(0, 0, {})] });
    const m = await project.manifest(a.id, { fingerprint: false });
    assert.equal(m.ok, true);
    assert.equal(m.steps[0].fingerprint, undefined, '頼まれていない指紋の欄が作られている');
    assert.equal(m.gaps.filter((g) => g.gap === 'fingerprint-unavailable').length, 0,
      '取らないと決めたことが「取れなかった」として報告されている');
  });

  /* ══ ⑥ 宣言と実体 ═══════════════════════════════════════════════════════════════════════════ */

  test('#R765 ⑥ manifest の版が公表されていて、文書がこの口を述べている', async () => {
    const { project } = await boot();
    assert.equal(typeof project.manifestVersion, 'number');
    const doc = read('docs/GIS-CORE.md');
    assert.ok(/manifest\(/.test(doc), 'docs/GIS-CORE.md が manifest を述べていない');
    assert.ok(/gaps/.test(doc), '文書が gaps を述べていない（この文書のいちばん重要な欄）');
  });

  test('#R765 ⑥ 知らない id は名前を付けて断る', async () => {
    const { project } = await boot();
    const m = await project.manifest('no-such-thing');
    assert.equal(m.ok, false);
    assert.equal(m.why, 'unknown-dataset');
  });

  ISOLATED.built();
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R783 · the headless runtime   (was tests/r783-headless-runtime-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* ============================================================================
 *  #R783 · 画面が無いところで動く「同じ」GIS と、第三者が検証できる再現性の文書
 * ----------------------------------------------------------------------------
 *  An outside review (§8) read this layer and named what fifteen green test files did not: every
 *  GIS kernel resolves its neighbours from the GLOBAL SCOPE at call time (js/gis-ops.js:70,
 *  js/gis-layers.js:87, js/gis-raster.js:138 …), and the things the layer does not own — the geodesy,
 *  the layer registry, the renderer, the upload door — are supplied by the page. Each module was
 *  individually loadable in Node. THE ASSEMBLY WAS NOT: js/gis-core.js touched `window` on its first
 *  line, so the one file that decides what is mounted and in which order could not be imported
 *  outside a browser at all.
 *
 *  ⚠⚠ THE INVARIANTS BELOW ARE WRITTEN AS THE DEFECT, NOT AS THE FIX
 *  ([[intmap-restate-the-defect-not-the-fix]]). 「makeGisRuntime が ok を返す」 is a sentence about an
 *  implementation, and it would pass over a runtime that mounts a SECOND set of kernels answering
 *  different numbers. What is measured is what a caller loses:
 *
 *    ① a GIS run with no window answers something OTHER than the same run in a browser — measured by
 *       running the same analysis in two separate processes and comparing the ANSWER's fingerprint,
 *       not the shape of the object it came in. ⚠ Both worlds are child processes deliberately: an
 *       in-process 「window を消したつもり」 measures the test's own bookkeeping.
 *    ② a dependency that was not handed over is quietly taken off the scope instead, so the caller
 *       cannot tell which half of their runtime belongs to the page
 *    ③ a refusal leaves a global `window` behind it, so the NEXT call is refused for a reason the
 *       first refusal created (this was real: the first version of resolveScope installed the scope
 *       before checking the dependencies)
 *    ④ asking twice builds two registries under one global, and a dataset id resolves in one of them
 *    ⑤ a manifest's filled fields are read as 「辿れる」: a recipe whose inputs are not in the
 *       document, a body with no fingerprint and a step whose engine stated null are all traceability
 *       holes, and all three used to be reported by no field at all
 * ==========================================================================*/
describe('§ #R783 · the headless runtime', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  const url = (rel) => pathToFileURL(join(ROOT, rel)).href;

  /* ── the geodesy, as an injected dependency ────────────────────────────────────────────────────
     js/geodesy.js is a classic script that writes onto `window`; run into a bare object it yields the
     module itself, which is what a headless caller hands over. ⚠ This is the real one, not a stub: a
     stub geodesy would make ① compare two answers neither of which is the product's. */
  function geodesyModule() {
    const o = {};
    new Function('window', read('js/geodesy.js'))(o);
    return o.IntMapGeodesy;
  }

  /* ══ ① 同じ入力に、同じ答え — window の有る世界と無い世界で ══════════════════════════════════
     One script, two modes, two processes. The analysis is written ONCE: two copies of it would let the
     comparison pass over two different analyses producing two matching numbers by coincidence. */
  const CHILD = `
import { readFileSync } from 'node:fs';
const MODE = process.env.R783_MODE;
const GEO = readFileSync(${JSON.stringify(join(ROOT, 'js/geodesy.js'))}, 'utf8');
const geodesyInto = (o) => { new Function('window', GEO)(o); return o.IntMapGeodesy; };
const out = { mode: MODE };
let gis, scope;

if (MODE === 'browser') {
  /* The page: a window exists before anything is imported, and it carries what the app supplies. */
  const w = {}; globalThis.window = w; geodesyInto(w);
  await import(${JSON.stringify(url('js/gis-core.js'))});
  out.doorOnScope = typeof (w.IntMapModules && w.IntMapModules.gisCore) === 'function';
  gis = w.IntMapModules.gisCore({ lang: 'en' });
  out.scopeInstalled = false;
  scope = w;
} else {
  /* No window, and none is made by the caller: the runtime is handed the scope and the one
     dependency it declares as required. */
  out.windowBeforeImport = typeof globalThis.window;
  const mod = await import(${JSON.stringify(url('js/gis-core.js'))});
  out.windowAfterImport = typeof globalThis.window;
  scope = {};
  const r = mod.makeGisRuntime({ scope: scope, externals: { geodesy: geodesyInto({}) }, host: { lang: 'en' } });
  if (!r.ok) { console.log('##JSON##' + JSON.stringify({ mode: MODE, ok: false, why: r.why, detail: r.detail })); process.exit(0); }
  gis = r.gis;
  out.scopeInstalled = r.scopeInstalled;
  out.externals = r.externals;
  out.doorOnScope = typeof (scope.IntMapModules && scope.IntMapModules.gisCore) === 'function';
}

/* ── THE ANALYSIS. 探す → 確認する → 演算する → 根拠を返す, through gis.flow, which is the same
   surface Atlas is handed (js/gis-core.js flow). */
const FEATS = [
  { type: 'Feature', properties: { name: 'a', n: 1 }, geometry: { type: 'Point', coordinates: [139.7, 35.7] } },
  { type: 'Feature', properties: { name: 'b', n: 4 }, geometry: { type: 'Point', coordinates: [135.5, 34.7] } },
  { type: 'Feature', properties: { name: 'c', n: 9 }, geometry: { type: 'Point', coordinates: [141.3, 43.1] } },
];
gis.data.add({ id: 'src', title: 'fixture', features: FEATS,
  provenance: { kind: 'import', file: 'fixture.geojson', format: 'geojson', readAt: 1700000000000 } });
await gis.geometry.ready();
const cat = gis.flow.find();
out.ops = (cat.ops || []).map((o) => o.id).sort();
out.datasets = (cat.datasets || []).length;
/* 演算は Atlas に渡っている口そのもの（gis.flow.run === atlas.run）。⚠ id は付けない: 付けない
   ときに何と名づけられるかも、世界によって変わってはならない事実のひとつ。 */
const f = await gis.flow.run({ op: 'filter', inputs: ['src'], params: { where: [{ field: 'n', op: '>=', value: 2 }] } });
out.filter = { ok: !!f.ok, why: f.why || null, id: f.ok ? f.dataset.id : null, count: f.ok ? f.dataset.count : null };
const b = await gis.ops.run({ id: 'buf', op: 'buffer', inputs: [f.ok ? f.dataset.id : 'none'], params: { radiusKm: 25 } });
out.buffer = { ok: !!b.ok, why: b.why || null, count: b.ok ? b.dataset.count : null };
const man = await gis.flow.account('buf');
out.manifestOk = !!man.ok;
out.fingerprint = man.answer && man.answer.fingerprint;
out.steps = (man.steps || []).map((s) => ({ id: s.id, origin: s.origin, data: s.trace.data, env: s.trace.environment, same: s.trace.retrieval.sameAnswer }));
out.traceability = man.traceability;
out.gaps = (man.gaps || []).map((g) => g.gap).sort();
out.kernelsLoaded = man.environment.kernelsLoaded;
out.manifestVersion = man.manifestVersion;
/* The same instances the panel and Atlas would reach — asked of the scope, which is where they look. */
out.oneRegistry = scope.IntMapData === gis.data && scope.IntMapGis === gis;
out.ok = true;
console.log('##JSON##' + JSON.stringify(out));
`;

  function runChild(mode) {
    /* ⚠ THE MODE TRAVELS IN THE ENVIRONMENT, NOT IN argv. `node -e <script> browser` does NOT put the
       word at argv[2] — the first version of this read `process.argv[2]`, got `undefined` in BOTH
       runs, and therefore compared the headless world against itself: every assertion below passed
       while the browser path had never been exercised. A comparison whose two sides can silently
       become the same side is the shape .agents/rules/no-ad-hoc-hardcoding.md §5 keeps recording. */
    const stdout = execFileSync(process.execPath, ['--input-type=module', '-e', CHILD], { encoding: 'utf8', cwd: ROOT, env: Object.assign({}, process.env, { R783_MODE: mode }) });
    const line = stdout.split('\n').find((l) => l.indexOf('##JSON##') === 0);
    assert.ok(line, 'child printed no result:\n' + stdout);
    return JSON.parse(line.slice('##JSON##'.length));
  }

  test('#R783 ① window の無い Node で組み立てた GIS が、ブラウザ経路と同じ答えを返す', () => {
    const head = runChild('headless');
    const browser = runChild('browser');
    assert.equal(head.ok, true, 'headless: ' + JSON.stringify(head));
    assert.equal(browser.ok, true, 'browser: ' + JSON.stringify(browser));

    /* The premise of the whole test: the headless process really had no window, and importing
       js/gis-core.js did not make one (that first line was the defect). */
    assert.equal(head.windowBeforeImport, 'undefined');
    assert.equal(head.windowAfterImport, 'undefined');
    /* …and the runtime said out loud that IT supplied the scope. A silent global install is the same
       mechanism with nobody able to see it. */
    assert.equal(head.scopeInstalled, true);
    assert.equal(browser.scopeInstalled, false);

    /* ⚠ THE ANSWER, NOT THE SHAPE. */
    assert.equal(head.buffer.ok, true, 'headless buffer: ' + head.buffer.why);
    assert.equal(browser.buffer.ok, true, 'browser buffer: ' + browser.buffer.why);
    assert.ok(head.fingerprint, 'headless に答えの指紋が無い');
    assert.equal(head.fingerprint, browser.fingerprint,
      '同じ入力・同じレシピなのに、window の有無で答えが違う');
    assert.deepEqual(head.buffer, browser.buffer);
    assert.deepEqual(head.filter, browser.filter);

    /* The catalogue — 探す と 確認する — is the same surface in both worlds, and it is not empty. */
    assert.ok(head.ops.length >= 10, 'op の目録が空に近い: ' + head.ops.length);
    assert.deepEqual(head.ops, browser.ops, 'Atlas に渡る op の目録が世界によって違う');
    assert.deepEqual(head.kernelsLoaded, browser.kernelsLoaded, '載っているカーネルの集合が違う');
    assert.deepEqual(head.traceability, browser.traceability);
    assert.deepEqual(head.gaps, browser.gaps);
    assert.deepEqual(head.steps, browser.steps);

    /* One assembly, reachable through the scope: the panel, Atlas and an outside caller all read these
       globals, so a second set mounted beside them is the defect this file exists to refuse. */
    assert.equal(head.oneRegistry, true, 'headless: 組み立てたカーネルが scope から辿れない');
    assert.equal(browser.oneRegistry, true);
    /* And the shell's door exists in both worlds — the browser gets it at import time, the headless
       assembly gets it on the scope it was given. */
    assert.equal(head.doorOnScope, true);
    assert.equal(browser.doorOnScope, true);
  });

  /* ══ ② 依存が欠けたら、黙って既定へ落ちずに理由を述べて断る ═══════════════════════════════════ */

  async function core() {
    delete globalThis.window;
    return await import('../js/gis-core.js');
  }

  test('#R783 ② required な依存が渡されていなければ、名前と用途を述べて断る', async () => {
    const { makeGisRuntime } = await core();
    const r = makeGisRuntime({ scope: {}, externals: {} });
    assert.equal(r.ok, false, 'geodesy 無しで組み立てが通った');
    assert.equal(r.why, 'dependency-missing');
    const miss = r.detail.missing;
    assert.equal(miss.length, 1, JSON.stringify(miss));
    assert.equal(miss[0].name, 'geodesy');
    assert.equal(miss[0].global, 'IntMapGeodesy');
    /* ⚠ 断り文には、何が出来なくなるかが要る。コードだけの拒否は、読み手に次の手を渡さない。 */
    assert.ok(miss[0].for && miss[0].for.length > 20, '何のための依存かが述べられていない');
  });

  test('#R783 ② 渡していない依存を scope から黙って拾わない', async () => {
    const { makeGisRuntime } = await core();
    /* A scope that happens to carry a layer registry, and a caller who did not hand it over. */
    const scope = { IntMapLayers: { state: () => null } };
    const r = makeGisRuntime({ scope: scope, externals: { geodesy: geodesyModule() } });
    assert.equal(r.ok, false, '注入した組の半分が page のもののまま通った');
    assert.equal(r.why, 'scope-carries-uninjected');
    assert.deepEqual(r.detail.deps.map((d) => d.name), ['layers']);
  });

  test('#R783 ② 断ったときに、グローバルへ window を残さない', async () => {
    const { makeGisRuntime } = await core();
    const first = makeGisRuntime({ scope: {}, externals: {} });
    assert.equal(first.ok, false);
    assert.equal(typeof globalThis.window, 'undefined',
      '拒否が window を据え置いたので、次の呼び出しは自分が作った状態を理由に断られる');
    /* …and the next call, with the dependency supplied, works — which is what a left-behind scope
       would have broken (scope-conflict). */
    const second = makeGisRuntime({ scope: {}, externals: { geodesy: geodesyModule() } });
    assert.equal(second.ok, true, second.why);
    assert.equal(second.scopeInstalled, true);
  });

  test('#R783 ② window が無く scope も渡されなければ、推測せずに断る', async () => {
    const { makeGisRuntime } = await core();
    const r = makeGisRuntime({ host: null });
    assert.equal(r.ok, false);
    assert.equal(r.why, 'scope-missing');
    assert.ok(r.detail.because.length > 20, 'なぜ scope が要るのかが述べられていない');
  });

  /* ══ ③ 二度目は「もう済んでいる」と同じ組を返す ════════════════════════════════════════════════ */

  test('#R783 ③ 同じ scope と同じ host で二度呼んでも、カーネルは 1 組', async () => {
    const { makeGisRuntime } = await core();
    const scope = {}; scope.IntMapGeodesy = geodesyModule();
    const host = { lang: 'en' };
    const a = makeGisRuntime({ scope: scope, host: host });
    assert.equal(a.ok, true, a.why);
    const b = makeGisRuntime({ scope: scope, host: host });
    assert.equal(b.ok, true, b.why);
    assert.equal(b.reused, true, '二度目が「もう済んでいる」と述べていない');
    assert.equal(b.gis, a.gis, '二度目が別の組を作った（同じ global に 2 つの registry）');
    /* A dataset registered through the first must resolve through the second. That is the thing two
       registries break, and it is measured rather than inferred from object identity alone. */
    a.gis.data.add({ id: 'one', title: 'one', features: [] });
    assert.ok(b.gis.data.get('one'), '二度目の組から、一度目に入れた dataset が見えない');
  });

  /* ══ ④ flow は 5 段の実装そのものを指している（写しではない） ═════════════════════════════════ */

  test('#R783 ④ flow の各段は、既にその仕事をしている関数そのもの', async () => {
    const { makeGisRuntime } = await core();
    const scope = {}; scope.IntMapGeodesy = geodesyModule();
    const r = makeGisRuntime({ scope: scope, host: { lang: 'en' } });
    assert.equal(r.ok, true, r.why);
    const gis = r.gis;
    assert.equal(gis.flow.find, gis.atlas.catalogue);
    assert.equal(gis.flow.acquire, gis.atlas.acquire);
    assert.equal(gis.flow.run, gis.atlas.run);
    assert.equal(gis.flow.draw, gis.atlas.draw);
    assert.equal(gis.flow.account, gis.project.manifest);
    assert.equal(gis.flow.verify, gis.project.verify);
  });

  /* ══ ⑤ manifest から、原データと実行環境に到達できる — できないときはそう述べる ═══════════════ */

  async function analysed(extra) {
    const { makeGisRuntime } = await core();
    const scope = {};
    scope.IntMapGeodesy = geodesyModule();
    if (extra) extra(scope);
    const r = makeGisRuntime({ scope: scope, host: { lang: 'en' } });
    assert.equal(r.ok, true, r.why);
    const gis = r.gis;
    gis.data.add({
      id: 'src', title: 'fixture',
      features: [
        { type: 'Feature', properties: { n: 1 }, geometry: { type: 'Point', coordinates: [139.7, 35.7] } },
        { type: 'Feature', properties: { n: 4 }, geometry: { type: 'Point', coordinates: [135.5, 34.7] } },
      ],
      provenance: { kind: 'import', file: 'fixture.geojson', format: 'geojson', readAt: 1700000000000, licence: 'CC0' },
    });
    await gis.geometry.ready();
    const f = await gis.ops.run({ id: 'flt', op: 'filter', inputs: ['src'], params: { where: [{ field: 'n', op: '>=', value: 2 }] } });
    assert.equal(f.ok, true, f.why);
    return { gis: gis, scope: scope };
  }

  test('#R783 ⑤ 演算の段は、この文書だけで再実行できる — 参照どおりに実行すると同じ答えが出る', async () => {
    const { gis } = await analysed();
    const man = await gis.project.manifest('flt');
    assert.equal(man.ok, true, man.why);
    const step = man.steps.find((s) => s.id === 'flt');
    assert.equal(step.trace.data, 'recipe', JSON.stringify(step.trace));
    assert.equal(step.trace.environment, 'recorded', JSON.stringify(step.engineThen));

    /* ⚠ THE REFERENCE IS EXECUTED. A `retrieval` block nobody ever ran would be exactly the
       「欄が埋まっている」 this test refuses: the document says how to get the answer again, so the
       answer is got again, through the call it names, and checked against the fingerprint it states. */
    const re = step.trace.retrieval;
    assert.equal(re.by, 'replay');
    assert.equal(re.call, 'IntMapGisOps.run');
    gis.data.remove('flt');
    const again = await gis.ops.run({ id: 'flt', op: re.args.op, inputs: re.args.inputs, params: re.args.params });
    assert.equal(again.ok, true, again.why);
    const v = await gis.project.verify('flt', man);
    assert.equal(v.verdict, 'same', JSON.stringify(v));
    /* The environment leg of the same question, through the same comparison the load path uses. */
    assert.equal(v.engine.verdict, 'same', JSON.stringify(v.engine));
  });

  test('#R783 ⑤ 取り込みの段は、本体が要ると述べる — 指紋は「持っていること」の代わりにならない', async () => {
    const { gis } = await analysed();
    const man = await gis.project.manifest('flt');
    const src = man.steps.find((s) => s.id === 'src');
    assert.equal(src.trace.data, 'body');
    assert.equal(src.trace.retrieval.inThisDocument, false, '本体がこの文書に入っていると述べている');
    assert.equal(src.trace.retrieval.keptBy, 'IntMapGisProject.save');
    assert.equal(src.trace.retrieval.sameAnswer, 'same-bytes-only');
    assert.equal(src.trace.retrieval.file, 'fixture.geojson');
    assert.ok(src.trace.retrieval.expect, '同じ本体かを確かめる手段が無い');
    /* ⚠ THE PROVENANCE TRAVELS VERBATIM, so a statement this file has no field for is not lost. */
    assert.equal(src.provenance.licence, 'CC0');
    /* 鎖全体としては「本体を渡してもらえば辿れる」——「全部導ける」ではない。 */
    assert.equal(man.traceability.data, 'with-bodies');
    assert.deepEqual(man.traceability.blockedBy, []);
    assert.ok(man.gaps.some((g) => g.gap === 'source-bytes-not-kept'));
  });

  test('#R783 ⑤ 入力がこの文書に無いレシピは、辿れないと述べる（欄は埋まっている）', async () => {
    const { gis } = await analysed();
    /* The reader deleted the input and kept the result — an ordinary state, and the recipe is still
       complete: op, params and the input's id are all there. What is missing is the input itself. */
    gis.data.remove('src');
    const man = await gis.project.manifest('flt');
    const step = man.steps.find((s) => s.id === 'flt');
    assert.equal(step.recipe.inputs[0], 'src', 'レシピの欄は埋まっているはず（そこが要点）');
    assert.equal(step.trace.data, 'recipe-inputs-missing');
    assert.deepEqual(step.trace.dataDetail.missingInputs, ['src']);
    assert.equal(man.traceability.data, 'partial');
    assert.deepEqual(man.traceability.blockedBy.map((b) => [b.step, b.axis]), [['flt', 'data']]);
    assert.ok(man.gaps.some((g) => g.gap === 'recipe-inputs-missing'));
  });

  test('#R783 ⑤ 指紋を取らなかった文書は、本体の同一性を確かめられないと述べる', async () => {
    const { gis } = await analysed();
    const man = await gis.project.manifest('flt', { fingerprint: false });
    const src = man.steps.find((s) => s.id === 'src');
    assert.equal(src.trace.data, 'body-unverifiable');
    assert.equal(src.trace.retrieval.verifyWith, null);
    assert.equal(man.traceability.data, 'partial');
    assert.ok(man.gaps.some((g) => g.gap === 'body-not-verifiable'));
    /* ⚠ AND NOT REPORTED AS THE OTHER HOLE: 'fingerprint-unavailable' is 「取ろうとして取れなかった」,
       which is a different fact from 「取らないよう頼まれた」. */
    assert.ok(!man.gaps.some((g) => g.gap === 'fingerprint-unavailable'));
  });

  test('#R783 ⑤ エンジンの版を述べなかった部品があれば、そう述べる（「同じ」とは言わない）', async () => {
    /* A module that is loaded, is discovered as a kernel by the prefix rule, and states an empty
       version — which engineNow records as null. 「測れなかった」 is not 「同じ」. */
    const { gis } = await analysed((scope) => { scope.IntMapGisSilent = { version: () => '' }; });
    const man = await gis.project.manifest('flt');
    const step = man.steps.find((s) => s.id === 'flt');
    assert.equal(step.engineThen.silent, null, JSON.stringify(step.engineThen));
    assert.equal(step.trace.environment, 'partly-recorded');
    assert.equal(step.trace.retrieval.sameAnswer, 'unknown',
      '版を述べない部品があるのに「エンジンが同じなら同じ答え」と述べている');
    assert.equal(man.traceability.environment, 'partly-recorded');
    assert.ok(man.gaps.some((g) => g.gap === 'engine-partly-recorded'));
  });

  test('#R783 ⑤ 実行環境として、載っているが版を述べない module も名指される', async () => {
    const { gis } = await analysed();
    const man = await gis.project.manifest('flt');
    const env = man.environment;
    assert.ok(env.kernelsLoaded.indexOf('IntMapGisOps') >= 0);
    /* ⚠ engineNow では原理的に見えない集合。null の値と、無い鍵と、「載っているが黙っている」は
       別の事実で、最初の 2 つしか engineNow は持てない。 */
    assert.ok(env.statesNoVersion.indexOf('IntMapGisProject') >= 0, JSON.stringify(env.statesNoVersion));
    assert.equal(env.digest, 'sha256');
    assert.equal(env.recordVersion, gis.project.recordVersion);
    assert.equal(man.manifestVersion, 2, 'trace / environment / traceability が増えたのに版が上がっていない');
  });

  ISOLATED.built();
});
