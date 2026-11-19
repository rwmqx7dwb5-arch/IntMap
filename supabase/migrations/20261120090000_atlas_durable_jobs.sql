-- ============================================================================
--  IntMap · Atlas durable jobs — long work that outlives the tab
--  (docs/architecture/05-ai.md «永続ジョブ» · dev-notes/2026-11-20-atlas-durable-jobs.md)
-- ----------------------------------------------------------------------------
--  WHY TABLES. research.delegate (js/atlas-delegate.js) is run by the PAGE: its state is an event log in memory
--  plus a resume snapshot in IndexedDB, so closing the tab ends the work. These tables hold the same contracts
--  (a list of tasks, each with the tasks it starts from) on the server, where the Edge Function atlas-jobs runs
--  them one lease at a time and where the reader can read, amend and stop them while it runs.
--
--    atlas_jobs        one row per job: status (queued | running | done | failed | cancelled), the cost cap and what
--                      has been spent, the lease that says WHO is running it now, a cancel request, the result.
--    atlas_job_tasks   one row per task: its contract, the tasks it starts from (deps), its state and result.
--    atlas_job_events  append-only: what happened and what the reader changed (kind 'amend' carries the reader's
--                      new instruction; the runner reads them before every model call).
--    atlas_jobs_control  ONE row: the stop switch (enabled) and the fences (concurrent jobs, the cost cap of one job).
--
--  NO DOUBLE RUN. A job is run by whoever holds its LEASE (lease_holder, lease_until). atlas_job_claim hands a job to
--  one runner at a time (FOR UPDATE SKIP LOCKED); a lease that is not renewed lapses and the next claim takes the job
--  over. A task finishes at most once (atlas_job_task_finish moves running → ended and returns false the second time),
--  and a task that was running when its runner died is requeued — its cost was reserved before the request, and a
--  reservation the dead runner never settled is counted as spent: the ledger errs toward counting too much.
--  CREATING is idempotent: (user_id, idem_key) is unique; the same key again returns the same job.
--
--  ACCESS. The owner READS their rows (RLS) and may only cancel/amend through atlas_job_cancel / atlas_job_amend
--  (SECURITY DEFINER, auth.uid() = owner). Everything else is service_role's: the runner is an Edge Function.
--
--  RETENTION: finished jobs older than 30 days are deleted daily (pg_cron, as ai_delegation_journal).
--    · Observation — a job's result is read by the reader within the day it ends; the journal that compares
--      delegation runs is kept 30 days (20261119120000_delegation_journal.sql) and this follows it.
--    · Expires — when the journal's window moves; change both together.
-- ============================================================================

create table if not exists public.atlas_jobs_control (
  id                    boolean primary key default true check (id),
  enabled               boolean not null default true,
  max_active_per_user   integer not null default 2 check (max_active_per_user >= 0),
  max_active_total      integer not null default 20 check (max_active_total >= 0),
  job_cost_cap_micros   bigint  not null default 1000000 check (job_cost_cap_micros >= 0),
  updated_at            timestamptz not null default now()
);
comment on table public.atlas_jobs_control is
  '(atlas-durable-jobs) ONE row. enabled=false is the stop switch: no job is created, none is claimed, and a job that is running ends cancelled (stop_reason kill_switch) at its next checkpoint. The numbers are the user''s 2026-11-20 decision (one job at most $1, two running at a time per reader); the project-wide daily request ceiling is the Edge Function''s spendCeiling. Changed by an administrator with the service role, never by a reader.';
insert into public.atlas_jobs_control (id) values (true) on conflict (id) do nothing;
alter table public.atlas_jobs_control enable row level security;
revoke all on public.atlas_jobs_control from public, anon, authenticated;
grant all on public.atlas_jobs_control to service_role;

