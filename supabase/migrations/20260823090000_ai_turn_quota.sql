-- ============================================================================
--  #R314 — ONE USER TURN COSTS ONE USE, NOT THREE
-- ----------------------------------------------------------------------------
--  「一つのuser turnに属するplanner、bounded repair、形式修復を一つの利用単位として扱う …
--    user-controlledな`turnId`だけを信用しない … 同一turnでの最大AI呼び出し数をサーバー側でも
--    制限する」
--
--  Until now every HTTP request to ai-proxy consumed one of the account's daily free uses. That is
--  correct for one question, and wrong for what Atlas actually does with a question: the planner
--  call, up to two bounded repair calls (js/atlas-console.js) and, for an image, one self-check
--  re-read are all IntMap's own machinery finishing ONE user request. A user who asked one thing
--  could be charged three, silently, and nothing in the UI said so.
--
--  This adds a turn ledger. The FIRST call carrying a given turn key consumes one daily use; the
--  rest are free, up to a server-enforced ceiling, and the key expires so it cannot become a
--  permanent free pass.
--
--  ⚠ THE CLIENT'S TURN KEY IS NOT TRUSTED, AND THREE THINGS MAKE THAT TRUE:
--    · the row's primary key includes user_id, so a key is meaningless across accounts;
--    · p_max_calls bounds how many calls one key may carry (the caller cannot raise it — the Edge
--      Function passes a constant);
--    · p_ttl_seconds expires the key, so replaying yesterday's key starts a NEW turn and pays.
--  A client that sends a fresh key per request behaves exactly as before this migration.
--
--  ⚠ IT DOES NOT CHANGE WHAT A FAILURE COSTS. refund_ai_usage still exists and is still called on a
--  provider failure; a refund releases the turn's charge because the turn row is deleted with it.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
--  1. THE TURN LEDGER — one row per (account, turn), written ONLY by the RPC below.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.ai_turns (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  turn_key   text        not null,
  usage_date date        not null default current_date,
  calls      integer     not null default 1,
  charged    boolean     not null default true,
  started_at timestamptz not null default now(),
  primary key (user_id, turn_key)
);
comment on table public.ai_turns is
  'One row per (account, AI turn). The first call of a turn charges ai_usage; later calls of the same turn are free up to a server-set ceiling. Mutated only through the SECURITY DEFINER RPCs.';

create index if not exists ai_turns_started_idx on public.ai_turns (started_at);

-- ─────────────────────────────────────────────────────────────────────────────
--  2. consume_ai_turn — the ONLY writer of ai_turns, and the turn-aware front door to ai_usage.
--     Returns (used, allowed, charged, calls, reason).
--       allowed=false + reason='limit'      → the daily free-use limit is reached
--       allowed=false + reason='turn_calls' → this turn already made p_max_calls calls
--     An empty p_turn behaves exactly like increment_ai_usage: charge, always.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.consume_ai_turn(
  p_user        uuid,
  p_limit       integer,
  p_turn        text,
  p_max_calls   integer,
  p_ttl_seconds integer
)
returns table (used integer, allowed boolean, charged boolean, calls integer, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count  integer;
  v_calls  integer;
  v_fresh  boolean := false;
  v_key    text := coalesce(nullif(btrim(p_turn), ''), '');
begin
  -- No turn key → the pre-#R314 behaviour, unchanged.
  if v_key = '' then
    select u.used, u.allowed into v_count, v_fresh from public.increment_ai_usage(p_user, p_limit) u;
    return query select v_count, v_fresh, v_fresh, 1, case when v_fresh then '' else 'limit' end;
    return;
  end if;

  -- A key is at most 120 characters; anything longer is a client defect, not a turn.
  v_key := left(v_key, 120);

  -- Retire keys that have outlived their turn, so a replayed key opens a new (charged) turn.
  delete from public.ai_turns t
   where t.user_id = p_user
     and t.turn_key = v_key
     and t.started_at < now() - make_interval(secs => greatest(30, coalesce(p_ttl_seconds, 900)));

  insert into public.ai_turns as a (user_id, turn_key, usage_date, calls, charged)
  values (p_user, v_key, current_date, 1, true)
  on conflict (user_id, turn_key)
    do update set calls = a.calls + 1
  returning a.calls into v_calls;

  v_fresh := (v_calls = 1);

  if not v_fresh then
    -- A continuation of a turn already paid for. Bounded, so a stuck client cannot loop for free.
    if v_calls > greatest(1, coalesce(p_max_calls, 6)) then
      select c.count into v_count from public.ai_usage c
        where c.user_id = p_user and c.usage_date = current_date;
      return query select coalesce(v_count, 0), false, false, v_calls, 'turn_calls'::text;
      return;
    end if;
    select c.count into v_count from public.ai_usage c
      where c.user_id = p_user and c.usage_date = current_date;
    return query select coalesce(v_count, 0), true, false, v_calls, ''::text;
    return;
  end if;

  -- First call of this turn → it pays.
  select u.used, u.allowed into v_count, v_fresh from public.increment_ai_usage(p_user, p_limit) u;
  if not v_fresh then
    -- Over the daily limit: do not leave a turn row claiming this turn was paid for.
    delete from public.ai_turns t where t.user_id = p_user and t.turn_key = v_key;
    return query select v_count, false, false, 1, 'limit'::text;
    return;
  end if;
  return query select v_count, true, true, 1, ''::text;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  3. refund_ai_turn — a provider failure must release the CHARGE and the TURN together, or the
--     retry of a refunded turn would be treated as a free continuation of a turn nobody paid for.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.refund_ai_turn(p_user uuid, p_turn text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := coalesce(nullif(btrim(p_turn), ''), '');
  v_charged boolean;
begin
  if v_key = '' then
    perform public.refund_ai_usage(p_user);
    return;
  end if;
  v_key := left(v_key, 120);
  select t.charged into v_charged from public.ai_turns t
    where t.user_id = p_user and t.turn_key = v_key;
  delete from public.ai_turns t where t.user_id = p_user and t.turn_key = v_key;
  if coalesce(v_charged, false) then
    perform public.refund_ai_usage(p_user);
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  4. Housekeeping — the ledger is a scratch pad, not a history. Anything a day old is finished.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.sweep_ai_turns()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  delete from public.ai_turns t where t.started_at < now() - interval '1 day';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  5. RLS + grants — the same shape as ai_usage: nobody may write it, the owner may read their own.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.ai_turns enable row level security;

drop policy if exists ai_turns_select_own on public.ai_turns;
create policy ai_turns_select_own on public.ai_turns
  for select to authenticated
  using (user_id = (select auth.uid()));

grant select on public.ai_turns to authenticated;

revoke execute on function public.consume_ai_turn(uuid, integer, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.refund_ai_turn(uuid, text)                              from public, anon, authenticated;
revoke execute on function public.sweep_ai_turns()                                        from public, anon, authenticated;
grant  execute on function public.consume_ai_turn(uuid, integer, text, integer, integer) to service_role;
grant  execute on function public.refund_ai_turn(uuid, text)                              to service_role;
grant  execute on function public.sweep_ai_turns()                                        to service_role;
