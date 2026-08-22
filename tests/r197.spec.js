// @ts-check
/* ============================================================================
 *  R197 — in a real renderer: the space explorer, the button that opens it,
 *         the global tsunami, and (#R304) the disaster panel that is no longer there at all
 * ----------------------------------------------------------------------------
 *  tests/r197-checks.test.mjs runs the physics in Node. This runs the parts that only exist when
 *  there is a page: a WebGL context, a canvas that is actually painted, a zoom floor a camera can
 *  reach, and a panel whose buttons are wired.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { installHermeticRouting, collectPageDiagnostics } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';
import { loadLazyModules } from './helpers/app.js';

test.describe.configure({ mode: 'serial' });

let page, diag;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 }, storageState: seededStorageState() });
  await installHermeticRouting(context);
  page = await context.newPage();
  diag = collectPageDiagnostics(page);
  await page.goto('/?rafshim=1', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => !!window.__imap && !!document.getElementById('map'), null, { timeout: 60_000 });
  await page.waitForFunction(() => !!window.IntMapSpace && !!window.IntMapEphemeris, null, { timeout: 60_000 });
  /* ⚠ (#R209) THE TSUNAMI MODEL ⑦ ASKS ABOUT IS NO LONGER IN THE BOOT BUNDLE. js/lazy-modules.js
     fetches it when something requests it, exactly as the panel that opens it does
     (`await IntMapLazy.need('tsunami')`), so this shared page asks once here — the boot barrier above
     is unchanged, because the explorer and the ephemeris ARE still boot-time modules. */
  await loadLazyModules(page);
});

test.afterAll(async () => { try { await page.context().close(); } catch { /* ignore */ } });

/* ── ① the space BUTTON → GONE, and its subject moved to tests/r201.spec.js ③ ────────────────
   「宇宙を探索は、ボタンで押す形式ではなく…ズームアウトし続ければそのまま宇宙まで行き」. There is no
   #space-btn to assert on any more; what replaced it — the zoom-out integral at the floor, the
   gauge, the crossing and the way back — is asserted in r201 ③. Deleted rather than duplicated. */
test('R197 ② the explorer renders the solar system, with real stars and real textures', async () => {
  await page.evaluate(() => {
    window.IntMapGeoEngine.camera.jumpTo({ zoom: window.IntMapGeoEngine.camera.getMinZoom() });
  });
  /* (#R201) opened through the module rather than through the crossing gesture — the GESTURE is
     r201 ③'s subject; what this test is about is what the renderer then draws. */
  await page.evaluate(() => window.IntMapSpace.open({}));
  await page.waitForFunction(() => {
    const s = window.IntMapSpace.state();
    return s.open && s.stars > 1000 && s.textures >= 8;
  }, null, { timeout: 40_000 });

  const st = await page.evaluate(() => window.IntMapSpace.state());
  expect(st.mode).toBe('system');
  expect(st.stars).toBeGreaterThan(5000);      /* the naked-eye Hipparcos sky */
  expect(st.live).toBe(true);

  /* ⚠ THE CANVAS IS ACTUALLY PAINTED. A WebGL context that never draws still reports a size, so the
     pixels are read back: a solar system on black must have lit pixels and must not be uniform. */
  const px = await page.evaluate(() => window.IntMapSpace._sample(240, 160));
  expect(px.max, 'the scene is not entirely black').toBeGreaterThan(60);
  expect(px.lit, 'something is drawn in the middle of the view').toBeGreaterThan(20);
});

test('R197 ③ a planet is a globe with its IAU place names on it', async () => {
  await page.evaluate(() => { window.IntMapSpace.setBody('mars'); window.IntMapSpace.setMode('body'); });
  await page.waitForFunction(() => {
    const s = window.IntMapSpace.state();
    return s.mode === 'body' && s.focus === 'mars' && s.names > 0;
  }, null, { timeout: 30_000 });
  await page.waitForTimeout(1200);
  /* the labels are drawn on the overlay canvas — check that ink reached it */
  const ink = await page.evaluate(() => {
    const ov = document.getElementById('space-ov');
    const c = ov.getContext('2d');
    const d = c.getImageData(0, 0, ov.width, ov.height).data;
    let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++;
    return n;
  });
  expect(ink, 'feature labels were painted onto the overlay').toBeGreaterThan(400);
  const names = await page.evaluate(() => window.IntMapSpace.state());
  expect(names.names).toBeGreaterThanOrEqual(5);   /* five bodies carry nomenclature */
});

test('R197 ④ past, live and future — the positions come from the ephemeris and move with the clock', async () => {
  const r = await page.evaluate(() => {
    const E = window.IntMapEphemeris;
    const at = (iso) => {
      const jd = E.julianDay(Date.parse(iso));
      const m = E.heliocentric('mars', jd);
      return { lon: Math.atan2(m.y, m.x) * 180 / Math.PI, r: m.r };
    };
    return { a: at('1600-06-01T00:00:00Z'), b: at('2026-06-01T00:00:00Z'), c: at('2400-06-01T00:00:00Z') };
  });
  /* Mars's heliocentric distance must stay inside its published perihelion/aphelion at every epoch */
  for (const k of ['a', 'b', 'c']) {
    expect(r[k].r).toBeGreaterThan(1.35);
    expect(r[k].r).toBeLessThan(1.70);
  }
  /* and setting the clock to a date four centuries away must actually move the scene */
  const moved = await page.evaluate(() => {
    window.IntMapSpace.setMode('system');
    window.IntMapSpace.setWhen(new Date('2400-06-01T00:00:00Z'));
    const s1 = window.IntMapSpace.state();
    window.IntMapSpace.setLive();
    const s2 = window.IntMapSpace.state();
    return { past: s1.when, live: s2.when, wasLive: s1.live, isLive: s2.live };
  });
  expect(moved.wasLive).toBe(false);
  expect(moved.isLive).toBe(true);
  expect(moved.past.slice(0, 4)).toBe('2400');
});

