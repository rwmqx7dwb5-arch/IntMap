-- Measure from submission and distinguish a measured family cost from its observed floor.
alter table public.ai_delegation_journal add column if not exists cost_complete boolean;
alter table public.ai_delegation_journal add column if not exists call_id text;
alter table public.atlas_turn_metrics
  add column if not exists pending_delegation boolean not null default false,
  add column if not exists provider_call_ids text[] not null default '{}',
  add column if not exists delegated_model_tasks integer not null default 0;
comment on column public.ai_delegation_journal.cost_complete is 'True when the charged provider token cost was observed, false when only a floor was observed, NULL for older journal writers.';
comment on column public.atlas_turn_metrics.metrics_version is '1: original metrics. 2: visible useful results and source counts. 3: submission-to-display time and reconciled model request accounting.';

drop function if exists public.log_ai_delegation(uuid, text, text, text, text, text, integer, text, integer, integer, integer, bigint, boolean, integer, integer);
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
  p_web           boolean,
  p_cached        integer default 0,
  p_web_searches  integer default 0,
  p_cost_complete boolean default null,
  p_call_id       text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ai_delegation_journal
    (user_id, root_key, child_key, task, outcome, code, http_status, model, latency_ms, input_tokens, output_tokens, cost_micros, web, cached_tokens, web_searches, cost_complete, call_id)
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
     coalesce(p_web, false),
     greatest(0, coalesce(p_cached, 0)),
     greatest(0, coalesce(p_web_searches, 0)),
     p_cost_complete,
     nullif(left(p_call_id, 80), ''));
  return true;
end;
$$;
comment on function public.log_ai_delegation(uuid, text, text, text, text, text, integer, text, integer, integer, integer, bigint, boolean, integer, integer, boolean, text) is
  '(atlas-delegation) Append one journal row for a worker call, an Atlas root turn or a web.search call. Written only by ai-proxy, best-effort. p_cached is the call''s provider cache read in tokens; p_web_searches the searches the provider ran inside it.';
revoke execute on function public.log_ai_delegation(uuid, text, text, text, text, text, integer, text, integer, integer, integer, bigint, boolean, integer, integer, boolean, text) from public, anon, authenticated;
grant  execute on function public.log_ai_delegation(uuid, text, text, text, text, text, integer, text, integer, integer, integer, bigint, boolean, integer, integer, boolean, text) to service_role;

-- Both views use the same family reconciliation. Browser and journal prices overlap within each component.
-- A pending child or a missing journal record can only contribute a floor. Legacy costs remain comparable
-- as observed floors, but their journal had no way to prove all auxiliary calls were covered.
create or replace function public.atlas_cost_observation(m public.atlas_turn_metrics)
returns table(cost bigint, traced boolean, root_calls bigint)
language sql
stable
set search_path = ''
as $$
  select
    (case when m.metrics_version < 3 then greatest(m.cost_micros, coalesce(j.total, 0))
         else greatest(m.cost_micros - m.delegated_cost_micros, coalesce(j.roots, 0))
            + greatest(m.delegated_cost_micros, coalesce(j.children, 0)) end)::bigint as cost,
    m.metrics_version >= 3
       and m.model_calls > 0
       and cardinality(m.provider_call_ids) = m.model_calls
       and m.provider_call_ids <@ coalesce(j.call_ids, '{}'::text[])
       and j.complete
       and not m.pending_delegation
       and j.child_tasks >= m.delegated_model_tasks
       and coalesce(j.total, 0) >= m.cost_micros as traced,
    j.primary_calls as root_calls
  from (
    select sum(x.cost_micros) as total,
           sum(x.cost_micros) filter (where x.child_key is null) as roots,
           sum(x.cost_micros) filter (where x.child_key is not null) as children,
           count(*) filter (where x.child_key is null) as primary_calls,
           array_agg(distinct x.call_id) filter (where x.child_key is null and x.call_id is not null) as call_ids,
           count(distinct x.child_key) as child_tasks,
           coalesce(bool_and(x.cost_complete is true), false) as complete
      from public.ai_delegation_journal x
     where x.user_id = m.user_id and x.root_key = m.turn_key
  ) j;
$$;
revoke execute on function public.atlas_cost_observation(public.atlas_turn_metrics) from public, anon, authenticated;

