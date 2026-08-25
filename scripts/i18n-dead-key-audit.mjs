#!/usr/bin/env node
/* ============================================================================
 *  IntMap · ⚠⚠⚠ THE EIGHTEENTH SURFACE — «CAN ANYTHING ASK FOR THIS ROW?»   (#R450)
 * ----------------------------------------------------------------------------
 *  Every surface in scripts/i18n-audit.mjs asks one question from a different angle: DOES THIS
 *  LANGUAGE HAVE A ROW for something the app says. Seventeen of them, and every one counts
 *  `want ∩ have` — so a row in `have` that is in no `want` is invisible to all seventeen by
 *  construction. It is not short, not missing, not identical to its key. Nothing looks at it.
 *
 *  MEASURED THE FIRST TIME THIS RAN: 413 keys the app cannot ask for — 340 English strings across
 *  the four `inline` tables and 73 names in the `ui` tables of all nine, 1,959 rows in all. Nothing
 *  could render any of them, nothing could fail, and no gate could see them.
 *
 *  ⚠ TWO OF THEM ARE THE SAME LABEL, ORPHANED TWICE. The volcano legend has been renamed
 *  «Volcanoes (GVP Holocene, all 1,215)» → «Volcanoes (GVP Holocene)» (#R353) →
 *  «Volcanoes (Smithsonian GVP)» (#R432), and each rename left the previous spelling behind in
 *  fr / ko / zh-Hant / zh-Hans — the first carrying a catalogue count upstream had already revised.
 *  The SECOND one landed on main while this file was being written, which is the whole argument for
 *  a gate rather than a one-off deletion: the shape recurs on its own, at about one round apart.
 *
 *  ══ ⚠⚠⚠ WHY THIS DOES NOT ASK shapeOf() ═══════════════════════════════════════════════════════
 *  The obvious implementation is `dead = have − want`, with `want` the universe
 *  scripts/i18n-report.mjs already builds through scripts/i18n-helpers.mjs. It is wrong here, and
 *  wrong in the one direction there is no recovering from.
 *
 *  `want` is the set of call sites the helper resolution can PROVE, and it has holes. js/map-
 *  readout.js writes `const L=(...a)=>{ if(!_L) _L=window.IntMapLang.pick(()=>HOST.lang); return
 *  _L(...a); }` — a lazy wrapper `bindsHelper()` does not recognise — so `strictNames()` treats `L`
 *  as shadowed and all ten of that file's translation calls are invisible to every instrument in
 *  the family. For the seventeen coverage surfaces a hole is an UNDERCOUNT: a string nobody was
 *  asked to translate. Here it would mean «Tropic of Cancer», «Wind from the {d} …» and eight more
 *  LIVE rows reported dead and deleted — the blind spot converted into a regression.
 *
 *  ⚠ SO THE QUESTION ASKED HERE IS WEAKER, AND SOUND: is this key written ANYWHERE in what ships?
 *  js/lang-registry.js reads the inline table in exactly two places — `pick()` at argument 0 and
 *  `t()` at argument 1 — and it subscripts with that argument VERBATIM: no trim, no normalisation,
 *  no prefix, no plural rule. `fn.arr(tuple)` is `pick()` applied, so it is the same subscript. The
 *  keyed table is read the same way, by its key name, including from the `data-i18n*` attributes.
 *  So a key that appears nowhere in js/ (locales excluded), src/, the HTML documents or the small
 *  data manifests cannot be that subscript — however the helper was spelled, whoever bound it, and
 *  whatever no parser in this repository can read.
 *
 *  ⚠⚠ AND «APPEARS» MEANS BOTH SPELLINGS. A key is the string a literal DENOTES; the file holds the
 *  way it is WRITTEN. `L('Don\'t show this again', …)` denotes «Don't show this again» and contains
 *  «Don\'t show this again», so a raw substring search for the first finds nothing and calls a live
 *  row dead — measured, 23 of them, one escape apart from being deleted. The corpus is therefore
 *  the raw text UNION every string literal's VALUE from every shipped file that parses. Taking
 *  every literal needs no theory of which calls are translation calls (the thing this instrument
 *  must not assume), and a file that will not parse still contributes its raw text, so the union is
 *  never narrower than either half. `scripts/` and `tests/` are NOT in it: a string that lives only
 *  in a translation staging file or a test fixture is not something the app can say.
 *
 *  ══ ⚠⚠ THE ONE WAY A KEY CAN BE REACHED WITHOUT BEING WRITTEN: ASSEMBLY ═════════════════════════
 *  107 translation call sites pass a CONCATENATION — `'transfer'+(tf===1?'':'s')`, `mins+' min'`.
 *  The string that arrives at `pick()` was never written down, so no corpus can contain it, and a
 *  row matching one would be deleted while being perfectly reachable. Every such site becomes the
 *  PATTERN of the strings it can produce (its literal parts, in order, `.*` between them), and a
 *  key any pattern matches is HELD BACK — reported as reachable-by-assembly rather than deleted.
 *  That is the difference between a check that is sound and one that is merely usually right.
 *
 *      node scripts/i18n-dead-key-audit.mjs           # the counts
 *      node scripts/i18n-dead-key-audit.mjs --list    # …and every key, with the tables it is in
 *      node scripts/i18n-dead-key-audit.mjs --json    # for scripts/i18n-audit.mjs
 *      node scripts/i18n-dead-key-codemod.mjs --write   # …and delete every one of them, on both sides
 * ==========================================================================*/
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';
import { parseAll, context, shapeOf } from './i18n-helpers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = join(ROOT, 'js');
const LOCALES = join(JS, 'locales');

