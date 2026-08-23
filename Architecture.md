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

- **本体は `index.html`（936行・84 KB）＋ `css/`（3本）＋ `js/`（223本・10.6 MB）＋ `src/`（10本）。**
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
- **配られるファイルは1つ残らず「誰が読むか」を持つ。** `npm run check:assets`
  （`scripts/asset-report.mjs`）が `dist/` の全ファイルを、**ソースが実際に含んでいる文字列**と
  突き合わせて分類する——`exact`（`js/` `src/` `css/` `*.html` `sw.js` が名指し）／`prefix`
  （名前が計算される。`'data/planets/'+id+'.jpg'` のような連結）／`build`（`scripts/` だけが名指し
  ＝生成器の入力）／`test`／`doc`／**`orphan`（リポジトリのどこにも綴りが無い）**。
  ⚠ **分類は宣言ではなく導出。** 「配るファイルの一覧」を手で持つと正本が2つになる。
  ⚠ **`data/` の小さな JSON も走査対象。** 最大級のラスタは JavaScript から名指しされていない——
  `js/precip-annual.js` は `data/precip-mm.json` の `mercator.file` を、`js/vs30-mask.js` は
  `data/vs30.json` の `phone.file` を読む。マニフェストは consumer である。
  ゲートが落ちるのは ① 誰も名指ししないファイル、② 同一 SHA-256 の payload が許可リストの外で
  2回配られている、③ ファイル単位の天井を超えていて理由が記録されていない——の3つ。
  許可リストは**名前ではなく理由**を持つ（Cesium SDK の実行時ツリー、繁体/簡体ページ用に
  ハッシュ無しでも要る KaTeX と Inter の写しなど）。ビルドが要るので `npm test` の中ではなく
  `check:perf` の隣で走る。
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
- **アダプタは自分に来た命令を数える。** `layers.setSourceData` / `setFilter` / `setPaint` /
  `setLayout` / `setFeatureState` の5つについて、**attempted（来た）/ sent（レンダラへ渡した）/
  same（レンダラが既に同じ値を持っていた）/ absent（対象が無い）** を集計する。既定は**数えない**
  （ブール1つ分）。`?cmdlog=1` または `?perf=1` で集計と id 別・フェーズ別の表が出て、
  `render.commands()` / `commandsReset()` / `commandConfig()` から読める。
  `node scripts/frame-profile.mjs --commands` が起動・pan・zoom・レイヤー欄・ホバー・Chronos・
  言語・テーマの各フェーズを実際に駆動して表を出す（**フェーズは宣言する**——setPaint の中から
  「なぜ呼ばれたか」は分からない）。
  ⚠ **省略してよいのは `setSourceData` だけで、それは MapLibre の実装がそう言っているから。**
  MapLibre の `Style.setPaintProperty` / `setLayoutProperty` / `setFilter` は**自分で deepEqual して
  同値を捨てる**ので、その手前にもう1つ比較を置いても**レンダラの仕事は1つも減らない**。
  `GeoJSONSource.setData` にはその比較が無く、毎回コレクション全体が worker へ渡って再パースされる。
  だから既定は `sourceData` だけ ON、他の4つは**数えるだけ**。
  ⚠ **省略の可否はレンダラが今持っている payload との deep-equal で決める**（`_sourceHolds`）。
  `s._data` を読むので**この facade は何も保持せず、陳腐化もしない**。2つの規則が安全を作っている——
  ① **同一オブジェクトは根拠にならない**（呼び出し側がその場で書き換えたかもしれない）ので必ず適用する、
  ② 比較には**作業量の上限**があり、上限内に等しいと**証明できなかった**ものは適用する。
  呼び出し側が「1つのオブジェクトを書き換えて使う」場合は `setSourceData(id, data, {revision})` で
  そう言える。
  ⚠⚠ **`opts` は第3引数であり、facade はそれを渡す。** かつて `layers.setSourceData` は引数を2つしか
  取っておらず、`{revision}` は**アプリのどこからも到達できなかった**（使われていなかったのではない）。
- **同じソースへの書き込みは、丸ごとでも「変化」でもよい。** `setSourceData(id, data, {diffable:true})` は
  「この積荷は地物ごとに同定できる」という宣言で、以後の `setSourceData(id, data, {diff:{add,remove}})` は
  **差分だけをレンダラへ渡す**（MapLibre は `GeoJSONSource.updateData` を持ち、差分が触れるタイルだけを
  貼り直す）。⚠ **`data` は常に真実**——差分を扱えないエンジン、`diffable` な丸ごと書きを受けていない
  ソース、id の衝突、例外のどれでも**丸ごと書き**に落ちるので、絵はどちらでも同じになる。
  ⚠ アダプタが実際にどちらを送ったかは census の `diffed` が数える（**計器が OFF でも読める**——
  「差分で送っているつもり」と「差分で送っている」は、他のどの数字でも区別がつかない）。
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
  - **能力の表は3つあり、突き合わされている**：`MAPLIBRE_CAPS`（`js/geo-engine.js`）・
    `CESIUM_CONTRACT.capabilities`（同）・`CESIUM_CAPS`（`js/cesium-engine.js`）。
    `tests/r323-checks.test.mjs` が3つを **AST から読んで**比べる——**3表は同じキー集合**を持ち、
    **Cesium の2表は値まで一致**し、**宣言だけの契約はアダプタが拒む能力を主張できない**
    （`solid3d` がその形：契約が true を返すと `js/volume3d.js` の `canSolid()` が
    フォールバックを失う）。⚠ ファイル全体への正規表現では、同じ綴りがどちらの表にあるのか
    区別できない——3表のうち2表は同じファイルに居る。

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

このファイルが答えるのは**それがどう組み上がっているか**のほうで、内訳は §2.1（制御カーネル）・
§4（ニュース）・§5（AI）・§6（Supabase）・§7（地図とレイヤーの契約）・§8（UI）・§9（モバイル）・
§10（多言語）と、[`docs/MAP-LAYERS.md`](docs/MAP-LAYERS.md)（レイヤー実装の詳細）・
[`docs/FILES.md`](docs/FILES.md)（ファイル台帳）にある。

### 2.1 制御カーネル (The control kernel)

**「何ができるか」の一覧は 1 つしかない。** `js/atlas-capabilities.js` の表がそれで、
UI のボタンも Atlas の自然文も、テストも監査も、**同じ能力 ID** を名指す。

| 部品 | ファイル | 何の正本か |
|---|---|---|
| Capability Registry | `js/atlas-capabilities.js` | **115 能力**。ID・別名（263 綴り）・分類・副作用（`writes`＝競合キー）・生成物・危険度・確認要否・**必要な対象**・遅延モジュール・観測器・検証器 |
| 能力の説明文 | `js/atlas-catalog-text.js` | planner に渡す 38 ブロック。**各ブロックがどの能力を説明しているか**を持つ |
| 実行 | `js/atlas-executor.js` | `IntMapOS.execute()` の 11 段 |
| 結果の形 | `js/atlas-results.js` | 全操作が返す 1 つの構造。7 つの status |
| 状態 | `js/atlas-state.js` | 15 セクションの合成スナップショットと**ターン台帳** |
| 計画 | `js/atlas-planner.js` | Plan schema・検証・GoalSpec・依存グラフ実行 |

**実行の 11 段**（`IntMapOS.execute(capabilityId, args, {source, turnId, signal})`）:
能力の解決 → 可用性 → 引数 schema → **必要な入力の解決** → 競合キーの取得 → 前の観測 →
実行 → **完了待ち（同期・Promise を問わず）** → 後の観測 → **事後条件の検証** → 構造化結果。
各段は `planned / validating / waiting-input / started / progress / completed / partial /
failed / cancelled / superseded` としてイベントバスに出る。

