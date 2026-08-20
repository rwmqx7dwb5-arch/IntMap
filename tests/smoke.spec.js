// Smoke test: does IntMap actually RUN in a real browser?
// One shared boot (the app is a large single-file page), then focused assertions that
// map 1:1 to the commission's §4.4 checklist. Distinguishes a genuine product breakage
// (uncaught exception, missing UI, blank screen) from a blocked external API (benign).
import { test, expect } from '@playwright/test';
import { installHermeticRouting, collectPageDiagnostics } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

// Critical globals that MUST exist for the app to be functional. (The page defines ~60
// window.IntMap* modules; these are the load-bearing ones checked as a boot signal.)
const CRITICAL_GLOBALS = [
  'IntMapOS', 'IntMapLayers', 'IntMapConsole', 'IntMapTime',
  'IntMapShare', 'IntMapAtlasQA', 'IntMapRegionResolver',
];

test.describe.configure({ mode: 'serial' });

let page, diag, response;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: seededStorageState() });
  await installHermeticRouting(context);
  // Count real DOCUMENT loads (survives reloads via sessionStorage; NOT incremented by the
  // app's same-document hash updates for shareable URLs). This is the honest reload-loop signal.
  await context.addInitScript(() => {
    try {
      const n = parseInt(sessionStorage.getItem('__smokeDocLoads') || '0', 10) + 1;
      sessionStorage.setItem('__smokeDocLoads', String(n));
    } catch { /* ignore */ }
  });
  /* ══ (#R286) EVERY URL THE APP HANDS TO AN <img>, RECORDED AT THE ONE DOOR THEY ALL PASS ═══════
     The round's defect was a tile template whose scheme only a REGISTERED PROTOCOL understands
     (`imapsat://…`, js/sat-proto.js) being assigned to `new Image().src`: the browser cannot fetch
     that, so nothing was warmed and index.html's `img-src` policy refused one load per tile. Pinning
     that one spelling would only ever catch the leak somebody has already thought of, so the property
     is measured where every image URL in the app must pass — the `src` setter — and it is stated as
     the CSP's own list rather than as a name. Only VIOLATIONS are kept, so a boot that loads hundreds
     of images costs one regex each and nothing else.
     ⚠ BOTH DOORS. `.src = …` and `setAttribute('src', …)` are separate paths into the same load, and
     shadowing setAttribute on the IMAGE prototype leaves every other element's untouched — measuring
     the property alone would legislate a source style instead of watching the behaviour. */
  await context.addInitScript(() => {
    try {
      window.__imgSrc = { n: 0, bad: [] };
      const note = (v) => {
        try {
          const s = String(v); window.__imgSrc.n++;
          const m = /^\s*([a-z0-9+.-]+):/i.exec(s);
          if (m && !/^(https?|data|blob)$/i.test(m[1]) && window.__imgSrc.bad.length < 40) window.__imgSrc.bad.push(s.slice(0, 140));
        } catch { /* ignore */ }
      };
      const d = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
      Object.defineProperty(HTMLImageElement.prototype, 'src', {
        configurable: true, enumerable: d.enumerable,
        get() { return d.get.call(this); },
        set(v) { note(v); d.set.call(this, v); },
      });
      const setAttr = Element.prototype.setAttribute;
      HTMLImageElement.prototype.setAttribute = function (name, value) {
        if (String(name).toLowerCase() === 'src') note(value);
        return setAttr.call(this, name, value);
      };
    } catch { /* ignore */ }
  });
  page = await context.newPage();
  diag = collectPageDiagnostics(page);
  response = await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  // Wait until the core app has booted: critical globals defined + the map container mounted.
  await page.waitForFunction(
    (globals) => globals.every((g) => typeof window[g] !== 'undefined') && !!document.getElementById('map'),
    CRITICAL_GLOBALS,
    { timeout: 45_000 },
  );
  // Let late boot work settle so we catch any deferred exceptions too.
  await page.waitForTimeout(2500);
});

test.afterAll(async () => {
  await page?.context()?.close();
});

