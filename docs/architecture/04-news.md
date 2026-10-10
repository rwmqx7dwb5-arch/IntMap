# IntMap — 現状仕様書 §4 ニュース処理の流れ (News pipeline)

> **現状仕様書の §4。** 案内図は [`Architecture.md`](../../Architecture.md)（§ → ファイルの表）。**節番号は案内図と共有している**
> ——他の文書・コード・テストが書く「`Architecture.md` §4.x」は、このファイル（と案内図の表が同じ行に挙げる文書）の見出しを指す。
> 今どうなっているかだけを書く。変更履歴・ラウンド番号・PR 番号は書かない（`npm run check:docs` の `arch-rounds` がこのファイルも読む）。

## 4. ニュース処理の流れ (News pipeline)

### 4.1 サーバー側（事前処理）— `supabase/functions/refresh-news/index.ts`

1. **cron（約20分ごと）**で起動（pg_cron から `x-refresh-secret` ヘッダ付きで POST）。
2. **Google News RSS をサーバー側で取得**（en / jp、world + business）。CORS を要さない。
3. **地点解析（subject location）**: **AIが第一手段**（en/jp の全記事。`AI_PROVIDER` でサーバー保持の鍵を使い、見出し＋説明から「出来事の起きた具体的な場所」を返させる。
   1回あたりバッチ既定15件、1実行あたり上限 120 件）。**非AI解析はフォールバック**（AI失敗・en/jp 以外・AI停止時）——決定論エンジン `_shared/newsgeo.js`（＝ブラウザの
   `js/newsgeo.js` と1バイト同一）が同名地の曖昧性解決・デートライン抑止・組織／人名トラップ除去まで行い、その後段に `geo_pins` ＋埋め込み辞書のスコアリングが最終フォールバック
   として残る（どちらも `analyzed_by='dict'`）。`geo_pins` の運用者追加ピンは `NEWSGEO.register()` でエンジン索引にも合流する（built-in より低ランク）。
4. **重複防止・再解析防止**: `current_news` は `(lang, link)` で upsert（同じURLは重複保存しない）。直近72時間の既存行を読み、`analyzed_by='ai'` の記事は再びAIに送らない。
5. **媒体HQ** は埋め込み publisher 辞書から解決し、subject とは別に保存する。
6. `current_news` に書き込み、各行に `analyzed_by`（`'ai'|'dict'|'none'`）を記録する。
7. **72時間より古い行を削除**する（`pub_date` 基準、`fetched_at` も保険）。

### 4.2 フロントエンド（表示）

- **起動時の `fetchData()` は上流に何も訊かない。** `js/app-body.js` の起動と3分ごとのタイマーは `fetchData({background:true})` で呼び、ニュースを求めた読者がまだ居ないならキャッシュを
  戻して止まる。取りに行くのは実際の入口——News／Saved に入ったとき・検索・Atlas のニュース質問・下部ティッカー・Workspace の News ウィンドウ・国／言語の変更——から呼ばれたとき
  （引数なし）で、最初のそれで閂が開く。保存された表示モードが News なら起動時にも取りに行く。機能フラグではない（境界は「誰かが求めたか」。`need('newsEvents')` の位置を動かすと
  記事経路——自前リレー＋公開プロキシ約50リクエスト——へ落ちる）。
- `fetchData()`（求められたとき）: ① ローカルキャッシュ（`intmap_news_cache`）があれば即表示。② **FAST PATH**：`loadNewsFromSupabase()` が `current_news` を1回 SELECT →
  `serverRowToItem()` → `startNews()`（フロントは地点解析のためにAIを呼ばない）。**この経路は現在停止している**——`js/app-body.js` の `const USE_SERVER_NEWS = false`
  （`window.__IM_USE_SERVER_NEWS`）。全言語でライブRSS＋クライアント側の非AI解析だけを使う（`true` に戻せばサーバー事前解析フィードが復活する）。したがって本番で効いている記事の
  地点解析は `analyzeContext()` ただ一つで、第一手段が `IntMapNewsGeo`（§4.3）。③ **FALLBACK**：検索・時系列・多言語モードなどはライブRSS（`news-relay` 経由）を `analyzeContext()` で解析。
