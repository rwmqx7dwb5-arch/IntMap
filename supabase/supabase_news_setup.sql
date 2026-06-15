-- ============================================================================
--  IntMap · current_news  —  schema + scheduling for the refresh-news function
-- ----------------------------------------------------------------------------
--  Run this ONCE in the Supabase SQL editor (it is idempotent — safe to re-run).
--  It creates/extends the table the `refresh-news` Edge Function writes to and
--  the browser reads on startup (one SELECT → instant news pins).
--
--  (#R29) Adds the `analyzed_by` column so the server can tell which articles
--  were located by the AI (and must NOT be re-analysed) vs the dictionary
--  fallback ('ai' | 'dict' | 'none').
-- ============================================================================

create table if not exists public.current_news (
  id              bigint generated always as identity primary key,
  lang            text not null,                       -- 'en' | 'jp'
  topic           text,                                -- 'world' | 'business'
  title           text not null,
  publisher       text,
  link            text not null,
  pub_date        timestamptz,
  description     text,
  subject_lng     double precision,                    -- event location (AI-primary, dict fallback)
  subject_lat     double precision,
  subject_name_en text,
  subject_name_jp text,
  mapped          boolean default false,
  pub_lng         double precision,                    -- publisher HQ
  pub_lat         double precision,
  pub_label       text,
  short_en        text,
  short_jp        text,
  analyzed_by     text default 'none',                 -- 'ai' | 'dict' | 'none'  (#R29)
  fetched_at      timestamptz default now()
);

-- One row per (language, URL) — the same article is never stored twice.
create unique index if not exists current_news_lang_link_uniq on public.current_news (lang, link);
-- Fast "latest first, within the 72h window" reads + prunes.
create index if not exists current_news_lang_pubdate_idx on public.current_news (lang, pub_date desc);

-- Migration for tables created before #R29 (adds the column without dropping data).
alter table public.current_news add column if not exists analyzed_by text default 'none';

-- ---- Row-Level Security: the browser may READ; only the service role WRITES. -------------
alter table public.current_news enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='current_news' and policyname='current_news_public_read') then
    create policy current_news_public_read on public.current_news for select to anon, authenticated using (true);
  end if;
end$$;

-- ---- Optional: schedule the Edge Function every 20 minutes via pg_cron + pg_net. ----------
--  Requires the `pg_cron` and `pg_net` extensions (enable them under Database → Extensions),
--  and that you replace <PROJECT_REF> and <REFRESH_SECRET> below.
--
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
-- select cron.schedule('intmap-refresh-news', '*/20 * * * *', $$
--   select net.http_post(
--     url     := 'https://<PROJECT_REF>.functions.supabase.co/refresh-news',
--     headers := jsonb_build_object('Content-Type','application/json','x-refresh-secret','<REFRESH_SECRET>'),
--     body    := '{}'::jsonb
--   );
-- $$);
