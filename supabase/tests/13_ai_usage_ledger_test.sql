-- ============================================================================
--  pgTAP · 13 — ai-one-ledger: what an AI call COST, in the ledger that counts it.
--    ① the six cost columns exist on ai_usage and on ai_turns, default 0;
--    ② record_ai_usage adds to today's ai_usage row and to the live turn row, and NEVER changes
--      count (the allowance) — recording a cost neither spends nor refunds a use;
--    ③ an account with no row today (the developer, a scheduled monitor's owner) gets one with
--      count 0; zero calls write nothing; negative inputs read as 0;
--    ④ only service_role may call it; the owner reads the numbers through the existing RLS.
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
create function _run(k text, q text) returns void language plpgsql as $$
begin execute q; insert into _cap values (k,'OK');
exception when insufficient_privilege then insert into _cap values (k,'DENIED');
        when others then insert into _cap values (k,'ERR:'||sqlstate); end; $$;

-- ─────────────────────────────────────────────────────────────────────────────
--  1. THE COLUMNS
-- ─────────────────────────────────────────────────────────────────────────────
select has_column('public'::name, 'ai_usage'::name, c::name, 'ai_usage.' || c || ' exists')
  from unnest(array['input_tokens','cached_read_tokens','cache_write_tokens','output_tokens','provider_calls','unmetered_calls']) c;
select has_column('public'::name, 'ai_turns'::name, c::name, 'ai_turns.' || c || ' exists')
  from unnest(array['input_tokens','cached_read_tokens','cache_write_tokens','output_tokens','provider_calls','unmetered_calls']) c;
select col_default_is('public'::name, 'ai_usage'::name, 'input_tokens'::name, '0'::text, 'a row written before this migration reads 0, not null');

-- ─────────────────────────────────────────────────────────────────────────────
--  2. ONE TURN, TWO REQUESTS — user B (22…) is charged once and records twice
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select _sel('c1', 'select used::text || ''/'' || charged::text from public.consume_ai_turn(''22222222-2222-2222-2222-222222222222'',10,''turn-U'',12,900)');   -- 1/true
select _run('r1', 'select public.record_ai_usage(''22222222-2222-2222-2222-222222222222'',''turn-U'',2,1,100,7000,50,300)');
select _run('r2', 'select public.record_ai_usage(''22222222-2222-2222-2222-222222222222'',''turn-U'',1,0,10,0,0,5)');
select _run('r0', 'select public.record_ai_usage(''22222222-2222-2222-2222-222222222222'',''turn-U'',0,0,999,999,999,999)');   -- zero calls: nothing
select _run('rn', 'select public.record_ai_usage(''22222222-2222-2222-2222-222222222222'','''',1,5,-40,-1,null,2)');           -- negatives → 0, unmetered ≤ calls, no turn
-- user A (11…) has not been charged today: a cost still gets a row, with count 0
select _run('ra', 'select public.record_ai_usage(''11111111-1111-1111-1111-111111111111'','''',1,0,20,0,0,4)');
reset role;

select is((select v from _cap where k='c1'), '1/true', 'the turn is charged once');
select is((select v from _cap where k='r1'), 'OK',     'service_role records a cost');

-- read back as the OWNER (ai_usage_select_own / ai_turns_select_own); service_role holds no table grant
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select _sel('u_count', 'select count::text from public.ai_usage where user_id=''22222222-2222-2222-2222-222222222222'' and usage_date=current_date');
select _sel('u_cost',  'select input_tokens||''/''||cached_read_tokens||''/''||cache_write_tokens||''/''||output_tokens||''/''||provider_calls||''/''||unmetered_calls from public.ai_usage where user_id=''22222222-2222-2222-2222-222222222222'' and usage_date=current_date');
select _sel('t_cost',  'select input_tokens||''/''||cached_read_tokens||''/''||cache_write_tokens||''/''||output_tokens||''/''||provider_calls||''/''||unmetered_calls from public.ai_turns where user_id=''22222222-2222-2222-2222-222222222222'' and turn_key=''turn-U''');
select _sel('b_call',  'select public.record_ai_usage(''22222222-2222-2222-2222-222222222222'','''',1,0,1,1,1,1)::text');
reset role;

select is((select v from _cap where k='u_count'), '1',                   'recording a cost never changes count (the allowance)');
select is((select v from _cap where k='u_cost'),  '110/7000/50/307/4/2', 'ai_usage sums both requests of the turn and the turn-less one; zero calls wrote nothing; negatives read as 0; unmetered is capped by calls');
select is((select v from _cap where k='t_cost'),  '110/7000/50/305/3/1', 'the live turn row carries the turn''s own cost');
select is((select v from _cap where k='b_call'),  'DENIED',              'authenticated cannot call record_ai_usage');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _sel('a_row', 'select count||''/''||input_tokens||''/''||output_tokens||''/''||provider_calls from public.ai_usage where user_id=''11111111-1111-1111-1111-111111111111'' and usage_date=current_date');
reset role;
select is((select v from _cap where k='a_row'), '0/20/4/1', 'an account not charged today gets a row with count 0 and its cost');

-- ─────────────────────────────────────────────────────────────────────────────
--  3. WHO MAY CALL IT
-- ─────────────────────────────────────────────────────────────────────────────
select ok(    has_function_privilege('service_role',  'public.record_ai_usage(uuid, text, integer, integer, bigint, bigint, bigint, bigint)', 'execute'), 'service_role may record');
select ok(not has_function_privilege('authenticated', 'public.record_ai_usage(uuid, text, integer, integer, bigint, bigint, bigint, bigint)', 'execute'), 'authenticated may not');
select ok(not has_function_privilege('anon',          'public.record_ai_usage(uuid, text, integer, integer, bigint, bigint, bigint, bigint)', 'execute'), 'anon may not');
select ok(not has_table_privilege('authenticated', 'public.ai_usage', 'update'), 'the owner still cannot write ai_usage');

select * from finish();
rollback;
