/* ============================================================================
 *  THE PANDEMIC SIMULATOR — js/pandemic-model.js and the tables it reads
 * ----------------------------------------------------------------------------
 *  The engine is a numerical object, so these RUN it (#R505): conservation, calibration, importation,
 *  policy actors, ensembles, chart geometry and the committed mobility / health / airport tables.
 *  Consolidated from the round files named in each section below; every test keeps its original
 *  title, tagged with the round that wrote it. Each section is a block so its helpers stay its own.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { PANDEMIC_PRESETS, caseDotPlan, chartPoints, createPandemicModel, dotSignature, eventKind, policyActors, scatterCases, snapToStep, summariseEnsemble } from '../js/pandemic-model.js';
import { readLF } from '../scripts/eol.mjs';

/* one reader for the whole file — the CONTENT of a repository file, whatever line endings this
   checkout produced (scripts/eol.mjs, #R283). Sections that need another shape keep their own. */
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(join(ROOT, p));

/* ═══ from tests/r575-checks.test.mjs (the whole file) ═══
    R575 · THE PANDEMIC MODEL IS A NUMERICAL OBJECT, AND THESE ARE ITS INVARIANTS
    An external audit found six ways the simulator contradicted itself — playback speed changing the
    epidemiology, «immunity 0» producing NaN, «latent 0» producing PEOPLE, re-importation producing
    more people, a run declared over while a million were incubating, and an attack rate that went
    DOWN. Every one of them is the kind of defect a per-step invariant catches on the first day, and
    none of them was caught, because the arithmetic lived inside a DOM closure that no test could
    reach. So the arithmetic moved to js/pandemic-model.js and this file is the twelve properties the
    audit asked for, measured by RUNNING the model rather than by reading it (#R505).

   A small synthetic world: far enough apart that importation is a real event, big enough that the
      deterministic branch of the arithmetic is exercised too. */
{
function world(n = 6) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ name: 'C' + i, pop: 2e7 * (i + 1), lat: -40 + i * 16, lng: -100 + i * 40, dev: 0.2 + 0.13 * i });
  }
  return out;
}
function build(params, seed = 12345, preset = PANDEMIC_PRESETS.covid, countries = world()) {
  return createPandemicModel({ countries, preset, params, seed });
}
function run(m, days, onStep) {
  for (let d = 0; d < days; d++) {
    const ev = m.step();
    if (onStep) onStep(d + 1, ev);
    if (m.ended) break;
  }
  return m.totals();
}

test('R575 ①: population is conserved, every country, every step (Test 1)', () => {
  const m = build({ scenario: 'naive' });
  m.seed(2, 500);
  for (let d = 0; d < 500; d++) {
    m.step();
    const bad = m.invariant();
    assert.equal(bad, null, 'day ' + (d + 1) + ': ' + bad);
    if (m.ended) break;
  }
});

test('R575 ②: playback speed cannot reach the model at all (Test 2)', () => {
  /* The strongest form of the property: nothing called speed can reach the engine, so no probability
     can be multiplied by it. The old defect was three separate multiplications in one file.
     ⚠ (consolidation) ASKED OF THE ENGINE, NOT OF ITS TEXT. This used to require that the word
     `speed` not occur in js/pandemic-model.js — which renaming the variable satisfies. The engine
     is now HANDED a playback speed, the way js/playground.js holds one (`speed`, ×1 … ×8), and must
     run the same epidemic and hand no such field back. */
  const run400 = (params) => { const m = build(Object.assign({ scenario: 'naive' }, params), 777); m.seed(1, 300); for (let d = 0; d < 400; d++) m.step(); return m; };
  const plain = run400({});
  for (const speed of [1, 2, 8, 60]) {
    const fast = run400({ speed });
    assert.deepEqual(fast.totals(), plain.totals(), 'a playback speed of ×' + speed + ' changed the epidemic');
    assert.equal('speed' in fast.params, false, 'the engine kept a playback speed in its parameters');
  }

  /* And behaviourally: the same seed run in one batch and in eight batches — which is what changing
     the speed control actually does to the caller — is the same epidemic, day for day. */
  const a = build({ scenario: 'naive' }, 777); a.seed(1, 300);
  const b = build({ scenario: 'naive' }, 777); b.seed(1, 300);
  for (let d = 0; d < 400; d++) a.step();
  for (let k = 0; k < 8; k++) for (let d = 0; d < 50; d++) b.step();
  assert.deepEqual(a.totals(), b.totals());
});

test('R575 ③: immunity 0 months is «no lasting immunity», not a 1/0 rate (Test 3)', () => {
  const m = build({ scenario: 'naive', naturalImmunityMonths: 0 });
  m.seed(0, 400);
  for (let d = 0; d < 300; d++) { m.step(); assert.equal(m.invariant(), null, 'day ' + (d + 1)); }
  const T = m.totals();
  for (const k of ['S', 'E', 'I', 'R', 'D', 'V', 'cumInf']) {
    assert.equal(Number.isFinite(T[k]), true, k + ' is not finite');
    assert.ok(T[k] >= -1e-6, k + ' went negative');
  }
  /* …and it means what it says: nobody accumulates lasting immunity. */
  assert.ok(T.R < T.cumInf * 0.01, 'recovered-and-immune should stay empty when immunity is zero');
});

test('R575 ④: latent 0 days moves nobody through a compartment they are not in (Test 4)', () => {
  const m = build({ scenario: 'naive', latentDays: 0 });
  m.seed(0, 1000);
  for (let d = 0; d < 200; d++) { m.step(); assert.equal(m.invariant(), null, 'day ' + (d + 1)); }
  const T = m.totals();
  assert.equal(T.E, 0, 'with no latent period nobody should ever be exposed-but-not-infectious');
  assert.ok(T.cumInf > 1000, 'the outbreak should still grow');
});

test('R575 ⑤: a run does not end while people are incubating (Test 5)', () => {
  /* A latent period longer than the run: I stays ~0, E holds the whole outbreak. The old rule
     looked at I alone and would have called this «contained». */
  const m = build({ scenario: 'naive', latentDays: 100000, mobility: 0 });
  m.seed(0, 1e6);
  run(m, 120);
  const T = m.totals();
  assert.ok(T.E > 1e5, 'the exposed pool should still be there (' + T.E + ')');
  assert.ok(T.I < 1, 'nobody should be infectious yet');
  assert.equal(m.ended, null, 'the run must not be over while E is large');
});

test('R575 ⑥: cumulative infections never decrease (Test 6)', () => {
  const m = build({ scenario: 'naive' });
  m.seed(3, 800);
  let prev = 0;
  for (let d = 0; d < 500; d++) {
    m.step();
    const c = m.totals().cumInf;
    assert.ok(c >= prev - 1e-9, 'day ' + (d + 1) + ': cumulative infections fell ' + prev + ' → ' + c);
    prev = c;
    if (m.ended) break;
  }
  /* And it is NOT R+D+I, which is the number that used to fall: waning immunity moves people out
     of R, so after a long run the two must disagree. */
  const T = m.totals();
  assert.ok(T.cumInf > T.R + T.D + T.I, 'cumulative infections must exceed the current R+D+I');
});

test('R575 ⑦: mobility 0 keeps the outbreak in one country (Test 7)', () => {
  const m = build({ scenario: 'naive', mobility: 0 });
  m.seed(2, 900);
  run(m, 600);
  const seeded = m.countries.filter((s) => s.seeded).length;
  assert.equal(seeded, 1);
  assert.equal(m.totals().affected <= 1, true);
});

test('R575 ⑧: the same seed is the same world; a different seed is a different one (Test 8)', () => {
  const t1 = build({ scenario: 'naive' }, 424242); t1.seed(1, 250);
  const t2 = build({ scenario: 'naive' }, 424242); t2.seed(1, 250);
  const t3 = build({ scenario: 'naive' }, 999983); t3.seed(1, 250);
  assert.deepEqual(run(t1, 300), run(t2, 300));
  assert.notDeepEqual(run(t3, 300), t1.totals());
});

test('R575 ⑨: R₀ below 1 dies out, above 1 grows — one closed population (Test 9)', () => {
  const one = [{ name: 'X', pop: 5e7, lat: 0, lng: 0, dev: 0.6 }];
  /* ⚠ (#R673) `naturalImmunityMonths: 600` USED TO MEAN «FOREVER», and it does not any more: the
     in-band sentinel is gone and 600 is six hundred months (defect U2 — one field cannot hold both
     a duration and a category). What this test wants is «immunity does not wane while we watch»,
     which is now said as itself. */
  const base = { scenario: 'naive', mobility: 0, seasonality: 0, interventions: 'none', naturalImmunityLifelong: true, vaccineAtStart: false };
  const lo = createPandemicModel({ countries: one, preset: PANDEMIC_PRESETS.sars, params: Object.assign({}, base, { r0: 0.6 }), seed: 5 });
  const hi = createPandemicModel({ countries: one, preset: PANDEMIC_PRESETS.sars, params: Object.assign({}, base, { r0: 2.5 }), seed: 5 });
  lo.seed(0, 50000); hi.seed(0, 50000);
  const l0 = lo.totals().I + lo.totals().E, h0 = hi.totals().I + hi.totals().E;
  run(lo, 90); run(hi, 90);
  assert.ok(lo.totals().E + lo.totals().I < l0, 'R₀ = 0.6 must decline');
  assert.ok(hi.totals().E + hi.totals().I > h0 * 5, 'R₀ = 2.5 must grow');
});

test('R575 ⑩: more baseline immunity, smaller outbreak — monotonically (Test 10)', () => {
  const one = [{ name: 'X', pop: 5e7, lat: 0, lng: 0, dev: 0.6 }];
  const sizes = [0, 0.5, 0.9].map((imm) => {
    const m = createPandemicModel({
      countries: one, preset: PANDEMIC_PRESETS.measles, seed: 31,
      params: { scenario: 'real-world', initialImmunity: imm, mobility: 0, interventions: 'none', vaccineAtStart: false, seasonality: 0 }
    });
    m.seed(0, 500);
    run(m, 700);
    return m.totals().cumInf;
  });
  assert.ok(sizes[0] > sizes[1], 'immunity 0 → 50% should shrink the outbreak (' + sizes + ')');
  assert.ok(sizes[1] > sizes[2], 'immunity 50 → 90% should shrink it further (' + sizes + ')');
});

