-- ============================================================================
--  #R801 — A TURN THAT HAS ALREADY ANSWERED CANNOT BE REFUNDED, AND THE OTHER
--          FINDINGS OF THE SEPTEMBER 2026 SECURITY AUDIT THAT LIVE IN SQL
-- ----------------------------------------------------------------------------
--  1. THE REFUND HOLE. ai_turns (#R318) recorded one fact per turn — `charged`, written true on the
--     first call and never updated — and refund_ai_turn read that fact, deleted the row and gave the
--     day's use back. Nothing in the ledger said whether the turn had ALREADY PRODUCED AN ANSWER.
--     So the sequence «ask, receive the answer, then send one more request under the same
--     x-intmap-turn with a task the proxy refuses» was refunded: the proxy's refund() ran on every
--     4xx it issued after consuming, and the SQL saw a charged turn and released it. The answer had
--     been served; the provider had been paid; the reader's counter went back by one.
--     Two changes close it, and both are in the ledger rather than in the proxy's branches:
--       · `succeeded` — set by settle_ai_turn the moment a provider answer is returned. A refund is
--         refused for a turn that has succeeded, whichever call asks for it.
--       · the refund is ONE statement — `delete … returning` — so two refunds racing for the same
--         turn cannot both read `charged = true` and both decrement (the SELECT-then-DELETE it
--         replaces let them).
--     The proxy, for its part, no longer asks for a refund from a call that did not charge (a
--     continuation of a paid turn has nothing to give back). That is belt; this file is braces.
--     ⚠ WHAT REMAINS OPEN, AND WHY: a first call that fails and a continuation that succeeds, in
--     flight at the same instant, can still refund before the success is settled (the settle then
--     updates zero rows). The window is the provider's round-trip of the failing call after the
--     continuation has already been answered — Atlas issues its continuations after the first answer,
--     not alongside it, so the window is not on any measured path; it is stated so nobody reads
--     «closed» here and stops looking.
--  2. THE DATE SEAM. refund_ai_usage decrements the row for current_date. A turn charged at 23:59
--     and refunded at 00:01 took its refund from the next day's row (never below zero, so no free
--     use — but the wrong day). The turn row carries usage_date; the refund now uses it.
--  3. GRANTS THAT DEFAULT PRIVILEGES HANDED OUT. Supabase's default privileges give anon and
--     authenticated ALL on every new table (docs/SECURITY-ARCHITECTURE.md §5), and #R155 revoked
--     that from the tables of its day. Three tables created since (ai_turns, ai_gloss_usage,
--     news_event_admin_actions) only ADDED a grant and never took the default away. RLS stops the
--     DML, but TRUNCATE, REFERENCES and TRIGGER do not go through RLS. This is fixed for the SCHEMA,
--     not for three names: the loop below revokes those three privileges from every table in
--     public, so the next table created without a revoke is covered as well.
--  4. search_path. docs/DATABASE.md said every SECURITY DEFINER function pins an empty search_path;
--     eleven did not. Eight of them (the news-event admin RPCs and the profiles_public sync trigger)
--     qualify every object they touch and are pinned to '' here. Three (the embedding functions)
--     use pgvector's `<=>` operator, which lives in the extensions schema and is resolved through
--     the search_path; they are pinned to `extensions` alone — public, the one schema a caller
--     could conceivably create a shadowing object in, is out of their path.
--  5. WHO A FEEDBACK ROW SAYS IT IS FROM. feedback and bug_reports accept anonymous inserts with
--     `with check (true)`, and both carry a user_id column — so any caller could file a report as
--     any existing account. The check now requires user_id to be null or the caller's own.
--  6. WHAT AN AUTHOR MAY EDIT. community_posts / community_comments granted UPDATE on the whole row
--     to authenticated (RLS scopes it to the author's rows), so an author could rewrite created_at
--     and author_name of their own post. The grant is narrowed to the columns the editor sends
--     (js/community-board.js cmEditPost, js/community.js cmEditComment).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
--  1. THE LEDGER LEARNS WHETHER THE TURN ANSWERED
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.ai_turns add column if not exists succeeded boolean not null default false;
alter table public.ai_turns add column if not exists settled_at timestamptz;
comment on column public.ai_turns.succeeded is
  'True once any call of this turn returned a provider answer (settle_ai_turn). A succeeded turn is never refunded.';

-- settle_ai_turn — the proxy calls it right after a provider answer is produced. Idempotent: a
-- second settle of the same turn changes nothing. An empty key has no turn to settle.
create or replace function public.settle_ai_turn(p_user uuid, p_turn text)
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
     set succeeded = true, settled_at = coalesce(t.settled_at, now())
   where t.user_id = p_user and t.turn_key = v_key;
  return found;
end;
$$;

-- refund_ai_turn — same signature as #R318 (supabase/tests/00 asserts it), new body:
--   · one DELETE … RETURNING, so concurrent refunds cannot both see `charged`;
--   · refuses (deletes nothing, refunds nothing) once the turn has succeeded;
--   · gives the use back to the day the turn was charged on, not to today.
create or replace function public.refund_ai_turn(p_user uuid, p_turn text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key     text := coalesce(nullif(btrim(p_turn), ''), '');
  v_charged boolean;
  v_date    date;
begin
  if v_key = '' then
    perform public.refund_ai_usage(p_user);
    return;
  end if;
  v_key := left(v_key, 120);
  delete from public.ai_turns t
   where t.user_id = p_user and t.turn_key = v_key and not t.succeeded
   returning t.charged, t.usage_date into v_charged, v_date;
  if found and coalesce(v_charged, false) then
    update public.ai_usage u
       set count = greatest(0, u.count - 1)
     where u.user_id = p_user and u.usage_date = coalesce(v_date, current_date);
  end if;
end;
$$;

revoke execute on function public.settle_ai_turn(uuid, text) from public, anon, authenticated;
grant  execute on function public.settle_ai_turn(uuid, text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  3. PRIVILEGES THAT NEVER GO THROUGH RLS, REVOKED FROM EVERY TABLE IN public
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format('revoke truncate, references, trigger on public.%I from anon, authenticated', r.relname);
  end loop;
end
$$;
-- The three tables that had kept the default ALL: take the default away, then re-grant exactly what
-- their own migrations granted (owner-scoped SELECT; RLS still decides which rows).
revoke all on public.ai_turns                 from anon, authenticated;
revoke all on public.ai_gloss_usage           from anon, authenticated;
revoke all on public.news_event_admin_actions from anon, authenticated;
grant select on public.ai_turns                 to authenticated;
grant select on public.ai_gloss_usage           to authenticated;
grant select on public.news_event_admin_actions to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
--  4. search_path PINNED
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  f text;
  pinned text[] := array[
    'public.news_event_recount(bigint)',
    'public.news_event_merge_into(bigint, bigint, uuid, text)',
    'public.news_event_merge_into(bigint, bigint, uuid, text, text)',
    'public.news_event_merge(bigint, bigint, text)',
    'public.news_event_reassign(bigint[], bigint, text)',
    'public.news_event_update_meta(bigint, text, text, double precision, double precision, text, boolean, boolean, text)',
    'public.news_event_undo(bigint)',
    'public.sync_profiles_public()'
  ];
  vec text[] := array[
    'public.news_embedding_candidates(bigint[], integer, real)',
    'public.news_articles_set_embeddings(jsonb)',
    'public.news_event_link_candidates(integer, real, integer)'
  ];
begin
  foreach f in array pinned loop
    if to_regprocedure(f) is not null then
      execute format('alter function %s set search_path = ''''', f);
    end if;
  end loop;
  foreach f in array vec loop
    if to_regprocedure(f) is not null then
      execute format('alter function %s set search_path = extensions', f);
    end if;
  end loop;
end
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  5. A REPORT MAY BE ANONYMOUS OR THE CALLER'S OWN, NEVER SOMEBODY ELSE'S
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists feedback_insert_any on public.feedback;
create policy feedback_insert_any on public.feedback
  for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));

drop policy if exists bug_reports_insert_any on public.bug_reports;
create policy bug_reports_insert_any on public.bug_reports
  for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
--  6. AN AUTHOR EDITS THE FIELDS OF THE POST, NOT ITS PROVENANCE
-- ─────────────────────────────────────────────────────────────────────────────
revoke update on public.community_posts    from authenticated;
revoke update on public.community_comments from authenticated;
grant update (title, body, img, lat, lng, category, edited_at) on public.community_posts    to authenticated;
grant update (body, edited_at)                                on public.community_comments to authenticated;
