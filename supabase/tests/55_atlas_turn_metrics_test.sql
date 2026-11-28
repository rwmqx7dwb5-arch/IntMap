-- ============================================================================
--  pgTAP · 55 — atlas turn metrics: one row per finished Atlas answer, counts and milliseconds only.
--  supabase/migrations/20261130110000_atlas_turn_metrics.sql
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
insert into public.atlas_turn_metrics (user_id, turn_key, total_ms, first_useful_ms, completion, cost_micros, cost_known, ops_asked, ops_reused, ops_unknown_tool, claims_total, claims_grounded, verify_program, verify_model, critical_tool, critical_ms, metrics_version, useful_shown, claims_cited, claims_evidenced, claims_backing, task_key, model_calls, provider_call_ids) values
  ('33333333-3333-3333-3333-333333333333', 'a-1', 10000, 2000, 'complete', 40000, true, 10, 1, 0, 4, 4, 1, 3, 'research.delegate', 5000, 3, true, 4, 4, 2, null, 3, '{call-main,call-sizing,call-search}'),
  ('33333333-3333-3333-3333-333333333333', 'a-2', 30000, null, 'partial',  90000, true, 10, 3, 2, 0, 0, 0, 0, 'map.draw', 1000, 3, false, 0, 0, 0, 'a-1', 1, '{call-verify}');
-- the first try's whole family in the journal: the parent's call and the parallel search's call share its root key (the page's own figure said 40000)
insert into public.ai_delegation_journal (user_id, root_key, task, outcome, cost_micros, cost_complete, call_id) values
  ('33333333-3333-3333-3333-333333333333', 'a-1', 'atlas_turn', 'ok', 28000, true, 'call-main'),
  ('33333333-3333-3333-3333-333333333333', 'a-1', 'atlas_effort', 'failed', 2000, true, 'call-sizing'),
  ('33333333-3333-3333-3333-333333333333', 'a-1', 'web_search', 'ok', 25000, true, 'call-search'),
  ('33333333-3333-3333-3333-333333333333', 'a-2', 'atlas_verify', 'ok', 90000, true, 'call-verify');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select count(*)::int from public.atlas_turn_metrics), 2, 'an account reads its own two rows and not the administrator''s');
select is(public.atlas_turn_accounting('a-1'), null, 'accounting does not disclose another user''s turn');
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
select is((select array_agg(k order by k) from jsonb_object_keys(public.atlas_metrics_overview()) k), array['calls', 'children', 'cost', 'families', 'from', 'to', 'turns'], 'its parts');
select is((public.atlas_metrics_overview() -> 'turns' ->> 'turns')::int, 2, 'two answers in the window');
select is((public.atlas_metrics_overview() -> 'turns' ->> 'completion_rate')::numeric, 0.5, 'one of two declared itself complete');
select is((public.atlas_metrics_overview() -> 'turns' ->> 'duplicate_op_rate')::numeric, 0.2, '4 repeats in 20 operations');
select is((public.atlas_metrics_overview() -> 'turns' ->> 'capability_found_rate')::numeric, 0.9, '2 unknown tools in 20 operations');
select is((public.atlas_metrics_overview() -> 'turns' ->> 'grounded_claim_rate')::numeric, 1::numeric, 'every finding carried a source');
select is((public.atlas_metrics_overview() -> 'turns' ->> 'program_verified_share')::numeric, 0.25, '1 of 4 checks decided by a program');
select is((public.atlas_metrics_overview() -> 'turns' ->> 'cost_per_success_micros')::numeric, 145000::numeric,
  'cost per success: the first try''s whole family (parent + search = 55000) plus the repeated try (90000), over the one task that succeeded');
select is((public.atlas_metrics_overview() -> 'cost' ->> 'tasks')::int || '/' || (public.atlas_metrics_overview() -> 'cost' ->> 'attempts')::int || '/' || (public.atlas_metrics_overview() -> 'cost' ->> 'successes')::int,
  '1/2/1', 'two attempts, one task, one success');
select is((public.atlas_metrics_overview() -> 'turns' ->> 'no_useful_rate')::numeric, 0.5, 'a turn that showed nothing usable is counted apart, not as a short wait');
select is((public.atlas_metrics_overview() -> 'turns' ->> 'backing_claim_rate')::numeric, 0.5, '2 of the 4 findings are named by the final answer');
select is((public.atlas_metrics_overview() -> 'turns' ->> 'first_useful_ms_p50')::int, 2000, 'a turn with no useful result is not counted as 0 ms');
select is(public.atlas_metrics_overview() -> 'turns' -> 'critical_tools' -> 0 ->> 'tool', 'research.delegate', 'the slowest path first');
select is(public.atlas_metrics_overview(now() - interval '60 days', now() - interval '50 days') -> 'turns' -> 'completion_rate', 'null'::jsonb,
  'a window with no answers has a null ratio, not 0');
select is(public.atlas_turn_accounting('a-1'), '{"cost_micros":55000,"cost_known":true,"root_calls":3}'::jsonb,
  'a billed failure and search are counted once alongside the main call');
reset role;

update public.ai_delegation_journal set call_id = 'call-main' where root_key = 'a-1' and task = 'atlas_effort';
set local role authenticated;
select is(public.atlas_turn_accounting('a-1'), '{"cost_micros":55000,"cost_known":false,"root_calls":3}'::jsonb,
  'another row with the same call ID cannot hide a missing browser-observed effort request');
select is(public.atlas_metrics_overview() -> 'cost' -> 'per_success_micros', 'null'::jsonb, 'unknown coverage leaves only the observed subtotal');
reset role;

insert into public.atlas_turn_metrics (user_id, turn_key, metrics_version, model_calls, provider_call_ids)
values ('33333333-3333-3333-3333-333333333333', 'a-zero', 3, 1, '{call-zero}'),
       ('33333333-3333-3333-3333-333333333333', 'a-unknown', 3, 1, '{call-unknown}');
insert into public.ai_delegation_journal (user_id, root_key, task, outcome, cost_micros, cost_complete, call_id)
values ('33333333-3333-3333-3333-333333333333', 'a-zero', 'atlas_turn', 'refused', 0, true, 'call-zero');
set local role authenticated;
select is(public.atlas_turn_accounting('a-zero'), '{"cost_micros":0,"cost_known":true,"root_calls":1}'::jsonb,
  'an observed zero-cost refusal is a measured zero');
select is(public.atlas_turn_accounting('a-unknown'), '{"cost_micros":null,"cost_known":false,"root_calls":0}'::jsonb,
  'an unanswered transport attempt has no observed price');
reset role;

-- ── ⑤ the data inventory ─────────────────────────────────────────────────────
select is((select written_by from public.account_data_catalog where tbl = 'atlas_turn_metrics'), 'intmap', 'the account''s data inventory states the table');
select ok((select label_jp ~ '[ぁ-ヿ㐀-鿿]' and retention_en ~ '90 days' from public.account_data_catalog where tbl = 'atlas_turn_metrics'), 'in both languages, with the retention');

select * from finish();
rollback;
