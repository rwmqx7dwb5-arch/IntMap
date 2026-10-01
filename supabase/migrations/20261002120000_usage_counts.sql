-- ============================================================================
--  anonymous-usage-counts — IntMap's own aggregate usage counters (no cookie, no vendor, no person)
-- ----------------------------------------------------------------------------
--  THE DECISION (operator, 2026-10-01): measure what marketing reaches — page views per day, where
--  readers arrive from, which features they use — with IntMap's OWN counters only. No third-party
--  analytics, no cookie, no IP, no user id, no session, no raw event row.
--
--  THIS MIGRATION is the store: one row per (day, metric, dimension) with a count, and nothing else.
--  Written only by the usage-count Edge Function (service role, through record_usage_counts below),
--  read only by an admin (the «Usage» tab of admin.html). What a metric and a dimension may be is
--  declared once, in supabase/functions/usage-count/shape.js; the CHECK constraints below are the
--  database's own outer bound on the same shape, not a second declaration.
--
--  ⚠ NO PERSONAL DATA BY CONSTRUCTION. There is no column for an IP address, a user, a session, a
--  User-Agent or a time finer than the day, so none can be stored by a later caller either
--  (supabase/tests/15_usage_counts_test.sql measures that over the catalogue).
--
--  RETENTION: 400 days (purge_usage_counts, scheduled daily below) — a year of days plus a month, so
--  a day can be compared with the same day a year earlier.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
--  1. THE TABLE
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.usage_counts (
  day        date   not null,
  metric     text   not null check (metric ~ '^[a-z][a-z_]{0,31}$'),
  dimension  text   not null default '' check (dimension = '' or (char_length(dimension) <= 64 and dimension ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$')),
  count      bigint not null default 0 check (count >= 0),
  primary key (day, metric, dimension)
);
comment on table public.usage_counts is
  'Anonymous aggregate usage counters (anonymous-usage-counts): (UTC day, metric, dimension) -> count. No IP, user, session, User-Agent or time finer than the day. Metrics and dimensions are declared in supabase/functions/usage-count/shape.js. Written only via record_usage_counts (service role, usage-count Edge Function); read only by admins; purged after 400 days.';

-- ─────────────────────────────────────────────────────────────────────────────
--  2. RLS + grants. Reading is an admin's; writing is the RPC's alone.
--     ⚠ TRUNCATE is not subject to RLS, so the grant layer is what refuses it — `revoke all`, then
--     give back exactly the SELECT the admin policy needs (docs/SECURITY-ARCHITECTURE.md §8 item 5).
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.usage_counts enable row level security;

revoke all on table public.usage_counts from public, anon, authenticated, service_role;
grant select on table public.usage_counts to authenticated;

drop policy if exists usage_counts_admin_select on public.usage_counts;
create policy usage_counts_admin_select on public.usage_counts
  for select to authenticated
  using ((select public.is_admin()));

-- ─────────────────────────────────────────────────────────────────────────────
--  3. record_usage_counts — add one request's rows to today's counters.
--
--     p_rows = [{ "m": metric, "d": dimension, "n": count, "cap": max distinct dimensions }, …]
--     The Edge Function has already validated every row against shape.js; `cap` is that file's
--     per-metric ceiling, supplied by the function and never by the browser. A NEW dimension is
--     refused once its metric already holds `cap` dimensions TODAY, while a known one still counts:
--     the ceiling bounds the table without hiding how often a known value recurs.
--     The day is the SERVER's UTC date — the browser never sends a time.
--     Returns how many rows were counted (the rest were refused at the ceiling).
--
--     ATOMICITY: `insert … on conflict do update` is one statement per row, and the function runs in
--     one transaction, so two isolates counting the same row at the same instant add both.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.record_usage_counts(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day     date := (now() at time zone 'utc')::date;
  v_row     jsonb;
  v_metric  text;
  v_dim     text;
  v_n       bigint;
  v_cap     integer;
  v_known   boolean;
  v_counted integer := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return 0;
  end if;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_metric := v_row ->> 'm';
    v_dim    := coalesce(v_row ->> 'd', '');
    v_n      := greatest(0, least(coalesce((v_row ->> 'n')::bigint, 0), 1000));
    v_cap    := greatest(1, coalesce((v_row ->> 'cap')::integer, 1));
    if v_metric is null or v_n < 1 then
      continue;
    end if;
    select true into v_known from public.usage_counts u
     where u.day = v_day and u.metric = v_metric and u.dimension = v_dim;
    if v_known is null and (select count(*) from public.usage_counts u
                             where u.day = v_day and u.metric = v_metric) >= v_cap then
      continue;
    end if;
    insert into public.usage_counts as u (day, metric, dimension, count)
    values (v_day, v_metric, v_dim, v_n)
    on conflict (day, metric, dimension) do update
       set count = u.count + excluded.count;
    v_counted := v_counted + 1;
  end loop;
  return v_counted;
end;
$$;
comment on function public.record_usage_counts(jsonb) is
  'anonymous-usage-counts: adds one request''s validated rows to today''s (UTC) counters; refuses a NEW dimension past the per-metric daily cap. service_role only (the usage-count Edge Function).';

-- ─────────────────────────────────────────────────────────────────────────────
--  4. purge_usage_counts — the 400-day retention the privacy policy states (js/legal-text.js §6).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.purge_usage_counts(p_days integer default 400)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  delete from public.usage_counts u
   where u.day < (now() at time zone 'utc')::date - greatest(1, coalesce(p_days, 400));
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  5. usage_counts_summary — what the admin console shows: each (metric, dimension)'s total over the
--     last p_days days. SECURITY INVOKER on purpose: it reads the table with the CALLER's rights, so
--     the admin-only SELECT policy above is what decides who sees anything (a non-admin gets no row),
--     and there is no second gate to keep in step. It exists because the raw rows of 30 days
--     (a layer dimension × 30 days alone can pass PostgREST's 1,000-row page) are not what an
--     operator reads; the totals are.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.usage_counts_summary(p_days integer default 30)
returns table (metric text, dimension text, total bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select u.metric, u.dimension, sum(u.count)::bigint as total
    from public.usage_counts u
   where u.day > (now() at time zone 'utc')::date - greatest(1, least(coalesce(p_days, 30), 400))
   group by u.metric, u.dimension
   order by u.metric, total desc, u.dimension;
$$;

revoke execute on function public.record_usage_counts(jsonb)     from public, anon, authenticated;
revoke execute on function public.purge_usage_counts(integer)     from public, anon, authenticated;
revoke execute on function public.usage_counts_summary(integer)   from public, anon;
grant  execute on function public.record_usage_counts(jsonb)     to service_role;
grant  execute on function public.purge_usage_counts(integer)     to service_role;
grant  execute on function public.usage_counts_summary(integer)   to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
--  6. THE SCHEDULE — daily at 03:27 UTC (ten minutes after client-errors-purge). Same guard as
--     20260925110000_client_errors.sql: pg_cron exists in production and may not exist locally / in
--     CI; a job NAME makes `cron.schedule` replace a same-named job, so re-running is a no-op.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron is not installed here — skipping the usage-counts-purge schedule';
    return;
  end if;
  perform cron.schedule('usage-counts-purge', '27 3 * * *', 'select public.purge_usage_counts(400)');
end $$;
