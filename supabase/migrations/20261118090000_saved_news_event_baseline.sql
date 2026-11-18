-- ============================================================================
--  saved_news_events.snapshot — the copy is also the reader's baseline for «what changed since»
-- ----------------------------------------------------------------------------
--  The ★ copy (20261117150000_saved_news_event_snapshot.sql) now also records what the event's row and detail stated
--  when it was taken — the article and outlet counts, the time of the latest article, the AI summary's version and
--  fingerprint, the outlet groups among its articles and the figures its «Key figures» showed — so that reopening a
--  saved event can say what was reported since (js/news-events.js `sinceSaved`). «Mark as read» re-takes the copy
--  through the same row. No column changes: the copy stays one jsonb object under the existing 32 KiB check.
--  ⇒ Only the account's description of what this table holds changes, so it matches what is stored.
-- ============================================================================

update public.account_data_catalog set
  purpose_en = 'The news events you starred, by event id, with a copy of what the event showed when you starred it or last marked it as read (headline, summary, the sources'' headlines, links and times, and its report counts and figures), so it stays readable after the articles expire and IntMap can show what was reported since.',
  purpose_jp = '★を付けたニュースの出来事（出来事の ID）と、★を付けた時点または最後に既読にした時点に表示されていた内容の写し（見出し・要約・出典の見出しとリンクと時刻、報道の件数と数字）。記事が期限で消えたあとも読めるようにし、その後に何が報じられたかを示すためです。'
where tbl = 'saved_news_events';
