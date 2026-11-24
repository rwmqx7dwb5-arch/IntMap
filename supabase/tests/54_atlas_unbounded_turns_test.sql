-- ============================================================================
--  pgTAP · 54 — atlas-unbounded-turns: a NULL count never refuses on count (a number still does), a turn's key
--  expires after it goes IDLE (active_at), and the account's day fence refuses with scope 'day' and settles on both rows.
-- ============================================================================
begin;
select no_plan();

-- run as the test owner (the RPCs are SECURITY DEFINER; the owner reads the ledgers to measure them).
-- user C (33…) is the account tests 48 and 49 use; nothing here is left behind (rollback)

-- ── 1. the doors are the server's ───────────────────────────────────────────
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('consume_ai_turn', 'consume_ai_child_turn', 'reserve_ai_spend', 'settle_ai_spend', 'sweep_ai_turns')
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
  0, 'unbounded-turns: anon and authenticated cannot execute the turn or spend doors');
select ok(not has_table_privilege('authenticated', 'public.ai_spend_day', 'select'),
  'unbounded-turns: a reader cannot read the day spend ledger directly');
select ok((select relrowsecurity from pg_class where oid = 'public.ai_spend_day'::regclass), 'unbounded-turns: RLS is on for ai_spend_day');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'reserve_ai_spend'), 1,
  'unbounded-turns: one reserve_ai_spend (the five-argument one is gone, its calls reach the six-argument one)');
select is((select count(*)::int from public.account_data_catalog where tbl = 'ai_spend_day'), 1,
  'unbounded-turns: the account data inventory states ai_spend_day');

-- ── 2. NULL max calls: no count ─────────────────────────────────────────────
select ok((select allowed from public.consume_ai_turn('33333333-3333-3333-3333-333333333333',10,'u-free',null,900)), 'unbounded-turns: the turn opens with no count');
create temp table _u as select count as used from public.ai_usage
 where user_id='33333333-3333-3333-3333-333333333333' and usage_date=current_date;
do $$ begin
  for i in 2..40 loop perform public.consume_ai_turn('33333333-3333-3333-3333-333333333333',10,'u-free',null,900); end loop;
end $$;
select is((select calls from public.consume_ai_turn('33333333-3333-3333-3333-333333333333',10,'u-free',null,900)), 41,
  'unbounded-turns: the 41st call of a NULL-count turn is counted…');
select ok((select allowed from public.consume_ai_turn('33333333-3333-3333-3333-333333333333',10,'u-free',null,900)),
  'unbounded-turns: …and the 42nd is still allowed');
select is((select count from public.ai_usage where user_id='33333333-3333-3333-3333-333333333333' and usage_date=current_date),
  (select used from _u), 'unbounded-turns: the continuations charged nothing');

-- ── 3. a number still refuses ───────────────────────────────────────────────
select ok((select allowed from public.consume_ai_turn('33333333-3333-3333-3333-333333333333',10,'u-num',2,900)), 'unbounded-turns: numeric — call 1 of 2');
select ok((select allowed from public.consume_ai_turn('33333333-3333-3333-3333-333333333333',10,'u-num',2,900)), 'unbounded-turns: numeric — call 2 of 2');
select is((select reason from public.consume_ai_turn('33333333-3333-3333-3333-333333333333',10,'u-num',2,900)), 'turn_calls',
  'unbounded-turns: numeric — call 3 of a two-call turn is refused');

-- children: NULL → no count, a number → the old refusal
do $$ begin
  for i in 1..5 loop perform public.consume_ai_child_turn('33333333-3333-3333-3333-333333333333','u-free','u-free-c'||i,null,null,900); end loop;
end $$;
select is((select count(*)::int from public.ai_turns where user_id='33333333-3333-3333-3333-333333333333' and parent_turn_key='u-free'), 5,
  'unbounded-turns: a NULL children count opened five workers');
do $$ begin
  for i in 1..30 loop perform public.consume_ai_child_turn('33333333-3333-3333-3333-333333333333','u-free','u-free-c1',null,null,900); end loop;
end $$;
select ok((select allowed from public.consume_ai_child_turn('33333333-3333-3333-3333-333333333333','u-free','u-free-c1',null,null,900)),
  'unbounded-turns: a worker with a NULL call count is still allowed after 30 calls');
select is((select reason from public.consume_ai_child_turn('33333333-3333-3333-3333-333333333333','u-free','u-free-c9',5,null,900)), 'delegation_children',
  'unbounded-turns: a numeric children count still refuses the sixth');

-- ── 4. active_at slides the TTL ─────────────────────────────────────────────
-- a turn whose FIRST call is long past but whose LAST call is recent is alive: the next call is a continuation, not a new charge
update public.ai_turns set started_at = now() - interval '2 hours', active_at = now() - interval '60 seconds'
 where user_id='33333333-3333-3333-3333-333333333333' and turn_key='u-free';
update _u set used = (select count from public.ai_usage where user_id='33333333-3333-3333-3333-333333333333' and usage_date=current_date);
select is((select charged from public.consume_ai_turn('33333333-3333-3333-3333-333333333333',10,'u-free',null,900)), false,
  'unbounded-turns: a working turn older than the TTL is not re-charged');
