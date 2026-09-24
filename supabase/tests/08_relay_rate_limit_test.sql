-- ============================================================================
--  pgTAP · 08 — #R801: the shared token bucket behind the keyed relays.
--
--  THE FINDING THIS PROVES CLOSED (external audit, 2026-09-18): routing-relay's
--  spend control was an in-process Map — per isolate, gone on restart, and with
--  no project-wide ceiling at all. `public.relay_take` is the shared, atomic
--  bucket that replaces it as the accounting boundary. This file asserts the
--  ARITHMETIC (allow up to capacity, refuse past it, refill with time) and the
--  SURFACE (SECURITY DEFINER, pinned search_path, service_role only, a table no
--  client role can touch) — the two halves tests/r801-relay-spend-checks.test.mjs
--  cannot evaluate without a Postgres.
-- ============================================================================
begin;
select no_plan();

-- Impersonation membership (superuser can; otherwise needs membership).
do $imp$ begin execute format('grant anon, authenticated, service_role to %I', current_user); exception when others then null; end $imp$;

create table _cap (k text primary key, v text);
grant insert, select on _cap to anon, authenticated, service_role;

-- SECURITY INVOKER helpers: the body runs as the currently-SET role (see 01_rls_matrix).
create function _sel(k text, q text) returns void language plpgsql as $$
declare c text;
begin
  execute q into c;
  insert into _cap values (k, coalesce(c, '<null>'));
exception
  when insufficient_privilege then insert into _cap values (k, 'DENIED');
  when others then insert into _cap values (k, 'ERR:' || sqlstate);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  1. THE SURFACE — catalog assertions, as superuser.
-- ─────────────────────────────────────────────────────────────────────────────
select has_table('public', 'relay_rate_buckets', 'R801: relay_rate_buckets exists');
select has_function('public', 'relay_take', array['text','text','integer','numeric','integer'], 'R801: relay_take(text,text,int,numeric,int) exists');
select has_function('public', 'sweep_relay_rate_buckets', array['integer'], 'R801: sweep_relay_rate_buckets(int) exists');

select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = 'relay_rate_buckets'),
          'R801: RLS is enabled on relay_rate_buckets');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'relay_rate_buckets'),
          0, 'R801: relay_rate_buckets has NO policy — no client role reads or writes it');

select ok((select prosecdef from pg_proc where oid = 'public.relay_take(text,text,integer,numeric,integer)'::regprocedure),
          'R801: relay_take is SECURITY DEFINER');
select ok(exists(select 1 from unnest((select proconfig from pg_proc where oid = 'public.relay_take(text,text,integer,numeric,integer)'::regprocedure)) e where e like 'search_path=%'),
          'R801: relay_take pins search_path to ''''');
select ok((select prosecdef from pg_proc where oid = 'public.sweep_relay_rate_buckets(integer)'::regprocedure),
          'R801: sweep_relay_rate_buckets is SECURITY DEFINER');
select ok(exists(select 1 from unnest((select proconfig from pg_proc where oid = 'public.sweep_relay_rate_buckets(integer)'::regprocedure)) e where e like 'search_path=%'),
          'R801: sweep_relay_rate_buckets pins search_path to ''''');

-- ─────────────────────────────────────────────────────────────────────────────
--  2. GRANTS — service_role only. ⚠ TRUNCATE is not subject to RLS; only the grant refuses it.
-- ─────────────────────────────────────────────────────────────────────────────
select ok(not has_function_privilege('anon',          'public.relay_take(text,text,integer,numeric,integer)', 'execute'), 'R801: anon cannot execute relay_take');
select ok(not has_function_privilege('authenticated', 'public.relay_take(text,text,integer,numeric,integer)', 'execute'), 'R801: authenticated cannot execute relay_take');
select ok(    has_function_privilege('service_role',  'public.relay_take(text,text,integer,numeric,integer)', 'execute'), 'R801: service_role CAN execute relay_take');
select ok(not has_function_privilege('anon',          'public.sweep_relay_rate_buckets(integer)', 'execute'), 'R801: anon cannot execute the sweep');
select ok(not has_function_privilege('authenticated', 'public.sweep_relay_rate_buckets(integer)', 'execute'), 'R801: authenticated cannot execute the sweep');

