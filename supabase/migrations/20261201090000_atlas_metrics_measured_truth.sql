-- ============================================================================
--  (atlas-evidence-to-child-metrics) ATLAS TURN METRICS, MEASURED ON WHAT HAPPENED
--
--  20261130110000_atlas_turn_metrics.sql measured three things by a definition that did not hold up on fixed inputs:
--    first_useful_ms   0 s for a turn with no operation at all that took 8 s; 4.2 s "useful" for a plan written after a failed operation.
--                      It is now the wait from SENDING to the first usable value, table or map actually SHOWN; NULL (and useful_shown = false)
--                      when nothing was - counted apart, never as a short wait.
--    claims_grounded   a finding that names an outlet and holds nothing the source says was 0 for the worker and 1 for the answer's tally.
--                      One judgement now (js/atlas-job-core.js findingBasis); the row keeps THREE counts: cited / evidenced / backing the final answer.
--                      claims_grounded stays, equal to claims_evidenced.
--    cost per success  averaged the cost of COMPLETED turns whose cost was known: failed and repeated attempts, and the parallel searches' own calls,
--                      were missing. It is now every attempt's whole family in ai_delegation_journal (parent, workers and searches share the root key =
--                      turn_key) summed over a task (task_key: the same request asked again after an unfinished try), divided by the tasks that
--                      succeeded; cost.traced_rate says how much of it was actually priced.
--  Also two optional moments for the work on how soon the parent uses what was gathered: evidence_arrived_ms and evidence_used_ms
--  (js/atlas-turn-metrics.js markTurn). Rows written before this migration are metrics_version 1: their old figures stay, and are left out of the
--  new ones (a figure with the old meaning must not be averaged with the new).
-- ============================================================================
alter table public.atlas_turn_metrics
  add column if not exists metrics_version      smallint not null default 1,
  add column if not exists useful_shown         boolean  not null default false,
  add column if not exists claims_cited         integer  not null default 0,
  add column if not exists claims_evidenced     integer  not null default 0,
  add column if not exists claims_backing       integer  not null default 0,
  add column if not exists task_key             text     check (task_key is null or char_length(task_key) between 1 and 120),
  add column if not exists evidence_arrived_ms  integer,
  add column if not exists evidence_used_ms     integer;
comment on column public.atlas_turn_metrics.metrics_version is '1: measured by the first definitions (first_useful_ms by the step after an operation; grounded = names a source). 2: first_useful_ms is the first usable thing SHOWN, claims are cited/evidenced/backing, task_key and the evidence moments exist.';
create index if not exists atlas_turn_metrics_task_idx on public.atlas_turn_metrics (user_id, task_key);

-- the writer
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
     verify_program, verify_model, verify_unchecked, critical_tool, critical_ms,
     metrics_version, useful_shown, claims_cited, claims_evidenced, claims_backing, task_key, evidence_arrived_ms, evidence_used_ms)
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
     least(greatest(coalesce((r->>'critical_ms')::numeric, 0), 0), 86400000)::integer,
     case when r ? 'useful_shown' then 2 else 1 end,
     coalesce((r->>'useful_shown')::boolean, false),
     least(greatest(coalesce((r->>'claims_cited')::numeric, 0), 0), 1000000)::integer,
     least(greatest(coalesce((r->>'claims_evidenced')::numeric, 0), 0), 1000000)::integer,
     least(greatest(coalesce((r->>'claims_backing')::numeric, 0), 0), 1000000)::integer,
     nullif(left(btrim(coalesce(r->>'task_key', '')), 120), ''),
     case when r->>'evidence_arrived_ms' is null then null else least(greatest((r->>'evidence_arrived_ms')::numeric, 0), 86400000)::integer end,
     case when r->>'evidence_used_ms' is null then null else least(greatest((r->>'evidence_used_ms')::numeric, 0), 86400000)::integer end)
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

-- the administrator's read
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
  v_cost jsonb;
