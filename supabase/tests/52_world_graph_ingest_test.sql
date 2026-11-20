-- ============================================================================
--  pgTAP · 52 — world graph INGEST: a feed keeps its slice current, retires what the upstream withdrew, refuses a thin
--  answer, and says how fresh it is.   supabase/migrations/20261120120000_world_graph_ingest.sql
--    ① access: only service_role runs the ingest functions; every reader reads the runs and the freshness;
--    ② apply: a first run adds; the same run again changes nothing (all «same»); a revised figure updates in place; an edge to a
--       node that is not held is skipped and counted; a node another feed owns is left as it is;
--    ③ finish: what the upstream no longer states is retired (edges, claims, then nodes nothing else ties to);
--       a run that would retire most of the slice is `refused` and deletes nothing; a second run cannot start while one runs;
--    ④ world_graph_freshness: the last ok run per feed and the status of the latest attempt;
--    ⑤ world_graph_find: a label a source gave (`facts.names`) finds the object as exactly as `name` does.
--  Fixtures are this file's own (feed `pgtap_feed`, refs `pgtap-i:…`). One transaction, rolled back.
-- ============================================================================
begin;
select no_plan();
do $$ begin execute format('grant anon, authenticated, service_role to %I', current_user); exception when others then null; end $$;

create function pg_temp._as(p_role text, p_sql text) returns text language plpgsql as $$
declare r text;
begin
  execute format('set local role %I', p_role);
  begin execute p_sql; r := 'OK';
  exception when insufficient_privilege then r := 'DENIED'; when others then r := 'ERR:' || sqlstate; end;
  reset role; return r;
end $$;

-- ── ① access ─────────────────────────────────────────────────────────────────
select has_table('public', 'world_graph_ingest_runs', 'world_graph_ingest_runs exists');
select ok((select relrowsecurity from pg_class where oid = 'public.world_graph_ingest_runs'::regclass), 'RLS is on for the runs');
select is(pg_temp._as('anon', $$ select count(*) from public.world_graph_ingest_runs $$), 'OK', 'anon reads the runs (the freshness is public)');
select is(pg_temp._as('anon', $$ select public.world_graph_freshness() $$), 'OK', 'anon reads the freshness');
select is(pg_temp._as('anon', $$ select public.world_graph_ingest_begin('pgtap_x') $$), 'DENIED', 'anon cannot begin a run');
select is(pg_temp._as('authenticated', $$ select public.world_graph_ingest_apply(1, '[]', '[]', '[]') $$), 'DENIED', 'a signed-in reader cannot apply');
select is(pg_temp._as('authenticated', $$ insert into public.world_graph_ingest_runs (feed) values ('pgtap_x') $$), 'DENIED', 'nor write a run directly');
select is(pg_temp._as('service_role', $$ select public.world_graph_ingest_begin('pgtap_free') $$), 'OK', 'service_role can');

-- ── ② apply ──────────────────────────────────────────────────────────────────
create temp table _r (k text primary key, v jsonb);
insert into _r values ('run1', to_jsonb(public.world_graph_ingest_begin('pgtap_feed')));
-- a node another feed (here: a seed, feed NULL) owns
insert into public.world_graph_nodes (ref, type, kind, name, ids) values ('company:pgtap-i-seed', 'company', 'company', 'Seeded Co', '{"wikidata":"Q1"}');

