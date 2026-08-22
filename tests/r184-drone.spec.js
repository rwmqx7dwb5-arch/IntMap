// (#R184) THE TEN DRONE-OPERATION CAPABILITIES, IN A REAL BROWSER.
//
// 「風向・風速を反映 / 帰還分の電池を含める / 通信可能範囲を考慮 / 視通が切れる区間を警告 /
//   飛行禁止区域を回避 / 地形に沿って高度を自動調整 / 最短、最省電力、最安全の経路を比較 /
//   緊急着陸可能地点を表示 / 離陸地点へ自動帰還する経路を生成 / 複数機の経路干渉を確認」
//
// #R174 built the planner with two seams and filled neither. What has to be pinned here is not that
// the seams exist — they were already tested — but that what is now plugged into them CHANGES THE
// ANSWER. A wind field that is fetched and then not applied, a link check that never reports a break,
// a "no-fly" test that compares against a centroid with no extent: all three look identical to a
// working feature from outside, and the last one really did happen (Overpass `out center` carries no
// bounds, so every zero-buffer polygon degenerated to "within 0 m of a point").
//
// The route used is over the Bernese Alps, deliberately: 2,000 m of terrain between a launch point
// and a destination 14 km away is a case where the right answers are known in advance — the radio
// cannot get through a mountain, and a 77 Wh battery cannot fly there and back.
import { test, expect, bootPage } from './helpers/app.js';

const BOOT = { timeout: 90_000 };
/* ⚠ (#R208) THE APPLICATION IS BOOTED ONCE PER WORKER, NOT ONCE PER TEST. Every test in this file
   used to start the whole app to ask one question of it. Measured, that boot is 2.4 s on the
   development machine and 9.2 s on a CI runner with no GPU (#R186), and across the 30 files doing
   this it came to about 185 boots for 185 questions — 91 % of the suite's measured time sat in
   them. tests/helpers/app.js carries the measurements, says what sharing a page costs, and names
   the specs that must NOT do it (the ones whose subject is start-up itself).
   `app.reset()` runs before every test and restores the app's named start-up view; a test that
   needs a genuinely untouched application asks for `app.freshPage()` and pays for its own boot.
   ⚠ `boot` is kept below for any test in this file that still takes its own page — it is the same
   wait, so a test that has not been converted behaves exactly as it did rather than failing on a
   name that no longer exists. */
const boot = async page => { await bootPage(page); };
/* Interlaken → the Jungfrau massif. Real places, real terrain. */
/* ══ ⚠⚠⚠ (#R304) THROUGH `prepare()`, WHICH IS THE DOOR THE APP USES ═══════════════════════════
   This called `D.compute()` directly, and every claim below about the RADIO LINK then measured a
   world with no terrain in it: `losBreaks` was 0 over 2 km of rock, twice on CI and on fourteen
   consecutive nightlies. js/drone-ops.js does not re-implement the link physics — it reads
   `window.IntMapLOS._phys` (the same dropAt / fresnel1 / knifeEdgeDb the viewshed uses, so the two
   tools cannot disagree about what «blocked» means) — and js/viewshed.js is fetched ON DEMAND since
   #R209. `linkSource()` is a synchronous hazard callback that cannot await, so `prepare()` asks for
   it at the one async step that always precedes a plan, and that file says why in as many words:
   without it 「the link analysis would quietly fall back to free-space loss with no terrain — a
   silent downgrade of the kind #R205 is about, not an error」.
   MEASURED through `compute()` alone: `losBreaks 0` while the route's OWN result reports two
   `terrain-collision` violations and `minClearance −756 m` — the plan is inside the mountain and the
   radio check called the sky clear. Through `prepare()` the same walk has the physics it names.
   ⚠ THE DEM ALSO HAS TO BE THERE. `prepare()` fetches what the sources need, but the terrain tiles
   come from the network (js/map-extras.js → elevation-tiles-prod); with none of them the sampler
   answers 0 everywhere and the Alps are a plain. Waiting for a mountain makes that a timeout rather
   than a green run over flat ground. */
