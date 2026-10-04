-- ============================================================================
--  news-story-one-scan — the story's two doors read the headline-word index, once
-- ----------------------------------------------------------------------------
--  20261003211600_news_story.sql shipped news_story / news_story_terms; on production both doors failed for
--  anything but the shortest question. Measured 2026-10-04 (production cb3a391, 18,429 active events, anon):
--    · POST rpc/news_story_terms «earthquake»       → 500 57014 (statement timeout) after 3.76 s
--      «earthquake japan» and a whole headline      → 500 57014 after 3.06 s
--    · EXPLAIN ANALYZE, as anon, read-only transaction:
--        news_story(array['earthquake'], 60 days)                      630.8 ms  (9 rows)
--        the same WHERE written out with literals                       15.1 ms  (Bitmap Index Scan idx_news_events_title_terms)
--        the same WHERE as a prepared statement, force_generic_plan    633.9 ms  (Index Scan idx_news_events_first_published,
--                                                                                 Filter news_title_terms(...) @> $1,
--                                                                                 Rows Removed by Filter: 18,420)
--      news_story_terms('earthquake')                                1,291.2 ms
--
--  WHY. A SQL function with a SET clause is not inlined, so its body is planned WITHOUT the arguments' values
--  (a generic plan). With `first_published_at >= $2 and < $3` unknown, the planner estimates the span holds
--  ~1 row and walks idx_news_events_first_published (20261003160000_news_intelligence.sql) — then evaluates
--  news_title_terms (a regexp split, ~34 µs) on EVERY active row of the span to test `@> $1`. The span is
--  60 days and the news retention is about that, so «every row of the span» is the whole table, every call.
--  news_story_terms then called news_story twice per word (df, capitals) and once per pair of words:
--  1 word = 3 whole-table passes (1.3 s), 2 words = 5+ (> 3 s, the anon statement timeout).
--
--  WHAT CHANGES (same signatures, same answers, same grants — this replaces two bodies and nothing else):
--    1. news_story: the GIN predicate is fenced in a MATERIALIZED CTE that carries no time condition, so the
--       only ways to read it are the headline-word index or a scan of the table — never the time index with
--       the word test as a filter. The span is applied to the rows the index returned.
--    2. news_story_terms: ONE read of the index for ALL the text's words (`&&`, any of them), the words each
--       row names among them computed once per row, and the counts — df per word, capitals per word, the
--       co-occurrence of every pair — taken as GROUP BYs over that one set. The work grows with the rows that
--       name a word of the text, not with the number of words, and never calls news_story.
--  The answers are unchanged: tests/fixtures/news-story-prod.json was produced by the old bodies on production's
--  rows and the new bodies return the same jsonb for every seed (dev-notes/2026-10-04-wave2-prod-fixes.md).
--  docs/NEWS-EVENTS.md §17, docs/architecture/04-news.md §4.7.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
--  1. news_story — the rows the headline-word index holds, then the span
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.news_story(p_terms text[], p_since timestamptz, p_until timestamptz)
returns setof public.news_events
language sql
stable
security invoker
set search_path = public
as $$
  -- ⚠ MATERIALIZED and no first_published_at in here: the fence is what keeps the time index out of this
  --   read (the generic plan chose it and tested the words row by row — see the header).
  with hit as materialized (
    select e.*
      from public.news_events e
     where e.status = 'active' and e.merged_into is null
       and public.news_title_terms(e.representative_title) @> p_terms
       and cardinality(p_terms) between 1 and 6
  )
  select h.*
    from hit h
   where h.first_published_at >= p_since and h.first_published_at < p_until
     and p_until > p_since and p_until - p_since <= interval '62 days'
$$;

comment on function public.news_story(text[], timestamptz, timestamptz) is
  'news-story: 見出しの語（news_title_terms）が p_terms（1〜6 語）をすべて含み、期間内（最大 62 日）に最初に報じられた出来事。語の照合は GIN 索引 idx_news_events_title_terms だけで読む（MATERIALIZED の囲い——時刻の索引で全行の語を切る計画を取らせない）。SECURITY INVOKER——news_events の RLS が決める。';

