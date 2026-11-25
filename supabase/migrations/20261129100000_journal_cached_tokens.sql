-- ============================================================================
--  (atlas-orchestration-efficiency) THE JOURNAL SAYS HOW MUCH OF EACH CALL THE PROVIDER'S CACHE SERVED
--
--  Observation — public.ai_turns, one week to 2026-11-25: 24% of all input tokens were served from the provider's cache, and the
--  share fell with the length of the turn (30-call turns ~15%). ai_turns only has the turn's total; the journal has the call, but
--  its `input_tokens` is the whole prompt and said nothing of how much of it was a cache hit — so WHICH call of a turn missed the
--  cache (the first after a pause, the one after a search, a step after the history was rewritten) could not be told.
--  `cached_tokens` is the cache read of THAT call (usageMeter.cached_read). 0 = none served or not reported.
--  Expires — when the cause of the low rate is found and fixed; the column stays (it is what shows the fix held).
-- ============================================================================
alter table public.ai_delegation_journal add column if not exists cached_tokens integer not null default 0;

-- the one writer, with the new argument LAST and defaulted: the version of ai-proxy still running while this migrates (13 arguments)
-- keeps writing rows, and the next one writes 14.
drop function if exists public.log_ai_delegation(uuid, text, text, text, text, text, integer, text, integer, integer, integer, bigint, boolean);
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
  p_cached        integer default 0
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ai_delegation_journal
    (user_id, root_key, child_key, task, outcome, code, http_status, model, latency_ms, input_tokens, output_tokens, cost_micros, web, cached_tokens)
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
     greatest(0, coalesce(p_cached, 0)));
  return true;
end;
$$;
comment on function public.log_ai_delegation(uuid, text, text, text, text, text, integer, text, integer, integer, integer, bigint, boolean, integer) is
  '(atlas-delegation) Append one journal row for a worker call or an Atlas root turn. Written only by ai-proxy, best-effort. p_cached is the call''s provider cache read in tokens.';
revoke execute on function public.log_ai_delegation(uuid, text, text, text, text, text, integer, text, integer, integer, integer, bigint, boolean, integer) from public, anon, authenticated;
grant  execute on function public.log_ai_delegation(uuid, text, text, text, text, text, integer, text, integer, integer, integer, bigint, boolean, integer) to service_role;
