-- ============================================================================
--  pgTAP · 51 — world graph: the persistent index of real-world objects and their typed, dated ties.
--  supabase/migrations/20261119150000_world_graph.sql (+ the LNG seed 20261119150100_…)
--    ① the three tables: columns, RLS on, a stated tie / claim is ONE row however often it is ingested;
--    ② access: every reader reads, no client role writes, service_role does;
--    ③ world_graph_subgraph: both directions, the asked relations only, «as of» a date, depth, a cycle ends;
--    ④ world_graph_find: a ref, an external identifier, an exact name — and nothing fuzzy;
--    ⑤ world_graph_near: nearest first, inside the radius only;
--    ⑥ the seed: real terminals, an operator tie, a capacity claim.
--  Fixtures are this file's own (refs `pgtap:…`); the seed's rows are only counted, never edited. One transaction, rolled back.
--  The JS model of the page's side is tests/world-graph-persistent-checks.test.mjs — this file runs the SQL itself.
-- ============================================================================
begin;
select no_plan();

do $$ begin execute format('grant anon, authenticated, service_role to %I', current_user); exception when others then null; end $$;

-- ── ① the tables ──────────────────────────────────────────────────────────────
select has_table('public', 'world_graph_nodes', 'world_graph_nodes exists');
select has_table('public', 'world_graph_edges', 'world_graph_edges exists');
select has_table('public', 'world_graph_claims', 'world_graph_claims exists');
select columns_are('public', 'world_graph_nodes',
  array['ref', 'type', 'kind', 'name', 'country', 'lng', 'lat', 'provenance', 'ids', 'valid_from_ms', 'valid_to_ms', 'facts', 'sources', 'updated_at'], 'nodes: the columns');
select columns_are('public', 'world_graph_edges',
  array['id', 'from_ref', 'rel', 'to_ref', 'from_ms', 'to_ms', 'confidence', 'source', 'retrieved'], 'edges: the columns');
select columns_are('public', 'world_graph_claims',
  array['id', 'ref', 'key', 'value', 'unit', 'from_ms', 'to_ms', 'source', 'retrieved'], 'claims: the columns');
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.world_graph_nodes'::regclass, 'public.world_graph_edges'::regclass, 'public.world_graph_claims'::regclass)), 'RLS is on for all three');

insert into public.world_graph_nodes (ref, type, kind, name, country, lng, lat, provenance, ids, valid_from_ms) values
  ('facility:pgtap-t1', 'facility', 'terminal', 'Pgtap Terminal One', 'XXA', 4.00, 52.00, 'feed_coordinate', '{"wikidata":"Q900000001"}', null),
  ('facility:pgtap-t2', 'facility', 'terminal', 'Pgtap Terminal Two', 'XXA', 4.10, 52.05, 'feed_coordinate', '{"wikidata":"Q900000002"}', null),
  ('facility:pgtap-far', 'facility', 'terminal', 'Pgtap Far Terminal', 'XXB', 140.00, 35.00, 'feed_coordinate', '{}', null),
  ('company:pgtap-a', 'company', 'company', 'Pgtap Company A', null, null, null, null, '{"wikidata":"Q900000010"}', null),
  ('company:pgtap-b', 'company', 'company', 'Pgtap Company B', null, null, null, null, '{"wikidata":"Q900000011"}', null);
-- t1 was owned by A until 2020-12-31 and by B from 2021-01-01; B also owns t2 (no period stated); A operates t1
insert into public.world_graph_edges (from_ref, rel, to_ref, from_ms, to_ms, confidence, source) values
  ('facility:pgtap-t1', 'owned_by', 'company:pgtap-a', null, 1609372800000, 'high', 'fixture'),
  ('facility:pgtap-t1', 'owned_by', 'company:pgtap-b', 1609459200000, null, 'high', 'fixture'),
  ('facility:pgtap-t2', 'owned_by', 'company:pgtap-b', null, null, 'high', 'fixture'),
  ('facility:pgtap-t1', 'operated_by', 'company:pgtap-a', null, null, 'medium', 'fixture');
