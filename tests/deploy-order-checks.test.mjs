/*
 *  IntMap · deploy-order — PRODUCTION NEVER MOVES BACKWARD, AND A DISPATCH ON main CANNOT CANCEL ITS PUBLISH
 *
 *  MEASURED 2026-09-30 (production verification of 2026-10-01): deploy.yml published #849 (8d7e473, the
 *  catalogue bot's merge, child of 1a66ec7) at 20:13:48; ci.yml's push run for #848 (1a66ec7) — never
 *  cancelled, because a GITHUB_TOKEN merge starts no push run — published its parent at 20:17:32 over it.
 *  The `pages-production` concurrency group serialized the two publishes; nothing ordered them.
 *  And twice a workflow_dispatch of CI on main cancelled main's own push run (the only run that
 *  publishes), so #850–#852 did not reach production at all.
 *
 *  ① the decision: an ancestor of the live commit is refused; newer, identical and diverged publish
 *  ② «what is live» is the newest SUCCESSFUL deployment — replayed on the 2026-09-30 records, with the
 *     ancestry taken from this repository's real history, the late 1a66ec7 publish is refused
 *  ③ every job that publishes runs the guard first and publishes only on its «true» — discovered from
 *     .github/workflows, not listed; rollback.yml is held to it unless it declares why it is exempt
 *  ④ the CI concurrency group, EVALUATED for each event: a dispatch on main does not share the push run's
 *     group (#855 made that change; it is measured here beside the guard it complements); a push still
 *     cancels an older push; two dispatches on one branch still cancel each other
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';
import { decidePublish, liveDeployment, guard } from '../scripts/pages-publish-guard.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WF = join(ROOT, '.github', 'workflows');
const rd = (p) => readFileSync(p, 'utf8');
/* ② needs real ancestry, and CI checks out one commit deep — so the 2026-09-30 topology is rebuilt in a
   throw-away repository: 234b141 → 1a66ec7 (#848) → 8d7e473 (#849, the bot's merge on top of it). */
const REPO = mkdtempSync(join(tmpdir(), 'deploy-order-'));
const git = (...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { cwd: REPO, encoding: 'utf8' });
git('init', '-q');
const SHA = {};
for (const name of ['234b141', '1a66ec7', '8d7e473']) {
  writeFileSync(join(REPO, 'f'), name);
  git('add', 'f'); git('commit', '-q', '-m', name);
  SHA[name] = git('rev-parse', 'HEAD').stdout.trim();
}
test.after(() => rmSync(REPO, { recursive: true, force: true }));

test('① an ancestor of the live commit is refused; everything else publishes', () => {
  assert.equal(decidePublish({ candidate: 'a', live: 'b', status: 'behind' }).publish, false);
  assert.equal(decidePublish({ candidate: 'a', live: 'b', status: 'ahead' }).publish, true);
  assert.equal(decidePublish({ candidate: 'a', live: 'a', status: 'identical' }).publish, true, 'the manual re-publish of what is live');
  const d = decidePublish({ candidate: 'a', live: 'b', status: 'diverged' });
  assert.ok(d.publish && d.warn, 'a rewritten history has no order to keep — publish, and say so');
  assert.equal(decidePublish({ candidate: 'a', live: null }).publish, true, 'the first deployment ever');
  assert.throws(() => decidePublish({ candidate: 'a', live: 'b', status: 'weird' }), /unknown compare status/,
    'an answer it does not understand is not «allowed»');
});

/* The records GitHub held for the github-pages environment on 2026-09-30, newest first — as they
   stood at 20:17:30, the moment #848's `pages` job asked (1a66ec7's own deployment not yet created). */
const RECORDS = [
  { id: 9, sha: '8d7e473', state: 'success', at: '2026-09-30T20:14:27Z' },
  { id: 8, sha: '234b141', state: 'success', at: '2026-09-30T19:26:15Z' },
];

