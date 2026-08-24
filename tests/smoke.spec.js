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

/* ══ (#R356) THE FORECAST-MODEL PLATFORM, IN A REAL BROWSER ═══════════════════════════════════
   Every other check on this round reads SOURCE. #R318 measured what that misses: a cross-chunk TDZ
   passed `node --check`, 1,900 node checks and a 20-item audit while Atlas had never once mounted
   in a production build, and one real-browser spec was what found it. So the claims asserted here
   are the ones that stop being true if the module simply does not run: that the registry publishes,
   that `window.IntMapECMWF` IS the default instance rather than a copy of it, and that a second
   model is a second instance pointing at its own files.
   ⚠ It rides the existing shared boot — no new spec file. tests/test-budget.mjs is at 80.1 of 80.1
   minutes, so a new .spec.js would fail the budget gate rather than measure anything. */
test('R356 the model registry published, and IntMapECMWF IS the default instance', async () => {
  const r = await page.evaluate(() => {
    const M = window.IntMapWxModels, E = window.IntMapWxEngine, D = window.IntMapECMWF;
    if (!M || !E || !D) return { M: !!M, E: !!E, D: !!D };
    const other = M.ids().find((i) => i !== M.defaultId());
    const inst = E.model(other);
    return {
      M: true, E: true, D: true,
      ids: M.ids(),
      defaultIsSameObject: E.model(M.defaultId()) === D,   /* not a facade over a copy */
      defaultDomain: D.DOMAIN,
      defaultName: D.MODEL,
      otherId: other,
      otherIsDistinct: !!inst && inst !== D,
      otherDomain: inst && inst.DOMAIN,
      otherBaseIsItsOwn: !!(inst && inst.BASE !== D.BASE && inst.BASE.endsWith('/' + other)),
      rampsShared: !!(inst && inst.WINDY_WIND === D.WINDY_WIND),
      open: E.open().sort(),
      unknownIsNull: E.model('no_such_model_at_all') === null,
    };
  });
  expect(r.M, 'window.IntMapWxModels is published').toBe(true);
  expect(r.E, 'window.IntMapWxEngine is published').toBe(true);
  expect(r.D, 'window.IntMapECMWF is published').toBe(true);
  expect(r.ids.length, 'more than one model is offered').toBeGreaterThan(1);
  expect(r.defaultIsSameObject, 'IntMapECMWF is the default instance itself').toBe(true);
  expect(r.defaultDomain, 'the default is still the 9 km ECMWF field').toBe('ecmwf_ifs');
  expect(r.defaultName, 'and it names itself from its own row').toBe('ECMWF IFS HRES');
  expect(r.otherIsDistinct, 'a second model is a second instance').toBe(true);
  expect(r.otherDomain, 'with its own domain').toBe(r.otherId);
  expect(r.otherBaseIsItsOwn, 'and its own directory on the host').toBe(true);
  expect(r.rampsShared, 'while the colour ramps are built once for the page').toBe(true);
  expect(r.unknownIsNull, 'an unknown id is null, not a broken instance').toBe(true);
});

test('R356 no weather layer is labelled with a model it may not be reading', async () => {
  const labels = await page.evaluate(() => {
    const W = window.IntMapWeatherEC;
    if (!W || !W._layers) return null;
    const L = window.IntMapLang && window.IntMapLang.pickArgs ? window.IntMapLang.pickArgs() : null;
    return W._layers.map((l) => {
      const row = document.querySelector('#lyrrow-' + l.id + ' .ec-lbl');
      return row ? row.textContent : String(l.label);
    });
  });
  expect(labels, 'the weather layer table is reachable').toBeTruthy();
  expect(labels.length, 'the rows are built').toBeGreaterThan(4);
  /* the model is stated in the legend, which is rebuilt when the model changes — never in the
     layer's NAME, which is not */
  for (const t of labels) expect(t, 'label does not name a model: ' + t).not.toMatch(/ECMWF|GFS|ICON/);
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
      bps: sc && sc.breakpoints,
      alphas: [...new Set((sc.colors || []).map((c) => c[3]))],
      overridden: JSON.stringify(raw) !== JSON.stringify(sc) };
  });
  expect(r.unit, 'the scale carries its unit').toBe('m/s');
  /* ⚠ (#R297) 「風レイヤーのカラー凡例は、30m/sまでにして。」 — the KEY now ends at 30 m/s while the
     TABLE still paints to Windy's own clamp at 104. The property #R276 pinned was 「the legend does
     not invent a range」, and that is what is asserted: the key ends on a real breakpoint of the
     table, and when it ends short it SAYS so (`capped`), because a key that stopped at 30 without
     a mark would be claiming 30 is the maximum. */
  expect(r.lg.max, 'the legend ends on a breakpoint of the table').toBeLessThanOrEqual(r.max);
  expect(r.bps, 'and that breakpoint is one the table really has').toContain(r.lg.max);
  expect(r.lg.capped, 'a key that stops short says so').toBe(r.lg.max < r.max);
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

/* ══ #R289 ═══════════════════════════════════════════════════════════════════════════════════
   Ten instructions in one message. The source-level halves are in tests/r289-checks.test.mjs;
   these are the ones only a running browser can answer — a layer that is really on the map, a
   legend control that really redraws it, a popup that really has the state's numbers in it.

   ⚠ APPENDED HERE RATHER THAN GIVEN A SPEC OF ITS OWN, for #R207's reason and #R286's: the boot
   is already paid for in this file, this file is always in the gate, and the core test budget
   (scripts/test-budget.mjs) is at its ceiling — a new spec is charged at p75 ≈ 156 s.

   ⚠ AND IT HAS TO BE A REAL VIEWPORT. The Browser preview pane reports `document.hidden === true`
   and `innerWidth === 0`, so the map never finishes building there and every one of these
   assertions would be about a page that had not started — which is why they are here and not in a
   hand-driven session ([[intmap-headless-preview-limits]]). */
test('R289 ㉑ the coastline is the border line drawn round the water, and the wind offers it once', async () => {
  const r = await page.evaluate(async () => {
    const E = window.IntMapGeoEngine;
    const cb = document.getElementById('cb-coast');
    /* ⚠ THIS FILE IS SERIAL AND THE WIND HAS ALREADY BEEN SWITCHED ON ABOVE (#R276 ⑰–⑲), so the
       latch may already have fired. «Ships off» is a fact about the markup and the default list,
       and it is asserted where it can be — tests/r289-checks ③. What only a browser can answer is
       the two things below: the wind LEAVES it on, and switching it off STAYS off. */
    const out = { row: !!cb, latched: !!(cb && cb.__windAuto) };
    /* switching the WIND on is what is supposed to offer the coastline — 「風レイヤーオン時は既定でオン」 */
    const w = document.getElementById('dl-wind');
    if (w && !w.checked) { w.checked = true; w.dispatchEvent(new Event('change', { bubbles: true })); }
    await new Promise((s) => setTimeout(s, 4200));   /* the ofm retry ladder: 250/700/1600/3200 ms */
    out.checkedAfterWind = !!(cb && cb.checked);
    const get = (id, prop) => { try { return E.layers.has(id) ? E.layers.getPaint(id, prop) : null; } catch (_) { return null; } };
    out.line = E.layers.has('coast-only-line');
    out.casing = E.layers.has('coast-only-casing');
    out.vis = out.line ? E.layers.getLayout('coast-only-line', 'visibility') : null;
    out.coastColor = get('coast-only-line', 'line-color');
    out.borderColor = get('borders-only-line', 'line-color');
    out.coastWidth = JSON.stringify(get('coast-only-line', 'line-width'));
    out.borderWidth = JSON.stringify(get('borders-only-line', 'line-width'));
    out.coastCasingWidth = JSON.stringify(get('coast-only-casing', 'line-width'));
    out.borderCasingWidth = JSON.stringify(get('borders-only-casing', 'line-width'));
    /* ⚠ AND SWITCHING IT OFF MUST STICK — the latch is what makes 「既定でオン」 a default */
    cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true }));
    if (w) { w.checked = false; w.dispatchEvent(new Event('change', { bubbles: true })); }
    await new Promise((s) => setTimeout(s, 200));
    if (w) { w.checked = true; w.dispatchEvent(new Event('change', { bubbles: true })); }
    await new Promise((s) => setTimeout(s, 600));
    out.stayedOff = !cb.checked;
    out.visAfterOff = E.layers.has('coast-only-line') ? E.layers.getLayout('coast-only-line', 'visibility') : null;
    if (w) { w.checked = false; w.dispatchEvent(new Event('change', { bubbles: true })); }
    return out;
  });
  expect(r.row, 'the 基本表示 row exists').toBe(true);
  expect(r.checkedAfterWind, 'the wind layer offers it').toBe(true);
  expect(r.line && r.casing, 'both halves of the line are on the map').toBe(true);
  expect(r.vis).toBe('visible');
  /* 「全く同じ手法で」 — measured against the border's OWN paint, not against a written-down colour */
  expect(r.coastColor, 'the coastline is the border colour').toBe(r.borderColor);
  expect(r.coastWidth, 'and the border width ladder').toBe(r.borderWidth);
  expect(r.coastCasingWidth, 'and the border casing ladder').toBe(r.borderCasingWidth);
  expect(r.stayedOff, 'a reader who switches it off is not overruled the next time the wind goes on').toBe(true);
  expect(r.visAfterOff).toBe('none');
});

test('R289 ㉒ Chronos names itself, offers a clock, and reads the time back in it', async () => {
  const r = await page.evaluate(async () => {
    const out = {};
    out.title = (document.getElementById('ntl-title') || {}).textContent;
    out.sub = (document.getElementById('ntl-sub') || {}).textContent;
    out.openT = (document.getElementById('ntl-open-t') || {}).textContent;
    out.openS = (document.getElementById('ntl-open-s') || {}).textContent;
    out.before = getComputedStyle(document.getElementById('ntl-title'), '::before').content;
    const z = document.getElementById('ntl-zone');
    out.zoneCount = z ? z.options.length : 0;
    out.zoneFirst = z ? [...z.options].slice(0, 3).map((o) => o.value) : null;
    /* ⚠ THE READ-BACK IS THE HALF THAT CAN BE WRONG. Pick UTC, open the Time tab, ask for 14:30,
       and the instant the kernel holds must be 14:30 UTC — not 14:30 of wherever this runner is. */
    z.value = 'UTC'; z.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('ntl-mode-time').click();
    const sl = document.getElementById('ntl-slider');
    sl.value = String(14 * 60 + 30); sl.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((s) => setTimeout(s, 250));
    const w = window.IntMapTime.when();
    out.utcHM = String(w.getUTCHours()).padStart(2, '0') + ':' + String(w.getUTCMinutes()).padStart(2, '0');
    out.shown = (document.getElementById('ntl-bigval') || {}).textContent;
    /* …and back to the device's clock, where the same 14:30 means the local one */
    z.value = 'user'; z.dispatchEvent(new Event('change', { bubbles: true }));
    sl.value = String(9 * 60 + 15); sl.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((s) => setTimeout(s, 250));
    const w2 = window.IntMapTime.when();
    out.localHM = String(w2.getHours()).padStart(2, '0') + ':' + String(w2.getMinutes()).padStart(2, '0');
    window.IntMapTime.setNow({ source: 'test' });
    document.getElementById('ntl-mode-year').click();
    return out;
  });
  expect(r.title).toBe('Chronos');
  expect(r.openT).toBe('Chronos');
  expect(r.sub, 'the line under the name says what it operates').toBeTruthy();
  expect(r.openS, 'and so does the collapsed button').toBeTruthy();
  expect(r.before, '「⌛絵文字は削除です。」').toBe('none');
  expect(r.zoneCount, 'device + UTC + map centre + the major zones').toBeGreaterThan(20);
  expect(r.zoneFirst).toEqual(['user', 'UTC', 'map']);
  expect(r.utcHM, 'with UTC chosen, 14:30 means 14:30 UTC').toBe('14:30');
  expect(r.shown, 'and the panel prints the same thing it set').toBe('14:30');
  expect(r.localHM, 'with the device chosen, 09:15 means the device 09:15').toBe('09:15');
});

