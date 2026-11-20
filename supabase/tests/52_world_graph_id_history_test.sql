-- ============================================================================
--  pgTAP · 52 — world graph: the history of an external identifier (Overture GERS first).
--  supabase/migrations/20261120120000_world_graph_id_history.sql
--    ① the table: columns, RLS on, one statement per (object, scheme, id, release);
--    ② access: every reader reads, no client role writes, service_role does;
--    ③ world_graph_resolve_id: the present id first, then the history; an id re-issued to a second object
--       returns BOTH (never silently the newest); a name or a position never matches;
--    ④ deleting the object takes its history with it.
--  Fixtures are this file's own (refs `pgtap:…`). One transaction, rolled back.
-- ============================================================================
begin;
select no_plan();

do $$ begin execute format('grant anon, authenticated, service_role to %I', current_user); exception when others then null; end $$;

select has_table('public', 'world_graph_id_history', 'world_graph_id_history exists');
select columns_are('public', 'world_graph_id_history',
  array['id', 'ref', 'scheme', 'ext_id', 'release', 'status', 'source_records', 'observed'], 'the columns');
select ok((select relrowsecurity from pg_class where oid = 'public.world_graph_id_history'::regclass), 'RLS is on');

-- one object, whose GERS id changed between two releases (A in October, B in November); a second object re-issued A in November
insert into public.world_graph_nodes (ref, type, kind, name, lng, lat, provenance, ids) values
  ('facility:pgtap-gers-1', 'facility', 'plant', 'Pgtap Plant', 130.8, 32.8, 'source_coordinate', '{"gers":"B-new"}'),
  ('facility:pgtap-gers-2', 'facility', 'plant', 'Pgtap Other', 131.0, 33.0, 'source_coordinate', '{"gers":"A-old"}');
insert into public.world_graph_id_history (ref, scheme, ext_id, release, status, source_records, observed) values
  ('facility:pgtap-gers-1', 'gers', 'A-old', '2026-10-21.0', 'present', '[{"dataset":"meta","record_id":"123"}]', '2026-11-20'),
  ('facility:pgtap-gers-1', 'gers', 'A-old', '2026-11-18.0', 'removed', '[{"dataset":"meta","record_id":"123"}]', '2026-11-20'),
  ('facility:pgtap-gers-1', 'gers', 'B-new', '2026-11-18.0', 'present', '[{"dataset":"meta","record_id":"123"}]', '2026-11-20');

select throws_ok($$ insert into public.world_graph_id_history (ref, scheme, ext_id, release) values ('facility:pgtap-gers-1', 'gers', 'A-old', '2026-10-21.0') $$, '23505', null, 'one statement per (object, scheme, id, release)');
select throws_ok($$ insert into public.world_graph_id_history (ref, scheme, ext_id, release, status) values ('facility:pgtap-gers-1', 'gers', 'X', '2026-10-21.0', 'maybe') $$, '23514', null, 'a status outside present/removed is refused');
select throws_ok($$ insert into public.world_graph_id_history (ref, scheme, ext_id, release) values ('facility:nobody', 'gers', 'X', 'r') $$, '23503', null, 'a history of an object that is not held is refused');
select throws_ok($$ insert into public.world_graph_id_history (ref, scheme, ext_id, release, source_records) values ('facility:pgtap-gers-1', 'gers', 'X', 'r', '{}') $$, '23514', null, 'source_records is an array');

create function pg_temp._as(p_role text, p_sql text) returns text language plpgsql as $$
declare r text;
begin
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
    r := 'OK';
  exception when insufficient_privilege then r := 'DENIED';
            when others then r := 'ERR:' || sqlstate;
  end;
  reset role;
  return r;
end $$;
select is(pg_temp._as('anon', $$ select count(*) from public.world_graph_id_history $$), 'OK', 'anon reads the history');
select is(pg_temp._as('anon', $$ insert into public.world_graph_id_history (ref, scheme, ext_id, release) values ('facility:pgtap-gers-1', 'gers', 'Z', 'r') $$), 'DENIED', 'anon cannot write');
select is(pg_temp._as('authenticated', $$ delete from public.world_graph_id_history $$), 'DENIED', 'a signed-in user cannot delete');
select is(pg_temp._as('service_role', $$ insert into public.world_graph_id_history (ref, scheme, ext_id, release) values ('facility:pgtap-gers-1', 'gers', 'Z', 'r') $$), 'OK', 'service_role writes');
select is(pg_temp._as('anon', $$ select * from public.world_graph_resolve_id('gers', 'B-new') $$), 'OK', 'anon can resolve an id');

