-- ============================================================================
--  news-intelligence — 出来事の地理・企業・取り込みの健全性を「読める」ようにする
-- ----------------------------------------------------------------------------
--  news_events は 2026-10-02 時点で 19,083 行（うち地点つき 17,435）あるのに、ブラウザが
--  読めるのは「更新の新しい順に 200 件」だけだった。国ごとに何件の出来事が起きているか・
--  それが先週より増えたか・ある企業がどの出来事に出てくるか・取り込みが今も回っているか、
--  のどれも、表の中にはあるのに読者には届いていなかった。この migration はその 4 つの読み口を足す。
--  docs/NEWS-EVENTS.md §16、docs/architecture/04-news.md §4.6。
--
--  1. news_pulse(since, until)      出来事の地点 × 日 × カテゴリの集計を 1 つの jsonb で返す
--  2. news_events_at(points, …)     いくつかの代表地点に載っている出来事の行（国の日報が使う）
--  3. news_event_entities           出来事 × 企業の対応（news-ingest の `entities` 段が書く）
--  4. news_ingest_health()          取り込みの段ごとの最終成功時刻（匿名でも読める要約だけ）
--  5. cron                          news-ingest-tick に `embed` と `entities` を足す
--
--  ⚠ どれも加算である。既存の表・列・関数・ポリシーを 1 つも変えない。
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
--  1. news_pulse — 地点 × 日 × カテゴリ
-- ----------------------------------------------------------------------------
--  ⚠ 国の名前で数えない。出来事の行は国コードを持っておらず（代表地点と地名だけ）、国の
--    境界は DB に無い。だから数えるのは「同じ代表地点に載った出来事」までで、地点を国へ
--    振るのはブラウザが既に持っている国境（Natural Earth）で行う。地名の綴りで国を決めると、
--    「Georgia」（米国の州、代表地点はアトランタ）がジョージア国になる——実測で本番にある行。
--  ⚠ 行ではなく 1 つの jsonb で返す。PostgREST の行数上限（1,000）は関数の返す行にも効き、
--    実測で 30 日ぶんは 10,660 の (地点, カテゴリ, 日) になる。1 値なら 1 往復で済む。
--  ⚠ 数える日は first_published_at（その出来事が最初に報じられた日）の UTC 日付。
--    「その期間に新しく報じられた出来事の数」であって、「期間中に更新された数」ではない。
-- ─────────────────────────────────────────────────────────────────────────────
create index if not exists idx_news_events_first_published
  on public.news_events (first_published_at desc)
  where status = 'active' and merged_into is null;

create or replace function public.news_pulse(p_since timestamptz, p_until timestamptz)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with ev as (
    select rep_lng, rep_lat, primary_category,
           (first_published_at at time zone 'utc')::date as d,
           independent_source_count as srcs
      from public.news_events
     where status = 'active' and merged_into is null
       and first_published_at >= p_since and first_published_at < p_until
       and p_until > p_since
       and p_until - p_since <= interval '62 days'
  ),
  pts as (
    select rep_lng, rep_lat, (row_number() over (order by rep_lng, rep_lat) - 1)::int as i
      from (select distinct rep_lng, rep_lat from ev where rep_lng is not null and rep_lat is not null) x
  ),
  agg as (
    select coalesce(p.i, -1) as i, ev.d, ev.primary_category as c,
           count(*)::int as n, (count(*) filter (where ev.srcs >= 2))::int as m
      from ev left join pts p on p.rep_lng = ev.rep_lng and p.rep_lat = ev.rep_lat
     group by 1, 2, 3
  )
  select jsonb_build_object(
    'since', p_since, 'until', p_until,
    'oldest', (select min(first_published_at) from public.news_events where status = 'active' and merged_into is null),
    'newest', (select max(first_published_at) from public.news_events where status = 'active' and merged_into is null),
    'pts',  coalesce((select jsonb_agg(jsonb_build_array(rep_lng, rep_lat) order by i) from pts), '[]'::jsonb),
    -- [地点の添字（-1 = 地点の無い出来事）, 日付, カテゴリ, 件数, 独立 2 媒体以上の件数]
    'rows', coalesce((select jsonb_agg(jsonb_build_array(i, d, c, n, m) order by d, i) from agg), '[]'::jsonb)
  );
$$;

comment on function public.news_pulse(timestamptz, timestamptz) is
  'news-intelligence: 出来事を (代表地点, 最初に報じられた UTC 日, カテゴリ) で数えた 1 つの jsonb。'
  '期間は最大 62 日。国への振り分けはブラウザが国境で行う（DB は国境を持たない）。SECURITY INVOKER——news_events の RLS が決める。';

