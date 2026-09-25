#!/usr/bin/env node
/* ============================================================================
 *  data-governance.mjs — THE GENERAL RULE, AS CODE THIS TIME  (#729)
 * ----------------------------------------------------------------------------
 *  scripts/build-cshapes.mjs:372 states, in prose:
 *
 *      「The general rule — every shipped data bundle's `src` names its licence — is
 *        scripts/doc-facts.mjs's `bundle-licence`, whose universe is discovered from data/.」
 *
 *  ⚠⚠⚠ THAT RULE DID NOT EXIST. Measured before this file: `bundle-licen` occurs in exactly one
 *  tracked place, and that place is the sentence above; doc-facts.mjs has no rule by that id. So
 *  the repository's only statement of its cross-cutting data rule was a pointer at an
 *  implementation nobody wrote — [[intmap-refusal-that-becomes-implementation]] — and the cost was
 *  measurable: of the bundles under data/, fewer than half named a licence, and the checks that
 *  did ask asked with `/CC0/.test(d.src)` (a regular expression over a SENTENCE) in six builders,
 *  plus a hand-copied `const DATA_SOURCES=\[…\]` regex in TWO of them
 *  (build-cshapes.mjs:475, build-hist-cities.mjs:194). Nine rules on nine functions; zero on the
 *  fact (.agents/rules/no-ad-hoc-hardcoding.md §3).
 *
 *  ══ WHAT THIS GATE MEASURES ═══════════════════════════════════════════════════════════════════
 *    gov-declared       every script that WRITES into data/ states its bundle's provenance as a
 *                       VALUE (`export const GOVERNANCE`), readable by js/data-governance.js.
 *    bundle-licence     the rule the comment promised: a record whose terms make credit a
 *                       CONDITION of redistribution names the DATA_SOURCES row that pays it, and
 *                       the name is compared as a VALUE against the real array (never «説明で照合」,
 *                       the judgement scripts/histcities/lang.mjs's LIC() already states).
 *    freshness-stated   a record states its CADENCE. ⚠ BEING OLD IS NEVER A FAILURE HERE — only
 *                       being silent is (.agents/rules/no-ad-hoc-hardcoding.md §4: a threshold
 *                       with no author must not delete or refuse data).
 *    update-failure     a builder that fetches cannot let a response it never checked reach the
 *                       bytes it writes.
 *    ledger-shrinks     everything already violating the four above is written down in
 *                       data/governance-ledger.json, and that file may only get SMALLER.
 *    facets-accounted   every FACET of every subject is stated, undeclared-with-a-reason, or
 *                       not-applicable-with-a-reason. Never an absent key — that is the whole of
 *                       「何を知らないかを知っている」 ([[intmap-data-must-not-claim-an-author-it-lacks]]).
 *
 *  ⚠ THE UNIVERSE IS DISCOVERED, NEVER LISTED. Both universes come from `git ls-files`: the
 *  bundles from data/ (plus the sets data-assets.json places there from outside git — see
 *  shipped()), the builders from 「does this script write into data/」 — asked of the
 *  bytes, not of the name, because `build-*` is a naming habit and a habit drops the next file
 *  silently ([[intmap-discovered-list-is-a-photograph]]).
 *
 *  ⚠ NO BUILDER IS EXECUTED. Most of them run their work at module top level, so importing one to
 *  read its declaration would fetch the internet from inside a gate. The declaration is sliced out
 *  of the source and evaluated ALONE; a declaration written so that it cannot be sliced is
 *  reported as 「読めなかった」 and never merged into 「宣言が無い」 (js/data-governance.js's REASONS
 *  exists for exactly that distinction).
 *
 *  Run:
 *    node scripts/data-governance.mjs --check          the gate (npm run check:datagov)
 *    node scripts/data-governance.mjs --report         every subject, every silent facet
 *    node scripts/data-governance.mjs --rule=<id>      one rule only
 *    node scripts/data-governance.mjs --update         re-record data/governance-ledger.json
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SPELLINGS, FACETS, SUBJECTS, REASONS, read, freshness, account } from '../js/data-governance.js';
import { readManifest, requireData, filesUnder } from './data-assets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const has = (k) => process.argv.includes(k);
const only = (() => { const a = process.argv.find((x) => x.startsWith('--rule=')); return a ? a.slice(7) : null; })();

/* The gate's own receipt. ⚠ IT IS THE ONE PATH UNDER data/ THAT IS NOT A SUBJECT OF THE GATE:
   it ships nothing and states nothing about the world, it states what THIS GATE has not yet made
   true. Counting it as a bundle would make the ledger of unmet obligations one of them.
   OBSERVATION: written by this round; nothing else reads or writes it.
   EXPIRES: if anything else ever writes this file, the exclusion is wrong and it must earn a
   declaration like every other bundle.
   CANON: this constant. */
const LEDGER = 'data/governance-ledger.json';

/* How much of a text bundle's head is read when looking for an in-band record.
   OBSERVATION: the records that exist today sit in the first object members of the file
   (data/cshapes.js states `src` at byte 24; data/hist-cities.json states `src` and `rights` at
   byte 9), and the member after them is a coordinate array of many megabytes.
   EXPIRES: if a builder writes its governance record AFTER its payload, this window will read the
   payload instead and report 「読めなかった」 — which is the correct report, not a false pass.
   CANON: this constant, used by bundleRecord() alone. */
const HEAD_BYTES = 1 << 20;

/* The spellings a shard directory's index goes by. ⚠ A VOCABULARY, IN THE SENSE
   js/data-governance.js's SPELLINGS is one — not a list of directories. data/border-detail/ holds
   5,621 tracked files and data/railways/ 1,123; they are ONE dataset each, and the file that says
   so is the only place a declaration can live for all of them.
   OBSERVATION: measured today, the four directories that have an index spell it `index.json`
   (border-detail, railways, companies, elections) or `catalogue.json` (tle).
   EXPIRES: if a new shard directory spells its index a fifth way, this gate will report that
   directory as having none — loudly, with its file count, which is the report to act on.
   CANON: this constant. */
const INDEX_NAMES = ['index', 'manifest', 'catalogue', 'catalog'];

/* ── the two universes, discovered ─────────────────────────────────────────────────────────── */

const tracked = (sub) => execFileSync('git', ['ls-files', '-z', sub], { cwd: ROOT, maxBuffer: 1 << 28 })
  .toString('utf8').split('\0').filter(Boolean);

/* ⚠⚠ (#729) `git ls-files` IS NO LONGER ALL OF WHAT data/ SHIPS. data-assets.json names the sets
   that live OUTSIDE git (today data/border-detail/ and data/hist-eras.js — placed by
   `npm run data:pull` and carried into dist/ like any other bundle). Asked of git alone, those sets
   stopped being subjects the day they left it, and this gate then reported their ledger rows as
   「now stating their provenance」 — a bundle nobody asked, reported as a bundle that answered.
   So the universe is the tracked files PLUS every set the manifest names; the manifest is the one
   statement of what those sets are, and the sets are discovered from it, not listed here.
   A set that is not placed in this checkout is not skipped: requireData() throws the sentence that
   names it and `npm run data:pull` — the same red every other gate that reads those sets turns.
   ⚠ It does not re-hash the content (verify: false): whether the bytes are the manifest's is
   `data-assets.mjs verify`'s question, asked first in `npm test`; this gate asks only which files
   the dataset has. */
