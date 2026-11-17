-- ============================================================================
--  IntMap · security-review-nov — four holes found by two independent reviews (2026-11-17)
-- ----------------------------------------------------------------------------
--  1. A MODERATION HOLD IS ON THE ACCOUNT, NOT ON ONE COLLECTION NAME.
--     community_map_held(user, collection) matched the hold by the collection's NAME. An owner whose
--     collection was hidden could (a) rename it (saved_places / saved_views .collection is theirs to
--     update) and list it again, or (b) list «everything» (collection NULL), whose share row carried the
--     hidden collection's contents back into the directory — and an «everything» share listed BEFORE the
--     hold stayed listed after it. The operator decided (2026-11-17): a hold covers the whole account
--     until an administrator restores it. The predicate keeps its signature (the directory, lineage and
--     listing all call it), so every reader of it changes at once.
--  2. THE AUTHOR NAME GOES THROUGH THE ONE NAME RULE. public.display_name() refuses control, bidirectional
--     and invisible format characters in a student's name; the name printed on a Community maps card did
--     not go through it, so U+202E / zero-width characters could make a card read as someone else's.
--  3. THE CODE-GUESSING DOORS ARE THE SERVER'S. class_set_open, class_set_submit and community_maps were
--     callable by anon straight through PostgREST with no per-caller bound: class_set_open and
--     class_set_submit (before its per-set bucket — `not_found` versus `invalid_name`) both answer
--     whether a code exists, and the directory is a heavy read. They are now called only by the
--     `community-class` Edge Function, which takes a per-caller token (relay_take, failing CLOSED for the
--     class doors) before the code is looked up. Students still need no account.
--  4. A TURN'S REFUND WAITS FOR EVERY ATTEMPT OF IT (the race the #R801 migration recorded as open).
--     A first call that failed could delete the turn row and refund while a continuation of the same
--     turn was still running; that continuation then answered with nothing to settle. Each attempt now
--     holds the turn (`inflight`), a refund only happens when the LAST attempt closes without an answer,
--     and a late settle / refund carries the generation it opened, so it cannot land on a new turn made
--     later under the same key. No lock is held across a provider call: each RPC is one short statement.
-- ============================================================================

-- ─── 1. the hold ─────────────────────────────────────────────────────────────
create or replace function public.community_map_held(p_user uuid, p_collection text)
returns boolean
language sql
stable
as $$
  select exists (select 1 from public.community_map_holds h where h.user_id = p_user)
$$;
comment on function public.community_map_held(uuid, text) is
  '(community-maps, security-review-nov) Is the ACCOUNT held by an administrator? Any hold on any of its collections covers all of them — renaming a collection, or listing «everything», does not bring held content back (operator decision 2026-11-17). p_collection is kept for the callers'' signature and no longer narrows the answer. Restoring removes one hold; the account is listed again when it has none.';
revoke execute on function public.community_map_held(uuid, text) from public, anon, authenticated;
grant  execute on function public.community_map_held(uuid, text) to service_role;

