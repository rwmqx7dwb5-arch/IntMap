-- ============================================================================
--  pgTAP · 55 — atlas turn metrics: one row per finished Atlas answer, counts and milliseconds only.
--  supabase/migrations/20261130100000_atlas_turn_metrics.sql
--    ① the table: RLS on, the account foreign key, one row per (account, turn);
--    ② the writer: the caller's own account only, clamped, a replay is a no-op, a signed-out caller writes nothing;
--    ③ who reads what: the owner their own rows; no client role writes the table directly;
--    ④ atlas_metrics_overview: administrator (flag + MFA session) only; its parts; a ratio with nothing to measure is null;
--    ⑤ the account's data inventory has its sentence.
--  Users: 11… an ordinary account, 33… the administrator account (supabase/tests/50_admin_mfa_session_test.sql).
-- ============================================================================
begin;
select no_plan();

do $$ begin execute format('grant anon, authenticated, service_role to %I', current_user); exception when others then null; end $$;

-- ── ① the table ──────────────────────────────────────────────────────────────
select has_table('public', 'atlas_turn_metrics', 'atlas_turn_metrics exists');
select ok((select relrowsecurity from pg_class where oid = 'public.atlas_turn_metrics'::regclass), 'RLS is on');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.atlas_turn_metrics'::regclass and contype = 'f' and confrelid = 'auth.users'::regclass),
  'it is tied to the account (cascade on delete)');
select ok(not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'atlas_turn_metrics'
                       and column_name in ('question', 'answer', 'prompt', 'query', 'url', 'place', 'text')),
  'it has no column that could hold a question, an answer, a place or a link');

-- ── ② the writer ─────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is(public.log_atlas_turn_metrics('m-1', '{"total_ms": 20000, "first_useful_ms": 4000, "completion": "complete", "cost_micros": 50000, "cost_known": true, "ops_asked": 10, "ops_reused": 2, "claims_total": 4, "claims_grounded": 3, "model_ms": 12000, "critical_tool": "research.delegate", "critical_ms": 6000}'::jsonb),
  true, 'an account writes the row of its own finished answer');
select is(public.log_atlas_turn_metrics('m-1', '{"total_ms": 1}'::jsonb), true, 'a replay of the same turn is accepted');
select is((select total_ms from public.atlas_turn_metrics where turn_key = 'm-1'), 20000, 'and does not change the row');
select is(public.log_atlas_turn_metrics('m-2', '{"total_ms": -5, "ops_asked": 99999999999, "completion": "excellent", "first_useful_ms": null}'::jsonb), true, 'an out-of-range row is clamped, not refused');
select is((select total_ms || '/' || ops_asked || '/' || completion || '/' || coalesce(first_useful_ms::text, 'null') from public.atlas_turn_metrics where turn_key = 'm-2'),
  '0/1000000/none/null', 'negative to 0, huge to the ceiling, an unknown completion word to none, no useful result stays null');
select is(public.log_atlas_turn_metrics('', '{}'::jsonb), false, 'no turn key, no row');
select throws_ok($$ insert into public.atlas_turn_metrics (user_id, turn_key) values ('11111111-1111-1111-1111-111111111111', 'direct') $$,
  '42501', null, 'an account cannot write the table directly');
reset role;

set local role anon;
select throws_ok($$ select public.log_atlas_turn_metrics('anon-1', '{}'::jsonb) $$, '42501', null, 'a signed-out caller cannot call the writer');
reset role;

-- ── ③ who reads what ─────────────────────────────────────────────────────────
insert into public.atlas_turn_metrics (user_id, turn_key, total_ms, first_useful_ms, completion, cost_micros, cost_known, ops_asked, ops_reused, ops_unknown_tool, claims_total, claims_grounded, verify_program, verify_model, critical_tool, critical_ms) values
  ('33333333-3333-3333-3333-333333333333', 'a-1', 10000, 2000, 'complete', 40000, true, 10, 1, 0, 4, 4, 1, 3, 'research.delegate', 5000),
  ('33333333-3333-3333-3333-333333333333', 'a-2', 30000, null, 'partial',  90000, true, 10, 3, 2, 0, 0, 0, 0, 'map.draw', 1000);

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select count(*)::int from public.atlas_turn_metrics), 2, 'an account reads its own two rows and not the administrator''s');
select throws_ok($$ select public.atlas_metrics_overview() $$, 'P0001', 'not authorised', 'an ordinary account is refused the overview');
reset role;

-- ── ④ the overview ───────────────────────────────────────────────────────────
delete from public.atlas_turn_metrics where user_id = '11111111-1111-1111-1111-111111111111';
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select throws_ok($$ select public.atlas_metrics_overview() $$, 'P0001', 'not authorised', 'the administrator account without the second factor is refused');
reset role;

select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is((select array_agg(k order by k) from jsonb_object_keys(public.atlas_metrics_overview()) k), array['calls', 'children', 'families', 'from', 'to', 'turns'], 'its parts');
select is((public.atlas_metrics_overview() -> 'turns' ->> 'turns')::int, 2, 'two answers in the window');
select is((public.atlas_metrics_overview() -> 'turns' ->> 'completion_rate')::numeric, 0.5, 'one of two declared itself complete');
select is((public.atlas_metrics_overview() -> 'turns' ->> 'duplicate_op_rate')::numeric, 0.2, '4 repeats in 20 operations');
select is((public.atlas_metrics_overview() -> 'turns' ->> 'capability_found_rate')::numeric, 0.9, '2 unknown tools in 20 operations');
select is((public.atlas_metrics_overview() -> 'turns' ->> 'grounded_claim_rate')::numeric, 1::numeric, 'every finding carried a source');
select is((public.atlas_metrics_overview() -> 'turns' ->> 'program_verified_share')::numeric, 0.25, '1 of 4 checks decided by a program');
select is((public.atlas_metrics_overview() -> 'turns' ->> 'cost_per_success_micros')::numeric, 40000::numeric, 'cost per complete answer');
select is((public.atlas_metrics_overview() -> 'turns' ->> 'first_useful_ms_p50')::int, 2000, 'a turn with no useful result is not counted as 0 ms');
select is(public.atlas_metrics_overview() -> 'turns' -> 'critical_tools' -> 0 ->> 'tool', 'research.delegate', 'the slowest path first');
select is(public.atlas_metrics_overview(now() - interval '60 days', now() - interval '50 days') -> 'turns' -> 'completion_rate', 'null'::jsonb,
  'a window with no answers has a null ratio, not 0');
reset role;

-- ── ⑤ the data inventory ─────────────────────────────────────────────────────
select is((select written_by from public.account_data_catalog where tbl = 'atlas_turn_metrics'), 'intmap', 'the account''s data inventory states the table');
select ok((select label_jp ~ '[ぁ-ヿ㐀-鿿]' and retention_en ~ '90 days' from public.account_data_catalog where tbl = 'atlas_turn_metrics'), 'in both languages, with the retention');

select * from finish();
rollback;
