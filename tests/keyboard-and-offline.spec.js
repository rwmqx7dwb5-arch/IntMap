/* ============================================================================
 *  IntMap · keyboard-and-offline — real keys, and a real offline context
 * ----------------------------------------------------------------------------
 *  ① the map is read and moved from the keyboard alone. With focus on the map: Alt+R says what is at the
 *    centre (the summary, then the place profile's own sentences); Alt+Shift+R turns the reading mode on
 *    (stored, and the Settings switch follows); an arrow key and «=» really move and zoom the map through the
 *    renderer's own keyboard handler, and the settled move is said with how far and which way, then the profile;
 *    Alt+Shift+R turns it off. Nothing here is a synthetic event: Playwright's keyboard.
 *  ② the map is carried. The offline dialog measures the view and says what is NOT saved and why (from the
 *    ledger's terms), saves the terrain of the region and the app's own files, lists the saved region — then the
 *    browser goes offline and the saved terrain tile is answered by the worker under a DIFFERENT host alias from
 *    the one it was saved under, a saved file of IntMap's own is answered, and the app itself opens (reload)
 *    from the installed shell with the offline notice. Then the region is deleted and the tile is gone.
 *  The suppliers are answered by the test (context.route): a tile is a 256×256 PNG built here, so the spec
 *  measures IntMap and not the runner's route to AWS.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { deflateSync, crc32 } from 'node:zlib';

/* a valid 256×256 grey PNG, built from nothing */
function png() {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(256, 0); ihdr.writeUInt32BE(256, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc(256 * (1 + 256 * 3), 0x80); for (let y = 0; y < 256; y++) raw[y * (1 + 256 * 3)] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const TILE = png();

async function boot(page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__imap && window.__imap.isStyleLoaded(), null, { timeout: 60_000 });
  await page.waitForFunction(() => !!document.getElementById('map-narration'), null, { timeout: 20_000 });
}
async function answerSuppliers(context) {
  await context.route(/elevation-tiles-prod|\/\/s3\.amazonaws\.com\/elevation/, (route) => route.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: TILE }));
  await context.route(/nominatim\.openstreetmap\.org|open-meteo\.com/, (route) => route.abort());
}
const narration = (page) => page.evaluate(() => document.getElementById('map-narration').textContent);
const focusMap = (page) => page.evaluate(() => { const m = document.getElementById('map'); const f = m.querySelector('[tabindex]:not([tabindex="-1"])') || m; f.focus(); });
const view = (page) => page.evaluate(() => { const c = window.IntMapGeoEngine.camera.getCenter(); return { lng: c.lng, lat: c.lat, zoom: window.IntMapGeoEngine.camera.getZoom() }; });

