// (#R184) THE LIVE SATELLITE LAYER, IN A REAL BROWSER.
//
// 「Live aircraft trafficの要領で、人工衛星版もフルクオリティで作って。」
//
// The point of these is that a satellite layer is unusually easy to fake — a plausible dot moving
// plausibly is indistinguishable from a correct one by eye — so nothing here asserts "a dot
// appeared". Every check is against a number that is verifiable from outside this program:
//
//   · the ISS is at ~420 km, ~7.66 km/s, a 92.96-minute period and 51.6° of inclination;
//   · its footprint is a ~2,200 km radius circle, which is acos(Re/(Re+h)) and nothing else;
//   · a satellite is sunlit or eclipsed roughly 60/40 around a LEO orbit, and NEVER "unknown" —
//     the groundwork this file replaced called shadowFraction() with a Date instead of the Sun's
//     position, got NaN, and reported every object's illumination as null in perfect silence;
//   · a deep-space object (period > 225 min) must come back from the SDP4 branch, because the
//     near-earth branch alone would place every GEO satellite somewhere plausible and wrong.
//
// The layer is then switched on THROUGH ITS CHECKBOX, because that is the path a user takes and it
// is the path that has to keep the legend, the counts and the renderer in step.
import { test, expect } from '@playwright/test';

const BOOT = { timeout: 90_000 };
const boot = async (page) => {
  await page.goto('/?rafshim=1');
  await page.waitForFunction(() => !!window.__imap && !!window.IntMapSatellites, null, BOOT);
  await page.waitForFunction(() => window.IntMapGeoEngine.canDraw(), null, BOOT);
};
/* CelesTrak is keyless, unmetered and free, and it is entitled to stop answering a runner that has
   asked seven times in five minutes — which is exactly what a full-suite run does, and what turned
   every assertion below into "0 objects" once. The layer caches the catalogue for the same two hours
   it refreshes on, so in practice one fetch serves the whole run; when even that fails there is
   nothing real to assert about, and saying so is honest where a green tick would not be. */
const feed = async (page) => page.evaluate(async () => {
  const A = window.IntMapSatellites;
  const fx = await A.snapshot();
  return { n: fx.length, err: A.state().err };
});
const needFeed = async (page) => { const f = await feed(page);
  test.skip(f.n === 0, 'the CelesTrak catalogue is unreachable from this runner: ' + (f.err || 'no records')); };

/* ── ① THE PROPAGATOR IS RIGHT, MEASURED AGAINST THE REAL WORLD ───────────────────────────── */
test('R184 ①: SGP4 reproduces the real ISS orbit, and the Sun/shadow pair actually answers', async ({ page }) => {
  await boot(page);
  await needFeed(page);
  const r = await page.evaluate(async () => {
    const A = window.IntMapSatellites;
    const fx = await A.snapshot();
    const iss = fx.find((f) => /ZARYA/.test(f.name || ''));
    return {
      n: fx.length,
      iss: iss && { alt: iss.altKm, vel: iss.velKmS, period: iss.periodMin, incl: iss.inclDeg,
                    sunlit: iss.sunlit, deep: iss.deep, ageH: A.elementAgeH(iss) },
      unknownSunlit: fx.filter((f) => f.sunlit == null).length,
      sunlit: fx.filter((f) => f.sunlit === true).length,
      eclipsed: fx.filter((f) => f.sunlit === false).length,
      offEarth: fx.filter((f) => !isFinite(f.lat) || !isFinite(f.lng) || Math.abs(f.lat) > 90 || Math.abs(f.lng) > 180).length,
      atNull: fx.filter((f) => f.lat === 0 && f.lng === 0).length,
    };
  });
  expect(r.n, 'the visual catalogue is ~150-250 objects').toBeGreaterThan(80);
  expect(r.iss, 'the ISS is in the "visual" group — if it is not, the feed changed shape').toBeTruthy();
  /* the real figures. Altitude drifts with reboosts and drag, so the band is generous; the period
     and inclination are orbital constants and are pinned tightly. */
  expect(r.iss.alt).toBeGreaterThan(370);
  expect(r.iss.alt).toBeLessThan(470);
  expect(r.iss.vel).toBeGreaterThan(7.5);
  expect(r.iss.vel).toBeLessThan(7.8);
  expect(Math.abs(r.iss.period - 92.9), 'ISS orbital period is 92.9 min').toBeLessThan(1.0);
  expect(Math.abs(r.iss.incl - 51.64), 'ISS inclination is 51.64°').toBeLessThan(0.3);
  expect(r.iss.deep, 'the ISS is a NEAR-EARTH case (SGP4, not SDP4)').toBe(false);
  expect(r.iss.ageH, 'CelesTrak publishes fresh elements; anything older than a week is a stale feed').toBeLessThan(24 * 7);
  /* THE DEFECT THIS FILE EXISTS TO PIN: shadowFraction() takes the SUN, not the time. Handed a
     Date it returns NaN and every illumination silently becomes null. */
  expect(r.unknownSunlit, 'illumination must be computed for every object, never null').toBe(0);
  expect(r.sunlit).toBeGreaterThan(0);
  expect(r.eclipsed, 'at any instant part of the catalogue is in the Earth\'s shadow').toBeGreaterThan(0);
  /* a record that cannot be propagated is dropped, never drawn at 0,0 */
  expect(r.offEarth).toBe(0);
  expect(r.atNull).toBe(0);
});

