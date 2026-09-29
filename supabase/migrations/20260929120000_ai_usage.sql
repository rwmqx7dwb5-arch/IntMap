-- ============================================================================
--  ai-one-ledger — WHAT AN AI CALL COST, IN THE LEDGER THAT ALREADY COUNTS IT
-- ----------------------------------------------------------------------------
--  The turn ledger (public.ai_turns, #R318/#R801) and the daily counter (public.ai_usage) count
--  REQUESTS: one use per turn, a bounded number of calls per turn. Neither held what those requests
--  COST — a provider bills tokens, and no function read the provider's usage block (audit,
--  2026-09-29). So «what did one Atlas turn cost» and «is the prompt cache being hit» had no answer
--  anywhere, and the next decision about caching or models would have been a guess.
--
--  This adds the four numbers every provider reports, normalised by supabase/functions/_shared/
--  ai-usage.js, to the two rows that already exist:
--    · public.ai_usage  (account × day) — the durable record. ai_turns is a scratch pad swept after a
--                                         day and deleted on refund; ai_usage is kept.
--    · public.ai_turns  (account × turn) — the per-turn cost while the turn row lives.
--  and ONE writer, record_ai_usage, called by ai-proxy and monitor-run after the provider answers.
--
--  ⚠ NON-DESTRUCTIVE. Columns are added with a default of 0; no existing row, function signature or
--  grant changes. `count` (the allowance) is untouched by the writer: recording a cost never spends
--  or refunds a use — the developer's calls, which consume no use, are recorded too.
--  ⚠ WHAT THE COLUMNS MEAN (the same words as _shared/ai-usage.js):
--    input_tokens        read at the full input price (cache reads and writes NOT included)
--    cached_read_tokens  served from the provider's prompt cache
--    cache_write_tokens  written into the cache (Anthropic prices the write; OpenAI/Gemini report 0)
--    output_tokens       generated, reasoning included
--    provider_calls      provider answers read (fallback steps and retries included)
--    unmetered_calls     among those, answers that carried no usage block — so a total is never read
--                        as complete when part of it was not reported
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
--  1. THE COLUMNS
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.ai_usage add column if not exists input_tokens       bigint  not null default 0;
alter table public.ai_usage add column if not exists cached_read_tokens bigint  not null default 0;
alter table public.ai_usage add column if not exists cache_write_tokens bigint  not null default 0;
alter table public.ai_usage add column if not exists output_tokens      bigint  not null default 0;
alter table public.ai_usage add column if not exists provider_calls     integer not null default 0;
alter table public.ai_usage add column if not exists unmetered_calls    integer not null default 0;

alter table public.ai_turns add column if not exists input_tokens       bigint  not null default 0;
alter table public.ai_turns add column if not exists cached_read_tokens bigint  not null default 0;
alter table public.ai_turns add column if not exists cache_write_tokens bigint  not null default 0;
alter table public.ai_turns add column if not exists output_tokens      bigint  not null default 0;
alter table public.ai_turns add column if not exists provider_calls     integer not null default 0;
alter table public.ai_turns add column if not exists unmetered_calls    integer not null default 0;

comment on column public.ai_usage.input_tokens is
  'Provider tokens read at the full input price this day (cache reads/writes excluded). Written only by record_ai_usage.';
comment on column public.ai_usage.cached_read_tokens is
  'Provider tokens served from the prompt cache this day. Written only by record_ai_usage.';
comment on column public.ai_usage.cache_write_tokens is
  'Provider tokens written into the prompt cache this day (Anthropic). Written only by record_ai_usage.';
comment on column public.ai_usage.output_tokens is
  'Provider tokens generated this day, reasoning included. Written only by record_ai_usage.';
comment on column public.ai_usage.provider_calls is
  'Provider answers read this day (fallback steps and retries included). Not the allowance — that is count.';
comment on column public.ai_usage.unmetered_calls is
  'Provider answers this day that carried no usage block; the token totals do not include them.';

-- ─────────────────────────────────────────────────────────────────────────────
--  2. record_ai_usage — the ONLY writer of the cost columns
--     Adds to the account's row for today (creating it with count 0 if the account has not been
--     charged today — the developer never is), and to the live turn row when p_turn names one.
--     Negative or null inputs are read as 0; a call with nothing to record writes nothing.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.record_ai_usage(
  p_user        uuid,
  p_turn        text,
  p_calls       integer,
  p_unmetered   integer,
  p_input       bigint,
  p_cached_read bigint,
  p_cache_write bigint,
  p_output      bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_calls integer := greatest(0, coalesce(p_calls, 0));
  v_unm   integer := least(greatest(0, coalesce(p_unmetered, 0)), greatest(0, coalesce(p_calls, 0)));
  v_in    bigint  := greatest(0, coalesce(p_input, 0));
  v_cr    bigint  := greatest(0, coalesce(p_cached_read, 0));
  v_cw    bigint  := greatest(0, coalesce(p_cache_write, 0));
  v_out   bigint  := greatest(0, coalesce(p_output, 0));
  v_key   text    := left(coalesce(nullif(btrim(p_turn), ''), ''), 120);
begin
  if p_user is null or v_calls = 0 then return; end if;

  insert into public.ai_usage as u
    (user_id, usage_date, count, input_tokens, cached_read_tokens, cache_write_tokens, output_tokens, provider_calls, unmetered_calls)
  values (p_user, current_date, 0, v_in, v_cr, v_cw, v_out, v_calls, v_unm)
  on conflict (user_id, usage_date) do update set
    input_tokens       = u.input_tokens       + excluded.input_tokens,
    cached_read_tokens = u.cached_read_tokens + excluded.cached_read_tokens,
    cache_write_tokens = u.cache_write_tokens + excluded.cache_write_tokens,
    output_tokens      = u.output_tokens      + excluded.output_tokens,
    provider_calls     = u.provider_calls     + excluded.provider_calls,
    unmetered_calls    = u.unmetered_calls    + excluded.unmetered_calls;

  if v_key <> '' then
    update public.ai_turns t set
      input_tokens       = t.input_tokens       + v_in,
      cached_read_tokens = t.cached_read_tokens + v_cr,
      cache_write_tokens = t.cache_write_tokens + v_cw,
      output_tokens      = t.output_tokens      + v_out,
      provider_calls     = t.provider_calls     + v_calls,
      unmetered_calls    = t.unmetered_calls    + v_unm
     where t.user_id = p_user and t.turn_key = v_key;
  end if;
end;
$$;
comment on function public.record_ai_usage(uuid, text, integer, integer, bigint, bigint, bigint, bigint) is
  'ai-one-ledger: adds one request''s provider usage (normalised by _shared/ai-usage.js) to ai_usage (today) and to the live ai_turns row. Never changes count (the allowance). service_role only.';

revoke execute on function public.record_ai_usage(uuid, text, integer, integer, bigint, bigint, bigint, bigint) from public, anon, authenticated;
grant  execute on function public.record_ai_usage(uuid, text, integer, integer, bigint, bigint, bigint, bigint) to service_role;
