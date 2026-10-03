# IntMap — 現状仕様書 §4 ニュース処理の流れ (News pipeline)

> **現状仕様書の §4。** 案内図は [`Architecture.md`](../../Architecture.md)（§ → ファイルの表）。**節番号は案内図と共有している**
> ——他の文書・コード・テストが書く「`Architecture.md` §4.x」は、このファイル（と案内図の表が同じ行に挙げる文書）の見出しを指す。
> 今どうなっているかだけを書く。変更履歴・ラウンド番号・PR 番号は書かない（`npm run check:docs` の `arch-rounds` がこのファイルも読む）。

## 4. ニュース処理の流れ (News pipeline)

### 4.1 サーバー側（事前処理）— `supabase/functions/refresh-news/index.ts`

1. **cron（約20分ごと）**で起動（pg_cron から `x-refresh-secret` ヘッダ付きで POST）。
2. **Google News RSS をサーバー側で取得**（en / jp、world + business）。CORS を要さない。
3. **地点解析（subject location）**:
   - **AIが第一手段**（en/jp の全記事）。`AI_PROVIDER` でサーバー保持の鍵を使い、見出し＋説明から
     「出来事の起きた具体的な場所」を返させる。1回あたりバッチ（既定15件）、1実行あたり上限 120 件。
   - **非AI解析はフォールバック**（AI失敗・en/jp 以外・AI停止時）。決定論エンジン
     `_shared/newsgeo.js`（＝ブラウザの `js/newsgeo.js` と1バイト同一）が同名地の曖昧性解決・
     デートライン抑止・組織／人名トラップ除去まで行う。さらにその後段に `geo_pins` ＋埋め込み辞書の
     スコアリングが最終フォールバックとして残る。どちらも `analyzed_by='dict'` を記録する。
     `geo_pins` の運用者追加ピンは `NEWSGEO.register()` でエンジン索引にも合流する（built-in より低ランク）。
4. **重複防止・再解析防止**:
   - `current_news` は `(lang, link)` で upsert ＝ **同じURLは重複保存しない**。
   - 直近72時間の既存行を読み、**すでに `analyzed_by='ai'` の記事は再びAIに送らない**。
5. **媒体HQ** は埋め込み publisher 辞書から解決し、subject とは別に保存する。
6. `current_news` に書き込み、各行に `analyzed_by`（`'ai'|'dict'|'none'`）を記録する。
7. **72時間より古い行を削除**する（`pub_date` 基準、`fetched_at` も保険）。

### 4.2 フロントエンド（表示）

- ⚠⚠ **起動時の `fetchData()` は上流に何も訊かない。** `js/app-body.js` の起動と3分ごとのタイマーは
  `fetchData({background:true})` で呼び、**ニュースを求めた読者がまだ居ないなら、キャッシュを戻して
  そこで止まる**。取りに行くのは、News／Saved に入ったとき・検索・Atlas のニュース質問・下部ティッカー・
  Workspace の News ウィンドウ・国／言語の変更——つまり**実際の入口**から呼ばれたとき（引数なし）。
  最初のそれで閂が開き、以後はタイマーもその裏で更新を続ける。
  保存された表示モードが News そのものなら、それ自体が「求めた」ことなので起動時にも取りに行く。
  ⚠ **これは機能フラグではない**——`NEWS_EVENT_MODE` の経路は1つも減っていない。変えたのは「いつ」。
  ⚠ **`need('newsEvents')` の位置だけを動かしても直らない。** Event 経路は成功時に `return` するので、
  そこを飛ばすと仕事が消えるのではなく**記事経路（自前リレー＋公開プロキシ4本＝約50リクエスト）へ落ちる**。
  境界は「どちらの経路か」ではなく「誰かが求めたか」に置く必要がある。
