#!/usr/bin/env node
/* ============================================================================
 *  IntMap · THE NIGHTLY DEEP TIER HAS TO TELL SOMEBODY  (#R304)
 * ----------------------------------------------------------------------------
 *  #R203 split the browser suite in two and wrote down what would happen to the half that left the
 *  gate: 「NOTHING IS DELETED BY BEING DEEP. Every assertion still runs, every night.」 It does run.
 *  What was never arranged is anybody FINDING OUT, and the measurement is unambiguous:
 *
 *      the nightly deep tier was RED on every one of the fourteen runs from 2026-08-08 to 08-21
 *      — all five `Deep rest` shards, every night — and the aggregate job reported it honestly
 *      each time. Two of the failures had been true since the round that caused them (#R296
 *      deleted three features the spec still demanded; #R224/#R291 grew the lazy loader past the
 *      eight a spec counted). Nobody was lied to. Nobody looked.
 *
 *  `gh run list` is why: a nightly is one row among the dozens a working day of pushes and PRs
 *  produces, so it scrolls off, and 「is the deep tier green」 becomes a question nobody asks rather
 *  than one anybody answers wrongly. A result that is only in a log is a result nobody has.
 *
 *  So the nightly's answer is written to the one place in this repository that is FOR unfinished
 *  business — an issue — and kept current rather than accumulating:
 *
 *      RED    → open the issue if it is not open, and rewrite its body with tonight's failures.
 *      GREEN  → close it, saying which run cleared it.
 *
 *  ⚠ ONE ISSUE, EDITED — NOT A COMMENT A NIGHT. Fourteen nights of 「still red」 is the same silence
 *  in a louder font: the reader learns to skip it, and the newest information ends up furthest down
 *  the page. The body always says what failed LAST NIGHT, so the issue is a state, not a log.
 *  ⚠ AND `cancelled` IS NOT `success`. A run that was cut short proved nothing; treating it as a
 *  pass is exactly the failure mode this file exists to end.
 *
 *  The other half of the answer is `node scripts/worktree.mjs status`, which CLAUDE.md §1 puts in
 *  front of every session — it prints this same verdict before any work starts.
 *
 *      node scripts/deep-alarm.mjs --result <conclusion> [--reports <dir>] [--run-url <url>] [--dry-run]
 * ==========================================================================*/
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const TITLE = 'deep tier (nightly) is red';

const arg = (k, d = '') => {
  const i = process.argv.indexOf(k);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d;
};
const has = (k) => process.argv.includes(k);

/** every file named junit.xml at any depth under `dir` (the shards' uploaded artefacts) */
export function junitFiles(dir) {
  const out = [];
  const walk = (d) => {
    let entries; try { entries = readdirSync(d); } catch { return; }
    for (const e of entries) {
      const p = join(d, e);
      let st; try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) walk(p);
      else if (e === 'junit.xml') out.push(p);
    }
  };
  if (dir && existsSync(dir)) walk(dir);
  return out.sort();
}

/* Attribute values arrive XML-escaped — the reporter replaces `& " ' < >` — and this project's test
 * titles are full of apostrophes, so an id printed raw reads 「the shards&apos; junit.xml」: the name
 * of the failing test, misspelt, in the one sentence the issue exists to say. */
const unxml = (s) => String(s).replace(/&(amp|quot|apos|lt|gt|#39);/g,
  (_, e) => ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', '#39': "'" }[e]));

/* The same <testcase> shape scripts/baseline.mjs reads — one per test, a <failure>/<error> child
 * when it failed.
 *
 * ⚠ (#R372) THE KEY IS `classname › name`, AND IT USED TO BE `classname` ALONE. Playwright's JUnit
 * reporter writes the FILE in `classname` and the TEST TITLE in `name` (its `_addTestCase` says so
 * in as many words: 「// filename」). So a key of classname alone collapsed every test in a spec file
 * into ONE entry, and the fold below — which is an AND — then reported that file only when ALL of
 * its tests were red. MEASURED on a real nightly junit.xml: 96 <testcase>, 16 distinct classnames,
 * 96 distinct classname+name. Injecting one genuine <failure> into r167.spec.js's eight cases and
 * running the old key over it returned []. That is why issue #275 said 「No individual test is red …
 * the job failed around the suite rather than inside it」 on a night when three tests were red, and
 * sent whoever read it to the infrastructure instead of to the tests.
 *
 * ⚠ AND THE FOLD STAYS. A test that failed and then PASSED on the retry is not reported here: CI
 * retries once precisely so a transient blip clears itself (#R207), and calling that red would train
 * the reader to ignore this issue, which is the disease rather than the cure. Playwright already
 * pays most of that — it writes ONE <testcase> per test whatever the retry count, so the real report
 * has no duplicate id at all — which leaves the fold as insurance for the case the format does not
 * rule out: the same spec turning up in two shards' reports. */
export function failuresFrom(paths) {
  const seen = new Map();
  for (const p of paths) {
    let xml; try { xml = readFileSync(p, 'utf8'); } catch { continue; }
    /* ⚠ THE SELF-CLOSING FORM IS TRIED FIRST. Playwright always writes `<testcase …></testcase>`, so
       this costs nothing today — but written the other way round, a `<testcase …/>` is swallowed by
       the OPEN-TAG alternative, whose lazy body then runs on to the NEXT test's `</testcase>`: a
       passing test inherits the failure of whichever test happens to follow it. Order is the fix. */
    for (const m of xml.matchAll(/<testcase\b([^>]*?)\/>|<testcase\b([^>]*)>([\s\S]*?)<\/testcase>/g)) {
      const attrs = m[1] || m[2] || '', body = m[3] || '';
      const cls = /classname="([^"]*)"/.exec(attrs);
      /* ⚠ `\b` IS LOAD-BEARING: a bare /name="/ matches INSIDE `classname="`, which would name every
         test after its own file all over again. And either half may be missing — a report that
         carries only one of the two is still usable, the id is then the half that is there — so only
         a <testcase> with neither is skipped. */
      const nm = /\bname="([^"]*)"/.exec(attrs);
      const parts = [cls, nm].filter(Boolean).map((x) => unxml(x[1]).trim()).filter(Boolean);
      if (!parts.length) continue;
      const id = parts.join(' › ');
      const failed = /<failure|<error/.test(body);
      seen.set(id, seen.has(id) ? (seen.get(id) && failed) : failed);
    }
  }
  return [...seen.entries()].filter(([, f]) => f).map(([id]) => id).sort();
}

