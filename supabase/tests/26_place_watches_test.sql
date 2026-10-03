-- ============================================================================
--  pgTAP · 26 — watch-places: a saved place that tells you when something happens near it.
--    ① the table exists, RLS is on, the catalogue has its sentence (the completeness check itself is
--      23_account_data_center_test.sql ①, which this table would fail without the row).
--    ② a reader watches their OWN place: watching it again is the same row (upsert on place_id);
--      the thresholds and the «seen» state are theirs to write; user_id and created_at are not.
--    ③ nobody watches, reads, edits or deletes another account's place or watch — not by naming its
--      place_id, not by rewriting user_id.
--    ④ the CHECKs hold the numbers supabase/functions/_shared/place-watch.js names (radius ≤ 1000 km,
--      M ≥ 2.5, levels 1–4, ≤ 2,000 seen keys).
--    ⑤ deleting the saved place deletes its watch; account deletion and the export reach the table
--      with no list naming it.
--  supabase/migrations/20261003211700_place_watches.sql.
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
declare n integer;
begin execute q; get diagnostics n = row_count; insert into _cap values (k,'ROWS:'||n);
exception when insufficient_privilege then insert into _cap values (k,'DENIED');
        when others then insert into _cap values (k,'ERR:'||sqlstate); end; $$;

-- ① ─────────────────────────────────────────────────────────────────────────
select has_table('public', 'place_watches', 'place_watches exists');
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname = 'place_watches'), 'RLS is on for place_watches');
select ok(exists (select 1 from public.account_data_catalog where tbl = 'place_watches' and written_by = 'you'),
          'the catalogue explains place_watches, written by the reader');
select ok(exists (select 1 from public._owned_by_user_cols() where tbl = 'place_watches' and col = 'user_id'),
          'the owned-table discovery finds place_watches through user_id');

