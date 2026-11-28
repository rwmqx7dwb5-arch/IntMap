-- ============================================================================
--  pgTAP · 50 — atlas-delegation journal: one row per worker call and per Atlas root turn.
--  supabase/migrations/20261119120000_delegation_journal.sql
--    ① the table: columns, the outcome set, the account foreign key (cascade), the two indexes, RLS on;
--    ② the owner reads their own rows and nobody else's; no client role writes or reaches the RPCs;
--    ③ the writer (service_role) appends, and refuses a word outside the outcome set;
--    ④ retention: the purge deletes only what is older than its argument, and the daily job exists;
--    ⑤ delegation_overview: admin (flag + MFA session) only, and the shape the console is built against;
--    ⑥ the account's data inventory has its sentence.
--  Users: 11… an ordinary account, 33… the administrator account (supabase/tests/50_admin_mfa_session_test.sql).
--  The JS model of the writer is tests/delegation-journal-checks.test.mjs — this file runs the SQL itself.
-- ============================================================================
begin;
select no_plan();

do $$ begin execute format('grant anon, authenticated, service_role to %I', current_user); exception when others then null; end $$;

-- pg_cron is not in every stack (the local one, CI's rebuild): ask without naming cron.job at parse time
create function pg_temp._cron_has(p_name text) returns boolean language plpgsql as $$
declare r boolean;
begin
  if to_regclass('cron.job') is null then return null; end if;
  execute 'select exists (select 1 from cron.job where jobname = $1)' into r using p_name;
  return r;
end $$;

-- ── ① the table ───────────────────────────────────────────────────────────────
select has_table('public', 'ai_delegation_journal', 'ai_delegation_journal exists');
select columns_are('public', 'ai_delegation_journal',
  array['id', 'user_id', 'root_key', 'child_key', 'task', 'outcome', 'code', 'http_status', 'model', 'latency_ms', 'input_tokens', 'output_tokens', 'cost_micros', 'web', 'created_at', 'cached_tokens', 'web_searches', 'cost_complete', 'call_id'],
  'the journal has the columns the console and the proxy agree on');
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname = 'ai_delegation_journal'), 'RLS is on');
select is((select confdeltype::text from pg_constraint
            where conrelid = 'public.ai_delegation_journal'::regclass and contype = 'f' and confrelid = 'auth.users'::regclass),
  'c', 'a journal row goes with its account (on delete cascade)');
select ok(exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'ai_delegation_journal' and indexdef ~ '\(created_at\)'), 'an index on created_at (the purge and the window)');
select ok(exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'ai_delegation_journal' and indexdef ~ '\(user_id, root_key\)'), 'an index on (user_id, root_key) (a family)');

-- ── ③ the writer: service_role only ──────────────────────────────────────────
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select is(public.log_ai_delegation('11111111-1111-1111-1111-111111111111', 'j-rpc', 'j-child', 'atlas_delegate', 'ok', '', 200, 'gpt-6.1-terra', 850, 120, 30, 1500, true), true,
  'service_role appends a worker row');
select is(public.log_ai_delegation('11111111-1111-1111-1111-111111111111', 'j-rpc', '', 'atlas_turn', 'refused', 'turn_cost', 409, '', 5, 0, 0, 0, false), true,
  'service_role appends a root row (no child key)');
select throws_ok($$ select public.log_ai_delegation('11111111-1111-1111-1111-111111111111', 'j-rpc', 'x', 'atlas_delegate', 'exploded', '', 500, '', 1, 0, 0, 0, false) $$,
  '23514', null, 'an outcome outside ok | failed | refused is refused by the table');
reset role;
select is((select count(*)::int from public.ai_delegation_journal where root_key = 'j-rpc'), 2, 'the two rows are there, the bad one is not');
select is((select child_key from public.ai_delegation_journal where root_key = 'j-rpc' and task = 'atlas_turn'), null, 'a root turn has a NULL child key (an empty string is stored as NULL)');
select is((select model || '/' || input_tokens || '/' || output_tokens || '/' || cost_micros || '/' || web::text from public.ai_delegation_journal where root_key = 'j-rpc' and task = 'atlas_delegate'),
  'gpt-6.1-terra/120/30/1500/true', 'the row keeps what the proxy measured');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('log_ai_delegation', 'purge_ai_delegation_journal')
              and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
  0, 'anon and authenticated cannot execute the writer or the purge');