- **72時間フィルタ**：`computeFilteredNews()` が72時間より古い記事を表示から外す（保存済みと時系列モードは除く）。
- **過去の時刻では、その時刻の前後に配信された記事だけを残す**（`buildItems()`。窓は `DATE_WINDOW_DAYS`＝前後 8 日）。Google News は古い範囲の `after:`/`before:` を無視するので上流は
  答えても 0 件になる——`fetchData()` は源が答えて空だった時刻を `_answeredFor` に覚え、`startNews()` は「{日付} の前後 8 日以内に配信された記事はありません」（`noNewsForDate`）と述べる。
  どの源も答えなかったときは `networkError`。検査は `tests/news-past-clock-checks.test.mjs`。
- **一覧の描き直しは読んでいる位置を戻さない。** 一覧は `NEWS_BATCH`（30 件）ずつ遅延で足される（`appendNewsBatch()`）。`startNews()` は背景の出来事（認証・設定の保存・言語切替・
  realtime）からも呼ばれるが、画面に出ているカードが新しい絞り込み結果の先頭 N 件と同じ項目・同じ順（同一性は★と同じ：出来事は `publicId`、記事は `link`）なら N 件ぶん描き直して
  同じ位置へ戻す（`js/news-feed.js` の `_readingPlace()` / `_restorePlace()`）。認証リスナー（`js/auth-ui.js`）は `startNews()` を直接呼ばない（`renderUI()` が呼ぶ）。検査は
  `tests/news-list-keeps-position-checks.test.mjs` と `tests/r169.spec.js` #3b。
- **ニュースのピンは「出来事が起きた場所」1 通りだけ**（出来事経路は `pubLoc` を構造上 `null` にする）。
- **1 つのピン＝1 つの出来事**（出来事経路のとき）。地物は `ev` / `evId` / `evSources` / `evArticles` / `evCat` を持ち、押すとサイドバーの出来事詳細が開く。地物を組むのは
  `newsFeatureOf()`（`js/news-feed.js`）1 か所だけ。
- **帯（`news-labels`）の文字**は `IntMapMapTypography.bandText()`（`js/map-typography.js`）が決め、幅を測る `bandBox()` も同じファイル。地図の被せものの下に入る帯は出さないし場所も取らない
  （`declutterNewsBands()` が `elementFromPoint` でその画素の最上位が canvas かを訊く。被せものの一覧は持たない）。

### 4.3 非AI地点解析エンジン `IntMapNewsGeo` — `js/newsgeo.js`

**決定論**（ネットワーク無し・乱数無し・同じ見出しは常に同じ地点）。

1. **最長一致のスパン消費** — 正規化 n-gram ハッシュ索引（ラテン／キリル文字はトークン n-gram、CJK は文字走査）。トラップ項目（`New York Times` / `Paris Hilton` / `Bank of America` /
   `Paris Agreement`）が中の地名を丸ごと飲み込む。
2. **曖昧性解決** — 1つの表記が複数の実在地に対応する場合（`Tripoli`・`Cambridge`・`Springfield`・`Toledo`・`Georgia`…）、同一テキスト中の国・admin1 の手がかり、曖昧でない地点との
   地理的近接、著名度の prior で1つに決める。
3. **階層吸収** — 都市とその国が両方出たら都市を加点し、親（国）を抑制する。
4. **デートライン／会場の抑止** — 発話動詞の直後の地名（`Moscow said` / `Berlin announces`）と `summit in <地名>` の会場は他に候補がある時だけ減点し、`over/about/について/を巡り` で
   導かれる地名は加点する。
5. **イベント語の親和** — `strike/earthquake/地震/攻撃` 等の近傍にある地名を加点する。
6. **大文字ガード** — 固有名詞は大文字始まり（`us`≠US、`la guerra`≠LA、`male voters`≠Malé）。頭字語（`US/UK/WHO/LA/DC…`）は全大文字を要求する。
7. **常用語の国名**（`Turkey/Chad/Mali/Niger/Guinea/Jordan/Nice`）は裏付け（前置詞・イベント語・階層・他の地名の同居）が無ければ採らない。
8. **確信度** — 0〜1 の `confidence` と根拠 `why[]` を返す。答えを出せなければ `null`。