- `fetchData()`（求められたとき）：
  1. ローカルキャッシュ（`intmap_news_cache`）があれば即表示。
  2. **FAST PATH**：`loadNewsFromSupabase()` が `current_news` を1回 SELECT → `serverRowToItem()` →
     `startNews()` でピンを出す。**フロントはニュース地点解析のためにAIを呼ばない。**
     - ⚠ **この経路は現在停止している**：`js/app-body.js` の `const USE_SERVER_NEWS = false`
       （`window.__IM_USE_SERVER_NEWS`）。全言語でライブRSS＋クライアント側の非AI解析だけを使う。
       `true` に戻せばサーバー事前解析フィードが復活する。
       ⇒ **したがって本番で実際に効いている地点解析は `analyzeContext()` ただ一つ**であり、その第一手段が
       `IntMapNewsGeo`（§4.3）である。
  3. **FALLBACK**：検索・時系列（タイムマシン）・多言語モードなど、サーバーが焼いていないケースでは
     ライブRSS（`news-relay` 経由）を取得し、クライアントの `analyzeContext()` で解析する。
- **72時間フィルタ**：`computeFilteredNews()` が72時間より古い記事を表示から外す（保存済みと時系列モードは除く）。
- **過去の時刻では、その時刻の前後に配信された記事だけを残す**（`buildItems()`。窓は
  `DATE_WINDOW_DAYS`＝前後 8 日で、問い合わせの ±3 日に時差の余裕を足したもの）。Google News は
  最近の範囲より前の `after:`/`before:` を無視して今日の見出しを返すので、1900 年のような時刻では
  **上流は答えたが残る記事は 0 件**になる。⚠ これは「読み込み中」ではない——`fetchData()` は
  「源が答えて一覧が空だった時刻」を `_answeredFor` に覚え、`startNews()` はその時刻について
  **「{日付} の前後 8 日以内に配信された記事はありません」**（`noNewsForDate`）と述べる。
  空の一覧を「まだ読み込んでいない」と読んでいた頃は、閂（`_asked`）が再取得を止めるので
  「Loading articles...」が永久に残っていた。どの源も答えなかったときは従来どおり `networkError`。
  検査は `tests/news-past-clock-checks.test.mjs`（`fetchData()`／`startNews()` を評価）。
- **一覧の描き直しは、読んでいる位置を戻さない。** 一覧は `NEWS_BATCH`（30 件）ずつ遅延で足される
  （スクロールが底に近づくと `appendNewsBatch()`）。`startNews()` は背景の出来事——認証イベント・
  設定の保存・言語切替・realtime——からも呼ばれるが、**画面に出ているカードが新しい絞り込み結果の
  先頭 N 件と同じ項目・同じ順**（同一性は★と同じ：出来事は `publicId`、記事は `link`）なら、
  N 件ぶん描き直し、読者が見ていたカードを同じ位置へ戻す（`js/news-feed.js` の `_readingPlace()` /
  `_restorePlace()`）。カードそのものは作り直す——文面は言語・日付書式・★の状態にも依るので、
  「変わりうる設定」の一覧は持たない。先頭が変わった一覧（新しい検索・カテゴリ・先頭に届いた新着）は
  従来どおり先頭から。⚠ 認証リスナー（`js/auth-ui.js`）は `startNews()` を直接呼ばない——
  続けて呼ぶ `renderUI()` の News/Saved 分岐が呼ぶので、両方あると 1 回の認証イベントで 2 度描いていた。
  検査は `tests/news-list-keeps-position-checks.test.mjs`（`startNews()` を評価）と `tests/r169.spec.js` #3b
  （本物の SIGNED_OUT で 45 件と位置が残る）。
- **ニュースのピンは「出来事が起きた場所」1 通りだけである。** かつて「主題 (Subject) / 発信元
  (Publisher)」の切替があったが撤去した——出来事経路は `pubLoc` を構造上必ず `null` にするため、
  発信元側へ倒すと全件が擬似座標へ散った（経緯は `DEV-NOTES.md`）。
- **1 つのピン＝1 つの出来事**（出来事経路のとき）。地物は `ev` / `evId` / `evSources` /
  `evArticles` / `evCat` を持ち、押すと**サイドバーの出来事詳細**が開く（外部記事ではない）。
  地物を組むのは `newsFeatureOf()`（`js/news-feed.js`）**1 か所だけ**である。
- **帯（`news-labels`）の文字**は `IntMapMapTypography.bandText()`（`js/map-typography.js`）が決める。
  **地図の被せもの（操作卓・凡例・浮いたカード）の下に入る帯は、出さないし場所も取らない**
  ——`declutterNewsBands()` が `elementFromPoint` で「その画素の最上位は canvas か」を訊く。
  ⚠ 被せものの一覧は持たない。⚠ 読めない帯に場所を取らせると、読めたはずの帯がそれに負ける。
  ⚠ 帯の幅を測る `bandBox()` と同じファイルにあるのは偶然ではない——**同じ 1 つの帯について
  「何を書くか」と「どれだけ場所を取るか」を別々のファイルが答えると食い違う**。

