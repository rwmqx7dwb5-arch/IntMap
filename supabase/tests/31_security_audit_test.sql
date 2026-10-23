-- ============================================================================
--  pgTAP · 31 — security-audit (20261023120000_security_audit.sql).
--
--  WHAT THIS PROVES (the half that needs a Postgres):
--    ① a vote names its voter to nobody else: anon holds no SELECT on either vote table and reads
--      nothing; a signed-in reader reads their own votes and not another reader's; no SELECT policy
--      on the two tables is left that is not the own-row one.
--    ② the totals: vote_count exists on posts and comments, starts from the seeded votes, rises on a
--      vote, falls on its withdrawal, and a post / comment that carries votes can still be deleted.
--    ③ nobody but the counter writes vote_count — an author can neither UPDATE nor INSERT it.
--    ④ the purges and the cron history sweep are SECURITY DEFINER with a pinned search_path and
--      executable by service_role only; purge_anonymous_reports deletes signed-out feedback / bug
--      reports older than 730 days and keeps the recent ones and every signed-in one.
--    ⑤ the length guards exist and refuse one character past the cap while the cap itself passes.
--    ⑥ the production-only functions, where they exist, are hardened.
--    ⑦ a sign-up's public name is the provider's (clipped to the guard) or none — never the e-mail's
--      local part — and no sign-up makes itself an admin.
--  Seed (supabase/seed.sql): post 1 by A carries B's vote; comment 1 (B's, on post 1) carries A's vote.
--  The static half (the schedules, the client never embedding votes as anon) is
--  tests/security-audit-db-checks.test.mjs.
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
--  ① THE SURFACE OF THE VOTE TABLES
-- ─────────────────────────────────────────────────────────────────────────────
select ok(not has_table_privilege('anon', 'public.community_votes', 'SELECT'),         'security-audit ①: anon holds no SELECT on community_votes');
select ok(not has_table_privilege('anon', 'public.community_comment_votes', 'SELECT'), 'security-audit ①: anon holds no SELECT on community_comment_votes');
select ok(not has_any_column_privilege('anon', 'public.community_votes', 'SELECT'),         'security-audit ①: …nor on any of its columns');
select ok(not has_any_column_privilege('anon', 'public.community_comment_votes', 'SELECT'), 'security-audit ①: …nor on any of the comment votes'' columns');
select is(
  (select coalesce(string_agg(tablename || '.' || policyname, ', ' order by 1), '')
     from pg_policies
    where schemaname = 'public' and tablename in ('community_votes', 'community_comment_votes')
      and cmd in ('SELECT', 'ALL')
      and not (roles = array['authenticated']::name[] and replace(qual, ' ', '') ~ '^\(?user_id=\(SELECTauth\.uid\(\)ASuid\)\)?$')),
  '', 'security-audit ①: every SELECT policy left on the vote tables is the own-row one');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'community_votes' and cmd = 'SELECT'), 1,
          'security-audit ①: community_votes has exactly one SELECT policy');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'community_comment_votes' and cmd = 'SELECT'), 1,
          'security-audit ①: community_comment_votes has exactly one SELECT policy');

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select _sel('anon_votes',  'select count(*)::text from public.community_votes');
select _sel('anon_cvotes', 'select count(*)::text from public.community_comment_votes');
select _sel('anon_embed',  'select count(*)::text from public.community_posts p where exists (select 1 from public.community_votes v where v.post_id = p.id)');
select _sel('anon_total',  'select vote_count::text from public.community_posts where id = 1');
reset role;

-- A: voted on comment 1, not on any post.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _sel('a_votes',        'select count(*)::text from public.community_votes');
select _sel('a_sees_b_vote',  $q$select count(*)::text from public.community_votes where user_id = '22222222-2222-2222-2222-222222222222'$q$);
select _sel('a_cvotes',       'select string_agg(user_id::text, '','') from public.community_comment_votes');
reset role;