**status は 7 つあり、`ok` はその導出である**（`status === 'completed'`。読み取り専用の
getter なので、観測していない成功を呼び出し側が書き込むことはできない）。
`running`＝計算が続いている。`needs_input`＝必要な入力が無い。`partial`＝一部だけ。
`cancelled` / `superseded`＝呼び出し側が取り消した／新しい依頼が置き換えた。

**⚠ 対象が要る能力は、地図の中心を勝手に使わない。** 表の「必要な対象」列が
`required` の能力に対象が渡されなかった場合、`needs_input` と再開トークンを返す。

**⚠ 能力は、そのモジュールが読み込まれる前から発見できる。** 記述子は起動バンドルにあり、
`IntMapLazy.need()` は**実行の瞬間だけ**呼ばれる。

**⚠ planner に送るカタログは、依頼に関係する能力だけに絞られる。**
`selectCapabilities()` が**全能力を採点**して選ぶ（DOM 順でも先頭 N 件でもない）。
確信が低ければ広げ、信号が無ければ全部送る（全部＝57 kB、経路の依頼＝約 15 kB）。

**⚠ 汎用の 2 つの逃げ道も、能力が消える場所ではなくなった。**
`control` のカタログは**依頼に対して採点**して残し（DOM 順の先頭 N 件ではない）、**落とした数を明示する**——上限は残るが、それは予算であって穴ではない。近い候補が複数あれば押さずに `ambiguous_target` を返す。`module` のカタログは**まだ読み込まれていないモジュールも名前で出し**（`IntMapLazy.publishes()`）、`doModule` は必要なら取得してからその promise を返す。
⚠ **メソッドの許可リストは変わっていない**——広げたのは到達であって権限ではない。

**⚠ 旧 dispatch は互換アダプターとして残っている。** 115 の `case` はそのまま engine の
仕事をしており、変わったのは**その周りの 11 段**と、`ok` が観測の結果になったこと。

検査は `node scripts/atlas-capability-audit.mjs`（20 項目・`--json` で機械可読）。
`scripts/atlas-catalog.mjs`（「planner に説明されているか」だけを問う旧ゲート）は互換入口として残る。

### 2.2 回答の契約 (The answer contract)

**調査・分析の回答は文字列ではなく構造である。** `analyze` が返すのは AnswerEnvelope
——冒頭結論・節と段落・**主張 (claim)**・**証拠 (evidence)**・場所・監査結果——であり、
本文の各段落は自分が依拠する claim の ID を持ち、各 claim は自分を支える evidence の ID を持つ。

| 部品 | ファイル | 何の正本か |
|---|---|---|
| 証拠レジストリ | `js/atlas-evidence.js` | ソースが入ってよい唯一の入口。URL の正規化・拒否理由・重複統合・捏造ホスト検出 |
| 回答の schema と意味区分 | `js/atlas-answer-contract.js` | AnswerEnvelope の schema（ai-proxy と同一）・claim の意味区分・単位クラス |
| 監査 | `js/atlas-answer-audit.js` | 30 超の監査コード。構造から判定する（モデルの自己点検ではない） |
| 実行順 | `js/atlas-answer-pipeline.js` | 1 回の呼び出し → 監査 → 最大 1 回の修復 → 劣化 |
| 描画 | `js/atlas-answer-render.js` | 引用記号・出典カードをレジストリからのみ生成 |

**⚠ モデルは URL を書かない。** schema に URL を置く場所が無く、証拠は ID でしか参照できない。
画面のリンクは描画側がレジストリから組み立てる。本文に URL やホスト名が現れた回答は監査で落ちる。

**⚠ 「支えている」は 1 つの意味ではない。** claim は必ず `dimension` を持つ——
`level`（現在の規模）／`share`（構成比）／`growth_contribution`（成長への寄与ポイント）／
`structural_capacity`（長期的な供給能力）／`trend`／`causal_driver`。
比較は**同じ dimension の中でだけ**成立し、冒頭結論が意味区分を名指さない回答は落ちる。

**⚠ 数値は系列に属する。** 数値を含む claim は
`metric{seriesId, concept, value, unit, basis, geography, period}` を持ち、
文中の各数値は**引用した証拠が実際に持つ事実**と突き合わされる。
1 つの文の中で 2 つの異なる seriesId の数値が結ばれていれば、それは監査エラーである
（構成比と寄与度、名目と実質、付加価値の水準と生産の増加率——いずれも別の系列）。

**⚠ 「Web検証済み」は見出しではなく事実である。** hosted web search が**その呼び出しで実際に走り**、
provider の注釈が**その呼び出しの ID を持つ**証拠だけがその見出しに入る。
レジストリは 1 回の呼び出しに束縛されるので、同時に走る 2 つの回答が引用を取り違えることはない。

**⚠ 正常経路のモデル呼び出しは 1 回のままである。** 監査が落ちたときだけ、
**同じターンキーで** 1 回だけ修復を求める（利用回数は二重に消費しない）。
2 回目も落ちた回答は表示せず、**通った部分だけを組み直して**「裏付けを確認できなかった記述は
取り除いた」と明示する。

**⚠ 操作の失敗は、その操作が誰の目的だったかで重みが変わる。**
`goalImpact`（`js/atlas-planner.js`）が依頼のプロファイルから `primary` / `secondary` / `none` を導く。
利用者が地図を求めていない質問に Atlas が自分で足した地図移動が失敗しても、
回答の先頭に警告は出ない——回答の後ろに小さく「地図の表示は変わりませんでした」と出る。
利用者が地図を求めていれば同じ失敗が `primary` になり、ターンは `partial` になる。

---

---
## 3. ファイル構成 (Files)

**ファイル台帳の正本は [`docs/FILES.md`](docs/FILES.md)。** `js/` だけで 195 本あり、1行説明を
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

### 4.4 出来事 (Event) 単位の基盤

記事ではなく**出来事 (Event)** を主語にする経路。DB 側は 8 表（`news_sources` /
`news_source_feeds` / `news_articles` / `news_events` / `news_event_articles` /
`news_cluster_decisions` / `news_event_i18n` / `saved_news_events`）＋ 取り込みの計測
`news_ingest_runs` で、列・関係・RLS と grant の一覧は [`docs/DATABASE.md`](docs/DATABASE.md)、
実証は `supabase/tests/06_news_events_test.sql`（§16.1）。

収集は **Edge Function `news-ingest`**（§6.2）が cron で回す。段は 4 つ——
`fetch`（Source Registry のフィード取得・正規化・媒体の帰属・地点解析）／
`assign`（候補 Event を引いて増分で載せる。総当たりしない）／
`translate`（代表見出しを ja へ。`news_event_i18n` に永続キャッシュ）／
`prune`（記事 72 時間・Event 30 日・★保存は無期限）。判定の論理は
`supabase/functions/_shared/news-cluster.js` と `_shared/news-ingest.js` で、**どちらも
サーバー専用**（クライアントのバンドルに 1 バイトも入らない）。

**収集元 (Source Registry)・クラスタリング・カテゴリ・翻訳・保持期間・運用者の修正経路・
運用手順・品質と費用の実測の正本は [`docs/NEWS-EVENTS.md`](docs/NEWS-EVENTS.md)。**
ここには書き写さない。

⚠ **§4.1–§4.3 の経路と `current_news` は 1 バイトも変わっていない。** Event 側は加算であって
置き換えではない（`current_news` は article mode の fallback として生きている）。
⚠ **Event の表はまだ UI に出ていない**（`USE_SERVER_NEWS` は false のままで、そもそも UI は
この表を読まない）。表示への接続は Phase D。

---

### 4.5 Atlas `research.events` — ブラウザ側のアダプタ `js/news-cluster.js`