function shipped() {
  const out = tracked('data');
  const m = readManifest(ROOT);
  if (!m) return out;
  const seen = new Set(out);
  for (const set of Object.values(m.sets)) {
    requireData(ROOT, set.path, { verify: false });
    const files = set.kind === 'dir'
      ? filesUnder(path.join(ROOT, ...set.path.split('/'))).map((r) => set.path + '/' + r)
      : [set.path];
    for (const p of files) if (!seen.has(p)) { seen.add(p); out.push(p); }
  }
  return out;
}

/* ⚠ A BUNDLE IS A DATASET, NOT A FILE. `vs30.png` + `vs30.json` are one thing measured once, and
   `whc-detail.en.json.gz` … `whc-detail.zh-Hans.json.gz` are six encodings of one thing: the
   extensions after the first dot are how a dataset is SHIPPED, not what it is. So the subject is
   the stem, and its members are listed beside it so a reader can see what was grouped. */
function bundles() {
  const files = shipped().filter((f) => f !== LEDGER);
  const byStem = new Map();
  const byDir = new Map();
  for (const f of files) {
    const rel = f.slice('data/'.length);
    const slash = rel.indexOf('/');
    if (slash < 0) {
      const stem = rel.slice(0, rel.indexOf('.') < 0 ? rel.length : rel.indexOf('.'));
      if (!byStem.has(stem)) byStem.set(stem, []);
      byStem.get(stem).push(f);
    } else {
      const d = rel.slice(0, slash);
      if (!byDir.has(d)) byDir.set(d, []);
      byDir.get(d).push(f);
    }
  }
  const out = [];
  for (const [stem, members] of [...byStem].sort((a, b) => a[0] < b[0] ? -1 : 1)) {
    out.push({ subject: 'data/' + stem, kind: 'file', members });
  }
  for (const [d, members] of [...byDir].sort((a, b) => a[0] < b[0] ? -1 : 1)) {
    const idx = members.find((m) => INDEX_NAMES.includes(path.basename(m).split('.')[0]));
    out.push({ subject: 'data/' + d + '/', kind: 'shard', members, index: idx || null, shards: members.length });
  }
  return out;
}

/* ── reading source without running it ─────────────────────────────────────────────────────── */

/* ⚠⚠⚠ COMMENTS ARE BLANKED BEFORE ANY BRACKET IS COUNTED, AND THE LENGTH IS PRESERVED.
   Two reasons, both measured on this repository's own source:
     ① AN APOSTROPHE IN A COMMENT LOOKS LIKE A STRING. `/* … this file's header says so … *​/`
        inside a GOVERNANCE literal made the scanner read from that `'` to the next one, jump over
        the closing braces, and report 「the object literal never closes」 — a declaration that
        exists, reported as unreadable, for a possessive.
     ② A COMMENT THAT MENTIONS `.ok` IS NOT A CHECK. update-failure asks whether a file ever tests
        a response's status; prose about status would answer yes.
   Length and newlines are preserved so that every index and every line number computed from the
   blanked text still points at the real file — a report a reader cannot navigate to is the defect
   scripts/hist-fidelity.mjs's file:line convention exists to avoid. */
function blankComments(s) {
  const out = s.split('');
  let i = 0;
  const wipe = (from, to) => { for (let k = from; k < to && k < out.length; k++) if (out[k] !== '\n') out[k] = ' '; };
  while (i < s.length) {
    const c = s[i];
    if (c === '"' || c === "'" || c === '`') { const j = endOfString(s, i); if (j < 0) break; i = j + 1; continue; }
    if (c === '/' && s[i + 1] === '*') { const j = s.indexOf('*/', i + 2); const end = j < 0 ? s.length : j + 2; wipe(i, end); i = end; continue; }
    if (c === '/' && s[i + 1] === '/') { const j = s.indexOf('\n', i); const end = j < 0 ? s.length : j; wipe(i, end); i = end; continue; }
    i++;
  }
  return out.join('');
}

function endOfString(s, i) {
  const q = s[i];
  for (let k = i + 1; k < s.length; k++) {
    if (s[k] === '\\') { k++; continue; }
    if (s[k] === q) return k;
  }
  return -1;
}

/* The value of the string literal that opens at `i` and closes at `j` (endOfString's answer).
   ⚠ THE BODY IS ALREADY ESCAPED, SO IT IS NOT ESCAPED AGAIN. A double-quoted literal is a JSON
   string as it stands; re-escaping its quotes turned `"a\"b"` into `a\\"b`, which JSON refuses, and
   the raw fallback then kept the backslash as data (CodeQL js/incomplete-sanitization). A
   single-quoted literal (the `window.__X={…}` bundles are JavaScript) differs from JSON in exactly
   two ways: `\'` is its escape for the delimiter, and a bare `"` is legal inside it. Everything else
   travels as written, and a body JSON still cannot read is returned unstated — null — rather than
   as a string with its escapes left in. */
function stringLiteral(s, i, j) {
  if (s[i] === '"') { try { return JSON.parse(s.slice(i, j + 1)); } catch { return null; } }
  let body = '';
  for (let k = i + 1; k < j; k++) {
    if (s[k] === '\\' && s[k + 1] === "'") { body += "'"; k++; continue; }
    if (s[k] === '\\') { body += s[k] + (s[k + 1] ?? ''); k++; continue; }
    body += s[k] === '"' ? '\\"' : s[k];
  }
  try { return JSON.parse('"' + body + '"'); } catch { return null; }
}

/* The index of the bracket that closes the one at `i`, or -1 when it never closes inside `s`.
   ⚠ -1 IS «I COULD NOT READ IT» AND IS REPORTED AS SUCH. The precedent is
   scripts/shared-roster.mjs's `attached()`: an unclosed group that returns null leaves as 「問題なし」,
   and the number of omissions tolerated silently becomes the length of the text. */
function matchBracket(s, i) {
  const open = s[i], close = open === '{' ? '}' : open === '[' ? ']' : open === '(' ? ')' : null;
  if (!close) return -1;
  let depth = 0;
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (c === '"' || c === "'" || c === '`') { const j = endOfString(s, k); if (j < 0) return -1; k = j; continue; }
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') { depth--; if (depth === 0) return c === close ? k : -1; }
  }
  return -1;
}

/* ── rule: DATA_SOURCES, read ONCE, HERE ───────────────────────────────────────────────────────
   ⚠⚠⚠ THIS IS THE THIRD COPY OF THIS REGEX AND IT IS MEANT TO BE THE LAST. build-cshapes.mjs:475
   and build-hist-cities.mjs:194 each carry `const DATA_SOURCES=\[[\s\S]*?\n  \];` and then ask
   `arr[0].includes(name)` — a substring test against the whole literal, which passes when the name
   appears in a COMMENT inside the array. Reading the rows as rows is both stricter and the only
   version that can be called from somewhere else. Those two call sites should be replaced by
   `dataSourceRows()`; that edit belongs to whoever owns those builders. */