-- B: voted on post 1, not on any comment.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select _sel('b_votes',        'select string_agg(user_id::text, '','') from public.community_votes');
select _sel('b_sees_a_cvote', $q$select count(*)::text from public.community_comment_votes where user_id = '11111111-1111-1111-1111-111111111111'$q$);
reset role;

select is((select v from _cap where k = 'anon_votes'),  'DENIED', 'security-audit ①: anon cannot read community_votes');
select is((select v from _cap where k = 'anon_cvotes'), 'DENIED', 'security-audit ①: anon cannot read community_comment_votes');
select is((select v from _cap where k = 'anon_embed'),  'DENIED', 'security-audit ①: anon cannot reach the voters through a join either');
select is((select v from _cap where k = 'anon_total'),  '1',      'security-audit ①: anon reads the TOTAL of post 1');
select is((select v from _cap where k = 'a_votes'),     '0',      'security-audit ①: A reads no post vote (B''s is not A''s)');
select is((select v from _cap where k = 'a_sees_b_vote'), '0',    'security-audit ①: A cannot see that B voted');
select is((select v from _cap where k = 'a_cvotes'), '11111111-1111-1111-1111-111111111111', 'security-audit ①: A reads A''s own comment vote');
select is((select v from _cap where k = 'b_votes'),  '22222222-2222-2222-2222-222222222222', 'security-audit ①: B reads B''s own post vote');
select is((select v from _cap where k = 'b_sees_a_cvote'), '0',   'security-audit ①: B cannot see that A voted on a comment');

-- ─────────────────────────────────────────────────────────────────────────────
--  ② THE TOTALS MOVE WITH THE VOTES
-- ─────────────────────────────────────────────────────────────────────────────
select has_column('public', 'community_posts',    'vote_count', 'security-audit ②: community_posts.vote_count exists');
select has_column('public', 'community_comments', 'vote_count', 'security-audit ②: community_comments.vote_count exists');
select col_not_null('public', 'community_posts',    'vote_count', 'security-audit ②: community_posts.vote_count is NOT NULL');
select col_not_null('public', 'community_comments', 'vote_count', 'security-audit ②: community_comments.vote_count is NOT NULL');
select is((select vote_count from public.community_posts where id = 1), 1,    'security-audit ②: post 1 counts the seeded vote');
select is((select vote_count from public.community_posts where id = 2), 0,    'security-audit ②: post 2 starts at 0');
select is((select vote_count from public.community_comments where id = 1), 1, 'security-audit ②: comment 1 counts the seeded vote');
select ok((select prosecdef from pg_proc where oid = 'public.tg_community_post_vote_count()'::regprocedure),    'security-audit ②: the post counter is SECURITY DEFINER');
select ok((select prosecdef from pg_proc where oid = 'public.tg_community_comment_vote_count()'::regprocedure), 'security-audit ②: the comment counter is SECURITY DEFINER');
select ok(not has_function_privilege('authenticated', 'public.tg_community_post_vote_count()', 'execute'),    'security-audit ②: nobody calls the post counter as an RPC');
select ok(not has_function_privilege('authenticated', 'public.tg_community_comment_vote_count()', 'execute'), 'security-audit ②: nobody calls the comment counter as an RPC');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _dml('a_vote_p2', $q$insert into public.community_votes (post_id, user_id) values (2, '11111111-1111-1111-1111-111111111111')$q$);
reset role;
select is((select v from _cap where k = 'a_vote_p2'), 'ROWS:1', 'security-audit ②: A votes on post 2');
select is((select vote_count from public.community_posts where id = 2), 1, 'security-audit ②: …and post 2 counts 1');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select _dml('b_vote_p2',  $q$insert into public.community_votes (post_id, user_id) values (2, '22222222-2222-2222-2222-222222222222')$q$);
select _dml('b_vote_p2x', $q$insert into public.community_votes (post_id, user_id) values (2, '22222222-2222-2222-2222-222222222222')$q$);
select _dml('b_cvote_c1', $q$insert into public.community_comment_votes (comment_id, user_id) values (1, '22222222-2222-2222-2222-222222222222')$q$);
select _dml('b_del_a_vote', $q$delete from public.community_votes where post_id = 2 and user_id = '11111111-1111-1111-1111-111111111111'$q$);
reset role;
select is((select v from _cap where k = 'b_vote_p2'), 'ROWS:1', 'security-audit ②: B votes on post 2');
select is((select v from _cap where k = 'b_vote_p2x'), 'ERR:23505', 'security-audit ②: a second vote by the same account is still refused');
select is((select v from _cap where k = 'b_del_a_vote'), 'ROWS:0', 'security-audit ②: B cannot withdraw A''s vote');
select is((select vote_count from public.community_posts where id = 2), 2, 'security-audit ②: post 2 counts 2');
select is((select vote_count from public.community_comments where id = 1), 2, 'security-audit ②: comment 1 counts 2');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _dml('a_unvote_p2', $q$delete from public.community_votes where post_id = 2 and user_id = '11111111-1111-1111-1111-111111111111'$q$);
select _dml('a_uncvote_c1', $q$delete from public.community_comment_votes where comment_id = 1 and user_id = '11111111-1111-1111-1111-111111111111'$q$);
reset role;
select is((select v from _cap where k = 'a_unvote_p2'), 'ROWS:1', 'security-audit ②: A withdraws A''s vote');
select is((select vote_count from public.community_posts where id = 2), 1,    'security-audit ②: …and post 2 counts 1 again');
select is((select vote_count from public.community_comments where id = 1), 1, 'security-audit ②: comment 1 counts 1 after A withdraws');
select is((select vote_count from public.community_posts p where p.id = 2),
          (select count(*)::int from public.community_votes v where v.post_id = 2), 'security-audit ②: the total equals the rows');