test('serves the top page with a 2xx status (no 4xx/5xx)', async () => {
  expect(response, 'navigation returned a response').toBeTruthy();
  expect(response.status(), `HTTP status was ${response.status()}`).toBeLessThan(400);
});

test('no uncaught JavaScript exceptions (pageerror)', async () => {
  expect(diag.pageErrors, `pageerror(s):\n${diag.pageErrors.join('\n---\n')}`).toHaveLength(0);
});

test('no critical console.error from the app itself', async () => {
  // Blocked-external / network errors are filtered out by isBenign(); only app-origin errors remain.
  expect(diag.consoleErrors, `unexpected console.error(s):\n${diag.consoleErrors.join('\n---\n')}`).toHaveLength(0);
});

test('critical window.IntMap* modules are defined', async () => {
  const present = await page.evaluate(
    (globals) => globals.filter((g) => typeof window[g] !== 'undefined'),
    CRITICAL_GLOBALS,
  );
  expect(present, 'all critical globals present').toEqual(CRITICAL_GLOBALS);
});

test('the map container is mounted and visible', async () => {
  const mapEl = page.locator('#map');
  await expect(mapEl).toBeVisible();
  const box = await mapEl.boundingBox();
  expect(box, 'map container has a bounding box').toBeTruthy();
  expect(box.width).toBeGreaterThan(100);
  expect(box.height).toBeGreaterThan(100);
});

test('the layer UI initialised (~130 layer rows built)', async () => {
  const rows = await page.locator('.lyr-row').count();
  // The catalogue builds ~130 rows; assert a healthy lower bound so a boot that half-builds
  // the UI (a classic index.html regression) fails loudly, without being brittle to +/- a few.
  expect(rows, `only ${rows} .lyr-row elements built`).toBeGreaterThanOrEqual(100);
});

test('the initial screen is not blank', async () => {
  const text = (await page.locator('body').innerText()).trim();
  expect(text.length, 'body has visible text').toBeGreaterThan(20);
  const visibleControls = await page.locator('button:visible, [role="button"]:visible').count();
  expect(visibleControls, 'has visible interactive controls').toBeGreaterThan(0);
});