### 4.3 非AI地点解析エンジン `IntMapNewsGeo` — `js/newsgeo.js`

**決定論**（ネットワーク無し・乱数無し・同じ見出しは常に同じ地点）。

1. **最長一致のスパン消費** — 正規化 n-gram ハッシュ索引（ラテン／キリル文字はトークン n-gram、CJK は文字走査）。
   長い名前が必ずスパンを取るので、**トラップ項目**（`New York Times` / `Paris Hilton` /
   `Bank of America` / `Paris Agreement`）が中の地名を丸ごと飲み込む。
2. **曖昧性解決** — 1つの表記が複数の実在地に対応する場合（`Tripoli`＝リビア/レバノン、`Cambridge`＝英/米、
   `Springfield`、`Toledo`、`Georgia`…）、同一テキスト中の**国・admin1 の手がかり**、
   **曖昧でない地点との地理的近接**、**著名度の prior** で1つに決める。
3. **階層吸収** — 都市とその国が両方出たら都市を加点し、**親（国）を抑制**する。
4. **デートライン／会場の抑止** — 発話動詞の直後に来る地名（`Moscow said` / `Berlin announces`）と
   `summit in <地名>` の会場は「話した場所」であって事件現場ではないので減点する
   （**他に候補がある時だけ**）。逆に `over/about/について/を巡り` で導かれる地名は加点する。
5. **イベント語の親和** — `strike/earthquake/地震/攻撃` 等の近傍にある地名を加点する。
6. **大文字ガード** — 固有名詞は必ず大文字始まり（`us`≠US、`la guerra`≠LA、`male voters`≠Malé）。
   頭字語（`US/UK/WHO/LA/DC…`）は**全大文字**を要求する（文頭の `Who…` が WHO にならない）。
7. **常用語の国名**（`Turkey/Chad/Mali/Niger/Guinea/Jordan/Nice`）は**裏付け**（前置詞・イベント語・
   階層・他の地名の同居）が無ければ**採らない**。
8. **確信度** — 0〜1 の `confidence` と根拠 `why[]` を返す。答えを出せなければ `null` を返し、無理に打たない。

**データ**：約200か国（EN/JA ＋ DE/RU/ES の別名・デモニム・首都）／都市・紛争地・海峡等 約900／
admin1 約150（米50州・日本の県・中国の省・印州・独州・ウクライナ州…）／トラップ・国際機関・武装組織・
企業HQ・首脳名・政府機関メトニム 約300。`register()` で運用者データを実行時に合流できる。
⚠ 運用者データは内蔵辞書と**同じ場所**を重複登録しうるので、候補が全て 50 km 以内なら「曖昧」ではなく
**重複**として1つに畳む（畳まないと国の文脈シードが消える）。

### 4.4 出来事 (Event) 単位の基盤

記事ではなく**出来事 (Event)** を主語にする経路で、**News タブが既定で読んでいるのはこちら**。
DB 側は 9 表（`news_sources` / `news_source_feeds` / `news_articles` / `news_events` /
`news_event_articles` / `news_cluster_decisions` / `news_event_i18n` / `saved_news_events` /
運用者の監査 `news_event_admin_actions`）＋ 取り込みの計測 `news_ingest_runs` で、列・関係・
RLS・grant・運用者 RPC の一覧は [`docs/DATABASE.md`](../DATABASE.md)、実証は
`supabase/tests/06_news_events_test.sql`（§16.1）。

