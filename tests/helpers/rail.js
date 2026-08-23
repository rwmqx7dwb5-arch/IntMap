/* ============================================================================
 *  IntMap · turning the railway layer on, for the two #R388 specs
 * ----------------------------------------------------------------------------
 *  ⚠ IDEMPOTENT, AND SHARED BY BOTH FILES. The `app` fixture is worker-scoped, so locally the
 *  second spec inherits the layer the first switched on — but CI SHARDS the suite, and a shard that
 *  gets only the second one would wait forever for a layer nobody asked for. #R353 measured exactly
 *  that: «Target page has been closed» after a 60 s wait. Calling it twice in one page costs one
 *  `if`, so both call it.
 * ==========================================================================*/

/** Switch on `beta-dl-rail` and wait for the world file to be parsed. */
export async function railLayerOn(page) {
  await page.waitForFunction(() => document.querySelectorAll('.lyr-row').length > 100, null, { timeout: 60000 });
  /* ⚠ THE ROW TOGGLES ON pointerdown, NOT ON THE CHECKBOX'S click (#R37). */
  await page.evaluate(() => {
    const cb = document.getElementById('beta-dl-rail');
    if (cb && !cb.checked) {
      const row = cb.closest('label') || cb.closest('.lyr-row') || cb.parentElement;
      ['pointerdown', 'pointerup'].forEach((t) =>
        row.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 1 })));
    }
  });
  /* the module is lazy and the world file is megabytes of gzip — wait for the DATA, not for a timer */
  await page.waitForFunction(() => !!(window.IntMapRailways && window.IntMapRailways.count() > 1000), null, { timeout: 90000 });
}
