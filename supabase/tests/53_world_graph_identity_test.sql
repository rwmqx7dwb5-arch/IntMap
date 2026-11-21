-- ============================================================================
--  pgTAP · 53 — world graph: stable identity, how an id was tied to an object, and the change log.
--  supabase/migrations/20261120135000_world_graph_identity.sql
--    ① uid: assigned at insert, unique, and an UPDATE cannot change it;
--    ② id_history carries basis / evidence / confidence, constrained;
--    ③ the change log is filled by the triggers from any writer: a node added / changed / retired, a replaced
--       external id, a tie, a claim — and a write that touches only bookkeeping logs nothing;
--    ④ world_graph_resolve: a uid, a ref, a present id, an id the object held earlier (via says which) — never a name;
--    ⑤ world_graph_history and world_graph_changes_between answer from the log;
--    ⑥ access: every reader reads, no client role writes.
--  Fixtures are this file's own (refs `pgtap:…`). One transaction, rolled back.
-- ============================================================================
begin;
select no_plan();

do $$ begin execute format('grant anon, authenticated, service_role to %I', current_user); exception when others then null; end $$;

select has_column('public', 'world_graph_nodes', 'uid', 'nodes have a uid');
select has_table('public', 'world_graph_changes', 'world_graph_changes exists');
select ok((select relrowsecurity from pg_class where oid = 'public.world_graph_changes'::regclass), 'RLS is on for the change log');
select has_column('public', 'world_graph_id_history', 'basis', 'id_history says how an id was tied');
select has_view('public', 'world_graph_identifier_periods', 'the identifier periods view exists');

-- ① uid
insert into public.world_graph_nodes (ref, type, kind, name, lng, lat, provenance, ids, feed, feed_run) values
  ('facility:pgtap-id-1', 'facility', 'plant', 'Pgtap One', 10, 10, 'feed_coordinate', '{"wikidata":"Q1","gers":"g-old"}', 'pgtap_feed', 1),
  ('facility:pgtap-id-2', 'facility', 'plant', 'Pgtap Two', 11, 11, 'feed_coordinate', '{"wikidata":"Q2"}', 'pgtap_feed', 1);
select isnt((select uid from public.world_graph_nodes where ref = 'facility:pgtap-id-1'), null, 'a node gets a uid at insert');
select isnt((select uid from public.world_graph_nodes where ref = 'facility:pgtap-id-1'), (select uid from public.world_graph_nodes where ref = 'facility:pgtap-id-2'), 'two nodes, two uids');
create temp table pgtap_uid as select uid from public.world_graph_nodes where ref = 'facility:pgtap-id-1';
update public.world_graph_nodes set uid = gen_random_uuid(), name = 'Pgtap One renamed', ids = '{"wikidata":"Q1","gers":"g-new"}' where ref = 'facility:pgtap-id-1';
select is((select uid from public.world_graph_nodes where ref = 'facility:pgtap-id-1'), (select uid from pgtap_uid), 'an UPDATE cannot change the uid');

-- ② constrained basis / confidence
select throws_ok($$ insert into public.world_graph_id_history (ref, scheme, ext_id, release, basis) values ('facility:pgtap-id-1', 'gers', 'x', 'r', 'name_match') $$, '23514', null, 'basis is one of stated / source_record / attribute / seed — a name is not a basis');
select throws_ok($$ insert into public.world_graph_id_history (ref, scheme, ext_id, release, confidence) values ('facility:pgtap-id-1', 'gers', 'x', 'r', 'certain') $$, '23514', null, 'confidence is high / medium / low');
insert into public.world_graph_id_history (ref, scheme, ext_id, release, basis, evidence, confidence) values
  ('facility:pgtap-id-1', 'gers', 'g-old', '2026-10-21.0', 'stated', '{}', 'high'),
  ('facility:pgtap-id-1', 'gers', 'g-new', '2026-11-18.0', 'source_record', '{"record":"meta:123"}', 'high');

-- ③ the change log
select is((select count(*)::int from public.world_graph_changes where ref = 'facility:pgtap-id-1' and entity = 'node' and op = 'added'), 1, 'an insert is logged as added');
select is((select detail -> 'fields' -> 'name' ->> 'to' from public.world_graph_changes where ref = 'facility:pgtap-id-1' and op = 'changed' order by id desc limit 1), 'Pgtap One renamed', 'a rename is logged with its new value');
select is((select detail -> 'fields' -> 'name' ->> 'from' from public.world_graph_changes where ref = 'facility:pgtap-id-1' and op = 'changed' order by id desc limit 1), 'Pgtap One', '… and its old value');
select is((select detail -> 'fields' -> 'ids' -> 'to' ->> 'gers' from public.world_graph_changes where ref = 'facility:pgtap-id-1' and op = 'changed' order by id desc limit 1), 'g-new', 'a replaced external id is logged');
select is((select feed from public.world_graph_changes where ref = 'facility:pgtap-id-1' and op = 'added'), 'pgtap_feed', 'the log carries the feed of the writer');
create temp table pgtap_n as select count(*)::int n from public.world_graph_changes where ref = 'facility:pgtap-id-2';
update public.world_graph_nodes set feed_run = 2, updated_at = now() where ref = 'facility:pgtap-id-2';
select is((select count(*)::int from public.world_graph_changes where ref = 'facility:pgtap-id-2'), (select n from pgtap_n), 'touching only bookkeeping (feed_run, updated_at) logs nothing');
update public.world_graph_nodes set name = 'Pgtap Two' where ref = 'facility:pgtap-id-2';
select is((select count(*)::int from public.world_graph_changes where ref = 'facility:pgtap-id-2'), (select n from pgtap_n), 'writing an identical value logs nothing');

