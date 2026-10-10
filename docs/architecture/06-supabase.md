# IntMap — 現状仕様書 §6 Supabase（テーブル・Edge Functions・環境変数）

> **現状仕様書の §6。** 案内図は [`Architecture.md`](../../Architecture.md)（§ → ファイルの表）。**節番号は案内図と共有している**
> ——他の文書・コード・テストが書く「`Architecture.md` §6.x」は、このファイル（と案内図の表が同じ行に挙げる文書）の見出しを指す。
> 今どうなっているかだけを書く。変更履歴・ラウンド番号・PR 番号は書かない（`npm run check:docs` の `arch-rounds` がこのファイルも読む）。

## 6. Supabase（テーブル・Edge Functions・環境変数）

**Project ref:** `vpekfwdpurzejrrmacac`。公開 (anon/publishable) キーは `src/vendor.js` と `admin.html` にあり、**公開前提**で保護は RLS が行う（§16・§17）。

### 6.1 テーブル

**表の一覧・列・関係・RLS 方針の正本は [`docs/DATABASE.md`](../DATABASE.md)**（pgTAP による実証手順も同じファイル）。現在 **45 表**（`quest_daily_results`（今日のクエストの記録・§8.6.4） /
`map_corrections`（地図の誤り報告・§11） / `place_watches`（見守る場所） / `saved_views` / `collection_shares` / `news_event_entities` / `ai_turn_answers` / `atlas_notebook_entries`（Atlas の
調査ノート・同期をオンにした読者のみ） / `usage_counts` / `saved_places` / `account_data_catalog` / `profiles` / `profiles_public` / `current_news` / `geo_pins` / `favorites` / `user_prefs` /
`dashboard_cards` / `ai_usage` / `ai_turns` / `ai_gloss_usage` / `relay_rate_buckets` / `atlas_capability_vectors` / `usage_counts`（匿名の利用統計） / `community_*` 5 表 / `feedback` /
`bug_reports` / `donations` / News Events の 8 表＝`news_sources` / `news_source_feeds` / `news_articles` / `news_events` / `news_event_articles` / `news_cluster_decisions` /
`news_event_i18n` / `saved_news_events` ＋取り込みの計測 `news_ingest_runs` ＋運用者の監査証跡 `news_event_admin_actions` ＋ WHO Disease Outbreak News の症例数・死亡数
`who_don_extracts` ＋ 利用者のブラウザで起きたエラーの記録 `client_errors` ＋ 組織からの相談 `org_inquiries` と、掲載を希望した支援者 `supporters`）。

- **アカウントのデータは利用者自身が開ける。** 「何を持っているか」（`account_data_inventory()`）・「全部ください」（`export_account_data()`）・「消してください」（`delete_account_data()`）の
  3 つが同じ 1 つの発見——`_owned_by_user_cols()`（`auth.users` を指す列）——を歩く（後で足された表も外部キーができた瞬間に入る。書き出しは削除より小さくなれない——pgTAP
  `23_account_data_center_test.sql`）。各表の「何か・なぜ・いつまで・誰が書いたか」は `account_data_catalog` の 1 行（en+jp）で、説明であって絞り込みではない。目録と書き出しは引数を
  取らず `auth.uid()` で決める。書き出しは共有バケツ `relay_take('account-export')` でアカウントごとに 1 時間 6 回（拒否は `{ok:false,error:'rate_limited'}`）。
- **マイプレイス（`saved_places`）** の入口は `save_place()` だけ（位置〔約 1 m〕が同じなら同じ 1 行・2 度目は `created=false`、上限は `saved_places_limit()`＝1 アカウント 10,000）。読む・
  変える・消すは所有者の RLS。Edge Function は無い。画面と Atlas の入口は §8（`js/account-data.js`・`js/my-places.js`・`account.*` / `places.*`）。
- **保存した地図（`saved_views`）は地図ドキュメント**（`js/map-doc.js`）——共有リンクのフラグメント（`js/map-state.js` の codec）を名前・メモ・コレクションつきで持ち、マイマップ（`mm=`）・
  ツアー・Atlas の回答も持つ: `kind`（`view`|`map`|`tour`|`brief`。名前の札で DB は分岐しない）と `steps`（地図 1 枚は NULL、それ以外は `[{state,title,say,ask}]`、
  `saved_view_steps_limit()`＝200 段・1 MiB まで）。`state` は最初に地図を持つ段の地図。同一性は `doc_md5`＝md5(state ‖ steps)（`steps` が NULL なら `state_md5` と同じ）。入口は
  `save_view()` の 2 つの形（4 引数＝地図 1 枚、6 引数＝`kind` と `steps` つき。6 引数側は既定値を持たない）で、上限は `saved_views_limit()`（2,000）。`kind`・`steps` はその場で書き換え
  られない。
