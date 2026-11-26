-- ============================================================================
--  (atlas-jobs-reliability) A job past the concurrency fences WAITS; it is no longer refused
-- ----------------------------------------------------------------------------
--  Until now atlas_job_create counted the reader's active jobs (2) and the project's (20) and answered `user_active_limit` / `busy`
--  — a refusal the reader had to retry by hand, for work Atlas had already planned. The fences exist to bound how much runs AT ONCE
--  (the invoice and the platform), not how much may be ASKED. So the fences move from the door to the claim:
--
--    · atlas_job_create always admits the job as `queued` (an idempotent create is still the same job; a stopped system still says `disabled`).
--    · atlas_job_claim hands a QUEUED job to a runner only while the reader has fewer than max_active_per_user RUNNING jobs and the
--      project fewer than max_active_total. A job that is already `running` (a slice released it, or its lease lapsed) is never held
--      back — it already holds its place, and a crashed runner's job must be taken over whatever else is waiting.
--      Oldest first; a job whose reader is at their limit is skipped, not waited behind, so one reader's queue never blocks another's.
--    · admissions are serialised by one advisory lock, so two claims at the same moment cannot both take the last place.
--    · atlas_job_resume puts the unfinished pieces back in the same queue (it used to refuse with the same two words).
--
--  `queued` with started_at null therefore means «waiting for a place» (or for a runner); the per-minute tick, and the function itself when a
--  job ends, claim the next one. What the job's own cost cap (atlas_jobs_control.job_cost_cap_micros) and the daily request ceiling bound is unchanged,
--  and each creation still charges one of the reader's daily AI uses, so the queue is bounded by that allowance.
--  The words `user_active_limit` and `busy` are no longer returned by anything.
-- ============================================================================

--  THE IMAGES A WORKER TASK IS SHOWN. A task's contract names them (`images`: an attachment's name, or @view for the map frames); the page resolves the
--  names to data URLs (a server has neither attachments nor frames) and sends them with the job. They are kept in atlas_job_tasks.images — a column the
--  page's reads do not select, so polling a job never carries them — and go with the task (deleted with the job, 30 days after it ends, and with the account).
--  Shape: [{ "name": text, "urls": [data URL, …] }]. The Edge Function validates them before the job exists (type, size); nothing here trusts them.
alter table public.atlas_job_tasks add column if not exists images jsonb;
comment on column public.atlas_job_tasks.images is
  '(atlas-jobs-reliability) The images this worker task is shown: [{name, urls:[data URL]}], resolved by the page from the names in contract.images. Not selected by the page''s job reads.';

comment on column public.atlas_jobs_control.max_active_per_user is
  '(atlas-jobs-reliability) How many of ONE reader''s jobs RUN at the same time. Jobs past it wait in the queue (status queued); they are not refused.';
comment on column public.atlas_jobs_control.max_active_total is
  '(atlas-jobs-reliability) How many jobs RUN at the same time in the whole project. Jobs past it wait in the queue (status queued); they are not refused.';

