-- ============================================================================
--  pgTAP · 15 — atlas-stream-replay: a broken stream is received again, not computed again.
--    ① the table exists with RLS on;
--    ② claim → running → finish(done) → a second claim and a peek return the STORED answer;
--    ③ a failure is held as a fact (no body) and the next claim runs it again as attempt 2, after
--      'failed'; a run past its lease is 'abandoned' and claimed again; a superseded attempt cannot
--      write its result; a beat renews only the run that holds the claim;
--    ④ an expired answer is never returned and is swept;
--    ⑤ the owner reads their own rows and nobody else's; no client role may call the RPCs or write.
--  supabase/migrations/20261001090000_ai_turn_answers.sql. The JS model of the same four doors is
--  tests/atlas-stream-replay-checks.test.mjs — this file is the reader that runs the SQL itself.
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
--  1. THE TABLE
-- ─────────────────────────────────────────────────────────────────────────────
select has_table('public', 'ai_turn_answers', 'ai_turn_answers exists');
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname = 'ai_turn_answers'), 'RLS is on');

-- ─────────────────────────────────────────────────────────────────────────────
--  2–4. THE DOORS, as service_role (B = 22…)
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
-- ② a first run, a duplicate while it runs, its answer, and what a retry then finds
select _sel('c1',  'select outcome||''/''||attempts||''/''||after_state from public.claim_ai_answer(''22222222-2222-2222-2222-222222222222'',''turn-R'',''key-done-1'',900,30)');
select _sel('c2',  'select outcome||''/''||attempts from public.claim_ai_answer(''22222222-2222-2222-2222-222222222222'',''turn-R'',''key-done-1'',900,30)');
select _sel('p1',  'select state from public.peek_ai_answer(''22222222-2222-2222-2222-222222222222'',''turn-R'',''key-done-1'')');
select _sel('fw',  'select public.finish_ai_answer(''22222222-2222-2222-2222-222222222222'',''turn-R'',''key-done-1'',7,true,200,''{"text":"wrong"}''::jsonb)::text');
select _sel('f1',  'select public.finish_ai_answer(''22222222-2222-2222-2222-222222222222'',''turn-R'',''key-done-1'',1,true,200,''{"text":"東京"}''::jsonb)::text');
select _sel('p2',  'select state||''/''||status||''/''||(body->>''text'') from public.peek_ai_answer(''22222222-2222-2222-2222-222222222222'',''turn-R'',''key-done-1'')');
select _sel('c3',  'select outcome||''/''||status||''/''||(body->>''text'') from public.claim_ai_answer(''22222222-2222-2222-2222-222222222222'',''turn-R'',''key-done-1'',900,30)');
select _sel('f2',  'select public.finish_ai_answer(''22222222-2222-2222-2222-222222222222'',''turn-R'',''key-done-1'',1,true,200,''{"text":"again"}''::jsonb)::text');
-- ③ an observed failure
select _sel('cf1', 'select outcome from public.claim_ai_answer(''22222222-2222-2222-2222-222222222222'',''turn-R'',''key-fail-1'',900,30)');
select _sel('ff',  'select public.finish_ai_answer(''22222222-2222-2222-2222-222222222222'',''turn-R'',''key-fail-1'',1,false,503,''{"text":"never"}''::jsonb)::text');
select _sel('pf',  'select state||''/''||status||''/''||coalesce(body::text,''nobody'') from public.peek_ai_answer(''22222222-2222-2222-2222-222222222222'',''turn-R'',''key-fail-1'')');
select _sel('cf2', 'select outcome||''/''||attempts||''/''||after_state from public.claim_ai_answer(''22222222-2222-2222-2222-222222222222'',''turn-R'',''key-fail-1'',900,30)');
select _sel('bo',  'select public.beat_ai_answer(''22222222-2222-2222-2222-222222222222'',''turn-R'',''key-fail-1'',1,30)::text');
select _sel('bn',  'select public.beat_ai_answer(''22222222-2222-2222-2222-222222222222'',''turn-R'',''key-fail-1'',2,30)::text');
-- a run whose lease has run out (the lease is moved below, as the table owner)
select _sel('ca1', 'select outcome from public.claim_ai_answer(''22222222-2222-2222-2222-222222222222'',''turn-R'',''key-dead-1'',900,30)');
reset role;
update public.ai_turn_answers set lease_until = now() - interval '1 minute'
 where user_id = '22222222-2222-2222-2222-222222222222' and replay_key = 'key-dead-1';
