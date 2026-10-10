# IntMap — 現状仕様書 §1 概要 (Overview)

> **現状仕様書の §1。** 案内図は [`Architecture.md`](../../Architecture.md)（§ → ファイルの表）。**節番号は案内図と共有している**
> ——他の文書・コード・テストが書く「`Architecture.md` §1.x」は、このファイル（と案内図の表が同じ行に挙げる文書）の見出しを指す。
> 今どうなっているかだけを書く。変更履歴・ラウンド番号・PR 番号は書かない（`npm run check:docs` の `arch-rounds` がこのファイルも読む）。

## 1. 概要 (Overview)

IntMap は、世界のニュース・気候・人口・経済・地政学データを一枚の地図に重ねて表示する、
**フロントエンド全部入りのWebアプリ**です。

### 1.1 ビルドと配信

- **本体は `index.html` ＋ `css/` ＋ `js/` ＋ `src/`。** 本数と大きさは散文に書かない——`npm run check:docs` の `app-size` が毎回実測し、`js/` の 1 本ずつは [`docs/FILES.md`](../FILES.md) が持つ。
  ビルドは **Vite 8**（束ねるのは **Rolldown**、JS の変換と最小化は **Oxc**、CSS の最小化は **esbuild**）。
  `npm run build` → **`dist/`**（ハッシュ付き・最小化・チャンク分割）が **GitHub Pages で配信される実体**で、
  ソースツリーは配信されない。`dist/` は `.gitignore` 済み＝**ビルド成果物はコミットしない**。
- `index.html` は**プログラムではない**。マークアップ＋ブート用の `<script>` ＋
  `<script type="module" src="/src/main.js">` だけで、アプリ本体は `js/app-body.js` にある。
- **配信が入れ替わると、開いているタブの遅延チャンクは 404 になる。** Vite が `window` に出す
  **`vite:preloadError`** を `index.html` が受け、**押せる**再読み込みの案内（`.im-reload`）を 1 回だけ出す。
  文は版を確かめて選ぶ: 判定は `js/lazy-modules.js` の `window.__imChunkFailed`（`chunkFailureVerdict` /
  `makeChunkFailureCheck`）が配信中の `index.html` を `cache:'reload'` で取り直して `__imBuild` を比べ、
  印が違えば「新しい版」、同じ（読めない）なら「一部を取得できませんでした。再読み込みすると再試行します」、
  文書を取れなければオフライン扱いで出さず問いも消費しない。確かめるのは **1 タブ 1 回**。判定がまだ無い時点の
  失敗は `load` まで待ち、それでも無ければ確かめない案内を出す。
  トースト（`.sat-toast`）は `pointer-events:none` なので中にボタンを置けず、別の器を起動画面より上に出す。
  `preventDefault()` しない（import が reject し続けないと `js/lazy-modules.js` が「無い」ことを学べない）。
  オフラインでは出さない。同じ器が、手元が古い版だと分かったとき（`window.__INTMAP_STALE`）にも使われる。9言語。
- **ビルド印はビルドが書く。** `index.html` は `window.INTMAP_BUILD` と `window.__imBuild` に置換記号
  `__INTMAP_BUILD_STAMP__` だけを持ち、`scripts/build-stamp.mjs`（vite プラグイン。`vite build` でも `vite` でも走る）が
  **`<ビルドした commit の committer 時刻, UTC>Z-<短い sha>`** に置き換える（ビルド機の時計は使わない——古い commit を
  建て直すと古いコードが最新を名乗るため）。起動時の比較はその時刻で行い、既に見た印より古い印を配られたら
  キャッシュを捨てて 1 回だけ再読み込みし、それでも古ければ上の案内を出す。旧形式の保存値（`YYYY-MM-DD-R<n>`）は
  どの生成印よりも古いと扱い、置換されずに配られた頁は何も捨てない。バグ報告（`js/feedback.js`）と
  性能 HUD（`js/perf-hud.js`）は同じ値を載せる。
- **「エントリそのものが 404」は上の受け手には見えない**（`vite:preloadError` を出すのは
  `assets/main-<hash>.js` の中身）。GitHub Pages は **`Cache-Control: max-age=600` を全応答に**返し（ハッシュ付き資産も
  同じ値＝こちらに指定手段は無い。`<meta http-equiv="Cache-Control">` は HTTP キャッシュに効かない）、戻ってきた読者は
  最大10分古い文書を受け取りうる。`index.html` のインライン **`__imDocStale()`** がエントリの `<script type="module">` の
  失敗だけを capture 相で捕まえ、キャッシュを迂回して自分を取り直し、サーバーの文書が別のエントリを名指すときに
  限り 1 回だけ再読み込みする。遅延チャンクの 404 には触らない。一度きりの印（`sessionStorage.intmap_doc_bust`）は
  消さない（戻すとループになる）。2 回目以降と確認が取れない場合は再読み込みせず案内を出す。
- **取得の失敗は恒久的な答えではない。** `js/lazy-modules.js` の `need()` は解決値を `P[name]` に記憶するが、
  **ダウンロードの失敗は忘れる**（短い窓だけ抑止）。先読み（`hint()`）が開けた窓は明示の `need()` は無視する。
  **ファイルが届いた後の失敗は忘れない**（factory が無い・投げた・何も公開しなかった）。
  忘れても取り直せるとは限らない: ES モジュールの失敗は URL 単位でモジュールマップに残り、同じ URL の `import()` は
  失敗したまま（クエリを変えた URL だけが成功。Vite の code-split は指定子がリテラルなのでクエリを足せない）
  ⇒ 404 したチャンクを取り戻す手段は再読み込みだけで、案内（`.im-reload`）が本体の手当、忘れることは補助である。
