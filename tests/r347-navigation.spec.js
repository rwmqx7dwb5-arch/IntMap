/* ============================================================================
 *  #R347 — the browser half: a whole journey, driven by the simulator
 * ----------------------------------------------------------------------------
 *  tests/r347-checks.test.mjs proves the arithmetic. Only a browser can prove the thing that
 *  actually matters, and this project's most expensive recurring defect is exactly it:
 *
 *      code that exists, parses, passes every source-level gate — and has never once run.
 *
 *  #R318 shipped an Atlas that could not mount in the production bundle (a TDZ across two chunks;
 *  `node --check`, 1,900 node checks and a twenty-point audit all passed). #R317 found a check that
 *  had never executed. #R301 found two spec files that had never executed. So this file asks the
 *  page to do the whole thing — plan, start, drive, leave the route, re-plan, arrive — and reads the
 *  STATE MACHINE'S OWN RECORD of what happened rather than a screenshot of what it looks like.
 *
 *  ⚠ THE SIMULATOR IS THE POINT, NOT A SHORTCUT. §50: real GPS is not reproducible, and a test that
 *  waits for a device fix tests the device. js/navigation-sim.js emits the SAME shape
 *  `navigator.geolocation` does, through the SAME `onFix` the real watch uses, so everything below
 *  the fix source is the shipped path.
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';

test.describe.configure({ mode: 'serial' });

/* Tokyo Station → Yokohama Station: a real 32 km road route with 26 maneuvers (measured #R347). */
const FROM = { lng: 139.7671, lat: 35.6812, name: 'Tokyo Station' };
const TO = { lng: 139.6222, lat: 35.4657, name: 'Yokohama Station' };

/* ⚠ PLANNED ONCE FOR THE FILE, NOT ONCE PER TEST. Six of these tests need a route on the shared
   page, and asking the public OSRM demo six times for the same 32 km is both slower (measured: it
   is most of this file's wall clock) and ruder — its own terms ask for at most one request a
   second. The file is serial and the page is worker-scoped, so the FIRST call plans and the rest
   reuse what is already in js/routing.js's route set. `S.reset()` is therefore conditional: it
   clears the planner's fields, and clearing them would throw away the very route being reused. */
async function planRoute(page) {
  return page.evaluate(async ({ from, to }) => {
    const S = window.IntMapRouteStore;
    if (window.IntMapRouting.alts().length && S.get().to.place) {
      return { ok: true, status: 'reused', provider: 'cached', alts: window.IntMapRouting.alts().length };
    }
    S.reset();
    S.setPlace('from', { ...from, kind: 'place' });
    S.setPlace('to', { ...to, kind: 'place' });
    const r = await window.IntMapRouting.route(from, to, { mode: 'driving' });
    return { ok: !!(r && r.ok), status: r && r.status, provider: r && r.provider, alts: window.IntMapRouting.alts().length };
  }, { from: FROM, to: TO });
}

test('R347 ① the whole navigation subsystem arrives in one chunk', async ({ app }) => {
  /* ⚠ THIS NO LONGER PAYS FOR A FRESH BOOT, AND THE HALF IT DROPPED IS NOT LOST. It used to open
     `app.freshPage()` to prove navigation is absent BEFORE it is asked for — but tests/r209.spec.js ①
     already asserts exactly that, generically, for every name in the loader's list, and #R347 put
     both of its modules in that list. Two boots for one fact is the accumulation tests/durations.json
     exists to price; the source-level half is in tests/r347-checks.test.mjs ㋕ instead, where it costs
     nothing and reads the import graph rather than a running page. What is left here is the half only
     a browser can answer: asked for, ALL EIGHT arrive together and the loader records no failure. */
  const page = app.page;
  const after = await page.evaluate(async () => {
    const ok = await window.IntMapLazy.need('navigation');
    const names = ['IntMapNavigation', 'IntMapNavStore', 'IntMapNavMatch', 'IntMapNavGuide',
      'IntMapNavCamera', 'IntMapNavVoice', 'IntMapNavSim', 'IntMapNavUI'];
    return {
      ok,
      listed: window.IntMapLazy.names().includes('navigation'),
      publishes: window.IntMapLazy.publishes('navigation'),
      missing: names.filter((n) => typeof window[n] === 'undefined'),
      failed: (window.__imLazyCheck || {}).failed || [],
    };
  });
  /* the planner can be told the name exists before the code does (#R320) */
  expect(after.listed).toBe(true);
  expect(after.publishes).toBe('IntMapNavigation');
  expect(after.ok, 'the loader reports success').toBe(true);
  expect(after.missing, 'all eight navigation globals arrive in one chunk').toEqual([]);
  expect(after.failed.filter((f) => /navigation/.test(f)), 'and nothing was recorded as a failure').toEqual([]);
});

