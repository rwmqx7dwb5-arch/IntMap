/* ============================================================================
 *  R664 · The first switch-on of the first weather layer of a page
 * ----------------------------------------------------------------------------
 *  PRODUCTION, three times out of three: the wave row was switched on, a red toast said the
 *  forecast could not be loaded and the checkbox put itself back. `IntMapWaves.state().failure`
 *  answered `{why:'no_field', detail:'wave_height'}` and the console carried
 *  `[waves] not drawn: no_field — wave_height`. The SECOND click always worked. Switching on ANY
 *  other weather layer first made the first click work too — three times out of three. And the same
 *  failure happened with no click at all, 2,456 ms after the page started, on the boot path that
 *  re-applies the saved layer set, so the reader's own `l=` parameter silently lost `dl-waves`.
 *
 *  ── ⚠⚠⚠ WHAT IT ACTUALLY WAS: A READ CANCELLING ITSELF ────────────────────────────────────────
 *  REPRODUCED against js/wx-ecmwf.js itself, with the browser and the Open-Meteo SDK stubbed and
 *  nothing else — the timings below are this file's ①, printed while it was still failing:
 *
 *      0 ms    load(wave_height)                the switch-on; `ready()` starts the 340 kB SDK
 *      300 ms  load(wave_height)                A SECOND CALL FOR THE SAME READ
 *      609 ms  both answer NULL                 3 ms after the SDK lands, no request sent
 *
 *  `load()` took its ticket IN THE CALL (`var mine = ++seq`) but makes its join LATER, in the
 *  `ready()` continuation, once the file name exists (`reading[skey]`). So the second call had
 *  already superseded the read it was about to join: the job woke, found `seq !== mine`, took the
 *  「the reader has moved on」 exit — whose fallback is 「any frame of this variable」 — and on a model
 *  nothing has ever been read from there is none. The joiner received that same null.
 *
 *  Both halves of 「only the first one」 follow from that. The window is `ready()`: ~600 ms with the
 *  SDK cold, one metadata fetch once any other weather layer has pulled the bundle in (`sdk`/`sdkP`
 *  are per page, not per model). And the fallback is only empty while `frames` is empty, which is
 *  true exactly once per model.
 *
 *  #R622 fixed a DIFFERENT instance of this rule — `Promise.all([height, period])` handing the
 *  height an already-stale ticket — and this one survived it, because the second call comes from
 *  somewhere else: a second `paint()`. js/waves.js raises one from `styledata`, from `moveend`, and
 *  from the engine's own `time` event, and that last one is itself a cold-instance effect —
 *  `setIndex` guards on `i === idx && idxSet`, so the first live broadcast of window.IntMapTime
 *  after the axis lands emits `index` + `time` for an index that never moved (measured in ⑤).
 *  ⇒ the fix is in the engine, where all three arrive: the ticket is issued where the read is
 *  IDENTIFIED, and a caller that joins a read RENEWS its ticket instead of taking a newer one.
 *
 *  ── ⚠ WHAT IS MEASURED HERE, AND AGAINST WHAT ────────────────────────────────────────────────
 *  ①②③ run THE SHIPPED js/wx-ecmwf.js — not a stub of its rule. #R505's lesson: a check that reads
 *  source cannot tell whether the source can be evaluated in the order it is written, and #R552's:
 *  a fixture more capable than the thing that ships proves nothing about the thing that ships. So
 *  the supersession rule under test is the real one, and ② and ③ exist so the fix cannot be 「stop
 *  superseding」 — the reads that MUST still be cancelled are still cancelled, and are measured by
 *  whether they spent a decode rather than by what they returned.
 *  ④ runs the shipped js/waves.js ON TOP of that engine, cold, for each of the three real triggers.
 * ========================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coldWxModel, until, settled } from './helpers/wx-ecmwf-page.mjs';

/* ── the page these cases run on ───────────────────────────────────────────────────────────
   tests/helpers/wx-ecmwf-page.mjs: a browser and an Open-Meteo SDK, and nothing else stubbed — the
   fixture that reproduced the production failure, with the latencies production has, compressed.
   It is a MODULE and not a block in this file because five older checks measure the same rule on
   the same page (r276 ⑱, r287 ⑧, r288 ⑦, r299 ⑥, r310 ⑤⑥), and six copies of one judgement is the
   shape .agents/rules/no-ad-hoc-hardcoding.md §2-3 forbids. `coldWxModel()` gives each case its
   OWN page and its OWN import of js/wx-ecmwf.js, so 「cold」 means cold: the SDK, the protocol
   registration, the metadata, the frame list and the ticket counter are all per case. */