- **インストールできるアプリとして配る。** `manifest.webmanifest` と `icons/` は `scripts/build-app-manifest.mjs` の
  生成物で、名前は `<title>` の語標（「IntMap」は訳さない）、色は `css/intmap.css` の `--bg-color`、アイコンは
  `IntMap.Icon.png` から導く。`index.html` は `vite-ignore` でそれらをそのまま指し（`assets/` へハッシュ化すると
  manifest の相対パスが壊れる）、`STATIC_ASSETS` がコピーする。theme-color は OS の配色ごとに 2 本で、
  アプリ内のテーマ選択は `js/installable-app.js` が上書きする。`--check` が index.html の値も源と照合する。
  暗色のマークは 384 px しか無いので 512 px は拡大である。
- **Service Worker はアプリの殻（app shell）も持つ——オフラインで開くためだけに。** 一覧は手で持たない:
  `scripts/app-shell.mjs`（vite.config.js の `appShell`、copyStatic の後）が build-report の **eager 集合**（`check:perf` と
  同じ定義）＋`dist/index.html` と manifest が名指すもの＋eager CSS の `url()` を導出し、ビルド印と一緒に `dist/sw.js` に
  書く。ビルドしていない `sw.js`（dev サーバ）は殻を持たずタイルのキャッシュだけ。殻のキャッシュ名はビルド印を含み、
  activate が前の殻を消す。install はこの build の文書だけを `cache:'reload'` で取り印を確かめて貯め、前の殻の
  同名ハッシュ付き資産は引き継ぐ。答え方は 3 通り: **ハッシュ付き資産**は殻から（再検証しない）、**manifest とアイコン**は
  stale-while-revalidate、**文書（navigation）はブラウザがオフラインと言うときだけ**殻から（オンラインの navigation に
  触らない理由は `DECISIONS.md`）。`onLine` が true のまま通らない回線では殻は答えない。
  殻から開いた頁は `shell-status` で知り、**オフライン通知**（`#im-offline`、`.im-reload` と同じカード）を出し、
  回線が戻ると「再読み込みで取得し直す」に変わる。設定 ▸ About & support の「アプリとして追加」は Chromium の
  `beforeinstallprompt` を保持して出し、iOS では共有シートの手順を 1 文で示し、どちらも無い環境とインストール済みの
  窓では出さない（`js/installable-app.js`）。
- **持ち歩ける地図（オフライン）——`js/offline-maps.js`・`js/offline-plan.js`。** 設定 ▸ キーボードショートカットの下の
  ボタンと Atlas の `settings.offlineMaps` が同じダイアログ／関数を開く。表示範囲の**地形（terrarium）タイル**と、
  開いたレイヤーの IntMap 自身のファイル（`data/`・`assets/`。resource timing から発見し、殻が持つものは除く）を、
  ページ所有のキャッシュ `intmap-page-offline-v1`（`intmap-page-` 接頭辞なので activate は消さない）に保存する。
  保存前に大きさを言う（タイル数は範囲から厳密に、1 枚の重さは中心の数枚の実測に「約」）、空きに収まらない細かさは
  出さない、粗い細かさから保存する（中断しても全体が粗く残る）、失敗したタイルは数えて欠けを言う。保存済みの一覧と
  削除（他の保存が使うファイルは残す）。供給元のファイルを保存してよいかは台帳が述べたものだけ——
  `scripts/outbound-hosts.json` の各ホスト行の `offline`（allowed・kind・pathPrefix・規約の URL・理由）を
  `scripts/offline-sources.mjs` が `data/offline-sources.json` に導出し、ページはそれだけを読む。述べていないホストは拒否、
  「いいえ」と述べたホスト（OpenFreeMap）は規約へのリンク付きで保存しないものとして出す＝基図のベクタタイル・衛星画像・
  生きたデータは保存されない。sw.js は保存領域をブラウザがオフラインと言うときだけ返す。地形タイルの 5 つのホスト別名は
  1 つの綴り（`offlineKey`）に畳む。門は `tests/keyboard-and-offline-checks.test.mjs` ①②③ と `tests/keyboard-and-offline.spec.js`。
- **ファイル同士は `import` で結ぶ。読み込み順は import のグラフが決める。** 依存は `import`／`export` と依存注入
  （`HOST`・`provideLayerKind`）で書き、`window` は後方互換とデバッグの窓口に限る。`src/main.js` に残る `import` の行は
  「まだ import の辺を持たない副作用モジュール」だけ（`node scripts/module-graph.mjs --entry` が 1 行ずつ理由を言う）。
  規約・移し方・門は [§3 ファイル構成](03-files.md) の「ファイル同士の結び方」。
- **実行時依存は npm から取る**（CDN の浮動タグは使わない）。`src/vendor.js` が `maplibregl` / `turf` / `topojson` /
  `mlcontour` / `supabase` / `sb` を同じグローバル名で再公開する。KaTeX と html2canvas は動的 import で別チャンク。
  `package.json` の `dependencies` がアプリに入る依存の唯一のリスト（`src/vendor.js` の見出しは主版だけ）。
  **maplibre-gl は 6 系で ESM 専用**（`import * as maplibregl`）。配布は本体 `maplibre-gl.mjs`・worker
  `maplibre-gl-worker.mjs`・両者が import する `maplibre-gl-shared.mjs` の 3 本で、本体は worker を module worker として
  起こす。`vite.config.js` の `maplibreSharedWorker` が worker を同じビルドの entry チャンクとして出し
  （`emitFile({type:'chunk'})`）、`src/vendor.js` は `virtual:maplibre-gl-worker-url` から URL を受けて最初の Map より前に
  `setWorkerUrl` で渡す。両者が import するものは **`maplibre-gl-shared` チャンク 1 本**になり、shared はネットワークを
  1 回しか渡らない。shared に置くものは worker の静的 import のグラフが決め、worker のグラフの外のモジュールが入れば
  ビルドが止まる。`vite dev` では同じ virtual モジュールが dev worker URL（`?worker&url`）を返す（素の `?url` では
  worker が最初の import で死ぬ）。CSP は `worker-src 'self'` のままで足りる。
  他のモジュールが自分で動的 import する依存もそこに宣言する（警報レイヤーの `polygon-clipping`——「発表なし」の形と
  灰色斜線の形を計算し、`js/world-packs.js` が別チャンクで取る。推移的に届いているものは依存ではない）。