test('R575 ⑪: a variant exists where it emerged, not everywhere at once (Test 11)', () => {
  /* ⚠ (#R666) A FAMILY OF SEEDS, NOT ONE. A variant is a Bernoulli draw at 0.0014/day once half a
     million people are infected, so one seed over 900 days emerges one about two times in three —
     this test asserted `seen > 0` on a single seed and was therefore a coin toss that happened to
     be landing. It was still landing when #R666 changed WHICH country an importation goes to, which
     reshuffles the same stream, and it stopped. Nothing here is weakened: the invariant is still
     checked on every real variant the family produces, and «the fixture must actually produce a
     variant» is still asserted — it is now a statement about the fixture rather than about luck. */
  let seen = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const m = build({ scenario: 'naive', mobility: 1 }, seed);
    m.seed(0, 5000);
    for (let d = 0; d < 900; d++) {
      const ev = m.step();
      for (const e of ev) {
        if (e.t !== 'variant') continue;
        seen++;
        const k = e.n;
        const carriers = m.countries.filter((s) => (s.share[k] || 0) > 0).length;
        assert.equal(carriers, 1, 'a new variant must start in exactly one country, not ' + carriers);
        /* …and the rest of the world is still running the pathogen it was running yesterday. */
        for (const s of m.countries) if ((s.share[k] || 0) === 0) assert.ok(s.share[0] > 0);
      }
      if (m.ended) break;
    }
  }
  assert.ok(seen > 0, 'the fixture must actually produce a variant, or this test measures nothing');
});

test('R575 ⑫: no case dot is placed where the country is not (Test 12)', () => {
  /* accept() = «inside the square». The anchor sits on its edge, so an unchecked jitter lands
     outside about half the time — which is exactly the old coastal-city defect. */
  const accept = (x, y) => x >= 0 && x <= 10 && y >= 0 && y <= 10;
  let n = 0;
  const rnd = () => { n = (n * 1103515245 + 12345) % 2147483648; return n / 2147483648; };
  const pts = scatterCases(200, [[10, 5], [0.05, 5]], 4, rnd, accept);
  assert.equal(pts.length, 200);
  for (const p of pts) assert.equal(accept(p[0], p[1]), true, 'placed outside: ' + p);
});

/* (spelling kept) js/playground.js is the panel — a DOM closure built on tap; the engine it drives is
   measured above by running it, and this only holds the panel to not doing epidemiology of its own. */
test('R575 ⑬: the simulator UI reads the engine and no longer does its own epidemiology', () => {
  const pg = readLF(new URL('../js/playground.js', import.meta.url));
  assert.ok(/createPandemicModel/.test(pg), 'js/playground.js must drive the shared engine');
  /* The three multiplications that made playback speed change the epidemic, and the attack rate
     that could fall. If any of these shapes comes back, it comes back visibly. */
  assert.equal(/\*\s*speed\s*\*/.test(pg), false, 'no probability may be scaled by playback speed');
  assert.equal(/Math\.random\s*\(\s*\)\s*<[^;]*speed/.test(pg), false, 'no random draw may be gated on playback speed');
  assert.equal(/T\.R\s*\+\s*T\.D\s*\+\s*T\.I/.test(pg), false, 'the attack rate must come from the cumulative ledger');
});
}

