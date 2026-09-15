/* ============================================================================
 *  r730-histfidelity-checks — the historical map as a CLAIM, not as a shape
 * ----------------------------------------------------------------------------
 *  #R730 found 68 shipped rows drawn from a date nobody stated — 48 ritsuryō provinces and the
 *  circuits of the 五畿七道 in 200 BC, 壱岐国 · 安房国 · 東海道 · 山陰道 · 西海道 still on the
 *  map in 1900 and today, the Shanghai concessions from before there was a Shanghai — while
 *  check:histadmin, npm test and CI were green over every one of them.
 *
 *  ⚠ SO THESE TESTS ARE WRITTEN AGAINST THE DEFECT, NOT AGAINST THE FIX. Each one puts the old
 *  behaviour back and requires the gate to notice. [[intmap-restate-the-defect-not-the-fix]]
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve as resolveClassSpans } from '../scripts/histadmin/class-dates.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const bundle = (rel) => { const s = read(rel); return JSON.parse(s.slice(s.indexOf('=') + 1).replace(/;\s*$/, '')); };

/* ① THE SHIPPED BUNDLES STATE, OR DERIVE, EVERY SPAN THEY DRAW ───────────────────────────────
   The defect was not that a date was wrong. It was that a date existed at all where no source
   had put one, and that the row carried a MARK saying so (`preserved-display-bound`) which
   nothing read. */
test('① no shipped row is drawn from a bound nobody can attribute', () => {
  const bad = [];
  for (const f of ['data/hist-admin1.js', 'data/hist-admin2.js', 'data/hist-admin3.js']) {
    const d = bundle(f);
    for (const row of d.feats) {
      const dt = (d.dates || {})[row[10]];
      if (!dt) continue;
      if (dt.start && dt.start.boundary === 'preserved-display-bound') bad.push(f + ' ' + row[0] + ' keeps the old display bound');
      if (!(dt.start && (dt.start.raw || dt.start.derived))) bad.push(f + ' ' + row[0] + ' has no stated and no derived start');
    }
  }
  assert.deepEqual(bad.slice(0, 8), [], bad.length + ' row(s) draw a span nobody stated');
});

/* ② …AND THE ONE THE READER ACTUALLY SAW. 壱岐国 and 安房国 were in force in 1900 and in 2026
   because their rows carried no end; 廃藩置県 abolished the system on 1871-08-29. This is the
   defect as a date, so it fails the day the rule stops reaching these rows for any reason. */
test('② the ritsuryō provinces begin with the 大宝律令 and end with 廃藩置県', () => {
  const d = bundle('data/hist-admin1.js');
  const kuni = bundle('data/hist-kuni.js');
  const ritsu = d.feats.filter((f) => /^[぀-ヿ一-鿿]+国$/.test(f[0]) && f[5] === 1871);
  assert.ok(ritsu.length >= 40, 'expected the ritsuryō provinces in the first tier, found ' + ritsu.length);
  for (const f of ritsu.concat(kuni.feats)) {
    assert.ok(f[2] >= 1, f[0] + ' still begins in ' + f[2] + ' — the clock floor is not a founding date');
    assert.deepEqual([f[5], f[6], f[7]], [1871, 8, 29], f[0] + ' does not end at 廃藩置県');
  }
  /* the two records must agree: one system, one span, and the derived one reads it off the other */
  const a = ritsu[0].slice(2, 8).join('-'), b = kuni.feats[0].slice(2, 8).join('-');
  assert.equal(a, b, 'data/hist-kuni.js and data/hist-admin1.js disagree about the same system');
});

/* ③ THE THREE GUARDS, EACH AGAINST THE ERROR THAT PRODUCED IT ────────────────────────────────
   All three were measured, not imagined: without guard 1 «Distrito Federal» (Brasília, 1960)
   took the end 1871-08-29 from 畿内, the only other member of «capital district or territory»
   in the bundle that states one. */
