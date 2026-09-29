/* ============================================================================
 *  IntMap · #R322 — source-level checks
 *  (Moved from tests/r322-checks.test.mjs ①–④ and ⑨ — the renderer-command census, by topic. The
 *   capability-lifecycle half of the round, ⑤–⑧, is tests/capability-lifecycle-checks.test.mjs.)
 * ----------------------------------------------------------------------------
 *  This round's brief was 「実測に基づいて消す」 — measure first, and only then remove. So the
 *  checks below are about the RELATION between a measurement and a switch, not about spellings:
 *
 *    ① the semantic-diff switch table agrees with what MapLibre itself does. The one operation the
 *       renderer does NOT deduplicate is the one this app skips; the three it DOES are left alone.
 *       Both halves are read from the two files at test time, so if a MapLibre upgrade adds a
 *       comparison to setData — or drops the one in setPaintProperty — this goes red and says which.
 *    ②–④ the three comparisons are EXECUTED, not grepped. They are lifted out of js/geo-command-log.js
 *       and driven with real values, including the two cases that make a skip unsafe: an object the
 *       caller may have mutated in place, and a payload too large to prove equal.
 *    ⑤–⑥ the lifecycle is EXECUTED too — js/runtime.js is a real ES module, so `dispose` followed
 *       by `activate` can simply be run. #R322 found that pair broken (the register deleted the
 *       definition), and a check that reads the source would have been satisfied by the old code.
 *    ⑦–⑧ every capability that was connected this round can be given back AND asked for again.
 *    ⑨ the instrument is off unless it is asked for.
 *
 *  ⚠ NO ASSERTION HERE CAN BE SATISFIED BY COPYING A NUMBER INTO THIS FILE. The numbers this round
 *  produced (156 redundant setSourceData, 4.3 ms saved, both inside the noise floor) live in
 *  DEV-NOTES.md, where a measurement belongs. What is pinned here is the RULE they justified.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ⚠ comments in this repository QUOTE the spellings they replaced, so a raw grep proves nothing —
   the mistake has been made eight times (see #R313's note). Everything below reads `code()`. */
function code(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/* Lift one function out of a file and make it callable. This is what turns 「the guard is written」
   into 「the guard behaves」 — the difference #R301 found between a check and a test. */
function lift(src, name, deps = '') {
  const at = src.indexOf('function ' + name + '(');
  assert.ok(at >= 0, `${name} is not in the file any more — the check is stale, not the code`);
  let i = src.indexOf('{', at), depth = 0, end = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) { end = i + 1; break; } }
  }
  assert.ok(end > 0, `could not find the end of ${name}`);
  const body = src.slice(at, end);
  return new Function(`${deps}\n${body}\nreturn ${name};`)();
}

/* ⚠ (#R322) TWO FILES, AND THE SPLIT IS THE REASON THIS FILE ONCE ASSERTED NOTHING. The comparisons
   and the switch table moved to js/geo-command-log.js when js/geo-engine.js went over the shell's
   line ceiling — and this file went on reading js/geo-engine.js for them, so `lift()` threw at
   MODULE scope and node --test skipped every test in it. Green because it never ran: #R301's defect
   exactly, in the round that cites #R301. The two reads are named separately now, so a future move
   fails one lift with a message instead of silencing the file. */
