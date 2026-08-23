/* ============================================================================
 *  R344 — the warnings layer, audited: what it publishes, and what it re-publishes
 * ----------------------------------------------------------------------------
 *  ⚠ THE PROSE LIVES HERE ON PURPOSE. js/geo-engine.js is inside the shell budget
 *  (tests/r168 #8, ceiling 7,950 lines and it only ever goes down), so what this round
 *  MEASURED is written in this file and in DEV-NOTES.md, and the adapter carries three
 *  lines of it. This is the rule #R323 wrote after a 34-line note put the shell over.
 *
 *  ── ① 座標を1つも持たない図形は「図形」ではない ─────────────────────────────────
 *  MEASURED on the built page (world zoom, the layer on for 80 s): **27 features of the
 *  published collection had an empty geometry** — `{"type":"Polygon","coordinates":[]}`.
 *  All of them Taiwan. The 1982 township file this map indexes (g0v/twgeojson,
 *  legacy/twTown1982.json) ships **19 of its 378 features with no coordinates at all**:
 *
 *      台北市中正區 · 台南市中西區 · 台中市中區 · 基隆市仁愛區 · 高雄市鹽埕區 ·
 *      高雄市新興區 · 高雄市前金區 · 連江縣東引鄉 · 連江縣莒光鄉 · 澎湖縣七美鄉 · …
 *
 *  `twTownGeo()` asked whether `f.geometry` EXISTS, which those satisfy. So the names went
 *  into the index, `shapeOf` answered with them, and in the measured run **8 warnings in
 *  force — five of them 大雨 at rank 3 — became features that can never be drawn**.
 *
 *  Worse than invisible. `PLACED['TWN']` counted them as placed and `UNPL['TWN']` did not
 *  rise, so the country-wide wash that exists precisely to say 「something is in force here
 *  and this map cannot say where」 (#R271) was never asked for. And `dedupeSameShape`
 *  (#R298 追記) skipped them — `geomBox` returns null for such a shape — which is exactly
 *  why they survived the one pass that would otherwise have collapsed them.
 *
 *  The predicate already existed; nobody asked it. `geomBox` returns null when the walk
 *  finds no numbers at all (`if(!(w<=e&&s<=n)) return null`). So `shaped()` names it, and
 *  the three doors every shape enters through ask it: the boundary index, `setUnits`, and
 *  `unitFeature`. THE FIX IS THE PREDICATE, NOT THE COUNTRY — no future boundary set can
 *  repeat this for a different one.
 *
 *  ── ② 変わっていない地物まで、毎回まるごとシリアライズし直していた ───────────────
 *  MEASURED with a CPU profile of the built page, 70 s with the layer on:
 *
 *      MapLibre `serialize` (xs)            5,910 ms
 *      the `sendAsync` frame around it      5,594 ms
 *      ────────────────────────────────────────────
 *      main thread, for 26 uploads         11,504 ms   ← four times everything the
 *                                                        layer's own code does
 *
 *  and the payload at that moment was **13.3 MB · 5,163 features · 455,886 vertices**.
 *  `setData` has no way to say 「only these three moved」: one new warning re-walks the
 *  planet. #R290 and #R297 had already removed the uploads that said NOTHING (the content
 *  signature; the 1.5 s window). What was left were uploads that really did differ — by a
 *  handful of features out of five thousand.
 *
 *  MapLibre 5 has `GeoJSONSource.updateData({add,remove})`, which posts only the diff and
 *  re-tiles only the tiles the diff touches. It asks one thing of the caller: every feature
 *  must carry a unique id. So the contract added here is: a caller that can identify its
 *  features says `diffable` on the whole write and passes `diff` BESIDE the full collection
 *  afterwards. `data` is always the truth.
 *
 *  MEASURED, isolated (one synthetic source of 5,000 polygons / 88 vertices / 17.9 MB, no
 *  feeds, no other layer, 24 uploads each arm, interleaved in one process):
 *
 *      main-thread ms          whole      {add,remove}
 *      serialize + post        2,206          832
 *      xs alone                  711          239
 *      all of MapLibre         3,215        1,279
 *      garbage collector         623          173
 *
 *  and in the app itself, 90 s from cold at world zoom: **3 whole writes and 25 diffs**
 *  where there were 28 whole writes — 4,766 features each — i.e. about a tenth of the
 *  features handed to the serialiser. `STATE.alerts().upload` counts it, and the census
 *  counts which write the ADAPTER actually made (`diffed`), because a caller that thinks it
 *  is diffing while the adapter quietly falls back looks identical in every other number.
 *
 *  ⚠ AND THE FACADE USED TO DROP THE OPTIONS. `layers.setSourceData:(id,d)=>…(id,d)` — two
 *  arguments — so `opts.revision`, the contract #R322 added for a caller that reuses one
 *  object, could never reach the adapter from anywhere in the app. Nothing passes a
 *  revision today, which is why nobody noticed; it was unreachable, not unused.
 *
 *  ── ③ 「警報の顔ぶれが変わったか」を、配列の同一性で訊いていた ────────────────────
 *  `_qCache`, `warnIndex` and `warnedISOs` each remembered their answer under
 *  `_xxxOf===feats`. `feats` is rebuilt with `concat` on EVERY publish — a new array object
 *  every window, whatever the feeds said. So the three memos could hit WITHIN one publish
 *  and never across two, and `quietFeatures()` is called once per publish: its memo, the one
 *  standing in front of `warnMeeting` over four thousand units and every polygon difference
 *  behind it, had never once returned a cached answer.
 *
 *  ── ④ 一国の警報が1件変わると、地球上の全単位を作り直していた ────────────────────
 *  A unit's grey is `unit − ∪(the warnings of ITS OWN country that meet it)`: `warnIndex` is
 *  per country and `warnMeeting` never looks at another country's rows (#R298). One new
 *  German warning nevertheless re-ran `warnMeeting` over Japan's 1,490 municipalities.
 *  MEASURED after the per-country memo: **isoHit 1,102 / isoMiss 92** — 92 % of the country
 *  rebuilds are not done at all.
 *
 *  ── ⑤ 同じ図形の同じ鍵を、何度も綴り直していた ─────────────────────────────────
 *  `_bboxKey` is the identity this layer compares units and warnings by — `sameOutline`,
 *  `unitBoxes`, `warnMeeting`, `isNeighbourUnit`, `subtractWarnings`, the hatch cut — every
 *  unit against every candidate, every publish. MEASURED: **0.63 s of main thread in 70 s**,
 *  the busiest first-party function in the profile, four `toFixed(4)` at a time over shapes
 *  whose box `geomBox` had already remembered. After: it is not in the top thirty.
 *
 *  ── ⑥ 入力が変わったことは、出力が変わったことではない ──────────────────────────
 *  `rebuildHatchCut`'s key carries the whole collection's signature, so one warning landing
 *  anywhere re-runs it — and the CUT is the same nearly every time, because which countries
 *  are hatched changes far more slowly than the collection does. MEASURED: 18 to 40 uploads
 *  of that source in 70 s (19 features, 24,657 vertices) for a picture that had not moved.
 *
 *  ⚠ WHAT THIS ROUND DID NOT FIND. The layer's cost on this machine is dominated by
 *  `Commit` on the renderer main thread (24.6 s of a settled 30 s window, with the GPU
 *  process at 24.5 s) and hiding EVERY alert layer does not move it — so it is not the
 *  drawing, and it is not something this round could attribute in a headless browser.
 *  The numbers above are the ones that are the same in any browser: counts of what is
 *  built, and of what is handed to the renderer.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import * as acorn from 'acorn';
import { readLF } from '../scripts/eol.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readLF(join(ROOT, p));
const WP = () => read('js/world-packs.js');
const GE = () => read('js/geo-engine.js');
const CL = () => read('js/geo-command-log.js');

/* the source of one declaration, taken by its AST range — a window a regex cannot mis-cut
   (#R323) and a file's line endings cannot defeat (#R283/#R317) */
