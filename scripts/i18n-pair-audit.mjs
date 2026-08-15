#!/usr/bin/env node
/* ============================================================================
 *  IntMap · ⚠⚠⚠ THE TWELFTH SHAPE — a translation tuple held as ADJACENT DATA   (#R246)
 * ----------------------------------------------------------------------------
 *  「全ての言語について、すべての面において対応が完璧かどうか点検し、未了点があれば修正して。
 *    いつまでたっても言語対応の漏れが見つかることは許されない。」
 *
 *  ══ WHY THERE WAS STILL SOMETHING TO FIND, FOR THE TWELFTH TIME ════════════════════════════════
 *  #R241 closed the tuple held as an ARRAY subscripted by the language's POSITION. #R244 measured
 *  and #R246 closed the tuple held as an OBJECT keyed by the language's CODE. Both instruments ask
 *  the same question — «is this container indexed by a language?» — and there is a third container,
 *  indexed by NOTHING at all:
 *
 *      _dc('d-ramstein','mil','mil',7.6,49.44,'Ramstein Air Base','ラムシュタイン空軍基地', …)
 *      A1:['Light (< 7 t)','小型機（7 t 未満）','Leicht (< 7 t)','Лёгкий (< 7 т)','Ligero (< 7 t)']
 *      ['東京','Tokyo',139.7671,35.6812,0]
 *
 *  The languages simply sit NEXT TO EACH OTHER, in argument order or in element order, and which
 *  slot is which is knowledge held in whatever reads the row. Every instrument here counts ZERO of
 *  it: the langmap audit wants language-coded KEYS, the positional-array audit wants a
 *  language→POSITION map, the positional audit wants a callee bound to IntMapLang, and the
 *  two-branch and helper audits want a ternary between two LITERALS. So they all print 100 %, and
 *  the strings are English in every language the row does not happen to list. That is
 *  [[intmap-recurring-lessons]] B for the seventh time.
 *
 *  ══ WHAT THIS MEASURES ═════════════════════════════════════════════════════════════════════════
 *  A CONTAINER — one array literal, or one call's argument list — holding two ADJACENT string
 *  literals of which exactly one is Japanese and the other is Latin prose. One finding per
 *  container, so a five-language row is one thing to fix rather than four.
 *
 *  ⚠ A CALL THAT IS ALREADY A TRANSLATION CALL IS EXEMPT, and «already» is resolved from the FILE,
 *  not from a list of names: the identifiers bound to `IntMapLang.pick()` / `.pickArgs()` / `.t` in
 *  that file (and those destructured out of js/world-packs.js's `_ui`, which hands `L` over) are
 *  collected first. `L('Tokyo','東京',…)` is exactly the shape this file exists to ask for, and its
 *  arguments are adjacent by construction; a missing fifth argument there is reported by
 *  scripts/i18n-positional-audit.mjs, which is the instrument that owns that question.
 *
 *  ⚠ AND THE ANSWER IS THE SAME ONE, TWICE OVER: STOP THE SHAPE EXISTING. `IntMapLang.pickArgs()`
 *  returns the array it is handed, so `LA('Tokyo','東京',…)` is byte-identical DATA that is also an
 *  ordinary call site — which the positional audit and the inline report then read with no edit.
 *
 *      node scripts/i18n-pair-audit.mjs           # the list
 *      node scripts/i18n-pair-audit.mjs --list    # …every one, with its line
 *      node scripts/i18n-pair-audit.mjs --json    # for scripts/i18n-audit.mjs
 * ==========================================================================*/
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = join(ROOT, 'js');
/* the registry owns the language machinery; the locale files ARE the tables this is about */
const SKIP = /(^|\/)lang-registry\.js$|(^|\/)locales\//;

/* Japanese script: hiragana, katakana, CJK ideographs and the fullwidth forms the app's own
   Japanese strings use. ⚠ NOT a general CJK test — this file only ever looks at js/, whose second
   language is Japanese; a Chinese string would match the ideograph range too, and that is fine. */
