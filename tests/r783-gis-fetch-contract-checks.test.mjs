/* ============================================================================
 *  #R783 · 取得は、宣言したとおりに実行される（表示状態とは無関係に）
 * ----------------------------------------------------------------------------
 *  ⚠ THE INVARIANTS ARE THE DEFECT, NOT THE FIX ([[intmap-restate-the-defect-not-the-fix]]).
 *  What was MEASURED on the shipped code, with one row holding three features v=1,2,3 reachable only
 *  through its loader (never drawn) — the road #R763 added for 「表示していないレイヤーから取得する」:
 *
 *      where v>=2              → 1, 2, 3     (the condition was never applied)
 *      limit 1                 → 1, 2, 3     with next:null — 「これで全部」 about a page of one
 *      limit 1, cursor "doc@1" → 1, 2, 3     the position was never read
 *      coverage.filteredBy     → "supplier"  over every one of those answers
 *
 *  js/gis-layers.js supplierFor() DECLARES `where:true, cursor:true, limit:true` for that road, and
 *  js/gis-sources.js prepare() lets a condition through precisely because a supplier claimed it can
 *  execute one — a declaration is a claimant, which is the whole argument `completeness:'all'` is
 *  built on, and here the claim was simply false. So a reader (or Atlas) asking 「M6 以上を 1 件ずつ」
 *  of an undrawn layer was handed every row it held, in a record saying the supplier had filtered.
 *
 *  Two more of the same family:
 *
 *    ② canSample() answered `state(id).on` — 「いま表示されているか」 — and js/gis-atlas.js publishes
 *       that answer to the planner as `samplable`, which is a word about the LAYER'S ABILITY.
 *       MEASURED: a numeric row switched off reported 「値を訊けない」 (the data did not change; a
 *       checkbox did), and a row with NO sampler at all, switched on, reported 「訊ける」. It is the
 *       assumption #R774 removed one level down (js/gis-sources.js region() probes rather than
 *       reading 「off ⇒ no values」) still standing at the door above it.
 *    ③ the cursor was `<layer>@<offset>` — a position in WHICHEVER list that layer hands over next.
 *       MEASURED: page 1 of the drawn row answered v=1 and handed back `drawn@1`; the same cursor
 *       returned WITH AN ATTRIBUTE CONDITION ADDED answered v=3 — position 1 of a different,
 *       filtered set — `ok:true`, and nothing in the coverage said so. A reader paging to the end of
 *       that sequence has skipped a row and been told the window was exhausted.
 *
 *  ⚠ THE ONE CONDITION THE AUDIT NAMED, AND ① IS IT: the same request answered from the document and
 *  answered from the renderer must return the same ids, the same count and the same continuation —
 *  because only then is the acquisition independent of what is on screen, which is the entire reason
 *  js/gis-sources.js and the supply contract exist.
 *
 *  ⚠ THE STUB REGISTRY IS NO MORE CAPABLE THAN js/map-ui.js's ([[intmap-r671-lessons]]): `featuresIn`
 *  answers null for a row the renderer has not drawn (exactly as _srcFeatsIn does for a source that
 *  does not exist yet), `loaderOf` hands back a row's own `load`, `narrow` is the one box predicate,
 *  and `sampleAt` hands back a ROW for every registration it asked and a value only when there was
 *  one (#R774) — including a row with no value at all, which is what ② measures against.
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const pt = (lng, lat, p) => ({ type: 'Feature', properties: p || {}, geometry: { type: 'Point', coordinates: [lng, lat] } });
const WORLD = { extent: { w: -180, s: -90, e: 180, n: 90 }, complete: true, viewBound: false, live: false };

/* ── a registry that answers what js/map-ui.js's answers ──────────────────────────────────────── */

