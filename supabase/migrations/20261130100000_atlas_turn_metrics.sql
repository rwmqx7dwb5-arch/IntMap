-- ============================================================================
--  (atlas-verify-metrics) ATLAS TURN METRICS — one row per finished Atlas answer: how long, what it cost, how it went.
--
--  WHY.  The quality of an answer is a person's judgement (production auto-evaluation is frozen). What a machine CAN measure without an
--  opinion is the time and money, so that a change to how Atlas works can be compared on those while a person keeps judging answers.
--  ai_delegation_journal already has one row per MODEL CALL (latency, tokens, cache, cost). It has nothing per ANSWER: the wait for the
--  first useful result, whether the turn declared itself complete, how many operations were repeats, how many claims carried a source,
--  how many were decided by a program rather than a model. This table is that row. It is joined to the journal by turn_key
--  (= ai_delegation_journal.root_key), which is how a child's contribution and the slowest path of a turn are read.
--
--  WHAT IT HOLDS: counts and milliseconds. No question, no answer, no place name, no URL. Written by the page, for its own account,
--  through log_atlas_turn_metrics (SECURITY DEFINER; the user is auth.uid(), never an argument). Every value is clamped; a row is
--  written once per (account, turn) — a replay is a no-op.
--  NOT A LIMIT: nothing reads this table to refuse a request (CONSTITUTION.md §5). It is a record.
--  RETENTION: 90 days (pg_cron, like the journal's). Observation — a comparison of two weeks of changes needs the older week still there;
--  the journal's 30 days is too short for the per-answer comparison. Expires — change the argument below and in the purge function together.
-- ============================================================================
create table if not exists public.atlas_turn_metrics (
  id                    bigint      generated always as identity primary key,
  user_id               uuid        not null references auth.users(id) on delete cascade,
  turn_key              text        not null check (char_length(turn_key) between 1 and 120),
  total_ms              integer     not null default 0,
  first_useful_ms       integer,                                    -- NULL: no operation produced a result
  model_calls           integer     not null default 0,
  model_ms              integer     not null default 0,
  tool_ms               integer     not null default 0,
  cost_micros           bigint      not null default 0,
  cost_known            boolean     not null default false,         -- false: some call did not report its cost, so cost_micros is a floor
  delegated_cost_micros bigint      not null default 0,
  delegated_tasks       integer     not null default 0,
  completion            text        not null default 'none' check (completion in ('complete', 'partial', 'none')),
  stopped               text        not null default '' check (char_length(stopped) <= 40),
  ops_asked             integer     not null default 0,
  ops_executed          integer     not null default 0,
  ops_reused            integer     not null default 0,             -- an identical earlier call answered again (what check:atlasrepeat is about)
  ops_rejected          integer     not null default 0,
  ops_unknown_tool      integer     not null default 0,             -- asked for a tool/capability that does not exist
  claims_total          integer     not null default 0,
  claims_grounded       integer     not null default 0,             -- of those, the ones that carry a source
  verify_program        integer     not null default 0,             -- claims decided by a program check
  verify_model          integer     not null default 0,             -- claims decided by a checking worker
  verify_unchecked      integer     not null default 0,
  critical_tool         text        not null default '' check (char_length(critical_tool) <= 80),
  critical_ms           integer     not null default 0,
  created_at            timestamptz not null default now(),
  unique (user_id, turn_key)
);
comment on table public.atlas_turn_metrics is
  '(atlas-verify-metrics) One row per finished Atlas answer: wait, cost, completion, repeated operations, grounded claims, program- vs model-decided checks. Counts and milliseconds only. Written by the page through log_atlas_turn_metrics; the owner reads their own rows; atlas_metrics_overview aggregates for the administrator console. Kept 90 days.';
create index if not exists atlas_turn_metrics_created_idx on public.atlas_turn_metrics (created_at);

alter table public.atlas_turn_metrics enable row level security;
revoke all on public.atlas_turn_metrics from public, anon, authenticated;
grant select on public.atlas_turn_metrics to authenticated;
grant all    on public.atlas_turn_metrics to service_role;
drop policy if exists atlas_turn_metrics_owner_select on public.atlas_turn_metrics;
create policy atlas_turn_metrics_owner_select on public.atlas_turn_metrics
  for select to authenticated using ((select auth.uid()) = user_id);

-- ── the writer ───────────────────────────────────────────────────────────────
create or replace function public.log_atlas_turn_metrics(p_turn text, p_row jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  r jsonb := coalesce(p_row, '{}'::jsonb);
begin
  if v_user is null or coalesce(btrim(p_turn), '') = '' then return false; end if;
  insert into public.atlas_turn_metrics
    (user_id, turn_key, total_ms, first_useful_ms, model_calls, model_ms, tool_ms, cost_micros, cost_known, delegated_cost_micros, delegated_tasks,
     completion, stopped, ops_asked, ops_executed, ops_reused, ops_rejected, ops_unknown_tool, claims_total, claims_grounded,
     verify_program, verify_model, verify_unchecked, critical_tool, critical_ms)
  values
    (v_user, left(btrim(p_turn), 120),
     least(greatest(coalesce((r->>'total_ms')::numeric, 0), 0), 86400000)::integer,
     case when r->>'first_useful_ms' is null then null else least(greatest((r->>'first_useful_ms')::numeric, 0), 86400000)::integer end,
     least(greatest(coalesce((r->>'model_calls')::numeric, 0), 0), 100000)::integer,
     least(greatest(coalesce((r->>'model_ms')::numeric, 0), 0), 86400000)::integer,
     least(greatest(coalesce((r->>'tool_ms')::numeric, 0), 0), 86400000)::integer,
     least(greatest(coalesce((r->>'cost_micros')::numeric, 0), 0), 100000000000)::bigint,
     coalesce((r->>'cost_known')::boolean, false),
     least(greatest(coalesce((r->>'delegated_cost_micros')::numeric, 0), 0), 100000000000)::bigint,
     least(greatest(coalesce((r->>'delegated_tasks')::numeric, 0), 0), 100000)::integer,
     case when r->>'completion' in ('complete', 'partial') then r->>'completion' else 'none' end,
     left(coalesce(r->>'stopped', ''), 40),
     least(greatest(coalesce((r->>'ops_asked')::numeric, 0), 0), 1000000)::integer,
     least(greatest(coalesce((r->>'ops_executed')::numeric, 0), 0), 1000000)::integer,
     least(greatest(coalesce((r->>'ops_reused')::numeric, 0), 0), 1000000)::integer,
     least(greatest(coalesce((r->>'ops_rejected')::numeric, 0), 0), 1000000)::integer,
     least(greatest(coalesce((r->>'ops_unknown_tool')::numeric, 0), 0), 1000000)::integer,
     least(greatest(coalesce((r->>'claims_total')::numeric, 0), 0), 1000000)::integer,
     least(greatest(coalesce((r->>'claims_grounded')::numeric, 0), 0), 1000000)::integer,
     least(greatest(coalesce((r->>'verify_program')::numeric, 0), 0), 1000000)::integer,
     least(greatest(coalesce((r->>'verify_model')::numeric, 0), 0), 1000000)::integer,
     least(greatest(coalesce((r->>'verify_unchecked')::numeric, 0), 0), 1000000)::integer,
     left(coalesce(r->>'critical_tool', ''), 80),
     least(greatest(coalesce((r->>'critical_ms')::numeric, 0), 0), 86400000)::integer)
  on conflict (user_id, turn_key) do nothing;
  return true;
exception when others then
  return false;   -- best-effort: a record that cannot be written is never a failed answer
end;
$$;
comment on function public.log_atlas_turn_metrics(text, jsonb) is
  '(atlas-verify-metrics) Append the metrics row of one finished Atlas answer for the calling account (once per turn key; clamped; best-effort).';
revoke execute on function public.log_atlas_turn_metrics(text, jsonb) from public, anon;
grant  execute on function public.log_atlas_turn_metrics(text, jsonb) to authenticated, service_role;

-- ── retention ────────────────────────────────────────────────────────────────
create or replace function public.purge_atlas_turn_metrics(p_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  delete from public.atlas_turn_metrics m where m.created_at < now() - make_interval(days => greatest(1, coalesce(p_days, 90)));
  get diagnostics n = row_count;
  return n;
end;
$$;
comment on function public.purge_atlas_turn_metrics(integer) is
  '(atlas-verify-metrics) Delete metrics rows older than p_days (default 90). Scheduled daily as pg_cron job atlas-turn-metrics-purge.';
revoke execute on function public.purge_atlas_turn_metrics(integer) from public, anon, authenticated;
grant  execute on function public.purge_atlas_turn_metrics(integer) to service_role;

do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron is not installed here — skipping the atlas-turn-metrics-purge schedule';
    return;
  end if;
  perform cron.schedule('atlas-turn-metrics-purge', '37 3 * * *', 'select public.purge_atlas_turn_metrics(90)');
end $$;

-- ── the administrator's read: ONE window, comparable with another window ─────
--  atlas_metrics_overview(p_from, p_to) → jsonb. To compare a change, call it twice (the week before, the week after) and put the
--  two side by side (scripts/atlas-metrics-report.mjs does). Every ratio is NULL when its denominator is 0 — «nothing measured» is
--  not a result. The window is clamped to 90 days.
--    turns       the per-answer figures (atlas_turn_metrics)
--    calls       the per-model-call figures (ai_delegation_journal, 30-day retention): the provider's cache rate, latency
--    children    each child model's contribution: calls, ok, share of the children's cost and of their waiting time
--    families    the critical path: for a turn that delegated, how much of the turn's wait the slowest child was
create or replace function public.atlas_metrics_overview(p_from timestamptz default null, p_to timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_to   timestamptz := coalesce(p_to, now());
  v_from timestamptz := greatest(coalesce(p_from, coalesce(p_to, now()) - interval '7 days'), coalesce(p_to, now()) - interval '90 days');
  v_out  jsonb;
begin
  if not public.is_admin() then raise exception 'not authorised'; end if;
  select jsonb_build_object(
    'from', v_from, 'to', v_to,
    'turns', (
      select jsonb_build_object(
        'turns', count(*)::int,
        'total_ms_p50', round(percentile_cont(0.5) within group (order by m.total_ms))::int,
        'total_ms_p90', round(percentile_cont(0.9) within group (order by m.total_ms))::int,
        'first_useful_ms_p50', round((percentile_cont(0.5) within group (order by m.first_useful_ms)))::int,
        'first_useful_ms_p90', round((percentile_cont(0.9) within group (order by m.first_useful_ms)))::int,
        'completion_rate', (count(*) filter (where m.completion = 'complete'))::numeric / nullif(count(*), 0),
        'cost_per_success_micros', (sum(m.cost_micros) filter (where m.completion = 'complete' and m.cost_known))::numeric / nullif(count(*) filter (where m.completion = 'complete' and m.cost_known), 0),
        'cost_per_turn_micros', (sum(m.cost_micros) filter (where m.cost_known))::numeric / nullif(count(*) filter (where m.cost_known), 0),
        'capability_found_rate', (sum(m.ops_asked) - sum(m.ops_unknown_tool))::numeric / nullif(sum(m.ops_asked), 0),
        'duplicate_op_rate', sum(m.ops_reused)::numeric / nullif(sum(m.ops_asked), 0),
        'grounded_claim_rate', sum(m.claims_grounded)::numeric / nullif(sum(m.claims_total), 0),
        'program_verified_share', sum(m.verify_program)::numeric / nullif(sum(m.verify_program) + sum(m.verify_model), 0),
        'model_wait_share', sum(m.model_ms)::numeric / nullif(sum(m.total_ms), 0),
        'model_calls_per_turn', avg(m.model_calls),
        'critical_tools', coalesce((
          select jsonb_agg(jsonb_build_object('tool', c.tool, 'ms', c.ms, 'turns', c.n) order by c.ms desc)
            from (select x.critical_tool as tool, sum(x.critical_ms)::bigint as ms, count(*)::int as n
                    from public.atlas_turn_metrics x
                   where x.created_at >= v_from and x.created_at < v_to and x.critical_tool <> ''
                   group by 1 order by 2 desc limit 8) c), '[]'::jsonb))
        from public.atlas_turn_metrics m where m.created_at >= v_from and m.created_at < v_to),
    'calls', (
      select jsonb_build_object(
        'calls', count(*)::int,
        'cache_rate', sum(j.cached_tokens)::numeric / nullif(sum(j.input_tokens), 0),
        'root_cache_rate', (sum(j.cached_tokens) filter (where j.child_key is null))::numeric / nullif(sum(j.input_tokens) filter (where j.child_key is null), 0),
        'latency_ms_p50', round(percentile_cont(0.5) within group (order by j.latency_ms))::int,
        'latency_ms_p90', round(percentile_cont(0.9) within group (order by j.latency_ms))::int)
        from public.ai_delegation_journal j where j.created_at >= v_from and j.created_at < v_to),
    'children', coalesce((
      select jsonb_agg(jsonb_build_object('model', c.model, 'calls', c.n, 'ok', c.ok, 'cost_share', c.cost_share, 'wait_share', c.wait_share, 'latency_ms_p50', c.p50) order by c.n desc)
        from (select j.model, count(*)::int as n, (count(*) filter (where j.outcome = 'ok'))::int as ok,
                     sum(j.cost_micros)::numeric / nullif(sum(sum(j.cost_micros)) over (), 0) as cost_share,
                     sum(j.latency_ms)::numeric / nullif(sum(sum(j.latency_ms)) over (), 0) as wait_share,
                     round(percentile_cont(0.5) within group (order by j.latency_ms))::int as p50
                from public.ai_delegation_journal j
               where j.created_at >= v_from and j.created_at < v_to and j.child_key is not null
               group by j.model) c), '[]'::jsonb),
    'families', (
      select jsonb_build_object(
        'delegating_turns', count(*)::int,
        'slowest_child_share_p50', percentile_cont(0.5) within group (order by f.share),
        'children_dominate_rate', (count(*) filter (where f.share > 0.5))::numeric / nullif(count(*), 0))
        from (select least(1, (max(j.latency_ms) filter (where j.child_key is not null))::numeric
                              / nullif(max(j.latency_ms) filter (where j.child_key is null), 0)) as share
                from public.ai_delegation_journal j
               where j.created_at >= v_from and j.created_at < v_to
               group by j.user_id, j.root_key
              having count(*) filter (where j.child_key is not null) > 0 and count(*) filter (where j.child_key is null) > 0) f
       where f.share is not null)
  ) into v_out;
  return v_out;
end;
$$;
comment on function public.atlas_metrics_overview(timestamptz, timestamptz) is
  '(atlas-verify-metrics) Administrator read of the Atlas metrics over [p_from, p_to) (window clamped to 90 days): per-answer figures from atlas_turn_metrics, per-call cache and latency and each child model''s share from ai_delegation_journal, and how much of a delegating turn''s wait the slowest child was. Call it for two windows to compare a change. Admin only.';
revoke execute on function public.atlas_metrics_overview(timestamptz, timestamptz) from public, anon;
grant  execute on function public.atlas_metrics_overview(timestamptz, timestamptz) to authenticated, service_role;

-- ── the account's data inventory states the new table (supabase/tests/23_account_data_center_test.sql) ──
insert into public.account_data_catalog (tbl, written_by, label_en, label_jp, purpose_en, purpose_jp, retention_en, retention_jp) values
  ('atlas_turn_metrics', 'intmap',
   'AI answer timing log', 'AIの回答の所要時間の記録',
   'One row per AI answer: how long it took, what it cost, whether it finished, and how many of its steps were repeats or carried a source. It holds no question text, no answer and no place. It lets IntMap see whether a change made answers faster or cheaper.',
   'AIの回答1つにつき1行の記録。かかった時間、費用、最後まで終えたか、手順のうち繰り返しだったものや出典を持つものの数を持ちます。質問の文章も答えも場所も持ちません。変更で回答が速く・安くなったかをIntMapが確かめるために使います。',
   'Deleted automatically after 90 days, and when you delete your account.',
   '90日後に自動で削除されます。アカウントを削除したときも消えます。')
on conflict (tbl) do update set
  written_by = excluded.written_by, label_en = excluded.label_en, label_jp = excluded.label_jp,
  purpose_en = excluded.purpose_en, purpose_jp = excluded.purpose_jp,
  retention_en = excluded.retention_en, retention_jp = excluded.retention_jp;