収集は **Edge Function `news-ingest`**（§6.2）が cron で回す。段は 8 つ——
`fetch`（Source Registry のフィード取得・正規化・媒体の帰属・決定論エンジンによる地点の下書き）／
**`locate`（地点解析。AI が第一手段で、決定論エンジンの答えを上書きする）**／
`embed`（埋め込みを付ける。現在の鍵は埋め込みモデルに到達できず、その理由を応答に出して止まる）／
`assign`（候補 Event を引いて増分で載せる。総当たりしない）／
`link`（すでに分かれている Event 対を、新着と**同じ規則**で結ぶ）／
`summarise`（**独立 2 媒体以上**が本文を持つ Event だけを LLM で 1 つの説明にまとめ、
1 文ごとの根拠の断片が原文に実在することを**サーバー側で照合してから** `news_events.summary` /
`summary_evidence` に保存する。1 文でも通らなければその Event の返答は丸ごと捨てる）／
`translate`（代表見出しを ja へ。**既定で止まっている**——`NEWS_TRANSLATE=on` を明示した
ときだけ走る）／
`prune`（記事 72 時間・Event 30 日・★保存は無期限）。判定の論理は
`supabase/functions/_shared/news-cluster.js` と `_shared/news-ingest.js` で、**どちらも
サーバー専用**（クライアントのバンドルに 1 バイトも入らない）。

表示側は **`js/news-events.js`**（`IntMapLazy` の `newsEvents`。起動経路には入らない）。
**降りてくるのは News 面が開かれたときだけ**——起動時と 180 秒ごとの取得は
`fetchData({background:true})` で、まだ誰も訊いておらず News/Saved も出ていなければ**何もせずに
戻る**。開くと `startNews()` が掛け金付きで 1 度だけ取得を起こす。⚠ `setMode()` は `fetchData()` を
呼ばない（`renderUI()` だけ）ので、この掛け金が無いとタブは「読み込み中」のまま止まる。

⚠ **統合文は、画面上で「AI が書いた」と名乗る。** `summarise` 段が LLM に書かせた段落
（`news_events.summary`）を出すとき、`js/news-events.js` の注記が **9 言語すべてで AI
（KI / ИИ / IA）を明示**し、**畳まれた `<details>`（各文の根拠になった原文）の上**、段落の直下に出る。
1 文ごとの引用元の媒体名と、照合に使った原文の断片は従来どおり同じブロックの中にあり、
引用元の媒体がいまの構成記事に無ければ統合文そのものを出さない。
`tests/shell-index-document-checks.test.mjs` が 9 言語すべての語と、注記が `<details>` より前に在ることを検査する。
両方の半分——起動時は降りてこない／開けば降りてきてカードになる——を `tests/r402.spec.js` が
本物のブラウザで測る。
`HOST.globalData` に**記事モードと同じ形の項目**を入れ、`_event` にだけ出来事固有の事実を足す
ので、既存の描画・ピン・無限スクロール・期間フィルタがそのまま動く。カードは `.news-item` に
カテゴリ・`Updated` の印・`N sources`・**要点の 1 文（出典付き）**を足したもので、詳細は既存の
`#news-reader-pane` に描かれる（何が起きたか／主要な数字／最新の記事で更新された点／媒体間の
一致と相違／どの媒体がいつ何と書いたか／同一系列の印／この塊の組み立て方）。カテゴリ chips は
`#news-cat-chips`。

