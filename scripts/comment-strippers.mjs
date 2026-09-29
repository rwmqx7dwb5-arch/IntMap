#!/usr/bin/env node
/* ============================================================================
 *  IntMap · ONE COMMENT STRIPPER — a new copy is found by its SHAPE   (test-code-only-one)
 * ----------------------------------------------------------------------------
 *  scripts/code-only.mjs is the one reader that knows a comment from code (#R345). The census that
 *  opened this round (test-code-only-one) found the repository had gone on writing its own anyway:
 *  635 sites in 170 files under tests/ and scripts/ — 578 .replace() calls with a comment regex,
 *  51 opener tests in hand-written loops, 3 acorn onComment blankers, 3 comment-line filters — under
 *  names like codeOnly, code, noComments, noJs, bare, nocomment, strip, blankComments, and 67 regex
 *  chains with no name at all, written inline into one assertion. A rule keyed on the NAME cannot
 *  see the unnamed ones, and the next copy will have a new name.
 *
 *  So the rule is on what a stripper DOES, read from the parse tree of every .js/.mjs/.cjs file
 *  under tests/ and scripts/:
 *    · regex   — a .replace()/.replaceAll() whose pattern is a regular-expression LITERAL that
 *                matches a comment: a lazy block comment, «two slashes to the end of the line»,
 *                an HTML comment, or SQL's «two hyphens to the end of the line».
 *    · scanner — a hand-written loop that tests for a comment opener: `c === '/' && next === '*'`
 *                (or '/', '-' '-', '<' '!').
 *    · parser  — an acorn `onComment` callback that uses the comment's OFFSETS (its 3rd or 4th
 *                argument) — i.e. blanks the range, as opposed to reading the comment's text.
 *
 *  THE LEDGER (scripts/comment-strippers-ledger.json) holds, per file, how many such sites REMAIN.
 *  More than the ledger → a new copy was written: import { codeOnly } from scripts/code-only.mjs
 *  (its options — lang, offsets, literals, parser — cover every question the copies asked; see
 *  docs/TESTING.md). Fewer → a copy was removed and the ledger must come DOWN with it
 *  (`node scripts/comment-strippers.mjs --write`), so it can never be spent again. `kept` is not
 *  debt — each entry says why that file strips comments itself.
 *
 *    node scripts/comment-strippers.mjs            # every site + the ledger comparison
 *    node scripts/comment-strippers.mjs --write    # rewrite `pending` to what is measured
 * ==========================================================================*/
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER_PATH = join(ROOT, 'scripts', 'comment-strippers-ledger.json');
const DIRS = ['tests', 'scripts'];
const SKIP = new Set(['node_modules', 'fixtures', '.cache']);

/* What a comment-matching regex looks like, as the pattern source acorn hands back. */
const BLOCK_OPEN = String.raw`\/\*`, BLOCK_CLOSE = String.raw`\*\/`, SLASHES = String.raw`\/\/`;
const LAZY = /\[\\s\\S\]\*\?|\[\^\]\*\?|\.\*\?/;
const TO_EOL = /^(\.\*|\[\^\\n\]\*|\[\^\\r\\n\]\*|\[\^\\n\\r\]\*)/;
/** Which comment (if any) a regular-expression pattern removes: 'block' | 'line' | 'html' | 'sql' | null. */
export function commentKind(pattern) {
  const p = String(pattern);
  if (p.includes(BLOCK_OPEN) && p.includes(BLOCK_CLOSE) && LAZY.test(p)) return 'block';
  const at = p.indexOf(SLASHES);
  if (at >= 0 && TO_EOL.test(p.slice(at + SLASHES.length))) return 'line';
  if (p.includes('<!--') && p.includes('-->')) return 'html';
  const dd = p.indexOf('--');
  if (dd >= 0 && TO_EOL.test(p.slice(dd + 2)) && !p.slice(0, dd).includes('<!')) return 'sql';
  return null;
}

/* The opener pairs a hand-written scanner tests for. */
const OPENERS = new Set(['/*', '//', '--', '<!']);
const strLit = (n) => n && n.type === 'Literal' && typeof n.value === 'string' ? n.value : null;
const eqLiteral = (n) => {
  if (!n || n.type !== 'BinaryExpression' || !/^[!=]==?$/.test(n.operator) || n.operator[0] === '!') return null;
  return strLit(n.right) ?? strLit(n.left);
};
const isFn = (n) => n && /^(ArrowFunctionExpression|FunctionExpression)$/.test(n.type);
const usesOffsetParams = (fn) => {
  const names = fn.params.slice(2, 4).filter((p) => p.type === 'Identifier').map((p) => p.name);
  if (!names.length) return false;
  let used = false;
  walk.full(fn.body, (n) => { if (n.type === 'Identifier' && names.includes(n.name)) used = true; });
  return used;
};

/* A line filter that drops the lines a comment starts: a regex anchored at the line's start
   (after indentation) on `//`, a block opener or a continuation `*`, or a comparison with '//'. */
