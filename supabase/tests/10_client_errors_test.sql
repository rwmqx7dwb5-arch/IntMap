-- ============================================================================
--  pgTAP · 10 — client-error-log: IntMap's own error record.
--
--  THE DEFECT THIS PROVES CLOSED: error monitoring was a Sentry loader with no DSN,
--  so nothing any reader's browser threw was recorded anywhere. public.client_errors
--  is the store that replaced it. This file asserts the half that needs a Postgres:
--    · the SURFACE — RLS on, anon/authenticated can neither read nor write, an admin
--      can read, the two RPCs are SECURITY DEFINER with a pinned search_path and are
--      service_role only;
--    · the ARITHMETIC — a repeated fingerprint adds to `count` instead of adding a
--      row, a full table refuses a NEW defect but still counts a known one, and the
--      purge removes only what was last seen more than 30 days ago.
--  The scrubbing and the fingerprint are evaluated in Node by
--  tests/client-error-log-checks.test.mjs.
-- ============================================================================
begin;
select no_plan();

do $imp$ begin execute format('grant anon, authenticated, service_role to %I', current_user); exception when others then null; end $imp$;

create table _cap (k text primary key, v text);
grant insert, select on _cap to anon, authenticated, service_role;

create function _sel(k text, q text) returns void language plpgsql as $$
declare c text;
begin
  execute q into c;
  insert into _cap values (k, coalesce(c, '<null>'));
exception
  when insufficient_privilege then insert into _cap values (k, 'DENIED');
  when others then insert into _cap values (k, 'ERR:' || sqlstate);
end;
$$;
create function _run(k text, q text) returns void language plpgsql as $$
begin execute q; insert into _cap values (k, 'OK');
exception when insufficient_privilege then insert into _cap values (k, 'DENIED');
        when others then insert into _cap values (k, 'ERR:' || sqlstate); end; $$;

-- ─────────────────────────────────────────────────────────────────────────────
--  1. THE SURFACE
-- ─────────────────────────────────────────────────────────────────────────────
select has_table('public', 'client_errors', 'client-error-log: client_errors exists');
select has_function('public', 'record_client_error', array['text','text','text','text','text','text','text','integer'], 'client-error-log: record_client_error exists');
select has_function('public', 'purge_client_errors', array['integer'], 'client-error-log: purge_client_errors exists');

select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = 'client_errors'),
          'client-error-log: RLS is enabled on client_errors');

select ok((select prosecdef from pg_proc where oid = 'public.record_client_error(text,text,text,text,text,text,text,integer)'::regprocedure),
          'client-error-log: record_client_error is SECURITY DEFINER');
select ok(exists(select 1 from unnest((select proconfig from pg_proc where oid = 'public.record_client_error(text,text,text,text,text,text,text,integer)'::regprocedure)) e where e like 'search_path=%'),
          'client-error-log: record_client_error pins search_path');
select ok((select prosecdef from pg_proc where oid = 'public.purge_client_errors(integer)'::regprocedure),
          'client-error-log: purge_client_errors is SECURITY DEFINER');
select ok(exists(select 1 from unnest((select proconfig from pg_proc where oid = 'public.purge_client_errors(integer)'::regprocedure)) e where e like 'search_path=%'),
          'client-error-log: purge_client_errors pins search_path');

select ok(not has_function_privilege('anon',          'public.record_client_error(text,text,text,text,text,text,text,integer)', 'execute'), 'client-error-log: anon cannot execute record_client_error');
select ok(not has_function_privilege('authenticated', 'public.record_client_error(text,text,text,text,text,text,text,integer)', 'execute'), 'client-error-log: authenticated cannot execute record_client_error');
select ok(    has_function_privilege('service_role',  'public.record_client_error(text,text,text,text,text,text,text,integer)', 'execute'), 'client-error-log: service_role CAN execute record_client_error');
select ok(not has_function_privilege('anon',          'public.purge_client_errors(integer)', 'execute'), 'client-error-log: anon cannot execute the purge');
select ok(not has_function_privilege('authenticated', 'public.purge_client_errors(integer)', 'execute'), 'client-error-log: authenticated cannot execute the purge');