/* ══ (#R378) 「年/日付/時刻の下に置くのではなく外に、直接年月日時選ぶとこ作って。」 ══════════════
   ⚠ THE ASSERTION IS 「OUTSIDE」, NOT 「PRESENT」. A picker that only appears in one tab would pass
   any check that merely finds the element, so the row is measured in ALL THREE tabs and the instant
   is written from the YEAR tab — the tab that on its own can name nothing smaller than a year.
   ⚠ It is added to this spec rather than to one of its own: #R207 measured that the boot is the
   whole price of a browser file and the assertions are free (tests/durations.json is unchanged). */
test('R378 ① Chronos has a direct year-month-day-hour picker outside the Year/Date/Time tabs, and it writes the master clock', async () => {
  const r = await page.evaluate(async () => {
    const out = {};
    const wait = (ms) => new Promise((s) => setTimeout(s, ms));
    const tl = document.getElementById('news-timeline');
    const jump = document.getElementById('ntl-jump');
    out.exists = !!jump;
    out.type = jump ? jump.type : null;
    out.label = (document.getElementById('ntl-jump-lbl') || {}).textContent;
    out.inModes = jump ? !!jump.closest('#ntl-modes') : null;
    if (tl.classList.contains('collapsed')) document.getElementById('ntl-toggle').click();
    out.shownIn = {};
    for (const m of ['year', 'date', 'time']) {
      document.getElementById('ntl-mode-' + m).click();
      await wait(80);
      out.shownIn[m] = !!jump.offsetParent && getComputedStyle(jump).display !== 'none';
    }
    out.min = jump.min;
    /* WRITE — the whole instant, named from the tab that can only name a year */
    const z = document.getElementById('ntl-zone');
    z.value = 'UTC'; z.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('ntl-mode-year').click();
    jump.value = '1943-08-05T14:30';
    jump.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(700);
    out.setISO = window.IntMapTime.when().toISOString().slice(0, 16);
    out.live = window.IntMapTime.isLive();
    /* READ — a clock moved from anywhere else is reflected back into the field */
    window.IntMapTime.setYear(1972, { source: 'test' });
    await wait(300);
    out.readBack = jump.value;
    /* a year still being typed ("0019") is the floor, NOT `new Date(19,…)` = 1919 */
    jump.value = '0019-03-02T00:00';
    jump.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(700);
    out.clampedMs = window.IntMapTime.when().getTime();
    out.floorMs = Date.UTC(window.IntMapTime.min, 0, 1);
    window.IntMapTime.setNow({ source: 'test' });
    z.value = 'user'; z.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('ntl-mode-year').click();
    document.getElementById('ntl-x').click();
    return out;
  });
  expect(r.exists, 'the panel has a direct picker').toBe(true);
  expect(r.type, '「独自UIを作らなくてよい」 — it is the browser’s own control').toBe('datetime-local');
  expect(r.label, 'and the row says what it is').toBeTruthy();
  expect(r.inModes, 'it is not one of the tabs').toBe(false);
  expect(r.shownIn, '「外に」 — every tab can reach it').toEqual({ year: true, date: true, time: true });
  expect(r.min, 'it reaches the kernel’s floor').toMatch(/^18(49|50)-/);
  expect(r.setISO, 'with UTC chosen, 1943-08-05 14:30 is that instant').toBe('1943-08-05T14:30');
  expect(r.live, '…and the clock is no longer live').toBe(false);
  expect(r.readBack, 'a clock moved elsewhere is reflected back into the field').toMatch(/^1972-/);
  expect(r.clampedMs, 'a half-typed year is the floor, never 1919').toBe(r.floorMs);
});

test('R289 ㉓ the merged rows really repaint, and the year colouring really changes the fill', async () => {
  const r = await page.evaluate(async () => {
    const E = window.IntMapGeoEngine;
    const out = {};
    /* ① CO₂: one row, two series. The RAMP must move with the mode or the map paints megatonnes
          through a per-capita scale — the defect the re-assert exists for. */
    const co2 = document.getElementById('bx-wbco2');
    out.co2Name0 = document.querySelector('#lyrrow-wbco2 .bx-name').textContent;
    co2.checked = true; co2.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((s) => setTimeout(s, 2500));
    out.ramp0 = JSON.stringify(window.IntMapWB.rampOf('wbco2'));
    out.code0 = window.IntMapWB.codeOf('wbco2');
    out.fill0 = JSON.stringify(E.layers.has('wbco2-fill') ? E.layers.getPaint('wbco2-fill', 'fill-color') : null);
    const btn = document.querySelector('#data-legend-wbco2 .bx-mode[data-k=\'pc\']');
    out.hasSwitch = !!btn;
    if (btn) btn.click();
    await new Promise((s) => setTimeout(s, 2500));
    out.co2Name1 = document.querySelector('#lyrrow-wbco2 .bx-name').textContent;
    out.ramp1 = JSON.stringify(window.IntMapWB.rampOf('wbco2'));
    out.code1 = window.IntMapWB.codeOf('wbco2');
    out.fill1 = JSON.stringify(E.layers.has('wbco2-fill') ? E.layers.getPaint('wbco2-fill', 'fill-color') : null);
    co2.checked = false; co2.dispatchEvent(new Event('change', { bubbles: true }));
    /* ② NATO: one colour ↔ by accession year */
    const nato = document.getElementById('dl-nato');
    nato.checked = true; nato.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((s) => setTimeout(s, 2500));
    out.natoFill0 = JSON.stringify(E.layers.has('nato-fill') ? E.layers.getPaint('nato-fill', 'fill-color') : null);
    const nb = document.querySelector('#data-legend-nato .nato-style-row button[data-s=\'byYear\']');
    out.natoSwitch = !!nb;
    if (nb) nb.click();
    await new Promise((s) => setTimeout(s, 800));
    out.natoFill1 = JSON.stringify(E.layers.has('nato-fill') ? E.layers.getPaint('nato-fill', 'fill-color') : null);
    out.natoKey = (document.querySelector('#data-legend-nato .dl-yearkey') || {}).textContent || '';
    out.barHidden = (() => { const b = document.querySelector('#data-legend-nato .dl-bar'); return b ? b.style.display : null; })();
    nato.checked = false; nato.dispatchEvent(new Event('change', { bubbles: true }));
    return out;
  });
  expect(r.hasSwitch, 'the CO₂ legend carries the total/per-capita switch').toBe(true);
  expect(r.code0, 'the default mode is the country total').toBe('EN.GHG.CO2.MT.CE.AR5');
  expect(r.code1, 'and the switch really changes the series').toBe('EN.GHG.CO2.PC.CE.AR5');
  expect(r.ramp1, 'the published ramp moves with it').not.toBe(r.ramp0);
  expect(r.fill1, 'and so does the paint the map is actually using').not.toBe(r.fill0);
  expect(r.co2Name1, 'the row is named for the mode it is showing').not.toBe(r.co2Name0);
  expect(r.natoSwitch, 'the NATO legend carries the colouring switch').toBe(true);
  expect(r.natoFill0, 'one colour is one colour').toBe('"#2f6bff"');
  expect(r.natoFill1, 'and by-year is an expression over the accession year').toMatch(/"match",\["to-number",\["get","__y"\]/);
  expect(r.natoKey, 'with a chip per wave').toMatch(/1949/);
  expect(r.barHidden, 'and the flat gradient bar, which describes the OTHER mode, is hidden').toBe('none');
});

test('R289 ㉔ a click on a state answers with that state’s own votes and electors', async () => {
  const r = await page.evaluate(async () => {
    const cb = document.getElementById('dl-uselect');
    cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((s) => setTimeout(s, 3000));
    const E = window.IntMapGeoEngine;
    const out = { layer: E.layers.has('usel-fill'), year: window.IntMapUSElections.year() };
    /* the popup is built from the data, so ask the builder the same question the click does */
    const g = await fetch('data/us-elections.json').then((x) => x.json());
    const e = g.elections.find((x) => x.y === 2024);
    out.ga = e.sv.GA; out.me = e.sv.ME;
    out.stepper = (() => { const b = document.querySelector('#data-legend-uselect .usel-step'); if (!b) return null;
      const c = getComputedStyle(b); return { w: c.width, f: c.fontSize }; })();
    cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true }));
    return out;
  });
  expect(r.layer, 'the election layer is on the map').toBe(true);
  expect(r.year).toBe(2024);
  expect(r.ga.e, 'Georgia 2024: all sixteen to the winner').toEqual([16, 0]);
  expect(r.ga.v, 'and its certified popular vote').toEqual([2663117, 2548017]);
  expect(r.me.e, 'Maine 2024 split its four — 3 and 1').toEqual([1, 3]);
  expect(r.stepper, 'the year stepper exists').toBeTruthy();
  expect(parseFloat(r.stepper.w), '「<>のサイズが小さすぎる」 — it was 30 px').toBeGreaterThanOrEqual(38);
  expect(parseFloat(r.stepper.f), 'and the chevron itself was 13 px').toBeGreaterThanOrEqual(22);
});

test('R289 ㉕ the wind readout names the direction in the reader’s language and points downwind', async () => {
  const r = await page.evaluate(() => {
    /* the readout is driven by the cursor; call the renderer directly with a known sample rather
       than trying to synthesise a hover over a canvas that may still be loading tiles. */
    const out = { pointJp: window.IntMapCompass.point(45, 'jp', 8), pointEn: window.IntMapCompass.point(45, 'en', 8) };
    const wind = window.Wind;
    out.hasSample = !!(wind && wind.sampleAt);
    return out;
  });
  expect(r.pointEn).toBe('NE');
  expect(r.pointJp, '「ちゃんと北東と書くように」').toBe('北東');
  expect(r.hasSample).toBe(true);
});