select ok(has_function_privilege('service_role', 'public.log_ai_delegation(uuid, text, text, text, text, text, integer, text, integer, integer, integer, bigint, boolean, integer, integer, boolean, text)', 'execute'), 'service_role can write');

-- ── ② who reads what ─────────────────────────────────────────────────────────
-- fixtures for the overview, owned by the administrator account; one row is outside any 7-day window
insert into public.ai_delegation_journal (user_id, root_key, child_key, task, outcome, code, http_status, model, latency_ms, input_tokens, output_tokens, cost_micros, web, created_at) values
  ('33333333-3333-3333-3333-333333333333', 'o-root', 'o-c1', 'atlas_delegate', 'ok',      '',                     200, 'm', 100, 10, 5, 1000000, false, now()),
  ('33333333-3333-3333-3333-333333333333', 'o-root', 'o-c2', 'atlas_delegate', 'failed',  'provider_unavailable', 503, 'm', 300, 10, 0,  250000, false, now()),
  ('33333333-3333-3333-3333-333333333333', 'o-root', 'o-c3', 'atlas_delegate', 'refused', 'delegation_children', 409, '',  500, 0,  0,  0,      false, now()),
  ('33333333-3333-3333-3333-333333333333', 'o-root', null,   'atlas_turn',     'ok',      '',                     200, 'm', 2000, 50, 9, 500000, true,  now()),
  ('33333333-3333-3333-3333-333333333333', 'o-old',  'o-c9', 'atlas_delegate', 'ok',      '',                     200, 'm', 999, 1, 1, 999999, false, now() - interval '10 days');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select count(*)::int from public.ai_delegation_journal), 2, 'an account reads its own two rows and not the administrator''s five');
select throws_ok($$ insert into public.ai_delegation_journal (user_id, root_key, task, outcome) values ('11111111-1111-1111-1111-111111111111', 'x', 'atlas_turn', 'ok') $$,
  '42501', null, 'an account cannot write its own journal');
select throws_ok($$ select public.log_ai_delegation('11111111-1111-1111-1111-111111111111', 'x', '', 'atlas_turn', 'ok', '', 200, '', 1, 0, 0, 0, false) $$,
  '42501', null, 'an account cannot call the writer');
select throws_ok($$ select public.delegation_overview(7) $$, 'P0001', 'not authorised', 'an ordinary account is refused the overview');
reset role;

set local role anon;
select throws_ok($$ select count(*) from public.ai_delegation_journal $$, '42501', null, 'a signed-out reader reads nothing');
select throws_ok($$ select public.delegation_overview(7) $$, '42501', null, 'a signed-out reader cannot call the overview');
reset role;

-- ── ⑤ the overview ───────────────────────────────────────────────────────────
-- The overview reads EVERY account's rows. The two rows the writer tests (③) appended for an ordinary account are not part of its
-- fixtures — left in, they add a worker call, a root turn and a code to every count below — so they are removed here, after the
-- only checks that needed them (the account reads its own two rows) have run.
delete from public.ai_delegation_journal where root_key = 'j-rpc';
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select throws_ok($$ select public.delegation_overview(7) $$, 'P0001', 'not authorised', 'the administrator account without the second factor is refused');
reset role;

select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is(jsonb_typeof(public.delegation_overview(7)), 'object', 'the administrator in an MFA session gets an object');
select is((select array_agg(k order by k) from jsonb_object_keys(public.delegation_overview(7)) k), array['codes', 'days', 'roots'], 'its three parts');
select is((select array_agg(k order by k) from jsonb_object_keys(public.delegation_overview(7) -> 'days' -> 0) k),
  array['children', 'cost_usd', 'day', 'failed', 'ok', 'p50_ms', 'p90_ms', 'refused'], 'a day has exactly the fields the console reads');
