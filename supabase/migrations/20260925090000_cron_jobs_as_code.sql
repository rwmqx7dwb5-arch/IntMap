-- ============================================================================
--  pg_cron jobs as code — the four schedules that drive IntMap's server side
-- ----------------------------------------------------------------------------
--  Until this file the job DEFINITIONS lived only in production's cron.job, entered by hand in
--  the dashboard. No migration created them, `pg_dump` does not carry them (docs/BACKUP-RESTORE.md),
--  and a rebuilt database had none — so a restore would have come back with news, WHO and the
--  monitors silently frozen. Read from production 2026-09-25 (SELECT on cron.job only):
--
--      jobid  jobname                 schedule        target
--      2      intmap-refresh-news     */20 * * * *    refresh-news   secret from vault  refresh_news_secret
--      3      intmap-monitor-run      */10 * * * *    monitor-run    secret from vault  monitor_run_secret
--      4      news-ingest-tick        */20 * * * *    news-ingest    secret as a LITERAL in the command
--      6      news-ingest-summarise   13 * * * *      news-ingest    secret as a LITERAL in the command
--
--  ⚠ TWO OF THE FOUR CARRIED THEIR SECRET IN THE COMMAND TEXT. A migration is committed to a public
--  repository, so the literal cannot be written here. The block below MOVES it: if vault does not yet
--  hold `news_ingest_secret`, it is created from the value the live job already carries — database to
--  database, never through this file, a log, or a person — and the rescheduled jobs then read it from
--  vault like the other two. The two literals were measured to be identical (one distinct value).
--
--  ⚠ EVERY COMMAND POSTS ONLY WHEN ITS SECRET IS IN VAULT (`from vault.decrypted_secrets … where name`).
--  The URLs are production's. A database that has pg_cron but not production's secrets — a Supabase
--  branch, a restore drill — would otherwise call production every ten minutes, unauthenticated.
--  With the guard it calls nothing. In production all three secrets exist, so behaviour is unchanged
--  (refresh-news keeps its 90 s timeout; the others keep pg_net's default, as before).
--
--  Idempotent: cron.schedule(name, …) replaces the job with that name in place (pg_cron ≥ 1.3; prod
--  runs 1.6.4) and keeps its jobid — the same call #R405's migration uses, because the Management API
--  login role cannot UPDATE cron.job directly (measured then: permission denied for table job).
--  Where pg_cron is not installed (the local stack, CI's rebuild) this does nothing and says so.
-- ============================================================================

do $$
declare
  lit text;
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron is not installed here — the IntMap cron jobs are not scheduled (production has it)';
    return;
  end if;

  /* ① news-ingest's secret: out of the command text, into vault (once). */
  if not exists (select 1 from vault.secrets where name = 'news_ingest_secret') then
    select substring(command from $re$'x-news-ingest-secret'\s*,\s*'([^']+)'$re$)
      into lit
      from cron.job
     where jobname in ('news-ingest-tick', 'news-ingest-summarise')
       and command ~ $re$'x-news-ingest-secret'\s*,\s*'[^']+'$re$
     order by jobid
     limit 1;
    if lit is not null then
      perform vault.create_secret(lit, 'news_ingest_secret',
        'x-news-ingest-secret for the news-ingest cron jobs (moved out of cron.job.command by migration 20260925090000)');
      raise notice 'news_ingest_secret moved from the cron command into vault';
    elsif exists (select 1 from cron.job where jobname like 'news-ingest%') then
      raise exception 'news-ingest cron jobs exist, but neither carries x-news-ingest-secret nor does vault hold news_ingest_secret — create it first: select vault.create_secret(''<the NEWS_INGEST_SECRET of the news-ingest function>'', ''news_ingest_secret'');';
    else
      raise notice 'vault has no news_ingest_secret — the news-ingest jobs are scheduled but post nothing until it is created';
    end if;
  end if;

  /* ② the four jobs, by name. */
  perform cron.schedule('intmap-refresh-news', '*/20 * * * *', $cmd$
select net.http_post(
  url := 'https://vpekfwdpurzejrrmacac.supabase.co/functions/v1/refresh-news',
  headers := jsonb_build_object('Content-Type', 'application/json', 'x-refresh-secret', s.decrypted_secret),
  body := '{}'::jsonb,
  timeout_milliseconds := 90000
)
from vault.decrypted_secrets s
where s.name = 'refresh_news_secret';
$cmd$);

  perform cron.schedule('intmap-monitor-run', '*/10 * * * *', $cmd$
select net.http_post(
  url := 'https://vpekfwdpurzejrrmacac.supabase.co/functions/v1/monitor-run',
  headers := jsonb_build_object('Content-Type', 'application/json', 'x-monitor-secret', s.decrypted_secret),
  body := '{}'::jsonb
)
from vault.decrypted_secrets s
where s.name = 'monitor_run_secret';
$cmd$);

  perform cron.schedule('news-ingest-tick', '*/20 * * * *', $cmd$
select net.http_post(
  url := 'https://vpekfwdpurzejrrmacac.functions.supabase.co/news-ingest',
  headers := jsonb_build_object('Content-Type', 'application/json', 'x-news-ingest-secret', s.decrypted_secret),
  body := '{"stages":["fetch","locate","assign","link","prune"]}'::jsonb
)
from vault.decrypted_secrets s
where s.name = 'news_ingest_secret';
$cmd$);

  perform cron.schedule('news-ingest-summarise', '13 * * * *', $cmd$
select net.http_post(
  url := 'https://vpekfwdpurzejrrmacac.functions.supabase.co/news-ingest',
  headers := jsonb_build_object('Content-Type', 'application/json', 'x-news-ingest-secret', s.decrypted_secret),
  body := '{"stages":["summarise"]}'::jsonb
)
from vault.decrypted_secrets s
where s.name = 'news_ingest_secret';
$cmd$);
end $$;