-- ─────────────────────────────────────────────────────────────────────────────
--  ③ NOBODY WRITES THE TOTAL
-- ─────────────────────────────────────────────────────────────────────────────
select ok(not has_column_privilege('authenticated', 'public.community_posts',    'vote_count', 'UPDATE'), 'security-audit ③: authenticated holds no UPDATE on community_posts.vote_count');
select ok(not has_column_privilege('authenticated', 'public.community_comments', 'vote_count', 'UPDATE'), 'security-audit ③: …nor on community_comments.vote_count');
select ok(not has_column_privilege('authenticated', 'public.community_posts',    'vote_count', 'INSERT'), 'security-audit ③: authenticated holds no INSERT on community_posts.vote_count');
select ok(not has_column_privilege('authenticated', 'public.community_comments', 'vote_count', 'INSERT'), 'security-audit ③: …nor on community_comments.vote_count');
select ok(not has_column_privilege('anon', 'public.community_posts', 'vote_count', 'UPDATE'), 'security-audit ③: anon holds no UPDATE on vote_count');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _dml('a_set_count',  'update public.community_posts set vote_count = 999 where id = 1');
select _dml('a_ins_count',  $q$insert into public.community_posts (user_id, title, vote_count) values ('11111111-1111-1111-1111-111111111111', 'x', 999)$q$);
reset role;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select _dml('b_set_ccount', 'update public.community_comments set vote_count = 999 where id = 1');
reset role;
select is((select v from _cap where k = 'a_set_count'),  'DENIED', 'security-audit ③: the author cannot rewrite the post''s total');
select is((select v from _cap where k = 'a_ins_count'),  'DENIED', 'security-audit ③: a new post cannot start with a total');
select is((select v from _cap where k = 'b_set_ccount'), 'DENIED', 'security-audit ③: the author cannot rewrite the comment''s total');
select is((select vote_count from public.community_posts where id = 1), 1, 'security-audit ③: post 1 still counts 1');