test('① a second call for the SAME read joins it — it does not cancel it (the production defect)', async () => {
  const { page, ENG } = await coldWxModel({ sdkMs: 200 });
  const M = ENG.model('ecmwf_wam025');

  /* the switch-on. `ready()` is now downloading the SDK, which is the whole of the window. */
  const first = M.load('wave_height', null, null);
  /* ⚠ THE WINDOW IS ENTERED BY OBSERVING IT, NOT BY TIMING IT: the request for the SDK going out is
     the moment `ready()` starts waiting, and the SDK cannot arrive before it was asked for — so the
     assertion below is inside the window however badly the event loop is behaving (the header of
     tests/helpers/wx-ecmwf-page.mjs has the measurement that made this necessary). */
  await until(() => page.calls.sdkScript === 1, 'the SDK request to go out — that IS the window',
    { observe: () => page.calls });
  assert.equal(page.calls.ensureData, 0, 'the first read has not reached the data yet — the window is real');
  /* the second paint: js/waves.js raises one from `styledata`, from `moveend` and from the
     engine's own `time` event, and every one of them asks for exactly this again */
  const second = M.load('wave_height', null, null);

  const [a, b] = await Promise.all([first, second]);
  const why = ' — a read for the hour on screen answered null on a cold model, which js/waves.js '
    + 'reports as `no_field` and js/weather.js as an unavailable field';
  assert.ok(a && a.data && a.data.values && a.data.values.length, 'the FIRST caller got no field' + why);
  assert.ok(b && b.data && b.data.values && b.data.values.length, 'the SECOND caller got no field' + why);
  assert.equal(a, b, 'both callers must be answered by ONE read, not by two');
  assert.equal(page.calls.ensureData, 1, 'asking again must join the read in flight, not open a second one');
  /* …and the frame is INSTALLED, or `sampler()` answers null and the readout prints nothing */
  assert.equal(M._state().frames, 1, 'the frame the reader is looking at was not kept');
  assert.equal(M._state().variable, 'wave_height', '`held` must name the frame that just landed');
});

test('② a read for a DIFFERENT hour still cancels the older one before it spends a decode (#R299)', async () => {
  const { page, ENG } = await coldWxModel({ sdkMs: 200 });
  const M = ENG.model('ecmwf_wam025');
  await M.meta();                       /* the axis, so both hours have file names */

  const stale = M.load('wave_height', 1, null);
  await settled();                      /* the older call has got as far as it can — in promise turns,
                                           not milliseconds: both are inside `ready()`, waiting on the
                                           same SDK, and what decides this case is the ORDER */
  const wanted = M.load('wave_height', 2, null);
  const [s, w] = await Promise.all([stale, wanted]);

  assert.ok(w && w.data && w.data.values, 'the hour the reader stopped on must be read');
  assert.equal(page.calls.ensureData, 1,
    'the superseded hour must not spend its turn in the queue, its requests or its decode — '
    + 'dragging the slider across twenty steps must still cost one read (#R299)');
  assert.equal(M._state().frames, 1, 'only the hour that is current may be kept');
  assert.ok(!s || s.file === w.file, 'a superseded read may answer with a frame, never with a NEWER hour it did not read');
});

test('③ release() still supersedes a read in flight', async () => {
  const { page, ENG } = await coldWxModel({ sdkMs: 120, readMs: 200 });
  const M = ENG.model('ecmwf_wam025');
  const p = M.load('wave_height', null, null);
  /* past `ready()`: the read is running and has a ticket — waited for, not timed */
  await until(() => page.calls.ensureData === 1, 'the read to reach the data', { observe: () => page.calls });
  assert.equal(page.calls.ensureData, 1, 'the read must be under way, or this proves nothing');
  M.release('wave_height');
  await p;
  assert.equal(M._state().frames, 0,
    'a deliberate drop must not have the read it cancelled put the frame back afterwards');
});

