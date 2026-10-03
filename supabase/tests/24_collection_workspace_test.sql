-- ============================================================================
--  pgTAP · 24 — collection-workspace: saved maps, and the read-only link the owner chooses to publish.
--    ① saved_views: save_view() is the only door in; the same map (the same share-link fragment, with or
--      without its '#') is ONE row (created=false); a string that names no view is refused; the owner reads,
--      renames and deletes their own rows and nobody else's; no direct INSERT, no user_id rewrite; the fence
--      (saved_views_limit) refuses with 54000.
--    ② collection_shares: publish_collection() is the only door in; one share per (account, collection) —
--      publishing again answers with the SAME token (created=false); an empty collection is refused (22023);
--      the owner may retitle (and only retitle) and delete (= unpublish) their own share; nobody else sees it.
--    ③ THE PUBLIC READ: anon reads a published collection through shared_collection(token) only — the
--      collection's own places and maps, as they are now, with no id, account or e-mail; a token that is not
--      published (never was, malformed, or unpublished) is {ok:false,error:'not_found'}.
--    ④ copy_shared_collection(): a signed-in reader copies a published collection into their OWN account
--      (filed under its title, source 'shared'); a second copy adds nothing and says what was already held;
--      anon cannot copy.
--    ⑤ both tables are reached by the account export and by account deletion with no list naming them.
--  supabase/migrations/20261003211500_collection_workspace.sql.
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
--  1. THE TABLES
-- ─────────────────────────────────────────────────────────────────────────────
select has_table('public', 'saved_views',       'saved_views exists');
select has_table('public', 'collection_shares', 'collection_shares exists');
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname = 'saved_views'), 'RLS is on for saved_views');
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname = 'collection_shares'), 'RLS is on for collection_shares');
select ok((select count(*) = 2 from public.account_data_catalog where tbl in ('saved_views', 'collection_shares')),
          'both tables carry their sentence in the account''s data catalogue');

-- ─────────────────────────────────────────────────────────────────────────────
--  2. SAVED MAPS — the one door in, the owner's own rows
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _sel('v_new',    'select created::text || ''/'' || view_count from public.save_view(''Europe 1914'', ''v=10.0000,50.0000,4.00,0,0,f&l=dl-ww1&tt=1914-07-28'', ''for Thursday'', ''Field trip'')');
select _sel('v_again',  'select created::text || ''/'' || view_count from public.save_view(''Europe, July 1914'', ''#v=10.0000,50.0000,4.00,0,0,f&l=dl-ww1&tt=1914-07-28'')');
select _sel('v_kept',   'select name || ''|'' || note || ''|'' || collection from public.saved_views');
select _sel('v_notmap', 'select created::text from public.save_view(''Not a map'', ''l=dl-ww1'')');
select _sel('v_noname', 'select created::text from public.save_view(''  '', ''v=1,1,1,0,0,f'')');
select _run('v_ins',    'insert into public.saved_views (user_id, name, state) values (''11111111-1111-1111-1111-111111111111'', ''forged'', ''v=1,1,1,0,0,f'')');
select _run('v_upd',    'update public.saved_views set note = ''bring the handout''');
select _run('v_steal',  'update public.saved_views set user_id = ''22222222-2222-2222-2222-222222222222''');
select _run('v_state',  'update public.saved_views set state = ''v=0,0,1,0,0,f''');
reset role;

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select _sel('vb_sees', 'select count(*)::text from public.saved_views');
select _run('vb_upd',  'update public.saved_views set name = ''hijacked''');
select _run('vb_del',  'delete from public.saved_views');
reset role;

select is(_tok('v_new'),    'true/1',   'the first save of a map creates it');
select is(_tok('v_again'),  'false/1',  'the same map again (with its #) is the same row — not created, no duplicate');
select is(_tok('v_kept'),   'Europe, July 1914|for Thursday|Field trip', 'a re-save renames and keeps what it was not given');
select is(_tok('v_notmap'), 'ERR:22023', 'a fragment that names no view is not a map');
select is(_tok('v_noname'), 'ERR:22023', 'a map needs a name');
select is(_tok('v_ins'),    'DENIED',   'no direct INSERT: save_view() is the only door in');
select is(_tok('v_upd'),    'ROWS:1',   'the owner edits a note');
select is(_tok('v_steal'),  'DENIED',   'the owner cannot hand a map to another account');
select is(_tok('v_state'),  'DENIED',   'the map itself is not rewritten in place (save another)');
select is(_tok('vb_sees'),  '0',        'B sees none of A''s maps');
select is(_tok('vb_upd'),   'ROWS:0',   'B cannot rename A''s maps');
select is(_tok('vb_del'),   'ROWS:0',   'B cannot delete A''s maps');

