/* ============================================================================
 *  #R801 — 「宣言されていない」と「失敗が測れない」は、どちらも緑に見える
 * ----------------------------------------------------------------------------
 *  セキュリティ監査で 3 つが見つかった。どれも門が緑のまま出荷されていた。
 *
 *    ・ `supabase/config.toml` の `[functions.radiation-feed]` に `verify_jwt` が無かった。
 *      #R351 が aviation-feed で見つけたのと同じ形——ブロックは在るが鍵が無く、CLI の既定は
 *      true なので、clean checkout からの deploy は公開レイヤーの前にログインを置く。
 *      既存の検査（r351 ⑯・r510 ①）は**自分の関数の綴り**しか見ていなかったので、次の関数には
 *      効かなかった。⇒ ブロックを**数え上げて全部**に対して測る（綴りを列挙しない）。
 *    ・ `db.yml` の drift check が `supabase db diff … || true` だった。CLI が非 0 で終わって
 *      何も出力しなければ空ファイル＝「drift 無し」に見える。測れなかったことと 0 を測った
 *      ことが同じ答えになっていた。
 *    ・ `db.yml` が `pull_request.paths` で発火を絞っていた。Ruleset の必須チェックにすると、
 *      DB に触れない PR は「結果が来ない」ままで永久に待つ。⇒ 発火は絞らず、job の中で
 *      判定して重い step を飛ばす。判定の一覧は job の中の 1 か所にだけある。
 *
 *  検査するもの:
 *
 *    ① config.toml の**すべての** [functions.*] ブロックが verify_jwt を明示している。
 *       ブロックの一覧は config.toml から数え上げ、関数ディレクトリの一覧は supabase/functions/
 *       から数え上げて、両者が一致することも見る（宣言されていない Edge Function は存在しない
 *       のと同じ・#R333）。
 *    ② db.yml の drift step は `|| true` を持たず、diff の exit code を自分で見る。
 *       `|| true` が許されるのは `always()` の後始末だけ。
 *    ③ db.yml のパス一覧は scope step の 1 か所にだけあり、どのトリガーにも path フィルタが無い。
 *    ④ db.yml の pull_request に paths / paths-ignore が無い。scope step より後の重い step は
 *       全部 scope の判定に従い、Ruleset が参照する job 名は変わっていない。
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as loadYaml } from 'js-yaml';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

/* config.toml を [functions.<name>] ごとに切る。註（`#` 行）は落とす——「書いてある」ではなく
   「してある」を見る。次の `[` 見出しまでがそのブロック。 */
function functionBlocks(toml) {
  const out = new Map();
  let cur = null;
  for (const raw of toml.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const head = /^\[(.+)\]$/.exec(line);
    if (head) {
      const fn = /^functions\.([A-Za-z0-9_-]+)$/.exec(head[1]);
      cur = fn ? fn[1] : null;
      if (cur) out.set(cur, []);
      continue;
    }
    if (cur) out.get(cur).push(line);
  }
  return out;
}

/* ── ① 全ブロックが verify_jwt を持つ ───────────────────────────────────────── */
test('R801 ① every [functions.*] block in supabase/config.toml states its own verify_jwt', () => {
  const blocks = functionBlocks(rd('supabase/config.toml'));
  assert.ok(blocks.size >= 2, 'the config declares Edge Functions');
  const missing = [];
  for (const [name, lines] of blocks) {
    const keys = lines.filter((l) => /^verify_jwt\s*=\s*(true|false)$/.test(l));
    if (keys.length !== 1) missing.push(name + (keys.length ? ` (${keys.length} keys)` : ''));
  }
  assert.deepEqual(missing, [],
    'a block without verify_jwt takes the CLI default (true) and puts a login in front of whatever it serves (#R351)');

  /* 関数ディレクトリの一覧は発見する。index.ts を持つものが関数で、_shared はライブラリ。 */
  const dirs = readdirSync(join(ROOT, 'supabase/functions'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(ROOT, 'supabase/functions', d.name, 'index.ts')))
    .map((d) => d.name).sort();
  const declared = [...blocks.keys()].sort();
  assert.deepEqual(declared, dirs,
    'every function directory has a [functions.*] block and every block has a directory (#R333)');
});

/* ── db.yml を 1 回だけ読む ────────────────────────────────────────────────── */
const DB_YML = '.github/workflows/db.yml';
const wf = loadYaml(rd(DB_YML));
const job = wf.jobs && wf.jobs.db;
const steps = (job && job.steps) || [];
const stepName = (s) => s.name || s.uses || '';

