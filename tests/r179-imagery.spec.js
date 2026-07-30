// R179 imagery checks, in a real browser, against the BUILT site and the REAL tile services.
//
// 「IntMapの衛星画像、3Dを極限まで高速・高画質化したいです。」
//
// #R178 found that MapLibre picks a raster's tile zoom from `zoom + log2(512/tileSize)` — with
// `pixelRatio` absent from that expression — while the canvas is drawn at devicePixelRatio, so a
// 256-pixel tile is stretched across 512 device pixels. It fixed the SATELLITE layer by stitching
// four children, because Esri has no @2x endpoint.
//
// It left the same defect in the layer the app actually OPENS ON. Every label, coastline and road on
// the default view has been drawn from a 256-pixel tile on a 512-pixel grid, and Carto — unlike Esri
// — publishes the double-density tile itself. So this one needs no stitching, no extra requests and
// no fallback: the same tile count, each carrying the pixels the display was always going to use.
//
// Two more things measured here: the decision has ONE owner now (two copies of "is this a HiDPI
// screen" is #R178's lesson ⑥), and the @2x stitch no longer pays four placeholder fetches per tile
// where Esri's imagery is known to stop shallower than the level it needs.
import { test, expect } from '@playwright/test';

const boot = async page => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__imap, null, { timeout: 60000 });
  await page.waitForFunction(() => window.__imap.isStyleLoaded(), null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
};