select ok(not has_table_privilege('anon',          'public.client_errors', 'select'),   'client-error-log: anon has no SELECT on client_errors');
select ok(not has_table_privilege('anon',          'public.client_errors', 'insert'),   'client-error-log: anon has no INSERT on client_errors');
select ok(not has_table_privilege('authenticated', 'public.client_errors', 'insert'),   'client-error-log: authenticated has no INSERT on client_errors');
select ok(not has_table_privilege('authenticated', 'public.client_errors', 'update'),   'client-error-log: authenticated has no UPDATE on client_errors');
select ok(not has_table_privilege('authenticated', 'public.client_errors', 'delete'),   'client-error-log: authenticated has no DELETE on client_errors');
select ok(not has_table_privilege('authenticated', 'public.client_errors', 'truncate'), 'client-error-log: authenticated has no TRUNCATE on client_errors');

-- ⚠ NO COLUMN CAN HOLD AN ADDRESS OR AN IDENTITY. Measured over the catalogue, so a later
--   migration that adds one turns this red rather than passing it silently.
select is((select count(*)::int from information_schema.columns
            where table_schema = 'public' and table_name = 'client_errors'
              and (column_name ~ '(^|_)(ip|addr|address|user|user_id|uid|email|session|query|ua|user_agent)($|_)'
                   or data_type in ('inet', 'cidr', 'uuid'))),
          0, 'client-error-log: client_errors has no column for an IP, a user, a session, a query or a raw User-Agent');

