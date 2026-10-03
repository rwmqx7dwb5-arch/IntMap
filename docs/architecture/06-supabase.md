# IntMap — 現状仕様書 §6 Supabase（テーブル・Edge Functions・環境変数）

> **現状仕様書の §6。** 案内図は [`Architecture.md`](../../Architecture.md)（§ → ファイルの表）。**節番号は案内図と共有している**
> ——他の文書・コード・テストが書く「`Architecture.md` §6.x」は、このファイル（と案内図の表が同じ行に挙げる文書）の見出しを指す。
> 今どうなっているかだけを書く。変更履歴・ラウンド番号・PR 番号は書かない（`npm run check:docs` の `arch-rounds` がこのファイルも読む）。

## 6. Supabase（テーブル・Edge Functions・環境変数）

**Project ref:** `vpekfwdpurzejrrmacac`。公開 (anon/publishable) キーは `src/vendor.js` と
`admin.html` にあり、**公開前提**で保護は RLS が行う（§16・§17）。

### 6.1 テーブル

**表の一覧・列・関係・RLS 方針の正本は [`docs/DATABASE.md`](../DATABASE.md)**（pgTAP による
実証手順も同じファイル）。現在 **39 表**（`ai_turn_answers` / `usage_counts` / `profiles` / `profiles_public` / `current_news` / `geo_pins` / `favorites` /
`user_prefs` / `dashboard_cards` / `ai_usage` / `ai_turns` / `ai_gloss_usage` / `relay_rate_buckets` /
`atlas_capability_vectors` / `usage_counts`（匿名の利用統計） /
`community_*` 5 表 / `feedback` /
`bug_reports` / `donations` / Area Monitors の 5 表 / News Events の 8 表
＝`news_sources` / `news_source_feeds` / `news_articles` / `news_events` /
`news_event_articles` / `news_cluster_decisions` / `news_event_i18n` / `saved_news_events`
＋取り込みの計測 `news_ingest_runs` ＋運用者の監査証跡 `news_event_admin_actions`
＋ WHO Disease Outbreak News の症例数・死亡数 `who_don_extracts`
＋ 利用者のブラウザで起きたエラーの記録 `client_errors`）。

**DB の設計図は `supabase/migrations/` だけ**（全テーブル・制約・index・RLS・grants・トリガ・RPC）。
本番へ手で SQL を流さない。手順は [`docs/MIGRATIONS.md`](../MIGRATIONS.md)。
### 6.2 Edge Functions — **22本**（`_shared/` は関数ではない）

> ⚠ **22本すべてを `supabase/config.toml` に `[functions.*]` として宣言する。**
> ファイルのヘッダコメントに書いた deploy フラグは設定ではない。
> `supabase/functions/_shared/` は `newsgeo.js`・`relay-guard.js`・`rate-limit.js`・`volcano-parse.js` などを置く
> ライブラリ用ディレクトリで、import した関数の中に CLI がバンドルする。
> `[functions._shared]` は書かない。

- **`ai-proxy`** … アカウント制AI（§5）。`verify_jwt` あり。**仕事ごとのモジュールに分かれている**:
  `index.ts` は**経路の表（`ROUTES`）だけ**を持ち（足すときは 1 項目を追記。各項目の `match` は互いに排他）、
  1 回の POST は `ask.ts`（JWT → 枠の消費 → 本文 → 提供元 → 台帳）、**タスクごとの違いは
  `tasks/<task>.ts`**（`tasks/all.ts` に 1 行で登録）、上限と天井は `config.ts`、プロトコル 2 は `turn.ts`、
  呼び出し側の schema は `schema.ts`、添付は `media.ts`、提供元への唯一の扉と失敗の分類は
  `provider-call.ts`、提供元ごとの形は `providers/{openai,anthropic,gemini}.ts`、開発者のモデル一覧は
  `models.ts`、再受信の答えは `replay.ts`。どれも `index.ts` から辿れるものだけが配備される。
- **`atlas-embed`** … Atlas の能力検索の**意味の半分**（§2.1 の `searchFused`）。`verify_jwt` あり＋関数内でも
  呼び出し元を解決する。`op:"search"` は問い合わせを OpenAI の埋め込みにして `atlas_capability_similarity` で
  全能力との余弦類似度を返し、`op:"seed"` は能力の説明文を埋めて `atlas_capability_seed` で 1 文で保存する
  （鍵のカタログ SHA-256 は受け取った本文から計算し直す）。未知のカタログへの検索は**問い合わせを埋める前に**
  `catalog_unknown` を返す。問い合わせは保存しない。支出は `_shared/rate-limit.js` の共有バケツ
  （利用者ごと 1 分・利用者ごとの seed 1 時間・**利用者ごとの 1 日の取り分**・プロジェクト全体 1 日。
  全部 fail-closed）。取り分は全体の 1 日 ÷ `READERS_PER_ADDRESS`——それが無い間は 1 つの口座が
  seed だけで全体の 1 日を約 13 時間で使い切れた（全員の能力検索が綴りだけに落ちる）。
  秘密は `OPENAI_API_KEY`（ai-proxy と同じ）・任意で `ATLAS_EMBED_MODEL` / `ATLAS_EMBED_GLOBAL_PER_DAY` /
  `ATLAS_EMBED_PER_USER_PER_DAY`。
  ⚠ 403/404 は `model_unavailable` と述べる——この鍵が埋め込みモデルに届かなかった実測が `news-ingest` にある。