Atlas の `research.events`（「最近の出来事をまとめて」）は、読み込み済みの記事一覧ではなく
**出来事の一覧**を返す。1つの出来事＝同じ出来事を報じているとみられる複数の記事。

⚠⚠ **束ね方の実装はここには無い。** §4.4 と**同じ** `supabase/functions/_shared/news-cluster.js` を
`import` して `clusterArticles()` を呼ぶ。この節のファイルがやるのは**適合だけ**——
読み込み済みフィードの項目の形を入れ、返信に出す出来事オブジェクトの形で返す。
`js/atlas-console.js` の `case 'events'` は窓と範囲を選び、描いて書くだけ。

- ⚠ **写しを作っていない。** `js/newsgeo.js` が `supabase/functions/_shared/` へ**複製**されるのは、
  Deno の Edge Function が `supabase/functions/` の外を import できないからで、この制約は
  **一方向にしか効かない**。Vite のバンドルには同じ制約が無いので、ブラウザは共有ファイルを
  そのまま読む。**写しは古くなりうるが、1本しかないものは古くなりようがない。**
- ⚠ 正本は [`docs/NEWS-EVENTS.md`](docs/NEWS-EVENTS.md)（「第二のクラスタリング実装を残さない」）。
  §4.4 の経路が live になり `research.events` が `news_events` を読むようになったら、
  **このアダプタは消える**。消えるまでのあいだも、判定している式は §4.4 と同じ1本である。

このファイルが決めているのは次の2つだけ:

1. **記事がどの点にあるか。** `analysis.subjectLoc`（主題）を見る。ピンの表示位置
   （`analysis.loc`）は Publisher モードで媒体HQに書き換わる**表示上の選択**であって、
   出来事が何であるかを変えてはならない（変えていた頃は「CNN の全記事がアトランタで
   起きた1つの出来事」になりえた）。保存済み記事のスナップショットは `subjectLoc` を
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

## 5. AI APIの使い方と鍵管理 (AI usage & key policy)

- **Atlas の人格は正式仕様であり、正本は `js/atlas-persona.js` 1本だけ。**
  名前・立場・名前の由来・性格・対人姿勢（距離感と説明量は相手に合わせ、**敬語は常に自然な敬語**）・
  事実優先・意見の出し方・感情表現・自己設定の扱い・内部指示の非開示——これらは
  **そのファイルの中の文章そのものが仕様**で、この文書はここに書き写さない
  （**同じ事実を2か所に書くと片方だけが古くなる**——`npm run check:docs`）。
- **20 本すべての system prompt が `personaPrompt('<その呼び出しの役割>')` で始まり、
  各呼び出し側はタスク規則しか足さない**（`atlas-console` 9・`news-ui` 3・`analysis-research` 2・
  `app-body` 2・`atlas-geo-resolve` 2・`monitor-run` 1・`refresh-news` 1）。モードは 2 つ——
  出力が人の読む文章になる経路は全文、出力が機械可読な JSON だけの経路（地域の輪郭・
  行政単位の解決・ニュースの地点解析・記事翻訳・地名検証）は `{mode:'internal'}` で
  身元・事実規律・非開示だけを渡す。
  サーバー側の2本は Edge Function がリポジトリ外を import できないため
  `supabase/functions/_shared/atlas-persona.js` の**生成された写し**を読む
  （`node scripts/sync-atlas-persona.mjs`・`npm run check:static` が差分を落とす）。
- **会話前のプリセット送信文は「事実で選ばれる候補群」であって、差し込み式の定型文ではない**
  （`js/atlas-examples.js`）。各候補は**述語**を持ち、成り立つものだけが候補になる——判定に使うのは
  ① `countryStats` の中での**順位**（人口密度・GDP・面積・国防費比・HDI・寿命…。**閾値ではなく
  順位**なので、表が変われば主張も変わる）、② **利用者が今オンにしているレイヤー**、
  ③ **Chronos の位置**、④ **国自身の外接矩形**（`bbox`——赤道が中にあるか・北極圏が中にあるか・
  全体が回帰線の間か・陸1 km² あたりどれだけの海に散らばっているか。⚠ ±180 をまたぐ環は素の
  extent が 360° になるので、**経度に関する主張はその箱には出さない**）、⑤ **言語の数と通貨**、
  ⑥ **2つの事実の組**（豊かでかつ統治が強い／経済規模は大きくかつ1人あたりは低い、など。単独の
  順位では分けられない国を組が分ける）。選択は重み→鍵の順で**決定的**で、同じ事実なら同じ 4 つが
  同じ順で出る。
  ☠ **常に真の 6 文（首都・地域・最新・近隣比較・1990年以降・天気）は落穂拾いであって競争相手では
  ない**（`tail:1`）——資格のある特定的な候補を1つも押しのけない。押しのけられると、1つだけ特徴の
  ある国が「その特徴について1問と、何でもない話3問」を渡されることになる。
  ☠ **候補の文はすべて第1引数がリテラルの `L()`**——`scripts/i18n-report.mjs` はそれ以外を捨てるので、
  文を動的に組み立てると**9言語の穴が計器に見えなくなる**。変わるのは「どの候補が適格か」だけ。
  ☠ `{place}` は CLDR の国名（冠詞なし・主格）なので、ru / de / fr は**名前を先頭に置く同格**の形。
- **進行中の表示（Thinking / Searching / Analyzing / Mapping / Reading the image / Verifying）は
  ラベル自身を採くシマー**。`.atl-stage` が `background-clip:text` と透明な text-fill で
  グラデーションを文字の形に切り抜き、帯を 2 秒で掃く。帯の色は**背景寄り**なのでテーマごとに
  別の値（`--atl-shimmer-band`）。`prefers-reduced-motion` では止め、**text-fill を currentColor に戻す**
  （透明のまま止めると文字が消える）。`.atl-stage` は**印でもあり**、「まだ作業中の泡」を探す
  取り消し走査もこの綴りを見る——**進行表示はアプリ全体で 1 種類だけ**。
- **鍵はサーバー（Edge Function）だけが持つ。** ブラウザは AI プロバイダに直接アクセスしない。
  モデル選択の UI も無い（利用者はモデルを選ばない）。
- **`ai-proxy`＝アカウント制AI。** `verify_jwt` に加えて関数内でもユーザーを検証し（未ログインは 401）、
  プラン別の1日上限を `consume_ai_turn` で**原子的に消費**する。
  上限は free 10 / plus 50 / pro 200 / unlimited 実質無制限。
- **⚠ 消費の単位は「1リクエスト」ではなく「1 user turn」。** Atlas は 1 つの依頼を planner ＋
  最大 2 回の修復（画像なら読み取り＋自己検算の再読）で終える。以前はその全部が別々に 1 回ずつ
  消費していたので、**1 つの質問が最大 3 回**を無言で使うことがあった。クライアントは
  `x-intmap-turn` ヘッダにターン鍵を載せ、**その鍵の最初の 1 本だけが消費する**。
  ⚠ **鍵は信用されない**——行の主キーが `(user_id, turn_key)` なのでアカウントを跨げず、
  1 つの鍵が運べる回数（`TURN_MAX_CALLS`）と鍵の寿命（`TURN_TTL_S`）は Edge Function 側の
  定数で、呼び出し側から上げられない。上限超過は 429 `{error:"turn_calls"}` で、
  1日上限の 429 `{error:"limit"}` とは**別の文言**を出す。
  プロバイダ失敗の払い戻しは `refund_ai_turn` が**charge とターンの両方**を解放する。
  ⚠ **決定論的な操作（`IntMapOS.execute()` だけで終わる依頼）は AI 枠を一切使わない。**
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
実証手順も同じファイル）。現在 **30 表**（`profiles` / `current_news` / `geo_pins` / `favorites` /
`user_prefs` / `dashboard_cards` / `ai_usage` / `ai_turns` / `community_*` 5 表 / `feedback` /
`bug_reports` / `donations` / Area Monitors の 5 表 / News Events の 8 表
＝`news_sources` / `news_source_feeds` / `news_articles` / `news_events` /
`news_event_articles` / `news_cluster_decisions` / `news_event_i18n` / `saved_news_events`
＋取り込みの計測 `news_ingest_runs`）。

