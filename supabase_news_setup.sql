-- ============================================================================
--  IntMap · server-side news  —  run ONCE in the Supabase SQL Editor
-- ----------------------------------------------------------------------------
--  Creates the `current_news` table that the `refresh-news` Edge Function fills
--  on a schedule. The browser then loads pre-analysed news with a single SELECT
--  instead of fetching + scoring 150 articles on the main thread at startup.
--
--  ORDER OF OPERATIONS
--    1. Run this whole file in the SQL Editor.
--    2. Deploy the function:  supabase functions deploy refresh-news --no-verify-jwt
--    3. (recommended) set a secret:  supabase secrets set REFRESH_SECRET=<random-string>
--       (optional LLM geocoding:     supabase secrets set OPENAI_API_KEY=sk-...)
--    4. Edit + run the "CRON" block at the bottom (fill in your secret), then
--       call the function once to seed it immediately (see the comment there).
-- ============================================================================

-- ---- 1) Table -------------------------------------------------------------
create table if not exists public.current_news (
  id              bigint generated always as identity primary key,
  lang            text        not null check (lang in ('en','jp')),
  topic           text,
  title           text        not null,
  publisher       text,
  link            text        not null,
  pub_date        timestamptz,
  description     text,
  subject_lng     double precision,
  subject_lat     double precision,
  subject_name_en text,
  subject_name_jp text,
  mapped          boolean     not null default false,
  pub_lng         double precision,
  pub_lat         double precision,
  pub_label       text,
  short_en        text,
  short_jp        text,
  fetched_at      timestamptz not null default now(),
  unique (lang, link)
);

create index if not exists current_news_lang_date_idx on public.current_news (lang, pub_date desc);

-- ---- 2) Row-level security: world-readable, writable only by service_role --
alter table public.current_news enable row level security;

drop policy if exists "current_news public read" on public.current_news;
create policy "current_news public read" on public.current_news
  for select using (true);
-- (No insert/update/delete policy → the anon/auth client cannot write.
--  The Edge Function uses the service_role key, which bypasses RLS.)

grant select on public.current_news to anon, authenticated;

-- ---- 3) Scheduling (pg_cron + pg_net) -------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- CRON ----------------------------------------------------------------------
-- Fill in <REFRESH_SECRET> with the value you set via `supabase secrets set`.
-- (If you did NOT set REFRESH_SECRET, delete the x-refresh-secret header line.)
-- Run this block AFTER deploying the function.

select cron.unschedule('intmap-refresh-news')
where exists (select 1 from cron.job where jobname = 'intmap-refresh-news');

select cron.schedule(
  'intmap-refresh-news',
  '*/20 * * * *',                      -- every 20 minutes
  $$
  select net.http_post(
    url     := 'https://vpekfwdpurzejrrmacac.supabase.co/functions/v1/refresh-news',
    headers := jsonb_build_object(
                 'Content-Type',    'application/json',
                 'x-refresh-secret','<REFRESH_SECRET>'
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 90000
  );
  $$
);

-- Seed it now (one-off) so the table isn't empty until the first scheduled run:
--   select net.http_post(
--     url     := 'https://vpekfwdpurzejrrmacac.supabase.co/functions/v1/refresh-news',
--     headers := jsonb_build_object('Content-Type','application/json','x-refresh-secret','<REFRESH_SECRET>'),
--     body    := '{}'::jsonb, timeout_milliseconds := 90000);
--
-- Inspect:   select lang, count(*), max(fetched_at) from public.current_news group by lang;
-- Realtime (optional, so the client live-updates when a new batch lands):
--   alter publication supabase_realtime add table public.current_news;