- **`refresh-news`** … ニュース取得＋AI地点解析＋書き込み（§4.1）。`--no-verify-jwt` で公開だが
  **fail-closed**：`REFRESH_SECRET` 未設定なら全リクエストを拒否する。秘密は `x-refresh-secret`
  **ヘッダのみ**（クエリ文字列不可）・**定数時間比較**・POST のみ。
- **`news-ingest`** … 出来事 (Event) 側の収集（§4.4）。Source Registry の全フィードを取得し、
  正規化・媒体の帰属・**AI 地点解析（決定論エンジンはフォールバック）**・Event への増分割り当て・
  日本語訳・計測・保持を行う。
  `--no-verify-jwt` で公開だが **fail-closed**：`NEWS_INGEST_SECRET` 未設定なら全リクエストを拒否する。
  秘密は `x-news-ingest-secret` **ヘッダのみ**・**定数時間比較**・POST のみ。
  ⚠ `current_news` と `refresh-news` には触れない（別の表に書く）。
- **`monitor-run`** … Area Monitors の定期実行（`--no-verify-jwt` ＋ 自前の fail-closed 認証、
  `MONITOR_SECRET`）。利用者の「今すぐ実行」（JWT）は、AI の段に達したとき `ai-proxy` と同じ
  AI 枠を `_shared/ai-ledger.js` 経由で消費する（上の「1 つの台帳」）。
- **`delete-account`** … 呼出ユーザ自身のアカウントと全データを**ハード削除**する
  （`verify_jwt` あり＋関数内でも検証・`confirm:"DELETE"` 必須）。所有テーブルを**外部キーから発見**し、
  **1トランザクション**で削除し、**削除後に数え直して**から Auth ユーザーを消す。
  ⚠ **どれか1つでも失敗したらアカウントは消さない**（fail-closed）。
- **`routing-relay`** … 交通情報つきルーティング provider（Mapbox Directions）への**鍵付き
  パススルー**。鍵 `MAPBOX_TOKEN` はサーバにだけ置き、ブラウザには一度も出ない。
  `?probe=1` は**鍵が設定されているかだけ**を真偽で答え、フロントの能力表（`js/routing-providers.js`）が
  それを読むまで交通機能は一切提示されない。profile とクエリは allow-list、座標は範囲まで検証、
  呼び出し側の `access_token` は必ず破棄する。
  ⚠ **この関数だけ `Cache-Control: no-store` を返す**（他の relay は `s-maxage` を付ける）。
  Mapbox Product Terms §2.10.1 が Navigation API の結果の cache / store を禁じているため。
  ⚠ **レート制限と支出上限を自前で持つ唯一の relay**。Mapbox は支出のハードキャップを持たないので、
  ここが唯一の天井になる。2 段: プロセス内の per-IP バケツ（第一段。LRU で `RATE_MAX_KEYS` を守る）と、
  有料呼び出しの直前に訊く **Postgres の共有バケツ**（`relay_rate_buckets` ＋ `relay_take`・
  `_shared/rate-limit.js`）——IP 別 1 分・**IP 別の 1 日の取り分**（既定は全体の 1 日 ÷
  `READERS_PER_ADDRESS`＝300。1 つのアドレスが全体の 1 日を使い切って他の全員を止められないように）・
  プロジェクト全体 1 分・プロジェクト全体 1 日。IP 別の 2 つは fail-open で拒否は 429 `rate_limit`、全体の 2 つは
  fail-closed（DB が答えなければ有料呼び出しをしない・503 `limiter_unavailable`）、拒否は 429
  `spend_ceiling`。上限は `ROUTING_RELAY_GLOBAL_PER_MIN` / `_PER_DAY` / `ROUTING_RELAY_PER_IP_PER_DAY` で意図して動かす（既定は
  Mapbox の無料枠の内側）。呼び出し元は `_shared/rate-limit.js` の `callerKey`（全関数で 1 つ）。
  `callerKey(req, verifiedUid)` は、関数が Auth サーバーで**検証済みの**アカウントを渡したときは
  `uid:<uuid>`、そうでなければ `x-forwarded-for` の先頭のアドレスを鍵にする（検証していない JWT の
  `sub` は渡さない——呼び手が選べる文字列は要求ごとの新しいバケツになる）。現在 uid を渡すのは
  `atlas-embed` で、無認証の relay（`verify_jwt = false`）はアドレスのまま。
- **`sv-cov`** … ストリートビュー・カバレッジ svv タイルの **ACAO 付与プロキシ**（秘密なし）。
  **厳格 allowlist**（`mts0-3.google.com/vt?…lyrs=svv` ＋ 整数 x/y/z のみ・空タイルは透明 PNG）
  ＝オープンプロキシではない。
- **`alerts-relay`** … 各国気象機関の警報フィードの **ACAO 付与＋要約**（秘密なし）。
  allowlist は `feeds.meteoalarm.org`（欧州の MeteoAlarm）・`www.nmc.cn`（中国気象局）・
  `severeweather.wmo.int`（WMO の CAP 登録簿。`/f/wfs` と `/json/*.json` だけ）・
  `publicalert.pagasa.dost.gov.ph`（フィリピン）。
  ⚠ **`?u=` の allowlist はホスト・path だけでなくクエリ鍵まで規則化**（`UPSTREAMS` の表: ホストごとの
  scheme・path・許す鍵と値の形。js/world-packs.js が実際に送る鍵だけ。未知の鍵・ポート・userinfo は 400）。
  CAP 索引が指すリンクは**索引と同じ origin か明示リストの中**だけを `fetchGuarded`（索引 8 MB・CAP 1 MB・
  並列 6）で読み、落とした本数は `offHost` として要約に出る。`?ma=` は並列 2（最悪 48 MB。以前は 6 並列で
  144 MB）。
  ⚠ **MeteoAlarm は要約する**——1国の CAP JSON が 10 MB 規模（多言語の重複）なので、
  `?ma=<国>,…&lang=…` で複数国をまとめて取り、**地域ごとの行**（最悪階級・災害名の一覧・
  CAP が持っていれば `<polygon>`）に落として返す。要約は射影であって編集ではない。
  上限は1国 400 区域で、`areaTotal` が実数を述べる。
  ⚠ **フィリピンは `?ph=1`**。Atom の索引から地域ごとの最新1件を採り、その CAP を読んで州ごとの行にする。
  「フィリピン責任領域 (PAR)」の矩形と `expires` を過ぎた速報は落とす。
  ⚠ 上流の期限は 45 秒（上流の悪い日より短い制限時間は生きたフィードを落とす）。キャッシュは 15 秒。
  ⚠ カナダ ECCC は ACAO を返すので **relay を通さない**（要らない relay は落ちうるものを1つ増やすだけ）。