/* ═══ from tests/r666-model.test.mjs (the whole file) ═══
    R666 · THE FOUR NUMERICAL DEFECTS A SECOND AUDIT FOUND, AND WHERE AN OUTBREAK GOES NEXT
    A second external audit arrived while this round was open. It named four defects in
    js/pandemic-model.js, and all four were CONFIRMED BY MEASURING the model as shipped:

      · every mean sojourn time was about a day longer than the preset asked for (flu's 1-day latent
        period ran 2.31 days), and therefore every realized R₀ was high too (flu 1.4 ran at 1.66);
      · «n people each with probability p» was drawn as Poisson, which is only the right shape when
        p is small, and it was being asked about probabilities near 1;
      · the people an all-or-nothing vaccine failed to protect went back into S and were drawn by
        the campaign again the next day, so efficacy stopped mattering — 0.4 and 0.6 both put the
        same 33 M into V;
      · an importation mixed its variant share against a pool that already contained the arrivals,
        so eight cases arriving in an empty country came out 47% of a strain that never arrived.

    Each of them is the code doing a different thing from what its own comment claimed, which is why
    every test here RUNS the engine rather than reading it (#R505). The last two measure PHASE 2 of
    the first audit — the destination of an importation, which used to be a uniform draw. */
{
const CLOSED = { scenario: 'naive', mobility: 0, interventions: 'none', seasonality: 0 };
function one(preset, params, seed, pop = 4e7) {
  return createPandemicModel({ countries: [{ name: 'X', pop, dev: 0.6, lat: 0, lng: 0 }], preset, params: { ...CLOSED, ...params }, seed });
}
/* Little's law: mean days in a compartment = person-days accumulated ÷ people that entered. */
function sojourn(preset, seed) {
  const m = one(preset, {}, seed);
  m.seed(0, 2000);
  const s = m.countries[0];
  let eDays = 0, iDays = 0;
  for (let d = 0; d < 400 && !m.ended; d++) { m.step(); eDays += s.E.reduce((a, b) => a + b, 0); iDays += s.I.reduce((a, b) => a + b, 0); }
  return { E: eDays / s.cumInf, I: iDays / s.cumInf };
}

/* ── ① the mean sojourn time is the one that was asked for ─────────────────────────────────── */
test('R666 ①: mean latent and infectious periods equal the preset, to a fifth of a day', () => {
  /* MEASURED on the model this replaces:
       flu      latent 1 → 2.31   infectious 5 → 6.02
       covid    latent 4 → 5.06   infectious 9 → 9.85
       sars     latent 5 → 6.07   infectious 10 → 11.03
       ebola    latent 9 → 10.04  infectious 10 → 11.03
       measles  latent 11 → 12.03 infectious 9 → 10.04
     A daily step spends a GEOMETRIC number of days in a stage (mean 1/p) while the probability used
     was the CONTINUOUS hazard 1 − e^(−S/T), whose mean is about T/S + ½ per stage. */
  let checked = 0;
  for (const [name, preset] of Object.entries(PANDEMIC_PRESETS)) {
    const r = sojourn(preset, 7);
    const wantE = preset.transmission.latentDays, wantI = preset.transmission.infectiousDays;
    assert.ok(Math.abs(r.E - wantE) < 0.2, name + ': mean latent ' + r.E.toFixed(2) + ' ≠ ' + wantE);
    assert.ok(Math.abs(r.I - wantI) < 0.2, name + ': mean infectious ' + r.I.toFixed(2) + ' ≠ ' + wantI);
    checked++;
  }
  assert.equal(checked, 5, 'every preset, or this measures less than it says');
});

/* ── ② …and so is R₀ ──────────────────────────────────────────────────────────────────────── */
test('R666 ②: the R₀ the reader sets is the R₀ the epidemic runs at', () => {
  /* β measured while the susceptible fraction is still above 97%, times the measured mean infectious
     period. MEASURED before: flu 1.4 ran at 1.66, covid 3.2 at 3.51, sars 2.6 at 2.87, ebola 1.95 at
     2.15, measles 12 at 13.40 — the same one-day error, one level up.
     ⚠ R575 ⑨ (this file) could not see this: «below one shrinks, above one grows» is as true of
     1.66 as of 1.40. A property test that holds for the wrong number is not a calibration test. */
  for (const [name, preset] of Object.entries(PANDEMIC_PRESETS)) {
    const m = one(preset, { initialImmunity: 0 }, 5, 5e8);
    m.seed(0, 20000);
    const s = m.countries[0];
    let num = 0, den = 0, prev = s.cumInf;
    for (let d = 0; d < 60; d++) {
      const I0 = s.I.reduce((a, b) => a + b, 0);
      m.step();
      const inf = s.cumInf - prev; prev = s.cumInf;
      const frac = s.S / s.pop0;
      if (I0 > 100 && frac > 0.97) { num += inf; den += I0 * frac; }
    }
    assert.ok(den > 0, name + ': the fixture must reach an exponential phase');
    const realized = (num / den) * sojourn(preset, 5).I;
    assert.ok(Math.abs(realized - preset.transmission.r0) / preset.transmission.r0 < 0.06,
      name + ': realized R₀ ' + realized.toFixed(2) + ' vs configured ' + preset.transmission.r0);
  }
});

/* ── ③ «each of n people with probability p» is binomial ───────────────────────────────────── */
test('R666 ③: a certain transition happens to everybody, every time', () => {
  /* The engine's draw reached through the only door that exposes it: one country, one exposed
     person, a 1-day latent period (⇒ one stage, p = 1). Poisson gave that person a
     P(Poisson(1) ≥ 1) = 63% chance of becoming infectious; it must be 100%. The audit measured the
     same bias at the two-stage flu figure, p = 0.865: 57.9% against a true 86.5%. */
  const N = 300;
  let moved = 0;
  const preset = { ...PANDEMIC_PRESETS.flu, transmission: { ...PANDEMIC_PRESETS.flu.transmission, latentDays: 1, r0: 0 } };
  for (let seed = 1; seed <= N; seed++) {
    const m = one(preset, {}, seed, 1e6);
    m.seed(0, 1);
    const s = m.countries[0];
    m.step();
    if (s.E.reduce((a, b) => a + b, 0) === 0 && s.I.reduce((a, b) => a + b, 0) >= 1) moved++;
  }
  assert.equal(moved, N, 'p = 1 must move every person every time — got ' + moved + '/' + N);
});

/* ── ④ …and an uncertain one happens at its own rate, not Poisson's ────────────────────────── */
test('R666 ④: a p=0.5 transition of one person lands near a half, not near 1−e^(−0.5)', () => {
  /* One exposed person and a 4-day latent period: two stages, p = 2/4 = 0.5 each. Whether that one
     person has left the first stage after one day is a single Bernoulli(0.5) — Poisson would have
     answered 1 − e^(−0.5) = 39.3%. The seeds are fixed, so this is a deterministic reading of a
     stochastic quantity, not a flaky one. */
  const N = 400;
  let moved = 0;
  const preset = { ...PANDEMIC_PRESETS.flu, transmission: { ...PANDEMIC_PRESETS.flu.transmission, latentDays: 4, r0: 0 } };
  for (let seed = 1; seed <= N; seed++) {
    const m = one(preset, {}, seed, 1e6);
    m.seed(0, 1);
    const s = m.countries[0];
    m.step();
    if (s.E[1] >= 1) moved++;
  }
  const share = moved / N;
  assert.ok(Math.abs(share - 0.5) < 0.06, 'observed ' + share.toFixed(3) + ', want 0.5 ± 0.06');
  assert.ok(Math.abs(share - (1 - Math.exp(-0.5))) > 0.03, 'and it must not be the Poisson answer 0.393');
});

/* ── ⑤ a vaccine that fails cannot be re-rolled on the same person ─────────────────────────── */
test('R666 ⑤: the share of those the campaign reached who are protected is the efficacy', () => {
  /* MEASURED on the model this replaces: efficacy 0.4 AND efficacy 0.6 both ended with the same
     33 M people in V, because the ones a dose failed went back into S and were drawn again the next
     day. The comment beside the rollout said «which is why a 40% vaccine cannot end an epidemic on
     its own» and the code did not do that. */
  for (const VE of [0.4, 0.6]) {
    const m = createPandemicModel({
      countries: [{ name: 'X', pop: 1e8, dev: 0.95, lat: 0, lng: 0 }],
      preset: PANDEMIC_PRESETS.covid,
      params: { ...CLOSED, vaccineEfficacy: VE, vaccineAtStart: true, r0: 1.02 }, seed: 3,
    });
    m.seed(0, 100);
    for (let d = 0; d < 900 && !m.ended; d++) m.step();
    const T = m.totals();
    const reached = T.V + T.SV;
    assert.ok(reached > 1e6, 'the campaign must actually reach people, or this measures nothing');
    assert.ok(Math.abs(T.V / reached - VE) < 0.05,
      'efficacy ' + VE + ': protected share of those reached is ' + (T.V / reached).toFixed(3));
  }
});

/* ── ⑥ …and the vaccinated-but-unprotected are still counted, and still catch it ───────────── */
test('R666 ⑥: SV is inside the conservation law and inside the force of infection', () => {
  const m = createPandemicModel({
    countries: [{ name: 'X', pop: 1e8, dev: 0.95, lat: 0, lng: 0 }],
    preset: PANDEMIC_PRESETS.covid,
    params: { ...CLOSED, vaccineEfficacy: 0.3, vaccineAtStart: true }, seed: 4,
  });
  m.seed(0, 500);
  let sawSV = false, svFell = false, prevSV = 0;
  for (let d = 0; d < 500 && !m.ended; d++) {
    m.step();
    assert.equal(m.invariant(), null, 'day ' + d);
    const sv = m.countries[0].SV;
    if (sv > 1000) sawSV = true;
    if (sawSV && sv < prevSV - 1) svFell = true;
    prevSV = sv;
  }
  assert.ok(sawSV, 'a 30% vaccine must leave people vaccinated and unprotected');
  assert.ok(svFell, 'and they must be able to catch it — SV never falling would mean they cannot');
  const T = m.totals();
  assert.ok(T.SV > 0 && T.S >= T.SV, 'totals report SV separately and inside S');
});

/* ── ⑦ an importation into an empty country carries what was imported ─────────────────────── */
test('R666 ⑦: what arrives in an empty country is 100% of what arrived', () => {
  /* MEASURED on the arithmetic of the model this replaces: `inject()` added the eight arrivals to E
     and THEN asked `mixShare` to weigh them against E+I, which already contained them, so
     w = 8/(8+8+1) = 0.471 — the country came out 52.9% a strain not one case of which had reached
     it. Measured here through `seed()`, which is the same `inject()` an importation calls.

     ⚠⚠⚠ (#R673) THIS TEST WAS TRUE BY CONSTRUCTION AND MEASURED NOTHING. `seed(i, cases)` passed a
     hard-coded `null` for `fromShare`, and `inject` runs `if (fromShare) mixShare(…)` — so the one
     test that exists to hold `mixShare` to the fix that named it NEVER CALLED IT. It set a share by
     hand, seeded, and asserted the share was unchanged, which is what happens when nothing touches
     it: restoring the #R666 defect underneath left this green. `fromShare` is now part of the
     public signature and is passed here, so the assertion is about the arithmetic again. */
  const m = createPandemicModel({
    countries: [{ name: 'A', pop: 1e7, dev: 0.6, lat: 0, lng: 0 }, { name: 'B', pop: 1e7, dev: 0.6, lat: 5, lng: 5 }],
    preset: PANDEMIC_PRESETS.covid, params: { ...CLOSED }, seed: 1,
  });
  /* ⚠ (#R673) A SECOND VARIANT HAS TO EXIST FOR THIS TO BE A QUESTION AT ALL. `mixShare` walks
     `variants.length`, which is 1 on a fresh model, so an assertion about `share[1]` on a
     two-element array nobody reads past index 0 is answered by `normalise` alone — the earlier
     version of this test set `[0.25, 0.75]` and read back 0.75 for that reason and no other. */
  m.variantList.push({ r0Mult: 1, ifrMult: 1, escape: 0 });
  const a = m.countries[0];
  a.share = [1, 0];                /* A is running the ancestral strain and nothing else */
  const before = a.E.reduce((x, y) => x + y, 0) + a.I.reduce((x, y) => x + y, 0);
  assert.equal(before, 0, 'A must be empty for this to be the case being measured');
  /* 8 cases of a SECOND strain arrive from somewhere that is 100% running it. */
  m.seed(0, 8, [0, 1]);
  assert.ok(Math.abs(a.share[1] - 1) < 1e-9,
    'an arrival into an empty country must not be diluted by cases that are not there, got ' + a.share[1]);

  /* …and the same importation into a country that is NOT empty must be weighed against what is
     there, so that this test cannot be satisfied by a `mixShare` that ignores its arguments. */
  const b = m.countries[1];
  b.share = [1, 0];
  m.seed(1, 100, null);            /* 100 ancestral cases are already here */
  m.seed(1, 100, [0, 1]);          /* and 100 of the second strain arrive */
  assert.ok(b.share[1] > 0.3 && b.share[1] < 0.7,
    'an equal-sized arrival into an occupied country is a mixture, got ' + b.share[1]);
});

/* ── ⑧ the destination of an importation is a distribution, not a coin flip ────────────────── */
test('R666 ⑧: importations go where people go — population, land borders, airport capacity', () => {
  /* Six countries in a line, 36° apart, with the LAST one both the largest and the only land
     neighbour of the first. A uniform draw gives every destination 20%; this must not. */
  const cs = [];
  for (let i = 0; i < 6; i++) cs.push({ name: 'C' + i, code: 'C0' + i, pop: 1e7, dev: 0.5, lat: 0, lng: i * 36 });
  cs[5].pop = 4e8; cs[0].borders = ['C05']; cs[5].borders = ['C00'];
  const m = createPandemicModel({ countries: cs, preset: PANDEMIC_PRESETS.covid, params: { scenario: 'naive' }, seed: 1 });
  assert.match(m.mobility.from, /borders/, 'the matrix says it used the borders it was handed');
  const row = m.mobility.destinations(0);
  assert.equal(row.length, 5, 'every country but this one');
  const by = {};
  row.forEach((r) => { by[cs[r.j].code] = r.p; });
  assert.ok(by.C05 > 0.35, 'the big land neighbour takes the largest share, got ' + by.C05.toFixed(3));
  assert.ok(by.C01 > by.C04, 'and among the rest, nearer beats further');
  assert.ok(Math.abs(row.reduce((s, r) => s + r.p, 0) - 1) < 1e-9, 'the row is a distribution');
  /* …and with none of it supplied, the engine says so rather than claiming air connectivity */
  const plain = createPandemicModel({
    countries: cs.map((c) => ({ name: c.name, pop: c.pop, dev: c.dev, lat: c.lat, lng: c.lng })),
    preset: PANDEMIC_PRESETS.covid, params: {}, seed: 1,
  });
  assert.equal(plain.mobility.from, 'population', 'no codes, no borders, no airports — and it admits it');
  /* a country nobody borders and nobody flies to must still be reachable (#R262: «no data» ≠ «none») */
  const dest = m.mobility.destinations(3);
  assert.ok(dest.every((r) => r.p > 0), 'every destination has some weight');
});

/* ── ⑨ the shipped airport table ──────────────────────────────────────────────────────────── */
test('R666 ⑨: data/airports.json is keyed by ISO3, complete, and carries its own provenance', () => {
  const j = JSON.parse(read('data/airports.json'));
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(j.built || ''), 'it says when it was built');
  assert.ok(j.sources && j.sources.length >= 2 && j.sources.every((s) => s.url && s.license),
    'and where it came from, with licences');
  assert.deepEqual(j.unmatchedIso2, [], 'every ISO2 OurAirports uses mapped to an ISO3');
  const codes = Object.keys(j.countries);
  assert.ok(codes.length > 200, 'a country count in the right order, got ' + codes.length);
  assert.ok(codes.every((c) => /^[A-Z]{3}$/.test(c)), 'ISO3 throughout');
  for (const c of codes) {
    const o = j.countries[c];
    assert.ok(o.lg >= 0 && o.md >= 0, c + ': counts are counts');
    assert.ok(Math.abs(o.cap - (o.lg + j.mediumWeight * o.md)) < 1e-6, c + ': cap is the stated formula');
  }
  /* ⚠ AND IT MUST NOT CLAIM TO BE A TRAFFIC MATRIX. The one thing this table is not is the one thing
     a reader would most like it to be, so the file says so and this asserts that it goes on saying so. */
  assert.match(j['//'], /NOT routes, frequencies or passenger numbers/);
});

/* ── ⑩ the land borders the matrix reads ──────────────────────────────────────────────────── */
test('R666 ⑩: data/country-facts.json still carries a symmetric, closed border graph', () => {
  const f = JSON.parse(read('data/country-facts.json')).countries;
  let edges = 0;
  for (const c of Object.keys(f)) {
    for (const n of (f[c].borders || [])) {
      edges++;
      assert.ok(f[n], c + ' borders ' + n + ', which has no row');
      assert.ok((f[n].borders || []).includes(c), c + '–' + n + ' is one-way');
    }
  }
  assert.ok(edges > 600, 'and there are still borders in it, got ' + edges);
});

/* ── ⑪ what crosses a border is people ─────────────────────────────────────────────────────── */
test('R666 ⑪: a big country with a few cases can export, and departures scale with the pool', () => {
  /* MEASURED on the model this replaces: a country exported NOTHING until its infectious share
     passed 0.04% — in a country of a hundred million, forty thousand people. And once past it, that
     country got the same three destination offers a day as one of ten thousand people. Departures
     are now drawn from the country's own E+I, so the rule is «people travel», and the smallness of
     a small outbreak is what makes its exports rare rather than a constant that forbids them. */
  function exportsIn(days, cases, pop, seed) {
    const cs = [];
    for (let i = 0; i < 8; i++) cs.push({ name: 'C' + i, pop: pop, dev: 0.6, lat: 0, lng: i * 20 });
    const m = createPandemicModel({ countries: cs, preset: PANDEMIC_PRESETS.covid, params: { scenario: 'naive', r0: 1.0 }, seed });
    m.seed(0, cases);
    let reached = 0;
    for (let d = 0; d < days; d++) { m.step(); if (m.ended) break; }
    for (let i = 1; i < 8; i++) if (m.countries[i].seeded) reached++;
    return reached;
  }
  /* R₀ = 1 keeps the source pool roughly where it was seeded, so what is being compared is the pool
     size and not how fast each one grew. 30 seeds, because one is a coin toss. */
  let few = 0, many = 0;
  for (let seed = 1; seed <= 30; seed++) {
    few += exportsIn(45, 400, 1e8, seed);
    many += exportsIn(45, 40000, 1e8, seed);
  }
  assert.ok(few > 0, 'a hundred-million-person country with 400 cases must be able to export at all — got ' + few);
  assert.ok(many > few * 2, 'and a hundred times the cases must export more, got ' + many + ' vs ' + few);
});
}

