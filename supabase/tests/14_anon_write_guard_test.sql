-- ============================================================================
--  pgTAP · 14 — anon-write-guard: nothing in public accepts a direct INSERT from anon, and the two
--  report tables are written by service_role (the reader-reports Edge Function) alone.
--    ① THE CENSUS — every table in public, found from the catalogue rather than listed: none may be
--      inserted into by anon, i.e. none where anon holds an INSERT privilege on any column AND the
--      row would pass (RLS off, or an INSERT/ALL policy that applies to anon or PUBLIC). A table a
--      later migration opens to anon turns this red, whatever it is called.
--    ② feedback / bug_reports: no INSERT policy, no INSERT privilege for anon or authenticated, and
--      a direct insert by either is refused (42501 → DENIED).
--    ③ service_role still writes both — the function's path — with a user_id of its choosing.
--  The Edge Function's own rules (buckets, verified identity, column ceilings) are measured in
--  tests/anon-write-guard-checks.test.mjs, which evaluates it.
-- ============================================================================
begin;
select no_plan();

-- ─────────────────────────────────────────────────────────────────────────────
--  1. THE CENSUS. Run BEFORE this file creates its own _cap: a table created here receives the
--     default privileges (anon ALL — docs/SECURITY-ARCHITECTURE.md §8 item 6), and names starting
--     with «_» are this suite's scratch tables, excluded for the same reason.
-- ─────────────────────────────────────────────────────────────────────────────
select is(
  (select coalesce(string_agg(c.relname::text, ', ' order by c.relname), '')
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and left(c.relname, 1) <> '_'
      and has_any_column_privilege('anon', c.oid, 'INSERT')
      and (not c.relrowsecurity
           or exists (select 1 from pg_policies p
                       where p.schemaname = 'public' and p.tablename = c.relname
                         and p.cmd in ('INSERT', 'ALL')
                         and p.roles && array['anon', 'public']::name[]))),
  '',
  'anon-write-guard: no table in public accepts a direct INSERT from anon');

-- ─────────────────────────────────────────────────────────────────────────────
--  2. THE TWO REPORT TABLES
-- ─────────────────────────────────────────────────────────────────────────────
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename in ('feedback', 'bug_reports') and cmd in ('INSERT', 'ALL')),
  0, 'anon-write-guard: feedback and bug_reports have no INSERT policy');
select ok(not has_any_column_privilege('anon',          'public.feedback',    'INSERT'), 'anon holds no INSERT on feedback');
select ok(not has_any_column_privilege('authenticated', 'public.feedback',    'INSERT'), 'authenticated holds no INSERT on feedback');
select ok(not has_any_column_privilege('anon',          'public.bug_reports', 'INSERT'), 'anon holds no INSERT on bug_reports');
select ok(not has_any_column_privilege('authenticated', 'public.bug_reports', 'INSERT'), 'authenticated holds no INSERT on bug_reports');
-- reading and deleting are unchanged: an admin's, through RLS
select ok(has_table_privilege('authenticated', 'public.feedback',    'SELECT'), 'authenticated keeps SELECT on feedback (RLS → admin)');
select ok(has_table_privilege('authenticated', 'public.feedback',    'DELETE'), 'authenticated keeps DELETE on feedback (RLS → admin)');
select ok(has_table_privilege('authenticated', 'public.bug_reports', 'SELECT'), 'authenticated keeps SELECT on bug_reports (RLS → admin)');

do $$ begin execute format('grant anon, authenticated, service_role to %I', current_user); exception when others then null; end $$;

create table _cap (k text primary key, v text);
grant insert, select on _cap to anon, authenticated, service_role;
create function _run(k text, q text) returns void language plpgsql as $$
begin execute q; insert into _cap values (k,'OK');
exception when insufficient_privilege then insert into _cap values (k,'DENIED');
        when others then insert into _cap values (k,'ERR:'||sqlstate); end; $$;

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select _run('anon_fb',  'insert into public.feedback (rating, comment) values (4, ''x'')');
select _run('anon_bug', 'insert into public.bug_reports (description) values (''x'')');
reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _run('a_fb',  'insert into public.feedback (user_id, rating) values (''11111111-1111-1111-1111-111111111111'', 5)');
select _run('a_bug', 'insert into public.bug_reports (user_id, description) values (''11111111-1111-1111-1111-111111111111'', ''x'')');
reset role;

-- ─────────────────────────────────────────────────────────────────────────────
--  3. THE FUNCTION'S PATH — service_role writes both, naming the verified account
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select _run('svc_fb',  'insert into public.feedback (user_id, email, rating, comment, lang, ua, page) values (''11111111-1111-1111-1111-111111111111'', ''a@intmap.test'', 5, ''[General] via reader-reports'', ''en'', ''UA'', ''/IntMap/'')');
select _run('svc_bug', 'insert into public.bug_reports (user_id, category, description, diagnostics, lang, build, ua, page) values (null, ''map'', ''via reader-reports'', ''{"layers":[]}''::jsonb, ''jp'', ''b'', ''UA'', ''/IntMap/'')');
reset role;

-- asserted as the owner (the ledger is read by the session that can read everything)
select is((select v from _cap where k='anon_fb'),  'DENIED', 'anon cannot insert feedback directly');
select is((select v from _cap where k='anon_bug'), 'DENIED', 'anon cannot insert a bug report directly');
select is((select v from _cap where k='a_fb'),     'DENIED', 'a signed-in reader cannot insert feedback directly, even as itself');
select is((select v from _cap where k='a_bug'),    'DENIED', 'a signed-in reader cannot insert a bug report directly');
select is((select v from _cap where k='svc_fb'),   'OK',     'service_role (reader-reports) writes feedback');
select is((select v from _cap where k='svc_bug'),  'OK',     'service_role (reader-reports) writes a bug report');
select is((select count(*)::int from public.feedback where comment = '[General] via reader-reports'), 1, 'the function''s row is stored');
-- the #R155 ceilings still stand in front of the function's writes
select throws_ok(
  $$ insert into public.feedback (rating, comment) values (3, repeat('x', 5001)) $$,
  '23514', null, 'feedback_len_guard still refuses an over-length comment');

select * from finish();
rollback;
