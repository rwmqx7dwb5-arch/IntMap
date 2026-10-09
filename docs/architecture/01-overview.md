# IntMap — 現状仕様書 §1 概要 (Overview)

> **現状仕様書の §1。** 案内図は [`Architecture.md`](../../Architecture.md)（§ → ファイルの表）。**節番号は案内図と共有している**
> ——他の文書・コード・テストが書く「`Architecture.md` §1.x」は、このファイル（と案内図の表が同じ行に挙げる文書）の見出しを指す。
> 今どうなっているかだけを書く。変更履歴・ラウンド番号・PR 番号は書かない（`npm run check:docs` の `arch-rounds` がこのファイルも読む）。

## 1. 概要 (Overview)

IntMap は、世界のニュース・気候・人口・経済・地政学データを一枚の地図に重ねて表示する、
**フロントエンド全部入りのWebアプリ**です。

### 1.1 ビルドと配信

- **本体は `index.html` ＋ `css/` ＋ `js/` ＋ `src/`。** 本数と大きさは変更のたびに動くので散文に書かない——`npm run check:docs` の `app-size` が毎回実測して印字し、`js/` の 1 本ずつは [`docs/FILES.md`](../FILES.md) が持つ。
  ビルドは **Vite 8**（束ねるのは **Rolldown**、JS の変換と最小化は **Oxc**、CSS の最小化は
  **esbuild**——チャンクの置き場と CSS の最小化器の理由はこの節の下のほうの項）。`npm run build` → **`dist/`**（ハッシュ付き・最小化・チャンク分割）が
  **GitHub Pages で配信される実体**であり、リポジトリのソースツリーそのものは配信されない。
  `dist/` は `.gitignore` 済み＝**ビルド成果物はコミットしない**。
- `index.html` は**プログラムではない**。マークアップ＋ブート用の `<script>` ＋
  `<script type="module" src="/src/main.js">` だけで、アプリ本体は `js/app-body.js` にある。
- ⚠⚠ **配信が入れ替わると、開いているタブの遅延チャンクは 404 になる——そこには受け手が要る。**
  `dist/` のチャンク名はハッシュ付きなので、タブが開いたまま次の版が着地すると、その文書が名指して
  いるファイルは**もう無い**。Vite はこれを `window` の **`vite:preloadError`** で知らせる。
  `index.html` がそれを受けて、**押せる**再読み込みの案内（`.im-reload`）を 1 回だけ出す。
  ⚠ **案内の文は、版を確かめてから選ぶ。** listener は判定を `js/lazy-modules.js` の
  `window.__imChunkFailed`（`chunkFailureVerdict` / `makeChunkFailureCheck`）に渡し、それが配信中の
  `index.html` を `cache:'reload'` で取り直して `__imBuild` を比べる——**印が違えば**「新しい版」、
  **同じ（または読めない）なら**「一部を取得できませんでした。再読み込みすると再試行します」
  （⚠ 黙らない。失敗した URL はタブの寿命いっぱい失敗したままだから——下の「忘れる」の項）、
  **文書を取れなければ**オフライン扱いで案内を出さず、問いも消費しない。確かめるのは **1 タブ 1 回**
  （起動時の先読みとクリックで同じチャンクが続けて失敗する——実測 1 モジュールで 3 回）。
  `cache:'reload'` は HTTP キャッシュも詰め直すので、案内の再読み込みは今の版を読む。判定が
  まだ無い時点の失敗は `load` まで待ち、それでも無ければ従来の（確かめない）案内を出す。
  ⚠ 既存のトースト（`.sat-toast`）は `pointer-events:none`（地図のドラッグを食わないため）なので、
  **中にボタンを置けない**。だから別の器で、起動画面より上（`z-index`）に出す——起動中にチャンクが
  404 すると splash が残るから。⚠ **`preventDefault()` してはならない**——import は reject し続けな
  ければ `js/lazy-modules.js` が「無い」ことを学べない。⚠ **オフラインのときは出さない**（新版の
  配信ではないから。そこはパネル自身の「接続を確認してください」が正しい）。
  同じ器が、**手元が古い版だと分かったとき**（`window.__INTMAP_STALE`）にも使われる。9言語。
- **ビルド印はビルドが書く。** `index.html` のソースは `window.INTMAP_BUILD` と `window.__imBuild` に
  **同じ置換記号**（`__INTMAP_BUILD_STAMP__`）だけを持ち、`scripts/build-stamp.mjs`（vite プラグイン。
  `vite build` でも `vite` でも走る）が **`<ビルドした commit の committer 時刻, UTC>Z-<短い sha>`** に
  置き換える。main は merge で進み、各 merge の時刻はそれが着地した時刻なので、**印の順序はサイトの
  順序**になる（ビルド機の時計は使わない——古い commit を建て直すと古いコードが最新を名乗るから）。
  起動時の比較（`index.html` のインライン）は**その時刻**で行い、この端末が既に見た印より古い印を
  配られたら（＝古い写しがキャッシュから出た）キャッシュを捨てて 1 回だけ再読み込みし、それでも古ければ
  上の案内を出す。印を持たない旧形式の保存値（`YYYY-MM-DD-R<n>`）は**どの生成印よりも古い**と扱い、
  置換されずに配られた頁（時刻を読めない印）は**何も捨てない**。バグ報告（`js/feedback.js`）と
  性能 HUD（`js/perf-hud.js`）は同じ値をそのまま載せる——sha でどのコードかが分かる。
- ⚠⚠ **……そして「エントリそのものが 404」は、その受け手には見えない。**
  `vite:preloadError` を発火させるのは Vite の preload helper＝**`assets/main-<hash>.js` の中身**なので、
  **404 したのがエントリ自身なら、案内を出すはずのコードが届いていない。**
  実測（本番）: GitHub Pages は **`Cache-Control: max-age=600` を全応答に**返す——`index.html` も
  `sw.js` も、**名前にハッシュを持つ不変の資産も同じ値**。ファイル種別で変わらないことが、これが
  **GitHub の方針でこちらに指定手段が無い**ことの証拠であり、「`index.html` だけ no-cache」は
  選択肢として存在しない（`<meta http-equiv="Cache-Control">` は HTTP キャッシュに効かない）。
  ⇒ **配信の入れ替え後 最大10分、戻ってきた読者のブラウザは自分の HTTP キャッシュから古い文書を
  返しうる**。その文書が名指すハッシュ付き資産はもう無い＝**アプリが1バイトも起動しない**。
  `index.html` の **`__imDocStale()`**（インライン。`assets/` に置けない——**それが欠けている当のもの**）が
  エントリの `<script type="module">` の失敗だけを捕まえ（capture 相。resource error は bubble しない）、
  **キャッシュを迂回して自分自身を取り直し、サーバーの文書が別のエントリを名指しているときに限り**
  1回だけ再読み込みする。⚠ **遅延チャンクの 404 には触らない**——そちらはアプリが生きていて読者の
  地図位置や Atlas の会話を持っているので、**押せる案内**（上）が正しい。
  ⚠ **一度きりの印（`sessionStorage.intmap_doc_bust`）は消さない。** 復帰しても古い文書は
  キャッシュから消えず残り10分は新鮮なままなので、印を戻すと同じタブの次の遷移でまた同じ文書を
  受け取り、**ループになる**（実測）。2回目以降と、確認が取れない場合（サーバーが本当に失っている・
  取得できない・保存領域が無い）は再読み込みせず案内を出す。
