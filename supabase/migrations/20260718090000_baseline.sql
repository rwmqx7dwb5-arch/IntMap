-- ============================================================================
--  IntMap — BASELINE migration (public schema, RLS, functions, triggers, grants)
-- ----------------------------------------------------------------------------
--  WHAT THIS IS
--    The single, version-controlled design blueprint for IntMap's database. It
--    was RECONSTRUCTED from the application code (index.html, admin.html) and the
--    Edge Functions (ai-proxy, refresh-news) because the project had no migrations
--    — the schema lived only inside the production instance. Applying this file to
--    a clean database reproduces the whole structure; the RLS/pgTAP tests in
--    supabase/tests run against it.
--
--  IDEMPOTENT & NON-DESTRUCTIVE
--    Every statement uses IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS
--    so re-applying it never drops a table, a column or data. There is no DROP
--    TABLE / DROP COLUMN / DELETE anywhere in this file.
--
--  HOW TO MAKE IT AUTHORITATIVE AGAINST PRODUCTION (maintainer, gated)
--    This is a best-effort reconstruction. To confirm it matches production and
--    bring prod under migration control WITHOUT executing it against prod, run the
--    read-only reconcile in docs/MIGRATIONS.md (`supabase db pull` / `db diff
--    --linked` + `migration repair`). Differences it surfaces are expected and are
--    reviewed, not blindly applied.
--
--  SECURITY HARDENING (may exceed what production currently enforces — REVIEW)
--    Three properties below are security-critical and are ENFORCED here even if the
--    live database is currently more permissive. `supabase db diff --linked` will
--    flag them as drift; that is the signal to apply them to prod (see
--    docs/DATABASE-INCIDENT.md → "RLS/権限ミス"). They are:
--      1. profiles.email (and is_admin/is_pro/plan) is readable ONLY by the owner
--         and admins — never world-readable. Public profile display uses the
--         profiles_public VIEW (id, display_name, bio, avatar_url only).
--      2. A normal user CANNOT set their own is_admin/is_pro/plan/email (column-
--         level UPDATE privilege), so no privilege escalation via the profiles row.
--      3. ai_usage is writable ONLY through the SECURITY DEFINER RPCs, whose EXECUTE
--         is granted to service_role only — a user cannot inflate/deflate their AI
--         quota, and cannot call the RPCs at all.
-- ============================================================================

begin;

-- ─────────────────────────────────────────────────────────────────────────────
--  0. Admin helper.  SECURITY DEFINER so a policy can check "is the caller an
--     admin?" without recursing into profiles' own RLS. `search_path = ''` +
--     fully-qualified names close the classic search-path privilege-escalation
--     hole (a caller cannot shadow `profiles` with an object on their own path).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = (select auth.uid())), false);
$$;
comment on function public.is_admin() is 'True when the current JWT user has profiles.is_admin. SECURITY DEFINER to avoid RLS recursion; used by admin-only policies.';

-- ─────────────────────────────────────────────────────────────────────────────
--  1. TABLES  (created in FK dependency order; profiles first — it is the hub).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1.1 profiles — one row per auth user. Created automatically by the new-user
--     trigger (§4). Holds the public display fields + private account fields.
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  is_admin     boolean not null default false,
  is_pro       boolean not null default false,
  plan         text    not null default 'free',
  bio          text,
  avatar_url   text,
  login_count  integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.profiles is 'Per-user profile. Public columns (display_name/bio/avatar_url) are exposed via profiles_public; email/is_admin/is_pro/plan are owner+admin only.';

-- 1.2 ai_usage — one row per user per day; the AI free-use counter. Written ONLY
--     by the increment_ai_usage / refund_ai_usage RPCs (never by end users).
create table if not exists public.ai_usage (
  user_id    uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default current_date,
  count      integer not null default 0,
  primary key (user_id, usage_date)
);
comment on table public.ai_usage is 'Daily AI free-use counter. Mutated only through the SECURITY DEFINER RPCs; users may read only their own row.';

