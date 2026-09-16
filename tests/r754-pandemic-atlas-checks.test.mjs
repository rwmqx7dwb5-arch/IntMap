/* ============================================================================
 *  #R754 — the pandemic simulator, as something Atlas can drive
 * ----------------------------------------------------------------------------
 *  MEASURED IN PRODUCTION 2026-09-16 (#R747 §6): asked 「Simulate a pandemic starting in Lagos and
 *  show me day 60.」 Atlas made ZERO tool calls in 43.8 s and replied that IntMap «does not
 *  currently provide an epidemiological transmission simulator». It has had one since #R575.
 *
 *  ⚠ THESE CHECKS RESTATE THE DEFECT, NOT THE FIX ([[intmap-restate-the-defect-not-the-fix]]).
 *  #R520 wrote «one point per country» — the answer it had reached — instead of «dozens of points
 *  per country», the defect, and that test then defended a WORSE bug for 187 rounds. So each name
 *  below says what went wrong, and the assertion measures the fact rather than today's spelling.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const MODEL = await import('../js/pandemic-model.js');
const { PANDEMIC_PRESETS, PANDEMIC_PARAMS, defaultPandemicParams, describePandemicParams,
  checkPandemicParams, paramBounds, createPandemicModel } = MODEL;

/* ⚠ THE TEST WALKS THE PRESET PATH ITSELF, and that is deliberate rather than a duplication: a
   check that re-derives the answer independently is a check, while one that calls the same helper
   the implementation calls asserts only that the helper is self-consistent (#R666 ⑧'s shape — a
   property that holds for the WRONG number is not a calibration). It is four lines. */
const presetField = (preset, path) => { let v = preset; for (const s of String(path||'').split('.')) { if (v == null) return undefined; v = v[s]; } return v; };

/* ── ① the list that could not notice what was not added to it ─────────────────────────────────
   The defect: `P` inside createPandemicModel read four `inp.*` keys — vaccineEfficacy, vaccineMonths,
   vaccineImmunityLifelong, vaccinateUnreached — that the declaration did not mention, while a
   comment above the declaration asserted the two sets were equal. An assertion is not a
   measurement. Both directions, because either gap is a defect: an undeclared input cannot be
   offered to a caller, and a declared one nothing reads is a parameter that silently does nothing. */
test('R754 ①: every engine input is declared, and every declared parameter is read', () => {
  const src = read('js/pandemic-model.js');
  const readKeys = new Set([...src.matchAll(/\binp\.([A-Za-z0-9_]+)/g)].map(m => m[1]));
  const declared = new Set(Object.keys(PANDEMIC_PARAMS));
  const undeclared = [...readKeys].filter(k => !declared.has(k));
  const unread = [...declared].filter(k => !readKeys.has(k));
  assert.deepStrictEqual(undeclared, [], 'the engine reads inputs nobody declared: ' + undeclared.join(', '));
  assert.deepStrictEqual(unread, [], 'the table declares parameters the engine never reads: ' + unread.join(', '));
  assert.ok(declared.size >= 18, 'the declaration did not shrink to make this pass (' + declared.size + ')');
});

/* ── ② the default that was a second copy ──────────────────────────────────────────────────────
   js/playground.js held `freshParams`, a hand-written restatement of every preset field. It was the
   only statement of the defaults anywhere, so anything that was not that screen had to write a
   third. ⚠ THE INVARIANT IS THE POINTER, not a copy of the values: each default must equal the
   preset field its declaration POINTS AT, so a revised preset moves the default with it. */
test('R754 ②: a default equals the preset field it points at, for every preset and scenario', () => {
  for (const key of Object.keys(PANDEMIC_PRESETS)) {
    for (const scenario of ['naive', 'real-world']) {
      const got = defaultPandemicParams(key, scenario);
      for (const k of Object.keys(PANDEMIC_PARAMS)) {
        const d = PANDEMIC_PARAMS[k];
        if (k === 'scenario') { assert.strictEqual(got.scenario, scenario); continue; }
        if (d.realWorldOnly && scenario !== 'real-world') {
          assert.strictEqual(got[k], d.kind === 'boolean' ? false : 0,
            key + '/' + scenario + ': a real-world-only field must be the scenario\'s definition, not a default');
          continue;
        }
        if (d.from == null) { assert.strictEqual(got[k], d.kind === 'boolean' ? !!d.default : d.default, key + '.' + k); continue; }
        const want = presetField(PANDEMIC_PRESETS[key], d.from);
        const expect = d.kind === 'boolean' ? !!want : (typeof want === 'number' && isFinite(want) ? want : d.min * (d.scale || 1));
        assert.strictEqual(got[k], expect, key + '/' + scenario + ' ' + k + ' must come from ' + d.from);
      }
    }
  }
});

