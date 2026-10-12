-- ============================================================================
--  pgTAP · 39 — wave4-education: class sets — a teacher's learn quest whose students' answers reach the teacher.
--    ① both tables exist, RLS is on, the catalogue explains class_sets, the owned-table discovery finds it.
--    ② a teacher makes their OWN set: user_id, code, open and created_at are the database's; kind, seed and n
--      cannot be rewritten afterwards (only open and title); the CHECKs hold the engine's numbers.
--    ③ a student (anon) opens a set by its code and hands in once: the shape of the answers is checked against
--      the set's kind and n, the first hand-in under a name stands, a closed set takes nothing.
--    ④ nobody but the set's teacher reads or deletes its answers — not another teacher, not anon, not by
--      naming set_id; anon touches neither table directly.
--    ⑤ a set takes at most 400 hand-ins; the purge removes sets older than its argument with their answers;
--      account deletion and the export reach class_sets with no list naming it.
--  supabase/migrations/20261013090000_class_quest.sql.
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
select has_table('public', 'class_sets', 'class_sets exists');
select has_table('public', 'class_set_answers', 'class_set_answers exists');
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname = 'class_sets'), 'RLS is on for class_sets');
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname = 'class_set_answers'), 'RLS is on for class_set_answers');
select ok(exists (select 1 from public.account_data_catalog where tbl = 'class_sets' and written_by = 'you'),
          'the catalogue explains class_sets, written by the teacher');
select ok(exists (select 1 from public._owned_by_user_cols() where tbl = 'class_sets' and col = 'user_id'),
          'the owned-table discovery finds class_sets through user_id');

-- ② ─────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _run('a_make',   'insert into public.class_sets (kind, seed, n, title) values (''where'', ''abc123'', 5, ''3-A geography'')');
select _sel('a_owner',  'select user_id::text from public.class_sets');
select _sel('a_code',   'select (code ~ ''^[A-HJ-NP-Z2-9]{8}$'')::text from public.class_sets');
select _sel('a_open',   'select open::text from public.class_sets');
select _run('a_when',   'insert into public.class_sets (kind, seed, n) values (''when'', ''d2026-10-13'', 10)');
select _run('a_steal',  'insert into public.class_sets (user_id, kind, seed, n) values (''22222222-2222-2222-2222-222222222222'', ''where'', ''x'', 5)');
select _run('a_pick',   'insert into public.class_sets (code, kind, seed, n) values (''AAAAAAAA'', ''where'', ''x'', 5)');
select _run('a_stamp',  'insert into public.class_sets (kind, seed, n, created_at) values (''where'', ''x'', 5, now() - interval ''2 years'')');
select _run('c_kind',   'insert into public.class_sets (kind, seed, n) values (''flags'', ''x'', 5)');
select _run('c_n',      'insert into public.class_sets (kind, seed, n) values (''where'', ''x'', 7)');
select _run('c_seed',   'insert into public.class_sets (kind, seed, n) values (''where'', ''a b'', 5)');
select _run('c_title',  'insert into public.class_sets (kind, seed, n, title) values (''where'', ''x'', 5, '''')');
select _run('a_rekind', 'update public.class_sets set kind = ''when''');
select _run('a_reseed', 'update public.class_sets set seed = ''zzz''');
select _run('a_close',  'update public.class_sets set open = false where kind = ''when''');
select _sel('a_count',  'select count(*)::text from public.class_sets');
reset role;

select is((select v from _cap where k='a_make'),   'ROWS:1',   'A makes a class set');
select is((select v from _cap where k='a_owner'),  '11111111-1111-1111-1111-111111111111', 'user_id is the caller''s');
select is((select v from _cap where k='a_code'),   'true',     'the code is drawn by the database in the 32-symbol alphabet');
select is((select v from _cap where k='a_open'),   'true',     'a new set takes answers');
select is((select v from _cap where k='a_when'),   'ROWS:1',   'a ten-question year set is made');
select is((select v from _cap where k='a_steal'),  'DENIED',   'user_id is not the caller''s to give');
select is((select v from _cap where k='a_pick'),   'DENIED',   'the code is not the caller''s to choose');
select is((select v from _cap where k='a_stamp'),  'DENIED',   'created_at is the database''s');
select is((select v from _cap where k='c_kind'),   'ERR:23514','a kind the engine does not have is refused');
select is((select v from _cap where k='c_n'),      'ERR:23514','a length the panel does not offer is refused');
select is((select v from _cap where k='c_seed'),   'ERR:23514','a seed outside the challenge link''s alphabet is refused');
select is((select v from _cap where k='c_title'),  'ERR:23514','an empty title is refused (no title is null)');
select is((select v from _cap where k='a_rekind'), 'DENIED',   'the quest of a set cannot be rewritten (kind)');
select is((select v from _cap where k='a_reseed'), 'DENIED',   'the quest of a set cannot be rewritten (seed)');
select is((select v from _cap where k='a_close'),  'ROWS:1',   'the teacher closes a set');
select is((select v from _cap where k='a_count'),  '2',        'A holds exactly the two sets that were accepted');