test('no infinite-reload loop', async () => {
  // The app writes the map camera into the URL hash (shareable links), which fires
  // framenavigated without reloading — so count real DOCUMENT loads instead. A fresh
  // context has empty storage, so the stale-build guard must not reload: expect exactly 1
  // (allow 2 for a single legitimate stale-guard reload); more means a reload loop.
  const docLoads = await page.evaluate(() => Number(sessionStorage.getItem('__smokeDocLoads') || '0'));
  expect(docLoads, `document loads: ${docLoads} (hash updates seen: ${diag.navigations.length})`).toBeLessThanOrEqual(2);
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 *  #R207 — THE ROUND'S BROWSER REGRESSIONS LIVE HERE, NOT IN A FILE OF THEIR OWN
 * ----------------------------------------------------------------------------------------------
 *  「毎回毎回、テストに時間がかかりすぎ。…テスト時間が短くなりさえすればなんでもいい。」
 *
 *  MEASURED: a per-round spec file that boots this app costs 29–37 s, and almost all of it IS the
 *  boot — six assertions written against an already-booted page cost milliseconds. Four rounds have
 *  made the suite cheaper by moving files between tiers and machines; the thing none of them changed
 *  is that every round adds another full boot to the total, for ever. #R204 named the shape («the
 *  gate grows by one file per round»); this is the same accumulation one level down, in the TOTAL.
 *
 *  So this round adds NO spec file. Its browser assertions are appended to the suite that is always
 *  in the gate and has already paid for a boot, so R207's browser coverage costs the time its
 *  assertions take rather than another 30 s of Chromium starting up. The source-level half stays
 *  where it belongs: tests/r207-checks.test.mjs, ~100 ms, no browser at all.
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */

/* ① 「初回時にはmapではなくsatelliteに。3Dはオフ。」 — asked of the RENDERER and of the control,
   not of a module-private variable (`IM_HOST` is a closure const and never reaches `window`), and
   "which layer is actually painting" is the invariant anyway. */
test('R207 ① a fresh session opens on the satellite basemap with 3-D off', async () => {
  await page.waitForFunction(() => {
    try { return window.__imap.getLayoutProperty('layer-sat', 'visibility') === 'visible'; } catch { return false; }
  }, null, { timeout: 30_000 });
  const seen = await page.evaluate(() => ({
    satVisible: window.__imap.getLayoutProperty('layer-sat', 'visibility'),
    satActive: !!document.getElementById('btn-view-sat')?.classList.contains('active'),
    mapActive: !!document.getElementById('btn-view-map')?.classList.contains('active'),
    d3Active: !!document.getElementById('btn-view-3d')?.classList.contains('active'),
    terrain: !!window.__imap.getTerrain(),
  }));
  expect(seen.satVisible, 'the satellite layer is the one painting').toBe('visible');
  expect(seen.satActive, 'and the Satellite segment is the lit one').toBe(true);
  expect(seen.mapActive, 'and Map is not').toBe(false);
  expect(seen.terrain, '3-D terrain is not attached').toBe(false);
  expect(seen.d3Active).toBe(false);
});

/* ② 「MapLibreで南極付近が衛星画像零の暗黒領域になっている。」 Web Mercator ends at ±85.0511° and
   the globe is drawn to ±90°, so no raster source in this style can cover the caps. The invariant is
   that something opaque is underneath, that it is at the BOTTOM of the style (a background layer
   anywhere else is a curtain over the map), and that it is not the black it used to be. */
test('R207 ② the polar caps have an opaque floor beneath every layer', async () => {
  const seen = await page.evaluate(async () => {
    const m = window.__imap;
    try { window.IntMapWorldBase && window.IntMapWorldBase.apply(true); } catch { /* ignore */ }
    for (let i = 0; i < 12; i++) {
      const c = m.getPaintProperty('layer-polar-cap', 'background-color');
      if (c && c !== '#e9edf2') break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const ids = m.getStyle().layers.map((l) => l.id);
    return {
      first: ids[0], idx: ids.indexOf('layer-polar-cap'),
      vis: m.getLayoutProperty('layer-polar-cap', 'visibility'),
      colour: String(m.getPaintProperty('layer-polar-cap', 'background-color') || '').toLowerCase(),
    };
  });
  expect(seen.idx, 'the cap exists in the style').toBeGreaterThanOrEqual(0);
  expect(seen.first, 'and it is beneath everything').toBe('layer-polar-cap');
  expect(seen.vis, 'it is shown with the satellite basemap').toBe('visible');
  expect(seen.colour).not.toBe('#000000');
  expect(seen.colour).not.toBe('rgba(0, 0, 0, 1)');
});

/* ③ 「地図上の他のものをクリックした際は、その下にある地名ラベルを同時にクリックした判定になる
   ことがある」 — the rank is only enforceable if the app knows what else is clickable, so that
   registry is what is measured: populated, and not made only of the label layers. */
test('R207 ③ the engine records the clickable layers, and the labels are not the whole list', async () => {
  const LBL = ['ofm-country', 'ofm-admin1', 'ofm-city', 'ofm-other', 'geo-sea', 'ofm-water', 'ofm-water2', 'ofm-river', 'ofm-peak'];
  const seen = await page.evaluate((lbl) => {
    let all = [];
    try { all = window.IntMapGeoEngine.events.clickLayers(); } catch { /* ignore */ }
    return { n: all.length, labels: all.filter((i) => lbl.includes(i)).length, others: all.filter((i) => !lbl.includes(i)).length };
  }, LBL);
  expect(seen.n, 'click registrations are recorded through the contract').toBeGreaterThan(0);
  expect(seen.labels, 'the label layers are among them').toBeGreaterThan(0);
  expect(seen.others, 'and so are layers that must OUTRANK them').toBeGreaterThan(0);
});

/* ④ 「ティッカーの項目選択欄は、オフ時は表示せず、オン時にだけ表示されるように。」 */
test('R207 ④ the ticker item picker follows the ticker switch', async () => {
  const seen = await page.evaluate(() => {
    const sel = document.getElementById('setting-ticker'), host = document.getElementById('ticker-syms');
    if (!sel || !host) return null;
    const out = {};
    sel.value = 'off'; window._populateTickerSyms && window._populateTickerSyms();
    out.offDisplay = host.style.display; out.offHtml = host.innerHTML.length;
    sel.value = 'on'; window._populateTickerSyms && window._populateTickerSyms();
    out.onDisplay = host.style.display; out.onHtml = host.innerHTML.length;
    sel.value = 'off'; window._populateTickerSyms && window._populateTickerSyms();
    return out;
  });
  expect(seen, 'the settings markup is present').not.toBeNull();
  expect(seen.offDisplay, 'off → the picker is not on screen').toBe('none');
  expect(seen.offHtml, 'and it is not merely hidden with its contents left behind').toBe(0);
  expect(seen.onDisplay, 'on → the picker is shown').not.toBe('none');
  expect(seen.onHtml, 'with rows in it').toBeGreaterThan(0);
});

/* ⑤ 「デスクトップ版の設定画面の横幅が狭すぎる。」 The number is not the point; the RELATION is —
   Settings must be wider than the 340 px generic dialog width it used to borrow. */
test('R207 ⑤ Settings is wider than the generic modal on a desktop viewport', async () => {
  const before = page.viewportSize();
  await page.setViewportSize({ width: 1440, height: 900 });
  const w = await page.evaluate(async () => {
    document.getElementById('btn-open-settings')?.click();
    await new Promise((r) => setTimeout(r, 250));
    const mc = document.querySelector('#settings-modal .modal-content');
    const width = mc ? mc.getBoundingClientRect().width : 0;
    document.getElementById('settings-close-x')?.click();
    return width;
  });
  if (before) await page.setViewportSize(before);   // leave the page as this suite found it
  expect(w, 'the settings card is measurably wider than the 340 px it used to borrow').toBeGreaterThan(340);
});

/* ⑥ space: 「実寸大とモデル大を切り替えると視点位置が変な場所に飛ばされる」 and
   「月を拡大したら地球に戻ってしまうのはおかしい」. Driven through the module's public API rather
   than through the WebGL view, so this costs milliseconds and no frames. */
test('R207 ⑥ switching the space scale keeps the framing; only the Earth hands the map back', async () => {
  const seen = await page.evaluate(() => {
    const S = window.IntMapSpace;
    if (!S || !S.setScale || !S.state) return { skip: true };
    S.setScale('model'); const a = S.state();
    S.setScale('real'); const b = S.state();
    S.setScale('model'); const c = S.state();
    S.setBody && S.setBody('moon'); const moon = S.state();
    S.setBody && S.setBody('earth');
    return { skip: false, aDist: a.dist, bDist: b.dist, backDist: c.dist,
      aScale: a.scale, bScale: b.scale, moonNear: moon.atNearLimit, moonFocus: moon.focus };
  });
  test.skip(!!seen.skip, 'the space explorer exposes no state surface in this build');
  expect(seen.aScale).toBe('model');
  expect(seen.bScale, 'the switch actually changes the scale').toBe('real');
  expect(seen.aDist, 'the camera distance is a real number in both scales').toBeGreaterThan(0);
  expect(seen.bDist).toBeGreaterThan(0);
  /* the FRAMING survives the round trip — that is what 「視点位置が変な場所に飛ばされる」 was about */
  expect(Math.abs(seen.backDist - seen.aDist) / seen.aDist,
    'model → real → model returns to the same framing').toBeLessThan(0.02);
  expect(seen.moonFocus).toBe('moon');
  expect(seen.moonNear, 'with the Moon as the subject, zooming in must not hand the map back').toBe(false);
});

/* ══ #R208 ═══════════════════════════════════════════════════════════════════════════════════════
   Appended here rather than given a spec file of their own, for the reason #R207 MEASURED: adding
   six assertions to this file moved it 29.6 s → 29.2 s, because the assertions are free and the
   BOOT is the whole price. Everything answerable without a browser is in tests/r208-checks.test.mjs
   (~1 s, starts nothing); what is left here is what genuinely needs the running application. */

/* ⑦ 「Gazetteer拡張（cities1000相当15万件、圧縮して数MB、クライアント同梱）」 — end to end: the
   compressed artefact is fetched over HTTP, un-gzipped by the browser, and reaches the locator.
   ⚠ Driven through the module's own `warm()` so this tests the shipped path, not a re-implementation
   of it; a host that served the file with Content-Encoding would be caught here and nowhere else. */
test('R208 ⑦ the gzipped world gazetteer loads in the browser and reaches the locator', async () => {
  const r = await page.evaluate(async () => {
    const G = window.IntMapGazetteer;
    if (!G || !G.warm) return { skip: true };
    const rows = await G.warm();
    const meta = G.worldMeta && G.worldMeta();
    return { skip: false, rows: (rows || []).length, url: G.worldUrl,
      count: meta && meta.count, attribution: meta && meta.attribution, langs: (meta && meta.langs) || [] };
  });
  test.skip(!!r.skip, 'no gazetteer module in this build');
  expect(r.url, 'the client asks for the compressed artefact').toMatch(/gazetteer-world\.json\.gz$/);
  expect(r.count, 'all 148k rows arrived — DecompressionStream really ran').toBeGreaterThan(120000);
  expect(r.rows, 'and were converted for the locator').toBeGreaterThan(0);
  expect(r.attribution, 'the source travels with the data (standing instruction 4)').toMatch(/GeoNames/);
  expect(r.langs.length, 'the languages it carries are declared').toBeGreaterThanOrEqual(10);
});

/* ⑧ 「太陽系外のはるか遠くまでズームアウト」. The stars are no longer painted on a shell that
   follows the camera; they sit at the distances the Hipparcos parallaxes measure, so flying out
   actually goes somewhere. Asked through the module's state rather than by counting pixels — the
   claim is about the mechanism, and #R203 spent a round learning that a pixel count answers a
   different question. */
test('R208 ⑧ the space camera can leave the solar system, and the stars have real depth', async () => {
  const s = await page.evaluate(async () => {
    const S = window.IntMapSpace;
    if (!S || !S.state || !S.open) return { skip: true };
    await S.open();
    const t0 = Date.now();
    /* the catalogue is fetched on first draw; wait for the field rather than sleeping for it */
    while (Date.now() - t0 < 20000 && !S.state().starDepth) await new Promise((r) => setTimeout(r, 200));
    S.setScale && S.setScale('real');
    const real = S.state();
    S.setScale && S.setScale('model');
    const model = S.state();
    S.close && S.close();
    return { skip: false, real, model };
  });
  test.skip(!!s.skip, 'the space explorer exposes no state surface in this build');
  expect(s.real.starDepth, 'the stars are placed from their measured parallaxes').toBe(true);
  /* 1 pc = 206,264.8 AU and the nearest star is 1.34 pc, so a true-scale ceiling below ~276,000
     cannot reach ANY star — 10,000 AU (the old literal) is inside the Oort cloud. */
  expect(s.real.distCeil, 'true scale must reach past the nearest star').toBeGreaterThan(276000 * 2);
  expect(s.real.starFarEdge, 'and the star field extends at least that far').toBeGreaterThan(276000);
  /* model scale compresses distance by the same power law it applies to the planets — if the stars
     used raw AU there, the whole solar system would collapse into one pixel */
  expect(s.model.distCeil, 'the model-scale ceiling is the compressed one').toBeLessThan(s.real.distCeil);
  expect(s.model.starFarEdge).toBeLessThan(s.real.starFarEdge);
  expect(s.model.starFarEdge, 'and is still the outermost thing in the scene').toBeGreaterThan(0);
});

/* ══ #R276 ═══════════════════════════════════════════════════════════════════════════════════════
   Appended here rather than given a spec file of their own, for the reason #R207 MEASURED: the
   assertions are free and the BOOT is the whole price. Everything answerable without a browser is
   in tests/r276-checks.test.mjs; the LIVE-data half (a typhoon eye in the rendered raster, the
   readout against the field it is standing on, the forecast axis against the real feed) is in
   tests/prod-smoke.spec.js, because it needs data this hermetic context deliberately blocks.

   ⚠ AND THAT BLOCK IS ITSELF ONE OF THE THINGS THIS ROUND HAS TO PROVE. 「API失敗」 is on the list:
   with map-tiles.open-meteo.com unreachable, the wind layer must SAY SO rather than show a picture
   that is not there. This context blocks every host but the two boot CDNs, so it is the honest
   place to ask. */

test('R276 ⑯ the weather model and its renderer are on the page, and the SDK is only fetched when asked for', async () => {
  const s = await page.evaluate(() => ({
    ec: typeof window.IntMapECMWF, gl: typeof window.IntMapWindGL,
    api: Object.keys(window.IntMapECMWF || {}).sort(),
    sdkLoaded: !!window.IntMapECMWF.sdk(),
    webgl: window.IntMapWindGL.supported(),
  }));
  expect(s.ec, 'the ECMWF model publishes itself').toBe('object');
  expect(s.gl, 'and so does the particle renderer').toBe('object');
  expect(s.api, 'the model exposes the surface every reader of it uses').toEqual(
    expect.arrayContaining(['omUrl', 'load', 'sampler', 'valueNow', 'legend', 'before', 'lift',
      'play', 'pause', 'step', 'setIndex', 'nowIndex', 'validTime', 'referenceTime', 'prefetch']));
  /* the tile SDK is 340 kB compressed; a session that never opens a weather layer must not pay it */
  expect(s.sdkLoaded, 'the SDK is not fetched at boot').toBe(false);
  expect(s.webgl, 'this browser can run the particle renderer').toBe(true);
});

test('R276 ⑰ with the model host unreachable, the wind layer says so instead of drawing nothing quietly', async () => {
  const r = await page.evaluate(async () => {
    const cb = document.getElementById('dl-wind');
    if (!cb) return { skip: true };
    if (!cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
    const t0 = Date.now();
    while (Date.now() - t0 < 20000) {
      const d = window.Wind._dbg();
      if (!d.loading && (d.lastErr || d.hasField)) break;
      await new Promise((res) => setTimeout(res, 250));
    }
    const d = window.Wind._dbg();
    const legend = (document.querySelector('#data-legend-wind .wind-legend-body') || {}).textContent || '';
    /* leave the map as we found it */
    cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true }));
    return { skip: false, dbg: d, legend };
  });
  test.skip(!!r.skip, 'no wind row in this build');
  expect(r.dbg.hasField, 'no data can have arrived — the host is blocked').toBe(false);
  expect(r.dbg.loading, 'and the attempt finished rather than hanging').toBe(false);
  expect(r.dbg.lastErr, 'the failure is recorded, not swallowed').toBeTruthy();
  expect(r.legend, 'and the legend says the field is unavailable').toMatch(
    /unavailable|nicht verfügbar|недоступны|no disponibles|取得できませんでした|indisponibles|없|無法|无法/);
});

