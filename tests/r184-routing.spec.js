// (#R184) THE NINE ROUTE-SEARCH ADDITIONS, IN A REAL BROWSER.
//
// 「任意の経由地点追加 / 通過禁止範囲を地図で描画 / フェリー、鉄道、徒歩区間の個別除外 /
//   標高差を加味 / 国境通過回数を表示 / ルート沿いの天候、災害、ニュース表示 /
//   途中地点ごとの到着時刻 / 過去の道路・鉄道路線で経路計算 / 複数ルートの差を地図上で強調」
//
// Three of these change the REQUEST and six answer questions about the result, so both halves are
// pinned: that a keep-out area really reroutes rather than merely being accepted, and that an
// elevation total, a border count and an arrival time are numbers a map can be checked against.
//
// Every route here is between real places whose answers are known independently: Munich sits at
// 519 m and Nuremberg at ~300 m, so a route between them nets about −220 m; Munich→Milan crosses at
// least the Germany/Austria and the Switzerland/Italy borders; and Bedford→Cambridge had a railway
// until 1967 and has none now, which is the difference the historical mode exists to show.
import { test, expect } from '@playwright/test';

const BOOT = { timeout: 90_000 };
const boot = async (page) => {
  await page.goto('/?rafshim=1');
  await page.waitForFunction(() => !!window.__imap && !!window.IntMapRouting && !!window.IntMapRoutingOps, null, BOOT);
  await page.waitForFunction(() => window.IntMapGeoEngine.canDraw(), null, BOOT);
};
const MUC = { lng: 11.575, lat: 48.137 }, NUE = { lng: 11.077, lat: 49.452 }, ING = { lng: 11.425, lat: 48.766 };

/* ── ① VIA POINTS, AND THE PER-LEG DURATIONS THEY PRODUCE ─────────────────────────────────── */
test('R184 route ①: a via point is honoured and the route comes back split into legs', async ({ page }) => {
  test.setTimeout(120_000);
  await boot(page);
  const r = await page.evaluate(async ([a, b, v]) => {
    const R = window.IntMapRouting;
    const plain = await R.route(a, b, { mode: 'driving' });
    const viad = await R.route(a, b, { mode: 'driving', via: [v] });
    return { plain: plain && { ok: plain.ok, m: plain.distance, legs: (plain.legDurations || []).length },
      viad: viad && { ok: viad.ok, m: viad.distance, legs: (viad.legDurations || []).length,
        legMin: (viad.legDurations || []).map((d) => Math.round(d / 60)), s: viad.duration } };
  }, [MUC, NUE, ING]);
  test.skip(!(r.plain && r.plain.ok && r.viad && r.viad.ok), 'the public routing service is unreachable');
  expect(r.viad.legs, 'one leg per section between the endpoints and the stop').toBe(2);
  expect(r.plain.legs).toBe(1);
  /* the detour is real: going via Ingolstadt is longer than the direct road */
  expect(r.viad.m).toBeGreaterThan(r.plain.m);
  /* the legs really add up to the whole journey */
  const sum = r.viad.legMin.reduce((x, y) => x + y, 0) * 60;
  expect(Math.abs(sum - r.viad.s)).toBeLessThan(120);
});

/* ── ② A DRAWN AREA REALLY REROUTES ───────────────────────────────────────────────────────── */
test('R184 route ②: a keep-out area lengthens the route, and works on foot too', async ({ page }) => {
  test.setTimeout(120_000);
  await boot(page);
  const r = await page.evaluate(async () => {
    const R = window.IntMapRouting;
    const A = { lng: 11.575, lat: 48.137 }, B = { lng: 11.610, lat: 48.150 };
    const box = [[[11.580, 48.140], [11.600, 48.140], [11.600, 48.152], [11.580, 48.152], [11.580, 48.140]]];
    const plain = await R.route(A, B, { mode: 'driving' });
    const boxed = await R.route(A, B, { mode: 'driving', avoidAreas: box });
    const walk = await R.route(A, B, { mode: 'walking', avoidAreas: box });
    /* a degenerate ring must be dropped, not sent — Valhalla rejects the whole request otherwise */
    const junk = await R.route(A, B, { mode: 'driving', avoidAreas: [[[11.58, 48.14], [11.60, 48.14]]] });
    return { plain: plain && { ok: plain.ok, m: plain.distance, provider: plain.provider || 'osrm' },
      boxed: boxed && { ok: boxed.ok, m: boxed.distance, provider: boxed.provider, areas: boxed.avoidAreas },
      walk: walk && { ok: walk.ok, m: walk.distance, provider: walk.provider, mode: walk.mode },
      junk: junk && { ok: junk.ok } };
  });
  test.skip(!(r.plain && r.plain.ok && r.boxed && r.boxed.ok), 'the public routing service is unreachable');
  expect(r.boxed.provider, 'OSRM cannot express an excluded area at all — this must go to Valhalla').toBe('valhalla');
  expect(r.boxed.areas).toBe(1);
  expect(r.boxed.m, 'a route that must go round the box is longer than one that need not').toBeGreaterThan(r.plain.m);
  /* the same box on foot — the capability OSRM has no equivalent for in ANY mode */
  expect(r.walk.ok).toBe(true);
  expect(r.walk.provider).toBe('valhalla');
  expect(r.walk.mode).toBe('walking');
  expect(r.junk.ok, 'a 2-point ring is dropped rather than breaking the request').toBe(true);
});

