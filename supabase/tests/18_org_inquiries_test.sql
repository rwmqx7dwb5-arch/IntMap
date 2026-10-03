-- ============================================================================
--  pgTAP · 18 — sales-channels: organisations' enquiries and the supporters list.
--
--  WHAT THIS PROVES (the half that needs a Postgres):
--    · org_inquiries — RLS on; anon and a signed-in non-admin can neither read, insert, update nor
--      delete; an admin reads, triages (status / admin_note / handled_at only) and deletes; the
--      service role (the reader-reports Edge Function) inserts; the CHECKs refuse an enquiry without
--      consent, with an unknown audience/purpose, or with an address that is not one.
--    · supporters — everyone reads the LISTED rows and only those, anon only three columns; only an
--      admin writes; a month that is not the first of a month is refused.
--    · purge_org_inquiries — SECURITY DEFINER, pinned search_path, service_role only; removes spam
--      after 30 days and everything after 730, and keeps the rest.
--  The Edge Function's half (shape, honeypot, identity) is evaluated in Node by
--  tests/sales-channels-checks.test.mjs.
-- ============================================================================
begin;
select no_plan();

do $imp$ begin execute format('grant anon, authenticated, service_role to %I', current_user); exception when others then null; end $imp$;

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
declare n int;
begin
  execute q; get diagnostics n = row_count;
  insert into _cap values (k, 'ROWS:' || n);
exception
  when insufficient_privilege then insert into _cap values (k, 'DENIED');
  when others then insert into _cap values (k, 'ERR:' || sqlstate);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  1. THE SURFACE
-- ─────────────────────────────────────────────────────────────────────────────
select has_table('public', 'org_inquiries', 'sales-channels: org_inquiries exists');
select has_table('public', 'supporters',    'sales-channels: supporters exists');
select has_function('public', 'purge_org_inquiries', array['integer', 'integer'], 'sales-channels: purge_org_inquiries exists');
select ok((select relrowsecurity from pg_class where oid = 'public.org_inquiries'::regclass), 'sales-channels: RLS on org_inquiries');
select ok((select relrowsecurity from pg_class where oid = 'public.supporters'::regclass),    'sales-channels: RLS on supporters');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'org_inquiries' and cmd in ('INSERT', 'ALL')), 0,
          'sales-channels: org_inquiries has no INSERT policy — the Edge Function (service role) is the only writer');
select ok(not has_any_column_privilege('anon',          'public.org_inquiries', 'INSERT'), 'sales-channels: anon holds no INSERT on org_inquiries');
select ok(not has_any_column_privilege('authenticated', 'public.org_inquiries', 'INSERT'), 'sales-channels: authenticated holds no INSERT on org_inquiries');
select ok(not has_table_privilege('anon', 'public.org_inquiries', 'SELECT'),               'sales-channels: anon holds no SELECT on org_inquiries');
select ok(not has_column_privilege('authenticated', 'public.org_inquiries', 'message', 'UPDATE'), 'sales-channels: nobody but the sender writes the message (no UPDATE grant on it)');
select ok(not has_column_privilege('authenticated', 'public.org_inquiries', 'email',   'UPDATE'), 'sales-channels: …nor the address');
select ok(not has_any_column_privilege('anon', 'public.supporters', 'INSERT'), 'sales-channels: anon holds no INSERT on supporters');
select ok(not has_column_privilege('anon', 'public.supporters', 'consented_at', 'SELECT'), 'sales-channels: anon cannot read when consent was given');
select ok(has_column_privilege('anon', 'public.supporters', 'display_name', 'SELECT'),      'sales-channels: anon reads the display name');
select ok((select prosecdef from pg_proc where oid = 'public.purge_org_inquiries(integer,integer)'::regprocedure), 'sales-channels: the purge is SECURITY DEFINER');
select ok(exists(select 1 from unnest((select proconfig from pg_proc where oid = 'public.purge_org_inquiries(integer,integer)'::regprocedure)) e where e like 'search_path=%'),
          'sales-channels: the purge pins search_path');
select ok(not has_function_privilege('anon',          'public.purge_org_inquiries(integer,integer)', 'execute'), 'sales-channels: anon cannot purge');
select ok(not has_function_privilege('authenticated', 'public.purge_org_inquiries(integer,integer)', 'execute'), 'sales-channels: authenticated cannot purge');