const JA = /[぀-ヿ㐀-鿿！-｠]/;
/* …and the other half of a pair has to be Latin PROSE, not a token. Same rule as the langmap audit:
   an id, a colour, a code or a URL is not a translation. */
/* ⚠ THE PROSE TEST IS LOOSER HERE THAN IN THE LANGMAP AUDIT, ON PURPOSE. There, a short ASCII token
   («EUR», «JP») had to be excluded because a language-keyed map of CODES is a real and legitimate
   shape. Here the OTHER half of the pair is already known to be Japanese prose, so a short English
   word beside it — «Coal», «Gas», «Oil» — is a translation and not a code. Keeping the strict rule
   made this file measure three of those rows by their COLOUR instead of by their label. */
const HEX = /^#[0-9a-fA-F]{3,8}$/;
const KEYISH = /^[a-z0-9]+([_.][a-z0-9]+)+$/;              /* coal_share_of_electricity__pct */
const FILEISH = /^[\w./-]+\.(png|jpg|jpeg|svg|gz|json|js|css|webp|bin|tle)$/i;
const URLISH = /^[^\s]*[=&?][^\s]*$/;
const isProse = (v) => v.length > 1 && /[A-Za-z]/.test(v)
  && !HEX.test(v) && !KEYISH.test(v) && !FILEISH.test(v) && !URLISH.test(v) && !JA.test(v);

/* ══ ⚠⚠⚠ (#R249) THE EXEMPTION IS DECLARED IN THE SOURCE AND VALIDATED HERE ═══════════════════════
   「固有名詞は構造的に除外し、UI文だけ全言語化」 (confirmed with the reader).

   Most of what this audit counts is not UI prose at all — it is a RECORD ABOUT A REAL ENTITY whose
   label happens to be written in two languages: a gazetteer row, an organisation's HQ, a company,
   a railway station. Demanding nine translations of «AAPL / Apple / アップル» is demanding a
   translation of a proper noun, and #R248 already measured what happens when a codemod guesses at
   these — it filed a MATCHER as UI, and 「次のラウンドが照合用の語を律儀に翻訳しにくる」.

   ⚠ AND A HEURISTIC CANNOT TELL THEM APART. The obvious structural rule — «the row carries
   coordinates» — exempts `['city',['Naples',…],14.27,40.85,'Naples','ナポリ']` correctly and
   exempts `E(1492,-74.48,24.10,'geo','Columbus reaches the Americas',…)` WRONGLY, and that second
   one is exactly the UI prose this gate exists to find. Which of the two a table is, is knowledge
   the table's author has and the syntax does not carry.

   ⚠ SO IT IS DECLARED — AND THE DECLARATION IS CHECKED, WHICH IS WHAT MAKES IT STRUCTURAL RATHER
   THAN A LIST OF NAMES IN THIS FILE (the maintenance surface #R246 removed for `langNames`):

       /* @i18n-entity-data  place names — matched and displayed, not UI prose *␘/
       const _BUILTIN_GZ=[ … ];

   A marker is honoured ONLY on a container whose rows carry a NON-LINGUISTIC KEY to the entity —
   a coordinate pair, an ISO-3166 code, an exchange ticker or a domain. A marker on a container of
   pure prose is REJECTED and reported, so the exemption cannot be used to silence UI text; and the
   exempt COUNT is printed on every run, so it can never become invisible. */
const MARKER = /@i18n-entity-data\b/;
const ISOISH = /^[A-Z]{2,3}$/;                               /* US, USA, JPN — ISO-3166 / ticker */
const TICKER = /^[A-Z][A-Z0-9.\-]{0,5}$/;                    /* AAPL, BRK.B, 7203.T */
const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;               /* apple.com */
/* a coordinate PAIR: two numbers in range, at least one of which is not a small integer (a year,
   a count and a percentage are all small integers; a longitude almost never is) */
