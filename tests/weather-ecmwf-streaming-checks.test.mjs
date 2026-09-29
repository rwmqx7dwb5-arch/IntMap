/* ============================================================================
 *  IntMap · the forecast engine (js/wx-ecmwf.js) — requests, readers, tiles, and units
 * ----------------------------------------------------------------------------
 *  要求の併合・ファイルごとの reader・先読み・タイル境界・場の単位と読者の単位。
 *
 *  ⚠ 主題単位へ統合した検査（旧ラウンド単位のファイルから、題名を保ったまま移した）。
 *    各節はブロックに包んであり、補助の名前は節ごとに閉じている（別ファイルだった頃と同じ隔離）。
 *    「綴りのまま:」の注記は、評価に置き換えられない検査がなぜそうなのかを 1 行で言う。
 * ==========================================================================*/
import test from 'node:test';
import { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs, { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path, { dirname, join } from 'node:path';
import { coldWxModel, until, settled } from './helpers/wx-ecmwf-page.mjs';
import { readLF } from '../scripts/eol.mjs';
import vm from 'node:vm';
import { codeOnly } from '../scripts/code-only.mjs';

/* (tests-by-topic) tests/helpers/wx-ecmwf-page.mjs `coldWxModel` installs a page as globalThis.window /
   document / fetch and leaves it there. When each round was its own file that ended with the process;
   here several rounds share one, so every test starts from the globals the file started with. */
const GLOBALS_AT_START = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch };
afterEach(() => {
  for (const [k, v] of Object.entries(GLOBALS_AT_START)) { if (v === undefined) delete globalThis[k]; else globalThis[k] = v; }
});

/* ════════ #R310 — from tests/r310-checks.test.mjs ════════ */
{
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
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
/* comments carry this round's own prose, and prose about a rule is not the rule */
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

/* ══ ⚠⚠⚠ (#R664) THE TICKET MOVED, SO THIS CHECK STOPPED READING THE SOURCE ═══════════════════════
   Until #R664 the supersession rule below was asserted as a SPELLING — `var mine = ++seq`, `if
   (seq === mine)`. That round found the defect those spellings hid: the ticket was taken IN THE
   CALL while the join was made later, in the `ready()` continuation, so a second call for the SAME
   read superseded the read it was about to join and both callers were answered null (production:
   the first switch-on of the first weather layer of a page failed, three times out of three). The
   fix issues the ticket where the read is IDENTIFIED, and every one of those spellings changed
   while the property this check was written for did not. A check that pins a spelling can only
   prove that an implementation is still the one it was written against (#R488), so the property is
   MEASURED against the shipped module from here on.
   ⚠ The page it is measured on is tests/helpers/wx-ecmwf-page.mjs — ONE page, shared by the six
   files that need it, because six copies of one judgement is the shape
   .agents/rules/no-ad-hoc-hardcoding.md §2-3 forbids. The browser and the Open-Meteo SDK are
   stubbed there; nothing else is — the rule under test is the one that ships. */


/* ── ① the requests are merged; the block, and therefore the cache, is not made coarser ────────── */
/* 綴りのまま: 対象は js/wx-ecmwf.js の読み取りの内側（SDK の状態・reader・キュー）の配線で、stub の SDK からは観測できない */
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
/* 綴りのまま: 対象は js/wx-ecmwf.js の読み取りの内側（SDK の状態・reader・キュー）の配線で、stub の SDK からは観測できない */
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

/* 綴りのまま: 対象は js/wx-ecmwf.js の読み取りの内側（SDK の状態・reader・キュー）の配線で、stub の SDK からは観測できない */
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
/* 綴りのまま: 対象は js/wx-ecmwf.js の読み取りの内側（SDK の状態・reader・キュー）の配線で、stub の SDK からは観測できない */
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
test('R310 ⑤ the neighbouring hour is read and held, so stepping onto it is a list lookup', async () => {
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

  const ld = fnBody(s, 'load');
  /* ⚠ IT MUST NOT TAKE PART IN `seq`. An hour nobody has arrived at is newer than everything by
     construction: bumping the generation would supersede the read of the picture ON SCREEN, and
     checking it would cancel the ahead read the moment it becomes useful. */
  /* ⚠⚠⚠ (#R664) THESE TWO WERE SPELLINGS AND THE TICKET MOVED (see the header of tests/helpers/wx-ecmwf-page.mjs), so
     the two halves are measured on the shipped module, in the arrangement that separates them: a
     foreground read holds the lane, and the ahead read is queued BEHIND it in the low lane.
       · it takes no generation  → the picture ON SCREEN still installs itself when it lands;
       · it is not superseded by one → the ahead read still reads, rather than being answered out
         of the frame list the moment its turn in the queue comes up.
     tests/r664-checks.test.mjs ⑥ measures the same rule from the other side (a foreground JOINER
     must not hand it a ticket either). */
  const { calls, ENG } = await coldWxModel({ sdkMs: 60, readMs: 250 });
  const M = ENG.model('ecmwf_wam025');
  await M.meta();
  const wanted = M.load('wave_height', 1, null);              /* the hour on screen: it holds the lane */
  /* ⚠ 「it holds the lane」 is the arrangement, so it is waited for and not timed — with sdkMs 60 the
     old `await wxDelay(20)` landed on the SDK's own arrival (see the header of
     tests/helpers/wx-ecmwf-page.mjs), which is where the whole separation comes from. */
  await until(() => calls.ensureData === 1, 'the foreground read to hold the lane', { observe: () => calls });
  const ahead = M.load('wave_height', 3, null, true, true);   /* what `readAhead` passes: bg + ahead */
  const [wf, a] = await Promise.all([wanted, ahead]);
  assert.equal(calls.ensureData, 2,
    'the ahead read was answered out of the frame list instead of reading — a generation it never took cancelled it');
  assert.notEqual(a.key, wf.key, '…it must be the hour NOBODY has arrived at yet');
  assert.equal(M._state().frames, 2, 'both hours are in hand');
  assert.equal(M._state().held, wf.key,
    'the ahead read bumped the generation and superseded the picture ON SCREEN, which never installed itself');
  /* ⚠ AND IT INSTALLS QUIETLY: findable by `sampler()`, but not 「the one that landed last」 */
  assert.match(ld, /keepFrame\(frame, true\)/, 'an ahead frame does not become the held frame');
  assert.match(fnBody(s, 'keepFrame'), /quiet/, '…which is what the second argument is for');
});

test('R310 ⑥ a step onto the hour being read ahead joins that read instead of starting a second', async () => {
  const s = EC();
  const ld = fnBody(s, 'load');
  assert.match(ld, /var join = reading\[skey\];/, 'an in-flight read of the same key is joined');
  /* ⚠ …AND THE JOIN CARRIES THE JOINER'S PRIORITY. A read-ahead still WAITING in the low lane is,
     by the lane rule, a job that does not start while the reader is waiting for something — so a
     step that joins it without lifting it would be waiting on its own deadlock-shaped rule. */
  /* ⚠⚠⚠ (#R664) THAT LINE IS NOW `{ promote(join); renew(join); }` — the join also RENEWS the
     ticket of the read it joins, because the ticket moved from the call to the read (see the header
     of tests/helpers/wx-ecmwf-page.mjs). The spelling changed; the rule did not, so the rule is measured: a foreground
     caller that joins a read still WAITING in the low lane lifts it into the lane the reader is
     waiting on — i.e. it runs BEFORE a foreground read asked for afterwards, instead of behind
     every one of them, which is the lane rule turned into a wait on a job that by construction
     does not start while the reader is waiting for something. */
  const done = [];
  const mark = (n, p) => { p.then(() => done.push(n)); return p; };
  const { page, calls, ENG } = await coldWxModel({ sdkMs: 60, readMs: 150 });
  const M = ENG.model('ecmwf_wam025');
  await M.meta();
  /* ⚠ EVERY ONE OF THESE FOUR CALLS IS PLACED BY A FACT, NOT BY A DURATION (see the header of
     tests/helpers/wx-ecmwf-page.mjs): the foreground read has to be AT the data, the ahead read has
     to be registered and queued in the low lane, and the join has to have happened — before the
     next call is made. The join leaves no mark this page can see (it opens no state and starts no
     read), so it is the one wait made of promise turns rather than of an observation. */
  const busy = mark('fg1', M.load('wave_height', 1, null));                 /* holds the foreground lane */
  await until(() => calls.ensureData === 1, 'the foreground read to hold the lane', { observe: () => calls });
  const ah = mark('ahead', M.load('wave_height', 3, null, true, true));     /* waits in the LOW lane */
  await until(() => page.rec.states.length === 2, 'the ahead read to be registered and queued in the low lane',
    { observe: () => ({ states: page.rec.states, calls }) });
  const joined = mark('joined', M.load('wave_height', 3, null));            /* the reader steps onto it */
  await settled();
  const later = mark('fg2', M.load('wave_height', 2, null));                /* …and then asks for another hour */
  await Promise.all([busy, ah, joined, later]);
  assert.ok(done.indexOf('ahead') >= 0 && done.indexOf('fg2') >= 0, 'every read answered');
  assert.ok(done.indexOf('ahead') < done.indexOf('fg2'),
    'the joined read stayed in the low lane, so the reader was left waiting behind every '
    + 'foreground read asked for after the join: ' + done.join(' < '));
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
/* 綴りのまま: 対象は js/wx-ecmwf.js の読み取りの内側（SDK の状態・reader・キュー）の配線で、stub の SDK からは観測できない */
test('R310 ⑦ the field is the same field — same model, same band, same colours, same samples', () => {
  const s = EC(), w = WX();
  /* ⚠ (#R356) 「same model」 now means 「one model per instance, and the wind reads the instance the
     colour raster reads」 — the literal moved into js/wx-models.js when the engine learned to hold
     more than one. The claim this test makes is unchanged: the particles and the raster must not be
     looking at two different fields. */
  assert.match(s, /var DOMAIN = cfg\.id;/, 'the same model, once per instance');
  assert.match(read('js/wx-models.js'), /id: 'ecmwf_ifs',/, '…and the default instance is still the 9 km field');
  assert.match(w, /const VAR='wind_u_component_10m';/, 'the same variable pair');
  assert.match(s, /function bandNear\(south, north\)/, 'the same first band…');
  assert.match(s, /function bandFor\(south, north\)/, '…and the same band the view covers');
  assert.match(s, /var WINDY_WIND = rampFrom\(WIND_ANCHORS, 0\.1\);/, 'the same colour table at the same step');
  assert.match(s, /var FRAME_SAMPLES = 24e6;/, 'the same memory budget');
  /* the merge changes how the bytes are ASKED FOR; it must not change which bytes, so the ranges
     still come from a state built with the bounds the read uses (#R290 追記2) */
  assert.match(s, /prefetchVariable\(variable, st\.ranges\)/, 'the same ranges are warmed');
});
}

/* ════════ #R314 — from tests/r314-checks.test.mjs ════════ */
{
/* ════════════════════════════════════════════════════════════════════════════════════════════════
 *  R314 — 「風レイヤーは品質保ったまま、起動から日時変更からすべてに至るまで、爆速にしろ。」(6回目)
 *
 *  Five rounds measured the BYTES of a time step (#R305 #R307 #R308 #R310) and made them leave
 *  earlier, arrive concurrently, stop being fetched twice and finally be READ ahead instead of
 *  merely warmed. This round measured the two halves of a step separately for the first time, by
 *  suppressing the colour raster and stepping the axis:
 *
 *      the particles' own band read      513 / 521 / 534 / 537 ms   (6 requests, 4.5 MB)
 *      ONE colour tile (`omProtocol`)  1,266 / 1,381 / 1,772 ms
 *
 *  — so the field the particles need was ready in about a fifth of the step and then WAITED, and
 *  the read-ahead that exists to make the next step free was released by `afterFieldShown`, i.e.
 *  by the slow half. #R298 put it there for one stated reason (the SDK kept ONE file reader, so a
 *  read of another hour took it away from the tiles); #R310 gave every file its own reader and
 *  wrote 「with a reader per file it is no longer in front of anything」 — and left the gate up.
 *
 *  A/B against origin/main, alternating the two trees inside ONE browser process (a run-to-run
 *  swing of 1.6–6.8 s to the data host is larger than anything measured here, so the arms have to
 *  share the run), four sessions x ten steps, 700 ms between clicks:
 *
 *                          origin/main      R314
 *      step → particles       763 ms         0 ms      28 steps of 40 completely free, against 5
 *      step → colour        1,477 ms     1,772 ms      +295 ms — SEE BELOW
 *      bytes per step          6 MB          6 MB
 *      連打 (5 steps/150 ms) 2,737 ms     2,569 ms
 *      cold switch-on       4,451 ms     2,496 ms      with the pointer on the row first
 *
 *  ⚠⚠⚠ THE COLOUR IS NOT FASTER, AND ON A FAST CONNECTION IT IS ABOUT 300 ms SLOWER. That is the
 *  price of the field being instant and it is stated rather than hidden: when a step costs nothing,
 *  the read-ahead of the NEXT hour runs beside the colour tile of THIS one, every time, instead of
 *  waiting for it. Across four independent runs the colour moved −388 / +332 / −185 / +295 ms, so
 *  the direction is inside the run-to-run swing; the largest sample (40 steps an arm) says +295 ms
 *  and that is the number this file records. The field half is not ambiguous in any run.
 *  ⚠ THE MAP NEVER GOES BLANK WHILE THAT HAPPENS — the previous hour's colour stays up until the
 *  new one paints (#R284's two slots, #R297/#R298's reveal rule), so what the reader gains is the
 *  particles and the point readout arriving at once, and what they lose is ~300 ms of an
 *  already-visible picture being one hour old.
 *
 *  ⚠ A GUESS IS A DIFFERENT MATTER. An intermediate build released BOTH the certain next hour and
 *  a speculative SECOND one by the field, and bought 802 → 447 ms for the particles by spending
 *  1,584 → 1,906 ms of the colour. #R298's report — 「パーティクルは比較的すぐ表示されるが、背景の
 *  カラーが、時間を変えるとなかなか表示されない」 — is what that trade reads like from outside, so
 *  the speculative hour still waits for the picture to be complete.
 *
 *  ⚠ THESE CHECKS ASK FOR RELATIONS, NOT SPELLINGS (#R310's rule, and the twenty-fifth lesson
 *  behind it). Nothing below pins a call site verbatim.
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */
/* ⚠ (#R283) READ THROUGH `readLF`. A checkout on Windows has CRLF in the working tree, so any
   pattern that names a bare `
` — this file has none today, and the next edit might — is false
   here and true in CI. `scripts/eol.mjs` NORMALISES; IT DOES NOT RELAX. */


const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readLF(join(ROOT, p));
/* comments carry this round's own prose, and prose about a rule is not the rule */
/* the body of a named function, by brace matching — never by a character count (#R283/#R306) */
function fnBody(src, name) {
  /* ⚠ the OPENING PAREN is part of the name, or `warm` would find `warmReadout` */
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

/* ── ① the hour the reader is stepping ONTO is released by the field, not by the colour ───────── */
/* 綴りのまま: 対象は js/weather.js の closure（凡例の DOM と地図の source / layer）の中で、ブラウザの外では走らない */
test('R314 ① the certain next hour is not read behind the colour raster', () => {
  const w = WX();
  const i = w.indexOf('readAhead(');
  assert.ok(i > 0, 'the step still reads the next hour ahead');
  /* the statement that issues it must not be the body of a wait-for-the-colour callback. The gate
     is `afterFieldShown`, and its whole purpose is to defer; if it appears between the step's own
     `.then` and this call, the read is behind the slow half again. */
  const before = w.slice(Math.max(0, i - 400), i);
  assert.ok(!/afterFieldShown\s*\(/.test(before),
    'the next hour is read as soon as the FIELD lands (measured: 513–537 ms), not when the colour tile finishes (1,266–1,772 ms)');
  /* …and it is still only asked for once the reader has actually moved the axis (#R276 追記) */
  assert.match(w, /opt&&opt\.step[\s\S]{0,240}?readAhead\(/, 'and only after the reader has stepped');
  /* …and still at the band a future hour will actually be read at, not the planet (#R305) */
  assert.match(w, /readAhead\([^)]*nearBand\(\)\s*\|\|\s*band\(\)\)/, 'and at the band the step will use');
});

/* ── ② the SPECULATIVE second hour is a different thing, and it still waits ─────────────────── */
/* 綴りのまま: 対象は js/weather.js の closure（凡例の DOM と地図の source / layer）の中で、ブラウザの外では走らない */
test('R314 ② a second hour is a guess: it waits for the colour, and asks for evidence first', () => {
  const w = WX();
  const more = fnBody(w, 'aheadMore');
  assert.ok(more, 'there is one named door for the extra hour');
  /* it is released by the picture being complete — the gate #R298 built, kept for the read that
     nobody has asked for */
  assert.match(w, /afterFieldShown\([\s\S]{0,60}?aheadMore\(/,
    'the speculative hour waits for the colour, which is the half the reader complained about in #R298');
  /* evidence, not hope: a run of steps in one direction */
  assert.match(more, /_runN/, 'it asks how many steps in a row the reader has taken');
  assert.match(more, /AHEAD_MAX/, '…against a declared minimum');
  /* and it stands down while the reader is waiting for anything at all */
  assert.match(more, /foregroundBusy\(\)/,
    'it stands down while the foreground queue is busy (#R305 built this door and nothing had opened it)');
  /* the narrow band, never the planet — #R305's measurement, unchanged */
  assert.match(more, /nearBand\(\)\s*\|\|\s*band\(\)/, 'and it is the band, not the planet');
  assert.ok(!/\breadAhead\(VAR,\s*n2,\s*band\(\)\)/.test(more), 'and never `band()` alone');
});

/* ── ③ 「the same direction」 is the one the PREVIOUS step went in ──────────────────────────── */
/* 綴りのまま: 対象は js/weather.js の closure（凡例の DOM と地図の source / layer）の中で、ブラウザの外では走らない */
test('R314 ③ the run of steps is counted before the direction is overwritten', () => {
  const w = WX();
  const iRun = w.indexOf('_runN=');
  const iDir = w.search(/_stepDir\s*=\s*\(i>_lastIdx\)/);
  assert.ok(iRun > 0 && iDir > 0, 'both the run counter and the direction are derived from the axis');
  assert.ok(iRun < iDir,
    'the run is counted BEFORE `_stepDir` is replaced — comparing against the new direction would make every step a continuation of itself');
  assert.match(w, /TRAVEL_MS/, 'and a run has a time window, so a step an hour later is not a journey');
});

/* ── ④ everything in front of the first byte of data can happen before the click ─────────────── */
/* 綴りのまま: 対象は js/wx-ecmwf.js の読み取りの内側（SDK の状態・reader・キュー）の配線で、stub の SDK からは観測できない */
test('R314 ④ `warm` does the click-independent work and nothing else', () => {
  const s = EC();
  const wm = fnBody(s, 'warm');
  assert.ok(wm, 'there is one named door for it');
  /* the three things MEASURED in front of the first range of data on a cold switch-on:
     the 340 kB script (121–640 ms), the first wasm instantiation (344–556 ms) and the open of the
     file the axis is already sitting on (HEAD 134–568 ms + a 64 kB trailer) */
  assert.match(wm, /loadSDK\(\)/, 'it starts the SDK');
  assert.match(wm, /registerProtocol\(\)/, '…registers the protocol');
  assert.match(wm, /openReader\(/, '…and opens the file the axis is on, which is what instantiates the wasm');
  /* ⚠ AND IT DOES NOT SPEND THE PICTURE'S BYTES. A pointer on a row is evidence of intent, not a
     switch-on: the band, the decode and the twelve-file stage-in still belong to `load`/`ready`. */
  assert.ok(!/ensureData|prefetchVariable|touchAround/.test(wm),
    'it does not read the band, decode anything, or stage twelve files — that is still `ready()`/`load()`');
  /* it latches, so pointing at the row a hundred times costs one open */
  assert.match(wm, /warmed/, 'it runs once');
  assert.match(s, /warm:\s*warm,/, '…and it is exported');
});

/* ── ⑤ the signal is the ROW, and it takes itself off once it has fired ──────────────────────── */
/* 綴りのまま: 対象は js/weather.js の closure（凡例の DOM と地図の source / layer）の中で、ブラウザの外では走らない */
test('R314 ⑤ the layer rows warm on pointer arrival and on focus', () => {
  const w = WX();
  /* the whole wiring lives in one block; read it rather than the 60 kB file, so a failure prints
     the block and not the module (#R306's lesson about assertions that dump everything) */
  const i = w.search(/pointerover/);
  assert.ok(i > 0, 'a pointer arriving on a row is the earliest honest signal this module has');
  const blk = w.slice(Math.max(0, i - 700), i + 700);
  assert.match(blk, /focusin/, '…and a reader tabbing to the checkbox never fires a pointer event');
  /* the row is identified by its own checkbox id — 「THE PUBLIC NAME OF A LAYER IS ITS ROW ID」 */
  assert.match(blk, /dl-\(wind\|ec-/, 'the weather rows are matched by the id of their own checkbox');
  /* ⚠ NOT THE WHOLE PANEL. A reader scrolling past 「地形」 has said nothing about the weather, so
     the handler has to find the ROW the pointer is in before it decides anything. */
  assert.match(blk, /closest\(/, 'it is the row the pointer is in that decides, not the pointer alone');
  assert.match(blk, /\.warm\(\)/, 'and pointing at a weather row warms the model');
  assert.match(blk, /addEventListener/, 'the signal is a listener…');
  assert.match(blk, /removeEventListener/,
    '…that takes itself off once it has fired, so this is one open and not one per pointer move');
});
}

/* ════════ #R325 — from tests/r325-checks.test.mjs ════════ */
{
/* ════════════════════════════════════════════════════════════════════════════════════════════════
 *  R325 — 「風レイヤーは品質保ったまま、起動から日時変更からすべてに至るまで、爆速にしろ。」(7回目)
 *
 *  Six rounds (#R297 #R299 #R305 #R307 #R308 #R310 #R314) measured the FIELD read — the latitude
 *  band the particles fly in — and made it smaller, earlier, joinable, cached and finally read one
 *  hour ahead, until a step cost the particles nothing at all. None of them measured the OTHER
 *  read. This round instrumented the SDK's own reader on the built page:
 *
 *      zoomed in over Japan (z6, 132.8,32.3 → 143.2,39.6), one step of the axis
 *          the particles' band read          535,608 values      ← the latitudes on screen
 *          the COLOUR TILES' read          6,599,680 values      ← THE WHOLE PLANET
 *          over the wire                 9.76 MB, 31 requests
 *          readVariable, on the main thread   1,537 ms
 *
 *  Seven tiles of Japan served out of a decode of every grid point on Earth. READ OUT OF THE
 *  SHIPPED BUNDLE, the cause is one line: a tile's `dataOptions` is built as
 *  `{domain, variable, bounds: h.currentBounds}`, `h.currentBounds` starts `undefined`, and
 *  `getRanges(grid, undefined)` answers `[{0,ny},{0,nx}]` — everything. One exported function sets
 *  it, `updateCurrentBounds`, and this app had never called it.
 *
 *  Two more, from the same trace:
 *      · `setToOmFile` 629 ms IN FRONT of the tile read, for a file #R310's pool already had open —
 *        the tiles were the one reader left outside that pool;
 *      · a single 1,276 ms long task the moment twelve tiles were dispatched — the SDK posts the
 *        decoded field to its render worker with no transfer list, so each tile STRUCTURED-CLONES
 *        about 53 MB of Float32Array on the main thread.
 *
 *  A/B against origin/main, alternating the two trees inside ONE browser process (#R314's rule:
 *  the run-to-run swing to the data host is larger than the difference being measured).
 *
 *  ⚠ THE PICTURE IS THE SAME PICTURE. Same file, same 9 km spacing, same colour table, same
 *  tiles — what stops happening is reading the part of the grid no tile was going to draw, opening
 *  a file that was already open, and copying one field twelve times to draw it once. The two trees
 *  were screenshotted at four views with the particles switched off (they are a random simulation)
 *  and compared pixel for pixel; the numbers are in DEV-NOTES.md #R325.
 *
 *  ⚠ THESE CHECKS ASK FOR RELATIONS, NOT SPELLINGS (#R310's rule, and the lessons behind it).
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */
/* ⚠ (#R283/#R317) READ THROUGH `readLF` — a Windows checkout has CRLF in the working tree, and a
   pattern that names a bare newline is then false here and true in CI, i.e. a check that never
   runs. `scripts/eol.mjs` NORMALISES; IT DOES NOT RELAX. */


const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readLF(join(ROOT, p));
/* this round's own prose names every mechanism it describes; prose about a rule is not the rule */
/* the body of a named function, by brace matching — never by a character count (#R283/#R306) */
function fnBody(src, name) {
  /* ⚠ the OPENING PAREN is part of the name, or `omUrl` would find `omUrlOfSomethingElse` */
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

/* ── ① the colour tiles are told what is on screen ────────────────────────────────────────────── */
/* 綴りのまま: 対象は js/wx-ecmwf.js の読み取りの内側（SDK の状態・reader・キュー）の配線で、stub の SDK からは観測できない */
test('R325 ① the tile protocol is handed the view before it runs', () => {
  const e = EC();
  /* the box comes from the camera, not from a constant */
  const vb = fnBody(e, 'viewBounds');
  assert.ok(vb, 'there is one named source for the box the tiles are read at');
  assert.match(vb, /camera\.getBounds\(\)/, 'and it is the live camera');
  assert.match(vb, /VIEW_PAD/, '…padded, for the tiles MapLibre keeps beyond the edge of the viewport');

  /* and it reaches the SDK on the protocol's own path, before the protocol runs */
  const reg = fnBody(e, 'registerProtocol');
  assert.ok(reg, 'the protocol is still registered in one place');
  const iApply = reg.indexOf('applyTileBounds');
  const iProto = reg.indexOf('omProtocol(');
  assert.ok(iApply > 0, 'the handler applies the box');
  assert.ok(iProto > 0 && iApply < iProto,
    'the box is applied BEFORE omProtocol reads it — the SDK samples `currentBounds` while it parses the url');

  /* the SDK's own setter, not a reimplementation of its snapping */
  assert.match(fnBody(e, 'applyTileBounds'), /updateCurrentBounds\(/,
    'through the SDK’s exported setter, which snaps the box OUTWARD to the tile grid');
});

/* ── ② …and at world zoom the box is NOT said, or one read becomes two ────────────────────────── */
/* 綴りのまま: 対象は js/wx-ecmwf.js の読み取りの内側（SDK の状態・reader・キュー）の配線で、stub の SDK からは観測できない */
test('R325 ② past WORLD_RATIO of the grid the box is left unsaid', () => {
  const e = EC();
  const tb = fnBody(e, 'tileBounds');
  assert.ok(tb, 'one place decides whether the box is worth saying');
  assert.match(tb, /WORLD_RATIO/, 'and the decision is a declared share of the grid');
  /* ⚠ THE RANGES, NOT THE DEGREES. The domain is a reduced Gaussian grid (#R299): a row holds
     points in proportion to cos φ, so a box that is half the planet in degrees can hold nearly all
     of its points. The SDK's own `getRanges` is the only honest answer. */
  assert.match(tb, /getRanges\(/, 'measured in grid points (getRanges), not in degrees');
  /* and when the box is not worth saying, it is CLEARED — a stale box would keep the tiles reading
     the wrong region for ever */
  assert.match(fnBody(e, 'applyTileBounds'), /currentBounds\s*=\s*undefined/,
    'the box is cleared rather than left standing at whatever the last zoomed-in view was');

  /* the reason it must be cleared: a GLOBAL field read shares the tiles’ state, because this
     module’s key IS the SDK’s `fileAndVariableKey` for a read with no band. */
  const load = fnBody(e, 'load');
  assert.match(load, /getOrCreateState\(\s*inst\.stateByKey/,
    'the field read still goes into the SDK’s own state map, which is what lets a global rung cost nothing');
});

/* ── ②b a tile can never fall outside the data its own read covers ───────────────────────────── */
/* 綴りのまま: 対象は js/wx-ecmwf.js の読み取りの内側（SDK の状態・reader・キュー）の配線で、stub の SDK からは観測できない */
test('R325 ②b the box always contains the tile that is being asked for', () => {
  const e = EC();
  const tb = fnBody(e, 'tileBounds');
  /* `getBounds()` is what the reader can SEE; `coveringTiles` is what MapLibre decides to FETCH,
     and under pitch the frustum reaches past the horizon the bounds stop at. A tile outside the
     box is not a slower picture, it is a MISSING one. */
  assert.match(tb, /tileBox\(/, 'the requested tile’s own bbox is taken into account');
  assert.match(tb, /Math\.min\([\s\S]{0,80}Math\.max\(/,
    'and it is UNIONED with the view rather than replacing it');
  const box = fnBody(e, 'tileBox');
  assert.ok(box, 'the tile bbox has one named source');
  assert.match(box, /tile2lon|tile2lat/, 'from the SDK’s own tile maths, not a second copy of it');
  /* ⚠ `tile2lon` wraps: the right edge of the world comes back as −180 rather than +180 */
  assert.match(box, /e\s*<=\s*w/, 'and the wrap at the antimeridian is handled');
  /* the url the handler received is what carries the tile index */
  assert.match(fnBody(e, 'registerProtocol'), /applyTileBounds\(\s*params[\s\S]{0,20}url/,
    'the handler passes the request’s own url, which is where the z/x/y lives');
});

/* ── ③ the tiles read through the ONE reader per file that #R310 built ────────────────────────── */
/* 綴りのまま: 対象は js/wx-ecmwf.js の読み取りの内側（SDK の状態・reader・キュー）の配線で、stub の SDK からは観測できない */
test('R325 ③ the colour tiles are inside the reader pool, not beside it', () => {
  const e = EC();
  const tr = fnBody(e, 'tileReader');
  assert.ok(tr, 'there is one named proxy for the reader the tiles use');
  assert.match(tr, /readerFor\(/, 'and it routes to the per-file pool');
  assert.match(tr, /omFileReader\s*=/, '…by replacing the instance’s own singleton');
  /* the SDK reaches THROUGH the reader for both of these; a proxy that dropped them would throw
     inside getProtocolInstance / clearCache rather than merely be slow */
  assert.match(tr, /config/, 'it forwards `config` (getProtocolInstance compares useSAB through it)');
  assert.match(tr, /cache/, 'and `cache` (clearCache calls omFileReader.cache.clear())');
  /* it must never dispose: the pool owns those readers and the field read may be using one */
  assert.match(tr, /dispose:\s*function\s*\(\)\s*\{\s*\}/,
    'and it never disposes — READER_MAX owns the lifetime, and a field read may hold the same reader');

  /* ⚠ AND THE OLD PIN MUST REFUSE IT. `pinReader` memoises `setToOmFile` by url; in front of the
     proxy that would skip the assignment which tells the next `readVariable` which pooled reader
     it belongs to. */
  const pin = fnBody(e, 'pinReader');
  assert.ok(pin, 'the per-reader pin is still there for the pool’s own readers');
  assert.match(pin, /_imProxy/, 'and it refuses the tile proxy');

  /* nothing pins the instance reader any more — that is the proxy’s job now */
  assert.ok(!/pinReader\(\s*inst\.omFileReader\s*\)/.test(e),
    'the instance reader is no longer pinned in place of being pooled');
});

/* ── ④ the next hour is OPENED ahead — and that is not a licence to READ it ───────────────────── */
/* 綴りのまま: 対象は js/wx-ecmwf.js の読み取りの内側（SDK の状態・reader・キュー）の配線で、stub の SDK からは観測できない */
test('R325 ④ opening the next hour is not reading it', () => {
  const e = EC(), w = WX();
  const oa = fnBody(e, 'openAhead');
  assert.ok(oa, 'there is one named door for the open-ahead');
  assert.match(oa, /openReader\(/, 'it opens through the pool, so the step’s own open is a no-op');
  assert.match(oa, /_touchDir/, 'in the direction the reader is travelling (#R305)');
  /* it must not start a read: no `load(`, no `readVariable`, no `prefetchVariable` in it */
  assert.ok(!/\bload\(|readVariable|prefetchVariable/.test(oa),
    'and it moves no data — an open is a HEAD, a trailer and a tree walk, which is `touch`’s price class, not a band’s');
  /* it is out of range at the ends of the axis rather than building a broken url */
  assert.match(oa, /validTimes\.length|\bn\b/, 'and it stops at the ends of the axis');

  /* ⚠ #R276 追記’S RULE IS UNTOUCHED: the BYTES of the next hour are still only spent once the
     reader has actually moved the axis. */
  assert.match(w, /opt&&opt\.step[\s\S]{0,240}?readAhead\(/,
    'the read-ahead of the next hour still happens only after a step, not on switch-on');
});

/* ── ⑤ the raster tile size is ONE declaration, and vector tiles do not get it ─────────────────── */
test('R325 ⑤ tile_size and tileSize are one number', async () => {
  const e = EC(), w = WX();
  /* ⚠ (tests-by-topic) the url side is ASKED on the module built on the cold page
     (tests/helpers/wx-ecmwf-page.mjs), instead of reading `omRasterUrl` for `TILE_PX` and `omUrl`
     for the absence of `tile_size`. The page's globals are put back afterwards. */
  const saved = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch };
  try {
    const { ENG } = await coldWxModel({ sdkMs: 0, readMs: 0 });
    const M = ENG.model('ecmwf_wam025');
    await M.meta();
    assert.ok([64, 128, 256, 512, 1024, 2048].includes(M.TILE_PX),
      'the size is declared once, and it is one of the sizes the SDK accepts (' + M.TILE_PX + ')');
    const raster = new URL(M.omRasterUrl('wave_height').replace(/^om:\/\//, ''));
    assert.equal(raster.searchParams.get('tile_size'), String(M.TILE_PX), 'the raster url spells the size from that one declaration');
    /* the plain url — the one the VECTOR sources use — must NOT carry it: for an MVT the SDK writes
       `tile_size` as the layer extent and lays the arrows out against it, which is a different
       decision and one this round did not measure */
    const plain = new URL(M.omUrl('wave_height').replace(/^om:\/\//, ''));
    assert.equal(plain.searchParams.get('tile_size'), null, 'omUrl (isobars, wind arrows — vector sources) is unchanged');
    assert.equal(M.omRasterUrl('wave_height').split('&tile_size=')[0], M.omUrl('wave_height'), '…and is otherwise the same url');
  } finally {
    for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete globalThis[k]; else globalThis[k] = saved[k]; }
  }

  /* the renderer side: every raster source that carries an om:// url declares the same size, and
     it reads it from the module rather than repeating the number
     綴りのまま: raster source を組むのは MapLibre の style に addSource する js/weather.js の closure の中 */
  const srcs = w.match(/addSource\([^;]*type:'raster'[^;]*\)/g) || [];
  assert.ok(srcs.length >= 2, 'both om raster sources are still built here');
  for (const s of srcs) {
    /* ⚠ (#R356) `EC` TAKES AN ARGUMENT NOW, AND THE CLAIM IS UNCHANGED. This pinned `EC()` because
       there was one model and therefore one accessor; each weather layer picks its own model since
       #R356, so the raster sources call `EC(cfg)` — the SAME accessor, resolved to the instance
       THIS layer is reading. What #R325 requires is that the size is READ from the module's one
       declaration rather than written down again beside the url, and that is what is asserted:
       any `EC(…)`, and never a numeric literal. */
    assert.match(s, /tileSize:\s*EC\([^)]*\)\.TILE_PX/,
      'every om raster source asks for the same size the url does — half of it would draw the map at the wrong resolution');
    assert.ok(!/tileSize:\s*\d/.test(s), '…and none of them writes the number down');
    assert.match(s, /omRasterUrl\(|url:url/, 'and it is a url that carries tile_size');
  }
  assert.match(w, /omRasterUrl\(/, 'the raster url helper is the one the raster sources use');
});
}

/* ════════ #R398 — from tests/r398-checks.test.mjs ════════ */
{
/* ============================================================================
 *  R398 — the field's unit and the reader's unit are one declaration apart
 * ----------------------------------------------------------------------------
 *  「海面気圧レイヤーのカーソル読み出しが、自分の凡例と100倍食い違っている。」
 *
 *  MEASURED on the built page before the fix, one point, three instruments describing one picture:
 *
 *      IntMapECMWF.valueNow('pressure_msl', 35, -80)   101,458.75      ← the .om field, in PASCALS
 *      legend('pressure_msl')                          hPa · 940…1060  ← the SDK's own ramp
 *      the corner readout                              「101237 hPa」   ← the first in the second's unit
 *
 *  The readout was the visible half and the least of it. `getColor` — the function the SDK's tile
 *  worker paints every pixel through — returns the ramp's LAST colour for 100,000 Pa, for
 *  101,458.75 Pa and for 102,500 Pa alike, so the sea-level-pressure raster was a uniform red
 *  sheet; and the isobars are contoured at that ramp's breakpoints, so lines were sought at
 *  940…1060 in a field that runs 87,000…108,000 and 「等圧線」 drew nothing at all.
 *
 *  ⚠ THESE CHECKS DO NOT PIN NUMBERS, THEY PIN THE RELATION. Nothing here asserts that pressure is
 *  hPa or that the factor is 100 — a later round may add a second variable, or Open-Meteo may
 *  change what its files hold. What must stay true is that ONE declaration relates the two units
 *  and that every consumer is derived from it:
 *
 *      ① the declaration exists once, and no second file writes the factor down
 *      ② the renderer's ramp is the reader's ramp put through it, and nothing else
 *      ③ `scale()` / `legend()` answer from the READER's ramp
 *      ④ `sampler()` — and therefore valueNow / valueAt — divides by the same factor
 *      ⑤ the arithmetic, executed: ×per exactly, and the light/dark pair survives
 *      ⑥ the readout's NUMBER and the readout's UNIT come from one engine and one variable
 *      ⑦ the isobar label divides by the declaration rather than by a literal
 *      ⑧ an entry names a variable the app actually ships
 *
 *  ⑤ is the one that runs rather than reads: the declaration block is lifted out of
 *  js/wx-ecmwf.js and evaluated against a fake SDK, so the multiplication and the theme handling
 *  are checked as behaviour instead of as a regular expression.
 * ==========================================================================*/
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const EC = read('js/wx-ecmwf.js');
const ECC = codeOnly(EC);
const WX = codeOnly(read('js/weather.js'));
const RO = codeOnly(read('js/map-readout.js'));

/* ── the declaration block, lifted out and made runnable ──────────────────────────────────────
   From `var FIELD_UNITS = {` to the end of `inFieldUnits`. It is in the file's SHARED prelude
   (above `function createModel`), which is why it can be sliced at all: it closes over nothing
   but `sdk`. */
function declarationBlock() {
  const from = ECC.indexOf('var FIELD_UNITS = {');
  const to = ECC.indexOf('function createModel(');
  assert.ok(from > 0, 'FIELD_UNITS is declared in js/wx-ecmwf.js');
  assert.ok(to > from, '…in the shared prelude, above the per-model body');
  return ECC.slice(from, to);
}
function evalDeclaration(sdk) {
  const ctx = vm.createContext({ sdk, JSON, String, Object });
  vm.runInContext(declarationBlock() + '\n;({FIELD_UNITS, fieldUnit, fieldPer, inFieldUnits});', ctx);
  return vm.runInContext('({FIELD_UNITS, fieldUnit, fieldPer, inFieldUnits})', ctx);
}
/* ⚠ an object built inside the VM has the VM realm's Array/Object prototypes, so
   `deepStrictEqual` refuses it however identical the contents are. Compared by value. */
const j = (x) => JSON.parse(JSON.stringify(x));

/* the shipped ECMWF layer table, parsed out of js/weather.js — the same source #R356's fixture
   check reads, so the two cannot drift apart */
function shippedLayers() {
  const out = [];
  const re = /\{id:'(ec-[a-z]+)',\s*variable:'([a-z0-9_]+)',\s*type:'([a-z]+)',\s*op:([0-9.]+),\s*kind:'([a-z]+)'/g;
  let m; while ((m = re.exec(WX))) out.push({ id: m[1], variable: m[2], type: m[3], kind: m[5] });
  assert.ok(out.length >= 8, 'the ECMWF layer table parsed');
  return out;
}

/* ── ① ONE DECLARATION, AND NOBODY ELSE WRITES THE FACTOR DOWN ───────────────────────────────── */
/* 綴りのまま: 対象は js/wx-ecmwf.js の読み取りの内側（SDK の状態・reader・キュー）の配線で、stub の SDK からは観測できない */
test('R398 ① the field↔reader unit relation is declared exactly once', () => {
  assert.equal((ECC.match(/var FIELD_UNITS = \{/g) || []).length, 1,
    'FIELD_UNITS is declared once in js/wx-ecmwf.js');
  const decl = declarationBlock();
  /* every unit STRING in this file belongs to that block — a second `'hPa'` anywhere else would be
     a second answer to 「what unit is this?」, which is how the four copies #R270 warns about start */
  const units = [...ECC.matchAll(/'(hPa|Pa|mbar|millibar)'/g)];
  assert.ok(units.length > 0, 'the block names the two units');
  const from = ECC.indexOf(decl), to = from + decl.length;
  /* ⚠ (#R439) ONE EXEMPTION, AND IT IS NOT A CONVERSION. A colour ramp declares the unit its own
     breakpoints are stated in (`WIND_ANCHORS.unit` is 'm/s', `TEMP_ANCHORS.unit` is '°C'), and that
     string is what `legend().unit` prints — it is the READER's ramp saying what it is, not a second
     answer to 「how many of the file's units make one of the reader's」. #R439 added a pressure ramp,
     so `unit: 'hPa'` now appears outside this block for the first time. What this test is about is
     unchanged and is still asserted below: no consumer spells a conversion of its own. */
  for (const m of units) assert.ok((m.index >= from && m.index < to) || /unit: $/.test(ECC.slice(m.index - 6, m.index)),
    'no unit literal for this quantity lives outside the declaration, except a ramp naming its own');
  /* …and no consumer carries the number. js/weather.js reaches for `.per`; js/map-readout.js takes
     the unit off the legend. Neither may spell a conversion of its own. */
  assert.ok(!/pressure[^\n]{0,60}\/\s*100\b/.test(WX), 'js/weather.js writes no Pa→hPa division');
  assert.ok(!/\/\s*100\b/.test(RO.slice(RO.indexOf('function ecmwfReadout'), RO.indexOf('function updateLayerReadout'))),
    'js/map-readout.js writes none either');
});

/* ── ② THE RENDERER'S RAMP IS THE READER'S RAMP PUT THROUGH THE DECLARATION ──────────────────── */
/* 綴りのまま: 対象は js/wx-ecmwf.js の読み取りの内側（SDK の状態・reader・キュー）の配線で、stub の SDK からは観測できない */
test('R398 ② the two views of one ramp differ only by the declaration', () => {
  const s = ECC.slice(ECC.indexOf('function omSettings()'), ECC.indexOf('function viewBounds()'));
  assert.match(s, /displayScales = scales;/, 'the reader keeps the ramp untouched');
  assert.match(s, /var painted = Object\.assign\(\{\}, scales\);/,
    '…and the renderer starts from that very object');
  assert.match(s, /Object\.keys\(FIELD_UNITS\)\.forEach\(function \(v\) \{ var s = inFieldUnits\(v, scales\); if \(s\) painted\[v\] = s; \}\);/,
    '…and only the declared variables are rewritten, through the one conversion');
  assert.match(s, /colorScales: painted,/, 'the SDK is handed the renderer\'s copy');
  /* the reverse of the same statement: `settings.colorScales` must not be what the reader reads */
  assert.ok(!/displayScales = painted/.test(s), 'the two are never the same object');
});

/* ── ③ scale() / legend() ANSWER FROM THE READER'S RAMP ──────────────────────────────────────── */
/* 綴りのまま: 対象は js/wx-ecmwf.js の読み取りの内側（SDK の状態・reader・キュー）の配線で、stub の SDK からは観測できない */
test('R398 ③ the key speaks the unit the reader is shown', () => {
  const s = ECC.slice(ECC.indexOf('function scale(variable, dark)'), ECC.indexOf('function rgbaCss('));
  assert.match(s, /sdk\.getColorScale\(variable, !!dark, displayScales\)/,
    'scale() resolves against displayScales, not the renderer\'s copy');
  /* legend() is built on scale(), so its `unit` is the reader's by construction */
  const lg = ECC.slice(ECC.indexOf('function legend(variable, dark)'), ECC.indexOf('function legend(variable, dark)') + 900);
  assert.match(lg, /var s = scale\(variable, dark\);/, 'legend() reads scale()');
  assert.match(ECC, /return \{ unit: s\.unit \|\| '',/, '…and takes its unit from it');
});

/* ── ④ EVERY POINT VALUE LEAVES THROUGH ONE DIVISION ─────────────────────────────────────────── */
/* 綴りのまま: 対象は js/wx-ecmwf.js の読み取りの内側（SDK の状態・reader・キュー）の配線で、stub の SDK からは観測できない */
test('R398 ④ sampler() converts, so valueNow and valueAt cannot disagree with the key', () => {
  const s = ECC.slice(ECC.indexOf('function sampler(variable, i)'), ECC.indexOf('function valueNow('));
  assert.match(s, /var per = fieldPer\(variable\);/, 'the factor comes from the declaration');
  assert.match(s, /value: function \(lat, lon\) \{ var v = _lin\(g, d\.values, lat, lon\); return per === 1 \? v : v \/ per; \}/,
    'the scalar reading is converted');
  assert.match(s, /if \(per !== 1\) sp \/= per;/, '…and so is the speed the vector reading is built from');
  /* valueNow / valueAt must keep going through sampler rather than reaching for the frame */
  const vn = ECC.slice(ECC.indexOf('function valueNow('), ECC.indexOf('function valueNow(') + 400);
  assert.match(vn, /var s = sampler\(variable, i\);/, 'valueNow is sampler()');
  assert.match(ECC, /function valueAt\(variable, lat, lng, i\) \{\s*var v = valueNow\(/,
    'valueAt is valueNow()');
  assert.ok(!/_lin\(g, d\.values/.test(ECC.slice(ECC.indexOf('function valueNow('))),
    'nothing below sampler() reads the raw array again');
});

/* ── ⑤ THE ARITHMETIC, EXECUTED ──────────────────────────────────────────────────────────────── */
test('R398 ⑤ inFieldUnits multiplies by per exactly, and the light/dark pair survives', () => {
  const LIGHT = [[1, 1, 1, 1], [2, 2, 2, 1], [3, 3, 3, 1]];
  const DARK = [[9, 9, 9, 1], [8, 8, 8, 1], [7, 7, 7, 1]];
  const BP = [940, 1000, 1060];
  let asked = [];
  const sdk = {
    getColorScale(v, dark) {
      asked.push([v, dark]);
      return { type: 'breakpoint', unit: 'hPa', breakpoints: BP.slice(), colors: dark ? DARK : LIGHT };
    }
  };
  const D = evalDeclaration(sdk);
  const variable = Object.keys(D.FIELD_UNITS)[0];
  const per = D.FIELD_UNITS[variable].per;
  const out = D.inFieldUnits(variable, {});

  assert.deepEqual(j(asked.map((a) => a[1])), [false, true], 'BOTH themes are asked for');
  assert.equal(out.unit, D.FIELD_UNITS[variable].field, 'the renderer\'s copy names the FIELD\'s unit');
  assert.deepEqual(j(out.breakpoints), BP.map((b) => b * per), 'breakpoints are the reader\'s × per');
  /* the relation, not the number: dividing back must land on the reader's ramp EXACTLY */
  assert.deepEqual(j(out.breakpoints).map((b) => b / per), BP,
    'and the conversion is exact in both directions — a per that lost a bit would be caught here');
  assert.deepEqual(j(out.colors), { light: LIGHT, dark: DARK },
    'a ramp whose themes differ keeps both halves, so a dark reader is not shown the light colours');

  /* when the two themes agree the pair is pointless, and the flat array is what the SDK expects */
  const flat = evalDeclaration({
    getColorScale: () => ({ type: 'breakpoint', unit: 'hPa', breakpoints: BP.slice(), colors: LIGHT })
  });
  assert.deepEqual(j(flat.inFieldUnits(variable, {}).colors), LIGHT, 'one theme → one array');

  /* an `rgba` ramp has no breakpoints; its ends must travel the same way */
  const rgba = evalDeclaration({
    getColorScale: () => ({ type: 'rgba', unit: 'hPa', min: 940, max: 1060, colors: LIGHT })
  });
  const r = rgba.inFieldUnits(variable, {});
  assert.equal(r.min, 940 * per); assert.equal(r.max, 1060 * per);
  assert.ok(!('breakpoints' in r), 'and it gains no breakpoints it never had');

  /* ⚠ AND NOTHING ELSE IS TOUCHED. A variable with no entry must come back null rather than be
     rescaled by 1 — an accidental rewrite of a ramp that was already right is the failure this
     round is about, in the other direction. */
  assert.equal(D.inFieldUnits('temperature_2m', {}), null, 'an undeclared variable is left alone');
  assert.equal(D.fieldUnit('temperature_2m'), null);
  assert.equal(D.fieldPer('temperature_2m'), 1, 'and its factor is the identity');
  assert.equal(D.fieldPer(variable), per);
});

/* ── ⑥ THE NUMBER AND THE UNIT COME FROM ONE ENGINE AND ONE VARIABLE ─────────────────────────── */
/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('R398 ⑥ the readout\'s value and the legend\'s unit go through the same conversion', () => {
  const s = RO.slice(RO.indexOf('function ecmwfReadout'), RO.indexOf('function updateLayerReadout'));
  /* ONE engine handle for both — #R376's rule, and the reason the two can never be in different
     units: `legend()` and `valueNow()` are the same module's two ends of one declaration. */
  assert.match(s, /const EC=ecFor\(cfg\); if\(!EC\) return null;/, 'one engine is resolved');
  assert.match(s, /const v=EC\.valueNow\(cfg\.variable,lat,lng\);/, 'the number comes from it');
  assert.match(s, /const lg=EC\.legend\(cfg\.variable,true\);/, '…and the unit from the same one');
  assert.match(s, /let out, unit=\(lg&&lg\.unit\)\|\|'';/, '…and that unit is what is printed');
  /* the raw branch must not invent a unit of its own */
  assert.match(s, /else \{ out=\(Math\.abs\(v\)>=100\?Math\.round\(v\):\(Math\.round\(v\*10\)\/10\)\)\+\(unit\?\(' '\+unit\):''\); \}/,
    'a `raw` variable prints the module\'s number with the module\'s unit and nothing else');
  /* both halves name the SAME variable — a mismatch here would print one field's number under
     another field's unit, which is the same defect one layer up */
  const pairs = [...s.matchAll(/EC\.(valueNow|legend)\((cfg\.variable)/g)].map((m) => m[2]);
  assert.deepEqual(pairs, ['cfg.variable', 'cfg.variable'], 'one variable, both ends');
});

/* ── ⑦ THE ISOBAR LABEL IS THE CONTOUR LEVEL, DIVIDED BY THE DECLARATION ─────────────────────── */
/* 綴りのまま: 対象は js/weather.js の closure（凡例の DOM と地図の source / layer）の中で、ブラウザの外では走らない */
test('R398 ⑦ the isobar label is built from the declaration, not from a literal', () => {
  assert.match(WX, /let fu=null; try\{ fu=EC\(cfg\)\.fieldUnit&&EC\(cfg\)\.fieldUnit\(cfg\.variable\); \}catch\(_\)\{\}/,
    'the label asks the engine for the factor');
  assert.match(WX, /return fu \? \['to-string',\['round',\['\/',\['to-number',\['get','value'\],0\],fu\.per\]\]\] : \['get','value'\];/,
    '…divides the SDK\'s own contour value by it, and leaves an undeclared variable\'s label alone');
  assert.match(WX, /'text-field':_contourLabel\(cfg\)/, 'and the isobar symbol layer uses it');
  /* the level the SDK contours at is the breakpoint of the ramp it was GIVEN — the renderer's copy —
     so the label and the lines are the same declaration seen from two sides */
  assert.ok(!/'text-field':\['get','value'\]/.test(WX),
    'no contour layer still prints the raw level');
  /* `fieldUnit` is exported for exactly this caller */
  assert.match(ECC, /fieldUnit: fieldUnit,/, 'the engine publishes it');
});

/* ── ⑦b THE THREE THINGS AN ISOBAR NEEDS IN ORDER TO EXIST ───────────────────────────────────────
   The label conversion above is unobservable unless all three hold, and NONE of them did. Each is
   a separate measurement, recorded beside the assertion that keeps it: */
/* 綴りのまま: 対象は js/weather.js の closure（凡例の DOM と地図の source / layer）の中で、ブラウザの外では走らない */
test('R398 ⑦b the isobar tile is asked for contours, and its label can be placed', () => {
  /* ① the SDK draws what the url asks for — a url with neither `arrows` nor `contours` produces a
     tile with no `contours` layer in it at all. MEASURED: 0 features plain, 900 with the flag. */
  /* ⚠ (#R439) THE CLAIM IS UNCHANGED, THE SHAPE IS NOT. `_tileExtra` now appends the contour LEVELS
     as well (`&intervals=…`), because that round replaced the pressure ramp with a 1,801-breakpoint
     gradient and the SDK contours at the ramp's breakpoints when it is given none. What this test
     is about — 「a vector row asks the SDK for the thing it draws」 — is asserted the same way; the
     literal is matched loosely enough that adding a parameter is not a failure, and the two
     following assertions still pin the bare url out of existence. */
  assert.match(WX, /const _tileExtra=\(cfg\)=>cfg\.type==='arrows'\?'&arrows=true'\s*[\r\n]*\s*:cfg\.type==='isobars'\?\('&contours=true[^']*'/,
    'each vector row asks the SDK for the thing it draws');
  assert.match(WX, /const url=omUrl\(cfg,_tileExtra\(cfg\)\);/, 'and the source is built from that');
  assert.ok(!/omUrl\(cfg,cfg\.type==='arrows'\?'&arrows=true':''\)/.test(WX),
    'the isobars are no longer silently sent the bare url');
  /* ② a font the style's glyph endpoint actually serves. Every other symbol layer in this app names
     one; this was the only one that did not. */
  const lbl = WX.slice(WX.indexOf('if(!GE().layers.has(lbl))'), WX.indexOf('} else if(cfg.type===\'arrows\')'));
  assert.match(lbl, /'text-font':\['literal',\['Noto Sans Regular'\]\]/, 'the label names a real font');
  /* ③ point placement. MEASURED on the live contour source: 'line' and 'line-center' place ZERO
     labels on these geometries at any tile_size, 'point' places them. */
  assert.match(lbl, /'symbol-placement':'point'/, 'and a placement MapLibre can honour here');
});

/* ── ⑧ AN ENTRY NAMES A VARIABLE THE APP SHIPS ───────────────────────────────────────────────── */
test('R398 ⑧ every declared variable is one the app actually draws', () => {
  const D = evalDeclaration({ getColorScale: () => null });
  const shipped = new Set(shippedLayers().map((l) => l.variable));
  for (const v of Object.keys(D.FIELD_UNITS)) {
    assert.ok(shipped.has(v),
      `${v} is declared as needing a conversion but no layer reads it — a rule with no subject`);
  }
  /* …and the layers that DO read a declared variable are the ones whose pictures the conversion
     repairs: the raster is painted from it and the isobars are contoured at it */
  const users = shippedLayers().filter((l) => D.FIELD_UNITS[l.variable]);
  assert.ok(users.some((l) => l.type === 'raster'), 'a raster reads it');
  assert.ok(users.some((l) => l.type === 'isobars'), 'and so does a contour layer');
});
}
