# IntMap — 現状仕様書 (Architecture)

> 本ファイルは**開発日記ではなく**、現在の IntMap を再現・保守するための**現状仕様書**です。
> Claude や他のAIが、このファイルを読むだけで IntMap の構造をほぼ理解できることを目的とします。
>
> Last reviewed: 2026-08-20

### この文書の読み方

- **§1–§18 は「今どうなっているか」だけ**を書く。**このファイルには変更履歴を書かない。**
  「いつ・なぜ・どう直したか」は `DEV-NOTES.md`（直近）と `DEV-NOTES-ARCHIVE.md`（それ以前）の担当。
  標準指示（やってはいけないこと等）は `CONSTITUTION.md`、作業の進め方は `CLAUDE.md`。
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

- **本体は `index.html`（919行・83 KB）＋ `css/`（3本）＋ `js/`（151本・8.5 MB）＋ `src/`（8本）。**
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
- **Supabase の接続先は `src/vendor.js`**（`window.SUPABASE_URL` / `window.SUPABASE_ANON_KEY`）。
  `admin.html` はバンドラを通らない別ページなので、同じ2つを自分のインライン script で持つ。
  どちらも publishable(anon) キー＝**公開前提**で、保護は RLS が行う（§17）。
- **ソースマップは本番に出さない**（`vite.config.js` の `build.sourcemap` は false）。

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

> ここは**何ができるか**の一覧。内部構造は §7（地図・レイヤー）・§8（UI）・§9（モバイル）へ。

### 2.1 地図とニュース

- **ライブニュースマップ** — 世界の見出しを「出来事が起きた場所」にピン表示。発信元（媒体HQ）表示にも
  切替可。地点解析は**サーバー側でAI事前解析**（§4）。72時間以内のニュースのみ表示。
- **Globe / Flat / Satellite / 3D地形** 切替、コンパス、距離・面積計測、半径円 (Radius)、
  可視判定（見通し線・レーダー影）。
- **タイムマシン** — マスタークロック `window.IntMapTime` を動かすと、国境・国家・統計・レイヤーの年が
  そろって過去へ動く（§7.4）。
- **国情報** — Countries を ON にして国をタップ → 統計カード＋詳細ポップアップ（世界銀行の時系列、比較）。
- **Isolate（この国だけ表示）** — 1国だけ残して周囲をマスク。タイムマシンで遡った歴史的国家も、
  その当時の版図のまま Isolate できる。
- **共有 (Share this view)** — 位置・ズーム・投影・ベース地図・選択中の全レイヤー・時刻・比較状態を
  **URL 自体**に格納する。リンクを開くと状態を完全復元する。
- **スクリーンショット**、**お気に入りレイヤー**、**レイヤープリセット**、**PWA (Service Worker)**。

### 2.2 データレイヤー

- **100本以上のデータレイヤー**。`js/data-layers.js` の `GROUPS` が **18 の棚に 136 行**を配り、
  `GROUPS` に無い行は末尾の「Others」と「ベータ」へ落ちる（棚の一覧と方針は §7.2）。
- 分野は、気候／宇宙・軌道／海洋／地形／自然・土地被覆／人口・経済／災害／政治・統治／安全保障／
  医療・衛生／テクノロジー・インフラ／経済／社会／交通／農業／エネルギー。
- **GIBS ラスタの凡例は実際の NASA カラーマップ XML から生成**するので、凡例の色が地図と一致する。
- **世界銀行系の塗り分けは年を選べる**（凡例の年セレクタが `window.IntMapTime` を読み書きする）。
- **気象・災害警報は、その機関が発令した単位で塗る**（自前 13 フィード・47 か国 ＋ **WMO の CAP 登録簿**で
  さらに約 90 か国。§7.1）。
  フィードの無い国は**灰色斜線**で「データなし」と言う（空白を「平穏」に見せない）。

### 2.3 分析・ツール

- **統計 (Stats)・情報 (Information) ダッシュボード・コミュニティ・Companies** タブ。
- **多国比較 `IntMapStatsCompare`** — 最大10か国 × 28指標、**棒グラフ／時系列／表**の3モード、
  出典切替（世界銀行 ⇄ IMF WEO）、CSV エクスポート。
- **測る系** — 距離・面積・半径・自由描画・3-D 体積・標高断面・傾斜／斜面方向・見通し線 (viewshed)・
  到達圏 (isochrone)・海路ルート。
- **範囲人口** — 面積測定・半径円・自由描画のパネルと Atlas `population` から、**WorldPop 100m グリッド**の
  実グリッド集計で「囲んだ範囲の人口」を出す。**面積によらず常にタイル分割**するので、進捗バーの割合は
  常に実測値（`done/cells.length`）であり、アプリの他の進捗バーと同じ確定バーである。
- **物理シミュレーション** — 地震波（`js/seismic.js`）、津波（`js/tsunami.js`）、
  地形編集と水の流れ（`js/terrain-water.js`）、放射性物質拡散、日照と地形の影、電波見通し圏。
  手法の説明は設定 ▸ 科学とロジック。
- **ドローン航法** — Measure ▸ Drone。DEM を経路に沿ってサンプリングして総飛行距離・立体経路長・
  予想飛行時間・地上高・最大必要高度・推定バッテリー消費と、**飛行条件を満たさない地点とその理由**を返す。
  機体条件はすべて編集可。高度は AGL/AMSL をウェイポイントごとに保持して両方表示する。
- **ルーティング** — 車／徒歩／自転車（OSRM・Valhalla）と公共交通（Transitous / MOTIS）。
- **Playground (beta)** — Layers ▸ Tools から起動。World Explorer（衛星版 GeoGuessr）／
  Pandemic Simulator（国別 SEIR メタ個体群）／Statecraft（1900–2026 の国家運営）／World Sandbox／Quiz。
- **フライトシミュレーター**、**宇宙を探索**（`js/space.js`）、**夜空**（`js/night-sky.js`）。

### 2.4 Atlas（自然言語コンソール）

- 自然言語で指示すると AI が**JSON のアクション計画**を返し、実ディスパッチャが実行する。
  明確な単一指示は**AIを介さない決定論パス `localPlan`** で即実行する。
- **IntMap の全機能に到達できることが恒久ルール**。到達経路は3つ：
  **DOM 操作**＝`control` ＋ `controlCatalog`、**レイヤー**＝`layer` ＋ `layerCatalogText`、
  **モジュール**＝`module` ＋ `moduleCatalog`（`window.IntMap*` を**自動発見**し、
  許可リストで制限したメソッドを名前で呼ぶ）。**新しく足したモジュールは配線なしで到達可能**になる。
- **実行結果は検証して正直に報告する。** 各アクションは構造化された `{ok,html}` を返し、
  効果（チェック状態・テーマ値・ハイライトの描画結果）を検証する。失敗は注意色で明示し、
  `run()` が実結果を集計してモデルの楽観的な `say` を上書きする。
- **返答は利用者のメッセージの言語**（UI 言語ではない）。判定できない言語は UI 言語へ落ちる。
- **画像入力（ビジョン）** — 入力欄に画像をペースト／ドラッグ／添付できる（最大4枚）。画像は
  地図志向のプランナーを経由せず `_atlVisionTurn` が **分類（`contentClass`）→ 転記 → 求解 →
  決定論的検算 → 統一レンダリング → 地理のときだけ地図化** を行う。**非地理クラスでは地点抽出を
  一切呼ばない**ので、数式や文書の語が地名に化けることが構造的に起きない。
- **返答の描画** — `js/atlas-reply.js` が安全な markdown（`IntMapSafe` でエスケープしてから整形）・
  KaTeX の数式・コードブロック・GFM 表・出典リンクカードを描く。
- **主なアクション** — 移動／ズーム／投影／3D／ベース地図／方位、レイヤー切替と不透明度、
  `highlight`（国・行政区分・通称地域の実境界）、`value`、`clear`、`locate`、`poi`（Overpass ＋ Wikidata）、
  `analyze`（実データを集めた統合分析）、`brief`、`answer`、`mapReport`（ライブニュース事件の地図）、
  `researchMap`（歴史・現在・混合のリサーチ）、`compareStats`、`mapMetric`、`scoreMap`、`explore`、
  `impact`、`population`、`drone`、`engine`、`module`、`control`。
- **リサーチ地図の二系統** — `mapReport` は**現在・直近のライブニュース事件のみ**、
  `researchMap` は歴史・現在・混合のリサーチで文章と地図を独立に生成する。
  **Request Profile**（時間軸・地理・要求出力を機械判定）と能力レジストリによる実行前プラン検証で、
  歴史質問がライブ専用の `mapReport` へ流れるのを実行前に防ぐ。
- **座標・URL・出典をモデルに生成させない**。`mapReport` は IntMap が集めた証拠に ID を付け、
  モデルは `{name,locationName,country,summary,date,evidenceIds}` だけを返す。クライアントが証拠 ID の
  実在を検証し、地名を geocode して位置を確定し、URL・出典・日付は**引用された証拠から**充填する。
  確認できない位置はピンにせず一覧だけにする。
- Atlas は通常モードでは **サイドバーの本物のタブ**（`#atlas-feed`）で、ワークスペースモードでは
  専用ウィンドウで開く。カーネル `js/atlas-console.js` は**押されてから取りに行く**（§9.3）。

### 2.5 アカウント・その他

- **アカウント／AI機能** — ログインで使えるアカウント制AI（1日上限つき。§5）。
- **テーマ** — System / Light / Dark ＋ **アクセントカラー**（アカウント同期）。
- **設定ページ** — 通常／モバイル／ワークスペース共通のモーダルを **8セクションの iOS 風グループ**に
  分けたもの（外観／レイアウトとパネル／地図の動作／単位と時刻／ニュースとティッカー／AI／連携・キー／
  情報とサポート）。
- **ウィンドウ・ワークスペース**（デスクトップ・既定オフ） — 地図・Information・News・Countries・
  Layers・Atlas が自由配置・全辺リサイズできる本物のウィンドウになる。レイアウトは localStorage に永続化。
- **下部ティッカー**（既定オフ・デスクトップのみ） — FX・株価指数・金銀・暗号資産・読み込み済みニュース
  見出し。表示銘柄は設定で選べる。`body.ticker-on` を flex 列にしているので地図に重ならない。
- **天気ポップアップ**（右クリック → 「ここの天気」） — Open-Meteo の現況＋5日予報。
- **Bug Report** — 診断情報を自動添付して Supabase `bug_reports` に送信（オフライン時はローカル＋
  クリップボード）。**フィードバック**、**寄付 (Stripe)**、**管理コンソール (`admin.html`)**。
- **多言語ニュース翻訳**（任意）。

---
## 3. ファイル構成と各ファイルの役割 (Files)

> ⚠ **`js/` の一覧は `node scripts/arch-files-check.mjs --check` が実体と突き合わせる。**
> ファイルを足す・改名する・分割するときは、ここも同じコミットで直すこと。
> 各ファイルの1行説明は、そのファイル自身の先頭コメント（`IntMap · …`）と同じ主題にする。

### 3.1 ルート

```
index.html                      公開用SPAのマークアップ＋ブート script（919行）。アプリ本体は js/app-body.js
admin.html                      管理コンソール（geo_pins / dashboard_cards / コミュニティ通報 / feedback）。
                                バンドラを通らない独立ページ。Supabase SDK は同梱版を読む
sw.js                           Service Worker。タイル等のキャッシュとオフライン補助。キャッシュ名は
                                バージョン付きで、activate が旧世代を消す。cache-first の対象は
                                「自分が知っているホストの、不変なタイル」だけに限定する
science.html / sources.html     読み物2ページ（手法の説明・出典の一覧）。バンドラを通らないので
                                言語一覧は scripts/i18n-langs.mjs が生成する js/locales/_langs.js から読む
google….html                    Google Search Console 認証用
package.json / package-lock     npm スクリプトと依存。dependencies がアプリに入る依存の唯一のリスト
.nvmrc                          Node のバージョン（CI・ローカル共通）
vite.config.js                  ビルド設定（チャンク分割・静的アセットのコピー・prebuild フック）
playwright.config.js            hermetic なブラウザ試験（webServer=scripts/serve.mjs）
playwright.prod.config.js       実 URL に対する本番スモーク（webServer 無し・retry 3）
CLAUDE.md                       Claude Code が毎セッション自動で読む恒久指示（作業の進め方・ワークフロー・
                                確認要件・報告要件・作業終了処理）。⚠ 秘密情報を書いてはならない
                                （このリポジトリは public）
CLAUDE.local.md                 同じ機構のローカル上書き。**追跡対象外**（.gitignore ＋ .git/info/exclude）。
                                公開できない資格情報だけを置く
CONSTITUTION.md                 標準指示（最優先のルール集）
Architecture.md                 本ファイル（現状仕様書）
DEV-NOTES.md                    直近ラウンドの開発記録（新しい順）
DEV-NOTES-ARCHIVE.md            それ以前の全記録（古い順・追記しない）
ATLAS-VISION.md                 Atlas の到達目標と実装状況の対応表
README.md                       公開向けの紹介（英語）
SECURITY.md                     脆弱性の報告方法と、公開値・秘密値の区別
LICENSE
koppen_mercator_*.png           ケッペン気候区分のベース画像（期間別）
koppen_mercator_*_4k.png        同・軽量版（携帯はこちらを使う。フル解像度は携帯で RAM 超過）
precip_mercator_1981-2010.png   年降水量の平年値（CHELSA V2.1 bio12）。_4k は軽量版
og-image.jpg / IntMap.Icon*.png OGP 画像とアイコン
TwemojiCountryFlags.woff2       国旗グリフ
USGS.能登.pdf                    地震モデルの検証に使った公表資料
_koppen_convert.py              ケッペン TIFF → PNG（データ前処理。実行時には不要）
_precip_convert.py              CHELSA → メルカトル PNG（同上）
_precip_years_convert.py        GPCC → 年別 PNG（同上）
_rail_convert.py                鉄道データ変換（同上）
```