const GEO = read('js/geo-engine.js');
const CENSUS = read('js/geo-command-log.js');
const GEOC = code(GEO);
const CENSUSC = code(CENSUS);
/* the census a page gets for a given query string — makeCommandCensus() reads `location.search` */
const { makeCommandCensus } = await import('../js/geo-command-log.js');
function censusFor(search) {
  const prev = globalThis.location; globalThis.location = { search };
  try { return makeCommandCensus().CMD; } finally { if (prev === undefined) delete globalThis.location; else globalThis.location = prev; }
}
/* ── ① the switch table is a consequence of MapLibre's behaviour, not an opinion ─────────────── */
test('R322 ① every operation the renderer already deduplicates is left alone; the one it does not is skipped', async () => {
  /* (maplibre-6-migration) ASKED OF THE INSTALLED LIBRARY, NOT READ OUT OF ONE FILE'S TEXT. This used
     to search 5.24's dist/maplibre-gl-dev.js for a `deepEqual(` near each setter — and under 6.x that
     file does not exist, so the `existsSync` guard below it returned early and the whole check PASSED
     WITHOUT LOOKING (the #R301 shape: green because it never ran). Now the renderer's own Style setters
     and GeoJSONSource.setData are RUN, on stand-ins whose layer already holds the value. */
  const ml = await import('maplibre-gl');
  const writes = (method, name, current, next) => {
    let wrote = false;
    const layer = { id: 'L', filter: current, getPaintProperty: () => current, getLayoutProperty: () => current,
      setPaintProperty: () => { wrote = true; return false; }, setLayoutProperty: () => { wrote = true; }, setFilter: () => { wrote = true; } };
    const style = { _checkLoaded() {}, getLayer: () => layer, fire() {}, _validate: () => false, _updateLayer() {},
      _updatePaintProperty() { wrote = true; }, _changed: false, _updatedPaintProps: {} };
    if (method === 'setFilter') ml.Style.prototype.setFilter.call(style, 'L', next);
    else ml.Style.prototype[method].call(style, 'L', name, next);
    return wrote;
  };
  const value = ['interpolate', ['linear'], ['zoom'], 3, '#abc', 9, '#def'];
  const dedupes = (method, name) => {
    /* the stand-in must reach the write for a DIFFERENT value, or «no write» below measured nothing */
    assert.equal(writes(method, name, value, ['get', 'x']), true, `Style.${method} applies a different value to the stand-in`);
    return !writes(method, name, value, JSON.parse(JSON.stringify(value)));
  };
  const rendererDedupes = {
    paint: dedupes('setPaintProperty', 'fill-color'),
    layout: dedupes('setLayoutProperty', 'visibility'),
    filter: dedupes('setFilter', null),
  };
  assert.equal(rendererDedupes.paint, true, 'Style.setPaintProperty stopped comparing — the skip table has to be re-decided');
  assert.equal(rendererDedupes.layout, true, 'Style.setLayoutProperty stopped comparing');
  assert.equal(rendererDedupes.filter, true, 'Style.setFilter stopped comparing');

  /* GeoJSONSource.setData still has no comparison of its own — that absence is the whole argument
     for skipping it here, so it is asserted rather than remembered: the same object twice is two
     updates for the worker. */
  let posted = 0;
  const src = { _updateWorkerData() { posted++; return Promise.resolve(); } };
  const fc = { type: 'FeatureCollection', features: [] };
  ml.GeoJSONSource.prototype.setData.call(src, fc);
  ml.GeoJSONSource.prototype.setData.call(src, fc);
  assert.equal(posted, 2,
    'GeoJSONSource.setData now compares its argument — the skip in js/geo-engine.js became a second mechanism for a job the renderer does, and must be switched off');

  /* what this app does: the table the census it builds actually carries (asked, not parsed) */
  const table = censusFor('').skip;
  assert.ok(table && typeof table === 'object', 'the skip table is gone from js/geo-command-log.js');
  assert.equal(table.sourceData, true, 'setSourceData is the one the renderer does not deduplicate — it must be skipped here or nothing removes the repeat');
  for (const op of ['paint', 'layout', 'filter']) {
    assert.equal(table[op], false,
      `${op} is deduplicated by the renderer already; a second comparison in front of it is the two-mechanisms defect, measured at roughly break-even`);
  }
  assert.equal(table.featureState, false, 'featureState was never called in any measured scenario — a cache for it asserts nothing');
});

/* ── ②–④ the comparisons, executed ──────────────────────────────────────────── */
const deepEq = lift(CENSUS, '_deepEq');
const subsetEq = lift(CENSUS, '_stateSubsetEq', 'const _deepEq=' + lift(CENSUS, '_deepEq').toString() + ';');
const eqBudget = lift(CENSUS, '_eqBudget');

test('R322 ② the value comparison behaves the way the renderer\'s own does', () => {
  assert.equal(deepEq(1, 1), true);
  assert.equal(deepEq('a', 'a'), true);
  assert.equal(deepEq(1, '1'), false);
  assert.equal(deepEq(null, undefined), false, 'null and undefined are different values to a style property');
  assert.equal(deepEq([1, [2, 3]], [1, [2, 3]]), true);
  assert.equal(deepEq([1, [2, 3]], [1, [2, 4]]), false);
  assert.equal(deepEq(['case', ['>', 2, 1], 'a', 'b'], ['case', ['>', 2, 1], 'a', 'b']), true,
    'an expression built twice from the same source must compare equal, or nothing is ever skipped');
  assert.equal(deepEq({ a: 1 }, { a: 1, b: 2 }), false, 'a missing key is a different value');
  assert.equal(deepEq({ a: 1, b: 2 }, { a: 1 }), false);
  assert.equal(deepEq([1, 2], [1, 2, 3]), false);
});

test('R322 ③ feature state MERGES, so "no change" means every key this call names is already equal', () => {
  assert.equal(subsetEq({ hover: true, sel: 1 }, { hover: true }), true, 'the call names one key and it already holds that value');
  assert.equal(subsetEq({ hover: true }, { hover: true, sel: 1 }), false, 'the call names a key the state does not hold');
  assert.equal(subsetEq({ hover: true }, { hover: false }), false);
  assert.equal(subsetEq(null, { hover: true }), false, 'no state at all is not "already equal"');
  assert.equal(subsetEq({ hover: true }, null), false);
});