- **`fetch-relay`** … ACAO を返さず専用の relay も持たない上流のための**汎用の ACAO 付与中継**（`--no-verify-jwt`・秘密なし）。
  転送するのは `supabase/functions/_shared/fetch-relay-policy.js` の規則が認める URL だけで、**同じファイルを
  `js/proxy-fetch.js` も import する**（ページと関数が「何を中継できるか」で食い違わない）。規則は上流ごとに
  ホスト名（完全一致）・パス（錨付き）・クエリ鍵の完全な集合と値の形・答えの Content-Type・バイト上限・期限・
  共有キャッシュの寿命を持つ。いまの規則は 4 本——IMF DataMapper（比較チャート）、「511」交通カメラ一覧 13 サイト、
  GEBCO 2020 水深（opentopodata）、CelesTrak の軌道要素（ブラウザが直接届かないときの第 2 経路）。
  ⚠ **リダイレクトは同じ規則が認める先だけ**辿る（`redirectHosts` はホップとしてだけ認める名前）。上流の 2xx 以外の
  本文は中継しない。ホスト名は `publicHostname()`（`_shared/relay-guard.js`）がアドレス直書き・単一ラベル・
  `localhost`／`.local`／`.internal`／`home.arpa` を拒む。
  ⚠ **記事規則（`ARTICLE_RULE`）だけはホスト一覧を持たない**——記事リーダーの第 2 段は任意の発行元を読むため。
  代わりに狭める: 呼び手が `as:'html'` のときだけページが `&as=article` で頼む／https・既定ポート・userinfo 無し・
  `publicHostname()`／**名前を引き、A/AAAA がすべて公開アドレスのときだけ**（`resolvesPublic()`。解決器が無ければ
  拒否＝fail-closed。リダイレクトの各ホップも同じ）／`text/html`・3 MB 以下・`looksLikeArticle()`（ページと関数が
  同じ 1 つの述語を import）を満たすものだけ返す／`fetch-relay-article:ip` の小さい bucket（1 人 10/分）。
  ⚠ 名前を引いた答えと接続が使う答えが違う（TTL 0 の DNS rebinding）ことまでは閉じられない。
  ⚠ **規則は呼び手があって初めて書く**——`tests/own-fetch-relay-checks.test.mjs` が呼び手の URL をソースから発見し、
  relay に頼る呼び手が一覧に無い上流を名指せば落ち、呼び手の無い規則のホストも落ちる。
- **`cable-geo`** … TeleGeography 海底ケーブル GeoJSON（2 URL 固定 allowlist）の ACAO 付与中継。
  ⚠ 海底ケーブル層の**主系統ではない**。線と点は自オリジンの `data/subcables.json` /
  `data/subcables-lp.json` から読み、この関数は**移行用の fallback** として残っている
  （取得順は [`docs/MAP-LAYERS.md`](../MAP-LAYERS.md) §7.7）。
- **`news-relay`** … Google News RSS の ACAO 付与中継。`news.google.com` の `/rss/search` と
  `/rss/headlines/section/topic/<TOPIC>` の**2エンドポイントだけ**。
