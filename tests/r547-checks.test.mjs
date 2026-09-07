/* ============================================================================
 *  #R547 — ASKING A VISION MODEL WHERE THE SKY STOPS
 * ----------------------------------------------------------------------------
 *  Every check here runs the SHIPPED module. #R505 is the round where a suite that read source text
 *  stayed green while production answered 500 to every request, and #R527's own trace has never had
 *  a test that looked at what it produced — only at whether it was registered. So: synthetic images
 *  go in, real traces come out, and the assertions are about the traces.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

globalThis.window = globalThis.window || {};
await import('../js/photo-geo-skyline.js');
await import('../js/photo-geo-vision.js');
await import('../js/photo-geo-search.js');
const S = globalThis.IntMapPhotoSkyline;
const V = globalThis.IntMapPhotoVision;
const SEARCH = globalThis.IntMapPhotoSearch || globalThis.window.IntMapPhotoSearch;

/* a picture with a known answer: bright sky over a sawtooth ridge, plus — where asked — a DARK
   FOREGROUND BAND well below it, which is the thing every edge detector in this feature's history
   has mistaken for the mountain */
function scene(w, h, ridge, treeTop) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const sky = y < ridge(x);
      const tree = treeTop != null && y >= treeTop(x);
      d[i] = tree ? 12 : (sky ? 150 : 40);
      d[i + 1] = tree ? 30 : (sky ? 190 : 70);
      d[i + 2] = tree ? 10 : (sky ? 245 : 45);
      d[i + 3] = 255;
    }
  }
  return { width: w, height: h, data: d };
}
const RIDGE = (x) => Math.round(34 + 12 * Math.sin(x / 13) + 5 * Math.sin(x / 4));
const meanErr = (sk, truth, w) => {
  let e = 0; for (let x = 0; x < w; x++) e += Math.abs(sk.sky[x] - truth(x));
  return e / w;
};

/* ── ① the automatic detector still does what #R527 built it to do ────────────────────────────── */
test('① extract() still traces the ridge from pixels alone, and stamps itself `auto`', () => {
  const W = 160, H = 100;
  const sk = S.extract(scene(W, H, RIDGE));
  assert.equal(sk.source, 'auto', 'the trace must say which detector produced it');
  assert.ok(meanErr(sk, RIDGE, W) < 1.5, 'auto trace mean error ' + meanErr(sk, RIDGE, W).toFixed(2) + ' px');
  assert.equal(S.usableColumns(sk), W);
  assert.ok(sk.quality.separation > 1, 'a clean two-colour picture must separate cleanly');
});

/* ── ② the band is the whole safety of the model path ─────────────────────────────────────────
   A guide pointing at the RIDGE must survive a picture whose strongest edge is the tree line
   below it — and a guide pointing at the tree line must NOT be dragged up to the ridge. Both
   directions, because a band that only ever agrees with the pixels is not a band. */
test('② refineFromBoundary() cannot leave the guide by more than the band, in either direction', () => {
  const W = 160, H = 120;
  const TREE = (x) => RIDGE(x) + 45;
  const img = scene(W, H, RIDGE, TREE);

  const atRidge = new Int32Array(W); for (let x = 0; x < W; x++) atRidge[x] = RIDGE(x) + 3;
  const a = S.refineFromBoundary(img, atRidge, { bandPx: 5 });
  assert.equal(a.source, 'llm');
  for (let x = 0; x < W; x++) assert.ok(Math.abs(a.sky[x] - atRidge[x]) <= 5, 'column ' + x + ' left the band');
  assert.ok(meanErr(a, RIDGE, W) < 2.5, 'inside the band it should snap ONTO the ridge, err=' + meanErr(a, RIDGE, W).toFixed(2));

  const atTree = new Int32Array(W); for (let x = 0; x < W; x++) atTree[x] = TREE(x);
  const b = S.refineFromBoundary(img, atTree, { bandPx: 5 });
  for (let x = 0; x < W; x++) assert.ok(Math.abs(b.sky[x] - atTree[x]) <= 5, 'the band did not hold at column ' + x);
  assert.ok(meanErr(b, RIDGE, W) > 30, 'a guide on the tree line must STAY there — the band is not advisory');
});

