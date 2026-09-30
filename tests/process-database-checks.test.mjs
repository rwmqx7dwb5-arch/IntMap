/* ============================================================================
 *  IntMap · the database: what the migrations leave behind, and the CI job that tests them
 * ----------------------------------------------------------------------------
 *  #R507: profiles_public was a SECURITY DEFINER view — public by projection, not by mechanism — and
 *  is a four-column table synced by trigger. #R793 / #R801: the required database check must be
 *  able to report on every pull request, must still run the tests when the database changed, and
 *  must not turn «could not measure» into «measured zero».
 *  ⚠ These read SQL and workflow YAML as text/structure: the SQL is executed only by Postgres
 *  (`supabase test db`, which pgTAP covers) and the workflow's shell only on a GitHub runner — no
 *  Node test can run either, so the migration's and the workflow's own words are what is checked.
 *
 *  Each block below was one round-numbered file until the tests were regrouped by subject. A block
 *  keeps that file's helpers private to it (a `{ … }` scope), so two rounds' `docFacts()` or
 *  `scenario()` cannot shadow each other; the helpers every block shared — ROOT, rd/read and the
 *  line-ending-tolerant anchor — are declared once above. Titles keep their round tag so a failure
 *  still names the round whose record explains it.
 *
 *  Was: tests/r507, r793, r801 ②③④
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { load as loadYaml } from 'js-yaml';
import { specFiles } from '../scripts/architecture-spec.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const read = rd;

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R507 — was tests/r507-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  #R507 — CRITICAL: `public.profiles_public` は「公開列だけ」だったが、
 *          **公開列だけだったのは射影であって、仕組みではなかった**
 * ----------------------------------------------------------------------------
 *  Supabase Security Advisor（level ERROR / lint 0010_security_definer_view、
 *  本番実測 2026-08-31）:
 *
 *      View `public.profiles_public` is defined with the SECURITY DEFINER property
 *
 *  この view は `security_invoker` を持たない＝**所有者 (postgres) の権限で
 *  `public.profiles` を読み、その RLS を丸ごと迂回する**。射影は
 *  `id / display_name / bio / avatar_url` の4列だけなので **今日は何も漏れていない**。
 *  ⚠ しかし **迂回は relation の性質であって、射影の性質ではない**。
 *  `docs/SECURITY-ARCHITECTURE.md §8` の 7 番は #R465 の本番監査でこれを見つけ、
 *  「将来この view に列を1本足したら、その列が迂回を継承する」と書いたうえで
 *  **判断により閉じなかった**。この回がそれを閉じる。
 *
 *  ⚠⚠⚠ **既存の検査は1本もこれを捕まえられない。** 00_structure は
 *  `has_view(...)` と「email 列が無い」、01/05 は「anon も authenticated も読める」を
 *  主張していた——**そのすべてが、欠陥のある形について真である**。
 *  検査は**射影**を見ていて、欠陥は**仕組み**にあった。
 *
 *  ⚠⚠ advisor の推奨（`alter view … set (security_invoker = on)`）は**採れない**。
 *  `profiles` の SELECT ポリシーは `auth.uid() = id OR is_admin(auth.uid())` の1本だけなので、
 *  invoker view は「自分の行」しか返さず、`anon` は profiles に権限を1つも持たない (#R155) ので
 *  permission denied になる＝**コミュニティの著者カードが全員に対して消える**。
 *  動かすには profiles に `USING (true)` の SELECT ポリシーを足し、
 *  email/is_admin/is_pro/plan を**列単位の grant だけ**で隠すことになる——それは #R155 が
 *  「信用できない」と実証した壁そのもの（Supabase の既定権限が anon/authenticated に
 *  テーブルの ALL を配るので、誰も `grant` を書かないまま blanket UPDATE が生えた）。
 *
 *  ⇒ **仕組みを構造にする**: `profiles_public` を「4列しか物理的に持たない実テーブル」にし、
 *  AFTER トリガで `profiles` と同期する。view が無いので継承する迂回が無い。
 *
 *  この検査が主張すること:
 *    ① migration が最後に作る `profiles_public` は **table** であって view ではない
 *    ② ⚠ **クラスとしての門**: migration が作る view が今後1本でも残るなら、
 *       それは `security_invoker = true` でなければならない（同じ穴を二度掘らせない）
 *    ③ view の落とし方が relkind で守られている（`drop view if exists` は table には効かず落ちる）
 *    ④ 表は公開4列ちょうど
 *    ⑤ RLS が有効で、ポリシーは `for select using (true)` の1本だけ
 *    ⑥ 書き込み権限は誰にも配られない（`revoke all` → `grant select` のみ）
 *    ⑦ 同期関数は SECURITY DEFINER・search_path 固定・EXECUTE は剥がしてある
 *    ⑧ トリガは insert / update(4列のうち3列) / delete を覆う
 *    ⑨ 既存の profile が backfill される
 *    ⑩ PostgREST の schema cache を貼り替える（無いと API から見た形が view のまま）
 *    ⑪ 現状仕様の文書が、もう「view」と言っていない（履歴文書は対象外）
 * ==========================================================================*/