insert into public.world_graph_edges (from_ref, rel, to_ref, source, feed, feed_run) values ('facility:pgtap-id-1', 'located_in', 'facility:pgtap-id-2', 'pgtap', 'pgtap_feed', 1);
select is((select count(*)::int from public.world_graph_changes where entity = 'tie' and op = 'added' and ref = 'facility:pgtap-id-1' and detail ->> 'rel' = 'located_in'), 1, 'a tie added is logged');
insert into public.world_graph_claims (ref, key, value, unit, source, feed, feed_run) values ('facility:pgtap-id-1', 'net_capacity', 100, 'MW', 'pgtap', 'pgtap_feed', 1);
update public.world_graph_claims set value = 120 where ref = 'facility:pgtap-id-1' and key = 'net_capacity';
select is((select detail -> 'value' ->> 'to' from public.world_graph_changes where entity = 'claim' and op = 'changed' and ref = 'facility:pgtap-id-1'), '120', 'a revised figure is logged with before and after');
delete from public.world_graph_edges where from_ref = 'facility:pgtap-id-1' and rel = 'located_in';
select is((select count(*)::int from public.world_graph_changes where entity = 'tie' and op = 'retired' and ref = 'facility:pgtap-id-1'), 1, 'a tie that left is logged as retired');

-- ④ resolve
select is((select ref from public.world_graph_resolve((select uid::text from pgtap_uid))), 'facility:pgtap-id-1', 'a uid resolves');
select is((select via from public.world_graph_resolve((select uid::text from pgtap_uid))), 'uid', '… and says so');
select is((select via from public.world_graph_resolve('facility:pgtap-id-1')), 'ref', 'a ref resolves');
select is((select via from public.world_graph_resolve('gers:g-new')), 'present_id', 'a present external id resolves');
select is((select ref from public.world_graph_resolve('gers:g-old')), 'facility:pgtap-id-1', 'an id the object held earlier resolves to the object');
select is((select via from public.world_graph_resolve('gers:g-old')), 'past_id', '… and says it was a past id');
select is((select basis from public.world_graph_resolve('gers:g-old')), 'stated', '… with the basis it was tied on');
select is((select count(*)::int from public.world_graph_resolve('Pgtap One renamed')), 0, 'a name never resolves');
select is((select count(*)::int from public.world_graph_resolve('gers:nobody')), 0, 'an unknown id resolves to nothing');

-- ⑤ history and summaries
select is((select jsonb_array_length(public.world_graph_history('facility:pgtap-id-1') -> 'identifiers')), 2, 'the history lists both ids with their periods');
select is((select (public.world_graph_history('facility:pgtap-id-1') -> 'identifiers' -> 0 ->> 'is_current')::boolean), false, 'the replaced id is not current');
select ok((select jsonb_array_length(public.world_graph_history('facility:pgtap-id-1') -> 'changes')) >= 5, 'the history lists the changes');
select ok((select (public.world_graph_changes_between(now() - interval '1 hour', null, 'pgtap_feed') ->> 'node.id_replaced')::int) >= 1, 'a refresh summary counts replaced ids');

-- retire
delete from public.world_graph_nodes where ref = 'facility:pgtap-id-2';
select is((select count(*)::int from public.world_graph_changes where ref = 'facility:pgtap-id-2' and op = 'retired' and entity = 'node'), 1, 'a deleted node is logged as retired');

-- ⑥ access
create function pg_temp._as(p_role text, p_sql text) returns text language plpgsql as $$
declare r text;
begin
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
    r := 'ok';
  exception when others then r := sqlstate;
  end;
  reset role;
  return r;
end $$;
select is(pg_temp._as('anon', 'select count(*) from public.world_graph_changes'), 'ok', 'anyone reads the change log');
select is(pg_temp._as('anon', $$ insert into public.world_graph_changes (entity, op, ref) values ('node', 'added', 'x') $$), '42501', 'a client cannot write the log');
select is(pg_temp._as('authenticated', $$ update public.world_graph_nodes set uid = gen_random_uuid() $$), '42501', 'a client cannot write nodes');
select is(pg_temp._as('anon', $$ select * from public.world_graph_resolve('gers:g-old') $$), 'ok', 'anyone resolves an id');

select * from finish();
rollback;