test('② b — with no band the same guide is ignored, which is why the band has to exist', () => {
  const W = 160, H = 120;
  const TREE = (x) => RIDGE(x) + 45;
  const img = scene(W, H, RIDGE, TREE);
  const atTree = new Int32Array(W); for (let x = 0; x < W; x++) atTree[x] = TREE(x);
  const free = S.refineFromBoundary(img, atTree, {});
  assert.ok(meanErr(free, TREE, W) > 8,
    'without a band the dynamic program follows the pixels, not the guide — if this ever fails, ② is proving nothing');
});

/* ── ③ a guide the trace cannot follow is an empty search, not a tight one ─────────────────────── */
test('③ slopeLimit() makes every band reachable, so a vertical polyline still produces a trace', () => {
  const W = 120, H = 100;
  const img = scene(W, H, RIDGE);
  const cliff = new Int32Array(W);
  for (let x = 0; x < W; x++) cliff[x] = x < 60 ? 10 : 88;   /* 78 rows in one column */
  const sk = S.refineFromBoundary(img, cliff, { bandPx: 3 });
  assert.ok(sk, 'a jumping guide must still produce a trace');
  for (let x = 0; x < W; x++) assert.ok(Number.isFinite(sk.sky[x]) && sk.sky[x] >= 0 && sk.sky[x] < H,
    'column ' + x + ' has no finite row — the bands did not overlap');
  const D = Math.max(2, Math.round(H * S.MAX_SLOPE_FRAC));
  const lim = S.slopeLimit(cliff, W, D);
  for (let x = 1; x < W; x++) assert.ok(Math.abs(lim[x] - lim[x - 1]) <= D, 'slopeLimit left a jump at ' + x);
});

/* ── ④ a column nobody has an opinion about is skipped, not filed under «ground» ──────────────── */
test('④ a guide of -1 takes no part in the colour model', () => {
  const W = 80, H = 60;
  const img = scene(W, H, RIDGE);
  const half = new Int32Array(W);
  for (let x = 0; x < W; x++) half[x] = x < 40 ? RIDGE(x) : -1;
  const sk = S.refineFromBoundary(img, half, { bandPx: 4 });
  assert.ok(sk.quality.separation > 1,
    'the unguided half must be ignored by separation(); clamping -1 to 0 would file it all as ground and collapse it');
  for (let x = 0; x < 40; x++) assert.ok(Math.abs(sk.sky[x] - RIDGE(x)) <= 4);
});

/* ── ⑤ the reply is checked here, and «no skyline» is an answer ───────────────────────────────── */
test('⑤ normalise() refuses what is not a traced ridge, with a reason', () => {
  const W = 900, H = 600;
  assert.equal(V.normalise(null, W, H).why, 'unreadable');
  assert.equal(V.normalise('a curve', W, H).why, 'unreadable');
  assert.equal(V.normalise({ hasSkyline: false, points: [], excluded: [], note: 'a cat' }, W, H).why, 'no_skyline',
    '«there is no skyline here» must survive as its own answer — the whole false-positive control of #R527 §5.3 rests on it');
  assert.equal(V.normalise({ hasSkyline: true, points: [{ x: 1, y: 1 }, { x: 900, y: 300 }], excluded: [], note: '' }, W, H).why,
    'too_few_points');
  const narrow = [];
  for (let i = 0; i < 20; i++) narrow.push({ x: 400 + i, y: 300 });
  assert.equal(V.normalise({ hasSkyline: true, points: narrow, excluded: [], note: '' }, W, H).why, 'too_narrow');
});

test('⑤ b — a good reply lands in analysis pixels, sorted, with duplicate columns merged', () => {
  const W = 1000, H = 500;   /* one analysis pixel per box unit in x, so the mapping is readable */
  const pts = [{ x: 900, y: 100 }, { x: 0, y: 200 }, { x: 500, y: 300 }, { x: 500, y: 500 }, { x: 250, y: 0 }];
  const n = V.normalise({ hasSkyline: true, confidence: 1.7, points: pts, excluded: [{ x0: 800, x1: 700, why: 'trees' }], note: 'ok' }, W, H);
  assert.equal(n.ok, true);
  for (let i = 1; i < n.points.length; i++) assert.ok(n.points[i][0] >= n.points[i - 1][0], 'points must come back left to right');
  const at500 = n.points.find((p) => p[0] === Math.round(500 / V.BOX * (W - 1)));
  assert.ok(at500 && Math.abs(at500[1] - (400 / V.BOX * (H - 1))) < 1,
    'two points in one column are one point at their mean, not whichever the model emitted first');
  assert.equal(n.confidence, 1, 'confidence is clamped into 0..1 rather than trusted');
  assert.equal(n.excluded.length, 1);
  assert.ok(n.excluded[0].x0 < n.excluded[0].x1, 'a reversed span is a span');
});

