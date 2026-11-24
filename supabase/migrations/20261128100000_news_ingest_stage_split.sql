-- ============================================================================
--  IntMap · news-ingest — one cron job per group of stages, not one for all of them
--  docs/NEWS-EVENTS.md §12 (the schedule) · dev-notes/2026-11-24-news-archive-cpu.md
-- ----------------------------------------------------------------------------
--  Measured 2026-11-24 on production (the same net.http_post the cron makes, one body per call):
--    every stage alone returns 200 (fetch 10 s, locate 33 s, assign 11 s, prune 18 s) — and every body that
--    chains fetch+locate, locate..prune, or embed..prune returns 546 WORKER_RESOURCE_LIMIT. The memory one
--    stage holds is still there when the next one starts, so the sum is what the worker is held to.
--    Bodies that passed: [embed,assign,link,entities] · [link,entities,prune] · [locate,embed] · each stage alone.
--  Since 08:40 UTC the 20-minute tick had left no news_ingest_runs row at all (the run dies before it writes one).
--
--  ⇒ one request, one worker, at most one heavy stage. Same stages, same order, same 20-minute cadence — the order
--    is kept by the minute each job starts on (a job's work is done well before the next one starts):
--
--      :00 :20 :40   news-ingest-tick     fetch                      (the job keeps its name and its secret)
--      :04 :24 :44   news-ingest-locate   locate, embed
--      :08 :28 :48   news-ingest-assign   assign, link, entities
--      :16 :36 :56   news-ingest-prune    prune                      (the summarise job already owns :13)
--
--  ⚠ The secret is read from the vault inside the command, exactly as the existing jobs do — it is never written
--    here. cron.schedule replaces a job of the same name, so this migration is idempotent.
-- ============================================================================
do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron is not installed here — skipping the news-ingest stage split';
    return;
  end if;

  perform cron.schedule('news-ingest-tick', '0,20,40 * * * *', $cmd$
select net.http_post(
  url := 'https://vpekfwdpurzejrrmacac.functions.supabase.co/news-ingest',
  headers := jsonb_build_object('Content-Type', 'application/json', 'x-news-ingest-secret', s.decrypted_secret),
  body := '{"stages":["fetch"]}'::jsonb
)
from vault.decrypted_secrets s
where s.name = 'news_ingest_secret';
$cmd$);

  perform cron.schedule('news-ingest-locate', '4,24,44 * * * *', $cmd$
select net.http_post(
  url := 'https://vpekfwdpurzejrrmacac.functions.supabase.co/news-ingest',
  headers := jsonb_build_object('Content-Type', 'application/json', 'x-news-ingest-secret', s.decrypted_secret),
  body := '{"stages":["locate","embed"]}'::jsonb
)
from vault.decrypted_secrets s
where s.name = 'news_ingest_secret';
$cmd$);

  perform cron.schedule('news-ingest-assign', '8,28,48 * * * *', $cmd$
select net.http_post(
  url := 'https://vpekfwdpurzejrrmacac.functions.supabase.co/news-ingest',
  headers := jsonb_build_object('Content-Type', 'application/json', 'x-news-ingest-secret', s.decrypted_secret),
  body := '{"stages":["assign","link","entities"]}'::jsonb
)
from vault.decrypted_secrets s
where s.name = 'news_ingest_secret';
$cmd$);

  perform cron.schedule('news-ingest-prune', '16,36,56 * * * *', $cmd$
select net.http_post(
  url := 'https://vpekfwdpurzejrrmacac.functions.supabase.co/news-ingest',
  headers := jsonb_build_object('Content-Type', 'application/json', 'x-news-ingest-secret', s.decrypted_secret),
  body := '{"stages":["prune"]}'::jsonb
)
from vault.decrypted_secrets s
where s.name = 'news_ingest_secret';
$cmd$);
end $$;
