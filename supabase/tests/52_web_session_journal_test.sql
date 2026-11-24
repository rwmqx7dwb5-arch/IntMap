-- ============================================================================
--  pgTAP · 52 — the operated-browser session journal: one row per step Atlas takes in a real browser session.
--  supabase/migrations/20261120140000_web_session_journal.sql
--    ① the table: columns, the verb set, the account foreign key (cascade), the indexes, RLS on;
--    ② the writer (service_role) appends, drops the query string, and refuses a verb outside the set;
--    ③ the owner reads their own rows only; no client role writes or reaches the RPCs;
--    ④ retention: the purge deletes only what is older than its argument;
--    ⑤ the account's data inventory has its sentence, and says it keeps nothing typed.
--  Users: 11… an ordinary account, 33… another account (supabase/tests/50_admin_mfa_session_test.sql).
--  The JS model of what is written is tests/browser-session-checks.test.mjs — this file runs the SQL itself.
-- ============================================================================
begin;
select no_plan();

do $$ begin execute format('grant anon, authenticated, service_role to %I', current_user); exception when others then null; end $$;

select has_table('public', 'web_session_journal', 'web_session_journal exists');
select columns_are('public', 'web_session_journal',
  array['id', 'user_id', 'action', 'host', 'path', 'ok', 'code', 'ms', 'blocked', 'created_at'],
  'the journal has exactly the columns web-session.js builds — and no column for what was typed');
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname = 'web_session_journal'), 'RLS is on');
select is((select confdeltype::text from pg_constraint
            where conrelid = 'public.web_session_journal'::regclass and contype = 'f' and confrelid = 'auth.users'::regclass),
  'c', 'a journal row goes with its account (on delete cascade)');
select ok(exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'web_session_journal' and indexdef ~ '\(created_at\)'), 'an index on created_at (the purge)');
select ok(exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'web_session_journal' and indexdef ~ '\(user_id, created_at\)'), 'an index on (user_id, created_at) (an account''s history)');

-- ── ② the writer ─────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select is(public.log_web_session('11111111-1111-1111-1111-111111111111', 'open', 'portal.example', '/search?q=private', true, '', 840, 0), true, 'service_role appends a step');
select is(public.log_web_session('11111111-1111-1111-1111-111111111111', 'click', 'portal.example', '/search', false, 'no_target', 12, 1), true, 'and a refused one, with the writes the wall stopped');
select throws_ok($$ select public.log_web_session('11111111-1111-1111-1111-111111111111', 'format-disk', 'x', '/', true, '', 1, 0) $$, '23514', null, 'a verb outside the closed set is refused by the table');
reset role;
select is((select path from public.web_session_journal where action = 'open'), '/search', 'the query string never reaches the table, even if the caller sent it');
select is((select blocked from public.web_session_journal where action = 'click'), 1, 'the count of refused writes is kept');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('log_web_session', 'purge_web_session_journal')
              and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
  0, 'anon and authenticated cannot execute the writer or the purge');

-- ── ③ who reads what ─────────────────────────────────────────────────────────
insert into public.web_session_journal (user_id, action, host, ok) values ('33333333-3333-3333-3333-333333333333', 'open', 'other.example', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select count(*)::int from public.web_session_journal), 2, 'an account reads its own two rows and not the other account''s');
select throws_ok($$ insert into public.web_session_journal (user_id, action, ok) values ('11111111-1111-1111-1111-111111111111', 'open', true) $$, '42501', null, 'an account cannot write its own journal');
select throws_ok($$ select public.log_web_session('11111111-1111-1111-1111-111111111111', 'open', 'x', '/', true, '', 1, 0) $$, '42501', null, 'an account cannot call the writer');
reset role;
set local role anon;
select throws_ok($$ select count(*) from public.web_session_journal $$, '42501', null, 'a signed-out reader reads nothing');
reset role;

-- ── ④ retention ──────────────────────────────────────────────────────────────
delete from public.web_session_journal;
insert into public.web_session_journal (user_id, action, ok, created_at) values
  ('11111111-1111-1111-1111-111111111111', 'open', true, now() - interval '40 days'),
  ('11111111-1111-1111-1111-111111111111', 'open', true, now() - interval '5 days'),
  ('11111111-1111-1111-1111-111111111111', 'open', true, now());
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select is(public.purge_web_session_journal(30), 1, 'the purge deletes the row older than 30 days');
select is(public.purge_web_session_journal(1), 1, 'and with a smaller window only what is older than that');
reset role;
select is((select count(*)::int from public.web_session_journal), 1, 'one row is left');

-- ── ⑤ the inventory ──────────────────────────────────────────────────────────
select is((select written_by from public.account_data_catalog where tbl = 'web_session_journal'), 'intmap', 'the account''s data inventory states the journal, as recorded by IntMap');
select ok((select label_jp ~ '[ぁ-ヿ㐀-鿿]' and retention_en ~ '30 days' and purpose_en ~ 'nothing you typed' from public.account_data_catalog where tbl = 'web_session_journal'), 'in Japanese too, it says how long, and it says it holds nothing typed');

select * from finish();
rollback;
