/* ============================================================================
 *  IntMap · the radioactive-plume model (js/radiation-model.js) and the nuclear ledger it places
 *  sources from (data/npp.json)
 * ----------------------------------------------------------------------------
 *  Consolidated from tests/r568-checks and tests/r585-npp-checks.
 *
 *  IntMap · R568 — the radioactive-plume model, measured rather than read
 *  A reader's assessment of the old model: good picture, bad number. Ten specific places where it
 *  printed a figure it had no way to have known. The point of THIS file is that nine of the ten are
 *  checked by RUNNING the model — #R505's lesson is that a test which reads source text cannot see
 *  evaluation order, and #R488's is that a test which pins a spelling keeps a dead mechanism green.
 *  So the field is built, the particles are flown, and the assertions are about what came out.
 *
 *  The one exception is ⑧'s console side and ⑥'s removal, which are statements about what must NOT
 *  be in the source any more — those are the only greps here, and each says what it is guarding.
 *
 *  R585 — the nuclear ledger: shipped data/npp.json is measured, not typed
 *  The plume model used to carry twelve hand-written regular expressions with
 *  coordinates typed next to them (js/sims.js, `SITES`). data/npp.json replaces
 *  that with what an upstream that knows the world's nuclear facilities answers
 *  (scripts/build-npp-registry.mjs). These gates guard the two ways that can go
 *  wrong: a rebuild that quietly ships fewer/garbage records, and a ledger that
 *  cannot answer for the places the program already promises to place.
 *
 *  ⚠ ③ does NOT restate the twelve sites. It READS them out of js/sims.js, so
 *  the day that table is finally deleted the gate has nothing left to demand —
 *  and while the table is still there, every one of its entries must resolve.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const R = read;
const { RAD } = await import(pathToFileURL(join(ROOT, 'js', 'radiation-model.js')).href);
/* ── a synthetic field, so the assertions are about the MODEL and not about today's weather ──
   A steady wind that is deliberately DIFFERENT at 10 m and at 180 m, which is what ② is about. */
function field({ hours = 60, spd10 = 8, spd180 = 14, dir = 270, rain = 0, pbl = 800, halfHint = null } = {}) {
  const cx = 141.03, cy = 37.42, levels = [10, 80, 180];
  const time = [];
  for (let h = 0; h < hours; h++) time.push('2026-09-09T' + String(h % 24).padStart(2, '0') + ':00');
  const body = (plan) => RAD.planPoints(plan).LO.map(() => {
    const hourly = { time };
    for (const l of levels) {
      hourly['wind_speed_' + l + 'm'] = new Array(hours).fill(l === 10 ? spd10 : l === 80 ? (spd10 + spd180) / 2 : spd180);
      hourly['wind_direction_' + l + 'm'] = new Array(hours).fill(dir);
    }
    hourly.precipitation = new Array(hours).fill(rain);
    hourly.temperature_2m = new Array(hours).fill(15);
    hourly.boundary_layer_height = new Array(hours).fill(pbl);
    return { hourly };
  });
  const inPlan = RAD.innerPlan(cx, cy);
  const outPlan = halfHint ? { n: 9, half: halfHint, cx, cy } : RAD.outerPlan(cx, cy, spd10, 48);
  return {
    cx, cy, levels,
    inner: RAD.buildNest(inPlan, body(inPlan), levels, 0, hours),
    outer: RAD.buildNest(outPlan, body(outPlan), levels, 0, hours),
    outerOK: true, half: outPlan.half,
  };
}
const run = (F, over = {}) => RAD.simulate(F, { lng: F.cx, lat: F.cy }, Object.assign({
  isotope: 'cs137', bq: 8.5e16, hours: 24, emitHours: 6, halfLifeHours: RAD.ISOTOPES.cs137.hl,
  startHour: 0, depRes: 0.03, particles: 3000, dtSec: 600, releaseHeight: 300,
}, over), null);

/* ══ ① THE CLOCK ══════════════════════════════════════════════════════════════════════════════
   The bug was not «the wrong hour is picked» — it was that NO hour was picked. Open-Meteo's hourly
   forecast starts at 00:00 UTC of the current day, and a run with no explicit date left the index at
   0, so a plume launched at 13:05 UTC was blown by the 00:00 UTC wind. */
test('R568 ①: the start hour is the hour nearest the requested INSTANT, and defaults to now', () => {
  /* a real Open-Meteo axis: consecutive hours across two days, timezone=GMT, no zone suffix */
  const times = [];
  for (let h = 0; h < 48; h++) times.push('2026-09-' + (h < 24 ? '09' : '10') + 'T' + String(h % 24).padStart(2, '0') + ':00');
  assert.equal(RAD.resolveStart(times, '2026-09-09T13:05:00Z'), 13, '13:05 UTC resolves to the 13:00 field hour');
  assert.equal(RAD.resolveStart(times, '2026-09-09T13:40:00Z'), 14, '…and 13:40 to the nearer 14:00 one');
  assert.equal(RAD.resolveStart(times, '2026-09-10T02:00:00Z'), 26, 'a second day is 24 + the hour');
  assert.equal(RAD.resolveStart(times, '2026-09-09T00:10:00Z'), 0, 'and midnight is still 0 — the fix is not an offset');
  /* ⚠ THE REGRESSION ITSELF: any instant except the first hour must NOT resolve to 0. */
  assert.notEqual(RAD.resolveStart(times, '2026-09-09T22:05:00Z'), 0,
    '22:05 must not silently become the 00:00 field hour — that was the thirteen-hour-stale wind');
  assert.equal(RAD.resolveStart([], '2026-09-09T13:00:00Z'), 0, 'an empty time axis cannot resolve to anything else');
});