- **`gdelt-relay`** … GDELT DOC 2.0 の ACAO 付与中継＋**共有キャッシュ**（`--no-verify-jwt`）。
  中継するのは `api.gdeltproject.org/api/v2/doc/doc` の1エンドポイントだけで、パラメータも
  `js/atlas-sources.js` が組み立てる6個の allowlist。⚠ **CORS を通すためだけの関数ではない**——
  実測（2026-08-25・15標本）で GDELT は**約8割を 429 で拒み、成功・拒否のどちらも 10.7–26.0 秒**
  かかる。⚠⚠⚠ **2026-09-17 の実測では、通った分も中身が無い**——`{}`（2 バイト）が、
  **5 通りのクエリ形と 2 つの mode のすべて**（`sort=hybridrel` / `HybridRel` / `DateDesc`、
  `query=Ukraine` / `query=climate`、`mode=artlist` / `timelinevol`）で返った。⇒ **この上流は
  今日 0 件しか届けられない。** IntMap 側の組み立ての誤りではなく上流の状態であり、
  だからこの関数の `upstream_unavailable` は**正しい答え**である。答えは Supabase Storage の `gdelt` バケットに**クエリ単位で 15 分**（GDELT 自身の
  `cache-control: public, max-age=900`）保持し、期限切れでも6時間までは**古い答えを返しながら
  裏で更新する**（`EdgeRuntime.waitUntil`）。⚠ **上流への要求は読者数ではなく時間に比例する**
  ので、直に叩いていた頃より要求は**減る**。キャッシュがある場合の実測は **0.6 秒**。
  ⚠ **キャッシュが空で上流にも拒まれたとき（cold）も、読者に 502 を返したあと裏で温め直す。**
  そうでない間、キャッシュが空という唯一の場合が**キャッシュに何も書かれない唯一の場合**でも
  あった（実測 2026-09-17・本番へ連続 8 回すべて 502 / `cold`）。温め直しが割に合うのは
  **最初の 1 回が落ちる側だから**——同日実測で、429 を引いた要求そのものは 6 回中 0 回しか
  通らず、その**直後の再試行は 6 回中 3 回**通った。成功には 14.9–19.6 秒かかるので、読者へ
  与えられた 28 秒の時計の中では再試行は終わらない＝返答の後ろでしか成立しない。増幅は
  自己限定的で、1 回温まれば 15 分 fresh・6 時間 stale になり cold が消える。
  ⚠ **応答は上流が何と言ったかを名乗る**（`x-intmap-gdelt-upstream`＝上流の status か
  `not-artlist` / `not-json` / `unreachable` ＋ 試行回数）。これが無い間、「拒まれた」
  「artlist でないものが返った」「到達できなかった」は外から**同じ 1 つの出来事**に見えていた。
  ⚠ **cold の失敗の status はその読みから決まる**（`upstreamState()`）：上流の 429・5xx・時間切れ・
  到達不能は「いまは無理」なので **503**、artlist でない 200 など**壊れた答えは 502**。GDELT の 429 は
  `Retry-After` を持たない（実測）ので付けない。
  ⚠ **`?peek=1` は上流に 1 回も触れずに管の状態を答える**（常に 200）。上流を読んだ結果はどれも
  `upstream-last.json` に 1 つ書き残され、peek はそれと `state`（`ok` / `busy` / `fault` / `unobserved`）・
  経過時間を返す。Atlas の自己診断（起動 25 秒後と 10 分ごと）は GDELT をこれで訊く
  （`js/proxy-fetch.js` の `peekOwnRelay`）。以前は訪問者ごとに実際の GDELT 検索を梯子ごと流し、
  cold では 1 回の起動が在線読み・最大 7 回の温め直し・読者 IP からの直接読みを GDELT に送り、
  502 と中断が全訪問者のコンソールに出ていた。自己診断は「中継が死んでいる」（`down`）と
  「上流がいま拒んでいる」（`busy`）と「まだ何も観測していない」（`unobserved`）を別に扱う。
  ⚠ 秘密は `GDELT_STORAGE_KEY`（Storage 書き込み用。platform 注入の
  `SUPABASE_SERVICE_ROLE_KEY` は本プロジェクトでは Storage に AccessDenied になる）。
- **`aviation-feed`** … ライブ航空機の**唯一の上流読み取り役**（`--no-verify-jwt`・秘密なし）。
  provider（既定 adsb.lol・ODbL 1.0。`AVIATION_PROVIDER` で切替。OpenSky は事前の書面合意が要るので
  `OPENSKY_AGREEMENT=1` のときだけ）を**サーバー側で TTL ごとに1回だけ**読み、全利用者へ同じ
  IMAV/1 バイナリを配る。⚠ **上流の負荷が利用者数に比例する構造をやめるための関数である**——
  以前はブラウザが1掃引あたり最大 128 本の点問い合わせを自分で出していた。
  ⚠ **(remove-synthetic-planes) ページ側の経路はこれ 1 本だけ。** その掃引（`api.airplanes.live`、`?aviation=v1` /
  localStorage `intmap_aviation_v2=0` で残っていた旧経路）と、掃引が全滅すると乱数で約 270 機を実データとして
  描いていた `genSyntheticPlanes()`、旧経路だけの MapLibre 描画（`lyr-planes` / `lyr-planes-3d`）は撤去済み。
  取得に失敗しても機体はこしらえない——在庫が 0 機のときの失敗は `js/aviation-live.js` の `onState` から
  `js/layer-state.js` の `dl-planes` へ（理由は worker が付ける `http`＋`status` / `network` / `parse`）、
  基盤が起動できないときは行の要求が `reason:'unsupported'` で reject する。詳細は `docs/AVIATION-ARCHITECTURE.md` §7–§8。
  呼び出し側が選べるのは**チャンネル（`world` / `view` / `meta`）だけ**で、URL は渡せない
  （相手先 URL を allowlist で見る4本の中継とはそこが違う）。正規化と wire format の正本は
  `js/aviation-model.js` / `js/aviation-codec.js` で、`_shared/` の写しとの一致は `npm run check:static`
  が検査する。冷えた isolate でも即答できるよう、共有スナップショットは Storage の `aviation` bucket に置く。
  ⚠ **isolate を越えて残るのは「機体」だけではない。** 同じ bucket の `sweep.json` が、格子の
  **cursor**・タイルごとの**最終探査時刻と空振り回数**・訊いた空域の台帳・**最後に上流へ触れた時刻**を持つ。
  これが無いと、冷えた isolate は毎回 cursor 0 から歩き直し、`x-intmap-coverage` は `lattice 0/980` から
  動けない。**上流へ問い合わせる権利は1つの leaky bucket**（`READ_RATE_PER_S`）が配り、視野・掃引の
  どちらもそこから引く——チャンネルごとの間隔ではない。

