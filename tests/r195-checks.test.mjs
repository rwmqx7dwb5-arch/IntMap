/* ============================================================================
 *  R195 — the source-level invariants behind this round's four changes.
 *
 *  These are the claims a browser test cannot make cheaply: that a literal is
 *  written in exactly two places and they agree, that a moved body really moved,
 *  and that the one value a split module cannot inherit is handed to it.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

const appBody = rd('js/app-body.js');
/* (#R200) the session/tab subject left js/app-body.js for its own real ES module. These assertions
   are pointed at the file that HOLDS each half now rather than at a concatenation: if the snapshot
   ever moves again, "not in this file" is a failure, which is what a source-level guard is for. */
const sessionTabs = rd('js/session-tabs.js');
const mapUi = rd('js/map-ui.js');
const geoEngine = rd('js/geo-engine.js');
const cesium = rd('js/cesium-engine.js');
const tsunami = rd('js/tsunami.js');
const satProto = rd('js/sat-proto.js');
const countries = rd('js/countries-ui.js');
const mainJs = rd('src/main.js');

/* ── ① the sidebar state: one key, written in two places, and they must agree ─────────────────── */
test('R195 ①: the session key the sidebar reads is the key the session writes', () => {
  /* Three sites, one literal: the persistence block's KEY (the only WRITER), the #R122 early read of
     the saved layer list, and #R195's early read of the sidebar states. A fourth appearing without a
     reason, or any of them drifting, is what this pins — the sidebars restore from a key written
     ~2,500 lines away, and a typo there would fail silently as "the state was never saved". */
  /* (#R200) …and the WRITER is now js/session-tabs.js while the two early reads stayed behind, so the
     count is taken across both files and each site is pinned to the file it lives in. */
  const keys = [...appBody.matchAll(/'intmap_session2'/g)].length + [...sessionTabs.matchAll(/'intmap_session2'/g)].length;
  assert.equal(keys, 3, `'intmap_session2' should appear exactly three times across js/app-body.js + js/session-tabs.js `
    + `(the KEY, the early layer read, the early sidebar read); found ${keys}`);
  assert.match(sessionTabs, /const KEY='intmap_session2'/, 'the persistence block still owns the key');
  assert.match(appBody, /localStorage\.getItem\('intmap_session2'\)/, 'the sidebar read uses the same key');
});

test('R195 ①: both sidebars are recorded, and every route out of them records itself', () => {
  assert.match(sessionTabs, /sbOpen,\s*lsrOpen/, 'the snapshot carries both sidebar states');
  assert.match(sessionTabs, /sbOpen=!el\.classList\.contains\('collapsed'\)/, 'the left state is read off the DOM');
  assert.match(sessionTabs, /lsrOpen=el\.classList\.contains\('open'\)/, 'the right state is read off the DOM');
  assert.match(appBody, /window\._imSessionUI=_sessUI/, 'the wanted state is published for the layer panel');
  /* the left toggle, and the right panel's open/close/toggle, all save */
  const saves = [...mapUi.matchAll(/window\._imSaveSession&&window\._imSaveSession\(\)/g)].length;
  assert.ok(saves >= 3, `the right layer panel should record open, close and toggle; found ${saves}`);
  assert.match(appBody, /classList\.toggle\('collapsed'\);[\s\S]{0,400}?_imSaveSession/,
    'the left sidebar toggle records itself');
  /* …and boot restores the right panel only when the last session left it open */
  assert.match(mapUi, /window\._imSessionUI&&window\._imSessionUI\.right===true&&!isMob\(\)/,
    'a first visit still boots with the layer panel closed');
});

