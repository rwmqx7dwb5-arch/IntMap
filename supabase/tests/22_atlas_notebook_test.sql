-- ============================================================================
--  pgTAP · 18 — atlas-os: the reader's Atlas investigation notebook, on their account.
--    ① the table exists, RLS is on, anon has nothing, authenticated has the four row privileges;
--    ② the owner writes, reads, updates and deletes their own entries — and an insert under another
--       account's id is refused by WITH CHECK;
--    ③ another account reads none of them and can change none of them;
--    ④ the row bound (payload ≤ 1 MiB, id shape, question present) and the account bound
--       (`notebook-account-full`) refuse by name;
--    ⑤ the rows go with the account (ON DELETE CASCADE — delete_account_data finds the table itself).
--  supabase/migrations/20261003170000_atlas_notebook.sql. The client side (merge, rows, normalisation) is
--  tests/atlas-os-checks.test.mjs.
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

-- ─────────────────────────────────────────────────────────────────────────────
--  1. THE SURFACE
-- ─────────────────────────────────────────────────────────────────────────────
select has_table('public', 'atlas_notebook_entries', 'atlas-notebook: the table exists');
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname = 'atlas_notebook_entries'), 'atlas-notebook: RLS is on');
select ok(not has_table_privilege('anon', 'public.atlas_notebook_entries', 'select'), 'atlas-notebook: anon cannot read');
select ok(not has_table_privilege('anon', 'public.atlas_notebook_entries', 'insert'), 'atlas-notebook: anon cannot write');
select ok(has_table_privilege('authenticated', 'public.atlas_notebook_entries', 'select'), 'atlas-notebook: authenticated may select (RLS decides which rows)');
select ok(has_table_privilege('authenticated', 'public.atlas_notebook_entries', 'insert'), 'atlas-notebook: authenticated may insert (WITH CHECK decides whose)');
select ok(not has_table_privilege('authenticated', 'public.atlas_notebook_entries', 'truncate'), 'atlas-notebook: authenticated cannot truncate');
select ok(not (select prosecdef from pg_proc where oid = 'public.atlas_notebook_account_bound()'::regprocedure),
          'atlas-notebook: the account bound runs as the invoker (it sums only rows RLS already shows the writer)');
select is((select confdeltype from pg_constraint where conrelid = 'public.atlas_notebook_entries'::regclass
            and confrelid = 'auth.users'::regclass and contype = 'f'), 'c'::"char",
          'atlas-notebook: user_id -> auth.users is ON DELETE CASCADE');

-- ─────────────────────────────────────────────────────────────────────────────
--  2. THE OWNER (A = 11…)
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _run('ins',   $q$insert into public.atlas_notebook_entries (user_id, id, created_at, question, answer, payload)
                        values ('11111111-1111-1111-1111-111111111111', 'nb-abc123-0001', now(), '人口100万人以上の都市', '34 件', '{"v":1,"title":"t"}'::jsonb)$q$);
select _run('ins2',  $q$insert into public.atlas_notebook_entries (user_id, id, created_at, question, payload)
                        values ('11111111-1111-1111-1111-111111111111', 'nb-abc123-0002', now(), 'second', '{}'::jsonb)$q$);
select _run('spoof', $q$insert into public.atlas_notebook_entries (user_id, id, created_at, question, payload)
                        values ('22222222-2222-2222-2222-222222222222', 'nb-abc123-0003', now(), 'as B', '{}'::jsonb)$q$);
select _sel('own',   'select count(*)::text from public.atlas_notebook_entries');
select _run('upd',   $q$update public.atlas_notebook_entries set payload = '{"note":"checked"}'::jsonb, updated_at = now() where id = 'nb-abc123-0001'$q$);
select _sel('note',  $q$select payload->>'note' from public.atlas_notebook_entries where id = 'nb-abc123-0001'$q$);
select _run('del',   $q$delete from public.atlas_notebook_entries where id = 'nb-abc123-0002'$q$);
select _sel('own2',  'select count(*)::text from public.atlas_notebook_entries');
--  ④ the row bounds
select _run('big',   $q$insert into public.atlas_notebook_entries (user_id, id, created_at, question, payload)
                        values ('11111111-1111-1111-1111-111111111111', 'nb-abc123-0004', now(), 'too big', jsonb_build_object('x', repeat('a', 1048577)))$q$);
