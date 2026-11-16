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
 *   ④⑤ (wave4-companies) companies between countries: the sites card's button opens the ties card; the world reading
 *      draws one line per country pair (the renderer's own count under 'map.companyTies'); a country shades its partners,
 *      the direction and the factory filter change the pairs drawn, and closing takes both sources and the card down.
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
  /* (wave2-prod-fixes) …and the commands a tool row names (the Tools panel — `data-act`, no `btn`, no `title`). MEASURED on
     production: «radiation» and «plume» found no plume simulator, and none of the eight was in the palette. Every tool row
     whose command the kernel holds is found by its own name, and «radiation» by the capability registry's spelling. */
  const tools = await page.evaluate(() => [...document.querySelectorAll('.lst-toolrow[data-act]')].filter((r) => window.IntMapOS.has(r.dataset.act))
    .map((r) => ({ id: r.dataset.act, name: r.querySelector('b').textContent.trim() })));
  expect(tools.length, 'the Tools panel has tool rows').toBeGreaterThan(5);
  for (const tl of tools) {
    await page.locator('#cp-input').fill(tl.name);
    await expect(box.locator('.cp-row[data-kind="action"] .cp-t', { hasText: tl.name }).first(), tl.id + ' is in the palette by its name').toBeVisible();
  }
  const plume = tools.find((x) => x.id === 'sim.radiation');
  expect(plume, 'the plume simulator has a tool row').toBeTruthy();
  for (const q of ['radiation', 'plume']) {
    await page.locator('#cp-input').fill(q);
    await expect(box.locator('.cp-row[data-kind="action"] .cp-t', { hasText: plume.name }).first(), '«' + q + '» finds ' + plume.name).toBeVisible();
  }

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

/* ══ ④⑤ (wave4-companies) COMPANIES BETWEEN COUNTRIES — js/company-ties.js, on the page the footprint already loaded ══ */
const drawn = (id) => page.evaluate((src) => { const r = window.IntMapGeoEngine.render.drawn({ owners: ['map.companyTies'] }); const s = r && r.surfaces[src]; return s ? s.features : -1; }, id);

test('④ (wave4-companies) from the sites card to the world network: one line per pair, the card says the reading query() gives', async () => {
  test.setTimeout(120000);
  const st = await page.evaluate(() => window.IntMapOS.exec('company.footprint', { source: 'test' }));
  expect(st.ok, JSON.stringify(st)).toBe(true);
  await page.locator('#co-fp-panel .cfp-ties').click();
  const panel = page.locator('#co-ties-panel');
  await expect(panel).toBeVisible();
  await expect(page.locator('#co-fp-panel')).toHaveCount(0);
  const w = await page.evaluate(() => window.IntMapCompanyTies.query({}));
  expect(w.kind).toBe('world');
  expect(w.pairs.length).toBeGreaterThan(100);
  const undrawn = await page.evaluate(() => window.IntMapCompanyTies.state().undrawn.length);
  await expect.poll(() => drawn('co-ties-line-src'), { timeout: 20000 }).toBe(w.pairs.length - undrawn);
  await expect(panel.locator('.cti-sum')).toContainText(String(w.cross.sites) + ' of ' + String(w.sites));
});

test('⑤ (wave4-companies) a country: partners shaded, direction and kind of site change the pairs, closing takes it all down', async () => {
  test.setTimeout(120000);
  const panel = page.locator('#co-ties-panel');
  await panel.locator('select.cti-cc').selectOption('JPN');
  const inJ = await page.evaluate(() => window.IntMapCompanyTies.query({ country: 'JPN', direction: 'in' }));
  await expect.poll(() => drawn('co-ties-line-src'), { timeout: 20000 }).toBe(inJ.partners.length);
  /* the partners plus Japan itself are shaded (Natural Earth outlines, one or more features per country) */
  await expect.poll(() => drawn('co-ties-fill-src'), { timeout: 20000 }).toBeGreaterThan(inJ.partners.length);
  await panel.locator('[data-cti-dir="out"]').click();
  const outJ = await page.evaluate(() => window.IntMapCompanyTies.query({ country: 'JPN', direction: 'out' }));
  expect(outJ.cross.sites).toBeGreaterThan(0);
  await expect.poll(() => drawn('co-ties-line-src'), { timeout: 20000 }).toBe(outJ.partners.length);
  await expect(panel.locator('.cti-list > li')).toHaveCount(outJ.partners.length);
  await panel.locator('select.cti-grp').selectOption('factory');
  const fac = await page.evaluate(() => window.IntMapCompanyTies.query({ country: 'JPN', direction: 'out', groups: ['factory'] }));
  expect(fac.sites).toBeLessThan(outJ.sites);
  await expect.poll(() => drawn('co-ties-line-src'), { timeout: 20000 }).toBe(fac.partners.length);
  await panel.locator('.cti-x').click();
  await expect(panel).toHaveCount(0);
  expect(await page.evaluate(() => [window.IntMapGeoEngine.layers.hasSource('co-ties-line-src'), window.IntMapGeoEngine.layers.hasSource('co-ties-fill-src')])).toEqual([false, false]);
});
