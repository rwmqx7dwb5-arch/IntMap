/* ============================================================================
 *  IntMap · R548 — TWO DEFINITIONS OF «A LINE», AGREEING ON EVERY FILE BUT ONE
 * ----------------------------------------------------------------------------
 *  scripts/i18n-dead-key-codemod.mjs died with
 *
 *      TypeError: Cannot read properties of undefined (reading 'slice')
 *      const before = lines0[a - 1].slice(0, pr.loc.start.column);
 *
 *  on js/locales/ui.zh-hans.js — but only after scripts/zh-hans.mjs had been run in the same
 *  checkout, which scripts/i18n-apply-inline.mjs does as its LAST STEP. So the ordinary order
 *  «apply the new keys, then remove the dead ones» met it every time, and the tool worked only
 *  from a clean checkout.
 *
 *  The generator pasted a header out of a .mjs (LF — .gitattributes forces it) in front of a body
 *  sliced out of a .js (CRLF, under core.autocrlf on Windows): fourteen LF lines, then 6,271 CRLF
 *  ones. The codemod chose ONE terminator for the whole file and split on it, coming out fourteen
 *  short of acorn's count — 6,272 against 6,286, measured by rebuilding the real file the way the
 *  old generator wrote it, where the first row past the desync is "Fine tuning" on line 6,273 and
 *  reproduces the reported TypeError exactly. Rows past the desync crashed; rows before it did worse
 *  — read a line fourteen away and decided from IT whether to delete a whole line.
 *
 *  ⚠ EVERY ASSERTION HERE EVALUATES THE SHIPPED CODE. The broken version and the fixed one are
 *  spelled almost identically, and a check reading either one's TEXT would have passed on both
 *  ([[intmap-edge-function-must-be-evaluated]]): the codemod's own transform is imported and run,
 *  the generator's build() is imported and run, and scripts/i18n-append-inline.mjs is executed as
 *  the command it is. ①②③ also assert that the OLD rule FAILS the same input, so «the check passes»
 *  cannot quietly mean «the check can no longer tell».
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parse } from 'acorn';
import { splitLines, joinLines, dominantEol, normaliseEol } from '../scripts/eol.mjs';
import { cutDeadRows } from '../scripts/i18n-dead-key-codemod.mjs';
import { build } from '../scripts/zh-hans.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const LOCALES = join(ROOT, 'js', 'locales');
const LF = String.fromCharCode(10), CR = String.fromCharCode(13), CRLF = CR + LF;
const LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029);

/* the line acorn puts the last character of the source on */
const acornLines = (src) => parse(src, { ecmaVersion: 2022, locations: true }).loc.end.line;
/* ⚠ THE RULE AS IT WAS, reproduced so the check can tell the fix from its absence. */
const oldSplit = (src) => src.split(src.includes(CRLF) ? CRLF : LF);

const kindsOf = (src) => new Set(splitLines(src).map((l) => l.eol).filter(Boolean));
const show = (s) => JSON.stringify(s);

/* A locale file in the exact shape the generator produced: an LF header glued to a CRLF body.
   The dead rows deliberately sit PAST the point where the two line counts diverge. */
function mixedLocale({ headEol = LF, bodyEol = CRLF, headLines = 14 } = {}) {
  const head = ['/* ' + '='.repeat(70)];
  for (let i = 2; i < headLines; i++) head.push(' *  header line ' + i + ' — this is what a .mjs contributes');
  head.push(' * ' + '='.repeat(70) + '*/');
  assert.equal(head.length, headLines);
  const body = [
    "window.IntMapLang.define('xx', {",
    '  ui: {',
    '    alive: "A", doomed: "B", stillAlive: "C"',
    '  },',
    '  inline: {',
    '    "Live one": "L",',
    '    "Dead one": "D",',
    '    "Another live one": "M",',
    '  },',
    '});',
    '',
  ];
  return head.join(headEol) + headEol + body.join(bodyEol);
}

/* ── ① THE SPLITTER COUNTS LINES THE WAY THE PARSER DOES ─────────────────────────────────────────
   This is the property the crash violated, stated for every source acorn will accept — not for the
   one file that happened to be reported. ECMAScript's LineTerminatorSequence is <LF>, <CR>,
   <CR><LF>, <LS>, <PS>; a tool that indexes its own array with `loc.line` must split on that set,
   and on nothing else. */
