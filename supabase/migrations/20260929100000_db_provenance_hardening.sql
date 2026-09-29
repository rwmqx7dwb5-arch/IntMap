-- ============================================================================
--  db-provenance-hardening — WHO WROTE A COMMUNITY POST, AND WHEN, IS SAID BY
--  THE DATABASE; A PUBLIC BUCKET IS READ BY URL, NOT LISTED
-- ----------------------------------------------------------------------------
--  1. PROVENANCE OF A POST / COMMENT. #R801 narrowed the UPDATE grant on
--     community_posts / community_comments to the content columns, so an author can no
--     longer rewrite author_name or created_at AFTERWARDS. The INSERT grant was still the
--     whole row (#R155 re-grant, `grant insert, update, delete … to authenticated`), and the
--     only insert policy checks `user_id = auth.uid()`. So one REST call —
--        POST /rest/v1/community_posts {"user_id":<me>,"author_name":"IntMap運営",
--                                       "created_at":"2099-01-01", …}
--     — published a post under any display name (another reader's, the operator's) and
--     pinned it to the top of the «new» and «hot» orderings, which sort by created_at.
--     The client (js/community-board.js cmAddPost, js/community.js cmComment) sends
--     author_name = its own idea of the reader's name; nothing on the server compared it
--     with anything.
--     Two layers, the same two #R155 put on profiles:
--       · tg_community_stamp_provenance — BEFORE INSERT, grant-independent. For any caller
--         that is not service_role or a trusted no-JWT session it WRITES author_name from
--         the author's own public card (public.profiles_public, the row the author card
--         reads) and created_at from now(), and clears edited_at. What the request said
--         about those three columns is never read. When the card has no name the handle is
--         the one the client already shows for such a reader
--         (js/auth-ui.js refreshCurrentUser: «User-» + the first five alphanumerics of the id,
--         #R33 — never derived from the e-mail), so an unnamed reader's posts read the same
--         as before.
--       · the INSERT grant becomes column-level, and lists exactly the columns the two
--         insert paths send. created_at, edited_at and id are not among them, so a request
--         naming them is refused (42501) rather than silently rewritten. author_name stays
--         in the list because every shipped client sends it — the trigger, not the grant,
--         decides its value.
--
--  2. A PUBLIC BUCKET NEEDS NO SELECT POLICY TO BE READ. aviation, gdelt and ais are
--     `public = true`; every reader of them — the three Edge Functions, and nothing in js/ —
--     GETs /storage/v1/object/public/<bucket>/<object>, which Storage serves without
--     consulting RLS. Their writes use the service key, which bypasses RLS. So the one thing
--     the three `for select using (bucket_id = …)` policies added was the LIST endpoint:
--     anyone holding the publishable key could enumerate every object name in them
--     (measured by reading every caller on 2026-09-29: no .list(), no /object/list, no
--     storage-js client anywhere in js/ or supabase/functions/). They are dropped BY NAME —
--     not by a loop over «select policies on public buckets» — because this project is
--     shared with another application (MIGRATIONS.md: the mgmt / passkeys versions), and a
--     policy on a bucket that application owns is not ours to remove.
--     ⚠ DROP POLICY is on MIGRATIONS.md's destructive list. Blast radius: object listing and
--     the authenticated (non-/public/) download route on these three buckets, which nothing
--     calls. Recovery: re-run the three `create policy` statements from the bucket migrations.
--
--  NOT IN THIS FILE, AND WHY
--   · The news_event_* SECURITY DEFINER functions already run with search_path = '' — #R801
--     (20260918090000 §4) pinned them with ALTER FUNCTION, and their bodies qualify every
--     object. The `set search_path = public` still visible in 20260824090000 /
--     20260824190000 is the value those files created them with, not the value they have.
--     supabase/tests/12_db_provenance_hardening_test.sql asserts the property over pg_proc,
--     so a later CREATE OR REPLACE that brings `public` back is caught wherever it happens.
--   · Restricting community_posts.img / profiles.avatar_url to this project's Storage: the
--     client does not upload to Storage at all — both are inline data: URLs
--     (js/app-body.js compressImage, js/auth-ui.js avatar crop). Recorded as a residual risk
--     in docs/SECURITY-ARCHITECTURE.md §8 instead of being implemented against a design the
--     client does not have.
-- ============================================================================
begin;

-- ─────────────────────────────────────────────────────────────────────────────
--  1a. THE STAMP
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.tg_community_stamp_provenance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  v_name text;
begin
  -- service_role (server) or a trusted direct DB session (no JWT: migrations, seed, pg_cron)
  -- states its own provenance — the same boundary tg_profiles_guard_privcols draws.
  if v_role = 'service_role' or v_role = '' then
    return new;
  end if;

  select nullif(btrim(p.display_name), '')
    into v_name
    from public.profiles_public p
   where p.id = new.user_id;

  -- 120 = the author_name ceiling of comm_posts_len_guard / comm_comments_len_guard (#R155);
  -- a longer display name must not turn a valid post into a constraint violation.
  new.author_name := left(coalesce(v_name,
                                   'User-' || left(regexp_replace(new.user_id::text, '[^a-z0-9]', '', 'gi'), 5)),
                          120);
  new.created_at  := now();
  new.edited_at   := null;
  return new;
end;
$$;
comment on function public.tg_community_stamp_provenance() is
  'BEFORE INSERT on community_posts / community_comments: author_name comes from the author''s profiles_public card and created_at from now(), for every caller that is not service_role or a trusted no-JWT session. What the request said about author_name / created_at / edited_at is never read.';

drop trigger if exists trg_community_posts_provenance on public.community_posts;
create trigger trg_community_posts_provenance
  before insert on public.community_posts
  for each row execute function public.tg_community_stamp_provenance();

drop trigger if exists trg_community_comments_provenance on public.community_comments;
create trigger trg_community_comments_provenance
  before insert on public.community_comments
  for each row execute function public.tg_community_stamp_provenance();

-- A trigger function is not an RPC; nobody needs EXECUTE on it (20260926090000's rule).
revoke execute on function public.tg_community_stamp_provenance() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
--  1b. THE INSERT GRANT NAMES THE COLUMNS THE CLIENT SENDS
--      (REVOKE of a table privilege also takes any column grant of it away, so this pair
--       leaves exactly the list below.)
-- ─────────────────────────────────────────────────────────────────────────────
revoke insert on public.community_posts    from anon, authenticated;
revoke insert on public.community_comments from anon, authenticated;
grant insert (user_id, author_name, title, body, img, lat, lng, category) on public.community_posts    to authenticated;
grant insert (post_id, user_id, author_name, body, parent_id)             on public.community_comments to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
--  2. A PUBLIC BUCKET IS READ BY URL; NOBODY LISTS IT
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "aviation snapshot is world readable" on storage.objects;
drop policy if exists "gdelt cache is world readable"       on storage.objects;
drop policy if exists "ais snapshot is world readable"      on storage.objects;

commit;