- ⚠ **取得の失敗は恒久的な答えではない。** `js/lazy-modules.js` の `need()` は解決値を `P[name]` に
  記憶するが、**ダウンロードの失敗は忘れる**（短い窓だけ抑止する。ホバー行や描画ループは1秒に何度も
  訊きうる）。⚠ 先読み（`hint()`）が開けた窓は**明示の `need()` は無視し、先読みは尊重する**——
  「先読みが外したせいで本クリックが死ぬ」を作らないため。
  ⚠ **ファイルが届いた後の失敗は忘れない**（factory が無い・投げた・何も公開しなかった）。
  ブラウザが既に評価したモジュールを再 import しても何も再実行されないので、再試行できるのは
  半分だけ mount された状態への `mount()` 再実行であって、それは直すより壊す。
  ⚠⚠ **そして「忘れる」は「取り直せる」ではない。** 実測（Chromium・同一ページ）:
  404 のあとサーバが復旧しても**同じ URL の `import()` は失敗したまま**で、
  **クエリを変えた URL だけが成功する**（`?r=1` → ok）。ES モジュールの仕様どおり、
  失敗はモジュールマップに記録され、その記録は URL 単位で残る。Vite の code-split は
  `import()` の指定子がリテラルであることを要求するのでクエリを足せない ⇒
  **404 したチャンクを取り戻す手段は再読み込みだけ**であり、`P[name]` を捨てる意味は
  「モジュールマップに記録される前に失敗したもの（依存の失敗・自前の判定）を再試行できる」ことと、
  **一度の 404 がタブの寿命いっぱい `false` を返し続けるのをやめる**ことにある。
  だから案内（上の `.im-reload`）が本体の手当で、忘れることはその補助である。
- **インストールできるアプリとして配る。** `manifest.webmanifest` と `icons/` は
  `scripts/build-app-manifest.mjs` の**生成物**で、名前は `<title>` の語標（「IntMap」は訳さない）、
  色は `css/intmap.css` の `--bg-color`（暗色＝アイコンの地の色）、アイコンは `IntMap.Icon.png` から導く。
  `index.html` は `vite-ignore` でそれらを**そのまま**指し（Vite に `assets/` へハッシュ化させると、
  manifest の中の相対パスが `assets/` 基準で解決されて壊れる）、`STATIC_ASSETS` がコピーする。
  theme-color は OS の配色ごとに 2 本で、アプリ内のテーマ選択は `js/installable-app.js` が実行時に
  上書きする。`--check` が index.html のそれらの値も源と照合する。
  ⚠ 暗色のマークは 384 px しか無いので、512 px は**拡大**である（より大きい原版が来れば無変更で置き換わる）。
- **Service Worker はアプリ本体の殻（app shell）も持つ——オフラインで開くためだけに。**
  一覧は手で持たない: `scripts/app-shell.mjs`（vite.config.js の `appShell`、copyStatic の後）が
  build-report の **eager 集合**（＝`check:perf` が測るのと同じ定義）＋`dist/index.html` と manifest が
  名指すもの＋eager CSS の `url()` を導出し、ビルド印と一緒に `dist/sw.js` に書き込む。
  ビルドしていない `sw.js`（dev サーバ）は殻を持たず、タイルのキャッシュだけである。
  殻のキャッシュ名はビルド印を含むので、配信のたびに新しい worker になり、activate が前の殻を消す（古い版を生き残らせない規則のまま）。
  install は**この build の文書だけ**を貯める（`cache:'reload'` で取り、印を確かめる——Pages の
  `max-age=600` が前の文書を返しうるため）。前の殻が持つ同名のハッシュ付き資産は**引き継ぐ**（再取得しない）。
  答え方は 3 通り: **ハッシュ付き資産**は殻から（再検証しない——名前が中身）、**manifest とアイコン**は
  殻から答えて裏で取り直す（stale-while-revalidate）、**文書（navigation）はブラウザがオフラインと言う
  ときだけ**殻から答える。⚠ オンラインの navigation には触らない——`DECISIONS.md` の判断（温まった起動に
  往復を足さない・ハンドラの不具合で戻ってきた読者を締め出さない）はオンラインの経路についての理由で、
  オフラインでは代わりがブラウザのエラー頁しか無い。⚠ 「つながっていると言いながら通らない」回線
  （`onLine` が true のまま失敗する）では殻は答えない——その時は従来どおりのエラーになる。
  殻から開いた頁は Service Worker に `shell-status` で訊いてそれを知り、**オフライン通知**
  （`#im-offline`、`.im-reload` と同じカード）を出す——取得できなかったデータが無言の空白に見えないように。
  回線が戻ると「再読み込みで取得し直す」に変わる。設定 ▸ About & support の「アプリとして追加」は、
  Chromium が渡した `beforeinstallprompt` を保持して押されたときに出し、iOS では共有シートの手順を 1 文で
  示し、どちらも無い環境と既にインストール済みの窓では**出さない**（`js/installable-app.js`）。
- **持ち歩ける地図（オフライン）——`js/offline-maps.js`・`js/offline-plan.js`。** 設定 ▸ キーボードショートカットの下の
  ボタンと Atlas の `settings.offlineMaps` が同じダイアログ／関数を開く。表示範囲の**地形（terrarium）タイル**と、
  開いたレイヤーの**IntMap 自身のファイル**（`data/`・`assets/`。ブラウザの resource timing から**発見**し、殻が既に持つものは除く）を、
  ページが所有するキャッシュ `intmap-page-offline-v1` に保存する（`intmap-page-` 接頭辞なので activate は消さない）。
  **保存の前に大きさを言う**——タイル数は範囲から厳密に、1 枚の重さは範囲の中心の数枚を**実測**して「約」を付け、
  端末の空きに収まらない細かさは出さない。粗い細かさから順に保存するので、中断しても**範囲の全体が粗い細かさで残る**。
  失敗したタイルは数えて欠けを言い、同じものを黙って取り直さない。保存済みの一覧と削除（他の保存が使うファイルは残す）。
  ⚠ **供給元のファイルを保存してよいかは台帳が述べたものだけ**——`scripts/outbound-hosts.json` の各ホスト行の `offline`
  （allowed・kind・pathPrefix・規約の URL・理由）を `scripts/offline-sources.mjs` が `data/offline-sources.json` に導出し、
  ページはそれだけを読む（手書きの許可一覧は無い）。述べていないホストは**拒否**（沈黙は許可ではない）、「いいえ」と
  述べたホスト（OpenFreeMap：許可なく自動でデータを集めてはならない）は**規約へのリンク付きで保存しないものとして**
  ダイアログに出す。したがって基図のベクタタイル・衛星画像・天気や航空機などの生きたデータは保存されない
  （読者が既に見たタイルをブラウザのキャッシュが持つのは従来どおり）。**sw.js は保存した領域を、ブラウザが
  オフラインと言うときだけ**返す（殻と同じ規則——オンラインの経路は 1 バイトも変わらず、保存した写しが新しい取得より
  優先されることもない）。地形タイルは 5 つのホスト別名で要求されるので、保存も参照も**1 つの綴り**
  （`offlineKey`）に畳む。門は `tests/keyboard-and-offline-checks.test.mjs` ①②③ と
  `tests/keyboard-and-offline.spec.js`（オフラインにした context で保存した地形タイルが返る）。
- **ファイル同士は `import` で結ぶ。読み込み順は import のグラフが決める。** 依存は `import`／`export` と
  依存注入（`HOST`・`provideLayerKind` のように、使う側へ渡す）で書き、`window` は**後方互換とデバッグの窓口**
  （ブラウザの spec・コンソール・静的ページのインライン script が読むもの）に限る。`src/main.js` に残る
  `import` の行は「まだ import の辺を持たない副作用モジュール」だけで、その一覧は手で覚える順序ではなく
  移行の残りである（`node scripts/module-graph.mjs --entry` が 1 行ずつ「なぜ残るか」を言う）。
  規約・移し方・門は [§3 ファイル構成](03-files.md) の「ファイル同士の結び方」。