function hasEntityKey(node) {
  let found = false;
  walk.simple(node, {
    ArrayExpression(n) { if (scanKeys(n.elements)) found = true; },
    CallExpression(n) { if (scanKeys(n.arguments)) found = true; },
    NewExpression(n) { if (scanKeys(n.arguments)) found = true; },
  });
  return found;
}
function scanKeys(list) {
  if (!list) return false;
  for (let i = 0; i + 1 < list.length; i++) {
    const a = list[i], b = list[i + 1];
    if (a && b && a.type === 'Literal' && b.type === 'Literal'
      && typeof a.value === 'number' && typeof b.value === 'number'
      && Math.abs(a.value) <= 180 && Math.abs(b.value) <= 90
      && (!Number.isInteger(a.value) || !Number.isInteger(b.value))) return true;
  }
  for (const e of list) {
    if (!e || e.type !== 'Literal' || typeof e.value !== 'string') continue;
    if (ISOISH.test(e.value) || TICKER.test(e.value) || DOMAIN.test(e.value)) return true;
  }
  return false;
}

const files = [];
(function walkDir(dir, rel) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) walkDir(join(dir, e.name), rel + e.name + '/');
    else if (e.name.endsWith('.js')) files.push([join(dir, e.name), rel + e.name]);
  }
})(JS, 'js/');

/* ── which identifiers in THIS file are translation functions ─────────────────────────────────
   ⚠ NOT A LIST OF NAMES. Half the files wrap the registry in a local helper of their own —
   `_authL(...)`, `L5(...)`, `OL(...)`, `_L5(...)` — and a name list would have to be maintained
   against every one of them for ever, which is the maintenance surface this whole family of
   instruments exists to remove. The test is instead STRUCTURAL and then TEXTUAL: a name bound
   directly to `IntMapLang.pick()/.pickArgs()/.t`, a name destructured out of js/world-packs.js's
   `_ui` (which hands `L` over), or a function whose own body names `IntMapLang` at all. A function
   that reaches the registry IS a translation call, whatever it is called. */
function langNames(ast, src) {
  const names = new Set();
  const uiHolders = new Set();          /* identifiers bound to IntMapWorld._ui */
  const srcOf = (n) => {
    /* window.IntMapLang.pick(…) / IntMapLang.pickArgs() / …_ui / IntMapWorld._ui */
    let s = '', cur = n;
    for (let i = 0; i < 8 && cur; i++) {
      if (cur.type === 'CallExpression') { cur = cur.callee; continue; }
      if (cur.type === 'LogicalExpression') { cur = cur.right; continue; }
      if (cur.type === 'MemberExpression') { s = '.' + (cur.property.name || cur.property.value) + s; cur = cur.object; continue; }
      if (cur.type === 'Identifier') { s = cur.name + s; }
      break;
    }
    return s;
  };
  walk.simple(ast, {
    VariableDeclarator(d) {
      if (!d.init) return;
      const s = srcOf(d.init);
      if (d.id.type === 'Identifier') {
        if (/IntMapLang\.(pick|pickArgs|t)$/.test(s)) names.add(d.id.name);
        if (/IntMapWorld\._ui$/.test(s)) uiHolders.add(d.id.name);
        if ((d.init.type === 'ArrowFunctionExpression' || d.init.type === 'FunctionExpression')
          && src.slice(d.init.start, d.init.end).includes('IntMapLang')) names.add(d.id.name);
      } else if (d.id.type === 'ObjectPattern' && d.init.type === 'Identifier' && uiHolders.has(d.init.name)) {
        for (const p of d.id.properties) {
          const v = p.value && p.value.type === 'Identifier' ? p.value : (p.key && p.key.type === 'Identifier' ? p.key : null);
          if (v) names.add(v.name);
        }
      }
    },
    FunctionDeclaration(d) {
      if (d.id && src.slice(d.start, d.end).includes('IntMapLang')) names.add(d.id.name);
    },
  });
  return names;
}

