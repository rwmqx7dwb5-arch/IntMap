-- ============================================================================
--  atlas-stream-replay — A BROKEN STREAM IS RECEIVED AGAIN, NOT COMPUTED AGAIN
-- ----------------------------------------------------------------------------
--  WHAT WAS FOUND (audit, 2026-10-01): an Atlas turn streamed by ai-proxy (atlas-live-stream) runs to
--  its end on the server even when the reader's connection drops — EdgeRuntime.waitUntil keeps the
--  isolate, the usage is recorded and the turn is settled. The page, which never received `done`,
--  then asked again without streaming under the same turn key, and the server had nothing to give
--  it but a NEW provider call: a second answer (possibly a different one) and a second provider bill
--  for a result that had already been produced. That is cause 2 of one-pass-or-a-reason §2 — the
--  result was not carried back — answered with a repetition.
--
--  This table holds the answer of ONE keyed request until the page has had the chance to collect it:
--    · the key is (account, turn key, replay key). The turn key alone names a TURN, which carries up
--      to TURN_MAX_CALLS requests; the replay key (minted by js/ai-core.js for each streamed request,
--      sent again by its retry) names the one request whose answer is held.
--    · `state` is running → done | failed. A second request with the same key reads the stored
--      `done` (no provider call, no charge), waits while the first is `running` and still beating,
--      and runs again ONLY after an observed failure (`failed`) or a run that stopped beating
--      (`abandoned` — its isolate is gone, so it can no longer produce an answer). Every re-run
--      increments `attempts`, and ai-proxy reports it (meta.replay).
--    · `lease_until` is the running request's heartbeat: ai-proxy renews it every HEARTBEAT_MS
--      (_shared/ai-stream.js) and passes two heartbeats as the lease, so one late beat is tolerated
--      and an isolate that died is recognised within two.
--    · `expires_at` is the turn key's own lifetime (ai-proxy TURN_TTL_S): after it the same turn key
--      opens a new turn (consume_ai_turn), so an answer older than that has nothing to be replayed
--      into. Expired rows are never returned, are deleted by the next claim of the same account, and
--      are swept on a schedule (pg_cron `ai-turn-answers-sweep`) so an answer is not kept for an
--      account that never comes back.
--
--  ⚠ NOT A LIMIT (CONSTITUTION.md §5). Nothing here refuses a request: a replay returns what was
--  already produced, and anything else runs exactly as before. TURN_MAX_CALLS is untouched — a replay
--  that finds a stored answer returns before consume_ai_turn and so does not use one of the calls.
--  ⚠ NON-DESTRUCTIVE: a new table and new functions; no existing row, function or grant changes.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
--  1. THE TABLE — written ONLY by the SECURITY DEFINER functions below
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.ai_turn_answers (
  user_id     uuid        not null references auth.users(id) on delete cascade,
  turn_key    text        not null,
  replay_key  text        not null,
  state       text        not null default 'running' check (state in ('running', 'done', 'failed')),
  attempts    integer     not null default 1,
  status      integer,
  body        jsonb,
  started_at  timestamptz not null default now(),
  lease_until timestamptz not null,
  finished_at timestamptz,
  expires_at  timestamptz not null,
  primary key (user_id, turn_key, replay_key)
);
comment on table public.ai_turn_answers is
  'atlas-stream-replay: the answer of one keyed Atlas request, held until the turn key expires so a page whose stream broke receives it again instead of computing it again. Written only through the SECURITY DEFINER RPCs.';
comment on column public.ai_turn_answers.lease_until is
  'The running request''s heartbeat. A running row past its lease is abandoned (its isolate is gone) and may be claimed again.';
comment on column public.ai_turn_answers.expires_at is
  'The turn key''s lifetime (ai-proxy TURN_TTL_S). An expired row is never returned and is swept.';

create index if not exists ai_turn_answers_expires_idx on public.ai_turn_answers (expires_at);

