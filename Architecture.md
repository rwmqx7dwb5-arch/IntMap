# IntMap — 現状仕様書 (Architecture)

> 本ファイルは**開発日記ではなく**、現在の IntMap を再現・保守するための**現状仕様書**です。
> Claude や他のAIが、このファイルを読むだけで IntMap の構造をほぼ理解できることを目的とします。
> 時系列の経緯・根本原因の記録は `DEV-NOTES.md`（#R200 以降）と `DEV-NOTES-ARCHIVE.md`（#R199 以前）、標準指示（やってはいけないこと等）は `CONSTITUTION.md` を参照。
> 実装を変えたら、この仕様書も更新すること。
>
> Last reviewed: 2026-08-11 (#R218)
>
> ### この文書の読み方 (#R169 で整理・#R217 で分担を確定)
>
> - **§1–§18 は「今どうなっているか」だけ**を書く。過去の経緯・根本原因・ラウンドごとの差分は
>   `DEV-NOTES.md`（直近）と `DEV-NOTES-ARCHIVE.md`（#R199 以前）の担当であり、ここには**変更ログを書かない**。
> - 本文中の `(#Rxxx)` は「**いつその事実になったか**」を示す出典タグであって、変更ログではない。
>   詳細を追いたいときは `DEV-NOTES.md` の同じラウンド番号を読む。
> - ⚠ **#R217 で §19「ラウンド別補足」はこのファイルから無くなった。** 2,300行・51本あり、この仕様書の
>   ほぼ半分がラウンド史だった——それが「両者が混同されて混ざる」の実体だったので、各補足は
>   `DEV-NOTES.md` / `DEV-NOTES-ARCHIVE.md` の**そのラウンドの節の末尾**へ、本文そのままで移してある
>   (`### 仕様補足（旧 Architecture.md §19 より移設・#R217）`)。**何も消していない。**
>   仕様として恒常的に必要になった事実は、§19 に置いたままにせず §1–§18 の本文に書くこと。
> - 数字（行数・KB・レイヤー行数など）を書くときは**その場で実測した値**にする。
> - 実装を変えたら、この仕様書も同じコミットで更新すること。
---

## 1. 概要 (Overview)

IntMap は、世界のニュース・気候・人口・経済・地政学データを一枚の地図に重ねて表示する、
**単一HTMLファイルのWebアプリ**（フロントエンド全部入り）です。

- **本体は `index.html`（700行・59KB）＋ `css/` ＋ `js/`（59本）＋ `src/`（Vite エントリ2本）。**
  **#R175 で Vite ビルドを導入**（指示「IntMapのモダンな実装によるVite化と高速化を…全面的に」）。
  `npm run build` → `dist/`（ハッシュ付き・最小化・チャンク分割）が GitHub Pages で配信される実体。
  - `index.html` はもうプログラムではない。**マークアップ＋`<script type="module" src="/src/main.js">` 1本だけ**。
    最後まで残っていた 496KB の `DOMContentLoaded` クロージャは **`js/app-body.js`** へ**そのまま**移した
    （バンドラは inline script を最適化できない＝毎回 0.5MB のコメントと空白を配っていた。標準指示13も同時に達成）。
  - `js/*.js` 59本は **`src/main.js` が index.html と同じ順序で `import`**。安全なのは偶然ではなく、
    **全59ファイルにトップレベル宣言が1つも無い**ことをASTで確認したから（module のトップレベル `const`/`function` は
    private、classic script のそれは global。宣言が無ければ名前解決は1つも変わらない）。`tests/r175-checks.test.mjs` が毎回再検証する。
  - CDN 依存7本は **npm へ同一ピン留めのまま移行**し `src/vendor.js` が同じグローバル（`maplibregl`/`turf`/
    `topojson`/`mlcontour`/`supabase`/`sb`/`katex`/`html2canvas`）を再公開するので、呼び出し側は1行も変わらない。
    KaTeX と html2canvas は動的 `import()` ＝別チャンクで、従来の `defer` と同じ「非同期に現れる・無ければ劣化」を維持。
  - 実測（同一マシン・キャッシュ無効・中央値3回）: **DOMContentLoaded 925→257ms、地図描画完了 1,196→471ms、
    リクエスト 109→37本**（自オリジン 60→10本）。
  （#R162〜#R169 の分離は §3.1。分割前は 36,955行/4.3MB）
- 地図エンジンは **MapLibre GL JS**（Mercator 平面 + Globe 投影）。**#R178 で依存脱却が完了**——
  レンダラの名を出してよいファイルは **`js/geo-engine.js` ただ1つ**（アダプタ＋`IntMapGeoEngine` ファサード。
  #R152 以来 `js/app-body.js` の `map.on('load')` の中にあったが、モジュール側が engine を使うようになった以上
  **モジュールのファクトリが走る時点で存在していなければならない**ため独立ファイルへ切り出し、`src/main.js` が
  最初に import する）。他の js/ 全ファイルは `const GE=()=>window.IntMapGeoEngine;` 経由。
  **AST 実測で 2,037箇所 / 31ファイル / 86 API → 0**（`npm run check:engine` が CI で固定。構文解析なので
  コメント中の "the map. When…" では誤検知せず、ローカル変数 `map` も依存とみなさない）。
  置換表は `scripts/decouple-codemod.mjs`、検査は `scripts/engine-coupling.mjs`。
- **#R179：その「0」が数えていなかったもの。** 上の 0 は**メンバアクセス**の数であり、真である。
  同じ AST を「あらゆる参照」に広げると、アダプタの外に **327件**あった：
  **TESTED 211**（`if(map)` / `typeof maplibregl!=='undefined'`＝レンダラの存在を訊く）と
  **HELD 112**（`.addTo(map)` / `setupMaplibre(maplibregl)`、そして**モジュール契約そのもの**
  `window.IntMapModules.x(map, HOST)`＝全モジュールが生ハンドルを受け取る）。
  さらに**名前の一覧では原理的に見えない**ものが1つ：`ui.createView` がレンダラ自身の Map を返していたため、
  **3つの追加ビューが生で駆動されていた**（compare.js の `cmap` 106／playground.js の `gmap` 8／
  flight-sim.js の `minimap` 5）。#R179 はこの「第2エンジンを塞いでいた部分」を閉じた：
  **アダプタはビューごとのファクトリ**（`makeMapLibreAdapter`。状態もビューごと）、
  **契約はアダプタの関数**（`engineFacade`）で `ui.createSubView` が同じ形を返す、
  マーカー/ポップアップは**ビューに**付く（`ui.addMarker`/`addPopup`）、等高線は `scene.demContourSource`
  （maplibre-contour にレンダラ名前空間を渡す＝最後の裸の `maplibregl` だった）。
  ゲートは**両方の数**を報告し、**残 324 を爪車で固定**し、`ui.createView` を
  **app-body.js の1回だけ**に限定して「別名で持ったハンドル」を出所で塞ぐ。
  プロパティ位置は除外する（除外しないと `arr.map(...)` に飲まれる。実測 932 のうち 605 が Array.prototype.map）。
- **#R180：脱却は完了し、第2エンジンは実在する。**
  - **残 324 → 1。** 4つの形しかなく、それぞれ答えは1つだった：
    **46件** `_imCanDraw` の予備路 `window.__imap||map` → `GE().ready()`（＝`isStyleLoaded` そのもの）／
    **95件 モジュール契約そのもの** `IntMapModules.x = function(map, HOST)` → `function(HOST)`
    （app-body.js の95呼び出しと同時に。**本体を編集しても 0 にならなかった理由がこれ**）／
    **18件** `….addTo(map)` → 新設の `GE().ui.attach(…)`（長い popup/marker 連鎖の**最後の環だけ**が生だった）／
    残りは存在テスト `if(!map)` / `typeof map==='undefined'` → `GE().hasRenderer()`。
    **残る1件は `window.__imap = map`**＝主ビューをエンジンに渡す唯一の正当な理由。
  - **別名の穴の「第2の扉」も塞いだ。** #R179 は `ui.createView` を塞いだが、`window.__imap` が残っていた：
    3つのサブシステムがグローバルをローカルに読み込んで生で駆動していた
    （map-extras.js の `M()`＝IntMapLocate が getSource/addLayer/on/project/flyTo、news-timeline.js に2件）。
    どちらの計数にも映らない（別名が `M`/`m` だから）。**グローバル自体をゲート**した（`IMAP_GLOBAL_FILES`）。
  - **Cesium＝設定で選べる第2エンジン（既定は MapLibre のまま）。** カバー範囲はユーザーの選択により
    **ベクタタイルを含む完全同等**。#R180 の実測は 247レイヤ定義/11型・122ソース・762式/36演算子だが、
    **ソースの内訳**が実装可能性を決めた：**geojson 97 / raster 11 / vector 6 / image 6 / raster-dem 2**。
    基図も衛星もラスタ（Carto @2x・Esri は `imapsat://`）で、アプリ自身のレイヤの79%が GeoJSON＝Cesium の土俵。
    ベクタタイルの難所は**レンダラ**であって、GeoJSON が描けるなら MVT は「features になる」だけでよい。
    - `js/cesium-style.js` — style 言語の**解釈器**（式・フィルタ〈旧 `$type` 形式と式形式の両方〉・色・旧 `{stops}`）。
      **純粋**（Cesium も DOM も参照しない）ので `tests/r180-checks.test.mjs` が Node で直接検証する。
    - `js/cesium-layers.js` — プロバイダ＋描画。raster→`ImageryLayer`（brightness/contrast/saturation/hue が
      **ネイティブ**＝#R34 の暗色基図は近似ではない）、fill/line/circle/symbol/fill-extrusion→エンティティ、
      heatmap/hillshade/color-relief→同じ DEM から計算したラスタ、terrain→**同じ terrarium タイル**から
      `HeightmapTerrainData`。**キーレス（Ion トークン無し）**。
    - `js/cesium-vector-tiles.js` — タイルピラミッド（cover/fetch/decode/cache）。`@mapbox/vector-tile` が
      タイルを GeoJSON にする。
    - `js/cesium-engine.js` — アダプタ本体（`makeMapLibreAdapter` と**同じメソッド集合**）。
    - `js/engine-select.js` — DOMContentLoaded より前に選択。既定では**何も publish しない**。
  - **既定セッションは 1 バイトも払わない**：`import('cesium')` は動的、main チャンクから cesium チャンクへの参照 0、
    modulepreload 無し。設定 ▸ 地図の動作 ▸ 地図エンジン（5言語）／Atlas `engine` アクション（SYS カタログ記載済み）。
    **切替は再読み込み**（レンダラを跨いでシーンは移せない）で、パネルは**実際に描画しているエンジン**を
    保存値とは別に表示する（無言のフォールバック禁止＝#R162）。
  - **カメラ対応は実測で一致**：起動画面で視点高度 **24,421,745 m**＝#R178 が MapLibre globe z1.7 で測った
    24,422 km。単発の `jumpTo` が z1.7/4/6/9/12/13/14・pitch 70 まで**中心 0m・zoom 0・pitch 0°** で往復する。
    地形は Fuji 3,751.5 m／Everest 8,712.7 m／死海 −412 m。
  - **Cesium が答えない物は答えないと言う**：`solid3d:false`（#R173 の閉じた立体は吸収シェーディングまで含むため）、
    `demContourSource()→null`（maplibre-contour は MapLibre の名前空間を要求する）。呼び出し側は既存の
    フォールバックを取る。詳細は §7.1。
- **#R181：第2エンジンの実測点検（両エンジンを同じ契約に通して全回答を突き合わせ、6件を修正）。**
  点検方法そのものが成果物：`IntMapGeoEngine` の**使われている面すべて**（camera/coords/layers/scene/ui/
  render/input/events）を両エンジンで同一手順に通し、差分を数値で出す。6件中3件はスクリーンショットに
  写らない（読み出しが乱数・イベントが発火しない・6%はみ出す）ので、#R180 のブラウザ試験を素通りしていた。
  - **① 衛星画像の破損＝`ImageBitmap` の向き（4経路）。** WebGL 仕様は `ImageBitmap` に対して
    `UNPACK_FLIP_Y_WEBGL` を**無視する**（向きは生成時に固定される）ので、Cesium が DOM 画像用に頼っている
    そのフラグが効かず、**タイル1枚ずつが自分の中心で上下反転**＝地図がタイル行ごとに裂ける。
    タイルの中身とタイル配置は無実だった（合成グリッドは正しい位置に描かれ、`imapsat://` の返すバイト列は
    Esri のタイルと**画素一致**〈4タイルで mean|diff|=0〉）。`js/cesium-layers.js` に `toTexture()` を1つ置き、
    プロトコル経路・hillshade・color-relief・heatmap の**4つ全部**をそこに通す（`imageOrientation:'flipY'`＝
    Cesium 自身の `Resource.createImageBitmapFromBlob` と同じ指示）。`transferToImageBitmap` は向きを
    指定できないので廃止。
  - **② pitch 0 で bearing が壊れていた（読み出しと適用の両方）。** 真上から見ると水平成分は定義上ゼロで、
    それを弾く閾値 `range*1e-9` が**自分の残差より4桁小さかった**ため一度も発火せず、`atan2` が丸め残差の
    向きを答えていた（z9 で 67.34°／z6 で 123.54°／起動時 −177.63°、実際は真北）。残差は浮動小数点雑音では
    なく**中心ピックの分解能**で range に比例する（実測 horiz/range ≤ 8.4e-8、対して 0.5° の傾きは 8.7e-3）
    → `range*1e-5`。さらに `Camera.lookAtTransform` は `right = direction × UNIT_Z` から姿勢を復元するので
    **真下では heading を捨てる**（既定の視点＝pitch 0 なので、この engine では地図を回せなかった）→
    視線軸まわりの `twistRight` で Cesium 自身の heading が要求値になるまで回す（位置も注視方向も動かさない。
    `setView({orientation:{pitch:-90}})` は**カメラ位置の法線**を向くので注視点が 11 m ずれる）。
    実測：z1.7〜14 × pitch 0〜75 × 6方位の216通りで **|Δbearing| ≤ 0.0004°**。
  - **③ イベントの穴（購読されているのに発火しない）。** アプリが購読する26種のうち
    `mousedown`/`mouseup`/`mouseout`/`touchstart`/`touchmove`/`touchend`/`wheel`/`render`/`terrain`/
    `rotate`/`pitch` が Cesium 側に**発生源が無かった**。map-tools.js と terrain-water.js は down→move→up を
    マウスとタッチ両方に張るので**図形をドラッグできない**、`updateCompass` は `rotate`/`pitch` に張るので
    **コンパスが追随しない**、ピン popup は `render` で追随するので**ずれる**。
    `mousedown`/`mouseup` は **pointer から**取る（Cesium が pointerdown の default を止めるため、
    互換マウスイベントが生成されない＝実測 0 対 4）。`click`/`dblclick`/`mousemove` は Cesium の
    ScreenSpaceEventHandler のまま（ドラッグを click にしない抑制は MapLibre と同じ）。`contextmenu` は
    DOM 側へ移した（`e.preventDefault()` が効くようにするため）。`mouseout` は**開いている hover を閉じる**。
  - **③b `sourcedata` が `isSourceLoaded` を運んでいなかった。** 発火はしていた（実測 12 対 95）ので
    「頻度の違い」に見えるが、**アプリの購読者3つは全員 `e.isSourceLoaded` を見る**——OFM 地名ラベルと
    ラベル言語の再アサート／コミュニティ板の参照オーバーレイ／**衛星のクロスフェード**（届くまで待ち、
    さもなければ 1,900ms のタイムアウトに落ちる）。**形が違うイベントは、発火しなかったイベントである。**
    「読み込み済み」の意味は型ごとに違うので型ごとに答える（geojson＝データがある／vector＝
    `stats().pending===0`／raster 系＝Cesium は**タイルを地球単位でしか追わない**ので `tilesLoaded`。
    キューが 0 に落ちた瞬間だけ発火する＝1画面ぶんのタイルで1回）。
  - **④ `fitBounds` が球で箱を切っていた。** 平面メルカトルで矩形に合わせていたので、球では奥側が
    画面外へ出る（実測：欧州サイズの箱で **6%**、日本 0.6%、パリ 0.2%）。球のときは球に訊く——
    視点距離 d に対し各境界点 (e,n,u) が `d ≥ R·u + R·max(|e|/tanX, |n|/tanY)` を満たす最小の d（閉形式）。
    **小さい箱では上の式に代数的に一致する**ので二重の幾何ではない。実測で MapLibre の globe fit と
    小数第3位まで一致（日本 6.606／欧州 3.709／パリ 8.537）。併せて `wrapLng(east-west)` が
    **360°→0** になり経度の制約が消えていたのも修正。
  - **⑤ 既定エンジン（MapLibre）で「衛星」を押すと例外。** `applyTheme` はスプライトを作り直し
    （＝`styledata` を**同期で**発火し）、その `styledata` ハンドラが `applyTheme` を呼び戻すが、
    ループを止める `layer-sat` の可視性変更は**その次の行**。実測 `RangeError: Maximum call stack size
    exceeded` が3〜6件・11段の再入。**再入禁止フラグ**にした（外側の呼び出しが全部やるので内側は不要）。
  - **⑥ ベクタタイルが深いズームから戻ると復活しなかった。** 「まだ要るか」を `generation` カウンタで
    見ていたが、`update()` は**カメラ移動ごとではなくレイヤごと・フレームごと**に呼ばれる＝1ソース10レイヤなら
    静止していても毎フレーム10回増える。結果、`onChange`（＝タイルが届いた、描き直せ）がほぼ常に握り潰され、
    z12 から z1.7 に戻ると**国名ラベル1,122件が二度と戻らなかった**（レイヤは可視・ズーム範囲内・
    768 features 到達・714 がフィルタ通過で、描画 0）。**「今の視界が覆うタイル集合」**（`wantSet`）に
    置き換えた。
  - 検証：`tests/r181-checks.test.mjs`（20件・Node）＋`tests/r181-cesium.spec.js`（10件・実ブラウザ）。
- **#R182：第2エンジンの「操作」を MapLibre の操作にした（`js/cesium-input.js` 新設）。**
  #R180 は Cesium 自身の `ScreenSpaceCameraController` を置いたままだった。それは**別の航法モデル**
  （左ドラッグ＝地球を中心まわりに回す／右ドラッグ＝ズーム／中ドラッグ＝傾け／ホイール＝視線方向へ寄る）で、
  契約が名前を持つ8ジェスチャのうち**6つに束縛が無かった**。実測（両エンジン・同じ canvas・同じカメラ・
  実入力）：左120px→ 平面 −6.17 対 −5.30／下120px→ +1.23 対 **+5.01（4倍）**／右120px→ bearing +96 対
  **無反応**／右上120px→ pitch +48 対 **ズーム −0.12**／ctrl+上→ +48 対 **無反応**／shift+ドラッグ→
  +2.83 対 **無反応**／ホイール→ +0.267 対 **0**／矢印キー→ +4.42 対 **無反応**。＝「ほぼできない」。
  - **数値は転写であって発明ではない。** 本文の定数と式は同梱の `node_modules/maplibre-gl`（#R158 以来
    5.24.0 に固定）の**ハンドラ実装そのもの**から取り、使用箇所ごとに出典を書いた。重要なのは
    **MapLibre の globe pan は「掴んだ点をカーソルに追従させる」ではない**こと——MapLibre 自身が
    `handleMapControlsPan` にそう書いている——ので、直観的な実装のほうが**一致しない**。
    `computeGlobePanCenter`（bearing 回転・`lngSpeed`・`getDegreesPerPixel`）＋
    `getZoomAdjustment`（緯度が変わると globe の見かけを保つため zoom が動く）をそのまま持ち込む。
  - **カメラは必ず `setCamera()` 経由。** この層は `Cartesian3` を一切触らない＝#R181 の `_faceHeading`、
    #R180 の range↔zoom 転写、DEM の `_settle` が1か所のままになる。ジェスチャの1フレームは
    `{silent:true}` で渡し、**movestart…moveend はジェスチャ全体（慣性を含む）で1組**にする
    （`moveend` の購読者は19あり、レイヤ再調整やニュース更新をする）。
  - **同時に見つかった、ジェスチャ以外の4件**（いずれも #R180 から在り、実測で出た）：
    1. **アニメーション経路が着地点を外していた。** `flyTo` に**軌道の角度**を `orientation` として
       渡していたが、Cesium の orientation は**目的地の局所フレームでのカメラ自身の姿勢**。実測：
       `easeTo` で centre 12,25 z4 を頼むと、pitch 30 で **lat 40.03・pitch 57.9**、pitch 60 で
       **lat −0.38・pitch 0**、pitch 0 では **bearing が −180**（＝#R181 の「垂直な軌道は heading を
       運べない」が別経路に残っていた）。→ **目的地を瞬時経路で解いて**位置と姿勢を読み、カメラを戻し、
       `direction`/`up` で飛び、**到着時にもう一度同じ解を当てる**（`_aimAt` の呼び出し元は3つ）。
       アプリの動く視点は全部ここを通る（検索結果・Atlas・ズームボタン・duration 付き fitBounds）。
    2. **`around` がアダプタで捨てられていた。** 渡すのはアプリ自身のダブルクリック/ダブルタップ拡大と
       ピンチ＝**カーソル地点へズームする** UX（#R20）そのもの。`camOf` に足し、`setCamera` が
       「その緯度経度を元の画素へ戻す」まで中心を解く（実測ずれ 0〜1.8px）。
    3. **プログラム的なカメラ命令が慣性に負けていた。** MapLibre の jumpTo/easeTo/flyTo は先頭で
       `stop()` する。無いと、滑走中のフリックが `jumpTo` の上に書き続ける。
    4. **右ドラッグの離しでアプリの `#ctx-menu` が開き、canvas を覆っていた。** MapLibre は
       ジェスチャが始まった時点で `contextmenu` の**マップイベントを握り潰す**
       （`BlockableMapEventHandler`）。実測：右ドラッグ1回のあと、次のホイールと次の
       ctrl ドラッグは**メニューに当たって何も起きなかった**。
       **抑止は押下期間ぜんぶをまたぐ形でなければならない**——`contextmenu` は **Chromium で
       Linux/macOS は mousedown、Windows は mouseup** に出るので、「回った**あと**」だけ握り潰す
       実装は Windows でしか効かない（ローカルで通り CI で3回とも落ちた）。**押下で保留・回転に
       なった瞬間に破棄・離したときに残っていれば発火**（＝MapLibre の `_delayContextMenu`）。
  - 結果（実測・同一 run で MapLibre と突き合わせ）：pan −5.273 対 −5.273／+4.779 対 +4.779／
    rotate +96 対 +96／pitch +48 対 +48／ctrl も同値／wheel +0.268 対 +0.268／box zoom 2.059 対 2.061／
    矢印 +4.415 対 +4.409／shift+矢印 15/10 対 15/10。
  - 検証：`tests/r182-checks.test.mjs`（17件・Node。**定数は `node_modules/maplibre-gl` を読んで突き合わせる**
    ので、依存を上げて操作感が変わると落ちる）＋`tests/r182-cesium.spec.js`（8件・実ブラウザ・差分方式）。
  以下は経緯：**#R152 で薄い抽象層 `IntMapGeoEngine`（第1段階）を導入**——将来 Google-Earth 級 Earth Mode を差し込めるよう MapLibre 依存を段階的に隔離。現時点の実装アダプタは MapLibre のみ・挙動は完全同一。Cesium は**過去の全面移行は廃止**だが、**capabilities/contract のみ宣言**（SDK・キーは未導入）。詳細は §7.1 と末尾 #R152 補足。**#R161 で第3段階＝ニュースピン・オーバーレイを丸ごと engine 経由へ移行**（生 `map` 非参照のサブシステム第1号）。
- バックエンドは **Supabase**（DB・認証・ホスティング・Edge Functions）。
- 配信は OneDrive 上の静的ファイルを直接ホスト（`index.html` / `admin.html`）。
- **対応UI言語は9つ**: 英語 (en) / 日本語 (jp) / ドイツ語 (de) / ロシア語 (ru) / スペイン語 (es) / 繁體中文 (zh) / 简体中文 (zh-hans) / フランス語 (fr) / 韓国語 (ko)。地名ラベルも全言語対応（`applyLabelLang` の `name:<lang>`）。
- **言語を1つ増やすコストは「ファイル1本」**（#R232）。`js/locales/ui.<code>.js` を置くだけでよく、登録簿の行も `src/main.js` の import 行もピッカーの項目も launch screen の語も要らない：
    - `src/locale-boot.js` が `import.meta.glob('../js/locales/ui.*.js')`（**lazy**）でディレクトリを読む＝**言語の集合はファイルの集合**。⚠ `src/` に置くのは、`js/` を `scripts/static-checks.mjs` がプレーンなスクリプトとして解析するため（`import.meta` が自由識別子になり検査が落ちる）。
    - `js/lang-registry.js` の `derive(code)` が label（`Intl.DisplayNames` ＝その言語自身の名前）・BCP-47 タグ・2文字 pill を code だけから作る。登録簿に literal 行として残るのは**ファイル名では運べない事実を持つ言語だけ**——最初の5言語（＝`L(…)` の引数順で、順序が load-bearing）と中文2行（スクリプト別 alias・1文字 pill・`normalise` の解決順）。
    - 読み物2ページ（`sources.html` / `science.html`）は bundler が無いので、`scripts/i18n-langs.mjs` が `js/locales/_langs.js`（`window.IntMapLangCodes` と `window.IntMapLangBeta`）を生成し、`prebuild` で毎ビルド更新する。`tests/r232-checks` が「ディレクトリと生成物が一致すること」を検査する。
    - **(beta) 表記は測って付く**：同スクリプトが inline テーブルの被覆率を計算し、98% 未満なら beta。埋まれば誰も気づかなくても自動で外れる。明示 label（中文2行）は常に優先。
- **locale は遅延読み込み**（#R232）。eager なのは英語（＝全テーブルが `Object.create` で繋がるプロトタイプ）だけで、利用者の言語は独立チャンクとして取得し、`js/app-body.js` の起動バリア（エンジン選択と同じ `then(go,go)`）で待つ。7言語 eager だった頃の **492 kB が起動から消えた**（実測 eager JS 4,325 kB → 3,993 kB）。`js/i18n.js` はテーブルを**差し替えず in-place マージ**する（`i18n.de` を参照で掴んでいる読者が多数いるため）。
- **2つの翻訳テーブル**: `ui`（494 のキー付き文字列）と `inline`（3,576 の呼び出し側インライン文字列を**英語の原文をキーに**持つ表）。⚠ (#R251) **「どの呼び出しが翻訳呼び出しか」はリポジトリ全体で1回だけ解決する**（`scripts/i18n-helpers.mjs`）——report・positional 監査・pair 監査の3つが読む。ファイル単位で3回答えていたため、**他モジュールのプロパティ越しに届く helper**（`HOST._coL(…)`）の65サイトが全計器の宇宙の外にいた。⚠ (#R251) 被覆行列には **`=EN` 列**（inline 行のうち値が英語のままの数）がある——#R239 の「被覆は『存在する』でなく『英語と違う』」を inline 面にも適用したもので、新言語の雛形は 3,576 行すべてが英語なのに presence では 100% に見えていた。
  - ⚠ (#R235) **その測定は自動化されている**: `node scripts/i18n-positional-audit.mjs [--all|--gate]` が js/ を **acorn で構文解析**して（コメント中の `L('…')` は数えない）① 引数が5つ未満の call site と ② 各言語の引数が英語と**同一**の call site を数える。単位・記号・固有名詞・借用語は `NEUTRAL` に列挙してあり、**そこへ足すことは「この語で正しい」という主張**であって門を黙らせる手段ではない。初回実行で **27 件（`js/analysis-panels.js` のスペイン語が丸ごと欠落）と de の実欠陥4件**を検出・修正し、**現在 de / ru / es とも 0 件**。`tests/r235-checks.test.mjs` が `--gate` で回している。
  - ⚠⚠ (#R237) **その計器が見ていないもの**: `L(…)` の**呼び出し位置**しか読まないので、
    `jp ? '取得できませんでした: ' : 'Could not load: '` のような**2分岐の三項**は視野の外にある——
    日本語以外の**全言語**が英語側を受け取るのに、監査は 100% と報告する。#R231（手書き三項281本）・
    #R232（40件）・#R236（3件）が毎回これを手で見つけていたので、**数える計器を足した**:
    `node scripts/i18n-two-branch-audit.mjs [--list]`。初回実行で **65件**（`data-layers.js` 42・
    `atlas-controls.js` 6・`map-ui.js` 4・`community-board.js` 5・`analysis-panels.js` 4・
    `community.js` 2・`ai-core.js` 1）を検出し、全件を5言語の `t(…)` へ書き換えて**現在 0 件**。
    ⚠ 判定は**散文かコードか**を見分ける発見的手法（`'ja':'en'` のようなロケール符号や
    Wikipedia のサブドメインは正しく2分岐のまま）なので、**門ではなく一覧**として出す。
    ⚠ 最初の版は CJK に3文字の下限を付けていて「軍用」「速力」「種別」など**2文字の見出し15件を
    見落とした**——日本語のUI文字列の大半がその長さである。下限は外した。
    `tests/r237-checks.test.mjs` が同じ形を検査している。
  - ⚠⚠⚠ (#R243) **9つ目の面は閉じ、10個目の盲点は塞いだ。**
    ① **9つ目の面**（#R242 が計測だけして OPEN GAP と書いた `jp() ? '日本語' : 'English'`）は **0 件**。
    `scripts/helper-ternary-codemod.mjs` が **467 か所**を `window.IntMapLang.t(lang, en, jp, de, ru, es)` へ
    書き換え、ロケール符号 11 か所は `IntMapLang.locale()` へ、`{en,jp}` の表 3 本（`DISPUTES`／
    `CATS`／`PG_PRESETS`）は `pickArgs()` へ、既定通貨・既定国の 2 か所は**言語キーの表**へ移した。
    `scripts/i18n-audit.mjs --gate` はこの数を**印字するだけでなく落とす**（#R242 が昇格の条件として
    書き残したとおり）。
    ② **10個目の盲点**＝`scripts/i18n-positional-audit.mjs` が `IntMapLang.t(lang, …)` を**一度も見て
    いなかった**こと。#R231 が 281 か所をその形へ変換して以来、de/ru/es の「引数は本当にドイツ語か」は
    その全部が**測定の宇宙の外**にあり、表は 100% と出していた。両方の形を読むようにして宇宙は
    **2,422 → 3,204 サイト**になり、そのうえで de/ru/es とも **0 件**。
    ③ **辞書は1本・6列**（`scripts/i18n/r243-*.json` ＝ `"English": [de, ru, es, fr, ko, zh-Hant]`）。
    最初の3列は call site の引数へ、後の3列は inline 表へ（`node scripts/i18n-apply-inline.mjs`）、
    `ui.zh-hans.js` はそこから生成。**同じ訳を2箇所に書く形を作らない**。
  - ⚠⚠⚠ (#R244) **11個目の形＝「言語コードをキーにしたオブジェクト」**。
    `nm:{en:'Tibet',jp:'チベット',de:'Tibet',ru:'Тибет'}` を `nm[lg]||nm.en` で読む形。#R241 が閉じたのは
    **配列**の形で、その番人（`i18n-positional-array-audit.mjs`）は「言語→**位置**の表」＝値が**数値**の
    ものしか見ないので、兄弟であるこの形は素通りしていた。**どの計器からも見えず**、
    **inline 表へのフォールバックが無い**ので、そのオブジェクトが名前を挙げていない言語は
    **構造的に英語**になる（多くが4〜5言語しか挙げていない＝fr/ko/zh/zh-Hans は必ず英語）。
    · 計器 `scripts/i18n-langmap-audit.mjs`（構文・文字列ではない）を新設し、`i18n-audit.mjs --gate` の
      **OPEN GAP** として印字する（#R242 が定めた作法：1ラウンドで閉じられない量は門にせず、**数字を
      常設出力に**する。百分率には数えない）。`tests/r244 ⑬` が**数はもう増えない**ことをラチェットする。
    · 変換は `scripts/langmap-codemod.mjs`（`obj[lang]||fallback` を `IntMapLang.t(lang,…)` へ）。
      ⚠ **5言語すべて揃っている site しか触らない**——`t()` は位置引数で、4引数の call site は門に落ちる。
      ⚠ **散文かコードかを判定する**（初版は Atlas の同義語表 `{english:'en',deutsch:'de',…}` を書き換えて
      機能を壊し、Google News の `hl=…&gl=…&ceid=…` を翻訳表に入れた。両方とも取り消した）。
    · **#R246 で 0 になった。** 残っていた 590 サイト・12ファイルを全部 `pickArgs()` の呼び出しにし、
      読み出し側も `pick().arr()` に揃えた（データを直すだけでは足りない——読み出しが `x[lang]||x.en` の
      ままなら計器は緑・画面は英語）。`js/wb-layers.js` の第2表 `BX_TR`（de/ru 用34件）は**削除**して
      指標名を1呼び出しに統合し、`js/app-body.js` のニュース言語名は**表を消して `Intl.DisplayNames`** へ。
      0 になったので **OPEN GAP から `problems` へ昇格**（#R244 の注記が定めた条件）。`tests/r246 ①`。
  - ⚠⚠⚠ (#R246) **12個目の形＝「隣り合ったデータ枠に置かれた翻訳」（OPEN GAP・2,262件）**。
    `_dc(…,'Ramstein Air Base','ラムシュタイン空軍基地',…)`／`['Light (< 7 t)','小型機（7 t 未満）',…]`／
    `[-160,32,0.5,'North Pacific Ocean','北太平洋',…]`。**言語で添字されていない**ので、11個目（鍵）と
    7個目（位置の表）を見る計器はどちらも 0 と数える。計器 `scripts/i18n-pair-audit.mjs` は
    「1つの配列／1つの呼び出しの引数列の中で、隣り合う2つの文字列リテラルのうち**片方だけが日本語**」を
    **容器ごとに1件**数える（5言語の行は「直すもの1つ」）。
    · ⚠ **免除はファイルから解決する**——`IntMapLang.pick()/.pickArgs()/.t` に束ねた名前、world-packs の
      `_ui` から分割代入した名前、そして**本体に `IntMapLang` と書いてある関数**（`_authL` のような
      各ファイル自前のラッパ）。名前の一覧にすると、その一覧の維持という新しい仕事が生まれる。
    · 1ラウンドで閉じられない量なので **OPEN GAP**（印字のみ・百分率に数えない・門は落とさない）。
      `tests/r246 ②` がラチェット。0 になったら `problems` へ昇格する。
    · ⚠ (#R245) **9ファイルを閉じた**（`data-layers.js` 41・`history.js` 39・`space-cosmos.js` 17・
      `time-borders.js` 8・`flight-sim.js` 6・`world-packs.js` 5・`map-extras.js` 3・`engine-select.js` 2・
      `ocean-currents.js` 1）。**変換の形は `IntMapLang.pickArgs()`**（渡された配列をそのまま返すので
      データは不変、ファイルにはふつうの CallExpression が現れる）、**読み出しは `pick()` 自身
      （`L.arr(x)`）**——位置引数を越えた言語は英語をキーに inline 表へ届く。
      ⚠⚠ **ケッペンの気候名は「4つの表」だった**（`{en,jp}` リテラル＋`_kde`/`_kru`/`_kes` を起動時に
      patch）。1つの表・1つのアクセサ `window.kName()` にし、`js/map-ui.js` と `js/map-readout.js` も
      それを訊く。⚠ **計器の宇宙が2度広がった**（inline 2,726→2,848／位置引数 3,226→3,347）——
      露出した 122 文字列を fr/ko/zh へ書き、zh-Hans は生成。`Tundra`/`Tibet`/`Manchukuo`/`Siam`/`Persia`
      はその言語の語なので `NEUTRAL` に理由付きで登録した。
      ⚠ 新しいスコープに `LA` を宣言し忘れた3ファイルは `scripts/static-checks.mjs` の
      **`split-scope`** が捕まえた（＝本物のスコープバグ。2ラウンド連続でこの検査が効いている）。
    · ⚠ (#R247) **2,262 → 2,255。** 残りは主に「固有名詞のデータ表」（`gazetteer` 662・`tables` 494・
      `companies` 170・`reference-data` 143）で、これは**訳語そのもの**を9言語ぶん書く仕事であって
      機械変換では終わらない。ラチェットは 2,255 に降ろした（`tests/r246 ②`）。
    · ⚠⚠ (#R248) **2,255 → 2,031。** 機械で確実に変換できる部分を `scripts/i18n-pair-codemod.mjs`
      （新設）が 224 容器ぶん書き、露出した **153 文字列**を fr/ko/zh へ、zh-Hans は生成
      （宇宙：inline 3,268→3,421・位置引数 3,825→4,034。**9言語×全面 100%**）。
      de/ru/es が無かった 78 サイトは訳語を書いた（`LEGEND_DESC` 30・レイヤー名・宗教凡例ほか）。
      ⚠ **codemod は3種類の「翻訳でない配列」を書き換えてはならない**——実際に初版が壊しかけた：
      `['United States','アメリカ','🇺🇸']`（国旗が**ドイツ語**枠に）／
      `['coal_share…__pct','Coal','石炭','#6b6b6b']`（データ鍵が**英語**枠に）／
      `['暴風雪','Snowstorm']`（日本語が**英語**枠に）。規則は**位置と全体**：枠0が英語散文、
      枠1が日本語、以降の枠は**何らかの字母を含む**こと（絵文字・16進色・snake_case 鍵は落ちる）。
      さらに**座標を持つ行の先頭要素は照合語リスト**（`_ORG_GZ`／`gazetteer`）なので除外する——
      UI として登録すると、次のラウンドが「照合用の語」を律儀に翻訳しにくる。
      ⚠⚠ **`LA` の束縛は位置ではなくスコープで解決する**。初版は「直前の宣言」を採り、
      4つの兄弟 IIFE を持つ `js/layer-packs.js` で**兄弟の名前**を渡した＝
      `ReferenceError: LA is not defined` が評価時に出て宗教・言語パックが丸ごと死んだ。
      **node の検査は1つも気づかず、捕まえたのはブラウザ**（[[intmap-recurring-lessons]] L）。
      `tests/r248 ①` が全 `LA(` の解決をスコープで検査する。
  - ⚠⚠⚠ (#R247) **13個目の形＝「三項演算子の腕が配列」**。9個目（`jp() ? '日本語' : 'English'`）を
    **1つ内側の容器で**書いたもの：
    ```
    return jp() ? [['ui','UI・表示'],…] : [['ui','UI / display'],…]
    ```
    どの計器も 0 と数える——helper-ternary 監査は**腕がリテラル**であることを見ており、隣接ペア監査は
    日本語と英語が**隣り合っている**ことを要求するが、ここでは**別々の腕**にある。実測 **4容器・23文字列**、
    すべて de/ru/es/fr/ko/zh/zh-Hans で英語。しかもその1つは**バグ報告の分類メニュー**で、
    利用者が報告を書き始める前に必ず選ばされる欄だった。
    · 計器は**増やさない**（#R239 の規則）——`scripts/i18n-helper-ternary-audit.mjs` に
      「腕が ArrayExpression／ObjectExpression で同型」の枝を足し、`kind:'container'` として
      **容器数と中の文字列数**の両方を数える（1つの三項がメニュー1枚を隠せるため）。
      `i18n-audit.mjs --gate` がその内訳を印字する。**現在 0。**`tests/r247 ⑤`。
    · ⚠ **3か所のうち2か所は UI 文字列ですらなく、言語ごとに答えのある「データ」だった**ので、
      表を訳すのではなく**出所を変えた**：カレンダーの曜日頭文字は `Intl.DateTimeFormat(weekday:'narrow')`、
      2つの Wikipedia ウィジェット（今日の秀逸な記事／今日の出来事）が読む版は
      `IntMapLang.htmlTag()` の**主サブタグ**（英語を後段のフォールバックに）。
      どちらも**言語を1つ足しても、ここは1行も編集しなくてよい**形になった。
  - ⚠⚠⚠ (#R248) **14個目の形＝「言語→位置の表を、式で書いたもの」**。7個目（#R241）が閉じたのは
    言語→**位置**の対応を**オブジェクト**で持つ形で、その番人は「値が数値の表」を探す。同じ表は
    括弧を外しても書ける：
    ```
    m.lbl[ L()==='jp'?1 : L()==='de'?2 : L()==='ru'?3 : L()==='es'?4 : 0 ]
    ```
    **この repository のどの計器も 0 と数えた。** 実測 **6か所・3ファイル**——
    `js/analysis-panels.js`（Countries パネルの**指標名62件**）・`js/data-layers.js`（**全レイヤーの凡例説明**）・
    `js/drone-nav.js`（機体諸元・プリセット名・チェック名・危険名の**4つ**）。
    最後の腕が `0` なので **fr/ko/zh/zh-Hans は英語**で、しかも**配列を直接添字するので registry を
    一度も通らない**＝ inline 表のフォールバックが原理的に届かない（短い `L(…)` 呼び出しとはそこが違う）。
    · 直しは `pick().arr(tuple)`（`js/lang-registry.js` の `pick` 自身）。
    · 計器は**増やさない**——`scripts/i18n-positional-array-audit.mjs`（主題が「言語→位置」）に
      **③ index-chain** の枝を足した。単発の `lang==='jp'?1:0`（桁合わせ等）は誤検知しないよう、
      **連鎖であること**を要求する。`i18n-audit.mjs --gate` の
      「translation tuples held as data instead of as a call (incl. language→index chains)」に合流。**現在 0。**
    · ⚠ **検査は AST で書く**（`tests/r248 ①`）。正規表現にすると、この節や各修正箇所の**コメントが
      引用している欠陥そのもの**に当たる——[[intmap-recurring-lessons]] E の9回目を実際に踏んだ。
    · ⚠ **言語凡例（16言語）は表をやめて CLDR へ**：`Intl.DisplayNames({type:'language'})`。
      「言語の名前を、その言語で」は CLDR が答えを持っているので、9言語ぶん126文字列を書く代わりに
      **言語を足しても1行も編集しない**形になった（#R247 の作法の3例目）。
  - ⚠ (#R235) **inline への追記は `scripts/i18n-append-inline.mjs` を使う**（既存の `inline` に挿入するだけ・既存キーには触らない）。`scripts/build-ui-zh.mjs` が文書化している「`rm ui.zh.js` → `--template` → rebuild」は**非可逆に壊れる**——`scripts/zh/*.json` は `ui.zh.js` の完全な出所ではなく、実行すると実訳が **2,082 → 1,877（205 件消失）**する（#R235 で実測・取り消し済み）。⚠ `ui.zh-hans.js` は**手で書かない**（`tests/r224 ④`・`tests/r231`）——繁体を直してから `node scripts/zh-hans.mjs`。

---

## 2. 主要機能一覧 (Features)

- **ライブニュースマップ** — 世界の見出しを「出来事が起きた場所」にピン表示。発信元（媒体HQ）表示にも切替可。
  地点解析は**サーバー側でAI事前解析**（後述）。72時間以内のニュースのみ表示。
- **70以上のデータレイヤー** — 気候(ケッペン/気温/降水/風/レーダー/雲/積雪/エアロゾル/一酸化炭素CO)、
  海洋(SST/海面水温偏差/海氷/EEZ/海底ケーブル/航空機。海洋クロロフィルはbeta)、
  地形(土地被覆/エコリージョン/プレート/段彩/陰影/等高線/海面上昇/植生NDVI/土壌水分)、人口・経済(人口/人口密度/GDP/HDI/出生率…)、
  災害・夜空(熱異常/オーロラ/夜間光/火山)、地政学・防衛(NATO/EU/旧ソ連/軍事費/前線/鉄道/歴史的国境…)、その他(beta)。
  GIBSラスタの**凡例は実際のNASAカラーマップXMLから生成**（色が地図と一致。R42で海氷・SST偏差等を是正）。
- **Globe / Flat / Satellite / 3D地形** 切替、コンパス、距離・面積計測、半径円(Radius)、可視判定(LOS/レーダー影)。
- **ドローン航法（#R174）** — Measure ▸ 🛸 Drone（`IntMapDrone`）。地図に出発地・経由地・目的地を置き、各点に高度を与えると、
  **実地形の DEM を経路に沿ってサンプリング**して総飛行距離／立体経路長／予想飛行時間／高度推移／地上高／最大必要高度／
  推定バッテリー消費、そして**飛行条件を満たさない地点とその理由**（地形接触・最低地上高・最大高度・航続距離・電力）を返す。
  機体条件（巡航/最大速度・最大高度・最低地上高・航続距離・バッテリー容量・巡航消費電力・機体重量・積載・上昇/下降速度・予備率）は
  すべて編集可。**高度は AGL/AMSL をウェイポイントごとに保持し両方を常に表示**。「地形に沿わせる」で尾根を越える高度へ自動修正。
  経路・ウェイポイント・危険地点は3-Dで描画。保存/読込/削除、Atlas `{"type":"drone"}` 対応。
- **国情報** — Countries(info) を ON にして国をタップ → 統計カード＋詳細ポップアップ（世界銀行の時系列グラフ、比較）。
- **Isolate（この国だけ表示）** — 1国だけ残して周囲をマスク。国情報ポップアップ、または通常時に国名ラベルをタップ→ボタンから起動。**タイムマシンで過去に遡った歴史的国家（チベット・独帝国・オスマン帝国…）も、その当時の版図(era polygon)をそのままIsolate可能**（#R106 `enterGeom`。現代の国境で誤解決しない）。Isolate時は青いハイライト/アウトラインを**自動消去**（#R107）。歴史的国名ラベルは**全言語ローカライズ**（#R107 `_locName`）。チベット等はPRC併合(1951)以降、国境線ごと中国に**溶融**（#R107 `turf.union`）。
- **統計(Stats)・情報(Information)ダッシュボード・コミュニティ** タブ。
- **サイドバー・ウィジェット**（FX・ランダム国など、追加/並べ替え可）。
- **アカウント/AI機能** — ログインで使えるアカウント制AI（翻訳・要約・画像解析など。1日上限つき）。
- **テーマ (Theme)** — System / Light / Dark（スキンテーマ群は#R33で廃止）＋**アクセントカラー**（#R114、アカウント同期）。
- **設定ページ（#R118で再構成）** — 全モード（通常/モバイル/ワークスペース）共通のモーダルを**8セクションのiOS風グループ**に再編：外観／レイアウトとパネル／地図の動作／単位と時刻／ニュースとティッカー／AI／連携・キー／情報とサポート（5言語見出し `setSec*`）。
- **範囲人口（#R118 / #R123 / #R124）** — 面積測定・半径円・**自由描画(Draw)ツール**のパネル、およびAtlas `population` アクションから、**WorldPop 100mグリッド(2020)** の実グリッド集計で「囲んだ範囲の人口」を算出（`IntMapPopArea`、リング80頂点に間引き、非同期タスクAPI）。#R123: ポーリングを~2分・バックオフ・errorステータス即中断へ延長。Drawの閉領域(loopRings)はMultiPolygonで合算。**#R124: WorldPopは1リクエスト上限100,000km²**（超過は"area was too large"エラー）→ `estimate`が上限超を**turf.bboxClipでサブ上限セルにタイル分割→ポリゴンにクリップ→合算**（緯度別セルサイズで最少化・4並列・80セル上限）。measure/Drawパネルはタイル毎の実Progress表示。実測: 380k km²→56,444,422人（6タイル）。
  ⚠ **(#R252) 進捗バーは行の「下」で、行の「中」ではない**——アンカーが `#tp-pop-btn` だったので、
  `.rad-actions{display:grid;grid-template-columns:repeat(3,1fr)}`（#R146 の3ボタン行）の**2番目のセル**として
  挿入されていた。実測（パネル実寸282px）: 幅**90px**・3つ目のボタンが2行目へ（top 8→96）・ラベルは省略記号だけ。
  `closest('.rad-actions')` ＝行そのものをアンカーにする（`js/map-tools.js` の描画ツール側は素のブロック要素なので
  元から無傷）。再表示時は fill/％も 0 に戻す。
  ⚠⚠⚠ **(#R253) そして「不確定スイープ」は #R139 以来1度も動いていなかった**——`.tp-prog.indet .tp-prog-fill` が
  `background: … !important` という**ショートハンド**で書かれていた。ショートハンドは `background-position` を初期値へ
  戻し、`!important` が付いているのでそれは**重要宣言**になる。CSS カスケードでは **重要作者宣言 > アニメーション**
  なので、`@keyframes imProgSweep` の `background-position` は一度も適用されていない。実測（1周期を11点で
  サンプル）: `backgroundPositionX` は `0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0%`。画面に出ていたのは**トラック左端 42% を
  覆う静止した塊**で、％表示が無いこととあわせて「42%で止まった進捗バー」と見分けがつかない＝報告そのもの。
  ロングハンド（`background-image` ＋ `background-color:transparent`）に直すと実測 `-42% → 5.5% → 53% → 100.5% → -42%`。
  `background-color` を明示的に消すのは、インラインの `background:var(--prog-grad)` が残ると帯の裏に**全幅の
  アクセント色**が塗られるため。
- **Playground (beta)** — 設定ではなく **Layers ▸ Tools**（旧Quizモードの場所）から起動。5モード（実データ）:
  World Explorer（衛星GeoGuessr。完全ランダム陸地・ズームアウト減点・開始地点ピン・回答地図はglobe・起動時に
  サイドバー収納/タブ解除）/ Pandemic Simulator（国別 SEIR メタ個体群＝実在都市に症例ドット・交通網拡散・自動
  ロックダウン/国境封鎖・変異株・ワクチン/治療・速報通知）/ Statecraft（旧Nation Sim。7指標＋5勢力で政策が
  制約される国家運営、1900–2026）/ World Sandbox（世界を編集：新国家を描く=turf面積/都市/海面/航路封鎖と影響）/
  Quiz mode。
- **β追加レイヤー(#R31)** — USGS地震（ライブ＋過去）・注目度ヒートマップ（ニュース密度）・World Bank コロプレス
  8種（CO₂/都市化/電力/医療費/森林/再エネ/携帯/インフレ、最新値）。`_registerLayerOpacity` で凡例+不透明度。
- **Bug Report** — 診断情報を自動添付してSupabase `bug_reports` に送信（オフライン時はローカル+クリップボード）。
- **Atlas（自然言語コンソール, beta, #R42〜#R52)** — 自然言語で指示するとAIが**JSONアクション計画**を返し、実ディスパッチャが
  実行。明確な単一指示は**AIを介さない決定論パス(`localPlan`)**で即実行（#R52）。**IntMapの全動作**を網羅（移動/ズーム/投影/3D/ベース地図/方位/回転、レイヤー切替/**不透明度**/グリッド/国情報、
  天気/AIブリーフ/ここをAIに聞く/比較/Isolate/ピン/計測/半径/**海路ルート**/**見通し線(レーダー死角)**/**滑走路検索**/相関ツール/
  ウィジェット/スクショ/共有/設定/タブ/タイムトラベル/**国を選択**/**時系列グラフ**/**学習モード**/**ECMWF気象スイート**/場所検索/
  **プレイグラウンド(world/pandemic/quiz)**/**ニュース切替(主題/発信元/保存/翻訳)**/**ログイン/寄付/フィードバック/バグ報告**（#R52）/
  全消去、テーマ/言語/単位）。`countryStats` 上の**実分析**＝ランキング・比率・**回帰残差relate**（例「GDP per capitaの割にHDIの低い国」）
  に加え、**コロプレス `mapMetric`**（全世界を指標で色分け＋凡例＝「データ×地図」の複合出力）。分析結果は専用 `nlq-src`
  （`window.countryGeo` 由来、Countries(info)レイヤー非依存）で国をハイライト/色分け＋一覧。**複合指示**対応（各アクションを順次await実行、
  分析+レイヤー+移動を1計画で自由に組合せ）。**リサーチ地図の二系統（#R135）**＝`mapReport`（現在/直近のライブニュース事件のみ）と **`researchMap`（歴史/現在/混合の状況リサーチ・文章＋地図を独立生成）**。**Request Profile**（時間軸・地理・要求出力を機械判定→`buildPrompt` に注入）＋**能力レジストリによる実行前プラン検証**で、歴史質問がライブ専用 `mapReport` へ／海域の局所質問が世界同盟地図へ流れるのを実行前に防止（詳細は #R135 補足）。
  - **#R149 画像入力（ビジョン）** — Atlas入力欄に**画像をペースト/ドラッグ/添付**でき、テキストと一緒にAIへ送信（クライアントで `compressImage`→JPEG data-URL、最大4枚＝ai-proxy `MAX_IMAGES`）。
  - **#R156 統合Visionパイプライン＋数式レンダリング＋地理判定** — 画像は**地図志向の汎用プランナーを経由せず**、専用 `_atlVisionTurn` が一つの処理系を実行: **分類**（`contentClass`＝math/document/code/language/geographic/photo/conceptual）→**転記**（判読不確実な字を`uncertain`で明示・確定扱いしない）→**求解/分析**（LaTeX+Markdown）→**決定論的検算**（`_atlVerifyChecks`＝BigInt厳密有理数で `matmul`/`equal` を再計算・`V·P=U`型を証明・失敗時は画像を1回再精査）→**統一レンダリング**→**地理のときだけ地図化**。高精細エンコード（`compressImage(f,2000,0.9)`）＋ai-proxy `vision_read` タスク（JSON・OpenAI `input_image` `detail:"high"`＝小さい文字/数式のOCR最大レバー・effortHint high）。**統一Markdown+LaTeXレンダラ**（`mdMini` 再実装）＝KaTeX（jsDelivr版固定・CSP `script-src` 既存許可）で表示/インライン数式・行列・分数・添字、`` ``` `` コードブロック（Copyボタン・HTMLエスケープ）、GFM表（横スクロール）、`` `inline code` `` を**PUAプレースホルダ保護**でescから隔離→R154/R155タイポHTMLは温存→復元（XSS安全・壊れLaTeX/CDN障害は生LaTeXへ縮退）。**コンテンツ分類が全経路の背骨**＝`_atlShouldMap` は `geographic`（＋未分類`''`＝非退行）のみ地図化し、`_pinReplyPlaces` は非地理クラスで即return＝**数学/文書/コードでは地点抽出を一切呼ばない**（`Problem`/`Thus`/`Let U and V` の誤地名化がコード側で構造的に不可能・禁止語一覧非依存）。送信/停止ボタンは**アクセントカラー**（空欄`.idle`のみ従来の白/黒）。
  - **#R149 調査回答の地点マッピング（業務委託）** — 地名豊富な `answer`/`analyze` が**ピン0で完了しない**よう、追加AI呼び無しで本文の地点を地図化：`analyze`は末尾 `PLACES:` トレーラ、`answer`は `places` 配列を同梱→`_pinReplyPlaces` が既存 geocode/placeExtent ladder（`_tryMapResearch`）でピン化し、**配置済/未配置の自己監査ノート**を返信（未特定は座標推測せず正直に未配置表示）。**#R156 で `answer` は `contentClass`/`checks` も同梱し、非地理クラスは地図化ゲートで抑止**。プランナ/answer/analyzeプロンプトに **MAPPING MANDATE**（地点は地図へ・本文と地図を一致・複数系統の一次情報で検証・自己監査）。
  - **#R149 調査回答の地点マッピング（業務委託）** — 地名豊富な `answer`/`analyze` が**ピン0で完了しない**よう、追加AI呼び無しで本文の地点を地図化：`analyze`は末尾 `PLACES:` トレーラ、`answer`は `places` 配列を同梱→`_pinReplyPlaces` が既存 geocode/placeExtent ladder（`_tryMapResearch`）でピン化し、**配置済/未配置の自己監査ノート**を返信（未特定は座標推測せず正直に未配置表示）。プランナ/answer/analyzeプロンプトに **MAPPING MANDATE**（地点は地図へ・本文と地図を一致・複数系統の一次情報で検証・自己監査）。
  - **#R43 三大修正**: ①**レイヤー混同の解消** — ライブのレイヤー名一覧をシステムプロンプトに注入し、`resolveLayer()` が
    完全一致/data-layer/前方一致/語一致/トークン被覆でスコアリング（しきい値あり）して**正確な1レイヤー**に解決、トグルした
    **実際のレイヤー名**を返信に明示。②**「実行したと言って未実行」の解消** — 全アクションが構造化 `{ok,html}` を返し、効果を
    検証（チェック状態・テーマ値等）。失敗は注意色で明示し、`run()` が実結果を集計してモデルの楽観的 `say` に**実行できなかった
    操作**を上書き表示（旧コードは `clickId` 後に無条件で `✓` を返し沈黙失敗していた）。③**全機能カバー** — 上記の新アクション群＋
    未知タイプは `control` フォールバックで実行。
  - **#R60 細かい指示・操作の第一級対応**（「Atlasで、まだ使えない操作がある。特に細かい指示や操作」）:
    新アクション `highlight`（国名列挙のハイライト・`on:false`で解除）/ `value`（1国の実数値・首都・通貨・言語を
    `countryStats` から即答。metric省略で統計カード）/ `layersOff`（全データレイヤー一括オフ。国境・地名等の
    ベース地図トグルは維持、`all:true`で全部）/ `clear`（`what:"pins"|"radius"|"highlights"|"outline"|"measure"|"isolate"|"all"`
    の**選択的消去**）/ `fullscreen` / `locate`（ブラウザ位置情報で現在地へ。拒否・タイムアウトは正直に警告）。
    既存アクションの精密化: `opacity` に相対 `delta`（「もっと薄く」）、`bearing` に方角 `dir`（「西向きに」）、
    `timeTravel` に `date:"YYYY-MM-DD"`（過去10年外は正直にエラー）。`localPlan` に決定論パターン多数追加
    （zoom to N・N度傾けて/回転・少し右へ・全レイヤーオフ・全画面・現在地・ピン/円/ハイライト消去・レイヤーN%・
    もっと薄く/濃く・「日本の人口は？」等の統計質問・「XとYをハイライト」、5言語アンカー付き＝複合/曖昧文は従来通りAIへ）。
    プライバシーポリシー§2に端末位置情報の扱いを明記（LEGAL_DATE更新）。
  - **#R61 虚偽報告の根絶＋色指定＋統合分析**（「実行できていない/指示に完全に沿えていない場合も完了報告」「赤でハイライトしても色が変わらない」「ニュースやレイヤー数値を統合した横断的出力」）:
    ①**正直な報告** — zoom/pitch/bearing は実行前のカメラ値ではなく**指示の目標値**を報告（`✓ Zoom → 6.0`）。
    `highlight`/rank系は `highlight()` の戻り値を**検証**し、スタイル読込中で描画できなければ有界リトライ（約5.6s）後に
    **正直に失敗を報告**（旧: 描画失敗でも ✦ と完了報告）。解釈できない色・実行できないパラメータは黙殺せず⚠で明示。
    ②**色指定** — `parseColor`（5言語の色名+hex）を新設し、`highlight`（色のみ指定で再着色も）/`mapMetric`（色相から
    5段階ランプ生成 `rampFrom`）/`radius`/`outline`（`IntMapOutline.setColor`）が color を実際にlive paintへ適用。
    localPlanに「日本を赤でハイライト」「highlight X in red」「赤でハイライト」(再着色)の決定的パターン。
    ③**統合分析 `analyze`** — {question, place?, countries?, use?} で、読み込み済みニュース(globalData、未ロード時は
    fetchData)・現況気象/大気質/海水温/標高(Open-Meteo)・直近24h地震(USGS)・国別統計(countryStats)を**実データとして
    収集**し、そのデータのみからテキストAIが統合回答（使用データ/取得不可データをフッターに正直に明記）。
    Privacy§4(AI送信データ)・Sources(USGS新規記載・Open-Meteo用途拡充)を更新。
  - **#R62 Atlas=OS 大規模拡張**（highlight v2／Web検索／POIマッピング／AI Brief統合／UI刷新／国比較再構築／
    キーボード／ラベル修正／右レイヤーサイドバー）:
    ①**highlight v2** — 色語彙を大幅拡張（エメラルドグリーン・紺・群青…5言語の複合名＋全CSS色名＋hex、`parseColor`正規化）。
    行政区分（奈良県・Stavropol Krai）は**国へフォールバックせず**Nominatim実ポリゴンを `nlq-poly-src` に描画。
    通称地域（Blue Banana・ライン・ルール・グレートプレーンズ等）はガゼッタ（ソフト超楕円）→**AIが輪郭をトレース**した
    近似ポリゴン（⬡=おおよそ表記で正直に明示）。国名短縮（韓国・米国・英国等）の同期解決エイリアス追加。
    ②**ライブWeb検索** — `analyze`/`brief` に **GDELT**（全世界メディア横断・直近72h）と **Wikipedia** 要約をデフォルト組込み
    （「Taiwanのデータ不足」回答の根治）。GDELT/IMFはACAOなし→既存のCORSプロキシ階梯（direct→corsproxy→allorigins）。
    ③**POIマッピング `poi`** — 「○○にある石油施設を表示して」→ Overpassタグマップ（石油/ガス/原子力/風力/太陽光/発電所/
    ダム/空港/港湾/軍事/鉱山/製鉄/工場/病院/大学/…22種・5言語＋名称regexフォールバック）で実在施設をピン＋ラベル＋
    クリックポップアップ表示（`nlq-poi-src`、`clear what:"poi"`）。モナコの病院2件で実証。
    ④**AI Brief統合** — `brief` はAtlasチャット内にインライン描画（GDELT見出し＋周辺ニュースを反映）。地名ポップアップ・
    国カードのAI調査ボタンは `IntMapConsole.brief()` へルーティング（旧パネルはaskHere用に存置）。
    ⑤**UI刷新** — ChatGPT風（グラデーションロゴ・洗練バブル・タイピングドット・フォーカスリング付きコンポーザー）。
    サイドバー第4タブ「Atlas」（グラデーションピル）。**#R112：通常モード（モバイル・デスクトップ両方）では Atlas は
    News/Information/Countries と全く同じ「サイドバーの本物のタブ」**：専用のコンテンツ領域 `#atlas-feed`（`#live-news-feed`
    等の兄弟）にコンソールを**通常フローで**マウントし、タブバー＋ヘッダーは表示したまま、その下に描画（`.atl-tab` CSS＝
    `position:relative;width/height:100%`・ポップアップの枠/影/角丸/ヘッダーを除去）。`#btn-community`→`IntMapOS.exec('tab.atlas')`
    →`setMode('atlas')`、`renderUI()` の `atlas` 分岐が `IntMapConsole.mountTab()` を呼ぶ。全入口（タブ/⌘K/右クリック「ここを
    Atlasに聞く」/国AI Brief）がこのタブに着地。モバイルは他タブと同じ挙動を自動共有し、入力欄が下端にあるためシートは
    **全開**まで持ち上がる。**#R111 の「ポップアップをサイドバーに貼り付けた（`body.atl-in-sheet` オーバーレイ＝
    他要素を visibility:hidden で隠す）」方式は廃止**（`_atlSheetMount`/`_atlInSidebar` 削除）。ワークスペースモードのみ
    従来どおり専用の Atlas ウィンドウを維持（`_atlWs()` で分岐、`open()` はタブにマウントしない）。
    ⑥**国比較の再構築 `IntMapStatsCompare`** — 最大5か国×約22指標（複数選択）、**出典切替 世界銀行⇄IMF WEO**（IMF未収載は
    行ごとに正直表示）、最新値テーブル＋複数国重ね時系列チャート（共有クロスヘア）。入口=国カード/統計タブ/Atlas
    `compareStats`（「日本と韓国を比較して」はlocalPlanで決定的）。モバイルはコンパクトCSS。
    ⑦**キーボード** — ESCで**開閉トグル**、/(検索) L N I S C B 1 2 3 G M R D W T F 0 +− A、`?`で5言語チートシート。
    サイドバーは window−60px まで拡張可。
    ⑧**ラベル** — ポップアップはクリック点でなく**ラベル座標**に固定。海・湾ラベルはタイル由来のズームずれを排し
    **固定ガゼッタ84点（5言語）**の `geo-sea` レイヤーに移行（OFMは湖のみ）。水域・地形・河川・山岳ラベルもクリックで
    ポップアップ（ハイライト無し）。**国名ラベルクリックで国ポリゴンをアウトライン**（countryGeoローカル、PIP）。
    ⑨**右レイヤーサイドバー（設定でオプトイン）** — `#layer-dropdown` を実ノードごと再親化（全ハンドラ生存）、検索
    ボックス＋**全行にプレビュー正方形**（陰影起伏・夜間光・人口密度・鉄道・ケッペンは実タイル、他は決定的グラデ＋アイコン）。
    ⑩ウィジェットCSS刷新。Privacy§4（Overpass POI・世銀/IMF・USGS・GDELT・Wikipedia）とSources（+3件・2件更新）を更新。
  - **#R63 再指摘対応バッチ**:
    ①表記 — 「Atlas」は**太字にしない・前置記号なし**（起動ボタン／パネルタイトル／コンテキストメニュー）。
    ②**下部ティッカー**（設定→下部ティッカー、デフォルトOFF、デスクトップのみ）— 地図の**下**にアプリ全幅の細い帯
    （30px、`.operation-room`を縮小しオーバーレイしない）。右→左へ連続スクロール（hoverで一時停止）: FX
    （fxratesapi→ER-APIフォールバック）・**株価指数**（Yahoo Finance: S&P500/ダウ/ナスダック/日経225/DAX、前日終値
    比の実変化率。Stooqはプロキシ拒否のため不採用）・金銀（gold-api）・BTC/ETH（CoinGecko）・読み込み済みニュース
    見出し（クリックで記事）。5分毎更新。Atlas `ticker` アクション＋「ティッカーをオフに」等のlocalPlan。**（#R102）** ティッカー右端に非表示ボタン／**設定から表示銘柄・項目を選択可**（`IntMapTicker.setConfig`、`intmap_ticker_cfg`に保存）／ワークスペースではオンオフでウィンドウが隙間を自動で埋める。
    ③**曖昧地域の精度** — AIトレース輪郭を**Wikipedia要約で根拠付け**（頂点12-30・アンカー地名の内包自己チェック）し、
    ガゼッタ楕円より**優先**（楕円はAI不可時のフォールバックに降格）。
    ④Atlas初期位置は左縦長のまま**下端64pxを空け、座標常時表示欄を隠さない**。
    ⑤**POI「機能してない」の根治** — 旧実装はミラー直列×長タイムアウトで数分無言だった。ミラーを**並列レース**
    （クライアント側Abort 22s/45s）＋liteリトライ（セレクタ2本・40s）＋**AI既知施設フォールバック**（実在施設のみ・
    概算座標と明記）。localPlan確定パスの実行中バブルにもタイピング表示。
    ⑥**brief乗っ取り禁止** — 「〜を教えて」等の知識質問はSYSで {"type":"answer"}（本文で完全回答、mdMini描画）に固定。
    briefは明示要求時のみ。
    ⑦**国比較UX刷新** — ポップアップ廃止→**サイドバー内ビュー**（statsタブ、戻るボタン）。ソース切替は**指標単位**の
    WB|IMFトグルで、**IMF系列が実在する指標にのみ表示**（二重ソースがあるかのような表記を廃止）。
    ⑧**右レイヤーサイドバーv2** — プレビューは本物の画像: 実タイル13種（GIBS雪/海面水温/AOD/NDVI/クロロフィル/海氷/
    夜間光/GPW/陰影×2/鉄道/ケッペンPNG）＋RainViewer動的レーダー＋**実データから描くミニコロプレスcanvas**
    （人口密度/1人当たりGDP/HDI/出生率/民主主義/国防費）。Active layers等は右サイドバー内でそのまま動作
    （sticky維持・削減なし）。左と同様の**エッジ開閉トグル**（シェブロン）を右端に常設。
    ⑨ウィジェット — 青アクセント・グラデ文字・太字・ヘッダー罫線を全廃し、SF系スタックの
    レギュラーウェイトでiOS風に。⑩湖・山岳ラベル — 主要湖36件をガゼッタ追加（計120水域）、OFM湖はz5.5以降のみ、
    山岳ラベルはサイズ固定（ズーム時の見かけスライドを除去）。Privacy§4・Sources（市場データAPI・Yahoo Finance）更新。
  - **#R64 再々指摘対応バッチ**:
    ①**曖昧地域＝実境界の合成（最重要）** — 「カクカクポリゴン」の根因2つを修正: (a) Nominatim **jsonv2は`class`でなく
    `category`** を返すため POI減点/行政加点が一度も効いていなかった（`_classBonus`修正 → 畿内の実歴史境界が正しく
    最上位に）; (b) `polygon_threshold` 0.02（約2km単純化）→ **0.0008**。さらに解決ラダーを**実境界合成**へ拡張:
    国 → **国グループ**（旧ソ連15か国/EU/NATO/ASEAN/バルト三国/G7/BRICS/中東/**旧ユーゴスラビア諸国**/ラテンアメリカ等、
    ISO3→countryGeoの正確な国境、5言語エイリアス。**#R123: `regionGroup`が末尾の集合接尾辞〔諸国/諸邦/countries/states/
    nations/republics/страны/países…＋形容詞→名詞〕を除去して照合**＝「旧ユーゴスラビア諸国」等がAI自由描画に落ちず国単位で解決）
    → **キュレーション合成**（日本の各地方=都道府県union、ベッサラビア=モルドバ+ブジャク
    3ライオン+ホティン、チェルノーゼム=UA15州+RU15州+MD+KZ4州、肥沃な三日月帯=約48行政単位〔西部クリップ付き〕）→
    Nominatim直接境界 → 方角スライスは**実ポリゴンの矩形クリップ**（Sutherland–Hodgman `_clipGeoRect`）→
    **AIが構成行政単位を列挙**（Wikipedia根拠付け）して同じ実境界合成 → AIトレース輪郭（#R122で40-90頂点・Wiki接地・`_cleanAiRing`検証〔≥8頂点/全球/線/退化却下/面積比〕・退化時リトライ、「近似」明記）→
    ガゼッタ楕円（最終）。境界取得は **1.05秒/件スロットリング**（Nominatim規約）＋失敗は非キャッシュ・1回再試行、
    さらに**geoBoundaries ADM1フォールバック**（Git-LFS実体は media.githubusercontent.com=ACAO:*、shapeName曖昧一致
    ≤2編集距離）。合成領域は1フィーチャのMultiPolygon（`comp:1`で内部境界を薄く）。完成時のみ地域キャッシュ。
    出力は「実際の行政境界から描画」/部分欠落を正直に警告。検証: 東海地方・磯城郡・ベッサラビア・チェルノーゼム
    （Nominatimレート制限下でもgeoBoundaries経由で完全描画）・旧ソ連諸国(15)。反日付変更線集合はfitTo不能→全球表示。
    ②**ラベルずれの根治（ハードコード無し）** — 真因: OFMタイルは**同じ湖・山でもズームごとに別のラベル位置**を持つ
    （湖はLineString型のラベル線!）。`ofm-water`/`ofm-peak` をクライアント側**安定ソース**（`stab-water-src`/
    `stab-peak-src`）に切替え、ハーベスタが実タイルデータから**名前ごとに初出座標へピン留め**（LineStringは中点、
    名前+粗セルで重複排除、SEA_LABELSガゼッタとも重複排除、idleで動的更新、`map.on('idle')`は1回だけ登録=リスナー
    蓄積禁止）。全世界の全湖沼・全山岳が対象。診断: `window._imLabelStats()`。
    ③**ティッカーは真のインフロー帯** — `position:fixed`廃止→`.operation-room`直後の**通常フロー要素**（不透明
    `--bg-color`、30px）。表示倍率やdvh差異でも地図に重なり得ない。
    ④**右レイヤーサイドバー** — 検索・プレビュー・Active layers維持。（バグ修正: `.lsr-thumb`スパンが名前抽出
    querySelectorに先に一致し、右モードでActive layersチップ名が全て空になっていた → 全抽出箇所に `:not(.lsr-thumb)`）
    **※#R160 更新**: かつては `margin-right` で地図を縮めていた（「開くと地図が縮む」→再センタリングで地図が動く）が、
    **右サイドバーは押し出しを撤去**し、`position:absolute`＋`transform` スライドの**純オーバーレイ**へ（地図領域は不動・
    パネルが右端に重なるだけ）。右アンカーHUDは `body.lsr-open` 時に `right:calc(var(--lsr-w)+…)` で左へ退避。既定幅
    `--lsr-w` は 340→**300**。**左サイドバーは機構もアニメも変更しない**（solid=横並びフレックス／frosted=オーバーレイ）。
    「開閉で地図を動かすな／地球が回る」への最終解＝**トグルハンドラはカメラに一切触らない**（`panBy`/`setPadding`/`easeTo`
    /アンカーを呼ばない。`panBy` は既定の globe 投影では**地球を回転**させる）。キャンバス追従は既存の ResizeObserver 任せ
    （`map.resize()` は `getCenter/getBearing` を保つので無回転）。R158/R159 の毎フレーム resize＋アンカー機構は削除。
    ⑤**Active layersは最上部** — sticky **top** の先頭要素（クラシック/右サイドバー/モバイルシート共通）。チップは
    **固定高1行の横スクロール**で、R32の「1pxも動かない」保証は高さ不変で維持（空でも"(0)"で常時表示）。5言語化。
    ⑥**POI全域網羅＋根拠明示** — 地名が実OSM行政リレーションに解決されたら **Overpassエリアクエリ**
    （`area(3600000000+relid)`、timeout 25/60s、`out center 600`）で**全土検索**（旧30°×24°bboxクランプが「一部地域
    だけ」の原因）。応答に**根拠**（OSM登録施設・検索範囲）と600件打ち切り警告を明記。検証: クウェート石油施設597件。
    ⑦**ライブWeb検索の多重化＋レポート品質** — GDELTは**英語トピック**で照会（日本語地名で0件→「取得不可」の原因）、
    **Google News RSS検索**（`_gnewsNews`、UI言語+英語、プロキシラダー）を第2エンジンとしてanalyze/briefに注入。
    ai-proxyに `web:true` → **Anthropicネイティブweb_search**（max_uses:3）を実装し**デプロイ済み** — analyze/briefは
    プロバイダ側リアルタイム検索でも根拠付け。analyzeのSYSを**レポート体裁**へ全面書き換え（ニュース先行・日付明記・
    無関係な気象/地震/統計の羅列禁止=ギリシャ報告の反省、~220語）。
    ⑧**言語ミラーリング** — Atlasは**ユーザーのメッセージの言語**で返答（`_replyLang`: 文字種+ストップワード検出。
    SYS/answer/analyze/briefのプロンプト指示に加え、**決定的応答のL()/lxもミラー**。非対応言語はUI言語へフォール
    バック、ボタン起点briefはUI言語）。検証: en UIで「地図をクリア」→日本語応答、"clear the map"→英語応答。
    ⑨**i18n全面化** — EN/JPのみだった**約190箇所**の2言語ターナリを**5言語**（de/ru/es追加）へ一括変換（凡例・
    ニュースUI・コミュニティ・プロフィール・ツールパネル・トースト・n分前表記・分離ボタン等）。
    ⑩Privacy§4・Sources更新（Google Newsブラウザ直接検索、AIプロバイダ側web検索、geoBoundaries追加）。
  - **#R65 バグ再指摘＋自然地物バッチ**:
    ①**右サイドバー4バグ修正** — (a) `ms-narrow`検索ピル監視がビューポート座標で計算し全幅分岐が `--ms-right:14px`
    →固定配置のピルが開いたサイドバーを横断。**可視の`.map-container`端で計算＋マップ領域へハードクランプ＋
    max-width で退化時は潰れる**、open/close が `intmap-sidebar-resize` を発火。 (b) lsr-mode でも
    `#layer-dropdown` に `overflow-y:auto` が残り sticky の基準になって Active バーが**張り付かなかった**
    → `overflow:visible !important`。 (c) 検索欄が2つ（`.lsr-search`+内蔵 `#layer-search-wrap`）→内蔵側に一本化。
    (d) クラシックでは検索ボックスが Active バーの上に挿入され `margin-top:-12px` が重なる → ensureBox が
    Activeバー直下に挿入＋負マージンは `:first-child` 限定。※「勝手に開閉」は open() をスタック計測しても再現不能
    （Esc=左サイドバー、L=レイヤーパネルのトグルは R62 の仕様）。
    ②**水域・地形ラベル=完全動的**（「ハードコードでやろうとするな」）— ハーベスタが `water_name` の**全クラス**
    （sea/bay/strait/gulf/lagoon＋lake）をピン留め（従来は湖のみ→ガゼッタ外の海・湾はラベル無し＝「数ゲー」）。
    重複排除セルはクラス比例（ocean 30°/sea 12°/bay·strait 2.5°/lake 4°＝カスピ海の重複ピン解消）。新レイヤー
    `ofm-water2`（大水域、z2〜）＋`ofm-water`（湖、z5.5〜）。ガゼッタは主要水域の**多言語オーバーライドのみ**。
    全レイヤーIDリスト（applyLabelLang/STACK/クリック）更新。検証: フィンランド湖水地方で水域18＋山岳222ピン。
    ③**河川=線・流域=支流+薄い面**（「行政区分を使うべきか見極めて」）— highlight 解決の最前段で判定:
    `riverIntent`（〜川/River/Fluss/река/río）→ Nominatim の実河道 LineString（0.0008、Overpass 名前一致
    フォールバック）を `nlq-line-src` に 3.2px 線で描画。`basinIntent`（流域/basin/watershed/Einzugsgebiet/
    бассейн/cuenca）→ `buildBasin`: 本流＋流域輪郭（OSM流域リレーション→無ければ Wikipedia 根拠のAI輪郭・
    「近似」明記）を**薄い面**（per-feature `op:0.14`）＋流域ポリゴン内の**OSM 全河川・運河**を Overpass
    `(poly:…)` で細線描画（本数報告・上限は正直に警告・未ログインは本流のみ＋警告）。`aiRegionUnits` は
    行政区分で表せない地域（流域・山脈・砂漠・帯・海域）に `mode:"outline"` を返して合成をスキップ。
    localPlan アンカー（「Xの流域を表示して」/"show the X basin"）＋SYS 更新。クリア系
    （reset/clearAll/clear highlights/Atlas×）に line 消去を配線。検証: 信濃川=線、利根川の流域=本流＋正直警告。
  - **#R66 再々指摘の根治**:
    ①ティッカー — 高さ計算を全廃し `body.ticker-on` を**flex列**に（shell=flex:1・bar=固定30px行）。dvhや表示
    倍率の丸めで地図に重なる余地が構造的に無い。②右サイドバー — open/close が margin-right を**インライン**で
    確定（カスケード順・トランジション完了に依存しない）＋ adopt/decorate の失敗で open() が中断しない。
    ※ヘッドレスプレビューはCSSトランジションが凍結する（隠しタブ・RAF停止）ため遷移プロパティが終端に到達
    しない — 検証時は transition:none で最終位置を確認すること。③ラベルずれの残存機構 — **ベクトルタイルの
    座標量子化**（低ズームタイル由来のピンは最大約1km偏位し、ズームインで画面上の偏差が拡大）→ ピンを
    **高ズーム観測で精緻化**（山岳はz14まで・水域はz7まで、ズームアウトで退行しない。ロジック単体テスト済み）。
    ④流域の支流 — サーバ上限で飽和したら流域ポリゴンを**自動で四分割クリップして再取得・way idで重複排除**
    （ユーザーに範囲を絞らせる文言は廃止、事実ベースの注記のみ）。
  - **#R66b 右サイドバー「覆いかぶさる」の構造根治**: レイアウトを**分離** — `.map-container` が自分の
    `margin-right:var(--lsr-w)`（open()で**インライン**設定・close()で解除・トランジション付き）で帯を明け渡し、
    `#layer-sidebar-r` は absolute パネル（`translateX(102%)→0`、インライン駆動、visibility/pointer-events 連動）
    として空いた帯に滑り込むだけ。互いのflex/トランジション状態に依存しないため、どんな失敗モードでも
    「地図が覆われる」は構造的に発生しない（最悪は空の帯）。開時に `--lsr-w` を実測計算し**地図に最低320pxを
    確保**（パネル最小280px）。ms-narrowウォッチャーは幅0でも実rectを使用＋使える帯が無ければ `body.ms-hide`
    でピル自体を非表示、CSSの `max-width:calc(...)` で古い変数でもサイドバーを越えられない。
  - ⚠⚠ **#R252 ピルは「動き終わった座標」で置く**: #R160 以降このパネルは地図を**覆う**ので
    `.map-container` は寸法が変わらず、ResizeObserver も `resize` も鳴らない。`open()`/`close()` は
    `intmap-sidebar-resize` を投げるが、HUD 自身の `transition:right .38s` の **t=0 に同期的に**投げるので、
    唯一の再計算がスライド前の `.map-controls-top` を読み、`--ms-left`/`--ms-right` を**去っていく側の状態**に
    固定していた（実測: 閉じた直後も 120 ms 後も `[436,666]`＝開いていたときの座標）。
    `js/mobile-ui.js` は `.map-controls-top` の `transitionend`／`transitioncancel`
    （`propertyName==='right'`）でも再計算する——**測っている物が止まったときに測る**ので、
    スタイルシートの秒数を写したタイマーと違い `prefers-reduced-motion` でも正しい。開始時の同期
    dispatch は残す（アニメーション開始と同時にピルが動くのはそれ）。
  - **#R67 山岳ラベル位置ずれの最終決着（自己修正）**: R64/R66の山岳ピン留めが**ずれの原因そのもの**だった。
    山頂は正確な**ポイントノード**で、タイル量子化誤差は表示ズームのタイルでは常にサブピクセル（誤差と画素サイズが
    同率で縮む）→ **タイル直描画が本質的にドリフトフリー**。ピン留めは低ズームタイルの粗い座標を固定し（山頂から
    外れ、ズームインで偏差が画面上拡大）、R66の「精緻化」はズーム段ごとにピンを動かした（跳ね）。→ `ofm-peak` は
    `source:'ofm', 'source-layer':'mountain_peak'` の直描画へ戻す（固定文字サイズは維持）。**水域はラベル線
    （LineString）がズームごとに実際に形を変える**ためピン留め継続、ただし**純粋な初見固定**（精緻化は削除 —
    ピンの更新自体が見える動きになる。湖名が数百m中心からずれても水面上では不可視）。原則: **ポイント地物=
    タイル直描画／ラベル線地物=初見ピン留め。見えているアンカーを「改善」目的で動かさない。**
  - **#R68 山岳ラベル最終調整**: アンカーは既にピクセル固定（計測済）だったが `text-anchor:'top'` が「▲ 名前」文字列
    全体を点の下に中央寄せし、▲ が山頂から半文字列幅ずれて見えていた → **左アンカー**（▲ グリフが山頂に載る）＋
    無名ノード（裸の▲）を `['has','name']` で除外。原則: ポイントマーカー付きラベルは**マーカーグリフをアンカー**する。
  - **#R69 Stats根治・比較即時化・Wikidata第2ソース・Web検索義務化・Active一覧・水域ラベル密度**:
    ①**Stats「No time-series available」の実測根因** — 比較ビューは変更のたびに全ブロック再描画＋(指標,国)ごとに
    毎回fetchし、計測で**321並列リクエスト（同一指標34本・305本詰まり）**→世銀がIPをスロットル→全部「データなし」。
    修正: キャッシュは**実行中Promise**を保持（同時重複は1リクエスト共有）、**6枠スケジューラ**、20s Abort、
    ネットワーク失敗は負キャッシュしない（再試行可能）。②世銀が**EN.ATM.CO2E.PC を廃止**（0値実測）→ 後継
    `EN.GHG.CO2.PC.CE.AR5` を第一候補・旧コードをフォールバック（比較＋時系列モーダル両方。モーダルにもキャッシュ追加）。
    政府債務は日本等でWB系列が空 → **既定ソースをIMF WEO**に（切替は残置）。③`renderStats` の遅延再描画が開いた直後の
    比較ビューを消していた → `#scp-view` 存在中はrenderStatsが譲る。④**ソース切替・指標切替・国変更が増分描画**
    （ブロック署名で同一内容はスキップ、既存ブロックは表示したまま更新、IMF DataMapperは指標ごと1回で全国分取得）—
    GDP切替は該当ブロックのみ2リクエスト、WBへ戻すのは0リクエスト（検証済）。⑤**POIのWikidata第2ソース**
    （「OSMだけで済ませるな」）— `wikidataPOIs()` がOverpassと**並列**にWDQSへSPARQL（国=ISO3のP298→P17、他=bbox、
    実証済QID約20種）、名称正規化＋約2km近接で重複排除しマージ、返答に**ソース別内訳＋検索範囲**を明示
    （ロシアの製油所=OSM579＋Wikidata追加13、実測592ピン）。Sources・Privacy§4（JP/EN）にWikidata追記。
    ⑥**analyze/briefのWeb検索義務化**（ギリシャ回答の根治）— 旧SYSの「DATAブロックのみ使用」がweb_searchツールの使用を
    禁じていた → 「最近の出来事の質問でブロックに日付付き情報が無ければ**必ずWeb検索**、検索せずに『特筆すべき
    ニュースなし』と答えるのは禁止」。クライアント収集が全滅しても中断せずAIに検索させる。フッターに「AIライブWeb検索」。
    ⑦**Active layers一覧** — 固定高チップ行（R32/R64のゼロ移動保証）はそのまま、ホイール横スクロール＋「一覧」ボタンで
    **絶対配置オーバーレイ**（全レイヤー名・実スライダー連動の透明度・行ジャンプ・✕削除、再構築を跨いで開いたまま）。
    ⑧**水域ラベル密度** — 各ピンに初見タイルズーム `mz`（クラス下限: sea3/gulf4.5/bay·strait·lagoon5.5/湖6.5）を記録し
    `mz<=zoom+0.2` でフィルタ — ズームインで収集したピンが低ズームに溢れない（mzは下がる方向のみ、**位置は不変**）。
    ⑨Atlasチャットの🤖と「AI brief/AI調査」表記を全廃（ユーザーバブル=「調査: 場所」、返答ヘッダ=地名のみ）。
  - **#R70 Stats比較の統合＋右サイドバー全面再構築**:
    ①**比較システムを一本化** — 国名クリックの旧棒グラフ比較ページ（renderCompareView）を `IntMapStatsCompare` に統合。
    国名クリック→選択ドック（上限3→5）→「比較を表示」で統合ビュー。**モード切替: 棒グラフ（既定・ライブデータの
    横棒）｜時系列（重ね折れ線）｜表（Excel風ピボット: 行列転置⇄・列ヘッダクリックでソート・ヘッダのドラッグで
    行/列並べ替え・年セレクタ（各セル=選択年以前の最新値）・CSVエクスポート）**。「国を比較（最大5か国）」ボタンは
    指示により廃止。指標は+6の内蔵参照系（面積/HDI/民主主義指数/GDP PPP×2/軍事費$、実データ年を明示・不明年は非表示）
    で計28。Atlas `compareStats` に `"view":"bar"|"timeseries"|"table"` を追加（「表で比較して」）。
    ②**右レイヤーサイドバー=タイルグリッド（ゼロから再構築）** — #layer-dropdown の再親化を全廃。サイドバーは独自の
    **2列タイルUI**（プレビュー画像・2行レイヤー名・✓アクティブ・★お気に入り=imLayerFavs共有・カテゴリ見出し・
    検索で空セクション非表示・Active layersバーが最上部sticky）。クラシックパネルは非表示のまま唯一の真実源:
    タイルクリック=実チェックボックスをトグル＋changeイベント（全レイヤーエンジン/凡例/Atlas無変更で動作）、
    document変更リスナーで双方向同期。
    ③**IntMapLayerPreviews=全129レイヤーの例画像**（バイナリ同梱なし）: (1)ラスター約35種は各レイヤー自身の実タイル
    （GIBS24種・Esri陰影・ASTER段彩・WorldCover・OpenRailwayMap・OpenSeaMap・RainViewerライブ・ケッペンPNG）、
    (2)countryStatsから実ミニコロプレス、(3)WB系約35種は**各レイヤー自身の指標コード＋自身のカラーランプ**で実コロプレス
    （IntMapWB共有キャッシュ・IntersectionObserverで可視時のみ・同時1本+350ms間隔=R69のスロットル教訓）、
    dl-tfrはWB直（countryStats.tfrはレイヤー初回オン時にのみ充填—実測）、腐敗指標はsource=3&date（mrnev不可）、
    (4)実加盟国フィル（NATO/EU/FSU）・geoLayersDB実座標・実太陽位置の昼夜境界・USGS実地震・著名施設実座標
    （火山34/ダム14/DC/製薬）・海岸線由来EEZハロー、(5)サンプル不能なライブストリーム（航空機/船舶/ウェブカメラ）と
    ECMWF om://場のみ様式化スケッチ。即時94/129が実画像、遅延込み110+。 「今後追加する機能もすべてAtlasで操作可能に」という恒久ルール。汎用 `module` アクション＋
    `moduleCatalog()` が `window.IntMap*`（＋RunwaySearch）の全サブシステムを**自動発見**し名前で `open/toggle/close/clear` 等を
    呼べる（メソッドは許可リストで制限）。これで個別アクションに無いモジュール（Annotations/Presets/Overlays 等）や**将来追加する
    モジュールも配線不要で到達可能**。＝DOM操作は `control`＋`controlCatalog`、レイヤーは `layer`＋`layerCatalogText`、モジュールは
    `module`＋`moduleCatalog` の3経路で全機能を自己網羅。
  - **#R71 比較の高速化・品質バッチ＋タイルサイドバー磨き**:
    ①**最新値は指標ごと1リクエスト**（`country/all&mrnev=1`・全国分一括・Promise共有キャッシュ）— 棒グラフ/表の
    既定表示が6か国×5指標で**約950ms**（旧: 国×指標の個別フェッチ）。時系列表示・年指定時のみ系列取得。
    ②**欠損補完ラダー** — 主ソースに無い国は他ソース（WB⇄IMF）→内蔵参照値（REFV: gdp/gdppc/pop/life/net）で補完
    （°印＋脚注で明示）。主要6か国×既定指標で「—」ゼロを実測。③**バー統一** — 名前/数値列を固定幅化（全トラック
    同長）、増減指標（成長率・経常収支・FDI）は**実0軸**（縦罫＋左右に伸びるバー）、**±を緑/赤**（バー・時系列
    最新値・表すべて）、時系列チャートにも0破線。④**フォーカスビュー** — 各ブロックの「詳細 ›」で1指標全幅
    （ソース切替・バー・240px大チャート・直近24年×国の年次表）。⑤**指標ピッカー整理** — 「指標を選択 (n/28) ⌄」
    トグル内に5カテゴリ（経済/財政・貿易/人口・社会/環境・エネルギー/基礎・参照）でグループ表示。⑥**上限10か国**
    （ピッカー/ドック/Atlas/SYS/パレット10色）。⑦**タイルサイドバー** — 3列グリッド、プレビューは**Webメルカトル
    （±72.5°≒2:1、引き延ばしなし・タイルaspect-ratioとキャンバス一致）×2倍解像度**、タイポグラフィ調整（10.5px
    2行名・大文字見出し＋件数）、サイドバー内のActive layersバーは**チップ帯を非表示**（件数＋一覧＋すべて解除の
    定高1行 —「選択レイヤーが増加すると煩雑」対策）。
  - **#R78f ワークスペース仕上げ**（詳細は DEV-NOTES R78f）: News/Countriesの左右パディング均衡（.content-area
    のmargin-rightハック無効化）、検索バーのはみ出し解消、**News窓を閉じると地図のニュースピン＋要約ボタンが停止**
    （onHide/onShowフック新設）、**Atlas窓を追加**（Windowメニュー・ensureフックでラップ前生成）、座標/標高表示は
    地図窓の左下、ニュースカードを圧縮（133→113px）。
  - **#R78e ワークスペース全項目根治**（詳細は DEV-NOTES R78e）: 重複ヘッダー除去（#sidebar非表示＋ログイン/
    フィードバック/設定を上部の直接ボタンへ）、**地図中心の実測根治**（フロステッド由来のmap.setPadding残存を
    fitMapでゼロ化）、エッジ密着タイル（隙間ゼロ・ティッカー上端まで）、タイトルバー25px、Settings/Feedback/
    Accountは直接ボタン（ドロップダウン廃止）、ブランドは17px非太字、**News/Countries構造分離**（#countries-feed
    新設でrenderStats振替）、ウィンドウ構成をNews/Countries/Information/Community/Map/Layersの6窓へ（mkWin複数要素
    対応）、地図系レイヤー例画像を実CARTOタイルへ置換。
  - **#R78b ワークスペース＝本物のウィンドウ機構**（詳細は DEV-NOTES R78b）: 専用ドラッグ/リサイズに全面刷新 —
    **磁着スナップ**（画面パディング＋全ウィンドウ辺へ8px吸着・ガイド線・整列と密着の両対応）、**共有境界
    スプリッター**（掴んだ辺に隣接するウィンドウを検出し両側同時リサイズ、box-sizing:border-boxでピクセル完全）、
    **ティッカーの第5ウィンドウ化**（follow機構=実ティッカーのon/offに追従、遅延スキャンで後から出現しても自動参加、
    被覆問題解消）、**二重クローム除去**（内容側のshadow/radius/重複ヘッダー停止）、**Mac式トラフィックライト**
    （ホバーで×/−/+グリフ出現）、ドックは右下へ。
  - **#R78 ワークスペースモード**（詳細は DEV-NOTES R78）: 設定「ウィンドウ・ワークスペース」（既定オフ・
    デスクトップ専用）で左パネル/地図/レイヤー/地図コントロールが**自由配置・全辺リサイズ・折りたたみ・最大化
    できる本物のウィンドウ**に（R47ウィンドウマネージャ再利用、macOS風トラフィックライト×iOSガラステーマ）。
    下部ドック（再表示/リセット/終了）、レイアウトはlocalStorage永続化+リロード復元、地図はResizeObserverで追従。
    プレースホルダー方式で無効化時はDOM完全復元（加算的）。Atlas統合: モジュール自動発見+localPlanアンカー+
    stateContext行。
  - **#R77 UI全体×Atlas完全統合（§1・§2・§17・第六段階）**（詳細は DEV-NOTES R77）:
    実測ベース: 538要素中192が無名＝Atlas到達不能 → **命名スイープ**（★/凡例✕/日付入力/スライダー/無名チェック/
    close系/file inputへ実文脈からaria-label付与、20秒毎に再実行=将来UIも自動統合）で **100%（481/481）** に。
    doControlがdate/month入力に対応（「気温レイヤーの日付を2023-06に」が実動作・受理検証つき）。stateContextが
    アクティブタブ・全開パネル（fixedモーダルはgetClientRects判定）・アクティブツール・タイムトラベル・日付レイヤー
    の現在日付（_imLayerDatesブリッジ）・検索内容まで認識。IntMapUIAudit=常設カバレッジ診断。
  - **#R76 Central OS第四段階の着手（§6）＋§3構造化文脈**（詳細は DEV-NOTES R76）:
    ①**events** — 読み込み済みニュースをイベント単位に決定的クラスタリング（位置≤150km×時間≤48h×見出し類似、
    CJKバイグラム、Union-Find）。イベントごとに媒体一覧・時間スパン・「最初の報道→最新」・リンクカード・
    イベント単位ピン。手法開示＋mapReportとの使い分けをSYSに明記。実測: 37記事→33イベント（ホルムズ海峡=
    CNN+CBS 3報道の経過表示）。②**構造化ワーキングコンテキスト** — _wctx（国・トピック・指標・カスタムスコアの
    現行レシピ・期間）を成功アクションから決定的更新し [WORKING CONTEXT] としてAIプロンプトへ注入。
    IntMapConsole.wctx() 診断公開。
  - **#R75 Central OS第五段階（vision §10/§11/§13）**（詳細は DEV-NOTES R75）:
    ①**scoreMap** — 複数指標（同梱12種+任意のWB指標コード）の加重合成で全世界を新規色分けする独自評価レイヤー。
    5–95pctl正規化・log・invert・被覆60%未満除外、算出方法と除外数を完全開示、偽WBコードは捏造せずskip報告、
    stateContext連携で「家賃を重視して」型の会話調整が可能。②**explore** — 対象指標×全指標のSpearman+Pearson
    （対数変換・n明示・最大例外国=反証材料・因果断定禁止）。tfr等の遅延フィールドはWB一括mrnevでオンデマンド補充。
    ③**impact** — 地点or直近地震（USGS自動選定）の半径内の実施設（OSM）+実人口都市（populationタグ）+週間地震+
    ニュース+国統計を円+ピンで地図に描画（東京250km→東海116km/浜岡188km/福島第二214km・人口≈20Mを実測）。
    教訓: Overpassは同一IP並列を拒否（都市クエリは施設レース後に逐次）／空応答は失敗ではない。
    SYS+localPlanアンカー配線、IntMapConsole.dispatch公開（§17診断）、ATLAS-VISION実装表更新。
  - **#R74 プレビュー実データ化・レイヤー状態監査・Atlas誠実化**（詳細は DEV-NOTES R74）:
    ①**タイルプレビュー「一切変化なし」の真の対象=手描きスケッチ約30枚** — R73はGIBSのURLだけ直したが、ユーザーが
    指していた「雑な描画」はPAINT/ECFの手描き（風の波線・ECMWFグラデ・航空機/船の点描・等圧線の楕円）だった →
    **実データ描画に全面置換**: ECMWF全8フィールド＋風2種=Open-Meteo一括96地点グリッド（現況実況を双線形補間で
    フィールド化・実ストリームライン・実等圧線+H/L）、オーロラ=NOAA SWPC OVATION実オーバル、火災=NASA FIRMS WMS
    実検知、航空機=airplanes.live実位置（欧州クロップ）、注目度ヒート=読込済みニュース実座標、海底ケーブル=
    TeleGeography実ジオメトリ（プロキシラダー）、道路=Esri World Transportation実タイル（LA）、EC-SST=GHRSST実タイル、
    タイムゾーン/船舶/ウェブカメラは絵文字スタンプ廃止の精密描画に刷新。全てライブ失敗時は旧スケッチへフォールバック。
    実測: 135タイル中123が実画像（残りはWBレート制限保護の遅延コロプレス）。NDVIの8日合成は期間境界日のみ配信
    （2025-06-26でプローブ済み）。
    ②**IntMapLayerAudit（レイヤーON/OFF×実描画の常時監査）** — チェックボックスと実スタイルレイヤーの照合表
    （dl-*静的表＋**土台ベクタ層BASE表**（cb-names/geolabels/borders/countries/admin1/roads/rail2）＋_registerLayerOpacity
    経由の動的登録）を照合し、「ONなのに未描画」は2回連続検出で再トグル（土台層は冪等ハンドラのため change 1回再発火で
    明滅回避／4分・レイヤー上限）、「OFFなのに可視」は直接hide。**（#R79）トリガを15秒周期だけでなく `idle`（1.2秒
    デバウンス＝全エンジンの styledata 再追加後）＋`visibilitychange` にも拡張**し、不整合が最悪30秒→数秒で自己修復。
    stateContextのアクティブレイヤー行に `[NOT painted]` を付与しAtlasが未描画を「表示中」と言わない。
    **（#R81）カバレッジを登録依存→観測依存へ**（残っていた「たまに」の乖離＝実測で全129CB中監査対象が起動時31件のみ・
    残りは各サブシステムの `_registerLayerOpacity` 登録待ちで未カバー→未登録層はdirection-a自己修復なし）: `window._imLayerOwn`
    で各CBがON時に**スタイルレイヤー差分**から本物のidを学習し同レコンサイラへ供給。学習idは**「ONなのに未描画」の冪等再点火専用**
    （隠す用途には不使用＝誤帰属でも別レイヤー誤消去は構造的に不可能）。安全: ベース層SKIP・first-owner-wins・曖昧窓は帰属スキップ・
    正当に空になり得る層（ships/planes/wind/grid）は学習ヒール除外・ECMWFキャンバス層は自然に対象外。`check()` も学習idにフォールバック。
    ③**返答内コントロールの安定参照** — トグル/スライダーが `data-cb`（実チェックボックスID）を持ち、クリック/
    同期時のあいまいラベル再解決を廃止（凡例非同期・別レイヤー誤操作の根）。ID解決→凡例表示/非表示・実描画まで実測。
    ④**現職ハルシネーションの決定的遮断** — analyzeに **Wikidata P6/P35ライブ照会**ブロック（国名を質問からも抽出、
    ja/enラベル、モデルの記憶より優先と明記）＋localPlanの現職パターン拡張（office語×誰語の短文は全てanalyze(web)へ）
    ＋**時変質問へのanswer-onlyプランはanalyzeへ強制昇格**（TIMEVARガード）。高市早苗/メルツをライブ照会で実測確認。
    ⑤**件数の誠実化** — mapReportが要求件数（count引数 or「10件」等のパース）を認識、不足時は**追い検索1回**で
    補充、なお不足なら「要求N件中、実在確認はM件」を決定的に表示。プロンプトはoverviewでの件数言及を禁止（UIが実数を出す）。
    ⑥**ChatGPT風リンクカード** — `linkCards()`（ファビコン+記事タイトル+ドメインのカード）。mapReportの記事リンク、
    analyzeの `SOURCES:` 行（実在URLのみ・捏造禁止）、answerのMarkdownリンクを描画。**（#R79）脆さの根治**: 収集器
    `_newsData`/`_gdeltNews`/`_gnewsNews` に sink を追加し**供給した実記事の実URL**を収集、analyze/briefは（AIの
    SOURCES行の有無に依らず）その実記事を "Sources" 見出し付きカードで必ず描画（AI引用URLを先頭に並べる）。Privacy/Sources更新
    （airplanes.live・NOAA SWPC追記、OpenSkyの旧記載をairplanes.liveに是正、Esri Transportation・Wikidata現職照会・
    faviconサービスを明記）。
  - **#R73 再発報告の実測根治＋Central OS第一歩**（詳細は DEV-NOTES R73 / ATLAS-VISION.md）:
    ①**geo-sea無音棄却の根治** — text-sizeの `case(interpolate(zoom),…)`（zoom補間が非最外殻）は不正式で、
    addLayerが例外なしに棄却→ガゼッタの海・湖ラベルは一度も存在していなかった（「主要な海や湖が出ない」「東シナ海が
    出ない」の真因）。zoom最外殻の等価式に修正、z2.3(大洋)/z5.2(東シナ海)/z7.2(琵琶湖)のレンダリングを実測確認。
    ②**プレビュー「一切変化なし」の真因** — R72のG()呼び出しがext省略で引数ズレ→GIBS-png系URL全滅404。'png'明示で
    20件修正＋IO遅延を**決定的4並列プリロードキュー**に置換＋open時kick()＋stats()診断＋等高線=OpenTopoMap実タイル。
    ③**?rafshim=1**（開発専用）: 非表示タブでrAF停止→map loadが来ない問題のヘッドレス検証シム。
    ④**流域**: mghydro流域は「点の上流側」— 河口端点は海スナップで退化・分流下流は小流域（信濃川×大河津分水で実測）
    → 両端2/8/18/33/50%+極値端点の≤12候補から**河道包含率最大**を採用。河道無しは地名点から算出。_imBasinDiag診断。
    ⑤**Atlasターンキャンセル**（thinking中の新メッセージで旧ターン中止・遅延結果破棄）、⑥**layer自己検証**
    （スタイル差分スナップショット→最大4.2sポーリング→1回再トグル→正直報告）、⑦**返答内コントロールの双方向同期**、
    ⑧**mapReport=実在事件のみ**（一般論・統計のitem化禁止・英語検索義務）、⑨**現職者質問をlocalPlanで強制的に
    analyze(web)へ**、⑩タブ名 **Countries**（5言語）、⑪Active layers ✕はhoverで文字のみ赤、⑫ATLAS-VISION.md
    新設＋stateContext拡張（ピン/描画/計測/半径/パネル状態）。
  - **#R72 Atlas=マッピング・リサーチエージェント化＋気象フェイルオーバー＋実流域データ＋右サイドバー修正**:
    ①**地点天気の根治** — Open-Meteoの日次クォータ枯渇（429）でパネルが「—」骸骨化していた → 10分キャッシュ＋
    **MET Norway（api.met.no）自動フェイルオーバー**（現況＋5日集約を同形にマップ、出典行に明示）＋両方失敗時は正直な
    エラー文。②**POIピンのポップアップ** — `.plc-popup` 化（旧: ライブラリ既定の白背景×白文字=不可視）、**ホバーで
    名前/種別/要約**、クリックで座標＋**Wikipediaボタン**（OSM wikipedia/wikidataタグ→直リンク、Wikidataはsitelinkを
    SPARQLで併取、無ければREST照会）＋公式サイト。③**mapReport アクション** — 「〇〇を地図上にまとめて/調べて」を
    GDELT+GoogleNews+読込ニュース＋**プロバイダWeb検索**で調査し、**地図上にピン**（各ピン=AI要約＋実記事リンク、
    nlq-poiソース共用の sum/url/src プロパティ）＋チャットに概説と項目リスト（クリック=飛行）。SYSは「地理的footprint
    のある調査はmapReport優先」。④**fly アクション** — 大円slerp＋毎フレームjumpTo（進行方位・ICBMは放物ズーム
    プロファイルでアポジー→再突入、plane/cruiseは水平）、破線軌道＋先端ドット、操作で中断、実飛行時間を正直に注記。
    ⑤**drawLine/drawPolygon**（AI座標or地名列→自由描画）＋**controls アクション**（返答内に実動作するトグル/
    スライダー/ボタン、パネルにデリゲート配線）＋レイヤーON返答へ自動でトグル＋透明度スライダー。⑥**現在事実の
    ハルシネーション禁止** — 時変事実（現職首相等）はanswerで記憶回答禁止→analyze（Web検索必須）へ。⑦**流域=実
    水文データ** — 自己ホストの**GRDC/世銀 Major River Basins**（`data/basins_mrb.json`、236流域、CC-BY-4.0、1.4MB）
    を名前一致＋河道包含で照合 →無ければ **Global Watersheds API（mghydro.com、HydroSHEDS準拠）**で河口からライブ
    流域界（両端試行・大きい方・包含サニティ）→OSMリレーション→AI輪郭は最後（「近似」明記）。返答に流域界の出典。
    ⑧**右サイドバー** — open()は行セット不変なら`syncTiles()`のみ（再構築なし・アイドル時プレビルド）＝体感即時、
    タイルはクリック時にチェックボックスをidで再解決（再構築で参照が死んで「押しても反応しない/不一致」だった）、
    **カテゴリ折りたたみ**（シェブロン見出し・既定は全展開・Others(beta)のみ折りたたみ）、地図クリックで閉じる、
    Active layersの「一覧」=アイコンボタン化・✕は丸ゴースト（モバイル30px）・モバイルは透明度スライダー非表示、
    プレビューは**地域クロップ**（モンスーン降水/湾流SST/日本夜景/アルプス雪/ヒマラヤ段彩/独鉄道/ナイルデルタ土地
    被覆…、`tXY()`＋キャンバス`setView()`クロップ、IMGタイルはIntersectionObserverで遅延）。⑨**水域ラベル** —
    瀬戸/strait・lagoonの mz 下限 5.5→8.5・bay→7.2（近畿全体ズームで瀬戸が出ない）、**geo-sea をSTACKで都市ラベルの
    上へ**（シンボル衝突は上層優先=沿岸都市名が海名を食っていた）＋スタイルスワップで geo-sea が消えたままになる
    無音欠落を**アイドル自己修復**（ensurePlaceLabels+applyLabelLang再適用）＋`symbol-sort-key`。⑩**Stats→「Data」**
    に改名（5言語・Atlas `tab:"data"`）。比較/時系列チャートのホバーツールチップを**チャート内にクランプ＋上端で
    下側フリップ**。⑪ティッカーの📰廃止。⑫**ショートカット導線** — 設定に「⌨ ショートカット一覧」ボタン
    （`window.IntMapKbdHelp`・Atlas `shortcuts` アクション）。⑬Privacy§4（EN/JP）とSourcesに MET Norway・
    Global Watersheds・GRDC/WB流域データを追記。
  - **#R46 スケール対応ズーム＋細かい操作＋誇張防止**: `flyTo`/`search` は対象の**実サイズに合わせてズーム** — Nominatimの
    boundingboxで `fitBounds`（大陸=ズーム3、国=4.6、都市=10.5、ランドマーク=13付近）、または `scale`/`kind` から算出。
    実データで検証済（Africa→3.2 / Japan→3.8 / 渋谷→12.8 / エッフェル塔→13）。新アクション `pitch/tilt`・`pan/move`。
    SYS()に**誇張禁止ルール**（未実行の操作を `answer`/`say` で「完了」と偽らない）＋複雑な複合例を追加。最難の推論精度は
    サーバのAIモデル（既定 `claude-3-5-haiku`）が律速 → `AI_MODEL` シークレットを上位モデルにして再デプロイで改善可。
  - **#R47 ウィンドウUX刷新＋ズーム精度**: 共有ウィンドウマネージャ（`makeDraggable` 隣接、`window.bringToFront`/`addEdgeResize`/
    `registerWindow`）。①**触れたウィンドウ/ポップアップが最前面に**（pointerdownでz-index繰上げ、モーダル未満にクランプ）。
    ②**全エッジ・全コーナーでリサイズ**（9pxの不可視ヒット領域、ネイティブ`resize:both`＝右下のみを置換）— Atlas/Compare。
    ③**最小化を修正**（`min-height:0`＋リサイズ後のインライン高さを退避/復元 → 522px→47pxに収納）。④**移動・リサイズの点/マークを撤去**
    （凡例の`⋮⋮`はdisplay:none＝タイトルでドラッグ可、ネイティブリサイズ角・Compareの角マークも非表示）。ズームは
    `flyTo`/`search` が `bestBbox()` で**健全なNominatim範囲（≤200°）優先**、領土・180°越えで破綻する国（仏/米/露=350〜360°）のみ
    `countryGeo` の**最大陸塊ポリゴン**へフォールバック（仏本土13°/米本土58°）。`fitBounds` を padding48・maxZoom12 に調整。
  - **#R48 リサイズ修正**: パネルの中央寄せ `transform:translateX(-50%)` を消さずに掴むと幅の半分飛んでいた → リサイズ開始時に
    `transform:none` で実位置へ固定＋`box-sizing:border-box`。デスクトップで全エッジのドラッグをシミュレートしピクセル単位で検証。
  - **#R49 ズーム快適化＋曖昧/的確＋低temperature**: `flyToBox()` = `cameraForBounds`（容器の約8.5%パディングで余白）→ `comfortClamp`
    （地名タイプ別に極端だけ抑制、小都市国家=Singaporeを国ズームに落とさない広めの帯）→ `flyTo`。SYS()は「**明確な指示は文字通り厳密に**／
    **本当に曖昧なら無理に推測せず1問だけ確認**」に変更。
  - **#R50 常識的ナビゲーション（AIモデルは変更しない／プロバイダはGemini）**: 「世界/地球/globe/world」等は `WORLD_RE` で**地球全体へズームアウト**
    （地名化しない＝旧バグ「World Bank ビルへ移動」「Earth, Texas」を解消）。**集落・POIは地名タイプ別の固定ズーム `placeZoom` で点中心に移動**
    （市=10.3／町=11.3／地区=12.5／ランドマーク=14.5、bbox フィットしない＝「市役所だけズーム」解消）。大領域 `FIT_KINDS`（大陸/国/地方/島/海）のみ
    実範囲をフィット。Nominatim が領土・180°越えで破綻する国（仏/米/露）は中心＋国ズーム4.6（旧 `_bigBbox` の島/飛地誤選択＝中露の極端ズームインを撤去）。
    SYS()に常識ルール（world語・国/市名はそのまま・Köppen はラスタで単一クラス Cfa は分離不可）を追記。※R49のAnthropic `temperature` 変更は**未使用パス
    （実利用はGemini）につき取消**。利用者の指示によりAIモデル/プロバイダは変更しない。
  - **#R50.5/#R51 ズームは「固定値」を全廃し動的化**: 利用者の指摘（固定値は所変われば破綻）通り、`placeZoom`/`comfortClamp`/`scaleZoom`/`SCALE_Z`/
    `FIT_KINDS`/`bestBbox` 等の**静的テーブルを全削除**。`placeExtent()` が Nominatim の**実ポリゴン**（`polygon_geojson`, `importance` 最大の候補＝
    「China=中国」で China,TX を回避）を取得し、`robustExtent()` が**主要部の範囲**（最大ポリゴン＋自サイズに比例した `reach=1.7×対角` 内の近接島のみ。
    遠隔の海外領土/飛地は除外。180°越えも両座標系で評価）を算出 → `cameraForBounds` で余白付きフィット。地名タイプ別の定数なし＝**実サイズに応じて
    どの場所も適切にズーム**。実データ検証: 中国z3／仏本土z4.9／日本z3.9／露z1.2（180°越え可）／パリ・大阪z11（市域＝市役所だけにならない）。
  - **#R52 レイヤー混同の根絶＋決定論パスで「実行漏れ」防止（モデルは不変＝Gemini）**: ライブ129レイヤーで再現した実バグ（「rain」→"Water & terrain
    labels"＝"ter**rain**"の語中一致／「clouds」「co2」→該当なし＝複数形・下付き₂／「temperature」→ECMWFの方）を `resolveLayer` 全面強化で解消:
    ①**多言語エイリアス表 `LAYER_ALIASES`**（一般語/言い換え→正確なチェックボックスid、EN+JP+DE+RU+ES）を最優先、②**下付き畳み込み**（₂↔2）、
    ③**語境界スコアリング**（whole-word / 語頭 / `\b`句のみ加点。語中の断片一致は不採用＝"rain"≠"terrain"）、④単複変種。AIが出す正式名は98–100で従来通り（無回帰）。
    さらに**決定論インタプリタ `localPlan`** を新設: 明確な単一指示（dark/light/auto・globe/flat/3D・satellite/map・zoom in/out・world・北を上・clear、5言語）は
    **AIを介さず即実行**（`aiGate` より前＝未ログインでも動作・AIクレジット消費なし・沈黙失敗が起き得ない）。ナビ/レイヤートグルは**AI失敗時のレスキュー**に限定
    （複合・文脈・曖昧は引き続きAIが担当）。正直な逐次報告ループは `runActions()` に集約し両経路で共用。**未到達だった機能を一級アクション化**:
    `playground`(world/pandemic/quiz)・`news`(subject/publisher/saved/translate)・`account`・`donate`・`feedback`・`bugReport`。実コードで検証（129行・0エラー、
    未ログインでもfast-path実行）。**ToS/プライバシー/出典の変更なし**（純クライアント処理・外部通信増なし・AI使用はむしろ減）。
  - **#R53 地域ズーム是正＋地名ラベル→ポリゴン＋虚偽報告対策（モデルは不変＝Gemini）**: 実バグの真因はライブNominatimの**ゴミ結果**（「Central Europe」→ミンスクの一地区／
    「Southern Italy」→ヴィチェンツァの軍事事務所／「City Center of Chongqing」→100km離れた観光センター）を最重要度で盲信していたこと。`placeExtent` を強化（**ズーム定数は不使用＝R51継続**）:
    ①多言語**マクロ地域ガゼッタ**（Nominatimにポリゴンが無い地域の実範囲）、②**方角名**（Southern Italy／南イタリア／Süditalien…）は基準国の**実ポリゴンをスライス**。
    ただし「方角+語」は固有名詞のこともある（South Korea／West Virginia／Northern Ireland）ため**フルネームを先に確認**し実在の行政ポリゴン(`adminPoly`)ならそのまま採用、
    ③**「〜の中心部／city centre of X／centro de X」**は都市核を近接表示、④**POI除外フィルタ**（`_classBonus`）。実データ検証済（韓国・西バージニアは分割せず、Southern Italyは南部のみ等）。
    **地名ラベルをクリック→その範囲をポリゴン表示**（要望）: 新モジュール `window.IntMapOutline` が `ofm-country/city/other` ラベルをヒットテスト→Nominatimの境界を**クリック地点最寄りで曖昧解消**取得→
    青い塗り＋枠を `pl-outline-src` に描画＋「⬡ 地名」チップ（×で消去、基盤切替も再描画、計測中は無効）。Atlasの `outline` アクションでも実行（地域はガゼッタ矩形、`clear`で消去、`clearAll`も消去）。
    **虚偽報告対策**: モデルが `answer` のみ（実アクション無し）を返しても `localPlan` に決定論プランがあれば**実アクションを実行**（「実行していない動作を実行したと報告」を抑止）。
    全文EN/JP/DE/RU/ES。**今回はToS/プライバシー/出典を更新**（OSM出典に「地名/地域の範囲ポリゴン」追記、プライバシー第4条にジオコーダ（Nominatim/Open-Meteo/Photon）への地名送信を明記、`LEGAL_DATE`→2026-06-26）。129行・0エラーで検証。
  - **#R54 アウトライン3点修正**: ①**国ラベルのクリックではポリゴンを出さない**（`labelClick` は `ofm-city`/`ofm-other` のみヒットテスト＝国は除外。Atlasの `outline` アクションは明示指定の国に対しては従来通り動作）。
    ②**解像度向上**（`polygon_threshold` 0.006＝区が約9点の粗いポリゴン → **0.0003**＝実際の行政界を100点超でなぞる。`ctx.threshold` で上書き可）。③**×で確実に消去**（R41の基盤再適用ハートビート×`styledata` 再描画の競合が原因。
    `clear()` は `_active`/`_last` を先に落とし（再描画はこのフラグで抑止）、ソースを空にし、`setVis('none')` でレイヤー自体を非表示に。×ハンドラは `stopPropagation`）。スクショ＋5秒ポーリングで検証。データ流通の変更なし＝ToS/出典変更なし。
  - **#R55 ×が本当に消える＋同名地への誤飛び防止**: R54でも残った真因＝**取得中の `show()`**（Nominatim待ち中に×を押すと、後からfetchが解決してポリゴンを再描画）。世代トークン `_seq` を導入し、`show()` は各 `await` 後に
    `myseq!==_seq` なら中断、`clear()`/× は `_seq` を進めて実行中要求を無効化（`busy` では取り消せなかった）。実機検証（未await の show 中に clear→以後再描画なし）。**同名の別地点へ飛ぶ**問題は、最近傍判定の `importance*2` バイアス（遠い有名同名地が勝つ）＋
    近傍に該当ポリゴンが無いと遠い同名地を選んでいたのが原因。**純粋に最近傍**で選び、ラベルクリックは `maxDist:2.2°` を渡して**遠すぎる候補は不採用→null（飛ばさず「範囲なし」表示）**。実機検証（Bostonを英Boston近くでクリック→英Boston / 仏中央でクリック→6.88°で却下）。ToS/出典変更なし。
  - **#R56 ×で確実消去（核オプション）＋チップ全体タップ**: R54/R55のクリア（ソース空＋visibility:none＋in-flightの`_seq`取消）でも現場報告が消えなかった。ヘッドレスでは再現不可（`document.hidden`でスタイル未ロード＋OSMレート制限）かつ外部のスタイル退避/復元も無し（`_reassertBase`はMap/Sat切替時の基盤可視性のみ、2.5s heartbeat `_sweepOrphanLayers`は`dl-`のみ）と確認。そこで×を**決定的**に: `clear()` は `pl-outline-line`/`-fill` レイヤーと `pl-outline-src` ソースを**removeで完全削除**（描画する実体が残らない。次の `show()` が `ensureLayers()` で再生成）。さらに**チップ全体がクリア対象**（小さな✕だけでなくピル全体、`click`+`touchend`、✕は装飾。タップ外しが消えない一因）。`forceBox`（無通信）でレンダラ検証＝描画→タップで消去→8秒/3+ハートビートでも復活せず、再描画サイクルも正常。ToS/出典変更なし。
  - **#R57 リーパー安全網＋実フロー再現**: 実機フロー（実Nominatimポリゴン→チップタップ）を**デスクトップ/モバイル375px/Map↔Sat切替**で再現し、いずれもクリアをスクショ確認（現コードで×失敗は再現不能）。最終保険として `styledata` に**リーパー**追加＝アウトライン非アクティブ(`!_active`)時に `pl-outline` レイヤー/ソースが残っていれば除去（スタイルイベントは頻発するので万一 `clear()` を逃れても次のイベントで消える。除去専用・非アクティブ時のみ）。アクティブなアウトラインは消さないこと（表示中にレイヤートグルしても残存）を検証。残る場合は**古い読込のまま**の可能性大（ディスク上のファイルは修正済）。
  - **#R58 強制再描画＋クリック漏れガード**: 「何回×押しても線が残る」。`labelClick`/`clear`/`show` に計測カウンタを入れ、チップ位置に実ポインタ列を発火→`clear=1, label=0`＝×は `clear()` を1回呼ぶだけで地図クリックには漏れず消える（再描画は再現せず）。2つの堅牢化（計測コードはコミット前に除去）: ①**強制再描画** `map.triggerRepaint()` を `clear()` に追加＝`removeLayer` はスタイルを更新するが描画ループが休止中だと**最後のフレーム（ポリゴン入り）が残像**として残り得る、それを次フレームで確実に消す（「線が見えたまま」の最有力仮説）。②**クリック漏れガード**＝`labelClick` はクリックのDOMターゲットが `.maplibregl-canvas-container` 内でなければ無視（×タップ等のオーバーレイ操作がラベルクリックと誤認され再描画されることを排除）。検証済・129行0エラー。
  - **#R59 真因＝別ポップアップの存在＋Poin‑in‑Polygon＋長方形廃止**: ユーザーのスクショで判明＝地名ラベルクリックで**2つの機能**が発火（既存の地名ポップアップ #R8c〔甲府市＋Copy/Wikipedia/AI brief＋独自の×〕とIntMapOutline〔青ポリゴン＋chip〕）。ポップアップの×は**ポップアップしか閉じず**、青い境界線が残っていた。①**統合**＝IntMapOutlineは**純粋な境界描画API**化（独自chipと独自`map.on('click')`を撤去）。#R8cポップアップがクリックと×を所有：`showPopup`（非国）が `IntMapOutline.show` を呼び、`clearHL`（×／空クリック／別ラベル）が `IntMapOutline.clear` を呼ぶ＝**1ポップアップ・1境界・1×で両方消去**（実機検証：甲府市の実境界→ポップアップ×でactive:false＋地図クリーン）。②**同名誤判定→点‑in‑ポリゴン（固定しきい値なし）**＝クリック点を**内包する**境界を選択（入れ子は最小、glyphズレはbbox内包の最小、何も内包しなければnull＝遠い同名地へ飛ばさない）。検証：甲府市/Boston@英→英Boston/Boston@東京→null/Springfield@Illinois→正。③**長方形を全廃**＝ポリゴンが無ければ**何も描かない**（ポップアップは出る）。Atlas `outline` も `forceBox`/`box` 撤去。129行0エラー。
  **汎用 `control` アクション**: 個別アクションに無い操作も `findControl()` が画面上のあらゆるボタン/チェック/ドロップダウン/
  スライダー/入力（関連 `<label>` も照合、閉じたパネル内も可）に名前/idでマッチしクリック/設定/切替する。AIにはDOM由来の
  **レイヤーカタログ（約129件）＋操作カタログ（約140件、名前+#id）＋モジュールカタログ（約20件）**をシステムプロンプトで渡すため正確に指定可能。
  - **#R44 文脈理解**: 旧実装は現在のメッセージのみをモデルに送信＝**会話履歴も地図状態も無し**だったため追従指示
    （「そこの天気」「それを消して」「今度は1人当たりで」「同じ国の時系列」「もっとズーム」）が解決不能だった。`run()` が送る
    ユーザーメッセージを **`[CURRENT MAP STATE]`（中心/ズーム/方位・ベース/投影・ON中のレイヤー一覧・ハイライト/色分け・
    選択中の国・言語/テーマ/単位）＋`[RECENT CONVERSATION]`（直近の往復を真実に基づき要約=`recordTurn`）＋`[NEW REQUEST]`** に
    再構成（`buildPrompt`/`stateContext`）。指示代名詞・追従はこの文脈で解決し、短い追従は前ターンの**微修正**として扱うよう
    SYS()に明記。`geocode()` は「here/there/そこ/ここ/現在地」等を直前に触れた場所(`_lastPlace`)＝無ければ地図中心に解決。
  - **#R80 残ギャップの実装（Central OS完成へ・§2/§3/§16/§17）**（詳細は DEV-NOTES R80）: ATLAS-VISION実装表の
    「残り」列＝当面最優先を加算的に実装。①**§2 表示中記事**: `openArticleInSidebar`→`window._imReader` へ開いている記事
    （title/publisher/pubDate/place/loc）をブリッジ、`stateContext` に `OPEN NEWS ARTICLE` 行を注入し「この記事/この出来事/
    それ/現地」を解決（`closeArticleReader` でクリア）。②**§3 除外条件記憶**: `_wctx.exclusions` を `recordTurn(q)` の生文から
    `_parseExclusions`（5言語＝except/excluding/außer/excepto/кроме/を除いて/以外…）でパースし [WORKING CONTEXT] の常設条件に。
    "include everything/除外を解除" と reset/clearAll でクリア。③**§16 同名地検証（自己確認）**: `AMBIG` 座標表17件
    （Georgia国/州・Athens・Paris・Cambridge・Naples…）＋`_ambigNote(name,lng,lat)`。flyTo/search/outline が地名解決後、
    解決座標が候補の一つに一致（≤250km）したときだけ「今回は◯◯を表示、他に△△も。別なら『△△』」と正直併記（非曖昧地では黙る）。
    ④**§17 自己診断**: `IntMapDataHealth`＝news鮮度（`globalData`最新pubDate経過h）＋layer描画整合（`IntMapLayerAudit`）＋
    ライブAPI到達性（USGS/Open-Meteo直・GDELTはプロキシ梯子・**8s上限**・既出EPのみ）。`diagnose`/`health`/`selfCheck`/`status`
    アクション（🟢/🔴、429は「rate-limited(429)」）、localPlanアンカー（"診断"/"何か問題ある？"/"any issues?"）、
    **問題時のみ** `stateContext` へ SELF-DIAGNOSIS ALERT、SYS()にアクション登録、**可視時のみ25s後＋10分毎の軽量プローブ**
    （背面タブ/ヘッドレスでは走らない）。新規外部EPなし＝法務/出典変更不要（LEGAL_DATE 2026-07-12 据置）。
  - **#R82 Atlasカーネル化 `IntMapOS`（構造インバートの起点・第六段階の土台）**（詳細は DEV-NOTES R82）: 「根底にAtlas、全UIは表層」
    をコードとして開始。`window.IntMapOS`＝`register`/`exec`（登録コマンド＝インバート済み正準経路）/`dispatch`（Atlasの型付き
    アクション層）/`on`+`emit`（バス）/`log`（**UI・NL統合syscallログ**・source=ui/atlas/api）/`state`・`catalog`（Atlas束縛）。
    GUIとNLチャットは**同一カーネルへインテントを投げる薄い2シェル**に。**中核を実インバート**: 地図ビュー
    （`view.base.map`/`.sat`/`view.proj.globe`/`.flat`）+タブ（`tab.news`/`.info`/`.stats`/`.community`）の実ロジックをカーネル
    コマンドへ移設し、`onclick=()=>IntMapOS.exec(cmd)`＋Atlas dispatchは `kexec`（コマンド直呼び＋clickIdフォールバック）に
    →**UIクリックもNL指示も同一コマンドに収束**（clickId模倣を排除）。`_setDispatch/_bindState/_bindCatalog` で
    Atlasを束縛＝`IntMapOS.dispatch({type:'control'…})` で全UIをカーネル経由操作可、`catalog()` が全操作面を列挙。
    実測: 実ボタンclick→exec 1回（二重実行なし）、NL dispatch→`view.base.map/atlas`、theme/layerもカーネル経由、
    `.click()`互換維持、コンソールエラー0。残コントロールは以降のパスで順次コマンド化（段階移行）。
  - **#R83 バッチ: ワークスペース自動タイル・Atlas経路/SV/各種シミュ・比較着色・プレビュー・自動ON整理**（詳細は DEV-NOTES R83）:
    ①**Countries(info)自動ONを廃止**（Countriesタブ/窓は cb-countries を自動トグルしない＝完全手動）。②**ワークスペース既定を
    Map+Layersのみ**に（countries/atlas=defHidden、storage KEY→ws3）。③**自動タイル＋ジャンクション**: `computeTiles/retile` で
    可視窓を隙間なく自動配置（開閉/最大最小/リサイズで再タイル）、3枚以上が接するT/十字点に `buildJunctions/addJunction` の
    ドラッグハンドル＝縦横の仕切りを同時移動（「三つ同時に境界」）。④**Ask AI about here を Atlas に吸収**（`IntMapConsole.askHere`＋
    `_herePoint`＋buildPromptの`[PINNED POINT]`、右クリック/ dispatch）。⑤**Compareの色を地図に**（`IntMapStatsCompare.paintOnMap`＝
    PAL[i]でチップと厳密一致のカテゴリfill、Show comparison時／選択変更で同期、`_clearCompare`で消去）。⑥**Atlas経路案内**
    （`IntMapRouting`＝公開OSRMで車/徒歩/自転車のターンバイターン、dispatch `directions`。`route`は海路のまま）。⑦**ストリートビュー**
    （`IntMapStreetView`＝キー不要の maps.google.com svembed 埋め込みパネル、右クリック/ dispatch `streetview`。(#R146) クリック/ドラッグ/前後移動は Google `GeoPhotoService.SingleImageSearch`（JSONP＝CORS不要・プロキシ不要・Private Relay免疫）で**実在の最寄パノラマ座標＋歩行可能な隣接パノラマ**へスナップ。CSP `script-src` に `maps.googleapis.com` 追加。カバレッジ水色オーバーレイと svv 画素/`sv-cov` フォールバックは温存）。⑧**海抜以下ハイライト**
    （`elevationBelow`＝Copernicus DEMグリッド標本→閾値以下/以上を深度段階fill）＋**歴史勢力図**（`historicalMap`＝curated WWI1916＋他年代AI生成）。
    ⑨**弾道ミサイルSim刷新**（`missile`＝最小エネルギーのケプラー軌道: 実アポジー/速度/飛翔時間＋高度断面SVG＋任意の弾頭効果環。
    検証: 1万km→1319km/7.2km・s/32分）。⑩**放射性物質拡散Sim**（`radiation`＝ラグランジュ粒子: Open-Meteoの時空間風で移流＋安定度依存の
    乱流拡散＋湿性/乾性沈着＋半減期、粒子＋濃度ヒートマップ）。⑪**フライトシミュレーター**（`IntMapFlightSim`＝R94qで**真の固定周期6自由度剛体エンジン**に刷新: 機体座標系で機体速度(u,v,w)・
    角速度(p,q,r)・**クォータニオン姿勢**を積分し、迎角+**横滑り**から安定微係数(Clb/Clp/Cma/Cmq/Cnb/Cnr…+Clda/Cmde/Cndr)で
    力とモーメントを算出＝協調/横滑り旋回・アドバースヨー・上反角・慣性交差結合・プロペラジャイロ効果、**連続ロール/宙返り/背面飛行**
    （クォータニオンなのでジンバル固定なし）。**固定1/200秒**サブステップ（描画と分離＝フレームレート非依存、`_dbg.step`で決定的検証）。
    **カメラ（#R95で真の視点点へ刷新）**: `calculateCameraOptionsFromCameraLngLatAltRotation`（MapLibre v5に実在。`for…in`は非列挙の継承メソッドを見落とすため過去に「無い」と誤認していた）で
    **視点を機体そのものに置き**、方位/ピッチ/ロールを機体軸から直接算出。`setMaxPitch(179)`+`setCenterClampedToGround(false)`で**宙返り/急上昇/背面でも垂直を越えて機首を追い**（ピッチ0.5–179°実測）、
    ロールはジンバル反転しない幾何バンク（0–180°）。開始方位=地図の方位（`||90`の0°誤判定を修正）、
    **#R158 視点瞬間移動の根本修正**: 毎フレームの `calculateCameraOptionsFromCameraLngLatAltRotation` は中心を `transform.calculateCenterFromCameraLngLatAlt`（視線を地面へ射影）で求めるが**水平付近で射影距離が発散→MapLibreが固定距離へ切替**し、未平滑化pitchが境界を往復すると center/zoom が1フレーム跳ねて視点が飛んだ。→ 機首方向**一定距離1.8km先のターゲット**を `calculateCameraOptionsFromTo(eye→target)` へ（返り値 center=target・zoom=f(距離)＝**固定距離なら全姿勢で安定**・地面射影もクランプもなし・見上げは pitch>90＋maxPitch179で維持）、rollは別途適用、**pitchに指数ローパス(τ55ms)**でスパイク除去、四元数/機首ベクトル正規化＋全カメラ値の NaN/Inf/異常Δ 検証で異常フレームskip、**カメラ高度を機体高度から分離**（平滑化地形+2.5mフロアで地中侵入防止）、`start()` で `map.stop()`＝唯一のカメラ制御元、`maplibre-gl@5.24.0` にピン留め。
    フォーカス喪失(blur/visibility/pointercancel)でキー固着を解除、背面/負迎角失速も警告、脚上げ接地=胴体着陸で墜落、機体速度は同一旧状態から一括更新＋−ω×vをノルム保存回転にして**宙返りのエネルギー暴走(→マッハ15)を解消**、飛行中は重い move系ハンドラ（オクルージョン/比較同期/経緯線）を停止。
    地形は`_terrRead`でDEM未読込を判定し、開始/リセットは初回の確実な地形読取まで待って安全高度へ整定（0m誤判定の幻の山/「読込即墜落」を解消）。
    **#R96で空力を全迎角対応に刷新＋F-35追加**: 失速を境に**平板モデルへ平滑ブレンド**＝CLが正負両側で連続（負迎角失速の跳びを解消）、90°付近で抗力がCDmaxへ（深失速/テールスライドが減速）、失速後は昇降舵/ピッチ剛性が減衰。
    昇降舵は機種別**最大舵角elevMax(rad)**（生スティック=57°相当を是正）・機種別アクチュエータ速度ctlRate・機種別レート上限omMax（旧一律±14≈800°/s）、**FBW**(旅客機/戦闘機/F-35)は迎角を0.3秒先読みしてG限界/失速手前で舵をフェード＝**G制限を強制**（従来は警告のみ）で高速ピッチ過敏も解消、非FBWは1.5G超（設計終極荷重）で**構造破壊**。
    プロペラ後流が尾翼を駆動・推力線/フラップのピッチモーメント・上昇限度で推力減・**遷音速造波抵抗**（低速式でマッハ1.7飛行を解消、有界で超音速可M1.3+）・地上ギア幾何/ノーズギア/テールストライク。
    **カメラ#R96**: 垂直越えの180°反転（bearing/roll特異点）をレート制限（900°/s、通常操舵は無影響で瞬間pop のみ平滑化）で解消、**追従カメラ廃止＝コックピット固定**、HUDの姿勢計/ロール指針/ピッチラダーは連続バンク(`_camRoll`)で回転（Euler反転しない）、**track-upミニ地図**（第2MapLibre地図、Esri衛星再利用＝新規出典なし）。R95のノルム保存6-DOF積分は維持（左右対称ロール・宙返りエネルギー暴走なし）。機体差**6種**（セスナ172は実C172係数、他はスケール、F-35は実スペック⚡）。
    **#R117 離着陸の根本修正+操縦系**: 接地判定は**接地の瞬間のみ**（滑走中の速度チェックが1.7×Vstall超で滑走路上「墜落」を出していた＝100%墜落の主因）、物理地面はDEMタイル精細化ジャンプを吸収する**レート制限フォロワー**（`_terrF`）、地上スポーンは空港標高±150mの妥当性ゲート（半ロードDEMの−1439m対策）、構造破壊は0.30秒持続で発動、FBW負側AoAクランプ=aStallNeg、**FBWピッチレートダンパー**（F-35高度振動解消・無操作20秒±6m実測）、墜落理由+接地品質(Butter〜Hard)+滑走路整合判定(方位±20°/横偏差150m)を結果画面に表示。主速度計=EAS基準（TAS/Machは補助行）、旋回計=実旋回率、スロットル/ブースト計は全計器盤共通、警告バナー/デッキ/ミニマップの重なり解消。**モバイル: アナログ仮想スティック+ドラッグ式スロットル+ラダーボタン**（44px+/safe-area対応）。**飛行中は地図地物が完全表示専用**（windowキャプチャでcanvas向けpointer/clickを遮断＝ハンドラ不発火、終了時に完全復元）。
    **#R119 実滑走路・ライブ風・PAPI**: セットアップSTARTがOurAirports滑走路（両端座標）を取得し**最長滑走路の実スレッショルドに実方位でスポーン**（8秒予算・失敗時は従来スポーン）。着陸は実滑走路ラインへの**コリドー判定**（センターライン±75m・スレッショルド間・軸±25°→「滑走路{ident}に着陸」）。**PAPI 4灯**（3°パス比、接近時のみ、全計器盤共通）。**ライブ風**（Open-Meteo winds aloft を高度補間）が**AIR相対速度の空力**として物理に流入（位置積分は地上速度、地表60m境界層フェード、タキシー/タイヤ判定は地上速度基準）。HUD補助行に実効風を表示。
    **#R118 実条件の残り2根本原因+モバイル完成**: ①**整定タイムアウト**＝DEMが不当値(0m等)を返し続けても4秒で既知の空港標高を地面に採用して飛行可能（旧: 永久整定待ちでスロットルだけ効き離陸不能）。②**空港アンカー**＝スポーン空港4km圏では物理地面をfieldElev−3で下限クランプ（沿岸terrariumタイルの海底水深で滑走路が−13mに沈み機体が海面下に潜る現象を根絶）。③ミニマップに**飛行軌跡**（st._path黄線）。④モバイルUI再設計＝縦390×844・横844×390で全5計器盤の**矩形衝突テスト全ゼロ**を実測（計器=上帯・操縦=下帯・横画面は専用配置）。
    **#R120 燃料・ILS・ゲームパッド**: ①**燃料システム**＝実搭載量（C172 144kg/P-51 730kg/A320 18,700kg/F-16 3,200kg/F-35A 8,280kg、グライダーは無し）、プロペラ=出力比例burnMax・ジェット=推力×TSFC（AB時は湿レート）で毎ステップ消費、**タンク空=フレームアウト**（推力0・AB解除、他の空力不変）＋HUD補助行「FUEL n%」＋「FUEL OUT」警告（Rリセットで再給油）。②**ILS誘導表示**＝スポーン滑走路のスレッショルド→反対端軸をコース、3°パスをGSとし、LOC±2.5°/GS±0.7°フルスケールの**fly-toニードル2本**（十字ボックス+「ILS 34R 6.5km」ラベル、接近時0.25〜25kmのみ、全計器盤共通`_updIls`、針の向きは右偏位→左バー/低高度→上バーを実測検証、モバイル矩形衝突0）。③**ゲームパッド**＝標準マッピング（左スティック=ピッチ/ロール アナログ・軸2/LB/RB=ラダー・RT/LT=スロットル・A=ブレーキ・B=AB・X=フラップ・Y=脚・Back=視点水平・Start=ポーズ）、physics()毎フレームポーリング、デッドゾーン0.12、パッド未接続時は完全no-op（キーボード/タッチと共存）。
    UI+キー(F/G/Space/V/M/P/R・1-6)+ゲームパッド、dispatch `flightSim`。**未実装（別フェーズ）**: 専用3D描画・3D機体モデル・ミッション/チャレンジ・
    詳細機体システム(FADEC/油圧/電気/レーダー等)・ATC/AI機・音響・故障・書籍値との定量検証＝描画は当面MapLibre（専用3Dシーンは別フェーズ。視点点カメラ・全迎角空力・FBW/G制限は実装済み）。⑫**レイヤープレビュー**: `setView` を
    **アスペクト補正**（クロップ枠を真の2:1 web-mercatorに拡張＝EU members・Volcanoesの横伸び解消）、ECMWF雲=実MODISトゥルーカラー、
    Live aircraft=実空港間の大圏ルート網。出典/プライバシーに OSRM・Google Street View を追加。新規 window.*: IntMapRouting/
    IntMapStreetView/IntMapRadiation/IntMapFlightSim。全モジュール存在・コンソールエラー0・129レイヤ行を実測確認。
  - **#R84 バッチ2: 追随修正＆磨き込み**（詳細は DEV-NOTES R84）: ①**ワークスペース列リサイズ**＝仕切りDIVIDERモデルで同一
    ラインの両側の全ウィンドウ（同列仲間も）が追従。既定を Countries|Map|Layers/Atlas に復元（ロールベースtiling、KEY→ws4）。
    ②右クリックの Atlas console ボタン削除。③**放射拡散が「使えない」根治**＝run()を非同期化（即レポート＋背景アニメ、パン/ズームで
    消えない）。④**ICBM立体軌道**＝`IntMapArc3D`（スクリーン空間で地上トラックを実高度ぶん持ち上げた高度着色アーク）。⑤**SVカバレッジ**
    ＝ベースマップの道路を水色化してクリックでSV（`IntMapStreetView.coverage`）。⑥**Atlasマップ物のon/offトグル**を返答に付与＋**選択形式の
    質問** `ask`（選択肢チップ＋自由入力）。⑦ソースリンク404＝本文にURLを出させずSYSで出典名のみに。⑧**Compare表示修正**（時系列年号を
    HTML化して潰れ解消・狭窓で棒の列幅縮小）。⑨**8プレビューを実IntMap風に**＝`_bmShot`（実CARTOベースマップ2タイル＋実レイヤーの合成、
    真の2:1）。⑩**リッチ経路UI** `IntMapRouting.openPanel`（出発/目的地編集・モード切替・入替・地図クリック選択・ライブ再計算）。
    ⑪**フライトSimをゲーム級**（ヘディングテープ・バンクする自機・スカイティント・アフターバーナー）。⑫**DE/RU/ES完全化**（RU/ES各64キー
    欠落を全翻訳、5言語全キー網羅）。⑬Wind色場のソース再生成フォールバック＋監査SKIPに新オーバーレイ層追加。新規 window.*: IntMapArc3D。
    実測: コンソールエラー0・全モジュール存在・i18n欠落0・CARTO/GIBSタイルのCORS非汚染合成を確認。
  - **#R85 バッチ3: 「ハリボテ禁止」で作り直し**（詳細は DEV-NOTES R85）: ①**レイヤーON/OFF競合の根治**＝自己修復のoff→onパルス2段目が
    ユーザーのOFFを打ち消していた→`cb.__userChangeT`/`cb.__syn`で「ユーザー操作は絶対に打ち消さない」ガード（追加のみ・余計にONにしない）。
    ②**Wind色場が塗られない根治**＝`renderFieldImage`は毎回イメージソースを**再生成**（`updateImage`は塗らないビルドがある）＋style待ちの
    リトライを16s化＋idle/styledataで生成。③**ws凡例を地図左下へ**（`tileLegends`の`(0||440)`バグ修正、ws時は左下スタック）。④**要約ボタンを
    News窓非表示時に隠す**（`_wsNewsHidden`）。⑤**Atlasでワークスペース切替**＝`{type:"workspace"}`＋NL。⑥**「現在地」＝端末GPS**
    （`SELFLOC_RE`＋`_selfLoc()`、DEIXISから分離）。⑦**メッセージ内トグルを拡充**（fly/los/isolate/pin/streetview、配列マップ対応）。
    ⑧**でたらめ出典リンクを廃止**（analyzeはsrcSink実記事のみ描画、モデル生成URLは404なので不採用）。⑨**Street Viewに地図マーカー＋向きコーン**
    （`sv-here-*`、即時表示）＋カバレッジ軽量化（source-layerごと1本）。⑩**ICBMを実スケール3D＋物理**（Arc3Dはpx/kmで実高度持ち上げ→ズーム不変、
    `ballisticSolve(range,loft)`で最小エネ/ロフテッド/ディプレスト、Allen–Eggers空気抵抗の着弾速度、コリオリ地上軌跡、MaRV、軌道ボタン）。
    ⑪**フライトSimを実3-DOF**（揚力/抗力/推力/重力・迎角・失速ブレイク・荷重G・地形着陸/墜落判定・`setRoll`でバンク視点）。⑫**放射拡散を拡充**
    （放出量Bq/放出時間/核種半減期/日時（過去はERA5アーカイブ）を選択、**最終沈着マップ**＝実チェルノブイリCs-137ゾーン分類＋線量µSv/h・mSv/年）。
    ⑬**リッチ経路＋実公共交通**＝`transit`モードは**Transitous/MOTIS**（世界GTFS）で徒歩/鉄道/地下鉄/バス/フェリーを型付きレグ＋実ジオメトリで取得、
    徒歩＝点線・乗車＝モード別色で地図描画（「電車と言ったのに道路」を根治、被覆外は正直に不可）。新規外部: Transitous/MOTIS・Open-Meteo ERA5アーカイブ
    （出典/プライバシー更新済み）。新規 window.*: `IntMapRadiation.ISOTOPES/SOURCES/ZONES`。実測: コンソールエラー0・弾道/経路/フライト物理を数値確認。
  ウィンドウは**最小化・サイズ変更可**、×で地図上のハイライト/色分けも消去。起動: ツールバー `⌖` / 右クリック / **Ctrl・⌘+K**。
  - **#R85e/#R85f 都市間鉄道ルータ（Transitous被覆外の実路線ルート）**: Transitous/MOTIS が0件（JR/新幹線は非公開GTFS）の時、`railRoute()` が
    **実OSM鉄道網**（Overpass `out body`＝路線名`name`/`ref`/`usage`/`highspeed`＋`node[railway~station|halt]`駅名）を取得しDijkstra。①路線種別
    （`hs`新幹線/`main`/`reg`/`lr`/`ng`）で分類し**実路線名の区間レグ**に畳み込み、実駅を board/乗換/alight にスナップ、所要時間は種別別速度
    （hs≈200・main≈88・reg≈64 km/h）。②都市間（gc>50km）は**単一高速線が両端の近くを通れば端から端まで新幹線**（その路線だけの部分グラフ＋自己80m溶接）で走り、
    新幹線駅が目的地と数km離れる所は**在来線コネクタを接続**（新大阪→大阪＝大阪環状線）。コネクタは「乗車＜徒歩」の時のみ採用（gazetteer座標が駅から数kmずれても
    多km徒歩に化けない）。③駅名は近接優先だが**同一場所の私鉄同名駅より素のJR/本線名を優先**（名古屋＞近鉄名古屋）。結果: `名古屋→大阪`＝🚄東海道新幹線・約54分・乗換0。
    「実在の鉄道網に沿った概算（公開時刻表なし）」を明記。バグ根治: 都市間コリドーの北への膨らみ（米原経由）を切り落とすとグラフが分断→bbox緩衝を拡張（上限0.32据置）。
    ※#R122でrailRouteは**無効化**（貨物線・非旅客線を旅客経路として返すため）。#R125で置き換え: **都市間日本レール・ブリッジ**（下記）。
  - **#R125 都市間日本レール・ブリッジ（`_jrPlan`）**: Transitousが0件の時（東京圏はODPT系の公開GTFSで動くが、名古屋圏・新幹線は非公開）、
    日本国内・大圏70km以上なら**新幹線レジストリ**（東海道・山陽/東北/上越/北陸/九州/北海道、実在駅＋座標＋公表時刻表由来の速達パターン区間分数＋運行頻度`head`）を
    Dijkstra（同名駅の路線間乗換=15分）で経路化。アクセス/イグレスは**Transitousが被覆していれば実GTFSレグ**（`_planItins`のquickモード）、
    無ければ「ローカル区間（公開時刻表なし・目安）」と明記した距離ベース概算レグ。所要は頻度ベース（乗車毎にhead/2待ち加算・`~`接頭）で、
    **架空の時刻は一切表示しない**。都市間線は実在停車駅を通る折れ線（駅間線形は概略と5言語ノートに明記）。駅名端点は`stationLL`で実駅座標に解決
    （geocodeが仙台駅→「仙太鮨」を返すファジー事故を根治、〜駅クエリはヒット名に基名を含まない場合ベース名で再ジオコード）。
    実測: 瑞穂区役所→新宿=ローカル目安24分+名古屋→東京新幹線100分+**実JR中央線(JC)レグ**+徒歩=~2h32m、大阪駅→仙台駅=新大阪→東京→仙台 ~5h04m、
    新宿→東京駅はライブ5候補のまま、Munich→Augsburgのライブ欧州transitも不変。
  - **#R126 経路10-10指示書コア（RouteStore/リクエスト生存管理/正直なエラー分類）**: ①**RouteStore**＝候補と選択状態は`routeSetId`
    （計算1回=1セット、LRU12）で管理し、旧`_tAlts/_ends`共有グローバルを廃止。Atlasのトリップカードは`data-rset`、モードボタン行は
    `data-rctx`（そのメッセージ自身のfrom/to/via）を持ち、**過去メッセージの操作はそのメッセージの経路にだけ作用**（指示書16.2-16.4/24.3）。
    ②**requestId+AbortControllerプール**: 新しい`route()`は前リクエストの全fetchを中止、遅れて完了した古い応答は`status:'cancelled'`で**描画せず**
    （24.12）。③**計算/描画分離**: `_paint`が特徴量+1回限りのfitをスタッシュし styledata で再描画（スタイル未読込でも計算は成功、復元は
    source._data非依存の自前ストア、24.2/3.7）。④**エラー型**: success/invalid_request/no_route/no_transit/provider_timeout/provider_unavailable/
    rate_limited/cancelled をパネルとAtlasで**別文言**（5言語）表示（2.5/5.7）。⑤**破損transit形状の直線代替を廃止**（乗車レグは形状なし表示+
    shapeGapノート、徒歩レグのみ短い点線コネクタ可、3.8/22.3/24.4）。⑥死んだrailRoute/_renderRail（R122無効化済・144行）を削除（3.9/24.5）。
    ⑦**経路経由のcorsproxy.io/allorigins全廃**（OSRM/TransitousはCORS対応、直fetch+バックオフ再試行、3.2/24.1）。⑧**偽経路ガード**: OSRMデモは
    データ外の地点を**5,500km先の道路にスナップして"Ok"を返す**（実測: Lisbon→NY がポルトガルCascaisへスナップ→41kmの"経路"）→waypoint snap>30kmは
    no_route+スナップ距離表示（2.2/21.3）。⑨パネル: 入力編集で選択済み地点を即無効化（3.12/24.7）・日付変更線対応fitBounds（3.19）・
    **出発/到着時刻UI**（今すぐ/出発時刻/到着時刻+datetime-local、transitへarriveBy送信、道路は「時刻指定は公共交通で有効」と正直表示、24.8）・
    地図クリック地点の逆ジオコーディング（6.6）。⑩**同名地名の近接優先**（6.3）: geo1/_geoEPが最大5候補から現在ビュー近傍（≤300km最近）→人口最大の
    順で選択、Atlasはビューから>500kmのヒットを1/3距離未満の同名候補で置換（Potsdam: ベルリンビュー→独、NYビュー→米を実測）。
  - **#R132 経路10-10 製品品質の中核（R126基盤の上に）**: ①**道路ALTERNATIVES**（OSRM `alternatives=3`）を transit と同じ RouteStore に格納し、
    差別化ラベル（最速/最短距離/+N分/回避付き）＋候補カード（パネル・Atlas 双方タップで再描画・再同期）。`_roadDedup` は**幾何重複>0.92 かつ 所要差<3%**の時だけ畳む
    （§3.3/7.1/10）。②**リッチ・ターンバイターン** `IntMapRouting.maneuver(step)`＝OSRM 全 maneuver 語彙（merge/ramp/fork/end-of-road/roundabout+出口番号/U-turn/到着側）
    ＋道路ref＋方面＋出口番号＋**車線案内(▮/▯)** を5言語自然文へ（§12）。③**手順→地図** `selectStep`＝タップで区間を黄ハイライト＋fly（自前`_lastPaint`使用）。
    ④**回避 toll/highway/ferry**（§7.3/§4.7）＝公開OSRMデモは `exclude=` を拒否するため**Valhalla /route（keyless）へ振替**（`use_tolls/use_highways/use_ferry`、
    maneuver type を `_maneuver` 疑似ステップへ写像、polyline precision 6）。失敗時 OSRM(回避なし)へフォールバック＋`avoidDropped` 正直表示。実測: 高速回避で 169km/109分→218km/252分の一般道。
    ⑤**公共交通の実時刻/時刻表 区別**（§2.4/9.6）＝MOTIS の `realTime`/`scheduledStartTime` からレグに `rt`/`delay` 付与、`realtime` 時だけ「リアルタイム含む」・他は「時刻表ベース」と明示、
    レグに定刻/+N分遅れバッジ（静的をライブと偽装しない）。⑥**経路エクスポート GPX/GeoJSON**（§15.7）＝選択中経路をローカルDL（`exportRoute`/`_routeExport`/`hasRoute`、位置の外部送信なし）。
    残段階（自社バックエンドGateway/Provider Matrix/GTFS-RT/リアルタイム交通/実走行ナビ/オフライン/監視）はサーバ基盤要のため段階継続。
  - **#R94 タイムマシン＝時空カーネル `window.IntMapTime`（形骸化していた時刻スライダーを IntMap 全体の時空OSに）**（詳細は DEV-NOTES R94）:
    従来のタイムスライダーはニュース＋一部の日付ラスタしか動かさず**形骸化**していた。これを**唯一の時刻ソース**（`_when`＝Date、null=ライブ/現在）に格上げし、
    スライダー・日付入力・**深時間の年入力（1900→現在）**・Earth Replay・Atlas はすべて**この1カーネルへ書き込み**、時刻依存の全サブシステムは
    `IntMapTime.on(e)` で**購読**して選んだ瞬間へ自己再構成する。`set/setYear/setDaysAgo/setNow/on/year/isLive`。`newsDate` は近接アーカイブ facet として
    ロックステップ維持（既存のニュース/ラスタ読取は無改変）。**購読側**: ①ニュース＋日付ラスタ（`applyGlobalDate`＋temp/no2/co/fire/truecolor/viirs を集約、各層は1購読者のみが更新）、
    ②**Countries（目玉・実データ）**＝`IntMapTimeCountries` が世界銀行の**その年の実値**（GDP/1人当りGDP/人口/平均寿命/出生率/ネット普及/軍事費）を
    **国all×年で逐次取得**（並列だとWBがIP単位で弾くため直列）し `countryStats` に**オーバーレイ**→国タブ・コロプレス・ホバー・国カードが**その年の世界**を表示、
    「Now」で現在へ復元。誠実性: WB年次は**1960年始まり**（それ以前は最新値＋明示バナー）、年次系列の無い HDI(UNDP)・民主主義指数(EIU) は誤った年を付さない。
    ③NATO/EU 加盟（その年までに加盟した国のみ）、④歴史的国境（最寄りスナップショット）、⑤ケッペン気候区分の年代（1901-1930…1991-2020）、
    ⑥Earth Replay の昼夜境界（Earth Replay はカーネルの**シェル**化＝自身の操作もカーネルへ書込み）。ライブ時は各サブシステムは独立既定、過去へ動かすと一斉同期、
    Now で解放。**IntMapOS**に `time.now/time.year/time.set` を登録、**Atlas** `timeTravel` は `year`（深時間）/`date`/`daysAgo`/`now` を受け全時空を駆動。
    UI: `⏳` トグル＝マスター時計、年入力＋**「何が同期中か」readout**（📰News・📊Countries YYYY・🌦Köppen era・🗺Borders・🛡NATO・⭐EU・🛰Satellite）。
    新規外部EPなし（WB は既出典・年を追加送信するのみ→出典/プライバシー更新済み）。新規 window.*: `IntMapTime`・`IntMapTimeCountries`。
    実測: WB実値検証（USA 2000=\$10.25T・中国=\$1.22T・日本人口=1.268億・印平均寿命=63）、国タブに「📅2000」バナー＋復元、ケッペン年代切替、コンソールエラー0。
  - **#R94b タイムマシン追随: 比較(Compare)の同期＋忠実な旧国家（ソ連・ユーゴ・チェコスロバキア…）**（詳細は DEV-NOTES R94b）:
    ①**Compare を時計に同期**＝棒/表/フォーカスの最新値経路が、走行中はその年のWB(`date=<year>`)/IMF値を表示（`_ttYear`・`_wbYearOne`・`imfAt`）。
    正直に present の穴埋めはしない（欠測=「—」）。根治: ブロックの再描画ガード `sig` に年を含めていなかったため再取得されなかった（銘柄/ソース/モード同一で早期return）。
    表の年プルダウンも時計に追従、`#scp-timebanner`＝「📅YYYY」、開いている比較は `IntMapTime.on` で再描画。実測: 米GDP=\$10.25T(2000)/日=\$5.04T(2000)、Nowで現在へ復元。
    ②**旧国家 `window.IntMapHistStates`**＝**史実の存続期間**の表（ソ連1922-12-30→1991-12-26、ユーゴSFRY1945→1992-04-27、セルビア・モンテネグロ1992-04-27→2006-06-05、
    チェコスロバキア1918→1992-12-31）に後継国ISO3・多言語名・**インラインSVGの当時の国旗**を持たせ、時計がその期間内なら `IntMapTimeCountries` がオーバーレイ後に
    後継国の**世界銀行データを合算**（人口・GDPは和、平均寿命/出生率/ネットは人口加重、1人当り再計算）した合成エントリを `countryStats` に注入し後継国を隠す。
    国タブ＝旧国家を表示、カード＝「🏛かつて存在した国家・YYYY–YYYY・後継国WBの合算(n/N)」注記、Nowで復元。**捏造なし**＝ソ連1990人口が実測 **287,819,825**（≒2.88億、史実どおり）で人口3位。
    当時の**国境**はクロックが駆動する「過去の国境」レイヤー。**#R117: 1886–2019は CShapes 2.0（ETH Zürich, 年次・国境変更日付き）で毎年変化**（`data/cshapes.js` 自己ホスト簡略版・その年の7月1日時点・`_CS_ERA`で植民地期は時代名+宗主国表示）。aourednikスナップショットは読込失敗時の自動フォールバック＋2020以降は現代国境。年移動は6月中旬で判定＝1991=ユーゴ／2000=セルビア・モンテネグロ／2007+=全て分離。
    新規 window.*: `IntMapHistStates`。データ駆動なので旧国家追加は表1行。実測: 1990で旧3国＋国旗＋露非表示、2000でセルビア・モンテネグロ、Nowで現代へ復元、コンソールエラー0。
    R94e: 歴史GDP/人口を**マディソン・プロジェクト**（`data/maddison.json`・実質2011年国際ドル・1900年以降。「Former USSR/Yugoslavia/Czechoslovakia」は独立項目）に。`window.IntMapMaddison`。国エンジンの下限を1960→**1900**にし、走行中は全国のGDP・1人当りGDP・人口をマディソンに統一（GDPの名目WBは破棄）、平均寿命等はWB。旧国家の`agg`もマディソン（SUN/YUG/CSKは直接、他は後継国合算）。比較(Compare)もgdp/popはマディソン。実測: 1970年でソ連がGDP世界**2位（$2.15T実質）**、1920年も表示。落とし穴: 比較の`_ttYear()`は`IntMapTime.year()`（同期）を読むこと（`window._imTimeYear`はエンジンが約1秒後に書くため競合）。
    R94f: **地図本体の国境線**が時計に追従＝`window.IntMapTimeBorders`。aourednikの最寄り年（1960はソ連期を被覆）を`imtb-line`＋`imtb-lbl`に描き、現代の`borders-only-line`＋`ofm-country`を隠す（Nowで復元）。`hb_<年>`のIntMapCacheを共有。全時代の国家・植民地・委任統治領（オスマン帝国・オーストリア＝ハンガリー等）が地図上に国境として出る。注: 地図レイヤーはヘッドレスで検証不可（WebGLのloadが発火せずスクショがタイムアウト）＝実サイトで要確認。出典にマディソン追加。
    R94n: 歴史クリック／比較の3バグ修正（新規外部出典なし）。①旧国家クリック時のハイライトが「直線でぶつ切り」＝クリックイベントの`feature.geometry`はタイル境界でクリップされた複製。`IntMapTimeBorders.featureAt`で元のFeatureCollectionから**完全なポリゴン**を引いて描く。②比較(Compare)の着色領域が史実と不一致＝走行中は各国の**当時のポリゴン**を`geomForCode`で塗る（旧国家はNAME正規表現、現代国は内点の多数決で当時の地物を特定：独帝国はポズナン等を含み1910年仏はアルザス＝ロレーヌ無し）。③独帝国→Wikipediaが現代ドイツに飛ぶ＝クリックを`resolveHist`で史実エンティティに解決し、ポップアップ見出しとWikipediaを**当時の名称・記事**（German Empire／Kingdom of Italy／Qajar Iran…）に。現代言語版に記事が無ければ英語版へフォールバック（誤った現代ページには決して飛ばさない）。カード紹介も`_histId`国で`s.wiki`を使用。実測（実サイト・1910年・エラー0）: German Empire／Kingdom of Italy／Russian Empire が正しい名称・完全形状（435/317/4740点）・正しいWiki記事。
    **#R127: 昔年代クリック＋歴史データ3点（再報告根治）**。①**改名済み単一国のクリックが現代国境に落ちる**を根治＝`resolveHist`に **step2.5＝基底名→現代キャリアコードの直接解決**（`BEC`表: germany→DEU, siam→THA, dutch east indies→IDN…）を追加。独帝国のポズナン(現ポーランド)/アルザス(現仏)→**ともにDEU「German Empire」**。帝国/多継承former stateはstep1が担うので単一国改名のみを拾い、植民地の別継承を過剰主張しない。識別子ロード競合にも強い（`countryStats['DEU']`は常在、改名は後で反映されるだけ）。②**歴史クリックのポップアップに国旗**＝`resolveHist`が `out.flag`（登録レジストリ`S.flag`＝データ無し帝国も可／なければ`countryStats[code].flag`）を返し `showPopup` が名前前に描画（従来は国旗を渡さず、29エンティティの旗が地図上で非表示だった）。③`_ERA_WIKI` に植民地/旧国家**約35件**追加（French West/Equatorial Africa・Colony of Kenya・Colonial Nigeria・French Algeria・Portuguese Angola/Mozambique・各ソ連構成共和国・Bogd Khanate of Mongolia 等、全記事の実在をprobe確認）。実測: Poznań/Alsace→DEU、Warsaw→RUE(Russian Empire)、Bangkok→THA(Siam)、Vienna/Prague→AUH、新Wiki記事15件OK。
    R94o: (1) **British Rajのハイライトが細い破片**＝aourednik 1900/1914は本物の"British Raj"（585/623点・全インド亜大陸）に加え、イラン国境付近に誤ラベルの微小な"India"地物（28点）を含み、`geomFor`の`.find()`が先頭＝破片を掴んでいた。→ `geomFor`は**最大面積の一致**を返すよう修正（実測: Raj比較ポリゴン623点・デリー/コルカタ/カラチを含む）。(2) **国境の刻みを細かく**＝aourednikのスナップは固定（1900,1914,1920,…2010。1905/1910は存在しない）なので、`nearest`を「**最も近い**スナップ」に変更（1910→1914）。ただし前方ジャンプは20年以下のギャップのみ＝1960→1994の巨大ギャップは1960据え置き（1980年代がソ連解体後にならない。忠実な解体日付はIntMapHistStatesが担保）。読み出しchipの`hbAt`も`_nearest`に委譲（「🗺 Borders 1914」が実表示と一致）。(3) **樺太の史実確認**: 1900全島ロシア領／1914は南樺太のみ日本領（1905ポーツマス条約）／1920全島日本領（1920–25の北樺太**保障占領**、正しい）。修正後、1908–1913は1914版図＝南樺太が1908から日本領表示（1910実測: 日本ポリゴンに南樺太あり・北樺太なし）。新規出典なし・エラー0。
    R94c: ソ連GDPが低すぎ（WB名目=公定レート歪み$687B）→ 出典付き実質推計（$2.66T・CIA1990/Maddison）を採用しGDP世界3位に。国旗もパブリックドメインの本物のソ連旗ベクター（金の星＋鎌と槌）に差し替え。
    R94d: **旧国家を比較(Comparison)でも使えるように**＝後継国ISO3（同一`country/all`取得内）を合算（総量は和、率は人口加重、ソ連GDPは推計）して棒/時系列/表に旧国家を表示（`_histAddLatest`/`_histAddSeries`/`_cs`、`cList`除外解除）。実測: 1990で米$5.96T対ソ連$2.66T・人口249M対288M。WBは後継国を1960まで別々に按分（バングラ69M＋パキスタン60M=1970年129M）ため合算で二重計上なし。**旧国家を4→9に拡充**（アラブ連合共和国、東パキスタン込みパキスタン、南スーダン込みスーダン、エリトリア込みエチオピア、東ティモール込みインドネシア）。1970年で統一パキスタンが人口世界5位。
- **天気ポップアップ（右クリック→「ここの天気」, #R40/#R42)** — Open-Meteo の現況＋5日予報（常に最新）。
  気温は設定の °C/°F/両方に完全対応（両方モードは日別予報も °F を併記, #R42）。ドラッグ移動・⟳更新可。
- **共有（Share this view, #R42/#R42b)** — `🔗` ツールバー/右クリックから**共有パネル**を表示。位置・ズーム・投影・ベース地図・
  選択中の全レイヤー・時刻(タイムトラベル)・比較状態を **URL（アドレスバー自体）にすべて格納**。リンクを開くと状態を完全復元
  （新規タブ＝完全復元、同一タブへの貼り付けも `hashchange` で復元。自タブのリロードはR33通りビュー以外クリア＝per-tab
  `sessionStorage` で判別）。コピー/ネイティブ共有対応。
- **お気に入りレイヤー、レイヤープリセット、共有パーマリンク（URLハッシュ）、スクリーンショット、PWA(Service Worker)**。
- **多言語ニュース翻訳**（任意）・**寄付(Stripe)**・**フィードバック**・**管理コンソール(admin.html)**。

---

## 3. ファイル構成と各ファイルの役割 (Files)

```
index.html                      公開用SPA本体（UI・地図・レイヤー・ニュース・AI呼び出し）。**ビルド無し**は不変。
                                (#R170) 5,824行 / 0.53MB（#R169時点は 5,744行/0.49MB（#R168時点は 7,691行/0.64MB、#R167時点は 9,709行/0.89MB、
                                #R166時点は 11,810行/1.14MB、#R165時点は 16,740行/1.73MB、#R164時点は 22,930行/2.65MB、
                                #R163時点は 27,936行/3.20MB、#R162時点は 32,883行/3.77MB。R162〜R170 で 36,955行から **−84%**）。
                                **自己完結が証明できた部分は css/ と js/ に分離済み**（§3.1）。
                                #R167 までで「自己完結したブロック」は尽き、#R168 は**主題（SUBJECT）**単位、
                                #R169 は**宣言か実行か**という軸で切った（§3.1 #R168 / #R169）。
                                残るのは**実際に走る文**だけ＝状態宣言・ブート・地図構築・DOM配線・
                                `map.on()` ハンドラ・IntMapOS・セッション永続化・`IM_HOST`・約90本の巻き上げシム。
css/
  intmap.css                        (#R162) アプリのスタイルシート全体（旧 index.html の `<style>` を**逐語**移設）。
                                    JS は `document.styleSheets`/`cssRules` を一切触らないため挙動は完全に同一。
admin.html                      管理コンソール（geo_pins / dashboard_cards / コミュニティ通報 / feedback の管理）
sw.js                           Service Worker（タイル等のキャッシュ・オフライン補助）。⚠⚠ (#R225) **LRU は
                                タイル1枚保存するたびに `cache.keys()` を最大12,000件走らせていた**
                                （`_trimming` は再入を防ぐだけで反復を防がない）。件数はカウンタで持ち、
                                上限に近づいたときだけ実際に歩く：**14,000回の保存で 14,000回 → 3回**。
                                ⚠ カウンタはヒントであって権威ではない（自動退避・他タブ）——退避経路は
                                必ず実キーを読み、そこで再シードする。⚠⚠ (#R224) **cache-first・
                                無期限・バージョン無しは治らない**：Esri の「まだ画像がありません」は HTTP 200 の
                                約2.5 kB グレー JPEG で、js/sat-proto.js はそれを本文サイズで見分けて
                                「この近傍は画像がここで終わる」と学習し **@2x ステッチを諦める**——つまり一度でも
                                掴んだ z/x/y はそのブラウザで**永久に半解像度**。同じ理由で壊れたベクタタイルは
                                ラベル・国境・道路をまとめて消す。→ ①`intmap-tiles-v2`（activate が v1 を消す＝
                                既存の汚染が全端末で次の訪問に流れる）②placeholder は**保存しない**
                                ③保存に `x-im-cached` を書き、期限切れは**まず古い方を返してから裏で取り直す**
                                （openfreemap/carto 7日・不変の画像/DEM 60日。**再訪の速さは一切失わない**）。
CONSTITUTION.md                 標準指示（最優先のルール集）
Architecture.md                 本ファイル（現状仕様書）
DEV-NOTES.md                    日記形式の開発記録（ラウンドごとの根本原因と修正の記録）
LICENSE
google….html                    Google Search Console 認証用

data/
  ecoregions_2017.geojson/.js   エコリージョン（自前ホスト。PMTiles が dead だったため geojson 化）
  railways_gauge.json           世界の鉄道（軌間別）
  volcanoes_gvp.json            火山（Smithsonian GVP 完新世）
  gazetteer-world.json.gz       (#R208) 世界の地名の長い尾（147,924件・242か国・3.92 MB gzip／JSON 9.0 MB）。cities1000 由来、
                                    名前は alternateNamesV2 の18言語。ブラウザ側で DecompressionStream 展開。出典＝GeoNames
                                `cities15000`（CC BY 4.0、場所と人口）＋ Wikidata（CC0、ja/de/ru/es のラベルを
                                GeoNames id = P1566 で引く）。`scripts/build-gazetteer.mjs` が生成し、
                                `js/gazetteer.js` の `warm()` が**必要になった時に**取得する（同梱しない）。
  gazetteer-phone.json.gz       (#R217) **携帯が取りに行くのはこちら**（452 KB）。上のファイルの**先頭 12,000 行**
                                （＝`js/gazetteer.js` の `MOBILE_CAP`）を切り出しただけで、行・名前・座標・出典・
                                ライセンスは同一。上のファイルは人口の降順なので「最も人口の多い 12,000 か所」になる。
                                携帯は #R198 以来この行数しか使えなかったのに、4,019 KB を取得して ~15 MB のテキストに
                                展開し 148,000 行を JSON.parse した上で 92% を捨てていた（実測：iPhone-13 プロファイルで
                                転送 8,308 → 4,921 KB、GC後の保持ヒープ 70 → 47 MB）。生成は
                                `scripts/build-gazetteer-phone.mjs`（`scripts/build-gazetteer.mjs` の末尾から呼ばれる。
                                ネットワーク不要＝上の artefact だけから導出）。
koppen_mercator_*.png           ケッペン気候区分のベース画像（期間別）。
koppen_mercator_*_4k.png        モバイル用の軽量版（OOMクラッシュ対策。モバイルは 4k png を使う）
_koppen_convert.py              ケッペンTIFF→PNG 変換スクリプト（データ前処理。実行時には不要）
_rail_convert.py                鉄道データ変換スクリプト（同上）

js/
  ── (#R236) 中核と、これまでこの節に自分の項目を持っていなかった23本 ──────────────────────────────
  ⚠ この一覧は `node scripts/arch-files-check.mjs --check` が js/ の実体と突き合わせる（#R236）。
    書き始めた時点で §3 は 117本を説明し js/ には 139本あった——**アプリ最大の2ファイルを含む23本**が
    仕様書に一度も現れていなかった。ファイルを足す・改名する・分割するときは、ここも直すこと。
  app-body.js                       (#R175) **アプリ本体（396 KB・最大のファイル）**。index.html 分割（#R162〜#R199）
                                    のあとに残った「実際に走る文」——状態宣言・ブート・地図構築・DOM配線・
                                    `map.on()` ハンドラ・IntMapOS・セッション永続化・`IM_HOST`。
                                    ⚠ 新規機能はここに足さない（標準指示13）。§3.1 の手順で別ファイルへ。
  geo-engine.js                     (#R178) **レンダラの継ぎ目そのもの `window.IntMapGeoEngine`**（176 KB）。
                                    MapLibre / Cesium のどちらかを裏に持ち、アプリは**契約**（`layers` /
                                    `camera` / `scene` / `events` / `render`）だけを見る。
                                    ⚠ 契約に無い関数名は「2つ目以降」だけ静かに落ちる（#R216）——
                                    アダプタに足したメソッドは必ず契約側にも出すこと。
  lazy-modules.js                   (#R209) **押されてから取りに行く8モジュール `window.IntMapLazy`**
                                    （flightSim / playground / seismic / tsunami / terrainWater / los /
                                    streetView / nightSky / atlasConsole）。⚠ 指定子はすべてリテラル。
  world-base.js                     (#R186) 全球衛星ベース `window.IntMapWorldBase`。
  world-packs.js                    (#R211) 世界データ層（貿易・エネルギー・警報・潮汐・作物）。160 KB。
  space.js                          (#R197) 宇宙エクスプローラ `window.IntMapSpace`（220 KB）。
  space-bodies.js                   (#R213) 探査機・小惑星・太陽系外 `window.IntMapSpaceBodies`。
  space-events.js                   (#R212) 天文現象 `window.IntMapSpaceEvents`。
  space-sky.js                      (#R186) 地球の背後の実際の星空 `window.IntMapSky`。
  ephemeris.js                      (#R197) 惑星の実位置 `window.IntMapEphemeris`。
  atlas-loader.js                   (#R224) Atlas に手を伸ばすと Atlas を取りに行く `window.IntMapAtlas`。
  atlas-attach.js                   (#R232) Atlas の添付（ファイルの正体判定と全画面ビューア）。
  basemap-switch.js                 (#R231) 携帯のベースマップ切替 `window.IntMapBasemapSwitch`。
  bathymetry.js                     (#R197) 同梱の海底地形 `window.IntMapBathymetry`。
  border-style.js                   (#R212) 国境線を1本にまとめるスタイル層。
  grid-style.js                     (#R210) 経緯線のスタイル層。
  dem-source.js                     (#R234) DEM の出所と深さ（terrarium の native max = z15）。
  fault-geometry.js                 (#R224) 描かれた輪郭は断層面の**投影**である `window.IntMapFaultGeom`。
  industry-web.js                   (#R213) 産業の相関 `window.IntMapIndustry`。
  lang-switch.js                    (#R233) **言語変更は「待てるイベント」**——文字列が届く前に描き直さない。
  perf-hud.js                       (#R225) 実機の計器 `?perf=1`。
  place-framing.js                  (#R183) どこまで寄るか `window.IntMapPlaceFraming`。
  proxy-fetch.js                    (#R212) CORS プロキシ経由の取得（相手先ごとに効くものが違う）。
  ─────────────────────────────────────────────────────────────────────────────────────────────
  lang-registry.js                  (#R221) **言語の唯一のリスト `window.IntMapLang`**——`LANGS`（code / label / html / alias）と、
                                    可変長になった `pick(getLang)`。⚠ **最初の5言語の順序は全 L(…) 呼び出しの引数順そのもの**
                                    なので、追加は末尾のみ・並べ替え禁止。現在の言語の**位置**で引数を選ぶので既存5言語の挙動は不変。
                                    引数が足りない言語（＝新規言語すべて）は、その言語の `inline` 表を**英語の文字列をキーに**引き、
                                    無ければ英語（`undefined` を返さない）。`keyed(code)` は `Object.create(en)` で英語に鎖を繋いだ表。
                                    ⚠⚠ **これが無いと6言語目は不可能だった**：5引数の位置指定ヘルパの呼び出しが **2,238か所**、
                                    その宣言が **64回**手書きされていた。
                                    (#R223) **6言語目 zh（繁體中文・beta）が入り、コストは約束どおりだった**：この1行と
                                    `js/locales/ui.zh.js` と import 1行だけで、**L(…) の呼び出し側は1か所も触っていない**。
                                    ⚠ 別名は**字体タグだけ**（zh-Hant / zh-TW / zh-HK / zh-MO）——素の `zh`・`zh-CN` は簡体が多く、
                                    頭2文字の一致で簡体の読者に繁体を渡すのはこのファイルがしてよい推測ではない。
  locales/ui.{en,jp,de,ru,es,zh}.js (#R221) **1言語＝1ファイル**の UI 文字列表（#R162 の巨大オブジェクトから逐語移設）。
                                    `IntMapLang.define(code, { ui, inline })`。`ui` はキー付き辞書、`inline` は L(…) 用の
                                    「英語→訳」表（新規言語だけが使う）。
  i18n.js                           (#R221, 旧 #R162) 上の5ファイルから `window.IntMapI18N` を**組み立てる**役。表は英語に
                                    **プロトタイプで鎖**を繋ぐので、欠けたキーは（テーブル単位でなく）**キー単位**で英語に落ち、
                                    `js/i18n-late.js` が後から英語に足すキーも全言語に即座に届く。`i18n.ja === i18n.jp`。
                                    index.html 側は `const i18n=window.IntMapI18N;` で従来どおり束縛し直すだけ。
                                    ⚠ **言語1つのコストは3か所**：LANGS に1行・`js/locales/ui.<code>.js` 1ファイル・
                                    src/main.js に import 1行。`node scripts/i18n-report.mjs --template <code>` が雛形
                                    （キー284 + インライン1,882）を書き出し、`--` なしで各言語の網羅率を出す。
                                    ⚠⚠ (#R223) **この計器には「4つの綴りのどれかを含まないファイルは飛ばす」という部分文字列の
                                    事前フィルタがあり、`js/ocean-currents.js`（`const { …, L } = W;`）が丸ごと見えていなかった**
                                    ——新言語ではそのモジュールの全文字列が英語のままなのに、レポートは 100 % と表示する。
                                    撤去して +65 文字列。さらに**モジュールが実行時に `Object.assign(i18n.en, …)` で登録する
                                    キー 170 件**（レイヤー名・設定ラベル）は `ui.<code>.js` の外にあるので、新言語では
                                    キーワード表に足す必要がある。⚠ 残る本体：`HOST.lang==='jp'?…` の**言語三項演算子が338か所**
                                    （うち data-layers.js に104）。これらは登録簿から見えず、新言語では英語のまま。
  gazetteer.js                      (#R162) 非AI locator の組込み地名表（`_BUILTIN_GZ`＋`_EXTRA_GZ`）。`window.IntMapGazetteer`。
                                    (#R198) **長い尾**が加わった：`warm()` が `data/gazetteer-world.json` を
                                    **最初に必要になった時に取得**し、`index()` が curated 2表と合わせて matcher 形の
                                    索引を返す（world 到着で1度だけ無効化）。同梱しないのは #R195 の起動転送 189 KB を
                                    戻さないため。ビルドは `scripts/build-gazetteer.mjs`。
                                    (#R208) **15,048行 → 147,924行**（cities1000 相当、242か国）。JSON 9.0 MB は配れないので
                                    artefact は `data/gazetteer-world.json.gz`（3.92 MB）で、ブラウザが `DecompressionStream`
                                    で展開する。⚠ **展開の要否はファイル名でなく gzip マジックで判定**する——`.gz` に
                                    `Content-Encoding: gzip` を付けるホストではブラウザが先に展開してしまうため。
                                    名前は alternateNamesV2 由来の18言語（**js/newsgeo.js が字種として読める言語だけ**：
                                    ラテン/ギリシャ/キリル＋漢字かな。ハングル・アラビア・ヘブライ・タイは対象外）。
                                    ⚠ 登録は `js/news-context.js` の `registerSlices()` が**4,000行ずつ譲りながら**行う
                                    （一括は実測 3.7 ms/1,000行＝約550 msの長いタスク）。携帯の上限は 6,000 → 25,000行。
  page-i18n.js                      (#R218) **独立ページの言語機構 `window.IntMapPageI18N`**。`LANGS`（唯一の言語一覧）・
                                    `js/locales/pages.<code>.js` の遅延読み込み・鍵ごとのフォールバック・
                                    文書（sections/blocks）からのDOM構築・言語ピッカー。`sources.html` /
                                    `science.html` だけが読む（`index.html` は読まない）。`doc(code)` は
                                    アプリ側（Sources ダイアログ）が翻訳済み説明文を読むための入口。
  sources-list.js                   (#R218) `sources.html` の出典一覧の描画（分類・絞り込み）。`IntMapSourcesList`。
                                    分類の正規表現は**レジストリ自身の文（en/jp）**に当てる（読者の言語ではない）。
  locales/pages.<code>.js           (#R218) 独立ページ2枚の全文＋出典説明文（`sourceUse`）。一言語＝一ファイル。
                                    ⚠ (#R246) `sourceUse` は**全9言語**にある（英語原文も含む）。
  reference-data.js                 (#R162) ダッシュボードカード（`DEFAULT_DASH_CARDS`＋`_dc`）とデータ出典表
                                    （`DATA_SOURCES` ＝名前とURLだけ）。`window.IntMapRefData`。
                                    ⚠ (#R246) 説明文の読み出しは `useText`/`ensureDocs` の**1実装**で、
                                    アプリ内ダイアログと `sources.html` の両方がこれを呼ぶ。
  layer-previews.js                 (#R162) `IntMapLayerPreviews`。ファクトリ引数＝(countryStats, geoLayersDB, loadCountryData)
  history.js                        (#R162) `IntMapMaddison` / `IntMapHistStates` / `IntMapHistId`（歴史GDP・旧国家・旧国名）
  monitors.js                       (#R162) `IntMapMonitors`（Area Monitors）。ファクトリ引数＝(map, HOST)。§3.1 参照
  ── 以下 (#R163) の7本。すべて `(map, IM_HOST)` ファクトリ（§3.1）─────────────────
  companies.js                      (#R163) `IntMapCompanies`（企業表＋キーレス時価総額算出・株価系列）。34KB
  stats-compare.js                  (#R163) `IntMapStatsCompare`（多国比較・約20指標・WB⇄IMF切替・時系列チャート）。112KB
  compare.js                        (#R163) `IntMapCompare`（第2のMapLibreインスタンスによる並列/スワイプ/X線比較）。67KB
  routing.js                        (#R163) `IntMapRouting`（OSRM/Valhalla/Transitous の実経路・車線案内・GPX出力）。80KB
                                    (#R184) 要求を**組み立てる側**の3件が入った：**経由地**（`opts.via` は #R132 から
                                    効いていたがUIが無かった）／**通過禁止範囲**＝Valhalla の `exclude_polygons`
                                    （OSRM はどのモードでも表現できないので**能力による provider 選択**。ミュンヘンで実測：
                                    直線上の 2km 箱ひとつで 4.734km → 5.444km）／**フェリー・鉄道・徒歩の個別除外**＝
                                    MOTIS の `transitModes`（**許可リスト**なので1つ除くとは他を並べること）と
                                    `maxPre/maxPostTransitTime`（実測：120秒で候補0本、1800秒で10本＝本当に効く）。
                                    区間ごとの `legDurations` も返すようになった（到着時刻はこれで作る）。
  routing-ops.js                    (#R184) **経路の解析 `IntMapRoutingOps`**。「できた経路について訊く」6件。
                                    **標高差**は同じ terrarium DEM。上昇・下降は **3m のヒステリシス**で積む
                                    （明記する——見えない定数に依存する合計は測定ではない）。実測：ミュンヘン→
                                    ニュルンベルクで +1,011m / −1,230m・正味 −219m＝two都市の標高差そのもの。
                                    **国境通過**はアプリ自身の国ポリゴンで、順番に**国名で**答え、
                                    **各国の通過距離**も出す（200m の「通過」は境界の解像度の話で、それを見分ける
                                    のが距離）。**沿道の天候・災害・ニュース**は経路上の複数点を
                                    **その人が着く時刻で**引く（＝「目的地の天気」とは別物）。
                                    **到着時刻**は出発起点でも「〜までに着く」起点でも。**経路の差**は共通部分を
                                    除いた分だけを描く。**過去の路線網での経路計算**は OSM 自身の年代記録
                                    （`start_date`/`end_date` と `abandoned:`/`disused:`/`razed:` 名前空間 **および**
                                    `railway=abandoned` という**値**の形——名前空間だけ見ると閉止線の大半を取り逃す）
                                    でその年に存在した way だけを残し、実ジオメトリからグラフを作って Dijkstra。
                                    ベッドフォード→ケンブリッジは 1950 年で 49.3km、現在は `disconnected`
                                    （Varsity Line の 1967 年廃止）。**経路自身のどれだけが「年代の記録がある線」か**を
                                    報告する（＝どこまでが記録でどこからが推定か）。25KB
  street-view.js                    (#R163) `IntMapStreetView`（キーレス埋め込みSV＋svv実カバレッジ）。31KB
  flight-sim.js                     (#R163) `IntMapFlightSim`（剛体飛行モデル・HUD・ムービングマップ）。169KB＝最大
                                    (#R174) コックピットのカメラは **#R158/#R172 の「機首方向 1.8km 先を見る
                                    `calculateCameraOptionsFromTo`」に戻した**。#R173 の「地球を球にするため視軸を
                                    地平線の下に固定し padding で見かけを補正する」方式は**上を向けない**（実測 §19
                                    #R174 ①）。**空はレンダラーのもの**——シム自身は何も描かない（`setSky` は #R99 の値）。
  time-borders.js                   (#R163) `IntMapTimeBorders`（年代クリックで当時の国境・国名に差し替え）。119KB
  ── 以下 (#R164) の6本（第3弾・545KB）。すべて `(map, IM_HOST)` ファクトリ（§3.1）。
     選定基準＝**AST実測で「閉包変数への書き込みゼロ」のブロック**（getterだけで出せる）─────────────
  data-layers.js                    (#R164) レイヤーカタログ＋エンジン本体（レイヤーi18n文字列・約50の通常レイヤー・
                                    凡例・パネル再編成・不透明度・日付付きレイヤー更新・自己修復 `IntMapLayerAudit`）。312KB＝最大
  workspace.js                      (#R164) `IntMapWorkspace`（デスクトップの自由配置ウィンドウ・ワークスペース）。90KB
  widgets.js                        (#R164) `IntMapWidgets2`（ウィジェットボード：FX/金属/暗号資産/地震/今日は何の日 等）。79KB
  wb-layers.js                      (#R164) `IntMapWB`（世界銀行指標のキャッシュ付き取得＋WDIコロプレス＋Stats最新化）。39KB
  beta-overlays.js                  (#R164) `IntMapBeta`（ウクライナ前線 DeepState・3D建物・歴史国境スナップ・火山）。30KB
  us-elections.js                   (#R243) `IntMapUSElections`（**アメリカ大統領選挙 1789–2024 の全60回**。州は
                                    「その州の選挙人票を得た候補」で塗り分け、凡例の中に年セレクタと
                                    選挙人票＋全国得票率のバーチャート。データは `data/us-elections.json` と
                                    `data/us-states.json`＝`scripts/build-us-elections.mjs` が書く。レイヤー行は
                                    `dl-uselect`、`lyrGrpGeoPol` に所属）。14KB
  cameras.js                        (#R164) ライブカメラレイヤー（Overpass webcams＋TfL/Caltrans等・`#dl-webcams` 行）。27KB。
                                    **唯一 window.* を公開しないモジュール**＝prod-smoke はDOM行 `#dl-webcams` で検証
  atlas-console.js                  (#R165) **Atlasカーネル `window.IntMapConsole`**（NLコンソール＝意図ディスパッチ・
                                    約90アクションカタログ・AIリサーチ/ビジョン・ハイライト/計測/半径実行・返信描画）。
                                    ファクトリ引数＝(map, IM_HOST)。**初の READ-WRITE ホストメンバー**利用モジュール
                                    （measurePoints/radiusColor/radiusKm/unitMode/userTheme を setter 経由で書く。§3.1 #R165）
                                    ⚠ (#R199) **6,580行 → 5,237行**。6つの部分系が下記の**本物の ES モジュール**として
                                    出て行った（`import { makeAtlasReply } from './atlas-reply.js'` ——
                                    `window.IntMapModules` にも `src/main.js` の順序付きリストにも載らない）。
                                    残った5,209行は**1バイトも変わっていない**（#R199 で機械的に照合）。
  ── 以下 (#R166) の7本（第5弾・590KB／5,048行）。**1ファイル＝1ブロックではなく「主題ごとに束ねる」**
     （41ブロックを7ファイルに）。各ファイルが複数のファクトリを持ち、**どのファクトリも元のブロックが
     あった位置でそのまま呼ばれる**＝実行順は不変（§3.1 #R166）─────────────
  map-ui.js                         (#R166) 地図まわりのUI 8本。レイヤーレジストリ `IntMapLayers`・右サイドバー
                                    `IntMapLayerSidebar`・ニュースティッカー `IntMapTicker`・レイヤープリセット・
                                    ラベルクリックのポップアップ（`window._imPlacePopup`）・GeoJSONアップロード・
                                    URLハッシュ（共有可能ビュー）・共有パネル `IntMapShare`。101KB
  streamline.js                     (#R218) **地理ベクトル場の流線 `window.IntMapStreamline`**（純関数）。
                                    `sampler(grid)`＝**値のある隅だけで重みを再正規化する**バイリニア補間
                                    （隅が1つも無ければ `null`＝答えない）、`trace()`＝**単位方向場の上のRK4**
                                    （刻みは時間ではなく**距離 km**）、`spacingIndex()`＝Jobard & Lefer (1997) の
                                    等間隔則をハッシュ格子で O(1) に。`js/ocean-currents.js` が唯一の呼び出し元。
                                    ブラウザ無しで走るので `tests/r218-checks ①` が剛体回転の場で実測する。
  space-cosmos.js                   (#R219 データ／#R220 描き方) **太陽系の外の距離ラダー `IntMapCosmos`**。
                                    ⚠⚠ (#R220) **円では描かない**（「軌道ではないものに軌道のような円をつけるのは
                                    やめて」）。#R219 は各段を**黄道面の完全な円**で描いた＝惑星の軌道と同じ面・形・
                                    線幅で、オールトの雲が海王星と同じ楕円をもらっていた。今は**半径を横切る短い
                                    目盛り**（半径の3%）＋名前＋公表値。`ring()` は残っているが誰も呼んでいない。
                                    カイパーの崖(50 AU)から
                                    **粒子的地平面(共動 46.5 Gly)** までの17段。各段は「公表された半径・5言語の名前・
                                    出典」の3つ組で、`js/space.js` が黄道面のリングとして名前と値つきに描く。
                                    ⚠ **共動距離**（光の走った時間 13.8 Gyr を半径にすると 3.4 倍近くなる）。
                                    ⚠ これがあることで #R208 の規則「カメラは**この場面が実際に描く**いちばん遠いもので
                                    止まる」を**変えずに**、観測可能な宇宙まで引けるようになった（`reachAu()`）。
                                    純データ＋純関数なので `tests/r219-checks ③` が Node で走らせる。
  runtime.js                        (#R234) **IntMap Runtime** `window.IntMapRuntime`。全体で1本の camera 購読・
                                    1つの rAF（READ フェーズ→WRITE フェーズ）・1本のタイマー・idle キュー、そして
                                    capability の `define/load/activate/suspend/dispose`。**カメラを追う仕事は全部ここ**
                                    （#R234 以前は7ファイルに8つの購読があり、各自が自前 rAF で読んで書いていた＝
                                    強制同期レイアウトが毎フレームN回）。⚠ 誰の仕事も間引かない——消すのは重複だけ。
                                    詳細は §9.0。
  river-course.js                   (#R217) 「どのタイル区間が同じ河川か」と「その河川はどこまで流れているか」。
                                    `window.IntMapRiverCourse`。`nameSet(props)` が `name` / `name:xx` / `name_xx` /
                                    `int_name` / `alt_name` を正規化した**名前の集合**にし、`sameRiver(clicked,feats)` が
                                    その集合の**共有名で推移的に**繋いで区間を選ぶ（`class` は `ofm-river` と同じ
                                    river/canal のみ）。⚠ 河川は国境ごとに改名される（Donau/Duna/Dunav/Dunărea）ので、
                                    #R210 の「1つの名前と一致」ではクリック地点で答えが変わっていた。
                                    `course(props,lngLat)` が OSM の実流路を取りに行く（Nominatim → Overpass。
                                    #R65 の Atlas と同じ順序）。純粋部分は DOM もレンダラも触らないので Node で検査できる
                                    （tests/r217-checks）。呼び出し元は `js/map-ui.js` の `highlightRiver` 1か所。
  map-tools.js                      (#R166) 地図上の対話ツール。投影ビューア `ProjView`・作図 `DrawTool`・
                                    国の分離表示 `IntMapIsolate`・海上A*航路 `IntMapRoute`・
                                    領域アウトライン `IntMapOutline`・図形移動 `IntMapMoveShape`・到達圏
                                    `IntMapIsochrone`・大圏3D弧 `IntMapArc3D`・汎用オブジェクト一覧 `IntMapObjects`。
                                    (#R176) 可視線 `IntMapLOS` は `js/viewshed.js` へ移した（ファクトリ名
                                    `IntMapModules.los`・`(map,HOST)` 署名・呼び出し位置は不変）。125行減。
  sims.js                           (#R166) 実データからのシミュレーション 8本。放射性プルーム `IntMapRadiation`・
                                    範囲人口 `IntMapPopArea`・傾斜/斜面 `IntMapSlope`・電波到達 `IntMapRF`・
                                    昼夜ターミネータ `IntMapSun`・公共交通到達 `IntMapTransitReach`・災害ハザード
                                    `IntMapDisaster`・地球リプレイ `IntMapEarthReplay`。89KB
                                    (#R176) `IntMapSun` に**地形の影・冬至の影・地点の年間日照解析**の3ボタンと
                                    `terrainShadow()`／`solsticeShade()`／`analysePoint()` を追加（計算は
                                    `js/insolation.js`）。**日照ツールは1つ**という方針で、別パネルは作っていない。

  ── 以下 (#R176) の4本。すべて `(map, IM_HOST)` ファクトリ ────────────────────────
  viewshed.js                       (#R176) **見通し線解析 `IntMapLOS`**（`map-tools.js` から移設・全面書き換え）。
                                    旧実装は 900本のレイを「最初の稜線」で打ち切って**1枚の星形ポリゴン**にしていた
                                    ため、尾根の向こうで再び見える地形を原理的に描けず、境界は 60 km で 419 m 刻みの
                                    直線補間だった。新実装は**ラスタのセル単位**で判定し（レイは打ち切らない）、
                                    **対象物の高さ**・**実効地球半径係数 k（1／1.13／4/3）**・**第1フレネルゾーン欠損**・
                                    **単一ナイフエッジ回折（ITU-R P.526）** を持つ。グリッドは**メルカトル単位**で
                                    組み、1枚の `image` ソースとして貼るので再標本化も等距円筒歪みも無い。
                                    表示する精度値（セル寸法・レイ本数・標本数・DEM ズーム・欠測数）は
                                    **実際に使った値**。DEM タイル予算は **LRU 上限 560（#R19）の内側**でなければ
                                    掃引中のタイルが追い出される（§19 #R176 ②）。EN/JP/DE/RU/ES。
                                    (#R183) **2点間リンク解析**を追加（`linkTo` / `linkRun` / `clearLink` /
                                    `armLink` / `linkState`）。面のスイープでは構造上答えられない
                                    「この地点→あの地点は届くか・何が邪魔か・アンテナは何m必要か」に答える。
                                    **線はタイル数が長さに比例する**ので、面が予算のため後退する場面でも
                                    **DEM native z15** で走る（実測 10km→3.9m間隔／98km→24.5m間隔）。
                                    出力＝曲率＋屈折込みの地形断面グラフ（devicePixelRatioで描画）・
                                    **決め手となる地形**（位置と余裕/不足m）・フレネル**割合**・回折損失dB・
                                    **必要アンテナ高**（同じ判定を二分探索して解く。500m上限）。
                                    障害物の順位は素の余裕でなく**フレネル半径に対する比**（第1ゾーンは
                                    中間点で最も広いので、素のmだと手前の小丘が中間点の尾根を追い越す）。
                                    判定語はラスタと**同じ4語**（clear/fresnel/diffraction/blocked）。
                                    必要高が解けない場合、障害物が経路の75%より先なら「**相手側を上げよ**」と言う
                                    （手前を上げても持ち上がりは `(1−d1/total)` 倍しかない）。
  terrain-water.js                  (#R176) **地形編集＋水流 `IntMapTerrainWater`**。実 DEM をブラシで盛る／削る、
                                    線を引くだけで堤防・ダム（同じ高さ場に稜線を刻むだけで、ソルバは man-made か
                                    どうかを知らない）、任意量の水を落とす。水は**プライオリティフラッド**
                                    （Barnes et al. 2014）で湛水位と排水親を同時に得て、その **pop 順を逆にたどる
                                    1回の体積集積**で流下経路を出す。窪地は実際に届いた水で満たし（標高順の累積和＋
                                    二分探索）、溢流高に達したら**決壊**——出口セルが決壊方向で、越流量つきの矢印を描く。
                                    256×219・72 m セルで **1回 26〜48 ms**＝ブラシの1ストロークごとに解き直す。
                                    定常ルーティングモデルであり浅水方程式ではない（波面速度は扱わない）。
                                    (#R189) 下流トレースは**解像度ラダー**（源流10 kmまでz13・50 kmまでz12・以遠z11、
                                    点ごとの標本間隔 `spac[]` を記録）。窓内の経路は脱出親鎖でなく **MFD 集積の
                                    タルウェグ**（channelChain：filled 降順に slope^1.1 配分→最大集積の下降近傍、
                                    平坦はスピル親鎖を一括通過）。窓より広い平地では **3× 窓へ1回エスカレーション**
                                    して出口を探し、なければ従来どおり正直に 'lake'。流量 **Q (m³/s) を設定可**
                                    （A=Q/(K√S)、K=40；未設定は#R188の体積連続）。DEM が3割超欠損なら**造らずに断る**
                                    （fail-closed）、seaCheck 不能は「未確認」と明記。トレース例外は end='error' として
                                    描画・報告（握り潰さない）。パネルは不透過（--card-bg）。
                                    ⚠⚠ (#R237) **パネルは「見出し付きカードの積み重ね」になった**——「UIが分かりにくすぎる
                                    から全面的に改修し、モダンな実装でiOS風に」。#R234 が型スケールと文字色を1つずつにしたのは
                                    **ドリフト**の修正で、**形**はそのままだった：15個の操作が `gap:9px` の一列に並び、
                                    「どの地震を読むか」「震源をどう作るか」「モデルの仮定」「再生」「結果」が全部同じ高さに
                                    ある＝読むには全部読むしかない。iOS の実体は角丸ではなく **grouped inset list**（主題ごとに
                                    1枚のカード、カードの**中**にだけ髪の毛線、1行1操作でラベル左・値右、行の高さ40 px）。
                                    いまは作業順に6枚: **地震を読み込む → 震源を作る → パラメータ → 計算と再生 → 結果 → 注意と出典**。
                                    ⚠ **ハンドラが掴む class 名は1つも変えていない**（`.sq-d`/`.sq-m`/`.sq-run`/`.sq-t` …計40）＝
                                    再グループ化であって書き直しではない。#R236 の教訓の裏返しで、**移動は安全・削除はハンドラ
                                    ごと消さないと render() の中で throw する**。
                                    ⚠ **スタイルシートはこのモジュールが注入する**（`_ensureCss`）。`css/intmap.css` は全ページで
                                    render-blocking な `<link>` で、この画面はボタンの向こう側かつ `js/lazy-modules.js` の
                                    向こう側——起動経路に置くとシミュレータを開かない訪問すべてがその代金を払う。
                                    ⚠⚠ **1つのタグに class 属性を2つ書くと、パーサは前を採って後ろを黙って捨てる。** この
                                    ラウンドの最初の版はそれでセグメント制御が**無スタイルのまま出荷され**かけた
                                    （`class="sq-src-past" class="sq-seg"`）。検査を `tests/r237-checks.test.mjs` に入れた。
                                    ⚠ (#R237) **各地の表の震度チップは階級によらず同じ箱**（`min-width:62px`＋`text-align:center`）
                                    ——「震度階級ごとに大きさをそろえるように」。以前は文字幅ぶんの `padding:3px 9px` だったので
                                    「MMI VIII」と「MMI IV」で箱が違い、**縁の凹凸が意味を持って**見えていた（強い揺れほど広い箱、
                                    という嘘）。62 px は**実測**で決めた: MMI VIII 61 px・MMI VII 58・MMI XII 57・JMA 6+ 57・
                                    JMA 5− 53・JMA 7 48（FS_H・アプリの書体）。
  seismic-events.js                 (#R232) **過去の地震の公表震源パラメータ**（東日本2011・チリ1960・アラスカ1964・
                                    スマトラ2004・阪神淡路1995・関東1923・トルコ/シリア2023・四川2008・ハイチ2010）。
                                    各行は hypocentre・Mw・走向/傾斜/すべり角・断層長×幅・**核形成位置 `nucAlong`**・
                                    出典、そして **`obs`＝当時の実測値**（最大震度・すべり量・津波高・人的被害）を持つ。
                                    ⚠ **入力と結果を分ける**：モデルが計算するのは結果だけで、`obs` は引用であり計算値と
                                    混ぜない。⚠ すべり量は**公表モーメントから逆算**する（M₀=μAD̄ の鎖と矛盾させないため）。
                                    `ruptureRing(ev)` が公表矩形を傾斜で地表投影へ。
                                    ⚠ (#R235) **描かれる輪郭は既定でこの矩形ではない。** `fetchRuptureRing(ev)` が
                                    **USGS ShakeMap の `rupture.json`**（公表された有限断層面の地表投影）を取得し、
                                    そちらがあればそれを使う。9件中**8件に `usgs` イベントIDがある**（神戸1995のみ
                                    公表モデル無し＝矩形のまま）。多角形の**第3座標が深さ**なので `zTopKm`/`zBotKm` は
                                    公表ジオメトリから読む。⚠ **取得失敗・オフライン・モデル無しはすべて矩形へ落ちる**
                                    （追加であって依存ではない）。⚠ 複数セグメントのモデルは**最大の環**を使い、
                                    セグメント数をパネルに明記する。出典は `ev.src`（数値の出所）とは**別の行**で、
                                    取得できなかったときは1行も書かない。
  seismic.js                        (#R252) **パネルの既定位置**は `_defBox()`＝`top:58 /
                                    max-height:calc(100dvh − 148px)`、`left` は**障害物を実測して決める**。
                                    以前の `16 / 80 / −96px` は、左サイドバーを畳んだ状態で実測 `[16,80,378,786]`
                                    となり `#coord-readout [9,760,333,791]` を幅いっぱいに、
                                    `.btn-toggle-sidebar [0,368,22,442]` を 6px 覆っていた。⚠ 移動だけでは下端が
                                    座標欄に届いたままなので **cap も下げる**。
                                    ⚠⚠ **`left` を定数 52 にした最初の版は本番検証で壊れているのが分かった**——
                                    ハンドルは `left:0`（畳）と `left:var(--sidebar-w)`（開）の2か所を行き来し、
                                    実測 `[52,58,414,732]` が開いた側の `[400,378,422,442]` を 14px 食っていた
                                    （元の 16 は開いた側を 22px 外していた）。`--sidebar-w` は利用者が変えられるので
                                    **どんな定数でも足りない**。ハンドルが左端に貼り付いている（`right<60`）ときだけ
                                    その右へ、それ以外は 16。⚠ ドラッグされていない間（`data-dragged` は
                                    js/window-manager.js が付ける）は**開くたびに再適用**する。
                                    ⚠ **≤768px は従来の数値のまま**（ハンドルは `display:none`、幅は 94vw なので
                                    右へ寄せると画面外に出る）。tests/r252 ⑧ が規則と障害物の位置を見る。
  seismic.js                        ⚠⚠⚠ (#R240) **描いた震源域は t=0 から波の絵に届く。**
                                    #R239 の帯（T_first と T_last の間）は、`T_last = max(off/Vr + dist/V)` が
                                    **断層の最後の一片が破壊し終えるまでどこにも存在しない**ため、500 km の震源域では
                                    **t=400 s まで1つも描かれていなかった**（実測: t=30/90/200 s は ring×4 のみ）。
                                    「後端がまだ無い」は「どこも揺れていない」ではなく逆で、破壊が終わるまでは
                                    どこも止まっていない——揺れている領域の内側の境界は**破壊済みの断層そのもの**
                                    （利用者が描いた輪郭が Vr で育つ）。2つの領域は連続する。
                                    ⚠ **有限断層が波面にするのは形ではなく振幅。** 初動の等時線が円なのは #R238 の
                                    定理（Vr ≤ V）だが、Ben-Menahem の見かけの震源時間 T(θ)=T₀·Fd はパルスを破壊方向へ
                                    圧縮するのでピークは ≈1/√Fd（前方 ×1.83／後方 ×0.76）。各フロントは円弧に分けて
                                    出され、円弧ごとに**自分の方位が得た太さと不透明度**を運ぶ（`emitFrontArcs`）。
                                    震源域が無ければ `fdAt` は全方位 1 を返し、リングは以前と1バイトも変わらない。
                                    ⚠⚠⚠ (#R241) **そして #R238 の定理は「答え」ではなかった。** 3ラウンドがそれを引用して
                                    円を出荷し、4回目の再送で拒否された（「Vr ≤ V だから同心円でオッケーですって
                                    どんな理屈やねんアホ」）。**その定義では描けないことの証明は、定義を変える理由**である。
                                    描かれる波面はいま **`_frontT(k)`**——「波は**破壊済みのすべての断層片**から速度 V で
                                    広がる（片は `off_k/Vr ≤ t` で破壊する）」——で、破壊済み領域のオフセット曲線になる。
                                    破壊が震源の近くにある間は円、走るにつれて断層自身の形に育つ。
                                    ⚠ 代償は明記: τ で破壊した片は実際には `t−τ` しか放射していないので、この前縁は
                                    走向方向に最大 `V·L/Vr` だけ真の初動より先行する。**有界で、方法論の段落に書いてあり、
                                    表も同じ距離で測る**（`at()` は `distKmTo`＝震源域までの距離。地動モデルは #R189 から
                                    それを使っている）→ **パネルの中の「距離」は1つ**で、絵と数字が食い違えない。
                                    ⚠⚠ **輪郭は「歩く」（`_walkRing`）。** 長方形の震源域は `fault.ring` が**4点**で、
                                    「ring.length/24 番目ごと」の標本は四隅だけを取り、500 km の長辺には1点も置かない。
                                    実測: 修正前は t=30 s の波面が点震源と**1バイトも違わなかった**（最も近い隅は 90 km＝
                                    t=34 s まで破壊しない）。歩幅は輪郭自身の周長の 1/28（最小 6 km）。
                                    実測（M9.1・500×180 km・S波の外周の最大／最小）: t=30 s で 1.017 → **1.401**、
                                    t=120 s で 1.106 → **1.32**。点震源は 1.003〜1.06 のまま。
                                    ⚠⚠ (#R240) **パネルは何も武装せずに開く。** `clickMode` の宣言は `'none'` で、
                                    震央がまだ無いときだけ `open()` が `'epi'` を武装する。そして本文スクローラの
                                    **外側に固定フッタ**があり、3手順のトラック・次にすることの1行・**主動作**を持つ。
                                    主動作は `.sq-run` を**移設**したもの（複製すれば計算ボタンが2つになる）。
                                    ⚠ 各地の表のチップ幅は**尺度ごと**（JMA は JMA の、MMI は MMI のラベルで測る）。
                                    (#R176) **地震波シミュレーター `IntMapSeismic`**。到達時刻は **IASP91**
                                    （Kennett & Engdahl 1991）の**レイトレーシング**——速度分布の多項式がこの
                                    ファイル内のデータで、走時はそこから計算する（表引きではない）。地球を 1 km の
                                    等質球殻に切りスネルの法則で追うので、反転点の特異積分が存在せず、走時曲線の
                                    三重震相もコアの影もモデルの帰結として出る。表面波は群速度 3.5／4.4 km/s。
                                    地動は**確率論的震源法**（Brune スペクトル・三折れ幾何減衰・Q=300・κ=0.035 s・
                                    1/4波長則の地盤増幅・確率振動論）。震度は PGV → 改正メルカリ（Wald et al. 1999）で、
                                    **気象庁震度階級ではない**と明記し、相関式と地動モデルの適用範囲外
                                    （1,000 km 超／PGV<0.5 cm/s）では**震度を出さない**。USGS フィードから実地震を読み込める。
                                    (#R189) 再生は**等倍が既定**（壁時計×レート、×1〜×300 の select）。震度は破線の
                                    等値線ではなく**塗った場**：実 DEM の地形勾配から **Vs30 を推定**（Wald & Allen
                                    2007・活動域テーブル、±900 m 標本）し、セルごとに 1/4 波長則へ入れる（PGV は増幅係数に
                                    線形なので RVT は 1 次元プロファイル 1 本＋セル毎 1 乗算）。海（標高≤0）と DEM 欠損は
                                    塗らず件数を表示。階級は **MMI ⇄ 気象庁震度**を切替可（震度は計測震度換算
                                    I=2.68+1.72 log₁₀PGV・藤本／翠川 2005 と明記、配色は気象庁基準）。**フリー描画の
                                    震源域**（共有 DrawTool の currentGeometry）＋平均すべり量 D̄ で M₀=μAD̄（μ=ρβ²）→Mw、
                                    距離は **Rrup**（面内0・外は最近縁）になり分布は断層形に従う。波面は震源域の各点から
                                    破壊伝播 Vr=0.75β の遅延つき**包絡**。リングは
                                    HOST.diskOutlineLines／_splitLineToWindows 経由＝反対子午線・極で壊れない。
                                    ⚠ (#R237) **その頂点数は画面から決まる**（`_frontSteps`）。144本＝方位2.5°の
                                    定数だったので、全球では見えないが**波が届く海岸へズームすると多角形になる**
                                    ——「動作は離散的ではなくスムーズにして」。いまは現在ズームでの**波面の画面半径**から
                                    「周長6 px ごとに1頂点」で決め、**下限144（従来値＝退行しない）・上限720**。
                                    実測: z2〜z5 で145頂点、z8 で301〜521（各波面の半径が違うので別々になるのが正しい）、
                                    z11 で721。⚠ 点震源のリングも**同じ規則**を通す（`ringLines` が `_frontSteps(a)/2`）
                                    ——でないと「滑らか」が片方の形にしか当てはまらない。⚠ **キロメートルではなく画面で
                                    決める**のが要点で、宇宙から見た太平洋大の波面は市街から見た50 kmの波面より**少ない**
                                    頂点で足りる。
                                    パネルは不透過（--card-bg）。
                                    ⚠⚠ (#R235) **その包絡は #R234 まで「凸包」だった。** #R189 以来の
                                    `R = off·cos(b−φ) + r` は**サポート関数**＝接線で、#R189 のコメント自身が
                                    「exact for the convex hull」と書いていた。帰結は **手描きの凹んだ震源域が
                                    凸包に置き換わる**こと。いまは球面三角形の**外側の根**
                                    `R = atan2(B,A) + acos(cos r / C)`（`A=cos off`・`B=sin off·cos(b−φ)`・`C=√(A²+B²)`）で、
                                    `|cos r / C| > 1` は「この方位はその点の円に届かない＝寄与しない」。
                                    ⚠ **小角近似の話ではない**：平面の合併境界は `off·cos Δb + √(r²−off²·sin²Δb)` で、
                                    旧式はその平方根を `r` に置いたもの。走向方向でしか一致せず、直交方向で最大にずれる
                                    （実測 off 0.2°/r 0.5° でも 2.3 km、10°/20° で 0.4°超）。
                                    ⚠ (#R235) **各標本点は自分の深さを持つ**（`_srcPts()`：`zTopKm`→`zBotKm` を走向直交
                                    座標で線形＝解かれた面をそのまま読む。走向が無い塊は震源深さのまま）。
                                    ⚠ (#R235) **表面波の群速度は大円経路に沿った積分**（`_pathBuild`/`_pathDeg`：
                                    `S(Δ)=∫ds/g` を震源ごとに1枚。海洋地殻 `OCEAN_G` 既定 1.08＝詳細設定で可変）。
                                    **3.5／4.4 km/s は大陸経路の基準値のまま**で、陸海マスクが無ければ
                                    置き換える前の等速円と完全に同一に落ちる。
                                    ⚠ (#R235) **再生は rAF**（`IntMapRuntime.frame('seismic:play')`）。#R234 までの
                                    `setInterval(…,90)`＝11 Hz と `Math.round(tSec)`（整数秒への量子化）が
                                    「離散的」の正体。速度（実時間×倍率）は不変。
                                    ⚠⚠ (#R223) **点震源と描画震源域は同じ有限震源になった。** #R191 は点震源にだけ
                                    Yenier & Atkinson (2014) の等価点震源深さ（M7.5 で 22.8 km）を距離に加え、描画側には
                                    加えなかった（Rrup が既に有限性を持つので二重に数えないため）。どちらの理屈も正しく、
                                    合わせると**同じ規模で別々の地震**になっていた（実測 Mw7.50・深さ10 km・岩盤・震央：
                                    点 MMI 7.70／震度5.17 対 描画 MMI 9.08／震度6.08、100 km 以遠は 0.2 % 以内で一致）。
                                    → 点震源は**その規模が意味する破壊面**（Wells & Coppersmith 1994、
                                    log₁₀A = −3.49+0.91·M、M7.5 で 2,163 km²・等価半径26 km）として扱われ、距離は
                                    max(0, R_epi − a) を震源深さと合成したものになる。擬似深さは**両方から**消えた。
                                    ⚠ 距離の変換は `srcDistM()` **1か所**（buildField・buildFar・mmiRings・at() の4人が通る）。
                                    ⚠⚠⚠ (#R245) **細密画像と遠方環状は「厳密なタイリング」で、継ぎ目に補間が無い。**
                                    細密画像の箱（`W/E/Nn/Ss`）は遠方ラスタのセル境界へ**外向きに吸着**され
                                    （`snapLngFar`/`snapLatFar`・`FAR_N()` は両方が読む1つの宣言）、
                                    どの遠方セルも箱の完全な内側か完全な外側になる——**二重に描かれるセルも、
                                    どちらにも描かれないセルも無い**。そのうえで遠方層だけ
                                    `raster-resampling:'nearest'`。既定の `linear` は透明セルへ向けてアルファを
                                    1セル（28 km）かけて溶かし、**長方形に沿って基図が透ける線**を作っていた
                                    （#R244 の距離修正の後も残っていた「四角形の線」の正体。合成フレームで実測5画素）。
                                    ⚠ 重ねる（＝両方が塗る帯を作る）のは**不可**：`raster-opacity` 0.85 の2層は
                                    1−0.15²=0.9775 に合成されるので、重なりは両隣と違う透明度になる（実測 15/255）。
                                    ⚠ 残る副画素ずれ：南北の端のみ約 1.4 km（描画側。データの吸着は厳密）。
                                    ⚠⚠⚠ (#R248) **遠方ラスタは「世界全体」ではなく「場の届く範囲」を覆う。**
                                    `farWindow(C0, rEdgeSurf+破壊面の張り出し)` が球帽の外接箱を返し、格子は
                                    **メルカトルで正方**（正角図法なので地上でも正方）＝ `nx`/`ny` は窓の形に従い、
                                    セル予算は `FAR_N()²` のまま。実測（M9.1・143 E/38.3 N・震度）：
                                    **22.4 km → 2.62 km セル**（窓 122.15–163.85 E / 22.0–54.6 N・1,392×1,431・
                                    塗ったセル 296→21,186）。細密場は 1.17 km なので継ぎ目の比は 19倍→2.2倍。
                                    `rEdge`・細密の箱・スパン・セルは1バイトも動いていない。
                                    ⚠ #R191 が箱を避けた2つの理由は**測って**回避する：球帽が極を含む、または経度到達が
                                    ±180 を跨ぐときだけ `full`＝経度は従来どおり全周（緯度は縮むので、その場合も
                                    実測 24.7→6.96 km と改善）。球帽の経度最大到達は `asin(sin ρ / cos φ₀)` で、
                                    `r/(111·cos φ)` の線形近似では**足りない**（窓が場を切ってしまう）。
                                    ⚠ セルは両辺とも `4·FAR_N` を超えない（跨ぎ＋薄い帯で canvas 幅が破綻するため）。
                                    ⚠ 細密の箱は**この窓の格子**へ吸着する（`farWin.dx/.y0/.dy`）。吸着量は
                                    `stats.snapCols`/`snapRows` に**整数として**出るので、タイリングは目視でなく数字で確認できる。
                                    ⚠ 塗ったセルが0なら画像は作らない（全透明PNGの符号化は純粋な浪費）。
                                    ⚠⚠⚠ (#R249) **そして継ぎ目のセルは「予算」ではなく「細密場のセルの複製」になった。**
                                    「震度分布をある程度の範囲までいったら、そこから解像度が劇的に悪くなる」——#R248 の後に
                                    再送され、利用者確認で**継ぎ目そのもの**（PC・M8.5以上・震源から1,500 km 以遠）と確定した。
                                    #R248 は「解像度」を遠方ラスタの**セル**と読んで 22.4→2.62 km にしたが、目が読むのは
                                    **比**であり、それは 2.24倍のまま残っていた（実測 M9.1: 細密 1.172 km ｜ 遠方 2.62 km、
                                    M8.8 で 2.01倍）。**1つの絵は1つのセル**——細密格子を**先に**解き（`N` は `halfKm` だけに
                                    依存するので順序を変えられる）、`farWindow(C0, rKm, spanKm0/N)` に渡す。
                                    継ぎ目の段差は**構造として 1.00倍**になり、調整で合わせたのではないので後のラウンドが
                                    片方だけ動かしてずらすことができない（数字が1つしか無い）。
                                    実測（M9.1）: 遠方 3,102×3,192・**1.172 km**・step **1.00**・吸着残差は四辺とも **0**・
                                    PNG 268 kB・`fld.ms` 3,766→3,245 ms（悪化なし）。M8.8 も 1.00、M9.5 は上限に当たって 1.02。
                                    ⚠ 上限は**セル数**（＝一時的な RGBA canvas、4バイト/セル）であって好みではない:
                                    `FAR_MAX_CELLS()` = 1,200万（PC・48 MB／細密場自身の一時 26.2 MB と比較）、携帯は 160万。
                                    上限に当たったときの実際の比は `state().far.step` と `stats.farStep` に**印字**される——
                                    黙って超える上限は、この報告が4度目に戻ってくる道筋そのもの。
                                    ⚠⚠⚠ (#R247) **`rEdge` は「震源距離」であって「地表距離」ではない。**
                                    `profEdge.rr` は `motion()` を評価する格子＝`srcDistM()` が**出す**距離で、
                                    `buildFar` はそれを**地表**距離 `km` と比べていた。差は**想定破壊半径**そのもの
                                    （M6 で 5 km・M8 で 44・M9.1 で 140・M9.5 で 213）で、震源域を描いた場合は 0
                                    ——だから**点震源でだけ**出た。細密場には `rEdge` の検査が無い（階級判定だけ）ので、
                                    細密画像の**箱の直線が場の縁**になり、そこで途切れて見えた。
                                    `rEdgeSurf = cut + √(rEdge² − depth²)`（`srcDistM` の逆変換を1回）を渡す。
                                    ⚠⚠ **所有は「箱」だけ**——#R218 の帯解法は半径 `rFine` の円盤も除外していたが、
                                    細密画像はその円盤の**外接箱**であって円盤ではない。東西の脇では箱の縁が
                                    `rFine` より**近い**ので、そこは箱の外（細密は描かない）かつ `rFine` の内側
                                    （遠方は飛ばす）＝**どちらも描かない細い線**になっていた（幾何だけの実測で
                                    45°N 0・50°N 21・60°N 192・70°N 2,734 セル）。内側半径の検査は削除。
                                    ⚠⚠⚠ (#R247) **場は「崖」ではなく「フェード」で終わる。**
                                    最下位階級より下は一切塗らない仕様（`jmaClass()` が null／`I<2`）だったので、
                                    **最下位階級の等値線がそのまま不透明度 255 の崖**になり、円の東西端では画面上
                                    ほぼ垂直な直線に見えた（＝「直線状の崖」）。`fieldPx(I,out)` が**色と不透明度の
                                    両方**を返す1つの関数になり、階級の下端から**半階級**かけて 255→0 へ落ちる。
                                    ⚠ 縁の半径 `rEdge` も**フェードの床**で解く（階級の床で解くとフェードが
                                    その半径で切られ、崖が1段先に移るだけ）。`tests/r247 ②③`。
                                    ⚠⚠ (#R223) **場址項は DEM が届かない場所でも一様にならない**——`js/vs30-mask.js` の
                                    同梱 0.25° Vs30 が、遠方場・タイル欠損セル・勾配基線が粗いセルを埋める。
                                    3ラウンド続いた「震度分布が同心円」の最後の扉。パネルの表示も3択になった
                                    （実DEM／同梱0.25° Vs30／一様）。
                                    ⚠⚠⚠ (#R250) **1つの絵は1つの「粒度」——ラスタは自分の入力より細かく作ってはならない。**
                                    「解像度が劇的に悪くなる」の**3回目**。#R248 は遠方ラスタの**広さ**を、#R249 は
                                    **セルの比**を直した（22.4→2.62→1.00倍）。どちらも**キャンバス**を測っていて、
                                    読者が見るのは絵の**detail**である。#R249 の後、遠方ラスタは 1.17 km のセルを
                                    **セルが28 kmだった頃に選ばれた2つの入力**から描いていた:
                                    ・**海岸線** 19.6 km（同梱ラスタ）／細密場は 1.15 km ＝ **17倍**
                                    ・**場址項** 28 km（同梱0.25°）／細密場は DEM 勾配 960 m ＝ **約21倍**
                                    実測（M9.1・143E/38.3N・r=1,500km を跨ぐ5方位・128セル＝150km あたりの**変化回数**）:
                                    **内側 126〜127回／外側 6〜8回**。海岸線は 600 km 四方で **5,317/262,144 セル（2.03%）**が
                                    19.6 km 版と 1.14 km 版で食い違い、その全部が海岸線上＝**19.6 km の階段**。
                                    → 両方を**このラスタ自身のセル**で答える: 海岸線は細密場と同じ `js/coast-mask.js`
                                    （#R215 の「大きなタイルでごまかすな」が遠方場には一度も適用されていなかった）、
                                    場址項は細密場と同じ DEM 勾配（`vs30FromSlope`）。**同梱 0.25° はセル単位の
                                    フォールバックのまま**なので、タイルが届かなければ**今日と同じ絵**になる（加算的）。
                                    ⚠ **細密場は1バイトも動かない**（`rEdge`・箱・span・セル）。#R247 の規則。
                                    ⚠ タイル予算は遠方場**自身のもの**（desktop 512／mobile 128・細密場の 1,600 とは別）。
                                    細密画像の箱の中／`rEdge` の外／海だけのタイルは要求しない。
                                    ⚠ **粒度は印字する**——`state().far` に `landSource`/`landCellKm`/`siteSource`/
                                    `siteSpacingM`/`demSiteCells`/`bulkSiteCells`/`demTiles`。この欠陥が2ラウンド
                                    生き延びた理由は「`cellKm` が 1.17 と言い、海岸線が 19.6、地面が 28 と言っていて、
                                    **3つを並べて印字する計器が無かった**」ことそのもの。`tests/r250 ①②③`。
                                    実測（M9.1 Tōhoku・震度）: セル 1.172 km／海岸 **19.6→1.14 km**／場址 **28 km→960 m**／
                                    塗ったセル 107,796→124,256（細密海岸線が拾い直した実際の陸地）／`fld.ms` 6,328→5,067 ms。
                                    ⚠ **残っている段差**: 窓が**全世界**になる場合（震源から±180°を跨ぐ／極を含む）は
                                    `4*NF` の上限が効いて `step` が **4.56〜4.77倍**（MMI スケールの M9.1 日本、
                                    または南西太平洋の震源）。粒度は追随する（海岸 4.84 km・場址 1,920 m）が
                                    **セルの比は残っている**。窓を±180で2枚に割らないと 1.00 にはならない（未実施）。
                                    ⚠ (#R223) **速度**：算術は全体の3%だった（実測 15.8 s の内訳＝DEM取得9.1／snapshot＋
                                    海岸線3.4／セル0.5／PNG＋遠方場2）。効いたのは①海だけのタイルを要求しない
                                    （東京M7.5で702→270枚）②4ホスト分散（1.5〜1.7倍）③`IntMapCoastMask.rasterize()` の
                                    **外接箱カリング**（2,966→68 ms、描いたリングは4,293本中6本。箱が窓と交わらないリングは
                                    窓に1画素も置けないので**恒等**であって近似ではない）。
                                    (#R192) 階級は**それぞれの定義の帯域から**計算する: 震度は気象庁「計測震度の
                                    算出方法」そのもの（周期補正・10 Hz ハイカット・0.5 Hz ローカット→合計0.3秒間
                                    超える加速度 a₀→I=2·log₁₀a₀+0.94）、MMI は Worden 2012 に **0.1 Hz ハイパス**を
                                    掛けた PGV を渡す。震源スペクトルは Atkinson & Silva 2000 の2コーナー。
                                    陸海判定は `IntMapLandMask`（マスクが無ければ遠方場は**描かない**）。
                                    ⚠⚠ (#R226) **不透明度は1か所にしかない。** 塗る画素の α は `FIELD_ALPHA=255`
                                    （細かい場と遠方環状の**両方**が同じ定数を使う）で、透明度は `raster-opacity`
                                    ——スライダーの数字——だけが持つ。以前は画素に α=235 が焼かれていて、
                                    スライダー100%でも 0.922 しか出せなかった（既定85%は 0.784 を描いていた）。
                                    ⚠ (#R226) **格子は セル 1.0 km・上限 2,560²（PC）／1.5 km・640²（携帯・不変）**。
                                    幅の広い地震では上限が先に効くので**セル目標と上限は必ず一緒に動かす**
                                    （span 3,000 km で 1.674 → 1.172 km）。保持は #R205 の Int16 のまま 10 B/セル。
                                    ⚠ (#R226) **2.04倍のセルで 21% 速い**（同一機・同一イベント・DEM 80枚:
                                    8,625 ms/3.21M → 6,885 ms/6.55M ＝ 1セル 2.69 → 1.05 µs）。効いたのは
                                    ①**行ごとのDEMサンプラ**（下記 map-readout）②**進捗は変わったときだけDOMに書く**
                                    （320回 → 高々59回。CPUプロファイルで壁時計の61%は「yieldの合間のフレーム」だった）
                                    ③**yield は MessageChannel**（入れ子 `setTimeout(…,0)` の ~4 ms 丸めを払わない）。
  land-mask.js                      (#R192) **同梱の陸海マスク `IntMapLandMask`**。`data/land-mask.png`（2048×1024・
                                    1bit・19.6 KB、Natural Earth 1:50m 陸ポリゴンから scripts/build-land-mask.mjs で
                                    生成）を1度だけ復号して 256 KB のビットセットにする。`isLand()` は
                                    **true / false / null（未ロード）**の3値——「分からない」を「陸」と答えないための
                                    モジュール。ネットワークに一切依存しない（震度分布が「たまに海もべた塗」に
                                    なっていた原因は、陸海判定が DEM タイルの到着に依存していたこと）。
  coast-mask.js                     (#R215) **呼び出し側の解像度で答える海岸線 `IntMapCoastMask`**。`land-mask.js`
                                    が「点」を19.5 kmで答えるのに対し、こちらは**アプリ自身の 10 m 国境ポリゴン
                                    （`window.countryGeo`＝いつもの国境線）を、呼び出し側が既に作っているグリッドに
                                    直接ラスタ化**する。`rasterize({west,y0,dx,dy,N})` → `Uint8Array(N*N)`。
                                    震度分布の微細場は 1.5 km セルなので、19.5 km 多数決で海岸を決めると
                                    **13倍粗い階段**になる（「大きなタイルでごまかすな」）。ジオメトリは持たず、
                                    描くだけ。国境が未到着なら `land-mask.js` が従来どおりフォールバック、
                                    `source()` がどちらが答えたかを返す（`fld.stats.coastSource`）。
                                    ⚠ (#R250) **グリッドは正方でなくてよい**——`rasterize({…,nx,ny})`。遠方ラスタの格子は
                                    窓の形に従う `nx × ny` なので、`N` は「正方の省略形」になった（細密場は `N` のまま）。
                                    読み出しは**帯単位**（一度に約400万画素）＝10M セルの格子でも中間 ImageData が
                                    呼び出し側の 40 MB の隣に 40 MB 積み上がらない。
                                    ⚠ **遠方場も利用者になった**——このモジュールが書かれた時、遠方ラスタのセルは
                                    本当に 28〜52 km で、19.6 km の方が細かかった（上の行はそう書いてある）。
                                    #R248/#R249 がそのセルを 1.17 km にしたので、同じ 19.6 km の階段が
                                    **1,500 km の外側だけに**再出現していた。
  vs30-mask.js                      (#R223) **同梱の場址項 `IntMapVs30`**。`data/vs30.png`（1440×720＝**0.25°**・8bitグレー・
                                    **239 kB**）は各セルの**陸地部分の平均 Vs30**（0＝陸の標本なし、1..255＝150〜1500 m/s の線形）。
                                    `warm()` で1回だけ復号し `at(lng,lat)` が m/s を返す。⚠ **代替であって答えではない**：
                                    DEM が話せる場所（震度の微細場＝1.5 km セル）では DEM が先に話し、これは
                                    **単一の場址分類しか無かった場所**（遠方場の28 kmセル・タイルが届かなかったセル・
                                    勾配基線が2 kmより粗いセル）でだけ使われる。それが 3ラウンド続いた
                                    「震度分布が同心円になる」の最後の扉だった。生成は `scripts/build-vs30.mjs`
                                    （terrarium z7＝**1,223 m** で Wald & Allen 2007 の同じ表を評価し、**換算してから**セル平均。
                                    海だけのタイルは同梱の海陸マスクで飛ばすので取得は 16,384 枚中 8,089 枚）。
  ocean-currents-field.js           (#R222) **流向の場の復号と間引き `IntMapCurrentField`**——`data/ocean-currents-*.bin.gz`
                                    （`IMOC1`：16Bヘッダ＋面ごとに 速さ1B・方位1B の規則格子）を `DecompressionStream('gzip')`
                                    で展開し、`arrows(field, plane, box, cap)` が**表示範囲と上限から stride を決めて**
                                    GeoJSON の点を返す。⚠ 1マークは**ブロックのベクトル平均**（方位の数値平均は 350°+10°=180°）。
                                    ⚠ 速さは平方根量子化（低速側 0.05 cm/s）。⚠ DOM もレンダラも読まない純モジュールなので、
                                    `tests/r222-checks.test.mjs` が Node で stand-in window に評価して契約を検査する。
                                    ⚠ (#R224) 海流レイヤーは**1つになった**。`js/data-layers.js` の #R208 版（Oceans & maritime の
                                    行）は削除され、`js/ocean-currents.js` だけがこのファイルの読み手である。
  place-labels.js                   ⚠⚠ (#R225) **地政学レイヤー一族はこのファイルに住んでいて、消えた。**
                                    「大昔に捨てたはずの地政学レイヤーが勝手にオンになる。ふざけるな。」
                                    →（確認済）**レイヤー自体を削除**。`buildGeoFC` / `ensureGeoLayers` /
                                    `updateGeoLayers` / `localizeGeoLabels` / `GEO_LABEL_FALLBACK` は
                                    Strategic geography・Strategic networks の9レイヤーを描き名付けるためだけに
                                    存在し、その幾何は `js/tables.js` の `geoLayersDB` だった。**一族はまとめて
                                    消す**——データを消して機構を残すのは、退役した機能が戻ってくる道である(#R220)。
                                    このファイルに残るのは **PLACE ラベル**（ファイルを共有していた別主題）。
                                    ⚠⚠ **そして「読む側」を止めるのが本体だった**：`js/map-ui.js` の `restore()` が
                                    URLハッシュの `l=bri,…` を **`data-layer` で解決**していたことが「勝手にオン」の
                                    実体で、**書かなくなるだけでは足りない**（何か月も前のリンクは今も運んでいる）。
                                    退役した鍵は**読まれなくなる**必要がある＝id しか解決しない。
  ocean-currents.js                 ⚠ (#R224) **この app にある唯一の海流レイヤー**（「二つあるなんていうややこしいことするな。
                                    統一しろ。」）。#R208 の Oceans & maritime 版は行・描画・凡例・レイヤーIDごと削除し、
                                    保存セッションの `dl-oceancur` は `js/session-tabs.js` の `RETIRED` 表で
                                    `wp-dl-currents` へ**一度だけ**移行する。入口は World data の 🌊 ひとつ。
                                    (#R219 データ／#R220 描画) **世界の海流 `IntMapCurrents`**——**同梱の固定データを常時描画**する
                                    レイヤー。`world-packs.js` の `_ui` ツールキット（`makePanel` / `row` /
                                    `whenDrawable` / `setVis`）を借りる6番目の「世界のデータ」レイヤーで、
                                    自前の窓は持たない。
                                    ⚠ **通信はゼロ**：すべて同梱ファイル（`scripts/build-ocean-currents.mjs` がオフラインで作る）。
                                    (#R221 でデータ全面再構築／**#R222 で本数・解像度・季節を増強**)
                                    **108本**の名前つき海流の**経路**（場を積分して辿ったもの・描き写しではない）＋5言語の名称は
                                    `data/ocean-currents.json`（159 kB）。
                                    ⚠⚠ (#R222) **流向の場はもう「矢印の一覧」ではない**——`data/ocean-currents-field.bin.gz`
                                    （**提供元と同じ 0.25° の規則格子**・1,440×720・速さ1バイト＋方位1バイト・**466,007セル**が
                                    流れを持つ・gzip 866 kB）。読むのは `js/ocean-currents-field.js`（`IntMapCurrentField`）で、
                                    **間引き（stride）はクライアントが表示範囲から決める**：表示を N_max 個以内で埋められる
                                    最も粗い間隔（携帯 4,200／その他 9,000）。結果、**画面上の矢印数はどのズームでもほぼ一定**で、
                                    #R221 の 28,208 点より**少ない**のにデータは16倍細かい（1セル＝ブロックの**ベクトル平均**）。
                                    ⚠ (#R222) **季節**：`data/ocean-currents-months.bin.gz`（0.5°×12面・各暦月6年平均・gzip 3.0 MB）。
                                    パネルの「年平均／1〜12月」チップで切替え、**月を選んだときだけ**取得する。
                                    各海流は12か月分の流速と、その月の流れを**自分の経路方向へ射影**した平均を持ち、
                                    符号が変わる海流（モンスーン系）は一覧に ⇄ が付く。⚠ 経路は月ごとに引き直さない。
                                    場は**気候値**——提供期間全体に散らした28枚の平均を、提供元の **0.25° 格子のまま**——で、
                                    NOAA CoastWatch の複数衛星高度計ブレンド（地衡流）＋ NOAA NCEI 海上風応力から
                                    Ralph & Niiler (1999) の漂流ブイ実測式で足したエクマン流。
                                    ⚠⚠ **暖流/寒流/東西流は導出ではなく実測**：その海流自身の海面水温（NOAA OISST v2.1）と
                                    **同じ緯度の帯平均**との差を、種からの経路距離で重み付けした平均（±0.6 K 以内は灰色）。
                                    ⚠ トレーサは**閉じた短い経路（＝渦）を棄却して種を振り直す**。矢印は濃さと大きさで実測流速。
                                    ⚠ 平均場なので**時計には追随しない**（パネルがそう書く）。
                                    ⚠⚠ (#R220)「クオリティがゴミ」——**描画のラウンド**（データは1バイトも触っていない）。
                                    実測：z2 で縁取りの無い 1.0〜3.9 px、z4 の北大西洋では矢印も名前も1つも読めず、
                                    5,484本の場は `icon-opacity` 0.55 の白 SDF で海に溶けていた。地図帳の図版が
                                    読めるのは**どの印にも縁があるから**。→ 8レイヤー
                                    (`FLOWC/FLOW/GLOW/CASE/LINE/HEADC/HEAD/LBL`)：すべての印に**ケーシング**、
                                    名前つき海流は glow＋casing＋色の帯、矢頭は約2倍、名前は15%大きくハロー付き。
                                    場の印は尾のある **dart**（`oc-dart-img`）で、**大きさでも**実測流速を表す。
                                    色は両ベースマップで測って選び直した（暖 `#ff5b41`／寒 `#38b6ff`／東西 `#c9d1d9`）。
                                    ⚠ 再計算は1つも増えていない——全部スタイル式。
                                    以下は #R216/#R218 の記録（現在の実装ではない）——
                                    **数値は一切同梱しない**：速度場は Open-Meteo Marine の
                                    `ocean_current_velocity` / `ocean_current_direction`（向きは「水が向かう方位」で、
                                    黒潮 35N/141E→39°、アガラス 35S/20E→250° の実測で確認）。
                                    ⚠ (#R218) **描くのは矢印ではなく流線**（「ちゃんとレイヤーとして描画しろ」）：
                                    表示範囲を覆う格子（最大150点・**1リクエスト**、陸は同梱マスクで除外）を
                                    `js/streamline.js` が連続な場に補間し、各シードから**4次RKで前後に積分**した
                                    線を `line` レイヤーで描く（太さ＝流速、`symbol-placement:'line'` の矢印＝向き）。
                                    シードは **Jobard & Lefer (1997) の等間隔則**で間引き、線は海岸・格子の端・
                                    モデルに値の無い所で止まる。**暖流/寒流は判定ではなく計測**——各線の海面水温を、
                                    **その流路に沿って**約110 km**上流**の水温と比べ、上流が暖かければ暖流（赤）、
                                    冷たければ寒流（青）、差が 0.25 K 未満なら**どちらでもない（灰）**とする。
                                    名称は Wikidata の `wdt:P31/wdt:P279* wd:Q129558`（ocean current）＋`P625`——
                                    実測 209件・5言語ラベル・CC0。矢印は SDF アイコン1枚を `icon-color` で着色する
                                    （暖・寒・中立で画像を分けない）。⚠ SDF は**右向き**に描く：`symbol-placement:'line'`
                                    はアイコンの +x を進行方向として線に沿わせるので、上向きだと全頂点で90°ずれる。
  tsunami.js                        (#R192, #R193 で全面再構築) **津波伝播 `IntMapTsunami`**——パネル・震源・描画・
                                    再生。**時間積分そのものは `src/tsunami-worker.js`**（ワーカー）にあり、
                                    フレームは**できた側から流れてくる**のでページは一切止まらない。水深は terrarium
                                    DEM、初期条件は **Okada 1985** の海底鉛直変位を**テーパー付き小断層 8×3 の
                                    重ね合わせ**で（断層寸法 Wells & Coppersmith 1994、走向は局所的な海底勾配から）。
                                    描画は**動的画像プリミティブ**（下記）でエンコーダを経由せず、再生は格納フレーム
                                    間を補間する。最大波高場・**到達時間の等値線（1時間ごと）**・海上クリックでの
                                    地点読み取り・グリーンの法則による沿岸波高。格子は数十kmなので**外洋モデル**で
                                    あり、最後の1 kmは `js/sims.js` の浸水モデルへ引き渡す。
                                    ⚠ (#R223) **どこに時間が行っているか**（実測 M9・東北沖・6時間・全球0.25°）：
                                    `seaFloor` まで 44 ms、Okada の初期変位 0.6〜0.9 s（**3,954,630 回**）、モデル送出 0.7 s、
                                    そのあとの求解が 16〜21 s。**モデル構築は1秒未満**で、求解は 872 ステップ×92万セル×3ループ
                                    ＝24億セル更新／16 s ＝ 1回 7 ns、つまり**1コアの下限に近い**。`okadaUz` は式も順序も
                                    変えずに**呼び出しごとに繰り返していた仕事**（走向傾斜の三角関数・4隅で4回計算していた
                                    `q`・クロージャ生成）だけを外した＝答えはビット単位で不変（Okada 1985 の公表テストケースを
                                    tests/r197 と tests/r223 が再実行）。極フィルタは**波が届いた緯度円だけ**、フレームの
                                    間引きは**光円錐の行だけ**を読む（どちらも恒等：η が恒等的に0の行は M も0で、0の移動平均は0）。
                                    ⚠ **次の一手はワーカー並列**（緯度帯分割＋MessageChannel でハロー交換）。
                                    極フィルタが緯度円全体を要求するので、分割は緯度帯でなければならない。
  insolation.js                     (#R176) **地形の影と年間日照 `IntMapInsolation`**（UI は既存の Sun & shadow パネル）。
                                    影は**太陽順に1回なめる掃引**（`S=max(z,S)(手前)−Δ·tan(高度)` の漸化式）で
                                    `O(N²)`。地点解析は DEM を 360 方位に 25 km 行進して（**地球曲率＋大気屈折**込み）
                                    地平線プロファイルを1回だけ作り、1年 52,560 個の太陽位置をそれと比べる:
                                    年間日照時間・地形が奪った割合・冬至/夏至/春分・終日日照ゼロの日数・
                                    発電可能時間・快晴時直達日射（Kasten & Young の大気路程）。
                                    **冬至の影**は当日を15分刻みで掃引した「一度も日が当たらないセル」の和。
  layer-packs.js                    (#R166) レイヤーパック 6本（レイヤーパネルへ行を追加する自己完結ブロック）。
                                    地球・大気・空域（ダム/火山/オーロラ/ADIZ）`IntMapLayers9`・土地被覆
                                    /エコリージョン/プレート・ベータパック2 `IntMapBeta2`・宗教/言語コロプレス・
                                    実タイムゾーン境界＋現地時刻・NASA GIBS 科学ラスター。91KB
  analysis-panels.js                (#R166) 解析パネル 5本。時系列チャート `IntMapTimeSeries`・AIリサーチ
                                    `IntMapAIResearch`・2レイヤー相関/散布図・世界史イベント年表・地理クイズ
                                    `IntMapEdu`。95KB
  wx-source.js                      (#R183) **気象・UVの唯一の取得口** `window.IntMapWx`。ファクトリでは
                                    なく即時公開なので `src/main.js` の先頭付近で読み込む（必須グローバル
                                    チェックにも `IntMapWx` を追加済み）。`point()` が
                                    Open-Meteo →（不可なら）MET Norway の梯子を1本にまとめる。中身は
                                    (a) `r.ok` と Open-Meteo 自身の `{"error":true}` の両方を検査、
                                    (b) **サーキットブレーカー**＝「1日の上限」429 はその日いっぱい続く事実
                                    なので再要求せず 00:00 UTC まで fallback 直行（localStorage 保存）、
                                    (c) URL 単位の合流＋TTLキャッシュ、
                                    (d) 日の出・日没は**ネットワーク非依存の計算**（`sunTimes`）。
                                    単位の正直さ: Open-Meteo の `uv_index` は全天、MET は
                                    `ultraviolet_index_clear_sky`＝**別の量**なのでフィールドを分ける。
                                    MET は現在時刻から先しか無いので初日バケットに `_partialFirstDay`。
  weather.js                        (#R166) 気象 3本。風の粒子アニメーション `Wind`・予報パネル
                                    `IntMapWeatherEC`・地点天気 `IntMapWeather`。52KB
                                    (#R183) 取得の梯子は自前で持たず `IntMapWx.point()` に委譲
                                    （MET マッピングの二重持ちが #R72 の修正を widgets へ渡らなくした原因）
  playground.js                     (#R166) プレイグラウンド（beta）。World Explorer／パンデミック／ネーションシム。
                                    48KB。**2番目の READ-WRITE ホストメンバー利用モジュール**
                                    （`mode`＝`currentMode` と `satPanelDismissed` を setter 経由で書く。§3.1 #R166）。
                                    cameras と同じく `window.*` を公開しない（入口は `window._openPlayground`）
  ── 以下 (#R167) の8本（第6弾・270KB／2,101行）。**2つの継ぎ目**で出した（§3.1 #R167）：
     ①純データ（tables.js＝ファクトリ無し・index.html は名前を束縛し直すだけ）
     ②残りの自己完結ブロック（15ファクトリ・すべて元の位置で呼ぶ）─────────────
  tables.js                         (#R167) **純データ 27表**（`window.IntMapTables`）＋`window.SEA_LABELS`。91KB。
                                    国別統計（GDP/HDI/民主主義指数/軍事費/平均寿命/ネット普及率/首都/通貨/言語）・
                                    DE/RU/ES の地名＋デモニム表・媒体辞書 `sourceDict`・地理レイヤーカタログ
                                    `geoLayersDB`・衛星プロバイダ・ニュース版・半径プリセット・企業セクター表 等。
                                    **一度も変更されない**ことをASTで検証済み（tests/r167-checks #3）＝値渡しで安全。
                                    index.html 側は `const {GDP,HDI,…}=window.IntMapTables;` と束縛し直すだけ
  legal.js                          (#R167) 利用規約・プライバシーポリシー（EN/JP）とそのモーダル。29KB
  feedback.js                       (#R167) フィードバックモーダルと不具合レポータ（診断スナップショット `_imDiag`）。19KB。
                                    **`HOST.DB` は使用時に読む**（`const DB` は呼び出し位置の約1,300行下＝
                                    ファクトリ時点で束縛するとTDZに落ちる。§3.1 #R167）
  onboarding.js                     (#R167) ようこそカード・ガイドデモ・共有の進捗コントロール `window._imProgCtl`。19KB
  mobile-ui.js                      (#R167) `initMobileUI()`（ボトムシート・FAB列・モバイルタブバー）＋
                                    レスポンシブ配置3本（検索バーの折返し・サイドバー幅・デバイスクラス）。32KB。
                                    **戻り値を束縛する唯一のファクトリ**（index.html は末尾で `initMobileUI()` を名前で呼ぶ）
  news-timeline.js                  (#R167) 地図下のニュース時間軸（年/日付/時刻モード・スクラバ・同期バッジ）。18KB。
                                    **RWホストメンバー2つ**（日付が変わると記事集合ごと入れ替わるので
                                    `globalData`/`newsFeatures` を setter 経由で書く）
  dash-extended.js                  (#R167) `window.IntMapCache`（IndexedDB の共有KVストア）＋拡張ダッシュボードカード。21KB。
                                    **RWホストメンバー1つ**（`extendedDashDB`）。※#R139 で情報ダッシュボードは
                                    Companies に置き換わったため、この書き込みに現在は画面上の帰結が無い
                                    （挙動同一を保つため残置。`IntMapCache` の方は beta-overlays / stats-compare /
                                    滑走路検索が実際に使う）
  map-extras.js                     (#R167) 地図面に残っていた小さな `window.*` モジュール 7本。現在地追跡
                                    `IntMapLocate`・注記 `IntMapAnnotations`・レイヤーホバーのポップアップ・
                                    レイヤー検索・滑走路検索 `RunwaySearch`・DEMサンプラ `IntMapTerrain`・
                                    鉄道/海図ラスターオーバーレイ。42KB
  ── 以下 (#R168) の6本（第7弾・224KB／2,018行）。**主題（SUBJECT）単位**で切った初めての回（§3.1 #R168）。
     すべて `(map, IM_HOST)` ファクトリで、`map` 生成直後の1か所でまとめて生成し、
     **index.html が名前で呼び続ける関数には巻き上げシムを残す**（これも初めて）─────────────
  countries-ui.js                   (#R168) Countries タブの主題。国境/統計ローダ `loadCountryData`（Natural Earth 10m→
                                    50m→110m）・地図の国レイヤー `addCountryLayers`・順位付き国リスト `renderStats`・
                                    国カードと詳細本文・Wikipedia 概要キャッシュ。38KB／15文。
                                    シム5本（renderStats/showCountryDetail/renderCountryDetailBody/
                                    loadCountryData/addCountryLayers）。RW 3（countryGeo/countryDataLoaded/
                                    countryDataPromise）
  news-ui.js                        (#R168) ニュースの**表示層**。地図の news/dash レイヤー構築 `setupIntelLayers`・
                                    重なりピンの分散 `_spreadDupNewsPins`・フィード描画 `renderUI` と遅延バッチ
                                    `appendNewsBatch`・記事リーダー（AI翻訳込み）・AI地点付与 `aiGeocodeNews`。49KB／17文。
                                    ニュースの**データ経路**（取得・キャッシュ・絞り込み）は index.html に残る。
                                    シム6本。RW 3（bookmarks/renderedCount/newsFeatures）
  companies-ui.js                   (#R168) Companies タブの主題。企業リストと詳細カード・複数社比較シート
                                    （棒/表/CSV/時系列）・ロゴ取得と描画・旧ダッシュボード描画。55KB／36文。
                                    シム5本。RW 3（dashFeatures/_coTimeDeb/_coTimeWired）
  tool-panel.js                     (#R168) 計測/半径/面積ツールのパネル `updateToolPanel`・その地図フィーチャ生成
                                    `buildToolFeatures`・地図右クリックのコンテキストメニュー `showContextMenu`。30KB／8文。
                                    シム3本。RW 7（measurePoints/radiusColor/radiusKm は #R165 で既存＝
                                    Atlasカーネルとの**共同所有**、radiusOpacity/toolMode/communityAddArmed/
                                    pendingPostLoc が新規）
  auth-ui.js                        (#R168) アカウント関連すべて。認証モーダル・アカウントメニュー・パスワード強度と
                                    HIBP 漏洩照合・パスキー・パスワード設定フロー・お気に入り読込・Realtime購読・
                                    `bootSupabase()`。59KB／15文。シム3本。RW 3（user＝`currentUser`/bookmarks/geoRaw）。
                                    `currentUser` は index.html に宣言が残る唯一の真実の源で、書き込みは setter 経由
  community.js                      (#R168) コミュニティフィードの描画とリスト配線＋コメント/投票/通報のミューテーション。
                                    12KB／11文。シム2本。RW 7（commCatFilter/commInView/commSearch/communitySort/
                                    replyingTo と、tool-panel と**共同所有**の communityAddArmed/pendingPostLoc）

  ── 以下 (#R169) の11本（第8弾・192KB／index.html から −1,947行・−155KB）。**切り口が違う**：主題ではなく
     「**宣言だけの文**（関数・表）」を集めた＝ファクトリは何も実行しないので、11本まとめて
     `map` 生成直後に生成でき、index.html には巻き上げシムだけが残る（§3.1 #R169）─────────────
  satellite.js                      (#R169) 衛星画像のコントローラ（プロバイダ表・BYOK鍵・日付ステップ・
                                    二重バッファのクロスフェード・タイル/認証エラー時の自動フォールバック）。19KB
  ── 以下 (#R196) の4本。うち2本は index.html 分割の第10・第11弾（`js/app-body.js` −221行・8,363→8,171行）───

  geodesy.js                        (#R196 で `js/app-body.js` から111行そのまま分離／中身は #5/#6/#25)
                                    **日付変更線・極を跨いでも壊れない幾何 `IntMapGeodesy`**——測地線の
                                    到達点、大円の連続経度サンプリング、Sutherland–Hodgman による ±180° での
                                    切断、極冠の付与、対蹠側の補集合、`diskFillPolys`/`diskOutlineLines`/
                                    `sanitizeFeatures`。**DOM もレンダラもアプリ状態も `window` も読まない純関数**
                                    なので、シェルから借りている値は**0**（分割の証明が最も簡単な種類の主題）。
                                    ブラウザ抜きで検証できる唯一のシェル由来コードでもあり、
                                    `tests/r196-checks.test.mjs` が Node で反日付変更線の挙動を直接叩く。
                                    ⚠ `js/app-body.js` 側の再束縛は **`const` ではなく巻き上げ関数宣言**——
                                    5つは tool-panel / seismic / dash-extended / atlas-console が
                                    **ファクトリ時点で** IM_HOST 経由で束縛するため（#R167 のデッドゾーン規則）。
  tile-warm.js                      (#R196 で `js/app-body.js` から110行そのまま分離／中身は #R8–#R151)
                                    **タイルの先読み `IntMapModules.tileWarm`**——sw.js の永続タイルキャッシュ登録と、
                                    進行方向のリング・ピンチ2段先・（飛行中は）機首方向の深いリングを温める
                                    予測プリフェッチ。URL も画質設定も一切変えない（描画経路が要求する予定の
                                    タイルを先に取るだけ）。⚠ **#R196 で「一度頼んだURLは二度と頼まない」記憶を持つ**
                                    （下記 §19 の実測）。⚠ 呼び出し位置は動かせない——`moveend`/`move` ハンドラの
                                    登録順がシェルの他のハンドラに対して観測可能。借りている値5つは全て IM_HOST 経由。
  limb-layer.js                     ⚠⚠ (#R227) **地球の縁（リム）を、このアプリ自身が描く custom レイヤー。**
                                    `IntMapModules.limbLayer` → `IntMapGeoEngine.layers.addLimb/setLimb/
                                    removeLimb/hasLimb`（js/solid3d.js・js/orbit-points.js と同じ形＝
                                    MapLibre アダプタの実装詳細で、外から触れるのは geo-engine だけ）。
                                    **なぜ在るか**：maplibre の sky パスは最後に
                                    `mix(fragColor, vec4(vec3(0.0),0.0), u_sky_blend)` をやり、`u_sky_blend` は
                                    `projectionTransition = _globeness`＝**globe では 1**。つまり地球を丸く描いて
                                    いる間、`sky-color`/`horizon-color`/`sky-horizon-blend` は**1バイトも描かれない**。
                                    #R196〜#R226 が計算したリムの色は全部スタイルまでしか届いていなかった。
                                    実際のリムは maplibre 自身の `atmosphere.fragment.glsl`＝**視線5ステップ・
                                    太陽3ステップ・オゾン無し・多重散乱無し・青のレイリー 22.4e-6（正しくは33.1e-6）**。
                                    **中身**：js/sky-model.js と同一のモデルをフラグメントシェーダで行進する
                                    （N=128・#R224 の歪めた求積・オゾン・多重散乱）。係数は**すべて uniform**で、
                                    太陽光線は `sunOpticalDepth` を 128×64 のテクスチャに、多重散乱は
                                    `skyColour` の 16×24 表をそのまま上げる＝**シェーダは物理を一つも書かない**。
                                    幾何は maplibre 自身の `inverseProjectionMatrix` と「視点空間での地球中心」から
                                    取るので、ピッチを付けてもズレない。
                                    ⚠⚠ **(#R237) 地球に当たる光線も行進する——これが「消えていた大気」の正体。**
                                    #R227 は円盤に当たる光線を `discard` し、理由を「ガンマ空間のフレームバッファに
                                    トーンマップ済みの内部散乱を足すと明るくなりすぎる（実測: 外洋 #013a4c が
                                    #588bc1 で出た）／線形のオフスクリーン標的が要る」と記録して次回送りにしていた。
                                    **同一カメラ・同一レイヤーでの実測**（外縁から内側へ）:

                                        外縁からの距離   #R227（リムのみ）   maplibre 自身のパス 0.55
                                        −16 px              33,103,118           88,166,186
                                        −10 px              19, 72, 86           88,151,171
                                         −6 px             102,146,175          183,207,223

                                    maplibre のパスは**円盤全体**を照らしていた（輝度でほぼ2倍）。#R227 がそれを
                                    `atmosphere-blend:0` で切り、代わりに置いたのは**惑星の外側だけの幅4 px の帯**
                                    （100 km ÷ 6,371 km ＝ 半径の 1.57%。半径236 px なら 3.7 px）。つまり
                                    「昼側の空気が描かれなくなっていた」のが利用者の報告そのもの。
                                    **線形標的は要らなかった——トーンマップは全単射である。** 背景を
                                    `copyTexSubImage2D` で読み、`L = −ln(1 − c^γ)/exposure` で放射輝度へ戻し、
                                    そこで `L_bg·T + L_in` を合成して**最後に一度だけ**トーンマップする。空気が
                                    無ければ往復は恒等写像なので、このパスは何も言うことが無い画素では no-op。
                                    合成するのでブレンドは**切る**（`gl.disable(gl.BLEND)`）——#R227 が3チャンネルの
                                    消散を1つの輝度アルファに畳んでいたのは背景が読めなかったからで、両方とも解消。
                                    ⚠⚠⚠ **(#R238b) 上の #R238 の読みは間違っていた。** 円盤が暗かったのは
                                    自前リムが弱いからではなく、**#R227 が `atmosphere-blend` を 0 にして
                                    いた**から。R226 との関数単位の差分で確定：`_horizonColour` /
                                    `_skyColour` / `_limbHex` / `_horizonBlend` / `_eyeAltM` は**完全一致**。
                                    #R213〜#R222 の帯は失われておらず、それを画面へ運ぶ唯一の項が
                                    消されていた。ランプを戻し、**円盤側の強度は #R237 の 0.20 へ戻した**
                                    （帯＋1.0 は円盤の5%が L235 超で太平洋の階調が飛ぶ。帯＋0.20 は 2.7%）。
                                    以下は #R238 の記録（経緯として残す）。
                                    ⚠⚠ (#R238) 円盤側の強度は 1（定数は消した）。 #R237 の 0.20 は
                                    **戻す相手と一度も比べられていなかった**。同一ページ読み込み・同一カメラ・
                                    同じタイルで、円盤の 0.30R/0.75R/0.97R の平均輝度を `render` の中で読むと:

                                        強度            0.30R    0.75R    0.97R   リム÷内側
                                        maplibre 自身   137.1    138.7    151.2    1.103   ← 前まであった大気
                                        0.20 (#R237)     103.9    101.2    112.5    1.083   ← 報告
                                        1.00 (#R238)     133.4    140.1    164.2    1.231   ← 現行

                                    どのリングでも 25–27% 暗く、目が「空気」と読む**リムへの勾配を潰していた**。
                                    1 は「一番良かった値」ではなく `mix(bgL, bgL·T+L, 1)` = 合成そのもので、
                                    **ここにはもう採れる数字が無い**。実測: 3基盤地図とも良好で、
                                    **ライトがもっとも動かない**（内 163.8 → リム 192.2、比 1.173）。
                                    以下は #R237 の記録（経緯として残す）: 円盤側の強度は **0.20**（`_discStrength`）。#R187/#R205 の 0.55/0.80/0.15 は
                                    **加算項の**強度であって合成項のそれではなく、そのまま流用した最初の版では
                                    #R187 の「白い太いカラー＝チープ」がそのまま再現した（アフリカの赤が桃色に）。
                                    0.10/0.20/0.35 を撮って 0.20。**基盤地図ごとに分けていない**のは、明るい背景は
                                    逆算すると大きな放射輝度＝トーンマップの平坦部に落ちるため、#R187/#R205 が
                                    戦っていたクリップが**定数でなく構造として**消えたから。
                                    ⚠ 円盤側の行進は `DISC_N=24`（接点が無く経路が短い。**推論であって実測ではない**）。
                                    ⚠⚠ **CPU ラスタライザには出さない**（ が
                                    SwiftShader/llvmpipe/WARP と名乗る文脈）。実測: 拒否ゲート無しでは
                                     まで 10.7 s → **46.5 s**（4.4倍）。実 GPU では逆に軽い。
                                     で強制（自動化できるブラウザは全部ソフトウェアなので、
                                    無いと描いた帯を検査できない）。⚠ **拒否は「意図」でなく「結果」で
                                    伝える**——最初の版は拒否された文脈で maplibre の大気も消し、
                                    大気がまったく無い地球を描いていた。
                                    ⚠⚠ **#R228: タッチ端末にも出さない（実測が済むまでの保留）。** #R227 の
                                    測定（4.7 ms 対 5.1 ms）は**デスクトップ GPU 1台だけ**で取ったもので、
                                    携帯は一度も入っていない。行進は**1フラグメントあたり 2×128＝256 ステップ**、
                                    iPhone は devicePixelRatio 3＝**393×852 が 1179×2556＝300万フラグメント**
                                    （測定時の 2.3倍）、しかもモバイル GPU はタイルベースで**フィルと帯域**が
                                    律速——このシェーダが最も重く載る軸そのもの。利用者の報告
                                    （「重いどころの話じゃない…機種でどうとか言ってる場合じゃない」＝
                                    iPhone/iOS Safari）が**このレイヤーが入った翌日**なので、実測まで外す。
                                    判定は **#R225 の規則どおりポインタに訊く**（`(hover:none) and
                                    (pointer:coarse)`＝向きに依らず携帯/タブレットで真、タッチ対応ノート PC で偽。
                                    幅で訊くと狭いデスクトップ窓で消えてしまう）＋ iPadOS がデスクトップを
                                    名乗るので UA と `maxTouchPoints` を併用。⚠ **`?limb=1` は依然として有効**
                                    ——これは判決ではなく保留で、携帯での実測はこの旗で取る。
                                    ⚠⚠ **(#R237) 実測を試みたが結論は出ていない。** 利用者の回答は
                                    「実測して、軽ければ携帯でも描く」。1179×2556 の描画バッファで
                                    `map._render` を計測したが、SwiftShader 上の数字が**整合しない**
                                    （リムのみ 37 ms に対しリム＋円盤 6.2 ms＝**重い方が速い**）。
                                    比が信用できない以上「軽い」とは言えないので**保留は解いていない**。
                                    実 GPU を積んだ実機での測定が要る。
                                    拒否されても maplibre 自身の大気は残る（`_applyLimb()` が「実際に入ったか」を
                                    返すので `atmosphere-blend` は触らない＝#R227 の「結果で伝える」規則）。
                                    ⚠⚠ **(#R237) 出る条件から「視点が殻の外」が外れた**——それが
                                    「ある程度までズームインすると途端に見えなくなってしまう」の機構だった。
                                    ズーム掃引の実測で所有権は **z9（視点183 km）と z10（視点92 km）の間**で
                                    maplibre 側へ移り、移った先は幅2 px・輝度14 の帯。つまり**特定のズームで
                                    1フレームのうちに空気が消えていた**（#R234 は同じ報告を「問い方のタイミング」
                                    と読んで問いを連続にしたが、**答え**は崖のままだった）。殻の内側では光線が
                                    空気の中から始まるだけで、同じ ray-sphere 解が `tIn=0` を返す＝特別扱い不要。
                                    今の門は **`globeness`**＝maplibre が自分の大気に掛けている当の量なので、
                                    2つの所有者が「地球が丸いか」で食い違うことは構造的に起きない。
                                    出るのは **globe かつ太陽位置が既知**のときで、そのとき `atmosphere-blend` は 0
                                    （maplibre のパスは全レイヤーの**後**に描かれるので、上から描くことはできない）。実測 `map._render` 中央値 4.7 ms／p90 7.9 ms
                                    に対し maplibre のパスは 5.1／11.0＝**むしろ軽い**。
  sky-model.js                      ⚠ (#R227) **太陽光線の積分は `sunOpticalDepth` 一本になった**——`radiance` の
                                    内側ループがこれを呼び、GPU の表もこれで作る（同じ積分を二度書かない）。
                                    ⚠ 影の判定は**地平の角度**で行う（近い根が正か、では h=0 でちょうど破綻し、
                                    地表の点が「太陽が20°下でも日向」と答える）。`skyModelTables()` が定数と
                                    多重散乱表を返し、js/theme-sky.js が `window.IntMapSkyModel` として公開する。
                                    ⚠⚠ (#R226) **リムが藤色だったのも求積だった——ただし #R224 が測ったのと別の光線で。**
                                    #R224 は**地上の光線**（海面・1°〜55°）を収束テストして N=32 に落ち着いた。
                                    宇宙のカメラが**縁**を見る光線は逆で、約2,200 kmの空気のほとんどが接点付近に集中する。
                                    実測（24,422 km・接線6 km＝`horizon-color` の出所・太陽+80°）：
                                    N=32 **#d3c7d4（藤色）**／N=64 #d5cddf／N=128 #d7d1e5／**N=256 #d7d3e8（淡青）**
                                    ＝N=512,M=48 の基準と一致。**青が20カウント足りない**＝淡青の襟と桃色の襟の差。
                                    実機の出荷版は globe 24,422 km で `horizon-color`=**#cebfce**（藤鼠の輪）だった。
                                    → `N = 32 → 256`。⚠ 太陽光線側 M は原因ではない（8/16/32 でバイト一致）ので不変。
                                    ⚠ 地上の光線は #R224 を覆さない（正午 #99aab4→#9badb8、日没 #6a523e→#695240＝2カウント）。
                                    ⚠ 値段 0.070→0.175 ms/呼・カメラ静止ごとに4回＝0.7 ms。毎フレーム描くものは無い。
                                    ⚠⚠ (#R224) **地平の灰緑は物理ではなく求積だった。** #R223 は視線3°で #93a394（G が R も B も
                                    上回る）を測り、原因を「単散乱＋灰色ミー＋長光路」と書いて多重散乱の再校正を宿題にした。
                                    症状の測定は正しく、原因は違った——**収束テスト**で決着：同じ定数のまま標本を増やすと
                                    視線1° は N=16 の #878967（オリーブ）から N=1024 の #9dafb8（淡青）へ**収束する**。
                                    16個の**等間隔**標本は、3°で全長250 kmの視線の最初の標本を7.8 km上空に置き、
                                    **目の前の濃い空気を一度も見ない**。→ 標本を**視線の最下点**（殻の中の目／宇宙からの接線点）
                                    から幾何級数で分配し（`t ∝ (e^{7x}−1)`、必要なら最下点で2分割）、N=32。
                                    実測：海面〜5,286 km・太陽+60°〜−4°の10ケースで**最大誤差 81→3 カウント**、0.023→0.034 ms/呼。
                                    ⚠ 標本は `[t, dt]` の組を作って **t の昇順に**行進する（それまでの光学的深さが次の標本を
                                    減衰させるので、順序を崩すと空が逆側から光る）。
                                    ⚠ 帰結として **js/theme-sky.js の「太陽+6°より上ではモデルの色相を使わない」も撤去**した
                                    （#R213 がそれを置いた理由がこのオリーブだったから）。重みは太陽高度ではなく
                                    **モデル自身の輝度**（`lm/12`）——色相が無意味なのは真っ黒に積分されたときだけである。
                                    昼の帯は #R196 の実測輝度のまま**淡青**（#b9ceda）、+6°で金、+2°で橙になる。
                                    (#R202) **空そのものの色 `skyColour(sunElev, camAlt, relAz)`**——Rayleigh+Mie
                                    ⚠⚠ (#R222) **視点は大気圏上端にクランプされていた**（`Math.min(RT-RG-1, alt)`）ので、
                                    軌道上のカメラは「高度100 kmで真空を見ている」ものとして解かれ、**宇宙から見た大気の色を
                                    答えられなかった**。→ ①クランプを外し、②行進を**視線が殻に入る点〜出る点**に限る
                                    （殻の中では入射根が負＝t0=0 で従来と同一）。③ `limbViewElev(camAlt, tangentM)` を追加——
                                    接線高度から視線俯角を返す純関数で、これが**リム（大気を横から見た視線）**の入口。
                                    実測（5,286 km・接線6 km）：太陽60° #b2b8d8／0° #836d89／−12° #0a0403。
                                    ⚠⚠ (#R221) **ミー散乱の内向き寄与が3チャンネルとも「緑の減衰」で積算されていた。**
                                    ミーの散乱**係数**が灰色なのは正しいが、そのあと通る**透過率**はレイリー(λ⁻⁴)と
                                    オゾン吸収で1桁違う。地平をかすめる視線でミーが支配する場所に、中立の霞が注入されて
                                    昼の地平が灰緑(#b6c3b6)、夕焼けがオリーブ(#705e3c)になっていた。→ ベクター化。
                                    実測：太陽2°・太陽方向 #705e3c → **#fdd45f**（#R202 の Cesium 較正点は保持）。
                                    **＋オゾン**の単散乱をマーチして返す純関数（DOM もレンダラも時計も読まない）。
                                    ⚠ (#R218) **オゾンは「つまみ」ではなく成分**：β_O3 = (0.650, 1.881, 0.085)e−6 m⁻¹、
                                    25 km を頂点に 10/40 km で 0 になるテント分布（Bruneton & Neyret 2008 /
                                    Hillaire 2020 の参照値。選んだ数ではない）。**吸収のみ**なので視線と太陽光線の
                                    **両方の光学的深さ**に入り、位相関数には現れない。これが無いと薄明が灰茶色になる
                                    （太陽が地平下では視線が 10〜40 km を通り、レイリーが除くべき短波長が残っていない）。
                                    実測：−4°/視線20° の青赤比 0.762→0.889、正午は3カウント以内＝#R202 の校正は不動。
                                    `js/theme-sky.js` が `sky-color` をここから取る。#R196 の `sky` ブロックは
                                    「地平線の上に面がある」ことを直したが、その面の色は**定数 `#060b16`＝宇宙**
                                    のままだった＝真昼の地上でも空が黒い。Cesium は色を選ばず積分している
                                    （`SkyAtmosphere`）ので、2つの16進数では原理的に一致しない。
                                    ⚠ サンプルは天頂ではなく **55°**（描かれる帯の上端。89° は太陽のアウレオール）。
                                    ⚠ 露出は Cesium の実測 [85,112,130] に**合わせてある**（`tests/r202-checks ①d`）。
                                    ⚠ **エクスポートは1つだけで定数も march も関数の中**——`tests/r175-checks ③`
                                    （js/ モジュールに未エクスポートのトップレベル宣言を作らない）に従うため。
  orbit-points.js                   (#R202) **軌道上の点群**——MapLibre の `custom` レイヤー。v5 の
                                    `projectTileFor3D(mercatorXY, metres)` は平面でも球でも正しいので、
                                    衛星を**その高度に**描ける。`js/solid3d.js` と同じ立場（MapLibre アダプタの
                                    実装詳細で、`layers.addOrbit/setOrbit/removeOrbit` の裏にしか無い）。
                                    位置と**その変化率**を一緒に受け取り、伝播ティックの間はシェーダが
                                    `u_dt` で進めるので **CPU は毎フレーム何もしない**。⚠ mercator y は
                                    クランプしない（球の prelude は任意の y を Gudermann で戻せる＝極を跨ぐ軌道）。
  (削除) glass-motion.js            ⚠⚠ (#R229) **削除。#R221 が入れ、#R225 が門を広げ、#R228 が「健全」と報告した機構**——
                                    カメラが動く間 `body.im-moving` を立てて `.im-glass` の `backdrop-filter` を切っていた。
                                    どのラウンドも**それが望まれているかを訊いていない**。「品質は落とすな」に対して
                                    「止まった絵は1画素も変わらないから犠牲ではない」という理屈を**ここで発明した**もので、
                                    利用者の答えは「**それって品質に影響しますか**」→ する。動いている最中のフレームも
                                    人が見ているフレームである。「**いやガラス抑止なんて余計なものつけてんじゃねーよ／外せ**」。
                                    → パネルは #R221 以前と同じく**常時フロスト**。
  (削除) render-scale.js            ⚠⚠ (#R229) **削除。#R202 が入れ、#R221 がループを止め、#R227 が扉を3つに増やした機構**——
                                    携帯でカメラが動く間だけ描画解像度を DPR 2→1.4（フラグメント半分）に落としていた。
                                    見出しに引かれている指示は「**速度、画質を高めて。どちらか一方犠牲はNG**」で、
                                    それに対する「**時間で分ければ犠牲ではない**」はガラス抑止と**まったく同じ言い訳**。
                                    三ラウンドが「どう落とすか」を精密にし、**一度も「落としてよいか」を訊かなかった**。
                                    → 地図は**常にフル解像度**。`GE().render.setRenderScale()` は契約に残る
                                    （Cesium 側も実装を持つ）が、**自動で呼ぶものは存在しない**。
                                    ⚠⚠ **ここに書いてある教訓はレンダリングの話ではない。**「**勝手なことを確認せずにやるな**」——
                                    アプリの見え方を変えるものは、書く前に利用者の承認を取る。
  opening-view.js                   (#R203) **アプリが開く眺め `OpeningView.openingCentre(ms, dflt)`**——
                                    「起動したときに地図が真っ暗になっている場合がある」の答え。実測: 22:49 UTC に
                                    390×844 で起動すると**全キャンバス平均 [29,30,36]・輝度15未満が52%**
                                    （ダークは [18,19,25]・67%）。描画は正常で、**10°E が現地0時半＝可視半球が
                                    まるごと #R201 の夜側**だった。⚠ **夜側は変えない**——#R201 が
                                    「引いたときの黒さをよりきつくして」「完全に夜間光レイヤーと同じ画像に」で
                                    そう作られている。変えてよいのは**開く経度**（誰も 10°E を要求していない）。
                                    既定中心の太陽高度が 12° 未満なら**その瞬間の直下点経度**で開く。緯度もズームも
                                    そのまま、hash・検索・ドラッグは即座に上書きする。太陽位置の級数は
                                    **このファイルだけ**が持つ（`tests/r203-checks ①c` が二重化を禁じる）。
                                    ⚠ エクスポートは**1つのオブジェクト**（`tests/r175-checks ③` は未エクスポートの
                                    トップレベル宣言も、誰も import しないエクスポートも許さない）。
  map-pick.js                       (#R196) **「地図に置く」という所作そのもの `IntMapPick`**——依頼元のパネルを
                                    クリック待ちのあいだ**隠し**、何を置くのかを名乗る細いバナー（✕/Esc で中止）を
                                    出し、`GE().events.once('click')` で1点を受け取ってパネルを元に戻す。
                                    電話では 390×844 に対し地震パネルが 362×669＝地図の大半を覆っており、
                                    「地図をタップしてください」と言いながらその地図の上に立っていた。
                                    地震（震源）・災害（発生地点）・RF（アンテナ）・日照（解析地点）の4か所が使う。
  night-sky.js                      (#R208) **ある地点からの星空 `IntMapNightSky`**（右クリック／Atlas `nightSky`）。
                                    天頂が中心・地平線が縁の全天図（⚠ **東は左**——見上げると方位が反転する）。
                                    天文は全部借り物：星表・歳差・恒星時＝`IntMapSky`、太陽/月/惑星＝
                                    `IntMapEphemeris.equatorial()`、地形＝`IntMapTerrain.sampler()`、時計＝`IntMapTime.when()`。
                                    ⚠ **地平線は実測**：方位180本×40 kmの光線から、地球の曲率と光学屈折(k=1.13)を
                                    引いた仰角の最大値。DEMが答えなければ **null のまま**＝「未計測」と表示する
                                    （平らな地平線を描くと計測に見える）。⚠ Terrarium は水深も返すので
                                    **目の高さは0 mでクランプ**（さもないと外洋で海底に立つ）。
                                    「山の陰で隠れた星」と「昼光で飛んだ星」は**別々に数える**。
  night-side.js                     ⚠ (#R232) **昼夜の on/off は3つの面から操作できるが、値の持ち主はこのモジュールだけ**：
                                    レイヤー欄の行 `dl-nightside`（#R232 で追加。旧「昼/夜」＝turf の平円盤レイヤーは**削除**）・
                                    設定の `#setting-night-side`・Atlas の `nightSide` アクション。3面とも
                                    `js/data-layers.js` の `_setNightSide()` を通り、そこが `IntMapNightSide.setEnabled()` の
                                    返り値で他の2面を貼り直す（`window._imSyncNightSideRow`）。永続化は localStorage
                                    `intmap_night_side`（#R210）＝**同じ量を二か所に持たない**。保存済みセッションの
                                    `dl-night` は `js/session-tabs.js` の `RETIRED` 表で `dl-nightside` へ翻訳される。
  night-side.js                     (#R196 → #R201 で作り直し／#R220 で**衛星画像専用**に) **地球の夜側 `IntMapNightSide`**。
                                    ⚠⚠ **#R220: 効くのは Satellite のときだけ**（「昼夜で夜間光にしたり明るく
                                    したり暗くしたりするやつはSatellite時のみに。Mapではなにも無し。」）。
                                    合成しているのは**写真**なので、ベクター地図の上では「図面に写真を貼った
                                    暗いフィルタ」にしかならない。`satelliteUp()`＝`layer-sat` の可視
                                    （js/app-body.js が同じ問いに使う判定）を条件にし、Map へ切り替えたら
                                    `destroy()` する。`styledata` も購読する（ベースマップの交換は restyle）。
                                    ⚠⚠ **#R220: 極冠は「自分の画像を失う」ことがあった**。`build()` は画像→極冠の
                                    順に足して最後に画像の有無を見ていたので、画像が作れない端末では
                                    **極冠だけが残り**、`built=false` のまま更新もされず、**極点に黒い円盤**が
                                    焼き付いた（利用者の写真＝7回目の「南極付近が真っ暗」の正体）。
                                    失敗経路は `destroy()` してから返す。加えて扇の夜度は**画像の最終行の緯度**
                                    (`joinLat()`＝`imageRowLatitudes` に訊く) で取り、色は**モザイクの極行の平均色**、
                                    同じ値の隣り合う扇は1枚に畳む。
                                    ⚠ **#R201: 5枚の入れ子ポリゴンは廃止**。「夜と昼の部分の変遷が階段状で
                                    不自然」は**機構そのものの記述**（薄明の帯は最広ズームで約17画素幅で、
                                    その中に5枚の硬い塗りを重ねれば必ず5段になる）。今は
                                    **1枚のキャンバスで、アルファを画素ごとに計算する**——RGB は NASA GIBS の
                                    VIIRS Black Marble（`dl-nightsat` と**同一製品・同一日付**）**そのまま**、
                                    アルファはその画素の夜度（太陽高度 0° → **−18°（天文薄明の終わり）**を
                                    smoothstep）。合成は `BlackMarble·n + basemap·(1−n)` なので、
                                    **n=1 では夜間光レイヤーそのもの**（「夜の部分は完全に夜間光レイヤーと同じ
                                    画像に」）、n=0 ではベースマップ無改変。実測で薄明帯の階調は**94段**。
                                    ⚠ **モザイクが無くても正しい**：到着前は Black Marble 自身の無灯値
                                    `UNLIT=[6,7,17]`（製品から実測）で塗るので、影は**ネットワーク0で最初の
                                    フレームから完成**している。モザイクは idle で **z2（16タイル・382 KB）→
                                    z3（2048²・605 KB）** の2段（携帯は z2 まで）。キャンバスは 1024²
                                    （携帯 512²）＝実測 1回12〜18 ms、2048² は120 msなのでそこで止めた。
                                    ⚠ **ポリゴンは極冠だけ**：キャンバスはメルカトルの ±85.051° で終わるので、
                                    `im-night-shade` は ±85°→極の**24分割の扇**になり、各扇が自分の経度での
                                    夜度を feature プロパティ `a` で持つ（球面の0.19%）。
                                    画像の配置は **`imageRowLatitudes()`**（#R195）経由。⚠ ズームの傾斜は
                                    **スタイル式**（`interpolate`＋`zoom`）なので毎フレームの JS は0。
                                    ⚠ カメラが十分広くなるまでレイヤーも GIBS 要求も**作らない**（要求は最初の idle）。
                                    ⚠⚠ **#R228: ランプの上では「作らない」だけでなく `destroy()` する。**
                                    `consider()` の `zoomNow()>ZMAX+0.4` はそれまで**素の `return`** で、
                                    「作らせない」門ではあっても「すでに在るものを消す」門ではなかった。
                                    アプリは **z1.7 で開く＝ランプの内側**なので、衛星ベースマップでの
                                    コールドロードでは両レイヤーは**必ず作られ**、利用者がズームインしても
                                    **一度も外れなかった**。結果として z5〜z22（街・海岸・地形＝実際に使う
                                    ズーム全部）で毎フレーム、`im-night-lights-lyr`（**全画面ラスタ**）と
                                    `im-night-shade`（**全画面塗り**）が **raster/fill-opacity 0 のまま描かれ**、
                                    キャンバス光源とその GPU テクスチャも常駐し続けていた。
                                    ランプは z4.6 以上で 0 なので**画素は1つも変わらない**——これは画質の
                                    判断ではなく、ランプが既に 0 を掛けているものを外しているだけ。
                                    z5.0 未満へ戻れば同じ `consider()`（同じ `moveend`）が作り直す。
                                    しきい値は build と**対称**なので、z5 付近で静止しても振動しない。
                                    ⚠ **MapLibre 専用**。Cesium の globe には本物の太陽照明
                                    （`globe.enableLighting`）があり、`scene.setSunDirection()`（今回全ベースマップで
                                    呼ぶようにしたその呼び出し）から入るので、向こうはレンダラが夜側を描く。
                                    —— しかも入れると**壊れる**: 全球サイズの clamped-to-ground ポリゴンで
                                    フレームが終わらず、`tests/r182-cesium` ③（easeTo）で**カメラが一度も動かない**
                                    （main 33.8 s pass / 入れると fail / 切ると 36.6 s pass）。
                                    ⚠ その代わり **Cesium にはズームの傾斜と夜間光が無い**。
                                    ImageryLayer の `dayAlpha`/`nightAlpha` がそのための仕組みだが、
                                    **検証していないので出していない**。

  ── 以下 (#R199) の7本。**この7本だけは `window.IntMapModules` に載らない**——名前付き ES export を
     `import` で受ける（`makeAtlasReply` など）。理由は指摘そのもの：「モジュールは依然として
     window.IntMapModules に登録され、読み込み順序にも依存しています」。名前付き束縛なら**バンドラが解決する**ので
     綴り違いは実行時の undefined ではなく**ビルドエラー**になり、順序は `src/main.js` の一覧ではなく
     **import グラフ**が決める。ホストの closure 値は `HOST`（IM_HOST）と `CTX`（呼び出し側の束縛そのものを
     shorthand で渡す）で受け、**元の名前に再束縛**するので本文は逐語のまま。
     `tests/r199-checks.test.mjs` が**両ファイルから導出**して「返す名前＝受け取る名前」「読む CTX＝渡す CTX」を検査する ───

  atlas-reply.js                    (#R199 で `js/atlas-console.js` から248行そのまま分離／中身は #R62–#R159)
                                    **返信の描画** `makeAtlasReply`——重複段落の除去、段組みの整形、
                                    KaTeX/コード/GFM表の保護パス、タイポグラフィ、ChatGPT風ソースカード
                                    （アグリゲータURL復号・SNS/UGC除外）。地図もアプリ状態も触らない純テキスト→HTML。
                                    借りる名前7・返す名前7。
  atlas-geo-resolve.js              (#R199 で `js/atlas-console.js` から452行そのまま分離／中身は #R44–#R143)
                                    **場所の解決とカメラの寄せ** `makeAtlasGeoResolve`——直示語（here/そこ）と
                                    「現在地」、Nominatim ジオコード（首都→重心の罠つき）、堅牢な範囲、
                                    地域ボックスと方角スライス、ジオ検証の階段、GPT地域リゾルバ（IndexedDB
                                    キャッシュ＋自己テスト）、`placeExtent`/`flyToBox`。借りる名前22・返す名前16。
                                    ⚠ **逐語でない行が1行だけある**：`geocode()` の直示フォールバックが読む
                                    `_lastPlace` はカーネルが5か所で再代入する `let` なので、**生きたサンク**
                                    `CTX.lastPlace()` 経由にした（ファクトリ時に捕まえると古い値になる）。
  atlas-controls.js                 (#R199 で `js/atlas-console.js` から105行そのまま分離／中身は #R43–#R82)
                                    **本物のUIコントロールを押す面** `makeAtlasControls`——カーネル優先の実行経路
                                    （`kexec`）、コントロールの検索と実行とカタログ、`window.IntMap*` のメソッド
                                    ディスパッチ、Atlasが名指しできないコントロールを報告する `IntMapUIAudit`。
  atlas-sources.js                  (#R199 で `js/atlas-console.js` から178行そのまま分離／中身は #R69–#R80)
                                    **外部の証拠源** `makeAtlasSources`——Wikidata の元首/首相、GDELT と
                                    Google News の記事取得、Wikipedia 要約、Overpass の POI セレクタ表、
                                    Wikidata POI クエリ。取得と正規化だけ＝**描画は一切しない**。
  atlas-sims.js                     (#R199 で `js/atlas-console.js` から239行そのまま分離／中身は #R72–#R135)
                                    **時間を進める重ね描き** `makeAtlasSims`——大円飛行、コリオリ補正つきの
                                    弾道解と地上軌跡と高度プロファイル、爆風リング、標高グリッド、
                                    歴史勢力図の塗り。すべて「幾何を計算し、エンジンに渡し、進める」形。
  atlas-verify.js                   (#R199 で `js/atlas-console.js` から149行そのまま分離／中身は #R150/#R156)
                                    **回答をコード側で検証する** `makeAtlasVerify`——名前の正規化と確信ゲート、
                                    本文からの地名抽出、**厳密有理数**での算術検証（浮動小数を使わない）、
                                    引用ドメインの監査、mapped/unplaced/ambiguous の判定。全部が純関数。
  theme-sky.js                      (#R199 で `js/app-body.js` から233行分離／中身は #R99–#R196)
                                    ⚠⚠⚠ (#R240) **maplibre の globe 大気は `style.light` からしか太陽を取らない。**
                                    `drawAtmosphere` → `getSunPos(light, transform)` がすべてなので、
                                    **ライトの向き＝大気の明るさ**である。`_aimSun()` は昼夜表示がオフのとき
                                    `setSunDirection(null)` を呼んでいたが、`null` は maplibre の既定ライト
                                    `{anchor:'viewport',position:[1.15,210,30]}`＝**画面座標に固定された低い太陽**で、
                                    散乱積分は惑星座標で行進しているため「太陽の無い地球」に等しい。同一カメラ・
                                    同一ビルドでライトだけ入れ替えた実測: コンゴ 71,112,77 → **35,62,13**／
                                    大西洋 44,105,134 → **2,51,72**。しかもベクタ地図では `_nightSideOff()` は
                                    **常に true** なので、Map ベースマップの地球には最初から大気が無かった。
                                    ⚠ **「オフ」＝「昼夜の境界が無い」であって「太陽が無い」ではない。**
                                    オフのときはカメラ中心の真上に太陽を置く（終端線は視野中心から90°離れるので
                                    画面のどこにも明暗の境界は出ない）。パンで境界が入り込まないよう
                                    `_skyFollowCamera` が中心の移動で狙い直す（`setLight` 1回・sky の再パース無し）。
                                    ⚠⚠⚠ (#R241) **標準マップには大気が無い。衛星のランプは z11 で 0 になる。**
                                    「衛生写真ではあっても、標準マップでは大気はなし」＋「Mapでは大気ゼロ（縁の帯も消す）」
                                    ——ベクタ地図では `atmosphere-blend` が **0**、`_limbOwnsRim()` も `_airOn()` で
                                    false（アプリ自前のリム層も出さない）。#R205 の light-map 分岐は読者を失ったので
                                    `_mapIsLight()` ごと削除した。
                                    ⚠ **崖の正体は maplibre のソースにある。** `maplibre-gl 5.24` の `case 'globe'` は
                                    `['interpolate',['linear'],['zoom'], 11,'vertical-perspective', 12,'mercator']` で、
                                    `atmosphere-blend` も js/geo-engine.js のリム強度も**この遷移に掛けられる**——z11 の
                                    空気がいくらであろうと**1ズームで全部消える**。#R240 はここを「平坦に」して 0.24→0 の
                                    段差を **0.45→0 に大きくしていた**（実スクリーンショットで z11 は乳白色・z12 は素の画像）。
                                    曲線は1つ（**`AIR_Z`**）で **z11 で 0**。`_airRamp()` が maplibre の式として、
                                    `_airAtZoom()` が JS としてリム層へ——**表は1つ**（#R241、`_skyFollowCamera` が
                                    ズームのたびに `setLimb` で押し直す）。衛星のピークは 0.55 → **0.45**、
                                    中間は大きく下げた（z4 で 0.52 → 0.28）。
                                    ⚠⚠ (#R223) **地上のヘイズ（`fog-*`）は撤去された。** #R216 が入れたエアリアル
                                    パースペクティブは物理としては正しいが、`fog-ground-blend` は「靄の強さ」ではなく
                                    **地面のどこから塗り始めるか**で、0.62 は地図中心から地平線までの62%の位置から
                                    `horizon-color`（晴天の実測 #c2ccd1）へ向けて塗る＝**衛星画像の奥3分の1を横切る白い幕**。
                                    「衛星画像で地平線付近を白い靄で見えなくするな」に従い、`_aerial()` は
                                    `{ground:1, horizon:0}` を返す**1行**になった（関数は残す——`_skyFollowCamera` が
                                    この対を前回値と比べるので、オフの値も1か所から出すのが二重管理を防ぐ）。
                                    ⚠ 地平線より**上**の帯（sky-color / horizon-color / sky-horizon-blend /
                                    atmosphere-blend）は一切不変。
                                    **色と太陽の位置** `makeThemeSky`——UIテーマとスキン、ベースマップの
                                    light/dark 対、そこから決まるラベル/国境の可視、そして #R196 の本物の大気
                                    （直下点、カメラ位置での太陽高度から決まる地平線色、MapLibre の sky 7項目、
                                    マスタークロックと1分ティックの再照準）。
                                    ⚠ **233行中222行が逐語**。残り11行は全部**同じ1つの理由**＝#R165 の規則：
                                    app-body が実行時に**再代入する** closure 値は IM_HOST の生きたアクセサ経由で読む
                                    （`userTheme`＝読み書き両方・`currentMapType`→`HOST.mapType`・`namesOn`・
                                    `bordersOn`・`satActive`・`satPanelDismissed`）。それ以外＝関数は全部 CTX で元の名前のまま。
                                    ⚠ `js/theme-sky.js` は `appShell()` に**入れていない**——入れると
                                    「シェルが小さくなった」という測定そのものが無意味になる。代わりに
                                    #R186/#R187/#R196 の空のアサーションを**このファイル名で直接**訊くようにした
                                    （連結を検索するより厳しい）。

  ── 以下 (#R200) の6本。#R199 と**同じ仕組み**（名前付き ES export ＋ `import`、`window.IntMapModules`
     にも `src/main.js` の一覧にも**載せない**）で、今度は `js/app-body.js` を 5,149 → **4,360行**にした（下の4本を含む）。
     借りる名前は CTX（呼び出し側の束縛を shorthand で渡す＝元の名前に再束縛するので本文は逐語）、
     app-body が**再代入する**値だけ IM_HOST の生きたアクセサ（#R165 の規則）。
     移した504行のうち**490行が1バイトも変わっていない**。`tests/r200-checks.test.mjs` が
     **両ファイルから導出**して検査する ───

  session-tabs.js                   (#R200 で `js/app-body.js` から173行分離／中身は #R11–#R195)
                                    **タブと、リロードをまたいで戻ってくるもの** `makeSessionTabs`——
                                    セッション永続化（`intmap_session2`：ONのレイヤー・開いているタブ・
                                    ベースマップ・3-D・左右サイドバー・時間旅行の年、`defv` 世代印つき）、
                                    ⚠⚠ (#R225) **「切った」が一度も復元されていなかった。**「base map & labels も
                                    勝手に全部オンになる」——`index.html` は `cb-names / cb-geolabels / cb-poi /
                                    cb-borders / cb-admin1 / cb-roads / cb-rail2` を **`checked` で出荷**する。
                                    スナップショットは「チェックされている箱」を保存するので、切った箱は
                                    **正しく「不在」として保存され**、復元側が OFF を適用するのは
                                    `IntMapDefaultLayers`（ケッペンと海底ケーブル）**だけ**だったため、
                                    次の読み込みで**HTMLの既定＝ONに戻された**。毎回、永久に。
                                    → #R186 の規則（不在＝利用者が切った）は**既定ONの全部**に適用されねばならない。
                                    `IntMapDefaultLayers` は意味を変えず、その上位集合 **`window.IntMapDefaultOn`**
                                    を `js/data-layers.js` に**1か所だけ**宣言し、復元の OFF 掃きと既定ONの発火器の
                                    **両方がそれを読む**。既定ONの行を足すときはそこに1行足す。
                                    デスクトップ初回起動の既定タブ、タブのIntMapOSコマンド登録、
                                    タブ文字サイズのフィット、レイヤーon/offのOSコマンド表。
                                    借りる名前3（CTX）＋3（HOST: `mode`/`mapType`/`terrain3D`）・返す名前0。
                                    ⚠ #R186/#R188/#R189/#R190/#R195/#R170 の**セッション系アサーションは
                                    このファイル名で直接**訊くように直した（連結を検索するより厳しい）。
  layer-dropdown.js                 (#R200 で `js/app-body.js` から82行分離／中身は #R18–#R62)
                                    **レイヤーメニューとそのアコーディオン** `makeLayerDropdown`——開閉、
                                    外側クリックで閉じる、`#map-container` への持ち上げ（入れ子
                                    backdrop-filter の回避）、グループの折り畳み。返す名前は `_collapseGroup` 1つ。
  layer-favs.js                     (#R200 で `js/app-body.js` から61行分離／中身は #R16/#R17)
                                    **★を付けたレイヤーとチップ列** `makeLayerFavs`——レイヤー行の読み取り
                                    （`layerCbInfo`）、★の注入、チップの描画。返す名前2。
                                    ⚠ **この2つ＋`_collapseGroup` は `const` で受け取ってはいけない**。
                                    `js/map-ui.js` が IM_HOST 経由でこれらを**1,800行手前で**掴むので、
                                    const だと TDZ で `ReferenceError` になり**起動そのものが落ちる**
                                    （このラウンドで実際に落とした）。app-body 側は **巻き上げ関数の shim**
                                    （`function layerCbInfo(){ return _IM_LFAVS.layerCbInfo.apply(this,arguments); }`）
                                    ——移す前と同じく「名前は最初の行から在る」を保つ。#R168 の規則そのもの。
  premium-plan.js                   (#R200 で `js/app-body.js` から55行分離／中身は #R14)
                                    **プレミアム欄**（全機能無料）`makePremiumPlan`——自前のi18nキーと
                                    スタイルとDOMを持つ自己完結UI。`refreshProUI()` が全部を解放し
                                    `openProModal()` は no-op。借りる名前3・返す名前0。
  screenshot.js                     (#R200 で `js/app-body.js` から36行分離／中身は #R18)
                                    **スクリーンショット** `makeScreenshot`——地図キャンバス＋凡例＋
                                    スケールを1枚のPNGに合成（コントロールは外す）。**idle を待ってから**
                                    撮るので、描き終わったフレームが写る。借りる名前5・返す名前0。
  time-countries.js                 (#R200 で `js/app-body.js` から97行分離／中身は #R94)
                                    **その年のCountriesタブ** `makeTimeCountries`——マスタークロックが過去に
                                    行くと、その年の World Bank 実データを取得して `countryStats` に重ね、
                                    塗り・行・国カードを当時の姿にする（「今」に戻すと完全に復元）。
                                    借りる名前4＋1（HOST: `countryDataLoaded`）・返す名前0。

  ── (#R200) 2回目。**全セクションを面測定で掃いて**上位を採った4本（上の6本より綺麗な切り口だった）───

  i18n-late.js                      (#R200 で `js/app-body.js` から107行分離／中身は #R20–#R79)
                                    **遅れて足された翻訳** `makeI18nLate`——後のラウンドが足した UI 文字列を
                                    5言語ぶん共有 i18n 表へマージする（誰かが読むより前に）＋ティッカーの
                                    設定パネル。借りる名前1（CTX `i18n`）＋1（HOST `lang`）・返す名前0。
                                    ⚠ `r171`/`r180 ③` の「5言語に在るか」はこのファイルに訊く。
  wheel-zoom.js                     (#R200 で `js/app-body.js` から66行分離／中身は #R20)
                                    **ホイールと操作感度** `makeWheelZoom`——MapLibre 本来のカーソル追従
                                    ズーム（#R20 が戻したもの）と、その後ろの操作感度（ホイール/ピンチ率と
                                    ドラッグ慣性）＋その設定UIと5言語の文字列。借りる名前2・返す名前0。
  keyboard-shortcuts.js             (#R200 で `js/app-body.js` から76行分離／中身は #R62/#R72)
                                    **キーボードと `?` の一覧** `makeKeyboardShortcuts`——修飾キー無しの
                                    デスクトップ用ショートカット（入力中は無視）と5言語のチートシート。
                                    ⚠ `t` がテーマを light→dark→auto と回すので、**このラウンドで唯一
                                    HOST に書き戻すファイル**（`HOST.userTheme`）。`tests/r165-checks` の
                                    owner 一覧に**意識的に追加**した。
  label-occlusion.js                (#R200 で `js/app-body.js` から99行分離／中身は #R19/#R196)
                                    **地名を最前面に、球の裏側のマーカーを隠す** `makeLabelOcclusion`——
                                    どちらも「乱す側を全部追いかけるのではなく、idle で真実を貼り直す」
                                    という同じ考え方の自己修復。マーカーは HTML なのでレンダラは隠して
                                    くれない。借りる名前2（CTX）＋2（HOST `proj`/`markersArray`）・
                                    返す名前1（`updateOcclusion`＝**巻き上げ shim 経由**）。
                                    ⚠ `IntMapModules.tileWarm` のマウントはこのブロックに乗っていたので
                                    一緒に移った——`scripts/static-checks.mjs` の「ページ」の定義を
                                    **app-body が静的 import する兄弟ファイルまで**広げた（でないと
                                    「定義されているが誰も呼ばない」と誤検出する）。

  sat-proto.js                      (#R195 で `js/app-body.js` から259行そのまま分離／中身は #R158–#R193)
                                    **`imapsat://` タイルプロトコル**——Esri World_Imagery の取得、灰色
                                    プレースホルダの判定（≤3,500 B）、最も近い実写祖先からの切り出し、
                                    撮像深度メモ（have/stop）、@2x ステッチ、`src/sat-worker.js` への受け渡し、
                                    テスト用フック `window.IntMapSatProto`。⚠ シェルから借りている値は
                                    **`_hiDPITiles` の1つだけ**で `IM_HOST.hiDPITiles` 経由（継承させると
                                    @2x が無言で止まる）。⚠ 呼び出し位置は動かせない——このファクトリが立てる
                                    `window.__imSatProto` を下流のスタイル定義が読む。22KB
  ai-core.js                        (#R169) Atlas AI のトランスポート層（`aiCallServerFull`＝ai-proxy 呼び出し・
                                    プロバイダエラー分類・1日上限とその表示・AI設定パネル・`askAI`/`askAIJSON`）。24KB
  place-labels.js                   (#R169) 地名/海洋ラベル（`ensurePlaceLabels`＝`ofm-*` シンボル群の生成・
                                    安定ラベルの収穫・`applyLabelLang`＝`name:<lang>` 切替・地理レイヤー）。28KB
                                    (#R198) `ofm-admin1`（州・省・県）を追加。サイズは全て `js/label-scale.js` から。
                                    (#R252) `ofm-other` に市区町村より下の5クラスを追加（`neighbourhood` ほか）、
                                    `ofm-admin1` は境界線と同じ色に、`OSM_NAME_KEYS` を
                                    `window.IntMapOsmNameKeys` として公開（ポップアップの2つ目の名前）、
                                    水域ラベル索引の診断 `window._imLabelStats` を js/app-body.js から引き取った
                                    （シェルの行数上限＝tests/r168 #8 の下では、主題は自分のファイルへ出る）。
  label-scale.js                    (#R198) **地図上の全テキストサイズの唯一の出所** `window.IntMapLabelScale`。
                                    `place(kind)`＝地名ラベルの階段（country/admin1/city/other/era）、
                                    `sub(w)`／`subCase(cond,a,b)`＝地名以外（`w ≤ 1` はクランプ）。
                                    `sub(w)(z) ≤ floor(REF(z)·0.88) < REF(z)` が構成上あらゆるズームで成立
                                    （REF＝PLACE の各点最大）。⚠ 返すのは必ず**ズームが最外側**の
                                    `interpolate`（#R73 で入れ子が addLayer を黙って落とした）。DOM も
                                    レンダラも触らないので Node で検証（`tests/r198-checks.test.mjs`）。
  map-typography.js                 (#R242) **アプリの文字**（`window.IntMapMapTypography`）。①`cjkFamily()`＝
                                    MapLibre の `localIdeographFontFamily` に渡す CJK/ハングルの書体（UI と同じ
                                    ものを言語別に）／`glyphRewrite(url,type)`＝Latin・キリルの `{range}.pbf` を
                                    同梱の `fonts/Inter Regular/` へ差し替える `transformRequest`（Inter を配る
                                    公開グリフサーバが存在しないため自前生成。`scripts/build-glyphs.mjs`）。
                                    ⚠⚠ (#R247) **その PBF の `top` は「ベースラインからの距離」ではない**——
                                    サーバ由来フォントは**ベースラインの 27 単位上**を原点に測る（MapLibre は
                                    同じ数を `topAdjustment = 27.5` と呼び、TinySDF の字形をこの規約へ変換して
                                    いる）。#R243 は符号と辺は直したが**原点が違って**おり、Latin・キリルの全字形が
                                    **1.125 em 高く**描かれていた。素のラベルでは行ごと動くので見えず、
                                    **箱の中では見える**——ニュースの帯は字形メトリクスと無関係な shaping box に
                                    合わせて置かれるので、帯だけ取り残されて文字がはみ出していた。CJK は
                                    `localIdeographFontFamily`＝TinySDF 経由で正しく変換されるため、
                                    **Latin と CJK が混じる1行は 1.1 em ぶん割れていた**。`tests/r247 ①`。
                                    ⚠⚠⚠ (#R252) **`cjkFamily()` は正しく答えていたが、訊かれるのは地図生成の
                                    1回だけだった**——`localIdeographFontFamily` はコンストラクタ引数なので、
                                    言語を切り替えても起動時の書体スタックのままだった。実測：简体に切り替えた
                                    直後、`cjkFamily()` は SC 先頭・`glyphManager.localIdeographFontFamily` は
                                    **JP 先頭**。JP が先頭だとブラウザの1文字ごとのフォールバックが働き、
                                    `县`・`岛`・`东`・`宫` は **Noto Sans JP に存在しない**ので SC へ落ちる
                                    ＝「宫城县」が SC|JP|SC＝**1つのラベルの中で2書体**（＝報告そのもの）。
                                    `syncCjkFamily()` が `intmap-lang` のたびに
                                    `IntMapGeoEngine.scene.setCjkFontFamily(cjkFamily())` を呼ぶ。再ラスタライズは
                                    アダプタ側で**公開 API の `setGlyphs()`**（既にあるURLを渡す）を通す＝古い family で
                                    作られた TinySDF ごとキャッシュが空になり、グリフに依存する全タイルが再レイアウト
                                    されるので「このレイヤーを忘れていた」が原理的に起きない。family が同じなら
                                    早期 return なので、起動言語のままの人はグリフ再読込を払わない。
                                    ⚠⚠⚠ (#R253) **……そしてその `localIdeographFontFamily` は、地図のラベルに
                                    一度も届いていなかった**。MapLibre 5 の `_drawGlyph` は
                                    `stack === defaultStack`（style-spec 既定の
                                    `Open Sans Regular,Arial Unicode MS Regular`）でしか局所ラスタライズ経路に
                                    入らない。このアプリのシンボルレイヤーは `Noto Sans Regular` を要求するので
                                    門は一度も開かず、MapLibre は代わりに**フォントスタック名そのものを CSS の
                                    font-family として**扱う——`Noto Sans Regular` は実在しないので `sans-serif`＝
                                    **OS 標準フォント**に落ちる。実測（東京を流した直後の glyphManager）:
                                    `entries['Noto Sans Regular']` は CJK 111 字をキャッシュ済みで
                                    `ideographTinySDF` は **null**、`tinySDF.ctx.font` は
                                    `48px "Noto Sans Regular", sans-serif`。Windows の1文字ごとのフォントリンクが
                                    日本語漢字・簡体字専用字・繁体字専用字をそれぞれ別の OS フォントで描くので、
                                    1つの地名が3書体に割れる＝「簡体字と日本の漢字が別のフォントだから汚い」。
                                    #R242 の書体選択も #R252 の言語同期も**計器は緑・画面は無変化**だった理由。
                                    **直しはレンダラに手を入れない**——同じ `_drawGlyph` が、既定でないスタックでは
                                    `_createTinySDF(stack)` ＝**スタック名をそのまま CSS の font-family 列として**
                                    使う。つまり `text-font` に実在するファミリ名を書けば、それが**選択であり
                                    配達手段でもある**。①`placeFont()` が `text-font` を**ラベル単位**で決める
                                    ＝**読者の言語の name キーを持つ地物は読者の書体、持たない地物（＝現地名が
                                    そのまま出る＝他所の文字）は Noto Sans SC だけ**（実測で JP∪TC∪SC を1書体で
                                    覆う唯一の Google 提供フェイス）。②`glyphRewrite` が新しいスタック名の
                                    非 Inter レンジを `Noto Sans Regular` へ畳み直す（`text-font` はグリフ URL
                                    でもあるため。実測: 失敗リクエスト0・上流に出るスタックは
                                    `Inter Regular` と `Noto Sans Regular` の2つだけ）。実測（修正後）:
                                    `48px "Noto Sans JP", "Noto Sans SC", sans-serif`。
                                    実測（実ラベル・6都市）: 1ラベル2書体は **ja 31.4%→0.9%** ／
                                    **zh-Hant 26.9%→4.0%** ／ zh-Hans 1.3%（元から）。
                                    ⚠⚠ (#R253) `_lang()` は **BCP-47 タグを返していた**——`window.IM_HOST` も
                                    `window.currentLang` も存在せず（`IM_HOST` は js/app-body.js のモジュール内
                                    `const`）、いつも `document.documentElement.lang` に落ちていた。日本語は
                                    「ja」でありアプリのコード「jp」ではない。`cjkFamily()` の JP 分岐が**既定の
                                    分岐**なので誤答と正答がたまたま同じ文字列になり、11ラウンド誰も気づかなかった。
                                    表を引いた瞬間に露見（`OSM_NAME_KEYS('ja')` は日本語キーを1つも返さない）。
                                    タグは**それを作った1つの表**（`IntMapLang.LANGS[].html`）から逆に辿る。
                                    ②`bandBox(txt)`＝ニュース帯の実寸（`text-max-width:14em` の折返しを canvas で
                                    実測）と `declutterNewsBands(feats)`＝重なり回避。③`installFlagFont()`＝
                                    国旗 webfont（#R79e から移設。`var(--im-font)` を前置するので言語切替に追随）。
                                    どれも js/app-body.js の上限（tests/r168 #8・tests/r200 ⑤）の外へ出したもの。
  window-manager.js                 (#R169) フローティングパネルの共通機構（`makeDraggable`／`addEdgeResize`／
                                    `registerWindow`／`bringToFront`）。11KB
  search-geocode.js                 (#R169) 検索ボックス（自然文の前処理・ローカル地名のあいまい一致・
                                    2ジオコーダ並列＋ハードタイムアウト・結果カード・`gotoPlace`）。15KB
  news-context.js                   (#R169) 記事→地点/媒体の解決（`analyzeContext`＝IntMapNewsGeo 優先＋
                                    レガシー辞書フォールバック・`rebuildGeoIndex`・媒体マッチャ）。16KB
  news-feed.js                      (#R169) ニュース取得（版・RSS取り込み・キャッシュ・Supabase高速経路・
                                    タイトル翻訳）。18KB
  news-sources.js                   (#R207) 「どのニュースを取るか」の2つのピッカー＝**国別メディア**（#29）と
                                    **提供元（媒体）**。提供元の一覧は表ではなく**いま届いている見出しの
                                    `publisher` から**組み立てる（空＝全部）。`window.IntMapNewsSources`
                                    ＝ `counts/allows/label/render/commit/syncLabel` ＋
                                    `renderCountries/commitCountries/countryLabel/syncCountryLabel`。
                                    ⚠ `NEWS_COUNTRY_FEEDS` は**引数で受け取る**（自由参照は無言のno-op）。7KB
  article-reader.js                 (#R169) サイドバー内リーダー。**#R11 以降どこからも呼ばれていない**
                                    （ファイル冒頭に所見を明記。再配線するか削除するかは製品判断）。8KB
  community-board.js                (#R169) コミュニティ板の中身（カード/スレッド/コメントのHTML・投稿モーダル・
                                    地図レイヤー・Supabase 読み書き）。21KB
  map-readout.js                    (#R169) 地図の読み出し系（座標/標高/レイヤー値/コンパスの表示・DEMサンプラ・
                                    グリッド（経緯線）・計測チップ・`handleMapClick`）。27KB
                                    ⚠ (#R226) **`demSnapshot(...)` の bilinear はこのファイルに1つしかない。**
                                    `rowSampler(lat)` が実装で、`at(lng,lat)` は**それに委譲する**——2つ目の実装を
                                    置かないことが「値が動かない」ことの保証（テストではなく構造で担保する）。
                                    緯度に依存する4つの超越関数（`tan`/`cos`/`log`/`pow`）と Map のキー文字列は
                                    **行ごとに1度**だけ評価され、タイルバッファは列がタイル境界を跨ぐまで記憶される。
                                    震度場は規則格子を1セル3サンプルで歩くので、2,560² では 1,970万回の削減になる。
                                    ⚠⚠ (#R223) **DEMタイルのキャッシュは canvas ではなく `Float32Array(65536)`（メートル）**。
                                    以前は canvas の裏バッファ 256 kB ＋ `__pix` の RGBA 256 kB ＝ **1枚 512 kB** で、
                                    #R221 が震度場に最大1,600枚をピン留めさせる（＝最大800 MB）。**携帯でタブが落ちる
                                    説明として最も筋が通る**ので半分にした。⚠ 正確：terrarium の R·256+G+B/256−32768 は
                                    最小刻み 1/256 m・範囲±32,768 m で、float32 の24ビット仮数に丸めなしで入る。
                                    ⚠ 復号は**読み込み時**に1回（以前は遅延だったので全部が `demSnapshot` の中で起き、
                                    実測 2.8〜3.4 秒が進捗40%の後ろに隠れていた）。共用の復号canvasは1枚。
                                    ⚠ (#R223) タイルURLは**同じ公開バケットの4つのホスト別名**に `(x+y)&3` で振り分ける
                                    （HTTP/1.1 の1ホスト6接続が律速だったため。実測 1.5〜1.7倍。ホストはタイルの
                                    決定的関数なのでHTTPキャッシュは効く。4つとも**ページから**CORS確認済み）。
                                    ⚠ `demTilePoints(w,s,e,n,z,keep)` / `demSnapshot(w,s,e,n,z,keep)` は**同じ**述語を取る
                                    （片方だけに渡すと飛ばしたタイルが「欠落」に数えられ、再試行を誘発する）。
  elevation-profile.js              (#R169) 標高断面パネル（Draw ツールから開く）。7KB
  ── 以下 (#R170)。既存の分割とは性格が違い、**新機能を最初から js/ に置いた**もの ─────────────
  volume3d.js                       (#R170) Measure ▸ 3-D 立体（`IntMapVolume3D`）。底面リング＋海抜の上下端から
                                    実尺の直方体を空中に描く。**`IntMapGeoEngine` だけで書かれ、生 `map` を
                                    一切参照しない**（§7.1）。3D地形 ON のとき MapLibre の押し出しは地表面基準に
                                    なるため、DEM 標高を差し引いて「海抜」の意味を保つ。
                                    (#R171) 底面は**多角形／フリーハンド／円／長方形**の4通り。ストローク系の3つは
                                    描画中だけ engine の `input.setDragPan(false)` でドラッグを預かる。
                                    (#R172) **高度の上限撤廃**・**単位（m/km/ft/mi）**。クリック由来でないリング
                                    （Atlas 等）はパネル再描画で上書きされない（`syncClicks`）。
                                    (#R183) **複数オブジェクト対応**。`saved[]` に確定した立体を持ち、各体が
                                    自前のレイヤID（`imv3d-s{,l,e,b}-<id>`）を持つ。`commit()`＝下書きを複製して
                                    底面だけ空に（高度・色は残す）／`list()`＝名前・帯・体積・表示＋**合計**／
                                    `select` `setObjVisible` `removeObj` `removeAll` `updateObj`（保存済みの
                                    高度帯・色・不透明度を後から編集。下書きと同じ `_num` ガード）／
                                    `pickAt(lng,lat)`＝底面の点内包で**クリック選択**（非表示体は対象外）。
                                    **各体は自分の重心下の地面を読む**（山の反対側に置かれ得るので共有オフセット不可）。
                                    スタイル入替・地形トグルで保存済みも描き直す。**下書きの経路は無変更**。
                                    (#R173) **立体は engine の `layers.addSolid` に頼む「閉じた立体」ひとつ**になった。
                                    #R172 の「底面スラブ＋内部シート8枚」は**一度も見えていなかった**——`fill-extrusion`
                                    は深度を書き込むので、内側に描いたものは自分の手前の壁で深度テストに落ちる。
                                    (#R174) **Solid は選択制ではない**——立体とは閉じた立体のこと。開いた殻は
                                    `addSolid` を持たないレンダラーへのフォールバックとしてのみ残る（UI・Atlas・SYS
                                    カタログのいずれからも選べない）。**Polygon には「描画を完了」ボタン**（`seal()`）が
                                    付き、押すと地図クリックは頂点を足さなくなる（もう一度押すと再開）。14KB
  solid3d.js                        (#R173) **閉じた3-D立体**（`IntMapModules.solid3d`）。MapLibre アダプタの
                                    実装詳細で、`layers.addSolid/setSolid/removeSolid` の中身。上下の蓋を耳切り法で
                                    三角形分割し、側壁とつないだ**一枚の閉じたメッシュ**を custom レイヤーで描く。
                                    奥面→手前面の2パス・深度は**テストするが書かない**・不透明度は面を通る光路長
                                    （1/|n·v|）から求めるので、中身の詰まったガラスに見える。MapLibre 自身の
                                    vertex prelude を使うので**平面でも球でも同じメッシュが正しく載る**。
                                    (#R174) ただし `projectTileFor3D` の**高度の単位は prelude によって違う**——球は
                                    メートル、平面（mercator）は**メルカトル単位**。metre 決め打ちだったため z12 以上
                                    （globe が素の mercator になる領域）で全頂点が far plane の外へ飛び、立体が
                                    消えていた。`u_altScale` を variant で切り替える（実測は §19 #R174 ④）。9KB
                                    ⚠ (#R218) **耳切りの上限は最初の頂点数から一度だけ取る**。縮んでいく
                                    `idx.length` で毎回評価し直すと、n≥276 の輪でループが**仕事の途中で期限切れ**に
                                    なり、蓋と床の真ん中に多角形が残る＝直線で縁取られた欠け（「たまに不自然な
                                    切り込み線」の正体。実測 n=800 で 778/798 三角形）。万一期限切れになっても
                                    残りは扇状に張る——見えないスリバー ≪ 報告される穴（#R216）。
  ── 以下 (#R180) の5本＋(#R182) の1本＝**第2の描画エンジン**。既定セッションは1バイトも読み込まない
     （`js/engine-select.js` からの**動的 import** のみ。main チャンクから cesium チャンクへの参照は 0）─────
  engine-select.js                  (#R180) このセッションがどちらのエンジンで動くかを決める唯一の場所。
                                    `localStorage['intmap_engine']`（`'cesium'` 以外＝既定の MapLibre）。
                                    Cesium のときだけ `window.IntMapEnginePending` に Promise を publish し、
                                    js/app-body.js の**ブートバリア**がそれを待つ——レンダラはシーンが出来た
                                    あとでは差し替えられないので、決定は `ui.createView` より前でなければならない。
                                    既定では publish しないので、その経路に Promise は一切現れない。3KB
  cesium-style.js                   (#R180) **MapLibre style 言語の解釈器**（第2エンジンの本当のコスト）。
                                    式評価（`get`/`interpolate`/`case`/`match`/`coalesce`/`step`/`feature-state`…）、
                                    フィルタ（**旧 `$type` 形式**と式形式の両方。旧→式に**変換**するので評価器は1つ）、
                                    色（#rgb/#rrggbbaa/rgb()/hsl()/CSS名／sRGB・Lab 混色）、旧 `{stops}` 関数。
                                    **純粋**——Cesium も DOM も window 状態も参照しないので Node で直接テストできる。
                                    実装しない演算子は `UNSUPPORTED` として**公開**する（#R162）。17KB
  cesium-layers.js                  (#R180) プロバイダと描画器。raster→`ImageryLayer`（brightness/contrast/
                                    saturation/hue が**ネイティブ**）、fill/line/circle/symbol/fill-extrusion→
                                    エンティティ、heatmap/hillshade/color-relief→同じ DEM から計算するラスタ、
                                    terrain→アプリが既に流している **terrarium タイル**から `HeightmapTerrainData`
                                    （**キーレス**＝Ion トークン無し）。Cesium がやらない**画面空間デクラッタ**も
                                    ここ（投影→sort-key 順→衝突箱／地平線の裏と画面外は席を取らない）。16KB
                                    (#R181) **この4つの生産者が作るテクスチャは `toTexture()` で1回だけ向きを決める**。
                                    WebGL 仕様は `ImageBitmap` に `UNPACK_FLIP_Y_WEBGL` を**無視する**ので、
                                    Cesium がそのフラグに頼っている以上、普通に作った bitmap は**タイルごとに
                                    自分の中心で反転**する（＝鏡像ではなくタイル行ごとの裂け目。報告された
                                    「衛星画像が完全に破損」の正体）。`transferToImageBitmap` は向きを指定できないので廃止。
  cesium-vector-tiles.js            (#R180) ベクタタイルの**ピラミッド**（cover/fetch/decode/LRU）。描画は
                                    GeoJSON 経路と同じものを使う——タイルの難所はレンダラであって、
                                    features になりさえすれば既存の描画器が受け取れる。`@mapbox/vector-tile`。4KB
                                    (#R181) 「まだ要るタイル」は**カウンタではなく集合**（`wantSet`）。`update()` は
                                    カメラ移動ごとではなく**レイヤごと・フレームごと**に呼ばれるので、そこで増やす
                                    `generation` は「誰かが訊いた」であって「カメラが動いた」ではなく、
                                    `onChange`（タイルが届いた＝描き直せ）がほぼ常に握り潰されていた。
  cesium-engine.js                  (#R180) アダプタ本体。`makeMapLibreAdapter` と**同じメソッド集合**を実装し、
                                    `IntMapGeoEngine.use()` で差し込まれる。カメラ対応（zoom↔range・pitch は
                                    ちょうど90°ずれる）の**唯一の転写**、地形が届いたらカメラを打ち直す `_settle`、
                                    popup/marker（Cesium に無いので DOM を投影で追従。`.maplibregl-*` の
                                    クラス名は**意図的に維持**＝スタイルはアプリのものだから）。39KB
                                    (#R181) カメラの2件とイベント面。**pitch 0 の bearing**——水平成分が定義上ゼロに
                                    なる領域を弾く閾値が**自分の残差より4桁小さく**一度も発火しなかった
                                    （`_enuNoise(range)=range*1e-5`。残差は雑音ではなく中心ピックの分解能で
                                    range に比例する）／`lookAtTransform` は真下では heading を捨てるので
                                    `_faceHeading` が**視線軸まわりの twist** で入れ直す（位置も注視方向も不変）。
                                    **イベント**——アプリが購読する26種のうち11種に発生源が無かった。
                                    `mousedown`/`mouseup` は **pointer から**（Cesium が pointerdown の default を
                                    止めるので互換マウスイベントが出ない）、`render` は `scene.postRender`、
                                    `rotate`/`pitch` は角度が実際に動いたときだけ、`terrain` は `setTerrain` から。
                                    **`fitBounds`** は球のときは球に訊く（閉形式。小さい箱ではメルカトル式に一致）。
                                    (#R182) **アニメーション経路の着地点**——`flyTo` に軌道の角度を orientation として
                                    渡していた（別物）ので、pitch 30 の easeTo が緯度 15°先・pitch 57.9 に着き、
                                    pitch 0 では bearing を捨てていた。**目的地は瞬時経路（`_aimAt`）で解いて
                                    `direction`/`up` で飛び、到着時にもう一度当てる**。`around`（カーソル地点へ
                                    ズーム）を `camOf` と `setCamera` が運ぶ。ジェスチャの1フレームは
                                    `{silent:true}`＝move/moveend を出さない（`camera.changed` の流れも止める）。
                                    右ドラッグで回した後の `contextmenu` は**マップイベントとして出さない**
                                    （MapLibre と同じ。出すとアプリの `#ctx-menu` が canvas を覆う）。
  cesium-input.js                   (#R182) **MapLibre のジェスチャを Cesium のカメラで実装した層**。Cesium 自身の
                                    `ScreenSpaceCameraController` は `enableInputs=false` で止める（別の航法モデルで、
                                    8つのうち6つに束縛が無かった）。dragPan／dragRotate（右ドラッグと ctrl+左、
                                    回転 0.8°/px・傾き 0.5°/px）／scrollZoom（device 判定＋シグモイド＋200ms の
                                    なめらか化、カーソル位置を固定）／boxZoom（`.maplibregl-boxzoom`）／
                                    doubleClickZoom／keyboard（100px・15°・10°）／touchZoomRotate／touchPitch、
                                    および慣性（linearity 0.3、pan/zoom/bearing/pitch でそれぞれ減速度が違う、
                                    直近160msの窓、bezier(0,0,0.3,1)）。**定数と式は同梱の maplibre-gl から転写**し、
                                    `tests/r182-checks.test.mjs` が**その node_modules を読んで**突き合わせる。
                                    カメラは必ず `view.setCamera()` 経由（`Cartesian3` に触らない）。
  view-controls.js                  (#R171) 視点まわりの2つの設定＝`IntMapTilt`（地図の傾きの上限）と
                                    `IntMapEyeAlt`（常時表示欄の視点高度）。**engine だけで書かれた3本目**
                                    （生 `map` を一切参照しない）。
                                    (#R172) 無制限のときは engine に `setTiltPivot('eye')` を頼み、**傾けても視点は
                                    1mm も動かない**（幾何は engine 側。ジェスチャは一切作り替えていない）。
                                    (#R173) その約束が**最終フレームで破れていた**のを直した（§19 #R173 ②）。
                                    (#R174) その視点固定が**ズームまで飲み込んでいた**のを直した——固定は「姿勢の変化」
                                    に対してだけ効くべきで、ズームは視点を動かすもの（§19 #R174 ②）。
                                    (#R176) engine 側の解を**メートルからメルカトル単位へ**移した。#R172〜#R175 は
                                    `110,574 m/度`で換算する接平面の上で解いており、それが真なのは見込み距離が
                                    地球に比べて小さいあいだ（z12 で 16 km・z3 で 8,573 km）だけ。実測で z3 の
                                    視点は 22,218 km ずれ、旧 `|lat|>89.5` ガードが `{}` を返したフレームで
                                    23,152 km 跳んだ。**4ラウンド 0 m と報告してきたのは、視点を測る
                                    `eyePosition()` が補正と同じ式だったから**（§19 #R176 ①）。6KB
                                    (#R177) そのメルカトル解も**半分しか正しくなかった**。レンダラのカメラ模型は
                                    **2つ**あり、`globe` は両方を使う（z12 未満は vertical-perspective、以上は
                                    mercator）。球のカメラは**球面に溶接された点**を軸に回るので平面の代数では
                                    書けない——実測（描画行列そのものから逆算）で globe z3 のずれ 7,115 km・
                                    視点高度 8,573 km→1,948 km。メルカトルでも**merc-z を保つことは高度を保つこと
                                    ではない**（merc-z は centre 緯度の円周で割る量。トロムソでは傾け中に centre が
                                    3.3°北上し単位が16%縮む＝64.4 km）。→ 幾何は `gEye`／`gSolve` に**1つだけ**置き、
                                    `eyePosition()` も同じものを呼ぶ（§19 #R177 ①）。傾きが何を消費するかは
                                    模型ごとに**決まっている**——平面は注視点の標高、球は**ズーム**（軸が球面にあるので
                                    他に自由度がない）。上限を外していないとき（78°）はフックを外すので**完全に不変**。
  drone-nav.js                      (#R174) **ドローン航法 `IntMapDrone`**。地図上のウェイポイント（緯度・経度・高度）で
                                    飛行経路を作り、**実地形の DEM を経路に沿ってサンプリング**して総飛行距離・立体経路長・
                                    予想飛行時間・高度推移・地上高・最大必要高度・推定バッテリー消費、そして**条件を
                                    満たさない地点とその理由**を返す。経路・ウェイポイント・危険地点は 3-D で描画
                                    （区間ごとの `fill-extrusion` リボン＋地上への支柱）。地形は `HOST.warmDEMTiles`／
                                    `HOST.demElevBilinear`（既存の keyless terrarium DEM）、描画は `IntMapGeoEngine`
                                    のみ。**カメラを一切奪わない**（フライトシムとの決定的な違い）。
                                    高度は**ウェイポイントごとに AGL/AMSL の別を保持**し、両方を常に表示する。
                                    気象・風・建築物・電線・飛行禁止区域・有人機・他機・緊急着陸地点は
                                    `registerHazardSource()`／`registerWindField()` の2つの継ぎ目に入る。29KB
                                    (#R176) 「DronesはMeasureに置くな。どこにも置くな。」——**ツールバーとモバイル
                                    シートのボタンを全撤去**し、`#btn-tool-drone` を探すコードも消した。**機能は無傷**で、
                                    Atlas の `drone` アクションと `tool` アクション（`IntMapDrone.toggle()` を直接呼ぶ）
                                    から従来どおり開ける。

  drone-ops.js                      (#R184) **ドローンの運航条件 `IntMapDroneOps`**。#R174 が宣言だけして埋めなかった
                                    2つの継ぎ目（`registerWindField` / `registerHazardSource`）を**実データで埋める**
                                    モジュール。drone-nav.js の中身は書き換えず、公開APIから**外側から刺す**ので、
                                    このファイルが無くてもプランナーはそのまま動く。
                                    ① **高度別・時刻別の風**——Open-Meteo のモデル面 10/80/120/180 m を
                                    **面と面の間だけ内挿**し（180 m より上は外挿せず 180 m の値を使い、そう明記する）、
                                    区間の **ETA の時刻**で読む。取得は `IntMapWx.guardedJSON`（アプリ唯一の
                                    サーキットブレーカー #R183）経由。不可のときは MET Norway で、**それは 10 m の風**
                                    だと所見に書く。along-track 成分は対地速度・時間・電力へ、cross-track 成分は
                                    「傾けて保つ分の電力」として別の所見に。
                                    ② **帰投分の電池**——同じ風の中を戻る往復で使用可能容量と比べる。
                                    ③④ **通信可能範囲と視通**は同じ地形走査で1回に。地球の曲率・大気屈折・
                                    第1フレネルゾーン・ナイフエッジ回折は `IntMapLOS._phys` を**再利用**
                                    （2つの道具が「遮られた」の意味で食い違わないため）。自由空間損失は Friis。
                                    ⑤ **飛行禁止・制限区域**は OSM（空港・ヘリポート・軍用地・原子力・刑務所・
                                    保護区・国立公園）を Overpass から。⚠ **`out center` ではなく `out tags bb`**
                                    ——中心点だけでは緩衝距離 0 の面（軍用地・国立公園）が「重心から 0 m 以内」に
                                    退化して**一度も発火しない**。パネルは「これは目安であって航空当局の許可ではない」
                                    と明記する。
                                    ⑧ **緊急着陸地点**は OSM の開けた土地 × **DEM で測った傾斜 8°以下**、
                                    かつ定格降下率で**実際に到達できる**ものだけ。
                                    ⑦ **最短／最省電力／最安全**は同じウェイポイント上の**3つの実計算**（比較後は
                                    元の経路に戻す）。⑨ **帰投経路**は経路上の最高地形＋最低地上高まで上昇→水平移動→
                                    降下。⑩ **他機との干渉**は水平・垂直・**時刻**の3次元で最接近を出す。30KB
  aircraft-detail.js                (#R175) **ライブ航空機の詳細カード `IntMapAircraftPanel`**。機体をクリックすると開く。
                                    ①**その機体そのものの写真**——ADS-B が報告する ICAO 24bit アドレスで
                                    planespotters.net の公開写真API（キー不要・CORS可・非商用無料）を引く。型式の
                                    イメージ写真ではなく**当該機体**。写真が無い機体は「無い」と言う（他機の写真は出さない）。
                                    撮影者クレジットと元ページへのリンクは**ライセンス要件**であって装飾ではない。
                                    ②ツールチップに入りきらなかった **ADS-B の全項目**（IAS/TAS/マッハ/外気温/機体周辺の風/
                                    選択高度/QNH/バンク角/真方位・磁方位/受信強度/メッセージ数…）。`adsbToPlane` が
                                    これらを保持するようになった（従来は取得しては捨てていた）。
                                    ③**「この初期条件でフライトを開始」**——機体の経緯度・**GPS高度**・**真針路**・
                                    **真対気速度**をそのまま `IntMapFlightSim.start()` に渡す。機種は ADS-B の
                                    emitter category → ICAO 型式指定 → 軍民フラグ → 実測対地速度 の順で決める
                                    （`A0`＝「情報なし」を額面どおり受け取ると 737 がセスナになる）。選んだ機体は
                                    カードに**明記**するので、外れた推定は飛ぶ前に見える。速度・高度はシムの
                                    実際の飛行包絡線（`IntMapFlightSim.spec()`＝数値の複製ではなく参照）に収め、
                                    収めたときは**理由をカードに書く**。地表高度は既存の DEM サンプラで測る。
                                    UIは `.country-popup` を再利用（独自UIを作らない #R148）。5言語。11KB

  satellites-live.js                (#R184) **人工衛星レイヤー `IntMapSatellites`**（レイヤーID `sats`）。
                                    「Live aircraft trafficの要領で」＝実フィード・実伝播・ホバー・クリック・
                                    軌跡・凡例のフィルタ・不透明度・Atlas。**このモジュールだけが npm 依存を持つ**
                                    （`satellite.js`／MIT）。SGP4/SDP4 を自作しない理由はファイル冒頭に：
                                    近地球分岐だけでは**周期225分未満**しか有効でなく、GEO と Molniya が
                                    もっともらしく間違った場所に出る。検証は Vallado の標準ベクトルに対し
                                    **誤差 6.8e-9 km**、実データの ISS に対し 422.8km／7.66km/s／92.96分／51.631°。
                                    **描画は直下点**（高度は数値として持ち、高さにはしない——静止衛星は地球半径の
                                    5.6倍で、実尺は画面外・「ほどよい高さ」は捏造）。代わりに**実際の幾何**である
                                    フットプリント `acos(Re/(Re+h))` と前後1周の地上軌跡を描く。
                                    ⚠ **`shadowFraction(sunEciAU, satEciKm)` は「太陽の位置」を取る**——
                                    `Date` を渡すと NaN を返し、**全天体の日照判定が無音で null になる**
                                    （`sunPos(jday(t)).rsun` が正しい。ISS 1周で 57分照射／36分食＝実測どおり）。
                                    フィードは CelesTrak GP/OMM（キー不要・CORS可）。**`load()` は群ごとに合流**
                                    ——「取得中」を「無い」と答えると、レイヤーとプレビュータイルの**後から呼んだ方が
                                    空**になる。`paint()` は**先に伝播し、後で描く**（描けないときも state は正しい）。
                                    観測者からの仰角・方位・斜距離・ドップラーと**次回通過**は探索で解く。
                                    **(#R185) 既定は `active`＝運用中の全衛星**（要素は GP JSON でなく **TLE 形式**で
                                    取得＝6.8MB→約2.5MB・数値は同一。SGP4 は実測 **1.94µs/天体**なので1万1千天体で
                                    21ms／tick は天体数に応じて 1→2→3 秒）。**出所は4系統**——CelesTrak →
                                    公開CORSプロキシ2種 → **同梱カタログ `data/tle/`**（`scripts/build-tle-snapshot.mjs`
                                    が CelesTrak、不達時は SatNOGS DB から生成。CI が定期更新）→ localStorage キャッシュ。
                                    ⚠ **同梱カタログは最後の砦ではなく「床」**——同一オリジンで数ミリ秒で届くので
                                    **最初に読んで即描画**し、ライブが答えたら差し替える（後回しにするとネットワークの
                                    タイムアウトを待つ間ずっと空になり、結局「何も表示されない」）。どの出所を使ったかは
                                    `state().bundled` と画面文言に出る。**アイコンは地上軌跡の方位へ回す**
                                    （慣性速度をECFへ回して地球自転 ω×r を引き、直下点のENUで読む＝再伝播なし）。
                                    軌道帯（LEO/MEO/GEO/HEO）で色と大きさの違うハローを敷き、**名前は600天体以下の
                                    ときだけ**（`text-optional` は候補から外さない）。
                                    ⚠ **SGP4 は一部の要素集合で黙って発散する**（エラーを返さず位置だけが嘘に
                                    なる。実測 ASTROCAST-0201 が9,244,632km・MENUT が238,361km——どちらも
                                    平均運動16回転/日＝90分周期）。判定は高度ではなく**その物体の軌道**で：
                                    SGP4 自身の半長軸が決める遠地点 a(1+e) の1.5倍を超えたら捨てる
                                    （IMP-8 は本物の270,956km で1.04倍＝残る）。80km未満は再突入。
                                    捨てた数は `state().diverged`。26KB
                                    同梱カタログの更新は `.github/workflows/tle-refresh.yml`（1日2回）。
                                    ⚠ **main へは push できない**（ruleset が pull_request 必須・
                                    bypass_actors 空＝`github-actions[bot]` も対象）ので**PRを開く**。
  satellite-detail.js               (#R184) **人工衛星の詳細カード `IntMapSatPanel`**。航空機カードの `.acp-*` を
                                    そのまま使う（第2のUI語彙を作らない）。軌道種別は**フィードのラベルではなく
                                    周期・離心率・傾斜角から導く**。遠地点／近地点は平均運動と離心率から
                                    `a=(mu/n²)^⅓` で。**写真は無い**——衛星カタログには機体写真のような
                                    per-object かつライセンスの明快な無料ソースが無く、「代表写真」は別物の写真
                                    だから（標準指示4）。軌道要素の**元期からの経過時間**を必ず出し、3日を超えたら
                                    「概算として扱え」と書く。5言語。13KB
  newsgeo.js                        (#R161) **非AIニュース地点解析エンジン `IntMapNewsGeo`**（決定論・単一の真実の源）。
                                    index.html から `<script src="js/newsgeo.js">` で読み込み、同一ファイルを
                                    `supabase/functions/_shared/newsgeo.js` にミラー（`scripts/sync-newsgeo.mjs`／
                                    static-checks がドリフトを検出）＝ブラウザとEdge Functionが同じ見出しを同じ地点へ。

supabase/
  functions/_shared/newsgeo.js      (#R161) 上記の**自動生成ミラー**（Edge Function は functions/ 外を import できない）
  functions/ai-proxy/index.ts       アカウント制AIプロキシ（鍵はサーバー側、1日上限）
  functions/refresh-news/index.ts   ニュース取得＋AI地点解析＋current_news 書き込み（cron）
  functions/monitor-run/index.ts    Area Monitors 定期実行（cron＋ユーザー今すぐ実行）
  functions/sv-cov/index.ts         (#R145) Street Viewカバレッジ svv タイルの ACAO 付与プロキシ（キーレス・公開・厳格allowlist）
  supabase_news_setup.sql           current_news スキーマ＋index＋RLS＋cron例（一度だけ実行）
  supabase_bug_reports.sql          bug_reports スキーマ＋RLS（一度だけ実行）
  .temp/linked-project.json         supabase CLI のリンク先（project ref）
```

---

## 3.1 index.html の分割方式 (#R162) — **今後の分割はこの手順に従うこと**

**前提（これが全ての難しさの源）**: アプリコードは
`window.addEventListener('DOMContentLoaded', () => { …分割前は約33,000行／#R169 時点で約4,900行… })`
という**ひとつのクロージャの中**にある。
**#R175 以降、そのクロージャは index.html ではなく `js/app-body.js` にある**（Vite がバンドルできるように
移した。中身は1文も変えていない）。以下の記述で「index.html のクロージャ」とあるのは `js/app-body.js` の
ことだが、**性質は何も変わっていない**——module のトップレベルも classic script と同じくグローバルではないので、
下の危険性と手順はそのまま有効である。
したがって最上位の `let`/`const`/`function` は**グローバルではなくクロージャ変数**であり、`window` には載っていない。
ファイルを js/ に出すと、その変数は**ただ消える**。

**なぜ危険か（#R162 で実際に踏んだ）**: このコードベースは軟らかい依存を
`typeof X !== 'undefined'` で守り、処理を `try{}catch{}` で包む。よって参照が消えても**例外は出ない**——
分岐が黙って丸ごとスキップされるだけ。実際 `js/monitors.js` は `radiusItems` を失い、
`activeArea()` が「範囲が未選択」に落ちて、**エラーゼロのまま半径→監視の機能だけが消えた**。
Playwright の monitors テストが拾わなければ本番に出ていた。

**手順**
1. **依存を機械的に確定する。** 正規表現でスコープ解析をしてはいけない（#R162 では自作スキャナが正規表現リテラル
   `/['"]/` を文字列開始と誤読し、以降を全部空白化して「依存なし」と**嘘の合格**を出した）。
   `scripts/check-split-scope.mjs`（acorn による実パーサ）を使う。static-checks 経由で CI 必須。
2. **依存は明示的に渡す。** 出したモジュールは**ファクトリ**にし、index.html の元の位置で呼ぶ：
   `window.IntMapMonitors = window.IntMapModules.monitors(map, IM_HOST);`
3. **可変か不変かで渡し方を変える**（**最重要**）
   - **再代入されない値**（`map`＝boot時に1回だけ代入 / `countryStats`＝常に in-place 変更 /
     `const` / 関数宣言）→ そのまま引数で渡してよい。
   - **再代入される値**（`currentLang` 言語切替 / `currentUser` ログイン / `currentMode` タブ切替 /
     `radiusItems` は `clearAllRadius()` 等が**配列ごと差し替える**）→ **必ず getter** で渡す。
     引数でコピーするとクロージャと違って**値が固まり、黙って古い値を読み続ける**。
4. **純データ**（i18n・地名表・出典表）は `window.IntMapXxx` に置き、index.html 側で `const x = window.IntMapXxx;`
   と束縛し直すだけでよい（実行時に変更されないことが条件）。
5. 読み込みは**素の `<script src>`（classic script）**。`type="module"` は使わない——
   DOMContentLoaded より前に同期実行される必要があり、**ビルド工程を持たない**方針も維持する。

### (#R209) 第2の軸 — **「どのファイルに置くか」ではなく「いつ取りに行くか」**

#R162〜#R208 の分割は**保守のための分割**（1ファイル1主題）で、112本になった今も
**src/main.js が起動時に全部 import する**ので、ブラウザは全部ダウンロードして解析して実行していた。
#R209 が足したのはもう一本の軸——**利用者がその機能に触れるまで取りに行かない**。

**機構**: `js/lazy-modules.js` が `export function makeLazyModules(HOST)` を出し、js/app-body.js が
名前で import して boot 早期に1回呼ぶ。publish されるのは `window.IntMapLazy`：

```js
window.IntMapLazy.need('seismic')   // → Promise。ファイルを取り、ファクトリを呼び、検査して解決する
window.IntMapLazy.ready('seismic')  // → 既に来ているか（状態を読むだけの呼び出し元用）
window.IntMapLazy.hint('seismic')   // → 先に取り始める。誰も待たない
window.IntMapLazy.names()           // → 遅延モジュールの一覧
```

**遅延にしてよいファイルの条件（#R166 #2 が門として表明している）**
- ファクトリを呼んだ瞬間に**共有 UI を作らない**こと。具体的にはレイヤー行（`#layer-dropdown` の
  チェックボックス）を作らず、`IntMapLayers` にレイヤーを登録しないこと。
  ⚠ **js/data-layers.js と js/layer-packs.js はこの条件を満たさない**——起動の進捗ゲートと
  セッション復元が、そのレイヤー行が起動時に存在することに依存している。
- 入口が数えられること。右クリックメニュー・タブ・設定のボタン・Atlas の dispatch ケースのように、
  **利用者の操作から始まる**経路だけであること。

**書き方（門が全部決めている。詳細は js/lazy-modules.js のヘッダ）**
1. 動的 import は**リテラル・シングルクォート・`./` 相対・平らなファイル名**。他の形は
   `scripts/static-checks.mjs` から見えず「誰も import していない」で落ちる。
   ⚠ **走査はコメントも読む**ので、ヘッダに見本を書いてはいけない。
2. `window.IntMapModules.X(` という**文字列**が index.html / js/app-body.js / js/geo-engine.js /
   **app-body が `from` で import している兄弟**のどこかに要る → ローダは app-body の兄弟。
3. `src/main.js` の import 一覧から**外す**（両方にあると結局起動時に落ちてくる）。
4. ファクトリ鍵を `MODULE_FACTORIES` から `LAZY_FACTORIES` へ移す。**起動時ガードは捨てず、移す**
   ——着地の瞬間に js/lazy-modules.js が「ファクトリが登録されたか」「global が publish されたか」を
   検査し、失敗を `window.__imLazyCheck.failed` に記録して console.error に出す。
5. **スタブを作らない。** 入口を `await window.IntMapLazy.need(...)` にする。受動的な読み手
   （`window.IntMapFlightSim && FS.active()` のような `&&` ガード）はそのままでよい。

**ベンダーも同じ軸で見る（#R209）**: `import * as turf` は**パッケージ全体**を要求し、
`window.turf = turf` が計算名で全部到達可能にするので何も落ちない。名前つき import に変えても
**`@turf/turf` が `sideEffects: false` を宣言していない**ので落ちない。**各関数をそのサブパッケージから
import して初めて落ちる**。`convex` / `buffer` は turf-jsts（332 kB）を引くので
`window.turf.ensureHeavy()` の後ろに置き、**唯一の呼び出し元（js/sims.js の到達圏ハル）が await する**。

**現在の起動経路（実測・gzip）**: main 1,192 kB ＋ maplibre-gl 277 ＋ supabase 35 ＋ geo 16 = **1,521 kB**。
遅延側は 9 chunk・134 kB gz（8 モジュール＋ turf-jsts）。Cesium 4.8 MB は #R180 以来、
MapLibre セッションでは一度も要求されない。

**計測器**: `node scripts/frame-profile.mjs --boot`（起動）／`--sweep`（フレーム時間）。
外部リクエストは全部ディスクの再生キャッシュから答えるので A/B が成立する。詳細はファイルのヘッダ。

### (#R163) `IM_HOST` — ホスト・インターフェースの全体規約への昇格

#R162 は monitors 専用のホストオブジェクトを呼び出し側にインラインで書いていた。#R163 でこれを
**index.html クロージャ先頭の唯一の `const IM_HOST={…}`** に昇格し、**分割モジュールの標準シグネチャを
`function(map, HOST)` に統一**した。以後モジュールを1本出すコストは「`IM_HOST` に getter を1つ足す」だけ。

- **メンバーは全て getter**。理由は2つあり、どちらも単独で十分な根拠になる。
  - **LIVE**: 上記手順3の可変値（`currentLang`/`currentUser`/`currentProj`/`currentMapType`/`terrain3D`/
    `radiusItems`/`countryGeo`）は実行中に再代入される。コピーで渡すと**黙って死んだ値を読み続ける**。
  - **LAZY**: getter の本体は読まれるまで評価されない。だから `IM_HOST` をクロージャの上部
    （700行台）に置いたまま、はるか下（`currentUser` は約13,000行下）で宣言される値も名指しできる。
    **TDZ を一切気にしなくてよい**。値渡しのメンバーが1つでも混ざると、この性質が壊れる。
- **`map` だけは第1引数**（boot時1回だけ代入・全モジュール本体が裸の `map` を使う）。
- **不変値はファクトリ先頭で元の名前に束縛し直す**：`const imToast=HOST.imToast, cName=HOST.cName;`。
  こうすると**移設した本体は1バイトも書き換えずに済む**。書き換えるのは可変値の参照だけ
  （`currentLang` → `HOST.lang` 等）で、その置換は**ASTで自由参照だけを対象に行い、
  逆変換して元テキストと完全一致することを機械照合**してから採用する。
- **パラメータ名は `H` ではなく `HOST`**。#R163 で `H` を試したところ、出したばかりの7本の中だけで
  **5箇所の `H`（Height / Hourly / 積分ステップ）と衝突**していた。ローカルの `H` がパラメータを隠すと
  そのスコープの `H.lang` は静かに `undefined` になる——#R162 と同じ「エラーゼロで機能が消える」形。
  `scripts/check-split-scope.mjs` が **`HOST` を隠す宣言を CI で落とす**。

**分割候補の見つけ方**: クロージャ最上位の文をASTで列挙し、サイズと「クロージャ変数への自由参照の数」を
並べる。**依存が少なく大きいものから出す**。#R163 の7本は 566KB で依存は延べ10種類しかなかった。

**守り（すべて CI）**
- `scripts/check-split-scope.mjs` … 実パーサ(acorn)で3種を検証。
  ① js/*.js のどのファイルも index.html のクロージャ変数を**自由変数として参照していない**。
  ② (#R163) **実行時に何にも解決しない自由識別子**がない＝ブラウザ組込みでもクロージャ最上位名でも
     `window.X` でもない名前。①は「クロージャ最上位名」しか見ないので、**別のIIFEの中で宣言された名前への
     参照はすり抜けていた**。#R163 でこれを追加したところ既存の**3件の死んだ参照**が出た（下記）。
  ③ (#R163) モジュール内に **`HOST` を隠す宣言がない**。
- static-checks §8 … 未読込のモジュール／呼ばれていないファクトリ／**移設元に残った重複コピー**／`<style>` の再インライン化を検出。
- `tests/r162-checks.test.mjs` / `tests/r163-checks.test.mjs` … 手順3の不変条件を固定
  （`map`/`countryStats` は再代入されない・可変値は **`IM_HOST` の getter である**・
  **モジュール内に可変値の裸の識別子が残っていない**・boot ガードが全ファクトリを名指ししている）。
- `tests/r163.spec.js` … **実ブラウザで7本すべてを実際に動かす**。静的検査は #R162 の
  「エラーゼロのまま機能だけ消える」を原理的に検出できない。特に**言語をJPに切り替えて、
  bootで構築済みのモジュールが新しい言語を読むこと**を確認＝getter が live である証明。
- `tests/app-source.mjs` … R1xx の文字列一致テスト群は index.html だけでなく **css/ + js/ を連結した「アプリ全体のソース」**を読む。
  さもないと「行が別ファイルに動いただけ」で `gone()` 系の判定が**誤って緑**になる。

**(#R163) 分割で見つかった既存の死んだ参照（挙動は分割前と完全に同一・今回は修正していない）**:
`typeof X!=='undefined'` で守られた参照のうち3件は、**分割前から別のIIFEの中の名前を指していて到達不可能**
だった（＝ガードは常に false／常にフォールバック）。`check-split-scope.mjs` の `KNOWN_DEAD` に
根拠付きで登録してある。修正すると挙動が変わるため、リファクタとは別ラウンドで扱う。
- `js/compare.js` の `layerDates` … 実体は layers IIFE 内（#R164 から js/data-layers.js）。生きた値は `window._imLayerDates`。
- `js/time-borders.js` の `whenStyleReady` … 実体は layers IIFE 内（同上）。**#R140 の style-ready リトライは一度も動いていない**。
- `js/flight-sim.js` の `clearHl` … 実体は IntMapConsole IIFE 内。
- (#R164) `js/widgets.js` の `closeSheet` … 実体は `initMobileUI()` のスコープ内。ガードは分割前から常に false
  （モバイルシートは自前のハンドラで閉じる）。
- (#R166) `js/map-ui.js` の `withCountries` … 実体は layers IIFE（現 js/data-layers.js）。ラベルポップアップの
  `typeof withCountries==='function'` は分割前から常に false ＝常に素の `fill()` 経路。
- (#R166) `js/map-ui.js` の `opacities` / `setLayerOpacity` … 同じく layers IIFE の中。**レイヤープリセットの
  不透明度保存は分割前から一度も動いていない**（try/catch が ReferenceError を握り潰し、空の `ops` を保存）。
  修正は挙動変更になるので別ラウンド。

### (#R169) 第8弾 — **「宣言」と「実行」で切る**／11本まとめて生成／90本の巻き上げシム

#R168 で「主題」も出し切り、残った 6,894行・857文のクロージャは**どの文も他の文と絡んでいる**。
そこで切り口を変えた。**どの文が一緒にいるか**ではなく、**その文は走るのか、宣言するだけなのか**で切る。

- 857文をパーサで分類すると **277KB が純粋な宣言**（関数宣言／リテラル・関数だけで初期化される
  `const`・`let`）で、**208KB が実行する文**（DOM配線・`map.on()`・ブート手順）だった。
- **宣言は「いつ評価しても観測できる違いが無い」**。だから 11本のファクトリを**まとめて `map` 生成直後に
  生成**してよく、`(#R167)` で踏んだ TDZ も、`(#R166)` で気にした呼び出し順も、原理的に発生しない。
- **実行する文は1文も動かしていない。** 位置も順序もそのまま index.html に残る。
  → **このラウンドは副作用を1つも並べ替えていない**、というのが最大の安全性の根拠。

**この切り口で新たに必要になったもの**

1. **巻き上げシムが約90本に増える。** 出した関数のうち index.html がまだ名前で呼ぶものは
   `function n(){ return IM_X.n.apply(this,arguments); }` を残す（`const` は TDZ、アローは `this` 落ち。#R168 と同じ理由）。
2. **`IM_HOST` が 201→253メンバー**（うち read-write は 29→52）。
   RW が増えたのは「**主題の私有状態でも、宣言だけを出すと変数の宣言文は index.html に残る**」ため
   （例: `let elevTimer, lastElev, _elevSeq, _crLng, _crLat, lastLayerVal;` は1文で6名前を宣言していて、
   そのうち2つは index.html 側の `map.on()` ハンドラも書く。文は分割しない方針なので、
   宣言は残して RW メンバーで書き通す）。
3. **検証（tests/r169-checks.test.mjs）**
   - **#4 宣言だけであることをパーサで証明**：ファクトリ直下に実行文が無い＋初期化子が何も呼ばない。
   - **#3 位置**：11本の呼び出しが `map` 生成後に1ブロックで並ぶ＋**呼び出しより前に走る文から、
     出した名前へ到達する呼び出し経路が無い**ことを**コールグラフを辿って**確認（直接呼び出しだけ見ると
     1段挟んだ経路を見落とす）。
   - **#2 シム契約**：エクスポート名ごとに index.html のシムはちょうど1つ・本体はもう index.html に無い。
   - **#5 バレ識別子ゼロ**／**#7 `check-split-scope.mjs`**（#R162 以来の必須ゲート）。
   - r165-checks の RW 契約に **prefix `++HOST.x` も書き込みとして数える**修正を入れた
     （`++HOST._elevSeq` が今まで「所有者でないモジュールの書き込み」検査をすり抜けていた）。

**このラウンドで見つけた事実（コードは変えていない）**: `openArticleInSidebar`（サイドバー内リーダー）は
**#R11 の「Read を外部リンクに戻す」以降、どこからも呼ばれていない**。削除も再配線も製品判断なので、
`js/article-reader.js` の冒頭に所見を書いて**そのまま**出した。DEV-NOTES R169 参照。

### (#R168) 第7弾 — **主題（SUBJECT）で切る**／巻き上げシム／RW所有者は集合へ

#R167 は「自己完結したブロックは尽きた」と報告した。それは**文（statement）**については正しい。
AST で残り 929 文を測ると 1文あたりの自由参照は 10〜36 で、単独で出せる文は無い。
しかし**独立している単位は文ではなく主題**だった：

> **種になる関数から出発し、「宣言する名前を外部の誰も読まない文」を吸収し続ける**（＝私有ヘルパーの推移閉包）。
> 吸収するたびに集合は大きくなるが、**外部依存の面は増えずに減る**。

この `privateClosure` を6つの種（countries / news / companies / tool-panel / auth / community）に適用したところ、
**102文・224KB・2,018行**が取り出せ、外部依存は 24〜48、外部書き込みは 3〜7 に収束した。
**6集合は互いに素**で、**全メンバーが宣言文**（FunctionDeclaration か VariableDeclaration）＝
副作用を持つ文はゼロだった。これが以下の2つを同時に可能にした。

**新機構① 巻き上げシム（hoisted shim）**。これは **index.html が名前で呼び続ける関数を初めて出した回**。
出した関数ごとに index.html へ1行のシムを残す：

```js
function renderStats(){ return IM_COUNTRIES_UI.renderStats.apply(this,arguments); }
```

- **必ず関数宣言**。元の実体も巻き上げ関数宣言だったので、**ファクトリ呼び出しより前にある呼び出し箇所**
  （`IM_HOST` の getter は約1,300行上にある）が一切変わらない。`const`/アロー にすると TDZ か `this` 落ちになる。
- **`.apply(this,arguments)`**。レシーバも引数リストもそのまま透過する。
- 効果として**モジュール間の相互参照が自動的に安全**になる：news が `renderStats` を、companies が
  `setupIntelLayers` を呼んでも、行き先は index.html のシム1本に集約される。
- `tests/r168-checks.test.mjs #2` が「返り値リスト＝シムの集合」「シムは index.html に**ちょうど1つ**」
  「index.html に実体の再宣言が無い」を固定する。

**新機構② 宣言専用ファクトリ（declaration-only）＋1か所での生成**。6本は
**`map` 生成直後（index.html 2,209行付近）の1ブロックでまとめて生成**する。元の文があった位置ではない。
これが安全な理由は3つあり、**すべて機械検証している**：
1. **ファクトリは実行時に何もしない**。`tests/r168-checks.test.mjs #4` が各ファクトリ本体の最上位文が
   宣言と `return` だけであること、かつ**変数初期化子が何も呼び出さないこと**を acorn で検証する
   （＝#R167 の TDZ 罠が原理的に起こらない。閉包の値をファクトリ時点で読まない）。
2. **`map` は1回しか代入されない**（`tests/r168-checks.test.mjs #3` が代入箇所が1つであることも検証）ので、
   生成位置を早めても掴む値は同じ。
3. **クロージャ評価中に移設した名前を使う文は全部で5つしかなく**、いずれも生成ブロックより後ろにある
   （`layerPreviews(…loadCountryData…)` / `window.renderCompanies=` / `window.showCompanyDetail=` /
   `window._imOpenSetPassword=` / `bootSupabase();`）。#3 がこの5つの位置関係を固定する。
   さらに **js/ の他モジュールの生成呼び出しは全部このブロックより後ろ**にある。

**規約の拡張：RWメンバーの所有者は「1ファイル」から「ファイル集合」へ**。#R165〜#R167 はたまたま
全RWメンバーの書き手が1つだった。主題ごと出すとそうはならない——半径/計測の値は
**Atlasコマンドとユーザーがドラッグするツールパネルの両方**が設定し、ブックマークは
**ニュースフィードとアカウントメニューの両方**が触り、ニュースピン配列は**時計を動かしたときと
AI地点付与が終わったとき**の両方で入れ替わる。1所有者ルールは「事実でないことにする」でしか満たせない。
そこで `tests/r165-checks.test.mjs` の `owner` を **`owners` 配列**に一般化した。監査上の性質は不変で、
今も強制されている：**メンバーごとに書いてよいファイルの列挙が明示的かつ網羅的で、
列挙した全ファイルが実際に書いており、それ以外は一切書かない**。RWは10→**29**、IM_HOST は 123→**230アクセサ**
（getter 201＋setter 29）。**重複アクセサ検出**も追加した（同名 getter を2回書いても JS は通り、後勝ちで静かに壊れる）。

**証明（`tests/r168.spec.js`・実ブラウザ）**。setter が無い代入は classic script では**静かに no-op**なので、
「エラーが出ない」は無証明——各アサーションは index.html 側に**裸の閉包変数から再導出**させる：
- `measurePoints` … ツールパネルの Clear が `HOST.measurePoints=[]` → **index.html の `refreshTool()`** が
  `tool-source` を作り直す＝地図から線が消える（消えなければ書き込みが届いていない）。
- `radiusKm` … パネルのスライダが `HOST.radiusKm=v` → **index.html の `window._radiusFromPoint()`** が
  裸の `radiusKm` を新しい円に焼き込む → 円の緯度スパンで判定（150km≒2.7° / 旧既定1000kmなら≒18°）。
- `bookmarks` … 追加は `push`（getter だけでも通る）→**削除の `HOST.bookmarks=filter(…)` が判別子**。
  Saved タブの中身は **index.html の `computeFilteredNews()`** が裸の配列から決める。
- `renderedCount` … `HOST.renderedCount+=n`。**index.html のスクロールハンドラ**が
  `renderedCount<newsFiltered.length` で次バッチを判断する＝書き込みが落ちれば同じ30件を再追加して重複する
  （45件が全部ユニークであることを検証）。
- `countryGeo`/`countryDataLoaded` … **index.html の `#cb-countries` ハンドラ**が裸の両変数から
  `addCountryLayers()` を再実行する＝地図ソースを剥がしてもチェックし直せば戻る。
- ⚠ **MapLibre 5 では `source._data` が `setData()` 後に古いまま**。読むのは `source.serialize().data`。

**証明できないものは証明できるふりをしない**（#R167 の規則を継続）。`currentUser`/`geoRaw` は実 Supabase
セッションが要る経路でしか書かれず、hermetic では到達不能（テストに実資格情報は置かない）。`dashFeatures` は
#R139 以降そもそも画面上の帰結が無い。`js/community.js` の DOM は `loadCommunity()` が Supabase を待つうえ
**コミュニティフィードのモードは専用ボタンを持たない**（コミュニティピンのクリックだけが入口＝投稿ゼロならピンもゼロ）。
いずれも `tests/r168.spec.js` 冒頭に理由付きで明記し、ソースレベル（r165/r168-checks）で固定した。
なお community フィードが空なのは**分割由来ではない**ことを、同じプローブを **main (730b401) でも実行して確認**した
（#R166 のフレーク誤帰属の教訓の再適用）。

**抽出は #R167 と同じく決定論スクリプト**（acorn で範囲確定＝直前コメント塊と行頭インデントを含める →
自由参照だけ `HOST.x` に書換 → **逆変換して元テキストとバイト一致照合**）。今回追加した安全弁：
- **モンキーパッチ検出**。出す関数が他所で再代入されていて、かつ**集合内から呼ばれている**なら出せない
  （モジュール内の呼び出しがパッチを迂回する）。実際に `renderUI` が唯一該当し——調べると
  再代入は index.html:9353、**`return;` で始まる死んだ IIFE（#R22 で撤去された ACLED カード）の中**で、
  しかも集合内から `renderUI` を呼ぶ文は無い＝二重に安全と確認して出した。
- **変数のエクスポートは禁止**（シムは関数にしか作れない）。`extendedDashDB` はこれで候補から外し、
  宣言を index.html に残して `HOST.extendedDashDB` 経由に留めた。

### (#R167) 第6弾 — 「大きな塊」ではなく**継ぎ目**を選ぶ／純データ／TDZ
#R166 までで自己完結した塊は出し尽くし、index.html に残ったのは**中核**（状態・ブート・地図構築・
ニュースパイプライン・認証・描画ツリー）で、AST実測でも1文あたりの自由参照が10〜36ある。
そこで #R167 は**大きさで選ぶのをやめ、2つの継ぎ目で切った**。

**継ぎ目① 純データ（`js/tables.js`・91KB・27表）** — §3.1 手順4の全面適用。ファクトリもホストも使わず、
`window.IntMapTables` に載せて index.html 側は `const {GDP,HDI,…}=window.IntMapTables;` と束縛し直すだけ。
- **値渡しが安全な根拠を機械で証明してから出す**。「純データ」は目視の主張ではないので、
  `tests/r167-checks.test.mjs #3` が index.html 全体をacornで走査し、**メンバー代入・`delete`・
  破壊的メソッド（push/splice/sort…）が1件も無い**ことを検証する。1件でもあれば共有状態＝出せない。
- **`window.SEA_LABELS` だけは束縛し直しすら要らない**（元から `window.` 経由で読まれていた）。
- **表が空でも例外は出ない**のが怖いところ（国カードが「データ無し」に見えるだけ）。だから
  `tests/r167.spec.js #2` は**値**を検証する（`GDP.USA===27361` / `CAPITAL.JPN==='Tokyo'`）だけでなく、
  **消費側**まで確かめる：地理レイヤー行が建つこと、そして DE/ES の見出しが非AI locator で
  実際に測位できること（`_DERU_GZ`/`_ES_GZ` が `geoDB` に合流していないと測位できない）。

**継ぎ目② 残った自己完結ブロック（7ファイル・15ファクトリ）** — #R166 と同じ「主題ごとに束ねる／
元の位置で呼ぶ」形。`tests/r167-checks.test.mjs #2` が15呼び出しの並びを配列でピン留めする。

**⚠ このラウンド固有の罠＝TDZ（時間的デッドゾーン）**。#R163〜#R166 は安定ヘルパーを
ファクトリ先頭で束縛していた（`const imToast=HOST.imToast;`）。これが安全だったのは、
**その全てが巻き上げられる関数宣言だったから**にすぎない。`js/feedback.js` が要る `DB` は
`const DB=window.sb;`＝**呼び出し位置の約1,300行下で初期化される const** で、ファクトリ実行中に
`HOST.DB` を読むと **ReferenceError でモーダルごと死ぬ**。
→ **`DB` だけは束縛せず、使用箇所ごとに `HOST.DB` を読む**。`tests/r167-checks.test.mjs #5` が
①`js/feedback.js` が `DB` をファクトリ先頭で束縛していないこと、②**8ファイルすべてについて、
ファクトリ先頭で束縛している名前は index.html の巻き上げ関数宣言（または最上部の const）である**ことを
検証する＝この罠が次回以降に再発しない形で固定した。

**RWメンバーは7→10**。`globalData`/`newsFeatures`（**js/news-timeline.js** 所有：日付が変われば記事集合ごと
入れ替わる）と `extendedDashDB`（**js/dash-extended.js** 所有）。
- **⚠ 書き込みの証明で最も注意すべき点**：モジュールは classic script なので **setter が無い代入は
  例外にならず静かに無視される**。よって「エラーが出ない」は何の証拠にもならない。
  `tests/r167.spec.js #5` は index.html 側に**閉包変数から再導出させる**：
  ①過去日付を選ぶと `loadNewsCache()` が `!newsDate` で復元を拒む＝`globalData` を消し損ねていれば
  フィードは残る ②ベースマップ切替が `setupIntelLayers()` を再実行し、そこで
  `if(newsFeatures.length) setSourceData(...)` が**古い配列ならピンを地図に戻してしまう**。
- **`extendedDashDB` には画面上の帰結が無い**（#R139 で `renderDashboard()` が
  `try{ return renderCompanies(); }` で始まるようになり、カード一覧は描かれない。唯一の別読者だった
  dash-pin ホバーも、その死んだ本体しか `dashFeatures` を埋めない）。**挙動同一のために書き込みは残す**が、
  ブラウザテストでそれを証明できるふりはしない——`tests/r167.spec.js #7` は代わりに、
  他モジュールが実際に依存する `window.IntMapCache` が**リロードを跨いで IndexedDB に永続する**ことを検証する。
  RW契約自体は `tests/r165-checks.test.mjs` がソースレベルで固定（setter の存在・同一閉包変数のget/setペア・所有者一意）。

**抽出は決定論的スクリプトで行い、移設が「移動」であることを機械照合した**（手作業の転記をしない）。
acorn で対象文の範囲（**直前のコメント塊を含む**）を確定 → 自由参照だけを `HOST.x` に書き換え →
**逆変換して元テキストとバイト一致するか照合**してから採用。移設後は別スクリプトで
「モジュール本文＝分割前 index.html の該当テキスト」「27表が**値として同一**（JSON比較）」も検証した。
- 罠: acorn-walk は**代入先の識別子を `Identifier` ではなく `VariablePattern` として配る**。
  これを見落とすと `globalData=[]` のような**書き込み側だけが裸の名前のまま残る**（最初の実行で実際に発生。
  `scripts/check-split-scope.mjs` が拾った）。
- 罠: 逆変換は**プロパティ名の長い順**に行う。`user` は `userTheme` の接頭辞なので宣言順に戻すと
  `HOST.userTheme` が `currentUserTheme` になり、偽の不一致を報告する。

### (#R166) 第5弾 — 主題ごとに束ねる（41ブロック→7ファイル）と、呼び出し順の固定
#R165 までで「大きくて依存が少ない」塊は出し尽くし、残りは **5〜47KB の自己完結ブロックが約40本**という
長い尾になった。1ファイル1ブロックでは41ファイルになるので、**主題ごとに束ねて7ファイル**にした
（`map-ui` / `map-tools` / `sims` / `layer-packs` / `analysis-panels` / `weather` / `playground`）。

- **1ファイルに複数ファクトリ**。`js/history.js`（#R162 の3ファクトリ）の形を全面採用。
- **ブロック全文をそのままファクトリで包み、代入なしで呼ぶ**：`window.X=(function(){…})();` という文ごと
  包むので**移設本文は1バイトも変わらない**（#R163 のように `window.X=` を剥がして戻り値を代入する形は取らない）。
  残置検出の針も `window.X=(function(){` がそのまま使える。
- **⚠ この束ね方だけが持つ危険＝呼び出し順**。1ファイルに集まると「まとめて上で呼べばいい」と見えるが、
  これらのブロックは**共有コンテナ（レイヤー行・パネルのボタン列）に append する**ので相対順序が
  ユーザーに見える。→ **41本すべてを元のブロック位置で呼ぶ**ことを守り、
  `tests/r166-checks.test.mjs #2` が **index.html 中の41呼び出しの並び順を配列で固定**している。
- ホストメンバーは **88→104**（新規 getter 16・RW 2）。新しい可変 getter は `namesOn`/`bordersOn`/`geoDB`/
  `satPanelDismissed`、残りは安定ヘルパー（`ringArea`/`areaHTML`/`fmtLL`/`hasTurf`/`demElevAt`/
  `demElevBilinear`/`_demZoomForSpan`/`warmDEMTiles`/`layerCbInfo`/`renderLayerFavs`/`removePin`/
  `setupIntelLayers`）。
- **RWメンバーは5→7**。`js/playground.js` が2番目の書き込みモジュール：World Explorer は画面を占有するので
  **アクティブタブを外し（`HOST.mode=null`）衛星コントローラを畳む（`HOST.satPanelDismissed=true`）**。
  `tests/r165-checks.test.mjs` の RW 契約は「**メンバーごとに所有モジュールを宣言し、js/ のどのファイルも
  自分が所有しないメンバーを書かない**」に一般化した（他の全モジュールは従来どおり書き込みゼロ）。
- **#R166 で見つかった既存の死んだ参照 3件**（#R163 と同型・**分割前から到達不能**なので挙動は同一）:
  `withCountries` / `opacities` / `setLayerOpacity`。いずれも実体は layers IIFE（現 js/data-layers.js）の中で、
  参照側は兄弟IIFE。**レイヤープリセットは保存時に不透明度を1つも保存できていない**（`opacities` 参照が
  ReferenceError → try/catch で握り潰され空の `{}` が保存される）＝実在のバグだが**分割前から**同じで、
  直すと挙動が変わるため別ラウンド扱い。`check-split-scope.mjs` の `KNOWN_DEAD` に根拠付きで登録。
- **#R166 で観測した既存の不安定**: World Explorer 起動時に MapLibre が国境 FeatureCollection をワーカーへ
  再送し、その再帰シリアライザが稀に `RangeError: Maximum call stack size exceeded` を投げる。
  **同じ操作列を分割前の main で6回・分割後で6回**流して 5/6 対 6/6 ＝ **分割由来ではない**ことを確認済み
  （`tests/r166.spec.js #7` はこの1種類だけを除外し、他のエラーは従来どおり失敗させる）。MapLibre 側の別件。

### (#R165) 第4弾 — Atlasカーネルの分離と、READ-WRITE ホストメンバー規約
#R164 が見送った最大の残件 `IntMapConsole`（879KB・6,231行＝Atlasカーネル）を出した。障害だった
「**5つの閉包変数への書き込み**」（Atlasアクションが theme/units/radius/measure 状態を設定する）は、
**IM_HOST に READ-WRITE メンバー**（getter-only 規約の唯一の例外）を導入して解決：

- RWメンバーは `get x(){ return x; }, set x(v){ x=v; }` の**1行ペア**。対象は
  **measurePoints / radiusColor / radiusKm / unitMode / userTheme の5つだけ**。
- **変数の実体は index.html に残る＝単一の真実の源**。モジュールの `HOST.x=v` は setter を通って
  閉包変数に代入されるため、index.html 側コード（applyTheme/updateToolPanel/distHTML …）と
  モジュール側が**常に同じ live 値**を読む。値のコピーは存在しない。
- 規約の守り（すべて CI）: `tests/r165-checks.test.mjs` が **RWリストを固定**
  （setter の集合が宣言リストと完全一致・各 setter は同じ閉包変数の getter とペア・**所有モジュールが
  本当に全部を `HOST.x=` で書いている**・**どのモジュールも自分が所有しないメンバーを書かない**）。
  #R165 時点は**5メンバー＝Atlasカーネル専有**。**#R166 で7に拡張**（`mode`＝`currentMode` と
  `satPanelDismissed`＝js/playground.js の所有）。**#R167 で10**（`globalData`/`newsFeatures`＝
  js/news-timeline.js、`extendedDashDB`＝js/dash-extended.js の所有）。
  IM_HOST は **123 アクセサ**（getter 113＋setter 10）。
  `tests/r163-checks.test.mjs` #2 は「全メンバー plain getter」から「plain getter または RWペアの
  setter 半分（同一変数への get とペア必須）」に改定。
- 実ブラウザ証明は `tests/r165.spec.js`: **write-through**（theme アクション→`HOST.userTheme='dark'`→
  index.html の applyTheme が `<html data-theme>` を反転／units+measure→ツールパネルがマイル表示で
  2点の距離を描画）と **live getter**（JP切替後の返信が「テーマ」）。
  ⚠ `dispatch(a)` は **`a.type`** でアクションを引く（`a.action` は静かに `R(true,'')` の no-op）——
  spec は必ず返信 html も検証する。
- 新規 getter: live 3（newsDate/toolMode/userPins）＋安定 27（askAI 系・ツール系ほか）。IM_HOST は
  54→**88 アクセサ**。残置検出の針は `window.IntMapConsole=(function(){`（呼び出し行は
  `window.IntMapModules.atlasConsole(map,IM_HOST)` なので旧 IIFE 頭＝残置コピーと確定できる）。

### (#R164) 第3弾 — 「書き込みゼロ」ブロックの選定と、bare-IIFE ファクトリ
#R164 は候補選定に**もう1軸**を足した：ASTで各ブロックの**閉包変数への書き込み（代入/更新）を実測**し、
**書き込みゼロのブロックだけ**を出した（読み取りは getter で渡せるが、書き込みは setter が要る＝規約が濁る）。
`IntMapConsole`（879KB）は `measurePoints`/`radiusColor`/`radiusKm`/`unitMode`/`userTheme` の5変数に**書き込む**ため見送り。
- 出した6本のうち5本は `window.X=(function(){…})()` ではなく**裸のIIFE**。ファクトリは本体をそのまま包み、
  呼び出し側は代入なしの `window.IntMapModules.x(map,IM_HOST);` になる（workspace のみ戻り値を代入）。
- `IM_HOST` は 27→**54メンバー**（新規27・全部 getter）。新しい可変メンバー＝`unitMode`/`userTZ`/`mapTooltipEl`/
  `globalData`/`newsFeatures`/`renderUI`（renderUI の再代入は retired-ACLED ブロック内の死コードだが、getter は無コスト）。
- `js/cameras.js` は **window.* を一切公開しない唯一のモジュール**（自前で `#dl-webcams` 行を構築）。
  ブートガードのファクトリ名指し＋prod-smoke の **DOM 行検査**で欠落を検出する。
- 検査は前ラウンドを踏襲：`tests/r164-checks.test.mjs`（構造の固定＋**HOST 経由の書き込みが無いこと**）と
  `tests/r164.spec.js`（実Chromium で6本を実動作・JP切替で `kName`/カメラ行/前線行が追従＝getter live 証明）。

---

## 4. ニュース処理の流れ (News pipeline) — **R29で大きく変更**

### 4.1 サーバー側（事前処理）— `supabase/functions/refresh-news/index.ts`
1. **cron（約20分ごと）**で起動（`supabase_news_setup.sql` の pg_cron 例、または手動 POST）。
2. **Google News RSS をサーバー側で取得**（en / jp、world + business）。CORS 不要。
3. **地点解析（subject location）**:
   - **AIが第一手段**（en/jp の全記事）。`AI_PROVIDER`（anthropic/openai/gemini）でサーバー保持の鍵を使い、
     見出し＋説明から「出来事の起きた具体的な場所」を返させる。1回あたりバッチ（既定15件）、1実行あたり上限 `AI_CAP=120` 件。
   - **非AI解析はフォールバック**（AI失敗・en/jp 以外・API停止時）。**#R161 でここが決定論エンジン
     `_shared/newsgeo.js`（= ブラウザの `js/newsgeo.js` と1バイト同一）に置き換わった**——同名地の曖昧性解決・
     デートライン抑止・組織/人名トラップ除去まで行う。旧「`geo_pins`＋埋め込み辞書のスコアリング」は
     その**後段の最終フォールバック**として残置。どちらも `analyzed_by='dict'` を記録。
     `geo_pins` の運用者追加ピンは `NEWSGEO.register()` でエンジン索引にも合流（built-in より低ランク）。
4. **重複防止・再解析防止**:
   - `current_news` は `(lang, link)` で upsert → **同じURLは重複保存しない**。
   - 直近72時間の既存行を読み、**すでに `analyzed_by='ai'` の記事は再びAIに送らない**（結果を再利用）。
5. **媒体HQ** は埋め込み publisher 辞書から解決（subject とは別に保存）。
6. `current_news` に書き込み。各行に `analyzed_by`（`'ai'|'dict'|'none'`）を記録。
7. **72時間より古い行を削除**（`pub_date` 基準、`fetched_at` も保険）。

### 4.2 フロントエンド（表示）— `index.html`
- 起動時 `fetchData()`：
  1. ローカルキャッシュ（`intmap_news_cache`）があれば即表示。
  2. **FAST PATH**：`loadNewsFromSupabase()` が `current_news` を1回 SELECT → `serverRowToItem()` で整形 → `startNews()` でピン即表示。
     **フロントはニュース地点解析のためにAIを呼ばない**（AIロケートボタンも無い）。
     - **⚠️ R40で一時停止中**：`const USE_SERVER_NEWS=false`（`window.__IM_USE_SERVER_NEWS`）で FAST PATH をスキップし、**全言語**でライブRSS＋クライアント非AI解析のみを使用中（ユーザー要望「一時的に停止」）。`true` に戻せばサーバー事前解析フィードが復活。
       ⇒ **つまり本番で実際に効いている地点解析は `analyzeContext()` ただ一つ**。#R161 でその第一手段が
       `IntMapNewsGeo`（`js/newsgeo.js`）になった（§4.3）。旧 `geoDB`/`scoreGeo` 辞書（DE/RU `_DERU_GZ`、ES
       `_ES_GZ`/`_ES_DEM` を内蔵）は**エンジンが答えを出さなかった時のフォールバック**として残置し、
       さらに `_countryFallback()` が最後の砦。
  3. **FALLBACK**：検索・時系列(time-travel)・多言語モード等、サーバーが焼いていないケースのみ、
     ライブRSS（CORSプロキシ経由）を取得し、クライアントの `analyzeContext()`（非AI辞書）で解析。
- **72時間フィルタ**：`computeFilteredNews()` が72時間より古い記事を表示から除外（保存(saved)・時系列モードは除外しない）。
- ピンの「主題(Subject) / 発信元(Publisher)」切替は `current_news` の両座標を使う**表示専用トグル**（AI呼び出しなし）。

### 4.3 非AI地点解析エンジン `IntMapNewsGeo` — `js/newsgeo.js` (#R161)
**決定論**（ネットワーク無し・乱数無し・同じ見出しは常に同じ地点）。旧実装は「見出しに約2000本の正規表現を当て
最高スコアの語を採る」bag-of-words で、原理的に解けない4クラスの誤ピンがあった。エンジンはそこを構造で解く。

1. **最長一致のスパン消費** — 正規化 n-gram ハッシュ索引（ラテン/キリル文字はトークン n-gram、CJKは文字走査）。
   長い名前が必ずスパンを取るので、**トラップ項目**（`New York Times` / `Paris Hilton` / `Bank of America` /
   `Paris Agreement`）が中の地名を丸ごと飲み込む。
2. **曖昧性解決** — 1つの表記が複数の実在地に対応する場合（`Tripoli`＝リビア/レバノン、`Cambridge`＝英/米、
   `Springfield`、`Toledo`、`Georgia`…）、同一テキスト中の**国・admin1の手がかり**、**曖昧でない地点との地理的近接**、
   **著名度prior**で1つに決める。
3. **階層吸収** — 都市とその国が両方出たら都市を加点し、**親（国）を抑制**（`Kharkiv … Ukraine` → Kharkiv）。
4. **デートライン/会場の抑止** — 発話動詞の直後に来る地名（`Moscow said` / `Berlin announces`）と
   `summit in <地名>` の会場は「話した場所」であって事件現場ではないので減点（**他に候補がある時だけ**）。
   逆に `over/about/について/を巡り` で導かれる地名は**話題＝主題**として加点。
5. **イベント語の親和** — `strike/earthquake/地震/攻撃` 等の近傍にある地名を加点。
6. **大文字ガード** — 固有名詞は必ず大文字始まり（`us`≠US、`la guerra`≠LA、`male voters`≠Malé）。
   頭字語（`US/UK/WHO/LA/DC…`）は**全大文字**を要求（文頭の `Who…` が WHO にならない）。
7. **常用語の国名**（`Turkey/Chad/Mali/Niger/Guinea/Jordan/Nice`）は**裏付け**（前置詞・イベント語・階層・他の地名の
   同居）が無ければ**採らない**。
8. **確信度** — 0〜1（`confidence`）と根拠（`why[]`）を返す。答えを出せなければ `null` を返し、無理に打たない。

**データ**：約200か国（EN/JA＋DE/RU/ES別名・デモニム・首都）／都市・紛争地・海峡等 約900／admin1 約150（米50州・
日本の県・中国の省・印州・独州・ウクライナ州…）／トラップ・国際機関・武装組織・企業HQ・首脳名・政府機関メトニム 約300。
`register()` で `geo_pins` 等の運用者データを実行時に合流できる（built-in より低ランク）。**#R161b**: 運用者データは内蔵辞書と**同じ場所**を重複登録しうるので、候補が全て50km以内なら「曖昧」ではなく**重複**として1つに畳む（畳まないと国の文脈シードが消え、`Tripoli … Lebanon` がリビアに落ちる本番バグになった）。

**計測**（`node scripts/newsgeo-eval.mjs`）：ラベル付きコーパス141件で **旧61.0% → 新100%**（誤り55→0）、
開発後に書いた**ホールドアウト**63件で **旧58.7% → 新100%**。比較対象の「旧」は index.html の実配列
（`_BUILTIN_GZ`/`_EXTRA_GZ`/`_DEMONYM_GZ`/`_ORG_GZ`/`_DERU_*`/`_ES_*`）から実際に再構成した本物の旧実装。
実 Google News RSS 229本（en/ja/biz/de/es・生フィードなので実行ごとに内容が変わる）では**測位率 約67%→約81%**。未測位の大半は本当に場所の無い経済/科学記事＝**打たないのが正しい挙動**。
速度は150記事14ms（旧＝記事ごとに約2000正規表現）。

---

## 5. AI APIの使い方と鍵管理 (AI usage & key policy)

- **方針：APIキーは絶対にフロントに置かない。** BYOK（ユーザーが鍵を入力）方式は**廃止済み (R27)**。
- **アカウント制AI** — `supabase/functions/ai-proxy/index.ts`:
  - フロントの `askAI()` → `aiCallServer()` が、ユーザーのSupabase JWT を付けて ai-proxy に POST。
  - ai-proxy は (1)JWTでユーザー確認（要ログイン）→ (2)`profiles.plan` で上限決定（free=**10/日** `PLAN_LIMITS`。#R40=10→#R101=30→**#R147=10へ戻す**）→
    (3)`increment_ai_usage` RPC で当日分を原子的に消費（超過は 429）→ (4)**サーバー保持の鍵**でプロバイダ呼び出し →
    (5)失敗時は `refund_ai_usage` で消費分を返金。
  - プロバイダは `AI_PROVIDER`（`anthropic`|`openai`|`gemini`）。モデルは `AI_MODEL`（既定はプロバイダ毎、**現行=`openai` / `gpt-5.6-terra`（Responses API `/v1/responses`）**。#R147でTerraへ切替→#R148で403 no-accessのためLunaへ差戻し→**#R150で`refresh-news`プロキシ再検証(ai 61/104成功)によりTerra到達可を確認しTerraを採用**。ai-proxy `OPENAI_DEFAULT_MODEL=terra`＋`FALLBACK_MODEL=luna`（不在モデルは403/404で1回Lunaへリトライ＝耐障害）。Gemini/Anthropic経路は温存・切替可だが**Gemini 3.1 Flash‑Liteは不使用**）。
  - **#R147 Atlas scope/safety 判定層**：`SYS()` プランナー（＋`_analysisSystemPrompt()`）に「SCOPE & SAFETY」節。機微語の単語一致で全面拒否せず、**目的/対象/精度/出力の4軸**で分解→既定で**安全版を実行**（精密点→広域公開ゾーン、公開情報限定、攻撃最適化→脅威評価/到達圏/防災、不確実性・出典明示、`drawPolygon`/`radius`/`missile`/`radiation`/`impact` 等で実描画）。**全面拒否は真に有害なスライスのみ**の最終手段で、それでも「できる安全な分析」を提示。軍事/災害/感染症/化学(CBRN)/犯罪統計/サイバー/重要インフラに汎用適用。`provider_blocked` 文言も建設的（言い換え提案）に5言語。**日本語は既定で敬語**（ユーザーがくだけた口調を明示した時のみ例外）。
  - 用途：ニュースタイトル翻訳、ビューの要約、画像解析など**ユーザー操作のAI機能**。
  - **#R156 `vision_read` タスク＋`input_image` detail:high。** 画像読解専用タスク `vision_read`（JSON・`TASK_MAX_OUTPUT=3000`・reasoning medium／`effortHint:"high"` で high）を追加。OpenAI `input_image` にクライアント指定の **`detail`**（`vision_read` は `"high"`＝画像をタイル分割して小さい文字/数式/添字を読む・他タスクは既定 `"auto"` で不変）を付与。`callOpenAI` に `imageDetail` 引数、payloadに `imageDetail`（`high|low|auto` にクランプ）。本番デプロイ済。
  - **#R113 Gemini 3.5 Flash / `thinkingLevel:"low"` 移行 — 責任分離。** クライアントは**タスク種別**
    （`atlas_plan|map_report|analysis|free_text|json_extract|brief|geo_verify|geo_resolve|research_map|vision_read`）と**`webMode`**（`off|auto|required`）を送り、
    ai-proxy がタスク毎に**出力トークン上限**（`TASK_MAX_OUTPUT`。map_reportは件数比例、上限5000。旧`MAX_TOKENS=1600`固定を廃止）・
    **Structured Output**（JSONタスクは`responseMimeType:"application/json"`、map_reportはサーバー定義の`responseSchema`）・
    **Web方針**を選択。Google Search groundingは `webMode!=="off"` かつ `GEMINI_SEARCH_ENABLED==="true"`（Secret・**既定OFF**）の時のみ付与
    ＝既定のmapReportは**モデルにWeb検索させず**IntMapが集めた証拠だけで動く（Google側429を回避）。プロバイダ失敗は**分類**
    （`provider_rate_limit`/`provider_quota`/`provider_malformed`/`provider_empty`/`provider_blocked`/`provider_unavailable`）し
    **502/503で返す（429はIntMapの1日上限専用）**。`MALFORMED_FUNCTION_CALL`は**ツールを外し「関数を呼ぶな」を明記して1回だけ再試行**。
    クライアント`aiCallServer`は型付きプロバイダエラーを**日次上限とは別の**5言語メッセージ（`aiProviderErrMsg`）に対応。
    Atlasプランナーのプロンプトは「アクションの`type`名はJSONデータであり呼び出し可能な関数ではない（functionCall禁止・fence禁止）」を明記。
    `mapReport`は**証拠ID方式**に再構築：IntMapがGDELT＋Google News＋読み込み済みニュースを集め`e1,e2,…`のID付き証拠にし、
    モデルは`{name,locationName,country,summary,date,evidenceIds}`のみ返す（**座標・URL・出典を生成させない**）。クライアントが
    evidenceIdの実在を検証し、locationName+countryを**geocode**（または証拠の既知座標）して位置を確定、URL/出典/日付は**引用した証拠から**充填、
    確認できない位置はピンにせず一覧のみ。`analyze`/`brief`は付いていないWeb検索ツールを断定しない誠実プロンプトに変更。
    現実の現在日と地図のタイムトラベル日付を分離送信。**デプロイ済み**（バンドル成功＝TS検証、実機で構造化401を確認）。
    ログイン必須の実機E2Eは利用者側で実施。
  - **#R114–#R116 OpenAI `gpt-5.6-luna` 移行（Responses API `/v1/responses`）。**
    `reasoning.effort` はタスク別（`TASK_REASONING`：**atlas_plan/analysis=medium**、他=low）、`store:false`、テキスト＋画像入力。
    JSONタスク（map_report/json_extract、**OpenAI時はatlas_planも**）は `text.format:json_object`。
    **Web検索は本物**：`webMode:"required"`（brief）は `tool_choice:"required"` で**検索を強制**し、応答の `web_search_call`
    件数から `meta.webUsed/webSearches` を返す → クライアントは「As of〈日付〉・ライブWeb検索」を**実際に検索した時だけ**表示（誠実表示）。
    **障害耐性（R116）**：400は**フォールバック階段**（tool_choice解除→JSONモード解除（プロンプトJSONへ）→ツール解除）で降格、
    Web付き呼び出しは90秒（タイムアウト時はツール無し40秒で1回再試行）、空応答（reasoningが予算を食い切る）は予算増で1回再試行、
    `insufficient_quota`/支出上限は `provider_quota`（ハード）扱い。**リクエスト形の拒否がAI機能全体を殺せない**構造。
    比較（compareStats）は `metrics` パラメータをSYSカタログに明記＋5言語シノニム解決（defense→軍事費$等）で**指名指標どおり**開く。
    **#R117 以降の各ラウンドの差分は `DEV-NOTES.md` に集約 (#R169)。** ここには#R117〜#R126の
    ラウンド別変更ログが10段落ぶら下がっていた（Atlasだけでなく経路・Compare・レイヤー・UIの話まで、
    しかも R117→R119→R118→R120→R122→R123→R124→R125→R126→R121→R118 という順で）。
    仕様として残す価値があった `window.IntMapLayers`（レイヤー・データ契約）は **§7 へ移設**、
    残りは DEV-NOTES R117〜R126 に同じ内容がある。
- **ニュース地点解析AI** — `refresh-news` が**同じ鍵・同じ AI_PROVIDER 規約**でサーバー側実行（ユーザー枠は消費しない＝運用者の鍵）。
- フロントに見えるのは結果だけ。鍵・モデル選択UIはユーザーに見せない。

---

## 6. Supabase（テーブル・Edge Functions・環境変数）

**Project ref:** `vpekfwdpurzejrrmacac` / 公開(anon/publishable)キーは `index.html` の
`window.SUPABASE_URL` / `window.SUPABASE_ANON_KEY`（公開前提・RLSで保護）。

### 6.1 テーブル（フロント/管理が使用）
| テーブル | 用途 |
|---|---|
| `profiles` | ユーザープロフィール（表示名・plan・login_count 等） |
| `current_news` | **事前AI解析済みニュース**（subject/pub 座標、`analyzed_by`、`fetched_at` 他。R29で `analyzed_by` 追加） |
| `geo_pins` | ニュース地点解析の辞書（gazetteer）。管理コンソールで編集。refresh-news も読む |
| `favorites` | 保存記事（ブックマーク） |
| `user_prefs` | ユーザー設定の同期 |
| `dashboard_cards` | 情報(Information)ダッシュボードのカード（管理コンソールで編集） |
| `ai_usage` | AI利用量（1日あたりの消費）。`increment_ai_usage` / `refund_ai_usage` RPC で操作 |
| `community_posts` / `community_comments` / `community_votes` / `community_comment_votes` / `community_reports` | コミュニティ |
| `feedback` | フィードバック（3回目ログイン誘導＋設定からいつでも） |
| `bug_reports` | バグ報告（診断情報JSON付き。`supabase_bug_reports.sql`。anon が insert 可・admin が閲覧） |
| `donations` | 寄付記録 |

### 6.2 Edge Functions
- `ai-proxy` … アカウント制AI（要 `verify_jwt` 可、内部でも検証）。
- `refresh-news` … ニュース取得＋AI地点解析＋書き込み（`--no-verify-jwt` で公開、`REFRESH_SECRET` で保護推奨）。
- `monitor-run` … Area Monitors 定期実行（`--no-verify-jwt`＋自前fail-closed認証、`MONITOR_SECRET`）。
- `sv-cov` … (#R145) Street Viewカバレッジ svv タイルの**ACAO付与プロキシ**（`--no-verify-jwt`・秘密なし）。Googleのmtsタイルは Access-Control-Allow-Origin を安定して返さず、クライアントの canvas 画素サンプリング（最寄カバレッジへのスナップ）が CORS で失敗する→本関数がサーバ側 fetch して `ACAO:*` を付与。**厳格allowlist**（`mts0-3.google.com/vt?…lyrs=svv`＋整数 x/y/z のみ・空タイルは透明PNG）＝オープンプロキシではない。フロントの `_COV_PROX` ラダー（直→sv-cov→corsproxy）で使用。
- `delete-account` … (#R155) 呼出ユーザ自身のアカウント＋全データを**ハード削除**（`verify_jwt` on＋内部でも検証・`confirm:"DELETE"` 必須）。全所有行を明示purge後に `auth.admin.deleteUser`（FKカスケード設定に非依存）。秘密なし（注入される service_role のみ）。

### 6.3 SQL
- `supabase/supabase_news_setup.sql` … `current_news` 作成/拡張（`analyzed_by` 追加マイグレーション含む）＋index＋RLS＋cron例。
- `supabase_ai_usage.sql`（リポジトリ外・要作成/実行）… `ai_usage` テーブル＋ `increment_ai_usage`/`refund_ai_usage` RPC＋`profiles.plan/login_count`。

### 6.4 環境変数（Edge Functions の secrets）
- 自動注入: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- AI: `AI_PROVIDER`（anthropic|openai|gemini）, `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY`, `AI_MODEL`(任意)
- refresh-news: `REFRESH_SECRET`(任意・推奨), `NEWS_AI=off`(任意・AIを止め辞書のみにするkill-switch)

---

## 7. 地図・レイヤー・Globe・ウィジェットの構造

- **地図初期化**：`map = new maplibregl.Map(...)`。`renderWorldCopies` は投影/自由パンに応じて切替。基盤は CARTO/Esri ラスタ＋OpenFreeMap ベクタ(`ofm`)。
- **基盤切替**：`btn-view-map/sat` と `applyTheme()`＋`_reassertBase()`（スタイルロード競合に強いポーリング再適用）。
- **レイヤー欄の分類**（`reorganizeLayerPanel()` の `GROUPS`。`GROUPS` に無い行は末尾の
  「その他（beta）」へ**自動的に**掃かれる＝betaは削除ではなく1段下の節）:
  - ⚠ (#R233) **基本表示カテゴリ**（地名・国境・州県境・道路・鉄道・グリッド・国情報）に
    **昼夜の表示（`dl-nightside`）が入る**。災害カテゴリの1レイヤーではなく「地球のどちら側に
    太陽があるか」という常設のビュー切替だから。⚠ 行は1つ（`rowFor('nightside')` を `placed` に
    入れないと、掃き出しで beta にも現れて二重になる）。
    - ⚠⚠ (#R235) **そして「基本表示に置く」だけでは足りなかった**——「昼夜の表示は他の基本表示と
      同様に、**レイヤーとして扱うな**」。#R233 の後も `dl-nightside` は他の9つと違い
      `_refreshActiveLayers()` の `skip` に**入っていなかった**ので、①「Active レイヤー」にチップを取り、
      ② `window._imActiveLayerCount` を通じて**携帯の FAB をテーマレイヤーが入っているかのように着色**し、
      ③ `js/widgets.js` の `FEAT_IDS`（「まだ知らないレイヤーを引く」ルーレット）に載っていた。
      3つとも外した。⚠ **行そのものは基本表示ブロックに残っている**（分類の変更であって削除ではない）。
      プレビュー画像は `cb-grid` / `cb-countries` も持つので `js/layer-previews.js` は無変更。
  - ⚠ (#R233) **人口・経済は7つだけ**: `popgrid`（人口密度1kmグリッド）/ `gdppc` / `tfr` / `hdi` /
    `dem`（民主主義指数）/ `cpi`（汚職・腐敗）/ `lifeexp`（平均寿命）。#R39/#R40 が「客観的で出典がある」
    という理由で昇格させた世界銀行の18指標と国別 `pop` は **beta へ降格**（行・データ・凡例は不変）。
- **投影**：Flat(mercator)/Globe。3D地形は terrarium DEM（複数ホストで並列フェッチ、モバイルは maxzoom 13 でRAM安全）。
- **地名ラベル**：`ensurePlaceLabels()` が `ofm` の `place` レイヤから `ofm-country/city/other` を生成（冪等）。`cb-names`(既定ON)で表示。
  ⚠ **(#R252) 市区町村より下の階層は `ofm-other`**：`village`/`suburb`/`hamlet` に加えて
  **`borough`/`quarter`/`neighbourhood`/`isolated_dwelling`/`farm`**。⚠ 綴りは **`neighbourhood`**——
  OpenMapTiles のスキーマ値であり（`sports_centre` と同じ理由・#R211）、US綴りの `neighborhood` は
  **書かれた日から1件もマッチしていなかった**。クラスを3段に分け（1: village/suburb/hamlet ＝ 従来どおり
  minzoom 7 から無条件、2: borough/quarter、3: neighbourhood/isolated_dwelling/farm）、
  `['step',['zoom'],1, 13,2, 14,3]` で開く。⚠ **段は整数**（`['zoom']` はフィルタ内では整数ズームでしか
  再評価されない・#R198 が同じ罠を踏んでいる）で、これはタイルの中身と一致する（実測：suburb は z12 から、
  neighbourhood/quarter/borough は z14 タイルにしかない。大阪 z14 = neighbourhood 452、東京 = 378＋quarter 63、
  ベルリン = 13＋quarter 14＋borough 2、パリ = 5＋quarter 8）。1タイル400件超が来るので
  `symbol-sort-key` は **階層優先＋タイル自身の `rank`**（`ofm-poi` と同じ規則）。
- **ラベルのポップアップは名前を2つ出す (#R252)**：「現地名（地図がそう描いた名前）」。
  `showPopup(…,{title})` は**見出しだけ**を差し替え、`name`（＝コピー・Wikipedia 照会・AI ブリーフ・
  `IntMapOutline` の境界検索が使う識別子）はタイルの `name` のまま。2つ目の名前は
  `applyLabelLang()` が `text-field` を組むのと**同じ** `OSM_NAME_KEYS(lang)`（`window.IntMapOsmNameKeys`
  として `ensurePlaceLabels()` から公開）を1つの feature に適用して求めるので、`js/map-ui.js` に
  2つ目の言語一覧は無い。「現地表記で」設定・現地語＝UI言語のときは1つに解決するので括弧は出ない。
  3つの入口（ラベルクリック／水・地形ラベル／パディング付きタップ）すべてに付く。
  ⚠ **(#R253) コピーのボタンは「地名をコピー」**（英 `Copy name`）。何をコピーするのか名前に出す
  （`'Copy'` は共有リンクのコピーと同じ語だった）。9言語——en/jp/de/ru/es は位置引数、
  fr/ko/zh/zh-hans は `inline` 表（zh-hans は `scripts/zh-hans.mjs` の生成物なので
  `scripts/zh/22-inline-r253.json` にも入れて再生成する）。
- **細かい地名ラベルの範囲ハイライト (#R253)**：`IntMapOutline.fetchPolygon` は Nominatim を
  **2段**で引く。① クリック地点の **±0.06°・`bounded=1`** ＝結果をその近傍に**限定**、
  ② 見つからなければ従来の ±8° viewbox（＝ヒントであって限定ではない）。⚠ 順序が本体：
  ±8° は再ランクするだけなので、「錦町」「Reuilly」のような細かい地名は10枠を有名な同名地に奪われ、
  **自分のポリゴンが答えの中に一度も現れない**。実測（東京・大阪・ベルリン・パリ・ロンドンの実
  `ofm-other` ラベル24件）: 10件 → **11件**がハイライト。⚠ 残りが出ないのは**探し方ではなくデータ**
  ——ベルリンの Kiez、Bastille、Seven Dials、East Marylebone は OSM で **place ノード**であり、
  Nominatim が返す答えにポリゴンが存在しない。#R59 の規則どおり**何も描かない**（点に長方形を被せない）。
- **地方行政区分ラベル (#R198)**：同じ `place` レイヤの **`state` / `province`** クラスから `ofm-admin1`。
  実測でこの2クラスが日本の都道府県（`province`・rank 5）・アメリカの州（`state`・rank 1）・中国の省
  （rank 2）・ドイツ／オーストラリアの州（rank 3）を持つ。⚠ `poi.rank`（#R187 で通し番号と実測）と違い
  ここでの `rank` は**面積で世界規模にそろった順序**なので、ズームの階段は国別ではなく rank 別
  （z3.2→1・3.8→2・4.6→3・5.3→4・6.0→5・6.8→6、maxzoom 9）。`cb-names` に属し、`applyLabelLang` が
  言語を与え、時間旅行中は `ofm-country` と同じ理由で隠れる。ラベルの STACK では `ofm-city` の**下**
  （＝都市名が衝突に勝つ）。
  ⚠ **(#R252) 色は「その区分を描いている線の色」**＝`js/border-style.js` の `ADMIN1_COLOR`（`#cba6f7`、
  明暗共通）を**そのモジュールから読む**ので、`ref-admin1` の破線とラベルが二度と食い違わない
  （`js/place-labels.js` の literal は同モジュール未評価時の到達不能な保険で、tests/r252 ⑤ が両者の一致を見る）。
  ⚠ ハローは**両基図で暗色**——`#cba6f7` は輝度 0.72 で、明るい基図の白ハローの上では自分の縁取りに対して
  約 1.4:1 になり消える。コントラストはハローの仕事（#R210 の言葉）。
  ⚠ **(#R201) クリック／ホバーの一覧に入っている**。#R198 は「名前だけの要求」として意図的に外し、
  その判断をコメントに残していた——返ってきたのは「クリック可能ではない！ほかの地名ラベルと違う挙動に
  するな！」。地図の上では都市名と見分けがつかないので、答えないラベルは**小さい機能ではなく壊れた機能**。
  `js/map-ui.js` は `ofm-city` と**同じ** `onLabel(false)` で配線する（カーソル・ポップアップ・
  Copy/Wikipedia/AI調査/この地域だけ/移動・`IntMapOutline` の実境界）。⚠ 4つの一覧
  （レイヤー別クリック・カーソル・厳密ヒット・パディング付きタップ）は `PLACE_LBL` /
  `ALL_LBL=PLACE_LBL.concat(...)` から**導出**するので、二度と片方だけ更新できない。
- **水域・地形ラベルと河川のハイライト (#R210 / #R217)**：`geo-sea`・`ofm-water`・`ofm-water2`・`ofm-river`・
  `ofm-peak` はクリックでポップアップ（Copy/Wikipedia/AI調査のみ。面が無いので「この地域だけ」「移動」は出さない）。
  **`ofm-river` だけは、その河川を線でハイライトする**。選び方は `js/river-course.js`：
  **名前の集合**（`name`・`name:xx`・`name_xx`・`int_name`・`alt_name` を正規化）を作り、**共有する名前で
  推移的に**タイル内の `waterway` 区間を繋ぐ。⚠ **1つの名前で比較してはいけない**——河川は国境ごとに
  改名され（Donau / Duna / Dunav / Dunărea）、`name:en` だけが共通、という形が普通だから。候補は
  `ofm-river` 自身と同じ `class`（river / canal。低ズームの Natural Earth 由来は `class` を持たないので、
  無いものは候補に残す）。上限 4,000 区間はフレーム予算。
  そのうえで **`course()` が OSM に実流路を訊く**（Nominatim →（駄目なら）Overpass。#R65 以来 Atlas の
  河川ハイライトと同じ2つ・同じ順序）。⚠ **タイルのハイライトを先に描き、それを取り上げない**：取得は
  後から届き、届かないこともある。届いた流路がタイル側の範囲を**包んでいない**ときは置き換えず**合成**する。
  ⚠ (#R218) **`course()` が受け取るのは「押された区間」ではなく「閉包そのもの」**——閉包の全名前・その範囲・
  その上の代表点を渡す。押した区間の名前だけで訊くと、ハンガリー側なら `{Duna}`、オーストリア側なら
  `{Donau, Danube}` になり、Nominatim が別のOSMオブジェクトを返すので**ハイライトが指の位置で変わる**。
  ⚠ 名前は世界中で重複するので流路には門が要るが、その門は**クリックからの 40 km ではなく、
  すでに一致しているタイル区間のどれかからの 40 km**（2,850 kmの川では、正解の遠い区間がクリックの近くを
  通らない）。⚠ 採用した Nominatim の答えは**すべて合成**する（国境で改名される川は複数のOSMオブジェクト）。
  Overpass の箱も**一致済みの範囲＋1°**（上限24°）で、クリック中心の固定幅ではない。
  クリック（または任意のクリア）ごとに連番が進み、遅れて着地した答えは捨てられる。
- **ラベルのサイズ (#R198)**：全レイヤーが `window.IntMapLabelScale`（`js/label-scale.js`）から取る。
  地名ラベルは #R198 以前より全クラス小さく（国 10→15 が 9→13、都市 11→15 が 9.5→13 など）、
  地名以外は必ずその基準の 0.88 倍以下（最大だった海洋名 19.3 → 11.4）。
- **施設・店舗名 (#R186)**：同じ `ofm` の **`poi`** レイヤから `ofm-poi`（テキスト）＋`ofm-poi-dot`（点）。z14〜、
  `rank` の窓をズームで開き `symbol-sort-key` で衝突順も同じ順序に。`cb-poi`（既定OFF）。
- **背後の星空・太陽・月 (#R186 / #R219)**：`js/space-sky.js`。ダークテーマ＋globe＋自前の空を持たないエンジンの
  ときだけ、`#map` の**下**の `#space-canvas` に実カタログの星（`data/stars.bin`）と実位置の太陽・月を描く。地球が
  不透明なので裏側の星は地球自身が隠す。`body.space-sky-on` が `#map` の `--bg-color` を外す。
  ⚠ (#R219) **月は満ち欠けを描く**：照射率 k=(1−cos ψ)/2、明縁の位置角 χ（三日月の角の向き）、半径 r·|2k−1| の
  明暗境界楕円、暗い側の地球照。太陽は周縁減光した円盤＋光冠＋コロナの3層。どちらもテクスチャではなく、
  数値は `window.IntMapEphemeris` から来る。
- **粗い地球全体の衛星ベース (#R186)**：`js/world-base.js`。同梱の正距円筒画像から `imapworld://` プロトコルで
  低ズーム衛星タイルを**ネットワーク無しで**生成し、`layer-sat` の下に敷く（衛星ベースマップのときだけ表示）。
  ⚠ **±85.0511°〜±90° の極冠 (#R207 / #R219)**：Mercator にはそこのタイルが存在しないので、`layer-polar-cap`
  （スタイル配列の先頭に宣言された `background`）が**どのベースマップでも**敷かれる（#R219。#R207 は衛星のときだけ
  見せていたので、ベクター地図では実測 (7,7,15)＝レンダラの黒のままだった）。色は衛星＝画像の極の行から実測、
  ベクター＝Carto の陸色を**画面に出る値**で（明＝`#f8f8f8` / 暗＝`#545454`。生の `#080808` は
  `raster-brightness-min:0.33` を通る前の値なので使わない）。
  さらに **`world-cap-src` / `layer-world-cap`**：同梱の正距円筒画像は ±90° まで持っているので、極冠を
  **36扇 × 5帯のポリゴンのモザイク**にし、各セルをその画像の実際の平均色で塗る＝**極にも本物の絵**が出る。
  ⚠ `image` ソースでは**できない**（実測：`ImageSource.setCoordinates` は各隅を MercatorCoordinate に通すので
  緯度90は `y=Infinity` で例外。tests/smoke の「console.error なし」が検出した）。
- **国境ライン**：`borders-only-line`（`cb-borders`、既定OFF）。国塗り＝`country-fill`/`country-line`（`cb-countries`=Countries(info)）。
- **データレイヤー群**：`geoLayersDB` / 各種 setup 関数。`_registerLayerOpacity()` でレイヤーごとに透明度凡例。
- **レイヤーパネル再構成**：`reorganizeLayerPanel()` が DOM を毎回並べ替えて分類:
  `お気に入り → 4ユーティリティ(地名/国境/グリッド/Countries) → Active layers → 6テーマ群 → Others(beta) → Tools(compare/upload)`。
  グループは折り畳み可（デスクトップ）。モバイルは **Others(beta) だけ**プルダウン、他は常時展開。
- **Active layers**：`_refreshActiveLayers()` がオン中のレイヤーをチップ表示。常に上部。トグル時はスクロールを補正して**行が動かない**ようにする。
  ⚠ **(#R252) 背景はパネル自身と同じ式**＝`var(--panel-bg,var(--card-bg))`。右サイドバーは既定（不透過）で
  `--panel-bg` を塗るのに帯だけ `--card-bg` を塗っており、1段ぶんの高低差がそのまま見えていた
  （実測 dark `rgb(28,28,30)` on `rgb(20,20,22)`／light `rgb(255,255,255)` on `rgb(233,235,239)`）。
  フロストの2モードでは `--panel-bg` が未定義でフォールバックが効くので、#R115 の
  「Active layers は絶対に透過させない」は不変。
- **Globe専用**：`updateOcclusion()` で裏面ピンを隠す。
- **ウィジェット**：サイドバーのカード群（`intmap_widgets3` に定義保存）。FX・ランダム国など。「Add widget」で追加。
- **レイヤー・データ契約 `window.IntMapLayers`**（#R119 導入 / #R120・#R121 拡張。#R169 で §5 からここへ移設）
  ——Atlas を「操作コンソール」から「分析エンジン」へ変えるための、全レイヤー共通のインターフェース。
  - API＝`register` / `state` / **`sampleAt(lng,lat)`** / `featuresIn(bounds)` / `legend` / `time` / `source`。
  - **新しいレイヤーを足したら、同じ変更の中でここへ登録すること**（これが契約の本体）。登録は約34系統：
    Open-Meteo のライブ実値（temp/sst/wind/precip/snow/aod/no2/co）、Köppen のピクセル、DEM 標高、
    表示中フィーチャの抽出（webcams/news/volcanoes/aircraft/ships/earthquakes/datacenters/pharma）、
    **GIBSラスタのピクセル→物理値逆引き**（表示中と同じタイルを canvas で読み、色をカラーマップ勾配へ
    線分射影して凡例レンジの実値に戻す。透明＝データ無し・勾配から遠い色＝`null`＝正直に「不明」）、
    **コロプレスの画面外サンプリング**（共有PIP `window._imPipGeo`。コア7種＋WBベータ＋bx系約40種）。
  - 消費側＝Atlas の stateContext に入る実データ行・`layerData` アクション・`analyze` への自動証拠注入。

---

## 8. UI/UX の構造

### (#R239) サイドバーの Panels タブ（ドック）— 「入っているもの」と「できること」

設定「凡例・ツール窓の表示」→「サイドバーのタブにまとめる」（既定オフ、#R238）。実装は
`js/window-manager.js`。#R239 で境界と挙動が変わった:

- **入るのは「オンになっているもの」だけ。** 判定は所有者が書く**インライン `display`**
  （`js/data-layers.js` は凡例を `legend.style.display='flex'/'none'` で開閉する。34か所）。
  実測: 地図コンテナ直下の凡例は **23個あって、オンだったのは2個**。#R238 は23個とも入れていた。
  MutationObserver が `style/class/hidden` を**要素ごとに**見ており、**オフにすると地図へ戻る**。
- **ドック中はドラッグもリサイズもしない。** ⚠ **ドラッグ実装は2つある** ——
  `js/window-manager.js` の `makeDraggable`（#R47）と `js/data-layers.js` の `wireDrag`（#R19、
  凡例専用の委譲ドラッグ）。前者だけ塞いだ状態で実測したところ、サイドバー内の Köppen 凡例は
  **100px のドラッグで 378px 下へ飛んだ**（`inset:378.25px auto auto 8px !important`）——これが
  「タップしたらどんどん消えていく」の正体で、閉じていたのではなく**列の外へ出ていた**。
  両方が `im-docked` クラスを見る。⋮⋮ のグリップは CSS で隠す（嘘をつく余地を残さない）。
- **剥がすのは幾何プロパティだけ。** `_flatten()` が `position/left/top/width/height/transform/
  z-index/margin/resize` などを `removeProperty` する。⚠ **`display` は剥がさない**——#R238 は
  `removeAttribute('style')` で全部捨て、CSS が `display:block !important` を被せていたため、
  フレックス列の**最後の子である透明度スライダが `overflow:hidden` の外へ押し出されて消え**、
  さらにレイヤーを切っても消えなくなっていた（`!important` が所有者の `display:none` に勝つ）。
- **`_undockOne` は `_dockOne` の厳密な逆**。保存した文字列から**幾何だけ**戻す。全部戻すと、
  オフにして戻した瞬間に古い `display:flex` が蘇り、監視が再びドックへ入れる無限往復になる。
- オブジェクト一覧（`#iol-panel`）と Köppen の内側スクロールはドック中 `max-height:none;
  overflow:visible` ＝**展開されたまま、高さは中身に追従**する。

⚠⚠ **(#R240) ここで変わったこと**（「スクロールをしなくていいように一番下まで広げて／最小化された状態で
スタートしないように／モバイル版ではパネルは画面の左右いっぱいを」）:

- **内側のスクローラは2つではなく全部。** #R239 は `.iol-body` と `.kl-scroll` を名指ししていた。
  列の中でスクロールする箱はクラス名に関係なく欠陥なので、js/ から grep した集合＋このアプリの
  命名規則（`*-scroll` / `*-body` / `*-list`）に対して宣言してある（`css/intmap.css`）。
- **ドック中は最小化で始めない。** `ensureLegendMinimize` の携帯自動折りたたみは「地図の上に浮いて
  いる凡例が地図を隠す」ために書かれたもので、親を見ずに走っていた（実測: 携帯のケッペン凡例は
  **95 px＝ヘッダだけ**、デスクトップでは 488 px）。ドック中は走らせず、ドックする瞬間に
  `window._legendExpand` で開き、地図タップの一括折りたたみ（`_minimizeOpenLegends`）からも外す。
- **携帯では列が画面の左右いっぱい。** シートは `padding:0 16px` なので、列のスクロールバーが
  その内側＝パネルの上に描かれていた。`#docked-feed` がシートのパディングを打ち消し、レールは消す
  （ボトムシートはドラッグするもの）。⚠ `js/data-layers.js` が**実行時に書く**
  `.koppen-legend{width:min(66vw,252px)!important}` が同じ詳細度で後から効いていたので
  `:not(.im-docked)` を付けた（実測 252 px → 390 px、高さ 95 px → 504 px）。
- **シートの高さは 92dvh → 86dvh**、`--sheet-h` という**1つの所有者**になった
  （`js/mobile-ui.js` の `detents()` は `sidebar.offsetHeight` から導くので追従する）。


- **サイドバー**（左）：タブ（News / Companies / Countries / Atlas ※旧 Information タブは R139 で Companies に置換）、検索、ニュースフィード／企業ランキング／Atlas。
- **マップ上コントロール**（右上）：Map/Sat、Flat/Globe/3D/コンパス、Grid、Measure、Radius、Layers。
  コンパスの**右クリック**で方位・仰角・ズームを数値入力（デスクトップのみ）。傾き上限が「無制限」のときは
  仰角欄が **0〜360°** を受け付け、180°超は方位を反転した等価な視線に解決される (#R171)。
- **ポップアップ類**：国情報カード(`country-info`)、国詳細(`country-popup`)、ピン/地名ポップアップ、凡例(ドラッグ可)。
- **浮遡物の集約モード (#R238)**：設定「凡例・ツール窓の表示」→「サイドバーのタブにまとめる」で、
  左サイドバーに **Panels** タブ（`#docked-feed`）が現れ、浮いているものが全部そこへ**親替え**される。
  **既定オフ・デスクトップ/モバイル共通・タブはモードON時のみ**。集合は `js/window-manager.js` の
  `__winReg`（全浮遊窓）＋地図コンテナ**直下**の凡例（`:scope > [class*="legend"]`）で、
  レンダラが座標に括り付ける**地名クリックのポップアップは対象外**（`makeDraggable` を通らない）。
  戻すときのために `parent` / `nextSibling` / **インラインstyleの文字列**を覚えている。
  Atlas パネルは `data-nodock` で除外（既に `atl-tab` でサイドバーに住む）。
  ⚠⚠⚠ (#R245) **「どの要素を監視済みか」の集合はオブザーバと同じ寿命**（`__dockWatched` は `WeakSet`、
  `_dockWatch(true)` で作られ `_dockWatch(false)` で捨てられる）。以前は印が**要素のプロパティ**にあり、
  `__winReg` の要素についてしか消していなかった——`__winReg` は構造上**凡例を持たない**ので、
  モードを一度切って戻すと**新しいオブザーバが凡例を一つも監視しない**状態になった。
  これが #R244 で再現できなかった「ケッペン凡例がパネルに入らない環境」の正体で、環境ではなく**順序**。
  ⚠ #R244 が足した2本目の経路（レイヤーのチェックボックスが変わるたびに `dockRefresh()`）はそのまま残る。
- **設定モーダル**：言語・タイムゾーン・単位・テーマ・ニュース言語・衛星鍵(任意)・AI利用状況・出典・規約/プライバシー。
  **「地図の動作」セクション**には (#R171) **地図の傾きの上限**（標準78° / 無制限＝レンダラーの全域 0–180°）と
  **常時表示欄に視点の高度**（既定オフ）が入る。どちらも Atlas からも操作できる（`tiltLimit` / `eyeAltitude`）。
  (#R172) **無制限を選んだときの傾きは視点を軸に回る**——カメラは首を振るだけで、視点の位置も高度もズームも変わらない
  （標準のときは MapLibre 本来の「注視点のまわりを回る」挙動のまま。実測差：標準は 38° 傾けて視点が 6.2km 移動、
  無制限は 110° 傾けて 0m）。
- **iOS風の作法**：セグメントコントロール、角丸カード、ボトムシート、初回ウェルカムカード(`_imWelcome`)。
- **初回ウェルカムカード(R29)**：旧「自動でレイヤーをON/OFFするデモ」（バグと誤認された）を廃し、
  iOS風の説明カードに変更。レイヤー紹介ツアー(`_imStartDemo`)は明示ボタン（カード内・設定内）からの任意起動に。
- **テーマ**：`applyTheme()` が `userTheme` から `body.theme-<id>` を排他トグル＋light/darkベースを設定（skin registry）。
  CSSはすべて静的 `<style>` 内（テンプレートリテラル不使用＝バッククォート罠なし）。テーマ変更時に最適サイドバー外観を自動適用。
- **Playground/Bug Report**：Playgroundは Layers ▸ Tools の `btn-edu` から `window._openPlayground`。Bug Report /
  Feedback は設定から `window._openBugReport` / `window._openFeedback`。Feedbackは種類（不具合/要望/良かった点等）・
  ログアウト時の任意メール・不具合はバグレポートへ誘導。Playgroundの各モードは createElement+インラインstyleで構築
  （CSS-in-template-literal を避ける）。
- **テキストに影を付けない**（`text-shadow:none` を徹底）。

---

## 9. モバイル対応の構造

### 9.0 IntMap Runtime — 1つのフレーム・1つの camera 購読・1つのタイマー (#R234)

`js/runtime.js` / `window.IntMapRuntime`。**カメラを追う仕事は全部ここを通る。**
`js/app-body.js` が `js/lazy-modules.js` の隣で `makeRuntime(IM_HOST)` を作る——
**何かが登録するより前に存在していなければならない**（#R205 の無言no-op）。

| 登録簿 | 呼び方 | 何をするか |
|---|---|---|
| camera | `onCamera(key, fn, {phase, capability})` | カメラが動いた。**エンジンへの購読は全体で1本**。`phase:'read'` は**すべての** `phase:'write'` より前に走る |
| frame | `frame(key, fn)` | 次のフレームで1回。key で合流 |
| timer | `every(key, ms, fn, {whenHidden})` | **1本の timeout**が全周期を回す。`document.hidden` の間は動かさない（戻ったとき**取り戻しはしない**） |
| idle | `idle(key, fn, {timeout})` | フレームのあと、暇なとき |

**ライフサイクル**: `define(name,{load,activate,suspend,dispose})` → `load` / `activate` / `suspend` /
`dispose`。上の登録は capability 名でタグ付けされるので、**`suspend(name)` はその機能の毎フレーム仕事を
一括で外し**、`dispose(name)` は登録ごと消す。各自の解除忘れに依らずに
「機能数が数倍になっても地図操作経路の処理量が増えない」を保つための機構。
⚠ **ローダーではない**。「取ってきて・factory を回して・publish を検証する」は
`js/lazy-modules.js` が9本ぶん持っている（#R209）。`load` はそこを**呼ぶ**場所。

⚠⚠ **なぜ「読みを全部終えてから書く」なのか**（このファイルが在る理由）:
#R234 以前は7ファイルに8つの camera 購読があり、**そのそれぞれが自前で rAF を持っていた**。
8つの private rAF は「1つの8倍」ではない——どれも `project()` / `getBoundingClientRect()` で
幾何を**読み**、同じコールバックで style を**書く**ので、**1つの書き込みが次の読み取りのレイアウトを
無効化する**＝強制同期レイアウトが毎フレームN回、指が触れている経路の上で。

⚠⚠ **誰の仕事も間引かない。** 全員が今までと同じフレームで同じ入力で走り、動いている最中の絵も
変わらない（#R229「速くするために見た目を勝手に落とすな」）。消してよいのは**重複だけ**。
`gesturing()` / `window.__imGesture` は**公開されているが、このファイル自身は使わない**——
「これは止まってからでいい」は、その判断が見える呼び出し側で書く。

今ここを通っているもの: `shell.crosshair`(app-body) / `shell.occlusion`(app-body) /
`viewctl.altitude` / `toolpanel.ctxmenu` / `arc3d.draw`(map-tools) / `search.card` /
`tilewarm.prefetch` / `themesky.follow`。

**(#R231) 携帯の地図クローム（左上・右上・右下）**

| 位置 | 部品 | 備考 |
|---|---|---|
| 左上 | 地名検索 FAB 46px | 🔍 絵文字ではなく**自前SVG**（円 r6.6＋45°ハンドル・`currentColor`・2px round-cap）。⚠ `data-i18n` は語の `<span>` に付く（ボタンに付くと textContent 書き換えで svg が消える） |
| 左上・その真下 | **ベースマップ正方形 54px**（`js/basemap-switch.js`・`.bm-square`） | 白枠、中は**切替先の絵**。タップで `.bm-pop` に Map/Satellite/Globe/Flat/3D。**5つの `data-proxy` は `.map-controls-top` の実ボタン**＝意味の所有者は1つのまま。絵は同梱データから canvas に描く（衛星＝`data/world-basemap.jpg` を `IntMapWorldBase.tile`、地図＝`data/land-mask.png`）・**通信ゼロ**・固定 z4・`moveend` はデバウンス |
| 右上 | m-fab ×4（Map & layers / Tools / Compass / **現在地**）46px | 現在地は4点のダート（先端・両翼・くぼみ） |
| 右下 | 時光機 **54px の丸** | 折りたたみ時のみ円。開けば従来のパネル |

⚠ 新しい地図クロームを足したら **`body.capture-mode`（css/intmap.css）にも足す**——「Screenshot
(hides controls, keeps legends)」なので、足し忘れると毎回のスクショに写り込む。

**(#R231) ボトムシートの2つの規則**

- **最大（`sheet-full`）のとき、地図のタップは無効**で、タップすると中段（`half`）へ下りる。
  ⚠ 実装は `click`/`contextmenu` の**capture フェーズでの飲み込み**であって `pointer-events:none`
  でも透明カバーでもない——どちらも**ホバーを道連れ**にし、指示は「ホバーは可能」だから。
  ポインタイベントに触っていないので、ホバー・読み取り・パン・ピンチはそのまま生きている。
- **ウィジェットを最上部までスクロールしてさらに引くと、シートが下がる**。
  ⚠ 対象は**要素IDの列挙ではない**（#R78e の Countries と #R112 の Atlas がまさに漏れていた）。
  `touchstart` で**直近のスクロール可能な祖先**を探す委譲なので、後から増えるタブは自動的に入る。

- 判定は `isMobile()` と `@media(max-width:768px)`。
- ⚠⚠ (#R223) **「宇宙を探索」の携帯シート**：`.sp-col` の高さの所有者は **`--sp-sheet-h` ただ1つ**。#R220（38vh）・
  縦向き（32vh）・#R222（var）の `max-height … !important` が3世代積み上がっており、**author の `!important` は
  インライン宣言に勝つ**ので、#R222 のドラッグが書いていた `col.style.maxHeight` は**CSSに捨てられていた**
  （実測：インライン420pxで計算値633.36px）。ドラッグは**カスタムプロパティ**を書く。⚠ 指を置いた瞬間に
  段クラスを外す前に今の高さを固定する。⚠ 上のバーは **2行のグリッド**（①✕・天体・時計 ②実寸/モデル・表示
  ③太陽系）——375 px で `scrollWidth 440` になり**日時UIへの唯一の入口が画面外**だったため（修正後 375=375）。
- ⚠⚠ (#R225) **「携帯かどうか」の門番を、GPUの問いに幅で答えるな。** #R221 のフロストガラス抑止は
  `@media (max-width:768px)` と `isMobile()`（幅のみ）で守られていたので、**スマホを横にすると
  812px > 768px で抑止が丸ごと切れて**いた（実測：静止時 backdrop-filter **19枚・viewport の 383%**、
  #R221 当時は15枚・153%。縦向きでは機構は正しく動いている）。
  → `(hover:none) and (pointer:coarse)` を併記（向きに依らず携帯/タブレットで真、タッチ対応ラップトップ
  では偽）。幅の条件は残すので狭いデスクトップ窓は #R221 のまま。**§9 の「幅＝レイアウト／UA・端末＝RAMとGPU」
  という区別は、こういう門番にこそ効く。**
- ⚠⚠ (#R230) **`.m-scrim` は、閉じている間 `visibility:hidden`。** ボトムシートの暗幕は携帯のメディア
  クエリの中で **`display:block` ＋ 全画面の `backdrop-filter:blur(2px)`** で宣言されており、画面外に
  置いていたのは **`opacity:0` だけ**だった。**`opacity:0` の箱は描かれる**——合成器はそこに backdrop root を
  作り、**動いている地図の上でビューポート全体を毎フレームぼかしていた**（#R228 と同じ形：見えないのに描く）。
  実測（375×812・初回描画・何も開いていない）：**画面内のフロスト要素11枚・被覆135%**、そのうち**この1枚が
  100%**＝最大の単独項目であり、**11枚の中で唯一「一度も見えない」もの**。
  → 閉じている間は `visibility:hidden`（描かれない＝ぼかしも走らない）。⚠ **画は1画素も変わらない**：
  `.show` は**遅延0で** `visibility:visible` にするので開くときのフェードは従来どおり、閉じるときは
  `visibility 0s linear <opacity と同じ秒数>` が**フェードアウトの間じゅう描画を保持**する
  （遅延を削ると、フェードせずに消える）。⚠ `prefers-reduced-motion` は `transition-duration` しか
  上書きしないので、**遅延の 0s 上書きが別途要る**（無いと即閉じたあと 320 ms ぼかしが残る）。
- ⚠⚠ (#R230) **携帯の画像同時取得数は MapLibre 自身の既定（16）**。#R22 以来 **48**（デスクトップ 256）に
  引き上げていたのを撤回した。maplibre-gl 5.24.0 の実装を読むと `MAX_PARALLEL_IMAGE_REQUESTS`（既定16）は
  `processQueue` が**開始**してよい本数で、`MAX_PARALLEL_IMAGE_REQUESTS_PER_FRAME`（8）は**絞られている間**の
  本数、そして **`Map` 自身が `addThrottleControl(() => this.isMoving())` を登録している**。つまり
  **ジェスチャ中は既に8**で、48が効いていたのは**静止中だけ**。⚠ **開始は絞られるが完了は絞られない**——
  静止中に始まった最大48本のデコードと GPU 転送は、**次のピンチの最中に着地する**。16本なら着地も16回。
  ⚠ 画は一切変わらない（同じURL・同じ段・同じ解像度）。⚠ 判定は `isMobile()`（幅）ではなく **UA** なので、
  **横向きでも外れない**——このファイルで唯一、横向きが抜け落ちない端末判定。デスクトップは 256 のまま。
- ⚠ (#R230) **衛星タイルの先読みは「レーン」で流す**（`sw.js` の `PREFETCH_LANES` ／ `js/tile-warm.js` の
  `WARM_LANES`＝各4）。`Promise.all` で最大96本を一度に開始していたのを、**同時4本のキュー**にした。
  ⚠ **取得するタイルは1枚も減らない**（同じURL・同じ枚数・同じ保存先）。変わるのは**同時に空中にある本数**だけ。
  ⚠ キューは**バッチをまたいで1本**——パンは `moveend` の連続なので、バッチ単位の上限では重なった3バッチが
  3×N を空中に出せてしまう。⚠ `waitUntil` は**ドレインを待つ**（スケジュール完了で解決すると、レーンが
  飛んでいる最中に worker が停止されうる＝「小さいバッチ」ではなく「黙って減るタイル」になる）。
- ⚠ (#R225) **`?perf=1` — 実機で測るための計器**（`js/perf-hud.js`）。`map._render` の中央値/p90・longtask・
  描画バッファ倍率・可視レイヤー/ソース/タイル数・backdrop-filter の枚数と被覆率を表示し、
  **ガラス / アプリのレイヤー / 画像同時数を画面上で A/B** できる（⚠ #R229 で `render-scale` の切替は削除
  ——測る対象が無くなったため。⚠ ここの切替は `?perf=1` の**手動 A/B** であって出荷される挙動ではない。
  #R221 は同じ発見を**全利用者の自動挙動に変えて**しまい、それが削除されたもの）。⚠ レンダラには触らない
  ——計測フックは契約側（`render.instrumentFrames` / `render.sceneStats`）。⚠ フラグが無ければ正規表現1回。
  - ⚠⚠ (#R230) **census は「ビューポートとの交差」を測る。** #R228 がこのファイルの見出しに
    「Measure the intersection, not the rect」と書きながら、本体は `r.width * r.height` を足したままだった
    （実測：**生382% 対 クリップ後135%**＝計器が見出し数字を2.8倍に盛っていた）。加えて**最大の1枚の名前**を
    出す——#R230 の発見は**要素1個**であり、割合だけでは永久に指させなかったから。
  - ⚠ `visibility:hidden` は**数えない**（描かれない＝費用が無い）。⚠⚠ **`opacity:0` は数える**——それが
    まさに `.m-scrim` の状態だったので、ここを飛ばすと**この計器は自分が見つけた欠陥に盲目になる**。
  - ⚠ **`img 48` の切替**は、撤回した48を**利用者自身の iPhone で**戻して比べるためのもの。出荷値は
    `window.__imImgConcurrency` から読む（16をここに書き直すと**同じ値の所有者が2人**になる＝#R178）。
- **m-fab-stack**（右側の丸ボタン列：Layers/Tools/Compass 等）＋ **m-sheet**（ボトムシート、detent=**フル/ハーフ/ピーク**。#R107: 最下段の「mini」（ロゴまで隠す）は**無効化**、ピークが最下位置）。
- レイヤーパネルは m-sheet 内に移動。`_expandAllLayerGroups()` で全展開（Others だけ折り畳み）。**#R107: 設定で「右サイドバー」を選ぶとモバイルでも右サイドバー版（タイルUI）が使える**（地図を縮めず 92vw のオーバーレイ、レイヤーFABで開閉）。
- ⚠ (#R232→#R235) **携帯のレイヤー欄はデスクトップと同じもの**。`js/map-ui.js` の `mountInto(container)` が
  **同じタイルビルダー**を m-sheet の先頭に載せ（`.lsr-mount`＝検索欄＋`.lst-grid` 3列）、`#layer-dropdown` は
  その下に**隠れたまま真実の出所**として残る（タイルのクリックは本物のチェックボックスを叩く。
  `body.m-lyr-tiles` が行を隠す＝css/intmap.css）。
  ⚠ (#R235) **その下の家具も消えた**——「下部の比較ビューや衛星画像プロバイダ等のやつはなくていい」。
  `#layer-tools`（`reorganizeLayerPanel` が比較ビュー／相関分析を入れる帯）と `#cmp-mount` と
  `#mo-mount-sat` を CSS で隠し、`js/mobile-ui.js` は **`satController` を m-sheet へ運ばなくなった**
  （デスクトップのレイヤーサイドバーは検索＋タイル＋Activeバーだけで、どちらも持っていないため）。
  ⚠ **結果として `#sat-controller`（衛星画像プロバイダ）は携帯から到達できない**＝指示どおりだが機能の減少。
  要素は消しておらず、`restoreHome()` は残してあるので幅を広げれば元に戻る。
- **#R108 モバイル**: Atlas は**サイドバー（ボトムシート）の中で開く**（`#sidebar` にマウントして全面表示。閉じると `#map-container` に戻す）。地図内検索ボタン（🔍 FAB）は**青ではなく透明のフロスト**（他のFABと統一）。地図ホバー時の**ニュースピン強調＋自動ポップアップは無効**（ピンのタップで記事は開く）。過去時刻では**該当時期のニュースのみ**表示（`pubDate` を±8日で照合、最新ニュースの漏れを除去）。
- **チェックボックスのタップ**：`input{pointer-events:none}` ＋ `touch-action:manipulation` ＋
  **決定論的トグル**（指を下ろした行だけを1回トグル。スクロール/ドラッグ/隣行ドリフトでは発火しない＝誤チェック防止）。
- **compare を開いている間**：メインの m-fab-stack を**下に移動**（消さない）。compare の×と重ならない。
- **Radius パネル**：モバイルでは左下の**コンパクトなカード**（地図とFABを塞がない）。
- ピンチズーム感度はユーザー設定時のみカスタム適用（既定は素のピンチ）。
- ⚠ **「携帯」の定義は2つあり、用途で使い分ける (#R209 で明文化)**。幅（`matchMedia('(max-width:768px)')`
  ＝レイアウトの話）と **UA**（`/Mobi|Android|iPhone|iPad/` ＝**RAM とデータ通信の話**）。後者を使うのは
  `js/gazetteer.js` の `MOBILE_CAP` と取得ファイルの選択、`js/sat-proto.js` のタイルキャッシュ、
  画像の同時実行数。**狭いデスクトップ窓は携帯ではない**——RAM は据え置きのものだから。
- **携帯が余分に持たないもの (#R217)**：
  - **ガゼッティア**は `data/gazetteer-phone.json.gz`（452 kB・12,000行）を取る。全量（4,019 kB・147,924行）は
    取らない。⚠ `MOBILE_CAP` は #R198 以来この行数しか使わせていなかったのに、上限が効くのは取得・展開・
    parse の**後**だった。実測（iPhone-13 プロファイル・自オリジン以外遮断）：転送 8,861 → 5,149 kB。
  - **ケッペンの復号済み画像**（4096² ＝ 67 MB）は作業キャンバスを作った直後に解放する。`window._koppenImg`
    の唯一の読み手 `ensureKoppenFull()` の携帯上限が `KWORK_CAP` と同じ 2048 なので、余分な画素は**到達不能**
    ＝画質は変わらない。上限が作業キャンバスより大きい環境（デスクトップ 3072/4096）では従来どおり保持。
- **携帯が余分に持たない／待たないもの (#R224)** — 実測（クリーン初回・375×812・自オリジン以外は本番）：
  総計 **11.2 MB／156リクエスト／JSヒープ 94 MB／idle まで 11.7 秒**。ここから外したもの：
  - **Atlas カーネル（`js/atlas-console.js`）はビルドの最大ファイル**＝main チャンク 3.67 MB のうち 658 kB。
    9本目の**遅延モジュール**になった（`js/lazy-modules.js`）。⚠ Atlas は**操作面**なので `window.IntMapConsole` を
    触る所が11か所あり、そのすべてが `window.IntMapConsole && …`＝**「静かに何もしない」**になっていた。
    入口は全部 **`window.IntMapAtlas`**（`js/atlas-loader.js`）経由にした——取りに行ってから呼ぶ。
    ⚠ **閉じる系は取りに行かない**（フライトシムの `_closeAtlas`、`atlas.close`）。開いていないパネルを
    閉じるために 658 kB 落とすのは、同じ欠陥の裏返しである。
    ⚠ **デスクトップは idle 後に温める**（`hint()`）。今回の指示は iPhone の話で、据え置きでは
    最初の ⌘K を待たせるほうが退行になる。携帯と Save-Data は「押されたら取りに行く」だけ。
  - **katex 258 kB ＋ html2canvas 198 kB** は `requestIdleCallback` で「遅らせて」いただけで、
    **毎セッション必ず**取得・parse していた（実測 t=1.04 s）。`window.IntMapVendor` の**初回使用**に紐付け：
    html2canvas はシャッターを押したとき、KaTeX は返答に LaTeX が入っていたとき。
  - 実測の結果：起動時 JS **5,332 kB → 4,303 kB（−1,029 kB）**。
  - **ケッペンの作業キャンバスは 2048² へ直接デコードする**。4096²のPNGを復号（**64 MB**）してから 2048² に
    縮小して捨てていた（#R217）。`createImageBitmap(blob,{resizeWidth:2048,resizeHeight:2048,
    resizeQuality:'pixelated'})` は中間の 64 MB を**作らない**。⚠ `pixelated` は好みではなく**正しさの条件**——
    作業キャンバスの用途は KCOL のパレットで画素を分類することで、補間は階級の間の色を捏造する。
    ⚠ **表示用テクスチャは 4096² のまま**（画質優先で確認済み）。
- **携帯が余分に待たないもの (#R218)**：
  - **作物レイヤーは「場所」を鍵にする**。要求 bbox をビューポートそのものにすると、どんな小さなパンでも
    未知の鍵になり95%重なった絵を取り直す。**約1ビューポートの四分木セルにスナップ**して保持する
    （実測：6°の視野を0.05°ずつ40回パン → **40リクエストが1リクエスト**）。
  - **震源分布**：距離の haversine を格子上で因数分解（`A(行)+B(行)·C(列)`）、プロファイル参照を閉形式に、
    クラス色の `parseInt` を1回に、全球ラスタは**輪を解いて経度の帯だけ**歩く、譲りは**12 ms の予算**で
    （`setTimeout(…,0)` の 4 ms 丸めが 224 回＝0.9 秒だった）、書き出しは `toBlob`（base64 を作らない）。
    **どれも値は変えない**（`tests/r218-checks ③`）。
  - **5言語の出典説明**は locale ファイル側にあり、起動時のバンドルには入らない（§10）。
- **フライトシムの携帯レイアウト (#R218)**：同じ数字を4組（パネル／6連メータ／PFD／ラダー）描いていたのが
  「潰れている」の実体だった。`@media(hover:none)` で**6連メータ・PFD・ブーストバー・キーボード早見表を消し**、
  テープ・パネル2枚・ラダー・ADI を1つずつ残して読み取り／視界／親指の3帯に置き直す。
  ⚠ **シミュレータからは何も削っていない**（デスクトップ／タブレットでは従来どおり4つとも出る）。
  ⚠ 起動時の「端末を横向きにしてください」全画面は**廃止**。全画面要求と横向きロックは黙って試み、
  成否にかかわらず飛ぶ（横のままなら数秒で消えるヒントのチップだけ）。
- **宇宙を探索の携帯レイアウト (#R218)**：時刻まわりの5つ（Live/⏪/▶/⏩/速度/日時＋6つのステップ）は
  バーの横スクロール幅の2/3を占めていた。`.sp-timeb` 1つに畳み、**そのボタンが時刻そのものを表示する**
  （畳んでも答えは隠れない）。開くと下部のシートになる。デスクトップではボタンは `display:none`。

---

## 10. 多言語対応の構造

### ⚠⚠⚠ (#R239) 翻訳の「面」は5つあり、**答えは1つ**になった — `scripts/i18n-audit.mjs`

「今後言語を追加するのが完璧に100%にできるような仕組みを作っておいて。今回のように、いつまでたっても
言語対応の漏れが見つかることは許されない。」

**ラウンドごとに新しい漏れが見つかっていたのは、誰かが訳し忘れたからではない。**「翻訳済み」の定義が
このリポジトリに一度も1つしか無かったことがない、というのが理由である。利用者が読む文字列は**5つの形**で
存在し、各形はそれぞれ別のラウンドで自分の計器を得て、**自分の形の100%**を表示していた:

| 面 | 計器 | 追加 |
|---|---|---|
| keyed `ui` 表（**宣言箇所は7ファイル**） | `scripts/i18n-keyed-audit.mjs` | #R239 |
| inline `L(…)` 表 | `scripts/i18n-report.mjs` | #R221 |
| `L(…)` の位置引数5つ | `scripts/i18n-positional-audit.mjs` | #R235 |
| `jp ? '…' : '…'` の2分岐三項 | `scripts/i18n-two-branch-audit.mjs` | #R237 |
| **読み物ページ** `js/locales/pages.*.js` | `scripts/i18n-pages-audit.mjs` | #R239 |
| HTML の `data-i18n` キー | 上記 keyed 監査に内蔵 | #R239 |
| ⚠⚠⚠ **そもそも系に入っていない文字列** | `scripts/i18n-attr-audit.mjs` | **#R240** |
| ⚠⚠⚠ **配列で持った翻訳（呼び出しでない）** | `scripts/i18n-positional-array-audit.mjs` | **#R241** |

### ⚠⚠⚠ (#R249) 15個目の面 —— **文書そのもの**（`<title>` / `<meta description>`）

上のどの計器も **要素**を歩く。`<title>` と `<meta name="description">` はどちらでもない——誰の
`innerText` でもなく、誰の `data-i18n` でもない。`index.html` ではそれが**マークアップ中のリテラル**
だったので、ブラウザのタブ・ブックマーク・共有リンクは**9言語すべてで英語**だった一方、被覆行列は
全行 100% を表示していた。実測: アプリを jp / zh に切り替えても `document.title` は1バイトも変わらない。

⚠ **機構はすでに存在していた。** `js/page-i18n.js` は #R239 以来、`sources.html` / `science.html` の
まさにこの2つを翻訳している。アプリ本体のページだけがそれを一度も使っていなかった——
これは翻訳漏れではなく[「1つの振る舞いに2つの実装」](#)の形（recurring-lessons G）である。

- `docTitle` / `docDesc` を **9言語の `ui.<code>.js` に追加**（＝ keyed 面なので既存のゲートが数える）。
- `js/app-body.js` の `updateI18n` が両方を書く。
- `scripts/i18n-doc-audit.mjs` が**16個目を忘れさせない**ための計器。`scripts/i18n-audit.mjs` に
  **面として**足してあり、単独の計器にはしていない（#R239 の規則）。
- ⚠ **`og:` / `twitter:` は意図的に対象外**。ソーシャルカードのクローラはページの JavaScript を
  実行しないので、実行時に書き換えてもクローラが見るものは変わらない。これは**ビルド時**の問題
  （言語ごとに文書を1つ事前生成する）であり、別の仕事である。ファイルのヘッダに明記してある。
- ⚠ **`admin.html` は対象外**（#R249・利用者確認済み）。運用者コンソールであって読者向けページでは
  ない。属性だけは `scripts/i18n-attr-audit.mjs` が今も測る。
- `tests/r249-checks ③` は **ディスク上の `*.html` を列挙**し、測られてもいなければ理由付きで除外
  されてもいないファイルがあれば落ちる。新しいページを黙って忘れることはできない。

### ⚠⚠⚠ (#R251) 16個目の形 —— **他モジュールのプロパティ越しに届く helper**（＝形ではなくスコープの問題）

15個の形は、翻訳の**綴り方**が新しくなるたびに検出器を1つ足して閉じてきた。16個目は綴りが新しいのではない。
**同じ綴りを、別のモジュールのホストオブジェクトのプロパティ越しに読んでいた**だけである。

```
js/app-body.js      const _coL = window.IntMapLang.pick(() => currentLang);
                    …  get _coL(){ return _coL; }              ← 全サブモジュールへ渡る
js/companies-ui.js  HOST._coL('Market cap','時価総額','Marktkap.','Капитализация','Cap. bursátil')
```

これは**5言語そろった翻訳呼び出し**である。しかし全ての計器が「この名前は helper か？」を
**読んでいるファイルから**解決しており、`_coL` は `js/companies-ui.js` では束縛されていない。結果：

- `scripts/i18n-report.mjs` は inline の宇宙に入れない → **fr/ko/zh/zh-Hans に行が無く英語のまま**、なのに 100%
- `scripts/i18n-positional-audit.mjs` はドイツ語引数を一度も検査しない
- `scripts/i18n-pair-audit.mjs` は逆に、正しい呼び出し60件を **OPEN GAP として報告**（狼少年）

計器2つが盲、1つが誤報、原因は1つ——**リポジトリ全体の事実を、ファイル単位で問うていた**。
どれか1つを広げても盲点が移動するだけなので（[[intmap-recurring-lessons]] B）、解決を
**`scripts/i18n-helpers.mjs` へ1回だけ**移し、3つの計器がそれを読む。

- **束縛は推移的**（`IntMapLang.pick()` → `_coL` → `HOST._coL` → `const L = CTX.L`）なので**不動点**まで解く。
- ⚠ **helper と helper の「結果」は別物**。`boundTo()` は CallExpression を貫通するので
  `el.textContent = IntMapLang.t(lang,…)` が `IntMapLang.t` に見える。初版はこれで
  `textContent` / `innerHTML` / `title` / `name` を「helper のプロパティ名」として収集し、
  js/ の**全 DOM 代入を pair 監査から免除**するところだった。呼ばれた `pick()`/`pickArgs()` は helper を返し、
  呼ばれた `t()` は**文字列**を返す——2つを別々に問う。
- ⚠ **慣用名 `L` は証拠ではない**。`js/i18n-late.js` は `L` を**キー引き**に束ねており、
  そこへ種を撒くと `'tkgFx'` `'tkgIdx'` `'tkgCom'` `'tkgCrypto'` `'tkItems'` `'tkNews'` が
  英語散文として inline の宇宙に入った。ファイルが明示的に別のものへ束ねた名前は toolkit ではない。
- 実測: inline の宇宙 3,421 → 3,445（+30 文字列）、positional の site 4,034 → 4,186、OPEN GAP 696 → 636。
  さらに **guarded な束縛**（`var LA = (root.IntMapLang && root.IntMapLang.pickArgs()) || function(){…}`、
  js/space-cosmos.js と js/engine-select.js が評価順のために意図してこう書いている）を
  `LogicalExpression → right` で辿って**フォールバック関数**に解決していたため、
  **既に完全に変換済みの10ファイル・114件**が OPEN GAP として報告されていた（636 → 522）。

### ⚠⚠⚠ (#R251) 「翻訳の仕組み」そのものが5言語で頭打ちだった箇所

これらは**訳すべきデータ**ではなく、**5言語しか持てない機構**だった。データを訳しても直らない。

| 場所 | 何だったか | 影響 |
|---|---|---|
| `js/map-ui.js` | `const L5=(en,jp2,de,ru,es)=>({en,jp:jp2,de,ru,es})[HOST.lang]‖en` | 読み取り値ラベル36件が fr/ko/zh/zh-Hans で英語。しかも**不可視**——callee が registry に束ねられていないので report が見ず、langmap 監査も**引数から組み立てた**オブジェクトは見ない（#R250 が `_dc(…,en,jp,…)` → `title:{en,jp}` で見つけた盲点と同型） |
| `js/map-readout.js` | `const L5=(en,jp)=>HOST.lang==='jp'?jp:en` | 津波読み取りが**2言語**。9言語中7言語で英語 |
| `js/companies-ui.js` | `_coCountry` が `HOST.lang==='jp'?c[1]:c[0]` | Companies の国名が**9言語中8言語で英語**。#R240 の規則どおり CLDR へ（alpha-2 鍵は**行に既にある**——国旗絵文字は regional indicator 2文字そのもの） |
| `js/monitors.js` | `list(arr,titleEn,titleJp,titleDe,titleRu,titleEs)` | 5文字列が `list` の**引数**であって helper の引数ではないので、見出し3件をどの計器も数えない |
| `js/onboarding.js` | `jp ? [4行] : de ? [4行] : [4行]` | **ウェルカムカード**（読者が最初に見る画面）が ru/es/fr/ko/zh/zh-Hans で英語 |

⚠ **`[ja, en]` 順の行は「読み出しを直す」だけでは足りない**（js/beta-overlays.js の `BLBL`、
js/layer-packs.js の `RAIL_LBL` / `CLBL`）。inline 表は**英語の原文をキーにする**ので、
英語が枠1にあると言語を足しても一致しない。**英語を枠0へ入れ替える**のが変換の一部である。

### ⚠⚠⚠ (#R251) 画面そのものを言語ごとに測る —— **形を持たない計器**

`scripts/i18n-*.mjs` はすべて**ソース**を測り、それぞれが**形**を測る。16個見つかり、そのどれもが
**読者が画面で英語を見つけたこと**で発覚した。形に沿った計器は、誰かが既に思いついた形しか見えない。

`tests/r251-langs.spec.js` は形を持たない。アプリを開き、言語を切り替え、**描画された DOM**（テキストと
`title` / `aria-label` / `placeholder`）を読み、**IntMap が既に訳を持っている文字列が英語で出ていたら落ちる**。
どの形が原因かは一切問わない。

- 「訳が存在するか」は**登録簿から**答える——keyed は `ui.en.js` の値→鍵→`keyed(lang,key)`（9言語）、
  inline は `_inline[lang][text]`（fr/ko/zh/zh-Hans のみ。de/ru/es は**位置引数**なので引くべき表が無く、
  そちらは `scripts/i18n-positional-audit.mjs` が持ち場）。
- ⚠ **判定は推測しない**——**その言語で異なる文字列をアプリ自身が持っている**ときだけ鳴る。
  固有名詞・数値・社名・両言語で同じ語は、異なる行が無いので原理的に報告されない。
- この計器だけが見つけた欠陥: `rh.title='Drag to resize'`（2ファイルの**素の英語リテラル**）、
  国一覧の**大陸のサブ行**が全9言語で英語、MapLibre が canvas に書く `aria-label="Map"`
  （**スクリーンリーダー利用者だけが出会う1文字列**——だから誰も気づかなかった）、
  そして**開いたままのパネルは言語に追随しない**（`open` は開いているパネルには no-op で、
  中身を貼り替えるものが無い＝Objects パネル・レイヤーサイドバー）。
- ⚠⚠⚠ **計器自身が、それが捕まえるはずの欠陥を持っていた。** 初回実行は 681 件を報告した。
  全部が偽——`window.setLanguage(lang)` を `try {} catch {}` で囲んで呼んでいたが、
  **`window.setLanguage` は存在しない**（切替は `js/app-body.js` の閉包 `setLang()`、`#lang-<code>` に配線）。
  例外は握り潰され、言語は一度も変わらず、テストは自分の沈黙の産物を律儀に数えた。
  現在は**切替が成立したことを表明**する。`tests/r161.spec.js` に同じ死んだ呼び出しがあり、
  「全UI言語で」のループは #R161 以来**5回とも英語を測っていた**——そちらも直した。
- 除外は**1つだけ・セレクタで・理由付き**: ニュースの `.loc-chip`（解析器が解決した地名が英語のまま
  印字される。フランス語話者には「Japan」と出るが IntMap は「Japon」を持っている）。
  数ではなくセレクタで除外するのは**ニュースが生データ**で件数が実行ごとに変わるため。
  直しは `js/newsgeo.js` の契約変更なので、計器と同じコミットには入れない。それ以外は**ゼロ**。

### ⚠⚠⚠ (#R251) 简体中文の字体変換表は 1,529 字中 439 字しか覆っていなかった

`scripts/zh-hans.mjs` の手書き対応表は 440 組。`ui.zh.js` が実際に使う漢字 1,529 字のうち
**1,090 字に項目が無く**、そのまま素通りしていた——つまり简体の文中に繁体字が混ざったまま
**ずっと出荷されていた**: 「烏克蘭前线」「貪腐指标」「紐芬蘭自治领」「制藥生产基地」「樹木覆盖」「苔蘚与地衣」。

誰も忘れてはいない。**手書きの表は「自分に何が欠けているか」を言えない**ので、
各ラウンドがそのラウンドで持ち込んだ字だけを足し、差は静かに広がった（[[intmap-recurring-lessons]] G）。

- 字体変換は**もう我々の表ではない**。OpenCC（`opencc-js`、**ビルド時 devDependency**）へ。
  ブラウザには何も増えない（このスクリプトはビルド時に走ってファイルを書く）。
- ⚠ **`tw → cn`（字体のみ）であって `twp` ではない**。phrase 版は台湾**語彙**も大陸語彙へ直すが、
  それはこのプロジェクトの WORD 表が**既に繁体字のまま**やっている。両方かけると
  `檔案` →（表・正しく）`文件` →（OpenCC・我々の大陸語を台湾語と誤読して）`文档` になる。
  実測「十年時光回溯檔案」→「十年时光回溯文档」。`tests/r224 ④` が捕まえた。
  **一方が語彙を持ち、他方が字体を持つ。**
- ⚠ **WORD 表は今も先に走り、今も勝つ**（图磚→瓦片、太空人→宇航員 …＝このプロジェクト自身の判断）。
  消したのは「published な対応表の代役をしていた部分」だけである。

### ⚠⚠⚠ (#R249) 12個目の形の数え方を正した —— 2,031 のうち **1,335 は翻訳すべき文字列ではなかった**

「固有名詞は構造的に除外し、UI文だけ全言語化」（利用者確認済み）。

12個目の形（隣接データとして持たれた翻訳対）の数は #R246 で 2,262、#R248 で 2,031 だった。
その大半は**アプリが書いた文**ではなく、**実在する対象の記録**である——地名の行、団体の本部、企業、
鉄道駅。`AAPL / Apple / アップル` の9言語訳を要求するのは固有名詞の翻訳を要求することであり、
#R248 は codemod がこれを推測したときに何が起きるかをすでに測っている（**照合語を UI として登録し、
次のラウンドが律儀にそれを翻訳しにくる**）。

⚠ **そして推測では分けられない。** 「行が座標を持つか」という一見構造的な規則は
`['city',['Naples',…],14.27,40.85,'Naples','ナポリ']` を正しく除外し、
`E(1492,-74.48,24.10,'geo','Columbus reaches the Americas',…)` を**誤って**除外する。後者はまさに
このゲートが見つけるべき UI 文である。どちらであるかは表の書き手が持つ知識であって、構文は運んでいない。

⚠ **だから宣言し、その宣言を検証する**（これが「このファイル内の名前一覧」ではなく構造規則である理由）:

```js
/* @i18n-entity-data  place names — matched and displayed, not UI prose */
const _BUILTIN_GZ=[ … ];
```

- 印は、その行が**言語によらない対象の鍵**（座標対・ISO コード・ティッカー・ドメイン）を
  持つ場合にのみ有効。**散文に付けた印は拒否され、ゲートが落ちる**——これが計器一族を
  無効化できる唯一の道筋なので、警告ではなく**ハードな失敗**にしてある。
- 除外件数は**毎回印字される**。見えない除外は誰も再検討しない。
- ⚠ **照合語の除外規則は「位置」でなく「形」**に直した。#R248 は `parent.elements[0]` だけを見ており、
  `js/gazetteer.js` が**スロット1**に置いている 328 件の照合語リストが2ラウンド「誰かが翻訳すべき
  文字列」として数えられていた（この計器の全体の 6%）。

実測: **2,031 → 696**（除外 1,335・すべて検証済み）。残る 696 は本物の UI 文であり、OPEN GAP の
ラチェット（`tests/r249-checks ⑤`）は下方向にしか動かない。

### (#R249) 国名は表ではなく CLDR から —— **祝日ウィジェットの国選択**

`js/widgets.js` の国選択は `[cc, en, ja]` を `jp() ? c[2] : c[1]` で読んでいたので、読者が選ぶ国の一覧は
**de / ru / es / fr / ko / zh / zh-Hans で英語**だった。どの計器からも見えない——対の監査の免除は
ファイル単位で、これは腕がメンバ式の三項なので2分岐監査もヘルパ三項監査も読まない。
答えは列を7つ増やすことではなく `Intl.DisplayNames`（#R240 が国名について、#R246 が言語名について
書いた規則そのもの）。**ISO-3166 コードはすでにスロット0にある**ので、表は自分の CLDR への鍵を
持っている。英語/日本語の列は `Intl.DisplayNames` を持たない実行環境のための**フォールバック**になった。

### ⚠⚠⚠ (#R240) 6つ目の面 —— 上の5つは全部「**表にどれだけ入っているか**」しか測っていない

#R239 は5つを1つのゲートに束ねた。束ねたのは正しく、**宇宙の定義が間違っていた**。5つとも
「すでに系の中にある文字列の被覆」を測るので、**`L(…)` にも `data-i18n` にも一度も渡っていない文字列**は
どの計器から見ても 100% 翻訳済みで、どの画面でも英語である。実測（9言語でアプリを起動して画面の文字列を
突き合わせた）で、`title` / `aria-label` / `placeholder` の**49語が全言語で英語**だった。
`aria-label` に至っては**キーの仕組みそのものが無かった**。

- `scripts/i18n-attr-audit.mjs` が `index.html` / `admin.html` の全開始タグを走査し、読者に見える属性で
  キーを持たないものを行番号付きで出す。除外は**値の種類**（URL・数値＋単位・絵文字・固有名詞・言語の
  自称）であって特定の文字列ではない。
- `js/app-body.js` の `applyLang` に `data-i18n-aria` と `data-i18n-alt` を追加。
  （既存は `data-i18n` / `data-i18n-ph` / `data-i18n-title`。）
- **面として `scripts/i18n-audit.mjs` に足してある。**単独の6つ目の計器にはしていない——それが #R239 の
  ヘッダが警告している間違いそのものだから。新しい面は**ここに1回だけ**足す。

### (#R240) 国名は表ではなく **CLDR** から

`cName`（`js/app-body.js`）は `nameJp` / `nameEn` の2分岐で、国別統計タブの200行が日本語以外の全言語で
英語だった。答えは 200×8 の表ではなく `Intl.DisplayNames`——ブラウザ自身の CLDR に ISO 3166-1 の正規訳が
すでにあり、まだ追加していない言語でも正しく、古くならない。機構は `window._imCldrRegion`
（`js/countries-ui.js`）にあり、**シェルには置かない**（tests/r168 #8 の行数上限は下がる方向にしか動かない）。
日本語は編集上の選択（「アメリカ合衆国」）なので `nameJp` が勝つ。

### ⚠⚠⚠ (#R241) 7つ目の面 —— 翻訳が**呼び出しでなく配列**で書かれていると、どの計器にも見えない

6つの面はどれも「文字列」を数える。7つ目は**形**の問題である。js/ の6つの表は、あとで解決できるように
翻訳を配列として持ち、言語の位置で添字していた:

```js
{id:'ec-temp', label:['Temperature 2 m (ECMWF)','気温 2m（ECMWF）','Temperatur…','Температура…']}
const ecLbl = (l) => l.label[IntMapLang.index(HOST.lang)] || l.label[0];
```

要求としては正当（表は残り、言語だけが変わる）。だが代償が3つあり、全部実測された:

1. `arr[i] || arr[0]` には**インライン表への退避が無い**ので、引数を超えた言語（fr/ko/zh）は
   ロケールファイルに何が書いてあろうと**永久に要素0＝英語**;
2. 多くが4要素（en/jp/de/ru）か2要素なので、位置引数で解決できる**スペイン語すら英語**に落ちる;
3. **配列リテラルは CallExpression ではない**ので、インライン報告も位置引数監査も2分岐監査も0件と数え、
   3つとも 100% と表示する。該当は **188 文字列**（気象レイヤー名・GIBS レイヤー名・統計指標名・作物名・
   貿易分類・避難区域名・凡例タイトル）。

⚠ **答えは「訳す」ではなく「その形を無くす」。** `window.IntMapLang.pickArgs()` は渡された引数の配列を
そのまま返すので、

```js
const LA = window.IntMapLang.pickArgs();                       // 1スコープに1回
label: LA('Temperature 2 m (ECMWF)','気温 2m（ECMWF）','Temperatur…','Температура…','Temperatura…')
const ecLbl = (l) => L.arr(l.label);                            // = pick() 自身
```

は**同じデータでありながら、ふつうの `L(…)` 呼び出し**になる。既存の計器はどちらも
「`IntMapLang.pick…` に束ねられた識別子」を探しているので、**1行も直さずに拾う**。解決は `L.arr()`＝
`pick()` 自身なので、退避の規則はアプリ全体で1つ。

- ⚠ `scripts/i18n-positional-audit.mjs` の検出だけは `pick\s*\(` という**正規表現**で、`pickArgs(` に
  一致しなかった。広げるまで **218 サイトがこの監査の宇宙の外**にいた（2,195 → 2,413）。
- `scripts/i18n-positional-array-audit.mjs`（新）が**形の再発**を見張る: 登録簿の外の
  `IntMapLang.index(…)` と、私設の言語→位置マップ（`{jp:0,en:1,…}`）。どちらも構文なので、
  それを引用したコメントでは発火しない。**これも面として1つのゲートに足してある。**
- ⚠ **この計器が見ない形が1つ残っている**: `HOST.lang==='jp' ? r[1] : k` のように**両腕が変数**の2分岐
  （2分岐監査はリテラル同士しか見ない）。#R241 は `CROPS`（作物名31件）でこれを踏み、手で直した。

**`scripts/i18n-audit.mjs` はそれら全部を起動して、言語 × 面の行列を1つ出す。** `--gate` は1セルでも
足りなければ 1 で終了し、`npm test`（`scripts/test-parallel.mjs` の acorn 系ゲート群）から毎回走る。
⚠ **この束ね役は自前のパーサを1つも持たない**——他が測る量を2度実装すると片方が必ず古くなる。

#### #R239 が初回起動で見つけたもの（どれも計器の視野の外にあった）

- **`pages.fr.js` と `pages.ko.js` が存在しない**＝仏語・韓国語の読者は sources / science の**全文が英語**。
- **`pages.zh-hant.js` に `blocks` が1本も無い**（見出しと目次だけ）＝繁體・簡体も**両ページの本文が全部英語**。
- **keyed 表の宣言箇所は7ファイル**（`js/i18n-late.js` ほか6つが `Object.assign(i18n.en…es,{…})`）。
  **5言語決め打ち**なので、fr/ko はその92キーのうち**5個**しか持っていなかった（支援ダイアログ・
  出典モーダル・スクショ・設定の大半が英語）。de/ru/es も82/92。
- **de/ru/es の読み物ページの構造が英語からずれていた**（英語が `tex` へ置き換えた `eq` ブロックが3言語に
  残っており、以降のブロックの添字が全部1つずれていた）。

#### 言語を足すのは1コマンド — `scripts/i18n-new-language.mjs <code> [tag]`

ゲートが要求する**すべてのファイル**を書く: `js/locales/ui.<code>.js`（keyed は**宇宙全体**＋inline 全件）、
`js/locales/pages.<tag>.js`、`js/locales/_langs.js` の再生成。既定値は英語なので、**最初のコミットから
読める**（`js/i18n.js` はキー単位で英語へ落ちる）。残りは `node scripts/i18n-audit.mjs --todo <code>` が
**コマンドの形で**答える。⚠ 差分の top-up は `scripts/i18n-append-inline.mjs`（inline）と
`scripts/i18n-append-keyed.mjs`（keyed）と `scripts/i18n-pages-apply.mjs`（読み物ページ）。どれも
**挿入だけで、書き換えない**（[[intmap-recurring-lessons]] H — #R235 の再生成は翻訳を205件破壊した）。

⚠⚠ **読み物ページの被覆は「存在する」ではなく「英語と違う」で数える。** `i18n-pages-apply.mjs` は
新言語を**英語の複製**から始めるので、存在で数えると新規ファイルはその瞬間に 287/287 と出る——これは
このラウンドが潰しに来た欠陥そのもので、実際に1コマンド差で出荷しかけた。数式・slot の id・章の id は
構造として除外し、言語をまたいで同じ語（`z` / `~10 m` / de·es の «Tsunami» / fr の «Satellites» ほか）は
**言語ごとの明示リスト**に載せる（グローバルにすると韓国語や中国語の英語残りを見逃す）。

**#R239 時点: 9言語 × 4面すべて 100%。**（`(beta)` 表記は `scripts/i18n-langs.mjs` が被覆から計算する。
fr/ko/zh/zh-hans はすべて外れた。）


- `i18n.en` / `i18n.jp` の辞書 ＋ `t(key)`。`data-i18n` / `data-i18n-ph` 属性を `updateI18n()` が一括適用。
- `currentLang`（`intmap_settings` に保存）。設定で切替。
- ⚠⚠ (#R233) **言語の切替は「その言語の文字列が届いてから」行う**（`js/lang-switch.js`）。
  #R232 が locale を遅延チャンク化したとき、**コールド起動のバリアだけ**が待つようになり、
  実行中の切替（ヘッダのピル／設定のプルダウン）は待たないままだった。実測（ビルド済みサイト・
  英語で起動 → JP を押す）: `isLoaded('jp')=false` / `i18n.jp` の自前キー **168**（英語は 452）/
  `i18n.jp.modalTitle==="Settings"` ——**設定ダイアログの題・節見出し・Apply・法務リンク・
  サイドバーのタブ名が英語のまま**で、app-body と i18n-late が eager に持つ文字列だけ日本語になる。
  これが 「基本的なUIですら言語が混在」 の正体。
  - `IntMapLangSwitch.when(code, apply)` — 既に読み込み済みなら同期（＝5言語と2回目以降は従来通り）、
    未読なら `ensure()` の解決を待って**まとめて**適用。中間状態が存在しないので混ざりようがない。
    ⚠ **失敗しても apply する**（届かない locale は英語へ落ちるのが設計。ピルが無反応になってはいけない）。
  - `IntMapLangSwitch.bind(getLang, repaint)` ＋ `IntMapLang.onDefine` — locale が**別の経路**で
    後から届いたとき（コールドブート・先読み・再試行）、**画面を描き直す**。`js/i18n.js` の
    onDefine は表を in-place マージするだけで、**表を混ぜることは文書を描くことではない**（実測:
    手で `ensure('jp')` を呼ぶと表は 452 キーになり `#modal-title` は "Settings" のままだった）。
  - ⚠ **JS が自分で書くラベルは `updateI18n()` の走査が届かない** → `intmap-lang` を購読すること。
    実測で残っていた最後の1件が `#setting-wsmode-btn`（`js/workspace.js` の `syncModeBtn`）。
  - (#R233) 表に一度も無かった5文字列を追加: `lnkTerms` / `lnkPrivacy` / `legalTabTerms` /
    `legalTabPrivacy` / `commAddImage`（最後のものは `jp?…:…` の2言語ターナリだった）。
- **UI言語は en/jp/de/ru/es の5言語＋ zh（繁體中文・beta、#R223）＋ zh-hans（简体中文・beta、#R224）**。
  ⚠ (#R224) **簡体は「翻訳」ではなく `scripts/zh-hans.mjs` の生成物**。繁體の全訳（keyed 284＋inline 1,882）に
  ①大陸語彙の置換（網路→网络・資訊→信息・螢幕→屏幕・檔案→文件・預設→默认・選單→菜单・使用者→用户・
  解析度→分辨率・座標→坐标・公尺→米 …）→ ②字体変換、の順で通す。`node scripts/zh-hans.mjs --check` が
  `tests/r224-checks ④` から走り、`ui.zh.js` を直したのに再生成していなければ落ちる（＝2つの表が乖離しない）。
  ⚠ エイリアスは**簡体の綴りだけ**（zh-cn/zh-sg/zh-my/zh-hans）。素の `zh` は繁體のまま——2文字が同じだから
  といって別の字体を渡すのは推測である（#R223 の理屈）。⚠ 言語行は `pill`（`繁`/`简`）を持てる：
  コードをそのまま出すと `ZH-HANS` の7文字で言語バーが折り返す。インライン文言は `L(en,jp,de,ru,es)` /
  `T(...)` ヘルパの5引数ターナリ。（#R64: EN/JPのみ残っていた約190箇所を5言語化 — 新規実装は必ず5言語で書くこと。）
  ⚠ **6言語目以降は引数ではなく `inline` 表**（`js/locales/ui.<code>.js`、英語の文字列がキー）。呼び出し側は不変。
  ⚠⚠ (#R231) **その「338か所の言語三項演算子」は解消済み**。281本が残っていて、`L(…)` ではないので
  `scripts/i18n-report.mjs` から**見えず**、七ラウンド「100%翻訳済み」と表示されながら中国語画面には
  英語が出ていた。`scripts/lang-ternary-codemod.mjs`（AST）が **268本**を
  `window.IntMapLang.t(lang, en, jp, de, ru, es)` へ変換（`pick()` と同じ挙動・言語が第1引数なので
  **式→式**の局所置換で済み、ファイルごとの helper もスコープ解析も要らない）。
  `node scripts/lang-ternary-codemod.mjs --check` が `tests/r231-checks ⑦` から走り、変換可能な鎖が
  1本でも残っていれば落ちる。残る109本は**英語側がテンプレートリテラルや変数**のもの＝`inline` 表の
  キーにできないので変換しても中国語は増えない（意図的に手つかず）。
  ⚠⚠ **識別子は翻訳ではない**：`lang==='jp'?'jma':'mmi'` は震度スケールの選択であって文ではない。
  翻訳表に載れば**翻訳者が物理を変える**。codemod は「短い小文字1トークン」と BCP-47 らしい値を除外する。
  ⚠ `Intl` のロケールも同じレジストリから：`IntMapLang.locale(code, enTag)`。第2引数があるのは
  `'en-GB'`（24時間制）と `'en-US'` が呼び出し側ごとに違い、**英語読者の表示を変えない**ため。
  ⚠ **計器が見える文字列は 1,889 → 2,066**、中国語の被覆は偽の100% → 91% → 190件を訳して **100%**。
- **平面地図の既定は「自由スクロール」**（#R223、それ以前は範囲固定）。⚠ 既定を変えただけでは
  一度でも設定を保存した人は旧既定のままなので、#R155 と同じラッチ（`flatPanSet`＝設定パネルを
  適用した瞬間に書かれる）で**保存値の一度きりの移行**をしている。
- 利用規約・プライバシーポリシーの本文のみ jp/en の2言語（法的文書のため。de/ru/es は英語表示）。
- **独立ページ（`sources.html` / `science.html`）は別系統**（#R218）。アプリの `i18n` 辞書ではなく
  `js/page-i18n.js` ＋ `js/locales/pages.<bcp47>.js`：ページは**言葉を持たない殻**で、
  ⚠⚠ (#R231) **この機構は #R221 のレジストリとは別に自前の `LANGS`（5行の literal）を持っていた**——
  だから #R223 の繁體も #R224 の简体も**この2ページには一度も届いていなかった**（アプリを中国語にした
  読者が開くと英語で、ピッカーにも中国語が出ない）。`LANGS` は `window.IntMapLang.list()` から
  導出するようになり、`sources.html`/`science.html` は `js/lang-registry.js` を `page-i18n.js` より
  **先に**読む。ファイル接尾辞は各行の `html`（BCP-47）タグ＝既存5言語は `en/ja/de/ru/es` のまま
  1ファイルも改名なし、中国語は `pages.zh-hant.js` / `pages.zh-hans.js`（後者は `scripts/zh-hans.mjs` の生成物）。
  ⚠⚠ (#R231) **`sectionsOf` は節を丸ごと差し替えていた**——見出しだけ訳して `blocks` を書かない節は
  **英語の本文を消していた**。フィールド単位のマージに修正（同ファイルの見出しが謳う「per key, not per
  page」がここだけ嘘だった）。これで長い文書を段階的に訳せる。
  ⚠ **中国語2ファイルは現在、題・リード・28節すべての見出しと目次のみ**。本文の散文は節ごとに英語へ
  フォールバックする（残作業）。
  `css/pages.css`（共有）・`js/page-i18n.js`（言語の読み込みと文書のレンダリング）・
  `js/sources-list.js`（出典レジストリの描画）で出来ている。
  ⚠ **言語を1つ足すコストは「locale ファイル1つ＋`LANGS` に1行」**（HTML は触らない）。
  ⚠ フォールバックは**鍵ごと**（未訳の文だけ英語になり、ページ全体が英語に落ちない）。節は id で突き合わせる。
  ⚠⚠⚠ (#R246) 出典レジストリ87件の説明文は **全9言語とも** locale ファイルの `sourceUse` にあり、
  Sources ダイアログを開いたときだけ取得する（起動時のバンドルには入らない）。**英語原文もここにある**——
  これが要点で、`scripts/i18n-pages-audit.mjs` は各言語を「**英語文書の全文字列パス**」に対して測るので、
  英語が `js/reference-data.js` の `use:{en,jp}` にあった間は de/ru/es の翻訳は数えられず、
  **fr/ko/zh/zh-Hans の完全な不在が 287/287＝100%** と出ていた。宇宙は **287 → 374** になった。
  副産物として起動バンドルから約 50 kB の散文が消えた（`js/reference-data.js` は eager import）。
  ⚠ `js/page-i18n.js` / `js/sources-list.js` は `index.html` から辿れないので、到達性の検査
  （`scripts/static-checks.mjs` と `tests/r175-checks`）は**独立ページの `<script src>` も読む**。
- Atlasの応答は**ユーザーのメッセージの言語をミラー**（`_replyLang`、#R64）。UI言語はフォールバック。
- ニュースは**多言語取得＋AIタイトル翻訳**が任意機能（`newsLangMode`、`aiTranslateTitles()`）。
- **表示済みレイヤー凡例の言語追従**（#R110）：中核データ凡例は `buildCoreLegends()` にまとめ、`intmap-lang` で新言語に**再構築**（開閉状態とドラッグ位置は保持。不透明度/日付/単位は `opacities[]`/`layerDates[]`/`windUnit` に永続）。旧実装はタイトルのみ差し替えでスケール/単位/説明が旧言語のまま残っていた。
- **歴史的国名の多言語化**（#R107 `_locName` → #R110で拡充）：植民地連邦・保護領・旧州・戦間期/占領期国家・主要な前植民地王国を `_ERA_LOC` に追加し、`(宗主国)` 接尾辞（`Algeria (France)`→`アルジェリア（フランス）`）は**基底名＋宗主国を各言語化**する汎用ハンドラで対応（EN以外の全言語）。

---

## 11. フィードバック・寄付・管理機能

- **フィードバック**：`feedback` テーブル。`recordLogin()` が本物のログインを数え、3回目に既存モーダルを1回表示。
- **寄付**：Stripe リンク（言語別）。
  - EN: `https://donate.stripe.com/5kQdR2d2m1oa1lAadk5gc01?locale=en`
  - JP: `https://donate.stripe.com/8x29AM9Qa2se7JYetA5gc00?locale=ja`
  - 記録は `donations` テーブル。
- **管理コンソール `admin.html`**：`geo_pins`（ニュース辞書）の追加/編集、`dashboard_cards` 編集、
  `community_reports` の対応、`feedback` 閲覧、`community_posts/comments` のモデレーション。

---

### (#R239) 地震波は「線」ではなく「帯」— 破壊中の断層が見えるのはその後端

#R238 が5行の代数で確定させたとおり、**Vr ≤ V であるかぎり初動の等時線は厳密に震央中心の円**である
（`t(x) = min_k(off_k/Vr + dist(k,x)/V)` の括弧が常に ≥ 0）。これは改善できる近似ではなく物理である。
だが有限の破壊が持つ境界は**2つ**あり、もう一方は円ではない:

```
T_first(x) = min over k ( off_k/Vr + dist(k,x)/V )    ← 円（定理）
T_last (x) = MAX over k ( off_k/Vr + dist(k,x)/V )    ← 断層の形が出る
```

その間が「いま揺れている」帯で、`T_last − T_first` は表の**継続時間**そのもの。破壊が向かった側では
狭く（＝指向性）、背後では広い。`_envRmin()` が最終到達を解く。⚠ **後端に `_prune` を掛けてはいけない**
——最大値に勝てないとして捨てられる点こそが、最小値を決める点である。⚠ 点震源では両境界が一致するので
**帯は描かれない**（正しい。長さが無ければ到達時刻は広がらない）。実測（M8.4 手描き震源域・t=420s）:
先頭は方位0/90/180/270 で 3992/3995/3995/3991 km（＝円、誤差0.1%）、**後端は 2405/2039/1538/1817 km**。

## 12. 壊れやすい部分・注意すべき部分

- **【最重要】JSテンプレートリテラル内のCSSにバッククォートを書くと全画面が真っ白**（コメント内でも）。動的CSSは `'...'` で。
- **「パースOK」≠「動作OK」**。必ず**レイヤー行≈72個** ＋ **コンソールエラー0** を確認する。
- **basemap スタイル切替（Map↔Sat）はカスタム source/layer を破棄する**。`countries`/`country-fill` 等は
  必要時に再生成する（Countries(info) ハンドラは `addCountryLayers()` を再実行して自己修復）。
- **(#R158) 衛星タイルは `maplibregl.addProtocol('imapsat')` 経由**。Esri World_Imagery のネイティブ最大zoomは地域で異なり超過タイルは灰色「no data」（固定~2521B）を返すので、fetch でバイト長≤3500Bを灰色判定→**最寄り実祖先タイルの該当象限を高品質クロップ拡大**（都市z19はネイティブ素通り・LRU+生fetchキャッシュ・エラーで生バイトフォールバック）。Esriは `ACAO:*` なのでプロキシ不要。`window.__imSatProto` 偽なら直Esriへ縮退。灰色タイルが全域で消滅し外洋も実衛星が出る（フライトシムの青い水fillはこれで不要になり撤去）。
- **(#R178/#R179) ラスタは HiDPI 画面で半分の解像度になる**——MapLibre はラスタのタイルズームを
  `zoom + log2(512/tileSize)` で選び、**`pixelRatio` はこの式に入らない**のにキャンバスは devicePixelRatio で描かれる。
  判定は **`_hiDPITiles` に1つだけ**（デスクトップ・DPR≥1.5・非 Data Saver・非2G。`window.__imHiDPITiles` で観測可）。
  - **衛星（Esri）**: @2x エンドポイントが無いので `imapsat` プロトコルで**次のズームの4枚を 512×512 に綴じる**（#R178）。
    `addProtocol` は ImageBitmap をそのまま返せるので再エンコード無し。子が1枚でも欠け/灰色なら丸ごと従来経路＝**画質は上がるだけ**。
  - **基図（Carto）**: `{z}/{x}/{y}@2x.png` を**サービス自身が配信**するので綴じ合わせ・追加リクエスト・代替経路すべて不要（#R179）。
    **同じタイル数**で画素が2倍。#R178 は衛星だけ直したので、**アプリが開く画面がずっと半解像度だった**。
  - **(#R179) タイルキャッシュ上限はバイトで言う**：#R21 の `maxTileCacheSize:8192` は 256²＝約0.26MB 前提。
    512² では同じ枚数が4倍のメモリなので、倍密度時は **2048**（同じバイト数）。携帯は @2x を取らないので数字は不変。
  - **(#R179) 綴じ合わせは「無い画像」に払わない**：z10 近傍ごとに `have`（実画像が見えた最深）と
    `stop`（**次の段が灰色だと観測された**最深実ズーム）を**別々に**持ち、**止めてよいのは `stop` だけ**。
    混ぜると「z の実タイル＝もう限界」と読まれて**あらゆる都市で @2x が無効になる**（実際にそうなった）。
    記録は**訊かれたタイル**に対して（祖先に対してではない。z8 祖先は z10 セル16個にまたがる）。
    `window.IntMapSatProto.depth/wouldStitch/hiDPI` で観測可。
- **`reorganizeLayerPanel()` は DOM を大量に並べ替える**。タップ中に走ると行がずれて誤タップの原因になり得る。
- **ケッペンのOOMクラッシュ**：モバイルは必ず軽量 `*_4k.png` を使う（フル解像度はモバイルでRAM超過）。
- **ヘッドレスプレビューは `document.hidden`** で WebGL の `load` が発火しない。地図描画はDOM/状態/console で検証する。
  `requestAnimationFrame` も止まるため、UIのフェードイン等は `setTimeout` のフォールバックを持たせる（ウェルカムカード参照）。
- **ニュースは current_news 依存**：cron が動いていないとフロントは自動でライブRSSフォールバックに落ちる（鍵不要だがCORSプロキシ依存）。

## 13. 触ってよい部分 / 慎重に触るべき部分

**比較的安全（加算的に拡張しやすい）**
- 辞書の追加（`geo_pins`、クライアント `_EXTRA_GZ/_DEMONYM_GZ/_ORG_GZ`、サーバー `EMBEDDED_PLACES/DEMONYM_DICT/ORG_DICT`）。
- データレイヤーの追加（既存の setup パターンに倣う）。出典は `DATA_SOURCES` に追記。
- i18n 文言、ウィジェット、設定項目の追加。

**慎重に（壊れやすい中核）**
- `reorganizeLayerPanel()` / `_refreshActiveLayers()` / レイヤーパネルのDOM順序とスクロール補正。
- チェックボックスの決定論的トグル（`#layer-dropdown` の pointerdown/click ハンドラ）。
- `applyTheme()` / `_reassertBase()` / styledata 自己修復まわり。
- 投影・3D・compare の同期。Isolate のマスク順序(`toTop`)。
- AIプロキシ / refresh-news の鍵・上限・再利用ロジック。

---

## 14. 新しい環境で IntMap を復元する手順

1. **取得**：このリポジトリ一式を配置（`index.html` がそのまま本体）。
2. **Supabase プロジェクト**：プロジェクトを用意し、`index.html` の `window.SUPABASE_URL` /
   `window.SUPABASE_ANON_KEY` を自分のプロジェクトの URL・publishable(anon) キーに差し替え。
3. **SQL 実行**（SQL Editor で一度ずつ）:
   - `supabase/supabase_news_setup.sql`（`current_news` ＋ `analyzed_by` ＋ RLS ＋ cron例）。
   - `ai_usage` 用 SQL（`ai_usage` テーブル＋ `increment_ai_usage`/`refund_ai_usage` RPC＋`profiles.plan/login_count`）。
   - コミュニティ/プロフィール/favorites/dashboard_cards/feedback/donations 等のテーブル＋RLS（既存スキーマに準拠）。
4. **Edge Functions デプロイ**:
   - `supabase functions deploy ai-proxy`
   - `supabase functions deploy refresh-news --no-verify-jwt`
   - `supabase functions deploy monitor-run --no-verify-jwt`
   - `supabase functions deploy sv-cov --no-verify-jwt`（(#R145) Street Viewカバレッジプロキシ・秘密なし）
5. **Secrets 設定**:
   - `supabase secrets set AI_PROVIDER=anthropic`（または openai / gemini）
   - `supabase secrets set ANTHROPIC_API_KEY=...`（または OPENAI_API_KEY / GEMINI_API_KEY）
   - 任意: `AI_MODEL=...`, `REFRESH_SECRET=...`, `NEWS_AI=off`
6. **cron 設定**：`supabase_news_setup.sql` の pg_cron 例で `refresh-news` を約20分ごとに POST（`<PROJECT_REF>`・`<REFRESH_SECRET>` を置換）。
   初回は手動で1回 POST して `current_news` を埋める。
7. **静的ホスティング**：`index.html` / `admin.html` / `data/` / `koppen_*.png` / `sw.js` を静的配信（OneDrive 直配信 or 任意の静的ホスト）。
8. **OAuth/メール認証**：Supabase 認証で Google/Apple/メールを設定（任意）。
9. **動作確認**：ページを開き、(a) レイヤー行（`.lyr-row`）が100個以上（#R169 実測 143個）、(b) コンソールエラー0、
   (c) News タブでピンが即表示、(d) ログイン→AI機能が動く、を確認。
   （(a) と (b) は `npm run test:smoke` が同じことを自動で確かめる。§15）

---

## 15. 運用品質基盤 (CI・テスト・ステージング・リリース・監視) — R133

アプリ本体（`index.html`）とは分離した**開発/CI用ツール**。ブラウザには一切ロードされない（`package.json` の devDependencies はアプリに同梱されない）。目的＝破損を本番前に検知／本番障害の早期発見／安全なロールバック。現行の単一HTML＋GitHub Pages公開を**温存**し、安全設備を追加したもの。

### 15.1 ファイル
- `package.json`（private・type:module）: devDeps＝`@playwright/test`＋`js-yaml` のみ。scripts＝`test`（=`check:static` + Playwright）/`check:static`/`test:smoke`/`test:qa`/`serve`/`report`。`.nvmrc=24`。
- `scripts/serve.mjs` — 依存ゼロ静的サーバ（リポジトリルートを `/` で配信＝GitHub Pages と同一）。
  ⚠ **(#R208) 「Pages と同一」には圧縮も含まれる**——#R133 以来そう名乗りながら**一度も圧縮していなかった**。
  実測：`assets/main-*.js` はローカル 3,603 kB／Pages **1,331 kB** ＝ **携帯回線を模した読み込み計測が
  2.7倍重く出ていた**（fast-4G 起動 7.4→**3.9秒**・slow-4G 33.1→**13.6秒**）。`Accept-Encoding` に応答する。
  ⚠ **brotli ではなく gzip**（`br` を提示しても Pages は gzip を返す＝brotli を選ぶと計測が16%楽観側に狂う）。
  ⚠ **`.gz` は対象外**（`data/*.json.gz` は「gzip 形式の**本体**」であって gzip 符号化された応答ではない。
  `Content-Encoding` を付けるとブラウザが先に展開して素の JSON を渡してしまう）。
  ⚠ 圧縮結果は path+mtime+size でキャッシュ（3.6 MB の gzip は約200 ms・`no-store`・スイートは約185回起動＝
  素だとテストに約40秒足す。実測 初回73 ms／以降4 ms）。
  ⚠ **(#R208) 経路の組み立ては「先に join して後で検査」ではなく「素の区間に分解して ROOT から組み直す」**
  ——前者は正しく効くが CodeQL の tainted-path クエリからは**サニタイザに見えない**（読み出しが2つになった
  瞬間に `Uncontrolled data used in path expression` で PR が赤くなった）。`r208-checks ⑩` が
  **tests/ を root にした2台目**を立てて実際に外へ出られないことを検査する（⚠ `fetch` は `/../x` を
  クライアント側で正規化するので、**percent-encode しないとサーバまで届かない**）。
- `scripts/static-checks.mjs` — 構文（`node --check` 全 js/mjs/cjs/**ts**＝Node24型ストリップ）／JSON parse／YAML(js-yaml)／マージ衝突マーカー／秘密検出（publishable anon はallowlist）／HTML参照ローカルアセット存在。
- `playwright.config.js` — hermeticスモーク＋内部QA用（webServer=serve.mjs・UTC/en-US・SWブロック・prod-smokeは除外）。`playwright.prod.config.js` — 実URL用（webServer無し・retry3）。
- `tests/helpers/network.js` — hermeticルーティング（同一オリジン＋boot CDN2つ〔unpkg/jsdelivr〕のみ許可、他外部は全 `abort`）＋console分類（外部/ネット系はbenign、自コードのみ失敗）。
- `tests/smoke.spec.js`（8） / `tests/internal-qa.spec.js`（3・`IntMapAtlasQA`+`IntMapRegionResolverTest`+`IntMapUIAudit`） / `tests/prod-smoke.spec.js`（実URL・`PROD_URL`）。
- `.github/workflows/` — `ci.yml`（PR+push main+手動・最小権限）／`deploy.yml`（**DORMANT**：`vars.ENABLE_PAGES_DEPLOY=='true'` かつ Pages source=Actions で発火・CIゲート付き本番公開＋`build-info.json`＋post-deploy smoke）／`rollback.yml`（手動・履歴実在refのみ・任意コード公開不可）／`uptime.yml`（6h毎 curl＋自動Issue重複排除/自動クローズ）。
- `.github/pull_request_template.md`・`.github/dependabot.yml`。
- `docs/TESTING.md`・`docs/RELEASE.md`・`docs/MONITORING.md`・`docs/INCIDENT-RESPONSE.md`。

### 15.2 実行
```bash
npm ci && npx playwright install --with-deps chromium   # 初回
npm test           # = 静的検査 + hermeticブラウザ（CIゲート）
npm run serve      # http://127.0.0.1:4173/（Pagesと同じ配信）
```

### 15.3 index.html への追加（追加のみ・既存挙動不変）
- `INTMAP_BUILD`＝現行ビルド識別子（診断/Bug Reportに露出。deployが `build-info.json` で実SHAも刻印）。
- **DORMANT Sentryフォワーダ**（`window.INTMAP_SENTRY_DSN` / `<meta name="intmap-sentry-dsn">` 未設定なら完全無動作・0コスト）。設定時のみ SDK 遅延ロード＋`beforeSend/beforeBreadcrumb` で PII/トークン/cookie/localStorage/Atlas入力/検索語/精密位置を送らずクエリ除去、外部/ネット系はクラッシュ報告しない。既存 `window.__imErrors`（error/rejection リングバッファ）が常時稼働の土台。
- **STAGINGリボン**（`*.pages.dev` / `?staging=1` / meta フラグの時だけ表示・本番/ローカルdevは非表示・`window.INTMAP_STAGING`）。

### 15.4 安全リリース（§6・オプトイン）
現行は「push で branch 自動公開」。CIゲート版へ移行するには **Settings→Pages→Source=GitHub Actions** ＋ **Variables `ENABLE_PAGES_DEPLOY=true`** を設定（それまで deploy/rollback は全 job skip＝現行公開不変）。詳細は `docs/RELEASE.md`。

---

## 16. データ保護基盤 (migrations・RLS/権限テスト・バックアップ・復元) — R134

DB構造を**コード化**（唯一の設計図を本番インスタンスからGitHubのmigrationへ）し、RLS/権限を**自動テスト**し、**バックアップ/隔離復元**を用意し、本番DB変更を**安全化**した設備。§6（テーブル/Edge Functions）を再現・保護する土台。アプリ挙動は不変（唯一の`index.html`変更＝`imViewProfile`のPII安全化）。

### 16.1 Supabase CLI 構成
- `supabase/config.toml` — ローカル/CI用（**本番非接続**）。`db.major_version` は本番一致を要確認。
- `supabase/migrations/20260718090000_baseline.sql` — 全15テーブル＋制約/index、`is_admin()`／`handle_new_user()`トリガ／2 RPC、**RLS全表ON＋ポリシー**、grants（テーブル/カラム/execute）、realtime publication。**冪等・非破壊**（`if not exists`/`create or replace`/`drop policy if exists`・DROP TABLE/COLUMN無し）。コードから再構成したベースライン（本番照合は `db diff --linked` → `migration repair` で権威化）。
- `supabase/seed.sql` — **100%合成**（`.test`ドメイン・プレースホルダUUID・A/B/adminとeach表の代表行）。
- `supabase/tests/*_test.sql` — pgTAP（構造＋RLS/権限マトリクス＋関数）。

### 16.2 RLS 3大保証（テストで実証）
1. **PII非公開**: `profiles`のemail/is_admin/plan は本人+adminのみ。公開表示は `profiles_public` ビュー（id/display_name/bio/avatar_url の4列）。feedback/bug_reports/donations/community_reports/ai_usage は他人/anon読取不可。
2. **昇格不可**: 本人は `display_name/bio/avatar_url/login_count` のみ更新可（カラムgrant）→ is_admin/is_pro/plan 自己設定不可。
3. **quota改ざん不可**: `ai_usage` 書込はSECURITY DEFINER RPC経由のみ、RPC executeは service_role のみ。

### 16.3 CI・バックアップ
- `.github/workflows/db.yml` — `supabase/**` 変更時のみ発火（本CIを遅延させない）。ローカルSupabaseで `db reset`→**drift gate**（`db diff` 空必須）→pgTAP→**backup/restore roundtrip**（合成データ）。**本番非接続・秘密不要・fail-closed**。
- `.github/workflows/db-backup.yml` — **DORMANT**（`SUPABASE_DB_URL`＋`BACKUP_GPG_PASSPHRASE` 両Secret登録まで各run skip）。`scripts/backup-db.sh`＝pg_dump→GPG AES-256→SHA-256→7日暗号化artifact（鍵は別保管・失敗でIssue）。`scripts/restore-test.sh`＝checksum→復号→隔離DBへrestore→構造+RLS検証（非ローカル対象拒否）。
- 採用方針＝**Managed backups優先**（Pro=Daily+PITR推奨）＋休眠pg_dumpをフリー環境の予備。

### 16.4 実行
```bash
supabase start && supabase db reset          # migrations + seed（要Docker）
psql "$LOCAL_DB_URL" -c 'create extension if not exists pgtap with schema extensions;'
supabase test db                             # RLS/権限 pgTAP
supabase db diff --schema public             # driftゼロ確認
```
本番適用は `docs/MIGRATIONS.md`（バックアップ→承認→`db push`）。詳細は `docs/{DATABASE,MIGRATIONS,RLS-TESTING,BACKUP-RESTORE,DATABASE-INCIDENT}.md`。

## 17. セキュリティ基盤 (脅威モデル・XSS防御・Edge Function認証・CI) — R138

セキュリティ監査＋修正の成果。**信頼境界＝サーバー（Supabase）**、ブラウザJSは非信頼。外部から来る値
（コミュニティ投稿、ニュースRSS見出し、OSM/Nominatimの地名、OSM編集可能なウェブカメラURL、AI出力、URL
hash）はすべて敵性入力として扱う。詳細は **`docs/SECURITY-ARCHITECTURE.md`**（脅威モデル・データフロー図・
認証認可・公開値と秘密値の区別・残存リスク・本番手動設定）、報告方法は **`SECURITY.md`**、検査手順は
**`docs/SECURITY-TESTING.md`**。

### 17.1 XSS出力エンコード（第一防御）
- 全アプリJSがインライン＋トークンが`localStorage`＝**XSS＝トークン窃取**なので、**各シンクでの正しい出力
  エンコードが最優先の防御**。非信頼テキストは唯一の正規ヘルパー `window.IntMapSafe`（`<head>`最初の
  scriptでグローバル定義）を通す。`.html(s)`＝`& < > " '` エスケープ（テキスト/属性両対応）、
  `.url(s,{allowData})`＝http(s)/mailto/tel（＋rasterのdata:image・svg不可）のみ許可し
  `javascript:`/`data:text/html`等は`''`。href/src/styleは`html(url(s))`。
- 修正シンク＝コミュニティ（post.img・title/body・avatar_url）／ニュース6経路（title/publisher/name・
  window.open scheme）／ウェブカメラpopup（OSM編集可能url→iframe/video/img/href）／地名検索カード
  （Nominatim display_name/type/country）／USGS/POI。**AtlasのAI返答経路は監査の結果すでに安全**（エスケープ→
  markdown整形の順・リンクは`https?:`強制）＝無変更。URL hash復元・GeoJSONインポート・エラー表示は監査の
  結果安全。回帰＝`tests/security.spec.js`（実ブラウザで無害化確認）＋CodeQL。

### 17.2 Edge Function認証
- **ai-proxy**＝`verify_jwt`＋明示的ユーザー検証（未ログイン401）・プラン別1日上限を`increment_ai_usage`で
  原子的消費・入力上限（prompt24000字/画像4枚）・鍵/prompt/JWTは非ログ。
- **refresh-news**（R138で是正）＝**fail-closed**。`REFRESH_SECRET`未設定なら全リクエスト拒否（503・公開実行
  しない）。秘密は`x-refresh-secret`**ヘッダのみ**（クエリ文字列不可＝ログ流出防止）・**定数時間比較**・POST
  のみ。cronはヘッダで秘密送信（本番手動設定は`docs/SECURITY-ARCHITECTURE.md §9`）。

### 17.3 CSP・ブラウザ・供給網
- GitHub Pagesは応答ヘッダ設定不可＋インライン多用＋外部60+ホスト接続のため、nonce/connect-src許可リストは
  非現実的。採用＝`<meta>` CSP（`object-src 'none'`/`base-uri 'self'`/`frame-src 'self' https: blob:`/
  `worker-src 'self' blob:`/script-src許可リスト＋インライン許可）でアプリを壊さず注入`<script src=evil>`を
  遮断。frame-ancestors/XFO/HSTS/Permissions-Policyはヘッダ専用＝不可→文書化（`§6`）。全`target=_blank`に
  `rel=noopener`。DB側＝`feedback.rating` CHECK（管理画面DoS対策・migration `20260720120000`）。
- CI＝**CodeQL**（`security.yml`）＋`check:static`に**第三者Action SHA固定**検査＋`tests/security-logic.mjs`
  （Edge Function認証不変条件）＋pgTAP `03_security_test.sql`。`npm test`で全実行。

### 17.4 R155 — 統合セキュリティ大改修（本番監査で発見した2重大脆弱性の修正・本番反映済）
- **本番はマイグレーションファイルと乖離しうる**という前提で `supabase db query --linked` により**本番実状**（`pg_policies`/`role_table_grants`/`pg_proc`）を監査。**profiles上に2件のライブ重大脆弱性**を発見・同日修正・本番検証：(1) `SELECT … USING(true)` ポリシ2本で全ユーザの `email`/`is_admin`/`plan` が**世界公開**→DROP＋`profiles_public` ビュー化、(2) table-level UPDATE grant＋列無制限UPDATEポリシで `is_pro`/`plan` **自己昇格**（既存 `guard_admin_flag` は `is_admin` のみ防御）→grant REVOKE＋**`tg_profiles_guard_privcols`**（grant非依存BEFORE UPDATEトリガ）。
- **最小権限化** `20260722100000_security_r155.sql`：anon/authenticated から全publicテーブルの既定`ALL`をREVOKE→最小再付与（R144が漏らした monitor子テーブルも）。anon/user投稿テキストに `NOT VALID` 長さ上限。pgTAP `05_r155_security_test.sql` が本番条件（authenticatedへ blanket UPDATE）をCIで再現しトリガの昇格阻止を証明。
- **認証ライフサイクル**（`docs/SECURITY-ARCHITECTURE.md §11`）：`delete-account` Edge Function（真の削除）、パスキー(WebAuthn `experimental.passkey`)、パスワード再設定/変更・メール変更・全端末ログアウト、弱い/漏えいPW拒否（強度＋HIBP k-匿名）、列挙防止、トークンのGA流出防止。
- **admin.html隔離**：公開Sign Up撤去・厳格CSP（`connect-src` self＋`*.supabase.co`）・esc()強化＋`safeUrl()`・破壊操作前の再認証。回帰＝`tests/r155-checks.test.mjs`（実挙動XSS含む）。
- **手動作業（ダッシュボード）**：パスキーRP設定・leaked-password protection・Redirect URL・SMTP/CAPTCHA(任意) は `docs/SECURITY-ARCHITECTURE.md §9`。

## 18. 地域監視基盤 (Area Monitors) — R141 / R144

ログインユーザーが**監視地域**（円/描画/解決済み地域/現在の地図表示）を保存し、**サーバー側が定期実行**して**意味のある変化がある時だけ根拠付きレポート**を生成する機能。詳細は [`docs/AREA-MONITORS.md`](docs/AREA-MONITORS.md)。

> **R144 監査ハードニング**（migration `20260721120000_area_monitors_hardening.sql`）：本番の Supabase default-privilege（全ロール全権限＝RLSが実防御）で R141 の column-grant が no-op だった真因を **BEFORE UPDATE トリガ `tg_monitors_guard_state`**（run-state列・`next_run_at` を非runnerに対し凍結/server再計算）で根治。長期 `monitor_seen_items` レジャで **「過去N日」比較を実データ化**＋**cap耐性のnovelty**。**原子 `monitor_claim_one`**（手動二重実行防止）。**根拠付きレポート**（headline/summary/gapsをauthoritative diffからコード生成・AIは接地済claimのみ）。**全DB write error検査**＋原子 `monitor_finalize`/`monitor_commit_report`。**決定的**news順序。**`monitor_limit_self()`**（他人plan探索不可）。本番適用・deploy・E2E検証済（bad_refs 0）。

- **中核原則**＝**変化の有無はコードが判定、AIは説明のみ**。処理順＝取得→正規化/重複排除→スナップショット→機械的diff(new/gone/continuing・件数・クラスタ・媒体多様性)→change score→**変化があり閾値超の時だけAI**→**AIが引いたevidence IDを実行後にコードで検証**（偽ID主張は棄却）→run/evidence/report永続化。**取得失敗は「変化なし」ではなく専用status**。
- **DB**（migration `20260721090000` + `20260721120000` hardening）＝5表 `area_monitors`/`monitor_runs`/`monitor_evidence`/`monitor_reports`/**`monitor_seen_items`**(#R144 長期レジャ)。**RLS全表owner-only**、runs/evidence/reports/seenは**service_role書込・user読取専用**（実行結果偽造不可）。area_monitors UPDATEは**列単位grant**（run-state列・`next_run_at`除外）＋**#R144 `tg_monitors_guard_state` トリガ**で本番の全開grant下でも run-state/`next_run_at` を凍結（grant非依存の実防御）。UUID PK。`monitor_limit()`（plan別上限・**課金接続点**）を挿入トリガで強制・**#R144 EXECUTE revoke＋`monitor_limit_self()`**（他人plan探索不可）。`monitor_claim_due()`＝cron用`FOR UPDATE SKIP LOCKED`／**#R144 `monitor_claim_one()`**＝手動用原子claim（二重成功不可）／**`monitor_finalize`/`monitor_commit_report`**＝run+report+meta単一txn。pgTAP `04_monitors_test.sql`。
- **Edge Function** `monitor-run`（`--no-verify-jwt`・自前fail-closed）＝①cron（`x-monitor-secret`）で due monitors をclaim・逐次処理、②user「今すぐ実行」（JWT+monitorId・所有権照合）。純ロジックは `logic.mjs`（runtime非依存ESM）を Deno と Node テストで共有。status体系10種（success/success_no_change/partial/source_unavailable/ai_failed/timed_out/invalid_geometry/quota_exceeded/disabled/internal_error）。**AI失敗でもsnapshot/diff/evidenceは保持**。
- **定期実行**＝pg_cron（refresh-news 同型・`net.http_post` でヘッダに秘密・`docs/AREA-MONITORS.md` にSQL）。
- **UI/Atlas**（`index.html` 加算）＝**Monitorsタブ**（通常/モバイル/Workspace・5言語）、`window.IntMapMonitors`（一覧/作成ダイアログ/詳細/レポート＝結論・主な変化→evidence chip・数値比較・根拠一覧(出典リンク)・変化地点を地図表示・取得できなかったデータ・制約・日時/status）。Atlas `{"type":"monitor","op":…}`＝**返信は実DB結果のみ**（偽の成功報告なし）。全描画 `IntMapSafe`（XSS-inert 実証）。
- **コスト制御**＝変化なしはAI非呼出／新規のみAIへ送信（履歴dedup）／run毎cap（evidence60・AI入力40・110s wall-clock・55s AI timeout）／plan別monitor上限・最短間隔30分・手動クールダウン30s／保持（run 100・evidence 12run）。
