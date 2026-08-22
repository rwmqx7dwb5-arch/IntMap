-- ============================================================================
--  pgTAP · 00 structure — the migration + seed produced the expected schema.
--  Runs as the superuser test role (no RLS role switching here).
--  Executed by `supabase test db` (see docs/DATABASE.md).
-- ============================================================================
begin;
select plan(58);   -- (#R315) +4: ai_turns joins the has_table and RLS lists, and its two RPCs are asserted

-- 1) Every expected table exists in public.
select has_table('public', t, 'table ' || t || ' exists')
from unnest(array[
  'profiles','ai_usage','user_prefs','favorites','donations','feedback',
  'bug_reports','community_posts','community_comments','community_votes',
  'community_comment_votes','community_reports','geo_pins','dashboard_cards',
  'current_news',
  -- (#R315) the AI TURN ledger: one row per (account, turn). The first call of a turn charges
  -- ai_usage and the rest are free, so a single question no longer costs three uses.
  'ai_turns',
  -- (#R141) area-monitoring feature. (#R280) monitor_seen_items was created by the #R144
  -- hardening migration and never reached this list, so the ONE assertion that says "RLS is on
  -- for every table we have" was measuring 19 of the 20 that exist. A table missing from the
  -- list cannot fail the list.
  'area_monitors','monitor_runs','monitor_evidence','monitor_reports','monitor_seen_items'
]) as t;                                                    -- 21 assertions

-- 2) RLS is ENABLED on every one of them (fail-closed: a table with RLS off fails).
select ok(
  (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass),
  'RLS enabled on ' || t
)
from unnest(array[
  'profiles','ai_usage','user_prefs','favorites','donations','feedback',
  'bug_reports','community_posts','community_comments','community_votes',
  'community_comment_votes','community_reports','geo_pins','dashboard_cards',
  'current_news','ai_turns',
  'area_monitors','monitor_runs','monitor_evidence','monitor_reports','monitor_seen_items'
]) as t;                                                    -- 21 assertions

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
select has_function('public','consume_ai_turn', array['uuid','integer','text','integer','integer'], 'consume_ai_turn(...) exists');   -- (#R315)
select has_function('public','refund_ai_turn', array['uuid','text'], 'refund_ai_turn(uuid,text) exists');

-- 6) (#R141) Area-monitoring keys, relationships and functions.
select col_is_pk('public','area_monitors', array['id'], 'area_monitors PK is (id)');
select fk_ok('public','monitor_runs','monitor_id','public','area_monitors','id',
             'monitor_runs.monitor_id → area_monitors.id');
select fk_ok('public','monitor_reports','run_id','public','monitor_runs','id',
             'monitor_reports.run_id → monitor_runs.id');
select has_function('public','monitor_claim_due', array['integer','integer'], 'monitor_claim_due(int,int) exists');
select has_function('public','monitor_limit', array['uuid'], 'monitor_limit(uuid) exists');
select has_function('public','monitor_mark_read', array['uuid'], 'monitor_mark_read(uuid) exists');

reset role;
select * from finish();
rollback;
