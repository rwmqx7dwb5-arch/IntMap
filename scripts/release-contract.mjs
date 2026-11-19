#!/usr/bin/env node
/* ============================================================================
 *  IntMap · release-contract — 公開されるクライアントと、本番のサーバーの「互換の契約」
 * ----------------------------------------------------------------------------
 *  配備単位は 3 つ（Pages・Edge Functions・DB）で、別々のワークフローが出す。ci.yml の Pages 公開は
 *  build・静的検査・ブラウザ検査にしか依存せず、`db.yml`（migration の再構築と RLS 検査）と
 *  `supabase-deploy.yml`（Edge Function と migration の本番配備）の結果を待たなかった。
 *  ⚠ 実測 2026-11-18: Pages だけが更新され、migration の失敗で 22 本の Edge Function が数時間
 *  古いまま残った（新しいクライアントが古いサーバーを叩く状態）。
 *
 *  契約（検証できる形）:
 *    ① 公開される commit S は「サーバー面」の版 H を要求する。H = S 以前でサーバー面を最後に
 *       触れた commit。サーバー面の定義は supabase-deploy.yml の push `paths:` そのもの
 *       （＝配備を起動する条件。第二の一覧を持たない）。
 *    ② 公開の前（--gate）: H か H の子孫 commit での supabase-deploy の push run が成功していること、
 *       かつ S の db.yml の push run が成功していること。実行中なら待つ。失敗・取消は赤。
 *       待ちきれなければ赤（Pages は出ない。公開は再実行か次の push が出す）。
 *    ③ 公開物に release-contract.json を同梱する（--write）: S・H・migration の先頭・
 *       クライアントが叩く Edge Function の名簿。名簿は js/ と src/ の `functions/v1/<name>` から導く。
 *    ④ 公開の後（--live）: 公開された契約を読み戻し、クライアントが叩く各関数が本番に実在すること
 *       （存在しない関数は 404）を確かめる。実在しなければ赤。
 *
 *  ⚠ migration の本番適用そのものは SUPABASE_ACCESS_TOKEN が要るので Pages の job では測らない。
 *  それは supabase-deploy の成功（`db push` はその job の中）が運ぶ——②が見るのはその成功。
 *  夜間の drift（release-state.mjs）が、本番との実測の突き合わせを続ける。
 *  ⚠ 「見つからなかった」を「成功した」にしない。run が 1 本も無ければ待ち、期限で赤。
 *
 *      node scripts/release-contract.mjs --gate --sha <sha>      # 公開前（CI。GITHUB_TOKEN が要る）
 *      node scripts/release-contract.mjs --write <dir> --sha <sha> # <dir>/release-contract.json を書く
 *      node scripts/release-contract.mjs --live <page_url>        # 公開後
 *      node scripts/release-contract.mjs --show                   # いまの checkout の契約を印字
 * ==========================================================================*/
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as yaml from 'js-yaml';
import { edgeRoster, supabaseRefFrom } from './release-state.mjs';

export const CONTRACT_FILE = 'release-contract.json';
export const DEPLOY_WORKFLOW = 'supabase-deploy.yml';
export const DB_WORKFLOW = 'db.yml';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ---------------------------------------------------------------- 導出（手で書かない） */

/** サーバー面＝supabase-deploy.yml の push `paths:`。配備を起動する条件と、契約が見る面は同じものでなければならない。 */
export const serverPathsFromWorkflow = (workflowText) => {
  const wf = yaml.load(String(workflowText));
  const on = wf && (wf.on || wf[true]);
  const paths = on && on.push && on.push.paths;
  if (!Array.isArray(paths) || !paths.length) throw new Error(`${DEPLOY_WORKFLOW} declares no push paths — the server surface cannot be derived`);
  return paths;
};

/** pathspec（`dir/**` 形）を git の pathspec に。`**` は git では `:(glob)` が要る。 */
export const toPathspec = (p) => `:(glob)${p}`;

const walkJs = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkJs(p, out);
    else if (/\.(m?js|ts)$/.test(e.name)) out.push(p);
  }
  return out;
};

/** クライアントが叩く Edge Function の名簿＝出荷しているコード（js/ と src/）の `functions/v1/<name>` から。 */
export const clientRequiredFunctions = (root = ROOT) => {
  const names = new Set();
  for (const f of [...walkJs(path.join(root, 'js')), ...walkJs(path.join(root, 'src'))]) {
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/functions\/v1\/([a-z][a-z0-9-]*)/g)) names.add(m[1]);
  }
  return [...names].sort();
};

