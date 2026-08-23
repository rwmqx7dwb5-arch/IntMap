import { readFileSync } from 'node:fs';
// (#R185) Browser regressions for this round.
//
// Each one pins a behaviour that was found by MEASURING the running app, and each is written as
// the measurement rather than as the code — so it keeps holding if the implementation moves.
import { test, expect } from '@playwright/test';
import { bootEngine } from './helpers/engine.js';

/* (#R202) the altitude below which js/satellites-live.js treats an object as re-entered and stops
   drawing it. Derived rather than restated — see the assertion that uses it. */
const DECAY_FLOOR_KM = (() => {
  const src = readFileSync(new URL('../js/satellites-live.js', import.meta.url), 'utf8');
  const m = src.match(/if\(!\(altKm>(\d+)\)\)\{ dropped\+\+/);
  if (!m) throw new Error('r185: could not find the decay floor in js/satellites-live.js');
  return Number(m[1]);
})();

const BOOT = { timeout: 120_000 };

/* (#R201) ONE page load — see tests/helpers/engine.js
   (#R341) `query` pins WHICH aviation path the page boots with. The aircraft layer has two now: the
   original per-browser sweep, which owns `window.IntMapPlanes3D`, and the GPU cloud that replaced it
   as the default. Only the aircraft test below reads that model, so only it passes a query; the two
   Cesium tests and the satellite one are nothing to do with the live-aircraft layer and boot exactly
   as they did. */
const boot = (page, engine, query) => bootEngine(page, engine, { url: '/' + (query || ''), timeout: BOOT.timeout });

test('R185 Cesium: a pan that does not change the tile cover rebuilds no layers', async ({ page }) => {
  /* (#R186) 240 s → 360 s. This is a WALL-CLOCK budget, not the thing under test: what is asserted is
     that a pan which does not cross a tile boundary rebuilds no layers, and that answer is a count,
     not a duration. Measured on three builds of #R186 (with the sky, without it, without the polar
     imagery) the answer was identical every time — median 0 dirty layers per flush, max 14 — while
     the wall clock swung from 45 s to 91 s purely with how much layer data happened to have loaded.
     On a CI runner roughly three times slower than the dev machine, 240 s was marginal and it began
     timing out; the measurement it protects is unchanged. */
  test.setTimeout(360_000);
  await boot(page, 'cesium');
  await page.evaluate(async () => {
    document.getElementById('btn-view-sat').click(); await new Promise(r => setTimeout(r, 700));
    window.IntMapGeoEngine.camera.jumpTo({ center: [7.98, 46.55], zoom: 13, pitch: 65, bearing: 20 });
  });
  await page.waitForFunction(() => { try { return !!window.IntMapGeoEngine.raw()._scene.globe.tilesLoaded; } catch (_) { return false; } }, null, { timeout: 90_000 }).catch(() => {});
  await page.waitForTimeout(1500);

  const r = await page.evaluate(async () => {
    const v = window.IntMapGeoEngine.raw();
    const nextFrame = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    /* count what the flush is asked to rebuild, per gesture frame */
    const dirty = [];
    const orig = v._flush.bind(v);
    v._flush = function () { dirty.push(v._dirty.size); return orig(); };
    let lng = 7.98, lat = 46.55, brg = 20;
    for (let i = 0; i < 24; i++) {
      lng += 0.0004; lat += 0.00015; brg += 0.12;               /* well inside one tile */
      v.setCamera({ center: [lng, lat], zoom: 13, pitch: 65, bearing: brg }, null, { silent: true });
      await nextFrame();
    }
    v._flush = orig;
    dirty.sort((a, b) => a - b);
    return { flushes: dirty.length, median: dirty[dirty.length >> 1], max: dirty[dirty.length - 1],
      layers: v._layers.length, entities: (() => { let n = 0; const c = v._dsColl; for (let i = 0; i < c.length; i++) n += c.get(i).entities.values.length; return n; })() };
  });
  console.log('R185 cesium gesture · flushes', r.flushes, '· dirty layers per flush: median', r.median, 'max', r.max,
    '· (of', r.layers, 'layers,', r.entities, 'entities)');
  /* BEFORE: every gesture frame marked every vector layer dirty — measured 84 of them, 1,900
     entities re-created at 100 ms a frame. The camera moving is not a reason to rebuild a layer;
     its FEATURES changing is, and a sub-tile pan changes none. */
  expect(r.flushes).toBeGreaterThan(4);
  expect(r.median, 'a pan inside one tile must rebuild nothing').toBe(0);
});

test('R185 Cesium: the satellite imagery is chosen for the display, not for the terrain error', async ({ page }) => {
  test.setTimeout(240_000);
  await boot(page, 'cesium');
  await page.evaluate(async () => {
    document.getElementById('btn-view-sat').click(); await new Promise(r => setTimeout(r, 700));
    window.IntMapGeoEngine.camera.jumpTo({ center: [7.98, 46.55], zoom: 13, pitch: 0, bearing: 0 });
  });
  await page.waitForFunction(() => { try { return !!window.IntMapGeoEngine.raw()._scene.globe.tilesLoaded; } catch (_) { return false; } }, null, { timeout: 90_000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => {
    const s = window.IntMapGeoEngine.raw()._scene, g = s.globe;
    const terrain = [], imagery = [];
    for (const t of g._surface._tilesToRender) {
      terrain.push(t._level);
      const d = t.data; if (!d || !d.imagery) continue;
      for (const ti of d.imagery) { const im = ti.readyImagery || ti.loadingImagery; if (!im) continue;
        const tx = im.texture || im.textureWebMercator; if (tx) imagery.push({ level: im.level, w: tx.width }); }
    }
    return { terrainMax: Math.max(...terrain), imageryMax: Math.max(...imagery.map(i => i.level)),
      texWidths: [...new Set(imagery.map(i => i.w))], sse: g.maximumScreenSpaceError, n: imagery.length,
      dpr: window.devicePixelRatio,
      stitched: (() => { try { return !!(window.IntMapSatProto && window.IntMapSatProto.hiDPI()); } catch (_) { return false; } })() };
  });
  console.log('R185 cesium imagery · terrain level', r.terrainMax, '· imagery level', r.imageryMax,
    '· texture widths', r.texWidths.join('/'), '· SSE', r.sse);
  /* MEASURED: Cesium picks the imagery level so one texel lands on one unit of the terrain tile's
     geometric error, and the terrain refines to `maximumScreenSpaceError` DEVICE pixels — so at the
     default SSE 2 the imagery arrived at half the display's resolution (sharpness 7.5 against
     MapLibre's 22.7 on the same camera). One level deeper is one texel per device pixel. */
  expect(r.n).toBeGreaterThan(0);
  expect(r.imageryMax, 'imagery must be one level finer than the terrain tile carrying it')
    .toBe(r.terrainMax + Math.round(Math.log2(r.sse)));
  /* …and the tile itself is whatever the DISPLAY asked for: #R178's stitched 512 px on a HiDPI
     screen, Esri's native 256 on a 1x one. Asserting a raw pixel count would only be asserting the
     runner's devicePixelRatio. */
  expect(r.texWidths).toContain(r.stitched ? 512 : 256);
});

test('R185 satellites: the layer is not empty when the live feed is unreachable', async ({ page }) => {
  test.setTimeout(240_000);
  /* the exact failure of 2026-08-01, made deterministic: celestrak.org unreachable, and the public
     relays with it. Everything else — including the catalogue this site ships — is untouched. */
  await page.route(/celestrak\.org|allorigins\.win|codetabs\.com/, (route) => route.abort());
  await boot(page, 'maplibre');
  await page.evaluate(() => {
    const cb = document.getElementById('dl-sats');
    if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  /* ⚠ (#R304) WAIT FOR THE SENTENCE TOO, NOT ONLY FOR THE PIXELS. js/satellites-live.js primes from
     the bundled catalogue, DRAWS, and only then finishes losing the live race and rewrites `lastErr`
     to say 「live feed unreachable」 — so 「drawn > 0」 arrives before the message this test is about.
     MEASURED on a busy machine: `bundled: true` with `err: ''`, which is the honest state one
     moment before the sentence lands. Waiting for the whole claim is not weaker: if the message
     never comes, the wait times out and the test fails, which is what it did when it raced. */
  await page.waitForFunction(() => {
    try { const s = window.IntMapSatellites && window.IntMapSatellites.state();
      return !!(s && s.catalogue > 0 && s.drawn > 0 && /shipped with the app/.test(String(s.err || ''))); }
    catch (_) { return false; }
  }, null, { timeout: 90_000 });
  const s = await page.evaluate(() => window.IntMapSatellites.state());
  console.log('R185 satellites (feed blocked) · catalogue', s.catalogue, '· drawn', s.drawn,
    '· bundled', s.bundled, '·', s.err);
  expect(s.catalogue, 'the shipped catalogue must carry the layer').toBeGreaterThan(500);
  expect(s.drawn).toBeGreaterThan(100);
  expect(s.bundled, 'and it must SAY it is the shipped copy').toBe(true);
  expect(String(s.err || '')).toMatch(/shipped with the app/);
  /* every drawn object is a real propagated position, not a placeholder at 0,0 */
  const pos = await page.evaluate(() => {
    const l = window.IntMapSatellites.list();
    const zero = l.filter(f => Math.abs(f.lng) < 1e-9 && Math.abs(f.lat) < 1e-9).length;
    const alt = l.map(f => f.altKm).filter(a => a > 0);
    const hdg = l.filter(f => f.headingDeg != null).length;
    return { n: l.length, zero, minAlt: Math.min(...alt), maxAlt: Math.max(...alt), hdg };
  });
  expect(pos.zero, 'a satellite we cannot propagate is dropped, never drawn at 0,0').toBe(0);
  /* ⚠ (#R202) THE FLOOR IS THE APP'S OWN, READ FROM THE APP. This asked for 100 km while
     js/satellites-live.js drops an object at 80 — two numbers for one rule, and CelesTrak's active
     catalogue eventually put something between them: a real satellite in its last decaying orbits,
     reported at 83.5 km, which the app is designed to keep and this test then called a defect.
     The number now comes from the source, so the pair cannot drift apart again. */
  expect(pos.minAlt).toBeGreaterThan(DECAY_FLOOR_KM);
  expect(pos.maxAlt).toBeGreaterThan(30000);      /* the geostationary belt is in there */
  /* (#R185b) …and nothing beyond the Moon: SGP4 diverges silently on a few element sets, and one
     of them reported 9,244,632 km on a ninety-minute orbit. Found in production verification. */
  expect(pos.maxAlt, 'a diverged SGP4 solution is not a position').toBeLessThan(500000);
  expect(pos.hdg, 'every object knows which way it is going — the icon turns to it').toBe(pos.n);
});

test('R185 aircraft: the 3-D body carries its own outline and its altitude is its own', async ({ page }) => {
  test.setTimeout(240_000);
  /* ⚠ ?aviation=v1 — see the note on boot(). Every number read below comes out of
     `IntMapPlanes3D.state()`, which only the sweep fills: on the default path `state().planes` never
     leaves 0, so the 60 s wait beneath expired and `test.skip` blamed the feed — 66 s of a green run
     asserting nothing (measured, #R341). The assertions are unchanged. */
  await boot(page, 'maplibre', '?aviation=v1');
  await page.evaluate(async () => {
    window.IntMapGeoEngine.camera.jumpTo({ center: [139.78, 35.55], zoom: 11, pitch: 0, bearing: 0 });
    await new Promise(r => setTimeout(r, 900));
    const cb = document.getElementById('dl-planes');
    if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
    /* (#R187) #R185's point was that the 3-D body is what the user SEES, so the flat glyph's rim and
       halo were invisible work. 「航空機のマークは最初のデザインに戻して」 has since made the flat
       glyph the default again — which does not retire the 3-D body or anything this test checks about
       it, so the test turns it on rather than assuming it. */
    window.IntMapPlanes3D.set(true);
  });
  const ok = await page.waitForFunction(() => {
    try { const s = window.IntMapPlanes3D && window.IntMapPlanes3D.state(); return !!(s && s.planes > 0); }
    catch (_) { return false; }
  }, null, { timeout: 60_000 }).then(() => true).catch(() => false);
  /* the ADS-B feed is live and keyless; if it is not answering, this assertion has nothing to say */
  test.skip(!ok, 'live aircraft feed returned nothing here');
  const s = await page.evaluate(() => window.IntMapPlanes3D.state());
  console.log('R185 aircraft ·', s.aircraft, 'aircraft ·', s.features,
    '· lifted', s.lifted, '· maxAlt', s.maxAlt);
  expect(s.on, 'the 3-D body is switched on for this test (#R190 made it the default again)').toBe(true);
  expect(s.aircraft).toBeGreaterThan(0);
  /* (#R190) the multi-part body is withdrawn — one solid per aircraft, plus a post under each
     airborne one. The invariant #R183/#R185 encoded here is still the one that matters: the aircraft
     count is derived by NAME, never from the feature total (#R181: suspect what a counter counts). */
  expect(s.features).toBeGreaterThanOrEqual(s.aircraft);
  /* an altitude read off a part's base would now be tens of metres high for a parked aeroplane */
  expect(s.maxAlt).toBeLessThan(25000);
  if (s.lifted === 0) expect(s.maxAlt).toBe(0);
});
