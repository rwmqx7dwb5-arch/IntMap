#!/usr/bin/env node
/* ============================================================================
 *  IntMap · WHAT EACH BROWSER SPEC GUARDS — its REACH, discovered, not listed  (delivery-quality)
 * ----------------------------------------------------------------------------
 *  The browser suite is split by PRICE (scripts/tiers.mjs): a spec that costs more than a second
 *  stands in no PR and runs only on the nightly. MEASURED 2026-10-03: 127 of 135 spec files are
 *  that deep tier, and the scheduled CI run has not been green once since 2026-08-08 — every night
 *  a different one to six of them red, read by an issue (#275) that names the tests and nobody
 *  else. The price rule was right about cost and silent about the one question a change needs
 *  answered: «which of those 127 guard what I just touched?». Its only answer was a sentence in
 *  tiers.mjs — «find which specs those are by grepping tests/ for the file names, layer ids and API
 *  names the change touched» — i.e. a person, by hand, every time.
 *
 *  This file is that grep, done by the machine, in both directions, from the code itself:
 *
 *    reach(spec) = the source files a spec would notice changing, found from what the spec SAYS:
 *      ① PATHS     — a repo path it names (`../js/layer-manifest.js`, «js/data-layers.js» in a comment)
 *      ② GLOBALS   — a `window.IntMapX` it reads → the file(s) that ASSIGN that global
 *      ③ TOKENS    — a design identifier it spells (`dl-planes`, `lyr-radar`, `heldIds`,
 *                    `data-legend-ec-slp`) → the few files that spell it too
 *      ④ HELPERS   — a tests/helpers/ module it imports (the helper itself, not the helper's reach:
 *                    every spec imports network.js, and «everything reaches everything» selects nothing)
 *
 *  ⚠ A TOKEN COUNTS ONLY WHERE IT IS DISTINCTIVE. `map`, `layer`, `click` occur in hundreds of files;
 *  a token is a link only when it occurs in at most TOKEN_DF source files. That is a property of the
 *  token measured against the tree at the moment of asking — not a list of ignored words — so the
 *  next identifier anybody adds is classified the same way without anyone remembering to.
 *  ⚠ A «design identifier» is a token that is not a plain word: it carries a `-`, `_`, a digit or an
 *  inner capital. English in test titles («every», «layer») would otherwise link a spec to whichever
 *  single file happens to use the same word.
 *
 *  ⚠ THIS IS A STATIC ANSWER AND SAYS SO. It cannot see a spec that reaches a file only through the
 *  app's boot (every spec boots js/app-body.js; most never name it). So the reach RANKS — the
 *  suspects of a red night (scripts/nightly-blame.mjs) — and never decides: the verdict is measured
 *  by scripts/nightly-bisect.mjs, and no spec leaves or enters any tier because of it.
 *  ⚠ MEASURED AND REJECTED (2026-10-03): using the reach to stand the guarding deep specs in front of
 *  every PR. Over the last 80 merges on main, the deep specs whose reach a merge touched were a
 *  median 31 files / 1,292 s of serial browser time (p90 112 / 4,885 s); counting only paths and
 *  imports, still a median 5 / 76 s and p90 35 / 1,400 s. That is the suite #R203–#R207 took out of
 *  the gate at the user's insistence, put back by another door.
 *
 *      node scripts/spec-reach.mjs                     the reach of every spec (summary)
 *      node scripts/spec-reach.mjs tests/x.spec.js     one spec, with the evidence per file
 *      node scripts/spec-reach.mjs --guarding js/a.js  the specs whose reach contains these files
 *      node scripts/spec-reach.mjs --changed           …for this branch's diff: the deep specs to run before a push
 *      node scripts/spec-reach.mjs --json              the whole map
 * ==========================================================================*/
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '..');

/* ── the source tree a spec can reach ─────────────────────────────────────────────────────────
   The files the BROWSER runs and lays out: the app's modules, its entry points, its styles and its
   page. data/ is not here: its files are named by path when a spec cares (rule ①), and their bytes
   are data, not code a token could be defined in. */
