-- ============================================================================
--  pgTAP · 53 — atlas-knowledge: the claims Atlas kept, on the reader's account.
--    ① the table exists, RLS is on, anon has nothing, authenticated has the four row privileges;
--    ② the owner writes, reads, updates and deletes their own claims — and an insert under another
--       account's id is refused by WITH CHECK;
--    ③ another account reads none of them and can change none of them;
--    ④ the row bound (payload ≤ 64 KiB, id shape, statement present) and the account bound
--       (`knowledge-account-full`) refuse by name;
--    ⑤ the rows go with the account (ON DELETE CASCADE — delete_account_data finds the table itself),
--       and the data catalogue says what the rows are.
--  supabase/migrations/20261125000000_atlas_knowledge.sql. The client side (merge, removal elsewhere, a failed read) is
--  tests/knowledge-continuation-checks.test.mjs. The same shape as 22_atlas_notebook_test.sql, on purpose.
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
select has_table('public', 'atlas_knowledge_claims', 'atlas-knowledge: the table exists');
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname = 'atlas_knowledge_claims'), 'atlas-knowledge: RLS is on');
select ok(not has_table_privilege('anon', 'public.atlas_knowledge_claims', 'select'), 'atlas-knowledge: anon cannot read');
select ok(not has_table_privilege('anon', 'public.atlas_knowledge_claims', 'insert'), 'atlas-knowledge: anon cannot write');
select ok(has_table_privilege('authenticated', 'public.atlas_knowledge_claims', 'select'), 'atlas-knowledge: authenticated may select (RLS decides which rows)');
select ok(has_table_privilege('authenticated', 'public.atlas_knowledge_claims', 'insert'), 'atlas-knowledge: authenticated may insert (WITH CHECK decides whose)');
select ok(not has_table_privilege('authenticated', 'public.atlas_knowledge_claims', 'truncate'), 'atlas-knowledge: authenticated cannot truncate');
select ok(not (select prosecdef from pg_proc where oid = 'public.atlas_knowledge_account_bound()'::regprocedure),
          'atlas-knowledge: the account bound runs as the invoker (it sums only rows RLS already shows the writer)');
select is((select confdeltype from pg_constraint where conrelid = 'public.atlas_knowledge_claims'::regclass
            and confrelid = 'auth.users'::regclass and contype = 'f'), 'c'::"char",
          'atlas-knowledge: user_id -> auth.users is ON DELETE CASCADE');

-- ─────────────────────────────────────────────────────────────────────────────
--  2. THE OWNER (A = 11…)
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _run('ins',   $q$insert into public.atlas_knowledge_claims (user_id, id, created_at, statement, payload)
                        values ('11111111-1111-1111-1111-111111111111', 'kn-abc123-0001', now(), 'Terminal X handled 5 Mt in 2023', '{"v":1,"kind":"verified"}'::jsonb)$q$);
select _run('ins2',  $q$insert into public.atlas_knowledge_claims (user_id, id, created_at, statement, payload)
                        values ('11111111-1111-1111-1111-111111111111', 'kn-abc123-0002', now(), 'second', '{}'::jsonb)$q$);
select _run('spoof', $q$insert into public.atlas_knowledge_claims (user_id, id, created_at, statement, payload)
                        values ('22222222-2222-2222-2222-222222222222', 'kn-abc123-0003', now(), 'as B', '{}'::jsonb)$q$);
select _sel('own',   'select count(*)::text from public.atlas_knowledge_claims');
select _run('upd',   $q$update public.atlas_knowledge_claims set payload = '{"verifiedAt":1}'::jsonb, updated_at = now() where id = 'kn-abc123-0001'$q$);
select _sel('mark',  $q$select payload->>'verifiedAt' from public.atlas_knowledge_claims where id = 'kn-abc123-0001'$q$);
select _run('del',   $q$delete from public.atlas_knowledge_claims where id = 'kn-abc123-0002'$q$);
select _sel('own2',  'select count(*)::text from public.atlas_knowledge_claims');
--  ④ the row bounds
select _run('big',   $q$insert into public.atlas_knowledge_claims (user_id, id, created_at, statement, payload)
                        values ('11111111-1111-1111-1111-111111111111', 'kn-abc123-0004', now(), 'too big', jsonb_build_object('x', repeat('a', 65537)))$q$);
select _run('badid', $q$insert into public.atlas_knowledge_claims (user_id, id, created_at, statement, payload)
                        values ('11111111-1111-1111-1111-111111111111', 'not-a-claim-id', now(), 'q', '{}'::jsonb)$q$);
