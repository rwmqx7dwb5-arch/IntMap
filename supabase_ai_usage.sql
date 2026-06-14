-- ============================================================================
--  IntMap · account-based AI quota   (run once in the Supabase SQL editor)
-- ----------------------------------------------------------------------------
--  Backs the ai-proxy Edge Function: per-user, per-day free-use counter with a
--  daily reset (the date IS the key, so "reset" is automatic — a new day = a new
--  row that starts at 0). Writes happen only via the service role inside the
--  function; end users may READ their own row (for the in-app "N / 5 left").
-- ============================================================================

create table if not exists public.ai_usage (
  user_id    uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default (now() at time zone 'utc')::date,
  count      int  not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

alter table public.ai_usage enable row level security;

-- A user may read ONLY their own usage rows (for the quota display). No insert/
-- update/delete policy → end users cannot tamper with the counter; the Edge
-- Function mutates it with the service role (which bypasses RLS).
drop policy if exists ai_usage_select_own on public.ai_usage;
create policy ai_usage_select_own on public.ai_usage
  for select using (auth.uid() = user_id);

-- Atomic consume: ensure today's row exists, lock it, block at/over the limit,
-- otherwise increment. Returns the decision + the new count in one round-trip.
create or replace function public.increment_ai_usage(p_user uuid, p_limit int)
returns table(allowed boolean, used int, lim int)
language plpgsql security definer set search_path = public as $$
declare cur int;
begin
  insert into public.ai_usage(user_id, usage_date, count)
    values (p_user, (now() at time zone 'utc')::date, 0)
    on conflict (user_id, usage_date) do nothing;

  select count into cur from public.ai_usage
    where user_id = p_user and usage_date = (now() at time zone 'utc')::date
    for update;

  if cur >= p_limit then
    return query select false, cur, p_limit;
    return;
  end if;

  update public.ai_usage set count = count + 1, updated_at = now()
    where user_id = p_user and usage_date = (now() at time zone 'utc')::date
    returning count into cur;

  return query select true, cur, p_limit;
end; $$;

-- Refund one use if the AI provider call fails after a slot was consumed.
create or replace function public.refund_ai_usage(p_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.ai_usage set count = greatest(0, count - 1), updated_at = now()
    where user_id = p_user and usage_date = (now() at time zone 'utc')::date;
end; $$;

-- These RPCs are only ever called by the Edge Function (service role); don't
-- expose them to the anon / authenticated roles.
revoke all on function public.increment_ai_usage(uuid, int) from public, anon, authenticated;
revoke all on function public.refund_ai_usage(uuid)        from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Optional columns on profiles:
--   plan         → drives the daily limit (future paid tiers; default 'free').
--   login_count  → mirrors the client's per-user login counter (3rd-login nudge).
-- Both are optional; the app degrades gracefully if they are absent.
-- ----------------------------------------------------------------------------
alter table public.profiles add column if not exists plan        text not null default 'free';
alter table public.profiles add column if not exists login_count int  not null default 0;