export const SOURCE_DIRS = ['js', 'src', 'css'];
export const SOURCE_FILES = ['index.html', 'sw.js'];
const SOURCE_EXT = /\.(m?js|css|html)$/;

/* ⚠ TOKEN_DF — how many files may share a token before it stops pointing anywhere.
   OBSERVED 2026-10-03 on this tree (599 source files, 135 specs; `--df-histogram` and `--df-sweep`):
   the design identifiers the specs spell sit in 1 file (939 of them), 2 (738), 3 (381), 4 (261),
   5 (195), 6 (161) … — a long tail with no knee, so the threshold is set by what the reach is FOR,
   which is ranking a handful of suspects. As the bound grows, the median reach and the number of specs
   that «reach» js/map-ui.js (the shell every spec boots through) grow together:
       ≤1: 8 files, 30/135   ≤2: 12, 42   ≤3: 16, 52   ≤4: 20, 59   ≤6: 27, 70   ≤10: 43, 91
   At 3, `lyr-radar` (2 files), `heldIds` (1), `data-legend-ec-slp` (2) still count; past it the
   evidence printed beside a suspect becomes the shell's shared vocabulary, which says nothing about
   which merge broke the test.  EXPIRES when the tree's sharing changes shape — re-run `--df-sweep`.
   CANON: here, and only here (nightly-blame.mjs imports the reach, not the number). */
export const TOKEN_DF = 3;

const posixRel = (abs, root = ROOT) => relative(root, abs).split('\\').join('/');

function walk(dir, out) {
  let entries; try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else if (SOURCE_EXT.test(e)) out.push(p);
  }
  return out;
}

/** the source files, as repo-relative POSIX paths */
export function sourceFiles(root = ROOT) {
  const out = [];
  for (const d of SOURCE_DIRS) walk(join(root, d), out);
  for (const f of SOURCE_FILES) if (existsSync(join(root, f))) out.push(join(root, f));
  return out.map((p) => posixRel(p, root)).sort();
}

/* A design identifier: starts with a letter, 4–64 chars, and is not a plain word — it has a `-`, a
   `_`, a digit, or a lower→upper step (camelCase). Plain words are never tokens (see the header). */
const TOKEN = /[A-Za-z][A-Za-z0-9_-]{3,63}/g;
export function isDesignToken(t) {
  if (t.length < 4 || t.length > 64) return false;
  if (/^[-_]|[-_]$/.test(t)) return false;
  return /[-_0-9]/.test(t) || /[a-z][A-Z]/.test(t);
}
export function tokensOf(text) {
  const out = new Set();
  for (const m of String(text).matchAll(TOKEN)) if (isDesignToken(m[0])) out.add(m[0]);
  return out;
}

/* ② the globals a file ASSIGNS — `window.IntMapX = …`, `globalThis.IntMapX ||= …`,
   `Object.defineProperty(window, 'IntMapX', …)`. Reading one is not defining it. */
