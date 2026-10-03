/* ============================================================================
 *  IntMap · map-next — the reader's own map, end to end in the shipped page
 * ----------------------------------------------------------------------------
 *  Layers ▸ Tools ▸ My map → draw a pin, a line and an area by clicking the map → name and note them → the
 *  address bar carries the drawing → a second reader opens the link and sees it read-only → keeps a copy →
 *  the author's reload brings it back → a GeoJSON file is downloaded → «Use in analysis» makes a dataset that
 *  says who drew it. And on a phone the panel's controls are where a finger can reach them.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';

async function boot(page, url) {
  await page.goto(url || '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__imap && window.__imap.isStyleLoaded(), null, { timeout: 60_000 });
}
/* a point ON THE EARTH: the screen position of the map's centre, offset by a fraction of 200 px — at the zoom a page
   opens on, the globe's disc is wider than that, so every point here is on the globe and in the part of the map a
   reader can see (the sidebar and the panel are left and right of it) */
async function at(page, fx, fy) {
  const c = await page.evaluate(() => { const r = window.__imap.getCanvas().getBoundingClientRect(); const p = window.__imap.project(window.__imap.getCenter()); return { x: r.left + p.x, y: r.top + p.y }; });
  return { x: c.x + (fx - 0.5) * 200, y: c.y + (fy - 0.5) * 200 };
}
/* a point NOT on the Earth: the top-left corner of the visible map, which at that zoom is the black space round the globe */
async function offEarth(page) {
  return page.evaluate(() => {
    const b = document.getElementById('map-container').getBoundingClientRect();
    const sb = document.getElementById('sidebar'); const sr = sb && sb.checkVisibility() ? sb.getBoundingClientRect() : null;
    const left = Math.max(b.left, sr && sr.left <= b.left + 4 ? sr.right : b.left);
    return { x: left + 12, y: b.top + 70 };
  });
}