/** migration の先頭（最新の版）。ファイル名の 14 桁 prefix。 */
export const migrationHead = (root = ROOT) => {
  const dir = path.join(root, 'supabase/migrations');
  if (!existsSync(dir)) return null;
  const v = readdirSync(dir).map((n) => /^(\d{14})_/.exec(n)).filter(Boolean).map((m) => m[1]).sort();
  return v.length ? v[v.length - 1] : null;
};

const git = (args, opts = {}) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();

/** S 以前でサーバー面を最後に触れた commit。 */
export const serverHead = (sha, paths, run = git) => {
  const h = run(['log', '-1', '--format=%H', sha, '--', ...paths.map(toPathspec)]);
  return h || null;
};

export const deriveContract = ({ root = ROOT, sha, head }) => ({
  schema: 1,
  sha,
  server: {
    head,
    migrationHead: migrationHead(root),
    roster: edgeRoster(root),
    clientRequires: clientRequiredFunctions(root),
  },
});

/** 契約の内部整合: クライアントが叩く関数は、同じ commit が配備する名簿に無ければならない。 */
export const contractProblems = (c) => {
  const have = new Set(c.server.roster);
  return c.server.clientRequires.filter((n) => !have.has(n)).map((n) => `client calls functions/v1/${n}, which supabase/functions does not declare`);
};

/* ---------------------------------------------------------------- 公開前の判定（純粋） */

const done = (r) => r.status === 'completed';

/**
 * @param runs     supabase-deploy の push run（headSha / status / conclusion）
 * @param dbRuns   db.yml の push run
 * @param descends (ancestor, descendant) => bool  — 同一 commit も真
 * 返り値 state: 'ok' | 'wait' | 'fail'
 */
export const decideGate = ({ sha, head, runs, dbRuns, descends }) => {
  const reasons = [];
  /* ── DB: S そのものの db.yml run */
  const db = (dbRuns || []).filter((r) => r.headSha === sha);
  const dbDone = db.find((r) => done(r) && r.conclusion === 'success');
  const dbBad = !dbDone && db.find((r) => done(r) && r.conclusion !== 'success');
  if (dbBad) return { state: 'fail', reason: `${DB_WORKFLOW} for ${sha.slice(0, 8)} ended ${dbBad.conclusion} (run ${dbBad.id}) — the migrations / RLS tests are not green` };
  if (!dbDone) reasons.push(db.length ? `${DB_WORKFLOW} for ${sha.slice(0, 8)} is still ${db[0].status}` : `${DB_WORKFLOW} has no push run for ${sha.slice(0, 8)} yet`);

  /* ── サーバー配備: H か H の子孫 */
  if (head) {
    const mine = (runs || []).filter((r) => r.headSha && descends(head, r.headSha));
    const ok = mine.find((r) => done(r) && r.conclusion === 'success');
    if (!ok) {
      const open = mine.filter((r) => !done(r));
      const bad = mine.filter((r) => done(r) && r.conclusion !== 'success');
      if (!open.length && bad.length) {
        const b = bad[0];
        return { state: 'fail', reason: `${DEPLOY_WORKFLOW} at ${b.headSha.slice(0, 8)} ended ${b.conclusion} (run ${b.id}) and nothing newer succeeded — the server is behind ${head.slice(0, 8)}, the commit that last changed it` };
      }
      reasons.push(open.length ? `${DEPLOY_WORKFLOW} for the server surface (${head.slice(0, 8)}) is still ${open[0].status}` : `${DEPLOY_WORKFLOW} has no push run for the server surface (${head.slice(0, 8)}) yet`);
    }
  }
  return reasons.length ? { state: 'wait', reason: reasons.join('; ') } : { state: 'ok', reason: head ? `server surface ${head.slice(0, 8)} is deployed and ${DB_WORKFLOW} is green for ${sha.slice(0, 8)}` : `${DB_WORKFLOW} is green for ${sha.slice(0, 8)} (no server surface in history)` };
};

/** 待つ。getRuns(workflowFile) は {id, headSha, status, conclusion}[]。時間は注入（検査が時計を要さない）。 */
export const waitGate = async ({ sha, head, getRuns, descends, sleep, now, deadlineMs, pollMs }) => {
  const t0 = now();
  let last;
  for (;;) {
    last = decideGate({ sha, head, runs: await getRuns(DEPLOY_WORKFLOW), dbRuns: await getRuns(DB_WORKFLOW), descends });
    if (last.state !== 'wait') return last;
    if (now() - t0 >= deadlineMs) return { state: 'fail', reason: `timed out after ${Math.round(deadlineMs / 60000)} min: ${last.reason}` };
    await sleep(pollMs);
  }
};

