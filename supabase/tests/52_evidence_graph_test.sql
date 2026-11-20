-- ============================================================================
--  pgTAP · 52 — evidence graph: the reader's lineage nodes on their account.
--    ① table, RLS, grants (anon nothing; authenticated the four row privileges; no truncate)
--    ② the owner upserts and reads their own nodes; a node under another account's id is refused
--    ③ another account reads none and changes none; anon sees nothing
--    ④ the row shape (payload.id / payload.kind equal the columns) and the account bound refuse
--    ⑤ the table has its catalogue sentence and its rows go with the account (ON DELETE CASCADE)
--  supabase/migrations/20261120120000_evidence_graph_nodes.sql. The client (pull / push / ack) is
--  tests/evidence-graph-checks.test.mjs.
-- ============================================================================
begin;
select no_plan();

do $$ begin execute format('grant anon, authenticated, service_role to %I', current_user); exception when others then null; end $$;

create table _cap (k text primary key, v text);
grant insert, select on _cap to anon, authenticated, service_role;
create function _sel(k text, q text) returns void language plpgsql as $$
declare c text; begin execute q into c; insert into _cap values (k, coalesce(c,'<null>'));
exception when insufficient_privilege then insert into _cap values (k,'DENIED');
        when others then insert into _cap values (k,'ERR:'||sqlstate||':'||sqlerrm); end; $$;
create function _run(k text, q text) returns void language plpgsql as $$
begin execute q; insert into _cap values (k,'OK');
exception when insufficient_privilege then insert into _cap values (k,'DENIED');
        when others then insert into _cap values (k,'ERR:'||sqlstate||':'||sqlerrm); end; $$;

select has_table('public', 'evidence_graph_nodes', 'evidence-graph: the table exists');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname = 'evidence_graph_nodes'), 'evidence-graph: RLS is on');
select ok(not has_table_privilege('anon', 'public.evidence_graph_nodes', 'select'), 'evidence-graph: anon cannot read');
select ok(not has_table_privilege('anon', 'public.evidence_graph_nodes', 'insert'), 'evidence-graph: anon cannot write');
select ok(has_table_privilege('authenticated', 'public.evidence_graph_nodes', 'insert'), 'evidence-graph: authenticated may write');
select ok(not has_table_privilege('authenticated', 'public.evidence_graph_nodes', 'truncate'), 'evidence-graph: authenticated cannot truncate');
select ok(not (select prosecdef from pg_proc where oid = 'public.evidence_graph_account_bound()'::regprocedure),
          'evidence-graph: the account bound runs as the invoker');
select is((select confdeltype from pg_constraint where conrelid = 'public.evidence_graph_nodes'::regclass
            and confrelid = 'auth.users'::regclass and contype = 'f'), 'c'::"char",
          'evidence-graph: user_id -> auth.users is ON DELETE CASCADE');
select is((select count(*)::int from public.account_data_catalog where tbl = 'evidence_graph_nodes'), 1,
          'evidence-graph: the table has its sentence in the account data catalogue');

-- the owner (A = 11…)
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _run('ins',  $q$insert into public.evidence_graph_nodes (user_id, id, kind, type, payload)
                       values ('11111111-1111-1111-1111-111111111111', 'src:dataset:rail', 'source', 'dataset', '{"id":"src:dataset:rail","kind":"source","versions":[{"version":"v1"}]}'::jsonb)$q$);
select _run('ups',  $q$insert into public.evidence_graph_nodes (user_id, id, kind, type, payload)
                       values ('11111111-1111-1111-1111-111111111111', 'src:dataset:rail', 'source', 'dataset', '{"id":"src:dataset:rail","kind":"source","versions":[{"version":"v1"},{"version":"v2"}]}'::jsonb)
                       on conflict (user_id, id) do update set payload = excluded.payload$q$);
select _sel('vers', $q$select jsonb_array_length(payload->'versions')::text from public.evidence_graph_nodes where id = 'src:dataset:rail'$q$);
select _run('spoof', $q$insert into public.evidence_graph_nodes (user_id, id, kind, type, payload)
                        values ('22222222-2222-2222-2222-222222222222', 'src:dataset:x', 'source', 'dataset', '{"id":"src:dataset:x","kind":"source"}'::jsonb)$q$);
select _run('mismatch', $q$insert into public.evidence_graph_nodes (user_id, id, kind, type, payload)
                        values ('11111111-1111-1111-1111-111111111111', 'src:dataset:y', 'source', 'dataset', '{"id":"src:dataset:other","kind":"source"}'::jsonb)$q$);
select _run('badkind', $q$insert into public.evidence_graph_nodes (user_id, id, kind, type, payload)
                        values ('11111111-1111-1111-1111-111111111111', 'src:dataset:z', 'note', 'dataset', '{"id":"src:dataset:z","kind":"note"}'::jsonb)$q$);
reset role;

-- another account (B = 22…) and anon
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select _sel('other', 'select count(*)::text from public.evidence_graph_nodes');
select _run('odel',  $q$delete from public.evidence_graph_nodes where id = 'src:dataset:rail'$q$);
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select _sel('anon', 'select count(*)::text from public.evidence_graph_nodes');
reset role;
select _sel('kept', 'select count(*)::text from public.evidence_graph_nodes');

-- the account bound: 210 rows of ~250 KB by B, as service_role (no RLS in the way) — past 50 MiB
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select _run('fill', $q$insert into public.evidence_graph_nodes (user_id, id, kind, type, payload)
                       select '22222222-2222-2222-2222-222222222222', 'src:dataset:fill-' || g, 'source', 'dataset',
                              jsonb_build_object('id', 'src:dataset:fill-' || g, 'kind', 'source', 'x', repeat('b', 250000))
                         from generate_series(1, 210) g$q$);
reset role;

select is((select v from _cap where k='ins'),      'OK',     'the owner writes a node');
select is((select v from _cap where k='ups'),      'OK',     'and upserts it with a second version');
select is((select v from _cap where k='vers'),     '2',      'the upsert replaced the payload (two versions)');
select is((select v from _cap where k='spoof'),    'DENIED', 'a node under another account is refused by WITH CHECK');
select like((select v from _cap where k='mismatch'), 'ERR:23514%', 'a payload whose id differs from the column is refused');
select like((select v from _cap where k='badkind'),  'ERR:23514%', 'a kind outside source / derived is refused');
select is((select v from _cap where k='other'),    '0',      'another account reads none of them');
select is((select v from _cap where k='odel'),     'OK',     'another account''s delete is a no-op under RLS');
select is((select v from _cap where k='anon'),     'DENIED', 'anon cannot read');
select is((select v from _cap where k='kept'),     '1',      'the node survived the other account''s delete');
select like((select v from _cap where k='fill'),   'ERR:P0001:evidence-graph-account-full%', 'the account bound refuses past 50 MiB by name');

select * from finish();
rollback;
