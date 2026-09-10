/* ============================================================================
 *  R664 — the same phone, turned sideways, must get the same budgets
 * ----------------------------------------------------------------------------
 *  Everything the node checks (tests/r664-checks.test.mjs) can assert, they assert about the SOURCE:
 *  which predicate a line consults, and that no line anywhere picks a number from a width. What they
 *  cannot do is answer the question the report actually asked — 「横向きにすると別の端末として扱わ
 *  れているのではないか」 — because that is a fact about a laid-out page in a real engine, and the
 *  predicate at the bottom of it (`matchMedia('(pointer:coarse)')`, `window.screen`) only means
 *  anything once a browser has decided what the device is.
 *
 *  ⚠ THE ORIENTATION IS THE ONLY VARIABLE — AND IT IS ONE PAGE, ROTATED, NOT TWO PAGES.
 *  A second context would boot a second app, and then "the two columns agree" would also depend on
 *  two boots having agreed about everything else. Rotating one live page removes that: the device
 *  emulation, the storage, the engine and the module instances are numerically the same objects,
 *  and the ONLY thing that changed between the two readings is `window.innerWidth`. Every answer
 *  checked here is one about the DEVICE, which does not change when a phone is turned sideways.
 *  ⚠ It is also what keeps this spec inside the gate's time budget: the round's own spec always
 *  stands in the core tier (scripts/tiers.mjs `currentRoundSpec`), and a second boot cost more than
 *  the whole gate is allowed (tests/r204 ①b, scripts/test-budget.mjs).
 *
 *  ⚠⚠ WHAT THIS FILE DOES **NOT** CATCH, SAID PLAINLY RATHER THAN IMPLIED.
 *  #R664's defect was never that `_imPhoneClass()` gave a wrong answer — it has been correct since
 *  #R232, and every assertion below about it would have PASSED on the broken tree. The defect was
 *  that thirty-nine CALLERS did not ask it, and a caller's private `const budget = _mob?110:420` is
 *  not reachable from a page. So the two halves of this round are checked in the two places that can
 *  actually see them, and neither is evidence for the other:
 *      · tests/r664-checks ③ walks every tracked file and proves NO caller picks a number by width.
 *        That is where the thirty-nine were found and where a fortieth will be.
 *      · this file proves the answer those callers now ask is itself orientation-invariant in a real
 *        engine — which a source check cannot know, because `(pointer:coarse)` and `window.screen`
 *        mean nothing until a browser has decided what the device is.
 *  Claiming this file re-measures the defect would be the same overstatement that let #R498's
 *  eight `assert.match` calls stand for a rule they never covered.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { seededStorageState } from './helpers/session-seed.js';

const BOOT = { timeout: 90_000 };

/* ⚠ THE SEED IS CARRIED EXPLICITLY, because this spec opens its own contexts. Without it both
   contexts get the unseeded first-visit boot — the two thematic default layers come on and each
   pays #R186's 9,160 ms — and this spec would be doing it twice, by accident, for a question that
   has nothing to do with a first visit (tests/r201 ④b). */
const SEED = seededStorageState();

/* an iPhone 13, described once. `isMobile`+`hasTouch` are what make the engine report
   `(pointer:coarse)` and no `(any-pointer:fine)`, which is what the predicate reads. */
const PHONE = {
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 '
    + '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
};

/* what the page answers about the device and about what it may hold. Everything here is public
   surface the app already exposes — nothing was added to the product to make this measurable. */
async function budgets(page) {
  return page.evaluate(() => {
    const B = window.IntMapMemBudget;
    return {
      viewport: [window.innerWidth, window.innerHeight],
      /* the predicate itself */
      phone: !!(window._imPhoneClass && window._imPhoneClass()),
      touchPrimary: !!(window._imTouchPrimary && window._imTouchPrimary()),
      /* the budget it governs */
      demPhotoSearch: B ? B.demTiles('photoSearch') : null,
      demCesium: B ? B.demTiles('cesium') : null,
      demTerrainEdit: B ? B.demTiles('terrainEdit') : null,
      budgetSaysPhone: B ? B.isPhone() : null,
    };
  });
}