create table if not exists public.atlas_jobs (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references auth.users(id) on delete cascade,
  idem_key         text        not null check (char_length(idem_key) between 1 and 120),
  title            text        not null default '' check (char_length(title) <= 200),
  status           text        not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'cancelled')),
  stop_reason      text        not null default '' check (char_length(stop_reason) <= 40),   -- why it ended without finishing: user | kill_switch | cost_cap | …
  cancel_requested boolean     not null default false,
  cost_cap_micros  bigint      not null check (cost_cap_micros >= 0),
  spent_micros     bigint      not null default 0 check (spent_micros >= 0),
  reserved_micros  bigint      not null default 0 check (reserved_micros >= 0),
  lease_holder     text,
  lease_until      timestamptz,
  tasks_total      integer     not null default 0,
  tasks_done       integer     not null default 0,
  amend_count      integer     not null default 0,
  result           jsonb,
  error            text        not null default '' check (char_length(error) <= 400),
  created_at       timestamptz not null default now(),
  started_at       timestamptz,
  ended_at         timestamptz,
  updated_at       timestamptz not null default now(),
  unique (user_id, idem_key)
);
comment on table public.atlas_jobs is
  '(atlas-durable-jobs) A job: a list of research tasks run on the server after the tab is closed. Owner reads; only service_role and the two owner functions atlas_job_cancel / atlas_job_amend write.';
create index if not exists atlas_jobs_active_idx on public.atlas_jobs (status, lease_until) where status in ('queued', 'running');
create index if not exists atlas_jobs_user_idx on public.atlas_jobs (user_id, created_at desc);

create table if not exists public.atlas_job_tasks (
  job_id      uuid        not null references public.atlas_jobs(id) on delete cascade,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  task_id     text        not null check (char_length(task_id) between 1 and 64),
  key         text        not null,                         -- contractKey: the identity of the work (js/atlas-job-core.js)
  contract    jsonb       not null,
  deps        text[]      not null default '{}',
  status      text        not null default 'queued' check (status in ('queued', 'running', 'done', 'partial', 'failed', 'refused', 'cancelled')),
  code        text        not null default '' check (char_length(code) <= 60),
  result      jsonb,
  cost_micros bigint      not null default 0 check (cost_micros >= 0),
  calls       integer     not null default 0,
  started_at  timestamptz,
  ended_at    timestamptz,
  primary key (job_id, task_id)
);
comment on table public.atlas_job_tasks is
  '(atlas-durable-jobs) One task of a job: contract, the tasks it starts from, state and result (the shape js/atlas-job-core.js shapeOf returns).';

create table if not exists public.atlas_job_events (
  id      bigint      generated always as identity primary key,
  job_id  uuid        not null references public.atlas_jobs(id) on delete cascade,
  user_id uuid        not null references auth.users(id) on delete cascade,
  at      timestamptz not null default now(),
  kind    text        not null check (char_length(kind) between 1 and 40),
  data    jsonb       not null default '{}'::jsonb
);
comment on table public.atlas_job_events is
  '(atlas-durable-jobs) Append-only record of a job: created, lease, task.started, task.ended, cost, amend (the reader''s new instruction), cancel, ended.';
create index if not exists atlas_job_events_job_idx on public.atlas_job_events (job_id, id);

alter table public.atlas_jobs       enable row level security;
alter table public.atlas_job_tasks  enable row level security;
alter table public.atlas_job_events enable row level security;
revoke all on public.atlas_jobs, public.atlas_job_tasks, public.atlas_job_events from public, anon, authenticated;
grant select on public.atlas_jobs, public.atlas_job_tasks, public.atlas_job_events to authenticated;
grant all on public.atlas_jobs, public.atlas_job_tasks, public.atlas_job_events to service_role;

drop policy if exists atlas_jobs_owner_select on public.atlas_jobs;
create policy atlas_jobs_owner_select on public.atlas_jobs for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists atlas_job_tasks_owner_select on public.atlas_job_tasks;
create policy atlas_job_tasks_owner_select on public.atlas_job_tasks for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists atlas_job_events_owner_select on public.atlas_job_events;
create policy atlas_job_events_owner_select on public.atlas_job_events for select to authenticated using ((select auth.uid()) = user_id);

-- ── create: idempotent, bounded ──────────────────────────────────────────────
-- p_tasks: [{ "id": text, "key": text, "contract": object, "deps": [text] }] — already planned by planJob (js/atlas-job-core.js)
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
  v_n      integer;
  t        jsonb;