-- ─────────────────────────────────────────────────────────────────────────────
--  2. RLS + grants — nobody may write it directly; the owner may read their own rows
--     (Supabase's default privileges hand anon/authenticated ALL on a new table — taken back first,
--      #R801 §3).
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.ai_turn_answers enable row level security;
revoke all on public.ai_turn_answers from anon, authenticated;

drop policy if exists ai_turn_answers_select_own on public.ai_turn_answers;
create policy ai_turn_answers_select_own on public.ai_turn_answers
  for select to authenticated
  using (user_id = (select auth.uid()));

grant select on public.ai_turn_answers to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
--  3. claim_ai_answer — the request with this key may run, or must not.
--     outcome 'claimed' → the caller runs it (attempts = this run's number; after_state = '' for the first
--                         run, 'failed' / 'abandoned' for a run after an observed failure or a dead
--                         isolate)
--     outcome 'done'    → the stored answer (status, body); the caller must not run it
--     outcome 'running' → another request holds it and is still beating; the caller waits
--     One row lock decides, so two requests racing for the same key cannot both run it.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.claim_ai_answer(
  p_user          uuid,
  p_turn          text,
  p_key           text,
  p_ttl_seconds   integer,
  p_lease_seconds integer
)
returns table (outcome text, attempts integer, status integer, body jsonb, after_state text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turn  text := left(coalesce(nullif(btrim(p_turn), ''), ''), 120);
  v_key   text := left(coalesce(nullif(btrim(p_key), ''), ''), 120);
  v_ttl   interval := make_interval(secs => greatest(30, coalesce(p_ttl_seconds, 900)));
  v_lease interval := make_interval(secs => greatest(5, coalesce(p_lease_seconds, 30)));
  v_row   public.ai_turn_answers%rowtype;
  v_after text;
begin
  if p_user is null or v_turn = '' or v_key = '' then
    return query select 'claimed'::text, 1, null::integer, null::jsonb, ''::text;
    return;
  end if;

  -- What this account no longer needs: an expired answer is never returned, so it is not kept either.
  delete from public.ai_turn_answers a where a.user_id = p_user and a.expires_at < now();

  insert into public.ai_turn_answers as a (user_id, turn_key, replay_key, state, attempts, lease_until, expires_at)
  values (p_user, v_turn, v_key, 'running', 1, now() + v_lease, now() + v_ttl)
  on conflict (user_id, turn_key, replay_key) do nothing;
  if found then
    return query select 'claimed'::text, 1, null::integer, null::jsonb, ''::text;
    return;
  end if;

  select * into v_row from public.ai_turn_answers a
   where a.user_id = p_user and a.turn_key = v_turn and a.replay_key = v_key
   for update;
  if not found then
    -- The row that conflicted was deleted between the two statements (its turn expired): this is a
    -- first run after all.
    insert into public.ai_turn_answers as a (user_id, turn_key, replay_key, state, attempts, lease_until, expires_at)
    values (p_user, v_turn, v_key, 'running', 1, now() + v_lease, now() + v_ttl)
    on conflict (user_id, turn_key, replay_key) do nothing;
    return query select 'claimed'::text, 1, null::integer, null::jsonb, ''::text;
    return;
  end if;

  if v_row.state = 'done' then
    return query select 'done'::text, v_row.attempts, v_row.status, v_row.body, ''::text;
    return;
  end if;
  if v_row.state = 'running' and v_row.lease_until >= now() then
    return query select 'running'::text, v_row.attempts, null::integer, null::jsonb, ''::text;
    return;
  end if;

  -- An observed failure, or a run whose isolate stopped beating: this request runs it again.
  v_after := case when v_row.state = 'failed' then 'failed' else 'abandoned' end;
  update public.ai_turn_answers a
     set state = 'running', attempts = a.attempts + 1, status = null, body = null,
         started_at = now(), lease_until = now() + v_lease, finished_at = null, expires_at = now() + v_ttl
   where a.user_id = p_user and a.turn_key = v_turn and a.replay_key = v_key
  returning a.attempts into v_row.attempts;
  return query select 'claimed'::text, v_row.attempts, null::integer, null::jsonb, v_after;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  4. peek_ai_answer — what a retry finds, WITHOUT claiming anything. ai-proxy asks it before the
--     reader's allowance is consulted, so a stored answer is returned without spending a call.
--     state: 'done' | 'failed' | 'running' (still beating) | 'abandoned' (stopped beating);
--     no row when nothing was registered under the key or it has expired.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.peek_ai_answer(p_user uuid, p_turn text, p_key text)
returns table (state text, attempts integer, status integer, body jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select case when a.state = 'running' and a.lease_until < now() then 'abandoned' else a.state end,
         a.attempts,
         a.status,
         case when a.state = 'done' then a.body else null end
    from public.ai_turn_answers a
   where a.user_id = p_user
     and a.turn_key = left(coalesce(nullif(btrim(p_turn), ''), ''), 120)
     and a.replay_key = left(coalesce(nullif(btrim(p_key), ''), ''), 120)
     and a.expires_at >= now();
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  5. beat_ai_answer / finish_ai_answer — only the run that holds the claim (same attempt) may
--     renew it or write its result; a superseded run changes nothing.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.beat_ai_answer(p_user uuid, p_turn text, p_key text, p_attempt integer, p_lease_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.ai_turn_answers a
     set lease_until = now() + make_interval(secs => greatest(5, coalesce(p_lease_seconds, 30)))
   where a.user_id = p_user
     and a.turn_key = left(coalesce(nullif(btrim(p_turn), ''), ''), 120)
     and a.replay_key = left(coalesce(nullif(btrim(p_key), ''), ''), 120)
     and a.state = 'running' and a.attempts = p_attempt;
  return found;
end;
$$;

create or replace function public.finish_ai_answer(
  p_user    uuid,
  p_turn    text,
  p_key     text,
  p_attempt integer,
  p_ok      boolean,
  p_status  integer,
  p_body    jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.ai_turn_answers a
     set state = case when coalesce(p_ok, false) then 'done' else 'failed' end,
         status = p_status,
         body = case when coalesce(p_ok, false) then p_body else null end,   -- a failure is re-run, never replayed
         finished_at = now()
   where a.user_id = p_user
     and a.turn_key = left(coalesce(nullif(btrim(p_turn), ''), ''), 120)
     and a.replay_key = left(coalesce(nullif(btrim(p_key), ''), ''), 120)
     and a.state = 'running' and a.attempts = p_attempt;
  return found;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  6. sweep_ai_turn_answers — every expired row, whoever it belongs to
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.sweep_ai_turn_answers()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  delete from public.ai_turn_answers a where a.expires_at < now();
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.claim_ai_answer(uuid, text, text, integer, integer)                 from public, anon, authenticated;
revoke execute on function public.peek_ai_answer(uuid, text, text)                                     from public, anon, authenticated;
revoke execute on function public.beat_ai_answer(uuid, text, text, integer, integer)                   from public, anon, authenticated;
revoke execute on function public.finish_ai_answer(uuid, text, text, integer, boolean, integer, jsonb) from public, anon, authenticated;
revoke execute on function public.sweep_ai_turn_answers()                                              from public, anon, authenticated;
grant  execute on function public.claim_ai_answer(uuid, text, text, integer, integer)                 to service_role;
grant  execute on function public.peek_ai_answer(uuid, text, text)                                     to service_role;
grant  execute on function public.beat_ai_answer(uuid, text, text, integer, integer)                   to service_role;
grant  execute on function public.finish_ai_answer(uuid, text, text, integer, boolean, integer, jsonb) to service_role;
grant  execute on function public.sweep_ai_turn_answers()                                              to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  7. THE SCHEDULE — every 15 minutes, the turn key's lifetime (TURN_TTL_S 900 s), so no answer
--     outlives its turn by more than one more lifetime. pg_cron is installed in production and not
--     by any migration here; the local / CI stack may lack it (the guard of
--     20260925110000_client_errors.sql). cron.schedule with a NAME replaces a same-named job.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron is not installed here — skipping the ai-turn-answers-sweep schedule';
    return;
  end if;
  perform cron.schedule('ai-turn-answers-sweep', '*/15 * * * *', 'select public.sweep_ai_turn_answers()');
end $$;
