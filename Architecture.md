# IntMap — 現状仕様書 (Architecture)

> 本ファイルは**開発日記ではなく**、現在の IntMap を再現・保守するための**現状仕様書**です。
> Claude や他のAIが、このファイルを読むだけで IntMap の構造をほぼ理解できることを目的とします。
>
> Last reviewed: 2026-08-20

### この文書の読み方

- **§1–§18 は「今どうなっているか」だけ**を書く。**このファイルには変更履歴を書かない。**
  「いつ・なぜ・どう直したか」は `DEV-NOTES.md`（直近）と `DEV-NOTES-ARCHIVE.md`（それ以前）の担当。
  標準指示（やってはいけないこと等）は `CONSTITUTION.md`、作業の進め方は `CLAUDE.md`。
- **このファイルは構造・データフロー・公開契約・不変条件だけを持つ。** 分量が大きく、かつ
  「そこだけ読めば済む」主題は、**節番号をこのファイルと共有したまま**別の文書にしてある——
  [`docs/FILES.md`](docs/FILES.md)（§3 ファイル台帳）と
  [`docs/MAP-LAYERS.md`](docs/MAP-LAYERS.md)（§7.1・§7.2・§7.5〜§7.10 レイヤー実装の詳細）。
  他の文書からの `§3.x` / `§7.x` 参照はそのまま通る。
- **「何ができるか」は [`PRODUCT.md`](PRODUCT.md)、「なぜそうなっているか」は
  [`DECISIONS.md`](DECISIONS.md)。** どの文書が何の正本かは
  [`docs/README.md`](docs/README.md) が1枚の表で持っている。
- **ラウンド番号をこのファイルに書かない。** 「いつその事実になったか」を知りたいときは
  `git log -S'<その記述>' -- Architecture.md` で入った commit を辿り、同じラウンドの `DEV-NOTES.md`
  を読む。本文にラウンド番号を埋めると、それを手掛かりに履歴の物語がまた増えるので、
  `npm run check:docs` が本文中のラウンド参照を検査して落とす。
- 数字（行数・KB・件数など）を書くときは**その場で実測した値**にする。実測できる主要な数字は
  `npm run check:docs` がこのファイルと実体の一致を毎回検査する。
- 実装を変えたら、この仕様書も同じコミットで更新すること。
- `tests/r175-checks.test.mjs` のような**ファイル名**に含まれる番号は履歴参照ではない。

---

## 1. 概要 (Overview)

IntMap は、世界のニュース・気候・人口・経済・地政学データを一枚の地図に重ねて表示する、
**フロントエンド全部入りのWebアプリ**です。

### 1.1 ビルドと配信

- **本体は `index.html`（934行・84 KB）＋ `css/`（3本）＋ `js/`（179本・9.3 MB）＋ `src/`（8本）。**
  ビルドは **Vite**。`npm run build` → **`dist/`**（ハッシュ付き・最小化・チャンク分割）が
  **GitHub Pages で配信される実体**であり、リポジトリのソースツリーそのものは配信されない。
  `dist/` は `.gitignore` 済み＝**ビルド成果物はコミットしない**。
- `index.html` は**プログラムではない**。マークアップ＋ブート用の `<script>` ＋
  `<script type="module" src="/src/main.js">` だけで、アプリ本体は `js/app-body.js` にある。
- `js/*.js` は **`src/main.js` が index.html と同じ順序で `import`** する。安全な根拠は、
  **全ファイルにトップレベル宣言が1つも無い**ことを AST で確認していること（module のトップレベル
  `const`/`function` は private、classic script のそれは global。宣言が無ければ名前解決は1つも変わらない）。
  `tests/r175-checks.test.mjs` が毎回再検証する。
- **実行時依存は npm から取る**（CDN の浮動タグは使わない）。`src/vendor.js` が
  `maplibregl` / `turf` / `topojson` / `mlcontour` / `supabase` / `sb` を同じグローバル名で
  再公開するので、呼び出し側は1行も変わらない。KaTeX と html2canvas は動的 import で別チャンク。
  `package.json` の `dependencies` がアプリに入る依存の唯一のリスト。
  ⚠ **他のモジュールが自分で動的 import する依存も、そこに宣言する。** 警報レイヤーの
  `polygon-clipping`（「発表なし」の形＝区分 − 発表 と、灰色斜線の形＝国 − この層が答えている単位 の
  2つを計算する。`js/world-packs.js` が最初にレイヤーを点けたときに別チャンクで取る）は turf の下にも
  入っているが、**推移的に届いているものは依存ではない**——上流が版を変えれば黙って消える。
- **Supabase の接続先は `src/vendor.js`**（`window.SUPABASE_URL` / `window.SUPABASE_ANON_KEY`）。
  `admin.html` はバンドラを通らない別ページなので、同じ2つを自分のインライン script で持つ。
  どちらも publishable(anon) キー＝**公開前提**で、保護は RLS が行う（§17）。
- **ソースマップは本番に出さない**（`vite.config.js` の `build.sourcemap` は false）。
- **ビルドは自分を計測する。** `vite.config.js` の `buildReportPlugin()`（`scripts/build-report.mjs`）が
  Rollup の最終グラフから **eager**（`index.html` のエントリ＋その静的 import の推移閉包＝Vite が
  `modulepreload` を出す集合）と **async** を導出し、raw / gzip / brotli とモジュール別の内訳を
  `.perf/build-report.json`（追跡対象外）へ書く。`npm run check:perf`（`scripts/perf-budget.mjs`）が
  それを `tests/perf-baseline.json` と突き合わせる。
  ⚠ **2つの半分は別々の規則で見る。** eager は**両方向のラチェット**——増えれば退行、減ったのに
  天井が残っていれば「天井が古い」として落とす。async chunk と `dist/` の合計は**天井だけ**で、
  縮むのは自由。**最大 chunk は Cesium（4.7 MB）だが既定セッションは1バイトも取らない**ので、
  「いちばん大きい chunk」を見るゲートは起動費用について何も言っていない。
- ⚠ **同じデータを2つの形で配ってはならない。** `data/` はディレクトリごと `dist/` へ複写されるので、
  1つのデータセットの2表現がどちらも入りうる。`data/ecoregions_2017.js`（`window.__ECOREGIONS_2017`）は
  隣の `.geojson` と**バイト同一**なので `STATIC_EXCLUDE` で配布から外してある——リポジトリには
  残す（消したのは配布であって記録ではない）。`js/layer-packs.js` の `window.__loadEcoregions` は
  `fetch` を先に、`<script>` を後に試す。
- ⚠ **`resolve.alias` は dev サーバに届かない。** 依存の事前バンドルは esbuild が自分で解決するので、
  `satellite.js` の Emscripten 入口（top-level await）にそのまま当たって `vite` が起動できない。
  `optimizeDeps.exclude` に置いて、dev もビルドと同じ alias 経路を通す。

### 1.2 地図エンジン

- 既定のレンダラは **MapLibre GL JS**（Mercator 平面 ＋ Globe 投影）。
- **レンダラの名を出してよいファイルは `js/geo-engine.js` ただ1つ**（アダプタ＋`IntMapGeoEngine`
  ファサード）。他の js/ 全ファイルは `const GE=()=>window.IntMapGeoEngine;` 経由で
  **契約**（`layers` / `camera` / `coords` / `scene` / `ui` / `render` / `input` / `events`）だけを見る。
  `npm run check:engine` が AST でこれを固定する（構文解析なので、コメント中の "the map. When…" では
  誤検知せず、ローカル変数 `map` も依存とみなさない）。
  ⚠ 契約に無い関数名をアダプタにだけ足すと「2つ目以降」が静かに落ちる——**アダプタに足したメソッドは
  必ず契約側にも出すこと**。
- **アダプタはビューごとのファクトリ**（`makeMapLibreAdapter`。状態もビューごと）で、
  追加ビュー（`js/compare.js` の比較地図・`js/playground.js`・`js/flight-sim.js` のミニマップ）は
  `ui.createSubView` が返す同じ形を使う。マーカー／ポップアップは**ビューに**付く
  （`ui.addMarker` / `ui.addPopup`）。生ハンドルを取り出す `ui.createView` は `js/app-body.js` の
  1回だけに限定されている。
- **Cesium は設定で選べる第2エンジン**（設定 ▸ 地図の動作 ▸ 地図エンジン。Atlas の `engine`
  アクションからも切替可）。カバー範囲はベクタタイルを含めて MapLibre と同等。
  - `js/cesium-style.js` — style 言語の**解釈器**（式・フィルタ・色・旧 stops 形式）。
    **純粋**（Cesium も DOM も参照しない）ので `tests/r180-checks.test.mjs` が Node で直接検証する。
  - `js/cesium-layers.js` — プロバイダ＋描画。raster は `ImageryLayer`（brightness/contrast/saturation/hue が
    ネイティブ）、fill/line/circle/symbol/fill-extrusion はエンティティ、heatmap/hillshade/color-relief は
    同じ DEM から計算したラスタ、terrain は**同じ terrarium タイル**から `HeightmapTerrainData`。
    **キーレス（Ion トークン不要）**。⚠ `ImageBitmap` は `UNPACK_FLIP_Y_WEBGL` を無視するので、
    テクスチャ化は必ず `toTexture()` を通す。
  - `js/cesium-vector-tiles.js` — タイルピラミッド（cover/fetch/decode/cache）。`@mapbox/vector-tile` が
    タイルを GeoJSON にする。要るタイル集合は**今の視界が覆うタイル集合**で決める。
  - `js/cesium-input.js` — **操作は MapLibre の操作**。8ジェスチャ（pan / rotate / pitch / wheel /
    box zoom / 矢印キー / ctrl ドラッグ / shift ドラッグ）の定数と式は同梱の `node_modules/maplibre-gl`
    のハンドラ実装そのものから取っており、`tests/r182-checks.test.mjs` が両者を突き合わせる
    （＝依存を上げて操作感が変わると落ちる）。カメラは必ず `setCamera()` 経由で、ジェスチャ1回につき
    `movestart…moveend` は1組。
  - `js/cesium-engine.js` — アダプタ本体（`makeMapLibreAdapter` と**同じメソッド集合**）。
  - `js/engine-select.js` — DOMContentLoaded より前に選択。既定では**何も publish しない**。
  - **既定セッションは 1 バイトも払わない**：cesium の import は動的、main チャンクから cesium
    チャンクへの参照 0、modulepreload 無し。**切替は再読み込み**（レンダラを跨いでシーンは移せない）で、
    パネルは**実際に描画しているエンジン**を保存値とは別に表示する（無言のフォールバックを作らない）。
  - **Cesium が答えられない物は答えないと言う**：`solid3d:false`、`demContourSource()` は null
    （maplibre-contour は MapLibre の名前空間を要求する）。呼び出し側は既存のフォールバックを取る。

### 1.3 バックエンド・言語

- バックエンドは **Supabase**（DB・認証・Edge Functions）。詳細は §6。
- **対応UI言語は9つ**: 英語 (en) / 日本語 (jp) / ドイツ語 (de) / ロシア語 (ru) / スペイン語 (es) /
  繁體中文 (zh) / 简体中文 (zh-hans) / フランス語 (fr) / 韓国語 (ko)。
  **9言語すべてが、計測されている全ての面で 100%**（`npm run check:i18n`）。地名ラベルも全言語対応。
  詳細と「言語を1つ増やすときにやること」は §10。

---

## 2. 主要機能一覧 (Features)

**「何ができるか」の一覧は [`PRODUCT.md`](PRODUCT.md) が正本**（§3 主要機能）。製品としての
目的・対象・優先順位・非目標と同じ場所に置いてある——「何のためにあるか」と「何ができるか」は
同じ問いの両面で、離せば片方だけが古くなるため。

このファイルが答えるのは**それがどう組み上がっているか**のほうで、内訳は §4（ニュース）・
§5（AI）・§6（Supabase）・§7（地図とレイヤーの契約）・§8（UI）・§9（モバイル）・§10（多言語）と、
[`docs/MAP-LAYERS.md`](docs/MAP-LAYERS.md)（レイヤー実装の詳細）・
[`docs/FILES.md`](docs/FILES.md)（ファイル台帳）にある。

---
## 3. ファイル構成 (Files)

