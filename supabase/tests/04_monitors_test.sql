-- ============================================================================
--  pgTAP · 04 area-monitors RLS/permission matrix (#R141) — prove that a user
--  sees and controls ONLY their own monitors/runs/evidence/reports, cannot forge
--  run results, cannot tamper with the run-state (lock/counters) on their own
--  monitor, cannot exceed their plan's monitor cap, and cannot call the
--  service-role claim RPC. Same top-level-SET-ROLE technique as 01_rls_matrix.
--
--  Seed subjects (supabase/seed.sql §9):
--    A monitor 1000…a1 (+ run 1000…a2, 2 evidence, report 1000…a3) — user A
--    B monitor 2000…b1                                              — user B
-- ============================================================================
begin;
select no_plan();

do $$ begin execute format('grant anon, authenticated, service_role to %I', current_user); exception when others then null; end $$;

create table _cap (k text primary key, v text);
grant insert, select on _cap to anon, authenticated, service_role;

create function _sel(k text, q text) returns void language plpgsql as $$
declare c text;
begin
  execute q into c;
  insert into _cap values (k, coalesce(c, '<null>'));
exception
  when insufficient_privilege then insert into _cap values (k, 'DENIED');
  when others then insert into _cap values (k, 'ERR:' || sqlstate);
end;
$$;
create function _dml(k text, q text) returns void language plpgsql as $$
declare n integer;
begin
  execute q; get diagnostics n = row_count;
  insert into _cap values (k, 'ROWS:' || n);
exception
  when insufficient_privilege then insert into _cap values (k, 'DENIED');
  when others then insert into _cap values (k, 'ERR:' || sqlstate);
end;
$$;

-- ─────────────────────────── ANON (logged out) ─────────────────────────────
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select _sel('anon_monitors', 'select count(*) from public.area_monitors');    -- no grant → DENIED
select _sel('anon_runs',     'select count(*) from public.monitor_runs');      -- DENIED
select _sel('anon_evidence', 'select count(*) from public.monitor_evidence');  -- DENIED
select _sel('anon_reports',  'select count(*) from public.monitor_reports');   -- DENIED
reset role;

-- ─────────────────────────── USER A (authenticated) ────────────────────────
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
-- reads: own vs B
select _sel('a_own_mon',   'select count(*) from public.area_monitors where user_id=''11111111-1111-1111-1111-111111111111'''); -- 1
select _sel('a_all_mon',   'select count(*) from public.area_monitors');                                                        -- 1 (only own)
select _sel('a_b_mon',     'select count(*) from public.area_monitors where id=''20000000-0000-0000-0000-0000000000b1''');       -- 0
select _sel('a_own_run',   'select count(*) from public.monitor_runs');                                                         -- 1
select _sel('a_own_ev',    'select count(*) from public.monitor_evidence');                                                     -- 2
select _sel('a_own_rep',   'select count(*) from public.monitor_reports');                                                      -- 1
-- forge run results → DENIED (no write grant on child tables)
select _dml('a_forge_run', 'insert into public.monitor_runs(monitor_id,user_id,status) values (''10000000-0000-0000-0000-0000000000a1'',''11111111-1111-1111-1111-111111111111'',''success'')');
select _dml('a_forge_ev',  'insert into public.monitor_evidence(run_id,monitor_id,user_id,ev_key,source_type,dedup_key) values (''10000000-0000-0000-0000-0000000000a2'',''10000000-0000-0000-0000-0000000000a1'',''11111111-1111-1111-1111-111111111111'',''evX'',''news'',''k'')');
select _dml('a_forge_rep', 'insert into public.monitor_reports(monitor_id,run_id,user_id,headline) values (''10000000-0000-0000-0000-0000000000a1'',''10000000-0000-0000-0000-0000000000a2'',''11111111-1111-1111-1111-111111111111'',''fake'')');
-- tamper with own monitor's RUN-STATE columns → DENIED (column-level grant excludes them)
select _dml('a_set_lock',   'update public.area_monitors set running_since=now() where id=''10000000-0000-0000-0000-0000000000a1''');
select _dml('a_set_count',  'update public.area_monitors set run_count=999 where id=''10000000-0000-0000-0000-0000000000a1''');
select _dml('a_set_status', 'update public.area_monitors set last_status=''success'' where id=''10000000-0000-0000-0000-0000000000a1''');
-- edit own monitor's CONFIG columns → allowed
select _dml('a_edit_name',  'update public.area_monitors set name=''A2'' where id=''10000000-0000-0000-0000-0000000000a1''');   -- ROWS:1
select _dml('a_toggle',     'update public.area_monitors set enabled=false where id=''10000000-0000-0000-0000-0000000000a1''');-- ROWS:1
-- cannot touch B's monitor
select _dml('a_edit_b_mon', 'update public.area_monitors set name=''HACK'' where id=''20000000-0000-0000-0000-0000000000b1''');-- ROWS:0
select _dml('a_del_b_mon',  'delete from public.area_monitors where id=''20000000-0000-0000-0000-0000000000b1''');             -- ROWS:0
-- cannot create a monitor owned by B (WITH CHECK)
select _dml('a_ins_as_b',   'insert into public.area_monitors(user_id,name,geometry) values (''22222222-2222-2222-2222-222222222222'',''spoof'',''{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,1],[0,0]]]}''::jsonb)');
-- cannot call the service-role claim RPC (quota/lock bypass blocked)
select _sel('a_claim',      'select count(*) from public.monitor_claim_due(5,15)');   -- DENIED
-- plan limit function about self is readable (free → 5) — the billing hook
select _sel('a_limit',      'select public.monitor_limit(''11111111-1111-1111-1111-111111111111'')::text'); -- 5
reset role;

-- ─────────────────────────── USER B (authenticated) ────────────────────────
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select _sel('b_own_mon',   'select count(*) from public.area_monitors');    -- 1 (only own)
select _sel('b_a_mon',     'select count(*) from public.area_monitors where id=''10000000-0000-0000-0000-0000000000a1'''); -- 0 (A''s)
select _sel('b_runs',      'select count(*) from public.monitor_runs');      -- 0 (A''s run invisible)
select _sel('b_ev',        'select count(*) from public.monitor_evidence');  -- 0
select _sel('b_reports',   'select count(*) from public.monitor_reports');   -- 0
reset role;

-- ─────────────────────────── ADMIN — no backdoor into private monitors ─────
-- (Monitors are private per-user; unlike feedback/donations, admins get NO extra
--  access. Admin owns no monitors → sees zero.)
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select _sel('admin_mon',   'select count(*) from public.area_monitors');     -- 0 (admin owns none; no backdoor)
select _sel('admin_rep',   'select count(*) from public.monitor_reports');   -- 0
select _sel('admin_limit', 'select public.monitor_limit(''33333333-3333-3333-3333-333333333333'')::text'); -- 200 (unlimited plan)
reset role;

-- ─────────────────────────── SERVICE ROLE (the runner) ─────────────────────
-- Captured BEFORE the enforcement block below so counts stay deterministic.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select _sel('svc_all_mon', 'select count(*) from public.area_monitors');                 -- 2 (bypass RLS)
select _sel('svc_all_rep', 'select count(*) from public.monitor_reports');               -- 1
select _dml('svc_ins_run', 'insert into public.monitor_runs(monitor_id,user_id,status,trigger) values (''20000000-0000-0000-0000-0000000000b1'',''22222222-2222-2222-2222-222222222222'',''success_no_change'',''schedule'')'); -- ROWS:1
select _sel('svc_claim',   'select count(*) from public.monitor_claim_due(5,15)');       -- 0 (seed monitors due in +1h → none claimed)
reset role;

-- ─────────────────────────── LIMIT ENFORCEMENT (LAST — mutates A''s count) ──
-- A (free, limit 5) already owns 1. Four more inserts succeed; the fifth insert
-- (which would be the 6th monitor) is rejected by the enforce-limit trigger.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _dml('a_ins2', 'insert into public.area_monitors(user_id,name,geometry) values (''11111111-1111-1111-1111-111111111111'',''m2'',''{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,1],[0,0]]]}''::jsonb)'); -- ROWS:1
select _dml('a_ins3', 'insert into public.area_monitors(user_id,name,geometry) values (''11111111-1111-1111-1111-111111111111'',''m3'',''{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,1],[0,0]]]}''::jsonb)'); -- ROWS:1
select _dml('a_ins4', 'insert into public.area_monitors(user_id,name,geometry) values (''11111111-1111-1111-1111-111111111111'',''m4'',''{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,1],[0,0]]]}''::jsonb)'); -- ROWS:1
select _dml('a_ins5', 'insert into public.area_monitors(user_id,name,geometry) values (''11111111-1111-1111-1111-111111111111'',''m5'',''{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,1],[0,0]]]}''::jsonb)'); -- ROWS:1 (now at limit 5)
select _dml('a_ins6', 'insert into public.area_monitors(user_id,name,geometry) values (''11111111-1111-1111-1111-111111111111'',''m6'',''{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,1],[0,0]]]}''::jsonb)'); -- ERR:23514 (limit)
reset role;

-- ─────────────────────────── ASSERTIONS (as superuser) ─────────────────────
-- anon
select is((select v from _cap where k='anon_monitors'), 'DENIED', 'anon cannot read area_monitors');
select is((select v from _cap where k='anon_runs'),     'DENIED', 'anon cannot read monitor_runs');
select is((select v from _cap where k='anon_evidence'), 'DENIED', 'anon cannot read monitor_evidence');
select is((select v from _cap where k='anon_reports'),  'DENIED', 'anon cannot read monitor_reports');
-- user A isolation + capability
select is((select v from _cap where k='a_own_mon'), '1',      'A reads own monitor');
select is((select v from _cap where k='a_all_mon'), '1',      'A sees only own monitors');
select is((select v from _cap where k='a_b_mon'),   '0',      'A cannot read B''s monitor row');
select is((select v from _cap where k='a_own_run'), '1',      'A reads own run');
select is((select v from _cap where k='a_own_ev'),  '2',      'A reads own evidence');
select is((select v from _cap where k='a_own_rep'), '1',      'A reads own report');
select is((select v from _cap where k='a_forge_run'),'DENIED','A CANNOT forge a run result');
select is((select v from _cap where k='a_forge_ev'), 'DENIED','A CANNOT forge evidence');
select is((select v from _cap where k='a_forge_rep'),'DENIED','A CANNOT forge a report');
select is((select v from _cap where k='a_set_lock'), 'DENIED','A CANNOT touch the run lock (running_since)');
select is((select v from _cap where k='a_set_count'),'DENIED','A CANNOT forge run_count on its own monitor');
select is((select v from _cap where k='a_set_status'),'DENIED','A CANNOT forge last_status on its own monitor');
select is((select v from _cap where k='a_edit_name'),'ROWS:1', 'A can rename its own monitor');
select is((select v from _cap where k='a_toggle'),   'ROWS:1', 'A can enable/disable its own monitor');
select is((select v from _cap where k='a_edit_b_mon'),'ROWS:0','A cannot edit B''s monitor');
select is((select v from _cap where k='a_del_b_mon'),'ROWS:0', 'A cannot delete B''s monitor');
select is((select v from _cap where k='a_ins_as_b'), 'DENIED', 'A cannot create a monitor owned by B (WITH CHECK)');
select is((select v from _cap where k='a_claim'),    'DENIED', 'A cannot call monitor_claim_due (runner-only)');
select is((select v from _cap where k='a_limit'),    '5',      'A (free) monitor limit is 5');
-- user B isolation
select is((select v from _cap where k='b_own_mon'), '1', 'B reads own monitor');
select is((select v from _cap where k='b_a_mon'),   '0', 'B cannot read A''s monitor');
select is((select v from _cap where k='b_runs'),    '0', 'B cannot read A''s runs');
select is((select v from _cap where k='b_ev'),      '0', 'B cannot read A''s evidence');
select is((select v from _cap where k='b_reports'), '0', 'B cannot read A''s reports');
-- admin: no private-monitor backdoor
select is((select v from _cap where k='admin_mon'),   '0',   'admin has NO backdoor into private monitors');
select is((select v from _cap where k='admin_rep'),   '0',   'admin cannot read others'' reports');
select is((select v from _cap where k='admin_limit'), '200', 'admin/unlimited monitor limit is 200');
-- service role
select is((select v from _cap where k='svc_all_mon'), '2',      'service_role sees all monitors (bypass RLS)');
select is((select v from _cap where k='svc_all_rep'), '1',      'service_role sees all reports');
select is((select v from _cap where k='svc_ins_run'), 'ROWS:1', 'service_role (runner) can write a run');
select is((select v from _cap where k='svc_claim'),   '0',      'monitor_claim_due returns nothing when no monitor is due');
-- limit enforcement
select is((select v from _cap where k='a_ins2'), 'ROWS:1',    'A insert #2 ok (under limit)');
select is((select v from _cap where k='a_ins5'), 'ROWS:1',    'A insert #5 ok (reaches limit 5)');
select is((select v from _cap where k='a_ins6'), 'ERR:23514', 'A insert #6 rejected by the plan limit (check_violation)');

select * from finish();
rollback;