test('R289 ㉖ the flat map refuses the crossing into space, and the globe still allows it', async () => {
  const r = await page.evaluate(async () => {
    const S = window.IntMapSpace;
    const out = { has: !!(S && S._pushOut) };
    if (!out.has) return out;
    document.getElementById('btn-view-flat').click();
    await new Promise((s) => setTimeout(s, 900));
    /* ⚠ `setZoom` on the flat projection did not land in one call (measured: z stayed 1.70 against
       a floor of 1.20), so the camera is JUMPED and then re-asserted until it is actually there.
       An assertion about «at the floor» that never reached the floor would be measuring nothing. */
    for (let i = 0; i < 8 && !S.atFloor(); i++) {
      try { const C = window.IntMapGeoEngine.camera; C.jumpTo({ zoom: C.getMinZoom() }); } catch (_) {}
      await new Promise((s) => setTimeout(s, 250));
    }
    out.atFloorFlat = S.atFloor();
    for (let i = 0; i < 12; i++) S._pushOut(0.5);   /* six zoom levels of refused zoom-out */
    await new Promise((s) => setTimeout(s, 300));
    out.openedFromFlat = S.isOpen();
    document.getElementById('btn-view-globe').click();
    await new Promise((s) => setTimeout(s, 1200));
    /* ⚠ `setZoom` on the flat projection did not land in one call (measured: z stayed 1.70 against
       a floor of 1.20), so the camera is JUMPED and then re-asserted until it is actually there.
       An assertion about «at the floor» that never reached the floor would be measuring nothing. */
    for (let i = 0; i < 8 && !S.atFloor(); i++) {
      try { const C = window.IntMapGeoEngine.camera; C.jumpTo({ zoom: C.getMinZoom() }); } catch (_) {}
      await new Promise((s) => setTimeout(s, 250));
    }
    out.atFloorGlobe = S.atFloor();
    for (let i = 0; i < 12; i++) S._pushOut(0.5);
    await new Promise((s) => setTimeout(s, 400));
    out.openedFromGlobe = S.isOpen();
    if (S.isOpen()) S.close();
    return out;
  });
  expect(r.has, 'the space view exposes its own gesture integral').toBe(true);
  expect(r.atFloorFlat, 'the flat camera really is at its zoom floor').toBe(true);
  expect(r.openedFromFlat, '「Flat地図では、ズームし続ければ宇宙へ行く機能を無効に。」').toBe(false);
  /* ⚠ AND THE OTHER HALF: this must be a REFUSAL, not a broken trigger. The same gesture on the
     globe still crosses over, or the assertion above would pass for the wrong reason. */
  expect(r.atFloorGlobe).toBe(true);
  expect(r.openedFromGlobe, 'the globe still leads to space').toBe(true);
});

/* ══ (#R290) THE CLAIMS THAT ONLY A BROWSER CAN SETTLE ═════════════════════════════════════════
   Three of this round's defects were invisible to a source-level check because each one was a
   fact about what the page ENDED UP with, not about what any one file says:
     · `window.IntMapTimeZones` had six members declared across two blocks of js/layer-packs.js and
       three on the page, because the second block assigned the name instead of extending it —
       measured, Object.keys() was ['highlight','highlighted','clear'];
     · the collapsed Chronos button said 「過去を表示中」 for an instant in the FUTURE;
     · the layer-search box scrolls with its list (#R23), so typing in it while scrolled down
       filtered a list whose top — and whose search box — were off-screen.                       */
test('R290 ㉗ the time-zone accessor survives to the page, and Chronos names the side of now', async () => {
  const r = await page.evaluate(async () => {
    const out = { keys: Object.keys(window.IntMapTimeZones || {}).sort() };
    try { await window.IntMapTimeZones.ensure(); } catch (_) {}
    out.ready = !!(window.IntMapTimeZones.ready && window.IntMapTimeZones.ready());
    out.tokyo = window.IntMapTimeZones.offsetAt(139.7, 35.7);
    out.newYork = window.IntMapTimeZones.offsetAt(-74.0, 40.7);
    const os = document.getElementById('ntl-open-s');
    window.IntMapTime.set(new Date(Date.now() + 36 * 3600e3), { allowFuture: true, source: 'test' });
    out.future = os.textContent;
    window.IntMapTime.set(new Date(Date.now() - 36 * 3600e3), { source: 'test' });
    out.past = os.textContent;
    window.IntMapTime.setNow({ source: 'test' });
    out.applied = !!document.getElementById('ntl-synced');
    return out;
  });
  expect(r.keys, 'one object, both publishers').toEqual(['clear', 'ensure', 'highlight', 'highlighted', 'offsetAt', 'ready']);
  expect(r.ready).toBe(true);
  expect(r.tokyo, 'Natural Earth’s STANDARD offset for Tokyo').toBe(9);
  expect(r.newYork).toBe(-5);
  expect(r.future, '「未来を見てるときに『過去を表示中』と出てくる」').toMatch(/future|未来|Zukunft|Будущее|futuro/i);
  expect(r.past).toMatch(/past|過去|Vergangenheit|Прошлое|pasado/i);
  expect(r.future).not.toMatch(/tap|タップ/i);
  expect(r.applied, '「反映内容を表示する箇所はいらない」').toBe(false);
});

/* ⚠⚠ (#R296) THE CLASSIC PANEL THIS MEASURED NO LONGER OPENS — 「レイヤー選択欄はclassic dropdownを
   完全削除。（右サイドバー形式に一本化し、設定から該当項目を削除。）」 The `.show` class this test added
   by hand is gone from the stylesheet, and so is `#layer-search-wrap` (its module went with it).
   What #R290 ㉘ was FOR — 「検索欄が見えない位置にあるまま絞り込みが起きる」 — still applies to the
   surviving box, so the check follows it to the tile sidebar rather than being deleted. */
test('R290 ㉘ / R296 the surviving layer-search box brings itself to the top of its own scroller', async () => {
  const r = await page.evaluate(async () => {
    const out = { classicGone: !document.getElementById('layer-search-wrap') };
    /* the classic panel cannot be shown at all any more — that IS the requirement */
    const dd = document.getElementById('layer-dropdown');
    dd.classList.add('show');
    out.stillHidden = getComputedStyle(dd).display === 'none';
    dd.classList.remove('show');

    const SB = window.IntMapLayerSidebar;
    if (SB && SB.apply) SB.apply();
    await new Promise((s) => setTimeout(s, 900));
    const sb = document.getElementById('layer-sidebar-r');
    if (!sb) return Object.assign(out, { noSidebar: true });
    if (!sb.classList.contains('open') && SB.toggle) { SB.toggle(); await new Promise((s) => setTimeout(s, 700)); }
    const box = sb.querySelector('.lsr-search');
    const sc = box && box.closest('[class]') && [...sb.querySelectorAll('*')].find((e) => {
      const cs = getComputedStyle(e); return (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && e.contains(box);
    });
    if (!box || !sc) return Object.assign(out, { noBox: !box, noScroller: !sc });
    out.scrollable = sc.scrollHeight > sc.clientHeight + 2;
    if (!out.scrollable) return out;
    sc.scrollTop = sc.scrollHeight - sc.clientHeight - 5;
    out.boxTopBefore = Math.round(box.getBoundingClientRect().top - sc.getBoundingClientRect().top);
    const inp = box.querySelector('input');
    inp.value = 'wind'; inp.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((s) => setTimeout(s, 900));
    out.boxTopAfter = Math.round(box.getBoundingClientRect().top - sc.getBoundingClientRect().top);
    out.padTop = Math.round(parseFloat(getComputedStyle(sc).paddingTop) || 0);
    inp.value = ''; inp.dispatchEvent(new Event('input', { bubbles: true }));
    return out;
  });
  expect(r.classicGone, 'the classic panel’s search box is gone with the panel').toBe(true);
  expect(r.stillHidden, 'and the panel cannot be shown even by adding the old class').toBe(true);
  if (r.noSidebar || r.noBox || r.noScroller || r.scrollable === false) return;   /* nothing to measure here */
  expect(r.boxTopBefore, 'the box starts above the visible area').toBeLessThan(-40);
  expect(r.boxTopAfter, 'and typing brings it to the top').toBeLessThanOrEqual(r.padTop + 8);
  expect(r.boxTopAfter).toBeGreaterThanOrEqual(-4);
});
/* ══════════════════════════════════════════════════════════════════════════════════════════════
   (#R291) THE DIRECTIONS PANEL — what only a real page can answer
   ──────────────────────────────────────────────────────────────────────────────────────────────
   §24.1's list is answered in Node (tests/r291-checks.test.mjs) because the store, the provider
   table, the render layer and the export are pure. What is left is the part that IS a page: the
   entry in Layers → Tools, the combobox keyboard, the bottom sheet, and the map's own layers.

   ⚠ THE ROUTERS ARE MOCKED. 「外部APIを用いる新規テストは最小限とし、大部分はモックまたは純粋関数で
   検証する」 — and the hermetic policy blocks every external host anyway, so a real OSRM call could
   only ever be a flake. `page.route` handlers take priority over the context's blanket block.
   ⚠ AND THEY ARE INSTALLED ONCE, on the shared page, rather than per test — this file boots the
   app exactly once and every assertion below rides that boot (#R207: the assertions are free, the
   boot is the whole price).
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
const R291_OSRM = {
  code: 'Ok',
  waypoints: [{ distance: 12 }, { distance: 20 }],
  routes: [
    {
      duration: 2160, distance: 31000,
      geometry: { type: 'LineString', coordinates: [[139.767, 35.681], [139.70, 35.60], [139.638, 35.4658]] },
      legs: [{ duration: 2160, steps: [
        { distance: 400, name: 'Chuo-dori', maneuver: { type: 'depart', modifier: '' } },
        { distance: 12000, name: 'Metropolitan Expressway', ref: 'C1', maneuver: { type: 'turn', modifier: 'right' },
          intersections: [{ lanes: [{ valid: false }, { valid: true }, { valid: true }] }] },
        { distance: 0, name: '', maneuver: { type: 'arrive', modifier: 'left' } },
      ] }],
    },
    {
      duration: 2460, distance: 39000,
      geometry: { type: 'LineString', coordinates: [[139.767, 35.681], [139.85, 35.58], [139.638, 35.4658]] },
      legs: [{ duration: 2460, steps: [
        { distance: 500, name: 'Route 15', ref: 'R15', maneuver: { type: 'depart', modifier: '' } },
        { distance: 0, name: '', maneuver: { type: 'arrive', modifier: 'right' } },
      ] }],
    },
  ],
};
const R291_GEO = {
  results: [
    { id: 1, name: 'Springfield', latitude: 39.799, longitude: -89.644, country: 'United States', admin1: 'Illinois', population: 116250, feature_code: 'PPLA' },
    { id: 2, name: 'Springfield', latitude: 42.101, longitude: -72.590, country: 'United States', admin1: 'Massachusetts', population: 154758, feature_code: 'PPLA2' },
    { id: 3, name: 'Springfield', latitude: 37.215, longitude: -93.298, country: 'United States', admin1: 'Missouri', population: 167882, feature_code: 'PPLA2' },
  ],
};
let r291Osrm = 0;                       /* how many road requests the app has actually made */
async function r291Mock() {
  r291Osrm = 0;
  await page.route(/router\.project-osrm\.org|routing\.openstreetmap\.de/, async (route) => {
    r291Osrm++;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(R291_OSRM) });
  });
  await page.route(/geocoding-api\.open-meteo\.com/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(R291_GEO) }));
  await page.route(/nominatim\.openstreetmap\.org/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
}
async function r291Open() {
  await page.evaluate(async () => {
    try { window.IntMapLayerSidebar.open(); } catch (_) { /* it may already be open */ }
    await new Promise((r) => setTimeout(r, 1200));
  });
  await page.locator('.lst-toolrow[data-act="tool.directions"]:visible').first().click();
  await page.waitForFunction(() => !!(window.IntMapRouteUI && window.IntMapRouteUI.isOpen()), null, { timeout: 20_000 });
  await page.evaluate(() => { try { window.IntMapLayerSidebar.close(); } catch (_) { } });
}
/* every test below rides the same boot, but any one of them may also be run alone with `-g` —
   so the ones that need the panel say so instead of inheriting it from the test before. */
