/* ============================================================================
 *  IntMap · THE STARTUP BUDGET  (#R311)
 * ----------------------------------------------------------------------------
 *  「現在のCIでは、3,000KB超chunkを検出しても成功扱いになる構成があります。」 — measured, and true:
 *  before this file the ONLY thing CI weighed was TEST TIME (scripts/test-budget.mjs). Not one byte
 *  of the deploy was under a gate. `vite build` printed «Some chunks are larger than 3000 kB» on
 *  every single run and exited 0, which is the same as printing nothing.
 *
 *  ── WHY IT IS NOT "ONE NUMBER FOR THE BIGGEST CHUNK" ───────────────────────────────────────────
 *  「async chunkは、大きいこと自体を即失敗条件にしないでください。」 The largest chunk in this repo is
 *  Cesium at 4.7 MB and a MapLibre session never asks for it. A gate that failed on "biggest chunk"
 *  would be loudest about the one number that costs a default session nothing, and silent about a
 *  hundred kilobytes moving INTO the entry — which is the only thing that actually slows start-up.
 *  So the two halves are weighed separately, out of the graph Rollup finished with
 *  (scripts/build-report.mjs):
 *
 *    EAGER — the half that is start-up. It may not grow past its ceiling without someone deciding to
 *            raise it; that is the only thing a pull request can fail here.
 *    ASYNC — per-chunk as well as in total, so a heavy feature cannot double while the total hides
 *            it behind another that shrank.
 *    DEPLOY — the dist/ totals, the same way.
 *
 *  ── (perf-baseline-auto-tighten) WHO LOWERS A CEILING: MAIN'S CI, NOT THE PULL REQUEST ─────────
 *  Until 2026-10-01 the eager half was a ratchet IN BOTH DIRECTIONS inside the pull request: an
 *  improvement past a 4 % band failed too, and `requests` / `modules` had to match exactly, so every
 *  pull request that changed the start-up graph — in EITHER direction — had to rewrite
 *  tests/perf-baseline.json. Measured 2026-09-30: that file was the conflict of four to five parallel
 *  pull requests in one day, and each rebase meant a fresh build and `--update` (which rewrote EVERY
 *  row, so two PRs that touched different rows still collided on all of them).
 *  The rule #R194 set down — «a ceiling that does not follow the measurement asserts nothing» — is
 *  kept; what moved is WHO makes it follow:
 *    · a PULL REQUEST fails only when a number GREW past its ceiling (the band below). Shrinking, or
 *      moving inside the band, is green with the ceiling file untouched. Raising a ceiling is the one
 *      decision a pull request states, with `--update`, which now raises ONLY the rows that are over
 *      and touches nothing else.
 *    · MAIN'S CI lowers every ceiling the tree has fallen below: after each push to main,
 *      .github/workflows/perf-ceiling.yml takes that run's measurement, runs `--tighten` and lands
 *      the result as a bot pull request (.github/actions/land-bot-pr, the lander tle-refresh uses).
 *      A ceiling therefore stays above reality for at most one push-to-main cycle, and the most a
 *      later pull request can grow without deciding to is the band — never the band PLUS whatever
 *      some earlier pull request happened to free up.
 *  Counts are judged in the same frame with a band of zero: one more module fails, one fewer is
 *  green and followed on main.
 *
 *  ── AND BOTH raw AND gzip, BECAUSE THEY ARE DIFFERENT COSTS ────────────────────────────────────
 *  「gzipだけ見てraw parse負荷を無視する / rawだけ見て転送量を無視する」 are both listed as forbidden.
 *  gzip and brotli are what the network costs; raw is what the parser and compiler cost, and on a
 *  phone that second number is the one that shows up as a frozen screen. Both are gated.
 *
 *  ── WHAT IS DELIBERATELY NOT HERE ──────────────────────────────────────────────────────────────
 *  First map pixel, interaction-ready, long tasks and heap are NOT in this gate. They need a browser
 *  and they are genuinely noisy, and a flaky gate in front of every push teaches people to re-run it
 *  rather than to read it. 「毎回重すぎる場合は軽量gateと定期full profileを分ける」 — so the bytes
 *  (deterministic: same tree, same numbers) stand in front of every push, and the runtime numbers are
 *  measured by scripts/frame-profile.mjs on the nightly deep tier, where a slow run costs nobody a
 *  merge. docs/TESTING.md says which is which.
 *
 *  USAGE
 *    node scripts/perf-budget.mjs            check .perf/build-report.json against the baseline
 *    node scripts/perf-budget.mjs --report   print the table without judging
 *    node scripts/perf-budget.mjs --update   RAISE the ceilings the measurement is over, to the
 *                                            measurement — and touch no other row (the decision a
 *                                            pull request states; say why in its dev-notes entry)
 *    node scripts/perf-budget.mjs --tighten [--measured <file>] [--summary <file>]
 *                                            LOWER every ceiling the measurement has fallen below,
 *                                            record new chunks, drop gone ones; never raises. What
 *                                            main's CI runs (.github/workflows/perf-ceiling.yml);
 *                                            --measured reads a --report JSON instead of measuring
 * ==========================================================================*/
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
/* (locale-on-demand) the ONE answer to «which language is the fallback every other table chains onto» —
   asked of the registry the app runs, not typed here. Pure at import: no window, no document. */
