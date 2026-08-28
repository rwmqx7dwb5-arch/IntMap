-- ═══════════════════════════════════════════════════════════════════════════════
--  R405 — 本文の来ない経路を、本文の来る経路に置き換える（実測 2026-08-24）
--  docs/NEWS-EVENTS.md §3（どこから集めるか）/ §15（やらないこと）
-- -----------------------------------------------------------------------------
--  この migration の数字は**すべて 2026-08-24 に実際に取得して数えた値**である。
--  「たぶん動く」で足したフィードは 1 本も無い。
--
--  ⚠⚠⚠ ① **Bloomberg の記事は 1 本残らず本文 0 文字だった**（本番 62 本）。原因は
--         フィードそのものではなく**収集経路**である。Bloomberg は
--         `google_news_site`（`news.google.com/rss/search?q=when:24h+site:bloomberg.com`）
--         で集めており、Google はこの経路の `<description>` に**記事へのリンクの一覧**を
--         入れてくる。#R351 の `isLinkList()` はそれを正しく捨てる——捨てた先に本文が
--         無いだけである。実測: この URL は 100 item を返し、**40 文字以上の本文を持つ
--         item は 0 本**。
--         ⇒ Bloomberg は**直接 RSS を持っている**（下の 5 本）。そちらへ移す。
--
--  ⚠⚠⚠ ② **Reuters と AP には、無料で使える直接 RSS が存在しない。** 11 の綴りを
--         実際に叩いて全滅を確認した（下の表）。この 2 社は `google_news_site` のまま
--         にする。**次のラウンドが同じ探索をやり直さないために、測った URL を全部残す。**
--
--  ⚠⚠  ③ **CNN の direct_rss は 200 を返すが、中身は 3 年前で止まっている。**
--         enabled は落とさない（機能の無効化は別の判断であって、この作業の範囲外）。
--         **測った事実だけを行に書く。**
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
--  1. Bloomberg — Google 経由をやめ、媒体自身の RSS 5 本から集める
-- ----------------------------------------------------------------------------
--  採った 5 本（2026-08-24 実測。items ＝ 返ってきた <item> 数、
--  desc≥40 ＝ parseFeed が 40 文字以上の本文を取れた item 数、最新 ＝ 先頭記事の齢）:
--
--    markets    /markets/news.rss     items 20 / desc≥40 20 / 最新 0.01 日
--    politics   /politics/news.rss    items 20 / desc≥40 20 / 最新 0.00 日
--    technology /technology/news.rss  items 14 / desc≥40 13 / 最新 0.10 日
--    industries /industries/news.rss  items 15 / desc≥40 15 / 最新 0.11 日
--    economics  /economics/news.rss   items 11 / desc≥40 11 / 最新 0.01 日
--                                     （同日の先行実測では 10/10。RSS は動く窓である）
--
--  ⚠ **記事の link はすべて `https://www.bloomberg.com/…`** で、`news_sources.domains`
--    （`www.bloomberg.com`）と完全一致する。実測 80/80 item。だから `attribute()` は
--    canonical_host で Bloomberg に帰属でき、Google 経由のような `<source url>` 頼りの
--    間接帰属にならない。
--
--  ⚠ **測って採らなかったもの**（次のラウンドが「これも足せるのでは」と考えないため）:
--      feeds.bloomberg.com/wealth/news.rss      … 200 だが **item 0 件**（空の器）
--      feeds.bloomberg.com/green/news.rss       … **404**
--      feeds.bloomberg.com/business/news.rss    … 200・item 20 だが **desc≥40 が 3 本だけ**
--                                                 （見出しだけの束で、要約として使えない）
--
--  ⚠ 冪等。すでに在る URL は触らない——`enabled` を上書きすると、あとで運用者が
--    落としたフィードを migration の再適用が黙って戻す。
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.news_source_feeds (source_id, url, collection, category, enabled)
values
  ('bloomberg', 'https://feeds.bloomberg.com/markets/news.rss',    'direct_rss', 'business',   true),
  ('bloomberg', 'https://feeds.bloomberg.com/politics/news.rss',   'direct_rss', 'politics',   true),
  ('bloomberg', 'https://feeds.bloomberg.com/technology/news.rss', 'direct_rss', 'technology', true),
  ('bloomberg', 'https://feeds.bloomberg.com/industries/news.rss', 'direct_rss', 'business',   true),
  ('bloomberg', 'https://feeds.bloomberg.com/economics/news.rss',  'direct_rss', 'business',   true)
