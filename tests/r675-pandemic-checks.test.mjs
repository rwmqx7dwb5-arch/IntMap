/* ══ R675 — the Pandemic Simulator's second half: who governs, what the run cost, and how much of
   it was chance ═══════════════════════════════════════════════════════════════════════════════════

   #R575 moved the epidemiology out of a DOM closure so that a test could reach it. This round moves
   four more things across the same line for the same reason — the event vocabulary, the policy
   actor rule, the ensemble arithmetic and the chart's geometry — because every one of them is a
   RULE, and a rule that only exists inside a closure is a rule that cannot be wrong out loud (#R505).

   Run: node --test tests/r675-pandemic-checks.test.mjs                                            */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
/* ⚠ THIS LIST IS THE MODULE'S WHOLE PUBLIC SURFACE, and it is deliberately not longer. An export
   whose only importer is a test is dead code to the program — tests/r175-checks ③ measures exactly
   that, and a module-private top-level declaration is forbidden outright — so the event table and
   `quantile` live INSIDE the functions that read them (`eventKind`, `summariseEnsemble`) and are
   measured through those. That is the right way round: it holds the surface a reader can reach. */
import {
  PANDEMIC_PRESETS, createPandemicModel,
  eventKind, policyActors, summariseEnsemble, chartPoints
} from '../js/pandemic-model.js';

const MODEL_SRC = readFileSync(new URL('../js/pandemic-model.js', import.meta.url), 'utf8');
const FACTS = JSON.parse(readFileSync(new URL('../data/country-facts.json', import.meta.url), 'utf8'));

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
