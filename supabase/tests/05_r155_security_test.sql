-- ============================================================================
--  pgTAP · 05 — R155 privilege-escalation hardening.
--
--  THE BUG THIS PROVES CLOSED (prod-verified 2026-07-22):
--    In production the Supabase default privileges granted `authenticated` a blanket
--    table-level UPDATE on public.profiles. Combined with the row-only UPDATE policy
--    profiles_update_own (no column filter), a logged-in user could
--        update public.profiles set is_admin = true where id = auth.uid();
--    and self-promote to admin. The existing column-grant defence was a NO-OP under
--    that blanket grant, and vanilla CI Postgres (which lacks the default grants)
--    could not reproduce it — so 01_rls_matrix's `a_escalate → DENIED` passed while
--    prod was wide open.
--
--  WHAT THIS FILE ADDS (grant-independent proof):
--    1. It RE-CREATES the prod condition on CI — grants `authenticated` the blanket
--       table-level UPDATE on profiles — and then proves the #R155 BEFORE UPDATE
--       guard trigger still freezes is_admin/is_pro/plan/email (escalation blocked
--       regardless of grants).
--    2. It proves the least-privilege column grants (is_admin/plan NOT updatable;
--       display_name IS) and that anon/authenticated no longer hold blanket
--       UPDATE/DELETE on the sensitive tables.
--    3. It proves the public-write length caps reject an oversized payload.
-- ============================================================================
begin;
select no_plan();

-- Impersonation membership (superuser can; otherwise needs membership).
do $$ begin execute format('grant anon, authenticated, service_role to %I', current_user); exception when others then null; end $$;

-- ─────────────────────────────────────────────────────────────────────────────
--  1. GUARD TRIGGER vs the PROD condition. Re-add the blanket table-level UPDATE
--     the Supabase default privileges hand out (the migration revoked it) so this
--     test reproduces prod, then prove the trigger still blocks escalation.
-- ─────────────────────────────────────────────────────────────────────────────
grant update on public.profiles to authenticated;   -- simulate the prod default over-grant

-- As USER A: attempt every escalation vector on the OWN row.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
-- These UPDATEs now MATCH the row (grant + RLS both allow it) — the point is the
-- guarded columns must come back UNCHANGED even though the statement "succeeded".
update public.profiles set is_admin = true  where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set is_pro   = true  where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set plan     = 'unlimited' where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set email    = 'hacked@evil.test' where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set display_name = 'A-renamed' where id = '11111111-1111-1111-1111-111111111111';  -- allowed column
reset role;

select is((select is_admin from public.profiles where id='11111111-1111-1111-1111-111111111111'), false,
          'R155: user CANNOT self-promote is_admin (guard trigger freezes it even WITH a table UPDATE grant)');
select is((select is_pro from public.profiles where id='11111111-1111-1111-1111-111111111111'), false,
          'R155: user CANNOT set is_pro');
select is((select plan from public.profiles where id='11111111-1111-1111-1111-111111111111'), 'free',
          'R155: user CANNOT change its own plan');
select is((select email from public.profiles where id='11111111-1111-1111-1111-111111111111'), 'a@intmap.test',
          'R155: user CANNOT change its own profiles.email');
select is((select display_name from public.profiles where id='11111111-1111-1111-1111-111111111111'), 'A-renamed',
          'R155: user CAN still update its own display_name (guard is column-scoped, not a blanket freeze)');

-- service_role (the server) is exempt — it must still be able to grant admin / set plan.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
update public.profiles set is_admin = true, plan = 'unlimited' where id = '22222222-2222-2222-2222-222222222222';
reset role;
select is((select is_admin from public.profiles where id='22222222-2222-2222-2222-222222222222'), true,
          'R155: service_role CAN still set is_admin (server-side promotion works)');