/* ── ② THE DEEP-SPACE BRANCH IS REALLY THERE ──────────────────────────────────────────────── */
test('R184 ②: geostationary objects come back from SDP4, at the right altitude', async ({ page }) => {
  await boot(page);
  await needFeed(page);
  const r = await page.evaluate(async () => {
    const A = window.IntMapSatellites;
    A.setGroup('geo');
    const fx = await A.snapshot();
    const deep = fx.filter((f) => f.deep);
    const alts = fx.map((f) => f.altKm).sort((a, b) => a - b);
    const mid = alts[Math.floor(alts.length / 2)];
    return { n: fx.length, deep: deep.length, medianAlt: mid,
             maxLat: Math.max(...fx.map((f) => Math.abs(f.lat))),
             medianPeriod: fx.map((f) => f.periodMin).sort((a, b) => a - b)[Math.floor(fx.length / 2)] };
  });
  expect(r.n).toBeGreaterThan(100);
  expect(r.deep, 'every GEO object must take the SDP4 (deep-space) branch').toBe(r.n);
  /* geostationary altitude is 35,786 km — a near-earth-only propagator would not put them there */
  expect(Math.abs(r.medianAlt - 35786)).toBeLessThan(400);
  expect(Math.abs(r.medianPeriod - 1436), 'one sidereal day = 1436 min').toBeLessThan(6);
});

/* ── ③ FOOTPRINT AND GROUND TRACK ARE GEOMETRY, NOT DECORATION ────────────────────────────── */
test('R184 ③: the footprint is acos(Re/(Re+h)) and the ground track is one orbit', async ({ page }) => {
  await boot(page);
  await needFeed(page);
  const r = await page.evaluate(async () => {
    const A = window.IntMapSatellites;
    const fx = await A.snapshot();
    const iss = fx.find((f) => /ZARYA/.test(f.name || '')) || fx[0];
    const ring = A.footprintRing(iss.lng, iss.lat, iss.altKm, 64);
    const R = 6371, d = Math.PI / 180;
    const gc = (p) => { const dLat = (p[1] - iss.lat) * d, dLng = (p[0] - iss.lng) * d;
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(iss.lat * d) * Math.cos(p[1] * d) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.min(1, Math.sqrt(h))); };
    const radii = ring.map(gc);
    const segs = A.groundTrack(iss.id);
    return { closed: ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1],
      meanR: radii.reduce((a, b) => a + b, 0) / radii.length,
      spreadR: Math.max(...radii) - Math.min(...radii),
      altKm: iss.altKm, segs: segs.length, pts: segs.reduce((a, s) => a + s.length, 0),
      anySegCrossesDateline: segs.some((s) => s.some((p, i) => i && Math.abs(p[0] - s[i - 1][0]) > 180)) };
  });
  expect(r.closed, 'the footprint ring must close').toBe(true);
  /* the closed-form answer for this altitude, computed independently of the implementation */
  const expected = 6371 * Math.acos(6378.137 / (6378.137 + r.altKm));
  expect(Math.abs(r.meanR - expected), 'footprint radius = Re·acos(Re/(Re+h))').toBeLessThan(30);
  expect(r.spreadR, 'a great-circle ring has a constant radius').toBeLessThan(5);
  expect(r.pts, 'one orbit either side of now, sampled ~361 times').toBeGreaterThan(300);
  expect(r.anySegCrossesDateline, 'the track is split at the antimeridian, never drawn across the map').toBe(false);
});

