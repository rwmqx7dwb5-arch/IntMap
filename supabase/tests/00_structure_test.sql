-- ============================================================================
--  pgTAP · 00 structure — the migration + seed produced the expected schema.
--  Runs as the superuser test role (no RLS role switching here).
--  Executed by `supabase test db` (see docs/DATABASE.md).
-- ============================================================================
begin;
select plan(80);   -- (#R334) +16: the eight Event tables join the has_table list and the RLS list
                   -- (#R351) +2: news_ingest_runs joins both lists too. A table missing from the
                   -- list cannot fail the list (#R280) — that is why the count moves with the table.
                   -- (#R366) +4: news_event_admin_actions joins both lists, and the two operator
                   -- RPCs that the admin console calls get an existence assertion each — a console
                   -- button wired to a function that is not deployed is the silent hole again.

-- 1) Every expected table exists in public.
select has_table('public', t, 'table ' || t || ' exists')
from unnest(array[
  'profiles','ai_usage','user_prefs','favorites','donations','feedback',
  'bug_reports','community_posts','community_comments','community_votes',
  'community_comment_votes','community_reports','geo_pins','dashboard_cards',
  'current_news',
  -- (#R318) the AI TURN ledger: one row per (account, turn). The first call of a turn charges
  -- ai_usage and the rest are free, so a single question no longer costs three uses.
  'ai_turns',
  -- (#R141) area-monitoring feature. (#R280) monitor_seen_items was created by the #R144
  -- hardening migration and never reached this list, so the ONE assertion that says "RLS is on
  -- for every table we have" was measuring 19 of the 20 that exist. A table missing from the
  -- list cannot fail the list.
  'area_monitors','monitor_runs','monitor_evidence','monitor_reports','monitor_seen_items',
  -- (#R334) the Event tables. The map's subject becomes the EVENT rather than the article;
  -- current_news is untouched above, still serving article mode.
  'news_sources','news_source_feeds','news_articles','news_events','news_event_articles',
  -- (#R351) …and the ingest telemetry beside them (docs/NEWS-EVENTS.md §13). Operational
  -- rather than public: admin reads it, service_role writes it.
  'news_cluster_decisions','news_event_i18n','saved_news_events','news_ingest_runs',
  -- (#R366) the operator's audit trail (docs/NEWS-EVENTS.md §11). Admin reads it, service_role
  -- writes it, and every Merge / Split / Reassign / override writes one row with the material
  -- needed to undo it. ⚠ NO FK to auth.users on actor — see the migration's note.
  'news_event_admin_actions'
]) as t;                                                    -- 31 assertions

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
  'area_monitors','monitor_runs','monitor_evidence','monitor_reports','monitor_seen_items',
  'news_sources','news_source_feeds','news_articles','news_events','news_event_articles',
  -- (#R351) …and the ingest telemetry beside them (docs/NEWS-EVENTS.md §13). Operational
  -- rather than public: admin reads it, service_role writes it.
  'news_cluster_decisions','news_event_i18n','saved_news_events','news_ingest_runs',
  'news_event_admin_actions'
]) as t;                                                    -- 31 assertions

-- (#R366) 2b) The operator RPCs exist. The admin console has buttons wired to these four names;
--   a button that calls a function which is not there fails at the moment an operator needs it.
select has_function('public', 'news_event_merge',       'news_event_merge() exists');
select has_function('public', 'news_event_reassign',    'news_event_reassign() exists');
select has_function('public', 'news_event_update_meta', 'news_event_update_meta() exists');
select has_function('public', 'news_event_undo',        'news_event_undo() exists');

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
select has_function('public','consume_ai_turn', array['uuid','integer','text','integer','integer'], 'consume_ai_turn(...) exists');   -- (#R318)
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