test('R276 ⑱ the particle renderer holds a 1080p frame, and its speed does not depend on the frame rate', async () => {
  const r = await page.evaluate(async () => {
    /* An ANALYTIC field, so this measures the renderer and not the network: a solid-body vortex —
       calm at the centre, strongest on a ring — which is also the shape the eye test looks for. */
    const field = {
      uv(lat, lng, out) {
        const dx = (lng - 140) * Math.cos(lat * Math.PI / 180), dy = lat - 20;
        const r2 = Math.hypot(dx, dy) || 1e-6;
        const sp = 55 * Math.min(1, r2 / 2) * Math.exp(-r2 / 6);
        out[0] = -sp * dy / r2; out[1] = sp * dx / r2; return out;
      },
    };
    const cv = document.createElement('canvas');
    document.body.appendChild(cv);
    const R = window.IntMapWindGL.create(cv, {
      perPixels: 320, maxParts: 6000,
      project: (lng, lat) => ({ x: (lng + 180) / 360 * 1920, y: (90 - lat) / 180 * 1080 }),
      visible: () => true, zoom: () => 4,
      randomLL: () => [130 + Math.random() * 20, 10 + Math.random() * 20],
    });
    R.resize(1920, 1080, 1);
    R.setField(field);
    /* two runs at DIFFERENT step lengths: 60 Hz and 144 Hz over the same WALL-CLOCK second */
    const run = (hz) => {
      R.reseed();
      const dtMs = 1000 / hz;
      let t = 1000, drawn = 0;
      for (let i = 0; i < hz; i++) { t += dtMs; drawn = R.tick(t, false); }
      return { drawn, stats: R.stats() };
    };
    const a = run(60);
    const b = run(144);
    /* and the same again, timed for real, to price a frame at 1080p */
    R.reseed();
    let t = 5000; const t0 = performance.now();
    for (let i = 0; i < 60; i++) { t += 16.7; R.tick(t, false); }
    const wall = (performance.now() - t0) / 60;
    const st = R.stats();
    R.dispose(); cv.remove();
    return { a, b, wall, st };
  });
  expect(r.st.webgl, 'the field is drawn with WebGL').toBe(true);
  expect(r.st.w, 'at 1080p').toBe(1920);
  expect(r.a.drawn, 'a 60 Hz second draws a full field').toBeGreaterThan(500);
  expect(r.b.drawn, 'and so does a 144 Hz second').toBeGreaterThan(500);
  /* ⚠ THE POINT OF THIS TEST. The old loop moved a fixed distance PER FRAME, so 144 Hz blew the
     wind 2.4× harder. Both runs cover one wall-clock second, so both must place the particles the
     same distance downwind: the count of segments actually on screen is within a few per cent. */
  const ratio = r.b.drawn / Math.max(1, r.a.drawn);
  expect(ratio, 'the same second of wind is the same picture at either refresh rate').toBeGreaterThan(0.88);
  expect(ratio).toBeLessThan(1.14);
  /* a frame at 1080p costs a small part of a 16.7 ms budget — measured on THIS machine, and
     deliberately generous, because a shared CI runner has no GPU and this is a floor, not a target */
  expect(r.wall, 'a 1080p frame costs a fraction of the budget: ' + r.wall.toFixed(2) + ' ms').toBeLessThan(12);
});