**データ**：約200か国（EN/JA ＋ DE/RU/ES の別名・デモニム・首都）／都市・紛争地・海峡等 約900／admin1 約150／トラップ・国際機関・武装組織・企業HQ・首脳名・政府機関メトニム 約300。
`register()` で運用者データを実行時に合流でき、候補が全て 50 km 以内なら重複として1つに畳む。

### 4.4 出来事 (Event) 単位の基盤

記事ではなく**出来事 (Event)** を主語にする経路で、**News タブが既定で読んでいるのはこちら**。**収集元 (Source Registry)・クラスタリング・カテゴリ・地点解析・翻訳・保持期間・UI・
Atlas・運用者の修正経路・運用手順・品質と費用の実測の正本は [`docs/NEWS-EVENTS.md`](../NEWS-EVENTS.md)**——ここには構造だけを書く。DB 側は 9 表（`news_sources` / `news_source_feeds` /
`news_articles` / `news_events` / `news_event_articles` / `news_cluster_decisions` / `news_event_i18n` / `saved_news_events` / 運用者の監査 `news_event_admin_actions`）＋取り込みの計測
`news_ingest_runs` で、列・関係・RLS・grant・運用者 RPC は [`docs/DATABASE.md`](../DATABASE.md)、実証は `supabase/tests/06_news_events_test.sql`（§16.1）。

- **収集は Edge Function `news-ingest`**（§6.2）が cron で回す。段は 8 つ——`fetch`（フィード取得・正規化・媒体の帰属・決定論エンジンによる地点の下書き）／**`locate`**（AI が第一手段で
  決定論エンジンの答えを上書き）／`embed`（現在の鍵は埋め込みモデルに到達できず、理由を応答に出して止まる）／`assign`（候補 Event を引いて増分で載せる）／`link`（分かれている Event
  対を新着と同じ規則で結ぶ）／`summarise`（独立 2 媒体以上が本文を持つ Event だけを LLM で 1 つの説明にまとめ、1 文ごとの根拠の断片が原文に実在することをサーバー側で照合してから
  `news_events.summary` / `summary_evidence` に保存。1 文でも通らなければ丸ごと捨てる）／`translate`（既定で止まっている。`NEWS_TRANSLATE=on` のときだけ）／`prune`（記事 72 時間・
  Event 30 日・★保存は無期限）。判定の論理は `supabase/functions/_shared/news-cluster.js` と `_shared/news-ingest.js`（サーバー専用）。
- **地点解析は AI が第一手段・決定論エンジンがフォールバック。** `fetch` が `IntMapNewsGeo` で 1 度置き、`locate` がまだ AI が見ていない記事を batch で送って上書きする（場所の無い記事は
  決定論の答えが残る）。行は `subject_located_by`（誰が置いたか）と `subject_ai_at`（AI が見た時刻）を別の列に持つ。確度は決定論エンジンと一致したかを測って入れる。`fetch` の upsert は
  AI が置いた記事の `subject_*` を送らない（AI 済みの指紋は逆から訊く——`.in(…)` の URL が長すぎると上流が 400）。座標が変われば `assign` がその Event を数え直す。
- **表示側は `js/news-events.js`**（`IntMapLazy` の `newsEvents`。起動経路には入らない）。News 面が開かれたときだけ降りてくる（起動時と 180 秒ごとの取得は `fetchData({background:true})`。
  開くと `startNews()` が掛け金付きで 1 度だけ取得を起こす。`setMode()` は `fetchData()` を呼ばない）。`HOST.globalData` に記事モードと同じ形の項目を入れ `_event` にだけ出来事固有の
  事実を足すので、既存の描画・ピン・無限スクロール・期間フィルタがそのまま動く。カードは `.news-item` にカテゴリ・`Updated` の印・`N sources`・要点の 1 文（出典付き）を足したもので、
  詳細は `#news-reader-pane`（何が起きたか／主要な数字／最新の記事で更新された点／媒体間の一致と相違／どの媒体がいつ何と書いたか／同一系列の印／この塊の組み立て方）。カテゴリ chips は
  `#news-cat-chips`。
