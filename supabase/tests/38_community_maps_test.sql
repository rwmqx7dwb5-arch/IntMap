-- ============================================================================
--  pgTAP · 38 — community-maps: the directory of collections owners chose to list, the reuse each one has
--  had, the line to the collection it was started from, and the reports an administrator settles.
--    ① the surface: two new tables with RLS, no INSERT for anyone but the functions, their catalogue sentences;
--      the owner cannot write the listing columns of a share directly.
--    ② listing: list_community_map() publishes and lists in one call, needs a name the first time, keeps it after
--      (listed=false), refuses an empty collection and an over-long name.
--    ③ THE DIRECTORY (anon): only listed, unheld, non-empty collections, a page at a time (has_more, no total); named keys only (no id, account,
--      e-mail); words matched as words (a «%» is not a wildcard); the area filter, across the antimeridian too.
--    ④ reuse: a copy leaves ONE receipt per (collection, account) — the copier's row, invisible to the owner, not
--      left by an owner copying their own; the owner reads the count (my_collection_reach, the directory).
--    ⑤ lineage: a collection listed from a copy names the original — only while the original is listed, so an
--      unlisted original's link never travels through somebody else's listing.
--    ⑥ reports and moderation: a signed-in reader's report, one per account (again = update); not one's own, not
--      an unlisted collection, not an invented reason; the owner never reads it; only an administrator reads the
--      queue and hides (with a reason the owner reads), restores or dismisses; a hidden collection cannot be
--      listed again by its owner and its link keeps working.
--    ⑥b THE HOLD AND THE REPORTS ARE ON THE COLLECTION, NOT ITS SHARE ROW: the owner unpublishing and publishing
--      again does not lift the hold nor erase the reports; the queue still names it, and holds it with no share.
--    ⑦ unpublishing takes the receipts and reports with it and cuts the lineage; the export carries both tables.
--  supabase/migrations/20261013080000_community_maps.sql.
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
create function _tok(k text) returns text language sql stable as $$ select v from _cap where _cap.k = $1 $$;
grant execute on function _tok(text) to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  1. THE SURFACE
-- ─────────────────────────────────────────────────────────────────────────────
select has_table('public', 'collection_copies',     'collection_copies exists');
select has_table('public', 'community_map_reports', 'community_map_reports exists');
select has_table('public', 'community_map_holds',    'community_map_holds exists');
select has_table('public', 'community_map_subjects', 'community_map_subjects exists');
select ok((select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname in ('community_map_holds', 'community_map_subjects')), 'RLS is on for the holds and the subjects');
select ok(not has_any_column_privilege('authenticated', 'public.community_map_subjects', 'select'), 'nobody but the functions reads the subjects (the owner''s account id)');
select ok(not has_table_privilege('authenticated', 'public.community_map_holds', 'insert') and not has_table_privilege('authenticated', 'public.community_map_holds', 'delete'),
          'the owner cannot write or lift a hold');
select ok((select count(*) = 0 from information_schema.columns where table_schema = 'public' and table_name = 'community_map_reports' and column_name in ('owner', 'owner_id', 'share_id')),
          'a report row carries no owner account and no share row — a reporter''s export names neither');
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname = 'collection_copies'), 'RLS is on for collection_copies');
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname = 'community_map_reports'), 'RLS is on for community_map_reports');
select ok((select count(*) = 3 from public.account_data_catalog where tbl in ('collection_copies', 'community_map_reports', 'community_map_holds')),
          'the three account-owned tables carry their sentence in the account''s data catalogue');
select ok((select purpose_jp from public.account_data_catalog where tbl = 'collection_shares') ~ 'みんなの地図',
          'the published collections'' sentence says what a listing adds');