import { IntMapLang } from '../js/lang-registry.js';
/* (perf-measure-parity) the build stamp names the commit a dist/ was built from — the one parser of it */
import { STAMP_RE } from './build-stamp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = join(ROOT, '.perf', 'build-report.json');
const BASELINE = join(ROOT, 'tests', 'perf-baseline.json');
const DIST = join(ROOT, 'dist');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);

/* ── the band ──────────────────────────────────────────────────────────────
   A build is deterministic — the same tree produces the same bytes — so there is no measurement
   noise to absorb here and the band is not for noise. It is for CHURN: a comment, a renamed
   variable or a minifier bump moves a few hundred bytes, and a gate that fired on that would be
   edited to be ignored within a month. Anything past it is a decision someone made.
   ⚠ ONE BAND, BOTH USES. It is how far a pull request may grow without deciding to, and it is how far
   below its ceiling a number may sit before main's CI lowers the ceiling (`tighten`). Two numbers
   would be two answers to one question — «how much movement is churn» — and the looseness bound
   below is stated in terms of this one: once main's CI has run, no ceiling sits more than one band
   above the tree, so the growth a pull request can slip in without deciding to is at most two
   bands — the band it is allowed, plus at most one band of headroom the bot left in place.
   (The 4 % / 16 kB «stale» band the eager half used to fail pull requests on is gone with the rule
   it served; see the header.) */
export const GROW = { rel: 0.005, abs: 2048 };     /* above ceiling × 1.005, or +2 kB, whichever is larger */
/* ⚠ …AND TWO OF THE METRICS ARE NOT MEASURED IN BYTES. `requests` (6) and `modules` (275) are
   counts, and a byte-sized slack swallows them whole: 6 > 6 + max(2048, 0.03) is false for every
   value a count can take, so both rows would have sat in the table looking gated while being
   incapable of failing — the exact shape of defect #R301 found in two whole suites. Their band is
   ZERO: one more fails, one fewer is followed on main. A count is deterministic, and a module
   entering the eager graph is precisely the event this budget exists to notice. */
export const COUNTS = new Set(['requests', 'modules']);
/** The churn band for one metric, in its own unit. */
export const band = (k, ceil) => (COUNTS.has(String(k).trim()) ? 0 : Math.max(GROW.abs, ceil * GROW.rel));
/* (perf-measure-parity) …AND A COUNT IS ALSO MERGED AS A COUNT. tests/perf-baseline.json is declared to
   scripts/merge-driver.mjs with `intmap-clash=upstream intmap-clash-by=scripts/perf-budget.mjs`: a byte row
   both sides moved is a MEASUREMENT and takes main's value (and the merge asks for a rebuild), but a count
   both sides moved is two events. MEASURED 2026-10-02: #886 and #887 each raised eager.modules 299 → 300
   for a module of its own, and with both landed main measured 301 against a ceiling of 300 — taking
   either side's 300 (or seeing «both wrote 300» as agreement) dropped one of the two decisions. The
   driver asks this function, per row, rather than holding a second list of which rows count. */
