-- ============================================================================
--  #R491 — THE TERM GLOSS HAS ITS OWN DAY, NOT A SLICE OF THE READER'S QUESTIONS
-- ----------------------------------------------------------------------------
--  Selecting a phrase inside an Atlas answer and asking what it means is a new kind of AI call:
--  tiny prompt, ~700 tokens of output, no web search, no tools. Charging it against
--  public.ai_usage would have made it unusable for what it is FOR — a reader who looks up three
--  terms while reading one answer would have no questions left for the day (free = 10).
--
--  So the gloss gets its own counter with its own limit. It is a SEPARATE LANE, not a bigger
--  allowance: exhausting the gloss budget cannot touch the reader's ability to ask Atlas a
--  question, and exhausting their questions cannot stop them looking a word up.
--
--  ⚠ THE LANE IS DECLARED IN A HEADER AND VERIFIED AGAINST THE BODY. ai-proxy consumes quota
--  BEFORE it parses the body (so an over-quota caller's body is never parsed), which is why the
--  turn key of #R318 is a header — and why this lane is one too. After the body is parsed the
--  function checks that `task === "gloss"`, and a mismatch refunds and 400s. Without that check,
--  "x-intmap-lane: gloss" would be a free pass to the expensive tasks.
--
--  ⚠ IT IS THE SAME SHAPE AS ai_usage, DELIBERATELY. Same primary key, same "written only through
--  SECURITY DEFINER RPCs granted to service_role", same "owner may read their own row" policy.
--  A second quota that behaved differently from the first would be a second thing to reason about.
-- ============================================================================

begin;

-- ─────────────────────────────────────────────────────────────────────────────
--  1. THE COUNTER — one row per (account, day), exactly like public.ai_usage.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.ai_gloss_usage (
  user_id    uuid    not null references auth.users(id) on delete cascade,
  usage_date date    not null default current_date,
  count      integer not null default 0,
  primary key (user_id, usage_date)
);
comment on table public.ai_gloss_usage is
  'Daily counter for the Atlas term-gloss lane (#R491) — separate from ai_usage so looking a word up never spends a question. Mutated only through the SECURITY DEFINER RPCs; users may read only their own row.';

-- ─────────────────────────────────────────────────────────────────────────────
--  2. consume_ai_gloss / refund_ai_gloss — the ONLY writers, mirroring
--     increment_ai_usage / refund_ai_usage line for line.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.consume_ai_gloss(p_user uuid, p_limit integer)
returns table (used integer, allowed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.ai_gloss_usage as g (user_id, usage_date, count)
  values (p_user, current_date, 1)
  on conflict (user_id, usage_date)
    do update set count = g.count + 1
    where g.count < p_limit
  returning g.count into v_count;

  if v_count is null then
    -- Over the limit (the update was skipped) — report the current count, not allowed.
    select a.count into v_count from public.ai_gloss_usage a
      where a.user_id = p_user and a.usage_date = current_date;
    return query select coalesce(v_count, p_limit), false;
  else
    return query select v_count, true;
  end if;
end;
$$;

create or replace function public.refund_ai_gloss(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.ai_gloss_usage
    set count = greatest(0, count - 1)
    where user_id = p_user and usage_date = current_date;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  3. RLS + grants — nobody may write it; the owner may read their own row
--     (js/ai-core.js reads it to show the remaining gloss budget before spending one).
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.ai_gloss_usage enable row level security;

drop policy if exists ai_gloss_usage_select_own on public.ai_gloss_usage;
create policy ai_gloss_usage_select_own on public.ai_gloss_usage
  for select to authenticated
  using (user_id = (select auth.uid()));

grant select on public.ai_gloss_usage to authenticated;

revoke execute on function public.consume_ai_gloss(uuid, integer) from public, anon, authenticated;
revoke execute on function public.refund_ai_gloss(uuid)           from public, anon, authenticated;
grant  execute on function public.consume_ai_gloss(uuid, integer) to service_role;
grant  execute on function public.refund_ai_gloss(uuid)           to service_role;

commit;
