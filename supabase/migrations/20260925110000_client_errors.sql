-- ============================================================================
--  client-error-log — IntMap's own record of the errors its readers hit (replaces the dormant Sentry loader)
-- ----------------------------------------------------------------------------
--  THE DEFECT: error monitoring was Sentry, and no DSN was ever configured, so the loader in
--  index.html returned on its first line for every visit. An exception in a reader's browser was
--  recorded nowhere but that tab's ring buffer, which only a Bug Report carries out. Production was
--  watched by a six-hourly probe that asks whether the page is served — and by nothing that asks
--  whether it works.
--
--  THIS MIGRATION is the store: one row per DISTINCT defect (fingerprint), with how many times and
--  when it was first and last seen. Written only by the client-errors Edge Function (service role,
--  through record_client_error below), read only by an admin (the «Errors» tab of admin.html).
--
--  ⚠ NO PERSONAL DATA BY CONSTRUCTION. There is no column for an IP address, a user id, a session,
--  a query string or anything typed, so none can be stored by a later caller either. The browser is
--  a name and a major version (derived from the User-Agent on the server; the string itself is not
--  kept). The column limits below restate supabase/functions/_shared/client-error-shape.js `MAX`,
--  which is the canonical place for them; here they are the database's own ceiling.
--
--  RETENTION: 30 days after a defect was LAST seen (purge_client_errors, scheduled daily below).
--  A defect that is still occurring keeps its row, and its count, for as long as it occurs.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
--  1. THE TABLE
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.client_errors (
  fingerprint text        primary key check (fingerprint ~ '^[0-9a-f]{32}$'),
  kind        text        not null default 'error' check (kind in ('error', 'rejection')),
  message     text        not null check (char_length(message) between 1 and 500),
  stack       text        not null default '' check (char_length(stack) <= 4000),
  path        text        not null default '' check (char_length(path) <= 200),
  release     text        not null default '' check (char_length(release) <= 64),
  browser     text        not null default '' check (char_length(browser) <= 40),
  count       bigint      not null default 1 check (count >= 1),
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);
comment on table public.client_errors is
  'Uncaught exceptions and unhandled rejections from IntMap readers'' browsers, one row per fingerprint (client-error-log). No IP, user id, query string or typed text is stored. Written only via record_client_error (service role, client-errors Edge Function); read only by admins; purged 30 days after last_seen.';

create index if not exists client_errors_last_seen_idx on public.client_errors (last_seen desc);

-- ─────────────────────────────────────────────────────────────────────────────
--  2. RLS + grants. Reading is an admin's; writing is the RPC's alone.
--     ⚠ TRUNCATE is not subject to RLS, so the grant layer is what refuses it — `revoke all`, then
--     give back exactly the SELECT the admin policy needs (docs/SECURITY-ARCHITECTURE.md §8 item 5).
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.client_errors enable row level security;

revoke all on table public.client_errors from public, anon, authenticated, service_role;
grant select on table public.client_errors to authenticated;

drop policy if exists client_errors_admin_select on public.client_errors;
create policy client_errors_admin_select on public.client_errors
  for select to authenticated
  using ((select public.is_admin()));

-- ─────────────────────────────────────────────────────────────────────────────
--  3. record_client_error — insert a new defect, or add one occurrence to a known one.
--
--     p_max_rows is the table's size ceiling, owned by the caller (the Edge Function states it and
--     why). When the table already holds that many rows a NEW fingerprint is refused, while a known
--     one still counts: the ceiling bounds storage without hiding how often a defect recurs.
--     Returns 'inserted' | 'counted' | 'full'.
--
--     ATOMICITY: `insert … on conflict do update` is one statement, so two isolates reporting the
--     same defect at the same instant add two to the count rather than one each to two rows.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.record_client_error(
  p_fingerprint text,
  p_kind        text,
  p_message     text,
  p_stack       text,
  p_path        text,
  p_release     text,
  p_browser     text,
  p_max_rows    integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_known boolean;
begin
  select true into v_known from public.client_errors e where e.fingerprint = p_fingerprint;
  if v_known is null and (select count(*) from public.client_errors) >= greatest(1, coalesce(p_max_rows, 1)) then
    return 'full';
  end if;

  insert into public.client_errors as e (fingerprint, kind, message, stack, path, release, browser)
  values (p_fingerprint,
          case when p_kind = 'rejection' then 'rejection' else 'error' end,
          left(coalesce(p_message, ''), 500),
          left(coalesce(p_stack, ''), 4000),
          left(coalesce(p_path, ''), 200),
          left(coalesce(p_release, ''), 64),
          left(coalesce(p_browser, ''), 40))
  on conflict (fingerprint) do update
     set count     = e.count + 1,
         last_seen = now(),
         -- the latest occurrence's context replaces the earlier one: which build, page and browser
         -- it is happening on NOW is what an operator acts on
         release   = excluded.release,
         path      = excluded.path,
         browser   = excluded.browser,
         stack     = case when excluded.stack <> '' then excluded.stack else e.stack end;

  return case when v_known then 'counted' else 'inserted' end;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  4. purge_client_errors — the 30-day retention the privacy policy states (js/legal-text.js §6).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.purge_client_errors(p_days integer default 30)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  delete from public.client_errors e
   where e.last_seen < now() - make_interval(days => greatest(1, coalesce(p_days, 30)));
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.record_client_error(text, text, text, text, text, text, text, integer) from public, anon, authenticated;
revoke execute on function public.purge_client_errors(integer)                                           from public, anon, authenticated;
grant  execute on function public.record_client_error(text, text, text, text, text, text, text, integer) to service_role;
grant  execute on function public.purge_client_errors(integer)                                           to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  5. THE SCHEDULE — daily at 03:17 UTC. pg_cron is installed in production (news-ingest's jobs run
--     on it) and is not created by any migration in this repo, so the local / CI stack may lack it:
--     the same guard as 20260824220000_r405_news_feeds.sql. `cron.schedule` with a job NAME replaces
--     a same-named job, so re-running this is a no-op (#R405 measured that the Management API's role
--     cannot UPDATE cron.job directly — schedule() is the path that works).
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron is not installed here — skipping the client-errors-purge schedule';
    return;
  end if;
  perform cron.schedule('client-errors-purge', '17 3 * * *', 'select public.purge_client_errors(30)');
end $$;