export function dataSourceRows(root) {
  const file = path.join(root || ROOT, 'js', 'reference-data.js');
  /* blanked first, whole-file: the array's own comments contain apostrophes and `//` inside URLs */
  const src = blankComments(fs.readFileSync(file, 'utf8'));
  const at = /const\s+DATA_SOURCES\s*=\s*\[/.exec(src);
  if (!at) return { rows: null, why: 'js/reference-data.js no longer holds DATA_SOURCES as one array literal' };
  const open = at.index + at[0].length - 1;
  const close = matchBracket(src, open);
  if (close < 0) return { rows: null, why: 'the DATA_SOURCES array literal in js/reference-data.js never closes' };
  const body = src.slice(open, close + 1);
  const rows = [];
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== '{') continue;
    const end = matchBracket(body, i);
    if (end < 0) return { rows: null, why: 'a DATA_SOURCES row in js/reference-data.js never closes' };
    const entry = body.slice(i, end + 1);
    const pick = (key) => {
      const m = new RegExp('(?:^|[{,\\s])' + key + '\\s*:\\s*(\'(?:[^\'\\\\]|\\\\.)*\'|"(?:[^"\\\\]|\\\\.)*")').exec(entry);
      if (!m) return null;
      const q = m[1];
      return q.slice(1, -1).replace(/\\(.)/g, '$1');
    };
    rows.push({ n: pick('n'), u: pick('u') });
    i = end;
  }
  return { rows, why: null };
}

/* ── rule: the builders, and what they declare ─────────────────────────────────────────────── */