-- ─────────────────────────────────────────────────────────────────────────────
--  3. PUBLISHING
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _sel('p1', 'select created::text from public.save_place(''Kyoto Station'', 135.75875, 34.98559, ''meet here'', ''Field trip'')');
select _sel('p2', 'select created::text from public.save_place(''Osaka Castle'',  135.52583, 34.68731, null, ''Field trip'')');
select _sel('p3', 'select created::text from public.save_place(''Home'',          139.69171, 35.68950, ''private note'', ''Home'')');
select _sel('tok',       'select token from public.publish_collection(''Field trip'', ''Kansai field trip'')');
select _sel('pub_count', 'select place_count || ''/'' || view_count from public.publish_collection(''Field trip'')');
select _sel('tok_again', 'select token || ''|'' || created::text from public.publish_collection(''Field trip'')');
select _sel('tok_title', 'select title from public.collection_shares where collection = ''Field trip''');
select _sel('tok_all',   'select token from public.publish_collection(null, ''Everything'')');
select _sel('pub_empty', 'select token from public.publish_collection(''Nothing here'')');
select _run('sh_ins',    'insert into public.collection_shares (user_id, collection, title) values (''11111111-1111-1111-1111-111111111111'', ''Home'', ''forged'')');
select _run('sh_title',  'update public.collection_shares set title = ''Kansai trip (Oct)'' where collection = ''Field trip''');
select _run('sh_token',  'update public.collection_shares set token = ''00000000000000000000000000000000''');
select _run('sh_coll',   'update public.collection_shares set collection = ''Home''');
reset role;

select ok(_tok('tok') ~ '^[0-9a-f]{32}$', 'publishing returns a 32-hex token');
select is(_tok('pub_count'), '2/1',  'the collection published holds its 2 places and 1 map');
select is(_tok('tok_again'), _tok('tok') || '|false', 'publishing a published collection answers with the SAME link (created=false)');
select is(_tok('tok_title'), 'Kansai field trip', 'publishing again without a title keeps the title');
select ok(_tok('tok_all') ~ '^[0-9a-f]{32}$' and _tok('tok_all') <> _tok('tok'), '«everything» is its own share with its own link');
select is(_tok('pub_empty'), 'ERR:22023', 'an empty collection is not published');
select is(_tok('sh_ins'),    'DENIED', 'no direct INSERT: publish_collection() is the only door in');
select is(_tok('sh_title'),  'ROWS:1', 'the owner retitles their share');
select is(_tok('sh_token'),  'DENIED', 'the token is the database''s');
select is(_tok('sh_coll'),   'DENIED', 'a share cannot be pointed at another collection');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select _sel('b_shares', 'select count(*)::text from public.collection_shares');
select _run('b_unpub',  'delete from public.collection_shares');
reset role;
select is(_tok('b_shares'), '0',      'B sees none of A''s shares');
select is(_tok('b_unpub'),  'ROWS:0', 'B cannot unpublish A''s collection');

-- ─────────────────────────────────────────────────────────────────────────────
--  4. THE PUBLIC READ (anon)
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select _sel('anon_read',  format('select public.shared_collection(%L)::text', _tok('tok')));
select _sel('anon_all',   format('select public.shared_collection(%L)::text', _tok('tok_all')));
select _sel('anon_bad',   'select public.shared_collection(''not-a-token'')::text');
select _sel('anon_none',  'select public.shared_collection(''0123456789abcdef0123456789abcdef'')::text');
select _sel('anon_views', 'select count(*)::text from public.saved_views');
select _sel('anon_sh',    'select count(*)::text from public.collection_shares');
select _sel('anon_save',  'select created::text from public.save_view(''x'', ''v=1,1,1,0,0,f'')');
select _sel('anon_pub',   'select token from public.publish_collection(null)');
select _sel('anon_copy',  format('select public.copy_shared_collection(%L)::text', _tok('tok')));
reset role;