begin
  if not public.is_admin() then raise exception 'not authorised'; end if;
  -- what one success cost: EVERY attempt at the same task (the failed and repeated ones), each attempt's whole family in the journal
  -- (the parent's calls, the workers', and the parallel searches, which share its root key), over the tasks that succeeded.
  with t as (
    select m.user_id, coalesce(m.task_key, m.turn_key) as task, (m.completion = 'complete') as won,
           case when coalesce(j.n, 0) > 0 then coalesce(j.cost, 0) else m.cost_micros end as cost,
           case when coalesce(j.n, 0) > 0 then j.unpriced = 0 else m.cost_known end as traced
      from public.atlas_turn_metrics m
      left join lateral (select count(*) as n, sum(x.cost_micros) as cost, count(*) filter (where x.cost_micros is null) as unpriced
                           from public.ai_delegation_journal x where x.user_id = m.user_id and x.root_key = m.turn_key) j on true
     where m.created_at > v_from and m.created_at <= v_to
  ), k as (
    select user_id, task, sum(cost) as cost, bool_or(won) as won
      from t group by user_id, task
  )
  select jsonb_build_object(
    'attempts', (select count(*) from t)::int,
    'tasks', count(*)::int,
    'successes', (count(*) filter (where won))::int,
    'all_attempts_cost_micros', coalesce(sum(cost), 0)::bigint,
    'per_success_micros', sum(cost)::numeric / nullif(count(*) filter (where won), 0),
    'traced_rate', (select (count(*) filter (where traced))::numeric / nullif(count(*), 0) from t))
    into v_cost from k;

  select jsonb_build_object(
    'from', v_from, 'to', v_to,
    'turns', (
      select jsonb_build_object(
        'turns', count(*)::int,
        'total_ms_p50', round(percentile_cont(0.5) within group (order by m.total_ms))::int,
        'total_ms_p90', round(percentile_cont(0.9) within group (order by m.total_ms))::int,
        'first_useful_ms_p50', round((percentile_cont(0.5) within group (order by m.first_useful_ms) filter (where m.metrics_version >= 2 and m.useful_shown)))::int,
        'first_useful_ms_p90', round((percentile_cont(0.9) within group (order by m.first_useful_ms) filter (where m.metrics_version >= 2 and m.useful_shown)))::int,
        'no_useful_turns', (count(*) filter (where m.metrics_version >= 2 and not m.useful_shown))::int,
        'no_useful_rate', (count(*) filter (where m.metrics_version >= 2 and not m.useful_shown))::numeric / nullif(count(*) filter (where m.metrics_version >= 2), 0),
        'evidence_to_use_ms_p50', round((percentile_cont(0.5) within group (order by m.evidence_used_ms - m.evidence_arrived_ms) filter (where m.evidence_used_ms is not null and m.evidence_arrived_ms is not null and m.evidence_used_ms >= m.evidence_arrived_ms)))::int,
        'completion_rate', (count(*) filter (where m.completion = 'complete'))::numeric / nullif(count(*), 0),
        'cost_per_turn_micros', (sum(m.cost_micros) filter (where m.cost_known))::numeric / nullif(count(*) filter (where m.cost_known), 0),
        'capability_found_rate', (sum(m.ops_asked) - sum(m.ops_unknown_tool))::numeric / nullif(sum(m.ops_asked), 0),
        'duplicate_op_rate', sum(m.ops_reused)::numeric / nullif(sum(m.ops_asked), 0),
        'grounded_claim_rate', sum(m.claims_grounded)::numeric / nullif(sum(m.claims_total), 0),
        'cited_claim_rate', (sum(m.claims_cited) filter (where m.metrics_version >= 2))::numeric / nullif(sum(m.claims_total) filter (where m.metrics_version >= 2), 0),
        'evidenced_claim_rate', (sum(m.claims_evidenced) filter (where m.metrics_version >= 2))::numeric / nullif(sum(m.claims_total) filter (where m.metrics_version >= 2), 0),
        'backing_claim_rate', (sum(m.claims_backing) filter (where m.metrics_version >= 2))::numeric / nullif(sum(m.claims_total) filter (where m.metrics_version >= 2), 0),
        'program_verified_share', sum(m.verify_program)::numeric / nullif(sum(m.verify_program) + sum(m.verify_model), 0),
        'model_wait_share', sum(m.model_ms)::numeric / nullif(sum(m.total_ms), 0),
        'model_calls_per_turn', avg(m.model_calls),
        'critical_tools', coalesce((
          select jsonb_agg(jsonb_build_object('tool', c.tool, 'ms', c.ms, 'turns', c.n) order by c.ms desc)
            from (select x.critical_tool as tool, sum(x.critical_ms)::bigint as ms, count(*)::int as n
                    from public.atlas_turn_metrics x
                   where x.created_at > v_from and x.created_at <= v_to and x.critical_tool <> ''
                   group by 1 order by 2 desc limit 8) c), '[]'::jsonb))
        from public.atlas_turn_metrics m where m.created_at > v_from and m.created_at <= v_to),
    'calls', (
      select jsonb_build_object(
        'calls', count(*)::int,
        'cache_rate', sum(j.cached_tokens)::numeric / nullif(sum(j.input_tokens), 0),
        'root_cache_rate', (sum(j.cached_tokens) filter (where j.child_key is null))::numeric / nullif(sum(j.input_tokens) filter (where j.child_key is null), 0),
        'latency_ms_p50', round(percentile_cont(0.5) within group (order by j.latency_ms))::int,
        'latency_ms_p90', round(percentile_cont(0.9) within group (order by j.latency_ms))::int)
        from public.ai_delegation_journal j where j.created_at > v_from and j.created_at <= v_to),
    'children', coalesce((
      select jsonb_agg(jsonb_build_object('model', c.model, 'calls', c.n, 'ok', c.ok, 'cost_share', c.cost_share, 'wait_share', c.wait_share, 'latency_ms_p50', c.p50) order by c.n desc)
        from (select j.model, count(*)::int as n, (count(*) filter (where j.outcome = 'ok'))::int as ok,
                     sum(j.cost_micros)::numeric / nullif(sum(sum(j.cost_micros)) over (), 0) as cost_share,
                     sum(j.latency_ms)::numeric / nullif(sum(sum(j.latency_ms)) over (), 0) as wait_share,
                     round(percentile_cont(0.5) within group (order by j.latency_ms))::int as p50
                from public.ai_delegation_journal j
               where j.created_at > v_from and j.created_at <= v_to and j.child_key is not null
               group by j.model) c), '[]'::jsonb),
    'families', (
      select jsonb_build_object(
        'delegating_turns', count(*)::int,
        'slowest_child_share_p50', percentile_cont(0.5) within group (order by f.share),
        'children_dominate_rate', (count(*) filter (where f.share > 0.5))::numeric / nullif(count(*), 0))
        from (select least(1, (max(j.latency_ms) filter (where j.child_key is not null))::numeric
                              / nullif(max(j.latency_ms) filter (where j.child_key is null), 0)) as share
                from public.ai_delegation_journal j
               where j.created_at > v_from and j.created_at <= v_to
               group by j.user_id, j.root_key
              having count(*) filter (where j.child_key is not null) > 0 and count(*) filter (where j.child_key is null) > 0) f
       where f.share is not null)
  ) into v_out;
  v_out := jsonb_set(v_out, '{turns,cost_per_success_micros}', coalesce(v_cost -> 'per_success_micros', 'null'::jsonb), true) || jsonb_build_object('cost', v_cost);
  return v_out;
end;
$$;
comment on function public.atlas_metrics_overview(timestamptz, timestamptz) is
  '(atlas-verify-metrics) Administrator read of the Atlas metrics over [p_from, p_to) (window clamped to 90 days): per-answer figures from atlas_turn_metrics, per-call cache and latency and each child model''s share from ai_delegation_journal, and how much of a delegating turn''s wait the slowest child was. Call it for two windows to compare a change. Admin only.';
revoke execute on function public.atlas_metrics_overview(timestamptz, timestamptz) from public, anon;
grant  execute on function public.atlas_metrics_overview(timestamptz, timestamptz) to authenticated, service_role;