-- ─────────────────────────────────────────────────────────────────────────────
--  2. news_story_terms — every count from one read
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.news_story_terms(p_text text, p_since timestamptz, p_until timestamptz, p_max_share real default 0.05)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with q as (
    select coalesce(array_agg(t), '{}'::text[]) as ts
      from (select t from unnest(public.news_title_terms(left(coalesce(p_text, ''), 400))) as t limit 24) s
  ),
  span_ok as (
    select (p_until > p_since and p_until - p_since <= interval '62 days') as ok
  ),
  tot as (
    select count(*)::int as n
      from public.news_events e, span_ok
     where span_ok.ok and e.status = 'active' and e.merged_into is null
       and e.first_published_at >= p_since and e.first_published_at < p_until
  ),
  -- THE ONE READ: every active event whose headline names ANY of the text's words. ⚠ MATERIALIZED and no time
  -- condition, for the same reason as news_story: the headline-word index is the only way in.
  hit as materialized (
    select e.representative_title as title, e.first_published_at as at
      from public.news_events e
     where e.status = 'active' and e.merged_into is null
       and public.news_title_terms(e.representative_title) && (select ts from q)
  ),
  -- per row, once: which of the text's words it names (m), and whether it is written in sentence case (sc)
  win as materialized (
    select h.title,
           (select array_agg(x order by x) from unnest(public.news_title_terms(h.title)) as x where x = any (q.ts)) as m,
           public.news_title_is_sentence_case(h.title) as sc
      from hit h, span_ok, q
     where span_ok.ok and h.at >= p_since and h.at < p_until
  ),
  df as (
    select x as t, count(*)::int as df from win cross join lateral unnest(win.m) as x group by x
  ),
  caps as (
    select lower(w.w) as t, count(*) filter (where w.w ~ '^[[:upper:]]')::int as cap, count(*)::int as occ
      from win
      cross join lateral regexp_split_to_table(regexp_replace(win.title, '^[^[:alnum:]]+', ''), '[^[:alnum:]]+')
           with ordinality as w(w, k)
     where win.sc and w.k > 1 and lower(w.w) = any (win.m)
     group by lower(w.w)
  ),
  st as (
    select q1.t, coalesce(df.df, 0) as df, coalesce(caps.cap, 0) as cap, coalesce(caps.occ, 0) as occ
      from (select unnest(ts) as t from q) q1
      left join df on df.t = q1.t
      left join caps on caps.t = q1.t
  ),
  usable as (
    select st.t from st, tot
     where st.df >= 2 and st.df <= greatest(2, tot.n * greatest(0, least(1, coalesce(p_max_share, 0.05))))
  ),
  pr as (
    select a.x as a, b.x as b, count(*)::int as n
      from win
      cross join lateral unnest(win.m) as a(x)
      cross join lateral unnest(win.m) as b(x)
     where a.x < b.x
       and a.x in (select t from usable) and b.x in (select t from usable)
     group by a.x, b.x
  )
  select jsonb_build_object(
    'since', p_since, 'until', p_until,
    'n', (select n from tot),
    'maxShare', p_max_share,
    'terms', coalesce((select jsonb_agg(jsonb_build_object('t', t, 'df', df, 'cap', cap, 'occ', occ) order by df, t) from st), '[]'::jsonb),
    'pairs', coalesce((select jsonb_agg(jsonb_build_array(a, b, n) order by n desc, a, b) from pr where n >= 2), '[]'::jsonb)
  );
$$;

comment on function public.news_story_terms(text, timestamptz, timestamptz, real) is
  'news-story: p_text の各語の出現件数と大文字の割合、共起の数（1 つの jsonb）。GIN 索引を 1 回だけ読み（文の語のどれかを含む出来事）、語と対の数をその 1 つの集合から GROUP BY で出す——語の数に比例して走査が増えない。どの語で束ねるかは js/news-story-core.js が決める。SECURITY INVOKER。';