test('R548 ① splitLines() agrees with acorn on every line terminator ECMAScript defines', () => {
  const cases = {
    'pure LF': 'var a = 1;' + LF + 'var b = 2;' + LF,
    'pure CRLF': 'var a = 1;' + CRLF + 'var b = 2;' + CRLF,
    'LF header + CRLF body': mixedLocale(),
    'lone CR': 'var a = 1;' + CR + 'var b = 2;' + CR,
    'a stray CR before a real break': 'var a = 1;' + CR + CRLF + 'var b = 2;' + CRLF,
    'U+2028 / U+2029': 'var a = 1;' + LS + 'var b = 2;' + PS,
    'no terminator at all': 'var a = 1;',
    'empty': '',
    'trailing blank lines': 'var a = 1;' + CRLF + CRLF + CRLF,
  };
  for (const [name, src] of Object.entries(cases)) {
    assert.equal(splitLines(src).length, acornLines(src),
      name + ': split ' + splitLines(src).length + ' vs acorn ' + acornLines(src));
    assert.equal(joinLines(splitLines(src)), src,
      name + ': the round trip must be byte-exact — a codemod must not re-punctuate lines it did not touch');
  }

  /* and the same, measured against the files this actually runs on */
  const locales = readdirSync(LOCALES).filter((f) => f.endsWith('.js')).sort();
  assert.ok(locales.length >= 18, 'js/locales holds ' + locales.length + ' files');
  for (const f of locales) {
    const src = readFileSync(join(LOCALES, f), 'utf8');
    assert.equal(splitLines(src).length, acornLines(src), 'js/locales/' + f + ' — split and acorn disagree');
    assert.equal(joinLines(splitLines(src)), src, 'js/locales/' + f + ' — the round trip is not byte-exact');
  }

  /* ⚠ AND THE OLD RULE MUST STILL FAIL THE MIXED ONE */
  const mixed = mixedLocale();
  assert.notEqual(oldSplit(mixed).length, acornLines(mixed),
    'the rule this replaced must still be wrong about this input, or the input stopped reproducing the defect');
});

/* ── ② THE CODEMOD SURVIVES THE FILE ITS OWN PIPELINE PRODUCES ───────────────────────────────────
   The transform is imported and RUN — and importing it must not audit the corpus or rewrite nine
   locales, which is why the command lives behind IS_MAIN. */
test('R548 ② cutDeadRows() removes the row from a mixed-ending locale without crashing', () => {
  const src = mixedLocale();
  const dead = new Set(['Dead one', 'doomed']);

  /* the precondition: this input really is one the old rule could not index */
  const deadLine = splitLines(src).findIndex((l) => l.text.includes('Dead one')) + 1;
  assert.ok(deadLine > oldSplit(src).length,
    'the dead row must sit past the desync (line ' + deadLine + ' vs ' + oldSplit(src).length
    + ' old entries), or nothing is being reproduced');

  const cut = cutDeadRows(src, dead, 'ui.xx.js');
  assert.equal(cut.rows, 2, 'both dead rows were found');
  parse(cut.text, { ecmaVersion: 2022 });                        /* it must still parse */
  assert.ok(!cut.text.includes('Dead one'), 'the dead inline row is gone');
  assert.ok(!/\bdoomed\b/.test(cut.text), 'the dead packed row is gone');
  for (const live of ['Live one', 'Another live one', 'alive', 'stillAlive']) {
    assert.ok(cut.text.includes(live), 'the live row «' + live + '» survived');
  }

  /* ⚠ AND IT KEPT THE ENDINGS IT FOUND. Rejoining with one terminator would «fix» the crash by
     rewriting 6,285 lines the codemod was never asked to touch. */
  const out = splitLines(cut.text);
  assert.equal(out[0].eol, LF, 'the header line kept its LF: ' + show(out[0].eol));
  const bodyStart = out.findIndex((l) => l.text.includes('IntMapLang.define'));
  assert.equal(out[bodyStart].eol, CRLF, 'the body line kept its CRLF: ' + show(out[bodyStart].eol));
  assert.deepEqual(kindsOf(cut.text), kindsOf(src), 'no ending was introduced or removed');
});

/* ── ③ THE GENERATOR NO LONGER INTRODUCES A SECOND CONVENTION ────────────────────────────────────
   ⚠ THE PROPERTY IS A SUBSET, NOT «THE OUTPUT IS UNIFORM». The body is the source's own bytes and
   this script has no business re-punctuating lines it did not write — js/locales/pages.zh-hant.js
   carries a stray lone CR from a different tool, and a generator that normalised the whole output
   would launder that defect into its own diff. What must hold is that the DERIVATION adds no
   terminator its source does not already use, which is exactly what the header did. */
