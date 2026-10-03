-- ============================================================================
--  pgTAP · 18 — account-data-center + my-places: what an account holds, in the reader's hands.
--    ① THE CATALOGUE IS COMPLETE IN BOTH DIRECTIONS — every table public._owned_by_user_cols()
--      discovers has its sentence in account_data_catalog, and every sentence names a table that is
--      owned. A new owned table without a sentence fails here (it is still exported and counted:
--      the catalogue explains, it never filters).
--    ② the inventory and the export answer for the CALLER only (auth.uid()); anon is refused; the
--      export carries the rows only an admin could read through RLS (feedback) because they are the
--      reader's own; another account's rows never appear.
--    ③ WHAT YOU CAN DOWNLOAD IS EXACTLY WHAT DELETION REMOVES — the export's per-table counts equal
--      delete_account_data()'s per-table report for the same account in the same transaction.
--    ④ the export's fence (relay_take 'account-export') refuses the 7th export in a row with
--      {ok:false,error:'rate_limited'} and reads nothing.
--    ⑤ my-places: save_place() is the only door in; the same position is one place (created=false,
--      no duplicate); the owner reads/edits/deletes their own rows and nobody else's; no direct
--      INSERT, no user_id rewrite; the fence (saved_places_limit) refuses with 54000; account
--      deletion and the export both reach it with no list naming it.
--  supabase/migrations/20261003090000_account_data_center.sql, 20261003100000_saved_places.sql.
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

-- ─────────────────────────────────────────────────────────────────────────────
--  1. THE TABLES AND THE CATALOGUE
-- ─────────────────────────────────────────────────────────────────────────────
select has_table('public', 'account_data_catalog', 'account_data_catalog exists');
select has_table('public', 'saved_places',         'saved_places exists');
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname = 'account_data_catalog'), 'RLS is on for account_data_catalog');
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname = 'saved_places'), 'RLS is on for saved_places');

select ok((select count(distinct tbl) from public._owned_by_user_cols()) >= 20,
          'the owned-table discovery sees the account tables (not vacuous)');
select is(
  (select coalesce(string_agg(o.tbl, ', ' order by o.tbl), '')
     from (select distinct tbl from public._owned_by_user_cols()) o
    where not exists (select 1 from public.account_data_catalog c where c.tbl = o.tbl)),
  '',
  'every owned table has its sentence in account_data_catalog');
select is(
  (select coalesce(string_agg(c.tbl, ', ' order by c.tbl), '')
     from public.account_data_catalog c
    where not exists (select 1 from public._owned_by_user_cols() o where o.tbl = c.tbl)),
  '',
  'every catalogue sentence names a table an account actually owns');
select ok((select bool_and(c.written_by in ('you','intmap')) from public.account_data_catalog c),
          'every sentence says who wrote the data');

-- ─────────────────────────────────────────────────────────────────────────────
--  2. WHO MAY ASK
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select _sel('anon_cat', 'select (count(*) >= 20)::text from public.account_data_catalog');
select _sel('anon_inv', 'select count(*)::text from public.account_data_inventory()');
select _sel('anon_exp', 'select public.export_account_data()::text');
select _sel('anon_sp',  'select count(*)::text from public.saved_places');
select _sel('anon_save','select created::text from public.save_place(''x'', 1, 1)');
reset role;

select is((select v from _cap where k='anon_cat'),  'true',   'a signed-out reader can read the catalogue (it holds no one''s data)');
select is((select v from _cap where k='anon_inv'),  'DENIED', 'anon cannot ask for an inventory');
select is((select v from _cap where k='anon_exp'),  'DENIED', 'anon cannot export');
select is((select v from _cap where k='anon_sp'),   'DENIED', 'anon cannot read saved places');
select is((select v from _cap where k='anon_save'), 'DENIED', 'anon cannot save a place');

