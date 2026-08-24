/* ============================================================================
 *  R341 — the claims that need a LIVE FEED, and therefore do not belong in the gate.
 *   ① aircraft are drawn, and nothing is drawn that was not received
 *   ② what is drawn can be picked, and picking it names a real ICAO 24-bit address
 *   ③ aircraft stand at their REPORTED ALTITUDE (the promise tests/r172 has held since #R172)
 *   ④ the source line names the provider that actually answered (ODbL requires it)
 *
 *  ⚠ WHY THIS IS A SEPARATE FILE FROM tests/r341.spec.js. That one is the round's own spec, so
 *  scripts/tiers.mjs puts it in front of every push, and everything in it must be true whether or
 *  not a third-party network answered this minute. These three cannot be: they need real aircraft
 *  from a real provider. Putting them in the gate would make a push fail when adsb.lol has a bad
 *  afternoon, and a gate that fails for reasons the commit did not cause is a gate people learn to
 *  ignore. They run on the nightly schedule and on the dispatch button instead — never on the
 *  merge (#R207) — where a red is worth reading.
 *
 *  ⚠ THE TIER IS EARNED BY THE MEASUREMENT, NOT BY THE NAME. scripts/tiers.mjs treats an UNLISTED
 *  spec as core (`!(d[n] > CORE_MAX_S)` is true when d[n] is undefined), so this file's measured
 *  cost is recorded in tests/durations.json — that entry is what puts it in the deep tier, and
 *  removing it would quietly drag a network-dependent test back into the gate.
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';

const UPSTREAM = /api\.adsb\.lol|api\.airplanes\.live|opensky-network\.org/;

async function switchOn(page) {
  await page.evaluate(() => {
    const cb = document.getElementById('dl-planes');
    if (cb && !cb.checked) {
      const row = cb.closest('label') || cb.closest('.lyr-row') || cb.parentElement;
      ['pointerdown', 'pointerup'].forEach((t) =>
        row.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 1 })));
    }
  });
}

test('R341-live: real aircraft, pickable, and attributed to the provider that answered', async ({ app }) => {
  test.setTimeout(180000);
  const page = app.page;

  const upstream = [];
  const onReq = (r) => { if (UPSTREAM.test(r.url())) upstream.push(r.url()); };
  page.on('request', onReq);

  await page.waitForFunction(() => document.querySelectorAll('.lyr-row').length > 100, null, { timeout: 60000 });
  await switchOn(page);

  let live = true;
  try {
    await page.waitForFunction(
      () => { try { return window.IntMapAviation && window.IntMapAviation.stats().aircraftRendered > 0; } catch (_) { return false; } },
      null, { timeout: 60000 },
    );
  } catch (_) { live = false; }
  test.skip(!live, 'the aviation feed returned no aircraft for this run — the provider, not a regression');

  /* ── ① ─────────────────────────────────────────────────────────────────────────────────────── */
  const st0 = await page.evaluate(() => window.IntMapAviation.stats());
  expect(st0.aircraftRendered, '① aircraft are drawn').toBeGreaterThan(0);
  expect(st0.aircraftRendered, '① nothing is drawn that was not received')
    .toBeLessThanOrEqual(st0.aircraftReceived);
  /* Even with a live feed, the browser still must not have spoken to the provider. */
  expect(upstream, '① the browser never contacts the provider: ' + upstream.slice(0, 3).join(', ')).toEqual([]);

  /* ── ② the pick agrees with the drawing (#R174's rule) ─────────────────────────────────────── */
  const got = await page.evaluate(async () => {
    const A = window.IntMapAviation, E = window.IntMapGeoEngine;
    const snap = A.snapshotFor(3000);
    if (!snap.length) return { skipped: true };
    for (let k = 0; k < Math.min(snap.length, 8); k++) {
      const a = snap[Math.floor((k * snap.length) / 8)];
      E.camera.jumpTo({ center: [a.lon, a.lat], zoom: 7 });
      await new Promise((r) => setTimeout(r, 900));
      const pt = E.coords.project({ lng: a.lon, lat: a.lat });
      const hex = A.pick({ x: pt.x, y: pt.y });
      if (hex) return { hex, detail: await A.detail(hex) };
    }
    return { missed: true, stats: A.stats() };
  });
  expect(got.skipped, '② the store has aircraft to aim at').toBeFalsy();
  expect(got.missed, '② a pick aimed at a drawn aircraft finds it: ' + JSON.stringify(got.stats || {})).toBeFalsy();
  /* A REAL ICAO 24-bit address — six hex digits. The synthetic aircraft this round removed produced
     things like "6TEB8M", which is not hexadecimal at all (0 of 38 valid, measured in production). */
  expect(got.hex, '② the pick names a real ICAO address').toMatch(/^~?[0-9a-f]{6}$/);
  expect(got.detail, '② the pick resolves to a record').toBeTruthy();
  expect(typeof got.detail.lon).toBe('number');
  expect(typeof got.detail.lat).toBe('number');
  /* "not reported" must stay distinguishable from "zero" (§22). */
  expect(got.detail.altFt === null || typeof got.detail.altFt === 'number',
    '② a missing altitude is null, never 0').toBe(true);
  expect(['live', 'lagging', 'stale', 'unknown']).toContain(got.detail.freshness);

  /* ── ③ AIRCRAFT STAND AT THEIR REPORTED ALTITUDE ──────────────────────────────────────────────
     This is the claim tests/r172.spec.js has protected since the 3-D bodies were added, carried
     over to the path that now draws them. §27.4's rule: a spec that pinned the OLD implementation's
     strings is replaced by one that verifies the user-visible behaviour it was standing for — not
     deleted. r172 keeps its own assertion against the v1 path it is about; this is the same promise
     on the path that ships.
     ⚠ The evidence is that the DRAWN position moves with altitude while the ground position does
     not: projecting the same aircraft at 0 m and at its own altitude must differ once the camera is
     tilted, and both must be the renderer's own projection (#R174 — a pick that used a different
     offset would look for the aeroplane somewhere it is not). */
  const alt = await page.evaluate(async () => {
    const A = window.IntMapAviation, E = window.IntMapGeoEngine;
    const snap = A.snapshotFor(3000).filter((a) => a.altFt > 5000);
    if (!snap.length) return { skipped: 'nothing airborne in the store' };
    const a = snap[0];
    E.camera.jumpTo({ center: [a.lon, a.lat], zoom: 8, pitch: 60 });
    await new Promise((r) => setTimeout(r, 900));
    const mx = (180 + a.lon) / 360;
    const p = Math.max(-89.9999, Math.min(89.9999, a.lat)) * Math.PI / 180;
    const my = (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + p / 2))) / 360;
    const ground = E.layers.projectMercAlt(new Float64Array([mx, my, 0]));
    const lifted = E.layers.projectMercAlt(new Float64Array([mx, my, a.altFt * 0.3048]));
    E.camera.jumpTo({ pitch: 0 });
    if (!ground || !lifted) return { noProjection: true };
    return {
      altFt: Math.round(a.altFt),
      dx: lifted[0] - ground[0],
      dy: lifted[1] - ground[1],
      lifting: A.stats().liftAltitude,
    };
  });
  test.skip(!!alt.skipped, alt.skipped);
  expect(alt.noProjection, '③ the engine projects a point at altitude').toBeFalsy();
  expect(alt.lifting, '③ the layer is lifting aircraft to their altitude').toBe(true);
  /* Tilted, several kilometres of altitude has to move the glyph by more than a pixel — otherwise
     the aircraft is being drawn on the ground and the setting is a no-op. */
  expect(Math.hypot(alt.dx, alt.dy),
    `③ ${alt.altFt} ft moves the drawn position when the camera is tilted (dx=${alt.dx?.toFixed(1)} dy=${alt.dy?.toFixed(1)})`)
    .toBeGreaterThan(1);

  /* ── ④ attribution ─────────────────────────────────────────────────────────────────────────── */
  const st = await page.evaluate(() => window.IntMapAviation.stats());
  /* ⚠ ODbL 1.0 REQUIRES THE SOURCE TO BE NAMED. The line used to be the literal
     "airplanes.live · ADS-B", printed under invented aircraft while that provider refused every
     request — naming the wrong source is worse than naming none. */
  expect(st.provider, '④ the layer knows which provider answered').toBeTruthy();
  expect(st.attribution, '④ and carries the attribution its licence requires').toBeTruthy();
  expect(st.attribution.length).toBeGreaterThan(3);
  expect(st.attribution, '④ it is not still claiming the dead provider').not.toMatch(/airplanes\.live/);

  page.off('request', onReq);
});