begin
  select * into c from public.atlas_jobs_control where id;
  if c is null or not c.enabled then return query select null::uuid, false, ''::text, 'disabled'::text; return; end if;
  if v_idem = '' or jsonb_typeof(p_tasks) <> 'array' or jsonb_array_length(p_tasks) not between 1 and 8 then
    return query select null::uuid, false, ''::text, 'bad_request'::text; return;
  end if;

  -- serialise this reader's creates so two simultaneous requests cannot both pass the count below
  perform pg_advisory_xact_lock(hashtextextended('atlas_job_create:' || p_user::text, 0));

  select * into v_job from public.atlas_jobs j where j.user_id = p_user and j.idem_key = v_idem;
  if found then return query select v_job.id, false, v_job.status, ''::text; return; end if;

  select count(*) into v_n from public.atlas_jobs j where j.user_id = p_user and j.status in ('queued', 'running');
  if v_n >= c.max_active_per_user then return query select null::uuid, false, ''::text, 'user_active_limit'::text; return; end if;
  select count(*) into v_n from public.atlas_jobs j where j.status in ('queued', 'running');
  if v_n >= c.max_active_total then return query select null::uuid, false, ''::text, 'busy'::text; return; end if;

  insert into public.atlas_jobs (user_id, idem_key, title, cost_cap_micros, tasks_total)
  values (p_user, v_idem, left(coalesce(p_title, ''), 200), c.job_cost_cap_micros, jsonb_array_length(p_tasks))
  returning * into v_job;
  for t in select * from jsonb_array_elements(p_tasks) loop
    insert into public.atlas_job_tasks (job_id, user_id, task_id, key, contract, deps)
    values (v_job.id, p_user, left(t->>'id', 64), coalesce(t->>'key', ''), t->'contract',
            coalesce(array(select jsonb_array_elements_text(coalesce(t->'deps', '[]'::jsonb))), '{}'));
  end loop;
  insert into public.atlas_job_events (job_id, user_id, kind, data) values (v_job.id, p_user, 'created', jsonb_build_object('tasks', jsonb_array_length(p_tasks), 'capMicros', c.job_cost_cap_micros));
  return query select v_job.id, true, v_job.status, ''::text;
end;
$$;
revoke execute on function public.atlas_job_create(uuid, text, text, jsonb) from public, anon, authenticated;
grant  execute on function public.atlas_job_create(uuid, text, text, jsonb) to service_role;

-- ── claim: one runner at a time ──────────────────────────────────────────────
create or replace function public.atlas_job_claim(p_holder text, p_lease_seconds integer, p_job uuid default null)
returns setof public.atlas_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  c   public.atlas_jobs_control;
  j   public.atlas_jobs;
  v_l integer := greatest(30, least(coalesce(p_lease_seconds, 150), 900));
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
  select * into j from public.atlas_jobs x
   where x.status in ('queued', 'running') and (x.lease_until is null or x.lease_until < now())
     and (p_job is null or x.id = p_job)
   order by x.created_at
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