const WRITE_CALL = /\b(writeFileSync|createWriteStream|appendFileSync|copyFileSync|cpSync|renameSync|writeFile)\s*\(/g;
/* a string literal that names a path under data/, OR a path.join/resolve whose parts include the
   directory itself — both spellings occur, and neither is a name to be listed */
const DATA_LITERAL = /['"`][^'"`\n]*\bdata\/[^'"`\n]*['"`]/;
/* ⚠ THE NESTED CALL IS THE COMMON SPELLING, NOT THE EXCEPTION:
   `path.join(process.cwd(), 'data', 'deep-sky.json')` is how most builders here name their output,
   so a pattern that forbids parentheses between `join(` and `'data'` misses them all. Measured: it
   missed 13 of the 53 writers when this gate was first run. */
const namesDataPath = (text) => DATA_LITERAL.test(text)
  || (/\b(?:join|resolve)\s*\(/.test(text) && /['"`]data['"`]\s*(?:,|\))/.test(text));

/* The first argument of a call whose '(' is at `i`, as source text. */
function firstArg(s, i) {
  const close = matchBracket(s, i);
  if (close < 0) return null;
  let depth = 0;
  for (let k = i; k < close; k++) {
    const c = s[k];
    if (c === '"' || c === "'" || c === '`') { const j = endOfString(s, k); if (j < 0) return null; k = j; continue; }
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') depth--;
    else if (c === ',' && depth === 1) return s.slice(i + 1, k);
  }
  return s.slice(i + 1, close);
}

const lineOf = (s, i) => s.slice(0, i).split('\n').length;

/* Every `const NAME = …` (to the end of its logical line) — enough to answer 「is this identifier
   a path under data/」 for the OUT-constant idiom every builder here uses
   (`const OUT = path.join(process.cwd(),'data','deep-sky.json')`). */
function declarations(src) {
  const m = new Map();
  for (const d of src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^\n]*)/g)) {
    if (!m.has(d[1])) m.set(d[1], d[2]);
  }
  return m;
}

/* Paths under data/ named in a fragment of source. Best effort, and used only to say WHICH bundle
   a builder is talking about — never to decide a pass or a failure, because a path assembled at
   runtime cannot be read from the bytes and must not be guessed at. */
function dataPathsIn(text) {
  const out = new Set();
  for (const m of text.matchAll(/['"`]([^'"`\n]*\bdata\/[^'"`\n]*)['"`]/g)) out.add('data/' + m[1].slice(m[1].indexOf('data/') + 5));
  for (const m of text.matchAll(/\b(?:join|resolve)\s*\(/g)) {
    const open = m.index + m[0].length - 1;
    const close = matchBracket(text, open);
    const args = text.slice(open + 1, close < 0 ? text.length : close);
    const parts = [...args.matchAll(/['"`]([^'"`\n]*)['"`]/g)].map((x) => x[1]);
    const at = parts.indexOf('data');
    if (at >= 0) out.add('data/' + parts.slice(at + 1).join('/'));
  }
  return [...out];
}

function builders() {
  const files = tracked('scripts').filter((f) => f.endsWith('.mjs'));
  const out = [];
  for (const rel of files) {
    /* every scan below reads the BLANKED text — comments are prose about the code, not the code */
    const src = blankComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    const decl = declarations(src);
    const writes = [];
    const unresolved = [];
    WRITE_CALL.lastIndex = 0;
    for (let m; (m = WRITE_CALL.exec(src));) {
      const at = m.index + m[0].length - 1;
      const arg = firstArg(src, at);
      if (arg == null) { unresolved.push({ line: lineOf(src, m.index), why: 'the call never closes' }); continue; }
      let text = arg;
      const ident = /^\s*([A-Za-z_$][\w$]*)\s*$/.exec(arg);
      if (ident && decl.has(ident[1])) text = decl.get(ident[1]);
      if (namesDataPath(text)) {
        writes.push({ line: lineOf(src, m.index), paths: dataPathsIn(text) });
      } else if (!/^\s*['"`]/.test(text) && !ident) {
        unresolved.push({ line: lineOf(src, m.index), why: 'the destination is computed: ' + arg.trim().slice(0, 60) });
      }
    }
    if (!writes.length) continue;
    /* ⚠ SOME BUILDERS ALREADY HOLD THEIR TERMS AS VALUES, UNDER A NAME NOTHING ELSE LOOKS FOR.
       #R689 put a `{source, licence, attribution}` record in build-cshapes.mjs and
       build-hist-cities.mjs and compared it against DATA_SOURCES right there, which is correct and
       reachable from one file: the next reader (this gate, Atlas, the reader-visible credit line)
       still has to re-derive the same fact from a sentence — #R575's lesson, 「reach できない算術は
       誰も測らない」.
       Measured: the records that exist go by another name — `export const LICENCE = LIC({…})`
       (build-cshapes.mjs:94) — and some are not exported at all. Both are reported, neither is
       credited as a declaration: this gate reads ONE name so that a reader looking for provenance
       has one place to look, and a record built by a call cannot be evaluated without running the
       file that calls it. Migrating those call sites onto GOVERNANCE is the next round's work. */
    const NAMES = '(LICENCE|LICENSE|LICENCES|LICENSES|RIGHTS|PROVENANCE)';
    const other = new RegExp('export\\s+const\\s+' + NAMES + '\\b').exec(src);
    const priv = new RegExp('(?:^|\\n)[ \\t]*(?:const|let)\\s+' + NAMES + '\\s*=').exec(src);
    const declaration = governanceOf(src, rel);
    out.push({ subject: rel, src, writes, unresolved,
      paths: [...new Set(writes.flatMap((w) => w.paths))],
      otherName: !declaration.present && other ? other[1] : null,
      privateValues: !declaration.present && !other && priv ? priv[1] : null,
      declaration });
  }
  return out;
}

/* ⚠ SLICED AND EVALUATED ALONE — THE BUILDER IS NEVER IMPORTED. `new Function` closes over no
   module scope, so a declaration that refers to a constant of its own file throws ReferenceError
   and is reported as `unreadable`. That is deliberate: a gate must be able to say 「宣言はあるが
   読めなかった」 without it becoming 「宣言が無い」 (js/data-governance.js's REASONS). */
function governanceOf(src, rel) {
  const at = /export\s+const\s+GOVERNANCE\s*=/.exec(src);
  if (!at) return { present: false, value: null, why: null };
  const expr = initializer(src, at.index + at[0].length);
  if (expr == null) return { present: true, value: null, why: 'the initialiser never ends in a `;`' };
  /* ⚠ THE INITIALISER IS NOT ALWAYS AN OBJECT LITERAL, AND NARROWING IT TO ONE REPORTED REAL
     DECLARATIONS AS UNREADABLE. Measured: two builders write
     `export const GOVERNANCE = (() => { const rec = {…}; return {'a': rec, 'b': rec}; })();`
     because two of their outputs share one provenance, and reading from the first `{` evaluates
     the arrow's BODY as an expression («Unexpected identifier 'rec'»). So the whole initialiser is
     taken, and what it is written as stays the author's business.
     ⚠ WHAT IT MAY REACH IS FENCED: `new Function` closes over no module scope, so the only names
     bound are the file's own LITERAL constants (below). Anything else throws ReferenceError and is
     reported as 「読めなかった」 — never as 「宣言が無い」. */
  const names = literalConsts(src);
  /* ⚠ AND ONE LEVEL OF `import` IS FOLLOWED, BECAUSE THE SHARED STAMP IS THE RIGHT PLACE FOR IT.
     Measured: build-culture.mjs states `url: SOURCE_STAMP.url`, and SOURCE_STAMP is imported from
     the module that actually fetched the mirror — one fact, stated where it is known, which is the
     shape this whole gate is arguing for. Reading only the builder's own file would call the best
     version of the pattern unreadable. Only the imported module's pure-data constants are taken,
     and its own imports are not followed: a gate that walks an import graph is a bundler. */
  for (const im of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    const spec = im[2];
    if (!spec.startsWith('.')) continue;
    const wanted = im[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop()).filter(Boolean);
    if (!wanted.some((w) => !names.keys.includes(w))) continue;
    const base = path.resolve(path.dirname(path.join(ROOT, rel)), spec);
    const file = [base, base + '.mjs', base + '.js', path.join(base, 'index.mjs')].find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
    if (!file) continue;
    const far = literalConsts(blankComments(fs.readFileSync(file, 'utf8')));
    far.keys.forEach((k, i) => { if (wanted.includes(k) && !names.keys.includes(k)) { names.keys.push(k); names.values.push(far.values[i]); } });
  }
  try {
    /* eslint-disable-next-line no-new-func */
    const v = new Function(...names.keys, '"use strict";return (' + expr + ');')(...names.values);
    if (!v || typeof v !== 'object') return { present: true, value: null, why: 'the initialiser did not evaluate to an object' };
    return { present: true, value: v, why: null };
  } catch (e) {
    return { present: true, value: null, why: 'it could not be evaluated apart from its builder: ' + String(e.message).slice(0, 80) };
  }
}

/* The initialiser expression: from after the `=` to the `;` that ends the statement, brackets and
   strings respected. Returns null when there is none inside the file. */
function initializer(src, from) {
  let depth = 0;
  for (let k = from; k < src.length; k++) {
    const c = src[k];
    if (c === '"' || c === "'" || c === '`') { const j = endOfString(src, k); if (j < 0) return null; k = j; continue; }
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') depth--;
    else if (c === ';' && depth === 0) return src.slice(from, k);
  }
  return null;
}

/* The file's own constants whose initialiser is PURE DATA, as values. ⚠ THIS IS WHAT MAKES THE
   BEST-WRITTEN DECLARATIONS READABLE: `url: SRC` is the right way to write one, because the URL the
   builder fetches and the URL the record states are one fact and belong in one place. A reader that
   could not resolve SRC would reject exactly those and accept only declarations that repeat
   themselves (.agents/rules/no-ad-hoc-hardcoding.md §2-3).
   ⚠ AND 「PURE DATA」 IS TESTED, NOT ASSUMED. An initialiser containing a call, an arrow, `await`
   or `new` is left unbound — evaluating it would be running the builder, which this file may never
   do. Identifiers are allowed only when they are an object key or a constant already resolved, so
   the resolution runs in passes and stops when a pass adds nothing. */
function literalConsts(src) {
  const known = new Map();
  const pending = [];
  for (const m of src.matchAll(/(?:^|\n)[ \t]*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=/g)) {
    const expr = initializer(src, m.index + m[0].length);
    if (expr != null && !known.has(m[1])) pending.push({ name: m[1], expr });
  }
  const dataOnly = (expr) => {
    /* strings blanked out so that their contents cannot look like code */
    let bare = '';
    for (let i = 0; i < expr.length; i++) {
      const c = expr[i];
      if (c === '"' || c === "'" || c === '`') { const j = endOfString(expr, i); if (j < 0) return false; bare += ' '; i = j; continue; }
      bare += c;
    }
    if (/[()]|=>|\bawait\b|\bnew\b/.test(bare)) return false;
    for (const id of bare.matchAll(/[A-Za-z_$][\w$]*/g)) {
      if (['true', 'false', 'null', 'undefined', 'NaN', 'Infinity'].includes(id[0])) continue;
      if (/^\s*:/.test(bare.slice(id.index + id[0].length))) continue;   /* an object key */
      if (!known.has(id[0])) return false;
    }
    return true;
  };
  for (let pass = 0; pass < 4; pass++) {
    let added = 0;
    for (const p of pending) {
      if (known.has(p.name) || !dataOnly(p.expr)) continue;
      try {
        const keys = [...known.keys()];
        /* eslint-disable-next-line no-new-func */
        known.set(p.name, new Function(...keys, '"use strict";return (' + p.expr + ');')(...keys.map((k) => known.get(k))));
        added++;
      } catch { /* not readable as data: left unbound, and whoever needs it is reported unreadable */ }
    }
    if (!added) break;
  }
  return { keys: [...known.keys()], values: [...known.values()] };
}

/* ── rule: could an unchecked response reach the bytes? ─────────────────────────────────────── */

/* ⚠ WHAT IS MEASURED IS THE FACT, NOT SEVEN FILE NAMES. The seven builders that have this shape
   today were found by asking these questions; writing their names here would make the eighth
   arrive unmeasured, which is the failure .agents/rules/no-ad-hoc-hardcoding.md §1 forbids.
   ⚠ AND THE LIMIT OF READING BYTES IS STATED RATHER THAN HIDDEN. Only the first question can be
   answered from the source with certainty — 「this file fetches and NOWHERE asks whether the
   response was ok」 is a property of the bytes. The second is a suspicion (a catch that drops the
   error, in a file that never throws), so it is a NOTE with its file:line, for a human to read. */
function updateFailure(b) {
  const src = b.src;
  const fetches = [...src.matchAll(/\bfetch\s*\(/g)].map((m) => lineOf(src, m.index));
  if (!fetches.length) return null;
  const asksOk = /\.ok\b|\.status\b|statusText/.test(src);
  if (!asksOk) {
    return { certain: true, where: b.subject + ':' + fetches[0],
      why: 'fetches upstream and nowhere in the file asks whether the response was ok — the body of a 404 or a 503 page is parsed and written like data' };
  }
  const throws = /\bthrow\b/.test(src);
  if (throws) return null;
  for (const m of src.matchAll(/catch\s*\([^)]*\)\s*\{([^{}]*)\}/g)) {
    const body = m[1];
    if (/throw|process\.exit/.test(body)) continue;
    return { certain: false, where: b.subject + ':' + lineOf(src, m.index),
      why: 'drops the error here and the file contains no `throw`, so a failed fetch may end as a shorter bundle rather than as a failed build' };
  }
  return null;
}

/* ── in-band records: what a shipped bundle says about itself ───────────────────────────────── */

/* Top-level members of a JSON (or `window.__X={…}`) head, stopping honestly at the window's edge.
   ⚠ TRUNCATION IS A THIRD ANSWER. A head that ends inside the payload array has not said that the
   members after it are absent, so `truncated` travels with the result and only becomes a reported
   defect when NOTHING was read. */
function topLevelMembers(text) {
  const start = text.indexOf('{');
  if (start < 0) return { members: null, truncated: false, why: 'the bundle is not an object' };
  const out = {};
  let i = start + 1, truncated = false;
  const ws = () => { while (i < text.length && /[\s,]/.test(text[i])) i++; };
  for (;;) {
    ws();
    if (i >= text.length) { truncated = true; break; }
    if (text[i] === '}') break;
    let key;
    if (text[i] === '"' || text[i] === "'") {
      const j = endOfString(text, i);
      if (j < 0) { truncated = true; break; }
      key = stringLiteral(text, i, j); i = j + 1;
      if (key == null) { truncated = true; break; }
    } else {
      const m = /^[A-Za-z_$][\w$]*/.exec(text.slice(i));
      if (!m) { truncated = true; break; }
      key = m[0]; i += m[0].length;
    }
    ws();
    if (text[i] !== ':') { truncated = true; break; }
    i++;
    ws();
    const c = text[i];
    if (c === '{' || c === '[') {
      const end = matchBracket(text, i);
      if (end < 0) { truncated = true; break; }
      try { out[key] = JSON.parse(text.slice(i, end + 1)); } catch { /* not JSON: the key is read as unstated rather than invented */ }
      i = end + 1; continue;
    }
    if (c === '"' || c === "'") {
      const j = endOfString(text, i);
      if (j < 0) { truncated = true; break; }
      { const v = stringLiteral(text, i, j); if (v != null) out[key] = v; /* unreadable: unstated, not the raw escapes */ }
      i = j + 1; continue;
    }
    const m = /^(-?\d[\d.eE+-]*|true|false|null)/.exec(text.slice(i));
    if (!m) { truncated = true; break; }
    out[key] = m[0] === 'true' ? true : m[0] === 'false' ? false : m[0] === 'null' ? null : Number(m[0]);
    i += m[0].length;
  }
  return { members: out, truncated, why: null };
}

function bundleRecord(bundle) {
  const member = (bundle.kind === 'shard' ? [bundle.index].filter(Boolean) : bundle.members)
    .find((m) => /\.(json|js)$/.test(m));
  if (!member) return { record: null, from: null, why: bundle.kind === 'shard' ? 'no index file' : 'no text member' };
  const fd = fs.openSync(path.join(ROOT, member), 'r');
  const buf = Buffer.alloc(HEAD_BYTES);
  const n = fs.readSync(fd, buf, 0, HEAD_BYTES, 0);
  fs.closeSync(fd);
  let head = buf.slice(0, n).toString('utf8');
  /* the `window.__X={…}` bundles, read the way scripts/hist-fidelity.mjs reads them */
  if (member.endsWith('.js')) { const eq = head.indexOf('='); if (eq >= 0) head = head.slice(eq + 1); }
  const { members, truncated, why } = topLevelMembers(head);
  if (!members) return { record: null, from: member, reason: 'record-absent', detail: why };
  const r = read(members);
  const states = ['publisher', 'url', 'licence', 'licenceUrl', 'credit', 'creditRequired', 'paidBy',
    'retrievedAt', 'generatedAt', 'asOf', 'cadence', 'builtBy', 'schema'].some((k) => r[k] != null)
    || (r.upstreams && r.upstreams.length);
  if (states) return { record: members, from: member, reason: null, detail: null };
  /* ⚠⚠⚠ 「述べていない」 と 「文の中で述べた」 IS THE DISTINCTION THIS WHOLE ROUND IS ABOUT, so it is
     MEASURED rather than assumed. The carrier is structural, not a licence-shaped regular
     expression: a member whose key belongs to none of the vocabulary's groups, holding a string
     long enough to be a sentence, is provenance written as prose — `data/cshapes.js` says
     `src:"CShapes 2.0 (Schvitz et al. 2022, icr.ethz.ch/data/cshapes) · CC BY-NC-SA 4.0"`, which a
     human can read and read() cannot, and that is exactly [[intmap-licence-must-be-a-value]]. */
  const known = new Set(Object.values(SPELLINGS).flat());
  const prose = Object.keys(members).filter((k) => !known.has(k)
    && typeof members[k] === 'string' && members[k].includes(' ') && members[k].length >= 20);
  if (prose.length) {
    return { record: null, from: member, reason: 'stated-only-in-prose',
      detail: 'provenance is written as a sentence in `' + prose.join('`, `') + '`' };
  }
  return { record: null, from: member, reason: 'record-absent',
    detail: truncated ? 'nothing was stated in the first ' + (HEAD_BYTES >> 10) + ' KiB and the head ended inside the payload'
      : 'the bundle states none of the facets' };
}

/* ── the ledger ─────────────────────────────────────────────────────────────────────────────── */

const LEDGER_NOTE = 'これは「まだ果たしていない義務」の台帳であって、免責ではない。'
  + ' Every entry is a bundle or a builder that does not yet state its own provenance as a value.'
  + ' The gate fails on anything NOT in here, and fails again when the counts are larger than'
  + ' reality — so a repair always shrinks this file, and nothing may be added to it except by'
  + ' a round that says in DEV-NOTES.md why the structure could not state it instead'
  + ' (.agents/rules/no-ad-hoc-hardcoding.md §6).';

const readLedger = () => {
  const p = path.join(ROOT, LEDGER);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return { _broken: String(e.message) }; }
};

/* ── main ──────────────────────────────────────────────────────────────────────────────────── */

function measure() {
  const bs = bundles();
  const bd = builders();
  const src = dataSourceRows(ROOT);
  const rows = src.rows || [];
  const names = new Set(rows.map((r) => r.n).filter(Boolean));

  /* which builder writes which bundle — best effort, and it decides `hasBuilder` only */
  const writerOf = new Map();
  for (const b of bd) {
    for (const p of b.paths) {
      const rel = p.slice('data/'.length);
      const slash = rel.indexOf('/');
      const subject = slash < 0
        ? 'data/' + rel.slice(0, rel.indexOf('.') < 0 ? rel.length : rel.indexOf('.'))
        : 'data/' + rel.slice(0, slash) + '/';
      if (!writerOf.has(subject)) writerOf.set(subject, []);
      writerOf.get(subject).push(b.subject);
    }
  }

  /* every subject: the bundles (with whatever they state in-band) and the builders (with whatever
     they declare). ⚠ THE TWO ARE SEPARATE SUBJECTS ON PURPOSE: a bundle states terms to a reader
     who has only the file, and a builder states them to the repository. Neither substitutes. */
  const subjects = [];
  for (const b of bs) {
    const { record, from, reason, detail } = bundleRecord(b);
    subjects.push({ kind: b.kind === 'shard' ? 'shard' : 'bundle', subject: b.subject,
      record, from, reason, detail, bundle: b,
      hasBuilder: (writerOf.get(b.subject) || []).length > 0 });
  }
  /* ⚠⚠⚠ A DECLARATION IS A MAP FROM OUTPUT PATH TO RECORD, AND IT HAS TO BE OPENED. This pushed
     `b.declaration.value` — the whole `{ 'data/x.json': {…} }` object — in as the record, and
     js/data-governance.js read() then looked for `licence` at the TOP level and found nothing. So
     every builder that declared its terms was read as a builder that had declared none: measured at
     the moment this was found, 32 declarations were present and `credit is a CONDITION` still said
     1, because the only record being read at the right level was a bundle that states its rights
     in-band. The gate was green and the rule it exists to enforce was looking at an empty object —
     [[intmap-contract-reached-only-from-one-side]] in the gate itself.
     ⚠ BOTH SHAPES ARE ACCEPTED, and the population decides which: a declaration whose keys are all
     `data/…` paths is a map (one subject per bundle it claims), anything else is one record. A rule
     that demanded the map shape would be a rule about spelling rather than about what was stated. */
  const asPathMap = (v) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const ks = Object.keys(v);
    if (!ks.length) return null;
    if (!ks.every((k) => k.startsWith('data/') && v[k] && typeof v[k] === 'object' && !Array.isArray(v[k]))) return null;
    return ks;
  };
  for (const b of bd) {
    const paths = asPathMap(b.declaration.value);
    if (paths) {
      for (const p of paths) {
        subjects.push({ kind: 'builder', subject: b.subject + ' → ' + p,
          record: b.declaration.value[p], declaredFor: p,
          unread: null, reason: null, detail: null,
          declared: true, hasBuilder: true, builder: b });
      }
      continue;
    }
    subjects.push({ kind: 'builder', subject: b.subject,
      record: b.declaration.value,
      /* ⚠ AN UNREADABLE DECLARATION IS A FAILURE OF ITS OWN AND NOT A SILENCE: it is reported by
         gov-declared and deliberately NOT given a REASONS code, because every code in that list
         is an observation about the world and 「I could not parse it」 is an observation about
         this gate (js/data-governance.js's REASONS, and scripts/shared-roster.mjs's `unclosed`). */
      unread: b.declaration.present && !b.declaration.value ? b.declaration.why : null,
      reason: b.declaration.value ? null : 'record-absent',
      detail: b.otherName ? 'the values are exported as `' + b.otherName + '`, a name no other reader of provenance looks for'
        : b.privateValues ? 'the values exist in this file as `' + b.privateValues + '` and nothing outside it can read them' : null,
      declared: b.declaration.present, hasBuilder: true, builder: b });
  }

  /* facets, accounted */
  const accounts = new Map();
  const facetGaps = [];
  for (const s of subjects) {
    const acc = account(s.record || {}, { hasBuilder: s.hasBuilder });
    accounts.set(s.subject, acc);
    const stated = SUBJECTS.flatMap((g) => Object.keys(acc[g] || {}).map((k) => g + '.' + k));
    const silent = acc.undeclared.map((u) => u.facet);
    const na = acc.notApplicable.map((u) => u.facet);
    const all = [...stated, ...silent, ...na];
    const missing = FACETS.filter((f) => !all.includes(f));
    const twice = FACETS.filter((f) => all.filter((x) => x === f).length > 1);
    const alien = all.filter((f) => !FACETS.includes(f));
    if (missing.length || twice.length || alien.length) {
      facetGaps.push({ subject: s.subject, missing, twice, alien });
    }
    const badReason = [...acc.undeclared, ...acc.notApplicable].filter((u) => !REASONS.includes(u.why));
    if (badReason.length) facetGaps.push({ subject: s.subject, reasons: badReason.map((b) => b.why) });
  }

  /* undeclared, per subject — what goes in the ledger */
  const undeclared = [];
  for (const s of subjects) {
    const acc = accounts.get(s.subject);
    if (!acc.undeclared.length) continue;
    /* the reason each subject's own measurement produced — never a default */
    const why = s.record ? 'facet-undeclared' : (REASONS.includes(s.reason) ? s.reason : 'record-absent');
    undeclared.push({ subject: s.subject, facets: acc.undeclared.map((u) => u.facet), why,
      ...(s.detail ? { detail: s.detail } : {}) });
  }

  /* bundle-licence: paid, as a value */
  const credit = { required: 0, paid: 0, unpaid: [], wrong: [] };
  for (const s of subjects) {
    const r = read(s.record || {});
    const ups = (r.upstreams && r.upstreams.length ? r.upstreams : [r]);
    for (const u of ups) {
      if (u.creditRequired !== true) continue;
      credit.required++;
      if (u.paidBy == null) { credit.unpaid.push({ subject: s.subject, licence: u.licence || null }); continue; }
      if (names.has(String(u.paidBy))) credit.paid++;
      else credit.wrong.push({ subject: s.subject, paidBy: String(u.paidBy) });
    }
  }

  /* freshness — reported, never used to refuse */
  const fresh = { fresh: 0, aging: 0, stale: 0, unknown: 0 };
  const stales = [], noCadence = [];
  for (const s of subjects) {
    const f = freshness(s.record || {});
    fresh[f.verdict]++;
    if (f.verdict === 'stale') stales.push({ subject: s.subject, ageDays: f.ageDays, cadence: f.cadence });
    /* ⚠ ASKED ONLY OF A RECORD THAT WAS READ. A declaration this gate could not evaluate has not
       failed to state a cadence — it has not been read, and the two must not produce one verdict
       (js/data-governance.js's FRESHNESS: `unknown` is not a weaker `stale`). */
    if (f.verdict === 'unknown' && f.reason === 'facet-undeclared' && s.kind === 'builder' && s.record) {
      noCadence.push({ subject: s.subject });
    }
  }

  /* update-failure */
  const exposed = [], suspected = [];
  for (const b of bd) {
    const u = updateFailure(b);
    if (!u) continue;
    (u.certain ? exposed : suspected).push({ subject: b.subject, why: u.why, where: u.where });
  }

  const shardsWithoutIndex = bs.filter((b) => b.kind === 'shard' && !b.index)
    .map((b) => ({ subject: b.subject, why: 'record-absent', shards: b.shards }));

  const unreadable = subjects.filter((s) => s.kind === 'builder' && s.declared && !s.record)
    .map((s) => ({ subject: s.subject, why: s.unread }));

  return { bs, bd, subjects, accounts, rows, src, credit, fresh, stales, noCadence,
    exposed, suspected, shardsWithoutIndex, undeclared, facetGaps, unreadable, writerOf };
}

