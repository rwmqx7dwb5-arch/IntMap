-- ============================================================================
--  pgTAP · 29 — map-document-unify: a saved map is a map document (a map, a reader's own map, a tour, an Atlas answer).
--    ① the columns: kind (view|map|tour|brief), steps (NULL or a list of at most saved_view_steps_limit() steps,
--      ≤ 1 MiB), doc_md5 (= state_md5 when steps is NULL); one row per (account, document); the old one-row-per-
--      fragment constraint is gone.
--    ② a map saved through the four-argument door is what it always was: steps NULL, its identity its fragment,
--      saved twice one row; a fragment that carries a drawing (mm=) is kind 'map'.
--    ③ a tour through the six-argument door: its steps kept as {state,title,say,ask} only, each '#' dropped; saved
--      again one row; a second tour on the same first map is a second document; what a step may be is refused by name.
--    ④ kind and steps are not rewritten in place (the owner re-saves), and nobody else sees them.
--    ⑤ a published collection carries each map's kind and steps to anon; a copy keeps them, and copying twice is once.
--  supabase/migrations/20261004120000_map_documents.sql.
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
--  1. THE COLUMNS AND THE IDENTITY
-- ─────────────────────────────────────────────────────────────────────────────
select has_column('public', 'saved_views', 'kind',    'saved_views.kind exists');
select has_column('public', 'saved_views', 'steps',   'saved_views.steps exists');
select has_column('public', 'saved_views', 'doc_md5', 'saved_views.doc_md5 exists');
select is(public.saved_view_steps_limit(), 200, 'the fence on a document''s steps is 200 (js/map-doc.js STEPS_MAX reads the same number)');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.saved_views'::regclass and conname = 'saved_views_one_per_document' and contype = 'u'),
          'one row per (account, document)');
select ok(not exists (select 1 from pg_constraint con where con.conrelid = 'public.saved_views'::regclass and con.contype = 'u'
                        and (select array_agg(a.attname::text order by a.attname) from unnest(con.conkey) k join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k) = array['state_md5', 'user_id']),
          'the one-row-per-fragment constraint is gone (a tour may start on a map that is saved on its own)');

-- ─────────────────────────────────────────────────────────────────────────────
--  2. ONE MAP — THE FOUR-ARGUMENT DOOR, AS BEFORE
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _sel('m_new',   'select created::text from public.save_view(''Europe 1914'', ''v=10.0000,50.0000,4.00,0,0,f&tt=1914-07-28'', null, ''Class'')');
select _sel('m_again', 'select created::text || ''/'' || view_count from public.save_view(''Europe 1914'', ''#v=10.0000,50.0000,4.00,0,0,f&tt=1914-07-28'')');
select _sel('m_row',   'select kind || ''|'' || coalesce(steps::text, ''NULL'') || ''|'' || (doc_md5 = state_md5)::text from public.saved_views where name = ''Europe 1914''');
select _sel('mm_save', 'select created::text from public.save_view(''Our route'', ''v=135.0000,35.0000,8.00,0,0,f&mm=eyJ2IjoxfQ'')');
select _sel('mm_kind', 'select kind from public.saved_views where name = ''Our route''');
reset role;
select is(_tok('m_new'),   'true',          'a map saved through the four-argument door is created');
select is(_tok('m_again'), 'false/1',       'the same map again (with its #) is the same row');
select is(_tok('m_row'),   'view|NULL|true', 'a one-map row has no steps, and its identity is its fragment as before');
select is(_tok('mm_kind'), 'map',           'a fragment that carries a reader''s drawing (mm=) is a «my map»');