on conflict (url) do nothing;

--  Google 経由の Bloomberg（本番実測 id = 31・
--  `https://news.google.com/rss/search?q=when:24h+site:bloomberg.com&hl=en-US&gl=US&ceid=US:en`）を止める。
--  ⚠ **行は消さない。** `news_articles.feed_id` がこの行を参照しており、消せば
--    「どこから届いたか」を後から説明できなくなる（`on delete set null` は履歴を消す）。
--  ⚠ id ではなく「どの媒体の・どの収集経路か」で指す。id は identity であって仕様ではない。
update public.news_source_feeds
   set enabled = false
 where source_id = 'bloomberg'
   and collection = 'google_news_site';

-- ─────────────────────────────────────────────────────────────────────────────
--  2. Reuters と AP — 直せない理由を、測った URL ごと残す
-- ----------------------------------------------------------------------------
--  実測 2026-08-24（すべて GET・リダイレクト追従・通常の UA）:
--
--    https://apnews.com/hub/world-news/rss                  404（HTML の 404 ページ 868 KB）
--    https://apnews.com/hub/ap-top-news/rss                 404（同上）
--    https://apnews.com/index.rss                           401
--    https://apnews.com/rss                                 404
--    https://apnews.com/feed                                404
--    https://www.reuters.com/arc/outboundfeeds/rss/?outputType=xml   404
--    https://www.reuters.com/rssfeed/world                  401
--    https://www.reuters.com/tools/rss                      401
--    https://www.reuters.com/rss/world                      401
--    http://feeds.reuters.com/reuters/worldNews             DNS 解決に失敗（ホストが無い）
--    https://www.reutersagency.com/feed/                    404
--
--  ⇒ **この 2 社の行は変更しない。** `google_news_site` は本文を運ばないが、
--    見出し・URL・`<source url>` は運ぶので、出来事の構成には今も効いている
--    （Bloomberg と違い、代わりの直接 RSS が**存在しない**）。
--  ⚠ 401 は「鍵を持てば通る」ではない。両社とも RSS は法人契約の配信商品であり、
--    無断で回避する経路を探さない（docs/NEWS-EVENTS.md §15）。

-- ─────────────────────────────────────────────────────────────────────────────
--  3. CNN の direct_rss — 生きているように見えて、3 年前で止まっている
-- ----------------------------------------------------------------------------
--  実測 2026-08-24（本番実測 id = 15・`http://rss.cnn.com/rss/edition_world.rss`）:
--    HTTP 200 / item 29 件 / **最新の記事が 1,071 日前・中央値 1,235 日前**。
--    同じホストの他の綴りも同様に凍っている——`edition.rss` は最新 867 日、
--    `cnn_topstories.rss` は最新 1,210 日。つまり `rss.cnn.com` は 2023 年ごろから
--    更新されていない。
--    ⚠ しかも 29 件のうち 6 件は CNN の記事ですらない（fool.com 3・lendingtree.com 3 の
--      アフィリエイト。#R334 が実測したものが今も残っている）。
--
--  ⚠⚠ **enabled を落とさない。** 「取れているのに古い」は「壊れている」とは違い、
--    止めるかどうかは**機能の無効化の判断**である（AGENTS.md §3.1）。ここでやるのは
--    次に見た人が同じ調査を繰り返さずに済むよう、**測った事実を行に書くこと**だけ。
--
--  ⚠ `last_error_at` は書かない。あの列は「取得が失敗した時刻」で、この取得は
--    失敗していない（200 と 29 件が返っている）。起きていないエラーの時刻を書けば、
--    フィードの健康を見る側が嘘を読む。
--
--  ⚠ **この注記は次の ingest 実行で消える。** `supabase/functions/news-ingest/index.ts`
--    は取得が成功した行に `last_error = null` を書き戻すので、200 を返し続けるこの
--    フィードでは毎回上書きされる。恒久的な記録はこの migration のコメントのほうであり、
--    行に書くのは「今この表を見た運用者に届く」ためである。
update public.news_source_feeds
   set last_error = 'R405 measured 2026-08-24: feed returns 200 with 29 items but newest item is 1071 days old (median 1235d); rss.cnn.com appears frozen since ~2023. Not disabled — needs a decision.'
 where url = 'http://rss.cnn.com/rss/edition_world.rss';