- **`collection_shares`** は持ち主が明示的に公開したコレクション（`collection` NULL＝全部）。入口は `publish_collection()` だけ・1 コレクション 1 本。トークンは `gen_random_uuid()` の 32 桁
  （122 ビット）で、リンクそのものが閲覧の鍵。公開の読み取りは `shared_collection(token)` 1 つだけ（SECURITY DEFINER で `anon` が呼べ、コメントに `ANON MAY CALL:` の理由。今の場所と
  地図を id・アカウント・メールを含まずに返し、各地図の `kind` と `steps` も返す）。`anon` は 2 表のどちらにも権限を持たない。`copy_shared_collection(token)` はログインした読者が自分の
  アカウントへ写す（同じものは「保存済み」・`source` は `shared`・ドキュメントごと写す）。公開をやめるのは所有者の DELETE（リンクは `not_found`）。pgTAP `24_collection_workspace_test.sql`。
- **見守る場所（`place_watches`）** は保存場所 1 件に 1 行（`place_id` が主キー）。半径・種類ごとの基準（NULL＝見守らない）・オン/オフ・既読（`seen_at`・`seen_keys` ≤ 2,000）。所有者の
  RLS で、挿入は場所が呼び手のものであるときだけ、`user_id` はトリガー `tg_place_watches_own` が固定する。判定はページ（§18.1）。
- **今日のクエストの記録（`quest_daily_results`）** は読者・暦の日・種類ごとに 1 行（主キー）で 5 問の得点だけ（`js/quest-engine.js` の `DAILY_N`・`QUEST_MAX`）。UPDATE の権限が無く
  2 回目は主キーで拒まれる。所有者の RLS、`user_id` はトリガー `tg_quest_daily_results_own` が固定し、UTC で明日より後の日は拒む。pgTAP は `30_quest_daily_test.sql`。

**DB の設計図は `supabase/migrations/` だけ**（全テーブル・制約・index・RLS・grants・トリガ・RPC）。本番へ手で SQL を流さない。手順は [`docs/MIGRATIONS.md`](../MIGRATIONS.md)。

### 6.2 Edge Functions — **21本**（`_shared/` は関数ではない）

> **21本すべてを `supabase/config.toml` に `[functions.*]` として宣言する**（ヘッダコメントの deploy フラグは設定ではない）。
> `supabase/functions/_shared/` は `newsgeo.js`・`relay-guard.js`・`rate-limit.js`・`volcano-parse.js` などを置くライブラリで、
> import した関数の中に CLI がバンドルする。`[functions._shared]` は書かない。

- **`ai-proxy`** … アカウント制AI（§5）。`verify_jwt` あり。`index.ts` は経路の表（`ROUTES`。各項目の `match` は互いに排他）だけを持ち、1 回の POST は `ask.ts`（JWT → 枠の消費 → 本文 →
  提供元 → 台帳）、タスクごとの違いは `tasks/<task>.ts`（`tasks/all.ts` に 1 行）、上限と天井は `config.ts`、プロトコル 2 は `turn.ts`、呼び出し側の schema は `schema.ts`、添付は `media.ts`、
  提供元への唯一の扉と失敗の分類は `provider-call.ts`、提供元ごとの形は `providers/{openai,anthropic,gemini}.ts`、開発者のモデル一覧は `models.ts`、再受信の答えは `replay.ts`。