/** The clash rule for the row at `keys` of the baseline: 'sum' for a count, null for the file's default. */
export const mergeClash = (keys) => (Array.isArray(keys) && keys.length === 2 && keys[0] === 'eager' && COUNTS.has(String(keys[1])) ? 'sum' : null);

function dirBytes(p) {
  let n = 0;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const f = join(d, e.name);
      if (e.isDirectory()) walk(f); else n += statSync(f).size;
    }
  };
  if (existsSync(p)) walk(p);
  return n;
}

/* The measurement: the build graph plus what actually landed in dist/. The second half matters
   because the biggest thing this repo deploys is not JavaScript at all — data/ is 68 MB of the
   118 MB tree, and none of it passes through Rollup, so the build report cannot see it. */
function measure() {
  if (!existsSync(REPORT)) {
    /* ⚠ the message names the package.json script rather than spelling the command: CI's `build` job
       now runs this file (--report, for perf-ceiling.yml), and tests/ci-build-once-checks.test.mjs ①
       counts a step as a SECOND BUILD when the code of the script it runs spells the build command. */
    console.error(`perf-budget: no build report at ${relative(ROOT, REPORT)} — build the site first (the package.json "build" script writes it).`);
    process.exit(1);
  }
  const r = JSON.parse(readFileSync(REPORT, 'utf8'));
  /* ⚠ the locale rule below reads the eager graph's MODULES; a report without them would make that rule
     silently assert nothing (#R301's shape), so the gate refuses to run on one instead */
  if (!Array.isArray(r.eager && r.eager.chunks) || !r.chunks) {
    console.error(`perf-budget: ${relative(ROOT, REPORT)} does not list the eager chunks and their modules — rebuild with the current scripts/build-report.mjs.`);
    process.exit(1);
  }
  return measureFrom(r, DIST);
}

/* ══ (locale-on-demand) WHICH LANGUAGES START-UP READS ═══════════════════════════════════════════
   「起動時に読者の言語以外の locale を読んだら赤」. src/locale-boot.js globs js/locales/ui.*.js LAZILY,
   so every language but the fallback is its own async chunk and the reader's own one is fetched on the
   boot barrier (js/app-body.js). The fallback is eager because it is the PROTOTYPE every other table
   chains onto (js/i18n.js) — it has to exist before anything reads a key.
   Measured 2026-10-02 (dist/, this rule's first build): eager holds ui.en (19,238 B rendered) and
   nothing else; an en reader fetches no locale chunk, a jp reader one of 21,846 B, an fr reader one of
   446,528 B — and a switch fetches exactly the target's chunk. A static import of any other locale
   (one line in src/main.js, or `{eager:true}` on the glob) would put up to 450 kB per language back on
   every session's critical path, and the byte ceilings would only see it as «grew». This names it.
   Codes come from the module paths; the fallback from the registry. Returns null when the report
   carries no module lists (the synthetic reports some checks hand measureFrom). */
export const LOCALE_MODULE = /^js\/locales\/ui\.([A-Za-z0-9-]+)\.js$/;
export function eagerLocales(r) {
  if (!r || !r.eager || !Array.isArray(r.eager.chunks) || !r.chunks) return null;
  const out = {};
  for (const f of r.eager.chunks) {
    for (const [id, n] of Object.entries((r.chunks[f] && r.chunks[f].modules) || {})) {
      const mm = LOCALE_MODULE.exec(id);
      if (mm) { const c = mm[1].toLowerCase(); out[c] = (out[c] || 0) + (n || 0); }
    }
  }
  return out;
}
/** The errors the locale rule finds in one measurement (empty when it holds or was not measured). */
export function localeErrors(locales, LANG = IntMapLang) {
  if (!locales) return [];
  const fb = LANG.FALLBACK, codes = Object.keys(locales);
  const others = codes.filter((c) => LANG.normalise(c) !== fb);
  const errs = [];
  if (others.length) {
    errs.push(`start-up reads locale(s) other than the fallback: ${others.map((c) => `ui.${c} (${kb(locales[c])})`).join(', ')}. `
      + `Only "${fb}" (the table every other one chains onto) may be eager; the reader's own language is fetched on the boot barrier `
      + `and every other one on a switch (src/locale-boot.js). Make the import dynamic.`);
  }
  if (!codes.some((c) => LANG.normalise(c) === fb)) {
    errs.push(`the fallback locale ui.${fb} is not in the start-up graph — every other table chains onto it per key (js/i18n.js, `
      + `js/lang-registry.js keyed()), so it must be present before anything reads a key.`);
  }
  return errs;
}

