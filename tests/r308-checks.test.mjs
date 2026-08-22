/* ============================================================================
 *  IntMap · #R308 — source-level checks
 * ----------------------------------------------------------------------------
 *  Two reports:
 *    ①「警報レイヤー、発令されている・されてない地域にまで斜線かけるな。」
 *       ——「情報あるのに、そこに斜線が上塗りされてるところ」。斜線は「この地図はここについて何も
 *       述べていない」という主張なので、この層が何かを述べている地面の上に描かれてはならない。
 *    ②「風レイヤーは品質保ったまま、起動から日時変更からすべてに至るまで、爆速にしろ。」   (4回目)
 *
 *  ⚠ THE ASSERTIONS BELOW ARE RELATIONS, NOT SPELLINGS. Twenty-five rounds running, this project has
 *  had legitimate changes turned red by a check that pinned a literal — a byte count, a build stamp,
 *  a sentence that the next round was told to rewrite. Every question here is asked of a FUNCTION
 *  BODY (brace-matched, so a comment or a line ending cannot move the window) and every number is
 *  asked as an INEQUALITY against the thing it has to be big or small enough for.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

/* the body of a named function declaration, by brace matching — #R306's lesson: a window written in
   characters is a window that CRLF moves. */
function fnBody(src, name, from) {
  const start = src.indexOf('function ' + name + '(', from || 0);
  assert.notEqual(start, -1, 'function ' + name + ' exists');
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) return src.slice(open, i + 1); }
  }
  throw new Error('unbalanced braces in ' + name);
}
/* the value of a `var`/`const`/`let` declaration of a plain number or string, wherever it is written */
function numConst(src, name) {
  const m = new RegExp('(?:var|const|let)\\s+[^;]*?\\b' + name + '\\s*=\\s*([0-9][0-9*\\s]*)').exec(src);
  assert.ok(m, name + ' is declared');
  // eslint-disable-next-line no-new-func
  return Function('return (' + m[1] + ')')();
}

const WX = read('js/wx-ecmwf.js');
const WP = read('js/world-packs.js');
/* ⚠ `world-packs.js` holds every world pack, and more than one of them has an `ensureChoro`.
   Everything below is asked of the ALERTS pack, so the search starts where it declares its layers. */
const ALERTS = (() => { const i = WP.indexOf("const CHORO='wp-alert-choro'");
  assert.notEqual(i, -1, 'the alerts pack declares its country-wide layers'); return i; })();

/* ── ① 風: the stage-in is a REQUEST, not a download ─────────────────────────────────────────────
   #R307 found that the wait for a never-visited forecast hour is one range request against an object
   the CDN has not staged, and asked for the 64 kB block the reader would want anyway. MEASURED this
   round on production: a ONE-BYTE suffix range stages the object exactly as the 64 kB one does
   (a real 64 kB tail read afterwards costs 27–50 ms against 4,483–5,195 ms unstaged). So the request
   the stage-in makes must be small enough that it is the REQUEST being paid for and not the bytes. */