-- A post and a comment that carry votes are still deletable (the cascade runs the counter on a row
-- the same statement removes).
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select _dml('b_del_c1', 'delete from public.community_comments where id = 1');
reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _dml('a_del_p1', 'delete from public.community_posts where id = 1');
reset role;
select is((select v from _cap where k = 'b_del_c1'), 'ROWS:1', 'security-audit ②: a voted comment is deleted, its votes with it');
select is((select v from _cap where k = 'a_del_p1'), 'ROWS:1', 'security-audit ②: a voted post is deleted, its votes with it');
select is((select count(*)::int from public.community_votes where post_id = 1), 0, 'security-audit ②: …and no vote of post 1 is left');

-- ─────────────────────────────────────────────────────────────────────────────
--  ④ THE PURGES
-- ─────────────────────────────────────────────────────────────────────────────
select has_function('public', 'purge_anonymous_reports', array['integer'], 'security-audit ④: purge_anonymous_reports(int) exists');
select has_function('public', 'purge_cron_run_history',  array['integer'], 'security-audit ④: purge_cron_run_history(int) exists');
select ok((select prosecdef from pg_proc where oid = 'public.purge_anonymous_reports(integer)'::regprocedure), 'security-audit ④: purge_anonymous_reports is SECURITY DEFINER');
select ok((select prosecdef from pg_proc where oid = 'public.purge_cron_run_history(integer)'::regprocedure),  'security-audit ④: purge_cron_run_history is SECURITY DEFINER');
select ok('search_path=""' = any((select proconfig from pg_proc where oid = 'public.purge_anonymous_reports(integer)'::regprocedure)), 'security-audit ④: purge_anonymous_reports pins search_path to ''''');
select ok('search_path=""' = any((select proconfig from pg_proc where oid = 'public.purge_cron_run_history(integer)'::regprocedure)),  'security-audit ④: purge_cron_run_history pins search_path to ''''');
select ok(not has_function_privilege('anon',          'public.purge_anonymous_reports(integer)', 'execute'), 'security-audit ④: anon cannot purge reports');
select ok(not has_function_privilege('authenticated', 'public.purge_anonymous_reports(integer)', 'execute'), 'security-audit ④: authenticated cannot purge reports');
select ok(    has_function_privilege('service_role',  'public.purge_anonymous_reports(integer)', 'execute'), 'security-audit ④: service_role purges reports');
select ok(not has_function_privilege('anon',          'public.purge_cron_run_history(integer)', 'execute'),  'security-audit ④: anon cannot purge cron history');
select ok(not has_function_privilege('authenticated', 'public.purge_cron_run_history(integer)', 'execute'),  'security-audit ④: authenticated cannot purge cron history');
select ok(    has_function_privilege('service_role',  'public.purge_cron_run_history(integer)', 'execute'),  'security-audit ④: service_role purges cron history');
select ok(not has_function_privilege('authenticated', 'public.sweep_relay_rate_buckets(integer)', 'execute'), 'security-audit ④: the scheduled relay sweep is still service_role only');

insert into public.feedback (user_id, email, rating, comment, lang, page, created_at) values
  (null, 'old@intmap.test', 3, 'sa-old-anon', 'en', '/', now() - interval '731 days'),
  (null, 'new@intmap.test', 3, 'sa-new-anon', 'en', '/', now() - interval '729 days'),
  ('11111111-1111-1111-1111-111111111111', 'a@intmap.test', 3, 'sa-old-signed-in', 'en', '/', now() - interval '900 days');
insert into public.bug_reports (user_id, email, category, description, lang, page, created_at) values
  (null, 'old@intmap.test', 'map', 'sa-old-anon', 'en', '/', now() - interval '731 days'),
  (null, 'new@intmap.test', 'map', 'sa-new-anon', 'en', '/', now() - interval '1 day'),
  ('22222222-2222-2222-2222-222222222222', 'b@intmap.test', 'map', 'sa-old-signed-in', 'en', '/', now() - interval '900 days');