const MIG_DIR = join(ROOT, 'supabase/migrations');

/* Migration files in the order Postgres applies them (the timestamp prefix sorts). */
const MIGRATIONS = readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql')).sort();
const R507 = MIGRATIONS.find((f) => /r507_profiles_public_table/.test(f));

test('#R507 ① the migrations end with profiles_public as a TABLE, not a view', () => {
  assert.ok(R507, 'the R507 migration file is missing');
  /* Walk every migration in order and record what each one last made this name. */
  let kind = null, madeBy = null;
  for (const f of MIGRATIONS) {
    const sql = readFileSync(join(MIG_DIR, f), 'utf8');
    for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?(view|materialized\s+view|table)\s+(?:if\s+not\s+exists\s+)?public\.profiles_public\b/gi)) {
      kind = m[1].toLowerCase().replace(/\s+/g, ' ');
      madeBy = f;
    }
  }
  assert.equal(kind, 'table',
    `public.profiles_public is last created as a ${kind} in ${madeBy} — a view here reads profiles with the owner's rights and bypasses its RLS (Supabase lint 0010_security_definer_view)`);
});

test('#R507 ② any view the migrations still leave behind must be security_invoker', () => {
  /* The class-level gate. A name that a later migration turns into a table is not a view any
     more, so it is excluded — that is exactly what happened to profiles_public. */
  const finalKind = new Map();     // relation name → 'view' | 'table', last writer wins
  const viewStmt = new Map();      // view name → the text of its last create statement
  for (const f of MIGRATIONS) {
    const sql = readFileSync(join(MIG_DIR, f), 'utf8');
    for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?(view|materialized\s+view|table)\s+(?:if\s+not\s+exists\s+)?public\.([a-z0-9_]+)([\s\S]*?)\bas\b/gi)) {
      const kind = m[1].toLowerCase().startsWith('view') ? 'view'
                 : m[1].toLowerCase().includes('materialized') ? 'materialized view' : 'table';
      finalKind.set(m[2], kind);
      if (kind !== 'table') viewStmt.set(m[2], `${f}: ${m[0]}`);
    }
    /* `create table (...)` has no `as`, so catch it separately. */
    for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z0-9_]+)\s*\(/gi)) {
      finalKind.set(m[1], 'table');
    }
  }
  const leftAsViews = [...finalKind].filter(([, k]) => k !== 'table').map(([n]) => n);
  for (const name of leftAsViews) {
    const stmt = viewStmt.get(name) || '';
    assert.match(stmt, /security_invoker\s*=\s*(true|on)/i,
      `public.${name} is left as a view without security_invoker — it will read its base tables with the owner's rights and bypass their RLS (${stmt.slice(0, 120)}…)`);
  }
});

