-- ============================================================================
--  pgTAP · 30 — watch-account-product: today's quest, kept in the account so the streak follows the reader.
--    ① the table exists, RLS is on, the catalogue has its sentence (the completeness check itself is
--      23_account_data_center_test.sql ①, which this table would fail without the row).
--    ② a reader records their OWN day: user_id and created_at are the database's; the same day and kind again
--      is refused by the key (the first finish stands) — and there is no UPDATE door to rewrite it.
--    ③ nobody reads or writes another account's results — not by naming user_id; a signed-out reader reads nothing.
--    ④ the CHECKs hold the numbers js/quest-engine.js names (5 scores, each 0–1000, kinds where/when, the first
--      day 2026-10-08), and a day that has not begun anywhere is refused.
--    ⑤ account deletion and the export reach the table with no list naming it.
--  supabase/migrations/20261008090000_quest_daily.sql.
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
select has_table('public', 'quest_daily_results', 'quest_daily_results exists');
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname = 'quest_daily_results'), 'RLS is on for quest_daily_results');
select ok(exists (select 1 from public.account_data_catalog where tbl = 'quest_daily_results' and written_by = 'you'),
          'the catalogue explains quest_daily_results, written by the reader');
select ok(exists (select 1 from public._owned_by_user_cols() where tbl = 'quest_daily_results' and col = 'user_id'),
          'the owned-table discovery finds quest_daily_results through user_id');

-- ② ─────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _run('a_rec',    'insert into public.quest_daily_results (day, kind, scores) values (date ''2026-10-08'', ''when'', ''{1000,708,1,0,933}'')');
select _sel('a_owner',  'select user_id::text from public.quest_daily_results');
select _run('a_where',  'insert into public.quest_daily_results (day, kind, scores) values (date ''2026-10-08'', ''where'', ''{500,500,500,500,500}'')');
select _run('a_again',  'insert into public.quest_daily_results (day, kind, scores) values (date ''2026-10-08'', ''when'', ''{1000,1000,1000,1000,1000}'')');
select _run('a_nothing','insert into public.quest_daily_results (day, kind, scores) values (date ''2026-10-08'', ''when'', ''{1000,1000,1000,1000,1000}'') on conflict (user_id, day, kind) do nothing');
select _sel('a_kept',   'select scores::text from public.quest_daily_results where kind = ''when''');
select _run('a_upd',    'update public.quest_daily_results set scores = ''{1000,1000,1000,1000,1000}''');
select _run('a_del',    'delete from public.quest_daily_results');
select _run('a_steal',  'insert into public.quest_daily_results (user_id, day, kind, scores) values (''22222222-2222-2222-2222-222222222222'', date ''2026-10-09'', ''when'', ''{1,1,1,1,1}'')');
select _run('a_stamp',  'insert into public.quest_daily_results (day, kind, scores, created_at) values (date ''2026-10-09'', ''where'', ''{1,1,1,1,1}'', now() - interval ''1 year'')');
-- ④ the numbers — on a day that has begun (today in UTC), so the row's SHAPE is what is judged: a day after
--   tomorrow is the trigger's refusal (22023, c_future), a malformed row is the table's CHECK (23514)
select _run('c_four',   'insert into public.quest_daily_results (day, kind, scores) values ((now() at time zone ''utc'')::date, ''when'', ''{1,2,3,4}'')');
select _run('c_six',    'insert into public.quest_daily_results (day, kind, scores) values ((now() at time zone ''utc'')::date, ''when'', ''{1,2,3,4,5,6}'')');
select _run('c_high',   'insert into public.quest_daily_results (day, kind, scores) values ((now() at time zone ''utc'')::date, ''when'', ''{1001,0,0,0,0}'')');
select _run('c_neg',    'insert into public.quest_daily_results (day, kind, scores) values ((now() at time zone ''utc'')::date, ''when'', ''{-1,0,0,0,0}'')');
select _run('c_null',   'insert into public.quest_daily_results (day, kind, scores) values ((now() at time zone ''utc'')::date, ''when'', array[1,2,null,4,5]::smallint[])');
select _run('c_kind',   'insert into public.quest_daily_results (day, kind, scores) values ((now() at time zone ''utc'')::date, ''flags'', ''{1,2,3,4,5}'')');
select _run('c_early',  'insert into public.quest_daily_results (day, kind, scores) values (date ''2026-10-07'', ''when'', ''{1,2,3,4,5}'')');
select _run('c_future', 'insert into public.quest_daily_results (day, kind, scores) values ((now() at time zone ''utc'')::date + 2, ''when'', ''{1,2,3,4,5}'')');
select _run('c_tomorrow','insert into public.quest_daily_results (day, kind, scores) values ((now() at time zone ''utc'')::date + 1, ''when'', ''{0,0,0,0,1000}'')');
select _sel('a_count',  'select count(*)::text from public.quest_daily_results');
reset role;

