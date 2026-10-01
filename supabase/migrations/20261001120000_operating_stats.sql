-- ============================================================================
--  supporter-funnel — WHAT RUNNING ATLAS TOOK THIS MONTH, as the ledger measured it
-- ----------------------------------------------------------------------------
--  The support panel (js/supporter.js) tells a reader what their support pays for. CONSTITUTION.md
--  §0/PRODUCT.md §2.1-3: what IntMap shows must be honest — so it shows only what a record measured,
--  and says from when. This function is that record, aggregated over every account, and nothing else.
--
--  WHAT THE LEDGER CAN AND CANNOT SAY (production, read 2026-10-01, public.ai_usage):
--    · provider_calls / *_tokens — the requests IntMap sent to an AI provider and the tokens they were
--      billed for. Recorded since 20260929120000_ai_usage.sql; the first non-zero row is 2026-10-01.
--      This IS what costs money, and it includes the developer's own calls (record_ai_usage records
--      every account — the developer is exempt from the allowance, not from the invoice).
--    · count — NOT used here. It is the allowance mirror, net of refunds, and it is negative in 25 rows
--      on 24 days (the lowest −99,999,938; July 2026 sums to −110,219,626) — refunds that landed on a
--      different day from the charge (DECISIONS.md «答えた turn は返金しない») and whatever wrote the
--      sentinel-sized row. Summed, it is not a number of answers and must not be shown as one.
--    · ai_turns.succeeded — answered turns, but the table is a scratch pad swept after a day, so a
--      month of answers is not in it. «How many answers Atlas gave this month» has no record today.
--  So the panel says «AI requests» and «tokens», from `metered_since`, and never «answers».
--
--  ⚠ AGGREGATES ONLY. No user id, no per-account row, no per-day series: one month's totals over the
--  whole project. It reads ai_usage as its owner (SECURITY DEFINER) because the table's RLS lets a
--  reader see only their own row — which is exactly why this is a function returning sums, not a grant.
--  ⚠ NON-DESTRUCTIVE. One new function; no table, column, policy or existing grant changes.
-- ============================================================================
begin;

create or replace function public.operating_stats()
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'month',            to_char(date_trunc('month', current_date), 'YYYY-MM'),
    'metered_since',    (select min(u.usage_date) from public.ai_usage u where u.provider_calls > 0),
    'provider_calls',   coalesce(sum(m.provider_calls), 0),
    'unmetered_calls',  coalesce(sum(m.unmetered_calls), 0),
    'input_tokens',     coalesce(sum(m.input_tokens + m.cached_read_tokens + m.cache_write_tokens), 0),
    'cached_tokens',    coalesce(sum(m.cached_read_tokens), 0),
    'output_tokens',    coalesce(sum(m.output_tokens), 0),
    'as_of',            now()
  )
  from public.ai_usage m
  where m.usage_date >= date_trunc('month', current_date)::date;
$$;

comment on function public.operating_stats() is
  'supporter-funnel: this month''s project-wide AI provider requests and tokens (public.ai_usage cost columns), and the first day they were recorded. Aggregates only — no account, no per-day series. ANON MAY CALL: the support panel shows every reader, signed in or not, what running Atlas took this month; it returns sums over all accounts and nothing about any one of them.';

revoke execute on function public.operating_stats() from public;
grant  execute on function public.operating_stats() to anon, authenticated, service_role;

commit;