/** a GitHub REST stand-in: deployments and statuses from RECORDS, compare from THIS repo's history */
function fakeApi(records, { async = false } = {}) {
  const full = (s) => SHA[s] || s;
  const answer = (path) => {
    let m;
    if ((m = /deployments\?environment=github-pages&per_page=\d+&page=(\d+)$/.exec(path))) {
      return m[1] === '1' ? records.map((r) => ({ id: r.id, sha: full(r.sha), created_at: r.at })) : [];
    }
    if ((m = /deployments\/(\d+)\/statuses\?per_page=1$/.exec(path))) {
      const r = records.find((x) => String(x.id) === m[1]);
      return [{ state: r.state, created_at: r.at }];
    }
    if ((m = /compare\/([0-9a-f]+)\.\.\.([0-9a-f]+)$/.exec(path))) {
      const [base, head] = [m[1], m[2]];
      const anc = (a, b) => git('merge-base', '--is-ancestor', a, b).status === 0;
      return { status: base === head ? 'identical' : anc(head, base) ? 'behind' : anc(base, head) ? 'ahead' : 'diverged' };
    }
    throw new Error(`unexpected GET ${path}`);
  };
  return async ? (p) => Promise.resolve().then(() => answer(p)) : answer;
}

test('② replaying 2026-09-30: the late publish of 1a66ec7 over 8d7e473 is refused', async () => {
  assert.ok(Object.values(SHA).every((s) => /^[0-9a-f]{40}$/.test(s)), 'the replay repository was built');
  const cand = SHA['1a66ec7'];
  for (const async of [false, true]) {
    const v = await guard(fakeApi(RECORDS, { async }), 'o/r', cand);
    assert.equal(v.status, 'behind', `${async ? 'async' : 'sync'}: 1a66ec7 is the parent of the live 8d7e473`);
    assert.equal(v.publish, false);
    assert.equal(v.live, SHA['8d7e473']);
  }
  /* the child was still allowed over its parent — the order the merges happened in */
  const child = SHA['8d7e473'];
  const before = RECORDS.slice(1);           /* 20:13:47 — only 234b141 was live */
  assert.equal((await guard(fakeApi(before), 'o/r', child)).publish, true);
});

test('② «live» is the newest deployment whose LATEST status is success — a newer failure is not live', () => {
  const recs = [{ id: 3, sha: 'x', state: 'failure', at: 't3' }, { id: 2, sha: '8d7e473', state: 'success', at: 't2' },
    { id: 1, sha: '234b141', state: 'success', at: 't1' }];
  const get = (path) => {
    if (/statuses/.test(path)) { const r = recs.find((x) => path.includes(`/${x.id}/`)); return [{ state: r.state, created_at: r.at }]; }
    return /page=1$/.test(path) ? recs.map((r) => ({ id: r.id, sha: r.sha })) : [];
  };
  assert.deepEqual(liveDeployment(get, 'o/r'), { sha: '8d7e473', at: 't2', id: 2 }, 'synchronous when the reader is (worktree status)');
  assert.equal(liveDeployment(() => [], 'o/r'), null);
});

/* ── ③ every publisher runs the guard ─────────────────────────────────────────────────────── */
const DEPLOY = /^actions\/deploy-pages@/;
const workflows = readdirSync(WF).filter((f) => /\.ya?ml$/.test(f)).map((f) => ({ f, text: rd(join(WF, f)) }));