/* ── ② the dynamic image is parameterised by the engine, not by latitude ──────────────────────── */
test('R195 ②: both engines answer "what latitude is image row r", and differently', () => {
  assert.match(geoEngine, /imageRowLatitudes\(coordinates,height\)/, 'the MapLibre adapter implements it');
  assert.match(cesium, /imageRowLatitudes\(coordinates,height\)/, 'the Cesium adapter implements it');
  /* MapLibre's is the Mercator inverse; Cesium's is linear in latitude. If these two ever became the
     same expression, the bug this round fixed would be back on one of the engines. */
  assert.match(geoEngine, /Math\.log\(Math\.tan\(Math\.PI\s*\/\s*4\s*\+/, 'MapLibre maps rows through Mercator Y');
  assert.match(geoEngine, /2\s*\*\s*Math\.atan\(Math\.exp\(y\)\)/, '…and inverts it to get the latitude back');
  assert.match(cesium, /out\[r\]=n\+\(s-n\)\*\(r\+0\.5\)\/H/, 'a Cesium rectangle is geographic');
  assert.doesNotMatch(cesium.slice(cesium.indexOf('imageRowLatitudes'), cesium.indexOf('imageRowLatitudes') + 900),
    /Math\.log\(Math\.tan/, 'the geographic engine must NOT apply a Mercator transform');
  /* and it is reachable through the contract, not only on the adapter */
  assert.match(geoEngine, /imageRowLatitudes:\(c,h\)=>A\(\)\.imageRowLatitudes/, 'exposed on the MapLibre facade');
  assert.match(cesium, /imageRowLatitudes\(c,h\)\{ const v=V\(\)/, 'exposed on the Cesium facade');
});

test('R195 ②: the tsunami painter asks for the row map instead of assuming N−1−j', () => {
  assert.match(tsunami, /GE\(\)\.layers\.imageRowLatitudes\(c,/, 'the painter asks the engine');
  /* ⚠ (#R197) THE GRID GOT A SECOND RESOLUTION, SO THE ROW WIDTH IS NOT `N` ANY MORE. The model is
     1440 × 640 and the PICTURE is decimated from it (a full-resolution Int8 frame is 921 KB and a run
     is 140 of them), so the painter's stride is the display width FX. The property under test is
     unchanged and is still the one that matters: the row a pixel is painted from is the row the
     ENGINE says is drawn there, not N−1−j. */
  assert.match(tsunami, /const src=rowOf\[r\]\*FX, dst=r\*FX/, 'it paints the grid row that belongs at each image row');
  /* the old, wrong mapping must be gone from the draw path */
  assert.doesNotMatch(tsunami, /const src=j\*(N|FX), dst=\((N|FX)-1-j\)\*(N|FX)/,
    'the latitude-indexed image row is what put the wave 8° from its epicentre');
  /* the canvas is sized from the row map, not pinned to the grid */
  assert.match(tsunami, /height:imgH/, 'the texture height comes from chooseImgH()');
  assert.match(tsunami, /Math\.min\(2048,Math\.ceil\(NY2\*worst\)\)/, 'and it is capped');
});

/* ── ③ one hit test per pointer move ─────────────────────────────────────────────────────────── */
test('R195 ③: the hover triad is dispatched by the engine, in one query', () => {
  assert.match(geoEngine, /_hoverHub\(\)/, 'the shared dispatcher exists');
  assert.match(geoEngine, /queryRenderedFeatures\(ev\.point,\{layers:ids\}\)/,
    'ONE query naming every registered layer — the whole point of the change');
  assert.match(geoEngine, /e==='mousemove'\|\|e==='mouseenter'\|\|e==='mouseleave'/,
    'onLayer routes the hover triad to the hub');
  /* enter carries features, leave does not — MapLibre's own delegation semantics */
  assert.match(geoEngine, /H\.emit\(id,'mouseleave',ev,null\)/, 'leave is emitted without features');
  assert.match(geoEngine, /H\.emit\(id,'mouseenter',ev,feats\)/, 'enter is emitted with them');
  /* re-wiring is keyed on the map instance, not a boolean (a re-created map must not lose the hub) */
  assert.match(geoEngine, /H\.wired===m/, 'the wiring is keyed on the map instance');
  /* clicks are deliberately left with the renderer */
  assert.doesNotMatch(geoEngine, /e==='click'[^\n]*_hoverHub/, 'click delegation is unchanged');
});

/* ── ④ the split, and the one value it cannot inherit ────────────────────────────────────────── */
test('R195 ④: the satellite protocol lives in js/sat-proto.js and nowhere else', () => {
  /* a needle from deep inside the moved body: a leftover copy in the shell would win silently */
  const needle = "const _satUrl=(z,y,x)=>_SAT_HOSTS[(x+y)&1]";
  assert.ok(satProto.includes(needle), 'js/sat-proto.js really carries the body');
  assert.ok(!appBody.includes(needle), 'js/app-body.js no longer carries a second copy');
  assert.match(appBody, /window\.IntMapModules\.satProto\(IM_HOST\)/, 'the shell calls the factory');
  assert.match(mainJs, /import '\.\.\/js\/sat-proto\.js';/, 'it is in the module graph');
  assert.match(mainJs, /'satProto',/, "…and in MODULE_FACTORIES, or __imModuleCheck stays silent about it");
  /* ⚠ the one free reference. Inheriting it would leave it undefined and stop @2x for everyone,
     with no error anywhere — the exact silent failure scripts/check-split-scope.mjs exists for. */
  assert.match(appBody, /get hiDPITiles\(\)\{ return _hiDPITiles; \}/, 'the shell hands the decision over');
  assert.match(satProto, /const _hiDPITiles=HOST\.hiDPITiles/, 'the module takes it rather than inheriting it');
  /* the flag the style below the call site reads is still set by the module */
  assert.match(satProto, /window\.__imSatProto=true/, 'the load-bearing flag moved with the body');
});

/* ── ⑤ boot: the 4.3 MB geometry is no longer what the first seconds pay for ──────────────────── */
test('R195 ⑤: the country table loads coarse-first and upgrades the geometry at idle', () => {
  assert.match(countries, /gj=await grab\('ne_110m_admin_0_countries\.geojson'\)/,
    'the rows come from the small file');
  assert.match(countries, /grab\('ne_10m_admin_0_countries\.geojson'\)[\s\S]{0,200}?if\(!\(hi&&hi\.features/,
    'the 10 m geometry still arrives');
  assert.match(countries, /requestIdleCallback\(run,\{timeout:6000\}\)/, 'and it waits for an idle main thread');
  /* ⚠ MERGE, DO NOT REPLACE: countryStats records are enriched in place by the PPP pass, the
     indicator gap-fill and the time machine. Handing each code a fresh object would drop all three. */
  assert.match(countries, /s\.area=Math\.round\(v\.area\); s\._area=v\.area;/, 'the upgrade merges');
  assert.doesNotMatch(countries, /best\.forEach\(\(v,code\)=>\{[\s\S]{0,300}?HOST\.countryStats\[code\]=\{/,
    'the upgrade must never replace a stats record wholesale');
});

/* ── ⑦ the CI plan covers every spec exactly once ─────────────────────────────────────────────── */
test('R195 ⑦: the measured shard plan runs every spec exactly once, and is balanced', () => {
  const ci = rd('.github/workflows/ci.yml');
  /* the group counts CI actually asks for — read them rather than assuming, so this test tracks
     the workflow instead of a copy of it */
  /* ⚠ (#R203) TWO TIERS NOW, AND THE PROPERTY IS ABOUT BOTH OF THEM TOGETHER. The gate runs the core
     tier and the nightly/post-merge job runs the deep one, so neither plan covers the suite on its
     own — but their UNION still must, exactly once, or a spec has quietly stopped running anywhere.
     The tiers and their group counts are read out of the workflow, so this tracks it rather than
     copying it: each `browser*` job states its tier once, in the `with:` line of the composite action. */
  const jobs = [];
  for (const m of ci.matchAll(/\{ suite: (\w+), shard: \d+, of: (\d+) \}/g)) {
    /* which job block is this matrix entry in? the nearest `tier: <x>` BELOW it in the file */
    const tier = (/with: \{ tier: (\w+),/.exec(ci.slice(m.index)) || [, 'core'])[1];
    if (!jobs.some((j) => j.tier === tier && j.pool === m[1])) jobs.push({ tier, pool: m[1], of: +m[2] });
  }
  assert.ok(jobs.some((j) => j.tier === 'core'), 'the core tier appears in the matrix');
  assert.ok(jobs.some((j) => j.tier === 'deep' && j.pool === 'cesium'), 'and the deep tier carries the solo pool');

  const run = (a) => execFileSync(process.execPath, [join(ROOT, 'scripts/shard-plan.mjs'), ...a],
    { cwd: ROOT, encoding: 'utf8' });
  const seen = [];
  for (const j of jobs) {
    for (let g = 1; g <= j.of; g++) {
      const files = run(['--tier', j.tier, '--pool', j.pool, '--group', String(g), '--of', String(j.of)]).trim().split(/\s+/);
      assert.ok(files.length && files[0], `${j.tier}/${j.pool} group ${g} is not empty — an empty list makes ` +
        'playwright run the WHOLE suite, which reads as a very slow pass');
      seen.push(...files);
    }
  }
  /* ⚠ THE PROPERTY THAT MATTERS: nothing falls between the pools, and nothing runs twice. The old
     hand-split asserted this in a comment ("31 + 329 = 360"); it is checked now.
     An entry may be a whole file or one test of it (`tests/x.spec.js:233`) — a file over the target
     is expanded so its own tests can spread. Either way every spec must be represented. */
  const expected = readdirSync(join(ROOT, 'tests'))
    .filter((f) => f.endsWith('.spec.js'))
    .filter((f) => !/^prod-smoke\.spec\.js$|^r184-imagery-profile\.spec\.js$/.test(f))
    .map((f) => 'tests/' + f).sort();
  const fileOf = (e) => e.replace(/:\d+$/, '');
  assert.deepEqual([...new Set(seen.map(fileOf))].sort(), expected,
    'every spec CI is meant to run appears in the plan');
  assert.equal(new Set(seen).size, seen.length, 'and nothing is scheduled twice');

  /* ⚠ AND AN EXPANDED FILE MUST BE EXPANDED COMPLETELY. Asking for `x.spec.js:233` runs that test
     and no other, so a file that is expanded but missing one of its tests loses it silently — the
     exact failure mode ("ran nothing, reported green") this whole mechanism must not have. */
  const expanded = new Set(seen.filter((e) => /:\d+$/.test(e)).map(fileOf));
  for (const f of expanded) {
    const src = readFileSync(join(ROOT, f), 'utf8').split('\n');
    const lines = src.reduce((a, l, i) => (/^\s*test(\.(only|skip|fixme|fail|slow))?\s*\(/.test(l) ? a.concat(i + 1) : a), []);
    const got = seen.filter((e) => fileOf(e) === f && /:\d+$/.test(e)).map((e) => +e.split(':').pop()).sort((a, b) => a - b);
    assert.deepEqual(got, lines.sort((a, b) => a - b),
      `${f} is expanded, so every one of its tests must appear — otherwise the missing ones never run`);
  }
});

test('R195 ⑦: a spec with no recorded time is scheduled, not treated as free', () => {
  const src = rd('scripts/shard-plan.mjs');
  assert.match(src, /times\[f\] == null \? median : times\[f\]/,
    'an unmeasured spec is charged the median — otherwise a new slow file is invisible to the plan');
  assert.match(src, /process\.exit\(1\)/, 'and an empty group is an error rather than "run everything"');
  /* the solo property is data, not another regex in the config */
  const dur = JSON.parse(rd('tests/durations.json'));
  assert.ok(Array.isArray(dur.solo) && dur.solo.length, 'tests/durations.json carries the solo list');
  assert.doesNotMatch(rd('playwright.config.js'), /IM_SUITE === 'flight'/,
    'the hand-carved flight suite is gone — the planner is what spreads those specs now');
});

/* ── ⑧ main's own result is kept, so attribution is a lookup and not a 12-minute experiment ───── */
test('R195 ⑧: a failure is classified against main without re-running main', () => {
  const base = JSON.parse(rd('tests/baseline.json'));
  assert.equal(base.ref, 'main', 'the baseline is main\'s, and says so');
  const n = Object.keys(base.tests || {}).length;
  assert.ok(n > 200, `the baseline covers the suite; it has ${n} entries`);
  /* the three outcomes must all be expressible — a run that only ever records "passed" would
     classify every real pre-existing failure as MINE and send the next round chasing itself */
  const kinds = new Set(Object.values(base.tests).map((t) => t.status));
  assert.ok(kinds.has('passed'), 'passes are recorded');
  assert.ok(kinds.has('flaky') || kinds.has('failed'),
    'and so is main failing — otherwise ALSO ON MAIN can never be the answer');

  const src = rd('scripts/baseline.mjs');
  assert.match(src, /b\.status === 'passed' \? 'MINE' : 'ALSO ON MAIN'/, 'the verdict rule');
  assert.match(src, /!b \? 'UNKNOWN'/, 'a test main never recorded is UNKNOWN, never someone else\'s problem');
  /* ⚠ only main may write it: a branch recording its own results would define its own "normal" */
  /* (#R203) the shard's own steps live in the composite action both browser jobs call */
  const act = rd('.github/actions/browser-tier/action.yml');
  assert.match(act, /if: \$\{\{ github\.ref == 'refs\/heads\/main' && !cancelled\(\) \}\}[\s\S]{0,200}?baseline\.mjs --update/,
    'the baseline is written only on main');
  assert.match(act, /if: \$\{\{ failure\(\) \}\}[\s\S]{0,200}?baseline\.mjs --classify/,
    'and a red PR job says which failures main does not have');
});

/* ── ⑥ the local worker count is written down, not remembered ─────────────────────────────────── */
test('R195 ⑥: a local run does not need a flag nobody can remember', () => {
  const cfg = rd('playwright.config.js');
  assert.match(cfg, /Number\(process\.env\.PW_WORKERS \|\| 2\)/,
    'the local default is 2 workers — this machine produces contention failures above that');
  assert.doesNotMatch(cfg, /workers: isCI \? \([^)]*\) : undefined/, 'the old implicit default is gone');
});