-- ③ a student, signed out ─────────────────────────────────────────────────────
create table _codes as
  select kind, code from public.class_sets where user_id = '11111111-1111-1111-1111-111111111111';
grant select on _codes to anon, authenticated;

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select _sel('s_open',   'select public.class_set_open((select lower(code) from _codes where kind = ''where'')) ->> ''kind''');
select _sel('s_open_n', 'select public.class_set_open((select code from _codes where kind = ''where'')) ->> ''n''');
select _sel('s_noset',  'select public.class_set_open(''ZZZZZZZZ'') ->> ''error''');
select _sel('s_hand',   'select public.class_set_submit((select code from _codes where kind = ''where''), ''  Aiko '', ''[[139.692,35.69],[-0.128,51.507],null,[2.352,48.857],[37.618,55.756]]''::jsonb) ->> ''ok''');
select _sel('s_again',  'select public.class_set_submit((select code from _codes where kind = ''where''), ''aiko'', ''[null,null,null,null,null]''::jsonb) ->> ''error''');
select _sel('s_four',   'select public.class_set_submit((select code from _codes where kind = ''where''), ''Ben'', ''[null,null,null,null]''::jsonb) ->> ''error''');
select _sel('s_year',   'select public.class_set_submit((select code from _codes where kind = ''where''), ''Ben'', ''[1945,null,null,null,null]''::jsonb) ->> ''error''');
select _sel('s_lat',    'select public.class_set_submit((select code from _codes where kind = ''where''), ''Ben'', ''[[0,91],null,null,null,null]''::jsonb) ->> ''error''');
select _sel('s_name0',  'select public.class_set_submit((select code from _codes where kind = ''where''), ''   '', ''[null,null,null,null,null]''::jsonb) ->> ''error''');
select _sel('s_name25', 'select public.class_set_submit((select code from _codes where kind = ''where''), repeat(''x'', 25), ''[null,null,null,null,null]''::jsonb) ->> ''error''');
select _sel('s_ben',    'select public.class_set_submit((select code from _codes where kind = ''where''), ''Ben'', ''[null,null,null,null,[37.6,55.7]]''::jsonb) ->> ''answered''');
select _sel('s_closed', 'select public.class_set_submit((select code from _codes where kind = ''when''), ''Aiko'', ''[1914,1939,1945,1989,1991,null,null,null,null,null]''::jsonb) ->> ''error''');
select _sel('s_count',  'select public.class_set_open((select code from _codes where kind = ''where'')) ->> ''answered''');
select _sel('s_leak',   'select (public.class_set_open((select code from _codes where kind = ''where'')) ? ''user_id'')::text');
select _sel('s_read',   'select count(*)::text from public.class_set_answers');
select _sel('s_sets',   'select count(*)::text from public.class_sets');
select _run('s_ins',    'insert into public.class_set_answers (set_id, name, answers) values ((select id from public.class_sets limit 1), ''x'', ''[]'')');
reset role;

select is((select v from _cap where k='s_open'),   'where',     'a student opens the set by its code (any case)');
select is((select v from _cap where k='s_open_n'), '5',         'the set says how many questions it has');
select is((select v from _cap where k='s_noset'),  'not_found', 'a code that is not a set is not_found');
select is((select v from _cap where k='s_hand'),   'true',      'a student hands in five answers');
select is((select v from _cap where k='s_again'),  'name_taken','the same name again (any case, trimmed) is refused — the first hand-in stands');
select is((select v from _cap where k='s_four'),   'invalid',   'four answers to a five-question set are refused');
select is((select v from _cap where k='s_year'),   'invalid',   'a year is not an answer to a place question');
select is((select v from _cap where k='s_lat'),    'invalid',   'a latitude beyond the pole is refused');
select is((select v from _cap where k='s_name0'),  'invalid_name','a blank name is refused');
select is((select v from _cap where k='s_name25'), 'invalid_name','a name over 24 characters is refused');
select is((select v from _cap where k='s_ben'),    '2',         'a second student hands in; the set has two');
select is((select v from _cap where k='s_closed'), 'closed',    'a closed set takes nothing');
select is((select v from _cap where k='s_count'),  '2',         'the open door counts the hand-ins');
select is((select v from _cap where k='s_leak'),   'false',     'the open door does not name the teacher');
select is((select v from _cap where k='s_read'),   'DENIED',    'anon cannot read hand-ins');
select is((select v from _cap where k='s_sets'),   'DENIED',    'anon cannot read sets');
select is((select v from _cap where k='s_ins'),    'DENIED',    'anon cannot write a hand-in directly');
select is((select name from public.class_set_answers where lower(name) = 'aiko'), 'Aiko', 'the name is kept trimmed, as typed');

