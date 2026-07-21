-- ============================================================================
--  IntMap — SECURITY HARDENING migration (#R155)  — LEAST-PRIVILEGE + PROFILES GUARD
-- ----------------------------------------------------------------------------
--  Additive, idempotent, NON-DESTRUCTIVE (no DROP TABLE/COLUMN, no data DELETE).
--  Applied through the same manual/gated flow as the other migrations.
--
--  WHY (the confirmed, prod-verified root cause — audited live on 2026-07-22)
--    Production had DIVERGED from the migration files, and the real state was worse
--    than the reconstructed baseline. Two live CRITICAL issues, both on `profiles`:
--
--    (A) PII LEAK. profiles carried TWO redundant permissive SELECT policies to the
--        `public` role — "Allow public read access to profiles" and "profiles public
--        read", both `USING (true)`. RLS ORs policies, so these overrode the intended
--        own+admin policy: ANY anon/authenticated caller could read EVERY column of
--        EVERY user — including email, is_admin, is_pro and plan. The whole user
--        table (all emails) was world-readable via the public anon key.
--
--    (B) PRIVILEGE / BILLING ESCALATION. Supabase's schema-wide DEFAULT PRIVILEGES
--        grant every role a blanket table-level UPDATE on every public table, and
--        profiles' UPDATE policy is row-only (USING/CHECK auth.uid() = id, NO column
--        filter). A pre-existing prod trigger `guard_admin_flag` froze the is_admin
--        column specifically, so admin self-promotion was defended-in-fact — BUT that
--        trigger covered ONLY is_admin. is_pro / plan / email were NOT guarded, so a
--        logged-in user could still run
--            update public.profiles set plan = 'unlimited', is_pro = true where id = auth.uid();
--        to grant themselves the paid AI quota / raised monitor cap (billing bypass),
--        and rewrite their own profiles.email. (The R141/R144 area-monitors work
--        already learned this default-grant lesson; profiles was only half-covered.)
--        R155 supersedes the narrow guard_admin_flag with tg_profiles_guard_privcols,
--        which freezes is_admin + is_pro + plan + email, uses a hardened empty
--        search_path, and is proven by pgTAP (05_r155_security_test.sql).
--
--    The existing pgTAP (01_rls_matrix, `a_escalate → DENIED`) did NOT catch (B): it
--    runs on vanilla CI Postgres, which lacks the default ALL grants, so the baseline
--    column-grant appeared to protect profiles on CI while prod was wide open.
--
--  PORTABILITY (prod ≠ the migration files)
--    Prod has `is_admin(uuid)`; the baseline defines `is_admin()`. This migration
--    therefore references NEITHER — it only DROPS the permissive prod-only policies
--    (IF EXISTS → no-op on CI, which never had them) and relies on the restrictive
--    own+admin SELECT policy that already exists on each side (profiles_select on
--    prod / profiles_select_own on CI). Portable across both.
--
--  THIS MIGRATION
--    1. PROFILES SELECT LEAK → create the profiles_public view (id/display_name/bio/
--       avatar_url only) and DROP the two permissive `USING (true)` SELECT policies
--       plus the redundant public self-INSERT policy. The client already reads
--       profiles_public first (index.html imViewProfile, #R134), so public author
--       cards keep working while email/is_admin/plan stop leaking.
--    2. LEAST-PRIVILEGE GRANTS. Revoke ALL from anon/authenticated on every public
--       table, then re-grant EXACTLY the baseline's intended minimal set — which
--       strips the table-level UPDATE that made escalation (B) possible. The client
--       only ever writes the granted columns/tables (verified in index.html), so no
--       behaviour changes.
--    3. PROFILES GUARD TRIGGER (grant-independent, the durable protection — the R144
--       lesson applied to profiles). A BEFORE UPDATE trigger freezes is_admin/is_pro/
--       plan/email for any caller that is not the service_role runner or a trusted DB
--       session. Even if Supabase's default privileges ever re-add a blanket UPDATE,
--       a user still cannot escalate.
--    4. PUBLIC-WRITE SIZE CAPS. feedback/bug_reports are anon-insertable and
--       community_posts/comments are user-insertable with no length bound — a giant
--       payload is a cheap abuse/DoS vector. Add CHECK length caps (NOT VALID, so a
--       pre-existing oversized row never blocks the migration; enforced on new writes).
-- ============================================================================

begin;

-- ─────────────────────────────────────────────────────────────────────────────
--  0. PROFILES PUBLIC-SAFE VIEW + SELECT-LEAK FIX.
--     The view exposes ONLY the four non-sensitive columns; a view runs with its
--     owner's rights so it bypasses profiles' owner-only RLS but reveals nothing
--     sensitive. Then drop the permissive world-read policies + the public
--     self-insert policy (the on_auth_user_created trigger, SECURITY DEFINER, is the
--     only thing that should create a profiles row).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.profiles_public as
  select id, display_name, bio, avatar_url from public.profiles;
comment on view public.profiles_public is
  '(#R134/#R155) Public-safe projection of profiles (id, display_name, bio, avatar_url). Used for community author cards so email/is_admin/is_pro/plan never leak.';

-- Drop the leak. IF EXISTS → no-op on CI (which never had these names); on prod it
-- removes the two `USING (true)` SELECT policies + the public self-insert policy,
-- leaving only the restrictive own+admin SELECT (profiles_select) and own UPDATE.
drop policy if exists "Allow public read access to profiles" on public.profiles;
drop policy if exists "profiles public read"                 on public.profiles;
drop policy if exists "profiles_insert"                      on public.profiles;

-- ─────────────────────────────────────────────────────────────────────────────
--  1. LEAST-PRIVILEGE GRANTS — revoke the Supabase default ALL, re-grant the
--     baseline's intended minimal set. (area_monitors / monitor_* were already
--     tightened by #R144 and are left as-is; re-stating them here would be a no-op.)
-- ─────────────────────────────────────────────────────────────────────────────
revoke all on public.profiles                  from anon, authenticated;
revoke all on public.ai_usage                  from anon, authenticated;
revoke all on public.user_prefs                from anon, authenticated;
revoke all on public.favorites                 from anon, authenticated;
revoke all on public.donations                 from anon, authenticated;
revoke all on public.feedback                  from anon, authenticated;
revoke all on public.bug_reports               from anon, authenticated;
revoke all on public.community_posts           from anon, authenticated;
revoke all on public.community_comments        from anon, authenticated;
revoke all on public.community_votes           from anon, authenticated;
revoke all on public.community_comment_votes   from anon, authenticated;
revoke all on public.community_reports         from anon, authenticated;
revoke all on public.geo_pins                  from anon, authenticated;
revoke all on public.dashboard_cards           from anon, authenticated;
revoke all on public.current_news              from anon, authenticated;
revoke all on public.profiles_public           from anon, authenticated;
-- Monitor CHILD tables: R144 tightened area_monitors + monitor_seen_items but NOT
-- these three, so prod still handed anon/authenticated the default ALL. RLS (no
-- write policy) blocks forged writes via PostgREST, but the R141 design's "run
-- results cannot be forged — no write grant" property must hold at the grant layer
-- too. Strip them to SELECT-only (owner-read), matching monitor_seen_items.
revoke all on public.monitor_runs              from anon, authenticated;
revoke all on public.monitor_evidence          from anon, authenticated;
revoke all on public.monitor_reports           from anon, authenticated;

-- Re-grant EXACTLY the baseline §7 intent -------------------------------------
-- Public-read tables (RLS still applies).
grant select on public.geo_pins, public.dashboard_cards, public.current_news,
                public.community_posts, public.community_comments,
                public.community_votes, public.community_comment_votes,
                public.profiles_public
  to anon, authenticated;

-- profiles: read (RLS → own+admin rows), UPDATE only the four safe columns.
-- is_admin/is_pro/plan/email are NOT grantable → no privilege escalation. anon
-- gets nothing on profiles (public display uses profiles_public).
grant select on public.profiles to authenticated;
grant update (display_name, bio, avatar_url, login_count) on public.profiles to authenticated;

-- Own-data tables: full CRUD for authenticated (RLS → own rows only).
grant select, insert, update, delete on public.user_prefs to authenticated;
grant select, insert, update, delete on public.favorites  to authenticated;

-- ai_usage: authenticated may only SELECT (RLS → own rows). Writes are RPC-only.
grant select on public.ai_usage to authenticated;

-- Community writes.
grant insert, update, delete on public.community_posts        to authenticated;
grant insert, update, delete on public.community_comments     to authenticated;
grant insert, delete         on public.community_votes         to authenticated;
grant insert, delete         on public.community_comment_votes to authenticated;
grant insert                 on public.community_reports       to authenticated;
grant select                 on public.community_reports       to authenticated;  -- RLS → admin only

-- Admin-read PII tables. Insert is open (anon feedback / bug report); SELECT/DELETE
-- are grant-then-RLS-gated to admins.
grant insert on public.feedback,   public.bug_reports to anon, authenticated;
grant insert on public.donations   to authenticated;
grant select, delete on public.feedback    to authenticated;  -- RLS → admin only
grant select         on public.bug_reports to authenticated;  -- RLS → admin only
grant select         on public.donations   to authenticated;  -- RLS → admin only

-- Admin write on the curated tables (RLS → admin only; service_role also writes).
grant insert, update, delete on public.geo_pins        to authenticated;
grant insert, update, delete on public.dashboard_cards to authenticated;

-- Monitor child tables: SELECT only (RLS → own rows). No write grant to users, so
-- run results / evidence / reports cannot be FORGED (only the service_role runner
-- writes them). anon gets nothing (these are user-owned, never public).
grant select on public.monitor_runs, public.monitor_evidence, public.monitor_reports to authenticated;

-- service_role keeps full access (idempotent; it also bypasses RLS).
grant all on all tables in schema public to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  2. PROFILES PRIVILEGE-COLUMN GUARD — the durable, grant-independent protection.
--     Mirrors #R144's tg_monitors_guard_state. Any caller that is not the
--     service_role runner (or a trusted no-JWT DB session: migrations / pg_cron /
--     postgres) has is_admin/is_pro/plan/email pinned to their OLD values on every
--     UPDATE, so a user can never escalate their privileges or change their billing
--     plan / identity email from the client — regardless of what the table grants
--     happen to be.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.tg_profiles_guard_privcols()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
begin
  -- service_role (server) or a trusted direct DB session (no JWT) may set anything.
  if v_role = 'service_role' or v_role = '' then
    return new;
  end if;
  -- Everyone else: privilege / billing / identity columns are read-only (pin to OLD).
  new.is_admin := old.is_admin;
  new.is_pro   := old.is_pro;
  new.plan     := old.plan;
  new.email    := old.email;
  return new;
end;
$$;
comment on function public.tg_profiles_guard_privcols() is
  '(#R155) BEFORE UPDATE guard: freezes is_admin/is_pro/plan/email for any caller that is not the service_role runner or a trusted no-JWT DB session. Grant-independent privilege-escalation protection for profiles (the R144 pattern applied to profiles).';

drop trigger if exists trg_profiles_guard on public.profiles;
create trigger trg_profiles_guard
  before update on public.profiles
  for each row execute function public.tg_profiles_guard_privcols();

revoke execute on function public.tg_profiles_guard_privcols() from public, anon, authenticated;

-- Retire the pre-existing prod `guard_admin_flag` trigger/function: it guarded ONLY
-- is_admin and used a mutable search_path=public (a SECURITY DEFINER hardening gap).
-- tg_profiles_guard_privcols above is a strict superset (is_admin+is_pro+plan+email,
-- search_path=''), so this cleanup removes the redundant, weaker guard. IF EXISTS →
-- a no-op on CI (which never had it).
drop trigger  if exists guard_admin_flag_trg on public.profiles;
drop function if exists public.guard_admin_flag() cascade;

-- ─────────────────────────────────────────────────────────────────────────────
--  3. PUBLIC-WRITE SIZE CAPS — bound the length of anon/user-insertable text so a
--     single giant payload can't be used to abuse storage / the admin renderer.
--     NOT VALID: a pre-existing oversized row (unlikely) will not block the
--     migration; the cap is enforced on every new insert/update immediately.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'feedback_len_guard' and conrelid = 'public.feedback'::regclass) then
    alter table public.feedback add constraint feedback_len_guard
      check ( (comment is null or char_length(comment) <= 5000)
          and (email   is null or char_length(email)   <= 254)
          and (page    is null or char_length(page)    <= 400)
          and (ua      is null or char_length(ua)      <= 600) ) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bug_reports_len_guard' and conrelid = 'public.bug_reports'::regclass) then
    alter table public.bug_reports add constraint bug_reports_len_guard
      check ( (description is null or char_length(description) <= 10000)
          and (email       is null or char_length(email)       <= 254)
          and (category    is null or char_length(category)    <= 120) ) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'comm_posts_len_guard' and conrelid = 'public.community_posts'::regclass) then
    alter table public.community_posts add constraint comm_posts_len_guard
      check ( (title is null or char_length(title) <= 300)
          and (body  is null or char_length(body)  <= 10000)
          and (author_name is null or char_length(author_name) <= 120) ) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'comm_comments_len_guard' and conrelid = 'public.community_comments'::regclass) then
    alter table public.community_comments add constraint comm_comments_len_guard
      check ( (body is null or char_length(body) <= 5000)
          and (author_name is null or char_length(author_name) <= 120) ) not valid;
  end if;
end $$;

comment on constraint feedback_len_guard        on public.feedback          is '(#R155) length caps on anon-insertable feedback text (abuse/DoS guard). Enforced on new writes.';
comment on constraint bug_reports_len_guard     on public.bug_reports       is '(#R155) length caps on anon-insertable bug-report text (abuse/DoS guard). Enforced on new writes.';
comment on constraint comm_posts_len_guard      on public.community_posts   is '(#R155) length caps on user-insertable post text (abuse/DoS guard). Enforced on new writes.';
comment on constraint comm_comments_len_guard   on public.community_comments is '(#R155) length caps on user-insertable comment text (abuse/DoS guard). Enforced on new writes.';

commit;