- **Turf は関数ごとのサブパッケージから名前で取り、`window.turf` に載せる**（`@turf/turf` は import しない）。
  起動時の `geo` チャンクに入るのは入口から静的 import で届く `@turf/*` と `topojson-client` で、`vite.config.js` の
  `geo` group の `name()` がモジュールグラフから判定する。重い 3 つは要るときに取る: `convex`・`buffer`（`@turf/jsts`）は
  `window.turf.ensureHeavy()`、`union`（polyclip-ts ＋ bignumber.js）は `window.turf.ensureUnion()`。
  公開する `turf.bbox` は座標から測る（Turf 7 単体は宣言された `bbox` 欄を返す）。
- **Supabase クライアントは `createClient` で作るが、Storage と Functions のクライアントは束に入れない**（Edge Function は
  `fetch` で直に呼ぶ・バケットは無い）。`vite.config.js` の alias が `@supabase/storage-js`・`@supabase/functions-js` を
  `src/supabase-unbundled-stub.js`（触れた瞬間に投げる）に向け、`tests/deps-runtime-majors-checks.test.mjs` が誰も
  触れていないことを測る。`admin.html` は SDK 自身の UMD 版を読む。
- **Supabase の接続先は `src/vendor.js`**（`window.SUPABASE_URL` / `window.SUPABASE_ANON_KEY`）。`admin.html` は同じ 2 つを
  自分のインライン script で持つ。publishable(anon) キー＝**公開前提**で、保護は RLS（§17）。
- **CARTO 基図のキーは `js/carto-basemap.js`**（`window.CARTO_BASEMAP_KEY`）。CARTO はラスタータイルに API キーを要求し、
  キー無しの応答は**失敗しない**（200 のまま「API KEY REQUIRED」の透かし入り PNG）。URL を組み立てる口は
  `window.cartoTileURL()` / `window.cartoTiles()` の 2 つだけで、`js/app-body.js` / `js/compare.js` / `js/playground.js` /
  `js/layer-previews.js` はホスト名を綴らない（`tests/carto-basemap-checks.test.mjs` ②）。専用ファイルなのは鍵と URL
  組み立てを 1 か所に閉じるため（shell の広さは `npm run check:surface` が `IM_HOST` の項目と `window.*` の公開名で測る）。
  ベクタ移行もこのファイルに来る。鍵は公開前提。無料枠は 5,000,000 タイル要求/月（ラスタ＋ベクタ合算）。
- **ソースマップは本番に出さない**（`vite.config.js` の `build.sourcemap` は false）。
- **ビルドは自分を計測する。** `vite.config.js` の `buildReportPlugin()`（`scripts/build-report.mjs`）が Rolldown の最終グラフから
  **eager**（`index.html` のエントリ＋静的 import の推移閉包＝`modulepreload` の集合）と **async** を導出する。eager には
  起動経路が立ち上げる worker も入る（eager チャンクの `?worker&url` が名指す worker アセットと、eager が名指す emitted
  entry チャンク＝MapLibre 6 の worker とその閉包。描画コードの hash placeholder はチャンクの `preliminaryFileName` でも
  照合し、どのモジュールも名指さない emitted entry はビルドを止める）。関数の中で `new Worker(new URL(…))` する worker
  （航空機・放射線・衛星・津波）は入らない。raw / gzip / brotli とモジュール別の内訳を `.perf/build-report.json`
  （追跡対象外）へ書き、`npm run check:perf`（`scripts/perf-budget.mjs`）が `tests/perf-baseline.json` と突き合わせる。
  eager・async（合計と chunk ごと）・`dist/` の合計がそれぞれの天井を持つ（最大 chunk の Cesium 4.7 MB は既定セッションが
  1 バイトも取らないので、最大 chunk のゲートは起動費用を語らない）。
  **天井を上げるのは PR、下げるのは `main` の CI。** PR が落ちるのは行が天井＋幅（`max(天井×0.5 %, 2 kB)`。`requests`・
  `modules` は幅 0）を超えて増えたときだけで、上げる判断は PR が `--update`（超えた行だけ書き換える）で述べる。
  `main` への push ごとに CI の `build` ジョブが実測を artifact に残し、`.github/workflows/perf-ceiling.yml` が `--tighten`
  （全行を `min(天井, 実測)`・新しい chunk に天井・消えた chunk の行を削除。上げない）をかけ、幅を超えて下回った行があれば
  bot の PR にして `.github/actions/land-bot-pr`（衛星カタログの着地と共有）で `require-current`——測った `main` の上に
  乗っているときだけ——着地させる。`check:perf` は天井の上に何行あるかと最も緩い行を幅の単位で印字する。
  `GITHUB_TOKEN` の merge は CI を起こさないので、周期は次の人の push まで延びうる。
- **共有窓口の広さも計器で見る。** `npm run check:surface`（`scripts/global-surface.mjs`）が `js/app-body.js` の `IM_HOST` の項目
  （getter／setter／後付けの代入）と、`js/`・`src/` が `window.*` に代入する公開名を `tests/global-surface-baseline.json` と
  両方向に照合する。コメント・文字列・正規表現リテラルの除去は acorn の字句解析で、読めないファイルはそのファイル名で
  落ちる。増えた名前は `DEV-NOTES.md` に理由を書いて `--update`、減った名前も `--update` が受領証。
  **公開名には読み手が要る**: 代入以外に読み手を持たない公開名を `unread` として基準に持ち両方向に照合する。読み手は
  `js/`・`src/`・`tests/`・`scripts/`・トップの HTML のコード（コメントは消し、文字列は残す——`onclick="_x()"` は読み手）での
  出現と、`Object.keys(window)` を正規表現で絞って列挙するコード（Atlas のモジュール目録など）。コンソール専用の診断は
  `unread` に残る。行数の天井は持たない（初期配信量は `check:perf`、結合の広さは `check:surface` が測る）。