- **実行時依存は npm から取る**（CDN の浮動タグは使わない）。`src/vendor.js` が
  `maplibregl` / `turf` / `topojson` / `mlcontour` / `supabase` / `sb` を同じグローバル名で
  再公開するので、呼び出し側は1行も変わらない。KaTeX と html2canvas は動的 import で別チャンク。
  `package.json` の `dependencies` がアプリに入る依存の唯一のリスト（`src/vendor.js` の見出しは各パッケージの
  **主版だけ**を書く——正確な版の正本は `package.json` と lock）。
  ⚠ **maplibre-gl は 6 系で ESM 専用**。default export が無いので `import * as maplibregl` で取る。
  配布は 3 本——本体 `maplibre-gl.mjs`・worker `maplibre-gl-worker.mjs`・その両方が import する
  `maplibre-gl-shared.mjs`——で、本体は worker を **module worker** として起こす。`vite.config.js` の
  `maplibreSharedWorker` が worker を**同じビルドの entry チャンク**として出し（`emitFile({type:'chunk'})`）、
  `src/vendor.js` は `virtual:maplibre-gl-worker-url` からその URL（ビルドの hash つき）を受けて最初の Map より前に
  `setWorkerUrl` で渡す。worker と本体の両方が import するもの（shared と、worker が届く束ね器の補助）は
  **`maplibre-gl-shared` チャンク 1 本**になり、worker はそれを import するだけなので **shared はネットワークを
  1 回しか渡らない**（worker の import は、ページが満たした HTTP キャッシュが答える）。
  何を shared に置くかは**worker の静的 import のグラフ**が決め（名前の一覧ではない）、worker が読むチャンクに
  worker のグラフの外のモジュール（本体の主スレッドのコード、top-level で `document` に触れる modulepreload
  polyfill）が入ればビルドが止まる。`vite dev` にはチャンクが無いので、同じ virtual モジュールが Vite の
  dev worker URL（`?worker&url`）を返す。素の `?url` で写すと兄弟ファイル無しで worker が最初の import で死ぬ。
  worker も shared も同一オリジンなので CSP の `worker-src 'self'` のままで足りる。
  ⚠ **他のモジュールが自分で動的 import する依存も、そこに宣言する。** 警報レイヤーの
  `polygon-clipping`（「発表なし」の形＝区分 − 発表 と、灰色斜線の形＝国 − この層が答えている単位 の
  2つを計算する。`js/world-packs.js` が最初にレイヤーを点けたときに別チャンクで取る）は、かつて
  Turf 6 の `union` の下にも入っていて、Turf 7 の `union` はもう使っていない——**推移的に届いているものは
  依存ではない**の実例で、上流が版を変えたら実際に消えた。
- **Turf は関数ごとのサブパッケージから名前で取り、`window.turf` に載せる**（全部入りの `@turf/turf` は
  import しない）。起動時の `geo` チャンクに入るのは**入口から静的 import だけで届く** `@turf/*` と
  `topojson-client` で、`vite.config.js` の `geo` group の `name()` がそれを**モジュールグラフから判定する**
  （名前の一覧は持たない）。重い 3 つは**要るときに取る**: `convex`・`buffer`（`@turf/jsts`）は
  `window.turf.ensureHeavy()`、`union`（polyclip-ts ＋ bignumber.js）は `window.turf.ensureUnion()`。
  ⚠ 公開する `turf.bbox` は**座標から測る**（Turf 7 単体はオブジェクトが宣言する `bbox` 欄をそのまま返す）。
- **Supabase クライアントは `createClient` で作るが、Storage と Functions のクライアントは束に入れない。**
  アプリはどちらも使わない（Edge Function は `fetch` で直に呼ぶ・バケットは無い）ので、`vite.config.js` の
  alias が `@supabase/storage-js`・`@supabase/functions-js` を `src/supabase-unbundled-stub.js` に向ける
  ——触れた瞬間にその旨を述べて投げるスタブで、`tests/deps-runtime-majors-checks.test.mjs` が
  「アプリの誰も触れていない」ことを先に測る。`admin.html` は SDK 自身の UMD 版（完全）を読む。
- **Supabase の接続先は `src/vendor.js`**（`window.SUPABASE_URL` / `window.SUPABASE_ANON_KEY`）。
  `admin.html` はバンドラを通らない別ページなので、同じ2つを自分のインライン script で持つ。
  どちらも publishable(anon) キー＝**公開前提**で、保護は RLS が行う（§17）。
- **CARTO 基図のキーは `js/carto-basemap.js`**（`window.CARTO_BASEMAP_KEY`）。2026-08 に CARTO が
  ラスタータイルへ API キーを要求し始めた。⚠ **キー無しの応答は失敗しない**——200 のまま
  「API KEY REQUIRED」の透かしを焼いた PNG が返るので、状態コードもエラーハンドラも鳴らない。
  URL を組み立てる口は `window.cartoTileURL()` / `window.cartoTiles()` の2つだけで、
  `js/app-body.js` / `js/compare.js` / `js/playground.js` / `js/layer-previews.js` は
  ホスト名を綴らない（`tests/carto-basemap-checks.test.mjs` ② が綴りそのものを禁じる）。
  ⚠ **`src/vendor.js` ではなく専用ファイルなのは、基図の鍵と URL 組み立てが 1 か所に閉じるため**
  （かつては app shell の行数予算がその理由だった。行数の天井は撤去され、shell の広さは
  `npm run check:surface` が `IM_HOST` の項目と `window.*` の公開名で測る——この節の下）。
  ベクタ移行もこのファイルに来る。
  これも**公開前提**の鍵——静的サイトはタイル URL を読み手のブラウザへ渡すので、基図キーが
  秘密である配置は存在しない。無料枠は 5,000,000 タイル要求/月（ラスタ＋ベクタ合算）。
- **ソースマップは本番に出さない**（`vite.config.js` の `build.sourcemap` は false）。
- **ビルドは自分を計測する。** `vite.config.js` の `buildReportPlugin()`（`scripts/build-report.mjs`）が
  束ね器（Rolldown）の最終グラフから **eager**（`index.html` のエントリ＋その静的 import の推移閉包＝Vite が
  `modulepreload` を出す集合）と **async** を導出する。eager には**起動経路が立ち上げる worker**も入る
  ——eager チャンクに描画された `?worker&url` モジュールが名指す worker アセットと、eager のモジュールが
  名指す **emitted entry チャンク**（MapLibre 6 の worker。HTML のエントリではないので推移閉包からは見えないが、
  最初のタイルの前に毎回取得される）とその静的 import の閉包。この時点のモジュールの描画コードは hash の
  placeholder を持つのでチャンクの `preliminaryFileName` でも照合し、どのモジュールも名指さない emitted entry は
  ASYNC に落とさずビルドを止める。
  関数の中で `new Worker(new URL(…))` する worker（航空機・放射線・衛星・津波）はこの形ではなく入らない。
  raw / gzip / brotli とモジュール別の内訳を
  `.perf/build-report.json`（追跡対象外）へ書く。`npm run check:perf`（`scripts/perf-budget.mjs`）が
  それを `tests/perf-baseline.json` と突き合わせる。
  ⚠ **2つの半分は別々に見る。** eager・async（合計と chunk ごと）・`dist/` の合計が、それぞれの天井を持つ。
  **最大 chunk は Cesium（4.7 MB）だが既定セッションは1バイトも取らない**ので、
  「いちばん大きい chunk」を見るゲートは起動費用について何も言っていない。
  ⚠ **天井を上げるのは PR、下げるのは `main` の CI。** PR が落ちるのは、ある行が天井＋幅
  （`max(天井×0.5 %, 2 kB)`。`requests`・`modules` は個数なので幅 0）を**超えて増えた**ときだけで、
  減った・幅の中で動いた PR は天井ファイルに触れずに緑。上げる判断は PR が `--update` で述べる
  （**超えた行だけ**を書き換える）。`main` への push ごとに CI の `build` ジョブがそのビルドの実測を
  artifact に残し、`.github/workflows/perf-ceiling.yml` がそれに `--tighten`（全行を `min(天井, 実測)`・
  新しい chunk に天井・消えた chunk の行を削除。**上げない**）をかけ、幅を超えて下回った行があれば
  bot の PR にして `.github/actions/land-bot-pr`（衛星カタログの着地と共有）で着地させる。
  着地は `require-current`——測った `main` の上にまだ乗っているときだけ merge し、`main` が動いたら
  次の run に譲る。着地後、どの天井も実測より幅 1 つを超えて上には残らない（`check:perf` が毎回、
  天井の上に何行あるかと最も緩い行を幅の単位で印字する）。⚠ 周期は「`main` の CI が走る次の push」で、
  `GITHUB_TOKEN` の merge（bot 自身・衛星カタログ）は CI を起こさないので、その間は次の人の push まで延びる。