-- ─────────────────────────────────────────────────────────────────────────────
--  2. THE WRITER — service_role (the reader-reports Edge Function), and the CHECKs
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select _dml('svc_ok', $q$insert into public.org_inquiries (audience, purpose, name, email, organization, message, consent, lang, page)
                       values ('newsroom', 'embed', 'A Reporter', 'desk@example.org', 'Example Daily', 'We would like to embed a map.', true, 'en', '/IntMap/contact.html')$q$);
select _dml('svc_noconsent', $q$insert into public.org_inquiries (audience, purpose, name, email, message, consent) values ('education', 'classroom', 'T', 't@example.org', 'x', false)$q$);
select _dml('svc_badaud',    $q$insert into public.org_inquiries (audience, purpose, name, email, message, consent) values ('advertiser', 'other', 'T', 't@example.org', 'x', true)$q$);
select _dml('svc_badmail',   $q$insert into public.org_inquiries (audience, purpose, name, email, message, consent) values ('other', 'other', 'T', 'not-an-address', 'x', true)$q$);
select _dml('svc_badurl',    $q$insert into public.org_inquiries (audience, purpose, name, email, message, consent, website) values ('other', 'other', 'T', 't@example.org', 'x', true, 'javascript:alert(1)')$q$);
reset role;
select is((select v from _cap where k = 'svc_ok'), 'ROWS:1', 'sales-channels: the service role stores an enquiry');
select is((select status from public.org_inquiries where email = 'desk@example.org'), 'new', 'sales-channels: a new enquiry starts as «new»');
select ok((select v from _cap where k = 'svc_noconsent') like 'ERR:%', 'sales-channels: an enquiry without consent is refused');
select ok((select v from _cap where k = 'svc_badaud')    like 'ERR:%', 'sales-channels: an unknown audience is refused');
select ok((select v from _cap where k = 'svc_badmail')   like 'ERR:%', 'sales-channels: an address without @ is refused');
select ok((select v from _cap where k = 'svc_badurl')    like 'ERR:%', 'sales-channels: a website that is not http(s) is refused');

-- ─────────────────────────────────────────────────────────────────────────────
--  3. WHO MAY READ AND TRIAGE
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select _sel('anon_sel', 'select count(*)::text from public.org_inquiries');
select _dml('anon_ins', $q$insert into public.org_inquiries (audience, purpose, name, email, message, consent) values ('other', 'other', 'S', 's@example.org', 'spam', true)$q$);
reset role;

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _sel('user_sel', 'select count(*)::text from public.org_inquiries');
select _dml('user_ins', $q$insert into public.org_inquiries (audience, purpose, name, email, message, consent) values ('other', 'other', 'S', 's@example.org', 'spam', true)$q$);
select _dml('user_upd', $q$update public.org_inquiries set status = 'closed'$q$);
select _dml('user_del', 'delete from public.org_inquiries');
reset role;

select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select _sel('admin_sel', 'select count(*)::text from public.org_inquiries');
select _dml('admin_triage', $q$update public.org_inquiries set status = 'replied', admin_note = 'answered by mail', handled_at = now() where email = 'desk@example.org'$q$);
select _dml('admin_rewrite', $q$update public.org_inquiries set message = 'edited' where email = 'desk@example.org'$q$);
reset role;

select is((select v from _cap where k = 'anon_sel'),  'DENIED', 'sales-channels: anon cannot read enquiries');
select is((select v from _cap where k = 'anon_ins'),  'DENIED', 'sales-channels: anon cannot insert an enquiry directly');
select is((select v from _cap where k = 'user_sel'),  '0',      'sales-channels: a non-admin reader sees no enquiry');
select is((select v from _cap where k = 'user_ins'),  'DENIED', 'sales-channels: a non-admin reader cannot insert directly');
select is((select v from _cap where k = 'user_upd'),  'ROWS:0', 'sales-channels: a non-admin reader changes no enquiry');
select is((select v from _cap where k = 'user_del'),  'ROWS:0', 'sales-channels: a non-admin reader deletes no enquiry');
select is((select v from _cap where k = 'admin_sel'), '1',      'sales-channels: an admin reads the enquiry');
select is((select v from _cap where k = 'admin_triage'), 'ROWS:1', 'sales-channels: an admin sets status, note and handled_at');
select is((select v from _cap where k = 'admin_rewrite'), 'DENIED', 'sales-channels: an admin cannot rewrite what the sender wrote');
select is((select status from public.org_inquiries where email = 'desk@example.org'), 'replied', 'sales-channels: …and the triage is stored');

