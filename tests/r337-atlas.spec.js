/* ============================================================================
 *  #R337 — the expensive half: the starter chips, and the layer that may move the camera
 * ----------------------------------------------------------------------------
 *    ② (now) Atlas renders no starter chips at any country, and .atl-sub is one fixed sentence. (It was: the chips
 *       change when the map moves to a different country — Atlas no longer draws chips.)
 *    ③ switching NATO members on really moves the camera, once, into the treaty area.
 *
 *  ⚠ THIS FILE IS DELIBERATELY NOT `r337.spec.js`. scripts/tiers.mjs puts THE CURRENT ROUND'S
 *  `rNNN.spec.js` in the push gate whatever it costs, and these two claims need the 719 kB Atlas
 *  chunk and the whole country table between them — measured at 22 s and 42 s. A gate that a round
 *  can grow by a minute at a time is the accumulation #R197 exists to stop, so the cheap half keeps
 *  the gate's name and this half runs on the nightly schedule and on the dispatch button (#R203,
 *  and #R207 which took the tier off `push`), which is where it will catch a regression the next
 *  morning rather than never — so run `npm run test:deep` before the PR, because the merge will
 *  not. Same shape as r318-atlas.
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';

test.describe.configure({ mode: 'serial' });
test.setTimeout(120000);

/* (mobile-sheet-layout) 旧②「起動チップが国で変わる」は、Atlas が例示チップ（.atl-chip）を出さなくなったので守る対象が無い（makeAtlasExamples の
   suggestPrompts 経路は単体テストだけが通る）。同じ「地図が別の国へ動いたあとの Atlas の入口」を、いまの事実で守る:
   チップは出ず、説明文（.atl-sub）は決まった 1 文、そして地図が動いても戻らない（国の表を読む再描画が走ったあとも）。 */
test('R337 ②: Atlas draws no starter chips — not at a country, not after the map moves — and says one sentence', async ({ app }) => {
  const page = app.page;
  await page.evaluate(() => window.IntMapLazy.need('atlasConsole'));
  await page.evaluate(() => window.IntMapConsole.open());
  await page.waitForSelector('#atlas-panel .atl-ex', { timeout: 30000 });
  /* the country table arrives on its own schedule; the chips used to be drawn from it, so wait for it before measuring that none appear */
  await page.waitForFunction(() => { try { return (window.countryGeo.features || []).length > 100; } catch (_) { return false; } },
    null, { timeout: 60000 });

  const seenAt = async (lng, lat) => {
    await page.evaluate(([x, y]) => window.__imap.jumpTo({ center: [x, y], zoom: 5 }), [lng, lat]);
    /* the redraw was debounced on the camera's own settle — 600 ms, js/atlas-examples.js */
    await page.waitForTimeout(1500);
    return page.evaluate(() => ({
      chips: document.querySelectorAll('#atlas-panel .atl-chip').length,
      sub: (document.querySelector('#atlas-panel .atl-sub') || {}).textContent || null,
    }));
  };
  const mn = await seenAt(103.8, 46.9);      /* Mongolia */
  const bd = await seenAt(90.4, 23.8);       /* Bangladesh */
  for (const [n, r] of [['Mongolia', mn], ['Bangladesh', bd]]) {
    expect(r.chips, n + ': no starter chip is rendered').toBe(0);
    expect(r.sub, n + ': the one sentence under the title').toBe('Ask in plain language — Atlas drives the map for you.');
  }

  await page.evaluate(() => { try { window.IntMapConsole.close(); } catch (_) {} });
});

test('R337 ③: switching NATO members on takes the camera to the treaty area, once', async ({ app }) => {
  const page = app.page;
  const before = await page.evaluate(() => {
    const c = window.__imap.getCenter();
    return { lng: c.lng, lat: c.lat,
             flown: !!(window.IntMapLayerHome && window.IntMapLayerHome.flown('dl-nato')) };
  });
  expect(before.flown, 'nothing has spent this layer’s one flight yet').toBe(false);

  await page.evaluate(() => { const cb = document.getElementById('dl-nato');
    if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); } });
  await page.waitForFunction(() => window.IntMapLayerHome.flown('dl-nato'), null, { timeout: 60000 });
  await page.waitForTimeout(1400);          /* the flyTo is 900 ms */

  const after = await page.evaluate(() => {
    const c = window.__imap.getCenter();
    return { lng: c.lng, lat: c.lat, home: window.IntMapLayerHome.boxOf('dl-nato'),
             /* ⚠ ONCE PER SESSION — asked of the table itself rather than by toggling the layer a
                second time, which costs twenty seconds and proves the same thing. */
             again: window.IntMapLayerHome.arrive('dl-nato') };
  });
  /* ⚠ THE FRAME IS MEASURED FROM THE LAYER'S OWN GEOMETRY, so the assertion is about the treaty
     area rather than about a number: north of the Tropic of Cancer, North America to Turkey. */
  expect(after.home, 'the table can answer where NATO is').toBeTruthy();
  const hw = after.home[0][0], hs = after.home[0][1], he = after.home[1][0], hn = after.home[1][1];
  expect(hs, 'the south edge is the Tropic of Cancer or above (Article 6)').toBeGreaterThan(20);
  expect(hw, 'the west edge is North America').toBeLessThan(-100);
  expect(he, 'the east edge reaches Turkey').toBeGreaterThan(30);
  expect(hn, 'and the north edge is the Arctic').toBeGreaterThan(60);
  expect(Math.abs(after.lng - before.lng) + Math.abs(after.lat - before.lat),
    'the camera moved').toBeGreaterThan(1);
  expect(after.lng, 'and it moved INTO the frame').toBeGreaterThan(hw - 5);
  expect(after.lng).toBeLessThan(he + 5);
  expect(after.again, 'a second arrival is refused — one flight per session').toBe(false);

  await page.evaluate(() => { const cb = document.getElementById('dl-nato');
    if (cb && cb.checked) { cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true })); } });
});
