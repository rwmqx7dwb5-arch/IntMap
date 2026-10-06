/*
 *  IntMap · ci-build-once — THE SITE IS BUILT ONCE PER CI RUN, AND PRODUCTION IS THAT BUILD
 *
 *  Before: one CI run built the site up to four times (the gate shard with check:perf/check:assets,
 *  and every browser machine through playwright.config.js' webServer), and deploy.yml built a fifth
 *  copy on every push to main — in parallel with main's CI, so it published whether that run was red
 *  or not. Now ci.yml's `build` job is the only thing that builds; the gate shard and the browser
 *  tiers are handed its output, and the `pages` job publishes it once main's run is green.
 *
 *  ⚠ WHAT IS MEASURED HERE IS «WHAT COULD BUILD», NOT A SPELLING. A step builds when it runs
 *  `npm run build`/`vite build` — directly, or through an npm script that does (package.json is
 *  expanded, so `npm run serve` counts), or through the two runners that build by default:
 *  `playwright test` (the webServer) and `scripts/ci-gates.mjs --shard` (the build task). Those two
 *  count as builders unless the step hands them IM_PREBUILT_DIST=1. Local composite actions are
 *  expanded in place, so a build hidden in .github/actions/ is found too.
 *  The two runners' prebuilt behaviour is then EVALUATED, not read: ci-gates.mjs runs in a
 *  throw-away tree, and playwright.config.js is imported under both settings.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const CI = yaml.load(rd('.github/workflows/ci.yml'));
const SCRIPTS = JSON.parse(rd('package.json')).scripts || {};

/* ── what could build ─────────────────────────────────────────────────────────────────────── */
const DIRECT = /\bnpm run build\b|\bvite build\b/;

/** True when a node script's CODE (comments stripped) builds: it spawns the build or a builder
    itself, or imports the build command from scripts/gate-universe.mjs to run it. One level only —
    following imports would flag every importer of gate-universe.mjs, which defines the command. */
function nodeScriptBuilds(rel) {
  const p = join(ROOT, rel);
  if (!existsSync(p)) return false;
  const code = codeOnly(readFileSync(p, 'utf8'));
  return /npm run build|vite build|\[\s*'run'\s*,\s*'build'\s*\]|\bplaywright test\b/.test(code)
    || /import\s*\{[^}]*\bBUILD\b[^}]*\}\s*from\s*'\.\/gate-universe\.mjs'/.test(code);
}

/** True when an npm script (by name) builds the site, following `npm run x` inside it. */
function scriptBuilds(name, seen = new Set()) {
  if (seen.has(name)) return false;
  seen.add(name);
  const body = String(SCRIPTS[name] || '');
  if (name === 'build' || DIRECT.test(body)) return true;
  if (/\bplaywright test\b/.test(body)) return true;          // its webServer builds by default
  if ([...body.matchAll(/\bnode (scripts\/[\w.-]+\.mjs)/g)].some((m) => nodeScriptBuilds(m[1]))) return true;
  return [...body.matchAll(/\bnpm (?:run )?([\w:-]+)/g)].some((m) => scriptBuilds(m[1] === 'test' ? 'test' : m[1], seen));
}

/** Why a shell step could build, or null. `env` is the step's effective env (job + step). */
function buildsBecause(run, env) {
  const text = String(run || '');
  if (DIRECT.test(text)) return 'runs npm run build / vite build';
  const prebuilt = String(env.IM_PREBUILT_DIST ?? '') === '1';
  if (/\bplaywright test\b/.test(text) && !/--config\s+playwright\.prod\.config\.js/.test(text) && !prebuilt) {
    return 'runs playwright test without IM_PREBUILT_DIST=1 (its webServer builds)';
  }
  if (/scripts\/ci-gates\.mjs\s+--shard/.test(text) && !prebuilt) return 'runs a gate shard without IM_PREBUILT_DIST=1 (its build task builds)';
  for (const m of text.matchAll(/\bnode (scripts\/[\w.-]+\.mjs)(.*)/g)) {
    if (m[1] === 'scripts/ci-gates.mjs') continue;   // only its --shard builds, and that is judged above
    if (nodeScriptBuilds(m[1])) return `runs ${m[1]}, which builds`;
  }
  for (const m of text.matchAll(/\bnpm (?:run ([\w:-]+)|(test)\b)/g)) {
    const s = m[1] || m[2];
    if (s !== 'build' && scriptBuilds(s)) return `runs npm ${m[1] ? 'run ' + s : s}, which builds`;
  }
  return null;
}