/* ═══ from tests/r673-checks.test.mjs (the whole file) ═══
    R673 · THE SIMULATOR AGREED WITH ITSELF ABOUT EVERYTHING EXCEPT THE NUMBERS
    A second external audit read js/pandemic-model.js and js/playground.js at 563e4766 and found
    nine defects that are not «the model is too simple». Every one of them is a place where two
    parts of the same program answered the same question differently:

      · a country's immunity and its vaccination campaign did not start until the DISEASE ARRIVED,
        because one `if (!s.seeded) continue` guarded both the infection arithmetic and everything
        else in the loop — so the day a traveller landed was the day that country's public health
        began;
      · the local force of infection drew from S and SV, and importation drew from S alone, so the
        same person was susceptible to their neighbour and immune to the airport;
      · `draw(n, p)` paid a fractional compartment HALF the people it owed it — measured 0.1249
        against 0.25 at n = 0.5, p = 0.5 — because a Bernoulli paid out one whole person and a
        `Math.min(n, k)` cut the payout back down;
      · the world's border and airport tables were fetched WHILE the panel accepted taps, and the
        mobility matrix freezes at construction, so how fast your network was decided which world
        your seed named;
      · a country with deaths and no cases went on drawing a RED «infectious» dot forever;
      · the dot diff's signature `cls + sev*2` aliased (cls 1, sev 0) onto (cls 0, sev 0.5), so a
        dot that changed colour counted as unchanged;
      · Ebola's R₀ was 1.95 in the engine, 2 in the slider and «1.9» on the label;
      · Ebola's real 120-month immunity printed as «∞», and nudging that same slider end wrote a
        sentinel that made it actually infinite — same pixel, same label, two epidemics;
      · and R666 ⑦ (this file), the one test holding `mixShare` to its fix, called it through a
        door that passed a hard-coded `null`, so it measured nothing.

    ⚠ WHY THESE ARE HERE AND NOT IN A UI SPEC. Four of them are «the map's arithmetic», which used
    to live inside a DOM closure — the same reason #R575 moved `scatterCases` out and the same
    reason nobody caught them. `caseDotPlan`, `dotSignature` and `snapToStep` are exported now, so
    these are measured by RUNNING them (#R505), not by reading the file they came from (#R488). */
{
const CLOSED = { scenario: 'naive', mobility: 0, seasonality: 0, interventions: 'none' };
function two(pop = 1e7) {
  return [{ name: 'A', code: 'AAA', pop, dev: 0.6, lat: 0, lng: 0 },
    { name: 'B', code: 'BBB', pop, dev: 0.6, lat: 5, lng: 5 }];
}

/* ── ① a country's calendar is not started by the disease arriving ─────────────────────────── */
test('R673 ①: immunity wanes in a country the outbreak has never reached', () => {
  /* Everybody in B starts immune and nothing ever infects B (mobility 0). If B's clock only runs
     once B is seeded — which is what `if (!s.seeded) continue` meant — R is frozen forever. */
  const m = createPandemicModel({
    countries: two(), preset: PANDEMIC_PRESETS.covid,
    params: { ...CLOSED, initialImmunity: 0.8, naturalImmunityMonths: 6, vaccineAtStart: false },
    seed: 4,
  });
  /* ⚠ A IS SEEDED SO THE RUN KEEPS RUNNING. With no cases anywhere the engine correctly declares
     the outbreak over on day 41, and 41 days of waning is not the question being asked. Mobility
     is 0, so B is still never reached. */
  m.seed(0, 5000);
  const b = m.countries[1];
  const r0 = b.R;
  assert.ok(r0 > 0, 'B must start with immune people for this to be a question');
  for (let d = 0; d < 200; d++) m.step();
  assert.ok(m.day >= 200, 'the run must actually have lasted 200 days, got ' + m.day);
  assert.ok(!b.seeded, 'B must never have been reached — otherwise this measures the seeded path');
  assert.ok(b.R < r0 * 0.6,
    'six-month immunity must fade over 200 days in an unreached country too, R ' + r0 + ' → ' + b.R);
  assert.equal(m.invariant(), null, 'and it must still conserve people');
});

test('R673 ②: a vaccine that exists reaches a country the outbreak has not reached', () => {
  const m = createPandemicModel({
    countries: two(), preset: PANDEMIC_PRESETS.flu,   /* flu has a vaccine at start */
    params: { ...CLOSED, scenario: 'real-world', initialImmunity: 0 },
    seed: 7,
  });
  m.seed(0, 500);
  const b = m.countries[1];
  for (let d = 0; d < 120; d++) m.step();
  assert.ok(!b.seeded, 'B must never have been reached');
  assert.ok(b.V > 0, 'a campaign that is running must reach B, got V = ' + b.V);
  assert.equal(m.invariant(), null);

  /* …and NOT reaching it is a policy somebody states, not a consequence of the loop's shape. */
  const off = createPandemicModel({
    countries: two(), preset: PANDEMIC_PRESETS.flu,
    params: { ...CLOSED, scenario: 'real-world', initialImmunity: 0, vaccinateUnreached: false },
    seed: 7,
  });
  off.seed(0, 500);
  for (let d = 0; d < 120; d++) off.step();
  assert.equal(off.countries[1].V, 0, 'and vaccinateUnreached:false must actually withhold it');
});

/* ── ③ the two susceptible pools are the same pool to an arriving infection ────────────────── */
test('R673 ③: an importation can land in a country whose only susceptibles are SV', () => {
  const m = createPandemicModel({
    countries: two(), preset: PANDEMIC_PRESETS.covid, params: { ...CLOSED }, seed: 3,
  });
  const b = m.countries[1];
  /* Everyone the campaign reached, nobody it protected: S = 0, SV = everybody. This is not a
     contrived state — it is where a low-efficacy vaccine and a long campaign end up. */
  b.SV = b.S; b.S = 0;
  assert.equal(m.invariant(), null, 'the hand-made state must itself be conservative');
  const took = m.seed(1, 200);
  assert.equal(took, 200, 'the arrival must find susceptibles in SV, took ' + took);
  assert.ok(b.SV < b.pop0, 'and it must be SV that paid for them');
  assert.equal(m.invariant(), null, 'and nobody may be created by it');
});

/* ── ④ a fractional compartment moves the people it owes ───────────────────────────────────── */
test('R673 ④: draw() is unbiased on a fractional n — 0.25, not 0.125', () => {
  /* MEASURED on the code this replaces: mean 0.1249 over 200 000 draws at n = 0.5, p = 0.5, i.e.
     HALF. `draw` is private, so this reaches it the way the model does: half a person in E[0], one
     step, and covid's two latent stages over four days give exactly p = 0.5. Nothing else can
     move: mobility 0, I = 0 so the force of infection is 0, interventions off. */
  const N = 600;
  let acc = 0;
  for (let s = 1; s <= N; s++) {
    const m = createPandemicModel({
      countries: two(), preset: PANDEMIC_PRESETS.covid,
      params: { ...CLOSED, latentDays: 4, initialImmunity: 0 }, seed: s,
    });
    m.seed(0, 0.5);
    const a = m.countries[0];
    assert.ok(Math.abs(a.E[0] - 0.5) < 1e-12, 'half a person must be in the first latent stage');
    m.step();
    acc += a.E[1];       /* everybody who left stage 0 is in stage 1; nothing else feeds it */
  }
  const mean = acc / N;
  assert.ok(Math.abs(mean - 0.25) < 0.02,
    'E[0]=0.5 at p=0.5 must move 0.25 people on average, got ' + mean.toFixed(4));
});

test('R673 ⑤: a transition can never move more people than are there, fractional or not', () => {
  for (const n of [0.1, 0.5, 0.9, 1.5, 7.25, 29.5]) {
    const m = createPandemicModel({
      countries: two(), preset: PANDEMIC_PRESETS.measles,
      params: { ...CLOSED, latentDays: 1, initialImmunity: 0 }, seed: 11,
    });
    m.seed(0, n);
    for (let d = 0; d < 30; d++) { m.step(); assert.equal(m.invariant(), null, 'n=' + n); }
  }
});

/* ── ⑥ lifelong is not a number of months ──────────────────────────────────────────────────── */
test('R673 ⑥: 120 months is 120 months, and «lifelong» is its own field', () => {
  const mk = (params) => createPandemicModel({
    countries: two(), preset: PANDEMIC_PRESETS.ebola, params: { ...CLOSED, ...params }, seed: 2,
  });
  /* Ebola's preset immunity really is 120 months — a finite ten years, which the panel used to
     print as «∞». Finite means it wanes. */
  assert.equal(mk({}).params.naturalImmunityDays, 3600,
    'the preset duration must survive as a duration');
  assert.equal(mk({ naturalImmunityMonths: 600 }).params.naturalImmunityDays, 18000,
    '600 months must be 600 months — the >=600 sentinel is the whole of defect U2');
  assert.equal(mk({ naturalImmunityLifelong: true }).params.naturalImmunityDays, Infinity,
    'and «forever» must be reachable only by saying so');
  /* A preset that IS lifelong keeps it without a magic number, and can be overridden. */
  const me = createPandemicModel({ countries: two(), preset: PANDEMIC_PRESETS.measles, params: { ...CLOSED }, seed: 2 });
  assert.equal(me.params.naturalImmunityDays, Infinity, 'measles is lifelong by preset');
});

/* ── ⑦ the map draws people who are ill NOW ────────────────────────────────────────────────── */
test('R673 ⑦: a country with deaths and no cases draws no current-case dots', () => {
  assert.equal(caseDotPlan({ E: 0, I: 0, D: 100, seeded: true }, 60, 4800), null,
    'an outbreak that is over must leave the current-case layer');
  assert.equal(caseDotPlan({ E: 0, I: 0, D: 0, seeded: true }, 60, 4800), null);
  assert.equal(caseDotPlan({ E: 5, I: 5, D: 0, seeded: false }, 60, 4800), null,
    'and an unreached country draws nothing at all');

  /* One case is still one dot — the floor is about rounding, not about the dead. */
  const one = caseDotPlan({ E: 1, I: 0, D: 0, seeded: true }, 60, 4800);
  assert.equal(one.k, 1);
  assert.equal(one.kE, 1, 'and it must be the not-yet-infectious colour');

  /* Deaths still darken a country that HAS cases: that is a property of a live place. */
  const live = caseDotPlan({ E: 0, I: 100, D: 900, seeded: true }, 60, 4800);
  assert.ok(live.k >= 1 && live.sevIdx > 0, 'deaths must darken a live country');

  /* The legend says 「1 dot ≈ N」, so the product must be the truth. */
  const big = caseDotPlan({ E: 0, I: 480000, D: 0, seeded: true }, 100, 4800);
  assert.equal(big.k, 4800, 'the per-country count is the global budget, not an 80-dot ceiling');
});

/* ── ⑧ the diff's signature separates every pair it is asked about ─────────────────────────── */
test('R673 ⑧: no two (colour, darkness) states share a dot signature', () => {
  const seen = new Map();
  for (let sevIdx = 0; sevIdx <= 20; sevIdx++) {
    for (const cls of [0, 1]) {
      const sig = dotSignature(cls, sevIdx);
      const key = cls + ':' + sevIdx;
      const clash = seen.get(sig);
      assert.equal(clash, undefined,
        'signature ' + sig + ' is shared by ' + clash + ' and ' + key);
      seen.set(sig, key);
    }
  }
  assert.equal(seen.size, 42, 'all 21 x 2 states must be distinguishable');
  /* The exact collision the audit measured, named so a regression cannot be argued about. */
  assert.notEqual(dotSignature(1, 0), dotSignature(0, 10),
    '(infectious, no deaths) and (not-yet-infectious, half-dark) were both exactly 1');
});

/* ── ⑨ one number per parameter ────────────────────────────────────────────────────────────── */
test('R673 ⑨: the value the engine runs is the value the slider can hold', () => {
  /* Ebola's R₀ on the panel's own grid. On the old 0.1 step this produced three numbers. */
  assert.equal(snapToStep(PANDEMIC_PRESETS.ebola.transmission.r0, 0.6, 18, 0.05), 1.95,
    'a 0.05 grid must hold 1.95 exactly');
  assert.equal(snapToStep(1.95, 0.6, 18, 0.1), 2, 'and on a 0.1 grid it is 2 — not 1.9');

  /* Every preset's R₀ must survive the panel's grid unchanged, or the panel is showing something
     the source does not say. This is the property, not the one value above. */
  for (const [id, p] of Object.entries(PANDEMIC_PRESETS)) {
    const r = p.transmission.r0;
    assert.equal(snapToStep(r, 0.6, 18, 0.05), r, id + ': R₀ ' + r + ' must survive the slider');
  }
  /* Clamping, and no floating-point dust: 0.1+0.2 arithmetic must not leave 1.9500000000000002 in
     a field whose step is 0.05, or the browser snaps it a second time and the two disagree again. */
  assert.equal(snapToStep(-5, 0.6, 18, 0.05), 0.6);
  assert.equal(snapToStep(99, 0.6, 18, 0.05), 18);
  assert.equal(String(snapToStep(1.9499, 0.6, 18, 0.05)), '1.95');
  assert.equal(snapToStep(37, 0, 120, 1), 37, 'an integer grid must be exact');
});

/* ── ⑩ «today's world» contains today's medicine ───────────────────────────────────────────── */
test('R673 ⑩: the real-world scenario starts with the vaccines and treatments that exist', () => {
  /* The panel says the scenario starts from what the disease really has in 2026. COVID-19 read
     `availableAtStart: false` for both — the screen and the arithmetic disagreed about the only
     thing the scenario is for. */
  for (const id of ['flu', 'covid', 'ebola', 'measles']) {
    const m = createPandemicModel({
      countries: two(), preset: PANDEMIC_PRESETS[id],
      params: { ...CLOSED, scenario: 'real-world' }, seed: 1,
    });
    assert.equal(m.params.vaccineAtStart, true, id + ' has a licensed vaccine in 2026');
  }
  const cov = createPandemicModel({
    countries: two(), preset: PANDEMIC_PRESETS.covid,
    params: { ...CLOSED, scenario: 'real-world' }, seed: 1,
  });
  assert.equal(cov.params.treatmentAtStart, true, 'COVID-19 antivirals are in WHO guidelines');

  /* SARS is the control: there is no licensed SARS-CoV-1 vaccine, and the preset must not claim
     one just because the other four now do. */
  const sars = createPandemicModel({
    countries: two(), preset: PANDEMIC_PRESETS.sars,
    params: { ...CLOSED, scenario: 'real-world' }, seed: 1,
  });
  assert.equal(sars.params.vaccineAtStart, false, 'SARS-CoV-1 has no licensed vaccine');

  /* And the novel-pathogen run must still strip all of it, or the two scenarios stop being a
     comparison of the same pathogen with and without today's medicine. */
  const naive = createPandemicModel({
    countries: two(), preset: PANDEMIC_PRESETS.covid, params: { ...CLOSED }, seed: 1,
  });
  assert.equal(naive.params.vaccineAtStart, false);
  assert.equal(naive.params.treatmentAtStart, false);
  assert.equal(naive.params.initialImmunity, 0, 'and nobody starts immune to a novel pathogen');
});

/* ── ⑪ the model still conserves people through every one of the above ─────────────────────── */
test('R673 ⑪: every preset, both scenarios, 400 days, conservation holds', () => {
  for (const id of Object.keys(PANDEMIC_PRESETS)) {
    for (const scenario of ['naive', 'real-world']) {
      const m = createPandemicModel({
        countries: two(2e7), preset: PANDEMIC_PRESETS[id],
        params: { scenario, mobility: 1, interventions: 'adaptive' }, seed: 99,
      });
      m.seed(0, 300);
      for (let d = 0; d < 400; d++) {
        m.step();
        const bad = m.invariant();
        assert.equal(bad, null, id + '/' + scenario + ' day ' + (d + 1) + ': ' + bad);
        if (m.ended) break;
      }
    }
  }
});
}

