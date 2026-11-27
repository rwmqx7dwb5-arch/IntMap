-- ============================================================================
--  pgTAP · 56 — (gis-result-handoff) what one task hands the next, a job that did not finish every piece, a change of request.
--  supabase/migrations/20261203100000_atlas_job_handoff.sql
--    ① a job may end `partial` (some pieces finished, some did not), and every ended-state function knows it;
--    ② an output too large for its row is written beside it only by the runner that holds the lease, for a task that is running,
--       and its owner reads it (no one else);
--    ③ revise: the named pieces get their new contract (writtenAt = the new version) and run again, what was built on them runs
--       again, the kept pieces hold under the new version, the version is what the checkpoint reads; refusals are by code.
--  The runner itself is tests/gis-result-handoff-checks.test.mjs.
-- ============================================================================
begin;
select no_plan();

do $$ begin execute format('grant anon, authenticated, service_role to %I', current_user); exception when others then null; end $$;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000b0001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-handoff-a@example.test'),
  ('00000000-0000-0000-0000-0000000b0002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-handoff-b@example.test');

-- A (fetch) → B (select a city from A) → C (summarise B)
create temp table _h as select * from public.atlas_job_create('00000000-0000-0000-0000-0000000b0001', 'handoff-1', 'handoff', jsonb_build_array(
  jsonb_build_object('id', 'A', 'key', 'kA', 'contract', jsonb_build_object('kind', 'capability', 'capability', 'data.gis', 'args', jsonb_build_object('op', 'fetch')), 'deps', '[]'::jsonb),
  jsonb_build_object('id', 'B', 'key', 'kB', 'contract', jsonb_build_object('kind', 'capability', 'capability', 'data.gis', 'args', jsonb_build_object('city', 'Nagoya')), 'deps', jsonb_build_array('A')),
  jsonb_build_object('id', 'C', 'key', 'kC', 'contract', jsonb_build_object('goal', 'summarise'), 'deps', jsonb_build_array('B'))));
grant select on _h to public;
select is((select count(*)::int from public.atlas_job_claim('h-runner', 60, (select job_id from _h))), 1, 'the runner takes the job');

-- ② an output beside its row
select is(public.atlas_job_artifact_put((select job_id from _h), 'h-runner', 'A', 0, '{"type":"FeatureCollection","features":[]}'), false, 'a task that is not running takes no output');
select is(public.atlas_job_task_start((select job_id from _h), 'h-runner', 'A'), true, 'A starts');
select is(public.atlas_job_artifact_put((select job_id from _h), 'other-runner', 'A', 0, '{"type":"FeatureCollection","features":[]}'), false, 'a runner without the lease writes nothing');
select is(public.atlas_job_artifact_put((select job_id from _h), 'h-runner', 'A', 0, '{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"n":0},"geometry":null}]}'), true, 'the holder writes part 0');
select is(public.atlas_job_artifact_put((select job_id from _h), 'h-runner', 'A', 1, '{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"n":1},"geometry":null}]}'), true, '… and part 1');
select is(public.atlas_job_artifact_put((select job_id from _h), 'h-runner', 'A', -1, '{}'), false, 'a negative part is refused');
select is(public.atlas_job_task_finish((select job_id from _h), 'h-runner', 'A', 'done', '', '{"summary":"fetched","data":{"output":{"stored":"artifact","parts":2,"count":2}}}', 0, 0), true, 'A ends done');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000b0001","role":"authenticated"}', true);
select is((select count(*)::int from public.atlas_job_artifacts where job_id = (select job_id from _h)), 2, 'the owner reads both parts');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000b0002","role":"authenticated"}', true);
select is((select count(*)::int from public.atlas_job_artifacts where job_id = (select job_id from _h)), 0, 'another reader reads none');
select throws_ok($$ insert into public.atlas_job_artifacts (job_id, user_id, task_id, part, body) select job_id, '00000000-0000-0000-0000-0000000b0002', 'A', 9, '{}' from _h $$, '42501', null, 'a reader cannot write an output');
reset role;
select is(has_function_privilege('authenticated', 'public.atlas_job_artifact_put(uuid, text, text, integer, jsonb)', 'execute'), false, 'only the runner writes outputs');
select is(has_function_privilege('authenticated', 'public.atlas_job_revise(uuid, uuid, text, jsonb, text[])', 'execute'), false, 'revise is called by the Edge Function, not by the reader directly');

