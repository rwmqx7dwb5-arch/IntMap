/* ============================================================================
 *  IntMap · #R315 — source-level checks
 * ----------------------------------------------------------------------------
 *  This round's brief was 「実測に基づいて消す」 — measure first, and only then remove. So the
 *  checks below are about the RELATION between a measurement and a switch, not about spellings:
 *
 *    ① the semantic-diff switch table agrees with what MapLibre itself does. The one operation the
 *       renderer does NOT deduplicate is the one this app skips; the three it DOES are left alone.
 *       Both halves are read from the two files at test time, so if a MapLibre upgrade adds a
 *       comparison to setData — or drops the one in setPaintProperty — this goes red and says which.
 *    ②–④ the three comparisons are EXECUTED, not grepped. They are lifted out of js/geo-engine.js
 *       and driven with real values, including the two cases that make a skip unsafe: an object the
 *       caller may have mutated in place, and a payload too large to prove equal.
 *    ⑤–⑥ the lifecycle is EXECUTED too — js/runtime.js is a real ES module, so `dispose` followed
 *       by `activate` can simply be run. #R315 found that pair broken (the register deleted the
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
import { readFileSync, existsSync } from 'node:fs';
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

const GEO = read('js/geo-engine.js');
const GEOC = code(GEO);

/* ── ① the switch table is a consequence of MapLibre's behaviour, not an opinion ─────────────── */
test('R315 ① every operation the renderer already deduplicates is left alone; the one it does not is skipped', () => {
  const ML = join(ROOT, 'node_modules', 'maplibre-gl', 'dist', 'maplibre-gl-dev.js');
  if (!existsSync(ML)) { assert.ok(true, 'maplibre-gl is not installed — nothing to compare against'); return; }
  const ml = readFileSync(ML, 'utf8');

  /* what MapLibre does: does Style.setX short-circuit on an equal value? */
  const guards = (setter) => {
    const at = ml.indexOf('\n    ' + setter + '(layerId');
    assert.ok(at >= 0, `MapLibre no longer has Style.${setter} — this check is about a renderer that changed`);
    const body = ml.slice(at, at + 1400);
    return /deepEqual\(/.test(body.split('\n').slice(0, 22).join('\n'));
  };
  const rendererDedupes = {
    paint: guards('setPaintProperty'),
    layout: guards('setLayoutProperty'),
    filter: guards('setFilter'),
  };
  assert.equal(rendererDedupes.paint, true, 'Style.setPaintProperty stopped comparing — the skip table has to be re-decided');
  assert.equal(rendererDedupes.layout, true, 'Style.setLayoutProperty stopped comparing');
  assert.equal(rendererDedupes.filter, true, 'Style.setFilter stopped comparing');

  /* GeoJSONSource.setData still has no comparison of its own — that absence is the whole argument
     for skipping it here, so it is asserted rather than remembered. */
  const sd = ml.indexOf('\n    setData(data, waitForCompletion) {');
  assert.ok(sd >= 0, 'GeoJSONSource.setData is not where it was');
  const sdBody = ml.slice(sd, sd + 700).split('\n').slice(0, 12).join('\n');
  assert.ok(!/deepEqual\(/.test(sdBody),
    'GeoJSONSource.setData now compares its argument — the skip in js/geo-engine.js became a second mechanism for a job the renderer does, and must be switched off');

  /* what this app does: the declared table */
  const m = /skip:\s*\{([^}]*)\}/.exec(GEOC);
  assert.ok(m, 'the skip table is gone from js/geo-engine.js');
  const table = {};
  for (const part of m[1].split(',')) {
    const kv = /(\w+)\s*:\s*(true|false)/.exec(part);
    if (kv) table[kv[1]] = kv[2] === 'true';
  }
  assert.equal(table.sourceData, true, 'setSourceData is the one the renderer does not deduplicate — it must be skipped here or nothing removes the repeat');
  for (const op of ['paint', 'layout', 'filter']) {
    assert.equal(table[op], false,
      `${op} is deduplicated by the renderer already; a second comparison in front of it is the two-mechanisms defect, measured at roughly break-even`);
  }
  assert.equal(table.featureState, false, 'featureState was never called in any measured scenario — a cache for it asserts nothing');
});

/* ── ②–④ the comparisons, executed ──────────────────────────────────────────── */
const deepEq = lift(GEO, '_deepEq');
const subsetEq = lift(GEO, '_stateSubsetEq', 'const _deepEq=' + lift(GEO, '_deepEq').toString() + ';');
const eqBudget = lift(GEO, '_eqBudget');

test('R315 ② the value comparison behaves the way the renderer\'s own does', () => {
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

test('R315 ③ feature state MERGES, so "no change" means every key this call names is already equal', () => {
  assert.equal(subsetEq({ hover: true, sel: 1 }, { hover: true }), true, 'the call names one key and it already holds that value');
  assert.equal(subsetEq({ hover: true }, { hover: true, sel: 1 }), false, 'the call names a key the state does not hold');
  assert.equal(subsetEq({ hover: true }, { hover: false }), false);
  assert.equal(subsetEq(null, { hover: true }), false, 'no state at all is not "already equal"');
  assert.equal(subsetEq({ hover: true }, null), false);
});

test('R315 ④ a source payload may be skipped only when a FRESH object proves equal, and only within a budget', () => {
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
  const holds = GEOC.slice(GEOC.indexOf('function _sourceHolds('));
  assert.ok(/cur\.geojson\s*===\s*data\s*\)\s*return false/.test(holds.slice(0, 700)),
    'identity no longer forces an apply — a caller that edits one collection in place would have its edit dropped');
});

/* ── ⑤–⑥ the lifecycle, executed ───────────────────────────────────────────── */
async function freshRuntime() {
  /* the register touches window / document / rAF through guards or through functions called later;
     supplying them here is what lets the state machine be RUN rather than read. */
  const g = globalThis;
  const had = { w: g.window, d: g.document, r: g.requestAnimationFrame, c: g.cancelAnimationFrame, i: g.requestIdleCallback };
  g.window = g.window || {};
  g.document = g.document || { addEventListener() { }, hidden: false };
  g.requestAnimationFrame = g.requestAnimationFrame || (() => 0);
  g.cancelAnimationFrame = g.cancelAnimationFrame || (() => { });
  const { makeRuntime } = await import('../js/runtime.js');
  const rt = makeRuntime({});
  return { rt, restore() { g.window = had.w; g.document = had.d; g.requestAnimationFrame = had.r; g.cancelAnimationFrame = had.c; g.requestIdleCallback = had.i; } };
}

test('R315 ⑤ a capability that has been disposed can be opened again', async () => {
  const { rt, restore } = await freshRuntime();
  try {
    const seen = [];
    rt.define('t.cap', {
      load: () => { seen.push('load'); return 'V'; },
      activate: () => seen.push('activate'),
      suspend: () => seen.push('suspend'),
      dispose: () => seen.push('dispose'),
    });
    await rt.activate('t.cap');
    assert.equal(rt.stateOf('t.cap'), 'active');
    rt.dispose('t.cap');
    assert.equal(rt.stateOf('t.cap'), 'disposed',
      'the definition must survive dispose — deleting it is what made a second open impossible');
    await rt.activate('t.cap');
    assert.equal(rt.stateOf('t.cap'), 'active', 'activate after dispose must bring the capability back');
    /* dispose() suspends first, deliberately: whatever it releases must not be undone by a task of
       its own that was already queued for this frame (js/runtime.js). */
    assert.deepEqual(seen, ['load', 'activate', 'suspend', 'dispose', 'load', 'activate'],
      'the re-open must re-run load: the memo that made load idempotent has to be dropped by dispose');
  } finally { restore(); }
});

test('R315 ⑥ dispose sweeps every register a capability can have put work into — idle included', async () => {
  const { rt, restore } = await freshRuntime();
  try {
    let ran = 0;
    rt.define('t.idle', { activate: () => { }, dispose: () => { } });
    await rt.activate('t.idle');
    rt.idle('t.idle.task', () => { ran++; }, { capability: 't.idle' });
    rt.onCamera('t.idle.cam', () => { }, { capability: 't.idle' });
    rt.every('t.idle.timer', 1000, () => { }, { capability: 't.idle' });
    const before = rt.stats();
    assert.ok(before.timers >= 1 && before.camera >= 1, 'the capability registered work to be swept');
    rt.dispose('t.idle');
    const after = rt.stats();
    assert.equal(after.timers, 0, 'a disposed capability must not leave a timer behind');
    assert.equal(after.camera, 0, 'a disposed capability must not leave a camera subscriber behind');
    await new Promise((r) => setTimeout(r, 350));
    assert.equal(ran, 0,
      'the idle queue was not swept: a disposed capability ran a task against resources it had just released');
  } finally { restore(); }
});

/* ── ⑦ the two worker clients can give the thread back, and be asked again ───── */
for (const [file, what] of [['src/tsunami-worker-client.js', 'tsunami'], ['src/sat-worker-client.js', 'satellite tiles']]) {
  test(`R315 ⑦ the ${what} worker client has a public way to give the thread back`, () => {
    const src = code(read(file));
    assert.ok(/\bdispose\s*\(\s*\)\s*\{/.test(src), `${file} has no public dispose — the worker outlives every close`);
    const at = src.indexOf('dispose()');
    const body = src.slice(at, src.indexOf('state:', at) > at ? src.indexOf('state:', at) : at + 900);
    assert.ok(/\.terminate\(\)/.test(body), `${file}: dispose must actually terminate the worker`);
    assert.ok(/\.clear\(\)/.test(body), `${file}: dispose must settle and drop the pending jobs — a promise whose worker was terminated under it never resolves`);
    assert.ok(/tried\s*=\s*false/.test(body), `${file}: dispose must allow a new worker to be built, or the feature is dead for the rest of the tab`);
    /* …and the crash path must NOT do that: a worker that just died should not be respawned in a loop */
    const err = src.slice(src.indexOf('onerror'), src.indexOf('onerror') + 320);
    assert.ok(!/tried\s*=\s*false/.test(err), `${file}: the crash path must stay one-way — only an explicit dispose may re-arm it`);
  });
}

/* ── ⑧ every capability connected this round can be suspended AND given back ─── */
test('R315 ⑧ every capability defined in js/ supplies all three verbs and a public dispose', () => {
  const files = ['js/weather.js', 'js/tsunami.js', 'js/satellites-live.js'];
  const found = [];
  for (const f of files) {
    const src = code(read(f));
    /* ⚠ the definition object contains arrow bodies with their own braces (`activate:(o)=>open(o||{})`),
       so a lazy `[\s\S]*?}` stops inside one and reports a verb as missing that is plainly there.
       Match the braces instead of guessing where the object ends. */
    const re = /\.define\(\s*'([\w.]+)'\s*,\s*\{/g;
    let m;
    while ((m = re.exec(src))) {
      const name = m[1];
      let i = src.indexOf('{', m.index + m[0].length - 1), depth = 0, end = -1;
      for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (!depth) { end = i; break; } }
      }
      assert.ok(end > 0, `${f}: could not find the end of the definition for "${name}"`);
      const def = src.slice(m.index + m[0].length, end);
      found.push(name);
      for (const verb of ['activate', 'suspend', 'dispose']) {
        assert.ok(new RegExp('\\b' + verb + '\\s*:').test(def),
          `${f}: capability "${name}" has no ${verb} — a lifecycle missing a verb is the register knowing less than the feature`);
      }
    }
    assert.ok(/\bdispose\s*:/.test(src),
      `${f} defines a capability but publishes no dispose on its own API — the only door to it would be the register`);
  }
  assert.deepEqual(found.sort(), ['sat.live', 'sim.tsunami', 'wx.wind'],
    'the three capabilities this round connected are the three that are defined');
});

/* ── ⑨ the instrument does not ship switched on ─────────────────────────────── */
test('R315 ⑨ the command census is off unless it is asked for', () => {
  const m = /const CMD\s*=\s*\{([\s\S]*?)\n  \};/.exec(GEOC);
  assert.ok(m, 'the census configuration is gone');
  assert.ok(/\bon:\s*false/.test(m[1]), 'counting must be off by default — it is an instrument, not a feature');
  assert.ok(/\bdetail:\s*false/.test(m[1]), 'the per-id string tables must be off by default');
  assert.ok(/cmdlog\|perf/.test(GEOC), 'nothing turns the census on any more');
  /* the timing probes are the expensive part and must be behind DETAIL, never behind `on` alone */
  const probes = GEOC.match(/performance\.now\(\)/g) || [];
  assert.ok(probes.length > 0, 'the timing probes are gone — the round could not be re-measured');
  for (const line of GEOC.split('\n')) {
    if (!line.includes('performance.now()') || !line.includes('_cmd.time')) continue;
    assert.ok(/CMD\.detail/.test(line),
      `a timing probe is not gated on detail mode: ${line.trim().slice(0, 110)}`);
  }
});