**DB の設計図は `supabase/migrations/` だけ**（全テーブル・制約・index・RLS・grants・トリガ・RPC）。
本番へ手で SQL を流さない。手順は [`docs/MIGRATIONS.md`](docs/MIGRATIONS.md)。
### 6.2 Edge Functions — **12本**（`_shared/` は関数ではない）

> ⚠ **12本すべてを `supabase/config.toml` に `[functions.*]` として宣言する。**
> ファイルのヘッダコメントに書いた deploy フラグは設定ではない。
> `supabase/functions/_shared/` は `newsgeo.js`・`relay-guard.js`・`volcano-parse.js` などを置く
> ライブラリ用ディレクトリで、import した関数の中に CLI がバンドルする。
> `[functions._shared]` は書かない。

- **`ai-proxy`** … アカウント制AI（§5）。`verify_jwt` あり。
- **`refresh-news`** … ニュース取得＋AI地点解析＋書き込み（§4.1）。`--no-verify-jwt` で公開だが
  **fail-closed**：`REFRESH_SECRET` 未設定なら全リクエストを拒否する。秘密は `x-refresh-secret`
  **ヘッダのみ**（クエリ文字列不可）・**定数時間比較**・POST のみ。
- **`news-ingest`** … 出来事 (Event) 側の収集（§4.4）。Source Registry の全フィードを取得し、
  正規化・媒体の帰属・地点解析・Event への増分割り当て・日本語訳・計測・保持を行う。
  `--no-verify-jwt` で公開だが **fail-closed**：`NEWS_INGEST_SECRET` 未設定なら全リクエストを拒否する。
  秘密は `x-news-ingest-secret` **ヘッダのみ**・**定数時間比較**・POST のみ。
  ⚠ `current_news` と `refresh-news` には触れない（別の表に書く）。
- **`monitor-run`** … Area Monitors の定期実行（`--no-verify-jwt` ＋ 自前の fail-closed 認証、
  `MONITOR_SECRET`）。
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
  ⚠ **per-IP のレート制限を自前で持つ唯一の relay**。Mapbox は支出のハードキャップを持たないので、
  ここが唯一の天井になる（プロセス内メモリのトークンバケツ＝best-effort）。
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
- **`aviation-feed`** … ライブ航空機の**唯一の上流読み取り役**（`--no-verify-jwt`・秘密なし）。
  provider（既定 adsb.lol・ODbL 1.0。`AVIATION_PROVIDER` で切替。OpenSky は事前の書面合意が要るので
  `OPENSKY_AGREEMENT=1` のときだけ）を**サーバー側で TTL ごとに1回だけ**読み、全利用者へ同じ
  IMAV/1 バイナリを配る。⚠ **上流の負荷が利用者数に比例する構造をやめるための関数である**——
  以前はブラウザが1掃引あたり最大 128 本の点問い合わせを自分で出していた。
  呼び出し側が選べるのは**チャンネル（`world` / `view` / `meta`）だけ**で、URL は渡せない
  （相手先 URL を allowlist で見る4本の中継とはそこが違う）。正規化と wire format の正本は
  `js/aviation-model.js` / `js/aviation-codec.js` で、`_shared/` の写しとの一致は `npm run check:static`
  が検査する。冷えた isolate でも即答できるよう、共有スナップショットは Storage の `aviation` bucket に置く。

- **`volcano-feed`** … 火山の**ブラウザが読めない2本のフィード**の中継（`--no-verify-jwt`・秘密なし）。
  `?feed=weekly` は Smithsonian/USGS 週間火山活動報告（`volcano.si.edu` の RSS）、
  `?feed=ash` は国際 SIGMET（`aviationweather.gov`）のうち**火山灰（`hazard:"VA"`）だけ**。
  ⚠ **上流の解析はサーバー側で行う**——ブラウザが受け取るのは **GVP 火山番号で引ける行**であって
  XML ではない（RSS の `<guid>` が `#vn_282110` の形で番号を持つ。名前で突き合わせない）。
  解析の正本は `_shared/volcano-parse.js` で、`tests/r346-checks.test.mjs` が**捕獲した実応答**で検査する。
  ⚠ **火山灰が0件は正常な答えであって失敗ではない**——応答の `read`（読んだ SIGMET の総数）が
  「何も出ていない」と「読めなかった」を分ける。キャッシュは灰 15 秒・週報 1 時間。
  ⚠ **残り4本の火山データ源（USGS HANS・気象庁・USGS ハザード域 ArcGIS・USGS 地震）は
  ACAO を返すので中継しない**（要らない relay は落ちうるものを1つ増やすだけ）。
  詳細は [`docs/VOLCANO-INTELLIGENCE.md`](docs/VOLCANO-INTELLIGENCE.md)。

⚠ **5本の無認証中継（`alerts-relay` / `cable-geo` / `news-relay` / `sv-cov` / `volcano-feed`）は
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

⚠ **火山は主題ごとの正本を別に持つ**——同梱データと GVP 番号による結合、現在の警戒レベルの4段
（USGS／気象庁／週間報告／沈黙）、火山灰 SIGMET、公表されたハザード域だけを描く規則、SO₂、
周辺人口・空港・地震は [`docs/VOLCANO-INTELLIGENCE.md`](docs/VOLCANO-INTELLIGENCE.md) が正本。
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
- **レイヤーを切り替えてもカメラは動かない。例外は `js/layer-home.js` の表だけ**。
  `window.IntMapLayerHome.arrive(<checkbox id>)` が、**データが1つの地域にしか存在しないレイヤー**
  （EU members / NATO members / U.S. presidential elections / Ukraine frontline）を
  **セッション中1回だけ**果に収める。
  ☠ **各レイヤーのファイルに `fitBounds` を書かない**——表が1つだから「1回だけ」も「利用者が
  操作したか」も 1 つの定義で済む。セッション復元は `js/session-tabs.js` がチェックボックスに
  `__imRestored` を付け、`arrive` がそれを**使い切って飛ばない**（復元は利用者の操作ではない）。
  果の場所は**可能な限り測る**——EU は `window.IntMapEuFC()`、NATO は `window.IntMapNatoFC()`、
  ウクライナは `window.IntMapUkrFrontFC()`。
  ☠ EU と NATO は**各加盟国の最大の陸塊だけ**を囲み、しかも**国コードごと**に取る。域外領土を
  含めた外接矩形はグアドループからレユニオンまで伸びて画面のほとんどが海になり、フィーチャごとに
  最大を取るとアリューシャン列島（±180 の向こう側で `USA`）が NATO の枠を東太平洋へ引く。
  ☠ NATO の枠は**そのまま条約適用地域**になる——`buildNatoFC()` は北回帰線より南の多角形を落として
  から塗る（Article 6）ので、枠は測った結果として北大西洋になり、Chronos の加盟年にも従う。

### 7.4 Chronos（統一時間）と「年」

- **時刻はマスタークロック `window.IntMapTime` 1本**。⚠ **2つ目の時計を作らない。**
- **下限は 1850 年**（`IntMapTime.min`）。⚠ **この数を書き写さない**——スライダーの `min`・入力の
  ガード・目盛りの先頭は全部 `IntMapTime.min` を実行時に読む（`js/news-timeline.js`）。
  下限より下に何があるかは**各出典が決める**のであって、時計は最短のものに揃えない:
  年次国境は CShapes 2.0 が 1886–2019、それ以前はスナップショット（historical-basemaps の
  **1815 と 1880 の2枚だけ**——上流にその間は無い）／GDP・人口はマディソン・プロジェクトで 1820 年から／
  ケッペン気候区は最古のラスタが 1901-1930 なので、それより前はその期間を出し、凡例が期間名を出す。
