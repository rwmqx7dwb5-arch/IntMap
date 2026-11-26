-- ============================================================================
--  (atlas-jobs-reliability) The AI allowance ledger: ONE definition, the day a charge belongs to, and nobody writes a count by hand
-- ----------------------------------------------------------------------------
--  Three findings of dev-notes/2026-10-01-ai-usage-ledger-sign.md §5, each read against PRODUCTION on 2026-11-26
--  (pg_get_functiondef of the live functions; information_schema of the live table):
--
--  ① DRIFT. Production's increment_ai_usage returns (allowed, used, lim), reads the UTC date, stamps `updated_at` and
--     pins search_path to `public`; the repository's (20260718090000_baseline.sql) returned (used, allowed), read current_date and pinned ''.
--     Production's refund_ai_usage likewise stamps updated_at. Production's ai_usage has an `updated_at` column and a UTC `usage_date`
--     default that the repository's table did not. consume_ai_turn reads the columns BY NAME, so both worked — and a database rebuilt
--     from the migrations (supabase db reset, the pgTAP run) was not the database the product runs on.
--     Here the live behaviour is the definition: the table gets the column and the default, and the functions are the live ones,
--     with the search_path pinned empty as every other ledger function has it. (The database's TimeZone is UTC, so current_date and the
--     UTC date are the same day; the functions now say UTC outright instead of depending on a setting.)
--
--  ② A REFUND WITHOUT A TURN KEY WENT TO TODAY'S ROW. A call with no turn key charges once (consume_ai_turn with '') and its refund
--     (refund_ai_turn(…, '') → refund_ai_usage) took one off TODAY's row. A call charged at 23:59 UTC and refunded at 00:01 UTC
--     therefore gave a use back on a day that never charged it. refund_ai_usage_on(user, date) names the day; the Edge Function
--     that charged knows the day it charged on and passes it (_shared/ai-ledger.js refundTurn → chargedOn). refund_ai_usage(user)
--     keeps meaning «today».
--
--  ③ THE TABLE'S OWNER COULD WRITE A POSITIVE COUNT. The CHECK (count >= 0) stops a negative count; nothing stopped
--     `update ai_usage set count = 0` (give a reader a day's uses back) or an insert with a count. A count now changes only inside the
--     ledger functions — each carries `set intmap.ai_ledger = 'rpc'`, which is in force for the duration of the call and no longer —
--     and a write that arrives any other way is refused (42501). An administrator who really must correct a count says so in the same
--     transaction:  set local intmap.ai_ledger = 'admin';  — the way is not closed, it is made deliberate and visible in the statement.
--     The trigger is AFTER the row is written, so the CHECK still answers first for a negative value (23514, as before).
-- ============================================================================

alter table public.ai_usage add column if not exists updated_at timestamptz not null default now();
alter table public.ai_usage alter column usage_date set default ((now() at time zone 'utc')::date);

-- ── ① the live definition of the two counters ────────────────────────────────
drop function if exists public.increment_ai_usage(uuid, integer);
create function public.increment_ai_usage(p_user uuid, p_limit integer)
returns table (allowed boolean, used integer, lim integer)
language plpgsql
security definer
set search_path = ''
set intmap.ai_ledger = 'rpc'
as $$
declare
  cur   integer;
  v_day date := (now() at time zone 'utc')::date;
begin
  insert into public.ai_usage (user_id, usage_date, count)
  values (p_user, v_day, 0)
  on conflict (user_id, usage_date) do nothing;

  select u.count into cur from public.ai_usage u
   where u.user_id = p_user and u.usage_date = v_day
   for update;

  if cur >= p_limit then
    return query select false, cur, p_limit;
    return;
  end if;

  update public.ai_usage u set count = u.count + 1, updated_at = now()
   where u.user_id = p_user and u.usage_date = v_day
   returning u.count into cur;

  return query select true, cur, p_limit;
end;
$$;
revoke execute on function public.increment_ai_usage(uuid, integer) from public, anon, authenticated;
grant  execute on function public.increment_ai_usage(uuid, integer) to service_role;
comment on function public.increment_ai_usage(uuid, integer) is
  'Consume one use for today (UTC) if under p_limit. → (allowed, used, lim). The only writer that raises a count. (atlas-jobs-reliability: the definition production runs.)';

create or replace function public.refund_ai_usage_on(p_user uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = ''
set intmap.ai_ledger = 'rpc'
as $$
begin
  update public.ai_usage u set count = greatest(0, u.count - 1), updated_at = now()
   where u.user_id = p_user and u.usage_date = coalesce(p_date, (now() at time zone 'utc')::date);
end;
$$;
revoke execute on function public.refund_ai_usage_on(uuid, date) from public, anon, authenticated;
grant  execute on function public.refund_ai_usage_on(uuid, date) to service_role;
comment on function public.refund_ai_usage_on(uuid, date) is
  '(atlas-jobs-reliability) Give one use back to the NAMED day (UTC; null = today) — the day the charge was made. Never below 0.';

create or replace function public.refund_ai_usage(p_user uuid)
returns void
language sql
security definer
set search_path = ''
set intmap.ai_ledger = 'rpc'
as $$ select public.refund_ai_usage_on(p_user, null::date); $$;
revoke execute on function public.refund_ai_usage(uuid) from public, anon, authenticated;
grant  execute on function public.refund_ai_usage(uuid) to service_role;
comment on function public.refund_ai_usage(uuid) is
  'Give one use back to TODAY (UTC). A caller that knows the day it charged on uses refund_ai_usage_on.';

-- refund_ai_turn: the live body, now inside the ledger guard (the keyed branch writes ai_usage directly)
create or replace function public.refund_ai_turn(p_user uuid, p_turn text, p_gen uuid default null)
returns text
language plpgsql
security definer
set search_path = ''
set intmap.ai_ledger = 'rpc'
as $$
declare
  v_key   text := coalesce(nullif(btrim(p_turn), ''), '');
  r       record;
begin
  if v_key = '' then
    -- a turn-less call charged once; its caller asks once (never retried)
    perform public.refund_ai_usage(p_user);
    return 'refunded';
  end if;
  v_key := left(v_key, 120);
  select t.charged, t.usage_date, t.succeeded, t.inflight into r
    from public.ai_turns t
   where t.user_id = p_user and t.turn_key = v_key
     and (p_gen is null or t.attempt_gen = p_gen)
   for update;
  if not found then
    return 'not_found';              -- already refunded, expired, or a later generation of the key
  end if;
  if r.succeeded then
    if p_gen is not null then
      update public.ai_turns t set inflight = greatest(0, t.inflight - 1)
       where t.user_id = p_user and t.turn_key = v_key and t.attempt_gen = p_gen;
    end if;
    return 'answered';               -- an answer exists: nothing is given back
  end if;
  if p_gen is not null and r.inflight > 1 then
    update public.ai_turns t set inflight = t.inflight - 1
     where t.user_id = p_user and t.turn_key = v_key and t.attempt_gen = p_gen;
    return 'held';                   -- another attempt of this turn is still running: it decides
  end if;
  delete from public.ai_turns t
   where t.user_id = p_user and t.turn_key = v_key and (p_gen is null or t.attempt_gen = p_gen);
  if coalesce(r.charged, false) then
    update public.ai_usage u
       set count = greatest(0, u.count - 1), updated_at = now()
     where u.user_id = p_user and u.usage_date = coalesce(r.usage_date, current_date);
  end if;
  return 'refunded';
end;
$$;

-- ── ③ a count changes only inside the ledger ─────────────────────────────────
create or replace function public.ai_usage_count_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('intmap.ai_ledger', true), '') in ('rpc', 'admin') then return null; end if;
  raise exception 'ai_usage.count changes only through the ledger functions (increment_ai_usage, refund_ai_usage, refund_ai_usage_on, refund_ai_turn); to correct one by hand, run  set local intmap.ai_ledger = ''admin'';  in the same transaction first'
    using errcode = '42501';
end;
$$;
revoke execute on function public.ai_usage_count_guard() from public, anon, authenticated;

drop trigger if exists ai_usage_count_guard_insert on public.ai_usage;
create trigger ai_usage_count_guard_insert after insert on public.ai_usage
  for each row when (new.count <> 0) execute function public.ai_usage_count_guard();
drop trigger if exists ai_usage_count_guard_update on public.ai_usage;
create trigger ai_usage_count_guard_update after update of count on public.ai_usage
  for each row when (new.count is distinct from old.count) execute function public.ai_usage_count_guard();

comment on table public.ai_usage is
  'Daily AI free-use counter (UTC day). count is raised only by increment_ai_usage and lowered only by the refund functions, which carry the ledger setting intmap.ai_ledger; any other write is refused (42501) unless the transaction says  set local intmap.ai_ledger = ''admin''. The cost columns are written only by record_ai_usage. Users may read only their own rows.';