- **統合文は画面上で「AI が書いた」と名乗る**（`js/news-events.js` の注記が 9 言語すべてで AI〔KI / ИИ / IA〕を明示し、畳まれた `<details>`〔各文の根拠の原文〕の上、段落の直下に出る。
  引用元の媒体がいまの構成記事に無ければ統合文を出さない。`tests/shell-index-document-checks.test.mjs`）。起動時は降りてこない／開けば降りてくることを `tests/r402.spec.js` が測る。
- **`#news-reader-pane` は 1 つの「読む面」で、入口と出口は 1 本ずつ。** `enterReaderPane()`（`js/article-reader.js`）がサイドバーを開き、電話ならシートを full にし、一覧の外皮（タブ列・
  `#sidebar-search-bar`・`#news-filter-toggle`・`#ai-geocode-row`・各 feed）を伏せて面を出す。`closeReaderPane()`（`js/app-body.js`）が面を捨てて外皮を戻す。`renderUI()` は「1 面だけ」を守り、
  `setMode()` は必ず読む面を離れる。「いま開いている出来事」（Atlas の `selectedEventId`）は面を観測して答える。workspace mode では入口が `body.im-reading` を立て出口が下ろし、
  `js/workspace.js` の規則はそのクラスを読む。
- **読む面は Atlas への道を自分で持つ**——帯（`.nrp-bar`）は `readerBar()` が組み、`.nrp-atlas`（「Ask Atlas」）を必ず載せる。それは `js/atlas-reading.js` の `askReading()` を呼び、Atlas は
  読んでいたものの上に開く（見出し・媒体と日付と場所の 1 行・`window._imReader.loc` をピンに据え、その 1 件が実際に持っているものから導いた質問チップを 3 つまで。送るのは読み手）。到着の
  吹き出しは `arrive()` が 1 か所で組み、地図の右クリック `askHere()` も同じものを呼ぶ。`closeReaderPane(quiet, carryArticle)` は既定で `window._imReader` を捨てるが、`setMode()` が Atlas へ
  入るときだけ主題を運び `onScreen:false` を立てる（Atlas の文は運ばれた記事を「いま読んでいる」とは言わない——`js/atlas-state.js`）。[`docs/NEWS-EVENTS.md` §10.1](../NEWS-EVENTS.md)。
- **記事本文の取得（`fetchReadable()`・`js/article-reader.js`）は 2 段で全体に 1 つの上限（`READER_BUDGET_MS`）。** 第 1 段は `r.jina.ai` の Markdown（抽出が `MIN_ARTICLE_CHARS` 未満なら
  受理しない）、第 2 段は発行元から直接読んだ記事 HTML を `DOMParser` で読む（`<article>`／`<p>`／`og:description`。`fetchViaProxy(link, {as:'html', direct:true, budgetMs})`——段は発行元
  そのもの、次に `fetch-relay` の記事規則 `&as=article`。残りが無ければ第 2 段を行わない）。上流のエラーページを本文にしない。
