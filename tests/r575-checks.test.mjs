/* ============================================================================
 *  R575 · THE PANDEMIC MODEL IS A NUMERICAL OBJECT, AND THESE ARE ITS INVARIANTS
 * ----------------------------------------------------------------------------
 *  An external audit found six ways the simulator contradicted itself — playback speed changing the
 *  epidemiology, «immunity 0» producing NaN, «latent 0» producing PEOPLE, re-importation producing
 *  more people, a run declared over while a million were incubating, and an attack rate that went
 *  DOWN. Every one of them is the kind of defect a per-step invariant catches on the first day, and
 *  none of them was caught, because the arithmetic lived inside a DOM closure that no test could
 *  reach. So the arithmetic moved to js/pandemic-model.js and this file is the twelve properties the
 *  audit asked for, measured by RUNNING the model rather than by reading it (#R505).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PANDEMIC_PRESETS, createPandemicModel, scatterCases } from '../js/pandemic-model.js';

/* A small synthetic world: far enough apart that importation is a real event, big enough that the
   deterministic branch of the arithmetic is exercised too. */
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
  /* The strongest form of the property: the word does not exist in the engine, so no probability
     can be multiplied by it. The old defect was three separate multiplications in one file. */
  const src = readFileSync(new URL('../js/pandemic-model.js', import.meta.url), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(/\bspeed\b/.test(code), false, 'js/pandemic-model.js must contain no notion of playback speed');

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
  const base = { scenario: 'naive', mobility: 0, seasonality: 0, interventions: 'none', naturalImmunityMonths: 600, vaccineAtStart: false };
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
  const m = build({ scenario: 'naive', mobility: 1 }, 1);
  m.seed(0, 5000);
  let seen = 0;
  for (let d = 0; d < 900 && seen === 0; d++) {
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

test('R575 ⑬: the simulator UI reads the engine and no longer does its own epidemiology', () => {
  const pg = readFileSync(new URL('../js/playground.js', import.meta.url), 'utf8');
  assert.ok(/createPandemicModel/.test(pg), 'js/playground.js must drive the shared engine');
  /* The three multiplications that made playback speed change the epidemic, and the attack rate
     that could fall. If any of these shapes comes back, it comes back visibly. */
  assert.equal(/\*\s*speed\s*\*/.test(pg), false, 'no probability may be scaled by playback speed');
  assert.equal(/Math\.random\s*\(\s*\)\s*<[^;]*speed/.test(pg), false, 'no random draw may be gated on playback speed');
  assert.equal(/T\.R\s*\+\s*T\.D\s*\+\s*T\.I/.test(pg), false, 'the attack rate must come from the cumulative ledger');
});
