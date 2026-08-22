/* ============================================================================
 *  IntMap · #R307 — source-level checks
 * ----------------------------------------------------------------------------
 *  Three reports, all of them repeats:
 *    ①「何も発令されていないのに、灰色に塗られていない場所がある。五條市のように、同じ市町村でも
 *        発令単位では分かれている場合なども考慮して。」                                    (4回目)
 *    ②「風レイヤーは品質保ったまま、起動から日時変更からすべてに至るまで、爆速にしろ。」    (3回目)
 *    ③「一回地点選んだらそのあとのやつも全部その地点で強制開始とかあほか。」               (4回目)
 *
 *  ⚠ THE ASSERTIONS BELOW ARE RELATIONS, NOT SPELLINGS. Twenty-four rounds running, this project has
 *  had legitimate changes turned red by a check that pinned a literal — #R306's own ⑥ pinned a
 *  {0,600} character window that CRLF pushed to 615 bytes, so CI was green and Windows was red. What
 *  each of these asks is 「does the call sit where the fix put it」, of the FUNCTION BODY, and where a
 *  number matters it is asked as an inequality against the thing it has to be big enough for.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pc from 'polygon-clipping';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
/* the comments in this project carry the reasoning, and several of them QUOTE the spellings that
   were replaced — a check that greps them proves nothing */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* the body of a named function declaration, brace-balanced (the #R228 helper, and the answer to
   #R306's ⚠ about character-counted windows: ask the BODY, not a byte range around a name) */
function fnBody(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, 'function ' + name + ' exists');
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) return src.slice(open, i + 1); }
  }
  throw new Error('unbalanced braces in ' + name);
}
/* a `var NAME = <arithmetic>` initialiser, evaluated — `constFrom` only reads plain literals and
   these are written as `64 * 1024` so the relation between them stays readable */
function numFrom(src, name) {
  const m = new RegExp('\\b' + name + '\\s*=\\s*([0-9*+ ]+)').exec(src);
  assert.ok(m, name + ' is declared as arithmetic on numbers');
  return Function('return (' + m[1] + ')')();
}

/* ══ ① 灰色は「穴が開けられるか」ではなく「単位 − 警報」である ══════════════════════════════════ */
test('R307 ① the quiet unit is the DIFFERENCE, and the punch is only the fallback', () => {
  const s = code('js/world-packs.js');
  const body = fnBody(s, 'quietGeomFor');
  const iDiff = body.indexOf('subtractWarnings(');
  const iPunch = body.indexOf('punchQuiet(');
  assert.ok(iDiff > 0, 'quietGeomFor computes the difference');
  assert.ok(iPunch > 0, '…and #R305’s punch is still there');
  assert.ok(iDiff < iPunch, 'the difference is asked FIRST — the punch is what happens when it cannot answer');
  /* 「covering」 is a bbox-and-a-point approximation of the same question, so the exact answer
     outranks it (a warning whose box contains the unit does not necessarily cover the unit) */
  assert.ok(iDiff < body.indexOf('m.covering'), 'and it outranks the bbox approximation of the same question');
});