### 3.2 `css/` / `src/` / `fonts/`

```
css/
  intmap.css                        アプリのスタイルシート全体
  pages.css                         読み物2ページ（science.html / sources.html）のスタイル
  fonts.css                         同梱フォントの @font-face
src/
  main.js                           js/ を index.html と同じ順序で import するエントリ
  vendor.js                         npm 依存を従来と同じグローバル名で再公開し、Supabase クライアントを作る
  locale-boot.js                    import.meta.glob('../js/locales/ui.*.js') で言語をディレクトリから読む（lazy）
  sat-worker.js / sat-worker-client.js      衛星の軌道計算（SGP4/SDP4）をワーカーで回す
  tsunami-worker.js / tsunami-worker-client.js  津波の伝播計算をワーカーで回す
  satellite-wasm-stub.js            satellite.js の wasm 経路を使わないためのスタブ
fonts/                              Inter（サブセット woff2 ＋ MapLibre 用 pbf グリフ）と Pretendard
```

### 3.3 `js/` — 中核

```
app-body.js                       アプリ本体（392 KB・最大のファイル）。状態宣言・ブート・地図構築・
                                  DOM 配線・map.on() ハンドラ・IntMapOS・セッション永続化・IM_HOST。
                                  ⚠ 新規機能はここに足さない。§3.13 の手順で別ファイルへ
geo-engine.js                     レンダラの継ぎ目そのもの window.IntMapGeoEngine（178 KB）
runtime.js                        1つのフレームループ・1つのタイマー・1つのライフサイクル
lazy-modules.js                   押されてから取りに行くモジュール window.IntMapLazy。⚠ 指定子はすべてリテラル
engine-select.js                  このセッションがどのエンジンで走るかを DOMContentLoaded 前に決める
cesium-engine.js                  第2エンジン——同じ契約の裏で動く CesiumJS
cesium-style.js                   style 言語の解釈器（式・フィルタ・色）。純粋なので Node から検証できる
cesium-layers.js                  Cesium のプロバイダとレイヤー描画
cesium-vector-tiles.js            第2エンジンのベクタタイル
cesium-input.js                   Cesium のカメラを MapLibre のジェスチャで動かす
i18n.js                           window.IntMapI18N — キー付き UI 表の組み立て
i18n-late.js                      後から足す翻訳と、ティッカー自身の設定パネル
lang-registry.js                  言語の唯一のリスト window.IntMapLang（code / label / html / alias と pick）
lang-switch.js                    言語変更は「待てるイベント」——文字列が届く前に描き直さない
locales/_langs.js                 生成物。読み物2ページ用の言語コード一覧（scripts/i18n-langs.mjs が書く）
locales/ui.<code>.js              1言語＝1ファイルの UI 文字列表（9言語）
locales/pages.<code>.js           読み物2ページの文字列表（9言語）
page-i18n.js                      読み物2ページの言語機械 window.IntMapPageI18N
sources-list.js                   sources.html の出典レジストリ（生成された一覧）
```

### 3.4 `js/` — 地図の表面

```
map-ui.js                         地図の周りの UI（レイヤーレジストリ／レイヤーサイドバー／ティッカー／
                                  レイヤープリセット／ラベルのポップアップ／GeoJSON 取り込み／共有ハッシュ）
map-tools.js                      対話ツール（投影ビュー・描画・Isolate・海路・見通し線・オブジェクト一覧・
                                  アウトライン・図形移動・到達圏・3-D 弧）
map-readout.js                    座標・標高・レイヤー値・コンパスの読み出しと経緯線
map-extras.js                     残りの自己完結した地図表面モジュール
map-pick.js                       地図上の1点を拾う window.IntMapPick
map-typography.js                 このアプリの文字——どの書体が描き、どれだけの幅で出るか
place-labels.js                   地名・海洋名ラベルと、そのローカライズ
label-scale.js                    ラベルの大きさ window.IntMapLabelScale
label-occlusion.js                名前を最前面に、地球の裏側のマーカーを隠す
border-style.js                   国境線を1本にまとめるスタイル層
grid-style.js                     経緯線のスタイル層
layer-dropdown.js                 レイヤーメニューとそのアコーディオン
layer-favs.js                     ★を付けたレイヤーとクイックピックのチップ
layer-previews.js                 レイヤーのサムネイル IntMapLayerPreviews
tile-warm.js                      カメラがこれから必要とするタイルを温める
wheel-zoom.js                     ホイールと、地図がどれだけ速く応えるか
view-controls.js                  傾きの上限と、視点高度の読み出し
basemap-switch.js                 携帯のベースマップ切替 window.IntMapBasemapSwitch
opening-view.js                   アプリが開く視点——黒い地球ではなく、光の当たった地球
theme-sky.js                      テーマと空——アプリの色と、太陽の位置
sky-model.js                      空自身の色（Rayleigh ＋ Mie を march する）
limb-layer.js                     このアプリが描く大気の縁 IntMapModules.limbLayer
night-side.js                     地球の夜側 window.IntMapNightSide
world-base.js                     全球衛星ベース window.IntMapWorldBase
satellite.js                      衛星画像コントローラ
sat-proto.js                      衛星タイルの imapsat:// スキーム
solid3d.js                        地図の上に立つ閉じた立体
streamline.js                     地理的なベクトル場の流線 window.IntMapStreamline
coast-mask.js                     求めた解像度での海岸線 window.IntMapCoastMask
land-mask.js                      同梱の陸／海マスク window.IntMapLandMask
bathymetry.js                     同梱の海底地形 window.IntMapBathymetry
dem-source.js                     標高の出所と深さ（terrarium の native max = z15）
geodesy.js                        極と日付変更線に安全な幾何 window.IntMapGeodesy
```

### 3.5 `js/` — データレイヤー

```
data-layers.js                    データレイヤーの目録＋エンジン（495 KB）。GROUPS が棚を決める
layer-packs.js                    追加レイヤーパック（地球と空／土地被覆／ベータ2／宗教・言語／
                                  タイムゾーン／GIBS の科学プロダクト）
wb-layers.js                      世界銀行指標の塗り分けと最新統計の更新
world-packs.js                    世界データ層——貿易・エネルギー・気象警報・潮汐・作物（282 KB）
precip-annual.js                  年降水量——国別平均ではなく実測グリッド
ocean-currents.js                 海流——同梱のアトラス盤
ocean-currents-field.js           海流——場のファイルの復号とストライド
osm-facilities.js                 実地調査された施設 IntMapFacilities
datacenters.js                    データセンターと AI インフラ IntMapDataCenters
cameras.js                        ライブカメラ層 IntMapModules.cameras
beta-overlays.js                  ベータのオーバーレイ IntMapModules.betaOverlays
time-borders.js                   時間軸の上の歴史的国境 IntMapTimeBorders
time-countries.js                 時計の年から見た Countries タブ
history.js                        歴史的国家／同一性／マディソン系列
us-elections.js                   すべての米大統領選挙 IntMapUSElections
industry-web.js                   産業の相関 window.IntMapIndustry
companies.js                      企業データセットと時価総額のライブ算出 IntMapCompanies
reference-data.js                 参照データ表
tables.js                         参照データ表（大きい方）
gazetteer.js                      ニュース地点解析の内蔵ガゼッティア
```

### 3.6 `js/` — ニュース

```
news-feed.js                      ニュースの取得・キャッシュ・見出しの翻訳
news-ui.js                        ニュース一覧・ピン・リーダー
news-context.js                   記事 → 場所／媒体の解決
news-sources.js                   どの媒体からニュースを取るか window.IntMapNewsSources
news-timeline.js                  ニュースのタイムマシン用タイムライン帯
newsgeo.js                        NewsGeo — 決定論的（非AI）のニュース地点解析
article-reader.js                 サイドバー内の記事リーダー
```

### 3.7 `js/` — Atlas と AI

```
atlas-console.js                  Atlas カーネル（自然言語コンソール／OS コマンド面。846 KB）
atlas-controls.js                 Atlas — 実 UI コントロールとモジュールメソッドへの全操作面
atlas-geo-resolve.js              Atlas — 場所・地域の解決とカメラの寄せ方
atlas-reply.js                    Atlas — 返答の描画（安全な markdown・コード／数式・GFM 表・出典カード）
atlas-sims.js                     Atlas — 飛行・弾道・爆風・標高・勢力のアニメーション表示
atlas-sources.js                  Atlas — 外部の証拠源（首脳・ライブニュース・POI カタログ）
atlas-verify.js                   Atlas — 回答のコード側検証（内容分類・算術・出典・地図化の可否）
atlas-attach.js                   Atlas — 添付ファイルの正体判定と全画面ビューア
atlas-loader.js                   Atlas に手を伸ばすと Atlas を取りに行く window.IntMapAtlas
ai-core.js                        Atlas の AI 通信・利用枠・設定
```

### 3.8 `js/` — 分析・パネル・シミュレーション

```
analysis-panels.js                分析パネル（時系列・AIリサーチ・相関・世界の出来事・学習モード）
stats-compare.js                  多国統計比較 IntMapStatsCompare
countries-ui.js                   Countries タブと国の詳細
companies-ui.js                   Companies タブ・比較ビュー・ダッシュボード
dash-extended.js                  ダッシュボードのキャッシュと拡張情報カード
widgets.js                        ウィジェット板 IntMapModules.widgets
tool-panel.js                     計測／半径ツールのパネルと地図のコンテキストメニュー
elevation-profile.js              標高断面のパネル
sims.js                           物理シミュレーションと太陽幾何（範囲人口・傾斜・電波・日照・到達圏・
                                  災害・地震リプレイ・放射性物質拡散）
seismic.js                        地震波シミュレータ（477 KB）
seismic-events.js                 過去の地震——公表された震源パラメータ
seismic-site.js                   場址項は周波数の関数である window.IntMapSiteAmp
seismic-subfault.js               破壊は1枚のすべる矩形ではない window.IntMapSubfault
earth-structure.js                この地震は何で、その下に何があるか window.IntMapEarth
fault-geometry.js                 描かれた輪郭は断層面の投影である window.IntMapFaultGeom
vs30-mask.js                      同梱の場址項 window.IntMapVs30
tsunami.js                        津波の伝播 window.IntMapTsunami
terrain-water.js                  地形の編集と水の流れ（194 KB）
water-dynamics.js                 水は届くまでに時間がかかる window.IntMapWaterDynamics
insolation.js                     地形の影と日照時間のエンジン
viewshed.js                       見通し線——高精度の地形可視領域
volume3d.js                       Measure ▸ 3-D 体積——実スケールの箱が空中に立つ
river-course.js                   どの区間が同じ川か window.IntMapRiverCourse
drone-nav.js                      ドローン航法——地形を見た飛行計画
drone-ops.js                      ドローンの運航条件 window.IntMapDroneOps
routing.js                        車／徒歩／自転車／公共交通の経路 IntMapRouting
routing-ops.js                    経路の分析 window.IntMapRoutingOps
```

### 3.9 `js/` — 宇宙・空

```
space.js                          宇宙エクスプローラ window.IntMapSpace（220 KB）
space-bodies.js                   ほかに何があるか（探査機・小惑星・太陽系外）window.IntMapSpaceBodies
space-cosmos.js                   太陽系の外へ出る距離の梯子 window.IntMapCosmos
space-events.js                   天文現象 window.IntMapSpaceEvents
space-sky.js                      地球の背後の実際の星空 window.IntMapSky
ephemeris.js                      惑星の実位置 window.IntMapEphemeris
night-sky.js                      地上の1点から見た空 window.IntMapNightSky
satellites-live.js                ライブ衛星 window.IntMapSatellites
satellite-detail.js               ライブ衛星——クリックの先の詳細カード
orbit-points.js                   衛星が実際にいる場所——軌道上の点
aircraft-detail.js                ライブ航空機——クリックの先の詳細カード
```