**ファイル台帳の正本は [`docs/FILES.md`](docs/FILES.md)。** `js/` だけで 151 本あり、1行説明を
全部ここに置くと仕様書の 4 分の 1 が台帳になるので分けた。節番号は向こうでも `§3.1`〜`§3.13` の
ままで、他の文書からの `§3.x` 参照はそのまま通る。`node scripts/arch-files-check.mjs --check` が
`js/` の実体と台帳を突き合わせる。

ここでは**置き場所の規約**だけを述べる。

- **リポジトリのルートがサイトそのもの**。`index.html` が頂点にあり、`css/` `js/` `src/` と
  静的アセット（Köppen ラスタ・国旗 webfont・`sw.js`・`data/`・`admin.html`・
  `science.html` / `sources.html` / `privacy.html` / `terms.html`）が横に並ぶ。
  `vite.config.js` の `STATIC_ASSETS` が「Rollup を通さずそのまま配るファイル」の**明示リスト**で、
  `tests/r175-checks.test.mjs` が、参照されているのにリストに無いアセットで落ちる。
- **`js/`** — アプリ本体。`js/app-body.js` が中核（`IM_HOST`）で、他は主題ごとのモジュール
  （地図の表面／データレイヤー／ニュース／Atlas と AI／分析とシミュレーション／宇宙／シェルと
  アカウント）。ファイル単位の役割は `docs/FILES.md` §3.3〜§3.10。
- **`src/`** — バンドラ側の入口だけ（`main.js` が `js/*.js` を index.html と同じ順で import し、
  `vendor.js` が npm 依存を同じグローバル名で再公開する）。アプリのロジックは置かない。
- **`css/`** — 3 本（アプリ本体・静的ページ・フォント）。
- **`data/`** — 同梱データ（ビルド時に生成した軌道要素・海流・星表など）。生成元は
  `scripts/build-*.mjs`。詳細は `docs/FILES.md` §3.11。
- **`supabase/`** `docs/` `scripts/` `tests/` `.github/` — 運用側。詳細は `docs/FILES.md` §3.12。
- **`index.html` を分割するときの手順**は `docs/FILES.md` §3.13 が正本（`IM_HOST` の規約と、
  「いつ取りに行くか」という第2の軸を含む）。**分割は必ずその手順に従うこと。**

---
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

- 起動時 `fetchData()`：
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
- ピンの「主題 (Subject) / 発信元 (Publisher)」切替は `current_news` の両座標を使う**表示専用トグル**
  （AI 呼び出しは無い）。

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

---

## 5. AI APIの使い方と鍵管理 (AI usage & key policy)

- **Atlas の人格は正式仕様であり、正本は `js/atlas-persona.js` 1本だけ。**
  名前・立場・名前の由来・性格・対人姿勢（距離感と説明量は相手に合わせ、**敬語は常に自然な敬語**）・
  事実優先・意見の出し方・感情表現・自己設定の扱い・内部指示の非開示——これらは
  **そのファイルの中の文章そのものが仕様**で、この文書はここに書き写さない
  （**同じ事実を2か所に書くと片方だけが古くなる**——`npm run check:docs`）。
- **20 本すべての system prompt が `personaPrompt('<その呼び出しの役割>')` で始まり、
  各呼び出し側はタスク規則しか足さない**（`atlas-console` 9・`news-ui` 3・`analysis-panels` 2・
  `app-body` 2・`atlas-geo-resolve` 2・`monitor-run` 1・`refresh-news` 1）。モードは 2 つ——
  出力が人の読む文章になる経路は全文、出力が機械可読な JSON だけの経路（地域の輪郭・
  行政単位の解決・ニュースの地点解析・記事翻訳・地名検証）は `{mode:'internal'}` で
  身元・事実規律・非開示だけを渡す。
  サーバー側の2本は Edge Function がリポジトリ外を import できないため
  `supabase/functions/_shared/atlas-persona.js` の**生成された写し**を読む
  （`node scripts/sync-atlas-persona.mjs`・`npm run check:static` が差分を落とす）。
- **鍵はサーバー（Edge Function）だけが持つ。** ブラウザは AI プロバイダに直接アクセスしない。
  モデル選択の UI も無い（利用者はモデルを選ばない）。
- **`ai-proxy`＝アカウント制AI。** `verify_jwt` に加えて関数内でもユーザーを検証し（未ログインは 401）、
  プラン別の1日上限を `increment_ai_usage` で**原子的に消費**する。
  上限は free 10 / plus 50 / pro 200 / unlimited 実質無制限。
- **入力の上限は本文を読む前に効かせる**：prompt は 24,000 文字、**system は 160,000 文字**、
  画像は最大4枚・合計 12 MB。鍵・prompt・JWT はログに出さない。
  ⚠ **system が別枠なのは、それが利用者の文ではなくアプリ自身が組む操作カタログだから。**
  両者が 24,000 を共有していた間、プランナーの system prompt（実測 80,495 文字）は
  **29.8% しか届いておらず**、残り 56,495 文字——数十のアクション・レイヤー一覧・
  モジュール一覧・コントロール一覧——はモデルにとって存在しなかった。
  `scripts/atlas-catalog.mjs` はソースを読むので緑のままだった
  （**カタログの検査がクライアントで止まっていると、届いたかではなく書いたかを測る**）。
- **責任分離** — クライアントは**タスク種別**と `webMode`（`off|auto|required`）を送り、
  `ai-proxy` がタスクごとに**出力トークン上限**・**構造化出力**・**Web 方針**を選ぶ。
  タスクは allowlist で、それ以外は 400 になる：
  `atlas_plan` / `map_report` / `analysis` / `free_text` / `json_extract` / `brief` /
  `geo_verify` / `geo_resolve` / `research_map` / `vision_read`。
  出力上限は 500〜3,200 トークン（絶対上限 5,000）。OpenAI 経路の `reasoning.effort` は
  `atlas_plan` / `analysis` / `geo_resolve` / `research_map` が medium、他は low。
- **プロバイダは `AI_PROVIDER`**（`anthropic` | `openai` | `gemini`。既定 anthropic）。
  OpenAI 経路のモデルは `AI_MODEL` シークレット（現行 `gpt-5.6-terra`）で、到達できない場合だけ
  既知の `gpt-5.6-luna` に**1回だけ**フォールバックする。
- **障害耐性** — 400 は**フォールバック階段**（tool_choice 解除 → JSON モード解除 → ツール解除）で降格する。
  Web 付き呼び出しは長めの期限を持ち、空応答（推論が予算を食い切った場合）は予算を増やして1回再試行する。
- **プロバイダの失敗は分類して 502/503 で返す**
  （`provider_rate_limit` / `provider_quota` / `provider_malformed` / `provider_empty` /
  `provider_blocked` / `provider_unavailable`）。**429 は IntMap 自身の1日上限専用**。
  ⚠ **上流のエラー本文は呼び出し元に返さない**（コード語だけを返す）。
- **Web 検索は本物のときだけそう言う。** `webMode:"required"` は検索を強制し、応答に含まれる検索呼び出しの
  件数から `webUsed` / `webSearches` を返す。クライアントは**実際に検索した時だけ**
  「ライブWeb検索」と表示する。
- **ニュース地点解析AI** — `refresh-news` が同じ鍵・同じ `AI_PROVIDER` 規約でサーバー側実行する
  （**利用者の枠は消費しない**＝運用者の鍵）。

---

## 6. Supabase（テーブル・Edge Functions・環境変数）

**Project ref:** `vpekfwdpurzejrrmacac`。公開 (anon/publishable) キーは `src/vendor.js` と
`admin.html` にあり、**公開前提**で保護は RLS が行う（§16・§17）。

### 6.1 テーブル

**表の一覧・列・関係・RLS 方針の正本は [`docs/DATABASE.md`](docs/DATABASE.md)**（pgTAP による
実証手順も同じファイル）。現在 **20 表**（`profiles` / `current_news` / `geo_pins` / `favorites` /
`user_prefs` / `dashboard_cards` / `ai_usage` / `community_*` 5 表 / `feedback` / `bug_reports` /
`donations` / Area Monitors の 5 表）。

**DB の設計図は `supabase/migrations/` だけ**（全テーブル・制約・index・RLS・grants・トリガ・RPC）。
本番へ手で SQL を流さない。手順は [`docs/MIGRATIONS.md`](docs/MIGRATIONS.md)。
### 6.2 Edge Functions — **8本**（`_shared/` は関数ではない）

> ⚠ **8本すべてを `supabase/config.toml` に `[functions.*]` として宣言する。**
> ファイルのヘッダコメントに書いた deploy フラグは設定ではない。
> `supabase/functions/_shared/` は `newsgeo.js` と `relay-guard.js` を置くライブラリ用ディレクトリで、
> import した関数の中に CLI がバンドルする。`[functions._shared]` は書かない。

- **`ai-proxy`** … アカウント制AI（§5）。`verify_jwt` あり。
- **`refresh-news`** … ニュース取得＋AI地点解析＋書き込み（§4.1）。`--no-verify-jwt` で公開だが
  **fail-closed**：`REFRESH_SECRET` 未設定なら全リクエストを拒否する。秘密は `x-refresh-secret`
  **ヘッダのみ**（クエリ文字列不可）・**定数時間比較**・POST のみ。
- **`monitor-run`** … Area Monitors の定期実行（`--no-verify-jwt` ＋ 自前の fail-closed 認証、
  `MONITOR_SECRET`）。
- **`delete-account`** … 呼出ユーザ自身のアカウントと全データを**ハード削除**する
  （`verify_jwt` あり＋関数内でも検証・`confirm:"DELETE"` 必須）。所有テーブルを**外部キーから発見**し、
  **1トランザクション**で削除し、**削除後に数え直して**から Auth ユーザーを消す。
  ⚠ **どれか1つでも失敗したらアカウントは消さない**（fail-closed）。
- **`sv-cov`** … ストリートビュー・カバレッジ svv タイルの **ACAO 付与プロキシ**（秘密なし）。
  **厳格 allowlist**（`mts0-3.google.com/vt?…lyrs=svv` ＋ 整数 x/y/z のみ・空タイルは透明 PNG）
  ＝オープンプロキシではない。
- **`alerts-relay`** … 各国気象機関の警報フィードの **ACAO 付与＋要約**（秘密なし）。
  allowlist は `feeds.meteoalarm.org`（欧州の MeteoAlarm）・`www.nmc.cn`（中国気象局）・
  `severeweather.wmo.int`（WMO の CAP 登録簿。`/f/wfs` と `/json/*.json` だけ）・
  `publicalert.pagasa.dost.gov.ph`（フィリピン）。
  ⚠ **MeteoAlarm は要約する**——1国の CAP JSON が 10 MB 規模（多言語の重複）なので、
  `?ma=<国>,…&lang=…` で複数国をまとめて取り、**地域ごとの行**（最悪階級・災害名の一覧・
  CAP が持っていれば `<polygon>`）に落として返す。要約は射影であって編集ではない。
  上限は1国 400 区域で、`areaTotal` が実数を述べる。
  ⚠ **フィリピンは `?ph=1`**。Atom の索引から地域ごとの最新1件を採り、その CAP を読んで州ごとの行にする。
  「フィリピン責任領域 (PAR)」の矩形と `expires` を過ぎた速報は落とす。
  ⚠ 上流の期限は 45 秒（上流の悪い日より短い制限時間は生きたフィードを落とす）。キャッシュは 15 秒。
  ⚠ カナダ ECCC は ACAO を返すので **relay を通さない**（要らない relay は落ちうるものを1つ増やすだけ）。
- **`cable-geo`** … TeleGeography 海底ケーブル GeoJSON（2 URL 固定 allowlist）の ACAO 付与中継。
- **`news-relay`** … Google News RSS の ACAO 付与中継。`news.google.com` の `/rss/search` と
  `/rss/headlines/section/topic/<TOPIC>` の**2エンドポイントだけ**。

⚠ **4本の無認証中継（`alerts-relay` / `cable-geo` / `news-relay` / `sv-cov`）は
`_shared/relay-guard.js` を共有する。** URL allowlist、**GET 限定**、**期限**（`AbortSignal.timeout`）、
**バイト上限**（`content-length` とストリーム読み出しの両方——上流は length を返さないことがある）、
**Content-Type** 判定、そして**外向きエラーはコード1語**（上流の例外文言・スタックは返さない）。
⚠ **公開レイヤーなのでログイン必須にはしない**（署名前の読者に地図を出せなくなる）。