-- 1.3 user_prefs — the account's synced settings blob (one row per user).
create table if not exists public.user_prefs (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 1.4 favorites — a user's saved (★) article links.
create table if not exists public.favorites (
  id            bigint generated by default as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  article_link  text not null,
  article_title text,
  created_at    timestamptz not null default now(),
  unique (user_id, article_link)
);

-- 1.5 donations — donation INTENT rows (the payment itself is confirmed by Stripe).
--     Contains email → PII; readable by admins only.
create table if not exists public.donations (
  id         bigint generated by default as identity primary key,
  user_id    uuid references auth.users(id) on delete set null,
  email      text,
  locale     text,
  source     text,
  status     text default 'initiated',
  created_at timestamptz not null default now()
);
comment on table public.donations is 'Donation intent (PII: email). Insert by the owner; read by admins only.';

-- 1.6 feedback — 5-star + free-text feedback. May carry an email (logged-out) →
--     PII; readable/deletable by admins only.
create table if not exists public.feedback (
  id         bigint generated by default as identity primary key,
  user_id    uuid references auth.users(id) on delete set null,
  email      text,
  rating     integer,
  comment    text,
  lang       text,
  ua         text,
  page       text,
  created_at timestamptz not null default now()
);
comment on table public.feedback is 'User feedback (PII: email + free text). Anyone may insert; only admins may read or delete.';

-- 1.7 bug_reports — one-tap bug reports with auto-captured diagnostics. PII (email,
--     diagnostics); readable by admins only.
create table if not exists public.bug_reports (
  id          bigint generated by default as identity primary key,
  user_id     uuid references auth.users(id) on delete set null,
  email       text,
  category    text,
  description text,
  diagnostics jsonb,
  lang        text,
  build       text,
  ua          text,
  page        text,
  created_at  timestamptz not null default now()
);
comment on table public.bug_reports is 'Bug reports (PII: email + diagnostics). Anyone may insert; only admins may read.';

-- 1.8 community_posts — user-generated map posts.
create table if not exists public.community_posts (
  id          bigint generated by default as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  author_name text,
  title       text,
  body        text,
  img         text,
  lat         double precision,
  lng         double precision,
  category    text default 'general',
  created_at  timestamptz not null default now(),
  edited_at   timestamptz
);

-- 1.9 community_comments — threaded comments on posts.
create table if not exists public.community_comments (
  id          bigint generated by default as identity primary key,
  post_id     bigint not null references public.community_posts(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  author_name text,
  body        text,
  parent_id   bigint references public.community_comments(id) on delete cascade,
  created_at  timestamptz not null default now(),
  edited_at   timestamptz
);

-- 1.10 community_votes — one upvote per (post, user).
create table if not exists public.community_votes (
  post_id    bigint not null references public.community_posts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- 1.11 community_comment_votes — one upvote per (comment, user).
create table if not exists public.community_comment_votes (
  comment_id bigint not null references public.community_comments(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

-- 1.12 community_reports — a user flags a post (one per user per post). Admin-read.
create table if not exists public.community_reports (
  post_id    bigint not null references public.community_posts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- 1.13 geo_pins — the news-geolocation gazetteer (public read; admin/service write).
create table if not exists public.geo_pins (
  id         bigint generated by default as identity primary key,
  type       text,
  terms      text[],
  name_en    text,
  name_jp    text,
  lng        double precision,
  lat        double precision,
  sort_order integer
);

-- 1.14 dashboard_cards — curated strategic-location cards (public read; admin write).
create table if not exists public.dashboard_cards (
  id         bigint generated by default as identity primary key,
  slug       text,
  layer_ref  text,
  cat        text,
  type       text,
  lng        double precision,
  lat        double precision,
  img        text,
  title_en   text,
  title_jp   text,
  badge      text,
  body_en    text,
  body_jp    text,
  wiki_en    text,
  wiki_jp    text,
  specs      jsonb,
  sort_order integer
);

-- 1.15 current_news — server-refreshed, pre-geolocated news (public read; service write).
create table if not exists public.current_news (
  id              bigint generated by default as identity primary key,
  lang            text not null,
  topic           text,
  title           text,
  publisher       text,
  link            text not null,
  pub_date        timestamptz,
  description     text,
  pub_lng         double precision,
  pub_lat         double precision,
  pub_label       text,
  short_en        text,
  short_jp        text,
  fetched_at      timestamptz,
  subject_lng     double precision,
  subject_lat     double precision,
  subject_name_en text,
  subject_name_jp text,
  subject_type    text,
  mapped          boolean,
  analyzed_by     text,
  unique (lang, link)
);

-- ─────────────────────────────────────────────────────────────────────────────
--  2. INDEXES (query paths the app actually uses).
-- ─────────────────────────────────────────────────────────────────────────────
create index if not exists idx_current_news_lang_pubdate on public.current_news (lang, pub_date desc);
create index if not exists idx_current_news_pubdate       on public.current_news (pub_date);
create index if not exists idx_current_news_fetched_at    on public.current_news (fetched_at);
create index if not exists idx_favorites_user             on public.favorites (user_id);
create index if not exists idx_comm_posts_created         on public.community_posts (created_at desc);
create index if not exists idx_comm_comments_post         on public.community_comments (post_id);
create index if not exists idx_comm_votes_post            on public.community_votes (post_id);
create index if not exists idx_comm_cvotes_comment        on public.community_comment_votes (comment_id);
create index if not exists idx_donations_user             on public.donations (user_id);
create index if not exists idx_feedback_created           on public.feedback (created_at desc);
create index if not exists idx_bug_reports_created        on public.bug_reports (created_at desc);
create index if not exists idx_geo_pins_sort              on public.geo_pins (sort_order);
create index if not exists idx_dashboard_cards_sort       on public.dashboard_cards (sort_order);

-- ─────────────────────────────────────────────────────────────────────────────
--  3. PUBLIC PROFILE VIEW — exposes ONLY non-sensitive columns for every user, so
--     community author cards keep working without leaking email/is_admin/plan.
--     A view runs with its owner's rights, so it deliberately bypasses profiles'
--     owner-only RLS but reveals only these four safe columns.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.profiles_public as
  select id, display_name, bio, avatar_url from public.profiles;
comment on view public.profiles_public is 'Public-safe projection of profiles (id, display_name, bio, avatar_url). Used for community author cards.';

-- ─────────────────────────────────────────────────────────────────────────────
--  4. NEW-USER TRIGGER — auto-create a profiles row on signup (standard Supabase
--     pattern; the app assumes the row already exists after login).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────────
--  5. AI-QUOTA RPCs — the ONLY writers of ai_usage. SECURITY DEFINER + empty
--     search_path; EXECUTE granted to service_role only (§7 below).
-- ─────────────────────────────────────────────────────────────────────────────

-- Atomically consume one use for today if under the limit. Returns (used, allowed).
create or replace function public.increment_ai_usage(p_user uuid, p_limit integer)
returns table (used integer, allowed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.ai_usage as u (user_id, usage_date, count)
  values (p_user, current_date, 1)
  on conflict (user_id, usage_date)
    do update set count = u.count + 1
    where u.count < p_limit
  returning u.count into v_count;

  if v_count is null then
    -- Either over the limit (update skipped) — report the current count, not allowed.
    select a.count into v_count from public.ai_usage a
      where a.user_id = p_user and a.usage_date = current_date;
    return query select coalesce(v_count, p_limit), false;
  else
    return query select v_count, true;
  end if;
end;
$$;

-- Give one use back (best-effort refund when a provider call failed).
create or replace function public.refund_ai_usage(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.ai_usage
    set count = greatest(0, count - 1)
    where user_id = p_user and usage_date = current_date;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  6. ROW LEVEL SECURITY — enable on every table, then define policies.
--     Policies are dropped-if-exists first so this file stays idempotent.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.profiles                enable row level security;
alter table public.ai_usage                enable row level security;
alter table public.user_prefs              enable row level security;
alter table public.favorites               enable row level security;
alter table public.donations               enable row level security;
alter table public.feedback                enable row level security;
alter table public.bug_reports             enable row level security;
alter table public.community_posts         enable row level security;
alter table public.community_comments      enable row level security;
alter table public.community_votes         enable row level security;
alter table public.community_comment_votes enable row level security;
alter table public.community_reports       enable row level security;
alter table public.geo_pins                enable row level security;
alter table public.dashboard_cards         enable row level security;
alter table public.current_news            enable row level security;

-- 6.1 profiles — owner (or admin) reads/updates own row; nobody self-inserts
--     (the trigger does that as definer); no user deletes (auth cascade only).
drop policy if exists profiles_select_own      on public.profiles;
drop policy if exists profiles_update_own       on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- 6.2 ai_usage — owner may READ own rows only. No insert/update/delete policy →
--     users cannot write it at all (only the RPCs, which run as definer, can).
drop policy if exists ai_usage_select_own on public.ai_usage;
create policy ai_usage_select_own on public.ai_usage
  for select to authenticated
  using (user_id = (select auth.uid()));

-- 6.3 user_prefs — full own-row CRUD.
drop policy if exists user_prefs_rw_own on public.user_prefs;
create policy user_prefs_rw_own on public.user_prefs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 6.4 favorites — full own-row CRUD.
drop policy if exists favorites_rw_own on public.favorites;
create policy favorites_rw_own on public.favorites
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 6.5 donations — owner inserts own row; admins read; nobody else reads.
drop policy if exists donations_insert_own on public.donations;
drop policy if exists donations_select_admin on public.donations;
create policy donations_insert_own on public.donations
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy donations_select_admin on public.donations
  for select to authenticated
  using (public.is_admin());

-- 6.6 feedback — anyone (incl. anon) inserts; admins read + delete.
drop policy if exists feedback_insert_any on public.feedback;
drop policy if exists feedback_select_admin on public.feedback;
drop policy if exists feedback_delete_admin on public.feedback;
create policy feedback_insert_any on public.feedback
  for insert to anon, authenticated
  with check (true);
create policy feedback_select_admin on public.feedback
  for select to authenticated
  using (public.is_admin());
create policy feedback_delete_admin on public.feedback
  for delete to authenticated
  using (public.is_admin());

-- 6.7 bug_reports — anyone inserts; admins read + delete.
drop policy if exists bug_reports_insert_any on public.bug_reports;
drop policy if exists bug_reports_select_admin on public.bug_reports;
drop policy if exists bug_reports_delete_admin on public.bug_reports;
create policy bug_reports_insert_any on public.bug_reports
  for insert to anon, authenticated
  with check (true);
create policy bug_reports_select_admin on public.bug_reports
  for select to authenticated
  using (public.is_admin());
create policy bug_reports_delete_admin on public.bug_reports
  for delete to authenticated
  using (public.is_admin());

-- 6.8 community_posts — world-readable; author inserts own; author OR admin
--     updates/deletes.
drop policy if exists comm_posts_select_all on public.community_posts;
drop policy if exists comm_posts_insert_own on public.community_posts;
drop policy if exists comm_posts_update_own on public.community_posts;
drop policy if exists comm_posts_delete_own on public.community_posts;
create policy comm_posts_select_all on public.community_posts
  for select to anon, authenticated using (true);
create policy comm_posts_insert_own on public.community_posts
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy comm_posts_update_own on public.community_posts
  for update to authenticated
  using (user_id = (select auth.uid()) or public.is_admin())
  with check (user_id = (select auth.uid()) or public.is_admin());
create policy comm_posts_delete_own on public.community_posts
  for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- 6.9 community_comments — world-readable; author inserts; author OR admin edit/delete.
drop policy if exists comm_comments_select_all on public.community_comments;
drop policy if exists comm_comments_insert_own on public.community_comments;
drop policy if exists comm_comments_update_own on public.community_comments;
drop policy if exists comm_comments_delete_own on public.community_comments;
create policy comm_comments_select_all on public.community_comments
  for select to anon, authenticated using (true);
create policy comm_comments_insert_own on public.community_comments
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy comm_comments_update_own on public.community_comments
  for update to authenticated
  using (user_id = (select auth.uid()) or public.is_admin())
  with check (user_id = (select auth.uid()) or public.is_admin());
create policy comm_comments_delete_own on public.community_comments
  for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- 6.10 community_votes — world-readable (counts); own insert/delete.
drop policy if exists comm_votes_select_all on public.community_votes;
drop policy if exists comm_votes_insert_own on public.community_votes;
drop policy if exists comm_votes_delete_own on public.community_votes;
create policy comm_votes_select_all on public.community_votes
  for select to anon, authenticated using (true);
create policy comm_votes_insert_own on public.community_votes
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy comm_votes_delete_own on public.community_votes
  for delete to authenticated using (user_id = (select auth.uid()));

-- 6.11 community_comment_votes — world-readable; own insert/delete.
drop policy if exists comm_cvotes_select_all on public.community_comment_votes;
drop policy if exists comm_cvotes_insert_own on public.community_comment_votes;
drop policy if exists comm_cvotes_delete_own on public.community_comment_votes;
create policy comm_cvotes_select_all on public.community_comment_votes
  for select to anon, authenticated using (true);
create policy comm_cvotes_insert_own on public.community_comment_votes
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy comm_cvotes_delete_own on public.community_comment_votes
  for delete to authenticated using (user_id = (select auth.uid()));

-- 6.12 community_reports — owner inserts own; admins read. No public read.
drop policy if exists comm_reports_insert_own on public.community_reports;
drop policy if exists comm_reports_select_admin on public.community_reports;
create policy comm_reports_insert_own on public.community_reports
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy comm_reports_select_admin on public.community_reports
  for select to authenticated using (public.is_admin());

-- 6.13 geo_pins / dashboard_cards / current_news — world-readable; writes by admin
--     (service_role bypasses RLS entirely, so refresh-news keeps working).
drop policy if exists geo_pins_select_all on public.geo_pins;
drop policy if exists geo_pins_write_admin on public.geo_pins;
create policy geo_pins_select_all on public.geo_pins
  for select to anon, authenticated using (true);
create policy geo_pins_write_admin on public.geo_pins
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists dashboard_cards_select_all on public.dashboard_cards;
drop policy if exists dashboard_cards_write_admin on public.dashboard_cards;
create policy dashboard_cards_select_all on public.dashboard_cards
  for select to anon, authenticated using (true);
create policy dashboard_cards_write_admin on public.dashboard_cards
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists current_news_select_all on public.current_news;
create policy current_news_select_all on public.current_news
  for select to anon, authenticated using (true);
-- (No user write policy on current_news — only service_role, which bypasses RLS.)

-- ─────────────────────────────────────────────────────────────────────────────
--  7. GRANTS — table/column privileges. RLS decides WHICH ROWS; grants decide
--     whether the role may touch the table/columns AT ALL. Defense in depth.
-- ─────────────────────────────────────────────────────────────────────────────
grant usage on schema public to anon, authenticated;

-- Public-read tables (anon + authenticated may SELECT; RLS still applies).
grant select on public.geo_pins, public.dashboard_cards, public.current_news,
                public.community_posts, public.community_comments,
                public.community_votes, public.community_comment_votes,
                public.profiles_public
  to anon, authenticated;

-- profiles: authenticated may read (RLS → own+admin rows only) and update ONLY the
-- four public columns (+ login_count). is_admin/is_pro/plan/email are NOT grantable,
-- so a user can never escalate. anon gets nothing on profiles (uses profiles_public).
grant select on public.profiles to authenticated;
grant update (display_name, bio, avatar_url, login_count) on public.profiles to authenticated;

-- Own-data tables: full CRUD for authenticated (RLS → own rows only).
grant select, insert, update, delete on public.user_prefs to authenticated;
grant select, insert, update, delete on public.favorites  to authenticated;

-- ai_usage: authenticated may only SELECT (RLS → own rows). No insert/update/delete.
grant select on public.ai_usage to authenticated;

-- Community writes.
grant insert, update, delete on public.community_posts        to authenticated;
grant insert, update, delete on public.community_comments     to authenticated;
grant insert, delete         on public.community_votes         to authenticated;
grant insert, delete         on public.community_comment_votes to authenticated;
grant insert                 on public.community_reports       to authenticated;
grant select                 on public.community_reports       to authenticated;  -- RLS → admin only

-- Admin-read PII tables. Insert is open (anon can leave feedback / report a bug);
-- SELECT/DELETE are grant-then-RLS-gated to admins.
grant insert on public.feedback,   public.bug_reports to anon, authenticated;
grant insert on public.donations   to authenticated;
grant select, delete on public.feedback    to authenticated;  -- RLS → admin only
grant select         on public.bug_reports to authenticated;  -- RLS → admin only
grant select         on public.donations   to authenticated;  -- RLS → admin only

-- Admin write on the curated tables (RLS → admin only; also editable by service_role).
grant insert, update, delete on public.geo_pins        to authenticated;
grant insert, update, delete on public.dashboard_cards to authenticated;

-- service_role already bypasses RLS; make its table access explicit for clarity.
grant all on all tables in schema public to service_role;

-- RPC EXECUTE: service_role ONLY. Revoke the default PUBLIC grant so a normal user
-- cannot call these quota functions (which would let them tamper with usage).
revoke execute on function public.increment_ai_usage(uuid, integer) from public, anon, authenticated;
revoke execute on function public.refund_ai_usage(uuid)             from public, anon, authenticated;
grant  execute on function public.increment_ai_usage(uuid, integer) to service_role;
grant  execute on function public.refund_ai_usage(uuid)             to service_role;
-- is_admin() is safe to evaluate (returns only a boolean about the caller).
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  8. REALTIME — add the tables the client subscribes to, to the supabase_realtime
--     publication (idempotent: skip any already-published table).
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
  tables text[] := array[
    'geo_pins','dashboard_cards','community_posts','community_comments',
    'community_votes','current_news'
  ];
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array tables loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;

commit;
