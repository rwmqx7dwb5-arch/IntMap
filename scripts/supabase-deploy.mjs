#!/usr/bin/env node
/* ============================================================================
 *  IntMap · Supabase の配備をコードにする — 変わった Edge Function と、足された migration だけを出す
 * ----------------------------------------------------------------------------
 *  `.github/workflows/supabase-deploy.yml` が main への push ごとに呼ぶ。手でも同じものが走る:
 *
 *      node scripts/supabase-deploy.mjs --base-from-runs --after <sha>    # 最後に成功した配備からの差分（CI）
 *      node scripts/supabase-deploy.mjs --base <sha> --after <sha>        # 起点を手で与える
 *      node scripts/supabase-deploy.mjs --all                             # 全関数（migration は選ばない）
 *      node scripts/supabase-deploy.mjs --base <sha> --after <sha> --plan # 何を出すかを印字するだけ
 *      node scripts/supabase-deploy.mjs --link                            # link だけ（ドリフト検査の前段）
 *
 *  ⚠⚠⚠ 差分の起点は「その push の 1 つ前」ではなく「**最後に配備が成功した commit**」。
 *  実測 2026-10-01: #869 の run は migration の dry run が拒まれて関数を 1 本も出さず
 *  （"22 function(s) were NOT deployed"）、#874（_shared を変えた）の run も同じ理由で赤。#878 が
 *  migration を直して run は緑になったが、#878 自身は関数を変えていないので HEAD^..HEAD は関数 0 本
 *  ——`usage-count` は本番に存在しないまま 404、#874 の _shared も未配備で、**緑の run がそれを覆った**。
 *  失敗した run の差分は、次の run が拾わない限り永久に落ちる。だから起点は記録から読む:
 *    · 記録＝この workflow の**成功した push run** の headSha（`gh run list`）。配備した commit を
 *      別に書き残す仕組みは作らない——run の結論そのものが「そこまで出た」の記録である。
 *    · ⚠ その run が**この規則で走っていた**ときだけ信じる（`DEPLOY_BASE_CONTRACT`）。前の規則の緑は
 *      HEAD^..HEAD しか出していないので、#878 の緑は「#878 までが本番にある」を意味しない。
 *    · 記録が読めない・起点が HEAD の祖先でない（履歴が書き換わった）・規則を守った run が無い
 *      → **全関数**（安全側）。「起点を測れなかった」を「何も変わっていない」にしない。
 *  加えて: 本番に存在しない宣言済みの関数は差分に関係なく常に出し、出した後に
 *  `functions list` と `config.toml` を突き合わせて、宣言された関数が本番に無ければ赤にする。
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
/* project ref の導出と functions list の読み方は release-state.mjs が正本（同じ判断を 2 か所に持たない） */
import { supabaseRefFrom, parseFunctionsList } from './release-state.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/* この script 自身のリポジトリ内の位置（過去の commit の中の自分を `git show` で読むのに使う） */
const SELF = path.relative(ROOT, fileURLToPath(import.meta.url)).split(path.sep).join('/');

/** 差分の起点の規則。過去の成功 run を起点に使ってよいのは、その run の commit の中のこの script が
 *  同じ規則（＝「最後に成功した配備から」）で走っていたときだけ。前の規則（HEAD^..HEAD）の緑は、
 *  それより前に失敗した run の分を出していない（#869→#874→#878 の実測）。
 *  失効条件: 起点の決め方をまた変えるなら、この値も変える——前の規則の緑を信じなくなる（1 回全関数）。 */
export const DEPLOY_BASE_CONTRACT = 'since-last-successful-deploy';
export const carriesContract = (scriptSource) =>
  String(scriptSource || '').includes(`DEPLOY_BASE_CONTRACT = '${DEPLOY_BASE_CONTRACT}'`);

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

/** `GITHUB_WORKFLOW_REF`（`owner/repo/.github/workflows/<file>@refs/heads/main`）から workflow のファイル名。
 *  名前を手で書かない——この run を走らせている workflow 自身の履歴を訊く。 */
export const workflowFileFromRef = (ref) => {
  const m = /\.github\/workflows\/([^@/]+)@/.exec(String(ref || ''));
  return m ? m[1] : null;
};

/** 差分の起点＝最後に配備が成功した commit。
 *  runs: `gh run list --json databaseId,headSha,createdAt,conclusion`（この workflow・main・push）。
 *  新しい順に見て、
 *    · HEAD の祖先でない run に当たったら → null（全関数）。本番はこの系譜に無い commit を走らせている
 *      ので、それより古い起点からの差分は、その commit が変えたものを出し直さない。
 *    · この規則で走っていなかった run は飛ばす（緑でも「そこまで出た」を意味しない）。
 *    · 規則で走っていた祖先の run → その headSha。
 *  返り値 { base: sha|null, run, why }。base が null なら呼び手は全関数を出す。 */
