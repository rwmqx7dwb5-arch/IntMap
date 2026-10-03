-- ============================================================================
--  news-story — 同じ名前を述べる出来事を日をまたいで束ね、「ストーリー」として読む
-- ----------------------------------------------------------------------------
--  出来事 (news_events) は「同じ 48 時間に同じことを報じた記事の塊」であって、日をまたいだ
--  続報は別の出来事になる。実測 (2026-10-03・本番 18,786 行): 出来事の 75% は記事 1 本、
--  初報から最新記事までの幅は中央値 0 時間・90 パーセンタイル 17 時間——「AfD がザクセン=アンハルト州
--  選挙で勝った」は 9 月 6 日〜21 日の 8 つの出来事に分かれていて、読者はそれを 1 本の流れとして
--  辿る道を持っていなかった。この migration はその読み口を 2 つ足す。
--  docs/NEWS-EVENTS.md §17、docs/architecture/04-news.md §4.7。
--
--  1. news_title_terms(text)        見出しの語（小文字・英数字の連なり・3 文字以上・重複なし）
--     + その式の GIN 索引
--  2. news_story(terms, since, until)   見出しが terms を「すべて」含む出来事の行（setof news_events）
--  3. news_story_terms(text, since, until, max_share)
--                                   ある見出し（または読者の言葉）の各語が、期間の見出しの何件に
--                                   出てくるか・文中で大文字で書かれる割合・語の対の共起数（1 つの jsonb）
--
--  ⚠ ストーリーの定義は「見出しが同じ語を述べる出来事」であって、IntMap が「同じ話だ」と判定した
--    ものではない。どの語で束ねたかは常に読者に見え、読者が変えられる。どの語を最初に選ぶかは
--    js/news-story-core.js `suggest()` が、ここが返す数だけから決める（SQL は判断しない）。
--  ⚠ 語の切り方は SQL の 1 か所（news_title_terms）だけ。ブラウザは語を自分で切らず、
--    news_story_terms が返した語をそのまま news_story に渡す——照合の規則が 2 つにならない。
--  ⚠ 加算である。既存の表・列・関数・ポリシーを 1 つも変えない。
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
--  1. news_title_terms — 見出しの語
-- ----------------------------------------------------------------------------
--  ⚠ 3 文字未満を捨てる。「of」「in」「a」と、所有格の「’s」が切れて残る「s」が消える。
--    「EU」「UN」「US」も消える——2 文字の語は所有格の残骸と区別できない（「US」と「us」）。
--    消えた語は束ねる語の候補にならないだけで、出来事そのものは消えない。
--  ⚠ IMMUTABLE なのは索引の式に使うため。lower() と regexp は入力だけで決まる。
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.news_title_terms(p text)
returns text[]
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select coalesce(array_agg(distinct w order by w), '{}'::text[])
    from regexp_split_to_table(lower(p), '[^[:alnum:]]+') as w
   where char_length(w) between 3 and 40
$$;

comment on function public.news_title_terms(text) is
  'news-story: 見出しの語（小文字・英数字の連なり・3〜40 文字・重複なし・整列）。news_story の照合と索引の式。';

revoke all on function public.news_title_terms(text) from public;
grant execute on function public.news_title_terms(text) to anon, authenticated, service_role;

create index if not exists idx_news_events_title_terms
  on public.news_events using gin (public.news_title_terms(representative_title))
  where status = 'active' and merged_into is null;

-- ─────────────────────────────────────────────────────────────────────────────
--  2. news_story — 見出しが terms をすべて含む出来事
-- ----------------------------------------------------------------------------
--  setof news_events なので、PostgREST は .select() で列を選べ、出来事の詳細
--  （js/news-events.js openRow）は一覧から開いたときと同じものを描く（news_events_at と同じ形）。
--  ⚠ 語は 1〜6 個。0 個は「全部」になるので答えない（行を返さない）。期間は最大 62 日（news_pulse と同じ）。
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.news_story(p_terms text[], p_since timestamptz, p_until timestamptz)
returns setof public.news_events
language sql
stable
security invoker
set search_path = public
as $$
  select e.*
    from public.news_events e
   where e.status = 'active' and e.merged_into is null
     and public.news_title_terms(e.representative_title) @> p_terms
     and e.first_published_at >= p_since and e.first_published_at < p_until
     and cardinality(p_terms) between 1 and 6
     and p_until > p_since and p_until - p_since <= interval '62 days'