/** The measurement from a build report and a dist/ directory — exported so a test can hand it a
    synthetic report and a directory it wrote, and judge the numbers the gate would see. */
export function measureFrom(r, distDir) {
  const asyncChunks = {};
  for (const f of r.async.chunks) {
    /* keyed by the chunk's NAME, not its hashed filename — the hash changes on every content
       change and a baseline keyed by it would be stale by construction. */
    const c = r.chunks[f];
    asyncChunks[c.name] = Math.max(asyncChunks[c.name] || 0, c.raw);
  }
  return {
    eagerLocales: eagerLocales(r),
    eager: {
      raw: r.eager.raw, gzip: r.eager.gzip, brotli: r.eager.brotli,
      requests: r.eager.requests, modules: r.eager.modules,
      cssRaw: r.eager.css.raw, cssGzip: r.eager.css.gzip,
    },
    async: { raw: r.async.raw, gzip: r.async.gzip, chunks: asyncChunks },
    dist: { total: dirBytes(distDir), data: dirBytes(join(distDir, 'data')), assets: dirBytes(join(distDir, 'assets')) },
  };
}

/* ══ (perf-measure-parity) WHICH TREE THIS IS A MEASUREMENT OF ═════════════════════════════════════
   MEASURED 2026-10-01/02: five pull requests in a row were green here and red in CI on eager.brotli
   (sometimes gzip, async), and each one raised its ceiling by hand to CI's number. The carriage returns
   of this machine's checkout were suspected and are NOT the cause of those rows: the same commit built
   from a CRLF and an LF checkout gives byte-identical eager and async halves, equal to CI's to the byte
   (9e0662a9; the CRLF did reach dist/ through the verbatim copies — .gitattributes `* text=auto eol=lf`).
   The cause is WHICH TREE is built. A pull_request run checks out refs/pull/N/merge — «Merge <head>
   into <main as it is now>» (every CI log says so on its `HEAD is now at` line) — while a local build is
   the branch. Reproduced on #872: its head 22df7e01 built here to brotli 1134.3 kB; the merge CI built
   (22df7e01 into 2bacd112, one commit of main the branch did not have) builds here to 1135.5 kB, which
   is CI's number exactly (raw 4580.1 kB and gzip 1505.1 kB too). And `--update` raises only what THIS
   measurement is over, so it accepted the branch's growth and not the merge's.
   So the measurement says which tree it is of: the commit the build stamp in dist/index.html names
   (a dist/ built before a rebase is not a measurement of the rebased tree), and whether that commit
   contains origin/main (if not, CI is going to build something else). A judgement prints the gap;
   `--update` refuses to write a ceiling from it. In CI there is nothing to compare against — the run
   IS the reference — and a checkout without git or without a stamp is said to be unknowable, not
   assumed to be fine. ⚠ The bound is the moment of the fetch: main can still move before CI runs. */
