-- ============================================================================
--  IntMap · Atlas delegation — the JOURNAL: one row per worker call and per Atlas root turn
--  (docs/architecture/05-ai.md «委譲（delegation）»)
-- ----------------------------------------------------------------------------
--  WHY A TABLE, WHEN ai_turns ALREADY HAS ROWS FOR THESE.
--    · public.ai_turns is a scratch pad: a row lives ~1 day (TURN_TTL_S 900 s, swept after a day), and a
--      worker whose call failed is REFUNDED — its row is released. So the failures the delegation comparison
--      (dev-notes/2026-11-18-atlas-delegation.md) needs to see are exactly the rows that are gone by the next
--      nightly run. This is the record that outlives them: outcome, typed code, model actually served, latency,
--      tokens and cost, for every worker call and every Atlas root turn, success and failure alike.
--    · It is written ONLY by ai-proxy (service_role, log_ai_delegation) and read by its owner and by
--      public.delegation_overview (administrator console). Best-effort: a journal write that fails never
--      fails the request it describes (the posture of spend 'unavailable' in ai-proxy ask.ts).
--
--  RETENTION: rows older than 30 days are deleted daily (pg_cron, the mechanism of
--  20260925090000_cron_jobs_as_code.sql / 20260925110000_client_errors.sql).
--    · Observation — ai_turns rows live ~1 day, so a failure is invisible by the next day's comparison.
--      30 days is long enough to compare nightly runs across several weeks of changes to models and policy.
--    · Expires — when docs/MONITORING.md needs a longer window: change the argument of the scheduled call
--      below (and purge_ai_delegation_journal's default) together; they are the one place the number lives.
-- ============================================================================

create table if not exists public.ai_delegation_journal (
  id           bigint      generated always as identity primary key,
  user_id      uuid        not null references auth.users(id) on delete cascade,
  root_key     text        not null,                 -- the reader's turn key: the family a call belongs to
  child_key    text,                                 -- the worker's own turn key; NULL for a root (reader) turn
  task         text        not null,                 -- 'atlas_delegate' (a worker) or 'atlas_turn' (a root turn)
  outcome      text        not null check (outcome in ('ok', 'failed', 'refused')),
  code         text        not null default '',      -- '' for ok; else the typed error code the request ended in
  http_status  integer,
  model        text        not null default '',      -- the model that actually answered (meta.modelServed), else the one asked
  latency_ms   integer,
  input_tokens integer,
  output_tokens integer,
  cost_micros  bigint,
  web          boolean     not null default false,   -- the hosted web search actually ran
  created_at   timestamptz not null default now()
);
comment on table public.ai_delegation_journal is
  '(atlas-delegation) One row per worker call and per Atlas root turn, success and failure alike, kept 30 days (the scratch ledger ai_turns forgets a refused worker in a day). Written only by ai-proxy through log_ai_delegation (service_role); the owner reads their own rows; public.delegation_overview aggregates it for the administrator console.';

create index if not exists ai_delegation_journal_created_idx on public.ai_delegation_journal (created_at);
create index if not exists ai_delegation_journal_family_idx  on public.ai_delegation_journal (user_id, root_key);

alter table public.ai_delegation_journal enable row level security;
revoke all on public.ai_delegation_journal from public, anon, authenticated;
grant select on public.ai_delegation_journal to authenticated;
grant all    on public.ai_delegation_journal to service_role;

drop policy if exists ai_delegation_journal_owner_select on public.ai_delegation_journal;
create policy ai_delegation_journal_owner_select on public.ai_delegation_journal
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- ── the only writer ──────────────────────────────────────────────────────────
create or replace function public.log_ai_delegation(
  p_user          uuid,
  p_root          text,
  p_child         text,
  p_task          text,
  p_outcome       text,
  p_code          text,
  p_http          integer,
  p_model         text,
  p_latency_ms    integer,
  p_input         integer,
  p_output        integer,
  p_cost_micros   bigint,
  p_web           boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ai_delegation_journal
    (user_id, root_key, child_key, task, outcome, code, http_status, model, latency_ms, input_tokens, output_tokens, cost_micros, web)
  values
    (p_user,
     left(coalesce(nullif(btrim(p_root), ''), ''), 120),
     nullif(left(coalesce(btrim(p_child), ''), 120), ''),
     left(coalesce(p_task, ''), 40),
     p_outcome,
     left(coalesce(p_code, ''), 64),
     p_http,
     left(coalesce(p_model, ''), 80),
     greatest(0, p_latency_ms),
     greatest(0, p_input),
     greatest(0, p_output),
     greatest(0, p_cost_micros),
     coalesce(p_web, false));
  return true;
end;
$$;
comment on function public.log_ai_delegation(uuid, text, text, text, text, text, integer, text, integer, integer, integer, bigint, boolean) is
  '(atlas-delegation) Append one journal row for a worker call or an Atlas root turn. Written only by ai-proxy, best-effort (a failed write is never a failed request). outcome is ok | failed | refused (the table refuses any other word).';
revoke execute on function public.log_ai_delegation(uuid, text, text, text, text, text, integer, text, integer, integer, integer, bigint, boolean) from public, anon, authenticated;
grant  execute on function public.log_ai_delegation(uuid, text, text, text, text, text, integer, text, integer, integer, integer, bigint, boolean) to service_role;

-- ── retention ────────────────────────────────────────────────────────────────
create or replace function public.purge_ai_delegation_journal(p_days integer default 30)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  delete from public.ai_delegation_journal j
   where j.created_at < now() - make_interval(days => greatest(1, coalesce(p_days, 30)));
  get diagnostics n = row_count;
  return n;
end;
$$;
comment on function public.purge_ai_delegation_journal(integer) is
  '(atlas-delegation) Delete journal rows older than p_days (default 30). Scheduled daily as pg_cron job ai-delegation-journal-purge.';
revoke execute on function public.purge_ai_delegation_journal(integer) from public, anon, authenticated;
grant  execute on function public.purge_ai_delegation_journal(integer) to service_role;

do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron is not installed here — skipping the ai-delegation-journal-purge schedule';
    return;
  end if;
  -- a job NAME makes cron.schedule replace a same-named job, so re-running this is a no-op
  perform cron.schedule('ai-delegation-journal-purge', '23 3 * * *', 'select public.purge_ai_delegation_journal(30)');
end $$;

-- ── the administrator console's one read ─────────────────────────────────────
--  Shape (another worker builds the console against exactly this; do not change it without them):
--    { days:  [{ day, children, ok, failed, refused, p50_ms, p90_ms, cost_usd }],   -- worker calls, one object per UTC day with rows, oldest first
--      codes: [{ code, n }],                                                          -- the typed codes of every call that did not end ok (workers and roots), most frequent first
--      roots: { turns, p50_ms, p90_ms, cost_usd } }                                   -- Atlas root turns over the whole window
--  p_days is clamped to 1..90: nothing older than the 30-day retention exists, and the bound keeps the
--  argument from being a way to ask for an unbounded scan.
create or replace function public.delegation_overview(p_days integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer := least(90, greatest(1, coalesce(p_days, 7)));
  v_since timestamptz;
  v_out jsonb;
begin
  -- the one admin predicate (public.is_admin(): the flag AND an MFA session — 20261118130000)
  if not public.is_admin() then raise exception 'not authorised'; end if;
  v_since := now() - make_interval(days => v_days);

  select jsonb_build_object(
    'days', coalesce((
      select jsonb_agg(jsonb_build_object(
               'day', d.day,
               'children', d.children, 'ok', d.ok, 'failed', d.failed, 'refused', d.refused,
               'p50_ms', d.p50_ms, 'p90_ms', d.p90_ms, 'cost_usd', d.cost_usd) order by d.day)
        from (
          select to_char((j.created_at at time zone 'utc')::date, 'YYYY-MM-DD') as day,
                 count(*)::int                                                  as children,
                 (count(*) filter (where j.outcome = 'ok'))::int                as ok,
                 (count(*) filter (where j.outcome = 'failed'))::int            as failed,
                 (count(*) filter (where j.outcome = 'refused'))::int           as refused,
                 coalesce(round(percentile_cont(0.5) within group (order by j.latency_ms))::int, 0) as p50_ms,
                 coalesce(round(percentile_cont(0.9) within group (order by j.latency_ms))::int, 0) as p90_ms,
                 round(coalesce(sum(j.cost_micros), 0)::numeric / 1000000, 6)   as cost_usd
            from public.ai_delegation_journal j
           where j.created_at >= v_since and j.child_key is not null
           group by 1
        ) d), '[]'::jsonb),
    'codes', coalesce((
      select jsonb_agg(jsonb_build_object('code', c.code, 'n', c.n) order by c.n desc, c.code)
        from (
          select j.code, count(*)::int as n
            from public.ai_delegation_journal j
           where j.created_at >= v_since and j.outcome <> 'ok'
           group by j.code
        ) c), '[]'::jsonb),
    'roots', (
      select jsonb_build_object(
               'turns', count(*)::int,
               'p50_ms', coalesce(round(percentile_cont(0.5) within group (order by j.latency_ms))::int, 0),
               'p90_ms', coalesce(round(percentile_cont(0.9) within group (order by j.latency_ms))::int, 0),
               'cost_usd', round(coalesce(sum(j.cost_micros), 0)::numeric / 1000000, 6))
        from public.ai_delegation_journal j
       where j.created_at >= v_since and j.child_key is null)
  ) into v_out;
  return v_out;
end;
$$;
comment on function public.delegation_overview(integer) is
  '(atlas-delegation) The administrator console''s read of ai_delegation_journal over the last p_days (1..90, default 7): per-day worker counts by outcome with latency p50/p90 and cost, the typed codes of calls that did not end ok, and the Atlas root turns'' count, latency and cost. Admin only (public.is_admin(): the flag and an MFA session).';
revoke execute on function public.delegation_overview(integer) from public, anon;
grant  execute on function public.delegation_overview(integer) to authenticated, service_role;

-- ── the account's data inventory states the new table (supabase/tests/23_account_data_center_test.sql) ──
insert into public.account_data_catalog (tbl, written_by, label_en, label_jp, purpose_en, purpose_jp, retention_en, retention_jp) values
  ('ai_delegation_journal', 'intmap',
   'AI research-worker log', 'AIの調査分担の記録',
   'One row per AI question and per research worker it opened: whether it succeeded, how long it took, which model answered, how many tokens it used and what it cost. It holds no question text and no answer. It lets IntMap see why a worker failed after the temporary record of it is gone.',
   'AIの質問1つ、およびそれが調査を任せた子のAI1つにつき1行の記録。成功したか、かかった時間、答えたモデル、使ったトークン数と費用を持ちます。質問の文章も答えも持ちません。一時的な記録が消えたあとでも、子のAIがなぜ失敗したかをIntMapが確かめられるようにします。',
   'Deleted automatically after 30 days, and when you delete your account.',
   '30日後に自動で削除されます。アカウントを削除したときも消えます。')
on conflict (tbl) do update set
  written_by = excluded.written_by, label_en = excluded.label_en, label_jp = excluded.label_jp,
  purpose_en = excluded.purpose_en, purpose_jp = excluded.purpose_jp,
  retention_en = excluded.retention_en, retention_jp = excluded.retention_jp;
