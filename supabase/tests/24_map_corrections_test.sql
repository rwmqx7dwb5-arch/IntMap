-- ============================================================================
--  pgTAP · 24 — community-next: map corrections — the report, the answer by receipt, the public log.
--
--  WHAT THIS PROVES (the half that needs a Postgres):
--    · map_corrections — RLS on, no INSERT policy; anon and a signed-in non-admin can neither read, insert,
--      update nor delete; an admin reads and answers (status / reply / note / fix / duplicate / published /
--      place_label only — never the reader's words); the service role (reader-reports) inserts; the CHECKs
--      refuse an unknown kind, a malformed receipt hash, a map link that is not the share fragment, a source
--      that is not http(s), and publishing without a reply or an unanswered report.
--    · resolved_at follows the status (trigger): set on an answer, cleared on reopening.
--    · map_correction_status — the RECEIPT reads its own row and nothing else (sha256 over its UTF-8, as
--      _shared/correction-shape.js receiptHash computes it); spam reads as «closed» without the reply.
--    · my_map_corrections — the signed-in caller's rows only; refuses anon.
--    · public_map_corrections / map_corrections_summary — only published rows, never the message; counts.
--    · purge_map_corrections — service_role only; spam after 30 days, unpublished answers 730 days after the
--      answer; open and published rows are kept.
--  The Edge Function's half (shape, receipt) is evaluated in Node by tests/community-next-checks.test.mjs.
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

-- the receipts used below and their hashes (the same computation the Edge Function does in WebCrypto)
create table _rc (name text primary key, receipt text, h text);
grant select on _rc to anon, authenticated, service_role;
insert into _rc values
  ('anon',  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', null),
  ('user',  'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', null),
  ('spam',  'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC', null),
  ('other', 'DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD', null);
update _rc set h = encode(sha256(convert_to(receipt, 'UTF8')), 'hex');

-- ─────────────────────────────────────────────────────────────────────────────
--  1. THE SURFACE
-- ─────────────────────────────────────────────────────────────────────────────
select has_table('public', 'map_corrections', 'community-next: map_corrections exists');
select ok((select relrowsecurity from pg_class where oid = 'public.map_corrections'::regclass), 'community-next: RLS on map_corrections');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'map_corrections' and cmd in ('INSERT', 'ALL')), 0,
          'community-next: map_corrections has no INSERT policy — the Edge Function (service role) is the only writer');
select ok(not has_any_column_privilege('anon',          'public.map_corrections', 'INSERT'), 'community-next: anon holds no INSERT');
select ok(not has_any_column_privilege('authenticated', 'public.map_corrections', 'INSERT'), 'community-next: authenticated holds no INSERT');
select ok(not has_table_privilege('anon', 'public.map_corrections', 'SELECT'),               'community-next: anon holds no SELECT');
select ok(not has_column_privilege('authenticated', 'public.map_corrections', 'message', 'UPDATE'),      'community-next: nobody rewrites the reader''s words');
select ok(not has_column_privilege('authenticated', 'public.map_corrections', 'receipt_hash', 'UPDATE'), 'community-next: …nor the receipt');
select ok(not has_column_privilege('authenticated', 'public.map_corrections', 'resolved_at', 'UPDATE'),  'community-next: …nor resolved_at (the trigger writes it)');
select ok(has_function_privilege('anon', 'public.map_correction_status(text[])', 'execute'),       'community-next: anon reads an answer by receipt');
select ok(not has_function_privilege('anon', 'public.my_map_corrections()', 'execute'),            'community-next: anon cannot call my_map_corrections');
select ok(has_function_privilege('anon', 'public.public_map_corrections(integer)', 'execute'),     'community-next: anon reads the public log');
select ok(has_function_privilege('anon', 'public.map_corrections_summary()', 'execute'),           'community-next: anon reads the counts');
select ok(not has_function_privilege('anon',          'public.purge_map_corrections(integer,integer)', 'execute'), 'community-next: anon cannot purge');
select ok(not has_function_privilege('authenticated', 'public.purge_map_corrections(integer,integer)', 'execute'), 'community-next: authenticated cannot purge');
select ok(exists(select 1 from public.account_data_catalog where tbl = 'map_corrections'), 'community-next: the account''s data catalogue describes map_corrections');