const gitIn = (cwd, args) => {
  try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 20000 }).trim(); }
  catch { return null; }
};
/** The commit a dist/ was built from: the sha in its build stamp, or null when it carries none. */
export function builtFrom(distDir = DIST) {
  const f = join(distDir, 'index.html');
  if (!existsSync(f)) return null;
  for (const m of readFileSync(f, 'utf8').matchAll(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z-(?:[0-9a-f]{7,40}|nogit)/g)) {
    const s = STAMP_RE.exec(m[0]);
    if (s) return s[2] === 'nogit' ? null : s[2];
  }
  return null;
}
/** What git says about the tree a measurement is of. `fetch` asks origin first (best effort). */
export function treeState({ cwd = ROOT, distDir = DIST, env = process.env, fetch = false } = {}) {
  if (env.GITHUB_ACTIONS === 'true') return { ci: true };
  const head = gitIn(cwd, ['rev-parse', 'HEAD']);
  let fetched = null;
  if (fetch && head) fetched = gitIn(cwd, ['fetch', '--quiet', 'origin', 'main']) !== null;
  const main = head && gitIn(cwd, ['rev-parse', '--verify', '--quiet', 'refs/remotes/origin/main']);
  const behind = main ? Number(gitIn(cwd, ['rev-list', '--count', `HEAD..${main}`])) : null;
  return { ci: false, head, built: builtFrom(distDir), main: main || null, behind: Number.isFinite(behind) ? behind : null, fetched };
}
/** The reasons this measurement is not of the tree CI will measure (empty when it is). Pure. */
export function parityProblems(s) {
  if (!s || s.ci) return [];
  const out = [];
  if (!s.head) return ['this is not a git checkout — which tree CI will build cannot be known here'];
  if (!s.built) out.push('dist/index.html carries no build stamp with a commit — which commit this build is of cannot be known; rebuild (the package.json "build" script)');
  else if (!s.head.startsWith(s.built)) out.push(`dist/ was built from ${s.built}, and HEAD is ${s.head.slice(0, s.built.length)} — this measurement is of a tree that is no longer checked out; rebuild`);
  if (!s.main) out.push('there is no origin/main here — CI builds this branch merged into main, and which main cannot be known; git fetch origin main');
  else if (s.behind > 0) {
    out.push(`origin/main has ${s.behind} commit(s) this branch does not — CI builds «Merge HEAD into origin/main», not this tree; `
      + 'git rebase origin/main (then node scripts/merge-driver.mjs --finish), rebuild, and measure again');
  }
  return out;
}

const kb = (n) => (n / 1024).toFixed(1) + ' kB';
/* ⚠ COUNTS ARE NOT BYTES. `requests` and `modules` are integers, and printing «6» as «0.0 kB»
   makes the one row that says how many round-trips a cold start costs unreadable. The label is
   trimmed before the test because the table indents nested rows. */
const fmt = (k, n) => { const t = String(k).trim(); return (t === 'requests' || t === 'modules') ? String(n) : kb(n); };

/* ── every gated number, once ──────────────────────────────────────────────
   The gate, the raise and the tighten all walk THIS list, so a row cannot be judged by one of them
   and forgotten by another. `key` decides the band (a count or bytes); `path` is where the ceiling
   lives in the baseline. Async chunks are listed from BOTH sides: a chunk only the baseline has is
   gone, a chunk only the build has is new — neither has a pair of numbers to judge. */
export function metrics(m, b) {
  const out = [];
  const add = (section, path, key, v, ceil) => out.push({ section, path, key, v: v == null ? null : v, ceil: ceil == null ? null : ceil });
  for (const k of Object.keys(b.eager)) add('eager', ['eager', k], k, m.eager[k], b.eager[k]);
  for (const k of ['raw', 'gzip']) add('async', ['async', k], k, m.async[k], b.async[k]);
  const bc = b.async.chunks || {}, mc = m.async.chunks || {};
  for (const name of [...new Set([...Object.keys(bc), ...Object.keys(mc)])].sort()) {
    add('chunk', ['async', 'chunks', name], 'bytes', mc[name], bc[name]);
  }
  for (const k of ['total', 'data', 'assets']) add('dist', ['dist', k], 'bytes', m.dist[k], b.dist[k]);
  return out;
}
const label = (x) => (x.section === 'chunk' ? `async chunk "${x.path[2]}"` : x.path.join('.'));
/** The number a pull request may reach without deciding to. */
export const limit = (key, ceil) => ceil + band(key, ceil);
const over = (x) => x.v != null && x.ceil != null && x.v > limit(x.key, x.ceil);
/** Below its ceiling by more than the band — main's CI lowers it. Counts: below at all. */
const due = (x) => x.v != null && x.ceil != null && x.ceil - x.v > band(x.key, x.ceil);