-- ④ the teacher and another teacher ─────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _sel('a_reads',  'select count(*)::text from public.class_set_answers');
select _sel('a_answer', 'select (answers -> 0 ->> 0) from public.class_set_answers where name = ''Aiko''');
select _run('a_edit',   'update public.class_set_answers set name = ''X''');
reset role;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select _sel('b_sets',   'select count(*)::text from public.class_sets');
select _sel('b_reads',  'select count(*)::text from public.class_set_answers');
select _run('b_del',    'delete from public.class_set_answers');
select _run('b_close',  'update public.class_sets set open = false');
select _run('b_dels',   'delete from public.class_sets');
select _run('b_make',   'insert into public.class_sets (kind, seed, n) values (''where'', ''b1'', 5)');
reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _run('a_drop',   'delete from public.class_set_answers where name = ''Ben''');
select _sel('a_left',   'select count(*)::text from public.class_set_answers');
reset role;

select is((select v from _cap where k='a_reads'),  '2',        'the teacher reads the two hand-ins of their set');
select is((select v from _cap where k='a_answer'), '139.692',  'the answer is kept raw (the board scores it)');
select is((select v from _cap where k='a_edit'),   'DENIED',   'a hand-in cannot be rewritten, not even by the teacher');
select is((select v from _cap where k='b_sets'),   '0',        'another teacher sees none of A''s sets');
select is((select v from _cap where k='b_reads'),  '0',        'another teacher reads none of A''s hand-ins');
select is((select v from _cap where k='b_del'),    'ROWS:0',   'another teacher deletes none of A''s hand-ins');
select is((select v from _cap where k='b_close'),  'ROWS:0',   'another teacher cannot close A''s sets');
select is((select v from _cap where k='b_dels'),   'ROWS:0',   'another teacher cannot delete A''s sets');
select is((select v from _cap where k='b_make'),   'ROWS:1',   'B makes B''s own set');
select is((select v from _cap where k='a_drop'),   'ROWS:1',   'the teacher removes one hand-in (a name that should not be there)');
select is((select v from _cap where k='a_left'),   '1',        'one hand-in is left');

-- ⑤ the ceiling, the purge, the export and account deletion ───────────────────────
insert into public.class_set_answers (set_id, name, answers)
  select (select id from public.class_sets where user_id = '11111111-1111-1111-1111-111111111111' and kind = 'where'),
         's' || g, '[null,null,null,null,null]'::jsonb
    from generate_series(1, 399) g;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select _sel('s_full', 'select public.class_set_submit((select code from _codes where kind = ''where''), ''Late'', ''[null,null,null,null,null]''::jsonb) ->> ''error''');
reset role;
select is((select v from _cap where k='s_full'), 'full', 'a set with 400 hand-ins takes no more');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select _sel('exp_b', 'select public.export_account_data() -> ''counts'' ->> ''class_sets''');
reset role;
select is((select v from _cap where k='exp_b'), '1', 'the export reaches class_sets with no list naming it');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select _sel('del_b', 'select public.delete_account_data(''22222222-2222-2222-2222-222222222222'') -> ''tables'' ->> ''class_sets''');
update public.class_sets set created_at = now() - interval '366 days' where user_id = '11111111-1111-1111-1111-111111111111' and kind = 'where';
select _sel('purge', 'select public.purge_class_sets(365)::text');
reset role;
select is((select v from _cap where k='del_b'), '1', 'account deletion reaches class_sets with no list naming it');
select is((select v from _cap where k='purge'), '1', 'the purge removes the set made more than 365 days ago');
select is((select count(*)::int from public.class_set_answers), 0, 'its hand-ins go with it');
select is((select count(*)::int from public.class_sets where user_id = '11111111-1111-1111-1111-111111111111'), 1, 'the younger set stays');

-- grants
select ok(not has_table_privilege('authenticated', 'public.class_sets', 'truncate'),         'authenticated holds no TRUNCATE on class_sets');
select ok(not has_table_privilege('authenticated', 'public.class_set_answers', 'truncate'),  'authenticated holds no TRUNCATE on class_set_answers');
select ok(not has_table_privilege('authenticated', 'public.class_set_answers', 'insert'),    'authenticated holds no INSERT on class_set_answers (the RPC is the door)');
select ok(not has_table_privilege('anon', 'public.class_sets', 'select'),                    'anon holds no SELECT on class_sets');
select ok(not has_column_privilege('authenticated', 'public.class_sets', 'code', 'insert'),  'authenticated cannot INSERT code');
select ok(not has_column_privilege('authenticated', 'public.class_sets', 'kind', 'update'),  'authenticated cannot UPDATE kind');
select ok(not has_function_privilege('anon', 'public.purge_class_sets(integer)', 'execute'), 'anon cannot run the purge');

select * from finish();
rollback;