### 6.3 環境変数（Edge Functions の secrets）

- 自動注入: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- AI: `AI_PROVIDER`（anthropic|openai|gemini）, `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` /
  `GEMINI_API_KEY`, `AI_MODEL`（任意）
- refresh-news: `REFRESH_SECRET`（**必須**。未設定なら関数は全リクエストを拒否する）,
  `NEWS_AI=off`（任意・AI を止めて辞書だけにする kill-switch）
- monitor-run: `MONITOR_SECRET`
- Gemini 経路のみ: `GEMINI_SEARCH_ENABLED`（既定 OFF）

---
## 7. 地図・レイヤー・Globe・ウィジェットの構造

**レイヤーの実装詳細は [`docs/MAP-LAYERS.md`](docs/MAP-LAYERS.md) が正本**——§7.1 気象・災害警報、
§7.6 ラベル、§7.7 レイヤー個別の注意、§7.8 地形と水、§7.9 物理シミュレーションの不変条件、
§7.10 気象モデル（ECMWF IFS）・風・レーダー。**節番号は向こうでも同じ**なので、他の文書からの
`§7.x` 参照はそのまま通る。

ここに残すのは**契約**——「レイヤーを1本足すときに必ず読むもの」だけである。
### 7.2 レイヤー欄の分類・7.5 地図の初期化

**どちらも [`docs/MAP-LAYERS.md`](docs/MAP-LAYERS.md) へ移した**（節番号は同じ）。§7.2 は 18 の棚と
「新しいレイヤーはどの棚に入るか」、§7.5 は基図・投影・初期カメラの組み立て。レイヤーを1本足すときは
あちらを開くほうが早い——`§7.1`〜`§7.10` のうち **§7.3 と §7.4 以外はすべてあのファイル**にある。

### 7.3 レイヤー・データ契約 `window.IntMapLayers`

- API ＝ `register` / `state` / **`sampleAt(lng,lat)`** / `featuresIn(bounds)` / `legend` / `time` / `source`。
- **新しいレイヤーを足したら、同じ変更の中でここへ登録すること**（これが Atlas から使えるかどうかを決める）。
- 消費側は Atlas の `stateContext` に入る実データ行・`layerData` アクション・`analyze` の証拠集め。
- **凡例の名前は「表」で渡す。** `window._registerLayerOpacity(id, names, …)` の `names` は
  **言語ごとの配列**であって解決済み文字列ではない（文字列を渡すと `names[1]` が2文字目になる）。
  受け側でも文字列を正規化する。
- **段彩の凡例は連続、分類の凡例は帯。** 世界銀行系の塗り分けはグラデーション帯で、停止は**値の位置**に
  置く（`interpolate` は値について線形）。タイルのサムネイルも同じランプを層から読む（`IntMapWB.rampOf`）。
- **1分類＝1色。** `js/layer-packs.js` の `paletteOf(n)` は手で選んだ30色を使い切ったあと
  **黄金角 137.508°** で色相を進め、明度・彩度を3通り循環させ、既出の色なら明度をずらして必ず一意にする。
  実測: 89言語 → **89色・重複0**。`IntMapCulture.palette(n)` / `.colourOf(k,cat)` が公開する。
  ⚠ **同じ語族は同じ色相**（`js/layer-packs.js` の `FAM_COL`）。セルビア・クロアチア・ボスニア語などの
  5標準は同一色相の明度差で並び、その色は生成パレットから**予約**して他言語に渡らないようにする
  ——一意なだけでは足りない。**無関係な色は「無関係だ」と主張してしまう。**
  ⚠ **見本が区別できない鍵は鍵ではない**（同じ見本が3行に付くと、その色に付く名前は最初の行のものになる）。
- **長い凡例は `.im-more`（`<details>`）で畳む**（`css/intmap.css`）。

### 7.4 Chronos（統一時間）と「年」

- **時刻はマスタークロック `window.IntMapTime` 1本**。⚠ **2つ目の時計を作らない。**
- **風の場は「画面の緯度帯 → 全体」の2段で読む。** ECMWF IFS は縮約ガウス格子なので読み取りは緯度でしか
  絞れず、`bandFor` は視野が緯度 120° を超えると `null`（＝地球全部）を返す。起動時の視野は地球なので、
  粒子が動き出す前に **13,199,360 標本・約 18 MB** を読んでいた（実測、初回描画まで 14.5 秒、日本上空へ
  寄せた状態で 74.9 秒）。全球読みは**帯域律速**で、レンジを並列化する暖機（`prefetchVariable`）は縮められる小さな
  レンジが無いので効かない（実測 A/B: 素 16.4/7.8 秒 対 暖機 7.8/9.4 秒）。
  → 最初は `bandNear`（画面中心の±30°まで・地点読み出しが使う帯）を読み、**その裏で視野全体の帯を
  読んで差し替える**。最終的な絵・標本間隔・ファイルは同じ。粒子は読めている帯の中にだけ撒く。
- **読み込みの列は 1 本だが、レーンは 2 本ある。** SDK のリーダーが 1 つなので `.om` の読み込みは
  一度に 1 本しか走れない（別ファイルを同時に読むと互いを壊す）。そこへ **読み手が待っている読み込み**と、
  **このモジュールが自分で始める読み込み**（視野へ広げる段・次の時刻の暖機）が同じ先着順で並んでいた。
  世界ズームでは後者が両方とも地球を要求するので、時刻の 1 ステップが毎回 18 MB の後ろに並ぶ。
  実測 **7,050 / 7,942 / 8,270 ms**（手元にある時刻は 45 ms）。
  ⚠⚠⚠ **ただし、この改修は時刻変更を測れるほど速くしていない。** 「改修後 1,501 / 684 / 1,665 ms」は
  **私のブラウザの HTTP キャッシュ**だった——同じオリジンで何度も走らせた結果、その時刻の `.om` の
  バイト範囲が既にキャッシュに載っていた。**一度も訪れていない時刻**で前後を測り直すと
  **前 6,849 / 6,357 / 6,858 ms ／ 後 6,699 / 6,779 / 6,784 ms＝差は無い**。
  冷たい1段は**帯のレンジ読み込み（約6.5秒）が支配的**で、列の順序では動かない。
  ここにある変更は**構造として正しい**（世界ズームで暖機が地球を要求するのは誤り・進行方向を無視
  するのも誤り・読み手の読み込みが自分の背景読み込みの後ろに並ぶのも誤り）が、**速さの主張はしない**。
  ⚠ 走り始めた読み込みは中断できないので、**背景の読み込みを小さく保つ**ことが対になる:
  暖機は「次のステップが実際に読む帯」（`nearBand()`）を、**進行方向の隣の時刻**について暖め、
  地球そのものになる段は読み手が **2.5 秒**静止してからでないと始めない。
  詳細は [`docs/MAP-LAYERS.md`](docs/MAP-LAYERS.md) §7.10。
- **時刻を変えても地図は空にならない。** 色面は2つのスロットを交互に使い、**新しいスロットは「タイルが
  1枚でも届いた」ときにだけ**表に出す（`e.tile && e.isSourceLoaded`）。`isSourceLoaded` は「まだ1枚も
  頼まれていないソース」でも真になるため、これを条件にすると**空のスロットを表に出して古い方を消す**。
- **風の色の凡例は 0–30 m/s まで。** 配色表そのものは Windy の `RGBA()` に合わせた 27 停留点のまま
  のままで、104 m/s まで塗る。凡例が読む範囲だけを 30 m/s で切り、**上端の目盛りに `+`** を付けて
  「この先も続く」と言う（`IntMapECMWF.legend().capped`）。
- **気象系の時刻 UI はすべて離散である。** ECMWF 系はモデル自身の index を `step=1` で刻み、潮汐は
  海洋モデルが公表する**毎正時**に丸める（`datetime-local step=3600`・`snapHour`・1/4周期ボタンは 6 時間）。
- **結線は<b>片方向</b>である。** Chronos が動けば気象モデルの軸も動く（`IntMapECMWF.followClock`
  を購読）——「Chronosで時間を変更したら、IntMap内の対応するすべての要素をChronosの時間に合わせる」。
  逆は結線しない（`_pushClock` は no-op）：予報を1時間動かしても、ニュース・歴史的国境・昼夜境界・
  国別統計は動かない。各気象レイヤーは自分の凡例に自分の時刻 UI を持ち続ける
  （`docs/MAP-LAYERS.md` §7.10）。⚠ 選ばれた瞬間がモデルの予報窓の**外**なら軸は動かない
  （`covers()`）——1972 年へ旅することは予報の要求ではない。
- **時刻タブは1つ**。⚠ かつて「時刻」と「予報」の2つのタブがあり、
  「いま何時を見ているか」という同じ問いが2つのボタンの向こうにあった。統合の条件は上の片方向
  結線で、**時刻タブの中の再生操作もスライダーも書くのはマスタークロックだけ**である
  （モデルの index を裏から書かない）。日付ピッカーの上限はモデルの最終有効時刻まで伸びる。
- ⚠ **「過去／未来」を決める関数は<b>1つ</b>**（`sideWord`）。パネル内のバッジと折り畳みボタンの
  副題は**同じ主張**をする2つの要素で、片方だけを直すと同じフレームで食い違う（実測、
  時計を2日先に置いて `#ntl-open-s`「未来を表示中」・`#ntl-badge`「過去を表示中」）。
- **読み手が見る名前は Chronos**（パネル・折り畳みボタン）。⚠ **契約名 `window.IntMapTime` は変えない**——
  30 近いファイルがそう呼ぶ。カーネル自身は `js/chronos.js`（import 時に公開されるので、
  購読する側より必ず先に存在する）。UI は `js/news-timeline.js`。
- **どの時計で読み書きするか**を Chronos のプルダウンが持つ（端末／UTC／地図中心の標準時／主要24タイムゾーン）。
  ⚠ **これは瞬間ではなく「書き方」を選ぶ**。決めるのは2つだけ——パネルが瞬間をどう印字するかと、
  時刻タブの `14:30` をどう瞬間に読み戻すか。`setHours` は端末ローカルに書くので、逆変換は
  **その瞬間のオフセットで1回補正する**（DST の境目が最初の推測を動かす）。
  「地図中心」はタイムゾーン層が既に持つ Natural Earth のポリゴンから読む（`window.IntMapTimeZones`）。
  **標準時**であり、そのデータに DST 規則は無い——選択肢自身がそう書く。
  ⚠⚠ **ポリゴンを取りに行く `ensure()` は<b>2つの扉から</b>呼ぶ**——読み手が選んだときと、
  **保存済みの設定が復元されたとき**。復元は change イベントを起こさないので、片方だけに置くと
  「前のセッションでこれを選んだ人」は永久に端末の時計を見せられる（実測：ニューヨークを中心に
  置いて `17:58 · UTC+09:00`）。⚠ そして**カメラに追従する**——「地図中心の」はいまカメラが
  どこにあるかについての主張なので、選んだ瞬間に一度計算した答えはパンするまでしか正しくない。
  ⚠ **`window.IntMapTimeZones` は<b>1つのオブジェクト</b>で、公開する側は必ず `Object.assign` で
  <b>足す</b>。** `js/layer-packs.js` には publisher が2つあり、片方が名前を**代入**していたため
  `ensure` / `ready` / `offsetAt` はページ上に存在しなかった（実測 `Object.keys()` は
  `['highlight','highlighted','clear']`）——「地図中心の標準時」は黙って端末の時計に落ちていた。
- **折り畳みボタンの2行目は「いま何を見ているか」**——ライブなら操作の案内、そうでなければ
  選んだ瞬間が**今より前か後か**（`過去を表示中` / `未来を表示中`）。⚠ 「タップ」とは書かない
  ——要素自体がボタンで、そう名乗ってもいる。
  ⚠ **「反映内容」の欄は無い。** どのレイヤーが選んだ瞬間で何をするかは、そのレイヤーの凡例の
  仕事である（同じ事実の2つ目の置き場は片方だけ古くなる）。
- **ライブ衛星も時計に従う**（`js/satellites-live.js`：SGP4 に渡す瞬間が `IntMapTime.when()`）。
  軌道要素の「古さ」も**そのフレームの瞬間**で測る。