- **`ais-feed`** … ライブ**船舶**の**唯一の上流読み取り役**（`--no-verify-jwt`）。
  provider は2本を**同時に**読む: **Digitraffic / Fintraffic**（バルト海・フィンランド海域。
  **キーも登録も不要**・CC BY 4.0・CORS 開放）と、**aisstream.io**（全球・`AISSTREAM_API_KEY` が
  あるときだけ）。⚠ **キーはこの関数の中にしか無く、ブラウザには渡らない。**
  ⚠ **aisstream は WebSocket なので、1回の呼び出しの中で開いて数秒吸って閉じる**——
  `EdgeRuntime.waitUntil` の背景仕事は応答をまたいで生きない（実測）ので、
  「裏で開きっぱなしにする」設計は単発の試験では正しく見えて本番では1バイトも集めない。
  呼び出し側が選べるのは**チャンネル（`world` / `view`＝`?bbox=w,s,e,n` / `meta`）だけ**で、URL は渡せない。
  `view` は世界集合をその箱で切って返す（西>東で日付変更線をまたぐ）——ブラウザは**見ている範囲に余白を
  足した箱**を訊き、視野がその箱を出たときだけ訊き直す（全球の集合は 1 隻あたり約 65 バイト（gzip 後）
  なので、視野に関係なく全部を 30 秒ごとに運ぶ設計は携帯で成り立たない）。
  ⚠ **温かい isolate も TTL（30 秒）を過ぎたら自分で更新する**——その瞬間の呼び出し元が 1 回分の
  更新（数秒）を待ち、同時に来た呼び出しは 1 つの更新を共有する（`INFLIGHT`）。応答の後に走る仕事は
  無いので「古いものを返してから裏で更新」は選べない。
  ⚠ **aisstream のフレームはバイト列で届く。** socket の既定 `binaryType` は `blob` で、そのまま
  文字列にすると `"[object Blob]"` になり `JSON.parse` が投げる——**届いた船を1隻残らず捨てる**。
  だから socket は `arraybuffer` を要求し、フレームは文字列でもバイト列でも読める形で復号する
  （ブラウザの BYOK 経路も同じ。実測: 15 秒で 1,224 フレームを受け取り、保持した船は 0 だった）。
  ⚠ **資格情報は、保存されている値そのものとは限らない。** シェルやダッシュボードを通った秘密は
  引用符・`NAME=value` の行・貼り元の URL・前置きのラベルを連れてくる。関数は**その値が実際に
  内包している候補**（`stored` / `dequoted` / `after-delimiter` / `url-tail` / `uuid` /
  `longest-alnum`）を**上流に訊いて**判定する——鍵を推測するのではなく、**どれを受け付けるかを
  aisstream に決めさせる**。⚠ **socket は同時に1本だけ**（鍵1本あたり3接続で、4本目は
  **拒否と見分けのつかない無言**で落とされる）。受理された形は isolate が憶えるので、
  きれいな秘密は最初の候補で当たり、他の候補は一度も試されない。
  ⚠ **鍵は応答にもヘッダにも出ない。** 出るのは `?meta=1` の**長さと文字クラスと候補の形**だけで、
  同じ長さの別の鍵は同じ報告になる（値は復元できない）。
  `x-intmap-coverage` は**設定されている provider ではなく、直近の更新で実際に答えた provider と隻数**
  （`digitraffic:1103+aisstream:868` のように）。答えなかった provider は 0 なので名乗らない。
  ⚠ **応答は `cov`＝いま保持している船の外接矩形も運ぶ**（保持している船から導く。地名も定数も持たない）。
  ブラウザは 0 隻の答えを受け取ったとき、見ている海域がその外側なら**理由を1度だけ言う**——
  「船がいない」と「ここは見えていない」は地図の上では同じ絵になるから。**外接矩形は過大にしか
  外さない**ので、実際に見えている海を「範囲外」と告げることはない。
  共有スナップショットは Storage の `ais` bucket（`world.json`・migration 20260831120000。
  provider 別の隻数 `p` を同梱するので、hydrate しただけの isolate も被覆を正直に言える）。
  ⚠ **利用者が自分のキーを設定に入れている場合は、従来どおりブラウザが直接 WebSocket を張る**——
  そちらのほうが新しいので、既存の挙動は取り上げていない（`AGENTS.md` §3.1）。
  ⚠ **空の集合は共有スナップショットに書かない**（全利用者の海が同時に消え、上流障害と同じ顔をする）。

- **`who-don`** … WHO Disease Outbreak News の**症例数・死亡数だけ**を散文から読み出して貯める
  （§7.15 / `docs/MAP-LAYERS.md` §7.15）。⚠ **フィード自体は中継しない**——WHO は
  `Access-Control-Allow-Origin: *` を返すのでブラウザが直接読める（実測）。この関数がある理由は
  ただ1つ、**WHO が構造化して持っていない唯一の項目**が `Overview` の散文の中にしか無く、
  それを読む provider の鍵はサーバーにしか置けないから。
  **GET は公開・鍵なし**（`?ids=` で `who_don_extracts` の行を返すだけ。⚠ **未抽出は `missing` に入り
  `rows` には出ない**——0 と「まだ読んでいない」を混ぜない）。
  **POST だけが取り込み段**で、`--no-verify-jwt` ＋ **fail-closed**：`WHO_DON_SECRET` 未設定なら
  全 POST を拒否する。秘密は `x-who-don-secret` **ヘッダのみ**・**定数時間比較**。
  `WHO_DON_EXTRACT=off` で停止でき、壁時計の予算で打ち切って残りを次の run に回す。
  ⚠ **数を正規表現で拾わない**——同じ文に「54 to 60 health zones」「104 contacts」
  「1314 patients have recovered」が必ず混ざる。判断は AI に訊き、`_shared/who-don-extract.js` の
  `parseExtract` が**非負整数か・`deaths <= cases` か・`asOf` が実在する日付か**を検証して、
  1つでも破れば捨てる。`source_hash`（モデルへ実際に送った文字列のハッシュ）が、
  同じ散文への再課金と無限再試行の両方を止める。
