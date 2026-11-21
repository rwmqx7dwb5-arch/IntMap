-- ============================================================================
--  pgTAP · 52 — connection permissions: connections / connection_credentials / connection_ledger
--  supabase/migrations/20261121120000_connection_permissions.sql
--    ① owner isolation (A cannot see, edit or log against B's connection);
--    ② column grants: the owner edits policy columns only; defaults match _shared/connection-policy.js;
--    ③ credentials are invisible to every browser role and reachable only by service_role doors;
--    ④ revoking deletes the secret and stays revoked;
--    ⑤ the ledger is append-only for readers and attributed to the caller.
--  Users: 11… and 22… (supabase/seed.sql).
-- ============================================================================
begin;
select no_plan();

do $$ begin execute format('grant anon, authenticated, service_role to %I', current_user); exception when others then null; end $$;

select has_table('public', 'connections', 'connections exists');
select has_table('public', 'connection_credentials', 'connection_credentials exists');
select has_table('public', 'connection_ledger', 'connection_ledger exists');

-- ── ① A creates, B cannot see ────────────────────────────────────────────────
-- the fixture carries a fixed id (the owner's insert grant does not include id), so it is made as the test superuser
insert into public.connections (id, user_id, service, kind, label)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'github', 'mcp', 'main');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
insert into public.connections (user_id, service, kind, label) values ('11111111-1111-1111-1111-111111111111', 'slack', 'api', 'second');
select throws_ok($$ insert into public.connections (id, user_id, service, kind) values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'x', 'mcp') $$,
  '42501', null, 'the owner cannot choose the row id');
select is((select mode_read || '/' || mode_write || '/' || mode_spend || '/' || mode_destructive || '/' || max_sensitivity from public.connections where label = 'main'),
  'allow/ask/ask/ask/personal', 'defaults: a read never asks, the rest ask');
select throws_ok($$ insert into public.connections (user_id, service, kind) values ('22222222-2222-2222-2222-222222222222', 'x', 'mcp') $$,
  '42501', null, 'A cannot create a connection for B');
select throws_ok($$ insert into public.connections (user_id, service, kind) values ('11111111-1111-1111-1111-111111111111', 'Bad Name', 'mcp') $$,
  '23514', null, 'a service slug is lower-case and bounded');
select throws_ok($$ update public.connections set user_id = '22222222-2222-2222-2222-222222222222' where label = 'main' $$,
  '42501', null, 'the owner column is not editable');
update public.connections set mode_write = 'allow' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select is((select mode_write from public.connections where label = 'main'), 'allow', 'the owner edits a policy column');
reset role;

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.connections), 0, 'B sees none of A''s connections');
select throws_ok($$ select public.conn_log(null, 'aaaaaaaa-0000-0000-0000-000000000001', 'github', 'x', 'read', 'allow', 'ok', 'atlas', '', '', 0) $$,
  '42704', null, 'B cannot log against A''s connection');
select throws_ok($$ select public.conn_log('11111111-1111-1111-1111-111111111111', null, 'github', 'x', 'read', 'allow', 'ok', 'atlas', '', '', 0) $$,
  '42501', null, 'B cannot log into A''s ledger');
reset role;

-- ── ③ credentials: only service_role ─────────────────────────────────────────
set local role service_role;
select is(public.conn_credential_put('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'v1.1.AAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBB', 1, 'abcd', null), true,
  'service_role stores a sealed secret');
select throws_ok($$ select public.conn_credential_put('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001', 'v1.1.AAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBB', 1, '', null) $$,
  '42704', null, 'a secret cannot be attached to someone else''s connection');
select is((select count(*)::int from public.conn_credential_get('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001')), 1,
  'service_role reads it back for the owner');
reset role;

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$ select count(*) from public.connection_credentials $$, '42501', null, 'the owner cannot read their own credential table');
select throws_ok($$ select * from public.conn_credential_get('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '42501', null, 'the owner cannot call the credential door');
reset role;
set local role anon;
select throws_ok($$ select count(*) from public.connections $$, '42501', null, 'a signed-out reader reads nothing');
reset role;

-- ── ⑤ the ledger ─────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select is(public.conn_log(null, 'aaaaaaaa-0000-0000-0000-000000000001', 'ignored', 'tools/call:search', 'read', 'allow', 'ok', 'atlas', '', 'api.github.com', 0), true,
  'the owner logs against their own connection');
select throws_ok($$ select public.conn_log(null, null, 'github', 'x', 'explode', 'allow', 'ok', 'atlas', '', '', 0) $$, '23514', null, 'a class outside the four is refused');
select is((select service || '/' || host from public.connection_ledger), 'github/api.github.com', 'the service is taken from the connection, not the argument');
select throws_ok($$ update public.connection_ledger set outcome = 'failed' $$, '42501', null, 'the ledger cannot be edited by its owner');
select throws_ok($$ delete from public.connection_ledger $$, '42501', null, 'nor deleted');
reset role;

-- ── ④ revoke deletes the secret and stays revoked ────────────────────────────
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
update public.connections set status = 'revoked' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select throws_ok($$ update public.connections set status = 'active' where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$, '22023', null, 'a revoked connection cannot be revived');
reset role;
select is((select count(*)::int from public.connection_credentials where connection_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0, 'revoking took the secret with it');

-- ── retention door and inventory ─────────────────────────────────────────────
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('purge_connection_ledger', 'conn_credential_put', 'conn_credential_get', 'conn_credential_delete')
              and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
  0, 'no browser role can execute the purge or a credential door');
select is((select count(*)::int from public.account_data_catalog where tbl in ('connections', 'connection_credentials', 'connection_ledger')), 3,
  'the account data inventory has its three sentences');

select * from finish();
rollback;