create function pg_temp._payload(p_variant int) returns table (n jsonb, e jsonb, c jsonb) language sql as $$
  select
    jsonb_build_array(
      jsonb_build_object('ref','facility:pgtap-i-a','type','facility','kind','port','name','Alpha Port','country','XXA','lng',4.0,'lat',52.0,'provenance','feed_coordinate','ids',jsonb_build_object('unlocode','XXALP'),'facts',jsonb_build_object('names',jsonb_build_array('Alpha Port','アルファ港')),'sources','[]'::jsonb),
      jsonb_build_object('ref','facility:pgtap-i-b','type','facility','kind','port','name','Beta Port','ids','{}'::jsonb),
      jsonb_build_object('ref','company:pgtap-i-seed','type','company','kind','company','name','CHANGED BY THE FEED?','ids','{}'::jsonb))
    || case when p_variant = 1 then jsonb_build_array(jsonb_build_object('ref','facility:pgtap-i-c','type','facility','kind','port','name','Gamma Port','ids','{}'::jsonb)) else '[]'::jsonb end,
    jsonb_build_array(
      jsonb_build_object('from_ref','facility:pgtap-i-a','rel','operated_by','to_ref','company:pgtap-i-seed','confidence','high','source','fixture'),
      jsonb_build_object('from_ref','facility:pgtap-i-a','rel','connected_to','to_ref','facility:pgtap-i-nobody','confidence','high','source','fixture'))
    || case when p_variant = 1 then jsonb_build_array(jsonb_build_object('from_ref','facility:pgtap-i-c','rel','part_of','to_ref','facility:pgtap-i-a','confidence','high','source','fixture')) else '[]'::jsonb end,
    jsonb_build_array(
      jsonb_build_object('ref','facility:pgtap-i-a','key','cargo_handled','value',100.0,'unit','thousand tonnes','from_ms',1577836800000,'to_ms',1609372800000,'source','Eurostat fixture','retrieved','2026-11-20'),
      jsonb_build_object('ref','facility:pgtap-i-a','key','cargo_handled','value',110.0,'unit','thousand tonnes','from_ms',1609459200000,'to_ms',1640908800000,'source','Eurostat fixture','retrieved','2026-11-20'));
$$;

