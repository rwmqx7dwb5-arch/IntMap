// sales-pro-audiences — the browser half of tests/sales-pro-audiences-checks.test.mjs: what only the built page answers.
//   ① 1850: the share panel's Cite tab gives the credit line and a reference that name the date the clock shows; the
//     borders of that date save as a GeoJSON whose every feature carries its record and terms, read through the
//     catalogue the build served (api/v1/catalog.json); Atlas's face (`IntMapShare.cite`) says the same counts
//   ② 1914: CShapes draws most of the world, so its shapes are left out by name and the Cliopatria / OpenHistoricalMap
//     rows cut against it keep their record without their outline — nothing non-commercial reaches the file
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { installHermeticRouting } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

/* the clock travels in the link (`tt`, js/map-ui.js MapState.own('time')): a link with no instant restores «now» after the
   boot, so a year set before that restore is undone — the instant is part of the view, as a reader's share link carries it */
const VIEW = (y) => '#v=12.0000,48.0000,3.20,0,0,f&tt=' + y + '-06-15T12:00:00.000Z';
const drawnAt = (page, year) => page.waitForFunction((y) => { const TB = window.IntMapTimeBorders; const a = TB && TB.active() && TB.drawnAt();
  const fc = TB && TB.currentFC(); return !!(a && a.y === y && fc && fc.features && fc.features.length > 20); }, year, { timeout: 120_000 });

test('sales-pro-audiences ① cite the map of 1850 and take its borders away; ② 1914 leaves CShapes out by name', async ({ browser }) => {
  test.setTimeout(240_000);
  const ctx = await browser.newContext({ storageState: seededStorageState(), viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await installHermeticRouting(ctx);
  const page = await ctx.newPage();
  try {
    await page.goto('/' + VIEW(1850), { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForFunction(() => !!(window.IntMapShare && window.IntMapShare.cite && window.IntMapTime), null, { timeout: 45_000 });
    await drawnAt(page, 1850);
    const r = await page.evaluate(() => window.IntMapShare.cite());
    expect(r, 'cite() answered').toBeTruthy();
    expect(r.facts.instant.iso).toBe('1850');
    expect(r.refs.apa).toMatch(/^IntMap\. \(n\.d\.\)\. IntMap map view, 1850 \[Map of 1850\]\. Retrieved .+, from https?:\/\//);
    expect(r.refs.bibtex).toMatch(/^@misc\{intmap_1850,/);
    const s = r.borders && r.borders.summary;
    expect(s, JSON.stringify(r.borders)).toBeTruthy();
    expect(s.released, 'the 1850 world is OpenHistoricalMap (CC0) and Cliopatria before 1886 (CC BY)').toBeGreaterThan(20);
    expect(s.blockedBy.filter((b) => !b.outlineOnly).length, 'nothing in 1850 is CShapes’ own').toBe(0);
    expect(s.licences).toContain('CC0-1.0');
    expect((r.borders.data || []).some((d) => /^Bennett, J. S./.test(d.cite || '')), 'Cliopatria is cited in its publisher’s words').toBe(true);
    /* the tab shows the same */
    await expect(page.locator('#share-panel .sh-cite-credit')).toHaveValue(/^Map: IntMap, 1850 \(/);
    await expect(page.locator('#share-panel .sh-cite-borders')).toHaveText(/1850-06-15: \d+ shapes\. \d+ with their outlines/, { timeout: 60_000 });
    await expect(page.locator('#share-panel .sh-cite-world')).toBeEnabled();
    await page.selectOption('#share-panel .sh-cite-fmt', 'sist02');
    await expect(page.locator('#share-panel .sh-cite-ref')).toHaveValue(/\(参照 \d{4}-\d{2}-\d{2}\)\.$/);
    /* the file */
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.click('#share-panel .sh-cite-world')]);
    expect(dl.suggestedFilename()).toBe('intmap-borders-1850-06-15.geojson');
    const gj = JSON.parse(readFileSync(await dl.path(), 'utf8'));
    expect(gj.type).toBe('FeatureCollection');
    expect(gj.intmap.schema).toBe('intmap.borders/1');
    expect(gj.intmap.at).toBe('1850-06-15');
    expect(gj.features.length).toBe(s.released + s.attributes);
    const rel = gj.features.filter((f) => f.geometry);
    expect(rel.length).toBe(s.released);
    expect(rel.every((f) => f.properties.record && f.properties.file && f.properties.licences.length && f.properties.licences.every((l) => !/NC/.test(l)))).toBe(true);
    expect(rel.some((f) => f.properties.record === 'ohm' && f.properties.ohm_relation), 'an OpenHistoricalMap shape names its relation').toBe(true);

    /* ② the same page, the link moved to 1914 (a pasted link is applied like the first): CShapes draws most of the world */
    await page.evaluate((h) => { location.hash = h; }, VIEW(1914));
    await drawnAt(page, 1914);
    const s2 = await page.evaluate(() => window.IntMapShare.cite().then((r) => r && r.borders && r.borders.summary));
    expect(s2, 'a summary').toBeTruthy();
    const cs = s2.blockedBy.find((b) => /CShapes/.test(b.credit || ''));
    expect(cs, JSON.stringify(s2.blockedBy)).toBeTruthy();
    expect(s2.withheld, 'CShapes’ own shapes are counted, not included').toBeGreaterThan(20);
    expect(s2.byRecord.cshapes.withheld).toBe(s2.byRecord.cshapes.withheld + s2.byRecord.cshapes.released + s2.byRecord.cshapes.attributes);
    expect(s2.attributes, 'rows cut against CShapes keep their record').toBeGreaterThan(0);
    expect(s2.licences.some((l) => /NC/.test(l))).toBe(false);
  } finally { await ctx.close(); }
});
