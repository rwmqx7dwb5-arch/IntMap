-- ============================================================================
--  (atlas-search-evidence-store) THE JOURNAL SAYS HOW MANY SEARCHES RAN INSIDE EACH CALL
--
--  Observation — public.ai_delegation_journal, 2026-11-18 → 25: of 479 parent calls 56% carried a web search (`web`), a call that
--  searched took 8–36 s and one that did not 2–3 s. `web` is a yes/no: it could not say whether a slow call ran one search or six, and
--  the hosted search runs its queries one after another inside the provider's call, so the count is what the time is made of.
--  `web_searches` is the number the provider reported for THAT call (ai-proxy meta.webSearches); 0 = none ran or none reported.
--  Expires — the column stays: it is what shows the search-evidence store (js/atlas-web-evidence.js) took repeated searches away.
-- ============================================================================
alter table public.ai_delegation_journal add column if not exists web_searches integer not null default 0;

-- the one writer, with the new argument LAST and defaulted: the version of ai-proxy still running while this migrates (14 arguments)
-- keeps writing rows, and the next one writes 15.
drop function if exists public.log_ai_delegation(uuid, text, text, text, text, text, integer, text, integer, integer, integer, bigint, boolean, integer);
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
  p_web_searches  integer default 0
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ai_delegation_journal
    (user_id, root_key, child_key, task, outcome, code, http_status, model, latency_ms, input_tokens, output_tokens, cost_micros, web, cached_tokens, web_searches)
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
     greatest(0, coalesce(p_web_searches, 0)));
  return true;
end;
$$;
comment on function public.log_ai_delegation(uuid, text, text, text, text, text, integer, text, integer, integer, integer, bigint, boolean, integer, integer) is
  '(atlas-delegation) Append one journal row for a worker call, an Atlas root turn or a web.search call. Written only by ai-proxy, best-effort. p_cached is the call''s provider cache read in tokens; p_web_searches the searches the provider ran inside it.';
revoke execute on function public.log_ai_delegation(uuid, text, text, text, text, text, integer, text, integer, integer, integer, bigint, boolean, integer, integer) from public, anon, authenticated;
grant  execute on function public.log_ai_delegation(uuid, text, text, text, text, text, integer, text, integer, integer, integer, bigint, boolean, integer, integer) to service_role;