const ALPINE = async (page) => {
  await page.waitForFunction(async () => {
    try {
      const S = await window.IntMapTerrain.sampler([7.85, 46.58, 7.99, 46.70], 11);
      return !!(S && S.elevAt(7.92, 46.63) > 1500);
    } catch (_) { return false; }
  }, null, { timeout: 60_000 });
  return page.evaluate(async () => {
    const D = window.IntMapDrone;
    D.newRoute(); D.usePreset('prosumer');
    D.addWaypoint(7.8632, 46.6863, 100, 'agl');
    D.addWaypoint(7.9800, 46.5900, 100, 'agl');
    /* the app's own pre-plan step: it fetches what the enabled hazard sources need — the viewshed
       physics among them — and then re-computes. `compute()` on its own reads whatever is in hand. */
    return !!(await window.IntMapDroneOps.prepare());
  });
};

/* ── ① THE SEAMS ARE FILLED ───────────────────────────────────────────────────────────────── */
test('R184 drone ①: the wind field and all four hazard sources are registered into the planner', async ({ app }) => {
  const page = app.page;
  const s = await page.evaluate(() => window.IntMapDrone.state());
  expect(s.windField, '#R174 declared registerWindField and left it empty').toBe(true);
  expect(s.hazardSources.slice().sort()).toEqual(['link', 'nofly', 'return', 'wind']);
});

/* ── ② THE PHYSICS IS ARITHMETIC, NOT A FUDGE FACTOR ──────────────────────────────────────── */
test('R184 drone ②: free-space path loss and the wind vector convention are the real formulas', async ({ app }) => {
  const page = app.page;
  const r = await page.evaluate(() => {
    const M = window.IntMapDroneOps._math;
    return {
      /* Friis: 20log10(km) + 20log10(MHz) + 32.44 */
      at1km2440: M.fspl(1000, 2440),
      at10km2440: M.fspl(10000, 2440),
      at1km5800: M.fspl(1000, 5800),
      budget: window.IntMapDroneOps.radio().marginDb,
    };
  });
  expect(Math.abs(r.at1km2440 - 100.19)).toBeLessThan(0.02);
  /* ten times the distance is exactly 20 dB more loss */
  expect(Math.abs((r.at10km2440 - r.at1km2440) - 20)).toBeLessThan(0.01);
  /* 5.8 GHz over 2.44 GHz is 20log10(5800/2440) = 7.53 dB more */
  expect(Math.abs((r.at1km5800 - r.at1km2440) - 7.53)).toBeLessThan(0.05);
  /* the default budget: 20 dBm + 2×4 dBi − (−95 dBm) */
  expect(r.budget).toBe(123);
});