-- ─── 1 + 2. listing ──────────────────────────────────────────────────────────
create or replace function public.list_community_map(
  p_collection text default null,
  p_author     text default null,
  p_summary    text default null,
  p_title      text default null
)
returns table (token text, listed boolean, derived_from_title text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_coll   text := case when p_collection is null then null else btrim(p_collection) end;
  v_author text := nullif(btrim(coalesce(p_author, '')), '');
  v_tok    text;
  sh       record;
  v_origin uuid;
begin
  if v_uid is null then
    raise exception 'list_community_map: sign-in required' using errcode = '42501';
  end if;
  -- THE HOLD IS ON THE ACCOUNT (community_map_held): no collection of a held account is listed
  if public.community_map_held(v_uid, v_coll) then
    raise exception 'list_community_map: the operator has taken this account''s collections out of Community maps' using errcode = '55000';
  end if;
  select p.token into v_tok from public.publish_collection(v_coll, p_title) p;
  select c.id, c.listed_at, c.author_name, c.derived_from into sh
    from public.collection_shares c where c.token = v_tok and c.user_id = v_uid;
  v_author := coalesce(v_author, sh.author_name);
  if v_author is null then
    raise exception 'list_community_map: a name to show with the collection is required' using errcode = '22023';
  end if;
  -- THE ONE NAME RULE (display_name): NFKC, trimmed, no control / bidirectional / invisible character
  v_author := public.display_name(v_author, 40);
  if v_author is null then
    raise exception 'list_community_map: the name holds a character that cannot be shown, or is not 1..40 characters' using errcode = '22023';
  end if;
  v_origin := sh.derived_from;
  if v_origin is null and v_coll is not null then
    select k.share_id into v_origin from public.collection_copies k
     where k.user_id = v_uid and k.into_collection = v_coll and k.share_id <> sh.id
     order by k.copied_at desc limit 1;
  end if;

  update public.collection_shares c
     set listed_at          = coalesce(c.listed_at, now()),
         author_name        = v_author,
         summary            = coalesce(p_summary, c.summary),
         derived_from       = v_origin,
         content_updated_at = case when c.listed_at is null
                                   then coalesce((select b.changed from public.community_map_contents(v_uid, v_coll) b), now())
                                   else c.content_updated_at end
   where c.id = sh.id;

  token  := v_tok;
  listed := sh.listed_at is null;
  derived_from_title := (public.community_map_origin(v_origin)) ->> 'title';
  return next;
end;
$$;
comment on function public.list_community_map(text, text, text, text) is
  '(community-maps, security-review-nov) Lists one collection (NULL = everything) of the signed-in caller in Community maps under p_author (required the first time; kept after; held to public.display_name(…, 40) — 22023 otherwise) and p_summary, publishing it first through publish_collection() if it is not published. listed = false when it was already listed. Refuses every collection of an account an administrator holds (community_map_held — the hold is on the account; 55000). The only way a collection enters the directory.';
revoke execute on function public.list_community_map(text, text, text, text) from public, anon;
grant  execute on function public.list_community_map(text, text, text, text) to authenticated, service_role;

-- ─── 3. the doors only the server calls ──────────────────────────────────────
-- ⚠ PUBLIC too: a function is executable by PUBLIC unless revoked, and anon / authenticated inherit it.
revoke execute on function public.community_maps(text, text, integer, text, double precision[]) from public, anon, authenticated;
grant  execute on function public.community_maps(text, text, integer, text, double precision[]) to service_role;
revoke execute on function public.class_set_open(text) from public, anon, authenticated;
grant  execute on function public.class_set_open(text) to service_role;
revoke execute on function public.class_set_submit(text, text, jsonb) from public, anon, authenticated;
grant  execute on function public.class_set_submit(text, text, jsonb) to service_role;

comment on function public.class_set_open(text) is
  '(wave4-education, security-review-nov) What a student''s class link opens: the set''s quest (kind, seed, n), its title, whether it still takes answers and how many have handed in — never the teacher, never a student''s name or answer. {ok:false,error:not_found} for a code that is not a set. SERVER ONLY: called by the community-class Edge Function after a per-caller token (a direct call would answer whether a code exists with no bound on guesses). Students still need no account.';
comment on function public.class_set_submit(text, text, jsonb) is
  '(wave4-education, wave4-refine, security-review-nov) A student hands in a class set (name through public.display_name(name, 24); answers rebuilt and bounded; the set''s relay_take bucket ''class-answer'' — 45, refilled 45 every 10 minutes). SERVER ONLY: its first answers (not_found / closed / invalid_name) say whether a code exists, so it is reached only through the community-class Edge Function, which takes a per-caller token before the code is looked up. Students still need no account.';
comment on function public.community_maps(text, text, integer, text, double precision[]) is
  '(community-maps, wave4-refine, security-review-nov) The directory, a page at a time (keyset paging; at most 50 a page; no account and no e-mail in it). SERVER ONLY: an unbounded anonymous loop of this read was a load on the database, so it is reached through the community-class Edge Function, which takes a per-caller token first.';

-- ─── 4. the turn ledger: attempts in flight and the generation they opened ───
alter table public.ai_turns add column if not exists inflight integer not null default 0;
alter table public.ai_turns add column if not exists attempt_gen uuid not null default gen_random_uuid();
do $$ begin
  alter table public.ai_turns add constraint ai_turns_inflight_nonneg check (inflight >= 0);
exception when duplicate_object then null; end $$;
comment on column public.ai_turns.inflight is
  '(security-review-nov) Attempts of this turn that have consumed and not yet closed (settle or refund). A refund happens only when the last one closes without an answer.';
comment on column public.ai_turns.attempt_gen is
  '(security-review-nov) Which life of this (user, turn_key) row an attempt opened. A settle / refund that names another generation (a row deleted and made again under the same key) changes nothing.';

-- the return type grows a column (gen), which CREATE OR REPLACE cannot do
drop function if exists public.consume_ai_turn(uuid, integer, text, integer, integer);
create function public.consume_ai_turn(
  p_user        uuid,
  p_limit       integer,
  p_turn        text,
  p_max_calls   integer,
  p_ttl_seconds integer
)
returns table (used integer, allowed boolean, charged boolean, calls integer, reason text, gen uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count  integer;
  v_calls  integer;
  v_gen    uuid;
  v_fresh  boolean := false;
  v_key    text := coalesce(nullif(btrim(p_turn), ''), '');
begin
  if v_key = '' then
    -- no turn: every call charges, and its refund is the caller's one call of refund_ai_turn(…, '')
    select u.used, u.allowed into v_count, v_fresh from public.increment_ai_usage(p_user, p_limit) u;
    return query select v_count, v_fresh, v_fresh, 1, case when v_fresh then '' else 'limit' end, null::uuid;
    return;
  end if;

  v_key := left(v_key, 120);

  delete from public.ai_turns t
   where t.user_id = p_user
     and t.turn_key = v_key
     and t.started_at < now() - make_interval(secs => greatest(30, coalesce(p_ttl_seconds, 900)));

  insert into public.ai_turns as a (user_id, turn_key, usage_date, calls, charged, inflight)
  values (p_user, v_key, current_date, 1, true, 1)
  on conflict (user_id, turn_key)
    do update set calls = a.calls + 1, inflight = a.inflight + 1
  returning a.calls, a.attempt_gen into v_calls, v_gen;

  v_fresh := (v_calls = 1);

  if not v_fresh then
    if v_calls > greatest(1, coalesce(p_max_calls, 6)) then
      -- refused: this attempt never ran, so it does not hold the turn
      update public.ai_turns t set inflight = greatest(0, t.inflight - 1)
       where t.user_id = p_user and t.turn_key = v_key;
      select c.count into v_count from public.ai_usage c
        where c.user_id = p_user and c.usage_date = current_date;
      return query select coalesce(v_count, 0), false, false, v_calls, 'turn_calls'::text, null::uuid;
      return;
    end if;
    select c.count into v_count from public.ai_usage c
      where c.user_id = p_user and c.usage_date = current_date;
    return query select coalesce(v_count, 0), true, false, v_calls, ''::text, v_gen;
    return;
  end if;

  select u.used, u.allowed into v_count, v_fresh from public.increment_ai_usage(p_user, p_limit) u;
  if not v_fresh then
    delete from public.ai_turns t where t.user_id = p_user and t.turn_key = v_key;
    return query select v_count, false, false, 1, 'limit'::text, null::uuid;
    return;
  end if;
  return query select v_count, true, true, 1, ''::text, v_gen;
end;
$$;
comment on function public.consume_ai_turn(uuid, integer, text, integer, integer) is
  '(#R318, #R801, security-review-nov) One use per (account, turn): the first call charges ai_usage, later calls of the same turn are free up to p_max_calls. Every allowed call holds the turn (inflight + 1) until it closes with settle_ai_turn or refund_ai_turn, passing back `gen` — the generation of the row it opened.';
revoke execute on function public.consume_ai_turn(uuid, integer, text, integer, integer) from public, anon, authenticated;
grant  execute on function public.consume_ai_turn(uuid, integer, text, integer, integer) to service_role;

drop function if exists public.settle_ai_turn(uuid, text);
create or replace function public.settle_ai_turn(p_user uuid, p_turn text, p_gen uuid default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := left(coalesce(nullif(btrim(p_turn), ''), ''), 120);
begin
  if v_key = '' then return false; end if;
  update public.ai_turns t
     set succeeded  = true,
         settled_at = coalesce(t.settled_at, now()),
         inflight   = case when p_gen is null then t.inflight else greatest(0, t.inflight - 1) end
   where t.user_id = p_user and t.turn_key = v_key
     and (p_gen is null or t.attempt_gen = p_gen);
  return found;
end;
$$;
comment on function public.settle_ai_turn(uuid, text, uuid) is
  '(#R801, security-review-nov) The turn has an answer: no later failure under its key refunds it. With p_gen, closes that attempt and changes nothing on a row of another generation. → true when a row was settled, false when none matched (the caller records which).';
revoke execute on function public.settle_ai_turn(uuid, text, uuid) from public, anon, authenticated;
grant  execute on function public.settle_ai_turn(uuid, text, uuid) to service_role;

drop function if exists public.refund_ai_turn(uuid, text);
create or replace function public.refund_ai_turn(p_user uuid, p_turn text, p_gen uuid default null)
returns text
language plpgsql
security definer
set search_path = ''
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
       set count = greatest(0, u.count - 1)
     where u.user_id = p_user and u.usage_date = coalesce(r.usage_date, current_date);
  end if;
  return 'refunded';
end;
$$;
comment on function public.refund_ai_turn(uuid, text, uuid) is
  '(#R318, #R801, security-review-nov) An attempt of a turn closed without an answer. → ''refunded'' (the last attempt: the turn is released and its charge given back), ''held'' (another attempt is still running and decides), ''answered'' (the turn has an answer; nothing given back) or ''not_found'' (no row of that generation — already released, expired, or the key was reused). An empty turn key refunds the one charge of a turn-less call.';
revoke execute on function public.refund_ai_turn(uuid, text, uuid) from public, anon, authenticated;
grant  execute on function public.refund_ai_turn(uuid, text, uuid) to service_role;