- **`atlas-embed`** … 能力検索の意味の半分（§2.1 の `searchFused`）。`verify_jwt` あり＋関数内でも呼び出し元を解決する。`op:"search"` は問い合わせを OpenAI の埋め込みにして
  `atlas_capability_similarity` で全能力との余弦類似度を返し、`op:"seed"` は説明文を埋めて `atlas_capability_seed` で保存する（鍵は受け取った本文から計算し直す）。未知のカタログへの
  検索は埋める前に `catalog_unknown`。問い合わせは保存しない。支出は `_shared/rate-limit.js` の共有バケツ（利用者ごと 1 分・利用者ごとの seed 1 時間・利用者ごとの 1 日の取り分＝全体の
  1 日 ÷ `READERS_PER_ADDRESS`・プロジェクト全体 1 日。全部 fail-closed）。秘密は `OPENAI_API_KEY`・任意で `ATLAS_EMBED_MODEL` / `ATLAS_EMBED_GLOBAL_PER_DAY` /
  `ATLAS_EMBED_PER_USER_PER_DAY`。403/404 は `model_unavailable`。
- **`refresh-news`** … ニュース取得＋AI地点解析＋書き込み（§4.1）。`--no-verify-jwt` で公開だが fail-closed（`REFRESH_SECRET` 未設定なら全拒否。秘密は `x-refresh-secret` ヘッダのみ・
  定数時間比較・POST のみ）。
- **`news-ingest`** … 出来事 (Event) 側の収集（§4.4）。Source Registry の全フィードを取得し、正規化・媒体の帰属・AI 地点解析（決定論エンジンはフォールバック）・Event への増分割り当て・
  日本語訳・計測・保持。fail-closed（`NEWS_INGEST_SECRET`・`x-news-ingest-secret` ヘッダのみ・定数時間比較・POST のみ）。`current_news` と `refresh-news` には触れない。
- **`delete-account`** … 呼出ユーザ自身のアカウントと全データをハード削除する（`verify_jwt` あり＋関数内でも検証・`confirm:"DELETE"` 必須）。所有テーブルを外部キーから発見し、
  1トランザクションで削除し、削除後に数え直してから Auth ユーザーを消す。どれか1つでも失敗したらアカウントは消さない。
- **`routing-relay`** … 交通情報つき provider（Mapbox Directions）への鍵付きパススルー（`MAPBOX_TOKEN` はサーバにだけ）。`?probe=1` は鍵が設定されているかだけを答え、
  `js/routing-providers.js` がそれを読むまで交通機能は提示されない。profile とクエリは allow-list、座標は範囲まで検証、呼び出し側の `access_token` は破棄する。この関数だけ
  `Cache-Control: no-store`（Mapbox Product Terms §2.10.1）。レート制限と支出上限を自前で持つ（Mapbox は支出のハードキャップを持たない）: プロセス内の per-IP バケツ（LRU で
  `RATE_MAX_KEYS`）と、有料呼び出しの直前の Postgres の共有バケツ（`relay_rate_buckets` ＋ `relay_take`・`_shared/rate-limit.js`）——IP 別 1 分・IP 別の 1 日の取り分（既定は全体の
  1 日 ÷ `READERS_PER_ADDRESS`＝300）・全体 1 分・全体 1 日。IP 別は fail-open で拒否は 429 `rate_limit`、全体は fail-closed（503 `limiter_unavailable`）で拒否は 429 `spend_ceiling`。
  上限は `ROUTING_RELAY_GLOBAL_PER_MIN` / `_PER_DAY` / `ROUTING_RELAY_PER_IP_PER_DAY`（既定は Mapbox の無料枠の内側）。呼び出し元の鍵は `_shared/rate-limit.js` の `callerKey`
  （全関数で 1 つ。`callerKey(req, verifiedUid)` は検証済みのアカウントなら `uid:<uuid>`、そうでなければ `x-forwarded-for` の先頭のアドレス。uid を渡すのは `atlas-embed`）。
- **`sv-cov`** … ストリートビュー・カバレッジ svv タイルの ACAO 付与プロキシ（秘密なし。厳格 allowlist——`mts0-3.google.com/vt?…lyrs=svv` ＋ 整数 x/y/z のみ・空タイルは透明 PNG）。
- **`alerts-relay`** … 各国気象機関の警報フィードの ACAO 付与＋要約（秘密なし）。allowlist は `feeds.meteoalarm.org`・`www.nmc.cn`・`severeweather.wmo.int`（`/f/wfs` と `/json/*.json`
  だけ）・`publicalert.pagasa.dost.gov.ph`。`?u=` の allowlist はホスト・path・クエリ鍵まで規則化（`UPSTREAMS` の表。js/world-packs.js が送る鍵だけ。未知の鍵・ポート・userinfo は 400）。
  CAP 索引が指すリンクは索引と同じ origin か明示リストだけを `fetchGuarded`（索引 8 MB・CAP 1 MB・並列 6）で読み、落とした本数は `offHost`。`?ma=` は並列 2。MeteoAlarm は要約する
  （`?ma=<国>,…&lang=…` で複数国をまとめ、地域ごとの行——最悪階級・災害名・`<polygon>`——に落とす。上限は1国 400 区域、`areaTotal` が実数）。フィリピンは `?ph=1`（Atom の索引から
  地域ごとの最新1件の CAP を州ごとの行にし、PAR の矩形と `expires` 切れは落とす）。上流の期限は 45 秒、キャッシュは 15 秒。カナダ ECCC は ACAO を返すので通さない。