/* ══ ② THE HEIGHT ═════════════════════════════════════════════════════════════════════════════ */
test('R568 ②: particles are advected by the wind at their own height, not by the 10 m wind', () => {
  const F = field({ spd10: 8, spd180: 14 });
  const at = (z) => { const w = RAD.windAt(F, F.cx, F.cy, 0, z); return Math.hypot(w.u, w.v); };
  assert.ok(Math.abs(at(10) - 8) < 0.1, `10 m is the 10 m wind (got ${at(10).toFixed(2)})`);
  assert.ok(Math.abs(at(180) - 14) < 0.1, `180 m is the 180 m wind (got ${at(180).toFixed(2)})`);
  assert.ok(at(120) > at(10) + 2 && at(120) < at(180), 'and in between it is interpolated, not snapped');
  assert.ok(at(5) < at(10), 'below the lowest level the log profile still slows the air down');
  assert.ok(Math.abs(at(2000) - at(180)) < 0.01, 'above the top level it is held, not extrapolated to infinity');
  /* ⚠ AND IT MUST MATTER TO THE ANSWER, which is a stronger claim than «windAt returns two numbers».
     The measure is the DEPOSITED FRACTION, not the reach: a release above the mixing height has no
     turbulent path to the ground at all, so it grounds far less of itself — measured 4.9 % from
     within an 800 m boundary layer against 0.8 % from 2,500 m up. The reach barely separates them
     (596 vs 628 km) because the leading particle of either plume finds the fast air eventually,
     which is exactly why an earlier draft of this test passed while the lid was broken. */
  const dep = (z) => { const r = run(F, { releaseHeight: z, hours: 12, particles: 4000 }); return 1 - r.airborneFrac - r.escapedMassFrac; };
  const inLayer = dep(300), aloft = dep(2500);
  assert.ok(aloft < inLayer * 0.5,
    `a release above the boundary layer deposits far less (${(aloft * 100).toFixed(1)}% vs ${(inLayer * 100).toFixed(1)}%)`);
  /* …and two heights INSIDE a well-mixed layer must agree, because that is what «well mixed» means.
     A future reader must not «fix» this into a difference: it would be inventing stratification. */
  assert.ok(Math.abs(dep(30) - inLayer) < inLayer * 0.25, '30 m and 300 m inside an 800 m layer behave alike');
});

/* ══ ③ THE RESOLUTION ═════════════════════════════════════════════════════════════════════════ */
test('R568 ③: the nests resolve the near field and stay a wind field in the far field', () => {
  const inner = RAD.innerPlan(0, 40);
  const innerSpacing = 2 * inner.half / (inner.n - 1);
  assert.ok(innerSpacing <= 0.3, `the inner nest is ${innerSpacing.toFixed(2)}° — finer than the 1.04° it replaced`);
  /* ⚠ THE TRAP ④ SETS FOR ③: a domain that follows an 80-hour plume with a fixed 9×9 would be
     COARSER than the box this round replaced. The point count has to grow with the domain. */
  for (const [spd, hours] of [[3, 6], [8, 48], [20, 80]]) {
    const o = RAD.outerPlan(0, 40, spd, hours);
    const spacing = 2 * o.half / (o.n - 1);
    assert.ok(spacing <= 2.5 + 1e-9, `outer spacing at ${spd} m/s × ${hours} h is ${spacing.toFixed(2)}° — never coarser than 2.5°`);
    assert.ok(o.n * o.n <= 169, `…and never more than 169 locations (got ${o.n * o.n}) — 225 measured 21.5 s`);
    assert.ok(o.half > inner.half, 'the outer nest always contains the inner one');
  }
  const slow = RAD.outerPlan(0, 40, 3, 6), fast = RAD.outerPlan(0, 40, 20, 80);
  assert.ok(fast.half > slow.half * 2, 'and the domain genuinely follows the plume rather than being fixed');
});

/* ══ ④ THE EDGE ═══════════════════════════════════════════════════════════════════════════════
   The old `sample()` clamped the coordinate into the grid, so a particle outside the box kept being
   pushed by the boundary cell's wind — for ever, silently, while the report printed a reach. */
test('R568 ④: a particle that leaves the domain is retired and counted, never clamped', () => {
  const F = field({ spd10: 20, spd180: 20, halfHint: 1.2 });   /* a small box it must blow out of */
  const r = run(F, { hours: 24, particles: 2000 });
  assert.ok(r.escapedFrac > 0.5, `most of this plume must have left a ±1.2° box (got ${(r.escapedFrac * 100).toFixed(0)}%)`);
  assert.ok(r.escapedMassFrac > 0, 'and the ACTIVITY that left with them is reported too');
  /* the reach is measured, and cannot exceed what the domain could contain */
  const maxDeg = F.half * 1.05;
  assert.ok(r.maxDistKm <= maxDeg * 111.32 * 1.42 + 1,
    `the reach (${r.maxDistKm.toFixed(0)} km) is bounded by the domain, not by a 900 km cap`);
  /* a large domain must NOT show the same escape — otherwise the check above proves nothing */
  const big = run(field({ spd10: 20, spd180: 20, halfHint: 15 }), { hours: 24, particles: 2000 });
  assert.ok(big.escapedFrac < r.escapedFrac, 'a domain that fits the plume retires far fewer particles');
});

/* ══ ⑤ THE TURBULENCE ═════════════════════════════════════════════════════════════════════════ */
test('R568 ⑤: diffusion comes from the friction velocity and the boundary layer, not the temperature', () => {
  const u1 = RAD.frictionVelocity(2), u2 = RAD.frictionVelocity(10);
  assert.ok(u2 > u1 * 3, 'u* scales with the wind');
  assert.ok(u2 > 0.2 && u2 < 1.0, `u* at 10 m/s is ${u2.toFixed(3)} m/s — the physical range for land roughness`);
  const h45 = RAD.neutralPBL(0.3, 45);
  assert.ok(h45 > 300 && h45 < 1200, `the neutral depth at 45° is ${h45.toFixed(0)} m`);
  assert.ok(RAD.neutralPBL(0.3, 0) === RAD.neutralPBL(0.3, 10), 'the Rossby relation is floored at 10° — f → 0 is not a 10 km boundary layer');
  assert.ok(RAD.neutralPBL(9, 45) <= 2500 && RAD.neutralPBL(0.01, 45) >= 150, 'and clamped to what an atmosphere can do');
  /* ⚠ THE ACTUAL REGRESSION: a shallow, stable boundary layer must concentrate the deposit and a
     deep one must dilute it. The old `0.6 + (T−5)/25` could not tell those two atmospheres apart. */
  const shallow = RAD.report(run(field({ pbl: 150 }), { hours: 12 }), 'cs137');
  const deep = RAD.report(run(field({ pbl: 2000 }), { hours: 12 }), 'cs137');
  assert.ok(shallow.peak > deep.peak * 1.3,
    `a 150 m mixing depth must deposit more heavily than a 2,000 m one (${shallow.peak.toFixed(0)} vs ${deep.peak.toFixed(0)} kBq/m²)`);
  const warm = RAD.report(run(field({ pbl: 800 }), { hours: 12 }), 'cs137');
  assert.ok(warm.peak > 0, 'and the temperature is no longer what decides it at all');
});

