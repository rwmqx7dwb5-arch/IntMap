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
import { test, expect } from './helpers/app.js';

const BOOT = { timeout: 90_000 };
/* ⚠ (#R209/#R311) THE LAYER IS FETCHED ON DEMAND, so waiting for window.IntMapSatellites as a BOOT
   signal would wait for something that only the row's own switch brings. The tests below reach for
   the global directly (state(), list(), snapshot()) before and after they tick the row, so this asks
   the loader for it exactly as `startSats()` does — the same call, one step earlier. */
/* (suite-time-room) THE BOOT IS THE WORKER'S, NOT EACH TEST'S. Seven tests booted seven pages to ask
   seven questions; they now share the worker's page (tests/helpers/app.js), booted on the same
   `/?rafshim=1` (the `appUrl` option below), and each makes the same on-demand call the boot made
   before it reads the layer. ② takes a fresh page: it switches the catalogue to `geo`, and the layer keeps
   ONE group's elements at a time — on a shared page every later test would be asking the ISS questions
   of the geostationary catalogue. ⑦ takes one too: it asks Atlas to turn the layer ON, which a page
   where ④/⑤ already turned it on cannot show (measured: red on the shared page). ⑤'s observer is the map centre, which is
   why this file resets to the BOOT's view (appView 'boot') — the clock-dependent centre ⑤ was written
   against — rather than to the named Tokyo view. */
test.use({ appUrl: '/?rafshim=1', appView: 'boot' });   /* reset to the boot's own view, which these were written against */
const ready = async (page) => {
  await page.waitForFunction(() => !!window.__imap && !!window.IntMapLazy, null, BOOT);
  await page.evaluate(() => window.IntMapLazy.need('satellitesLive'));
  await page.waitForFunction(() => !!window.IntMapSatellites, null, BOOT);
  await page.waitForFunction(() => window.IntMapGeoEngine.canDraw(), null, BOOT);
};
/* CelesTrak is keyless, unmetered and free, and it is entitled to stop answering a runner that has
   asked seven times in five minutes — which is exactly what a full-suite run does, and what turned
   every assertion below into "0 objects" once. The layer caches the catalogue for the same two hours
   it refreshes on, so in practice one fetch serves the whole run; when even that fails there is
   nothing real to assert about, and saying so is honest where a green tick would not be.

   The guard RACES A CLOCK, and that is not belt-and-braces. The first version of it simply awaited
   snapshot(), which awaits the fetch — so when CelesTrak accepted the connection and then stopped
   talking (what a rate-limited server does instead of refusing), the guard hung with it and every
   job died on Playwright's own 60 s timeout instead of skipping. A check that cannot answer when
   the thing it is checking is unresponsive is not a check. The layer now aborts its own fetch too;
   this is the belt for that braces. */
const feed = async (page) => page.evaluate(async () => {
  const A = window.IntMapSatellites;
  const fx = await Promise.race([
    A.snapshot(),
    new Promise((r) => setTimeout(() => r(null), 30000)),
  ]);
  /* a catalogue the layer already HOLDS (the shipped floor, painted before the live feed answers) is a
     catalogue: the clock bounds the wait for the live rungs, not whether there is anything to test */
  return { n: fx ? fx.length : A.state().catalogue, err: A.state().err || (fx ? null : 'the catalogue request did not settle') };
});
const needFeed = async (page) => { const f = await feed(page);
  test.skip(f.n === 0, 'the CelesTrak catalogue is unreachable from this runner: ' + (f.err || 'no records')); };

