-- ============================================================================
--  pgTAP · 00 structure — the migration + seed produced the expected schema.
--  Runs as the superuser test role (no RLS role switching here).
--  Executed by `supabase test db` (see docs/RLS-TESTING.md).
-- ============================================================================
begin;
select plan(38);

-- 1) Every expected table exists in public.
select has_table('public', t, 'table ' || t || ' exists')
from unnest(array[
  'profiles','ai_usage','user_prefs','favorites','donations','feedback',
  'bug_reports','community_posts','community_comments','community_votes',
  'community_comment_votes','community_reports','geo_pins','dashboard_cards',
  'current_news'
]) as t;                                                    -- 15 assertions

-- 2) RLS is ENABLED on every one of them (fail-closed: a table with RLS off fails).
select ok(
  (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass),
  'RLS enabled on ' || t
)
from unnest(array[
  'profiles','ai_usage','user_prefs','favorites','donations','feedback',
  'bug_reports','community_posts','community_comments','community_votes',
  'community_comment_votes','community_reports','geo_pins','dashboard_cards',
  'current_news'
]) as t;                                                    -- 15 assertions

-- 3) Keys / relationships that the app depends on.
select has_pk('public', 'profiles', 'profiles has a primary key');
select col_is_pk('public', 'ai_usage', array['user_id','usage_date'], 'ai_usage PK is (user_id,usage_date)');
select fk_ok('public','community_comments','post_id','public','community_posts','id',
             'community_comments.post_id → community_posts.id');

-- 4) The public profile view exists and does NOT leak sensitive columns.
select has_view('public', 'profiles_public', 'profiles_public view exists');
select hasnt_column('public', 'profiles_public', 'email', 'profiles_public does NOT expose email');
select hasnt_column('public', 'profiles_public', 'is_admin', 'profiles_public does NOT expose is_admin');

-- 5) Core functions exist.
select has_function('public','is_admin', 'is_admin() exists');
select has_function('public','increment_ai_usage', array['uuid','integer'], 'increment_ai_usage(uuid,int) exists');

reset role;
select * from finish();
rollback;
