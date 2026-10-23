// ============================================================================
//  tests/security-audit-db-checks.test.mjs — the half of security-audit that needs no Postgres
//  (supabase/migrations/20261023120000_security_audit.sql; the database half is
//  supabase/tests/31_security_audit_test.sql, run by CI against a real Postgres).
//
//    ① the vote tables END with no world-readable SELECT policy and no anon SELECT — replayed over
//      every migration in order, because the property is the last word, not one file's word;
//    ② the three schedules exist by name, call functions some migration defines, and do not take a
//      name another migration already uses;
//    ③ the purge functions are service_role only, SECURITY DEFINER, search_path '';
//    ④ the privacy policy states the retention the schedule enforces (the number is read from the
//      schedule, not written here);
//    ⑤ js/community-board.js, EVALUATED against a stand-in PostgREST: a signed-out reader never asks
//      for a vote table (the request would fail whole once anon has no SELECT on it), a signed-in
//      reader asks for their own rows, the total comes from vote_count — and a database without the
//      column still counts the rows, as before.
// ============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIG_DIR = join(ROOT, 'supabase/migrations');
const THIS = '20261023120000_security_audit.sql';
const MIGRATIONS = readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => ({ file: f, sql: codeOnly(readFileSync(join(MIG_DIR, f), 'utf8'), { lang: 'sql' }) }));
const MINE = MIGRATIONS.find((m) => m.file === THIS);
const VOTE_TABLES = ['community_votes', 'community_comment_votes'];
const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();

test('security-audit: the migration exists', () => {
  assert.ok(MINE, `${THIS} is missing`);
});