/* ---------------------------------------------------------------- 公開後の照合 */

/** Supabase は存在しない関数に 404 を返す（存在すれば verify_jwt の 401 でも 200 でも 404 ではない）。 */
export const missingOnProduction = async (names, base, fetchFn) => {
  const missing = [], unknown = [];
  for (const n of names) {
    let status = null;
    for (let i = 0; i < 3 && status === null; i++) {
      try { status = (await fetchFn(`${base}/functions/v1/${n}`, { method: 'OPTIONS' })).status; } catch { /* retry */ }
    }
    if (status === null) unknown.push(n);
    else if (status === 404) missing.push(n);
  }
  return { missing, unknown };
};

/* ---------------------------------------------------------------- CLI */

const ghFetch = (token, repo) => async (wf) => {
  const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${wf}/runs?branch=main&event=push&per_page=100`, {
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' },
  });
  if (!r.ok) throw new Error(`GET workflow runs ${wf} → HTTP ${r.status}`);
  const j = await r.json();
  return (j.workflow_runs || []).map((x) => ({ id: x.id, headSha: x.head_sha, status: x.status, conclusion: x.conclusion }));
};

const arg = (argv, k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const summary = (line) => { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `**Release contract** — ${line}\n`); };

async function main(argv) {
  const wfText = readFileSync(path.join(ROOT, '.github/workflows', DEPLOY_WORKFLOW), 'utf8');
  const paths = serverPathsFromWorkflow(wfText);
  const sha = arg(argv, '--sha') || process.env.GITHUB_SHA || git(['rev-parse', 'HEAD']);

  if (argv.includes('--show') || arg(argv, '--write')) {
    const c = deriveContract({ sha, head: serverHead(sha, paths) });
    const bad = contractProblems(c);
    if (bad.length) { for (const b of bad) console.log(`::error::${b}`); return 1; }
    const dir = arg(argv, '--write');
    if (dir) { writeFileSync(path.join(dir, CONTRACT_FILE), JSON.stringify(c, null, 2) + '\n'); console.log(`wrote ${path.join(dir, CONTRACT_FILE)}`); }
    console.log(JSON.stringify(c, null, 2));
    return 0;
  }

  if (argv.includes('--gate')) {
    const token = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPOSITORY;
    if (!token || !repo) { console.error('release-contract --gate needs GITHUB_TOKEN and GITHUB_REPOSITORY'); return 1; }
    const head = serverHead(sha, paths);
    const descends = (a, d) => { try { git(['merge-base', '--is-ancestor', a, d]); return true; } catch { return false; } };
    const v = await waitGate({
      sha, head, getRuns: ghFetch(token, repo), descends,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)), now: Date.now,
      deadlineMs: Number(process.env.RELEASE_CONTRACT_WAIT_MIN || 25) * 60000, pollMs: 30000,
    });
    console.log(v.state === 'ok' ? v.reason : `::error::publish held — ${v.reason}`);
    summary(`${v.state === 'ok' ? 'satisfied' : 'HELD'}: ${v.reason}`);
    return v.state === 'ok' ? 0 : 1;
  }

  const live = arg(argv, '--live');
  if (live) {
    const base = `https://${supabaseRefFrom(readFileSync(path.join(ROOT, 'src/vendor.js'), 'utf8'))}.supabase.co`;
    const r = await fetch(new URL(`${CONTRACT_FILE}?t=${Date.now()}`, live.endsWith('/') ? live : `${live}/`), { cache: 'no-store' });
    if (!r.ok) { console.log(`::error::${CONTRACT_FILE} is not published at ${live} (HTTP ${r.status})`); return 1; }
    const c = await r.json();
    const { missing, unknown } = await missingOnProduction(c.server.clientRequires, base, fetch);
    if (missing.length || unknown.length) {
      console.log(`::error::the published client (${String(c.sha).slice(0, 8)}) calls Edge Functions production ${missing.length ? `does not have: ${missing.join(', ')}` : ''}${unknown.length ? ` could not be probed: ${unknown.join(', ')}` : ''}`);
      return 1;
    }
    console.log(`all ${c.server.clientRequires.length} Edge Functions the published client calls exist on production`);
    summary(`live: ${c.server.clientRequires.length} functions present (client ${String(c.sha).slice(0, 8)}, server surface ${String(c.server.head).slice(0, 8)}, migration head ${c.server.migrationHead})`);
    return 0;
  }
  console.error('usage: release-contract.mjs --gate | --write <dir> | --live <url> | --show');
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; }, (e) => { console.error(`::error::release-contract: ${e.message}`); process.exitCode = 1; });
}
