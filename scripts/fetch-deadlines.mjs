/* ============================================================================
 *  IntMap · requests with no end, counted  (fetch-deadline-layer)
 * ----------------------------------------------------------------------------
 *  A `fetch()` that carries no signal cannot be given up on. Against a host that has stopped
 *  answering it is not slow — it is permanent, and everything waiting on it inherits that: a layer
 *  row stays «in flight», a widget stays on its dash, an Atlas turn never comes back (#R452 and
 *  stalled-fetch-and-surface-gauge measured each of those on the live site). The app has had a
 *  clock for a read since #R452 — js/fetch-deadline.js `readWithin` / `jsonWithin`, sized per host
 *  by js/proxy-fetch.js `clockFor` — and the audit that opened this round found it used by about a
 *  fifth of the reads: 150 bare `fetch(` calls in js/ carried no signal of any kind.
 *
 *  This is the instrument that keeps that number from growing while it is brought down. It counts,
 *  PER FILE and from the parser, every call of the global `fetch` whose options carry no `signal`,
 *  and compares the counts with tests/fetch-deadline-baseline.json:
 *    · a file with MORE than its ledger fails — a new read with no end has to go through the clock
 *      (or carry a signal of its own), not be slipped in;
 *    · a file with FEWER fails too — the ledger has stopped asserting what it says, and `--update`
 *      records the smaller number (#R194: a ceiling raised once and never lowered asserts nothing).
 *  Per file, not one total: a total lets a new unbounded read hide behind one that was fixed.
 *
 *  WHAT COUNTS AS BOUNDED is decided by the shape the parser sees, not by a list of files:
 *    · `fetch(u, { …, signal: … })` — any object literal among the options that names `signal`
 *      (including `AbortSignal.timeout(ms)` and a caller's signal forwarded as-is);
 *    · `fetch(u, opt)` where the same function writes `opt.signal = …` or declares `opt` as an
 *      object literal naming `signal` (js/fetch-deadline.js's own read, js/proxy-fetch.js's);
 *    · `fetch(u, Object.assign(…, { signal }))`.
 *  A read made through `readWithin` / `jsonWithin` / `fetchViaProxy` is not a `fetch(` call here
 *  at all, which is the point: the clocked helpers ARE the way out of this count.
 *  ⚠ A signal is taken at its word — this does not prove the signal is ever aborted. What it does
 *  guarantee is that a request with no way to end cannot be ADDED unseen.
 *
 *  EXEMPT is the only way out besides a signal, and every row must say why in a sentence. It is
 *  keyed by file and the call's first-argument source text, never by line number (a line moves with
 *  every edit above it).
 *
 *      node scripts/fetch-deadlines.mjs            report (per file)
 *      node scripts/fetch-deadlines.mjs --check    compare with the ledger (exit 1 on any difference)
 *      node scripts/fetch-deadlines.mjs --update   rewrite the ledger from the tree
 *  scripts/static-checks.mjs runs the comparison as its `fetch-deadline` rule.
 * ==========================================================================*/
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
export const LEDGER = join(ROOT, 'tests', 'fetch-deadline-baseline.json');
const DIRS = ['js', 'src'];

/* { file, arg, why } — `arg` is the first argument's source text, exactly as written. Empty today:
   every bare read found so far is a read that can be given a clock, so none is excused. */
export const EXEMPT = [];

const SKIP = new Set(['type', 'start', 'end', 'loc']);
const kids = (n, f) => { for (const k of Object.keys(n)) if (!SKIP.has(k)) f(n[k]); };
const isFn = (n) => n && /Function/.test(n.type);

function parse(src, file) {
  const o = { ecmaVersion: 'latest', allowHashBang: true, locations: true };
  try { return acorn.parse(src, { ...o, sourceType: 'module' }); } catch (asModule) {
    try { return acorn.parse(src, { ...o, sourceType: 'script' }); } catch (_) {
      throw new Error(`fetch-deadlines: cannot parse ${file} — ${asModule.message}`);
    }
  }
}

/* the global fetch: `fetch(…)`, `window.fetch(…)`, `self.fetch(…)`, `globalThis.fetch(…)` — not
   `x.fetch(…)`, which is somebody's method */
const isGlobalFetch = (c) => (c.type === 'Identifier' && c.name === 'fetch')
  || (c.type === 'MemberExpression' && !c.computed && c.property.name === 'fetch'
    && c.object.type === 'Identifier' && /^(window|self|globalThis)$/.test(c.object.name));

const namesSignal = (o) => o && o.type === 'ObjectExpression'
  && o.properties.some((p) => p.type === 'Property' && !p.computed && ((p.key.name || p.key.value) === 'signal'));