- **共有窓口の広さも計器で見る。** `npm run check:surface`（`scripts/global-surface.mjs`）が、
  `js/app-body.js` の `IM_HOST` の項目（getter／setter／後付けの代入）と、`js/`・`src/` が
  `window.*` に代入する公開名を**名前で** `tests/global-surface-baseline.json` と両方向に照合する。
  コメント・文字列・正規表現リテラルを消すのは acorn の字句解析で（`/` が正規表現か除算かは文法にしか
  分からない）、読めないファイルは推測せずにそのファイル名で落ちる。
  増えた名前は「新しい結合」で、`DEV-NOTES.md` に理由を書いて `--update` で受け入れる。減った名前は
  「基準が古い」で、同じく `--update` がその縮小の受領証になる。
  **公開名には読み手が要る。** 同じゲートが、代入以外に読み手を 1 つも持たない公開名を `unread` として
  基準に名前で持ち、両方向に照合する。読み手とは `js/`・`src/`・`tests/`・`scripts/`・トップの HTML の
  コード（コメントは消し、文字列は残す——`onclick="_x()"` は読み手）での出現と、`Object.keys(window)` を
  正規表現で絞って列挙するコード（Atlas のモジュール目録など。ソースから発見し、目録が要求する入口を
  公開元ファイルが定義していれば読まれている扱い）。コンソール専用の診断は `unread` に残る。
  ⚠ **行数の天井は撤去した。** かつての `tests/r168` #8 と 20 か所の写しが app shell（8,050 行）・index.html・
  `js/atlas-console.js`・`js/app-body.js`・`js/widgets.js` に持っていた行数の上限は、
  1 行に複数の `import` や `case` を畳ませただけで、初期配信量も結合の広さも測っていなかった。
  初期配信量は上の `check:perf`、結合の広さはこの `check:surface` が測る。
- **`js/` のモジュールの形は普通の ES Module でよい。** かつて `tests/r175-checks` ③ が
  「export しないトップレベル宣言」を禁じていた（classic script から module へ移した回の罠を
  捕まえるため）。その規則は形式の規則になっていて、`js/gis-core.js` と `js/gis-runtime.js` が
  互いを import する・`js/runtime.js` が Map を関数のプロパティに吊るす、という形を生んだ。
  いまは `scripts/check-split-scope.mjs`（自由識別子が何にも解決しないことを捕まえる）と
  `scripts/export-readers.mjs`（export に読み手が居ること。読み手は `js/`・`src/`・`scripts/`・
  `tests/` の全部）が、その規則が守っていた**性質**のほうを測る。
- **行は起動時、本体は初めて使われたとき。** レイヤーの**行**（Layers の棚・チェックボックス・Atlas と
  共有リンクとセッション復元が名前を引く相手）は起動時に要るが、その行が点ける**本体**は要らない。
  そう切ってあるもの：世界データ層（`js/world-packs-rows.js` が行・共有ツールキット `_ui`・共有リンクの
  選択を持ち、5 層の本体 `js/world-packs.js` は `worldPacksBody`）と宇宙エクスプローラ
  （`js/space-approach.js` がズームの床のジェスチャー・ゲージ・`window.IntMapSpace` のファサードを持ち、
  本体 `js/space.js` と、それだけが読む `js/space-{events,bodies,cosmos}.js` は `spaceBody`）。
  行側の規則は 1 つ——`js/lazy-modules.js` の `lazyBody(ask)`：クリックは**到着の Promise 1 本**に
  **押した順**に並ぶ（到着前の on→off が「遅れて on」にならない）、何も取っていないときの off は
  何も取らない、到着後は**同期**に戻る（チェックを入れて同じターンで状態を読む呼び手がそのまま動く）、
  到着の失敗は覚えない。届かなかったときは `lazyRowFailed` が行を外して言葉で言う。
  エクスプローラの取得は**ゲージの予告が出た時点**（床の 2 ズーム手前）で始まり、世界データの取得は
  **行にポインタが乗った時点**で `IntMapLazy.hint` が始める。ファサードは到着前に `state()` を
  `loaded:false` で答え（本体の答えを作らない）、到着した本体が自分の入口をファサードへ渡す。
  ⚠ **静的な到達で決まる。** バンドラは入口から static import で届くモジュールを入口チャンクに入れるので、
  遅延化は「`src/main.js` から外す」では終わらない——`tests/startup-lazy-layers-checks.test.mjs` が
  `LAZY_REGISTRY` の全項目について、入口の static import 閉包に入っていないことを実際のグラフで測る。
  ⚠ **eager と遅延の両方が読むモジュールから、もう 1 つの共有モジュールへ static import を張らない**
  （`vite.config.js` の fetch-deadline-layer の項）。`js/star-catalogue.js` が `js/data-door.js` を import した
  版は eager チャンクが 7 → 9 本になった（`fetch-deadline`・`proxy-fetch` が main に畳めなくなる）ので、
  扉は `window.IntMapDataDoor` 経由で読む。
- **`data/stars.bin` の読み手は 1 つ。** `js/star-catalogue.js` が `js/data-door.js`（`as:'arrayBuffer'`）で
  バイトを取り、IMSTAR1/2 のレコードを**一度だけ**列（赤経・赤緯・等級・B−V・年周視差）に復号する。
  地球の背後の星空（`js/space-sky.js`）とエクスプローラ（`js/space.js`）はそこから自分の形を作る。
- **Noto の規則シートは描画をブロックしない。** `index.html` の Google Fonts `<link>`（JP・SC・TC × 4 ウェイト、
  実測 1,386,296 B の CSS・gzip 378,340 B）は撤去し、`js/map-typography.js` の `ensureWebFonts()` が
  **言語が決まった後**（DOMContentLoaded と `intmap-lang`）に、その読者の面（`_readerFaces()`——ラベルが描く
  面で、UI の面の上位集合）のうち `document.fonts` に宣言の無いものだけを注入する：ja と Latin の UI は
  JP＋SC、繁体は TC＋SC、簡体は SC、韓国語は SC（Pretendard は同梱）。⚠ SC は「中国語用」ではない——
  他国の現地名を描く `HAN_ALL` が SC なので、どの読者の地図にも要る。⚠ 最初の数フレームは
  `css/fonts.css` のシステム CJK フォールバックで描かれうる（起動画面の下）。MapLibre の TinySDF が
  面の到着前にラスタ化した CJK グリフを保持する競合は、フォントファイル（unicode-range で初使用時に取得）
  にもともとあったもので、規則シートの到着もそこに入った。
- **遅延モジュールは 1 モジュール 1 定義。** `js/lazy-modules.js` の `LAZY_REGISTRY` が正本で、
  1 項目が「公開する global・literal な `import('./x.js')`・factory を回す `mount`・factory を持たない
  `self`・一緒に取る `also`」を持つ。loader の取得・mount・検証はこの表を読み、`src/main.js` の
  boot guard は `LAZY_NAMES` / `CARRIED_NAMES` を import して自分の一覧を導く。以前は 5 つの表
  （`PUBLISHES`・`fetchModule`・`mount`・`ALSO`・`SELF_PUBLISHING`）と `src/main.js` の
  `LAZY_FACTORIES` を手で揃えていた（1 モジュール足すのに 4〜6 か所）。
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
  ハッシュ無しでも要る KaTeX と Inter の写しなど）。ビルドが要るので `check:perf` と同じ扱い——
  CI では build と同じ shard、`npm test` では browser 半分の最後（`npm run build` の後）で走る。