test('R347 ② every routing capability names a lazy module the loader really has', async ({ app }) => {
  const page = app.page;
  /* ⚠ THE DEFECT THIS ROUND FOUND. Four capabilities named a module `routing` that has never
     existed: `IntMapLazy.need('routing')` returned false, wrote «no such lazy module: routing» into
     the loader's failure record, and the capability could not execute. It passed every gate because
     the capability table and the loader's table were never compared to each other (#R318/#R323's
     shape, a fifth time). Measured before the fix: 4 of 116. */
  const bad = await page.evaluate(() => {
    const names = window.IntMapLazy.names();
    return window.IntMapCapabilities.all()
      .flatMap((c) => (c.lazyModules || []).map((m) => `${c.id} → ${m}`))
      .filter((s) => !names.includes(s.split(' → ')[1]));
  });
  expect(bad, 'a capability that names a module the loader cannot fetch can never run').toEqual([]);
});

test('R347 ④ a simulated drive runs the whole state machine and arrives', async ({ app }) => {
  const page = app.page;
  const planned = await planRoute(page);
  test.skip(!planned.ok, `the public router did not answer (${planned.status})`);

  const run = await page.evaluate(async () => {
    await window.IntMapLazy.need('navigation');
    const N = window.IntMapNavigation, S = window.IntMapNavStore, G = window.IntMapNavGuide, M = window.IntMapNavMatch;
    const seen = [];
    const un = S.on((s, why) => { if (!seen.length || seen[seen.length - 1] !== s.state) seen.push(s.state); });

    const route = N._navRoute();
    /* ⚠ (#R347) THE STRUCTURE OF THE NAV ROUTE IS ASSERTED HERE, NOT IN A TEST OF ITS OWN. It had
       one, and the test cost a second plan and a second round-trip to learn what this test has to
       build anyway — tests/durations.json prices the suite at exactly its ceiling, so browser time
       added has to be browser time taken out. Nothing is lost: these are the same four properties,
       measured on the same REAL OSRM route, one evaluate earlier. */
    const built = {
      steps: route.steps.length, coords: route.idx.n, gridCells: route.idx.grid.size,
      monotonic: route.steps.every((s2, x) => x === 0 || s2.along >= route.steps[x - 1].along),
      spansCover: Math.abs(route.steps[route.steps.length - 1].end - route.distance) < 1,
    };
    S.reset();
    S.attach(route, { mode: 'driving', destination: { lng: 139.6222, lat: 35.4657, name: 'Yokohama' }, legCount: 1, legIndex: 0 });
    S.to('acquiring_location'); S.to('ready'); S.to('enroute');

    /* ⚠ FIXES ARE FED THROUGH THE SAME `onFix` THE REAL WATCH USES. Nothing below this line is a
       test double: accept → project → progress → the votes → the store are the shipped path. */
    const idx = route.idx;
    const step = 250;                       /* metres per fix — a fast drive, 40-odd fixes */
    let t = Date.now();
    const snap = [];
    for (let d = 0; d <= idx.total; d += step) {
      const p = M.pointAt(idx, Math.min(d, idx.total));
      t += 10000;                            /* 250 m in 10 s = 25 m/s */
      N._onFix({ lng: p[0], lat: p[1], accuracy: 6, speed: 25, heading: M.bearingAt(idx, d), timestamp: t });
      const s = S.get();
      snap.push({ d: Math.round(d), state: s.state, rem: Math.round(s.remainingDistance), stepIdx: s.stepIndex, spoken: s.spoken.length });
    }
    /* stop at the destination so arrival can settle (§17 wants a low speed sustained) */
    const end = M.pointAt(idx, idx.total);
    for (let i = 0; i < 4; i++) { t += 3000; N._onFix({ lng: end[0], lat: end[1], accuracy: 5, speed: 0, heading: null, timestamp: t }); }
    const fin = S.get();
    un();
    return {
      built,
      states: seen,
      finalState: fin.state,
      remaining: Math.round(fin.remainingDistance),
      stepsAdvanced: Math.max(...snap.map((x) => x.stepIdx)),
      cues: fin.spoken.length,
      duplicateCues: fin.spoken.length !== new Set(fin.spoken).size,
      monotonicRemaining: snap.every((x, i) => i === 0 || x.rem <= snap[i - 1].rem + 1),
      positionsSent: N._sent(),
      firstSnap: snap[0], midSnap: snap[Math.floor(snap.length / 2)],
    };
  });

  /* the nav route this drive followed was well-formed — folded in from the test ③ used to be */
  expect(run.built.steps, 'a 32 km drive has many maneuvers').toBeGreaterThan(5);
  expect(run.built.coords, 'and a full-resolution polyline').toBeGreaterThan(100);
  expect(run.built.monotonic, 'every step is anchored at or after the one before it').toBe(true);
  expect(run.built.spansCover, 'the last step ends at the end of the route').toBe(true);
  expect(run.built.gridCells, 'the spatial index was built (so the tick is not an O(n) scan)').toBeGreaterThan(10);
  expect(run.states, 'the journey passed through the states §7 names').toContain('enroute');
  expect(run.states, 'and announced the approach before the arrival').toContain('arriving');
  expect(run.finalState, 'and ended arrived').toBe('arrived');
  expect(run.remaining, 'with nothing left to drive').toBeLessThan(60);
  expect(run.stepsAdvanced, 'the maneuver index advanced through the route').toBeGreaterThan(3);
  expect(run.cues, 'turns were announced').toBeGreaterThan(3);
  expect(run.duplicateCues, '§13: the same cue is never queued twice').toBe(false);
  expect(run.monotonicRemaining, 'remaining distance never went up while driving forwards').toBe(true);
  /* §39: driving 32 km must not send 130 positions anywhere */
  expect(run.positionsSent, 'no position left the device during the drive').toBe(0);
});