/* ── ③ WIND CHANGES THE ANSWER ────────────────────────────────────────────────────────────── */
test('R184 drone ③: real forecast wind is fetched, is applied, and says which height it is for', async ({ app }) => {
  test.setTimeout(120_000);
  const page = app.page;
  await ALPINE(page);
  const r = await page.evaluate(async () => {
    const O = window.IntMapDroneOps, D = window.IntMapDrone;
    O.setEnabled({ wind: true, link: false, nofly: false, reserve: false, sites: false });
    const before = D.result();
    const ok = await O.warmWind([{ lng: 7.86, lat: 46.68 }, { lng: 7.98, lat: 46.59 }]);
    const after = await D.compute();
    const st = O.state().wind;
    const w = O.windAt(7.92, 46.63, 120, Date.now());
    return { ok, cells: st.cells, src: st.src, err: st.err,
      report: st.report && { max: st.report.maxSpeed, head: st.report.headwind, cross: st.report.crosswind, aboveTop: st.report.aboveTop },
      w: w && { speed: w.speed, fromDeg: w.fromDeg, u: w.u, v: w.v, above: w.above, src: w.src },
      beforeS: before.timeS, afterS: after.timeS,
      /* the seam's own contract: a wind field is applied to GROUND SPEED per leg */
      groundSpeeds: after.legs.map((l) => l.groundSpeed),
      cruise: D.spec().cruiseSpeed,
      kinds: after.violations.map((v) => v.kind) };
  });
  test.skip(!r.ok, 'both wind providers unreachable from this runner');
  expect(r.cells).toBeGreaterThan(0);
  expect(['Open-Meteo', 'MET Norway']).toContain(r.src);
  expect(r.w, 'the field answers at an arbitrary point on the route').toBeTruthy();
  expect(r.w.speed).toBeGreaterThanOrEqual(0);
  expect(r.w.fromDeg).toBeGreaterThanOrEqual(0);
  expect(r.w.fromDeg).toBeLessThan(360);
  /* u/v really are the components of that speed and direction — a wind FROM 270° blows east */
  const to = (r.w.fromDeg + 180) * Math.PI / 180;
  expect(Math.abs(r.w.u - r.w.speed * Math.sin(to))).toBeLessThan(1e-6);
  expect(Math.abs(r.w.v - r.w.speed * Math.cos(to))).toBeLessThan(1e-6);
  /* IT IS APPLIED: at least one leg's ground speed differs from the still-air cruise speed */
  const moved = r.groundSpeeds.some((g) => Math.abs(g - r.cruise) > 1e-9);
  expect(moved, 'a wind field that is fetched and not applied is not a wind field').toBe(true);
  /* and the source's own limits are stated rather than hidden */
  if (r.src === 'MET Norway' || r.report.aboveTop) expect(r.kinds).toContain('wind-level');
});

/* ── ④ THE RADIO LINK: RANGE AND LINE OF SIGHT, ONE WALK ──────────────────────────────────── */
test('R184 drone ④: 2.4 GHz does not reach through the Alps, and the check says where it stops', async ({ app }) => {
  const page = app.page;
  await ALPINE(page);
  const r = await page.evaluate(async () => {
    const O = window.IntMapDroneOps, D = window.IntMapDrone;
    O.setEnabled({ wind: false, link: true, nofly: false, reserve: false, sites: false });
    const res = await D.compute();
    const rep = O.state().link.report;
    return { rep, kinds: res.violations.map((v) => v.kind),
      texts: res.violations.filter((v) => /^link/.test(v.kind)).map((v) => v.text) };
  });
  expect(r.rep, 'the link report is written even when the news is bad').toBeTruthy();
  expect(r.rep.sampled).toBeGreaterThan(10);
  /* 14 km of 2,000 m mountains: line of sight is broken and the budget is exceeded */
  expect(r.rep.losBreaks).toBeGreaterThan(0);
  expect(r.kinds).toContain('link-los');
  expect(r.kinds).toContain('link-range');
  expect(r.rep.worstMarginDb).toBeLessThan(0);
  /* the finding names the distance and the deficit, not just "there is a problem" */
  expect(r.texts.join(' ')).toMatch(/\d+(\.\d+)?\s*km/);
  expect(r.texts.join(' ')).toMatch(/\d+\s*dB/);
  /* …and a short, flat link is fine — the check is not simply always negative */
  const near = await page.evaluate(async () => {
    const O = window.IntMapDroneOps, D = window.IntMapDrone;
    D.newRoute(); D.usePreset('prosumer');
    D.addWaypoint(7.8632, 46.6863, 80, 'agl');
    D.addWaypoint(7.8700, 46.6870, 80, 'agl');
    const res = await D.compute();
    return { kinds: res.violations.map((v) => v.kind), margin: O.state().link.report.worstMarginDb };
  });
  expect(near.kinds).not.toContain('link-range');
  expect(near.margin).toBeGreaterThan(0);
});

