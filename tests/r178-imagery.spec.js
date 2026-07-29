// R178 — the imagery / 3-D speed and quality work, checked against the LIVE tile services.
//
// Both defects were measured before the fix:
//
//   ① satellite imagery was HALF RESOLUTION on every HiDPI screen. MapLibre picks the raster tile
//      zoom from `zoom + log2(512/tileSize)` (src/geo/projection/covering_tiles.ts) and pixelRatio
//      is not in that expression, while the canvas IS rendered at devicePixelRatio — so one 256 px
//      Esri tile was stretched across 512 device pixels, at every zoom, since the layer existed.
//   ② four out of five terrarium DEM tiles bypassed the service-worker disk cache and were
//      re-downloaded on every visit: the DEM is round-robined over five S3 aliases and only ONE
//      spelling was in the cache's host list.
import { test, expect } from '@playwright/test';

/* ── ① the stitched @2x tile is real imagery at twice the linear resolution ─────────────────── */
test.describe('on a 2× display', () => {
  test.use({ deviceScaleFactor: 2 });
  test('the satellite protocol answers HiDPI screens at full resolution (#R178)', async ({ page }) => {
    test.setTimeout(180000);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.IntMapSatProto, null, { timeout: 60000 });
    const r = await page.evaluate(async () => {
      /* Tokyo at z12 — dense city, so Esri has real imagery at z13 for all four children */
      const z = 12, x = 3637, y = 1612;
      const url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/' + z + '/' + y + '/' + x;
      const base = await createImageBitmap(new Blob([await fetch(url).then(b => b.arrayBuffer())]));
      const got = await window.IntMapSatProto.tile2x(z, y, x);
      return { dpr: window.IntMapSatProto.dpr(), hi: window.IntMapSatProto.hiDPI(), baseW: base.width, got };
    });
    expect(r.dpr, 'the test really runs at 2×').toBe(2);
    expect(r.hi, 'so the protocol takes the HiDPI path').toBe(true);
    expect(r.baseW, 'Esri serves 256 px tiles').toBe(256);
    expect(r.got.ok, 'and the four children stitched: ' + (r.got.err || '')).toBe(true);
    expect(r.got.bitmap, 'handed over as an ImageBitmap — no JPEG re-encode').toBe(true);
    expect(r.got.w, 'twice the linear resolution of the native tile').toBe(512);
    expect(r.got.h).toBe(512);
  });
});

/* …and a 1× display must be left exactly as it was: no extra requests, no stitching. */
test('a 1× display is untouched by the HiDPI path (#R178)', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.IntMapSatProto, null, { timeout: 60000 });
  const r = await page.evaluate(async () => ({
    dpr: window.IntMapSatProto.dpr(),
    hi: window.IntMapSatProto.hiDPI(),
    got: await window.IntMapSatProto.tile2x(12, 1612, 3637),
  }));
  expect(r.dpr).toBe(1);
  expect(r.hi, 'nothing to gain on a 1× screen, so the extra fetches must not happen').toBe(false);
  expect(r.got.ok, 'and no stitched tile is built').toBe(false);
});

/* ── ② every DEM host the app actually uses is cached ──────────────────────────────────────────
   Asserted against sw.js's own matcher rather than a copy of it, so the two cannot drift. */
test('every terrarium DEM alias is cached by the service worker (#R178)', async ({ page }) => {
  test.setTimeout(60000);
  const sw = await (await page.request.get('/sw.js')).text();
  /* the five aliases js/app-body.js round-robins — MapLibre picks one per tile as (x+y) % 5 */
  const hosts = [
    'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/12/1/1.png',
    'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/12/1/1.png',
    'https://elevation-tiles-prod.s3.dualstack.us-east-1.amazonaws.com/terrarium/12/1/1.png',
    'https://elevation-tiles-prod.s3.us-east-1.amazonaws.com/terrarium/12/1/1.png',
    'https://s3.dualstack.us-east-1.amazonaws.com/elevation-tiles-prod/terrarium/12/1/1.png',
  ];
  /* lift isTileRequest + its two tables out of the shipped worker and run them */
  const body = sw.slice(sw.indexOf('const TILE_HOSTS'), sw.indexOf('self.addEventListener(\'install\''));
  const isTile = new Function(body + '\nreturn isTileRequest;')();
  const cached = hosts.filter(isTile);
  expect(cached.length, `all five DEM aliases must be cached, not ${cached.length}`).toBe(5);
  /* and the cache must be big enough that one tilted city does not evict the last one */
  const cap = /MAX_ENTRIES\s*=\s*(\d+)/.exec(sw);
  expect(cap, 'the cache cap is declared').toBeTruthy();
  expect(Number(cap[1]), 'a tilted z15 view is already several hundred DEM tiles').toBeGreaterThanOrEqual(12000);
});