- ⚠ **同じデータを2つの形で配ってはならない。** `data/` はディレクトリごと `dist/` へ複写されるので、
  1つのデータセットの2表現がどちらも入りうる。`data/ecoregions_2017.js`（`window.__ECOREGIONS_2017`）は
  隣の `.geojson` と**バイト同一**なので `STATIC_EXCLUDE` で配布から外してある——リポジトリには
  残す（消したのは配布であって記録ではない）。`js/layer-packs.js` の `window.__loadEcoregions` は
  `fetch` を先に、`<script>` を後に試す——ただし読み手は**比較ウィンドウ（`js/compare.js`）だけ**。
  地図の `eco-regions` ソースには **URL をそのまま渡す**（`addSource({type:'geojson', data:'data/ecoregions_2017.geojson'})`）。
  MapLibre は worker で取得・parse し、Cesium のアダプタ（`js/cesium-engine.js` `addSource`）も文字列の `data` を
  自分で取る——2 エンジンとも同じ綴りで分岐は無い。⚠ MapLibre 6 は URL で読んだ GeoJSON を
  **構造化複製でページへ返す**（`getData()` のため）ので、ページの仕事はゼロにはならない：消えたのは
  9.76 MB の `JSON.parse` と worker への送り出しの直列化。取得の失敗はレンダラの `error`（`sourceId`）で
  受けて同じ文言を出し、ソースを外して次のチェックで取り直す。
- ⚠ **`resolve.alias` は dev サーバの事前バンドルに届かない。** 事前バンドル（Vite 8 では Rolldown）は
  `satellite.js` の `imports` 表を自分で辿るので、ビルドでは stub に差し替わる Emscripten 入口
  （`pthreads-release`）を**本物のまま**束ねる。`optimizeDeps.exclude` に置いて、dev もビルドと同じ
  alias 経路を通す（esbuild だった頃は top-level await で `vite` が起動すらしなかった）。
- ⚠⚠ **チャンクの置き場は「名指し」ではなく「優先度」で決まる。** `vite.config.js` の
  `build.rolldownOptions.output.codeSplitting.groups` が 4 つの名前付きチャンクを作る——
  `maplibre-gl`（優先度 4。束ね器の補助モジュール＝`\0` で始まり node_modules を含まない id もここ）、
  `geo`（3。`@turf/*` と `topojson-client`、ただし `turf-jsts`・`@turf/buffer`・`@turf/convex` などの重い側は除く）、
  `supabase`（3）、`cesium`（1。`cesium`・`@mapbox/vector-tile`・`pbf`）。
  Rolldown の group は**捕まえたモジュールの依存も再帰的に取り込む**ので、優先度を付けないと遅延の
  `cesium` が preload helper・Oxc の class-field 補助・`topojson-client`（Cesium の GeoJsonDataSource が依存）
  を取り込み、main がそれを import した瞬間に**第2エンジンが丸ごと eager になる**（実測: eager raw
  4.78 → 9.45 MB、requests 6 → 8）。高い優先度の group が先に取り、低い group は取り返せない。
  ⚠ **group を使うと Rolldown は自分の runtime（`\0rolldown/runtime.js`、約 1.3 kB）を独立チャンク
  `rolldown-runtime` に置き、どの group にも入れさせない**——複数のチャンクが消費するとき、どれかへ畳むと
  静的な循環になりうるからで、畳めるのは「唯一の消費者」だけ（ここでは main・`maplibre-gl`・`supabase`・`geo`・`cesium` ほかが消費する）。
  したがって eager は **main＋`maplibre-gl`＋`maplibre-gl-shared`＋`geo`＋`supabase`＋`rolldown-runtime`** の
  6 本と CSS 2 本、それに **MapLibre の worker チャンク 1 本**（`maplibre-gl-worker-*.js`、約 19 kB）。
  `maplibre-gl` には 6 系の `maplibre-gl.mjs`、worker の URL だけを持つ小さなモジュール、worker が使わない補助
  （modulepreload polyfill・Oxc の補助）が、`maplibre-gl-shared` には `maplibre-gl-shared.mjs` と、worker 自身の
  `import()` を Vite が包むために worker も使う preload helper が入る。worker チャンクは shared を持たず、
  `maplibre-gl-shared` を import する（開発記録 `2026-09-28-maplibre-shared-worker`）。
  eager に入る**ソースモジュールの集合**は Rollup 時代と同一で、違いは束ね器の仮想モジュールだけ
  （CommonJS ラッパーが無くなり、Oxc の補助と runtime が加わった）。ただし MapLibre だけは 6 系で
  1 本の UMD から上の 3 本の ESM（本体・shared・worker）と worker の URL モジュールになった。
- ⚠ **`resolve.mainFields` は `module` を `browser` より前に置く。** Vite 8 は「`browser` が UMD なら
  `module` を選ぶ」という中身の嗅ぎ分けをやめ、既定の順序（`browser` が先）に従う。そのままだと
  `polygon-clipping`・`turf-jsts`・`html2canvas` が ESM から UMD に替わる。この node_modules で `browser`
  文字列と `module` を両方持ち `exports` の無いパッケージは、**全部 `browser` 側が非 ESM**
  ＝以前の Vite が `module` を選んでいた場合なので、順序の入れ替えで以前と同じ解決になる。
- ⚠ **CSS の最小化は esbuild（`build.cssMinify: 'esbuild'`）。** Vite 8 既定の Lightning CSS は、
  `backdrop-filter: X; -webkit-backdrop-filter: X;` の並びで**標準のほうを捨てる**（どの target でも）。
  Chromium は接頭辞付きを受け付けない（`CSS.supports` が false、計算値 `none`）ので、サイドバー・
  ドロップダウン・シートのぼかしが Chrome / Edge / Firefox で消える。esbuild で最小化した CSS は
  以前の配信物とバイト同一。esbuild は `devDependencies` に明示してある（Vite 8 はもう連れてこない。
  node 検査の 2 本も TypeScript の型除去と IIFE 化に使う）。
