/* ============================================================================
 *  R196 — the five things only a real renderer can answer.
 *
 *  ① The epicentre can be placed AGAIN, on a phone. The gesture was never broken;
 *     the panel was standing on the map it asked to be tapped, and that is a fact
 *     about layout, so only a laid-out page can assert it.
 *  ② The tsunami model follows the earthquake next door instead of being frozen
 *     at whatever it was handed when it opened.
 *  ③ The map basemap has a sky. Measured as PIXELS: the band inside the globe's
 *     limb has to be BLUE, which is what an atmosphere is and what a missing one
 *     is not.
 *  ④ The night side darkens as the camera pulls back, and is gone close in.
 *  ⑤ The satellite prefetch does not ask for a tile it has already asked for.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';

const BOOT = { timeout: 90_000 };
const ready = async (page) => {
  await page.goto('/?rafshim=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.IntMapGeoEngine && window.IntMapGeoEngine.ready(), null, BOOT);
  await page.waitForTimeout(1500);
};

/* ── ① 「地震シミュレーター、地点を選びなおせない。」 ───────────────────────────────────────── */
test.describe('R196 ① the epicentre, on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the panel steps aside so the map can be tapped, twice', async ({ page }) => {
    test.setTimeout(180_000);
    await ready(page);
    await page.evaluate(() => window.IntMapSeismic.open({ lng: 142.0, lat: 38.0, mw: 7.5, depth: 20 }));
    await page.waitForTimeout(1200);

    /* the geometry that caused the report: this panel covers the map it asks to be tapped */
    const covers = await page.evaluate(() => {
      const p = document.getElementById('sq-panel').getBoundingClientRect();
      const m = document.getElementById('map').getBoundingClientRect();
      return (p.width * p.height) / (m.width * m.height);
    });
    expect(covers, 'the panel really does cover most of a phone screen — that is the premise').toBeGreaterThan(0.5);

    const seen = [];
    for (const [x, y] of [[195, 480], [120, 620]]) {
      await page.click('#sq-panel .sq-pick');
      await page.waitForTimeout(350);
      const mid = await page.evaluate(([px, py]) => {
        const e = document.elementsFromPoint(px, py)[0];
        return {
          panelHidden: document.getElementById('sq-panel').style.display === 'none',
          barShown: !!document.getElementById('im-pick-bar') && getComputedStyle(document.getElementById('im-pick-bar')).display !== 'none',
          top: e ? e.tagName + '.' + String(e.className).slice(0, 24) : 'none',
        };
      }, [x, y]);
      expect(mid.panelHidden, 'the panel is out of the way while the pick is live').toBe(true);
      expect(mid.barShown, 'and a banner says what is being placed').toBe(true);
      expect(mid.top, 'so the tap point really is the map').toContain('CANVAS');

      await page.mouse.click(x, y);
      await page.waitForTimeout(900);
      const st = await page.evaluate(() => ({ epi: window.IntMapSeismic.state().epi, panel: document.getElementById('sq-panel').style.display }));
      expect(st.panel, 'and the panel comes straight back').toBe('flex');
      seen.push(st.epi.map((v) => +v.toFixed(3)));
    }
    /* ⚠ THE ASSERTION. Two different taps must give two different epicentres — before this round the
       first moved it (whoever opened the panel had) and the second could not reach the map at all. */
    expect(seen[0][0]).not.toBeCloseTo(142.0, 1);
    expect(seen[1]).not.toEqual(seen[0]);
  });
});

