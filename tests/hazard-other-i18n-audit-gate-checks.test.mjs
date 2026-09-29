/* ============================================================================
 *  LANGUAGES — the audit gate and its surfaces
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
import { existsSync } from 'node:fs';
import path, { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';
import { readLF } from '../scripts/eol.mjs';

/* one reader for the whole file — the CONTENT of a repository file, whatever line endings this
   checkout produced (scripts/eol.mjs, #R283). Sections that need another shape keep their own. */
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(join(ROOT, p));

/* ═══ from tests/r235-checks.test.mjs (tests #9 of 9) ═══
    R235 — the contracts this round established, checked against the source.

    ⚠ EVERY TEST HERE HAS BEEN RUN AGAINST THE UN-FIXED CODE AND SEEN TO FAIL
    (#R228's rule: a check that stays green when you undo the fix is not a check).
    Where the claim is arithmetic it is COMPUTED here rather than pinned to a
    number this round happened to produce (#R203/#R229).

   (layer-manifest) the lists are views of js/layer-manifest.js */
{

/* ── 9 · DE / RU / ES, measured rather than assumed ─────────────────────────────────────────── */
test('R235 i18n: the positional five have no site left in English', async () => {
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts/i18n-positional-audit.mjs')],
    { encoding: 'utf8', cwd: ROOT });
  /* ⚠ (#R707) THIS MATCHED THE SENTENCE, AND THE SENTENCE WAS NOT THE SUBJECT. The audit used to
     require five positional arguments unconditionally; #R707 derives the arity from
     scripts/lang-policy.mjs (two while the 2026-09-11 amendment stands) and its printed line
     changed with it. A check anchored to the wording goes red for a rewording and stays green for
     a real regression — #R488. What this case is about is the COUNT, so the count is what it
     reads: whatever arity the policy asks for, no site may fall short of it. */
  const shortLine = out.split(String.fromCharCode(10)).find((l) => l.startsWith('sites with fewer than'));
  assert.ok(shortLine, 'the audit no longer reports the short-site count at all');
  assert.equal(shortLine.slice(shortLine.lastIndexOf(':') + 1).trim(), '0',
    'a call site supplies fewer arguments than scripts/lang-policy.mjs authors — ' + shortLine);
  for (const code2 of ['de', 'ru', 'es']) {
    assert.match(out, new RegExp('^' + code2 + ': 0 site', 'm'), code2 + ' has no site identical to English');
  }
  assert.match(out, /total outstanding: 0/, 'the audit is clean');
});
}

/* ═══ from tests/r240-checks.test.mjs (tests #7 of 9) ═══
    IntMap · R240 source-level checks
    Every assertion below is written against the MECHANISM that was wrong, not against a value this
    round happened to pick (#R203's rule). Each one fails on the tree as it stood before this round. */
{
const R = read;
/* comments out, so a claim in prose can never satisfy a check about code (#R166) */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ══ ⑤ THE SIXTH TRANSLATION SURFACE ═══════════════════════════════════════════════════════════
   The five instruments #R239 bound together all measure «how much of the table does this language
   have». None can see a string that was never given a key at all — 49 of those were shipping. */
test('R240 ⑤ every user-visible attribute carries a translation key, and the gate says so', () => {
  const out = JSON.parse(execFileSync(process.execPath,
    [path.join(ROOT, 'scripts', 'i18n-attr-audit.mjs'), '--json'], { encoding: 'utf8' }));
  assert.equal(out.total, 0,
    'unkeyed title/aria-label/placeholder/alt: ' + [...new Set(out.findings.map((f) => f.text))].join(' · '));
  /* the surface is part of the ONE gate, not a sixth free-standing percentage */
  const g = R('scripts/i18n-audit.mjs');
  assert.match(g, /run\('i18n-attr-audit\.mjs'\)/, 'the one gate spawns it');
  assert.match(g, /if \(attrs\.total\) problems\.push/, 'and fails on it');
  /* aria-label had no mechanism at all before this round */
  assert.match(code(R('js/app-body.js')), /\[data-i18n-aria\]/, 'aria-label can be translated');
  assert.match(code(R('js/app-body.js')), /\[data-i18n-alt\]/, 'and so can alt');
});
}