/* ── ④ THE LAYER, THROUGH ITS CHECKBOX ────────────────────────────────────────────────────── */
test('R184 ④: the checkbox draws the layer, fills the legend and cleans up again', async ({ page }) => {
  await boot(page);
  await needFeed(page);
  const on = await page.evaluate(async () => {
    const cb = document.getElementById('dl-sats');
    cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true }));
    const t0 = Date.now();
    while (Date.now() - t0 < 25000) {
      const s = window.IntMapSatellites.state();
      const c = document.querySelector('#data-legend-sats .gl-satcount');
      /* wait for the legend to have caught up too — it refreshes at the layer's own 1 Hz, so
         "drawn > 0" can be true up to a second before the count box says so */
      if (s.on && s.drawn > 0 && s.layerVisible && c && /[1-9]\d*\s*\/\s*\d+/.test(c.textContent)) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    const A = window.IntMapSatellites, E = window.IntMapGeoEngine;
    const lg = document.getElementById('data-legend-sats');
    return { state: A.state(),
      layers: A._layers().map((id) => ({ id, has: E.layers.has(id), vis: E.layers.has(id) && E.layers.isVisible(id) })),
      legendShown: !!lg && lg.style.display === 'block',
      legendTitle: lg && lg.querySelector('h4') && lg.querySelector('h4').textContent,
      legendGroup: lg && lg.querySelector('.gl-satgrp') && lg.querySelector('.gl-satgrp').value,
      legendCount: lg && lg.querySelector('.gl-satcount') && lg.querySelector('.gl-satcount').textContent,
      legendOpacity: !!(lg && lg.querySelector('.dl-op-row')) };
  });
  expect(on.state.on).toBe(true);
  expect(on.state.drawn).toBeGreaterThan(50);
  expect(on.layers.every((l) => l.has), 'all five layers exist: icons, labels, track, footprint fill + outline').toBe(true);
  expect(on.layers.every((l) => l.vis)).toBe(true);
  expect(on.legendShown).toBe(true);
  expect(on.legendGroup).toBe('visual');
  expect(on.legendCount, 'the legend reports drawn / catalogue, not a guess').toMatch(/\d+\s*\/\s*\d+/);
  expect(on.legendOpacity, 'every legend owns its opacity row (#R15c)').toBe(true);

  const off = await page.evaluate(async () => {
    const cb = document.getElementById('dl-sats');
    cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 800));
    const A = window.IntMapSatellites, E = window.IntMapGeoEngine;
    return { on: A.isOn(),
      anyVisible: A._layers().some((id) => E.layers.has(id) && E.layers.isVisible(id)),
      legendHidden: (document.getElementById('data-legend-sats') || {}).style?.display === 'none' };
  });
  expect(off.on).toBe(false);
  expect(off.anyVisible, 'turning the layer off leaves nothing painted').toBe(false);
  expect(off.legendHidden).toBe(true);
});

/* ── ⑤ SELECTION, THE DETAIL CARD, AND WHAT IT CLAIMS ─────────────────────────────────────── */
test('R184 ⑤: selecting an object draws its track + footprint and opens a card of real numbers', async ({ page }) => {
  await boot(page);
  await needFeed(page);
  const r = await page.evaluate(async () => {
    const cb = document.getElementById('dl-sats');
    cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true }));
    const t0 = Date.now();
    while (Date.now() - t0 < 25000 && window.IntMapSatellites.state().drawn === 0) await new Promise((r) => setTimeout(r, 250));
    const A = window.IntMapSatellites;
    const iss = A.list().find((f) => /ZARYA/.test(f.name || '')) || A.list()[0];
    A.select(iss.id);
    window.IntMapSatPanel.open(iss.id);
    await new Promise((r) => setTimeout(r, 400));
    const card = document.getElementById('sat-popup');
    const body = card.querySelector('#satp-body').textContent;
    return { selected: A.selected() === iss.id,
      cardShown: card.style.display === 'block',
      title: card.querySelector('#satp-title').textContent,
      rows: card.querySelectorAll('.acp-row').length,
      secs: card.querySelectorAll('.acp-sec').length,
      hasAltitude: /\d{2,3}\s*km/.test(body),
      hasPeriod: /9\d\.\d\d/.test(body),
      /* the card must NEVER print an em-dash where a number belongs — that was the shape of the
         #R183 widget defect ("永久に —"), and it is the one failure mode a live card can hide */
      emptyRows: [...card.querySelectorAll('.acp-v')].filter((v) => v.textContent.trim() === '—').length,
      /* by name, through the API Atlas uses */
      findById: !!A.find(String(iss.id)), findByName: !!A.find(iss.name),
      pass: (() => { const p = A.nextPass(iss.id, new Date(), 24); return p && { none: !!p.none, maxEl: p.maxEl, hasRise: p.riseMs != null || p.inProgress }; })(),
      look: (() => { const l = A.lookFrom(A.observer(), iss); return l && { el: l.elDeg, az: l.azDeg, range: l.rangeKm, dop: l.doppler }; })() };
  });
  expect(r.selected).toBe(true);
  expect(r.cardShown).toBe(true);
  expect(r.title).toContain('ISS');
  expect(r.rows, 'the card is the aircraft card\'s depth, not a tooltip').toBeGreaterThan(18);
  expect(r.secs).toBeGreaterThanOrEqual(6);
  expect(r.hasAltitude).toBe(true);
  expect(r.hasPeriod).toBe(true);
  expect(r.emptyRows, 'a row with no value is omitted, never printed as an em-dash').toBe(0);
  expect(r.findById).toBe(true);
  expect(r.findByName).toBe(true);
  /* look angles: elevation is a real angle, azimuth is a compass bearing, range is at least the
     altitude (straight overhead) and at most the horizon distance for that altitude */
  expect(r.look.el).toBeGreaterThanOrEqual(-90);
  expect(r.look.el).toBeLessThanOrEqual(90);
  expect(r.look.az).toBeGreaterThanOrEqual(0);
  expect(r.look.az).toBeLessThan(360);
  expect(r.look.range).toBeGreaterThan(300);
  expect(r.look.range).toBeLessThan(13000);
  expect(Math.abs(r.look.dop - 1), 'a LEO Doppler factor is 1 ± ~2.6e-5').toBeLessThan(1e-4);
  /* the ISS covers 51.6° of latitude, so from anywhere in that band it passes within 24 h; the
     assertion is only that the search TERMINATES with a coherent answer either way */
  expect(r.pass).toBeTruthy();
  if (!r.pass.none) { expect(r.pass.hasRise).toBe(true); expect(r.pass.maxEl).toBeGreaterThan(0); }
});