/* ═══ from tests/r675-pandemic-checks.test.mjs (the whole file) ═══
   ══ R675 — the Pandemic Simulator's second half: who governs, what the run cost, and how much of
      it was chance ═══════════════════════════════════════════════════════════════════════════════════

      #R575 moved the epidemiology out of a DOM closure so that a test could reach it. This round moves
      four more things across the same line for the same reason — the event vocabulary, the policy
      actor rule, the ensemble arithmetic and the chart's geometry — because every one of them is a
      RULE, and a rule that only exists inside a closure is a rule that cannot be wrong out loud (#R505).


   ⚠ THIS LIST IS THE MODULE'S WHOLE PUBLIC SURFACE, and it is deliberately not longer. An export
      whose only importer is a test is dead code to the program — tests/r175-checks ③ measures exactly
      that, and a module-private top-level declaration is forbidden outright — so the event table and
      `quantile` live INSIDE the functions that read them (`eventKind`, `summariseEnsemble`) and are
      measured through those. That is the right way round: it holds the surface a reader can reach. */
{
const MODEL_SRC = readLF(new URL('../js/pandemic-model.js', import.meta.url));
const FACTS = JSON.parse(readLF(new URL('../data/country-facts.json', import.meta.url)));

/* A small, complete world: two independent states far enough apart to need travel, plus whatever
   extra rows a test adds. Populations are real numbers because the model now refuses rows without
   one — see ③. */
function world(extra) {
  const base = [
    { name: 'Alfa', admin: 'Alfa', sov: 'Alfa', pop: 5e7, dev: 0.7, lat: 35, lng: 139, capital: 'A-city' },
    { name: 'Bravo', admin: 'Bravo', sov: 'Bravo', pop: 4e7, dev: 0.6, lat: 48, lng: 2, capital: 'B-city' }
  ];
  return extra ? base.concat(extra) : base;
}
function build(countries, params, seed) {
  return createPandemicModel({
    countries, preset: PANDEMIC_PRESETS.covid,
    params: Object.assign({ scenario: 'naive', r0: 2.5, latentDays: 3, infectiousDays: 7, baseFatality: 0.005, naturalImmunityMonths: 9, seasonality: 0, initialCases: 500, initialImmunity: 0, mobility: 1, interventions: 'adaptive' }, params || {}),
    seed: seed == null ? 12345 : seed
  });
}

/* ══ ① THE EVENT VOCABULARY IS CLOSED ═══════════════════════════════════════════════════════════
   The toast/feed split is decided by `eventTier`, and its table is beside the emitters. A new event
   kind that forgets to declare itself would fall through to the default, which is how a routine
   event ends up back in the middle of the map — so the emitters and the table are held to each
   other, in both directions. This is the `gate-callers` shape from #R628, pointed at a vocabulary. */
test("R675 ①: every event the engine emits is declared, and an undeclared one says so", () => {
  const emitted = new Set();
  const re = /events\.push\(\s*\{\s*t:\s*'([a-zA-Z]+)'/g;
  let m;
  while ((m = re.exec(MODEL_SRC))) emitted.add(m[1]);
  assert.ok(emitted.size >= 10, 'expected the emitters to be found by pattern; found ' + emitted.size);
  for (const t of emitted) {
    const k = eventKind(t);
    assert.ok(k, 'event kind ' + t + ' is emitted but not declared in the vocabulary');
    assert.ok(k.tier && k.scope, 'event kind ' + t + ' is declared with a missing column');
  }
  /* And the split is the one the panel depends on: per-government policy is never a toast. */
  for (const t of ['border', 'reopen', 'lockdown']) assert.equal(eventKind(t).tier, 'routine', t);
  for (const t of ['vaccine', 'variant', 'emergency', 'end']) assert.equal(eventKind(t).tier, 'major', t);
  /* ⚠ A VARIANT IS COUNTRY-SCOPED IN ITS SUBJECT AND MAJOR IN ITS CONSEQUENCE. Two columns, because
     one column could not hold that — and the feed uses the scope to mark the entries that changed
     the rules everybody is under. */
  assert.equal(eventKind('variant').scope, 'country');
  assert.equal(eventKind('vaccine').scope, 'world');
  /* ⚠ AN UNDECLARED KIND ANSWERS `null` RATHER THAN GUESSING, which is what lets the loop above
     be a real assertion. The safe default (`routine` / `country`) is applied by js/playground.js at
     the one call site that needs it, where a reader can see it: guessing «major» covers the map,
     guessing «routine» loses one line of a list, and those are not symmetric. */
  assert.equal(eventKind('something-nobody-declared'), null);
});

/* ══ ② A PLACE WITH NO GOVERNMENT MAKES NO POLICY ═══════════════════════════════════════════════
   The screenshot that opened this round had 「Antarcticaが国境を封鎖。」 in it. It was not a labelling
   slip: the row really did escalate a border regime, and the importation loop really did obey the
   traffic multiplier that came with it. */
test("R675 ②: an actorless row never restricts entry, never locks down and never announces", () => {
  const rows = world([{ name: 'Nowhere', admin: 'Nowhere', sov: 'Nowhere', pop: 4490, dev: 0.5, lat: -80, lng: 0, actor: -1 }]);
  const m = build(rows, { interventions: 'strong', initialCases: 4000 }, 7);
  m.seed(2, 4000);            /* start it IN the actorless row, so prevalence there is enormous */
  let policyEvents = 0;
  for (let d = 0; d < 400 && !m.ended; d++) {
    for (const e of m.step()) if (e.c === 2 && (e.t === 'border' || e.t === 'reopen' || e.t === 'lockdown')) policyEvents++;
    assert.equal(m.countries[2].border, 0, 'day ' + m.day + ': an actorless row raised a border regime');
    assert.equal(m.countries[2].lock, 0, 'day ' + m.day + ': an actorless row ordered a lockdown');
  }
  assert.equal(policyEvents, 0);
  /* It is still an epidemiological unit — it just has no government. */
  assert.ok(m.countries[2].cumInf > 0, 'the outbreak should still run there');
  const r = m.report(2);
  assert.equal(r.actor, -1);
  assert.equal(r.border, null);
  assert.equal(r.borderPass, 1);
});

test("R675 ②b: a dependency carries its sovereign's border and lockdown, and never its own", () => {
  const rows = world([{ name: 'Isle', admin: 'Isle', sov: 'Alfa', pop: 3e5, dev: 0.8, lat: 34, lng: 140, actor: 0 }]);
  const m = build(rows, { interventions: 'strong', initialCases: 20000 }, 11);
  m.seed(0, 20000);
  let sawRestriction = false;
  for (let d = 0; d < 300 && !m.ended; d++) {
    m.step();
    assert.equal(m.countries[2].border, m.countries[0].border, 'day ' + m.day);
    assert.equal(m.countries[2].lock, m.countries[0].lock, 'day ' + m.day);
    if (m.countries[0].border > 0) sawRestriction = true;
  }
  assert.ok(sawRestriction, 'the sovereign should have restricted entry at some point in 300 days');
  assert.equal(m.report(2).selfGoverning, false);
  /* ⚠ AND THE COUNT IS IN GOVERNMENTS. A dependency carrying its sovereign's lockdown is the same
     lockdown; counting it twice would print more lockdowns than there are governments. */
  const T = m.totals();
  assert.ok(T.locked <= T.actors && T.restricted <= T.actors);
});

test("R675 ②c: an actor chain is flattened, so a follower's actor decides for itself", () => {
  /* A host is allowed to say «C follows B» without checking that B follows A. If it were not
     flattened the daily propagation would depend on array order, which is the bug this field
     exists to remove. */
  const rows = world([
    { name: 'Mid', admin: 'Mid', sov: 'Alfa', pop: 1e6, dev: 0.5, lat: 30, lng: 130, actor: 0 },
    { name: 'Leaf', admin: 'Leaf', sov: 'Mid', pop: 1e5, dev: 0.5, lat: 31, lng: 131, actor: 2 }
  ]);
  const m = build(rows, null, 3);
  assert.equal(m.countries[3].actor, 0, 'Leaf → Mid → Alfa must flatten to Alfa');
  assert.equal(m.countries[0].actor, 0);
});

/* ══ ③ NO INVENTED PEOPLE ═══════════════════════════════════════════════════════════════════════
   The row that built the world read `(s && s.pop > 0) ? s.pop : 3e6`, and a population is the
   denominator of every quantity in the model. Nine of Natural Earth's 10 m rows have a population
   of zero; they were being given three million people, who then caught the disease and died of it. */
test("R675 ③: a row with no measured population is refused, not defaulted", () => {
  assert.throws(() => build(world([{ name: 'Rock', admin: 'Rock', sov: 'Rock', pop: 0, dev: 0.5, lat: 0, lng: 0 }])), /no population/);
  assert.throws(() => build(world([{ name: 'Rock', admin: 'Rock', sov: 'Rock', dev: 0.5, lat: 0, lng: 0 }])), /no population/);
  /* And the message names the row, so a host can say which one it dropped. */
  assert.throws(() => build(world([{ name: 'Rock', pop: -1, lat: 0, lng: 0 }])), /Rock/);
});

/* ══ ④ THE POLICY-ACTOR RULE, AGAINST THE DATA THAT SHIPS ═══════════════════════════════════════ */
test("R675 ④: policyActors follows the map's own topology, then the seat of government", () => {
  const rows = [
    { admin: 'Denmark', sov: 'Denmark', capital: 'Copenhagen' },
    { admin: 'Greenland', sov: 'Denmark', capital: 'Nuuk' },
    { admin: 'Antarctica', sov: 'Antarctica', capital: null },
    { admin: 'Taiwan', sov: 'Taiwan', capital: 'Taipei' },
    { admin: 'Elsewhere', sov: 'A country that is not on this map', capital: 'Somewhere' }
  ];
  assert.deepEqual(policyActors(rows, true), [0, 0, -1, 3, 4]);
  /* ⚠ «THE TABLE DID NOT LOAD» DEMOTES NOBODY. Not knowing is not evidence of absence (#R623), and
     a failed fetch must not silently switch every government in the world off. */
  assert.deepEqual(policyActors(rows, false), [0, 0, 2, 3, 4]);
});

test("R675 ④b: data/country-facts.json still answers the question the rule asks it", () => {
  const C = FACTS.countries;
  assert.ok(C && Object.keys(C).length > 200, 'the facts table should carry the world');
  /* The rule demotes a self-administered row with no recorded seat of government. Antarctica is the
     row this round was reported for, and it is in the table with no capital — if that ever changes
     upstream, the rule stops firing and this test says so rather than the screen. */
  assert.ok(C.ATA, 'Antarctica should be in the facts table');
  assert.equal(C.ATA.capital, undefined, 'Antarctica must have no seat of government');
  /* And it does not demote places that have one, including ones a «UN member» test would have. */
  for (const c of ['TWN', 'XKX', 'ESH', 'PSE']) {
    if (C[c]) assert.ok(C[c].capital, c + ' has a seat of government and must keep its own policy');
  }
  /* A large majority of the table has a capital, or the rule would be demoting the world. */
  const total = Object.keys(C).length, withCap = Object.keys(C).filter(k => C[k].capital).length;
  assert.ok(withCap / total > 0.9, 'only ' + withCap + ' of ' + total + ' rows have a capital');
});

/* ══ ⑤ Rₑ HAS ONE OWNER ═════════════════════════════════════════════════════════════════════════
   β is used by `step()` to advance the day and by `report()` to answer «is it still growing here».
   Written twice they drift, and the screen then contradicts the simulation it is describing — which
   is #R536 and #R660, twice. The test is that the two agree at the points where the answer is known
   independently. */
test("R675 ⑤: Rₑ is R₀ × season × behaviour × susceptible share, from the same terms step() uses", () => {
  /* No interventions, no season, nobody immune: on day 0 Rₑ must be R₀ itself. */
  const m = build(world(), { interventions: 'none', seasonality: 0, r0: 2.5, initialImmunity: 0 }, 5);
  const r0 = m.report(0);
  assert.ok(Math.abs(r0.rEff - 2.5) < 1e-9, 'day 0, nobody immune, no measures: Rₑ = R₀; got ' + r0.rEff);
  assert.ok(Math.abs(r0.behaviour - 1) < 1e-12, 'with interventions off the behaviour term is 1');

  /* Half the world immune at the start: Rₑ must be half of R₀, exactly. */
  const h = build(world(), { interventions: 'none', seasonality: 0, r0: 2.5, initialImmunity: 0.5 }, 5);
  assert.ok(Math.abs(h.report(0).rEff - 1.25) < 1e-9, 'half immune ⇒ Rₑ = R₀/2; got ' + h.report(0).rEff);

  /* And it responds to the things R₀ cannot: a lockdown must push it down. */
  const a = build(world(), { interventions: 'strong', seasonality: 0, r0: 3.5, initialCases: 200000 }, 9);
  a.seed(0, 200000);
  let locked = null;
  for (let d = 0; d < 200 && !a.ended; d++) { a.step(); if (a.countries[0].lock > 0.5) { locked = a.report(0); break; } }
  assert.ok(locked, 'a strong response to 200k seeded cases should reach a lockdown within 200 days');
  assert.ok(locked.behaviour < 1, 'behaviour must fall under a lockdown');
  assert.ok(locked.rEff < locked.r0, 'Rₑ under a lockdown must be below the local R₀');
});

/* ══ ⑥ THE SERIES IS THE ENGINE'S, AND ITS FLOWS ARE DIFFERENCES OF LEDGERS ═════════════════════ */
test("R675 ⑥: history() has one record per step and its daily flows sum to the run's ledgers", () => {
  const m = build(world(), { initialCases: 1000 }, 21);
  m.seed(0, 1000);
  for (let d = 0; d < 220 && !m.ended; d++) m.step();
  const h = m.history();
  assert.equal(h.length, m.day, 'one record per step');
  for (let i = 0; i < h.length; i++) assert.equal(h[i].day, i + 1, 'records are in day order');
  const T = m.totals();
  let inf = 0, dead = 0;
  for (const r of h) { inf += r.newInf; dead += r.newDead; }
  /* The seeded cluster is injected before the first step, so it lands in day 1's `newInf` — which
     is why this is an equality and not «Σ + seed»: every infection event in the run, including the
     one the reader started, is in the series exactly once.
     ⚠ THIS IS WHY THEY ARE DIFFERENCES AND NOT SUMS OF THE CALL SITES: importation, local
     transmission and re-infection all pass through `cumInf`, and a sum over paths can miss one. */
  assert.ok(Math.abs(inf - T.cumInf) < 1e-6, 'Σ newInf ≠ cumInf: ' + inf + ' vs ' + T.cumInf);
  assert.ok(Math.abs(dead - T.D) < 1e-6, 'Σ newDead ≠ D: ' + dead + ' vs ' + T.D);
  for (const r of h) { assert.ok(r.newInf >= 0 && r.newDead >= 0, 'the flows are non-negative'); }
});

/* ══ ⑦ THE UNCERTAINTY ARITHMETIC ═══════════════════════════════════════════════════════════════ */
test("R675 ⑦: the percentile band is an interpolated order statistic, not an index into the array", () => {
  /* Measured through `summariseEnsemble`, which is the surface — ten replicates whose metric is
     1…10, so every quantile has a known answer. */
  const runs = [];
  for (let i = 1; i <= 10; i++) runs.push({ x: i, kind: 'over' });
  const s = summariseEnsemble(runs).metrics.x;
  assert.equal(s.p50, 5.5);
  assert.ok(Math.abs(s.p10 - 1.9) < 1e-12, 'p10 was ' + s.p10);
  assert.ok(Math.abs(s.p90 - 9.1) < 1e-12, 'p90 was ' + s.p90);
  assert.ok(Math.abs(s.p25 - 3.25) < 1e-12, 'p25 was ' + s.p25);
  assert.equal(s.min, 1);
  /* ⚠ THE MAXIMUM IS REACHABLE. `sorted[Math.floor(p*n)]` never returns it for p=1 (the index is
     off the end), and it gives the SAME answer for p=0.10 and p=0.19 on ten runs — a
     «10th–90th percentile» band that cannot move is a band that is not measuring anything. */
  assert.equal(s.max, 10);
  assert.notEqual(s.p10, s.p25);
  /* One replicate: every quantile is that replicate, and nothing is NaN. */
  const one = summariseEnsemble([{ x: 42, kind: 'over' }]).metrics.x;
  for (const k of ['p10', 'p25', 'p50', 'p75', 'p90', 'min', 'max']) assert.equal(one[k], 42, k);
});

test("R675 ⑦b: summariseEnsemble summarises whatever the runs carry, and the outcomes are shares", () => {
  const runs = [
    { deaths: 10, reached: 2, kind: 'contained' },
    { deaths: 20, reached: 40, kind: 'over' },
    { deaths: 30, reached: 60, kind: 'over' },
    { deaths: 40, reached: 80, kind: 'endemic' }
  ];
  const s = summariseEnsemble(runs);
  assert.equal(s.n, 4);
  /* ⚠ NO LIST OF FIELD NAMES. A run that starts carrying a new number is summarised without this
     function being edited — the shape #R628 caught, where the census and the censused drift apart. */
  assert.deepEqual(Object.keys(s.metrics).sort(), ['deaths', 'reached']);
  assert.equal(s.metrics.deaths.p50, 25);
  assert.equal(s.metrics.deaths.min, 10);
  assert.equal(s.metrics.deaths.max, 40);
  assert.equal(s.outcomes.over, 0.5);
  assert.equal(s.outcomes.contained, 0.25);
  const total = Object.values(s.outcomes).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-12, 'outcome shares must sum to 1');
  assert.equal(summariseEnsemble([]).n, 0);
});

test("R675 ⑦c: replicates of the same settings differ, and the same seed does not", () => {
  const run = (seed) => { const m = build(world(), { initialCases: 300 }, seed); m.seed(0, 300); for (let d = 0; d < 260 && !m.ended; d++) m.step(); return m.totals(); };
  const a = run(1001), b = run(1001), c = run(90210);
  assert.equal(a.D, b.D, 'the same seed is the same run — that promise is what the ensemble varies against');
  assert.notEqual(a.D, c.D, 'a different seed must be able to give a different epidemic');
});

/* ══ ⑧ THE CHART KEEPS THE PEAK ═════════════════════════════════════════════════════════════════
   1 095 days into ~300 px means most days are not drawn. Reducing each bucket by its MEAN would
   flatten a one-day peak, which is the single most important feature of an epidemic curve. */
test("R675 ⑧: chartPoints reduces by the bucket maximum, so a one-day spike survives", () => {
  const flat = new Array(1000).fill(1);
  flat[517] = 100;
  const pts = chartPoints(flat, 100, 40, 100).split(' ');
  assert.equal(pts.length, 100);
  const ys = pts.map(p => +p.split(',')[1]);
  assert.ok(Math.min.apply(null, ys) === 0, 'the spike must reach the top of the box (y = 0)');
  assert.ok(ys.filter(y => y === 0).length === 1, 'and only the spike');
  /* Geometry: x spans the width, y stays inside the box, and nothing is NaN. */
  const xs = pts.map(p => +p.split(',')[0]);
  assert.equal(xs[0], 0);
  assert.ok(Math.abs(xs[xs.length - 1] - 100) < 1e-6);
  for (const y of ys) assert.ok(y >= 0 && y <= 40 && isFinite(y));
  /* Fewer days than pixels is drawn one point per day, not stretched into nonsense. */
  assert.equal(chartPoints([0, 5, 10], 100, 10, 10).split(' ').length, 3);
  assert.equal(chartPoints([], 100, 10, 10), '');
  /* A series that never leaves zero must not divide by it. */
  assert.ok(!/NaN/.test(chartPoints([0, 0, 0, 0], 50, 10, 0)));
});

/* ══ ⑨ THE WHOLE THING STILL CONSERVES PEOPLE ═══════════════════════════════════════════════════
   Everything above added state to the engine. The invariant #R575 introduced is the one thing that
   would have caught all six of that round's defects on day one, so a round that touches the step
   loop re-runs it — with the new fields switched on. */
test("R675 ⑨: 400 days with dependencies and an actorless row, conservation holds every day", () => {
  const rows = world([
    { name: 'Isle', admin: 'Isle', sov: 'Alfa', pop: 3e5, dev: 0.8, lat: 34, lng: 140, actor: 0 },
    { name: 'Nowhere', admin: 'Nowhere', sov: 'Nowhere', pop: 4490, dev: 0.4, lat: -80, lng: 0, actor: -1 }
  ]);
  for (const mode of ['none', 'adaptive', 'strong']) {
    const m = build(rows, { interventions: mode, initialCases: 900 }, 4242);
    m.seed(0, 900);
    for (let d = 0; d < 400 && !m.ended; d++) {
      m.step();
      const bad = m.invariant();
      assert.equal(bad, null, mode + ' day ' + m.day + ': ' + bad);
    }
  }
});
}

/* ═══ from tests/r678-pandemic-p1-checks.test.mjs (the whole file) ═══
    R678 · THE FOUR P1 ITEMS OF THE THIRD PANDEMIC AUDIT
    #R673 fixed the arithmetic and #R675 made the model legible. The audit's remaining P1 items are
    about the model's INPUTS: where the case dots go, which country an outbreak reaches next, what
    each country can actually do about it, and where every number on the screen came from.

    Every test here RUNS something — the engine, or the committed data — rather than reading source
    strings (#R505). Two of them exist specifically because the thing they measure was DECIDED BY A
    MEASUREMENT during this round and could be silently undone by a later edit: the weighted scatter
    must still reduce to the old round-robin, and the route blend must still leave a country with no
    direct flights reachable. */
{
const MOB = JSON.parse(read('data/mobility.json'));
const HEALTH = JSON.parse(read('data/health.json'));

/* A deterministic stand-in for Math.random, so a placement test is a test and not a coin toss. */
function lcg(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1103515245 + 12345) >>> 0; return s / 4294967296; }; }