select _run('badid', $q$insert into public.atlas_notebook_entries (user_id, id, created_at, question, payload)
                        values ('11111111-1111-1111-1111-111111111111', 'not-a-notebook-id', now(), 'q', '{}'::jsonb)$q$);
select _run('noq',   $q$insert into public.atlas_notebook_entries (user_id, id, created_at, question, payload)
                        values ('11111111-1111-1111-1111-111111111111', 'nb-abc123-0005', now(), '', '{}'::jsonb)$q$);
reset role;

-- ─────────────────────────────────────────────────────────────────────────────
--  3. ANOTHER ACCOUNT (B = 22…) AND anon
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select _sel('other',  'select count(*)::text from public.atlas_notebook_entries');
select _run('oupd',   $q$update public.atlas_notebook_entries set answer = 'rewritten' where id = 'nb-abc123-0001'$q$);
select _run('odel',   $q$delete from public.atlas_notebook_entries where id = 'nb-abc123-0001'$q$);
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select _sel('anon',   'select count(*)::text from public.atlas_notebook_entries');
reset role;
select _sel('kept',   $q$select answer from public.atlas_notebook_entries where id = 'nb-abc123-0001'$q$);

-- ─────────────────────────────────────────────────────────────────────────────
--  4b. THE ACCOUNT BOUND — 101 rows of ~1 MiB each by B, as service_role (no RLS in the way)
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select _run('fill', $q$insert into public.atlas_notebook_entries (user_id, id, created_at, question, payload)
                       select '22222222-2222-2222-2222-222222222222', 'nb-fill-' || lpad(g::text, 4, '0'), now(), 'q', jsonb_build_object('x', repeat('b', 1040000))
                         from generate_series(1, 101) g$q$);
select _sel('bcount', $q$select count(*)::text from public.atlas_notebook_entries where user_id = '22222222-2222-2222-2222-222222222222'$q$);
reset role;

select is((select v from _cap where k='ins'),   'OK',     'the owner files an entry');
select is((select v from _cap where k='ins2'),  'OK',     'and a second one');
select is((select v from _cap where k='spoof'), 'DENIED', 'an entry under another account is refused by WITH CHECK (RLS answers 42501)');
select is((select v from _cap where k='own'),   '2',      'the owner reads their two entries');
select is((select v from _cap where k='upd'),   'OK',     'the owner updates an entry');
select is((select v from _cap where k='note'),  'checked','…and the update is what is stored');
select is((select v from _cap where k='del'),   'OK',     'the owner deletes an entry');
select is((select v from _cap where k='own2'),  '1',      '…and it is gone');
select ok((select v from _cap where k='big')   like 'ERR:23514%', 'a payload over 1 MiB is refused by the check constraint');
select ok((select v from _cap where k='badid') like 'ERR:23514%', 'an id that is not a notebook id is refused');
select ok((select v from _cap where k='noq')   like 'ERR:23514%', 'an entry with no question is refused');
select is((select v from _cap where k='other'), '0',      'another account reads none of them');
select is((select v from _cap where k='oupd'),  'OK',     'another account''s update runs…');
select is((select v from _cap where k='kept'),  '34 件',  '…and changes nothing (RLS hides the row)');
select is((select v from _cap where k='anon'),  'DENIED', 'anon cannot read the table');
select ok((select v from _cap where k='fill') like 'ERR:P0001:notebook-account-full%', 'the 101st MiB is refused by name, and the whole insert with it');
select is((select v from _cap where k='bcount'), '0',     '…so nothing of the refused batch was written');

-- ─────────────────────────────────────────────────────────────────────────────
--  5. THE ROWS GO WITH THE ACCOUNT
-- ─────────────────────────────────────────────────────────────────────────────
select ok((select (public.delete_account_data('11111111-1111-1111-1111-111111111111'::uuid) ->> 'ok')::boolean), 'the account purge succeeds');
select is((select count(*)::int from public.atlas_notebook_entries where user_id = '11111111-1111-1111-1111-111111111111'), 0,
          'the purge found this table by its foreign key and removed the notebook');

select * from finish();
rollback;
