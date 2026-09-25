-- ============================================================================
--  pgTAP · 11 — who may call a SECURITY DEFINER function (multi-aspect-audit).
--  A definer function runs with its owner's rights, so EXECUTE is its whole
--  access control, and PostgreSQL/Supabase hand EXECUTE to PUBLIC and anon by
--  default. The rule is stated on the catalogue, not on a list of names:
--    anon may execute a callable SECURITY DEFINER function in public ONLY when an
--    RLS policy that applies to anon calls it (a policy runs with the caller's
--    privileges, so such a function must stay executable), OR when the function's
--    own COMMENT states why in words: «ANON MAY CALL: <reason>». Opting out costs
--    a sentence the catalogue carries; an inherited grant has no such sentence.
--  Trigger and event-trigger functions are not callable as RPCs and are excluded.
-- ============================================================================
begin;
select no_plan();

select is(
  (select coalesce(string_agg(p.oid::regprocedure::text, ', ' order by 1), '')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and p.prorettype not in ('trigger'::regtype, 'event_trigger'::regtype)
      and has_function_privilege('anon', p.oid, 'execute')
      and coalesce(obj_description(p.oid, 'pg_proc'), '') !~ 'ANON MAY CALL: \S'
      and not exists (
        select 1 from pg_policies pol
         where pol.schemaname = 'public'
           and (pol.roles && array['anon','public']::name[])
           and (coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, '')) ~ ('\m' || p.proname || '\M'))),
  '',
  'no callable SECURITY DEFINER function in public is executable by anon unless an anon-facing RLS policy calls it or its comment says why');

select ok(obj_description('public.is_admin()'::regprocedure, 'pg_proc') ~ 'ANON MAY CALL: \S', 'is_admin() states in its comment why anon may call it');

select ok(not has_function_privilege('anon', 'public.monitor_limit_self()', 'execute'),      'anon cannot execute monitor_limit_self');
select ok(    has_function_privilege('authenticated', 'public.monitor_limit_self()', 'execute'), 'authenticated still can');
select ok(not has_function_privilege('anon', 'public.monitor_mark_read(uuid)', 'execute'),   'anon cannot execute monitor_mark_read');
select ok(    has_function_privilege('authenticated', 'public.monitor_mark_read(uuid)', 'execute'), 'authenticated still can');

select * from finish();
rollback;