select _run('nost',  $q$insert into public.atlas_knowledge_claims (user_id, id, created_at, statement, payload)
                        values ('11111111-1111-1111-1111-111111111111', 'kn-abc123-0005', now(), '', '{}'::jsonb)$q$);
reset role;

-- ─────────────────────────────────────────────────────────────────────────────
--  3. ANOTHER ACCOUNT (B = 22…) AND anon
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select _sel('other',  'select count(*)::text from public.atlas_knowledge_claims');
select _run('oupd',   $q$update public.atlas_knowledge_claims set statement = 'rewritten' where id = 'kn-abc123-0001'$q$);
select _run('odel',   $q$delete from public.atlas_knowledge_claims where id = 'kn-abc123-0001'$q$);
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select _sel('anon',   'select count(*)::text from public.atlas_knowledge_claims');
reset role;
select _sel('kept',   $q$select statement from public.atlas_knowledge_claims where id = 'kn-abc123-0001'$q$);

-- ─────────────────────────────────────────────────────────────────────────────
--  4b. THE ACCOUNT BOUND — 350 rows of 60 KiB (each under the row bound) cross 20 MiB, as service_role (no RLS in the way)
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select _run('fill', $q$insert into public.atlas_knowledge_claims (user_id, id, created_at, statement, payload)
                       select '22222222-2222-2222-2222-222222222222', 'kn-fill-' || lpad(g::text, 4, '0'), now(), 'q', jsonb_build_object('x', repeat('b', 61440))
                         from generate_series(1, 350) g$q$);
select _sel('bcount', $q$select count(*)::text from public.atlas_knowledge_claims where user_id = '22222222-2222-2222-2222-222222222222'$q$);
reset role;

select is((select v from _cap where k='ins'),   'OK',     'the owner keeps a claim');
select is((select v from _cap where k='ins2'),  'OK',     'and a second one');
select is((select v from _cap where k='spoof'), 'DENIED', 'a claim under another account is refused by WITH CHECK (RLS answers 42501)');
select is((select v from _cap where k='own'),   '2',      'the owner reads their two claims');
select is((select v from _cap where k='upd'),   'OK',     'the owner updates a claim');
select is((select v from _cap where k='mark'),  '1',      '…and the update is what is stored');
select is((select v from _cap where k='del'),   'OK',     'the owner deletes a claim');
select is((select v from _cap where k='own2'),  '1',      '…and it is gone');
select ok((select v from _cap where k='big')   like 'ERR:23514%', 'a payload over 64 KiB is refused by the check constraint');
select ok((select v from _cap where k='badid') like 'ERR:23514%', 'an id that is not a claim id is refused');
select ok((select v from _cap where k='nost')  like 'ERR:23514%', 'a claim with no statement is refused');
select is((select v from _cap where k='other'), '0',      'another account reads none of them');
select is((select v from _cap where k='oupd'),  'OK',     'another account''s update runs…');
select is((select v from _cap where k='kept'),  'Terminal X handled 5 Mt in 2023', '…and changes nothing (RLS hides the row)');
select is((select v from _cap where k='anon'),  'DENIED', 'anon cannot read the table');
select ok((select v from _cap where k='fill') like 'ERR:P0001:knowledge-account-full%', 'the claim past 20 MiB is refused by name, and the whole insert with it');
select is((select v from _cap where k='bcount'), '0',     '…so nothing of the refused batch was written');

-- ─────────────────────────────────────────────────────────────────────────────
--  5. THE ROWS GO WITH THE ACCOUNT, AND THE CATALOGUE SAYS WHAT THEY ARE
-- ─────────────────────────────────────────────────────────────────────────────
select ok(exists (select 1 from public.account_data_catalog where tbl = 'atlas_knowledge_claims' and written_by = 'you'
                   and length(label_en) > 0 and length(label_jp) > 0 and length(purpose_jp) > 0 and length(retention_jp) > 0),
          'the account data catalogue has this table''s sentence, in en and jp');
select ok((select (public.delete_account_data('11111111-1111-1111-1111-111111111111'::uuid) ->> 'ok')::boolean), 'the account purge succeeds');
select is((select count(*)::int from public.atlas_knowledge_claims where user_id = '11111111-1111-1111-1111-111111111111'), 0,
          'the purge found this table by its foreign key and removed the claims');

select * from finish();
rollback;
