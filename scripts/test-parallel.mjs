/* ============================================================================
 *  IntMap · `npm test` IS TWO INDEPENDENT HALVES, SO IT RUNS THEM AT THE SAME TIME  (#R205)
 * ----------------------------------------------------------------------------
 *  「毎回毎回、テストに時間がかかりすぎ。いい加減にしろ。すべてが長すぎる。明らかにテストが過剰。
 *    ずっと言っているがテスト時間が壊滅的に長いまま変わっていない。大幅に過剰。簡易でいい。」
 *
 *  #R203 split the SUITE (85 min → an 8 min gate) and #R204 turned the gate's membership into a price
 *  (484 s → 173 s). Both worked on the same half of `npm test` — the browser half — while the other
 *  half sat in front of it in a `&&` chain:
 *
 *      node static-checks && node engine-coupling --gate && node test-budget && npm run test:checks
 *          && node run-tests            ← the browser suite does not start until all of that is done
 *
 *  Those two halves share nothing. The first is source-level: it parses the repository with acorn and
 *  runs ~60 `node --test` files that read files off disk. The second builds the site, serves it on
 *  4173 and drives Chromium. Neither reads the other's output, and the browser half spends most of
 *  its wall clock waiting for a browser rather than using the CPU — so running them in sequence pays
 *  for the source half twice: once in CPU and once in wall clock.
 *
 *  Running them together makes `npm test` cost max(a, b) instead of a + b.
 *
 *  ⚠ BOTH STILL RUN, AND EITHER STILL FAILS THE COMMAND. There is no "fail fast" here on purpose: a
 *  static-check failure that killed the browser half would hide a browser regression behind a missing
 *  semicolon, and the whole point of this file is that you learn everything from one run.
 *  ⚠ OUTPUT IS PREFIXED AND BUFFERED PER LINE. Two children writing to one terminal interleave
 *  mid-line otherwise, and a half-written assertion message is worse than a slower run.
 * ==========================================================================*/
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const win = process.platform === 'win32';
const NPM = win ? 'npm.cmd' : 'npm';

/* the two halves. `checks` is the source-level chain in its original order — the acorn gates first,
   because a parse error there explains every other failure. */
