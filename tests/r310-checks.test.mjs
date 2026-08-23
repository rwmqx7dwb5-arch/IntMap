/* ════════════════════════════════════════════════════════════════════════════════════════════════
 *  R310 — 「風レイヤーは品質保ったまま、起動から日時変更からすべてに至るまで、爆速にしろ。」(5回目)
 *
 *  What this round found, MEASURED in the browser against the real host, is that a 64 kB ranged
 *  request has a fixed cost that has nothing to do with its size:
 *
 *      64 kB × 128, all at once   2,448 / 2,341 ms    3.3 / 3.4 MB/s
 *      256 kB × 32                1,255 ms            6.4 MB/s
 *      512 kB × 16                  723 /   683 ms   11.1 / 11.7 MB/s
 *      8 MB × 1                     455 /   708 ms   17.6 / 11.3 MB/s
 *
 *  — identical bytes in every row. One hour of wind is 8.6 MB, which the app was asking for in 139
 *  separate requests. #R307 asked the right question and answered it about the wrong object: it is
 *  not the BLOCK that has to be bigger (a bigger block over-fetches, and the raster tiles share it),
 *  it is the REQUEST, and those are two different numbers.
 *
 *  ⚠ THESE CHECKS ASK FOR RELATIONS, NOT SPELLINGS. Eleven checks from #R276 … #R308 failed on this
 *  round's diff and every one of them was fixing a spelling whose title was still true (the
 *  twenty-fifth time this project has paid for that). Nothing below pins a call site verbatim.
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
/* comments carry this round's own prose, and prose about a rule is not the rule */
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');
/* the body of a named function, by brace matching — never by a character count (#R283/#R306) */
function fnBody(src, name) {
  /* ⚠ the OPENING PAREN is part of the name, or `load` finds `loadSDK` */
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let j = src.indexOf('{', i), d = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  return src.slice(i);
}
const EC = () => codeOnly(read('js/wx-ecmwf.js'));
const WX = () => codeOnly(read('js/weather.js'));