- **`js/` のモジュールの形は普通の ES Module でよい。** `scripts/check-split-scope.mjs`（自由識別子が何にも解決しない
  ことを捕まえる）と `scripts/export-readers.mjs`（export に読み手が居ること。読み手は `js/`・`src/`・`scripts/`・`tests/`）が
  性質を測る。
- **行は起動時、本体は初めて使われたとき。** レイヤーの**行**（Layers の棚・チェックボックス・Atlas と共有リンクと
  セッション復元が名前を引く相手）は起動時に要るが、本体は要らない。そう切ってあるもの: 世界データ層
  （`js/world-packs-rows.js` が行・共有ツールキット `_ui`・共有リンクの選択を持ち、5 層の本体 `js/world-packs.js` は
  `worldPacksBody`）と宇宙エクスプローラ（`js/space-approach.js` がズームの床のジェスチャー・ゲージ・`window.IntMapSpace` の
  ファサードを持ち、本体 `js/space.js` とそれだけが読む `js/space-{events,bodies,cosmos}.js` は `spaceBody`）。
  行側の規則は `js/lazy-modules.js` の `lazyBody(ask)` 1 つ: クリックは到着の Promise 1 本に押した順に並ぶ、何も取って
  いないときの off は何も取らない、到着後は同期に戻る、到着の失敗は覚えない。届かなかったときは `lazyRowFailed` が
  行を外して言葉で言う。エクスプローラの取得はゲージの予告（床の 2 ズーム手前）で、世界データは行にポインタが乗った
  時点で `IntMapLazy.hint` が始める。ファサードは到着前に `state()` を `loaded:false` で答え、到着した本体が入口を渡す。
  遅延化は静的な到達で決まるので、`tests/startup-lazy-layers-checks.test.mjs` が `LAZY_REGISTRY` の全項目について入口の
  static import 閉包に入っていないことを実際のグラフで測る。eager と遅延の両方が読むモジュールから別の共有モジュールへ
  static import を張らない（`vite.config.js` の fetch-deadline-layer の項。`js/star-catalogue.js` は扉を
  `window.IntMapDataDoor` 経由で読む——import すると eager チャンクが 7 → 9 本になる）。
- **`data/stars.bin` の読み手は 1 つ。** `js/star-catalogue.js` が `js/data-door.js`（`as:'arrayBuffer'`）でバイトを取り、
  IMSTAR1/2 のレコードを一度だけ列（赤経・赤緯・等級・B−V・年周視差）に復号する。星空（`js/space-sky.js`）と
  エクスプローラ（`js/space.js`）はそこから自分の形を作る。
- **Noto の規則シートは描画をブロックしない。** Google Fonts の `<link>` は持たず（実測 1,386,296 B の CSS・gzip 378,340 B）、
  `js/map-typography.js` の `ensureWebFonts()` が**言語が決まった後**（DOMContentLoaded と `intmap-lang`）に、読者の面
  （`_readerFaces()`——ラベルが描く面で UI の面の上位集合）のうち `document.fonts` に宣言の無いものだけを注入する:
  ja と Latin の UI は JP＋SC、繁体は TC＋SC、簡体は SC、韓国語は SC（Pretendard は同梱）。SC は他国の現地名を描く
  `HAN_ALL` なのでどの読者にも要る。最初の数フレームは `css/fonts.css` のシステム CJK フォールバックで描かれうる。
- **遅延モジュールは 1 モジュール 1 定義。** `js/lazy-modules.js` の `LAZY_REGISTRY` が正本で、1 項目が「公開する global・
  literal な `import('./x.js')`・factory を回す `mount`・factory を持たない `self`・一緒に取る `also`」を持つ。loader の取得・
  mount・検証はこの表を読み、`src/main.js` の boot guard は `LAZY_NAMES` / `CARRIED_NAMES` を import して一覧を導く。
- **配られるファイルは1つ残らず「誰が読むか」を持つ。** `npm run check:assets`（`scripts/asset-report.mjs`）が `dist/` の全ファイルを
  ソースが実際に含む文字列と突き合わせて分類する——`exact`（`js/` `src/` `css/` `*.html` `sw.js` が名指し）／`prefix`
  （`'data/planets/'+id+'.jpg'` のような連結）／`build`（`scripts/` だけが名指し）／`test`／`doc`／**`orphan`**。
  分類は宣言ではなく導出。`data/` の小さな JSON も走査対象（`js/precip-annual.js` は `data/precip-mm.json` の `mercator.file` を、
  `js/vs30-mask.js` は `data/vs30.json` の `phone.file` を読む＝マニフェストは consumer）。落ちるのは ① 誰も名指ししない
  ファイル、② 同一 SHA-256 の payload が許可リストの外で 2 回配られる、③ ファイル単位の天井を理由なく超える、の 3 つ。
  許可リストは名前ではなく理由を持つ（Cesium SDK の実行時ツリー、繁体/簡体ページ用の KaTeX と Inter の写しなど）。
  ビルドが要るので CI では build と同じ shard、`npm test` では browser 半分の最後で走る。
