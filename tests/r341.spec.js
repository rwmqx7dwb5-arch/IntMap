/* ============================================================================
 *  R341 — the live-aircraft platform: the two claims that must hold on EVERY push.
 *   ① the browser never contacts an ADS-B provider directly, and the GPU cloud is what draws
 *   ② ZOOM CHANGES DETAIL, NEVER THE FLEET — and there is no "zoom in to load aircraft" prompt
 *
 *  ⚠ WHY ONLY TWO, AND WHY THESE. This file is the round's own spec, so scripts/tiers.mjs puts it
 *  in front of every push. Everything in the gate must therefore be true whether or not a
 *  third-party network answered this minute — so the claims that need real aircraft (a pick lands
 *  on one, the attribution names the provider) live in tests/r341-live.spec.js and run nightly.
 *  A gate that goes red because adsb.lol had a bad afternoon is a gate people learn to ignore.
 *
 *  Both claims below were FALSE in production before this round, and neither needs a feed to check:
 *    · the browser issued up to 128 requests straight to api.airplanes.live per sweep;
 *    · the layer set planesData=[] below z2 and showed "Zoom in to load live aircraft" — measured
 *      at z1 WHILE 270 invented aircraft were on screen, a hint and a picture disagreeing about the
 *      same fact.
 *
 *  ⚠ THE SHARED FIXTURE, NOT A BOOT OF ITS OWN. `app` is worker-scoped and already booted; a
 *  private page.goto cost this file 2.2 min by itself and put the core tier over its ceiling
 *  (scripts/test-budget.mjs says in as many words: make it faster, do not re-tier it, do not raise
 *  the ceiling). That is how tests/r322.spec.js costs 4 s.
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';

const UPSTREAM = /api\.adsb\.lol|api\.airplanes\.live|opensky-network\.org/;

test('R341 ① the browser never asks a provider, and the GPU cloud is the renderer', async ({ app }) => {
  const page = app.page;

  const upstream = [];
  const onReq = (r) => { if (UPSTREAM.test(r.url())) upstream.push(r.url()); };
  page.on('request', onReq);

  await page.waitForFunction(() => document.querySelectorAll('.lyr-row').length > 100, null, { timeout: 60000 });

  /* ⚠ THE ROWS TOGGLE ON THE ROW'S pointerdown, NOT THE CHECKBOX'S click (#R37). A synthetic
     `cb.click()` flips the DOM state and the app syncs it straight back — measured while writing
     this file, and it is why the first version "found" nothing at all. */
  await page.evaluate(() => {
    const cb = document.getElementById('dl-planes');
    if (cb && !cb.checked) {
      const row = cb.closest('label') || cb.closest('.lyr-row') || cb.parentElement;
      ['pointerdown', 'pointerup'].forEach((t) =>
        row.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 1 })));
    }
  });

  /* The cloud is added as soon as the layer is switched on — it does not wait for data, which is
     precisely what lets this assertion stand without one. */
  await page.waitForFunction(
    () => { try { return window.IntMapGeoEngine.layers.hasAircraftCloud('lyr-aircraft-cloud'); } catch (_) { return false; } },
    null, { timeout: 30000 },
  );

  const state = await page.evaluate(() => {
    const E = window.IntMapGeoEngine;
    return {
      capable: !!E.capabilities().aircraftCloud,
      cloud: !!E.layers.hasAircraftCloud('lyr-aircraft-cloud'),
      /* the OLD renderings must stay hidden — three renderings of one layer, and only one of them
         may be visible (#R172's rule, with a third member) */
      flatVisible: (() => { try { return E.layers.has('lyr-planes') && E.layers.getLayout('lyr-planes', 'visibility') === 'visible'; } catch (_) { return false; } })(),
      extrusionVisible: (() => { try { return E.layers.has('lyr-planes-3d') && E.layers.getLayout('lyr-planes-3d', 'visibility') === 'visible'; } catch (_) { return false; } })(),
      endpoint: (() => { try { return window.IntMapPlanes3D.aviation().endpoint; } catch (_) { return ''; } })(),
      v2: (() => { try { return window.IntMapPlanes3D.aviation().v2; } catch (_) { return null; } })(),
    };
  });

  expect(state.capable, '① the renderer declares the aircraft-cloud primitive').toBe(true);
  expect(state.cloud, '① the aircraft cloud is in the style').toBe(true);
  expect(state.v2, '① the new path is the default').toBe(true);
  expect(state.endpoint, "① and it reads IntMap's own feed").toMatch(/functions\/v1\/aviation-feed$/);
  expect(state.flatVisible, '① the old flat glyph layer is not also drawing').toBe(false);
  expect(state.extrusionVisible, '① the old extrusion layer is not also drawing').toBe(false);
  expect(upstream, '① the browser must not contact any ADS-B provider directly: ' + upstream.slice(0, 3).join(', '))
    .toEqual([]);

  page.off('request', onReq);
});

test('R341 ② zoom changes the detail, never the fleet — and never prompts', async ({ app }) => {
  const page = app.page;
  await page.waitForFunction(() => document.querySelectorAll('.lyr-row').length > 100, null, { timeout: 60000 });
  await page.evaluate(() => {
    const cb = document.getElementById('dl-planes');
    if (cb && !cb.checked) {
      const row = cb.closest('label') || cb.closest('.lyr-row') || cb.parentElement;
      ['pointerdown', 'pointerup'].forEach((t) =>
        row.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 1 })));
    }
  });

  const seen = [];
  for (const z of [0, 1, 2, 11]) {
    await page.evaluate((zz) => window.IntMapGeoEngine.camera.jumpTo({ zoom: zz }), z);
    /* ⚠ (#R401) THE 250 ms SLEEP PER STOP IS GONE. `jumpTo` fires the map's own `zoom` event
       synchronously, and `updatePlanesZoomHint` is a direct listener on it (js/data-layers.js), so
       by the time this evaluate returns the hint has already been shown or hidden. Both assertions
       read state — a style predicate and an element's display — and neither needs a painted frame.
       One second of the four stops, spent so #R401 could add a test to tests/r379.spec.js without
       the suite's total going up (scripts/test-budget.mjs). */
    seen.push(await page.evaluate((zz) => {
      const hint = document.getElementById('planes-zoom-hint');
      return {
        z: zz,
        /* ⚠ THE PROMPT ITSELF IS THE REGRESSION. Its presence at any zoom means a gate came back. */
        hint: !!(hint && hint.style.display !== 'none' && hint.offsetParent !== null),
        hintText: hint ? (hint.textContent || '').slice(0, 40) : '',
        /* the cloud stays in the style at every zoom — the old layer removed its data below z2 */
        cloud: (() => { try { return window.IntMapGeoEngine.layers.hasAircraftCloud('lyr-aircraft-cloud'); } catch (_) { return false; } })(),
      };
    }, z));
  }

  for (const s of seen) {
    expect(s.hint, `② no zoom prompt at z${s.z} (saw: "${s.hintText}")`).toBe(false);
    expect(s.cloud, `② the aircraft cloud is still in the style at z${s.z}`).toBe(true);
  }
});