-- ─────────────────────────────────────────────────────────────────────────────
--  2. THE WRITER — service_role, and the CHECKs
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select _dml('svc_anon', format($q$insert into public.map_corrections (kind, lng, lat, zoom, year, map_link, layer_id, layer_label, place_label, message, receipt_hash, lang)
  values ('date', 135.5, 34.7, 8, 1900, '#v=135.5000,34.7000,8.00,0,0,f&tt=1900-01-01', 'hist-admin', 'Historical provinces', 'Osaka', 'This province did not exist in 1900.', %L, 'en')$q$, (select h from _rc where name = 'anon')));
select _dml('svc_user', format($q$insert into public.map_corrections (kind, lng, lat, message, receipt_hash, user_id, map_link)
  values ('name', 2.35, 48.85, 'Wrong name', %L, '11111111-1111-1111-1111-111111111111', '#v=2.3500,48.8500,9.00,0,0,f')$q$, (select h from _rc where name = 'user')));
select _dml('svc_spam', format($q$insert into public.map_corrections (kind, lng, lat, message, receipt_hash, map_link) values ('other', 0, 0, 'buy now', %L, '#v=0.0000,0.0000,9.00,0,0,f')$q$, (select h from _rc where name = 'spam')));
select _dml('svc_badkind', $q$insert into public.map_corrections (kind, lng, lat, message, receipt_hash, map_link) values ('opinion', 0, 0, 'x', repeat('a', 64), '#v=0.0000,0.0000,9.00,0,0,f')$q$);
select _dml('svc_nolink',  $q$insert into public.map_corrections (kind, lng, lat, message, receipt_hash) values ('name', 0, 0, 'x', repeat('9', 64))$q$);
select _dml('svc_badhash', $q$insert into public.map_corrections (kind, lng, lat, message, receipt_hash, map_link) values ('name', 0, 0, 'x', 'not-a-hash', '#v=0.0000,0.0000,9.00,0,0,f')$q$);
select _dml('svc_badlink', $q$insert into public.map_corrections (kind, lng, lat, message, receipt_hash, map_link) values ('name', 0, 0, 'x', repeat('b', 64), 'https://evil.example/')$q$);
select _dml('svc_badsrc',  $q$insert into public.map_corrections (kind, lng, lat, message, receipt_hash, evidence_url, map_link) values ('name', 0, 0, 'x', repeat('c', 64), 'javascript:alert(1)', '#v=0.0000,0.0000,9.00,0,0,f')$q$);
select _dml('svc_badlat',  $q$insert into public.map_corrections (kind, lng, lat, message, receipt_hash, map_link) values ('name', 0, 91, 'x', repeat('d', 64), '#v=0.0000,0.0000,9.00,0,0,f')$q$);
select _dml('svc_pubopen', $q$insert into public.map_corrections (kind, lng, lat, message, receipt_hash, published, reply, map_link) values ('name', 0, 0, 'x', repeat('e', 64), true, 'r', '#v=0.0000,0.0000,9.00,0,0,f')$q$);
reset role;
select is((select v from _cap where k = 'svc_anon'), 'ROWS:1', 'community-next: the service role stores a correction');
select is((select v from _cap where k = 'svc_user'), 'ROWS:1', 'community-next: …and a signed-in one');
select is((select status from public.map_corrections where place_label = 'Osaka'), 'new', 'community-next: a new correction starts as «new»');
select ok((select resolved_at from public.map_corrections where place_label = 'Osaka') is null, 'community-next: …with no resolved_at');
select ok((select v from _cap where k = 'svc_badkind') like 'ERR:%', 'community-next: an unknown kind is refused');
select ok((select v from _cap where k = 'svc_badhash') like 'ERR:%', 'community-next: a receipt hash that is not 64 hex is refused');
select ok((select v from _cap where k = 'svc_nolink')  like 'ERR:%', 'community-next: a correction without the map state it was seen in is refused');
select ok((select v from _cap where k = 'svc_badlink') like 'ERR:%', 'community-next: a map link that is not the share fragment is refused');
select ok((select v from _cap where k = 'svc_badsrc')  like 'ERR:%', 'community-next: a source that is not http(s) is refused');
select ok((select v from _cap where k = 'svc_badlat')  like 'ERR:%', 'community-next: a latitude outside ±90 is refused');
select ok((select v from _cap where k = 'svc_pubopen') like 'ERR:%', 'community-next: an unanswered correction cannot be published');