/* ── the policy, as pure functions ─────────────────────────────────────────
   Exported so a test can drive them with synthetic numbers. A gate that is only ever exercised by
   the tree it guards has never been shown to FAIL, and this project has shipped several checks
   that were green because they asserted nothing (#R301 found two suites that had never run at
   all). tests/perf-startup-and-cache-checks.test.mjs (#R311) and
   tests/perf-baseline-auto-tighten-checks.test.mjs drive all three.

   judge() — what a pull request is held to. ONE direction: a number over its ceiling plus the band
   is an error. Everything else — a number that fell, a chunk that is new or gone — is a NOTE saying
   main's CI will follow it, because a pull request that made start-up cheaper must not be the one
   that has to edit the shared ceiling file to stay green.
   `loose` lists every ceiling that sits above the measurement, by how much and in how many bands;
   `slackest` is the row loosest in BANDS (a count above its measurement at all is infinitely loose,
   its band being zero) with the growth it would still let through undecided (`by` + band) — what
   «the ratchet went slack» looks like as a number. Bands, not bytes, because a 3.7 MB band on
   dist.total and a 2 kB band on a chunk are the same amount of «churn». */
export function judge(m, b) {
  const errors = [], notes = [], rows = [], loose = [];
  let section = null, slackest = null;
  const titles = { eager: 'EAGER — start-up', async: 'ASYNC — totals', chunk: 'ASYNC — per chunk (rows over their ceiling)', dist: 'DEPLOY — dist/' };
  for (const x of metrics(m, b)) {
    if (x.section !== section) { section = x.section; rows.push([titles[section], null, null]); }
    if (x.ceil == null) { notes.push(`new ${label(x)} (${fmt(x.key, x.v)}) — main's CI records its ceiling after the merge`); continue; }
    if (x.v == null) {
      if (x.section === 'chunk') notes.push(`${label(x)} is gone from the build — main's CI drops its ceiling after the merge`);
      else errors.push(`${label(x)} was not measured — the build report no longer carries it`);
      continue;
    }
    if (x.section !== 'chunk' || over(x)) rows.push(['  ' + x.path[x.path.length - 1], x.v, x.ceil, x.key]);
    if (over(x)) {
      errors.push(`${label(x)} grew: ${fmt(x.key, x.v)} > ceiling ${fmt(x.key, x.ceil)} (band ${fmt(x.key, band(x.key, x.ceil))}). A cost that goes up needs a reason — say it in this round's dev-notes entry and raise it in this pull request: node scripts/perf-budget.mjs --update (it raises only the rows that are over). Or take it back out.`);
    } else if (x.v < x.ceil) {
      const bd = band(x.key, x.ceil), by = x.ceil - x.v;
      const l = { what: label(x), key: x.key, v: x.v, ceil: x.ceil, by, bands: bd > 0 ? by / bd : Infinity, undecided: by + bd, due: due(x) };
      loose.push(l);
      if (!slackest || l.bands > slackest.bands) slackest = l;
    }
  }
  for (const e of localeErrors(m.eagerLocales)) errors.push(e);
  const dueN = loose.filter((l) => l.due).length;
  if (dueN) notes.push(`${dueN} ceiling(s) sit more than their band above this build — green: main's CI lowers them after the merge (.github/workflows/perf-ceiling.yml). Nothing to edit here.`);
  return { errors, notes, rows, loose, slackest };
}

const clone = (o) => JSON.parse(JSON.stringify(o));
const setAt = (o, path, v) => { let t = o; for (const p of path.slice(0, -1)) t = t[p] ??= {}; t[path[path.length - 1]] = v; };
const sortChunks = (b) => { const c = b.async.chunks || {}; b.async.chunks = Object.fromEntries(Object.keys(c).sort().map((k) => [k, c[k]])); return b; };

/* tighten() — what main's CI does, and the only thing that lowers a ceiling. NEVER RAISES: every
   row becomes min(ceiling, measured). It proposes a change only when something is DUE (a row more
   than its band below, a count below at all, a chunk new or gone) — a bot pull request for every
   few hundred bytes of churn would be a merge per push for nothing — but once it proposes, it
   lowers every row, so after it lands no ceiling sits above the tree it measured.
   A new chunk gets a ceiling (until now it was judged only inside the async total); a gone chunk
   loses its row (a ceiling nothing is measured against asserts nothing). */
