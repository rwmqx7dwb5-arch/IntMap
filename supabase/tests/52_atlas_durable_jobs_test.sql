-- ============================================================================
--  pgTAP · 52 — Atlas durable jobs: a job that outlives the tab, run one lease at a time.
--  supabase/migrations/20261120130000_atlas_durable_jobs.sql
--    ① the tables: columns, RLS on, owner-only read, no client write;
--    ② create: idempotent on (reader, idem), bounded per reader, refused when the stop switch is off;
--    ③ claim / lease: one runner at a time, a lapsed lease is taken over, a stale reservation counts as spent;
--    ④ the cost fence: a reservation past the cap is refused, settle moves it to spent;
--    ⑤ a task finishes once; the second finish changes nothing;
--    ⑥ the reader's controls: cancel (idempotent, owner only), amend (read back by the checkpoint, may drop tasks);
--    ⑦ the stop switch ends a job at its next checkpoint and stops every claim.
--  The page-side model of the runner is tests/atlas-durable-jobs-checks.test.mjs — this file runs the SQL itself.
-- ============================================================================
begin;
select no_plan();

do $$ begin execute format('grant anon, authenticated, service_role to %I', current_user); exception when others then null; end $$;

select has_table('public', 'atlas_jobs', 'atlas_jobs exists');
select has_table('public', 'atlas_job_tasks', 'atlas_job_tasks exists');
select has_table('public', 'atlas_job_events', 'atlas_job_events exists');
select has_table('public', 'atlas_jobs_control', 'atlas_jobs_control exists');
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.atlas_jobs'::regclass, 'public.atlas_job_tasks'::regclass, 'public.atlas_job_events'::regclass, 'public.atlas_jobs_control'::regclass)), 'RLS is on for all four');
select is((select count(*)::int from public.atlas_jobs_control), 1, 'exactly one control row');

-- two readers
insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-job-a@example.test'),
  ('00000000-0000-0000-0000-0000000a0002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-job-b@example.test');

create function pg_temp._tasks(n int) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('id', 't' || g, 'key', 'k' || g, 'contract', jsonb_build_object('goal', 'goal ' || g), 'deps', case when g = 1 then '[]'::jsonb else jsonb_build_array('t' || (g - 1)) end))
    from generate_series(1, n) g
$$;

-- ── ② create ─────────────────────────────────────────────────────────────────
create temp table _j as select * from public.atlas_job_create('00000000-0000-0000-0000-0000000a0001', 'idem-1', 'first', pg_temp._tasks(2));
grant select on _j to public;   -- the reader-role checks below read it after set local role
select is((select created from _j), true, 'a new key creates a job');
select is((select status from _j), 'queued', '… queued');
select is((select count(*)::int from public.atlas_job_tasks where job_id = (select job_id from _j)), 2, '… with its two tasks');
select is((select deps from public.atlas_job_tasks where job_id = (select job_id from _j) and task_id = 't2'), array['t1'], '… and the task it starts from');
select is((select created from public.atlas_job_create('00000000-0000-0000-0000-0000000a0001', 'idem-1', 'first', pg_temp._tasks(2))), false, 'the same key again is the same job, not a second one');
select is((select job_id from public.atlas_job_create('00000000-0000-0000-0000-0000000a0001', 'idem-1', 'first', pg_temp._tasks(2))), (select job_id from _j), '… the very same');
select is((select count(*)::int from public.atlas_jobs where user_id = '00000000-0000-0000-0000-0000000a0001'), 1, '… and only one row exists');
select is((select cost_cap_micros from public.atlas_jobs where id = (select job_id from _j)), 1000000::bigint, 'a job is capped at $1 (the control row)');
select is((select reason from public.atlas_job_create('00000000-0000-0000-0000-0000000a0001', 'bad', 't', '[]'::jsonb)), 'bad_request', 'an empty task list is refused');
select is((select count(*)::int from public.atlas_job_create('00000000-0000-0000-0000-0000000a0001', 'idem-2', 'second', pg_temp._tasks(1)) where created), 1, 'a reader may run a second job');
select is((select reason from public.atlas_job_create('00000000-0000-0000-0000-0000000a0001', 'idem-3', 'third', pg_temp._tasks(1))), 'user_active_limit', 'a third at once is refused (two per reader)');
select is((select created from public.atlas_job_create('00000000-0000-0000-0000-0000000a0002', 'idem-1', 'other reader', pg_temp._tasks(1))), true, 'another reader is not counted against the first, and may reuse the key');