select is((_tok('anon_read')::jsonb) ->> 'ok', 'true', 'anon reads a published collection by its link');
select is((_tok('anon_read')::jsonb) ->> 'title', 'Kansai trip (Oct)', 'with its title as the owner set it now');
select is(jsonb_array_length((_tok('anon_read')::jsonb) -> 'places'), 2, 'its places — only the collection''s own (Home is not in it)');
select is(jsonb_array_length((_tok('anon_read')::jsonb) -> 'views'),  1, 'and its map');
select is((select e ->> 'note' from jsonb_array_elements((_tok('anon_read')::jsonb) -> 'places') e where e ->> 'name' = 'Kyoto Station'), 'meet here', 'with the notes the owner filed');
select is((_tok('anon_read')::jsonb) -> 'views' -> 0 ->> 'state', 'v=10.0000,50.0000,4.00,0,0,f&l=dl-ww1&tt=1914-07-28', 'the map travels as the share-link fragment');
select ok(position('11111111-1111-1111-1111-111111111111' in _tok('anon_read')) = 0, 'no account id in the public read');
select ok(position('a@intmap.test' in _tok('anon_read')) = 0 and position('"id"' in _tok('anon_read')) = 0, 'no e-mail and no row id in the public read');
select is(jsonb_array_length((_tok('anon_all')::jsonb) -> 'places'), 3, '«everything» carries every place, Home included — that is what the owner published');
select is(_tok('anon_bad'),  '{"ok": false, "error": "not_found"}', 'a malformed token reads nothing');
select is(_tok('anon_none'), '{"ok": false, "error": "not_found"}', 'a token that was never published reads nothing');
select is(_tok('anon_views'), 'DENIED', 'anon holds no SELECT on saved_views');
select is(_tok('anon_sh'),    'DENIED', 'anon holds no SELECT on collection_shares (the tokens are not listable)');
select is(_tok('anon_save'),  'DENIED', 'anon cannot save a map');
select is(_tok('anon_pub'),   'DENIED', 'anon cannot publish');
select is(_tok('anon_copy'),  'DENIED', 'anon cannot copy a collection');

-- ─────────────────────────────────────────────────────────────────────────────
--  5. COPYING A PUBLISHED COLLECTION INTO ONE'S OWN ACCOUNT (B)
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select _sel('b_pre',   'select created::text from public.save_place(''My Kyoto Station'', 135.75875, 34.98559)');
select _sel('b_copy1', format('select public.copy_shared_collection(%L)::text', _tok('tok')));
select _sel('b_copy2', format('select public.copy_shared_collection(%L, ''Kansai'')::text', _tok('tok')));
select _sel('b_rows',  'select string_agg(name || ''@'' || collection || ''@'' || source, '','' order by name) from public.saved_places');
select _sel('b_views', 'select string_agg(name || ''@'' || collection, '','') from public.saved_views');
select _sel('b_none',  'select public.copy_shared_collection(''0123456789abcdef0123456789abcdef'')::text');
reset role;
select is((_tok('b_copy1')::jsonb) ->> 'places_added', '1', 'the copy adds the place B did not hold');
select is((_tok('b_copy1')::jsonb) ->> 'places_had',   '1', '…and counts the one B already held at that position');
select is((_tok('b_copy1')::jsonb) ->> 'views_added',  '1', 'the map is copied');
select is((_tok('b_copy1')::jsonb) ->> 'collection',   'Kansai trip (Oct)', 'filed under the collection''s title');
select is((_tok('b_copy2')::jsonb) ->> 'places_added', '0', 'copying again adds nothing');
select is((_tok('b_copy2')::jsonb) ->> 'views_had',    '1', '…and says the map is already held');
select is(_tok('b_rows'), 'My Kyoto Station@@reader,Osaka Castle@Kansai trip (Oct)@shared', 'B''s own place is untouched; the copied one says where it came from');
select is(_tok('b_views'), 'Europe, July 1914@Kansai trip (Oct)', 'B now holds the map in their own account');
select is(_tok('b_none'), '{"ok": false, "error": "not_found"}', 'an unknown link copies nothing');
select is((select count(*)::int from public.saved_places where user_id = '11111111-1111-1111-1111-111111111111'), 3, 'A''s places are unchanged by B''s copy');

