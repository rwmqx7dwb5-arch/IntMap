-- ============================================================================
--  pgTAP · 21 — news-intelligence: the four reading doors of 20261003110000_news_intelligence.sql.
--
--  WHAT THIS PROVES (the half that needs a Postgres):
--    · news_pulse counts events by (representative point, first-reported UTC day, category), keeps the
--      ones with no point under index -1, counts the 2+-outlet ones apart, and refuses a span over 62 days
--      by answering nothing for it (not an error, not a truncated count);
--    · news_events_at returns the event ROWS on exactly the points it is given, inside the span;
--    · news_event_entities is readable by everybody and writable by nobody but service_role;
--    · news_ingest_health is SECURITY DEFINER with a pinned search_path, says in its comment why anon may
--      call it, answers anon, and carries NO text of a run (no error message, no model, no cost) —
--      measured over the keys it returns.
--  The matching rule that writes news_event_entities is evaluated in Node by
--  tests/news-intelligence-checks.test.mjs.
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
create function _run(k text, q text) returns void language plpgsql as $$
begin execute q; insert into _cap values (k, 'OK');
exception when insufficient_privilege then insert into _cap values (k, 'DENIED');
        when others then insert into _cap values (k, 'ERR:' || sqlstate); end; $$;

-- ─────────────────────────────────────────────────────────────────────────────
--  1. THE SURFACE
-- ─────────────────────────────────────────────────────────────────────────────
select has_table('public', 'news_event_entities', 'news-intel: news_event_entities exists');
select has_function('public', 'news_pulse', array['timestamp with time zone', 'timestamp with time zone'], 'news-intel: news_pulse exists');
select has_function('public', 'news_events_at', array['jsonb', 'timestamp with time zone', 'timestamp with time zone'], 'news-intel: news_events_at exists');
select has_function('public', 'news_ingest_health', 'news-intel: news_ingest_health exists');
select has_column('public', 'news_articles', 'companies_scanned_at', 'news-intel: news_articles.companies_scanned_at exists');

select ok((select relrowsecurity from pg_class where oid = 'public.news_event_entities'::regclass), 'news-intel: RLS is enabled on news_event_entities');
select ok(not (select prosecdef from pg_proc where oid = 'public.news_pulse(timestamptz, timestamptz)'::regprocedure), 'news-intel: news_pulse is SECURITY INVOKER (news_events RLS decides)');
select ok(not (select prosecdef from pg_proc where oid = 'public.news_events_at(jsonb, timestamptz, timestamptz)'::regprocedure), 'news-intel: news_events_at is SECURITY INVOKER');
select ok((select prosecdef from pg_proc where oid = 'public.news_ingest_health()'::regprocedure), 'news-intel: news_ingest_health is SECURITY DEFINER (news_ingest_runs is admin-only)');
select ok(exists(select 1 from unnest((select proconfig from pg_proc where oid = 'public.news_ingest_health()'::regprocedure)) e where e like 'search_path=%'), 'news-intel: news_ingest_health pins search_path');
select ok(obj_description('public.news_ingest_health()'::regprocedure, 'pg_proc') ~ 'ANON MAY CALL: \S', 'news-intel: news_ingest_health states why anon may call it');

select ok(    has_table_privilege('anon',          'public.news_event_entities', 'select'), 'news-intel: anon can read news_event_entities');
select ok(not has_table_privilege('anon',          'public.news_event_entities', 'insert'), 'news-intel: anon cannot insert into news_event_entities');
select ok(not has_table_privilege('authenticated', 'public.news_event_entities', 'insert'), 'news-intel: authenticated cannot insert into news_event_entities');
select ok(not has_table_privilege('authenticated', 'public.news_event_entities', 'update'), 'news-intel: authenticated cannot update news_event_entities');
select ok(not has_table_privilege('authenticated', 'public.news_event_entities', 'delete'), 'news-intel: authenticated cannot delete from news_event_entities');

-- ─────────────────────────────────────────────────────────────────────────────
--  2. FIXTURE — five events, two points, one with no point, one archived
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.news_events (public_id, representative_title, primary_category, rep_lng, rep_lat, first_published_at, independent_source_count, status)
values ('t18a', 'A', 'politics',  2.3522, 48.8566, '2031-01-10 08:00+00', 3, 'active'),
       ('t18b', 'B', 'politics',  2.3522, 48.8566, '2031-01-10 20:00+00', 1, 'active'),
       ('t18c', 'C', 'business',  2.3522, 48.8566, '2031-01-11 09:00+00', 1, 'active'),
       ('t18d', 'D', 'disasters', 139.6917, 35.6895, '2031-01-11 10:00+00', 2, 'active'),
       ('t18e', 'E', 'world',     null,   null,    '2031-01-11 11:00+00', 1, 'active'),
       ('t18f', 'F', 'world',     2.3522, 48.8566, '2031-01-11 12:00+00', 1, 'archived');