test('R197 ⑤ both scales are honest, and closing returns to the map', async () => {
  const s = await page.evaluate(() => {
    window.IntMapSpace.setScale('real');
    const a = window.IntMapSpace.state();
    window.IntMapSpace.setScale('model');
    const b = window.IntMapSpace.state();
    return { a, b };
  });
  expect(s.a.scale).toBe('real');
  expect(s.b.scale).toBe('model');
  await page.click('.sp-close');
  await page.waitForFunction(() => !window.IntMapSpace.state().open, null, { timeout: 10_000 });
  expect(await page.evaluate(() => document.getElementById('space-view').style.display)).toBe('none');
});

/* ══ ⚠⚠ (#R304) ⑥ ASKED A DELETED MODULE WHETHER IT STILL OFFERED A TSUNAMI ════════════════════
   It opened `window.IntMapDisaster`, counted its hazard buttons and required that none of them was
   the tsunami. #R296 deleted that panel outright on the user's instruction — 「災害シミュレーターは
   4つのうち、放射性物質拡散シミュレーションを残し全削除」 — so from that round on ⑥ threw on its first
   line, and the nightly deep run has been red for it ever since. The claim did not become false; its
   SUBJECT stopped existing, which is a stronger version of the same answer.

   Stating that is what this test is now. It is deliberately not a deletion (the shape ① above used,
   because ①'s subject moved to another file and is asserted there): nothing else asks IN A BROWSER
   whether those three globals are really absent. tests/r296-checks.test.mjs proves the source no
   longer defines them; only a running page can prove that nothing puts a stub back at boot — which
   is exactly what this codebase does everywhere else, and exactly what would make 「削除した」 false
   again without a single source line saying so. The shared page has already loaded every on-demand
   module (see beforeAll), so «not present» here means «not present anywhere». */
test('R197 ⑥ the three deleted simulators are gone, and the hazard that stayed has its own door', async () => {
  const d = await page.evaluate(() => ({
    /* 「電波・通信圏と見通し線解析を統合して」 / 「4つのうち…全削除」 / 「存在意義が不明だから全削除」 */
    rf: typeof window.IntMapRF,
    disaster: typeof window.IntMapDisaster,
    earthReplay: typeof window.IntMapEarthReplay,
    /* the radioactive-dispersion model is the one hazard that stayed, and #R296 gave it the panel
       it had never had — because the wrapper that used to open it is what went away. */
    radiation: Object.keys(window.IntMapRadiation || {}).sort(),
    isotopes: Object.keys((window.IntMapRadiation || {}).ISOTOPES || {}).length,
    /* …and the radio analysis became a MODE of the viewshed rather than a module of its own */
    losMode: typeof (window.IntMapLOS || {}).setMode,
  }));
  expect(d.rf, 'IntMapRF was merged into the viewshed').toBe('undefined');
  expect(d.disaster, 'IntMapDisaster was deleted with three of its four hazards').toBe('undefined');
  expect(d.earthReplay, 'IntMapEarthReplay was deleted — Chronos is that clock').toBe('undefined');
  expect(d.radiation, 'the radioactive-dispersion model opens on its own').toEqual(expect.arrayContaining(['openPanel', 'closePanel', 'isOpen', 'run', 'clear']));
  expect(d.isotopes, 'and it is the real model, not the no-renderer stub').toBeGreaterThan(1);
  expect(d.losMode, 'the radio coverage is a mode of the viewshed now').toBe('function');
});

test('R197 ⑦ the tsunami model is global, and it is the only tsunami there is', async () => {
  const t = await page.evaluate(async () => {
    /* the bundled sea floor, which is what makes a global domain possible */
    const ok = await window.IntMapBathymetry.warm();
    const bs = window.IntMapBathymetry.state();
    /* a few known points, read straight out of the bundled grid */
    const probe = {
      mariana: window.IntMapBathymetry.depthAt(142.2, 11.35),
      midPacific: window.IntMapBathymetry.depthAt(-150, 0),
      sahara: window.IntMapBathymetry.depthAt(10, 25),
      atlantic: window.IntMapBathymetry.depthAt(-30, 30)
    };
    const sea = {
      mariana: window.IntMapBathymetry.seaFractionAt(142.2, 11.35),
      sahara: window.IntMapBathymetry.seaFractionAt(10, 25)
    };
    return { ok, bs, probe, sea };
  });
  expect(t.ok).toBe(true);
  expect(t.bs.width).toBe(1440);
  expect(t.bs.height).toBe(720);
  /* the deepest trench on Earth, averaged over a 28 km cell, is still kilometres deep */
  expect(t.probe.mariana).toBeGreaterThan(5000);
  expect(t.probe.midPacific).toBeGreaterThan(3000);
  expect(t.sea.mariana).toBeGreaterThan(0.9);
  /* and the Sahara is not sea */
  expect(t.sea.sahara).toBeLessThan(0.1);
  expect(t.probe.sahara).toBe(0);

  const api = await page.evaluate(() => {
    const T = window.IntMapTsunami;
    return { keys: Object.keys(T), state: T.state() };
  });
  expect(api.keys).not.toContain('openInundation');
  expect(api.state.worker, 'the solver runs in a worker').toBe(true);
});

test('R197 ⑧ no page errors were logged while all of that happened', async () => {
  const errs = ((diag.pageErrors||[]).concat(diag.consoleErrors||[])).filter(e => !/CORS|Failed to fetch|net::ERR|NetworkError|503|429/i.test(String(e)));
  expect(errs, JSON.stringify(errs.slice(0, 4))).toEqual([]);
});
