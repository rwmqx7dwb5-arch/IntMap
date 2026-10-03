/* ============================================================================
 *  IntMap · ux-next — the command palette, the company footprint and the Wikipedia lookup, in a browser
 * ----------------------------------------------------------------------------
 *  What the node checks (tests/ux-next-checks.test.mjs) cannot see:
 *   ①  Ctrl/⌘+K opens the palette over a running app; a layer, an action and a place are found by what the
 *      reader types; Enter on a layer switches the registry's own checkbox; a place flies the camera there;
 *      Escape closes it and the list is what the registry, the kernel and the device hold right now.
 *   ②  the company footprint draws every published site (the renderer's own count equals the file's rows), a
 *      group switch on its card takes that group off the map, the card counts what is in view, and closing it
 *      takes the source and the card down.
 *   ③  the place popup's Wikipedia button asks by the feature's query fields: for OSM's composite Libya label it
 *      asks en «Libya» and never the three-script display name, and the button appears.
 *  One page, one load.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { BASE } from './helpers/session-seed.js';

test.describe.configure({ mode: 'serial' });
let page;
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(BASE + '/?rafshim=1');
  await page.waitForFunction(() => window.__imBoot && window.__imBoot.isDone(), null, { timeout: 60000 });
});
test.afterAll(async () => { await page?.close(); });

test('① Ctrl/⌘+K: one field finds a layer, an action and a place, and each choice runs its owner\'s path', async () => {
  test.setTimeout(120000);
  await page.keyboard.press('Control+k');
  const box = page.locator('#im-palette');
  await expect(box).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#cp-input')).toBeFocused();
  /* the empty field: example maps to start from, and Atlas last */
  await expect(box.locator('.cp-row[data-kind="example"]').first()).toBeVisible();
  await expect(box.locator('.cp-row').last()).toHaveAttribute('data-kind', 'atlas');

  /* a layer, named the way the panel names it, switched through the registry's own checkbox */
  const layer = await page.evaluate(() => {
    const hidden = new Set(window.IntMapHiddenLayerRows || []);
    const cb = [...document.querySelectorAll('#layer-dropdown input[type=checkbox]')].find((c) => c.id && !hidden.has(c.id) && !c.checked && /night/i.test(c.closest('.lyr-row,label')?.textContent || ''));
    return cb ? { id: cb.id } : null;
  });
  expect(layer, 'a «night» row in the registry').not.toBeNull();
  await page.locator('#cp-input').fill('night');
  const lrow = box.locator('.cp-row[data-kind="layer"]').first();
  await expect(lrow).toBeVisible();
  const lid = await page.evaluate(() => { const rows = [...document.querySelectorAll('#im-palette .cp-row')]; return rows.findIndex((r) => r.dataset.kind === 'layer'); });
  for (let i = 0; i < lid; i++) await page.keyboard.press('ArrowDown');
  const want = await page.evaluate(() => document.querySelector('#im-palette .cp-row.on .cp-t').textContent);
  await page.keyboard.press('Enter');
  await expect(box).toBeHidden();
  const lit = await page.evaluate((w) => [...document.querySelectorAll('#layer-dropdown input[type=checkbox]')].filter((c) => c.checked).some((c) => (c.closest('.lyr-row,label')?.textContent || '').replace(/\s+/g, ' ').includes(w)), want);
  expect(lit, 'the chosen row «' + want + '» is now on').toBe(true);

  /* an action: a kernel command bound to a control, named by that control */
  await page.keyboard.press('Control+k');
  await page.locator('#cp-input').fill('pandemic');
  await expect(box.locator('.cp-row[data-kind="action"]').first()).toBeVisible();
  /* …and the command with a title that has no control on screen yet (the company footprint) */
  await page.locator('#cp-input').fill('company sites');
  await expect(box.locator('.cp-row[data-kind="action"] .cp-t', { hasText: 'Company sites map' })).toHaveCount(1);

  /* a place on the device, flown to by the search's own flight */
  await page.locator('#cp-input').fill('Japan');
  const prow = box.locator('.cp-row[data-kind="place"]').first();
  await expect(prow).toBeVisible({ timeout: 15000 });
  await prow.click();
  await expect(box).toBeHidden();
  await expect.poll(async () => page.evaluate(() => { const c = window.IntMapGeoEngine.camera.getCenter(); return c.lng > 125 && c.lng < 150 && c.lat > 25 && c.lat < 46; }), { timeout: 15000 }).toBe(true);

  /* Escape closes it */
  await page.keyboard.press('Control+k');
  await expect(box).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(box).toBeHidden();
});