/* ── ⑤ RESTRICTED AREAS HAVE EXTENT, NOT JUST A CENTROID ──────────────────────────────────── */
test('R184 drone ⑤: OSM restricted areas come back with their real size and are checked against it', async ({ app }) => {
  test.setTimeout(150_000);   /* Overpass + a cold DEM cache */
  const page = app.page;
  const r = await page.evaluate(async () => {
    const O = window.IntMapDroneOps, D = window.IntMapDrone;
    /* straight across Zurich airport — an aerodrome with a 5 km advisory buffer around a 3 km field */
    D.newRoute(); D.usePreset('prosumer');
    D.addWaypoint(8.5500, 47.4500, 80, 'agl');
    D.addWaypoint(8.5700, 47.4600, 80, 'agl');
    await D.compute();
    O.setEnabled({ wind: false, link: false, nofly: true, reserve: false, sites: false });
    const ok = await O.warmZones([{ lng: 8.55, lat: 47.45 }, { lng: 8.57, lat: 47.46 }]);
    const res = await D.compute();
    const zs = O.zones();
    return { ok, err: O.state().nofly.err, n: zs.length,
      withExtent: zs.filter((z) => z.extentM > 0).length,
      aerodromes: zs.filter((z) => z.kind === 'aerodrome').map((z) => ({ name: z.name, extentM: z.extentM })),
      hits: O.state().nofly.report && O.state().nofly.report.hits,
      kinds: res.violations.map((v) => v.kind),
      text: res.violations.filter((v) => v.kind === 'nofly').map((v) => v.text).join(' ') };
  });
  test.skip(!r.ok, 'Overpass unreachable from this runner');
  expect(r.n).toBeGreaterThan(0);
  /* THE DEFECT THIS PINS: `out center` gives no bounds, so a national park became a point */
  expect(r.withExtent, 'polygon zones must carry their extent, not just a centroid').toBeGreaterThan(0);
  expect(r.aerodromes.length).toBeGreaterThan(0);
  expect(r.aerodromes[0].extentM, 'a major airport is kilometres across').toBeGreaterThan(800);
  expect(r.hits, 'a route over the runway is inside the buffer').toBeGreaterThan(0);
  expect(r.kinds).toContain('nofly');
  /* and it never pretends to be an authority */
  expect(r.text).toMatch(/OpenStreetMap/);
});

/* ── ⑥ THE RETURN LEG IS COUNTED, AND CAN BE FLOWN ────────────────────────────────────────── */
test('R184 drone ⑥: the battery check includes coming home, and return-to-home closes the route', async ({ app }) => {
  test.setTimeout(120_000);
  const page = app.page;
  await ALPINE(page);
  const r = await page.evaluate(async () => {
    const O = window.IntMapDroneOps, D = window.IntMapDrone;
    O.setEnabled({ wind: false, link: false, nofly: false, reserve: true, sites: false });
    const res = await D.compute();
    const rr = O.state().reserve;
    const before = D.route().wp.length;
    const rth = await O.returnToHome();
    const wp = D.route().wp;
    const closes = Math.abs(wp[0].lng - wp[wp.length - 1].lng) < 1e-6 && Math.abs(wp[0].lat - wp[wp.length - 1].lat) < 1e-6;
    const after = D.result();
    return { oneWayWh: res.energyWh, rr, before, added: wp.length - before, closes,
      kinds: res.violations.map((v) => v.kind), rth: rth && { safeAmsl: rth.safeAmsl, maxGround: rth.maxGround, clear: rth.clear },
      afterKm: after && after.dist3DM, oneWayKm: res.dist3DM,
      text: res.violations.filter((v) => v.kind === 'return').map((v) => v.text).join(' ') };
  });
  expect(r.kinds).toContain('return');
  expect(r.rr.returnM, 'the return leg is a real distance').toBeGreaterThan(1000);
  expect(r.rr.roundTripWh).toBeGreaterThan(r.oneWayWh);
  /* a 14 km alpine leg on a 77 Wh prosumer battery cannot be flown there AND back */
  expect(r.rr.roundTripWh).toBeGreaterThan(r.rr.usableWh);
  expect(r.text).toMatch(/Wh/);
  /* return-to-home: waypoints added, the route closes, and the transit is above the highest ground */
  expect(r.added).toBeGreaterThanOrEqual(2);
  expect(r.closes, 'a return-to-home route ends where it started').toBe(true);
  expect(r.rth.safeAmsl).toBeGreaterThan(r.rth.maxGround);
  expect(r.afterKm, 'the round trip is longer than the one-way leg').toBeGreaterThan(r.oneWayKm * 1.7);
});

