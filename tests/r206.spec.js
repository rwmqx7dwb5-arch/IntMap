/* ============================================================================
 *  R206 — the round's browser regression, in ONE page load  (#R206)
 * ----------------------------------------------------------------------------
 *  Three reported defects, each measured in the running app rather than read out of the source:
 *    ① the light launch screen showed the mark as a WHITE tile in an off-white field
 *    ② 「震源地を設置」 was painted in the same accent fill the segmented control uses for "selected",
 *       unconditionally, so it looked permanently on
 *    ③ the satellite tile warmer asked for a zoom level and a host the render path never asks for
 *
 *  ⚠ ONE BOOT. This file is the current round's spec, so it stands in the gate that runs before every
 *  push (scripts/tiers.mjs) and its cost is paid on every one of them.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { loadLazyModules } from './helpers/app.js';

test.describe.configure({ mode: 'serial' });

let page;
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
});
test.afterAll(async () => { await page.close(); });

/* ── ① 「背景と、アイコンの背景が微妙に違う色だからアイコンの背景を背景に合わせて」 ───────
   Read while the launch screen is still up, which is the only moment it exists. The assertion is
   AGREEMENT — the tile's colour is the screen's colour — not a literal, so retuning --bg-color
   cannot silently put the square back. */
test('R206 ① the light launch screen’s mark carries the screen’s own colour', async () => {
  const seen = await page.evaluate(() => {
    const icon = document.querySelector('.boot-icon'), splash = document.querySelector('.boot-splash');
    if (!icon || !splash) return null;
    const a = getComputedStyle(icon), b = getComputedStyle(splash);
    return { theme: document.documentElement.getAttribute('data-theme'),
      iconBg: a.backgroundColor, splashBg: b.backgroundColor, img: a.backgroundImage };
  });
  expect(seen, 'the launch screen is painted before any module runs (#R186)').not.toBeNull();
  expect(seen.theme, 'the config asks for a light context').toBe('light');
  expect(seen.img).toMatch(/IntMap\.Icon_BW-inverted/);
  expect(seen.iconBg, 'the tile under the mark IS the launch screen').toBe(seen.splashBg);
});

/* ── ② 「震源地を設置ボタンがずっと選択中になっているというUIがくそ」 ─────────────────
   The invariant: in this panel the accent FILL means "this mode is selected". An action that has no
   on state must therefore not wear it — measured against the segmented row's own two halves, so the
   test compares the panel with itself rather than with a colour written down here. */