async function r291Ensure() {
  await r291Mock();
  const up = await page.evaluate(() => !!(window.IntMapRouteUI && window.IntMapRouteUI.isOpen()));
  if (!up) await r291Open();
}
async function r291Route() {
  await r291Ensure();
  await page.evaluate(async () => {
    const S = window.IntMapRouteStore;
    S.setPlace('from', { lng: 139.7671, lat: 35.6812, name: 'Tokyo Station', kind: 'station' });
    S.setPlace('to', { lng: 139.6380, lat: 35.4658, name: 'Yokohama Station', kind: 'station' });
    await window.IntMapRouteUI._recompute();
  });
  await page.waitForFunction(() => window.IntMapRouteStore.hasRoute(), null, { timeout: 20_000 });
}

test('R291 ① Layers → Tools carries Directions, and the keyboard opens it', async () => {
  await r291Mock();
  const row = page.locator('.lst-toolrow[data-act="tool.directions"]:visible').first();
  await page.evaluate(async () => { try { window.IntMapLayerSidebar.open(); } catch (_) { } await new Promise((r) => setTimeout(r, 1200)); });
  await expect(row).toBeVisible();
  await expect(row).toContainText(/Directions/);
  /* ⚠ 「マウス、タッチ、キーボードの全てで開ける」 — a <button> is what makes that true by
     construction, and Enter on a focused row is the keyboard path. */
  expect(await row.evaluate((b) => b.tagName)).toBe('BUTTON');
  await row.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !!(window.IntMapRouteUI && window.IntMapRouteUI.isOpen()), null, { timeout: 20_000 });
  await page.evaluate(() => { try { window.IntMapLayerSidebar.close(); } catch (_) { } });
  await expect(page.locator('#route-panel')).toBeVisible();
  /* pressing it again closes the PANEL — and a second press must never build a second one */
  const before = await page.locator('#route-panel').count();
  await page.evaluate(async () => { try { window.IntMapLayerSidebar.open(); } catch (_) { } await new Promise((r) => setTimeout(r, 900)); });
  await row.click(); await page.waitForTimeout(400);
  await row.click(); await page.waitForTimeout(1200);
  await page.evaluate(() => { try { window.IntMapLayerSidebar.close(); } catch (_) { } });
  expect(await page.locator('#route-panel').count(), 'a second press must not build a second panel').toBe(before);
  await expect(page.locator('#route-panel')).toBeVisible();
});

test('R291 ② the place search offers candidates and the keyboard picks one', async () => {
  await r291Ensure();
  const input = page.locator('#route-panel .rtp-field[data-f="from"] input');
  await input.click();
  await input.fill('');
  /* ⚠ TYPING MUST NOT ROUTE (§23). The counter is reset here and checked after the keystrokes. */
  await page.evaluate(() => { window.__r291Before = document.querySelectorAll('.rt-alt').length; });
  await input.type('Springfield', { delay: 40 });
  /* ⚠ (#R298) WAIT FOR THE LIST, NOT FOR ITS FIRST ROW. The field now shows the SHIPPED place index
     the instant it matches and merges the network's answer into it when that lands (「打鍵のたびに
     候補を『検索中…』で消していた」), so the first `.rtp-sug` appears in milliseconds and this used to
     count one row and stop. The property #R291 pins — an ambiguous name offers more than one — is
     unchanged and is still required within the same fifteen seconds; only the moment it is sampled
     moved to when the list has actually filled. */
  await page.waitForFunction(() => document.querySelectorAll('#rtp-suggest .rtp-sug').length > 1, null, { timeout: 15_000 });
  const rows = page.locator('#rtp-suggest .rtp-sug');
  expect(await rows.count(), 'an ambiguous name must offer more than one row (§4.1)').toBeGreaterThan(1);
  /* each row is distinguishable — the admin area is what tells three Springfields apart */
  await expect(rows.first()).toContainText(/Illinois|Massachusetts|Missouri/);
  expect(await input.getAttribute('aria-expanded')).toBe('true');
  /* ArrowDown moves the active option; Enter confirms it */
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const active = await input.getAttribute('aria-activedescendant');
  expect(active, 'the combobox must name its active option').toMatch(/^rtp-sug-\d+$/);
  const chosen = (await page.locator('#' + active + ' b').innerText()).trim();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  expect(await input.inputValue()).toBe(chosen);
  expect(await page.evaluate(() => !!window.IntMapRouteStore.get().from.place), 'the pick is confirmed').toBe(true);
  await expect(page.locator('#rtp-suggest')).toBeHidden();
  /* Escape closes the list without confirming anything */
  await input.fill(''); await input.type('Spring', { delay: 30 });
  await page.waitForSelector('#rtp-suggest .rtp-sug', { timeout: 15_000 });
  await page.keyboard.press('Escape');
  await expect(page.locator('#rtp-suggest')).toBeHidden();
  await expect(page.locator('#route-panel')).toBeVisible();   /* the first Escape closed the LIST, not the panel */
  /* ⚠ and editing the field invalidated the confirmed place, so nothing was routed from stale coords */
  expect(await page.evaluate(() => window.IntMapRouteStore.get().from.place)).toBe(null);
});

test('R291 ③ a route draws, its alternatives are selectable from the card and from the map', async () => {
  await r291Route();
  const cards = page.locator('#route-panel .rt-alt');
  expect(await cards.count()).toBe(2);
  await expect(cards.first()).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#route-panel .rtp-summary')).toContainText(/36 min/);
  /* the second card selects, and the STORE follows — which is what Atlas reads */
  await cards.nth(1).click();
  await page.waitForTimeout(300);
  await expect(cards.nth(1)).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate(() => window.IntMapRouteStore.get().sel)).toBe(1);
  /* …and the map drives the card the same way (§10) — this is the tap on the line */
  await page.evaluate(() => window.IntMapRouting.selectAlt(0, window.IntMapRouteStore.get().routeSetId));
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.IntMapRouteStore.get().sel)).toBe(0);
  await expect(page.locator('#route-panel .rt-alt').first()).toHaveAttribute('aria-checked', 'true');
  /* a turn is a real button, and picking one highlights it */
  const steps = page.locator('#route-panel .rt-step');
  expect(await steps.count()).toBeGreaterThan(1);
  expect(await steps.first().evaluate((b) => b.tagName)).toBe('BUTTON');
  await steps.nth(1).click(); await page.waitForTimeout(200);
  await expect(steps.nth(1)).toHaveAttribute('aria-current', 'step');
  await expect(steps.nth(1)).toContainText(/Lanes: use 2, 3 of 3/);
  /* the honest note is present, and it is the one that matters most */
  await expect(page.locator('#route-panel .rt-note')).toContainText(/live traffic is not included/i);
});

test('R291 ④ the map really draws it: lettered waypoints, a touch target, and a fit that misses the panel', async () => {
  const r = await page.evaluate(async () => {
    const GE = window.IntMapGeoEngine;
    const t0 = Date.now();
    while (Date.now() - t0 < 20000 && !GE.canDraw()) await new Promise((s) => setTimeout(s, 200));
    if (!GE.canDraw()) return { skipped: 'the style never became ready' };
    window.IntMapRouting.ensureLayers();
    await new Promise((s) => setTimeout(s, 300));
    const d = GE.layers.sourceData('imroute-src') || { features: [] };
    const props = d.features.map((f) => f.properties || {});
    return {
      layers: ['imroute-cas', 'imroute-walk', 'imroute-rail', 'imroute-wp', 'imroute-durlab', 'imroute-hit']
        .filter((id) => GE.layers.has(id)),
      wp: props.filter((p) => p.wp).map((p) => p.wp),
      alts: [...new Set(props.filter((p) => p.alt != null).map((p) => p.alt))].sort(),
      hitWidth: GE.layers.getPaint ? GE.layers.getPaint('imroute-hit', 'line-width') : null,
      clickable: GE.events.clickLayers().filter((x) => /imroute/.test(x)),
    };
  });
  if (r.skipped) { test.skip(true, r.skipped); return; }
  expect(r.layers).toContain('imroute-wp');
  expect(r.layers).toContain('imroute-hit');
  /* ⚠ A AND B, NOT TWO COLOURED DOTS (§5.1) */
  expect(r.wp).toEqual(['A', 'B']);
  expect(r.alts, 'both alternatives are on the map, each tagged with its index').toEqual([0, 1]);
  /* ⚠ (#R298) THE WIDTH IS A ZOOM RAMP NOW, SO THE QUESTION IS ABOUT ITS SMALLEST STOP. 22 px was a
     constant, and WCAG 2.2 asks for 44 — but widening it everywhere would make two alternatives that
     lie a few pixels apart at world zoom impossible to tell apart by tapping. So it runs 22 at z10 to
     44 at z14, and what this test pins is unchanged: the invisible target is never narrower than a
     finger's worth, at any zoom the ramp can produce. */
  /* `['interpolate',['linear'],['zoom'], z1,w1, z2,w2, …]` — the widths are the odd slots after the input */
  const hitStops = Array.isArray(r.hitWidth)
    ? r.hitWidth.slice(3).filter((v, i) => i % 2 === 1 && typeof v === 'number')
    : [Number(r.hitWidth)];
  expect(hitStops.length, 'the width is a number or a zoom ramp of numbers').toBeGreaterThan(0);
  const narrowest = Math.min(...hitStops);
  expect(narrowest, 'the invisible touch target is wider than a finger at every zoom').toBeGreaterThanOrEqual(20);
  expect(r.clickable).toContain('imroute-hit');
});

/* ⚠⚠ ⑤ (#R296) THE READER REVERSED THIS ────────────────────────────────────────────────────────
   #R291 read §2.2 as 「the panel's × must not destroy the route」. 「経路機能を閉じても地図に経路が
   残り続けるのをやめろ」 says the opposite in as many words, so what is measured is inverted: closing
   takes the route off the map, the ENDPOINTS survive it, and 「経路を消去」 still clears WITHOUT closing. */
