-- ============================================================================
--  (exec-platform) Resume a job: run again only what did not finish
-- ----------------------------------------------------------------------------
--  A job ends `cancelled` (the reader stopped it, the stop switch, the cost cap) or carries pieces that `failed` / were `refused`.
--  Until now the only way on was to start the whole job again and pay for the pieces that had already succeeded. `atlas_job_resume`
--  puts the pieces that did NOT finish back in the queue — failed, refused, cancelled; optionally only the ones named — and
--  leaves every `done` / `partial` piece exactly as it is, so it is never run or paid for twice. The job goes back to `queued`
--  and the per-minute tick (or the next claim) picks it up; the reader's `atlas_job_amend` instructions still apply, and what
--  was already spent still counts against the job's cost cap (a resume is not a fresh budget).
--  Returns: 'queued' | 'not_found' | 'running' (nothing to resume: it is still going) | 'nothing_to_resume' |
--           'user_active_limit' | 'busy' | 'disabled'.
--  Pausing is `atlas_job_cancel`; resuming is this. There is no `paused` status: the work is the pieces, and a piece is either
--  done or queued.
-- ============================================================================
create or replace function public.atlas_job_resume(p_job uuid, p_only text[] default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare j public.atlas_jobs; c public.atlas_jobs_control; v_has boolean; v_n integer; v_reset integer;
begin
  select * into j from public.atlas_jobs x where x.id = p_job and x.user_id = (select auth.uid()) for update;
  if not found then return 'not_found'; end if;
  if j.status in ('queued', 'running') then return 'running'; end if;
  select * into c from public.atlas_jobs_control limit 1;
  v_has := found;
  if v_has and not c.enabled then return 'disabled'; end if;
  perform pg_advisory_xact_lock(hashtextextended('atlas_job_create:' || j.user_id::text, 0));
  if v_has then
    select count(*) into v_n from public.atlas_jobs x where x.user_id = j.user_id and x.status in ('queued', 'running');
    if v_n >= c.max_active_per_user then return 'user_active_limit'; end if;
    select count(*) into v_n from public.atlas_jobs x where x.status in ('queued', 'running');
    if v_n >= c.max_active_total then return 'busy'; end if;
  end if;
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
  '(exec-platform) Put the unfinished pieces of one of the reader''s ended jobs (failed, refused, cancelled; optionally only those named) back in the queue. Finished pieces are untouched and never run twice; the cost already spent still counts against the cap.';