-- ─────────────────────────────────────────────────────────────────────────────
--  2. THE ARITHMETIC, as service_role (the Edge Function's identity)
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select _sel('i1', 'select public.record_client_error(''aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'', ''error'', ''TypeError: x is undefined'', ''at f (a.js:1:2)'', ''/IntMap/'', ''2026-09-25-client-error-log'', ''Chrome 140'', 1000)');
select _sel('i2', 'select public.record_client_error(''aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'', ''error'', ''TypeError: x is undefined'', ''at f (a.js:1:2)'', ''/IntMap/'', ''2026-09-26-R809'', ''Safari 18'', 1000)');
select _sel('i3', 'select public.record_client_error(''aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'', ''error'', ''TypeError: x is undefined'', '''', ''/IntMap/'', ''2026-09-26-R809'', ''Safari 18'', 1000)');
select _sel('i4', 'select public.record_client_error(''bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'', ''rejection'', ''Error: boom'', '''', ''/IntMap/'', ''2026-09-25-client-error-log'', ''Firefox 131'', 1000)');
-- a fingerprint that is not the 32-hex shape is refused by the table itself
select _sel('bad', 'select public.record_client_error(''not-a-fingerprint'', ''error'', ''m'', '''', ''/'', '''', '''', 1000)');
reset role;

select is((select v from _cap where k = 'i1'), 'inserted', 'client-error-log: the first report of a defect inserts a row');
select is((select v from _cap where k = 'i2'), 'counted',  'client-error-log: the second report of the same fingerprint counts, it does not insert');
select is((select v from _cap where k = 'i3'), 'counted',  'client-error-log: …and so does the third');
select is((select count::int from public.client_errors where fingerprint = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), 3, 'client-error-log: upsert ADDS to count (1 + 1 + 1)');
select is((select count(*)::int from public.client_errors where fingerprint = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), 1, 'client-error-log: three reports of one defect are one row');
select is((select release from public.client_errors where fingerprint = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), '2026-09-26-R809', 'client-error-log: the row carries the build it was LAST seen on');
select is((select stack from public.client_errors where fingerprint = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), 'at f (a.js:1:2)', 'client-error-log: a report without a stack does not erase the stack already held');
select is((select kind from public.client_errors where fingerprint = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'), 'rejection', 'client-error-log: the kind is kept');
select ok((select v from _cap where k = 'bad') like 'ERR:%', 'client-error-log: a malformed fingerprint is refused by the CHECK constraint');

-- THE SIZE CEILING: with 2 rows held and a ceiling of 2, a new defect is refused and a known one still counts.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select _sel('f1', 'select public.record_client_error(''cccccccccccccccccccccccccccccccc'', ''error'', ''RangeError'', '''', ''/'', '''', '''', 2)');
select _sel('f2', 'select public.record_client_error(''bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'', ''rejection'', ''Error: boom'', '''', ''/'', '''', '''', 2)');
reset role;
select is((select v from _cap where k = 'f1'), 'full',    'client-error-log: a full table refuses a NEW fingerprint');
select is((select count(*)::int from public.client_errors where fingerprint = 'cccccccccccccccccccccccccccccccc'), 0, 'client-error-log: …and stores nothing for it');
select is((select v from _cap where k = 'f2'), 'counted', 'client-error-log: a full table still COUNTS a known one');
select is((select count::int from public.client_errors where fingerprint = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'), 2, 'client-error-log: the known one is now 2');

-- ─────────────────────────────────────────────────────────────────────────────
--  3. WHO MAY READ AND WRITE — impersonated roles
-- ─────────────────────────────────────────────────────────────────────────────
set local role anon;
select _sel('anon_sel', 'select count(*)::text from public.client_errors');
select _run('anon_ins', 'insert into public.client_errors (fingerprint, message) values (''dddddddddddddddddddddddddddddddd'', ''x'')');
select _sel('anon_rpc', 'select public.record_client_error(''dddddddddddddddddddddddddddddddd'', ''error'', ''x'', '''', ''/'', '''', '''', 1000)');
reset role;

-- a signed-in reader who is not an admin: the table grant exists (for the admin policy), the policy returns no row
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _sel('user_sel', 'select count(*)::text from public.client_errors');
select _run('user_ins', 'insert into public.client_errors (fingerprint, message) values (''dddddddddddddddddddddddddddddddd'', ''x'')');
select _run('user_upd', 'update public.client_errors set count = 999');
select _run('user_del', 'delete from public.client_errors');
select _sel('user_rpc', 'select public.record_client_error(''dddddddddddddddddddddddddddddddd'', ''error'', ''x'', '''', ''/'', '''', '''', 1000)');
reset role;

-- the seeded admin (supabase/seed.sql: 33333333-… has profiles.is_admin = true)
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select _sel('admin_sel', 'select count(*)::text from public.client_errors');
select _run('admin_upd', 'update public.client_errors set count = 999');
reset role;

select is((select v from _cap where k = 'anon_sel'),  'DENIED', 'client-error-log: anon cannot read client_errors');
select is((select v from _cap where k = 'anon_ins'),  'DENIED', 'client-error-log: anon cannot insert into client_errors');
select is((select v from _cap where k = 'anon_rpc'),  'DENIED', 'client-error-log: anon cannot call record_client_error');
select is((select v from _cap where k = 'user_sel'),  '0',      'client-error-log: a non-admin reader sees no row');
select is((select v from _cap where k = 'user_ins'),  'DENIED', 'client-error-log: a non-admin reader cannot insert');
select is((select v from _cap where k = 'user_upd'),  'DENIED', 'client-error-log: a non-admin reader cannot update');
select is((select v from _cap where k = 'user_del'),  'DENIED', 'client-error-log: a non-admin reader cannot delete');
select is((select v from _cap where k = 'user_rpc'),  'DENIED', 'client-error-log: a non-admin reader cannot call record_client_error');
select is((select v from _cap where k = 'admin_sel'), '2',      'client-error-log: an admin reads every row');
select is((select v from _cap where k = 'admin_upd'), 'DENIED', 'client-error-log: an admin READS — the record is not editable from the console');
select is((select count(*)::int from public.client_errors where fingerprint = 'dddddddddddddddddddddddddddddddd'), 0, 'client-error-log: the refused writes stored nothing');

-- ─────────────────────────────────────────────────────────────────────────────
--  4. RETENTION — 30 days after LAST seen.
-- ─────────────────────────────────────────────────────────────────────────────
update public.client_errors set last_seen = now() - interval '31 days', first_seen = now() - interval '40 days'
 where fingerprint = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
update public.client_errors set last_seen = now() - interval '29 days', first_seen = now() - interval '40 days'
 where fingerprint = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select _sel('purge', 'select public.purge_client_errors(30)::text');
reset role;
select is((select v from _cap where k = 'purge'), '1', 'client-error-log: the purge removed exactly the row last seen 31 days ago');
select ok(exists(select 1 from public.client_errors where fingerprint = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
          'client-error-log: a defect first seen 40 days ago but last seen 29 days ago is kept');

select * from finish();
rollback;