### 3.10 `js/` — シェル・アカウント・その他

```
mobile-ui.js                      モバイル UI とレスポンシブのシェル
window-manager.js                 浮遊パネルのドラッグ／リサイズ／重なり順
workspace.js                      浮遊ウィンドウのワークスペースモード（デスクトップ）
session-tabs.js                   タブバーと、その裏の OS 登録と、両方を復元するセッション
keyboard-shortcuts.js             キーボードと、それを一覧するカード
onboarding.js                     ウェルカムカード・案内デモ・進捗コントロール
screenshot.js                     スクリーンショットのボタン
search-geocode.js                 検索欄——問い合わせの前処理・ジオコーディング・結果カード
compare.js                        並べて／スワイプで比べる地図 IntMapCompare
playground.js                     Playground (beta) IntMapModules.playground
flight-sim.js                     フライトシミュレーター IntMapFlightSim（238 KB）
street-view.js                    ストリートビューのパネルと実カバレッジ IntMapStreetView
community.js                      コミュニティのフィード
community-board.js                コミュニティ板——一覧・カード・投稿・地図層
feedback.js                       フィードバックとバグ報告のモーダル
auth-ui.js                        アカウント・認証・Supabase のブート
legal.js                          利用規約とプライバシーポリシー
premium-plan.js                   プレミアムの節——ただしその全機能が無料である
monitors.js                       Area Monitors IntMapMonitors
weather.js                        気象 IntMapModules.{wind,weatherEC,weatherPanel}
wx-source.js                      ガードされた唯一の気象／UV ソース window.IntMapWx
wx-ecmwf.js                       ECMWF IFS モデル本体 window.IntMapECMWF——予報時刻軸・.om URL・復号済みの場・配色表
wx-wind.js                        風の粒子レンダラ window.IntMapWindGL——WebGL 1描画呼び出し／実経過時間基準
place-framing.js                  どこまで寄るか window.IntMapPlaceFraming
proxy-fetch.js                    CORS プロキシ経由の取得（相手先ごとに効くものが違う）
perf-hud.js                       実機の計器 `?perf=1`
admin-literal.js                  admin.html の初期データ読み取り——**評価器ではなくパーサ**
```

### 3.11 `data/`

```
gazetteer-world.json.gz           世界の地名の長い尾（cities1000 由来・18言語）。必要になった時に取得する
gazetteer-phone.json.gz           携帯が取りに行くのはこちら。上のファイルの先頭 12,000 行を切り出したもの
ecoregions_2017.geojson / .js     エコリージョン（自前ホスト）
railways_gauge.json               世界の鉄道（軌間別）
volcanoes_gvp.json                火山（Smithsonian GVP 完新世）
crust1.bin.gz / .json             CRUST1.0（地殻構造）
slab2.bin.gz / .json              Slab2（沈み込み帯のスラブ面）
tectonics.bin.gz / .json          PB2002（プレート境界）
vs30.png / vs30-phone.png / .json 場址項 Vs30 のラスタ
bathymetry.png / .json            海底地形
land-mask.png / .json             陸／海マスク
precip-mm.png / .json             年降水量の値格納ラスタ（8bit の log(mm)）と、その格子・帯・色
precip-year.png / .json           年別の年降水量（1枚に縦積み）
hdi-series.json                   HDI（UNDP）193か国 × 1990–2022
maddison.json                     マディソン・プロジェクトの歴史 GDP・人口
data/cshapes.js                   歴史的国境
us-elections.json / us-states.json  米大統領選挙
religion.json / language.json     宗教・言語の分布
osm-space.json / osm-diplo.json   宇宙基地・地上局／外交公館の全球スナップショット
ocean-currents*.bin.gz / .json    海流の場
stars.bin / stars.json / deep-sky.json / planets/ / planets.json / moons.json /
  planet-names.json / small-bodies.json / spacecraft.json                星表・天体
basins_mrb.json                   主要流域
gibs-range.json                   GIBS 各プロダクトの実配信期間（二分探索で実測したもの）
world-basemap.jpg / .json         粗い全球衛星ベース
tle/                              衛星の軌道要素カタログ（定期生成の同梱スナップショット）
```

### 3.12 `supabase/` / `docs/` / `scripts/` / `tests/` / `.github/`

```
supabase/
  config.toml                     ローカル/CI 用（本番非接続）。⚠ Edge Function は全8本をここに宣言する
  migrations/*.sql                DB の唯一の設計図（7本）。本番変更は必ずここを通す
  seed.sql                        100% 合成のシードデータ
  tests/*_test.sql                pgTAP（構造 ＋ RLS/権限マトリクス ＋ 関数。6本）
  functions/<name>/index.ts       Edge Functions（8本。§6.2）
  functions/_shared/              関数ではないライブラリ（newsgeo.js / relay-guard.js）
docs/
  TESTING.md                      テストの分類と走らせ方
  RELEASE.md                      リリース手順（**配信方法の正本**）
  MONITORING.md                   監視と、鳴ったときに見る場所
  INCIDENT-RESPONSE.md            本番障害・セキュリティ事故の runbook
  DATABASE.md / MIGRATIONS.md / RLS-TESTING.md / BACKUP-RESTORE.md / DATABASE-INCIDENT.md
                                  DB の構造・変更手順・権限テスト・バックアップ・事故対応
  SECURITY-ARCHITECTURE.md        脅威モデル・データフロー・CSP（**セキュリティの正本**）
  SECURITY-TESTING.md             セキュリティ検査の走らせ方
  AREA-MONITORS.md                Area Monitors の運用
scripts/
  serve.mjs                       依存ゼロの静的サーバ（GitHub Pages と同じ配信＝gzip も含む）
  static-checks.mjs               構文・JSON・YAML・マージ衝突・秘密検出・HTML 参照の存在
  doc-facts.mjs                   **文書間の固定事実の照合**（§15.5）
  arch-files-check.mjs            Architecture §3 と js/ の突き合わせ
  engine-coupling.mjs             レンダラ脱依存のゲート
  i18n-*.mjs                      翻訳の被覆と形の監査（§10）
  build-*.mjs                     data/ の生成（実行時には不要）
  run-tests.mjs / test-parallel.mjs / shard-plan.mjs / test-budget.mjs   テストの実行と予算
  backup-db.sh / restore-test.sh  DB のバックアップと隔離復元
tests/
  tests/smoke.spec.js                   hermetic なスモーク
  tests/internal-qa.spec.js             内部 QA（IntMapAtlasQA / IntMapRegionResolverTest / IntMapUIAudit）
  tests/prod-smoke.spec.js              実 URL に対するスモーク（PROD_URL）
  tests/security.spec.js                実ブラウザでの無害化確認
  helpers/network.js              hermetic なルーティングと console の分類
  r<n>-checks.test.mjs            ラウンドごとに追加された Node の回帰検査（122本）
  *.spec.js                       ブラウザ回帰（67本）
.github/workflows/
  ci.yml                          PR ＋ push main ＋ 手動。静的検査＋hermetic ブラウザ試験
  deploy.yml                      本番公開（**有効**。§15.4）
  rollback.yml                    手動ロールバック（履歴に実在する ref のみ）
  db.yml                          supabase/** 変更時の DB 検査（本番非接続）
  db-backup.yml                   休眠（Secret 2本が登録されるまで各 run skip）
  security.yml                    CodeQL ほかセキュリティ検査
  uptime.yml                      6時間ごとの死活監視＋Issue の自動起票／自動クローズ
  tle-refresh.yml                 衛星軌道要素スナップショットの定期更新
```

---

## 3.13 index.html の分割方式 — **今後の分割はこの手順に従うこと**

`index.html` は「マークアップ＋ブート」だけの状態にしてある。**新しい機能を `js/app-body.js` に足さない。**
新しい主題は新しいファイルにし、以下の規約を満たすこと。

### 手順

1. **切り出す単位は「継ぎ目」で選ぶ。** 大きい塊ではなく、外から見た依存が細い所で切る。
2. **ブロック全文をそのままファクトリで包み、代入なしで呼ぶ**：`window.X=(function(){ … })()`、
   あるいは `window.IntMapModules.x=function(HOST){ … }`。
3. **可変値はホスト・インターフェース `IM_HOST` 経由で読む。** クロージャ内で**再代入される**値
   （`currentLang` / `currentUser` / `currentProj` / `currentMapType` / `terrainOn` …）を値渡しすると
   古い値に固定される。`HOST.lang` のように毎回読む。
4. **不変値はファクトリ先頭で元の名前に束縛し直す**：`const imToast=HOST.imToast, …;`。
   本体は1文字も変えずに済む。
5. **`map` だけは第1引数**（boot 時に1回だけ代入され、全モジュール本体が裸の `map` を使うため）。
6. **パラメータ名は `HOST`**（`H` は既存の1文字識別子と衝突する）。
7. **書き込みが必要な値は RW メンバー**にする：`get x(){return x;}, set x(v){x=v;}` の1行ペア。
   変数の実体は元の場所に残る＝**単一の真実の源**。
8. **巻き上げが要る関数はシムを置く。** 元が巻き上げ関数宣言だったものは、`index.html` 側に
   `function f(){ return IntMapModules.x.f.apply(this,arguments); }` を置く（レシーバも引数もそのまま透過）。
9. **変数はエクスポートできない**（シムは関数にしか作れない）。

### `IM_HOST` の規約

- **メンバーは全て getter。** ⑴ **LIVE**：手順3の可変値が常に現在値になる。
  ⑵ **LAZY**：getter の本体は読まれるまで評価されないので、まだ定義されていない関数を掴まない。
- **RW メンバーは明示的に一覧を固定**する（`tests/r165-checks.test.mjs`）。増やすときはその一覧も直す。

### 「いつ取りに行くか」という第2の軸

置き場所とは別に、**起動時に読むか、押されてから取りに行くか**を決める。`js/lazy-modules.js` の
`window.IntMapLazy` が遅延モジュールを持つ（フライトシム／Playground／地震／津波／地形と水／
見通し線／ストリートビュー／夜空／Atlas カーネル）。

- ファクトリを呼んだ瞬間に**共有 UI を作らない**こと（レイヤー行やタブは、押される前に現れてはならない）。
- **入口が数えられること。** 右クリックメニュー・タブ・設定のボタン・Atlas の dispatch のどれから来ても
  同じ1つの入口に集まるようにする。出口（✕ / `close()`）も1つにする。
- 遅延モジュールは**開き終わったことを知らせる**。`OS.exec` が返す到着の Promise に繋ぐ——
  「終わった時刻を推定する」タイマーを書かない。

### 分割を守る検査

- `scripts/check-split-scope.mjs` … acorn で、手順3・7・9の不変条件を検査する。
- `scripts/static-checks.mjs` … 未読込のモジュール／呼ばれていないファクトリ／移設元の残骸を検査する。
- `tests/r162-checks.test.mjs` / `tests/r163-checks.test.mjs` / `tests/r165-checks.test.mjs` …
  ホストメンバーと RW 一覧を固定する。
- `tests/app-source.mjs` … 文字列一致の回帰テスト群が `index.html` だけでなく `css/` ＋ `js/` も読む。
- `tests/r163.spec.js` … **実ブラウザで実際に動かす**。静的検査だけでは束縛の誤りを捕まえられない。

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

- **鍵はサーバー（Edge Function）だけが持つ。** ブラウザは AI プロバイダに直接アクセスしない。
  モデル選択の UI も無い（利用者はモデルを選ばない）。
- **`ai-proxy`＝アカウント制AI。** `verify_jwt` に加えて関数内でもユーザーを検証し（未ログインは 401）、
  プラン別の1日上限を `increment_ai_usage` で**原子的に消費**する。
  上限は free 10 / plus 50 / pro 200 / unlimited 実質無制限。
- **入力の上限は本文を読む前に効かせる**：prompt と system は各 24,000 文字、画像は最大4枚・
  合計 12 MB。鍵・prompt・JWT はログに出さない。
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

| テーブル | 用途 |
|---|---|
| `profiles` | ユーザープロフィール（表示名・plan・login_count 等） |
| `current_news` | 事前AI解析済みニュース（subject/pub 座標、`analyzed_by`、`fetched_at` ほか） |
| `geo_pins` | ニュース地点解析の辞書。管理コンソールで編集し、`refresh-news` も読む |
| `favorites` | 保存記事（ブックマーク） |
| `user_prefs` | ユーザー設定の同期 |
| `dashboard_cards` | Information ダッシュボードのカード（管理コンソールで編集） |
| `ai_usage` | AI 利用量（1日あたりの消費）。`increment_ai_usage` / `refund_ai_usage` RPC で操作 |
| `community_posts` / `community_comments` / `community_votes` / `community_comment_votes` / `community_reports` | コミュニティ |
| `feedback` | フィードバック |
| `bug_reports` | バグ報告（診断情報 JSON 付き。anon が insert 可・admin が閲覧） |
| `donations` | 寄付記録 |
| `monitors` ほか | Area Monitors（§18） |

