-- ============================================================================
--  pgTAP · 12 — db-provenance-hardening.
--    ① every SECURITY DEFINER function in public pins a search_path in which no caller can
--      create an object: each entry is the empty string, pg_temp (and then only LAST), or a
--      schema that is not public and in which neither anon nor authenticated holds CREATE.
--      Measured over pg_proc × pg_namespace — the audit that reported the news_event_*
--      functions as `search_path = public` had read the CREATE statements, and #R801 had
--      already re-pinned them with ALTER FUNCTION. The catalogue is the only place both are.
--    ② no public bucket carries a SELECT policy that lets anon/authenticated list it
--      (a public object is served by URL without RLS; such a policy adds only the listing).
--    ③ an author cannot state their own author_name / created_at / edited_at on INSERT —
--      neither through the grant PostgREST uses nor under a blanket table grant (production's
--      default privileges hand one to every new table, #R144 / #R155), because the BEFORE
--      INSERT trigger writes them.
--    ④ the INSERT grant on community_posts / community_comments is column-level and covers
--      the columns the client sends, and none of the provenance columns.
-- ============================================================================
begin;
select no_plan();

do $$ begin execute format('grant anon, authenticated, service_role to %I', current_user); exception when others then null; end $$;

create table _cap (k text primary key, v text);
grant insert, select on _cap to anon, authenticated, service_role;
create function _dml(k text, q text) returns void language plpgsql as $$
declare n integer;
begin execute q; get diagnostics n = row_count; insert into _cap values (k, 'ROWS:' || n);
exception when insufficient_privilege then insert into _cap values (k, 'DENIED');
        when others then insert into _cap values (k, 'ERR:' || sqlstate); end; $$;

-- ─────────────────────────────────────────────────────────────────────────────
--  ①  search_path of every SECURITY DEFINER function in public
-- ─────────────────────────────────────────────────────────────────────────────
create temp table _sp as
  select p.oid::regprocedure::text as fn, p.proname::text as pname, e.ord, e.n, e.total
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    cross join lateral (select cfg from unnest(p.proconfig) cfg where cfg like 'search_path=%' limit 1) c
    cross join lateral (
      select t.ord, btrim(btrim(t.x), '"') as n, count(*) over () as total
        from regexp_split_to_table(substr(c.cfg, length('search_path=') + 1), ',') with ordinality as t(x, ord)
    ) e
   where ns.nspname = 'public' and p.prosecdef;

select is(
  (select count(*)::int from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')),
  0, 'provenance ①: every SECURITY DEFINER function in public pins a search_path');

select is(
  (select string_agg(fn || ' → ' || n, '; ' order by fn, ord) from _sp
    where n <> ''
      and not (n = 'pg_temp' and ord = total)
      -- CASE, not OR: has_schema_privilege raises on a schema that does not exist, and OR
      -- does not promise to evaluate the existence test first.
      and case when n in ('public', 'pg_temp') or n like '$%' then true
               when not exists (select 1 from pg_namespace s where s.nspname = _sp.n) then true
               else has_schema_privilege('anon', _sp.n, 'CREATE') or has_schema_privilege('authenticated', _sp.n, 'CREATE')
          end),
  null, 'provenance ①: no SECURITY DEFINER search_path names a schema a caller could create an object in (public, $user, a missing schema, a non-final pg_temp)');

select ok((select count(distinct fn) from _sp) > 0, 'provenance ①: the measurement saw SECURITY DEFINER functions (not vacuous)');
select ok((select bool_and(n = '') from _sp where pname = 'news_event_merge'),
          'provenance ①: news_event_merge — the function the audit named — runs with the empty search_path');

-- ─────────────────────────────────────────────────────────────────────────────
--  ②  public buckets are not listable through a policy
-- ─────────────────────────────────────────────────────────────────────────────
select ok(exists (select 1 from storage.buckets where public), 'provenance ②: the migrations create at least one public bucket (not vacuous)');
select is(
  (select string_agg(distinct b.id || ' ← ' || pol.policyname, '; ')
     from storage.buckets b
     join pg_policies pol on pol.schemaname = 'storage' and pol.tablename = 'objects'
    where b.public
      and pol.cmd in ('SELECT', 'ALL')
      and pol.permissive = 'PERMISSIVE'
      and pol.roles && array['public', 'anon', 'authenticated']::name[]
      and (pol.qual is null or btrim(pol.qual, '() ') = 'true'
           or position(quote_literal(b.id) in pol.qual) > 0)),
  null, 'provenance ②: no public bucket has a SELECT policy anon/authenticated can list it through');

-- ─────────────────────────────────────────────────────────────────────────────
--  ④  the INSERT grant is column-level
-- ─────────────────────────────────────────────────────────────────────────────
select ok(not has_table_privilege('authenticated', 'public.community_posts',    'insert'), 'provenance ④: no table-level INSERT on community_posts for authenticated');
select ok(not has_table_privilege('authenticated', 'public.community_comments', 'insert'), 'provenance ④: no table-level INSERT on community_comments for authenticated');
select ok(not has_any_column_privilege('anon', 'public.community_posts',    'insert'), 'provenance ④: anon cannot INSERT any column of community_posts');
select ok(not has_any_column_privilege('anon', 'public.community_comments', 'insert'), 'provenance ④: anon cannot INSERT any column of community_comments');
select is(
  (select string_agg(c.attname, ',' order by c.attname) from pg_attribute c
    where c.attrelid = 'public.community_posts'::regclass and c.attnum > 0 and not c.attisdropped
      and has_column_privilege('authenticated', c.attrelid, c.attnum, 'insert')),
  'author_name,body,category,img,lat,lng,title,user_id',
  'provenance ④: authenticated may INSERT exactly the post columns the client sends');
select is(
  (select string_agg(c.attname, ',' order by c.attname) from pg_attribute c
    where c.attrelid = 'public.community_comments'::regclass and c.attnum > 0 and not c.attisdropped
      and has_column_privilege('authenticated', c.attrelid, c.attnum, 'insert')),
  'author_name,body,parent_id,post_id,user_id',
  'provenance ④: authenticated may INSERT exactly the comment columns the client sends');

-- ─────────────────────────────────────────────────────────────────────────────
--  ③  the stamp — first through the real grant, then under a blanket grant
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
-- the post exactly as js/community-board.js cmAddPost sends it, with a forged name
select _dml('a_post_forged_name', $q$insert into public.community_posts (user_id, author_name, title, body, img, lat, lng, category)
  values ('11111111-1111-1111-1111-111111111111', 'IntMap運営', 'prov-1', 'b', null, 1, 2, 'general')$q$);
select _dml('a_post_forged_time', $q$insert into public.community_posts (user_id, title, created_at)
  values ('11111111-1111-1111-1111-111111111111', 'prov-2', '2099-01-01')$q$);
select _dml('a_cmt_forged_name',  $q$insert into public.community_comments (post_id, user_id, author_name, body, parent_id)
  values (1, '11111111-1111-1111-1111-111111111111', 'Test User B', 'prov-c1', null)$q$);
select _dml('a_cmt_forged_time',  $q$insert into public.community_comments (post_id, user_id, body, created_at)
  values (1, '11111111-1111-1111-1111-111111111111', 'prov-c2', '2099-01-01')$q$);
reset role;

select is((select v from _cap where k = 'a_post_forged_name'), 'ROWS:1', 'provenance ③: the post the client sends is accepted');
select is((select author_name from public.community_posts where title = 'prov-1'), 'Test User A',
          'provenance ③: a post signed «IntMap運営» is published under the author''s own card name');
select is((select v from _cap where k = 'a_post_forged_time'), 'DENIED', 'provenance ③: naming created_at on a post is refused by the grant');
select is((select v from _cap where k = 'a_cmt_forged_name'), 'ROWS:1', 'provenance ③: the comment the client sends is accepted');
select is((select author_name from public.community_comments where body = 'prov-c1'), 'Test User A',
          'provenance ③: a comment signed as another reader is published under the author''s own name');
select is((select v from _cap where k = 'a_cmt_forged_time'), 'DENIED', 'provenance ③: naming created_at on a comment is refused by the grant');

-- production's condition: a blanket table-level grant (#R144/#R155). The trigger alone must hold.
grant insert on public.community_posts, public.community_comments to authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _dml('b_post', $q$insert into public.community_posts (user_id, author_name, title, created_at, edited_at)
  values ('11111111-1111-1111-1111-111111111111', 'IntMap運営', 'prov-3', '2099-01-01', '2099-01-01')$q$);
select _dml('b_cmt',  $q$insert into public.community_comments (post_id, user_id, author_name, body, created_at)
  values (1, '11111111-1111-1111-1111-111111111111', 'IntMap運営', 'prov-c3', '2099-01-01')$q$);
reset role;
select is((select v from _cap where k = 'b_post'), 'ROWS:1', 'provenance ③: under a blanket grant the insert goes through …');
select is((select author_name || '|' || (created_at = now())::text || '|' || coalesce(edited_at::text, 'null')
             from public.community_posts where title = 'prov-3'),
          'Test User A|true|null', '… and the trigger still writes author_name, created_at = now() and no edited_at');
select is((select v from _cap where k = 'b_cmt'), 'ROWS:1', 'provenance ③: a comment under a blanket grant goes through …');
select is((select author_name || '|' || (created_at = now())::text from public.community_comments where body = 'prov-c3'),
          'Test User A|true', '… and is stamped the same way');

-- a reader whose card has no name gets the handle the client shows for them (js/auth-ui.js)
update public.profiles set display_name = null where id = '11111111-1111-1111-1111-111111111111';
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select _dml('c_post', $q$insert into public.community_posts (user_id, author_name, title)
  values ('11111111-1111-1111-1111-111111111111', 'Test User B', 'prov-4')$q$);
reset role;
select is((select author_name from public.community_posts where title = 'prov-4'), 'User-11111',
          'provenance ③: with no display name the author is the id handle, not what the request said');

-- the server states its own provenance (seed, service_role) — the trigger's trusted boundary
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select _dml('s_post', $q$insert into public.community_posts (user_id, author_name, title)
  values ('22222222-2222-2222-2222-222222222222', 'Server Name', 'prov-5')$q$);
reset role;
select is((select author_name from public.community_posts where title = 'prov-5'), 'Server Name',
          'provenance ③: service_role is not rewritten');

select * from finish();
rollback;
