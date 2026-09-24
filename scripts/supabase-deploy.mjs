#!/usr/bin/env node
/* ============================================================================
 *  IntMap · Supabase の配備をコードにする — 変わった Edge Function と、足された migration だけを出す
 * ----------------------------------------------------------------------------
 *  `.github/workflows/supabase-deploy.yml` が main への push ごとに呼ぶ。手でも同じものが走る:
 *
 *      node scripts/supabase-deploy.mjs --before <sha> --after <sha>      # その push の差分だけ
 *      node scripts/supabase-deploy.mjs --all                             # 全関数（migration は出さない）
 *      node scripts/supabase-deploy.mjs --before <sha> --after <sha> --plan   # 何を出すかを印字するだけ
 *      node scripts/supabase-deploy.mjs --link                            # link だけ（ドリフト検査の前段）
 *
 *  ⚠ なぜ要るのか。Pages は deploy.yml が push ごとに出していたのに、Edge Function 17 本と migration は
 *  **人が覚えていたときだけ**出ていた。実測: 2026-09-16 に Edge 17 本中 7 本がリポジトリと別のソースで
 *  走っていた（docs/RELEASE.md）／#R806 では config.toml の `verify_jwt = false` が 5 ラウンド本番に
 *  届かず、放射線 feed が全読者に 401 を返していた／本番の migration 履歴には local 7 本が記録されて
 *  いない。どれも「覚えている人がいなかった」であって、判断の誤りではない。
 *
 *  ⚠ 名前を 1 つも手で書かない:
 *    · 関数の名簿は `supabase/config.toml` の `[functions.*]`（`functions deploy` が verify_jwt を
 *      読む先がそこなので、そこに無い関数は宣言された設定で出せない——出さずに赤くする）
 *    · project ref は出荷しているコードが叩く URL（`src/vendor.js`、release-state.mjs と同じ導出）
 *
 *  何を出すか（`planDeploy`）:
 *    · `supabase/functions/<name>/**` が変わった → その関数
 *    · `supabase/functions/_shared/**` か `supabase/config.toml` が変わった → **全関数**
 *      （_shared は import した関数の中に束ねられる／config.toml は verify_jwt の置き場で、#R806 の
 *      直しは config.toml だけの変更だった——関数ディレクトリだけ見ていたら、あの修正は出なかった）
 *    · `supabase/migrations/*.sql` が**足された** → `supabase db push`
 *
 *  ⚠⚠⚠ `db push` は「その push が足した migration だけ」を出すときにしか走らせない。
 *  `db push` は**リモートの履歴に無い local の migration を全部**流す。本番の履歴は baseline
 *  （20260718090000）を記録していない（docs/MIGRATIONS.md）ので、無防備に走らせると live DB に
 *  baseline を流し直す。だから先に `--dry-run` で流れるものを数え、それが**この push が足したもの
 *  と完全に一致するときだけ**本番に出す。一致しなければ赤で止まり、何が余分か・何が足りないかを言う。
 *  ⚠ 「測れなかった」を「何も無い」の代わりにしない——dry-run 自身が失敗したら、それも赤。
 * ==========================================================================*/
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
/* project ref の導出は release-state.mjs が正本（同じ判断を 2 か所に持たない） */
import { supabaseRefFrom } from './release-state.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ---------------------------------------------------------------- 純関数（検査が直に測る） */

/** config.toml の `[functions.<name>]` を上から順に。 */
export const functionRosterFromConfig = (toml) =>
  [...String(toml || '').matchAll(/^\[functions\.([A-Za-z0-9_-]+)\]\s*$/gm)].map((m) => m[1]);

/** `git diff --name-status --no-renames` の出力を {status, file} に。 */
export const parseNameStatus = (text) => String(text || '').split(/\r?\n/)
  .map((l) => l.split('\t'))
  .filter((c) => c.length >= 2 && /^[AMDTCUXB]/.test(c[0]))
  .map((c) => ({ status: c[0][0], file: c[c.length - 1] }));

/** 差分から「何を出すか」。 */
export const planDeploy = (changes, roster) => {
  const fns = new Set();
  let all = null;
  const unknownDirs = new Set();
  const added = [], editedApplied = [];
  for (const { status, file } of changes) {
    if (file === 'supabase/config.toml') { all = all || 'supabase/config.toml changed (verify_jwt and per-function settings live there)'; continue; }
    let m = /^supabase\/functions\/([^/]+)\//.exec(file);
    if (m) {
      if (m[1] === '_shared') { all = all || `supabase/functions/_shared changed (${file}) — every function bundles it`; continue; }
      if (roster.includes(m[1])) fns.add(m[1]);
      else if (status !== 'D') unknownDirs.add(m[1]);
      continue;
    }
    m = /^supabase\/migrations\/(\d{14})_[^/]+\.sql$/.exec(file);
    if (m) {
      if (status === 'A') added.push(m[1]);
      else if (status === 'M') editedApplied.push(m[1]);
    }
  }
  return {
    functions: all ? [...roster] : roster.filter((n) => fns.has(n)),
    all,
    unknownFunctionDirs: [...unknownDirs].sort(),
    migrations: { added: added.sort(), edited: editedApplied.sort() },
  };
};

/** `supabase db push --dry-run` が「流す」と言った version。 */
export const pendingFromDryRun = (text) =>
  [...new Set([...String(text || '').matchAll(/(?<!\d)(\d{14})_[A-Za-z0-9_.-]*\.sql/g)].map((m) => m[1]))].sort();