/* …AND THE GUARD HAS TO BE ABOUT THE CATALOGUE THE TEST ACTUALLY ASSERTS ON. needFeed() loads the
   DEFAULT group, and that group is `active` — the one group with a same-origin bundled floor
   (data/tle/catalogue.tle; js/satellites-live.js gates it on `want==='active'`), so it succeeds very
   nearly unconditionally. A test that then calls setGroup() is measuring a DIFFERENT request:
   `geo` has no such floor, its only sources are CelesTrak and two public proxies, the element cache
   holds exactly one group at a time, and this config gives every test a fresh context — so that
   catalogue is never cached and is always a live fetch. A rate-limited runner therefore walked
   straight through needFeed and asserted against nought objects, which is how #R187 saw ② fail
   twice locally after repeated suite runs while CI passed on the identical commit.

   Same clock race as feed(), for the reason written above it: `geo` can spend the layer's 12 s
   timeout on each of three hosts in turn, and a test's whole budget is 60 s. */
const needFeedFor = async (page, group) => {
  const f = await page.evaluate(async (g) => {
    const A = window.IntMapSatellites;
    A.setGroup(g);
    const fx = await Promise.race([
      A.snapshot(),
      new Promise((r) => setTimeout(() => r(null), 30000)),
    ]);
    /* a catalogue the layer already HOLDS (the shipped floor, painted before the live feed answers) is a
     catalogue: the clock bounds the wait for the live rungs, not whether there is anything to test */
    return { n: fx ? fx.length : A.state().catalogue, err: A.state().err || (fx ? null : 'the catalogue request did not settle') };
  }, group);
  test.skip(f.n === 0, 'the CelesTrak "' + group + '" catalogue is unreachable from this runner: ' + (f.err || 'no records'));
};

/* …AND WHEN THE TEST ASSERTS ON ONE OBJECT, THE GUARD IS ABOUT THAT OBJECT. ①, ⑤ and ⑦ ask questions
   of THE ISS, and needFeed() only proves that SOME catalogue answered. Measured (nightly 2026-11-01,
   -11-07, -11-11, -11-14, and reproduced locally with every non-local host refused): when CelesTrak
   and the relay do not answer, the layer is left on the shipped snapshot (data/tle/catalogue.tle),
   and once that snapshot is older than the LEO element span (js/layers/dl-sats.js `time.bands`) the
   layer — correctly — no longer propagates any LEO set: 15,722 of 15,922 outside their span, 200
   MEO/GEO objects left, the first of them `LCS 1`. needFeed saw 200 > 0 and let ① fail with
   "the ISS is not in the group", ⑤ substitute `list()[0]` and assert ISS facts about LCS 1 (its title,
   and a slant range only an orbit 2,800 km up can have), and ⑦ spend 69 s (measured) letting Atlas
   look for the ISS in every smaller catalogue — past the test's 60 s.
   So: the ISS is found by its NORAD catalogue number, which is its identity in every TLE feed whatever
   the feed names it — never by spelling, and never replaced by another object. When it is absent the
   guard separates the three cases instead of reporting one of them as another:
     · the catalogue is LIVE and has no 25544 → the feed changed shape: FAIL;
     · the catalogue is the SHIPPED one and it does not hold the ISS even at the instant it was built
       (its own newest epoch) → the bundle is wrong: FAIL;
     · the catalogue is the shipped one, it holds the ISS at its build instant, and its ISS element
       set does not speak for NOW → the test is run AT THAT INSTANT: the app's clock (Chronos, which
       is the instant the layer propagates for — js/satellites-live.js clockNow) is set to the bundle's
       own newestEpoch, every assertion runs against real elements at an instant they speak for, and
       the clock goes back to live in a finally so the later tests on the shared page see the wall
       clock again. Not a skip: a skip would hide these tests on exactly the nights the live feed is
       down, which are the nights the shipped catalogue is all the reader has. (How old the shipped
       catalogue is, is the bundle refresh's business, not this file's.)
   It waits for the load to SETTLE first: the shipped catalogue is painted before the live feed
   answers (js/satellites-live.js load()), so a guard that read the catalogue mid-load would judge the
   floor instead of what the layer ends with. The load settles on its own deadlines (fetch-deadline.js);
   the test's timeout is the only other bound. */