test('#R507 ③ the view is dropped under a relkind guard, so the migration stays re-runnable', () => {
  const sql = rd('supabase/migrations/' + R507);
  /* `drop view if exists public.profiles_public` raises "is not a view" once the table exists,
     so a bare IF EXISTS would make a second run fail rather than no-op. */
  assert.ok(!/drop\s+view\s+if\s+exists\s+public\.profiles_public/i.test(sql),
    'the R507 migration uses a bare `drop view if exists`, which errors once profiles_public is a table');
  assert.match(sql, /relkind\s*=\s*'v'/i, 'the drop is not guarded on relkind = v');
  assert.match(sql, /drop\s+view\s+public\.profiles_public/i, 'the guarded drop is missing');
});

test('#R507 ④ the table holds the four public columns and nothing else', () => {
  const sql = rd('supabase/migrations/' + R507);
  const m = sql.match(/create\s+table\s+if\s+not\s+exists\s+public\.profiles_public\s*\(([\s\S]*?)\n\);/i);
  assert.ok(m, 'the create table statement is missing');
  const cols = m[1].split('\n').map((l) => l.trim()).filter(Boolean)
    .map((l) => (l.match(/^([a-z_][a-z0-9_]*)\s/) || [])[1]).filter(Boolean);
  assert.deepEqual(cols, ['id', 'display_name', 'bio', 'avatar_url'],
    'the public projection changed shape — email/is_admin/is_pro/plan/login_count must never appear here');
  assert.match(m[1], /references\s+public\.profiles\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/i,
    'the card must disappear with the account (delete-account → auth.users → profiles → here)');
});

test('#R507 ⑤ RLS is on and the only policy is SELECT USING (true)', () => {
  const sql = rd('supabase/migrations/' + R507);
  assert.match(sql, /alter\s+table\s+public\.profiles_public\s+enable\s+row\s+level\s+security/i,
    'RLS is not enabled on profiles_public');
  const policies = [...sql.matchAll(/create\s+policy\s+([a-z0-9_]+)\s+on\s+public\.profiles_public\s+for\s+([a-z]+)\s+using\s*\(([^)]*)\)/gi)];
  assert.equal(policies.length, 1, 'profiles_public must carry exactly one policy');
  assert.equal(policies[0][2].toLowerCase(), 'select', 'the policy must be SELECT-only');
  assert.equal(policies[0][3].trim(), 'true',
    'the policy must say USING (true) — this data is public by declaration, not by an owner bypass');
});

test('#R507 ⑥ no role is granted a write on profiles_public', () => {
  const sql = rd('supabase/migrations/' + R507);
  /* ⚠ TRUNCATE is not subject to RLS, so the grant layer is the only thing that can refuse it
     (docs/SECURITY-ARCHITECTURE.md §8 item 5). Supabase's default privileges hand out ALL. */
  assert.match(sql, /revoke\s+all\s+on\s+public\.profiles_public\s+from\s+anon,\s*authenticated/i,
    'the default-privilege ALL is not revoked — anon would hold INSERT/UPDATE/DELETE/TRUNCATE');
  const grants = [...sql.matchAll(/grant\s+([a-z, ]+?)\s+on\s+public\.profiles_public\s+to\s+([a-z, ]+)/gi)];
  assert.ok(grants.length > 0, 'nothing is granted on profiles_public — author cards would stop rendering');
  for (const g of grants) {
    assert.equal(g[1].trim().toLowerCase(), 'select',
      `profiles_public is granted "${g[1].trim()}" — only SELECT may be granted; the trigger is the only writer`);
  }
});