- **オープンデータと埋め込み API — 静的配信の範囲で、他所のページが IntMap を使う経路。**
  サーバを持たない（GitHub Pages）ので、API は**ビルドが書くファイル**と**ブラウザの postMessage** でできている。
  - **`api/v1/`（ビルドが書く・コミットしない）。** `vite.config.js` の `publicApiPlugin` が静的コピーの後に
    `scripts/public-api.mjs` を走らせ、`catalog.json`（再利用できるデータセット——ファイルの絶対 URL と大きさ・
    出典が述べるとおりのライセンス・条件〔出典表示／継承／非営利〕・表示する出典の行——と、出さないものとその理由）、
    `countries.json` と `countries/<CODE>.json`（Natural Earth の国コード。各国のファイルは、出すデータセットの
    「鍵の過半が国コードの表」を**発見して**その国の行を集め、節ごとにそのデータセットの条件を持つ）、
    `embed.json`（埋め込みの URL 文法と約束事）を `dist/api/v1/` に書く。並べるファイルは**dist にあるもの**
    （`STATIC_EXCLUDE` で写さないものは載せない）。
  - ⚠ **出すか出さないかは台帳が述べる値で決まる。** ライセンスは `scripts/data-governance.mjs` の
    `rightsTable()`（`check:datagov` と同じ読み方——ビルダーの `GOVERNANCE` 宣言、無ければ束の中の記録）から読み、
    `public-api.mjs` の `LICENCES`（ライセンス識別子ごとに再配布・出典表示・継承・営利利用を述べる語彙）に照らす。
    上流の**すべて**が語彙の知るライセンスを述べているときだけ出し、条件は最も厳しいものが全体にかかる。
    出さない理由は 4 つ: ライセンスを値で述べていない／述べた条件が再配布を許すと確認できない（例「© UNESCO」）／
    出典表示が条件なのに表示する出典を述べていない／ビルドに写されない。**data/ のファイルがサイトから取れること
    （地図が描くための IntMap の利用）と、再利用のために出すことは別の主張**で、後者はライセンスが言うときだけ。
  - **記録が合成ファイルの中で担った部分も値で運ぶ。** 上流の記録が `cite`（出版元が求める引用文）・`contributes:'outline'`
    （輪郭を切っただけで、名前・日付・識別子は持たない）・`rowsFrom`（その記録が行を切りうる最初の日）を述べていれば、
    カタログの `upstreams` にそのまま載る（`read()` の語彙の外なので、同じ上流の原文から位置で取る）。出さないものの
    項目も `paths`（そのファイル）を持ち、パスを持つ読み手が「どの項目がなぜ出していないか」を同じ結び方で引ける。
    国境の記録（OpenHistoricalMap 1689–1885・Cliopatria・historical-basemaps・その後継ぎ）はこの形で述べ、
    ページはそれを行ごとに読んで、ある日の国境を GeoJSON で持ち出させる（`js/border-extract.js`。`docs/architecture/08-ui.md` の引用タブ）。
  - **埋め込み API。** `js/embed-client.js` が約束事 `PROTOCOL`（ホスト→枠の命令 get / state / view / time、
    枠→ホストの ready / state / reply）と、ホストのページが URL で import する `mount()` を持つ（何も import しない
    ——他オリジンから単独で読まれるので。vite が `dist/js/` にそのまま写す）。枠の側は `js/embed-mode.js` の
    `commandHash` が命令を**共有リンクの断片 1 つ**（`js/map-state.js` の encode）にし、貼ったリンクと同じ
    `hashchange` の経路（`js/map-ui.js`。適用中に来たリンクは捨てずに次に回す）で適用する。断片は
    `replaceState` で書き、合成の `hashchange` を送る——枠の履歴はホストの履歴なので、命令でホストの「戻る」を
    増やさない。枠が伝えるのは地図の公開状態（「IntMap で開く」と同じリンク）だけで、送り先は `window.parent`。
  - **開発者向けページ** `developers.html`（と `ja/`）は `scripts/landing.mjs` が生成し、命令とイベントの表は
    `PROTOCOL` から、データセットの表は**ビルドが** `CATALOG_MARK` の位置に埋める（コミットされるページは台帳の写しを
    持たない）。共有パネルの「埋め込み」タブと埋め込みの紹介ページから結び、Atlas は `data.openData`（`openData`）で
    同じ `catalog.json` を読んで答える。

### 1.2 地図エンジン

- 既定のレンダラは **MapLibre GL JS**（Mercator 平面 ＋ Globe 投影）。
- **MapLibre の地図を生成するのは `js/geo-engine.js` の `_newMap` ただ 1 か所**で、`createView`・`createSubView`
  はどちらもここを通る。`_newMap` は呼び手が何を渡しても `attributionControl:false` にする——レンダラ自身の
  帰属表示は遠隔の TileJSON／スタイルの `attribution` を HTML として解釈して書く（5.24 の sanitizer は
  GHSA-jrc7-96c5-q579 で迂回でき、6.4.1 で修正・6.11.1 で許可リスト方式・DOM ノード挿入になった）。
  6 系に上げた今も**マークアップを解釈する書き手を持たない**という形を保つ——修正は上流の 1 実装に掛かった
  もので、IntMap 側の帰属表示はそもそも解釈しない（判断は DECISIONS.md の該当行）。帰属表示を
  求める呼び手（`credit:true`・`attributionControl` の真値・`customAttribution`）には **IntMap 側の帰属表示**
  （`div.map-credit-view`）を付ける: いま描かれているレイヤーと地形が読む source の `attribution` を、
  テキストノードと http(s) の `<a>` だけで組み立てる（マークアップを一切解釈しない）。主地図は従来どおり
  `#map-credit`（DECISIONS.md の帰属表示の行）。
- **レンダラの名を出してよいファイルは `js/geo-engine.js` ただ1つ**（アダプタ＋`IntMapGeoEngine`
  ファサード）。他の js/ 全ファイルは `const GE=()=>window.IntMapGeoEngine;` 経由で
  **契約**（`layers` / `camera` / `coords` / `scene` / `ui` / `render` / `input` / `events`）だけを見る。
  `npm run check:engine` が AST でこれを固定する（構文解析なので、コメント中の "the map. When…" では
  誤検知せず、ローカル変数 `map` も依存とみなさない）。
  ⚠ 契約に無い関数名をアダプタにだけ足すと「2つ目以降」が静かに落ちる——**アダプタに足したメソッドは
  必ず契約側にも出すこと**。
- **アダプタがレンダラの内部に触れる口は 2 つだけ**——`_cam(m)`（MapLibre 6 の Map が合成して持つ Camera、
  `map._camera`）と `_tr(m)`（その transform＝painter が描画に使う transform）。6 系の Map は Camera を継承せず
  `map.transform` を持たないので、行列・遠クリップ面・視点距離（大気の周縁・星空の枠・地平線の遠方・視点の
  位置・高度つき投影）は全部 `_tr` を通る。`isEasing()`（`camera.isAnimating()`）と
  `_elevateCameraIfInsideTerrain`（無制限チルトの地下補正の修理。修理は**カメラ**に置く）は `_cam` を通る。
  視点ピボットのフックは**公開の** `setTransformCameraUpdate` で入れる（Map の `transformCameraUpdate` 欄は
  6 系では読まれない）。高度つきの点の画面位置（`coords.projectAltitude`・`layers.projectMercAlt`＝航空機・
  衛星の hover）は、6.0 で消えた `getMatrixForModel` の代わりに、MapLibre がカスタムレイヤーに渡す投影データを
  シェーダの `projectTileFor3D` と同じ式で CPU 上で通す（平面・球・11→12 のクロスフェードとも）。
  描く側——衛星（`js/orbit-points.js`）・航空機（`js/aircraft-points.js`）・3-D 体積（`js/solid3d.js`）の
  カスタム層——は `js/lifted-projection.js` の `projectLifted` を共有する: 球の半分には m、平面の半分には
  Mercator 単位を渡す（6 系はカスタム層にも globe のクロスフェードを実値で渡すので、1 つの高度では両方を
  満たせない）。拾う位置と描く位置が同じ式であることは同じ spec がキャンバス上で測る。
  **画面の点が地球の上にあるか**（`coords.onSurface(pt)`→ true / false / 訊けなければ null）は `_tr` の
  `isPointOnMapSurface`（球: 視点からの光線が球に当たるか／平面: 地平線より下か・地形があれば地形メッシュ）——
  MapLibre 自身が点を中心にズームする前に訊く問いと同じ。Cesium は pick の光線が地球（楕円体）に当たるか。
  ⚠ `unproject` は地球の外の点にも答える（球の脇の黒い空間は奥の縁、空は地平線の点）ので、押した点を頂点にする
  道具（マイマップ、7.3g）はこちらに訊く。
  これらが**黙って効かなくなっていないこと**は、`tests/maplibre-6-migration-checks.test.mjs`
  （アダプタが Map に対して呼ぶ全メソッドが入っている版に実在する・内部には 2 つの口からしか触れない）と
  `tests/maplibre-6-migration.spec.js`（動いているレンダラに訊く）が測る。
