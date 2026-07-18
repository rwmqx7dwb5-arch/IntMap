-- ============================================================================
--  pgTAP · 01 RLS matrix — prove that RLS + grants actually isolate users.
--  (§7.3 of the data-protection spec.)
--
--  HOW IT WORKS
--    Two SECURITY DEFINER helpers switch to the impersonated role for ONLY the
--    tested statement (so RLS + column/table grants apply to it), then record the
--    outcome as the superuser:
--      _sel(key, subj, q) → the scalar q returned, or 'DENIED' (42501) / 'ERR:<code>'
--      _dml(key, subj, q) → 'ROWS:<n>' affected, or 'DENIED' / 'ERR:<code>'
--    subj ∈ {anon, A, B, admin, service}. A blocked SELECT/READ errors only when a
--    grant is missing (→ DENIED); RLS row-filtering yields 0 rows / ROWS:0. We
--    gather everything into _cap, then assert as superuser.
-- ============================================================================
begin;
select no_plan();

create temp table _cap (k text primary key, v text);

create function _rolename(subj text) returns text language sql immutable as $$
  select case subj when 'anon' then 'anon' when 'service' then 'service_role' else 'authenticated' end
$$;
create function _claims(subj text) returns text language sql immutable as $$
  select case subj
    when 'anon'    then '{"role":"anon"}'
    when 'service' then '{"role":"service_role"}'
    else json_build_object('sub', case subj
        when 'A'     then '11111111-1111-1111-1111-111111111111'
        when 'B'     then '22222222-2222-2222-2222-222222222222'
        when 'admin' then '33333333-3333-3333-3333-333333333333' end,
      'role','authenticated')::text end
$$;

create function _sel(k text, subj text, q text) returns void language plpgsql security definer as $$
declare c text;
begin
  perform set_config('request.jwt.claims', _claims(subj), true);
  execute 'set local role ' || quote_ident(_rolename(subj));
  begin
    execute q into c;
  exception
    when insufficient_privilege then reset role; insert into _cap values (k, 'DENIED'); return;
    when others then reset role; insert into _cap values (k, 'ERR:' || sqlstate); return;
  end;
  reset role;
  insert into _cap values (k, coalesce(c, '<null>'));
end;
$$;

create function _dml(k text, subj text, q text) returns void language plpgsql security definer as $$
declare n integer;
begin
  perform set_config('request.jwt.claims', _claims(subj), true);
  execute 'set local role ' || quote_ident(_rolename(subj));
  begin
    execute q; get diagnostics n = row_count;
  exception
    when insufficient_privilege then reset role; insert into _cap values (k, 'DENIED'); return;
    when others then reset role; insert into _cap values (k, 'ERR:' || sqlstate); return;
  end;
  reset role;
  insert into _cap values (k, 'ROWS:' || n);
end;
$$;

-- ─────────────────────────── ANON (logged out) ─────────────────────────────
select _sel('anon_profiles',   'anon', 'select count(*) from public.profiles');            -- no grant → DENIED
select _sel('anon_ppublic',    'anon', 'select count(*) from public.profiles_public');      -- public → 3
select _sel('anon_feedback',   'anon', 'select count(*) from public.feedback');             -- no grant → DENIED
select _sel('anon_bugreports', 'anon', 'select count(*) from public.bug_reports');          -- no grant → DENIED
select _sel('anon_donations',  'anon', 'select count(*) from public.donations');            -- no grant → DENIED
select _sel('anon_aiusage',    'anon', 'select count(*) from public.ai_usage');             -- no grant → DENIED
select _sel('anon_reports',    'anon', 'select count(*) from public.community_reports');    -- no grant → DENIED
select _sel('anon_news',       'anon', 'select count(*) from public.current_news');         -- public → 2
select _sel('anon_posts',      'anon', 'select count(*) from public.community_posts');       -- public → 2
select _dml('anon_fb_insert',  'anon', 'insert into public.feedback(rating,comment) values (4,''anon note'')');  -- allowed
select _dml('anon_post_insert','anon', 'insert into public.community_posts(user_id,title) values (''11111111-1111-1111-1111-111111111111'',''x'')'); -- DENIED

