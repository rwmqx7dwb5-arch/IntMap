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
import { loadLazyModules } from './helpers/app.js';

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
    /* ⚠ (#R209) ASK FOR THE PANEL BEFORE DRIVING IT. js/lazy-modules.js took the seismic module out of
       the boot bundle, so `window.IntMapSeismic` does not exist until something requests it — the
       right-click item that opens this panel awaits `IntMapLazy.need('seismic')` first, and a spec
       that drives the panel does the same thing rather than waiting for a global nobody asked for. */
    await loadLazyModules(page);
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
    for (const nth of [0, 1]) {
      /* ⚠ (#R300) PRESS ◎ UNTIL THE PICK IS LIVE, WHICH IS AT MOST TWICE. #R212 merged the two
         controls into this one and #R218 then gave it an OFF state — 「どちらも、もう一度クリック
         したら選択解除されるように。」 — so a single press ARMS from 'none' and DISARMS from 'epi'.
         After the first tap the segment is still lit while the pick itself has ended, so the second
         time round one press turned it off and this file has been red on the nightly ever since.
         The loop is bounded and asserts nothing: if two presses cannot make the pick live, the
         assertion below still fails, which is the point. */
      await page.evaluate(async () => {
        const p = document.getElementById('sq-panel'), b = p.querySelector('.sq-cm-epi');
        for (let i = 0; i < 2 && getComputedStyle(p).pointerEvents !== 'none'; i++) {
          b.click(); await new Promise((r) => setTimeout(r, 300));
        }
      });
      await page.waitForTimeout(350);
      /* ⚠ (#R207) THIS ASSERTED THE MECHANISM, NOT THE MEASUREMENT. What #R196 measured is that the
         tap point is the CANVAS — that the panel is not standing between the user and the map — and
         the way it achieved that was to set `display:none`. 「震源地を設置ボタンを押すとポップアップ
         が消えるのは不要」: #R207 keeps the panel on screen and takes it out of HIT-TESTING instead,
         so `elementsFromPoint` at the tap point still returns the canvas while the panel is still
         readable. The premise above (the panel covers >50 % of a phone map) is unchanged, and so is
         the assertion below it; what changes is that "out of the way" now means untouchable rather
         than invisible.
         ══ ⚠⚠ (#R300) …AND THE POINT IS FOUND, NOT WRITTEN DOWN, BECAUSE #R219 MADE THE ANSWER
         DEPEND ON WHAT IS UNDER IT. Two fixed coordinates stood here and one of them now lands on a
         `.sq-row`, which is CORRECT: 「◎ をクリックしたら、その後にポップアップ上でクリックしても、
         その直下の地図がクリックされた判定になってしまう」 — so `.im-pick-ghost` puts the box at
         `pointer-events:none` and its own interactive descendants back at `auto`. The panel's
         SURFACE lets a tap through; its CONTROLS are still controls. Both halves are asserted here,
         and the tap uses a surface point the scan actually found — which is also the only way this
         test survives the panel's layout changing again. */
      const probe = await page.evaluate(() => {
        const p = document.getElementById('sq-panel');
        const r = p.getBoundingClientRect();
        const surface = [], controls = [];
        for (let y = Math.ceil(r.top) + 2; y < r.bottom - 2; y += 6) {
          for (let x = Math.ceil(r.left) + 2; x < r.right - 2; x += 6) {
            const e = document.elementsFromPoint(x, y)[0];
            if (!e) continue;
            if (e.tagName === 'CANVAS') surface.push([x, y]);
            else if (p.contains(e)) controls.push([x, y, e.tagName + '.' + String(e.className).slice(0, 24)]);
          }
        }
        return {
          surface, controls,
          panelStepsAside: getComputedStyle(p).pointerEvents === 'none' || p.style.display === 'none',
          panelVisible: p.style.display !== 'none',
          barShown: !!document.getElementById('im-pick-bar') && getComputedStyle(document.getElementById('im-pick-bar')).display !== 'none',
        };
      });
      expect(probe.panelStepsAside, 'the panel is out of the way of the pointer while the pick is live').toBe(true);
      expect(probe.panelVisible, '…without disappearing (#R207)').toBe(true);
      expect(probe.barShown, 'and a banner says what is being placed').toBe(true);
      expect(probe.surface.length, 'the panel SURFACE lets a tap through to the map (#R196/#R207)').toBeGreaterThan(20);
      expect(probe.controls.length, '…and its own controls are still controls (#R219)').toBeGreaterThan(0);

      /* two different surface points, so the two taps really are two different places */
      const [x, y] = probe.surface[Math.floor(probe.surface.length * (nth ? 0.75 : 0.25))];
      await page.mouse.click(x, y);
      await page.waitForTimeout(900);
      const st = await page.evaluate(() => { const p = document.getElementById('sq-panel');
        return { epi: window.IntMapSeismic.state().epi, pe: getComputedStyle(p).pointerEvents, disp: p.style.display }; });
      expect(st.pe, 'and the panel is touchable again straight away').not.toBe('none');
      expect(st.disp, 'and it never left').not.toBe('none');
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
  /* ⚠ (#R209) …and the same for BOTH panels this test plays off against each other: seismic and
     tsunami are on-demand now (js/lazy-modules.js), so the wait below can only be satisfied by
     asking. The wait itself is kept — it is this test's own statement that the two modules arrived. */
  await loadLazyModules(page);
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

    /* ⚠ (#R197) PIN THE CLOCK — AND THIS IS NOT WHY IT WAS FAILING. Recorded because the wrong
       hypothesis is worth as much as the right one here.
       `horizon-color` FOLLOWS THE SUN (#R196 §2: a static colour cannot imitate Cesium's
       SkyAtmosphere, which is bright on the day side and dark on the night side), so this test's
       answer depended on the hour it ran at. That looked like the cause of the failure seen on this
       machine. It is not: with the clock pinned to local noon the band still comes back with
       limb[2] − limb[0] = 0 EXACTLY — R and B identical, a perfectly neutral grey, which no mixture
       of a blue horizon and black space produces. The same test fails identically on origin/main
       (verified in a separate worktree, same machine, same minutes), so it is pre-existing and
       not this round's. The remaining suspect is the 7 s settle: this machine has been running
       Playwright loads all round, and a frame captured before the atmosphere is drawn is exactly a
       neutral grey. That is a measurement to make on an idle machine, not a guess to ship.
       The pin is kept anyway: it removes one real source of nondeterminism from a pixel test. */
    await page.evaluate(() => {
      window.IntMapTime.set(new Date(Date.UTC(2026, 5, 21, 3, 0, 0)), { allowFuture: true, source: 'test' });
      window.IntMapGeoEngine.camera.jumpTo({ center: [138.7, 35.2], zoom: 5, pitch: 60, bearing: 0 });
    });
    await page.waitForTimeout(7000);
    /* and prove the pin took, so a silently-ignored clock cannot make this pass for the wrong reason */
    const sunEl = await page.evaluate(() => {
      const S = window.IntMapSky, T = window.IntMapTime;
      const ms = +T.when(), s = S.sunPosition(ms), g = S.gmstDeg(ms);
      const lng = ((s.ra - g + 540) % 360) - 180;
      const d = Math.acos(Math.max(-1, Math.min(1, Math.sin(s.dec * Math.PI / 180) * Math.sin(35.2 * Math.PI / 180)
        + Math.cos(s.dec * Math.PI / 180) * Math.cos(35.2 * Math.PI / 180) * Math.cos((138.7 - lng) * Math.PI / 180)))) * 180 / Math.PI;
      return 90 - d;
    });
    expect(sunEl, 'the clock is pinned to daylight over the camera').toBeGreaterThan(20);
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

/* ── ④ 「ズームアウトするほど…夜間光が見えるように」 → MOVED to tests/r201.spec.js ① ────────────
   #R201 replaced the five nested twilight polygons this test measured with ONE per-pixel canvas
   (「階段状で不自然」/「夜の部分は完全に夜間光レイヤーと同じ画像に」), so every assertion here was
   about a mechanism that no longer exists. They are not weakened — r201 ① asserts the same solar
   computation and the same on/off pixel comparison at a HIGHER threshold, plus the gradient the
   old shape could not have. Deleted rather than duplicated: scripts/test-budget.mjs. */

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