⚠⚠ **`#news-reader-pane` は 1 つの「読む面」であり、入口と出口は 1 本ずつである。**
記事 reader と出来事の詳細は同じ面を使うので、面へ入る手順も出る手順も共有する——
`enterReaderPane()`（`js/article-reader.js`）がサイドバーを開き、電話ならシートを full にし、
**一覧の外皮（タブ列・`#sidebar-search-bar`・`#news-filter-toggle`・`#ai-geocode-row`・各 feed）を
伏せて**面を出す。`closeReaderPane()`（`js/app-body.js`）が面を捨てて外皮を戻す。
⚠ **`renderUI()` は「1 面だけ」を守る**——News 以外へ移れば読む面を閉じ、News に居るなら
読む面を残して一覧をその下で更新する（背景の再描画で一覧が読む面の横に並ぶと、サイドバーの
flex 列が高さを折半する）。**`setMode()` はタブ／scope の操作なので、必ず読む面を離れる。**
⚠ 「いま開いている出来事」（Atlas の `selectedEventId`）は**面を観測して**答える。閉じる経路は
戻るボタンだけではない。
⚠⚠ **読む面は Atlas への道を自分で持つ。** 入口は `.control-panel`（タブ列）ごと伏せるので、
読んでいる間は Atlas タブが 0×0 になる。帯（`.nrp-bar`）は `js/article-reader.js` の
`readerBar()` が**1 か所で**組み、戻ると **`.nrp-atlas`（「Ask Atlas」）** を必ず載せる——
記事 reader も出来事の詳細もそれを呼ぶ。
⚠⚠ **その道は主題を連れて渡る。** `.nrp-atlas` は `js/atlas-reading.js` の **`askReading()`** を呼び、
Atlas は**読んでいたものの上に**開く——見出し・媒体と日付と場所の 1 行・`window._imReader.loc` を
ピンに据え、その 1 件が**実際に持っているもの**から導いた質問チップを 3 つまで。入力欄は自由のまま
で、チップは起点であって唯一の出口ではない（送るのは読み手）。到着の吹き出し（見出し＋説明＋チップ）
は `js/atlas-reading.js` の `arrive()` が**1 か所で**組み、地図の右クリック `askHere()` も同じものを呼ぶ——同じ名前の
2 つのボタンが違う着き方をしたのは、到着が片方の中に書かれていたからである。
⚠⚠ **面を離れることと、Atlas の主題を捨てることは別である。** `closeReaderPane(quiet, carryArticle)`
は既定で `window._imReader` を捨てるが、`setMode()` が **Atlas へ入る**ときだけ主題を運び、
`onScreen:false` を立てる（次のタブ操作＝Atlas の解除を含む、が捨てる）。Atlas の文は
運ばれた記事を「いま読んでいる」とは言わない（`js/atlas-state.js`）。詳細は
[`docs/NEWS-EVENTS.md` §10.1](../NEWS-EVENTS.md)。

⚠⚠ **記事本文の取得（`fetchReadable()`・`js/article-reader.js`）は 2 段で、全体に 1 つの上限がある。**
第 1 段は `r.jina.ai` の Markdown、第 2 段は**発行元から直接読んだ記事 HTML** を `DOMParser` で
読む（`<article>`／`<p>`／`og:description`）。第 2 段は `fetchViaProxy(link, {as:'html', direct:true, budgetMs})`
を呼ぶ——段は**発行元そのもの**、次に **`fetch-relay` の記事規則**（`&as=article`。下の §6.2）。ACAO を返す発行元
〈dw.com・nhk・cnn など〉は直接読め、返さない発行元〈aljazeera・bbc・guardian・lemonde など〉は自前の relay が取る。——**`as` を省くと `js/proxy-fetch.js` は RSS/Atom しか「答え」と認めない**ので、記事 HTML は
捨てられる。`budgetMs` には `READER_BUDGET_MS` の**残り**を渡し、残りが無ければ第 2 段を行わない。
⚠ **上流のエラーページを本文にしない**のが両段の共通規律である。第 1 段は抽出テキストが
`MIN_ARTICLE_CHARS` 未満なら受理しない（相手サイトの「Something went wrong.」は 2 ブロックある）。
第 2 段の受理条件は §「`fetchViaProxy(url, opts)`」（下）。

**`fetchViaProxy(url, opts)`（`js/proxy-fetch.js`）** は、その URL を受け付ける**自前の relay だけ**を段にする——
`gdelt-relay`（単独で先に）、`news-relay`・`quotes-relay`・`cable-geo`・`sv-cov`・`fetch-relay`（表 `OWN_RELAYS`）。
複数あれば**競争させ**、勝者以外を abort する。**各段は 1 回だけ訊く**——全滅しても同じ relay に同じ要求を送り直さない
（違うことをする段＝ホストそのもの〈`direct`〉と、競争の各 relay は既に 1 回ずつ訊いてある）。`note.attempts` が要求の数を記録する。
**第三者の公開 CORS プロキシは段に無い**。
**上流の「無い」は答えである**: 自前の relay は、上流が明示的に「この問いには何も無い」と答えたとき
（quotes-relay＝Yahoo の 400/404 と v8 のエラー封筒、fetch-relay＝404/410）を 502 ではなく
**200＋`x-intmap-no-data: 1`**（`_shared/relay-guard.js` の `noData()`。本文は上流のコードだけで、上流の文は中継しない。
共有キャッシュ可）で返し、梯子は `reason:'no-data'` を述べて `null` を返す——再試行せず、失敗として扱わない。
Companies の時間旅行は、`range=max` の履歴が始まる年より前と、一度「無い」と答えられた銘柄×年を訊かない。
どの relay も受け付けない URL は、呼び手が `direct` を許したときだけ**ホストそのもの**へ行き、それ以外は
`null`（`reason:'refused'`）。`fetch-relay` の段は規則ごとの時計（`timeoutMs`＋往復 3 秒）を持ち、`budgetMs` を
指定しない呼び手には、その時計が収まる予算が与えられる。
**`ownRelayUrl(url)`** は同じ表から「その URL を受け付ける自前 relay の URL」を返す（無ければ `''`）——
文字列しか受け取れない呼び手（`<img>` の Street-View 被覆タイル、Cache API に置く海底ケーブル）のための口で、
relay の URL を自分で組み立てるファイルは無い。

