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
      /* ⚠ (#R278) THE ATLAS CATALOGUE GATE. 「an action the catalogue does not describe does not
         exist for the planner」 has been the rule since #R115 and nothing enforced it: six working
         capabilities — the road-network isochrone among them — had a dispatch case and no catalogue
         entry, so asking for 「徒歩1時間で行ける範囲」 returned a radius circle and then 「できません」.
         This compares the dispatch with the prompt on every run. See scripts/atlas-catalog.mjs. */
      ['node', ['scripts/atlas-catalog.mjs', '--check']],
      /* ⚠ (#R314) …AND THE TWENTY QUESTIONS THAT ONE DOES NOT ASK. The gate above asks whether the
         planner has been TOLD about a capability. It cannot ask whether the capability can be run,
         whether anything watched it happen, whether it invented a target it was not given, or
         whether it reported a promise as a result — which is what #R268, #R291, #R302 and #R309
         each turned out to be. See scripts/atlas-capability-audit.mjs. */
      ['node', ['scripts/atlas-capability-audit.mjs', '--check']],
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
