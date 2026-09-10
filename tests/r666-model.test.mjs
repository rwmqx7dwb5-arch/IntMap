/* ============================================================================
 *  R666 · THE FOUR NUMERICAL DEFECTS A SECOND AUDIT FOUND, AND WHERE AN OUTBREAK GOES NEXT
 * ----------------------------------------------------------------------------
 *  A second external audit arrived while this round was open. It named four defects in
 *  js/pandemic-model.js, and all four were CONFIRMED BY MEASURING the model as shipped:
 *
 *    · every mean sojourn time was about a day longer than the preset asked for (flu's 1-day latent
 *      period ran 2.31 days), and therefore every realized R₀ was high too (flu 1.4 ran at 1.66);
 *    · «n people each with probability p» was drawn as Poisson, which is only the right shape when
 *      p is small, and it was being asked about probabilities near 1;
 *    · the people an all-or-nothing vaccine failed to protect went back into S and were drawn by
 *      the campaign again the next day, so efficacy stopped mattering — 0.4 and 0.6 both put the
 *      same 33 M into V;
 *    · an importation mixed its variant share against a pool that already contained the arrivals,
 *      so eight cases arriving in an empty country came out 47% of a strain that never arrived.
 *
 *  Each of them is the code doing a different thing from what its own comment claimed, which is why
 *  every test here RUNS the engine rather than reading it (#R505). The last two measure PHASE 2 of
 *  the first audit — the destination of an importation, which used to be a uniform draw.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PANDEMIC_PRESETS, createPandemicModel } from '../js/pandemic-model.js';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
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
     ⚠ tests/r575-checks ⑨ could not see this: «below one shrinks, above one grows» is as true of
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