select ok(not has_table_privilege('authenticated', 'public.collection_copies', 'insert'),     'no direct INSERT on collection_copies');
select ok(not has_table_privilege('authenticated', 'public.community_map_reports', 'insert'), 'no direct INSERT on community_map_reports');
select ok(not has_table_privilege('authenticated', 'public.community_map_reports', 'update'), 'no direct UPDATE on community_map_reports (moderation is a function)');
select ok(not has_any_column_privilege('anon', 'public.collection_copies', 'select'),          'anon reads no receipt');
select ok(not has_any_column_privilege('anon', 'public.community_map_reports', 'select'),      'anon reads no report');
select ok(not has_column_privilege('authenticated', 'public.collection_shares', 'listed_at', 'update'),    'the owner cannot set listed_at directly');
select ok(not has_column_privilege('authenticated', 'public.collection_shares', 'reused_count', 'update'), 'the owner cannot write the reuse counter');
select ok(not has_column_privilege('authenticated', 'public.collection_shares', 'derived_from', 'update'), 'the owner cannot rewrite the lineage');
select ok(not has_column_privilege('authenticated', 'public.collection_shares', 'author_name', 'update'),  'the author name is written through list_community_map only');
select ok(    has_function_privilege('anon', 'public.community_maps(text, text, integer, integer, double precision[])', 'execute'), 'anon may read the directory');
select ok(obj_description('public.community_maps(text, text, integer, integer, double precision[])'::regprocedure, 'pg_proc') ~ 'ANON MAY CALL: \S', 'and the function states why');
select ok(not has_function_privilege('anon', 'public.list_community_map(text, text, text, text)', 'execute'), 'anon cannot list');
select ok(not has_function_privilege('anon', 'public.report_community_map(text, text, text)', 'execute'),     'anon cannot report');
select ok(not has_function_privilege('anon', 'public.moderate_community_map(text, text, text)', 'execute'),   'anon cannot moderate');
select ok(not has_function_privilege('anon', 'public.community_map_reports_admin()', 'execute'),             'anon cannot read the queue');
select ok(not has_function_privilege('anon', 'public.my_collection_reach()', 'execute'),                     'anon has no reach to read');

-- ─────────────────────────────────────────────────────────────────────────────
--  2. LISTING (A)
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _sel('a_p1', 'select created::text from public.save_place(''Kyoto Station'', 135.75875, 34.98559, ''meet here'', ''Kansai'')');
select _sel('a_p2', 'select created::text from public.save_place(''Osaka Castle'',  135.52583, 34.68731, null, ''Kansai'')');
select _sel('a_p3', 'select created::text from public.save_place(''Home'',          139.69171, 35.68950, ''private'', ''Home'')');
select _sel('a_v1', 'select created::text from public.save_view(''Europe 1914'', ''v=10.0000,50.0000,4.00,0,0,f&l=dl-ww1&tt=1914-07-28'', null, ''Europe 1914'')');
select _sel('l_noname',  'select token from public.list_community_map(''Kansai'', null, ''Two stops'', ''Kansai field trip'')');
select _sel('l_long',    'select token from public.list_community_map(''Kansai'', repeat(''x'', 41))');
select _sel('l_empty',   'select token from public.list_community_map(''Nothing here'', ''Ms A'')');
select _sel('l_first',   'select token || ''|'' || listed::text from public.list_community_map(''Kansai'', ''Ms A'', ''Two stops for the 2nd-years'', ''Kansai field trip'')');
select _sel('l_again',   'select listed::text from public.list_community_map(''Kansai'', null, ''Two stops for the 2nd-years — with a map'')');
select _sel('l_kept',    'select author_name || ''|'' || summary from public.collection_shares where collection = ''Kansai''');
select _sel('l_europe',  'select token from public.list_community_map(''Europe 1914'', ''Ms A'')');
select _sel('home_tok',  'select token from public.publish_collection(''Home'', ''Home'')');
select _run('a_forge',   'update public.collection_shares set listed_at = null');
select _run('a_forge2',  'update public.collection_shares set author_name = ''forged''');
select _sel('unl_none',  'select public.unlist_community_map(''Home'')::text');
reset role;

select is(_tok('l_noname'), 'ERR:22023', 'listing needs a name to show the first time');
select is(_tok('l_long'),   'ERR:23514', 'a name longer than 40 characters is refused by the table');
select is(_tok('l_empty'),  'ERR:22023', 'an empty collection is not listed (nor published)');
select ok(_tok('l_first') ~ '^[0-9a-f]{32}\|true$', 'listing publishes and lists in one call');
select is(_tok('l_again'),  'false', 'listing a listed collection again is «already listed» (listed=false)');
select is(_tok('l_kept'),   'Ms A|Two stops for the 2nd-years — with a map', 'the name is kept when not given again; the summary is updated');
select is(_tok('a_forge'),  'DENIED', 'the owner cannot unlist by writing the column');
select is(_tok('a_forge2'), 'DENIED', 'the owner cannot write the author name directly');
select is(_tok('unl_none'), 'false', 'unlisting what is not listed answers false («already done»)');
insert into _cap values ('kansai', split_part(_tok('l_first'), '|', 1));