/** Every shell step of a job, local composite actions expanded, with its effective env. */
function shellSteps(job) {
  const out = [];
  const walk = (steps, env, where) => (steps || []).forEach((st, i) => {
    const e = { ...env, ...(st.env || {}) };
    const at = `${where}[${i}]${st.name ? ' «' + st.name + '»' : ''}`;
    if (st.run) out.push({ at, run: st.run, env: e });
    const local = /^\.\/(\.github\/actions\/[\w.-]+)$/.exec(st.uses || '');
    if (local) walk(yaml.load(rd(local[1] + '/action.yml')).runs.steps, e, `${at} → ${local[1]}`);
  });
  walk(job.steps, job.env || {}, 'steps');
  return out;
}

test('① exactly one step in ci.yml can build the site, and it is in the `build` job, which has no matrix', () => {
  const builders = [];
  for (const [id, job] of Object.entries(CI.jobs)) {
    for (const st of shellSteps(job)) {
      const why = buildsBecause(st.run, st.env);
      if (why) builders.push(`${id} › ${st.at}: ${why}`);
    }
  }
  assert.equal(builders.length, 1, 'steps that can build the site:\n' + builders.join('\n'));
  assert.match(builders[0], /^build › /, 'the one build is not in the `build` job: ' + builders[0]);
  assert.equal(CI.jobs.build.strategy, undefined, 'a matrix on `build` would build once per leg');
  /* and the measuring stick itself still finds builders — a rule that finds none proves nothing */
  assert.ok(buildsBecause('npx playwright test tests/a.spec.js', {}), 'playwright test without the flag must count as a build');
  assert.ok(!buildsBecause('npx playwright test tests/a.spec.js', { IM_PREBUILT_DIST: '1' }));
  assert.ok(buildsBecause('npm run serve', {}), '`npm run serve` builds through package.json');
  assert.ok(buildsBecause('node scripts/ci-gates.mjs --shard 1/3', {}));
  assert.ok(!buildsBecause('node scripts/ci-gates.mjs --needs-build 1/3', {}), 'asking the plan builds nothing');
  assert.ok(buildsBecause('npm test', {}), '`npm test` builds (scripts/test-parallel.mjs runs the build command)');
});

test('② every job that reads the build needs `build` and gets the name from its output', () => {
  const src = rd('.github/workflows/ci.yml');
  assert.match(src, /name:\s*\$\{\{\s*steps\.names\.outputs\.site\s*\}\}/, 'the build job uploads under the name it publishes as an output');
  const b = CI.jobs.build;
  assert.ok(b.outputs && /steps\.names\.outputs\.site/.test(b.outputs.site) && /steps\.names\.outputs\.pages/.test(b.outputs.pages));
  const up = b.steps.find((s) => /^actions\/upload-artifact@/.test(s.uses || ''));
  assert.ok(up, 'the build job uploads its output');
  const paths = String(up.with.path).split(/\r?\n/).map((p) => p.trim()).filter(Boolean);
  assert.deepEqual(paths.sort(), ['.perf/build-report.json', 'dist/'], 'the artifact carries dist/ and the build report check:perf reads');
  assert.equal(up.with['include-hidden-files'], true, '.perf/ is a dot-directory: without include-hidden-files the report is silently left out');
  assert.equal(up.with['if-no-files-found'], 'error');

  let readers = 0;
  for (const [id, job] of Object.entries(CI.jobs)) {
    const text = JSON.stringify(job);
    if (!/needs\.build\.outputs\.site/.test(text)) continue;
    readers++;
    assert.ok([].concat(job.needs || []).includes('build'), `${id} reads the build's artifact name but does not need \`build\``);
  }
  for (const id of ['gates', 'browser', 'browser-deep']) assert.ok(JSON.stringify(CI.jobs[id]).includes('needs.build.outputs.site'), `${id} does not take the run's build`);
  assert.ok(readers >= 3, `only ${readers} job(s) read the build`);

  /* the gate shards download only where the plan puts the build task, asked of ci-gates.mjs itself */
  const g = CI.jobs.gates.steps;
  const ask = g.findIndex((s) => /ci-gates\.mjs --needs-build/.test(s.run || ''));
  const dl = g.findIndex((s) => /^actions\/download-artifact@/.test(s.uses || ''));
  const run = g.findIndex((s) => /ci-gates\.mjs --shard/.test(s.run || ''));
  assert.ok(ask >= 0 && ask < dl && dl < run, 'gates: ask --needs-build, then download, then run the shard');
  assert.match(g[dl].if, /steps\.\w+\.outputs\.build == 'true'/);
  /* a red build must not silence the other gates (the reason the shards exist) */
  assert.match(String(CI.jobs.gates.if), /!cancelled\(\)/, 'gates must still run when the build job is red');
  assert.ok([].concat(CI.jobs.static.needs).includes('build'), '«Static checks» must read the build job’s result');
  assert.match(CI.jobs.static.steps.map((s) => s.run).join('\n'), /needs\.build\.result \}\}" = "success"/);

  /* the browser tier downloads before it runs, and only when it has something to run */
  const bt = yaml.load(rd('.github/actions/browser-tier/action.yml')).runs.steps;
  const bdl = bt.findIndex((s) => /^actions\/download-artifact@/.test(s.uses || ''));
  const brun = bt.findIndex((s) => /playwright test/.test(s.run || ''));
  assert.ok(bdl >= 0 && bdl < brun, 'browser tier: download the build before running');
  assert.match(bt[bdl].with.name, /inputs\.dist-artifact/);
  assert.equal(bt[bdl].if, bt[brun].if, 'download exactly when the run happens');
});