-- ─────────────────────────── USER A vs B ───────────────────────────────────
select _sel('a_own_profile',  'A', 'select count(*) from public.profiles where id=''11111111-1111-1111-1111-111111111111''');  -- 1
select _sel('a_other_profile','A', 'select count(*) from public.profiles where id=''22222222-2222-2222-2222-222222222222''');  -- 0
select _sel('a_all_profiles', 'A', 'select count(*) from public.profiles');                    -- 1 (only own)
select _sel('a_ppublic',      'A', 'select count(*) from public.profiles_public');             -- 3
select _dml('a_escalate',     'A', 'update public.profiles set is_admin=true where id=''11111111-1111-1111-1111-111111111111''');   -- DENIED (column priv)
select _dml('a_set_plan',     'A', 'update public.profiles set plan=''unlimited'' where id=''11111111-1111-1111-1111-111111111111'''); -- DENIED
select _dml('a_update_name',  'A', 'update public.profiles set display_name=''A2'' where id=''11111111-1111-1111-1111-111111111111''');-- ROWS:1
select _dml('a_update_bname', 'A', 'update public.profiles set display_name=''HACK'' where id=''22222222-2222-2222-2222-222222222222'''); -- ROWS:0
select _sel('a_own_fav',      'A', 'select count(*) from public.favorites where user_id=''11111111-1111-1111-1111-111111111111''');  -- 1
select _sel('a_see_b_fav',    'A', 'select count(*) from public.favorites where user_id=''22222222-2222-2222-2222-222222222222''');  -- 0
select _dml('a_update_b_fav', 'A', 'update public.favorites set article_title=''x'' where user_id=''22222222-2222-2222-2222-222222222222'''); -- ROWS:0
select _dml('a_delete_b_fav', 'A', 'delete from public.favorites where user_id=''22222222-2222-2222-2222-222222222222'''); -- ROWS:0
select _dml('a_ins_aiusage',  'A', 'insert into public.ai_usage(user_id,usage_date,count) values (''11111111-1111-1111-1111-111111111111'',current_date,0)'); -- DENIED
select _dml('a_upd_aiusage',  'A', 'update public.ai_usage set count=0 where user_id=''11111111-1111-1111-1111-111111111111'''); -- DENIED
select _sel('a_own_aiusage',  'A', 'select count(*) from public.ai_usage where user_id=''11111111-1111-1111-1111-111111111111''');  -- 1
select _sel('a_see_b_aiusage','A', 'select count(*) from public.ai_usage where user_id=''22222222-2222-2222-2222-222222222222''');  -- 0
select _sel('a_exec_incr',    'A', 'select allowed from public.increment_ai_usage(''11111111-1111-1111-1111-111111111111'',30)');  -- DENIED
select _sel('a_exec_refund',  'A', 'select public.refund_ai_usage(''11111111-1111-1111-1111-111111111111'')');                     -- DENIED
select _sel('a_read_feedback','A', 'select count(*) from public.feedback');                     -- 0 (RLS admin-only)
select _sel('a_read_donations','A','select count(*) from public.donations');                    -- 0
select _sel('a_read_bugs',    'A', 'select count(*) from public.bug_reports');                   -- 0
select _sel('a_read_reports', 'A', 'select count(*) from public.community_reports');             -- 0
select _dml('a_del_feedback', 'A', 'delete from public.feedback');                               -- ROWS:0 (RLS)
select _dml('a_del_b_post',   'A', 'delete from public.community_posts where id=2');             -- ROWS:0 (RLS)
select _dml('a_upd_b_post',   'A', 'update public.community_posts set title=''HACK'' where id=2'); -- ROWS:0 (RLS)
select _dml('a_ins_post_as_b','A', 'insert into public.community_posts(user_id,title) values (''22222222-2222-2222-2222-222222222222'',''spoof'')'); -- DENIED (WITH CHECK)
select _dml('a_ins_own_post', 'A', 'insert into public.community_posts(user_id,title) values (''11111111-1111-1111-1111-111111111111'',''mine'')');  -- ROWS:1

-- ─────────────────────────── ADMIN ─────────────────────────────────────────
select _sel('admin_feedback',  'admin', 'select count(*) from public.feedback');            -- >0
select _sel('admin_donations', 'admin', 'select count(*) from public.donations');          -- >0
select _sel('admin_bugs',      'admin', 'select count(*) from public.bug_reports');        -- >0
select _sel('admin_reports',   'admin', 'select count(*) from public.community_reports');  -- >0
select _sel('admin_all_prof',  'admin', 'select count(*) from public.profiles');           -- 3
select _dml('admin_del_fb',    'admin', 'delete from public.feedback where id=1');          -- ROWS:1
select _dml('admin_upd_b_post','admin', 'update public.community_posts set title=''MOD'' where id=2'); -- ROWS:1
select _dml('admin_ins_geo',   'admin', 'insert into public.geo_pins(type,name_en,lng,lat) values (''city'',''Z'',0,0)'); -- ROWS:1

-- ─────────────────────────── SERVICE ROLE ──────────────────────────────────
select _sel('svc_profiles',  'service', 'select count(*) from public.profiles');   -- 3 (bypass RLS)
select _sel('svc_increment', 'service', 'select used::text || ''/'' || allowed::text from public.increment_ai_usage(''22222222-2222-2222-2222-222222222222'',30)'); -- 3/true
select _dml('svc_ins_news',  'service', 'insert into public.current_news(lang,link,title) values (''en'',''https://example.test/svc'',''svc'')'); -- ROWS:1

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