export const codes = () => JSON.parse(/window\.IntMapLangCodes\s*=\s*(\[[^\]]*\])/
  .exec(readFileSync(join(LOCALES, '_langs.js'), 'utf8'))[1]);

/* ── ① what a locale file declares, per table, with the line it is on ───────────────────────── */
export function tableOf(code, name) {
  const p = join(LOCALES, `ui.${code}.js`);
  const out = [];
  if (!existsSync(p)) return out;
  const ast = parse(readFileSync(p, 'utf8'), { ecmaVersion: 2022, locations: true });
  walk.simple(ast, {
    Property(n) {
      if (!(n.key && (n.key.name === name || n.key.value === name)
        && n.value && n.value.type === 'ObjectExpression')) return;
      for (const pr of n.value.properties) {
        if (pr.type !== 'Property') continue;
        out.push({ key: pr.key.value != null ? pr.key.value : pr.key.name, line: pr.loc.start.line });
      }
    },
  });
  return out;
}

/* ── ② everything that ships, as text ─────────────────────────────────────────────────────────
   Cached like scripts/i18n-helpers.mjs `parseAll()`: the corpus is ~300 files and the parse half
   is 52,000 strings, and tests/r450-checks.test.mjs asks six questions of it in one process. */
let _text = null;
export function shippedText() {
  if (_text) return _text;
  const kept = [];
  const add = (p, name) => kept.push([name || relative(ROOT, p).split(sep).join('/'), readFileSync(p, 'utf8')]);
  (function dir(d) {
    for (const n of readdirSync(d)) {
      if (n === 'node_modules' || n === '.git' || n === 'dist' || n === '.perf' || n === 'locales') continue;
      const p = join(d, n);
      if (statSync(p).isDirectory()) { dir(p); continue; }
      if (/\.(js|mjs)$/.test(n)) add(p);
    }
  })(JS);
  for (const n of readdirSync(join(ROOT, 'src'))) if (/\.(js|mjs)$/.test(n)) add(join(ROOT, 'src', n));
  for (const n of readdirSync(ROOT)) if (/\.(html|js)$/.test(n)) add(join(ROOT, n), n);
  /* the small manifests under data/ carry reader-facing labels the JavaScript then translates; the
     geometry payloads carry no UI prose, and reading 55 MB of them to prove that is not free */
  const D = join(ROOT, 'data');
  if (existsSync(D)) for (const n of readdirSync(D)) {
    const p = join(D, n);
    if (!/\.(json|js)$/.test(n) || !statSync(p).isFile() || statSync(p).size > 4 * 1024 * 1024) continue;
    add(p);
  }
  _text = kept;
  return kept;
}

/* every string those files' literals DENOTE — the other half of the corpus (see ② above) */
let _lits = null;
export function shippedLiterals(corpus) {
  if (_lits) return _lits;
  const out = new Set();
  const take = (v) => { if (typeof v === 'string' && v.length) out.add(v); };
  for (const [name, src] of corpus) {
    if (!/\.(js|mjs)$/.test(name)) continue;
    let ast;
    try { ast = parse(src, { ecmaVersion: 2022, sourceType: 'module' }); }
    catch { try { ast = parse(src, { ecmaVersion: 2022, sourceType: 'script' }); } catch { continue; } }
    walk.simple(ast, {
      Literal(n) { take(n.value); },
      TemplateLiteral(n) { for (const q of n.quasis) take(q.value.cooked); },
    });
  }
  _lits = out;
  return out;
}

