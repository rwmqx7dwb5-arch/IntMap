-- ============================================================================
--  pgTAP · 25 — news-story: the two reading doors of 20261003211600_news_story.sql.
--
--  WHAT THIS PROVES (the half that needs a Postgres):
--    · news_title_terms cuts a headline into lower-case words of 3+ letters and digits, once each — the
--      possessive «’s» and «of» are not words, «Tromsø» is one;
--    · news_story returns the event ROWS whose headline holds EVERY word asked for, inside the span, only
--      active ones, and answers nothing for no words, for more than six, or for a span over 62 days;
--    · news_story_terms counts, for each word of a text, the events naming it, how often it is capitalised
--      mid-sentence in sentence-case headlines (a title-case headline is not counted), and how many events
--      hold two words together — and nothing it returns is a headline;
--    · both are SECURITY INVOKER and callable by anon;
--    · (20261004090000_news_story_one_scan.sql) news_story_terms reads the headline-word index once for all the
--      text's words and never calls news_story — a 24-word text over 4,000 events answers inside the anon
--      statement timeout production enforces (3 s; the old body, three passes of the table per word, did not).
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

-- ─────────────────────────────────────────────────────────────────────────────
--  4. ONE READ, NOT ONE PER WORD (20261004090000_news_story_one_scan.sql)
-- ----------------------------------------------------------------------------
--  Production (2026-10-04, 18,429 active events): the old news_story_terms called news_story twice per word and
--  once per pair, and each call — planned without its arguments — cut every headline of the span into words:
--  one word 1.3 s, two words over the anon statement timeout (3 s, 57014). The body now counts every word and
--  pair from one set. Asserted two ways: the body does not call news_story, and a 24-word text over 4,000
--  events answers under the same 3 s the anon role is held to.
-- ─────────────────────────────────────────────────────────────────────────────
select ok(position('news_story(' in (select prosrc from pg_proc where oid = 'public.news_story_terms(text, timestamptz, timestamptz, real)'::regprocedure)) = 0,
          'news-story: news_story_terms does not call news_story (no pass per word)');
select ok((select prosrc from pg_proc where oid = 'public.news_story(text[], timestamptz, timestamptz)'::regprocedure) ~* 'as materialized',
          'news-story: news_story reads the word index behind a MATERIALIZED fence (the span cannot pull the time index in)');

insert into public.news_events (public_id, representative_title, primary_category, rep_lng, rep_lat, first_published_at, independent_source_count, status)
select 'tld' || i,
       format('%s says %s and %s talks on the %s of %s after %s',
              (array['Alpha','Bravo','Charlie','Delta','Echo','Foxtrot'])[1 + i % 6],
              (array['minister','leader','general','mayor'])[1 + i % 4],
              (array['Golf','Hotel','India','Juliet','Kilo'])[1 + i % 5],
              (array['future','price','border','vote','trade'])[1 + (i / 7) % 5],
              (array['Lima','Mike','November','Oscar','Papa','Quebec','Romeo'])[1 + i % 7],
              (array['week','month','summit','storm'])[1 + (i / 3) % 4]),
       'world', 0, 0, timestamptz '2031-05-01' + (i % 50) * interval '1 day', 1, 'active'
  from generate_series(1, 4000) as i;

create function _timed(k text, q text) returns void language plpgsql as $$
declare c text; t0 timestamptz := clock_timestamp();
begin
  execute q into c;
  insert into _cap values (k, 'ok');
  insert into _cap values (k || '_ms', round(extract(epoch from clock_timestamp() - t0) * 1000)::text);
exception
  when query_canceled then insert into _cap values (k, 'TIMEOUT');
  when others then insert into _cap values (k, 'ERR:' || sqlstate);
end;
$$;

set local role anon;
set local statement_timeout = '3s';
select _timed('load', $q$select public.news_story_terms(
  'Alpha Bravo Charlie Delta Echo Foxtrot minister leader general mayor Golf Hotel India Juliet Kilo future price border vote trade Lima Mike November Oscar',
  '2031-05-01', '2031-06-25')::text$q$);
select _sel('load_n',  $q$select (public.news_story_terms('Alpha minister Golf future Lima week', '2031-05-01', '2031-06-25') ->> 'n')$q$);
select _sel('load_df', $q$select (select (t ->> 'df') from jsonb_array_elements(public.news_story_terms('Alpha minister Golf future Lima week', '2031-05-01', '2031-06-25') -> 'terms') t where t ->> 't' = 'alpha')$q$);
reset statement_timeout;
reset role;

select is((select v from _cap where k = 'load'), 'ok',
          'news-story: 24 words over 4,000 events answer inside the anon statement timeout (3 s) — took ' || coalesce((select v from _cap where k = 'load_ms'), '?') || ' ms');
select is((select v from _cap where k = 'load_n'), '4000', 'news-story: the 4,000 events are in the span');
select is((select v from _cap where k = 'load_df'),
          (select count(*)::text from public.news_events where public_id like 'tld%' and representative_title like 'Alpha %'),
          'news-story: the one-read count of «alpha» is the number of headlines that name it');

select * from finish();
rollback;
