/* ============================================================================
 *  #R337 — the expensive half: the starter chips, and the layer that may move the camera
 * ----------------------------------------------------------------------------
 *    ② the starter chips really change when the map moves to a different country — measured with
 *       the country's own name taken back out, because two mail-merged copies of one sentence are
 *       never the same string and that is exactly the illusion this round is about.
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

test('R337 ②: the starter chips change when the map moves to a different country', async ({ app }) => {
  const page = app.page;
  await page.evaluate(() => window.IntMapLazy.need('atlasConsole'));
  await page.evaluate(() => window.IntMapConsole.open());
  await page.waitForSelector('#atlas-panel .atl-ex', { timeout: 30000 });
  /* the pool reads the country table, which arrives on its own schedule */
  await page.waitForFunction(() => { try { return (window.countryGeo.features || []).length > 100; } catch (_) { return false; } },
    null, { timeout: 60000 });

  const chipsAt = async (lng, lat) => {
    await page.evaluate(([x, y]) => window.__imap.jumpTo({ center: [x, y], zoom: 5 }), [lng, lat]);
    /* the redraw is debounced on the camera's own settle — 600 ms, js/atlas-examples.js */
    await page.waitForTimeout(1500);
    return page.evaluate(() => Array.from(document.querySelectorAll('#atlas-panel .atl-chip')).map((b) => b.textContent));
  };
  const mn = await chipsAt(103.8, 46.9);      /* Mongolia — the emptiest country on Earth */
  const bd = await chipsAt(90.4, 23.8);       /* Bangladesh — near the other end of the same tables */

  expect(mn.length, 'Mongolia gets four chips').toBe(4);
  expect(bd.length, 'Bangladesh gets four chips').toBe(4);
  for (const c of mn.concat(bd)) expect(c, 'no chip ships an unfilled placeholder: ' + c).not.toMatch(/[{}]/);

  /* ⚠ THE NAME COMES OUT BEFORE COMPARING. With it in, two copies of ONE sentence are two different
     strings and every pair of countries looks distinct — which is the illusion this round is about.
     The names are read the way the chips themselves read them (js/app-body.js `cName`). */
  const names = await page.evaluate(() => {
    const html = (document.documentElement.lang || 'en').toLowerCase();
    const lang = html === 'ja' ? 'jp' : html.split('-')[0];
    const en = (a3) => { try {
      const f = (window.countryGeo.features || []).find((x) => String(x.id) === a3);
      const p = (f && f.properties) || {}; return p.NAME_EN || p.ADMIN || p.NAME || '';
    } catch (_) { return ''; } };
    const nm = (a3, a2) => {
      if (lang !== 'en' && window._imCldrRegion) { try { const n = window._imCldrRegion(a2, lang); if (n) return n; } catch (_) {} }
      return en(a3);
    };
    return { lang, mng: nm('MNG', 'MN'), bgd: nm('BGD', 'BD') };
  });
  /* if the mask misses, every comparison below passes for the wrong reason — so prove it fired */
  expect(mn.some((c) => names.mng && c.includes(names.mng)),
    'the chips really name Mongolia (' + names.mng + ', lang ' + names.lang + ')').toBe(true);
  expect(bd.some((c) => names.bgd && c.includes(names.bgd)),
    'and Bangladesh (' + names.bgd + ')').toBe(true);

  const mask = (n, l) => l.map((s) => s.split(n).join('{}'));
  const a = mask(names.mng, mn), b = new Set(mask(names.bgd, bd));
  const shared = a.filter((x) => b.has(x));
  expect(shared.length,
    'two countries at opposite ends of the same distributions are not asked the same questions: '
    + JSON.stringify(shared)).toBeLessThanOrEqual(2);

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