const HALVES = [
  {
    tag: 'checks', steps: [
      ['node', ['scripts/static-checks.mjs']],
      ['node', ['scripts/engine-coupling.mjs', '--gate']],
      /* ⚠ (#R239) THE TRANSLATION GATE RUNS HERE, WITH THE OTHER ACORN GATES. 「いつまでたっても
         言語対応の漏れが見つかることは許されない」 — a漏れ is found by a reader only when nothing
         between the edit and the deploy asks. This asks, on every run, for every language, across
         every surface any of them lives on (see the header of scripts/i18n-audit.mjs). It is one
         second of parsing, and it is the difference between a rule and a hope. */
      ['node', ['scripts/i18n-audit.mjs', '--gate']],
      /* ⚠ THE CROSS-DOCUMENT GATE. Facts written down in more than one place rot in one place
         at a time, and the reader who opens the stale copy is simply misled. This compares the
         facts that are BOTH written down and measurable against the repository, and against each
         other. It also refuses to let Architecture.md become a changelog again. */
      ['node', ['scripts/doc-facts.mjs', '--check']],
      ['node', ['scripts/arch-files-check.mjs', '--check']],
      /* (#R503) THE AGENT CONTEXT. The standing instructions, the round procedure and the five
         roles are now written once under `.agents/` and RENDERED into each product's own
         location, because Claude Code reads only `.claude/` and Codex reads only `AGENTS.md`
         plus `.codex/`. This re-renders and compares, so an edit to a copy fails here
         instead of quietly becoming a second source — and it measures AGENTS.md against the
         32,768-byte ceiling Codex truncates it at without a word. */
      ['node', ['scripts/agent-sync.mjs']],
      /* ⚠ (#R278) THE ATLAS CATALOGUE GATE. 「an action the catalogue does not describe does not
         exist for the planner」 has been the rule since #R115 and nothing enforced it: six working
         capabilities — the road-network isochrone among them — had a dispatch case and no catalogue
         entry, so asking for 「徒歩1時間で行ける範囲」 returned a radius circle and then 「できません」.
         This compares the dispatch with the prompt on every run. See scripts/atlas-catalog.mjs. */
      ['node', ['scripts/atlas-catalog.mjs', '--check']],
      /* ⚠ (#R318) …AND THE TWENTY QUESTIONS THAT ONE DOES NOT ASK. The gate above asks whether the
         planner has been TOLD about a capability. It cannot ask whether the capability can be run,
         whether anything watched it happen, whether it invented a target it was not given, or
         whether it reported a promise as a result — which is what #R268, #R291, #R302 and #R309
         each turned out to be. See scripts/atlas-capability-audit.mjs. */
      ['node', ['scripts/atlas-capability-audit.mjs', '--check']],
      /* ⚠ (#R354) THE COMPANY-ATLAS GATE. Every other check in this list reads SOURCE; this one
         reads the SHIPPED BYTES of data/companies/, because "the builder drops what it cannot
         source" is a claim about code and the file is what the reader sees. It caught two real
         classes of error while the data was being built: money with no currency or no period, and
         a supermarket filed as a power plant because of the solar panels on its roof. */
      ['node', ['scripts/companies-audit.mjs', '--gate']],
      /* ⚠ (#R381) THE WAR-RECORD GATE, AND THE SECOND ONE HERE THAT READS SHIPPED BYTES. #R349 wrote
         scripts/build-wars.mjs with a `--check` mode and never gave it a caller, so for fifteen rounds
         data/wars.json could have said anything the source did not. It re-derives the file and compares
         it byte for byte — and on the way it runs the whole self-audit: every anchor against the bundled
         gazetteer, every gwcode against CShapes ON ITS DATE, every line against the country it claims to
         divide, every one of 235 named cities against the army the record says held it, and every name
         in the gazetteer against something that quotes it. That last one is what #R349 needed: it had
         178 anchors nothing reached, one per theatre it never wrote. */
      ['node', ['scripts/build-wars.mjs', '--check']],
      /* (#R427) the THIRD gate here that reads shipped bytes: data/hist-cities.json is re-derived
         from scripts/histcities/ and compared byte for byte, and on the way every tile key in the
         record is resolved against the bundled gazetteer — a spelling that also names a populated
         place somewhere else fails the build, because the label is rewritten by matching that
         spelling and the other city would be renamed too. */
      ['node', ['scripts/build-hist-cities.mjs', '--check']],
      ['node', ['scripts/test-budget.mjs']],
      [NPM, ['run', 'test:checks']],
    ],
  },
  { tag: 'browser', steps: [['node', ['scripts/run-tests.mjs']]] },
];

function runStep(cmd, args, tag) {
  return new Promise((res) => {
    const p = spawn(cmd, args, { cwd: ROOT, shell: win, env: process.env });
    let buf = { out: '', err: '' };
    const pump = (which, chunk) => {
      buf[which] += chunk;
      const lines = buf[which].split('\n');
      buf[which] = lines.pop();
      for (const l of lines) process.stdout.write(`[${tag}] ${l}\n`);
    };
    p.stdout.on('data', (c) => pump('out', String(c)));
    p.stderr.on('data', (c) => pump('err', String(c)));
    p.on('close', (code) => {
      for (const w of ['out', 'err']) if (buf[w]) process.stdout.write(`[${tag}] ${buf[w]}\n`);
      res(code == null ? 1 : code);           /* (#R191) a null status is a FAILURE, not a clean exit */
    });
    p.on('error', (e) => { process.stdout.write(`[${tag}] ${e.message}\n`); res(1); });
  });
}

async function runHalf(h) {
  const t0 = Date.now();
  for (const [cmd, args] of h.steps) {
    const code = await runStep(cmd, args, h.tag);
    if (code !== 0) return { tag: h.tag, code, secs: Math.round((Date.now() - t0) / 1000) };
  }
  return { tag: h.tag, code: 0, secs: Math.round((Date.now() - t0) / 1000) };
}

const t0 = Date.now();
const results = await Promise.all(HALVES.map(runHalf));
const wall = Math.round((Date.now() - t0) / 1000);
console.log('\n── npm test ──');
for (const r of results) console.log(`   ${r.tag.padEnd(8)} ${r.code === 0 ? 'ok  ' : 'FAIL'} ${r.secs}s`);
console.log(`   wall clock ${wall}s (the two halves ran together; in sequence they would be ${results.reduce((a, r) => a + r.secs, 0)}s)\n`);
process.exit(results.some((r) => r.code !== 0) ? 1 : 0);