test('#R507 ⑦ the sync function is SECURITY DEFINER, pins search_path, and is not callable by clients', () => {
  const sql = rd('supabase/migrations/' + R507);
  const fn = sql.match(/create\s+or\s+replace\s+function\s+public\.sync_profiles_public\(\)[\s\S]*?\$fn\$;/i);
  assert.ok(fn, 'sync_profiles_public() is missing');
  assert.match(fn[0], /security\s+definer/i, 'the sync function must be SECURITY DEFINER (no client may write the table)');
  assert.match(fn[0], /set\s+search_path\s*=/i, 'the sync function must pin search_path (lint function_search_path_mutable)');
  /* A trigger function needs no EXECUTE at fire time — verified against production inside a
     rolled-back transaction — so revoking it costs nothing and keeps the function off the
     advisor's anon/authenticated_security_definer_function_executable lists. */
  assert.match(sql, /revoke\s+all\s+on\s+function\s+public\.sync_profiles_public\(\)\s+from\s+public,\s*anon,\s*authenticated/i,
    'EXECUTE on sync_profiles_public() is not revoked from public/anon/authenticated');
});

test('#R507 ⑧ the trigger covers insert, the three public columns on update, and delete', () => {
  const sql = rd('supabase/migrations/' + R507);
  const trg = sql.match(/create\s+trigger\s+profiles_public_sync[\s\S]*?execute\s+function\s+public\.sync_profiles_public\(\);/i);
  assert.ok(trg, 'the profiles_public_sync trigger is missing');
  const t = trg[0].toLowerCase();
  assert.match(t, /after\s+insert/, 'a new signup would get no card');
  assert.match(t, /\bdelete\b/, 'a closed account would leave a card behind');
  for (const col of ['display_name', 'bio', 'avatar_url']) {
    assert.ok(t.includes(col), `update of ${col} is not watched — the card would go stale`);
  }
  assert.ok(!/\blogin_count\b|\bis_pro\b|\bis_admin\b/.test(t),
    'the trigger watches a column that is not part of the public card');
  assert.match(t, /for\s+each\s+row/, 'the trigger must be per-row');
});

test('#R507 ⑨⑩ existing profiles are backfilled and PostgREST is told the shape changed', () => {
  const sql = rd('supabase/migrations/' + R507);
  assert.match(sql, /insert\s+into\s+public\.profiles_public[\s\S]*?select\s+id,\s*display_name,\s*bio,\s*avatar_url\s+from\s+public\.profiles/i,
    'without a backfill every account that existed before this migration loses its card');
  /* ⚠ PostgREST caches the schema. Without the reload the API keeps serving the OLD relation
     shape, so the fix would be invisible to the site until the next restart. */
  const notify = sql.indexOf("notify pgrst, 'reload schema'");
  assert.ok(notify > 0, 'the PostgREST schema-cache reload is missing');
  assert.ok(notify > sql.lastIndexOf('\ncommit;'),
    'the reload must be OUTSIDE the transaction, otherwise it announces a shape that is not committed yet');
});

