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

-- (#R144) SIMULATE PRODUCTION. In real Supabase the schema-wide default privileges
-- grant `authenticated` full table-level UPDATE on every public table (RLS is the
-- real protection), which makes column-level UPDATE grants a NO-OP. We reproduce
-- that here so the run-state protection is tested against the PROD reality — i.e.
-- it must hold via the tg_monitors_guard_state TRIGGER, not merely via a column
-- grant that prod ignores. Without this line the migration's column grant would
-- mask the very hole R144 fixes.
grant update on public.area_monitors to authenticated;

-- ─────────────────────────── ANON (logged out) ─────────────────────────────
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select _sel('anon_monitors', 'select count(*) from public.area_monitors');    -- no grant → DENIED
select _sel('anon_runs',     'select count(*) from public.monitor_runs');      -- DENIED
select _sel('anon_evidence', 'select count(*) from public.monitor_evidence');  -- DENIED
select _sel('anon_reports',  'select count(*) from public.monitor_reports');   -- DENIED
select _sel('anon_seen',     'select count(*) from public.monitor_seen_items');-- DENIED (#R144)
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
-- (#R144) tamper with own monitor's RUN-STATE columns. With the prod-like table
-- grant above the UPDATE reaches SQL (ROWS:1), but the guard TRIGGER pins the
-- run-state columns to their OLD values — so the stored value never changes.
select _dml('a_set_lock',    'update public.area_monitors set running_since=now() where id=''10000000-0000-0000-0000-0000000000a1''');
select _sel('a_lock_val',    'select coalesce(running_since::text,''<null>'') from public.area_monitors where id=''10000000-0000-0000-0000-0000000000a1''');  -- still <null>
select _dml('a_set_count',   'update public.area_monitors set run_count=999 where id=''10000000-0000-0000-0000-0000000000a1''');
select _sel('a_count_val',   'select run_count::text from public.area_monitors where id=''10000000-0000-0000-0000-0000000000a1''');   -- still 0
select _dml('a_set_status',  'update public.area_monitors set last_status=''hacked'' where id=''10000000-0000-0000-0000-0000000000a1''');
select _sel('a_status_val',  'select coalesce(last_status,''<null>'') from public.area_monitors where id=''10000000-0000-0000-0000-0000000000a1''');   -- still <null>
-- (#R144) user CANNOT hand-pick the execution time: injecting a past next_run_at is
-- ignored (a config-only edit leaves it frozen → still in the future).
select _dml('a_set_next',    'update public.area_monitors set next_run_at=''2000-01-01T00:00:00Z'' where id=''10000000-0000-0000-0000-0000000000a1''');
select _sel('a_next_future', 'select (next_run_at > now() - interval ''2 minutes'')::text from public.area_monitors where id=''10000000-0000-0000-0000-0000000000a1''');  -- true (NOT the year-2000 injection)
-- edit own monitor's CONFIG columns → allowed (name/enabled). interval is editable,
-- but next_run_at is SERVER-recomputed (not the injected past value).
select _dml('a_edit_name',   'update public.area_monitors set name=''A2'' where id=''10000000-0000-0000-0000-0000000000a1''');   -- ROWS:1
select _dml('a_set_interval','update public.area_monitors set interval_minutes=30, next_run_at=''2000-01-01T00:00:00Z'' where id=''10000000-0000-0000-0000-0000000000a1''');
select _sel('a_interval_val','select interval_minutes::text from public.area_monitors where id=''10000000-0000-0000-0000-0000000000a1''');   -- 30 (config changed)
select _sel('a_next_recomp', 'select (next_run_at > now() - interval ''2 minutes'')::text from public.area_monitors where id=''10000000-0000-0000-0000-0000000000a1''');  -- true (recomputed, NOT year-2000)
select _dml('a_toggle',      'update public.area_monitors set enabled=false where id=''10000000-0000-0000-0000-0000000000a1''');-- ROWS:1
-- cannot touch B's monitor
select _dml('a_edit_b_mon', 'update public.area_monitors set name=''HACK'' where id=''20000000-0000-0000-0000-0000000000b1''');-- ROWS:0
select _dml('a_del_b_mon',  'delete from public.area_monitors where id=''20000000-0000-0000-0000-0000000000b1''');             -- ROWS:0
-- cannot create a monitor owned by B (WITH CHECK)
select _dml('a_ins_as_b',   'insert into public.area_monitors(user_id,name,geometry) values (''22222222-2222-2222-2222-222222222222'',''spoof'',''{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,1],[0,0]]]}''::jsonb)');
-- cannot call the service-role claim RPCs (quota/lock bypass blocked)
select _sel('a_claim',      'select count(*) from public.monitor_claim_due(5,15)');   -- DENIED
select _sel('a_claim_one',  'select claimed from public.monitor_claim_one(''10000000-0000-0000-0000-0000000000a1'',''11111111-1111-1111-1111-111111111111'')'); -- DENIED (runner-only)
-- (#R144) plan-limit attribute-leak fix: OWN cap via the self RPC is fine, but a
-- user CANNOT call monitor_limit(uuid) with an arbitrary UUID to probe another
-- user's plan/admin state (execute revoked → DENIED).
select _sel('a_limit_self', 'select public.monitor_limit_self()::text');                                        -- 5 (own, free)
select _sel('a_limit_uuid', 'select public.monitor_limit(''11111111-1111-1111-1111-111111111111'')::text');     -- DENIED (even about self, the raw fn is revoked)
select _sel('a_limit_probe','select public.monitor_limit(''33333333-3333-3333-3333-333333333333'')::text');     -- DENIED (cannot probe admin''s plan)
-- (#R144) seen-items ledger: A reads only its own rows.
select _sel('a_seen_own',   'select count(*) from public.monitor_seen_items where monitor_id=''10000000-0000-0000-0000-0000000000a1''');  -- 1 (seeded)
select _sel('a_seen_all',   'select count(*) from public.monitor_seen_items');                                  -- 1 (only own)
reset role;

-- ─────────────────────────── USER B (authenticated) ────────────────────────
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select _sel('b_own_mon',   'select count(*) from public.area_monitors');    -- 1 (only own)
select _sel('b_a_mon',     'select count(*) from public.area_monitors where id=''10000000-0000-0000-0000-0000000000a1'''); -- 0 (A''s)
select _sel('b_runs',      'select count(*) from public.monitor_runs');      -- 0 (A''s run invisible)
select _sel('b_ev',        'select count(*) from public.monitor_evidence');  -- 0
select _sel('b_reports',   'select count(*) from public.monitor_reports');   -- 0
select _sel('b_seen',      'select count(*) from public.monitor_seen_items');-- 0 (A''s ledger invisible, #R144)
reset role;

-- ─────────────────────────── ADMIN — no backdoor into private monitors ─────
-- (Monitors are private per-user; unlike feedback/donations, admins get NO extra
--  access. Admin owns no monitors → sees zero.)
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select _sel('admin_mon',   'select count(*) from public.area_monitors');     -- 0 (admin owns none; no backdoor)
select _sel('admin_rep',   'select count(*) from public.monitor_reports');   -- 0
select _sel('admin_limit', 'select public.monitor_limit_self()::text');      -- 200 (own, unlimited plan; #R144 self-only)
reset role;

-- ─────────────────────────── SERVICE ROLE (the runner) ─────────────────────
-- Captured BEFORE the enforcement block below so counts stay deterministic.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select _sel('svc_all_mon', 'select count(*) from public.area_monitors');                 -- 2 (bypass RLS)
select _sel('svc_all_rep', 'select count(*) from public.monitor_reports');               -- 1
select _dml('svc_ins_run', 'insert into public.monitor_runs(monitor_id,user_id,status,trigger) values (''20000000-0000-0000-0000-0000000000b1'',''22222222-2222-2222-2222-222222222222'',''success_no_change'',''schedule'')'); -- ROWS:1
select _sel('svc_claim',   'select count(*) from public.monitor_claim_due(5,15)');       -- 0 (seed monitors due in +1h → none claimed)
-- (#R144) ATOMIC MANUAL CLAIM (monitor_claim_one). Make B due + unlocked, then:
select _dml('svc_b_due',      'update public.area_monitors set next_run_at=now()-interval ''1 minute'', running_since=null, enabled=true, last_run_at=null where id=''20000000-0000-0000-0000-0000000000b1''');
select _sel('svc_claim1',     'select claimed||'':''||reason from public.monitor_claim_one(''20000000-0000-0000-0000-0000000000b1'',''22222222-2222-2222-2222-222222222222'')');  -- true:claimed (locks it)
select _sel('svc_claim2',     'select claimed||'':''||reason from public.monitor_claim_one(''20000000-0000-0000-0000-0000000000b1'',''22222222-2222-2222-2222-222222222222'')');  -- false:already_running (no double success)
select _sel('svc_claim_owner','select claimed||'':''||reason from public.monitor_claim_one(''20000000-0000-0000-0000-0000000000b1'',''11111111-1111-1111-1111-111111111111'')');  -- false:not_found (wrong owner)
select _sel('svc_claim_cron', 'select count(*) from public.monitor_claim_due(5,15) where id=''20000000-0000-0000-0000-0000000000b1''');  -- 0 (cron won''t grab a manually-locked, due monitor)
-- cooldown: reset the lock but stamp a very recent last_run_at → claim refused.
select _dml('svc_b_cooldown', 'update public.area_monitors set running_since=null, last_run_at=now() where id=''20000000-0000-0000-0000-0000000000b1''');
select _sel('svc_claim_cool', 'select claimed||'':''||reason from public.monitor_claim_one(''20000000-0000-0000-0000-0000000000b1'',''22222222-2222-2222-2222-222222222222'',30,15)');  -- false:cooldown
-- stale lock IS reclaimable (running_since older than p_stale_minutes).
select _dml('svc_b_stale',    'update public.area_monitors set running_since=now()-interval ''30 minutes'', last_run_at=null where id=''20000000-0000-0000-0000-0000000000b1''');
select _sel('svc_claim_stale','select claimed||'':''||reason from public.monitor_claim_one(''20000000-0000-0000-0000-0000000000b1'',''22222222-2222-2222-2222-222222222222'',30,15)');  -- true:claimed (stale reclaimed)
-- disabled monitor cannot be claimed.
select _dml('svc_b_disable',  'update public.area_monitors set enabled=false, running_since=null, last_run_at=null where id=''20000000-0000-0000-0000-0000000000b1''');
select _sel('svc_claim_dis',  'select claimed||'':''||reason from public.monitor_claim_one(''20000000-0000-0000-0000-0000000000b1'',''22222222-2222-2222-2222-222222222222'')');  -- false:disabled
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
select is((select v from _cap where k='anon_seen'),     'DENIED', 'anon cannot read monitor_seen_items (#R144)');
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
-- (#R144) run-state guard TRIGGER — the UPDATE lands (ROWS:1, prod-like table
-- grant) but the value is pinned to OLD (the true prod-grade protection).
select is((select v from _cap where k='a_lock_val'),  '<null>', 'A CANNOT change running_since (trigger freezes it → seed <null>)');
select is((select v from _cap where k='a_count_val'), '1',      'A CANNOT change run_count (trigger freezes it → seed 1)');
select is((select v from _cap where k='a_status_val'),'success','A CANNOT change last_status (trigger freezes it → seed success)');
select is((select v from _cap where k='a_next_future'),'true', 'A CANNOT inject a past next_run_at (config edit keeps it in the future)');
select is((select v from _cap where k='a_interval_val'),'30',  'A CAN change interval_minutes (a config column)');
select is((select v from _cap where k='a_next_recomp'),'true', 'next_run_at is SERVER-recomputed on interval change, not user-picked');
select is((select v from _cap where k='a_edit_name'),'ROWS:1', 'A can rename its own monitor');
select is((select v from _cap where k='a_toggle'),   'ROWS:1', 'A can enable/disable its own monitor');
select is((select v from _cap where k='a_edit_b_mon'),'ROWS:0','A cannot edit B''s monitor');
select is((select v from _cap where k='a_del_b_mon'),'ROWS:0', 'A cannot delete B''s monitor');
select is((select v from _cap where k='a_ins_as_b'), 'DENIED', 'A cannot create a monitor owned by B (WITH CHECK)');
select is((select v from _cap where k='a_claim'),    'DENIED', 'A cannot call monitor_claim_due (runner-only)');
select is((select v from _cap where k='a_claim_one'),'DENIED', 'A cannot call monitor_claim_one (runner-only, #R144)');
select is((select v from _cap where k='a_limit_self'),'5',     'A can read OWN cap via monitor_limit_self (free → 5)');
select is((select v from _cap where k='a_limit_uuid'),'DENIED','A cannot call raw monitor_limit(uuid) (#R144)');
select is((select v from _cap where k='a_limit_probe'),'DENIED','A cannot probe another user''s plan via monitor_limit(uuid) (#R144)');
select is((select v from _cap where k='a_seen_own'), '1',      'A reads its own seen-items ledger row');
select is((select v from _cap where k='a_seen_all'), '1',      'A sees only its own seen-items (#R144)');
-- user B isolation
select is((select v from _cap where k='b_own_mon'), '1', 'B reads own monitor');
select is((select v from _cap where k='b_a_mon'),   '0', 'B cannot read A''s monitor');
select is((select v from _cap where k='b_runs'),    '0', 'B cannot read A''s runs');
select is((select v from _cap where k='b_ev'),      '0', 'B cannot read A''s evidence');
select is((select v from _cap where k='b_reports'), '0', 'B cannot read A''s reports');
select is((select v from _cap where k='b_seen'),    '0', 'B cannot read A''s seen-items ledger (#R144)');
-- admin: no private-monitor backdoor
select is((select v from _cap where k='admin_mon'),   '0',   'admin has NO backdoor into private monitors');
select is((select v from _cap where k='admin_rep'),   '0',   'admin cannot read others'' reports');
select is((select v from _cap where k='admin_limit'), '200', 'admin/unlimited own monitor limit is 200 (self-only, #R144)');
-- service role
select is((select v from _cap where k='svc_all_mon'), '2',      'service_role sees all monitors (bypass RLS)');
select is((select v from _cap where k='svc_all_rep'), '1',      'service_role sees all reports');
select is((select v from _cap where k='svc_ins_run'), 'ROWS:1', 'service_role (runner) can write a run');
select is((select v from _cap where k='svc_claim'),   '0',      'monitor_claim_due returns nothing when no monitor is due');
-- (#R144) atomic manual claim
select is((select v from _cap where k='svc_claim1'),     'true:claimed',          'monitor_claim_one claims a due, unlocked, owned monitor');
select is((select v from _cap where k='svc_claim2'),     'false:already_running', 'a second concurrent claim is refused — never two successes');
select is((select v from _cap where k='svc_claim_owner'),'false:not_found',       'a non-owner cannot claim the monitor');
select is((select v from _cap where k='svc_claim_cron'), '0',                     'cron claim skips a monitor a manual claim already locked (no conflict)');
select is((select v from _cap where k='svc_claim_cool'), 'false:cooldown',        'claim refused during the manual cooldown');
select is((select v from _cap where k='svc_claim_stale'),'true:claimed',          'a stale lock is reclaimable');
select is((select v from _cap where k='svc_claim_dis'),  'false:disabled',        'a disabled monitor cannot be claimed');
-- limit enforcement
select is((select v from _cap where k='a_ins2'), 'ROWS:1',    'A insert #2 ok (under limit)');
select is((select v from _cap where k='a_ins5'), 'ROWS:1',    'A insert #5 ok (reaches limit 5)');
select is((select v from _cap where k='a_ins6'), 'ERR:23514', 'A insert #6 rejected by the plan limit (check_violation)');

select * from finish();
rollback;