/* ── ⑦ THREE PLANS, COMPARED, AND THE ORIGINAL PUT BACK ───────────────────────────────────── */
test('R184 drone ⑦: shortest / least-power / safest are three real computations', async ({ app }) => {
  test.setTimeout(120_000);   /* three full plans plus the restore */
  const page = app.page;
  await ALPINE(page);
  const r = await page.evaluate(async () => {
    const O = window.IntMapDroneOps, D = window.IntMapDrone;
    O.setEnabled({ wind: false, link: false, nofly: false, reserve: false, sites: false });
    const wpBefore = JSON.stringify(D.route().wp);
    const c = await O.compareVariants();
    const wpAfter = JSON.stringify(D.route().wp);
    return { c, restored: wpBefore === wpAfter };
  });
  expect(r.c).toBeTruthy();
  expect(r.c.variants.length).toBe(3);
  expect(r.c.variants.map((v) => v.id).sort()).toEqual(['economy', 'safest', 'shortest']);
  /* they are DIFFERENT plans, not three labels on one answer */
  const clears = r.c.variants.map((v) => v.minClearance);
  expect(new Set(clears.map((x) => Math.round(x))).size).toBeGreaterThan(1);
  /* the low-altitude plan flies into the mountain; the raised ones clear it */
  const shortest = r.c.variants.find((v) => v.id === 'shortest');
  const safest = r.c.variants.find((v) => v.id === 'safest');
  expect(shortest.minClearance).toBeLessThan(safest.minClearance);
  expect(shortest.violations).toBeGreaterThan(safest.violations);
  /* a comparison must not silently replace what the operator built */
  expect(r.restored, 'compareVariants restores the original route').toBe(true);
});

/* ── ⑧ EMERGENCY LANDING SITES ARE A SLOPE MEASUREMENT ────────────────────────────────────── */
test('R184 drone ⑧: landing sites are open ground under 8° that the aircraft can reach', async ({ app }) => {
  test.setTimeout(180_000);   /* Overpass + DEM slope sampling at 60 candidate sites */
  const page = app.page;
  const r = await page.evaluate(async () => {
    const O = window.IntMapDroneOps, D = window.IntMapDrone;
    D.newRoute(); D.usePreset('prosumer');
    D.addWaypoint(7.8632, 46.6863, 120, 'agl');
    D.addWaypoint(7.9000, 46.6700, 120, 'agl');
    const res = await D.compute();
    const list = await O.findLandingSites(res.samples, D.spec());
    return { n: list.length, err: O.state().sites.err,
      maxSlope: list.length ? Math.max(...list.map((s) => s.slopeDeg)) : null,
      maxOff: list.length ? Math.max(...list.map((s) => s.offRouteM)) : null,
      reachable: list.filter((s) => s.reachable).length,
      /* reachability is a real descent calculation, not a fixed radius */
      consistent: list.every((s) => s.reachable === (s.offRouteM <= s.reachM)),
      limit: O._math.MAX_LANDING_SLOPE_DEG,
      sample: list.slice(0, 3).map((s) => ({ label: s.label, slope: +s.slopeDeg.toFixed(1), off: Math.round(s.offRouteM) })) };
  });
  test.skip(r.err != null, 'Overpass unreachable from this runner');
  expect(r.n).toBeGreaterThan(0);
  expect(r.maxSlope, 'nothing steeper than the limit is offered').toBeLessThanOrEqual(r.limit);
  expect(r.maxOff, 'sites are near the route, not anywhere in the region').toBeLessThanOrEqual(2500);
  expect(r.consistent, 'reachable = can the aircraft descend to it from the route').toBe(true);
});