-- ── ① access ─────────────────────────────────────────────────────────────────
create function pg_temp._as(p_role text, p_uid text, p_sql text) returns text language plpgsql as $$
declare r text;
begin
  execute format('set local role %I', p_role);
  perform set_config('request.jwt.claims', case when p_uid is null then '{"role":"anon"}' else '{"sub":"' || p_uid || '","role":"authenticated"}' end, true);
  begin
    execute p_sql;
    r := 'OK';
  exception when insufficient_privilege then r := 'DENIED';
            when others then r := 'ERR:' || sqlstate;
  end;
  reset role;
  return r;
end $$;
select is(pg_temp._as('anon', null, $$ select count(*) from public.atlas_jobs $$), 'DENIED', 'anon reads nothing');
select is(pg_temp._as('authenticated', '00000000-0000-0000-0000-0000000a0001', $$ insert into public.atlas_jobs (user_id, idem_key, cost_cap_micros) values ('00000000-0000-0000-0000-0000000a0001', 'x', 1) $$), 'DENIED', 'a reader cannot insert a job');
select is(pg_temp._as('authenticated', '00000000-0000-0000-0000-0000000a0001', $$ update public.atlas_jobs set cost_cap_micros = 999999999 $$), 'DENIED', 'nor raise its cap');
select is(pg_temp._as('authenticated', '00000000-0000-0000-0000-0000000a0001', $$ select * from public.atlas_job_claim('x', 60) $$), 'DENIED', 'nor claim one');
select is(pg_temp._as('authenticated', '00000000-0000-0000-0000-0000000a0001', $$ select * from public.atlas_job_create('00000000-0000-0000-0000-0000000a0001', 'z', 'z', '[]'::jsonb) $$), 'DENIED', 'nor create one through the function');
select is(pg_temp._as('authenticated', '00000000-0000-0000-0000-0000000a0001', $$ select count(*) from public.atlas_jobs_control $$), 'DENIED', 'nor read the control row');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a0001","role":"authenticated"}', true);
select is((select count(*)::int from public.atlas_jobs), 2, 'a reader sees their own two jobs');
select is((select count(*)::int from public.atlas_job_tasks), 3, '… and their tasks');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a0002","role":"authenticated"}', true);
select is((select count(*)::int from public.atlas_jobs), 1, 'another reader sees only theirs');
reset role;

-- ── ③ claim / lease ──────────────────────────────────────────────────────────
create temp table _c as select * from public.atlas_job_claim('runner-1', 60, (select job_id from _j));
select is((select count(*)::int from _c), 1, 'a runner claims the job');
select is((select status from public.atlas_jobs where id = (select job_id from _j)), 'running', '… which is running');
select is((select count(*)::int from public.atlas_job_claim('runner-2', 60, (select job_id from _j))), 0, 'a second runner gets nothing while the lease is live');
select is((select ok from public.atlas_job_checkpoint((select job_id from _j), 'runner-2', 60)), false, 'a runner that does not hold the lease is told it lost it');
select is((select action from public.atlas_job_checkpoint((select job_id from _j), 'runner-1', 60)), 'go', 'the holder is told to go');

-- ── ④ the cost fence ─────────────────────────────────────────────────────────
select is(public.atlas_job_reserve((select job_id from _j), 'runner-1', 600000), true, 'a reservation inside the cap is taken');
select is(public.atlas_job_reserve((select job_id from _j), 'runner-1', 500000), false, 'one that would pass the cap is refused');
select is(public.atlas_job_reserve((select job_id from _j), 'runner-2', 1), false, 'a runner without the lease reserves nothing');
select is(public.atlas_job_settle((select job_id from _j), 'runner-1', 600000, 250000), true, 'settle replaces the reservation with what was billed');
select is((select spent_micros from public.atlas_jobs where id = (select job_id from _j)), 250000::bigint, '… spent is what was billed');
select is((select reserved_micros from public.atlas_jobs where id = (select job_id from _j)), 0::bigint, '… and nothing stays reserved');
select is(public.atlas_job_reserve((select job_id from _j), 'runner-1', 300000), true, 'a reservation the dead runner never settles…');
-- the runner dies: its lease lapses
update public.atlas_jobs set lease_until = now() - interval '1 second' where id = (select job_id from _j);
select is((select count(*)::int from public.atlas_job_claim('runner-2', 60, (select job_id from _j))), 1, 'a lapsed lease is taken over');
select is((select spent_micros from public.atlas_jobs where id = (select job_id from _j)), 550000::bigint, '… and what the dead runner had reserved is counted as spent');
select is((select reserved_micros from public.atlas_jobs where id = (select job_id from _j)), 0::bigint, '… not reserved');