-- ─────────────────────────────────────────────────────────────────────────────
--  3. news_pulse, as anon
-- ─────────────────────────────────────────────────────────────────────────────
set local role anon;
select _sel('p_pts',   $q$select jsonb_array_length(public.news_pulse('2031-01-10', '2031-01-12') -> 'pts')::text$q$);
select _sel('p_paris', $q$select (select sum((r->>3)::int) from jsonb_array_elements(public.news_pulse('2031-01-10', '2031-01-12') -> 'rows') r where (r->>0)::int = 0)::text$q$);  -- points are ordered by (lng, lat): Paris (2.35) is index 0, Tokyo (139.69) index 1
select _sel('p_multi', $q$select (select sum((r->>4)::int) from jsonb_array_elements(public.news_pulse('2031-01-10', '2031-01-12') -> 'rows') r)::text$q$);
select _sel('p_none',  $q$select (select sum((r->>3)::int) from jsonb_array_elements(public.news_pulse('2031-01-10', '2031-01-12') -> 'rows') r where (r->>0)::int = -1)::text$q$);
select _sel('p_day',   $q$select (select sum((r->>3)::int) from jsonb_array_elements(public.news_pulse('2031-01-10', '2031-01-12') -> 'rows') r where r->>1 = '2031-01-10')::text$q$);
select _sel('p_long',  $q$select jsonb_array_length(public.news_pulse('2030-01-01', '2031-06-01') -> 'rows')::text$q$);
select _sel('at_rows', $q$select count(*)::text from public.news_events_at('[[2.3522,48.8566]]'::jsonb, '2031-01-10', '2031-01-12')$q$);
select _sel('at_span', $q$select count(*)::text from public.news_events_at('[[2.3522,48.8566]]'::jsonb, '2031-01-11', '2031-01-12')$q$);
select _sel('health',  $q$select (public.news_ingest_health() ? 'stages')::text$q$);
select _sel('ent_sel', 'select count(*)::text from public.news_event_entities');
select _run('ent_ins', $q$insert into public.news_event_entities (event_id, entity_kind, entity_id, matched_by, evidence) select id, 'company', 'apple', 'name', 'x' from public.news_events where public_id = 't18a'$q$);
reset role;

select is((select v from _cap where k = 'p_pts'),   '2',  'news-intel: two distinct representative points (the archived event and the point-less one add none)');
select is((select v from _cap where k = 'p_paris'), '3',  'news-intel: three active events on the Paris point (the archived one is not counted)');
select is((select v from _cap where k = 'p_multi'), '2',  'news-intel: two events reported by 2+ independent outlets');
select is((select v from _cap where k = 'p_none'),  '1',  'news-intel: the event with no point is counted under index -1, not dropped');
select is((select v from _cap where k = 'p_day'),   '2',  'news-intel: the day is the first-reported UTC date');
select is((select v from _cap where k = 'p_long'),  '0',  'news-intel: a span over 62 days answers no rows');
select is((select v from _cap where k = 'at_rows'), '3',  'news-intel: news_events_at returns the three active rows on that point');
select is((select v from _cap where k = 'at_span'), '1',  'news-intel: …and only those first reported inside the span');
select is((select v from _cap where k = 'health'),  'true', 'news-intel: anon can call news_ingest_health');
select is((select v from _cap where k = 'ent_sel'), '0',  'news-intel: anon can read news_event_entities');
select is((select v from _cap where k = 'ent_ins'), 'DENIED', 'news-intel: anon cannot write news_event_entities');

-- ─────────────────────────────────────────────────────────────────────────────
--  4. news_ingest_health carries no text of a run
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.news_ingest_runs (started_at, finished_at, stages, ok, notes)
values (now() - interval '40 minutes', now() - interval '39 minutes', array['fetch','embed','assign'], true,
        '{"embed_error":"openai embeddings 403 (secret-model-name): body","error":null}'::jsonb),
       (now() - interval '20 minutes', now() - interval '19 minutes', array['fetch','embed','assign'], true, '{}'::jsonb);

select ok(position('secret-model-name' in public.news_ingest_health()::text) = 0, 'news-intel: no error text, model name or note reaches the summary');
select ok((public.news_ingest_health() -> 'stages' -> 'embed' ->> 'last_error_at') is not null, 'news-intel: a stage that left <stage>_error is reported as having failed');
select ok((public.news_ingest_health() -> 'stages' -> 'embed' ->> 'last_ok_at') is not null, 'news-intel: …and its later clean run as its last success');
select ok((public.news_ingest_health() ->> 'median_gap_s')::float8 between 1100 and 1300, 'news-intel: the median gap is measured from the runs (20 minutes apart)');

select * from finish();
rollback;