select is((select array_agg(k order by k) from jsonb_object_keys(public.delegation_overview(7) -> 'roots') k),
  array['cost_usd', 'p50_ms', 'p90_ms', 'turns'], 'roots has exactly the fields the console reads');
select is(jsonb_array_length(public.delegation_overview(7) -> 'days'), 1, 'one UTC day has worker rows in the window (the 10-day-old row is outside it)');
select is(public.delegation_overview(7) -> 'days' -> 0 ->> 'day', to_char((now() at time zone 'utc')::date, 'YYYY-MM-DD'), 'the day is the UTC date');
select is((select (d ->> 'children') || '/' || (d ->> 'ok') || '/' || (d ->> 'failed') || '/' || (d ->> 'refused') from (select public.delegation_overview(7) -> 'days' -> 0 as d) x),
  '3/1/1/1', 'worker calls by outcome (the root turn is not a worker call)');
select is((public.delegation_overview(7) -> 'days' -> 0 ->> 'p50_ms')::int, 300, 'p50 of 100, 300, 500 ms');
select is((public.delegation_overview(7) -> 'days' -> 0 ->> 'p90_ms')::int, 460, 'p90 of 100, 300, 500 ms (percentile_cont interpolates)');
select is((public.delegation_overview(7) -> 'days' -> 0 ->> 'cost_usd')::numeric, 1.25, 'cost in dollars: 1,250,000 micro-dollars');
select is(public.delegation_overview(7) -> 'codes', '[{"code": "delegation_children", "n": 1}, {"code": "provider_unavailable", "n": 1}]'::jsonb,
  'the codes of calls that did not end ok, most frequent first, then by name');
select is((public.delegation_overview(7) -> 'roots' ->> 'turns')::int, 1, 'one Atlas root turn');
select is((public.delegation_overview(7) -> 'roots' ->> 'p50_ms')::int, 2000, 'its latency');
select is((public.delegation_overview(7) -> 'roots' ->> 'cost_usd')::numeric, 0.5, 'its cost');
select is(jsonb_array_length(public.delegation_overview(30) -> 'days'), 2, 'a wider window reaches the 10-day-old row');
select is(public.delegation_overview(0) -> 'roots' ->> 'turns', '1', 'a window of 0 days is read as the shortest (1), not an error');
reset role;

-- an empty window is a well-formed answer, not a null
delete from public.ai_delegation_journal;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is(public.delegation_overview(7), '{"days": [], "codes": [], "roots": {"turns": 0, "p50_ms": 0, "p90_ms": 0, "cost_usd": 0.000000}}'::jsonb, 'no rows: empty lists and zeros');
reset role;

-- ── ④ retention ──────────────────────────────────────────────────────────────
insert into public.ai_delegation_journal (user_id, root_key, task, outcome, created_at) values
  ('11111111-1111-1111-1111-111111111111', 'p-old',   'atlas_turn', 'ok', now() - interval '31 days'),
  ('11111111-1111-1111-1111-111111111111', 'p-edge',  'atlas_turn', 'ok', now() - interval '29 days'),
  ('11111111-1111-1111-1111-111111111111', 'p-today', 'atlas_turn', 'ok', now());
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select is(public.purge_ai_delegation_journal(30), 1, 'the purge deletes the row older than 30 days');
reset role;
select is((select string_agg(root_key, ',' order by root_key) from public.ai_delegation_journal), 'p-edge,p-today', 'and keeps the rest');
select ok(pg_temp._cron_has('ai-delegation-journal-purge') is not false,
  'the daily retention job is scheduled (or pg_cron is not installed in this stack, in which case the migration said so)');

-- ── ⑥ the inventory ──────────────────────────────────────────────────────────
select is((select written_by from public.account_data_catalog where tbl = 'ai_delegation_journal'), 'intmap', 'the account''s data inventory states the journal, as recorded by IntMap');
select ok((select label_jp ~ '[ぁ-ヿ㐀-鿿]' and retention_en ~ '30 days' from public.account_data_catalog where tbl = 'ai_delegation_journal'), 'in Japanese too, and it says how long');

select * from finish();
rollback;