test('③ every job that publishes refuses an ancestor of what is live first', () => {
  const publishers = [];
  for (const { f, text } of workflows) {
    const w = yaml.load(text);
    for (const [id, job] of Object.entries(w.jobs || {})) {
      const steps = job.steps || [];
      const at = steps.findIndex((s) => DEPLOY.test(s.uses || ''));
      if (at < 0) continue;
      publishers.push(`${f}:${id}`);
      const conc = job.concurrency || w.concurrency;
      assert.equal(conc && conc.group, 'pages-production', `${f}:${id} publishes outside the production lock — the guard's answer could go stale`);
      if (/^# publishes-older-by-design: \S/m.test(text)) continue;   /* rollback.yml, which says why */

      const gi = steps.findIndex((s) => /node scripts\/pages-publish-guard\.mjs\b/.test(s.run || ''));
      assert.ok(gi >= 0 && gi < at, `${f}:${id} publishes without running the guard first`);
      const g = steps[gi];
      assert.ok(g.id, `${f}:${id}: the guard step needs an id for the publish to read`);
      assert.ok(!g['continue-on-error'], `${f}:${id}: «could not tell what is live» must stop the job`);
      assert.match(String(g.run), /--sha "\$\{GITHUB_SHA\}"/, `${f}:${id}: the guard is asked about the commit this run publishes`);
      assert.match(String(g.env && g.env.GITHUB_TOKEN), /github\.token/);
      assert.equal(String(steps[at].if).replace(/\s+/g, ' '), `\${{ steps.${g.id}.outputs.publish == 'true' }}`,
        `${f}:${id}: the publish must depend on the guard's answer`);
      const co = steps.slice(0, gi).find((s) => /^actions\/checkout@/.test(s.uses || ''));
      assert.ok(co, `${f}:${id}: the guard script is not checked out before it runs`);
      const sparse = co.with && co.with['sparse-checkout'];
      if (sparse) assert.match(sparse, /scripts\/pages-publish-guard\.mjs/);
      const perms = job.permissions || w.permissions || {};
      assert.equal(perms.deployments, 'read', `${f}:${id}: the guard reads deployments`);
      assert.ok(['read', 'write'].includes(perms.contents), `${f}:${id}: the guard compares commits and checks out`);
    }
  }
  /* found, not listed — but it must have found the two automatic publishers and the rollback */
  for (const p of ['ci.yml:pages', 'deploy.yml:deploy', 'rollback.yml:deploy']) assert.ok(publishers.includes(p), `${p} was not found`);
});

test('③ the exemption is the rollback\'s alone, and it says why', () => {
  const exempt = workflows.filter(({ text }) => /^# publishes-older-by-design: \S/m.test(text)).map(({ f }) => f);
  assert.deepEqual(exempt, ['rollback.yml']);
});

/* ── ④ the concurrency group, evaluated ───────────────────────────────────────────────────── */
/** GitHub's `a && b || c` returns operand values exactly like JavaScript's; evaluate the real string. */
function groupFor(expr, ctx) {
  const body = expr.replace(/\$\{\{\s*([\s\S]+?)\s*\}\}/g, (_, e) => {   /* not [^}] — format('{0}') holds braces */
    const js = e.replace(/\bgithub\.(\w+)/g, (_m, k) => JSON.stringify(ctx[k])).replace(/==/g, '===');
    const format = (f, ...a) => f.replace(/\{(\d+)\}/g, (_m, i) => a[i]);   /* GitHub's format() */
    return String(Function('format', `"use strict"; return (${js});`)(format));
  });
  return body;
}

test('④ a dispatch on main cannot cancel main\'s push run (the one that publishes)', () => {
  const ci = yaml.load(rd(join(WF, 'ci.yml')));
  assert.equal(ci.concurrency['cancel-in-progress'], true);
  const g = (event_name, ref) => groupFor(ci.concurrency.group, { workflow: 'CI', event_name, ref });
  const main = 'refs/heads/main';
  assert.notEqual(g('workflow_dispatch', main), g('push', main), 'a dispatch on main shares the publishing run\'s group');
  assert.notEqual(g('workflow_dispatch', main), g('schedule', main), 'nor the nightly\'s');
  assert.equal(g('push', main), 'ci-CI-refs/heads/main', 'a push on main keeps its group — a newer push still supersedes an older one');
  const fx = 'refs/heads/feat/x';
  assert.equal(g('workflow_dispatch', fx), g('workflow_dispatch', fx), 'a dispatch on a branch still cancels that branch\'s earlier dispatch (#R205)');
  assert.notEqual(g('workflow_dispatch', fx), g('workflow_dispatch', 'refs/heads/feat/y'), 'two branches\' dispatches do not cancel each other');
  assert.equal(g('pull_request', 'refs/pull/9/merge'), 'ci-CI-refs/pull/9/merge');
  assert.equal(g('schedule', main), 'ci-CI-nightly');
  /* and a dispatched run never publishes — the reason it may not cancel one that does */
  assert.match(String(ci.jobs.pages.if), /github\.event_name == 'push'/);
});
