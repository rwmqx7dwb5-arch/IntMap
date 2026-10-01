-- ============================================================================
--  pgTAP · 16 — ai-usage-ledger-sign: a daily allowance counter never goes below zero.
--    Production held 25 negative ai_usage rows (min −99,999,938), written through Studio's table
--    editor as the owner role, which no grant binds. The invariant is now on the column.
--    ① over the CATALOGUE: every base table in public with a `count` column bounds it from below —
--      the next counter table is held to it without being named here;
--    ② the owner role itself (this session, as Studio is) cannot write a negative count, by UPDATE,
--      by INSERT, or by the editor's own json_populate_record statement — on either AI counter;
--    ③ the RPCs never trip it: a refund at 0 stays 0 without an error;
--    ④ a refund never gives back more than was charged: two refunds of one turn decrement once, a
--      settled turn refunds nothing, and a turn charged yesterday is refunded to yesterday's row.
-- ============================================================================
begin;
select no_plan();

do $$ begin execute format('grant anon, authenticated, service_role to %I', current_user); exception when others then null; end $$;

create table _cap (k text primary key, v text);
grant insert, select on _cap to anon, authenticated, service_role;
create function _run(k text, q text) returns void language plpgsql as $$
begin execute q; insert into _cap values (k,'OK');
exception when insufficient_privilege then insert into _cap values (k,'DENIED');
        when others then insert into _cap values (k,'ERR:'||sqlstate); end; $$;

-- ─────────────────────────────────────────────────────────────────────────────
--  1. THE CATALOGUE — every `count` column in public has a lower bound
-- ─────────────────────────────────────────────────────────────────────────────
select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), '{}')
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     join pg_attribute a on a.attrelid = c.oid and a.attname = 'count' and not a.attisdropped
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and not exists (select 1 from pg_constraint k
                       where k.conrelid = c.oid and k.contype = 'c'
                         and a.attnum = any (k.conkey)
                         and pg_get_constraintdef(k.oid) ~ '\(count >= [0-9]+\)')),
  '{}'::text[],
  'every base table in public with a count column carries a CHECK (count >= n)');

select ok(exists (select 1 from pg_constraint where conrelid = 'public.ai_usage'::regclass       and conname = 'ai_usage_count_nonnegative'),       'ai_usage has its constraint');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.ai_gloss_usage'::regclass and conname = 'ai_gloss_usage_count_nonnegative'), 'ai_gloss_usage has its constraint');

-- ─────────────────────────────────────────────────────────────────────────────
--  2. THE OWNER ROLE CANNOT WRITE A NEGATIVE COUNT (seed: A has 5 uses today, B has 2)
-- ─────────────────────────────────────────────────────────────────────────────
select _run('o_upd',    'update public.ai_usage set count = -1 where user_id = ''11111111-1111-1111-1111-111111111111'' and usage_date = current_date');
select _run('o_big',    'update public.ai_usage set count = -100000000 where user_id = ''11111111-1111-1111-1111-111111111111'' and usage_date = current_date');
select _run('o_studio', 'update public.ai_usage set (count) = (select count from json_populate_record(null::public.ai_usage, ''{"count":-99999938}''::json)) where user_id = ''11111111-1111-1111-1111-111111111111'' and usage_date = current_date');
select _run('o_ins',    'insert into public.ai_usage (user_id, usage_date, count) values (''11111111-1111-1111-1111-111111111111'', current_date - 3, -10)');
select _run('o_gloss',  'insert into public.ai_gloss_usage (user_id, usage_date, count) values (''11111111-1111-1111-1111-111111111111'', current_date - 3, -10)');
select _run('o_zero',   'update public.ai_usage set count = 0 where user_id = ''22222222-2222-2222-2222-222222222222'' and usage_date = current_date');