function makeFakeMap(w) {
  const rows = new Map();
  let camera = { w: -180, s: -90, e: 180, n: 90 };
  const inBox = (f, b) => {
    const c = f && f.geometry && f.geometry.coordinates;
    return !!c && c[0] >= b.w && c[0] <= b.e && c[1] >= b.s && c[1] <= b.n;
  };
  const asBox = (bounds) => (bounds ? { w: bounds[0][0], s: bounds[0][1], e: bounds[1][0], n: bounds[1][1] } : { ...camera });

  w.IntMapLayers = {
    list: () => Array.from(rows.keys()),
    state: (id) => {
      const r = rows.get(String(id));
      return r ? { id: String(id), on: !!r.on, label: r.label, time: r.time || null, source: null, legend: null } : null;
    },
    /* ⚠ null IS 「まだ描かれていない」, which is what makes the loader road reachable at all. */
    featuresIn: (id, bounds) => {
      const r = rows.get(String(id));
      if (!r || !r.features) return null;
      const b = asBox(bounds);
      return r.features.filter((f) => inBox(f, b));
    },
    featuresInSource: () => null,
    sampleAt: async (lng, lat, ids) => {
      const out = [];
      for (const id of (ids && ids.length ? ids : Array.from(rows.keys()))) {
        const r = rows.get(String(id));
        if (!r || !r.measure) continue;                 /* no sampler registered: no row, ever */
        const row = { id: String(id), label: r.label, asked: true };
        try {
          const q = await Promise.resolve(r.measure(lng, lat));
          if (q && typeof q === 'object') {
            if (q.text != null) row.value = q.text;
            if (typeof q.value === 'number') { row.number = q.value; if (q.unit != null) row.unit = q.unit; }
          }
        } catch (_) { row.failed = true; }
        out.push(row);
      }
      return out;
    },
    loaderOf: (id) => { const r = rows.get(String(id)); return (r && typeof r.load === 'function') ? (() => r.load()) : null; },
    narrow: (features, bounds) => {
      if (!Array.isArray(features)) return null;
      if (!bounds) return features.slice();
      const b = asBox(bounds);
      return features.filter((f) => inBox(f, b));
    },
    declarationOf: (id) => { const r = rows.get(String(id)); return (r && r.holds) ? r.holds : null; },
    active: () => Array.from(rows.keys()).filter((id) => rows.get(id).on),
    context: () => [],
  };
  w.IntMapGeoEngine = {
    scene: { getStyle: () => ({ sources: {} }) },
    layers: { sourceData: () => null },
    camera: { getBounds: () => ({ getWest: () => camera.w, getSouth: () => camera.s, getEast: () => camera.e, getNorth: () => camera.n }) },
  };
  return { rows, setCamera: (b) => { camera = b; } };
}

async function boot() {
  const w = {};
  globalThis.window = w;
  new Function('window', read('js/geodesy.js'))(w);
  const { makeGisDatasets } = await import('../js/gis-datasets.js');
  const { makeGisOps } = await import('../js/gis-ops.js');
  const { makeGisRaster } = await import('../js/gis-raster.js');
  const { makeGisSources } = await import('../js/gis-sources.js');
  const { makeGisLayers } = await import('../js/gis-layers.js');
  const map = makeFakeMap(w);
  w.IntMapData = makeGisDatasets();
  w.IntMapGisOps = makeGisOps();
  w.IntMapGisRaster = makeGisRaster();
  w.IntMapGisSources = makeGisSources();
  w.IntMapGisLayers = makeGisLayers();
  return { w, map, sources: w.IntMapGisSources, layers: w.IntMapGisLayers };
}

/* THE THREE ROWS, AND THE TWO ROADS TO THEM. ⚠ THE SAME ID BOTH TIMES — that is the point: a cursor
   and a page must not depend on which road answered, and comparing two different ids would compare
   two different answers instead. `drawn` puts them in the renderer (featuresIn answers);
   `doc` hands them over through the row's own loader and leaves the renderer empty. */
const TRIPLE = () => [pt(1, 1, { v: 1, nm: 'a' }), pt(2, 2, { v: 2, nm: 'b' }), pt(3, 3, { v: 3, nm: 'c' })];

function put(map, sources, road, extra) {
  const row = Object.assign({ label: 'Row', on: true, holds: WORLD }, extra || {});
  if (road === 'drawn') row.features = TRIPLE();
  else row.load = async () => TRIPLE();
  map.rows.set('row', row);
  /* ⚠ THE SUPPLIER IS ADOPTED ONCE PER ID (js/gis-sources.js sup()), so switching roads for the same
     id goes through the published door rather than by reaching into the map. */
  sources.supply('row', null);
}

const vs = (r) => (r.ok ? r.features.map((f) => f.properties.v) : ('REFUSED:' + r.why));

/* ══ ① 同じ要求が、未ロードでもロード済みでも同じ答えを返す ══════════════════════════════════ */

test('R783 ① 属性条件は、描かれていないレイヤーでも実行される（宣言だけで済んでいた）', async () => {
  const { map, sources } = await boot();
  const ask = { where: [{ field: 'v', op: '>=', value: 2 }] };

  put(map, sources, 'doc');
  const doc = await sources.acquire('row', ask);
  /* MEASURED BEFORE THIS ROUND: [1,2,3] — every row it held, after being asked for v>=2. */
  assert.equal(doc.ok, true, JSON.stringify(doc));
  assert.deepEqual(vs(doc), [2, 3], '条件が実行されていない（loader 経路）');

  put(map, sources, 'drawn');
  const drawn = await sources.acquire('row', ask);
  assert.deepEqual(vs(drawn), vs(doc), '同じ要求が経路によって別の答えを返している');
  assert.equal(drawn.coverage.count, doc.coverage.count);
});