/** dry-run が流すものと、この push が足したもの。一致しなければ理由を返す（null＝一致）。 */
export const migrationMismatch = (pending, added) => {
  const extra = pending.filter((v) => !added.includes(v));
  const notPending = added.filter((v) => !pending.includes(v));
  if (!extra.length && !notPending.length) return null;
  const why = [];
  if (extra.length) why.push(`db push would ALSO apply ${extra.join(' ')} — migrations this push did not add. The production history is not reconciled with supabase/migrations (docs/MIGRATIONS.md); running it would re-run them against the live database`);
  if (notPending.length) why.push(`db push would NOT apply ${notPending.join(' ')} although this push added them (already recorded remotely, or timestamped before the remote head)`);
  return why.join('; ');
};

/* ---------------------------------------------------------------- 実行 */

const sh = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: opts.timeout || 600_000 });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  return { code: r.status == null ? 1 : r.status, out, error: r.error };
};
const err = (msg) => console.log(`::error::${msg}`);

const main = () => {
  const A = process.argv.slice(2);
  const val = (f) => { const i = A.indexOf(f); return i >= 0 ? A[i + 1] : null; };
  const onlyPlan = A.includes('--plan');

  const roster = functionRosterFromConfig(readFileSync(path.join(ROOT, 'supabase/config.toml'), 'utf8'));
  const vendor = path.join(ROOT, 'src/vendor.js');
  const REF = supabaseRefFrom(existsSync(vendor) ? readFileSync(vendor, 'utf8') : '');
  if (!roster.length) { err('supabase/config.toml declares no [functions.*] — refusing to guess the roster'); process.exit(1); }
  if (!REF) { err('could not derive the project ref from src/vendor.js'); process.exit(1); }

  /* `--link`: link だけして終わる（nightly のドリフト検査が release-state.mjs の前に呼ぶ）。
     link は supabase/.temp に ref と pooler を書く。SUPABASE_ACCESS_TOKEN だけで足りる——
     実測 2026-09-25: DB パスワード無しで `db query --linked`・`migration list --linked`・
     `db push --linked --dry-run` が CLI の一時 login role で通った。 */
  const doLink = () => {
    const link = sh('supabase', ['link', '--project-ref', REF]);
    if (link.code !== 0) { err(`supabase link failed:\n${link.out}`); process.exit(1); }
  };
  if (A.includes('--link')) { doLink(); console.log(`linked ${REF}`); return; }

  /* 差分。before が無い（新しい branch・force push・手動）ときは全関数——「差分を測れなかった」を
     「何も変わっていない」にしない。migration はその場合流さない（どれを流すかを選べないので）。 */
  let plan;
  const before = val('--before'), after = val('--after') || 'HEAD';
  const zero = !before || /^0+$/.test(before);
  const known = !zero && sh('git', ['cat-file', '-e', `${before}^{commit}`]).code === 0;
  if (A.includes('--all') || !known) {
    plan = { functions: [...roster], all: A.includes('--all') ? '--all' : `the push has no usable base (${before || 'none'}) — deploying every function`, unknownFunctionDirs: [], migrations: { added: [], edited: [] } };
  } else {
    const d = sh('git', ['diff', '--name-status', '--no-renames', before, after]);
    if (d.code !== 0) { err(`git diff ${before}..${after} failed:\n${d.out}`); process.exit(1); }
    plan = planDeploy(parseNameStatus(d.out), roster);
  }

  console.log(JSON.stringify({ ref: REF, ...plan }, null, 2));
  let failed = 0;
  for (const dir of plan.unknownFunctionDirs) { err(`supabase/functions/${dir}/ changed but supabase/config.toml has no [functions.${dir}] — its verify_jwt is undeclared, so it is not deployed`); failed++; }
  for (const v of plan.migrations.edited) console.log(`::warning::migration ${v} was EDITED. db push never re-applies a recorded version — ship the change as a new migration.`);
  if (onlyPlan) process.exit(failed ? 1 : 0);
  if (!plan.functions.length && !plan.migrations.added.length) {
    console.log('nothing under supabase/ that deploys changed in this push — nothing to do');
    process.exit(failed ? 1 : 0);
  }

  doLink();

  /* ① migration を先に（新しい関数が新しい列を読むことがある） */
  if (plan.migrations.added.length) {
    const dry = sh('supabase', ['db', 'push', '--linked', '--dry-run']);
    console.log(dry.out);
    const pending = pendingFromDryRun(dry.out);
    if (dry.code !== 0 || /not found in local migrations|Found local migration files to be inserted before/i.test(dry.out)) {
      err(`supabase db push --dry-run refused (exit ${dry.code}) — the production migration history does not match supabase/migrations. Nothing was applied. See docs/MIGRATIONS.md.`);
      failed++;
    } else {
      const why = migrationMismatch(pending, plan.migrations.added);
      if (why) { err(`${why}. Nothing was applied.`); failed++; }
      else {
        const push = sh('supabase', ['db', 'push', '--linked', '--yes']);
        console.log(push.out);
        if (push.code !== 0) { err(`supabase db push failed (exit ${push.code}) — see docs/INCIDENT-RESPONSE.md → "Migration failed in production"`); failed++; }
      }
    }
  }

  /* ② 関数。migration が出なかったときは出さない——新しい関数が、まだ無い列を読みに行く。
     1 本の失敗で残りは止めない（どれが出てどれが出なかったかを全部言う）。 */
  if (failed && plan.migrations.added.length) {
    err(`the migration step failed, so ${plan.functions.length} function(s) were NOT deployed: ${plan.functions.join(' ') || '(none)'}`);
    process.exit(1);
  }
  for (const name of plan.functions) {
    const r = sh('supabase', ['functions', 'deploy', name, '--project-ref', REF, '--use-api']);
    console.log(`--- ${name}: exit ${r.code}\n${r.out.trim()}`);
    if (r.code !== 0) { err(`functions deploy ${name} failed (exit ${r.code})`); failed++; }
  }
  process.exit(failed ? 1 : 0);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
