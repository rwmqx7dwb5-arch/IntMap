-- ============================================================================
--  A SECURITY DEFINER function runs with its owner's rights, so WHO MAY CALL IT
--  is the whole of its access control. `grant … to authenticated` does not say
--  «and nobody else»: PostgreSQL gives EXECUTE to PUBLIC when a function is
--  created, and Supabase's default privileges give it to anon as well.
--
--  MEASURED 2026-09-26 on production (`has_function_privilege('anon', …)`):
--    monitor_limit_self()     anon = true   (the migration granted authenticated only)
--    monitor_mark_read(uuid)  anon = true   (the migration granted authenticated only)
--    handle_new_user()        anon = true, authenticated = true (a trigger function)
--  Both RPCs read auth.uid() and so do nothing useful for anon today, but the
--  grant is what the design must rest on, not the body: the next edit to either
--  body inherits an anonymous caller nobody chose. The sibling functions in the
--  same migrations already carry the `revoke … from public, anon` this pair lacked.
--
--  is_admin() keeps its anon grant on purpose — the baseline chose it in words
--  («safe to evaluate, returns only a boolean about the caller»), and on
--  production RLS policies that anon evaluates may call it (a policy runs with
--  the caller's privileges, so revoking could break anonymous reads). A choice
--  like that is now written where the catalogue can read it: the function's
--  COMMENT carries «ANON MAY CALL: <reason>», and the test accepts an anon grant
--  only with such a sentence or an anon-facing policy that calls the function.
--  supabase/tests/11_definer_execute_test.sql asserts the rule for every callable
--  SECURITY DEFINER function in public, not for these three names.
-- ============================================================================
begin;

revoke execute on function public.monitor_limit_self()     from public, anon;
grant  execute on function public.monitor_limit_self()     to authenticated, service_role;

revoke execute on function public.monitor_mark_read(uuid)  from public, anon;
grant  execute on function public.monitor_mark_read(uuid)  to authenticated, service_role;

-- A trigger function is not callable as an RPC, but nothing needs EXECUTE on it
-- either: the trigger runs it as the table's trigger, not as the caller's call.
revoke execute on function public.handle_new_user()        from public, anon, authenticated;

comment on function public.is_admin() is
  'True when the current JWT user has profiles.is_admin. SECURITY DEFINER to avoid RLS recursion; used by admin-only policies. ANON MAY CALL: it returns only a boolean about the caller (false for anon), and RLS policies anon evaluates may call it — a policy runs with the caller''s privileges.';

commit;
