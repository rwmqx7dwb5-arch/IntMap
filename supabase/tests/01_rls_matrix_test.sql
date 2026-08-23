-- ============================================================================
--  pgTAP · 01 RLS matrix — prove that RLS + grants actually isolate users.
--  (§7.3 of the data-protection spec.)
--
--  HOW IT WORKS
--    The role is switched at the TOP LEVEL (Postgres forbids SET ROLE inside a
--    SECURITY DEFINER function), so each block runs its captures AS the
--    impersonated role — RLS + column/table grants apply. Two SECURITY INVOKER
--    helpers record the outcome into _cap (a plain table the impersonated roles
--    are granted to write):
--      _sel(key, q) → the scalar q returned, or 'DENIED' (42501) / 'ERR:<code>'
--      _dml(key, q) → 'ROWS:<n>' affected, or 'DENIED' / 'ERR:<code>'
--    A blocked read errors only when a grant is missing (→ DENIED); RLS
--    row-filtering yields 0 rows / ROWS:0. We gather into _cap, then assert as
--    the superuser at the end.
-- ============================================================================
begin;
select no_plan();

-- The test session must be able to impersonate the platform roles (superuser can;
-- otherwise it needs membership). Grant it defensively (no-op if already a member).
do $$ begin execute format('grant anon, authenticated, service_role to %I', current_user); exception when others then null; end $$;

-- Plain table (rolled back at end) the impersonated roles may write. Temp tables
-- live in a per-session schema other roles can't reach, so a regular table is used.
create table _cap (k text primary key, v text);
grant insert, select on _cap to anon, authenticated, service_role;

-- SECURITY INVOKER (default): the body runs as the CALLER's role, so `execute q`
-- and the _cap insert both run as whichever role is currently SET.
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
select _sel('anon_profiles',  'select count(*) from public.profiles');            -- no grant → DENIED
select _sel('anon_ppublic',   'select count(*) from public.profiles_public');      -- public → 3
select _sel('anon_feedback',  'select count(*) from public.feedback');             -- no grant → DENIED
select _sel('anon_bugreports','select count(*) from public.bug_reports');          -- no grant → DENIED
select _sel('anon_donations', 'select count(*) from public.donations');            -- no grant → DENIED
select _sel('anon_aiusage',   'select count(*) from public.ai_usage');             -- no grant → DENIED
select _sel('anon_reports',   'select count(*) from public.community_reports');    -- no grant → DENIED
select _sel('anon_news',      'select count(*) from public.current_news');         -- public → 2
select _sel('anon_posts',     'select count(*) from public.community_posts');       -- public → 2
select _dml('anon_fb_insert', 'insert into public.feedback(rating,comment) values (4,''anon note'')');  -- allowed
select _dml('anon_post_insert','insert into public.community_posts(user_id,title) values (''11111111-1111-1111-1111-111111111111'',''x'')'); -- DENIED
reset role;

