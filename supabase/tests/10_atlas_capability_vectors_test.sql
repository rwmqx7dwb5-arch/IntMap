-- ============================================================================
--  pgTAP · 10 — atlas-semantic-search: the capability vectors behind Atlas's semantic search.
--
--  What tests/atlas-semantic-search-checks.test.mjs cannot evaluate without a Postgres:
--    · the SURFACE — a table no client role can read or write, three SECURITY DEFINER functions
--      that pin search_path to `extensions` and are executable by service_role only;
--    · the SEED is all-or-nothing and idempotent, and the size it reports is the whole catalogue;
--    · the SIMILARITY is the cosine similarity, for every capability of that catalogue and model
--      and nothing of any other;
--    · the sweep takes stale catalogues and leaves the one being stored.
-- ============================================================================
begin;
select no_plan();

do $imp$ begin execute format('grant anon, authenticated, service_role to %I', current_user); exception when others then null; end $imp$;

create table _cap (k text primary key, v text);
grant insert, select on _cap to anon, authenticated, service_role;

create function _sel(k text, q text) returns void language plpgsql as $$
declare c text;
begin
  execute q into c;
  insert into _cap values (k, coalesce(c, '<null>'));
exception
  when insufficient_privilege then insert into _cap values (k, 'DENIED');
  when others then insert into _cap values (k, 'ERR:' || sqlstate);
end;
$$;

-- a 1536-dimension vector with a single 1 at position i (and one with two components, for 45°)
create function _unit(i integer) returns text language sql immutable as $$
  select '[' || array_to_string(array(select case when g = i then 1 else 0 end from generate_series(1, 1536) g), ',') || ']'
$$;
create function _diag(i integer, j integer) returns text language sql immutable as $$
  select '[' || array_to_string(array(select case when g = i or g = j then 1 else 0 end from generate_series(1, 1536) g), ',') || ']'
$$;
grant execute on function _unit(integer), _diag(integer, integer) to service_role, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
--  1. THE SURFACE
-- ─────────────────────────────────────────────────────────────────────────────
select has_table('public', 'atlas_capability_vectors', 'atlas-semantic-search: atlas_capability_vectors exists');
select has_function('public', 'atlas_capability_catalog_size', array['text','text'], 'atlas-semantic-search: atlas_capability_catalog_size(text,text) exists');
select has_function('public', 'atlas_capability_similarity', array['text','text','text'], 'atlas-semantic-search: atlas_capability_similarity(text,text,text) exists');
select has_function('public', 'atlas_capability_seed', array['text','text','jsonb'], 'atlas-semantic-search: atlas_capability_seed(text,text,jsonb) exists');

select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = 'atlas_capability_vectors'),
          'atlas-semantic-search: RLS is enabled on atlas_capability_vectors');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'atlas_capability_vectors'),
          0, 'atlas-semantic-search: atlas_capability_vectors has NO policy — no client role reads or writes it');

select ok((select bool_and(p.prosecdef) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('atlas_capability_catalog_size','atlas_capability_similarity','atlas_capability_seed')),
          'atlas-semantic-search: all three functions are SECURITY DEFINER');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('atlas_capability_catalog_size','atlas_capability_similarity','atlas_capability_seed')
             and exists (select 1 from unnest(p.proconfig) cfg where cfg = 'search_path=extensions')),
          3, 'atlas-semantic-search: all three pin search_path to extensions alone (pgvector''s operator lives there)');