- **同じデータを2つの形で配ってはならない。** `data/ecoregions_2017.js`（`window.__ECOREGIONS_2017`）は隣の `.geojson` と
  バイト同一なので `STATIC_EXCLUDE` で配布から外す（リポジトリには残す）。`js/layer-packs.js` の `window.__loadEcoregions` は
  `fetch` を先に `<script>` を後に試し、読み手は比較ウィンドウ（`js/compare.js`）だけ。地図の `eco-regions` ソースには URL を
  そのまま渡す（`addSource({type:'geojson', data:'data/ecoregions_2017.geojson'})`。MapLibre は worker で取得・parse し、
  Cesium のアダプタ（`js/cesium-engine.js` `addSource`）も文字列の `data` を自分で取る）。MapLibre 6 は URL で読んだ GeoJSON を
  `getData()` のため構造化複製でページへ返す。取得の失敗はレンダラの `error`（`sourceId`）で受け、ソースを外して次の
  チェックで取り直す。
- **`resolve.alias` は dev サーバの事前バンドルに届かない**ので、`satellite.js` は `optimizeDeps.exclude` に置き、dev も
  ビルドと同じ alias 経路（Emscripten 入口 `pthreads-release` を stub に差し替える）を通す。
- **チャンクの置き場は「優先度」で決まる。** `vite.config.js` の `build.rolldownOptions.output.codeSplitting.groups` が 4 つの
  名前付きチャンクを作る——`maplibre-gl`（優先度 4。束ね器の補助モジュール＝`\0` で始まり node_modules を含まない id も）、
  `geo`（3。`@turf/*` と `topojson-client`、ただし `turf-jsts`・`@turf/buffer`・`@turf/convex` などの重い側は除く）、
  `supabase`（3）、`cesium`（1。`cesium`・`@mapbox/vector-tile`・`pbf`）。group は捕まえたモジュールの依存も再帰的に
  取り込むので、優先度が無いと遅延の `cesium` が preload helper・Oxc の補助・`topojson-client` を取り込んで第2エンジンが
  丸ごと eager になる（実測 eager raw 4.78 → 9.45 MB）。Rolldown の runtime（`\0rolldown/runtime.js`、約 1.3 kB）は
  独立チャンク `rolldown-runtime` に置かれる（複数の消費者がいるため）。したがって eager は
  **main＋`maplibre-gl`＋`maplibre-gl-shared`＋`geo`＋`supabase`＋`rolldown-runtime`** の 6 本と CSS 2 本、それに MapLibre の
  worker チャンク 1 本（`maplibre-gl-worker-*.js`、約 19 kB）。`maplibre-gl` には `maplibre-gl.mjs`・worker の URL モジュール・
  worker が使わない補助（modulepreload polyfill・Oxc の補助）、`maplibre-gl-shared` には `maplibre-gl-shared.mjs` と preload
  helper が入り、worker チャンクは `maplibre-gl-shared` を import する。
- **`resolve.mainFields` は `module` を `browser` より前に置く**（Vite 8 は既定順で `browser` を先に取るので、そのままだと
  `polygon-clipping`・`turf-jsts`・`html2canvas` が ESM から UMD に替わる）。
- **CSS の最小化は esbuild（`build.cssMinify: 'esbuild'`）。** Lightning CSS は `backdrop-filter: X; -webkit-backdrop-filter: X;` の
  並びで標準のほうを捨て、Chromium ではぼかしが消える。esbuild は `devDependencies` に明示する（node 検査の 2 本も
  TypeScript の型除去と IIFE 化に使う）。
- **オープンデータと埋め込み API。** サーバを持たないので、API は**ビルドが書くファイル**と**ブラウザの postMessage** でできている。
  - **`api/v1/`（ビルドが書く・コミットしない）。** `vite.config.js` の `publicApiPlugin` が静的コピーの後に
    `scripts/public-api.mjs` を走らせ、`catalog.json`（再利用できるデータセット——ファイルの絶対 URL と大きさ・出典が述べるとおりの
    ライセンス・条件〔出典表示／継承／非営利〕・表示する出典の行——と、出さないものとその理由）、`countries.json` と
    `countries/<CODE>.json`（Natural Earth の国コード。「鍵の過半が国コードの表」を発見してその国の行を集め、節ごとに条件を持つ）、
    `embed.json`（埋め込みの URL 文法と約束事）を `dist/api/v1/` に書く。並べるのは dist にあるものだけ。
  - **出すか出さないかは台帳が述べる値で決まる。** ライセンスは `scripts/data-governance.mjs` の `rightsTable()`（`check:datagov` と
    同じ読み方）から読み、`public-api.mjs` の `LICENCES`（再配布・出典表示・継承・営利利用の語彙）に照らす。上流の**すべて**が
    語彙の知るライセンスを述べているときだけ出し、最も厳しい条件が全体にかかる。出さない理由は 4 つ: ライセンスを値で
    述べていない／再配布を許すと確認できない（例「© UNESCO」）／出典表示が条件なのに表示する出典を述べていない／ビルドに
    写されない。地図が描くための利用と再利用のために出すことは別の主張。
  - **記録が合成ファイルの中で担った部分も値で運ぶ。** 上流の記録が `cite`・`contributes:'outline'`（輪郭だけ）・`rowsFrom`
    （行を切りうる最初の日）を述べていれば、カタログの `upstreams` にそのまま載る。出さないものの項目も `paths` を持つ。
    国境の記録（OpenHistoricalMap 1689–1885・Cliopatria・historical-basemaps・その後継ぎ）はこの形で述べ、ページはそれを
    行ごとに読んで、ある日の国境を GeoJSON で持ち出させる（`js/border-extract.js`。`docs/architecture/08-ui.md` の引用タブ）。
  - **埋め込み API。** `js/embed-client.js` が約束事 `PROTOCOL`（ホスト→枠の get / state / view / time、枠→ホストの
    ready / state / reply）と、ホストが URL で import する `mount()` を持つ（何も import しない。vite が `dist/js/` にそのまま写す）。
    枠の側は `js/embed-mode.js` の `commandHash` が命令を共有リンクの断片 1 つ（`js/map-state.js` の encode）にし、貼った
    リンクと同じ `hashchange` の経路（`js/map-ui.js`）で適用する。断片は `replaceState` で書いて合成の `hashchange` を送る
    （ホストの「戻る」を増やさない）。枠が伝えるのは地図の公開状態だけで、送り先は `window.parent`。
  - **開発者向けページ** `developers.html`（と `ja/`）は `scripts/landing.mjs` が生成し、命令とイベントの表は `PROTOCOL` から、
    データセットの表はビルドが `CATALOG_MARK` の位置に埋める。共有パネルの「埋め込み」タブと埋め込みの紹介ページから結び、
    Atlas は `data.openData`（`openData`）で同じ `catalog.json` を読む。