revoke all on function public.news_pulse(timestamptz, timestamptz) from public;
grant execute on function public.news_pulse(timestamptz, timestamptz) to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  2. news_events_at — いくつかの代表地点に載った出来事
-- ----------------------------------------------------------------------------
--  国の日報は「この国の境界の中にある代表地点」の集合を持っている（1 の pts を国境で振った
--  結果）。その地点に載った出来事を、表の行の形のまま返す——setof news_events なので、
--  PostgREST は news_events と同じ埋め込み（構成記事）をそのまま付けられ、出来事の詳細
--  （js/news-events.js）は記事一覧から開いたときと同じものを描く。
--  ⚠ 座標は等号で引く。点は 1 の応答がそのまま返ってくるもの（同じ float8 の往復）なので、
--    「近い点」を探す必要は無い。
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.news_events_at(p_points jsonb, p_since timestamptz, p_until timestamptz)
returns setof public.news_events
language sql
stable
security invoker
set search_path = public
as $$
  select e.*
    from public.news_events e
    join (select distinct (x->>0)::double precision as lng, (x->>1)::double precision as lat
            from jsonb_array_elements(coalesce(p_points, '[]'::jsonb)) x
           where jsonb_typeof(x) = 'array') p
      on e.rep_lng = p.lng and e.rep_lat = p.lat
   where e.status = 'active' and e.merged_into is null
     and e.first_published_at >= p_since and e.first_published_at < p_until
     and jsonb_array_length(coalesce(p_points, '[]'::jsonb)) <= 2000
$$;

comment on function public.news_events_at(jsonb, timestamptz, timestamptz) is
  'news-intelligence: 代表地点の一覧 [[lng,lat],…]（最大 2,000）に載り、期間内に最初に報じられた出来事。SECURITY INVOKER。';

revoke all on function public.news_events_at(jsonb, timestamptz, timestamptz) from public;
grant execute on function public.news_events_at(jsonb, timestamptz, timestamptz) to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  3. news_event_entities — 出来事 × 企業
-- ----------------------------------------------------------------------------
--  書き手は news-ingest の `entities` 段だけ（service_role）。規則は
--  supabase/functions/_shared/news-entities.js の 1 本で、企業の名簿は公開サイトが配っている
--  data/companies/index.json（企業アトラスと同じ 1 本）。
--  ⚠ 何で結んだかを行が持つ（matched_by）。「この出来事にこの企業が出てくる」は IntMap が
--    見出しの文字列から導いた主張であって、媒体がそう分類したのではない。読者に見える側は
--    この列と evidence（その主張の根拠になった原文の断片）をそのまま出す。
--  ⚠ 記事は 72 時間で消えるが、出来事は 30 日残る。行は出来事に付け、記事への参照は
--    消えたら null にする（evidence が根拠の文を持ち続ける）。
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.news_event_entities (
  id           bigint      generated by default as identity primary key,
  event_id     bigint      not null references public.news_events(id) on delete cascade,
  entity_kind  text        not null check (entity_kind in ('company')),
  entity_id    text        not null check (entity_id ~ '^[a-z0-9][a-z0-9-]{0,80}$'),
  article_id   bigint      references public.news_articles(id) on delete set null,
  matched_by   text        not null check (matched_by in ('legal_name', 'ticker', 'name')),
  evidence     text        not null check (char_length(evidence) between 1 and 400),
  created_at   timestamptz not null default now(),
  unique (event_id, entity_kind, entity_id)
);

create index if not exists idx_news_event_entities_entity
  on public.news_event_entities (entity_kind, entity_id, created_at desc);

comment on table public.news_event_entities is
  'news-intelligence: 出来事に出てくる企業。news-ingest の entities 段が見出しと説明文から決定論で書く（_shared/news-entities.js）。'
  'matched_by = legal_name（正式名）/ ticker（取引所つきのティッカー）/ name（一般名。単語 1 つの名前は文の大文字が根拠になるときだけ）。';

alter table public.news_articles
  add column if not exists companies_scanned_at timestamptz;

comment on column public.news_articles.companies_scanned_at is
  'news-intelligence: entities 段がこの記事を企業の名簿と照合した時刻（同じ表の entities 列は媒体自身のタグで、別物）。null = まだ見ていない（名簿が取れなかった run は書かない）。';

create index if not exists news_articles_companies_todo_idx
  on public.news_articles (published_at desc)
  where status = 'active' and companies_scanned_at is null;

alter table public.news_event_entities enable row level security;

drop policy if exists news_event_entities_select_all on public.news_event_entities;
create policy news_event_entities_select_all on public.news_event_entities
  for select to anon, authenticated using (true);

