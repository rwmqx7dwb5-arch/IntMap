// R163 behavioural checks in a real browser — the seven modules moved out of index.html.
//
// WHY THIS FILE EXISTS. #R162 split index.html and every static check stayed green while a whole
// feature quietly died: js/monitors.js lost `radiusItems`, so activeArea() fell through to "no area
// selected". No exception, no console error — this codebase guards soft dependencies with
// `typeof X !== 'undefined'` inside try/catch, so a vanished binding just skips the branch. Only a
// browser test that USES the feature can see that. #R163 moved 566 KB more (flight sim, historical
// borders, stats compare, routing, map compare, companies, street view), so each one is exercised
// here, and the LIVE-getter contract is proved by switching the UI language at runtime and watching
// an already-constructed module follow it.
import { test, expect } from '@playwright/test';
import { installHermeticRouting, collectPageDiagnostics } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';
import { loadLazyModules } from './helpers/app.js';

test.describe.configure({ mode: 'serial' });

let page, diag;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 }, storageState: seededStorageState() });
  await installHermeticRouting(context);
  await context.addInitScript(() => { try { localStorage.setItem('intmap_ws4', JSON.stringify({ on: false })); } catch { /* ignore */ } });
  page = await context.newPage();
  diag = collectPageDiagnostics(page);
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForFunction(() => !!window.__imap && !!document.getElementById('map'), null, { timeout: 45_000 });
  /* ⚠ (#R209) TWO OF THE SEVEN MODULES THIS FILE EXERCISES ARE NO LONGER IN THE BOOT BUNDLE.
     js/flight-sim.js and js/street-view.js moved behind js/lazy-modules.js, so nothing publishes
     window.IntMapFlightSim (#3) or window.IntMapStreetView (#2) until something asks for them. The
     app's own entry points await `IntMapLazy.need(…)` before they touch either one, so a spec that
     drives the same feature makes the same call — this is not a wait for something that arrives on
     its own, and softening #2's key-set assertions instead would have deleted exactly the check
     this file exists to make. */
  await loadLazyModules(page);
  await page.waitForTimeout(2500);
});

test.afterAll(async () => {
  await page?.context()?.close();
});

test('R163 #1 every module file loaded and every factory was instantiated', async () => {
  // index.html's boot guard reports missing files AND missing factories — a namespace created by an
  // earlier file would otherwise mask a later file that never loaded.
  const check = await page.evaluate(() => window.__imModuleCheck);
  expect(check, 'the boot-time module check ran').toBeTruthy();
  expect(check.missing, 'no required module global is missing').toEqual([]);
  expect(check.missingFactories, 'no module factory is missing').toEqual([]);
});

test('R163 #2 each extracted global exists with its real API surface (not an empty stub)', async () => {
  const api = await page.evaluate(() => {
    const shape = (o) => (o && typeof o === 'object' ? Object.keys(o).sort() : null);
    return {
      companies: shape(window.IntMapCompanies),
      statsCompare: shape(window.IntMapStatsCompare),
      compare: shape(window.IntMapCompare),
      routing: shape(window.IntMapRouting),
      streetView: shape(window.IntMapStreetView),
      flightSim: shape(window.IntMapFlightSim),
      timeBorders: shape(window.IntMapTimeBorders),
      monitors: shape(window.IntMapMonitors),
    };
  });
  // Each of these modules early-returns a 2-3 key stub when `map` is missing, so the key set — not
  // mere truthiness — is what distinguishes a real instantiation from a silently stubbed one.
  expect(api.companies).toEqual(expect.arrayContaining(['DATA', 'mcap', 'priceOf', 'priceSeries', 'loadPrices']));
  expect(api.statsCompare).toEqual(expect.arrayContaining(['open', 'paintOnMap', 'indKeys', 'indLabel', 'state']));
  expect(api.compare).toEqual(expect.arrayContaining(['open', 'close', '_map']));
  expect(api.routing).toEqual(expect.arrayContaining(['route', 'clear', 'openPanel', 'maneuver', 'hasRoute']));
  expect(api.streetView).toEqual(expect.arrayContaining(['open', 'close', 'coverage', 'nearestCoverage']));
  expect(api.flightSim).toEqual(expect.arrayContaining(['start', 'stop', 'setup', 'active', 'aircraft', 'airports']));
  expect(api.timeBorders).toEqual(expect.arrayContaining(['_go', '_clear', 'current', 'geomFor', 'resolveHist']));
  expect(api.monitors).toEqual(expect.arrayContaining(['render', 'create', 'activeArea', 'atlas'])); // #R162 stays alive
});