-- ─────────────────────────────────────────────────────────────────────────────
--  4. SUPPORTERS
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select _dml('admin_sup', $q$insert into public.supporters (display_name, since_month, note, consented_at) values ('A. Reader', date '2026-10-01', 'For the history maps.', now()), ('Hidden One', date '2026-09-01', null, now())$q$);
select _dml('admin_hide', $q$update public.supporters set listed = false where display_name = 'Hidden One'$q$);
select _dml('admin_badmonth', $q$insert into public.supporters (display_name, since_month, consented_at) values ('B', date '2026-10-15', now())$q$);
reset role;

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select _sel('anon_sup', 'select string_agg(display_name, '','') from public.supporters');
select _sel('anon_sup_consent', 'select count(consented_at)::text from public.supporters');
select _dml('anon_sup_ins', $q$insert into public.supporters (display_name, since_month, consented_at) values ('Me', date '2026-10-01', now())$q$);
reset role;

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _sel('user_sup', 'select count(*)::text from public.supporters');
select _dml('user_sup_ins', $q$insert into public.supporters (display_name, since_month, consented_at) values ('Me', date '2026-10-01', now())$q$);
select _dml('user_sup_upd', $q$update public.supporters set display_name = 'Changed'$q$);
reset role;

select is((select v from _cap where k = 'admin_sup'),        'ROWS:2', 'sales-channels: an admin lists supporters');
select is((select v from _cap where k = 'admin_hide'),       'ROWS:1', 'sales-channels: an admin unlists one');
select ok((select v from _cap where k = 'admin_badmonth') like 'ERR:%', 'sales-channels: since_month must be the first of a month');
select is((select v from _cap where k = 'anon_sup'),         'A. Reader', 'sales-channels: anon reads the listed supporter and not the unlisted one');
select is((select v from _cap where k = 'anon_sup_consent'), 'DENIED', 'sales-channels: anon cannot read consented_at');
select is((select v from _cap where k = 'anon_sup_ins'),     'DENIED', 'sales-channels: anon cannot add a supporter');
select is((select v from _cap where k = 'user_sup'),         '1',      'sales-channels: a signed-in non-admin sees the listed row only');
select ok((select v from _cap where k = 'user_sup_ins') in ('DENIED') or (select v from _cap where k = 'user_sup_ins') like 'ERR:%',
          'sales-channels: a non-admin cannot add a supporter (the policy refuses)');
select is((select v from _cap where k = 'user_sup_upd'),     'ROWS:0', 'sales-channels: a non-admin changes no supporter');

-- ─────────────────────────────────────────────────────────────────────────────
--  5. RETENTION
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.org_inquiries (audience, purpose, name, email, message, consent, status, created_at) values
  ('other', 'other', 'Old spam',  'a@example.org', 'x', true, 'spam',    now() - interval '31 days'),
  ('other', 'other', 'New spam',  'b@example.org', 'x', true, 'spam',    now() - interval '29 days'),
  ('other', 'other', 'Very old',  'c@example.org', 'x', true, 'closed',  now() - interval '731 days'),
  ('other', 'other', 'Kept',      'd@example.org', 'x', true, 'replied', now() - interval '700 days');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select _sel('purge', 'select public.purge_org_inquiries(30, 730)::text');
reset role;
select is((select v from _cap where k = 'purge'), '2', 'sales-channels: the purge removed old spam and the 731-day-old enquiry');
select is((select string_agg(name, ',' order by name) from public.org_inquiries where name in ('Old spam', 'New spam', 'Very old', 'Kept')),
          'Kept,New spam', 'sales-channels: …and kept recent spam and a 700-day-old enquiry');

select * from finish();
rollback;