**DB の設計図は `supabase/migrations/` だけ**（全テーブル・制約・index・RLS・grants・トリガ・RPC）。
本番へ手で SQL を流さない。手順は `docs/MIGRATIONS.md`。

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
  ⚠ 上流の期限は 45 秒（上流の悪い日より短い制限時間は生きたフィードを落とす）。キャッシュは 60 秒。
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

### 7.1 気象・災害警報

**「どこで／何が／どれほど危険か／情報は新鮮か」の4つに答える**（`js/world-packs.js`）。
**その機関が発令した単位で塗る。** 世界の事象フィード（GDACS）は**完全に撤廃されている**——
コードは1行も残っておらず、`tests/r273-checks.test.mjs` が**書かれていた構文**で不在を確認する。
撤廃したからこそ、**未対応国を「静かな国」に見せない**仕組みが要る（下の3状態）。

自前フィードは **13本**（下表の 12 か国 ＋ MeteoAlarm）で、MeteoAlarm が EUMETNET の残り 35 か国を運ぶ。
合計 **47 か国**。**その外側は WMO の CAP 登録簿（SWIC）**が運ぶ——下表の最終行。

| 国・地域 | 出典 | 描く単位 |
|---|---|---|
| 日本 | 気象庁 `bosai/warning/data/r8/map.json`（官署ごとの最新1件） | **市町村 (class20)**。幾何は国土数値情報 N03 を **JIS X 0402** で引く（class20 コードの上5桁が JIS コード。実測 1,805 中 1,774 が直接一致、残る31は政令指定都市・離島で区の合併により解決） |
| 米国 / カナダ / ブラジル / ドイツ / ノルウェー | NWS / ECCC / INMET / DWD WFS / MET Norway | 各機関の**警報ポリゴン**（DWD は郡） |
| ヨーロッパ35機関 | MeteoAlarm（`alerts-relay` が要約） | **4段の形のはしご**（下記）——CAP の `<polygon>` → **その機関自身が WMO 登録簿に出している形** → Eurostat NUTS 2/3（20M）→ 区域名が国名そのものなら国境 |
| 中国 | CMA（relay） | **発令 ID が名乗る行政区画**——`alertid` の上6桁は GB/T 2260 コードなので、**区・県 → 地級市 → 省** の順に引く（DataV.GeoAtlas） |
| オーストラリア | BoM | **州**（Natural Earth 50m admin-1） |
| フィリピン / 台湾 / ニュージーランド | PAGASA / 中央氣象署（NCDR 経由）/ MetService | **CAP 索引を読む1本の関数**（relay `?cap=`）。台湾はポリゴンの無い区域を**郷鎮市区**で引く |
| 香港 | HKO | 香港全域＝発令単位そのもの |
| **上記以外** | **各国気象機関（WMO Severe Weather Information Centre 経由）** | **その機関自身が描いた CAP ポリゴン**。対象は WMO が「CAP 実装 Completed」と記録している加盟国だけ（実測 93 か国が追加され、未対応は 206 → 112 に減る） |

- **国の3状態は3つの見え方を持つ。** ⑴ フィードが無い国＝**灰色斜線**（`fill-pattern`・`wp-alert-hatch`）、
  ⑵ フィードがあり何も出ていない＝**灰色**（気象庁自身の `#c8c8cb`）、⑶ 発令中＝その階級の色。
  **「警報なし」と「データなし」は別。**
- ⚠ **灰色は「読んだうえで何も無い」という主張なので、答えた機関にしか塗らない。** `readState(iso)` が
  `none` / `loading` / `ok` / `error` を返し、`washTier` は **`ok` 以外をすべて斜線**にする。
  MeteoAlarm も WMO 登録簿も**輪番で読む**ので対応国でもまだ読めていない瞬間があり、上流が落ちている瞬間も
  ある——実測、`www.nmc.cn` はエッジから断続的に到達できず（45 秒 × 2 回とも timeout。上がっているときは
  0.9 秒）、**1,235 件が発令中の中国が「発表なし」の灰色**になっていた。斜線は「この地図は何も述べていない」
  で、**どの沈黙なのか**（未対応／順番待ち／取得不可）はタップした地点のカードが**言葉で**言う。
  パネルの `unread` は**0 に落ちなければならない数**である。
- ⚠⚠ **国全体の灰色・斜線は、発令単位の塗りの<b>下</b>に置く。** 実測、`wp-alert-fill` が style index 34、
  `wp-alert-choro` が 39——どちらも `before` を指定しておらず、薄塗りの側が後から着地するため、
  **発令中の区域の上に 42% の灰色が乗っていた**。`ensureChoro()` は `wp-alert-fill` を **名前で**
  `before` に指定する（順序が非同期の着地順に依存してはならない）。
- ⚠ **国は「発令単位で描く」か「薄塗り」かのどちらかで、両方はしない。** 置けなかった区域のために
  描画済みの国まで薄塗りすると、日本を市町村で描いたとき **1,490 のうち 11 置けないだけで全土が着色**される。
  置けなかった数は**言葉で**印字する（`placedLine`）。
- **配色は2モードで、既定は各機関の公式配色**（`localStorage['im.alertPal']`）。
  ① **各国公式** … 気象庁 `#f2e700`/`#ff2800`/`#aa00aa`/`#0c000c`（**気象庁自身のページの
  `.contents-levelNN` から読み出した値**）、中国気象局の四色予警信号、その他は CAP の黄／橙／赤。
  ② **IntMap 換算** … 独自の4段階で、**どの機関の配色とも1色も共有しない**うえ、パネルが
  「IntMap 独自の換算であり、同じ段でも国どうしの危険度が等しいという意味ではない」と明示する。
  地物は `colA`（公式）と `colN`（換算）の**両方**を持つので、切替は**再取得ではなく塗り替え**。
- ⚠⚠⚠ **災害名は読み手の言語で書く。** 実測、1つの画面に「Thunderstormwarning」（墺）・「ORAGE」
  （象牙海岸）・「STARKES GEWITTER」（独）・「Mye regn」（諾）・「Baixa Umidade」（伯）・「降雨」（台）・
  「大风蓝色」（中）・「大雨」（日）・「ارتفاع درجات الحرارة」が同時に並んでいた——8言語3文字体系で、
  どれも読み手の言語とは限らない。`HAZ`（25 の災害 × 各機関が実際に書く語のパターン）が分類し、
  `L()` が設定言語で名前を出す。⚠ **勝つのは「一番早く一致した」パターンであって表の先頭ではない**——
  先頭語が災害で残りは限定だから（「Strong Wind and Large Waves」は wind、「雷雨大风」は thunderstorm、
  「rain-flood」は rain）。同着は表の順で決め、それが「VENT DE SABLE」を砂嵐に入れる。
  ⚠ **機関の言葉は捨てず、並べる。** 地物は `hzr`（機関自身の表記）を持ち、タップしたカードが
  「訳語（原語）」の形で両方出す。表に無い語は**訳さずそのまま**出す（プレースホルダに潰すほうが失う）。
  ⚠ **階級は災害名ではない**——本文が「Yellow Warning」だけの行は災害を名乗っていないので名前に使わない。
  ⚠ 言語を切り替えると `relabel()` が**取得し直さずに描き直す**（`hzr` が地物にあるので再取得は要らない）。
  ⚠⚠ **災害名の英語は、その災害だけの鍵でなければならない。** 6言語目以降（fr / ko / 中文）の索引は
  **英語の文字列で引く**ので、他の呼び出し箇所が同じ英語を別の意味で使っていると、そちらの訳が出る。
  実測: 雹を `L('Hail',…)` と書いたところ、`js/time-borders.js` に `LA('Hail','ハーイル',…)`
  ——サウジアラビアの**都市** حائل——が既にあり、4つの表はその都市で埋まっていた
  （fr《Haïl》/ ko《하일》/ 中文《哈伊勒》）。**欠落も未翻訳も無いまま、地図が都市名を災害として
  印字する**ところだった。同じ理由で `Wind` / `Fog` / `Snow` / `Heavy rain` / `Thunderstorm` も
  他の呼び出しに使われていたので、災害側は `Strong wind` / `Dense fog` / `Heavy snow` /
  `Heavy rainfall` / `Thunderstorms` という**自分の鍵**を持つ。`tests/r277 ⑩` が
  「1つの英語の鍵が2つの意味を持たないこと」を検査する。
- **種別は地図の上に文字で出る。** 区域は災害名を持ち、同じ区域に複数出ていれば `+N`。
  z5 未満は短縮形、以上は正式名。⚠ **`text-field` に `['step',['zoom'],['get',…]]` は書けない**
  （style 時に落ちてページごと死ぬ）ので **2レイヤーの `minzoom`/`maxzoom`** で表す。
  ⚠ 短縮形は**頭字語ではない**——階級語を落として災害語を残す（頭字語にすると読み手に鍵が無い）。
- **塗りは薄い。** 既定の不透明度は **0.38**（他レイヤーと同じ `_registerLayerOpacity` の**共通スライダー**が
  動かす。専用のボタンは作らない）。階級は**輪郭線**が持つので、塗りを透かしても答えは残る。
- **更新は 30 秒**（`TICK_MS`）＋タブ復帰で即時。**フィードの鮮度は4段階**——
  Fresh（≤6h）／ Delayed（≤48h）／ Stale ／ Error。⚠ これは**フィードについての語**であって、
  発表が無い機関は「静か」であって「故障」ではない、とパネルが自分で書く。
- ⚠⚠ **多国フィードは「初回読み込みの待ち行列」ではなく「輪番」である。** MeteoAlarm は1リクエスト
  6か国（relay の上限）× 2本／tick、対象は**最後に読んだ時刻が古い順**（未読が先）。35 か国を約 90 秒で
  一周する。**「まだ持っていない国」だけを候補にすると、届いた瞬間に候補から外れて二度と更新されない**
  ——実測、修正前は8分間・80回の更新で MeteoAlarm へのリクエストは**3本**で、以後は**ゼロ**だった。
  `maAt` / `swicAt` が国ごとの取得時刻を持ち、パネルの `maOldestS` / `swic.oldestS` が
  「最後に読んだのが一番古い国の年齢」を印字する（**増え続けたらそれが凍結**である）。
- ⚠⚠ **一周は「エッジキャッシュの寿命」に合わせる。** relay のキャッシュは 60 秒なので、
  それより速く同じ国を聞いても**同じバイトが返るだけ**で上流は新しくならない。逆に 90 秒はその床より
  遅い。tick 30 秒 × **1リクエスト6か国 × 3本** ＝ 35 か国を **60 秒**で一周する。
- ⚠⚠ **`busy` はラッチではなく<b>数</b>である。** 全バッチを1つの `Promise.all` に入れて1つの真偽値で
  守ると、**一番遅い国が次の tick を決める**——実測、3本にしたのに最古が 108 秒まで伸び、2本のときより
  悪化した（10 MB の上流取得が 30 秒を超えると次の tick が丸ごと空振りする）。`maBusy` / `swicBusy` は
  **飛んでいるバッチの数**で、遅い1本は3枠のうち1枠を占めるだけ。`maPend` / `swicPend` が
  「いま飛んでいる国」を持ち、二重取得を防ぐ。⚠ `maAt` は**完了時にだけ**書く（先に書くと停止が隠れる）。
- ⚠ **WMO 登録簿は「誰かに何か出ているか」を先に1回で聞く。** `?swicscan=1` は GeoServer の
  `propertyName` から**幾何列を外した**同じ問い合わせ（実測 1.53 MB・1.5 秒で全世界 4,427 区域）で、
  形を落とさずに「どの加盟国に何件あるか」を答える。形を取りに行くのはそこに出ている国だけなので、
  93 か国が**最初の tick で読み終わる**。⚠ `propertyName` に `wkb_geometry` を書き忘れると
  GeoServer は**全地物を `geometry: null` で返す**（実測、韓国 37 区域が形なしで「取得成功」した）。
- **パネルは「いま何が起きているか」から始まり、そこは1国1行である。** 〈色・国・災害（最悪順、入り切らない
  分は `+N`）・階級・区域数〉。⚠ **国 × 災害で並べると1国が何行も占める**——実測、14行のうち**5行が中国**、
  4行がイタリア、2行が豪で、残りの世界は「+59」だった。⚠ **行に印字する階級はその行の階級**である
  （旧実装は国全体の最悪値を1つの災害名の横に出し、CMA の**黄色**に「Red (I)」と書いていた）。
  取得先の一覧（`Source status`）とその下の `Diagnostics`（置けなかった区域）は畳んである。
  数字は**全ソースで「区域数」に統一**する。
- **押した地点の警報は別のカードに出る**（`.country-panel` ではなく `.country-popup`＝アプリ共通の詳細カード）。
  当たり判定は**描かれている地物の幾何**（`ptInGeom` / `alertsAt`）なので、答えは「日本なら市町村、ドイツなら郡、
  その他はその機関が描いたポリゴン」。⚠ **凡例は上書きしない**——タップで「いま世界で何が起きているか」が
  消えるのが旧実装で、国全体の一覧はカードのボタンから開く。同じ答えは `__wpAlerts.at(lng,lat)` でも取れる。