test.describe('R664 the device does not change when the phone is rotated', () => {
  test('portrait and landscape agree on every budget', async ({ browser }) => {
    test.setTimeout(180_000);

    const ctx = await browser.newContext({ ...PHONE, storageState: SEED, viewport: { width: 390, height: 844 } });
    let portrait, landscape;
    try {
      const page = await ctx.newPage();
      /* ⚠ NO `?rafshim=1` HERE, DELIBERATELY. That flag replaces requestAnimationFrame with a 33 ms
         timer so that frame-counting specs are deterministic; this spec counts no frames, and the
         shim only makes everything the boot does slower. The round's own spec stands in the gate,
         so a second it does not need is a second the gate cannot have (scripts/test-budget.mjs). */
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      /* ⚠ WAIT FOR WHAT THIS SPEC ACTUALLY ASKS, WHICH IS NOT THE RENDERER. The subject is the
         device predicate and the tile budget; both are answered by modules that are up long before
         the map has a first frame. Waiting for `IntMapGeoEngine.ready()` cost this spec ~35 s of
         renderer boot it never interrogates — and the round's own spec stands in the GATE
         (scripts/tiers.mjs), whose whole budget is smaller than that (scripts/test-budget.mjs).
         Paying for a wait whose result is never read is exactly what that budget exists to refuse. */
      await page.waitForFunction(
        () => !!(window.IntMapMemBudget && window._imPhoneClass && window._imTouchPrimary), null, BOOT);
      portrait = await budgets(page);
      /* turn the phone sideways. No reload: the point is that the SAME live app, with the same
         module instances, must not change its mind about what device it is running on. */
      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForTimeout(120);
      landscape = await budgets(page);
    } finally {
      await ctx.close();
    }

    /* the emulation really did rotate the same device */
    expect(portrait.viewport).toEqual([390, 844]);
    expect(landscape.viewport).toEqual([844, 390]);

    /* ⚠ This pair was already true before #R664 — see the header. It is here because it is the
       PREMISE the thirty-nine fixed callers now rest on: if `_imPhoneClass()` ever starts answering
       by viewport, every one of them silently goes back to the desktop budget at once. */
    expect(portrait.phone, 'the emulated phone did not read as a phone even in portrait — '
      + 'the emulation is wrong, not the app').toBe(true);
    expect(landscape.phone, 'an iPhone held sideways is still an iPhone; `_imPhoneClass()` said '
      + 'otherwise, so every cost decision in the app just took the workstation budget').toBe(true);

    /* the finger is still the only pointer, so tap tolerance must not shrink (js/map-ui.js,
       js/map-readout.js, js/time-borders.js — 15 px, not the 6 px a mouse gets) */
    expect(landscape.touchPrimary, 'the tap tolerance collapsed to the mouse box in landscape')
      .toBe(portrait.touchPrimary);

    /* and the ceilings the report is about */
    expect(landscape.budgetSaysPhone).toBe(true);
    for (const k of ['demPhotoSearch', 'demCesium', 'demTerrainEdit']) {
      expect(landscape[k], `${k} differs between portrait and landscape on the same device`)
        .toBe(portrait[k]);
      expect(portrait[k], `${k} is not a number — js/mem-budget.js did not reach the page`)
        .toBeGreaterThan(0);
    }

    /* ⚠ THE CONTROL THAT IS **NOT** HERE, AND WHY. The renderer's own `maxTileCacheSize` would be a
       good third column — #R232 moved it onto the device, so it must agree across the two readings.
       Reading it means waiting for the map to exist, which is the ~35 s this spec deliberately does
       not pay (see the wait above). It is covered where it is cheap: tests/r664-checks ③ proves no
       caller anywhere picks a number by width, that one included. */
  });
});