/* ── ③ the assumption that was put in the reader's mouth ───────────────────────────────────────
   A run that names two parameters and takes sixteen from this file, reported without saying so,
   asserts IntMap's defaults as though the reader had chosen them (#R675;
   [[intmap-data-must-not-claim-an-author-it-lacks]]). Every value must carry an author, and an
   author that names a preset field must name one that EXISTS. */
test('R754 ③: every parameter reports an author, and a cited preset field is real', () => {
  const d = describePandemicParams('covid', 'naive', { r0: 2.5 });
  assert.strictEqual(d.length, Object.keys(PANDEMIC_PARAMS).length, 'every parameter is described, not a chosen few');
  const r0 = d.find(x => x.key === 'r0');
  assert.strictEqual(r0.origin, 'caller', 'what the caller set is attributed to the caller');
  assert.strictEqual(r0.value, 2.5);
  for (const row of d) {
    assert.ok(/^(caller|default|preset:|preset-silent:|scenario:)/.test(row.origin), row.key + ' has no author: ' + row.origin);
    const tag = row.origin.startsWith('preset-silent:') ? 'preset-silent:' : row.origin.startsWith('preset:') ? 'preset:' : null;
    if (tag) {
      const dotted = row.origin.slice(tag.length);
      const presetKey = dotted.slice(0, dotted.indexOf('.'));
      const field = dotted.slice(dotted.indexOf('.') + 1);
      assert.ok(PANDEMIC_PRESETS[presetKey], row.key + ' cites a preset that does not exist');
      const v = presetField(PANDEMIC_PRESETS[presetKey], field);
      /* ⚠ BOTH DIRECTIONS. «preset:» must name a field that exists, and «preset-silent:» must name
         one that does NOT — otherwise silence and statement are interchangeable labels and the
         distinction stops meaning anything. */
      if (tag === 'preset:') assert.notStrictEqual(v, undefined, row.key + ' cites ' + row.origin + ', which is not a field of that preset');
      else assert.strictEqual(v, undefined, row.key + ' reports ' + row.origin + ' as unstated, but the preset does state it');
    }
  }
  /* the naive scenario's zeros are the SCENARIO's statement, not this file's default */
  assert.strictEqual(d.find(x => x.key === 'initialImmunity').origin, 'scenario:naive');
});

/* ── ④ the value that was clamped instead of refused ───────────────────────────────────────────
   Clamping destroys the evidence (#R743): the run succeeds at a number nobody asked for and the
   reply describes it as though they had. And the refusal must CARRY THE VOCABULARY, so one wrong
   call becomes one corrected call rather than a search. */
test('R754 ④: an impossible parameter is refused, and the refusal quotes the engine\'s own range', () => {
  assert.deepStrictEqual(checkPandemicParams({ r0: 2.5, interventions: 'none', vaccinateUnreached: false }), [],
    'a legal call is not refused');
  const hi = checkPandemicParams({ r0: 99 });
  assert.strictEqual(hi.length, 1);
  assert.strictEqual(hi[0].why, 'out-of-range');
  assert.deepStrictEqual(hi[0].accepts, paramBounds('r0'), 'the range quoted is paramBounds, not a second copy of it');
  const unknown = checkPandemicParams({ notAParameter: 1 });
  assert.strictEqual(unknown[0].why, 'unknown');
  assert.deepStrictEqual(unknown[0].accepts, Object.keys(PANDEMIC_PARAMS), 'and an unknown key is answered with every key');
  const enumBad = checkPandemicParams({ interventions: 'sometimes' });
  assert.deepStrictEqual(enumBad[0].accepts, PANDEMIC_PARAMS.interventions.values);
});

/* ── ⑤ the vocabulary the planner is shown, against the vocabulary that exists ──────────────────
   The catalogue block names the presets and the parameter keys inline, because the planner must
   SEE them. A list written in prose and checked nowhere is the one that goes stale the first time a
   preset is added (.agents/rules/no-ad-hoc-hardcoding.md §2.4), so it is checked here. */