test('③ ci-gates.mjs: IM_PREBUILT_DIST=1 skips the build, refuses a missing one; unset builds as before', () => {
  const T = mkdtempSync(join(tmpdir(), 'ci-build-once-'));
  try {
    mkdirSync(join(T, 'scripts'), { recursive: true });
    const take = (f) => {
      if (existsSync(join(T, 'scripts', f))) return;
      cpSync(join(ROOT, 'scripts', f), join(T, 'scripts', f));
      for (const m of readFileSync(join(ROOT, 'scripts', f), 'utf8').matchAll(/(?:\bfrom\s*|\bnew URL\(\s*)['"]\.\/([^'"]+)['"]/g)) take(m[1]);
    };
    /* an import, or a module named by `new URL('./x', import.meta.url)` (the preload gateEnv hands each gate) */
    take('ci-gates.mjs');
    const mark = (n) => `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(join(T, 'ran-' + n))}, '');`;
    writeFileSync(join(T, 'scripts', 'build.mjs'), mark('build') + '\n');
    /* READS_BUILD's spelling: this gate reads the build output */
    writeFileSync(join(T, 'scripts', 'gd.mjs'), "const ROOT = '.'; /* join(ROOT, 'dist') */\n" + mark('gd') + '\n');
    writeFileSync(join(T, 'scripts', 'ga.mjs'), mark('ga') + '\n');
    writeFileSync(join(T, 'package.json'), JSON.stringify({ name: 'cbo', private: true, scripts: {
      build: 'node scripts/build.mjs', 'check:aa': 'node scripts/ga.mjs', 'check:dd': 'node scripts/gd.mjs' } }));
    const clear = () => { for (const n of ['build', 'gd', 'ga']) rmSync(join(T, 'ran-' + n), { force: true }); };
    const shard = (env) => spawnSync(process.execPath, [join(T, 'scripts', 'ci-gates.mjs'), '--shard', '1/1'],
      { cwd: T, encoding: 'utf8', env: { ...process.env, IM_PREBUILT_DIST: '', ...env } });
    const ran = (n) => existsSync(join(T, 'ran-' + n));

    /* unset: the build runs, then its gate */
    clear();
    let r = shard({});
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(ran('build') && ran('gd') && ran('ga'), 'without IM_PREBUILT_DIST the shard must build (local and fork behaviour)');

    /* handed a build: nothing is built, the gate runs */
    clear();
    mkdirSync(join(T, 'dist'), { recursive: true }); writeFileSync(join(T, 'dist', 'index.html'), '');
    mkdirSync(join(T, '.perf'), { recursive: true }); writeFileSync(join(T, '.perf', 'build-report.json'), '{}');
    r = shard({ IM_PREBUILT_DIST: '1' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(!ran('build'), 'IM_PREBUILT_DIST=1 with the build present still built — a second build per run');
    assert.ok(ran('gd') && ran('ga'));

    /* promised a build that did not arrive: red, naming it, and NOT built around */
    clear();
    rmSync(join(T, '.perf'), { recursive: true, force: true });
    r = shard({ IM_PREBUILT_DIST: '1' });
    assert.notEqual(r.status, 0, 'a missing artifact must fail the shard');
    assert.match(r.stderr, /build-report\.json/, 'the failure names what is missing');
    assert.ok(!ran('build'), 'a missing artifact was silently rebuilt');
    assert.ok(!ran('gd'), 'a build-reading gate ran with no build');
    assert.ok(ran('ga'), 'the other gates in the bin still ran');
  } finally { rmSync(T, { recursive: true, force: true, maxRetries: 5 }); }
});

test('④ --needs-build answers from the same plan --shard runs: exactly one shard, the one with the build task', () => {
  const of = 3;
  const plan = spawnSync(process.execPath, [join(ROOT, 'scripts', 'ci-gates.mjs'), '--plan', '--of', String(of)], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(plan.status, 0, plan.stderr);
  const shardOfBuild = (() => {
    let cur = 0;
    for (const l of plan.stdout.split(/\r?\n/)) {
      const m = /shard (\d+)\/\d+/.exec(l);
      if (m) cur = +m[1];
      if (l.includes('npm run build')) return cur;
    }
    return 0;
  })();
  assert.ok(shardOfBuild >= 1, 'the plan has no build task');
  const answers = [];
  for (let i = 1; i <= of; i++) {
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'ci-gates.mjs'), '--needs-build', `${i}/${of}`], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    answers.push(r.stdout.trim());
  }
  assert.deepEqual(answers, Array.from({ length: of }, (_, k) => String(k + 1 === shardOfBuild)));
  /* the matrix in ci.yml is the shard count asked about */
  const legs = CI.jobs.gates.strategy.matrix.include;
  assert.ok(legs.every((l) => l.of === legs.length), 'the gates matrix and its `of` disagree');
});

test('⑤ playwright.config.js: unset builds then serves; IM_PREBUILT_DIST=1 serves dist/ or refuses — never builds', () => {
  const load = (env) => spawnSync(process.execPath, ['--input-type=module', '-e',
    "const m = await import('./playwright.config.js'); console.log(JSON.stringify(m.default.webServer.command));"],
  { cwd: ROOT, encoding: 'utf8', env: { ...process.env, IM_PREBUILT_DIST: '', ...env } });
  const a = load({});
  assert.equal(a.status, 0, a.stderr);
  assert.match(JSON.parse(a.stdout.trim().split('\n').pop()), /^npm run build && node scripts\/serve\.mjs --port \d+ --root dist$/);
  const b = load({ IM_PREBUILT_DIST: '1' });
  if (existsSync(join(ROOT, 'dist', 'index.html'))) {
    assert.equal(b.status, 0, b.stderr);
    assert.match(JSON.parse(b.stdout.trim().split('\n').pop()), /^node scripts\/serve\.mjs --port \d+ --root dist$/);
  } else {
    assert.notEqual(b.status, 0, 'IM_PREBUILT_DIST=1 with no dist/ must refuse, not fall back to building');
    assert.match(b.stderr, /IM_PREBUILT_DIST=1 but dist\/index\.html is missing/);
  }
});

test('⑥ production is published by ci.yml after main’s run is green, from the build job’s Pages artifact', () => {
  /* the aggregate gates: the jobs whose steps assert their needs succeeded. They carry the names the
     ruleset requires from this workflow; renaming one blocks every PR on a check that never reports. */
  const aggregates = Object.entries(CI.jobs)
    .filter(([, j]) => (j.steps || []).some((s) => /test "\$\{\{ needs\.[\w-]+\.result \}\}" = "success"/.test(s.run || '')))
    .map(([id]) => id);
  assert.deepEqual(aggregates.map((id) => CI.jobs[id].name).sort(),
    ['Browser smoke + internal QA', 'Regression suite', 'Static checks']);

  const p = CI.jobs.pages;
  assert.ok(p, 'ci.yml has no pages job');
  assert.deepEqual([].concat(p.needs).sort(), ['build', ...aggregates].sort(), 'pages must wait for the build and every aggregate gate');
  const cond = String(p.if);
  for (const need of ['!cancelled()', "github.event_name == 'push'", "github.ref == 'refs/heads/main'", "vars.ENABLE_PAGES_DEPLOY == 'true'"]) {
    assert.ok(cond.includes(need), `pages.if lacks ${need}`);
  }
  for (const n of [].concat(p.needs)) assert.ok(cond.includes(`needs.${n}.result == 'success'`), `pages.if does not require ${n} to have succeeded`);
  assert.doesNotMatch(cond, /always\(\)/, 'always() would publish a cancelled run');
  /* (deploy-order) + the two READ scopes its guard needs (tests/deploy-order-checks.test.mjs) */
  assert.deepEqual(p.permissions, { pages: 'write', 'id-token': 'write', contents: 'read', deployments: 'read' });
  assert.deepEqual(p.concurrency, { group: 'pages-production', 'cancel-in-progress': false });
  assert.equal(p.environment.name, 'github-pages');
  const dep = p.steps.find((s) => /^actions\/deploy-pages@/.test(s.uses || ''));
  assert.match(dep.with.artifact_name, /needs\.build\.outputs\.pages/, 'pages must publish the Pages artifact the build job assembled');

  /* (aws-hosting) the AWS publish is held to the same gate as Pages: the same needs, each read by
     name, a push to main, never a cancelled run — and it publishes the artifact the build job made */
  const a = CI.jobs.aws;
  assert.ok(a, 'ci.yml has no aws job');
  assert.deepEqual([].concat(a.needs).sort(), [].concat(p.needs).sort(), 'aws must wait for exactly what pages waits for');
  const acond = String(a.if);
  for (const need of ['!cancelled()', "github.event_name == 'push'", "github.ref == 'refs/heads/main'", "vars.AWS_PUBLISH_ROLE_ARN != ''"]) {
    assert.ok(acond.includes(need), `aws.if lacks ${need}`);
  }
  for (const n of [].concat(a.needs)) assert.ok(acond.includes(`needs.${n}.result == 'success'`), `aws.if does not require ${n} to have succeeded`);
  assert.deepEqual(a.permissions, { 'id-token': 'write', contents: 'read' });
  const adl = a.steps.find((s) => /^actions\/download-artifact@/.test(s.uses || ''));
  assert.match(adl.with.name, /needs\.build\.outputs\.site/, 'aws must publish the dist/ the build job made');

  /* only the publishing jobs can publish; the workflow default stays read-only */
  assert.deepEqual(CI.permissions, { contents: 'read' });
  for (const [id, j] of Object.entries(CI.jobs)) {
    if (id !== 'pages' && id !== 'aws') assert.ok(!(j.permissions && (j.permissions.pages || j.permissions['id-token'])), `${id} can publish`);
  }

  /* the build job assembles the Pages artifact on the same condition, from dist/, stamped with this run */
  const b = CI.jobs.build.steps;
  const asm = b.find((s) => /cp -r dist\/\. _site\//.test(s.run || ''));
  const upl = b.find((s) => /^actions\/upload-pages-artifact@/.test(s.uses || ''));
  assert.ok(asm && upl, 'the build job assembles and uploads the Pages artifact');
  for (const s of [asm, upl]) for (const need of ["github.event_name == 'push'", "github.ref == 'refs/heads/main'", "vars.ENABLE_PAGES_DEPLOY == 'true'"]) {
    assert.ok(String(s.if).includes(need), `the Pages artifact is built outside a push to main (${need})`);
  }
  assert.match(asm.run, /GITHUB_RUN_ID/, 'build-info.json carries the CI run that built it');
  assert.match(upl.with.name, /steps\.names\.outputs\.pages/);

  const smoke = CI.jobs['post-smoke'];
  assert.deepEqual([].concat(smoke.needs), ['pages']);
  assert.match(String(smoke.if), /needs\.pages\.result == 'success'/);
  assert.ok(smoke.steps.some((s) => /playwright\.prod\.config\.js/.test(s.run || '')));
});

test('⑦ deploy.yml is the manual button only — a push does not publish twice', () => {
  const d = yaml.load(rd('.github/workflows/deploy.yml'));
  const on = d.on || d[true];
  assert.ok(on && Object.prototype.hasOwnProperty.call(on, 'workflow_dispatch'), 'the manual re-publish must stay');
  assert.ok(!Object.prototype.hasOwnProperty.call(on, 'push'), 'deploy.yml runs on push again — two publishers race');
  assert.ok(d.concurrency && d.concurrency.group === 'pages-production', 'the manual publish shares the production lock');
});
