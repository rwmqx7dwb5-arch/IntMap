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
import { bootEngine } from './engine.js';

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

/* ══ ⚠⚠⚠ WHATEVER THE LAST TEST LEFT OVER THE MAP, FOUND BY WHAT IT DOES, NOT BY WHAT IT IS CALLED ══
   MEASURED on the nightly run 36348262163, twice, in two shapes of one defect:
     · tests/r322.spec.js ② presses #btn-correlate and ends with the Correlation overlay up
       (`position:fixed; inset:0; z-index:9998`). The next test on that worker,
       tests/r388-detail.spec.js ①, found a railway line through the renderer, clicked it — and the
       click landed on the overlay; `#rail-detail` never came. The failure screenshot is the scatter
       plot, not the map.
     · tests/r170.spec.js 「Measure ▸ 3-D volume」 read `points: 0`: the right-hand Layers sidebar was
       still open from an earlier test on the worker, the right-anchored tool panel slides left to
       make room for it (js/map-ui.js, #R160), and all four clicks landed on the tool panel. Reproduced
       locally by opening the sidebar in one test and running those clicks in the next: 0 of 4.
   The reset above closes the things it knows the name of (`_close*Menu/Popup`, #tool-panel), and
   neither of these has a name there. ⚠ ADDING THE TWO NAMES WOULD FIX TWO REPORTS AND NOT THE NEXT
   ONE (.agents/rules/no-ad-hoc-hardcoding.md): the app has dozens of panels, and whichever is added
   next would leak the same way. So the question is asked of the page, as a fact:
     「which element now receives a click that, at boot, went to the map or its own chrome?」
   `elementFromPoint` over a grid of the viewport (the #R485 lesson: "visible" is not "on top"); each
   hit is lifted to its outermost ancestor that does not contain the map canvas, so the answer is
   one element per floating thing, not one per pixel of it. What was on screen at the first reset —
   i.e. straight after the boot — is the booted app's own furniture (search pill, view controls,
   sidebar) and is left alone; anything else is something a test opened.
   It is closed through ITS OWN ×, the control a person would press, exactly as the #tool-panel line
   above does — never by hiding it from outside, which would leave the module believing it is open.
   ⚠ THE ONE CONSTANT, AND WHERE IT COMES FROM. `CLOSE_GLYPH` is the app's close control. Measured on
   2026-09-28 over js/ and index.html: 133 controls whose whole label is «×», and 0 using ✕, ✖, ⨯ or
   `&times;`. tests/nightly-state-leaks-checks.test.mjs re-measures that on every run, so the day the
   app adopts a second glyph this stops being true loudly instead of silently missing panels.
   Something new over the map that has no «×» is reported once per worker (it is either a leak this
   cannot close or furniture that arrived after the boot) and then remembered, so the log names it
   once instead of before every test. */
const CLOSE_GLYPH = '×';
const bootCover = new WeakMap();   /* page → JSHandle of the Set of roots on screen at boot */