test('R754 ⑤: the catalogue offers exactly the presets and parameters that exist', () => {
  const cat = read('js/atlas-catalog-text.js');
  const i = cat.indexOf("ids: ['sim.pandemicRun', 'map.pandemicDay']");
  assert.ok(i > 0, 'the pandemic capabilities have a catalogue block at all — their ABSENCE was the defect');
  const block = cat.slice(i, cat.indexOf('\n', cat.indexOf("' },", i)));
  for (const p of Object.keys(PANDEMIC_PRESETS)) assert.ok(block.includes('"' + p + '"'), 'preset ' + p + ' is not offered to the planner');
  for (const k of Object.keys(PANDEMIC_PARAMS)) assert.ok(block.includes(k), 'parameter ' + k + ' is not offered to the planner');
  assert.ok(/NEVER answer that it does not/.test(block),
    'the block says the simulator exists — the measured failure was Atlas asserting it does not');
});

/* ── ⑥ the one capability that would have been called not_rendered ─────────────────────────────
   #R743's finding, restated as the defect: a capability that computes but declares a map promise
   makes the observer measure an unmoved map and call a CORRECT answer not_rendered — #R736/#R737's
   21 wasted calls, #R742's 52 failures in 207. So the computing row must promise the map nothing,
   and the drawing row must promise it. */
test('R754 ⑥: computing promises the map nothing; drawing promises exactly that', () => {
  const src = read('js/atlas-capabilities.js');
  /* ⚠ THE COLUMNS ARE QUOTED STRINGS, and two of them hold comma-separated lists — so the row is
     read by pulling the quoted cells out, never by splitting the line on commas. */
  const row = (id) => {
    const m = src.match(new RegExp("\\['" + id.replace('.', '\\.') + "',[^\\n]*?\\],"));
    assert.ok(m, id + ' is not in the registry');
    const cells = [...m[0].matchAll(/'([^']*)'/g)].map(x => x[1]);
    assert.strictEqual(cells.length, 11, id + ': a capability row is 11 columns, read ' + cells.length);
    return cells;
  };
  const run = row('sim.pandemicRun'), draw = row('map.pandemicDay');
  assert.strictEqual(run[4], 'none', 'the computing capability observes nothing of the map');
  assert.strictEqual(run[5], '', 'and writes nothing');
  assert.ok(!/map/.test(run[6]), 'and does not claim to produce a map: ' + run[6]);
  assert.ok(/map/.test(draw[6]), 'the drawing capability produces a map');
  assert.strictEqual(draw[4], 'pandemic', 'and is watched by the observer that reads the pandemic canvas');
  assert.strictEqual(run[9], 'place', 'the run needs somewhere to start, and says so rather than taking the map centre');
});

/* ── ⑦ the observer that called a redraw a failure ─────────────────────────────────────────────
   The defect `factions` and `isochrone` were both corrected for: a count DIFF reports the same day
   drawn twice as not_rendered while the dots sit on the globe. The verdict must be a fact about the
   map NOW. ⚠ And an unreadable canvas is not an empty one (#R736). */
