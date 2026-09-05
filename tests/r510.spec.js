/* ============================================================================
 *  R510 — live ships without a key: the claims that must hold on EVERY push.
 *   ① switching the ship layer on WITHOUT a key does not answer with a "you need a key" toast,
 *      the browser asks OUR relay (ais-feed) for the VIEW it is looking at, and what comes back is
 *      drawn — and at no point does the browser open aisstream.io itself.
 *
 *  Before this round the layer did exactly the opposite: no key → a toast, no request, no ships.
 *  Measured in production on 2026-09-06 (the Taiwan Strait, ship layer on): the toast and nothing
 *  else, while the relay had been deployed and answering for six days.
 *
 *  ⚠ THE RELAY IS ROUTED, NOT CALLED. The gate must be true whether or not a third-party network
 *  answered this minute (tests/r341.spec.js says why), so the relay's answer is a canned wire body
 *  in the shape supabase/functions/ais-feed builds. The relay ITSELF is exercised by
 *  tests/r510-checks.test.mjs ⑨⑩⑪, which run its handler with the upstreams stubbed.
 *
 *  ⚠ THE SHARED FIXTURE, NOT A BOOT OF ITS OWN (tests/helpers/app.js): `app` is worker-scoped and
 *  already booted. This file is the round's own spec and therefore in the core tier by
 *  construction; a private page.goto would cost it two minutes it is not allowed to have.
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';

const RELAY = /\/functions\/v1\/ais-feed/;
const DIRECT = /stream\.aisstream\.io/;

test('R510 ① no key: no prompt, the relay is asked for the view, and its ships are drawn', async ({ app }) => {
  const page = app.page;

  const relayUrls = [];
  const direct = [];
  const onReq = (r) => { if (DIRECT.test(r.url())) direct.push(r.url()); };
  page.on('request', onReq);

  /* the relay's wire form: v, t, n, a (position rows ending in an AGE in seconds), id, p */
  await page.route(RELAY, (route) => {
    relayUrls.push(route.request().url());
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*', 'x-intmap-channel': 'view', 'x-intmap-coverage': 'aisstream:2' },
      body: JSON.stringify({
        v: 1, t: Date.now(), n: 2,
        a: [[412000001, 121.9, 24.2, 10.5, 90, 91, 0, 70, 3], [416000002, 120.3, 23.1, 0, 0, null, 1, 35, 8]],
        id: [[412000001, 'R510 TEST CARGO', 'BR510', 9311543, 'KEELUNG', 7.2]],
        p: { aisstream: 2 },
      }),
    });
  });

  await page.waitForFunction(() => document.querySelectorAll('.lyr-row').length > 100, null, { timeout: 60000 });

  /* no key in this browser, and a Taiwan-Strait view so the bbox is a real box, not the world */
  await page.evaluate(() => {
    try { localStorage.removeItem('intmap_ais_key'); } catch (_) { /* private mode */ }
    window.IntMapGeoEngine.camera.jumpTo({ center: [121, 24], zoom: 6 });
  });

  /* ⚠ THE ROWS TOGGLE ON THE ROW'S pointerdown, NOT THE CHECKBOX'S click (#R37, tests/r341.spec.js). */
  await page.evaluate(() => {
    const cb = document.getElementById('dl-ships');
    if (cb && !cb.checked) {
      const row = cb.closest('label') || cb.closest('.lyr-row') || cb.parentElement;
      ['pointerdown', 'pointerup'].forEach((t) =>
        row.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 1 })));
    }
  });

  /* the relay is asked, with the box the reader is looking at */
  await expect.poll(() => relayUrls.length, { timeout: 20000 }).toBeGreaterThan(0);
  expect(relayUrls[0]).toMatch(/\?bbox=-?\d+\.\d\d,-?\d+\.\d\d,-?\d+\.\d\d,-?\d+\.\d\d$/);
  const box = relayUrls[0].split('bbox=')[1].split(',').map(Number);
  expect(box[0]).toBeLessThan(121); expect(box[2]).toBeGreaterThan(121);   /* the view, padded */
  expect(box[1]).toBeLessThan(24); expect(box[3]).toBeGreaterThan(24);

  /* …and what it answered is what the layer holds: both rows, the identity joined by MMSI */
  await page.waitForFunction(() => {
    try {
      const d = window.IntMapGeoEngine.layers.sourceData('src-ships');
      return !!(d && d.features && d.features.length === 2);
    } catch (_) { return false; }
  }, null, { timeout: 20000 });
  const drawn = await page.evaluate(() => {
    const d = window.IntMapGeoEngine.layers.sourceData('src-ships');
    return d.features.map((f) => ({ mmsi: f.properties.mmsi, name: f.properties.name, type: f.properties.type, lng: f.geometry.coordinates[0] }));
  });
  expect(drawn.find((f) => f.mmsi === 412000001)).toMatchObject({ name: 'R510 TEST CARGO', type: 'civilian', lng: 121.9 });
  expect(drawn.find((f) => f.mmsi === 416000002)).toMatchObject({ type: 'military' });

  /* the prompt that used to be the whole answer must not be what a keyless reader sees */
  const toast = await page.evaluate(() => {
    const el = document.getElementById('ai-toast');
    return el && el.classList.contains('show') ? el.textContent : '';
  });
  expect(toast).not.toMatch(/AISstream|API/i);
  /* …and the zoom hint that belongs to the keyed stream is not shown either */
  const hint = await page.evaluate(() => { const el = document.getElementById('ships-zoom-hint'); return el ? getComputedStyle(el).display : 'none'; });
  expect(hint).toBe('none');

  /* the browser never opened the provider itself — that is the keyed path, and there is no key */
  expect(direct).toEqual([]);

  page.off('request', onReq);
  await page.unroute(RELAY);
  /* leave the layer as it was found */
  await page.evaluate(() => {
    const cb = document.getElementById('dl-ships');
    if (cb && cb.checked) {
      const row = cb.closest('label') || cb.closest('.lyr-row') || cb.parentElement;
      ['pointerdown', 'pointerup'].forEach((t) =>
        row.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 1 })));
    }
  });
});