test('② the company footprint draws every published site, filters by group, counts what is in view, and closes', async () => {
  test.setTimeout(120000);
  const st = await page.evaluate(() => window.IntMapOS.exec('company.footprint', { source: 'test' }));
  expect(st.ok, JSON.stringify(st)).toBe(true);
  const fileRows = await page.evaluate(async () => (await (await fetch('data/companies/footprint.json')).json()).f.length);
  expect(st.drawn).toBe(fileRows);
  await expect.poll(async () => page.evaluate(() => { const r = window.IntMapGeoEngine.render.drawn({ owners: ['map.companySites'] }); const s = r && r.surfaces['co-fp-src']; return s ? s.features : -1; }), { timeout: 20000 }).toBe(fileRows);
  const panel = page.locator('#co-fp-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.cfp-vh')).toContainText(/In view: \d+ sites/);
  /* switching the headquarters off takes them off the map — the cluster source is re-derived, not filtered */
  const hq = await page.evaluate(() => window.IntMapCompanyFootprint.query({ groups: ['hq'] }).then((q) => q.sites));
  await panel.locator('[data-cfp-group="hq"]').click();
  await expect.poll(async () => page.evaluate(() => window.IntMapCompanyFootprint.state().drawn)).toBe(fileRows - hq);
  /* «who is here»: Japan, read without drawing */
  const jp = await page.evaluate(() => window.IntMapCompanyFootprint.query({ cc: 'JPN', limit: 5 }));
  expect(jp.sites).toBeGreaterThan(0);
  expect(jp.companies.length).toBeGreaterThan(0);
  await panel.locator('.cfp-x').click();
  await expect(panel).toHaveCount(0);
  expect(await page.evaluate(() => window.IntMapGeoEngine.layers.hasSource('co-fp-src'))).toBe(false);
});

test('③ the place popup asks Wikipedia by the feature\'s query fields, not its display name', async () => {
  const asked = [];
  await page.route(/wikipedia\.org\/api\/rest_v1\/page\/summary\//, (route) => {
    const u = decodeURIComponent(route.request().url()); asked.push(u);
    if (/\/summary\/Libya$/.test(u)) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'standard', title: 'Libya', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Libya' } } }) });
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
  await page.evaluate(() => window._imPlacePopup({ lng: 17, lat: 27 }, 'ⵍⵉⴱⵢⴰ ليبيا Libya', true,
    { noOutline: true, title: 'Libya', props: { name: 'ⵍⵉⴱⵢⴰ ليبيا Libya', 'name:en': 'Libya', 'name:ja': 'リビア', name_int: 'Libya' } }));
  await expect.poll(() => asked.length, { timeout: 15000, message: 'the lookup asked Wikipedia' }).toBeGreaterThan(0);
  await expect(page.locator('.plc-popup .plc-wiki'), 'asked: ' + asked.join(' | ')).toBeVisible({ timeout: 15000 });
  expect(asked.some((u) => /ⵍⵉⴱⵢⴰ/.test(u)), 'the display name was asked: ' + asked.join(' | ')).toBe(false);
  expect(asked[0]).toMatch(/en\.wikipedia\.org\/api\/rest_v1\/page\/summary\/Libya$/);
  await page.unroute(/wikipedia\.org/);
});
