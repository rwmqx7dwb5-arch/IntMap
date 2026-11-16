/* ============================================================================
 *  IntMap · WHAT A CI STEP MAY CARRY INTO THE RUNNER                       (security-audit)
 * ----------------------------------------------------------------------------
 *  Two facts about every step of every workflow AND every composite action, judged on the parsed YAML
 *  (never on the text, which cannot tell a `run:` body from a later step's `env:`):
 *
 *   ① npm-install-scripts — a `run:` that installs dependencies passes `--ignore-scripts`.
 *     `npm ci` runs every dependency's install / postinstall script with the job's environment, which in
 *     a job that holds a secret or a write token is arbitrary third-party code with both. The repository
 *     has two install scripts in its whole lock: esbuild's (verification only — the binary arrives as the
 *     optional `@esbuild/<platform>` package, which `--ignore-scripts` does not skip) and fsevents' (macOS
 *     only). The project's own `prebuild` is not an install script; `npm run build` still runs it.
 *   ② checkout-credentials — `actions/checkout` is given `persist-credentials: false`. Its default writes
 *     the workflow's GITHUB_TOKEN into `.git/config`, where every later step — and every program a step
 *     runs, `npm ci` and the build included — can read it. A step that must push takes the token from its
 *     own `env:` for that one command instead (companies-refresh.yml and the three like it).
 *
 *  A function, so a test can hand it a violating fragment and watch it refused; static-checks.mjs decides
 *  WHICH files are read. The universe is discovered (the workflow files and each composite action.yml),
 *  not listed: a composite action is a step list like any other, and `npm ci` inside one is the same install.
 * ============================================================================ */

/* npm's own spellings of install / clean-install (`npm help install`, `npm help ci`): a script that spells it
   `npm i` or `npm clean-install` is the same command, so the rule is on the command, not on one spelling. */
const NPM_INSTALL = /^npm\s+(?:ci|clean-install|install|i|add|isntall|install-test|it|install-ci-test|cit|ic)(?=\s|$)/;

/** The step list of a parsed workflow (`jobs.*.steps`) or composite action (`runs.steps`). */
export function* stepsOf(doc) {
  if (doc && typeof doc.jobs === 'object' && doc.jobs) {
    for (const [jobId, job] of Object.entries(doc.jobs)) {
      if (!job || !Array.isArray(job.steps)) continue;
      for (const [i, step] of job.steps.entries()) yield { where: `${jobId}.steps[${i}]`, step };
    }
  }
  if (doc && doc.runs && Array.isArray(doc.runs.steps)) {
    for (const [i, step] of doc.runs.steps.entries()) yield { where: `runs.steps[${i}]`, step };
  }
}

/* The commands of a shell body, one per entry: continuation lines joined, comments dropped, then split at the
   operators that begin a new command. Not a shell parser — it reads what a CI `run:` is: a few commands, never
   a quoted string that happens to hold «npm ci». A command it cannot split is still seen by its own line. */
function commandsOf(run) {
  const joined = String(run).replace(/\\\r?\n/g, ' ');
  const out = [];
  for (const line of joined.split(/\r?\n/)) {
    const body = line.trim();
    if (!body || body.startsWith('#')) continue;
    for (const part of body.split(/&&|\|\||;|\|/)) {
      const c = part.trim();
      if (c) out.push(c);
    }
  }
  return out;
}

/** The commands in a `run:` that install dependencies without `--ignore-scripts`. */
export function installsWithScripts(run) {
  return commandsOf(run)
    .map((c) => c.replace(/^(?:sudo\s+|(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+)/, ''))   // `sudo npm ci`, `CI=1 npm ci`
    .filter((c) => NPM_INSTALL.test(c) && !/(?:^|\s)--ignore-scripts(?:=true)?(?=\s|$)/.test(c));
}

/** True when `actions/checkout` is told not to keep the token (`false` and `'false'` both say it). */
export function checkoutDropsCredentials(step) {
  const v = step && step.with ? step.with['persist-credentials'] : undefined;
  return v === false || String(v).toLowerCase() === 'false';
}

/**
 * The violations of ① and ② in one parsed file. `rel` is only for the message.
 * @returns {{check: string, msg: string}[]}
 */
export function hardeningProblems(doc, rel) {
  const out = [];
  for (const { where, step } of stepsOf(doc)) {
    if (!step || typeof step !== 'object') continue;
    if (typeof step.run === 'string') {
      for (const c of installsWithScripts(step.run)) {
        out.push({
          check: 'npm-install-scripts',
          msg: `${rel}: ${where} runs «${c}» without --ignore-scripts — a dependency's install script would run with this job's secrets and token (nothing here needs one: esbuild's binary comes from its optional @esbuild/<platform> package)`,
        });
      }
    }
    if (typeof step.uses === 'string' && /^actions\/checkout@/.test(step.uses) && !checkoutDropsCredentials(step)) {
      out.push({
        check: 'checkout-credentials',
        msg: `${rel}: ${where} uses actions/checkout without «persist-credentials: false» — the GITHUB_TOKEN stays in .git/config for every later step; a step that must push takes the token from its own env`,
      });
    }
  }
  return out;
}