export const chooseDeployBase = (runs, { head, isAncestor, honoursContract }) => {
  const ok = (runs || []).filter((r) => r && r.conclusion === 'success' && r.headSha)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  if (!ok.length) return { base: null, run: null, why: 'no successful deploy run on record' };
  let skipped = 0;
  for (const r of ok) {
    if (!isAncestor(r.headSha, head)) {
      return { base: null, run: r.databaseId, why: `the successful deploy at ${r.headSha.slice(0, 8)} (run ${r.databaseId}) is not an ancestor of ${String(head).slice(0, 8)} — production runs a commit off this line` };
    }
    if (!honoursContract(r.headSha)) { skipped++; continue; }
    return { base: r.headSha, run: r.databaseId, why: `last successful deploy: ${r.headSha.slice(0, 8)} (run ${r.databaseId})${skipped ? `; ${skipped} newer green run(s) predate the ${DEPLOY_BASE_CONTRACT} rule and do not prove what they deployed` : ''}` };
  }
  return { base: null, run: null, why: `none of the ${ok.length} successful deploy run(s) ran the ${DEPLOY_BASE_CONTRACT} rule — what is in production cannot be bounded by a commit` };
};

/** 宣言された関数のうち本番に無いもの（roster の順）。deployed が null（測れなかった）なら null。 */
export const missingFromProduction = (roster, deployed) =>
  deployed == null ? null : roster.filter((n) => !deployed.includes(n));