- `drawnISO` は**実際にソースに載った地物から毎回作り直す**（`publish()`）。「自分の単位を描いている国」は
  表ではなく**測定**である。⚠ **手書きの対象一覧を作らない**——その一覧に国が増える日に嘘になる。
- 名前の突き合わせは**両側に同じ正規化**（`_norm`：アクセント畳み・記号除去・単位語の除去）を通し、
  `_alias()` が `|` `/`・括弧つきの別綴り・**先頭の行政語**（`Prov.` / `Région de` / `Landkreis` …）を外した形・
  **`A; B; C` の各要素**を索引に入れる。`lookupUnit()` は完全一致 → 語の接頭辞・接尾辞（4文字以上）→
  **索引側の接頭辞**（＝索引の鍵が問い合わせで始まる。「Antwerp」→「Prov. Antwerpen」、
  「Viseu」→「Viseu Dão Lafões」）の順に試し、⚠ **索引側は一意に決まるときだけ**採用する
  （二つに当たる語幹はコイン投げであり、違う区域に警報を描くのは描かないより悪い）。
  ⚠ **片側だけの正規化はコイン投げ**になる。

**発令区域の形を、4段のはしごで探す**

実測、MeteoAlarm の35か国で公表 1,127 区域のうち**置けたのは 754**——373 区域が地図から静かに落ちていた
（オーストリア 86／スロバキア 59 全部／ベルギー 9 全部／クロアチア 13 全部／スペイン 64／モルドバ 42 全部）。
原因は1つで、**MeteoAlarm の CAP はそれらにポリゴンを持たず**（`<geocode>` は `EMMA_ID` だけ）、
区域名が**その機関自身の呼び名**で Eurostat NUTS の名前ではないこと——「Rijeka region」「Wien Brigittenau」
「Meseta cacereña」「Košice okolie」。

| 段 | 形の出どころ | 効く国（実測） |
|---|---|---|
| ① | CAP 自身の `<polygon>` | 英国・オランダ |
| ② | **同じ機関が WMO 登録簿に出している形**（relay `?swicgeo=<mid>`） | 墺・斯・西・波・塞・波黒・克・希・斯洛 … |
| ③ | Eurostat NUTS 2/3 | 伊・仏・独 … |
| ④ | 国境そのもの（**区域名が国名のときだけ**） | 塞浦路斯 |

**実測 754 → 965 / 1,127**、ビルド済みページの全フィード合計では **3,093 / 3,261**。
残りは国ごとに「置けた数／公表数」を**言葉で**印字する（丸めない）。
⚠ **② は「第2の警報ソース」ではない**——`?swicgeo=` が返すのは **区域名と形だけ**（event も severity も
時刻も入っていない）。何が発令されているかは今もその国のフィードが答えるので、**一国一ソース**は保たれる。
⚠ **② は有効期限で絞らない。** 警報は期限切れになるが、その警報を描いた郡は期限切れにならない。
⚠ 座標は小数4桁（約 11 m）に丸める——実測、オーストリアの生データは 1.5 MB、要約後 1.07 MB。

**出典の言葉で読む**

- ⚠ **気象庁のコード表は気象庁のものを置く。** `JMA_CODE` は気象庁自身の警報ページが持つオブジェクトから
  取った「コード → 要素 ＋ **レベル**（20/30/40/50）」で、**階級はレベルだけ**から決める
  （コードの数値範囲から決めてはならない）。⚠ 指定河川洪水予報の表は混ぜない（コードが衝突する）。
  検証は出典自身の言葉で行う（`headlineText` の文言と要素名が一致するか）。
- ⚠ **現在の状態は「官署ごとの最新1件」。** `r8` は速報の一覧なので、全部足すと後の速報が解除した警報が
  復活する。最新が 72 時間より古ければ **throw** する。
- ⚠ **全フィードが自分の時計を持つ。** `seenAt(feed, iso)` が**そのペイロードの一番新しい時刻**を記録し、
  パネルが機関ごとに年齢を印字する。**年齢は常に印字する。**
  ⚠ **有効期間は発表時刻ではない**——CAP の `onset`/`expires` は有効期間なので、`seenAt` は未来を拒否し、
  リレーの `fetchedAt` を使う。
- ⚠ **上流の「悪い日」より短い制限時間は、生きたフィードをランダムに落とす。** 上流の期限は 45 秒＋1回の
  リトライ。投げっぱなしのローダには**自前の in-flight ガード**を持たせる（`Promise.all` する側の
  `busy` は自分しか守らない）。
- ⚠ ライブ取得は全て `cache:'no-store'`（付けないと定期タイマがキャッシュを読み直す）。
- ⚠ **遅いフィードを `Promise.all` に入れない。** 公開される地物は「待ち合わせた分＋各ローダが着地させた分」を
  1か所（`publish()`）で組み立てるので、遅いフィードが早いフィードを白紙にできない。
- タップは `grouped()` の3段（admin-1 → sub → 市区町村）。同じ災害の組合せを持つ市区町村は1行にまとめる
  （**markup にも予算がある**）。
- ⚠ **公開フィードが見つからない国は、灰色斜線で「データなし」と言う。** 空の地図に「平穏」を含意させない。
- **「対応国をどこまで増やせるか」は測れる。** 実測（同じ分）: WMO の加盟表に ISO コードを持つ加盟機関は
  **198**、そのうち WMO 自身が「CAP 実装 Completed」と記録しているのは **139**——この地図はその全部を
  読んでいる（自前フィードの国を含めて **140**）。残りは **Development 37 ／ Not started 20** で、
  **登録簿の全球スキャンに1件も現れない**（実測、スキャンに出た 37 機関はすべて Completed）。
  つまり **「CAP を出しているのに読んでいない加盟機関」は 0 である。**
  ⚠ 加盟表の外を足すには、その機関が**機械可読で、発令単位ごとに**出していなければならない。
  実測（12機関を叩いた結果）: 印 IMD **401**（IP 制限）／土 MGM **500**（Not allowed）／墨 **500**／
  南ア **404**／泰・尼・越・智・亜・以 **404 または 403**／新 SGP はデータ無し。
  唯一答えたのは **馬 MET Malaysia**（`api.data.gov.my/weather/warning` · 200 · JSON）だが、
  中身は**散文**で（「over the waters of Pahang • Terengganu • Northern Sarawak」）、
  `<area>` も geocode もポリゴンも無い——**出典が分けていないものを地図が分けてはいけない**ので、
  これを区域に切り出すのは実装ではなく捏造になる。よって**足していない**。
- ⚠⚠ **MeteoAlarm の「緑」は警報ではない。** CAP の `parameter[awareness_level]` が `1; green; Minor` の行は
  「注意の必要なし」で、**発表中の警報ではない**。実測、イタリアの 474 件のうち **201 件が緑**、ベルギーは
  フィード全体（10 区域）が緑だった——`severity` だけを読むと緑が `Minor`/`Moderate` として警報の色になる。
  ⚠ **災害名の文字列で代用してはならない**：イタリアは event に色名を書くが、オーストリアは書かない
  （`Thunderstormwarning` 796 件、すべて awareness 2）。階級は **2/3/4 → CAP の 1/2/3**、緑は**落として数える**
  （relay が `green` を返し、黙って消さない）。

### 7.2 レイヤー欄の分類

`js/data-layers.js` の `GROUPS` が **18 の棚に 136 行**を配る。`GROUPS` に無い行は末尾の
**「Others」**と**「ベータ」**へ自動的に掃かれる（ベータは削除ではなく1段下の棚）。

| キー | 名前（EN / JA） |
|---|---|
| `lyrGrpClimate` | Climate & weather / 気候・気象 |
| `lyrGrpOrbit` | Space & orbit / 宇宙・軌道 |
| `lyrGrpMaritime` | Oceans & maritime / 海洋・船舶 |
| `lyrGrpTerrain` | Terrain & elevation / 地形・標高 |
| `lyrGrpNature` | Nature & land cover / 自然・土地被覆 |
| `lyrGrpDemo` | Population & demographics / 人口・人口動態 |
| `lyrGrpHazard` | Hazards & emergencies / 災害・緊急 |
| `lyrGrpPolitics` | Politics & governance / 政治・統治 |
| `lyrGrpSecurity` | Defense & security / 軍事・安全保障 |
| `lyrGrpHealth` | Health & sanitation / 医療・衛生 |
| `lyrGrpTech` | Technology & infrastructure / IT・技術インフラ |
| `lyrGrpEconomy` | Economy & trade / 経済・貿易 |
| `lyrGrpSociety` | Society & education / 社会・教育 |
| `lyrGrpTransport` | Transport & mobility / 交通・輸送 |
| `lyrGrpAgri` | Agriculture & food / 農業・食料 |
| `lyrGrpEnergy` | Energy & resources / エネルギー・資源 |
| `lyrGrpIndic` | Indicators & overlays / 指標・オーバーレイ（空。キーは保持） |
| `lyrGrpOthersReal` | Others / その他（空。キーは保持） |
| `lyrGrpOthers` | Beta / ベータ（`GROUPS` に無い行の落ち先） |

規約:

- ⚠ **1つの id は1つのグループにしか書けない。** `order.push` は要素を**移動**させるので、2箇所に書くと
  最後のグループにしか出ない。`tests/r271-checks.test.mjs` が全 id の一意性を検査する。
- ⚠ **全グループキーは9言語すべてに見出しを持つ**こと（同テストが検査する）。
- ⚠ **行が0のグループはキーを残す**（保存済みセッションや共有リンクが名指しできる。描画はされない）。
- ⚠ **`lyrGrpOthers` のキーは変えない。** `js/map-ui.js`（タイルのベータ判定）と `js/layer-dropdown.js`
  （携帯での折りたたみ）が名指しで使っているので、改名すると携帯でベータ節が畳まれなくなる。
- **基本表示カテゴリ**（地名・国境・州県境・道路・鉄道・グリッド・国情報）に**昼夜の表示**
  （`dl-nightside`）が入る。これは「地球のどちら側に太陽があるか」という常設のビュー切替であって
  レイヤーではないので、`_refreshActiveLayers()` の `skip`、`window._imActiveLayerCount`、
  `js/widgets.js` の `FEAT_IDS`（ルーレット）のいずれにも入れない。
  ⚠ 常設スイッチへ移した行は `placed` にも入れること（入れないと掃き出しでベータにも現れて二重になる）。
- **行 id の接頭辞**は `rowFor()` が知っている必要がある（世界データ層 `wp-dl-`、施設層 `fac-dl-` など）。
- **分類の規則は1つ——レイヤーは、それが測っている主題に属する**（作った計器でも、対象の場所でも、
  出てきた表でもない）。
- ⚠ **過去の指示で beta へ降格されたものを、勝手に昇格させない**（「beta」は品質の判断、分類は主題の判断）。

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

### 7.4 タイムマシンと「年」

- **時刻はマスタークロック `window.IntMapTime` 1本**。⚠ **2つ目の時計を作らない。**
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

### 7.5 地図の初期化・基図・投影

- **初期化**：`map = new maplibregl.Map(...)`。`renderWorldCopies` は投影／自由パンに応じて切り替える。
  基盤は CARTO / Esri のラスタ ＋ OpenFreeMap のベクタ（`ofm`）。
- **基盤切替**：`btn-view-map/sat` と `applyTheme()` ＋ `_reassertBase()`（スタイルロード競合に強い
  ポーリング再適用）。⚠ `applyTheme` は `styledata` を同期で発火しうるので**再入禁止フラグ**を持つ。
- **投影**：Flat (mercator) / Globe。3D 地形は terrarium DEM（複数ホストで並列取得。携帯は maxzoom 13）。
- **タイルの密度はバイトで言う**：`maxTileCacheSize` は 512² のタイルを前提に決める（256² 前提の枚数を
  そのまま使うとメモリが4倍になる）。
- **衛星タイルは `imapsat://` プロトコル**（`js/sat-proto.js`）。@2x の綴じ合わせは「無い画像」に払わない
  ——z10 近傍ごとに `have`（実画像が見えた最深）と `stop`（次の段が灰色だと**観測された**最深）を
  **別々に**持ち、止めてよいのは `stop` だけ。記録は**訊かれたタイル**に対して行う（祖先に対してではない）。
  観測は `window.IntMapSatProto.depth/wouldStitch/hiDPI`。
- **粗い地球全体の衛星ベース**：`js/world-base.js` が同梱の正距円筒画像から `imapworld://` で低ズーム
  衛星タイルを**ネットワーク無しで**生成し、`layer-sat` の下に敷く。
- **極冠 (±85.0511°〜±90°)**：Mercator にそこのタイルは存在しないので、`layer-polar-cap`
  （スタイル配列の先頭に宣言された `background`）が**どのベースマップでも**敷かれる。