- **`fetch-relay`** … ACAO を返さず専用の relay も持たない上流のための汎用の ACAO 付与中継（`--no-verify-jwt`・秘密なし）。転送するのは
  `supabase/functions/_shared/fetch-relay-policy.js` の規則が認める URL だけで、同じファイルを `js/proxy-fetch.js` も import する。規則は上流ごとにホスト名（完全一致）・パス（錨付き）・
  クエリ鍵の集合と値の形・Content-Type・バイト上限・期限・共有キャッシュの寿命を持つ。規則は 4 本——IMF DataMapper、「511」交通カメラ一覧 13 サイト、GEBCO 2020 水深（opentopodata）、
  CelesTrak の軌道要素。リダイレクトは同じ規則が認める先だけ（`redirectHosts`）、2xx 以外の本文は中継しない。ホスト名は `publicHostname()`（`_shared/relay-guard.js`）がアドレス直書き・
  単一ラベル・`localhost`／`.local`／`.internal`／`home.arpa` を拒む。記事規則（`ARTICLE_RULE`）だけはホスト一覧を持たず、`&as=article`／https・既定ポート・userinfo 無し・
  `publicHostname()`／A/AAAA がすべて公開アドレス（`resolvesPublic()`。解決器が無ければ拒否、各ホップも同じ）／`text/html`・3 MB 以下・`looksLikeArticle()`（ページと同じ述語）／
  `fetch-relay-article:ip`（1 人 10/分）で狭める（TTL 0 の DNS rebinding までは閉じられない）。規則は呼び手があって初めて書く（`tests/own-fetch-relay-checks.test.mjs`）。
- **`cable-geo`** … TeleGeography 海底ケーブル GeoJSON（2 URL 固定）の ACAO 付与中継。主系統ではない（線と点は `data/subcables.json` / `data/subcables-lp.json`。この関数は移行用の
  fallback。[`docs/MAP-LAYERS.md`](../MAP-LAYERS.md) §7.7）。
- **`news-relay`** … Google News RSS の ACAO 付与中継（`/rss/search` と `/rss/headlines/section/topic/<TOPIC>` の2エンドポイントだけ）。
- **`gdelt-relay`** … GDELT DOC 2.0 の ACAO 付与中継＋共有キャッシュ（`--no-verify-jwt`）。`api.gdeltproject.org/api/v2/doc/doc` の1エンドポイントだけで、パラメータは
  `js/atlas-sources.js` が組み立てる6個の allowlist。GDELT は大半を 429 で拒み 10–26 秒かかり、2026-09-17 の実測では通った分も中身が無い（`{}`）——だから `upstream_unavailable` は正しい
  答えである。答えは Supabase Storage の `gdelt` バケットにクエリ単位で 15 分（GDELT の `cache-control: public, max-age=900`）保持し、6時間までは古い答えを返しながら裏で更新する
  （`EdgeRuntime.waitUntil`）。キャッシュが空で上流にも拒まれたとき（cold）も読者に返したあと裏で温め直す。応答は上流が何と言ったかを `x-intmap-gdelt-upstream`（上流の status か
  `not-artlist` / `not-json` / `unreachable` ＋試行回数）で名乗り、cold の失敗の status は `upstreamState()` が決める（429・5xx・時間切れ・到達不能は 503、壊れた答えは 502。
  `Retry-After` は付けない）。`?peek=1` は上流に触れずに管の状態を答え（常に 200。`upstream-last.json` と `state`＝`ok` / `busy` / `fault` / `unobserved`・経過時間）、Atlas の自己診断
  （起動 25 秒後と 10 分ごと。`js/proxy-fetch.js` の `peekOwnRelay`）がこれで訊き、`down`・`busy`・`unobserved` を別に扱う。秘密は `GDELT_STORAGE_KEY`（platform 注入の
  `SUPABASE_SERVICE_ROLE_KEY` は Storage に AccessDenied になる）。