- **年セレクタは層の上にもある**（`window._legendClockYear` — `js/data-layers.js`）。1人当たりGDP・
  人口密度・合計特殊出生率・国防費・国防費対GDP・HDI・貿易フロー・エネルギー構成・作物の凡例に年
  セレクタがあり、**`window.IntMapTime` を読んで書く**。行は自分の年を持たない。
  範囲は各出典自身のもの（Maddison 1900–／世界銀行 1960–／BACI 1995–2024／OWID は読み込んだ CSV から実測）。
- ⚠ **「最新値」で塗った塗り分けは比較になっていない**（各国の最新の非欠測年が違う）。全系列を取り、
  1年ずつ描く。既定は**被覆が最大の90%以上ある中で最も新しい年**で、凡例に年と報告国数を出す。
- **HDI は UNDP の年次系列**（`data/hdi-series.json`、`scripts/build-hdi.mjs`、193か国 × 1990–2022）。
  `js/time-countries.js` がマスタークロックに重ね、`window._imHdiYear` が**画面に出ている年**を持つ。
  1990 より前は `null`、最後の公表年より後はその列。凡例の年は**タイマーではなく `_imReapplyChoros`**
  （重ね合わせの後に走る再描画）から書き換わる。
- **国境・国家も時計に従う**（`js/time-borders.js` / `js/history.js`）。歴史 GDP・人口はマディソン・
  プロジェクト（`data/maddison.json`）。歴史的国家のクリックは**当時の名称・当時の記事**に解決する
  （現代のページへは決して飛ばさない）。
- **年次系列を持たない指標に、誤った年を付さない。** 公開系列が無いものは版を明示するだけにする。

### 7.5 ウィジェット基盤

**板そのものの不変条件**

- **サイドバーに出ているとき、板はそのサイドバーのスクロール領域である**
  （`.sidebar > .wgt-board` が `flex:1 1 auto; min-height:0; overflow-y:auto`）。
  Workspace ペインと携帯シートは自分でスクロールするので、そこでは板は二重にスクロールしない。
- **カードは DOM の順序どおりに敷き詰まる。** `packOrder(items, cols)` が dense 配置を**DOMの並びで**
  計算するので、見た目の順序と読み上げ順序が一致したまま隙間が埋まる（`grid-auto-flow:dense` は
  絵だけを動かすので使わない）。カードは**前にしか動かない**——後ろへ押し出すことはしない。
- **アカウント同期は板をモジュールから読む**（`IntMapWidgets2._active()` と `._payload()`）。
  保存キーを直接読まない。空の板（`[]`）も板として往復する。

サイドバーのウィジェット板は、**定義を1つのレジストリから供給する基盤**。1ファイルではなく責務ごとの
モジュールで、`js/widgets.js` は HOST との接続だけを持つ（ファイルの一覧は
[`docs/FILES.md`](docs/FILES.md) §3）。

- **レジストリ `window.IntMapWidgetCore`** — 定義（`id` は `family.variant`）・カテゴリ（9つ）・
  対応サイズ・設定スキーマ・更新方針・ローダ・**サイズ別レンダラ**・操作・旧IDの別名を1つの形で持つ。
  ⚠ **既定の設定値は関数**（`defaultConfig(context)`）。カードが作られる瞬間に評価されるので、
  ファイル内のどこに書いたかに依存しない。
- **WidgetContext** — レンダラが知ってよいことの全部（言語・テーマ・単位・位置情報の許可状態・
  地図の中心と範囲・選択中の国／地点・有効レイヤー・Chronos・経路・監視・保存地点・オンライン状態）。
  ⚠ **レンダラはグローバルを直接読まない。** 渡されたものだけを読むので、純関数として検査できる。
- **状態モデル**は12状態（`idle` / `loading` / `ready` / `refreshing` / `stale` / `offline` /
  `permission-required` / `permission-denied` / `empty` / `rate-limited` / `temporary-error` /
  `permanent-error`）。**それぞれが理由を文で述べる**。⚠ **取得に失敗しても前回成功した値は消さない**
  ——値を保つ状態は `WC.keepsValue()` 1か所で定義する。
- **サイズ S / M / L は論理サイズ**で、列と行の数（S=1×1・M=2×1・L=2×2）と**別々のレンダラ**を持つ。
  列数はウィンドウではなく**盤面の実測幅**から決まる（`ResizeObserver`）ので、同じセッションで
  サイドバーの1列と Workspace の広い面の両方に正しく答える。
  ⚠ `grid-auto-flow:dense` は使わない——DOM を動かさずに見た目だけ並べ替えるため、キーボード操作と
  読み上げの順序が視覚順と食い違う。
- **保存は `intmap_widgets4`**（`{v:4, items:[…]}`）。`intmap_widgets3` は**読むだけで、消さない**
  ——それが世代バックアップそのもので、v4 が壊れたときの復元元になる。移行は**何度実行しても同じ
  結果**になるよう、インスタンス ID を旧 `u` から取り、`createdAt` を位置から導く。
  `window.IntMapWidgets2._active()` / `._setActive()` は**旧来の `[{u,t,cfg}]` のまま**で、
  アカウント設定同期と前バージョンの端末が読める。サイズとスタックは旧形式に綴りが無いので
  併走する `widgets4` 側が運ぶ。
- **更新は `window.IntMapWidgetScheduler`** が `requestKey` 単位で行う。同じ鍵は**1要求**（飛んでいる
  Promise を共有）・TTL・stale-while-revalidate・`AbortController`・タイムアウト・**ジッタ付きの
  指数バックオフ**・同時実行数の上限。可視性は `IntersectionObserver` で見る。
  ⚠ **描画と取得は別の行為**——再描画は1件も要求を出さない。言語変更は**再取得ではなく再構成**、
  テーマ変更は CSS が担当する。
- **局所計算のカードは盤面で1本だけのティッカー**に購読する（`WC.tick('second'|'minute')`）。
  購読が0になるとタイマー自体が止まる。⚠ **定義の中で `setInterval` を開かない。**
- **スタック**は手動と Smart の2つ。Smart は `window.IntMapWidgetSmart` が文脈から**決定論的に**
  順位を付け（固定 → 重大警報 → 実行中の経路／監視 → 選択中の国 → 現在地 → 地図の範囲 → Chronos →
  時間帯 → 直近使用 → 通常）、**「なぜ表示されたか」を同じ計算から答える**。差が小さいときは
  前面のカードを動かさない（`MARGIN` / `SETTLE`）が、重大警報は即座に前へ出る（`URGENT`）。
- **追加は `window.IntMapWidgetGallery`**（モバイルはボトムシート／デスクトップはモーダル）。検索・
  カテゴリ・**実レンダラによるプレビュー**・サイズ切替・追加前設定。⚠ **プレビューは通信しないし、
  位置情報の許可も要求しない**——プレビュー用の context は位置状態を `prompt` に固定してある。
  実データはキャッシュにあるときだけ使い、無ければ宣言された見本を**見本と明示して**描く。
- **DOM は `WC.el()` だけが作る。** `innerHTML` へ至る経路が存在しないので、外部文字列がマークアップに
  なることがない。URL は**スキームの許可制**（http / https のみ）。
- **IntMap 固有のカードは既存の subsystem を読む**——警報は `IntMapWorld.alertsQuery()`（地図が塗るのと
  **同じ正規化済みの `feats`**）、経路は `IntMapRouting.summary()`（読み手が見ている代替経路から導出）、
  レイヤーは `window.IntMapDefaultLayers` とアプリ自身のチェックボックス経由の切替、ニュースは
  `HOST.newsFeatures`（`IntMapNewsGeo` の結果）。⚠ **カードが2つ目の真実を作らない。**
- **Atlas ブリーフィングのカードは AI を呼ばない。** 更新方針は `manual`、ローダ無し。
  読み手が Atlas に頼んだブリーフを `window.IntMapWidgetBriefStore.remember()` が**渡してくる**だけ。
- **スタイルは `css/intmap.css` の1節**（`--widget-*` トークン）。JS は `<style>` を作らない。
  ライト／ダーク・透明サイドバー・`prefers-reduced-motion`・`prefers-reduced-transparency`・
  `forced-colors` に答える。**通常状態のカードに外側のぼんやりした影は付けない**（内側のガラス縁だけ）。

#### 7.5.1 ネイティブ（WidgetKit）との境界

⚠ **これは Web ページの中のカードであって、iOS のホーム画面／ロック画面／StandBy のウィジェットではない。**
今回ネイティブアプリは作っていない。将来 WidgetKit の Extension を作るときのために、**何が共有でき、
何が再実装になるか**をここに1か所だけ書いておく（新しい文書は作らない）。

| 事項 | Web 側から共有できるもの | ネイティブ側で必要になるもの |
|---|---|---|
| **定義** | `id` / `family` / `variant` / `category` / `supportedSizes` / `defaultSize` / 設定スキーマ / 更新方針 — **JSON にできる部分**。`IntMapWidgetCore.all()` から書き出せる | 同じ id 体系を持つ Swift 側の `IntentConfiguration`。**レンダラは共有できない**（DOM を返す関数） |
| **表示** | 何を出すかの決定（S/M/L でどの情報を出すか）は仕様として共有できる | **SwiftUI で全面的に再実装**。`systemSmall` / `systemMedium` / `systemLarge` は本文の S/M/L と1対1に対応させる |
| **認証** | 無し。Web はブラウザのセッションを使う | App Group ＋ Keychain 共有。**Extension は独自にトークンを持つ**必要がある（アカウント制 AI とアカウント同期はログインが要る） |
| **位置情報** | 無し | Extension 自身の `NSLocationWhenInUseUsageDescription`。**Web の許可状態は引き継げない** |
| **キャッシュ** | `intmap_widget_cache1` の**形**（requestKey → {at, ttl, data}） | App Group の共有コンテナに同じ形で置く。Extension はネットワークに長く居られないので、**本体アプリが書き、ウィジェットは読むだけ**にする |
| **更新** | `refreshPolicy`（`minIntervalMs` / `staleAfterMs` / `cacheTtlMs`） | **WidgetKit の timeline に翻訳する**。⚠ OS が更新回数を決めるので、`interval` は「希望」であって保証ではない——`stale` の表示（何分前か）は Web 以上に重要になる |
| **操作** | `actions` の一覧と、それぞれが何をするか | **ディープリンク**（`intmap://widget/<action>?…`）。カード内で完結する操作は Extension では実行できず、本体アプリを開く形になる |
| **プライバシー** | 出典・取得先・保存先は `js/legal-text.js` が正本 | ⚠ **App Store のプライバシー表示は Extension のネットワーク利用も含む。** データの流れを変えたら法務文面も同じ変更で直す（`CONSTITUTION.md` §6） |

## 8. UI/UX の構造

### 8.1 画面の骨格

- **サイドバー（左）**：タブ（News / Companies / Countries / Atlas）、検索、ニュースフィード／
  企業ランキング／Atlas。
  ⚠⚠⚠ **左サイドバーには2つのレイアウトがあり、地図の中心の合わせ方が違う**（設定「Sidebar appearance」・
  `js/sidebar-style.js`）。**不透明**では `.operation-room` の flex 列なので **canvas 自体が狭まり**、
  中心は既に可視領域の中心にある——ここで補正すると**二重にずれる**。
  **フロスト2種**（`body.sidebar-glass`）では `.map-container{position:absolute;inset:0;width:100%}` で
  **canvas は全幅のまま**サイドバーが上に重なるので、camera padding の `left` に**可視幅**を書く。
  ⚠ 折り畳みは `width` を残して負マージンで外へ出すだけなので、幅ではなく**状態**を読む。
  ⚠ `bottom` は携帯シートの持ち物なので**書く前に読む**。⚠ **値が変わったときだけ書く**
  （レイヤートグル・テーマ変更・設定保存でカメラを動かさない）。
- **マップ上コントロール（右上）**：Map/Sat、Flat/Globe/3D/コンパス、Grid、Measure、Radius、Layers。
  コンパスの**右クリック**で方位・仰角・ズームを数値入力できる（デスクトップのみ）。傾き上限が
  「無制限」のときは仰角欄が 0〜360° を受け付け、180° 超は方位を反転した等価な視線に解決される。