- `opts.as` … `'feed'`（既定・`<rss`／`<feed` を含むこと）・`'html'`・`'json'`・`'text'`（空でないこと。CelesTrak の TLE）。
  `'html'` の受理条件は「**HTML 文書を名乗り**（`<!doctype html`／`<html`）・**`HTML_MIN_BYTES` 以上**・
  **`<p>` か description の meta を持つ**」の 3 つ。リレーの JSON エラー封筒・ボット遮断の
  interstitial・空の殻はここで落ちる（`news-relay` が interstitial を feed として返さないのと同じ規律）。
  ⚠ 「本文が読み取れるか」は**呼び手の問い**であり、呼び手が別に判定する。
- `opts.budgetMs` … **ladder 全体**の上限（既定 `BUDGET_MS`）。各試行の締切はこの残り時間を超えない。
⚠ **workspace mode も同じ規則に従う。** `js/workspace.js` は News ウィンドウの一覧を
`display:flex !important` で出す（サイドバーのタブ状態がそこへ届かないようにするため）ので、
inline の `display:none` では伏せられない。入口が `body.im-reading` を立て、出口が下ろし、
workspace の規則は**その 1 つのクラスを読む**——決定の写しを 2 つ持たない。

⚠ **「何が起きたか」を組み立てる規則は `js/news-brief.js` の 1 本だけ**で、UI と
`scripts/news-events-eval.mjs --brief` が同じものを呼ぶ（表示の層に置くと、ブラウザの外から
歩留まりを測れない）。決定論の抽出は**構成記事の `description` が既にブラウザに届いている**
ので、その場で組む——保存も追加の往復も要らない。サーバーの `summarise` 段が足すのは、
決定論では作れないもの 1 つだけ、すなわち**複数の媒体が別々に書いた文を 1 つの説明にまとめる
こと**である。
⚠ **上流が本文を配っていない Event は、そう書く。** 「要約が無い」を読み込み失敗に見せない。
⚠ **Event の見出しの日本語訳は生成も表示もしていない**（News は英語）。`news_event_i18n` の行は
削除していないので、`NEWS_TRANSLATE=on` と読み出しの復帰で再開できる。

**地点解析は AI が第一手段・決定論エンジンがフォールバック。** `fetch` は届いた記事を
`IntMapNewsGeo`（§4.3）で 1 度置き、`locate` が **まだ AI が見ていない記事**を batch で AI に送って
上書きする。AI が「場所の無い記事」と判断したものは決定論エンジンの答えがそのまま残る。
記事の行は「いま入っている座標を誰が置いたか」(`subject_located_by`) と「AI がこの記事を見た時刻」
(`subject_ai_at`) を**別の列**に持つ——後者が無いと、置けないと判断された記事を毎 run 送り直して
上限を使い切る。確度は模型に自己申告させず、**決定論エンジンと一致したかを測って**入れる。
⚠ `fetch` の upsert は、AI が置いた記事の `subject_*` を**送らない**（送ると 20 分ごとに踏み潰す）。
その「AI 済みの指紋」は逆から訊く——指紋 1,000 件の `.in(…)` は URL が約 65,000 文字になり
上流が 400 を返す（本番で実測）。
⚠ 記事の座標が変われば `assign` がその Event を数え直す（代表地点を選び直すのはそこ 1 か所）。

**収集元 (Source Registry)・クラスタリング・カテゴリ・地点解析・翻訳・保持期間・UI・Atlas・
運用者の修正経路・運用手順・品質と費用の実測の正本は
[`docs/NEWS-EVENTS.md`](../NEWS-EVENTS.md)。** ここには書き写さない。