- **`aviation-feed`** … ライブ航空機の唯一の上流読み取り役（`--no-verify-jwt`・秘密なし）。provider（既定 adsb.lol・ODbL 1.0。`AVIATION_PROVIDER` で切替。OpenSky は
  `OPENSKY_AGREEMENT=1` のときだけ）をサーバー側で TTL ごとに1回だけ読み、全利用者へ同じ IMAV/1 バイナリを配る（上流の負荷を利用者数に比例させない）。ページ側の経路はこれ 1 本
  だけで、機体をこしらえない（在庫が 0 機のときの失敗は `js/aviation-live.js` の `onState` から `js/layer-state.js` の `dl-planes` へ。理由は `http`＋`status` / `network` / `parse`、
  基盤が起動できないときは `reason:'unsupported'`。`docs/AVIATION-ARCHITECTURE.md` §7–§8）。呼び出し側が選べるのはチャンネル（`world` / `view` / `meta`）だけ。正規化と wire format の
  正本は `js/aviation-model.js` / `js/aviation-codec.js`（`_shared/` の写しとの一致は `npm run check:static`）。共有スナップショットは Storage の `aviation` bucket で、同じ bucket の
  `sweep.json` が格子の cursor・タイルごとの最終探査時刻と空振り回数・訊いた空域の台帳・最後に上流へ触れた時刻を持つ。上流へ問い合わせる権利は1つの leaky bucket
  （`READ_RATE_PER_S`）が配る。
- **`ais-feed`** … ライブ船舶の唯一の上流読み取り役（`--no-verify-jwt`）。provider は2本を同時に読む: Digitraffic / Fintraffic（バルト海・フィンランド海域。キー不要・CC BY 4.0・CORS 開放）
  と aisstream.io（全球・`AISSTREAM_API_KEY` があるときだけ。キーはこの関数の中だけ）。aisstream は WebSocket なので 1 回の呼び出しの中で開いて数秒吸って閉じる（`waitUntil` の背景
  仕事は応答をまたいで生きない）。チャンネルは `world` / `view`（`?bbox=w,s,e,n`。西>東で日付変更線をまたぐ。ブラウザは見ている範囲に余白を足した箱を訊き、出たときだけ訊き直す）/
  `meta` だけ。温かい isolate も TTL（30 秒）を過ぎたら自分で更新し、同時の呼び出しは 1 つの更新を共有する（`INFLIGHT`）。socket は `arraybuffer` を要求し、フレームは文字列でもバイト列
  でも復号する（ブラウザの BYOK 経路も同じ）。資格情報は保存された値が内包する候補（`stored` / `dequoted` / `after-delimiter` / `url-tail` / `uuid` / `longest-alnum`）を上流に訊いて
  判定し、socket は同時に1本だけ（鍵1本あたり3接続）、受理された形は isolate が憶える。鍵は応答にもヘッダにも出ない（`?meta=1` は長さと文字クラスと候補の形だけ）。
  `x-intmap-coverage` は直近の更新で実際に答えた provider と隻数（`digitraffic:1103+aisstream:868`）。応答は `cov`＝保持している船の外接矩形も運び、ブラウザは 0 隻の答えで見ている海域が
  その外側なら理由を1度だけ言う。共有スナップショットは Storage の `ais` bucket（`world.json`・migration 20260831120000。provider 別の隻数 `p` を同梱）。空の集合は書かない。利用者が
  自分のキーを入れている場合はブラウザが直接 WebSocket を張る（`AGENTS.md` §3.1）。
