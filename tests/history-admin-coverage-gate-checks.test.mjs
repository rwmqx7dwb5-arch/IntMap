/* ============================================================================
 *  IntMap · the gates over the historical subdivision bundles, broken on purpose
 *  (scripts/build-hist-admin1.mjs --check = check:histadmin · scripts/build-hist-admin-fill.mjs --check
 *   = check:histfill) — and the other things #R719 touched
 *  (consolidated from tests/r680-histadmin-gate and r719-histmap-coverage; each test keeps its tag)
 * ----------------------------------------------------------------------------
 *  #R680 「歴史的な行政区分の束 2 本にゲートを足す」 — 25.8 MB of shipped subdivisions had no `--check`, no
 *  package.json entry and no CI step. #R719 「地方区分のcoverageが一部だけだったりする」「ある国家でも、
 *  一部にあっても全体にはなかったりする」 — the tiers' levels became a partition, the century rule a
 *  rule about holes, the name ceiling per tier, and the fill record answers a country whole or not
 *  at all; the same round took the coastline out of the default set and made Draw capture finer.
 *
 *  ⚠ NOTHING HERE RESTATES A RULE (#R488): every check BREAKS something and asks whether the gate
 *  notices, which is the only way to learn an assertion is reachable at all (#R673). The mutations
 *  run against SYNTHETIC ROOTS — both gates derive their ROOT from their own path, so a temp directory
 *  holding a copy of the script and a few tiny bundles IS a root — and each root is removed in a
 *  `finally`, so no test leaves anything behind for another.
 *  ⚠ THIS FILE IS SLOW ON PURPOSE: #R719 ① runs check:histfill over the committed bundles (≈ 4.5 min
 *  on this machine). That cost is the gate's own and is measured, not avoided.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HIST_ADMIN_GAPS } from '../js/border-coast.js';
import { registry, shipTags } from '../scripts/histadmin/langs.mjs';
import { ciRuns } from './helpers/ci-reach.mjs';
import { publishedList } from './helpers/layer-groups.mjs';   /* the default lists are views of js/layer-manifest.js */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const SCRIPT = join(ROOT, 'scripts', 'build-hist-admin1.mjs');
const ADMIN = SCRIPT;
const FILL = join(ROOT, 'scripts', 'build-hist-admin-fill.mjs');
/* the languages this build may ADD a name in — read from the policy, never listed here */
const SHIP = shipTags(ROOT, registry(ROOT));
/* a closed, on-globe ring of four points near (lon, lat) */
const ring = (lon, lat) => [[lon, lat], [lon + 1, lat], [lon + 1, lat + 1], [lon, lat]];

/* copy a script and everything it imports RELATIVELY into `dir` (a listed set breaks on the next
   refactor — #R695 learned that the hard way in #R680's harness below). The files it adds by PATH are the
   ones the builder evaluates rather than imports (so the walk cannot see them); this is #R719's list,
   a superset of the one #R680 wrote. */
function copyGraph(dir, script, rel) {
  const seen = new Set();
  (function follow(abs, r) {
    if (seen.has(r)) return;
    seen.add(r);
    const body = readFileSync(abs, 'utf8');
    mkdirSync(dirname(join(dir, r)), { recursive: true });
    copyFileSync(abs, join(dir, r));
    for (const m of body.matchAll(/^\s*(?:import|export)\b[^\r\n]*?from\s*['"](\.[^'"]+)['"]/gm)) {
      const child = resolve(dirname(abs), m[1]);
      follow(child, relative(ROOT, child).split(sep).join('/'));
    }
  })(script, rel);
  for (const f of ['js/ohm-rings.js', 'js/lang-registry.js', 'js/locales/_langs.js', 'js/hist-scale.js']) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    copyFileSync(join(ROOT, f), join(dir, f));
  }
}

