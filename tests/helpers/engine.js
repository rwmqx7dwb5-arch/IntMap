/* ============================================================================
 *  IntMap · BOOTING A SPEC ON A CHOSEN RENDERER, IN ONE PAGE LOAD  (#R201)
 * ----------------------------------------------------------------------------
 *  「毎回毎回、テストに時間がかかりすぎ。いい加減にしろ。」
 *
 *  Eight spec files — every Cesium one, plus r185 and r186 — booted their engine like this:
 *
 *      await page.goto('/');                                   // ← a whole app boot…
 *      await page.evaluate(() => localStorage.setItem('intmap_engine', 'cesium'));
 *      await page.reload();                                    // ← …thrown away, and another one
 *
 *  The app reads `intmap_engine` at load, so the choice cannot be made after the load that has to
 *  honour it — hence the reload. But those are the SLOWEST specs in the suite (r182-cesium alone is
 *  650 s of the 5,168 s total), and this pattern makes every one of their tests pay for TWO boots,
 *  one of which exists only to write a string into localStorage.
 *
 *  ⚠ WHY NOT `addInitScript` BEFORE — AND WHY IT IS FINE NOW. tests/r180-cesium.spec.js wrote the
 *  reason down: an init script survives `page.reload()`, so a test that switches BACK to MapLibre by
 *  writing the key and reloading would be silently overruled by the seed and would keep testing
 *  Cesium — a green test asserting nothing. The guard below is what makes it safe: the seed only
 *  writes the key IF NOTHING HAS WRITTEN IT. A later `localStorage.setItem` + reload therefore wins,
 *  which is exactly the behaviour those tests are about.
 *
 *  ⚠ AND A FAILED SEED CANNOT PASS QUIETLY. Every caller waits for `IntMapGeoEngine.id()` to BE the
 *  engine it asked for, so if this helper ever stopped working the specs would time out rather than
 *  run against the wrong renderer.
 * ==========================================================================*/

/** Seed the renderer choice so the FIRST page load already honours it. */
export async function seedEngine(page, engine) {
  await page.addInitScript((e) => {
    try { if (localStorage.getItem('intmap_engine') == null) localStorage.setItem('intmap_engine', e); } catch (_) { /* ignore */ }
  }, engine);
}

/**
 * Boot the app on `engine` in one page load and wait until it can draw.
 * @param {import('@playwright/test').Page} page
 * @param {'cesium'|'maplibre'} engine
 * @param {{url?: string, timeout?: number}} [opts]
 */
export async function bootEngine(page, engine, opts) {
  const url = (opts && opts.url) || '/?rafshim=1';
  const timeout = (opts && opts.timeout) || 120_000;
  await seedEngine(page, engine);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction((e) => !!window.__imap && !!window.IntMapGeoEngine
    && typeof window.IntMapGeoEngine.id === 'function' && window.IntMapGeoEngine.id() === e, engine, { timeout });
  await page.waitForFunction(() => window.IntMapGeoEngine.canDraw(), null, { timeout });
}