const LINE_START_COMMENT = /^\^(\\s\*|\[ \\t\]\*)(\\\/\\\/|\\\/\\\*|\\\*|\(\\\*)/;
const dropsCommentLines = (fn) => {
  let hit = false;
  walk.full(fn.body, (n) => {
    if (n.type === 'Literal' && n.regex && LINE_START_COMMENT.test(n.regex.pattern)) hit = true;
    if (n.type === 'BinaryExpression' && /^[!=]==?$/.test(n.operator) && (strLit(n.left) === '//' || strLit(n.right) === '//')) hit = true;
  });
  return hit;
};

function parse(src) {
  for (const sourceType of ['module', 'script']) {
    try { return acorn.parse(src, { ecmaVersion: 'latest', sourceType, allowHashBang: true, locations: true, allowReturnOutsideFunction: true }); } catch { /* next */ }
  }
  return null;
}

/** Every comment-stripping site in one source text: [{ shape, line }]. */
export function scanSource(src) {
  const ast = parse(String(src));
  if (!ast) return null;
  const sites = [];
  walk.full(ast, (n) => {
    if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed
      && /^replace(All)?$/.test(n.callee.property.name || '')) {
      const a = n.arguments[0];
      if (a && a.type === 'Literal' && a.regex && commentKind(a.regex.pattern)) sites.push({ shape: 'regex', line: n.loc.start.line });
    }
    if (n.type === 'LogicalExpression' && n.operator === '&&') {
      const a = eqLiteral(n.left), b = eqLiteral(n.right);
      if (a && b && a.length === 1 && b.length === 1 && OPENERS.has(a + b)) sites.push({ shape: 'scanner', line: n.loc.start.line });
    }
    if (n.type === 'Property' && !n.computed && (n.key.name || n.key.value) === 'onComment' && isFn(n.value) && usesOffsetParams(n.value)) {
      sites.push({ shape: 'parser', line: n.loc.start.line });
    }
    if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed
      && n.callee.property.name === 'filter' && isFn(n.arguments[0]) && dropsCommentLines(n.arguments[0])) {
      sites.push({ shape: 'filter', line: n.loc.start.line });
    }
  });
  return sites;
}

function files(root) {
  const out = [];
  const w = (d) => {
    if (!existsSync(d)) return;
    for (const f of readdirSync(d)) {
      if (SKIP.has(f)) continue;
      const p = join(d, f);
      const st = statSync(p);
      if (st.isDirectory()) w(p);
      else if (/\.(m?js|cjs)$/.test(f)) out.push(p);
    }
  };
  for (const d of DIRS) w(join(root, d));
  return out;
}

/** file (posix, repo-relative) → [{ shape, line }] for every file that has at least one site. */
export function measure(root = ROOT) {
  const found = {};
  for (const f of files(root)) {
    const sites = scanSource(readFileSync(f, 'utf8'));
    if (sites && sites.length) found[relative(root, f).replace(/\\/g, '/')] = sites;
  }
  return found;
}

export function readLedger(path = LEDGER_PATH) {
  if (!existsSync(path)) return { pending: {}, kept: {} };
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function commentStripperProblems({ measured = measure(), ledger = readLedger() } = {}) {
  const problems = [];
  const all = new Set([...Object.keys(measured), ...Object.keys(ledger.pending || {}), ...Object.keys(ledger.kept || {})]);
  for (const f of [...all].sort()) {
    const have = (measured[f] || []).length;
    const kept = (ledger.kept || {})[f];
    const allowed = ((ledger.pending || {})[f] || 0) + (kept ? kept.sites : 0);
    if (have > allowed) {
      const where = (measured[f] || []).map((s) => `${s.shape}@${s.line}`).join(', ');
      problems.push(`${f}: ${have} comment-stripping site(s) where the ledger allows ${allowed} (${where}) — `
        + 'import { codeOnly } from scripts/code-only.mjs (lang / offsets / literals / parser options) instead of writing another stripper');
    } else if (have < allowed) {
      problems.push(`${f}: ${have} comment-stripping site(s) but the ledger still allows ${allowed} — one was removed; `
        + 'lower the ledger (node scripts/comment-strippers.mjs --write) so it cannot be spent again');
    }
  }
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const measured = measure();
  const ledger = readLedger();
  if (process.argv.includes('--write')) {
    const pending = {};
    for (const [f, s] of Object.entries(measured)) {
      const kept = (ledger.kept || {})[f];
      const n = s.length - (kept ? kept.sites : 0);
      if (n > 0) pending[f] = n;
    }
    writeFileSync(LEDGER_PATH, JSON.stringify({ ...ledger, pending }, null, 2) + '\n');
    console.log(`wrote ${relative(ROOT, LEDGER_PATH)}`);
  }
  let total = 0;
  for (const [f, s] of Object.entries(measured).sort()) { total += s.length; console.log(`${f}: ${s.map((x) => `${x.shape}@${x.line}`).join(' ')}`); }
  const problems = commentStripperProblems({ measured, ledger: readLedger() });
  console.log(`\n${Object.keys(measured).length} file(s), ${total} site(s); ${problems.length} problem(s)`);
  for (const p of problems) console.log('  · ' + p);
  process.exit(problems.length ? 1 : 0);
}