- **地形の高さを読む側は、読んだ回数や時計ではなく標高ソースの状態で読み終える。** 3-D 体積
  （`js/volume3d.js` の `chaseGround`）は `queryTerrainElevation` が標高タイル到着前に **0**（海面と
  区別できない）を返すので、地形ソース（`scene.getTerrain().source`——`js/terrain-water.js` が差し替える）の
  `sourcedata` を合図に次の `render` で読み直し、動いたら塗り直す。`isSourceLoaded` を言った後の 1 フレーム、
  または `idle` で読み終え、次のタイル（視点移動・細かいズーム）で再び読む。地形ソースの `error` は
  `state().groundError` に上流の失敗として残し、`groundState`（off／reading／read）と分けて述べる。
  保存済みの立体（下書きが無くても）も同じ読み直しを受ける。⚠ 以前の「400 ms × 16 回、または 2 回連続で
  一致したら打ち切り」は、タイル到着前の 0 が 2 回続いて「一致」し、その後に届いた実値（富士山上で
  3,666 m）を二度と読まなかった（観測できなかったことを諦めていた）。
- **「レイヤーを足してよいか」は `canDraw()`（スタイルが解析済みか）、それを待つのは `whenCanDraw()`**
  （ファサードの1か所。`js/data-layers.js`・`js/time-borders.js`・`js/time-admin1.js` の `whenStyleReady()`
  はこれを返すだけ）。`styledata`/`load`/`idle` の購読と 150 ms のポーリングで、待ち手が何人いても
  ビューごとに1組。⚠ **期限で「準備できた」と答えない**——`canDraw()` が真になるまで解決しない。
  期限つきの待ち（約 6 秒で強制解決）は、隠れたタブ（アニメーションフレームが走らず、MapLibre は
  スタイルをフレームの中で解析する）で未解析のスタイルに addSource させ、「Style is not done loading.」で
  レイヤーを失わせていた。
- **契約は型として宣言され、コンパイラが両エンジンに対して検査する**（`npm run check:types` ＝
  `tsc --noEmit`）。`types/geo-engine.d.ts` が、両アダプタが持つ**共通メンバー**（`GeoEngineAdapterCore`）、
  片方だけが持つメンバー（`MapLibreOnly` / `CesiumOnly`。ファサードから見ると任意で、ファサードは
  `A().x ? A().x() : 既定値` で確かめて呼ぶ）、8 名前空間のファサード（`GeoEngineFacade`）、能力表
  （`GeoEngineCapabilities`）を宣言する。`makeMapLibreAdapter` / `makeCesiumAdapter` / `engineFacade` と
  3 つの能力表はそれぞれの型で注釈されているので、**片方のアダプタにだけ足したメソッド**・**一方に
  欠けた必須メンバー**・**契約に無いメソッドを呼ぶファサード**はどれも型エラーになる。
  検査の母集合は `// @ts-check` を持つファイル（いまは `js/geo-engine.js`・`js/cesium-engine.js`・
  `js/runtime.js`・`js/lazy-modules.js`・`js/chronos.js`）で、`tsconfig.json` に一覧は無い。
  `window.IntMapTime` は `types/chronos.d.ts`、検査対象が読む window の名前は `types/globals.d.ts`、
  `IM_HOST` のうち宣言済みの部分は `types/im-host.d.ts`（どちらも `check:surface` の基準と矛盾しない
  ことを検査が確かめる）。⚠ 任意メンバーを確かめずに呼ぶ誤りは、`strictNullChecks` が要るので
  まだ捕まらない（`docs/TESTING.md`）。
- **アダプタはビューごとのファクトリ**（`makeMapLibreAdapter`。状態もビューごと）で、
  追加ビュー（`js/compare.js` の比較地図・`js/playground.js`・`js/flight-sim.js` のミニマップ）は
  `ui.createSubView` が返す同じ形を使う。マーカー／ポップアップは**ビューに**付く
  （`ui.addMarker` / `ui.addPopup`）。生ハンドルを取り出す `ui.createView` は `js/app-body.js` の
  1回だけに限定されている。
- ビューの破棄は、そのビューが登録した時計・定期処理・地形キャッシュも解除する。
  地理ゲームの回答地図は、閉じる・背景タップ・再挑戦のすべてで同じ破棄処理を通る。
  Cesium の地形キャッシュはビューごとに予算へ登録し、破棄時に登録と取得中の要求を解除する。
  解放前の要求が後から完了してもキャッシュには戻さない。
  Cesium のマーカー・ポップアップは remove 時にビューのイベント購読と予約描画も解除し、
  再追加・別ビューへの移動では必要な購読だけを付け直す。