async function closeLeftOverlays(page) {
  let base = bootCover.get(page);
  const first = !base;
  if (first) {
    base = await page.evaluateHandle(() => new Set()).catch(() => null);
    if (!base) return;
    bootCover.set(page, base);
  }
  const res = await page.evaluate(([seen, glyph, first]) => {
    const canvas = (() => { try { return window.IntMapGeoEngine.render.canvas(); } catch (_) { return null; } })()
      || document.querySelector('canvas');
    if (!canvas) return { closed: [], stuck: [] };
    const roots = () => {
      const out = new Set();
      const NX = 24, NY = 14;   /* ~53 × 51 px cells at 1280 × 720: finer than any panel, 336 hit tests */
      for (let i = 0; i < NX; i++) for (let j = 0; j < NY; j++) {
        const h = document.elementFromPoint((i + 0.5) * innerWidth / NX, (j + 0.5) * innerHeight / NY);
        if (!h || h === canvas || h.contains(canvas)) continue;
        let r = h;
        while (r.parentElement && !r.parentElement.contains(canvas)) r = r.parentElement;
        out.add(r);
      }
      return out;
    };
    const name = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '')
      + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
    /* ⚠ THE BOOT'S FURNITURE IS EVERYTHING ON SCREEN, NOT ONLY WHAT THE GRID HAPPENED TO HIT. The
       first version recorded the grid's hits, and the sidebar's ‹ button — 22 px wide, and it moves
       with the sidebar — was then reported as a leak the first time a grid point landed on it. A root
       is by construction a child of one of the canvas's ancestors that does not contain the canvas,
       so the booted set can be listed exactly: those children that are displayed, not
       `visibility:hidden`, and inside the viewport. A panel parked off-screen or hidden at boot (the
       right Layers sidebar is both) is therefore NOT furniture, and is closed when a test leaves it
       open. */
    if (first) {
      for (let a = canvas.parentElement; a; a = a.parentElement) {
        for (const c of a.children) {
          if (c.contains(canvas)) continue;
          const b = c.getBoundingClientRect();
          if (!c.getClientRects().length || getComputedStyle(c).visibility === 'hidden') continue;
          if (b.right <= 0 || b.bottom <= 0 || b.left >= innerWidth || b.top >= innerHeight) continue;
          seen.add(c);
        }
      }
      return { closed: [], stuck: [] };
    }
    /* ⚠ PASSES, NOT ONE SWEEP. Measured with this very mechanism: tests/r170 「every Companies
       figure…」 ends with the market card (#co-detail-ov, a full-viewport scrim) over the company
       atlas panel (#co-popup). The first grid sees only the scrim; the panel under it is exposed only
       once the scrim is closed — and a single sweep reported it as «its × did not close it» without
       ever having pressed it, leaving it open (with its facilities fitted on the map) for the next
       test. Each pass presses only roots never pressed before, so the loop ends on the first pass
       that finds nothing new; the ceiling (an estimate, far above the 2 passes measured) only stops
       a panel that rebuilds itself as a NEW element every time it is closed. */
    const closed = [], stuck = [], tried = new Set();
    for (let pass = 0; pass < 16; pass++) {
      const fresh = [...roots()].filter((r) => !seen.has(r) && !tried.has(r));
      if (!fresh.length) break;
      for (const r of fresh) {
        tried.add(r);
        const x = [r, ...r.querySelectorAll('button,[role="button"]')].find((b) => b.matches('button,[role="button"]')
          && (b.textContent || '').trim() === glyph && b.getClientRects().length > 0);
        if (x) { try { x.click(); } catch (_) { } closed.push(name(r)); } else { seen.add(r); stuck.push(name(r)); }
      }
    }
    /* and ask again: a × that was pressed and did not take its panel away is a fact the log should carry */
    for (const r of roots()) if (tried.has(r) && !seen.has(r)) { seen.add(r); stuck.push(name(r) + ' (its × did not close it)'); }
    return { closed, stuck };
  }, [base, CLOSE_GLYPH, first]).catch(() => ({ closed: [], stuck: [] }));
  if (res.stuck.length) console.warn('[resetPage] still over the map after the reset, and not closeable by its own ×: ' + res.stuck.join(', '));
  return res;
}

/**
 * Put back the view a fresh boot would have, without paying for a boot.
 *
 * ⚠ THROUGH THE APP'S OWN DOORS, not by poking the DOM. Clicking the buttons or setting the flags
 * here would make this file a second, silently-diverging implementation of what "flat map, no tool"
 * means — the mistake #R136 traced a whole round of mis-painted eras to. Where a door is missing
 * the reset does less rather than something different.
 */