test('③ a unit that states a start and no end is current, and keeps its open end', () => {
  const units = [
    { id: 1, qid: 'Q1', start: null, end: '1871-08-29' },
    { id: 2, qid: 'Q2', start: '1960-04-21', end: null },   /* Brasília */
    { id: 3, qid: 'Q3', start: '0701', end: '1871-08-29' },
  ];
  const cls = new Map([['Q1', ['C']], ['Q2', ['C']], ['Q3', ['C']]]);
  const out = resolveClassSpans(units, cls);
  assert.equal(out.has(2), false, 'a unit with a stated start was given an end by its class');
  assert.equal(out.get(1).start, '0701');
});

test('③b one voice is not a class consensus, and a derived span must be an interval', () => {
  /* one member states an end, so nothing may inherit it */
  const lone = resolveClassSpans([
    { id: 1, qid: 'Q1', start: null, end: null },
    { id: 2, qid: 'Q2', start: '0701', end: '1871-08-29' },
  ], new Map([['Q1', ['C']], ['Q2', ['C']]]));
  assert.equal(lone.has(1), false, 'a single stated end became the class\'s testimony');

  /* and a start that does not precede the end is refused rather than shipped backwards */
  const back = resolveClassSpans([
    { id: 1, qid: 'Q1', start: null, end: '0500' },
    { id: 2, qid: 'Q2', start: '1900', end: '0500' },
  ], new Map([['Q1', ['C']], ['Q2', ['C']]]));
  assert.equal(back.has(1), false, 'a derived start at or after the end was accepted');

  /* ⚠ AND THE INTERVAL IS NOT A STRING COMPARISON. '-0400' sorts BEFORE '-0500' lexicographically,
     which would call a BCE interval backwards exactly where the deep-time records live. */
  const bce = resolveClassSpans([
    { id: 1, qid: 'Q1', start: null, end: '-0400' },
    { id: 2, qid: 'Q2', start: '-0500', end: '-0400' },
    { id: 3, qid: 'Q3', start: '-0450', end: '-0400' },
  ], new Map([['Q1', ['C']], ['Q2', ['C']], ['Q3', ['C']]]));
  assert.equal(bce.get(1)?.start, '-0500', 'the earliest BCE start was not the earliest');
});

/* ④ THE GATE FAILS ON THE DEFECT, PUT BACK BYTE FOR BYTE ─────────────────────────────────────
   A gate that has never been shown failing is a gate nobody has tested. This writes the old
   fossil bound into a copy of the observation file's own subject and requires a non-zero exit. */
test('④ check:histfidelity fails when a row goes back to an unattributable bound', () => {
  const rel = 'data/hist-admin3.js';   /* the smallest tier — the mutation costs 1.1 MB, not 40 */
  const original = read(rel);
  const d = JSON.parse(original.slice(original.indexOf('=') + 1).replace(/;\s*$/, ''));
  const id = d.feats[0][10];
  d.dates[id] = { start: { raw: null, precision: 'unknown', qualified: false, boundary: 'preserved-display-bound', bound: [-199, 1, 1] }, end: d.dates[id].end };
  d.feats[0][2] = -199; d.feats[0][3] = 1; d.feats[0][4] = 1;
  fs.writeFileSync(path.join(ROOT, rel), 'window.__HISTADM3=' + JSON.stringify(d) + ';\n');
  try {
    let failed = false;
    try { execFileSync(process.execPath, ['scripts/hist-fidelity.mjs', '--check'], { cwd: ROOT, stdio: 'pipe' }); }
    catch (_) { failed = true; }
    assert.ok(failed, 'the gate passed a row drawn from a bound nobody stated');
  } finally {
    fs.writeFileSync(path.join(ROOT, rel), original);
  }
});

/* ⑤ THE MEASUREMENT IS KEPT, NOT THROWN AWAY ────────────────────────────────────────────────
   #R719 measured the coverage of the historical map, wrote three numbers into a comment and
   deleted the code. [[intmap-discovered-list-is-a-photograph]] — so this requires the instrument
   to still exist, to still be declared, and to still watch every era rather than three years. */
