-- ============================================================================
--  saved_news_events.snapshot — 保存した出来事を、記事が消えたあとも読めるようにする
-- ----------------------------------------------------------------------------
--  ⚠ 何が起きていたか（2026-11-17・本番で実測）:
--    · ★を付けた出来事そのもの（news_events）は無期限に残る（docs/NEWS-EVENTS.md §8）。
--      しかし構成記事（news_articles）は CONSTITUTION.md §5 の規則どおり 72 時間で消え、
--      news_event_articles は on delete cascade なので、出来事は「見出しだけ」になる。
--      過去の出来事 10 件を開くと 10 件とも構成記事が 0 件で、説明・出典 URL・時刻が
--      読めなかった。
--  ⇒ 記事の保持期間は変えない（§5 の規則は記事の表についてのもの）。保存した本人の行に、
--    **★を付けた瞬間に画面に出ていたもの**——見出し・説明・出典の見出しと URL と時刻——を
--    写しとして持たせる。記事モードの★が localStorage に写しを持つ（js/news-ui.js snapPut）
--    のと同じ考え方を、出来事と DB に広げる。
--  ⚠ 大きさに上限を付ける（32 KiB）。写しは「読める状態」を保つためのもので、記事の
--    本文の倉庫ではない。クライアントは出典を最大 12 本・説明を 1,200 字までに切って書く。
-- ============================================================================

alter table public.saved_news_events
  add column if not exists snapshot jsonb;

alter table public.saved_news_events
  drop constraint if exists saved_news_events_snapshot_shape;
alter table public.saved_news_events
  add constraint saved_news_events_snapshot_shape check (
    snapshot is null
    or (jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 32768)
  );

comment on column public.saved_news_events.snapshot is
  'What the reader saw when they starred the event (title, summary, sources with URL and time). '
  'Kept because member articles are deleted after 72 hours (CONSTITUTION.md §5).';

-- アカウントのデータ説明（設定 → データ）を、保存しているものの実態に合わせる。
update public.account_data_catalog set
  purpose_en = 'The news events you starred, by event id, with a copy of what the event showed when you starred it (headline, summary, and the sources'' headlines, links and times) so it stays readable after the articles expire.',
  purpose_jp = '★を付けたニュースの出来事（出来事の ID）と、★を付けた時点に表示されていた内容の写し（見出し・要約・出典の見出しとリンクと時刻）。記事が期限で消えたあとも読めるようにするためです。'
where tbl = 'saved_news_events';
