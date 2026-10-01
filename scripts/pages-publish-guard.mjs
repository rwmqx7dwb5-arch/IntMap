#!/usr/bin/env node
/*
 *  IntMap · pages-publish-guard — PRODUCTION NEVER MOVES BACKWARD
 *
 *  Every job that publishes to GitHub Pages runs this immediately before actions/deploy-pages, inside
 *  the `pages-production` concurrency group (so no other publish can land between the check and the
 *  publish). It asks GitHub which commit is LIVE — the newest `github-pages` deployment whose latest
 *  status is `success` — and refuses to publish a commit that is an ancestor of it.
 *
 *  ⚠ WHY THE CONCURRENCY GROUP WAS NOT ENOUGH. `pages-production` serializes publishes; it does not
 *  order them. ci.yml relied on «a newer push to main cancels the older run, publish included», which
 *  holds only when the newer commit STARTS a CI run on push. A bot merge made with GITHUB_TOKEN starts
 *  none — the lander dispatches deploy.yml instead — so nothing cancels the parent's CI run.
 *  MEASURED 2026-09-30: #848 (1a66ec7) pushed 20:07:52 and its CI run started; #849 (8d7e473, the
 *  catalogue bot, child of 1a66ec7) merged 20:11:29 and its deploy.yml published at 20:13:48; #848's
 *  `pages` job then published 1a66ec7 at 20:17:32 (deployment 6769207899) over it. Production stayed
 *  on the parent, and the catalogue refresh was silently undone.
 *
 *  The answer is read from the deployments API, not from the live /build-info.json: that file is
 *  served through the Pages CDN (max-age 600) and can trail the deployment it describes by minutes.
 *  The deployment record carries the sha the publishing run was started for (GITHUB_SHA).
 *
 *  Decision (base = live, head = candidate, GitHub's compare status):
 *    identical  → publish (a re-publish of what is live — the manual button's purpose)
 *    ahead      → publish (the candidate is newer)
 *    behind     → REFUSE  (the candidate is an ancestor of what is live: publishing it moves backward)
 *    diverged   → publish, with a warning (history was rewritten; there is no order to keep)
 *    no live deployment → publish (the first one)
 *  A refusal is the job done, not a failure: the live commit already contains the candidate.
 *  An API error is a failure (exit 1): «could not tell» is not «allowed», and not «refused» either.
 *
 *  Usage (in a workflow):  node scripts/pages-publish-guard.mjs --sha "$GITHUB_SHA"
 *    env GITHUB_TOKEN (needs deployments: read, contents: read), GITHUB_REPOSITORY;
 *    writes publish=true|false and live=<sha> to $GITHUB_OUTPUT, a line to $GITHUB_STEP_SUMMARY.
 */
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const ENVIRONMENT = 'github-pages';

/** The pure decision. `status` is GitHub's compare status of base=live...head=candidate. */
export function decidePublish({ candidate, live, status }) {
  if (!candidate) throw new Error('no candidate sha');
  if (!live) return { publish: true, reason: 'no successful github-pages deployment exists yet' };
  switch (status) {
    case 'identical': return { publish: true, reason: `${short(candidate)} is what is live — re-publishing it` };
    case 'ahead': return { publish: true, reason: `${short(candidate)} is newer than the live ${short(live)}` };
    case 'behind': return { publish: false, reason: `${short(candidate)} is an ancestor of the live ${short(live)} — publishing it would move production backward` };
    case 'diverged': return { publish: true, warn: true, reason: `${short(candidate)} and the live ${short(live)} have diverged (history rewritten) — there is no order to keep` };
    default: throw new Error(`unknown compare status «${status}» for ${short(live)}...${short(candidate)}`);
  }
}

const short = (s) => String(s || '').slice(0, 7);

/* `then` without forcing a Promise: liveDeployment is synchronous when getJson is (worktree.mjs's
   `status` is a synchronous report) and a Promise when getJson is (the workflow's fetch). One rule,
   both readers — no second copy of «which deployment is live». */
const then = (v, f) => (v && typeof v.then === 'function' ? v.then(f) : f(v));

/** The newest github-pages deployment whose LATEST status is success: { sha, at, id } or null.
    `getJson(path)` is a GitHub REST GET relative to https://api.github.com/ (injected: the workflow
    uses fetch + GITHUB_TOKEN, scripts/worktree.mjs uses `gh api`). Deployments come newest first.
    ⚠ Ordered by the DEPLOYMENT, not by the run that made it: the run that started first can publish
    last (2026-09-30 — and `worktree status` then named the commit that was overwritten as live). */
export function liveDeployment(getJson, repo, { pages = 3 } = {}) {
  const page = (n) => (n > pages ? null
    : then(getJson(`repos/${repo}/deployments?environment=${ENVIRONMENT}&per_page=20&page=${n}`), (deps) =>
      (!Array.isArray(deps) || !deps.length ? null : one(deps, 0, n))));
  const one = (deps, i, n) => (i >= deps.length ? page(n + 1)
    : then(getJson(`repos/${repo}/deployments/${deps[i].id}/statuses?per_page=1`), (st) => {
      const s = Array.isArray(st) && st[0];
      return s && s.state === 'success'
        ? { sha: deps[i].sha, at: s.created_at || deps[i].created_at, id: deps[i].id }
        : one(deps, i + 1, n);
    }));
  return page(1);
}

export async function compareStatus(getJson, repo, base, head) {
  const c = await getJson(`repos/${repo}/compare/${base}...${head}`);
  if (!c || typeof c.status !== 'string') throw new Error(`compare ${short(base)}...${short(head)} returned no status`);
  return c.status;
}

/** Everything above, for one candidate. */
export async function guard(getJson, repo, candidate) {
  const live = await liveDeployment(getJson, repo);
  if (!live) return { ...decidePublish({ candidate, live: null }), live: null };
  const status = live.sha === candidate ? 'identical' : await compareStatus(getJson, repo, live.sha, candidate);
  return { ...decidePublish({ candidate, live: live.sha, status }), live: live.sha, status };
}

function fetchJson(token) {
  return async (path) => {
    const r = await fetch(`https://api.github.com/${path}`, {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (!r.ok) throw new Error(`GET ${path} → HTTP ${r.status}`);
    return r.json();
  };
}

async function main(argv) {
  const i = argv.indexOf('--sha');
  const candidate = i >= 0 ? argv[i + 1] : process.env.GITHUB_SHA;
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!candidate || !repo || !token) {
    console.error('pages-publish-guard: needs --sha (or GITHUB_SHA), GITHUB_REPOSITORY and GITHUB_TOKEN');
    return 1;
  }
  let v;
  try { v = await guard(fetchJson(token), repo, candidate); }
  catch (e) {
    console.error(`::error::pages-publish-guard could not tell what is live (${e.message}). Not publishing blind.`);
    return 1;
  }
  const line = `${v.publish ? 'publish' : 'REFUSED'}: ${v.reason}`;
  console.log(v.publish ? (v.warn ? `::warning::${line}` : line) : `::notice::${line}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `publish=${v.publish}\nlive=${v.live || ''}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `**Pages publish guard** — ${line}\n`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
}