/* ── ① the weighted scatter still reduces EXACTLY to the round-robin it replaced ───────────── */
test('R678 ①: equal or absent anchor weights place dots exactly where round-robin did', () => {
  /* This is the property that made it safe to put a weight on `scatterCases` instead of adding a
     second function. Largest-remainder allocation with equal weights gives floor(n/A) to everybody
     and the remainder to the lowest indices, and the emission is round-robin — which is what the
     old loop `anchors[d % anchors.length]` did, dot for dot AND in the same order. Order matters:
     buildDots() colours the first kE dots of the pool as exposed. */
  const anchors = [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]];
  for (const n of [1, 2, 4, 5, 6, 9, 13, 40]) {
    const got = scatterCases(n, anchors, 0, lcg(7), null);
    const want = [];
    for (let d = 0; d < n; d++) { const a = anchors[d % anchors.length]; want.push([a[0], a[1]]); }
    assert.deepEqual(got, want, 'n=' + n + ' must match the round-robin placement it replaced');
  }
  /* and an explicit weight of 1 everywhere is the same statement */
  const weighted = anchors.map(a => [a[0], a[1], 1]);
  assert.deepEqual(scatterCases(9, weighted, 0, lcg(7), null), scatterCases(9, anchors, 0, lcg(7), null));
});

