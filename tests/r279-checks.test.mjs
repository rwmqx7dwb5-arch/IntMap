/* ============================================================================
 *  IntMap · #R279 source checks
 * ----------------------------------------------------------------------------
 *  「いちいち Atlas の回答に、「🧭 統合分析」ってつけなくていいです」
 *
 *  Every integrated-analysis reply opened with a bold line that said «Integrated analysis» — on an
 *  answer that IS the integrated analysis. It carried no information the reader did not already
 *  have: the same three words, the same compass, on every single reply. It is gone; the prose is
 *  now the first thing in the reply.
 *
 *  ⚠ ASSERTIONS ARE ABOUT THE PROPERTY, NOT A LITERAL — the shape checked here is «the first thing
 *  assigned to the analyze reply's html is the prose», which survives restyling of that div.
 *  ⚠ COMMENTS ARE STRIPPED BEFORE ANY SEARCH. This round's own source comment quotes the removed
 *  label, so a check that read the raw file would fail on the sentence explaining the fix
 *  (「自分の検査が自分のコメントに当たる」, fourteen times now).
 *  ⚠ §① RUNS THE SAME PREDICATE ON A SYNTHETIC FILE CARRYING THE OLD SHAPE, so green here means
 *  «looked and found nothing», not «looked at nothing» (#R274 ③).
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const ATLAS = () => codeOnly(read('js/atlas-console.js'));

/* The analyze reply is built by appending to `html`; what OPENS it is whatever sits between the
   declaration and the call that renders the model's prose. Returns that opening text, or null when
   the reply is not built this way at all (which is itself a failure). */
const analyzeOpener = (src) => {
  /* ⚠ (#R348) THE BODY MARKER MOVED AND THE REQUIREMENT DID NOT. The analyse reply renders a
     STRUCTURE now — `renderAnswer(_env,_reg,…)` where it used to be `mdMini(String(txt).trim())` —
     and what #R279 asks is about whatever sits BEFORE that body, which is still nothing but the
     prose div. Both markers are recognised so ① can go on showing the check red against the old
     shape, which is the half that makes ② mean anything. */
  let body = src.indexOf('renderAnswer(_env,_reg,');
  if (body < 0) body = src.indexOf('mdMini(String(txt).trim())');
  if (body < 0) return null;
  const decl = src.lastIndexOf('let html=', body);
  if (decl < 0) return null;
  return src.slice(decl, body);
};

/* ── ① THE CHECK CAN GO RED ────────────────────────────────────────────────────────────────── */
const OLD_SHAPE = [
  "          let html='<div style=\"font-weight:600;margin:2px 0 5px;\">\uD83E\uDDED '+L('Integrated analysis','\u7d71\u5408\u5206\u6790','Integrierte Analyse')+'</div>';",
  "          html+='<div style=\"font-size:14px;line-height:1.68;\">'+mdMini(String(txt).trim())+'</div>';",
].join('\n');

test('R279 (1) the predicate names the old header when it is there', () => {
  const opener = analyzeOpener(OLD_SHAPE);
  assert.ok(opener, 'the synthetic old shape is still recognised as an analyze reply');
  assert.ok(/L\(/.test(opener), 'the old shape opens with a translated label — this is what regressing looks like');
});

/* ── ② AND THE REAL FILE OPENS WITH THE ANSWER ─────────────────────────────────────────────── */
test('R279 (2) the analyze reply opens with the prose, not with a label', () => {
  const opener = analyzeOpener(ATLAS());
  assert.ok(opener, 'the analyze reply still renders the model prose through mdMini');
  assert.ok(!/L\(/.test(opener), `the reply opens with a translated label again: ${opener}`);
  assert.ok(!/font-weight:600/.test(opener), `the reply opens with a heading again: ${opener}`);
  assert.match(opener, /font-size:14px/, 'the prose div is the first thing in the reply');
});

test('R279 (3) the label itself is gone from the shipped console', () => {
  assert.ok(!/Integrated analysis/.test(ATLAS()), 'the «Integrated analysis» heading string is no longer emitted');
});

/* ── ③ AND NOTHING ELSE WAS TAKEN OUT ──────────────────────────────────────────────────────────
   The instruction was about ONE label. The other reply headers, and the compass that belongs to
   routing rather than to analysis, are untouched — a deletion that ran wide would show up here. */
test('R279 (4) the other reply headers are untouched', () => {
  const src = ATLAS();
  for (const kept of ['custom evaluation layer', 'related indicators (all countries)', 'Optimized order']) {
    assert.ok(src.includes(kept), `${kept} is still rendered`);
  }
});