test('r308 ① the wind stage-in asks for at most a kilobyte, so the window can be wide', () => {
  const body = fnBody(WX, 'touch');
  assert.match(body, /Range/, 'the stage-in is a ranged request');
  const src = body + '\n' + WX.slice(0, WX.indexOf('function touch('));
  const m = /['"]bytes=-\s*['"]?\s*\+?\s*([A-Za-z_$][\w$]*)?/.exec(body) || [];
  let bytes = null;
  if (m[1]) bytes = numConst(WX, m[1]);
  else {
    const lit = /bytes=-(\d+)/.exec(body) || /bytes=-(\d+)/.exec(src);
    assert.ok(lit, 'the suffix length is readable');
    bytes = Number(lit[1]);
  }
  assert.ok(bytes > 0 && bytes <= 1024,
    'the stage-in asks for ' + bytes + ' bytes; it only has to make the request, not carry a block');
});

/* ── ② 風: the window is wider than the four hours #R307 could afford ────────────────────────────
   MEASURED: twelve cold objects staged in parallel took 5,329 ms together — the same wall clock as
   ONE of them — so the number of hours staged is chosen by what the reader can reach next, not by
   what the bytes cost. It reaches further in the direction the reader is going than behind them. */
test('r308 ② the stage-in window is wider than #R307 four hours and reaches further ahead', () => {
  const ahead = numConst(WX, 'TOUCH_AHEAD');
  const back = numConst(WX, 'TOUCH_BACK');
  assert.ok(ahead > back, 'ahead (' + ahead + ') reaches further than behind (' + back + ')');
  assert.ok(1 + ahead + back > 4, 'the window covers ' + (1 + ahead + back) + ' hours, more than #R307 four');
  const body = fnBody(WX, 'touchAround');
  assert.match(body, /for\s*\(/, 'the window is a loop over the window, not a hand-written list');
});

/* ── ③ 風「起動から」: the opening hour is staged while the page is still loading ─────────────────
   #R307 deliberately kept the stage-in behind `ready()`, i.e. behind a reader who has actually asked
   for weather, because four 64 kB requests on every boot would be bytes nobody asked for. At one
   byte that reason is gone, and the metadata handler is the earliest moment the file name exists. */
test('r308 ③ the opening forecast hour is staged from the metadata handler', () => {
  const body = fnBody(WX, 'fetchMeta');
  assert.match(body, /touch\s*\(/, 'fetchMeta stages the hour the app will open on');
});

/* ── ④ 風: playback stages further ahead than a single step does ─────────────────────────────────
   The player asks for every hour in turn at `playMs`; a window that only reaches the step window is
   overtaken within seconds. */
test('r308 ④ playback stages further ahead than a step does', () => {
  const play = numConst(WX, 'TOUCH_PLAY_AHEAD');
  const ahead = numConst(WX, 'TOUCH_AHEAD');
  assert.ok(play > ahead, 'playback reaches ' + play + ' hours ahead, more than a step (' + ahead + ')');
  const body = fnBody(WX, 'setIndex');
  assert.match(body, /playing\s*\?/, 'the index change chooses its window by whether the player is running');
});

/* ── ⑤ 警報: the hatch has a second surface, and it is NOT the shared country index ───────────────
   The overlap the reader reported is between two DIFFERENT indexes: `countries` carries enclaves and
   disputed areas as their own polygons, and the unit indexes (NUTS, admin-1, an agency's own forecast
   districts) do not carve them out. A hatch drawn only from the shared vector source can therefore
   never be cut. */
test('r308 ⑤ the hatch has a cut surface of its own, on a source this layer owns', () => {
  assert.match(WP, /HCUT\s*=\s*'[^']+'\s*,\s*HCUT_SRC\s*=\s*'[^']+'/, 'the cut layer and its source are named');
  const body = fnBody(WP, 'ensureChoro', ALERTS);
  assert.match(body, /addSource\(HCUT_SRC/, 'the cut source is created with the rest of the family');
  assert.match(body, /id:HCUT[\s\S]{0,200}source:HCUT_SRC/, 'the cut layer draws from that source, not from `countries`');
  const hatchAdd = /id:HATCH[\s\S]{0,200}?'fill-pattern':'([^']+)'/.exec(body);
  const cutAdd = /id:HCUT[\s\S]{0,200}?'fill-pattern':'([^']+)'/.exec(body);
  assert.ok(hatchAdd && cutAdd, 'both hatch layers declare a pattern');
  assert.equal(cutAdd[1], hatchAdd[1], 'the two hatch layers are the same picture — one appearance, two geometries');
});

/* ── ⑥ 警報: no ground is ever hatched twice ─────────────────────────────────────────────────────
   The cut source carries the countries whose hatch was re-cut; the country hatch must therefore stop
   drawing exactly those countries. If the filter and the source were not built from the same list,
   the two layers would overlap and the pattern would double. */
