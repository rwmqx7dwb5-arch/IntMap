/* ============================================================================
 *  #R819 · 空間索引は「速い」ではなく「どの計算を省けたか」で測る
 * ----------------------------------------------------------------------------
 *  What the round claimed about js/gis-index.js, and therefore what has to stay true:
 *
 *    ① NO FALSE NEGATIVE, PER KIND — every kind hands out a superset of what the caller's own box
 *       test would have kept, measured against the walk with NO INDEX AT ALL.
 *    ② the seam is not a special case — an item that crosses ±180, and one that wraps the world,
 *       are candidates for the queries they actually touch, in every kind and through a pad.
 *    ③ THE DEFAULT DID NOT MOVE — build(items) with no options builds the same grid and hands out
 *       the same candidates, in the same order, as the file did before this round.
 *    ④ the work is observable: candidates, the geometry tests the caller actually ran, the share in
 *       `always`, what the index is holding, and how long build and the queries took.
 *    ⑤ 'auto' decides by that measurement and not by a name, and says which kind it built.
 *
 *  ⚠ ① IS MEASURED AGAINST NO INDEX, NOT AGAINST THE OTHER INDEX. tests/r743 records why: two
 *  readers of one wrong rule agree with each other. The reference below is a full scan with the
 *  four comparisons written out here, so a candidate set and its reference cannot share a defect.
 *
 *  ⚠ ③ IS A RECORDING, NOT A RE-DERIVATION. The digest in GOLDEN was produced by running the file
 *  AS IT STOOD BEFORE this round (git show HEAD:js/gis-index.js) over the fixture below. Rebuilding
 *  the expectation from today's source would be the same code agreeing with itself
 *  [[intmap-co-designed-reader-cannot-falsify]]. If a later round means to change what the default
 *  index hands out, this digest is the thing that must be changed deliberately — together with
 *  KERNEL_VERSION in js/gis-index.js, because a changed candidate set is a changed answer.
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { makeGisIndex } from '../js/gis-index.js';

const IX = makeGisIndex();

/* ── the fixture ───────────────────────────────────────────────────────────────────────────────
   Deterministic: an LCG with a written seed, so the digest in ③ means something and a failure is
   reproducible rather than 「たまたま出た」. The shape is the one the round is about — MOST ITEMS
   SMALL AND CLUSTERED, a few regional, a few continental — because a dataset of uniform boxes
   cannot tell the two kinds apart (measured: identical candidate counts). */
