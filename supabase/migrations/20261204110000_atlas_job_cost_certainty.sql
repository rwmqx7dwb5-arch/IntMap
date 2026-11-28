-- Track settled requests with no provider price or usage separately.
-- An expired lease retains its budget allowance without counting it as a charge.
alter table public.atlas_jobs
  add column unknown_cost_calls integer not null default 0 check (unknown_cost_calls >= 0),
  add column unreconciled_micros bigint not null default 0 check (unreconciled_micros >= 0);

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
  if j.spent_micros + j.unreconciled_micros + j.reserved_micros + greatest(0, coalesce(p_micros, 0)) > j.cost_cap_micros then return false; end if;
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
      spent_micros = x.spent_micros + greatest(0, coalesce(p_actual, 0)),
      unknown_cost_calls = x.unknown_cost_calls + case when p_actual is null then 1 else 0 end, updated_at = now()
   where x.id = p_job and x.lease_holder = left(p_holder, 80);
  return found;
end;
$$;
revoke execute on function public.atlas_job_settle(uuid, text, bigint, bigint) from public, anon, authenticated;
grant  execute on function public.atlas_job_settle(uuid, text, bigint, bigint) to service_role;

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
  -- Keep the conservative allowance for expired leases separate from confirmed cost.
  update public.atlas_job_tasks t set status = 'queued', started_at = null where t.job_id = j.id and t.status = 'running';
  update public.atlas_jobs x set
      status = 'running', lease_holder = left(p_holder, 80), lease_until = now() + make_interval(secs => v_l),
      unreconciled_micros = x.unreconciled_micros + x.reserved_micros, reserved_micros = 0,
      started_at = coalesce(x.started_at, now()), updated_at = now()
   where x.id = j.id returning * into j;
  insert into public.atlas_job_events (job_id, user_id, kind, data) values (j.id, j.user_id, 'lease', jsonb_build_object('holder', left(p_holder, 80)));
  return next j;
end;
$$;
revoke execute on function public.atlas_job_claim(text, integer, uuid) from public, anon, authenticated;
grant  execute on function public.atlas_job_claim(text, integer, uuid) to service_role;