/* ── ⑨ CONFLICTS ARE A 4-D QUESTION ───────────────────────────────────────────────────────── */
test('R184 drone ⑨: two routes that cross are only in conflict at the same time AND altitude', async ({ app }) => {
  test.setTimeout(150_000);   /* six route computations, each warming DEM tiles */
  const page = app.page;
  const r = await page.evaluate(async () => {
    const O = window.IntMapDroneOps, D = window.IntMapDrone;
    /* AMSL, not AGL, and that distinction is the point: two plans "both at 500 m AGL" over Alpine
       terrain are not at the same height at all, because the planner interpolates AMSL linearly
       between waypoints (js/drone-nav.js says so). Asking about SEPARATION means asking about a
       common datum, so the routes are given one. */
    const mk = async (name, amsl, a, b) => {
      D.newRoute(); D.usePreset('prosumer');
      D.addWaypoint(a[0], a[1], amsl, 'amsl'); D.addWaypoint(b[0], b[1], amsl, 'amsl');
      D.setRoute(Object.assign(D.route(), { name })); D.save(); await D.compute();
    };
    /* two flights that cross in plan, 1,300 m apart in altitude */
    await mk('High', 2500, [7.86, 46.68], [7.92, 46.63]);
    await mk('Low', 1200, [7.92, 46.68], [7.86, 46.63]);
    const apart = await O.checkConflicts();
    /* now put the second one at the SAME altitude — the crossing becomes a conflict */
    await mk('Low', 2500, [7.92, 46.68], [7.86, 46.63]);
    const together = await O.checkConflicts();
    return { apart, together, sep: apart.separation };
  });
  expect(r.apart.checked).toBeGreaterThan(0);
  const hi = r.apart.minima.find((m) => /High/.test(m.name || ''));
  expect(hi, 'the other route is examined').toBeTruthy();
  expect(hi.horizM, 'they really do cross in plan').toBeLessThan(200);
  expect(hi.vertM, 'and they really are separated in altitude').toBeGreaterThan(r.sep.vertM);
  expect(hi.conflict, 'vertical separation is not a conflict').toBe(false);
  /* at the same altitude and the same time it IS one */
  const same = r.together.minima.find((m) => /High/.test(m.name || ''));
  expect(same).toBeTruthy();
  expect(same.vertM).toBeLessThan(r.sep.vertM);
  expect(same.conflict, 'same place, same height, same time = conflict').toBe(true);
});

/* ── ⑩ THE PANEL SHOWS ALL OF IT, IN THE OPERATOR'S LANGUAGE ──────────────────────────────── */
test('R184 drone ⑩: the Operations block renders, and no finding prints a raw slug', async ({ app }) => {
  const page = app.page;
  await ALPINE(page);
  const r = await page.evaluate(async () => {
    const O = window.IntMapDroneOps, D = window.IntMapDrone;
    O.setEnabled({ wind: false, link: true, nofly: false, reserve: true, sites: false });
    await D.compute();
    D.open();
    const p = document.getElementById('drone-panel');
    return { checks: [...p.querySelectorAll('[data-opchk]')].map((i) => i.getAttribute('data-opchk')),
      nums: [...p.querySelectorAll('[data-opnum]')].map((i) => i.getAttribute('data-opnum')),
      acts: [...p.querySelectorAll('[data-opact]')].map((b) => b.getAttribute('data-opact')),
      srcNote: (p.querySelector('.dn-opsrc') || {}).textContent || '',
      labels: [...p.querySelectorAll('.dn-vio b')].map((b) => b.textContent) };
  });
  expect(r.checks).toEqual(['wind', 'link', 'nofly', 'reserve', 'sites']);
  expect(r.nums).toEqual(['mhz', 'txDbm', 'rxSensDbm', 'antGainDbi', 'stationH']);
  expect(r.acts).toEqual(['prepare', 'compare', 'rth', 'conflicts']);
  expect(r.srcNote, 'the panel says where the data comes from and what it is not').toMatch(/OpenStreetMap/);
  expect(r.labels.length).toBeGreaterThan(0);
  /* every finding kind has a translated label — a raw kebab-case slug means kindLabel is missing one */
  const raw = r.labels.filter((t) => /^[a-z][a-z-]*$/.test(t));
  expect(raw, 'findings must not print their internal kind').toEqual([]);
});