- ⚠ **スナップショットへの丸めは、CShapes の下では MAXGAP を適用しない**（`js/time-borders.js`）。
  あの上限は「年次の出典があるのに代替が未来の世界を描く」ことを止めるためのもので、1886 年より下では
  代替ではなく**唯一の出典**だから、近いほうを採るのが最善の答えになる。
- **風の場は「画面の緯度帯 → 全体」の2段で読む。** ECMWF IFS は縮約ガウス格子なので読み取りは緯度でしか
  絞れず、`bandFor` は視野が緯度 120° を超えると `null`（＝地球全部）を返す。起動時の視野は地球なので、
  粒子が動き出す前に **13,199,360 標本・約 18 MB** を読んでいた（実測、初回描画まで 14.5 秒、日本上空へ
  寄せた状態で 74.9 秒）。全球読みは**帯域律速**で、レンジを並列化する暖機（`prefetchVariable`）は縮められる小さな
  レンジが無いので効かない（実測 A/B: 素 16.4/7.8 秒 対 暖機 7.8/9.4 秒）。
  → 最初は `bandNear`（画面中心の±30°まで・地点読み出しが使う帯）を読み、**その裏で視野全体の帯を
  読んで差し替える**。最終的な絵・標本間隔・ファイルは同じ。粒子は読めている帯の中にだけ撒く。
- **`.om` のリーダーは<b>ファイルごとに 1 つ</b>。** `ensureData(state, reader, …)` はリーダーを引数で
  受け取るので、SDK が公開する `WeatherMapLayerFileReader` をファイル別に持つ（`readerFor` の LRU）。
  ブロックキャッシュは 1 つを共有してよい——SDK の鍵は `hash(url) ^ hash(eTag) ^ hash(lastModified)`
  にブロック番号を足したものなので、別ファイルはぶつからず、同じファイルの 2 本は取ったブロックを
  共有する。**開き直し（HEAD ＋ 末尾の読み出し ＋ 変数ツリーの走査）は 1 ファイルにつき 1 回**で、
  `setToOmFile` は `pinReader` により冪等。**開くのは `setIndex` の中**——読み込みが要求されるより前。
  **色タイルもこの同じプールを使う**（`tileReader` が SDK インスタンスの `omFileReader` を
  プールへの委譲に差し替える）。⚠ プールの外に置くと、粒子側が既に開いたファイルを色タイルが
  もう一度開く——実測、1 ステップにつき **629 ms がタイルの読み込みの前に**費やされていた。
- **次の時刻のファイルは、読むより先に<b>開いておく</b>**（`openAhead`）。開くのはバイトではなく
  **HEAD ＋ 末尾 64 kB 1 本**で、**進行方向の 1 ファイルだけ**。⚠ **バイトの先読み（`readAhead`）は
  今も「軸が動いてから」のまま**——推測でメガバイトは払わない。開く費用は 1 時刻あたり 64 kB
  （その 1 時刻自身の 8.6 MB に対して 0.7%）で、実測、ステップの `setToOmFile` が **389 ms → 0 ms**。
- ⚠⚠⚠ **色面のタイルは、画面に出ている範囲だけを読む。** SDK はタイルの読み取り範囲を
  `currentBounds` という 1 つのモジュール変数から作り、これが未設定だと `getRanges` が
  **格子ぜんぶ**を返す。実測（日本上空 z6・1 ステップ）: 粒子の帯 **535,608 標本**に対し
  **色タイルは 6,599,680 標本＝惑星ぜんぶ**、1 ステップ **9.76 MB・31 要求**。
  → プロトコルのハンドラが毎回 `updateCurrentBounds(視野)` を渡す（`applyTileBounds`）。
  実測、同じ 1 ステップが **1,205,092 標本・2.82 MB・11 要求**になる。絵は同一——同じファイル・
  同じ 9 km 間隔・同じ配色・同じタイルで、**読まなくなるのはどのタイルも描かない部分だけ**。
  ⚠ **箱は「視野 ∪ いま要求されているタイル」**である。`getBounds()` は*見えている*範囲、
  MapLibre が*取りに行く*のは視錐台なので、傾けた視点ではタイルが箱の外に出る——外に出たタイルは
  遅い絵ではなく**欠けた絵**になる。
  ⚠⚠ **視野が実質「全球」のときは箱を言わない**（`WORLD_RATIO`・格子点の割合で判定する。
  縮約ガウス格子なので**度ではなく標本数**で数える）。起動時の視野は地球で、そこでは
  **粒子側の全球読みが色タイルの状態をそのまま使っている**（鍵が SDK の `fileAndVariableKey` と
  同一だから）——箱を言うとこの共有が切れて、**同じ 6,599,680 標本を 2 回復号する**ことになる。
- **ラスタの 1 タイルは 1024 px で、その数字は 1 つしかない**（`IntMapECMWF.TILE_PX`）。
  URL 側の `tile_size` と MapLibre のソースの `tileSize` は**同じ値でなければならない**——
  食い違うと地図が半分／倍の解像度で描かれる。1024 にすると MapLibre は 1 段低いズームの
  タイルを使うので、**画素密度は同じまま枚数が 4 分の 1**になる（実測、起動時の視野で 12 枚 → 3〜4 枚）。
  ⚠ SDK は色付けをワーカーで行うが、**復号済みの場を転送リストなしで `postMessage` する**ので
  **1 枚につき約 53 MB の構造化複製**が主スレッドで起きる（実測、12 枚の送出で **1,276 ms の
  単一ロングタスク**）。**費用は画素数ではなく枚数で決まる。**
  ⚠ **狭い画面では大きいタイルが画面からはみ出す**——その代価は測って承知の上で払っている。実測
  （390×844・z6・1 ステップ）: 色面 **2,944 → 1,132 ms**、タイル **3 → 2 枚**、ただしラスタ化される
  画素は **0.79 → 2.1 Mpx**（画面は 0.33 Mpx なので 2.4 倍 → 6.4 倍）。速いのは主費用が枚数側だから。
  はみ出した画素はワーカーの仕事と GPU のテクスチャであって、主スレッドの時間ではない。
  ⚠ **ベクタのタイル（等圧線・矢印）には渡さない**——そちらの `tile_size` は MVT の extent であって
  画素数ではない（`omUrl` と `omRasterUrl` が分かれているのはこのため）。
- **読み込みの列は帯域の割り当てであって、正しさのための直列化ではない。** レーンは 2 本
  （`serial(fn, bg)`・`qHi` / `qLo`）で、**読み手が待っている読み込みは背景の読み込みが走っていても
  即座に始まり**、背景の読み込み（視野へ広げる段・次の時刻の読み込み）は**読み手が何も待っていない
  ときにだけ**始まる。どちらのレーンも自分どうしは 1 度に 1 本——2 本走らせれば読み手の取り分が半分に
  なる。⚠ 背景の読み込みは小さく保つ: 次の時刻は「そのステップが実際に読む帯」（`nearBand()`）を
  **進行方向について**読み、地球そのものになる段は読み手が **2.5 秒**静止してからでないと始めない。