test('⑥ an hour READ AHEAD still takes no ticket, and a foreground joiner still gets its frame', async () => {
  /* #R310's rule, measured rather than spelled: an hour nobody has arrived at is newer than
     everything by construction, so it must neither take a ticket nor be cancelled by one — and
     `renew` must leave it alone, or joining it would hand it a ticket it is not allowed to hold. */
  const { page, ENG } = await coldWxModel({ sdkMs: 60, readMs: 250 });
  const M = ENG.model('ecmwf_wam025');
  await M.meta();

  const ahead = M.load('wave_height', 3, null, true, true);   /* bg + ahead — what `readAhead` passes */
  await until(() => page.calls.ensureData === 1, 'the ahead read to reach the data', { observe: () => page.calls });
  const wanted = M.load('wave_height', 1, null);              /* the reader asks for a DIFFERENT hour */
  const joined = M.load('wave_height', 3, null);              /* …and then steps onto the one read ahead */
  const [a, w, j] = await Promise.all([ahead, wanted, joined]);

  assert.ok(a && a.data && a.data.values, 'the ahead read was cancelled by a foreground read');
  assert.ok(w && w.data && w.data.values, 'the foreground read was cancelled by an ahead read');
  assert.equal(j, a, 'stepping onto the hour being read ahead must JOIN that read, not open a second');
  assert.equal(page.calls.ensureData, 2, 'two hours, two reads — the join must not add a third');
});

/* ── ④ the shipped layer on the shipped engine, cold, for each real trigger ──────────────────── */
async function mountWaves(opt) {
  const cold = await coldWxModel(opt);
  /* ⚠ the palette and the renderer publish onto `window` AT IMPORT, and a module is imported once
     per process — so they are re-evaluated against THIS page too, or the second case in this file
     would be running js/waves.js against the first case's globals. */
  await cold.load('js/waves-palette.js');
  await cold.load('js/waves-gl.js');
  await cold.load('js/waves.js');
  const toasts = [], warns = [];
  const prevWarn = console.warn;
  console.warn = (...a) => warns.push(a.join(' '));
  const HOST = { lang: 'en', unitMode: 'metric', satToast: (m) => toasts.push(m), t: () => 'close' };
  const api = cold.page.win.IntMapModules.waves(HOST);
  return Object.assign(cold, { api, toasts, warns, restore: () => { console.warn = prevWarn; } });
}

/* the three ways a second `paint()` actually happens in the app, named by what raises them */
const TRIGGERS = [
  ['the style changed under the layer (styledata)', (env) => env.page.fireMap('styledata')],
  ['the camera stopped (moveend)', (env) => env.page.fireMap('moveend')],
  ['the master clock broadcast (the engine re-emits `time` on a cold axis)', (env) => env.page.win.IntMapTime.broadcastLive()]
];

