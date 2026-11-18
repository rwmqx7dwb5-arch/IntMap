-- ============================================================================
--  IntMap · Atlas delegation — a child turn's allowance and a turn family's spend
--  (docs/architecture/05-ai.md «委譲（delegation）»)
-- ----------------------------------------------------------------------------
--  Two ledgers, both written only by ai-proxy (service_role):
--
--  ① A CHILD TURN. Atlas may hand a piece of work to a worker model. The worker's calls carry their own
--     turn key and name the parent's (x-intmap-parent-turn). A child row lives in public.ai_turns beside
--     its parent's, linked by parent_turn_key, and NEVER charges the reader's day: the parent's first call
--     already paid for the request. consume_ai_child_turn bounds how many children one parent may open and
--     how many calls one child may carry — both stated by the CALLER (ai-proxy config.ts DELEGATION), the
--     way consume_ai_turn takes p_max_calls. A child closes with the existing settle_ai_turn /
--     refund_ai_turn: its row has charged = false, so a refund releases the row and gives nothing back.
--
--  ② A TURN FAMILY'S SPEND, in micro-dollars, reserved BEFORE a provider request and settled AFTER it.
--     The family is the root turn key (the parent's; a child spends from its parent's). A reservation that
--     is never settled (the isolate died between the two) is held until the row's TTL and then dropped
--     with it — the ledger errs toward counting too much, never too little.
-- ============================================================================

alter table public.ai_turns add column if not exists parent_turn_key text;
comment on column public.ai_turns.parent_turn_key is
  '(atlas-delegation) The turn key of the turn that opened this one as a worker. NULL for a turn a reader started.';