-- ─────────────────────────────────────────────────────────────────────────────
--  6. UNPUBLISHING — the owner's DELETE; the link stops answering at once
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _run('unpub', 'delete from public.collection_shares where collection = ''Field trip''');
select _sel('tok_new', 'select token from public.publish_collection(''Field trip'')');
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select _sel('anon_gone', format('select public.shared_collection(%L)::text', _tok('tok')));
reset role;
select is(_tok('unpub'), 'ROWS:1', 'the owner unpublishes');
select is(_tok('anon_gone'), '{"ok": false, "error": "not_found"}', 'an unpublished link reads nothing');
select ok(_tok('tok_new') ~ '^[0-9a-f]{32}$' and _tok('tok_new') <> _tok('tok'), 'publishing again mints a new link — the old one is never revived');

-- ─────────────────────────────────────────────────────────────────────────────
--  7. THE FENCE ON MAPS
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.saved_views (user_id, name, state)
  select '11111111-1111-1111-1111-111111111111', 'filler ' || g, 'v=' || g || ',0,1,0,0,f'
    from generate_series(1, public.saved_views_limit() - 1) g;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _sel('v_full',   'select created::text from public.save_view(''One too many'', ''v=999,1,1,0,0,f'')');
select _sel('v_resave', 'select created::text from public.save_view(''Europe 1914'', ''v=10.0000,50.0000,4.00,0,0,f&l=dl-ww1&tt=1914-07-28'')');
reset role;
select is(_tok('v_full'),   'ERR:54000', 'at saved_views_limit() a new map is refused, and says which fence');
select is(_tok('v_resave'), 'false',     'a full account can still rename a map it already holds');
delete from public.saved_views where name like 'filler %';

-- ─────────────────────────────────────────────────────────────────────────────
--  8. THE EXPORT AND ACCOUNT DELETION REACH BOTH TABLES WITH NO LIST NAMING THEM
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _sel('exp_a', 'select public.export_account_data()::text');
reset role;
select is((_tok('exp_a')::jsonb) -> 'counts' ->> 'saved_views',       '1', 'the export carries A''s saved map');
select is((_tok('exp_a')::jsonb) -> 'counts' ->> 'collection_shares', '2', 'the export carries A''s published collections');
select ok(((_tok('exp_a')::jsonb) -> 'catalog' -> 'collection_shares' ->> 'label_jp') is not null, 'and explains them in the reader''s words');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select _sel('del_a', 'select public.delete_account_data(''11111111-1111-1111-1111-111111111111'')::text');
reset role;
select is((_tok('del_a')::jsonb) -> 'tables' ->> 'saved_views',       '1', 'account deletion removes the saved map');
select is((_tok('del_a')::jsonb) -> 'tables' ->> 'collection_shares', '2', 'account deletion removes the published collections');
select is((select count(*)::int from public.collection_shares where token = _tok('tok_new')), 0, 'and with them every link the account published');

-- ─────────────────────────────────────────────────────────────────────────────
--  9. GRANTS
-- ─────────────────────────────────────────────────────────────────────────────
select ok(not has_table_privilege('authenticated', 'public.saved_views', 'insert'),         'authenticated holds no INSERT on saved_views');
select ok(not has_table_privilege('authenticated', 'public.collection_shares', 'insert'),   'authenticated holds no INSERT on collection_shares');
select ok(not has_table_privilege('authenticated', 'public.saved_views', 'truncate'),       'no TRUNCATE on saved_views (TRUNCATE ignores RLS)');
select ok(not has_table_privilege('authenticated', 'public.collection_shares', 'truncate'), 'no TRUNCATE on collection_shares');
select ok(not has_table_privilege('anon', 'public.collection_shares', 'select'),            'anon cannot list shares (tokens are never enumerable)');
select ok(    has_function_privilege('anon', 'public.shared_collection(text)', 'execute'),  'anon may read a published collection by its token');
select ok(obj_description('public.shared_collection(text)'::regprocedure, 'pg_proc') ~ 'ANON MAY CALL: \S', 'and the function states why');
select ok(not has_function_privilege('anon', 'public.publish_collection(text, text)', 'execute'),     'anon cannot execute publish_collection');
select ok(not has_function_privilege('anon', 'public.copy_shared_collection(text, text)', 'execute'), 'anon cannot execute copy_shared_collection');
select ok(not has_function_privilege('anon', 'public.save_view(text, text, text, text)', 'execute'),  'anon cannot execute save_view');

select * from finish();
rollback;
