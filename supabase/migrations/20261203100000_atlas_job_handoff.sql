-- ============================================================================
--  IntMap · (gis-result-handoff) what one task of a durable job hands the next, kept whole; a job that did not finish
--  every piece says so; a change of request can revise the pieces it affects and keep the ones it does not.
-- ----------------------------------------------------------------------------
--  Measured 2026-11-27 (an outside audit, main@638897c): 500 points fetched by task A, filtered by task B. A ended done; B failed
--  (it ran with the arguments it was planned with, not with A's output); the job ended `done`; the page filed no dataset.
--  The runner (supabase/functions/_shared/atlas-job-runner.js) now resolves "@A:data.result" into A's whole output. This file
--  gives that output and the job's state a place:
--
--    · atlas_jobs.status gains 'partial' — some pieces finished and some did not (failed, refused, blocked). It was `done`.
--      Every function that names the ended states learns it: finish, cancel, purge.
--    · atlas_job_artifacts — an output too large for its task's row (INLINE_OUTPUT_BYTES in the runner), kept BESIDE it in
--      ordered parts. The row keeps the reference (parts, count, columns, sources, version). Owner reads (RLS); only the runner
--      writes, through atlas_job_artifact_put, which checks the lease and that the task is running. Deleted with its job
--      (on delete cascade), so it is kept exactly as long as the job is (purge_atlas_jobs, 30 days).
--    · atlas_job_revise — the reader changed the request («Nagoya» → «Osaka»). The planner (Atlas, through jobs.amend) names
--      the pieces whose CONDITIONS change and gives their new contracts, and the pieces that still hold as they are (the
--      national data). The named pieces are queued again with their new contracts (contract.writtenAt = the new version), every
--      piece downstream of them is queued again, the kept ones are marked as holding under the new version, and nothing else is
--      touched. Which pieces still hold is the planner's judgement; this only does what it was told and refuses what it cannot
--      do by name. Called by the atlas-jobs Edge Function after it has planned the merged list (planJob: ids, inputs, cycles).
-- ============================================================================

-- ── the job's ended states: + partial ─────────────────────────────────────────
alter table public.atlas_jobs drop constraint if exists atlas_jobs_status_check;
alter table public.atlas_jobs add constraint atlas_jobs_status_check check (status in ('queued', 'running', 'done', 'partial', 'failed', 'cancelled'));

create or replace function public.atlas_job_finish(p_job uuid, p_holder text, p_status text, p_stop_reason text, p_result jsonb, p_error text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare j public.atlas_jobs;
begin
  if p_status not in ('done', 'partial', 'failed', 'cancelled') then return false; end if;
  update public.atlas_jobs x set status = p_status, stop_reason = left(coalesce(p_stop_reason, ''), 40), result = p_result, error = left(coalesce(p_error, ''), 400),
         lease_holder = null, lease_until = null, ended_at = now(), updated_at = now()
   where x.id = p_job and x.status = 'running' and x.lease_holder = left(p_holder, 80)
   returning * into j;
  if not found then return false; end if;
  if p_status = 'cancelled' then
    update public.atlas_job_tasks t set status = 'cancelled', ended_at = now() where t.job_id = p_job and t.status in ('queued', 'running');
  end if;
  insert into public.atlas_job_events (job_id, user_id, kind, data) values (p_job, j.user_id, 'ended', jsonb_build_object('status', p_status, 'reason', coalesce(p_stop_reason, ''), 'spentMicros', j.spent_micros));
  return true;
end;
$$;
revoke execute on function public.atlas_job_finish(uuid, text, text, text, jsonb, text) from public, anon, authenticated;
grant  execute on function public.atlas_job_finish(uuid, text, text, text, jsonb, text) to service_role;

create or replace function public.atlas_job_cancel(p_job uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare j public.atlas_jobs;
begin
  select * into j from public.atlas_jobs x where x.id = p_job and x.user_id = (select auth.uid()) for update;
  if not found then return 'not_found'; end if;
  if j.status in ('done', 'partial', 'failed', 'cancelled') then return j.status; end if;   -- idempotent: a second cancel changes nothing
  if j.status = 'queued' or j.lease_until is null or j.lease_until < now() then
    update public.atlas_job_tasks t set status = 'cancelled', ended_at = now() where t.job_id = p_job and t.status in ('queued', 'running');
    update public.atlas_jobs x set status = 'cancelled', stop_reason = 'user', cancel_requested = true, lease_holder = null, lease_until = null, ended_at = now(), updated_at = now() where x.id = p_job;
    insert into public.atlas_job_events (job_id, user_id, kind, data) values (p_job, j.user_id, 'ended', jsonb_build_object('status', 'cancelled', 'reason', 'user'));
    return 'cancelled';
  end if;
  update public.atlas_jobs x set cancel_requested = true, updated_at = now() where x.id = p_job;   -- the runner stops at its next checkpoint
  insert into public.atlas_job_events (job_id, user_id, kind, data) values (p_job, j.user_id, 'cancel', '{}'::jsonb);
  return 'cancelling';
end;
$$;
revoke execute on function public.atlas_job_cancel(uuid) from public, anon;
grant  execute on function public.atlas_job_cancel(uuid) to authenticated;

create or replace function public.purge_atlas_jobs(p_days integer default 30)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  delete from public.atlas_jobs x where x.status in ('done', 'partial', 'failed', 'cancelled') and x.ended_at < now() - make_interval(days => greatest(1, coalesce(p_days, 30)));
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.purge_atlas_jobs(integer) from public, anon, authenticated;
grant  execute on function public.purge_atlas_jobs(integer) to service_role;

-- ── an output kept beside its row ────────────────────────────────────────────
create table if not exists public.atlas_job_artifacts (
  job_id     uuid        not null references public.atlas_jobs(id) on delete cascade,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  task_id    text        not null check (char_length(task_id) between 1 and 64),
  part       integer     not null check (part >= 0),
  body       jsonb       not null,
  created_at timestamptz not null default now(),
  primary key (job_id, task_id, part)
);
comment on table public.atlas_job_artifacts is
  '(gis-result-handoff) An output of a job''s task too large for the task''s row, kept whole in ordered parts (each a FeatureCollection). The task''s result.data.output names how many parts there are, the count, the columns, the sources and the version of the bytes. Owner reads; only the runner writes (atlas_job_artifact_put). Deleted with the job.';
alter table public.atlas_job_artifacts enable row level security;
revoke all on public.atlas_job_artifacts from public, anon, authenticated;
grant select on public.atlas_job_artifacts to authenticated;
grant all on public.atlas_job_artifacts to service_role;
drop policy if exists atlas_job_artifacts_owner_select on public.atlas_job_artifacts;
create policy atlas_job_artifacts_owner_select on public.atlas_job_artifacts for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.atlas_job_artifact_put(p_job uuid, p_holder text, p_task text, p_part integer, p_body jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare j public.atlas_jobs;
begin
  select * into j from public.atlas_jobs x where x.id = p_job and x.status = 'running' and x.lease_holder = left(p_holder, 80);
  if not found then return false; end if;
  if not exists (select 1 from public.atlas_job_tasks t where t.job_id = p_job and t.task_id = p_task and t.status = 'running') then return false; end if;
  if p_part is null or p_part < 0 or jsonb_typeof(p_body) <> 'object' then return false; end if;
  insert into public.atlas_job_artifacts (job_id, user_id, task_id, part, body) values (p_job, j.user_id, p_task, p_part, p_body)
  on conflict (job_id, task_id, part) do update set body = excluded.body, created_at = now();
  return true;
end;
$$;
revoke execute on function public.atlas_job_artifact_put(uuid, text, text, integer, jsonb) from public, anon, authenticated;
grant  execute on function public.atlas_job_artifact_put(uuid, text, text, integer, jsonb) to service_role;

-- ── revise: redo what a change of request affects, keep what it does not ─────
-- p_tasks: [{ "id", "key", "contract", "deps" }] — the revised (or added) pieces, already planned with the rest of the job by planJob.
-- p_keep:  the ids of finished pieces that hold under the new request as they are.
-- → the new request version (>= 1), or: -1 not this reader's / nothing given / stopped; -2 too many changes; -3 a named piece is running;
--   -4 a kept piece is not finished; -5 the stop switch is on.
create or replace function public.atlas_job_revise(p_user uuid, p_job uuid, p_note text, p_tasks jsonb, p_keep text[] default '{}')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  j      public.atlas_jobs;
  c      public.atlas_jobs_control;
  v_note text := left(btrim(coalesce(p_note, '')), 1000);
  v_ver  integer;
  t      jsonb;
  v_ids  text[];
begin
  select * into j from public.atlas_jobs x where x.id = p_job and x.user_id = p_user for update;
  if not found or v_note = '' or jsonb_typeof(coalesce(p_tasks, '[]'::jsonb)) <> 'array' then return -1; end if;
  if jsonb_array_length(coalesce(p_tasks, '[]'::jsonb)) = 0 and coalesce(array_length(p_keep, 1), 0) = 0 then return -1; end if;
  if j.cancel_requested and j.status in ('queued', 'running') then return -1; end if;
  if j.amend_count >= 20 then return -2; end if;   -- the same bound as atlas_job_amend
  select * into c from public.atlas_jobs_control limit 1;
  if found and not c.enabled then return -5; end if;
  v_ids := array(select e->>'id' from jsonb_array_elements(coalesce(p_tasks, '[]'::jsonb)) e);
  if exists (select 1 from public.atlas_job_tasks x where x.job_id = p_job and x.task_id = any (v_ids) and x.status = 'running') then return -3; end if;
  if exists (select 1 from unnest(coalesce(p_keep, '{}')) k
              where not exists (select 1 from public.atlas_job_tasks x where x.job_id = p_job and x.task_id = k and x.status in ('done', 'partial'))) then return -4; end if;

  -- the version is the number of the reader's changes the runner reads (atlas_job_checkpoint: the 'amend' events with a note)
  insert into public.atlas_job_events (job_id, user_id, kind, data) values (p_job, j.user_id, 'amend', jsonb_build_object('note', v_note, 'revise', to_jsonb(v_ids), 'keep', to_jsonb(coalesce(p_keep, '{}'))));
  select count(*)::int into v_ver from public.atlas_job_events e where e.job_id = p_job and e.kind = 'amend';

  for t in select * from jsonb_array_elements(coalesce(p_tasks, '[]'::jsonb)) loop
    insert into public.atlas_job_tasks (job_id, user_id, task_id, key, contract, deps)
    values (p_job, j.user_id, left(t->>'id', 64), coalesce(t->>'key', ''), (t->'contract') || jsonb_build_object('writtenAt', v_ver),
            coalesce(array(select jsonb_array_elements_text(coalesce(t->'deps', '[]'::jsonb))), '{}'))
    on conflict (job_id, task_id) do update
      set key = excluded.key, contract = excluded.contract, deps = excluded.deps,
          status = 'queued', code = '', result = null, progress = null, started_at = null, ended_at = null;
    delete from public.atlas_job_artifacts a where a.job_id = p_job and a.task_id = left(t->>'id', 64);
  end loop;

  -- what was built on a revised piece is built again (it read the old output)
  with recursive down(task_id) as (
      select x.task_id from public.atlas_job_tasks x where x.job_id = p_job and x.deps && v_ids
    union
      select x.task_id from public.atlas_job_tasks x join down d on d.task_id = any (x.deps) where x.job_id = p_job)
  update public.atlas_job_tasks x set status = 'queued', code = '', result = null, progress = null, started_at = null, ended_at = null
   where x.job_id = p_job and x.task_id in (select task_id from down) and not (x.task_id = any (v_ids)) and x.status <> 'running';
  delete from public.atlas_job_artifacts a where a.job_id = p_job
     and a.task_id in (select x.task_id from public.atlas_job_tasks x where x.job_id = p_job and x.status = 'queued');

  -- the pieces the planner says still hold: their result now holds under this version
  update public.atlas_job_tasks x set result = coalesce(x.result, '{}'::jsonb) || jsonb_build_object('conditionsVersion', v_ver, 'keptAt', v_ver)
   where x.job_id = p_job and x.task_id = any (coalesce(p_keep, '{}')) and x.status in ('done', 'partial');

  update public.atlas_jobs x set amend_count = x.amend_count + 1, updated_at = now(),
         tasks_total = (select count(*) from public.atlas_job_tasks t where t.job_id = p_job),
         tasks_done = (select count(*) from public.atlas_job_tasks t where t.job_id = p_job and t.status in ('done', 'partial'))
   where x.id = p_job;
  -- an ended job runs again (like atlas_job_resume: it waits for its place in the same queue); a running one picks the pieces up at its next read
  if j.status in ('done', 'partial', 'failed', 'cancelled') then
    update public.atlas_jobs x set status = 'queued', stop_reason = '', cancel_requested = false, error = '', result = null, ended_at = null,
           lease_holder = null, lease_until = null, reserved_micros = 0, updated_at = now()
     where x.id = p_job;
  end if;
  return v_ver;
end;
$$;
revoke execute on function public.atlas_job_revise(uuid, uuid, text, jsonb, text[]) from public, anon, authenticated;
grant  execute on function public.atlas_job_revise(uuid, uuid, text, jsonb, text[]) to service_role;
comment on function public.atlas_job_revise(uuid, uuid, text, jsonb, text[]) is
  '(gis-result-handoff) A change of request that names which pieces to redo (with their new contracts) and which still hold. Redone pieces and everything downstream are queued again; kept pieces are marked as holding under the new version; nothing else is touched. Called by the atlas-jobs Edge Function after planJob has checked the merged list.';
