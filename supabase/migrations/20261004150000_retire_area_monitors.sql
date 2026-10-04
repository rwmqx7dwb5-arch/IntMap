-- ============================================================================
--  retire-area-monitors — the server half of the withdrawn Area Monitors, removed
-- ----------------------------------------------------------------------------
--  The Area Monitors (20260721090000_area_monitors.sql and the four migrations that hardened it) had
--  no entry point left: the tab, the workspace window, the widget card and Atlas's `monitor` action
--  were all withdrawn earlier, and the page module, the monitor-run Edge Function and their tests are
--  removed in the same change as this file. What stayed behind on the server was a cron job posting
--  to a function that no longer exists, a vault secret only that job read, five tables, ten functions
--  and their grants, policies, triggers and realtime membership. This file removes all of it.
--
--  ⚠ WHAT IS KEPT: Watched places (public.place_watches, 20261003211700_place_watches.sql) is a
--  separate table with its own functions and is not touched here. docs/AREA-MONITORS.md is its record.
--
--  ⚠ THE ROWS GO WITH THE TABLES. Approved by the user as a removal (2026-10-04). The tables were
--  owner-scoped (RLS) and listed in public.account_data_catalog, so the catalogue rows go too — the
--  account data centre and delete_account_data() walk public._owned_by_user_cols(), which DISCOVERS
--  the owned columns from foreign keys to auth.users (20260820120000_delete_account_txn.sql), so a
--  dropped table simply stops being walked; no list there needs editing.
--
--  Every step is idempotent and survives a database that never had the piece it removes: the local
--  stack and CI's rebuild have no pg_cron, a Supabase branch may have no vault secret, and a second
--  application of this file finds nothing left to drop.
-- ============================================================================

begin;

-- ─────────────────────────────────────────────────────────────────────────────
--  1. The cron job and the secret only it read (production; absent elsewhere)
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron is not installed here — no intmap-monitor-run job to unschedule';
  elsif exists (select 1 from cron.job where jobname = 'intmap-monitor-run') then
    perform cron.unschedule('intmap-monitor-run');
    raise notice 'unscheduled intmap-monitor-run';
  end if;

  if to_regclass('vault.secrets') is null then
    raise notice 'vault is not installed here — no monitor_run_secret to delete';
  elsif exists (select 1 from vault.secrets where name = 'monitor_run_secret') then
    delete from vault.secrets where name = 'monitor_run_secret';
    raise notice 'deleted vault secret monitor_run_secret';
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  2. Realtime membership (said explicitly; dropping a table would also remove it)
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['area_monitors','monitor_runs','monitor_reports','monitor_evidence','monitor_seen_items'] loop
      if exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime drop table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  3. The account data centre's catalogue rows for the five tables
-- ─────────────────────────────────────────────────────────────────────────────
delete from public.account_data_catalog
 where tbl in ('area_monitors','monitor_runs','monitor_evidence','monitor_reports','monitor_seen_items');

-- ─────────────────────────────────────────────────────────────────────────────
--  4. The five tables — CASCADE takes their policies, triggers, indexes and grants
-- ─────────────────────────────────────────────────────────────────────────────
drop table if exists public.monitor_seen_items cascade;
drop table if exists public.monitor_evidence   cascade;
drop table if exists public.monitor_reports    cascade;
drop table if exists public.monitor_runs       cascade;
drop table if exists public.area_monitors      cascade;

-- ─────────────────────────────────────────────────────────────────────────────
--  5. The ten functions (signatures as last defined)
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.monitor_claim_due(integer, integer);
drop function if exists public.monitor_claim_one(uuid, uuid, integer, integer);
drop function if exists public.monitor_finalize(uuid, uuid, jsonb, jsonb);
drop function if exists public.monitor_commit_report(uuid, uuid, uuid, jsonb, jsonb, jsonb);
drop function if exists public.monitor_limit(uuid);
drop function if exists public.monitor_limit_self();
drop function if exists public.monitor_mark_read(uuid);
drop function if exists public.tg_monitors_touch();
drop function if exists public.tg_monitors_enforce_limit();
drop function if exists public.tg_monitors_guard_state();

commit;
