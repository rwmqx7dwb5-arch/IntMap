/* ============================================================================
 *  #R680 — the gate over data/hist-admin1.js + data/hist-admin2.js
 * ----------------------------------------------------------------------------
 *  「歴史的な行政区分の束 2 本にゲートを足す」
 *
 *  25.8 MB of shipped first- and second-level subdivisions had no `--check` of any kind, no
 *  `package.json` entry and no CI step, while the four bundles around them each had one. This
 *  file does NOT re-state what the gate asserts — that would be the #R488 shape, a test that
 *  fixes the spelling of a rule instead of measuring it. It BREAKS things and asks whether the
 *  gate notices, which is the only way to learn that an assertion is reachable at all (#R673:
 *  a rule nothing can violate is a rule nothing measures).
 *
 *  ⚠ THE MUTATIONS RUN AGAINST A SYNTHETIC TREE, NOT AGAINST THE 25.8 MB. The gate derives its
 *  ROOT from its own path, so a temporary directory holding a copy of the script and a handful
 *  of tiny bundles IS a root as far as it is concerned. That is what makes «an unreferenced ring
 *  fails» a thing this file can prove in milliseconds rather than a thing it can only assert.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'scripts', 'build-hist-admin1.mjs');

/* a closed, on-globe ring of four points near (lon, lat) */
const ring = (lon, lat) => [[lon, lat], [lon + 1, lat], [lon + 1, lat + 1], [lon, lat]];

/* one well-formed tier: `n` rings, one unit per ring, all of them in force from year 1 to 9999
   so that every century the bundle claims to reach has something to draw. */
function tier(n, opts = {}) {
  const rings = [], feats = [];
  for (let i = 0; i < opts.rings; i++) rings.push(ring(i, i));
  for (let i = 0; i < opts.rings; i++)
    feats.push(['unit ' + n + '-' + i, 2 * n + 2, 1, 1, 1, 9999, 12, 31, [[i]], { en: 'Unit ' + i }, 1000 * n + i]);
  return { v: 1, src: 'OpenHistoricalMap contributors (CC0) · openhistoricalmap.org',
           built: '2026-09-11', since: 1, tolerance: 0.02, levels: [2 * n + 1, 2 * n + 2], rings, feats };
}

/* build a temporary root the gate will accept, then let the caller break exactly one thing */
function world(mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'r680-'));
  mkdirSync(join(dir, 'scripts')); mkdirSync(join(dir, 'data')); mkdirSync(join(dir, 'js'));
  copyFileSync(SCRIPT, join(dir, 'scripts', 'build-hist-admin1.mjs'));
  /* the builder evaluates js/ohm-rings.js at module load (#R669), so the root needs it */
  copyFileSync(join(ROOT, 'js', 'ohm-rings.js'), join(dir, 'js', 'ohm-rings.js'));

  const bundles = { 1: tier(1, { rings: 3 }), 2: tier(2, { rings: 2 }) };
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

/* run the gate in `dir` and report what it said and whether it failed */
function run(dir) {
  const script = join(dir, 'scripts', 'build-hist-admin1.mjs');
  try {
    const out = execFileSync(process.execPath, [script, '--check'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { failed: false, out };
  } catch (e) {
    return { failed: true, out: String(e.stdout || '') + String(e.stderr || '') };
  }
}

/* mutate → run → clean up, in one place so a failing assertion never leaks a temp tree */
function fires(mutate) {
  const dir = world(mutate);
  try { return run(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

/* ── ① the gate exists, is declared, and passes on the bytes actually shipped ─────────────── */
test('#R680 ① `npm run check:histadmin` passes on the committed bundles', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts || {};
  assert.equal(pkg['check:histadmin'], 'node scripts/build-hist-admin1.mjs --check',
    'the gate must be declared in package.json — an undeclared gate is invisible to gate-callers');
  const out = execFileSync(process.execPath, [SCRIPT, '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.match(out, /^✓ hist-admin/, out);
  /* the summary must be about BOTH tiers — a gate that silently checked one would also print ✓ */
  assert.match(out, /2 tiers/, out);
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
  const broken = tier(3, { rings: 1 });
  broken.feats[0][8] = [[5]];                       /* out of pool — only a checked tier notices */
  const r = fires((b, g, bc) => {
    bc.sets.ha3 = { file: 'data/hist-admin3.js', rings: 1 };
    return { 'hist-admin3.js': 'window.__HISTADM3=' + JSON.stringify(broken) + ';\n' };
  });
  assert.equal(r.failed, true, 'a hand-written pair of filenames would have skipped data/hist-admin3.js entirely');
  assert.match(r.out, /hist-admin3\.js/);
});