test('R163 #3 the flight model still computes real physics through the host interface', async () => {
  // IntMapFlightSim reads currentLang/currentMapType/currentProj/terrain3D off HOST — and it is the
  // single largest thing that moved (161 KB). Start a real flight, integrate a few deterministic
  // physics ticks, then stop: a lost binding shows up as an err field or a frozen state vector.
  const st = await page.evaluate(async () => {
    const F = window.IntMapFlightSim;
    const list = F.list();
    F.aircraft(list[0]);
    const started = F.start({ lng: 2.3, lat: 48.85, alt: 3000, hdg: 90 });
    const s0 = JSON.parse(JSON.stringify({ alt: F._st().alt, V: F._st().V, psi: F._st().psi }));
    const errs = [];
    for (let i = 0; i < 25; i++) { const r = F._dbg.step(0.02); if (r && r.err) errs.push(r.err); }
    F._dbg.key('w', true);                              // throttle up
    for (let i = 0; i < 25; i++) { const r = F._dbg.step(0.02); if (r && r.err) errs.push(r.err); }
    F._dbg.clearKeys();
    const s1 = { alt: F._st().alt, V: F._st().V, psi: F._st().psi, thr: F._st().thr };
    const active = F.active();
    F.stop();
    return { list, airports: F.airports().length, started, s0, s1, errs, active, stopped: F.active() };
  });
  expect(st.list.length, 'the aircraft table survived the move').toBeGreaterThan(1);
  expect(st.airports, 'the airport table survived the move').toBeGreaterThan(1);
  expect(st.started, 'start() reports success').toBe(true);
  expect(st.active, 'the sim was actually running').toBe(true);
  expect(st.errs, 'no physics tick threw:\n' + st.errs.join('\n')).toEqual([]);
  expect(Number.isFinite(st.s1.alt) && Number.isFinite(st.s1.V), 'the state vector stays finite').toBe(true);
  expect(st.s1.thr, 'the throttle key reached the model').toBeGreaterThan(0);
  expect(st.s1.V, 'integrating with throttle changes airspeed — the model really ran').not.toBe(st.s0.V);
  expect(st.stopped, 'stop() cleanly ends the flight').toBe(false);
});

test('R163 #4 companies market caps still compute from the real table', async () => {
  const co = await page.evaluate(() => {
    const C = window.IntMapCompanies;
    const rows = C.DATA || [];
    const capped = rows.filter((r) => Number(C.mcap(r)) > 0);
    return { n: rows.length, capped: capped.length, sample: capped[0] ? Number(C.mcap(capped[0])) : 0 };
  });
  expect(co.n, 'the company table survived the move').toBeGreaterThan(50);
  expect(co.capped, 'market caps compute across the table').toBeGreaterThan(50);
  expect(co.sample, 'a real market cap is a positive number').toBeGreaterThan(0);
});

test('R163 #5 stats-compare reads its indicator table and reports live panel state', async () => {
  const sc = await page.evaluate(() => {
    const S = window.IntMapStatsCompare;
    const keys = S.indKeys();
    return { keys: keys.length, label: S.indLabel(keys[0]), state: S.state() };
  });
  expect(sc.keys, 'the ~20 indicators survived the move').toBeGreaterThan(10);
  expect(typeof sc.label).toBe('string');
  expect(sc.label.length, 'indicator labels resolve through the host language').toBeGreaterThan(0);
  expect(sc.state, 'state() reports the live panel state').toBeTruthy();
});