-- ─────────────────────────────────────────────────────────────────────────────
--  3. THE DIRECTORY (anon)
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select _sel('d_all',    'select public.community_maps()::text');
select _sel('d_word',   'select public.community_maps(''KANSAI'')::text');
select _sel('d_author', 'select public.community_maps(''ms a'')::text');
select _sel('d_none',   'select public.community_maps(''zzzz'')::text');
select _sel('d_pct',    'select public.community_maps(''%'')::text');
select _sel('d_japan',  'select public.community_maps(null, ''new'', 24, 0, array[129, 30, 146, 46]::double precision[])::text');
select _sel('d_europe', 'select public.community_maps(null, ''new'', 24, 0, array[-10, 35, 30, 60]::double precision[])::text');
select _sel('d_wrap',   'select public.community_maps(null, ''new'', 24, 0, array[120, 20, -30, 60]::double precision[])::text');
select _sel('d_page',   'select public.community_maps(null, ''new'', 1, 1)::text');
select _sel('d_page0',  'select public.community_maps(null, ''new'', 1, 0)::text');
select _sel('d_lim',    'select public.community_maps(null, ''bogus'', 9999, -5)::text');
select _sel('anon_tbl', 'select count(*)::text from public.collection_copies');
reset role;

select is(jsonb_array_length((_tok('d_all')::jsonb) -> 'items'), 2, 'the directory holds the two listed collections — not the link-only Home');
select is((_tok('d_all')::jsonb) ->> 'has_more', 'false', 'and says there is no further page');
select ok(not ((_tok('d_all')::jsonb) ? 'total'), 'no total: a total would read every listing (the cost follows the page)');
select is((select string_agg(e ->> 'title', ',' order by e ->> 'title') from jsonb_array_elements((_tok('d_all')::jsonb) -> 'items') e),
          'Europe 1914,Kansai field trip', 'by their titles');
select is((select string_agg(k, ',' order by k) from jsonb_array_elements((_tok('d_all')::jsonb) -> 'items') e, jsonb_object_keys(e) k where e ->> 'title' = 'Kansai field trip'),
          'author,based_on,bbox,derived,lat,listed_at,lng,maps,places,reused,summary,title,token,tours,updated_at',
          'an entry is exactly its named keys — no id, account or e-mail');
select ok(position('11111111-1111-1111-1111-111111111111' in _tok('d_all')) = 0 and position('a@intmap.test' in _tok('d_all')) = 0,
          'no account id or e-mail anywhere in the directory');
select is((select (e ->> 'places') || '/' || (e ->> 'maps') || '/' || (e ->> 'author') from jsonb_array_elements((_tok('d_all')::jsonb) -> 'items') e where e ->> 'title' = 'Kansai field trip'),
          '2/0/Ms A', 'the Kansai entry counts its places and maps and carries the name chosen for the listing');
select ok((select abs((e ->> 'lng')::float - 135.64229) < 0.001 and abs((e ->> 'lat')::float - 34.83645) < 0.001
             from jsonb_array_elements((_tok('d_all')::jsonb) -> 'items') e where e ->> 'title' = 'Kansai field trip'),
          'located at the centre of its places');
select ok((select abs((e ->> 'lng')::float - 10) < 0.001 and abs((e ->> 'lat')::float - 50) < 0.001 and e -> 'bbox' = 'null'::jsonb
             from jsonb_array_elements((_tok('d_all')::jsonb) -> 'items') e where e ->> 'title' = 'Europe 1914'),
          'a collection of maps only is located at its first map''s camera');