test('R206 ② the ◎ epicentre action is not painted like a selected mode', async () => {
  await page.waitForFunction(() => !!window.__imap, null, { timeout: 90000 });
  /* ⚠ (#R209) THE BOOT SIGNAL CANNOT BE THE SEISMIC MODULE ANY MORE. js/lazy-modules.js took it out
     of the boot bundle, so `window.IntMapSeismic` never appears on its own and this wait would sit
     out its full minute. `IntMapLayers` is still built at boot (tests/smoke.spec.js CRITICAL_GLOBALS),
     so it says the same thing this line always said — the app is up — and the panel is then ASKED for
     the way the app asks for it, rather than waited on. */
  await page.waitForFunction(() => !!window.IntMapLayers, null, { timeout: 60000 });
  await loadLazyModules(page);
  /* ⚠ (#R304) OPENED WITH NO EPICENTRE, WHICH IS THE CASE THAT IS ARMED. This passed one and then
     asserted `clickMode === 'epi'`; #R240 made a panel opened ON an epicentre start disarmed
     (「with no epicentre there is exactly one thing to do」 — with one placed the reader chooses),
     so the answer became 'none' and this file has been red on the nightly ever since. Both halves
     of that rule are asserted below, so the change of argument cannot hide the default. */
  await page.evaluate(() => window.IntMapSeismic.open());
  await page.waitForSelector('#sq-panel .sq-cm-epi', { state: 'visible' });
  const s = await page.evaluate(() => {
    const bg = (sel) => getComputedStyle(document.querySelector(sel)).backgroundColor;
    return { on: bg('.sq-cm-epi'), off: bg('.sq-cm-sta'),
      mode: window.IntMapSeismic.state().clickMode,
      /* (#R212) the separate ◎ action button was merged into the ◎ segment — there is now exactly
         ONE control that places or moves the epicentre, which is what the round was asked for. */
      pickCount: document.querySelectorAll('#sq-panel .sq-pick').length,
      epiCount: document.querySelectorAll('#sq-panel .sq-cm-epi').length };
  });
  expect(s.mode, 'opened with nothing to point at, the map is armed for the epicentre (#R205/#R240)').toBe('epi');
  expect(s.on, 'the selected segment wears the accent fill').not.toBe(s.off);
  expect(s.pickCount, 'the separate ◎ action button is gone (#R212 merged it into the segment)').toBe(0);
  expect(s.epiCount, 'and exactly one control places or moves the epicentre').toBe(1);
  /* ⚠ (#R304) THE OTHER HALF OF #R240's RULE IS NOT ASSERTED HERE, AND THAT IS DELIBERATE. It reads
     「with one already placed, the panel opens quiet」 — but `close()` does not reset the mode, so a
     second `open()` on this same panel inherits the 'epi' the first one armed. Measured: 'epi', not
     'none'. The claim needs a panel that has never been opened, which is what tests/r205.spec.js ①
     has; asserting it here would only be asserting this test's own setup. */
  await page.evaluate(() => window.IntMapSeismic.close());
});

/* ── ③ 「衛星画像の読み込み時の動作を、極限までシームレスに」 ───────────────────────
   MEASURED before the fix: map zoom 12.00, the renderer's Esri requests were all z13, and the warmer
   reported {z:12, bias:0}. The satellite source is tileSize:256, so MapLibre's level is zoom+1 and a
   warmer one level shallower can never hit. Asserted as the RELATION between the two numbers. */
test('R206 ③ the satellite warmer asks for the level and the host the render path asks for', async () => {
  /* ⚠ (#R304) through the facade — #R224 made the Atlas kernel lazy, so the bare global is undefined
     until something asks, and the try/catch here turned that into a silent no-op. */
  await page.evaluate(() => { try { window.IntMapAtlas.call('dispatch', { type: 'base', mode: 'satellite' }); } catch (_) {} });
  await page.waitForFunction(() => !!(window.IntMapSatProto && window.IntMapSatProto.netLevelBias), null, { timeout: 60000 });

  const proto = await page.evaluate(() => {
    const P = window.IntMapSatProto;
    /* the host must follow (x+y)&1 — the rule src/sat-worker.js and js/sat-proto.js share */
    const pick = (z, y, x) => (new URL(P.tileUrl(z, y, x))).hostname;
    return { bias: P.netLevelBias(), hiDPI: P.hiDPI(),
      even: pick(13, 1000, 1000), odd: pick(13, 1000, 1001) };
  });
  expect(proto.bias, 'a 256-px source is fetched one level below the map zoom').toBeGreaterThanOrEqual(1);
  expect(proto.bias, 'and one more again when the @2x stitch is on').toBe(proto.hiDPI ? 2 : 1);
  expect(proto.even).not.toBe(proto.odd);

  const zoom = 11;
  await page.evaluate((z) => window.__imap.jumpTo({ center: [139.79, 35.70], zoom: z, pitch: 0, bearing: 0 }), zoom);
  await page.waitForFunction(() => {
    const f = window._imPredictivePrefetch; return !!(f && f.lastLevel);
  }, null, { timeout: 30000 });
  const rep = await page.evaluate(() => ({ ...window._imPredictivePrefetch.lastLevel,
    z0: Math.round(window.__imap.getZoom()) }));
  expect(rep.z, 'the warmed level is the level the render path will ask for')
    .toBe(rep.z0 + proto.bias);
});
