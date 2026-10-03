-- ============================================================================
--  pgTAP · 24 — news-story: the two reading doors of 20261003184700_news_story.sql.
--
--  WHAT THIS PROVES (the half that needs a Postgres):
--    · news_title_terms cuts a headline into lower-case words of 3+ letters and digits, once each — the
--      possessive «’s» and «of» are not words, «Tromsø» is one;
--    · news_story returns the event ROWS whose headline holds EVERY word asked for, inside the span, only
--      active ones, and answers nothing for no words, for more than six, or for a span over 62 days;
--    · news_story_terms counts, for each word of a text, the events naming it, how often it is capitalised
--      mid-sentence in sentence-case headlines (a title-case headline is not counted), and how many events
--      hold two words together — and nothing it returns is a headline;
--    · both are SECURITY INVOKER and callable by anon.
--  Which words to suggest from those counts is evaluated in Node by tests/news-next-checks.test.mjs.
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

-- ─────────────────────────────────────────────────────────────────────────────
--  1. THE SURFACE
-- ─────────────────────────────────────────────────────────────────────────────
select has_function('public', 'news_title_terms', array['text'], 'news-story: news_title_terms exists');
select has_function('public', 'news_story', array['text[]', 'timestamp with time zone', 'timestamp with time zone'], 'news-story: news_story exists');
select has_function('public', 'news_story_terms', array['text', 'timestamp with time zone', 'timestamp with time zone', 'real'], 'news-story: news_story_terms exists');
select ok(not (select prosecdef from pg_proc where oid = 'public.news_story(text[], timestamptz, timestamptz)'::regprocedure), 'news-story: news_story is SECURITY INVOKER (news_events RLS decides)');
select ok(not (select prosecdef from pg_proc where oid = 'public.news_story_terms(text, timestamptz, timestamptz, real)'::regprocedure), 'news-story: news_story_terms is SECURITY INVOKER');
select ok(exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'news_events' and indexname = 'idx_news_events_title_terms'), 'news-story: the GIN index on the headline words exists');

select is(public.news_title_terms('‘Idiots and traitors’: World reacts to AfD’s Tromsø victory of 2026'),
          array['2026', 'afd', 'and', 'idiots', 'reacts', 'traitors', 'tromsø', 'victory', 'world']::text[],
          'news-story: lower-case words of 3+ letters/digits, once each, sorted («of» and the possessive «s» are not words)');
select ok(public.news_title_is_sentence_case('Far-right AfD wins historic victory in German state election'), 'news-story: a sentence-case headline is one');
select ok(not public.news_title_is_sentence_case('Trump’s U.N. Speech Comes at a Time of Tumult'), 'news-story: a title-case headline is not');

-- ─────────────────────────────────────────────────────────────────────────────
--  2. FIXTURE — six headlines, one archived, one outside the span
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.news_events (public_id, representative_title, primary_category, rep_lng, rep_lat, first_published_at, independent_source_count, status)
values ('t24a', 'Far-right AfD wins historic victory in German state election', 'politics', 11.6276, 52.1205, '2031-01-10 08:00+00', 3, 'active'),
       ('t24b', 'World reacts to the AfD victory in eastern Germany',          'politics', 13.4050, 52.5200, '2031-01-11 08:00+00', 2, 'active'),
       ('t24c', 'Kremlin says AfD victory is due to the lack of cheap gas',    'world',    37.6173, 55.7558, '2031-01-20 08:00+00', 1, 'active'),
       ('t24d', 'AfD Victory Shakes Berlin',                                   'politics', 13.4050, 52.5200, '2031-01-12 08:00+00', 1, 'archived'),
       ('t24e', 'Merz meets party leaders after the AfD victory',              'politics', 13.4050, 52.5200, '2031-03-30 08:00+00', 1, 'active'),
       ('t24f', 'AfD leader speaks to the press in Magdeburg',                 'politics', 11.6276, 52.1205, '2031-01-13 08:00+00', 1, 'active');

-- ─────────────────────────────────────────────────────────────────────────────
--  3. as anon
-- ─────────────────────────────────────────────────────────────────────────────
set local role anon;
select _sel('st_two',   $q$select string_agg(public_id, ',' order by first_published_at) from public.news_story(array['afd', 'victory'], '2031-01-01', '2031-02-01')$q$);
select _sel('st_one',   $q$select count(*)::text from public.news_story(array['afd'], '2031-01-01', '2031-02-01')$q$);
select _sel('st_none',  $q$select count(*)::text from public.news_story(array[]::text[], '2031-01-01', '2031-02-01')$q$);
select _sel('st_seven', $q$select count(*)::text from public.news_story(array['afd','aaa','bbb','ccc','ddd','eee','fff'], '2031-01-01', '2031-02-01')$q$);
select _sel('st_long',  $q$select count(*)::text from public.news_story(array['afd'], '2030-01-01', '2031-02-01')$q$);
select _sel('tm_n',     $q$select (public.news_story_terms('AfD wins victory', '2031-01-01', '2031-02-01') ->> 'n')$q$);
select _sel('tm_afd',   $q$select (select t::text from jsonb_array_elements(public.news_story_terms('AfD wins victory', '2031-01-01', '2031-02-01') -> 'terms') t where t->>'t' = 'afd')$q$);
select _sel('tm_pair',  $q$select (public.news_story_terms('AfD wins victory', '2031-01-01', '2031-02-01', 1.0) -> 'pairs')::text$q$);
select _sel('tm_text',  $q$select (position('Kremlin' in public.news_story_terms('AfD wins victory', '2031-01-01', '2031-02-01')::text) > 0)::text$q$);
reset role;

select is((select v from _cap where k = 'st_two'),   't24a,t24b,t24c', 'news-story: the active events naming BOTH words, in the span, oldest first (not the archived one, not the one in March)');
select is((select v from _cap where k = 'st_one'),   '4',  'news-story: one word — four active events in January name AfD');
select is((select v from _cap where k = 'st_none'),  '0',  'news-story: no words is not «everything»');
select is((select v from _cap where k = 'st_seven'), '0',  'news-story: more than six words answers nothing');
select is((select v from _cap where k = 'st_long'),  '0',  'news-story: a span over 62 days answers nothing');
select is((select v from _cap where k = 'tm_n'),     '4',  'news-story: n counts the active events of the span');
select is((select v from _cap where k = 'tm_afd'),   '{"t": "afd", "df": 4, "cap": 3, "occ": 3}',
          'news-story: «afd» is in 4 headlines, capitalised mid-sentence in all 3 sentence-case ones where it is not the first word');
select is((select v from _cap where k = 'tm_pair'),  '[["afd", "victory", 3]]', 'news-story: the pair count — 3 events hold «afd» and «victory» together («wins» is in one headline only)');
select is((select v from _cap where k = 'tm_text'),  'false', 'news-story: news_story_terms returns counts, not headlines');

select * from finish();
rollback;
