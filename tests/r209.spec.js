/* ============================================================================
 *  #R209 — the browser half of runtime code-splitting
 * ----------------------------------------------------------------------------
 *  The source-level checks (tests/r209-checks.test.mjs) prove the deferred modules left the entry and
 *  that every door awaits the loader. Only a browser can prove the thing that actually matters:
 *
 *      the feature still exists.
 *
 *  This project's most expensive recurring defect is a feature that silently stops existing
 *  (#R162, #R200, #R205, #R208), and "the file is not downloaded yet" is a machine for producing
 *  it. So this asks for every one of them and reads the loader's own record — written by the load
 *  path itself, not by the test — plus the two facts the boot guard can no longer see: that none of
 *  them is present BEFORE it is asked for, and that all of them are present after.
 *
 *  ⚠ (#R304) …AND «EVERY ONE OF THEM» IS READ OUT OF js/lazy-modules.js. It was eight when this
 *  file was written and ten by #R291, and the file went on demanding eight — red on every nightly
 *  for a fortnight, because a count is a copy. See the note above test ① and tests/app-source.mjs.
 *
 *  Uses the worker-scoped shared page (#R208): one boot for the file.
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';
import { lazyModules } from './app-source.mjs';
import { readFileSync } from 'node:fs';

test.describe.configure({ mode: 'serial' });

/* ══ (#R304) THE LOADER'S OWN TABLES, NOT A COPY OF THEM ════════════════════════════════════════
   This file used to say 「and it knows all eight」 with the eight globals written out beside it. By
   the time anybody ran it the loader knew TEN — #R224 moved the Atlas kernel behind it, #R291 the
   directions panel — and the spec had been failing on the nightly for a fortnight for saying `8`.
   A count is a copy of a fact; the fact is in js/lazy-modules.js, so read it from there. Adding an
   eleventh module now changes what this file demands, in the same commit, without anybody editing
   it — and a module that is registered but publishes nothing still fails, which is the point. */
const LAZY = lazyModules(new URL('../', import.meta.url));
const GLOBALS = Object.fromEntries(LAZY.map((m) => [m.name, m.global]));
const FACTORIES = LAZY.filter((m) => m.factory).map((m) => m.name);

/* ══ ⚠⚠ (#R304) A PAGE NOTHING HAS ASKED ANYTHING OF — ① AND ② BOTH NEED ONE, AND IT IS NOT THE
   SHARED ONE. `app.page` is WORKER-scoped, and four other specs use the same fixture; one of them
   (tests/r170.spec.js) calls `loadLazyModules()` on it, so whenever the planner puts that file and
   this one on the same machine, every deferred module is already fetched before ① or ② look. ③ in
   THIS file does the same thing one test later, which is enough on its own if the serial group is
   ever retried — CI retries once (#R207). MEASURED as both: ② failed 「not there to begin with」
   with `IntMapTsunami` an object.
   ⚠ ONE boot for the two of them, not two: the file is serial, so ① makes it and ② inherits it.
   That is the cost #R208 was protecting when it put this file on the shared page in the first
   place — the answer is one extra boot, not a wrong precondition. */
let VIRGIN = null;
const untouched = async (app) => (VIRGIN || (VIRGIN = await app.freshPage()));

/* ══ ⚠⚠ (#R304) THE MENU ITEM IS FOUND BY WHAT IT DOES, NOT BY WHAT IT SAYS ═══════════════════
   ④ below clicked 「Seismic waves from here」 and the entry reads 「Earthquake simulator (set as
   epicentre)」 — a later round reworded it, and the click then waited out the whole test budget and
   reported 「Target page … has been closed」, which names the symptom and nothing about the loader.
   The claim is that the RIGHT-CLICK ENTRY WHICH ASKS THE LOADER FOR `seismic` opens the simulator,
   so the entry is identified by exactly that: the label of the js/tool-panel.js item whose action
   calls `IntMapLazy.need('seismic')`. Reword it and this follows; delete the `need` call and this
   stops finding an entry, which is the failure worth having. */
