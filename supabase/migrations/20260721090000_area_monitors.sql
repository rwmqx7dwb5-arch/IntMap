-- ============================================================================
--  IntMap — AREA MONITORS migration (#R141)
-- ----------------------------------------------------------------------------
--  WHAT THIS IS
--    The "area monitoring / change-detection / evidence-backed report" feature.
--    A logged-in user saves a MONITOR over a geographic area (a radius circle, a
--    drawn polygon, or a resolved region) and a set of data SOURCES (news first,
--    more later). A server-side runner (Edge Function `monitor-run`, scheduled by
--    pg_cron — same pattern as refresh-news) periodically:
--      collect → normalize/dedup → snapshot → mechanical diff vs the baseline →
--      change-score → (only when the change is meaningful) call the AI → validate
--      every evidence id → persist a run + evidence + (maybe) a report.
--
--    Four tables model this, deliberately separated so future data collectors
--    (earthquakes/weather/fires/…) plug in without schema churn:
--      • area_monitors    — the monitor definition (owner, geometry, sources, …)
--      • monitor_runs     — one row per execution attempt (status, snapshot, diff)
--      • monitor_evidence — the structured evidence rows a run gathered
--      • monitor_reports  — the AI/mechanical report a run generated (if any)
--
--  IDEMPOTENT & NON-DESTRUCTIVE
--    Every statement uses IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS.
--    No DROP TABLE / DROP COLUMN / DELETE anywhere. Additive on top of the baseline.
--
--  SECURITY MODEL (mirrors the baseline's defense-in-depth)
--    • RLS on all four tables; a user sees ONLY their own monitors/runs/evidence/
--      reports (user_id = auth.uid()).
--    • A user may CREATE/EDIT/DELETE their own MONITORS, but CANNOT write runs,
--      evidence or reports at all (no grant) — so run results cannot be FORGED.
--      Those are written only by the service_role runner (which bypasses RLS).
--    • Column-level UPDATE grant on area_monitors excludes the run-state columns
--      (running_since / last_* / run_count), so a user cannot tamper with the
--      execution lock or fabricate "last run" metadata on their own row either.
--    • PKs are random UUIDs (gen_random_uuid) — never guessable sequential ids.
--    • monitor_claim_due() is SECURITY DEFINER, service_role-only: the atomic,
--      lock-based claim (FOR UPDATE SKIP LOCKED) that prevents double execution.
--    • monitor_limit() is the per-plan cap (the billing connection point). A
--      BEFORE INSERT trigger enforces it — a user cannot exceed their quota.
--    • Geometry text size and name length are constrained at the DB.
-- ============================================================================

begin;

-- ─────────────────────────────────────────────────────────────────────────────
--  1. TABLES  (FK dependency order: monitors → runs → evidence/reports).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1.1 area_monitors — the monitor definition. One row per saved watch.
create table if not exists public.area_monitors (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  -- Geometry: a normalized GeoJSON Polygon/MultiPolygon (a circle is stored ALSO
  -- as center+radius_km for a lossless, compact round-trip; the polygon is what
  -- the server tests points against). geometry_kind records provenance.
  geometry        jsonb not null,
  geometry_kind   text  not null default 'polygon',   -- 'circle'|'polygon'|'multipolygon'|'region'
  center_lng      double precision,
  center_lat      double precision,
  radius_km       double precision,
  bbox            jsonb,                               -- [w,s,e,n] fast pre-filter
  area_label      text,                                -- human label ("200 km around Rotterdam")
  -- Selected collectors. Extensible — not CHECK-constrained to a closed set so a
  -- new collector ('earthquake','weather','fire',…) needs no migration.
  sources         text[] not null default array['news'],
  -- Comparison config: {"mode":"previous_run"|"baseline_window","window_days":30}
  comparison      jsonb not null default '{"mode":"previous_run","window_days":30}'::jsonb,
  -- Per-source sensitivity/thresholds, e.g. {"news":{"min_new":2,"min_score":0.35}}
  sensitivity     jsonb not null default '{}'::jsonb,
  interval_minutes integer not null default 360,       -- how often it may run
  enabled         boolean not null default true,
  -- Denormalized run state (written by the runner; read for the list UI).
  running_since   timestamptz,                          -- claim lock (NULL = idle)
  last_run_at     timestamptz,
  next_run_at     timestamptz not null default now(),   -- due when <= now()
  last_status     text,                                 -- last run status (see run status set)
  last_change_severity text,                            -- 'none'|'low'|'medium'|'high'|'critical'
  last_report_id  uuid,                                 -- soft ref to the latest report (no FK: set post-insert)
  run_count       integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint area_monitors_name_len       check (char_length(name) between 1 and 120),
  constraint area_monitors_interval_min   check (interval_minutes >= 30),
  constraint area_monitors_sources_nonempty check (array_length(sources, 1) >= 1),
  constraint area_monitors_geom_size      check (char_length(geometry::text) <= 400000),
  constraint area_monitors_geom_object    check (jsonb_typeof(geometry) = 'object')
);
comment on table public.area_monitors is
  '(#R141) A user''s saved area watch: geometry + sources + comparison/sensitivity + schedule. Owner-only RLS; run-state columns are not user-updatable (see grants).';

-- 1.2 monitor_runs — one row per execution attempt (scheduled or manual).
create table if not exists public.monitor_runs (
  id              uuid primary key default gen_random_uuid(),
  monitor_id      uuid not null references public.area_monitors(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,  -- denormalized for RLS
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  -- Status taxonomy. success | success_no_change | partial | source_unavailable |
  -- ai_failed | timed_out | invalid_geometry | quota_exceeded | disabled | internal_error
  status          text not null default 'internal_error',
  trigger         text not null default 'schedule',     -- 'schedule'|'manual'|'initial'
  sources_attempted text[] not null default array[]::text[],
  sources_ok      text[] not null default array[]::text[],
  sources_failed  text[] not null default array[]::text[],
  snapshot        jsonb,                                 -- normalized snapshot (counts/keys/per-source)
  diff            jsonb,                                 -- mechanical diff (new/gone/continuing + numeric deltas)
  change_score    numeric,                               -- computed change score (0..1)
  report_generated boolean not null default false,
  report_id       uuid,                                  -- soft ref (reports.run_id is the hard FK)
  ai_used         boolean not null default false,
  ai_skip_reason  text,                                  -- why AI was NOT called (no_change|insufficient_baseline|source_unavailable|below_threshold|disabled|not_needed)
  ai_provider     text,
  ai_model        text,
  ai_tokens_in    integer,
  ai_tokens_out   integer,
  error_category  text,                                  -- when failed (no secrets/PII)
  error_detail    text,
  retryable       boolean not null default false,
  duration_ms     integer,
  evidence_count  integer not null default 0,
  created_at      timestamptz not null default now()
);
comment on table public.monitor_runs is
  '(#R141) One execution attempt of a monitor. Written only by the service_role runner; users read their own. Preserves snapshot+diff even when only the AI step failed.';

-- 1.3 monitor_evidence — structured evidence gathered by a run. Every report claim
--     references these by ev_key; the runner validates that mapping before saving.
create table if not exists public.monitor_evidence (
  id              uuid primary key default gen_random_uuid(),
  run_id          uuid not null references public.monitor_runs(id) on delete cascade,
  monitor_id      uuid not null references public.area_monitors(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,  -- denormalized for RLS
  ev_key          text not null,                         -- stable per-run id ("ev_1"…) referenced by the report
  source_type     text not null,                         -- 'news'|'earthquake'|…
  source_name     text,                                  -- publisher/provider
  source_url      text,                                  -- original URL (http/https validated by the runner)
  external_id     text,                                  -- provider id / link
  title           text,
  observed_at     timestamptz,                           -- event / publication time
  fetched_at      timestamptz not null default now(),
  lng             double precision,
  lat             double precision,
  payload         jsonb,                                 -- normalized data
  dedup_key       text not null,                         -- dedup hash/key
  change_kind     text,                                  -- 'new'|'continuing'|'gone' vs baseline
  created_at      timestamptz not null default now(),
  unique (run_id, ev_key)
);
comment on table public.monitor_evidence is
  '(#R141) A single piece of structured evidence for a run (source_type/name/url/observed_at/coords/normalized payload/dedup_key). ev_key is what report claims cite.';

-- 1.4 monitor_reports — the report a run generated (AI-authored or mechanical).
create table if not exists public.monitor_reports (
  id              uuid primary key default gen_random_uuid(),
  monitor_id      uuid not null references public.area_monitors(id) on delete cascade,
  run_id          uuid not null references public.monitor_runs(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,  -- denormalized for RLS
  severity        text not null default 'low',           -- 'none'|'low'|'medium'|'high'|'critical'
  headline        text not null,
  summary         text,
  changes         jsonb not null default '[]'::jsonb,     -- [{claim, evidence_ids:[…], metric?}]
  unchanged       jsonb not null default '[]'::jsonb,     -- ["…"]
  data_gaps       jsonb not null default '[]'::jsonb,     -- ["…"]
  limitations     jsonb not null default '[]'::jsonb,     -- ["…"]
  metrics         jsonb,                                  -- numeric comparisons {articles:{prev,cur,delta},…}
  change_points   jsonb,                                  -- [{lng,lat,label,evidence_id}] for the map
  ai_provider     text,
  ai_model        text,
  prompt_version  text,
  read            boolean not null default false,
  created_at      timestamptz not null default now()
);
comment on table public.monitor_reports is
  '(#R141) A report generated for a run. Every factual claim in `changes` carries evidence_ids that MUST resolve to this run''s monitor_evidence (validated by the runner).';

-- ─────────────────────────────────────────────────────────────────────────────
--  2. INDEXES (query paths the runner + UI actually use).
-- ─────────────────────────────────────────────────────────────────────────────
create index if not exists idx_monitors_user           on public.area_monitors (user_id);
-- The due-scan the runner does every tick: enabled monitors ordered by next_run_at.
create index if not exists idx_monitors_due             on public.area_monitors (next_run_at) where enabled;
create index if not exists idx_monitors_running         on public.area_monitors (running_since);
create index if not exists idx_monruns_monitor          on public.monitor_runs (monitor_id, started_at desc);
create index if not exists idx_monruns_user             on public.monitor_runs (user_id);
create index if not exists idx_monev_run                on public.monitor_evidence (run_id);
create index if not exists idx_monev_monitor            on public.monitor_evidence (monitor_id);
create index if not exists idx_monev_user               on public.monitor_evidence (user_id);
create index if not exists idx_monev_dedup              on public.monitor_evidence (monitor_id, dedup_key);
create index if not exists idx_monrep_monitor           on public.monitor_reports (monitor_id, created_at desc);
create index if not exists idx_monrep_user              on public.monitor_reports (user_id);
create index if not exists idx_monrep_run               on public.monitor_reports (run_id);

-- ─────────────────────────────────────────────────────────────────────────────
--  3. updated_at trigger for area_monitors (keeps it honest on edits).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.tg_monitors_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_monitors_touch on public.area_monitors;
create trigger trg_monitors_touch
  before update on public.area_monitors
  for each row execute function public.tg_monitors_touch();

-- ─────────────────────────────────────────────────────────────────────────────
--  4. PLAN LIMITS — the per-plan monitor cap. THIS is the billing connection
--     point: change the numbers here (or read a future billing table) to tier it.
--     SECURITY DEFINER + empty search_path so the insert trigger can read profiles
--     without tripping profiles' owner-only RLS.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.monitor_limit(p_user uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan  text;
  v_pro   boolean;
  v_admin boolean;
begin
  select plan, is_pro, is_admin into v_plan, v_pro, v_admin
    from public.profiles where id = p_user;
  if v_admin or v_plan = 'unlimited' then return 200; end if;
  if v_plan in ('pro','plus') or v_pro then return 25; end if;
  return 5;   -- free
end;
$$;
comment on function public.monitor_limit(uuid) is
  '(#R141) Max saved monitors for a user by plan (free=5, pro/plus=25, admin/unlimited=200). The single place to tier the feature for billing.';

-- Enforce the cap on insert. A user cannot exceed monitor_limit() for themselves.
create or replace function public.tg_monitors_enforce_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_limit integer;
begin
  select count(*) into v_count from public.area_monitors where user_id = new.user_id;
  v_limit := public.monitor_limit(new.user_id);
  if v_count >= v_limit then
    raise exception 'monitor_limit_reached: % monitors is the limit for this plan', v_limit
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_monitors_limit on public.area_monitors;
create trigger trg_monitors_limit
  before insert on public.area_monitors
  for each row execute function public.tg_monitors_enforce_limit();

-- ─────────────────────────────────────────────────────────────────────────────
--  5. CLAIM RPC — the atomic, lock-based "grab the due monitors" the runner calls.
--     FOR UPDATE SKIP LOCKED means two concurrent cron invocations never process
--     the same monitor. Stale locks (a crashed run) are reclaimed after
--     p_stale_minutes. service_role-only (EXECUTE revoked from users below).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.monitor_claim_due(p_limit integer default 20, p_stale_minutes integer default 15)
returns setof public.area_monitors
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.area_monitors m
     set running_since = now()
   where m.id in (
     select s.id from public.area_monitors s
      where s.enabled = true
        and s.next_run_at <= now()
        and (s.running_since is null or s.running_since < now() - make_interval(mins => p_stale_minutes))
      order by s.next_run_at asc
      limit p_limit
      for update skip locked
   )
  returning m.*;
end;
$$;
comment on function public.monitor_claim_due(integer, integer) is
  '(#R141) Atomically claim up to p_limit due, enabled, unlocked monitors (FOR UPDATE SKIP LOCKED) and mark them running. service_role only — the runner''s double-execution guard.';

-- Let a user mark ONE of their own reports read, without granting UPDATE on the
-- table (keeps the report body immutable from the client). SECURITY DEFINER but
-- scoped to the caller's own row via auth.uid().
create or replace function public.monitor_mark_read(p_report uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.monitor_reports
     set read = true
   where id = p_report and user_id = (select auth.uid());
end;
$$;
comment on function public.monitor_mark_read(uuid) is
  '(#R141) Mark the caller''s own report read. Owner-scoped via auth.uid(); the report body stays client-immutable (no UPDATE grant).';

-- ─────────────────────────────────────────────────────────────────────────────
--  6. ROW LEVEL SECURITY.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.area_monitors    enable row level security;
alter table public.monitor_runs      enable row level security;
alter table public.monitor_evidence  enable row level security;
alter table public.monitor_reports   enable row level security;

-- 6.1 area_monitors — full own-row CRUD (WITH CHECK pins user_id = self so you
--     cannot create/reassign a monitor to someone else). Column-level UPDATE
--     grant (§7) additionally blocks tampering with the run-state columns.
drop policy if exists monitors_select_own on public.area_monitors;
drop policy if exists monitors_insert_own on public.area_monitors;
drop policy if exists monitors_update_own on public.area_monitors;
drop policy if exists monitors_delete_own on public.area_monitors;
create policy monitors_select_own on public.area_monitors
  for select to authenticated using (user_id = (select auth.uid()));
create policy monitors_insert_own on public.area_monitors
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy monitors_update_own on public.area_monitors
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy monitors_delete_own on public.area_monitors
  for delete to authenticated using (user_id = (select auth.uid()));

-- 6.2 monitor_runs / monitor_evidence / monitor_reports — READ own only. No
--     insert/update/delete policy AND no write grant → users cannot write them at
--     all (only the service_role runner, which bypasses RLS). Run results cannot
--     be forged, and reports are immutable from the client (read flag flips via
--     the monitor_mark_read RPC).
drop policy if exists monruns_select_own on public.monitor_runs;
create policy monruns_select_own on public.monitor_runs
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists monev_select_own on public.monitor_evidence;
create policy monev_select_own on public.monitor_evidence
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists monrep_select_own on public.monitor_reports;
create policy monrep_select_own on public.monitor_reports
  for select to authenticated using (user_id = (select auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
--  7. GRANTS — defense in depth (RLS decides WHICH ROWS; grants decide whether the
--     role may touch the table/columns AT ALL).
-- ─────────────────────────────────────────────────────────────────────────────
-- area_monitors: read + insert + delete own; UPDATE only the user-editable config
-- columns — NOT the run-state columns (running_since/last_*/run_count/updated_at/
-- last_report_id/last_change_severity), so a user can't forge run metadata or
-- release/steal the execution lock on their own row.
grant select, insert, delete on public.area_monitors to authenticated;
grant update (name, geometry, geometry_kind, center_lng, center_lat, radius_km,
              bbox, area_label, sources, comparison, sensitivity, interval_minutes,
              enabled, next_run_at) on public.area_monitors to authenticated;

-- Child tables: SELECT only (RLS → own rows). No write grant to users.
grant select on public.monitor_runs     to authenticated;
grant select on public.monitor_evidence to authenticated;
grant select on public.monitor_reports  to authenticated;

-- service_role writes everything (explicit for clarity; it also bypasses RLS).
grant all on public.area_monitors, public.monitor_runs,
             public.monitor_evidence, public.monitor_reports to service_role;

-- RPC EXECUTE. Claim is service_role-only (a user calling it could grab/lock
-- monitors). mark_read + limit are safe for users to call about themselves.
revoke execute on function public.monitor_claim_due(integer, integer) from public, anon, authenticated;
grant  execute on function public.monitor_claim_due(integer, integer) to service_role;
revoke execute on function public.tg_monitors_enforce_limit()          from public, anon, authenticated;
revoke execute on function public.tg_monitors_touch()                  from public, anon, authenticated;
grant  execute on function public.monitor_mark_read(uuid) to authenticated, service_role;
grant  execute on function public.monitor_limit(uuid)     to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  8. REALTIME — let the client live-update the monitors list + a report arriving.
--     (Idempotent: skip any table already in the publication.)
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
  tables text[] := array['area_monitors','monitor_runs','monitor_reports'];
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array tables loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;

commit;
