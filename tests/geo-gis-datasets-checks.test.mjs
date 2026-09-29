/* ============================================================================
 *  GIS · THE DATASET REGISTRY — 列の型・時間・編集・属性表・結合
 * ----------------------------------------------------------------------------
 *  The registry every GIS operation reads from and writes into (js/gis-datasets.js), and what it
 *  promises: a column's type is measured from its values, a time declaration is verified, an edit
 *  re-measures and can be undone, a table with no geometry is a dataset too, and an op's output is the
 *  next op's input. The chains that run a registry end to end (roads → buffer → count → save → reload)
 *  live here because the registry is what they exercise.
 *
 *  ⚠ ONE BLOCK PER ROUND, AND EACH BLOCK IS ISOLATED. The rounds below used to be files of their own,
 *  each in its own process; `isolate()` (tests/helpers/geo-shared.mjs) gives every block back the
 *  globalThis a fresh process had, so no block reads a `window` another one left behind. Test titles
 *  carry the round that wrote them (#R<N>), and each block keeps that round's own account of WHY.
 * ==========================================================================*/

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeGisDatasets } from '../js/gis-datasets.js';
import { ROOT, fakeIDB, installWindow, isolate, read } from './helpers/geo-shared.mjs';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R729 · the GIS core (registry, chain, refusals, project, query)   (was tests/r729-gis-core-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
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
describe('§ #R729 · the GIS core (registry, chain, refusals, project, query)', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

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

  /* ⚠⚠⚠ (#R819) THE POPULATION OF THIS GATE IS NOW DISCOVERED, AND THAT IS THE WHOLE REPAIR.
     Until this round the modules were a list written here — eight names — and the gate was GREEN while
     five codes reachable from this panel had no sentence at all (`coverage-nothing-asked`,
     `coverage-unknown-condition`, `coverage-bad-extent`, `bad-tolerance`, `warp-sink-failed`). Not one
     of them was hidden: js/gis-geometry.js and js/gis-warp.js simply were not being read, and
     「a gate's population is the thing that decides what it cannot see」
     ([[intmap-gate-universe-is-declared-gates]]) is the sentence this repository keeps paying for.
     ⇒ EVERY js/gis-*.js MUST BE IN EXACTLY ONE OF TWO SETS, the shape scripts/gis-kernel-versions.mjs
     settled on in #R752:
       · it is READ — its refusals travel to this panel, so each code it can return needs a sentence;
       · it is named in NOT_READ_BY_THIS_PANEL WITH A STATED REASON — its refusals reach some other
         reader, and that reader's own check measures them there.
     ⚠ THE DEFAULT IS «READ», so there is no third state to forget: adding js/gis-something.js tomorrow
     puts it in the gate that day, and taking it out is a line below with a reason on it. That is the
     difference between an omission and a decision — an absence excuses nothing, and a reason is
     reviewable. ⚠ 「まだ文を書いていない」 is not a reason. If its refusal can reach this panel, it is
     read. */
  const NOT_READ_BY_THIS_PANEL = {
    'js/gis-panel.js': 'this IS the wording side — its own codes are the sentences being measured',
    'js/gis-crs.js': 'its codes surface through js/geo-import.js; #R576 ⑩ in tests/file-import-checks.test.mjs measures them against js/map-ui.js',
    'js/gis-geotiff.js': 'a reader of bytes on the IMPORT path; #R749 ⑪ in tests/shell-gis-upload-raster-checks.test.mjs measures its codes against js/map-ui.js',
    'js/gis-shapefile.js': 'a reader of bytes on the IMPORT path, reached through js/geo-import.js; js/map-ui.js words its codes',
    'js/gis-geopackage.js': 'a reader of bytes on the IMPORT path, reached through js/geo-import.js; js/map-ui.js words its codes',
    'js/gis-atlas.js': 'the Atlas-facing surface — its refusals answer the MODEL in the turn result, not this panel, which never calls it',
    /* ⚠ MEASURED, not assumed (#R819): js/gis-warp.js and js/gis-raster.js treat a refusal from the
       other thread as 「あちらが駄目だった」 and run the same rows here instead (gis-warp.js's
       `retry: { used:false, reason: why }`), so a worker code is a note about the machinery rather
       than an answer to the reader. A cancellation travels as the caller's own `cancelled`. */
    'js/gis-worker.js': 'its refusals are read by the kernel that offered the work, which falls back to this thread and records them as a note — they are not handed to a reader',
    'js/gis-runtime.js': 'it assembles a runtime for a PROGRAM (and for the worker bootstrap); the browser door throws instead of refusing to this panel. ⚠ js/gis-panel.js words `scope-*`, `dependency-missing` and `kernel-not-reachable` anyway (#R783) — a sentence that is never shown costs a line, a missing one costs the answer',
    'js/gis-index.js': 'a prefilter that answers with candidates; it raises no refusal of its own, and a prefilter that cannot narrow simply returns everything',
  };

  /* The refusal-raising helper of a module, FOUND IN THE MODULE rather than spelled here. #R729 taught
     this scan three spellings (`why:`, `fail(`, `mismatchWhy:`) and #R819 measured what that cost: the
     grid kernel raises through `refuse(` and five of its codes had been invisible since #R735, while
     js/gis-geometry.js raises through `NO(` and none of its fourteen were ever seen. A gate that reads
     the spellings it was taught has its reach decided by a list somewhere. A refusal maker is a
     function whose first parameter is `why` and whose body answers `ok: false`. */
  function refusalMakers(src) {
    const names = new Set();
    const re = /(?:function\s+([A-Za-z_$][\w$]*)\s*\(\s*why\b|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\s*)?\(\s*why\b)/g;
    let m;
    while ((m = re.exec(src))) {
      const name = m[1] || m[2];
      if (/ok:\s*false/.test(src.slice(m.index, m.index + 400))) names.add(name);
    }
    return names;
  }
  /* ⚠ A MODULE THAT DECLARES ITS CODES IS BELIEVED OVER THE SCAN (#R738), AND #R819 MADE THAT REAL:
     the declaration REPLACES the scan instead of being added to it. js/gis-units.js is why. Its
     `quantity()` and `aggregation()` answer a caller with `ok:false` codes that js/gis-ops.js reads as
     VERDICTS and reports in its own words — they never arrive here — and the kernel says so where it
     declares `const REFUSALS = ['unit-mismatch']`. Under a union the gate would demand sentences for
     twelve refusals that cannot reach a reader, and 「a sentence for a code that can never arrive can
     never be found wrong」 is the dead spelling js/gis-panel.js warns about. */
  function refusalCodes(src) {
    const declared = /const REFUSALS = (?:Object\.freeze\()?\[([^\]]*)\]/.exec(src);
    if (declared) return new Set(Array.from(declared[1].matchAll(/'([a-z0-9-]+)'/g), (m) => m[1]));
    const s = new Set();
    for (const m of src.matchAll(/\bwhy:\s*'([a-z0-9-]+)'/g)) s.add(m[1]);
    for (const m of src.matchAll(/\bmismatchWhy:\s*'([a-z0-9-]+)'/g)) s.add(m[1]);
    for (const name of refusalMakers(src)) {
      for (const m of src.matchAll(new RegExp('\\b' + name + '\\(\\s*\'([a-z0-9-]+)\'', 'g'))) s.add(m[1]);
    }
    return s;
  }

  test('R729 ④ every refusal code that can reach a reader has a sentence', async () => {
    /* ⚠ BOTH SIDES ARE PARSED, neither is written down here. A list in this file would be a second
       copy of the truth, and the first op to learn a new refusal would leave it stale and green —
       the shape tests/r576-checks ⑩ exists to prevent for js/geo-import.js. */
    const modules = readdirSync(join(ROOT, 'js')).filter((f) => /^gis-.*\.js$/.test(f)).map((f) => 'js/' + f).sort();
    assert.ok(modules.length >= 15, 'the GIS modules were not found at all — the population is measuring nothing (' + modules.length + ')');

    /* An excuse for a file that is not there any more is an excuse nobody reviewed. */
    const stale = Object.keys(NOT_READ_BY_THIS_PANEL).filter((rel) => modules.indexOf(rel) < 0).sort();
    assert.deepEqual(stale, [], 'NOT_READ_BY_THIS_PANEL names files that do not exist: ' + stale.join(', '));

    const read_ = modules.filter((rel) => !Object.prototype.hasOwnProperty.call(NOT_READ_BY_THIS_PANEL, rel));
    const returned = new Set();
    for (const rel of read_) for (const c of refusalCodes(read(rel))) returned.add(c);
    assert.ok(returned.size >= 20, 'the codes were not found at all — the scan is measuring nothing (' + returned.size + ')');
    /* ⚠ THE TWO THIS ROUND ADDED ARE ASSERTED BY NAME — not as a second list of members, but because
       they are the two whose absence the gate could not report while it was green. js/gis-ops.js hands
       both kernels' refusals back VERBATIM (`coverage` returns js/gis-geometry.js's answer unchanged,
       `resample` and `mosaic` return js/gis-warp.js's), which is why their vocabulary arrives here. */
    for (const c of ['coverage-nothing-asked', 'warp-sink-failed']) {
      assert.ok(returned.has(c), c + ' is not in the population — the discovery stopped reading the kernel that returns it');
    }

    /* ⚠ THE WORDED SIDE IS EVALUATED, NOT SCANNED. It used to collect every quoted token in
       js/gis-panel.js — so a code that merely APPEARED there (in a comment, in a list, in a row placed
       below the fallback return) counted as worded while the reader got the fallback. The panel is
       built and asked, in both languages IntMap writes itself (CONSTITUTION §7), and a sentence counts
       only if it is not the fallback — the fallback carries the code, so a code in its own sentence is
       a code nobody wrote a sentence for. (The POPULATION is still discovered from the sources above:
       that half is a scan by design, because it has to see codes no run of this file happens to raise.) */
    const w = installWindow();
    const said = [];
    w.IntMapLang = { t: (which, en, jp) => { said.push([which, en, jp]); return which === 'jp' ? jp : en; }, locale: () => 'en-US' };
    const { makeGisPanel } = await import('../js/gis-panel.js');
    const missing = new Set();
    for (const which of ['en', 'jp']) {
      const panel = makeGisPanel({ lang: which });
      assert.ok(panel.reasonText('r729-not-a-real-code').includes('r729-not-a-real-code'), 'the fallback no longer carries the code — this check could not tell a sentence from it');
      for (const c of returned) {
        /* asked with no detail: whether a code HAS a sentence cannot depend on what one module puts in its detail */
        const text = panel.reasonText(c, {});
        if (!(typeof text === 'string' && text.length && text.indexOf(c) < 0)) missing.add(c + ' (' + which + ')');
      }
    }
    assert.deepEqual(Array.from(missing).sort(), [], 'refusal codes with no sentence in js/gis-panel.js: ' + Array.from(missing).sort().join(', '));
    for (const [, en, jp] of said) assert.ok(typeof jp === 'string' && jp.length > 0, 'a refusal sentence has no Japanese: ' + en);
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

  /* ══ ⑥ クエリはレジストリを「問い合わせの瞬間に」読む ═════════════════════════════════════ */

  test('R729 ⑥ the cross-dataset query reads the registry at query time, in one place', () => {
    /* 綴りのまま: 対象の js/atlas-query.js は遅延読み込みの SQL エンジン（DuckDB-Wasm）の前段で、Node では組み立たない。 */
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
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（handleFiles／addFC は js/map-ui.js の取り込み UI）。 */
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

  ISOLATED.built();
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R735 · grids, time, the spatial index   (was tests/r735-gis-raster-time-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* ============================================================================
 *  #R735 · 数値ラスター・時刻の契約・空間索引・中止できる処理
 * ----------------------------------------------------------------------------
 *  What this round claimed, and therefore what has to stay true:
 *
 *    ① a zero-padded cell is a code, not a number — so "01100" and "1100" are not the same row
 *    ② a time declaration is VERIFIED against the data, and a misaligned track axis is refused
 *    ③ a GPX track keeps the time and the height of every fix, aligned with its positions
 *    ④ the registry holds a second payload (a grid), and every vector op refuses one by name
 *    ⑤ the grid ops answer with measured numbers: area-weighted zonal, voids, class areas, a − b
 *    ⑥ the spatial index never drops a pair — measured against the walk it replaced
 *    ⑦ a long step can be stopped, and says where it got to
 *    ⑧ a time window CUTS a trajectory, and the parallel arrays are cut with it
 *    ⑨ clear() does not put the id generator back behind ids that are about to be restored
 *    ⑩ the whole of the reader's job: roads → 500 m → facilities per ward → save → reload → 1 km
 *    ⑪ the layer bridge and the spatial clause are REACHABLE — an export nothing calls is not a feature
 *
 *  ⚠ ① ② ⑥ ⑦ ⑨ ARE DEFECTS THAT WERE MEASURED IN THIS REPOSITORY, not hypotheticals: the padded
 *  code column typed as a number and compared numerically, the track axis that no path verified, the
 *  O(n·m) walk the file itself called 「not a spatial index」, the synchronous loop no signal could
 *  interrupt, and `seq = 0` sitting one line under the comment saying the counter never goes down.
 *
 *  ⚠ ⑤ AND ⑥ COMPARE AGAINST NUMBERS DERIVED FROM GEOMETRY OR FROM THE OTHER CODE PATH, never
 *  against a number this file once saw. A recorded output passes for whatever the code prints
 *  tomorrow; the area of a lat/lon cell and the answer of an exhaustive walk do not move.
 * ==========================================================================*/
describe('§ #R735 · grids, time, the spatial index', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  async function boot() {
    const w = installWindow();
    const { makeGisDatasets } = await import('../js/gis-datasets.js');
    const { makeGisGeometry } = await import('../js/gis-geometry.js');
    const { makeGisRaster } = await import('../js/gis-raster.js');
    const { makeGisIndex } = await import('../js/gis-index.js');
    const { makeGisOps } = await import('../js/gis-ops.js');
    const { makeGisProject } = await import('../js/gis-project.js');
    const data = makeGisDatasets();
    const geometry = makeGisGeometry();
    const raster = makeGisRaster();
    const index = makeGisIndex();
    const ops = makeGisOps();
    const project = makeGisProject();
    w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisRaster = raster;
    w.IntMapGisIndex = index; w.IntMapGisOps = ops; w.IntMapGisProject = project;
    await geometry.ready();
    return { w, data, geometry, raster, index, ops, project };
  }

  const R_EARTH_KM = 6371.0088;
  const feat = (g, p) => ({ type: 'Feature', properties: p || {}, geometry: g });
  const pt = (lng, lat, p) => feat({ type: 'Point', coordinates: [lng, lat] }, p);
  const line = (cs, p) => feat({ type: 'LineString', coordinates: cs }, p);
  const box = (w, s, e, n) => [[w, s], [e, s], [e, n], [w, n], [w, s]];
  const poly = (rings, p) => feat({ type: 'Polygon', coordinates: rings }, p);

  /* The exact area of one lat/lon cell on the sphere: R²·Δλ·(sin φn − sin φs). Nothing here compares
     against a number that was printed once. */
  const cellKm2 = (dLngDeg, sDeg, nDeg) =>
    R_EARTH_KM * R_EARTH_KM * (dLngDeg * Math.PI / 180) * (Math.sin(nDeg * Math.PI / 180) - Math.sin(sDeg * Math.PI / 180));

  /* A grid of `vals` (row-major, row 0 is the NORTH row) over one degree cells from (west, north). */
  function gridSpec(vals, w, h, west, north, step, band) {
    return {
      kind: 'raster', width: w, height: h,
      grid: { west: west, north: north, pixelLng: step, pixelLat: step },
      bands: [band || { name: 'v', unit: null, nodata: null }],
      read: () => Float64Array.from(vals),
    };
  }

  /* ══ ① 先頭ゼロのセルは符号であって数ではない ═══════════════════════════════════════════════ */

  test('R735 ① a zero-padded code column is text, and does not compare equal to the number', async () => {
    const { data, ops } = await boot();

    assert.equal(data.asNumber('01100'), null, '"01100" was still read as a number');
    assert.equal(data.asNumber('00'), null);
    /* ⚠ THE ZERO THAT MEANS SOMETHING SURVIVES. A rule that refused 0, 0.5 or 0e3 would have taken
       arithmetic away from every column that legitimately starts with a zero. */
    assert.equal(data.asNumber('0'), 0);
    assert.equal(data.asNumber('0.5'), 0.5);
    assert.equal(data.asNumber('-0.25'), -0.25);
    assert.equal(data.asNumber('0e3'), 0);

    const ds = data.add({ title: 'codes', features: [pt(0, 0, { cd: '01100', n: '5' }), pt(1, 1, { cd: '01101', n: '6' })] });
    const cd = ds.fields.find((f) => f.name === 'cd');
    assert.equal(cd.type, 'text', 'the code column typed as a number again');
    assert.equal(cd.padded, 2, 'the evidence for the verdict was not carried');
    assert.equal(ds.fields.find((f) => f.name === 'n').type, 'number', 'an ordinary number column stopped being one');

    /* The defect that mattered: the comparison. `"01100" == 1100` was TRUE, because both sides went
       through asNumber. A join or a filter on a municipality code hit the wrong row. */
    const r = await ops.run({ op: 'filter', inputs: [ds.id], params: { where: [{ field: 'cd', op: '==', value: '1100' }] } });
    assert.equal(r.ok, true);
    assert.equal(r.dataset.count, 0, '"01100" still matched "1100"');
    const r2 = await ops.run({ op: 'filter', inputs: [ds.id], params: { where: [{ field: 'cd', op: '==', value: '01100' }] } });
    assert.equal(r2.dataset.count, 1, 'the code no longer matches itself');
  });

  /* ══ ② 時刻の宣言は検証される ═══════════════════════════════════════════════════════════════ */

  test('R735 ② a time declaration is verified, and one that does not hold is refused by name', async () => {
    const { data } = await boot();

    const inst = data.add({ title: 'i', features: [pt(0, 0, { y: '1889' }), pt(1, 1, { y: '1890-06' })], time: { kind: 'instant', field: 'y' } });
    assert.equal(inst.time.kind, 'instant');
    assert.equal(inst.timeRefused, null);
    /* ⚠ A BARE YEAR IS THE WHOLE YEAR. asDate would answer 1889-01-01T00:00:00Z — one millisecond —
       and a window of 「1889 年」 would then miss almost everything stamped 1889. */
    const span = data.timeSpan(inst, inst.features()[0]);
    assert.equal(new Date(span.start).toISOString().slice(0, 10), '1889-01-01');
    assert.equal(new Date(span.end).toISOString().slice(0, 10), '1889-12-31');

    /* ⚠ NOT Date.UTC: a year below 100 must not be moved into the twentieth century (#R602). */
    const early = data.momentOf(5);
    assert.equal(new Date(early.start).getUTCFullYear(), 5, 'the year 5 was read as 1905');
    assert.ok(data.momentOf(-200).start < data.momentOf(1).start, 'a BC year is not expressible');

    const missing = data.add({ title: 'm', features: [pt(0, 0, { a: 1 })], time: { kind: 'instant', field: 'when' } });
    assert.equal(missing.time, null);
    assert.equal(missing.timeRefused.why, 'time-field-missing');

    const unreadable = data.add({ title: 'u', features: [pt(0, 0, { y: '明治22年' })], time: { kind: 'instant', field: 'y' } });
    assert.equal(unreadable.time, null);
    assert.equal(unreadable.timeRefused.why, 'time-unreadable');

    /* The one that cannot be taken on trust: a parallel array is a time axis only while its length is
       the number of positions. js/geodesy.js sanitizeFeatures can drop a position. */
    const ok = data.add({
      title: 't', time: { kind: 'track', timesField: 'coordTimes' },
      features: [line([[0, 0], [1, 1], [2, 2]], { coordTimes: ['2020-01-01', '2020-01-02', '2020-01-03'] })],
    });
    assert.equal(ok.time.kind, 'track');
    const bad = data.add({
      title: 'b', time: { kind: 'track', timesField: 'coordTimes' },
      features: [line([[0, 0], [1, 1], [2, 2]], { coordTimes: ['2020-01-01', '2020-01-02'] })],
    });
    assert.equal(bad.time, null, 'a misaligned axis was accepted');
    assert.equal(bad.timeRefused.why, 'time-track-misaligned');
    assert.equal(bad.timeRefused.detail.positions, 3);
    assert.equal(bad.timeRefused.detail.times, 2);

    /* A grid has no features, so only the whole-dataset shape can apply to one. */
    const ras = data.add(Object.assign(gridSpec([1, 2, 3, 4], 2, 2, 0, 2, 1), { title: 'g', time: { kind: 'instant', field: 'y' } }));
    assert.equal(ras.time, null);
    assert.equal(ras.timeRefused.why, 'time-kind-not-for-raster');
  });

  /* ══ ③ GPX の点ごとの時刻と標高 ═════════════════════════════════════════════════════════════ */

  test('R735 ③ a GPX track keeps every fix\'s time and height, and the arrays stay aligned', () => {
    /* 綴りのまま: js/geo-import.js の GPX/KML は DOMParser で読むが、Node にも依存にも XML パーサが無い（実測: node_modules に無い）。 */
    /* ⚠ THE DECODER IS READ, NOT RUN: js/geo-import.js needs a DOMParser and a File. What is measured
       is the thing the old code did wrong — the position was pushed and the time was not — plus the
       claim that the axis is declared to the registry rather than guessed downstream. */
    const src = read('js/geo-import.js');
    const gpx = src.slice(src.indexOf('function decodeGPX'), src.indexOf("function fc(features)"));
    assert.ok(/const pts = \[\], times = \[\], eles = \[\]/.test(gpx), 'the per-fix arrays are gone');
    /* The position and its timestamp are pushed in the SAME branch — that is what keeps them aligned
       through a repair that drops positions. */
    const branch = gpx.slice(gpx.indexOf('const c = at(k);'), gpx.indexOf('const owner ='));
    assert.ok(/pts\.push\(c\)/.test(branch) && /times\.push\(/.test(branch) && /eles\.push\(/.test(branch),
      'the time or the height is pushed outside the branch that accepted the position');
    assert.ok(/if \(!c\) continue;/.test(branch), 'a refused position no longer skips its timestamp');
    assert.ok(/time: time/.test(gpx) && /kind: 'track'/.test(gpx), 'the decoder no longer declares the axis it found');

    /* ⚠ HEIGHT IS BESIDE THE COORDINATES, NOT INSIDE THEM, and this is why: the shared repair every
       import lands in rebuilds each position as a PAIR. A third ordinate would be silently dropped. */
    const sanitize = read('js/geodesy.js');
    assert.ok(/fixPos=p=>\(Array\.isArray\(p\)&&isFinite\(p\[0\]\)&&isFinite\(p\[1\]\)\)\?\[p\[0\],/.test(sanitize),
      'sanitizeFeatures no longer rebuilds positions as pairs — re-check where elevation should live');

    /* KML's gx:Track is the same thing in another format, and it walked past its <when> elements. */
    const kml = src.slice(src.indexOf("if (name === 'track')"), src.indexOf("if (name === 'multigeometry'"));
    assert.ok(/localName\(k\) === 'when'/.test(kml), 'gx:Track still ignores the time of each fix');
    assert.ok(/TRACK_TIMES/.test(kml) && /TRACK_ELE/.test(kml), 'gx:Track carries its axis under a different spelling');

    /* One spelling, named once: two would be a track whose times nothing can find. */
    assert.equal((src.match(/'coordTimes'/g) || []).length, 1, 'coordTimes is spelt in more than one place');
  });

  /* ══ ④ レジストリの第2の payload ════════════════════════════════════════════════════════════ */

  test('R735 ④ a grid is a dataset, and the vector ops refuse one by name', async () => {
    const { data, ops } = await boot();

    const g = data.add(gridSpec([1, 2, 3, 4], 2, 2, 0, 2, 1, { name: 'elev', unit: 'm', nodata: -9999 }));
    assert.equal(g.kind, 'raster');
    assert.equal(g.count, 4);
    /* The bands ARE the columns, which is what makes 「どのバンドで」 the same control as 「どの列で」. */
    assert.deepEqual(g.fields.map((f) => f.name), ['elev']);
    assert.equal(g.fields[0].type, 'number');
    /* describe() is what the panel and the save file read: the payload doors are not in it. */
    const d = data.describe(g.id);
    assert.equal(d.read, undefined);
    assert.equal(d.raster, undefined);
    assert.equal(d.width, 2);

    /* A grid that is not a grid is refused at the last place that can still say no. */
    for (const broken of [{ width: 0 }, { height: 1.5 }, { grid: { west: 0, north: 2, pixelLng: 0, pixelLat: 1 } }, { read: null }, { bands: [] }]) {
      const spec = Object.assign(gridSpec([1], 1, 1, 0, 1, 1), broken);
      assert.throws(() => data.add(spec), /raster/, 'a broken grid was registered: ' + JSON.stringify(Object.keys(broken)));
    }

    /* ⚠ EVERY OP WRITTEN BEFORE GRIDS EXISTED REFUSES ONE, and it refuses it for the right reason.
       Without `kinds` they would have walked a features() that is not there. */
    const pts = data.add({ title: 'p', features: [pt(0.5, 1.5, {})] });
    for (const op of ['filter', 'buffer', 'dissolve']) {
      const r = await ops.run({ op: op, inputs: [g.id], params: { radiusKm: 1, where: [] } });
      assert.equal(r.ok, false);
      assert.equal(r.why, 'input-kind', op + ' did not refuse a grid by name');
      assert.equal(r.detail.expected, 'vector');
    }
    /* And the grid ops refuse a vector in the slot that needs a grid. */
    const r2 = await ops.run({ op: 'zonal', inputs: [pts.id, pts.id], params: { stat: 'mean' } });
    assert.equal(r2.why, 'input-kind');
    assert.equal(r2.detail.input, 1);
  });

  /* ══ ⑤ 格子の算術は測った数で確かめる ═══════════════════════════════════════════════════════ */

  test('R735 ⑤ the grid ops answer measured numbers: weighted zonal, voids, classes, a − b', async () => {
    const { data, ops, raster } = await boot();

    /* Two rows of 30°, 30–60N and 0–30N, one cell each. ⚠ THE BANDS ARE THAT TALL ON PURPOSE: adjacent
       one-degree rows differ in area by about 2 %, and a weighted mean that close to the flat mean would
       pass whether the weighting were there or not. These two differ by 27 %, so the test can tell. */
    const g = data.add(gridSpec([100, 0], 1, 2, 0, 60, 30, { name: 'v', unit: null, nodata: null }));
    /* ⚠ THE ZONE COVERS THE WHOLE COLUMN. gridSpec uses one step for both axes, so this grid's single
       column spans 0–30E and its pixel centres are at 15E: a zone 1° wide would contain no pixel centre
       at all, and the op would honestly answer 0 — measuring the fixture rather than the arithmetic. */
    const zone = data.add({ title: 'z', features: [poly([box(0, 0, 30, 60)], { name: 'both' })] });
    const rz = await ops.run({ op: 'zonal', inputs: [zone.id, g.id], params: { stat: 'mean' } });
    assert.equal(rz.ok, true, 'zonal refused: ' + rz.why);
    const row = rz.dataset.features()[0].properties;
    const aN = cellKm2(30, 30, 60), aS = cellKm2(30, 0, 30);
    const want = (100 * aN + 0 * aS) / (aN + aS);
    assert.ok(Math.abs(row.mean_v - want) < 1e-6, 'the zonal mean is not area-weighted (' + row.mean_v + ' vs ' + want + ')');
    assert.ok(Math.abs(row.mean_v - 50) > 5, 'the weighted mean is indistinguishable from the flat mean — the test measures nothing');
    assert.equal(row._pixels, 2);
    assert.equal(row._pixelsNodata, 0);
    /* ⚠ COVERAGE IS ON THE ROW. `_gridAreaKm2` is the zone as the grid resolves it and `_valueAreaKm2`
       the part that carried a value: the two being different IS 「一部だけ」, and reporting one of them
       is the shape the memory note 「被覆を件数で報告すると『一部だけ』が見えない」 records. */
    assert.ok(Math.abs(row._valueAreaKm2 - (aN + aS)) / (aN + aS) < 1e-9);

    /* A void is not a zero. */
    const holes = data.add(gridSpec([100, NaN], 1, 2, 0, 60, 30));
    const rh = await ops.run({ op: 'zonal', inputs: [zone.id, holes.id], params: { stat: 'mean' } });
    const hrow = rh.dataset.features()[0].properties;
    assert.equal(hrow.mean_v, 100, 'a void was averaged in as a number');
    assert.equal(hrow._pixelsNodata, 1);
    assert.ok(hrow._valueAreaKm2 < hrow._gridAreaKm2, 'the void did not reduce the area that carried a value');

    /* Areas per class need codes, and a grid of measurements is refused rather than rounded. */
    const codes = data.add(gridSpec([1, 2], 1, 2, 0, 60, 30));
    const rc = await ops.run({ op: 'zonal', inputs: [zone.id, codes.id], params: { stat: 'classes' } });
    const cls = rc.dataset.features()[0].properties.classes_v;
    assert.ok(Math.abs(cls['1'] - aN) / aN < 1e-9, 'the class area is not the pixel area');
    const frac = data.add(gridSpec([1.5, 2.5], 1, 2, 0, 60, 30));
    const rf = await ops.run({ op: 'zonal', inputs: [zone.id, frac.id], params: { stat: 'classes' } });
    assert.equal(rf.ok, false);
    assert.equal(rf.why, 'values-not-integer');

    /* 地点値の取得: three answers, three different truths. */
    const pts = data.add({ title: 'p', features: [pt(0.5, 45, { id: 'in' }), pt(50, 50, { id: 'off' })] });
    const rs = await ops.run({ op: 'sample', inputs: [pts.id, holes.id], params: { band: 'v' } });
    assert.equal(rs.ok, true, 'sample refused: ' + rs.why);
    const got = rs.dataset.features().map((f) => f.properties);
    assert.equal(got[0].v, 100);
    assert.equal(got[1].v, null);
    assert.equal(got[1]._sampleOutside, true, 'a point off the grid is indistinguishable from a void');
    assert.equal(rs.stats.outside, 1);

    /* 条件による抽出 and 時期同士の差分, and the output of one is the input of the next. */
    const rm = await ops.run({ op: 'rasterMask', inputs: [g.id], params: { op: '>=', value: '50' } });
    assert.equal(rm.ok, true, 'rasterMask refused: ' + rm.why);
    assert.equal(rm.dataset.kind, 'raster');
    assert.equal(rm.stats.kept, 1);
    assert.equal(rm.stats.dropped, 1);
    const after = await ops.run({ op: 'zonal', inputs: [zone.id, rm.dataset.id], params: { stat: 'count' } });
    assert.equal(after.dataset.features()[0].properties.count_v, 1, 'the masked grid is not usable as an input');

    const other = data.add(gridSpec([40, 0], 1, 2, 0, 60, 30));
    const rd = await ops.run({ op: 'rasterDiff', inputs: [g.id, other.id], params: {} });
    assert.equal(rd.ok, true, 'rasterDiff refused: ' + rd.why);
    assert.equal(rd.dataset.read(0)[0], 60);
    /* ⚠ TWO GRIDS THAT ARE NOT THE SAME GRID ARE NOT RESAMPLED IN SILENCE. */
    const shifted = data.add(gridSpec([1, 2], 1, 2, 0.5, 60, 30));
    const rbad = await ops.run({ op: 'rasterDiff', inputs: [g.id, shifted.id], params: {} });
    assert.equal(rbad.ok, false);
    assert.equal(rbad.why, 'grid-mismatch');

    /* One cell of the whole sphere is the sphere: the kernel's area is the closed form, not a plane. */
    const whole = raster.pixelAreaKm2({ width: 1, height: 1, bands: [{}], grid: { west: -180, north: 90, pixelLng: 360, pixelLat: 180 }, read: () => [0] }, 0);
    assert.equal(whole.ok, true);
    assert.ok(Math.abs(whole.km2 - 4 * Math.PI * R_EARTH_KM * R_EARTH_KM) / whole.km2 < 1e-9, 'the pixel area is not spherical');
  });

  /* ══ ⑥ 索引は取りこぼさない ═════════════════════════════════════════════════════════════════ */

  test('R735 ⑥ the spatial index hands the predicate the same set the exhaustive walk did', async () => {
    const { data, ops, index, w } = await boot();

    /* A deterministic scatter, plus the two shapes that break a naive grid: something that crosses the
       antimeridian and something that covers the world. */
    let seed = 20260915;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const members = [];
    for (let i = 0; i < 600; i++) {
      const x = -180 + rnd() * 360, y = -80 + rnd() * 160;
      members.push(pt(x, y, { v: 1 }));
    }
    members.push(line([[170, 10], [-170, 12]], { v: 1 }));
    /* ⚠ ONE MEMBER ON EACH SIDE OF THE SEAM, and a zone below whose box reaches across it the other
       way round: a grid that reads a crossing box as one range keeps the near half and drops the far
       one, and this is the member that half holds. Without it the seam is in the fixture and not in the
       answer, so a dropped range would be invisible. */
    members.push(pt(-178, 10, { v: 1 }));
    members.push(pt(178, 10, { v: 1 }));
    const zones = [];
    for (let i = 0; i < 24; i++) {
      const x = -180 + i * 15, y = -60 + (i % 5) * 20;
      zones.push(poly([box(x, y, x + 14, y + 15)], { id: 'z' + i }));
    }
    zones.push(poly([box(175, 5, 185, 15)], { id: 'seam' }));
    zones.push(poly([box(-185, 5, -175, 15)], { id: 'seam-west' }));

    const mDs = data.add({ title: 'm', features: members });
    const zDs = data.add({ title: 'z', features: zones });

    const withIndex = await ops.run({ op: 'aggregate', inputs: [zDs.id, mDs.id], params: { stat: 'count' } });
    assert.equal(withIndex.ok, true, 'aggregate refused: ' + withIndex.why);

    /* ⚠ THE SAME RUN WITH THE INDEX TAKEN AWAY. That is the only comparison that can catch a dropped
       pair: a count is not wrong-looking, it is just smaller. */
    const kernel = w.IntMapGisIndex;
    w.IntMapGisIndex = null;
    const without = await ops.run({ op: 'aggregate', inputs: [zDs.id, mDs.id], params: { stat: 'count' } });
    w.IntMapGisIndex = kernel;
    assert.equal(without.ok, true);

    const a = withIndex.dataset.features().map((f) => f.properties.count);
    const b = without.dataset.features().map((f) => f.properties.count);
    assert.deepEqual(a, b, 'the indexed aggregate and the exhaustive one disagree — the index drops pairs');
    assert.ok(a.reduce((s, n) => s + n, 0) > 0, 'nothing was counted either way — the test measures nothing');

    /* And the same for the predicate that measures a distance, where the index is asked with a pad. */
    const withIx = await ops.run({ op: 'relate', inputs: [mDs.id, zDs.id], params: { predicate: 'nearer-than', maxKm: 400 } });
    w.IntMapGisIndex = null;
    const withoutIx = await ops.run({ op: 'relate', inputs: [mDs.id, zDs.id], params: { predicate: 'nearer-than', maxKm: 400 } });
    w.IntMapGisIndex = kernel;
    assert.equal(withIx.dataset.count, withoutIx.dataset.count, 'the padded query drops pairs');
    assert.ok(withIx.dataset.count > 0);

    /* ⚠ AND THE SAME FOR clip, WHICH THE FILE'S OWN NOTE ALSO NAMED. A subject clipped by 25 windows
       is the same loop, and an index that drops a window silently returns a shape that was never cut. */
    const clipped = await ops.run({ op: 'clip', inputs: [mDs.id, zDs.id], params: {} });
    w.IntMapGisIndex = null;
    const clippedFlat = await ops.run({ op: 'clip', inputs: [mDs.id, zDs.id], params: {} });
    w.IntMapGisIndex = kernel;
    assert.equal(clipped.ok, true, 'clip refused: ' + clipped.why);
    assert.equal(clipped.dataset.count, clippedFlat.dataset.count, 'the indexed clip keeps a different number of pieces');
    assert.ok(clipped.dataset.count > 0);

    /* The index itself reports whether it is one: everything in one bucket behaves like an index from
       the outside, only slower. */
    const ix = index.build(members.map((f) => ({ bbox: [f.geometry.coordinates[0] || 0, f.geometry.coordinates[1] || 0, f.geometry.coordinates[0] || 0, f.geometry.coordinates[1] || 0] })));
    const st = index.stats(ix);
    assert.ok(st.cells > 1, 'every item landed in one cell');
    assert.ok(st.maxPerCell < members.length, 'one cell holds everything');
  });

  /* ══ ⑦ 中止できる ══════════════════════════════════════════════════════════════════════════ */

  test('R735 ⑦ a long step can be stopped, and it says where it got to', async () => {
    const { data, ops } = await boot();

    const zones = [], members = [];
    for (let i = 0; i < 400; i++) { const x = -170 + (i % 340); zones.push(poly([box(x, 0, x + 0.5, 0.5)], { i: i })); }
    for (let i = 0; i < 400; i++) { members.push(pt(-170 + (i % 340) + 0.25, 0.25, { v: 1 })); }
    const zDs = data.add({ title: 'z', features: zones });
    const mDs = data.add({ title: 'm', features: members });

    /* ⚠ ABORTED BEFORE IT STARTS IS THE CASE A SYNCHRONOUS LOOP COULD NOT ANSWER EITHER. The old code
       would have completed the whole run and registered the result. */
    const ac = new AbortController();
    ac.abort();
    const stopped = await ops.run({ op: 'aggregate', inputs: [zDs.id, mDs.id], params: { stat: 'count' } }, { signal: ac.signal });
    assert.equal(stopped.ok, false);
    assert.equal(stopped.why, 'cancelled');
    assert.equal(stopped.detail.total, 400);
    /* Nothing was registered: a cancelled step must not leave half an answer behind. */
    assert.equal(data.list().length, 2, 'a cancelled run registered a dataset');

    /* And a run that is stopped PART WAY. The signal is read at the yield, so this needs a real one. */
    const ac2 = new AbortController();
    let seen = 0;
    const part = await ops.run({ op: 'relate', inputs: [mDs.id, zDs.id], params: { predicate: 'intersects' } }, {
      signal: ac2.signal,
      onProgress: (p) => { seen = p.done; if (p.done > 0) ac2.abort(); },
    });
    if (part.ok === false) {
      assert.equal(part.why, 'cancelled');
      assert.ok(part.detail.done > 0, 'it stopped before doing anything, so progress was never reported');
    }
    assert.ok(seen >= 0);

    /* An uninterrupted run still answers, and progress is a report rather than a requirement. */
    const done = await ops.run({ op: 'aggregate', inputs: [zDs.id, mDs.id], params: { stat: 'count' } });
    assert.equal(done.ok, true);
    assert.equal(done.dataset.count, 400);
  });

  /* ══ ⑧ 時間の窓は軌跡を切る ═════════════════════════════════════════════════════════════════ */

  test('R735 ⑧ a time window cuts a trajectory, and the parallel arrays are cut with it', async () => {
    const { data, ops } = await boot();

    const trace = data.add({
      title: 'ride', time: { kind: 'track', timesField: 'coordTimes', elevationField: 'coordEle' },
      features: [line([[0, 0], [1, 0], [2, 0], [3, 0]], {
        coordTimes: ['2020-05-01T16:30:00Z', '2020-05-01T17:10:00Z', '2020-05-01T17:50:00Z', '2020-05-01T18:30:00Z'],
        coordEle: [10, 20, 30, 40],
      })],
    });
    assert.equal(trace.time.kind, 'track');

    const r = await ops.run({ op: 'timeWindow', inputs: [trace.id], params: { from: '2020-05-01T17:00:00Z', to: '2020-05-01T18:00:00Z' } });
    assert.equal(r.ok, true, 'timeWindow refused: ' + r.why);
    const f = r.dataset.features()[0];
    assert.equal(f.geometry.coordinates.length, 2, 'the whole ride came back instead of the hour asked for');
    assert.deepEqual(f.geometry.coordinates, [[1, 0], [2, 0]]);
    /* ⚠ THE ARRAYS WERE CUT WITH IT. A line whose positions were filtered while its times were not is a
       trace where every timestamp sits on the wrong fix — and the registry measures exactly that, so a
       failure here shows up as a REFUSED declaration on the output. */
    assert.equal(f.properties.coordTimes.length, 2);
    assert.deepEqual(f.properties.coordEle, [20, 30]);
    assert.equal(r.dataset.time.kind, 'track', 'the output lost its axis: ' + JSON.stringify(r.dataset.timeRefused));
    assert.equal(r.dataset.timeRefused, null);

    /* The attribute shapes select rather than cut, and an undated row is dropped and COUNTED. */
    const events = data.add({
      title: 'e', time: { kind: 'interval', startField: 'from', endField: 'to' },
      features: [
        poly([box(0, 0, 1, 1)], { name: 'a', from: '1870', to: '1890' }),
        poly([box(2, 2, 3, 3)], { name: 'b', from: '1900', to: '1910' }),
        poly([box(4, 4, 5, 5)], { name: 'c' }),
      ],
    });
    const rv = await ops.run({ op: 'timeWindow', inputs: [events.id], params: { from: '1889', to: '1889' } });
    assert.equal(rv.dataset.count, 1);
    assert.equal(rv.dataset.features()[0].properties.name, 'a');
    assert.equal(rv.stats.undated, 1, 'a row nobody dated was kept or lost without being counted');

    /* `within` is a different question from `overlaps`, and both are asked of the same axis. */
    const rw = await ops.run({ op: 'timeWindow', inputs: [events.id], params: { from: '1860', to: '1895', mode: 'within' } });
    assert.equal(rw.dataset.count, 1);
    const rw2 = await ops.run({ op: 'timeWindow', inputs: [events.id], params: { from: '1880', to: '1885', mode: 'within' } });
    assert.equal(rw2.dataset.count, 0, 'a span that merely overlaps was reported as contained');

    /* A dataset that never declared an axis is refused BY NAME, not filtered on a guess. */
    const plain = data.add({ title: 'p', features: [pt(0, 0, { y: '1889' })] });
    const rp = await ops.run({ op: 'timeWindow', inputs: [plain.id], params: { from: '1889' } });
    assert.equal(rp.ok, false);
    assert.equal(rp.why, 'time-not-declared');

    /* ⚠ A BUFFER OF A TRACE IS A POLYGON, and the 4,000 timestamps describe fixes it no longer has. */
    const rb = await ops.run({ op: 'buffer', inputs: [trace.id], params: { radiusKm: 5 } });
    assert.equal(rb.ok, true, 'buffer refused: ' + rb.why);
    assert.equal(rb.dataset.time, null, 'a per-position axis was claimed for a geometry with other positions');
    assert.equal(rb.dataset.timeRefused, null, 'the axis was carried and then refused, instead of not being claimed');
  });

  /* ══ ⑨ clear() は採番を巻き戻さない ═════════════════════════════════════════════════════════ */

  test('R735 ⑨ clear() does not put the id generator back behind ids that are about to be restored', async () => {
    const { data } = await boot();
    const a = data.add({ title: 'a', features: [] });
    const b = data.add({ title: 'b', features: [] });
    assert.equal(a.id, 'ds-1');
    assert.equal(b.id, 'ds-2');

    /* This is what js/gis-project.js load() does: empty the registry, then restore saved records BY
       NAME. A counter that went back to 0 would generate `ds-1` again for the next import. */
    data.clear();
    const next = data.add({ title: 'c', features: [] });
    assert.notEqual(next.id, 'ds-1', 'the counter was reset and reissued an id that a saved project names');
    assert.equal(next.id, 'ds-3');

    const src = read('js/gis-datasets.js');
    assert.ok(!/clear:.*seq = 0/.test(src), 'clear() zeroes the counter again');
  });

  /* ══ ⑩ 利用者の仕事ひとつ、端から端まで ═════════════════════════════════════════════════════ */

  test('R735 ⑩ roads → 500 m → facilities per ward → save → reload → 1 km, same layer', async () => {
    const { data, ops, project } = await boot();

    /* A road, two wards, and five facilities — two of them within 500 m of the road, two more within
       1 km, one far away. The distances are the ones geodesy gives, so nothing here is a recorded
       number: 0.005° of latitude is ~556 m, 0.01° is ~1.11 km. */
    const roads = data.add({ title: 'roads', features: [line([[0, 0], [0.2, 0]], { ref: 'R1' })] });
    const wards = data.add({
      title: 'wards', features: [
        poly([box(-0.05, -0.05, 0.1, 0.05)], { name: 'west', cd: '01100' }),
        poly([box(0.1, -0.05, 0.25, 0.05)], { name: 'east', cd: '01101' }),
      ],
    });
    const fac = data.add({
      title: 'facilities', features: [
        pt(0.02, 0.002, { name: 'near-w' }),        /* ~222 m  */
        pt(0.15, 0.003, { name: 'near-e' }),        /* ~333 m  */
        pt(0.05, 0.007, { name: 'mid-w' }),         /* ~778 m  */
        pt(0.18, 0.008, { name: 'mid-e' }),         /* ~889 m  */
        pt(0.05, 0.04, { name: 'far' }),            /* ~4.4 km */
      ],
    });

    /* ⚠ THE DISTANCE IS FROM THE ROAD ITSELF. A bounding-box centre cannot answer this, which is the
       part of the reader's sentence that the old code could not do at all. */
    const near = await ops.run({ id: 'near', op: 'relate', inputs: [fac.id, roads.id], params: { predicate: 'nearer-than', maxKm: 0.5 } });
    assert.equal(near.ok, true, 'relate refused: ' + near.why);
    assert.deepEqual(near.dataset.features().map((f) => f.properties.name).sort(), ['near-e', 'near-w']);

    const byWard = await ops.run({ id: 'byWard', op: 'aggregate', inputs: [wards.id, 'near'], params: { stat: 'count' } });
    assert.equal(byWard.ok, true, 'aggregate refused: ' + byWard.why);
    const counts = {};
    for (const f of byWard.dataset.features()) counts[f.properties.name] = f.properties.count;
    assert.deepEqual(counts, { west: 1, east: 1 });
    /* The ward code came through as a code, not as a number that lost its leading zero. */
    assert.equal(byWard.dataset.features()[0].properties.cd, '01100');

    /* ⚠ THE CHAIN IS A RECIPE, WHICH IS WHAT MAKES THE LAST STEP OF THE SENTENCE POSSIBLE. */
    /* ⚠ (#R765) THE RECIPE IS ASSERTED FIELD BY FIELD, not as the whole object. It used to be a
       deepEqual, which says 「このレシピである」 and ALSO 「provenance にはこれ以外の欄が無い」 — and
       the second half is not what this test is about. #R765 added `engine`: the record now states
       which kernels computed it, stamped as it ran. Asserting the object whole would make every
       truthful addition to a record's own account of itself look like a regression here. */
    const prov = data.describe('byWard').provenance;
    assert.equal(prov.kind, 'op');
    assert.equal(prov.op, 'aggregate');
    assert.deepEqual(prov.inputs, [wards.id, 'near']);
    assert.deepEqual(prov.params, { stat: 'count' });
    /* and the engine that ran it is recorded, because it was mounted (#R765) */
    assert.ok(prov.engine && prov.engine.ops, 'the record does not say which engine computed it');
    assert.deepEqual(data.lineage('byWard').map((r) => r.id), [wards.id, fac.id, roads.id, 'near', 'byWard']);

    /* 「距離だけ変更して、同じ結果レイヤーまで更新できる」 — under the same ids, so a map layer and a
       query pointing at `byWard` simply see new contents. IndexedDB is absent in Node, so what is
       measured here is the recomputation itself; ⑤ of tests/geo-gis-datasets-checks.test.mjs (#R729) covers the store. */
    const again = await project.setParams('near', { predicate: 'nearer-than', maxKm: 1.0 });
    assert.equal(again.ok, true, 'setParams failed: ' + JSON.stringify(again.failed || again.why));
    assert.deepEqual(again.rebuilt, ['near', 'byWard'], 'the downstream step was not re-run');
    const after = {};
    for (const f of data.get('byWard').features()) after[f.properties.name] = f.properties.count;
    assert.deepEqual(after, { west: 2, east: 2 }, 'the 1 km answer is not the 1 km answer');
    assert.equal(data.get('byWard').stale, null, 'a successful rebuild left the record marked stale');

    /* And a parameter the op refuses leaves the chain where it was, marked — #R732's guarantee, now
       also over a chain this round can build. */
    const bad = await project.setParams('near', { predicate: 'nearer-than', maxKm: -5 });
    assert.equal(bad.ok, false);
    assert.ok(data.get('near'), 'the record being edited was deleted by a refused parameter');
    assert.ok(data.get('byWard').stale, 'the downstream result was left looking current');
  });

  /* ══ ⑪ 到達できること ══════════════════════════════════════════════════════════════════════ */

  test('R735 ⑪ the layer bridge and the spatial clause are reachable from the reader and the model', () => {
    /* 綴りのまま: 主張が「2 つ目が無い／1 か所だけ」という構造の配線の在否で、実行した答えからは不在を観測できない（パネルとスキーマのどこから呼ばれるか）。 */
    /* ⚠ AN EXPORT NOTHING CALLS IS NOT A FEATURE. #R732 built js/gis-layers.js, tested it and wrote it
       into three documents; the only references to it in the whole program were those tests and that
       prose, so no reader could put a map layer into an analysis. This is the check that the entrance
       exists — the memory note is 「完成した配線が通電しているかは、配線を描く門からは見えない」. */
    const panel = read('js/gis-panel.js');
    assert.ok(/window\.IntMapGisLayers/.test(panel), 'the panel still does not know the layer bridge exists');
    assert.ok(/L\.sources\(\)/.test(panel), 'nothing lists what the map can hand over');
    assert.ok(/L\.toDataset\(/.test(panel), 'no control turns a layer into a dataset');
    assert.ok(/L\.toRaster\(/.test(panel), 'no control turns a numeric layer into a grid');
    assert.ok(/bodyEl\.appendChild\(sectionLayers\(\)\)/.test(panel), 'the section exists but is not rendered');
    /* A bake outlives the DOM it started in: render() runs on every registry event. */
    assert.ok(/if \(bake\)/.test(panel), 'a running bake cannot be stopped after a repaint');

    /* And the same shape on the model's side: #R732 wired the spatial clause into the evaluator and the
       catalogue prose, and left it out of the argument schema — the list the model is actually shown.
       #R733 measured what that costs (eight steps of one turn spent searching for tools in hand). */
    const schemas = read('js/atlas-schemas.js');
    const line = schemas.split('\n').find((l) => l.indexOf("'data.query'") >= 0);
    assert.ok(line, "data.query is no longer declared");
    assert.ok(/spatial:/.test(line), 'data.query still does not tell the model it can ask by shape');

    /* The evaluator it has to agree with. */
    const query = read('js/atlas-query.js');
    assert.ok(/spatialStage/.test(query), 'the spatial clause is declared and not implemented');
  });

  ISOLATED.built();
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R738 · editing, declarations, undo   (was tests/r738-gis-edits-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
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
describe('§ #R738 · editing, declarations, undo', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

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

  ISOLATED.built();
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R738 · attribute tables, joins, computed columns   (was tests/r738-gis-attributes-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
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
describe('§ #R738 · attribute tables, joins, computed columns', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

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
    /* 綴りのまま: 主張が「検査以外の呼び手が在る」という配線の構造で、呼び手の側（パネル・Atlas）は DOM の上にある。 */
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

  ISOLATED.built();
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R774 · impossible days and reversed periods   (was tests/r774-gis-time-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* ============================================================================
 *  #R774 · 時刻は「形」ではなく「暦」で受ける
 * ----------------------------------------------------------------------------
 *  THE DEFECT, RESTATED AS THE DEFECT ([[intmap-restate-the-defect-not-the-fix]]):
 *
 *      js/gis-datasets.js asDate() decided what a date was by LOOKING AT ITS SHAPE and then handing
 *      the string to Date.parse. ECMA-262's ISO parsing carries an out-of-range day instead of
 *      refusing it, so a cell saying a day that never existed was accepted AS A DIFFERENT, REAL DAY:
 *
 *          2026-02-30  →  2026-03-02        2026-02-29 (common year)  →  2026-03-01
 *          2026-04-31  →  2026-05-01
 *
 *      Nothing said so. The column typed as `date`, the row sorted between the 1st and the 3rd of
 *      March, and a reader asking 「2月のもの」 got a row that says February and is filed in March.
 *
 *      And declareTime()'s `constant` branch read `start` and `end` and NEVER COMPARED THEM, so
 *      「2026-09-17 から 2020-01-01 まで」 was accepted as the dataset's own statement about itself.
 *      Every window query over it answers empty, and the reader cannot tell whether the fault is in
 *      the data or in the question.
 *
 *  ⚠ WHAT IS MEASURED HERE IS THE CALENDAR, not the spelling of the fix. The expected values are
 *  facts about the Gregorian calendar (2026 is a common year, April has 30 days, 2024 is a leap
 *  year); none of them is a number this file once saw printed.
 *
 *  ⚠ AND THE YEAR RULE IS MEASURED ALONGSIDE, because it is the rule most easily broken by a stricter
 *  date reader: docs/GIS-CORE.md §1.5 states 「裸の年はその年 1 年」 and a dataset of 1889s depends on
 *  it. A check that only tightened would pass over a regression that made 1889 mean one millisecond.
 * ==========================================================================*/
describe('§ #R774 · impossible days and reversed periods', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  globalThis.window = globalThis;
  const DATA = makeGisDatasets();

  let seq = 0;
  const fresh = (spec) => DATA.add(Object.assign({ id: 'r774-t-' + (++seq) }, spec));
  const pt = (x, y, props) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [x, y] }, properties: props || {} });

  /* The witness for an epoch: the calendar date it lands on, in UTC, written out here rather than
     asked of the module that produced it. */
  const utcDate = (ms) => {
    const d = new Date(ms);
    return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
  };

  /* ══ ① 存在しない暦日は、別の日に化けずに拒まれる ════════════════════════════════════════ */

  test('R774 ① asDate refuses a day the calendar does not have, instead of rolling it over', () => {
    /* ⚠ THE FIRST THREE ARE THE MEASURED DEFECT. Before #R774 each answered a real instant two, one
       and one day later than the cell claimed. */
    assert.equal(DATA.asDate('2026-02-30'), null, 'February 30th was accepted (it used to become 3/2)');
    assert.equal(DATA.asDate('2026-02-29'), null, '2026 is a common year — 2/29 was accepted (it used to become 3/1)');
    assert.equal(DATA.asDate('2026-04-31'), null, 'April has 30 days — 4/31 was accepted (it used to become 5/1)');
    assert.equal(DATA.asDate('2026-06-31'), null, 'June has 30 days');
    assert.equal(DATA.asDate('2026-11-31'), null, 'November has 30 days');

    /* month and day outside the calendar at all — refused before and refused now, asserted so that a
       rewrite of the reader cannot open them by accident */
    assert.equal(DATA.asDate('2026-13-01'), null);
    assert.equal(DATA.asDate('2026-00-10'), null);
    assert.equal(DATA.asDate('2026-01-00'), null);
    assert.equal(DATA.asDate('2026-01-32'), null);
  });

  test('R774 ① the days that DO exist are untouched, leap year included', () => {
    assert.deepEqual(utcDate(DATA.asDate('2026-02-28')), [2026, 2, 28]);
    /* 2024 is divisible by 4 and not by 100: a leap year, so the 29th exists. ⚠ A month-length table
       written by hand is what would have got this wrong; the reader round-trips through the engine's
       own calendar, which already knows. */
    assert.deepEqual(utcDate(DATA.asDate('2024-02-29')), [2024, 2, 29]);
    /* 2000 is divisible by 400 — a leap year. 1900 is divisible by 100 and not 400 — it is not. */
    assert.deepEqual(utcDate(DATA.asDate('2000-02-29')), [2000, 2, 29]);
    assert.equal(DATA.asDate('1900-02-29'), null, '1900 was not a leap year');
    assert.deepEqual(utcDate(DATA.asDate('2026-12-31')), [2026, 12, 31]);
    assert.deepEqual(utcDate(DATA.asDate('2026-01-01')), [2026, 1, 1]);

    /* a Date object and a year-month prefix still read, and a non-date still does not */
    assert.equal(DATA.asDate(new Date(Date.UTC(2026, 4, 6))), Date.UTC(2026, 4, 6));
    assert.deepEqual(utcDate(DATA.asDate('2026-02')), [2026, 2, 1]);
    assert.equal(DATA.asDate('東京'), null);
    assert.equal(DATA.asDate('03/04/2020'), null, 'a locale-dependent spelling is still refused');
  });

  test('R774 ① the same verdict with a time and with a zone — the calendar is asked about the DAY', () => {
    assert.equal(DATA.asDate('2026-02-30T00:00'), null);
    assert.equal(DATA.asDate('2026-02-30T12:34:56Z'), null);
    assert.equal(DATA.asDate('2026-02-30 00:00'), null);
    assert.equal(DATA.asDate('2026-02-30T00:00+09:00'), null);

    /* ⚠ AND THE ZONE STILL MOVES THE INSTANT. The day is checked as the LOCAL day the cell names, so a
       legal date near midnight in a positive offset must NOT be refused merely because it lands on the
       previous day in UTC — a verdict that depended on the offset would be a different rule. */
    const t = DATA.asDate('2026-03-01T00:00+09:00');
    assert.notEqual(t, null, 'a legal date was refused because UTC puts it on another day');
    assert.deepEqual(utcDate(t), [2026, 2, 28], 'the zone stopped being applied to the instant');
    const z = DATA.asDate('2026-02-28T23:00-05:00');
    assert.notEqual(z, null);
    assert.deepEqual(utcDate(z), [2026, 3, 1]);

    /* a time that is not a time is still refused */
    assert.equal(DATA.asDate('2026-02-28T99:99'), null);
  });

  test('R774 ① a column of impossible days types as text, not as a date column', () => {
    /* The consequence a reader sees: typeColumn asks asDate, so before this the column was `date` and
       two of its three rows were filed on days nobody wrote down. */
    const rec = fresh({
      title: 'impossible', features: [
        pt(0, 0, { when: '2026-02-30' }), pt(1, 1, { when: '2026-04-31' }), pt(2, 2, { when: '2026-01-15' }),
      ],
    });
    const col = rec.fields.find((f) => f.name === 'when');
    assert.equal(col.type, 'text', 'a column with two impossible days still calls itself a date column');

    const good = fresh({
      title: 'possible', features: [pt(0, 0, { when: '2026-02-28' }), pt(1, 1, { when: '2024-02-29' })],
    });
    assert.equal(good.fields.find((f) => f.name === 'when').type, 'date');
  });

  /* ══ ② 裸の年は、その年 1 年のまま ═══════════════════════════════════════════════════════ */

  test('R774 ② a bare year is still the WHOLE year (docs/GIS-CORE.md §1.5), and BC years still work', () => {
    const y = DATA.momentOf('1889');
    assert.equal(y.year, 1889);
    assert.deepEqual(utcDate(y.start), [1889, 1, 1]);
    assert.deepEqual(utcDate(y.end), [1889, 12, 31]);
    assert.ok(y.end - y.start > 364 * 24 * 3600 * 1000, 'the year collapsed to an instant');

    /* the same year spelled with ISO padding is the same year — not one millisecond */
    const p = DATA.momentOf('0005');
    assert.equal(p.year, 5);
    assert.deepEqual(utcDate(p.start), [5, 1, 1]);
    /* ⚠ AND NOT 1905: Date.UTC would map a year below 100 into the twentieth century (#R602). */
    assert.notEqual(new Date(p.start).getUTCFullYear(), 1905);

    const bc = DATA.momentOf(-200);
    assert.equal(bc.year, -200);
    assert.deepEqual(utcDate(bc.start), [-200, 1, 1]);

    /* a stated day is still a single instant, as before */
    const d = DATA.momentOf('1889-07-14');
    assert.equal(d.start, d.end);
    assert.deepEqual(utcDate(d.start), [1889, 7, 14]);
    /* and a day that does not exist is not a moment at all */
    assert.equal(DATA.momentOf('1889-02-30'), null);
  });

  /* ══ ③ 逆転した期間は、名前を持って拒まれる ═════════════════════════════════════════════ */

  test('R774 ③ a constant period that ends before it begins is refused by name', () => {
    const rec = fresh({
      title: 'reversed', features: [pt(0, 0, {})],
      time: { kind: 'constant', start: '2026-09-17', end: '2020-01-01' },
    });
    assert.equal(rec.time, null, 'a period that ends before it begins was carried as the dataset’s own statement');
    assert.equal(rec.timeRefused.why, 'time-constant-reversed');
    /* the detail echoes what the reader stated, so the panel can show which two values disagree */
    assert.equal(rec.timeRefused.detail.start, '2026-09-17');
    assert.equal(rec.timeRefused.detail.end, '2020-01-01');

    /* the same statement made in years, which take a whole year each — the comparison must be of the
       resulting span and not of the spelling */
    const yrs = fresh({ title: 'reversed-years', features: [pt(0, 0, {})], time: { kind: 'constant', start: 2020, end: 1999 } });
    assert.equal(yrs.timeRefused.why, 'time-constant-reversed');
  });

  test('R774 ③ the periods that are not reversed still pass, including the ones that touch', () => {
    const fwd = fresh({ title: 'fwd', features: [pt(0, 0, {})], time: { kind: 'constant', start: '2020-01-01', end: '2026-09-17' } });
    assert.equal(fwd.timeRefused, null, JSON.stringify(fwd.timeRefused));
    assert.deepEqual(utcDate(fwd.time.start), [2020, 1, 1]);
    assert.deepEqual(utcDate(fwd.time.end), [2026, 9, 17]);

    /* ⚠ ONE INSTANT IS NOT A REVERSAL. start === end is a legal period of zero length and a very
       common one (a grid produced at a moment), so the comparison is `>` and not `>=`. */
    const one = fresh({ title: 'one', features: [pt(0, 0, {})], time: { kind: 'constant', start: '2026-09-17', end: '2026-09-17' } });
    assert.equal(one.timeRefused, null);
    assert.equal(one.time.start, one.time.end);

    /* a single bare year is a whole year, so its start precedes its end — a naive comparison that
       paired start-of-start with start-of-end would have been fine here, but one that paired
       end-with-start would refuse every year. */
    const yr = fresh({ title: 'yr', features: [pt(0, 0, {})], time: { kind: 'constant', start: 2020, end: 2020 } });
    assert.equal(yr.timeRefused, null);
    assert.deepEqual(utcDate(yr.time.start), [2020, 1, 1]);
    assert.deepEqual(utcDate(yr.time.end), [2020, 12, 31]);

    /* an open end is still open, and nothing to compare is nothing to refuse */
    const open = fresh({ title: 'open', features: [pt(0, 0, {})], time: { kind: 'constant', start: '2020-01-01' } });
    assert.equal(open.timeRefused, null);
    assert.deepEqual(utcDate(open.time.start), [2020, 1, 1]);

    /* ⚠ AND THE DECLARATION IS STILL IDEMPOTENT (#R759): re-declaring a record's own normalised
       `time` — a pair of epoch milliseconds — must not now trip the reversal rule. */
    const again = fresh({ title: 'again', features: [pt(0, 0, {})], time: { kind: 'constant', start: fwd.time.start, end: fwd.time.end } });
    assert.equal(again.timeRefused, null, JSON.stringify(again.timeRefused));
    assert.equal(again.time.start, fwd.time.start);
    assert.equal(again.time.end, fwd.time.end);
  });

  /* ══ ④ 行ごとの逆転は、数えられて、既にある規則に渡される ═══════════════════════════════ */

  test('R774 ④ a reversed interval row does not count as readable, and the count travels', () => {
    /* ⚠ NO SECOND POLICY. The branch already decided what to do with a row that does not read: keep
       the axis, carry the count, refuse only when NOTHING read. A reversed row is the same kind of
       fact, so it is counted out of `readable` and the existing rule decides. */
    const rec = fresh({
      title: 'spans', features: [
        pt(0, 0, { from: '2020-01-01', to: '2021-01-01' }),
        pt(1, 1, { from: '2026-01-01', to: '2020-01-01' }),
        pt(2, 2, { from: '2022-01-01', to: '2023-01-01' }),
      ],
      time: { kind: 'interval', startField: 'from', endField: 'to' },
    });
    assert.equal(rec.timeRefused, null, JSON.stringify(rec.timeRefused));
    assert.equal(rec.time.stated, 3);
    assert.equal(rec.time.readable, 2, 'the reversed row was counted as readable');
    assert.equal(rec.time.reversed, 1, 'the count a reader would need is not in the record');

    /* a column where EVERY stated row is reversed reads not at all, so the existing rule refuses the
       whole declaration — and it refuses it with the code that already has a sentence */
    const all = fresh({
      title: 'all-reversed', features: [
        pt(0, 0, { from: '2026-01-01', to: '2020-01-01' }),
        pt(1, 1, { from: '2030-01-01', to: '2029-01-01' }),
      ],
      time: { kind: 'interval', startField: 'from', endField: 'to' },
    });
    assert.equal(all.time, null);
    assert.equal(all.timeRefused.why, 'time-unreadable');
    assert.equal(all.timeRefused.detail.reversed, 2);
  });

  test('R774 ④ intervals that are not reversed are unchanged, open ends included', () => {
    const rec = fresh({
      title: 'ok-spans', features: [
        pt(0, 0, { from: '2020-01-01', to: '2021-01-01' }),
        pt(1, 1, { from: '2021-01-01', to: '2021-01-01' }),   /* one instant is not a reversal */
        pt(2, 2, { from: '2022-01-01' }),                      /* an open end is not a reversal */
        pt(3, 3, { to: '2019-01-01' }),                        /* nor is an open start */
      ],
      time: { kind: 'interval', startField: 'from', endField: 'to' },
    });
    assert.equal(rec.timeRefused, null, JSON.stringify(rec.timeRefused));
    assert.equal(rec.time.stated, 4);
    assert.equal(rec.time.readable, 4);
    assert.equal(rec.time.reversed, 0);

    /* ⚠ A BARE YEAR PAIR IS NOT REVERSED WHEN IT IS THE SAME YEAR. 2020→2020 is start-of-2020 to
       end-of-2020; a comparison that read the end of the start against the start of the end would
       have called it reversed and thrown away a very ordinary axis. */
    const years = fresh({
      title: 'year-spans', features: [pt(0, 0, { from: '2020', to: '2020' }), pt(1, 1, { from: 1889, to: 1890 })],
      time: { kind: 'interval', startField: 'from', endField: 'to' },
    });
    assert.equal(years.timeRefused, null, JSON.stringify(years.timeRefused));
    assert.equal(years.time.reversed, 0);
    assert.equal(years.time.readable, 2);

    /* an `instant` axis has no pair to reverse, and is left exactly as it was */
    const inst = fresh({
      title: 'inst', features: [pt(0, 0, { when: '2020-05-06' }), pt(1, 1, { when: 'いつか' })],
      time: { kind: 'instant', field: 'when' },
    });
    assert.equal(inst.timeRefused, null);
    assert.equal(inst.time.readable, 1);
    assert.equal(inst.time.stated, 2);
    assert.equal('reversed' in inst.time, false, 'a single-column axis grew a count about pairs');
  });

  /* ══ ⑤ 拒否のコードは宣言されている ═══════════════════════════════════════════════════════ */

  test('R774 ⑤ the new refusal is DECLARED, not just spelled at the one place that raises it', () => {
    /* tests/geo-gis-datasets-checks.test.mjs (#R729) ④ reads REFUSALS to decide which codes must have a sentence in
       js/gis-panel.js. A code raised without being declared would be invisible to that gate — which is
       the shape [[intmap-gate-universe-is-declared-gates]] records: a gate sees the population it was
       given, so a code outside the declaration reaches a reader with no sentence and nothing objects. */
    /* 綴りのまま: REFUSALS は module の外へ公開されておらず、時間の経路の no() はそれを参照しない
       （実測: REFUSALS から外しても ③ は同じ答えを返す）——宣言は、それを読む門（#R729 ④）と同じく
       ソースからしか観測できない。「実際に上げられる」半分は ③ が評価で測っている。 */
    const src = readFileSync(new URL('../js/gis-datasets.js', import.meta.url), 'utf8');
    const decl = /const REFUSALS = \[([^\]]*)\]/.exec(src);
    assert.ok(decl, 'js/gis-datasets.js no longer declares its refusal codes');
    const codes = Array.from(decl[1].matchAll(/'([a-z0-9-]+)'/g)).map((m) => m[1]);
    assert.ok(codes.includes('time-constant-reversed'), 'the reversed-period refusal is not in REFUSALS');
    /* and it is actually raised — a declaration nothing raises is the opposite defect */
    assert.match(src, /no\('time-constant-reversed'/);
  });

  ISOLATED.built();
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R783 · a band's declared quantity survives the dataset door   (was tests/r783-band-quantity-carried-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* ============================================================================
 *  R783 · 帯が自分について述べたことが、dataset の扉で落ちていた
 * ----------------------------------------------------------------------------
 *  #R783 で js/gis-units.js が「量の意味」（kind / space / time / period）を表せるようにし、
 *  js/gis-raster.js の `total` 規則がそれを読んで **未申告なら拒む**ようになった。
 *  ⚠ ところが `js/gis-datasets.js` の `add()` は帯を `{name, unit, nodata}` で**作り直して**
 *  いたので、`quantity` を述べて到着した格子は、dataset を 1 つ通ると「未申告」になった。
 *  そして未申告は「合計してよい」ではない ⇒ 正しい答えが到達不能になる。
 *
 *  測るのは 2 つ: ① 述べた帯は述べたまま出てくる ② 述べていない帯は述べていないまま
 *  （欄を勝手に埋めない。[[intmap-data-must-not-claim-an-author-it-lacks]]）。
 * ==========================================================================*/
describe('§ #R783 · a band\'s declared quantity survives the dataset door', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  /* 扉そのものを評価する: `bands.map(...)` の式をソースから取り出して走らせる。
     ⚠ 式を書き写さない——写した式は実装が戻っても緑のままになる（#R505）。 */
  const SRC = readFileSync(new URL('../js/gis-datasets.js', import.meta.url), 'utf8');

  function normaliseBands(bands) {
    const m = SRC.match(/bands: bands\.map\(\(b, i\) => \(\{[\s\S]*?\}\)\),/);
    assert.ok(m, 'js/gis-datasets.js no longer normalises bands where this test reads it');
    const fn = new Function('bands', 'return [' + m[0].replace(/^bands: /, '').replace(/,$/, '') + '][0];');
    return fn(bands);
  }

  test('R783 ① a band that declares its quantity still declares it after the dataset door', () => {
    const q = { kind: 'count', space: 'total', time: 'instant' };
    const out = normaliseBands([{ name: 'pop', unit: 'people', nodata: -9999, quantity: q }]);
    assert.deepEqual(out[0].quantity, q, 'the dataset door dropped what the band said about itself');
    assert.equal(out[0].unit, 'people', 'the unit did not survive');
    assert.equal(out[0].nodata, -9999, 'nodata did not survive');
  });

  test('R783 ② a band that says nothing still says nothing', () => {
    const out = normaliseBands([{ name: 'b1' }]);
    assert.equal(out[0].quantity, null, 'the door invented a quantity the band never declared');
    assert.equal(out[0].unit, null);
  });

  test('R783 ③ the declaration is carried verbatim — this file does not own the vocabulary', () => {
    /* 語彙の正本は js/gis-units.js の `quantity()`。ここで正規化すると同じ問いに 2 つ目の答えが
       できる（[[intmap-two-readers-one-field-list]]）。だから読めない申告も**そのまま**運ぶ。 */
    const odd = { kind: 'not-a-kind', space: 'sideways' };
    const out = normaliseBands([{ name: 'b', quantity: odd }]);
    assert.deepEqual(out[0].quantity, odd, 'the door judged the declaration instead of carrying it');
    assert.ok(!/normalis|vocabular|VOCAB/i.test(SRC.slice(SRC.indexOf('bands: bands.map'), SRC.indexOf('bands: bands.map') + 400))
      || /js\/gis-units\.js/.test(SRC.slice(Math.max(0, SRC.indexOf('bands: bands.map') - 1200), SRC.indexOf('bands: bands.map'))),
      'if this file now normalises quantities, it must say where the one vocabulary lives');
  });

  test('R783 ④ the documented shape of a band names the field', () => {
    /* 綴りのまま: 主張の対象が文書・註の文面そのもの。 */
    assert.match(SRC, /bands:\[\{name,unit,nodata,quantity\}\]/,
      'the comment that documents a raster record still describes a band without its quantity');
  });

  ISOLATED.built();
});
