-- ============================================================================
--  pgTAP · 15 — anonymous-usage-counts: IntMap's own aggregate usage counters.
--
--  WHAT THIS PROVES (the half that needs a Postgres):
--    · the SURFACE — RLS on, anon/authenticated can neither read nor write the table, an admin can
--      read it, the two writer RPCs are SECURITY DEFINER with a pinned search_path and are
--      service_role only, and the summary is SECURITY INVOKER (so the admin policy decides);
--    · NO COLUMN CAN HOLD A PERSON — measured over the catalogue, so a later migration that adds
--      one turns this red;
--    · the ARITHMETIC — a repeated row adds to `count` instead of adding a row, the per-metric daily
--      ceiling refuses a NEW dimension but still counts a known one, and the purge removes only
--      what is older than the retention.
--  The declaration (which metrics, which dimensions) and the Edge Function are evaluated in Node by
--  tests/anonymous-usage-counts-checks.test.mjs.
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
select has_table('public', 'usage_counts', 'usage-counts: usage_counts exists');
select has_function('public', 'record_usage_counts', array['jsonb'], 'usage-counts: record_usage_counts exists');
select has_function('public', 'purge_usage_counts', array['integer'], 'usage-counts: purge_usage_counts exists');
select has_function('public', 'usage_counts_summary', array['integer'], 'usage-counts: usage_counts_summary exists');

select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = 'usage_counts'),
          'usage-counts: RLS is enabled on usage_counts');

select ok((select prosecdef from pg_proc where oid = 'public.record_usage_counts(jsonb)'::regprocedure),
          'usage-counts: record_usage_counts is SECURITY DEFINER');
select ok(exists(select 1 from unnest((select proconfig from pg_proc where oid = 'public.record_usage_counts(jsonb)'::regprocedure)) e where e like 'search_path=%'),
          'usage-counts: record_usage_counts pins search_path');
select ok((select prosecdef from pg_proc where oid = 'public.purge_usage_counts(integer)'::regprocedure),
          'usage-counts: purge_usage_counts is SECURITY DEFINER');
select ok(exists(select 1 from unnest((select proconfig from pg_proc where oid = 'public.purge_usage_counts(integer)'::regprocedure)) e where e like 'search_path=%'),
          'usage-counts: purge_usage_counts pins search_path');
select ok(not (select prosecdef from pg_proc where oid = 'public.usage_counts_summary(integer)'::regprocedure),
          'usage-counts: usage_counts_summary is SECURITY INVOKER — the admin policy decides who sees a row');

select ok(not has_function_privilege('anon',          'public.record_usage_counts(jsonb)', 'execute'), 'usage-counts: anon cannot execute record_usage_counts');
select ok(not has_function_privilege('authenticated', 'public.record_usage_counts(jsonb)', 'execute'), 'usage-counts: authenticated cannot execute record_usage_counts');
select ok(    has_function_privilege('service_role',  'public.record_usage_counts(jsonb)', 'execute'), 'usage-counts: service_role CAN execute record_usage_counts');
select ok(not has_function_privilege('anon',          'public.purge_usage_counts(integer)', 'execute'), 'usage-counts: anon cannot execute the purge');
select ok(not has_function_privilege('authenticated', 'public.purge_usage_counts(integer)', 'execute'), 'usage-counts: authenticated cannot execute the purge');
select ok(not has_function_privilege('anon',          'public.usage_counts_summary(integer)', 'execute'), 'usage-counts: anon cannot execute the summary');

select ok(not has_table_privilege('anon',          'public.usage_counts', 'select'),   'usage-counts: anon has no SELECT on usage_counts');
select ok(not has_table_privilege('anon',          'public.usage_counts', 'insert'),   'usage-counts: anon has no INSERT on usage_counts');
select ok(not has_table_privilege('authenticated', 'public.usage_counts', 'insert'),   'usage-counts: authenticated has no INSERT on usage_counts');
select ok(not has_table_privilege('authenticated', 'public.usage_counts', 'update'),   'usage-counts: authenticated has no UPDATE on usage_counts');
select ok(not has_table_privilege('authenticated', 'public.usage_counts', 'delete'),   'usage-counts: authenticated has no DELETE on usage_counts');
select ok(not has_table_privilege('authenticated', 'public.usage_counts', 'truncate'), 'usage-counts: authenticated has no TRUNCATE on usage_counts');