test('R783 ① 件数制限と続きも、両方の経路で同じ 1 件・同じ続きを返す', async () => {
  const { map, sources } = await boot();

  put(map, sources, 'doc');
  const d1 = await sources.acquire('row', { limit: 1 });
  /* MEASURED BEFORE THIS ROUND: [1,2,3] and next:null — 「これで全部」 about a page of one. */
  assert.deepEqual(vs(d1), [1], '件数制限が実行されていない（loader 経路）');
  assert.ok(d1.next, '続きが述べられていない');

  put(map, sources, 'drawn');
  const r1 = await sources.acquire('row', { limit: 1 });
  assert.deepEqual(vs(r1), [1]);
  /* ⚠ THE CURSOR ITSELF, BYTE FOR BYTE. It is bound to the question and to the ordered answer, and
     both roads answer the same question with the same rows — so a reader that took page 1 from the
     document can take page 2 from the renderer. Anything else would make the continuation a
     statement about the camera. */
  assert.equal(r1.next, d1.next, '続きの位置が、どちらの経路で答えたかに依存している');

  const d2 = await sources.acquire('row', { limit: 1, cursor: d1.next });
  assert.deepEqual(vs(d2), [2], '続きの位置が読まれていない');
  put(map, sources, 'doc');
  const l2 = await sources.acquire('row', { limit: 1, cursor: d1.next });
  assert.deepEqual(vs(l2), [2], 'loader 経路がカーソルを無視している');
  /* to the end, by the route the reader actually takes */
  const l3 = await sources.acquire('row', { limit: 1, cursor: l2.next });
  assert.deepEqual(vs(l3), [3]);
  assert.equal(l3.next, null, '最後のページが「まだ続きがある」と述べている');
  assert.equal(l3.coverage.continues, false, '終わりが供給元の言葉として述べられていない');
});

test('R783 ① 表示していてもいなくても、同じ要求は同じ ID 集合を返す', async () => {
  const { map, sources } = await boot();
  const ask = { where: [{ field: 'v', op: '>=', value: 2 }], limit: 1 };
  const answers = [];
  for (const road of ['doc', 'drawn']) {
    for (const on of [true, false]) {
      put(map, sources, road, { on });
      const r = await sources.acquire('row', ask);
      assert.equal(r.ok, true, road + '/on=' + on + ': ' + r.why);
      answers.push({ road, on, ids: r.features.map((f) => f.properties.nm), count: r.coverage.available, next: r.next });
    }
  }
  const first = JSON.stringify(answers[0]).replace(/"road":"[a-z]+"/, '').replace(/"on":(true|false)/, '');
  for (const a of answers) {
    assert.equal(JSON.stringify(a).replace(/"road":"[a-z]+"/, '').replace(/"on":(true|false)/, ''), first,
      '答えが経路か表示状態で変わっている: ' + JSON.stringify(a));
  }
});

/* ══ ② 宣言したことは、実行される ═════════════════════════════════════════════════════════════ */

test('R783 ② supplierFor が宣言した 3 つの能力は、どちらの供給元でも本当に効く', async () => {
  const { map, sources, layers } = await boot();
  for (const road of ['doc', 'drawn']) {
    put(map, sources, road);
    const impl = layers.supplierFor('row');
    assert.ok(impl, road + ': 供給元が組めていない');
    /* the declaration, read off the implementation rather than written here */
    for (const cap of ['where', 'cursor', 'limit']) assert.equal(impl[cap], true, road + ': ' + cap + ' を宣言していない');

    /* and each declared capability CHANGES THE ANSWER — a claim nobody executes is worse than a
       refusal, because it comes back looking like an answer */
    const all = await sources.acquire('row', {});
    assert.equal(all.features.length, 3, road);
    const narrowed = await sources.acquire('row', { where: [{ field: 'v', op: '<=', value: 1 }] });
    assert.equal(narrowed.features.length, 1, road + ': where が答えを変えていない');
    const capped = await sources.acquire('row', { limit: 2 });
    assert.equal(capped.features.length, 2, road + ': limit が答えを変えていない');
    const resumed = await sources.acquire('row', { cursor: capped.next });
    assert.deepEqual(vs(resumed), [3], road + ': cursor が答えを変えていない');
  }
});