/* ═══ from tests/r242-checks.test.mjs (tests #20 of 20) ═══
    IntMap · #R242 — source-level contracts for this round
    Every test here fails on the code as it was BEFORE the change it guards (checked one at a time),
    which is the only thing that makes a green suite mean anything (#R228).
    Comments are stripped before matching wherever a test looks for a fragment that this file's own
    prose could contain ([[intmap-recurring-lessons]] E, eight rounds running). */
{
/* strip block and line comments — a test must match CODE, never a note quoting the instruction */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ── ⑩ the ninth translation surface is measured and printed ──────────────────────────────────── */
test('R242 ⑩ the gate reports the helper-ternary gap rather than hiding it', () => {
  const g = code(read('scripts/i18n-audit.mjs'));
  assert.ok(/i18n-helper-ternary-audit\.mjs/.test(g), 'the ninth surface must run inside the ONE gate');
  assert.ok(/OPEN GAP/.test(read('scripts/i18n-audit.mjs')), 'and its number must be printed, not swallowed');
  assert.ok(existsSync(join(ROOT, 'scripts', 'i18n-helper-ternary-audit.mjs')));
});
}

/* ═══ from tests/r243-checks.test.mjs (tests #15, #16, #17 of 17) ═══
    IntMap · #R243 — source-level contracts for this round
    Every test here fails on the code as it was BEFORE the change it guards (checked one at a time),
    which is the only thing that makes a green suite mean anything (#R228).
    Comments are stripped before matching wherever a test looks for a fragment that this file's own
    prose could contain ([[intmap-recurring-lessons]] E, nine rounds running). */
{
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const node = (...a) => execFileSync(process.execPath, a.map((x) => (x.startsWith('-') ? x : join(ROOT, x))), { cwd: ROOT, encoding: 'utf8' });

/* ── ⑨ the translation gates ──────────────────────────────────────────────────────────────────── */
test('R243 ⑨ the ninth surface is a gate now, and it is at zero', () => {
  const audit = code(read('scripts/i18n-audit.mjs'));
  assert.ok(/problems\.push\(`\$\{helper\.sites\}/.test(audit),
    'the helper-ternary count must FAIL the gate, not merely print — #R242 wrote down that promotion as the condition');
  const out = node('scripts/i18n-helper-ternary-audit.mjs');
  assert.ok(/no `jp\(\) \? … : …` translation pairs left/.test(out), out);
});

test('R243 ⑨ the positional audit reads `IntMapLang.t(lang, …)` too — the tenth blind spot', () => {
  /* ⚠ (#R251) THE SHAPE MOVED, THE QUESTION DID NOT. This used to grep
     scripts/i18n-positional-audit.mjs for `property.name === 't'`. #R251 resolved «which calls are
     translation calls» ONCE, repo-wide, in scripts/i18n-helpers.mjs — because the same question was
     answered three times, per file, and all three were wrong about a helper reached through a
     property. Asserting on the old ADDRESS would now fail while the capability is intact, so the
     assertion is on the capability: the shared resolver still knows `t()`, and the audit still uses
     the shared resolver rather than growing a fourth private copy. */
  const c = code(read('scripts/i18n-positional-audit.mjs'));
  const h = code(read('scripts/i18n-helpers.mjs'));
  assert.ok(/property\.name === 't'/.test(h) && /IntMapLang\$/.test(h),
    'de/ru/es were unmeasured at every `t()` site, and #R243 converted 467 more into that shape');
  assert.ok(/from '\.\/i18n-helpers\.mjs'/.test(c) && /shapeOf\(/.test(c),
    'the positional audit must ask the shared resolver, not carry its own — three private copies is '
    + 'how #R251 found 65 five-language call sites outside every measurement');
  const out = node('scripts/i18n-positional-audit.mjs');
  assert.ok(/total outstanding: 0/.test(out), out.slice(0, 1200));
  const sites = +((/call sites parsed: (\d+)/.exec(out) || [])[1] || 0);
  assert.ok(sites > 3000, 'the widened universe is ~3,200 sites, not the ~2,400 the old shape saw; got ' + sites);
});

test('R243 ⑨ one dictionary, six columns, and every row complete', () => {
  const apply = code(read('scripts/i18n-apply-inline.mjs'));
  assert.ok(/length !== 6/.test(apply), 'a short row is a half-finished translation and must fail the build');
});
}

/* ═══ from tests/r244-checks.test.mjs (tests #13 of 15) ═══
    #R244 — source-level checks
    Every one of these was written against the UNFIXED source first and observed to FAIL (#R228's
    standing rule). Each names the defect it pins rather than the code that fixes it. */
{
/* comments stripped, so a note that QUOTES a pattern cannot satisfy or trip a check
   ([[intmap-recurring-lessons]] E — this has cost eight rounds) */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ══ ⑬ THE ELEVENTH SHAPE IS MEASURED, AND THE INSTRUMENT CANNOT BE QUIETLY DELETED ═══════════════
   A tuple of translations keyed by LANGUAGE CODE — `{en:'Tibet',jp:'チベット',…}` read as
   `nm[lg]||nm.en`. Invisible to every other instrument, and English for every language the object
   does not name. The count is an OPEN GAP in the one gate (#R242's rule for a gap too large to close
   in the round that finds it): printed, never counted in a percentage, and never absent. */
test('r244 ⑬ the language-keyed-object surface is in the one gate', () => {
  const src = read('scripts/i18n-audit.mjs');
  assert.ok(/i18n-langmap-audit\.mjs/.test(src), 'the gate spawns the instrument');
  /* ⚠ (#R246) IT REACHED ZERO, so it is a GATE now rather than a printed OPEN GAP — #R244's own
     note said to move it the moment it did. The report still prints the line at 0: a surface that
     is measured and empty is the only evidence that it is still being watched. */
  assert.ok(/translation tuples held as an OBJECT keyed by language code/.test(src), 'and prints the number');
  assert.ok(/problems\.push\(`\$\{langmap\.total\} translation tuple\(s\) held as a language-keyed object/.test(src),
    'and fails the build if one comes back');
  const out = execFileSync(process.execPath, [join(ROOT, 'scripts', 'i18n-langmap-audit.mjs'), '--json'],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const j = JSON.parse(out);
  assert.ok(typeof j.total === 'number', 'it answers with a number');
  /* ⚠ THE RATCHET: this number only ever goes DOWN. #R244 measured 713, #R245 590, #R246 zero. */
  assert.equal(j.total, 0, `the open gap grew to ${j.total} — a new language-keyed object was added; write it as pickArgs() instead`);
});
}

/* ═══ from tests/r245-checks.test.mjs (tests #8, #9 of 10) ═══
    IntMap · #R245 — source-level checks
    Seven instructions. Each test below is written against the ROOT CAUSE that was measured, not
    against the symptom, so it fails on the shipped code that produced the report.

    ⚠ Every test strips comments before matching (`code()`), because this file's own subject matter
    quotes the strings it forbids — [[intmap-recurring-lessons]] E, eight rounds running. */
{

/* ── ⑧ the eleventh translation shape, in the files this round closed ───────────────────────────
   A tuple of translations held as an object keyed by language code is invisible to every instrument
   and has no inline-table fallback (#R244). These nine files no longer contain one, and the ONE
   gate's number is ratcheted so it can only go down. */
test('r245 ⑧ nine more files hold their translation tuples as calls, and the count only falls', async () => {
  const CLOSED = ['js/data-layers.js', 'js/history.js', 'js/space-cosmos.js', 'js/flight-sim.js',
    'js/world-packs.js', 'js/map-extras.js', 'js/engine-select.js', 'js/ocean-currents.js'];
  const CODES = new Set(['en', 'jp', 'ja', 'de', 'ru', 'es', 'fr', 'ko', 'zh', 'zh-hans', 'zh-hant']);
  const CODEY = /^[A-Za-z][A-Za-z0-9_.-]{0,7}$/, URLISH = /^[^\s]*[=&?][^\s]*$/;
  const isProse = (v) => !CODEY.test(v) && !URLISH.test(v);
  let total = 0;
  for (const f of CLOSED) {
    const src = read(f);
    const ast = parse(src, { ecmaVersion: 2022, sourceType: 'module' });
    let n = 0;
    walk.simple(ast, { ObjectExpression(o) {
      const vals = []; let langs = 0;
      for (const p of o.properties) {
        if (p.type !== 'Property' || p.computed) continue;
        const k = p.key.type === 'Identifier' ? p.key.name : (p.key.type === 'Literal' ? String(p.key.value) : null);
        if (k == null || !CODES.has(String(k).toLowerCase())) continue;
        if (!(p.value.type === 'Literal' && typeof p.value.value === 'string')) continue;
        langs++; vals.push(p.value.value);
      }
      if (langs >= 2 && vals.some(isProse)) n++;
    } });
    assert.equal(n, 0, `${f} still holds ${n} translation tuple(s) as a language-keyed object`);
    total += n;
  }
  assert.equal(total, 0);
});

/* ⚠ …and the RATCHET on what is left, so the number this round measured cannot creep back up.
   #R244 left 713; this round leaves 590. The rule #R242 set for an OPEN GAP is that it is printed
   rather than hidden, and that it only ever goes down. */
test('r245 ⑧b the language-keyed-object count is a ratchet', async () => {
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync(process.execPath, [join(ROOT, 'scripts/i18n-langmap-audit.mjs'), '--json'],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const n = JSON.parse(out).total;
  assert.ok(n <= 590, `the eleventh shape is at ${n}; #R245 left it at 590 and it may only go down`);
});
}