### 1.2 地図エンジン

- 既定のレンダラは **MapLibre GL JS**（Mercator 平面 ＋ Globe 投影）。
- **MapLibre の地図を生成するのは `js/geo-engine.js` の `_newMap` ただ 1 か所**（`createView`・`createSubView` も通る）。
  `_newMap` は常に `attributionControl:false` にする——レンダラ自身の帰属表示は遠隔の TileJSON／スタイルの `attribution` を
  HTML として解釈して書く（GHSA-jrc7-96c5-q579。6.4.1 で修正・6.11.1 で許可リスト方式）ので、IntMap 側はマークアップを
  解釈する書き手を持たない（判断は DECISIONS.md）。帰属表示を求める呼び手（`credit:true`・`attributionControl` の真値・
  `customAttribution`）には IntMap 側の帰属表示（`div.map-credit-view`）を付ける: いま描かれているレイヤーと地形の source の
  `attribution` をテキストノードと http(s) の `<a>` だけで組み立てる。主地図は `#map-credit`。
- **レンダラの名を出してよいファイルは `js/geo-engine.js` ただ1つ**（アダプタ＋`IntMapGeoEngine` ファサード）。他の js/ は
  `const GE=()=>window.IntMapGeoEngine;` 経由で**契約**（`layers` / `camera` / `coords` / `scene` / `ui` / `render` / `input` /
  `events`）だけを見る。`npm run check:engine` が AST で固定する（コメントやローカル変数 `map` で誤検知しない）。
  アダプタに足したメソッドは必ず契約側にも出す（出さないと「2つ目以降」が静かに落ちる）。
- **アダプタがレンダラの内部に触れる口は 2 つだけ**——`_cam(m)`（MapLibre 6 の Map が合成して持つ Camera、`map._camera`）と
  `_tr(m)`（painter が描画に使う transform）。6 系の Map は `map.transform` を持たないので、行列・遠クリップ面・視点距離は
  `_tr` を、`isEasing()`（`camera.isAnimating()`）と `_elevateCameraIfInsideTerrain`（無制限チルトの地下補正。修理はカメラに
  置く）は `_cam` を通る。視点ピボットのフックは公開の `setTransformCameraUpdate`（`transformCameraUpdate` 欄は 6 系で
  読まれない）。高度つきの点の画面位置（`coords.projectAltitude`・`layers.projectMercAlt`）は、6.0 で消えた
  `getMatrixForModel` の代わりに、カスタムレイヤーの投影データをシェーダの `projectTileFor3D` と同じ式で CPU で通す
  （平面・球・11→12 のクロスフェードとも）。描く側——衛星（`js/orbit-points.js`）・航空機（`js/aircraft-points.js`）・3-D 体積
  （`js/solid3d.js`）——は `js/lifted-projection.js` の `projectLifted` を共有する（球の半分には m、平面の半分には Mercator 単位）。
  **画面の点が地球の上にあるか**（`coords.onSurface(pt)`→ true / false / null）は `_tr` の `isPointOnMapSurface`、Cesium は
  pick の光線が楕円体に当たるか。`unproject` は地球の外の点にも答えるので、押した点を頂点にする道具（マイマップ、7.3g）は
  こちらに訊く。黙って効かなくなっていないことは `tests/maplibre-6-migration-checks.test.mjs`（呼ぶ全メソッドが版に実在・
  内部は 2 つの口からだけ）と `tests/maplibre-6-migration.spec.js` が測る。
- **地形の高さは標高ソースの状態で読み終える。** 3-D 体積（`js/volume3d.js` の `chaseGround`）は `queryTerrainElevation` が
  標高タイル到着前に **0** を返すので、地形ソース（`scene.getTerrain().source`——`js/terrain-water.js` が差し替える）の
  `sourcedata` を合図に次の `render` で読み直し、動いたら塗り直す。`isSourceLoaded` の後の 1 フレームか `idle` で読み終え、
  次のタイルで再び読む。地形ソースの `error` は `state().groundError` に残し、`groundState`（off／reading／read）と分けて
  述べる。保存済みの立体も同じ読み直しを受ける。回数や一致での打ち切りはしない。
- **「レイヤーを足してよいか」は `canDraw()`（スタイルが解析済みか）、待つのは `whenCanDraw()`**（ファサードの 1 か所。
  `js/data-layers.js`・`js/time-borders.js`・`js/time-admin1.js` の `whenStyleReady()` はこれを返すだけ）。`styledata`/`load`/`idle` の
  購読と 150 ms のポーリングをビューごとに 1 組。**期限で「準備できた」と答えない**（隠れたタブではフレームが走らず、
  「Style is not done loading.」でレイヤーを失う）。