/* ── ① the requests are merged; the block, and therefore the cache, is not made coarser ────────── */
test('R310 ① adjacent block requests become one request, and the block size is unchanged', () => {
  const s = EC();
  /* #R307's measurement stands and is the reason the block itself must not grow: `blockSize()` is
     what the SDK's cached reader stores AND what it would ask the network for, and a bigger one
     over-fetches at both ends of every span (6.31 MB → 9.00 MB, measured there) while dragging the
     raster tiles — which share this reader — along with it. */
  assert.match(s, /var BLOCK_BYTES = 64 \* 1024\b/, 'the cache granularity is still 64 kB');

  const cb = fnBody(s, 'coalesceBackend');
  assert.ok(cb, 'there is one place that merges');
  assert.match(cb, /\.getBytes\b/, 'it wraps the call that issues the HTTP range');
  /* ⚠ CONTIGUOUS ONLY. A run is exactly the blocks that were asked for, so nothing is over-fetched
     — that is the whole difference between this and raising the block size. */
  assert.match(cb, /<=\s*\w+\.b\s*\+\s*1\b/, 'two jobs join only when they touch in the file');
  /* ⚠ a run is capped, or one all-or-nothing request would carry a whole read */
  assert.match(s, /var RUN_MAX = /, 'a merged request has a ceiling');
  assert.match(cb, /RUN_MAX/, '…and the merge respects it');
  /* ⚠ one signal per request, or aborting one read would abort another read's bytes */
  assert.match(cb, /sig/, 'jobs are grouped by their abort signal');
  /* ⚠ each block is COPIED out of the run, or a 64 kB entry in a 32 MB LRU pins megabytes */
  assert.match(cb, /\.slice\(/, 'a block does not stay a view of the request it arrived in');
});

/* ── ② one reader per file, opened once, and the open leaves before the read needs it ─────────── */
test('R310 ② a forecast file is opened once, and by a reader of its own', () => {
  const s = EC();
  /* `ensureData` opens the file on EVERY call — `await reader.setToOmFile(state.omFileUrl)` is its
     first line — and an open is a HEAD plus a trailer read plus a tree walk. MEASURED before this
     round: two of them in front of every band read (389 and 576 ms), and a step onto an hour whose
     bytes were already cached still cost 2,118 ms of which one HEAD was 1,870 ms. */
  const pin = fnBody(s, 'pinReader');
  assert.ok(pin, 'the open is made idempotent in one place');
  assert.match(pin, /setToOmFile/, '…on the call that opens');
  assert.match(pin, /return open;/, '…by handing back the open already in flight');

  const rf = fnBody(s, 'readerFor');
  assert.ok(rf, 'readers are kept per file');
  assert.match(rf, /WeatherMapLayerFileReader/, 'the SDK exports the class, so this is not a patch of it');
  assert.match(rf, /url/, '…and the pool is keyed by the file');
  assert.match(rf, /dispose/, '…and bounded, because an open reader holds a wasm variable tree');
  assert.match(s, /var READER_MAX = /, 'the bound is named');

  /* the read is handed THAT reader — `ensureData(state, reader, …)` takes it as an argument */
  assert.match(s, /sdk\.ensureData\(st, (?!inst\.omFileReader)\w+/,
    'the field read no longer hands the SDK its shared singleton');
  /* ⚠ SHARING ONE BLOCK CACHE ACROSS READERS IS SAFE, and that is not an assumption: the SDK builds
     its keys as `baseKey + blockIndex` where `baseKey` is hash(url) ^ hash(eTag) ^ hash(lastModified),
     so two files cannot collide and two readers on one file share every block. */
  assert.match(rf, /fileReaderConfig/, 'every reader is built with the same cache');
});

test('R310 ③ the file is opened when the axis moves, not when the read starts', () => {
  const s = EC();
  const si = fnBody(s, 'setIndex');
  assert.match(si, /touchAround\(/, 'the stage-in still leaves first (#R307/#R308)');
  assert.match(si, /openReader\(/, '…and the open leaves beside it, not behind the read');
  assert.match(fnBody(s, 'openReader'), /setToOmFile/, 'opening is what that does');
});

/* ⚠⚠⚠ (#R325) THIS CHECK ASKED FOR THE MECHANISM, AND THE MECHANISM WAS THE HALF-MEASURE.
   #R310 pinned the SDK's singleton so the tiles' SECOND open of a file would be a no-op, and wrote
   that pinning 「removes both」. It did not: pinning is per reader, and the tiles were on a
   DIFFERENT reader from the pool this same round had just built, so the file was opened twice —
   MEASURED in #R325 on the built page, `setToOmFile` 9 ms → **+629 ms** in front of a tile read of
   a file `setIndex` had already opened. The rule #R310 meant is the one asserted below; what it
   pinned was one way of approximating it. (#R314 wrote the general form of this: a gate outlives
   the reason it was built for, and the check that states the reason is the evidence.) */
test('R310 ④ the colour tiles read a file that is already open, through the same pool', () => {
  const s = EC();
  const rp = fnBody(s, 'registerProtocol');
  /* the reader the tiles decode through is the pool's, obtained from the SDK's own instance */
  assert.match(rp, /tileReader\(/, 'the tiles are given a reader by this module');
  assert.match(rp, /getProtocolInstance/, '…the one the protocol hands them');
  assert.match(fnBody(s, 'tileReader'), /readerFor\(/, '…and it resolves to the per-file pool');
  /* and the pin is still what makes a second open of one reader free */
  assert.match(fnBody(s, 'pinReader'), /setToOmFile/, 'a second open of one reader is still a no-op');
});

/* ── ⑤ the next hour is READ, not merely warmed ────────────────────────────────────────────────── */
test('R310 ⑤ the neighbouring hour is read and held, so stepping onto it is a list lookup', () => {
  const s = EC(), w = WX();
  const ra = fnBody(s, 'readAhead');
  assert.ok(ra, 'there is one named door for it');
  assert.match(ra, /frameCovering/, 'it does nothing when the frame is already in hand');
  assert.match(ra, /load\(variable, i, band, true, true\)/, 'it is a real read, in the background lane');
  assert.match(s, /readAhead: readAhead,/, '…and it is exported');

  /* ⚠ ONLY WHEN THE AXIS MOVED (#R276 追記). 8.6 MB is not something to spend on a guess. */
  assert.match(w, /if\(opt&&opt\.step\)\{[\s\S]{0,240}?EC\(\)\.readAhead\(/,
    'the wind reads ahead only after the reader has actually stepped');
  /* …at the band that hour will be read at, which is #R305's rule and is not `band()` (the planet) */
  assert.match(w, /readAhead\(VAR,nx,nearBand\(\)\|\|band\(\)\)/, 'and at the band the step will use');

  /* ⚠ IT MUST NOT TAKE PART IN `seq`. An hour nobody has arrived at is newer than everything by
     construction: bumping the generation would supersede the read of the picture ON SCREEN, and
     checking it would cancel the ahead read the moment it becomes useful. */
  const ld = fnBody(s, 'load');
  assert.match(ld, /var mine = ahead \? 0 : \+\+seq;/, 'an ahead read takes no generation');
  assert.match(ld, /!ahead && seq !== mine/, '…and is not superseded by one');
  /* ⚠ AND IT INSTALLS QUIETLY: findable by `sampler()`, but not 「the one that landed last」 */
  assert.match(ld, /keepFrame\(frame, true\)/, 'an ahead frame does not become the held frame');
  assert.match(fnBody(s, 'keepFrame'), /quiet/, '…which is what the second argument is for');
});

test('R310 ⑥ a step onto the hour being read ahead joins that read instead of starting a second', () => {
  const s = EC();
  const ld = fnBody(s, 'load');
  assert.match(ld, /var join = reading\[skey\];/, 'an in-flight read of the same key is joined');
  /* ⚠ …AND THE JOIN CARRIES THE JOINER'S PRIORITY. A read-ahead still WAITING in the low lane is,
     by the lane rule, a job that does not start while the reader is waiting for something — so a
     step that joins it without lifting it would be waiting on its own deadlock-shaped rule. */
  assert.match(ld, /if \(!ahead\) promote\(join\)/, 'a foreground joiner lifts the job out of the low lane');
  const pr = fnBody(s, 'promote');
  assert.match(pr, /qLo\.indexOf\(job\)/, 'only a job that has not started is moved');
  assert.match(pr, /qHi\.push\(job\)/, '…and it is moved to the lane the reader is waiting on');
  assert.match(ld, /reading\[skey\] = /, '…and is registered while it runs');
  assert.match(ld, /delete reading\[skey\]/, '…and cleared when it ends, on both outcomes');
  /* the SDK de-duplicates too, but only while it still holds the state, and its `stateByKey` is a
     two-entry LRU the colour tiles evict — so the join is kept here, where the lifetime is ours */
  assert.match(s, /var reading = Object\.create\(null\);/, 'the map is this module’s');
});

/* ── ⑦ nothing about the picture changed ───────────────────────────────────────────────────────── */
test('R310 ⑦ the field is the same field — same model, same band, same colours, same samples', () => {
  const s = EC(), w = WX();
  assert.match(s, /var DOMAIN = 'ecmwf_ifs';/, 'the same model');
  assert.match(w, /const VAR='wind_u_component_10m';/, 'the same variable pair');
  assert.match(s, /function bandNear\(south, north\)/, 'the same first band…');
  assert.match(s, /function bandFor\(south, north\)/, '…and the same band the view covers');
  assert.match(s, /var WINDY_WIND = rampFrom\(WIND_ANCHORS, 0\.1\);/, 'the same colour table at the same step');
  assert.match(s, /var FRAME_SAMPLES = 24e6;/, 'the same memory budget');
  /* the merge changes how the bytes are ASKED FOR; it must not change which bytes, so the ranges
     still come from a state built with the bounds the read uses (#R290 追記2) */
  assert.match(s, /prefetchVariable\(variable, st\.ranges\)/, 'the same ranges are warmed');
});