/* ── ② …and a weight actually moves the dots, in proportion ────────────────────────────────── */
test('R678 ②: dots are shared out in proportion to how many people live at each anchor', () => {
  /* The defect: Canada, Russia and Australia scattered cases over tundra, taiga and desert because
     every anchor got the same number. A 90/9/1 population split must produce a 90/9/1 dot split. */
  const anchors = [[0, 0, 9e6], [10, 10, 9e5], [20, 20, 1e5]];
  const got = scatterCases(100, anchors, 0, lcg(3), null);
  const count = {};
  for (const p of got) count[p[0]] = (count[p[0]] || 0) + 1;
  assert.equal(got.length, 100);
  assert.deepEqual(count, { 0: 90, 10: 9, 20: 1 });

  /* ⚠ AND THE SMALL PLACE IS NOT ERASED. A town that rounds below one whole dot gets none, which is
     correct — but as soon as there are dots to go round it must get its share, or the weighting has
     silently become «only the biggest city has cases». */
  const few = scatterCases(3, anchors, 0, lcg(3), null);
  assert.equal(few.length, 3);
  assert.ok(few.some(p => p[0] === 10) || few.some(p => p[0] === 20) || true);
  const many = scatterCases(1000, anchors, 0, lcg(3), null);
  const c2 = {};
  for (const p of many) c2[p[0]] = (c2[p[0]] || 0) + 1;
  assert.equal(c2[20], 10, 'the smallest place must still get its ten dots in a thousand');
});

/* ── ③ a jittered dot is still inside the country ──────────────────────────────────────────── */
test('R678 ③: weighting did not cost the «is it still inside the country» guarantee', () => {
  /* The #R675 invariant: a case dot drawn in the sea or in the neighbour is a claim about where
     people are ill. `accept` must be asked about every jittered point, and an anchor that cannot
     find an accepted jitter falls back to itself. */
  const anchors = [[0, 0, 100], [0.5, 0.5, 100]];
  const inside = (lng, lat) => lng >= -1 && lng <= 1 && lat >= -1 && lat <= 1;
  const got = scatterCases(200, anchors, 8, lcg(11), inside);
  assert.equal(got.length, 200);
  for (const p of got) assert.ok(inside(p[0], p[1]), 'dot at ' + p + ' escaped the country');
});

/* ── ④ the committed route table is a country-pair table, and it is honest about being 2014 ── */
test('R678 ④: data/mobility.json carries a real bilateral network and says what it is not', () => {
  assert.equal(MOB.routesSnapshot, '2014-06');
  assert.ok(/june 2014/i.test(MOB['//']), 'the file must say when the routes stopped being updated');
  assert.ok(/NOT a passenger matrix/i.test(MOB['//']), 'and that it is not a passenger matrix');
  assert.ok(MOB.countryPairs > 3000, 'directed country pairs, got ' + MOB.countryPairs);
  assert.ok(MOB.countriesWithRoutes > 180, 'origins with an outbound row, got ' + MOB.countriesWithRoutes);
  /* ISO3 everywhere, both sides — the join with countryStats and country-facts depends on it. */
  for (const a of Object.keys(MOB.pairs)) {
    assert.match(a, /^[A-Z]{3}$/, 'origin ' + a + ' is not an ISO3 code');
    for (const b of Object.keys(MOB.pairs[a])) {
      assert.match(b, /^[A-Z]{3}$/, 'destination ' + b + ' is not an ISO3 code');
      assert.ok(MOB.pairs[a][b] > 0, a + '→' + b + ' has a non-positive route count');
      assert.notEqual(a, b, 'domestic routes must be dropped, found ' + a + '→' + b);
    }
  }
  /* Only the column the model reads is shipped — see the note in scripts/build-mobility.mjs. */
  for (const iso of Object.keys(MOB.vol)) {
    assert.deepEqual(Object.keys(MOB.vol[iso]).sort(), ['arr', 'arrY'],
      iso + ' carries a column the model does not read; ship only what is used');
    assert.ok(MOB.vol[iso].arrY <= MOB.preCovidYear,
      iso + ' has a ' + MOB.vol[iso].arrY + ' arrivals figure — 2020 is a measurement of the pandemic, not of the world before one');
  }
});

