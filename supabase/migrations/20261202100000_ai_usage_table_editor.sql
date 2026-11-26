-- ============================================================================
--  The Studio table editor can edit ai_usage.count again
-- ----------------------------------------------------------------------------
--  20261201110000 refused EVERY write to ai_usage.count that did not carry the setting intmap.ai_ledger. The Studio table editor
--  issues a plain UPDATE and cannot set a session setting, so the operator could no longer correct a count from the dashboard.
--
--  The refusal was meant for the API: a client that reaches the table through PostgREST runs as anon / authenticated / service_role
--  (SET ROLE by the gateway). The operator's own session (postgres / supabase_admin — the table editor and the SQL editor) is not that
--  path and is the person this table is for. So the guard now refuses a count written by an API role outside the ledger functions,
--  and lets the owner write. The ledger functions are unchanged and still raise intmap.ai_ledger around their writes.
--  The CHECK (count >= 0) is untouched: a negative count is still 23514 for everyone.
-- ============================================================================

create or replace function public.ai_usage_count_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('intmap.ai_ledger', true), '') in ('rpc', 'admin') then return null; end if;
  if current_user not in ('anon', 'authenticated', 'service_role', 'authenticator') then return null; end if;   -- the operator (table editor / SQL editor)
  raise exception 'ai_usage.count changes only through the ledger functions (increment_ai_usage, refund_ai_usage, refund_ai_usage_on, refund_ai_turn) when written through the API'
    using errcode = '42501';
end;
$$;
revoke execute on function public.ai_usage_count_guard() from public, anon, authenticated;

comment on table public.ai_usage is
  'Daily AI free-use counter (UTC day). Through the API, count is raised only by increment_ai_usage and lowered only by the refund functions (they carry intmap.ai_ledger); any other API write is refused (42501). The operator''s own session (Studio table editor, SQL editor) may correct a count. The cost columns are written only by record_ai_usage. Users may read only their own rows.';