select ok(not has_function_privilege('anon',          'public.atlas_capability_similarity(text,text,text)', 'execute'), 'atlas-semantic-search: anon cannot execute the similarity');
select ok(not has_function_privilege('authenticated', 'public.atlas_capability_similarity(text,text,text)', 'execute'), 'atlas-semantic-search: authenticated cannot execute the similarity');
select ok(not has_function_privilege('anon',          'public.atlas_capability_seed(text,text,jsonb)', 'execute'),       'atlas-semantic-search: anon cannot seed');
select ok(not has_function_privilege('authenticated', 'public.atlas_capability_seed(text,text,jsonb)', 'execute'),       'atlas-semantic-search: authenticated cannot seed');
select ok(not has_function_privilege('authenticated', 'public.atlas_capability_catalog_size(text,text)', 'execute'),     'atlas-semantic-search: authenticated cannot probe the catalogue');
select ok(    has_function_privilege('service_role',  'public.atlas_capability_seed(text,text,jsonb)', 'execute'),       'atlas-semantic-search: service_role CAN seed');
select ok(    has_function_privilege('service_role',  'public.atlas_capability_similarity(text,text,text)', 'execute'), 'atlas-semantic-search: service_role CAN search');
select ok(not has_table_privilege('anon',          'public.atlas_capability_vectors', 'select'),   'atlas-semantic-search: anon has no SELECT');
select ok(not has_table_privilege('authenticated', 'public.atlas_capability_vectors', 'select'),   'atlas-semantic-search: authenticated has no SELECT');
select ok(not has_table_privilege('authenticated', 'public.atlas_capability_vectors', 'insert'),   'atlas-semantic-search: authenticated has no INSERT');
select ok(not has_table_privilege('authenticated', 'public.atlas_capability_vectors', 'truncate'), 'atlas-semantic-search: authenticated has no TRUNCATE');

-- ─────────────────────────────────────────────────────────────────────────────
--  2. SEED, SIZE, SIMILARITY — as service_role.
--     catalogue A: three capabilities on axes 1, 2 and the 45° line between them.
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select _sel('s0', $q$select public.atlas_capability_catalog_size(repeat('a', 64), 'm')::text$q$);
select _sel('s1', $q$select public.atlas_capability_seed(repeat('a', 64), 'm', jsonb_build_array(
  jsonb_build_object('id', 'view.locate',  'e', _unit(1)),
  jsonb_build_object('id', 'time.now',     'e', _unit(2)),
  jsonb_build_object('id', 'map.clear',    'e', _diag(1, 2))))::text$q$);
select _sel('s2', $q$select public.atlas_capability_seed(repeat('a', 64), 'm', jsonb_build_array(
  jsonb_build_object('id', 'view.locate',  'e', _unit(1))))::text$q$);
select _sel('s3', $q$select public.atlas_capability_catalog_size(repeat('a', 64), 'm')::text$q$);
select _sel('s4', $q$select public.atlas_capability_catalog_size(repeat('a', 64), 'other-model')::text$q$);
select _sel('q1', $q$select round(similarity::numeric, 3)::text from public.atlas_capability_similarity(repeat('a', 64), 'm', _unit(1)) where capability_id = 'view.locate'$q$);
select _sel('q2', $q$select round(similarity::numeric, 3)::text from public.atlas_capability_similarity(repeat('a', 64), 'm', _unit(1)) where capability_id = 'time.now'$q$);
select _sel('q3', $q$select round(similarity::numeric, 3)::text from public.atlas_capability_similarity(repeat('a', 64), 'm', _unit(1)) where capability_id = 'map.clear'$q$);
select _sel('q4', $q$select count(*)::text from public.atlas_capability_similarity(repeat('a', 64), 'm', _unit(1))$q$);
select _sel('q5', $q$select count(*)::text from public.atlas_capability_similarity(repeat('b', 64), 'm', _unit(1))$q$);
-- a malformed vector raises, and the WHOLE seed is refused: catalogue B stays unknown
select _sel('bad', $q$select public.atlas_capability_seed(repeat('b', 64), 'm', jsonb_build_array(
  jsonb_build_object('id', 'view.locate', 'e', _unit(1)),
  jsonb_build_object('id', 'time.now',    'e', '[1,2,3]')))::text$q$);
select _sel('s5', $q$select public.atlas_capability_catalog_size(repeat('b', 64), 'm')::text$q$);
reset role;