/* ── the base map at double density ───────────────────────────────────────────────────────── */
test.describe('on a 2× display', () => {
  test.use({ deviceScaleFactor: 2 });

  test('the base map asks for @2x tiles, and they really are 512 px (#R179)', async ({ page }) => {
    test.setTimeout(180000);
    const carto = [];
    page.on('request', r => { const u = r.url(); if (/basemaps\.cartocdn\.com\/(light|dark)_(all|nolabels)\//.test(u)) carto.push(u); });
    await boot(page);
    expect(carto.length, 'the base map is loading tiles at all').toBeGreaterThan(3);
    const at2x = carto.filter(u => /@2x\.png/.test(u));
    expect(at2x.length, 'and every one of them is the double-density tile').toBe(carto.length);
    /* …and the service really serves 512 px for it. Asserted against LIVE Carto rather than trusted:
       a URL that 404s or silently returns 256 would leave the map looking exactly as it did, which is
       the shape of failure #R162 recorded (a feature vanishing in silence). */
    const probe = await page.evaluate(async (u) => {
      try {
        const r = await fetch(u, { mode: 'cors', credentials: 'omit' });
        if (!r.ok) return { ok: false, status: r.status };
        const b = await createImageBitmap(await r.blob());
        const out = { ok: true, w: b.width, h: b.height };
        try { b.close && b.close(); } catch (_) {}
        return out;
      } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
    }, at2x[0]);
    expect(probe.ok, `live Carto served ${at2x[0]}`).toBe(true);
    expect(probe.w, 'a @2x tile is 512 px wide').toBe(512);
    expect(probe.h, '…and 512 px tall').toBe(512);
  });

  test('the HiDPI decision has one owner, and both raster paths obey it (#R179)', async ({ page }) => {
    test.setTimeout(120000);
    await boot(page);
    const r = await page.evaluate(() => ({
      decision: window.__imHiDPITiles,
      dpr: window.devicePixelRatio,
      satAgrees: window.IntMapSatProto ? window.IntMapSatProto.hiDPI() : null,
      /* the base map's own URLs are the other half of the same answer */
      baseIs2x: (() => {
        try {
          const s = window.__imap.getStyle().sources;
          const t = (s.bln || s.bl || {}).tiles || [];
          return t.length > 0 && t.every(u => /@2x\.png$/.test(u));
        } catch (_) { return null; }
      })(),
    }));
    expect(r.dpr, 'the test really is running at 2×').toBe(2);
    expect(r.decision, 'the single decision says yes here').toBe(true);
    expect(r.satAgrees, 'the satellite stitch reads that same decision, not a second copy').toBe(true);
    expect(r.baseIs2x, '…and so do the base-map URLs').toBe(true);
  });

  test('double-density tiles keep the tile-cache BYTE budget, not the tile count (#R179)', async ({ page }) => {
    test.setTimeout(120000);
    await boot(page);
    /* #R21 chose 8192 while a raster tile was 256² (~0.26 MB of texture). At 512² the same count is
       four times the memory, and that budget was picked against 「ブラウザが落ちることがないように」. */
    const cap = await page.evaluate(() => { try { return window.__imap._maxTileCacheSize; } catch (_) { return null; } });
    if (cap == null) test.skip(true, 'the renderer does not expose its cache cap here');
    expect(cap, 'a 2× screen holds a quarter as many tiles, i.e. the same bytes').toBe(2048);
  });
});

/* ── and nothing extra on a 1× display ────────────────────────────────────────────────────── */
test.describe('on a 1× display', () => {
  test.use({ deviceScaleFactor: 1 });

  test('a 1× screen pays nothing for either @2x path (#R179)', async ({ page }) => {
    test.setTimeout(180000);
    const carto = [];
    page.on('request', r => { const u = r.url(); if (/basemaps\.cartocdn\.com\/(light|dark)_(all|nolabels)\//.test(u)) carto.push(u); });
    await boot(page);
    expect(carto.length, 'the base map is loading tiles').toBeGreaterThan(3);
    expect(carto.filter(u => /@2x/.test(u)).length,
      'no @2x tile is requested — spending bandwidth on detail the screen cannot show is pure loss').toBe(0);
    const r = await page.evaluate(() => ({
      decision: window.__imHiDPITiles,
      satAgrees: window.IntMapSatProto ? window.IntMapSatProto.hiDPI() : null,
      cap: (() => { try { return window.__imap._maxTileCacheSize; } catch (_) { return null; } })(),
    }));
    expect(r.decision, 'the one decision says no').toBe(false);
    expect(r.satAgrees, 'and the satellite path agrees').toBe(false);
    if (r.cap != null) expect(r.cap, 'a 1× screen keeps #R21\'s original count').toBe(8192);
  });
});

/* ── the @2x stitch stops paying for imagery that is not there ────────────────────────────── */
test.describe('the imagery-depth memo', () => {
  test.use({ deviceScaleFactor: 2 });

  test('four placeholder fetches per tile are paid once, not per tile (#R179)', async ({ page }) => {
    test.setTimeout(240000);
    await boot(page);
    const r = await page.evaluate(async () => {
      const P = window.IntMapSatProto;
      if (!P || !P.wouldStitch) return { has: false };
      /* OPEN OCEAN — mid Pacific. Esri's imagery stops at about z8 there, so the four z+1 children of
         a z12 tile are all the grey placeholder. Tile numbers for lng -150, lat 0 at z12. */
      const z = 12, n = 1 << z;
      const ocx = Math.floor((-150 + 180) / 360 * n), ocy = Math.floor(n / 2);
      /* TOKYO at the same zoom, where imagery goes to z19 */
      const lat = 35.681, lng = 139.767;
      const tkx = Math.floor((lng + 180) / 360 * n);
      const tky = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n);
      const out = { has: true, before: { ocean: P.wouldStitch(z, ocx, ocy), tokyo: P.wouldStitch(z, tkx, tky) } };
      /* learn, the way the protocol learns: resolve each tile once */
      out.oceanMode = (await P.resolve(z, ocy, ocx)).mode;
      out.tokyoMode = (await P.resolve(z, tky, tkx)).mode;
      await P.tile2x(z, ocy, ocx);
      await P.tile2x(z, tky, tkx);
      out.after = { ocean: P.wouldStitch(z, ocx, ocy), tokyo: P.wouldStitch(z, tkx, tky) };
      out.oceanDepth = P.depth(z, ocx, ocy);
      out.tokyoDepth = P.depth(z, tkx, tky);
      out.learned = P.depthEntries();
      return out;
    });
    if (!r.has) test.skip(true, 'the satellite protocol is not installed here');
    /* the honest baseline: before anything is known, both are attempted */
    expect(r.before.ocean, 'an unknown neighbourhood is attempted — never a lost pixel').toBe(true);
    expect(r.before.tokyo, 'and so is a city').toBe(true);
    /* the ocean tile really is past Esri's coverage — that is what makes it the interesting case */
    expect(r.oceanMode, 'mid-Pacific at z12 is beyond Esri, so it comes from an upscaled ancestor')
      .toBe('cropped');
    expect(r.tokyoMode, 'Tokyo at z12 is native imagery').toBe('native');
    expect(r.learned, 'the memo learned something').toBeGreaterThan(0);
    /* …and now the ocean stops asking, while the city keeps its full detail */
    expect(r.after.ocean, 'the ocean tile no longer pays four placeholder fetches').toBe(false);
    expect(r.after.tokyo, 'and the city still stitches at double density').toBe(true);
    /* the two facts are kept apart on purpose: a real tile at z proves imagery EXISTS at z and says
       nothing about z+1, so only a positively-observed STOP may block the stitch. Recording one
       number and treating it as a ceiling switched @2x off for every city. */
    expect(r.oceanDepth.stop, 'over the ocean a stop was positively observed').not.toBeNull();
    expect(r.oceanDepth.stop, '…and it is shallower than the level the stitch needs').toBeLessThan(13);
    expect(r.tokyoDepth.stop, 'over Tokyo nothing says imagery stops — so nothing may block it').toBeNull();
    expect(r.tokyoDepth.have, 'and real imagery was seen at least at the tile fetched').toBeGreaterThanOrEqual(12);
  });
});