/* ── ③ ⚠ the keys that are ASSEMBLED rather than written ─────────────────────────────────────── */
/* The literal parts of a `+` chain, in source order, with everything else standing for «anything».
   A ternary between two literals contributes neither — both arms are possible — which is why the
   gap is `.*` rather than the arms enumerated: over-matching holds a row back, and holding a live
   row back costs a line in a report where deleting one costs a translation. */
let _pats = null;
function assemblyPatterns() {
  if (_pats) return _pats;
  const pats = [];
  const flatten = (n, out) => {
    if (n.type === 'BinaryExpression' && n.operator === '+') { flatten(n.left, out); flatten(n.right, out); return out; }
    out.push(n);
    return out;
  };
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const consider = (a, where) => {
    if (!a || a.type !== 'BinaryExpression' || a.operator !== '+') return;
    let re = '', constant = 0;
    for (const p of flatten(a, [])) {
      const s = (p.type === 'Literal' && typeof p.value === 'string') ? p.value
        : (p.type === 'TemplateLiteral' && p.quasis.length === 1) ? p.quasis[0].value.cooked : null;
      if (s == null) { re += '[\\s\\S]*'; continue; }
      re += esc(s); constant += s.length;
    }
    /* ⚠ A CHAIN WITH NO CONSTANT PART WOULD MATCH EVERY KEY AND HOLD THE WHOLE TABLE BACK — the
       gate would go green while asserting nothing (#R399). `x + y` is not a pattern, it is a
       wildcard, and it is dropped here rather than allowed to swallow the measurement. */
    if (constant < 2) return;
    pats.push({ re: new RegExp('^' + re + '$'), where });
  };
  for (const f of parseAll().keys()) {
    const ctx = context(f, 'strict');
    walk.simple(ctx.ast, {
      CallExpression(n) {
        const i = shapeOf(n, ctx); if (i < 0) return;
        consider(n.arguments[i], `js/${f}:${n.loc.start.line}`);
      },
    });
  }
  _pats = pats;
  return pats;
}

/* ── ④ the blind spot this instrument still has, as a number ────────────────────────────────── */
function dynamicArgs() {
  let n = 0;
  for (const f of parseAll().keys()) {
    const ctx = context(f, 'strict');
    walk.simple(ctx.ast, {
      CallExpression(node) {
        const i = shapeOf(node, ctx); if (i < 0) return;
        const a = node.arguments[i];
        if (!a || a.type !== 'Literal' || typeof a.value !== 'string') n++;
      },
    });
  }
  return n;
}

/* ⚠ THE VERDICT IS ITS OWN FUNCTION so a test can put a string in front of it. An instrument whose
   only entry point is «run it over the repository» can be asserted to say zero and never asserted
   to be capable of saying anything else, which is the same green as a check that cannot fire
   ([[intmap-r399-lessons]]). tests/r450-checks.test.mjs hands it a nonce, a string that is live
   ONLY through the lazy wrapper shapeOf() cannot see, and one an assembled argument can reach. */
export function classifier() {
  const corpus = shippedText();
  const literals = shippedLiterals(corpus);
  const pats = assemblyPatterns();
  const seen = new Map();                    /* key -> 'live' | 'assembled' | 'dead' */
  const assembledBy = new Map();             /* key -> the site that can produce it */
  const verdict = (k) => {
    if (seen.has(k)) return seen.get(k);
    let v = 'live';
    if (!literals.has(k) && !corpus.some(([, s]) => s.indexOf(k) >= 0)) {
      const p = pats.find((x) => x.re.test(k));
      if (p) { v = 'assembled'; assembledBy.set(k, p.where); } else v = 'dead';
    }
    seen.set(k, v);
    return v;
  };
  return { verdict, assembledBy, corpus, literals, pats };
}

