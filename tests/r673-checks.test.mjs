/* ============================================================================
 *  R673 · THE SIMULATOR AGREED WITH ITSELF ABOUT EVERYTHING EXCEPT THE NUMBERS
 * ----------------------------------------------------------------------------
 *  A second external audit read js/pandemic-model.js and js/playground.js at 563e4766 and found
 *  nine defects that are not «the model is too simple». Every one of them is a place where two
 *  parts of the same program answered the same question differently:
 *
 *    · a country's immunity and its vaccination campaign did not start until the DISEASE ARRIVED,
 *      because one `if (!s.seeded) continue` guarded both the infection arithmetic and everything
 *      else in the loop — so the day a traveller landed was the day that country's public health
 *      began;
 *    · the local force of infection drew from S and SV, and importation drew from S alone, so the
 *      same person was susceptible to their neighbour and immune to the airport;
 *    · `draw(n, p)` paid a fractional compartment HALF the people it owed it — measured 0.1249
 *      against 0.25 at n = 0.5, p = 0.5 — because a Bernoulli paid out one whole person and a
 *      `Math.min(n, k)` cut the payout back down;
 *    · the world's border and airport tables were fetched WHILE the panel accepted taps, and the
 *      mobility matrix freezes at construction, so how fast your network was decided which world
 *      your seed named;
 *    · a country with deaths and no cases went on drawing a RED «infectious» dot forever;
 *    · the dot diff's signature `cls + sev*2` aliased (cls 1, sev 0) onto (cls 0, sev 0.5), so a
 *      dot that changed colour counted as unchanged;
 *    · Ebola's R₀ was 1.95 in the engine, 2 in the slider and «1.9» on the label;
 *    · Ebola's real 120-month immunity printed as «∞», and nudging that same slider end wrote a
 *      sentinel that made it actually infinite — same pixel, same label, two epidemics;
 *    · and tests/r666-model ⑦, the one test holding `mixShare` to its fix, called it through a
 *      door that passed a hard-coded `null`, so it measured nothing.
 *
 *  ⚠ WHY THESE ARE HERE AND NOT IN A UI SPEC. Four of them are «the map's arithmetic», which used
 *  to live inside a DOM closure — the same reason #R575 moved `scatterCases` out and the same
 *  reason nobody caught them. `caseDotPlan`, `dotSignature` and `snapToStep` are exported now, so
 *  these are measured by RUNNING them (#R505), not by reading the file they came from (#R488).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PANDEMIC_PRESETS, createPandemicModel,
  caseDotPlan, dotSignature, snapToStep,
} from '../js/pandemic-model.js';

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