-- ③ resolve
select is((select ref from public.world_graph_resolve_id('gers', 'B-new') where is_current), 'facility:pgtap-gers-1', 'the present id finds its object');
select is((select count(*)::int from public.world_graph_resolve_id('gers', 'B-new')), 2, '… and the history row of the same id too (current first)');
select is((select ref from public.world_graph_resolve_id('gers', 'B-new') limit 1), 'facility:pgtap-gers-1', 'the present id is listed first');
select is((select count(*)::int from public.world_graph_resolve_id('gers', 'A-old') where ref = 'facility:pgtap-gers-1' and not is_current), 2, 'the OLD id still finds the object that carried it: two releases of history');
select is((select count(*)::int from public.world_graph_resolve_id('gers', 'A-old') where is_current and ref = 'facility:pgtap-gers-2'), 1, 'an id re-issued to a second object returns that object too');
select is((select count(distinct ref)::int from public.world_graph_resolve_id('gers', 'A-old')), 2, '… both objects, never silently the newest');
select is((select status from public.world_graph_resolve_id('gers', 'A-old') where release = '2026-11-18.0'), 'removed', 'a removal is stated as removed');
select is((select count(*)::int from public.world_graph_resolve_id('GERS', 'B-new')), 2, 'the scheme is case-insensitive');
select is((select count(*)::int from public.world_graph_resolve_id('gers', 'Pgtap Plant')), 0, 'a name never matches');
select is((select count(*)::int from public.world_graph_resolve_id('gers', '')), 0, 'an empty id finds nothing');
select is((select count(*)::int from public.world_graph_resolve_id('wikidata', 'B-new')), 0, 'another scheme finds nothing');

-- ③b adopt: where does a freshly read id belong?
select is(public.world_graph_adopt_id('facility:fresh', 'gers', 'B-new', '2026-12-16.0', '[]'), 'facility:pgtap-gers-1', 'an id the node already holds → that node');
select is(public.world_graph_adopt_id('facility:fresh', 'gers', 'C-new', '2026-12-16.0', '[{"dataset":"meta","record_id":"123"}]'), 'facility:pgtap-gers-1', 'a new id made from the SAME stated source record → the object that had it');
select is(public.world_graph_adopt_id('facility:fresh', 'gers', 'C-new', '2026-12-16.0', '[{"dataset":"meta","record_id":"1234"}]'), 'facility:fresh', 'a record id that only looks alike is another record → the caller''s own ref');
select is(public.world_graph_adopt_id('facility:fresh', 'gers', 'C-new', '2026-12-16.0', '[{"dataset":"other","record_id":"123"}]'), 'facility:fresh', 'the same record id in ANOTHER dataset is another record');
select is(public.world_graph_adopt_id('facility:fresh', 'gers', 'A-old', '2026-12-16.0', '[]'), 'facility:fresh', 'an id two objects have carried is not resolved by picking one');
select is(public.world_graph_adopt_id('facility:fresh', 'gers', 'C-new', '2026-12-16.0', '[]'), 'facility:fresh', 'nothing known, no record → the caller''s own ref');
select is(public.world_graph_adopt_id('facility:fresh', 'gers', 'C-new', '2026-12-16.0', '{"x":1}'), 'facility:fresh', 'a records value that is not an array is ignored');
insert into public.world_graph_id_history (ref, scheme, ext_id, release, source_records) values
  ('facility:pgtap-gers-1', 'gers', 'S1', '2026-10-21.0', '[{"dataset":"meta","record_id":"777"}]'),
  ('facility:pgtap-gers-2', 'gers', 'S2', '2026-10-21.0', '[{"dataset":"meta","record_id":"777"}]');
select is(public.world_graph_adopt_id('facility:fresh', 'gers', 'C-new', '2026-12-16.0', '[{"dataset":"meta","record_id":"777"}]'), 'facility:fresh', 'a record two objects both state is a conflict, never picked');
select is(pg_temp._as('anon', $$ select public.world_graph_adopt_id('a', 'gers', 'b', 'c', '[]') $$), 'DENIED', 'anon cannot call the ingest helper');
select is(pg_temp._as('service_role', $$ select public.world_graph_adopt_id('a', 'gers', 'b', 'c', '[]') $$), 'OK', 'service_role can');

-- ④ the object goes, its history goes
delete from public.world_graph_nodes where ref = 'facility:pgtap-gers-1';
select is((select count(*)::int from public.world_graph_id_history where ref = 'facility:pgtap-gers-1'), 0, 'deleting the object deletes its history');

select * from finish();
rollback;