- **`fetchViaProxy(url, opts)`（`js/proxy-fetch.js`）** はその URL を受け付ける自前の relay だけを段にする——`gdelt-relay`（単独で先に）、`news-relay`・`quotes-relay`・`cable-geo`・`sv-cov`・
  `fetch-relay`（表 `OWN_RELAYS`）。複数あれば競争させ勝者以外を abort し、各段は 1 回だけ訊く（`note.attempts`）。第三者の公開 CORS プロキシは段に無い。上流の「無い」は答え——自前の
  relay は上流が明示的に何も無いと答えたとき（quotes-relay＝Yahoo の 400/404 と v8 のエラー封筒、fetch-relay＝404/410）を 200＋`x-intmap-no-data: 1`（`_shared/relay-guard.js` の
  `noData()`。共有キャッシュ可）で返し、梯子は `reason:'no-data'` で `null`（再試行しない）。Companies の時間旅行は `range=max` の履歴の始まりより前と、一度「無い」と答えられた銘柄×年を
  訊かない。どの relay も受け付けない URL は `direct` を許したときだけホストそのものへ、それ以外は `null`（`reason:'refused'`）。`fetch-relay` の段は規則ごとの時計（`timeoutMs`＋往復
  3 秒）を持つ。**`ownRelayUrl(url)`** は同じ表から自前 relay の URL を返す（`<img>` の Street-View 被覆タイル、Cache API の海底ケーブル）。
  - `opts.as` … `'feed'`（既定・`<rss`／`<feed`）・`'html'`（HTML 文書を名乗り〔`<!doctype html`／`<html`〕・`HTML_MIN_BYTES` 以上・`<p>` か description の meta を持つ）・`'json'`・`'text'`
    （空でないこと。CelesTrak の TLE）。本文が読み取れるかは呼び手が別に判定する。
  - `opts.budgetMs` … 梯子全体の上限（既定 `BUDGET_MS`）。
- **「何が起きたか」を組み立てる規則は `js/news-brief.js` の 1 本だけ**（UI と `scripts/news-events-eval.mjs --brief` が同じものを呼ぶ）。決定論の抽出は構成記事の `description` からその場で
  組み、サーバーの `summarise` 段が足すのは複数の媒体の文を 1 つの説明にまとめることだけ。上流が本文を配っていない Event はそう書く。Event の見出しの日本語訳は生成も表示もしていない
  （`news_event_i18n` の行は残る）。
- **§4.1–§4.3 の経路と `current_news` は変わっていない**（Event 側は加算）。検索・過去の日付・多言語モードは記事モードで、Event 経路が答えを持てないとき（DB が無い・表が空）もそこへ落ちる。
  **旗は 2 つ**——`USE_SERVER_NEWS`（§4.2 の `current_news` の経路・**false**）と `NEWS_EVENT_MODE`（`news_events` の経路・**true**）。`scripts/doc-facts.mjs` §15 が両方をプライバシー
  ポリシーと突き合わせる。

---

### 4.5 Atlas `research.events` — ブラウザ側のアダプタ `js/news-cluster.js`

Atlas の `research.events`（「最近の出来事をまとめて」）は出来事の一覧を返す（1つの出来事＝同じ出来事を報じているとみられる複数の記事）。

- **出来事モードではここで束ね直さない**——`HOST.globalData` がすでに Event（サーバーが窓全体を見て作ったもの）なら `case 'events'` はそれをそのまま使う。
- **記事モードでも束ね方の実装はここには無い**——§4.4 と同じ `supabase/functions/_shared/news-cluster.js` を import して `clusterArticles()` を呼ぶ（このファイルは適合だけ。`js/newsgeo.js` が
  `_shared/` へ複製されるのは Deno が外を import できないからで、Vite のバンドルは共有ファイルをそのまま読む）。`js/atlas-cap-research.js` の run は窓と範囲を選び、描いて書くだけ。正本は
  [`docs/NEWS-EVENTS.md`](../NEWS-EVENTS.md)（「第二のクラスタリング実装を残さない」。出来事の経路が live になればこのアダプタは消える）。
- このファイルが決めるのは 2 つだけ: ① 記事がどの点にあるか（`analysis.subjectLoc`。保存済み記事のスナップショットは `mapped === true`＝レコード自身の申告）② 出来事を返信でどう見せるか
  （媒体の一覧・重心・「最初の報道→最新」の幅）。決定論（「何時間前か」は呼び出し側が渡し、固定のエポックからの時刻に直す）。代表点は場所ではないので、国の代表点に載った2記事は
  見出しの閾値を上げる（`countrySame` / `countryNear` > `near` > `tight`。表と実測は共有モジュールの中）。
- **`news.category`**（`js/atlas-capabilities.js`）は出来事のカテゴリで一覧と地図を同時に絞る（述語は `IntMapNewsEvents.passes()` 1 本）。News の state provider（`js/atlas-state.js` の `news`）は
  見えている件数・ピンの数・地点不明の数を渡す。