-- A production comparison reads the journal as the experiment's signed-in owner.
create or replace function public.atlas_turn_accounting(p_turn text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('cost_micros', case when c.traced or c.cost > 0 then c.cost end, 'cost_known', c.traced, 'root_calls', c.root_calls)
    from public.atlas_turn_metrics m
    cross join lateral public.atlas_cost_observation(m) c
   where m.user_id = auth.uid() and m.turn_key = p_turn and m.metrics_version >= 3;
$$;
revoke execute on function public.atlas_turn_accounting(text) from public, anon;
grant execute on function public.atlas_turn_accounting(text) to authenticated;

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
     metrics_version, useful_shown, claims_cited, claims_evidenced, claims_backing, task_key, evidence_arrived_ms, evidence_used_ms, pending_delegation, provider_call_ids, delegated_model_tasks)
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
     case when r ? 'pending_delegation' then 3 when r ? 'useful_shown' then 2 else 1 end,
     coalesce((r->>'useful_shown')::boolean, false),
     least(greatest(coalesce((r->>'claims_cited')::numeric, 0), 0), 1000000)::integer,
     least(greatest(coalesce((r->>'claims_evidenced')::numeric, 0), 0), 1000000)::integer,
     least(greatest(coalesce((r->>'claims_backing')::numeric, 0), 0), 1000000)::integer,
     nullif(left(btrim(coalesce(r->>'task_key', '')), 120), ''),
     case when r->>'evidence_arrived_ms' is null then null else least(greatest((r->>'evidence_arrived_ms')::numeric, 0), 86400000)::integer end,
     case when r->>'evidence_used_ms' is null then null else least(greatest((r->>'evidence_used_ms')::numeric, 0), 86400000)::integer end,
     coalesce((r->>'pending_delegation')::boolean, false),
     array(select distinct id from jsonb_array_elements_text(coalesce(r->'provider_call_ids', '[]'::jsonb)) as call_ids(id)
            where id ~ '^[a-zA-Z0-9-]{1,80}$' limit 1000),
     least(greatest(coalesce((r->>'delegated_model_tasks')::numeric, 0), 0), 100000)::integer)
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
           c.cost, c.traced
      from public.atlas_turn_metrics m
      cross join lateral public.atlas_cost_observation(m) c
     where m.created_at > v_from and m.created_at <= v_to
  ), k as (
    select user_id, task, sum(cost) as cost, bool_or(won) as won, bool_and(traced) as traced
      from t group by user_id, task
  )
  select jsonb_build_object(
    'attempts', (select count(*) from t)::int,
    'tasks', count(*)::int,
    'successes', (count(*) filter (where won))::int,
    'all_attempts_cost_micros', coalesce(sum(cost), 0)::bigint,
    'per_success_micros', case when bool_and(traced) then sum(cost)::numeric / nullif(count(*) filter (where won), 0) end,
    'per_success_observed_micros', sum(cost)::numeric / nullif(count(*) filter (where won), 0),
    'traced_rate', (select (count(*) filter (where traced))::numeric / nullif(count(*), 0) from t))
    into v_cost from k;

  select jsonb_build_object(
    'from', v_from, 'to', v_to,
    'turns', (
      select jsonb_build_object(
        'turns', count(*)::int,
        'total_ms_p50', round(percentile_cont(0.5) within group (order by m.total_ms) filter (where m.metrics_version >= 3))::int,
        'total_ms_p90', round(percentile_cont(0.9) within group (order by m.total_ms) filter (where m.metrics_version >= 3))::int,
        'first_useful_ms_p50', round((percentile_cont(0.5) within group (order by m.first_useful_ms) filter (where m.metrics_version >= 3 and m.useful_shown)))::int,
        'first_useful_ms_p90', round((percentile_cont(0.9) within group (order by m.first_useful_ms) filter (where m.metrics_version >= 3 and m.useful_shown)))::int,
        'no_useful_turns', (count(*) filter (where m.metrics_version >= 3 and not m.useful_shown))::int,
        'no_useful_rate', (count(*) filter (where m.metrics_version >= 3 and not m.useful_shown))::numeric / nullif(count(*) filter (where m.metrics_version >= 3), 0),
        'evidence_to_use_ms_p50', round((percentile_cont(0.5) within group (order by m.evidence_used_ms - m.evidence_arrived_ms) filter (where m.evidence_used_ms is not null and m.evidence_arrived_ms is not null and m.evidence_used_ms >= m.evidence_arrived_ms)))::int,
        'completion_rate', (count(*) filter (where m.completion = 'complete'))::numeric / nullif(count(*), 0),
        'cost_per_turn_micros', (sum(c.cost) filter (where c.traced))::numeric / nullif(count(*) filter (where c.traced), 0),
        'capability_found_rate', (sum(m.ops_asked) - sum(m.ops_unknown_tool))::numeric / nullif(sum(m.ops_asked), 0),
        'duplicate_op_rate', sum(m.ops_reused)::numeric / nullif(sum(m.ops_asked), 0),
        'grounded_claim_rate', sum(m.claims_grounded)::numeric / nullif(sum(m.claims_total), 0),
        'cited_claim_rate', (sum(m.claims_cited) filter (where m.metrics_version >= 2))::numeric / nullif(sum(m.claims_total) filter (where m.metrics_version >= 2), 0),
        'evidenced_claim_rate', (sum(m.claims_evidenced) filter (where m.metrics_version >= 2))::numeric / nullif(sum(m.claims_total) filter (where m.metrics_version >= 2), 0),
        'backing_claim_rate', (sum(m.claims_backing) filter (where m.metrics_version >= 2))::numeric / nullif(sum(m.claims_total) filter (where m.metrics_version >= 2), 0),
        'program_verified_share', sum(m.verify_program)::numeric / nullif(sum(m.verify_program) + sum(m.verify_model), 0),
        'model_wait_share', (sum(m.model_ms) filter (where m.metrics_version >= 3))::numeric / nullif(sum(m.total_ms) filter (where m.metrics_version >= 3), 0),
        'model_calls_per_turn', avg(m.model_calls),
        'critical_tools', coalesce((
          select jsonb_agg(jsonb_build_object('tool', c.tool, 'ms', c.ms, 'turns', c.n) order by c.ms desc)
            from (select x.critical_tool as tool, sum(x.critical_ms)::bigint as ms, count(*)::int as n
                    from public.atlas_turn_metrics x
                   where x.created_at > v_from and x.created_at <= v_to and x.critical_tool <> ''
                   group by 1 order by 2 desc limit 8) c), '[]'::jsonb))
        from public.atlas_turn_metrics m cross join lateral public.atlas_cost_observation(m) c where m.created_at > v_from and m.created_at <= v_to),
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
