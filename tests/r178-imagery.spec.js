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

/* ── ③ the prefetch warms the level the protocol will actually fetch ────────────────────────────
   On a HiDPI display each tile is served by stitching the four children one level deeper, so the
   widest prefetch ring was warming a level that is now only the fallback.

   Asserted on the level the prefetcher CHOSE, not on the network traffic: once the protocol is
   stitching, the render path fetches children one level below the displayed zoom and those outnumber
   the ring (measured at map z11 on a 2x screen — 18 requests at z12 from the ring, 41 at z13 from the
   children), so a modal-zoom inference reads the wrong number. Run at both device scales, because a
   bias applied unconditionally would spend a 1x user's bandwidth on detail their screen cannot show. */
for (const dsf of [1, 2]) {
  test.describe(`at ${dsf}x device scale`, () => {
    test.use({ deviceScaleFactor: dsf });
    test(`the satellite prefetch targets the level the protocol fetches (#R178, ${dsf}x)`, async ({ page }) => {
      test.setTimeout(180000);
      await page.route('**/World_Imagery/MapServer/tile/**', route =>
        route.fulfill({ status: 200, contentType: 'image/jpeg', body: Buffer.alloc(9000, 7) }));
      await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!window.__imap && !!window.IntMapSatProto, null, { timeout: 60000 });
      const r = await page.evaluate(async () => {
        const wait = ms => new Promise(res => setTimeout(res, ms));
        window.__imap.jumpTo({ center: [139.767, 35.681], zoom: 11, pitch: 0, bearing: 0 });
        window.IntMapOS.exec('view.base.sat', { source: 'test' });
        await wait(3000);
        window._imPredictivePrefetch.lastLevel = null;
        window.__imap.jumpTo({ center: [139.9, 35.681], zoom: 11 });   /* a pan triggers the directional prefetch */
        for (let i = 0; i < 30 && !window._imPredictivePrefetch.lastLevel; i++) await wait(200);
        return { hi: window.IntMapSatProto.hiDPI(), dpr: window.IntMapSatProto.dpr(),
                 chose: window._imPredictivePrefetch.lastLevel };
      });
      /* ⚠ (#R206) THIS ASSERTED THE OFF-BY-ONE IT WAS WRITTEN TO PREVENT.
         The numbers here were `hi ? 1 : 0`, i.e. the stitch's extra level and nothing else — but the
         satellite source is declared `tileSize:256`, so MapLibre asks for `round(zoom + log2(512/256))`
         = zoom+1 before the stitch is even considered. MEASURED on the phone profile: map zoom 12.00,
         and every Esri request in that window was z13 while the warmer reported {z:12, bias:0}. A 1×
         screen therefore warmed a level nothing ever requests, and this test held that in place by
         pinning the same wrong number. What it means to be right is unchanged, so that is what is
         asserted now: the warmed level IS the level the protocol will fetch. */
      expect(r.hi, `dpr ${r.dpr} decides @2x as ${dsf >= 1.5}`).toBe(dsf >= 1.5);
      expect(r.chose, 'the prefetch ran').toBeTruthy();
      expect(r.chose.n, 'and asked for tiles').toBeGreaterThan(0);
      expect(r.chose.bias, 'the 256-px source is +1, and the @2x stitch is +1 again')
        .toBe(1 + (r.hi ? 1 : 0));
      expect(r.chose.z, 'so it warms exactly the level the protocol will fetch')
        .toBe(r.chose.mapZoom + 1 + (r.hi ? 1 : 0));
      /* …and the STITCH's level belongs only to the provider that stitches. A plain XYZ provider is
         served at MapLibre's covering level and no deeper, so it keeps the source's +1 and loses the
         other one — warming anything else would be this same defect pointed the other way. */
      const other = await page.evaluate(async () => {
        const wait = (ms) => new Promise((res) => setTimeout(res, ms));
        const S = window.__sat;
        const alt = (S && S.providers || []).find((x) => x.id !== 'esri' && x.tier === 'free');
        if (!S || !alt) return { skipped: true };
        S.select(alt.id);
        await wait(1800);
        window._imPredictivePrefetch.lastLevel = null;
        window.__imap.jumpTo({ center: [139.6, 35.6], zoom: 8 });
        for (let i = 0; i < 30 && !window._imPredictivePrefetch.lastLevel; i++) await wait(200);
        return { provider: alt.id, chose: window._imPredictivePrefetch.lastLevel };
      });
      expect(other.skipped, 'there is a second free provider to switch to').toBeUndefined();
      expect(other.chose, `the prefetch ran for ${other.provider}`).toBeTruthy();
      expect(other.chose.bias, `a plain XYZ provider (${other.provider}) carries the source's +1 and no stitch level`).toBe(1);
    });
  });
}