select is(jsonb_array_length((_tok('d_word')::jsonb) -> 'items'), 1, 'words match the title, whatever their case');
select is(jsonb_array_length((_tok('d_author')::jsonb) -> 'items'), 2, 'words match the name it is listed under');
select is(jsonb_array_length((_tok('d_none')::jsonb) -> 'items'), 0, 'words that match nothing find nothing');
select is(jsonb_array_length((_tok('d_pct')::jsonb) -> 'items'), 0, 'a «%» is a character to find, not a wildcard');
select is((select string_agg(e ->> 'title', ',') from jsonb_array_elements((_tok('d_japan')::jsonb) -> 'items') e), 'Kansai field trip', 'the area filter finds the collection in Japan');
select is((select string_agg(e ->> 'title', ',') from jsonb_array_elements((_tok('d_europe')::jsonb) -> 'items') e), 'Europe 1914', '…and the one about Europe');
select is(jsonb_array_length((_tok('d_wrap')::jsonb) -> 'items'), 1, 'a box across the antimeridian (120°E → 30°W) finds Kansai and not Europe');
select is(jsonb_array_length((_tok('d_page')::jsonb) -> 'items'), 1, 'a page of one');
select is((_tok('d_page0')::jsonb) ->> 'has_more', 'true', 'the first page of one says there is more');
select is((_tok('d_page')::jsonb) ->> 'has_more', 'false', 'the second does not');
select ok(((_tok('d_page0')::jsonb) -> 'items' -> 0 ->> 'token') <> ((_tok('d_page')::jsonb) -> 'items' -> 0 ->> 'token'),
          'the two pages hold different collections — the order is total (listed_at, then id), so no row is on both or neither');
select is((_tok('d_lim')::jsonb) ->> 'limit', '50', 'at most 50 a page');
select is((_tok('d_lim')::jsonb) ->> 'offset', '0', 'a negative offset is the first page');
select is((_tok('d_lim')::jsonb) ->> 'sort', 'new', 'an unknown sort is «new»');
select is(_tok('anon_tbl'), 'DENIED', 'anon cannot read the copy receipts');

-- ─────────────────────────────────────────────────────────────────────────────
--  4. REUSE AND  5. LINEAGE (B copies A; B lists what it built from the copy)
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select _sel('b_copy1', format('select public.copy_shared_collection(%L, ''Our Kansai'')::text', _tok('kansai')));
select _sel('b_copy2', format('select public.copy_shared_collection(%L, ''Our Kansai'')::text', _tok('kansai')));
select _sel('b_rcpt',  'select count(*)::text || ''|'' || min(into_collection) from public.collection_copies');
select _sel('b_add',   'select created::text from public.save_place(''Nara Park'', 135.84300, 34.68500, null, ''Our Kansai'')');
select _sel('b_list',  'select coalesce(derived_from_title, ''<none>'') from public.list_community_map(''Our Kansai'', ''Mr B'', ''Kansai plus Nara'')');
select _sel('b_home',  format('select public.copy_shared_collection(%L, ''Home copy'')::text', _tok('home_tok')));
select _sel('b_hlist', 'select coalesce(derived_from_title, ''<none>'') from public.list_community_map(''Home copy'', ''Mr B'')');
reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _sel('a_rcpt',  'select count(*)::text from public.collection_copies');
select _sel('a_own',   format('select public.copy_shared_collection(%L, ''Kansai again'')::text', _tok('kansai')));
select _sel('a_reach', 'select string_agg(c.collection || '':'' || r.reused || ''/'' || r.derived, '','' order by c.collection) from public.my_collection_reach() r join public.collection_shares c on c.id = r.share_id');
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select _sel('d2',      'select public.community_maps(null, ''reused'')::text');
select _sel('s_kansai', format('select public.shared_collection(%L)::text', _tok('kansai')));
select _sel('s_home',   format('select public.shared_collection(%L)::text', _tok('home_tok')));
reset role;

select is((_tok('b_copy1')::jsonb) ->> 'collection', 'Our Kansai', 'B keeps a copy, filed where B said');
select is(_tok('b_rcpt'), '1|Our Kansai', 'two copies leave ONE receipt — B''s own row, saying where it was filed');
select is(_tok('b_list'), 'Kansai field trip', 'B''s listing names the collection it was started from');
select is((select reused_count from public.collection_shares where token = _tok('kansai')),
          (select count(*)::int from public.collection_copies k join public.collection_shares c on c.id = k.share_id where c.token = _tok('kansai')),
          'reused_count is the number of receipts — kept by the receipts themselves (two copies, one receipt, one count)');