test('R347 ⑤ leaving the route is detected and re-planned, and one bad fix is not enough', async ({ app }) => {
  const page = app.page;
  const planned = await planRoute(page);
  test.skip(!planned.ok, `the public router did not answer (${planned.status})`);

  const out = await page.evaluate(async () => {
    await window.IntMapLazy.need('navigation');
    const N = window.IntMapNavigation, S = window.IntMapNavStore, M = window.IntMapNavMatch;
    const route = N._navRoute();
    S.reset();
    S.attach(route, { mode: 'driving', destination: { lng: 139.6222, lat: 35.4657 }, legCount: 1, legIndex: 0 });
    S.to('acquiring_location'); S.to('ready'); S.to('enroute');

    const idx = route.idx;
    let t = Date.now(), d = 0;
    const on = (dd) => { const p = M.pointAt(idx, dd); t += 4000; N._onFix({ lng: p[0], lat: p[1], accuracy: 6, speed: 25, heading: M.bearingAt(idx, dd), timestamp: t }); };
    for (let i = 0; i < 6; i++) { on(d); d += 100; }
    const onRoute = S.get().state;

    /* ONE fix 400 m to the side — a bridge, a tunnel exit, a bad satellite geometry */
    const p = M.pointAt(idx, d);
    t += 4000;
    N._onFix({ lng: p[0], lat: p[1] + 0.0036, accuracy: 6, speed: 25, heading: 0, timestamp: t });
    const afterOne = { state: S.get().state, off: S.get().offRoute, reroutes: S.get().rerouteCount };

    /* …and then a sustained departure: eight fixes over half a minute, moving away.
       ⚠ THE FLAG IS READ INSIDE THE LOOP, NOT AFTER IT. The reroute is asynchronous: once the new
       route lands the machine clears `offRoute` and returns to `enroute`, so a test that looks at
       the end sees a car that is happily on a route again and concludes nothing was detected. (It
       did: measured `streak 1 → 2 → 3, off=true, state=rerouting` on the third away-fix.) What is
       durable is the COUNTER, and what is momentary is the flag — so capture the flag as it passes. */
    let sawOff = false, sawState = '';
    for (let i = 1; i <= 8; i++) {
      t += 4000;
      N._onFix({ lng: p[0] + i * 0.0006, lat: p[1] + 0.0036 + i * 0.0008, accuracy: 6, speed: 20, heading: 45, timestamp: t });
      const s = S.get();
      if (s.offRoute) { sawOff = true; sawState = sawState || s.state; }
    }
    const afterMany = { sawOff, sawState, reroutes: S.get().rerouteCount, sent: N._sent() };
    return { onRoute, afterOne, afterMany };
  });

  expect(out.onRoute, 'driving along the route stays enroute').toBe('enroute');
  /* §14: 「単純に『routeから20m以上離れたら即reroute』は禁止」 */
  expect(out.afterOne.off, 'a single fix off the line is not a departure').toBe(false);
  expect(out.afterOne.reroutes, 'and it certainly does not re-plan').toBe(0);
  /* …and a real departure is caught */
  expect(out.afterMany.sawOff, 'eight fixes moving away IS a departure').toBe(true);
  expect(['offroute', 'rerouting'], `the machine reacted (saw ${out.afterMany.sawState})`)
    .toContain(out.afterMany.sawState);
  /* ⚠ EXACTLY ONE. Five more fixes arrive while the car is still off the route, and a reroute per
     fix is the failure mode §15 and §16 both warn about. */
  expect(out.afterMany.reroutes, 'and it re-plans exactly once, not once per fix').toBe(1);
  expect(out.afterMany.sent, 'the reroute is the only thing that sent a position').toBe(1);
});