- **`volcano-feed`** … 火山の**ブラウザが読めない2本のフィード**の中継（`--no-verify-jwt`・秘密なし）。
  `?feed=weekly` は Smithsonian/USGS 週間火山活動報告（`volcano.si.edu` の RSS）、
  `?feed=ash` は国際 SIGMET（`aviationweather.gov`）のうち**火山灰（`hazard:"VA"`）だけ**。
  ⚠ **上流の解析はサーバー側で行う**——ブラウザが受け取るのは **GVP 火山番号で引ける行**であって
  XML ではない（RSS の `<guid>` が `#vn_282110` の形で番号を持つ。名前で突き合わせない）。
  解析の正本は `_shared/volcano-parse.js` で、`tests/hazard-volcano-checks.test.mjs` が**捕獲した実応答**で検査する。
  ⚠ **火山灰が0件は正常な答えであって失敗ではない**——応答の `read`（読んだ SIGMET の総数）が
  「何も出ていない」と「読めなかった」を分ける。キャッシュは灰 15 秒・週報 1 時間。
  ⚠ **残り4本の火山データ源（USGS HANS・気象庁・USGS ハザード域 ArcGIS・USGS 地震）は
  ACAO を返すので中継しない**（要らない relay は落ちうるものを1つ増やすだけ）。
  詳細は [`docs/VOLCANO-INTELLIGENCE.md`](../VOLCANO-INTELLIGENCE.md)。

- **`radiation-feed`** … **実測γ線量率**を各国の監視網から集めて**1つの正規化された形**で配る
  （`--no-verify-jwt`・秘密なし）。`?mode=latest` は全 provider を合流した現在値、
  `?mode=series&station=<id>` はその局の時系列、`?mode=day&iso=` は過去日。
  ⚠ **単位と量の正規化はここで 1 回だけ行う**——上流は µSv/h・nSv/h・µGy/h をばらばらに使うので、
  ブラウザに出典ごとの分岐を持ち込ませないために **nSv/h** へ揃える。**知らない単位は例外**にして
  黙って 0 にしない。各レコードは**上流が名乗った量**（H\*(10) など）を保持する。
  ⚠ **provider は自分の性質を宣言し、コードは宣言に従う**（`_shared/radiation-sources.js` が正本。
  `switch(country)` を書かない）。1 本落ちても全体を落とさず、`sources[].read` が
  **「読めなかった」と「読めて 0 件だった」を分ける**。
  ⚠ **`stations` と `reference` は別の配列**——後者は「期間の平均」であって現在値ではない。
  ⚠ **1 リクエストで答えられない上流は要求数の予算で外れ**（名前で外さない）、`&provider=&chunk=`
  で到達できる。⚠ **EURDEP は経路が無い**（技術・ライセンスの両方。
  [`docs/RADIATION.md`](../RADIATION.md) §2 が正本）。

- **`quotes-relay`** … Companies タブの**株価**の ACAO 付与中継（`--no-verify-jwt`・秘密なし）。
  中継するのは Yahoo Finance の鍵不要エンドポイント 2 つだけ——`query1`/`query2.finance.yahoo.com`
  の `/v8/finance/spark` と `/v8/finance/chart/<記号>`。⚠ **allowlist は接頭辞一致ではなく
  構造で見る**（`URL` に解いてホスト・パス・パラメータを 1 つずつ検査し、
  `symbols` / `range` / `interval` / `period1` / `period2` **以外は 1 つでもあれば拒否**、
  記号は形と本数で縛る）——`startsWith` で見る allowlist は、細工した文字列に別の上流を
  通させる。**上流へ渡るのは結局ティッカー記号と期間だけで、読者を識別するものは 1 つも無い。**
  ⚠ **CORS を通すためだけの関数ではない。** Yahoo は 200 を返すが **ACAO を返さない**ので
  ブラウザからは構造的に読めず、公開 CORS プロキシを使わない理由は
  [`DECISIONS.md`](../../DECISIONS.md) にある。この関数の後ろに第三者の段は無い。
  ⚠ **上流の「拒否」を答えとして返さない**——呼び出し側が実際に読む 3 つの封筒
  （chart・spark・ティッカーを直接キーにした平坦形）のどれでもなければ通さない。
  キャッシュは 60 秒（`s-maxage`）で、同時に開いた読者の集中を 1 回の上流要求に畳む。

- **`client-errors`** … **利用者のブラウザで起きたエラーの記録先**（`--no-verify-jwt`・秘密なし）。
  `js/client-error-report.js` が `error` / `unhandledrejection` を拾い、`navigator.sendBeacon` で POST する
  （本番のオリジンからだけ。ローカル preview は送らない）。貯める先は `client_errors`（§6.1）で、
  **欠陥 1 つにつき 1 行**（fingerprint＝メッセージの数字を畳んだもの＋先頭フレーム の SHA-256）に回数を足す。
  読むのは `admin.html` の **Errors** タブ（admin の SELECT だけ。編集はできない）。
  ⚠ **何を記録し何を記録しないかの正本は `_shared/client-error-shape.js`**——ブラウザが送る前と、
  この関数が貯める前の**両方**で同じ関数が洗う（サーバーはクライアントの洗浄を信用しない）。
  残すのはメッセージ・スタック（URL はパスまで）・ページのパス・ビルド・ブラウザ名とメジャー版・回数と日時だけで、
  **IP・利用者・クエリ文字列・入力文字は持たない**（表に列が無い）。fingerprint は**サーバーが計算する**。
  守りは POST 限定・本文上限・Origin（本番と 127.0.0.1 / localhost）・共有 token bucket 2 つ
  （呼び手ごと＝**アドレスではなくその HMAC** を鍵にする／プロジェクト全体の 1 日）・表の行数上限。
  1 日の上限は `CLIENT_ERRORS_GLOBAL_PER_DAY` で意図して上げる。保持は**最後の発生から 30 日**
  （pg_cron `client-errors-purge` が毎日 `purge_client_errors` を呼ぶ）。
  詳細は [`docs/MONITORING.md`](../MONITORING.md) §2。