test('R291 ⑤ / R296 closing the panel takes the route with it; the endpoints stay', async () => {
  await page.locator('#route-panel .rtp-closeb').click();
  await expect(page.locator('#route-panel')).toBeHidden();
  expect(await page.evaluate(() => window.IntMapRouteStore.hasRoute()), 'the route goes with the panel').toBe(false);
  /* the endpoints are what makes re-opening a continuation rather than a blank form */
  expect(await page.evaluate(() => {
    const s = window.IntMapRouteStore.get();
    return [s.from.place && s.from.place.name, s.to.place && s.to.place.name];
  })).toEqual(['Tokyo Station', 'Yokohama Station']);
  /* re-opening shows the same journey, ready to recompute */
  await page.evaluate(async () => { try { window.IntMapLayerSidebar.open(); } catch (_) { } await new Promise((r) => setTimeout(r, 1200)); });
  const row = page.locator('.lst-toolrow[data-act="tool.directions"]:visible').first();
  await row.click();
  await page.waitForFunction(() => !!(window.IntMapRouteUI && window.IntMapRouteUI.isOpen()), null, { timeout: 20_000 });
  await page.evaluate(() => { try { window.IntMapLayerSidebar.close(); } catch (_) { } });
  expect(await page.locator('#route-panel .rtp-field[data-f="to"] input').inputValue()).toBe('Yokohama Station');
  /* …and 「経路を消去」 clears without closing */
  await r291Route();
  expect(await page.evaluate(() => window.IntMapRouteStore.hasRoute())).toBe(true);
  await page.locator('#route-panel .rtp-clear').click();
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.IntMapRouteStore.hasRoute())).toBe(false);
  expect(await page.evaluate(() => window.IntMapRouteUI.isOpen()), 'clearing does not close').toBe(true);
  expect(await page.locator('#route-panel .rt-alt').count()).toBe(0);
  /* ⚠ these specs ride one boot in order, so this one hands the next a page with a route on it —
     the state ④ left before this test started clearing things to make its point. */
  await r291Route();
});

test('R291 ⑥ stops: added, reordered by keyboard, and reversed WITH the itinerary', async () => {
  await r291Route();
  await page.locator('#route-panel .rtp-addvia').click();
  await page.locator('#route-panel .rtp-addvia').click();
  await page.evaluate(() => {
    const S = window.IntMapRouteStore;
    S.setPlace(0, { lng: 139.70, lat: 35.55, name: 'Kawasaki' });
    S.setPlace(1, { lng: 139.62, lat: 35.50, name: 'Tsurumi' });
    window.IntMapRouteUI._render();
  });
  const order = () => page.evaluate(() => [...document.querySelectorAll('#route-panel .rtp-field')].map((f) => f.dataset.f + '=' + f.querySelector('input').value));
  expect(await order()).toEqual(['from=Tokyo Station', 'via:0=Kawasaki', 'via:1=Tsurumi', 'to=Yokohama Station']);
  /* the letters beside the fields are the letters on the map */
  expect(await page.evaluate(() => [...document.querySelectorAll('#route-panel .rtp-mark')].map((m) => m.textContent)))
    .toEqual(['A', '1', '2', 'B']);
  /* ⚠ KEYBOARD REORDER, not only drag (§5.2) */
  await page.locator('#route-panel .rtp-field[data-f="via:1"] .rtp-up').click();
  await page.waitForTimeout(200);
  expect(await order()).toEqual(['from=Tokyo Station', 'via:0=Tsurumi', 'via:1=Kawasaki', 'to=Yokohama Station']);
  /* ⚠ AND SWAP REVERSES THE WHOLE JOURNEY (§5.3) */
  await page.locator('#route-panel .rtp-swap').click();
  await page.waitForTimeout(300);
  expect(await order()).toEqual(['from=Yokohama Station', 'via:0=Kawasaki', 'via:1=Tsurumi', 'to=Tokyo Station']);
  /* with a stop, this provider returns no alternatives — and the panel SAYS so rather than showing one silently */
  await page.waitForFunction(() => window.IntMapRouteStore.get().request.state !== 'loading', null, { timeout: 20_000 });
});

test('R291 ⑦ an unreachable router is an error with a way forward, not an empty panel', async () => {
  await r291Ensure();
  await page.unroute(/router\.project-osrm\.org|routing\.openstreetmap\.de/);
  await page.route(/router\.project-osrm\.org|routing\.openstreetmap\.de/, (route) => route.abort('failed'));
  await page.evaluate(async () => {
    const S = window.IntMapRouteStore;
    while (S.get().via.length) S.removeVia(S.get().via.length - 1);
    S.setPlace('from', { lng: 2.35, lat: 48.85, name: 'Paris' });
    S.setPlace('to', { lng: 4.9, lat: 52.37, name: 'Amsterdam' });
    await window.IntMapRouteUI._recompute();
  });
  await page.waitForSelector('#route-panel .rtp-err', { timeout: 30_000 });
  const err = page.locator('#route-panel .rtp-err');
  await expect(err).toHaveAttribute('role', 'alert');
  await expect(err).toContainText(/unreachable|NOT computed|timed out/i);
  await expect(err.locator('.rtp-act')).toHaveCount(1);
  await expect(err.locator('.rtp-act')).toContainText(/Try again/i);
  /* the retry really retries */
  await page.unroute(/router\.project-osrm\.org|routing\.openstreetmap\.de/);
  await r291Mock();
  await err.locator('.rtp-act').click();
  await page.waitForFunction(() => window.IntMapRouteStore.hasRoute(), null, { timeout: 20_000 });
});

