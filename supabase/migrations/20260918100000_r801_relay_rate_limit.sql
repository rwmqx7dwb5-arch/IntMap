-- ============================================================================
--  #R801 — A SHARED, ATOMIC SPEND CEILING FOR THE KEYED RELAYS
-- ----------------------------------------------------------------------------
--  THE FINDING (external audit, 2026-09-18): routing-relay's only spend control was an in-process
--  Map of per-IP token buckets. An Edge Function is not one process — Supabase runs several
--  isolates and recycles them — so every isolate counted on its own, a cold start forgot everyone,
--  and NOTHING bounded the project as a whole: a distributed caller was under no ceiling at all,
--  and Mapbox has no hard spend cap of its own (routing-relay's own header says so).
--
--  This migration is the shared store that Map could not be. One table, one SECURITY DEFINER
--  function, and the token-bucket arithmetic done INSIDE the row lock so that two isolates taking
--  from the same bucket at the same instant cannot both be told «yes» for the last token.
--
--  WHAT A BUCKET IS
--    (scope, key) → tokens, at.  `tokens` is what was left the last time anyone looked; `at` is
--    when. Refill is computed lazily on the next take — capacity and refill rate are ARGUMENTS,
--    not columns, so the caller (the relay) owns its numbers and can change them without a
--    migration; a bucket whose capacity shrank is simply clamped on its next take.
--    · scope = which limiter ('routing-relay:ip', 'routing-relay:global:minute', …)
--    · key   = who within it (an address, or '*' for the whole project)
--
--  ⚠ NO CLIENT MAY TOUCH THIS. RLS is on and no policy exists, every table privilege is revoked
--  from anon/authenticated/public, and relay_take is executable by service_role only — a caller
--  who could refill their own bucket would have no bucket.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
--  1. THE BUCKETS — written ONLY by relay_take below.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.relay_rate_buckets (
  scope  text        not null,
  key    text        not null,
  tokens numeric     not null,
  at     timestamptz not null default now(),
  primary key (scope, key)
);
comment on table public.relay_rate_buckets is
  'Token buckets shared by every isolate of the public relays (#R801). One row per (limiter, caller); capacity and refill are arguments of relay_take, not columns. Mutated only through the SECURITY DEFINER RPCs.';

create index if not exists relay_rate_buckets_at_idx on public.relay_rate_buckets (at);

-- ─────────────────────────────────────────────────────────────────────────────
--  2. relay_take — take p_cost tokens from bucket (p_scope, p_key), atomically.
--     Returns (allowed, remaining). `remaining` is the balance AFTER this call — after the
--     deduction when allowed, after the refill alone when refused.
--
--     ATOMICITY: the row is created with `on conflict do nothing` (so two first-callers cannot both
--     create it), then read `for update` — the lock serialises concurrent takers on the same
--     bucket, and the refill + deduction + write all happen under it in this one transaction.
--     Different buckets never wait for each other.
--
--     ⚠ clock_timestamp(), not now(): now() is the TRANSACTION's start, which is fine for one RPC
--     per transaction (the production shape) but would make every take in one pgTAP transaction see
--     zero elapsed time. The elapsed time must be wall-clock.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.relay_take(
  p_scope          text,
  p_key            text,
  p_capacity       integer,
  p_refill_per_sec numeric,
  p_cost           integer
)
returns table (allowed boolean, remaining integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scope    text    := left(coalesce(nullif(btrim(p_scope), ''), ''), 64);
  v_key      text    := left(coalesce(nullif(btrim(p_key), ''), ''), 128);
  v_cap      numeric := greatest(1, coalesce(p_capacity, 1));
  v_refill   numeric := greatest(0, coalesce(p_refill_per_sec, 0));
  v_cost     numeric := greatest(0, coalesce(p_cost, 1));
  v_tokens   numeric;
  v_at       timestamptz;
  v_now      timestamptz := clock_timestamp();
  v_filled   numeric;
  v_ok       boolean;
begin
  -- A bucket with no name is a caller defect; refuse rather than pool everyone under ''.
  if v_scope = '' or v_key = '' then
    return query select false, 0;
    return;
  end if;

  insert into public.relay_rate_buckets (scope, key, tokens, at)
  values (v_scope, v_key, v_cap, v_now)
  on conflict (scope, key) do nothing;

  select b.tokens, b.at into v_tokens, v_at
    from public.relay_rate_buckets b
   where b.scope = v_scope and b.key = v_key
     for update;

  -- Refill for the time elapsed, clamped to capacity (which also clamps a bucket whose capacity
  -- was lowered since it was last seen). A clock that went backwards refills nothing.
  v_filled := least(v_cap, v_tokens + greatest(0, extract(epoch from (v_now - v_at))) * v_refill);
  v_ok := (v_filled >= v_cost);
  if v_ok then
    v_filled := v_filled - v_cost;
  end if;

  update public.relay_rate_buckets b
     set tokens = v_filled, at = v_now
   where b.scope = v_scope and b.key = v_key;

  return query select v_ok, floor(v_filled)::integer;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  3. Housekeeping. A bucket nobody has touched for longer than its own full-refill time is
--     indistinguishable from a bucket that does not exist (the next take would find it full
--     either way), so it can go. The function does not know each scope's refill rate — that is
--     the caller's — so the idle horizon is an argument, and the default is two days: longer than
--     the slowest bucket anyone has defined (routing-relay's per-day bucket refills in one).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.sweep_relay_rate_buckets(p_idle_seconds integer default 172800)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  delete from public.relay_rate_buckets b
   where b.at < clock_timestamp() - make_interval(secs => greatest(60, coalesce(p_idle_seconds, 172800)));
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  4. RLS + grants — nobody but the RPCs. ⚠ TRUNCATE is not subject to RLS, so the grant layer is
--     the only thing that refuses it (docs/SECURITY-ARCHITECTURE.md §8 item 5) — `revoke all`.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.relay_rate_buckets enable row level security;

revoke all on table public.relay_rate_buckets from public, anon, authenticated;

revoke execute on function public.relay_take(text, text, integer, numeric, integer) from public, anon, authenticated;
revoke execute on function public.sweep_relay_rate_buckets(integer)                  from public, anon, authenticated;
grant  execute on function public.relay_take(text, text, integer, numeric, integer) to service_role;
grant  execute on function public.sweep_relay_rate_buckets(integer)                  to service_role;