-- ─────────────────────────────────────────────────────────────────────────────
--  3. USER A — the inventory and the export are A's alone
--     (seed: A has 1 user_prefs, 1 favorite, 1 ai_usage day, 1 post, 1 feedback row — admin-read —;
--      B commented on and voted for A's post)
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _sel('a_fb_rls', 'select count(*)::text from public.feedback');
select _sel('a_inv_fav',  'select row_count::text from public.account_data_inventory() where tbl = ''favorites''');
select _sel('a_inv_fb',   'select row_count::text from public.account_data_inventory() where tbl = ''feedback''');
select _sel('a_inv_desc', 'select bool_and(described)::text from public.account_data_inventory()');
select _sel('a_inv_who',  'select written_by from public.account_data_inventory() where tbl = ''ai_usage''');
select _sel('exp_a', 'select public.export_account_data()::text');
reset role;

select is((select v from _cap where k='a_fb_rls'),   '0',      'through RLS, A cannot read even their own feedback row (admin-read table)');
select is((select v from _cap where k='a_inv_fav'),  '1',      'A''s inventory counts A''s one saved article');
select is((select v from _cap where k='a_inv_fb'),   '1',      'A''s inventory counts the feedback A sent');
select is((select v from _cap where k='a_inv_desc'), 'true',   'every row of the inventory is described');
select is((select v from _cap where k='a_inv_who'),  'intmap', 'the inventory says IntMap, not the reader, wrote the AI usage');

select is((select j ->> 'ok' from (select v::jsonb as j from _cap where k='exp_a') e), 'true', 'A''s export succeeds');
select is((select j ->> 'format' from (select v::jsonb as j from _cap where k='exp_a') e), 'intmap-account-export', 'the export names its format');
select is((select j -> 'account' ->> 'email' from (select v::jsonb as j from _cap where k='exp_a') e), 'a@intmap.test', 'the export carries what the sign-in system holds');
select is((select j -> 'tables' -> 'favorites' -> 0 ->> 'article_link' from (select v::jsonb as j from _cap where k='exp_a') e), 'https://example.test/article-a', 'the export carries A''s saved article, every column');
select is((select j -> 'tables' -> 'feedback' -> 0 ->> 'comment' from (select v::jsonb as j from _cap where k='exp_a') e), '[General] Synthetic feedback', 'the export carries A''s own feedback, which RLS would not show A');
select is((select (j -> 'counts' ->> 'community_posts') from (select v::jsonb as j from _cap where k='exp_a') e), '1', 'the export counts A''s one post');
select ok((select (j -> 'catalog' -> 'favorites' ->> 'label_en') is not null from (select v::jsonb as j from _cap where k='exp_a') e), 'the export explains each table in its own words');
select ok((select position('22222222-2222-2222-2222-222222222222' in j::text) = 0 from (select v::jsonb as j from _cap where k='exp_a') e),
          'nothing of user B (B commented on and voted for A''s post) appears in A''s export');

-- ─────────────────────────────────────────────────────────────────────────────
--  4. MY PLACES — the one door in, and the owner's own rows
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _sel('p_new',   'select created::text || ''/'' || place_count from public.save_place(''Kyoto Station'', 135.75875, 34.98559, ''meet here'', ''Field trip'', 15, ''reader'')');
select _sel('p_again', 'select created::text || ''/'' || place_count from public.save_place(''Kyoto Stn'', 135.758751, 34.985591)');
select _sel('p_kept',  'select name || ''|'' || note || ''|'' || collection from public.saved_places');
select _sel('p_other', 'select created::text || ''/'' || place_count from public.save_place(''Osaka Castle'', 135.52583, 34.68731, null, ''Field trip'')');
select _sel('p_noname','select created::text from public.save_place(''   '', 10, 10)');
select _sel('p_range', 'select created::text from public.save_place(''Nowhere'', 200, 10)');
select _run('p_ins',   'insert into public.saved_places (user_id, name, lng, lat) values (''11111111-1111-1111-1111-111111111111'', ''forged'', 1, 1)');
select _run('p_upd',   'update public.saved_places set note = ''bring a map'' where name = ''Osaka Castle''');
select _run('p_steal', 'update public.saved_places set user_id = ''22222222-2222-2222-2222-222222222222''');
select _run('p_stamp', 'update public.saved_places set created_at = now() - interval ''1 year''');
reset role;

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select _sel('b_sees',  'select count(*)::text from public.saved_places');
select _run('b_upd',   'update public.saved_places set name = ''hijacked''');
select _run('b_del',   'delete from public.saved_places');
select _sel('b_save',  'select created::text || ''/'' || place_count from public.save_place(''Kyoto Station'', 135.75875, 34.98559)');
reset role;

select is((select v from _cap where k='p_new'),   'true/1',  'the first save creates the place');
select is((select v from _cap where k='p_again'), 'false/1', 'saving the same position again is the same place — not created, no duplicate');
select is((select v from _cap where k='p_kept'),  'Kyoto Stn|meet here|Field trip', 'a re-save updates the name it was given and keeps what it was not given');
select is((select v from _cap where k='p_other'), 'true/2',  'another position is another place');
select is((select v from _cap where k='p_noname'),'ERR:22023','a place needs a name');
select is((select v from _cap where k='p_range'), 'ERR:23514','a position off the globe is refused by the table');
select is((select v from _cap where k='p_ins'),   'DENIED',  'no direct INSERT: save_place() is the only door in');
select is((select v from _cap where k='p_upd'),   'ROWS:1',  'the owner edits a note');
select is((select v from _cap where k='p_steal'), 'DENIED',  'the owner cannot hand a place to another account');
select is((select v from _cap where k='p_stamp'), 'DENIED',  'created_at is the database''s');
select is((select v from _cap where k='b_sees'),  '0',       'B sees none of A''s places');
select is((select v from _cap where k='b_upd'),   'ROWS:0',  'B cannot rename A''s places');
select is((select v from _cap where k='b_del'),   'ROWS:0',  'B cannot delete A''s places');
select is((select v from _cap where k='b_save'),  'true/1',  'B saving the same position makes B''s own place, not A''s');
select is((select count(*)::int from public.saved_places where user_id = '11111111-1111-1111-1111-111111111111'), 2, 'A still holds exactly two places');

-- the fence: fill A to the limit as the table owner, then ask through the door
insert into public.saved_places (user_id, name, lng, lat)
  select '11111111-1111-1111-1111-111111111111', 'filler ' || g, -170 + (g % 340), -80 + (g / 340) * 0.001
    from generate_series(1, public.saved_places_limit() - 2) g;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _sel('p_full',   'select created::text from public.save_place(''One too many'', 1.5, 1.5)');
select _sel('p_resave', 'select created::text from public.save_place(''Kyoto Station'', 135.75875, 34.98559)');
reset role;
select is((select v from _cap where k='p_full'),   'ERR:54000', 'at saved_places_limit() a new place is refused, and says which fence');
select is((select v from _cap where k='p_resave'), 'false',     'a full account can still update a place it already holds');
delete from public.saved_places where name like 'filler %';

-- ─────────────────────────────────────────────────────────────────────────────
--  5. ③ — WHAT B CAN DOWNLOAD IS EXACTLY WHAT DELETION REMOVES (same account, same transaction)
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select _sel('exp_b', 'select public.export_account_data()::text');
reset role;
select is((select (j -> 'counts' ->> 'saved_places') from (select v::jsonb as j from _cap where k='exp_b') e), '1', 'the export reaches saved_places with no list naming it');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select _sel('del_b', 'select public.delete_account_data(''22222222-2222-2222-2222-222222222222'')::text');
reset role;
-- The structural half: the same SET of tables (holds whatever the seed contains).
select is((select string_agg(k, ',' order by k) from (select v::jsonb as j from _cap where k='del_b') d, jsonb_object_keys(d.j -> 'tables') k),
          (select string_agg(k, ',' order by k) from (select v::jsonb as j from _cap where k='exp_b') e, jsonb_object_keys(e.j -> 'counts') k),
          'the export walks exactly the tables account deletion walks');
-- The row half. ⚠ It holds because B's seeded rows include none that a CASCADE from another of B's own
-- rows removes first (deletion then reports 0 for that table although the row is gone) — if the seed
-- gains one, compare that table's rows before deletion instead of the report.
select is((select j -> 'tables' from (select v::jsonb as j from _cap where k='del_b') d), (select j -> 'counts' from (select v::jsonb as j from _cap where k='exp_b') e),
          'the export''s per-table counts equal what account deletion removed, table for table');
select is((select (j -> 'tables' ->> 'saved_places') from (select v::jsonb as j from _cap where k='del_b') d), '1', 'account deletion reaches saved_places with no list naming it');

-- ─────────────────────────────────────────────────────────────────────────────
--  6. ④ — THE EXPORT'S FENCE
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
-- A has exported once above; five more fill the bucket, the seventh is refused.
select _sel('e2', 'select public.export_account_data() ->> ''ok''');
select _sel('e3', 'select public.export_account_data() ->> ''ok''');
select _sel('e4', 'select public.export_account_data() ->> ''ok''');
select _sel('e5', 'select public.export_account_data() ->> ''ok''');
select _sel('e6', 'select public.export_account_data() ->> ''ok''');
select _sel('e7', 'select public.export_account_data()::text');
reset role;
select is((select v from _cap where k='e6'), 'true', 'six exports in a row are served');
select is((select v from _cap where k='e7'), '{"ok": false, "error": "rate_limited"}', 'the seventh is refused by the fence, and reads nothing');

-- ─────────────────────────────────────────────────────────────────────────────
--  7. GRANTS
-- ─────────────────────────────────────────────────────────────────────────────
select ok(not has_table_privilege('authenticated', 'public.saved_places', 'insert'),   'authenticated holds no INSERT on saved_places');
select ok(not has_table_privilege('authenticated', 'public.saved_places', 'truncate'), 'authenticated holds no TRUNCATE on saved_places (TRUNCATE ignores RLS)');
select ok(not has_table_privilege('anon',          'public.saved_places', 'select'),   'anon holds no SELECT on saved_places');
select ok(not has_table_privilege('authenticated', 'public.account_data_catalog', 'insert'), 'nobody but a migration writes the catalogue');
select ok(not has_function_privilege('anon', 'public.export_account_data()', 'execute'),     'anon cannot execute export_account_data');
select ok(not has_function_privilege('anon', 'public.account_data_inventory()', 'execute'),  'anon cannot execute account_data_inventory');

select * from finish();
rollback;