- **`who-don`** … WHO Disease Outbreak News の症例数・死亡数だけを散文から読み出して貯める（§7.15 / `docs/MAP-LAYERS.md` §7.15）。フィード自体は中継しない（WHO は
  `Access-Control-Allow-Origin: *`）。GET は公開・鍵なし（`?ids=` で `who_don_extracts` の行。未抽出は `missing` に入り `rows` には出ない）。POST だけが取り込み段で fail-closed
  （`WHO_DON_SECRET`・`x-who-don-secret` ヘッダのみ・定数時間比較）。`WHO_DON_EXTRACT=off` で停止でき、壁時計の予算で打ち切る。数を正規表現で拾わず AI に訊き、
  `_shared/who-don-extract.js` の `parseExtract` が非負整数か・`deaths <= cases` か・`asOf` が実在する日付かを検証する。`source_hash` が再課金と無限再試行を止める。
- **`volcano-feed`** … 火山のブラウザが読めない2本のフィードの中継（`--no-verify-jwt`・秘密なし）。`?feed=weekly` は Smithsonian/USGS 週間火山活動報告（`volcano.si.edu` の RSS）、
  `?feed=ash` は国際 SIGMET（`aviationweather.gov`）の火山灰（`hazard:"VA"`）だけ。解析はサーバー側（GVP 火山番号で引ける行。`<guid>` の `#vn_282110`）で、正本は
  `_shared/volcano-parse.js`、`tests/hazard-volcano-checks.test.mjs` が捕獲した実応答で検査する。火山灰が0件は正常な答え（`read` が分ける）。キャッシュは灰 15 秒・週報 1 時間。残り4本
  （USGS HANS・気象庁・USGS ハザード域 ArcGIS・USGS 地震）は ACAO を返すので中継しない。[`docs/VOLCANO-INTELLIGENCE.md`](../VOLCANO-INTELLIGENCE.md)。
- **`radiation-feed`** … 実測γ線量率を各国の監視網から集めて1つの正規化された形で配る（`--no-verify-jwt`・秘密なし）。`?mode=latest`（全 provider の現在値）・
  `?mode=series&station=<id>`・`?mode=day&iso=`。単位は **nSv/h** へ揃え、知らない単位は例外。各レコードは上流が名乗った量（H\*(10) など）を保持する。provider は自分の性質を宣言する
  （`_shared/radiation-sources.js`）。1 本落ちても全体を落とさず、`sources[].read` が「読めなかった」と「読めて 0 件」を分ける。`stations` と `reference`（期間の平均）は別の配列。
  1 リクエストで答えられない上流は要求数の予算で外れ、`&provider=&chunk=` で到達できる。EURDEP は経路が無い（[`docs/RADIATION.md`](../RADIATION.md) §2）。
- **`quotes-relay`** … Companies タブの株価の ACAO 付与中継（`--no-verify-jwt`・秘密なし）。Yahoo Finance の `query1`/`query2.finance.yahoo.com` の `/v8/finance/spark` と
  `/v8/finance/chart/<記号>` だけ。allowlist は構造で見る（`URL` に解いてホスト・パス・パラメータを検査し、`symbols` / `range` / `interval` / `period1` / `period2` 以外は拒否、記号は形と
  本数で縛る）。上流へ渡るのはティッカー記号と期間だけ。公開 CORS プロキシを使わない理由は [`DECISIONS.md`](../../DECISIONS.md)。呼び出し側が読む 3 つの封筒（chart・spark・平坦形）の
  どれでもなければ通さない。キャッシュは 60 秒（`s-maxage`）。
- **`client-errors`** … 利用者のブラウザで起きたエラーの記録先（`--no-verify-jwt`・秘密なし）。`js/client-error-report.js` が `error` / `unhandledrejection` を拾い `navigator.sendBeacon` で
  POST する（本番のオリジンからだけ）。貯める先は `client_errors`（§6.1）で、欠陥 1 つにつき 1 行（fingerprint＝数字を畳んだメッセージ＋先頭フレームの SHA-256。サーバーが計算する）に
  回数を足す。読むのは `admin.html` の **Errors** タブ（admin の SELECT だけ）。記録の形の正本は `_shared/client-error-shape.js`（ブラウザとこの関数の両方が洗う）。残すのはメッセージ・
  スタック（URL はパスまで）・ページのパス・ビルド・ブラウザ名とメジャー版・回数と日時だけで、IP・利用者・クエリ文字列・入力文字は持たない。守りは POST 限定・本文上限・Origin
  （本番と 127.0.0.1 / localhost）・共有 token bucket 2 つ（呼び手ごと＝アドレスの HMAC／全体の 1 日）・表の行数上限。1 日の上限は `CLIENT_ERRORS_GLOBAL_PER_DAY`。保持は最後の発生から
  30 日（pg_cron `client-errors-purge` が `purge_client_errors` を呼ぶ）。[`docs/MONITORING.md`](../MONITORING.md) §2。
