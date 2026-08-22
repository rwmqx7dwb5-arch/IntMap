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