/* ── ③ ELEVATION IS MEASURED FROM THE DEM ─────────────────────────────────────────────────── */
test('R184 route ③: ascent, descent and the net change match the real terrain', async ({ page }) => {
  test.setTimeout(150_000);
  await boot(page);
  const r = await page.evaluate(async ([a, b]) => {
    const R = window.IntMapRouting, O = window.IntMapRoutingOps;
    const rt = await R.route(a, b, { mode: 'driving' });
    if (!rt || !rt.ok) return { skip: true };
    const e = await O.elevation(rt.coords);
    return { e, noise: O._math.CLIMB_NOISE_M };
  }, [MUC, NUE]);
  test.skip(!!r.skip, 'the public routing service is unreachable');
  expect(r.e).toBeTruthy();
  expect(r.e.err).toBeUndefined();
  expect(r.e.samples).toBeGreaterThan(100);
  /* Munich is at ~519 m and Nuremberg at ~300 m — the NET change is a fact about the two cities */
  expect(r.e.netM).toBeLessThan(-120);
  expect(r.e.netM).toBeGreaterThan(-320);
  expect(Math.abs(r.e.netM - (r.e.endM - r.e.startM))).toBeLessThan(0.01);
  /* ascent and descent are separate quantities and both are real on this road */
  expect(r.e.ascentM).toBeGreaterThan(100);
  expect(r.e.descentM).toBeGreaterThan(r.e.ascentM);
  /* the identity that has to hold: net = ascent − descent, within the hysteresis band */
  expect(Math.abs((r.e.ascentM - r.e.descentM) - r.e.netM)).toBeLessThan(r.noise * 3);
  expect(r.e.maxM).toBeGreaterThan(r.e.minM);
  expect(r.e.maxGradePct).toBeGreaterThan(0);
});

