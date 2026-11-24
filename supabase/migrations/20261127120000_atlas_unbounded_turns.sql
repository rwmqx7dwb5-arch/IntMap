-- ============================================================================
--  IntMap · Atlas unbounded turns — no fixed call count, a key that lives while it works, and a day's spend
--  (docs/architecture/05-ai.md «委譲（delegation）», ai-proxy config.ts TURN_TTL_S / TURN_COST_CAP_USD)
-- ----------------------------------------------------------------------------
--  The user's decision of 2026-11-24: Atlas's FIXED COUNT ceilings are abolished for every reader. What stops a
--  turn is money (the per-turn-family fence, and a new per-account per-day fence), no-progress detection in the
--  page, the kill switch (ATLAS_DELEGATION=off) and the reader's Stop. In this ledger that means:
--
--  ① consume_ai_turn / consume_ai_child_turn: a NULL p_max_calls / p_max_children is «no count». A number still
--     refuses (the parameter stays, so an operator who sets ATLAS_DELEGATION_CHILDREN still bounds it). Before
--     this file a NULL read as 6 calls / 0 children.
--  ② The key's age is measured from its LAST allowed call (active_at), not from its first (started_at). TURN_TTL_S
--     becomes an idle timeout: a turn that keeps working is never cut, and never charged again, because its key
--     grew old. A worker's call refreshes its parent too — the parent is alive while its workers are.
--  ③ ai_turn_spend gets the same idle clock and the day it is reckoned to; reserve_ai_spend reserves against the
--     family's cap AND the account's day (public.ai_spend_day) in one transaction, and says which one refused
--     (`scope` 'turn' | 'day'). settle_ai_spend moves the reservation to spent on both rows.
--  Signatures of consume_ai_turn / consume_ai_child_turn / settle_ai_spend are unchanged (same argument types and
--  return shape), so every caller and grant holds. reserve_ai_spend gains a sixth, defaulted argument and a
--  wider return row, which CREATE OR REPLACE cannot do — the five-argument function is dropped and the six-argument
--  one answers the same five-argument calls.
--  Idempotent: every statement can run twice.
-- ============================================================================

-- ── ① ② the turn ledger ─────────────────────────────────────────────────────
alter table public.ai_turns add column if not exists active_at timestamptz;
comment on column public.ai_turns.active_at is
  '(atlas-unbounded-turns) When the last allowed call of this turn arrived (a worker''s call refreshes its parent). The key expires TURN_TTL_S after this — an idle timeout — not after started_at. NULL on a row written before the column existed: read as started_at.';