select is((select v from _cap where k = 's0'), '0', 'atlas-semantic-search: an unknown catalogue has size 0');
select is((select v from _cap where k = 's1'), '3', 'atlas-semantic-search: the seed stores the whole catalogue and reports its size');
select is((select v from _cap where k = 's2'), '3', 'atlas-semantic-search: seeding again is idempotent (nothing duplicated, nothing replaced)');
select is((select v from _cap where k = 's3'), '3', 'atlas-semantic-search: the stored size is the catalogue''s');
select is((select v from _cap where k = 's4'), '0', 'atlas-semantic-search: another model''s vectors are another catalogue');
select is((select v from _cap where k = 'q1'), '1.000', 'atlas-semantic-search: identical direction → similarity 1');
select is((select v from _cap where k = 'q2'), '0.000', 'atlas-semantic-search: orthogonal → similarity 0');
select is((select v from _cap where k = 'q3'), '0.707', 'atlas-semantic-search: 45° → similarity cos 45°');
select is((select v from _cap where k = 'q4'), '3', 'atlas-semantic-search: the similarity covers EVERY capability of the catalogue');
select is((select v from _cap where k = 'q5'), '0', 'atlas-semantic-search: and nothing of a catalogue that is not stored');
select ok((select v from _cap where k = 'bad') like 'ERR:%', 'atlas-semantic-search: a malformed vector raises');
select is((select v from _cap where k = 's5'), '0', 'atlas-semantic-search: …and nothing of that seed is stored');

-- ─────────────────────────────────────────────────────────────────────────────
--  3. NO CLIENT MAY CALL IT
-- ─────────────────────────────────────────────────────────────────────────────
set local role authenticated;
select _sel('auth_q',   $q$select count(*)::text from public.atlas_capability_similarity(repeat('a', 64), 'm', _unit(1))$q$);
select _sel('auth_tbl', 'select count(*)::text from public.atlas_capability_vectors');
select _sel('auth_seed', $q$select public.atlas_capability_seed(repeat('c', 64), 'm', '[]'::jsonb)::text$q$);
reset role;
set local role anon;
select _sel('anon_tbl', 'select count(*)::text from public.atlas_capability_vectors');
reset role;
select is((select v from _cap where k = 'auth_q'),    'DENIED', 'atlas-semantic-search: authenticated is refused the similarity');
select is((select v from _cap where k = 'auth_tbl'),  'DENIED', 'atlas-semantic-search: authenticated is refused SELECT');
select is((select v from _cap where k = 'auth_seed'), 'DENIED', 'atlas-semantic-search: authenticated is refused the seed');
select is((select v from _cap where k = 'anon_tbl'),  'DENIED', 'atlas-semantic-search: anon is refused SELECT');

-- ─────────────────────────────────────────────────────────────────────────────
--  4. THE SWEEP — a stale catalogue goes when another is stored; the one being stored stays.
-- ─────────────────────────────────────────────────────────────────────────────
update public.atlas_capability_vectors set created_at = now() - interval '40 days' where catalog_hash = repeat('a', 64);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select _sel('sw', $q$select public.atlas_capability_seed(repeat('d', 64), 'm', jsonb_build_array(
  jsonb_build_object('id', 'view.locate', 'e', _unit(3))))::text$q$);
reset role;
select is((select v from _cap where k = 'sw'), '1', 'atlas-semantic-search: the new catalogue is stored');
select is((select count(*)::int from public.atlas_capability_vectors where catalog_hash = repeat('a', 64)), 0,
          'atlas-semantic-search: the catalogue older than 30 days was swept');
-- and re-seeding a catalogue that is itself old does not sweep it
update public.atlas_capability_vectors set created_at = now() - interval '40 days' where catalog_hash = repeat('d', 64);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select _sel('sw2', $q$select public.atlas_capability_seed(repeat('d', 64), 'm', jsonb_build_array(
  jsonb_build_object('id', 'view.locate', 'e', _unit(3))))::text$q$);
reset role;
select is((select v from _cap where k = 'sw2'), '1', 'atlas-semantic-search: the catalogue being stored is never the one swept');

select * from finish();
rollback;