- **`usage-count`** … 匿名の利用統計の書き込み先（`--no-verify-jwt`・秘密なし）。`js/usage-counts.js` がページ読み込み 1 回ぶんの件数を束ね、隠れる・閉じるときに `sendBeacon` で POST
  する（本番のオリジンからだけ。Do Not Track / Global Privacy Control が有効なとき・設定「匿名の利用統計」がオフのときは送らず、オフにした瞬間に未送信分を捨てる。Atlas の
  `settings.usageCounts` も同じスイッチ）。貯める先は `usage_counts`（§6.1）で（UTC の日, metric, dimension）→ 件数の upsert だけ。数えてよいものの正本は
  `supabase/functions/usage-count/shape.js`（ブラウザと関数が同じファイルを import し、宣言に無い metric・規則に合わない dimension を捨てる）。日はサーバーの時計で決め、IP・User-Agent・
  アカウント・セッション・時刻は持たない。守りは POST 限定・本文上限 16 KiB・Origin・共有 token bucket 2 つ（閉じて失敗）・metric ごと 1 日の dimension 数の上限
  （`record_usage_counts`）。1 日の上限は `USAGE_COUNT_GLOBAL_PER_DAY`。保持は 400 日（pg_cron `usage-counts-purge`）。読むのは `admin.html` の **Usage** と **Growth** タブ（Growth は
  入口・流入元・utm・Atlas の回答の型で読み、utm 付きの発信リンクも作る。`usage_counts_summary` は SECURITY INVOKER）。[`docs/MONITORING.md`](../MONITORING.md) §2b。
- **`reader-reports`** … フィードバックとバグ報告の書き込み先（`--no-verify-jwt`・秘密なし）。`js/feedback.js` の 2 つのフォームと組織からの相談フォーム（`contact.html`・`js/org-page.js`、
  kind `inquiry`）が POST し、関数が service_role で `feedback` / `bug_reports` / `org_inquiries` に 1 行書く（相談の語彙・上限・返信先は `_shared/inquiry-shape.js`。返信先は本人が書いた
  アドレスで、`user_id` だけが検証済みのセッションから来る。見えない欄 `website_confirm` が埋まっていれば 400）。表へ直接は書けない（`anon`・`authenticated` の INSERT policy と grant は
  `20260930090000_anon_write_guard.sql` が閉じた）。守りは POST 限定・本文上限 64 KiB・Origin・共有 token bucket 2 つ（呼び手ごと＝検証済みのアカウント、無ければアドレスの HMAC／
  全体の 1 日。閉じて失敗）。誰からの報告かは関数が決める（Authorization が無いか公開キーなら匿名、利用者の access token なら `/auth/v1/user` に訊き `user_id` と `email` はそのアカウント
  のもの。拒まれた token は 401）。各列は `len_guard` 制約で 400、`created_at` は DB が書く。1 日の上限は `READER_REPORTS_GLOBAL_PER_DAY`。送信が失敗したバグ報告は端末に保存し
  クリップボードへ写す。

**`aviation-feed` と `ais-feed` の `?refresh=1` はプロジェクト全体で 1 つの枠から取る**（読み取り予算 `_shared/read-budget.js` は isolate ごとなので、枠は共有バケット 1 つ——`relay_take`・鍵 `'*'`、`_shared/rate-limit.js` の `forceGrant`）。aviation は
掃引 1 run 分を cron 間隔ごとに（`FORCE_BURST`＝ワークフローの `SLICES`＝10／`FORCE_PERIOD_S`＝cron 間隔 300 秒。正本はワークフロー）、ais は `WORLD_TTL_MS` ごとに 1 回。枠を超えた要求と
DB が答えないときは `refresh=1` が無かったのと同じ答え（200・キャッシュ済み・上流に触れない）を返し、`x-intmap-forced: capped` / `unavailable`（強制したときは `granted`）で理由を述べる。