-- ① B fails, C is blocked: the job ends partial
select is(public.atlas_job_task_start((select job_id from _h), 'h-runner', 'B'), true, 'B starts');
select is(public.atlas_job_task_finish((select job_id from _h), 'h-runner', 'B', 'failed', 'wrong_input_count', '{"summary":""}', 0, 0), true, 'B fails');
select is(public.atlas_job_task_block((select job_id from _h), 'h-runner', 'C', 'input_unavailable'), true, 'C is blocked');
select is(public.atlas_job_finish((select job_id from _h), 'h-runner', 'partial', 'some_tasks_failed', '{"summary":"A only"}', ''), true, 'the job may end partial');
select is((select status from public.atlas_jobs where id = (select job_id from _h)), 'partial', '… and is partial, not done');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000b0001","role":"authenticated"}', true);
select is(public.atlas_job_cancel((select job_id from _h)), 'partial', 'cancel of an ended partial job changes nothing');
reset role;

-- ③ revise: «Osaka» — B gets a new contract, C (built on B) runs again, A is kept
select is(public.atlas_job_revise('00000000-0000-0000-0000-0000000b0002', (select job_id from _h), 'Osaka', '[]'::jsonb, array['A']), -1, 'another reader cannot revise it');
select is(public.atlas_job_revise('00000000-0000-0000-0000-0000000b0001', (select job_id from _h), 'Osaka', '[]'::jsonb, array['B']), -4, 'a piece that did not finish cannot be kept');
select is(public.atlas_job_revise('00000000-0000-0000-0000-0000000b0001', (select job_id from _h), 'Osaka',
  jsonb_build_array(jsonb_build_object('id', 'B', 'key', 'kB2', 'contract', jsonb_build_object('kind', 'capability', 'capability', 'data.gis', 'args', jsonb_build_object('city', 'Osaka')), 'deps', jsonb_build_array('A'))),
  array['A']), 1, 'the owner revises B and keeps A: version 1');
select is((select contract->'args'->>'city' from public.atlas_job_tasks where job_id = (select job_id from _h) and task_id = 'B'), 'Osaka', 'B has its new contract');
select is((select (contract->>'writtenAt')::int from public.atlas_job_tasks where job_id = (select job_id from _h) and task_id = 'B'), 1, '… written under version 1');
select is((select status from public.atlas_job_tasks where job_id = (select job_id from _h) and task_id = 'B'), 'queued', '… and runs again');
select is((select status from public.atlas_job_tasks where job_id = (select job_id from _h) and task_id = 'C'), 'queued', 'C, built on B, runs again');
select is((select status from public.atlas_job_tasks where job_id = (select job_id from _h) and task_id = 'A'), 'done', 'A is not run again');
select is((select (result->>'conditionsVersion')::int from public.atlas_job_tasks where job_id = (select job_id from _h) and task_id = 'A'), 1, '… and holds under version 1');
select is((select count(*)::int from public.atlas_job_artifacts where job_id = (select job_id from _h) and task_id = 'A'), 2, '… with the output of A still beside it');
select is((select status from public.atlas_jobs where id = (select job_id from _h)), 'queued', 'the ended job is queued again');
select is((select count(*)::int from public.atlas_job_claim('h-runner-2', 60, (select job_id from _h))), 1, 'it is claimed again');
select is((select jsonb_array_length(amends) from public.atlas_job_checkpoint((select job_id from _h), 'h-runner-2', 60)), 1, 'the checkpoint reads the change as version 1');

select * from finish();
rollback;