const hits = [];
const exempt = [];                 /* counted, printed, never gated */
const badMarkers = [];             /* a marker on something that is not entity data — an ERROR */
for (const [full, rel] of files) {
  if (SKIP.test(rel)) continue;
  const src = readFileSync(full, 'utf8');
  let ast, comments = [];
  const opts = () => ({ ecmaVersion: 2022, locations: true, onComment: comments });
  try { comments = []; ast = parse(src, { ...opts(), sourceType: 'script', onComment: comments }); }
  catch (e) {
    try { comments = []; ast = parse(src, { ...opts(), sourceType: 'module', onComment: comments }); }
    catch (e2) { continue; }
  }
  /* ── the marked ranges (see the ⚠⚠⚠ note above) ──────────────────────────────────────────────
     A marker applies to the NEXT declaration that starts after it. Collecting candidate nodes and
     taking the nearest one is what makes this independent of how the table is written (a `const`,
     an object property, a `return`). */
  const marks = comments.filter((c) => MARKER.test(c.value)).map((c) => c.end);
  const cand = [];
  if (marks.length) {
    walk.full(ast, (n) => {
      if (n.type === 'VariableDeclaration' || n.type === 'Property'
        || n.type === 'ExpressionStatement' || n.type === 'ReturnStatement') cand.push(n);
    });
    cand.sort((a, b) => a.start - b.start);
  }
  const ranges = [];
  for (const at of marks) {
    const owner = cand.find((n) => n.start >= at);
    if (!owner) { badMarkers.push({ file: rel, why: 'the marker is not followed by a declaration' }); continue; }
    if (!hasEntityKey(owner)) {
      badMarkers.push({ file: rel, line: owner.loc.start.line,
        why: 'marked @i18n-entity-data but the rows carry no coordinate / ISO code / ticker / domain — this is UI prose, translate it' });
      continue;
    }
    ranges.push([owner.start, owner.end]);
  }
  const marked = (n) => ranges.some(([s, e]) => n.start >= s && n.end <= e);
  const LANG = langNames(ast, src);
  const isLangCall = (c) => {
    if (c.type === 'Identifier') return LANG.has(c.name);
    if (c.type !== 'MemberExpression' || c.computed) return false;
    const p = c.property.name;
    if (p === 'arr' || p === 'apply' || p === 'call') return isLangCall(c.object) || c.object.type === 'MemberExpression';
    /* window.IntMapLang.t(…) and friends */
    let cur = c.object, s = p;
    for (let i = 0; i < 6 && cur; i++) {
      if (cur.type === 'MemberExpression' && !cur.computed) { s = cur.property.name + '.' + s; cur = cur.object; continue; }
      if (cur.type === 'Identifier') { s = cur.name + '.' + s; }
      break;
    }
    return /IntMapLang\.(t|pick|pickArgs|arr)$/.test(s);
  };
  const scan = (list, node, what, anc) => {
    for (let i = 0; i + 1 < list.length; i++) {
      const a = list[i], b = list[i + 1];
      if (!a || !b || a.type !== 'Literal' || b.type !== 'Literal') continue;
      if (typeof a.value !== 'string' || typeof b.value !== 'string') continue;
      const aJa = JA.test(a.value), bJa = JA.test(b.value);
      if (aJa === bJa) continue;
      const en = aJa ? b.value : a.value, ja = aJa ? a.value : b.value;
      if (!isProse(en)) continue;
      const rec = { file: rel, line: node.loc.start.line, what,
        text: (JSON.stringify(en) + ', ' + JSON.stringify(ja)).slice(0, 110) };
      /* ⚠⚠ (#R249) A MATCH-TERM LIST IS NOT UI, AND IT IS NOT ALWAYS SLOT 0. #R248 wrote this
         exemption for `_ORG_GZ` — `[[…terms…], lng, lat, nameEn, nameJp]` — and checked only
         `parent.elements[0] === n`. js/gazetteer.js puts the same list at slot 1
         (`['city', ['Naples','ナポリ','Napoli'], 14.27, 40.85, 'Naples', 'ナポリ']`), so 328 matcher
         lists in that one file were counted as UI text that somebody would have to translate —
         6 % of this instrument's whole number, and pointing at the file it most wanted to protect.
         The rule is the SHAPE, not the index: a nested array inside a row that carries coordinates
         is the row's list of spellings. */
      const parent = anc[anc.length - 2];
      const isMatcher = what === 'array' && parent && parent.type === 'ArrayExpression'
        && parent.elements.includes(node) && parent.elements.length >= 3
        && scanKeys(parent.elements);
      if (isMatcher) { exempt.push({ ...rec, why: 'match-term list' }); return; }
      if (marked(node)) { exempt.push({ ...rec, why: 'entity data (@i18n-entity-data)' }); return; }
      hits.push(rec);
      return;                       /* ⚠ ONE finding per container */
    }
  };
  walk.ancestor(ast, {
    ArrayExpression(n, _s, anc) { scan(n.elements, n, 'array', anc); },
    CallExpression(n, _s, anc) { if (!isLangCall(n.callee)) scan(n.arguments, n, 'call', anc); },
    NewExpression(n, _s, anc) { scan(n.arguments, n, 'call', anc); },
  });
}