- **ブロックの単位（64 kB）と、ネットワークに頼む単位は別。** レンジ要求には大きさと無関係な固定費が
  あり、同じ 8 MB でも 64 kB × 128 本は **3.3 MB/s**、512 kB × 16 本は **11.1 MB/s**、1 本なら
  **17.6 MB/s**（実測・同一ホスト・同一ファイル）。`coalesceBackend` が、同じマイクロタスクで来た
  ブロック要求のうち**ファイル上で隣接するものを 1 本にまとめて**発行し、返答を各ブロックへ切り分ける。
  **取りすぎは無い**（まとめるのは頼まれたブロックだけ）。⚠ **ブロックそのものは大きくしない**
  ——`blockSize()` はキャッシュの粒度でもあり、上げると帯の両端で取りすぎ、同じ読み手を共有する
  ラスタタイルも道連れになる。
- **次の予報時刻はバイトではなく<b>フレーム</b>で先取りする**（`readAhead`）。軸が動いたときだけ・
  進行方向の隣・そのステップが実際に読む帯で、**粒子の場が手に入った直後**に背景レーンで読み、
  復号したまま保持する。走っている最中に読み手がその時刻へ来たら**合流する**（二重に読まない）。
  ⚠ **色面の到着は待たない。** ステップの2つの半分は費用が桁違いで（実測、帯の読み込み
  **513〜537 ms** に対し色タイル1枚 **1,266〜1,772 ms**）、遅いほうを合図にすると先読みは
  **約2.1〜2.6 秒後**に始まる＝1.2 秒ごとに送る読み手には一度も間に合わない。
- **その次の時刻（2時刻先）は「推測」なので扱いが違う。** 読み手が**同じ向きへ 2 回以上**続けて
  送ったときにだけ・前景が空いているときにだけ（`foregroundBusy`）・そして**色面が表に出てから**
  読む。確定している隣の時刻とは合図が別である。
  詳細と実測値は [`docs/MAP-LAYERS.md`](docs/MAP-LAYERS.md) §7.10。
- **点灯より前にできることは、点灯より前にやる**（`IntMapECMWF.warm()`）。冷たい点灯で最初の
  データ 1 バイトが要求されるまでに **1.36 秒**かかり、その中身は 340 kB の SDK・**wasm の初回
  インスタンス化（344〜556 ms）**・軸が既に指しているファイルの open（HEAD ＋ 末尾 64 kB）で、
  **どれもクリックに依存しない**。気象レイヤーの行に**ポインタが乗った／フォーカスが入った**時点で
  これだけを先に済ませる（帯も復号も 12 ファイルの stage-in もしない＝画像のバイトは点けた人だけが払う）。
- **時刻を変えても地図は空にならない。** 色面は2つのスロットを交互に使い、**新しいスロットは「タイルが
  1枚でも届いた」ときにだけ**表に出す（`e.tile && e.isSourceLoaded`）。`isSourceLoaded` は「まだ1枚も
  頼まれていないソース」でも真になるため、これを条件にすると**空のスロットを表に出して古い方を消す**。
- **風の色の凡例は 0–30 m/s まで。** 配色表そのものは Windy の `RGBA()` に合わせた 27 停留点のまま
  のままで、104 m/s まで塗る。凡例が読む範囲だけを 30 m/s で切り、**上端の目盛りに `+`** を付けて
  「この先も続く」と言う（`IntMapECMWF.legend().capped`）。
- **風の筋（パーティクル）は2つの独立した問いで、2つの独立した既定値を持つ。**
  ⑴ 風レイヤー自身の凡例の「パーティクル」＝**このレイヤーはアニメーションするか**（既定 ON）。
  ⑵ 気温レイヤーの凡例の「風のパーティクル」＝**気温の場の上に風を描くか**（既定 OFF）。
  ②は風レイヤーを点けずに筋だけを出すので、`window.Wind` の中では `live() = on || soloOn` が
  「場が要る」を、`streaksWanted()` が「筋を描く」を意味する。**地図の上の2つの色ラスタスロットは
  `on` のまま**——気温の上に風を頼んだ読み手は、風の色を上に乗せてくれとは頼んでいない。
  ☠ **既定が OFF なのは、筋が u と v の2変数を読むから**。気温ラスタだけを出している読み手が
  これまで一度も払っていない読み込みで、箱に触らない読み手にとっては何も変わらない。
  ☠ 2つのモジュールの間を渡るのは**実効値1つ**（箱 AND そのレイヤーが on）で、押し出す場所は
  `syncLegend()`＝レイヤーの on/off が変わる経路がすべて通る 1 か所。扉は
  `window._imWxTempParts` 1本で、凡例の箱・Atlas の `{"type":"windParticles","over":"temperature"}`・
  返信のインライントグルが同じ関数を通る。
  ☠ 何も場を欲しがらなくなったときにだけ解体する（`_quiesce()`）。`dispose` も同じで、
  筋がまだ描かれている間は GL オブジェクトを返さない。
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
- **Time タブは時刻と日付を 2 行で出す。** `#ntl-bigval` は **`HH:MM` だけ**で、日付はその下の
  `#ntl-bigdate`。☠ **1 行にまとめない**——`.ntl-bigval` は 26px で `text-overflow:ellipsis`、
  箱は 314px から縮まない「現在へ戻る」ボタンを引いた幅なので、**崩れずに黙って切れる**。
  日付の書式は Date タブと**同じ `_dateText()`**——選ばれたゾーンで日を確定してから整形するので、
  2 つのタブが 1 つの瞬間に別の日を名乗ることはない。Year / Date タブではこの行は空（`:empty`）。
- **Time タブのスライダーには目盛りがある**（`#ntl-ticks`・`buildTicks`）。1 時間ごとに 1 本、
  6 本ごとにラベル（`00:00 / 06:00 / 12:00 / 18:00 / 24:00`）。位置は `(v − min) / (max − min)` で
  **値から計算する**——flexbox で等間隔に置くことは、位置を計算することではない。軸の終わりは
  `_timeMaxMins()` に訊く（範囲を述べる場所は 1 つ）。
  ☠ **目盛りはスライダーの直下に置く**。`.ntl-scale` は `.ntl-player`（このタブに出るモデルの輸送
  ボタン）の向こう側にあり、軸から切り離された目盛りは目盛りではない。Time タブでは `.ntl-scale`
  を隠し、Year / Date タブはこれまでどおりそのラベル行を使う。
  ☠ **レールは親指の半分ぶん内側**（`--tk-half`）。range input の親指の中心は 9px から width−9px
  までしか動かないので、素のパーセントで置いた印は端で最大 9px ぶん、名乗っている値からずれる。
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
  プロジェクト（`data/maddison.json`・**1850–2018**、`scripts/build-maddison.mjs`）。歴史的国家のクリックは
  **当時の名称・当時の記事**に解決する（現代のページへは決して飛ばさない）。時代→記事の表は
  **各政体の実際の開始年**で始まる——「窓の下限」を開始年として書かない。
- **両大戦の日ごとの勢力**（`js/war-fronts.js`・レイヤー行 `dl-wars`・既定 OFF）。ON の間だけ Chronos に
  従い、その日の**支配（面）・戦線（線）・進行中の作戦（点）**を描く。面は保存していない——
  **戦線の線で国の輪郭を切って導く**（`js/war-geom.js`）ので、線と面が食い違いようがない。
  記録は `scripts/wars/`、ビルドと検証は `scripts/build-wars.mjs` → `data/wars.json`。
  ⚠ **位置の記録がある日付にだけ線を引き、次の日付まで保持する**（凡例がその線の日付を出す）。
  滑らかに見せるための補間はしない。
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

- **地図上部の Measure ▾ / Share ▾ は同時に開かない。** 両方のトリガが `e.stopPropagation()` を
  呼ぶので相手の click-away に届かない——`window._closeMapMenus(except)`（`js/app-body.js`）が
  **集合を知る唯一の場所**で、各トリガは自分の名を渡してそれを呼ぶ。Layers は別機構
  （`window.IntMapLayerSidebar`・セッションに永続化）なのでこの排他には入らない。

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