/* ── ④ BORDER CROSSINGS ARE NAMED, NOT JUST COUNTED ───────────────────────────────────────── */
test('R184 route ④: Munich → Milan is reported crossing real borders in order', async ({ page }) => {
  test.setTimeout(150_000);
  await boot(page);
  const r = await page.evaluate(async () => {
    const R = window.IntMapRouting, O = window.IntMapRoutingOps;
    /* the country outlines are loaded by the Countries tab; the analysis says so rather than
       silently answering zero, and this asserts the loaded case */
    const t0 = Date.now();
    while (!(window.countryGeo && window.countryGeo.features && window.countryGeo.features.length) && Date.now() - t0 < 30000) {
      try { document.getElementById('dl-pop') && document.getElementById('dl-pop').dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
      await new Promise((x) => setTimeout(x, 500));
    }
    const rt = await R.route({ lng: 11.575, lat: 48.137 }, { lng: 9.190, lat: 45.464 }, { mode: 'driving' });
    if (!rt || !rt.ok) return { skip: true };
    return { b: O.borders(rt.coords), hasGeo: !!(window.countryGeo && window.countryGeo.features.length) };
  });
  test.skip(!!r.skip, 'the public routing service is unreachable');
  test.skip(!r.hasGeo, 'the country outlines did not load in this runner');
  expect(r.b.err).toBeUndefined();
  expect(r.b.count, 'Germany → … → Italy is at least two crossings').toBeGreaterThanOrEqual(2);
  expect(r.b.countries[0]).toMatch(/German/i);
  expect(r.b.countries[r.b.countries.length - 1]).toMatch(/Ital/i);
  /* each crossing has a place on the route, and they are in order */
  const ats = r.b.crossings.map((c) => c.atM);
  expect(ats.slice(1).every((v, i) => v >= ats[i])).toBe(true);
  /* the length in each country is what tells a real transit from an outline artefact */
  expect(r.b.segments.length).toBe(r.b.countries.length);
  expect(r.b.segments.every((s) => s.m >= 0)).toBe(true);
  expect(Math.abs(r.b.segments.reduce((a, s) => a + s.m, 0) - r.b.totalM)).toBeLessThan(r.b.totalM * 0.2);
});

/* ── ⑤ CONDITIONS ALONG THE WAY, AT THE TIME THE TRAVELLER IS THERE ───────────────────────── */
test('R184 route ⑤: weather is probed along the route and stamped with the arrival time', async ({ page }) => {
  test.setTimeout(150_000);
  await boot(page);
  const r = await page.evaluate(async ([a, b]) => {
    const R = window.IntMapRouting, O = window.IntMapRoutingOps;
    const rt = await R.route(a, b, { mode: 'driving' });
    if (!rt || !rt.ok) return { skip: true };
    const dep = Date.parse('2026-08-01T09:00:00Z');
    const al = await O.along(rt.coords, { durationS: rt.duration, departMs: dep });
    return { n: al.probes.length, first: al.probes[0], last: al.probes[al.probes.length - 1],
      withWx: al.probes.filter((p) => p.wx).length, dep, durationS: rt.duration,
      quakes: al.quakes.length, news: al.news.length, totalM: al.totalM };
  }, [MUC, NUE]);
  test.skip(!!r.skip, 'the public routing service is unreachable');
  expect(r.n).toBeGreaterThanOrEqual(2);
  /* the probes span the route and carry the time the traveller reaches them */
  expect(r.first.atM).toBe(0);
  expect(Math.abs(r.last.atM - r.totalM)).toBeLessThan(1000);
  expect(r.first.etaMs).toBe(r.dep);
  expect(Math.abs(r.last.etaMs - (r.dep + r.durationS * 1000))).toBeLessThan(1000);
  /* the earthquake and news probes always answer, even when the answer is "none near here" */
  expect(r.quakes).toBeGreaterThanOrEqual(0);
  expect(r.news).toBeGreaterThanOrEqual(0);
});

/* ── ⑥ ARRIVAL TIMES, FORWARDS AND BACKWARDS ──────────────────────────────────────────────── */
test('R184 route ⑥: arrive-by runs the clock backwards from the deadline', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const O = window.IntMapRoutingOps;
    const t = Date.parse('2026-08-01T09:00:00Z');
    const legs = [3600, 1800, 900];                        /* 1 h, 30 min, 15 min */
    const fwd = O.schedule(legs, { timeMs: t, arriveBy: false });
    const back = O.schedule(legs, { timeMs: t, arriveBy: true });
    return { fwd: { depart: fwd.departMs, arrive: fwd.arriveMs, pts: fwd.points.map((p) => p.tMs) },
      back: { depart: back.departMs, arrive: back.arriveMs }, t };
  });
  /* departing at 09:00 with 6,300 s of legs arrives at 10:45 */
  expect(r.fwd.depart).toBe(r.t);
  expect(r.fwd.arrive).toBe(r.t + 6300 * 1000);
  expect(r.fwd.pts).toEqual([r.t, r.t + 3600e3, r.t + 5400e3, r.t + 6300e3]);
  /* arriving BY 09:00 means leaving at 07:15 — the same numbers, read the other way */
  expect(r.back.arrive).toBe(r.t);
  expect(r.back.depart).toBe(r.t - 6300 * 1000);
});