-- ── checkpoint: renew the lease, learn whether to stop, read what the reader changed ──
create or replace function public.atlas_job_checkpoint(p_job uuid, p_holder text, p_lease_seconds integer)
returns table (ok boolean, action text, amends jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  c   public.atlas_jobs_control;
  j   public.atlas_jobs;
  v_l integer := greatest(30, least(coalesce(p_lease_seconds, 150), 900));
  v_a jsonb;
begin
  select * into j from public.atlas_jobs x where x.id = p_job for update;
  if not found or j.lease_holder is distinct from left(p_holder, 80) or j.status <> 'running' then
    return query select false, 'lost'::text, '[]'::jsonb; return;
  end if;
  select * into c from public.atlas_jobs_control where id;
  select coalesce(jsonb_agg(e.data->>'note' order by e.id), '[]'::jsonb) into v_a from public.atlas_job_events e where e.job_id = p_job and e.kind = 'amend';
  if c is null or not c.enabled then
    return query select true, 'kill_switch'::text, v_a; return;
  end if;
  if j.cancel_requested then return query select true, 'cancel'::text, v_a; return; end if;
  update public.atlas_jobs x set lease_until = now() + make_interval(secs => v_l), updated_at = now() where x.id = p_job;
  return query select true, 'go'::text, v_a;
end;
$$;
revoke execute on function public.atlas_job_checkpoint(uuid, text, integer) from public, anon, authenticated;
grant  execute on function public.atlas_job_checkpoint(uuid, text, integer) to service_role;

-- ── the cost fence: reserve before a request, settle after ────────────────────
create or replace function public.atlas_job_reserve(p_job uuid, p_holder text, p_micros bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare j public.atlas_jobs;
begin
  select * into j from public.atlas_jobs x where x.id = p_job for update;
  if not found or j.lease_holder is distinct from left(p_holder, 80) or j.status <> 'running' then return false; end if;
  if j.spent_micros + j.reserved_micros + greatest(0, coalesce(p_micros, 0)) > j.cost_cap_micros then return false; end if;
  update public.atlas_jobs x set reserved_micros = x.reserved_micros + greatest(0, coalesce(p_micros, 0)), updated_at = now() where x.id = p_job;
  return true;
end;
$$;
revoke execute on function public.atlas_job_reserve(uuid, text, bigint) from public, anon, authenticated;
grant  execute on function public.atlas_job_reserve(uuid, text, bigint) to service_role;

create or replace function public.atlas_job_settle(p_job uuid, p_holder text, p_reserved bigint, p_actual bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.atlas_jobs x set
      reserved_micros = greatest(0, x.reserved_micros - greatest(0, coalesce(p_reserved, 0))),
      spent_micros = x.spent_micros + greatest(0, coalesce(p_actual, 0)), updated_at = now()
   where x.id = p_job and x.lease_holder = left(p_holder, 80);
  return found;
end;
$$;
revoke execute on function public.atlas_job_settle(uuid, text, bigint, bigint) from public, anon, authenticated;
grant  execute on function public.atlas_job_settle(uuid, text, bigint, bigint) to service_role;

-- ── tasks: start once, finish once ───────────────────────────────────────────
create or replace function public.atlas_job_task_start(p_job uuid, p_holder text, p_task text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.atlas_job_tasks t set status = 'running', started_at = now()
   where t.job_id = p_job and t.task_id = p_task and t.status = 'queued'
     and exists (select 1 from public.atlas_jobs x where x.id = p_job and x.lease_holder = left(p_holder, 80) and x.status = 'running');
  if not found then return false; end if;
  insert into public.atlas_job_events (job_id, user_id, kind, data) select p_job, x.user_id, 'task.started', jsonb_build_object('task', p_task) from public.atlas_jobs x where x.id = p_job;
  return true;
end;
$$;
revoke execute on function public.atlas_job_task_start(uuid, text, text) from public, anon, authenticated;
grant  execute on function public.atlas_job_task_start(uuid, text, text) to service_role;

create or replace function public.atlas_job_task_finish(p_job uuid, p_holder text, p_task text, p_status text, p_code text, p_result jsonb, p_cost bigint, p_calls integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('done', 'partial', 'failed', 'refused', 'cancelled') then return false; end if;
  update public.atlas_job_tasks t set status = p_status, code = left(coalesce(p_code, ''), 60), result = p_result,
         cost_micros = greatest(0, coalesce(p_cost, 0)), calls = greatest(0, coalesce(p_calls, 0)), ended_at = now()
   where t.job_id = p_job and t.task_id = p_task and t.status = 'running'
     and exists (select 1 from public.atlas_jobs x where x.id = p_job and x.lease_holder = left(p_holder, 80) and x.status = 'running');
  if not found then return false; end if;   -- already finished (or not this runner's): the second call changes nothing
  update public.atlas_jobs x set tasks_done = (select count(*) from public.atlas_job_tasks t where t.job_id = p_job and t.status in ('done', 'partial')), updated_at = now() where x.id = p_job;
  insert into public.atlas_job_events (job_id, user_id, kind, data) select p_job, x.user_id, 'task.ended', jsonb_build_object('task', p_task, 'state', p_status, 'code', coalesce(p_code, ''), 'costMicros', greatest(0, coalesce(p_cost, 0))) from public.atlas_jobs x where x.id = p_job;
  return true;
end;
$$;
revoke execute on function public.atlas_job_task_finish(uuid, text, text, text, text, jsonb, bigint, integer) from public, anon, authenticated;
grant  execute on function public.atlas_job_task_finish(uuid, text, text, text, text, jsonb, bigint, integer) to service_role;

-- a queued task that can never start (a task it starts from did not finish) ends here, with the reason
create or replace function public.atlas_job_task_block(p_job uuid, p_holder text, p_task text, p_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.atlas_job_tasks t set status = 'failed', code = left(coalesce(p_code, 'input_unavailable'), 60), ended_at = now()
   where t.job_id = p_job and t.task_id = p_task and t.status = 'queued'
     and exists (select 1 from public.atlas_jobs x where x.id = p_job and x.lease_holder = left(p_holder, 80) and x.status = 'running');
  return found;
end;
$$;
revoke execute on function public.atlas_job_task_block(uuid, text, text, text) from public, anon, authenticated;
grant  execute on function public.atlas_job_task_block(uuid, text, text, text) to service_role;

-- ── end the job (once) / let go of it ────────────────────────────────────────
create or replace function public.atlas_job_finish(p_job uuid, p_holder text, p_status text, p_stop_reason text, p_result jsonb, p_error text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare j public.atlas_jobs;
begin
  if p_status not in ('done', 'failed', 'cancelled') then return false; end if;
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

create or replace function public.atlas_job_release(p_job uuid, p_holder text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.atlas_jobs x set lease_holder = null, lease_until = null, updated_at = now()
   where x.id = p_job and x.status = 'running' and x.lease_holder = left(p_holder, 80);
  return found;
end;
$$;
revoke execute on function public.atlas_job_release(uuid, text) from public, anon, authenticated;
grant  execute on function public.atlas_job_release(uuid, text) to service_role;

-- ── the reader's two controls, while the work runs ───────────────────────────
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
  if j.status in ('done', 'failed', 'cancelled') then return j.status; end if;   -- idempotent: a second cancel changes nothing
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

create or replace function public.atlas_job_amend(p_job uuid, p_note text, p_drop text[] default '{}')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare j public.atlas_jobs; v_note text := left(btrim(coalesce(p_note, '')), 1000);
begin
  select * into j from public.atlas_jobs x where x.id = p_job and x.user_id = (select auth.uid()) for update;
  if not found or j.status not in ('queued', 'running') or j.cancel_requested then return -1; end if;
  if v_note = '' and coalesce(array_length(p_drop, 1), 0) = 0 then return -1; end if;
  if j.amend_count >= 20 then return -2; end if;   -- observation: a reader changes the request a few times; 20 is an order above that
  if coalesce(array_length(p_drop, 1), 0) > 0 then
    update public.atlas_job_tasks t set status = 'cancelled', code = 'dropped', ended_at = now() where t.job_id = p_job and t.status = 'queued' and t.task_id = any (p_drop);
  end if;
  if v_note <> '' then
    insert into public.atlas_job_events (job_id, user_id, kind, data) values (p_job, j.user_id, 'amend', jsonb_build_object('note', v_note, 'drop', coalesce(p_drop, '{}')));
  end if;
  update public.atlas_jobs x set amend_count = x.amend_count + 1, updated_at = now() where x.id = p_job;
  return j.amend_count + 1;
end;
$$;
revoke execute on function public.atlas_job_amend(uuid, text, text[]) from public, anon;
grant  execute on function public.atlas_job_amend(uuid, text, text[]) to authenticated;

-- ── retention + the per-minute tick (where pg_cron exists; production has it) ─────
create or replace function public.purge_atlas_jobs(p_days integer default 30)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  delete from public.atlas_jobs x where x.status in ('done', 'failed', 'cancelled') and x.ended_at < now() - make_interval(days => greatest(1, coalesce(p_days, 30)));
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.purge_atlas_jobs(integer) from public, anon, authenticated;
grant  execute on function public.purge_atlas_jobs(integer) to service_role;

do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron is not installed here — the atlas-jobs tick is not scheduled (production has it)';
    return;
  end if;
  perform cron.schedule('intmap-atlas-jobs-purge', '41 3 * * *', 'select public.purge_atlas_jobs(30)');
  /* The tick takes over a job whose runner stopped (a lapsed lease) and starts one nobody kicked. Its secret is in vault
     (name atlas_jobs_secret) — created beside the function secret ATLAS_JOBS_SECRET; without it the tick posts nothing. */
  perform cron.schedule('intmap-atlas-jobs-tick', '* * * * *', $cmd$
select net.http_post(
  url := 'https://vpekfwdpurzejrrmacac.supabase.co/functions/v1/atlas-jobs',
  headers := jsonb_build_object('Content-Type', 'application/json', 'x-atlas-jobs-secret', s.decrypted_secret),
  body := '{"op":"tick"}'::jsonb,
  timeout_milliseconds := 5000
)
from vault.decrypted_secrets s
where s.name = 'atlas_jobs_secret'
  and exists (select 1 from public.atlas_jobs j where j.status in ('queued', 'running') and (j.lease_until is null or j.lease_until < now()));
$cmd$);
end $$;
