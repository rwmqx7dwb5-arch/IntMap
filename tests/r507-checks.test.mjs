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
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIG_DIR = join(ROOT, 'supabase/migrations');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

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
  const CURRENT = ['Architecture.md', 'PRODUCT.md', 'README.md', 'docs/DATABASE.md',
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