select is((select v from _cap where k='o_upd'),    'ERR:23514', 'the owner cannot set a count of -1');
select is((select v from _cap where k='o_big'),    'ERR:23514', 'nor the -100,000,000 that lifted a day''s limit');
select is((select v from _cap where k='o_studio'), 'ERR:23514', 'nor through the statement Studio''s table editor issues');
select is((select v from _cap where k='o_ins'),    'ERR:23514', 'nor insert a negative row');
select is((select v from _cap where k='o_gloss'),  'ERR:23514', 'the gloss lane''s counter is held to the same rule');
select is((select v from _cap where k='o_zero'),   'OK',        'zero is a count');
select is((select count from public.ai_usage where user_id = '11111111-1111-1111-1111-111111111111' and usage_date = current_date), 5, 'the refused writes changed nothing');

-- ─────────────────────────────────────────────────────────────────────────────
--  3 + 4. THE RPCs — as service_role, the only role that may call them
-- ─────────────────────────────────────────────────────────────────────────────
-- yesterday's turn of B, charged yesterday (the turn row carries the day it was charged on)
insert into public.ai_usage (user_id, usage_date, count)
values ('22222222-2222-2222-2222-222222222222', current_date - 1, 3)
on conflict (user_id, usage_date) do update set count = 3;
insert into public.ai_turns (user_id, turn_key, usage_date, calls, charged, started_at)
values ('22222222-2222-2222-2222-222222222222', 'turn-Y', current_date - 1, 1, true, now() - interval '1 minute');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select _run('z_ref',  'select public.refund_ai_usage(''22222222-2222-2222-2222-222222222222'')');            -- today's B is 0
select _run('z_turn', 'select public.refund_ai_turn(''22222222-2222-2222-2222-222222222222'', '''')');      -- the turn-less refund, same row
select _run('c1',     'select public.consume_ai_turn(''22222222-2222-2222-2222-222222222222'',10,''turn-S'',12,900)');   -- 0 → 1
select _run('rf1',    'select public.refund_ai_turn(''22222222-2222-2222-2222-222222222222'',''turn-S'')');            -- 1 → 0
select _run('rf2',    'select public.refund_ai_turn(''22222222-2222-2222-2222-222222222222'',''turn-S'')');            -- nothing left to give back
select _run('c2',     'select public.consume_ai_turn(''22222222-2222-2222-2222-222222222222'',10,''turn-T'',12,900)');   -- 0 → 1
select _run('st2',    'select public.settle_ai_turn(''22222222-2222-2222-2222-222222222222'',''turn-T'')');
select _run('rf3',    'select public.refund_ai_turn(''22222222-2222-2222-2222-222222222222'',''turn-T'')');            -- answered: refused
select _run('rfy',    'select public.refund_ai_turn(''22222222-2222-2222-2222-222222222222'',''turn-Y'')');            -- yesterday's row 3 → 2
select _run('g_ref',  'select public.refund_ai_gloss(''22222222-2222-2222-2222-222222222222'')');          -- no gloss row today: nothing
reset role;

select is((select v from _cap where k='z_ref'),  'OK', 'a refund at 0 does not trip the constraint');
select is((select v from _cap where k='z_turn'), 'OK', 'nor does the turn-less refund');
select is((select v from _cap where k='g_ref'),  'OK', 'nor the gloss refund');
select is((select v from _cap where k='rf2'),    'OK', 'a second refund of the same turn is not an error');
select is((select v from _cap where k='rf3'),    'OK', 'a refund of an answered turn is not an error');
-- read back as the table owner (service_role holds no table grant)
select is((select count from public.ai_usage where user_id = '22222222-2222-2222-2222-222222222222' and usage_date = current_date), 1,
  'today: two charges (turn-S, turn-T), one refund (turn-S once, turn-T refused) — never below 0 on the way');
select is((select count from public.ai_usage where user_id = '22222222-2222-2222-2222-222222222222' and usage_date = current_date - 1), 2,
  'a turn charged yesterday is refunded to yesterday''s row, not to today''s');
select is((select count(*)::int from public.ai_usage where count < 0), 0, 'no row of the ledger is negative');

select * from finish();
rollback;