/* ══ ⑥ THE ENDING ═════════════════════════════════════════════════════════════════════════════ */
test('R568 ⑥: nothing is settled onto the ground because the run ended', () => {
  /* No rain, and the domain wide enough that nothing escapes: what is airborne must STAY airborne,
     and the deposit must be only what dry deposition actually removed. */
  const F = field({ spd10: 1, spd180: 1, halfHint: 15, pbl: 2000 });
  const short = run(F, { hours: 12, emitHours: 1, particles: 2000 });
  const long = run(F, { hours: 24, emitHours: 1, particles: 2000 });
  assert.ok(short.airborneFrac > 0.5, `most of a 12 h run is still aloft (got ${(short.airborneFrac * 100).toFixed(0)}%)`);
  assert.ok(long.airborneFrac < short.airborneFrac, 'and the longer run has deposited more of it — by depositing, not by stopping');
  /* ⚠ THE OLD BEHAVIOUR, STATED AS THE THING THAT MUST NOT COME BACK: half of whatever was aloft
     went into the ground at the last step, so the 12 h and the 24 h map disagreed about the past. */
  const rShort = RAD.report(short, 'cs137'), rLong = RAD.report(long, 'cs137');
  assert.ok(rLong.totBq > rShort.totBq, 'a longer window deposits monotonically more');
  const dumped = short.airborneFrac * 0.5 * short.emitted * short.q0;
  assert.ok(rShort.totBq < dumped, 'the deposit is far below what a 50 % end-of-run dump would have added');
  assert.equal(read('js/sims.js').includes('settle the remainder'), false, 'and the line itself is gone');
});

/* ══ ⑦ THE NOISE ══════════════════════════════════════════════════════════════════════════════ */
test('R568 ⑦: the peak carries its Monte-Carlo error, and is withheld when nobody sampled it', () => {
  const F = field();
  const many = RAD.report(run(F, { particles: 8000, hours: 12 }), 'cs137');
  const few = RAD.report(run(F, { particles: 250, hours: 12 }), 'cs137');
  assert.ok(many.peakN > few.peakN, 'more particles means a better-sampled peak cell');
  assert.ok(many.peakRelSE < few.peakRelSE, 'and a smaller relative standard error');
  assert.ok(Math.abs(many.peakRelSE - 1 / Math.sqrt(many.peakN)) < 1e-9, 'which is 1/√n, stated as such');
  assert.equal(many.peakWellSampled, many.peakN >= many.minPeakN, 'the gate is n against the stated minimum');
  /* ⚠ CONTINUOUS DEPOSITION IS WHY THIS IS POSSIBLE AT ALL. When a particle died whole into one
     cell, n per cell was ~1 and the peak was a coin toss; now one particle feeds many cells. */
  const r = run(F, { particles: 1000, hours: 12 });
  assert.ok(r.keys.length > 1000, `1,000 particles fed ${r.keys.length} cells — each contributes to many`);
  /* and the two runs must agree far better than one-particle-per-cell noise would allow */
  const a = RAD.report(run(F, { particles: 8000, hours: 12 }), 'cs137');
  const b = RAD.report(run(F, { particles: 8000, hours: 12 }), 'cs137');
  assert.ok(Math.abs(a.peak - b.peak) / a.peak < 0.35, 'two 8,000-particle runs land within a third of each other');
});