revoke all on public.news_event_entities from anon, authenticated;
grant select on public.news_event_entities to anon, authenticated;
grant select, insert, update, delete on public.news_event_entities to service_role;
grant usage, select on sequence public.news_event_entities_id_seq to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  4. news_ingest_health — 取り込みが今も回っているか
-- ----------------------------------------------------------------------------
--  news_ingest_runs は運用者だけが読める（失敗の本文・費用・モデル名を持つ）。読者に要るのは
--  「最後にいつ成功したか」と「どの段が失敗しているか」だけなので、その要約だけを返す
--  SECURITY DEFINER を 1 本置く。本文・費用・モデル名・秘密は 1 つも返さない。
--  ⚠ 「N 時間更新なし」の N を決める周期は、ここで書かない。cron の予定（読めるときだけ）と、
--    実際の run の間隔の中央値（直近 48 時間）の両方を返し、ブラウザがそれで判断する。
--  ⚠ 段の成否は、run 全体の ok と、その段が notes に残す `<段>_error` の有無で決める。
--    `<段>_skipped`（鍵が無い・止めてある）は失敗ではなく「走らなかった」で、別に返す。
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.news_ingest_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  out_j    jsonb;
  stages_j jsonb;
  sched    text := null;
begin
  with r as (
    select started_at, ok, stages, notes
      from public.news_ingest_runs
     where started_at >= now() - interval '7 days'
  ),
  s as (
    select st, r.started_at, r.ok, r.notes
      from r, unnest(r.stages) as st
  )
  select coalesce(jsonb_object_agg(st, j), '{}'::jsonb) into stages_j
    from (
      select st, jsonb_build_object(
        'last_run_at',     max(started_at),
        'last_ok_at',      max(started_at) filter (where ok and (notes ->> (st || '_error')) is null),
        'last_error_at',   max(started_at) filter (where not ok or (notes ->> (st || '_error')) is not null),
        'last_skipped_at', max(started_at) filter (where (notes ->> (st || '_skipped')) is not null),
        'runs_48h',        count(*) filter (where started_at >= now() - interval '48 hours')
      ) as j
        from s
       group by st
    ) x;

  begin
    if to_regclass('cron.job') is not null then
      execute 'select schedule from cron.job where jobname = $1 limit 1' into sched using 'news-ingest-tick';
    end if;
  exception when others then sched := null;
  end;

  with g as (
    select extract(epoch from started_at - lag(started_at) over (order by started_at)) as gap
      from public.news_ingest_runs
     where started_at >= now() - interval '48 hours' and 'fetch' = any(stages)
  )
  select jsonb_build_object(
    'checked_at',      now(),
    'last_run_at',     (select max(started_at) from public.news_ingest_runs),
    'last_ok_at',      (select max(started_at) from public.news_ingest_runs where ok),
    'runs_48h',        (select count(*) from public.news_ingest_runs where started_at >= now() - interval '48 hours'),
    'ok_48h',          (select count(*) from public.news_ingest_runs where started_at >= now() - interval '48 hours' and ok),
    'median_gap_s',    (select percentile_cont(0.5) within group (order by gap) from g where gap is not null),
    'tick_schedule',   sched,
    'newest_event_at', (select max(materially_updated_at) from public.news_events where status = 'active'),
    'newest_article_at', (select max(published_at) from public.news_articles where status = 'active'),
    'stages',          stages_j
  ) into out_j;
  return out_j;
end;
$$;

comment on function public.news_ingest_health() is
  'news-intelligence: news-ingest の段ごとの最終実行・最終成功・最終失敗の時刻と、run の間隔の中央値。'
  'ANON MAY CALL: 読者のニュース画面が「N 時間更新なし」と「確認できなかった」を区別して述べるための要約で、'
  'news_ingest_runs の本文・費用・モデル名・エラー文は 1 つも返さない。';

revoke all on function public.news_ingest_health() from public;
grant execute on function public.news_ingest_health() to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  5. cron — news-ingest-tick に `embed` と `entities` を足す
-- ----------------------------------------------------------------------------
--  ⚠ 20260925090000_cron_jobs_as_code.sql と同じ形（秘密は vault から読み、vault に無ければ何も
--    送らない）。cron.schedule は同名の job をその場で置き換える。
--  ⚠ 段の順序は関数が決める（news-ingest の ORDER）。body の並びは意味を持たない。
--  ⚠ `embed` は鍵が埋め込みモデルに届かないあいだ 0 件で終わり、その理由（configured_model・
--    available_embedding_models・error）を news_ingest_runs.notes に残す——それが「呼ばれない段は
--    存在しない段」（#R404）の裏返しで、届く鍵が入った瞬間から動き出す。
--  ⚠ 予定表を変えたら supabase/functions/news-ingest/index.ts の SCHEDULE も同じにする
--    （tests/edge-spend-and-models-checks.test.mjs ④ が両者を突き合わせる）。
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron is not installed here — news-ingest-tick is not rescheduled (production has it)';
    return;
  end if;

  perform cron.schedule('news-ingest-tick', '*/20 * * * *', $cmd$
select net.http_post(
  url := 'https://vpekfwdpurzejrrmacac.functions.supabase.co/news-ingest',
  headers := jsonb_build_object('Content-Type', 'application/json', 'x-news-ingest-secret', s.decrypted_secret),
  body := '{"stages":["fetch","locate","embed","assign","link","entities","prune"]}'::jsonb
)
from vault.decrypted_secrets s
where s.name = 'news_ingest_secret';
$cmd$);
end $$;