test('R322 ④ a source payload may be skipped only when a FRESH object proves equal, and only within a budget', () => {
  /* the budgeted walk: true / false / "did not finish" */
  const run = (a, b, n) => { const st = { n, out: false }; const eq = eqBudget(a, b, st); return st.out ? null : eq; };
  assert.equal(run({ x: 1 }, { x: 1 }, 1000), true);
  assert.equal(run({ x: 1 }, { x: 2 }, 1000), false);

  /* ⚠ THE RULE THAT MAKES THE SKIP SAFE: a collection too large to prove equal within the budget
     answers "unknown", and unknown must never be treated as equal. */
  const big = { type: 'FeatureCollection', features: Array.from({ length: 400 }, (_, i) => ({ id: i, geometry: { coordinates: [i, i] } })) };
  const bigCopy = JSON.parse(JSON.stringify(big));
  assert.equal(run(big, bigCopy, 1_000_000), true, 'within budget, two equal collections compare equal');
  assert.equal(run(big, bigCopy, 20), null, 'over budget the answer is "did not finish", not "equal"');

  /* …and the identity rule, read off _sourceHolds: the same object the source already holds may
     have been mutated in place since, so identity is an APPLY, never a skip. */
  /* _sourceHolds is lifted and RUN, with the budget it declares for itself */
  const budget = /const _EQ_BUDGET\s*=\s*[^;]+;/.exec(CENSUSC);
  assert.ok(budget, 'the payload budget is still one declaration');
  const sourceHolds = lift(CENSUS, '_sourceHolds', budget[0] + '\nconst _eqBudget=' + eqBudget.toString() + ';');
  const held = { type: 'FeatureCollection', features: [{ id: 1, geometry: { coordinates: [1, 2] } }] };
  assert.equal(sourceHolds({ _data: { geojson: held } }, held), false,
    'identity no longer forces an apply — a caller that edits one collection in place would have its edit dropped');
  assert.equal(sourceHolds({ _data: { geojson: held } }, JSON.parse(JSON.stringify(held))), true,
    '…while a FRESH object that proves equal is the one case that may be skipped');
});

/* ── ⑨ the instrument does not ship switched on ─────────────────────────────── */
test('R322 ⑨ the command census is off unless it is asked for', async () => {
  /* spelling kept — the half after asPage() — the timing probes and the five adapter call sites — is about a guard standing BEFORE a comparison in the renderer's hot path; a fake map could only see that as timing, so it is read */
  /* the default, ASKED of a census built for a page that did not ask (it used to be read off the
     `const CMD = {…}` literal; the two assertions it made are the first two asPage('') lines below) */
  assert.equal(censusFor('').on, false, 'counting must be off by default — it is an instrument, not a feature');
  assert.equal(censusFor('').detail, false, 'the per-id string tables must be off by default');
  /* ⚠ (#R671) THE DOOR, ASKED OF THE MODULE INSTEAD OF OF ITS SPELLING. This line used to be
     `/cmdlog\|perf/.test(CENSUSC)` — one regexp literal pinned. #R671 SPLIT that literal, because
     `?perf=1` (the on-device HUD) was buying `detail` as well, i.e. a JSON.stringify of every source
     payload on the phone being measured; the spelling check went red for a change that strengthened
     the very thing it was defending. The claim is unchanged and now executed: there is still a URL
     that switches this on, it is off for a page that did not ask, and the tables
     scripts/frame-profile.mjs --commands reads are still reachable by the URL it opens. */
  const { makeCommandCensus } = await import('../js/geo-command-log.js');
  const asPage = (search) => {
    const prev = globalThis.location; globalThis.location = { search };
    try { return makeCommandCensus().CMD; } finally { if (prev === undefined) delete globalThis.location; else globalThis.location = prev; }
  };
  assert.equal(asPage('').on, false, 'counting must be off in a page that did not ask');
  assert.equal(asPage('').detail, false, 'and so must the per-id tables');
  assert.equal(asPage('?cmdlog=1').on, true, 'nothing turns the census on any more');
  assert.equal(asPage('?cmdlog=1').detail, true,
    'scripts/frame-profile.mjs --commands opens ?cmdlog=1 and reads byId / msCall / msCmp — that URL must still buy them');
  /* the timing probes are the expensive part and must be behind DETAIL, never behind `on` alone */
  const probes = CENSUSC.match(/performance\.now\(\)/g) || [];
  assert.ok(probes.length > 0, 'the timing probes are gone — the round could not be re-measured');
  for (const line of CENSUSC.split('\n')) {
    if (!line.includes('performance.now()') || !line.includes('_cmd.time')) continue;
    assert.ok(/CMD\.detail/.test(line),
      `a timing probe is not gated on detail mode: ${line.trim().slice(0, 110)}`);
  }

  /* ⚠ AND THE ADAPTER'S SIDE OF THE SAME PROMISE. The census is only free when the five call sites
     ask for it before doing anything: `(CMD.on || CMD.skip.<op>) && skipX(…)`. A call site that
     dropped the guard would run the comparison on every command in every session, which is exactly
     the cost this round measured and decided not to pay for four of the five operations. */
  for (const [op, fn] of [['sourceData', 'skipData'], ['paint', 'skipProp'], ['layout', 'skipProp'],
    ['filter', 'skipProp'], ['featureState', 'skipState']]) {
    const re = new RegExp('\\(CMD\\.on\\|\\|CMD\\.skip\\.' + op + '\\)&&' + fn + '\\(');
    assert.match(GEOC, re, `the ${op} call site must not run the comparison unless the census or its own skip asked for it`);
  }
});
