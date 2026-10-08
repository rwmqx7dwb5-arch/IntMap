/* ============================================================================
 *  deep-tier-reds — the nightly deep tier's standing reds, fixed at the shape that made them (node)
 * ----------------------------------------------------------------------------
 *  ① A SPEC MAY IMPORT A BUILT CHUNK BY ITS EXPORT NAMES ONLY IF THOSE NAMES ARE A CONTRACT.
 *     tests/r493.spec.js imported dist/assets/atlas-view-capture-*.js and called `makeViewCapture`. When #998 made
 *     js/map-recorder.js import the same module, it became a chunk SHARED by two lazily loaded chunks, and the
 *     bundler shortened its export to `t` (`export{t}`) — red for three nights (2026-10-05..07) with
 *     «m.makeViewCapture is not a function». The names survive only in a chunk some `import()` targets: the
 *     bundler cannot rename what an unknown caller reads off the namespace. So every chunk a spec finds in
 *     dist/assets by name must be the chunk of a module js/ loads with `import()`, and — when a build is present —
 *     every export the module declares must be in that chunk's export clause under its own name.
 *     The specs and the modules are discovered, not listed.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const SPECS = readdirSync(join(ROOT, 'tests')).filter((f) => f.endsWith('.spec.js'));
const JS = readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js'));

/* the chunk-name patterns a spec looks dist/assets up with: a regex literal `/^<name>-…\.js$/` */
const CHUNK_RE = /\/\^([a-z0-9][a-z0-9-]*?)-(?:\.\*|\[\^\.\]\+|\[\^\.\]\*|\.\+)\\\.js\$\//g;
function chunkLookups() {
  const out = [];
  for (const f of SPECS) {
    const src = read('tests/' + f);
    if (!/dist[\/'", ]+assets/.test(src)) continue;
    for (const m of src.matchAll(CHUNK_RE)) out.push({ spec: f, name: m[1] });
  }
  return out;
}
/* modules js/ loads with import() — their chunks are entries, and an entry keeps its export names */
const dynamicTargets = (() => {
  const set = new Set();
  for (const f of JS) for (const m of read('js/' + f).matchAll(/\bimport\(\s*['"`]\.\/([a-z0-9-]+)\.js['"`]\s*\)/g)) set.add(m[1]);
  return set;
})();
/* the names a source module exports */
function sourceExports(name) {
  const src = read('js/' + name + '.js'); const out = new Set();
  for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) out.add(m[1]);
  for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)) for (const part of m[1].split(',')) { const p = part.trim().split(/\s+as\s+/).pop(); if (p) out.add(p); }
  return out;
}

test('deep-tier-reds ① every dist chunk a spec finds by name is an import() entry (its export names are a contract)', () => {
  const found = chunkLookups();
  for (const { spec, name } of found) {
    assert.ok(existsSync(join(ROOT, 'js', name + '.js')), `${spec} looks up a chunk «${name}-*.js» but js/${name}.js does not exist`);
    assert.ok(dynamicTargets.has(name), `${spec} imports the built chunk of js/${name}.js by its export names, but nothing in js/ loads that module with import() — `
      + `it is bundled into (or shared by) other chunks and the bundler is free to shorten its exports (r493: \`export{t}\`). Reach it through what the app exposes instead.`);
  }
});

test('deep-tier-reds ① (when built) those chunks export every name their module declares, unshortened', (t) => {
  const dir = join(ROOT, 'dist', 'assets');
  if (!existsSync(dir)) { t.skip('no dist/ — the clause is read only from a build'); return; }
  const files = readdirSync(dir);
  for (const { spec, name } of chunkLookups()) {
    const re = new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&') + '-[^.]+\\.js$');
    const chunk = files.find((f) => re.test(f));
    assert.ok(chunk, `${spec}: no ${name}-*.js in dist/assets`);
    const src = readFileSync(join(dir, chunk), 'utf8');
    const clause = (src.match(/export\s*\{([^}]*)\}\s*;?\s*(?:\/\/#[^\n]*\s*)?$/) || [])[1] || '';
    const names = new Set(clause.split(',').map((p) => p.trim().split(/\s+as\s+/).pop()).filter(Boolean));
    for (const e of sourceExports(name)) assert.ok(names.has(e), `${spec}: dist/assets/${chunk} does not export «${e}» by name (clause: export{${clause.slice(0, 120)}})`);
  }
});

/* ② A SPEC THAT PRESSES A DOOR THE PRODUCT DRAWS ONLY BEHIND A SWITCH MUST ASK THAT SWITCH.
 *    tests/atlas-briefing.spec.js ① clicked the briefing's 「ノートに保存」 (`data-act="keep"`) and the notebook strip. #980
 *    (2026-10-04) hid the investigation notebook behind js/atlas-notebook-store.js NOTEBOOK_SHOWN = false, and those doors
 *    stopped being drawn; the click waited out the whole 240 s, red for four nights (2026-10-04..07) with no assertion
 *    named. The doors are DISCOVERED from the source: every `btn('<act>'` inside a `NOTEBOOK_SHOWN ? … : ''` arm of
 *    js/atlas-briefing.js, plus every `atl-nb*` class js/atlas-notebook.js draws (markup or className) (the whole sheet is behind the switch). */
function notebookDoors() {
  const br = readFileSync(join(ROOT, 'js', 'atlas-briefing.js'), 'utf8'), acts = new Set();
  for (const m of br.matchAll(/NOTEBOOK_SHOWN\s*\?([^\n]*?):\s*''/g)) for (const b of m[1].matchAll(/btn\('([a-z]+)'/g)) acts.add(b[1]);
  const nb = readFileSync(join(ROOT, 'js', 'atlas-notebook.js'), 'utf8'), classes = new Set();
  for (const m of nb.matchAll(/(?:class="|className\s*=\s*')(atl-nb(?:-[a-z-]+)?)\b/g)) classes.add(m[1]);
  return { acts: [...acts], classes: [...classes] };
}
test('deep-tier-reds ② a spec that presses a notebook door asks NOTEBOOK_SHOWN (the doors are not drawn while it is false)', () => {
  const { acts, classes } = notebookDoors();
  assert.ok(acts.includes('keep') && classes.includes('atl-nb-strip'), 'the discovery finds the doors it was written for: ' + JSON.stringify({ acts, classes: classes.length }));
  const door = new RegExp(String.raw`(?:data-act="(?:` + acts.join('|') + String.raw`)"|\.(?:` + classes.join('|') + String.raw`)(?![\w-]))[^\n]*?\)\s*\.click\(`);
  for (const f of SPECS) {
    const src = read('tests/' + f);
    const hit = src.split('\n').find((l) => door.test(l));
    if (!hit) continue;
    assert.ok(/\bNOTEBOOK_SHOWN\b/.test(src), `${f} presses a notebook door (${hit.trim().slice(0, 100)}) without asking js/atlas-notebook-store.js NOTEBOOK_SHOWN — while it is false the door is not drawn and the click waits out the test`);
  }
});

/* ③ AN EXAMPLE'S `drawn.admin` NAMES UNITS THE RECORDS HOLD ON ITS DATE, AS THE MAP SPELLS THEM.
 *    tests/landing-showcase.spec.js asked the opened 1900 map for «Kagawa», «Nara», «Hokkaidō» — red for two nights
 *    (2026-10-06..07). The map was right: #1021 moved Japan's 1891–1943 prefectures from data/hist-admin-fill.js
 *    («Kagawa», from 1943-07-01 now) to data/hist-admin-recon.js («Kagawa Prefecture», «Hokkaido Government»), and the
 *    page held all 47 under those names; only the declaration spelled the retired record. This asks the declaration
 *    of the records themselves, in node, so the next such move is red at the PR that makes it, not in the nightly.
 *    The records are scripts/hist-fidelity.mjs `bundles()` / `firstLevelBundles()` (the list the page imports), and a
 *    unit's name is the one js/time-admin1.js `nameOf` draws for an English reader: the row's `en`, else its NAME. */
test('deep-tier-reds ③ every showcase example\'s drawn.admin is a first-level unit in force on its date, under the name the map draws', async () => {
  const { SHOWCASE } = await import('../js/showcase.js');
  const withAdmin = SHOWCASE.filter((s) => s.drawn && s.drawn.admin && s.drawn.admin.length);
  assert.ok(withAdmin.length > 0, 'the discovery finds the example it was written for');
  const { bundles, firstLevelBundles } = await import('../scripts/hist-fidelity.mjs');
  const bs = firstLevelBundles(bundles()), lv = new Set(bs[0].b.levels);
  const ymdOf = (iso) => { const m = /^(-?\d+)-(\d\d)-(\d\d)$/.exec(iso); return [+m[1], +m[2], +m[3]]; };
  const cmp = (a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]);
  for (const s of withAdmin) {
    assert.ok(s.at, `${s.id}: drawn.admin is a claim about a date, and the example names none`);
    const t = ymdOf(s.at), held = new Set();
    for (const { b } of bs) for (const f of b.feats) {
      if (!lv.has(f[1]) || cmp([f[2], f[3], f[4]], t) > 0 || cmp(t, [f[5], f[6], f[7]]) >= 0) continue;
      held.add((f[9] && f[9].en) || f[0]);
    }
    for (const n of s.drawn.admin) assert.ok(held.has(n), `${s.id}: «${n}» is not a first-level unit any record holds on ${s.at} under that name`
      + ` (the records' names that day include ${JSON.stringify([...held].filter((x) => x[0] === n[0]).slice(0, 6))})`);
  }
});

/* ④ STRIKING EACH SHARED EDGE ONCE IS NOT A LONG TASK, AND IT STRIKES EXACTLY WHAT IT STRUCK BEFORE.
 *    tests/r410-late.spec.js waited for the 1916 era country borders in `imtb-src` and timed out at 20 s two nights
 *    running (2026-10-06..07; the same stage read 13.3 s and 17.7 s on the two nights before). MEASURED 2026-10-08 on the
 *    built site (Playwright Chromium, clock to 1916-07-01 over Europe, CPU throttled 3×): with the subdivisions on, the
 *    borders reached the source after 27–35 s; with the subdivision records refused 14–21 s, and with them only delayed
 *    by 40 s 14.5–19.5 s — the subdivisions' first build competes with the borders on the page thread. The largest single
 *    function of that work was js/border-coast.js `strokedOnce` — added by #1020 to the subdivision lines (time-admin1
 *    `linesFor` / `gapLinesFor`) — walking 387,993 segments in 490–534 ms per call (node), after #1021 had tripled the
 *    reconstruction it walks. It now walks them in ~50 ms. ⚠ That alone did not move the throttled end-to-end time out
 *    of its noise (27–30 s after): the rest of the competition is the subdivisions' other page work and rendering.
 *    This holds the new walk to the old one's ANSWER on the real
 *    records at the instant the spec uses: the old rule restated (first stroke of every undirected segment on the
 *    1e-5° grid, a run split where a stroke was dropped, a zero-length step skipped) must give the identical collection. */
test('deep-tier-reds ④ strokedOnce strikes exactly the first copy of every shared edge, on the 1916 subdivisions', async () => {
  globalThis.window = globalThis.window || {};
  const { IntMapBorderCoast: BC } = await import('../js/border-coast.js');
  const { bundles, firstLevelBundles } = await import('../scripts/hist-fidelity.mjs');
  const bs = firstLevelBundles(bundles()), lv = new Set(bs[0].b.levels), t = [1916, 7, 1];
  const cmp = (a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]);
  const features = [];
  for (const { b } of bs) for (const f of b.feats) {
    if (!lv.has(f[1]) || cmp([f[2], f[3], f[4]], t) > 0 || cmp(t, [f[5], f[6], f[7]]) >= 0) continue;
    for (const poly of f[8]) for (const ri of poly) features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: b.rings[ri] }, properties: { r: ri } });
  }
  assert.ok(features.length > 1000, 'the discovery finds the subdivisions of 1916: ' + features.length);
  /* the rule as #1020 wrote it, with a string per edge — slow, and only here */
  const seen = new Set(), want = [];
  const k = (p) => Math.round((p[0] + 360) * 1e5) + ',' + Math.round((p[1] + 90) * 1e5);
  for (const f of features) {
    const c = f.geometry.coordinates, out = []; let run = null;
    for (let i = 0; i + 1 < c.length; i++) {
      if (c[i][0] === c[i + 1][0] && c[i][1] === c[i + 1][1]) continue;
      const a = k(c[i]), b = k(c[i + 1]), e = a < b ? a + '|' + b : b + '|' + a;
      if (seen.has(e)) { if (run) { out.push(run); run = null; } continue; }
      seen.add(e); if (!run) run = [c[i]]; run.push(c[i + 1]);
    }
    if (run) out.push(run);
    if (out.length) want.push({ type: 'Feature', geometry: out.length === 1 ? { type: 'LineString', coordinates: out[0] } : { type: 'MultiLineString', coordinates: out }, properties: f.properties });
  }
  const got = BC.strokedOnce({ type: 'FeatureCollection', features });
  assert.ok(want.length < features.length || seen.size > 0, 'sanity: the reference walked something');
  assert.equal(got.features.length, want.length, 'the number of stroked features');
  assert.deepEqual(got.features, want, 'strokedOnce no longer strikes what the rule says');
});

/* ⑤ AN INSTANT'S COUNTRY BORDERS ARE HANDED TO THE MAP BEFORE ITS SUBDIVISIONS START.
 *    The rest of tests/r410-late.spec.js's red (④ is the part that was one function). MEASURED 2026-10-08 on the built site,
 *    clock to 1916-07-01 over Europe, CPU throttled 3×: started together, the borders reached `imtb-src` after 23.6 / 31.5 /
 *    34.8 s and the subdivisions after 16.0–26.7 s; ordered, the borders after 10.2 / 11.1 / 12.2 s and the subdivisions
 *    after 15.3 / 16.5 / 17.1 s. Slicing the subdivisions' own script by time could not have done it: the CPU profile put
 *    that script at ~1.5 s of the window, and the rest of their cost is MapLibre cloning and rendering ~11 MB of GeoJSON.
 *    js/time-borders.js `settled()` is the turn: OPENED by the clock event (synchronously, before any debounce), CLOSED
 *    by the `go` that answers it — however it ends — or by `clear()`. This RUNS the module (scripts/histeras/time-borders.mjs)
 *    with a record read that is held open, and asks js/time-admin1.js's `go` for the order of its two awaits. */
test('deep-tier-reds ⑤ settled() is owed from the clock event until that instant\'s borders are answered, and the subdivisions wait for it', async () => {
  const { timeBorders } = await import('../scripts/histeras/time-borders.mjs');
  let releaseRead; const held = new Promise((r) => { releaseRead = r; });
  const { api, clock } = await timeBorders({ year: 1916, fetch: async () => { await held; return new Response('no', { status: 404 }); } });
  assert.equal(typeof api.settled, 'function', 'js/time-borders.js publishes settled()');
  const state = async (p) => Promise.race([p.then(() => 'settled'), new Promise((r) => setImmediate(() => r('owed')))]);
  assert.equal(await state(api.settled()), 'settled', 'nothing is owed before the clock moves');
  const when = new Date(Date.UTC(1916, 6, 1, 12));
  clock({ when, year: 1916, isLive: false });
  assert.equal(await state(api.settled()), 'owed', 'the clock event itself opens the turn — a tier whose debounce fires first still waits');
  const going = api._go(when);
  assert.equal(await state(api.settled()), 'owed', 'the borders are still being read: the turn stays open');
  releaseRead(); await going;
  assert.equal(await state(api.settled()), 'settled', 'the go that answered the instant (here: with nothing — the read failed) closed it; the subdivisions are never held by a failure');
  clock({ when, year: 1916, isLive: false });
  assert.equal(await state(api.settled()), 'owed');
  api._clear();
  assert.equal(await state(api.settled()), 'settled', 'clear() closes the turn (the clock went back to Now)');
  /* the reader: js/time-admin1.js `go` awaits the turn after aiming the tile line and BEFORE it loads its records */
  const ta = read('js/time-admin1.js'), at = ta.indexOf('async function go(when)'), body = ta.slice(at, ta.indexOf('\n      }\n', at));
  const iSettled = body.indexOf('.settled()'), iLoad = body.indexOf('load()'), iAim = body.indexOf('vtAim(');
  assert.ok(at > 0 && iSettled > 0 && iLoad > 0, 'time-admin1 go() awaits the borders\' turn and loads its records');
  assert.ok(iAim < iSettled && iSettled < iLoad, 'time-admin1 go(): the tile line is aimed, then the borders\' turn is awaited, then the records are loaded');
});