/* ── ⑥ excluded stretches are excluded from the EVIDENCE, not merely from the drawing ──────────── */
test('⑥ toGuide() + refineFromBoundary() drop hidden columns from `use`', () => {
  const W = 200, H = 120;
  const img = scene(W, H, RIDGE);
  const pts = [];
  for (let x = 0; x <= 190; x += 10) pts.push({ x: Math.round(x / (W - 1) * V.BOX), y: Math.round(RIDGE(x) / (H - 1) * V.BOX) });
  const n = V.normalise({
    hasSkyline: true, confidence: 0.8, points: pts, note: 'ridge',
    excluded: [{ x0: Math.round(50 / (W - 1) * V.BOX), x1: Math.round(90 / (W - 1) * V.BOX), why: 'conifers' }]
  }, W, H);
  assert.equal(n.ok, true);
  const g = V.toGuide(n, W, H);
  for (let x = 51; x <= 89; x++) assert.equal(g.use[x], 0, 'column ' + x + ' is hidden and must not count as evidence');
  assert.ok(g.guide[10] >= 0 && g.guide[60] >= 0, 'a hidden column is still GUIDED, so the trace stays sane across it');
  assert.equal(g.guide[199], -1, 'outside the polyline the guide has no opinion');
  const sk = S.refineFromBoundary(img, g.guide, { bandPx: g.bandPx, use: g.use });
  for (let x = 51; x <= 89; x++) assert.equal(sk.use[x], 0, 'the exclusion must reach the trace, not stop at the guide');
  assert.ok(S.usableColumns(sk) < W && S.usableColumns(sk) > W * 0.5);
});