/* ── ① replay: policies and anon's SELECT on the two vote tables ─────────────────────────────── */
function replayVotes() {
  const policies = new Map(VOTE_TABLES.map((t) => [t, new Map()]));   // table → name → { cmd, roles, using }
  const anonSelect = new Map(VOTE_TABLES.map((t) => [t, false]));
  const tablesIn = (list) => VOTE_TABLES.filter((t) => new RegExp(`public\\.${t}\\b`).test(list));
  for (const { sql } of MIGRATIONS) {
    /* events in source order: one regex with alternatives, so the order between kinds is kept */
    const re = /create\s+policy\s+("?[^"\s]+"?)\s+on\s+public\.(\w+)\s+for\s+(select|all|insert|update|delete)\s+to\s+([\w\s,]+?)\s+((?:using|with\s+check)[^;]*);|drop\s+policy\s+(?:if\s+exists\s+)?("?[^"\s]+"?)\s+on\s+public\.(\w+)\s*;|\bdo\s+(\$\w*\$)([\s\S]*?)\8|grant\s+select\s+on\s+([\s\S]*?)\s+to\s+([\w\s,]+?)\s*;|revoke\s+(all|select)(?:\s+privileges)?\s+on\s+([\s\S]*?)\s+from\s+([\w\s,]+?)\s*;/gi;
    for (const m of sql.matchAll(re)) {
      if (m[1]) {
        const t = m[2]; if (!policies.has(t)) continue;
        /* «using (X)» or «with check (X)» → X */
        const using = norm(m[5]).replace(/^(?:using|with check)\s*/, '').replace(/^\(([\s\S]*)\)$/, '$1').trim();
        policies.get(t).set(m[1].replace(/"/g, ''), { cmd: m[3].toLowerCase(), roles: norm(m[4]), using });
      } else if (m[6]) {
        const t = m[7]; if (policies.has(t)) policies.get(t).delete(m[6].replace(/"/g, ''));
      } else if (m[8]) {
        /* the one dynamic form these tables meet: a loop over pg_policies that drops every SELECT/ALL policy */
        const body = m[9];
        if (/pg_policies/i.test(body) && /drop policy/i.test(body) && /cmd\s+in\s*\(\s*'SELECT'\s*,\s*'ALL'\s*\)/i.test(body)) {
          for (const t of VOTE_TABLES) {
            if (!new RegExp(`'${t}'`).test(body)) continue;
            for (const [name, p] of policies.get(t)) if (p.cmd === 'select' || p.cmd === 'all') policies.get(t).delete(name);
          }
        }
      } else if (m[10]) {
        if (/\banon\b|\bpublic\b/i.test(m[11])) for (const t of tablesIn(m[10])) anonSelect.set(t, true);
      } else if (m[12]) {
        /* a grant to PUBLIC reaches anon; a revoke from PUBLIC does not take anon's own grant away */
        if (/\banon\b/i.test(m[14])) for (const t of tablesIn(m[13])) anonSelect.set(t, false);
      }
    }
  }
  return { policies, anonSelect };
}

test('security-audit ①: the vote tables end with only the own-row SELECT policy, and anon reads neither', () => {
  const { policies, anonSelect } = replayVotes();
  for (const t of VOTE_TABLES) {
    const sel = [...policies.get(t)].filter(([, p]) => p.cmd === 'select' || p.cmd === 'all');
    assert.equal(sel.length, 1, `${t} ends with ${sel.length} SELECT policies: ${sel.map(([n]) => n).join(', ')}`);
    const [name, p] = sel[0];
    assert.equal(p.roles, 'authenticated', `${t}.${name} applies to ${p.roles}`);
    assert.match(p.using, /^user_id = \(select auth\.uid\(\)\)$/, `${t}.${name} reads «${p.using}», not the caller's own rows`);
    assert.ok(![...policies.get(t).values()].some((x) => /^\(?true\)?$/.test(x.using)), `${t} keeps a USING (true) policy`);
    assert.equal(anonSelect.get(t), false, `anon ends with SELECT on ${t}`);
    /* voting and withdrawing a vote still work: an own-row INSERT and an own-row DELETE policy remain */
    for (const cmd of ['insert', 'delete']) {
      const own = [...policies.get(t).values()].filter((x) => x.cmd === cmd && /^user_id = \(select auth\.uid\(\)\)$/.test(x.using));
      assert.ok(own.length >= 1, `${t} ends without an own-row ${cmd.toUpperCase()} policy`);
    }
  }
  /* the DO block the replay interprets is in this migration — so the replay is reading what it claims to */
  assert.match(MINE.sql, /from\s+pg_catalog\.pg_policies[\s\S]*cmd\s+in\s*\(\s*'SELECT'\s*,\s*'ALL'\s*\)[\s\S]*drop policy/i);
});

test('security-audit ①: the totals have counters on both vote tables, created before the backfill', () => {
  for (const [table, fn] of [['community_votes', 'tg_community_post_vote_count'], ['community_comment_votes', 'tg_community_comment_vote_count']]) {
    const tr = new RegExp(`create\\s+trigger\\s+\\w+\\s+after\\s+insert\\s+or\\s+delete\\s+or\\s+update\\s+of\\s+\\w+\\s+on\\s+public\\.${table}\\s+for\\s+each\\s+row\\s+execute\\s+function\\s+public\\.${fn}\\(\\)`, 'i').exec(MINE.sql);
    assert.ok(tr, `no AFTER INSERT/DELETE/UPDATE row trigger on ${table} calling ${fn}`);
    const backfill = MINE.sql.search(/update\s+public\.community_posts\s+p\s+set\s+vote_count\s*=\s*coalesce\(/i);
    assert.ok(backfill >= 0, 'no backfill of community_posts.vote_count');
    assert.ok(backfill > tr.index, `the backfill runs before the ${table} trigger exists — a vote could land between them`);
    assert.match(MINE.sql, new RegExp(`revoke\\s+execute\\s+on\\s+function\\s+public\\.${fn}\\(\\)\\s+from\\s+public,\\s*anon,\\s*authenticated`, 'i'));
  }
  /* nothing in any migration hands a client role a write on vote_count */
  for (const { file, sql } of MIGRATIONS) {
    for (const g of sql.matchAll(/grant\s+(insert|update)\s*\(([^)]*)\)\s+on\s+public\.community_(posts|comments)\b/gi)) {
      assert.ok(!/\bvote_count\b/.test(g[2]), `${file} grants ${g[1]} on vote_count`);
    }
  }
});

/* ── ② the schedules ─────────────────────────────────────────────────────────────────────────── */
const scheduled = (sql) => [...sql.matchAll(/cron\.schedule\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'select public\.(\w+)\(([^)]*)\)'\s*\)/g)]
  .map((m) => ({ name: m[1], when: m[2], fn: m[3], args: m[4] }));

test('security-audit ②: three schedules by name, each calling a function a migration defines, no name reused', () => {
  const mine = scheduled(MINE.sql);
  assert.deepEqual(mine.map((j) => `${j.name} → ${j.fn}`).sort(), [
    'anonymous-reports-purge → purge_anonymous_reports',
    'cron-run-history-purge → purge_cron_run_history',
    'relay-rate-buckets-sweep → sweep_relay_rate_buckets',
  ]);
  const others = MIGRATIONS.filter((m) => m.file !== THIS).flatMap((m) => [...m.sql.matchAll(/cron\.schedule\(\s*'([^']+)'/g)].map((x) => x[1]));
  for (const j of mine) {
    assert.ok(!others.includes(j.name), `${j.name} is already the name of another migration's job — schedule() would replace it`);
    assert.ok(MIGRATIONS.some((m) => new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${j.fn}\\s*\\(`, 'i').test(m.sql)), `${j.fn} is defined by no migration`);
  }
  /* only where pg_cron exists — the guard of 20260925110000 */
  assert.match(MINE.sql, /if\s+to_regclass\('cron\.job'\)\s+is\s+null\s+then[\s\S]*?return;[\s\S]*?cron\.schedule\('anonymous-reports-purge'/i);
});

/* ── ③ the purge functions ──────────────────────────────────────────────────────────────────── */
test('security-audit ③: the purges are SECURITY DEFINER, search_path \'\', and service_role only', () => {
  for (const fn of ['purge_anonymous_reports', 'purge_cron_run_history']) {
    const def = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}\\(p_days integer default \\d+\\)[\\s\\S]*?security\\s+definer\\s+set\\s+search_path\\s*=\\s*''`, 'i');
    assert.match(MINE.sql, def, `${fn} is not SECURITY DEFINER with an empty search_path`);
    assert.match(MINE.sql, new RegExp(`revoke\\s+execute\\s+on\\s+function\\s+public\\.${fn}\\(integer\\)\\s+from\\s+public,\\s*anon,\\s*authenticated`, 'i'));
    assert.match(MINE.sql, new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${fn}\\(integer\\)\\s+to\\s+service_role\\s*;`, 'i'));
  }
  /* it deletes the SIGNED-OUT rows only */
  assert.match(MINE.sql, /delete from public\.feedback f\s+where f\.user_id is null and/i);
  assert.match(MINE.sql, /delete from public\.bug_reports b where b\.user_id is null and/i);
});

/* ── ④ the privacy policy says what the schedule does ───────────────────────────────────────── */
test('security-audit ④: privacy §6 states the retention the schedule enforces, in en and jp', () => {
  const job = scheduled(MINE.sql).find((j) => j.fn === 'purge_anonymous_reports');
  const days = Number(job.args);
  assert.ok(days > 0, 'the schedule passes a number of days');
  const legal = readFileSync(join(ROOT, 'js/legal-text.js'), 'utf8');
  assert.match(legal, new RegExp(`Feedback and bug reports sent while not signed in are deleted ${days} days after we receive them`), 'EN §6');
  assert.match(legal, new RegExp(`ログインせずに送られたフィードバックと不具合報告は、受け取ってから${days}日後に削除します`), 'JA §6');
});

/* ── ⑤ the client, evaluated ────────────────────────────────────────────────────────────────── */
/* A stand-in for PostgREST that answers the way the database does on each side of the migration:
   'migrated' — posts and comments carry vote_count, anon holds no SELECT on a vote table (a request that
   names one, as a table or an embed, fails whole: 42501); 'legacy' — no vote_count, every vote row readable. */
function fakeDb(schema, signedInAs) {
  const calls = [];
  const VOTE = /\bcommunity_(?:comment_)?votes\b/;
  const answer = (tbl, cols) => {
    if (schema === 'legacy' && /\bvote_count\b/.test(cols)) return { data: null, error: { code: '42703', message: 'column vote_count does not exist' } };
    if (schema === 'migrated' && !signedInAs && (VOTE.test(tbl) || VOTE.test(cols))) return { data: null, error: { code: '42501', message: 'permission denied for table community_votes' } };
    if (tbl !== 'community_posts' || !/community_comments\(/.test(cols)) return { data: [], error: null };
    const others = [{ user_id: 'u-other-1' }, { user_id: 'u-other-2' }];
    const own = signedInAs ? [{ user_id: signedInAs }] : [];
    /* migrated: RLS returns the caller's own rows only; legacy: everyone's */
    const votes = schema === 'migrated' ? own : [...others, ...own];
    const post = { id: 1, user_id: 'u-author', author_name: 'A', title: 't', body: 'b', img: null, lat: 0, lng: 0, created_at: '2026-10-01T00:00:00Z',
      category: 'general', edited_at: null,
      community_comments: [{ id: 9, user_id: 'u-other-1', author_name: 'B', body: 'c', created_at: '2026-10-02T00:00:00Z', parent_id: null, edited_at: null }] };
    if (schema === 'migrated') { post.vote_count = 3; post.community_comments[0].vote_count = 2; }
    if (/community_votes\(/.test(cols)) post.community_votes = votes;
    if (/community_comment_votes\(/.test(cols)) post.community_comments[0].community_comment_votes = schema === 'migrated' ? [] : others.slice(0, 1);
    return { data: [post], error: null };
  };
  return {
    calls,
    from(tbl) {
      return { select(cols) {
        calls.push({ tbl, cols });
        const done = () => Promise.resolve(answer(tbl, cols));
        return { limit: done, order: done };
      } };
    },
  };
}
async function load(schema, signedInAs) {
  const { communityBoard } = await import(pathToFileURL(join(ROOT, 'js/community-board.js')).href);
  const DB = fakeDb(schema, signedInAs);
  const HOST = { DB, user: signedInAs ? { id: signedInAs } : null, commCaps: null, communityPosts: null,
    renderCommunity() {}, pushCommunityFeatures() {} };
  await communityBoard(HOST).loadCommunity();
  return { HOST, calls: DB.calls };
}

test('security-audit ⑤: signed out, the board never names a vote table and still shows the totals', async () => {
  const { HOST, calls } = await load('migrated', null);
  const named = calls.filter((c) => /\bcommunity_(?:comment_)?votes\b/.test(c.tbl + ' ' + c.cols));
  assert.deepEqual(named, [], `a signed-out reader asked for votes: ${JSON.stringify(named)}`);
  assert.equal(HOST.communityPosts.length, 1, 'the board loaded');
  assert.equal(HOST.communityPosts[0].votes, 3, 'the post total is vote_count');
  assert.equal(HOST.communityPosts[0].voted, false);
  assert.equal(HOST.communityPosts[0].comments[0].votes, 2, 'the comment total is vote_count');
  assert.equal(HOST.commCaps.commentVotes, true, 'comment votes are still offered to a signed-out reader');
});

test('security-audit ⑤: signed in, the board asks for the reader\'s own votes and takes the total from vote_count', async () => {
  const { HOST, calls } = await load('migrated', 'u-me');
  const posts = calls.filter((c) => c.tbl === 'community_posts' && /community_comments\(/.test(c.cols));
  assert.equal(posts.length, 1, 'one board request');
  assert.match(posts[0].cols, /,vote_count,community_votes\(user_id\)$/);
  assert.match(posts[0].cols, /vote_count,community_comment_votes\(user_id\)\)/);
  assert.equal(HOST.communityPosts[0].votes, 3, 'the total is vote_count, not the one row RLS returns');
  assert.equal(HOST.communityPosts[0].voted, true);
});

test('security-audit ⑤: before the migration, the totals are still the rows\' count', async () => {
  const { HOST } = await load('legacy', null);
  assert.equal(HOST.commCaps.voteCount, false);
  assert.equal(HOST.communityPosts[0].votes, 2);
  assert.equal(HOST.communityPosts[0].comments[0].votes, 1);
  const signedIn = await load('legacy', 'u-me');
  assert.equal(signedIn.HOST.communityPosts[0].votes, 3);
  assert.equal(signedIn.HOST.communityPosts[0].voted, true);
});