const ISS_NORAD = 25544;
const needIss = async (page) => {
  const g = await page.evaluate(async (id) => {
    const A = window.IntMapSatellites;
    await A.snapshot();
    while (A.state().loading) await new Promise((r) => setTimeout(r, 250));
    const now = await A.snapshot();
    if (now.some((f) => f.id === id)) return { now: true };
    const s = A.state();
    if (!s.bundled) return { now: false, bundled: false, err: s.err };
    const at = s.bundledEpoch ? await A.snapshot(new Date(s.bundledEpoch)) : [];
    return { now: false, bundled: true, epoch: s.bundledEpoch, atBuild: at.some((f) => f.id === id),
             outside: s.outsideSpan, err: s.err };
  }, ISS_NORAD);
  const live = async () => { await page.evaluate(() => window.IntMapTime.setNow({ source: 'test' })); };
  if (g.now) return live;   /* nothing was moved; restoring to live is what the page already shows */
  expect(g.bundled, 'the LIVE catalogue has no NORAD ' + ISS_NORAD + ' (the ISS) — the feed changed shape').toBe(true);
  expect(g.atBuild, 'the shipped catalogue (newest epoch ' + g.epoch + ') does not hold the ISS even at the instant it was built').toBe(true);
  test.info().annotations.push({ type: 'instant', description: 'live feed unreachable (' + g.err + '); '
    + g.outside + ' shipped element sets outside their span at the wall clock, so this test runs at the newestEpoch of the shipped catalogue ' + g.epoch });
  await page.evaluate((iso) => window.IntMapTime.set(new Date(iso), { source: 'test' }), g.epoch);
  return live;
};

/* ── ① THE PROPAGATOR IS RIGHT, MEASURED AGAINST THE REAL WORLD ───────────────────────────── */
test('R184 ①: SGP4 reproduces the real ISS orbit, and the Sun/shadow pair actually answers', async ({ app }) => {
  const page = app.page;   /* the worker's booted page (tests/helpers/app.js) — reset to the view its boot showed before this test */
  await ready(page);
  await needFeed(page);
  const restoreClock = await needIss(page);
  try {
    const r = await page.evaluate(async (id) => {
      const A = window.IntMapSatellites;
      const fx = await A.snapshot();
      const iss = fx.find((f) => f.id === id);
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
    }, ISS_NORAD);
    expect(r.n, 'the catalogue holds more than a handful of objects').toBeGreaterThan(80);
    expect(r.iss, 'needIss() established that NORAD 25544 is propagated at this instant (the wall clock, or the epoch of the shipped catalogue)').toBeTruthy();
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
  } finally { await restoreClock(); }
});

