/*
 * IntMap · gate-universe — WHICH GATES EXIST, AND HOW ONE OF THEM IS RUN  (gate-parity-and-shards)
 *
 *  ══ WHY THIS IS A FILE OF ITS OWN ══════════════════════════════════════════════════════════════
 *  Two runners execute the declared gates: scripts/ci-gates.mjs (CI, packed onto three machines) and
 *  scripts/test-parallel.mjs (`npm test`, on the developer's own machine). MEASURED 2026-09-29: the
 *  first DISCOVERED its gates from package.json's `check:*`; the second carried a HAND-WRITTEN list,
 *  and eight of the thirty-one declared gates were in the first and not the second —
 *  check:histeras, check:histnames, check:histfill, check:bordercoast, check:perf, check:assets,
 *  check:surface and check:types. AGENTS.md §4 says «push 前に CI と同じ門をローカルで通す», and
 *  `npm test` could not do it: a gate added to package.json reached CI the same day and the local
 *  run never.
 *  The discovery is therefore written ONCE, here, and both runners import it. A copy in each would
 *  be the shape .agents/rules/no-ad-hoc-hardcoding.md §2-3 names: the same judgement in two places,
 *  drifting in two directions.
 *
 *  ══ WHAT IS SHARED ══════════════════════════════════════════════════════════════════════════════
 *    declaredGates()   the universe — package.json `check:*`, sorted (the order CI packs by)
 *    gatesInDeclaredOrder()   the same set in the order package.json declares it (the order
 *                      `npm test` runs by: the acorn gates are declared first, so a parse error is
 *                      reported before the gates it would otherwise make fail for no stated reason)
 *    scriptFileOf(g)   the scripts/*.mjs a gate runs
 *    needsBuild(g)     whether a gate reads what `npm run build` wrote (discovered from its script)
 *    gateCommand(g)    [cmd, args] that runs the gate without an npm process in between
 *    gateEnv(env)      the environment a gate runs in: every outbound connection refused
 *                      (scripts/no-network.mjs) — a gate proves committed bytes, never a live upstream
 *    lpt(items, n)     longest-processing-time-first packing, deterministic
 *    medianOf(values)  the cost charged to an item no ledger has measured yet
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const BUILD = 'npm run build';

/* (histrecon-check-no-network) A GATE RUNS WITH THE NETWORK REFUSED. MEASURED 2026-10-06: PR #1022, an
   unrelated infra change, went red on CI run 37406113749 (Gates 2/3, Regression 3/3) because
   check:histrecon fetched the RISTAT 1897 districts from dataverse.nl and got HTTP 504 — a third
   party's outage became a merge gate. The rule is attached to the FACT (every declared gate), not to
   that one script: both runners hand every gate this environment, so a gate that reaches the network
   fails on every run and every machine, not only on the day the upstream is down. Loopback stays open.
   MEASURED the same day: all 35 declared gates (check:perf and check:assets after a build) passed this way with
   no refusal. The build itself (`npm run build`) is not a gate and is not handed this. */
export const NO_NETWORK = new URL('./no-network.mjs', import.meta.url).href;
export function gateEnv(env = process.env) {
  const opts = String(env.NODE_OPTIONS || '');
  if (opts.split(/\s+/).includes('--import=' + NO_NETWORK)) return { ...env };
  return { ...env, NODE_OPTIONS: (opts ? opts + ' ' : '') + '--import=' + NO_NETWORK };
}

/* A gate reads the build output if its own script names dist/ or the build report as a path. The
   spellings below are the ones this repository actually uses. MEASURED 2026-09-17 (#R771): they find
   exactly {check:perf, check:assets}. EXPIRES the day a gate reads the build output by a path this
   cannot see — and that failure is loud (the gate runs without dist/ and fails on its own terms), so
   the fix is to let the path be visible in the gate, not to add the gate to a list anywhere. */
export const READS_BUILD = /join\(\s*ROOT\s*,\s*'(dist|\.perf)'|'\.perf'\s*,\s*'build-report\.json'|readFileSync\([^)]*build-report/;

export function pkgScripts({ root = ROOT } = {}) {
  return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts || {};
}

/** The declared universe, sorted. Nothing else is a gate. */
export function declaredGates({ root = ROOT } = {}) {
  return gatesInDeclaredOrder({ root }).slice().sort();
}

/** The same universe in package.json's own order (object key order is insertion order for these). */
export function gatesInDeclaredOrder({ root = ROOT } = {}) {
  return Object.keys(pkgScripts({ root })).filter((s) => /^check:/.test(s));
}

export function scriptFileOf(gate, { root = ROOT } = {}) {
  const m = String(pkgScripts({ root })[gate] || '').match(/scripts\/[\w.-]+\.mjs/);
  return m ? join(root, m[0]) : null;
}

export function needsBuild(gate, { root = ROOT } = {}) {
  const f = scriptFileOf(gate, { root });
  if (!f || !existsSync(f)) return false;
  return READS_BUILD.test(readFileSync(f, 'utf8'));
}

/**
 * How to run a gate. A script of the plain form `node <file> [--flags]` is run as node directly —
 * one process instead of two, which is what `npm test` always did for its gates. Anything else (a
 * shell operator, a quote, an environment assignment) goes through `npm run <gate>`, because only
 * the shell can say what that string means; the gate still runs, it just costs an npm start-up.
 * @returns {[string, string[]]}
 */
export function gateCommand(gate, { root = ROOT } = {}) {
  /* word by word, not one pattern over the whole string: a repeated group with overlapping
     alternatives backtracks exponentially on a long non-matching script (CodeQL js/redos) */
  const [head, file, ...flags] = String(pkgScripts({ root })[gate] || '').trim().split(/\s+/);
  if (head === 'node' && /^[\w./-]+\.m?js$/.test(file || '') && flags.every((w) => /^--?[\w=:.-]+$/.test(w))) {
    return ['node', [file, ...flags]];
  }
  return [process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', gate]];
}

/** The cost charged to an unmeasured item: the median of what IS measured — never 0, which would
    pile every new item onto one machine, and never the maximum, which would spread them at the
    others' expense. `fallback` answers only when nothing at all has been measured. */
export function medianOf(values, fallback) {
  const known = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  return known.length ? known[Math.floor(known.length / 2)] : fallback;
}

/**
 * Longest-processing-time-first greedy: costs descending, each item onto the currently lightest bin.
 * DETERMINISTIC — ties are broken by `key`, and the lightest bin by its index — so the same inputs
 * produce the same plan on every runner, which is what lets N machines each compute only their own
 * bin and still partition the set between them.
 * @template T
 * @param {T[]} items
 * @param {number} n
 * @param {(t: T) => number} cost
 * @param {(t: T) => string} key
 * @returns {{ items: T[], cost: number }[]}
 */
export function lpt(items, n, cost, key) {
  const bins = Array.from({ length: n }, () => ({ items: [], cost: 0 }));
  const order = [...items].sort((a, b) => cost(b) - cost(a) || key(a).localeCompare(key(b)));
  for (const t of order) {
    const bin = bins.reduce((lo, b) => (b.cost < lo.cost ? b : lo), bins[0]);
    bin.items.push(t);
    bin.cost += cost(t);
  }
  return bins;
}