export function body({ failures, runUrl, day, sawReports }) {
  const L = [];
  /* ⚠ (#R372) THE COUNT IS MEASURED AND IT ROTS. #R203 wrote 27, #R304 wrote 59, and scripts/tiers.mjs
     derives 81 of the 87 specs on disk today, because the split is a PRICE rather than a list (#R204).
     `npm run test:deep` prints the true figure on its first line — 「run-tests: deep tier — N spec
     file(s)」 — so re-measure there before editing this sentence. */
  L.push('`npm run test:deep` — the 81 spec files that do not stand in front of a push — went red on the nightly run.');
  L.push('');
  L.push(`* run: ${runUrl || '(unknown)'}`);
  L.push(`* when: ${day}`);
  L.push('');
  if (failures.length) {
    L.push(`### ${failures.length} test(s) failed`);
    L.push('');
    for (const f of failures) L.push('* `' + f + '`');
  } else if (sawReports) {
    /* The shards uploaded their reports and no test in them is red — so the job died around the
       tests (install, plan, browser download) rather than in one. Say which, rather than printing
       an empty list that reads as "nothing is wrong". */
    L.push('### No individual test is red');
    L.push('');
    L.push('The shards reported no failing test, so the job failed around the suite rather than inside it —');
    L.push('read the run log itself.');
  } else {
    L.push('### The shards uploaded no report');
    L.push('');
    L.push('Nothing to list — read the run log.');
  }
  L.push('');
  L.push('---');
  L.push('');
  L.push('This issue is opened, rewritten and closed by `scripts/deep-alarm.mjs` from the nightly CI run.');
  L.push('It always describes the LATEST run, so there is nothing to scroll back through.');
  L.push('Reproduce locally with `npm run test:deep`; `node scripts/worktree.mjs status` prints the same verdict.');
  return L.join('\n');
}

/* ── the GitHub side. Every call goes through `gh`, which the runner already has authenticated. ── */
const gh = (args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function openIssue() {
  let raw = '';
  try { raw = gh(['issue', 'list', '--state', 'open', '--limit', '50', '--json', 'number,title']); } catch { return null; }
  let list; try { list = JSON.parse(raw); } catch { return null; }
  const hit = (list || []).find((i) => i.title === TITLE);
  return hit ? hit.number : null;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('deep-alarm.mjs')) {
  const result = arg('--result');
  if (!result) {
    console.error('usage: deep-alarm.mjs --result <conclusion> [--reports <dir>] [--run-url <url>] [--dry-run]');
    process.exit(2);
  }
  const dir = arg('--reports');
  const reports = junitFiles(dir);
  const failures = failuresFrom(reports);
  const green = result === 'success';
  const day = new Date().toISOString().slice(0, 10);
  const runUrl = arg('--run-url');
  const text = body({ failures, runUrl, day, sawReports: reports.length > 0 });

  console.log(`deep-alarm: browser-deep = ${result}; ${reports.length} report(s), ${failures.length} failing test(s)`);
  if (has('--dry-run')) { console.log('--- issue body ---\n' + text); process.exit(0); }

  const num = openIssue();
  if (green) {
    if (num == null) { console.log('deep-alarm: green, and nothing is open — nothing to do.'); process.exit(0); }
    gh(['issue', 'comment', String(num), '--body', `Green again — cleared by ${runUrl || 'the nightly run'} (${day}).`]);
    gh(['issue', 'close', String(num)]);
    console.log(`deep-alarm: green — closed #${num}.`);
    process.exit(0);
  }
  if (num == null) {
    const url = gh(['issue', 'create', '--title', TITLE, '--body', text]);
    console.log('deep-alarm: red — opened ' + url);
  } else {
    gh(['issue', 'edit', String(num), '--body', text]);
    console.log(`deep-alarm: red — rewrote #${num} with tonight's failures.`);
  }
  /* ⚠ EXIT 0. The alarm reporting a red run correctly is not itself a failure, and a red job here
     would only add a second thing to ignore. `browser-gate` is what makes the RUN red. */
}