- **ポップアップ類**：国情報カード（`country-info`）、国詳細（`country-popup`）、ピン／地名ポップアップ、
  凡例（ドラッグ可）。
- **レイヤーパネル**：`reorganizeLayerPanel()` が DOM を毎回並べ替えて分類する（§7.2）。
  **Active layers** は `_refreshActiveLayers()` がオン中のレイヤーをチップで出し、常に**上部 sticky**の
  先頭要素にいる（固定高1行の横スクロール。空でも "(0)" で常時表示＝高さが動かない）。
  ⚠ `reorganizeLayerPanel()` は DOM を大量に並べ替えるので、タップ中に走ると行がずれて誤タップの原因になる。
- **ウィンドウの重なり順**は `bringToFront` が1か所で決める（インラインで z-index を書かない）。
- **テキストに影を付けない**（`text-shadow:none` を徹底する）。

### 8.2 Panels タブ（ドック）

設定「凡例・ツール窓の表示」→「サイドバーのタブにまとめる」（既定オフ）。実装は `js/window-manager.js`。

- **入るのは「オンになっているもの」だけ。** 判定は所有者が書く**インライン `display`**
  （`js/data-layers.js` は凡例を `legend.style.display='flex'/'none'` で開閉する）。
  MutationObserver が `style` / `class` / `hidden` を**要素ごとに**見ており、**オフにすると地図へ戻る**。
- **ドック中はドラッグもリサイズもしない。** ⚠ **ドラッグ実装は2つある**——`js/window-manager.js` の
  `makeDraggable` と `js/data-layers.js` の `wireDrag`（凡例専用の委譲ドラッグ）。**両方**が
  `im-docked` クラスを見る。⋮⋮ のグリップは CSS で隠す（嘘をつく余地を残さない）。
- ⚠⚠⚠ **辺のリサイズは要素の listener、角のリサイズは document の capture。** `border-radius` は
  **当たり判定も切る**ので、丸い角の内側数 px では `elementFromPoint` が返すのは**下にあるもの**
  （地図の canvas）であり、要素に付けた listener には**原理的に届かない**。当たり幅 `M` を上げても
  足りない画素は要素の外にあるので直らない。だから角だけは document で受け、`getBoundingClientRect()`
  との**座標**で判定する。⚠ **角だけ**（辺まで document で取るとパネルの縁 9 px のクリックを全部奪う）、
  ⚠ **z 最上位の窓が勝つ**（`bringToFront` が保つ順序）、⚠ カーソルは `document.body` に書いて
  **角を出た瞬間に消す**（地図の上に残ったリサイズカーソルは、直した欠陥より悪い）。
- **剥がすのは幾何プロパティだけ。** `_flatten()` が `position/left/top/width/height/transform/
  z-index/margin/resize` などを `removeProperty` する。⚠ **`display` は剥がさない**
  （所有者が持っている開閉の状態を奪わない）。
- **`_undockOne` は `_dockOne` の厳密な逆。** 保存した文字列から**幾何だけ**戻す
  （全部戻すと、監視が再びドックへ入れる無限往復になる）。
- **列の中でスクロールする箱は作らない。** `*-scroll` / `*-body` / `*-list` に対して
  `max-height:none; overflow:visible` を宣言してある（`css/intmap.css`）。
- **ドック中は最小化で始めない。** 携帯の凡例自動折りたたみは「地図の上に浮いている凡例が地図を隠す」
  ために書かれたものなので、ドック中は走らせず、ドックする瞬間に開く。
- **携帯では列が画面の左右いっぱい。** `#docked-feed` がシートのパディングを打ち消す。
  シートの高さの所有者は `--sheet-h` ただ1つ。

### 8.3 パネルとウィンドウの作法

- **UI の状態はキャッシュせず、持ち主に訊く。** 各モジュールは `isOpen()` / `close()` を持ち、
  ツールカードは行に `mod:'IntMapX'` を1つ持って毎回呼ぶ。**出口を2つにしない**（既存の ✕ も同じ
  `close()` に付け替える）。
- **開いたことは「教えてもらう」。** 遅延チャンクのモジュールは押してから開くまでに秒かかるので、
  押した直後の同期も `setTimeout` も間に合わない。`OS.exec` が返す**到着の Promise** に繋ぐ。
- **動く障害物の位置は実測する。** サイドバーのように開閉するものを定数で避けない
  （`placeClear()` が覆っている物の矩形を測る）。
- **進捗バーは1種類。** `var(--prog-grad)` の塗り幅＝割合 ＋ ％表示。`busy()` / `set(f)` / `done()` の
  3状態だけ。⚠ 割合が出せないなら**上流を直す**（不確定モードを足さない）。

### 8.4 経路 (Directions)

正式な入口は **Layers ▸ Tools ▸ Directions／経路** の1つだけ（地図上に常設のボタンは無い）。
Atlas の自然言語も同じ経路計算を呼ぶ補助的な入口で、**両者は同じ状態を読み書きする**。

| ファイル | 役割 |
|---|---|
| `js/routing-store.js` | **状態の正本** `window.IntMapRouteStore`。出発地／経由地／目的地（確定した地点と未確定の文字列を分けて持つ）・交通手段・日時・回避条件・要求の状態・結果・選択中候補。DOM も地図も触らない |
| `js/routing-providers.js` | 各ルーターが**実際にできること**の表。UI はこの表が真を返す機能だけを出す |
| `js/routing-geocode.js` | 地点の**候補**検索と順位付け。確定はしない |
| `js/routing-cards.js` | 候補カード・手順・公共交通の区間・距離／時刻の書式。**Atlas とパネルが同じ関数を呼ぶ** |
| `js/routing-export.js` | GPX・GeoJSON・共有状態（**幾何は運ばない**） |
| `js/routing.js` | 実際の経路計算、地図への描画、`window.IntMapRouting` の公開契約 |
| `js/routing-ui.js` | パネル本体。**遅延取得**（`IntMapLazy.need('routeUi')`）。CSS は `css/intmap.css` の `.rtp-*` |
| `js/routing-ops.js` | 既存の経路についての分析（標高・国境・沿道・到着時刻・経路差・過去の路線網） |

**不変条件**

- **入力欄の文字を編集した瞬間、そこに確定していた座標は無効になる。** 未確定の文字列は
  ルーターに渡らない（`points()` が `null` を返す）。
- **経路計算は確定した地点が変わったときだけ走る。** 打鍵では走らない。同一条件の再送もしない。
- **古い応答は状態にならない。** ルーター側の requestId（描画の抑止）に加え、store 側の
  `settle(id,…)` が世代の合わない結果を拒否する。
- **パネルを閉じると地図の経路も消える。** ✕（と Esc）は `RT().clear()` / `clearAreas()` を通り、
  描いた経路と通過禁止範囲を地図から外す。**出発地・目的地・経由地は残る**ので、開き直せば同じ
  旅程がそのまま出て、1回の計算で戻る。パネルを開いたまま地図だけ綺麗にしたいときは
  「経路を消去」——こちらは閉じない。Atlas の「経路を消して」も同じ `IntMapRouting.clear()`。
- **候補を1つ選ぶと、そのカードが開いて詳細（手順／区間）を中に出す。** 候補一覧の下に別の
  ブロックを置かない。カードは `div[role=radio]` であって `<button>` ではない——中に入る手順は
  本物のボタンで、ボタンはボタンを含めない。押下の判定は**手順が先**で、次にカード。
- **時刻はその地点の現地時刻で書く。** `IntMapTimeZones.offsetAt(lng,lat)` から求めた実効オフセット
  で組み立てるので、東京→パリの旅程は出発が東京時間・到着がパリ時間になる。設定でタイムゾーンを
  明示している読み手はそれが優先される（アプリ全体を1つの時計で読むという選択だから）。
  出発時刻の入力欄自体は端末の時計で打つ `datetime-local` で、その旨を欄の横に書く。
- **どの地点欄からも現在地を1回で入れられる**（◎ ボタン）。許可を求めるのは**押した瞬間だけ**で、
  パネルを開いただけでは何も要求しない。拒否・タイムアウト・失敗はそれぞれ別の文で言う。
- **交通手段の切替はこのパネルにしかない。** Atlas の返答にはタブを置かない（同じ store を書く
  操作子を会話ログの中に二重に置かないため）。
- **入替は旅程全体を逆順にする**（`A → 1 → 2 → B` は `B → 2 → 1 → A`）。
- **地図の A / 1 / 2 / B は入力欄の番号と同じ規則から出る。** 経路線には見えない太いヒット領域が
  あり、線を押すと候補カードの選択が変わる（逆も同じ）。
- **できないことは表示しない。** ライブ交通を持つプロバイダーは1つも無いので、道路の所要時間は
  常に「標準所要時間・リアルタイム交通量は未反映」と書く。回避条件や通過禁止範囲が適用できな
  かった場合、代替経路が経由地のせいで取れなかった場合も、それぞれ別の文で言う。
- **公共交通の「リアルタイム」は上流が `realTime` を真にした区間だけ。** 一部だけなら「一部
  リアルタイム」で、遅延0は「定刻」と書く（「+0分」とは書かない）。
- **カメラは開いているパネルの実寸を避ける**（`IntMapRouting.setInsets()`）。

---

## 9. モバイル対応の構造

### 9.1 IntMap Runtime — 1つのフレーム・1つの camera 購読・1つのタイマー

`js/runtime.js` / `window.IntMapRuntime`。**カメラを追う仕事は全部ここを通る。**
`js/app-body.js` が `js/lazy-modules.js` の隣で `makeRuntime(IM_HOST)` を作る——
**何かが登録するより前に存在していなければならない。**

| 登録簿 | 呼び方 | 何をするか |
|---|---|---|
| camera | `onCamera(key, fn, {phase, capability})` | カメラが動いた。**エンジンへの購読は全体で1本**。`phase:'read'` は**すべての** `phase:'write'` より前に走る |
| frame | `frame(key, fn)` | 次のフレームで1回。key で合流 |
| timer | `every(key, ms, fn, {whenHidden})` | **1本の timeout** が全周期を回す。`document.hidden` の間は動かさない（戻ったとき取り戻しはしない） |
| idle | `idle(key, fn, {timeout})` | フレームのあと、暇なとき |

**ライフサイクル**: `define(name,{load,activate,suspend,dispose})`。上の登録は capability 名でタグ付け
されるので、`suspend(name)` はその機能の毎フレーム仕事を一括で外し、`dispose(name)` は登録ごと消す。

⚠ **なぜ「読みを全部終えてから書く」なのか**：private な rAF を各自が持つと、どれも `project()` /
`getBoundingClientRect()` で幾何を**読み**、同じコールバックで style を**書く**ので、
**1つの書き込みが次の読み取りのレイアウトを無効化する**＝強制同期レイアウトが毎フレームN回、
指が触れている経路の上で起きる。

⚠ **誰の仕事も間引かない。** 全員が今までと同じフレームで同じ入力で走り、動いている最中の絵も変わらない。
消してよいのは**重複だけ**。`gesturing()` / `window.__imGesture` は公開されているが、このファイル自身は
使わない——「これは止まってからでいい」は、その判断が見える呼び出し側で書く。

⚠ **ローダーではない。**「取ってきて・factory を回して・publish を検証する」は `js/lazy-modules.js` の
仕事で、`load` はそこを**呼ぶ**場所。

### 9.2 レイアウト

- **m-fab-stack**（右側の丸ボタン列：Layers / Tools / Compass 等）＋ **m-sheet**（ボトムシート・detent 制）。
- レイヤーパネルは m-sheet の中に移動する。**携帯のレイヤー欄はデスクトップと同じもの**
  （`js/map-ui.js` の `mountInto()` が同じ DOM を移す。2つ目の実装を作らない）。
- **最大（`sheet-full`）のとき、地図のタップは無効**で、タップすると中段（`half`）へ下りる。
- **ウィジェットを最上部までスクロールしてさらに引くと、シートが下がる。**
- **チェックボックスのタップ**：`input{pointer-events:none}` ＋ `touch-action:manipulation` ＋
  行そのものの `pointerdown` でトグルする。