for (const [name, fire] of TRIGGERS) {
  test('④ the first switch-on survives a second paint — ' + name, async () => {
    const env = await mountWaves({ sdkMs: 200 });
    /* ⚠ WHAT THE TRIGGER IS FIRED AT IS OBSERVED, NOT TIMED — and the case then PROVES that what it
       fired at happened. The old `await delay(60)` was a guess that the first paint would be inside
       `ready()` by then; measured, the two facts that put it there are that the axis has landed (a
       clock broadcast on a model with no axis re-emits nothing at all — that is ⑤) and that the SDK
       has not, which is a 40 ms → 200 ms window on this page. A wait of 60 ms sits in the middle of
       it on an idle machine and outside it on a loaded one, and OUTSIDE IT THE CASE IS SILENTLY
       VACUOUS: measured, firing before the axis lands raises no second paint whatsoever and the
       assertions below all pass without a second paint ever having happened. So the loads the layer
       makes are counted, and the case fails if the trigger raised none. */
    const M = env.ENG.model('ecmwf_wam025');
    const loads = [];
    const shippedLoad = M.load;
    M.load = function () { loads.push(arguments[0]); return shippedLoad.apply(M, arguments); };
    try {
      const on = env.api.toggle(true);
      await until(() => M._state().meta, 'the axis to land while the first paint is inside `ready()` '
        + '— exactly where production failed', { observe: () => env.page.calls });
      fire(env);
      await on;
      /* …and the layer is given until it has SETTLED — either something is on the map or the layer
         has decided it failed — instead of a fixed 400 ms that a loaded machine can exhaust while
         the read is still perfectly healthy. Neither outcome is asserted here; the assertions below
         are unchanged and they are what decides which of the two it was. */
      await until(() => { const s = env.api.state(); return s.painted || s.failure; },
        'the layer to settle — nothing was painted and no failure was reported',
        { observe: () => env.api.state() });
      const st = env.api.state();
      assert.equal(st.failure, null, 'the layer reported ' + JSON.stringify(st.failure)
        + ' — this is the production symptom, and `no_field` means the read answered with nothing');
      assert.deepEqual(env.toasts, [], 'the reader was shown a failure toast');
      assert.equal(st.on, true, 'the row switched itself back off');
      assert.equal(st.painted, true, 'nothing was put on the map');
      assert.ok(st.displayed && st.displayed.validTime, 'the legend has no provenance to print');
      assert.deepEqual(env.warns.filter((w) => /not drawn/.test(w)), []);
      /* …and the trigger really did raise a second paint: one paint reads two variables, so a
         second one is the difference between two loads and four. Without this the case can pass by
         never having tested anything (measured above). */
      assert.ok(loads.length > 2,
        'the trigger raised no second paint at all, so nothing here was measured — loads: ' + loads.join(', '));
    } finally { env.restore(); }
  });
}

test('⑤ the trigger is real: on a COLD axis the first live clock broadcast re-emits `time`', async () => {
  /* Not a licence for it — ④ is what makes the layer survive it whichever of the three arrives.
     This is here so the next reader knows the boot path raises a second paint with nobody
     clicking anything, which is why the failure was also seen 2,456 ms after a page load. */
  const { page, ENG } = await coldWxModel({ sdkMs: 40 });
  const M = ENG.model('ecmwf_wam025');
  const seen = [];
  M.on((ev) => seen.push(ev.type));
  await M.meta();
  await until(() => seen.indexOf('meta') >= 0, 'the axis to be announced', { observe: () => seen });
  const before = M._state().idx;
  page.win.IntMapTime.broadcastLive();
  assert.equal(M._state().idx, before, 'the axis did not move…');
  assert.ok(seen.indexOf('time') >= 0, '…and yet a `time` event was emitted, which js/waves.js paints on');
});

/* ── ⑦ the page's own wait, because every arrangement above stands on it ──────────────────── */
test('⑦ the page waits for the fact, and a wait that runs out says what it was waiting for', async () => {
  /* This file and five others used to build their arrangements out of milliseconds — `await
     wxDelay(160)` for a fact measured to arrive at 109–125 ms — and a 130 ms stall of the event
     loop reached the assertion with the read not started, three times out of three. Everything
     rests on `until` now, so its two properties are asserted rather than assumed:
       · a condition that is ALREADY true is answered without yielding, so no fact can become true
         while the caller is not looking — a poll-first wait would have that lost wake-up;
       · a condition that never becomes true FAILS, with what it was waiting for and what was
         observed instead — an unbounded wait turns a real defect into a hang nobody can read. */
  let asked = 0;
  const t0 = Date.now();
  const v = await until(() => { asked++; return 'already'; }, 'a fact that is already true');
  assert.equal(v, 'already', 'the condition’s own value is what the caller gets back');
  assert.equal(asked, 1, 'the condition is evaluated BEFORE any waiting, exactly once');
  assert.ok(Date.now() - t0 < 50, '…and an arrangement that is already in place costs no wait at all');
  await assert.rejects(
    () => until(() => false, 'something that never happens', { timeoutMs: 30, observe: () => ({ ensureData: 0 }) }),
    /waited \d+ ms for something that never happens and it never happened — observed: \{"ensureData":0\}/,
    'a wait that runs out must name what it was waiting for and print what was true instead');
});