test('R291 ⑧ on a 320 px phone it is a bottom sheet that does not overflow', async () => {
  await r291Route();          /* the sheet is measured WITH answers in it — an empty one proves nothing */
  const before = page.viewportSize();
  await page.setViewportSize({ width: 320, height: 640 });
  await page.waitForTimeout(600);
  await page.evaluate(() => { window.IntMapRouteUI._render(); });
  const m = await page.evaluate(() => {
    const el = document.getElementById('route-panel');
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const grip = getComputedStyle(el.querySelector('.rtp-grip')).display;
    /* ⚠ THE RULE IS 「横方向にはみ出さない」, AND A SCROLLER IS HOW WIDE CONTENT OBEYS IT.
       The footer's chip strip scrolls sideways inside its own box; its children legitimately extend
       past the viewport, and measuring them would forbid the very pattern that fixes the problem.
       What must hold is that every element is inside the viewport OR inside a horizontal scroller
       that is itself inside the viewport — and that the PAGE never scrolls sideways. */
    const inScroller = (n) => { for (let p = n.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
    let worst = 0;
    el.querySelectorAll('*').forEach((n) => { const b = n.getBoundingClientRect(); if (b.width && !inScroller(n)) worst = Math.max(worst, b.right); });
    const tap = [...el.querySelectorAll('button:not([hidden])')]
      .map((b) => { const bb = b.getBoundingClientRect(); return { c: (b.className || '') + '', w: bb.width, h: bb.height }; })
      .filter((x) => x.w > 0 && !/rtp-tab|rt-step|rt-alt/.test(x.c));
    const fonts = [...el.querySelectorAll('.rtp-summary, .rtp-in, .rt-alt-main, .rt-step-tx, .rtp-chip')]
      .map((n) => parseFloat(getComputedStyle(n).fontSize)).filter((x) => x > 0);
    return {
      left: Math.round(r.left), width: Math.round(r.width), bottom: Math.round(r.bottom),
      pos: cs.position, grip, worst: Math.round(worst),
      docScroll: document.documentElement.scrollWidth, inner: window.innerWidth,
      minTap: tap.length ? Math.min(...tap.map((x) => Math.min(x.w, x.h))) : null,
      minFont: fonts.length ? Math.min(...fonts) : null,
      detent: el.getAttribute('data-detent'),
    };
  });
  expect(m.pos, 'the sheet is fixed to the bottom of the screen').toBe('fixed');
  expect(m.grip, 'a phone sheet has a grip to drag').toBe('block');
  expect(m.left).toBe(0);
  expect(m.width).toBe(320);
  expect(m.worst, 'nothing may reach past a 320 px viewport').toBeLessThanOrEqual(321);
  expect(m.docScroll, 'and the page itself must not scroll sideways').toBeLessThanOrEqual(m.inner + 1);
  expect(m.minTap, 'every button a finger has to hit is at least 44 px (WCAG 2.2)').toBeGreaterThanOrEqual(44);
  expect(m.minFont, '「10～11pxの主要文字を使わない」').toBeGreaterThanOrEqual(13);
  expect(['min', 'mid', 'full']).toContain(m.detent);
  /* the detents really change the height, and the two smaller ones leave the map alone */
  const heights = await page.evaluate(async () => {
    const out = {};
    for (const d of ['min', 'mid', 'full']) {
      window.IntMapRouteUI._el().setAttribute('data-detent', d);
      await new Promise((r) => setTimeout(r, 420));
      out[d] = Math.round(window.IntMapRouteUI._el().getBoundingClientRect().height);
    }
    return out;
  });
  expect(heights.min).toBeLessThan(heights.mid);
  expect(heights.mid).toBeLessThan(heights.full);
  expect(heights.min, 'the smallest detent leaves most of the map visible').toBeLessThan(220);
  /* ⚠ AND NOTHING IS DRAWN ON TOP OF IT. A z-index is a claim; `elementFromPoint` is the
     measurement. Before the `body.rtp-open` rules existed, the app's own bottom sheet, the FAB
     column and the base-map square all answered here instead of the panel. */
  const covered = await page.evaluate(async () => {
    window.IntMapRouteUI._el().setAttribute('data-detent', 'full');
    await new Promise((r) => setTimeout(r, 500));
    const el = window.IntMapRouteUI._el();
    const r = el.getBoundingClientRect();
    const probe = [[0.5, 0.06], [0.5, 0.3], [0.5, 0.6], [0.12, 0.3], [0.88, 0.3], [0.5, 0.92]];
    return probe.map(([fx, fy]) => {
      const x = Math.round(r.left + r.width * fx), y = Math.round(r.top + r.height * fy);
      const n = document.elementFromPoint(x, y);
      return { at: fx + ',' + fy, inPanel: !!(n && el.contains(n)), who: n ? (n.tagName + '.' + String(n.className).slice(0, 30)) : 'null' };
    });
  });
  const blocked = covered.filter((c) => !c.inPanel);
  expect(blocked, 'something is drawn over the sheet: ' + JSON.stringify(blocked)).toEqual([]);
  /* ⚠ AND THE ROUTES ARE ACTUALLY ON SCREEN AT THE MIDDLE DETENT. The point of a directions sheet
     is the answers; at 62dvh the pinned search block alone was taller than the sheet and the
     alternative cards had nowhere to be drawn. This measures the card, not the rule. */
  const cardsVisible = await page.evaluate(async () => {
    window.IntMapRouteUI._el().setAttribute('data-detent', 'mid');
    await new Promise((r) => setTimeout(r, 500));
    const cards = [...document.querySelectorAll('#route-panel .rt-alt')];
    const body = document.querySelector('#route-panel .rtp-body').getBoundingClientRect();
    return { n: cards.length, bodyH: Math.round(body.height),
             onScreen: cards.filter((c) => { const r = c.getBoundingClientRect(); return r.height > 20 && r.top < window.innerHeight && r.bottom > body.top; }).length };
  });
  expect(cardsVisible.bodyH, 'the sheet must leave room for the answers').toBeGreaterThan(80);
  expect(cardsVisible.onScreen, 'at least one route option must be visible at the middle detent').toBeGreaterThanOrEqual(1);
  /* and the app's own bottom sheet has stepped aside rather than fighting it */
  const sidebarOut = await page.evaluate(() => {
    const sb = document.querySelector('.sidebar');
    return sb ? sb.getBoundingClientRect().top >= window.innerHeight - 2 : true;
  });
  expect(sidebarOut, 'the app’s own bottom sheet must yield while directions is open').toBe(true);
  await page.setViewportSize(before);
  await page.waitForTimeout(500);
});

test('R291 ⑨ the route survives a base-map switch, and reads on light, dark and satellite', async () => {
  await r291Route();
  const paint = async () => page.evaluate(() => {
    const GE = window.IntMapGeoEngine;
    if (!GE.canDraw() || !GE.layers.has('imroute-cas')) return null;
    const d = GE.layers.sourceData('imroute-src') || { features: [] };
    return { lines: d.features.filter((f) => f.geometry.type === 'LineString').length,
             casing: GE.layers.getPaint('imroute-cas', 'line-color') };
  });
  const before = await paint();
  if (!before) { test.skip(true, 'the style never became ready'); return; }
  expect(before.lines).toBeGreaterThan(0);
  await page.evaluate(() => window.IntMapOS.exec('view.base.sat', { source: 'test' }));
  await page.waitForTimeout(2500);
  const after = await paint();
  expect(after && after.lines, 'the route must still be drawn after a base-map switch (§11.3)').toBeGreaterThan(0);
  /* the casing is a solid white outline — that is what makes the line readable on imagery */
  expect(String(after.casing)).toMatch(/#ffffff|rgb\(255,\s*255,\s*255\)/i);
  await page.evaluate(() => window.IntMapOS.exec('view.base.map', { source: 'test' }));
  await page.waitForTimeout(1500);
});

test('R291 ⑩ every control has an accessible name, and the panel is a labelled dialog', async () => {
  await r291Ensure();
  const a = await page.evaluate(() => {
    const el = document.getElementById('route-panel');
    const named = (n) => !!(n.getAttribute('aria-label') || n.getAttribute('aria-labelledby')
      || (n.textContent || '').trim() || (n.labels && n.labels.length));
    const unnamed = [...el.querySelectorAll('button, input, select')].filter((n) => !named(n))
      .map((n) => n.className + '|' + n.tagName);
    return {
      role: el.getAttribute('role'), labelled: el.getAttribute('aria-labelledby'),
      title: (document.getElementById('rtp-title') || {}).textContent,
      unnamed,
      modes: [...el.querySelectorAll('.rtp-mode')].map((b) => b.getAttribute('aria-pressed')),
      tabs: [...el.querySelectorAll('[role="tab"]')].length,
      live: [...el.querySelectorAll('[aria-live]')].length,
    };
  });
  expect(a.role).toBe('dialog');
  expect(a.labelled).toBe('rtp-title');
  expect((a.title || '').trim().length).toBeGreaterThan(0);
  expect(a.unnamed, 'controls with no accessible name: ' + a.unnamed.join(', ')).toEqual([]);
  expect(a.modes.filter((x) => x === 'true')).toHaveLength(1);
  expect(a.tabs).toBe(3);
  expect(a.live).toBeGreaterThan(0);
  /* Escape closes the panel and puts focus back where it came from (§19) */
  await page.locator('#route-panel .rtp-tab[data-tab="opts"]').click();
  await expect(page.locator('#rtp-p-opts')).toBeVisible();
  await page.locator('#route-panel .rtp-tab[data-tab="ana"]').press('ArrowRight');
  await page.waitForTimeout(200);
  await expect(page.locator('#rtp-p-route')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await expect(page.locator('#route-panel')).toBeHidden();
  /* ⚠ (#R296) Escape is a CLOSE, and closing now takes the route with it — 「経路機能を閉じても
     地図に経路が残り続けるのをやめろ」. What §19 asks of Escape is that it be the SAME act as the ×,
     and that is what this now checks: the panel is hidden and the map is clean, by one path. */
  expect(await page.evaluate(() => window.IntMapRouteStore.hasRoute()), 'Escape is a close, and a close clears').toBe(false);
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   #R292 · THE WIDGET PLATFORM, IN A REAL BROWSER
   ----------------------------------------------------------------------------------------------
   Appended here rather than given a spec of its own: a boot is what a browser test costs (#R207),
   this file already pays for one, and the assertions are free. They ask the four things a source
   check cannot answer — does the documented default board actually appear, do two cards asking the
   same question cost one request, do the three sizes really differ, and does a hidden board stop
   doing work.

   ⚠ THE BOARD IS DRIVEN THROUGH ITS OWN API, NOT THROUGH THE STORAGE KEY. `_setActive` /
   `IntMapWidgetStore` are the contract; writing the key by hand would test the key.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
test('#R292 the default board is the five documented cards, not one', async () => {
  const r = await page.evaluate(async () => {
    /* start from nothing saved — this is the FIRST-VISIT board, which is what was broken */
    localStorage.removeItem('intmap_widgets4');
    localStorage.removeItem('intmap_widgets3');
    localStorage.removeItem('intmap_widgets2');
    window.IntMapWidgetStore._reset();
    window.IntMapWidgets2._layout.render();
    await new Promise((s) => setTimeout(s, 400));
    return {
      ids: window.IntMapWidgetStore.raw().map((x) => x.d),
      cards: document.querySelectorAll('#widget-board .wgt-card').length,
      saved: !!localStorage.getItem('intmap_widgets4'),
      legacy: window.IntMapWidgets2._active().map((e) => e.t),
      defs: window.IntMapWidgetCore.ids().length,
    };
  });
  /* ⚠ THE MEASUREMENT THAT STARTED THIS ROUND: with storage cleared the previous board produced
     `["clock"]`, saved nothing, and re-attempted the same failing seed on every load. */
  expect(r.ids, 'the documented default board is seeded whole').toEqual([
    'time.digital', 'markets.fx', 'map.featured-layer', 'world.country', 'knowledge.on-this-day']);
  expect(r.cards, 'and all five are on screen').toBe(5);
  expect(r.saved, 'and the seed is persisted, so it happens once rather than every load').toBe(true);
  /* the published contract still answers in the OLD spelling, for a device on the previous build */
  expect(r.legacy).toEqual(['clock', 'fx', 'featured', 'country', 'otd']);
  expect(r.defs, 'the registry holds every widget').toBeGreaterThanOrEqual(40);
});

test('#R292 a v3 board migrates without losing an order, an id or a setting', async () => {
  const r = await page.evaluate(async () => {
    localStorage.removeItem('intmap_widgets4');
    localStorage.setItem('intmap_widgets3', JSON.stringify([
      { u: 'wA', t: 'fx', cfg: { base: 'USD', quote: 'JPY' } },
      { u: 'wB', t: 'aclock', cfg: {} },
      { u: 'wC', t: 'countdown', cfg: { title: 'Trip', date: '2026-12-01' } },
      { u: 'wD', t: 'worldclock', cfg: { tz: 'Europe/Paris' } },
      { u: 'wE', t: 'holiday', cfg: { cc: 'FR' } },
      { u: 'wF', t: 'fx', cfg: { base: 'EUR', quote: 'GBP' } },
      { u: 'wG', t: 'nonexistent', cfg: {} },
    ]));
    window.IntMapWidgetStore._reset();
    const first = window.IntMapWidgetStore.load().items;
    const snap = (a) => a.map((x) => x.i + '|' + x.d + '|' + x.s + '|' + JSON.stringify(x.c) + '|' + x.at).join('\n');
    const a = snap(first);
    /* running the migration twice must produce a byte-identical board */
    localStorage.removeItem('intmap_widgets4');
    window.IntMapWidgetStore._reset();
    const b = snap(window.IntMapWidgetStore.load().items);
    return {
      ids: first.map((x) => x.i),
      defs: first.map((x) => x.d),
      fx: first.filter((x) => x.d === 'markets.fx').map((x) => x.c.base + '/' + x.c.quote),
      countdown: first.filter((x) => x.d === 'time.countdown').map((x) => x.c.title + '@' + x.c.date),
      tz: first.filter((x) => x.d === 'time.world').map((x) => x.c.tz),
      cc: first.filter((x) => x.d === 'world.holiday').map((x) => x.c.cc),
      idempotent: a === b,
      v3Kept: !!localStorage.getItem('intmap_widgets3'),
    };
  });
  expect(r.ids, 'the previous instance ids ARE the new ones — a reorder or a sync must not see new cards')
    .toEqual(['wA', 'wB', 'wC', 'wD', 'wE', 'wF']);
  expect(r.defs, 'order is preserved and the unknown type is dropped rather than guessed at').toEqual(
    ['markets.fx', 'time.analog', 'time.countdown', 'time.world', 'world.holiday', 'markets.fx']);
  expect(r.fx, 'both FX instances keep their own pair').toEqual(['USD/JPY', 'EUR/GBP']);
  expect(r.countdown).toEqual(['Trip@2026-12-01']);
  expect(r.tz).toEqual(['Europe/Paris']);
  expect(r.cc).toEqual(['FR']);
  expect(r.idempotent, 'migrating twice gives the same board — it runs on every load').toBe(true);
  expect(r.v3Kept, 'the previous format is the backup generation and is never deleted').toBe(true);
});

test('#R292 two cards asking the same question cost one request, and three sizes differ', async () => {
  const r = await page.evaluate(async () => {
    localStorage.removeItem('intmap_widgets3');
    window.IntMapWidgetStore._reset();
    /* ⚠ THE SIZES ARE MEASURED ON A CARD THAT NEEDS NO NETWORK, and deliberately so: this suite is
       HERMETIC (helpers/network.js blocks every external host), so a weather card here can only
       ever be a skeleton — and three skeletons of different heights would satisfy an s < m < l
       assertion while proving nothing about the renderers. `progress.day` computes locally, so what
       is counted below really is what the three renderers emit. The DEDUPLICATION half is measured
       on the weather cards in the same board, where the request never has to succeed for the
       request KEY to be the thing under test. */
    window.IntMapWidgets2._setActive(null, { v: 4, items: [
      { i: 'a1', d: 'weather.map-centre', s: 's', c: { source: 'map' }, at: 1 },
      { i: 'a2', d: 'weather.map-centre', s: 'm', c: { source: 'map' }, at: 2 },
      { i: 'a3', d: 'weather.here', s: 'l', c: { source: 'map' }, at: 3 },
      { i: 'p1', d: 'progress.day', s: 's', c: { zone: 'UTC', style: 'bar', follow: false }, at: 4 },
      { i: 'p2', d: 'progress.day', s: 'm', c: { zone: 'UTC', style: 'bar', follow: false }, at: 5 },
      { i: 'p3', d: 'progress.day', s: 'l', c: { zone: 'UTC', style: 'bar', follow: false }, at: 6 },
    ] });
    window.IntMapWidgets2._layout.render();
    await new Promise((s) => setTimeout(s, 1200));
    const stats = window.IntMapWidgetScheduler.stats();
    const body = (id) => document.querySelector('[data-wid="' + id + '"] .wgt-cardbody');
    const count = (id) => { const c = body(id); return c ? c.querySelectorAll('*').length : 0; };
    const text = (id) => { const c = body(id); return c ? (c.innerText || '').replace(/\s+/g, ' ').trim() : ''; };
    return {
      stats, s: count('p1'), m: count('p2'), l: count('p3'),
      st: text('p1'), mt: text('p2'), lt: text('p3'),
      wxDrawn: [count('a1'), count('a2'), count('a3')],
    };
  });
  /* ⚠ THE MEASUREMENT THIS SCHEDULER EXISTS FOR. On the previous board four cards produced seven
     identical CoinGecko requests in eight seconds, because the unit of work was the CARD. Here three
     weather cards over one place produce ONE key — and `weather.here` falls back to the map centre,
     so it is genuinely the same question rather than a coincidence of spelling. */
  expect(r.stats.cards, 'six cards are subscribed or ticking').toBeGreaterThanOrEqual(3);
  const wx = r.stats.byKey.filter((k) => k.key.indexOf('wx:') === 0);
  expect(wx.length, 'the three weather cards resolve to ONE request key').toBe(1);
  expect(wx[0].members, 'and all three share it').toBe(3);
  /* ⚠ AND A CARD WITH NO ANSWER IS NEVER AN EMPTY BOX. Under hermetic routing the weather cards
     cannot load; they must still draw a skeleton or a state notice. MEASURED: before render()
     painted after attaching, all three were literally empty for ever. */
  r.wxDrawn.forEach((n) => expect(n, 'a card with no data still draws its state').toBeGreaterThan(0));
  /* and the three sizes are three different amounts of information, not one layout scaled */
  expect(r.s).toBeGreaterThan(0);
  expect(r.m, 'M says more than S').toBeGreaterThan(r.s);
  expect(r.l, 'L says more than M').toBeGreaterThan(r.m);
  expect(r.mt, 'M is not S with a bigger font — it says different words').not.toBe(r.st);
  expect(r.lt, 'and L is not M either').not.toBe(r.mt);
});

test('#R292 a hidden board does no work, and the gallery opens without calling an API', async () => {
  const r = await page.evaluate(async () => {
    const api = /open-meteo|coingecko|gold-api|alternative\.me|earthquake\.usgs|wikimedia|hacker-news|wheretheiss|thespacedevs|mempool|nager|swpc\.noaa|fxratesapi|er-api/;
    let calls = 0;
    const realFetch = window.fetch;
    window.fetch = function (u) { try { if (api.test(String((u && u.url) || u))) calls++; } catch (e) {} return realFetch.apply(this, arguments); };
    /* a board with a ticking clock on it */
    window.IntMapWidgets2._setActive(null, { v: 4, items: [
      { i: 'c1', d: 'time.digital', s: 's', c: { zone: 'UTC', seconds: true, face: 'digital', cities: [] }, at: 1 },
    ] });
    window.IntMapWidgets2._layout.render();
    await new Promise((s) => setTimeout(s, 500));
    const tickingWhileShown = window.IntMapWidgetCore.tickRunning();
    const before = document.querySelector('[data-wid="c1"]').innerText;
    await new Promise((s) => setTimeout(s, 1600));
    const moved = document.querySelector('[data-wid="c1"]').innerText !== before;

    /* the gallery: forty-eight rows, a search, categories and a preview — and no network */
    const at0 = calls;
    window.IntMapWidgetGallery.open();
    await new Promise((s) => setTimeout(s, 900));
    const rows = document.querySelectorAll('.wgt-grow').length;
    const cats = document.querySelectorAll('.wgt-cat').length;
    const search = document.querySelector('.wgt-search');
    search.value = 'moon';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    const found = document.querySelectorAll('.wgt-grow').length;
    document.querySelector('.wgt-grow-b').click();
    const preview = { card: !!document.querySelector('.wgt-preview'), sizes: document.querySelectorAll('.wgt-size').length };
    const galleryCalls = calls - at0;
    document.querySelector('.wgt-sheet-x').click();

    /* the board hidden: the ticker must stop entirely, not merely return early */
    const board = document.getElementById('widget-board');
    window.IntMapWidgets2._setActive(null, { v: 4, items: [] });
    board.style.display = 'none';
    window.IntMapWidgets2._layout.updateBoardVisibility();
    await new Promise((s) => setTimeout(s, 300));
    const out = { tickingWhileShown, moved, rows, cats, found, preview, galleryCalls,
      tickingWhileHidden: window.IntMapWidgetCore.tickRunning(), subs: window.IntMapWidgetCore.tickCount() };
    board.style.display = 'block';
    window.fetch = realFetch;
    return out;
  });
  expect(r.tickingWhileShown, 'a visible clock ticks').toBe(true);
  expect(r.moved, 'and the seconds really move').toBe(true);
  expect(r.rows, 'the gallery lists every widget').toBeGreaterThanOrEqual(40);
  expect(r.cats, 'with the nine categories').toBe(9);
  expect(r.found, 'and a search narrows it').toBeGreaterThan(0);
  expect(r.found).toBeLessThan(r.rows);
  expect(r.preview.card, 'a widget opens into a real preview').toBe(true);
  expect(r.preview.sizes, 'with the three sizes offered').toBe(3);
  /* ⚠ §8.8 / §20: opening the picker must not call thirty-nine APIs. */
  expect(r.galleryCalls, 'the gallery previews from cache or from a declared sample — it fetches nothing').toBe(0);
  /* ⚠ §12: not "the callback returns early" — the timer is not running at all. */
  expect(r.subs, 'a board with no cards has no ticker subscribers').toBe(0);
  expect(r.tickingWhileHidden, 'so the 1 Hz timer is not running either').toBe(false);
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   #R296 · THE TWO WIDGET-BOARD COMPLAINTS A SOURCE CHECK CANNOT ANSWER
   ----------------------------------------------------------------------------------------------
   Appended to this boot rather than given a spec of its own (#R207/#R292): both questions are about
   LAYOUT — whether the board can be scrolled at all, and whether the cards actually tile — and a
   stylesheet assertion cannot answer either. The measurement that produced these is in DEV-NOTES:
   every ancestor of #widget-board was `overflow-y: visible` or `hidden`, so nothing scrolled.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
test('#R296 the widget board scrolls, and the cards tile without a fillable hole', async () => {
  const r = await page.evaluate(async () => {
    /* the board is the sidebar's pane when NO tab is open — close whichever is active */
    const on = document.querySelector('.control-panel .mode-btn.active');
    if (on) on.click();
    await new Promise((s) => setTimeout(s, 800));
    try { window.IntMapWidgets2.sync(); } catch (e) {}
    await new Promise((s) => setTimeout(s, 800));

    const bo = document.getElementById('widget-board');
    if (!bo || getComputedStyle(bo).display === 'none') return { hidden: true };

    /* ⚠ THE QUESTION IS «does anything scroll», so walk the ancestors the way the report did */
    let e = bo, scroller = null;
    while (e && e !== document.documentElement) {
      const oy = getComputedStyle(e).overflowY;
      if (oy === 'auto' || oy === 'scroll') { scroller = e; break; }
      e = e.parentElement;
    }

    /* a board of mixed sizes: S alone in front of M would leave a hole without packing */
    const ST = window.IntMapWidgets2._store, LAY = window.IntMapWidgets2._layout, WC = window.IntMapWidgetCore;
    const ids = WC.ids();
    for (let i = 0; i < 14 && i < ids.length; i++) { try { ST.add(ids[i]); } catch (er) {} }
    ST.raw().forEach((it, i) => { try { ST.setSize(it.i, i % 3 === 0 ? 's' : 'm'); } catch (er) {} });
    LAY.render();
    await new Promise((s) => setTimeout(s, 1200));

    const g = bo.querySelector('.wgt-grid');
    const rows = {};
    [...g.children].forEach((c) => {
      const t = Math.round(c.getBoundingClientRect().top);
      (rows[t] = rows[t] || []).push((c.className.match(/wgt-([slm])\b/) || [])[1] || '?');
    });
    const before = bo.scrollTop;
    bo.scrollTop = 600;
    const after = bo.scrollTop;
    return {
      scrollerIs: scroller ? (scroller.id || scroller.className) : null,
      ch: bo.clientHeight, sh: bo.scrollHeight, before, after,
      store: ST.raw().map((x) => x.s).join(''),
      dom: [...g.children].map((c) => (c.className.match(/wgt-([slm])\b/) || [])[1] || '?').join(''),
      /* a row holding a LONE s while another s came later is the hole the report named */
      loneS: Object.values(rows).filter((v) => v.length === 1 && v[0] === 's').length,
      pairedS: Object.values(rows).filter((v) => v.length === 2 && v.every((x) => x === 's')).length,
    };
  });
  if (r.hidden) return;                       /* no board to measure on this boot */
  expect(r.scrollerIs, 'the board itself is the scrolling region').toContain('widget-board');
  expect(r.sh, 'a board of 14+ cards is taller than its box, or this measures nothing').toBeGreaterThan(r.ch + 20);
  expect(r.after, 'and it can actually be scrolled').toBeGreaterThan(r.before);
  /* the stored order alternates s,m,m — so every s would sit alone without packing */
  expect(r.store).toMatch(/^smm/);
  expect(r.pairedS, 'the S cards are paired up rather than each leaving half a row empty').toBeGreaterThan(0);
  /* at most ONE lone s may remain: the last one, with nothing 1-wide left to pair it with */
  expect(r.loneS, 'no S card is left alone while another S came after it').toBeLessThanOrEqual(1);
});

/* ══ #R349 — the clock reaches 1850, and the war layer paints the day it is given ══════════════
   These two ran as tests/r349.spec.js first and were folded in here for the reason #R207 gives:
   the suite's total is a ratchet, a new spec file costs a whole boot, and the assertions
   themselves cost almost nothing on a page that is already up. Nothing about what they assert
   changed in the move. */

test('#R349 the clock reaches 1850 — the slider drags there, and the deep past answers', async () => {
  const r = await page.evaluate(async () => {
    const tl = document.getElementById('news-timeline');
    tl.classList.remove('collapsed');
    document.getElementById('ntl-mode-year').click();
    await new Promise((res) => setTimeout(res, 60));
    const sl = document.getElementById('ntl-slider');
    const min = sl.min;
    sl.value = '1850';
    sl.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((res) => setTimeout(res, 120));
    const ticks = [...document.querySelectorAll('#ntl-scale span')].map((s) => s.textContent);
    /* the shipped snapshot resolver, run in the shipped bundle */
    const N = window.IntMapTimeBorders._nearest;
    const nearest = { y1875: N(1875), y1850: N(1850), y1830: N(1830), y1980: N(1980) };
    /* …and a figure the bundle did not carry before this round */
    const M = window.IntMapMaddison;
    await M.load();
    const mad = { min: M.minYear, deu1875: M.gdppc('DEU', 1875), gbr1850: M.gdppc('GBR', 1850) };
    return { min, settled: sl.value, applied: window.IntMapTime.year(), ticks, nearest, mad, kernelMin: window.IntMapTime.min };
  });
  /* tests/r349-checks proves the kernel's floor and that the panel READS it. None of that proves a
     reader can drag to 1850: `applyMode` rewrites the attribute at runtime and a range input
     silently clamps a value below its own `min`. */
  expect(r.kernelMin).toBe(1850);
  expect(r.min).toBe('1850');
  expect(r.settled).toBe('1850');
  expect(r.applied).toBe(1850);
  expect(r.ticks[0]).toBe('1850');
  /* 1886 is where the yearly source starts; below it the only frames that exist are 1815 and 1880 */
  expect(r.nearest.y1875).toBe(1880);
  expect(r.nearest.y1850).toBe(1880);      /* the midpoint of that 65-year gap is 1847.5 */
  expect(r.nearest.y1830).toBe(1815);
  expect(r.nearest.y1980).toBe(1960);      /* …and the guard still holds ABOVE CShapes */
  expect(r.mad.min).toBe(1850);
  expect(r.mad.deu1875).toBeGreaterThan(0);
  expect(r.mad.gbr1850).toBeGreaterThan(0);
});

test('#R349 the war layer draws nothing until it is asked, then paints the day it is given', async () => {
  /* (#R409) one row became two. Everything this test proved about the cut is proved on `dl-ww2`,
     and the two extra assertions are the split itself: switching WW2 on must not create WW1's
     sources, and the legend's own slider must move the day WITHOUT moving Chronos. */
  const before = await page.evaluate(() => ({
    checked: document.getElementById('dl-ww2').checked,
    checked1: document.getElementById('dl-ww1').checked,
    on: window.IntMapWarFronts.isOn('ww2'),
    hasSource: window.IntMapGeoEngine.layers.hasSource('ww2-src'),
  }));
  /* the round promised a session that never asks for it is unchanged */
  expect(before.checked).toBe(false);
  expect(before.checked1).toBe(false);
  expect(before.on).toBe(false);
  expect(before.hasSource).toBe(false);

  const r = await page.evaluate(async () => {
    const el = document.getElementById('dl-ww2');
    el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true }));
    window.IntMapTime.set(new Date('1941-12-05T12:00:00Z'), { source: 'test' });
    const GE = window.IntMapGeoEngine;
    GE.camera.jumpTo({ center: [32, 54], zoom: 3.6, pitch: 0, bearing: 0 });
    const at = (ll) => {
      const p = GE.coords.project(ll);
      const f = GE.coords.queryRenderedFeatures([p.x, p.y], { layers: ['ww2-fill'] })[0];
      return f ? { fac: f.properties.fac, nm: f.properties.nm } : null;
    };
    const c = GE.render.canvas();
    const drawnFronts = () => GE.coords.queryRenderedFeatures([[0, 0], [c.clientWidth, c.clientHeight]], { layers: ['ww2-front'] }).length;
    /* ⚠ (#R409) THE OPERATION DOTS ARE ASKED FOR SEPARATELY, because they are the one part of this
       layer that went missing without anything saying so. The engine facade swallows a rejected
       `addLayer`, so a circle layer built from a record that had not arrived yet simply was not
       there — four of five layers drawing, operation names on the map with no dot under them, and
       every later `ensure()` returning early because the SOURCE existed. */
    const drawnEvents = () => GE.coords.queryRenderedFeatures([[0, 0], [c.clientWidth, c.clientHeight]], { layers: ['ww2-evt'] }).length;
    /* ⚠ WAIT FOR THE RENDERER, NOT FOR THE DATA, AND FOR EVERY THING THIS TEST ASKS ABOUT.
       `setSourceData` returns long before MapLibre has drawn a tile, and `queryRenderedFeatures`
       answers about what is DRAWN. A fixed sleep passed on a quiet page and failed on a busy one —
       the assertion was right and the wait was measuring the wrong thing. */
    const t0 = Date.now();
    while (Date.now() - t0 < 25000) {
      await new Promise((res) => setTimeout(res, 250));
      if (window.IntMapWarFronts.date('ww2') === '1941-12-05' && at([13.405, 52.520]) && drawnFronts() && drawnEvents()) break;
    }
    return {
      date: window.IntMapWarFronts.date('ww2'),
      ww1Src: GE.layers.hasSource('ww1-src'),
      fronts: drawnFronts(), events: drawnEvents(), evtLayer: GE.layers.has('ww2-evt'),
      frontsBuilt: window.IntMapWarFronts._build('ww2', '1941-12-05').lines.features.length,
      minsk: at([27.567, 53.902]), moscow: at([37.618, 55.756]), berlin: at([13.405, 52.520]),
    };
  });
  expect(r.date).toBe('1941-12-05');
  /* the OTHER war has not been built: an instance is created by its own row, not by the module */
  expect(r.ww1Src).toBe(false);
  /* ⚠ THE POINT OF THIS TEST. Minsk and Moscow are inside the SAME CShapes polygon — the Soviet
     Union — and they are on opposite sides of the front, so the only thing that can tell them apart
     is the cut. A layer that failed to cut answers both the same; one cut the wrong way round
     answers both, swapped. */
  expect(r.minsk && r.minsk.fac).toBe('AXIS');
  expect(r.moscow && r.moscow.fac).toBe('ALLIED');
  expect(r.minsk.nm).toBe(r.moscow.nm);
  expect(r.berlin && r.berlin.fac).toBe('AXIS');
  expect(r.frontsBuilt).toBeGreaterThan(0);
  expect(r.fronts, 'front lines built=' + r.frontsBuilt).toBeGreaterThan(0);
  expect(r.evtLayer, 'the operation-dot layer exists at all').toBe(true);
  expect(r.events, 'operation dots are drawn, not just their labels').toBeGreaterThan(0);

  /* ⚠ (#R409 追記) CLICKING AN OPERATION OVER LAND MUST OPEN THE OPERATION, NOT THE COUNTRY UNDER IT.
     Found on production: onLayer is a plain per-layer listener and NOT «topmost wins», so one click
     ran both handlers and whichever popup was shown second removed the other — every operation that
     is not at sea was unreachable, and Kursk opened the card for the Soviet Union underneath it.
     The fix is #R210's claimClick / clickClaimed; this is the assertion that keeps it. */
  const pop = await page.evaluate(async () => {
    const GE = window.IntMapGeoEngine;
    window.IntMapWarFronts.setDate('ww2', '1943-07-05');
    GE.camera.jumpTo({ center: [36.187, 51.731], zoom: 6, pitch: 0, bearing: 0 });
    const t0 = Date.now();
    while (Date.now() - t0 < 20000) {
      await new Promise((res) => setTimeout(res, 250));
      const q = GE.coords.project([36.187, 51.731]);
      if (GE.coords.queryRenderedFeatures([q.x, q.y], { layers: ['ww2-evt'] }).length) break;
    }
    const c = GE.render.canvas(), b = c.getBoundingClientRect(), q = GE.coords.project([36.187, 51.731]);
    const at = { bubbles: true, clientX: q.x + b.left, clientY: q.y + b.top };
    for (const type of ['mousedown', 'mouseup', 'click']) c.dispatchEvent(new MouseEvent(type, at));
    await new Promise((res) => setTimeout(res, 900));
    const el = document.querySelector('.plc-popup');
    return { onDot: GE.coords.queryRenderedFeatures([q.x, q.y], { layers: ['ww2-evt'] }).length,
      kind: !!(el && el.querySelector('.war-pop-k')), wiki: !!(el && el.querySelector('a')),
      text: (el ? el.textContent : '').replace(/\s+/g, ' ').slice(0, 80) };
  });
  expect(pop.onDot, 'the click landed on an operation dot').toBeGreaterThan(0);
  expect(pop.kind, 'the operation card opened, not the country under it: ' + pop.text).toBe(true);
  expect(pop.wiki, 'the operation card carries its Wikipedia link').toBe(true);

  /* ⚠ (#R409) 「Chronosは動かすな。」 — the legend's own range moves the layer and NOTHING else. */
  /* ⚠ the expectation is RELATIVE to wherever the slider was standing, not a date written here.
     The first spelling pinned '1942-02-03', which was only true while this block happened to run
     first; adding the click check above it moved the starting day and the assertion failed for a
     reason that had nothing to do with what it measures. A test that depends on the order of the
     blocks around it measures the order. */
  const slid = await page.evaluate(async () => {
    const clockBefore = window.IntMapTime.iso();
    const rng = document.querySelector('#data-legend-ww2 .war-range');
    if (!rng) return { missing: true };
    const from = window.IntMapWarFronts.date('ww2');
    const step = Math.min(+rng.max - +rng.value, 60);
    rng.value = String(+rng.value + step);
    rng.dispatchEvent(new Event('input', { bubbles: true }));
    const t0 = Date.now();
    while (Date.now() - t0 < 8000) {
      await new Promise((res) => setTimeout(res, 150));
      if (window.IntMapWarFronts.date('ww2') !== from) break;
    }
    const want = new Date(Date.parse(from + 'T00:00:00Z') + step * 86400000).toISOString().slice(0, 10);
    return { missing: false, clockBefore, clockAfter: window.IntMapTime.iso(), from, step, want, layerDate: window.IntMapWarFronts.date('ww2') };
  });
  expect(slid.missing, 'the legend has a day slider').toBe(false);
  expect(slid.step, 'the slider had room to move').toBeGreaterThan(0);
  expect(slid.layerDate, 'the slider moved the layer by exactly the days it was dragged, from ' + slid.from).toBe(slid.want);
  expect(slid.clockAfter, 'the slider must not move the master clock').toBe(slid.clockBefore);

  const after = await page.evaluate(async () => {
    const el = document.getElementById('dl-ww2');
    el.checked = false; el.dispatchEvent(new Event('change', { bubbles: true }));
    const GE = window.IntMapGeoEngine;
    const drawn = () => GE.coords.queryRenderedFeatures(undefined, { layers: ['ww2-fill'] }).length;
    /* hiding a layer is a style change, so «switched off» and «no longer drawn» are a repaint apart */
    const t0 = Date.now();
    while (Date.now() - t0 < 15000) {
      await new Promise((res) => setTimeout(res, 200));
      if (!window.IntMapWarFronts.isOn('ww2') && !drawn()) break;
    }
    return { on: window.IntMapWarFronts.isOn('ww2'), drawn: drawn() };
  });
  expect(after.on).toBe(false);
  expect(after.drawn).toBe(0);
});