**公開の関数はすべて、上流へ出る前に共有 bucket から 1 トークン取る。** `verify_jwt = false` の関数のうち秘密で守られた 2 本（`refresh-news`・`news-ingest`）と自前の 2 段の bucket を持つ
`client-errors`・`reader-reports`・`usage-count` 以外——`alerts-relay`・`ais-feed`・`aviation-feed`・`cable-geo`・`fetch-relay`・`gdelt-relay`・`news-relay`・`quotes-relay`・
`radiation-feed`・`sv-cov`・`volcano-feed`・`who-don`（公開 GET）——は `_shared/rate-limit.js` の `callerGate()` で `<関数名>:ip` の bucket（`public.relay_rate_buckets`）から取る。容量＝
その関数の読者 1 人のページが 1 分に送る最大数（各関数の `READER_PER_MIN`＝推定）×`READERS_PER_ADDRESS`（10）。DB が答えなければ通す。拒否は `429 rate_limit`＋`Retry-After`。
`<関数名>_PER_IP_PER_MIN` で deploy なしに動かせる。`routing-relay` は自前の fail-closed の全体上限を持つ。

**`_shared/relay-guard.js` を共有するのは19本**（`ai-proxy` / `ais-feed` / `alerts-relay` / `atlas-embed` / `aviation-feed` / `cable-geo` / `client-errors` / `fetch-relay` / `gdelt-relay` /
`news-ingest` / `news-relay` / `quotes-relay` / `radiation-feed` / `reader-reports` / `routing-relay` / `sv-cov` / `usage-count` / `volcano-feed` / `who-don`）。そのうち `ai-proxy`（JWT）・
`atlas-embed`（JWT）・`news-ingest`（`x-news-ingest-secret`）の 3 本が認証を持ち、`reader-reports` は任意（送られた token だけを検証する）、残り15本は無認証。`ai-proxy`・`client-errors`・
`reader-reports`・`usage-count` が共有するのは読み手だけ（`readCapped`＝要求本文を上限で切る、`fetchBounded`＝提供者への POST を本文の最後のバイトまで同じ期限と上限で読む）。
リダイレクトは手で辿る（`followRedirects`。各ホップを同じ https オリジンか `allowRedirect(next, from)` で検査し、上限は 3 ホップ `MAX_REDIRECTS`）。共有しているのは URL allowlist・GET 限定・
期限（`AbortSignal.timeout`）・バイト上限（`content-length` とストリーム読み出しの両方）・Content-Type 判定・外向きエラーはコード1語。公開レイヤーなのでログイン必須にはしない。

### 6.3 環境変数（Edge Functions の secrets）

- 自動注入: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- AI: `AI_PROVIDER`（anthropic|openai|gemini）, `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY`, `AI_MODEL`（任意）
- プロジェクト全体の 1 日の天井（任意・正の整数。既定は各関数の定数）: `AI_PROXY_GLOBAL_PER_DAY`, `NEWS_INGEST_GLOBAL_PER_DAY`, `REFRESH_NEWS_GLOBAL_PER_DAY`, `WHO_DON_GLOBAL_PER_DAY`,
  `ATLAS_EMBED_GLOBAL_PER_DAY`（§5「有料の提供元へは扉が 1 つだけ」）。`AI_PROXY_NEWCOMER_PER_DAY`（任意・7 日未満のアカウントの取り分。既定は全体の 1/3）
- refresh-news: `REFRESH_SECRET`（**必須**。未設定なら全リクエストを拒否）, `NEWS_AI=off`（任意・AI を止めて辞書だけにする kill-switch）
- news-ingest: `NEWS_INGEST_SECRET`（**必須**）, `NEWS_GEO_AI=off`（任意・AI 地点解析の kill-switch）, `NEWS_GEO_MODEL`（任意）, `NEWS_TRANSLATE=off` / `NEWS_TRANSLATE_MODEL`,
  `NEWS_EMBED=off` / `NEWS_EMBED_MODEL`
- atlas-embed: `OPENAI_API_KEY`（ai-proxy と同じ鍵）, `ATLAS_EMBED_MODEL`（任意・既定 `text-embedding-3-small`）, `ATLAS_EMBED_GLOBAL_PER_DAY`（任意）
- reader-reports: `READER_REPORTS_GLOBAL_PER_DAY`（任意。既定 500）
- usage-count: `USAGE_COUNT_GLOBAL_PER_DAY`（任意。既定 100,000）
- Gemini 経路のみ: `GEMINI_SEARCH_ENABLED`（既定 OFF）