- **compare を開いている間**：メインの m-fab-stack を**下に移動**する（消さない）。
- **Radius パネル**：携帯では左下のコンパクトなカード（地図と FAB を塞がない）。
- **`.m-scrim` は、閉じている間 `visibility:hidden`。**
- ⚠ **「携帯」の定義は2つあり、用途で使い分ける。** 幅（`matchMedia('(max-width:768px)')`）は
  **レイアウト**の問い、`isMobile()` は**端末**の問い。GPU の問い（フロストガラスを出すか）に
  幅で答えない。
- **Atlas は携帯ではサイドバー（ボトムシート）の中で開く**（`#sidebar` にマウントする）。
- **フライトシムの携帯レイアウト**：`@media(hover:none)` で6連メータ・PFD・ブーストバー・
  キーボード早見表を消し、テープ・パネル2枚・ラダー・ADI を1つずつ残す。
  ⚠ **シミュレータからは何も削っていない**（デスクトップ／タブレットでは従来どおり全部出る）。
- **宇宙を探索の携帯レイアウト**：時刻まわりを `.sp-timeb` 1つに畳み、**そのボタンが時刻そのものを
  表示する**（畳んでも答えは隠れない）。デスクトップではそのボタンは `display:none`。

### 9.3 携帯が余分に持たない／待たないもの

- **ガゼッティア**は `data/gazetteer-phone.json.gz`（452 kB・12,000行）を取る。全量は取らない。
- **ケッペン**は軽量版 `*_4k.png` を使い、**作業キャンバスは 2048² へ直接デコードする**
  （4096² の PNG を復号するとモバイルで RAM を超える）。復号済み画像は作業キャンバスを作った直後に解放する。
- **押されてから取りに行くもの**（`js/lazy-modules.js`・**16 本**）：フライトシム／Playground／地震／
  津波／地形と水／見通し線／ストリートビュー／夜空／**Atlas カーネル**／経路パネル／データセンター／
  機体カード／3D 体積ツール／国の比較／衛星（ライブ）／衛星パネル。
  KaTeX と html2canvas も動的 import。
  ⚠ **「起動時に何も作らない」は静的解析では決まらない。** `js/analysis-panels.js` は候補に見えたが、
  5 ファクトリのうち 2 つが**起動時に Layers パネルのボタンを作る**（`#btn-correlate`／`#btn-edu`）。
  遅延化するとボタンが 2 つ消える——**ファクトリ本体の実行文を数えてから**決める。
  ⚠ **受動的な読み手は `&&` ガードのまま**にする（「まだ読んでいない」の答え方は「持っていない」と同じ）。
  取りに行くのは**入口だけ**——閉じる／状態を読むだけの経路が実装を取得してはならない。
- **衛星タイルの先読みは「レーン」で流す**（`sw.js` の `PREFETCH_LANES` ／ `js/tile-warm.js`）。
  ⚠ **先読みが出してよいのは、ブラウザ自身が読み込める URL だけ**。スタイルのタイル雛形は
  `imapsat://{z}/{y}/{x}` のような**登録済みプロトコルの URL**であることがあり、それを `<img>` に
  渡してもハンドラは呼ばれず、`img-src` に拒否されるだけで 1 枚も温まらない。
  `js/dash-extended.js` のカメラ先読みは **scheme を見て http(s) 以外を出さない**。
  プロトコル配信のタイル（衛星）の先読みは `js/tile-warm.js` の担当で、
  **プロトコル自身が公開する実 URL**（`IntMapSatProto.tileUrl`）を使う。
- **携帯の画像同時取得数は MapLibre 自身の既定**（デスクトップ用に上げた値を携帯に持ち込まない）。
- **ラスタレイヤーはタイルソースにする**（1枚の画像を視野ごとに取り直すと、移動中は必ず縮尺が違う）。
  ⚠ タイルは `scene.addProtocol` 契約で供給し、レンダラが今いるズームのタイルを要求する。
  子が届くまでだけ親を出す（z0 のタイルを z14 に広げない）。
- **同じ正規表現を二度コンパイルしない。** ニュースの地名索引（`js/news-context.js` の
  `rebuildGeoIndex`）は1起動で **5 回**呼ばれ、そのたびに `HOST.geoDB` を新しいオブジェクトで
  作り直すので、**毎回すべての `_terms` を作り直していた**（実測 193,014 本のうち 145,701 本＝
  75.5% が焼き直し）。`terms` 配列の同一性で覚えておき、**中身を全要素照合してから**再利用する。
  ⚠ 「同じ配列オブジェクトだった」は「同じ語だった」ではない——照合しない再利用は、古い matcher が
  黙って別の場所に当たる**沈黙する誤配置**になる。⚠ `RegExp` を共有してよいのは `g`/`y` フラグが
  無いからで（`lastIndex` を持たない）、フラグを足すならこの共有は成立しなくなる。
- **レイヤーのサムネイルは、パネルが見られるまで描かない。** 画像の取得だけでなく、
  **canvas に描く経路も同じ門を通る**（`js/layer-previews.js` の `_paintJob` / `_openQueue`）。
  門が開くのは「パネルが表示された（`kick()`）」か「最初の idle」か「6 秒」の早いほうで、
  絵も枚数も順序も変わらない——変わるのは**いつ描くか**だけ。
  ⚠ **IntersectionObserver で代替しないこと。** 一度そうして、パネルが画面外で組み立てられた行が
  二度と見直されず、グラデーションのまま残った（実測「一切変化なし」）。門は必ず開く。
- **ホバーは、既に知っていることに二度払わない。** `positionTooltip`（`js/app-body.js`）は
  地図コンテナの大きさを **ResizeObserver でキャッシュ**する（毎 pointermove の
  `getBoundingClientRect` は強制同期レイアウト）。`setMapTooltipHTML` は**前回と同じ markup なら
  書かない**。ウィンドウの縁の当たり判定（`js/window-manager.js` / `js/workspace.js`）も同じで、
  **押下は必ず生の矩形で測り**、hover だけが世代付きキャッシュを読む——だから「掴めない縁」は
  原理的に作れない。キャッシュの無効化は「窓が動いた／大きさが変わった／他モジュールが style や
  class を書いた／ビューポートが変わった／スクロールした」を観測して行う。
- **`?perf=1`** — 実機で測るための計器（`js/perf-hud.js`）。フレーム時間の中央値/p90、
  ビューポートと交差する要素数、レイヤーごとの費用を出す。
  ⚠ `visibility:hidden` は数えない（描かれない＝費用が無い）。

⚠ **ヘッドレスプレビューは `document.hidden`** なので WebGL の `load` が発火せず、
`requestAnimationFrame` も止まる。地図描画は DOM／状態／console で検証し、UI のフェードインには
`setTimeout` のフォールバックを持たせる（`?rafshim=1` で rAF を回す開発専用シムがある）。

---

## 10. 多言語対応の構造

### 10.1 答えは1つ — `npm run check:i18n`

「翻訳済み」の定義がこのリポジトリで一度も1つだったことがない、というのが翻訳漏れの原因だった。
利用者が読む文字列は複数の**形**で存在し、各形が自分の計器を持って**自分の形の100%**を表示していた。
いまは `scripts/i18n-audit.mjs --gate`（＝`npm run check:i18n`。`npm test` に内包）が**全部の面を1つの表**に
出す。

| 面 | 何を数えるか |
|---|---|
| keyed `ui` 表 | 505 キー × 9言語 |
| inline `L(…)` 表 | 3,774 行（位置引数を持たない言語が引く英語→訳の表） |
| `L(…)` の位置引数 | 4,641 サイト（最初の5言語） |
| 読み物ページ `js/locales/pages.*.js` | 403 |
| HTML の `data-i18n` キー | どの言語も宣言していないキーが 0 であること |
| `title` / `aria-label` / `placeholder` / `alt` | キーが無いものが 0 であること |
| `<title>` / `<meta description>` | 読み物ページの文書そのものが訳されていること |

**形の監査**（いずれも現在 0。数ではなく**形**が二度と現れないことを固定する）:

- `jp ? '…' : '…'` の2分岐三項（`scripts/i18n-two-branch-audit.mjs`）
- `jp() ? … : …` のヘルパ三項、および**腕が配列／オブジェクト**の三項
  （`scripts/i18n-helper-ternary-audit.mjs`）
- 言語コードをキーにしたオブジェクト（`scripts/i18n-langmap-audit.mjs`）
- 言語→位置の表、および `L()==='jp'?1:…` の**index chain**（`scripts/i18n-positional-array-audit.mjs`）
- 引数が5つ未満の call site、各言語の引数が英語と**同一**の call site
  （`scripts/i18n-positional-audit.mjs`）

⚠ **被覆は「存在する」ではなく「英語と違う」で測る**（新言語の雛形は全行が英語なのに presence では
100% に見える）。表には `=EN` 列がある。

⚠ **どの呼び出しが翻訳呼び出しかは、リポジトリ全体で1回だけ解決する**（`scripts/i18n-helpers.mjs`）。
ファイル単位で個別に答えると、他モジュールのプロパティ越しに届くヘルパが全計器の視野の外に出る。

⚠ **検査は AST で書く**（正規表現にすると、この節や各修正箇所の**コメントが引用している欠陥そのもの**に
当たる）。「X は消えたか」を検査するときは、**X が書かれていた構文**で書く。

⚠ **計器の視野の外に、名前のついた穴が1つ残っている——そして今はラチェットが掛かっている。**
「隣接データスロットとして持たれた翻訳の組」が **275 件**（`js/reference-data.js` 143・
`js/analysis-panels.js` 132）。言語で索引されていないので上の表のどの百分率にも入らず、
その行が挙げていない言語は英語を読む。**ゼロを要求するゲートにはしない**——4言語ぶんの本文を書く
仕事であって検査ではないから（「1ラウンドで届かないゲートは次のラウンドに消される」）。
代わりに `scripts/i18n-audit.mjs` の `PAIR_CEILING` が**増えたら落とす／減ったのに天井が残っていても
落とす**。**新しい英語 fallback は作れない**、というのがこの穴について今言える最強の主張。
一覧は `node scripts/i18n-pair-audit.mjs --list`、直し方は `pickArgs()`。

**現在の状態: 9言語すべてが、上の全ての面で 100%。**

**OPEN GAP（百分率には数えず、印字してラチェットするもの）**:

- **隣り合ったデータ枠に置かれた翻訳** 275件（`js/reference-data.js` 143 / `js/analysis-panels.js` 132）。
  言語で添字されていないので、どの計器も 0 と数える形。`pickArgs()` へ変換していく。
  一覧は `node scripts/i18n-pair-audit.mjs --list`。

**免除**（固有名詞のレコードと照合語リストで、アプリが書いた文ではないもの）1,391件。
`@i18n-entity-data` で宣言し、**座標・ISO コード・ティッカー・ドメインを持つ行**であることを
検証しているので、免除の印で UI 散文を黙らせることはできない。

### 10.2 言語を1つ増やすコスト＝ファイル1本

`js/locales/ui.<code>.js` を置くだけでよい。登録簿の行も `src/main.js` の import 行もピッカーの項目も
要らない。

- `src/locale-boot.js` が `import.meta.glob('../js/locales/ui.*.js')`（**lazy**）でディレクトリを読む
  ＝**言語の集合はファイルの集合**。⚠ `src/` に置くのは、`js/` を `scripts/static-checks.mjs` が
  プレーンなスクリプトとして解析するため（`import.meta` が自由識別子になり検査が落ちる）。
- `js/lang-registry.js` の `derive(code)` が label（`Intl.DisplayNames` ＝ その言語自身の名前）・
  BCP-47 タグ・2文字 pill を code だけから作る。登録簿に literal 行として残るのは**ファイル名では
  運べない事実を持つ言語だけ**——最初の5言語（＝`L(…)` の引数順で、順序が load-bearing）と
  中文2行（スクリプト別 alias・1文字 pill・`normalise` の解決順）。
  ⚠ 中文の別名は**字体タグだけ**（zh-Hant / zh-TW / zh-HK / zh-MO）。素の `zh`・`zh-CN` は簡体が多い。
- 読み物2ページ（`sources.html` / `science.html`）はバンドラが無いので、`scripts/i18n-langs.mjs` が
  `js/locales/_langs.js`（`window.IntMapLangCodes` と `window.IntMapLangBeta`）を生成し、
  `prebuild` で毎ビルド更新する。`tests/r232-checks.test.mjs` がディレクトリと生成物の一致を検査する。
