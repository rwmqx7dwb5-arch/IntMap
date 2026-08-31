-- ============================================================================
--  pgTAP · 07 — R507: public.profiles_public is a TABLE, not a SECURITY DEFINER view.
--
--  THE FINDING THIS PROVES CLOSED (Supabase Security Advisor, level ERROR,
--  lint 0010_security_definer_view, prod-observed 2026-08-31):
--    `public.profiles_public` was a view with no `security_invoker`, so it read
--    `public.profiles` with the VIEW OWNER's rights and bypassed that table's RLS.
--    Only four safe columns were projected, so nothing leaked — but the bypass was
--    a property of the relation, not of the projection, and any column added later
--    would have inherited it. docs/SECURITY-ARCHITECTURE.md §8 item 7 said exactly
--    that and left it open.
--
--  WHY THE OLD TESTS COULD NOT HAVE CAUGHT IT
--    00_structure asserted `has_view('public','profiles_public')` and that the view
--    has no email/is_admin column; 01/05 asserted anon and authenticated can read
--    it. Every one of those assertions is TRUE of the defective shape — they check
--    the projection, and the defect was in the mechanism. This file asserts the
--    mechanism: no view, RLS on, one honest SELECT policy, no write grant, and a
--    sync trigger that is the only writer.
-- ============================================================================
begin;
select no_plan();

-- Impersonation membership (superuser can; otherwise needs membership).
do $imp$ begin execute format('grant anon, authenticated, service_role to %I', current_user); exception when others then null; end $imp$;

-- ─────────────────────────────────────────────────────────────────────────────
--  1. THE MECHANISM — a table with RLS, not a view with an owner bypass.
-- ─────────────────────────────────────────────────────────────────────────────
select is((select c.relkind::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = 'profiles_public'),
          'r'::text, 'R507: profiles_public is an ordinary table (relkind r), not a view');

select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = 'profiles_public'),
          'R507: RLS is enabled on profiles_public');

-- The projection is still exactly the four public columns — the #R134/#R155 promise.
select is((select count(*)::int from information_schema.columns
           where table_schema = 'public' and table_name = 'profiles_public'),
          4, 'R507: profiles_public still has exactly 4 columns');
select is((select count(*)::int from information_schema.columns
           where table_schema = 'public' and table_name = 'profiles_public'
             and column_name in ('email','is_admin','is_pro','plan','login_count')),
          0, 'R507: profiles_public exposes no email/is_admin/is_pro/plan/login_count');

-- Exactly one policy, and it says out loud what this data is.
select is((select count(*)::int from pg_policies
           where schemaname = 'public' and tablename = 'profiles_public'),
          1, 'R507: profiles_public has exactly one policy');
select ok(exists(select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'profiles_public'
                   and cmd = 'SELECT' and qual = 'true'),
          'R507: the one policy is SELECT USING (true) — public by declaration, not by bypass');