select ok((select active_at from public.ai_turns where user_id='33333333-3333-3333-3333-333333333333' and turn_key='u-free') > now() - interval '5 seconds',
  'unbounded-turns: the allowed call refreshed active_at');
-- a worker's call keeps its parent alive
update public.ai_turns set active_at = now() - interval '10 minutes'
 where user_id='33333333-3333-3333-3333-333333333333' and turn_key='u-free';
select ok((select allowed from public.consume_ai_child_turn('33333333-3333-3333-3333-333333333333','u-free','u-free-c2',null,null,900)), 'unbounded-turns: a worker of a live parent is allowed');
select ok((select active_at from public.ai_turns where user_id='33333333-3333-3333-3333-333333333333' and turn_key='u-free') > now() - interval '5 seconds',
  'unbounded-turns: …and its call refreshed the parent''s active_at');
-- IDLE past the TTL: the key expires and opens a new, charged turn; its workers see no live parent
update public.ai_turns set active_at = now() - interval '20 minutes'
 where user_id='33333333-3333-3333-3333-333333333333' and turn_key='u-free';
select is((select reason from public.consume_ai_child_turn('33333333-3333-3333-3333-333333333333','u-free','u-free-c3',null,null,900)), 'delegation_parent',
  'unbounded-turns: an idle parent is not live');
select is((select charged from public.consume_ai_turn('33333333-3333-3333-3333-333333333333',10,'u-free',null,900)), true,
  'unbounded-turns: an idle key opens a new, charged turn');

-- ── 5. the day fence ────────────────────────────────────────────────────────
delete from public.ai_spend_day where user_id='33333333-3333-3333-3333-333333333333';
select ok((select allowed from public.reserve_ai_spend('33333333-3333-3333-3333-333333333333','u-day-1',2000000,3000000,900,5000000)),
  'unbounded-turns: $2 of a $3 family / $5 day reserves');
select is((select reserved_micros from public.ai_spend_day where user_id='33333333-3333-3333-3333-333333333333' and usage_date=current_date), 2000000::bigint,
  'unbounded-turns: the reservation is on the day row too');
select ok((select allowed from public.reserve_ai_spend('33333333-3333-3333-3333-333333333333','u-day-2',2500000,3000000,900,5000000)),
  'unbounded-turns: a second family reserves $2.50 — $4.50 of the day');
select is((select scope from public.reserve_ai_spend('33333333-3333-3333-3333-333333333333','u-day-3',1000000,3000000,900,5000000)), 'day',
  'unbounded-turns: a third family''s $1 would pass the $5 day → refused with scope day');
select is((select scope from public.reserve_ai_spend('33333333-3333-3333-3333-333333333333','u-day-1',1500000,3000000,900,5000000)), 'turn',
  'unbounded-turns: the family cap still answers first, with scope turn');
select ok((select allowed from public.reserve_ai_spend('33333333-3333-3333-3333-333333333333','u-day-3',1000000,3000000,900,null)),
  'unbounded-turns: a NULL day cap is no day fence');
select ok((select allowed from public.reserve_ai_spend('33333333-3333-3333-3333-333333333333','u-day-4',100000,3000000,900)),
  'unbounded-turns: a five-argument call still reserves (no day fence)');

-- settle moves reservation → spent on both rows
select ok((select public.settle_ai_spend('33333333-3333-3333-3333-333333333333','u-day-1',2000000,400000)), 'unbounded-turns: the $2 reservation settles at $0.40');
select is((select reserved_micros from public.ai_turn_spend where user_id='33333333-3333-3333-3333-333333333333' and root_key='u-day-1'), 0::bigint,
  'unbounded-turns: nothing is left reserved on the family');
select is((select spent_micros from public.ai_turn_spend where user_id='33333333-3333-3333-3333-333333333333' and root_key='u-day-1'), 400000::bigint,
  'unbounded-turns: the family''s spend is what was billed');
select is((select reserved_micros from public.ai_spend_day where user_id='33333333-3333-3333-3333-333333333333' and usage_date=current_date),
  2500000::bigint + 1000000 + 100000, 'unbounded-turns: the day''s reservation lost the settled $2 and keeps the rest');
select is((select spent_micros from public.ai_spend_day where user_id='33333333-3333-3333-3333-333333333333' and usage_date=current_date), 400000::bigint,
  'unbounded-turns: the day''s spend is what was billed');
-- after settling, the day has room again: 0.4 spent + 3.6 reserved + 1 = 5.0, not past
select ok((select allowed from public.reserve_ai_spend('33333333-3333-3333-3333-333333333333','u-day-5',1000000,3000000,900,5000000)),
  'unbounded-turns: after settling, $1 fits the day again');

-- an idle family row expires by active_at, not started_at
update public.ai_turn_spend set started_at = now() - interval '2 hours', active_at = now() - interval '60 seconds'
 where user_id='33333333-3333-3333-3333-333333333333' and root_key='u-day-1';
select ok((select allowed from public.reserve_ai_spend('33333333-3333-3333-3333-333333333333','u-day-1',100000,3000000,900,null)), 'unbounded-turns: a working family reserves again');
select is((select spent_micros from public.ai_turn_spend where user_id='33333333-3333-3333-3333-333333333333' and root_key='u-day-1'), 400000::bigint,
  'unbounded-turns: …and kept its spend (it was not expired by its age)');

select * from finish();
rollback;
