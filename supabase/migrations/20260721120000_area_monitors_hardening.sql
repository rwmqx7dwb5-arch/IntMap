-- ============================================================================
--  IntMap — AREA MONITORS hardening migration (#R144)
-- ----------------------------------------------------------------------------
--  Fixes the R141 audit findings. Additive & idempotent on top of
--  20260721090000_area_monitors.sql. No DROP TABLE / DROP COLUMN / data DELETE.
--
--  WHY (the non-obvious prod truth):
--    In production, Supabase's schema-wide DEFAULT PRIVILEGES grant EVERY role
--    (anon/authenticated/service_role) ALL privileges on every public table
--    (pg_class.relacl = {authenticated=arwdDxtm,…}). RLS — not table grants — is
--    the real protection. That means R141's *column-level* UPDATE grant on
--    area_monitors was a NO-OP in prod: because area_monitors has an UPDATE RLS
--    policy (own rows), a logged-in user could UPDATE ANY column on their own
--    monitor, including the run-state lock/counters and next_run_at. (pgTAP ran
--    on vanilla CI Postgres that lacks those default grants, so it never caught
--    it.) The durable fix is a BEFORE UPDATE TRIGGER that freezes the run-state
--    columns for anyone who isn't the service_role runner — robust regardless of
--    what the grants happen to be. We ALSO tighten the grants (defense in depth).
--
--  THIS MIGRATION ADDS
--    1. monitor_seen_items — a lightweight, long-lived per-item history so a
--       "past 30 days" comparison actually references 30 days of observations,
--       independent of per-run evidence pruning (Section 2).
--    2. tg_monitors_guard_state — BEFORE UPDATE guard that (a) freezes run-state
--       columns for non-runner callers and (b) recomputes next_run_at safely on
--       enable/interval changes, so a user can never hand-pick their run time
--       (Section 7). Plus grant tightening as belt-and-suspenders.
--    3. monitor_claim_one — atomic single-monitor claim (UPDATE…WHERE…RETURNING)
--       so two concurrent "Run now" requests can never both succeed (Section 3).
--    4. monitor_finalize / monitor_commit_report — finalize a run + (optionally)
--       persist its report + update the monitor meta in ONE transaction, so a
--       partial DB failure can never leave "report_generated=true" without a
--       report, or success without a run (Section 5).
--    5. monitor_limit_self + revoke monitor_limit(uuid) from users — so a user
--       can read their OWN cap but cannot probe anyone else's plan/admin state by
--       passing an arbitrary UUID (Section 8).
-- ============================================================================

begin;

-- ─────────────────────────────────────────────────────────────────────────────
--  1. monitor_seen_items — the long-lived per-item observation ledger.
--     ONE row per (monitor, source_type, dedup_key). first_seen_at is when the
--     monitor first ever saw the item; last_seen_at is the most recent sighting.
--     This is what makes "past 30 days" real: novelty is "not in this ledger yet"
--     — cap-churn and per-run evidence pruning cannot fabricate a change.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.monitor_seen_items (
  id            uuid primary key default gen_random_uuid(),
  monitor_id    uuid not null references public.area_monitors(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,  -- denormalized for RLS
  source_type   text not null,
  dedup_key     text not null,
  title         text,
  source_name   text,
  source_url    text,
  observed_at   timestamptz,                      -- event/publication time
  lng           double precision,
  lat           double precision,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  seen_count    integer     not null default 1,
  metadata      jsonb,
  unique (monitor_id, source_type, dedup_key)
);
comment on table public.monitor_seen_items is
  '(#R144) Long-lived per-item observation ledger per monitor (one row per unique dedup_key). Powers the "past N days" baseline and cap-proof novelty. Written only by the service_role runner; owner-only SELECT via RLS. Cascades on monitor/user delete.';

create index if not exists idx_monseen_monitor      on public.monitor_seen_items (monitor_id, source_type);
create index if not exists idx_monseen_firstseen    on public.monitor_seen_items (monitor_id, first_seen_at desc);
create index if not exists idx_monseen_lastseen     on public.monitor_seen_items (monitor_id, last_seen_at);
create index if not exists idx_monseen_user         on public.monitor_seen_items (user_id);

alter table public.monitor_seen_items enable row level security;
-- READ own only; no write policy AND (below) no write grant → users cannot write
-- it at all. Only the service_role runner (which bypasses RLS) populates it.
drop policy if exists monseen_select_own on public.monitor_seen_items;
create policy monseen_select_own on public.monitor_seen_items
  for select to authenticated using (user_id = (select auth.uid()));

grant select on public.monitor_seen_items to authenticated;
grant all    on public.monitor_seen_items to service_role;
-- Belt-and-suspenders against the schema-wide default ALL grant: strip writes.
revoke insert, update, delete, truncate on public.monitor_seen_items from anon, authenticated;

-- Add it to realtime (idempotent) so the UI can reflect history if it wants.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
        where pubname='supabase_realtime' and schemaname='public' and tablename='monitor_seen_items') then
    execute 'alter publication supabase_realtime add table public.monitor_seen_items';
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  2. RUN-STATE GUARD — the real (grant-independent) protection for the run-state
--     columns and next_run_at. Fires BEFORE UPDATE on area_monitors. The runner
--     (service_role) is exempt; every other caller has the run-state columns
--     pinned to their OLD values, and next_run_at recomputed under strict rules.
--     next_run_at on enable/interval change = greatest(now, last_run+interval),
--     so pause→resume or shrinking the interval can never jump the schedule below
--     the configured cadence (and never below the 30-min floor).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.tg_monitors_guard_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  v_int  integer := greatest(coalesce(new.interval_minutes, 360), 30);
begin
  -- service_role (the runner) or a direct trusted DB session (no JWT → '', e.g.
  -- migrations / pg_cron running as postgres) may set anything.
  if v_role = 'service_role' or v_role = '' then
    return new;
  end if;

  -- Everyone else: run-state columns are read-only (pin to OLD).
  new.running_since        := old.running_since;
  new.last_run_at          := old.last_run_at;
  new.run_count            := old.run_count;
  new.last_status          := old.last_status;
  new.last_change_severity := old.last_change_severity;
  new.last_report_id       := old.last_report_id;

  -- next_run_at is server-owned: recompute only on an enable or interval change,
  -- and never earlier than one interval after the last run (schedule can't be
  -- hand-picked or reset by pause/resume churn). Otherwise it stays put.
  if new.enabled is not true then
    new.next_run_at := old.next_run_at;                       -- paused: irrelevant, frozen
  elsif (old.enabled is not true) or (new.interval_minutes is distinct from old.interval_minutes) then
    new.next_run_at := greatest(now(),
                                coalesce(old.last_run_at, old.created_at, now()) + make_interval(mins => v_int));
  else
    new.next_run_at := old.next_run_at;                       -- config-only edit: frozen
  end if;
  return new;
end;
$$;
comment on function public.tg_monitors_guard_state() is
  '(#R144) BEFORE UPDATE guard: freezes run-state columns and server-owns next_run_at for any caller that is not the service_role runner (grant-independent protection). Recomputes next_run_at on enable/interval change as greatest(now, last_run+interval).';

drop trigger if exists trg_monitors_guard on public.area_monitors;
create trigger trg_monitors_guard
  before update on public.area_monitors
  for each row execute function public.tg_monitors_guard_state();

-- Grant tightening (defense in depth on top of the trigger). Remove the blanket
-- table-level UPDATE the Supabase default privileges hand to users, and re-grant
-- ONLY the user-editable config columns — NOT next_run_at, NOT the run-state.
revoke update on public.area_monitors from anon, authenticated;
revoke insert, delete, truncate, references, trigger on public.area_monitors from anon;
grant update (name, geometry, geometry_kind, center_lng, center_lat, radius_km,
              bbox, area_label, sources, comparison, sensitivity, interval_minutes,
              enabled) on public.area_monitors to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
--  3. ATOMIC MANUAL CLAIM — the single-statement UPDATE…WHERE…RETURNING that
--     makes "Run now" concurrency-safe. Ownership + enabled + lock-free-or-stale
--     + cooldown are ALL in the WHERE, so two concurrent requests can never both
--     claim. service_role-only (the runner calls it with the verified user id).
--     Returns a claim flag + an honest reason (for the UI) + the monitor row.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.monitor_claim_one(
  p_monitor_id uuid,
  p_user_id    uuid,
  p_cooldown_seconds integer default 30,
  p_stale_minutes    integer default 15
)
returns table(claimed boolean, reason text, monitor jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare m public.area_monitors;
begin
  update public.area_monitors a
     set running_since = now()
   where a.id = p_monitor_id
     and a.user_id = p_user_id
     and a.enabled = true
     and (a.running_since is null or a.running_since < now() - make_interval(mins => greatest(p_stale_minutes, 1)))
     and (a.last_run_at   is null or a.last_run_at   < now() - make_interval(secs => greatest(p_cooldown_seconds, 0)))
   returning a.* into m;
  if found then
    claimed := true; reason := 'claimed'; monitor := to_jsonb(m); return next; return;
  end if;

  -- Not claimed — diagnose WHY (own-row only; never leak another user's row).
  select a.* into m from public.area_monitors a where a.id = p_monitor_id and a.user_id = p_user_id;
  if not found then
    claimed := false; reason := 'not_found'; monitor := null; return next; return;
  end if;
  if m.enabled is not true then
    reason := 'disabled';
  elsif m.running_since is not null and m.running_since >= now() - make_interval(mins => greatest(p_stale_minutes, 1)) then
    reason := 'already_running';
  elsif m.last_run_at is not null and m.last_run_at >= now() - make_interval(secs => greatest(p_cooldown_seconds, 0)) then
    reason := 'cooldown';
  else
    reason := 'unavailable';
  end if;
  claimed := false; monitor := to_jsonb(m); return next; return;
end;
$$;
comment on function public.monitor_claim_one(uuid, uuid, integer, integer) is
  '(#R144) Atomically claim ONE due, owned, unlocked, cooled-down monitor (UPDATE…WHERE…RETURNING). Concurrency-safe "Run now". service_role only; returns {claimed, reason, monitor}.';

-- ─────────────────────────────────────────────────────────────────────────────
--  4. TRANSACTIONAL FINALIZE — write the run result + (optionally) the report +
--     the monitor meta together, so a partial failure rolls the whole thing back.
--     No external API calls happen inside (the runner does the AI call BEFORE and
--     passes the already-built report in). service_role only.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.monitor_finalize(
  p_run uuid, p_mon uuid, run_patch jsonb, mon_patch jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.monitor_runs r set
    status           = coalesce(run_patch->>'status', r.status),
    finished_at      = now(),
    duration_ms      = coalesce((run_patch->>'duration_ms')::int, r.duration_ms),
    sources_ok       = coalesce((select array(select jsonb_array_elements_text(run_patch->'sources_ok'))), r.sources_ok),
    sources_failed   = coalesce((select array(select jsonb_array_elements_text(run_patch->'sources_failed'))), r.sources_failed),
    snapshot         = coalesce(run_patch->'snapshot', r.snapshot),
    diff             = coalesce(run_patch->'diff', r.diff),
    change_score     = coalesce((run_patch->>'change_score')::numeric, r.change_score),
    report_generated = coalesce((run_patch->>'report_generated')::boolean, r.report_generated),
    report_id        = coalesce((run_patch->>'report_id')::uuid, r.report_id),
    ai_used          = coalesce((run_patch->>'ai_used')::boolean, r.ai_used),
    ai_skip_reason   = coalesce(run_patch->>'ai_skip_reason', r.ai_skip_reason),
    ai_provider      = coalesce(run_patch->>'ai_provider', r.ai_provider),
    ai_model         = coalesce(run_patch->>'ai_model', r.ai_model),
    error_category   = run_patch->>'error_category',
    error_detail     = run_patch->>'error_detail',
    retryable        = coalesce((run_patch->>'retryable')::boolean, r.retryable),
    evidence_count   = coalesce((run_patch->>'evidence_count')::int, r.evidence_count)
  where r.id = p_run;

  update public.area_monitors m set
    running_since        = null,
    last_run_at          = coalesce((mon_patch->>'last_run_at')::timestamptz, m.last_run_at),
    next_run_at          = coalesce((mon_patch->>'next_run_at')::timestamptz, m.next_run_at),
    run_count            = coalesce((mon_patch->>'run_count')::int, m.run_count),
    last_status          = coalesce(mon_patch->>'last_status', m.last_status),
    last_change_severity = coalesce(mon_patch->>'last_change_severity', m.last_change_severity),
    last_report_id       = coalesce((mon_patch->>'last_report_id')::uuid, m.last_report_id)
  where m.id = p_mon;
end;
$$;
comment on function public.monitor_finalize(uuid, uuid, jsonb, jsonb) is
  '(#R144) Atomically finalize a run + update its monitor meta (one transaction, no external calls). Always clears running_since (releases the lock). service_role only.';

create or replace function public.monitor_commit_report(
  p_run uuid, p_mon uuid, p_user uuid, report jsonb, run_patch jsonb, mon_patch jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  insert into public.monitor_reports
    (monitor_id, run_id, user_id, severity, headline, summary, changes, unchanged,
     data_gaps, limitations, metrics, change_points, ai_provider, ai_model, prompt_version)
  values
    (p_mon, p_run, p_user,
     coalesce(report->>'severity', 'low'),
     coalesce(report->>'headline', ''),
     report->>'summary',
     coalesce(report->'changes', '[]'::jsonb),
     coalesce(report->'unchanged', '[]'::jsonb),
     coalesce(report->'data_gaps', '[]'::jsonb),
     coalesce(report->'limitations', '[]'::jsonb),
     report->'metrics',
     report->'change_points',
     report->>'ai_provider', report->>'ai_model', report->>'prompt_version')
  returning id into v_id;

  -- Fold the fresh report id into the patches and finalize in the SAME txn.
  perform public.monitor_finalize(
    p_run, p_mon,
    run_patch || jsonb_build_object('report_generated', true, 'report_id', v_id::text),
    mon_patch || jsonb_build_object('last_report_id', v_id::text)
  );
  return v_id;
end;
$$;
comment on function public.monitor_commit_report(uuid, uuid, uuid, jsonb, jsonb, jsonb) is
  '(#R144) Insert a report AND finalize its run AND update the monitor meta in ONE transaction. If any part fails the whole thing rolls back — no "report_generated=true" without a report. service_role only.';

-- ─────────────────────────────────────────────────────────────────────────────
--  5. PLAN-LIMIT ATTRIBUTE-LEAK FIX. monitor_limit(uuid) stays (the insert
--     trigger + service_role need it) but users can no longer call it with an
--     arbitrary UUID to infer someone else's plan/admin state. They call
--     monitor_limit_self(), which only ever reads their OWN cap.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.monitor_limit_self()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select public.monitor_limit((select auth.uid()));
$$;
comment on function public.monitor_limit_self() is
  '(#R144) The caller''s OWN monitor cap. Safe self-only replacement for user-facing use of monitor_limit(uuid), which can no longer be called with an arbitrary UUID to probe another user''s plan/admin state.';

-- The trigger (SECURITY DEFINER, owned by postgres) can still call monitor_limit;
-- users cannot (they use monitor_limit_self). This closes the enumeration.
revoke execute on function public.monitor_limit(uuid) from public, anon, authenticated;
grant  execute on function public.monitor_limit(uuid) to service_role;
grant  execute on function public.monitor_limit_self() to authenticated, service_role;

-- New RPCs are runner-only (users must never claim/finalize/forge).
revoke execute on function public.monitor_claim_one(uuid, uuid, integer, integer)          from public, anon, authenticated;
grant  execute on function public.monitor_claim_one(uuid, uuid, integer, integer)          to service_role;
revoke execute on function public.monitor_finalize(uuid, uuid, jsonb, jsonb)               from public, anon, authenticated;
grant  execute on function public.monitor_finalize(uuid, uuid, jsonb, jsonb)               to service_role;
revoke execute on function public.monitor_commit_report(uuid, uuid, uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant  execute on function public.monitor_commit_report(uuid, uuid, uuid, jsonb, jsonb, jsonb) to service_role;
revoke execute on function public.tg_monitors_guard_state() from public, anon, authenticated;

commit;