/* ── ② drift step は失敗を失敗として伝える ───────────────────────────────── */
test('R801 ② the drift check has no `|| true` and passes the CLI exit code through', () => {
  const drift = steps.find((s) => /drift/i.test(stepName(s)));
  assert.ok(drift && drift.run, 'the schema drift step exists and has a run block');
  assert.ok(!/\|\|\s*true/.test(drift.run), '`|| true` turns "could not measure" into "measured zero"');
  const diffLine = drift.run.split('\n').find((l) => /supabase db diff/.test(l));
  assert.ok(diffLine, 'the step runs `supabase db diff`');
  assert.ok(!/\|\|/.test(diffLine), 'the diff command must not swallow its own exit code');
  /* exit code は取って、非 0 なら失敗させる。 */
  assert.match(drift.run, /code=\$\?/, 'the exit code is captured right after the diff');
  assert.match(drift.run, /\[\s*"\$code"\s*-ne\s*0\s*\]/, 'a non-zero exit code is a failure');
  assert.match(drift.run, /exit\s+"\$code"/, 'the failure carries the CLI exit code');
  /* 空でない diff は今までどおり exit 1。 */
  assert.match(drift.run, /\[\s*-s\s+\/tmp\/db_diff\.sql\s*\]/);
  assert.match(drift.run, /exit 1/);

  /* `|| true` が残ってよいのは、判定を持たない always() の後始末だけ。 */
  for (const s of steps) {
    if (!s.run || !/\|\|\s*true/.test(s.run)) continue;
    assert.match(String(s.if || ''), /always\(\)/,
      `step "${stepName(s)}" swallows a failure with \`|| true\` but is not an always() cleanup step`);
  }
});

/* ── ③ 一覧は 1 つ ────────────────────────────────────────────────────────── */
test('R801 ③ the database path list lives in ONE place — the scope step — and no trigger filters on paths', () => {
  /* (#R793 landed first with the same shape and took the list out of `on:` altogether; a filter
     on push would not block a PR, but it would be a second copy of the list. So the fact measured
     is: exactly one list, inside the job, naming the four things the old trigger named.) */
  for (const ev of Object.keys(wf.on || {})) {
    const t = wf.on[ev];
    assert.ok(!t || (!('paths' in t) && !('paths-ignore' in t)), ev + ' still carries a path filter — the list would then exist twice');
  }
  const scope = (wf.jobs.db.steps || []).find((st) => st.id === 'scope');
  assert.ok(scope && typeof scope.run === 'string', 'a step with id `scope` decides whether the database changed');
  const m = scope.run.match(/DB_PATHS=(['"])(.*?)\1/);
  assert.ok(m, 'the scope step assigns DB_PATHS once, in its run block');
  for (const needle of ['supabase/', 'db\\.yml', 'backup-db\\.sh', 'restore-test\\.sh']) {
    assert.ok(m[2].includes(needle), 'DB_PATHS does not name ' + needle);
  }
  assert.match(scope.run, /git diff --name-only/, 'the verdict comes from the diff of changed files');
  assert.match(scope.run, /run=true/, 'the step reports run=true');
  assert.match(scope.run, /run=false/, 'the step reports run=false');
});

/* ── ④ PR は常に結果を返す ────────────────────────────────────────────────── */
test('R801 ④ pull_request is not path-filtered; heavy steps follow the scope verdict; the job name the Ruleset names is intact', () => {
  assert.ok(wf.on && 'pull_request' in wf.on, 'the workflow runs on pull_request');
  const pr = wf.on.pull_request;
  if (pr && typeof pr === 'object') {
    assert.ok(!('paths' in pr) && !('paths-ignore' in pr),
      'a paths filter on pull_request means a required check that never reports on unrelated PRs');
  }
  assert.equal(job && job.name, 'Migrations rebuild + RLS/permission tests',
    'the GitHub Ruleset requires this check by this name');

  const at = steps.findIndex((s) => s.id === 'scope');
  assert.ok(at >= 0, 'step `scope` exists');
  for (const s of steps.slice(0, at)) {
    assert.ok(!s.run, `step "${stepName(s)}" runs before the verdict — only checkout may precede it`);
  }
  for (const s of steps.slice(at + 1)) {
    assert.match(String(s.if || ''), /steps\.scope\.outputs\.run == 'true'/,
      `step "${stepName(s)}" would run (and start Docker) on a PR that did not touch the database`);
  }
});
