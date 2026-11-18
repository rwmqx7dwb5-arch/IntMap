-- ============================================================================
--  pgTAP · 49 — atlas-delegation: a worker's turn lives under a live reader turn, never charges,
--  is bounded by the caller's child and call allowances; a turn family's spend is reserved and settled.
-- ============================================================================
begin;
select no_plan();

-- run as the test owner: the RPCs are SECURITY DEFINER, and the owner can read the ledgers to measure them
-- user C (33…) is the account test 48 uses; nothing here is left behind (rollback)

-- ── 1. the doors are the server's ───────────────────────────────────────────
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('consume_ai_child_turn', 'reserve_ai_spend', 'settle_ai_spend')
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
  0, 'atlas-delegation: anon and authenticated cannot execute the delegation or spend doors');
select ok(not has_table_privilege('authenticated', 'public.ai_turn_spend', 'select'),
  'atlas-delegation: a reader cannot read the spend ledger directly');

-- ── 2. a child needs a live reader turn of the same account ─────────────────
select is((select reason from public.consume_ai_child_turn('33333333-3333-3333-3333-333333333333','d-parent','d-c1',2,3,900)),
  'delegation_parent', 'atlas-delegation: no parent turn → refused');

select ok((select allowed from public.consume_ai_turn('33333333-3333-3333-3333-333333333333',10,'d-parent',12,900)),
  'atlas-delegation: the reader turn opens (and charges once)');
create temp table _u as select count as used from public.ai_usage
 where user_id='33333333-3333-3333-3333-333333333333' and usage_date=current_date;

select ok((select allowed from public.consume_ai_child_turn('33333333-3333-3333-3333-333333333333','d-parent','d-c1',2,3,900)),
  'atlas-delegation: the first child opens');
select is((select charged from public.ai_turns where user_id='33333333-3333-3333-3333-333333333333' and turn_key='d-c1'),
  false, 'atlas-delegation: a child row never charges');
select is((select parent_turn_key from public.ai_turns where user_id='33333333-3333-3333-3333-333333333333' and turn_key='d-c1'),
  'd-parent', 'atlas-delegation: the child names its parent');
select is((select count from public.ai_usage where user_id='33333333-3333-3333-3333-333333333333' and usage_date=current_date),
  (select used from _u), 'atlas-delegation: opening a child moved nothing on the reader''s day');

-- ── 3. the allowances are the caller's ──────────────────────────────────────
select ok((select allowed from public.consume_ai_child_turn('33333333-3333-3333-3333-333333333333','d-parent','d-c1',2,3,900)), 'atlas-delegation: child call 2 of 3');
select ok((select allowed from public.consume_ai_child_turn('33333333-3333-3333-3333-333333333333','d-parent','d-c1',2,3,900)), 'atlas-delegation: child call 3 of 3');
select is((select reason from public.consume_ai_child_turn('33333333-3333-3333-3333-333333333333','d-parent','d-c1',2,3,900)),
  'turn_calls', 'atlas-delegation: a fourth call of a three-call child is refused');
select ok((select allowed from public.consume_ai_child_turn('33333333-3333-3333-3333-333333333333','d-parent','d-c2',2,3,900)), 'atlas-delegation: the second child opens');
select is((select reason from public.consume_ai_child_turn('33333333-3333-3333-3333-333333333333','d-parent','d-c3',2,3,900)),
  'delegation_children', 'atlas-delegation: a third child of a two-child parent is refused');

-- ── 4. keys cannot be borrowed ──────────────────────────────────────────────
select is((select reason from public.consume_ai_child_turn('33333333-3333-3333-3333-333333333333','d-parent','d-parent',2,3,900)),
  'delegation_key', 'atlas-delegation: a child cannot carry its parent''s key');
select ok((select allowed from public.consume_ai_turn('33333333-3333-3333-3333-333333333333',10,'d-other',12,900)), 'atlas-delegation: another reader turn');
-- that reader turn charged once; the day is measured from here on
update _u set used = (select count from public.ai_usage where user_id='33333333-3333-3333-3333-333333333333' and usage_date=current_date);
select is((select reason from public.consume_ai_child_turn('33333333-3333-3333-3333-333333333333','d-parent','d-other',5,3,900)),
  'delegation_key', 'atlas-delegation: a reader''s own turn key cannot be taken over as a child');
select is((select reason from public.consume_ai_child_turn('33333333-3333-3333-3333-333333333333','d-c1','d-grand',2,3,900)),
  'delegation_parent', 'atlas-delegation: a child cannot open children');

-- ── 5. a child closes through the ordinary doors and gives nothing back ─────
select is((select public.refund_ai_turn('33333333-3333-3333-3333-333333333333','d-c2')), 'refunded', 'atlas-delegation: a failed child releases its row');
select is((select count from public.ai_usage where user_id='33333333-3333-3333-3333-333333333333' and usage_date=current_date),
  (select used from _u), 'atlas-delegation: …and the reader''s day is untouched by it');

-- ── 6. reserve before, settle after ─────────────────────────────────────────
select ok((select allowed from public.reserve_ai_spend('33333333-3333-3333-3333-333333333333','d-parent',2000000,3000000,900)), 'atlas-delegation: $2 of a $3 cap reserves');
select ok(not (select allowed from public.reserve_ai_spend('33333333-3333-3333-3333-333333333333','d-parent',1500000,3000000,900)), 'atlas-delegation: another $1.50 would pass the cap → refused');
select ok((select public.settle_ai_spend('33333333-3333-3333-3333-333333333333','d-parent',2000000,400000)), 'atlas-delegation: the $2 reservation settles at the $0.40 billed');
select is((select reserved_micros from public.ai_turn_spend where user_id='33333333-3333-3333-3333-333333333333' and root_key='d-parent'), 0::bigint, 'atlas-delegation: nothing is left reserved');
select is((select spent_micros from public.ai_turn_spend where user_id='33333333-3333-3333-3333-333333333333' and root_key='d-parent'), 400000::bigint, 'atlas-delegation: the spend is what was billed');
select ok((select allowed from public.reserve_ai_spend('33333333-3333-3333-3333-333333333333','d-parent',1500000,3000000,900)), 'atlas-delegation: after settling, the same $1.50 fits');

select * from finish();
rollback;