- **契約は型として宣言され、コンパイラが両エンジンに対して検査する**（`npm run check:types` ＝ `tsc --noEmit`）。
  `types/geo-engine.d.ts` が共通メンバー（`GeoEngineAdapterCore`）、片方だけのメンバー（`MapLibreOnly` / `CesiumOnly`。
  ファサードは `A().x ? A().x() : 既定値` で呼ぶ）、8 名前空間のファサード（`GeoEngineFacade`）、能力表（`GeoEngineCapabilities`）を
  宣言し、`makeMapLibreAdapter` / `makeCesiumAdapter` / `engineFacade` と 3 つの能力表がその型で注釈されている。母集合は
  `// @ts-check` を持つファイル（`js/geo-engine.js`・`js/cesium-engine.js`・`js/runtime.js`・`js/lazy-modules.js`・`js/chronos.js`）。
  `window.IntMapTime` は `types/chronos.d.ts`、window の名前は `types/globals.d.ts`、`IM_HOST` の宣言済みの部分は
  `types/im-host.d.ts`（`check:surface` の基準と矛盾しないことを検査が確かめる）。任意メンバーを確かめずに呼ぶ誤りは
  `strictNullChecks` が要るのでまだ捕まらない（`docs/TESTING.md`）。
- **アダプタはビューごとのファクトリ**（`makeMapLibreAdapter`）で、追加ビュー（`js/compare.js` の比較地図・`js/playground.js`・
  `js/flight-sim.js` のミニマップ）は `ui.createSubView` が返す同じ形を使う。マーカー／ポップアップはビューに付く
  （`ui.addMarker` / `ui.addPopup`）。生ハンドルを取り出す `ui.createView` は `js/app-body.js` の 1 回だけ。
- ビューの破棄は、そのビューが登録した時計・定期処理・地形キャッシュも解除する。地理ゲームの回答地図は、閉じる・背景タップ・
  再挑戦のすべてで同じ破棄処理を通る。Cesium の地形キャッシュはビューごとに予算へ登録し、破棄時に登録と取得中の要求を
  解除する（後から完了した要求はキャッシュに戻さない）。Cesium のマーカー・ポップアップは remove 時にイベント購読と予約描画も
  解除し、再追加・別ビューへの移動では必要な購読だけを付け直す。
- **アダプタは自分に来た命令を数える。** `layers.setSourceData` / `setFilter` / `setPaint` / `setLayout` / `setFeatureState` の 5 つに
  ついて **attempted / sent / same（同じ値を既に持っていた）/ absent（対象が無い）** を集計する。既定は数えない。
  `render.commands()` / `commandsReset()` / `commandConfig()` で読める。計器は 2 段: `?perf=1` は集計だけで payload を文字列化
  しない。id 別・フェーズ別の表と内容ハッシュは `?cmdlog=1` または `?cmddetail=1` でだけ点く（表には行数の上限があり、溢れた
  分は `folded` として申告。合計は正確）。`node scripts/frame-profile.mjs --commands` が起動・pan・zoom・レイヤー欄・ホバー・
  Chronos・言語・テーマの各フェーズを駆動して表を出す（フェーズは宣言する）。
  **省略してよいのは `setSourceData` だけ**——MapLibre の `Style.setPaintProperty` / `setLayoutProperty` / `setFilter` は自分で
  deepEqual して同値を捨てるが、`GeoJSONSource.setData` は毎回コレクション全体を worker で再パースするから。既定は
  `sourceData` だけ ON、他の 4 つは数えるだけ。MapLibre の比較は保持値を複製してから行うので、大きな値は同値でも費用がある:
  時間旅行中の `ofm-city` の `text-field`（1916 年で約 0.9 MB）は呼び出し側（`js/place-labels.js`）が、生成元（`js/hist-cities.js`）が
  書き換えないと約束した配列に限って同一性で省略する。
  **頻度は呼び出し側が決める——道具は `layers.witness()`。** `ofm` のタイルが届くたびの `sourcedata`（止まっていても 0.1〜1.2 秒
  ごと）に `js/app-body.js` は 2 つの再表明——地名ラベルの全適用（`ensurePlaceLabels` ＋ `applyLabelLang`）と参照線・国境・
  海岸線の再表明（`__refApply` → `_applyAdmin1`、`_applyBorders`、`_imCoastReassert`）——を付けている。`witness.run(fn)` は pass の間に
  `layers.has` / `get` で訊かれた id を記録し、終わった時点の層オブジェクト（無ければ `null`）と組にする。`witness.unchanged()` は
  pass が 1 回完走していて全 id が今も同じオブジェクトを指すときだけ真で、心拍は `if(!beat.unchanged()) beat.run(…)`。例外で
  終わった pass は記録しない。pass は入れ子にできる。pass の他の入力（言語・表示モード・テーマ・衛星・トグル・時計）は呼び出し元が
  直接 pass を呼ぶ。`getLayer()` が毎回写しを返すアダプタ（Cesium）では毎回走る。実測（375×812、`sourcedata` 20 回）:
  setLayout/setPaint/setFilter **1,240 → 0**。検査は `tests/legend-reflow-and-label-writes-checks.test.mjs` と
  `tests/form-control-names.spec.js` ②。`layers.setLayout` の第 4 引数は MapLibre の `StyleSetterOptions` で素通しする
  （Cesium アダプタは無視）。
  **`setSourceData` の省略の可否はレンダラが今持っている payload との deep-equal で決める**（`_sourceHolds`。`s._data` を読むので
  facade は何も保持しない）。① 同一オブジェクトは根拠にならない（呼び出し側が書き換えたかもしれない）ので適用する、
  ② 比較には作業量の上限があり、等しいと証明できなかったものは適用する。1 つのオブジェクトを書き換えて使う呼び出し側は
  `setSourceData(id, data, {revision})` でそう言える（`opts` は第3引数で、facade はそれを渡す）。
- **同じソースへの書き込みは、丸ごとでも「変化」でもよい。** `setSourceData(id, data, {diffable:true})` は「地物ごとに同定できる」
  宣言で、以後の `setSourceData(id, data, {diff:{add,remove}})` は差分だけを渡す（MapLibre の `GeoJSONSource.updateData`）。
  **`data` は常に真実**——差分を扱えないエンジン・`diffable` な丸ごと書きを受けていないソース・id の衝突・例外のどれでも
  丸ごと書きに落ちる。実際にどちらを送ったかは census の `diffed` が数える（計器が OFF でも読める）。
