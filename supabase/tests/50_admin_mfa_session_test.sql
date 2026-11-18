-- ============================================================================
--  pgTAP · 50 — 20261118090000_admin_needs_mfa_session.sql
--
--  WHAT THIS PROVES:
--    · an administrator ACCOUNT in a session that did not pass the second factor (aal1 — every
--      session the app makes, and every token a stolen app session can refresh into) is not an
--      admin: is_admin() is false, the admin-only tables return no rows, the admin RPCs refuse;
--    · the same account at aal2 (the console's session after a TOTP challenge) is an admin;
--    · no policy and no function in `public` decides admin rights except through public.is_admin()
--      — the catalogue is read, not a list of names, so a new policy that reads the column inline
--      fails here the day it is written.
-- ============================================================================
begin;
select no_plan();

do $$ begin execute format('grant anon, authenticated, service_role to %I', current_user); exception when others then null; end $$;

-- a row in an admin-only table to look for
insert into public.feedback (comment, rating) values ('admin-origin probe', 5);

-- ── the administrator account WITHOUT the second factor ───────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is(public.is_admin(), false, 'an admin account at aal1 is not an admin');
select is((select count(*)::int from public.feedback where comment = 'admin-origin probe'), 0,
          'an admin account at aal1 reads no feedback (admin-only table)');
select throws_ok($$ select public.news_event_merge(1, 2, null) $$, 'P0001', 'not authorised',
          'an admin account at aal1 cannot merge news events (an RPC that read the column inline)');
reset role;

-- ── a session with no aal claim at all (an older token) is treated as aal1 ─────────────────────
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select is(public.is_admin(), false, 'an admin account whose token states no aal is not an admin');
reset role;

-- ── the same account WITH the second factor ───────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is(public.is_admin(), true, 'the admin account at aal2 is an admin');
select is((select count(*)::int from public.feedback where comment = 'admin-origin probe'), 1,
          'the admin account at aal2 reads feedback');
reset role;

-- ── aal2 is not admin by itself ────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is(public.is_admin(), false, 'an ordinary account at aal2 is not an admin');
reset role;

-- ── nothing else decides admin rights ─────────────────────────────────────────────────────────
select is(
  (select string_agg(format('%s on %s', policyname, tablename), ', ')
     from pg_policies
    where schemaname = 'public'
      -- `(select public.is_admin())` deparses as `( SELECT is_admin() AS is_admin)` — the alias is not a read of the column
      and regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''), '(public\.)?is_admin\(\)(\s+AS\s+is_admin)?', '', 'g') ~ 'is_admin'),
  null,
  'every policy in public decides admin rights through public.is_admin() only');

--  Functions: the body may name the COLUMN only where it guards or provisions the column itself
--  (the privilege-column guard, new-user provisioning, the predicate). Anything that decides
--  "may this caller act as an admin" must call is_admin().
select is(
  (select string_agg(p.oid::regprocedure::text, ', ')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosrc ~ '\.is_admin\M(?!\s*\()'
      and p.oid <> 'public.is_admin()'::regprocedure
      and p.proname not in ('tg_profiles_guard_privcols', 'handle_new_user')),
  null,
  'no function in public reads profiles.is_admin to decide a caller''s rights (it calls public.is_admin())');

select * from finish();
rollback;
