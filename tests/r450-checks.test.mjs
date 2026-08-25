/* ============================================================================
 *  #R450 — rows in a locale table that nothing can ask for
 * ----------------------------------------------------------------------------
 *  `"Volcanoes (GVP Holocene, all 1,215)"` was translated into fr / ko / zh-Hant / zh-Hans in
 *  #R251 and orphaned in #R353, when the volcano layer was rebuilt and its legend took the shorter
 *  `"Volcanoes (GVP Holocene)"`. Four rows survived their English side by two rounds, carrying a
 *  catalogue count upstream had already revised (1,215 → 1,214, and #R432 re-counted it again).
 *  Nothing could render them, nothing could fail, and — this is the part that matters — no gate
 *  could see them: all seventeen surfaces in scripts/i18n-audit.mjs count `want ∩ have`, so a row
 *  in `have` that is in no `want` drops out of the numerator AND the denominator in silence.
 *  Measured when the eighteenth surface was written: 413 such keys, 1,959 rows, in all nine files.
 *
 *  ⚠⚠⚠ THE CHECK THAT MATTERS HERE IS ④. The obvious way to find these rows is `have − want`,
 *  reusing the universe the other seventeen already build. `want` has holes — js/map-readout.js
 *  binds `L` to a lazy wrapper that scripts/i18n-helpers.mjs cannot resolve, so its ten call sites
 *  are invisible to every instrument in the family — and for a coverage surface a hole is an
 *  undercount, while here it is a DELETION. ④ pins the difference by naming a string that is live
 *  only through that wrapper: if a later round ever «simplifies» the audit onto `shapeOf()`, that
 *  string becomes deletable and this check goes red before the translation does.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import * as walk from 'acorn-walk';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { audit, classifier, tableOf, codes } from '../scripts/i18n-dead-key-audit.mjs';
import { parseAll, context, shapeOf } from '../scripts/i18n-helpers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readLF(join(ROOT, p));

/* ⚠ the label has now been rewritten TWICE — «…, all 1,215» → «Volcanoes (GVP Holocene)» (#R353)
   → «Volcanoes (Smithsonian GVP)» (#R432) — and each rewrite orphaned the one before it in four
   languages. So the live half is read out of the file that draws the layer rather than written
   here: a third rename must move this check, not quietly make it vacuous. */
const GONE = ['Volcanoes (GVP Holocene, all 1,215)', 'Volcanoes (GVP Holocene)'];

function liveVolcanoLabel() {
  const m = /_registerLayerOpacity\('volc2',\s*LA\('([^']+)'/.exec(R('js/beta-overlays.js'));
  assert.ok(m, 'js/beta-overlays.js no longer registers the volcano layer with an LA(…) label');
  return m[1];
}

test('① every orphaned volcano label is gone from every table, and the one on screen is not', () => {
  const live = liveVolcanoLabel();
  assert.ok(!GONE.includes(live), `the label ${JSON.stringify(live)} is both drawn and listed as dead`);
  for (const c of codes()) {
    const inline = new Set(tableOf(c, 'inline').map((d) => d.key));
    if (!inline.size) continue;                       /* the five positional languages have no inline table */
    for (const g of GONE) assert.ok(!inline.has(g), `ui.${c}.js still carries ${JSON.stringify(g)}`);
    assert.ok(inline.has(live), `ui.${c}.js has no row for ${JSON.stringify(live)} — that one IS on screen`);
  }
  /* …and the orphans cannot come back: scripts/i18n-apply-inline.mjs merges every staging file and
     scripts/i18n-append-inline.mjs inserts every key the locale does not already have. */
  const staging = JSON.parse(R('scripts/i18n/r251-c.json'));
  for (const g of GONE) assert.ok(!(g in staging), `scripts/i18n/r251-c.json would put ${JSON.stringify(g)} straight back`);
});

test('② no locale table holds a row nothing can ask for, and no staging file would add one', () => {
  const r = audit();
  assert.equal(r.keys.length, 0,
    'unreachable keys: ' + r.keys.slice(0, 8).map((k) => JSON.stringify(k)).join(', '));
  assert.equal(r.rows.length, 0);
  assert.equal(r.staging.length, 0,
    'unreachable staging rows: ' + r.staging.slice(0, 8).map((s) => `${s.file} ${JSON.stringify(s.key)}`).join(', '));
  /* every table was actually looked at — a corpus that failed to load would also report zero */
  assert.ok(r.corpus > 200, `only ${r.corpus} shipped file(s) in the corpus`);
  assert.ok(r.literals > 10000, `only ${r.literals} literal string(s) — the parse half of the corpus is empty`);
  assert.equal(r.per.filter((p) => p.table === 'inline').length, 4, 'the four inline tables are what carry English-keyed rows');
  assert.equal(r.per.filter((p) => p.table === 'ui').length, 9, 'every language declares a keyed table');
});

