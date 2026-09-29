/* ============================================================================
 *  LANGUAGES — the tuple / pair / helper-ternary shapes the audits count
 * ----------------------------------------------------------------------------
 *  ⚠ NOT A HAZARD SUBJECT. These tests were in round files assigned to the hazards/simulator
 *  consolidation; the `hazard-` prefix only keeps this file from colliding with the other
 *  consolidations. The owning subject is named in the title — merge it there when both exist.
 *  Consolidated from the round files named in each section below; every test keeps its original
 *  title, tagged with the round that wrote it. Each section is a block so its helpers stay its own.
 *
 *  ⚠ WHY SOME OF THESE STILL READ SOURCE TEXT. The audits are RUN through their CLIs; the pins that
 *    remain are on the audit scripts' own structure.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path, { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly as code } from '../scripts/code-only.mjs';

/* one reader for the whole file — the CONTENT of a repository file, whatever line endings this
   checkout produced (scripts/eol.mjs, #R283). Sections that need another shape keep their own. */
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(join(ROOT, p));

/* ═══ from tests/r241-checks.test.mjs (tests #1, #2, #3 of 11) ═══
    R241 — six reports, and the one that has now been sent five times
    ① 「簡体、繁体、フランス語、韓国語、ドイツ語、ロシア語、スペイン語について、すべての面において
       対応が完璧かどうか点検し、未了点があれば修正して。いつまでたっても言語対応の漏れが見つかる
       ことは許されない。」
    ② 「地震シミュレータの地震波伝播は断層破壊を考慮していない。震央からほぼ同心円状に広がるだけ。」
       → 「いや破壊速度 Vr ≤ 波速 Vだから同心円でオッケーですってどんな理屈やねんアホ」
    ③ 「サイドバーのパネル内モバイル版で、左に合ったスクロールバーが消えているから、つけて。」
    ④ 「MapLibreで大気にもやがかかりすぎ。地図をちゃんと見せろ。それに、ある程度までズームしたら
       いきなりもやが消えるものさらに不自然。」＋「衛生写真ではあっても、標準マップでは大気はなし」
    ⑤ 「各地の表内のJMAの背景の四角は、JMAで大きさをそろえるように。MMIはまた別の幅。」
       → 「左右に大きすぎに見えただけ。（テキストがとっている幅の割に）」
    ⑥ 「地震シミュレータの地点表が左右方向にスクロールできなくなっている。」

    ⚠ Every assertion here is written against a MECHANISM, and comments are stripped before the
    source is matched (`code()`), because this file quotes the instructions it is testing —
    [[intmap-recurring-lessons]] E, eight rounds running. */
{
const R = read;

/* ══ ① TRANSLATION — the seventh shape, and the instrument that stops it returning ═════════════ */

test('R241 ① a tuple of translations is a CALL, so every existing instrument can read it', () => {
  const reg = code(R('js/lang-registry.js'));
  /* the tuple helper, and the ONE resolution rule */
  assert.match(reg, /function pickArgs\(\)/, 'the registry owns the array form');
  assert.match(reg, /pickArgs: pickArgs/, '…and exports it');
  assert.match(reg, /fn\.arr = function \(a\)/, 'and `L.arr` resolves a tuple');
  assert.match(reg, /return Array\.isArray\(a\) \? fn\.apply\(null, a\)/,
    '⚠ THROUGH pick() ITSELF — a second fallback rule is how the two drift apart');

  /* ⚠ AND THE EXISTING AUDITS MUST SEE IT. `pickArgs` is named so that both detectors — a substring
     test in i18n-report.mjs and a regex in i18n-positional-audit.mjs — match it. The regex is the
     fragile one: `pick\s*\(` does NOT match `pickArgs(`, and 218 sites were outside the positional
     universe until it was widened. Measured: 2,195 → 2,413 call sites. */
  assert.match(R('scripts/i18n-helpers.mjs'), /IntMapLang\.pick(Args)?/,
      'the shared resolver counts pickArgs sites too');
    /* (#R251) …and the positional audit asks it, rather than carrying a fourth private copy — three
       per-file copies is how 65 five-language call sites stayed outside every measurement. */
    assert.match(R('scripts/i18n-positional-audit.mjs'), /i18n-helpers.mjs/,
      'the positional audit reads the shared resolver');

  /* the tuple helper is actually used, in every table that used to hold a bare array */
  /* (#R322) js/analysis-panels.js became an eager shell and five lazy implementations; the tables
     that hold tuples went with the bodies, so the three files that now carry them are named here.
     ⚠ THE SHELL IS NOT IN THIS LIST AND MUST NOT BE — it has no tuple table to write as a call, and
     demanding `LA('` of a file with nothing to declare would be a check that only ever asserts that
     somebody kept a helper alive to satisfy it. */
  for (const f of ['js/weather.js', 'js/layer-packs.js', 'js/data-layers.js',
    'js/analysis-timeseries.js', 'js/analysis-correlate.js', 'js/analysis-world-events.js',
    'js/stats-compare.js', 'js/atlas-console.js',
    'js/world-packs.js', 'js/sims.js']) {
    assert.match(code(R(f)), /IntMapLang\.pickArgs\(\)/, `${f} declares the tuple helper`);
    assert.match(code(R(f)), /LA\('/, `${f} writes its tuples as calls`);
  }
});

test('R241 ① no language index and no private language-order map outside the registry', () => {
  /* ⚠ THE INSTRUMENT IS RUN, not re-implemented here. It is the thing that found four sites in
     js/world-packs.js that reading the code had missed — trade sections, GAEZ variables, supply
     regimes and the panel titles, every one of them English on fr/ko/zh. */
  const out = JSON.parse(execFileSync(process.execPath,
    [join(ROOT, 'scripts', 'i18n-positional-array-audit.mjs'), '--json'], { encoding: 'utf8' }));
  assert.equal(out.hits.length, 0,
    'a translation tuple must be written as LA(…), not as an array subscripted by language position:\n  '
    + out.hits.map((h) => `${h.file}:${h.line} ${h.text}`).join('\n  '));
});

test('R241 ① the seventh surface is a line in the ONE gate, not a seventh instrument', () => {
  const g = R('scripts/i18n-audit.mjs');
  assert.match(g, /run\('i18n-positional-array-audit\.mjs'\)/, 'the gate spawns it');
  assert.match(g, /translation tuples held as data instead of as a call/, 'and prints it in the matrix block');
  assert.match(g, /if \(arrays\.hits\.length\) problems\.push/, 'and --gate fails on it');
  /* #R239's rule: the bundler holds no parser of its own */
  assert.doesNotMatch(code(g), /acorn/, 'the gate still parses nothing itself');
});
}

/* ═══ from tests/r247-checks.test.mjs (tests #7 of 9) ═══
    R247 — the five things this round changed, stated as contracts
    ① the SDF atlas speaks the server `top` convention (the news band's real defect)
    ② the far intensity raster's edge is a SURFACE distance, and the box is the only ownership test
    ③ the field ends in a fade, through ONE function both rasters call
    ④ the aircraft ramp is the original stops at 1.25×, still stated once
    ⑤ the thirteenth translation shape — a helper ternary with ARRAY arms — is measured and gone */
{
/* ⚠ comments are stripped before matching — this file's own prose quotes the instruction, and a
   negative check that reads its own comment is [[intmap-recurring-lessons]] E, eight rounds running. */
const json = (script, ...args) => JSON.parse(execFileSync(process.execPath,
  [path.join(ROOT, 'scripts', script), '--json', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));

/* ── ⑤ THE THIRTEENTH SHAPE ───────────────────────────────────────────────────────────────────
   The ninth shape (`jp() ? '日本語' : 'English'`) written one container deeper — arms that are ARRAYS.
   It hid the bug-report category menu, the calendar's weekday initials and which Wikipedia two
   widgets read, in seven languages, from every instrument in the repository: the pair audit wants
   LITERAL arms, and the adjacent-pair audit needs the two languages NEXT TO each other, which they
   are not — they are in different arms. */
test('r247 ⑤ the helper-ternary audit counts container arms, and the count is zero', () => {
  const a = code(read('scripts/i18n-helper-ternary-audit.mjs'));
  assert.match(a, /ArrayExpression'\s*\|\|\s*n\.consequent\.type === 'ObjectExpression'/,
    'the instrument looks at the SHAPE of the arms, not only at literals');
  assert.match(a, /kind: 'container'/, 'and reports them as their own kind');
  const j = json('i18n-helper-ternary-audit.mjs');
  assert.equal(j.containers, 0, `${j.containers} container ternaries left (${j.containerStrings} strings)`);
  assert.equal(j.sites, 0, 'and no helper ternary of any kind is left');
  /* the ONE gate has to print it, or the next round cannot know it is being watched */
  assert.match(code(read('scripts/i18n-audit.mjs')), /whole container\(s\)/, 'the gate prints the container count');
});
}

/* ═══ from tests/r250-checks.test.mjs (tests #4, #5 of 5) ═══
    IntMap · #R250 source checks
    ① ONE PICTURE, ONE **GRAIN** — the seismic far raster may not be built finer than the inputs
       it draws. Its land test and its site term are answered at its own cell, from the same two
       sources the fine field uses, and which answer each one gave is PRINTED.
    ② js/coast-mask.js answers an oblong grid, because the far raster's is nx × ny — and the
       square `N` spelling the fine field uses still means what it meant.
    ③ the far raster's DEM read is bounded and fails OPEN — a tile that does not arrive leaves the
       cell exactly as it is drawn today (the bundled 0.25° term), never blank and never `ampRef`
       for the whole annulus.
    ④ no instrument in the i18n family may truncate its own list silently (#R185's rule, which
       scripts/i18n-pair-audit.mjs was itself breaking at 400 of 696).
    ⑤ the OPEN GAP ratchet — the twelfth shape may only ever go down.

    ⚠ Every assertion that matches on TEXT reads the source with COMMENTS STRIPPED —
    [[intmap-recurring-lessons]] E has caught nine rounds writing a check that trips on its own
    explanation of the defect. */
{
const json = (f, ...a) => JSON.parse(execFileSync(process.execPath,
  [join(ROOT, 'scripts', f), '--json', ...a], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));

/* ── ④ NO INSTRUMENT TRUNCATES ITS OWN LIST SILENTLY ────────────────────────────────────────── */
test('#R250 ④ the pair audit reports every hit, and the strings themselves', () => {
  const a = read('scripts/i18n-pair-audit.mjs');
  assert.ok(!/hits:\s*hits\.slice\(/.test(code(a)),
    'the pair audit is truncating its own --json list again — 696 hits came back as 400 and the '
    + 'difference was invisible (#R185: no silent caps)');

  /* ⚠⚠⚠ (#R251) …AND IT MUST NOT EXIT BEFORE THE ANSWER HAS LEFT THE PROCESS.
     `process.exit(0)` right after a large `process.stdout.write()` truncates it whenever stdout is
     a PIPE and the platform's pipe writes are asynchronous — i.e. on Linux, and not on Windows.
     MEASURED: 366,105 bytes came back as 123,393, cut mid-string, so `JSON.parse` threw and the
     whole gate died on CI with one unattributed line while `npm test` was green locally. The
     round-trip assertion below WOULD catch it on Linux; this one catches it everywhere, which is
     the point of a guard against a platform-specific silent cap. */
  const jsonBranch = code(a).slice(code(a).indexOf("includes('--json')"));
  const firstExit = jsonBranch.indexOf('process.exit(');
  const firstCode = jsonBranch.indexOf('process.exitCode');
  assert.ok(firstCode >= 0 && (firstExit < 0 || firstCode < firstExit),
    'the --json branch must set process.exitCode and let node drain stdout, never process.exit()');

  const j = json('i18n-pair-audit.mjs');
  assert.equal(j.hits.length, j.total,
    `--json returned ${j.hits.length} of ${j.total} hits — the list a round works through may not be capped`);

  /* …and the strings must be usable, not cut at 110 characters for the terminal */
  for (const h of j.hits.slice(0, 50)) {
    assert.equal(typeof h.en, 'string', 'a hit carries no untruncated English string');
    assert.equal(typeof h.ja, 'string', 'a hit carries no untruncated Japanese string');
  }
  /* ⚠⚠⚠ (#R251) THE INVARIANT, NOT A LONG STRING THAT HAPPENS TO EXIST. This used to require one of
     the HITS to be longer than the 110-character terminal truncation — true while there were 696 of
     them, and false the moment a round converts the long ones. #R251 took the gap to 275 and the
     longest string in the whole report, hits and exemptions together, is now 54 characters: a test
     that only passes while the defect it guards is LARGE stops guarding it exactly when the work
     succeeds, and would then have to be deleted by whoever finally closed the gap.
     What is actually being defended is that `en` and `ja` are the raw strings and only `text` — the
     terminal field — is cut. That is a property of the code, so it is asserted on the code: the
     slice is applied to the display field alone, and the two data fields are assigned unsliced. */
  const rec = code(a).slice(code(a).indexOf('const rec = {'), code(a).indexOf('hits.push(rec)'));
  assert.match(rec, /\ben,\s*ja,/, '`en` / `ja` must be assigned the raw strings');
  assert.ok(!/\b(en|ja):[^,]*\.slice\(/.test(rec), 'neither data field may be truncated');
  assert.match(rec, /text:\s*\(JSON\.stringify\(en\)[\s\S]*?\.slice\(0, 110\)/,
    'only the terminal field is cut, and it is cut where the reader can see why');
});

/* ── ⑤ THE OPEN GAP ONLY EVER GOES DOWN ─────────────────────────────────────────────────────── */
test('#R250 ⑤ the twelfth shape\'s ratchet', () => {
  const j = json('i18n-pair-audit.mjs');
  /* #R246 2,262 → #R247 2,255 → #R248 2,031 → #R249 696 → #R250 see DEV-NOTES. */
  assert.ok(j.total <= 696, `the open gap grew to ${j.total} — write the new tuple as pickArgs() instead`);
  assert.ok(Array.isArray(j.exemptFiles) && j.exemptFiles.length > 0, 'the exemption is not reported per file');
});
}