⚠ **§4.1–§4.3 の経路と `current_news` は 1 バイトも変わっていない。** Event 側は加算であって
置き換えではない。**検索・過去の日付（時間旅行）・多言語モード**は最初から記事モードで、
Event 経路が答えを持てないとき（DB が無い・表が空）もそこへ落ちる。
⚠ **旗は 2 つあり、別物である**——`USE_SERVER_NEWS`（§4.2 の `current_news` の経路・
**false**）と `NEWS_EVENT_MODE`（`news_events` の経路・**true**）。`scripts/doc-facts.mjs` §15 が
**両方**をプライバシーポリシーと突き合わせている。

---

### 4.5 Atlas `research.events` — ブラウザ側のアダプタ `js/news-cluster.js`

Atlas の `research.events`（「最近の出来事をまとめて」）は、読み込み済みの記事一覧ではなく
**出来事の一覧**を返す。1つの出来事＝同じ出来事を報じているとみられる複数の記事。

⚠⚠⚠ **出来事モードでは、ここで束ね直さない。** `HOST.globalData` がすでに Event
（サーバーが窓全体を見て作ったもの）なら、`case 'events'` はそれを**そのまま**使う。
ブラウザに載っているのは 200 件で、サーバーは窓の全記事を見ているので、再計算は必ず
より悪い答えになる——そして「同じ出来事か」を決める場所が 2 つになる。

⚠⚠ **記事モードでも束ね方の実装はここには無い。** §4.4 と**同じ**
`supabase/functions/_shared/news-cluster.js` を `import` して `clusterArticles()` を呼ぶ。
この節のファイルがやるのは**適合だけ**——読み込み済みフィードの項目の形を入れ、返信に出す
出来事オブジェクトの形で返す。`js/atlas-cap-research.js` の `research.events` の run は窓と範囲を選び、
描いて書くだけ。

Atlas 側にはもう 1 つ入口がある——**`news.category`**（`js/atlas-capabilities.js`）。
出来事のカテゴリで News の一覧と地図を**同時に**絞る。述語は `IntMapNewsEvents.passes()`
1 本しかないので、片方だけに効く状態を作れない。News の **state provider**（`js/atlas-state.js`
の `news`）は、いま何件見えていて何本のピンが立ち、いくつが地点不明かを Atlas に渡す。

- ⚠ **写しを作っていない。** `js/newsgeo.js` が `supabase/functions/_shared/` へ**複製**されるのは、
  Deno の Edge Function が `supabase/functions/` の外を import できないからで、この制約は
  **一方向にしか効かない**。Vite のバンドルには同じ制約が無いので、ブラウザは共有ファイルを
  そのまま読む。**写しは古くなりうるが、1本しかないものは古くなりようがない。**
- ⚠ 正本は [`docs/NEWS-EVENTS.md`](../NEWS-EVENTS.md)（「第二のクラスタリング実装を残さない」）。
  §4.4 の経路が live になり `research.events` が `news_events` を読むようになったら、
  **このアダプタは消える**。消えるまでのあいだも、判定している式は §4.4 と同じ1本である。

このファイルが決めているのは次の2つだけ:

1. **記事がどの点にあるか。** `analysis.subjectLoc`（主題）を見る。⚠ かつてピンの表示位置
   （`analysis.loc`）は Publisher モードで媒体HQに書き換わったが、そのモードは撤去した
   ——出来事が何であるかを表示上の選択で変えてはならない（変えていた頃は「CNN の全記事が
   アトランタで起きた1つの出来事」になりえた）。保存済み記事のスナップショットは `subjectLoc` を
   持たないので、そこは `mapped === true`＝レコード自身の申告を使う。
2. **出来事を返信でどう見せるか。** 媒体の一覧・重心・「最初の報道→最新」の幅。

**決定論**（ネットワーク無し・乱数無し・壁時計を読まない）。「何時間前か」は呼び出し側が渡し、
アダプタはそれを固定のエポックからの時刻に直して共有モジュールへ渡す——だから同じ入力は
いつ走らせても同じ出来事になる。

⚠ **代表点は「場所」ではない。** 国の代表点に載った2記事は「同じ場所にある」のではなく
「同じ名前で整理されている」だけなので、共有モジュールはそこで見出しの閾値を**下げるのではなく
上げる**（`countrySame` / `countryNear` > `near` > `tight`）。閾値の表と、それを決めた実測は
共有モジュールの中にある。