test.describe('keyboard-and-offline', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('① the map is read and moved from the keyboard alone', async ({ page, context }) => {
    await answerSuppliers(context);
    await boot(page);
    await page.waitForFunction(() => !window.IntMapGeoEngine.camera.isAnimating(), null, { timeout: 15_000 });
    await focusMap(page);

    await test.step('Alt+R says what is here — the summary, then the profile’s own sentences, holes with their reason', async () => {
      await page.keyboard.press('Alt+KeyR');
      await expect.poll(() => narration(page), { timeout: 30_000 }).toMatch(/Map centred[\s\S]*Country:[\s\S]*Elevation/);
      expect(await narration(page)).toMatch(/Place name unavailable: the source could not be reached\./);   /* the route refused Nominatim: said, not hidden */
    });

    await test.step('Alt+Shift+R turns the reading mode on: stored, said, and the Settings switch follows', async () => {
      await page.keyboard.press('Alt+Shift+KeyR');
      await expect.poll(() => narration(page), { timeout: 10_000 }).toMatch(/^Reading mode on\./);
      expect(await page.evaluate(() => localStorage.getItem('intmap_map_reading'))).toBe('on');
      expect(await page.evaluate(() => document.getElementById('setting-map-reading').value)).toBe('on');
      expect(await page.evaluate(() => document.getElementById('lbl-map-reading').textContent)).toBe('Reading mode (screen reader)');
    });

    await test.step('a real arrow key and a real «=» move and zoom the map, and the settled move is said with the profile', async () => {
      await focusMap(page);
      const before = await view(page);
      /* one key at a time: the renderer eases each, and a second key would cancel the first */
      await page.keyboard.press('ArrowRight');
      await expect.poll(async () => (await view(page)).lng, { timeout: 10_000 }).toBeGreaterThan(before.lng);
      await page.waitForFunction(() => !window.IntMapGeoEngine.camera.isAnimating(), null, { timeout: 15_000 });
      await page.keyboard.press('Equal');
      await expect.poll(async () => (await view(page)).zoom, { timeout: 10_000 }).toBeGreaterThan(before.zoom);
      await page.waitForFunction(() => !window.IntMapGeoEngine.camera.isAnimating(), null, { timeout: 15_000 });
      await expect.poll(() => narration(page), { timeout: 30_000 }).toMatch(/Moved about [\d.]+ km east[\s\S]*Country:[\s\S]*Elevation/);
    });

    await test.step('Alt+Shift+R turns it off, and an arrow key then says only the short summary', async () => {
      await focusMap(page);
      await page.keyboard.press('Alt+Shift+KeyR');
      await expect.poll(() => narration(page), { timeout: 10_000 }).toBe('Reading mode off.');
      expect(await page.evaluate(() => localStorage.getItem('intmap_map_reading'))).toBe('off');
      await page.keyboard.press('ArrowLeft');
      await expect.poll(() => narration(page), { timeout: 15_000 }).toMatch(/^Map centred/);
      expect(await narration(page)).not.toMatch(/Country:/);
    });
  });

  test.describe('② the map is carried', () => {
    test.use({ serviceWorkers: 'allow' });

    test('save a region, go offline, open it, delete it', async ({ page, context }) => {
      test.setTimeout(180_000);
      await answerSuppliers(context);
      await boot(page);
      /* the worker is installed and controls this page, and has filled its shell */
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30_000 });
      await page.evaluate(() => { window.IntMapGeoEngine.camera.jumpTo({ center: [139.7, 35.7], zoom: 6 }); });
      await page.waitForFunction(() => !window.IntMapGeoEngine.camera.isAnimating(), null, { timeout: 15_000 });

      await test.step('the dialog measures first, and says what is NOT saved and why', async () => {
        await page.evaluate(() => document.getElementById('btn-offline-maps').click());
        const dlg = page.locator('#offline-maps-modal');
        await expect(dlg).toBeVisible();
        await expect(page.locator('#offline-detail option').first()).toBeAttached({ timeout: 30_000 });
        const text = await dlg.innerText();
        expect(text).toMatch(/Terrain elevation, detail \d+ — \d+ tiles, about [\d.]+ MB/);
        expect(text, 'the refusal names the host and quotes why').toMatch(/tiles\.openfreemap\.org — Terms of Service/);
        expect(await dlg.locator('a[href="https://openfreemap.org/tos/"]').count(), 'the terms are one click away').toBe(1);
        expect(await page.evaluate(() => document.getElementById('btn-offline-maps').getAttribute('aria-labelledby'))).toBe('lbl-offline-maps btn-offline-label');
        /* the smallest region keeps the spec short; the policy and the save are the same at any size */
        const first = await page.locator('#offline-detail option').first().getAttribute('value');
        await page.selectOption('#offline-detail', first);
        await page.fill('#offline-name', 'Tokyo test');
        await page.click('#offline-save');
        await expect(page.locator('.offline-pack')).toHaveCount(1, { timeout: 120_000 });
        await expect(page.locator('#offline-msg')).toHaveText('Saved.');
      });

      const saved = await page.evaluate(async () => {
        const p = JSON.parse(localStorage.getItem('intmap_offline_packs'))[0];
        const keys = (await (await caches.open('intmap-page-offline-v1')).keys()).map((r) => r.url);
        return { p, keys };
      });
      expect(saved.p.tiles).toBeGreaterThan(0);
      expect(saved.p.missing).toBe(0);
      expect(saved.keys.length, 'every tile and every file is in the page-owned cache').toBe(saved.p.tiles + saved.p.files.length);
      /* a tile of the region, asked for under an alias OTHER than the one it was saved under */
      const z = 2, tileUrl = (host) => `https://${host}/terrarium/${z}/3/1.png`;
      expect(saved.keys).toContain(tileUrl('elevation-tiles-prod.s3.amazonaws.com'));

      await test.step('offline: the saved terrain tile is answered under another host alias, and a saved file of IntMap’s own', async () => {
        await context.setOffline(true);
        const got = await page.evaluate(async (u) => { const r = await fetch(u, { mode: 'cors' }); return { ok: r.ok, n: (await r.arrayBuffer()).byteLength }; }, tileUrl('elevation-tiles-prod.s3.us-east-1.amazonaws.com'));
        expect(got).toEqual({ ok: true, n: TILE.length });
        const own = saved.p.files.find((f) => /\/data\//.test(f)) || saved.p.files[0];
        if (own) {
          const r = await page.evaluate(async (u) => { const x = await fetch(u); return { ok: x.ok }; }, own);
          expect(r.ok, 'a saved file of the app’s own is answered with no network').toBe(true);
        }
      });

      await test.step('offline: the app itself opens, and says it is offline', async () => {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => !!document.getElementById('map') && !!window.IntMapGeoEngine, null, { timeout: 60_000 });
        await expect(page.locator('#im-offline')).toBeVisible({ timeout: 30_000 });
      });

      await context.setOffline(false);
      await test.step('delete: the region and its files leave the cache, and the tile is gone', async () => {
        await page.waitForFunction(() => !!document.getElementById('btn-offline-maps'));
        await page.evaluate(() => document.getElementById('btn-offline-maps').click());
        await expect(page.locator('.offline-pack')).toHaveCount(1, { timeout: 30_000 });
        await page.locator('.offline-pack button').click();
        await expect(page.locator('.offline-pack')).toHaveCount(0, { timeout: 30_000 });
        const left = await page.evaluate(async () => (await (await caches.open('intmap-page-offline-v1')).keys()).length);
        expect(left).toBe(0);
        expect(await page.evaluate(() => localStorage.getItem('intmap_offline_packs'))).toBe('[]');
      });
    });
  });
});