/* ══ (suite-time-room) …OR THE VIEW THIS PAGE'S OWN BOOT HAD, READ AT THE FIRST RESET ══════════════
   The named view above ("flat projection, the camera over Tokyo at z5") is a MapLibre-session view.
   On the second renderer it is not neutral: `view.proj.flat` MORPHS Cesium into Columbus view, and
   measured on a shared Cesium page that alone turned seven passing claims red (a bearing round-trip off
   by 176°, fitBounds leaving 9.5 % of its box off screen, a pan of 0.88° where the contract says > 1°).
   Every one of those tests was written against the view the Cesium BOOT shows — the 3-D globe at the
   app's clock-dependent start camera — so a page whose `appView` is 'boot' (the default with
   `appEngine`) is reset to exactly that:
   the projection the app's own switch reported and the engine camera, both read straight after the
   boot (the first reset runs before the first test), and put back through the same two doors a person
   uses (the registered projection command, the engine's camera). Not hard-coded: the start camera
   moves with the clock (tests/r180-cesium.spec.js ③), so it can only be recorded, never written down.
   ⚠ The same is true on MapLibre, and measured: the boot is the GLOBE, the named view is flat, and a
   spec written against a fresh boot read a 2,849 px sky-projection error and a zoom floor of 1.2
   instead of 0 on the named view. So a spec moved onto the shared page asks for 'boot'; the
   sixty-eight specs written for this fixture keep the named view they were written against. */
const bootViews = new WeakMap();   /* page → { proj, cam } recorded at the first reset */