-- ── ⑤ a task finishes once ───────────────────────────────────────────────────
select is(public.atlas_job_task_start((select job_id from _j), 'runner-2', 't1'), true, 'a queued task starts');
select is(public.atlas_job_task_start((select job_id from _j), 'runner-2', 't1'), false, '… and does not start twice');
select is(public.atlas_job_task_finish((select job_id from _j), 'runner-1', 't1', 'done', '', '{"summary":"x"}', 1, 1), false, 'the old runner cannot finish it');
select is(public.atlas_job_task_finish((select job_id from _j), 'runner-2', 't1', 'done', '', '{"summary":"x"}', 100, 1), true, 'the holder finishes it');
select is(public.atlas_job_task_finish((select job_id from _j), 'runner-2', 't1', 'failed', 'again', '{"summary":"y"}', 100, 1), false, 'a second finish changes nothing');
select is((select status from public.atlas_job_tasks where job_id = (select job_id from _j) and task_id = 't1'), 'done', '… it stays done');
select is((select tasks_done from public.atlas_jobs where id = (select job_id from _j)), 1, 'the job counts it');

-- ── ⑥ the reader's controls ──────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a0001","role":"authenticated"}', true);
select is(public.atlas_job_amend((select job_id from _j), 'use only 2020 data', array['t2']), 1, 'the reader amends a running job');
reset role;
select is((select status from public.atlas_job_tasks where job_id = (select job_id from _j) and task_id = 't2'), 'cancelled', '… and a dropped task is cancelled');
select is((select amends->>0 from public.atlas_job_checkpoint((select job_id from _j), 'runner-2', 60)), 'use only 2020 data', 'the runner reads the amendment at its next checkpoint');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a0002","role":"authenticated"}', true);
select is(public.atlas_job_cancel((select job_id from _j)), 'not_found', 'another reader cannot cancel it');
select is(public.atlas_job_amend((select job_id from _j), 'hijack', '{}'), -1, 'nor amend it');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a0001","role":"authenticated"}', true);
select is(public.atlas_job_cancel((select job_id from _j)), 'cancelling', 'the owner cancels a running job: it stops at its next checkpoint');
select is(public.atlas_job_cancel((select job_id from _j)), 'cancelling', '… a second cancel changes nothing');
reset role;
select is((select action from public.atlas_job_checkpoint((select job_id from _j), 'runner-2', 60)), 'cancel', 'the holder is told to stop');
select is(public.atlas_job_finish((select job_id from _j), 'runner-2', 'cancelled', 'user', null, ''), true, 'it ends cancelled');
select is(public.atlas_job_finish((select job_id from _j), 'runner-2', 'done', '', null, ''), false, 'an ended job is not ended again');
select is((select count(*)::int from public.atlas_job_tasks where job_id = (select job_id from _j) and status in ('queued', 'running')), 0, 'no task is left open');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a0001","role":"authenticated"}', true);
select is(public.atlas_job_cancel((select job_id from _j)), 'cancelled', 'cancelling an ended job reports it and changes nothing');
reset role;

-- a queued job nobody has claimed is cancelled at once
create temp table _q as select * from public.atlas_job_create('00000000-0000-0000-0000-0000000a0001', 'idem-q', 'q', pg_temp._tasks(1));
grant select on _q to public;   -- read below after set local role authenticated
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a0001","role":"authenticated"}', true);
select is(public.atlas_job_cancel((select job_id from _q)), 'cancelled', 'a job nobody has claimed is cancelled at once');
reset role;

-- ── ⑦ the stop switch ───────────────────────────────────────────────────────
create temp table _k as select * from public.atlas_job_create('00000000-0000-0000-0000-0000000a0002', 'idem-k', 'k', pg_temp._tasks(1));
create temp table _kc as select * from public.atlas_job_claim('runner-3', 60, (select job_id from _k));
update public.atlas_jobs_control set enabled = false;
select is((select action from public.atlas_job_checkpoint((select job_id from _k), 'runner-3', 60)), 'kill_switch', 'a running job is told to stop');
select is((select reason from public.atlas_job_create('00000000-0000-0000-0000-0000000a0002', 'idem-off', 'x', pg_temp._tasks(1))), 'disabled', 'nothing new is created');
select is((select count(*)::int from public.atlas_job_claim('runner-4', 60)), 0, 'nothing is claimed');
update public.atlas_jobs_control set enabled = true;

select * from finish();
rollback;