select is(_tok('b_hlist'), '<none>', 'a collection started from an UNLISTED one names nothing');
select is(_tok('a_rcpt'), '0', 'A cannot read B''s receipt');
select is((select count(*)::text from public.collection_copies k join public.collection_shares c on c.id = k.share_id
            where c.token = _tok('kansai')), '1', 'A copying A''s own collection is not reuse — no receipt');
select is(_tok('a_reach'), 'Europe 1914:0/0,Home:1/1,Kansai:1/1', 'A reads the reach of each published collection: counts, never who');
select is((select e ->> 'title' from jsonb_array_elements((_tok('d2')::jsonb) -> 'items') with ordinality x(e, i) where i = 1), 'Kansai field trip',
          'sorted by reuse, the collection others kept comes first');
select is((select (e ->> 'reused') || '/' || (e ->> 'derived') from jsonb_array_elements((_tok('d2')::jsonb) -> 'items') e where e ->> 'title' = 'Kansai field trip'),
          '1/1', 'the directory shows one account kept it and one listing was started from it');
select is((select (e -> 'based_on' ->> 'title') || '|' || (e -> 'based_on' ->> 'author') || '|' || (e -> 'based_on' ->> 'token')
             from jsonb_array_elements((_tok('d2')::jsonb) -> 'items') e where e ->> 'title' = 'Our Kansai'),
          'Kansai field trip|Ms A|' || _tok('kansai'), 'B''s entry links to A''s listed original');
select is((select e -> 'based_on' from jsonb_array_elements((_tok('d2')::jsonb) -> 'items') e where e ->> 'title' = 'Home copy'), 'null'::jsonb,
          'the copy of an unlisted collection does not disclose its link');
select ok(position(_tok('home_tok') in _tok('d2')) = 0, 'the unlisted link appears nowhere in the directory');
select is((_tok('s_kansai')::jsonb) -> 'listing' ->> 'author', 'Ms A', 'the collection''s own page carries its listing');
select is((_tok('s_kansai')::jsonb) -> 'listing' ->> 'reused', '1', '…and its reuse');
select is((_tok('s_home')::jsonb) -> 'listing', 'null'::jsonb, 'a link-only collection carries no listing');
select is(jsonb_array_length((_tok('s_kansai')::jsonb) -> 'places'), 2, 'the public read is otherwise unchanged');

-- ─────────────────────────────────────────────────────────────────────────────
--  6. REPORTS AND MODERATION
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select _sel('r1',      format('select created::text from public.report_community_map(%L, ''misleading'', ''The castle is not in Kyoto'')', _tok('kansai')));
select _sel('r2',      format('select created::text from public.report_community_map(%L, ''spam'', ''changed my mind'')', _tok('kansai')));
select _sel('r_bad',   format('select created::text from public.report_community_map(%L, ''ugly'')', _tok('kansai')));
select _sel('r_home',  format('select created::text from public.report_community_map(%L, ''spam'')', _tok('home_tok')));
select _sel('r_mine',  'select count(*)::text || ''|'' || min(reason) from public.community_map_reports');
select _sel('r_queue', 'select public.community_map_reports_admin()::text');
select _sel('r_mod',   format('select public.moderate_community_map(%L, ''hide'', ''x'')::text', _tok('kansai')));
select _run('r_upd',   'update public.community_map_reports set status = ''dismissed''');
reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _sel('r_own',   format('select created::text from public.report_community_map(%L, ''spam'')', _tok('kansai')));
select _sel('r_aread', 'select count(*)::text from public.community_map_reports');
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select _sel('r_anon',  format('select created::text from public.report_community_map(%L, ''spam'')', _tok('kansai')));
reset role;