create temp table _a as select public.world_graph_ingest_apply((select (v #>> '{}')::bigint from _r where k = 'run1'), p.n, p.e, p.c) as r from pg_temp._payload(1) p;
select is((select r #>> '{nodes,added}' from _a), '3', 'first apply: 3 nodes added (the seeded company is not one of them)');
select is((select r #>> '{edges,added}' from _a), '2', '… 2 edges added (operated_by, part_of)');
select is((select r #>> '{edges,skipped}' from _a), '1', '… and the edge to a node nobody holds is skipped, counted, not invented');
select is((select r #>> '{claims,added}' from _a), '2', '… 2 claims added');
select is((select name from public.world_graph_nodes where ref = 'company:pgtap-i-seed'), 'Seeded Co', 'a node another feed owns is left as it is');
select is((select count(*)::int from public.world_graph_nodes where feed = 'pgtap_feed'), 3, 'the feed owns the 3 nodes it wrote');
select is((select (public.world_graph_ingest_finish((v #>> '{}')::bigint, '{"eurostat":{"updated":"2026-11-11"}}', '{}') ->> 'status') from _r where k = 'run1'), 'ok', 'the first run ends ok');

insert into _r values ('run2', to_jsonb(public.world_graph_ingest_begin('pgtap_feed')));
select throws_ok($$ select public.world_graph_ingest_begin('pgtap_feed') $$, 'P0001', null, 'a second run of the feed cannot begin while one is running');
drop table _a;
create temp table _a as select public.world_graph_ingest_apply((select (v #>> '{}')::bigint from _r where k = 'run2'), p.n, p.e, p.c) as r from pg_temp._payload(1) p;
select is((select r #>> '{nodes,same}' from _a) || '/' || (select r #>> '{nodes,added}' from _a), '3/0', 'the same payload again: every node confirmed, none added');
select is((select r #>> '{claims,same}' from _a) || '/' || (select r #>> '{claims,added}' from _a), '2/0', '… and every claim');
select is((select (public.world_graph_ingest_finish((v #>> '{}')::bigint, '{}', '{}') #>> '{retired,claims}') from _r where k = 'run2'), '0', 'nothing is retired when nothing was withdrawn');

-- a revised figure updates the row in place
insert into _r values ('run3', to_jsonb(public.world_graph_ingest_begin('pgtap_feed')));
select public.world_graph_ingest_apply((select (v #>> '{}')::bigint from _r where k = 'run3'),
  (select n from pg_temp._payload(1)), (select e from pg_temp._payload(1)),
  (select jsonb_build_array(jsonb_set(c, '{0,value}', '105.0') -> 0) from pg_temp._payload(1)));
select is((select value from public.world_graph_claims where ref = 'facility:pgtap-i-a' and from_ms = 1577836800000), 105::double precision, 'a revised figure is the same row with the new value');
select is((select count(*)::int from public.world_graph_claims where ref = 'facility:pgtap-i-a' and key = 'cargo_handled'), 2, '… not a second row beside it');
-- run 3 did not restate the second year → that claim is retired at finish
select is((select (public.world_graph_ingest_finish((v #>> '{}')::bigint, '{}', '{}', 0.9) #>> '{retired,claims}') from _r where k = 'run3'), '1', 'a claim the upstream no longer states is retired');

-- ── ③ retire nodes; refuse a thin answer ─────────────────────────────────────
insert into _r values ('run4', to_jsonb(public.world_graph_ingest_begin('pgtap_feed')));
select public.world_graph_ingest_apply((select (v #>> '{}')::bigint from _r where k = 'run4'), (select n from pg_temp._payload(0)), (select e from pg_temp._payload(0)), (select c from pg_temp._payload(0)));
select is((select (public.world_graph_ingest_finish((v #>> '{}')::bigint, '{}', '{}', 0.9) #>> '{retired,nodes}') from _r where k = 'run4'), '1', 'a node the upstream no longer states (Gamma) is retired once its tie is');
select ok(not exists (select 1 from public.world_graph_nodes where ref = 'facility:pgtap-i-c'), '… and is gone');

-- the guard needs ≥ 50 rows to speak: fill the feed, then answer thin
insert into public.world_graph_nodes (ref, type, kind, name, feed, feed_run) select 'facility:pgtap-i-bulk' || g, 'facility', 'port', 'Bulk ' || g, 'pgtap_feed', 1 from generate_series(1, 60) g;
insert into _r values ('run5', to_jsonb(public.world_graph_ingest_begin('pgtap_feed')));
select public.world_graph_ingest_apply((select (v #>> '{}')::bigint from _r where k = 'run5'), (select n from pg_temp._payload(0)), '[]', '[]');
select is((select public.world_graph_ingest_finish((v #>> '{}')::bigint, '{}', '{}') ->> 'status' from _r where k = 'run5'), 'refused', 'a run that would retire most of the slice is refused');
select is((select count(*)::int from public.world_graph_nodes where ref like 'facility:pgtap-i-bulk%'), 60, '… and deletes nothing');
select matches((select note from public.world_graph_ingest_runs where id = (select (v #>> '{}')::bigint from _r where k = 'run5')), 'not a withdrawal', '… and says why');

-- ── ④ freshness ──────────────────────────────────────────────────────────────
select is((select f ->> 'latestStatus' from jsonb_array_elements(public.world_graph_freshness()) f where f ->> 'feed' = 'pgtap_feed'), 'refused', 'freshness: the latest attempt is shown as refused…');
select ok((select (f ->> 'finishedAt') is not null from jsonb_array_elements(public.world_graph_freshness()) f where f ->> 'feed' = 'pgtap_feed'), '… beside the last run that ended ok');
insert into _r values ('run6', to_jsonb(public.world_graph_ingest_begin('pgtap_feed')));
select public.world_graph_ingest_fail((select (v #>> '{}')::bigint from _r where k = 'run6'), 'wikidata 504');
select is((select f ->> 'latestNote' from jsonb_array_elements(public.world_graph_freshness()) f where f ->> 'feed' = 'pgtap_feed'), 'wikidata 504', 'a failed run is recorded with its reason');

-- ── ⑤ find by a label ────────────────────────────────────────────────────────
select is((select ref from public.world_graph_find('アルファ港')), 'facility:pgtap-i-a', 'a label a source gave finds the object');
select is((select ref from public.world_graph_find('unlocode:XXALP')), 'facility:pgtap-i-a', 'and so does its UN/LOCODE');
select is((select count(*)::int from public.world_graph_find('アルファ')), 0, 'a fragment finds nothing (exact only)');

select * from finish();
rollback;
