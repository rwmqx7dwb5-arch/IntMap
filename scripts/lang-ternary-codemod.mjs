#!/usr/bin/env node
/* ============================================================================
 *  IntMap · scripts/lang-ternary-codemod.mjs — the 281 chains the registry never saw  (#R231)
 * ----------------------------------------------------------------------------
 *  「まだ簡体・繁体中文に不十分な箇所があるから詰めて。また、それと同時に今後IntMapの設定言語を追加
 *    するのが、1発で終わるようにさらに柔軟な言語システムに。」
 *
 *  #R221 built the registry, #R223 and #R224 added Chinese through it, and every round since has been
 *  told the app is 100 % translated by scripts/i18n-report.mjs. It measured `L(…)` call sites. It
 *  could not measure these, because these are not calls:
 *
 *      HOST.lang==='jp'?'データなし':HOST.lang==='de'?'Keine Daten':HOST.lang==='ru'?'Нет данных'
 *        :HOST.lang==='es'?'Sin datos':'No data'
 *
 *  281 of them across 30 files, and for a sixth or seventh language every one evaluates to the final
 *  alternate — English. That is the 「不十分な箇所」, and it is also the reason a new language is not
 *  「1発」: the chain names five languages in its own syntax and cannot be extended from LANGS.
 *
 *      node scripts/lang-ternary-codemod.mjs [--check] [--verbose]
 *
 *  ══ WHAT IT REWRITES, AND WHAT IT REFUSES TO ════════════════════════════════════════════════════
 *  Only a chain that is provably the五言語 idiom:
 *    · it is a ConditionalExpression whose test is `<expr> === '<code>'`;
 *    · `<expr>` is TEXTUALLY IDENTICAL in every link (so `a.lang===…?…:b.lang===…?…` is refused);
 *    · the codes appear in LANGS order, starting at index 1 (English is the final alternate);
 *    · every branch value is a plain string Literal.
 *  Anything else — a numeric chain (`?1:?2:?3:?4:0`, which is an INDEX and becomes
 *  `IntMapLang.index()` by hand), a two-branch `?'HDI':'HDI'`, a chain carrying an expression — is
 *  left exactly as it was and listed in the report. This tool does not guess.
 *
 *  ⚠ THE REPLACEMENT IS AN EXPRESSION, NOT A STATEMENT, so it is safe inside template literals,
 *  object literals, arguments and other conditionals — which is where most of them live:
 *
 *      window.IntMapLang.t(HOST.lang,'No data','データなし','Keine Daten','Нет данных','Sin datos')
 *
 *  The original argument order is preserved by construction: English is the chain's final alternate
 *  and becomes argument 1, then each code's value in LANGS order.
 *
 *  ⚠ IT IS IDEMPOTENT and safe to re-run: a rewritten site is a CallExpression and no longer matches.
 *  `--check` exits non-zero if any convertible chain is left, which is what tests/r231-checks asserts.
 * ==========================================================================*/
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = join(ROOT, 'js');
const CHECK = process.argv.includes('--check');
const VERBOSE = process.argv.includes('--verbose');

/* the ONE list, read from the registry source (it is a browser file, not a module) */
function langCodes() {
  const src = readFileSync(join(JS, 'lang-registry.js'), 'utf8');
  const m = src.match(/var LANG_ROWS = \[([\s\S]*?)\n  \];/);   /* (#R232) renamed — see the note by it */
  if (!m) throw new Error('LANG_ROWS not found in js/lang-registry.js');
  const out = [];
  const re = /\{\s*code:\s*'([^']+)'/g;
  let g; while ((g = re.exec(m[1]))) out.push(g[1]);
  return out;
}
const CODES = langCodes();
const POS = CODES.slice(0, 5);            /* the positional five — the only ones a chain can name */

/* Collect every ConditionalExpression in the file, outermost first. */
function conditionals(ast) {
  const out = [];
  (function walk(n, parent) {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'ConditionalExpression') out.push({ node: n, parent });
    for (const k of Object.keys(n)) {
      if (k === 'type' || k === 'start' || k === 'end') continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === 'string' && walk(c, n));
      else if (v && typeof v.type === 'string') walk(v, n);
    }
  })(ast, null);
  return out;
}