- **(beta) 表記は測って付く**：同スクリプトが inline テーブルの被覆率を計算し、98% 未満なら beta。
  埋まれば誰も気づかなくても自動で外れる。**現在 `IntMapLangBeta` は空＝beta の言語は無い。**
  明示 label（中文2行）は常に優先される。
- 新言語の雛形は `node scripts/i18n-report.mjs --template <code>`、
  新言語の追加は `node scripts/i18n-new-language.mjs`。

### 10.3 読み込みと組み立て

- **locale は遅延読み込み。** eager なのは英語（＝全テーブルが `Object.create` で繋がるプロトタイプ）
  だけで、利用者の言語は独立チャンクとして取得し、`js/app-body.js` の起動バリア（エンジン選択と同じ
  `then(go,go)`）で待つ。
- `js/i18n.js` はテーブルを**差し替えず in-place マージ**する（`i18n.de` を参照で掴んでいる読者が多い）。
  表は英語に**プロトタイプで鎖**を繋ぐので、欠けたキーは**キー単位**で英語に落ち、`js/i18n-late.js` が
  後から足すキーも全言語に即座に届く。`i18n.ja === i18n.jp`。
- **言語変更は「待てるイベント」**（`js/lang-switch.js`）——文字列が届く前に描き直さない。
- ⚠ **`ui.zh-hans.js` は手で書かない**（`scripts/zh-hans.mjs` の生成物。繁体を直してから再生成する）。
- ⚠ **inline への追記は `scripts/i18n-append-inline.mjs`**（既存の `inline` に挿入するだけ・
  既存キーには触らない）。
- **地名ラベルも全言語対応**（`applyLabelLang` の `name:<lang>`）。⚠ `Intl.DisplayNames` が生のまま返す
  コードがあるので、言語名の表示はそれを確認してから使う。

---
## 11. フィードバック・寄付・管理機能

- **フィードバック**：`feedback` テーブル。`recordLogin()` が本物のログインを数え、3回目に既存モーダルを
  1回表示する（設定からはいつでも開ける）。
- **寄付**：Stripe リンク（言語別）。記録は `donations` テーブル。
  - EN: `https://donate.stripe.com/5kQdR2d2m1oa1lAadk5gc01?locale=en`
  - JA: `https://donate.stripe.com/8x29AM9Qa2se7JYetA5gc00?locale=ja`
- **管理コンソール `admin.html`**：`geo_pins`（ニュース辞書）の追加／編集、`dashboard_cards` 編集、
  `community_reports` の対応、`feedback` 閲覧、`community_posts` / `community_comments` のモデレーション。
  ⚠ 公開サインアップは無い。CSP は厳格（`connect-src` は self ＋ `*.supabase.co`）。
  破壊的操作の前に再認証を求める。ログインゲートは利便のためのもので、非 admin が開いても
  **RLS が 0 行しか返さない**。
- **バグ報告**：`bug_reports`（診断情報 JSON 付き。anon が insert 可・admin が閲覧）。

---

## 12. 壊れやすい部分・注意すべき部分

- **`reorganizeLayerPanel()` は DOM を大量に並べ替える。** タップ中に走ると行がずれて誤タップの原因になる。
- **ケッペンのメモリ**：携帯は必ず軽量 `*_4k.png` を使い、作業キャンバスは 2048² へ直接デコードする。
- **ヘッドレスプレビューは `document.hidden`** なので WebGL の `load` が発火せず `requestAnimationFrame` も
  止まる。地図描画は DOM／状態／console で検証する。
- **ニュースは `current_news` 依存**：cron が動いていないとフロントは自動でライブ RSS フォールバックに落ちる
  （鍵は不要だが中継に依存する）。
- **`styledata` の自己ループ**：レイヤーが `styledata` ハンドラの中で自分の source を消して足し直すと、
  レンダラが再び `styledata` を撃つ閉ループになる。ハンドラは `ensureLayers()` を呼び、
  **既にあればスタイルに触らずに返る**こと。作り直すのは**本当にレイヤーが消えているときだけ**。
- **`source._data` は `setData()` のあとも古いことがある。** 読むのは `source.serialize()`。
- **MapLibre のフィルタ内 `['zoom']` は整数ズームでしか再評価されない。** 段は整数で書く。
- **`!important` は CSS アニメーションに勝つ。** ショートハンド（`background:` など）に `!important` を
  付けると、そこに含まれる副プロパティ（`background-position`）が重要宣言として初期値に固定され、
  `@keyframes` が一度も効かなくなる。ロングハンドで書く。
- **画素で決まる長さは投影に訊く**（`GE().coords.project`）。メルカトルのメートルは画面中心でしか合わない。
- **同じ入口が2つあれば、片方は忘れられている。** 状態を変える経路（`editDirty()` のような「必ず通れ」）は
  **1本の関数**にする。注記を2本目・3本目と足さない。
- **時間を当てにする同期は、遅い経路で必ず外れる。** 終わった時刻を推定せず、終わったと教えてくれるもの
  （Promise・`transitionend`）に繋ぐ。
- **`null` は「値が無い」と「まだ取得していない」を区別しない。** キャッシュのミスを「データが無い」と
  読ませない（DEM・境界データ・フィードのいずれもこの形で壊れる）。
- **失敗したフィードと、止まったフィードは違う。** 止まったフィードは全部の計器が「成功」を報告する。
  年齢を必ず測って印字する（§7.1）。

---

## 13. 触ってよい部分 / 慎重に触るべき部分

**比較的安全（加算的に拡張しやすい）**

- 辞書の追加（`geo_pins`、クライアントの追加辞書、サーバー側の埋め込み辞書）。
- データレイヤーの追加（既存の setup パターンに倣う）。出典は `DATA_SOURCES` に追記する。
- i18n 文言、ウィジェット、設定項目の追加。

**慎重に（壊れやすい中核）**

- `reorganizeLayerPanel()` / `_refreshActiveLayers()` / レイヤーパネルの DOM 順序とスクロール補正。
- チェックボックスの決定論的トグル（`#layer-dropdown` の pointerdown/click ハンドラ）。
- `applyTheme()` / `_reassertBase()` / `styledata` の自己修復まわり。
- 投影・3D・compare の同期。Isolate のマスク順序。
- ai-proxy / refresh-news の鍵・上限・再利用ロジック。
- `js/geo-engine.js` の契約（アダプタにだけメソッドを足さない）。

---

## 14. 新しい環境で IntMap を復元する手順

1. **取得とインストール**
   ```bash
   git clone https://github.com/rwmqx7dwb5-arch/IntMap.git && cd IntMap
   npm ci && npx playwright install --with-deps chromium
   ```
2. **Supabase プロジェクト**を用意し、**接続先を2か所**差し替える：
   - `src/vendor.js` の `window.SUPABASE_URL` / `window.SUPABASE_ANON_KEY`
   - `admin.html` の同じ2つ（このページはバンドラを通らない）
3. **DB を作る**——**SQL を手で流さない**。`supabase/migrations/` が唯一の設計図。
   ```bash
   supabase link --project-ref <PROJECT_REF>
   supabase db push                 # migrations を適用
   supabase db diff --schema public # drift がゼロであることを確認
   ```
   ローカル検証は `supabase start && supabase db reset`（migrations ＋ `supabase/seed.sql`）。
4. **Edge Functions を8本デプロイする**（`verify_jwt` は `supabase/config.toml` の宣言に従う）：
   ```bash
   for f in ai-proxy delete-account; do supabase functions deploy $f --project-ref <REF>; done
   for f in refresh-news monitor-run sv-cov alerts-relay cable-geo news-relay; do \
     supabase functions deploy $f --no-verify-jwt --project-ref <REF>; done
   ```
5. **Secrets を設定する**（§6.3）。最低限：
   ```bash
   supabase secrets set AI_PROVIDER=anthropic ANTHROPIC_API_KEY=... \
     REFRESH_SECRET=... MONITOR_SECRET=...
   ```
   ⚠ `REFRESH_SECRET` は**必須**（未設定だと `refresh-news` は全リクエストを拒否する）。
6. **cron を設定する**（pg_cron ＋ `net.http_post`。秘密は**ヘッダ**で送る）：
   - `refresh-news` を約20分ごと（`x-refresh-secret`）。初回は手動で1回叩いて `current_news` を埋める。
   - `monitor-run` を定期実行（`x-monitor-secret`）。SQL は `docs/AREA-MONITORS.md`。
7. **静的ホスティング**——**配信するのは `dist/`**（リポジトリのソースツリーではない）。
   ```bash
   npm run build     # → dist/
   ```
   GitHub Pages で公開する場合は **Settings → Pages → Source = "GitHub Actions"** と
   **Variables `ENABLE_PAGES_DEPLOY = true`** を設定する（本リポジトリでは両方設定済み）。
   これで `main` への push ごとに `.github/workflows/deploy.yml` が
   ビルド → 静的検査 → 公開 → 実 URL へのスモークを行う。詳細は `docs/RELEASE.md`。
8. **認証**：Supabase で Google / Apple / メールを設定（任意）。Redirect URL・漏えいパスワード保護・
   パスキーの RP 設定は `docs/SECURITY-ARCHITECTURE.md §9`。
9. **動作確認**
   ```bash
   npm test                                   # 静的検査＋hermetic ブラウザ試験
   npm run serve                              # http://127.0.0.1:4173/（Pages と同じ配信）
   PROD_URL=<公開URL> npx playwright test --config playwright.prod.config.js
   curl -s <公開URL>/build-info.json          # sha が git rev-parse origin/main と一致すること
   ```
   画面側は、(a) レイヤー行（`.lyr-row`）が100個以上、(b) コンソールエラー 0、
   (c) News タブでピンが即表示、(d) ログイン → AI 機能が動く、を確認する。
   (a) と (b) は `npm run test:smoke` が同じことを自動で確かめる。

---

## 15. 運用品質基盤 (CI・テスト・リリース・監視)

アプリ本体とは分離した**開発／CI 用ツール**。ブラウザには一切ロードされない
（`package.json` の devDependencies はアプリに同梱されない）。

### 15.1 正本の在り処

| 主題 | 正本 |
|---|---|
| 何をどう試験するか・層・tier・テスト予算・`check:*` ゲートの一覧 | [`docs/TESTING.md`](docs/TESTING.md) |
| リリース手順・ロールバック・着地確認 | [`docs/RELEASE.md`](docs/RELEASE.md) |
| 稼働監視・アラート | [`docs/MONITORING.md`](docs/MONITORING.md) |
| 障害対応（サイト・DB・鍵） | [`docs/INCIDENT-RESPONSE.md`](docs/INCIDENT-RESPONSE.md) |
| CI／検査スクリプトのファイル一覧 | [`docs/FILES.md`](docs/FILES.md) §3.12 |
| **作業終了処理**（commit / push → 原本の最新化 → USB への完全ミラーと検証） | [`CLAUDE.md`](CLAUDE.md) §11 ＋ `scripts/master-sync.mjs` ＋ `scripts/backup-usb.ps1` |

### 15.2 実行

```bash
npm ci && npx playwright install --with-deps chromium   # 初回
npm test           # = 静的検査 + hermetic ブラウザ（CIゲート）
npm run serve      # http://127.0.0.1:4173/（Pagesと同じ配信）
```

⚠ 全件テストは**完成後に1回**にする。長い待ちは並列化し、push 前に CI と同じ門をローカルで通す。

### 15.3 診断のためにアプリが持っているもの

- `INTMAP_BUILD` ＝ 現行ビルド識別子（診断と Bug Report に露出する）。
  ⚠ **`index.html` にビルド印は2つある**（`window.__imBuild` と `window.INTMAP_BUILD`）。
  `tests/r169-checks.test.mjs` が同じラウンドを名乗ることを検査し、`tests/r207-checks.test.mjs` が
  **`DEV-NOTES.md` の最新ラウンド見出しと一致すること**を検査する。**毎ラウンド両方上げる。**
- **Sentry フォワーダ**は休眠（`window.INTMAP_SENTRY_DSN` / `<meta name="intmap-sentry-dsn">` が
  未設定なら完全無動作・0コスト）。設定時のみ SDK を遅延ロードし、`beforeSend`/`beforeBreadcrumb` で
  PII・トークン・cookie・localStorage・Atlas 入力・検索語・精密位置を送らずクエリを除去する。
  常時稼働の土台は `window.__imErrors`（error / rejection のリングバッファ）。