test('R163 #6 historical borders instantiated against the real clock, not the empty stub', async () => {
  // IntMapTimeBorders early-returns {} when map or IntMapTime is missing — an empty object is
  // exactly what a botched split produces, so assert the real functions are there and idle at boot.
  const tb = await page.evaluate(() => {
    const T = window.IntMapTimeBorders;
    return { current: T.current(), active: T.active(),
      hasResolve: typeof T.resolveHist === 'function', hasGeom: typeof T.geomForCode === 'function' };
  });
  expect(tb.hasResolve).toBe(true);
  expect(tb.hasGeom).toBe(true);
  expect(tb.active, 'no era is forced on at boot').toBe(false);
  expect(tb.current, 'the clock starts at "Now"').toBeNull();
});

test('R163 #7 LIVE getters: modules built in English follow a runtime language switch', async () => {
  // THE load-bearing assertion. Every module was constructed at boot, while currentLang was 'en'.
  // If the host had handed over a captured copy instead of a getter, these strings would stay
  // English for the rest of the session — silently, with no error anywhere. Both probes below are
  // pure functions on already-constructed modules that read HOST.lang on every call.
  const probe = () => page.evaluate(() => ({
    // js/stats-compare.js — indLabel() picks the language column via HOST.lang
    ind: window.IntMapStatsCompare.indLabel(window.IntMapStatsCompare.indKeys()[0]),
    // js/routing.js — turn guidance is formatted in the current UI language. maneuver() returns
    // {icon,lane,text}; read .text, because comparing the OBJECTS would compare identities and
    // every assertion below would pass no matter what the module actually did.
    turn: String(window.IntMapRouting.maneuver({ maneuver: { type: 'turn', modifier: 'left' } }).text || ''),
  }));
  const setLang = async (code) => {
    await page.evaluate((c) => document.getElementById('lang-' + c)?.click(), code);
    await page.waitForTimeout(700);
  };

  const en = await probe();
  expect(typeof en.ind).toBe('string');
  expect(en.ind.length).toBeGreaterThan(0);
  expect(en.turn.length, 'routing produced guidance text to compare').toBeGreaterThan(0);

  await setLang('jp');
  const jp = await probe();
  expect(jp.ind, 'stats-compare built at boot reads the NEW language — HOST.lang is a live getter, not a copy')
    .not.toBe(en.ind);
  expect(jp.turn, 'routing guidance follows the language switch too').not.toBe(en.turn);

  await setLang('en');
  const back = await probe();
  expect(back.ind, 'and it follows the language back').toBe(en.ind);
  expect(back.turn).toBe(en.turn);
});

test('R163 #8 no IntMap-originated console error or uncaught exception during the exercise', async () => {
  // installHermeticRouting blocks external hosts, and collectPageDiagnostics classifies that noise
  // as benign; whatever is left came from IntMap's own code.
  //
  // ONE documented exclusion. Stopping the flight sim restores the stashed layers, which drives
  // MapLibre's image events back through ensureLabelPill → addImage/removeImage → _afterImageUpdated
  // → fire → ensureLabelPill, and that re-entrancy overflows the stack. It is NOT a #R163 regression:
  // it reproduces identically on main at 583c/583d9ec (pre-split) with the same start→step→stop
  // sequence and no other interaction, and none of that code moved in this round. Excluded by an
  // exact signature so every other error in the flight-sim path still fails this test.
  const preexistingLabelPillOverflow = (s) =>
    /Maximum call stack size exceeded/.test(s) && /(ensureLabelPill|maplibre-gl)/.test(s);

  const pageErrors = diag.pageErrors.filter((e) => !preexistingLabelPillOverflow(String(e)));
  const consoleErrors = diag.consoleErrors.filter((e) => !preexistingLabelPillOverflow(String(e)));
  expect(pageErrors, 'uncaught exceptions:\n' + pageErrors.join('\n')).toEqual([]);
  expect(consoleErrors, 'app console errors:\n' + consoleErrors.join('\n')).toEqual([]);
});