test('⑤ coverage is observed across every era the clock reaches, and the gate is declared', () => {
  const obs = JSON.parse(read('data/hist-fidelity.json'));
  const years = obs.years.map((y) => y.year);
  assert.ok(years.some((y) => y < 0), 'nothing watches the centuries before the common era');
  assert.ok(years.some((y) => y > 0 && y < 1000), 'nothing watches the first millennium');
  assert.ok(years.some((y) => y >= 1689 && y < 1886), 'nothing watches the OHM band');
  assert.ok(years.some((y) => y >= 1886), 'nothing watches the CShapes band');
  assert.equal(obs.unsourcedSpans, 0, 'the recorded observation admits rows nobody dated');

  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.scripts['check:histfidelity'], 'the gate is not declared in package.json');
  assert.ok(read('.github/workflows/ci.yml').includes('check:histfidelity'), 'no CI step names the gate');
  assert.ok(read('scripts/test-parallel.mjs').includes('hist-fidelity.mjs'), 'npm test does not run the gate');
});

/* ⑥ AND THE RULE IT ENFORCES IS LOADED EVERY SESSION ─────────────────────────────────────────
   「単に機械的な手法だけを用いないというのは、歴史的地図を取り組むときの恒久的な方針に。」 A
   rule file that CLAUDE.md does not import is a rule nothing reads. */
test('⑥ the historical-verification rule is permanent context, not a loose file', () => {
  const rule = '.agents/rules/historical-verification.md';
  assert.ok(fs.existsSync(path.join(ROOT, rule)), rule + ' is missing');
  assert.ok(read('CLAUDE.md').includes('@' + rule), 'CLAUDE.md does not import ' + rule);
  assert.ok(read('AGENTS.md').includes('historical-verification.md'), 'AGENTS.md does not point at the rule');
  assert.ok(read('docs/README.md').includes('historical-verification.md'), 'the document index does not list the rule');
});

/* ⑦ THE READER'S OWN SCREENSHOT, AS A NUMBER ────────────────────────────────────────────────
   1918, Japan: one label — «Shiga Prefecture» — under a mesh of unnamed dashed lines. The mesh
   was the tile layer drawing ritsuryō circuit boundaries nobody had dated (r604 ③ holds that
   rule now); the single label was this record's whole-country rule measuring ITS OWN half
   instead of what the reader sees, so one unit OpenHistoricalMap answered emptied the country.
   ⚠ COUNTED ACROSS THE RECORDS TOGETHER, because that is what the reader sees. */
test('⑦ a country whose record answers one unit is not shipped as one unit', () => {
  const inForce = (f, y) => {
    const c = (a, b) => (a[0] !== b[0] ? a[0] - b[0] : a[1] !== b[1] ? a[1] - b[1] : a[2] - b[2]);
    return c([f[2], f[3], f[4]], [y, 7, 1]) <= 0 && c([y, 7, 1], [f[5], f[6], f[7]]) < 0;
  };
  const box = [122, 24, 154, 46];   /* the Japanese archipelago, Okinawa and the Kurils included */
  const inBox = (b, f) => {
    let sx = 0, sy = 0, n = 0;
    for (const poly of f[8]) for (const ri of poly) for (const p of b.rings[ri]) { sx += p[0]; sy += p[1]; n++; }
    const x = sx / n, y = sy / n;
    return x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3];
  };
  for (const year of [1900, 1918, 1950, 2000]) {
    let n = 0;
    for (const rel of ['data/hist-admin1.js', 'data/hist-admin-fill.js', 'data/hist-kuni.js']) {
      const b = bundle(rel);
      for (const f of b.feats) if (f[1] === 4 && inForce(f, year) && inBox(b, f)) n++;
    }
    assert.ok(n >= 40, `Japan shows ${n} first-level units in ${year}; it had 47 prefectures — this is the 「一部だけ」 the reader reported`);
  }
});

/* ⑧ …AND THE RECORD SAYS WHICH UNITS IT LEFT TO THE OTHER ONE ───────────────────────────────
   «deferred» is what makes ⑦ re-derivable from the shipped bytes rather than from a promise. */
test('⑧ the fill states the units it defers, and defers none it also draws', () => {
  const d = bundle('data/hist-admin-fill.js');
  assert.ok(Array.isArray(d.deferred), 'the fill does not state which units it left to the record');
  const drawn = new Set(d.feats.map((f) => f[10]));
  for (const code of d.deferred) assert.equal(drawn.has(code), false, code + ' is both drawn and deferred');
});