test('R783 ② 条件を実行した側がそう述べる — 絞っていない答えは「絞った」と記録しない', async () => {
  const { map, sources } = await boot();
  put(map, sources, 'doc');
  const plain = await sources.acquire('row', {});
  assert.equal(plain.coverage.filteredBy, null, '条件が無いのに絞ったと記録されている');
  const got = await sources.acquire('row', { where: [{ field: 'v', op: '>=', value: 2 }] });
  /* MEASURED BEFORE THIS ROUND: 'supplier' next to [1,2,3] — the record of a request, not of work. */
  assert.equal(got.coverage.filteredBy, 'supplier');
  assert.equal(got.features.length, 2, '「絞った」と述べている答えが絞られていない');
  /* and the conditions travel with the answer, so 「この平均は何の平均か」 has an answer in the record */
  assert.deepEqual(got.coverage.requested.where, [{ field: 'v', op: '>=', value: 2 }]);
});

/* ══ ③ カーソルは 1 つの並びの位置であって、どの並びの位置でもない ═══════════════════════════ */

test('R783 ③ 検索条件が変わったカーソルは、別集合の位置として黙って使われない', async () => {
  const { map, sources } = await boot();
  put(map, sources, 'drawn');
  const p1 = await sources.acquire('row', { limit: 1 });
  assert.deepEqual(vs(p1), [1]);

  /* MEASURED BEFORE THIS ROUND: ok:true and v=3 — position 1 of the FILTERED set, handed over as if
     it were the continuation of the unfiltered one. */
  const other = await sources.acquire('row', { limit: 1, cursor: p1.next, where: [{ field: 'v', op: '>=', value: 2 }] });
  assert.equal(other.ok, false, '条件を変えたのに同じカーソルが受け付けられた: ' + JSON.stringify(other.features && vs(other)));
  assert.equal(other.why, 'bad-param');
  assert.equal(other.detail.param, 'cursor');
  assert.equal(other.detail.reason, 'query-or-data-changed', '断る理由が読者に渡っていない');

  /* the same window and the same conditions still resume — the refusal is about the question having
     changed, not about paging being unavailable */
  const q = { limit: 1, where: [{ field: 'v', op: '>=', value: 2 }] };
  const f1 = await sources.acquire('row', q);
  const f2 = await sources.acquire('row', Object.assign({}, q, { cursor: f1.next }));
  assert.deepEqual(vs(f2), [3]);
});

test('R783 ③ 範囲が変わったカーソルも、データが変わったカーソルも断られる', async () => {
  const { map, sources } = await boot();
  put(map, sources, 'drawn');
  const win = { limit: 1, bbox: { w: 0, s: 0, e: 10, n: 10 } };
  const p1 = await sources.acquire('row', win);
  assert.equal(p1.ok, true, p1.why);

  const wider = await sources.acquire('row', { limit: 1, cursor: p1.next, bbox: { w: -10, s: -10, e: 10, n: 10 } });
  assert.equal(wider.ok, false, '別の窓の位置として使われた');
  assert.equal(wider.detail.reason, 'query-or-data-changed');

  /* the holding itself moved: a live row rolled over between two pages, and the offset it handed out
     is a position in a list that no longer exists */
  map.rows.get('row').features = [pt(9, 9, { v: 9, nm: 'z' })].concat(TRIPLE());
  const moved = await sources.acquire('row', Object.assign({}, win, { cursor: p1.next }));
  assert.equal(moved.ok, false, '保持が変わったのに同じ位置から続けられた');
  assert.equal(moved.detail.reason, 'query-or-data-changed');
});

test('R783 ③ 別のレイヤーのカーソルと、読めないカーソルは別の理由で断られる', async () => {
  const { map, sources } = await boot();
  put(map, sources, 'drawn');
  const wrong = await sources.acquire('row', { limit: 1, cursor: 'somewhere-else@abc@1' });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.detail.reason, 'cursor-of-another-layer');
  /* the shape the app handed out BEFORE this round is not read as a position either — it names no
     question, and reading it as one is the defect */
  const old = await sources.acquire('row', { limit: 1, cursor: 'row@1' });
  assert.equal(old.ok, false, '問いを名乗らないカーソルが位置として読まれた');
});

/* ══ ④ 能力・準備・可用・表示 ═════════════════════════════════════════════════════════════════ */