- **`usage-count`** … **匿名の利用統計の書き込み先**（`--no-verify-jwt`・秘密なし）。`js/usage-counts.js` が
  ページ読み込み 1 回ぶんの件数を束ね、ページが隠れる・閉じるときに `navigator.sendBeacon` で POST する（本番のオリジンから
  だけ。ブラウザの Do Not Track / Global Privacy Control が有効なとき、設定「匿名の利用統計」がオフのときは何も送らない。
  オフにした瞬間に未送信分を捨てる。Atlas の `settings.usageCounts` も同じスイッチ）。貯める先は `usage_counts`（§6.1）で、
  **（UTC の日, metric, dimension）→ 件数**の upsert だけ。⚠ **何を数えてよいかの正本は `supabase/functions/usage-count/shape.js`**
  ——ブラウザとこの関数が同じファイルを import し、関数は宣言に無い metric・規則に合わない dimension を**捨てる**
  （各行の 3 つの位置以外は読まない）。日はサーバーの時計で決め、**IP・User-Agent・アカウント・セッション・時刻は読まず
  持たない**（表に列が無い）。守りは POST 限定・本文上限 16 KiB・Origin（`client-errors` と同じ許可）・共有 token bucket 2 つ
  （呼び手ごと＝アドレスの HMAC／プロジェクト全体の 1 日。どちらも閉じて失敗）・**metric ごと 1 日の dimension 数の上限**
  （`record_usage_counts` の中で、新しい値は拒み既知の値は数える）。1 日の上限は `USAGE_COUNT_GLOBAL_PER_DAY`。
  保持は **400 日**（pg_cron `usage-counts-purge`）。読むのは `admin.html` の **Usage** と **Growth** タブ（Growth は同じ集計をマーケティングの問い——入口・流入元・utm・Atlas の回答の型——で読み、utm 付きの発信リンクも作る。`usage_counts_summary` は
  SECURITY INVOKER なので admin の SELECT policy がそのまま効く）。詳細は [`docs/MONITORING.md`](../MONITORING.md) §2b。

- **`reader-reports`** … **フィードバックとバグ報告の書き込み先**（`--no-verify-jwt`・秘密なし）。`js/feedback.js` の
  2 つのフォームがここへ POST し、関数が service_role で `feedback` / `bug_reports` に 1 行書く。**表へ直接は書けない**
  （`anon`・`authenticated` の INSERT policy と grant は `20260930090000_anon_write_guard.sql` が閉じた——
  以前は公開キーで PostgREST から行数の制限なく書けた）。守りは `client-errors` と同じ形: POST 限定・本文上限
  64 KiB・Origin（本番と 127.0.0.1 / localhost）・共有 token bucket 2 つ（呼び手ごと＝**検証済みのアカウント**、
  無ければ**アドレスの HMAC**／プロジェクト全体の 1 日）で、どちらも**閉じて失敗**する。**誰からの報告かは関数が決める**:
  Authorization が無い（または公開キー）なら匿名（`user_id` は null・メールは読者が入力したもの）、利用者の
  access token なら Auth サーバー（`/auth/v1/user`）に訊き、`user_id` と `email` は**そのアカウントのもの**
  （本文の値は捨てる）。Auth が拒んだ token は 401（黙って匿名にしない）。読むのは表の列だけで、各列は
  `len_guard` 制約の上限で 400 を返す。`created_at` は DB が書く。1 日の上限は `READER_REPORTS_GLOBAL_PER_DAY`。
  送信が失敗したとき、バグ報告は端末に保存しクリップボードへ写す（従来どおり）。

⚠ **(anon-write-guard) `aviation-feed` と `ais-feed` の `?refresh=1` はプロジェクト全体で 1 つの枠から取る。** 読み取り予算
（`_shared/read-budget.js`）は isolate ごとなので、isolate にまたがって `?refresh=1` を送ればそれぞれが burst を与えた。
掃引は秘密を持たず誰とも区別できないので、枠は呼び手を問わない共有バケット 1 つ（`relay_take`・鍵 `'*'`、
`_shared/rate-limit.js` の `forceGrant`）。aviation は**掃引 1 run 分を cron 間隔ごとに**（`FORCE_BURST`＝ワークフローの
`SLICES`＝10／`FORCE_PERIOD_S`＝cron 間隔 300 秒。正本はワークフロー）、ais は掃引が無いので **`WORLD_TTL_MS` ごとに 1 回**。
枠を超えた要求と DB が答えないときの要求は、`refresh=1` が無かったのと同じ答え（200・キャッシュ済み・**上流に触れない**）を返し、
`x-intmap-forced: capped` / `unavailable`（強制したときは `granted`）で理由を述べる。拒否ではない。

