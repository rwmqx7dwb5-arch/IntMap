-- ============================================================================
--  pgTAP · 48 — security-review-nov: the three public doors are the server's, a moderation
--  hold covers the account, and a turn's refund waits for every attempt of it (K1).
-- ============================================================================
begin;
select no_plan();

do $$ begin execute format('grant anon, authenticated, service_role to %I', current_user); exception when others then null; end $$;

create table _cap (k text primary key, v text);
grant insert, select on _cap to anon, authenticated, service_role;
create function _sel(k text, q text) returns void language plpgsql as $$
declare c text; begin execute q into c; insert into _cap values (k, coalesce(c,'<null>'));
exception when insufficient_privilege then insert into _cap values (k,'DENIED');
        when others then insert into _cap values (k,'ERR:'||sqlstate); end; $$;

-- ─────────────────────────────────────────────────────────────────────────────
--  1. EVERY overload of the three doors: anon and authenticated cannot execute it, service_role can.
--     Measured over the catalogue (pg_proc by name), so an overload added later is covered too.
-- ─────────────────────────────────────────────────────────────────────────────
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('community_maps', 'class_set_open', 'class_set_submit')
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
  0, 'security-review-nov: no overload of community_maps / class_set_open / class_set_submit is executable by anon or authenticated');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('community_maps', 'class_set_open', 'class_set_submit')
      and has_function_privilege('service_role', p.oid, 'execute')),
  3, 'security-review-nov: the community-class Edge Function (service_role) can call each of the three');