/** 計画に「本番に無い関数」を足す。差分に関係なく常に出す（新しい関数・前の失敗で落ちた関数）。 */
export const withMissing = (plan, roster, missing) => {
  if (!missing || !missing.length) return { ...plan, absentInProduction: missing ? [] : null };
  const want = new Set([...plan.functions, ...missing]);
  return { ...plan, functions: roster.filter((n) => want.has(n)), absentInProduction: [...missing] };
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

  /* 本番に在る関数の slug。測れなければ null（「0 本」でも「全部在る」でもない）。 */
  const listDeployed = () => {
    const r = sh('supabase', ['functions', 'list', '--project-ref', REF, '-o', 'json'], { timeout: 180_000 });
    if (r.code !== 0) return { slugs: null, why: `supabase functions list exited ${r.code}: ${r.out.trim().split('\n').at(-1) || ''}` };
    try { return { slugs: parseFunctionsList(r.out).map((f) => f.slug || f.name) }; }
    catch (e) { return { slugs: null, why: e.message }; }
  };

  /* ---- 差分の起点（冒頭の ⚠⚠⚠）。起点が無ければ全関数——「起点を測れなかった」を
     「何も変わっていない」にしない。 */
  const after = val('--after') || 'HEAD';
  const head = sh('git', ['rev-parse', '--verify', `${after}^{commit}`]).out.trim();
  if (!/^[0-9a-f]{40}$/.test(head)) { err(`cannot resolve --after ${after}`); process.exit(1); }
  let base = null, baseWhy;
  if (A.includes('--all')) baseWhy = '--all';
  else if (A.includes('--base-from-runs')) {
    const wf = workflowFileFromRef(process.env.GITHUB_WORKFLOW_REF);
    const repo = process.env.GITHUB_REPOSITORY;
    const branch = process.env.GITHUB_REF_NAME || 'main';
    if (!wf || !repo) baseWhy = `cannot name this workflow's run history (GITHUB_WORKFLOW_REF=${process.env.GITHUB_WORKFLOW_REF || ''}, GITHUB_REPOSITORY=${repo || ''})`;
    else {
      /* push の run だけ: workflow_dispatch の run は drift だけのこともあり、run の一覧は inputs を持たない。
         push の run は deploy job しか走らせない（drift の if: は schedule / dispatch）。 */
      const r = sh('gh', ['run', 'list', '--repo', repo, '--workflow', wf, '--branch', branch, '--event', 'push',
        '--status', 'success', '--limit', '100', '--json', 'databaseId,headSha,createdAt,conclusion']);
      let runs = null;
      if (r.code === 0) { try { runs = JSON.parse(r.out.slice(r.out.indexOf('['), r.out.lastIndexOf(']') + 1)); } catch { runs = null; } }
      if (!Array.isArray(runs)) baseWhy = `could not read the run history of ${wf} (gh exit ${r.code}): ${r.out.trim().split('\n').at(-1) || ''}`;
      else {
        const chosen = chooseDeployBase(runs, {
          head,
          isAncestor: (sha) => sh('git', ['merge-base', '--is-ancestor', sha, head]).code === 0,
          honoursContract: (sha) => {
            const s = sh('git', ['show', `${sha}:${SELF}`]);
            return s.code === 0 && carriesContract(s.out);
          },
        });
        base = chosen.base; baseWhy = chosen.why;
      }
    }
  } else if (val('--base')) {
    const b = val('--base');
    if (sh('git', ['cat-file', '-e', `${b}^{commit}`]).code === 0) base = b;
    else baseWhy = `--base ${b} is not a commit in this checkout`;
  } else baseWhy = 'no base given (--base / --base-from-runs)';

  let plan;
  if (!base) {
    plan = { functions: [...roster], all: baseWhy === '--all' ? '--all' : `no usable base — ${baseWhy} — deploying every function`, unknownFunctionDirs: [], migrations: { added: [], edited: [], unbounded: true } };
  } else {
    const d = sh('git', ['diff', '--name-status', '--no-renames', base, head]);
    if (d.code !== 0) { err(`git diff ${base}..${head} failed:\n${d.out}`); process.exit(1); }
    plan = { ...planDeploy(parseNameStatus(d.out), roster), base: `${base} — ${baseWhy || 'given by --base'}` };
  }

  console.log(JSON.stringify({ ref: REF, head, ...plan }, null, 2));
  let failed = 0;
  for (const dir of plan.unknownFunctionDirs) { err(`supabase/functions/${dir}/ changed but supabase/config.toml has no [functions.${dir}] — its verify_jwt is undeclared, so it is not deployed`); failed++; }
  for (const v of plan.migrations.edited) console.log(`::warning::migration ${v} was EDITED. db push never re-applies a recorded version — ship the change as a new migration.`);
  if (onlyPlan) process.exit(failed ? 1 : 0);

  /* ---- 本番に無い宣言済みの関数は、差分に関係なく出す（新しい関数・前の失敗で落ちたもの）。
     測れなければ全関数（安全側）。 */
  const before = listDeployed();
  const missing = missingFromProduction(roster, before.slugs);
  if (missing == null) {
    console.log(`::warning::could not list the functions in production (${before.why}) — deploying every function`);
    plan = { ...plan, functions: [...roster], all: plan.all || `production could not be listed (${before.why})` };
  } else if (missing.length) {
    console.log(`declared in supabase/config.toml but absent from production: ${missing.join(' ')} — deploying them regardless of the diff`);
    plan = withMissing(plan, roster, missing);
  }

  if (!plan.functions.length && !plan.migrations.added.length && !plan.migrations.unbounded) {
    console.log(`nothing under supabase/ that deploys changed since ${plan.base || 'the base'} — nothing to do; every declared function exists in production`);
    process.exit(failed ? 1 : 0);
  }

  doLink();

  /* ① migration を先に（新しい関数が新しい列を読むことがある） */
  if (plan.migrations.added.length || plan.migrations.unbounded) {
    const dry = sh('supabase', ['db', 'push', '--linked', '--dry-run']);
    console.log(dry.out);
    const pending = pendingFromDryRun(dry.out);
    if (dry.code !== 0 || /not found in local migrations|Found local migration files to be inserted before/i.test(dry.out)) {
      err(`supabase db push --dry-run refused (exit ${dry.code}) — the production migration history does not match supabase/migrations. Nothing was applied. See docs/MIGRATIONS.md.`);
      failed++;
    } else if (plan.migrations.unbounded) {
      /* 起点が無いと「どれを流すか」を選べない。流すものが残っているなら、この run を緑にしない
         ——緑の run は次の run の起点になり、残った migration は二度と差分に現れない。 */
      if (pending.length) { err(`no deploy base, so this run cannot choose which migrations to apply, and db push would apply ${pending.join(' ')}. Nothing was applied. Apply them by hand (docs/MIGRATIONS.md → "5. Apply to production").`); failed++; }
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
  if (failed && (plan.migrations.added.length || plan.migrations.unbounded)) {
    err(`the migration step failed, so ${plan.functions.length} function(s) were NOT deployed: ${plan.functions.join(' ') || '(none)'}`);
    process.exit(1);
  }
  for (const name of plan.functions) {
    const r = sh('supabase', ['functions', 'deploy', name, '--project-ref', REF, '--use-api']);
    console.log(`--- ${name}: exit ${r.code}\n${r.out.trim()}`);
    if (r.code !== 0) { err(`functions deploy ${name} failed (exit ${r.code})`); failed++; }
  }

  /* ③ 存在の検査。宣言された関数が本番に 1 本でも無ければ赤——「出したはず」ではなく本番に訊く。
     測れなかったことも赤（緑の run は次の起点になるので、確かめていない緑を作らない）。 */
  const after_ = listDeployed();
  const absent = missingFromProduction(roster, after_.slugs);
  if (absent == null) { err(`could not confirm the deploy: ${after_.why}`); failed++; }
  else if (absent.length) { err(`declared in supabase/config.toml but NOT in production after the deploy: ${absent.join(' ')}`); failed++; }
  else console.log(`all ${roster.length} declared function(s) exist in production`);
  process.exit(failed ? 1 : 0);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