- **背後の星空・太陽・月**：`js/space-sky.js`。ダークテーマ ＋ globe ＋ 自前の空を持たないエンジンのときだけ、
  `#map` の**下**の `#space-canvas` に実カタログの星（`data/stars.bin`）と実位置の太陽・月を描く。
  月は満ち欠けを描く（照射率・明縁の位置角・明暗境界楕円・地球照）。太陽は周縁減光した円盤＋光冠＋コロナ。
  数値は `window.IntMapEphemeris` から来る（テクスチャではない）。
- **大気の縁**：`js/limb-layer.js`。`js/theme-sky.js` の `_sunElevAtCentre()` は
  ⑴ 衛星写真でなければ `null`（標準マップに大気は出さない）、⑵ **昼夜表示がオフなら 90°**
  （`_aimSun()` がカメラ中心の真上へ向けた光の読み戻し）、⑶ それ以外は実際の太陽高度を返す。
  ⚠ **「モードをオフ」は「その量が不明」ではない**——`null` を返すとアプリ自身の大気がそもそも点かない。

### 7.6 ラベル

- **地名ラベル**：`ensurePlaceLabels()` が `ofm` の `place` レイヤから `ofm-country` / `ofm-city` /
  `ofm-other` を生成する（冪等）。`cb-names`（既定 ON）で表示。
  ⚠ **市区町村より下の階層は `ofm-other`**：`village` / `suburb` / `hamlet` に加えて
  `borough` / `quarter` / **`neighbourhood`** / `isolated_dwelling` / `farm`。
  綴りは **`neighbourhood`**（OpenMapTiles のスキーマ値。US 綴りは1件もマッチしない）。
  クラスを3段に分け、`['step',['zoom'],1, 13,2, 14,3]` で開く。⚠ **段は整数**
  （`['zoom']` はフィルタ内では整数ズームでしか再評価されない）。
- **地方行政区分ラベル**：同じ `place` レイヤの `state` / `province` クラスから `ofm-admin1`。
  ここでの `rank` は**面積で世界規模にそろった順序**なので、ズームの階段は国別ではなく rank 別。
  ⚠ **色は「その区分を描いている線の色」**＝`js/border-style.js` の `ADMIN1_COLOR` を**そのモジュールから
  読む**ので、破線とラベルが食い違わない。⚠ ハローは**両基図で暗色**にする（コントラストはハローの仕事）。
  ⚠ **クリック／ホバーの一覧に入っている**（地図の上では都市名と見分けがつかないので、答えないラベルは
  壊れた機能である）。4つの一覧（レイヤー別クリック・カーソル・厳密ヒット・パディング付きタップ）は
  `PLACE_LBL` / `ALL_LBL` から**導出**するので、片方だけ更新できない。
- **ポップアップは名前を2つ出す**：「現地名（地図がそう描いた名前）」。`showPopup(…,{title})` は
  **見出しだけ**を差し替え、`name`（コピー・Wikipedia 照会・AI ブリーフ・境界検索が使う識別子）は
  タイルの `name` のまま。2つ目の名前は `applyLabelLang()` が `text-field` を組むのと**同じ**
  `OSM_NAME_KEYS(lang)`（`window.IntMapOsmNameKeys`）から求めるので、言語一覧は1つしかない。
- **細かい地名ラベルの範囲ハイライト**：`IntMapOutline.fetchPolygon` は Nominatim を**2段**で引く。
  ① クリック地点の ±0.06°・`bounded=1` ＝結果をその近傍に**限定**、② 見つからなければ ±8° の viewbox
  （ヒントであって限定ではない）。⚠ 順序が本体（±8° は再ランクするだけなので、細かい地名は同名の有名地に
  枠を奪われる）。⚠ ポリゴンが存在しない place ノードには**何も描かない**（点に長方形を被せない）。
- **水域・地形ラベルと河川**：`geo-sea` / `ofm-water` / `ofm-water2` / `ofm-river` / `ofm-peak` は
  クリックでポップアップ（面が無いので「この地域だけ」「移動」は出さない）。
  **`ofm-river` だけは、その河川を線でハイライトする**。選び方は `js/river-course.js`：
  **名前の集合**（`name`・`name:xx`・`name_xx`・`int_name`・`alt_name` を正規化）を作り、
  **共有する名前で推移的に**タイル内の `waterway` 区間を繋ぐ。⚠ **1つの名前で比較してはいけない**
  （河川は国境ごとに改名され、`name:en` だけが共通という形が普通）。
  そのうえで `course()` が OSM に実流路を訊く（Nominatim →（駄目なら）Overpass）。
  ⚠ **タイルのハイライトを先に描き、それを取り上げない**（取得は後から届き、届かないこともある）。
  ⚠ `course()` が受け取るのは「押された区間」ではなく**閉包そのもの**（全名前・範囲・代表点）。
  ⚠ 門は「クリックからの 40 km」ではなく「**すでに一致しているタイル区間のどれかからの 40 km**」。
- **ポイント地物はタイル直描画／ラベル線地物は初見ピン留め。** 見えているアンカーを「改善」目的で動かさない。
- **ラベルのサイズ**：全レイヤーが `window.IntMapLabelScale`（`js/label-scale.js`）から取る。
  地名以外は必ず地名の基準の 0.88 倍以下。
- **施設・店舗名**：同じ `ofm` の `poi` レイヤから `ofm-poi`（テキスト）＋ `ofm-poi-dot`（点）。z14 〜、
  `rank` の窓をズームで開き、`symbol-sort-key` で衝突順も同じ順序にする。`cb-poi`（既定 OFF）。
- ⚠ **閉じる × は U+00D7 ひとつに統一する。** 実測 `measureText` 16px で **U+2715 は Inter・Noto Sans JP・
  system-ui・sans-serif・Arial の全部で 13.07px**（＝どれも持たず記号フォント落ち）、**U+00D7 は
  10.59/16.00/10.95/16.00/9.34**（＝Inter が持っている）。定義は `window.IntMapClearGlyph()` ただ1つで、
  `tests/r273-checks.test.mjs` が js/ と css/ の**全ファイル**を掃く。位置は**それが属する入力欄の矩形**から
  決める（`top:50%` は位置指定の祖先に解決されるため、包み箱と入力欄の高さが違うとずれる）。

### 7.7 レイヤー個別の注意

- **年降水量**（`dl-annprecip` / `js/precip-annual.js`）— **平年値**は CHELSA V2.1 bio12（30秒角 ≒ 1 km、
  1981–2010）をメルカトルに再投影したもの、**年別**は GPCC Full Data Monthly V2022（DWD、0.5°、
  陸上の雨量計解析）の 1981–2020 を1枚に縦積みしたもの。**色は16段の帯**（連続ランプではない——
  色から範囲へ正確に戻せる）。数値の読み出しは絵を読まず `data/precip-mm.png`（8bit の log(mm)）を読む。
  ⚠ **格子と帯と色は `data/precip-mm.json` / `data/precip-year.json` から読む**（JS 側に写さない）。
  ⚠ 海の上で雨量計解析は何も言わないので、陸だけを塗る。
- **GIBS ラスタ** — 各プロダクトの**実配信期間**は `data/gibs-range.json`（範囲外 404・範囲内 200 を
  二分探索して実測したもの）。⚠ NDVI はローリング窓、土壌水分は配信終了済みのものがある——
  「今日−2日」を既定にすると**何も描かない**日ができる。⚠ 2層同時に切り替えるときは、
  フラグではなく**飛んでいる Promise を共有**する（2つ目が「まだ着かない答え」を `null` として受けない）。
- **宇宙基地・地上局**（`js/osm-facilities.js`）— 同梱スナップショット `data/osm-space.json`（14,965件）と
  ライブ Overpass を **id で合成**する（ライブがスナップショットを上書きすると、ズームで件数が減る）。
  外交公館も同じ形。⚠ 疎な集合は「視野内 Overpass」では答えが出ないので、全球スナップショットを同梱する。
- **宗教・言語のポップアップ**は棒グラフ＋**データの年**を出す。
  ⚠ **出典が分けていないものを地図が分けてはいけない**（自由文の括弧を採るのは限定された語のときだけ）。
  ⚠ **出典が分けているものを地図がまとめてはいけない**（旧ユーゴの4標準は別々の分類）。
- **GDP 成長率は発散配色**（0 ＝ 白・負 ＝ 赤・正 ＝ 青・0 について対称）。
- **データセンター層**は表示範囲の集計を**レイヤー自身の凡例**に出す（浮くポップアップにしない）——
  「この点は何か」は浮き、「表示範囲に何があるか」はレイヤーの答えである。
- **貿易フロー**の矢印は軸（`wp-trade-arc`）・頭（`wp-trade-tip`）・相手国名を**一式**で切り替える。
  軸は頭の base で終わる（`trimEnd` / `line-cap:'butt'` / `icon-anchor:'top'`）。
  ⚠ 切る長さは**画素**なので**レンダラの投影に訊く**（`GE().coords.project`）。メルカトルのメートルは
  画面中心でしか合わない。`moveend` で作り直す。

### 7.8 地形と水

`js/terrain-water.js`。

- **DEM の穴は「地面が無い」ではなく「キャッシュに無い」かもしれない。** 判定の閾値は**物理**で置く
  （−12,000 m ＝ チャレンジャー海淵の下・符号化の最小の上）。穴に当たったら終わりにせず
  **ピラミッドを1段降りる**。残った穴は**数えて印字**する。
- **basin の拡張は DEM タイルのブロック単位**（`growBasin`）。LRU に丸ごと収まる大きさで読み、
  `null` は1回だけ再試行する。⚠ セルの密度で温めると、広い basin ではタイルの大半が未要求のまま残り、
  未取得タイルの矩形の辺で水が止まる。
- **新しい水源を置いても、既にある水はリセットされない。** 作業矩形の外を押したときは
  `padsToReach()` → `extendToPoint()` が**盆地を広げて**そこに届く（`sim.grow` は水深をそのまま運ぶ）。
  予算 `basinMaxCells()` を超えるときだけ `rebuildAround`（＝リセット）に落ちる。
  Atlas の `addSource()` も同じ経路を通る。
- **リセットは1本の関数**（`resetTerrainNow()`）。⚠ **「この関数を通れ」という注記が2本あったら、
  通らない道を無くす番**である（`editDirty()` を呼ばない経路を作らない）。
- **`cont` / `rate` は水源自身の属性**（最後に置いた水源だけを太らせない）。継続の水源は緑＋輪、
  1回きりは青い点。
- ⚠⚠⚠ **1回きりと継続の差は「水が出続けるか否か」だけである。** どちらも**流量を持つ蛇口**で、
  `feedTaps(dt)` が**両方**に `rate × dt` を注ぐ。違うのは `cap`（＝出し切る総量）が有限か `Infinity` かの
  1点で、`owed(x) = cap − m3` が 0 になったら止まる。`m3` は**これまでに出した量**（両方とも）。
  ⚠ 旧実装は1回きりを `pool()` で**最初から静止した湖**として置いていたので、置いた瞬間に
  `simMoving()` が偽 → `canPour()` が偽 → **▶ が無効・↺ を押しても再生できない**という状態になっていた。
  ▶ は「まだ出し切っていない水源がある**か**、水がまだ動いている」ときに有効。
- ⚠⚠⚠ **その差は「量」と「速さ」の2つの数で、m³/s の箱は<b>1つ</b>である。** 旧実装は
  「1クリックの水量 m³」「注水量 m³/s」「流量 m³/s」の**3つ**を並べていて、後ろ2つは**同じ量**だった——
  `placeSource` が `rate:(flowM3s!=null?flowM3s:pourRate)`、`srcRate` が `pourRate` に落ちる、つまり
  1つの数に2つの操作子があった。いまは `pourRate` **1本**（`setRate()` が唯一の書き手で、置いてある
  水源すべての `rate` も同時に動かす。Atlas の `setFlow()` も同じ関数を通る）と、1回きりだけが持つ
  `srcM3`（総量）。⚠ **パネルが割り算を自分でする**——「1クリックで合計 X m³ を、毎秒 Y m³ の速さで
  出します（シミュレーション時間で約 Z）」を2つの箱の下に印字するので、2つの数が**何をするのか**が
  読める。継続では総量の箱ごと消え、「止めるまで出し続けます」と書く。
  ⚠ この文の鍵は**静的な文字列**でなければならない（`L('One click pours '+n+…)` は英語の引数を自分で
  組み立ててしまい、6言語目以降の索引は**英語の文字列で引く**ので永久に一致しない）。`{v}`/`{r}`/`{t}`
  を後から差し替える。
- **水は届くまでに時間がかかる**（`js/water-dynamics.js`）——浅水方程式の局所慣性形＋q 中心化、
  マニング n。閉じた形の答えで検証してある（等流水深・静水で max|q|＝0・質量保存）。
  ⚠ **予算は実時間の上限で持つ**（格子が育つとステップの値段が変わるので、ステップ数は予算にならない）。