-- ⚠ NO COLUMN CAN HOLD AN ADDRESS, AN IDENTITY OR AN INSTANT. The exact column set is asserted, so a
--   later migration that adds any column at all turns this red and has to say why.
select is((select string_agg(column_name::text || ':' || data_type::text, ',' order by column_name)
             from information_schema.columns
            where table_schema = 'public' and table_name = 'usage_counts'),
          'count:bigint,day:date,dimension:text,metric:text',
          'usage-counts: the table is exactly (day date, metric, dimension, count) — no IP, user, session, User-Agent or timestamp');

-- ─────────────────────────────────────────────────────────────────────────────
--  2. THE ARITHMETIC, as service_role (the Edge Function's identity)
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select _sel('r1', $q$select public.record_usage_counts('[{"m":"view","d":"","n":1,"cap":1},{"m":"lang","d":"jp","n":1,"cap":3}]'::jsonb)::text$q$);
select _sel('r2', $q$select public.record_usage_counts('[{"m":"view","d":"","n":1,"cap":1},{"m":"atlas","d":"","n":4,"cap":1}]'::jsonb)::text$q$);
-- the per-metric daily ceiling: cap 2 for `ref` — two hosts are kept, a third NEW one is refused,
-- a KNOWN one still counts
select _sel('c1', $q$select public.record_usage_counts('[{"m":"ref","d":"news.ycombinator.com","n":1,"cap":2},{"m":"ref","d":"x.com","n":1,"cap":2}]'::jsonb)::text$q$);
select _sel('c2', $q$select public.record_usage_counts('[{"m":"ref","d":"reddit.com","n":1,"cap":2},{"m":"ref","d":"x.com","n":1,"cap":2}]'::jsonb)::text$q$);
-- a dimension the table's own CHECK refuses (a space, an '@') fails the whole request: nothing half-written
select _sel('bad', $q$select public.record_usage_counts('[{"m":"lang","d":"en","n":1,"cap":3},{"m":"utm_source","d":"a b@c.d","n":1,"cap":100}]'::jsonb)::text$q$);
-- not an array, a missing metric and a zero count are counted as nothing
select _sel('z1', $q$select public.record_usage_counts('{"m":"view"}'::jsonb)::text$q$);
select _sel('z2', $q$select public.record_usage_counts('[{"d":"x","n":1,"cap":1},{"m":"view","d":"","n":0,"cap":1}]'::jsonb)::text$q$);
reset role;

select is((select v from _cap where k = 'r1'), '2', 'usage-counts: two rows counted');
select is((select v from _cap where k = 'r2'), '2', 'usage-counts: …and two more');
select is((select count::int from public.usage_counts where metric = 'view' and dimension = '' and day = (now() at time zone 'utc')::date), 2,
          'usage-counts: the upsert ADDS to count (1 + 1)');
select is((select count(*)::int from public.usage_counts where metric = 'view'), 1, 'usage-counts: two page views on one day are one row');
select is((select count::int from public.usage_counts where metric = 'atlas'), 4, 'usage-counts: a row carries n, not 1');
select is((select v from _cap where k = 'c1'), '2', 'usage-counts: below the ceiling both new dimensions are counted');
select is((select v from _cap where k = 'c2'), '1', 'usage-counts: at the ceiling a NEW dimension is refused and a known one counts');
select is((select count(*)::int from public.usage_counts where metric = 'ref' and dimension = 'reddit.com'), 0, 'usage-counts: …and the refused one stores nothing');
select is((select count::int from public.usage_counts where metric = 'ref' and dimension = 'x.com'), 2, 'usage-counts: the known one is now 2');
select ok((select v from _cap where k = 'bad') like 'ERR:%', 'usage-counts: a dimension with a space or an @ is refused by the CHECK constraint');
select is((select count(*)::int from public.usage_counts where metric = 'lang' and dimension = 'en'), 0, 'usage-counts: …and the valid row of that request was rolled back with it');
select is((select v from _cap where k = 'z1'), '0', 'usage-counts: a body that is not an array counts nothing');
select is((select v from _cap where k = 'z2'), '0', 'usage-counts: a row without a metric, or with n = 0, counts nothing');

-- ─────────────────────────────────────────────────────────────────────────────
--  3. WHO MAY READ AND WRITE — impersonated roles
-- ─────────────────────────────────────────────────────────────────────────────
set local role anon;
select _sel('anon_sel', 'select count(*)::text from public.usage_counts');
select _run('anon_ins', $q$insert into public.usage_counts (day, metric, dimension, count) values (current_date, 'view', '', 1)$q$);
select _sel('anon_rpc', $q$select public.record_usage_counts('[{"m":"view","d":"","n":1,"cap":1}]'::jsonb)::text$q$);
select _sel('anon_sum', 'select count(*)::text from public.usage_counts_summary(30)');
reset role;

-- a signed-in reader who is not an admin: the table grant exists (for the admin policy), the policy returns no row
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _sel('user_sel', 'select count(*)::text from public.usage_counts');
select _sel('user_sum', 'select count(*)::text from public.usage_counts_summary(30)');
select _run('user_ins', $q$insert into public.usage_counts (day, metric, dimension, count) values (current_date, 'view', '', 1)$q$);
select _run('user_upd', 'update public.usage_counts set count = 999');
select _run('user_del', 'delete from public.usage_counts');
select _sel('user_rpc', $q$select public.record_usage_counts('[{"m":"view","d":"","n":1,"cap":1}]'::jsonb)::text$q$);
reset role;

-- the seeded admin (supabase/seed.sql: 33333333-… has profiles.is_admin = true)
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select _sel('admin_sel', 'select count(*)::text from public.usage_counts');
select _sel('admin_view', $q$select total::text from public.usage_counts_summary(30) where metric = 'view'$q$);
select _run('admin_upd', 'update public.usage_counts set count = 999');
reset role;

select is((select v from _cap where k = 'anon_sel'),   'DENIED', 'usage-counts: anon cannot read usage_counts');
select is((select v from _cap where k = 'anon_ins'),   'DENIED', 'usage-counts: anon cannot insert into usage_counts');
select is((select v from _cap where k = 'anon_rpc'),   'DENIED', 'usage-counts: anon cannot call record_usage_counts');
select is((select v from _cap where k = 'anon_sum'),   'DENIED', 'usage-counts: anon cannot call the summary');
select is((select v from _cap where k = 'user_sel'),   '0',      'usage-counts: a non-admin reader sees no row');
select is((select v from _cap where k = 'user_sum'),   '0',      'usage-counts: …and the summary, read with the reader''s rights, shows none either');
select is((select v from _cap where k = 'user_ins'),   'DENIED', 'usage-counts: a non-admin reader cannot insert');
select is((select v from _cap where k = 'user_upd'),   'DENIED', 'usage-counts: a non-admin reader cannot update');
select is((select v from _cap where k = 'user_del'),   'DENIED', 'usage-counts: a non-admin reader cannot delete');
select is((select v from _cap where k = 'user_rpc'),   'DENIED', 'usage-counts: a non-admin reader cannot call record_usage_counts');
select is((select v from _cap where k = 'admin_sel'),  '5',      'usage-counts: an admin reads every row (view, lang, atlas, two refs)');
select is((select v from _cap where k = 'admin_view'), '2',      'usage-counts: the summary totals a metric over the days');
select is((select v from _cap where k = 'admin_upd'),  'DENIED', 'usage-counts: an admin READS — the counters are not editable from the console');

-- ─────────────────────────────────────────────────────────────────────────────
--  4. RETENTION — 400 days.
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.usage_counts (day, metric, dimension, count) values
  ((now() at time zone 'utc')::date - 401, 'view', '', 7),
  ((now() at time zone 'utc')::date - 399, 'view', '', 9);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select _sel('purge', 'select public.purge_usage_counts(400)::text');
reset role;
select is((select v from _cap where k = 'purge'), '1', 'usage-counts: the purge removed exactly the day older than 400 days');
select ok(exists(select 1 from public.usage_counts where day = (now() at time zone 'utc')::date - 399),
          'usage-counts: a day 399 days old is kept');

select * from finish();
rollback;
