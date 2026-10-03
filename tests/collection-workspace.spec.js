/* ============================================================================
 *  collection-workspace — a published collection, as the person who was sent the link meets it
 * ----------------------------------------------------------------------------
 *  The page is opened at `?collection=<token>`, the address the owner copies from «My places». The
 *  public read (shared_collection) is answered here, as PostgREST answers it, so the result does not
 *  depend on whether the migration has been applied where the page points; what is measured is
 *  everything the visitor then sees and does:
 *    ① the read-only card names the collection and lists its places and its maps;
 *    ② the camera frames the places (they are on the map as pins, not only in a list);
 *    ③ a map in the list opens through the share link's own restore — the address takes its view;
 *    ④ «Add to My places» signed out sends the visitor to sign in and keeps the token for this tab only;
 *    ⑤ closing the card removes `collection` from the address (a reload is the visitor's own map) and
 *      forgets the waiting token.
 *  It boots its own page: the boot IS the subject (the query is read once, at start-up).
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { bootPage } from './helpers/app.js';

const TOKEN = '0123456789abcdef0123456789abcdef';
const RPC = '**/rest/v1/rpc/shared_collection*';
const COLLECTION = {
  ok: true, format: 'intmap-collection', version: 1, title: 'Kansai field trip', collection: 'Trip',
  published_at: '2026-10-03T10:00:00Z', updated_at: '2026-10-03T11:00:00Z',
  places: [
    { name: 'Kyoto Station', note: 'Meet at the central exit', collection: 'Trip', lng: 135.75875, lat: 34.98559, zoom: 15 },
    { name: 'Osaka Castle', note: '', collection: 'Trip', lng: 135.52583, lat: 34.68731, zoom: null },
  ],
  views: [{ name: 'Kansai in 1900', note: 'for the history lesson', collection: 'Trip', state: 'v=135.6000,34.8000,8.00,0,0,f&tt=1900-01-01' }],
};

test('a published collection: read-only card, framed pins, its maps open, sign-in keeps the token, closing cleans the address', async ({ page }) => {
  const asked = [];
  await page.route(RPC, (route) => {
    asked.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(COLLECTION) });
  });
  await bootPage(page, { url: '/index.html?collection=' + TOKEN });

  /* ① */
  const card = page.locator('#scol-card');
  await expect(card).toBeVisible({ timeout: 45_000 });
  expect(asked[0], 'the page asked the public read for exactly the token in its address').toEqual({ p_token: TOKEN });
  await expect(page.locator('#scol-h')).toHaveText('Kansai field trip');
  await expect(card.locator('.scol-row')).toHaveCount(3);
  await expect(card).toContainText('Kyoto Station');
  await expect(card).toContainText('Kansai in 1900');

  /* ② the camera frames the two places */
  await page.waitForFunction(() => { try { const m = window.__imap, c = m.getCenter();
    return !m.isMoving() && c.lng > 135.4 && c.lng < 135.9 && c.lat > 34.6 && c.lat < 35.1; } catch (_) { return false; } }, null, { timeout: 20_000 });
  /* the two places are session pins (the source js/app-body.js refreshPins writes), at their own positions */
  const pins = await page.evaluate(() => { const s = window.__imap.getSource('user-pins'); const d = (s.serialize && s.serialize().data) || {}; return (d.features || []).map((f) => f.geometry.coordinates.map((x) => +x.toFixed(5)).join(',')); });   /* MapLibre keeps a GeoJSON source's live data behind serialize() (tests/r168.spec.js) */
  expect(pins.sort()).toEqual(['135.52583,34.68731', '135.75875,34.98559']);

  /* ③ the map opens as its link would */
  await card.locator('.scol-row', { hasText: 'Kansai in 1900' }).click();
  await page.waitForFunction(() => /[#&]tt=1900-01-01/.test(location.hash) && /v=135\.6000,34\.8000/.test(location.hash), null, { timeout: 20_000 });
  await page.waitForFunction(() => { try { const m = window.__imap; return !m.isMoving() && Math.abs(m.getCenter().lng - 135.6) < 0.05 && Math.abs(m.getZoom() - 8) < 0.5; } catch (_) { return false; } }, null, { timeout: 20_000 });

  /* ④ signed out, «Add to My places» asks for the sign-in and keeps the token in this tab */
  await page.locator('#scol-keep').click();
  await expect(page.locator('#auth-modal')).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('intmap-collection-pending'))).toBe(TOKEN);
  await page.evaluate(() => { const m = document.getElementById('auth-modal'); if (m) m.style.display = 'none'; });

  /* ⑤ closing */
  await page.locator('#scol-close').click();
  await expect(card).toHaveCount(0);
  expect(await page.evaluate(() => location.search)).not.toContain('collection=');
  expect(await page.evaluate(() => sessionStorage.getItem('intmap-collection-pending'))).toBeNull();
});