-- ─────────────────────────────────────────────────────────────────────────────
--  2. GRANTS — readable by everyone, writable by no client (#R155 least privilege).
--     ⚠ TRUNCATE included: it is NOT subject to RLS, so the grant layer is the only
--     thing that can refuse it (docs/SECURITY-ARCHITECTURE.md §8 item 5).
-- ─────────────────────────────────────────────────────────────────────────────
select ok(    has_table_privilege('anon',         'public.profiles_public','select'),   'R507: anon CAN read profiles_public (author cards keep working)');
select ok(    has_table_privilege('authenticated','public.profiles_public','select'),   'R507: authenticated CAN read profiles_public');
select ok(not has_table_privilege('anon',         'public.profiles_public','insert'),   'R507: anon cannot INSERT profiles_public');
select ok(not has_table_privilege('anon',         'public.profiles_public','update'),   'R507: anon cannot UPDATE profiles_public');
select ok(not has_table_privilege('anon',         'public.profiles_public','delete'),   'R507: anon cannot DELETE profiles_public');
select ok(not has_table_privilege('anon',         'public.profiles_public','truncate'), 'R507: anon cannot TRUNCATE profiles_public (TRUNCATE ignores RLS)');
select ok(not has_table_privilege('authenticated','public.profiles_public','insert'),   'R507: authenticated cannot INSERT profiles_public');
select ok(not has_table_privilege('authenticated','public.profiles_public','update'),   'R507: authenticated cannot UPDATE profiles_public');
select ok(not has_table_privilege('authenticated','public.profiles_public','delete'),   'R507: authenticated cannot DELETE profiles_public');
select ok(not has_table_privilege('authenticated','public.profiles_public','truncate'), 'R507: authenticated cannot TRUNCATE profiles_public');

-- ─────────────────────────────────────────────────────────────────────────────
--  3. THE SYNC FUNCTION — SECURITY DEFINER with a pinned search_path, and NOT
--     callable by a client. A trigger function needs no EXECUTE at fire time, so
--     revoking it costs nothing and keeps the function off the advisor's
--     anon/authenticated_security_definer_function_executable list.
-- ─────────────────────────────────────────────────────────────────────────────
select has_function('public', 'sync_profiles_public', 'R507: sync_profiles_public() exists');
select ok((select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'sync_profiles_public'),
          'R507: sync_profiles_public() is SECURITY DEFINER');
select ok((select p.proconfig::text like '%search_path=%' from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'sync_profiles_public'),
          'R507: sync_profiles_public() pins search_path');
select ok(not has_function_privilege('anon',          'public.sync_profiles_public()','execute'), 'R507: anon cannot EXECUTE sync_profiles_public()');
select ok(not has_function_privilege('authenticated', 'public.sync_profiles_public()','execute'), 'R507: authenticated cannot EXECUTE sync_profiles_public()');

select ok(exists(select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                 join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'public' and c.relname = 'profiles' and t.tgname = 'profiles_public_sync'),
          'R507: the profiles_public_sync trigger is on public.profiles');

-- ─────────────────────────────────────────────────────────────────────────────
--  4. THE SYNC ACTUALLY SYNCS. The seed's three profiles must each have a card,
--     and every write path must keep them in step — otherwise this table is a
--     stale copy dressed as a projection, which is worse than the view was.
-- ─────────────────────────────────────────────────────────────────────────────
select is((select count(*)::int from public.profiles_public), 3,
          'R507: the seed profiles were backfilled into profiles_public');
select is((select count(*)::int from public.profiles p
           left join public.profiles_public pp on pp.id = p.id where pp.id is null), 0,
          'R507: every profile has a card (no orphaned profile)');
select is((select display_name from public.profiles_public where id = '11111111-1111-1111-1111-111111111111'),
          'Test User A'::text, 'R507: the card carries the profile display_name');

-- UPDATE of a watched column propagates.
update public.profiles set display_name = 'Renamed A', bio = 'Edited bio.'
  where id = '11111111-1111-1111-1111-111111111111';
select is((select display_name || ' / ' || bio from public.profiles_public
           where id = '11111111-1111-1111-1111-111111111111'),
          'Renamed A / Edited bio.'::text, 'R507: renaming a profile updates its card');

-- UPDATE of a NON-watched column leaves the card alone (the trigger is column-scoped).
update public.profiles set login_count = login_count + 1
  where id = '11111111-1111-1111-1111-111111111111';
select is((select display_name from public.profiles_public where id = '11111111-1111-1111-1111-111111111111'),
          'Renamed A'::text, 'R507: a login_count bump does not disturb the card');

-- INSERT of a new profile creates a card (this is the signup path: auth.users →
-- handle_new_user → profiles → profiles_public_sync).
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
   confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', '55555555-5555-5555-5555-555555555555',
   'authenticated', 'authenticated', 'r507@intmap.test', '', now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}', '', '', '', '');
select is((select count(*)::int from public.profiles_public where id = '55555555-5555-5555-5555-555555555555'),
          1, 'R507: a new signup gets a card');

-- DELETE cascades: closing an account takes the card with it.
delete from auth.users where id = '55555555-5555-5555-5555-555555555555';
select is((select count(*)::int from public.profiles_public where id = '55555555-5555-5555-5555-555555555555'),
          0, 'R507: deleting the account removes the card');

-- ─────────────────────────────────────────────────────────────────────────────
--  5. THE READ PATH STILL WORKS FOR BOTH ROLES, and profiles itself is still shut.
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select is((select count(*)::int from public.profiles_public), 3,
          'R507: anon reads all three cards through the RLS policy');
reset role;

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.profiles_public), 3,
          'R507: authenticated reads all three cards');
select is((select count(*)::int from public.profiles where id = '22222222-2222-2222-2222-222222222222'), 0,
          'R507: profiles itself is still owner-only (the card table did not loosen it)');
reset role;

select * from finish();
rollback;