---

### 4.6 出来事を地理・時間・企業・健全性から読む — `js/news-intel.js`

同じ `news_events` を一覧とは別の 4 つの角度から読む口。正本は [`docs/NEWS-EVENTS.md` §16](../NEWS-EVENTS.md)。

- **起動時に在るのは行と窓口だけ**: `js/news-pulse.js` がレイヤー行「国ごとのニュースの脈」（`dl-newspulse`）と IntMapOS 命令（`newspulse.toggle` / `.rank` / `.brief`）と
  `window.IntMapNewsIntel` を置く。本体 `js/news-intel.js` は `IntMapLazy` の `newsIntel`。
- **計算は `js/news-intel-core.js` の 1 本**（純粋）: 地点 → 国（Natural Earth 10 m・海岸の許容 `COAST_KM`）、窓と直前の窓、増減、塗りの値、障害とニュースの結び付け、取り込みの判定。
- **サーバーの読み口**（migration `20261003160000_news_intelligence.sql`）: `news_pulse(since, until)`・`news_events_at(points, since, until)`・`news_ingest_health()`（本文を含まない）・
  表 `news_event_entities`。
- **Chronos に従う**（窓の終わりは時計の瞬間 `clockUntil`。`js/layer-time-decl.js` は `record`）。
- **国の日報**は `.country-popup` の殻（`#nint-popup`）。出来事を押すと `IntMapNewsEvents.openRow` が詳細を開く。障害は `IntMapNetHealth.outageEvents`（IODA をブラウザが読む・保存しない）。
- **企業パネルの「ニュース」タブ**（`js/company-panel.js`）は `IntMapNewsIntel.companyEvents` を読み、地図の線（`nint-co-*`）は `showCompanyLinks`。
- **鮮度の部品** `js/freshness.js` は「新しい／N 時間更新なし／確認できなかった／未確認」を別の文で言う（取り込みの 1 行 `#news-ingest-health`・日報・凡例が使う）。

---

### 4.7 ストーリー — 日をまたいだ続報を年表と地図で — `js/news-story.js`

出来事は 48 時間の塊なので、ストーリーは見出しが同じ語をすべて含む出来事（直近 60 日・Chronos の瞬間まで）を 1 本の流れとして読む。正本は [`docs/NEWS-EVENTS.md` §17](../NEWS-EVENTS.md)。

- **起動時に在るのは扉だけ**: `IntMapNewsIntel.story`・IntMapOS 命令 `newsstory.open`・`?story=a,b` の検出（`js/news-pulse.js`）。本体は `IntMapLazy` の `newsStory`。
- **計算は `js/news-story-core.js` の 1 本**（純粋）: 語の提案（`suggest`——文の書き方の見出しで文中でも大文字の割合、対は PMI）・年表（UTC の毎日、0 の日も）・地点と国（`makeCountryIndex`）・
  広がり（新しい地点 → 最も近い先行地点・大円は `news-intel-core.js` の `arc`）・再生位置（`frameAt`）・アドレス。
- **サーバーの読み口**（migration `20261003211600_news_story.sql`）: `news_title_terms(text)`（語を切る唯一の規則・GIN 索引の式）・`news_story(terms, since, until)`・
  `news_story_terms(text, since, until, max_share)`（数だけの jsonb）。ブラウザは見出しを語に切らない。本体は `20261004090000_news_story_one_scan.sql`（GIN 索引を 1 回だけ読み `&&`、
  語と対の数を GROUP BY で出し、照合を MATERIALIZED の囲いに入れる。NEWS-EVENTS §17.5）。
- **読めなかったときは理由を言う**（`failureOf`。時間切れ・権限・未配備・データベース不在・ネットワーク・その他。Atlas には `errorKind`）。
- **入口**: 出来事の詳細の「この出来事の流れを追う」・リンク・命令・Atlas `news.story`。ストーリーは述べた問いであって判定ではない（カードは常に「見出しに … を含む出来事」と言い、線は報道の順序）。