set local role service_role;
select _sel('pa',  'select state from public.peek_ai_answer(''22222222-2222-2222-2222-222222222222'',''turn-R'',''key-dead-1'')');
select _sel('ca2', 'select outcome||''/''||attempts||''/''||after_state from public.claim_ai_answer(''22222222-2222-2222-2222-222222222222'',''turn-R'',''key-dead-1'',900,30)');
-- ④ an answer whose turn key has expired
select _sel('ce1', 'select outcome from public.claim_ai_answer(''22222222-2222-2222-2222-222222222222'',''turn-R'',''key-old-1'',900,30)');
select _run('fe',  'select public.finish_ai_answer(''22222222-2222-2222-2222-222222222222'',''turn-R'',''key-old-1'',1,true,200,''{"text":"old"}''::jsonb)');
reset role;
update public.ai_turn_answers set expires_at = now() - interval '1 second'
 where user_id = '22222222-2222-2222-2222-222222222222' and replay_key = 'key-old-1';
set local role service_role;
select _sel('pe',  'select count(*)::text from public.peek_ai_answer(''22222222-2222-2222-2222-222222222222'',''turn-R'',''key-old-1'')');
select _sel('sw',  'select (public.sweep_ai_turn_answers() >= 1)::text');
reset role;

select is((select v from _cap where k='c1'),  'claimed/1/',            'the first request claims its key');
select is((select v from _cap where k='c2'),  'running/1',             'a duplicate while it runs is told to wait — it does not run');
select is((select v from _cap where k='p1'),  'running',               'a peek sees it running');
select is((select v from _cap where k='fw'),  'false',                 'a run that does not hold the claim cannot write the answer');
select is((select v from _cap where k='f1'),  'true',                  'the run that holds the claim writes its answer');
select is((select v from _cap where k='p2'),  'done/200/東京',          'a retry finds the stored answer');
select is((select v from _cap where k='c3'),  'done/200/東京',          'a second claim receives the stored answer and must not run');
select is((select v from _cap where k='f2'),  'false',                 'a finished answer is not overwritten');
select is((select v from _cap where k='cf1'), 'claimed',               'a first run of the failing key');
select is((select v from _cap where k='ff'),  'true',                  'the failure is written');
select is((select v from _cap where k='pf'),  'failed/503/nobody',     'a failure is held as a fact, with no body to replay');
select is((select v from _cap where k='cf2'), 'claimed/2/failed',      'after an observed failure the next request runs it again, as attempt 2');
select is((select v from _cap where k='bo'),  'false',                 'the superseded attempt cannot renew the lease');
select is((select v from _cap where k='bn'),  'true',                  'the attempt that holds the claim renews it');
select is((select v from _cap where k='ca1'), 'claimed',               'a first run of the key whose isolate dies');
select is((select v from _cap where k='pa'),  'abandoned',             'a run past its lease is abandoned');
select is((select v from _cap where k='ca2'), 'claimed/2/abandoned',   'an abandoned run is claimed again, and says so');
select is((select v from _cap where k='ce1'), 'claimed',               'a first run of the key that will expire');
select is((select v from _cap where k='pe'),  '0',                     'an expired answer is never returned');
select is((select v from _cap where k='sw'),  'true',                  'the sweep deletes expired answers');

-- ─────────────────────────────────────────────────────────────────────────────
--  5. WHO MAY READ, WHO MAY CALL
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select _sel('own',   'select count(*)::text from public.ai_turn_answers');
select _sel('claim', 'select outcome from public.claim_ai_answer(''22222222-2222-2222-2222-222222222222'',''turn-X'',''key-x-0001'',900,30)');
select _sel('peek',  'select state from public.peek_ai_answer(''22222222-2222-2222-2222-222222222222'',''turn-R'',''key-done-1'')');
select _run('ins',   'insert into public.ai_turn_answers (user_id, turn_key, replay_key, lease_until, expires_at) values (''22222222-2222-2222-2222-222222222222'',''t'',''k-forged-1'',now(),now() + interval ''1 hour'')');
select _run('upd',   'update public.ai_turn_answers set body = ''{"text":"forged"}''::jsonb');
reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _sel('other', 'select count(*)::text from public.ai_turn_answers');
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select _sel('anon',  'select count(*)::text from public.ai_turn_answers');
reset role;

select is((select v from _cap where k='own'),   '3',      'the owner reads their own held answers (done, failed→running, abandoned→running)');
select is((select v from _cap where k='other'), '0',      'another account reads none of them');
select is((select v from _cap where k='anon'),  'DENIED', 'anon cannot read the table');
select is((select v from _cap where k='claim'), 'DENIED', 'authenticated cannot claim');
select is((select v from _cap where k='peek'),  'DENIED', 'authenticated cannot peek through the definer');
select is((select v from _cap where k='ins'),   'DENIED', 'authenticated cannot write a held answer');
select is((select v from _cap where k='upd'),   'DENIED', 'authenticated cannot rewrite a held answer');
select ok(not has_function_privilege('anon', 'public.sweep_ai_turn_answers()', 'execute'), 'anon cannot sweep');

select * from finish();
rollback;
