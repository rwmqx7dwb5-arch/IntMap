/* ============================================================================================
 *  hist-urban-population · the «Historical city populations» layer (dl-histurban), in the real app
 * --------------------------------------------------------------------------------------------
 *  js/hist-urban.js owns what a year shows (stateAt / activeAt); the layer only draws it. So the
 *  expected values below are ASKED OF THAT FILE and of the record (data/hist-urban.json), never typed:
 *    · at the live clock nothing is drawn (and nothing was fetched before the row was switched on);
 *    · at year 1000 the label features are exactly the cities `activeAt` lists, and each stated figure
 *      has its own circle (Baghdad: Chandler's 125,000 AND Modelski's 1,500,000, neither chosen);
 *    · a city's card lists every dated figure of `historyOf` with its book and location certainty.
 * ========================================================================================== */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from './helpers/app.js';
import { activeAt, historyOf, findCity } from '../js/hist-urban.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = JSON.parse(readFileSync(join(ROOT, 'data/hist-urban.json'), 'utf8'));
const YEAR = 1000;
const SRC_L = 'imhu-labels-src', SRC_C = 'imhu-circles-src';

const rowOn = (page, on) => page.evaluate((v) => {
  const cb = document.getElementById('dl-histurban');
  cb.checked = v; cb.dispatchEvent(new Event('change', { bubbles: true }));
}, on);
/* the features the layer handed the map for a source — the GeoJSON the source holds (serialize().data), read directly.
   ⚠ NOT querySourceFeatures after the map's 'idle' event: on CI's software renderer 'idle' never arrived inside the test's
   minute (measured on PR #989 — both tests timed out there and passed locally), and a tiled read also depends on the view. */
const featuresOf = (page, src) => page.evaluate((s) => {
  const src = window.__imap.getSource(s), d = src && src.serialize && src.serialize().data;
  const seen = new Map();
  for (const f of (d && d.features) || []) seen.set(f.properties.id + '|' + (f.properties.p ?? ''), f.properties);
  return [...seen.values()];
}, src);

test.describe('dl-histurban', () => {
  test('nothing at the live clock; the year 1000 draws what activeAt states; Baghdad shows both books', async ({ app }) => {
    const page = app.page;
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.evaluate(() => window.IntMapTime.setNow({ source: 'test' }));
    await rowOn(page, true);
    await page.waitForFunction(() => document.getElementById('dl-histurban').checked);
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => window.IntMapGeoEngine.layers.has('imhu-labels'))).toBe(false);

    await page.evaluate((y) => window.IntMapTime.setYear(y, { source: 'test' }), YEAR);
    await page.waitForFunction(() => window.IntMapGeoEngine.layers.has('imhu-labels') && window.IntMapGeoEngine.layers.has('imhu-circles'), null, { timeout: 30000 });

    const want = activeAt(DATA, YEAR);
    expect(want.length).toBeGreaterThan(20);
    const labels = await featuresOf(page, SRC_L);
    expect(labels.length).toBe(want.length);
    /* one circle per stated figure; two figures of one city in one year with the very same number are two coincident circles,
       which the (id, population) key this spec reads them by counts once */
    const figures = new Set(want.flatMap((e) => e.state.figures.map((f) => e.city.id + '|' + f.population)));
    expect((await featuresOf(page, SRC_C)).length).toBe(figures.size);

    const baghdad = findCity(DATA, 'Baghdad')[0];
    const text = labels.find((p) => p.id === baghdad.id).text;
    expect(text).toContain('125,000');
    expect(text).toContain('1,500,000');
    const circles = (await featuresOf(page, SRC_C)).filter((p) => p.id === baghdad.id).map((p) => p.p).sort((a, b) => a - b);
    expect(circles).toEqual([125000, 1500000]);

    await rowOn(page, false);
    await expect.poll(() => page.evaluate(() => window.IntMapGeoEngine.layers.has('imhu-labels') || window.IntMapGeoEngine.layers.has('imhu-circles'))).toBe(false);
  });

  test('a city card lists every dated figure with its book and certainty', async ({ app }) => {
    const page = app.page;
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.evaluate((y) => window.IntMapTime.setYear(y, { source: 'test' }), YEAR);
    await rowOn(page, true);
    await page.waitForFunction(() => window.IntMapGeoEngine.layers.has('imhu-circles'), null, { timeout: 30000 });
    const baghdad = findCity(DATA, 'Baghdad')[0];
    /* a real click on the city's circle: the shared place reader opens the card */
    await page.evaluate(([lon, lat]) => { window.__imap.jumpTo({ center: [lon, lat], zoom: 5 }); }, [baghdad.lon, baghdad.lat]);
    /* click only once the circle is actually rendered under that pixel — on CI's software renderer it is drawn seconds after
       the layer exists, and a click before then reaches nothing (measured on PR #989) */
    const at = () => page.evaluate(([lon, lat, id]) => {
      const m = window.__imap, p = m.project([lon, lat]);
      const hit = m.queryRenderedFeatures([p.x, p.y], { layers: ['imhu-circles'] }).some((f) => f.properties.id === id);
      const r = m.getCanvas().getBoundingClientRect();
      return hit ? { x: r.left + p.x, y: r.top + p.y } : null;
    }, [baghdad.lon, baghdad.lat, baghdad.id]);
    await expect.poll(at, { timeout: 30000 }).not.toBeNull();
    const pt = await at();
    await page.mouse.click(pt.x, pt.y);
    const popup = page.locator('.plc-popup');
    await expect(popup).toBeVisible({ timeout: 15000 });
    const rows = popup.locator('tbody tr');
    const hist = historyOf(DATA, baghdad);
    await expect(rows).toHaveCount(hist.length);
    const body = await popup.innerText();
    for (const h of hist.slice(0, 3)) expect(body).toContain(new Intl.NumberFormat('en').format(h.population));
    expect(body).toContain('Chandler');
    expect(body).toContain('Modelski');
    expect(body).toContain('Location certainty');
    expect(body).toContain('Shown for');
    expect(body).toContain('CC BY 4.0');
    await rowOn(page, false);
  });
});
