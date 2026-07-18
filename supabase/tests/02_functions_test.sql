-- ============================================================================
--  pgTAP · 02 functions & privileges — the AI-quota RPCs behave correctly and
--  the SECURITY DEFINER surface is safe (§7.3: SECURITY DEFINER / search_path,
--  quota tamper-proofing, admin-escalation guard).
-- ============================================================================
begin;
select no_plan();

-- Let the test session impersonate service_role (see 01_rls_matrix for why).
do $$ begin execute format('grant anon, authenticated, service_role to %I', current_user); exception when others then null; end $$;

create table _cap (k text primary key, v text);
grant insert, select on _cap to service_role;

-- SECURITY INVOKER helpers: body runs as the currently-SET role.
create function _sel(k text, q text) returns void language plpgsql as $$
declare c text; begin execute q into c; insert into _cap values (k, coalesce(c,'<null>'));
exception when others then insert into _cap values (k,'ERR:'||sqlstate); end; $$;
create function _run(k text, q text) returns void language plpgsql as $$
begin execute q; insert into _cap values (k,'OK');
exception when others then insert into _cap values (k,'ERR:'||sqlstate); end; $$;

-- ── RPC behaviour as service_role (A starts at 5; limit 6 → 6th ok, 7th blocked) ──
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select _sel('inc1', 'select used::text || ''/'' || allowed::text from public.increment_ai_usage(''11111111-1111-1111-1111-111111111111'',6)'); -- 6/true
select _sel('inc2', 'select used::text || ''/'' || allowed::text from public.increment_ai_usage(''11111111-1111-1111-1111-111111111111'',6)'); -- 6/false
select _run('refund','select public.refund_ai_usage(''11111111-1111-1111-1111-111111111111'')');                                             -- runs
select _sel('after','select count::text from public.ai_usage where user_id=''11111111-1111-1111-1111-111111111111'' and usage_date=current_date'); -- 5
reset role;

select is((select v from _cap where k='inc1'), '6/true',  'increment_ai_usage allows the use at the limit boundary');
select is((select v from _cap where k='inc2'), '6/false', 'increment_ai_usage BLOCKS the use past the limit (quota enforced)');
select is((select v from _cap where k='after'),'5',       'refund_ai_usage returns one use');

-- ── SECURITY DEFINER surface is hardened (catalog assertions, as superuser) ──
select ok((select prosecdef from pg_proc where oid='public.is_admin()'::regprocedure),                     'is_admin() is SECURITY DEFINER');
select ok((select prosecdef from pg_proc where oid='public.increment_ai_usage(uuid,integer)'::regprocedure),'increment_ai_usage is SECURITY DEFINER');
select ok((select prosecdef from pg_proc where oid='public.refund_ai_usage(uuid)'::regprocedure),          'refund_ai_usage is SECURITY DEFINER');
select ok((select prosecdef from pg_proc where oid='public.handle_new_user()'::regprocedure),              'handle_new_user is SECURITY DEFINER');

select ok(exists(select 1 from unnest((select proconfig from pg_proc where oid='public.is_admin()'::regprocedure)) e where e like 'search_path=%'),                     'is_admin() pins search_path');
select ok(exists(select 1 from unnest((select proconfig from pg_proc where oid='public.increment_ai_usage(uuid,integer)'::regprocedure)) e where e like 'search_path=%'),'increment_ai_usage pins search_path');
select ok(exists(select 1 from unnest((select proconfig from pg_proc where oid='public.refund_ai_usage(uuid)'::regprocedure)) e where e like 'search_path=%'),           'refund_ai_usage pins search_path');
select ok(exists(select 1 from unnest((select proconfig from pg_proc where oid='public.handle_new_user()'::regprocedure)) e where e like 'search_path=%'),               'handle_new_user pins search_path');

-- ── Quota RPCs are service_role-only ────────────────────────────────────────
select ok(not has_function_privilege('anon',          'public.increment_ai_usage(uuid,integer)', 'execute'), 'anon cannot execute increment_ai_usage');
select ok(not has_function_privilege('authenticated', 'public.increment_ai_usage(uuid,integer)', 'execute'), 'authenticated cannot execute increment_ai_usage');
select ok(    has_function_privilege('service_role',  'public.increment_ai_usage(uuid,integer)', 'execute'), 'service_role CAN execute increment_ai_usage');
select ok(not has_function_privilege('authenticated', 'public.refund_ai_usage(uuid)', 'execute'),            'authenticated cannot execute refund_ai_usage');

-- ── Column-privilege guard on profiles (no self-escalation) ─────────────────
select ok(not has_column_privilege('authenticated','public.profiles','is_admin','update'),     'authenticated cannot UPDATE profiles.is_admin');
select ok(not has_column_privilege('authenticated','public.profiles','is_pro','update'),        'authenticated cannot UPDATE profiles.is_pro');
select ok(not has_column_privilege('authenticated','public.profiles','plan','update'),          'authenticated cannot UPDATE profiles.plan');
select ok(not has_column_privilege('authenticated','public.profiles','email','update'),         'authenticated cannot UPDATE profiles.email');
select ok(    has_column_privilege('authenticated','public.profiles','display_name','update'),   'authenticated CAN update profiles.display_name');

-- ── Table-privilege sanity on PII tables ────────────────────────────────────
select ok(not has_table_privilege('anon','public.feedback','select'),          'anon has no SELECT grant on feedback');
select ok(    has_table_privilege('authenticated','public.feedback','select'),  'authenticated has SELECT grant on feedback (RLS restricts to admins)');
select ok(    has_table_privilege('anon','public.feedback','insert'),           'anon may INSERT feedback');
select ok(not has_table_privilege('anon','public.ai_usage','select'),           'anon has no access to ai_usage');

select * from finish();
rollback;