select is(_tok('r1'),     'true',      'a signed-in reader reports a listed collection');
select is(_tok('r2'),     'false',     'reporting again updates the one report');
select is(_tok('r_bad'),  'ERR:23514', 'an invented reason is refused');
select is(_tok('r_home'), 'ERR:P0002', 'a link-only collection is not reported here');
select is(_tok('r_mine'), '1|spam',    'the reporter reads their own report, as updated');
select is(_tok('r_queue'), 'DENIED', 'a non-admin cannot read the queue');
select is(_tok('r_mod'),   'DENIED', 'a non-admin cannot moderate');
select is(_tok('r_upd'),   'DENIED',    'a report''s status is not written directly');
select is(_tok('r_own'),   'ERR:22023', 'the owner cannot report their own collection');
select is(_tok('r_aread'), '0',         'the owner never reads who reported them');
select is(_tok('r_anon'),  'DENIED',    'anon cannot report');

select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select _sel('q',        'select public.community_map_reports_admin()::text');
select _sel('m_noreason', format('select public.moderate_community_map(%L, ''hide'', ''  '')::text', _tok('kansai')));
select _sel('m_badact', format('select public.moderate_community_map(%L, ''delete'')::text', _tok('kansai')));
select _sel('m_hide',   format('select public.moderate_community_map(%L, ''hide'', ''Misleading places'')::text', _tok('kansai')));
select _sel('q2',       'select public.community_map_reports_admin()::text');
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select _sel('h_dir',    'select public.community_maps()::text');
select _sel('h_link',   format('select public.shared_collection(%L)::text', _tok('kansai')));
reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _sel('h_relist', 'select token from public.list_community_map(''Kansai'', ''Ms A'')');
select _sel('h_seen',   'select reason from public.community_map_holds where collection = ''Kansai''');
reset role;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select _sel('m_restore', format('select public.moderate_community_map(%L, ''restore'')::text', _tok('kansai')));
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select _sel('r_dir',    'select public.community_maps()::text');
reset role;

select is(jsonb_array_length(_tok('q')::jsonb), 1, 'the administrator reads the queue: one reported collection');
select is((_tok('q')::jsonb) -> 0 ->> 'open', '1', 'with one open report');
select is((select string_agg(k, ',' order by k) from jsonb_array_elements((_tok('q')::jsonb) -> 0 -> 'reasons') e, jsonb_object_keys(e) k),
          'at,note,reason,status', 'each report is its reason, note, status and time — never who sent it');
select is(_tok('m_noreason'), 'ERR:22023', 'hiding needs a reason the owner will read');
select is(_tok('m_badact'),   'ERR:22023', 'the actions are hide, restore and dismiss');
select is((_tok('m_hide')::jsonb) ->> 'ok', 'true', 'the administrator hides it');
select is((_tok('q2')::jsonb) -> 0 ->> 'open', '0', 'its open report is settled (actioned)');
select ok(position('Kansai field trip' in (select string_agg(e ->> 'title', ',') from jsonb_array_elements((_tok('h_dir')::jsonb) -> 'items') e)) = 0,
          'a hidden collection is out of the directory');
select is((select e -> 'based_on' from jsonb_array_elements((_tok('h_dir')::jsonb) -> 'items') e where e ->> 'title' = 'Our Kansai'), 'null'::jsonb,
          '…and a listing started from it no longer links to it');
select is((_tok('h_link')::jsonb) ->> 'ok', 'true', 'its link — the owner''s own distribution — still opens');
select is((_tok('h_link')::jsonb) -> 'listing', 'null'::jsonb, '…without a listing');
select is(_tok('h_relist'), 'ERR:55000', 'the owner cannot list a hidden collection again');
select is(_tok('h_seen'),   'Misleading places', 'the owner reads why it was hidden');
select is((_tok('m_restore')::jsonb) ->> 'ok', 'true', 'the administrator restores it');
select is(jsonb_array_length((_tok('r_dir')::jsonb) -> 'items'), 4, 'restored, it is back in the directory');

-- ─────────────────────────────────────────────────────────────────────────────
--  7. UNPUBLISHING, THE EXPORT
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select _sel('exp_b', 'select public.export_account_data()::text');
reset role;
select is((_tok('exp_b')::jsonb) -> 'counts' ->> 'collection_copies',     '2', 'the export carries B''s copy receipts');
select is((_tok('exp_b')::jsonb) -> 'counts' ->> 'community_map_reports', '1', 'the export carries B''s report');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _run('unpub', 'delete from public.collection_shares where collection = ''Kansai''');
reset role;
select is(_tok('unpub'), 'ROWS:1', 'A unpublishes Kansai');
select is((select count(*)::int from public.collection_copies k join public.collection_shares c on c.id = k.share_id where c.user_id = '11111111-1111-1111-1111-111111111111' and c.collection = 'Kansai'), 0,
          'its receipts go with it');