test('R783 ④ レイヤーを消しても、その行の「値を訊けるか」は変わらない', async () => {
  const { map, layers } = await boot();
  map.rows.set('field', { label: 'Field', on: true, measure: () => ({ value: 5, unit: 'm', text: '5 m' }) });
  const on = layers.canSample('field');
  map.rows.get('field').on = false;
  const off = layers.canSample('field');
  /* MEASURED BEFORE THIS ROUND: true then false — the data did not change, a checkbox did. */
  assert.equal(on, off, '能力の答えが表示状態で変わっている');
  assert.equal(on, true);
});

test('R783 ④ 4 つの事実が別々に読める（1 つの真偽値が全部を名乗っていた）', async () => {
  const { map, layers, sources } = await boot();
  map.rows.set('field', { label: 'Field', on: false, measure: () => ({ value: 5, unit: 'm', text: '5 m' }) });
  const said = layers.samplingOf('field');
  assert.equal(said.visible, false, '表示状態が別の事実として読めない');
  assert.equal(said.door, true, '訊く扉が在ることが別の事実として読めない');
  /* ⚠ null IS 「まだ誰も訊いていない」 AND IS NOT false: the registry's only door is asynchronous, so
     a synchronous answer here cannot be a measurement, and guessing would hide a readable field. */
  assert.equal(said.capable, null, '測っていないことが false に潰されている');

  /* ⚠ AND 「データが準備されているか」 IS THIS FILE'S NEIGHBOUR'S TO ANSWER (js/gis-sources.js
     needsVisible), so it is read where it is composed — on the list row — and it is THREE-VALUED
     there, exactly as needsVisible is: flattening its null would undo the distinction it exists for.
     A field candidate that says nothing about what it holds needs its layer on (false); one that
     declared an extent cannot be asked the question without switching it off behind the reader
     (null). */
  map.rows.set('world', { label: 'World field', on: false, holds: WORLD, measure: () => ({ value: 1, unit: 'm', text: '1 m' }) });
  const rows = sources.list();
  const row = rows.find((e) => e.id === 'field');
  const world = rows.find((e) => e.id === 'world');
  assert.ok(row && row.sampling, '一覧の行が 4 つの事実を運んでいない');
  assert.equal(row.sampling.visible, false);
  assert.equal(row.sampling.prepared, false, '表示が要る行が「準備されている」と述べられている');
  assert.equal(world.sampling.prepared, null, '「訊けない」が false に潰されている');
  assert.equal(row.sampling.available, false, '表示も準備もされていない行が「いま訊ける」と述べられている');
  /* and they are FOUR values, not one wearing four names */
  assert.deepEqual(Object.keys(row.sampling).sort(), ['available', 'capable', 'prepared', 'visible']);
});

test('R783 ④ 訊いて行が返らなかった行は、以後「訊ける」と言われない（表示を点けても）', async () => {
  const { map, layers, sources } = await boot();
  /* a row with NO sampler at all — js/map-ui.js hands back no row for it, ever */
  map.rows.set('mute', { label: 'Mute', on: true, features: [pt(1, 1, {})] });
  /* MEASURED BEFORE THIS ROUND: true, because the row was switched on. */
  const r = await sources.region('mute', { w: 0, s: 0, e: 2, n: 2 }, { width: 2, height: 2 });
  assert.equal(r.ok, false);
  assert.equal(r.why, 'layer-not-visible');
  assert.equal(layers.canSample('mute'), false, '訊いて誰も答えなかった行が、まだ候補として出されている');
  assert.equal(layers.samplingOf('mute').capable, false, '測った結果が保たれていない');
  map.rows.get('mute').on = true;
  assert.equal(layers.canSample('mute'), false, '表示を点けたら能力が戻ったことになっている');
});

/* ══ ⑤ 判断は 1 か所 ═════════════════════════════════════════════════════════════════════════ */

test('R783 ⑤ 2 つの経路は同じ narrowing 実装を通る（3 つの if を足したのではない）', () => {
  const src = read('js/gis-layers.js');
  assert.equal((src.match(/function pageOf\(/g) || []).length, 1, '共有された narrowing が 1 つでない');
  const calls = (src.match(/pageOf\(/g) || []).length - 1;      /* minus its own declaration */
  assert.equal(calls, 2, '両方の経路が同じ実装を通っていない: ' + calls);
  /* the condition executor and the cursor exist once */
  assert.equal((src.match(/function selectWhere\(/g) || []).length, 1);
  assert.equal((src.match(/function cursorOffset\(/g) || []).length, 1);
  /* and the old 「レイヤー名＋位置」 cursor is not handed out anywhere any more */
  assert.ok(!/key \+ '@' \+ end/.test(src), 'まだ問いを名乗らないカーソルを作っている');
});