/* within the function body `fn`, does `name` end up carrying a signal? */
function identCarriesSignal(fn, name) {
  let yes = false;
  (function walk(n) {
    if (yes || !n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.id.name === name && optsCarrySignal(n.init, fn)) { yes = true; return; }
    if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && !n.left.computed
      && n.left.object.type === 'Identifier' && n.left.object.name === name && n.left.property.name === 'signal') { yes = true; return; }
    kids(n, walk);
  })(fn);
  return yes;
}

function optsCarrySignal(o, fn) {
  if (!o) return false;
  if (namesSignal(o)) return true;
  if (o.type === 'CallExpression' && o.callee.type === 'MemberExpression' && !o.callee.computed
    && o.callee.object.type === 'Identifier' && o.callee.object.name === 'Object' && o.callee.property.name === 'assign') {
    return o.arguments.some((a) => optsCarrySignal(a, fn));
  }
  if (o.type === 'Identifier' && fn) return identCarriesSignal(fn, o.name);
  return false;
}

/** Every bare fetch in one source: [{ line, arg }] */
export function bareFetches(src, file) {
  const out = [];
  const tree = parse(src, file);
  (function walk(n, fn) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach((c) => walk(c, fn)); return; }
    const inFn = isFn(n) ? n : fn;
    if (n.type === 'CallExpression' && isGlobalFetch(n.callee) && !optsCarrySignal(n.arguments[1], inFn)) {
      const a0 = n.arguments[0];
      out.push({ line: n.loc.start.line, arg: a0 ? src.slice(a0.start, a0.end) : '' });
    }
    kids(n, (c) => walk(c, inFn));
  })(tree, null);
  return out;
}

/** { 'js/x.js': n, … } over js/ and src/, EXEMPT rows removed; files with none are absent. */
export function measure(root) {
  const R = root || ROOT;
  const perFile = {};
  const exempt = new Set(EXEMPT.map((e) => e.file + '\u0000' + e.arg));
  for (const d of DIRS) {
    if (!existsSync(join(R, d))) continue;
    for (const f of readdirSync(join(R, d)).filter((x) => x.endsWith('.js')).sort()) {
      const rel = d + '/' + f;
      const n = bareFetches(readFileSync(join(R, d, f), 'utf8'), rel).filter((b) => !exempt.has(rel + '\u0000' + b.arg)).length;
      if (n) perFile[rel] = n;
    }
  }
  return perFile;
}

const total = (m) => Object.values(m).reduce((a, b) => a + b, 0);

/** @returns {{ ok: boolean, lines: string[] }} */
export function check(root, ledgerPath) {
  const lines = [];
  const bad = EXEMPT.filter((e) => !e || !e.file || typeof e.arg !== 'string' || !String(e.why || '').trim());
  bad.forEach((e) => lines.push(`EXEMPT row without a reason: ${JSON.stringify(e)}`));
  const P = ledgerPath || LEDGER;
  if (!existsSync(P)) return { ok: false, lines: lines.concat(`no ledger at ${P} — run: node scripts/fetch-deadlines.mjs --update`) };
  const was = JSON.parse(readFileSync(P, 'utf8')).files || {};
  const now = measure(root);
  for (const f of Array.from(new Set([...Object.keys(was), ...Object.keys(now)])).sort()) {
    const a = was[f] || 0, b = now[f] || 0;
    if (b > a) lines.push(`${f}: ${b} fetch() call(s) with no signal, ledger allows ${a} — read it through js/fetch-deadline.js (readWithin/jsonWithin + clockFor) or give it a signal`);
    else if (b < a) lines.push(`${f}: ${b} fetch() call(s) with no signal, ledger still says ${a} — lower the ledger: node scripts/fetch-deadlines.mjs --update`);
  }
  return { ok: lines.length === 0, lines, files: now, total: total(now), ledgerTotal: total(was) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = process.argv[2] || '';
  if (arg === '--update') {
    const m = measure();
    writeFileSync(LEDGER, JSON.stringify({
      '//': 'written by scripts/fetch-deadlines.mjs --update — fetch() calls with no signal, per file; ratcheted both ways by check:static',
      total: total(m), files: m,
    }, null, 1) + '\n');
    console.log(`fetch-deadlines: ledger written — ${total(m)} across ${Object.keys(m).length} files`);
  } else if (arg === '--check') {
    const r = check();
    r.lines.forEach((l) => console.log('  · ' + l));
    console.log(r.ok ? `fetch-deadlines: ${r.total} unbounded fetch() calls, as the ledger says` : 'fetch-deadlines: FAILED');
    process.exit(r.ok ? 0 : 1);
  } else {
    const m = measure();
    Object.entries(m).sort((a, b) => b[1] - a[1]).forEach(([f, n]) => console.log(String(n).padStart(4) + '  ' + f));
    console.log(`total ${total(m)} across ${Object.keys(m).length} files`);
  }
}