-- ─────────────────────────── USER A (authenticated) ────────────────────────
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _sel('a_own_profile',  'select count(*) from public.profiles where id=''11111111-1111-1111-1111-111111111111''');  -- 1
select _sel('a_other_profile','select count(*) from public.profiles where id=''22222222-2222-2222-2222-222222222222''');  -- 0
select _sel('a_all_profiles', 'select count(*) from public.profiles');                    -- 1 (only own)
select _sel('a_ppublic',      'select count(*) from public.profiles_public');             -- 3
select _dml('a_escalate',     'update public.profiles set is_admin=true where id=''11111111-1111-1111-1111-111111111111''');   -- DENIED (column priv)
select _dml('a_set_plan',     'update public.profiles set plan=''unlimited'' where id=''11111111-1111-1111-1111-111111111111'''); -- DENIED
select _dml('a_update_name',  'update public.profiles set display_name=''A2'' where id=''11111111-1111-1111-1111-111111111111''');-- ROWS:1
select _dml('a_update_bname', 'update public.profiles set display_name=''HACK'' where id=''22222222-2222-2222-2222-222222222222'''); -- ROWS:0
select _sel('a_own_fav',      'select count(*) from public.favorites where user_id=''11111111-1111-1111-1111-111111111111''');  -- 1
select _sel('a_see_b_fav',    'select count(*) from public.favorites where user_id=''22222222-2222-2222-2222-222222222222''');  -- 0
select _dml('a_update_b_fav', 'update public.favorites set article_title=''x'' where user_id=''22222222-2222-2222-2222-222222222222'''); -- ROWS:0
select _dml('a_delete_b_fav', 'delete from public.favorites where user_id=''22222222-2222-2222-2222-222222222222'''); -- ROWS:0
select _dml('a_ins_aiusage',  'insert into public.ai_usage(user_id,usage_date,count) values (''11111111-1111-1111-1111-111111111111'',current_date,0)'); -- DENIED
select _dml('a_upd_aiusage',  'update public.ai_usage set count=0 where user_id=''11111111-1111-1111-1111-111111111111'''); -- DENIED
select _sel('a_own_aiusage',  'select count(*) from public.ai_usage where user_id=''11111111-1111-1111-1111-111111111111''');  -- 1
select _sel('a_see_b_aiusage','select count(*) from public.ai_usage where user_id=''22222222-2222-2222-2222-222222222222''');  -- 0
select _sel('a_exec_incr',    'select allowed from public.increment_ai_usage(''11111111-1111-1111-1111-111111111111'',30)');  -- DENIED
select _sel('a_exec_refund',  'select public.refund_ai_usage(''11111111-1111-1111-1111-111111111111'')');                     -- DENIED
select _sel('a_exec_turn',    'select allowed from public.consume_ai_turn(''11111111-1111-1111-1111-111111111111'',30,''t'',3,900)');   -- DENIED
select _sel('a_sel_turns',    'select count(*) from public.ai_turns');                                                        -- 0 (own rows only)
select _sel('a_read_feedback','select count(*) from public.feedback');                     -- 0 (RLS admin-only)
select _sel('a_read_donations','select count(*) from public.donations');                   -- 0
select _sel('a_read_bugs',    'select count(*) from public.bug_reports');                   -- 0
select _sel('a_read_reports', 'select count(*) from public.community_reports');             -- 0
select _dml('a_del_feedback', 'delete from public.feedback');                               -- ROWS:0 (RLS)
select _dml('a_del_b_post',   'delete from public.community_posts where id=2');             -- ROWS:0 (RLS)
select _dml('a_upd_b_post',   'update public.community_posts set title=''HACK'' where id=2'); -- ROWS:0 (RLS)
select _dml('a_ins_post_as_b','insert into public.community_posts(user_id,title) values (''22222222-2222-2222-2222-222222222222'',''spoof'')'); -- DENIED (WITH CHECK)
select _dml('a_ins_own_post', 'insert into public.community_posts(user_id,title) values (''11111111-1111-1111-1111-111111111111'',''mine'')');  -- ROWS:1
reset role;

-- ─────────────────────────── ADMIN ─────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select _sel('admin_feedback',  'select count(*) from public.feedback');            -- >0
select _sel('admin_donations', 'select count(*) from public.donations');          -- >0
select _sel('admin_bugs',      'select count(*) from public.bug_reports');        -- >0
select _sel('admin_reports',   'select count(*) from public.community_reports');  -- >0
select _sel('admin_all_prof',  'select count(*) from public.profiles');           -- 3
select _dml('admin_del_fb',    'delete from public.feedback where id=1');          -- ROWS:1
select _dml('admin_upd_b_post','update public.community_posts set title=''MOD'' where id=2'); -- ROWS:1
select _dml('admin_ins_geo',   'insert into public.geo_pins(type,name_en,lng,lat) values (''city'',''Z'',0,0)'); -- ROWS:1
reset role;

-- ─────────────────────────── SERVICE ROLE ──────────────────────────────────
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select _sel('svc_profiles',  'select count(*) from public.profiles');   -- 3 (bypass RLS)
select _sel('svc_increment', 'select used::text || ''/'' || allowed::text from public.increment_ai_usage(''22222222-2222-2222-2222-222222222222'',30)'); -- 3/true
select _dml('svc_ins_news',  'insert into public.current_news(lang,link,title) values (''en'',''https://example.test/svc'',''svc'')'); -- ROWS:1
reset role;