-- ─────────────────────────────────────────────────────────────────────────────
--  3. A TOUR — THE SIX-ARGUMENT DOOR
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _sel('t_new', $q$select created::text || '/' || view_count from public.save_view('Meiji Japan', 'v=136.5000,36.0000,5.00,0,0,f&tt=1868-11-01', 'three steps', 'Class', 'tour',
  '[{"state":"#v=136.5000,36.0000,5.00,0,0,f&tt=1868-11-01","title":"1868","say":"provinces","ask":"which?","extra":"dropped"},
    {"state":"","title":"set later","say":"","ask":""},
    {"state":"v=136.5000,36.0000,5.00,0,0,f&tt=1900-01-01","title":"1900"}]'::jsonb)$q$);
select _sel('t_steps', $q$select steps::text from public.saved_views where name = 'Meiji Japan'$q$);
select _sel('t_kind',  $q$select kind || '|' || state from public.saved_views where name = 'Meiji Japan'$q$);
select _sel('t_again', $q$select created::text from public.save_view('Meiji Japan (renamed)', 'v=136.5000,36.0000,5.00,0,0,f&tt=1868-11-01', null, null, null,
  '[{"state":"v=136.5000,36.0000,5.00,0,0,f&tt=1868-11-01","title":"1868","say":"provinces","ask":"which?"},
    {"state":"","title":"set later","say":"","ask":""},
    {"state":"v=136.5000,36.0000,5.00,0,0,f&tt=1900-01-01","title":"1900","say":"","ask":""}]'::jsonb)$q$);
select _sel('t_same1', $q$select created::text from public.save_view('Another lesson', 'v=10.0000,50.0000,4.00,0,0,f&tt=1914-07-28', null, 'Class', 'tour',
  '[{"state":"v=10.0000,50.0000,4.00,0,0,f&tt=1914-07-28","title":"1914"},{"state":"v=10.0000,50.0000,4.00,0,0,f&tt=1918-11-11","title":"1918"}]'::jsonb)$q$);
select _sel('t_brief_save', $q$select created::text from public.save_view('What is here?', 'v=1.0000,2.0000,3.00,0,0,g', null, null, 'brief',
  '[{"state":"v=1.0000,2.0000,3.00,0,0,g","title":"What is here?","say":"An answer.","ask":""}]'::jsonb)$q$);
select _sel('t_brief', $q$select kind || '|' || jsonb_array_length(steps) from public.saved_views where name = 'What is here?'$q$);
select _sel('t_mismatch', $q$select created::text from public.save_view('x', 'v=1,1,1,0,0,f', null, null, 'tour', '[{"state":"v=2,2,2,0,0,f"},{"state":"v=1,1,1,0,0,f"}]'::jsonb)$q$);
select _sel('t_badkind',  $q$select created::text from public.save_view('x', 'v=1,1,1,0,0,f', null, null, 'story', null)$q$);
select _sel('t_notlist',  $q$select created::text from public.save_view('x', 'v=1,1,1,0,0,f', null, null, null, '{"state":"v=1,1,1,0,0,f"}'::jsonb)$q$);
select _sel('t_empty',    $q$select created::text from public.save_view('x', 'v=1,1,1,0,0,f', null, null, null, '[]'::jsonb)$q$);
select _sel('t_nonstr',   $q$select created::text from public.save_view('x', 'v=1,1,1,0,0,f', null, null, null, '[{"state":"v=1,1,1,0,0,f","title":7}]'::jsonb)$q$);
select _sel('t_notmap',   $q$select created::text from public.save_view('x', 'v=1,1,1,0,0,f', null, null, null, '[{"state":"v=1,1,1,0,0,f"},{"state":"javascript:alert(1)"}]'::jsonb)$q$);
select _sel('t_toomany',  $q$select created::text from public.save_view('x', 'v=1,1,1,0,0,f', null, null, 'tour',
  (select jsonb_agg(jsonb_build_object('state', 'v=1,1,1,0,0,f')) from generate_series(1, public.saved_view_steps_limit() + 1)))$q$);
select _run('t_upd_kind',  $q$update public.saved_views set kind = 'view' where name like 'Meiji%'$q$);
select _run('t_upd_steps', $q$update public.saved_views set steps = null where name like 'Meiji%'$q$);
reset role;

select is(_tok('t_new'), 'true/3', 'a tour is saved as one row');
select is(_tok('t_steps'),
  '[{"ask": "which?", "say": "provinces", "state": "v=136.5000,36.0000,5.00,0,0,f&tt=1868-11-01", "title": "1868"}, {"ask": "", "say": "", "state": "", "title": "set later"}, {"ask": "", "say": "", "state": "v=136.5000,36.0000,5.00,0,0,f&tt=1900-01-01", "title": "1900"}]',
  'its steps are kept as {state,title,say,ask} only — a field nobody declared is not stored, a # is dropped, an absent word is ''''');
select is(_tok('t_kind'),  'tour|v=136.5000,36.0000,5.00,0,0,f&tt=1868-11-01', 'its kind is tour, and its row''s map is its first step''s map');
select is(_tok('t_again'), 'false', 'the same tour again is the same row (renamed; its kind kept)');
select is(_tok('t_same1'), 'true',  'a tour that starts on a map saved on its own is a second document, not that map');
select is(_tok('t_brief'), 'brief|1', 'an Atlas answer is kept with its words as a one-step document');
select is(_tok('t_mismatch'), 'ERR:22023', 'the row''s map must be the first step''s map');
select is(_tok('t_badkind'),  'ERR:22023', 'a kind that is not one of the four is refused');
select is(_tok('t_notlist'),  'ERR:22023', 'steps that are not a list are refused');
select is(_tok('t_empty'),    'ERR:22023', 'an empty list of steps is refused (no steps is NULL)');
select is(_tok('t_nonstr'),   'ERR:22023', 'a step''s words are strings');
select is(_tok('t_notmap'),   'ERR:22023', 'a step''s map is a map link or nothing');
select is(_tok('t_toomany'),  'ERR:54000', 'past saved_view_steps_limit() a document is refused, and says which fence');
select is(_tok('t_upd_kind'),  'DENIED', 'the kind is not rewritten in place');
select is(_tok('t_upd_steps'), 'DENIED', 'the steps are not rewritten in place (save the document again)');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select _sel('b_sees', $q$select count(*)::text from public.saved_views where steps is not null$q$);
reset role;
select is(_tok('b_sees'), '0', 'B sees none of A''s documents');

-- ─────────────────────────────────────────────────────────────────────────────
--  4. PUBLISHED, READ BY ANYONE WITH THE LINK, AND COPIED
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _sel('tok', $q$select token from public.publish_collection('Class', 'Thursday''s class')$q$);
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select _sel('anon_read', format('select public.shared_collection(%L)::text', _tok('tok')));
reset role;
select is(jsonb_array_length((_tok('anon_read')::jsonb) -> 'views'), 3, 'the published collection holds its map and its two tours (the Atlas answer is filed elsewhere)');
select is((select e ->> 'kind' from jsonb_array_elements((_tok('anon_read')::jsonb) -> 'views') e where e ->> 'name' = 'Meiji Japan (renamed)'), 'tour', 'each map says its kind');
select is((select jsonb_array_length(e -> 'steps') from jsonb_array_elements((_tok('anon_read')::jsonb) -> 'views') e where e ->> 'name' = 'Meiji Japan (renamed)'), 3, 'a tour carries its steps to whoever opens the link');
select is((select jsonb_typeof(e -> 'steps') from jsonb_array_elements((_tok('anon_read')::jsonb) -> 'views') e where e ->> 'name' = 'Europe 1914'), 'null', 'a one-map row carries no steps');
select ok(position('11111111-1111-1111-1111-111111111111' in _tok('anon_read')) = 0 and position('doc_md5' in _tok('anon_read')) = 0, 'no account id and no identity hash in the public read');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select _sel('b_copy1', format('select public.copy_shared_collection(%L)::text', _tok('tok')));
select _sel('b_copy2', format('select public.copy_shared_collection(%L)::text', _tok('tok')));
select _sel('b_tour',  $q$select kind || '|' || jsonb_array_length(steps) from public.saved_views where name = 'Meiji Japan (renamed)'$q$);
reset role;
select is((_tok('b_copy1')::jsonb) ->> 'views_added', '3', 'the copy brings every document of the collection');
select is(_tok('b_tour'), 'tour|3', 'a copied tour keeps its kind and its steps');
select is((_tok('b_copy2')::jsonb) ->> 'views_added', '0', 'copying again adds nothing');
select is((_tok('b_copy2')::jsonb) ->> 'views_had',   '3', '…and says every document is already held');

-- ─────────────────────────────────────────────────────────────────────────────
--  5. GRANTS
-- ─────────────────────────────────────────────────────────────────────────────
select ok(not has_function_privilege('anon', 'public.save_view(text, text, text, text, text, jsonb)', 'execute'), 'anon cannot execute the six-argument save_view');
select ok(    has_function_privilege('authenticated', 'public.save_view(text, text, text, text, text, jsonb)', 'execute'), 'authenticated can');
select ok(not has_column_privilege('authenticated', 'public.saved_views', 'kind',  'update'), 'authenticated holds no UPDATE on kind');
select ok(not has_column_privilege('authenticated', 'public.saved_views', 'steps', 'update'), 'authenticated holds no UPDATE on steps');

select * from finish();
rollback;