function ledgerFrom(m) {
  return {
    gov: {
      note: LEDGER_NOTE,
      generatedAt: new Date().toISOString(),
      declaredBy: 'scripts/data-governance.mjs',
      cadence: 'static',
    },
    undeclared: m.undeclared.map((u) => ({ subject: u.subject, facets: u.facets, why: u.why, ...(u.detail ? { detail: u.detail } : {}) }))
      .sort((a, b) => (a.subject < b.subject ? -1 : 1)),
    updateFailureExposed: m.exposed.map((e) => ({ subject: e.subject, why: e.why, where: e.where }))
      .sort((a, b) => (a.subject < b.subject ? -1 : 1)),
    shardsWithoutIndex: m.shardsWithoutIndex.map((s) => ({ subject: s.subject, why: s.why, shards: s.shards }))
      .sort((a, b) => (a.subject < b.subject ? -1 : 1)),
    /* ⚠ RECORDED SEPARATELY, BECAUSE IT IS A DIFFERENT DEBT. A declaration nobody else can read is
       not a silence about a facet — it states everything and reaches no one — so merging it into
       `undeclared` would lose the one thing a reader needs to act on it. */
    unreadableDeclaration: m.unreadable.map((u) => ({ subject: u.subject, why: u.why }))
      .sort((a, b) => (a.subject < b.subject ? -1 : 1)),
    counts: {
      undeclared: m.undeclared.length,
      /* ⚠ THE SUBJECT COUNT ALONE IS NOT A FLOOR THAT CAN FALL. A builder that goes from stating
         nothing to stating its publisher, licence and cadence is still one entry, so a ledger
         counting only subjects would report the repair as no change at all and could not fail the
         opposite drift either. The facets are the debt; the subjects are only where it sits. */
      undeclaredFacets: m.undeclared.reduce((n, u) => n + u.facets.length, 0),
      updateFailureExposed: m.exposed.length,
      shardsWithoutIndex: m.shardsWithoutIndex.length,
      unreadableDeclaration: m.unreadable.length,
    },
  };
}