function lcg(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function mixedItems(n, seed) {
  const r = lcg(seed), out = [];
  for (let i = 0; i < n; i++) {
    const t = r();
    if (t < 0.80) {
      const w = 0.01 + r() * 0.2, h = 0.01 + r() * 0.2;
      out.push({ id: i, bbox: [130 + r() * 10, 30 + r() * 10, 0, 0] });
      const b = out[out.length - 1].bbox; b[2] = b[0] + w; b[3] = b[1] + h;
    } else if (t < 0.95) {
      const w = 1 + r() * 8, h = 1 + r() * 8;
      const x = 125 + r() * 20, y = 25 + r() * 20;
      out.push({ id: i, bbox: [x, y, x + w, y + h] });
    } else {
      const w = 40 + r() * 100, h = 20 + r() * 60;
      const x = -180 + r() * (360 - w), y = -80 + r() * (160 - h);
      out.push({ id: i, bbox: [x, y, x + w, y + h] });
    }
  }
  return out;
}

function mixedQueries(n, seed) {
  const r = lcg(seed), out = [];
  for (let i = 0; i < n; i++) {
    const w = 0.2 + r() * 3, h = 0.2 + r() * 3;
    const x = (r() < 0.8) ? (128 + r() * 14) : (-180 + r() * (360 - w));
    const y = (r() < 0.8) ? (28 + r() * 14) : (-80 + r() * (160 - h));
    out.push([x, y, x + w, y + h]);
  }
  return out;
}

/* ── the references, written out here and not imported ─────────────────────────────────────────
   `boxesMeet` is js/gis-ops.js's rule restated in four comparisons: it does NOT wrap, and it is
   what the indexed and unindexed paths both ask after the index has spoken. `wrapMeet` is the more
   inclusive reading the file promises to be a superset of — two boxes that meet only across ±180.
   ⚠ Both are the TRUTH side of the comparison. Nothing below asks the index what it thinks. */
function boxesMeet(a, b) {
  if (!a || !b) return true;
  return !(b[0] > a[2] || b[2] < a[0] || b[1] > a[3] || b[3] < a[1]);
}

function ranges(w, e) {
  if (!(isFinite(w) && isFinite(e))) return null;
  let span = e - w;
  if (span < 0) span += 360;
  if (!(span < 360)) return null;
  const a = ((w + 180) % 360 + 360) % 360 - 180;
  const b = a + span;
  return (b <= 180) ? [[a, b]] : [[a, 180], [-180, b - 360]];
}

function wrapMeet(a, b) {
  if (!a || !b) return true;
  if (b[1] > a[3] || b[3] < a[1]) return false;
  const ra = ranges(a[0], a[2]), rb = ranges(b[0], b[2]);
  if (!ra || !rb) return true;
  for (const x of ra) for (const y of rb) { if (!(y[0] > x[1] || y[1] < x[0])) return true; }
  return false;
}

function pad(box, deg) { return deg ? [box[0] - deg, box[1] - deg, box[2] + deg, box[3] + deg] : box; }

/* The walk with no index: what the candidate set has to contain. */
function scanTruth(items, q, deg, meet) {
  const out = new Set();
  const qq = pad(q, deg);
  for (let i = 0; i < items.length; i++) { if (meet(qq, items[i].bbox)) out.add(i); }
  return out;
}

function candidateSet(index, q, opts) {
  const got = new Set();
  IX.queryEach(index, q, (it, i) => { assert.equal(index.items[i], it, 'item and index disagree'); got.add(i); }, opts);
  return got;
}

const KINDS = ['grid', 'tiered', 'auto'];

/* ── ① no false negative, measured against no index at all ─────────────────────────────────── */

test('R819 ① 大小が混在するデータで、どの索引も全件走査の候補を1件も落とさない', () => {
  const items = mixedItems(400, 20250918);
  const qs = mixedQueries(60, 7717);
  for (const kind of KINDS) {
    const ix = IX.build(items, { kind });
    let truthTotal = 0;
    for (const q of qs) {
      const truth = scanTruth(items, q, 0, boxesMeet);
      const got = candidateSet(ix, q);
      truthTotal += truth.size;
      for (const i of truth) {
        assert.ok(got.has(i), `${kind}: item ${i} was kept by the scan and dropped by the index`);
      }
      /* The candidates must also be a superset of the WIDER rule, not only of the narrow one — the
         file promises to be safe for a caller that learns to wrap. */
      for (const i of scanTruth(items, q, 0, wrapMeet)) {
        assert.ok(got.has(i), `${kind}: item ${i} meets the query across the seam and was dropped`);
      }
    }
    /* A comparison that compared nothing would pass silently. */
    assert.ok(truthTotal > 100, `${kind}: the fixture produced almost no true pairs (${truthTotal})`);
  }
});

test('R819 ① pad を掛けた問い合わせでも落とさない（nearer-than の経路）', () => {
  const items = mixedItems(300, 4242);
  const qs = mixedQueries(40, 99);
  for (const kind of KINDS) {
    const ix = IX.build(items, { kind });
    for (const q of qs) {
      const truth = scanTruth(items, q, 2.5, boxesMeet);
      const got = candidateSet(ix, q, { padDeg: 2.5 });
      for (const i of truth) assert.ok(got.has(i), `${kind}: padded query dropped item ${i}`);
    }
  }
});

/* ── ② the seam ────────────────────────────────────────────────────────────────────────────── */

test('R819 ② 日付変更線をまたぐ図形・世界を一周する図形を落とさない', () => {
  /* Three forms, all of which IntMap ships: the inverted box (w > e), the plain box hugging each
     side of the seam, and the box that wraps the world. */
  const items = [
    { id: 'inverted-small', bbox: [179.4, 10, -179.4, 11] },
    { id: 'inverted-wide', bbox: [150, -20, -150, 20] },
    { id: 'east-edge', bbox: [178, 40, 180, 41] },
    { id: 'west-edge', bbox: [-180, 40, -178, 41] },
    { id: 'whole-world', bbox: [-180, -60, 180, 60] },
    { id: 'far-away', bbox: [0, 0, 1, 1] },
  ];
  const qs = [
    [179.8, 10.2, 179.9, 10.8],   // inside the eastern half of the inverted boxes
    [-179.9, 10.2, -179.8, 10.8], // inside the western half
    [179.99, 40.2, 180, 40.8],    // touching the eastern edge item
    [-180, 40.2, -179.99, 40.8],  // touching the western edge item
    [179, -5, -179, 5],           // an INVERTED QUERY box
    [0.2, 0.2, 0.4, 0.4],         // away from the seam entirely
    [120, 50, 121, 51],           // touches only whole-world
  ];
  for (const kind of KINDS) {
    const ix = IX.build(items, { kind });
    for (const q of qs) {
      const got = candidateSet(ix, q);
      for (const i of scanTruth(items, q, 0, boxesMeet)) {
        assert.ok(got.has(i), `${kind}: ${items[i].id} dropped for ${JSON.stringify(q)}`);
      }
      for (const i of scanTruth(items, q, 0, wrapMeet)) {
        assert.ok(got.has(i), `${kind}: ${items[i].id} meets ${JSON.stringify(q)} across the seam and was dropped`);
      }
    }
    /* The world-wrapping box has no bounded longitude range, so it is a candidate for EVERY query —
       the outward error the file commits deliberately. */
    for (const q of qs) assert.ok(candidateSet(ix, q).has(4), `${kind}: whole-world was not offered to every query`);
  }
});

test('R819 ② 継ぎ目の近くを pad で越える問い合わせ', () => {
  const items = [
    { id: 'west-of-seam', bbox: [-179.5, 0, -179.0, 1] },
    { id: 'east-of-seam', bbox: [179.0, 0, 179.5, 1] },
  ];
  for (const kind of KINDS) {
    const ix = IX.build(items, { kind });
    /* 2° east of the seam, grown by 5°: the padded box crosses ±180 and must reach both. */
    const got = candidateSet(ix, [178, 0.2, 178.5, 0.8], { padDeg: 5 });
    assert.ok(got.has(0) && got.has(1), `${kind}: the padded query did not cross the seam`);
  }
});

/* ── ③ the default did not move ────────────────────────────────────────────────────────────── */

/* RECORDED from js/gis-index.js as it stood at HEAD before #R819, over mixedItems(400, 20250918)
   and mixedQueries(60, 7717). `digest` is sha256 of the JSON of the per-query candidate INDEX
   ARRAYS — the set AND the order, because a caller that stops early (fn returning false) gets the
   first candidate and not an arbitrary one. */
const GOLDEN = {
  digest: '67c13df2d89725cea63324bf4bc2394c74ae4fe44a37649672d426a1e4ad09e2',
  total: 2905,
  shape: { cells: 696, entries: 1547, oversize: 40, maxPerCell: 9, cellDeg: 0.7462848670780658, indexed: 360 },
};

test('R819 ③ 既定の索引は、変更前と同じ候補集合を同じ順で返す', () => {
  const items = mixedItems(400, 20250918);
  const qs = mixedQueries(60, 7717);
  const ix = IX.build(items);
  assert.equal(IX.stats(ix).kind, 'grid', 'the default kind moved');
  const seq = qs.map((q) => { const got = []; IX.queryEach(ix, q, (it, i) => { got.push(i); }); return got; });
  assert.equal(seq.reduce((a, b) => a + b.length, 0), GOLDEN.total);
  assert.equal(createHash('sha256').update(JSON.stringify(seq)).digest('hex'), GOLDEN.digest,
    'the default index hands out a different candidate set than it did before #R819');
  const s = IX.stats(ix);
  for (const k of Object.keys(GOLDEN.shape)) assert.equal(s[k], GOLDEN.shape[k], `stats().${k} moved`);
});

test('R819 ③ 種別を知らない名前で頼まれたら、既定の索引を返して kind でそう述べる', () => {
  const items = mixedItems(120, 5);
  const ix = IX.build(items, { kind: 'r-tree' });
  assert.equal(IX.stats(ix).kind, 'grid');
  const q = [130, 30, 133, 33];
  for (const i of scanTruth(items, q, 0, boxesMeet)) assert.ok(candidateSet(ix, q).has(i));
});

/* ── ④ the work is observable ──────────────────────────────────────────────────────────────── */

test('R819 ④ 候補数・実際に幾何判定した件数・always の割合・保持容量が索引から読める', () => {
  const items = mixedItems(400, 20250918);
  const qs = mixedQueries(60, 7717);
  const ix = IX.build(items);

  /* The caller's exact test handed IN, which is the only way `delivered` can be counted once. */
  let ranTest = 0, passedTest = 0, sawGeometry = 0;
  for (const q of qs) {
    IX.queryEach(ix, q, () => { sawGeometry++; }, {
      test: (m) => { ranTest++; const ok = boxesMeet(q, m.bbox); if (ok) passedTest++; return ok; },
    });
  }
  const s = IX.stats(ix);

  assert.equal(s.items, 400);
  assert.equal(s.queries, qs.length);
  assert.equal(s.candidates, GOLDEN.total, 'candidates is not the number of candidates');
  assert.equal(s.candidates, ranTest, 'the exact test ran on a different number than `candidates`');
  assert.equal(s.delivered, passedTest, '`delivered` is not what survived the caller\'s test');
  assert.equal(s.delivered, sawGeometry, '`delivered` is not what the geometry predicate saw');
  assert.equal(s.scanned, 400 * qs.length, 'the denominator is not items × queries');
  assert.ok(s.candidates < s.scanned, 'the index removed nothing');
  assert.ok(s.candidateRatio > 0 && s.candidateRatio < 1);

  /* always と保持容量 */
  assert.equal(s.oversize, GOLDEN.shape.oversize);
  assert.ok(Math.abs(s.oversizeRatio - (s.oversize / s.items)) < 1e-12);
  assert.equal(s.retained.entries, s.entries);
  assert.equal(s.retained.cells, s.cells);
  assert.equal(s.retained.always, s.oversize);
  assert.ok(s.retained.bytesApprox > s.entries * 8, 'the retained estimate ignores the cells');

  /* 時間は測れたか。⚠ 値そのものは環境依存なので「非負で有限」だけを主張する——
     ミリ秒の床しか無い時計では 0 が正しい答えになりうる。 */
  for (const k of ['buildMs', 'queryMs']) {
    assert.equal(typeof s[k], 'number');
    assert.ok(isFinite(s[k]) && s[k] >= 0, `${k} is not a measurement`);
  }
});

test('R819 ④ opts.test を渡さなければ delivered は candidates と等しい（渡されたものは全部見られた）', () => {
  const items = mixedItems(200, 31);
  const ix = IX.build(items);
  let seen = 0;
  for (const q of mixedQueries(20, 32)) IX.queryEach(ix, q, () => { seen++; });
  const s = IX.stats(ix);
  assert.equal(s.delivered, s.candidates);
  assert.equal(s.delivered, seen);
});

test('R819 ④ 途中で止めた問い合わせは、止めたと記録され、それ以上は配らない', () => {
  const items = mixedItems(200, 77);
  const ix = IX.build(items);
  let seen = 0;
  const n = IX.queryEach(ix, [130, 30, 140, 40], () => { seen++; return false; });
  const s = IX.stats(ix);
  assert.equal(seen, 1, 'the walk did not stop when fn said to');
  assert.equal(s.stopped, 1);
  assert.equal(s.delivered, 1);
  assert.equal(n, s.candidates);
});

test('R819 ④ resetMetrics は問い合わせの計数だけを 0 に戻し、構築時間は残す', () => {
  const items = mixedItems(150, 8);
  const ix = IX.build(items);
  for (const q of mixedQueries(10, 9)) IX.queryEach(ix, q, () => { });
  const before = IX.stats(ix);
  assert.ok(before.queries === 10);
  IX.resetMetrics(ix);
  const after = IX.stats(ix);
  assert.equal(after.queries, 0);
  assert.equal(after.candidates, 0);
  assert.equal(after.delivered, 0);
  assert.equal(after.buildMs, before.buildMs, 'the build happened once and did not un-happen');
  /* 構造は索引そのものの性質なので、計数を戻しても変わらない。 */
  assert.equal(after.cells, before.cells);
  assert.equal(after.entries, before.entries);
});

test('R819 ④ 問い合わせ矩形が読めないときは全件走査と記録され、全件が候補になる', () => {
  const items = mixedItems(80, 12);
  const ix = IX.build(items);
  const got = candidateSet(ix, null);
  assert.equal(got.size, items.length);
  assert.equal(IX.stats(ix).scans, 1);
});

/* ── ⑤ auto decides by the measurement ─────────────────────────────────────────────────────── */

test('R819 ⑤ auto は always の割合で選び、どちらを建てたか述べる', () => {
  /* 大小の差が大きいほう: this fixture measured 40/400 = 10% oversize under the grid. */
  const mixed = mixedItems(400, 20250918);
  assert.ok(IX.stats(IX.build(mixed)).oversizeRatio > 0.05, 'the fixture no longer exercises the threshold');
  assert.equal(IX.stats(IX.build(mixed, { kind: 'auto' })).kind, 'tiered');

  /* 均一なほう: every item the same size, so nothing is oversized and the grid is kept. */
  const r = lcg(3), uniform = [];
  for (let i = 0; i < 400; i++) { const x = 130 + r() * 10, y = 30 + r() * 10; uniform.push({ bbox: [x, y, x + 0.05, y + 0.05] }); }
  const gridStats = IX.stats(IX.build(uniform));
  assert.equal(gridStats.oversize, 0);
  assert.equal(IX.stats(IX.build(uniform, { kind: 'auto' })).kind, 'grid');

  /* ⚠ 均一なデータでは階層型は1段しか持たず、候補も同じ数になる——だから
     この1つの数だけで選んでよい（js/gis-index.js の AUTO_OVERSIZE_RATIO の実測）。 */
  const qs = mixedQueries(40, 4);
  const count = (kind) => {
    const ix = IX.build(uniform, { kind });
    for (const q of qs) IX.queryEach(ix, q, () => { });
    return IX.stats(ix).candidates;
  };
  assert.equal(count('tiered'), count('grid'));
});

test('R819 ⑤ 階層型は、読めない矩形以外を always に入れない', () => {
  const items = mixedItems(400, 20250918).concat([
    { id: 'no-box', bbox: null },
    { id: 'malformed', bbox: [10, 50, 12, 40] },
    { id: 'whole-world', bbox: [-180, -90, 180, 90] },
  ]);
  const t = IX.stats(IX.build(items, { kind: 'tiered' }));
  assert.equal(t.kind, 'tiered');
  assert.equal(t.oversize, 3, 'the tiered index sent placeable items to `always`');
  assert.ok(t.levels.length > 1, 'the tiered index built a single level for data that spans sizes');
  const g = IX.stats(IX.build(items));
  assert.ok(g.oversize > t.oversize, 'the grid no longer differs from the hierarchy on this input');
  assert.equal(g.levels.length, 1);
});

test('R819 ⑤ 階層型は、大きい図形にかかる候補数を実際に減らす', () => {
  const items = mixedItems(400, 20250918);
  const qs = mixedQueries(60, 7717);
  const counts = {};
  for (const kind of ['grid', 'tiered']) {
    const ix = IX.build(items, { kind });
    for (const q of qs) IX.queryEach(ix, q, () => { }, { test: (m) => boxesMeet(q, m.bbox) });
    counts[kind] = IX.stats(ix);
  }
  assert.ok(counts.tiered.candidates < counts.grid.candidates,
    `tiered ${counts.tiered.candidates} は grid ${counts.grid.candidates} より少なくならなかった`);
  /* ⚠⚠⚠ AND THE ANSWER IS THE SAME. 候補が減ったことは、正しく減ったことを意味しない——
     呼び出し側の厳密判定を通った件数が一致することが、減らしてよかったことの証拠。 */
  assert.equal(counts.tiered.delivered, counts.grid.delivered,
    'the two kinds disagree about what survives the exact test');
});

/* ── degenerate inputs ─────────────────────────────────────────────────────────────────────── */

test('R819 退化した入力 — 同一地点の点群に広い問い合わせ（過去にハングした形）', () => {
  const items = [];
  for (let i = 0; i < 50; i++) items.push({ bbox: [12.5, 41.9, 12.5, 41.9] });
  for (const kind of KINDS) {
    const ix = IX.build(items, { kind });
    const t0 = Date.now();
    const got = candidateSet(ix, [2, 32, 22, 52]);
    assert.ok(Date.now() - t0 < 2000, `${kind}: the query did not return promptly`);
    assert.equal(got.size, 50);
  }
});

test('R819 退化した入力 — 空の索引、矩形の無い項目', () => {
  for (const kind of KINDS) {
    const empty = IX.build([], { kind });
    assert.equal(IX.queryEach(empty, [0, 0, 1, 1], () => { }), 0);
    const s = IX.stats(empty);
    assert.equal(s.items, 0);
    assert.equal(s.oversizeRatio, 0);
    assert.equal(s.scanned, 0);

    const some = IX.build([{ bbox: null }, { bbox: [0, 0, 1, 1] }, { nope: true }], { kind });
    assert.equal(IX.stats(some).oversize, 2);
    assert.equal(candidateSet(some, [100, 60, 101, 61]).size, 2, `${kind}: 読めない矩形が全問い合わせの候補になっていない`);
  }
});

test('R819 同じ項目は一度しか配られない（重複は集計の二重計上と同じ誤り）', () => {
  const items = mixedItems(300, 61);
  for (const kind of KINDS) {
    const ix = IX.build(items, { kind });
    for (const q of mixedQueries(30, 62)) {
      const seen = [];
      IX.queryEach(ix, q, (it, i) => { seen.push(i); });
      assert.equal(seen.length, new Set(seen).size, `${kind}: 同じ項目が二度配られた`);
    }
  }
});

test('R819 版の宣言は読める（scripts/gis-kernel-versions.mjs の台帳が見る欄）', () => {
  assert.equal(typeof IX.version(), 'string');
  assert.ok(IX.version().length > 0);
});