export async function resetPage(page, opts = {}) {
  if (!page) return;
  /* first, so that the camera jump at the end of the next step is the LAST thing to move the camera:
     closing a panel can move it (see the market card / company atlas note in closeLeftOverlays) */
  await closeLeftOverlays(page);
  let boot = null;
  if (opts.bootView) {
    boot = bootViews.get(page);
    if (!boot) {
      boot = await page.evaluate(() => {
        const G = window.IntMapGeoEngine, c = G.camera.get();
        const globe = document.getElementById('btn-view-globe');
        return { proj: globe && globe.classList.contains('active') ? 'globe' : 'flat',
          cam: { center: [c.center.lng, c.center.lat], zoom: c.zoom, bearing: c.bearing, pitch: c.pitch } };
      }).catch(() => null);
      if (boot) bootViews.set(page, boot);
    }
  }
  await page.evaluate((boot) => {
    try { window.IntMapFlightSim && window.IntMapFlightSim.stop && window.IntMapFlightSim.stop(); } catch (_) { }
    try { window.IntMapTilt && window.IntMapTilt.set(false); } catch (_) { }
    /* the two registered commands that name the app's start-up view: the flat projection and the
       News sidebar tab. ⚠ The tab is in here because leaving it elsewhere HID THE MAP SEARCH —
       measured: the last test of tests/r171.spec.js timed out clicking `#ms-btn` with the sidebar
       parked on Countries, which the failure snapshot showed and no amount of re-reading the test
       would have. */
    try { window.IntMapOS && window.IntMapOS.exec(boot ? 'view.proj.' + boot.proj : 'view.proj.flat'); } catch (_) { }
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
    if (!boot) { try { window.__imap.jumpTo({ center: [139.767, 35.681], zoom: 5, pitch: 0, bearing: 0, elevation: 0 }); } catch (_) { } }
  }, boot).catch(() => { });
  if (boot) {
    /* a projection change on Cesium is an animated morph (0.6 s); the camera is only put back once the
       scene has arrived in the mode it was asked for, or the morph would carry the camera with it */
    await page.waitForFunction((want) => { try { const G = window.IntMapGeoEngine;
      const t = (G.camera.getProjection() || {}).type; const g = G.camera.globeness ? G.camera.globeness() : 1;
      return (want === 'globe' ? t === 'globe' : t !== 'globe') && (g === 0 || g === 1); } catch (_) { return true; } },
    boot.proj, { timeout: 10_000 }).catch(() => { });
    /* on MapLibre through the same door, and with the same `elevation: 0`, as the named view above: a
       look-at target left in the air by an unlimited-tilt test survives a jumpTo that does not name it */
    await page.evaluate((cam) => { try { const G = window.IntMapGeoEngine;
      if (G.id() === 'maplibre') window.__imap.jumpTo({ ...cam, elevation: 0 }); else G.camera.jumpTo(cam); } catch (_) { } }, boot.cam).catch(() => { });
  }
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
 *
 * ── (suite-time-room) TWO WORKER-SCOPED OPTIONS, FOR THE FILES THAT BOOT DIFFERENTLY ─────────
 * Fourteen-odd spec files still booted once per test because the shared page could only be the
 * default boot of `/index.html` on MapLibre. Two things they ask for are properties of the BOOT,
 * not of a test, so they are worker options here (`test.use({ appUrl })` / `test.use({ appEngine })`
 * at the top of a file). ⚠ These are not the per-test context options the header above warns about:
 * a worker-scoped option is known BEFORE the worker's page is built, so Playwright starts a worker
 * for each distinct value and the page really is booted with it — nothing is silently dropped.
 *   appUrl     the URL the worker's page (and `freshPage()`) boots, e.g. '/?rafshim=1' for a spec
 *              whose subject is driven by animation frames in a hidden page (index.html #R73)
 *   appEngine  'cesium' boots the second renderer in ONE load (tests/helpers/engine.js), and waits
 *              until IntMapGeoEngine.id() IS that engine — a failed seed times out, never runs on
 *              the wrong renderer
 *   appView    what reset() puts back before each test: 'named' (the flat map over Tokyo — what the
 *              sixty-eight specs written for this fixture expect) or 'boot' (the projection and camera
 *              THIS page's boot showed, recorded at the first reset — see resetPage). A spec that was
 *              written against a fresh boot and is moved onto the shared page asks for 'boot', so its
 *              tests still start from the view they were written against. Default: 'boot' with
 *              appEngine, 'named' without.
 */
export const test = base.extend({
  appUrl: [null, { scope: 'worker', option: true }],   /* null = each boot's own default: bootPage '/index.html', bootEngine '/?rafshim=1' */
  appEngine: [null, { scope: 'worker', option: true }],
  appView: [null, { scope: 'worker', option: true }],   /* 'boot' | 'named'; null = 'boot' on the second renderer, 'named' otherwise */
  app: [async ({ browser, appUrl, appEngine, appView }, use) => {
    const bootView = appView ? appView === 'boot' : !!appEngine;
    const page = await browser.newPage();
    const spares = [];
    const boot = (p, opts) => (appEngine
      ? bootEngine(p, appEngine, { url: (opts && opts.url) || appUrl || undefined, timeout: (opts && opts.timeout) || 120_000 })
      : bootPage(p, { ...(appUrl ? { url: appUrl } : {}), ...(opts || {}) }));
    await boot(page, {});
    await use({
      page,
      engine: appEngine || 'maplibre',
      reset: () => resetPage(page, { bootView }),
      async freshPage(opts) {
        const p = await browser.newPage();
        spares.push(p);
        await boot(p, opts || {});
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

/* ============================================================================
 *  (#R209) ASK FOR THE ON-DEMAND MODULES
 * ----------------------------------------------------------------------------
 *  Eight feature modules are no longer in the boot bundle (js/lazy-modules.js). A spec written
 *  before that — and there are twenty-two of them — reaches for `window.IntMapFlightSim` or
 *  `window.IntMapSeismic` straight after boot and finds nothing.
 *
 *  ⚠ THE FIX IS TO ASK, NOT TO WAIT. The app's own entry points await `IntMapLazy.need(…)` before
 *  they touch these globals; a spec that drives the same feature is doing what a click does, so it
 *  makes the same call. Adding a sleep, or re-listing the global as a boot signal, would only make
 *  the test pass while measuring a different application.
 *
 *  Call it once after the spec's own boot barrier. `names()` is read out of the loader, so a module
 *  added to or removed from the split needs no edit here.
 *  @param {import('@playwright/test').Page} page
 */
export async function loadLazyModules(page) {
  await page.evaluate(async () => {
    if (!window.IntMapLazy) throw new Error('window.IntMapLazy is missing — js/lazy-modules.js did not run');
    await Promise.all(window.IntMapLazy.names().map((n) => window.IntMapLazy.need(n)));
    const failed = (window.__imLazyCheck || {}).failed || [];
    if (failed.length) throw new Error('on-demand module(s) failed to load: ' + failed.join('; '));
  });
}
