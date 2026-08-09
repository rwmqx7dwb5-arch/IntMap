/* ============================================================================
 *  IntMap · ONE BOOTED APP PER WORKER, NOT ONE PER TEST  (#R208)
 * ----------------------------------------------------------------------------
 *  「テスト時間。まだ長い。…『安く走らせる』はもう6ラウンドやって効いていない。
 *    中身（重複した表明・固定sleep・1ファイル1起動）を減らすこと。」
 *
 *  MEASURED BEFORE WRITING THIS, over every spec file on disk:
 *
 *    · 4,756 s of the suite's 5,219 s — 91 % — is in 30 files that call `page.goto` from a
 *      per-test `page` fixture, i.e. that boot the whole application ONCE PER TEST. Across those
 *      files that is about 185 boots to ask about 185 things.
 *    · a boot on the development machine is 2.4 s (measured, four reps, fresh context each time);
 *      on a CI runner with no GPU #R186 measured 9.2 s, and a Cesium boot is longer again.
 *
 *  #R206 made exactly this change to ONE file (tests/r192.spec.js: four boots → one, 83.6 s →
 *  56.2 s) and it was left there. This is that change as a shared mechanism.
 *
 *  ── WHY A SHARED PAGE AND NOT A SHARED CONTEXT ──────────────────────────────────────────────
 *  A fresh `page` inside one reused BrowserContext was measured too, because it would have kept
 *  per-test isolation and still warmed the HTTP cache. It is WORSE, not better:
 *
 *      fresh context each time   2269  3199  2164  2167 ms
 *      one context, new page     1625  4135  4207  4094 ms      ← the WebGL contexts pile up
 *      one page, reused           100   406   112 ms
 *
 *  The second row is the renderer: Chromium caps live WebGL contexts and the previous page's is not
 *  released promptly, so each new page in the same context pays to evict one. Only sharing the PAGE
 *  is cheap, so that is what this does.
 *
 *  ── ⚠ AND IT IS SCOPED TO THE WORKER, NOT TO THE FILE ───────────────────────────────────────
 *  The obvious shape — one page for the file, `test.describe.configure({ mode: 'serial' })` — was
 *  written first and MEASURED, and it is the wrong trade: tests/r171.spec.js went from fourteen
 *  boots to one, and from 2.6 min of wall clock (with r170 alongside it) to 4.4 min, because
 *  serialising a file stops its own tests from filling the second worker. Cheaper in CPU, dearer in
 *  the number anybody waits on.
 *
 *  A fixture with `scope: 'worker'` gives both: it is built once per worker process and handed to
 *  every test that runs there, so a 14-test file costs TWO boots at two workers instead of fourteen
 *  and the schedule is otherwise untouched.
 *
 *      import { test, expect } from './helpers/app.js';
 *      test('…', async ({ app }) => { const page = app.page; … });
 *
 *  ── WHAT THIS COSTS, STATED PLAINLY ─────────────────────────────────────────────────────────
 *  Tests sharing a page share its state, and across workers they do not share an order. So
 *  `reset()` runs before every test and restores a NAMED state (flat projection, default camera, no
 *  tool, no open menu) rather than trying to undo whatever the last test did — an "undo" would
 *  depend on knowing which test that was, which is exactly what a worker pool does not promise.
 *  It does not claim to undo everything: a layer switched on stays on.
 *
 *  ⚠ A SPEC WHOSE SUBJECT IS THE BOOT MUST NOT USE THIS — the launch screen, restore-from-storage
 *  and engine-choice specs are asking about start-up itself, and a page that is already up cannot
 *  answer them. `app.freshPage()` is there for the one test in an otherwise-shareable file that
 *  needs an untouched application, and it pays for its own boot. Two tests took it this round:
 *  「fresh desktop profile…」 (r170) and 「…off by default」 (r171). Both say so in their own titles;
 *  making them pass by turning the thing off first would have kept them green and deleted them.
 *
 *  ⚠ AND A SPEC THAT USES `test.use({ … })` CANNOT USE THIS AT ALL. Those options configure the
 *  PER-TEST context, and a worker-scoped page is built from `browser.newPage()` before any of them
 *  are known — so the page silently ignores them. tests/r179-imagery.spec.js is the worked example
 *  and was reverted for it: its three describes are `deviceScaleFactor: 2 / 1 / 2`, i.e. the whole
 *  file is ABOUT the value a shared page would have quietly dropped. It would not have failed
 *  loudly; it would have measured the 1× path three times and passed twice.
 * ==========================================================================*/
import { test as base, expect as baseExpect } from '@playwright/test';

/** The standard wait for "the app is up and can draw". */
export async function bootPage(page, opts = {}) {
  const url = opts.url || '/index.html';
  const timeout = opts.timeout || 60000;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__imap, null, { timeout });
  /* ⚠ NOT a fixed sleep afterwards. `isStyleLoaded` is the renderer's own answer to "are the layers
     there", and #R170 is the round that established `canDraw()` as the one to ask when it exists —
     asking both, and treating a missing `canDraw` as satisfied, is what lets this serve the specs
     written on either side of that change. */
  await page.waitForFunction(() => {
    if (!window.__imap.isStyleLoaded()) return false;
    try { return !window.IntMapGeoEngine.canDraw || window.IntMapGeoEngine.canDraw(); } catch (_) { return true; }
  }, null, { timeout }).catch(() => { });
  if (opts.settle) await page.waitForTimeout(opts.settle);
  return page;
}