/* ══ ⑧ THE SOURCE TERM ════════════════════════════════════════════════════════════════════════ */
test('R568 ⑧: the source term is source × ISOTOPE, and no accident has one activity', () => {
  const cs = RAD.sourceTerm('chernobyl', 'cs137'), i = RAD.sourceTerm('chernobyl', 'i131');
  assert.equal(cs.bq, 8.5e16, 'Chernobyl Cs-137 is 85 PBq (UNSCEAR 2008 Annex D)');
  assert.equal(i.bq, 1.76e18, '…and its I-131 is 1,760 PBq — twenty times more');
  assert.ok(i.bq / cs.bq > 15, 'which is exactly the error handing one figure to both made');
  assert.equal(RAD.sourceTerm('chernobyl', 'sr90').bq, 1.0e16);
  assert.equal(RAD.sourceTerm('fukushima', 'cs137').bq, 1.0e16, 'Fukushima Cs-137 is UNSCEAR 2020/21 (Terada 2020)');
  assert.equal(RAD.sourceTerm('fukushima', 'i131').bq, 1.2e17);
  assert.ok(RAD.sourceTerm('fukushima', 'cs137').lo < RAD.sourceTerm('fukushima', 'cs137').hi,
    'and the assessed RANGE travels with it, because the central value is not the whole answer');
  /* ⚠ THE ONE SOURCE TERM THAT IS NOT UNSCEAR'S SAYS SO. Atmospheric Sr-90 from Fukushima is not
     quantified by UNSCEAR or the IAEA; the only figure is NISA's 2011 calculation. */
  assert.equal(RAD.sourceTerm('fukushima', 'sr90').provisional, 'nisa2011');
  assert.equal(RAD.sourceTerm('chernobyl', 'cs137').provisional, null, 'the assessed ones are not flagged');
  /* the generic scales are a quantity of one nuclide and legitimately do not vary */
  assert.equal(RAD.sourceTerm('dirtybomb', 'cs137').bq, RAD.sourceTerm('dirtybomb', 'i131').bq);
  assert.equal(RAD.sourceTerm('dirtybomb', 'cs137').exact, false, '…and they do not claim to be an assessment');
  /* the console must no longer be able to read a per-accident activity that does not exist */
  const con = read('js/atlas-console.js');
  assert.equal(/srcPreset\s*\?\s*srcPreset\.bq/.test(con), false, 'atlas-console cannot read SOURCES[x].bq — there is no such quantity');
  assert.equal(/\[8\.5e16,\s*'Chernobyl/.test(con), false, 'nor keep a hard-coded «Chernobyl · 85 PBq» that ignores the isotope');
});

/* ══ ⑨ THE ZONES ══════════════════════════════════════════════════════════════════════════════ */
test('R568 ⑨: statutory zoning is offered only for the nuclides it exists for', () => {
  const cs = RAD.zonesFor('cs137');
  assert.equal(cs.legal, true);
  assert.equal(cs.jurisdiction, null, 'the four Cs-137 thresholds are identical in the Russian, Ukrainian and Belarusian statutes');
  assert.deepEqual(cs.bands.filter((b) => b.legal).map((b) => b.min), [1480, 555, 185, 37]);
  assert.deepEqual(cs.bands.filter((b) => b.legal).map((b) => b.ci), [40, 15, 5, 1], '…which are 40/15/5/1 Ci/km² exactly');
  /* Sr-90 zoning EXISTS but differs between the three countries, so the ladder names its source. */
  const sr = RAD.zonesFor('sr90');
  assert.equal(sr.legal, true);
  assert.equal(sr.jurisdiction, 'ua', "Sr-90's thresholds differ per country — the legend must say whose it is showing");
  assert.notDeepEqual(sr.bands.map((b) => b.min), cs.bands.map((b) => b.min), 'and they are not caesium’s numbers');
  /* ⚠ THE ACTUAL REPORTED FAULT: «強制移住» was painted on an iodine deposit. No statute anywhere
     zones I-131 by deposition density — they enumerate caesium, strontium and plutonium. */
  for (const k of ['i131', 'cs134']) {
    const z = RAD.zonesFor(k);
    assert.equal(z.legal, false, `${k} has no statutory deposition zoning`);
    assert.equal(z.bands.some((b) => b.legal), false, '…so not one of its bands may claim to be one');
    assert.notDeepEqual(z.bands.map((b) => b.min), cs.bands.map((b) => b.min), '…and it must not borrow caesium’s ladder');
  }
  /* the report carries the answer, so no caller has to infer it from the isotope name */
  const r = RAD.report(run(field(), { isotope: 'i131', hours: 12 }), 'i131');
  assert.equal(r.zonesAreLegal, false);
  assert.equal(RAD.report(run(field(), { hours: 12 }), 'cs137').zonesAreLegal, true);
});

/* ══ ⑩ THE DOSE ═══════════════════════════════════════════════════════════════════════════════ */
test('R568 ⑩: the annual dose is an integral over decay and weathering, not a multiplication', () => {
  const YEAR = 365.25 * 24, NAIVE = YEAR * 0.5;   /* what «× 8766 × 0.5» asserted */
  const cs = RAD.doseIntegralHours('cs137', YEAR), i = RAD.doseIntegralHours('i131', YEAR);
  assert.ok(i < NAIVE * 0.05,
    `I-131's first year is ${i.toFixed(0)} effective hours, not ${NAIVE.toFixed(0)} — its half-life is eight days`);
  assert.ok(cs < NAIVE && cs > NAIVE * 0.7, `Cs-137's is ${cs.toFixed(0)} h — weathering, not decay, is what reduces it`);
  assert.ok(cs > i * 20, 'and the two nuclides can no longer be given the same year');
  assert.ok(RAD.doseIntegralHours('cs137', YEAR * 10) > cs, 'a longer exposure integrates to more');
  assert.ok(RAD.doseIntegralHours('cs137', YEAR * 10) < NAIVE * 10 * 0.8, '…but never to the naive product');
  /* ground shine is per nuclide, and a beta emitter is not headlined with a µSv/h */
  const d = (k) => RAD.doseRate(1e6, k);
  assert.ok(d('cs134').svH > d('cs137').svH, 'Cs-134 shines harder than Cs-137 per becquerel');
  assert.ok(d('cs137').svH > d('sr90').svH * 50, 'and Sr-90/Y-90 penetrating ground shine is far below caesium’s');
  assert.equal(d('sr90').externalMeaningful, false, 'so the model refuses to present it as the hazard');
  assert.equal(d('cs137').externalMeaningful, true);
  /* the console must not still be extrapolating */
  /* ⚠ guard the CODE, not the prose: the comment above the fix quotes the removed expression on
     purpose, and a grep that cannot tell those apart would forbid explaining the bug. */
  const con = read('js/atlas-console.js').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(/annualMSv/.test(con), false, 'the «this rate holds for a year» helper is gone from the answer code');
  assert.match(con, /r\.firstYearMSv/, '…and what the answer prints is the model’s integral');
});

/* ══ the wiring ═══════════════════════════════════════════════════════════════════════════════ */
test('R568: one copy of the physics, on whichever thread runs it', () => {
  /* ⚠ READ, NOT RUN: which files import the model is a property of the import graph, and the worker half needs a Worker. */
  const w = read('src/radiation-worker.js'), c = read('src/radiation-worker-client.js');
  assert.match(w, /import \{ RAD \} from '\.\.\/js\/radiation-model\.js'/, 'the worker imports the model rather than repeating it');
  assert.match(c, /new Worker\(new URL\('\.\/radiation-worker\.js', import\.meta\.url\), \{ type: 'module' \}\)/,
    'and the client names the asset in the one form the bundler can emit');
  assert.match(c, /available\(\)/, 'the caller can ask whether there is a worker at all');
  const s = read('js/sims.js');
  assert.match(s, /import \{ RAD \} from '\.\/radiation-model\.js'/, 'the page imports the same model');
  assert.match(s, /engine='page'/, '…and falls back to solving on the page when there is no worker');
  assert.match(s, /engine,\s*particles:res\.particles/, '…and REPORTS which one ran, because their error bars differ');
  assert.match(read('src/main.js'), /import '\.\/radiation-worker-client\.js';/, 'the entry loads the client');
});

/* ⚠⚠⚠ THE #R551 SHAPE: A READER READING A FIELD NOBODY WROTE. This round moved a dozen new facts
   from the model into the answer text — the peak's error bar, whether the zones are statutory, the
   integrated first-year dose, what left the domain. A single typo in one of those names is invisible
   at runtime (`undefined` renders as nothing or as "undefined") and no other test would see it,
   because the answer text is only ever built inside an Atlas turn.
   BOTH SIDES ARE DERIVED, neither is a hand-written list: the produced set is parsed out of the
   object `run()` actually returns, the consumed set out of the switch case that actually reads it. */
test('R568: every field the answer reads is a field the model returns', async () => {
  const acorn = await import('acorn');
  const walk = await import('acorn-walk');
  const parse = (p) => acorn.parse(read(p), { ecmaVersion: 'latest', sourceType: 'module' });

  let produced = null;
  walk.simple(parse('js/sims.js'), {
    ObjectExpression(n) {
      const keys = n.properties.filter((p) => p.key).map((p) => p.key.name || p.key.value);
      if (keys.includes('ok') && keys.includes('peakKBqM2')) produced = new Set(keys);
    },
  });
  assert.ok(produced && produced.size > 30, 'found the success object run() returns');

  let node = null;
  walk.full(parse('js/atlas-console.js'), (n) => {
    if (n.type === 'SwitchCase' && n.test && n.test.value === 'radiationSim') node = n;
  });
  assert.ok(node, 'found the radiation case in the console');
  const consumed = new Set();
  walk.simple(node, {
    MemberExpression(m) {
      if (m.object.type === 'Identifier' && m.object.name === 'r' && !m.computed) consumed.add(m.property.name);
    },
  });
  /* `reason` belongs to the failure shape `{ok:false, reason}`, which the same variable carries. */
  const missing = [...consumed].filter((k) => k !== 'reason' && !produced.has(k));
  assert.deepEqual(missing, [], 'the answer reads these, and run() returns none of them:\n' + missing.join('\n'));
  /* …and the facts this round exists to report must actually reach the reader. */
  for (const k of ['peakWellSampled', 'peakRelSE', 'firstYearMSv', 'externalMeaningful', 'zonesAreLegal', 'escapedMassFrac', 'airborneFrac']) {
    assert.ok(consumed.has(k), `the answer must say ${k} — it is one of the things the old model could not`);
  }
});

test('R568: the model module is pure — no DOM, no window, no language registry', () => {
  /* EVALUATED: a whole run — field, particles, report, zones, dose — is made with each of the four
     page-only globals installed as a TRAP on globalThis. A worker has none of them, so any reach the
     model makes (directly, through an alias, or with a `typeof` probe) is recorded here, and the
     reach that a text search can miss is the one that would break the worker. The traps are removed
     in `finally`, so no other test in this file sees them. */
  const NAMES = ['document', 'window', 'IntMapLang', 'requestAnimationFrame'];
  const reached = [];
  for (const g of NAMES) {
    assert.equal(Object.getOwnPropertyDescriptor(globalThis, g), undefined, `${g} is already defined in this process`);
    Object.defineProperty(globalThis, g, { configurable: true, get() { reached.push(g); return undefined; } });
  }
  try {
    const F = field({ hours: 12 });
    const r = run(F, { hours: 6, particles: 300 });
    RAD.report(r, 'cs137'); RAD.zonesFor('i131'); RAD.doseRate(1e6, 'cs137'); RAD.doseIntegralHours('cs137', 8766);
    RAD.sourceTerm('chernobyl', 'cs137'); RAD.resolveStart(['2026-09-09T00:00'], '2026-09-09T00:10:00Z');
  } finally {
    for (const g of NAMES) delete globalThis[g];
  }
  assert.deepEqual([...new Set(reached)], [], 'js/radiation-model.js reached for page-only globals — it runs in a worker');
});

/* ══════════════════ #R585 — the nuclear ledger ══════════════════ */
const NPP = JSON.parse(R('data/npp.json'));

/* The languages the product is READ in are not restated here: they are the
   locale files themselves (js/locales/pages.<code>.js — the same directory
   js/locale-boot.js globs and scripts/i18n-langs.mjs generates from). A tenth
   language added to IntMap therefore arrives in these gates on its own. */
const UI_CODES = readdirSync(join(ROOT, 'js', 'locales'))
  .map((f) => /^pages\.([A-Za-z0-9-]+)\.js$/.exec(f)).filter(Boolean)
  .map((m) => m[1].toLowerCase()).sort();

/* The languages a record's own country is officially governed in, as the
   builder discovered them (Wikidata P37 → P424) and shipped them. Nothing here
   restates a country→language table: the file says which languages it treated
   as each country's own, and these gates hold it to that.

   Codes are compared by their BASE subtag. Wikidata files China's official
   language under `zh-cn` and Taiwan's under `zh-tw` (measured), while the labels
   themselves are filed under `zh`, `zh-Hans` and `zh-Hant` — the same language
   written with a different code, not a different language. */
const base = (c) => String(c).toLowerCase().split('-')[0];
const homeLangs = (p) => (NPP.officialLangs || {})[p.country] || [];

/* Which languages a record can be NAMED in. `labels` deliberately omits the
   label that is already `name`, so `nameLang` is what says which languages
   that one covers. A plain `zh` label is Chinese of unstated script (the
   builder keeps the code it came from rather than inventing one), so it
   answers a reader of either script. */
function namedIn(p) {
  const k = new Set([...(p.nameLang || []), ...Object.keys(p.labels || {})].map((s) => s.toLowerCase()));
  if (k.has('zh')) { k.add('zh-hans'); k.add('zh-hant'); }
  return k;
}
/* Every spelling the ledger holds for one site — the exact set js/sims.js
   indexes to answer a reader who types a name. */
const spellings = (p) => [p.name, ...Object.values(p.labels || {}), ...(p.alias || [])];

/* ── ① the file is the format the program expects ────────────────────────── */
test('#R585 ① data/npp.json is a v1 registry with a generation timestamp', () => {
  assert.equal(NPP.v, 1);
  assert.ok(Array.isArray(NPP.plants) && NPP.plants.length, 'plants[] must be a non-empty array');
  assert.ok(Array.isArray(NPP.sources) && NPP.sources.length, 'sources[] must name where the records came from');
  assert.ok(!Number.isNaN(Date.parse(NPP.generated)), 'generated must be a parseable timestamp: ' + NPP.generated);
  for (const s of NPP.sources) {
    for (const k of ['id', 'licence', 'url', 'count']) assert.ok(s[k] != null, 'source ' + s.id + ' is missing ' + k);
  }
  /* Every record says which of those sources it came from — a second upstream
     under a second licence must not become invisible once merged in. */
  const known = new Set(NPP.sources.map((s) => s.id));
  for (const p of NPP.plants) assert.ok(known.has(p.src), p.id + ' cites an undeclared source: ' + p.src);
});

/* ── ② every coordinate is a coordinate ──────────────────────────────────── */
test('#R585 ② coordinates are in range and no record sits at Null Island', () => {
  const VOCAB = new Set(['operational', 'shutdown', 'under-construction', 'planned', 'decommissioned', 'cancelled', 'unknown']);
  for (const p of NPP.plants) {
    assert.ok(typeof p.name === 'string' && p.name.trim(), p.id + ' has no name');
    assert.ok(Number.isFinite(p.lat) && p.lat >= -90 && p.lat <= 90, p.id + ' lat out of range: ' + p.lat);
    assert.ok(Number.isFinite(p.lon) && p.lon >= -180 && p.lon <= 180, p.id + ' lon out of range: ' + p.lon);
    /* 0,0 is in the Gulf of Guinea. A nuclear facility there is a missing value
       that survived as a number, which is exactly what a range check misses. */
    assert.ok(!(p.lat === 0 && p.lon === 0), p.id + ' sits at 0,0 — that is a dropped coordinate, not a place');
    assert.ok(VOCAB.has(p.status), p.id + ' has a status outside the product vocabulary: ' + p.status);
    /* An unrecognised upstream state must arrive as "unknown", never as a raw QID. */
    assert.ok(!/^Q\d+$/.test(String(p.status)), p.id + ' leaks a Wikidata QID as its status');
  }
});

/* ── ③ the ledger answers for everything the plume model already promises ─── */
test('#R585 ③ every site js/sims.js still hard-codes is present in the ledger', () => {
  const src = R('js/sims.js');
  const block = /const\s+SITES\s*=\s*\[([\s\S]*?)\n\s*\];/.exec(src);
  if (!block) return;   /* the hand-written table is gone — that was the point of R585 */
  const rows = [...block[1].matchAll(/\{\s*re:\s*\/((?:[^/\\]|\\.)+)\/([a-z]*)\s*,/g)];
  assert.ok(rows.length, 'js/sims.js declares SITES but no entry could be parsed — the gate would pass blind');
  /* Every spelling the ledger can be asked with, in every language — not just
     the English label. The hand-written table answered 「福島第一」 and
     «Чернобыльская АЭС» too, and a replacement that only answers in English
     would be a smaller product, not a better-sourced one. */
  const names = NPP.plants.flatMap((p) => [...spellings(p), ...((p.also || []).map((a) => a.name))]);
  for (const [, body, flags] of rows) {
    const re = new RegExp(body, flags);
    assert.ok(names.some((n) => re.test(n)), 'no ledger record matches the hard-coded site /' + body + '/');
  }
  /* ⚠ No distance assertion, deliberately. MEASURED 2026-09-09: sims.js places
     Bushehr at 52.23°E, 130.8 km from the plant. Wikidata (50.887) and OSM
     (50.885, relation نیروگاه اتمی بوشهر) agree with each other and not with the
     typed list — the hand-written side is the wrong one, so it cannot be the
     reference the ledger is measured against. */
});

/* ── ④ a rebuild that loses the world is not a rebuild ───────────────────── */
test('#R585 ④ the ledger still covers the world', () => {
  /* MEASURED 2026-09-09 by scripts/build-npp-registry.mjs: 638 sites, of which
     211 operational, across 57 ISO countries. The floors below sit at roughly
     two thirds of each — low enough that ordinary Wikidata churn (an item
     retyped, a coordinate removed) never fires them, high enough that a broken
     query, a truncated fetch or a scope class that was renamed does. They
     expire the day the upstream scope changes shape: rerun the builder and read
     its printed census before moving them. The independent floor is the world
     itself — there are ~440 power reactors at 200+ sites, plus research
     reactors and fuel-cycle plants, so 400 is under any honest count. */
  assert.ok(NPP.plants.length >= 400, 'only ' + NPP.plants.length + ' sites — the build lost a large share');
  const operational = NPP.plants.filter((p) => p.status === 'operational').length;
  assert.ok(operational >= 140, 'only ' + operational + ' operational sites');
  const countries = new Set(NPP.plants.map((p) => p.country).filter(Boolean));
  assert.ok(countries.size >= 38, 'only ' + countries.size + ' countries represented');
  const sum = NPP.sources.reduce((n, s) => n + s.count, 0);
  assert.equal(sum, NPP.plants.length, 'sources[].count must account for every record');
});

/* ── ⑤ one point, one pin ────────────────────────────────────────────────── */
test('#R585 ⑤ no two records share a point', () => {
  /* 0.001° ≈ 110 m: inside the footprint of one site, far below the spacing of
     two distinct ones. Wikidata gives co-located items the same coordinate
     (Sizewell A/B/C, Chooz A/B, Tokai / Tokai No.2); the builder folds those
     into one site and keeps the rest in `also`, so a collision here means the
     fold stopped working and the map would carry a pin the reader cannot click. */
  const seen = new Map();
  for (const p of NPP.plants) {
    const k = Math.round(p.lat * 1000) + '/' + Math.round(p.lon * 1000);
    const prev = seen.get(k);
    assert.ok(!prev, 'co-located records: ' + prev + ' and ' + p.id + ' at ' + p.lat + ',' + p.lon);
    seen.set(k, p.id);
  }
});

/* ── ⑥ the facts are facts, or they are null ─────────────────────────────── */
test('#R585 ⑥ optional fields are asserted values, never filler', () => {
  const ISO = /^[A-Z]{2}$/;
  const DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;   /* Wikidata states years and months too; a day is never invented */
  let dated = 0, powered = 0;
  for (const p of NPP.plants) {
    if (p.country != null) assert.ok(ISO.test(p.country), p.id + ' country is not ISO 3166-1 alpha-2: ' + p.country);
    for (const k of ['start', 'end']) {
      if (p[k] == null) continue;
      assert.ok(DATE.test(p[k]), p.id + ' ' + k + ' is not a Wikidata-precision date: ' + p[k]);
      dated++;
    }
    if (p.netMW != null) { assert.ok(Number.isFinite(p.netMW) && p.netMW > 0, p.id + ' netMW: ' + p.netMW); powered++; }
    if (p.units != null) assert.ok(Number.isInteger(p.units) && p.units > 0, p.id + ' units: ' + p.units);
    if (p.end != null && p.start != null && p.end.length >= 4 && p.start.length >= 4) {
      assert.ok(p.end.slice(0, 4) >= p.start.slice(0, 4), p.id + ' ends before it starts: ' + p.start + ' → ' + p.end);
    }
  }
  /* The optional fields have to be populated for a real share of the ledger —
     a build that silently stopped reading claims would otherwise pass every
     check above by shipping nulls. MEASURED 2026-09-09: 286 netMW ratings and 542 service dates. */
  assert.ok(powered >= 200, 'only ' + powered + ' records carry a power rating');
  assert.ok(dated >= 300, 'only ' + dated + ' service dates were read');
});

/* ── ⑦ the names are names, and each one is stored once ──────────────────── */
test('#R585 ⑦ labels and aliases are well-formed and never repeat the name', () => {
  assert.ok(UI_CODES.length, 'no js/locales/pages.*.js found — the language list could not be discovered');
  for (const p of NPP.plants) {
    /* Every language code a record may carry: the ones the product is READ in,
       plus the ones the country it stands in is GOVERNED in. Anything else is a
       code nothing declared, which is how a stray label reaches the reader. */
    const known = new Set([...UI_CODES, 'zh', ...homeLangs(p).map((c) => c.toLowerCase())]);
    assert.ok(Array.isArray(p.nameLang) && p.nameLang.length, p.id + ' does not say which language its name is in');
    for (const c of p.nameLang) assert.ok(known.has(String(c).toLowerCase()), p.id + ' nameLang has a code neither the product nor ' + p.country + ' declares: ' + c);
    const L = p.labels || {};
    const seen = new Set([p.name]);
    for (const [c, v] of Object.entries(L)) {
      assert.ok(known.has(c.toLowerCase()), p.id + ' has a label in a language neither the product nor ' + p.country + ' declares: ' + c);
      assert.ok(typeof v === 'string' && v.trim(), p.id + ' label ' + c + ' is empty');
      /* A label equal to the name is not a second name, it is the same string
         twice — 638 sites × nine languages of that is size the reader downloads
         for nothing. `nameLang` records that language instead. Two different
         LANGUAGES that happen to agree (18 cases, measured) are NOT a
         duplicate: a lookup map has to answer for the language it is asked. */
      assert.ok(v !== p.name, p.id + ' repeats its name as label ' + c + ' instead of naming it in nameLang');
      seen.add(v);
    }
    /* `zh` means "Chinese, script not stated" and earns its place only where no
       script-specific label exists (272 items, measured). Where one does, the
       two strings are the same bytes twice. */
    if (L.zh) assert.ok(L.zh !== L['zh-Hans'] && L.zh !== L['zh-Hant'], p.id + ' carries zh identical to its script-specific Chinese label');
    for (const a of (p.alias || [])) {
      assert.ok(typeof a === 'string' && a.trim(), p.id + ' has an empty alias');
      assert.ok(!seen.has(a), p.id + ' repeats ' + JSON.stringify(a) + ' as an alias');
      seen.add(a);
    }
  }
});

/* ── ⑧ the ledger answers in the language the reader is reading in ───────── */
test('#R585 ⑧ every UI language can name a real share of the ledger', () => {
  /* MEASURED 2026-09-09 over the 638 shipped sites, counted the way `namedIn`
     counts (a plain `zh` label answers both scripts): en 576, fr 466, de 458,
     ja 389, ru 337, zh-Hans 276, zh-Hant 265, es 258, ko 71. The builder
     prints the same census, per label code, at the end of a build.
     Korean is the thinnest, and the floor sits below it rather
     than below each language separately: what this gate exists to catch is a
     BUILD that stopped asking for a language (the wbgetentities `languages`
     parameter is one string — lose it and a language goes to zero), not the
     slow drift of how much of Wikidata has been translated. A per-language
     table of today's numbers would be that drift written down as a demand.
     EXPIRY: the day a UI language is added it starts at zero — read the census
     from a fresh build before assuming this floor still fits. */
  const FLOOR = 50;
  for (const c of UI_CODES) {
    const n = NPP.plants.filter((p) => namedIn(p).has(c)).length;
    assert.ok(n >= FLOOR, 'only ' + n + ' sites can be named in ' + c + ' — a language stopped being fetched');
  }
  /* The aliases are the spellings people actually type («ЧАЭС», 福島第一原発,
     Windscale) and they are the half of the index a label cannot supply.
     MEASURED 2026-09-09: 1,978 aliases over 445 sites. The floor is two thirds
     of that, for the same reason as ④: churn must not fire it, a build that
     stopped asking for `aliases` must. */
  const aliases = NPP.plants.reduce((n, p) => n + ((p.alias || []).length), 0);
  assert.ok(aliases >= 1200, 'only ' + aliases + ' aliases — the alias fetch is failing');
});

/* ── ⑩ a plant is called something in the country it stands in ───────────── */
test('#R585 ⑩ the ledger holds each site\'s name in the language of its own country', () => {
  /* ⑧ measures the nine languages the product is READ in. That is not the same
     question as this one, and the difference had a measured cost: with only the
     nine, «чорнобиль» — Ukrainian, the language of the country Chornobyl NPP
     stands in — could not be resolved in this ledger at all, while the twelve
     hand-written regular expressions it replaced could answer it. The name a
     place is known by at home is the name of the place, not a translation of it.

     The country→language join is the builder's (P17 → P37 → P424) and is shipped
     as `officialLangs`; this gate asks whether the labels actually arrived. */
  const OL = NPP.officialLangs || {};
  /* MEASURED 2026-09-09: 57 countries occur in the ledger, every one of them
     with at least one official language. The floor is well under that so that a
     country losing its last record never fires it, while an empty or missing map
     — which would make everything below vacuous — does. */
  assert.ok(Object.keys(OL).length >= 30, 'officialLangs names only ' + Object.keys(OL).length + ' countries — the P37/P424 join did not run');
  for (const [c, langs] of Object.entries(OL)) {
    assert.ok(Array.isArray(langs) && langs.length, c + ' is declared with no official language');
    for (const l of langs) assert.ok(/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(l), c + ' declares something that is not a language code: ' + JSON.stringify(l));
  }

  const homeable = NPP.plants.filter((p) => homeLangs(p).length);
  const named = (p) => {
    const has = new Set([...namedIn(p)].map(base));
    return homeLangs(p).some((c) => has.has(base(c)));
  };
  /* MEASURED 2026-09-09 by scripts/build-npp-registry.mjs (it prints this
     census): 631 of the 638 sites stand in a country with a declared official
     language, and 569 of those — 90.2% — carry that language's label. The
     missing 62 are dominated by 51 in the US, whose P37 in Wikidata is five
     territorial languages and NOT English, so "not named at home" there is a
     property of the upstream statement, not a gap in the fetch. The floor is
     75%, below the drift such upstream oddities cause and far above what a
     broken fetch leaves. EXPIRES when the builder's census moves: rerun it and
     read the printed percentage before touching this number. */
  const rate = homeable.filter(named).length / (homeable.length || 1);
  assert.ok(homeable.length >= 400, 'only ' + homeable.length + ' sites have a country with a declared official language');
  assert.ok(rate >= 0.75, 'only ' + (100 * rate).toFixed(1) + '% of sites carry a label in an official language of their own country');

  /* The sharp half of the question. Most nuclear countries are governed in one
     of IntMap's nine languages, so the rate above stays high even if the extra
     fetch dies completely. These are the sites whose home language the product
     does NOT read — 81 of them, of which 78 named (96.3%, measured). If the
     P37/P424 fetch, the language paging or the per-record filter breaks, this
     number goes to zero and nothing else in the file notices. */
  const foreign = homeable.filter((p) => !homeLangs(p).some((c) => UI_CODES.some((u) => base(u) === base(c))));
  assert.ok(foreign.length >= 40, 'only ' + foreign.length + ' sites are named at home in a language the product does not read — the join lost countries');
  const ok = foreign.filter(named).length;
  assert.ok(ok >= 50, 'only ' + ok + ' of ' + foreign.length + ' sites carry a label in a home language outside the nine UI languages — that fetch is not arriving');
  /* …and the observed failure itself, kept as the one case-specific line in
     this file (`.agents/rules/no-ad-hoc-hardcoding.md` §6). «чорнобиль» is the
     spelling the deleted hand-written table in js/sims.js carried and the ledger
     could not resolve on 2026-09-09; it is not derivable from anything still in
     the tree, because that table is gone. The rate above cannot see it — Ukraine
     is 7 of 81 sites, well inside the slack. It asserts no QID: whatever record
     stands in Ukraine and is spelled with that stem must exist. Remove it when
     the per-country rates below are measured per country rather than in
     aggregate, which would cover this case structurally. */
  const uk = NPP.plants.filter((p) => p.country === 'UA' && spellings(p).some((s) => /чорнобиль/i.test(s)));
  assert.ok(uk.length, 'no site in Ukraine can be reached by the Ukrainian spelling чорнобиль');
});

/* ── ⑨ the sites the product itself names to every reader ────────────────── */
test('#R585 ⑨ the plume presets resolve to a site nameable in every UI language', () => {
  /* js/sims.js still hard-codes the source-term presets (`SOURCES`) with a
     coordinate each: those are the sites the product puts in front of EVERY
     reader, in every language, before anybody has typed anything. So they are
     the sites for which "the reader can name it in their own language" is not
     a statistic but a requirement — and, like ③, the requirement is READ out
     of js/sims.js, so it disappears together with the table it belongs to. */
  const src = R('js/sims.js');
  const blk = /const\s+SOURCES\s*=\s*\{([\s\S]*?)\n/.exec(src);
  if (!blk) return;
  const presets = [...blk[1].matchAll(/'([a-z0-9_-]+)'\s*:\s*\{[^{}]*?ll\s*:\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/g)];
  if (!presets.length) return;   /* the presets no longer carry coordinates */
  for (const [, key, lon, lat] of presets) {
    let best = null, bd = Infinity;
    for (const p of NPP.plants) {
      const dy = (p.lat - +lat) * 111.32, dx = (p.lon - +lon) * 111.32 * Math.cos(+lat * Math.PI / 180);
      const d = Math.hypot(dx, dy);
      if (d < bd) { bd = d; best = p; }
    }
    /* 5 km: MEASURED 2026-09-09, both presets land 0.05 km from their ledger
       record, so this is two orders of magnitude of slack for a coordinate
       that was typed by hand — and still far tighter than the distance to the
       next nuclear site in either country. */
    assert.ok(best && bd <= 5, 'preset ' + key + ' has no ledger site within 5 km (nearest ' + (best && best.id) + ' at ' + bd.toFixed(1) + ' km)');
    const langs = namedIn(best);
    const missing = UI_CODES.filter((c) => !langs.has(c));
    assert.equal(missing.join(','), '', 'preset ' + key + ' → ' + best.id + ' (' + best.name + ') cannot be named in: ' + missing.join(','));
    /* …and it must carry the spellings a reader types, which is what the
       twelve hand-written regular expressions used to hold for these sites. */
    assert.ok(spellings(best).length >= 5, 'preset ' + key + ' → ' + best.id + ' carries only ' + spellings(best).length + ' spellings');
  }
});