/* ── ⑥ THE "VISIBLE FROM HERE" FILTER IS LOOK-ANGLE GEOMETRY, NOT PROXIMITY ───────────────── */
test('R184 ⑥: the horizon filter keeps exactly the objects with a positive elevation angle', async ({ page }) => {
  await boot(page);
  await needFeed(page);
  const r = await page.evaluate(async () => {
    const A = window.IntMapSatellites;
    await A.snapshot();
    const cb = document.getElementById('dl-sats');
    cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true }));
    const t0 = Date.now();
    while (Date.now() - t0 < 25000 && A.state().drawn === 0) await new Promise((r) => setTimeout(r, 250));
    const all = A.state().drawn;
    A.setVisibleOnly(true);
    const filtered = A.shown();
    const obs = A.observer();
    const badlyKept = filtered.filter((f) => { const l = A.lookFrom(obs, f); return !(l && l.elDeg > 0); }).length;
    const wronglyDropped = A.list().filter((f) => { const l = A.lookFrom(obs, f); return l && l.elDeg > 0; }).length - filtered.length;
    A.setVisibleOnly(false);
    return { all, filtered: filtered.length, badlyKept, wronglyDropped, restored: A.shown().length };
  });
  expect(r.all).toBeGreaterThan(50);
  expect(r.filtered, 'only part of the catalogue is above any one horizon').toBeLessThan(r.all);
  expect(r.badlyKept, 'nothing below the horizon survives the filter').toBe(0);
  expect(r.wronglyDropped, 'nothing above the horizon is dropped').toBe(0);
  expect(r.restored).toBe(r.all);
});

/* ── ⑦ ATLAS DRIVES IT, AND SAYS ONLY WHAT THE LAYER ACTUALLY HAS ─────────────────────────── */
test('R184 ⑦: the Atlas satellites action turns the layer on and reports real numbers', async ({ page }) => {
  await boot(page);
  await needFeed(page);
  const r = await page.evaluate(async () => {
    const res = await window.IntMapConsole.dispatch({ type: 'satellites', name: 'ISS' });
    const A = window.IntMapSatellites;
    return { ok: !!(res && res.ok), html: String((res && res.html) || ''),
      on: A.isOn(), selected: A.selected(), cardOpen: window.IntMapSatPanel.isOpen(),
      checkbox: document.getElementById('dl-sats').checked };
  });
  expect(r.ok).toBe(true);
  expect(r.on).toBe(true);
  expect(r.checkbox, 'the Atlas path and the panel path must agree about the layer being on').toBe(true);
  expect(r.selected).not.toBeNull();
  expect(r.cardOpen).toBe(true);
  expect(r.html).toMatch(/ISS/);
  expect(r.html, 'the reply carries the real altitude it just computed').toMatch(/\d{3}\s*km/);
});