/**
 * Put back the view a fresh boot would have, without paying for a boot.
 *
 * ⚠ THROUGH THE APP'S OWN DOORS, not by poking the DOM. Clicking the buttons or setting the flags
 * here would make this file a second, silently-diverging implementation of what "flat map, no tool"
 * means — the mistake #R136 traced a whole round of mis-painted eras to. Where a door is missing
 * the reset does less rather than something different.
 */
export async function resetPage(page) {
  if (!page) return;
  await page.evaluate(() => {
    try { window.IntMapFlightSim && window.IntMapFlightSim.stop && window.IntMapFlightSim.stop(); } catch (_) { }
    try { window.IntMapTilt && window.IntMapTilt.set(false); } catch (_) { }
    /* the two registered commands that name the app's start-up view: the flat projection and the
       News sidebar tab. ⚠ The tab is in here because leaving it elsewhere HID THE MAP SEARCH —
       measured: the last test of tests/r171.spec.js timed out clicking `#ms-btn` with the sidebar
       parked on Countries, which the failure snapshot showed and no amount of re-reading the test
       would have. */
    try { window.IntMapOS && window.IntMapOS.exec('view.proj.flat'); } catch (_) { }
    try { window.IntMapOS && window.IntMapOS.exec('tab.news'); } catch (_) { }
    /* ⚠ EVERY `window._close…()` THE APP PUBLISHES, FOUND BY NAME RATHER THAN LISTED.
       js/app-body.js exposes `_closeMeasureMenu`, `_closeShareMenu`, `_closePinPopup` … as the
       canonical way to dismiss each dropdown (its own click-away handler calls the same ones). A
       hand-written list here would be a list of the ones that existed the day it was written.
       MEASURED: the first spec converted this round failed because test ④ left the Measure menu
       open and test ⑤'s `click('#btn-measure-menu')` then CLOSED it instead of opening it. */
    try {
      for (const k of Object.keys(window)) {
        if (/^_close[A-Za-z]*(Menu|Popup)$/.test(k) && typeof window[k] === 'function') {
          try { window[k](); } catch (_) { }
        }
      }
    } catch (_) { }
    /* and put the pointer tool back to nothing — a test that picked Measure/Draw/Volume leaves the
       map collecting points AND leaves #tool-panel over the toolbar, which is what made the next
       test's click land on the panel instead of the button it named.
       ⚠ THE PANEL'S OWN ✕, which js/tool-panel.js wires to `HOST.exitTool`. Two other doors were
       tried first and both were wrong:
         · `IM_HOST.exitTool()` — `IM_HOST` is a module-local const in js/app-body.js and never
           reaches `window`, so the call was the silent no-op #R205 is about. It cost two full runs
           of tests/r171.spec.js to see, because nothing failed AT the call;
         · publishing a new `window._exitTool` — js/app-body.js is under a shrink-only ceiling
           (`R200 ⑤`) and js/tool-panel.js is one of the six DECLARATION-ONLY factories (`R168 #4`),
           so neither file may gain a running statement for a test's convenience.
       The button is the affordance a person uses, it already exists, and when no tool is open the
       selector simply finds nothing. ⚠ Atlas still cannot close a tool — see DEV-NOTES §7. */
    try { const x = document.querySelector('#tool-panel .tp-close'); if (x) x.click(); } catch (_) { }
    try { window.__imap.jumpTo({ center: [139.767, 35.681], zoom: 5, pitch: 0, bearing: 0, elevation: 0 }); } catch (_) { }
  }).catch(() => { });
  /* one settled frame, so a test does not read the camera mid-transition */
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
    .catch(() => { });
}

/**
 * The `test` a converted spec imports: same Playwright `test`, plus a worker-scoped `app`.
 *
 *   app.page       the booted page, shared by every test on this worker
 *   app.reset()    restore the named view (also run automatically before each test)
 *   app.freshPage() an untouched application, for a test whose subject is the boot
 */
export const test = base.extend({
  app: [async ({ browser }, use) => {
    const page = await browser.newPage();
    const spares = [];
    await bootPage(page, {});
    await use({
      page,
      reset: () => resetPage(page),
      async freshPage(opts) {
        const p = await browser.newPage();
        spares.push(p);
        await bootPage(p, opts || {});
        return p;
      },
    });
    for (const p of spares.splice(0)) await p.close().catch(() => { });
    await page.close().catch(() => { });
  }, { scope: 'worker' }],

  /* every test starts from the named view, whichever test this worker ran before it */
  autoReset: [async ({ app }, use) => { await app.reset(); await use(); }, { auto: true }],
});

export const expect = baseExpect;