- **パネルは1本の列。** `.tw-body` は `scrollbar-gutter:stable`、スクロールバーの幅は `_squareColumn()` が
  **実測**して `.tw-head` / `.tw-foot` の `padding-right` にインラインで書く
  （⚠ **インラインの padding にスタイルシートは勝てない**）。
  ⚠ **寸法は1か所の宣言**（`TW_FS`/`TW_FS_S`/`TW_FS_H`/`TW_ROW`/`TW_CTL`/`TW_IN`/`TW_PAD`/`TW_GAP`/`TW_INSET`）で、
  **端末クラスで2組**ある——デスクトップは**他の凡例と同じ寸法**（本文 11 px・行 30 px・操作 28 px）、
  携帯は指の寸法（12 px・44 px・36 px）。⚠ 44 px は iOS のグループ化リストの行高で、**デスクトップの
  凡例の列では他のどの行の3倍近く**になる（実測、警報凡例は本文 10.5 px・行 13〜16 px）。
- **ツール選択は上部に<b>一行で</b>ピン留めされる。** `.tw-tools` は `.tw-body` の**兄弟**（`.tw-foot` と
  同じ作り）で、head → tools → body → foot の順。⚠ **`position:sticky` はスクローラの中では効かない**
  ——ピン留めは CSS ではなく **DOM の親子関係**である（不均衡な `</div>` 1個でピン留めが黙って失われる）。
  スクロールバー幅は `.tw-head` / `.tw-tools` / `.tw-foot` の3枚に配る。
  ⚠ **ピン留めするのは「切替」だけで、設定は流れる。** 実測、`.tw-tools` は 591.7 px のパネルのうち
  **131.7 px**（「ツール」見出し 17.7 ＋ 2×2 の選択 58 ＋「着色」チェック 31.3）を占めていた——
  ピン留めする要素は正しかったが、**3行あった**。いまは `grid-template-columns:repeat(4,1fr)` の
  **1行 46.7 px**で、着色チェックは本文（「表示」）へ移した。
  ⚠ 4つの**正式名**は 306 px に入らない（実測）ので、帯には短い語を出し、正式名は `title` と、
  そのツールが開くパラメータ欄の見出し（`modeName()`＝**唯一の宣言**）に出る。
- **計算解像度は読み手が選ぶ**（`RES_D=[384,512,768,1024]`・既定 **512**・`im.twRes` に保存）。
  解像度の変更は `build({keep:true})` で**同じ作業矩形のまま**作り直す。セル寸法と格子数はパネルが印字する。
- ⚠⚠⚠ **標高のレベルは「作業矩形」から選ぶ。カメラからではない。** 作業矩形は `MAXKM`（60 km／携帯 26 km）で
  切られるので、切る**前**の視野で `_demZoomForSpan` を呼ぶと格子より粗い DEM を読むことになる——実測、
  カメラ z6 で矩形 47.2 km・セル 92 m のところ **DEM は z10（124 m 標本）**で、**格子より粗い地面**を
  読んでいた。矩形から選べば z13（15.5 m）。`viewKm`（視野）と `spanKm`（矩形）は別の名前を持つ。
- ⚠ **ツールを開くことは「地図を動かせ」という要求ではない。** `open({lng,lat})` はその点が**画面外のときだけ**
  カメラを動かし、**ズームは変えない**。旧実装は `zoom: max(現在,11)` で飛んでいたので、z6 で開くと z11 に
  なった（`js/map-ui.js` のツール行は**カメラの中心そのもの**を渡す）。矩形は `build({center})` で直接狙う。
- **↺ 再生**は時計・水・各水源の供給量を 0 に戻し、**同じ地形と同じ水源のまま** t=0 から流す。
  `m3` は「これまでに出した量」なので**両方の種類とも 0 に戻す**——それが再生そのものである。
  ⚠ `editDirty()` を通すこと。⚠ **⏭（静止まで進める）も蛇口に注ぎ続ける**（`settle({onStep:feedTaps})`）——
  注がない静止状態は「置いた水の一部の静止状態」でしかない。
- パネルは他の浮遊ウィンドウと同じ帯にいる（`registerWindow`）。開く位置は `placeClear()` が
  **地図を覆っているものの矩形を実測**して決める（サイドバーは開閉するので定数にできない）。
  読者が動かした後は動かさない。

### 7.9 物理シミュレーションの不変条件

**地震波（`js/seismic.js` ほか）**

- **初動の等時線は、破壊速度 Vr ≤ 波速 V であるかぎり厳密に震央中心の円である。**
  `t(x) = min_k( off_k/Vr + dist(k,x)/V )` の括弧が常に ≥ 0 だからで、これは改善できる近似ではなく物理。
  だが有限の破壊が持つ境界は**2つ**あり、もう一方は円ではない:

  ```
  T_first(x) = min over k ( off_k/Vr + dist(k,x)/V )    ← 円（定理）
  T_last (x) = MAX over k ( off_k/Vr + dist(k,x)/V )    ← 断層の形が出る
  ```

  その間が「いま揺れている」**帯**で、`T_last − T_first` は継続時間そのもの。破壊が向かった側では
  狭く（＝指向性）、背後では広い。⚠ **後端に枝刈りを掛けてはいけない**——最大値に勝てないとして
  捨てられる点こそが、最小値を決める点である。⚠ 点震源では両境界が一致するので**帯は描かれない**
  （長さが無ければ到達時刻は広がらない）。
- **場址項は周波数の関数**（`js/seismic-site.js`）。上位 30 m を Vs30、その下を CRUST1.0 の実層構造と
  した速度柱から `A(f)` を積分する。⚠ 高周波の極限は 1/4 波長を 30 m で1点評価した従来値と厳密に一致し、
  変わるのは**その下の周波数だけ**＝盆地効果。⚠ 速度反転は作らない（Vs30 を下回らないようクランプ）。
- **破壊は1枚のすべる矩形ではない**（`js/seismic-subfault.js`）。k⁻² すべり／**総モーメント厳密保存**／
  破壊時刻 |r−r_hypo|/Vr／ライズタイムは公表式。位相は断層形状を種にした決定的生成なので、
  **同じ断層なら常に同じすべり分布**になる。
- **その土地の分類は測って決める**（`js/earth-structure.js`）。同梱の CRUST1.0 / Slab2 / PB2002 から
  interface / intraslab / active-crustal / stable-continental を判定し、**区分ごとに公表された
  パラメータ一式**を返す。⚠ 幾何減衰の折れ点は**その土地の Moho 深さ**に比例させる。
  ⚠ **出典が確認できない係数は書かない**（出典のない閾値はファイル冒頭に明記してある）。
- ⚠ **地域限定の補正に依存しない。** 検証は観測から作る（`scripts/build-seismic-observations.mjs` /
  `scripts/seismic-validate.mjs` の `--baseline` で A/B）。
- これらのファイルは**純粋な算術**（DOM・レンダラ・fetch・アプリ状態を参照しない）なので、
  Node から直接検証できる。

**津波・水（`js/tsunami.js` / `js/water-dynamics.js`）**

- 浅水方程式の局所慣性形＋q 中心化、マニング n。**閉じた形の答えで検証する**
  （等流水深との比・静水で max|q| ＝ 厳密に 0・質量保存）。
- ⚠ **「このモデルは X を扱いません」と自分で書いてある機能は、いつか X を要求される。**
  到達時間を隣に表示しているなら、到達時間はそのモデルが答えるべき量である。
- ⚠ **2つ目の時計を作らない**（フッタと詳細が別々の到達時刻を出さない）。

---
### 7.10 気象モデル（ECMWF IFS）・風・レーダー

**気象の数値はすべて 1 つのモデルから来る。** `window.IntMapECMWF`（`js/wx-ecmwf.js`）が
Open-Meteo の spatial アーカイブ（**ECMWF IFS HRES・O1280 縮約ガウス格子・約 9 km**）を持つ。
色面（ラスタ）・粒子・カーソル下の地点値・共有リンクの4つが**同じ変数・同じ初期時刻・同じ有効時刻**を読む。

- **`.om` ファイルの場所は自分で組み立てる。**
  `<base>/<初期 YYYY>/<MM>/<DD>/<HH>00Z/<有効 YYYY-MM-DD>T<HH>00.om`。
  ⚠ **SDK に `latest.json` を渡してはならない。** `normalizeUrl` は `time=` を無視して
  `valid_times[0]` に解決し、キャッシュ鍵（`DATA_RELEVANT_PARAMS` は `['variable']` のみ）も
  時刻を含まない。**ファイル名に有効時刻が入っていることが、予報時刻が実在する唯一の理由**。
- **予報時刻は全部使う**（実測 109 ステップ＝3日は毎時、6日目まで3時間毎）。既定は「今」に最も近い段。
  再生・一時停止・前後・「今へ戻る」。**モデル初期時刻（run）と有効時刻の両方を印字する。**
  モデルランが更新されたら、**同じ添字ではなく同じ壁時計の瞬間**へ移す。
- **凡例はレンダラ自身の配色表から作る**（`IntMapECMWF.legend(variable)`）。目盛は 5 点・単位つき、
  気温は `imUnitTemp`、風は風速単位の選択に従う。**凡例の最大値が LUT と食い違うことは構造上起きない。**
- **風の配色は Windy 相当の独自表**（`WINDY_WIND`：静穏＝青紫 → 青 → 青緑 → 緑 → 黄 → 橙 → 赤 →
  マゼンタ → 白、**全域 α=1**）。SDK 既定の風配色は最初の 7 m/s で α を 0→1 に上げるため、
  静穏域が「穴」になり Windy の絵にならない。プロトコルは**この表で**登録する。
- ⚠⚠ **気象の面は昼夜シェーディングより上に置く。** `im-night-shade` は装飾、気象はデータ。
  実測（z3・150°E 20°N・夜側）：LUT が要求する `rgb(40,130,180)` に対し実際の画素は `rgb(15,43,64)`＝**0.36 倍**。
  `IntMapECMWF.before()` が夜側スタックの直後を返し、`lift()` が**毎 idle** で位置を再主張する
  （`js/night-side.js` は自分の層をタイマーで貼り直すため）。
- **不透明度は1回だけ掛ける。** 面の α は配色表（風速の意味を持つ）、スライダーはただ1つの倍率で既定 1.0。
- **粒子は WebGL・1フレーム1描画呼び出し**（`js/wx-wind.js`）。移動量・寿命・残像はすべて**実経過時間**基準
  （`dt` 秒／`exp(-dt/τ)`）なので、60 Hz と 144 Hz で同じ絵になる。WebGL が無ければ**束ねた Canvas2D**。
  粒子はネイティブ格子を直接サンプルする（実測 14,000 回 2.2 ms）——低解像度の地点格子は存在しない。
- **地点値**：ECMWF ラスタが出ていれば `valueNow(variable, lat, lng)`＝**タイルを描いたのと同じ配列**。
  NASA GIBS のラスタ（`temp`/`sst` など）は地点値サービスを持たないので、**データセット名と表示中の日付**を
  出して止まる。⚠ **別のデータセットの現在値を代わりに出してはならない。**
- **レーダー**：RainViewer の `radar.past`（実測 13 コマ・10 分間隔・直近2時間）を**ループできる**。
  コマ時刻と経過（「13:30 · −11 分 · 13/13」）を出す。タイルは差し替え（`setSourceTiles`）なので
  コマ送りは点滅せずクロスフェードする。⚠ 無料枠の配色番号は**2種類しか返らない**
  （0/2/3/6/7/8 と 1/4/5/9 でバイト一致）ので、`RV_SCHEME` が実際に得られる方を名指しする。
- **雲（赤外）**：RainViewer の衛星 IR は**廃止済み**（`satellite.infrared` は実測 0 コマ）。
  NASA GIBS の静止衛星 clean-IR（**Himawari + GOES-East + GOES-West**、10 分間隔）に置き換えた。
  ⚠ **Meteosat は GIBS に無い**ので、およそ西経 20°〜東経 75°（欧州・アフリカ）は範囲外。
  凡例が**その旨を文字で書く**（空白を「雲が無い」と読ませない）。
- **地点天気ポップアップ**は `window.IntMapWx`（`js/wx-source.js`）経由。突風・海面更正気圧・
  **データの有効時刻**（ブラウザ時刻ではない）・**実際のモデル名**を出す。
  ⚠ Open-Meteo の `models=` 無指定は **Best match**（GFS ではない）。⟳ は `ttl:0` で
  **両方の**梯子（Open-Meteo と MET Norway）のキャッシュを無効化する。
- ⚠ **Open-Meteo への直接 fetch は残っていない。** すべて `IntMapWx.guardedJSON`（キャッシュ・
  重複排除・日次 429 のサーキットブレーカ）を通る。`IntMapWx.isOpenMeteo(url)` が**ホストで**判定する
  （部分文字列ではない）ので、`sims.js` / `atlas-console.js` の共有ローダも自動的に通る。