test('R754 ⑦: drawing the same day twice is not a failure, and unreadable is not empty', () => {
  const src = read('js/atlas-capabilities.js');
  const i = src.indexOf('      pandemic: {');
  assert.ok(i > 0, 'the pandemic observer exists');
  const body = src.slice(i, src.indexOf('\n      },', i));
  assert.ok(!/changed\(before, after\)/.test(body),
    'the verdict must not be a before/after diff — that is what made a correct redraw not_rendered');
  assert.ok(/if \(!after\) return \{ status: 'completed'/.test(body),
    'an unobservable canvas must not be reported as not_rendered: null is not zero');
  assert.ok(/!after\.features[\s\S]{0,120}not_rendered/.test(body),
    'an empty canvas after a draw IS not_rendered');
});

/* ── ⑧ the door that did not exist ─────────────────────────────────────────────────────────────
   Every spelling the registry accepts must reach a dispatch case, or the planner is told about a
   capability whose call fails. */
test('R754 ⑧: every spelling of both capabilities reaches a dispatch case', () => {
  const caps = read('js/atlas-capabilities.js');
  const con = read('js/atlas-console.js');
  for (const id of ['sim.pandemicRun', 'map.pandemicDay']) {
    const m = caps.match(new RegExp("\\['" + id.replace('.', '\\.') + "',\\s*'([^']*)',\\s*'([^']*)'"));
    assert.ok(m, id + ' is not in the registry');
    const spellings = [m[1]].concat(m[2] ? m[2].split(',') : []).filter(Boolean);
    assert.ok(spellings.length >= 2, id + ' offers more than one spelling');
    for (const s of spellings) assert.ok(con.includes("case '" + s + "':"), id + ': no dispatch case for ' + s);
  }
});

/* ── ⑨ the world that only one screen could build ──────────────────────────────────────────────
   The defect: the world — which rows are places where people live, what their populations and
   connectivity are — lived inside js/playground.js's DOM closure, so the engine was drivable from
   node and the WORLD was drivable from nowhere. ⚠ MEASURED AS «is there exactly one builder», not
   as «does a file exist»: two builders would be two different epidemics wearing one name. */
test('R754 ⑨: the world is built in one place, and the panel is not it', () => {
  const pg = read('js/playground.js');
  const world = read('js/pandemic-world.js');
  assert.ok(/export function buildPandemicWorld/.test(world), 'the world builder is exported');
  assert.ok(pg.includes('buildPandemicWorld('), 'the panel gets its world from the builder');
  for (const gone of ['_plByIso', 'function loadAirports(', 'function loadHealth(', 'function loadMobility('])
    assert.ok(!pg.includes(gone), 'js/playground.js still holds its own copy of ' + gone);
  assert.ok(!/POP_EST/.test(pg), 'js/playground.js still decides which rows are inhabited — that is the world builder\'s job');
  /* the rule that decides whether a place may have a government stays pure and exported (#R675) */
  assert.ok(/policyActors\(/.test(world), 'the policy-actor rule is applied by the world builder');
  assert.ok(!/policyActors\(/.test(pg), 'and not a second time by the panel');
});

/* ── ⑩ THE SEAM. ───────────────────────────────────────────────────────────────────────────────
   [[intmap-contract-is-not-implementation]]: two modules written against one contract, each
   correct, each with a green check, and the JOIN belonged to neither population. The only test
   that finds that is one that feeds A's actual output to B. So this builds a real world through
   js/pandemic-world.js — with a stubbed browser, because that is what the module needs and not
   what it IS — and runs js/pandemic-model.js on the result. */
test('R754 ⑩: the world the builder produces is a world the engine can actually run', async () => {
  const sq = (name, code, x, y) => ({ type: 'Feature',
    properties: { NAME_EN: name, ADMIN: name, SOVEREIGNT: name, ISO_A3_EH: code, POP_EST: 5e6, LABEL_X: x + 0.5, LABEL_Y: y + 0.5 },
    geometry: { type: 'Polygon', coordinates: [[[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]]] } });
  const feats = [sq('Alfa', 'AAA', 0, 0), sq('Bravo', 'BBB', 10, 0), sq('Charlie', 'CCC', 20, 0)];
  const stats = { AAA: { pop: 5e6, gdppc: 20000 }, BBB: { pop: 9e6, gdppc: 4000 }, CCC: { pop: 2e6, gdppc: 50000 } };
  globalThis.window = {
    countryGeo: { type: 'FeatureCollection', features: feats },
    /* ⚠ THE TABLES ARE ABSENT ON PURPOSE. A dead table must not lock anybody out — it must name
       itself (#R673) — so the seam is tested in the state a reader on a bad network actually gets. */
    IntMapGazetteer: { warm: () => Promise.resolve(), world: () => [] },
    addEventListener: () => {}
  };
  globalThis.fetch = () => Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve(null) });

  const { buildPandemicWorld, resolveOrigin } = await import('../js/pandemic-world.js');
  const W = await buildPandemicWorld({ countryStats: stats });
  assert.ok(W, 'a world was built');
  await W.ready;

  assert.strictEqual(W.N, 3, 'every row with a measured population is in the world');
  assert.deepStrictEqual(W.dataState.airports, 'failed', 'a table that did not arrive is named, not silently zeroed');
  assert.strictEqual(W.dataState.policy, 'failed', 'and so is the one that decides who governs');

  /* the store accepts its own keys ([[intmap-store-refused-its-own-key]]) */
  assert.strictEqual(W.indexOfCode('BBB'), 1, 'the world answers to the ISO3 it issued');
  assert.strictEqual(W.indexOfCode('bbb'), 1, 'case is not identity');
  assert.strictEqual(W.indexOfName('Charlie'), 2, 'and to the name it holds');
  assert.strictEqual(W.indexOfCode('ZZZ'), -1, 'and refuses what it does not hold rather than guessing');
  assert.strictEqual(W.indexAt(10.5, 0.5), 1, 'a point resolves by the same geometry a tap would hit');
  assert.strictEqual(W.indexAt(50, 50), -1, 'and open ocean resolves to nothing');

  const o = resolveOrigin(W, { country: 'Alfa' });
  assert.strictEqual(o.i, 0);
  assert.strictEqual(o.how, 'name', 'and it reports HOW it decided, so the reply can be argued with');
  assert.strictEqual(resolveOrigin(W, {}).why, 'no-origin-given');
  assert.strictEqual(resolveOrigin(W, { lng: 50, lat: 50 }).why, 'no-country-at-point');

  /* ⚠ THE JOIN ITSELF: these rows, unmodified, into the engine. */
  const params = defaultPandemicParams('covid', 'naive');
  const model = createPandemicModel({ countries: W.world, routes: W.routes, preset: PANDEMIC_PRESETS.covid, params, seed: 7 });
  model.seed(W.indexOfCode('AAA'), params.initialCases);
  for (let d = 0; d < 60; d++) model.step();
  assert.strictEqual(model.day, 60, 'the engine stepped the days it was asked for');
  assert.ok(model.invariant() === null, 'and its own invariant holds on a world built by the builder: ' + model.invariant());
  const t = model.totals();
  assert.ok(t.cumInf > params.initialCases, 'an epidemic actually happened (' + t.cumInf + ')');
  assert.ok(t.worldPop === 16e6, 'the engine simulated the population the world declared, not an invented one');
  const rep = model.report(0);
  assert.ok(rep && rep.seeded && rep.cumInf > 0, 'and the seeded country reports a state Atlas can read back');

  /* the same seed is the same run — the promise the two-phase world exists to keep (#R673) */
  const again = createPandemicModel({ countries: W.world, routes: W.routes, preset: PANDEMIC_PRESETS.covid, params, seed: 7 });
  again.seed(W.indexOfCode('AAA'), params.initialCases);
  for (let d = 0; d < 60; d++) again.step();
  assert.strictEqual(again.totals().cumInf, t.cumInf, 'the same seed reproduced the run exactly');
});

/* ══ #R755 — what production said about #R754 ═════════════════════════════════════════════════
   Build R754 went live and Atlas STOPPED saying the simulator does not exist: it found the
   capability and called it three times. It still answered nothing, because every call was refused.
   These four restate what was measured, not what was fixed. */

/* ── ⑪ the spelling a planner actually writes ──────────────────────────────────────────────────
   MEASURED: Atlas passed `place: "Lagos, Nigeria"`. `"Lagos"` resolved; the qualified form did
   not, three times, and the turn died at `repeated_calls`. ⚠ The qualifier must be USED, not
   dropped — dropping it is how «Lagos, Portugal» silently becomes Nigeria. */
test('R755 ⑪: «City, Country» resolves, and the country half is a test rather than noise', async () => {
  const src = read('js/pandemic-world.js');
  assert.match(src, /split\(','\)/, 'the resolver reads a qualified place at all');
  const i = src.indexOf('gazetteerCandidates');
  assert.ok(i > 0, 'candidates are enumerated, so the qualifier can choose among them');
  assert.match(src, /place-not-in-that-country/,
    'a name found in the WRONG country is refused by name, not silently accepted');
  /* the refusal must say where it DID find it — «not found» and «found elsewhere» are different facts */
  assert.match(src, /foundIn/, 'the resolver records which country it was found in instead');
  /* ⚠ AND THE REPLY MUST READ IT. Producing `foundIn` and never printing it is the same defect as
     ⑲: measured in the local preview, «Lagos, Portugal» fell through to the generic «could not be
     resolved» because the new reason had no message of its own. */
  const atlas = read('js/pandemic-atlas.js');
  assert.match(atlas, /place-not-in-that-country/, 'the reply has a message for that reason');
  assert.ok(atlas.includes('o.foundIn'), 'and it names the country the name DID resolve in');
  /* ⚠ one matcher, so «matches» cannot mean two things */
  assert.strictEqual((src.match(/const en = String\(r\[4\]/g) || []).length, 1,
    'the single answer and the candidate list share one definition of a match');
});

/* ── ⑫ the attribution that never reached the reader ───────────────────────────────────────────
   MEASURED in production: every assumption printed as «r0 = 3.2 []». The row carries `origin`; the
   reader-visible line read `d.from`, which no row has, and `esc(undefined)` is ''. ⚠ THE COMMENT
   DIRECTLY ABOVE THAT LINE SAYS THE ASSUMPTIONS ARE PART OF THE ANSWER. A field list read by two
   readers ([[intmap-two-readers-one-field-list]]) — measured twice now in one round. */
test('R755 ⑫: the reader-visible reply carries the author of every assumption', () => {
  const rows = describePandemicParams('covid', 'naive', {});
  for (const r of rows) {
    assert.ok('origin' in r, r.key + ': a row must carry its author');
    assert.ok('display' in r, r.key + ': and the number its own unit names');
  }
  const src = read('js/pandemic-atlas.js');
  const html = src.slice(src.indexOf('function runHtml'), src.indexOf('function drawHtml'));
  assert.ok(!/d\.from/.test(html), 'the reply must not read a field the row does not have');
  assert.match(html, /esc\(d\.origin\)/, 'it reads `origin`, which every row has');
  assert.match(html, /esc\(String\(d\.display\)\)/, 'and prints the value in the unit it labels');
});

/* ── ⑬ the unit that made every scaled number a hundred times too small ────────────────────────
   MEASURED: «baseFatality = 0.007%» (0.7%), «seasonality = 0.18%» (18%), «mobility = 1%» (100%).
   The engine holds fractions and the declaration says `scale: 0.01`; the report printed the engine
   number under the reader's unit. ⚠ A unit is part of a number. */
test('R755 ⑬: a value reported under a unit is the value IN that unit', () => {
  const rows = describePandemicParams('covid', 'naive', {});
  const by = Object.fromEntries(rows.map(r => [r.key, r]));
  assert.strictEqual(by.baseFatality.value, 0.007, 'the engine still gets the fraction');
  assert.strictEqual(by.baseFatality.display, 0.7, 'and the reader is shown 0.7%');
  assert.strictEqual(by.seasonality.display, 18);
  assert.strictEqual(by.mobility.display, 100);
  /* every declared percentage, not the three that were noticed */
  for (const r of rows) {
    const d = PANDEMIC_PARAMS[r.key];
    if (d.kind !== 'number') continue;
    const s = d.scale || 1;
    assert.ok(Math.abs(r.display - r.value / s) < 1e-9, r.key + ': display must be value/scale');
    if (s === 1) assert.strictEqual(r.display, r.value, r.key + ': an unscaled value is shown as it is');
  }
  /* ⚠ AND THE ENGINE IS UNTOUCHED: defaultPandemicParams still hands back engine units */
  const def = defaultPandemicParams('covid', 'naive');
  assert.strictEqual(def.baseFatality, 0.007);
  assert.strictEqual(def.mobility, 1);
});

/* ── ⑭ the legend that described a shading the map did not have ────────────────────────────────
   MEASURED at day 60: the worst-hit country's rate was 0.0013 and the fixed ramp's first step was
   0.02, so 35 countries drew the identical smallest dot under the words «shaded by cases». */
test('R755 ⑭: the colour scale is the day\'s own, and the reply says what its top means', () => {
  const src = read('js/pandemic-atlas.js');
  assert.ok(!/\[0, 0\.02, 0\.1, 0\.4\]/.test(src), 'the fixed ramp that could not reach the data is gone');
  assert.match(src, /let top = 0;[\s\S]{0,200}f\.properties\.rate/,
    'the top of the scale is measured from the features actually drawn');
  assert.match(src, /STOPS = top > 0/, 'and the stops are derived from it');
  assert.match(src, /scaleTopShareOfPopulation/, 'the machine reader is told the top too');
  const draw = src.slice(src.indexOf('function drawHtml'));
  assert.match(draw, /worst-hit country at this day/,
    'and the reader is told what the darkest mark means — a legend that does not name its top invites one to be invented');
});

/* ══ #R757 — what production said about #R755 ═════════════════════════════════════════════════
   #R755 blamed the comma and fixed the comma. Production measured `place:'Lagos, Nigeria'` refused
   FIVE times and the turn dead at `repeated_calls`, day 60 unanswered, for the second round. */

/* ── ⑮ the country a record STATES is not a country to re-derive ───────────────────────────────
   MEASURED: the gazetteer row for Lagos says `iso2:'NG'`. The resolver ignored it and asked
   point-in-polygon against Natural Earth 10 m, whose Nigerian coastline runs ~4.1 km north of the
   city (the point enters Nigeria only at lat ≥ 6.4910; Lagos is 6.4541). A real city in a real
   country resolved to «no country at all». ⚠ NOT A LAGOS BUG — every coastal city is one
   simplification away from it, so the fix is the rule, not the case. */
test('R757 ⑮: a place resolves by the country its record states, with geometry as the fallback', () => {
  const src = read('js/pandemic-world.js');
  assert.match(src, /indexOfIso2/, 'the world can be asked by the ISO-2 the gazetteer speaks');
  assert.match(src, /iso2: r\[7\]/, 'and candidates carry the country their row states');
  const co = src.slice(src.indexOf('const countryOf'), src.indexOf('const countryOf') + 700);
  assert.ok(co.indexOf("via: 'gazetteer'") < co.indexOf("via: 'geometry'"),
    'the STATED country is tried before the drawn one — geometry is the fallback, not the authority');
  assert.match(co, /disputed/, 'and when both speak and disagree, the disagreement is reported rather than hidden');
  /* ⚠ ONE RULE, BOTH BRANCHES. A qualified place and a bare one must not resolve by different
     means — that is the two-readers defect this round has already paid for three times. */
  assert.strictEqual((src.match(/countryOf\(/g) || []).length >= 3, true,
    'the qualified branch, the bare branch and the refusal all use the one rule');
  assert.ok(!/const i = w\.indexAt\(hit\.lng, hit\.lat\)/.test(src),
    'no branch still resolves a gazetteer hit by geometry alone');
});

/* ── ⑯ a linear ramp on a log-distributed quantity shows the maximum and nothing else ───────────
   MEASURED at day 60: rates from 8.9e-9 to 1.3e-3 — five orders of magnitude — and #R755's
   data-derived LINEAR ramp put 33 of 34 countries between radius 3.00 and 3.27 px. Deriving the
   top from the data was necessary and not sufficient. */
test('R757 ⑯: the ramp is logarithmic, because prevalence is', () => {
  const src = read('js/pandemic-atlas.js');
  assert.match(src, /Math\.log10/, 'the scale is taken in logarithms');
  assert.match(src, /rateLog/, 'and the paint expression interpolates the logarithm');
  assert.ok(!/\['get', 'rate'\], STOPS/.test(src), 'nothing still interpolates the raw rate');
  assert.match(src, /f\.properties\.rate\b/,
    'the raw rate stays on the feature — a reader inspecting a dot sees the quantity, not its logarithm');
});

/* ── ⑰ «show me» was never drawn ───────────────────────────────────────────────────────────────
   MEASURED: a run that SUCCEEDED still left `mapDrawn:false` — Atlas never made the second call,
   and the same turn printed two different day-60 answers from two runs of one question. The
   catalogue is the only place that can tell a planner either thing. */
test('R757 ⑰: the catalogue says that showing needs the second call, and that one question is one run', () => {
  const cat = read('js/atlas-catalog-text.js');
  const i = cat.indexOf("ids: ['sim.pandemicRun', 'map.pandemicDay']");
  const block = cat.slice(i, cat.indexOf("' },", i));
  assert.match(block, /MUST make the second call/, 'a request to SEE it is not answered by the run alone');
  assert.match(block, /ONE RUN PER TURN/, 'and one question is not answered by two contradictory runs');
  assert.match(block, /never repeat the same arguments/,
    'a refused call must be CHANGED — repeating it is what killed both production turns');
});

/* ── ⑱ a rule whose effect nobody can see is a rule nobody can check ───────────────────────────
   MEASURED in production (build R757): the verifier could not tell whether the stated-country rule
   had fired, because the resolver returned `via` and the meta projection dropped it. That is the
   «made a field, never read it» shape for the FOURTH time in this run of rounds — and here it cost
   the round its evidence, not its behaviour. */
test('R758 ⑸: how the origin was decided travels out with the answer', () => {
  const src = read('js/pandemic-atlas.js');
  const meta = src.slice(src.indexOf('function runMeta'), src.indexOf('function runHtml'));
  assert.match(meta, /via: r\.origin\.via/, 'the caller is told WHICH rule resolved the place');
  assert.match(meta, /disputed: r\.origin\.disputed/,
    'and told when the stated country and the drawn one disagreed — a disagreement nobody sees is a disagreement nobody can act on');
});
