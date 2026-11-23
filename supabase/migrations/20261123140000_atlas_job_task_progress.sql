-- ============================================================================
--  (atlas-server-capabilities) A task that works over several model requests keeps what it has learned, and can pause
--  between server slices.
-- ----------------------------------------------------------------------------
--  A worker that may call capabilities itself (contract.tools) is a loop: ask the model, run what it asked for, ask again.
--  One Edge request is a bounded slice (supabase/functions/atlas-jobs SLICE_MS), and a slice that ends mid-loop used to mean
--  losing the loop (a lapsed lease requeues a running task from nothing, and everything it had paid for was spent twice).
--  `progress` is the loop's own state — the calls made so far with their answers, the cost, the notes — written by the runner
--  that holds the lease after every round; `p_yield` hands the task back to `queued` WITH it, so the next slice (or the next
--  holder after a crash) resumes at the next round instead of the first. Never read by the page: the reader sees the task's
--  `result` when it ends, as before.
-- ============================================================================

alter table public.atlas_job_tasks add column if not exists progress jsonb;
comment on column public.atlas_job_tasks.progress is
  '(atlas-server-capabilities) The state of a tool-using worker between rounds (calls so far and their answers, cost, notes). Written by the lease holder; kept after the task ends until the job is purged.';

create or replace function public.atlas_job_task_progress(p_job uuid, p_holder text, p_task text, p_progress jsonb, p_yield boolean default false)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.atlas_job_tasks t
     set progress = p_progress,
         status = case when p_yield then 'queued' else t.status end,
         started_at = case when p_yield then null else t.started_at end
   where t.job_id = p_job and t.task_id = p_task and t.status = 'running'
     and exists (select 1 from public.atlas_jobs x where x.id = p_job and x.lease_holder = left(p_holder, 80) and x.status = 'running');
  return found;
end;
$$;
revoke execute on function public.atlas_job_task_progress(uuid, text, text, jsonb, boolean) from public, anon, authenticated;
grant  execute on function public.atlas_job_task_progress(uuid, text, text, jsonb, boolean) to service_role;