test('r308 ⑥ the country hatch is filtered by the very list the cut source carries', () => {
  const body = fnBody(WP, 'applyHatchCut');
  assert.match(body, /setSourceData\(HCUT_SRC\s*,\s*hatchCutFC/, 'the cut source is fed the cut collection');
  assert.match(body, /setFilter\(HATCH[\s\S]{0,200}hatchCutISO/, 'the country hatch is filtered by the same list');
});

/* ── ⑦ 警報: one subtraction, not two ────────────────────────────────────────────────────────────
   #R307 already owns 「geometry minus the geometry that answers for it」 (`subtractWarnings`, with its
   cache, its vertex ceiling and its winding fix). A second implementation beside it is how two
   answers to one question start disagreeing. */
test('r308 ⑦ the hatch cut reuses #R307 subtraction rather than clipping a second way', () => {
  const one = fnBody(WP, '_cutOne');
  assert.match(one, /subtractWarnings\(/, 'the cut asks the existing subtraction');
  assert.doesNotMatch(one, /\.difference\(/, 'and does not reach for the clipper itself');
  const reb = fnBody(WP, 'rebuildHatchCut');
  assert.doesNotMatch(reb, /\.difference\(/, 'nor does the rebuild');
});

/* ── ⑧ 警報: the hatch family is still ONE visibility list (#R288) ───────────────────────────────
   #R288 measured a layer left half-hidden because visibility was set in four places over three
   lists. A new member of the family that is not in that list is the same defect waiting. */
test('r308 ⑧ the cut layer is in the one list that decides whether this layer is showing', () => {
  const m = /const ALL_LYR\s*=\s*\(\)\s*=>\s*([^;]+);/.exec(WP);
  assert.ok(m, 'ALL_LYR is the one list');
  assert.match(m[1], /\bHCUT\b/, 'the cut layer is in it');
});

/* ── ⑨ 警報: the clipper arrives late, and what it could not answer is asked again ────────────────
   `polygon-clipping` is a lazy, optional chunk (#R307). Everything computed before it lands is
   computed WITHOUT it; if the memo of that work were not invalidated when it arrives, the cut would
   never happen for a reader who switched the layer on quickly. */
test('r308 ⑨ the late clipper invalidates the cut, so it is recomputed once it can be', () => {
  const body = fnBody(WP, 'clipper');
  assert.match(body, /hatchCutKey\s*=\s*''/, 'the arriving clipper drops the cut memo');
  assert.match(body, /publish\(\)/, 'and republishes');
});

/* ── ⑩ 警報: the cut is BOUNDED, and it converges ────────────────────────────────────────────────
   MEASURED while this round was written: the straightforward version of this cost 19,588 ms in one
   `rebuildHatchCut` and the interior-point version 16,263 ms — the same way this layer paid in #R290
   and #R297. What makes it affordable is a budget per publish plus a memo per country, and a budget
   that is spent must leave the work to be finished rather than dropped. */
test('r308 ⑩ the cut has a per-publish budget and finishes what it could not do', () => {
  const ms = numConst(WP, 'CUT_BUDGET_MS');
  assert.ok(ms > 0 && ms <= 60, 'the budget is ' + ms + ' ms — a slice of a frame, not a frame');
  const body = fnBody(WP, 'rebuildHatchCut');
  assert.match(body, /CUT_BUDGET_MS/, 'the rebuild watches the budget');
  assert.match(body, /hatchCutKey\s*=\s*spent\s*\?\s*''/, 'a spent budget leaves the signature unfinished');
  assert.match(body, /cutMemo/, 'and what was computed is remembered per country');
  const pub = fnBody(WP, 'publishNow');
  assert.match(pub, /hatchCutLeftOver/, 'the publisher comes back for what was left');
});