- **Cesium は設定で選べる第2エンジン**（設定 ▸ 地図の動作 ▸ 地図エンジン。Atlas の `engine` アクションからも切替可）。
  カバー範囲はベクタタイルを含めて MapLibre と同等。
  - `js/cesium-style.js` — style 言語の**解釈器**（式・フィルタ・色・旧 stops 形式）。純粋なので
    `tests/engine-cesium-rendering-checks.test.mjs` が Node で直接検証する。
  - `js/cesium-layers.js` — プロバイダ＋描画。raster は `ImageryLayer`（brightness/contrast/saturation/hue がネイティブ）、
    fill/line/circle/symbol/fill-extrusion はエンティティ、heatmap/hillshade/color-relief は同じ DEM から計算したラスタ、terrain は
    同じ terrarium タイルから `HeightmapTerrainData`。**キーレス（Ion トークン不要）**。`ImageBitmap` は `UNPACK_FLIP_Y_WEBGL` を
    無視するので、テクスチャ化は必ず `toTexture()` を通す。**`image` source**（Köppen・年降水量・日射・地震動・ShakeMap・地形の水・
    可視域・world packs）は `makeImageSourceProvider()` が画像を読んでから作るプロバイダで、`ImageryLayer.fromProviderAsync` として
    style の位置に置かれる。タイル方式は Web Mercator の 1 枚（MapLibre が Mercator Y に線形に貼るのと同じ。地理座標で貼ると
    60°N の行が約 35.6°N に来る）。`updateImage` は次の画像が読めるまで今の画像を残し（`retiring`）、読めなかった層は
    `unpainted` に理由を持って `error` を出す。
  - `js/cesium-vector-tiles.js` — タイルピラミッド（cover/fetch/decode/cache）。`@mapbox/vector-tile` がタイルを GeoJSON にし、
    要るタイル集合は今の視界が覆うタイル集合で決める。
  - `js/cesium-input.js` — **操作は MapLibre の操作**。8 ジェスチャ（pan / rotate / pitch / wheel / box zoom / 矢印キー /
    ctrl ドラッグ / shift ドラッグ）の定数と式は同梱の `node_modules/maplibre-gl` のハンドラ実装から取り、
    `tests/engine-cesium-input-checks.test.mjs` が突き合わせる（依存を上げて操作感が変わると落ちる）。慣性の速度は 6 系の方式
    （直近 60 ms・先頭の記録は区間の始点だけ）。**globe のドラッグ**は MapLibre 6.4 以降の `versorSetLocationAtPoint` の写し
    （`globeDrag`）: 「(指 − 移動量) の下にあった地点」を「指の下」へ運ぶ回転を向きの四元数に掛け、方位は保つ。極の 12° 以内は
    極のまわりのダイヤルへ移り、縁の手前 10% から双曲線で減速し、縁の外では中心の画素を支点にする。楕円体は軸を半径で割った
    単位球で計算する（`pickEllipsoid`）。離した後の慣性は 6 系の `handlePanInertia` と同じく `computeGlobePanCenter`（`panCentre`）。
    `tests/cesium-globe-drag-checks.test.mjs` が同梱の `src/` から `GlobeTransform` を組み立てて中心の一致（1e-9 以内）を、
    `tests/cesium-globe-drag-cesium.spec.js` が実描画の両エンジンで滑りを測る。カメラは必ず `setCamera()` 経由で、ジェスチャ 1 回に
    `movestart…moveend` は 1 組。
  - `js/cesium-engine.js` — アダプタ本体（`makeMapLibreAdapter` と同じメソッド集合）。
  - `js/engine-select.js` — DOMContentLoaded より前に選択。既定では何も publish しない。
  - **既定セッションは 1 バイトも払わない**: cesium の import は動的、main チャンクから cesium チャンクへの参照 0、modulepreload 無し。
    **切替は再読み込み**で、パネルは実際に描画しているエンジンを保存値とは別に表示する。
  - **Cesium が答えられない物は答えないと言う**: `solid3d:false`、`demContourSource()` は null（maplibre-contour は MapLibre の
    名前空間を要求する）。呼び出し側は既存のフォールバックを取る。
  - **能力の表は3つあり、突き合わされている**: `MAPLIBRE_CAPS`（`js/geo-engine.js`）・`CESIUM_CONTRACT.capabilities`（同）・
    `CESIUM_CAPS`（`js/cesium-engine.js`）。`tests/engine-capability-contract-checks.test.mjs` が AST から読んで、3 表は同じキー集合、
    Cesium の 2 表は値まで一致、宣言だけの契約はアダプタが拒む能力を主張できない（`solid3d`——契約が true だと `js/volume3d.js` の
    `canSolid()` がフォールバックを失う）ことを確かめる。

### 1.3 バックエンド・言語

- バックエンドは **Supabase**（DB・認証・Edge Functions）。詳細は §6。
- **対応UI言語は9つ**: 英語 (en) / 日本語 (jp) / ドイツ語 (de) / ロシア語 (ru) / スペイン語 (es) /
  繁體中文 (zh) / 简体中文 (zh-hans) / フランス語 (fr) / 韓国語 (ko)。
  **9言語すべてが、計測されている全ての面で 100% である**（keyed 421/421・読み物ページ 463/463・
  位置引数 7,336/7,336・inline 6,000/6,000）。地名ラベルも全言語対応。
  ただし門（`npm run check:i18n`）が要求しているのは en+jp の 100% だけで、残る 7 言語は「床」
  （`tests/i18n-coverage-floor.json`。減ることを拒み、増えたら上げることを要求する）で支えられている——方針の正本は
  `CONSTITUTION.md` §7、機械の正本は `scripts/lang-policy.mjs` の 1 行。詳細は §10。