export function audit() {
  const { verdict, assembledBy, corpus, literals, pats } = classifier();

  const rows = [], held = [], per = [];
  for (const c of codes()) {
    for (const table of ['ui', 'inline']) {
      const decl = tableOf(c, table);
      if (!decl.length) continue;
      let dead = 0, hold = 0;
      for (const d of decl) {
        const v = verdict(d.key);
        if (v === 'dead') { dead++; rows.push({ code: c, table, key: d.key, line: d.line }); }
        else if (v === 'assembled') { hold++; held.push({ code: c, table, key: d.key, where: assembledBy.get(d.key) }); }
      }
      per.push({ code: c, table, total: decl.length, dead, held: hold });
    }
  }

  /* ══ ⚠⚠⚠ …AND A DELETED ROW HAS TO BE UNABLE TO WALK BACK IN ══════════════════════════════════
     scripts/i18n-apply-inline.mjs merges every scripts/i18n/r*.json and hands the union to
     scripts/i18n-append-inline.mjs, which inserts EVERY key the locale does not already have — no
     filter, deliberately (its header records why a rebuild is lossy and a top-up is not). So a key
     deleted from a locale but left in a staging file is one manual command from being back, and
     the gate would then go red for a reason no diff shows. The staging files are asked the same
     question as the tables they feed.
     ⚠⚠ THERE ARE TWO STAGING DIRECTORIES, AND THE FIRST DRAFT OF THIS ONLY KNEW ABOUT ONE.
     scripts/zh/*.json is the authored Traditional translation that scripts/build-ui-zh.mjs merges
     back into js/locales/ui.zh.js, and tests/r223 ⑩ asserts that it is the REBUILDABLE source of
     that file. It keys the inline table by the English string like the others and the keyed table
     by «ui:<name>», so a dead `ui:` row is invisible to a scan that only strips nothing. Leaving
     it out would have made this gate true of one half of the resurrection paths. */
  const staging = [];
  for (const [dir, strip] of [['i18n', (k) => k], ['zh', (k) => k.replace(/^ui:/, '')]]) {
    const SD = join(ROOT, 'scripts', dir);
    if (!existsSync(SD)) continue;
    for (const f of readdirSync(SD).filter((n) => n.endsWith('.json')).sort()) {
      let obj; try { obj = JSON.parse(readFileSync(join(SD, f), 'utf8')); } catch { continue; }
      for (const k of Object.keys(obj)) {
        if (k === '_') continue;
        if (verdict(strip(k)) === 'dead') staging.push({ file: `scripts/${dir}/${f}`, key: k });
      }
    }
  }

  return {
    per, rows, staging, held,
    keys: [...new Set(rows.map((r) => r.key))].sort(),
    heldKeys: [...new Set(held.map((r) => r.key))].sort(),
    corpus: corpus.length, literals: literals.size, patterns: pats.length, dynamic: dynamicArgs(),
  };
}

if (process.argv[1] && process.argv[1].endsWith('i18n-dead-key-audit.mjs')) {
  const r = audit();
  if (process.argv.includes('--json')) { console.log(JSON.stringify(r)); process.exit(0); }
  console.log('IntMap · rows nothing can ask for — the eighteenth surface  (#R450)\n');
  console.log(`corpus: ${r.corpus} shipped file(s) — js/ (locales excluded), src/, *.html, the small data manifests`);
  console.log(`        …and the ${r.literals} distinct strings their literals denote, so an escape is not a death sentence`);
  console.log(`translation arguments that are not literals: ${r.dynamic}`);
  console.log(`…of which ${r.patterns} assemble a key out of constant parts; keys held back for one: ${r.heldKeys.length}\n`);
  console.log('lang       table     rows   unreachable   held');
  for (const p of r.per) {
    console.log(`${p.code.padEnd(10)} ${p.table.padEnd(8)} ${String(p.total).padStart(5)}   ${String(p.dead).padStart(11)}   ${String(p.held).padStart(4)}`);
  }
  console.log(`\ndistinct unreachable keys: ${r.keys.length}`);
  console.log(`unreachable rows still in the staging files that would put them back: ${r.staging.length}`);
  if (process.argv.includes('--list')) {
    for (const k of r.keys) console.log(`    ${JSON.stringify(k)}`);
    for (const s of r.staging) console.log(`    ${s.file}  ${JSON.stringify(s.key)}`);
    if (r.held.length) {
      console.log('\nheld back — an assembled key can reach these:');
      for (const h of r.held) console.log(`    ${JSON.stringify(h.key)}  ← ${h.where}`);
    }
  } else console.log('    (--list prints every one)');
}