-- the call itself, as a client would make it
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select _sel('anon_open',   'select public.class_set_open(''ABCDEFGH'')::text');
select _sel('anon_submit', 'select public.class_set_submit(''ABCDEFGH'', '''', ''[]''::jsonb)::text');
select _sel('anon_dir',    'select public.community_maps(null, ''new'', 24, null, null)::text');
reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _sel('auth_open',   'select public.class_set_open(''ABCDEFGH'')::text');
reset role;
select is((select v from _cap where k='anon_open'),   'DENIED', 'security-review-nov: anon cannot probe a class code through class_set_open');
select is((select v from _cap where k='anon_submit'), 'DENIED', 'security-review-nov: anon cannot probe a class code through class_set_submit (N1)');
select is((select v from _cap where k='anon_dir'),    'DENIED', 'security-review-nov: anon cannot loop the directory straight through PostgREST');
select is((select v from _cap where k='auth_open'),   'DENIED', 'security-review-nov: a signed-in client cannot either');

-- ─────────────────────────────────────────────────────────────────────────────
--  2. A HOLD COVERS THE ACCOUNT: a hold on one collection holds every name, and «everything» (NULL).
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.community_map_holds (user_id, collection, reason)
values ('22222222-2222-2222-2222-222222222222', 'Trips', 'test hold');
select ok(public.community_map_held('22222222-2222-2222-2222-222222222222', 'Trips'),         'security-review-nov: the held collection is held');
select ok(public.community_map_held('22222222-2222-2222-2222-222222222222', 'Trips renamed'), 'security-review-nov: renaming it does not lift the hold');
select ok(public.community_map_held('22222222-2222-2222-2222-222222222222', null),            'security-review-nov: «everything» of a held account is held');
select ok(not public.community_map_held('33333333-3333-3333-3333-333333333333', 'Trips'),      'security-review-nov: another account is not');
delete from public.community_map_holds where user_id = '22222222-2222-2222-2222-222222222222';

-- ─────────────────────────────────────────────────────────────────────────────
--  3. K1 — two attempts of one turn, in the order the race needs (a deterministic barrier: one
--     transaction, each step a statement). User C (33…).
--     A opens (charges), B continues; A fails → held (B still running); B answers → settled; the use stays.
--     Then: a turn whose two attempts both fail is refunded once, by the last one.
--     And: a late close of a generation that was released does nothing to the new turn under that key.
-- ─────────────────────────────────────────────────────────────────────────────
-- run as the test owner: the RPCs are SECURITY DEFINER, and the owner can read ai_usage to measure them
create temp table _g (k text primary key, gen uuid);
insert into _g select 'A', gen from public.consume_ai_turn('33333333-3333-3333-3333-333333333333',10,'k1-race',6,900);
insert into _g select 'B', gen from public.consume_ai_turn('33333333-3333-3333-3333-333333333333',10,'k1-race',6,900);
select _sel('used0', 'select count::text from public.ai_usage where user_id=''33333333-3333-3333-3333-333333333333'' and usage_date=current_date');
select _sel('refA',  'select public.refund_ai_turn(''33333333-3333-3333-3333-333333333333'',''k1-race'',(select gen from _g where k=''A''))');
select _sel('setB',  'select public.settle_ai_turn(''33333333-3333-3333-3333-333333333333'',''k1-race'',(select gen from _g where k=''B''))::text');
select _sel('used1', 'select count::text from public.ai_usage where user_id=''33333333-3333-3333-3333-333333333333'' and usage_date=current_date');

insert into _g select 'C', gen from public.consume_ai_turn('33333333-3333-3333-3333-333333333333',10,'k1-fail',6,900);
insert into _g select 'D', gen from public.consume_ai_turn('33333333-3333-3333-3333-333333333333',10,'k1-fail',6,900);
select _sel('used2', 'select count::text from public.ai_usage where user_id=''33333333-3333-3333-3333-333333333333'' and usage_date=current_date');
select _sel('refC',  'select public.refund_ai_turn(''33333333-3333-3333-3333-333333333333'',''k1-fail'',(select gen from _g where k=''C''))');
select _sel('refD',  'select public.refund_ai_turn(''33333333-3333-3333-3333-333333333333'',''k1-fail'',(select gen from _g where k=''D''))');
select _sel('refD2', 'select public.refund_ai_turn(''33333333-3333-3333-3333-333333333333'',''k1-fail'',(select gen from _g where k=''D''))');
select _sel('used3', 'select count::text from public.ai_usage where user_id=''33333333-3333-3333-3333-333333333333'' and usage_date=current_date');

-- the key is used again: a new generation; the old generation's late close changes nothing
insert into _g select 'E', gen from public.consume_ai_turn('33333333-3333-3333-3333-333333333333',10,'k1-fail',6,900);
select _sel('lateC', 'select public.refund_ai_turn(''33333333-3333-3333-3333-333333333333'',''k1-fail'',(select gen from _g where k=''C''))');
select _sel('lateS', 'select public.settle_ai_turn(''33333333-3333-3333-3333-333333333333'',''k1-fail'',(select gen from _g where k=''D''))::text');
select _sel('used4', 'select count::text from public.ai_usage where user_id=''33333333-3333-3333-3333-333333333333'' and usage_date=current_date');
select _sel('newE',  'select public.refund_ai_turn(''33333333-3333-3333-3333-333333333333'',''k1-fail'',(select gen from _g where k=''E''))');
select _sel('used5', 'select count::text from public.ai_usage where user_id=''33333333-3333-3333-3333-333333333333'' and usage_date=current_date');

select is((select v from _cap where k='refA'),  'held',     'K1: the first attempt failing while a continuation runs does not refund');
select is((select v from _cap where k='setB'),  'true',     'K1: the continuation still finds its turn to settle');
select is((select v from _cap where k='used1'), (select v from _cap where k='used0'), 'K1: an answered turn keeps its one charge');
select is((select v from _cap where k='refC'),  'held',     'K1: a failing attempt with another in flight is held');
select is((select v from _cap where k='refD'),  'refunded', 'K1: the last failing attempt refunds the turn');
select is((select v from _cap where k='refD2'), 'not_found','K1: closing it again refunds nothing (no double refund)');
select is((select v from _cap where k='used3')::int, (select v from _cap where k='used2')::int - 1, 'K1: exactly one use is given back');
select is((select v from _cap where k='lateC'), 'not_found','K1: a late refund of a released generation does not touch the new turn');
select is((select v from _cap where k='lateS'), 'false',    'K1: a late settle of a released generation does not mark the new turn answered');
select is((select v from _cap where k='used4')::int, (select v from _cap where k='used3')::int + 1, 'K1: the new turn under the reused key is charged once');
select is((select v from _cap where k='newE'),  'refunded', 'K1: and is refunded by its own failure');
select is((select v from _cap where k='used5'), (select v from _cap where k='used3'), 'K1: back to where it was');

select * from finish();
rollback;