test('R548 ③ zh-hans build() introduces no line ending its source does not have', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intmap-r548-'));
  try {
    const src = [
      '/* a Traditional table, checked out the way git checks out a .js on Windows */',
      "window.IntMapLang.define('zh', {",
      '  ui: {',
      '    a: "網路", b: "資料"',
      '  },',
      '  inline: {',
      '    "Network": "網路",',
      '    "Data": "資料",',
      '  },',
      '});',
      '',
    ].join(CRLF);
    const p = join(dir, 'ui.zh.js');
    writeFileSync(p, src);

    const out = build({
      src: p, out: join(dir, 'ui.zh-hans.js'), what: 'UI STRINGS',
      from: "window.IntMapLang.define('zh'", to: "window.IntMapLang.define('zh-hans'",
    });

    assert.ok(out.length > src.length, 'the header was prepended');
    assert.ok(out.includes("define('zh-hans'"), 'the tag was rewritten');
    assert.ok(out.includes('网络'), 'the vocabulary table still ran — 網路 became 网络, not 网路');

    const introduced = [...kindsOf(out)].filter((e) => !kindsOf(src).has(e));
    assert.deepEqual(introduced, [], 'the derivation introduced ' + show(introduced)
      + ' — the header is not punctuated like the body it is glued to');
    assert.equal(splitLines(out).length, acornLines(out), 'the generated file is one acorn can index by line');

    /* ⚠ AND THE SHAPE THIS REPLACED MUST STILL BE WRONG: a header written as a literal in a .mjs is
       LF, and gluing it straight onto the CRLF body is what produced the fourteen. */
    const cutAt = splitLines(out).findIndex((l) => l.text.includes('IntMapLang.define'));
    const headLF = normaliseEol(joinLines(splitLines(out).slice(0, cutAt)), LF);
    const oldWay = headLF + src.slice(src.indexOf('window.IntMapLang'));
    assert.ok([...kindsOf(oldWay)].some((e) => !kindsOf(src).has(e)),
      'the shape this replaced must still introduce an ending, or the test is no longer about it');
    assert.notEqual(oldSplit(oldWay).length, acornLines(oldWay),
      'and its output must still be one the old splitter miscounts');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

/* ── ④ THE OTHER SITE OF THE SAME GUESS, RUN AS THE COMMAND IT IS ────────────────────────────────
   scripts/i18n-append-inline.mjs never crashed — it punctuates only the rows it ADDS — so the guess
   there was silent: one stray CRLF anywhere in an LF file and every new row got CRLF. It takes its
   target as an argument, so this drives the real script over a temporary file. */
test('R548 ④ i18n-append-inline punctuates new rows like the file, not like its first CRLF', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intmap-r548-'));
  try {
    const lines = [
      '/* a locale that is LF apart from one stray CRLF */',
      "window.IntMapLang.define('xx', {",
      '  inline: {',
      '    "Existing": "E",',
      '  },',
      '});',
      '',
    ];
    const src = lines.slice(0, 3).join(LF) + CRLF + lines.slice(3).join(LF);   /* exactly one CRLF */
    const target = join(dir, 'ui.xx.js');
    const add = join(dir, 'add.json');
    writeFileSync(target, src);
    writeFileSync(add, JSON.stringify({ 'Brand new': 'B' }));
    assert.equal(dominantEol(src), LF, 'the fixture is an LF file with one stray CRLF in it');
    assert.equal(src.includes(CRLF) ? CRLF : LF, CRLF, 'and the rule this replaced would have called it a CRLF file');

    execFileSync(process.execPath, [join(ROOT, 'scripts', 'i18n-append-inline.mjs'), target, add], { stdio: 'pipe' });

    const after = readFileSync(target, 'utf8');
    parse(after, { ecmaVersion: 2022 });
    assert.ok(after.includes('"Brand new"'), 'the row was added');
    const crlfBefore = splitLines(src).filter((l) => l.eol === CRLF).length;
    const crlfAfter = splitLines(after).filter((l) => l.eol === CRLF).length;
    assert.equal(crlfAfter, crlfBefore,
      'the new rows were punctuated LF like the rest of the file, not CRLF like the stray one');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