create index if not exists ai_turns_parent_idx on public.ai_turns (user_id, parent_turn_key) where parent_turn_key is not null;

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

  -- the parent must be a live turn of THIS account that a reader started (a child cannot open children)
  perform 1 from public.ai_turns t
   where t.user_id = p_user and t.turn_key = v_parent and t.parent_turn_key is null
     and t.started_at >= now() - make_interval(secs => v_ttl)
   for update;
  if not found then
    return query select false, v_used, 0, 0, 'delegation_parent'::text, null::uuid; return;
  end if;

  delete from public.ai_turns t
   where t.user_id = p_user and t.turn_key = v_child
     and t.started_at < now() - make_interval(secs => v_ttl);

  select exists (select 1 from public.ai_turns t where t.user_id = p_user and t.turn_key = v_child) into v_exists;
  if v_exists then
    -- the key is taken: it must be a child of this parent (a reader's own turn key cannot be borrowed)
    perform 1 from public.ai_turns t
     where t.user_id = p_user and t.turn_key = v_child and t.parent_turn_key = v_parent;
    if not found then
      return query select false, v_used, 0, 0, 'delegation_key'::text, null::uuid; return;
    end if;
  else
    select count(*)::integer into v_children from public.ai_turns t
     where t.user_id = p_user and t.parent_turn_key = v_parent;
    if v_children >= greatest(0, coalesce(p_max_children, 0)) then
      return query select false, v_used, 0, v_children, 'delegation_children'::text, null::uuid; return;
    end if;
  end if;

  insert into public.ai_turns as a (user_id, turn_key, usage_date, calls, charged, inflight, parent_turn_key)
  values (p_user, v_child, current_date, 1, false, 1, v_parent)
  on conflict (user_id, turn_key)
    do update set calls = a.calls + 1, inflight = a.inflight + 1
  returning a.calls, a.attempt_gen into v_calls, v_gen;

  select count(*)::integer into v_children from public.ai_turns t
   where t.user_id = p_user and t.parent_turn_key = v_parent;

  if v_calls > greatest(1, coalesce(p_max_calls, 1)) then
    update public.ai_turns t set inflight = greatest(0, t.inflight - 1)
     where t.user_id = p_user and t.turn_key = v_child;
    return query select false, v_used, v_calls, v_children, 'turn_calls'::text, null::uuid; return;
  end if;
  return query select true, v_used, v_calls, v_children, ''::text, v_gen;
end;
$$;
comment on function public.consume_ai_child_turn(uuid, text, text, integer, integer, integer) is
  '(atlas-delegation) A worker call under a live parent turn. Never charges ai_usage. Refuses: delegation_key (empty, equal to the parent, or a key that is not this parent''s child), delegation_parent (no live reader turn of that key), delegation_children (the parent already opened p_max_children), turn_calls (this child carried p_max_calls). Closes with settle_ai_turn / refund_ai_turn like any turn.';
revoke execute on function public.consume_ai_child_turn(uuid, text, text, integer, integer, integer) from public, anon, authenticated;
grant  execute on function public.consume_ai_child_turn(uuid, text, text, integer, integer, integer) to service_role;

create table if not exists public.ai_turn_spend (
  user_id         uuid        not null references auth.users(id) on delete cascade,
  root_key        text        not null,
  reserved_micros bigint      not null default 0,
  spent_micros    bigint      not null default 0,
  started_at      timestamptz not null default now(),
  primary key (user_id, root_key)
);
comment on table public.ai_turn_spend is
  '(atlas-delegation) What one turn family (a reader turn and the workers it opened) has reserved and spent with the AI provider, in micro-dollars. Written only by ai-proxy.';
alter table public.ai_turn_spend enable row level security;
revoke all on public.ai_turn_spend from public, anon, authenticated;
grant all on public.ai_turn_spend to service_role;

create or replace function public.reserve_ai_spend(
  p_user        uuid,
  p_root        text,
  p_micros      bigint,
  p_cap_micros  bigint,
  p_ttl_seconds integer
)
returns table (allowed boolean, reserved_micros bigint, spent_micros bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_root text := left(coalesce(nullif(btrim(p_root), ''), ''), 120);
  r      record;
begin
  if v_root = '' then
    return query select true, 0::bigint, 0::bigint; return;   -- a turn-less call has no family to bound
  end if;
  delete from public.ai_turn_spend s
   where s.user_id = p_user and s.root_key = v_root
     and s.started_at < now() - make_interval(secs => greatest(30, coalesce(p_ttl_seconds, 900)));
  insert into public.ai_turn_spend as s (user_id, root_key) values (p_user, v_root)
  on conflict (user_id, root_key) do nothing;
  select s.reserved_micros, s.spent_micros into r from public.ai_turn_spend s
   where s.user_id = p_user and s.root_key = v_root for update;
  if r.reserved_micros + r.spent_micros + greatest(0, coalesce(p_micros, 0)) > greatest(0, coalesce(p_cap_micros, 0)) then
    return query select false, r.reserved_micros, r.spent_micros; return;
  end if;
  update public.ai_turn_spend s set reserved_micros = s.reserved_micros + greatest(0, coalesce(p_micros, 0))
   where s.user_id = p_user and s.root_key = v_root;
  return query select true, r.reserved_micros + greatest(0, coalesce(p_micros, 0)), r.spent_micros;
end;
$$;
comment on function public.reserve_ai_spend(uuid, text, bigint, bigint, integer) is
  '(atlas-delegation) Reserve an estimated cost for one provider request of a turn family. Refused (allowed=false) when reserved + spent + this estimate would pass the cap. Settle with settle_ai_spend.';
revoke execute on function public.reserve_ai_spend(uuid, text, bigint, bigint, integer) from public, anon, authenticated;
grant  execute on function public.reserve_ai_spend(uuid, text, bigint, bigint, integer) to service_role;

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
begin
  if v_root = '' then return false; end if;
  update public.ai_turn_spend s
     set reserved_micros = greatest(0, s.reserved_micros - greatest(0, coalesce(p_reserved, 0))),
         spent_micros    = s.spent_micros + greatest(0, coalesce(p_actual, 0))
   where s.user_id = p_user and s.root_key = v_root;
  return found;
end;
$$;
comment on function public.settle_ai_spend(uuid, text, bigint, bigint) is
  '(atlas-delegation) Replace a reservation with what the provider actually billed. → false when the family row is gone (expired), which the caller records.';
revoke execute on function public.settle_ai_spend(uuid, text, bigint, bigint) from public, anon, authenticated;
grant  execute on function public.settle_ai_spend(uuid, text, bigint, bigint) to service_role;