select is((select v from _cap where k='a_rec'),     'ROWS:1',   'A records their day''s year quest');
select is((select v from _cap where k='a_owner'),   '11111111-1111-1111-1111-111111111111', 'user_id is the caller''s');
select is((select v from _cap where k='a_where'),   'ROWS:1',   'the other kind of the same day is its own row');
select is((select v from _cap where k='a_again'),   'ERR:23505','the same day and kind again is refused by the key — the first finish stands');
select is((select v from _cap where k='a_nothing'), 'ROWS:0',   'an insert that tolerates the duplicate writes nothing');
select is((select v from _cap where k='a_kept'),    '{1000,708,1,0,933}', 'the first result is the one kept');
select is((select v from _cap where k='a_upd'),     'DENIED',   'there is no UPDATE door — a result cannot be rewritten');
select is((select v from _cap where k='a_del'),     'DENIED',   'a result is not deleted one by one (account deletion removes them all)');
select is((select v from _cap where k='a_steal'),   'DENIED',   'A cannot write a row for another account (user_id is not theirs to give)');
select is((select v from _cap where k='a_stamp'),   'DENIED',   'created_at is the database''s');
select is((select v from _cap where k='c_four'),    'ERR:23514','four scores are refused (a day''s set has five)');
select is((select v from _cap where k='c_six'),     'ERR:23514','six scores are refused');
select is((select v from _cap where k='c_high'),    'ERR:23514','a score above 1000 is refused');
select is((select v from _cap where k='c_neg'),     'ERR:23514','a negative score is refused');
select is((select v from _cap where k='c_null'),    'ERR:23514','a missing score is refused');
select is((select v from _cap where k='c_kind'),    'ERR:23514','a kind the engine does not have is refused');
select is((select v from _cap where k='c_early'),   'ERR:23514','a day before the day''s sets began is refused');
select is((select v from _cap where k='c_future'),  'ERR:22023','a day that has not begun anywhere is refused');
select is((select v from _cap where k='c_tomorrow'),'ROWS:1',   'tomorrow in UTC is accepted (a reader''s calendar can be a day ahead)');
select is((select v from _cap where k='a_count'),   '3',        'A holds exactly the three rows that were accepted');

-- ③ B sees and touches nothing of A's; a signed-out reader reads nothing
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select _sel('b_sees',  'select count(*)::text from public.quest_daily_results');
select _run('b_own',   'insert into public.quest_daily_results (day, kind, scores) values (date ''2026-10-08'', ''when'', ''{10,20,30,40,50}'')');
select _sel('b_own_sees', 'select count(*)::text from public.quest_daily_results');
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select _sel('anon_sees', 'select count(*)::text from public.quest_daily_results');
select _run('anon_ins',  'insert into public.quest_daily_results (day, kind, scores) values (date ''2026-10-08'', ''when'', ''{1,1,1,1,1}'')');
reset role;

select is((select v from _cap where k='b_sees'),     '0',      'B sees none of A''s results');
select is((select v from _cap where k='b_own'),      'ROWS:1', 'B records B''s own day — the same day and kind as A, a different row');
select is((select v from _cap where k='b_own_sees'), '1',      'B then sees exactly their own result');
select is((select v from _cap where k='anon_sees'),  'DENIED', 'a signed-out reader cannot read results');
select is((select v from _cap where k='anon_ins'),   'DENIED', 'a signed-out reader cannot write one');
select is((select count(*)::int from public.quest_daily_results where user_id = '11111111-1111-1111-1111-111111111111'), 3, 'A''s results are still there');

-- ⑤ the export and account deletion reach it
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select _sel('exp_b', 'select public.export_account_data() -> ''counts'' ->> ''quest_daily_results''');
reset role;
select is((select v from _cap where k='exp_b'), '1', 'the export reaches quest_daily_results with no list naming it');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select _sel('del_b', 'select public.delete_account_data(''22222222-2222-2222-2222-222222222222'') -> ''tables'' ->> ''quest_daily_results''');
reset role;
select is((select v from _cap where k='del_b'), '1', 'account deletion reaches quest_daily_results with no list naming it');

-- grants
select ok(not has_table_privilege('authenticated', 'public.quest_daily_results', 'truncate'), 'authenticated holds no TRUNCATE on quest_daily_results (TRUNCATE ignores RLS)');
select ok(not has_table_privilege('authenticated', 'public.quest_daily_results', 'update'),   'authenticated holds no UPDATE on quest_daily_results');
select ok(not has_table_privilege('anon',          'public.quest_daily_results', 'select'),   'anon holds no SELECT on quest_daily_results');
select ok(not has_column_privilege('authenticated', 'public.quest_daily_results', 'user_id', 'insert'), 'authenticated cannot INSERT user_id');

select * from finish();
rollback;