test('R276 ⑲ the wind legend is the renderer\'s own colour table, ends where the table ends, and is opaque', async () => {
  const r = await page.evaluate(async () => {
    const EC = window.IntMapECMWF;
    await EC.loadSDK();                       /* unpkg is allowed in this context; the DATA is not */
    const lg = EC.legend('wind_u_component_10m', true);
    const sc = EC.scale('wind_u_component_10m', true);
    const raw = EC.sdk().getColorScale('wind_u_component_10m', true);   /* the SDK's own default */
    return { lg, unit: sc && sc.unit, max: sc && sc.breakpoints && sc.breakpoints[sc.breakpoints.length - 1],
      alphas: [...new Set((sc.colors || []).map((c) => c[3]))],
      overridden: JSON.stringify(raw) !== JSON.stringify(sc) };
  });
  expect(r.unit, 'the scale carries its unit').toBe('m/s');
  expect(r.lg.max, 'and the legend ends exactly where the table ends').toBe(r.max);
  expect(r.lg.min).toBe(0);
  expect(r.lg.stops.length, 'every breakpoint is a stop in the printed ramp').toBeGreaterThan(8);
  expect(r.lg.css, 'which is what the swatch is painted with').toMatch(/^linear-gradient\(to right,rgb\(/);
  /* the Windy-style table is opaque throughout — that is what stops calm air being a hole */
  expect(r.alphas, 'the wind palette is fully opaque').toEqual([1]);
  expect(r.overridden, 'and it is OUR table, not the SDK default (whose alpha ramps from 0)').toBe(true);
});

/* ══ #R286 ══════════════════════════════════════════════════════════════════════════════════════
   tests/monitors.spec.js's console-error gate failed intermittently with twenty refusals of
   「Loading the image 'imapsat://2/0/2' violates … "img-src 'self' https: data: blob:"」.
   `imapsat://` is IntMap's OWN scheme (js/sat-proto.js registers it), so a tile served through it
   never becomes a browser image load at all — the message meant some path was handing the raw
   template to the browser instead of to the handler. It was js/dash-extended.js's speculative
   prefetch, which read the ACTIVE STYLE's tile template and assigned it to `new Image().src`; the
   satellite source has held the protocol URL since #R158 and is the default basemap since #R207.
   Intermittent because that block fires only on a fast `moveend` PAIR, which the monitors spec
   produces when `_radiusFromPoint` moves the camera Tokyo → Paris.

   This asserts the whole shape rather than the absence of one string: the subject is live (the
   satellite source really is protocol-backed), the prefetch SAW that template and refused it (so a
   path that silently stopped running could not pass instead), the imagery is still warmed by the
   module that owns it, and no <img> anywhere in this session was given a scheme the page's own CSP
   cannot admit. Appended to this file rather than given a spec of its own for #R207's reason: the
   boot is already paid for here, and this file is always in the gate. */
test('R286 ⑳ the tile prefetch never hands the browser a scheme only a protocol handler understands', async () => {
  const before = diag.consoleErrors.length;
  const seen = await page.evaluate(async () => {
    const st = window.__imap.getStyle();
    const out = {
      satTiles: (st && st.sources && st.sources.satellite && st.sources.satellite.tiles) || null,
      satProto: !!window.__imSatProto,
      hasPrefetch: !!(window.SpeculativePrefetch && window.SpeculativePrefetch.prefetch),
    };
    /* the call the reported `moveend` pair makes: Paris, at the world zoom the failure named */
    window.SpeculativePrefetch.prefetch(2.35, 48.85, 2);
    await new Promise((r) => setTimeout(r, 600));
    out.last = (typeof window.SpeculativePrefetch.last === 'function') ? window.SpeculativePrefetch.last() : null;
    out.imgSeen = window.__imgSrc ? window.__imgSrc.n : null;
    out.badImg = window.__imgSrc ? window.__imgSrc.bad.slice() : null;
    return out;
  });
  /* ① the subject is live — this is only a regression if the satellite source is still the protocol's */
  expect(seen.satProto, 'the imapsat protocol is registered').toBe(true);
  expect(seen.satTiles, 'and the satellite source is served through it').toEqual(['imapsat://{z}/{y}/{x}']);
  expect(seen.hasPrefetch).toBe(true);
  /* ② THE DEFECT ITSELF, stated over every image this session has loaded rather than over one URL.
     Asserted first, so a run against the unrepaired app reports the leak rather than the instrument. */
  expect(seen.imgSeen, 'the recorder saw the app load images at all').toBeGreaterThan(0);
  expect(seen.badImg, `<img> given a scheme index.html's img-src cannot admit:\n${(seen.badImg || []).join('\n')}`).toEqual([]);
  /* ③ …and the refusals the gate reported are gone with it */
  const csp = diag.consoleErrors.slice(before).filter((t) => /Content Security Policy/i.test(t));
  expect(csp, `CSP violations raised by the prefetch:\n${csp.join('\n')}`).toHaveLength(0);
  /* ④ the prefetch ran, saw that template and REFUSED it — not "the path quietly disappeared",
     which is the other way both assertions above could come out clean */
  expect(seen.last, 'the prefetch ran at all').toBeTruthy();
  expect(seen.last.tpl, 'on the template the style actually holds').toBe('imapsat://{z}/{y}/{x}');
  expect(seen.last.refused, 'a protocol template is not warmed HERE — js/tile-warm.js owns it (#R206)').toBe(true);
  expect(seen.last.warmed, 'so not one <img> was created for it').toBe(0);
  /* ⑤ …and the imagery it declined to warm is warmed by that owner, through a URL the browser CAN load */
  const owner = await page.evaluate(() => {
    const f = window.IntMapSatProto && window.IntMapSatProto.tileUrl;
    return { url: f ? f(2, 0, 2) : null, warmer: typeof window._imPredictivePrefetch };
  });
  expect(owner.warmer, 'satellite prefetch has an owner (js/tile-warm.js)').toBe('function');
  expect(owner.url, 'and it asks for the tile by a URL the browser can load').toMatch(/^https:\/\/[\w.-]+\.arcgisonline\.com\/.+\/2\/0\/2$/);
});