-- ─────────────────────────────────────────────────────────────────────────────
--  3. WHO MAY READ AND ANSWER
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select _sel('anon_sel', 'select count(*)::text from public.map_corrections');
select _dml('anon_ins', $q$insert into public.map_corrections (kind, lng, lat, message, receipt_hash, map_link) values ('name', 0, 0, 'x', repeat('f', 64), '#v=0.0000,0.0000,9.00,0,0,f')$q$);
reset role;

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _sel('user_sel', 'select count(*)::text from public.map_corrections');
select _dml('user_upd', $q$update public.map_corrections set status = 'fixed'$q$);
select _dml('user_del', 'delete from public.map_corrections');
select _sel('user_mine', 'select string_agg(kind, '','') from public.my_map_corrections()');
reset role;

select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select _sel('admin_sel', 'select count(*)::text from public.map_corrections');
select _dml('admin_pub_noreply', $q$update public.map_corrections set status = 'fixed', published = true where place_label = 'Osaka'$q$);
select _dml('admin_answer', $q$update public.map_corrections set status = 'fixed', reply = 'Osaka-fu is drawn from 1868; the province is no longer drawn after 1871.', fixed_ref = 'https://github.com/example/pull/1', published = true where place_label = 'Osaka'$q$);
select _dml('admin_spam', $q$update public.map_corrections set status = 'spam', reply = 'internal' where message = 'buy now'$q$);
select _dml('admin_rewrite', $q$update public.map_corrections set message = 'edited' where place_label = 'Osaka'$q$);
reset role;

select is((select v from _cap where k = 'anon_sel'), 'DENIED', 'community-next: anon cannot read corrections');
select is((select v from _cap where k = 'anon_ins'), 'DENIED', 'community-next: anon cannot insert directly');
select is((select v from _cap where k = 'user_sel'), '0',      'community-next: a non-admin reads no row of the table');
select is((select v from _cap where k = 'user_upd'), 'ROWS:0', 'community-next: a non-admin changes nothing');
select is((select v from _cap where k = 'user_del'), 'ROWS:0', 'community-next: a non-admin deletes nothing');
select is((select v from _cap where k = 'user_mine'), 'name',  'community-next: my_map_corrections returns the caller''s own row only');
select is((select v from _cap where k = 'admin_sel'), '3',     'community-next: an admin reads every correction');
select ok((select v from _cap where k = 'admin_pub_noreply') like 'ERR:%', 'community-next: publishing without a reply is refused');
select is((select v from _cap where k = 'admin_answer'), 'ROWS:1', 'community-next: an admin answers and publishes');
select is((select v from _cap where k = 'admin_rewrite'), 'DENIED', 'community-next: an admin cannot rewrite what the reader wrote');
select ok((select resolved_at from public.map_corrections where place_label = 'Osaka') is not null, 'community-next: an answer sets resolved_at');