/* ── ⑦ the two claims that must never be written by hand ──────────────────────────────────────── */
test('⑦ the photograph is not sent without recorded consent, and the claim is derived from the trace', () => {
  assert.equal(V.gate({ consent: false, online: true }).allowed, false);
  assert.equal(V.gate({ consent: false, online: true }).why, 'needs_consent');
  assert.equal(V.gate({ consent: true, online: false }).allowed, false);
  assert.equal(V.gate({ consent: true, online: true }).allowed, true);
  assert.equal(V.gate({}).allowed, false, 'an empty state is not consent');

  assert.equal(V.privacyNote('llm'), 'sent_to_provider');
  assert.equal(V.privacyNote('auto'), 'stayed_on_device');
  assert.equal(V.privacyNote(undefined), 'stayed_on_device');
  /* and the panel must ASK it rather than carry two sentences of its own */
  const panel = rd('js/photo-geo.js');
  assert.ok(/privacyNote\(/.test(panel), 'js/photo-geo.js must derive the provenance sentence, not choose it');
  const stayed = panel.match(/stayed on this device/g) || [];
  assert.equal(stayed.length, 1, 'exactly one «stayed on this device» sentence, reachable only through privacyNote');
});

/* ── ⑧ the schema and the task are ones ai-proxy actually accepts ──────────────────────────────
   The numbers are READ OUT OF ai-proxy, not copied here: a limit that moved would otherwise leave
   this test green while the schema was silently dropped and the reply stopped being checked. */
test('⑧ the request ai-proxy is asked for is one ai-proxy allows', () => {
  const px = rd('supabase/functions/ai-proxy/index.ts');
  /* ⚠ the limits are written as `16 * 1024`, so reading the first integer would have called the
     ceiling 16 bytes and passed anything. Take the whole right-hand side and multiply it out. */
  const num = (name) => {
    const m = px.match(new RegExp('\\b' + name + '\\s*=\\s*([0-9_ *]+);'));
    assert.ok(m, name + ' is gone from ai-proxy (or is no longer a plain product) — this check has lost its footing');
    return m[1].split('*').reduce((a, part) => a * Number(part.replace(/[_ ]/g, '')), 1);
  };
  const json = JSON.stringify(V.SCHEMA);
  assert.ok(Buffer.byteLength(json) < num('MAX_SCHEMA_BYTES'), 'the schema is over ai-proxy\'s size limit and would be dropped');
  const depth = (o) => (o && typeof o === 'object')
    ? 1 + Math.max(0, ...Object.values(o).map(depth)) : 0;
  assert.ok(depth(V.SCHEMA) <= num('MAX_SCHEMA_DEPTH'), 'the schema is deeper than ai-proxy accepts');
  const keys = (o) => (o && typeof o === 'object')
    ? Object.keys(o).length + Object.values(o).reduce((a, v) => a + keys(v), 0) : 0;
  assert.ok(keys(V.SCHEMA) <= num('MAX_SCHEMA_KEYS'), 'the schema has more keys than ai-proxy accepts');

  const opts = V.callOptions();
  assert.equal(opts.task, 'vision_read');
  assert.ok(new RegExp('JSON_TASKS[\\s\\S]{0,400}[\'"]' + opts.task + '[\'"]').test(px),
    'the task must be one ai-proxy puts in JSON mode, or the schema is never attached');
  assert.equal(opts.webMode, 'off', 'tracing a ridge is not a web search');
  /* the picture is sent as a JPEG data URL (js/photo-geo.js state.orig.url) */
  const mime = px.match(/IMAGE_MIME\s*=\s*([\s\S]{0,200}?);/);
  assert.ok(mime && /jpeg/.test(mime[1]), 'ai-proxy no longer accepts image/jpeg — the panel sends one');

  /* ⚠ strict structured output requires every property to be required and no extras, at every
     level. A schema that fails this is DOWNGRADED silently, so assert it rather than hope. */
  (function strict(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'object') {
      assert.equal(node.additionalProperties, false, 'every object in the schema must forbid extras');
      assert.deepEqual([...(node.required || [])].sort(), Object.keys(node.properties || {}).sort(),
        'every property must be required');
    }
    Object.values(node).forEach(strict);
  })(V.SCHEMA);
});

/* ── ⑨ the list is ordered by the number it prints ────────────────────────────────────────────── */
test('⑨ the panel reads which quantity ordered the candidates instead of naming one', () => {
  assert.equal(typeof SEARCH.rankValue, 'function');
  const cands = [{ score: 0.9, agreement: 0.4 }, { score: 0.7, agreement: 0.95 }, { score: 0.5, agreement: 0.6 }];
  const res = { rankedBy: 'score', candidates: cands };
  assert.equal(SEARCH.rankValue(res, cands[0]), 0.9);
  assert.equal(SEARCH.orderedByRank(res), true, 'ranked by score, this list is in order');
  assert.equal(SEARCH.orderedByRank({ rankedBy: 'agreement', candidates: cands }), false,
    'the same list read as «agreement» is NOT in order — that mismatch is what the reader was seeing');
  assert.equal(SEARCH.rankValue({}, cands[1]), 0.7, 'a result from before rankedBy existed was ranked by score');
  assert.ok(/rankedBy:\s*RANK/.test(rd('js/photo-geo-search.js')), 'the search must publish the key it sorted on');
  assert.ok(/rankValue\(/.test(rd('js/photo-geo.js')), 'the panel must print the ranked quantity, not one of its own choosing');
});

/* ── ⑩ registration: the new module is reachable, shipped and written down ─────────────────────── */
test('⑩ js/photo-geo-vision.js is imported by the panel and listed in both ledgers', () => {
  assert.ok(/import '\.\/photo-geo-vision\.js';/.test(rd('js/photo-geo.js')),
    'the module must ride the photoGeo chunk, not be fetched by itself');
  assert.ok(/photo-geo-vision\.js/.test(rd('docs/FILES.md')), 'docs/FILES.md must carry a line for it');
  assert.ok(/photo-geo-vision\.js/.test(rd('Architecture.md')), 'Architecture.md §2.4 must carry a row for it');
  assert.ok(/photo-geo-vision\.js/.test(rd('docs/PHOTO-GEOLOCATION.md')), 'the feature document must describe it');
});