test('#R507 ⑪ the current-state documents no longer call profiles_public a view', () => {
  /* Only documents that describe TODAY. DEV-NOTES / DEV-NOTES-ARCHIVE are history: they were
     right when they were written and must not be rewritten (AGENTS.md §9). */
  const CURRENT = [...specFiles(ROOT), 'PRODUCT.md', 'README.md', 'docs/DATABASE.md',
    'docs/SECURITY-ARCHITECTURE.md', 'docs/TESTING.md', 'js/community-board.js'];
  for (const f of CURRENT) {
    if (!existsSync(join(ROOT, f))) continue;
    const s = rd(f);
    /* ⚠ Paragraph-scoped, not window-scoped: the correction ("it was a view, it is a table now")
       and the word `view` land in the same passage but not always within N characters of each
       other, and a window narrow enough to be precise reports the correction itself as the
       defect. ⚠ Japanese too — Architecture.md said 「`profiles_public` ビュー」, and an
       English-only pattern would have called that page clean. */
    for (const raw of s.split(/\n\s*\n|(?=\n\s*(?:\d+\.|[-*])\s)/)) {
      /* ⚠ Normalise the wrapping first. The correction reads "It was a\nview without…", and a
         pattern applied to the raw text misses "was a view" purely because of where the line
         broke — the check would then report the sentence that closes the finding as the finding. */
      const para = raw.replace(/\s+/g, ' ').trim();
      if (!/profiles_public/.test(para)) continue;
      if (!/\bviews?\b|ビュー/i.test(para)) continue;
      /* A passage that says it USED to be a view is the point of the record, not a stale fact. */
      assert.match(para, /used to be|was a view|a view then|no longer|rather than a view|since #R507|not a view|#R507\)|view ではなく|ではなく実テーブル|view は `security_invoker`/i,
        `${f} still describes profiles_public as a view: "${para.slice(0, 160)}"`);
    }
  }
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R793 — was tests/r793-db-gate-never-reports-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  #R793 · 必須チェックが「走らない」と「まだ終わっていない」は外から同じに見える
 * ----------------------------------------------------------------------------
 *  MEASURED 2026-09-19. Three open pull requests — #709, #710, #655 — were green on every
 *  check they could run and all three said BLOCKED, with nothing in the PR or the ruleset
 *  naming what was missing. On 2026-09-18 03:14 the `Protect main` ruleset gained a fourth
 *  required context, `Migrations rebuild + RLS/permission tests`, which is the job in
 *  .github/workflows/db.yml — and that workflow was path-filtered to supabase/**. A required
 *  context a path filter suppresses is never reported at all, and GitHub does not read an
 *  absent report as 「走らせる必要が無かった」; it reads it as 「まだ終わっていない」. The three
 *  rounds that merged immediately before (#702 / #704 / #707) had touched no database file
 *  either — the only thing that changed was the ruleset. So neither setting was wrong on its
 *  own, and TOGETHER they stopped every round that does not touch the database.
 *
 *  ⚠ WHAT IS MEASURED HERE IS NOT 「paths: が無いこと」 as an answer to copy
 *  ([[intmap-restate-the-defect-not-the-fix]]). The defect has two halves and a check that
 *  watched only one would green-light the other:
 *
 *    ① THE REQUIRED CONTEXT MUST BE ABLE TO REPORT ON ANY PULL REQUEST. Re-adding a `paths:`
 *       filter under `pull_request:` restores exactly the state measured above, so that is
 *       what fails here — stated as the reachability of the job, not as the spelling.
 *    ② AND THE TESTS MUST STILL RUN WHEN THEY MATTER. The cheap way to satisfy ① is a job
 *       that reports success and does nothing, which is [[intmap-records-with-no-reader]]
 *       turned inside out: a reader with no record. So every step that needs a database is
 *       asserted to be behind the scope guard, the guard's own path list is asserted to still
 *       name supabase/, and the guard is asserted to FAIL OPEN — a push, a dispatch or a diff
 *       it cannot compute runs the tests in full rather than skipping them.
 *
 *  ⚠ THE RULESET ITSELF IS NOT READABLE FROM HERE. Which contexts are required lives in
 *  GitHub's settings, not in the checkout, so this file cannot assert the pairing directly —
 *  it asserts the half the repository owns (the job is always reachable), which is the half
 *  that makes any requirement safe. The other direction is noted in DEV-NOTES.md #R793.
 * ==========================================================================*/

const WF = '.github/workflows/db.yml';
const JOB_NAME = 'Migrations rebuild + RLS/permission tests';
const src = readFileSync(join(ROOT, WF), 'utf8').replace(/\r\n/g, '\n');

/* the `on:` block, up to the next top-level key */
const onBlock = (() => {
  const at = src.indexOf('\non:\n');
  assert.ok(at !== -1, `${WF} has no \`on:\` block`);
  const rest = src.slice(at + 1).split('\n').slice(1);
  const end = rest.findIndex((l) => /^\S/.test(l) && l.trim() !== '');
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
})();

test('#R793 ① 必須の名前を持つ job は、どの pull request からも到達できる', () => {
  assert.ok(/^\s*pull_request:\s*$/m.test(onBlock),
    `${WF} no longer triggers on pull_request at all — the required context would never report on any PR`);

  /* the pull_request trigger must carry no filter of any kind: paths, paths-ignore and
     branches all suppress the run, and a suppressed run is an absent report, which the
     ruleset cannot tell apart from one still in flight. */
  const pr = onBlock.slice(onBlock.indexOf('pull_request:'));
  const prBody = pr.split('\n').slice(1);
  const endOfPr = prBody.findIndex((l) => l.trim() !== '' && !/^ {4}/.test(l));
  const body = (endOfPr === -1 ? prBody : prBody.slice(0, endOfPr)).join('\n');
  for (const key of ['paths', 'paths-ignore', 'branches', 'branches-ignore']) {
    assert.equal(new RegExp(`^\\s*${key}:`, 'm').test(body), false,
      `${WF}'s pull_request trigger filters on \`${key}\` — a PR outside the filter never reports «${JOB_NAME}», and a required context that is never reported reads as pending, not as skipped. This is the state MEASURED on 2026-09-19 with #709 / #710 / #655 all green and all BLOCKED. Put the filter inside the job (see the scope step) so the job still reports.`);
  }
});

/* (tests regrouped by subject) «② その job は、いまも上の名前で報告する» is folded into R801 ④ below,
   which asserts the same name on the PARSED workflow (`jobs.db.name`) rather than as a substring of
   the text — renaming the job still fails there, and a comment carrying the old name cannot pass it. */

test('#R793 ③ データベースを要する工程は 1 つ残らず scope の見張りの後ろにある', () => {
  /* Steps are asserted by what they NEED, not by a list of names copied from the file:
     anything that talks to supabase or psql cannot run without a database. */
  const steps = src.split(/^      - name: /m).slice(1)
    .map((chunk) => ({ name: chunk.split('\n')[0].trim(), body: chunk }));
  assert.ok(steps.length >= 7, `${WF} has only ${steps.length} named step(s) — the file is not what this check was written against`);

  for (const s of steps) {
    if (s.name === 'Is this a database change?') continue;
    const needsDb = /\bsupabase\s|\bpsql\b|backup-db\.sh|restore-test\.sh/.test(s.body);
    if (!needsDb) continue;
    assert.ok(/if:.*steps\.scope\.outputs\.run == 'true'/.test(s.body),
      `${WF}'s step «${s.name}» reaches a database but is not guarded by \`steps.scope.outputs.run\` — on a PR that changes no database file there is no database for it to reach, and the job would fail for a reason that has nothing to do with the PR`);
  }
});

test('#R793 ④ 見張り自身が supabase/ を見ており、答えられないときは走らせる側に倒れる', () => {
  const scope = src.slice(src.indexOf('- name: Is this a database change?'));
  const step = scope.slice(0, scope.indexOf('\n      - name: ', 1));

  assert.ok(/supabase\//.test(step),
    `${WF}'s scope step no longer names supabase/ — it would report «no database change» for a migration, and the required check would go green over an untested schema. THAT is the failure this whole arrangement is built to avoid; reporting was never the point on its own.`);

  /* fail-open: everything the diff cannot answer must run the tests, not skip them */
  for (const [what, needle] of [
    ['a push or a manual dispatch', /"\$EVENT" = "pull_request"/],
    ['a base commit this checkout does not have', /git cat-file -e "\$BASE_SHA/],
    ['a diff that could not be computed', /run_full "could not diff/],
  ]) {
    assert.ok(needle.test(step),
      `${WF}'s scope step no longer falls back to running in full for ${what} — an unanswerable question would be answered «skip», which is the one answer it must never give`);
  }

  const full = step.match(/run_full \(\)[^\n]*\n/);
  assert.ok(full && /run=true/.test(full[0]),
    `${WF}'s run_full helper no longer sets run=true — the fallback that is supposed to run everything would skip everything instead`);
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R801 — was tests/r801-edge-config-checks.test.mjs ②③④
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
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
    'the GitHub Ruleset requires this check by this name — renaming it silently stops satisfying the required context, and every PR goes back to BLOCKED (#R793 ②)');

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
}
