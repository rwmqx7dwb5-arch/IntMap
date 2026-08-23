-- ============================================================================
--  #R334 — Source Registry の初期データ（18 媒体 / 33 フィード）
-- ----------------------------------------------------------------------------
--  20260823120000_news_events.sql が `news_sources` と `news_source_feeds` の
--  「器」を作った。ここはその中身——**実際に収集する相手の一覧**である。
--
--  ⚠ この 33 本は、2026-08-23 に 1 本ずつ HTTP で取得して確かめたものだけを載せている。
--    33/33 が 200 を返し、33/33 が `<item>` を 1 件以上返した（合計 1,380 件）。
--    内訳は direct_rss 27 本 922 件 ／ google_news_site 3 本 298 件 ／
--    google_news_topic 2 本 140 件 ／ 既定オフの Xinhua 1 本 20 件。
--    取得できなかったフィードは 1 本も無いので、`last_error` を持って生まれる行も無い。
--
--  ⚠ 英語のフィードだけを入れている。翻訳は Event 側（`news_event_i18n`）の仕事で、
--    収集側で言語を混ぜるとクラスタリングの入力が言語ごとに別物になる。
--
--  ─ なぜ集約サイトを 1 つも入れないのか ───────────────────────────────────────
--  Yahoo!ニュース・ライブドア・dメニュー・株探・MSN といった集約サイトは、記事の
--  **発信元ではなく再配信先**である。実測で現行データの **9.2%** がそれで
--  （docs/NEWS-EVENTS.md §2）、1 本の記事が「原発信元」と「集約サイト」の 2 件として
--  届く。Event に入れれば `independent_source_count` がそのぶん水増しされ、
--  「何媒体が報じたか」という Event の中心的な主張が壊れる。
--  ⚠ `google_news` だけは例外的に残すが、`source_type='aggregator'` にしてあるので
--    独立媒体数には数えない。Google News RSS は各 item に
--    `<source url="https://www.reuters.com">Reuters</source>` を付けており
--    （実測: WORLD 70/70・BUSINESS 70/70 の item が `<source>` を持つ）、
--    **本当の発信元は ingest 側が解決できる**。数えるのはそちらである。
--
--  ─ なぜ `source_family` が独立媒体数の単位なのか ──────────────────────────────
--  実測で Sinclair 系列 3 局・Hearst 系列 4 局が**同一タイトル**を配信していた。
--  `name` で数えると 1 つの出来事が「7 媒体が報じた」に化ける。資本と配信系列が同じなら
--  同じ family に入れ、family の異なり数だけを数える（docs/NEWS-EVENTS.md §3）。
--  ここでは 18 媒体 = 18 family だが、系列局を足す日に効くのはこの列である。
--
--  ─ `domains` はホスト名そのもので、接尾辞パターンではない ──────────────────────
--  実測で **CNN の World RSS 29 件のうち 6 件が CNN の記事ではなかった**——
--  fool.com のクレジットカード広告 3 件と lendingtree.com の住宅ローン広告 3 件で、
--  見出しには 2022 年・2024 年が入ったままだった。「そのフィードから来た」は
--  「その媒体が書いた」を意味しない。だから canonical URL のホストを `domains` と
--  **完全一致**で突き合わせる。接尾辞にすると Sky News（`news.sky.com`）が
--  Sky の物販ページ（`sky.com`）まで自分のものだと主張してしまう。
--  この列の値は、2026-08-23 に各フィードの `<link>` から実際に出てきたホストである。
--
--  ─ `hq_lng` / `hq_lat` ────────────────────────────────────────────────────────
--  Publisher モードが打つピンの座標。本社住所を OpenStreetMap（Nominatim / Overpass）
--  で引いた値で、記憶から書いた座標は 1 件も無い。粒度は**建物**が 15 件、
--  campus が 2 件（DW ボン／Sky Isleworth＝OSM が返すのは敷地内の別名の地物）、
--  町丁が 1 件（The Japan Times＝一番町 102-0082。同社が名乗る
--  "Ichibancho-Daini-TG Bldg." は OSM に無い）。
--  ⚠ 住所そのものを媒体自身のページから読んだのは 4 件——DW と France 24 は legal
--    notice（Kurt-Schumacher-Str. 3, 53113 Bonn ／ 80 rue Camille Desmoulins, 92130
--    Issy）、The Japan Times と Yonhap は About ページ。残る 14 件は公開されている
--    本社所在地で、OSM 側の一致した地物名を突き合わせて確かめた。
--
--  ─ `terms_url` は確かめた URL しか書かない ─────────────────────────────────────
--  18 件中 15 件は 2026-08-23 に 200 を返し、内容が利用条件であることを確認した。
--  残る 3 件は **NULL のまま**にしてある（`license_notes` に理由がある）。
--  推測で URL を書けば、出典表記の裏づけとして読まれたときにそれが嘘になる。
--
--  ⚠ `priority` と `expected_interval_s` は列の既定値のままにしてある。前者の順序の
--    意味も後者の媒体ごとの更新間隔も、まだ実測でも仕様でも決まっていない。
--    決まっていない値を「それらしい数」で埋めない。
--
--  ⚠ `category` は 8 種のうち 6 種しか埋まらない。実測の内訳は world 16 / business 5 /
--    science_health 5 / technology 4 / climate_weather 2 / politics 1 で、
--    **`disasters` と `society` を専門に出すフィードは今回の 18 媒体に存在しない**。
--    その 2 つは Event 側の分類器が埋める（docs/NEWS-EVENTS.md §6）。
--
--  ⚠ 冪等。`db reset` の再生でも本番への初回適用でも同じ状態になる。`do update` が
--    触るのは「宣言的な列」だけで、ingest が書く鮮度と失敗の列
--    （`last_success_at` / `last_item_count` / `last_error_at` / `last_error`）は
--    上書きしない。あれは観測結果であって、この migration の主張ではない。
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
--  1. news_sources — 18 媒体
-- ----------------------------------------------------------------------------
--  `aliases` は「本番データと、上の実測で実際に出てきた表記」だけを入れている。
--  ありそうな綴りを想像で足していない——当たらない別名は害が無いように見えて、
--  「別名は網羅されている」という誤った安心を作る。
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.news_sources
  (id, name, slug, aliases, domains, languages, country, region,
   source_type, source_family, homepage_url, terms_url, attribution,
   license_notes, hq_lng, hq_lat, enabled)
