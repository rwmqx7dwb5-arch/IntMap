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
--  is_admin() keeps its anon grant on purpose: RLS policies that apply to anon
--  call it, and a policy is evaluated with the caller's privileges.
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

commit;