-- ─────────────────────────────────────────────────────────────────────────────
--  4. THE ANSWER BY RECEIPT, AND THE PUBLIC LOG
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select _sel('rc_own',   format('select string_agg(status || ''|'' || coalesce(reply, ''-''), '','') from public.map_correction_status(array[%L])', (select receipt from _rc where name = 'anon')));
select _sel('rc_spam',  format('select string_agg(status || ''|'' || coalesce(reply, ''-''), '','') from public.map_correction_status(array[%L])', (select receipt from _rc where name = 'spam')));
select _sel('rc_none',  format('select count(*)::text from public.map_correction_status(array[%L])', (select receipt from _rc where name = 'other')));
select _sel('rc_hash',  format('select count(*)::text from public.map_correction_status(array[%L])', (select h from _rc where name = 'anon')));
select _sel('log',      'select string_agg(place_label || ''|'' || reply, '','') from public.public_map_corrections(50)');
select _sel('sum',      'select (s->>''received'') || ''/'' || (s->>''fixed'') || ''/'' || (s->>''historical'') || ''/'' || (s->>''published'') from public.map_corrections_summary() s');
select _dml('anon_mine', 'select * from public.my_map_corrections()');
reset role;
select is((select v from _cap where k = 'rc_own'),  'fixed|Osaka-fu is drawn from 1868; the province is no longer drawn after 1871.', 'community-next: a receipt reads its own answer');
select is((select v from _cap where k = 'rc_spam'), 'closed|-', 'community-next: spam reads as closed, without the operator''s text');
select is((select v from _cap where k = 'rc_none'), '0', 'community-next: a receipt that was never stored reads nothing');
select is((select v from _cap where k = 'rc_hash'), '0', 'community-next: the stored hash itself is not a receipt');
select is((select v from _cap where k = 'log'), 'Osaka|Osaka-fu is drawn from 1868; the province is no longer drawn after 1871.', 'community-next: the public log holds the published answer only');
select is((select v from _cap where k = 'sum'), '2/1/1/1', 'community-next: the counts exclude spam and count the historical report');
select ok((select v from _cap where k = 'anon_mine') in ('DENIED') or (select v from _cap where k = 'anon_mine') like 'ERR:%', 'community-next: anon cannot list «my» corrections');
select ok(not exists(select 1 from information_schema.routines r join information_schema.parameters p on p.specific_name = r.specific_name
                     where r.routine_schema = 'public' and r.routine_name = 'public_map_corrections' and p.parameter_mode = 'OUT' and p.parameter_name in ('message', 'user_id', 'receipt_hash', 'admin_note')),
          'community-next: the public log returns no message, sender, receipt or internal note');

-- reopening clears resolved_at
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select _dml('admin_reopen', $q$update public.map_corrections set status = 'confirmed' where kind = 'name' and lng = 2.35$q$);
reset role;
select ok((select resolved_at from public.map_corrections where kind = 'name' and lng = 2.35) is null, 'community-next: an open status has no resolved_at');

-- ─────────────────────────────────────────────────────────────────────────────
--  5. RETENTION
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.map_corrections (kind, lng, lat, message, receipt_hash, status, created_at, map_link) values
  ('other', 1, 1, 'old spam', repeat('1', 64), 'spam', now() - interval '31 days', '#v=0.0000,0.0000,9.00,0,0,f'),
  ('other', 1, 1, 'new spam', repeat('2', 64), 'spam', now() - interval '29 days', '#v=0.0000,0.0000,9.00,0,0,f'),
  ('name',  1, 1, 'old open', repeat('3', 64), 'new',  now() - interval '900 days', '#v=0.0000,0.0000,9.00,0,0,f');
insert into public.map_corrections (kind, lng, lat, message, receipt_hash, status, map_link) values
  ('name',  1, 1, 'old answer', repeat('4', 64), 'not_an_error', '#v=0.0000,0.0000,9.00,0,0,f'),
  ('name',  1, 1, 'recent answer', repeat('5', 64), 'not_an_error', '#v=0.0000,0.0000,9.00,0,0,f');
update public.map_corrections set resolved_at = now() - interval '731 days' where message = 'old answer';
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select _sel('purge', 'select public.purge_map_corrections(30, 730)::text');
reset role;
select is((select v from _cap where k = 'purge'), '2', 'community-next: the purge removed old spam and the 731-day-old unpublished answer');
select is((select string_agg(message, ',' order by message) from public.map_corrections where message in ('old spam', 'new spam', 'old open', 'old answer', 'recent answer')),
          'new spam,old open,recent answer', 'community-next: …and kept recent spam, an open report and a recent answer');

select * from finish();
rollback;