$$;

comment on function public.news_story(text[], timestamptz, timestamptz) is
  'news-story: 見出しの語（news_title_terms）が p_terms（1〜6 語）をすべて含み、期間内（最大 62 日）に最初に報じられた出来事。SECURITY INVOKER——news_events の RLS が決める。';

revoke all on function public.news_story(text[], timestamptz, timestamptz) from public;
grant execute on function public.news_story(text[], timestamptz, timestamptz) to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  3. news_story_terms — どの語で束ねられるか
-- ----------------------------------------------------------------------------
--  返すのは数だけ:
--    n      期間の出来事の数
--    terms  [{t, df, cap, occ}] — t: 語（news_title_terms の綴り）、df: その語を見出しに持つ出来事の数、
--           cap / occ: 「文頭以外の語が大文字で始まらない見出し」（＝見出しが文の書き方で書かれている）の
--           中で、その語が文頭以外に出てきた回数 occ と、そのうち大文字で始まっていた回数 cap
--    pairs  [[a, b, n]] — 2 語とも df が 2 以上かつ n × max_share 以下のとき、両方を持つ出来事の数
--  ⚠ 大文字の割合は「名前かどうか」の手がかりで、見出しの綴り方から測る。英語の見出しには
--    「Trump’s U.N. Speech Comes at a Time of Tumult」のように語ごとに大文字にする書き方があり、
--    そこでは during も Speech も大文字なので数えない（文の書き方の見出しだけを数える）。
--    判定（文頭以外の 4 文字以上の語のうち、大文字で始まるものが半分未満、かつ 4 語以上）は
--    news_title_is_sentence_case の 1 か所。
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.news_title_is_sentence_case(p text)
returns boolean
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select count(*) >= 4 and 2 * count(*) filter (where w ~ '^[[:upper:]]') < count(*)
    from regexp_split_to_table(p, '[^[:alnum:]]+') as w
   where char_length(w) >= 4
$$;

comment on function public.news_title_is_sentence_case(text) is
  'news-story: 見出しが文の書き方か（4 文字以上の語が 4 つ以上あり、大文字で始まるものが半分未満）。news_story_terms の大文字の割合を数える見出しを選ぶ。';

revoke all on function public.news_title_is_sentence_case(text) from public;
grant execute on function public.news_title_is_sentence_case(text) to anon, authenticated, service_role;

create or replace function public.news_story_terms(p_text text, p_since timestamptz, p_until timestamptz, p_max_share real default 0.05)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with q as (
    select t from unnest(public.news_title_terms(left(coalesce(p_text, ''), 400))) as t limit 24
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
  st as (
    select q.t,
           (select count(*) from public.news_story(array[q.t], p_since, p_until))::int as df,
           coalesce(c.cap, 0)::int as cap, coalesce(c.occ, 0)::int as occ
      from q
      left join lateral (
        select count(*) filter (where x.w ~ '^[[:upper:]]') as cap, count(*) as occ
          from public.news_story(array[q.t], p_since, p_until) e
          cross join lateral regexp_split_to_table(
                 regexp_replace(e.representative_title, '^[^[:alnum:]]+', ''), '[^[:alnum:]]+')
                 with ordinality as x(w, k)
         where public.news_title_is_sentence_case(e.representative_title)
           and x.k > 1 and lower(x.w) = q.t
      ) c on true
  ),
  usable as (
    select st.t, st.df from st, tot
     where st.df >= 2 and st.df <= greatest(2, tot.n * greatest(0, least(1, coalesce(p_max_share, 0.05))))
  ),
  pr as (
    select a.t as a, b.t as b,
           (select count(*) from public.news_story(array[a.t, b.t], p_since, p_until))::int as n
      from usable a join usable b on a.t < b.t
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
  'news-story: p_text の各語の出現件数と大文字の割合、共起の数（1 つの jsonb）。どの語で束ねるかは js/news-story-core.js が決める。SECURITY INVOKER。';

revoke all on function public.news_story_terms(text, timestamptz, timestamptz, real) from public;
grant execute on function public.news_story_terms(text, timestamptz, timestamptz, real) to anon, authenticated, service_role;