insert into public.world_graph_claims (ref, key, value, unit, from_ms, to_ms, source) values
  ('facility:pgtap-t1', 'throughput', 4.5, 'million tonnes per annum', 1577836800000, 1577836800000, 'fixture'),
  ('facility:pgtap-t1', 'throughput', 5.0, 'million tonnes per annum', 1609459200000, 1609459200000, 'fixture');

select throws_ok($$ insert into public.world_graph_edges (from_ref, rel, to_ref, from_ms, to_ms) values ('facility:pgtap-t1', 'owned_by', 'company:pgtap-a', null, 1609372800000) $$,
  '23505', null, 'the same stated tie (same relation, ends and period) is ONE row');
select throws_ok($$ insert into public.world_graph_edges (from_ref, rel, to_ref) values ('facility:pgtap-t1', 'owned_by', 'facility:pgtap-t1') $$, '23514', null, 'a tie to itself is refused');
select throws_ok($$ insert into public.world_graph_edges (from_ref, rel, to_ref, from_ms, to_ms) values ('facility:pgtap-t1', 'part_of', 'company:pgtap-a', 5, 1) $$, '23514', null, 'a period that ends before it begins is refused');
select throws_ok($$ insert into public.world_graph_edges (from_ref, rel, to_ref) values ('facility:pgtap-t1', 'owned_by', 'facility:nobody') $$, '23503', null, 'a tie to an object that is not held is refused');
select throws_ok($$ insert into public.world_graph_nodes (ref, type, lng) values ('place:pgtap-bad', 'place', 5) $$, '23514', null, 'a longitude without its latitude is refused');
select throws_ok($$ insert into public.world_graph_claims (ref, key, value, unit, from_ms, to_ms, source) values ('facility:pgtap-t1', 'throughput', 4.5, 'million tonnes per annum', 1577836800000, 1577836800000, 'fixture') $$,
  '23505', null, 'the same claim is ONE row; a second source''s figure is a second row');

-- ── ② access ─────────────────────────────────────────────────────────────────
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
select is(pg_temp._as('anon', $$ select count(*) from public.world_graph_nodes $$), 'OK', 'anon reads nodes');
select is(pg_temp._as('authenticated', $$ select count(*) from public.world_graph_edges $$), 'OK', 'a signed-in reader reads edges');
select is(pg_temp._as('anon', $$ insert into public.world_graph_nodes (ref, type) values ('place:pgtap-anon', 'place') $$), 'DENIED', 'anon cannot write a node');
select is(pg_temp._as('authenticated', $$ insert into public.world_graph_edges (from_ref, rel, to_ref) values ('facility:pgtap-t1', 'part_of', 'facility:pgtap-t2') $$), 'DENIED', 'a signed-in user cannot write a tie');
select is(pg_temp._as('authenticated', $$ delete from public.world_graph_claims $$), 'DENIED', 'nor delete a claim');
select is(pg_temp._as('service_role', $$ insert into public.world_graph_nodes (ref, type) values ('place:pgtap-svc', 'place') $$), 'OK', 'service_role writes');
select is(pg_temp._as('anon', $$ select public.world_graph_subgraph('facility:pgtap-t1') $$), 'OK', 'anon can call the walk');