test('my map: draw, name, link, receive, keep, reload, export, analyse', async ({ page, browser }) => {
  test.setTimeout(180_000);
  await boot(page);
  /* the door a reader presses: the row in Layers ▸ Tools */
  await page.evaluate(async () => { try { window.IntMapLayerSidebar.open(); } catch (_) { } await new Promise((r) => setTimeout(r, 1200)); });
  await page.locator('.lst-toolrow[data-act="tool.myMap"]:visible').first().click();
  await page.evaluate(() => { try { window.IntMapLayerSidebar.close(); } catch (_) { } });
  const panel = page.locator('#im-mymap');
  await expect(panel).toBeVisible({ timeout: 20_000 });

  /* a pin — and a press in the black space beside the globe is not a place (the renderer would still unproject one) */
  await panel.locator('[data-mm="draw"][data-kind="pin"]').click();
  let p = await offEarth(page);
  await page.mouse.click(p.x, p.y);
  await expect(panel).toContainText('off the Earth');
  await expect(panel.locator('li[data-fid]')).toHaveCount(0);
  p = await at(page, 0.3, 0.45); await page.mouse.click(p.x, p.y);
  await expect(panel.locator('li[data-fid]')).toHaveCount(1);
  await panel.locator('li[data-fid] input[data-mm-f="name"]').first().fill('Meeting point');
  await panel.locator('li[data-fid] textarea[data-mm-f="note"]').first().fill('8:30 at the gate');
  /* a line: three clicks, then a double-click on the last */
  await panel.locator('[data-mm="draw"][data-kind="line"]').click();
  for (const [fx, fy] of [[0.15, 0.3], [0.25, 0.35], [0.35, 0.3]]) { p = await at(page, fx, fy); await page.mouse.click(p.x, p.y); await page.waitForTimeout(120); }
  await page.mouse.dblclick(p.x, p.y);
  await expect(panel.locator('li[data-fid]')).toHaveCount(2);
  /* an area: four corners, then the first again */
  await panel.locator('[data-mm="draw"][data-kind="area"]').click();
  const corners = [[0.1, 0.6], [0.3, 0.6], [0.3, 0.8], [0.1, 0.8], [0.1, 0.6]];
  for (const [fx, fy] of corners) { p = await at(page, fx, fy); await page.mouse.click(p.x, p.y); await page.waitForTimeout(120); }
  await expect(panel.locator('li[data-fid]')).toHaveCount(3);
  const meas = await panel.locator('.mm-meas').allTextContents();
  expect(meas[1]).toMatch(/km|mi/); expect(meas[2]).toMatch(/km²|ha|m²|mi²|ac/);

  await page.screenshot({ path: 'C:/Users/gyuuk/AppData/Local/Temp/map-next-desktop.png' });
  /* on the map, measured by the renderer */
  const st = await page.evaluate(() => window.IntMapMyMap.state());
  expect(st.shown).toBe('own'); expect(st.features.map((f) => f.kind)).toEqual(['pin', 'line', 'area']);
  expect(st.features[0].note).toBe('8:30 at the gate');
  await page.waitForTimeout(400);
  const kinds = await page.evaluate(() => [...new Set(window.__imap.queryRenderedFeatures({ layers: ['mymap-fill', 'mymap-line', 'mymap-pt'] }).map((f) => f.layer.id))].sort());
  expect(kinds).toEqual(expect.arrayContaining(['mymap-fill', 'mymap-line']));
  const types = await page.evaluate(() => window.__imap.getSource('mymap-src').serialize().data.features.map((f) => f.geometry.type));
  expect(types).toHaveLength(3); expect(types).toContain('Point');
  /* the label of the named pin is on the map; the unnamed shapes carry none */
  expect(await page.evaluate(() => window.__imap.getSource('mymap-lbl-src').serialize().data.features.map((f) => f.properties.name))).toEqual(['Meeting point']);

  /* the address bar carries it (the words are written once typing pauses) */
  await page.waitForFunction(() => /[#&]mm=/.test(location.hash), null, { timeout: 10_000 });
  const link = await page.evaluate(() => window.IntMapMyMap.link());
  expect(link.ok).toBe(true);

  /* a second reader opens the link */
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page2 = await ctx2.newPage();
  await boot(page2, link.url.replace(/^https?:\/\/[^/]+/, ''));
  const panel2 = page2.locator('#im-mymap');
  await expect(panel2).toBeVisible({ timeout: 20_000 });
  await expect(panel2.locator('.mm-recv')).toBeVisible();
  await expect(panel2.locator('li[data-fid]')).toHaveCount(3);
  await page2.waitForTimeout(800); await page2.screenshot({ path: 'C:/Users/gyuuk/AppData/Local/Temp/map-next-received.png' });
  await expect(panel2).toContainText('Meeting point'); await expect(panel2).toContainText('8:30 at the gate');
  const st2 = await page2.evaluate(() => window.IntMapMyMap.state());
  expect(st2.shown).toBe('received'); expect(st2.showing.id).toBe(st.map.id);
  /* read-only until kept; keeping makes a copy under a new identifier */
  expect(await page2.evaluate(() => window.IntMapMyMap.add({ kind: 'pin', coords: [[0, 0]] }).reason)).toBe('received');
  await panel2.locator('[data-mm="keep"]').click();
  const st3 = await page2.evaluate(() => window.IntMapMyMap.state());
  expect(st3.shown).toBe('own'); expect(st3.map.id).not.toBe(st.map.id); expect(st3.map.count).toBe(3);
  await ctx2.close();

  /* the author's reload brings it back (the address and this browser's copy agree) */
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.IntMapMyMap && window.IntMapMyMap.state().shown === 'own', null, { timeout: 30_000 });
  expect((await page.evaluate(() => window.IntMapMyMap.state())).features.length).toBe(3);

  /* a GeoJSON file */
  await page.evaluate(() => window.IntMapMyMap.open());
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#im-mymap [data-mm="export-geojson"]').click()]);
  const body = JSON.parse(await (await import('node:fs')).promises.readFile(await dl.path(), 'utf8'));
  expect(body.type).toBe('FeatureCollection'); expect(body.features).toHaveLength(3);
  expect(body.features[0].properties.name).toBe('Meeting point');
  expect(body.intmap.provenance.kind).toBe('sketch');

  /* «Use in analysis» → a dataset in the GIS layer that says who drew it */
  const an = await page.evaluate(() => window.IntMapMyMap.analyze({ open: false }));
  expect(an.ok).toBe(true);
  const prov = await page.evaluate((id) => window.IntMapData.get(id).provenance, an.datasetId);
  expect(prov.kind).toBe('sketch'); expect(prov.author).toBe('reader');
});

test('my map on a phone: every control in the panel is reachable by a finger', async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await boot(page);
  await page.evaluate(() => window.IntMapLazy.need('myMap').then(() => window.IntMapMyMap.open()));
  await expect(page.locator('#im-mymap')).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => { const M = window.IntMapMyMap; M.add({ kind: 'pin', coords: [[139.76, 35.68]], name: 'A' }); M.add({ kind: 'line', coords: [[139.7, 35.6], [139.8, 35.7]], name: 'B' }); });
  await page.waitForTimeout(600);
  const bad = await page.evaluate(() => {
    const credit = document.getElementById('map-credit'), creditTop = credit && credit.checkVisibility() ? credit.getBoundingClientRect().top : innerHeight;
    const sheet = document.getElementById('sidebar'), sheetTop = sheet ? sheet.getBoundingClientRect().top : innerHeight;
    const bound = Math.min(creditTop, sheetTop), out = [];
    for (const el of document.querySelectorAll('#im-mymap .mm-foot button, #im-mymap .mm-head button, #im-mymap .mm-seg button')) {
      const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      if (y > bound || !(hit === el || el.contains(hit))) out.push((el.getAttribute('data-mm') || el.textContent) + ' @' + Math.round(y));
    }
    return out;
  });
  await page.screenshot({ path: 'C:/Users/gyuuk/AppData/Local/Temp/map-next-phone.png' });
  expect(bad).toEqual([]);
  await ctx.close();
});