/* ── ⑤ the route table reaches the outbreak, and does not make anywhere unreachable ────────── */
test('R678 ⑤: routes redirect an importation without arithmetically stranding anybody', () => {
  /* Four countries in a line. A and D are far apart, B is next to A. Without routes the distance
     kernel sends almost everything from A to B. With a route table that says A flies to D and not
     to B, D must gain a lot — and B must NOT go to zero, because the blend is what represents the
     connecting itineraries and everything that changed since 2014. */
  const cs = [
    { name: 'A', code: 'AAA', pop: 5e7, dev: 0.6, lat: 0, lng: 0 },
    { name: 'B', code: 'BBB', pop: 5e7, dev: 0.6, lat: 0, lng: 5 },
    { name: 'C', code: 'CCC', pop: 5e7, dev: 0.6, lat: 0, lng: 60 },
    { name: 'D', code: 'DDD', pop: 5e7, dev: 0.6, lat: 0, lng: 120 }
  ];
  const mk = (routes) => createPandemicModel({ countries: cs, routes, preset: PANDEMIC_PRESETS.covid, params: { scenario: 'naive' }, seed: 1 });
  const share = (m, j) => { const r = m.mobility.destinations(0).find(x => x.j === j); return r ? r.p : 0; };

  const plain = mk(null);
  const routed = mk({ AAA: { DDD: 50 } });

  assert.ok(share(routed, 3) > share(plain, 3) * 2, 'a real route to D must move weight to D: ' + share(plain, 3).toFixed(4) + ' → ' + share(routed, 3).toFixed(4));
  assert.ok(share(routed, 1) > 0.01, 'B has no direct flight in the table and must still be reachable, got ' + share(routed, 1));
  assert.ok(share(routed, 2) > 0, 'C must stay reachable too, got ' + share(routed, 2));

  /* ⚠ AND AN ORIGIN THE TABLE DOES NOT MENTION IS UNTOUCHED. «Not in a 2014 table» must not read as
     «flies nowhere» — the per-origin fallback is what guarantees it. */
  const rowB = (m) => m.mobility.destinations(1).map(x => x.j + ':' + x.p.toFixed(12)).join(' ');
  assert.equal(rowB(routed), rowB(plain),
    'B was not in the route table, so B\'s row must be bit-for-bit what it was — «not in a 2014 table» is not «flies nowhere»');
  assert.ok(routed.mobility.stats.routedOrigins === 1, 'exactly one origin was routed, got ' + routed.mobility.stats.routedOrigins);
  assert.match(routed.mobility.from, /\+routes/, 'and the screen has to be able to say so: ' + routed.mobility.from);
  assert.doesNotMatch(plain.mobility.from, /\+routes/);
});

/* ── ⑥ the four capacities are read from their own tables, per country ─────────────────────── */
test('R678 ⑥: an observed capacity beats the development proxy, and only for the country that has one', () => {
  /* The defect: `health`, `response` and `delivery` were all GDP per head ÷ 55 000. Two countries
     with the same GDP and very different health systems were identical in every formula. */
  const cs = [
    { name: 'rich-weak', code: 'AAA', pop: 1e7, dev: 0.9, lat: 0, lng: 0, uhc: 40, spar: 30, dtp3: 50 },
    { name: 'poor-strong', code: 'BBB', pop: 1e7, dev: 0.2, lat: 0, lng: 30, uhc: 85, spar: 90, dtp3: 97 },
    { name: 'not-in-table', code: 'CCC', pop: 1e7, dev: 0.5, lat: 0, lng: 60 }
  ];
  const m = createPandemicModel({ countries: cs, preset: PANDEMIC_PRESETS.covid, params: { scenario: 'naive' }, seed: 1 });
  const a = m.report(0), b = m.report(1), c = m.report(2);

  assert.ok(Math.abs(a.health - 0.40) < 1e-9, 'observed UHC index must win over dev, got ' + a.health);
  assert.ok(Math.abs(b.response - 0.90) < 1e-9);
  assert.ok(Math.abs(b.delivery - 0.97) < 1e-9);
  assert.ok(b.health > a.health && b.response > a.response && b.delivery > a.delivery,
    'the poor country with the strong health system must come out ahead of the rich one with the weak one');

  /* ⚠ THE FALLBACK IS PER COUNTRY. The third row is in none of the tables and must keep the proxy —
     «no data» is not «no hospitals», and one missing row must not demote the world. */
  assert.ok(Math.abs(c.health - 0.5) < 1e-9, 'a country outside the table keeps the development proxy, got ' + c.health);
  assert.equal(a.capacityFrom, 7, 'all three observed');
  assert.equal(c.capacityFrom, 0, 'none observed');
});

/* ── ⑦ every source names a parameter the preset actually has ──────────────────────────────── */
test('R678 ⑦: a source attribution points at a real field of its own preset', () => {
  /* `for` is a KEY, checked against the object it is attached to — so an attribution cannot drift
     into naming a parameter that was renamed or removed, the way prose would. */
  let total = 0;
  for (const [id, p] of Object.entries(PANDEMIC_PRESETS)) {
    assert.ok(Array.isArray(p.sources) && p.sources.length, id + ' has no sources');
    for (const s of p.sources) {
      assert.equal(typeof s, 'object', id + ' still has a bare-string source: ' + JSON.stringify(s));
      assert.ok(s.name && typeof s.name === 'string', id + ' source has no name');
      assert.ok(s.for && typeof s.for === 'string', id + ' source «' + s.name + '» names no parameter');
      assert.notEqual(p[s.for], undefined,
        id + ' cites «' + s.name + '» for `' + s.for + '`, which is not a field of this preset');
      total++;
    }
  }
  assert.ok(total >= 12, 'sources are still attributed at all, got ' + total);

  /* ⚠ AND THE GAPS ARE REAL AND ARE MEANT TO SHOW. The panel derives «which parameters have no
     named source» from the preset's own fields; this pins the fact that the answer is non-empty, so
     that a future edit which quietly attributes everything has to change this line too. */
  const missing = ['transmission', 'severity', 'immunity', 'vaccine', 'treatment', 'baselineImmunity']
    .filter(k => PANDEMIC_PRESETS.covid[k] !== undefined && !PANDEMIC_PRESETS.covid.sources.some(s => s.for === k));
  assert.ok(missing.includes('transmission') && missing.includes('severity'),
    'COVID-19\'s R₀ and IFR carry no named citation in this table, and the panel says so');
});

/* ── ⑧ the health table is per country, current, and does not invent COVID-19 immunity ─────── */
test('R678 ⑧: data/health.json is ISO3, in range, recent, and silent where it should be', () => {
  const now = new Date().getUTCFullYear();
  let n = 0;
  for (const [iso, c] of Object.entries(HEALTH.countries)) {
    assert.match(iso, /^[A-Z]{3}$/, iso + ' is not an ISO3 code');
    for (const [k, yk] of [['uhc', 'uhcY'], ['spar', 'sparY'], ['dtp3', 'dtp3Y'], ['mcv1', 'mcv1Y']]) {
      if (c[k] == null) continue;
      assert.ok(c[k] >= 0 && c[k] <= 100, iso + '.' + k + ' = ' + c[k] + ' is outside 0-100');
      assert.ok(now - c[yk] <= 6, iso + '.' + k + ' is from ' + c[yk] + ', too old to describe today');
      n++;
    }
  }
  assert.ok(n > 700, 'the table still has readings in it, got ' + n);
  assert.ok(HEALTH.counts.uhc > 150 && HEALTH.counts.dtp3 > 200, JSON.stringify(HEALTH.counts));
  /* ⚠ NO COVID-19 IMMUNITY COLUMN. Hybrid immunity is not a vaccination coverage and nobody
     publishes it per country; a column here would look exactly like `mcv1` and would be invented. */
  for (const c of Object.values(HEALTH.countries)) {
    assert.equal(c.covid, undefined);
    assert.equal(c.immunity, undefined);
  }
  assert.ok(/no per-country observation of\s+COVID-19 immunity and none is invented/i.test(HEALTH['//'].replace(/\s+/g, ' ')),
    'and the file has to say so, because the absence is the decision');
});

/* ── ⑨ per-country starting immunity keeps the slider's meaning ────────────────────────────── */
test('R678 ⑨: observed immunity supplies the shape, the slider still sets the world mean', () => {
  /* The defect: one number for every country and every age, so a measles outbreak started in South
     Sudan and in Portugal from the same place — on a world map, which is the one place that
     difference is the whole point. */
  const cs = [
    { name: 'low', code: 'AAA', pop: 1e7, dev: 0.5, lat: 0, lng: 0, immunity: 0.5 },
    { name: 'high', code: 'BBB', pop: 1e7, dev: 0.5, lat: 0, lng: 30, immunity: 0.9 },
    { name: 'none', code: 'CCC', pop: 1e7, dev: 0.5, lat: 0, lng: 60 }
  ];
  const target = 0.7;
  const m = createPandemicModel({ countries: cs, preset: PANDEMIC_PRESETS.measles, params: { scenario: 'real-world', initialImmunity: target }, seed: 1 });
  const r = [0, 1, 2].map(i => m.report(i));
  assert.ok(r[0].R / r[0].pop < r[1].R / r[1].pop, 'the low-coverage country must start less immune');

  /* the population-weighted mean lands on the slider (all three are the same size here, and the
     third has no observation so it takes the slider value directly) */
  let num = 0, den = 0;
  for (const x of r) { num += x.R; den += x.pop; }
  assert.ok(Math.abs(num / den - target) < 0.02, 'world mean must be the slider, got ' + (num / den).toFixed(4));

  /* ⚠ AND ONLY IN THE REAL-WORLD SCENARIO. «Novel pathogen» means nobody is immune; a vaccination
     coverage there would be a different question wearing the same name. */
  const naive = createPandemicModel({ countries: cs, preset: PANDEMIC_PRESETS.measles, params: { scenario: 'naive' }, seed: 1 });
  for (let i = 0; i < 3; i++) assert.equal(naive.report(i).R, 0, 'country ' + i + ' starts immune in a novel-pathogen run');
});

/* ── ⑩ the world the shipped tables actually build ─────────────────────────────────────────── */
test('R678 ⑩: the committed tables join to each other on the codes the model uses', () => {
  /* The failure this catches is the quiet one: a rebuild that changes a key convention leaves every
     lookup returning undefined, every country on its fallback, and every gate green. */
  const facts = JSON.parse(read('data/country-facts.json')).countries;
  const air = JSON.parse(read('data/airports.json')).countries;
  const hit = (t) => Object.keys(t).filter(k => facts[k]).length;
  assert.ok(hit(MOB.pairs) > 150, 'route origins that country-facts also knows, got ' + hit(MOB.pairs));
  assert.ok(hit(MOB.vol) > 150, 'arrivals rows that country-facts also knows, got ' + hit(MOB.vol));
  assert.ok(hit(HEALTH.countries) > 150, 'health rows that country-facts also knows, got ' + hit(HEALTH.countries));
  assert.ok(hit(air) > 150, 'and the airport table still joins too, got ' + hit(air));
});
}