values
  ('bbc', 'BBC', 'bbc',
   array['BBC','BBC News','British Broadcasting Corporation'],
   array['www.bbc.co.uk','www.bbc.com'],
   array['en'], 'GB', 'Northern Europe', 'broadcaster', 'bbc',
   'https://www.bbc.com/news',
   'https://www.bbc.co.uk/usingthebbc/terms/',
   'BBC News',
   null,
   -0.1438, 51.5188, true),

  ('guardian', 'The Guardian', 'the-guardian',
   array['The Guardian','Guardian News and Media'],
   array['www.theguardian.com'],
   array['en'], 'GB', 'Northern Europe', 'newspaper', 'guardian',
   'https://www.theguardian.com/international',
   'https://www.theguardian.com/help/terms-of-service',
   'The Guardian',
   null,
   -0.1218, 51.5350, true),

  ('nytimes', 'The New York Times', 'the-new-york-times',
   array['The New York Times','NYT','New York Times'],
   array['www.nytimes.com'],
   array['en'], 'US', 'Northern America', 'newspaper', 'nytimes',
   'https://www.nytimes.com/',
   'https://help.nytimes.com/policies/115014893428-Terms-of-Service',
   'The New York Times',
   null,
   -73.9897, 40.7559, true),

  ('washingtonpost', 'The Washington Post', 'the-washington-post',
   array['The Washington Post'],
   array['www.washingtonpost.com'],
   array['en'], 'US', 'Northern America', 'newspaper', 'washingtonpost',
   'https://www.washingtonpost.com/',
   'https://www.washingtonpost.com/terms-of-service/',
   'The Washington Post',
   'World フィードは実測で 3 件しか返さない（2026-08-23）。空ではないが薄い——「取得できた」を「全部が届いた」と読まないこと。',
   -77.0305, 38.9029, true),

  ('cnn', 'CNN', 'cnn',
   array['CNN','CNN.com','CNN.co.jp'],
   array['www.cnn.com','edition.cnn.com'],
   array['en'], 'US', 'Northern America', 'broadcaster', 'cnn',
   'https://edition.cnn.com/',
   'https://edition.cnn.com/terms',
   'CNN',
   'terms_url は CNN 自身がフッターから張っている入口で、閲覧国に応じて /terms0 (既定) か /terms1 (GB) へ client-side で転送される。⚠ World RSS には fool.com / lendingtree.com のアフィリエイト item が混ざる（実測 29 件中 6 件）ので、記事は必ず domains と突き合わせること。',
   -74.0006, 40.7540, true),

  ('aljazeera', 'Al Jazeera', 'al-jazeera',
   array['Al Jazeera','Al Jazeera English'],
   array['www.aljazeera.com'],
   array['en'], 'QA', 'Western Asia', 'broadcaster', 'aljazeera',
   'https://www.aljazeera.com/',
   'https://www.aljazeera.com/terms-and-conditions',
   'Al Jazeera',
   null,
   51.4987, 25.3158, true),

  ('dw', 'DW', 'dw',
   array['DW.com','dw.com','Deutsche Welle'],
   array['www.dw.com'],
   array['en'], 'DE', 'Western Europe', 'broadcaster', 'dw',
   'https://www.dw.com/en/',
   'https://corporate.dw.com/en/legal-notice/a-15718492',
   'Deutsche Welle (DW)',
   'DW は英語の Terms of Use を別ページとして持たない。terms_url は DW 自身がフッターから張っている legal notice（Impressum）である。',
   7.1279, 50.7170, true),

  ('france24', 'France 24', 'france-24',
   array['France 24'],
   array['www.france24.com'],
   array['en'], 'FR', 'Western Europe', 'broadcaster', 'france24',
   'https://www.france24.com/en/',
   'https://www.francemm.com/en/legal-notice',
   'France 24',
   'terms_url は france24.com のフッターが張っている、運営母体 France Médias Monde の legal notice。France 24 のドメイン上に別の利用規約ページは無い。',
   2.2640, 48.8299, true),

  ('npr', 'NPR', 'npr',
   array['NPR'],
   array['www.npr.org'],
   array['en'], 'US', 'Northern America', 'broadcaster', 'npr',
   'https://www.npr.org/',
   'https://www.npr.org/about-npr/179876898/terms-of-use',
   'NPR',
   null,
   -77.0084, 38.9043, true),

  ('cnbc', 'CNBC', 'cnbc',
   array['CNBC'],
   array['www.cnbc.com'],
   array['en'], 'US', 'Northern America', 'digital', 'cnbc',
   'https://www.cnbc.com/world/',
   'https://www.cnbc.com/terms/',
   'CNBC',
   null,
   -73.9393, 40.8987, true),

  ('skynews', 'Sky News', 'sky-news',
   array['Sky News'],
   array['news.sky.com'],
   array['en'], 'GB', 'Northern Europe', 'broadcaster', 'skynews',
   'https://news.sky.com/',
   null,
   'Sky News',
   'terms_url は NULL。news.sky.com の規約ページは実測で全て 404 を返し（/info/terms-conditions・/info/terms・/info/website-terms）、200 を返す sky.com の Terms and Conditions は TV サービスの契約条件でニュースサイトの利用条件ではない。確かめられない URL は書かない。',
   -0.3276, 51.4894, true),

  ('japantimes', 'The Japan Times', 'the-japan-times',
   array['The Japan Times'],
   array['www.japantimes.co.jp'],
   array['en'], 'JP', 'Eastern Asia', 'newspaper', 'japantimes',
   'https://www.japantimes.co.jp/',
   'https://www.japantimes.co.jp/about-us/link-policy/',
   'The Japan Times',
   'The Japan Times は英語の Terms of Use を公開していない。terms_url は同社がフッターから張っている Link Policy で、記事へのリンクを規定する文書＝IntMap の使い方に対応するもの。',
   139.7415, 35.6874, true),

  ('yonhap', 'Yonhap News Agency', 'yonhap',
   array['Yonhap News Agency'],
   array['en.yna.co.kr'],
   array['en'], 'KR', 'Eastern Asia', 'wire', 'yonhap',
   'https://en.yna.co.kr/',
   'https://en.yna.co.kr/aboutus/copyright',
   'Yonhap News Agency',
   'terms_url は Yonhap 自身の Copyright Statement（About Yonhap 配下）。',
   126.9805, 37.5743, true),

  ('reuters', 'Reuters', 'reuters',
   array['Reuters','Thomson Reuters'],
   array['www.reuters.com','mobile.reuters.com'],
   array['en'], 'GB', 'Northern Europe', 'wire', 'reuters',
   'https://www.reuters.com/',
   null,
   'Reuters',
   'reuters.com の RSS は実測で 404、サイト全体がブラウザ以外に 401 を返すので規約ページも確認できない——だから terms_url は NULL。収集は google_news_site 経由で、そこで適用されるのは Google News RSS の条件である。',
   -0.0185, 51.5056, true),

  ('apnews', 'AP News', 'ap-news',
   array['AP News','Associated Press','AP'],
   array['apnews.com'],
   array['en'], 'US', 'Northern America', 'wire', 'apnews',
   'https://apnews.com/',
   'https://apnews.com/termsofservice',
   'The Associated Press',
   'apnews.com の RSS は実測で 403。収集は google_news_site 経由。',
   -74.0156, 40.7106, true),

  ('bloomberg', 'Bloomberg', 'bloomberg',
   array['Bloomberg'],
   array['www.bloomberg.com'],
   array['en'], 'US', 'Northern America', 'digital', 'bloomberg',
   'https://www.bloomberg.com/',
   'https://www.bloomberg.com/notices/tos/',
   'Bloomberg',
   'bloomberg.com は無料の記事 RSS を公開していない。収集は google_news_site 経由。',
   -73.9680, 40.7617, true),

  ('google_news', 'Google News (aggregate)', 'google-news',
   array['Google News'],
   array['news.google.com'],
   array['en'], 'US', 'Northern America', 'aggregator', 'google_news',
   'https://news.google.com/',
   'https://policies.google.com/terms',
   'Google News',
   '⚠ source_type=''aggregator''。独立媒体数に数えない——ここから来る記事の本当の発信元は item の <source url> にあり、ingest がそれを解決して該当する媒体に付け替える。Phase E までの fallback（docs/NEWS-EVENTS.md §3）。',
   -122.0856, 37.4225, true),

  ('xinhua', 'Xinhua', 'xinhua',
   array['XINHUANEWS'],
   array['www.xinhuanet.com','news.xinhuanet.com','english.news.cn'],
   array['en'], 'CN', 'Eastern Asia', 'official', 'xinhua',
   'https://english.news.cn/',
   null,
   'Xinhua News Agency',
   '⚠ 既定でオフ。国営通信社であり、有効化は「国家の公式発表を独立した媒体と同じ重みで数える」という意図的な判断であるべきなので、既定では収集しない。フィード自体は生きている（2026-08-23 実測で 200・20 件）——これは失敗ではなく方針である。terms_url は NULL: 英語サイトに利用条件のページが見つからなかった。',
   116.3656, 39.8990, false)