test('R347 ⑥ the navigation UI replaces the planner and reports honestly about traffic', async ({ app }) => {
  const page = app.page;
  const planned = await planRoute(page);
  test.skip(!planned.ok, `the public router did not answer (${planned.status})`);

  const shown = await page.evaluate(async () => {
    await window.IntMapLazy.need('navigation');
    const N = window.IntMapNavigation, S = window.IntMapNavStore, M = window.IntMapNavMatch;
    const route = N._navRoute();
    S.reset();
    S.attach(route, { mode: 'driving', destination: { lng: 139.6222, lat: 35.4657, name: 'Yokohama' }, legCount: 1, legIndex: 0 });
    S.to('acquiring_location'); S.to('ready'); S.to('enroute');
    window.IntMapNavUI.open();
    const p = M.pointAt(route.idx, 1000);
    N._onFix({ lng: p[0], lat: p[1], accuracy: 6, speed: 22, heading: M.bearingAt(route.idx, 1000), timestamp: Date.now() });
    await new Promise((r) => setTimeout(r, 60));
    const el = window.IntMapNavUI._el();
    const txt = el ? el.textContent : '';
    return {
      open: !!(el && el.isConnected),
      plannerHidden: document.body.classList.contains('nvg-on'),
      /* §6: a duration with no traffic behind it must SAY it has no traffic behind it */
      claimsTraffic: /渋滞考慮|Traffic included|Traffic-aware/i.test(txt),
      saysNoTraffic: /not included|未反映|nicht|не вклю|no incluid/i.test(txt),
      hasEta: /\d/.test(txt),
      lanes: !!el.querySelector('.nvg-lanes'),
      providerHasTraffic: window.IntMapRouteProviders.supports('driving', 'traffic'),
    };
  });

  expect(shown.open, 'the navigation UI mounted').toBe(true);
  expect(shown.hasEta, 'and it is showing numbers').toBe(true);
  /* §5/§6: with no traffic provider configured, nothing may claim traffic — and it must say so */
  expect(shown.providerHasTraffic, 'no traffic key is configured in this checkout').toBe(false);
  expect(shown.claimsTraffic, 'a route with no traffic data may never be labelled traffic-aware').toBe(false);
  expect(shown.saysNoTraffic, 'and the reader is told which kind of estimate this is').toBe(true);

  await page.evaluate(() => { window.IntMapNavigation.stop(); });
  const closed = await page.evaluate(() => ({
    ui: !!(window.IntMapNavUI._el() && window.IntMapNavUI._el().isConnected),
    state: window.IntMapNavStore.state(),
    planner: document.body.classList.contains('nvg-on'),
  }));
  expect(closed.state, 'stopping returns the machine to idle').toBe('idle');
  expect(closed.planner, 'and gives the planner its screen back').toBe(false);
});

test('R347 ⑦ Atlas drives navigation through the same store, holding no state of its own', async ({ app }) => {
  const page = app.page;
  const planned = await planRoute(page);
  test.skip(!planned.ok, `the public router did not answer (${planned.status})`);

  const res = await page.evaluate(async () => {
    await window.IntMapLazy.need('atlasConsole');
    await window.IntMapLazy.need('navigation');
    const C = window.IntMapConsole;
    /* «あと何分？» with nothing running must say so rather than invent a number */
    const idle = await C.dispatch({ type: 'navStatus' });
    /* …now drive a little, and ask again */
    const N = window.IntMapNavigation, S = window.IntMapNavStore, M = window.IntMapNavMatch;
    const route = N._navRoute();
    S.reset();
    S.attach(route, { mode: 'driving', destination: { lng: 139.6222, lat: 35.4657, name: 'Yokohama' }, legCount: 1, legIndex: 0 });
    S.to('acquiring_location'); S.to('ready'); S.to('enroute');
    const p = M.pointAt(route.idx, route.distance * 0.5);
    N._onFix({ lng: p[0], lat: p[1], accuracy: 6, speed: 20, heading: M.bearingAt(route.idx, route.distance * 0.5), timestamp: Date.now() });
    const live = await C.dispatch({ type: 'navStatus' });
    const store = window.IntMapNavigation.summary();
    window.IntMapNavigation.stop();
    return { idle: { ok: idle.ok, html: idle.html }, live: { ok: live.ok, html: live.html }, store };
  });

  expect(res.idle.ok, 'Atlas refuses to report on a journey that is not happening').toBe(false);
  expect(res.live.ok, 'and answers once one is').toBe(true);
  /* ⚠ THE NUMBER IN THE REPLY IS THE STORE'S, NOT ATLAS'S OWN ARITHMETIC (§34). Halfway along a
     32 km route the remaining distance is ~16 km, and the reply must contain that same figure. */
  const km = Math.round(res.store.remainingDistance / 1000);
  expect(km, 'halfway is halfway').toBeGreaterThan(5);
  expect(res.live.html, `the reply quotes the store's own remaining distance (${km} km)`).toContain(String(km));
});