function main() {
  const m = measure();
  if (has('--update')) {
    fs.writeFileSync(path.join(ROOT, LEDGER), JSON.stringify(ledgerFrom(m), null, 2) + '\n');
    console.log('wrote ' + LEDGER + ' — undeclared ' + m.undeclared.length
      + ' subject(s) / ' + m.undeclared.reduce((n, u) => n + u.facets.length, 0) + ' facet(s)'
      + ', unchecked-response ' + m.exposed.length + ', shard dirs with no index ' + m.shardsWithoutIndex.length
      + ', unreadable declaration(s) ' + m.unreadable.length);
    return;
  }

  const problems = [], notes = [];
  const say = (rule, ok, msg) => {
    if (only && only !== rule) return;
    (ok ? notes : problems).push(`  ${ok ? 'ok  ' : '✖  '} ${rule}: ${msg}`);
  };

  /* ⚠ A NEEDLE THAT HITS NOTHING MUST NOT PASS. scripts/doc-facts.mjs:2224's judgement: a rule
     whose universe came back empty has measured nothing, and 「0 件の違反」 reads identically to
     「一度も見なかった」 in every log. Each of these is the universe of a rule below. */
  say('gov-declared', m.bs.length > 0, m.bs.length + ' bundle(s) discovered under data/');
  say('gov-declared', m.bd.length > 0, m.bd.length + ' script(s) discovered that write into data/');
  say('bundle-licence', m.rows.length > 0, m.src.why
    ? 'the DATA_SOURCES rows could not be read — ' + m.src.why
    : m.rows.length + ' DATA_SOURCES row(s) read as rows (not as a substring of one literal)');
  say('facets-accounted', m.subjects.length > 0, m.subjects.length + ' subject(s) accounted over ' + FACETS.length + ' facets');

  /* ⚠ THE LEDGER IS READ BEFORE THE RULES, BECAUSE EVERY RULE ASKS IT THE SAME QUESTION: is this
     debt a NEW one? A rule that failed on debts already written down would be red on the day it
     was written and stay red, and a permanently red gate is one nobody reads (#R403 §6). */
  const ledger = readLedger();
  const ledgerFacets = new Map();
  for (const e of (ledger && ledger.undeclared) || []) ledgerFacets.set(e.subject, new Set(e.facets || []));
  const ledgerHas = (list, subject) => ((ledger && Array.isArray(ledger[list]) ? ledger[list] : []).some((e) => e.subject === subject));

  /* ── 1. gov-declared ──────────────────────────────────────────────────────────────────── */
  const declared = m.bd.filter((b) => b.declaration.value);
  const newUnread = m.unreadable.filter((u) => !ledgerHas('unreadableDeclaration', u.subject));
  say('gov-declared', newUnread.length === 0, newUnread.length === 0
    ? (m.unreadable.length === 0
      ? 'every `export const GOVERNANCE` present could be read without running its builder'
      : m.unreadable.length + ' unreadable declaration(s), all already written down in ' + LEDGER)
    : newUnread.length + ' declaration(s) exist and could not be read statically — '
      + newUnread.map((u) => u.subject + ' (' + u.why + ')').join('; ')
      + '. ⚠ This is 「読めなかった」 and is NOT counted as 「宣言が無い」: write the initialiser so it stands apart from its builder');
  say('gov-declared', true, declared.length + ' of ' + m.bd.length
    + ' script(s) that write into data/ state their bundle\'s provenance as a value');

  /* ── 2. bundle-licence ────────────────────────────────────────────────────────────────── */
  say('bundle-licence', m.credit.wrong.length === 0, m.credit.wrong.length === 0
    ? m.credit.required + ' record(s) make credit a condition of redistribution; every `paidBy` stated names a real DATA_SOURCES row'
    : m.credit.wrong.map((w) => w.subject + ' names «' + w.paidBy + '» as the row that pays its attribution and js/reference-data.js has no row with that exact `n`').join('; '));

  /* ── 3. freshness-stated ──────────────────────────────────────────────────────────────── */
  const newNoCadence = m.noCadence.filter((c) => !(ledgerFacets.get(c.subject) || new Set()).has('freshness.cadence'));
  say('freshness-stated', newNoCadence.length === 0, newNoCadence.length === 0
    ? (m.noCadence.length === 0
      ? 'every readable declaration states a cadence (an ISO 8601 duration, or `static`)'
      : m.noCadence.length + ' declaration(s) state no cadence, all already written down in ' + LEDGER)
    : newNoCadence.length + ' declaration(s) state no cadence, so 「次の更新はいつか」 cannot be measured at all — '
      + newNoCadence.map((c) => c.subject).join(', '));
  if (m.stales.length) {
    say('freshness-stated', true, m.stales.length
      + ' record(s) are older than the cadence they declare (a NOTE, never a failure: refusing data on a threshold nobody authored is what .agents/rules/no-ad-hoc-hardcoding.md §4 forbids) — '
      + m.stales.slice(0, 6).map((s) => s.subject + ' ' + s.ageDays + 'd/' + s.cadence).join(', '));
  }

  /* ── 4. update-failure ────────────────────────────────────────────────────────────────── */
  const newExposed = m.exposed.filter((e) => !ledgerHas('updateFailureExposed', e.subject));
  say('update-failure', newExposed.length === 0, newExposed.length === 0
    ? m.exposed.length + ' script(s) can write an unchecked response, all of them already written down in ' + LEDGER
    : newExposed.map((e) => e.where + ' ' + e.why).join('; '));
  if (m.suspected.length) {
    say('update-failure', true, m.suspected.length
      + ' script(s) drop a fetch error and never throw — static reading cannot prove the swallowed value reaches the bundle, so this is a note: '
      + m.suspected.map((s) => s.where).join(', '));
  }
  for (const b of m.bd) {
    if (!b.unresolved.length) continue;
    say('update-failure', true, b.subject + ' writes to a destination assembled at run time ('
      + b.unresolved.map((u) => 'line ' + u.line).join(', ') + ') — read from the bytes, that path cannot be resolved, and it is not guessed at');
  }

  /* ── 5. ledger-shrinks ────────────────────────────────────────────────────────────────── */
  if (!ledger || ledger._broken) {
    say('ledger-shrinks', false, ledger ? LEDGER + ' is not readable JSON — ' + ledger._broken
      : LEDGER + ' does not exist; run `node scripts/data-governance.mjs --update` to record what is not yet stated');
  } else {
    const inLedger = new Set((ledger.undeclared || []).map((e) => e.subject));
    const fresh = m.undeclared.filter((u) => !inLedger.has(u.subject));
    say('ledger-shrinks', fresh.length === 0, fresh.length === 0
      ? 'no subject is silent about its provenance that ' + LEDGER + ' does not already name'
      : fresh.length + ' NEW subject(s) state no provenance: ' + fresh.slice(0, 8).map((f) => f.subject).join(', ')
        + '. Either state it as a value, or record it (--update) with a DEV-NOTES.md entry saying why the structure cannot');
    const want = { undeclared: m.undeclared.length,
      undeclaredFacets: m.undeclared.reduce((n, u) => n + u.facets.length, 0),
      updateFailureExposed: m.exposed.length, shardsWithoutIndex: m.shardsWithoutIndex.length,
      unreadableDeclaration: m.unreadable.length };
    for (const k of Object.keys(want)) {
      const had = (ledger.counts || {})[k];
      /* ⚠ THE FLOOR IS TWO-SIDED, AND THAT IS WHAT MAKES IT A FLOOR. Larger than reality means the
         ledger excuses debts already paid, so the next regression hides inside the slack; smaller
         means a new one arrived. Equality, re-recorded by --update, is the only resting state, and
         the direction it may travel over rounds is down. */
      say('ledger-shrinks', had === want[k], had === want[k]
        ? `${k}: ${want[k]} — as recorded`
        : had == null ? `${LEDGER} does not record a count for ${k}`
          : had > want[k] ? `${LEDGER} records ${had} ${k} and reality has ${want[k]} — the ledger is looser than the repository: shrink it (--update)`
            : `${k} grew from ${had} to ${want[k]}`);
    }
    const gone = [...inLedger].filter((s) => !m.undeclared.some((u) => u.subject === s));
    if (gone.length) say('ledger-shrinks', true, gone.length + ' subject(s) in ' + LEDGER + ' now state their provenance — run --update to shrink it: ' + gone.slice(0, 8).join(', '));
  }

  /* ── 6. facets-accounted ──────────────────────────────────────────────────────────────── */
  say('facets-accounted', m.facetGaps.length === 0, m.facetGaps.length === 0
    ? 'every one of ' + FACETS.length + ' facets of every subject is stated, undeclared with a reason, or not applicable with a reason — an absent key is none of those'
    : m.facetGaps.slice(0, 6).map((g) => g.subject + ': '
      + (g.reasons ? 'reason(s) outside REASONS — ' + g.reasons.join(',')
        : [g.missing.length ? 'unaccounted ' + g.missing.join(',') : '', g.twice.length ? 'twice ' + g.twice.join(',') : '', g.alien.length ? 'not a facet ' + g.alien.join(',') : ''].filter(Boolean).join('; '))).join(' | '));

  /* ── the measurement, always printed ──────────────────────────────────────────────────── */
  const shards = m.bs.filter((b) => b.kind === 'shard');
  console.log('\n── 実測 (' + new Date().toISOString().slice(0, 10) + ')');
  console.log('   bundles under data/            ' + m.bs.length + '  (' + (m.bs.length - shards.length)
    + ' file bundles, ' + shards.length + ' shard directories holding '
    + shards.reduce((n, s) => n + s.shards, 0) + ' tracked files)');
  console.log('   scripts writing into data/      ' + m.bd.length + '  of ' + tracked('scripts').filter((f) => f.endsWith('.mjs')).length + ' tracked .mjs');
  console.log('   with `export const GOVERNANCE`  ' + declared.length + '  (unreadable ' + m.unreadable.length
    + '; stating the values under another exported name ' + m.bd.filter((b) => b.otherName).length
    + ', unexported ' + m.bd.filter((b) => b.privateValues).length + ')');
  console.log('   bundles stating facets in-band  ' + m.subjects.filter((s) => s.kind !== 'builder' && s.record).length
    + '  of ' + (m.bs.length) + '   (builder-mapped ' + m.writerOf.size + ')');
  console.log('   DATA_SOURCES rows               ' + m.rows.length);
  console.log('   credit is a CONDITION           ' + m.credit.required + '  → paid by a real row ' + m.credit.paid
    + ', row not named ' + m.credit.unpaid.length + ', row named but absent ' + m.credit.wrong.length);
  console.log('   freshness                       fresh ' + m.fresh.fresh + ' / aging ' + m.fresh.aging
    + ' / stale ' + m.fresh.stale + ' / unknown ' + m.fresh.unknown);
  console.log('   unchecked response can ship     ' + m.exposed.length + ' certain, ' + m.suspected.length + ' suspected');
  console.log('   shard dirs with no index        ' + m.shardsWithoutIndex.length
    + (m.shardsWithoutIndex.length ? '  (' + m.shardsWithoutIndex.map((s) => s.subject + ' ' + s.shards).join(', ') + ')' : ''));
  const lc = (readLedger() || {}).counts || {};
  console.log('   ' + LEDGER + '  undeclared ' + (lc.undeclared ?? '—') + ' / unchecked ' + (lc.updateFailureExposed ?? '—')
    + ' / shards ' + (lc.shardsWithoutIndex ?? '—'));

  if (has('--report')) {
    console.log('\n── 出自を値として述べていない subject（facet 数つき）');
    for (const u of m.undeclared) console.log('   ' + u.subject.padEnd(44) + ' ' + String(u.facets.length).padStart(2) + '/' + FACETS.length + '  ' + u.why);
    console.log('\n── 帰属表示が再配布の条件で、払う行を名指していない');
    for (const u of m.credit.unpaid) console.log('   ' + u.subject.padEnd(44) + ' ' + (u.licence || '(licence not stated)'));
    console.log('\n── 応答を確かめずに書きうる builder');
    for (const e of m.exposed) console.log('   ' + e.where.padEnd(44) + ' ' + e.why);
    for (const s of m.suspected) console.log('   ' + s.where.padEnd(44) + ' (suspected) ' + s.why);
    console.log('');
  }

  for (const n of notes) console.log(n);
  for (const p of problems) console.log(p);
  console.log('\ncheck:datagov — 出自・権利・鮮度・失敗は散文ではなく値である');
  if (problems.length) process.exit(1);
}
/* ⚠⚠⚠ RUN ONLY WHEN RUN. `dataSourceRows()` is exported so that build-cshapes.mjs:475 and
   build-hist-cities.mjs:194 can stop carrying their own copy of the DATA_SOURCES regex — and an
   import that executed this gate would make those builders run it, which is the very shape
   scripts/shared-roster.mjs was split out of doc-facts.mjs to avoid (「checks that run on import」).
   A module whose body does work cannot be reused, and a judgement nobody can reuse gets copied. */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