/* `<expr> === '<code>'` → the subject's source text and the code, or null */
function langTest(node, src) {
  if (!node || node.type !== 'BinaryExpression' || node.operator !== '===') return null;
  const { left, right } = node;
  if (!right || right.type !== 'Literal' || typeof right.value !== 'string') return null;
  if (POS.indexOf(right.value) < 0) return null;
  /* the subject has to LOOK like a language accessor, or `mode==='es'` would qualify */
  const text = src.slice(left.start, left.end);
  if (!/(^|[.\s(])(lang|currentLang|uiLang)$/.test(text) && !/\blang\b/.test(text)) return null;
  return { subject: text, code: right.value };
}

/* ⚠ A BARE LANGUAGE OR LOCALE CODE IS NOT A TRANSLATION, and rewriting one as a translation is the
   worst thing this tool could do: js/search-geocode.js's `lang==='jp'?'ja':'en'` is Nominatim's
   accept-language parameter, and routing it through the `inline` table would make a translator's
   entry decide what a geocoder is asked for. Values of this shape are handled by `locale()` (when
   they are region tags) or left for a human (when they are bare codes), never by `t()`. */
const CODEISH = /^[a-z]{2}(-[A-Za-z]{2,4})?$/;
/* ⚠ …AND NEITHER IS A BARE IDENTIFIER. Caught by tests/r191-checks on the first run of this tool:
   js/seismic.js chooses between the two INTENSITY SCALES with `lang==='jp'?'jma':'mmi'`, and neither
   'jma' nor 'mmi' is code-shaped by the rule above (both are three letters). Rewritten as a
   translation, a future entry in a locale file's `inline` table would decide which seismic scale the
   app computes — a translator changing physics. A value that is one short all-lower-case token with
   no space is a KEY, not a sentence; those are left for a human. */
const TOKENISH = /^[a-z][a-z0-9_-]{0,7}$/;

function analyse(node, src) {
  const values = Object.create(null);
  let subject = null, n = node, links = 0;
  while (n && n.type === 'ConditionalExpression') {
    const t = langTest(n.test, src);
    if (!t) return null;
    if (subject === null) subject = t.subject;
    else if (t.subject !== subject) return null;              /* two different accessors — refuse */
    if (values[t.code] !== undefined) return null;            /* a repeated code — refuse */
    if (!n.consequent || n.consequent.type !== 'Literal' || typeof n.consequent.value !== 'string') return null;
    values[t.code] = n.consequent;
    links++;
    n = n.alternate;
  }
  /* ⚠ THE ENGLISH TAIL MUST BE A PLAIN STRING LITERAL, and that is not fussiness — it is the KEY the
     `inline` table is looked up by (js/lang-registry.js). A chain whose English side is a template
     literal or a variable cannot be table-translated however it is written, so converting it would
     move code around without making one word of Chinese appear. Those are reported, not rewritten. */
  if (!n || n.type !== 'Literal' || typeof n.value !== 'string') return null;
  /* the named codes must all be positional ones, in LANGS order, but they need not be CONTIGUOUS:
     js/data-layers.js has a de/ru/es chain with no Japanese branch, and a hole is written as
     `undefined`, which `t()` already treats the way the chain did — fall through to English. */
  const named = Object.keys(values);
  if (!named.length) return null;
  let last = 0;
  for (const c of named) { const i = POS.indexOf(c); if (i < 1 || i < last) return null; last = i; }
  const want = POS.slice(1, 1 + POS.indexOf(named[named.length - 1]));

  const all = [n.value].concat(named.map((c) => values[c].value));
  /* ── the REGION-TAG shape: `lang==='jp'?'ja-JP':'en-GB'` → locale(lang,'en-GB') ─────────────
     One link, both sides a tag, and the Japanese side is Japanese's own tag. Everything the chain
     used to answer for English it still answers (that is what `enTag` is for); de / ru / es stop
     falling through to an English date format inside their own panel, which is the same defect as
     the strings and the reason these are in scope at all. */
  const isCode = (v) => typeof v === 'string' && CODEISH.test(v);
  if (links === 1 && values.jp && all.every(isCode) && /^ja(-|$)/.test(values.jp.value) && /^en(-|$)/.test(n.value)) {
    return { kind: 'locale', subject, enTag: n.value };
  }
  if (all.some(isCode)) return null;                           /* any other code-shaped chain: human */
  if (all.every((v) => typeof v === 'string' && TOKENISH.test(v))) return null;   /* identifiers, not prose */
  if (links < 2 && all[0] === all[1]) return null;             /* `?'HDI':'HDI'` says nothing */
  return { kind: 't', subject, en: n, values, want };
}

let totalRewritten = 0, totalSkipped = 0;
const skipped = [];
const files = readdirSync(JS).filter((f) => f.endsWith('.js') && f !== 'lang-registry.js');

for (const f of files) {
  const p = join(JS, f);
  let src = readFileSync(p, 'utf8');
  if (src.indexOf("lang===") < 0) continue;
  let ast;
  try { ast = parse(src, { ecmaVersion: 2022, sourceType: 'script' }); }
  catch (e) { try { ast = parse(src, { ecmaVersion: 2022, sourceType: 'module' }); } catch (e2) { continue; } }

  const edits = [];
  const claimed = [];                       /* byte ranges already taken by an outer rewrite */
  for (const { node } of conditionals(ast)) {
    if (claimed.some((r) => node.start >= r[0] && node.end <= r[1])) continue;
    const a = analyse(node, src);
    if (!a) {
      /* only report the ones that LOOK like the idiom but were refused */
      if (node.test && langTest(node.test, src)) { totalSkipped++; skipped.push(`${f}:${src.slice(0, node.start).split('\n').length}  ${src.slice(node.start, Math.min(node.end, node.start + 90)).replace(/\s+/g, ' ')}`); }
      continue;
    }
    claimed.push([node.start, node.end]);
    if (a.kind === 'locale') {
      const tail = (a.enTag === 'en-US') ? '' : `,${JSON.stringify(a.enTag)}`;
      edits.push([node.start, node.end, `window.IntMapLang.locale(${a.subject}${tail})`]);
    } else {
      const args = [a.subject, src.slice(a.en.start, a.en.end)]
        .concat(a.want.map((c) => (a.values[c] ? src.slice(a.values[c].start, a.values[c].end) : 'undefined')));
      edits.push([node.start, node.end, `window.IntMapLang.t(${args.join(',')})`]);
    }
  }
  if (!edits.length) continue;
  edits.sort((x, y) => y[0] - x[0]);
  for (const [s, e, text] of edits) src = src.slice(0, s) + text + src.slice(e);
  totalRewritten += edits.length;
  if (!CHECK) writeFileSync(p, src);
  console.log(`${CHECK ? 'would rewrite' : 'rewrote'} ${String(edits.length).padStart(3)}  ${f}`);
}

console.log(`\n${CHECK ? 'convertible' : 'converted'}: ${totalRewritten}   left for a human: ${totalSkipped}`);
if (VERBOSE && skipped.length) { console.log('\nnot converted (not the five-language string idiom):'); skipped.forEach((s) => console.log('  ' + s)); }
if (CHECK && totalRewritten > 0) {
  console.error('\nSTALE — js/ still contains hand-written five-language chains. Run without --check.');
  process.exit(1);
}