-- ────────────────────────────────────────────────────────────────────────────
--  cron: 止まった `translate` の枠を `summarise` に付け替える  (#R405)
-- ----------------------------------------------------------------------------
--  ⚠⚠⚠ **呼ばれない段は存在しない段である**（#R404 が同じことを言っている）。
--    `docs/NEWS-EVENTS.md` §12.1 は `news-ingest-summarise` が 1 時間ごとに回ると
--    書いているので、それを実在させる。書いてあるのに存在しない cron は、
--    「走っている機構」を名乗る列と同じ嘘である。
--
--  ⚠ **新しい job を作らず、`news-ingest-translate` の command を書き換える。**
--    ① その command には `x-news-ingest-secret` が入っている——migration から
--       秘密を書き直すことはできないし、してはならない。段の一覧だけを置換する。
--    ② 日本語訳は #R405 の決定 14 で止まった（段が既定 off）。枠を空けたまま
--       1 時間ごとに「何もしない run」を呼び続ける理由が無い。
--    ③ 頻度は据え置き（1 時間）。要約は Event 1 件あたりに払うもので、`summary_evidence.fp`
--       があるので**構成記事が変わったときだけ**払う。上限は 1 run 30 件。
--
--  ⚠ job 名も `news-ingest-summarise` へ変える——`cron.job` を見た人が、その job が
--    何をしているかを名前で言えるように。⚠ 名前を変えるだけの run が失敗しても
--    取り込み本体（`news-ingest-tick`）には触れていない。
-- ────────────────────────────────────────────────────────────────────────────
do $$
declare
  j       record;
  newcmd  text;
  touched integer := 0;
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron is not installed here — skipping the news-ingest-summarise cron';
    return;
  end if;

  for j in select jobid, jobname, command from cron.job where jobname = 'news-ingest-translate' loop
    newcmd := replace(j.command, '"stages":["translate"]', '"stages":["summarise"]');
    if newcmd = j.command then
      raise notice 'news-ingest-translate does not carry a ["translate"] stage list — leaving it alone';
      continue;
    end if;
    /* ⚠⚠⚠ **`update cron.job` ではなく `cron.schedule`。** 実測 (2026-08-24): Management API の
       login role は `cron.job` に直接 UPDATE できず、`permission denied for table job` で
       **migration ごとロールバックする**（適用は 1 トランザクションなので、部分適用はしない）。
       `cron.schedule` は同名の job を置き換えるので、名前を変える操作もこれで書ける。
       ⚠ **command は値として渡すだけ**——秘密 (`x-news-ingest-secret`) は DB の外へ出ないし、
         この migration が書き直すのは**段の一覧の文字列だけ**である。 */
    perform cron.schedule('news-ingest-summarise', '13 * * * *', newcmd);
    perform cron.unschedule(j.jobid);
    touched := touched + 1;
  end loop;

  if touched = 0 then
    raise notice 'no news-ingest-translate job to repoint — already done, or pg_cron holds no such job';
  end if;
end $$;