select set_config('request.jwt.claims', '{"role":"authenticated","sub":"11111111-1111-1111-1111-111111111111"}', true);
set local role authenticated;
select _sel('user_purge', 'select public.purge_anonymous_reports(0)::text');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select _sel('svc_purge', 'select public.purge_anonymous_reports(730)::text');
select _sel('svc_cron',  'select (public.purge_cron_run_history(14) >= 0)::text');
reset role;
select is((select v from _cap where k = 'user_purge'), 'DENIED', 'security-audit ④: a reader cannot run the purge');
select is((select v from _cap where k = 'svc_purge'),  '2',      'security-audit ④: the purge removes the two signed-out rows older than 730 days');
select is((select v from _cap where k = 'svc_cron'),   'true',   'security-audit ④: the cron history purge runs (deletes nothing where pg_cron is absent)');
select is((select string_agg(comment, ',' order by comment) from public.feedback where comment like 'sa-%'),
          'sa-new-anon,sa-old-signed-in', 'security-audit ④: recent signed-out feedback and signed-in feedback are kept');
select is((select string_agg(description, ',' order by description) from public.bug_reports where description like 'sa-%'),
          'sa-new-anon,sa-old-signed-in', 'security-audit ④: recent signed-out bug reports and signed-in ones are kept');

-- ─────────────────────────────────────────────────────────────────────────────
--  ⑤ THE LENGTH GUARDS
-- ─────────────────────────────────────────────────────────────────────────────
select ok(exists(select 1 from pg_constraint where conname = 'comm_posts_media_len_guard' and conrelid = 'public.community_posts'::regclass and contype = 'c'),
          'security-audit ⑤: comm_posts_media_len_guard exists');
select ok(exists(select 1 from pg_constraint where conname = 'profiles_len_guard' and conrelid = 'public.profiles'::regclass and contype = 'c'),
          'security-audit ⑤: profiles_len_guard exists');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _dml('bio_cap',      $q$update public.profiles set bio = repeat('b', 280) where id = '11111111-1111-1111-1111-111111111111'$q$);
select _dml('bio_over',     $q$update public.profiles set bio = repeat('b', 281) where id = '11111111-1111-1111-1111-111111111111'$q$);
select _dml('name_cap',     $q$update public.profiles set display_name = repeat('n', 255) where id = '11111111-1111-1111-1111-111111111111'$q$);
select _dml('name_over',    $q$update public.profiles set display_name = repeat('n', 256) where id = '11111111-1111-1111-1111-111111111111'$q$);
select _dml('avatar_cap',   $q$update public.profiles set avatar_url = 'data:image/jpeg;base64,' || repeat('A', 350000 - 23) where id = '11111111-1111-1111-1111-111111111111'$q$);
select _dml('avatar_over',  $q$update public.profiles set avatar_url = 'data:image/jpeg;base64,' || repeat('A', 350000 - 22) where id = '11111111-1111-1111-1111-111111111111'$q$);
select _dml('cat_cap',      $q$insert into public.community_posts (user_id, title, category) values ('11111111-1111-1111-1111-111111111111', 'sa-cat', repeat('c', 120))$q$);
select _dml('cat_over',     $q$insert into public.community_posts (user_id, title, category) values ('11111111-1111-1111-1111-111111111111', 'sa-cat2', repeat('c', 121))$q$);
select _dml('img_cap',      $q$insert into public.community_posts (user_id, title, img) values ('11111111-1111-1111-1111-111111111111', 'sa-img', 'data:image/jpeg;base64,' || repeat('A', 6000000 - 23))$q$);
select _dml('img_over',     $q$insert into public.community_posts (user_id, title, img) values ('11111111-1111-1111-1111-111111111111', 'sa-img2', 'data:image/jpeg;base64,' || repeat('A', 6000000 - 22))$q$);
reset role;
select is((select v from _cap where k = 'bio_cap'),     'ROWS:1',    'security-audit ⑤: a 280-character bio is stored');
select is((select v from _cap where k = 'bio_over'),    'ERR:23514', 'security-audit ⑤: a 281-character bio is refused');
select is((select v from _cap where k = 'name_cap'),    'ROWS:1',    'security-audit ⑤: a 255-character display name is stored');
select is((select v from _cap where k = 'name_over'),   'ERR:23514', 'security-audit ⑤: a 256-character display name is refused');
select is((select v from _cap where k = 'avatar_cap'),  'ROWS:1',    'security-audit ⑤: a 350,000-character avatar is stored');
select is((select v from _cap where k = 'avatar_over'), 'ERR:23514', 'security-audit ⑤: one character more is refused');
select is((select v from _cap where k = 'cat_cap'),     'ROWS:1',    'security-audit ⑤: a 120-character category is stored');
select is((select v from _cap where k = 'cat_over'),    'ERR:23514', 'security-audit ⑤: a 121-character category is refused');
select is((select v from _cap where k = 'img_cap'),     'ROWS:1',    'security-audit ⑤: a 6,000,000-character image is stored');
select is((select v from _cap where k = 'img_over'),    'ERR:23514', 'security-audit ⑤: one character more is refused');