---

### 4.6 出来事を地理・時間・企業・健全性から読む — `js/news-intel.js`

同じ `news_events` を、一覧（新しい順 200 件）とは別の 4 つの角度から読む口。正本は
[`docs/NEWS-EVENTS.md` §16](../NEWS-EVENTS.md)。

- **起動時に在るのは行と窓口だけ**: `js/news-pulse.js` がレイヤー行「国ごとのニュースの脈」（`dl-newspulse`）と
  IntMapOS 命令（`newspulse.toggle` / `.rank` / `.brief`）と `window.IntMapNewsIntel` を置く。本体
  `js/news-intel.js` は `IntMapLazy` の `newsIntel` で、最初に誰かが訊いたときに降りてくる。
- **計算は `js/news-intel-core.js` の 1 本**（純粋）: 地点 → 国（Natural Earth 10 m・海岸の許容 `COAST_KM`）、
  窓と直前の窓、増減、塗りの値、障害とニュースの結び付け、取り込みの判定。node のテストが本番のデータで
  同じ関数を評価する。
- **サーバーの読み口**（migration `20261003160000_news_intelligence.sql`）: `news_pulse(since, until)`
  （地点 × UTC 日 × カテゴリの集計を 1 つの jsonb）・`news_events_at(points, since, until)`（地点に載った
  出来事の行）・`news_ingest_health()`（取り込みの要約。本文を含まない）・表 `news_event_entities`。
- **Chronos に従う**: 窓の終わりは時計の瞬間（`clockUntil`）。`js/layer-time-decl.js` は `record`。
- **国の日報**は `.country-popup` の殻（`#nint-popup`）。出来事を押すと `IntMapNewsEvents.openRow` が
  一覧と同じ詳細を開く。障害は `IntMapNetHealth.outageEvents`（IODA をブラウザが読む・保存しない）。
- **企業パネルの「ニュース」タブ**（`js/company-panel.js`）は `IntMapNewsIntel.companyEvents` を読み、
  地図の線（`nint-co-*`）は `showCompanyLinks` が引く。
- **鮮度の部品** `js/freshness.js` は「新しい／N 時間更新なし／確認できなかった／未確認」を別の文で言う。
  News 一覧の上の取り込みの 1 行（`#news-ingest-health`、`js/news-events.js`）と日報と凡例が使う。

---

### 4.7 ストーリー — 日をまたいだ続報を年表と地図で — `js/news-story.js`

出来事は 48 時間の塊なので、続報は別の出来事になる。ストーリーは**見出しが同じ語をすべて含む出来事**
（直近 60 日・Chronos の瞬間まで）を 1 本の流れとして読む口で、正本は
[`docs/NEWS-EVENTS.md` §17](../NEWS-EVENTS.md)。

- **起動時に在るのは扉だけ**: `js/news-pulse.js` の `IntMapNewsIntel.story`・IntMapOS 命令 `newsstory.open`・
  `?story=a,b` の検出。本体 `js/news-story.js` は `IntMapLazy` の `newsStory`。
- **計算は `js/news-story-core.js` の 1 本**（純粋）: どの語を提案するか（`suggest`——名前は「文の書き方の見出しで
  文中でも大文字」の割合、対は PMI）・年表（UTC の毎日、0 の日も）・地点と国（§4.6 と同じ `makeCountryIndex`）・
  広がり（新しい地点 → 最も近い先行地点・大円は `news-intel-core.js` の `arc`）・再生位置（`frameAt`）・アドレス。
- **サーバーの読み口**（migration `20261003211600_news_story.sql`）: `news_title_terms(text)`（語を切る唯一の規則・
  GIN 索引の式）・`news_story(terms, since, until)`（`setof news_events`）・`news_story_terms(text, since, until, max_share)`
  （数だけの jsonb）。⚠ ブラウザは見出しを語に切らない。
- **入口**: 出来事の詳細（`js/news-events.js`）の「この出来事の流れを追う」・リンク・命令・Atlas `news.story`。
- ⚠ **ストーリーは述べた問いであって判定ではない**——カードは常に「見出しに … を含む出来事」と言い、線は報道の順序。
