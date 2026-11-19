/*
 *  release-contract — 公開されるクライアントは、それが要求するサーバーの版が本番に出てから公開される
 *  （scripts/release-contract.mjs）。2026-11-18: Pages だけが更新され、migration の失敗で 22 本の
 *  Edge Function が数時間古いまま残った。ここは次を測る:
 *   ① サーバー面は supabase-deploy.yml の push paths から導かれる（第二の一覧が無い）
 *   ② 判定の表: 失敗・待ち・子孫での成功・db.yml の赤・run が無い、を取り違えない。待ちは期限で赤
 *   ③ 実リポジトリの契約: クライアントが叩く関数は配備する名簿に在る
 *   ④ ci.yml の公開 job は discover した全部が server-ready を待つ（job を足しても漏れない）
 *   ⑤ 公開後の照合: 404 の関数を見つける・測れないものを「在る」にしない
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';
import {
  serverPathsFromWorkflow, deriveContract, contractProblems, decideGate, waitGate,
  missingOnProduction, serverHead, DEPLOY_WORKFLOW,
} from '../scripts/release-contract.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const SERVER = rd(`.github/workflows/${DEPLOY_WORKFLOW}`);

test('① the server surface is the deploy workflow trigger paths', () => {
  const paths = serverPathsFromWorkflow(SERVER);
  for (const p of ['supabase/functions/**', 'supabase/migrations/**', 'supabase/config.toml']) assert.ok(paths.includes(p), p);
  assert.throws(() => serverPathsFromWorkflow('on:\n  push:\n    branches: [main]\n'), /no push paths/);
});

test('① serverHead is the last commit that touched the surface, not the last commit', () => {
  const repo = mkdtempSync(join(tmpdir(), 'rc-'));
  const g = (...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { cwd: repo, encoding: 'utf8' });
  g('init', '-q');
  mkdirSync(join(repo, 'supabase/migrations'), { recursive: true });
  writeFileSync(join(repo, 'supabase/migrations/1.sql'), 'a');
  g('add', '-A'); g('commit', '-qm', 'server');
  const server = g('rev-parse', 'HEAD').stdout.trim();
  writeFileSync(join(repo, 'client.js'), 'x');
  g('add', '-A'); g('commit', '-qm', 'client only');
  const tip = g('rev-parse', 'HEAD').stdout.trim();
  const run = (a) => g(...a).stdout.trim();
  assert.equal(serverHead(tip, serverPathsFromWorkflow(SERVER), run), server);
  assert.notEqual(server, tip);
});

const sha = 'a'.repeat(40), head = 'b'.repeat(40), later = 'c'.repeat(40);
const descends = (a, d) => a === d || (a === head && d === later) || (a === head && d === sha);
const run = (headSha, status, conclusion = null, id = 1) => ({ id, headSha, status, conclusion });
const dbOk = [run(sha, 'completed', 'success', 9)];

test('② the decision table', () => {
  const d = (runs, dbRuns = dbOk, h = head) => decideGate({ sha, head: h, runs, dbRuns, descends });
  assert.equal(d([run(head, 'completed', 'success')]).state, 'ok');
  assert.equal(d([run(later, 'completed', 'success')]).state, 'ok', 'a descendant green deploy carries the surface');
  assert.equal(d([run(head, 'in_progress')]).state, 'wait');
  assert.equal(d([]).state, 'wait', 'no run is not a success');
  // 2026-11-18: the migration failed and nothing newer succeeded — the case that left 22 functions behind
  const failed = d([run(head, 'completed', 'failure', 2)]);
  assert.equal(failed.state, 'fail'); assert.match(failed.reason, /behind/);
  assert.equal(d([run(head, 'completed', 'failure', 2), run(later, 'completed', 'success', 3)]).state, 'ok', 'a later green deploy repairs it');
  assert.equal(d([run(head, 'completed', 'failure', 2), run(later, 'in_progress', null, 3)]).state, 'wait');
  assert.equal(d([run('d'.repeat(40), 'completed', 'success')]).state, 'wait', 'an unrelated commit proves nothing');
  assert.equal(d([run(head, 'completed', 'success')], [run(sha, 'completed', 'failure')]).state, 'fail', 'db.yml red holds the publish');
  assert.equal(d([run(head, 'completed', 'success')], []).state, 'wait', 'db.yml not started is not green');
  assert.equal(d([run(head, 'completed', 'success')], [run(sha, 'completed', 'cancelled')]).state, 'fail');
  assert.equal(d([], dbOk, null).state, 'ok', 'a history with no server surface needs no deploy');
});

test('② waiting ends in red at the deadline and in green when the deploy lands', async () => {
  let t = 0;
  const base = { sha, head, descends, sleep: async (ms) => { t += ms; }, now: () => t, deadlineMs: 600000, pollMs: 30000 };
  const never = await waitGate({ ...base, getRuns: async (wf) => (wf === DEPLOY_WORKFLOW ? [run(head, 'in_progress')] : dbOk) });
  assert.equal(never.state, 'fail'); assert.match(never.reason, /timed out/);
  t = 0; let polls = 0;
  const lands = await waitGate({ ...base, getRuns: async (wf) => (wf === DEPLOY_WORKFLOW ? [run(head, ++polls > 3 ? 'completed' : 'in_progress', polls > 3 ? 'success' : null)] : dbOk) });
  assert.equal(lands.state, 'ok');
});

test('③ the real contract: every function the client calls is one this commit deploys', () => {
  const c = deriveContract({ sha: 'x', head: 'y' });
  assert.deepEqual(contractProblems(c), []);
  assert.ok(c.server.clientRequires.length >= 5, 'the client Edge Function calls were found');
  assert.match(c.server.migrationHead, /^\d{14}$/);
  const bad = contractProblems({ server: { roster: ['a'], clientRequires: ['a', 'ghost'] } });
  assert.equal(bad.length, 1); assert.match(bad[0], /ghost/);
});

test('④ every publishing job of ci.yml waits for server-ready, and the site carries the contract', () => {
  const text = rd('.github/workflows/ci.yml');
  const wf = yaml.load(text);
  const publishers = Object.entries(wf.jobs).filter(([, j]) => /deploy-pages|aws-publish\.mjs --stamp/.test(JSON.stringify(j.steps || [])));
  assert.deepEqual(publishers.map(([id]) => id).sort(), ['aws', 'pages']);
  for (const [id, j] of publishers) {
    assert.ok([].concat(j.needs).includes('server-ready'), `${id} needs server-ready`);
    assert.match(j.if, /needs\.server-ready\.result == 'success'/, `${id} reads its result`);
  }
  const gate = wf.jobs['server-ready'];
  assert.equal(gate.permissions.actions, 'read');
  assert.match(JSON.stringify(gate.steps), /release-contract\.mjs --gate/);
  assert.equal(gate.steps[0].with['fetch-depth'], 0, 'the gate reads history');
  assert.match(text, /release-contract\.mjs --write dist/, 'the build stamps dist/ before it is copied to _site');
  assert.match(JSON.stringify(wf.jobs['post-smoke'].steps), /release-contract\.mjs --live/);
});

test('⑤ the live probe: 404 is missing, an unreachable probe is unknown, 401 is present', async () => {
  const status = { 'ai-proxy': 401, 'who-don': 404, 'ais-feed': 200 };
  const f = async (url) => { const n = url.split('/').pop(); if (n === 'down') throw new Error('net'); return { status: status[n] }; };
  const r = await missingOnProduction(['ai-proxy', 'who-don', 'ais-feed', 'down'], 'https://x.supabase.co', f);
  assert.deepEqual(r, { missing: ['who-don'], unknown: ['down'] });
});