select ok(not has_table_privilege('anon',          'public.relay_rate_buckets', 'select'),   'R801: anon has no SELECT on relay_rate_buckets');
select ok(not has_table_privilege('anon',          'public.relay_rate_buckets', 'insert'),   'R801: anon has no INSERT on relay_rate_buckets');
select ok(not has_table_privilege('anon',          'public.relay_rate_buckets', 'truncate'), 'R801: anon has no TRUNCATE on relay_rate_buckets');
select ok(not has_table_privilege('authenticated', 'public.relay_rate_buckets', 'select'),   'R801: authenticated has no SELECT on relay_rate_buckets');
select ok(not has_table_privilege('authenticated', 'public.relay_rate_buckets', 'update'),   'R801: authenticated has no UPDATE on relay_rate_buckets');
select ok(not has_table_privilege('authenticated', 'public.relay_rate_buckets', 'delete'),   'R801: authenticated has no DELETE on relay_rate_buckets');
select ok(not has_table_privilege('authenticated', 'public.relay_rate_buckets', 'truncate'), 'R801: authenticated has no TRUNCATE on relay_rate_buckets');

-- ─────────────────────────────────────────────────────────────────────────────
--  3. THE ARITHMETIC, as service_role — capacity 3, no refill: three takes, then a refusal.
--     `remaining` is the balance after the call.
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select _sel('t1', 'select allowed::text || ''/'' || remaining::text from public.relay_take(''tap:a'', ''k'', 3, 0, 1)');  -- true/2
select _sel('t2', 'select allowed::text || ''/'' || remaining::text from public.relay_take(''tap:a'', ''k'', 3, 0, 1)');  -- true/1
select _sel('t3', 'select allowed::text || ''/'' || remaining::text from public.relay_take(''tap:a'', ''k'', 3, 0, 1)');  -- true/0
select _sel('t4', 'select allowed::text || ''/'' || remaining::text from public.relay_take(''tap:a'', ''k'', 3, 0, 1)');  -- false/0
-- a different key in the same scope is its own bucket; a different scope with the same key too
select _sel('t5', 'select allowed::text || ''/'' || remaining::text from public.relay_take(''tap:a'', ''other'', 3, 0, 1)');  -- true/2
select _sel('t6', 'select allowed::text || ''/'' || remaining::text from public.relay_take(''tap:b'', ''k'', 3, 0, 1)');      -- true/2
-- a cost larger than what is left is refused whole, not partially granted
select _sel('t7', 'select allowed::text || ''/'' || remaining::text from public.relay_take(''tap:b'', ''k'', 3, 0, 5)');      -- false/2
-- a nameless bucket is refused rather than pooled under ''
select _sel('t8', 'select allowed::text from public.relay_take('''', ''k'', 3, 0, 1)');                                       -- false
reset role;

select is((select v from _cap where k = 't1'), 'true/2',  'R801: the first take from a fresh bucket is allowed (capacity 3 → 2 left)');
select is((select v from _cap where k = 't2'), 'true/1',  'R801: the second is allowed (1 left)');
select is((select v from _cap where k = 't3'), 'true/0',  'R801: the third is allowed (0 left)');
select is((select v from _cap where k = 't4'), 'false/0', 'R801: the fourth is REFUSED — the ceiling holds');
select is((select v from _cap where k = 't5'), 'true/2',  'R801: another key in the same scope is its own bucket');
select is((select v from _cap where k = 't6'), 'true/2',  'R801: the same key in another scope is its own bucket');
select is((select v from _cap where k = 't7'), 'false/2', 'R801: a cost above the balance is refused whole and the balance is untouched');
select is((select v from _cap where k = 't8'), 'false',   'R801: an empty scope is refused, not pooled');

-- ─────────────────────────────────────────────────────────────────────────────
--  4. REFILL WITH TIME. relay_take reads clock_timestamp(), so moving `at` into the past is
--     the same as waiting. Bucket tap:a/k is empty; 0.5 tokens/s × 4 s = 2 tokens → two takes
--     allowed, the third refused. (Refill is clamped to capacity: 100 s later there are 3, not 50.)
-- ─────────────────────────────────────────────────────────────────────────────
update public.relay_rate_buckets set at = clock_timestamp() - interval '4 seconds' where scope = 'tap:a' and key = 'k';
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select _sel('r1', 'select allowed::text from public.relay_take(''tap:a'', ''k'', 3, 0.5, 1)');   -- true (2 refilled → 1)
select _sel('r2', 'select allowed::text from public.relay_take(''tap:a'', ''k'', 3, 0.5, 1)');   -- true (→ 0)
select _sel('r3', 'select allowed::text from public.relay_take(''tap:a'', ''k'', 3, 0.5, 1)');   -- false
reset role;
update public.relay_rate_buckets set at = clock_timestamp() - interval '100 seconds' where scope = 'tap:a' and key = 'k';
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select _sel('r4', 'select allowed::text || ''/'' || remaining::text from public.relay_take(''tap:a'', ''k'', 3, 0.5, 1)');  -- true/2 (clamped to 3, minus 1)
reset role;

select is((select v from _cap where k = 'r1'), 'true',   'R801: after 4 s at 0.5/s the empty bucket allows again');
select is((select v from _cap where k = 'r2'), 'true',   'R801: …twice');
select is((select v from _cap where k = 'r3'), 'false',  'R801: …and not a third time');
select is((select v from _cap where k = 'r4'), 'true/2', 'R801: refill is clamped to capacity (100 s does not mint 50 tokens)');

-- ─────────────────────────────────────────────────────────────────────────────
--  5. NO CLIENT MAY CALL IT — impersonated anon and authenticated are refused outright.
-- ─────────────────────────────────────────────────────────────────────────────
set local role anon;
select _sel('anon', 'select allowed::text from public.relay_take(''tap:c'', ''k'', 3, 0, 1)');
select _sel('anon_tbl', 'select count(*)::text from public.relay_rate_buckets');
reset role;
set local role authenticated;
select _sel('auth', 'select allowed::text from public.relay_take(''tap:c'', ''k'', 3, 0, 1)');
select _sel('auth_tbl', 'select count(*)::text from public.relay_rate_buckets');
reset role;

select is((select v from _cap where k = 'anon'),     'DENIED', 'R801: anon is refused EXECUTE on relay_take');
select is((select v from _cap where k = 'anon_tbl'), 'DENIED', 'R801: anon is refused SELECT on relay_rate_buckets');
select is((select v from _cap where k = 'auth'),     'DENIED', 'R801: authenticated is refused EXECUTE on relay_take');
select is((select v from _cap where k = 'auth_tbl'), 'DENIED', 'R801: authenticated is refused SELECT on relay_rate_buckets');
select is((select count(*)::int from public.relay_rate_buckets where scope = 'tap:c'), 0, 'R801: the refused calls created no bucket');

-- ─────────────────────────────────────────────────────────────────────────────
--  6. THE SWEEP — an idle bucket is indistinguishable from an absent one, so it goes; a recent
--     one stays.
-- ─────────────────────────────────────────────────────────────────────────────
update public.relay_rate_buckets set at = clock_timestamp() - interval '3 days' where scope = 'tap:b' and key = 'k';
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select _sel('sw', 'select public.sweep_relay_rate_buckets(172800)::text');
reset role;
select is((select v from _cap where k = 'sw'), '1', 'R801: the sweep removed exactly the one bucket idle for 3 days');
select is((select count(*)::int from public.relay_rate_buckets where scope = 'tap:b'), 0, 'R801: the idle bucket is gone');
select ok(exists(select 1 from public.relay_rate_buckets where scope = 'tap:a' and key = 'k'), 'R801: the recently used bucket stays');

select * from finish();
rollback;