const DEF_GLOBAL = /\b(?:window|globalThis|self)\s*\.\s*(IntMap[A-Za-z0-9_]+)\s*(?:=(?!=)|\|\|=|\?\?=)|defineProperty\(\s*(?:window|globalThis|self)\s*,\s*['"](IntMap[A-Za-z0-9_]+)['"]/g;
const USE_GLOBAL = /\b(IntMap[A-Za-z0-9_]+)\b/g;

/** One pass over the source tree: which files define each global, which files spell each token. */
export function buildIndex(root = ROOT) {
  const files = sourceFiles(root);
  const globals = new Map();   // name  → Set<file>
  const tokens = new Map();    // token → Set<file>
  for (const f of files) {
    let text; try { text = readFileSync(join(root, f), 'utf8'); } catch { continue; }
    for (const m of text.matchAll(DEF_GLOBAL)) {
      const g = m[1] || m[2];
      if (!globals.has(g)) globals.set(g, new Set());
      globals.get(g).add(f);
    }
    for (const t of tokensOf(text)) {
      if (!tokens.has(t)) tokens.set(t, new Set());
      tokens.get(t).add(f);
    }
  }
  return { root, files: new Set(files), globals, tokens };
}

/* ① a path a spec names. Relative imports (anything the spec really imports, scripts/ included) are
   resolved against the spec; bare repo paths in strings and comments (`js/data-layers.js`) against the root — only what the BROWSER loads: a spec that
   mentions scripts/test-budget.mjs in a comment is talking about the suite, not about code it runs.
   Only paths that exist count. */
const IMPORT = /\b(?:import|from)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g;
const BARE_PATH = /(?:^|[^\w./-])((?:js|src|css|data|tests\/helpers)\/[\w./-]+\.(?:m?js|css|html|json|geojson|pbf|bin))/g;

/**
 * The reach of one spec.
 * @returns {{ spec:string, files:string[], why:Record<string,string[]> }}
 *   `why[file]` is the evidence: `path`, `import`, `global:IntMapX`, `token:lyr-radar`, `helper`.
 */
export function specReach(spec, index, { df = TOKEN_DF } = {}) {
  const root = index.root;
  const abs = join(root, spec);
  let text = ''; try { text = readFileSync(abs, 'utf8'); } catch { return { spec, files: [], why: {} }; }
  const why = new Map();
  const add = (file, reason) => {
    if (!file) return;
    if (!why.has(file)) why.set(file, new Set());
    why.get(file).add(reason);
  };
  for (const m of text.matchAll(IMPORT)) {
    const p = posix.normalize(posix.join(posix.dirname(spec), m[1]));
    if (!existsSync(join(root, p))) continue;
    add(p, p.startsWith('tests/helpers/') ? 'helper' : 'import');
  }
  for (const m of text.matchAll(BARE_PATH)) {
    const p = m[1].replace(/[.,;:]+$/, '');
    if (existsSync(join(root, p))) add(p, 'path');
  }
  for (const m of text.matchAll(USE_GLOBAL)) {
    const defs = index.globals.get(m[1]);
    if (defs && defs.size <= df) for (const f of defs) add(f, 'global:' + m[1]);
  }
  for (const t of tokensOf(text)) {
    if (/^IntMap[A-Z]/.test(t)) continue;                 /* globals are rule ②, not ③ */
    const fs = index.tokens.get(t);
    if (fs && fs.size <= df) for (const f of fs) add(f, 'token:' + t);
  }
  const files = [...why.keys()].sort();
  return { spec, files, why: Object.fromEntries(files.map((f) => [f, [...why.get(f)].sort()])) };
}

/** every spec file under tests/ (the same discovery tiers.mjs uses) */
export function specFiles(root = ROOT) {
  return readdirSync(join(root, 'tests')).filter((f) => f.endsWith('.spec.js')).map((f) => 'tests/' + f).sort();
}

let mapCache = null;
/** the reach of every spec, keyed by `tests/<name>.spec.js` */
export function reachMap(root = ROOT) {
  if (root === ROOT && mapCache) return mapCache;
  const index = buildIndex(root);
  const out = {};
  for (const s of specFiles(root)) out[s] = specReach(s, index);
  if (root === ROOT) mapCache = out;
  return out;
}

/**
 * The specs whose reach contains any of `changed` (repo-relative paths). A changed SPEC is not
 * selected here — tiers.mjs already stands every spec a change edited in the gate.
 * @returns {Array<{ spec:string, via:Array<{ file:string, why:string[] }> }>}
 */
export function specsGuarding(changed, map) {
  const set = new Set((changed || []).map((p) => String(p).replace(/\\/g, '/')));
  const out = [];
  for (const [spec, r] of Object.entries(map)) {
    const via = r.files.filter((f) => set.has(f)).map((f) => ({ file: f, why: r.why[f] }));
    if (via.length) out.push({ spec, via });
  }
  return out.sort((a, b) => a.spec.localeCompare(b.spec));
}

/* ── CLI ───────────────────────────────────────────────────────────────────────────────────── */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const t0 = Date.now();
  if (argv.includes('--df-histogram')) {
    /* the measurement behind TOKEN_DF: for the tokens the specs spell, how many files share each */
    const index = buildIndex();
    const hist = new Map();
    const seen = new Set();
    for (const s of specFiles()) for (const t of tokensOf(readFileSync(join(ROOT, s), 'utf8'))) {
      if (seen.has(t)) continue; seen.add(t);
      const n = (index.tokens.get(t) || new Set()).size;
      if (n) hist.set(n, (hist.get(n) || 0) + 1);
    }
    for (const n of [...hist.keys()].sort((a, b) => a - b).slice(0, 30)) console.log(String(n).padStart(4), hist.get(n));
    process.exit(0);
  }
  if (argv.includes('--df-sweep')) {
    /* the other half of the measurement: what each bound does to the median reach, and how many specs
       it ties to the shell (js/map-ui.js) — the figures quoted beside TOKEN_DF */
    const index = buildIndex();
    console.log(`${index.files.size} source files`);
    for (const df of [1, 2, 3, 4, 6, 10]) {
      const sizes = []; let shell = 0;
      for (const s of specFiles()) { const r = specReach(s, index, { df }); sizes.push(r.files.length); if (r.files.includes('js/map-ui.js')) shell++; }
      sizes.sort((a, b) => a - b);
      console.log(`  ≤${df}: median reach ${sizes[sizes.length >> 1]} file(s), ${shell}/${sizes.length} specs reach js/map-ui.js`);
    }
    process.exit(0);
  }
  const map = reachMap();
  if (argv.includes('--changed')) {
    /* the author's question before a push (tiers.mjs #R205: «before pushing a change to a surface the
       gate no longer covers, run the deep specs that guard it»), answered from this branch's diff */
    const { execFileSync } = await import('node:child_process');
    const lines = (a) => { try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').map((s) => s.trim()).filter(Boolean); } catch { return []; } };
    const changed = [...new Set([...lines(['diff', '--name-only', 'origin/main...HEAD']), ...lines(['diff', '--name-only', 'HEAD'])])];
    const { tierSpecs } = await import('./tiers.mjs');
    const deep = new Set(tierSpecs('deep', { fixed: true }));
    const hits = specsGuarding(changed, map).filter((h) => deep.has(h.spec) && !changed.includes(h.spec));
    console.log(`spec-reach: ${changed.length} changed file(s) → ${hits.length} deep spec(s) whose reach they are in`);
    for (const h of hits) console.log(`  ${h.spec}  ← ${h.via.map((v) => v.file).join(', ')}`);
    if (hits.length) console.log(`\n  IM_TIER=deep npx playwright test ${hits.map((h) => h.spec).join(' ')}`);
    process.exit(0);
  }
  const gi = argv.indexOf('--guarding');
  if (gi >= 0) {
    const hits = specsGuarding(argv.slice(gi + 1).filter((a) => !a.startsWith('--')), map);
    if (argv.includes('--json')) process.stdout.write(JSON.stringify(hits, null, 1) + '\n');
    else for (const h of hits) console.log(h.spec + '\n    ' + h.via.map((v) => `${v.file} (${v.why.slice(0, 4).join(', ')}${v.why.length > 4 ? ', …' : ''})`).join('\n    '));
    process.exit(0);
  }
  const one = argv.find((a) => a.endsWith('.spec.js'));
  if (one) {
    const r = map[one.replace(/\\/g, '/').replace(/^\.\//, '')];
    if (!r) { console.error(`spec-reach: no spec ${one}`); process.exit(2); }
    for (const f of r.files) console.log(`${f}\n    ${r.why[f].join(', ')}`);
    process.exit(0);
  }
  if (argv.includes('--json')) { process.stdout.write(JSON.stringify(map) + '\n'); process.exit(0); }
  const sizes = Object.values(map).map((r) => r.files.length).sort((a, b) => a - b);
  const med = sizes[Math.floor(sizes.length / 2)] || 0;
  const empty = sizes.filter((n) => n === 0).length;
  console.log(`spec-reach: ${sizes.length} specs · median reach ${med} file(s) · ${empty} with an empty reach · ${Date.now() - t0} ms`);
  for (const [s, r] of Object.entries(map)) console.log(`  ${String(r.files.length).padStart(3)}  ${s}`);
}
