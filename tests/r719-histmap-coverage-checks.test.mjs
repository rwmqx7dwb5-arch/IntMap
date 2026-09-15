/* ============================================================================
 *  #R719 — the historical map's coverage, and the two tools the same round touched
 * ----------------------------------------------------------------------------
 *  「地方区分のcoverageが一部だけだったりする」「ある国家でも、一部にあっても全体にはなかったりする」
 *  「Coastlines & shoresはdefault base map & labelsから除外」
 *  「Drawで引ける線の最大の滑らかさが、全然滑らかじゃないからもっと滑らかに高解像度で描けるように」
 *
 *  ⚠ NOTHING HERE RESTATES A RULE — every check BREAKS something and asks whether the thing that
 *  is supposed to notice notices (#R488's lesson: a test that fixes the spelling of a rule cannot
 *  tell a live rule from a dead one). The gates run against synthetic roots, because both of them
 *  derive their ROOT from their own path, so a temp directory holding a copy of the script and a
 *  few tiny bundles IS a root as far as they are concerned (#R680's harness, reused in shape).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registry, shipTags } from '../scripts/histadmin/langs.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const ADMIN = join(ROOT, 'scripts', 'build-hist-admin1.mjs');
const FILL = join(ROOT, 'scripts', 'build-hist-admin-fill.mjs');
const SHIP = shipTags(ROOT, registry(ROOT));

const ring = (lon, lat) => [[lon, lat], [lon + 1, lat], [lon + 1, lat + 1], [lon, lat]];

/* one well-formed tier at the levels given, every unit in force from year 1 to 9999 */
function tier(n, levels, rings) {
  const R = [], F = [];
  for (let i = 0; i < rings; i++) R.push(ring(i, i));
  for (let i = 0; i < rings; i++)
    F.push(['unit ' + n + '-' + i, levels[levels.length - 1], 1, 1, 1, 9999, 12, 31, [[i]],
      Object.fromEntries(SHIP.map((t) => [t, 'Unit ' + i])), 1000 * n + i]);
  return { v: 1, src: 'OpenHistoricalMap contributors (CC0) · openhistoricalmap.org',
           built: '2026-09-15', since: 1, tolerance: 0.02, levels, rings: R, feats: F };
}

/* copy a script and everything it imports RELATIVELY into `dir` (a listed set breaks on the next
   refactor — #R695 learned that the hard way in tests/r680-histadmin-gate-checks.test.mjs) */
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

/* a synthetic hist-admin root, with `mutate` free to break exactly one thing */
function adminWorld(mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'r719-'));
  mkdirSync(join(dir, 'data'), { recursive: true });
  copyGraph(dir, ADMIN, 'scripts/build-hist-admin1.mjs');
  const bundles = { 1: tier(1, [3, 4], 3), 2: tier(2, [5, 6], 2) };
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