- **アダプタは自分に来た命令を数える。** `layers.setSourceData` / `setFilter` / `setPaint` /
  `setLayout` / `setFeatureState` の5つについて、**attempted（来た）/ sent（レンダラへ渡した）/
  same（レンダラが既に同じ値を持っていた）/ absent（対象が無い）** を集計する。既定は**数えない**
  （ブール1つ分）。`render.commands()` / `commandsReset()` / `commandConfig()` から読める。
  ⚠ **計器は2段ある。** `?perf=1` は**軽いほう**——集計だけで、payload を1バイトも文字列化しない。
  id 別・フェーズ別の表と内容ハッシュ（`JSON.stringify` で source の payload を全走査する）は
  `?cmdlog=1` または `?cmddetail=1` でだけ点く。**HUD を見るためのURLが、測ろうとしている負荷を
  自分で足してはならない。** id 別・フェーズ別の表には行数の上限があり、溢れた分は
  `folded` として自分で申告する（合計値は溢れても正確）。
  `node scripts/frame-profile.mjs --commands` が起動・pan・zoom・レイヤー欄・ホバー・Chronos・
  言語・テーマの各フェーズを実際に駆動して表を出す（**フェーズは宣言する**——setPaint の中から
  「なぜ呼ばれたか」は分からない）。
  ⚠ **省略してよいのは `setSourceData` だけで、それは MapLibre の実装がそう言っているから。**
  MapLibre の `Style.setPaintProperty` / `setLayoutProperty` / `setFilter` は**自分で deepEqual して
  同値を捨てる**ので、その手前にもう1つ比較を置いても**レンダラの仕事は1つも減らない**。
  `GeoJSONSource.setData` にはその比較が無く、毎回コレクション全体が worker へ渡って再パースされる。
  だから既定は `sourceData` だけ ON、他の4つは**数えるだけ**。
  ⚠ ただし MapLibre のその比較は**保持値を複製してから**行う（`getLayoutProperty` が `clone` を返す）ので、
  値が大きいと同値の書き込みにも費用がある。唯一の実例が時間旅行中の `ofm-city` の `text-field`
  （1916 年で約 0.9 MB）で、そこは**呼び出し側**（`js/place-labels.js`）が、生成元（`js/hist-cities.js`）が
  書き換えないと約束した配列に限って同一性で省略する（「都市名ラベルも時計に従う」）。facade は変わらない。
  ⚠ **頻度も呼び出し側が決める——そのための道具が `layers.witness()`。** `ofm` のタイルが届くたびの
  `sourcedata`（`isSourceLoaded`。時計もカメラも止まっていても 0.1〜1.2 秒ごとに来る）に、`js/app-body.js`
  は 2 つの再表明を付けている——地名ラベルの全適用（`ensurePlaceLabels` ＋ `applyLabelLang`）と、参照線・
  国境・海岸線の再表明（`__refApply` → `_applyAdmin1`、`_applyBorders`、`_imCoastReassert`）。どちらも目的は
  「前回より後に生まれた（作り直された・消えた）層に状態を与える」ことで、これは**層の同一性**の事実なので
  facade が 1 か所で答える。`witness.run(fn)` は pass を走らせ、その間に**誰が**`layers.has` / `get` で訊いた
  id でも記録し、終わった時点でその id が指す層オブジェクト（無ければ `null`）と組にする（pass 自身が作った
  層は「見た」に入る）。`witness.unchanged()` は pass が 1 回完走していて、記録した全 id が今も同じ
  オブジェクトを指すときだけ真。2 つの心拍はどちらも `if(!beat.unchanged()) beat.run(…)` で、
  層が現れる・消える・作り直されれば走る。例外で終わった pass は記録しない。pass は入れ子にできる
  （外側も内側が訊いた id を見る）。⚠ pass の他の入力（言語・表示モード・テーマ・衛星・トグル・時計）は
  それぞれ自分の呼び出し元が直接 pass を呼ぶので、この省略の影響を受けない。
  ⚠ `getLayer()` が毎回写しを返すアダプタ（Cesium）では同一にならず、従来どおり毎回走る。
  実測（375×812、`sourcedata` 20 回）: 全レイヤーへの setLayout/setPaint/setFilter **1,240 → 0**
  （地名ラベル 740・参照線などの再表明 約 300 を含む）。検査は
  `tests/legend-reflow-and-label-writes-checks.test.mjs`（facade を切り出して評価し、実物の地名ラベルの pass を
  心拍として 20 回走らせて 0 件）と `tests/form-control-names.spec.js` ②（実ブラウザで 20 回発火して 0 件）。
  `layers.setLayout` の第 4 引数は MapLibre の `StyleSetterOptions` で、facade とアダプタは素通しする
  （Cesium アダプタは受けて無視する）。
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
    **純粋**（Cesium も DOM も参照しない）ので `tests/engine-cesium-rendering-checks.test.mjs` が Node で直接検証する。
  - `js/cesium-layers.js` — プロバイダ＋描画。raster は `ImageryLayer`（brightness/contrast/saturation/hue が
    ネイティブ）、fill/line/circle/symbol/fill-extrusion はエンティティ、heatmap/hillshade/color-relief は
    同じ DEM から計算したラスタ、terrain は**同じ terrarium タイル**から `HeightmapTerrainData`。
    **キーレス（Ion トークン不要）**。⚠ `ImageBitmap` は `UNPACK_FLIP_Y_WEBGL` を無視するので、
    テクスチャ化は必ず `toTexture()` を通す。
    ⚠ **`image` source（Köppen・年降水量・日射・地震動・ShakeMap・地形の水・可視域・world packs）**は
    `makeImageSourceProvider()` が**画像を読んでから**その大きさで作るプロバイダで、`ImageryLayer.fromProviderAsync`
    として style の位置にすぐ置かれる。タイル方式は **Web Mercator の 1 枚**（4 隅の Mercator 矩形がそのタイル）——
    MapLibre が `image` source を Mercator Y に線形に貼るのと同じ置き方で、地理座標で貼ると 60°N の行が
    約 35.6°N に来る。`updateImage` は次の画像が読み終わるまで今の画像を画面に残し（`retiring`）、
    読めなかった層は `unpainted` に理由を持って `error` を出す——**style に在って何も描かない層を黙って持たない**。
  - `js/cesium-vector-tiles.js` — タイルピラミッド（cover/fetch/decode/cache）。`@mapbox/vector-tile` が
    タイルを GeoJSON にする。要るタイル集合は**今の視界が覆うタイル集合**で決める。
  - `js/cesium-input.js` — **操作は MapLibre の操作**。8ジェスチャ（pan / rotate / pitch / wheel /
    box zoom / 矢印キー / ctrl ドラッグ / shift ドラッグ）の定数と式は同梱の `node_modules/maplibre-gl`
    のハンドラ実装そのものから取っており、`tests/engine-cesium-input-checks.test.mjs` が両者を突き合わせる
    （＝依存を上げて操作感が変わると落ちる。定数は入っている版を評価するか、版が同梱する `src/` の宣言から読む）。
    慣性の速度は 6 系の方式（離した瞬間までの直近 60 ms・先頭の記録は区間の始点だけ）。
    **globe のドラッグ**は MapLibre 6.4 以降の `versorSetLocationAtPoint` の写し（`globeDrag`）：移動 1 回ごとに
    「(指 − 移動量) の下にあった地点」を「指の下」へ運ぶ回転を向きの四元数に掛け、方位は保つ（ねじれ成分を捨てる
    ので、掴んだ地点は中心からの距離 × ねじれだけ滑る——MapLibre 自身の滑りで、それを再現する）。極の 12° 以内は
    極のまわりのダイヤルへ滑らかに移り、地球の縁の手前 10% からは双曲線で減速して、縁の外では中心の画素を
    支点にする。楕円体は各軸を半径で割ると単位球になり直線は直線に写るので、式はその空間でそのまま走る
    （正確な当たり＝`pickEllipsoid`。メッシュは読まない）。**離した後の慣性**は 6 系の `handlePanInertia` と同じく
    `computeGlobePanCenter`（`panCentre`）。`tests/cesium-globe-drag-checks.test.mjs` が同梱の `src/` から
    MapLibre の `GlobeTransform` を組み立てて同じ経路を両方で動かし、中心が一致すること（1e-9 以内）を、
    `tests/cesium-globe-drag-cesium.spec.js` が実描画の両エンジンで掴んだ地点の滑りと中心の差を測る。
    カメラは必ず `setCamera()` 経由で、ジェスチャ1回につき `movestart…moveend` は1組。
  - `js/cesium-engine.js` — アダプタ本体（`makeMapLibreAdapter` と**同じメソッド集合**）。
  - `js/engine-select.js` — DOMContentLoaded より前に選択。既定では**何も publish しない**。
  - **既定セッションは 1 バイトも払わない**：cesium の import は動的、main チャンクから cesium
    チャンクへの参照 0、modulepreload 無し。**切替は再読み込み**（レンダラを跨いでシーンは移せない）で、
    パネルは**実際に描画しているエンジン**を保存値とは別に表示する（無言のフォールバックを作らない）。
  - **Cesium が答えられない物は答えないと言う**：`solid3d:false`、`demContourSource()` は null
    （maplibre-contour は MapLibre の名前空間を要求する）。呼び出し側は既存のフォールバックを取る。
  - **能力の表は3つあり、突き合わされている**：`MAPLIBRE_CAPS`（`js/geo-engine.js`）・
    `CESIUM_CONTRACT.capabilities`（同）・`CESIUM_CAPS`（`js/cesium-engine.js`）。
    `tests/engine-capability-contract-checks.test.mjs` が3つを **AST から読んで**比べる——**3表は同じキー集合**を持ち、
    **Cesium の2表は値まで一致**し、**宣言だけの契約はアダプタが拒む能力を主張できない**
    （`solid3d` がその形：契約が true を返すと `js/volume3d.js` の `canSolid()` が
    フォールバックを失う）。⚠ ファイル全体への正規表現では、同じ綴りがどちらの表にあるのか
    区別できない——3表のうち2表は同じファイルに居る。

### 1.3 バックエンド・言語

- バックエンドは **Supabase**（DB・認証・Edge Functions）。詳細は §6。
- **対応UI言語は9つ**: 英語 (en) / 日本語 (jp) / ドイツ語 (de) / ロシア語 (ru) / スペイン語 (es) /
  繁體中文 (zh) / 简体中文 (zh-hans) / フランス語 (fr) / 韓国語 (ko)。
  **9言語すべてが、計測されている全ての面で 100% である**（keyed 421/421・読み物ページ 463/463・
  位置引数 7,336/7,336・inline 6,000/6,000）。地名ラベルも全言語対応。
  ⚠ **ただし門（`npm run check:i18n`）が要求しているのは en+jp の 100% だけで、残る 7 言語は
  「床」で支えられている**——IntMap が**新しく書く**文は en+jp、**出典が書いた**ラベルは出典が
  書いた全言語をそのまま運ぶ（方針の正本は `CONSTITUTION.md` §7、機械の正本は
  `scripts/lang-policy.mjs` の 1 行）。床（`tests/i18n-coverage-floor.json`）は**減ることを拒み、
  増えたら上げることを要求する**ので、上の 100% は「今そうである」であって「門がそう要求している」
  ではない。詳細は §10。