⚠ **公開の関数はすべて、上流へ出る前に共有 bucket から 1 トークン取る。** `verify_jwt = false` の関数のうち
秘密で守られた 3 本（`refresh-news`・`news-ingest`・`monitor-run`）と、自前の 2 段の bucket を持つ `client-errors`・`reader-reports`・`usage-count` 以外——
`alerts-relay`・`ais-feed`・`aviation-feed`・`cable-geo`・`fetch-relay`・`gdelt-relay`・`news-relay`・`quotes-relay`・
`radiation-feed`・`sv-cov`・`volcano-feed`・`who-don`（公開 GET）——は `_shared/rate-limit.js` の `callerGate()` で
`<関数名>:ip` の bucket（`public.relay_rate_buckets`）から取る。容量＝その関数の読者 1 人のページが 1 分に送る最大数
（各関数が `READER_PER_MIN` として、クライアントのタイマーから読んだ**推定**を持つ）×`READERS_PER_ADDRESS`（10。1 アドレスの
背後の読者数の推定）。**DB が答えなければ通す**（呼び出しごとの請求が無い relay で、DB 障害を全レイヤーの障害にしない）。
拒否は `429 rate_limit`＋`Retry-After`。`<関数名>_PER_IP_PER_MIN` で 1 本の容量を deploy なしに動かせる。
`routing-relay` は従来どおり自前の fail-closed の全体上限を持つ。

⚠ **`_shared/relay-guard.js` を共有するのは20本**（`ai-proxy` / `ais-feed` / `alerts-relay` / `atlas-embed` / `aviation-feed` / `cable-geo` / `client-errors` /
`fetch-relay` / `gdelt-relay` / `monitor-run` / `news-ingest` / `news-relay` / `quotes-relay` / `radiation-feed` / `reader-reports` / `routing-relay` / `sv-cov` / `usage-count` / `volcano-feed` / `who-don`）**。** そのうち
`ai-proxy`（JWT）・`atlas-embed`（JWT）・`monitor-run`（共有秘密または JWT）・`news-ingest`（`x-news-ingest-secret`）の 4 本が認証を持ち、`reader-reports` は任意（送られた token だけを Auth サーバーで検証する）、**残り15本は無認証**。
`ai-proxy`・`monitor-run`・`client-errors`・`reader-reports`・`usage-count` が共有するのは**読み手だけ**（`readCapped`＝要求本文を読みながら上限で切る、`fetchBounded`＝提供者への
POST をヘッダではなく**本文の最後のバイトまで**同じ期限と上限で読む——提供者への要求では `_shared/ai-provider.js` の扉の中で使う）で、URL allowlist の側ではない。
⚠ **リダイレクトは手で辿る**（`followRedirects`）。`redirect:"follow"` は最初の 1 ホップにしか allowlist を訊いていなかったので、
各ホップを同じ https オリジンか、呼び出し側が渡した `allowRedirect(next, from)` で検査し、上限は 3 ホップ（`MAX_REDIRECTS`）。
共有しているのは、URL allowlist（相手先 URL を呼び出し側が名指す中継だけ）、**GET 限定**、**期限**（`AbortSignal.timeout`）、
**バイト上限**（`content-length` とストリーム読み出しの両方——上流は length を返さないことがある）、
**Content-Type** 判定、そして**外向きエラーはコード1語**（上流の例外文言・スタックは返さない）。
⚠ **公開レイヤーなのでログイン必須にはしない**（署名前の読者に地図を出せなくなる）。

### 6.3 環境変数（Edge Functions の secrets）

- 自動注入: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- AI: `AI_PROVIDER`（anthropic|openai|gemini）, `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` /
  `GEMINI_API_KEY`, `AI_MODEL`（任意）
- プロジェクト全体の 1 日の天井（任意・どれも正の整数。既定は各関数の定数）: `AI_PROXY_GLOBAL_PER_DAY`,
  `MONITOR_RUN_GLOBAL_PER_DAY`, `NEWS_INGEST_GLOBAL_PER_DAY`, `REFRESH_NEWS_GLOBAL_PER_DAY`,
  `WHO_DON_GLOBAL_PER_DAY`, `ATLAS_EMBED_GLOBAL_PER_DAY`（§5「有料の提供元へは扉が 1 つだけ」）。
  `AI_PROXY_NEWCOMER_PER_DAY`（任意・7 日未満のアカウントの取り分。既定は全体の 1/3、全体を超えない）
- refresh-news: `REFRESH_SECRET`（**必須**。未設定なら関数は全リクエストを拒否する）,
  `NEWS_AI=off`（任意・AI を止めて辞書だけにする kill-switch）
- news-ingest: `NEWS_INGEST_SECRET`（**必須**）, `NEWS_GEO_AI=off`（任意・AI 地点解析の kill-switch）,
  `NEWS_GEO_MODEL`（任意・地点解析だけ別モデル）, `NEWS_TRANSLATE=off` / `NEWS_TRANSLATE_MODEL`,
  `NEWS_EMBED=off` / `NEWS_EMBED_MODEL`
- atlas-embed: `OPENAI_API_KEY`（ai-proxy と同じ鍵）, `ATLAS_EMBED_MODEL`（任意・既定 `text-embedding-3-small`）,
  `ATLAS_EMBED_GLOBAL_PER_DAY`（任意・プロジェクト全体の 1 日の上限）
- monitor-run: `MONITOR_SECRET`
- reader-reports: `READER_REPORTS_GLOBAL_PER_DAY`（任意・プロジェクト全体の 1 日の上限。既定 500）
- usage-count: `USAGE_COUNT_GLOBAL_PER_DAY`（任意・プロジェクト全体の 1 日の要求数の上限。既定 100,000）
- Gemini 経路のみ: `GEMINI_SEARCH_ENABLED`（既定 OFF）