const CTX_SEISMIC = (() => {
  const src = readFileSync(new URL('../js/tool-panel.js', import.meta.url), 'utf8');
  const m = /label:`\$\{L\('([^']+)'[\s\S]{0,600}?need\('seismic'\)/.exec(src);
  return m ? m[1] : null;
})();

test('R209 ①: none of the deferred modules is in the boot bundle, and the boot guard is still clean', async ({ app }) => {
  /* ⚠ (#R304) ON A FRESH PAGE, WHICH IS WHAT THIS TEST'S SUBJECT REQUIRES. The shared page is the
     right default for the rest of the file, and it is the wrong one here: ③ below asks for EVERY
     module on that same page, so a retry of this serial group — CI runs one (#R207) — would re-run
     this test against a page where all ten had already been fetched. Measured: it did, and the
     `pending()` assertion below listed nine of them. `app.freshPage()` is what the fixture provides
     for exactly this case (see tests/helpers/app.js), and it costs one boot.
     ⚠ AND IT IS NOT `autoReset`-ed either, which matters: `resetPage()` drives the app through its
     own doors, and 「what has this page already been asked for」 is the question being put. */
  const page = await untouched(app);
  const s = await page.evaluate(({ globals, factories }) => ({
    check: window.__imModuleCheck,
    lazyCheck: window.__imLazyCheck,
    names: window.IntMapLazy ? window.IntMapLazy.names() : null,
    /* every global the loader promises, BEFORE anybody asks for it */
    present: Object.fromEntries(Object.entries(globals).map(([n, g]) => [n, typeof window[g]])),
    factories: factories.map((k) => [k, typeof (window.IntMapModules || {})[k]]),
    /* who has been ASKED for — the loader's own record of every fetch it started */
    pending: window.IntMapLazy ? window.IntMapLazy.pending() : [],
  }), { globals: GLOBALS, factories: FACTORIES });

  expect(s.names, 'the loader is published at boot — every door reaches it by name').toBeTruthy();
  expect(LAZY.length, 'js/lazy-modules.js declares at least one module').toBeGreaterThan(0);
  expect(s.names.slice().sort(), 'and it knows exactly the modules its own PUBLISHES table names')
    .toEqual(LAZY.map((m) => m.name).sort());
  for (const m of LAZY) expect(m.file, `${m.name} names the file it fetches`).toBeTruthy();

  /* ══ ⚠⚠ THE POINT OF THE ROUND, AS «NOT WITHOUT BEING ASKED» RATHER THAN «NOT YET» ═════════════
     If a deferred global were present with nothing pending, its file would be in the boot bundle
     after all and the split would be a comment; the sizes in DEV-NOTES would be measuring nothing.
     ⚠ (#R304) IT CANNOT BE «typeof === undefined» FULL STOP, AND FINDING OUT WHY IS WHAT THIS ROUND
     BOUGHT. The old version wrote out eight globals by hand and `atlasConsole` was not among them —
     so #R224's rule that a DESKTOP warms the Atlas kernel 1.2 s after the map goes idle (never on a
     phone, never on Save-Data, never before first paint) has had no browser guard at all since the
     round that introduced it. Measured on a fresh page here: `IntMapConsole` is `undefined` at the
     boot barrier and an object about four seconds later, with `atlasConsole` in `pending()`.
     Asserting «undefined» would therefore be asserting a race, and asserting nothing is how the rule
     got no guard in the first place. So the claim is the honest one: a deferred module is present
     ONLY IF somebody went through the loader for it — which is exactly what «not in the boot
     bundle» means — and then, separately, that the only thing warmed without a gesture is the one
     module #R224 says may be. */
  for (const m of LAZY) {
    const inBundle = s.present[m.name] !== 'undefined' && !s.pending.includes(m.name);
    expect(inBundle, `${m.name} must not be on window unless the loader was asked for it`).toBe(false);
  }
  for (const [k, t] of s.factories) {
    const inBundle = t !== 'undefined' && !s.pending.includes(k);
    expect(inBundle, `the ${k} factory must not be registered unless the loader was asked for it`).toBe(false);
  }
  expect(s.pending.filter((n) => n !== 'atlasConsole'),
    'nothing is fetched without a gesture except the Atlas kernel, which a DESKTOP warms after idle (#R224)')
    .toEqual([]);

  /* …and the boot guard, which no longer knows about them, is clean rather than noisy. */
  expect(s.check.missingFactories, 'no EAGER factory is missing').toEqual([]);
  expect(s.check.missing, 'no required global is missing').toEqual([]);
  /* ⚠ (#R304) 「one list knows every factory」 IS A RELATION BETWEEN TWO FILES, SO STATE IT AS ONE.
     src/main.js's LAZY_FACTORIES exists so that a deleted or renamed module still has somewhere to
     be missing from — which only works while it agrees with the loader. It used to be checked by
     naming one member of it, and a list that is only spot-checked drifts by exactly the members
     nobody named. `nightSky` is absent from both sides for the same reason: it publishes itself at
     import time and has no factory to register (js/lazy-modules.js's mount switch says so). */
  expect(s.check.lazy.slice().sort(), 'the boot guard names every deferred factory, and only those')
    .toEqual(FACTORIES.slice().sort());
  expect(s.lazyCheck.failed, 'nothing has failed to load yet').toEqual([]);
});

test('R209 ②: asking for the seismic simulator brings the tsunami model with it', async ({ app }) => {
  /* js/seismic.js calls window.IntMapTsunami directly when an event screens as tsunamigenic, so the
     two cannot be fetched separately — the panel would offer a run that silently does nothing. */
  /* ⚠ ON ①'s PAGE, WHICH IS THE ONE NOTHING HAS ASKED ANYTHING OF. The claim needs a page where
     tsunami has not been fetched yet. Ordering this before ③ was the original answer and it is not
     enough: the page ③ uses is shared with every other spec on the worker, and one of them fetches
     everything (see the note by `untouched`). Reusing ①'s fresh page keeps the second boot #R208 was
     avoiding down to ONE for the pair. */
  const p = await untouched(app);
  const before = await p.evaluate(() => typeof window.IntMapTsunami);
  const after = await p.evaluate(async () => {
    await window.IntMapLazy.need('seismic');
    return { tsunami: typeof window.IntMapTsunami, failed: window.__imLazyCheck.failed };
  });
  expect(before, 'not there to begin with').toBe('undefined');
  expect(after.tsunami, 'asking for seismic fetched tsunami too').not.toBe('undefined');
  expect(after.failed).toEqual([]);
});

/* ⚠ (#R304) THE LIST IS DERIVED; THE MEMBER IS DECLARED — AND EVERY MODULE MUST DECLARE ONE. A
   `typeof !== 'undefined'` check passes for a module that loaded and registered half of itself, so
   this names one member each caller actually uses. WHICH member cannot be derived — that is
   knowledge about the feature — but the KEYS are checked against the loader below, so an eleventh
   lazy module fails this file until somebody says what «arrived» means for it, rather than quietly
   not being checked. That is the half of the drift a derived list alone would not have caught:
   `atlasConsole` and `routeUi` had been deferred for rounds and neither was named here.
   Written as a path from `window` so it crosses into the page as data, not as code. */
const MEMBER = {
  flightSim: ['IntMapFlightSim', 'setup'],
  playground: ['_openPlayground'],            /* a bare function, not an object */
  seismic: ['IntMapSeismic', 'open'],
  tsunami: ['IntMapTsunami', 'open'],
  terrainWater: ['IntMapTerrainWater', 'open'],
  los: ['IntMapLOS', 'open'],
  streetView: ['IntMapStreetView', 'open'],
  nightSky: ['IntMapNightSky', 'open'],
  atlasConsole: ['IntMapConsole', 'dispatch'],   /* Atlas is the control plane — it must dispatch */
  routeUi: ['IntMapRouteUI', 'open'],
  /* (#R311) the six that moved this round. Each names the member its OWN doors call, so a module
     that loaded and registered half of itself is still a failure here: the data-center row calls
     toggle(), the aircraft click open(), the Measure tool setRing(), the comparison panel open(),
     the satellite row start() and the satellite card open(). */
  dataCenters: ['IntMapDataCenters', 'toggle'],
  aircraftDetail: ['IntMapAircraftPanel', 'open'],
  volume3d: ['IntMapVolume3D', 'setRing'],
  statsCompare: ['IntMapStatsCompare', 'open'],
  satellitesLive: ['IntMapSatellites', 'start'],
  satelliteDetail: ['IntMapSatPanel', 'open'],
  /* ⚠ (#R341) SIX MORE, AND FIVE OF THEM WERE ALREADY MISSING. This table and js/lazy-modules.js
     are two lists of the same fact, and the assertion right below compares them — so a module added
     to the loader without a line here turns this spec red. #R322 added the five `analysis*` keys and
     did not add them here, which means the deep tier has been red on this test since that merge;
     #R341's `aviationLive` would have been the sixth. Adding only the sixth would have left the
     spec red and the round would have looked like the cause, so all six are here.
     Each names the member its OWN doors call: the analysis panels call open() on the implementation
     js/analysis-panels.js awaits, and the aircraft layer calls stats() on the controller it starts. */
  analysisTimeSeries: ['__imAnalysisTimeSeries', 'open'],
  analysisResearch: ['__imAnalysisResearch', 'open'],
  analysisCorrelate: ['__imAnalysisCorrelate', 'open'],
  /* ⚠ `render`, not `open`. js/analysis-world-events.js publishes { render, evYear } and has no
     open() at all; the member named here has to be the one THAT MODULE'S OWN DOOR calls, which is
     `I.render(dash, q)` in js/analysis-panels.js. Writing `open` because the four siblings use it
     made this row assert nothing about the module it names. */
  analysisEvents: ['__imAnalysisEvents', 'render'],
  analysisEdu: ['__imAnalysisEdu', 'open'],
  aviationLive: ['IntMapAviation', 'stats'],
};

test('R209 ③: every deferred module actually arrives, registers and publishes', async ({ app }) => {
  test.setTimeout(120_000);
  expect(Object.keys(MEMBER).sort(), 'every deferred module names the member that proves it arrived')
    .toEqual(LAZY.map((m) => m.name).sort());

  const res = await app.page.evaluate(async ({ globals, members }) => {
    const names = window.IntMapLazy.names();
    await Promise.all(names.map((n) => window.IntMapLazy.need(n)));
    const at = (path) => typeof path.reduce((o, k) => (o == null ? undefined : o[k]), window);
    return {
      names,
      failed: window.__imLazyCheck.failed,
      loaded: window.__imLazyCheck.loaded,
      globals: Object.fromEntries(Object.entries(globals).map(([n, g]) => [n, typeof window[g]])),
      members: Object.fromEntries(Object.entries(members).map(([n, p]) => [n, at(p)])),
    };
  }, { globals: GLOBALS, members: MEMBER });

  /* the loader's OWN verdict — it checks the factory registered and the global appeared */
  expect(res.failed, 'the loader recorded no failure').toEqual([]);
  expect(res.loaded.sort(), 'and recorded every one as loaded').toEqual(res.names.sort());
  for (const [k, t] of Object.entries(res.globals)) expect(t, `${k} published its global`).not.toBe('undefined');
  for (const [k, t] of Object.entries(res.members)) expect(t, `${k} published a usable API`).toBe('function');
});

test('R209 ④: the right-click menu still opens a deferred simulator', async ({ app }) => {
  /* The end-to-end claim: the door the user actually uses works, with the file arriving in between.
     Anything less tests the loader rather than the feature. */
  /* ⚠ (#R304) THE TEST'S OWN BUDGET HAS TO COVER THE WAIT IT CONTAINS. The last step below allows 45 s
     for js/seismic.js (and js/tsunami.js with it) to arrive and mount, and everything before it —
     the camera move, the menu, two clicks — regularly costs another twenty. The file's default is 60,
     so a slow fetch ran the TEST out of time and Playwright closed the page mid-click: the report then
     said 「Target page… has been closed」, which names the symptom and not one thing about the loader.
     ③ above already carries its own budget for the same reason. */
  test.setTimeout(150_000);
  /* ⚠⚠ (#R304) ON A PAGE OF ITS OWN, BECAUSE THAT IS WHAT THE CLAIM IS. 「the file arriving in
     between」 cannot be shown on the shared page: ③ above asks for all ten modules on it, so by the
     time this test runs the seismic module is already there and the right-click only proves the menu
     item exists. ③ also leaves whatever those ten factories mounted on screen — measured here as the
     diagnostic below firing, «no point on the map is reachable», at all twenty-five probed points,
     where the older version had simply reported 「#ctx-menu is hidden」 and left the reason unsaid.
     A fresh page costs one boot and buys back both halves of the test. */
  const page = await app.freshPage();
  await page.evaluate(() => window.IntMapGeoEngine.camera.jumpTo({ center: [138.73, 35.36], zoom: 9, pitch: 0, bearing: 0 }));
  await page.waitForTimeout(400);
  /* ⚠ (#R304) RIGHT-CLICK A POINT THAT REALLY IS THE MAP. This clicked the centre of `#map` and
     sometimes found `#ctx-menu` still hidden — a right-click that lands on a panel, a legend or a
     control opens nothing, and the failure then says 「the menu is hidden」 rather than 「something
     was in the way」. The shared page has been through every test before this one, so what sits over
     the centre is not fixed. Asking `elementsFromPoint` first turns a mystery into a diagnosis, and
     the search is bounded: if NO point on the map is reachable, that is the failure. */
  const at = await page.evaluate(() => {
    const m = document.getElementById('map').getBoundingClientRect();
    for (const fy of [0.5, 0.42, 0.58, 0.35, 0.65]) for (const fx of [0.5, 0.42, 0.58, 0.35, 0.65]) {
      const x = Math.round(m.left + m.width * fx), y = Math.round(m.top + m.height * fy);
      const e = document.elementsFromPoint(x, y)[0];
      if (e && e.tagName === 'CANVAS') return { x, y };
    }
    return null;
  });
  expect(at, 'no point on the map is reachable — something is covering the canvas').not.toBeNull();
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await expect(page.locator('#ctx-menu')).toBeVisible({ timeout: 10_000 });
  /* the menu opens with its four groups collapsed — the simulators live under the last one */
  await page.locator('#ctx-menu').getByText(/Analysis & simulation/i).first().click();
  expect(CTX_SEISMIC, 'js/tool-panel.js still has a right-click entry that asks the loader for the seismic module').toBeTruthy();
  await page.locator('#ctx-menu').getByText(CTX_SEISMIC, { exact: false }).first().click();
  /* the panel only exists once the file has arrived and its factory has run */
  /* ⚠ (#R304) `#sq-panel`, WHICH IS THE PANEL — the old net `'#sq-panel, .sq-panel, [id*="seismic"]'`
     also matches `#btn-seismic-sim`, a hidden button that exists at boot, and `.first()` picks it in
     DOM order. Measured: 87 polls against that button while the panel it was waiting for was already
     open. js/seismic.js gives the panel that id and nothing else has it. */
  await expect(page.locator('#sq-panel')).toBeVisible({ timeout: 45_000 });
  const st = await page.evaluate(() => ({ open: !!(window.IntMapSeismic && window.IntMapSeismic.state().open), failed: window.__imLazyCheck.failed }));
  expect(st.failed, 'and it arrived cleanly').toEqual([]);
  expect(st.open, 'the simulator is open').toBe(true);
  await page.evaluate(() => { try { window.IntMapSeismic.close(); } catch (_) { } });
});