- **共有リンク**は選択中のレイヤー（`dl-*`）に加えて **ECMWF の有効時刻（瞬間）と各層の不透明度**を運ぶ
  （`IntMapShareState.register('weatherEC')`）。⚠ 添字ではなく**瞬間**——開いた人のモデルランは別かもしれない。

## 8. UI/UX の構造

### 8.1 画面の骨格

- **サイドバー（左）**：タブ（News / Companies / Countries / Atlas）、検索、ニュースフィード／
  企業ランキング／Atlas。
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
- **押されてから取りに行くもの**（`js/lazy-modules.js`）：フライトシム／Playground／地震／津波／
  地形と水／見通し線／ストリートビュー／夜空／**Atlas カーネル**。KaTeX と html2canvas も動的 import。
- **衛星タイルの先読みは「レーン」で流す**（`sw.js` の `PREFETCH_LANES` ／ `js/tile-warm.js`）。
- **携帯の画像同時取得数は MapLibre 自身の既定**（デスクトップ用に上げた値を携帯に持ち込まない）。
- **ラスタレイヤーはタイルソースにする**（1枚の画像を視野ごとに取り直すと、移動中は必ず縮尺が違う）。
  ⚠ タイルは `scene.addProtocol` 契約で供給し、レンダラが今いるズームのタイルを要求する。
  子が届くまでだけ親を出す（z0 のタイルを z14 に広げない）。
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

### 15.1 ファイル

- `package.json`（private・type:module）。`.nvmrc` が Node のバージョンを持つ。
- `scripts/serve.mjs` — 依存ゼロの静的サーバ（`http://127.0.0.1:4173/`）。
  ⚠ **「Pages と同一」には圧縮も含まれる**——`Accept-Encoding` に応答する。
  ⚠ **brotli ではなく gzip**（`br` を提示しても Pages は gzip を返す）。
  ⚠ **`.gz` は対象外**（`data/*.json.gz` は「gzip 形式の**本体**」であって gzip 符号化された応答ではない）。
  ⚠ 経路の組み立ては「先に join して後で検査」ではなく**素の区間に分解して ROOT から組み直す**
  （前者は正しく効くが、静的解析からはサニタイザに見えない）。
- `scripts/static-checks.mjs` — 構文（`node --check` を全 js/mjs/cjs/ts に）／JSON parse／YAML／
  マージ衝突マーカー／秘密検出（publishable anon は allowlist）／HTML 参照アセットの存在／
  ワークフローの最小権限／**リモート Action の完全長 SHA 固定**（error。除外なし）。
- `scripts/doc-facts.mjs` — **文書間の固定事実の照合**（§15.5）。
- `scripts/arch-files-check.mjs` — Architecture §3 と `js/` の突き合わせ。
- `scripts/engine-coupling.mjs` — レンダラ脱依存のゲート。
- `playwright.config.js` — hermetic なスモーク＋内部 QA（webServer＝`scripts/serve.mjs`・UTC/en-US・
  SW ブロック・prod-smoke は除外）。`playwright.prod.config.js` — 実 URL 用（webServer 無し・retry 3）。
- `tests/helpers/network.js` — hermetic なルーティング（同一オリジンのみ許可、他は全 `abort`）＋
  console の分類（外部／ネット系は benign、自コードのみ失敗扱い）。
- `.github/workflows/` — §3.12。
- `docs/TESTING.md` / `docs/RELEASE.md` / `docs/MONITORING.md` / `docs/INCIDENT-RESPONSE.md`。

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

**本番は CI ゲート付きの GitHub Actions ワークフローで公開される。**
Pages の Source は **GitHub Actions**、リポジトリ変数 **`ENABLE_PAGES_DEPLOY = true`** が設定済みで、
`main` への push ごとに `.github/workflows/deploy.yml` が

```
ビルド(Vite) → 静的検査 → dist/ を公開 → 実URLへの post-deploy smoke
```

を行う。`build-info.json` が公開時に書かれるので、
`curl -s https://rwmqx7dwb5-arch.github.io/IntMap/build-info.json` の `sha` が
`git rev-parse origin/main` と一致することで着地を確認する。ロールバックは
`.github/workflows/rollback.yml`（履歴に実在する ref のみ・対象 ref を **Vite ビルドして `dist` を配信**）。
**手順の正本は `docs/RELEASE.md`。**

⚠ `deploy.yml` は `concurrency: pages-production` で直列に走る（前の run が固まると次は pending のまま）。

### 15.5 文書間の固定事実の照合 — `npm run check:docs`

`scripts/doc-facts.mjs` が、**複数の文書に書かれている同じ事実**を実体と突き合わせる。
`npm test` に内包され、ずれていれば落ちる。検査するのは:

- `index.html` の行数／`js/` のファイル数——`Architecture.md` §1 の数字
- Edge Functions の一覧——`supabase/functions/` の実体 ⇄ `CLAUDE.md` §2 ⇄ `Architecture.md` §6.2
  ⇄ `supabase/config.toml` の `[functions.*]` 宣言
- `supabase/migrations/` の本数——`Architecture.md` §3.12
- **配信方法**——`dist/` を配信すること。本番公開ワークフローの状態を、その正本である
  `docs/RELEASE.md` と一致させること（既に有効なものを役目を果たしていないかのように書かない）
- **ビルド印のファイル名**——先頭にハイフンを付けた綴りをした文書が無いこと
- **USB バックアップの頻度**——正本は `CLAUDE.md` §11 のみ。他の文書は頻度を書かない
- **対応言語**——`js/locales/ui.*.js` の集合 ⇄ `Architecture.md` §1.3 ⇄ `README.md`。
  `IntMapLangBeta` が空なのに beta と書いた文書が無いこと
- **気象警報の機関数**——`js/world-packs.js` の `FEEDS` / `MA` ⇄ `Architecture.md` §7.1 ⇄ `README.md`
- **アプリの形**——「ビルド無し」「単一 HTML」「全 JS がインライン」と書いた文書が無いこと
- **anon キーの置き場所**——`index.html` にあると書いた文書が無いこと
- **`Architecture.md` にラウンド参照が無いこと**（冒頭の「この文書の読み方」）

---

## 16. データ保護基盤 (migrations・RLS/権限テスト・バックアップ・復元)

DB 構造を**コード化**し、RLS／権限を**自動テスト**し、バックアップ／隔離復元を用意し、本番 DB 変更を
安全化した設備。

### 16.1 Supabase CLI 構成

- `supabase/config.toml` — ローカル／CI 用（**本番非接続**）。
  ⚠ **`db.major_version` は本番と一致していない**（宣言 15 / 本番 17.6）。ローカル再現の忠実度に関わるので、
  上げるときは `supabase db reset` の通過を確認してから行う。
- `supabase/migrations/*.sql` — **唯一の設計図**。全テーブル＋制約／index、`is_admin()` /
  `handle_new_user()` トリガ、RPC、**RLS 全表 ON ＋ポリシー**、grants、realtime publication。
  冪等・非破壊（`if not exists` / `create or replace` / `drop policy if exists`）。
- `supabase/seed.sql` — **100% 合成**（`.test` ドメイン・プレースホルダ UUID）。
- `supabase/tests/*_test.sql` — pgTAP（構造 ＋ RLS/権限マトリクス ＋ 関数）。

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
- `.github/workflows/db-backup.yml` — **休眠**（`SUPABASE_DB_URL` ＋ `BACKUP_GPG_PASSPHRASE` の
  両 Secret が登録されるまで各 run skip）。`scripts/backup-db.sh` ＝ pg_dump → GPG AES-256 → SHA-256 →
  7日保持の暗号化 artifact。`scripts/restore-test.sh` ＝ checksum → 復号 → 隔離 DB へ restore →
  構造＋RLS 検証（非ローカル対象は拒否）。
- 方針 ＝ **Managed backups 優先**（Pro＝Daily＋PITR 推奨）＋ 休眠 pg_dump をフリー環境の予備とする。

### 16.4 実行

```bash
supabase start && supabase db reset          # migrations + seed（要Docker）
psql "$LOCAL_DB_URL" -c 'create extension if not exists pgtap with schema extensions;'
supabase test db                             # RLS/権限 pgTAP
supabase db diff --schema public             # driftゼロ確認
```

本番適用は `docs/MIGRATIONS.md`（バックアップ → 承認 → `db push`）。
詳細は `docs/{DATABASE,MIGRATIONS,RLS-TESTING,BACKUP-RESTORE,DATABASE-INCIDENT}.md`。

⚠ **本番はマイグレーションファイルと乖離しうる。** 監査は `supabase db query --linked` で
`pg_policies` / `role_table_grants` / `pg_proc` を**本番から読んで**行う。

---

## 17. セキュリティ基盤

**信頼境界＝サーバー（Supabase）**、ブラウザ JS は非信頼。外部から来る値（コミュニティ投稿、
ニュース RSS 見出し、OSM/Nominatim の地名、OSM で編集可能なウェブカメラ URL、AI 出力、URL hash）は
すべて敵性入力として扱う。

**正本は `docs/SECURITY-ARCHITECTURE.md`**（脅威モデル・データフロー図・認証認可・公開値と秘密値の区別・
残存リスク・本番の手動設定）。報告方法は `SECURITY.md`、検査手順は `docs/SECURITY-TESTING.md`。

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
  `default-src 'self'` を持ち、14 の directive を明示的に書く。
  ⚠ **絶対に書いてはいけない**のは `'unsafe-eval'` と CDN ホスト（どちらも現在は入っていない）。
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

ログインユーザーが**監視地域**（円／描画／解決済み地域／現在の地図表示）を保存し、**サーバー側が定期実行**
して**意味のある変化がある時だけ根拠付きレポート**を生成する機能。詳細は
[`docs/AREA-MONITORS.md`](docs/AREA-MONITORS.md)。

- **中核原則 ＝ 変化の有無はコードが判定し、AI は説明のみ。**
  処理順＝取得 → 正規化／重複排除 → スナップショット → 機械的 diff（new / gone / continuing・件数・
  クラスタ・媒体多様性）→ change score → **変化があり閾値を超えたときだけ AI** →
  **AI が引いた evidence ID を実行後にコードで検証**（偽 ID の主張は棄却）→ run / evidence / report を永続化。
  ⚠ **取得失敗は「変化なし」ではなく専用 status。**
- **DB** ＝ 5表 `area_monitors` / `monitor_runs` / `monitor_evidence` / `monitor_reports` /
  `monitor_seen_items`（長期レジャ）。**RLS 全表 owner-only**、runs/evidence/reports/seen は
  **service_role 書込・user 読取専用**（実行結果を偽造できない）。
  `area_monitors` の UPDATE は列単位 grant ＋ **BEFORE UPDATE トリガ `tg_monitors_guard_state`** で
  run-state 列と `next_run_at` を凍結する（**grant 非依存の実防御**）。
  `monitor_limit()`（plan 別上限＝課金の接続点）を挿入トリガで強制し、`monitor_limit_self()` は
  他人の plan を探索できない。`monitor_claim_due()`（cron 用 `FOR UPDATE SKIP LOCKED`）／
  `monitor_claim_one()`（手動用の原子 claim）／`monitor_finalize` / `monitor_commit_report`
  （run＋report＋meta を単一トランザクションで）。pgTAP は `04_monitors_test.sql`。
- **Edge Function `monitor-run`** ＝ ① cron（`x-monitor-secret`）で due な monitor を claim して逐次処理、
  ② ユーザーの「今すぐ実行」（JWT ＋ monitorId ＋ 所有権照合）。純ロジックは `logic.mjs`
  （runtime 非依存 ESM）を Deno と Node テストで共有する。status は10種
  （success / success_no_change / partial / source_unavailable / ai_failed / timed_out /
  invalid_geometry / quota_exceeded / disabled / internal_error）。
  **AI が失敗しても snapshot / diff / evidence は保持する。**
- **定期実行** ＝ pg_cron（`net.http_post` でヘッダに秘密。SQL は `docs/AREA-MONITORS.md`）。
- **UI / Atlas** ＝ Monitors タブ（通常／モバイル／ワークスペース・9言語）、`window.IntMapMonitors`
  （一覧／作成ダイアログ／詳細／レポート＝結論・主な変化 → evidence chip・数値比較・根拠一覧・
  変化地点の地図表示・取得できなかったデータ・制約・日時／status）。
  Atlas `{"type":"monitor","op":…}` の**返信は実 DB の結果のみ**（偽の成功報告をしない）。
  全描画は `IntMapSafe` を通す。
- **コスト制御** ＝ 変化なしは AI を呼ばない／新規のみ AI へ送る（履歴 dedup）／run ごとの cap
  （evidence 60・AI 入力 40・110s wall-clock・55s AI timeout）／plan 別 monitor 上限・最短間隔30分・
  手動クールダウン30s／保持（run 100・evidence 12run）。