function runGate(dir, rel) {
  const script = join(dir, rel);
  try { return { failed: false, out: execFileSync(process.execPath, [script, '--check'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { return { failed: true, out: String(e.stdout || '') + String(e.stderr || '') }; }
}
function firesAdmin(mutate) {
  const dir = adminWorld(mutate);
  try { return runGate(dir, 'scripts/build-hist-admin1.mjs'); } finally { rmSync(dir, { recursive: true, force: true }); }
}


/* ══ #R680 — the gate over data/hist-admin1.js + data/hist-admin2.js ════════════════════════ */
/* one well-formed tier: `n` rings, one unit per ring, all of them in force from year 1 to 9999
   so that every century the bundle claims to reach has something to draw. */
function tier680(n, opts = {}) {
  const rings = [], feats = [];
  for (let i = 0; i < opts.rings; i++) rings.push(ring(i, i));
  for (let i = 0; i < opts.rings; i++)
    /* ⚠ (#R695) A WELL-FORMED WORLD IS NOW ALSO A READABLE ONE. The gate grew an invariant about
       how much of a tier a reader of a shipped language can actually read, so a fixture that names
       every unit in English only is not well-formed any more — it would fail check ② and make
       every mutation below look like it passed for the wrong reason. The languages are READ from
       the policy (scripts/histadmin/langs.mjs), never listed here, so widening the policy back to
       nine does not come back through this file. */
    feats.push(['unit ' + n + '-' + i, 2 * n + 2, 1, 1, 1, 9999, 12, 31, [[i]],
      Object.fromEntries(SHIP.map((t) => [t, 'Unit ' + i])), 1000 * n + i]);
  return { v: 1, src: 'OpenHistoricalMap contributors (CC0) · openhistoricalmap.org',
           built: '2026-09-11', since: 1, tolerance: 0.02, levels: [2 * n + 1, 2 * n + 2], rings, feats };
}

/* build a temporary root the gate will accept, then let the caller break exactly one thing */
function world(mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'r680-'));
  mkdirSync(join(dir, 'scripts')); mkdirSync(join(dir, 'data')); mkdirSync(join(dir, 'js'));
  /* ⚠⚠⚠ (#R695) THE SCRIPT'S OWN IMPORTS ARE COPIED BY FOLLOWING THEM, NOT BY LISTING THEM (copyGraph
     above): the moment the builder grew local modules all ten mutation checks went red with
     ERR_MODULE_NOT_FOUND — the safety net taken out by a refactor nobody could see from here. */
  copyGraph(dir, SCRIPT, 'scripts/build-hist-admin1.mjs');

  const bundles = { 1: tier680(1, { rings: 3 }), 2: tier680(2, { rings: 2 }) };
  const globals = { 1: '__HISTADM1', 2: '__HISTADM2' };
  const bc = { v: 1, sets: { ha: { file: 'data/hist-admin1.js', rings: 3 },
                             ha2: { file: 'data/hist-admin2.js', rings: 2 } } };
  const extra = mutate ? mutate(bundles, globals, bc) : null;

  for (const k of Object.keys(bundles))
    writeFileSync(join(dir, 'data', 'hist-admin' + k + '.js'), 'window.' + globals[k] + '=' + JSON.stringify(bundles[k]) + ';\n');
  if (extra) for (const [name, body] of Object.entries(extra)) writeFileSync(join(dir, 'data', name), body);
  writeFileSync(join(dir, 'data', 'border-coast.js'), 'window.__IMBCOAST=' + JSON.stringify(bc) + ';\n');
  return dir;
}

/* mutate → run → clean up, in one place so a failing assertion never leaks a temp tree */
function fires(mutate) {
  const dir = world(mutate);
  try { return runGate(dir, 'scripts/build-hist-admin1.mjs'); } finally { rmSync(dir, { recursive: true, force: true }); }
}

/* ── ① the gate exists, is declared, and passes on the bytes actually shipped ─────────────── */
test('#R680 ① `npm run check:histadmin` passes on the committed bundles', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts || {};
  assert.equal(pkg['check:histadmin'], 'node scripts/build-hist-admin1.mjs --check',
    'the gate must be declared in package.json — an undeclared gate is invisible to gate-callers');
  const out = execFileSync(process.execPath, [SCRIPT, '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.match(out, /^✓ hist-admin/, out);
  /* the summary must be about EVERY tier — a gate that silently checked one would also print ✓.
     ⚠ (#R719) the number is COUNTED from data/, not typed: this read `2 tiers` and a third one
     (data/hist-admin3.js, admin_level 7) made a correct gate look like a broken test. */
  const shipped = readdirSync(join(ROOT, 'data')).filter((f) => /^hist-admin\d+\.js$/.test(f)).length;
  /* ⚠ (#R719) `'\\b'` — inside a SINGLE-QUOTED string `\b` is U+0008 (backspace), not the regex
     word boundary, so the first version of this line could never match its own gate's output. */
  assert.match(out, new RegExp('\\b' + shipped + ' tiers\\b'), out);
});

/* ── ② the harness itself is honest: an unbroken synthetic world passes ────────────────────
   Without this, every mutation below could be passing for the wrong reason (the temp root being
   malformed rather than the mutation being caught) — the #R585 shape, where a stub that differs
   from the real thing makes the test agree with itself. */
test('#R680 ② a well-formed synthetic pair passes, so a failure below is the mutation', () => {
  const r = fires(null);
  assert.equal(r.failed, false, r.out);
  assert.match(r.out, /2 tiers/);
});

/* ── ③ the #R604 accident: a file that does not name itself ───────────────────────────────── */
test('#R680 ③ a tier that names another tier\'s global fails', () => {
  const r = fires((b, g) => { g[2] = '__HISTADM1'; });
  assert.equal(r.failed, true, 'hist-admin2.js declaring __HISTADM1 must fail — #R604 shipped 15 MB of exactly that');
  assert.match(r.out, /must define __HISTADM2/);
});

/* ── ④ a ring index nothing resolves ──────────────────────────────────────────────────────── */
test('#R680 ④ a feature pointing outside the ring pool fails', () => {
  const r = fires((b) => { b[1].feats[0][8] = [[99]]; });
  assert.equal(r.failed, true);
  assert.match(r.out, /points at ring 99/);
});

/* ── ⑤ a ring nobody draws is bytes shipped for nothing ───────────────────────────────────── */
test('#R680 ⑤ a pooled ring no feature references fails', () => {
  const r = fires((b, g, bc) => { b[1].rings.push(ring(40, 40)); bc.sets.ha.rings = 4; });
  assert.equal(r.failed, true);
  assert.match(r.out, /referenced by no feature/);
});

/* ── ⑥ the century property — the reason this gate exists in the shape it does ─────────────
   NOT a headcount: the mutation leaves a perfectly well-formed bundle that simply has nothing
   in force after 1900, which is the way a rebuild goes quietly wrong. */
test('#R680 ⑥ a century with nothing in force fails', () => {
  const r = fires((b) => { for (const f of b[1].feats) { f[5] = 1900; f[6] = 12; f[7] = 31; } });
  assert.equal(r.failed, true);
  assert.match(r.out, /nothing is in force on 2001-06-15|nothing is in force on 1901-06-15/);
});

/* ── ⑦ two records under one OHM relation id would send a tap to the wrong geometry (#R669) ─ */
test('#R680 ⑦ a relation id reused across the two tiers fails', () => {
  const r = fires((b) => { b[2].feats[0][10] = b[1].feats[0][10]; });
  assert.equal(r.failed, true);
  assert.match(r.out, /reuses relation/);
});

/* ── ⑧ the O(1) half of the border-coast join: marks built against a different ring count ─── */
test('#R680 ⑧ a bundle rebuilt without its ring marks fails', () => {
  const r = fires((b, g, bc) => { bc.sets.ha.rings = 7; });
  assert.equal(r.failed, true);
  assert.match(r.out, /border-coast\.js was built against 7/);
});

/* ── ⑨ the tier a file names and the tier it holds are one fact ───────────────────────────── */
test('#R680 ⑨ a unit at a level this tier does not hold fails', () => {
  const r = fires((b) => { b[1].feats[0][1] = 6; });
  assert.equal(r.failed, true);
  assert.match(r.out, /admin_level 6, which this tier does not hold/);
});

/* ── ⑩ the nameless ceiling is a ceiling, and it is reachable ─────────────────────────────── */
test('#R680 ⑩ more nameless units than the ceiling fails', () => {
  const r = fires((b) => {
    for (const k of ['1', '2']) for (const f of b[k].feats) { f[0] = ''; f[9] = {}; }
  });
  assert.equal(r.failed, true, 'five nameless units against a ceiling of three must fail');
  assert.match(r.out, /carry no name in any language/);
});

/* ── ⑪ the list of tiers is the directory, not a pair of filenames ────────────────────────── */
test('#R680 ⑪ a third tier is checked the day it appears, without editing the gate', () => {
  const broken = tier680(3, { rings: 1 });
  broken.feats[0][8] = [[5]];                       /* out of pool — only a checked tier notices */
  const r = fires((b, g, bc) => {
    bc.sets.ha3 = { file: 'data/hist-admin3.js', rings: 1 };
    return { 'hist-admin3.js': 'window.__HISTADM3=' + JSON.stringify(broken) + ';\n' };
  });
  assert.equal(r.failed, true, 'a hand-written pair of filenames would have skipped data/hist-admin3.js entirely');
  assert.match(r.out, /hist-admin3\.js/);
});

/* ══ #R719 — the historical map's coverage, and the two tools the same round touched ═════════ */
/* one well-formed tier at the levels given, every unit in force from year 1 to 9999 */
function tier719(n, levels, rings) {
  const R = [], F = [];
  for (let i = 0; i < rings; i++) R.push(ring(i, i));
  for (let i = 0; i < rings; i++)
    F.push(['unit ' + n + '-' + i, levels[levels.length - 1], 1, 1, 1, 9999, 12, 31, [[i]],
      Object.fromEntries(SHIP.map((t) => [t, 'Unit ' + i])), 1000 * n + i]);
  return { v: 1, src: 'OpenHistoricalMap contributors (CC0) · openhistoricalmap.org',
           built: '2026-09-15', since: 1, tolerance: 0.02, levels, rings: R, feats: F };
}

/* a synthetic hist-admin root, with `mutate` free to break exactly one thing */
function adminWorld(mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'r719-'));
  mkdirSync(join(dir, 'data'), { recursive: true });
  copyGraph(dir, ADMIN, 'scripts/build-hist-admin1.mjs');
  const bundles = { 1: tier719(1, [3, 4], 3), 2: tier719(2, [5, 6], 2) };
  const bc = { v: 1, sets: { ha: { file: 'data/hist-admin1.js', rings: 3 },
                             ha2: { file: 'data/hist-admin2.js', rings: 2 } } };
  /* the ceilings are keyed BY FILE now, so a synthetic tier needs one — the harness patches the
     committed table rather than inventing a second one, so the check under test is the real one. */
  let ceilings = null;
  if (mutate) ceilings = mutate(bundles, bc);
  for (const k of Object.keys(bundles))
    writeFileSync(join(dir, 'data', 'hist-admin' + k + '.js'), 'window.__HISTADM' + k + '=' + JSON.stringify(bundles[k]) + ';\n');
  writeFileSync(join(dir, 'data', 'border-coast.js'), 'window.__IMBCOAST=' + JSON.stringify(bc) + ';\n');
  if (ceilings) {
    const p = join(dir, 'scripts', 'build-hist-admin1.mjs');
    writeFileSync(p, readFileSync(p, 'utf8').replace(/const UNREADABLE_MAX = \{[\s\S]*?\};/,
      'const UNREADABLE_MAX = ' + JSON.stringify(ceilings) + ';'));
  }
  return dir;
}

/* ── ① THE HARNESS IS HONEST, AND THE TWO GATES PASS ON THE BYTES ACTUALLY SHIPPED ───────────
   Without the first half every mutation below could be passing because the temp root is malformed
   rather than because the mutation was caught (#R585). */
test('#R719 ① an unbroken synthetic pair passes, and both gates pass on the committed bundles', () => {
  assert.equal(firesAdmin(null).failed, false, 'the synthetic world must pass before a mutation means anything');

  const pkg = JSON.parse(read('package.json')).scripts || {};
  assert.equal(pkg['check:histfill'], 'node scripts/build-hist-admin-fill.mjs --check',
    'the new gate must be DECLARED — gate-callers/gate-lists/ci-gates take package.json as their universe');
  /* ⚠ (#R771) ASKED OF WHAT CI RUNS, NOT OF HOW ci.yml SPELLS IT — tests/helpers/ci-reach.mjs.
     The 28 declared gates stopped being one step each when they were split across three machines;
     grepping the workflow for this gate's name reported it as unrun while it ran every time. */
  assert.ok(ciRuns('check:histfill'), 'and CI must call it');

  assert.match(execFileSync(process.execPath, [ADMIN, '--check'], { cwd: ROOT, encoding: 'utf8' }), /^✓ hist-admin/);
  assert.match(execFileSync(process.execPath, [FILL, '--check'], { cwd: ROOT, encoding: 'utf8' }), /^✓ hist-admin-fill/);
});

/* ── ② THE TIERS' LEVELS ARE A PARTITION, NOT ARITHMETIC ON A FILENAME ────────────────────────
   The old rule was `tier N holds 2N+1 and 2N+2`, which made a one-level tier — the shape
   data/hist-admin3.js actually is — a failure. What it was protecting is #R604's accident, and
   that survives as a property of the SET. */
test('#R719 ② a one-level tier is lawful; an overlapping one and a hole are not', () => {
  assert.equal(firesAdmin((b, bc) => {
    b[3] = tier719(3, [7], 1);
    bc.sets.ha3 = { file: 'data/hist-admin3.js', rings: 1 };
    return { 'data/hist-admin1.js': 100, 'data/hist-admin2.js': 100, 'data/hist-admin3.js': 100 };
  }).failed, false, 'a tier that ships ONE admin level must be accepted');

  const dup = firesAdmin((b, bc) => {
    b[3] = tier719(3, [5, 7], 1);                       /* 5 already belongs to tier 2 */
    bc.sets.ha3 = { file: 'data/hist-admin3.js', rings: 1 };
    return { 'data/hist-admin1.js': 100, 'data/hist-admin2.js': 100, 'data/hist-admin3.js': 100 };
  });
  assert.equal(dup.failed, true, dup.out);
  assert.match(dup.out, /already held by an earlier tier/, dup.out);

  const hole = firesAdmin((b, bc) => {
    b[3] = tier719(3, [8], 1);                          /* 7 is shipped by nobody */
    bc.sets.ha3 = { file: 'data/hist-admin3.js', rings: 1 };
    return { 'data/hist-admin1.js': 100, 'data/hist-admin2.js': 100, 'data/hist-admin3.js': 100 };
  });
  assert.equal(hole.failed, true, hole.out);
  assert.match(hole.out, /skip admin_level 7/, hole.out);
});

/* ── ③ THE CENTURY RULE IS ABOUT A HOLE, NOT ABOUT `since` ────────────────────────────────────
   `since` is the clock floor the build swept from, so reading it as a claim made every sparse
   tier a failure. What is genuinely owed is that a tier, once it begins, has no empty century. */
test('#R719 ③ a tier that simply starts late passes; one with a gap in the middle fails', () => {
  const late = firesAdmin((b) => {
    for (const f of b[2].feats) { f[2] = 1500; }     /* nothing before 1500 — not a hole */
    return null;
  });
  assert.equal(late.failed, false, late.out);

  const gap = firesAdmin((b) => {
    b[2].feats[0][5] = 1200; b[2].feats[0][6] = 1; b[2].feats[0][7] = 1;
    b[2].feats[1][2] = 1900;                          /* 1200 … 1900 draws nothing */
    return null;
  });
  assert.equal(gap.failed, true, gap.out);
  assert.match(gap.out, /a century between this tier’s own first record and now draws nothing/, gap.out);
});

/* ── ④ THE NAME CEILING IS PER TIER, SO A NEW RECORD CANNOT HIDE INSIDE A LARGE GOOD ONE ──────
   One share over a mixture could be satisfied by its biggest member. */
test('#R719 ④ a shipped tier with no stated ceiling fails, and one over its own ceiling fails', () => {
  const unstated = firesAdmin((b, bc) => {
    b[3] = tier719(3, [7], 1);
    bc.sets.ha3 = { file: 'data/hist-admin3.js', rings: 1 };
    /* (#R730) the entry states a share AND a headcount — see UNREADABLE_MAX */
    return { 'data/hist-admin1.js': { pct: 100, count: 1e9 }, 'data/hist-admin2.js': { pct: 100, count: 1e9 } };   /* tier 3 is not named */
  });
  assert.equal(unstated.failed, true, unstated.out);
  assert.match(unstated.out, /no entry in UNREADABLE_MAX/, unstated.out);

  const over = firesAdmin((b) => {
    for (const f of b[1].feats) f[9] = { en: 'Unit' };   /* no Japanese at all in tier 1 */
    return { 'data/hist-admin1.js': { pct: 0, count: 0 }, 'data/hist-admin2.js': { pct: 100, count: 1e9 } };
  });
  assert.equal(over.failed, true, over.out);
  assert.match(over.out, /data\/hist-admin1\.js: .*cannot be read/, over.out);
});

/* ── ⑤ THE FILL RECORD ANSWERS A COUNTRY WHOLE OR NOT AT ALL ──────────────────────────────────
   This is the reader's own second sentence made into a rule, so it is the one the gate must be
   able to catch being broken. The mutation removes ONE unit of a country the record answers for —
   exactly the shape 「一部にあっても全体にはない」 describes. */
test('#R719 ⑤ dropping one unit of an answered country fails check:histfill', () => {
  const dir = mkdtempSync(join(tmpdir(), 'r719f-'));
  try {
    mkdirSync(join(dir, 'data'), { recursive: true });
    copyGraph(dir, FILL, 'scripts/build-hist-admin-fill.mjs');
    copyFileSync(join(ROOT, 'data', 'admin1-world.json.gz'), join(dir, 'data', 'admin1-world.json.gz'));

    const w = {}; vm.runInNewContext(read('data/hist-admin-fill.js'), { window: w });
    const d = w.__HISTADMFILL;
    assert.ok(d && d.feats.length, 'the committed fill record must hold rows');

    /* well-formed first: the copy passes where the original does */
    writeFileSync(join(dir, 'data', 'hist-admin-fill.js'), 'window.__HISTADMFILL=' + JSON.stringify(d) + ';\n');
    assert.equal(runGate(dir, 'scripts/build-hist-admin-fill.mjs').failed, false, 'the copied record must pass');

    /* now drop every row of ONE unit and keep the rest of its country — addressed by its ISO
       3166-2 code, because the record is joined by the code and names repeat across countries */
    const victim = d.feats[0][10];
    const cut = { ...d, feats: d.feats.filter((f) => f[10] !== victim) };
    const used = new Set(); for (const f of cut.feats) for (const poly of f[8]) for (const ri of poly) used.add(ri);
    /* re-pool so the failure is the WHOLE-COUNTRY rule and not «a ring nobody uses» */
    const map = new Map(); const rings = [];
    for (const ri of [...used].sort((a, b) => a - b)) { map.set(ri, rings.push(cut.rings[ri]) - 1); }
    cut.rings = rings;
    cut.feats = cut.feats.map((f) => [...f.slice(0, 8), f[8].map((poly) => poly.map((ri) => map.get(ri))), ...f.slice(9)]);
    writeFileSync(join(dir, 'data', 'hist-admin-fill.js'), 'window.__HISTADMFILL=' + JSON.stringify(cut) + ';\n');
    const r = runGate(dir, 'scripts/build-hist-admin-fill.mjs');
    assert.equal(r.failed, true, r.out);
    assert.match(r.out, /answered completely or not at all/, r.out);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

/* ── ⑥ THE GAP RECORDS ARE A LIST, AND EACH ROW SAYS WHICH LIST ENTRY IT CAME FROM ────────────
   Two derived records both start their own row numbering at 0, so without the twelfth column the
   second record's row 3 would be stroked with the first record's coastline marks. */
test('#R719 ⑥ js/time-admin1.js splices every gap record and tags each row with its own', () => {
  /* ⚠ SPELLING, ON PURPOSE, FOR THE SPLICE: the gap list lives in the layer and the row tagging in
     the door that opens the records on another thread (js/hist-bundles.js, since
     hist-bundles-off-main); each record the list names is then EVALUATED below for its own
     provenance. (tests/history-admin-tiers-checks runs the factory; tests/hist-bundles-off-main-checks
     runs the splice itself against the shipped files.) */
  const s = read('js/time-admin1.js'), door = read('js/hist-bundles.js');
  assert.ok(!/cfg\.gapGlobal|cfg\.gapFile/.test(s), 'the single-gap spelling is gone — a second record may not need a second mechanism');
  assert.match(s, /import \{[^}]*\bHIST_ADMIN_GAPS\b[^}]*\} from '\.\/border-coast\.js';/, 'the list is imported, not held as a literal in the layer');
  assert.ok(!/const GAPS = \[/.test(s), 'js/time-admin1.js holds no literal gap list of its own');
  const files = HIST_ADMIN_GAPS.map((e) => e.file);
  assert.ok(files.includes('data/hist-kuni.js') && files.includes('data/hist-admin-fill.js'),
    'both derived records are spliced into the first tier');
  assert.match(door, /f\[9\], null, k, gi\]/, 'each spliced row carries the ORDINAL of the record it came from');
  assert.match(s, /_gapSet: \(f\[12\] == null\) \? -1 : f\[12\]/, 'and the feature carries it to the line builder');
  /* the credit is assembled from what is loaded, not typed once about one bundle */
  assert.match(s, /function gapAttrFor\(gaps, d\)/, 'the attribution is derived from the records themselves');
  assert.match(s, /d\.gapSrcs/, '…from the sources the splice carried onto the record, since the records are not on window');
  assert.ok(!/Asukana\/Ryoseikoku<\/a>/.test(s), 'no bundle is credited by a string hard-written into the renderer');
  /* and every record named in the list is a file that exists and states its own provenance */
  for (const e of HIST_ADMIN_GAPS) {
    const w = {}; vm.runInNewContext(read(e.file), { window: w });
    const d = w[e.global];
    assert.ok(d && d.rings && d.feats, `${e.file} must define ${e.global} with rings and feats`);
    assert.ok(d.src && /CC0|public domain|CC BY/i.test(d.src), `${e.file} must state its own provenance and licence in src`);
  }
});

/* ── ⑦ THE THIRD TIER IS DRAWN AT ITS OWN ZOOM, NOT AT THE SECOND'S ───────────────────────────
   One shared DEEP_Z would have fetched 1.10 MB of level-7 units two zooms before anything could
   draw them — and the median unit of each tier is what decides the zoom (#R564's own rule). */
test('#R719 ⑦ each deep tier fetches and draws at the zoom its own median unit earns', () => {
  /* ⚠ SPELLING, ON PURPOSE, FOR THE FETCH GATE: it reads the live camera on `moveend`. That each tier's
     layers take their OWN minimum zoom is evaluated by #R700 ③ in tests/history-admin-tiers-checks;
     the zooms themselves are MEASURED below from each tier's median unit. */
  const s = read('js/time-admin1.js');
  assert.match(s, /const DEEP3_Z = 8;/, 'the third tier has a zoom of its own');
  assert.match(s, /for \(const t of TIERS\) if \(t\.cfg\.minZ && z >= t\.cfg\.minZ - 0\.5\) t\.go\(lastWhen\);/,
    'and the fetch gate asks each tier its own zoom rather than one shared number');
  assert.ok(!/cfg\.deep \? \{ minzoom: DEEP_Z \}/.test(s), 'no layer takes its minimum zoom from the second tier’s constant');

  /* the zooms are not preferences: at 45.5 px per degree at z5, each tier's median unit must be
     at least 50 px across at the zoom it starts at, and under that at the zoom below. */
  const spanOf = (file) => {
    const w = {}; vm.runInNewContext(read(file), { window: w });
    const d = Object.values(w).find((x) => x && x.feats);
    const sp = d.feats.map((f) => { let a = Infinity, b = -Infinity;
      for (const poly of f[8]) for (const ri of poly) for (const p of d.rings[ri]) { if (p[0] < a) a = p[0]; if (p[0] > b) b = p[0]; }
      return b - a; }).sort((x, y) => x - y);
    return sp[sp.length >> 1];
  };
  const px = (span, z) => span * 45.5 * Math.pow(2, z - 5);
  for (const [file, z] of [['data/hist-admin2.js', 6], ['data/hist-admin3.js', 8]]) {
    const span = spanOf(file);
    assert.ok(px(span, z) >= 50, `${file}: its median unit is ${px(span, z).toFixed(1)} px at z${z} — below the legibility the tier claims`);
    assert.ok(px(span, z - 1) < 50, `${file}: it is already ${px(span, z - 1).toFixed(1)} px at z${z - 1} — it is being withheld from a zoom where it would read`);
  }
});

/* ── ⑧ WITHDRAWN (#R782) ─────────────────────────────────────────────────────────────────────
   ⑧ measured the centripetal Catmull–Rom spline this round added between the points the slider
   kept and the line on the map. The reader's answer to it was 「本来はスライダーで荒くするって
   やつなのに、滑らかなまま。」「いや消せよ」 — the spline made the slider's own effect unreachable,
   and it is gone. ⚠ WHAT REPLACES A WITHDRAWN MECHANISM'S CHECK IS NOT ITS ABSENCE: the thing
   that can go wrong now is a second stage creeping back in, and that is measured on the running
   function in tests/r782-draw-slider-coarsens-checks.test.mjs, not by this file's silence. */

test('#R719 ⑨ the stroke is captured finer than the trace the area is measured on', () => {
  /* ⚠ SPELLING, ON PURPOSE: the two sampling rates are constants of the Draw tool's pointer handlers
     (a DOM closure); the claim is their relation. */
  const s = read('js/map-tools.js');
  const minPx = /const MIN_PX=([\d.]+);/.exec(s), areaPx = /const AREA_PX=([\d.]+);/.exec(s);
  assert.ok(minPx && areaPx, 'both sampling rates are stated');
  assert.ok(parseFloat(minPx[1]) < parseFloat(areaPx[1]),
    'the LINE is sampled finer than the AREA — the resolution the reader draws at is not bounded by an O(n²) area pass');
  assert.ok(parseFloat(minPx[1]) <= 2,
    'and finer than the 5 px staircase the reader reported: a line can never be smoother than it was captured');
  /* (#R782) the two assertions that stood here guarded CURVE_MAX, the withdrawn spline's own
     output ceiling. With no stage after RDP there is nothing between the kept points and the map
     to bound — the vertex count the layer receives is the vertex count the slider chose. */
});

/* ── ⑩ THE COASTLINE IS OFF BY DEFAULT — IN THE FOUR PLACES THAT MUST AGREE ───────────────────
   tests/r476-checks ① holds the markup ⇄ list pair; the seeded session is the third place, and it
   is the one that has no gate of its own (#R225 wrote «keep this in step» as prose). */
test('#R719 ⑩ the seeded session agrees with the default-on list it is derived from', () => {
  const dl = read('js/data-layers.js');
  /* the base half of window.IntMapDefaultOn — published from the layer manifest (publishedList checks it
     still is), minus the thematic half the seed deliberately leaves out */
  const thematic = publishedList('IntMapDefaultLayers');
  const declared = publishedList('IntMapDefaultOn').filter((id) => thematic.indexOf(id) < 0);
  const seed = read('tests/helpers/session-seed.js');
  const base = /export const BASE_LAYERS = \[([^\]]*)\]/.exec(seed)[1].split(',').map((x) => x.trim().replace(/'/g, ''));
  assert.deepEqual(base.slice().sort(), declared.slice().sort(),
    'tests/helpers/session-seed.js BASE_LAYERS must be the base half of window.IntMapDefaultOn — ' +
    'a seed that names a toggle the app no longer ships on makes every spec test a session no reader has');
  const value = /export const SESSION_VALUE = '([^']*)'/.exec(seed)[1];
  assert.deepEqual(JSON.parse(value).layers.slice().sort(), declared.slice().sort(), 'and so must SESSION_VALUE');
  assert.ok(!declared.includes('cb-coast'), 'the coastline is not on by default (#R719)');
  /* …and it is still a ROW: the reader asked for the default, not for the layer */
  assert.ok(publishedList('IntMapBasicLayerRows').includes('cb-coast'), 'the row stays in 基本表示');
});