on conflict (id) do update set
  name          = excluded.name,
  slug          = excluded.slug,
  aliases       = excluded.aliases,
  domains       = excluded.domains,
  languages     = excluded.languages,
  country       = excluded.country,
  region        = excluded.region,
  source_type   = excluded.source_type,
  source_family = excluded.source_family,
  homepage_url  = excluded.homepage_url,
  terms_url     = excluded.terms_url,
  attribution   = excluded.attribution,
  license_notes = excluded.license_notes,
  hq_lng        = excluded.hq_lng,
  hq_lat        = excluded.hq_lat,
  enabled       = excluded.enabled,
  updated_at    = now();

-- ─────────────────────────────────────────────────────────────────────────────
--  2. news_source_feeds — 33 フィード
-- ----------------------------------------------------------------------------
--  括弧内は 2026-08-23 に実際に返ってきた `<item>` の件数。0 件のものは 1 本も無い。
--  ⚠ `category` はフィード自身が持っている——「どのセクションの RSS か」は分類器より
--    強い証拠である（docs/NEWS-EVENTS.md §3）。だから分類器はここが空のときだけ働く。
--  ⚠ google_news_site の 3 本は、既存の news-relay の allowlist（`/rss/search` と
--    `q`/`hl`/`gl`/`ceid` だけ・`q` は 512 文字以内）を**変更せずに通る**形にしてある。
--    Edge Function 側を緩めないことがこの経路を選んだ条件である。
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.news_source_feeds (source_id, url, collection, category, enabled)
values
  -- direct_rss ───────────────────────────────────────────────────────────────
  ('bbc',            'https://feeds.bbci.co.uk/news/world/rss.xml',                    'direct_rss', 'world',           true),  -- 27
  ('bbc',            'https://feeds.bbci.co.uk/news/business/rss.xml',                 'direct_rss', 'business',        true),  -- 50
  ('bbc',            'https://feeds.bbci.co.uk/news/technology/rss.xml',               'direct_rss', 'technology',      true),  -- 21
  ('bbc',            'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml',  'direct_rss', 'science_health',  true),  -- 42
  ('guardian',       'https://www.theguardian.com/world/rss',                          'direct_rss', 'world',           true),  -- 45
  ('guardian',       'https://www.theguardian.com/uk/technology/rss',                  'direct_rss', 'technology',      true),  -- 28
  ('guardian',       'https://www.theguardian.com/environment/climate-crisis/rss',     'direct_rss', 'climate_weather', true),  -- 13
  ('guardian',       'https://www.theguardian.com/science/rss',                        'direct_rss', 'science_health',  true),  -- 28
  ('nytimes',        'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',         'direct_rss', 'world',           true),  -- 56
  ('nytimes',        'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml',      'direct_rss', 'business',        true),  -- 49
  ('nytimes',        'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml',    'direct_rss', 'technology',      true),  -- 22
  ('nytimes',        'https://rss.nytimes.com/services/xml/rss/nyt/Science.xml',       'direct_rss', 'science_health',  true),  -- 25
  ('nytimes',        'https://rss.nytimes.com/services/xml/rss/nyt/Climate.xml',       'direct_rss', 'climate_weather', true),  -- 46
  ('washingtonpost', 'https://feeds.washingtonpost.com/rss/world',                     'direct_rss', 'world',           true),  --  3
  ('cnn',            'http://rss.cnn.com/rss/edition_world.rss',                       'direct_rss', 'world',           true),  -- 29 (うち6件はアフィリエイト)
  ('aljazeera',      'https://www.aljazeera.com/xml/rss/all.xml',                      'direct_rss', 'world',           true),  -- 25
  ('dw',             'https://rss.dw.com/rdf/rss-en-all',                              'direct_rss', 'world',           true),  -- 132
  ('dw',             'https://rss.dw.com/rdf/rss-en-science',                          'direct_rss', 'science_health',  true),  -- 10
  ('france24',       'https://www.france24.com/en/rss',                                'direct_rss', 'world',           true),  -- 23
  ('france24',       'https://www.france24.com/en/france/rss',                         'direct_rss', 'politics',        true),  -- 30
  ('npr',            'https://feeds.npr.org/1004/rss.xml',                             'direct_rss', 'world',           true),  -- 10
  ('npr',            'https://feeds.npr.org/1007/rss.xml',                             'direct_rss', 'science_health',  true),  -- 10
  ('cnbc',           'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114', 'direct_rss', 'business',   true),  -- 30
  ('cnbc',           'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=19854910',  'direct_rss', 'technology', true),  -- 30
  ('skynews',        'https://feeds.skynews.com/feeds/rss/world.xml',                  'direct_rss', 'world',           true),  -- 10
  ('japantimes',     'https://www.japantimes.co.jp/feed/',                             'direct_rss', 'world',           true),  -- 30
  ('yonhap',         'https://en.yna.co.kr/RSS/news.xml',                              'direct_rss', 'world',           true),  -- 98

  -- direct_rss（媒体そのものが既定でオフ。フィードは生きているが、収集しない）────
  ('xinhua',         'http://www.xinhuanet.com/english/rss/worldrss.xml',              'direct_rss', 'world',           false), -- 20

  -- google_news_site — 無料の直接 RSS を持たない媒体（reuters 404 / apnews 403 を実測）─
  ('reuters',   'https://news.google.com/rss/search?q=when:24h+site:reuters.com&hl=en-US&gl=US&ceid=US:en',   'google_news_site', 'world',    true),  --  98
  ('apnews',    'https://news.google.com/rss/search?q=when:24h+site:apnews.com&hl=en-US&gl=US&ceid=US:en',    'google_news_site', 'world',    true),  -- 100
  ('bloomberg', 'https://news.google.com/rss/search?q=when:24h+site:bloomberg.com&hl=en-US&gl=US&ceid=US:en', 'google_news_site', 'business', true),  -- 100

  -- google_news_topic — 現行の fallback。Phase E まで維持 ─────────────────────
  ('google_news', 'https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en',    'google_news_topic', 'world',    true),  -- 70
  ('google_news', 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en', 'google_news_topic', 'business', true)   -- 70

on conflict (url) do update set
  source_id  = excluded.source_id,
  collection = excluded.collection,
  category   = excluded.category,
  enabled    = excluded.enabled;