-- the two accounts' places, inserted as the table owner (save_place is tested in 23)
insert into public.saved_places (id, user_id, name, lng, lat) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'Home (A)', 139.69, 35.69),
  ('bbbbbbbb-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'Home (B)', -0.12, 51.5);

-- ② ─────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _run('a_watch',  'insert into public.place_watches (place_id) values (''aaaaaaaa-0000-0000-0000-00000000000a'')');
select _sel('a_dflt',   'select radius_km || ''/'' || quake_min_mag || ''/'' || alert_min_level || ''/'' || volcano_min_rank || ''/'' || news_min_sources || ''/'' || enabled from public.place_watches');
select _run('a_again',  'insert into public.place_watches (place_id, radius_km, quake_min_mag) values (''aaaaaaaa-0000-0000-0000-00000000000a'', 150, 5)
                         on conflict (place_id) do update set radius_km = excluded.radius_km, quake_min_mag = excluded.quake_min_mag');
select _sel('a_count',  'select count(*)::text from public.place_watches');
select _sel('a_upd',    'select radius_km || ''/'' || quake_min_mag from public.place_watches');
select _run('a_off',    'update public.place_watches set news_min_sources = null, seen_at = now(), seen_keys = array[''quake:us7000abcd'']');
select _sel('a_seen',   'select coalesce(news_min_sources::text, ''null'') || ''/'' || array_length(seen_keys, 1) from public.place_watches');
select _sel('a_owner',  'select user_id::text from public.place_watches');
select _run('a_steal',  'update public.place_watches set user_id = ''22222222-2222-2222-2222-222222222222''');
select _run('a_stamp',  'update public.place_watches set created_at = now() - interval ''1 year''');
-- ③ A names B's place
select _run('a_bplace', 'insert into public.place_watches (place_id) values (''bbbbbbbb-0000-0000-0000-00000000000b'')');
-- ④ the numbers
select _run('c_radius', 'update public.place_watches set radius_km = 1001');
select _run('c_mag',    'update public.place_watches set quake_min_mag = 2.4');
select _run('c_level',  'update public.place_watches set alert_min_level = 5');
select _run('c_keys',   'update public.place_watches set seen_keys = (select array_agg(''k'' || g) from generate_series(1, 2001) g)');
select _run('c_ok',     'update public.place_watches set radius_km = 1000, quake_min_mag = 2.5, alert_min_level = 4');
reset role;

select is((select v from _cap where k='a_watch'),  'ROWS:1',   'A watches their own place');
select is((select v from _cap where k='a_dflt'),   '300/4.5/2/2/2/true', 'a new watch takes the defaults _shared/place-watch.js names');
select is((select v from _cap where k='a_again'),  'ROWS:1',   'watching it again is an upsert of the same row');
select is((select v from _cap where k='a_count'),  '1',        'one place, one watch');
select is((select v from _cap where k='a_upd'),    '150/5',    'the second watch updated what it was given');
select is((select v from _cap where k='a_off'),    'ROWS:1',   'A turns one kind off and records what they saw');
select is((select v from _cap where k='a_seen'),   'null/1',   'NULL means the kind is not watched; the seen keys are kept');
select is((select v from _cap where k='a_owner'),  '11111111-1111-1111-1111-111111111111', 'user_id is the database''s, from the place');
select is((select v from _cap where k='a_steal'),  'DENIED',   'A cannot hand the watch to another account');
select is((select v from _cap where k='a_stamp'),  'DENIED',   'created_at is the database''s');
select ok((select v from _cap where k='a_bplace') in ('DENIED','ERR:42501'), 'A cannot watch B''s place by naming its id');
select is((select v from _cap where k='c_radius'), 'ERR:23514','radius above 1,000 km is refused');
select is((select v from _cap where k='c_mag'),    'ERR:23514','a magnitude below the feed''s M2.5 floor is refused');
select is((select v from _cap where k='c_level'),  'ERR:23514','a warning level outside 1–4 is refused');
select is((select v from _cap where k='c_keys'),   'ERR:23514','more than 2,000 seen keys is refused');
select is((select v from _cap where k='c_ok'),     'ROWS:1',   'the bounds themselves are accepted');

-- ③ B sees and touches nothing of A's
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select _sel('b_sees',  'select count(*)::text from public.place_watches');
select _run('b_upd',   'update public.place_watches set radius_km = 1');
select _run('b_del',   'delete from public.place_watches');
select _run('b_own',   'insert into public.place_watches (place_id, news_min_sources) values (''bbbbbbbb-0000-0000-0000-00000000000b'', 3)');
select _sel('b_own_sees','select count(*)::text from public.place_watches');
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select _sel('anon_sees', 'select count(*)::text from public.place_watches');
reset role;

select is((select v from _cap where k='b_sees'),    '0',       'B sees none of A''s watches');
select is((select v from _cap where k='b_upd'),     'ROWS:0',  'B cannot edit A''s watch');
select is((select v from _cap where k='b_del'),     'ROWS:0',  'B cannot delete A''s watch');
select is((select v from _cap where k='b_own'),     'ROWS:1',  'B watches B''s own place');
select is((select v from _cap where k='b_own_sees'), '1',       'B then sees exactly their own watch');
select is((select v from _cap where k='anon_sees'), 'DENIED',  'a signed-out reader cannot read watches');
select is((select count(*)::int from public.place_watches where user_id = '11111111-1111-1111-1111-111111111111'), 1, 'A''s watch is still there');

-- ⑤ the place goes, its watch goes; the export and account deletion reach it
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select _sel('exp_b', 'select public.export_account_data() -> ''counts'' ->> ''place_watches''');
reset role;
select is((select v from _cap where k='exp_b'), '1', 'the export reaches place_watches with no list naming it');

delete from public.saved_places where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
select is((select count(*)::int from public.place_watches where place_id = 'aaaaaaaa-0000-0000-0000-00000000000a'), 0, 'deleting the saved place deletes its watch');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select _sel('del_b', 'select public.delete_account_data(''22222222-2222-2222-2222-222222222222'') -> ''tables'' ->> ''place_watches''');
reset role;
select is((select v from _cap where k='del_b'), '1', 'account deletion reaches place_watches with no list naming it');

-- grants
select ok(not has_table_privilege('authenticated', 'public.place_watches', 'truncate'), 'authenticated holds no TRUNCATE on place_watches (TRUNCATE ignores RLS)');
select ok(not has_table_privilege('anon',          'public.place_watches', 'select'),   'anon holds no SELECT on place_watches');
select ok(not has_column_privilege('authenticated', 'public.place_watches', 'user_id', 'update'), 'authenticated cannot UPDATE user_id');

select * from finish();
rollback;