create or replace function public.consume_ai_turn(
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

  -- an IDLE key expires: measured from its last allowed call, not from its first
  delete from public.ai_turns t
   where t.user_id = p_user
     and t.turn_key = v_key
     and coalesce(t.active_at, t.started_at) < now() - make_interval(secs => greatest(30, coalesce(p_ttl_seconds, 900)));

  insert into public.ai_turns as a (user_id, turn_key, usage_date, calls, charged, inflight, active_at)
  values (p_user, v_key, current_date, 1, true, 1, now())
  on conflict (user_id, turn_key)
    do update set calls = a.calls + 1, inflight = a.inflight + 1
  returning a.calls, a.attempt_gen into v_calls, v_gen;

  v_fresh := (v_calls = 1);

  if not v_fresh then
    -- a count is refused only when the caller states one (NULL = no count, atlas-unbounded-turns)
    if p_max_calls is not null and v_calls > greatest(1, p_max_calls) then
      -- refused: this attempt never ran, so it does not hold the turn
      update public.ai_turns t set inflight = greatest(0, t.inflight - 1)
       where t.user_id = p_user and t.turn_key = v_key;
      select c.count into v_count from public.ai_usage c
        where c.user_id = p_user and c.usage_date = current_date;
      return query select coalesce(v_count, 0), false, false, v_calls, 'turn_calls'::text, null::uuid;
      return;
    end if;
    update public.ai_turns t set active_at = now()
     where t.user_id = p_user and t.turn_key = v_key;
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
  '(#R318, #R801, security-review-nov, atlas-unbounded-turns) One use per (account, turn): the first call charges ai_usage, later calls of the same turn are free — up to p_max_calls when the caller states one; NULL = no count. The key expires p_ttl_seconds after its LAST allowed call (active_at), so a working turn is never cut or re-charged by its age. Every allowed call holds the turn (inflight + 1) until it closes with settle_ai_turn or refund_ai_turn, passing back `gen` — the generation of the row it opened.';
revoke execute on function public.consume_ai_turn(uuid, integer, text, integer, integer) from public, anon, authenticated;
grant  execute on function public.consume_ai_turn(uuid, integer, text, integer, integer) to service_role;

create or replace function public.consume_ai_child_turn(
  p_user         uuid,
  p_parent       text,
  p_child        text,
  p_max_children integer,
  p_max_calls    integer,
  p_ttl_seconds  integer
)
returns table (allowed boolean, used integer, calls integer, children integer, reason text, gen uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent   text := left(coalesce(nullif(btrim(p_parent), ''), ''), 120);
  v_child    text := left(coalesce(nullif(btrim(p_child), ''), ''), 120);
  v_ttl      integer := greatest(30, coalesce(p_ttl_seconds, 900));
  v_children integer;
  v_calls    integer;
  v_gen      uuid;
  v_exists   boolean;
  v_used     integer;
begin
  select coalesce(max(c.count), 0)::integer into v_used from public.ai_usage c
   where c.user_id = p_user and c.usage_date = current_date;
  if v_parent = '' or v_child = '' or v_parent = v_child then
    return query select false, v_used, 0, 0, 'delegation_key'::text, null::uuid; return;
  end if;

  -- the parent must be a live turn of THIS account that a reader started (a child cannot open children);
  -- live = it, or one of its workers, made an allowed call within the idle timeout
  perform 1 from public.ai_turns t
   where t.user_id = p_user and t.turn_key = v_parent and t.parent_turn_key is null
     and coalesce(t.active_at, t.started_at) >= now() - make_interval(secs => v_ttl)
   for update;
  if not found then
    return query select false, v_used, 0, 0, 'delegation_parent'::text, null::uuid; return;
  end if;

  delete from public.ai_turns t
   where t.user_id = p_user and t.turn_key = v_child
     and coalesce(t.active_at, t.started_at) < now() - make_interval(secs => v_ttl);

  select exists (select 1 from public.ai_turns t where t.user_id = p_user and t.turn_key = v_child) into v_exists;
  if v_exists then
    -- the key is taken: it must be a child of this parent (a reader's own turn key cannot be borrowed)
    perform 1 from public.ai_turns t
     where t.user_id = p_user and t.turn_key = v_child and t.parent_turn_key = v_parent;
    if not found then
      return query select false, v_used, 0, 0, 'delegation_key'::text, null::uuid; return;
    end if;
  elsif p_max_children is not null then
    -- a count of children is refused only when the caller states one (NULL = no count)
    select count(*)::integer into v_children from public.ai_turns t
     where t.user_id = p_user and t.parent_turn_key = v_parent;
    if v_children >= greatest(0, p_max_children) then
      return query select false, v_used, 0, v_children, 'delegation_children'::text, null::uuid; return;
    end if;
  end if;

  insert into public.ai_turns as a (user_id, turn_key, usage_date, calls, charged, inflight, parent_turn_key, active_at)
  values (p_user, v_child, current_date, 1, false, 1, v_parent, now())
  on conflict (user_id, turn_key)
    do update set calls = a.calls + 1, inflight = a.inflight + 1
  returning a.calls, a.attempt_gen into v_calls, v_gen;

  select count(*)::integer into v_children from public.ai_turns t
   where t.user_id = p_user and t.parent_turn_key = v_parent;

  if p_max_calls is not null and v_calls > greatest(1, p_max_calls) then
    update public.ai_turns t set inflight = greatest(0, t.inflight - 1)
     where t.user_id = p_user and t.turn_key = v_child;
    return query select false, v_used, v_calls, v_children, 'turn_calls'::text, null::uuid; return;
  end if;
  -- allowed: the child is active, and so is the reader turn it works for
  update public.ai_turns t set active_at = now()
   where t.user_id = p_user and t.turn_key in (v_child, v_parent);
  return query select true, v_used, v_calls, v_children, ''::text, v_gen;
end;
$$;
comment on function public.consume_ai_child_turn(uuid, text, text, integer, integer, integer) is
  '(atlas-delegation, atlas-unbounded-turns) A worker call under a live parent turn (live = an allowed call of it or of its workers within the idle timeout). Never charges ai_usage. Refuses: delegation_key (empty, equal to the parent, or a key that is not this parent''s child), delegation_parent (no live reader turn of that key), delegation_children (the parent already opened p_max_children — only when a number is given), turn_calls (this child carried p_max_calls — only when a number is given). An allowed call refreshes the child''s and the parent''s active_at. Closes with settle_ai_turn / refund_ai_turn like any turn.';
revoke execute on function public.consume_ai_child_turn(uuid, text, text, integer, integer, integer) from public, anon, authenticated;
grant  execute on function public.consume_ai_child_turn(uuid, text, text, integer, integer, integer) to service_role;

-- the scratch-pad sweep reads the same idle clock: a turn a day IDLE is finished, a turn still working is not
create or replace function public.sweep_ai_turns()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  delete from public.ai_turns t where coalesce(t.active_at, t.started_at) < now() - interval '1 day';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.sweep_ai_turns() from public, anon, authenticated;
grant  execute on function public.sweep_ai_turns() to service_role;

-- ── ③ the spend ledger: the family's idle clock and its day ──────────────────
alter table public.ai_turn_spend add column if not exists active_at timestamptz;
alter table public.ai_turn_spend add column if not exists usage_date date;
comment on column public.ai_turn_spend.active_at is
  '(atlas-unbounded-turns) When this family last reserved. The row expires TURN_TTL_S after it (an idle timeout). NULL on a row written before the column existed: read as started_at.';
comment on column public.ai_turn_spend.usage_date is
  '(atlas-unbounded-turns) The day this family''s spend is reckoned to in public.ai_spend_day — the day it first reserved, so a family that works past midnight reserves and settles on one row.';

create table if not exists public.ai_spend_day (
  user_id         uuid        not null references auth.users(id) on delete cascade,
  usage_date      date        not null,
  reserved_micros bigint      not null default 0 check (reserved_micros >= 0),
  spent_micros    bigint      not null default 0 check (spent_micros >= 0),
  primary key (user_id, usage_date)
);
comment on table public.ai_spend_day is
  '(atlas-unbounded-turns) What one account reserved and spent with the AI provider on one day, in micro-dollars, across every turn family. The per-account day fence (ai-proxy aiUsdPerDay, _shared/plans.js). A reservation whose family expired unsettled stays counted — the ledger errs toward counting too much. Written only by ai-proxy.';
alter table public.ai_spend_day enable row level security;
revoke all on public.ai_spend_day from public, anon, authenticated;
grant all on public.ai_spend_day to service_role;

-- the return row grows (scope, the day's two figures), which CREATE OR REPLACE cannot do
drop function if exists public.reserve_ai_spend(uuid, text, bigint, bigint, integer);
create or replace function public.reserve_ai_spend(
  p_user            uuid,
  p_root            text,
  p_micros          bigint,
  p_cap_micros      bigint,
  p_ttl_seconds     integer,
  p_day_cap_micros  bigint default null
)
returns table (allowed boolean, reserved_micros bigint, spent_micros bigint, scope text, day_reserved_micros bigint, day_spent_micros bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_root   text := left(coalesce(nullif(btrim(p_root), ''), ''), 120);
  v_micros bigint := greatest(0, coalesce(p_micros, 0));
  r        record;
  d        record;
begin
  if v_root = '' then
    return query select true, 0::bigint, 0::bigint, ''::text, 0::bigint, 0::bigint; return;   -- a turn-less call has no family to bound
  end if;
  delete from public.ai_turn_spend s
   where s.user_id = p_user and s.root_key = v_root
     and coalesce(s.active_at, s.started_at) < now() - make_interval(secs => greatest(30, coalesce(p_ttl_seconds, 900)));
  insert into public.ai_turn_spend as s (user_id, root_key, usage_date, active_at) values (p_user, v_root, current_date, now())
  on conflict (user_id, root_key) do nothing;
  -- locks in one order everywhere (the family row, then the day row), so two families of one account cannot deadlock
  select s.reserved_micros, s.spent_micros, coalesce(s.usage_date, current_date) as usage_date into r from public.ai_turn_spend s
   where s.user_id = p_user and s.root_key = v_root for update;
  insert into public.ai_spend_day as a (user_id, usage_date) values (p_user, r.usage_date)
  on conflict (user_id, usage_date) do nothing;
  select a.reserved_micros, a.spent_micros into d from public.ai_spend_day a
   where a.user_id = p_user and a.usage_date = r.usage_date for update;

  if r.reserved_micros + r.spent_micros + v_micros > greatest(0, coalesce(p_cap_micros, 0)) then
    return query select false, r.reserved_micros, r.spent_micros, 'turn'::text, d.reserved_micros, d.spent_micros; return;
  end if;
  if p_day_cap_micros is not null and d.reserved_micros + d.spent_micros + v_micros > greatest(0, p_day_cap_micros) then
    return query select false, r.reserved_micros, r.spent_micros, 'day'::text, d.reserved_micros, d.spent_micros; return;
  end if;

  update public.ai_turn_spend s
     set reserved_micros = s.reserved_micros + v_micros, active_at = now(), usage_date = r.usage_date
   where s.user_id = p_user and s.root_key = v_root;
  update public.ai_spend_day a set reserved_micros = a.reserved_micros + v_micros
   where a.user_id = p_user and a.usage_date = r.usage_date;
  return query select true, r.reserved_micros + v_micros, r.spent_micros, ''::text, d.reserved_micros + v_micros, d.spent_micros;
end;
$$;
comment on function public.reserve_ai_spend(uuid, text, bigint, bigint, integer, bigint) is
  '(atlas-delegation, atlas-unbounded-turns) Reserve an estimated cost for one provider request of a turn family, on the family row and on the account''s day (public.ai_spend_day) in one transaction. Refused (allowed=false) when reserved + spent + this estimate would pass the family''s cap (scope ''turn'') or, when p_day_cap_micros is given, the account''s day cap (scope ''day''). A family row expires p_ttl_seconds after its last reservation. Settle with settle_ai_spend.';
revoke execute on function public.reserve_ai_spend(uuid, text, bigint, bigint, integer, bigint) from public, anon, authenticated;
grant  execute on function public.reserve_ai_spend(uuid, text, bigint, bigint, integer, bigint) to service_role;

create or replace function public.settle_ai_spend(
  p_user     uuid,
  p_root     text,
  p_reserved bigint,
  p_actual   bigint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_root text := left(coalesce(nullif(btrim(p_root), ''), ''), 120);
  v_res  bigint := greatest(0, coalesce(p_reserved, 0));
  v_act  bigint := greatest(0, coalesce(p_actual, 0));
  v_date date;
begin
  if v_root = '' then return false; end if;
  update public.ai_turn_spend s
     set reserved_micros = greatest(0, s.reserved_micros - v_res),
         spent_micros    = s.spent_micros + v_act
   where s.user_id = p_user and s.root_key = v_root
  returning coalesce(s.usage_date, current_date) into v_date;
  if not found then return false; end if;
  -- the same day the reservation was made on (the family's), never the clock's
  insert into public.ai_spend_day as a (user_id, usage_date, reserved_micros, spent_micros)
  values (p_user, v_date, 0, v_act)
  on conflict (user_id, usage_date) do update
    set reserved_micros = greatest(0, a.reserved_micros - v_res),
        spent_micros    = a.spent_micros + v_act;
  return true;
end;
$$;
comment on function public.settle_ai_spend(uuid, text, bigint, bigint) is
  '(atlas-delegation, atlas-unbounded-turns) Replace a reservation with what the provider actually billed, on the family row and on the account''s day the family is reckoned to. → false when the family row is gone (expired), which the caller records.';
revoke execute on function public.settle_ai_spend(uuid, text, bigint, bigint) from public, anon, authenticated;
grant  execute on function public.settle_ai_spend(uuid, text, bigint, bigint) to service_role;

-- the account's data inventory states the new table (supabase/tests/23_account_data_center_test.sql:
-- every table that holds a reader's rows has its sentence in account_data_catalog)
insert into public.account_data_catalog (tbl, written_by, label_en, label_jp, purpose_en, purpose_jp, retention_en, retention_jp) values
  ('ai_spend_day', 'intmap',
   'AI spending per day', '1日あたりのAIの費用',
   'One row per day you used AI, holding what all your AI questions that day reserved and spent with the AI provider, so that one account cannot spend past its daily limit.',
   'AIを使った日ごとに1行の記録。その日のあなたのAIの質問すべてが、AI提供元に対して予約した額と使った額を持ち、1つのアカウントが1日の上限を超えて使えないようにします。',
   'One row per day; kept until you delete your account.',
   '1日1行。アカウントを削除するまで保持します。')
on conflict (tbl) do update set
  written_by = excluded.written_by, label_en = excluded.label_en, label_jp = excluded.label_jp,
  purpose_en = excluded.purpose_en, purpose_jp = excluded.purpose_jp,
  retention_en = excluded.retention_en, retention_jp = excluded.retention_jp;