-- ─────────────────────────────────────────────────────────────────────────────
--  ⑥ PRODUCTION-ONLY OBJECTS (absent here unless the stack mirrors production)
-- ─────────────────────────────────────────────────────────────────────────────
select ok(to_regprocedure('public.set_updated_at()') is null
          or exists(select 1 from unnest((select proconfig from pg_proc where oid = to_regprocedure('public.set_updated_at()'))) e where e like 'search_path=%'),
          'security-audit ⑥: set_updated_at(), where it exists, pins its search_path');
select ok(to_regprocedure('public.rls_auto_enable()') is null
          or (not has_function_privilege('anon', 'public.rls_auto_enable()', 'execute')
              and not has_function_privilege('authenticated', 'public.rls_auto_enable()', 'execute')),
          'security-audit ⑥: rls_auto_enable(), where it exists, is not executable by anon or authenticated');

-- ─────────────────────────────────────────────────────────────────────────────
--  ⑦ A PUBLIC NAME IS NOT MADE FROM AN E-MAIL ADDRESS (migration §5) — the sign-up path:
--     auth.users → handle_new_user → profiles → profiles_public_sync
-- ─────────────────────────────────────────────────────────────────────────────
reset role;
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
   confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', 'a1a1a1a1-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'local.part.one@intmap.test', '', now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a1a1a1a1-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'local.part.two@intmap.test', '', now(), now(), now(),
   '{"provider":"google","providers":["google"]}', '{"full_name":"Provider Name"}', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a1a1a1a1-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'local.part.three@intmap.test', '', now(), now(), now(),
   '{"provider":"google","providers":["google"]}', jsonb_build_object('full_name', repeat('n', 300)), '', '', '', '');
select is((select display_name from public.profiles where id = 'a1a1a1a1-0000-4000-8000-000000000001'), null,
          'security-audit ⑦: a sign-up without a provider name gets no name — not the e-mail''s local part');
select is((select display_name from public.profiles_public where id = 'a1a1a1a1-0000-4000-8000-000000000002'), 'Provider Name',
          'security-audit ⑦: a sign-up with a provider name publishes that name');
select is((select char_length(display_name) from public.profiles where id = 'a1a1a1a1-0000-4000-8000-000000000003'), 255,
          'security-audit ⑦: a provider name past the length guard is clipped, so the sign-up does not fail');
select is((select count(*)::int from public.profiles where id::text like 'a1a1a1a1-%' and is_admin), 0,
          'security-audit ⑦: no sign-up makes itself an admin');

select * from finish();
rollback;