/* ── ② 「津波シミュレーターも、初期の地震しか対応していない。」 ─────────────────────────────── */
test('R196 ② the tsunami model follows the earthquake it came from', async ({ page }) => {
  test.setTimeout(400_000);
  await ready(page);
  await page.waitForFunction(() => !!window.IntMapTsunami && !!window.IntMapSeismic, null, { timeout: 30_000 });

  const r = await page.evaluate(async () => {
    const until = async (f, ms) => { const e = performance.now() + ms; while (performance.now() < e) { if (f()) return true; await new Promise((r2) => setTimeout(r2, 200)); } return false; };
    /* one hour of propagation, not three: this test is about WHOSE earthquake the model is
       showing, and the answer does not depend on how far the wave has travelled. The solve is the
       whole cost of the test — steps scale with the simulated time — and #R196's own note is that a
       spec nobody has measured is charged the median and mis-packs the shard it lands on. */
    window.IntMapTsunami.open({ lng: 142.37, lat: 38.32, mw: 9.0, depth: 24, hours: 1 });
    await until(() => { const s = window.IntMapTsunami.state(); return (s.sim && !s.busy) || s.err; }, 260_000);
    const first = window.IntMapTsunami.state();

    /* move the epicentre in the SEISMIC panel — the tsunami panel is not touched */
    window.IntMapSeismic.open({ lng: 142.37, lat: 38.32, mw: 9.0, depth: 24 });
    window.IntMapSeismic.setEpicentre(148.5, 44.0);
    await new Promise((r2) => setTimeout(r2, 400));
    const queued = window.IntMapTsunami.state();
    await until(() => window.IntMapTsunami.state().busy, 8000);
    await until(() => { const s = window.IntMapTsunami.state(); return (s.sim && !s.busy) || s.err; }, 260_000);
    const second = window.IntMapTsunami.state();
    return { firstEpi: first.epi, firstSim: !!first.sim, queuedEpi: queued.epi, queuedFlag: queued.following,
             secondEpi: second.epi, secondSim: !!second.sim, err: second.err };
  });

  expect(r.firstSim, 'the first run produced a model').toBe(true);
  expect(r.firstEpi[0]).toBeCloseTo(142.37, 2);
  /* the new source is adopted at once, and the re-run is QUEUED rather than fired per keystroke */
  expect(r.queuedEpi[0], 'the panel adopts the new epicentre immediately').toBeCloseTo(148.5, 2);
  expect(r.queuedFlag, 'and says a recompute is coming').toBe(true);
  expect(r.secondEpi[0], 'and the model that is finally built is the new event').toBeCloseTo(148.5, 2);
  expect(r.secondSim, 'which really is a model').toBe(true);
});

/* ── ③ 「Cesiumと同じ大気・空のエフェクトをMapLibreでも。（現在は空が真っ暗であるため）」 ────── */
test.describe('R196 ③ the sky', () => {
  test.use({ colorScheme: 'dark' });

  test('the DEFAULT basemap has an atmosphere, and it is blue', async ({ page }) => {
    test.setTimeout(240_000);
    await ready(page);
    const sky = await page.evaluate(() => window.IntMapGeoEngine.scene.getSky());
    /* before this round there was no `sky` at all unless the SATELLITE basemap was on */
    expect(sky, 'the map basemap carries a sky block').toBeTruthy();
    expect(sky['fog-ground-blend'], 'and no ground haze').toBe(1);
    expect(sky['horizon-fog-blend']).toBe(0);

    await page.evaluate(() => window.IntMapGeoEngine.camera.jumpTo({ center: [138.7, 35.2], zoom: 5, pitch: 60, bearing: 0 }));
    await page.waitForTimeout(7000);
    const clip = await page.evaluate(() => { const m = document.getElementById('map').getBoundingClientRect(); return { x: m.x, y: m.y, width: m.width, height: m.height }; });
    const shot = (await page.screenshot({ clip })).toString('base64');
    const band = await page.evaluate(async (b64) => {
      const img = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      /* the arc just above the Earth's edge, and the sky well above it */
      const strip = (fy) => {
        const d = x.getImageData(Math.round(img.width * 0.25), Math.round(img.height * fy), Math.round(img.width * 0.5), Math.max(1, Math.round(img.height * 0.02))).data;
        let r = 0, g = 0, bl = 0; const n = d.length / 4;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; bl += d[i + 2]; }
        return [r / n, g / n, bl / n];
      };
      /* find the brightest row in the upper half — that is the limb */
      let best = -1, bestY = 0.2;
      for (let fy = 0.10; fy < 0.42; fy += 0.01) { const [r, g, bl] = strip(fy); const s = r + g + bl; if (s > best) { best = s; bestY = fy; } }
      return { limb: strip(bestY).map(Math.round), space: strip(0.02).map(Math.round), at: +bestY.toFixed(2) };
    }, shot);

    /* ⚠ THE ASSERTION, IN PIXELS. An atmosphere is BLUE — measured on Cesium at the same camera the
       band reads [31,41,55]; MapLibre read [46,46,46] (neutral grey: no atmosphere at all). */
    expect(band.limb[2], 'the band above the horizon is brighter than empty space').toBeGreaterThan(band.space[2] + 12);
    expect(band.limb[2] - band.limb[0], 'and it is BLUE, not grey').toBeGreaterThan(6);
  });
});