test('R307 ② the candidate set is every warning whose BOX meets the unit, not only the ones a point found', () => {
  const s = code('js/world-packs.js');
  const meet = fnBody(s, 'warnMeeting');
  assert.ok(/near:\s*warnsNear\(/.test(meet), 'warnMeeting carries the bbox candidate set');
  assert.equal((meet.match(/near:\s*warnsNear\(/g) || []).length, 2,
    '…on BOTH exits, so a unit the covering test matched still gets the exact answer');
  const near = fnBody(s, 'warnsNear');
  assert.ok(/bb\[2\]<ub\[0\]\|\|bb\[0\]>ub\[2\]\|\|bb\[3\]<ub\[1\]\|\|bb\[1\]>ub\[3\]/.test(near),
    'the filter is bbox overlap in both axes');
  assert.ok(near.includes('rec.all'), 'and a unit whose box is too big to walk the cell index falls back to the flat list');
  /* the flat list has to exist, or that fallback is a silent empty answer */
  assert.ok(/\(rec\.all\|\|\(rec\.all=\[\]\)\)\.push\(/.test(s), 'warnIndex builds it');
});

test('R307 ③ the clipper is lazy, declared, and never the only way to draw', () => {
  const s = code('js/world-packs.js');
  assert.ok(/import\('polygon-clipping'\)/.test(s), 'it arrives on its own chunk, not in the boot path');
  const sub = fnBody(s, 'subtractWarnings');
  assert.ok(/const pc=clipper\(\); if\(!pc\) return undefined;/.test(sub),
    'no clipper → no answer, which is what makes the punch below still run');
  const q = fnBody(s, 'quietGeomFor');
  assert.ok(/if\(d!==undefined\)/.test(q), 'and quietGeomFor distinguishes 「cannot answer」 from 「nothing left」');
  /* a transitive dependency is not a dependency — @turf/union happens to pull this in today */
  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.dependencies['polygon-clipping'], 'polygon-clipping is declared, not reached through turf');
});

test('R307 ④ the library really does cut a straddling warning, and winds holes the way MapLibre reads them', () => {
  /* #R305's ⚠: MapLibre's classifyRings starts a NEW polygon whenever a ring's signed area has the
     same sign as the first one's, so a hole copied in as-is is FILLED — the two-coat defect, in the
     one place it is hardest to see. This asks the library, not the source text. */
  const square = [[[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]];
  const inside = [[[[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]]]];
  const area2 = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return a / 2; };

  const holed = pc.difference(square, inside);
  assert.equal(holed.length, 1, 'a warning strictly inside a unit leaves one polygon');
  assert.equal(holed[0].length, 2, '…with a hole in it');
  assert.ok(Math.sign(area2(holed[0][0])) !== Math.sign(area2(holed[0][1])),
    'and the hole is wound OPPOSITE to its outer ring');

  /* the case the punch could never state, and the whole reason for this round */
  const straddle = [[[[8, 3], [14, 3], [14, 7], [8, 7], [8, 3]]]];
  const cut = pc.difference(square, straddle);
  assert.equal(cut.length, 1, 'a warning that leaves the unit still cuts it');
  assert.ok(Math.abs(Math.abs(area2(cut[0][0])) - 92) < 1e-6, '…by exactly the overlapping part');

  assert.deepEqual(pc.difference(square, [[[[-1, -1], [11, -1], [11, 11], [-1, 11], [-1, -1]]]]), [],
    'and a warning that covers the unit leaves nothing, which is 「drop it」');
});

/* ══ ⑤ 五條市 — 同じ市町村が複数の発令単位に分かれている ══════════════════════════════════════ */
test('R307 ⑤ a municipality split into several issuing units is drawn on the units, not on the municipality', () => {
  const s = code('js/world-packs.js');
  const split = fnBody(s, 'jpSplitCodes');
  /* derived from the JMA's own area.json, not a hand-written list of the forty */
  assert.ok(/slice\(0,\s*5\)/.test(split), 'the grouping key is the class20 code’s municipality prefix');
  assert.ok(/length>1/.test(split), '…and a prefix is 「split」 only when more than one unit shares it');
  assert.ok(!/292070|1410011/.test(split), 'no code is written into the rule itself');

  assert.ok(/geojson\/class20s\//.test(s), 'the JMA’s own per-unit outline is what it is drawn on');
  /* ⚠ and the municipality's quiet unit must survive it — `used` is what consumes the grey */
  assert.ok(/if\(g\) return \{ name:nameOf\(c\), geom:g, used:\[\] \};/.test(s),
    'a sub-municipal shape consumes NO municipality key, so the grey is cut rather than dropped');
  /* everything asked for is asked for: a cap that forgets the rest is how 五條市 stayed whole */
  const pump = fnBody(s, 'pumpJpSub');
  assert.ok(/jpSubQ\.shift\(\)/.test(pump) && /pumpJpSub\(\)/.test(pump),
    'the bounded concurrency is a queue that drains, not a cap that drops');
});

test('R307 ⑥ a coalesced refresh waits for the refresh to be free instead of being dropped', () => {
  const s = code('js/world-packs.js');
  /* `refresh()` opens with `if(busy) return;` — the two boundary upgrades schedule it, and a call
     made while a sweep is running used to vanish. Both re-arm. */
  assert.ok(/async function refresh\(\)\{ if\(busy\) return;/.test(s), 'refresh still drops a concurrent call');
  const arms = s.match(/if\(busy\)\{ (jpSubT|jpFineT)=setTimeout\(go,\d+\); return; \}/g) || [];
  assert.equal(arms.length, 2, 'both the sub-municipal outlines and the fine boundaries wait for it');
});

/* ══ ⑦⑧ 風 ═══════════════════════════════════════════════════════════════════════════════════ */
test('R307 ⑦ the block cache is given room for a whole read without making the requests bigger', () => {
  const s = code('js/wx-ecmwf.js');
  const bytes = numFrom(s, 'BLOCK_BYTES');
  const max = numFrom(s, 'BLOCK_MAX');
  /* `blockSize()` IS the HTTP request size: raising it over-fetches at both ends of every span and
     punishes the raster tiles, which share this reader. Measured: 512 kB blocks turned 6.31 MB of
     wanted bytes into 9.00 MB. */
  assert.ok(bytes <= 64 * 1024, 'the block — and therefore the request — is not bigger than the SDK default');
  /* the ceiling is what was wrong: 128 × 64 kB is 8 MB against an 8.63 MB working set, so the read
     evicted its own blocks and re-downloaded 3.5 MB. A whole-globe read of u+v is ~16 MB. */
  assert.ok(bytes * max >= 16 * 1024 * 1024,
    'and the cache holds a whole-globe read, so nothing a read is still using is evicted');
  assert.ok(/fileReaderConfig: Object\.assign\(\{\}, base\.fileReaderConfig, \{ cache: blockCache\(BLOCK_BYTES, BLOCK_MAX\) \}\)/.test(s),
    'the reader is actually given it');
});

/* ⚠⚠ (#R308) THIS TEST PINNED FOUR SPELLINGS AND #R308 WAS TOLD TO CHANGE THREE OF THEM. It required
   the stage-in to be `bytes=-' + TOUCH_BYTES`, to be EXACTLY `BLOCK_BYTES`, and it wrote both call
   sites out character by character. #R308 measured that the four seconds is the REQUEST and not its
   size (a one-byte suffix range stages the object identically), which makes 「it is exactly the first
   block the SDK will ask for」 a claim about a trade that is no longer worth making — 20 ms of CDN hit
   against a quarter of a megabyte per hour. What #R307 actually established, and what survives, is
   below, asked of the function bodies rather than of their spelling. */
test('R307 ⑧ the forecast file is staged before it is read, and the window is a reader’s', () => {
  const s = code('js/wx-ecmwf.js');
  const t = fnBody(s, 'touch');
  assert.ok(/Range/.test(t), 'the stage-in is a ranged request');
  const rng = /Range:\s*([A-Za-z_$][\w$]*)/.exec(t);
  const where = rng ? s.slice(0, s.indexOf('function touch(')) + t : t;
  assert.match(where, /bytes=-/,
    'and what it asks for is a suffix range against the END of the file');
  assert.ok(/touched\[f\]/.test(t), 'once per file, ever');
  assert.ok(!/omFileReader|serial\(/.test(t), 'and outside the one reader’s queue');

  /* the axis moves on every clock tick whether or not a weather layer is on (`_followClock`), and
     `sdk` is only ever loaded by `ready()`, i.e. by something that is about to read. ⚠ #R308 stages
     the OPENING hour from `fetchMeta` for every session — one request of one byte — but the WINDOW
     around it still belongs to a reader who is actually reading. */
  const si = fnBody(s, 'setIndex');
  assert.ok(/if \(sdk[\s\S]{0,80}?touchAround\(/.test(si),
    'the window is only staged for a session that has loaded the reader');
  const rd = fnBody(s, 'ready');
  assert.ok(/touchAround\(idx/.test(rd),
    'and a consumer stages it the moment the axis lands, in parallel with the SDK download');
  /* both directions, and further ahead than behind — #R305 measured that one-ahead-on-stillness is
     outrun by a reader who steps every second */
  const ta = fnBody(s, 'touchAround');
  assert.ok(/_touchDir/.test(ta), 'the window follows the direction the reader is going');
  assert.ok(/\+ j \* _touchDir|\+ _touchDir/.test(ta) && /- .*_touchDir/.test(ta),
    'and it reaches both ahead of the reader and behind them');
});

/* ══ ⑨ 地点を選ばせろ ═════════════════════════════════════════════════════════════════════════ */
test('R307 ⑨ a tool row asks for its own point every time', () => {
  const s = code('js/map-ui.js');
  const ask = fnBody(s, '_askPoint');
  assert.ok(/P\.start\(\{ onPick/.test(ask), 'the gesture is armed');
  /* the defect was a short-circuit BEFORE the gesture: 「had」 → fire() with a remembered point */
  assert.ok(!/const had=/.test(ask), 'and nothing answers ahead of it');
  assert.ok(!/_chosenLL|_picked|userPins/.test(s),
    'no remembered point and no pin fallback is left in this file for it to come back through');
  /* …and the half of #R299 that must survive: the rows that need no point are still not asked */
  const rows = (s.match(/run:\(\)=>_askPoint\(/g) || []).length;
  assert.equal(rows, 4, 'exactly the four rows that cannot answer without a coordinate');
  assert.ok(/id:'sim\.terrainWater'/.test(s) && !/sim\.terrainWater'[\s\S]{0,400}?_askPoint/.test(s),
    'the terrain/water simulator opens on the view rectangle and is not asked');
  /* #R305: one gesture, one voice — the shared bar stays silent for a caller that speaks */
  assert.ok(/announce:false/.test(ask), 'and exactly one thing says so');
});

test('R307 ⑩ the layer still refuses to let grey and colour share a pixel', () => {
  const s = code('js/world-packs.js');
  /* the standing instruction 「発表無しポリゴンの上に発表ありポリゴンを重ねる形式を今すぐ辞めろ」 is
     what the difference makes STRONGER, not weaker: one fill layer, one grey, and the quiet geometry
     is the unit minus everything warned that touches it. */
  assert.equal((s.match(/id:'wp-alert-fill'/g) || []).length, 1, 'one fill layer carries both');
  const q = fnBody(s, 'quietGeomFor');
  assert.ok(/if\(d===null\)\{ _qCleared\+\+; _qDropped\+\+; return null; \}/.test(q),
    'a unit the difference empties is not drawn at all');
  assert.ok(/quietCut:/.test(s) && /quietCleared:/.test(s) && /quietClipper:/.test(s),
    'and the three are counted, so 「it worked」 is a number rather than a claim');
});