-- Restore the migration's least-privilege state for the privilege assertions below.
revoke update on public.profiles from authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
--  2. LEAST-PRIVILEGE column/table grants (the migration's converged state).
-- ─────────────────────────────────────────────────────────────────────────────
select ok(not has_column_privilege('authenticated','public.profiles','is_admin','update'), 'R155: authenticated has NO UPDATE on profiles.is_admin');
select ok(not has_column_privilege('authenticated','public.profiles','is_pro','update'),   'R155: authenticated has NO UPDATE on profiles.is_pro');
select ok(not has_column_privilege('authenticated','public.profiles','plan','update'),     'R155: authenticated has NO UPDATE on profiles.plan');
select ok(not has_column_privilege('authenticated','public.profiles','email','update'),    'R155: authenticated has NO UPDATE on profiles.email');
select ok(    has_column_privilege('authenticated','public.profiles','display_name','update'), 'R155: authenticated CAN UPDATE profiles.display_name');
select ok(    has_column_privilege('authenticated','public.profiles','bio','update'),          'R155: authenticated CAN UPDATE profiles.bio');

-- Blanket write privileges the default grants handed out are gone on the public-read
-- and PII tables (RLS was the only thing saving these; now the grant is gone too).
select ok(not has_table_privilege('authenticated','public.current_news','update'),  'R155: authenticated cannot UPDATE current_news');
select ok(not has_table_privilege('authenticated','public.current_news','delete'),  'R155: authenticated cannot DELETE current_news');
select ok(not has_table_privilege('anon','public.current_news','delete'),           'R155: anon cannot DELETE current_news');
select ok(not has_table_privilege('anon','public.feedback','update'),               'R155: anon cannot UPDATE feedback');
select ok(not has_table_privilege('anon','public.feedback','delete'),               'R155: anon cannot DELETE feedback');
select ok(not has_table_privilege('anon','public.community_posts','delete'),        'R155: anon cannot DELETE community_posts');
select ok(not has_table_privilege('anon','public.community_posts','update'),        'R155: anon cannot UPDATE community_posts');
select ok(not has_table_privilege('authenticated','public.donations','delete'),     'R155: authenticated cannot DELETE donations');
select ok(not has_table_privilege('authenticated','public.donations','update'),     'R155: authenticated cannot UPDATE donations');
-- Monitor results cannot be forged at the GRANT layer (not just RLS): no user write.
select ok(not has_table_privilege('authenticated','public.monitor_runs','insert'),     'R155: authenticated cannot INSERT monitor_runs (run results unforgeable)');
select ok(not has_table_privilege('authenticated','public.monitor_evidence','insert'), 'R155: authenticated cannot INSERT monitor_evidence');
select ok(not has_table_privilege('authenticated','public.monitor_reports','update'),  'R155: authenticated cannot UPDATE monitor_reports (reports client-immutable)');
select ok(    has_table_privilege('authenticated','public.monitor_reports','select'),  'R155: authenticated CAN still read its own monitor_reports (RLS-gated)');
select ok(not has_table_privilege('anon','public.profiles','select'),               'R155: anon has NO access to profiles (uses profiles_public)');

-- PII-leak invariant: no world-readable profiles. A cannot read B's email/flags;
-- anon cannot read profiles at all; both CAN read the safe profiles_public view.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.profiles where id='22222222-2222-2222-2222-222222222222'), 0,
          'R155: authenticated user A cannot read another user''s profiles row (email/is_admin not world-readable)');
select is((select count(*)::int from public.profiles_public), 3,
          'R155: authenticated CAN read the public-safe profiles_public projection');
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select is((select count(*)::int from public.profiles_public), 3,
          'R155: anon CAN read profiles_public (community author cards keep working)');
reset role;
select ok(not exists(select 1 from pg_policies where schemaname='public' and tablename='profiles' and cmd='SELECT' and qual='true'),
          'R155: no profiles SELECT policy uses USING(true) (the PII leak is gone)');

-- Things that MUST still work (regression guard on the re-grant).
select ok(has_table_privilege('anon','public.feedback','insert'),                   'R155: anon CAN still submit feedback');
select ok(has_table_privilege('anon','public.current_news','select'),               'R155: anon CAN still read current_news');
select ok(has_table_privilege('authenticated','public.favorites','insert'),         'R155: authenticated CAN still save favorites');
select ok(has_table_privilege('authenticated','public.community_posts','insert'),   'R155: authenticated CAN still post');

-- ─────────────────────────────────────────────────────────────────────────────
--  3. PUBLIC-WRITE LENGTH CAPS reject an oversized payload (abuse/DoS guard).
-- ─────────────────────────────────────────────────────────────────────────────
select throws_ok(
  $$ insert into public.feedback(rating, comment) values (3, repeat('x', 5001)) $$,
  '23514', null, 'R155: an over-length (5001-char) feedback comment is rejected');
select lives_ok(
  $$ insert into public.feedback(rating, comment) values (3, repeat('x', 4000)) $$,
  'R155: a normal-length feedback comment is accepted');
select throws_ok(
  $$ insert into public.community_comments(post_id, user_id, body) values (1, '11111111-1111-1111-1111-111111111111', repeat('y', 5001)) $$,
  '23514', null, 'R155: an over-length community comment is rejected');

select * from finish();
rollback;