-- ─────────────────────────── ASSERTIONS (as superuser) ─────────────────────
-- anon
select is((select v from _cap where k='anon_profiles'),  'DENIED', 'anon cannot read profiles (email is not world-readable)');
select is((select v from _cap where k='anon_ppublic'),   '3',      'anon CAN read profiles_public (safe columns)');
select is((select v from _cap where k='anon_feedback'),  'DENIED', 'anon cannot read feedback');
select is((select v from _cap where k='anon_bugreports'),'DENIED', 'anon cannot read bug_reports');
select is((select v from _cap where k='anon_donations'), 'DENIED', 'anon cannot read donations');
select is((select v from _cap where k='anon_aiusage'),   'DENIED', 'anon cannot read ai_usage');
select is((select v from _cap where k='anon_reports'),   'DENIED', 'anon cannot read community_reports');
select is((select v from _cap where k='anon_news'),      '2',      'anon CAN read current_news');
select is((select v from _cap where k='anon_posts'),     '2',      'anon CAN read community_posts');
select is((select v from _cap where k='anon_fb_insert'), 'ROWS:1', 'anon CAN submit feedback');
select is((select v from _cap where k='anon_post_insert'),'DENIED','anon cannot create a community post');
-- user A vs B isolation + escalation
select is((select v from _cap where k='a_own_profile'), '1',      'A can read own profile');
select is((select v from _cap where k='a_other_profile'),'0',     'A cannot read B''s profile row');
select is((select v from _cap where k='a_all_profiles'),'1',      'A sees only own profile row');
select is((select v from _cap where k='a_ppublic'),     '3',      'A can read all public profiles');
select is((select v from _cap where k='a_escalate'),    'DENIED', 'A CANNOT make itself admin (no is_admin column privilege)');
select is((select v from _cap where k='a_set_plan'),    'DENIED', 'A CANNOT change its own plan');
select is((select v from _cap where k='a_update_name'), 'ROWS:1', 'A can update own display name');
select is((select v from _cap where k='a_update_bname'),'ROWS:0', 'A cannot update B''s profile');
select is((select v from _cap where k='a_own_fav'),     '1',      'A can read own favorites');
select is((select v from _cap where k='a_see_b_fav'),   '0',      'A cannot read B''s favorites');
select is((select v from _cap where k='a_update_b_fav'),'ROWS:0', 'A cannot update B''s favorites');
select is((select v from _cap where k='a_delete_b_fav'),'ROWS:0', 'A cannot delete B''s favorites');
select is((select v from _cap where k='a_ins_aiusage'), 'DENIED', 'A cannot insert into ai_usage');
select is((select v from _cap where k='a_upd_aiusage'), 'DENIED', 'A cannot change its own AI usage count');
select is((select v from _cap where k='a_own_aiusage'), '1',      'A can read own ai_usage');
select is((select v from _cap where k='a_see_b_aiusage'),'0',     'A cannot read B''s ai_usage');
select is((select v from _cap where k='a_exec_incr'),   'DENIED', 'A cannot call increment_ai_usage (quota bypass blocked)');
select is((select v from _cap where k='a_exec_refund'), 'DENIED', 'A cannot call refund_ai_usage');
select is((select v from _cap where k='a_exec_turn'),   'DENIED', 'A cannot call consume_ai_turn (turn-quota bypass blocked)');
select is((select v from _cap where k='a_sel_turns'),   '0',      'A reads only its OWN turn rows');
select is((select v from _cap where k='a_read_feedback'),'0',     'A (non-admin) sees no feedback');
select is((select v from _cap where k='a_read_donations'),'0',    'A (non-admin) sees no donations');
select is((select v from _cap where k='a_read_bugs'),   '0',      'A (non-admin) sees no bug reports');
select is((select v from _cap where k='a_read_reports'),'0',      'A (non-admin) sees no reports');
select is((select v from _cap where k='a_del_feedback'),'ROWS:0', 'A cannot delete feedback');
select is((select v from _cap where k='a_del_b_post'),  'ROWS:0', 'A cannot delete B''s post');
select is((select v from _cap where k='a_upd_b_post'),  'ROWS:0', 'A cannot edit B''s post');
select is((select v from _cap where k='a_ins_post_as_b'),'DENIED','A cannot post as B (WITH CHECK)');
select is((select v from _cap where k='a_ins_own_post'),'ROWS:1', 'A can create its own post');
-- admin
select ok((select v from _cap where k='admin_feedback')  ~ '^[1-9]', 'admin CAN read feedback');
select ok((select v from _cap where k='admin_donations') ~ '^[1-9]', 'admin CAN read donations');
select ok((select v from _cap where k='admin_bugs')      ~ '^[1-9]', 'admin CAN read bug reports');
select ok((select v from _cap where k='admin_reports')   ~ '^[1-9]', 'admin CAN read reports');
select is((select v from _cap where k='admin_all_prof'), '3',       'admin can read all profiles');
select is((select v from _cap where k='admin_del_fb'),   'ROWS:1',  'admin CAN delete feedback');
select is((select v from _cap where k='admin_upd_b_post'),'ROWS:1', 'admin CAN moderate any post');
select is((select v from _cap where k='admin_ins_geo'),  'ROWS:1',  'admin CAN edit the gazetteer');
-- service role
select is((select v from _cap where k='svc_profiles'),  '3',       'service_role bypasses RLS (sees all profiles)');
select is((select v from _cap where k='svc_increment'), '3/true',  'service_role can consume AI quota via RPC');
select is((select v from _cap where k='svc_ins_news'),  'ROWS:1',  'service_role can write current_news');

select * from finish();
rollback;