-- ── ③ the walk ───────────────────────────────────────────────────────────────
select is((select jsonb_array_length(public.world_graph_subgraph('facility:pgtap-t1', array['owned_by'], 1, null)->'nodes')), 3, 'depth 1 over owned_by: the terminal and its two owners');
select is((select jsonb_array_length(public.world_graph_subgraph('facility:pgtap-t1', array['owned_by'], 1, 1577836800000)->'edges')), 1, 'as of 2020-01-01 only the tie that held then');
select is((select public.world_graph_subgraph('facility:pgtap-t1', array['owned_by'], 1, 1577836800000)->'edges'->0->>'to_ref'), 'company:pgtap-a', '… and it is company A');
select is((select public.world_graph_subgraph('facility:pgtap-t1', array['owned_by'], 1, 1640995200000)->'edges'->0->>'to_ref'), 'company:pgtap-b', 'as of 2022-01-01 it is company B');
select is((select jsonb_array_length(public.world_graph_subgraph('facility:pgtap-t1', array['operated_by'], 1, null)->'edges')), 1, 'only the asked relation is followed');
select is((select jsonb_array_length(public.world_graph_subgraph('company:pgtap-b', array['owned_by'], 1, null)->'nodes')), 3, 'from the company, backwards: B and the two terminals it owns');
select is((select jsonb_array_length(public.world_graph_subgraph('facility:pgtap-t1', array['owned_by'], 2, 1640995200000)->'nodes')), 3, 'depth 2 as of 2022: t1 → B → t2');
select is((select jsonb_array_length(public.world_graph_subgraph('facility:pgtap-t1', array['owned_by'], 1, 1640995200000)->'nodes')), 2, 'depth 1 as of 2022: t1 and B only');
select is((select jsonb_array_length(public.world_graph_subgraph('facility:pgtap-t1', null, 3, null)->'claims')), 2, 'both claims of the terminal come back, side by side');
select is((select jsonb_array_length(public.world_graph_subgraph('facility:pgtap-t1', null, 3, 1577836800000)->'claims')), 1, '… and as of 2020-01-01 only the 2020 figure');
select is((select public.world_graph_subgraph('facility:pgtap-nothing')), '{"nodes": [], "edges": [], "claims": []}'::jsonb, 'an object that is not held is an empty graph, not an error');
select lives_ok($$ select public.world_graph_subgraph('facility:pgtap-t1', null, 50, null) $$, 'a cycle (t1 ↔ A through two ties) ends: depth bounds the walk');

-- ── ④ find ───────────────────────────────────────────────────────────────────
select is((select ref from public.world_graph_find('facility:pgtap-t1')), 'facility:pgtap-t1', 'by ref');
select is((select ref from public.world_graph_find('wikidata:Q900000002')), 'facility:pgtap-t2', 'by an external identifier');
select is((select ref from public.world_graph_find('pgtap terminal one')), 'facility:pgtap-t1', 'by exact name, any case');
select is((select count(*)::int from public.world_graph_find('Pgtap Terminal')), 0, 'a fragment of a name finds nothing (no guessing)');
select is((select count(*)::int from public.world_graph_find('')), 0, 'an empty question finds nothing');

-- ── ⑤ near ───────────────────────────────────────────────────────────────────
select is((select node->>'ref' from public.world_graph_near(4.0, 52.0, 20) order by km limit 1), 'facility:pgtap-t1', 'the nearest to a point is the terminal there');
select ok((select count(*) from public.world_graph_near(4.0, 52.0, 20) where node->>'ref' like 'facility:pgtap-%') = 2, 'within 20 km: t1 and t2 (≈ 5.6 km), not the one on the other side of the world');
select ok(not exists (select 1 from public.world_graph_near(4.0, 52.0, 20) where node->>'ref' = 'facility:pgtap-far'), 'the far one is outside');

-- ── ⑥ the seed ───────────────────────────────────────────────────────────────
select ok((select count(*) from public.world_graph_nodes where type = 'facility' and kind = 'LNG terminal') >= 50, 'the seed holds dozens of real LNG terminals');
select ok((select count(*) from public.world_graph_edges where rel = 'operated_by' and source like 'Wikidata %') >= 10, '… with operators, each tie naming Wikidata as its source');
select ok((select count(*) from public.world_graph_claims where key = 'throughput' and unit = 'million tonnes per annum') >= 20, '… and stated capacity with its unit');
select ok((select count(*) from public.world_graph_nodes where type = 'company' and ids ? 'company') >= 1, '… and a company joined to IntMap''s own company atlas by id');

select * from finish();
rollback;