export function tighten(m, b) {
  const next = clone(b), changes = [];
  let dueAny = false;
  for (const x of metrics(m, b)) {
    if (x.ceil == null) { setAt(next, x.path, x.v); changes.push({ what: label(x), key: x.key, from: null, to: x.v }); dueAny = true; continue; }
    if (x.v == null) {
      if (x.section !== 'chunk') continue;                     /* an unmeasured total is judge()'s error, not a row to drop */
      delete next.async.chunks[x.path[2]];
      changes.push({ what: label(x), key: x.key, from: x.ceil, to: null }); dueAny = true; continue;
    }
    if (x.v < x.ceil) {
      setAt(next, x.path, x.v); changes.push({ what: label(x), key: x.key, from: x.ceil, to: x.v });
      if (due(x)) dueAny = true;
    }
  }
  if (!dueAny) return { due: false, baseline: b, changes: [] };
  return { due: true, baseline: sortChunks(next), changes };
}

/* raise() — what `--update` does in a pull request: the rows that are OVER go up to the
   measurement, and not one other row is written. The old `--update` rewrote the whole file from the
   build, so two pull requests that each accepted one row still collided on every row. */
export function raise(m, b) {
  const next = clone(b), changes = [];
  for (const x of metrics(m, b)) {
    if (!over(x)) continue;
    setAt(next, x.path, x.v); changes.push({ what: label(x), key: x.key, from: x.ceil, to: x.v });
  }
  return { baseline: next, changes };
}

const change = (c) => `${c.what}: ${c.from == null ? '(none)' : fmt(c.key, c.from)} → ${c.to == null ? '(dropped)' : fmt(c.key, c.to)}`;

function main() {
  const m = measure();
  if (!existsSync(BASELINE)) {
    writeFileSync(BASELINE, JSON.stringify(m, null, 2) + '\n');
    console.log(`perf-budget: no baseline yet — wrote ${relative(ROOT, BASELINE)} from this build.`);
    return 0;
  }
  const b = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const { errors, notes, rows, loose, slackest } = judge(m, b);

  console.log('\nIntMap · startup budget                    measured        ceiling        Δ');
  console.log('  ───────────────────────────────────────────────────────────────────────────');
  for (const [lbl, v, ceil, key] of rows) {
    if (v == null) { console.log('  ' + lbl); continue; }
    const d = v - ceil;
    console.log(`  ${lbl.padEnd(26)}${fmt(key, v).padStart(12)}${fmt(key, ceil).padStart(15)}   ${d > 0 ? '+' : ''}${fmt(key, d)}`);
  }
  /* (perf-baseline-auto-tighten) THE SLACK, PRINTED EVERY RUN. The gate no longer fails on it, so it
     has to be visible instead: how many ceilings sit above this build, and the largest growth any row
     would still let through without a decision. On a pull request that shrank something this is
     expected; on main, once perf-ceiling.yml has landed, no row is more than one band loose. */
  const dueRows = loose.filter((l) => l.due);
  console.log(`\n  slack: ${loose.length} ceiling(s) above this build, ${dueRows.length} by more than their band`
    + (slackest ? ` · slackest: ${slackest.what}, ${fmt(slackest.key, slackest.by)} above (${Number.isFinite(slackest.bands) ? slackest.bands.toFixed(2) + ' bands' : 'a count'}; lets ${fmt(slackest.key, slackest.undecided)} grow undecided)` : ''));
  for (const l of dueRows.slice(0, 8)) console.log(`    ${l.what}: ${fmt(l.key, l.v)} under ${fmt(l.key, l.ceil)} (−${fmt(l.key, l.by)})`);
  if (dueRows.length > 8) console.log(`    … and ${dueRows.length - 8} more`);

  if (m.eagerLocales) console.log(`  eager locales: ${Object.entries(m.eagerLocales).map(([c, n]) => `ui.${c} ${kb(n)}`).join(', ') || '(none)'}`);
  for (const n of notes) console.log(`\n  note: ${n}`);
  /* (perf-measure-parity) a verdict about a tree CI will not build is said to be one. It does not change
     the verdict (main having moved is not this pull request's regression), but it is the gap a green run
     here and a red one in CI fell into five times. */
  for (const p of parityProblems(treeState())) console.log(`\n  ⚠ not the tree CI measures: ${p}`);
  if (errors.length) {
    console.error('\nperf-budget FAILED:');
    for (const e of errors) console.error('  · ' + e);
    console.error('');
    return 1;
  }
  console.log('\nperf-budget: within budget.\n');
  return 0;
}