/* ── ④ 「ズームアウトするほど太陽の当たっていない部分が暗くなり、夜間光が見えるように」 ──── */
test('R196 ④ the night side fades in as the camera pulls back, and is absent close in', async ({ page }) => {
  test.setTimeout(240_000);
  await ready(page);
  /* wide enough for the effect to build itself */
  await page.evaluate(() => window.IntMapGeoEngine.camera.jumpTo({ center: [0, 10], zoom: 1.2, pitch: 0, bearing: 0 }));
  await page.waitForTimeout(4000);
  const wide = await page.evaluate(() => window.IntMapNightSide.state());
  expect(wide.built, 'the night side builds itself at a whole-Earth zoom').toBe(true);

  const seen = await page.evaluate(() => {
    const m = window.__imap;
    return { shade: !!m.getLayer('im-night-shade'), op: m.getPaintProperty('im-night-shade', 'fill-opacity') };
  });
  expect(seen.shade, 'the shade layer really is in the style — a rejected paint expression is silent').toBe(true);
  /* the ramp is a zoom expression, so panning and zooming cost the renderer what they already cost */
  expect(Array.isArray(seen.op) && seen.op[0]).toBe('interpolate');
  expect(seen.op[seen.op.length - 1], 'and it is zero by the time a continent fills the view').toBe(0);

  /* the terminator is a real solar computation: midnight and noon on the same meridian differ */
  const night = await page.evaluate(() => {
    const d = new Date(Date.UTC(2026, 5, 21, 12, 0, 0));    /* solstice noon UTC: 0°E is lit */
    return { lit: window.IntMapNightSide._nightAt(0, 0, d), dark: window.IntMapNightSide._nightAt(180, 0, d) };
  });
  expect(night.lit, 'the sub-solar meridian is day').toBeLessThan(0.05);
  expect(night.dark, 'and the antimeridian is night').toBeGreaterThan(0.95);
});

/* ── ⑤ 「モバイル版で、衛星画像が圧倒的に重い。」 ─────────────────────────────────────────── */
test.describe('R196 ⑤ the satellite prefetch', () => {
  test.use({ viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', isMobile: true, hasTouch: true });

  test('does not ask twice for a tile it has already asked for', async ({ page }) => {
    test.setTimeout(240_000);
    const reqs = [];
    page.on('request', (r) => { if (/World_Imagery/.test(r.url())) reqs.push(r.url()); });
    await ready(page);
    await page.evaluate(() => { const b = document.getElementById('btn-view-sat'); if (b) b.click(); });
    await page.evaluate(() => window.IntMapGeoEngine.camera.jumpTo({ center: [139.767, 35.681], zoom: 12, pitch: 0, bearing: 0 }));
    await page.waitForTimeout(8000);

    reqs.length = 0;
    await page.evaluate(async () => { for (let i = 0; i < 16; i++) { window.__imap.panBy([40, 24], { duration: 0 }); await new Promise((r) => setTimeout(r, 250)); } });
    await page.waitForTimeout(2500);

    const counts = {};
    for (const u of reqs) counts[u] = (counts[u] || 0) + 1;
    const distinct = Object.keys(counts).length;
    const worst = Math.max(0, ...Object.values(counts));
    /* ⚠ THE ASSERTION. Before this round: 865 requests for 112 distinct tiles in one six-second pan,
       the worst tile fetched once per pan step. The prefetch ring was recomputed and re-issued whole
       every time the camera settled. A tile may still be asked for twice — the render path and the
       prefetch are allowed to want it independently — but never once per gesture. */
    expect(distinct, 'the pan really did pull in tiles').toBeGreaterThan(10);
    expect(worst, 'no tile is re-requested on every step of a pan').toBeLessThanOrEqual(3);
    expect(reqs.length / distinct, 'and the total stays close to the number of distinct tiles').toBeLessThan(2.2);
  });
});
