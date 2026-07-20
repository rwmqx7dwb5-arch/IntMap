-- ============================================================================
--  pgTAP · 03 security hardening (#R138) — attack cases ADDED on top of the
--  00/01/02 suites (this file does not rewrite them). New coverage:
--    • feedback.rating CHECK — the guard for the admin-console RangeError DoS
--      (an anon-insertable out-of-range rating bricked the admin Feedback tab).
--    • profiles_public leaks NOTHING sensitive (only id/display_name/bio/avatar_url).
--    • the public-READ tables (current_news/geo_pins/dashboard_cards) are NOT
--      writable by anon, and ai_usage is never directly writable (RPC-only).
-- ============================================================================
begin;
select no_plan();

-- ── feedback.rating CHECK constraint (guards the admin-render DoS) ───────────
select ok(
  exists(select 1 from pg_constraint
         where conname = 'feedback_rating_range' and conrelid = 'public.feedback'::regclass),
  'feedback_rating_range CHECK constraint exists');
-- Out-of-range ratings are rejected at the DB (check_violation = 23514), so a
-- malicious insert can never reach the admin renderer.
select throws_ok($$ insert into public.feedback(rating) values (6)  $$, '23514', null, 'rating = 6 is rejected (the DoS payload)');
select throws_ok($$ insert into public.feedback(rating) values (0)  $$, '23514', null, 'rating = 0 is rejected');
select throws_ok($$ insert into public.feedback(rating) values (-1) $$, '23514', null, 'rating = -1 is rejected');
select lives_ok($$  insert into public.feedback(rating) values (1)    $$, 'rating = 1 is accepted');
select lives_ok($$  insert into public.feedback(rating) values (5)    $$, 'rating = 5 is accepted');
select lives_ok($$  insert into public.feedback(rating) values (null) $$, 'rating = NULL is accepted (feedback need not be rated)');

-- ── profiles_public exposes ONLY the four safe columns (no PII / no flags) ───
select is(
  (select count(*)::int from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles_public'),
  4, 'profiles_public has exactly 4 columns');
select ok(
  not exists(select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'profiles_public'
               and column_name in ('email','is_admin','is_pro','plan','login_count')),
  'profiles_public does NOT expose email/is_admin/is_pro/plan/login_count');

-- ── public-READ tables are not writable by anon (writes = admin/service_role) ─
select ok(not has_table_privilege('anon','public.current_news','insert'),      'anon cannot INSERT current_news');
select ok(not has_table_privilege('anon','public.current_news','update'),      'anon cannot UPDATE current_news');
select ok(not has_table_privilege('anon','public.current_news','delete'),      'anon cannot DELETE current_news');
select ok(not has_table_privilege('anon','public.geo_pins','insert'),          'anon cannot INSERT geo_pins');
select ok(not has_table_privilege('anon','public.dashboard_cards','insert'),   'anon cannot INSERT dashboard_cards');

-- ── ai_usage is never directly writable — only the SECURITY DEFINER RPCs write it ─
select ok(not has_table_privilege('authenticated','public.ai_usage','insert'), 'authenticated cannot INSERT ai_usage (quota tamper-proof)');
select ok(not has_table_privilege('authenticated','public.ai_usage','update'), 'authenticated cannot UPDATE ai_usage');
select ok(not has_table_privilege('authenticated','public.ai_usage','delete'), 'authenticated cannot DELETE ai_usage');

select * from finish();
rollback;