/* ── ② THE DEEP-SPACE BRANCH IS REALLY THERE ──────────────────────────────────────────────── */
test('R184 ②: geostationary objects come back from SDP4, at the right altitude', async ({ app }) => {
  const page = await app.freshPage();   /* it switches the catalogue group, which would follow every later test on a shared page */
  await ready(page);
  /* `geo`, not the default group — this is the only test here that asks for a second catalogue, and
     guarding the first one told us nothing about this one. It also replaces the setGroup() this test
     used to do itself: switching group DISCARDS the loaded elements, so a needFeed() before it was
     verifying a catalogue the very next line threw away. */
  await needFeedFor(page, 'geo');
  const r = await page.evaluate(async () => {
    const A = window.IntMapSatellites;
    /* the guard above already loaded these, so this is propagation only — no second request */
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
test('R184 ③: the footprint is acos(Re/(Re+h)) and the ground track is one orbit', async ({ app }) => {
  const page = app.page;   /* the worker's booted page (tests/helpers/app.js) — reset to the view its boot showed before this test */
  await ready(page);
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
test('R184 ④: the checkbox draws the layer, fills the legend and cleans up again', async ({ app }) => {
  const page = app.page;   /* the worker's booted page (tests/helpers/app.js) — reset to the view its boot showed before this test */
  await ready(page);
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
  expect(on.layers.every((l) => l.has), 'every layer exists: the orbit-band halo, icons, labels, track, footprint fill + outline').toBe(true);
  expect(on.layers.every((l) => l.vis)).toBe(true);
  expect(on.legendShown).toBe(true);
  /* (#R185) the default catalogue is every active satellite now — 「実際の位置に全衛星が」 — so what
     this pins is that the legend's selector AGREES with the layer, not which group that happens to be. */
  expect(on.legendGroup).toBe(on.state.group);
  expect(on.state.group).toBe('active');
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
test('R184 ⑤: selecting an object draws its track + footprint and opens a card of real numbers', async ({ app }) => {
  const page = app.page;   /* the worker's booted page (tests/helpers/app.js) — reset to the view its boot showed before this test */
  await ready(page);
  await needFeed(page);
  const restoreClock = await needIss(page);
  try {
    const r = await page.evaluate(async (id) => {
      const cb = document.getElementById('dl-sats');
      cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true }));
      const t0 = Date.now();
      /* wait for the layer to be ON, not merely for drawn > 0: ④ turned it off on this shared page and
         stop() keeps the last fixes, which were computed for the instant of THEIR paint — a clock moved
         while the layer was off (needIss) is not in them until start() paints again (measured: get(25544)
         null 3/3 with the old condition, because drawn was already > 0 from ④'s fixes) */
      while (Date.now() - t0 < 25000 && !(window.IntMapSatellites.state().on && window.IntMapSatellites.state().drawn > 0)) await new Promise((r) => setTimeout(r, 250));
      const A = window.IntMapSatellites;
      /* THE ISS, by its NORAD number — never "whatever is first" (see needIss: that substitution is how
         LCS 1 was asserted to be the ISS on three nights) */
      const iss = A.get(id);
      if (!iss) return { missing: true };
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
        pass: (() => { const p = A.nextPass(iss.id, window.IntMapTime.when(), 24); return p && { none: !!p.none, maxEl: p.maxEl, hasRise: p.riseMs != null || p.inProgress }; })(),
        look: (() => { const l = A.lookFrom(A.observer(), iss); return l && { el: l.elDeg, az: l.azDeg, range: l.rangeKm, dop: l.doppler }; })(),
        /* the two lengths the slant range is bounded by: the satellite's geocentric distance (straight off
           the position SGP4 returned) and the observer's — a point on the WGS-84 ellipsoid at its geodetic
           latitude, height 0, which is what observer() hands ecfToLookAngles */
        rSat: Math.hypot(iss.eci.x, iss.eci.y, iss.eci.z),
        rObs: (() => { const a = 6378.137, b = 6356.7523142, p = A.observer().latitude, c = Math.cos(p), s = Math.sin(p);
          return Math.sqrt(((a * a * c) ** 2 + (b * b * s) ** 2) / ((a * c) ** 2 + (b * s) ** 2)); })() };
    }, ISS_NORAD);
    expect(r.missing, 'the layer drew the catalogue needIss() found the ISS in, so get(25544) answers').toBeUndefined();
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
    /* look angles: elevation is a real angle, azimuth is a compass bearing. The range is the distance
       between two points whose distances from the Earth's centre are rSat and rObs, so by the triangle
       inequality it lies in [rSat − rObs, rSat + rObs] — the low end is the satellite straight overhead,
       the high end the satellite on the far side of the Earth. Nothing here filters to "above the
       horizon", so the far side is a real answer: measured 13,156 km for the ISS (rSat + rObs ≈ 13,170)
       on 2026-11-14, against a hand-written ceiling of 13,000 that no geometry produced. */
    expect(r.look.el).toBeGreaterThanOrEqual(-90);
    expect(r.look.el).toBeLessThanOrEqual(90);
    expect(r.look.az).toBeGreaterThanOrEqual(0);
    expect(r.look.az).toBeLessThan(360);
    expect(r.look.range, 'no closer than the satellite is above the observer').toBeGreaterThanOrEqual(r.rSat - r.rObs);
    expect(r.look.range, 'no farther than the far side of the Earth').toBeLessThanOrEqual(r.rSat + r.rObs);
    expect(Math.abs(r.look.dop - 1), 'a LEO Doppler factor is 1 ± ~2.6e-5').toBeLessThan(1e-4);
    /* the ISS covers 51.6° of latitude, so from anywhere in that band it passes within 24 h; the
       assertion is only that the search TERMINATES with a coherent answer either way */
    expect(r.pass).toBeTruthy();
    if (!r.pass.none) { expect(r.pass.hasRise).toBe(true); expect(r.pass.maxEl).toBeGreaterThan(0); }
  } finally { await restoreClock(); }
});

/* ── ⑥ THERE IS NO WHOLE-LAYER HORIZON FILTER ANY MORE — AND THE GEOMETRY IS STILL THERE ─────
   ⚠ (#R266) #R184 shipped a "only visible from here" checkbox and this test proved its geometry.
   The checkbox was removed BY INSTRUCTION («ここから見えるものだけ、チェックはいらない»), so the
   assertion is INVERTED rather than deleted: nothing may narrow the layer behind the count line
   (`drawn` === `computed`), no `setVisibleOnly` may come back, and the per-satellite look angle —
   which the detail card and `nextPass` are built on — must still answer. */
test('R266 ⑥: everything propagated is drawn, and the look-angle geometry survives', async ({ app }) => {
  const page = app.page;   /* the worker's booted page (tests/helpers/app.js) — reset to the view its boot showed before this test */
  await ready(page);
  await needFeed(page);
  const r = await page.evaluate(async () => {
    const A = window.IntMapSatellites;
    await A.snapshot();
    const cb = document.getElementById('dl-sats');
    cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true }));
    const t0 = Date.now();
    while (Date.now() - t0 < 25000 && A.state().drawn === 0) await new Promise((r) => setTimeout(r, 250));
    const st = A.state();
    const obs = A.observer();
    const above = A.list().filter((f) => { const l = A.lookFrom(obs, f); return l && l.elDeg > 0; }).length;
    return {
      drawn: st.drawn, computed: st.computed, listed: A.list().length, shown: A.shown().length,
      hasSetter: typeof A.setVisibleOnly, hasGetter: typeof A.visibleOnly,
      inState: Object.prototype.hasOwnProperty.call(st, 'visibleOnly'),
      above, hasBox: !!document.querySelector('.gl-satvis'),
    };
  });
  expect(r.drawn).toBeGreaterThan(50);
  expect(r.drawn, 'nothing is filtered out behind the count line').toBe(r.computed);
  expect(r.shown, '`shown()` is the whole computed list').toBe(r.listed);
  expect(r.hasSetter, 'the filter API is gone, not merely unwired').toBe('undefined');
  expect(r.hasGetter).toBe('undefined');
  expect(r.inState, 'state() no longer reports a filter that does not exist').toBe(false);
  expect(r.hasBox, 'the checkbox is gone from the legend').toBe(false);
  expect(r.above, 'the horizon geometry still answers per satellite').toBeGreaterThan(0);
  expect(r.above, '…and it is a strict subset — a whole catalogue is never all above one horizon').toBeLessThan(r.listed);
});

/* ── ⑦ ATLAS DRIVES IT, AND SAYS ONLY WHAT THE LAYER ACTUALLY HAS ─────────────────────────── */
test('R184 ⑦: the Atlas satellites action turns the layer on and reports real numbers', async ({ app }) => {
  const page = await app.freshPage();   /* the Atlas action turns the layer ON, so it needs a page where nothing has turned it on yet */
  await ready(page);
  await needFeed(page);
  const restoreClock = await needIss(page);   /* it names the ISS — see needIss for what happened when the ISS could not be there */
  try {
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
  } finally { await restoreClock(); }
});