const argOf = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const TIGHTEN_SUMMARY = (changes) => [
  "The start-up budget's ceilings, lowered to what main measured (`node scripts/perf-budget.mjs --tighten`,",
  'run by `.github/workflows/perf-ceiling.yml` after a push to main). Nothing is raised here — raising a',
  'ceiling is a decision a pull request states with `--update`.', '',
  '| row | ceiling | now |', '|---|---:|---:|',
  ...changes.map((c) => `| ${c.what} | ${c.from == null ? '(none)' : fmt(c.key, c.from)} | ${c.to == null ? '(dropped)' : fmt(c.key, c.to)} |`), ''].join('\n');

/* ⚠ guarded: tests/perf-startup-and-cache-checks.test.mjs (#R311) imports judge() from this file, and an unguarded CLI would
   then run the whole gate — against whatever dist/ happened to be on disk — as a side effect of the
   import. Same shape as scripts/build-report.mjs. */
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  if (has('--update')) {
    /* (perf-measure-parity) a ceiling is written only from the tree CI is going to measure */
    const tree = treeState({ fetch: true });
    const gaps = parityProblems(tree);
    if (gaps.length) {
      console.error('perf-budget --update: refused — this build is not the tree CI measures, so a ceiling written from it is not the one CI will hold it to:');
      for (const g of gaps) console.error('  · ' + g);
      process.exit(1);
    }
    if (tree.fetched === false) console.log('perf-budget: origin could not be asked — origin/main is as of the last fetch.');
    const m = measure();
    if (!existsSync(BASELINE)) {
      writeFileSync(BASELINE, JSON.stringify(m, null, 2) + '\n');
      console.log(`perf-budget: no baseline yet — wrote ${relative(ROOT, BASELINE)} from this build.`);
      process.exit(0);
    }
    const { baseline, changes } = raise(m, JSON.parse(readFileSync(BASELINE, 'utf8')));
    if (!changes.length) {
      console.log("perf-budget: nothing is over its ceiling — nothing to raise. Lowering is main's CI's job (.github/workflows/perf-ceiling.yml).");
    } else {
      writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n');
      console.log(`perf-budget: raised ${changes.length} ceiling(s) in ${relative(ROOT, BASELINE)} — no other row was written:`);
      for (const c of changes) console.log('  · ' + change(c));
      console.log("  Say why in this round's dev-notes entry: a raised ceiling is a decision, and the diff alone does not say what it bought.");
    }
  } else if (has('--tighten')) {
    const from = argOf('--measured');
    const m = from ? JSON.parse(readFileSync(resolve(from), 'utf8')) : measure();
    const { due: isDue, baseline, changes } = tighten(m, JSON.parse(readFileSync(BASELINE, 'utf8')));
    if (!isDue) {
      console.log('perf-budget: no ceiling is due — every row is within its band of this build, and no chunk is new or gone.');
    } else {
      writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n');
      console.log(`perf-budget: lowered or recorded ${changes.length} row(s) in ${relative(ROOT, BASELINE)} (nothing was raised):`);
      for (const c of changes) console.log('  · ' + change(c));
    }
    const summary = argOf('--summary');
    if (summary) writeFileSync(resolve(summary), isDue ? TIGHTEN_SUMMARY(changes) : '');
  } else if (has('--report')) {
    console.log(JSON.stringify(measure(), null, 2));
  } else {
    process.exit(main());
  }
}