create or replace function public.atlas_job_create(p_user uuid, p_idem text, p_title text, p_tasks jsonb)
returns table (job_id uuid, created boolean, status text, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  c        public.atlas_jobs_control;
  v_idem   text := left(coalesce(nullif(btrim(p_idem), ''), ''), 120);
  v_job    public.atlas_jobs;
  t        jsonb;
begin
  select * into c from public.atlas_jobs_control where id;
  if c is null or not c.enabled then return query select null::uuid, false, ''::text, 'disabled'::text; return; end if;
  if v_idem = '' or jsonb_typeof(p_tasks) <> 'array' or jsonb_array_length(p_tasks) not between 1 and 8 then
    return query select null::uuid, false, ''::text, 'bad_request'::text; return;
  end if;

  -- serialise this reader's creates, so the same idempotency key arriving twice at once is one job
  perform pg_advisory_xact_lock(hashtextextended('atlas_job_create:' || p_user::text, 0));

  select * into v_job from public.atlas_jobs j where j.user_id = p_user and j.idem_key = v_idem;
  if found then return query select v_job.id, false, v_job.status, ''::text; return; end if;

  insert into public.atlas_jobs (user_id, idem_key, title, cost_cap_micros, tasks_total)
  values (p_user, v_idem, left(coalesce(p_title, ''), 200), c.job_cost_cap_micros, jsonb_array_length(p_tasks))
  returning * into v_job;
  for t in select * from jsonb_array_elements(p_tasks) loop
    insert into public.atlas_job_tasks (job_id, user_id, task_id, key, contract, deps, images)
    values (v_job.id, p_user, left(t->>'id', 64), coalesce(t->>'key', ''), t->'contract',
            coalesce(array(select jsonb_array_elements_text(coalesce(t->'deps', '[]'::jsonb))), '{}'),
            case when jsonb_typeof(t->'images') = 'array' and jsonb_array_length(t->'images') > 0 then t->'images' else null end);
  end loop;
  insert into public.atlas_job_events (job_id, user_id, kind, data) values (v_job.id, p_user, 'created', jsonb_build_object('tasks', jsonb_array_length(p_tasks), 'capMicros', c.job_cost_cap_micros));
  return query select v_job.id, true, v_job.status, ''::text;
end;
$$;
revoke execute on function public.atlas_job_create(uuid, text, text, jsonb) from public, anon, authenticated;
grant  execute on function public.atlas_job_create(uuid, text, text, jsonb) to service_role;

create or replace function public.atlas_job_claim(p_holder text, p_lease_seconds integer, p_job uuid default null)
returns setof public.atlas_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  c         public.atlas_jobs_control;
  j         public.atlas_jobs;
  v_l       integer := greatest(30, least(coalesce(p_lease_seconds, 150), 900));
  v_running integer;
begin
  select * into c from public.atlas_jobs_control where id;
  if c is null or not c.enabled then
    -- the stop switch: nothing is claimed, and every job that is not finished ends here
    update public.atlas_job_tasks t set status = 'cancelled', ended_at = now()
     where t.status in ('queued', 'running') and t.job_id in (select x.id from public.atlas_jobs x where x.status in ('queued', 'running') and (x.lease_until is null or x.lease_until < now()));
    update public.atlas_jobs x set status = 'cancelled', stop_reason = 'kill_switch', lease_holder = null, lease_until = null, ended_at = now(), updated_at = now()
     where x.status in ('queued', 'running') and (x.lease_until is null or x.lease_until < now());
    return;
  end if;
  -- one admission at a time: two claims at the same moment cannot both take the last place
  perform pg_advisory_xact_lock(hashtextextended('atlas_job_admit', 0));
  select count(*) into v_running from public.atlas_jobs x where x.status = 'running';
  select * into j from public.atlas_jobs x
   where x.status in ('queued', 'running') and (x.lease_until is null or x.lease_until < now())
     and (p_job is null or x.id = p_job)
     and (   x.status = 'running'   -- already holds its place: taken over whatever else waits
          or (v_running < c.max_active_total
              and (select count(*) from public.atlas_jobs r where r.user_id = x.user_id and r.status = 'running') < c.max_active_per_user))
   order by (x.status = 'running') desc, x.created_at
   for update skip locked
   limit 1;
  if not found then return; end if;
  -- a lease that lapsed with a request in flight: what was reserved is counted as spent, the running task is requeued
  update public.atlas_job_tasks t set status = 'queued', started_at = null where t.job_id = j.id and t.status = 'running';
  update public.atlas_jobs x set
      status = 'running', lease_holder = left(p_holder, 80), lease_until = now() + make_interval(secs => v_l),
      spent_micros = x.spent_micros + x.reserved_micros, reserved_micros = 0,
      started_at = coalesce(x.started_at, now()), updated_at = now()
   where x.id = j.id returning * into j;
  insert into public.atlas_job_events (job_id, user_id, kind, data) values (j.id, j.user_id, 'lease', jsonb_build_object('holder', left(p_holder, 80)));
  return next j;
end;
$$;
revoke execute on function public.atlas_job_claim(text, integer, uuid) from public, anon, authenticated;
grant  execute on function public.atlas_job_claim(text, integer, uuid) to service_role;

-- resume: the unfinished pieces go back in the same queue; no refusal for the fences
create or replace function public.atlas_job_resume(p_job uuid, p_only text[] default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare j public.atlas_jobs; c public.atlas_jobs_control; v_has boolean; v_reset integer;
begin
  select * into j from public.atlas_jobs x where x.id = p_job and x.user_id = (select auth.uid()) for update;
  if not found then return 'not_found'; end if;
  if j.status in ('queued', 'running') then return 'running'; end if;
  select * into c from public.atlas_jobs_control limit 1;
  v_has := found;
  if v_has and not c.enabled then return 'disabled'; end if;
  update public.atlas_job_tasks t set status = 'queued', code = '', result = null, progress = null, started_at = null, ended_at = null
   where t.job_id = p_job and t.status in ('failed', 'refused', 'cancelled')
     and (p_only is null or coalesce(array_length(p_only, 1), 0) = 0 or t.task_id = any (p_only));
  get diagnostics v_reset = row_count;
  if v_reset = 0 then return 'nothing_to_resume'; end if;
  update public.atlas_jobs x set status = 'queued', stop_reason = '', cancel_requested = false, error = '', result = null, ended_at = null,
         lease_holder = null, lease_until = null, reserved_micros = 0, updated_at = now(),
         tasks_done = (select count(*) from public.atlas_job_tasks t where t.job_id = p_job and t.status in ('done', 'partial'))
   where x.id = p_job;
  insert into public.atlas_job_events (job_id, user_id, kind, data) values (p_job, j.user_id, 'resume', jsonb_build_object('tasks', v_reset, 'only', coalesce(p_only, '{}')));
  return 'queued';
end;
$$;
revoke execute on function public.atlas_job_resume(uuid, text[]) from public, anon;
grant  execute on function public.atlas_job_resume(uuid, text[]) to authenticated;
comment on function public.atlas_job_resume(uuid, text[]) is
  '(exec-platform, atlas-jobs-reliability) Put the unfinished pieces of one of the reader''s ended jobs (failed, refused, cancelled; optionally only those named) back in the queue. Finished pieces are untouched and never run twice; the cost already spent still counts against the cap. The concurrency fences do not refuse it: the job waits for its place like any other.';

-- the function asks, after a job ends, whether anything waits for the place it left (no job is lost if it does not: the per-minute tick finds it)
create or replace function public.atlas_jobs_waiting()
returns integer
language sql
security definer
set search_path = ''
stable
as $$ select count(*)::integer from public.atlas_jobs x where x.status = 'queued' and (x.lease_until is null or x.lease_until < now()); $$;
revoke execute on function public.atlas_jobs_waiting() from public, anon, authenticated;
grant  execute on function public.atlas_jobs_waiting() to service_role;