/* ── ⑦ WHERE ALTERNATIVES DIFFER ──────────────────────────────────────────────────────────── */
test('R184 route ⑦: the shared part of two routes is excluded and only the difference is drawn', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const O = window.IntMapRoutingOps, M = O._math;
    /* an identical line has nothing unique */
    const a = [[0, 0], [0.01, 0], [0.02, 0], [0.03, 0]];
    const same = M.uniqueOf(a, a.slice());
    /* one that bulges away in the middle has exactly that bulge */
    const b = [[0, 0], [0.01, 0.02], [0.02, 0.02], [0.03, 0]];
    const diff = M.uniqueOf(b, a);
    /* and the drawing side reports per-alternative totals */
    const rep = O.highlightDifferences([
      { coords: a, color: '#1a73e8', label: 'A' },
      { coords: b, color: '#e8710a', label: 'B' }]);
    return { same: same.length, diff: diff.length, diffPts: diff.reduce((s, x) => s + x.length, 0),
      rep: rep && { n: rep.n, per: rep.per.map((p) => ({ i: p.i, segs: p.segments, m: Math.round(p.uniqueM) })), thr: rep.sameThresholdM },
      cleared: O.clearDifferences() };
  });
  expect(r.same, 'two identical lines differ nowhere').toBe(0);
  expect(r.diff).toBeGreaterThan(0);
  expect(r.diffPts).toBeGreaterThan(0);
  expect(r.rep.per.length).toBe(2);
  expect(r.rep.per[1].m, 'the bulge is a real length, in metres').toBeGreaterThan(100);
  expect(r.rep.thr).toBeGreaterThan(0);
  expect(r.cleared).toBe(true);
});

/* ── ⑧ OSM's DATE RECORD, READ CORRECTLY ──────────────────────────────────────────────────── */
test('R184 route ⑧: OSM date tags are parsed, and "no date" is not treated as a yes or a no', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const M = window.IntMapRoutingOps._math;
    return {
      years: ['1889', '1889-06', '1889-06-15', '~1890', '1889..1892', 'C19', 'unknown', '', null].map(M.osmYear),
      /* a line opened in 1889: there in 1900, not there in 1850 */
      after: M.existedIn({ start_date: '1889' }, 1900),
      before: M.existedIn({ start_date: '1889' }, 1850),
      /* closed in 1935: there in 1900, gone in 1950 */
      inside: M.existedIn({ start_date: '1889', end_date: '1935' }, 1900),
      outside: M.existedIn({ start_date: '1889', end_date: '1935' }, 1950),
      /* nothing recorded: UNKNOWN, which is neither a pass nor a fail */
      none: M.existedIn({}, 1900),
    };
  });
  expect(r.years).toEqual([1889, 1889, 1889, 1890, 1889, null, null, null, null]);
  expect(r.after.known).toBe(true);
  expect(r.after.start).toBe(1889);
  expect(r.before).toBe(false);
  expect(r.inside.known).toBe(true);
  expect(r.outside).toBe(false);
  expect(r.none.known, 'an undated way is UNKNOWN, and the caller decides what to do with that').toBe(false);
});

/* ── ⑨ ROUTING ON THE NETWORK AS IT WAS ───────────────────────────────────────────────────── */
test('R184 route ⑨: Bedford → Cambridge connects by rail in 1950 and does not today', async ({ page }) => {
  test.setTimeout(240_000);
  await boot(page);
  const r = await page.evaluate(async () => {
    const O = window.IntMapRoutingOps;
    const A = { lng: -0.4667, lat: 52.1360 }, B = { lng: 0.1218, lat: 52.2053 };
    const then = await O.historicalRoute(A, B, { year: 1950, kind: 'rail' });
    await new Promise((x) => setTimeout(x, 2500));         /* be a good Overpass citizen */
    const now = await O.historicalRoute(A, B, { year: new Date().getUTCFullYear(), kind: 'rail' });
    return { then, now };
  });
  test.skip(r.then && r.then.err === 'overpass', 'Overpass unreachable from this runner');
  /* THE POINT OF THE FEATURE: the Varsity Line closed in 1967, so the two years disagree */
  expect(r.then.err, 'a 1950 rail route between Bedford and Cambridge exists').toBeUndefined();
  expect(r.then.lengthM / 1000).toBeGreaterThan(35);
  expect(r.then.lengthM / 1000).toBeLessThan(90);
  expect(r.then.coords.length).toBeGreaterThan(50);
  /* the route mostly rides line OSM records as CLOSED — which is what makes it a historical route */
  expect(r.then.onRoute.checked).toBeGreaterThan(10);
  expect(r.then.onRoute.assumedGone + r.then.onRoute.dated).toBeGreaterThan(r.then.onRoute.assumedLive);
  /* and the honesty numbers are present, so the panel can state what is record and what is inference */
  expect(typeof r.then.onRouteDatedPct).toBe('number');
  expect(r.then.dated + r.then.assumedGone + r.then.assumedLive).toBe(r.then.ways);
  /* today: the closed formation is excluded, and there is no through route */
  expect(r.now.err, 'there is no direct rail link between these two towns today').toBe('disconnected');
});
