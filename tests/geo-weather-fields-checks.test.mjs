/* ============================================================================
 *  WEATHER FIELDS — ECMWF の読み・風・日付のあるレイヤー
 * ----------------------------------------------------------------------------
 *  js/wx-ecmwf.js and js/weather.js: which band is read first, what waits for the colour field, frames
 *  kept per time, an overtaken read that spends nothing, the wide-read staircase, the hourly domain,
 *  and dated layers that step over dates the product published.
 *
 *  ⚠ ONE BLOCK PER ROUND, AND EACH BLOCK IS ISOLATED. The rounds below used to be files of their own,
 *  each in its own process; `isolate()` (tests/helpers/geo-shared.mjs) gives every block back the
 *  globalThis a fresh process had, so no block reads a `window` another one left behind. Test titles
 *  carry the round that wrote them (#R<N>), and each block keeps that round's own account of WHY.
 * ==========================================================================*/

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { coldWxModel, until } from './helpers/wx-ecmwf-page.mjs';
import { isolate, read } from './helpers/geo-shared.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R298 · the first read, the colour field, dated layers   (was tests/r298-checks.test.mjs, in part)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* (#R298's own header — the reports that opened the round — is kept with its block in
   tests/geo-weather-alerts-checks.test.mjs.) */
describe('§ #R298 · the first read, the colour field, dated layers', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  /* ── ⑦ 「持っていない」 and 「the globe」 are different answers ─────────────────────────────── */
  test('R298 ⑦ the wind’s first read is the band on screen, which it never was', async () => {
    /* MEASURED consequence of the old spelling: `heldBand()` answered null both when a GLOBAL frame
       was held and when NO frame was held, `bandCovers(null, …)` reads null as 「covers everything」,
       so the caller's `if(!bandCovers(heldBand(VAR), b)) b = nearBand()` was false on the very first
       load and the opening view (the globe) read 13,199,360 samples before a particle moved.
       #R297 wrote `bandNear` for exactly that load and it never ran.
       ⚠ EVALUATED (these three used to match the spellings in js/wx-ecmwf.js): the shipped module is
       built on the one cold page tests/helpers/wx-ecmwf-page.mjs provides and ASKED — before any
       frame, and after a global one. */
    const { ENG } = await coldWxModel({ sdkMs: 5, readMs: 5 });
    const M = ENG.model('ecmwf_wam025');
    await M.meta();
    const band = M.bandFor(30, 46);                       /* the band a view of Japan asks for */
    assert.ok(Array.isArray(band), 'a regional view asks for a band, not the globe');
    assert.equal(M.heldBand('wave_height'), false, 'no frame at all is `false`, which is not `null`');
    assert.equal(M.bandCovers(M.heldBand('wave_height'), band), false, 'and bandCovers tells them apart');
    /* the hour the reader is ON (heldBand asks about the current hour, not an arbitrary one) */
    const globe = await M.load('wave_height', M.index(), null);
    assert.ok(globe && globe.data, 'a global read was made');
    assert.equal(M.heldBand('wave_height'), null, 'a GLOBAL frame is `null`…');
    assert.equal(M.bandCovers(M.heldBand('wave_height'), band), true, 'while a global frame still covers everything');
    /* 綴りのまま（呼び手の 1 行）: js/weather.js は地図と DOM の上の closure で、Node で組み立てる扉が無い。
       the caller is unchanged — the defect was in what it was told, not in what it asked */
    const w = read('js/weather.js');
    assert.match(w, /if\(!EC\(\)\.bandCovers\(EC\(\)\.heldBand\(VAR\),b\)\) b=nearBand\(\)\|\|b;/);
  });

  /* ── ⑧ nothing that the reader cannot see is read before the colour is up ────────────────── */
  test('R298 ⑧ the reads that do not draw wait for the colour field', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（js/weather.js の表示の順序）。 */
    const w = read('js/weather.js');
    /* one reader, one queue (js/wx-ecmwf.js `serial`), and the raster tiles decode through it too —
       so the next hour's prefetch (a DIFFERENT file, which re-points the reader), the wide band and
       the cursor readout were all queued ahead of the tiles the reader is waiting to see. */
    assert.match(w, /function afterFieldShown\(fn,graceMs\)\{/, 'there is one place that defers');
    /* ⚠ (#R310) `readAhead` replaced `prefetch` for the wind — same hour, same band, but it keeps
       the decoded frame. */
    /* ══ ⚠⚠⚠ (#R314) THE HOUR THE READER IS STEPPING **ONTO** NO LONGER WAITS, AND THAT IS THIS
       CHECK'S OWN PREMISE EXPIRING RATHER THAN A REGRESSION ═══════════════════════════════════════
       The premise stated three lines above is 「one reader, one queue … so the next hour's prefetch
       (A DIFFERENT FILE, WHICH RE-POINTS THE READER) … queued ahead of the tiles」. #R310 gave every
       file its own reader (`readerFor`, four of them) and pinned the singleton the tiles use, so a
       read of another hour cannot re-point anything the tiles are holding; #R310's own note says as
       much (「with a reader per file it is no longer in front of anything」) and left the gate up.
       What that cost, MEASURED by suppressing the colour raster and stepping the axis:
           the particles' band read      513 / 521 / 534 / 537 ms
           ONE colour tile               1,266 / 1,381 / 1,772 ms
       — so waiting for the colour started the read-ahead about 2.1–2.6 s after the step, and a
       reader stepping every ~1.2 s never reached it (0 / 1,180 / 0 / 1,279 / 0 / 1,724 ms).
       ⚠ THE RULE THIS CHECK PROTECTS IS STILL HERE, AND IT IS STILL LOAD-BEARING. It now applies to
       the read that is actually a GUESS — the SECOND hour ahead (`aheadMore`). An intermediate build
       released both by the field and bought 802 → 447 ms for the particles by spending
       1,584 → 1,906 ms of the colour, which is the complaint this very round of the project was
       opened by (「背景のカラーが、時間を変えるとなかなか表示されない」). See tests/r314-checks. */
    assert.match(w, /afterFieldShown\([\s\S]{0,60}?aheadMore\(/,
      'the SPECULATIVE second hour ahead still waits for the colour (#R314)');
    assert.ok(!/afterFieldShown\([\s\S]{0,240}?EC\(\)\.readAhead\(/.test(w),
      '…and the CERTAIN next hour no longer does, because #R310 removed the reason it ever had to');
    assert.match(w, /afterFieldShown\(\(\)=>\{[\s\S]{0,700}EC\(\)\.load\(VAR,null,want,true\)/, 'the wide band waits');
    assert.match(w, /if\(W&&W\.on&&W\.on\(\)&&W\.afterFieldShown\)\{ W\.afterFieldShown\(warmReadNow\); return; \}/,
      'and so does the cursor readout, but only while the wind is the layer holding the reader');
    assert.match(w, /fieldShown\(\);/, 'the reveal releases them');
    assert.match(w, /function fieldShown\(\)\{ fieldPending=false;/, 'exactly once, to everyone waiting');
    /* ⚠ never a path that waits for ever: the 12 s backstop runs the same reveal */
    assert.match(w, /_whenSrcLoaded\(s\.src,reveal,12000\);/);
    /* the particles' own first read is NOT deferred — deferring it would make the particles slower */
    const load = w.slice(w.indexOf('function load(opt){'), w.indexOf('function ensureRenderer()'));
    assert.ok(!/afterFieldShown\([\s\S]{0,120}return EC\(\)\.load\(VAR/.test(load),
      'the field the particles fly on is read immediately');
  });

  /* ── ⑨ a dated layer can only be asked for a date that exists ────────────────────────────── */
  test('R298 ⑨ the dated weather layers step over dates the product actually published', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（DATED_SPEC は js/data-layers.js の中）。 */
    const d = read('js/data-layers.js');
    assert.match(d, /const DATED_SPEC=/, 'each dated layer declares its own range and cadence');
    /* the three facts, per layer — a single global 「now − 2 days」 was the thing being replaced */
    const spec = d.slice(d.indexOf('const DATED_SPEC='), d.indexOf('const DATED_SPEC=') + 1400);
    ['precip', 'sst', 'snow', 'aod'].forEach(id =>
      assert.ok(new RegExp(id + "\\s*:\\s*\\{[^}]*start:").test(spec), id + ' declares a start'));
    assert.match(spec, /lagDays:\s*0/, 'and the lag is per product — one of them publishes same-day');
    assert.match(d, /function _snapLayerDate\(/, 'a date the product does not have is snapped');
    assert.match(d, /function _stepDate\(/, 'and the steppers move by one published frame');
    /* the reader is told when the day they picked is not the day being drawn */
    assert.match(d, /function _dateNote\(/);
    /* the app-wide clock goes through the same rounding rather than a single global clamp */
    const g = d.slice(d.indexOf('window.setGlobalLayerDate'), d.indexOf('window.setGlobalLayerDate') + 900);
    assert.ok(/_snapLayerDate|_dateBounds/.test(g), 'setGlobalLayerDate rounds per layer');
  });

  ISOLATED.built();
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R299 · frames per time, overtaken reads, the staircase   (was tests/r299-checks.test.mjs, in part)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* (#R299's own header — the reports that opened the round — is kept with its block in
   tests/geo-weather-alerts-checks.test.mjs.) */
describe('§ #R299 · frames per time, overtaken reads, the staircase', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  /* ⚠ A CHECK THAT SAYS 「this spelling must be gone」 HITS THE COMMENT THAT EXPLAINS WHY IT WENT.
     This project has paid for that twenty-four times; ask the question of the text that RUNS. */
  const noComments = (src) => codeOnly(src);

  /* ── ⑥ the wind reaches the SAME picture with less waiting and less traffic ────────────────── */
  test('R299 ⑥ a frame is kept per TIME, not one per variable — a step back costs nothing', async () => {
    /* ⚠ the RELATION: what is dropped is what the new frame SUPERSEDES — same key, and a band the new
       one covers — never 「anything of this variable」, which is what made a step back a re-download.
       ⚠ EVALUATED on the shipped module (this used to match keepFrame's spelling): step forward, step
       back, and count the reads the page's SDK was asked for. */
    const { calls, ENG } = await coldWxModel({ sdkMs: 5, readMs: 5 });
    const M = ENG.model('ecmwf_wam025');
    const meta = await M.meta();
    /* the walk below needs three consecutive hours (i, i+1, i+2). index() is the valid time NEAREST
       the wall clock, so in the second half of any hour it is one further along — and taking it as
       is made this check red for half of every hour (the fixture's axis is only four hours long). */
    const n = meta.validTimes.length;
    assert.ok(n >= 3, 'the fixture offers three consecutive hours to walk: ' + n);
    const i = Math.min(M.index(), n - 3);
    assert.ok((await M.load('wave_height', i, null)).data, 'the hour the reader is on is read');
    assert.ok((await M.load('wave_height', i + 1, null)).data, 'the next hour is read');
    const mine = () => M.heldFrames().filter((f) => f.variable === 'wave_height');
    assert.equal(new Set(mine().map((f) => f.key)).size, 2, 'the identity that is replaced is the KEY (variable + valid time): ' + JSON.stringify(mine()));
    const reads = calls.ensureData;
    const back = await M.load('wave_height', i, null);
    assert.ok(back && back.data && back.data.values, 'stepping back answers with the frame');
    assert.equal(calls.ensureData, reads, 'a step back is a re-download — dropping every frame of the same variable is what this replaces');
    /* …and only when the new band covers the old one: a global read of an hour held as a band
       replaces that band's frame, and leaves the other hours alone */
    const band = M.bandFor(30, 46);
    assert.ok((await M.load('wave_height', i + 2, band)).data, 'a band of a third hour is read');
    const bandKey = mine().find((f) => Array.isArray(f.band)).key;
    assert.ok((await M.load('wave_height', i + 2, null)).data, 'and then the globe of that hour');
    assert.deepEqual(mine().filter((f) => f.key === bandKey).map((f) => f.band), [null], 'the globe superseded the band it covers');
    assert.equal(new Set(mine().map((f) => f.key)).size, 3, 'and no other hour was dropped');
    /* 綴りのまま（予算の半分）: FRAME_SAMPLES は数百万標本の上限で、この page の格子（1 枚 40 標本）では
       届かない。上限が在ることは、ソースからしか訊けない。 */
    const s = read('js/wx-ecmwf.js');
    const at = s.indexOf('function keepFrame(');
    assert.ok(at > 0 && /FRAME_SAMPLES/.test(s.slice(at, at + 900)), 'and the budget still bounds it');
  });

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

  test('R299 ⑥ a read that has been overtaken does not spend the network', async () => {
    /* ⚠⚠⚠ (#R664) THIS USED TO READ THE SOURCE: `seq !== mine` had to appear in the queued block,
       and to appear BEFORE `ensureData` in it. #R664 moved the ticket from the call to the read
       (see the header of tests/helpers/wx-ecmwf-page.mjs), so the spelling is `seq !== ticket.mine` and the two string
       positions say nothing about the order the module is EVALUATED in anyway (#R505). Both halves
       are measured instead, on the queue itself: the overtaken read spends no decode — which is what
       made dragging the slider across twenty steps cost twenty reads — and it does not answer falsy,
       because js/weather.js reads falsy as 「the data is unavailable」 and runs the retry ladder that
       ends in the toast reported in #R298.
       ⚠ tests/r664-checks.test.mjs ② measures the first half on a COLD model (one read, no frame to
       fall back on); this one is the case that has a frame, which is where 「answers with a frame
       rather than a failure」 can be observed at all. */
    const { page, calls, ENG } = await coldWxModel({ sdkMs: 60, readMs: 300 });
    const M = ENG.model('ecmwf_wam025');
    await M.meta();                       /* the axis, so every hour below has a file name */
    const first = await M.load('wave_height', 0, null);
    assert.ok(first && first.data, 'the hour the reader started on is read');
    /* ⚠ THE ORDER IS THE WHOLE ARRANGEMENT, AND IT IS NOT MADE OF MILLISECONDS. Each step waits for
       the fact that puts the next call in the position this case is about — the running read has to
       be AT the data before the next is asked for, and the overtaken one has to have taken its ticket
       and joined the queue before the one that overtakes it is asked for. `rec.states` is the mark of
       that second moment: the module asks for the state between taking the ticket and queueing the
       job (see the header of tests/helpers/wx-ecmwf-page.mjs). */
    const running = M.load('wave_height', 1, null);      /* one foreground read at a time — this one runs */
    await until(() => calls.ensureData === 2, 'the foreground read to hold the lane', { observe: () => calls });
    const overtaken = M.load('wave_height', 2, null);    /* …so this one waits in the queue behind it */
    await until(() => page.rec.states.length === 3, 'the overtaken read to take its ticket and queue',
      { observe: () => page.rec.states });
    const wanted = M.load('wave_height', 3, null);       /* …and is overtaken while it is still waiting */
    const [o, w] = await Promise.all([overtaken, wanted]);
    await running;
    assert.ok(w && w.data && w.data.values, 'the hour the reader stopped on must be read');
    assert.equal(calls.ensureData, 3,
      'the overtaken hour spent its ranged requests and its decode — dragging the slider across '
      + 'twenty steps must still cost one read per hour the reader actually stopped on (#R299)');
    assert.ok(o && o.data && o.data.values,
      'an overtaken read answered falsy, which js/weather.js reads as 「fetch failed」 (#R298)');
    assert.notEqual(o.file, w.file,
      '…it answers with a frame it has, never with the newer hour it did not read');
  });

  test('R299 ⑥ the wide read is a staircase gated on stillness, and it still gets there', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（js/weather.js の地図の静止待ち）。 */
    const s = read('js/weather.js');
    assert.ok(/STILL_MS\s*=\s*\d+/.test(s), 'a rung waits for the map and the axis to be still');
    assert.ok(/RUNG_MAX/.test(s), 'and a rung is bounded by SAMPLES, not by width');
    assert.ok(/function runWiden\(/.test(s), 'the staircase is one function');
    assert.ok(/wideGen/.test(s), 'a time change restarts it rather than letting the old target land');
    /* ⚠ (#R297 ⑤) the wide read is NOT skipped — a reader who stays put still ends at band() */
    const w = s.slice(s.indexOf('function runWiden('), s.indexOf('function runWiden(') + 1400);
    assert.ok(/band\(\)/.test(w), 'the last rung is the band the view actually needs');
  });

  test('R299 ⑥ the coarse ECMWF domain is NOT used — its axis is a different axis', () => {
    /* 綴りのまま: 主張が「2 つ目が無い／1 か所だけ」という構造の不在で、実行した答えからは不在を観測できない（使わない domain の名前が無いこと）。 */
    const s = read('js/wx-ecmwf.js');
    const code = noComments(s);
    const mdl = noComments(read('js/wx-models.js'));
    assert.ok(!/ecmwf_ifs025/.test(code),
      'ecmwf_ifs025 is 3-hourly against ecmwf_ifs’s hourly: using it would move the reader’s hour');
    /* ⚠ (#R356) THE SAME REQUIREMENT, ASKED WHERE THE ANSWER NOW LIVES. `var DOMAIN = 'ecmwf_ifs'`
       was the whole model identity; it is `cfg.id` now, and the row that supplies it is in
       js/wx-models.js. Both halves still have to hold, and the second one is STRONGER than it was:
       it is no longer 「this file mentions only one domain」 but 「the coarse domain is not one of the
       models the reader can pick at all」 — which is the thing #R299 actually measured. */
    assert.ok(!/ecmwf_ifs025/.test(mdl), 'and it is not one of the models the registry offers either');
    assert.match(code, /var DOMAIN = cfg\.id;/, 'the instance takes its domain from exactly one place');
    assert.match(mdl, /id: 'ecmwf_ifs',/, 'and the default model is the hourly 9 km field');
    assert.match(mdl, /return MODELS\[0\]\.id;/, '…which is the first row, i.e. the one a session opens on');
  });

  ISOLATED.built();
});
