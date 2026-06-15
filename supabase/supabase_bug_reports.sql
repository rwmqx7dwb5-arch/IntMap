-- ============================================================================
--  IntMap · bug_reports  —  in-app Bug Report system (#R29.1)
-- ----------------------------------------------------------------------------
--  Run once in the Supabase SQL editor (idempotent). The front-end Bug Report
--  modal inserts here; admins review reports in admin.html. If this table does
--  not exist the front-end degrades gracefully (stores locally + clipboard).
-- ============================================================================

create table if not exists public.bug_reports (
  id          bigint generated always as identity primary key,
  created_at  timestamptz default now(),
  category    text,                       -- ui | map | news | ai | account | perf | other
  description text not null,
  diagnostics jsonb,                       -- build, theme, viewport, active layers, recent errors, view…
  build       text,
  lang        text,
  ua          text,
  page        text,
  user_id     uuid,
  email       text,
  status      text default 'open',         -- open | triaged | fixed | wontfix  (admin-managed)
  resolved    boolean default false
);

create index if not exists bug_reports_created_idx on public.bug_reports (created_at desc);
create index if not exists bug_reports_status_idx on public.bug_reports (status);

-- RLS: anyone (incl. anonymous) may FILE a report; only the service role / admins read & update.
alter table public.bug_reports enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='bug_reports' and policyname='bug_reports_insert_any') then
    create policy bug_reports_insert_any on public.bug_reports for insert to anon, authenticated with check (true);
  end if;
  -- Optional: let signed-in users read their OWN reports (uncomment if desired).
  -- if not exists (select 1 from pg_policies where schemaname='public' and tablename='bug_reports' and policyname='bug_reports_read_own') then
  --   create policy bug_reports_read_own on public.bug_reports for select to authenticated using (auth.uid() = user_id);
  -- end if;
end$$;