test('R347 ⑧ on a phone, the two things a driver must read are the two things on top', async ({ app }) => {
  /* ══ ⚠ A Z-INDEX IS ONLY A PROMISE ABOUT SIBLINGS ═══════════════════════════════════════════
     Both assertions below started RED, at 390×844, with everything else already green:
       · `#nav-ui` was mounted inside `#map-container`, so its z-index of 1802 was scoped to that
         element — and `#map-container` loses to `#sidebar` (1100), its sibling. The lower half of
         the navigation bar was painted over by the news sheet: `elementFromPoint(195, 700)`
         returned `#sidebar`.
       · `#bm-square`, the basemap thumbnail, sat over the second line of the turn instruction:
         `elementFromPoint(40, 95)` returned it, not `.nvg-card`.
     Neither is visible to a source-level check, to a DOM query, or to a desktop screenshot. Only
     asking the page WHAT IS ACTUALLY ON TOP AT THIS PIXEL answers it, so that is what this does. */
  const page = app.page;
  await page.setViewportSize({ width: 390, height: 844 });
  const planned = await planRoute(page);
  test.skip(!planned.ok, `the public router did not answer (${planned.status})`);

  const seen = await page.evaluate(async () => {
    await window.IntMapLazy.need('navigation');
    const N = window.IntMapNavigation, S = window.IntMapNavStore, M = window.IntMapNavMatch;
    const route = N._navRoute();
    S.reset();
    S.attach(route, { mode: 'driving', destination: { lng: 139.6222, lat: 35.4657, name: 'Yokohama' }, legDestination: { lng: 139.6222, lat: 35.4657 }, legCount: 1, legIndex: 0 });
    S.to('acquiring_location'); S.to('ready'); S.to('enroute');
    window.IntMapNavUI.open();
    const p = M.pointAt(route.idx, 800);
    N._onFix({ lng: p[0], lat: p[1], accuracy: 6, speed: 18, heading: M.bearingAt(route.idx, 800), timestamp: Date.now() });
    await new Promise((r) => setTimeout(r, 250));

    const inNav = (x, y) => { let n = document.elementFromPoint(x, y); for (let i = 0; i < 8 && n; i++) { if (n.id === 'nav-ui') return true; n = n.parentElement; } return false; };
    const card = document.querySelector('.nvg-card').getBoundingClientRect();
    const bar = document.querySelector('.nvg-bar').getBoundingClientRect();
    const out = {
      cardTopmost: inNav(Math.round(card.x + 30), Math.round(card.y + card.height * 0.55)),
      barTopmost: inNav(195, Math.round(bar.y + bar.height * 0.55)),
      /* §37: 「主要ターゲット >=44px」 */
      smallTargets: [...document.querySelectorAll('#nav-ui button')]
        .map((b) => b.getBoundingClientRect())
        .filter((r) => r.width > 0 && (r.width < 44 || r.height < 44)).length,
      /* nothing may hang off the side of a 390 px phone */
      overflow: [...document.querySelectorAll('#nav-ui *')]
        .map((e) => e.getBoundingClientRect())
        .filter((r) => r.width > 0 && (r.left < -1 || r.right > 391)).length,
    };
    window.IntMapNavigation.stop();
    return out;
  });

  expect(seen.cardTopmost, 'the turn instruction is not covered by anything').toBe(true);
  expect(seen.barTopmost, 'and neither is the ETA bar').toBe(true);
  expect(seen.smallTargets, 'every navigation control is at least 44 px').toBe(0);
  expect(seen.overflow, 'nothing overflows a 390 px viewport').toBe(0);
});