- **STAGING リボン**（`*.pages.dev` / `?staging=1` / meta フラグのときだけ表示）。

### 15.4 リリース（現行）

**本番は CI ゲート付きの GitHub Actions ワークフローで公開される。** Pages の Source は
**GitHub Actions**、リポジトリ変数 **`ENABLE_PAGES_DEPLOY = true`** が設定済みで、`main` への
push ごとに `.github/workflows/deploy.yml` が「ビルド(Vite) → 静的検査 → `dist/` を公開 →
実 URL への post-deploy smoke」を行う。着地の確認は
`curl -s https://rwmqx7dwb5-arch.github.io/IntMap/build-info.json` の `sha` が
`git rev-parse origin/main` と一致すること。ロールバックは `.github/workflows/rollback.yml`
（履歴に実在する ref のみ・対象 ref を **Vite ビルドして `dist` を配信**）。

⚠ `deploy.yml` は `concurrency: pages-production` で直列に走る（前の run が固まると次は pending のまま）。
**手順の正本は [`docs/RELEASE.md`](docs/RELEASE.md)。**

### 15.5 文書間の固定事実の照合 — `npm run check:docs`

`scripts/doc-facts.mjs` が、**複数の文書に書かれている同じ事実**と、**文書と実装の食い違い**を
突き合わせる。`npm test` に内包され、ずれていれば落ちる。**検査する事実の一覧は
[`docs/TESTING.md`](docs/TESTING.md) の「文書の検査」節が正本**（ルールを足したらそこに1行足す）。

⚠ **規則を文章で書いたら、その規則を測る検査を同じ変更の中で書く。** ここに並ぶ規則はどれも、
「書いてはあったが誰も突き合わせていなかった」ものが実際に嘘になってから足されている。

---

## 16. データ保護基盤 (migrations・RLS/権限テスト・バックアップ・復元)

DB 構造を**コード化**し、RLS／権限を**自動テスト**し、バックアップ／隔離復元を用意し、本番 DB 変更を
安全化した設備。**手順の正本は [`docs/DATABASE.md`](docs/DATABASE.md)（表と RLS ＋ pgTAP 手順）・
[`docs/MIGRATIONS.md`](docs/MIGRATIONS.md)（本番適用）・
[`docs/BACKUP-RESTORE.md`](docs/BACKUP-RESTORE.md)（バックアップと隔離復元）。**

### 16.1 Supabase CLI 構成

- `supabase/config.toml` — ローカル／CI 用（**本番非接続**）。
  ⚠ **`db.major_version` は本番と一致していない**（宣言 15 / 本番 17.6）。ローカル再現の忠実度に関わるので、
  上げるときは `supabase db reset` の通過を確認してから行う。
- `supabase/migrations/*.sql` — **唯一の設計図**（7本）。冪等・非破壊
  （`if not exists` / `create or replace` / `drop policy if exists`）。
- `supabase/seed.sql` — **100% 合成**（`.test` ドメイン・プレースホルダ UUID）。
- `supabase/tests/*_test.sql` — pgTAP（構造 ＋ RLS/権限マトリクス ＋ 関数 ＋ Monitors ＋ 権限昇格）。

### 16.2 RLS の3大保証（テストで実証）

1. **PII 非公開**: `profiles` の email / is_admin / plan は本人＋admin のみ。公開表示は `profiles_public`
   ビュー（id / display_name / bio / avatar_url の4列）。feedback / bug_reports / donations /
   community_reports / ai_usage は他人・anon から読めない。
2. **昇格不可**: 本人は display_name / bio / avatar_url / login_count のみ更新可（列単位 grant）。
   ⚠ grant は本番の既定権限で無効化されうるので、**grant 非依存の BEFORE UPDATE トリガ**
   （`tg_profiles_guard_privcols`）が実防御になっている。
3. **quota 改ざん不可**: `ai_usage` の書込は SECURITY DEFINER RPC 経由のみ、RPC の execute は
   service_role のみ。

### 16.3 CI・バックアップ

- `.github/workflows/db.yml` — `supabase/**` 変更時のみ発火。ローカル Supabase で `db reset` →
  **drift gate**（`db diff` が空であること）→ pgTAP → **backup/restore ラウンドトリップ**（合成データ）。
  **本番非接続・秘密不要・fail-closed。**
- `.github/workflows/db-backup.yml` — `SUPABASE_DB_URL` ＋ `BACKUP_GPG_PASSPHRASE` の両 Secret が
  登録されるまで各 run は skip される。方針 ＝ **Managed backups 優先**＋その pg_dump を予備とする。

### 16.4 実行

```bash
supabase start && supabase db reset          # migrations + seed（要Docker）
psql "$LOCAL_DB_URL" -c 'create extension if not exists pgtap with schema extensions;'
supabase test db                             # RLS/権限 pgTAP
supabase db diff --schema public             # driftゼロ確認
```

⚠ **本番はマイグレーションファイルと乖離しうる。** ベースライン（最初の1本）は本番へ「適用済み」として
記録されていないので `supabase db push` は使えない。**本番適用は
`supabase db query --file … --linked` ＋ `supabase migration repair --status applied <version>`** で行う
（正本は `docs/MIGRATIONS.md`）。監査は `supabase db query --linked` で `pg_policies` /
`role_table_grants` / `pg_proc` を**本番から読んで**行う。

---

## 17. セキュリティ基盤

**信頼境界＝サーバー（Supabase）**、ブラウザ JS は非信頼。外部から来る値（コミュニティ投稿、
ニュース RSS 見出し、OSM/Nominatim の地名、OSM で編集可能なウェブカメラ URL、AI 出力、URL hash）は
すべて敵性入力として扱う。

**正本は [`docs/SECURITY-ARCHITECTURE.md`](docs/SECURITY-ARCHITECTURE.md)**（脅威モデル・データフロー図・
認証認可・公開値と秘密値の区別・**残存リスク**・本番の手動設定）。報告方法は
[`SECURITY.md`](SECURITY.md)、検査手順は [`docs/TESTING.md`](docs/TESTING.md) の「セキュリティ」節。

### 17.1 XSS 出力エンコード（第一防御）

トークンが `localStorage` にあるので **XSS ＝ トークン窃取**であり、**各シンクでの正しい出力エンコードが
最優先の防御**になる（CSP は二次防御）。非信頼テキストは唯一の正規ヘルパー `window.IntMapSafe`
（`<head>` 最初の script でグローバル定義）を通す。

- `.html(s)` ＝ `& < > " '` エスケープ（テキスト／属性の両方に安全）。
- `.url(s,{allowData})` ＝ http(s) / mailto / tel（＋ ラスタの `data:image`。SVG は不可）のみ許可し、
  `javascript:` / `data:text/html` 等は `''` にする。href / src / style は `html(url(s))` で包む。
- 回帰は `tests/security.spec.js`（実ブラウザで無害化を確認）＋ CodeQL。

### 17.2 認証・認可

- **ai-proxy** ＝ `verify_jwt` ＋ 明示的なユーザー検証（未ログイン 401）・プラン別1日上限を
  `increment_ai_usage` で原子的に消費・入力上限を**本文を読む前に**適用・鍵/prompt/JWT は非ログ。
  ⚠ **上流の本文と例外文言は応答にもログにも出さない。**
- **refresh-news** ＝ **fail-closed**。`REFRESH_SECRET` 未設定なら全リクエスト拒否（公開実行しない）。
  秘密は `x-refresh-secret` **ヘッダのみ**・**定数時間比較**・POST のみ。
- **monitor-run** ＝ 同型の fail-closed（`x-monitor-secret`）。ユーザーの「今すぐ実行」は JWT ＋ 所有権照合。
- **delete-account** ＝ `verify_jwt` ＋ 関数内検証 ＋ `confirm:"DELETE"`。**1トランザクション**で
  所有行を削除し、**削除後に数え直して**残っていれば raise（fail-closed）。Auth ユーザーの削除はその後だけ。
- **4本の無認証中継**は `_shared/relay-guard.js` を共有する（§6.2）。

### 17.3 ブラウザ側の設定

- **CSP は `<meta http-equiv>`**（GitHub Pages は独自のレスポンスヘッダを設定できない）。
  `index.html` は `default-src 'self'` を持ち、**14 の directive** を明示的に書く。
- ⚠ **`index.html` の `script-src` には現在 `'unsafe-eval'` と 8 つの CDN ホストが入っている**
  （`unpkg.com` / `maps.googleapis.com` / `www.googletagmanager.com` / `www.google-analytics.com` /
  `ssl.google-analytics.com` / `browser.sentry-cdn.com` / `www.clarity.ms` / `*.clarity.ms`）。
  これは**受け入れて追跡している残存リスク**で、理由・影響・軽減策は
  `docs/SECURITY-ARCHITECTURE.md §8` の 1 番に測定日つきで書いてある。
  ⚠ **`admin.html` はそのどちらも持たない**（SDK 同梱＋データリテラル・パーサ）。
  `tests/security-logic.mjs` が admin 側に `'unsafe-eval'` が戻らないことを毎回検査する。
  ⚠ **新しい CDN ホストを CSP に足さない。** 実行時依存は npm から取り `src/vendor.js` が再公開する
  （§1.1）。現在残っている 8 つは、その方針より前からある計測・地図・タイル系のタグである。
  ⚠ 不在の directive は「許可」ではなく「**不在**」であり、それが意図かどうかを policy が言えない。
- **ヘッダ形式でしか設定できないもの**（`X-Frame-Options` / `Referrer-Policy` / `Permissions-Policy` /
  `X-Content-Type-Options`）は **GitHub Pages では設定できない**ので未設定のままである。
  この事実は `docs/SECURITY-ARCHITECTURE.md §6/§8` に測定日つきで記録してある。
- **本番にソースマップを出さない。**
- **Service Worker** のパス規則は**ホストを見る**（ドット境界での判定）。`postMessage` のプリフェッチ口には
  送信元検証・同じ allowlist・件数／URL 長／応答サイズ／容量上限・`credentials:'omit'` が付く。
  ⚠ allowlist 外の URL は**page 側へ差し戻す**（カスタム XYZ プロバイダの温めを失わない）。
- **admin.html** は隔離する（§11）。SDK は同梱版を読み、データ取込は `js/admin-literal.js` の
  **パーサ**（オブジェクト／配列リテラル文法だけを読み、それ以外は `SyntaxError`）で、**`eval` は使わない**。
- **アナリティクスは URL に認証情報がある間タグを挿さない**（OAuth 復帰時の `?code=` / `#access_token=`）。

### 17.4 CI

**CodeQL**（`security.yml`）＋ `check:static` の **Action SHA 固定検査（全リモート Action・error・除外なし）**
＋ `tests/security-logic.mjs`（Edge Function／SW／admin／CSP の不変条件とパーサのユニットテスト）
＋ pgTAP。`npm test` で全部走る。

⚠ **「X は消えたか」を検査するときは、X が書かれていた構文で書く。** 検査のパターンが、
そのパターンを説明している自分のコメントに当たる事故が繰り返し起きている。
⚠ **除外を書いたら、残る母集合を数える**（空集合を検査して緑になる）。

---

## 18. 地域監視基盤 (Area Monitors)

⚠ **この機能には現在、利用者から到達できる入口が1つも無い。** タブ・ワークスペースのウィンドウ・
Atlas のどれからも開けず、Atlas は `FEATURE_WITHDRAWN` を返す（`PRODUCT.md` §3.4 が言う唯一の例外）。
**撤去であって削除ではない**——モジュール（`js/monitors.js`）・API（`window.IntMapMonitors`）・
その表示領域・Edge Function（`monitor-run`）・DB の 5 表・cron はすべて動いたまま残してある。

サーバー側が監視地域を定期実行し、**変化の有無はコードが判定し、AI は説明のみを書く**
（取得 → 正規化／重複排除 → スナップショット → 機械的 diff → change score → 閾値超過時のみ AI →
AI が引いた evidence ID をコードで検証 → 永続化）。⚠ **取得失敗は「変化なし」ではなく専用 status。**

**設計・DB・status 一覧・cron の SQL・復帰させるときに戻す入口の正本は
[`docs/AREA-MONITORS.md`](docs/AREA-MONITORS.md)。**

---