select is((select count(*)::int from public.community_map_reports r join public.community_map_subjects s on s.id = r.subject_id
             where s.owner = '11111111-1111-1111-1111-111111111111' and s.collection = 'Kansai'), 1,
          'B''s report on Kansai survives the owner unpublishing it — it is on the collection, not the share row');
select is((select derived_from::text from public.collection_shares where collection = 'Our Kansai'), null, 'the lineage to it is cut');

-- ─────────────────────────────────────────────────────────────────────────────
--  6b. THE HOLD SURVIVES UNPUBLISHING (A: held, delete the share, publish again, list again)
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select _sel('x_hide',  format('select public.moderate_community_map(%L, ''hide'', ''Deliberately misleading'')::text', _tok('l_europe')));
reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _run('x_unpub',  'delete from public.collection_shares where collection = ''Europe 1914''');
select _sel('x_repub',  'select token from public.publish_collection(''Europe 1914'', ''Europe 1914 (again)'')');
select _sel('x_relist', 'select token from public.list_community_map(''Europe 1914'', ''Ms A'')');
select _sel('x_seen',   'select count(*)::text from public.community_map_holds');
select _sel('x_exp',    'select public.export_account_data()::text');
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select _sel('x_dir',  'select public.community_maps(''Europe'')::text');
select _sel('x_read', format('select public.shared_collection(%L)::text', _tok('x_repub')));
reset role;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select _sel('x_q', 'select public.community_map_reports_admin()::text');
reset role;
select is((_tok('x_hide')::jsonb) ->> 'ok', 'true', 'the administrator holds Europe 1914 (by its token)');
select is(_tok('x_unpub'), 'ROWS:1', 'the owner deletes the share row (unpublishes)');
select ok(_tok('x_repub') ~ '^[0-9a-f]{32}$' and _tok('x_repub') <> _tok('l_europe'), 'and publishes again: a new share row, a new link');
select is(_tok('x_relist'), 'ERR:55000', 'the hold is on the collection: listing it again under the new share row is refused');
select is(_tok('x_seen'),   '1', 'the owner still reads the hold and its reason');
select is((_tok('x_exp')::jsonb) -> 'counts' ->> 'community_map_holds', '1', 'the hold is in the owner''s export');
select is(jsonb_array_length((_tok('x_dir')::jsonb) -> 'items'), 0, 'the held collection is in no page of the directory');
select is((_tok('x_read')::jsonb) ->> 'ok', 'true', 'its new link opens — the owner''s own distribution');
select is((_tok('x_read')::jsonb) -> 'listing', 'null'::jsonb, '…without a listing');
select is((select e ->> 'hidden_reason' from jsonb_array_elements(_tok('x_q')::jsonb) e where e ->> 'title' like 'Europe 1914%'), 'Deliberately misleading',
          'the queue names the held collection after its share row was replaced');
insert into _cap values ('x_ref', (select e ->> 'ref' from jsonb_array_elements((_tok('x_q'))::jsonb) e where e ->> 'title' like 'Kansai%'));
select ok((select (e ->> 'published')::boolean = false and (e ->> 'open')::int = 0 and (e ->> 'total')::int = 1
             from jsonb_array_elements(_tok('x_q')::jsonb) e where e ->> 'title' like 'Kansai%'),
          'Kansai — unpublished — is still in the queue under its last title, with its report');
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select _sel('x_hide2', format('select public.moderate_community_map(%L, ''hide'', ''Held while unpublished'')::text', _tok('x_ref')));
reset role;
select is((_tok('x_hide2')::jsonb) ->> 'ok', 'true', 'a collection with no share row is moderated through its queue ref');
select is((select count(*)::int from public.community_map_holds where user_id = '11111111-1111-1111-1111-111111111111' and collection = 'Kansai'), 1,
          '…and the hold waits for it to be published again');
select is((select public.purge_community_map_reports()), 0, 'the purge keeps open and recent reports, the holds and the subjects they name');

select * from finish();
rollback;