### 8.1.1 企業アトラス (Company atlas)

企業をクリックすると、その企業のプロフィールと**世界の実在拠点**が開く。3 ファイル、すべて**遅延**:

| ファイル | 役割 |
|---|---|
| `js/company-data.js` | `data/companies/` の唯一の読み口。索引を **1 回**、プロフィールを**開いた企業のぶんだけ**取る。⚠ **施設種別30語・グループ6語・presence kind・状態・グループ色の正本**——パネルと地図レイヤーは両方ここを読む（別々に持っていた時点で綴りが割れていた） |
| `js/company-panel.js` | `.country-popup` を継承した詳細パネル（携帯では bottom sheet）。概要・財務・事業・拠点・進出国・組織・出典 |
| `js/company-facilities.js` | 拠点の地図表示。source 1 本・レイヤー 4 枚（`co-fac-src` / `co-fac-cluster` / `co-fac-count` / `co-fac-pt` / `co-fac-lbl`）、**このリポジトリで唯一クラスタリングを使うレイヤー** |

入口は 2 つ: 既存の企業詳細カードの「プロフィールと拠点」ボタン（`js/companies-ui.js`）と、
IntMapOS の `company.open`（`js/session-tabs.js`。id・ticker・企業名のどれでも解決する）。

⚠ **カメラを動かすのは利用者が企業を選んだときと施設に寄ったときだけ**で、レイヤーの ON/OFF では
1px も動かない（`CONSTITUTION.md` §3）。枠に収めるときは**開いているパネルの実寸**を避け、
経度は最短の弧で囲む（min/max で囲むと太平洋をまたぐ企業が地球を 2 周する）。

⚠ **既存の `js/companies.js`（curated 190 行 ＋ Yahoo のライブ時価総額）は変えていない。**
企業アトラスはその上に載る。データモデル・出典・パイプライン・カバレッジ判定の正本は
[`docs/COMPANIES.md`](docs/COMPANIES.md)。

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
| `js/routing-errors.js` | 失敗の分類 `window.IntMapRouteErrors`。15 コード。各コードは**文ではなく判断**を運ぶ（再試行してよいか・別 provider に投げてよいか・利用者が直せるか）。文は別に 9 言語で引く |
| `js/routing-time.js` | **どちらの「今」か** `window.IntMapRouteClock`。`planningNow()`＝Chronos（読者が見ている時刻・depart at / arrive by / 沿道天候）、`navNow()`＝壁時計（案内中）。**時計を増やしていない。既にある2つに名前を付けただけ** |
| `js/routing-traffic.js` | 交通情報つき provider のアダプタ `window.IntMapRouteTraffic`。`routing-relay` 経由でのみ通信し、**結果を一切保存しない**（provider の規約） |

**能力レジストリ (§3)** — `js/routing-providers.js` は 40 キーの語彙を宣言し、**どの provider も
全キーに答えなければ登録できない**（`assertComplete` が throw する）。キーが無いことは `false` と
読まれてしまうが、意味は「誰も訊いていない」なので、その2つを区別しないための仕組み。
UI・Atlas・要求組み立ての3つが**同じ表**を読むので、「押しても何も起きないボタン」が構造上作れない。
⚠ 語彙に入るのは**事実**だけ（yes/no か数）。**計算するもの**（どの provider がこの要求に答えるか、
それを選ぶと何を失うか）は関数のままで、語彙には入れない。
⚠ 各 provider は `evidence` を持つ——`'measured'`（実サーバに訊いた）か `'documented'`（提供元の
文書を読んだだけ）。`documented` の provider は `available()` が relay の答えを得るまで false なので、
**文書の力だけで利用者に何かを提示することは無い**。
| `js/routing-errors.js` | 失敗の分類 `window.IntMapRouteErrors`。15 コード。各コードは**文ではなく判断**を運ぶ（再試行してよいか・別 provider に投げてよいか・利用者が直せるか）。文は別に 9 言語で引く |
| `js/routing-time.js` | **どちらの「今」か** `window.IntMapRouteClock`。`planningNow()`＝Chronos（読者が見ている時刻・depart at / arrive by / 沿道天候）、`navNow()`＝壁時計（案内中）。**時計を増やしていない。既にある2つに名前を付けただけ** |
| `js/routing-traffic.js` | 交通情報つき provider のアダプタ `window.IntMapRouteTraffic`。`routing-relay` 経由でのみ通信し、**結果を一切保存しない**（provider の規約） |

**能力レジストリ (§3)** — `js/routing-providers.js` は 40 キーの語彙を宣言し、**どの provider も
全キーに答えなければ登録できない**（`assertComplete` が throw する）。キーが無いことは `false` と
読まれてしまうが、意味は「誰も訊いていない」なので、その2つを区別しないための仕組み。
UI・Atlas・要求組み立ての3つが**同じ表**を読むので、「押しても何も起きないボタン」が構造上作れない。
⚠ 語彙に入るのは**事実**だけ（yes/no か数）。**計算するもの**（どの provider がこの要求に答えるか、
それを選ぶと何を失うか）は関数のままで、語彙には入れない。
⚠ 各 provider は `evidence` を持つ——`'measured'`（実サーバに訊いた）か `'documented'`（提供元の
文書を読んだだけ）。`documented` の provider は `available()` が relay の答えを得るまで false なので、
**文書の力だけで利用者に何かを提示することは無い**。

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

### 8.4b 案内 (Active Navigation)

経路を**引く**のが §8.4、引いた経路に沿って**連れて行く**のがこちら。計画の状態
（`IntMapRouteStore`）とは**別の store** を持つ——計画の状態は読者が入力したときに変わり、
案内の状態は誰も触らなくても毎秒変わるので、混ぜると経路パネルの購読者全員が走行中ずっと
1 Hz で再描画される。

**8 ファイルすべてが1つの async chunk**（`IntMapLazy.need('navigation')`）。一度も案内しない
セッションは 1 バイトも払わない。

| ファイル | 役割 | 純粋か |
|---|---|---|
| `js/navigation-store.js` | `window.IntMapNavStore`。10 状態の状態機械（`idle / acquiring_location / ready / enroute / offroute / rerouting / arriving / arrived / paused / error`）と**遷移表**。表に無い遷移は throw する。`rerouteGeneration` が古い再探索の返事を捨てる | ○ |
| `js/navigation-match.js` | `window.IntMapNavMatch`。GPS の受け入れ判定（古い・飛躍・順序違い）と平滑化（速度・**円形**の方位）、経路への射影（**頂点ではなく線分**へ。前回位置の窓＋一様格子で、毎 tick に全 polyline を歩かない） | ○ |
| `js/navigation-guidance.js` | `window.IntMapNavGuide`。残り距離・**手順の所要時間から積む**残り時間・次と次の次の操作・レーン・逸脱の投票・到着の投票・音声の段 | ○ |
| `js/navigation.js` | `window.IntMapNavigation`。ループだけ。`watchPosition` → 上の3つ → 地図。**再探索は `js/routing.js` の同じ扉を通る** | × |
| `js/navigation-camera.js` | 追従（進行方向を上・現在地を画面の下寄り）／北上／全体／手動パンで一時解除 | × |
| `js/navigation-voice.js` | 9 言語の音声。`off` / `alerts` / `guidance` | × |
| `js/navigation-sim.js` | 決定的な位置シミュレータ（`Math.random` を使わない）。逸脱・飛躍・精度劣化・停止・到着を注入できる | ほぼ○ |
| `js/navigation-ui.js` | 案内カード（上）と ETA バー（下）。`.nvg-*`。**案内中は経路パネルを隠す**（`body.nvg-on`） | × |

**不変条件**