test('③ the instrument can say «dead» — it is not a check that cannot fire', () => {
  const { verdict } = classifier();
  const nonce = 'r450 nonce — no shipped file says this ✻';
  assert.equal(verdict(nonce), 'dead');
  /* and it says «live» for something that plainly is */
  assert.equal(verdict(liveVolcanoLabel()), 'live');
});

test('④ ⚠ a string live ONLY through the lazy wrapper is live here — the audit does not inherit shapeOf()', () => {
  /* the universe the other seventeen surfaces measure against */
  const want = new Set();
  for (const f of parseAll().keys()) {
    const ctx = context(f, 'strict');
    walk.simple(ctx.ast, {
      CallExpression(n) {
        const i = shapeOf(n, ctx); if (i < 0) return;
        const a = n.arguments[i];
        if (a && a.type === 'Literal' && typeof a.value === 'string' && a.value.trim()) want.add(a.value);
      },
    });
  }
  /* js/map-readout.js: `const L=(...a)=>{ if(!_L) _L=window.IntMapLang.pick(()=>HOST.lang); … }` */
  const wrapper = 'Tropic of Cancer';
  const src = R('js/map-readout.js');
  assert.ok(src.includes(`L('${wrapper}'`), 'js/map-readout.js no longer calls L() with this string — pick another witness');
  assert.ok(!want.has(wrapper),
    'the lazy wrapper is resolved now, so this check has stopped asserting anything: point it at another blind spot or delete it');
  const { verdict } = classifier();
  assert.equal(verdict(wrapper), 'live',
    'the audit called a live row dead — it must not be built on the want set (see the header)');
  /* the same holds for every row the four inline tables still carry */
  const fr = new Set(tableOf('fr', 'inline').map((d) => d.key));
  assert.ok(fr.has(wrapper), 'ui.fr.js lost a row that IS reachable');
});

test('⑤ ⚠ an assembled key is held back rather than deleted, and a wildcard is not a pattern', () => {
  const { verdict, pats } = classifier();
  assert.ok(pats.length > 50, `only ${pats.length} assembly pattern(s) — the safety net stopped finding the concatenations`);
  /* build a string each pattern can produce, and check the audit refuses to call it dead.
     ⚠ `/` is in the list because RegExp#source escapes it on its own, whatever the pattern was
     built from — reading the source back is not the same as reading what was written. */
  const unesc = (s) => s.replace(/\\([.*+?^${}()|[\]\\/])/g, '$1');
  let checked = 0;
  for (const p of pats.slice(0, 40)) {
    const body = p.re.source.replace(/^\^/, '').replace(/\$$/, '');
    if (!body.includes('[\\s\\S]*')) continue;
    const made = body.split('[\\s\\S]*').map(unesc).join('r450✱');
    assert.ok(p.re.test(made), 'the candidate does not match the pattern it was built from');
    assert.equal(verdict(made), 'assembled', `a key ${p.where} can produce was not held back: ${JSON.stringify(made)}`);
    checked++;
  }
  assert.ok(checked >= 10, `only ${checked} pattern(s) exercised`);
  /* ⚠ and a chain with no constant part must NOT become a pattern: it would match every key and
     hold the whole table back, i.e. a green that asserts nothing */
  assert.ok(!pats.some((p) => p.re.source === '^[\\s\\S]*$'), 'a wildcard got into the pattern set');
});

test('⑥ the eighteenth surface is wired into the one gate, and it is a gate rather than a printed number', () => {
  const gate = codeOnly(R('scripts/i18n-audit.mjs'));
  assert.match(gate, /run\('i18n-dead-key-audit\.mjs'\)/, 'scripts/i18n-audit.mjs does not run the audit');
  /* ⚠ it must reach `problems`, which is what makes --gate exit 1 — printing the number is not a
     gate, and the condition must be the bare count. A `> N` here would be a ratchet: #R242's rule
     that makes the adjacent-data tuples a ceiling does not apply to rows that are DELETED rather
     than translated, so a threshold would be a number with no argument behind it. */
  assert.match(gate, /if \(dead\.keys\.length\) problems\.push\(/, 'the unreachable keys do not fail the gate at zero');
  assert.match(gate, /if \(dead\.staging\.length\) problems\.push\(/, 'the staging rows do not fail the gate at zero');
  /* …asked of the gate BLOCK alone — the report above it truncates its own list with a `>`, and a
     check that cannot tell the two apart would be answering about the wrong half of the file */
  const block = gate.slice(gate.indexOf("if (process.argv.includes('--gate'))"));
  assert.ok(block.includes('dead.keys.length'), 'the gate block does not mention the eighteenth surface');
  assert.doesNotMatch(block, /dead\.(keys|rows|staging)\.length\s*[<>]/, 'the eighteenth surface became a ratchet');
  /* the count travels in the machine-readable output too, so a reader is not the only consumer */
  const json = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.ok(/i18n-audit\.mjs --gate/.test(json.scripts['check:i18n']), 'check:i18n no longer runs the one gate');
  assert.match(gate, /deadKeys: dead\.keys\.length/, '--json does not carry the count');
});