const byFile = new Map();
for (const h of hits) byFile.set(h.file, (byFile.get(h.file) || 0) + 1);

const exemptByFile = new Map();
for (const h of exempt) exemptByFile.set(h.file, (exemptByFile.get(h.file) || 0) + 1);

if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify({
    total: hits.length,
    files: [...byFile.entries()].sort((a, b) => b[1] - a[1]).map(([f, n]) => ({ file: f, n })),
    hits: hits.slice(0, 400),
    /* (#R249) never gated, ALWAYS printed — an exemption nobody can see is an exemption nobody
       re-examines, which is how a matcher list became «2,031 strings to translate». */
    exempt: exempt.length,
    exemptFiles: [...exemptByFile.entries()].sort((a, b) => b[1] - a[1]).map(([f, n]) => ({ file: f, n })),
    badMarkers,
  }));
  process.exit(0);
}

console.log('\nIntMap · adjacent-pair audit — a translation tuple must be a CALL, not two data slots  (#R246)\n');
if (badMarkers.length) {
  console.log('  ✖ @i18n-entity-data used where it does not apply — these are UI prose and must be translated:');
  for (const b of badMarkers) console.log(`      ${b.file}${b.line ? ':' + b.line : ''}  ${b.why}`);
  console.log('');
}
if (exempt.length) {
  console.log(`  ${exempt.length} container(s) EXEMPT — proper-noun records and match-term lists (#R249):`);
  for (const [f, n] of [...exemptByFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12))
    console.log(`      ${String(n).padStart(4)}  ${f}`);
  console.log('    These are labels OF ENTITIES (a place, an organisation, a company, a station) or the\n'
    + '    spellings a matcher compares against — not text the application wrote. The exemption is\n'
    + '    DECLARED in the source (`@i18n-entity-data`) and validated here against the row carrying a\n'
    + '    coordinate / ISO code / ticker / domain, so it cannot be used to silence prose.\n');
}
if (!hits.length) {
  console.log('  ✓ no translation tuple is held as adjacent data slots.\n');
  process.exit(0);
}
if (process.argv.includes('--list')) {
  for (const h of hits) console.log(`  ${h.file}:${h.line}  [${h.what}]  ${h.text}`);
  console.log('');
}
for (const [f, n] of [...byFile.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${f}`);
console.log(`\n  ${hits.length} container(s) in ${byFile.size} file(s). Write the tuple as a call instead:`);
console.log('      const LA = window.IntMapLang.pickArgs();     // once per scope');
console.log("      nm: LA('Tokyo','東京','Tokio','Токио','Tokio')");
console.log('      …and resolve it with L.arr(x.nm), which is pick() itself, so fr/ko/zh reach the inline table.\n');
process.exit(1);