function declSource(src, name) {
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  let found = null;
  const visit = (n) => {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'FunctionDeclaration' && n.id && n.id.name === name) found = found || src.slice(n.start, n.end);
    if (n.type === 'VariableDeclarator' && n.id && n.id.name === name && n.init) found = found || src.slice(n.start, n.end);
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v.type === 'string') visit(v);
    }
  };
  visit(ast);
  return found;
}

/* ── ① a geometry with no coordinates is not a shape ─────────────────────────────────── */
test('R344 ① 座標を1つも持たない図形は「図形」ではない — and the predicate is asked at every door', () => {
  const s = WP();

  /* the predicate exists and is spelled once */
  assert.match(s, /const shaped=\(g\)=>\(g&&geomBox\(g\)\)\?g:null;/,
    'shaped() is the one place that decides whether a geometry is a shape');

  /* …and every door asks it: the boundary index, the unit list, the feature builder */
  assert.match(s, /if\(!n\|\|!shaped\(f\.geometry\)\) return;/,
    'the Taiwan township index rejects a geometry with no coordinates');
  assert.match(s, /const g=\(geoms\|\|\[\]\)\.filter\(x=>!!shaped\(x\)\);/,
    'setUnits keeps only shapes — every country’s unit index goes through it');
  assert.match(s, /function unitFeature\(iso,feed,geometry,unit,name,rows,at,got\)\{\s*if\(!shaped\(geometry\)\) return null;/,
    'unitFeature refuses to publish a feature nothing can draw');

  /* THE PREDICATE, RUN. `geomBox` is taken out of the shipped file and executed, so this is a
     statement about the code that ships rather than about a regex over it (#R317). */
  const box = new Function('_stash', 'return ' + declSource(s, 'geomBox').replace(/^function /, 'function '))(
    (o, k, v) => { try { Object.defineProperty(o, k, { value: v, configurable: true }); } catch (_) { o[k] = v; } return v; });
  assert.equal(box({ type: 'Polygon', coordinates: [] }), null, 'an empty Polygon has no box');
  assert.equal(box({ type: 'MultiPolygon', coordinates: [] }), null, 'an empty MultiPolygon has no box');
  assert.equal(box({ type: 'Polygon', coordinates: [[]] }), null, 'a Polygon with an empty ring has no box');
  assert.deepEqual(box({ type: 'Polygon', coordinates: [[[1, 2], [3, 4], [1, 4], [1, 2]]] }), [1, 2, 3, 4],
    'a real polygon still boxes');
});

/* ── ② the collection is uploaded as a change, when it is one ────────────────────────── */
test('R344 ② the publish sends {add,remove}, and the whole collection is still the truth', () => {
  const s = WP();

  /* one function owns the upload — three callers used to keep `featsSig` in step by hand */
  assert.match(s, /function uploadShown\(shown,sig\)\{/);
  /* ⚠ `SRC` is a name five layer families in this file each bind to their own source, so the
     count is over the alerts payload rather than over the identifier. */
  assert.equal((s.match(/features:shown\}/g) || []).length, 2,
    'the warnings source is written from uploadShown and nowhere else (the whole write and the diff)');
  assert.match(s, /if\(sig!==featsSig\) uploadShown\(shown,sig\);/, 'the publish still guards on the signature');
  assert.match(s, /uploadShown\(shown,featSig\(shown\)\);/, 'and the relabel / style-swap paths go through it too');

  /* the identity is the one this layer already compares by — 答えか地面か + country + outline */
  assert.match(s, /const featId=\(f\)=>\(\(\(\+f\.properties\.norm\|\|0\)>0\)\?'w':'q'\)\+FID\+f\.properties\.iso\+FID\+geomKey\(f\.geometry\);/);
  /* a collision is given a suffix rather than silently dropping a feature */
  assert.match(s, /if\(next\.has\(id\)\)\{ let k=2; while\(next\.has\(id\+FID\+k\)\) k\+\+; id=id\+FID\+k; \}/);

  /* the two writes, and which options each carries */
  assert.match(s, /GE\(\)\.layers\.setSourceData\(SRC,\{type:'FeatureCollection',features:shown\},\{diff:diff\}\);/);
  assert.match(s, /GE\(\)\.layers\.setSourceData\(SRC,\{type:'FeatureCollection',features:shown\},\{diffable:ok\}\);/);

  /* a diff that would be most of the collection is not a diff, and it resyncs on a schedule */
  assert.match(s, /const RESYNC_EVERY=\d+, DIFF_MAX_FRAC=0\.\d+, DIFF_MIN_ROOM=\d+;/);
  assert.match(s, /if\(ok&&pubIds&&pubDiffRun<RESYNC_EVERY\)\{/);
  assert.match(s, /if\(add\.length\+remove\.length<=room\) diff=\{add:add,remove:remove\};/);

  /* a fresh source holds nothing to diff against */
  assert.match(s, /if\(!GE\(\)\.layers\.hasSource\(SRC\)\)\{ featsSig=''; pubIds=null;/);

  /* and it is counted, so 「差分で送っている」 is a reading rather than a belief */
  assert.match(s, /upload:\{ whole:pubWhole, diff:pubDiff, add:pubAdd, remove:pubRemove, ids:\(pubIds\?pubIds\.size:0\), ver:featsVer \},/);
});

/* ── ② the adapter side of the same contract ─────────────────────────────────────────── */
test('R344 ② the adapter diffs only a source that took a diffable whole write, and says so', () => {
  const g = GE();

  /* THE FACADE USED TO DROP THE THIRD ARGUMENT — see the header. `opts` could not reach the
     adapter from anywhere in the app, which made #R322's `revision` contract unreachable. */
  assert.match(g, /setSourceData:\(id,d,o\)=>A\(\)\.setSourceData\(id,d,o\)/,
    'the layers facade passes the options through');
  assert.ok(!/setSourceData:\(id,d\)=>A\(\)\.setSourceData\(id,d\)/.test(g),
    'and the two-argument spelling is gone');

  /* the diff is refused unless THIS source was last written whole from a diffable payload */
  assert.match(g, /const _d=\(opts&&opts\.diff&&_sd\.diff\[id\]&&s\.updateData/);
  /* an empty diff is not a diff */
  assert.match(g, /\(\(opts\.diff\.add\?opts\.diff\.add\.length:0\)\+\(opts\.diff\.remove\?opts\.diff\.remove\.length:0\)\)\)\?opts\.diff:null;/);
  /* a throw falls back to the complete write, and the permission survives it */
  assert.match(g, /if\(_d\)\{ const _td=t0\(\); try\{ s\.updateData\(_d\); _cmd\.diffed\('sourceData'\); t1\(_cmd,'sourceData',_td\); return; \}catch\(_\)\{\} \}/);
  assert.match(g, /_sd\.diff\[id\]=!!\(opts&&\(opts\.diffable\|\|opts\.diff\)\);/);
  /* the whole write is still there, unconditionally, after all of it */
  assert.match(g, /const _t=t0\(\); s\.setData\(data\); t1\(_cmd,'sourceData',_t\); \}, removeSource\(id\)\{/);

  /* …and the reader contract stays true: after a diff MapLibre keeps a MAP of features */
  assert.match(g, /if\(d&&d\.updateable&&typeof d\.updateable\.values==='function'\) d=\{type:'FeatureCollection',features:Array\.from\(d\.updateable\.values\(\)\)\};/);

  const c = CL();
  /* the permission is per source and is forgotten with the source */
  assert.match(c, /const mem = \{ sig: Object\.create\(null\), rev: Object\.create\(null\), hash: Object\.create\(null\), diff: Object\.create\(null\) \};/);
  assert.match(c, /mem\.forget = \(id\) => \{ delete mem\.sig\[id\]; delete mem\.rev\[id\]; delete mem\.hash\[id\]; delete mem\.diff\[id\]; \};/);
  /* and the census can tell the two writes apart with the instrument switched OFF */
  assert.match(c, /function diffed\(op\) \{ tot\[op\]\.diffed = \(tot\[op\]\.diffed \|\| 0\) \+ 1; \}/);
  assert.match(c, /return \{\s*note, time, diffed,/);
  assert.match(c, /t\.msCall = t\.msCmp = t\.diffed = 0;/, 'and reset() clears it with the rest');
});

/* ── ③ the memos are keyed on content, not on the identity of an array ───────────────── */
test('R344 ③ 「顔ぶれが変わったか」は内容で決める — the three memos can hit across publishes', () => {
  const s = WP();

  assert.match(s, /let featsVer=0, _featsWKey='';/);
  assert.match(s, /function stampFeats\(list\)\{/);
  /* it hashes the country and the OUTLINE of every warned shape — the two things the quiet
     geometry and the warn index depend on */
  assert.match(s, /if\(!q\|\|!q\.iso\|\|!\(\(\+q\.norm\|\|0\)>0\)\) continue; n\+\+; mix\(q\.iso\); mix\(geomKey\(f\.geometry\)\);/);
  assert.match(s, /if\(k!==_featsWKey\)\{ _featsWKey=k; featsVer\+\+; \}/);
  assert.match(s, /stampFeats\(feats\);/, 'and the publish stamps the collection it just built');

  /* the three memos read the version */
  assert.match(s, /if\(_warnIdxOf===featsVer&&_warnIdxSet===setSig&&_warnIdx\) return _warnIdx;/);
  assert.match(s, /function warnedISOs\(\)\{ if\(_wISOof===featsVer&&_wISO\) return _wISO;/);
  assert.match(s, /if\(_qCache&&_qCacheOf===featsVer&&_qCacheKey===key\) return _qCache;/);
  /* …and none of them compares the array itself any more */
  assert.ok(!/Of===feats&&/.test(s), 'no memo is keyed on the identity of `feats`');
});

/* ── ④ the quiet ground is remembered per country ────────────────────────────────────── */
test('R344 ④ a feed that lands rebuilds its own country and nobody else’s', () => {
  const s = WP();
  assert.match(s, /function quietFor\(iso\)\{/);
  /* the key is that country's own warned outlines, its unit index, and whether the clipper is in */
  assert.match(s, /const k=\(rec&&rec\.h\?rec\.h:0\)\+'\|'\+u\.length\+'\|'\+\(UNIT_VER\[iso\]\|\|0\)\+'\|'\+\(PC\?1:0\);/);
  /* the fingerprint is accumulated where the index already spells the keys */
  assert.match(s, /rec\.h=\(Math\.imul\(\(rec\.h\|\|2166136261\)\^_sh\(bk\),16777619\)>>>0\);/);
  /* a replaced index is a different index even at the same length */
  assert.match(s, /const UNIT_VER=Object\.create\(null\);/);
  assert.match(s, /UNIT_VER\[iso\]=\(UNIT_VER\[iso\]\|\|0\)\+1;/);
  /* the counters are per country and summed back, or they would describe only what was rebuilt */
  assert.match(s, /n:\{ p:_qPunched-p0, d:_qDropped-d0, n:_qNoPunch-n0, c:_qCut-c0, l:_qCleared-l0 \} \}\); \}/);
  assert.match(s, /_qPunched\+=r\.n\.p; _qDropped\+=r\.n\.d; _qNoPunch\+=r\.n\.n; _qCut\+=r\.n\.c; _qCleared\+=r\.n\.l;/);
  /* and it is counted */
  assert.match(s, /memo:\{ isoHit:_qIsoHit, isoMiss:_qIsoMiss, diffHit:_diffHit, diffMiss:_diffMiss, diffSize:_diff\.size, diffEvict:_diffEvict \},/);
});

/* ── ⑤ the key of a shape is remembered on the shape ─────────────────────────────────── */
test('R344 ⑤ 同じ図形の鍵を綴り直さない', () => {
  const s = WP();
  assert.match(s, /const geomKey=\(g\)=>\{ if\(!g\) return ''; if\(g\.__bk!==undefined\) return g\.__bk;/);
  assert.match(s, /return _stash\(g,'__bk',_bboxKey\(geomBox\(g\)\)\);/);
  /* and nobody spells it the long way any more — that composition is the thing being removed */
  const long = (s.match(/_bboxKey\(geomBox\(/g) || []).length;
  assert.equal(long, 1, '`_bboxKey(geomBox(…))` survives only inside geomKey itself; found ' + long);
  /* the six call sites that used it now ask the remembered one */
  for (const re of [
    /const bk=geomKey\(g\); return !!\(bk&&rec\.boxes\[bk\]\); \}/,          /* sameOutline */
    /for\(let i=0;i<u\.length;i\+\+\)\{ const k=geomKey\(u\[i\]\); if\(k\) set\[k\]=1; \}/, /* unitBoxes */
    /const myKey=geomKey\(g\), boxes=unitBoxes\(iso\);/,                     /* warnMeeting */
    /const isNeighbourUnit=\(wg\)=>\{ const k=geomKey\(wg\); return !!\(k&&k!==myKey&&boxes\[k\]\); \};/,
    /const k=geomKey\(warns\[i\]\); if\(!k\) continue;/,                     /* subtractWarnings */
    /const ck=near\.map\(g=>geomKey\(g\)\|\|'\?'\)\.sort\(\)\.join\(';'\);/,  /* the hatch cut */
    /const bk=geomKey\(f\.geometry\); if\(!bk\) return;/,                    /* dedupeSameShape */
  ]) assert.match(s, re);
});

/* ── ⑥ the tables in front of the expensive work ─────────────────────────────────────── */
test('R344 ⑥ a full table is not emptied, and a count is one pass', () => {
  const s = WP();
  /* the polygon-difference table evicts the OLDEST quarter rather than clearing itself: there are
     more distinct (unit, warnings) pairs on this planet than the cap, and `clear()` at the cap is
     a thrash that gets worse the more of the world is drawn */
  assert.match(s, /if\(_diff\.size>=DIFF_MAX\)\{ _diffEvict\+\+; let n=DIFF_MAX>>2;\s*for\(const k of _diff\.keys\(\)\)\{ _diff\.delete\(k\); if\(--n<=0\) break; \} \}/);
  assert.ok(!/_diff\.clear\(\)/.test(s), 'nothing empties it whole any more');

  /* how many a country draws is one pass over the collection, not one pass per country */
  assert.match(s, /function drawnCounts\(\)\{ if\(_cntOf===featsVer&&_cnt\) return _cnt;/);
  assert.match(s, /const drawnCount=\(iso\)=>drawnCounts\(\)\[iso\]\|\|0;/);
  assert.match(s, /const feedCount=\(feed\)=>\{ const c=drawnCounts\(\);/);
  assert.ok(!/const drawnCount=\(iso\)=>feats\.filter\(/.test(s), 'the per-country filter is gone');

  /* twenty-seven regular expressions over the same agency wording, once per wording */
  assert.match(s, /const _hkMemo=new Map\(\);/);
  assert.match(s, /const hit=_hkMemo\.get\(t\); if\(hit!==undefined\) return hit;/);
  assert.match(s, /if\(_hkMemo\.size>=\d+\) _hkMemo\.clear\(\);\s*_hkMemo\.set\(t,k\); return k; \}/);
});

/* ── ⑦ a rebuild is not a redraw ─────────────────────────────────────────────────────── */
test('R344 ⑦ the hatch cut is uploaded when the CUT changed, not when the input did', () => {
  const s = WP();
  assert.match(s, /let hatchCutOut='';/);
  assert.match(s, /const osig=isos\.join\(','\)\+'\|'\+out\.map\(f=>_vcount\(_polysOf\(f\.geometry\)\|\|\[\]\)\)\.join\(','\);/);
  assert.match(s, /if\(osig===hatchCutOut\) return false;\s*hatchCutOut=osig;\s*return true; \}/);
  /* a fresh source holds nothing, so the next rebuild must upload whatever it computes */
  assert.match(s, /if\(!GE\(\)\.layers\.hasSource\(HCUT_SRC\)\)\{ hatchCutOut='';/);
  /* and how often it really was drawn is a reading */
  assert.match(s, /let hatchCutDrew=0;[\s\S]{0,140}?function applyHatchCut\(\)\{ hatchCutDrew\+\+;/);
  assert.match(s, /more:hatchCutLeftOver, drew:hatchCutDrew,/);
});

/* ── ⑧ nothing in this round changed what the layer SAYS ─────────────────────────────── */
test('R344 ⑧ the standing shape of the layer is untouched', () => {
  const s = WP();
  /* #R298: one grey, one fill layer, one opacity slider */
  assert.ok(!/addSource\('wp-alert-quiet/.test(s) && !/hasSource\('wp-alert-quiet/.test(s),
    'there is still no second quiet source — the name survives only in the notes that record its removal');
  assert.match(s, /const ALL_LYR=\(\)=>LYR\.concat\(\[CHORO,HATCH,HCUT\]\);/, '#R288: one list, one call');
  /* #R305/#R307: the difference still answers all three cases, before the covering test */
  assert.match(s, /const d=subtractWarnings\(iso,g,near\);/);
  assert.match(s, /if\(m\.covering\)\{ _qDropped\+\+; return null; \}/);
  /* #R298 追記: one feature per (country, shape), worst rank surviving */
  assert.match(s, /function dedupeSameShape\(list\)\{/);
  /* #R297: the wording is computed once per (wording, feed, rank, language) */
  assert.match(s, /let _hzMemo=Object\.create\(null\), _hzLang='';/);
});