function runGate(dir, rel) {
  const script = join(dir, rel);
  try { return { failed: false, out: execFileSync(process.execPath, [script, '--check'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { return { failed: true, out: String(e.stdout || '') + String(e.stderr || '') }; }
}
function firesAdmin(mutate) {
  const dir = adminWorld(mutate);
  try { return runGate(dir, 'scripts/build-hist-admin1.mjs'); } finally { rmSync(dir, { recursive: true, force: true }); }
}

/* ── ① THE HARNESS IS HONEST, AND THE TWO GATES PASS ON THE BYTES ACTUALLY SHIPPED ───────────
   Without the first half every mutation below could be passing because the temp root is malformed
   rather than because the mutation was caught (#R585). */
test('#R719 ① an unbroken synthetic pair passes, and both gates pass on the committed bundles', () => {
  assert.equal(firesAdmin(null).failed, false, 'the synthetic world must pass before a mutation means anything');

  const pkg = JSON.parse(read('package.json')).scripts || {};
  assert.equal(pkg['check:histfill'], 'node scripts/build-hist-admin-fill.mjs --check',
    'the new gate must be DECLARED — gate-callers/gate-lists/ci-gates take package.json as their universe');
  assert.match(read('.github/workflows/ci.yml'), /npm run check:histfill/, 'and CI must call it');

  assert.match(execFileSync(process.execPath, [ADMIN, '--check'], { cwd: ROOT, encoding: 'utf8' }), /^✓ hist-admin/);
  assert.match(execFileSync(process.execPath, [FILL, '--check'], { cwd: ROOT, encoding: 'utf8' }), /^✓ hist-admin-fill/);
});

/* ── ② THE TIERS' LEVELS ARE A PARTITION, NOT ARITHMETIC ON A FILENAME ────────────────────────
   The old rule was `tier N holds 2N+1 and 2N+2`, which made a one-level tier — the shape
   data/hist-admin3.js actually is — a failure. What it was protecting is #R604's accident, and
   that survives as a property of the SET. */
test('#R719 ② a one-level tier is lawful; an overlapping one and a hole are not', () => {
  assert.equal(firesAdmin((b, bc) => {
    b[3] = tier(3, [7], 1);
    bc.sets.ha3 = { file: 'data/hist-admin3.js', rings: 1 };
    return { 'data/hist-admin1.js': 100, 'data/hist-admin2.js': 100, 'data/hist-admin3.js': 100 };
  }).failed, false, 'a tier that ships ONE admin level must be accepted');

  const dup = firesAdmin((b, bc) => {
    b[3] = tier(3, [5, 7], 1);                       /* 5 already belongs to tier 2 */
    bc.sets.ha3 = { file: 'data/hist-admin3.js', rings: 1 };
    return { 'data/hist-admin1.js': 100, 'data/hist-admin2.js': 100, 'data/hist-admin3.js': 100 };
  });
  assert.equal(dup.failed, true, dup.out);
  assert.match(dup.out, /already held by an earlier tier/, dup.out);

  const hole = firesAdmin((b, bc) => {
    b[3] = tier(3, [8], 1);                          /* 7 is shipped by nobody */
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
    b[3] = tier(3, [7], 1);
    bc.sets.ha3 = { file: 'data/hist-admin3.js', rings: 1 };
    /* (#R721) the entry states a share AND a headcount — see UNREADABLE_MAX */
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
  const s = read('js/time-admin1.js');
  assert.ok(!/cfg\.gapGlobal|cfg\.gapFile/.test(s), 'the single-gap spelling is gone — a second record may not need a second mechanism');
  assert.match(s, /const GAPS = \[[\s\S]*data\/hist-kuni\.js[\s\S]*data\/hist-admin-fill\.js[\s\S]*\];/,
    'both derived records are spliced into the first tier');
  assert.match(s, /f\[9\], null, k, gi\]/, 'each spliced row carries the ORDINAL of the record it came from');
  assert.match(s, /_gapSet: \(f\[12\] == null\) \? -1 : f\[12\]/, 'and the feature carries it to the line builder');
  /* the credit is assembled from what is loaded, not typed once about one bundle */
  assert.match(s, /function gapAttrFor\(gaps\)/, 'the attribution is derived from the records themselves');
  assert.ok(!/Asukana\/Ryoseikoku<\/a>/.test(s), 'no bundle is credited by a string hard-written into the renderer');
  /* and every record named in the list is a file that exists and states its own provenance */
  for (const m of s.matchAll(/\{ file: '(data\/[a-z0-9-]+\.js)',\s*global: '(__[A-Z0-9]+)',\s*set: '([a-z0-9]+)' \}/g)) {
    const w = {}; vm.runInNewContext(read(m[1]), { window: w });
    const d = w[m[2]];
    assert.ok(d && d.rings && d.feats, `${m[1]} must define ${m[2]} with rings and feats`);
    assert.ok(d.src && /CC0|public domain/i.test(d.src), `${m[1]} must state its own provenance and licence in src`);
  }
});

/* ── ⑦ THE THIRD TIER IS DRAWN AT ITS OWN ZOOM, NOT AT THE SECOND'S ───────────────────────────
   One shared DEEP_Z would have fetched 1.10 MB of level-7 units two zooms before anything could
   draw them — and the median unit of each tier is what decides the zoom (#R564's own rule). */
test('#R719 ⑦ each deep tier fetches and draws at the zoom its own median unit earns', () => {
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

/* ── ⑧ THE DRAW TOOL DRAWS A CURVE, AND CAPTURES FINER THAN IT MEASURES ───────────────────────
   ⚠ THE SHIPPED MODULE IS EVALUATED, NOT READ (#R505). What the slider does is a property of the
   running function; a test that matched the source for `smoothPath(` would pass on a build where
   the spline had been disconnected from the line. The only things stubbed are the two things the
   module imports (a timer wheel and the Nominatim gate) and the renderer contract — none of which
   the geometry under test touches. */
function drawTool() {
  const noop = () => {};
  const el = () => ({ style: {}, classList: { add: noop, remove: noop }, appendChild: noop,
                      querySelector: () => null, querySelectorAll: () => [], addEventListener: noop, setAttribute: noop, remove: noop });
  const sb = { console, Math, JSON, Date, Number, String, Object, Array, isFinite, parseInt, parseFloat, setTimeout, clearTimeout, RegExp };
  sb.window = sb; sb.globalThis = sb;
  sb.document = { getElementById: () => null, createElement: el, body: el(), head: el(),
                  addEventListener: noop, readyState: 'complete', querySelector: () => null, querySelectorAll: () => [] };
  sb.turf = { distance: () => 1, point: (p) => p };
  sb.IntMapModules = {};
  sb.IntMapGeoEngine = { hasRenderer: () => true,
    layers: { hasSource: () => true, addSource: noop, has: () => true, add: noop, setSourceData: noop, setLayout: noop },
    render: { canvas: () => ({ style: {} }) }, input: { set: noop }, camera: { getZoom: () => 5 }, events: { on: noop, once: noop } };
  sb.IntMapLang = { t: () => 'x' };
  sb.everyTick = () => noop; sb.NominatimGate = {};
  vm.createContext(sb);
  vm.runInContext(read('js/map-tools.js').replace(/^import[^\n]*\n/gm, ''), sb, { filename: 'map-tools.js' });
  sb.IntMapModules.drawTool({ ringArea: () => 0, t: () => '', distHTML: String, areaHTML: String,
                              makeDraggable: noop, imToast: noop, exitTool: noop, lang: 'en', isMobile: () => false });
  return sb.DrawTool;
}
/* ⚠ SMOOTHNESS IS THE SHARPEST CORNER, NOT THE AVERAGE ONE. A mean turn per vertex is a function
   of how DENSELY a path is sampled — a 360-point circle averages 1° a vertex and a 5-point one
   averages 72°, so comparing two paths of different densities by their mean measures the sampling
   and not the shape. What the reader sees as «not smooth at all» is a corner, so that is what is
   measured: the largest angle the path turns through at any one vertex. */
const maxTurn = (a) => {
  let worst = 0;
  for (let i = 1; i < a.length - 1; i++) {
    const v1 = [a[i][0] - a[i - 1][0], a[i][1] - a[i - 1][1]], v2 = [a[i + 1][0] - a[i][0], a[i + 1][1] - a[i][1]];
    const n1 = Math.hypot(v1[0], v1[1]), n2 = Math.hypot(v2[0], v2[1]);
    if (!n1 || !n2) continue;
    worst = Math.max(worst, Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (n1 * n2)))));
  }
  return worst;
};

test('#R719 ⑧ the smoothing slider produces a curve through the points, at every setting', () => {
  const D = drawTool();
  assert.ok(D && D._debug && typeof D._debug.simulate === 'function', 'the shipped module evaluated and armed');

  /* a hand-drawn loop — a wobbly circle, which is what the tool is actually used to draw, and the
     input a decimation-only «smoothing» turns into a polygon with visible corners. */
  const raw = [];
  for (let i = 0; i < 360; i++) {
    const a = i * Math.PI / 180, r = 1 + 0.04 * Math.sin(a * 9);
    raw.push([139 + r * Math.cos(a), 35 + r * Math.sin(a)]);
  }
  for (const sm of [0, 50, 100]) {
    const r = D._debug.simulate(raw, sm);
    assert.ok(r.kept.length >= 3, `at smoothing ${sm} the slider must leave something to draw (kept ${r.kept.length})`);
    assert.ok(r.curveN > r.simplN,
      `at smoothing ${sm} the drawn line (${r.curveN}) must carry more vertices than the ${r.simplN} the slider kept — a polyline through them is not a curve`);
    /* ⚠ THE POINT OF THE ROUND: the line that is DRAWN must be smoother than the polyline through
       the same points. Before #R719 they were the same object, so «maximum smoothing» was the most
       angular line the tool could produce. */
    assert.ok(maxTurn(r.line) < maxTurn(r.kept) / 2,
      `at smoothing ${sm} the drawn line's sharpest corner is ${maxTurn(r.line).toFixed(4)} rad against ` +
      `${maxTurn(r.kept).toFixed(4)} for the polyline through the same points — that is not smoothing`);
    /* and it still goes where the reader drew: every kept point is ON the curve */
    for (const p of r.kept)
      assert.ok(r.line.some((q) => Math.abs(q[0] - p[0]) < 1e-6 && Math.abs(q[1] - p[1]) < 1e-6),
        `the curve must pass through the point the slider kept at ${p} — an approximating spline moves the line off what was drawn`);
  }
  /* MAXIMUM smoothing is where the reader said the line was «全然滑らかじゃない», and it is where
     decimation hurts most: five points out of 360. The line drawn there must still have no corner. */
  const top = D._debug.simulate(raw, 100);
  assert.ok(maxTurn(top.line) < 0.35,
    `at maximum smoothing the drawn line still turns ${maxTurn(top.line).toFixed(3)} rad (${(maxTurn(top.line) * 180 / Math.PI).toFixed(1)}°) ` +
    'at a single vertex — a corner that size is what «not smooth at all» means. (0.35 rad ≈ 20° is the ' +
    'angle at which a joint stops reading as a corner at the sub-pixel vertex spacing the spline emits.)');
  assert.ok(top.line.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90),
    'and every vertex is on the globe — the first build of the spline put the last one at [0,0]');

  /* and the AREA is still measured on the coarse trace, so the finer capture costs nothing there */
  assert.equal(D._debug.simulate(raw, 0).area, D._debug.simulate(raw, 100).area,
    'the area stays invariant under the slider — #R8c’s contract, unchanged');
});

test('#R719 ⑨ the stroke is captured finer than the trace the area is measured on', () => {
  const s = read('js/map-tools.js');
  const minPx = /const MIN_PX=([\d.]+);/.exec(s), areaPx = /const AREA_PX=([\d.]+);/.exec(s);
  assert.ok(minPx && areaPx, 'both sampling rates are stated');
  assert.ok(parseFloat(minPx[1]) < parseFloat(areaPx[1]),
    'the LINE is sampled finer than the AREA — the resolution the reader draws at is not bounded by an O(n²) area pass');
  assert.ok(parseFloat(minPx[1]) <= 2,
    'and finer than the 5 px staircase the reader reported: a line can never be smoother than it was captured');
  /* the curve is bounded, so a long stroke cannot unbound the source it is pushed into */
  assert.match(s, /const CURVE_MAX=\d+;/, 'the spline states its own ceiling');
  assert.match(s, /if\(total\/step>CURVE_MAX\) step=total\/CURVE_MAX;/,
    'and it widens the step to fit rather than truncating the stroke');
});

/* ── ⑩ THE COASTLINE IS OFF BY DEFAULT — IN THE FOUR PLACES THAT MUST AGREE ───────────────────
   tests/r476-checks ① holds the markup ⇄ list pair; the seeded session is the third place, and it
   is the one that has no gate of its own (#R225 wrote «keep this in step» as prose). */
test('#R719 ⑩ the seeded session agrees with the default-on list it is derived from', () => {
  const dl = read('js/data-layers.js');
  const declared = /window\.IntMapDefaultOn=\[([^\]]*)\]/.exec(dl)[1].split(',').map((x) => x.trim().replace(/'/g, ''));
  const seed = read('tests/helpers/session-seed.js');
  const base = /export const BASE_LAYERS = \[([^\]]*)\]/.exec(seed)[1].split(',').map((x) => x.trim().replace(/'/g, ''));
  assert.deepEqual(base.slice().sort(), declared.slice().sort(),
    'tests/helpers/session-seed.js BASE_LAYERS must be the base half of window.IntMapDefaultOn — ' +
    'a seed that names a toggle the app no longer ships on makes every spec test a session no reader has');
  const value = /export const SESSION_VALUE = '([^']*)'/.exec(seed)[1];
  assert.deepEqual(JSON.parse(value).layers.slice().sort(), declared.slice().sort(), 'and so must SESSION_VALUE');
  assert.ok(!declared.includes('cb-coast'), 'the coastline is not on by default (#R719)');
  /* …and it is still a ROW: the reader asked for the default, not for the layer */
  assert.match(dl, /window\.IntMapBasicLayerRows=\[[^\]]*'cb-coast'/, 'the row stays in 基本表示');
});