- **位置が端末を出るのは経路を要求するときだけ。** 照合・進捗・案内・到着はすべて手元で計算する。
  `_sent()` が回数を数えており、検査がその数を見る。
- **案内は `IntMapTime`（歴史時計）を1回も読まない。** 地図を 1950 年にした読者も今日帰宅する。
- **交通情報を持たない所要時間に「渋滞考慮」と書かない。** 能力表が false のとき、UI は
  「交通状況未反映」と明示する。
- **provider が出さなかったレーンを推定しない。** `lanes` が null なら何も描かない。
- **地図には `IntMapGeoEngine` を通してのみ触る**（MapLibre / Cesium の両方で成立する）。

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
されるので、`suspend(name)` はその機能の毎フレーム仕事を一括で外し、`dispose(name)` は
**camera / frame / timer / idle の4つの登録簿すべてから**その capability の仕事を消す。

状態は `defined` → `loading` → `loaded` / `failed` → `active`、そして `disposed`。
⚠ **`disposed` は「もう開けない」ではない。** 定義は登録簿に残り、消えるのは `load` のメモだけなので、
次の `activate` は `def.load` からやり直して**同じ機能をもう一度開く**。資源を返す動詞が
「二度と使えない」を意味する設計は、閉じたら開けない機能を作る。

**今この登録簿を使っている機能**（3つとも `activate` / `suspend` / `dispose` の3動詞を持ち、
自分の API にも `dispose` を出しているので、Atlas からも UI からも同じ口に届く）:

| capability | activate | suspend（速い再開のために残すもの） | dispose（返すもの） |
|---|---|---|---|
| `wx.wind` | 風レイヤー ON | OFF。**WebGL のレンダラは残す**（テクスチャ2・FBO2・VBO2・プログラム2の作り直しを毎トグル払わないため） | `js/wx-wind.js` の `dispose()` ＝ GL オブジェクトを削除し、キャンバスのバッキングストアも解放 |
| `sim.tsunami` | 津波パネルを開く | 閉じる（走っているジョブは abort、ソルバのスレッドは残す） | worker を terminate（`IntMapTsunamiWorker.dispose()`）、モデルとパネル DOM を破棄 |
| `sat.live` | 実時間衛星 ON | OFF（interval・3つの地図リスナー・詳細パネル。**カタログは残す**） | カタログと導出位置を捨て、レイヤーと軌道を地図から削除 |

⚠ **worker を返す動詞と、worker が死んだ経路は別物。** `src/tsunami-worker-client.js` と
`src/sat-worker-client.js` の `dispose()` は、**在庫のジョブを必ず決着させてから** terminate する
（terminate されたスレッドを待っている promise は永久に解決しない）。津波側は `null` で解決
（`abort` と同じ答え＝呼び出し側に既存の分岐がある）、衛星タイル側は **reject**
（タイルの promise は `{data,mode}` を約束しており、`null` は「絵が無い」を絵の位置に置くことになる）。
`onerror` の側は `tried` を戻さない——**墜ちた worker を輪で作り直さない**のはそちらの仕事。

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
  ファイルごと遅延化するとボタンが 2 つ消える——**ファクトリ本体の実行文を数えてから**決める。
  ⇒ **だから機能ではなく「起動時に走るもの」で切ってある。** `js/analysis-panels.js` は
  5 ファクトリの登録・起動時の DOM とリスナー・4 つの公開グローバルの**非同期ファサード**だけを持つ
  eager shell（17 KB）で、本体は `js/analysis-{timeseries,research,correlate,world-events,edu}.js`
  の 5 本に分かれて `IntMapLazy` から取られる。
  ⚠ **ファサードはスタブではない。** 呼ばれたらローダーを await して本物を呼ぶ。**取りに行っては
  ならない 2 つの入口**——`IntMapEdu.close()` と地図クリックの転送——だけが `IntMapLazy.ready()` を
  見て、まだ無ければ何もしない（＝クイズを開く前と同じ挙動）。
  ⚠ **遅延側のグローバルは `__imAnalysis*`**。`js/atlas-controls.js` の `moduleCatalog()` は
  `window.IntMap*` を自動発見するので、`IntMap` で始まる名前を足すと Atlas のカタログが勝手に増える。
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
- ⚠ **`ui.zh-hans.js` と `pages.zh-hans.js` は手で書かない**（どちらも `scripts/zh-hans.mjs` の
  生成物。繁体を直してから `node scripts/zh-hans.mjs` で再生成する）。
  **字体は OpenCC `tw→cn`、語彙（台湾語→大陸語）は同スクリプトの `WORDS` 表**が持つ。
  表の区分は 計算機・UI ／ 地図・科学 ／ 固有名詞 ／ 地名 ／ 社会・共同体。
  ⚠ **字体が両方で同じ語は、表に書かない限り台湾語のまま簡体字の読者に届く**——`tw` は字体だけを
  変換するので、`社群`（大陸は `社区`）・`紐西蘭`（`新西蘭`）・`金鑰`（`密鑰`）・`義大利`（`意大利`）
  のような語は、**字体を見る検査には完全に正しく見えたまま**素通りする。
  網羅性の門は `tests/r335-checks.test.mjs ①`（表の左辺が生成物に1つも残っていないこと）。
  ⚠ **左辺に置いてよいのは、この文書の中で語義が1つしかない語だけ**——`擷取`（截取／抓取）や
  `向量`（矢量／向量）のように2つの意味で使われている語は、丸ごと置換すると片方を壊す。
  ⚠ **語彙の掃引に OpenCC `twp` を pipeline の中で使ってはならない**（`WORDS` が直した大陸語を
  台湾語と読んで二度変換する: `檔案`→`文件`→`文档`）。表の外で**差分の一覧**としてだけ使う。
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
4. **Edge Functions を10本デプロイする**（`verify_jwt` は `supabase/config.toml` の宣言に従う）：
   ```bash
   for f in ai-proxy delete-account; do supabase functions deploy $f --project-ref <REF>; done
   for f in refresh-news monitor-run sv-cov alerts-relay cable-geo news-relay aviation-feed news-ingest routing-relay volcano-feed; do \n     supabase functions deploy $f --no-verify-jwt --project-ref <REF>; done
   ```
5. **Secrets を設定する**（§6.3）。最低限：
   ```bash
   supabase secrets set AI_PROVIDER=anthropic ANTHROPIC_API_KEY=... \
     REFRESH_SECRET=... MONITOR_SECRET=... NEWS_INGEST_SECRET=...
   ```
   ⚠ `REFRESH_SECRET` は**必須**（未設定だと `refresh-news` は全リクエストを拒否する）。
   `NEWS_INGEST_SECRET` も同じく必須（未設定だと `news-ingest` が全リクエストを拒否する）。
6. **cron を設定する**（pg_cron ＋ `net.http_post`。秘密は**ヘッダ**で送る）：
   - `refresh-news` を約20分ごと（`x-refresh-secret`）。初回は手動で1回叩いて `current_news` を埋める。
   - `monitor-run` を定期実行（`x-monitor-secret`）。SQL は `docs/AREA-MONITORS.md`。
   - `news-ingest` を約20分ごと（`x-news-ingest-secret`）。手順は
     [`docs/NEWS-EVENTS.md`](docs/NEWS-EVENTS.md) §12。
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
- `supabase/migrations/*.sql` — **唯一の設計図**（12本）。冪等・非破壊
  （`if not exists` / `create or replace` / `drop policy if exists`）。
- `supabase/seed.sql` — **100% 合成**（`.test` ドメイン・プレースホルダ UUID）。
- `supabase/tests/*_test.sql` — pgTAP（構造 ＋ RLS/権限マトリクス ＋ 関数 ＋ Monitors ＋ 権限昇格 ＋ News Events）。

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