test('R209 ⑤: turf still answers every call the app makes, and the heavy pair arrives on demand', async ({ app }) => {
  const r = await app.page.evaluate(async () => {
    const t = window.turf;
    const eager = {
      point: typeof t.point, bbox: typeof t.bbox, distance: typeof t.distance,
      booleanPointInPolygon: typeof t.booleanPointInPolygon, union: typeof t.union,
      greatCircle: typeof t.greatCircle, circle: typeof t.circle, area: typeof t.area,
      kinks: typeof t.kinks, along: typeof t.along, bboxClip: typeof t.bboxClip,
    };
    /* a real answer, not just a function reference */
    const d = t.distance(t.point([0, 0]), t.point([0, 1]), { units: 'kilometres' });
    const before = { convex: typeof t.convex, buffer: typeof t.buffer };
    await t.ensureHeavy();
    return { eager, d, before, after: { convex: typeof t.convex, buffer: typeof t.buffer } };
  });
  for (const [k, v] of Object.entries(r.eager)) expect(v, `turf.${k} is bundled`).toBe('function');
  expect(r.d, 'and computes — one degree of latitude is ~111 km').toBeGreaterThan(110);
  expect(r.d).toBeLessThan(112);
  expect(r.before.convex, 'convex is NOT in the boot bundle (it reaches turf-jsts, 332 kB)').toBe('undefined');
  expect(r.before.buffer, 'nor is buffer').toBe('undefined');
  expect(r.after.convex, 'and ensureHeavy() brings them').toBe('function');
  expect(r.after.buffer).toBe('function');
});
