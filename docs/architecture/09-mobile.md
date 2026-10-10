# IntMap — 現状仕様書 §9 モバイル対応の構造

> **現状仕様書の §9。** 案内図は [`Architecture.md`](../../Architecture.md)（§ → ファイルの表）。**節番号は案内図と共有している**
> ——他の文書・コード・テストが書く「`Architecture.md` §9.x」は、このファイル（と案内図の表が同じ行に挙げる文書）の見出しを指す。
> 今どうなっているかだけを書く。変更履歴・ラウンド番号・PR 番号は書かない（`npm run check:docs` の `arch-rounds` がこのファイルも読む）。

## 9. モバイル対応の構造

### 9.0 ページの拡大は読者のもの（viewport）

`index.html` の viewport は `width=device-width, initial-scale=1.0, viewport-fit=cover` で、**`user-scalable=no` も `maximum-scale` も持たない**（読者はパネルや文字を
ピンチで拡大できる。WCAG 1.4.4）。

- **地図のピンチは地図のもの**（MapLibre のキャンバス `.maplibregl-touch-zoom-rotate.maplibregl-touch-drag-pan` と Cesium のキャンバス `.cesium-widget canvas` が
  `touch-action:none`）。パネルの上のピンチがページを拡大する。
- **iOS/iPadOS の WebKit だけは `maximum-scale=1.0` を足す**（meta 直後の inline script。そのエンジンは `maximum-scale` を 16px 未満の入力欄にフォーカスしたときの自動拡大の
  上限にだけ使う）。iPadOS 13 以降の iPad は UA が "Macintosh" なので `maxTouchPoints` で分ける。検査は `tests/pinch-zoom-allowed-checks.test.mjs`。

### 8.6 分析の帯 (`#layer-tools`) は Tools パネルへ、プリセットは Layers パネルへ運ばれる

`#layer-tools`（比較ビュー・相関分析・地図データの読み込み・データと分析・プレイグラウンド）は実体が 1 つのノードで、`js/data-layers.js` の `reorganizeLayerPanel()` が
組み直し、`js/map-ui.js` の `_placeLayerTools()` が**読者が実際に見ている Tools パネル**（Tools ▾ か Map tools シート、§8.1）の「分析」節
（`.tlp-sec[data-sec="analysis"] > .tlp-body`）へ移す。同じ関数が `#lyr-presets` を見ている Layers パネルのプリセット節（`.lst-presets-body`）へ移す（`#layer-active-section`
の `_placeActiveSection()` と同じ形。写しは作らない）。持たない側の節は隠れる。

- **運ぶ瞬間**——`mountTools()`（デスクトップはトリガを押すたび、携帯はシートを開くたび）・言語の切り替え・`buildTiles`・Layers パネルの開閉・`reorganizeLayerPanel()` の末尾。
  起動直後は帯がまだ `#layer-dropdown` にいるので、到達可能性は読者と同じようにパネルを開いてから測る。
- **ホストはブラウザに訊く**（`getClientRects().length` で組版されているかを選び、`_hostShown` で引き上げられているシートを優先、トリガが押されたパネルを先に。無ければ
  ノードはそのまま）。
- **運んだ先が捨てられる瞬間がある**（`buildTiles()` は `.lst-root` を `replaceWith`、`unmountFrom()` はホストごと `remove()`、Tools パネルは言語で節を組み直す）ので、その前に
  `#layer-dropdown` へ退避させる（`document.body` へは退避させない）。
- **節の見出しは 1 つ**（帯の「ツール」見出しは運ばれた先では CSS が隠す。規則は配置に付く）。帯の扉を押すと Tools パネルが引っ込む。

帯そのものは読者のどの画面にも属していない（`imLayerPanel` は定数 `right` で `body.lsr-avail` は常時付き、`#layer-dropdown` を表示する規則はデスクトップ側に無く、768px 以下では
`body.m-lyr-tiles …> #layer-tools{display:none}`）——だから帯に置いたボタンは運ばれない限り届かない。扉を 1 つずつ `SIM_TOOLS` へ写さず、経路で運ぶ。到達可能性は
`tests/smoke.spec.js` のツール帯の 3 本が測る（扉を DOM から数え上げ `elementFromPoint` で確かめる。下限は「1 つ以上」）。

### 9.1 IntMap Runtime — 1つのフレーム・1つの camera 購読・1つのタイマー

`js/runtime.js` / `window.IntMapRuntime`。**カメラを追う仕事は全部ここを通る。** `js/app-body.js` が `js/lazy-modules.js` の隣で `makeRuntime(IM_HOST)` を作る（何かが登録する
より前に存在する）。

| 登録簿 | 呼び方 | 何をするか |
|---|---|---|
| camera | `onCamera(key, fn, {phase, capability})` | カメラが動いた。エンジンへの購読は全体で1本。`phase:'read'` はすべての `phase:'write'` より前に走る |
| frame | `frame(key, fn)` | 次のフレームで1回。key で合流 |
| timer | `every(key, ms, fn, {whenHidden})` | 1本の timeout が全周期を回す。`document.hidden` の間は動かさない（取り戻しはしない） |
| idle | `idle(key, fn, {timeout})` | フレームのあと、暇なとき |
| box | `box(el)` / `remeasure(el)` | 要素がどこにあるか。ResizeObserver で持ち、`resize` / `orientationchange` / `scroll` / visualViewport と、あらゆる `pointerdown` / `touchstart` で無効化する。測るのは無効化のあと最初に訊かれたとき 1 回（1 ストロークは 1 回の実測から始まる）。`remeasure(el)` は自分でレイアウトを変えた呼び出し側が言う |

- **周期処理は全部 timer 登録簿を通る**（`js/` に生の `setInterval` は無く——例外は `js/runtime.js` 自身のフォールバック——**30 ファイル・43 本**が `everyTick(key, ms, fn, opts)` /
  `stopTick(stop)` を import する。`tests/shell-runtime-checks.test.mjs` ②が両方向で測る）。
- **鍵は登録簿ぜんぶで1つの名前空間**（`'data-layers:sat-legend'` のように所有者を名乗る。2回目は置き換えるので、同時に複数走るものは `tickKey(prefix)` で連番）。
- **既定は「hidden なタブでは動かない」**（`{whenHidden:true}` は現在 2 本——`label-occlusion` のメモリ監視と `atlas-console` の疎通確認）。
- **登録簿より先に鳴く時計は引き取られる**（`js/theme-sky.js` と `js/perf-hud.js` では `everyTick` が実際の interval を張り、`makeRuntime` が公開した直後に止めて同じ鍵・周期・
  関数でホイールへ載せ直す）。

**ライフサイクル**: `define(name,{load,activate,suspend,dispose})`。登録は capability 名でタグ付けされ、`suspend(name)` は毎フレーム仕事を一括で外し、`dispose(name)` は camera /
frame / timer / idle の4つの登録簿すべてからその capability の仕事を消す。各 capability は世代番号を持ち `dispose` だけが進める。`load` と `activate` は着手時の世代を完了時に照合する
（閉じたのに active に戻らない。`generationOf(name)`）。失敗した `load` はメモされない。動詞は scope を受け取る: `load(host, loaded)`・`activate(arg, value, active)`——**loaded scope**
は `load` から `dispose` まで（カタログ・worker・GL オブジェクト）、**active scope** は `activate` から `suspend` まで（地図のリスナー・tick・パネルの DOM ハンドラ・fetch）。scope は
`on(target, ev, fn)`・`every`・`frame`・`onCamera`・`idle`・`timeout`・`fetch`（AbortSignal は scope のもの）・`own(x)` で登録したものを所有し、`release()` で逆順に返す。`alive()`・
`guard(fn)`。scope 経由の登録は所有者名のタグと `name:` 接頭辞の鍵を持つ。`RT.scope(name)` / `RT.scope(name,'active')`。`stats().unowned` はいま生きている所有者の無い登録の数
（累積は `unownedEver`）。DEM／Köppen／凡例／Playground の手書きの「古い完了を拒む」はこの機構の写しで、新しく書くときはこちらを使う。状態は `defined` → `loading` →
`loaded` / `failed` → `active`、そして `disposed`（定義は残り、次の `activate` は `def.load` からやり直す）。

| capability | activate | suspend（速い再開のために残すもの） | dispose（返すもの） |
|---|---|---|---|
| `wx.wind` | 風レイヤー ON | OFF。WebGL のレンダラは残す | `js/wx-wind.js` の `dispose()` ＝ GL オブジェクトを削除し、キャンバスのバッキングストアも解放 |
| `sim.tsunami` | 津波パネルを開く | 閉じる（走っているジョブは abort、ソルバのスレッドは残す） | worker を terminate（`IntMapTsunamiWorker.dispose()`）、モデルとパネル DOM を破棄 |
| `sat.live` | 実時間衛星 ON。3 つの地図リスナーと tick は active scope が所有し、閉じた後に届いたカタログは `guard` が捨てる | OFF（scope が interval・3 リスナーを返す。詳細パネルを閉じる。カタログは残す） | カタログと導出位置を捨て、レイヤーと軌道を地図から削除 |

- worker を返す動詞と worker が死んだ経路は別物: `src/tsunami-worker-client.js` と `src/sat-worker-client.js` の `dispose()` は在庫のジョブを必ず決着させてから terminate する
  （津波側は `null`、衛星タイル側は reject）。`onerror` の側は `tried` を戻さない（墜ちた worker を輪で作り直さない）。
- 読みを全部終えてから書く（各自の rAF が読みと書きを混ぜると強制同期レイアウトが毎フレーム N 回起きる）。誰の仕事も間引かず、消すのは重複だけ。`gesturing()` /
  `window.__imGesture` は呼び出し側が使う。ローダーではない（取得・factory・publish の検証は `js/lazy-modules.js`）。

### 9.2 レイアウト——シート 1 枚と操作グループ 1 つ

携帯（`(max-width:768px)`）は**地図が主役**で、地図を覆う常設物は**下のシート**（最小の段では検索欄の 1 行）と**右上の操作グループ**だけ。凡例は左上の**凡例チップ**（有効な
凡例があるときだけ・数を出す）から開く。390×844 の初回訪問で覆う割合は 13.9 %、44 px 未満のタップ目標は 1/9（ライセンス上必須の出典表記のリンク）。

- **シートの段は 4 つ**（`js/mobile-sheet.js`）——`hidden`（グリップだけ）・`min`（検索欄の行・home indicator 込み）・`half`（画面の 45 %）・`full`（`--sheet-h`）。旧名 `peek` /
  `mini` は `window.__setDetent` が別名として受ける。離すと指の速度を初速にしたばねで止まる（`spring()` が同じ曲線を CSS `linear()` と JS easing の両方で返す）。フリックは
  その向きに 1 段だけ、ゆっくり離せば最寄りの段。`prefers-reduced-motion` ではばねを使わない。
- **シートがどの段に止まるかの規則は 1 か所**（`js/mobile-sheet.js` の `detentFor`。`js/mobile-ui.js` の信号は全部ここに訊く）:

  | 読者がしていること | 段 |
  |---|---|
  | 検索欄にカーソルがある | `full` |
  | 何も選ばずに欄を離れた | 欄が上げる前の段（今より上げない） |
  | 答えが地図の上のカード（候補から場所を選んだ） | `min`（今より上げない） |
  | 指ではなくアプリが地図を動かした（Atlas の fit、選んだ場所への飛行、フィードの項目） | `half`（今より上げない） |
  | タブを選んだ | `half`。読者自身が上げていればそのまま |
  | シートの中に最後まで読むカードがある（ログイン前の Atlas の見本カード） | `full` |

  答えは段を下げるだけで上げない。カードの持ち主は `MAP_ANSWER_EVENT`（`js/mobile-sheet.js` が持つ名前）で述べるだけ。「アプリが動かした」は movestart で読み、指の動き
  （MapLibre はジェスチャの movestart に `originalEvent` を付ける。3-D エンジンはシートの外の指も数える）とシート自身の padding の動きは答えではない。飛行中は padding を
  動かさない（`easeTo` は飛行を止めるので、カメラの padding は着いてから追う）。候補を選ぶとその検索は終わる（遅れた結果は書かず、欄は場所の名前を持ち、キーボードが閉じる）。
- **シートの頭全体が取っ手**（グリップ・検索欄の行・タイトル行・タブ行のどこを縦に 7 px 以上動かしても動き、動かさなければタップ。グリップのタップは 1 段上下。中身を一番上
  までスクロールしてさらに引くと下がる）。
- **シートの中身は画面の下端で終わる**（段に止まるたびに見えない分を `--sheet-hide` として `padding-bottom` に書く。Atlas は `half` でも入力欄が画面内にある）。
- **画面はシートの中で遷移する**（`makeScreens()`）。Layers（`#mo-sheet`）・Tools（`#tools-sheet`）・地図（`#bm-pop`）・Chronos（`#news-timeline`）・設定（`#settings-modal`）は、
  持ち主が開いていると言っている間だけ既存の要素を `#m-screens` に貸し、閉じたら返す（id・ハンドラ・`[data-proxy]`・ダイアログ登録はそのまま。スクリムは使わない）。
  Chronos はシートの中にいる間、地図の操作で閉じない（`js/news-timeline.js` の autoClose）。画面が出ている間と検索の候補の一覧がある間、ホームの中身（タブ・フィード・比較バー
  `#co-compare-fixed`）は `visibility:hidden`（`tests/map-next.spec.js`）。
- **入口は 1 つ**（シートの頭の欄が「場所の検索」と「Atlas に訊く」を兼ねる。`localFuzzyPlaces` の候補を `gotoPlace` で、`doGeocode({suggest:true})`・ネットワークなし、最後の行が
  「Atlas に訊く」。Enter は全検索して先頭の候補へ。古い応答は世代で捨てる。フォーカスで `full`、空で離れると元の段）。
- **右上の操作グループ**（`.m-ctl-group`）——Layers・地図・Tools・現在地を縦につないだガラス 1 本。「地図」画面はベースマップ（地図／衛星の 2 面の絵——同梱のデータから
  カメラの場所を描く・開いている間だけ）・投影（地球儀／平面／3D）・**基本表示**（`js/data-layers.js` `IntMapBaseDisplay.items()`＝宣言の `kind:'display'` を iOS のスイッチで。
  本物のチェックボックスを `change` で切り替える）・中心点の読み取り。コンパスは回転か傾斜しているときだけグループの下に出る。
- **座標の読み取りは常設しない**（十字線と読み取りは計測ツールが動いている間と「中心点の読み取り」を入れている間だけ。`body.m-xhair`・設定は `localStorage`。読み取りは検索欄の
  下の 1 行。出ていない間は DEM の参照もレンダラへの問い合わせもしない）。
- **重なり順は 1 つの表の 4 行**——`css/intmap.css` 先頭の `:root` の `--z-m-legend`（1040）＜ `--z-m-card`（1100）＜ `--z-m-chrome`（1150：操作グループ・凡例チップ・コンパス）＜
  `--z-m-sheet`（1200：検索・Chronos・全画面）。`#map-container` は `position:fixed` なので重なりの文脈で、中のもの（凡例・場所のカード・ポップアップ）は操作グループとシートの
  下に描かれる。ニュースの点のカード（`.m-news-pop-back`）は `--z-popup` でシートの上に出る。
- **地図が持つカードは浮くカード**（`#map-container` の直下の `.country-popup`——火山・航空機・衛星・企業・ニュースの点・地点プロファイル——は、下端がシートの上端
  （`--sheet-cover`）＋出典の帯の実測高（`--m-credit-h`。`js/mobile-ui.js` が ResizeObserver で測る）＋ 20 px、上端は `--m-legend-top`、右端は `--m-legend-right`。収まらない
  分はカードの中でスクロールする——`overflow-y:auto`・`overscroll-behavior:contain`）。`<body>` に載るカード（z 2200）はシートの上の下端シート。地図に載るカードが開いたことを
  `js/mobile-ui.js` が直下の子で読み `card` の行に訊く。
- **地図の上に浮かぶものは全部シートと出典の帯の上に収まる——性質で見つける**（`js/mobile-sheet.js` の `makeFloatFit` が <body>・`#map-container`・その列の直下の子から、
  位置が fixed / absolute・描かれている・指を受ける・操作部品を持つかそれ自身が操作部品であるもの——シート自身の画面・出典の帯・画面を覆う箱・`<body>` の国カード・
  `data-dragged` を除く——を全数見つける）。下端の限界は `floatBound`（画面高 − `--sheet-cover` − `--m-credit-h` − 20 px）、上の限界は `--m-legend-top`。収まっているパネルには
  何も書かず、はみ出すパネルにだけ `data-m-fit` を付け、`cap`・`dy`・`scroll` を css/intmap.css が読む。シートの段・出典の帯の高さ・パネルの大きさが変われば測り直す。火山灰
  パネル（`#ash-panel`）は操作グループの手前で止まる（`right:var(--m-legend-right)`）。シートが `full` のとき単体の操作部品（`#iol-fab` など）は退く（`out`）。
- **Atlas の「例の置き場」（`.atl-ex`）はスクロールできる箱**（`min-height:0`＋`overflow-y:auto`。カードが開いている間は `.atl-sub` が退き、窓へ入れるのはカードの操作の行）。
  ログイン前の見本カード（`.atl-pv`）は `MAP_ANSWER_EVENT` の `kind:'read'` で `read` の行に訊く。未ログインでカードを開いている間はチップの再描画（`renderExamples`）を待つ
  （`_exKey` を進めない）。
- **場所のカード**（`.search-result-card`）は携帯では左右の端が CSS のもの（画面の端から `--m-legend-right`）で、ピンに合わせて動くのは尾だけ（`--src-x`、`js/search-geocode.js`）。
  × と「座標をコピー」「ピンを刺す」は 44 px。
- **凡例トレイ**（`makeLegendTray()`）——地図の上に浮く凡例（`#map-container` の直下で class か id が `legend` を含むもの。`js/window-manager.js` の `DOCK_SEL` と同じ事実）は
  `js/data-layers.js` の tiler が並べ、トレイが開くまで `visibility:hidden`（`display` は持ち主のまま）。凡例の – と × は指には 44 px。
- **全部の当たり判定が 44 px 以上**（タブ・ログイン・設定・グループ・時計・検索の虫眼鏡・凡例の –／×・Chronos のタブと速度・年のスライダー〔指には 44 px の行・目には 6 px の
  溝と 28 px のつまみ〕・ウィジェット盤の編集／追加と歯車・レイヤー画面の検索欄〔16 px の文字〕と節の見出し・有効レイヤー行の List と「すべて解除」）。測るのは当たり判定
  （`elementFromPoint`）。スクロール箱が `::after` を切ると当たり判定も切れる。
- **Chronos はシートの中で、指で動かすものが先**（`half` で開き、値・スライダー・目盛り・再生がタブの直後。時計の選択・日時へ移動・Date／Time の入力欄は後ろ——CSS の `order`）。
- レイヤーパネルはシートの画面の中に移動する（`js/map-ui.js` の `mountInto()` が同じ DOM を移す）。
- **最大（`sheet-full`）のとき地図のタップは無効**で、タップすると `half` へ下りる。操作グループと凡例チップは `full` の間だけ退く。
- **チェックボックスのタップ**：`input{pointer-events:none}` ＋ `touch-action:manipulation` ＋ 行の `pointerdown` でトグルする。
- **compare を開いている間**は操作グループを下に移動する（消さない）。
- **浮く部品の寸法は1か所**（`css/intmap.css` の携帯ブロックの `:root` が `--m-edge`・`--m-fab`（44 px）・`--m-group-w`・`--m-chrome-top` を持ち、`--m-legend-top`（チップの下＋8 px）と
  `--m-legend-right`（グループの幅＋8 px）はここから導出。計測ツールのパネルも `--m-legend-top` から始まる。`--sheet-cover` は `#map-container` と `.map-column` の両方に書く）。
  門は `tests/mobile-panels-reach.spec.js`（375×812・見つけた浮くものの全部）・`tests/mobile-card-reach.spec.js`（本物の指で火山カードと Atlas の見本カード）・
  `tests/form-control-names.spec.js` ②（凡例のカードの四隅と中心）・`tests/ui-a11y-polish.spec.js` ③（390×844 で覆う割合・44 px 未満・凡例の重なり順・Chronos・候補）。
- **Radius パネル**：携帯では左下のコンパクトなカード。**`.m-scrim` は閉じている間 `visibility:hidden`。**
- **画面配置と端末の持ち主は1つ**——`js/ui-device.js`（`window.IntMapDevice`）。境界 `(max-width:768px)`（反対側は `(min-width:769px)`）を `js/` で書くのはここだけで、
  `isMobile()` は `IntMapDevice.compact()`、注入 CSS は `IntMapDevice.media(css)` か `'@media'+IntMapDevice.COMPACT`。スタイルシートも同じ 1 本の線（`max-width:767px`／
  `min-width:768px` は無い）。形の問いは `kind()`（`phone` / `phone-landscape` / `tablet` / `desktop`）で、`<body>` に `im-compact`・`im-dev-<kind>`・`im-portrait`/`im-landscape`。
  門は `check:static` の `ui-owners` 規則（767/768 の分裂は即失敗、境界の数値はファイルごとに両方向で数える）。横向きの携帯（844 px）はデスクトップ配置のまま（CONSTITUTION §4。
  `tests/r668.spec.js`）。
- **「携帯」の問いは2種類**——幅（`isMobile()`）はレイアウトの問い（シート・クロスヘア・読み出し・タップの文言）、端末（`_imPhoneClass()`＝`IntMapDevice.phoneBudget()`）は費用の
  問い（MSAA・DPR 上限・常駐タイル予算・@2x タイル・canvas の RAM 上限・DEM キャッシュ上限・DEM 先読み・毎フレームのマーカー遮蔽）。費用の述語は
  **`window.IntMapMemBudget.deviceIsPhone(旧テスト)` 1 本**（`js/mem-budget.js`。メモリ圧の見張り・ケッペンの作業キャンバス・地震のラスタと DEM・津波の格子・風の粒子・水の
  解法・タップの許容半径もこれを訊く）。手で写さない。`tests/r668-checks ③` が全追跡ファイルを歩いて幅で選ばれた数を数え（別名を解決してから）、既定は失敗（幅が正しい問いの
  場所だけ理由付きで許可）。述語は3項で上から答える: ① `(pointer:coarse)` でなければ false ② `(any-pointer:fine)` が無ければ true ③ どちらもある場合だけ
  `Math.min(screen.width, screen.height)` ≤ 500。`maxZoom`（携帯 18／それ以外 19）は到達できる能力の区別なので幅のまま。

### DEM タイルの保持と、常駐タイルの予算

標高・水深の読み出し、地形彫刻、可視領域、日射、津波の細分、震度分布は同じ terrarium DEM タイル置き場（`js/map-readout.js`）を共有する。1 枚は復号後 **262,144 バイト**
（256×256 の Float32）で、状態は 4 つ:

| 状態 | 意味 |
|---|---|
| queued | 要るが、まだ要求していない |
| loading | 要求済み・応答待ち |
| ready | 復号済みの `Float32Array` |
| failed | 訊いて答えが無かった（4 秒で失効し、次のビルドは訊き直す） |

- **上限は 2 つ**: 常駐の `_DEM_CACHE_MAX`（`js/app-body.js`・携帯 140／それ以外 560）と、ビルドが留めてよい `_DEM_LEASE_MAX`（携帯 608／それ以外 2,112。震度分布 1 枚の作業集合
  ＝`js/seismic.js` の `TILE_BUDGET` ＋ `TILE_BUDGET_FAR` と同じ数。`tests/hazard-dem-tile-store-checks.test.mjs` が突き合わせる）。
- 上限は挿入したあとと完了したあとに適用し、追い出しは ready から（in flight は他に出せるものが無いときだけ）。
- **同時に出せる要求は `_DEM_HOSTS.length × 6`＝24 本**（レンダラの画像キュー `_imgConcurrency` とは別）。load も error も発火しない要求は 45 秒で枠を返す（取り消さず手放す）。
- **留め置きはリース**（`warmDEMTiles()` は 1 本開き、`hold` を渡さなければ終わると閉じる。長く読むものは token を渡し `releaseDEMHold(token)` でその 1 本だけ閉じる。鍵は参照数）。
  リースを離れたあとに届いた応答は捨てる。
- 保持量は `demStoreStats()`（`bytes` は復号済みのタイルだけ）。

**常駐タイル予算（`maxTileCacheSize`）は、分からないメモリ量を余裕とみなさない**（`navigator.deviceMemory` は iPhone で常に `undefined` なので小さい端末と同じ扱い。携帯 640／
自称 4 GB 超の携帯 1024／デスクトップ 2048 (@2x) か 8192。source ごとの設定で、アプリ全体のバイト予算ではない）。

**地点値の点-多角形判定は外接矩形で先に断る**（`window._imPipGeo(x,y,geometry)`・`js/map-ui.js`。数値レイヤーの地点値・World Bank 面・タイムゾーン・データセンターが通る）。
外接矩形は座標配列をキーにした `WeakMap`、MultiPolygon は全体で断ってからパートごと。矩形は断るためだけ（答えは変わらない）。NaN・null を含む形には矩形を作らない。

- **Atlas は携帯ではボトムシートの中で開く**（`#sidebar` にマウント）。
- **フライトシムの携帯レイアウト**：`@media(hover:none)` で6連メータ・PFD・ブーストバー・キーボード早見表を消し、テープ・パネル2枚・ラダー・ADI を1つずつ残す（デスクトップ／
  タブレットでは全部出る）。
- **宇宙を探索の携帯レイアウト**：時刻まわりを `.sp-timeb` 1つに畳み、そのボタンが時刻そのものを表示する（デスクトップでは `display:none`）。

### 9.3 指の経路——DOM に訊くのは 1 ジェスチャに 1 回

**指が動くたびに DOM を測らない**（§9.1 の「READ は全部 WRITE より先」の入力側）。長押し・クロスヘア・中心の読み出し・「地点を追加」ピルは `js/mobile-map-input.js` 1 本の面
（`js/app-body.js` は 2 か所から `longPress()` / `crosshair()` を呼ぶ）。

- **長押し判定**は `touchstart` で canvas の矩形を1回だけ測り、以降はクライアント座標で比較する。12 px を越えたら `cancel()` が武装を解く。
- **クロスヘア**は Runtime の READ 相（中心の経緯度）と WRITE 相（`display` と読み出し文字列）に分かれる。
- 地図コンテナの矩形は ResizeObserver で持つ。`--sheet-cover` は `js/mobile-ui.js` がインライン宣言として書くので、その文字列（＋`document.body.className`）が変わったときだけ
  `getComputedStyle` を引き直す。値が同じ書き込みもレイアウトを無効化するので変わったときだけ書く。

**指のクライアント座標を地図の座標に直す場所は 5 つあり、全部 §9.1 の `box(el)` を通る**: `js/wheel-zoom.js` のピンチ（感度を既定から変えている読者の 2 本指）・`js/map-tools.js`
の `touchLL`（作図）・`js/volume3d.js` の `_ll` / `onMove`（3-D 体積）・`js/tool-panel.js` の `place()`（コンテキストメニュー）・`js/map-tooltip.js` の `positionTooltip`（ホバー）。

- **ピンチはフレームに合流する**（`touchmove` は目標を控え、`easeTo` は `RT.frame()` が 1 フレーム 1 回。`touchend` で残りを流す。感度が 1 でないときだけの経路）。
- **地図のツールチップの表示は 1 か所が決める**（`window.showMapTooltip` / `hideMapTooltip`。大きさは markup が変わったときだけ `setMapTooltipHTML` が測り直す）。
- この経路を測れる計器は `scripts/mobile-trace.mjs` の `pan-touch` / `pinch-touch` / `pan-alerts-city` だけ（touchmove 1回あたりの `getBoundingClientRect` / `getComputedStyle`
  回数と touchmove →次フレームの遅延。`docs/TESTING.md`）。同じ指を全レイヤーに当てるのが `scripts/layer-sweep.mjs`、{ベクタ, 衛星}×{平面, globe}＋日付変更線が
  `scripts/view-matrix.mjs`、どの関数が走っているかが `scripts/phase-profile.mjs`。

### 地図の動き——ホイール・慣性・ラベル（デスクトップと携帯の両方）

**操作の割り当ては MapLibre のまま**（ホイール＝カーソル位置へのズーム、ドラッグ＝パン＋慣性、ピンチ、ダブルクリック／ダブルタップ）。変えてあるのは動きの軌跡だけで、
`js/geo-engine.js` か地図の作成オプションにある。

| 何が | どこ | 規則 |
|---|---|---|
| **ホイールのズーム** | `_smoothWheel` | 1 ノッチが動かすのはズームの目標（`_targetZoom`。率・シグモイド・制約・スナップはレンダラのまま）。表示中のズームは臨界減衰のばね（ω = 0.02 /ms、`maplibregl.now()` で毎フレーム積分）で追い、速度がノッチをまたいで続く。静止からの 1 ノッチは 150 ms で 95%。レンダラの 200 ms の終了時計はばねが着くまで延ばす。トラックパッドの経路は変えない |
| **ドラッグを離した後の滑りの設定** | `_glideOptions` / `setGlide` | 滑りは離した速度のまま始まる（`linearity × f′(0) = 2`、緩和は正規化した減衰指数 k = 4）。持続時間の法則（減速度 2500 px/s²）と全速で運ぶ最大の離し速度（≈4,667 px/s）はレンダラの既定 |
| **設定の「パン」「慣性」** | `js/wheel-zoom.js` → `input.setGlide({speed, length})` | パンは運ぶ速度、慣性は滑りの長さ（0＝離すと止まる）を掛ける |
| **滑りの保持** | `setGesture('dragPan',true)` / `setDragPan(true)` | MapLibre の `dragPan.enable()` は引数なしだと慣性を既定へ戻すので、滑りの設定はビューが持ち全ての enable がそれを渡す |
| **離したときの滑り** | `js/geo-engine.js` `_glideRelease` | `_onMoveEnd` を包む。速さは慣性バッファの最初と最後の記録の間で測り（窓は最低 3 フレーム）、パンもズームも「持続 = 速さ / 減速度」（ズームの速さはピンチ中心から画面幅の半分の点の速さ ln2·w/2 px に直す。375 px で 19.3 zoom/s²、1280 px で 5.6）。最後に指が動いたフレームに錨を置く。慣性 0 なら止まる |
| **カメラの行き先** | `js/geo-engine.js` `camera.destination()` / `camera.onDestination(fn)` | ホイールのばねの目標、`easeTo`/`flyTo` の終点、ドラッグ中なら「いま離したら着く所」を `{zoom, center, size}` で答え、新しく分かるたびに知らせる。ピンチ中は答えない |
| **衛星タイルの行き先優先** | `js/sat-proto.js` `_satWantedThere` / `_satWarmDestination`、`src/sat-worker.js` `warm` | ズーム中の保留はそのまま、行き先が描くタイル（`round(zoom+1)` か 2 段浅い段で、行き先の画面＋1 タイルの内側）だけは即座に取り、行き先の段のタイル（@2x なら子 4 枚）を中心に近い順にワーカーのバイトキャッシュへ先に取る（4 本まで並行・新しい行き先が置き換える） |
| **夜側の描画** | `js/night-side.js` `paint()` | 1024² の夜側の画像は 1 回 5 ms までのタスク（MessageChannel）に区切って計算し、出来上がった絵だけをキャンバスに渡す（アイドル時間は待たない）。先に 1/4 辺の粗い絵、続けて全解像度。時計が動けば捨てて新しい時刻から、同じ時刻ではやり直さない。`state().paint`（`at`・`full`・`pending`）と `state().built` |
| **ラベルの出入り** | `js/app-body.js` `ARRIVAL_FADE_MS`（180 ms） | 地図の `fadeDuration` は記号のクロスフェード（0 だと毎フレーム全ラベルの衝突配置をやり直して点滅する）。衛星タイルの `raster-fade-duration` と同じ数 |

**動いている間に `<html>` / `<body>` の class・style を書かない**（値が同じでも MutationObserver に記録が届く。カメラのフレームごとの描き手は状態が変わったときだけ書く——
`js/space-sky.js` の `shown()`。ページ全体の観測者は値の変わらない記録を捨てる——`js/news-timeline.js` は `attributeOldValue` と現在値を比べる）。計器は `scripts/map-motion.mjs`
（`docs/TESTING.md`）、門は `tests/map-motion.spec.js`（レンダラの時刻で 1/60 秒ずつ進めて測る）と `tests/map-motion-checks.test.mjs`。

### 9.4 携帯が余分に持たない／待たないもの

- **起動は段で読む**（`js/boot-stage.js`・`window.__imBootStage`）。資源ごとに「誰が・いつ・なぜ」の行があり、携帯の段は `boot`（起動画面の間）／`settled`（起動画面が上がった後の
  idle。1 つの idle につき 1 件、頼まれた順）／`need`（読み手が頼んだとき）。読み手は自分の発意の読みの前に `at(行)` を待つ（星空 `data/stars.bin`・地名辞書
  `data/gazetteer-phone.json.gz`・国の表 `data/ne-countries/`・世界銀行の最新値は `settled`）。段は読む時刻を動かすだけ。携帯以外は全行 `boot`。「起動画面が上がった」は
  `__imBoot.done` と起動画面の `boot-gone` の早い方（index.html の 20 秒の非常口は `done` を通らない）。表は発見で完全に保たれる（`npm run check:perf` が起動グラフの名指す
  `data/…` を全部拾い、行の無いものと何も指さない行を赤にし、`boot` 行の合計を `phone.bytes`／`phone.requests` の天井にする——`docs/TESTING.md`）。
- **Natural Earth の国（110m／50m／10m）は自サイトから読む**（`data/ne-countries/`、固定コミット、`js/ne-countries.js` が復号。10m は 2.81 MB）。展開と parse はデータの扉の
  Worker、座標の復号は区切って行う。携帯は 10m を、カメラが z ≥ 4 で止まった時点か国の表を読んでから 15 秒後の早い方で読む。
- **CJK の書体が届いたとき作り直すのは、ブラウザが描いたグリフだけ**（`js/geo-engine.js` `_redrawLocalGlyphs`。ダウンロード済みのグリフ範囲——`fonts/Inter Regular/*.pbf`・Noto の
  範囲——は持ち続ける）。Noto の rule sheet は `wght@400..700` で頼む。作り直すのは届いた書体の `unicode-range` に入るグリフだけ（`js/map-typography.js` が届いた面の範囲を
  `refreshCjkGlyphs(範囲)` に渡す。何も落ちなければスタイルに変更を告げない）。
- **ブラウザが描くグリフは 1 字 1 回**（`js/geo-engine.js` `_dedupeGlyphDraws`。進行中の〔スタック・変種・字〕は 1 つの約束。`_newMap` がクラスに 1 度だけ入れる）。
- **地名照合器は項目ごとに最初の照合で作る**（`js/place-terms.js`。語の先頭 3 単位と末尾 3 単位が `/i` の大文字化規則で本文の部分文字列かという取りこぼしの無い前置フィルタで
  届きうる項目だけを作る）。
- **携帯のレイヤー格子は起動時に組まない**（`js/mobile-ui.js` `prebuildGrid`。シートを開いたときか、起動画面が上がってから 3 秒後の `settled` の番で 1 度だけ）。
- **起動画面の明るい側のマーク**は縮めた写し `IntMap.Icon_BW-inverted.boot.png`（43 kB。CSS の 156 px × DPR 3）。`scripts/boot-icon-flatten.mjs` が作り `--check` が確かめる。
- レイヤー凡例の年指定は範囲付き数値入力と「現在」ボタンで同じマスター時計を操作する（紀元前からの全期間を直接入力でき、上下キーは1年刻み。時計への購読は共有1本で、
  現在の DOM にある欄だけを同期する。範囲外・小数は渡さない）。
- **復号済み DEM タイルの上限は 1 か所が決める**（`js/mem-budget.js`）。1 枚は `Float32Array(65536)` ＝ 262,144 B で、置き場が 5 つ（写真の撮影地点探索の worker とページ側・標高の
  読み出し・Cesium・地形編集）。1 つの予算（携帯 48 MB／それ以外 192 MB）を取り分（`SHARE`）で分ける。worker は `matchMedia` を持たないのでページが `adopt()` で教え、教えられて
  いない置き場は小さい方を取る。走っている仕事のタイルはリースして上限から除外する（`buildField()`。`finally` で返す）。圧迫時の解放は `register()`／`relieve()` で届く。
- **ガゼッティア**は `data/gazetteer-phone.json.gz`（551 kB・12,000行）。全量は取らない。取る時刻は `settled`。
- **ケッペン**は軽量版 `*_4k.png` を使い、作業キャンバスは 2048² へ直接デコードする（復号済み画像は直後に解放）。期間切り替えと携帯でのレイヤー終了は作業キャンバスの寸法を
  ゼロにして描画領域を返す。読み込みは世代に属し、古い完了や失敗が解放済みデータを復活させたり重複して読み込んだりしない。bitmap と一時的な強調表示キャンバスは完了時に解放する。
- **押されてから取りに行くもの**（`js/lazy-modules.js`・**44 本**。主なもの）：フライトシム／Playground／地震／ShakeMap／津波／地形と水／見通し線／ストリートビュー／夜空／
  Atlas カーネル／経路パネル／データセンター／機体カード／3D 体積ツール／国の比較／衛星（ライブ）／衛星パネル／写真の撮影地点探索／世界データ層の 5 層（行は起動時）／宇宙
  エクスプローラ（床のジェスチャーは起動時）。KaTeX と html2canvas も動的 import。遅延化は機能ではなく「起動時に走るもの」で切る: `js/analysis-panels.js` は 3 ファクトリの登録・
  起動時の DOM とリスナー（`#btn-correlate`／`#btn-edu`）・2 つの公開グローバルの非同期ファサードだけを持つ eager shell で、本体は `js/analysis-{correlate,world-events,edu}.js`。
  ファサードは呼ばれたらローダーを await して本物を呼ぶ。取りに行ってはならない入口（`IntMapEdu.close()` と地図クリックの転送）は `IntMapLazy.ready()` を見る。遅延側のグローバルは
  `__imAnalysis*`（`js/atlas-controls.js` の `moduleCatalog()` は `window.IntMap*` を自動発見する）。受動的な読み手は `&&` ガードのまま。
- **Cache Storage の所有者は名前が述べる**（`sw.js` の activate は現行キャッシュ `CACHE` と `intmap-page-` で始まる名前——海底ケーブル・NWS の予報区・SWIC の警報区・
  geoBoundaries——だけを残す。`tests/sw-cache-names-owned-checks.test.mjs` がページの `caches.open` を全部発見して確かめる）。
- **衛星タイルの先読みは「レーン」で流す**（`sw.js` の `PREFETCH_LANES` ／ `js/tile-warm.js`）。先読みが出してよいのはブラウザ自身が読み込める URL だけ（`js/dash-extended.js` の
  カメラ先読みは http(s) 以外を出さない。プロトコル配信のタイルは `IntMapSatProto.tileUrl` を使う）。追い越された先読みは止まる（世代 `_pfGen`。ページ側のポンプが fetch 直前で
  落とし、Service Worker は同じ client の未処理分を捨てて `prefetch-dropped` で返す）。世代の鍵はタイル矩形（リングの上限は携帯 60・傾斜/飛行 110・デスクトップ 150/280）。
  落とした URL は `_pfSeen` に数えない。止まれば最後の1バッチは完走する。
- **携帯の画像同時取得数は MapLibre 自身の既定**。
- **ラスタレイヤーはタイルソースにする**（`scene.addProtocol` 契約。子が届くまでだけ親を出す）。
- **同じ正規表現を二度コンパイルしない**（`js/news-context.js` の `rebuildGeoIndex` は `terms` 配列の同一性で覚え、中身を全要素照合してから再利用する。`g`/`y` フラグが無いので
  共有できる）。
- **レイヤーのサムネイルは、パネルが見られるまで描かない**（画像の取得も canvas に描く経路も同じ門——`js/layer-previews.js` の `_paintJob` / `_openQueue`——を通る。門が開くのは
  `kick()` のときだけで、呼ぶのは格子が表示されている所——側柱の `open()`、シートの mount、表示中の格子の ★ 行）。携帯のタイル格子は 2 回 mount される（`openSheet()` と起動時の
  `applyLayout()`）ので、`mountInto` の側でシートの `show` を見る（判定できなければ開く）。門が開いたあとも canvas ペインタは `requestIdleCallback` の `deadline.timeRemaining()` と
  6 ms の時計の両方で区切り、`pointerdown` / `touchstart` / `wheel` / `keydown` で次のスライスを止めて最後の入力から 400 ms で再開する（予約だけを畳む）。1スライスで必ず1件は走る。
  IntersectionObserver で代替しない。
- **ホバーは、既に知っていることに二度払わない**（`positionTooltip` は地図コンテナの大きさを ResizeObserver でキャッシュ、`setMapTooltipHTML` は同じ markup なら書かず、地図
  ツールチップの markup を書く経路は全部これを通る）。`_hoverHub`（`js/geo-engine.js`）は全レイヤーを1回の `queryRenderedFeatures` で訊き、見えているレイヤーの一覧はスタイルと
  登録が変わったときに無効化するキャッシュで持つ。1フレームに2件目以降の pointermove だけを合流させる（最初の1件は同期）。ウィンドウの縁の当たり判定（`js/window-manager.js` /
  `js/workspace.js`）は押下は必ず生の矩形で測り、hover だけが世代付きキャッシュを読む。
- **`?perf=1`** — 実機で測る計器（`js/perf-hud.js`。フレーム時間の中央値/p90・ビューポートと交差する要素数・レイヤーごとの費用。`visibility:hidden` は数えない）。取得できない量を
  0 と書かない（`navigator.deviceMemory` は `n/a`。タイル数は「表示中」と「待機」を分け、保持先が無ければ `null`。シーンの統計は公開 API から取り経路を名乗る）。`app layers` の A/B は
  描画を止める試験で、切るときは元の可視状態を控える。

### 9.5 スマホだからできること——いま、ここ・共有で開く・写真の場所

携帯は読者がどこにいるかを知っている唯一の画面で、共有シートを持つ。その 2 つを製品の入口にした（起動時に読むものは無い）。

- **いま、ここ**——地点カード（`js/place-dossier.js`、§7.3f）を端末の現在地で開き、「いま」の節（いまの天気と今日・300 km 以内の地震——USGS の M2.5 以上・7 日・300 km 以内の
  出来事——ニュース・72 時間）を先頭に置く。続いてこの地点・時刻と太陽・その場所のかつての名前（`data/hist-cities.json` を `IntMapHistCities.near` が記録自身の判定半径で
  引く——東京なら江戸）。「近く」の定義は `js/atlas-world-objects.js` `RELATED_DEFAULTS` の 1 つ。各節は値か理由（`ok` / `none` / `unavailable`）。正確な現在地は端末から出ない
  （送るのは `PRIVACY_GRID_DEG`＝0.1°・約 11 km に丸めた地点だけで、地名の Nominatim は zoom 10 と天気。地震のフィードと出来事は位置を付けずに読んで端末で絞る——
  `js/events-near.js`。何も保存しない——privacy.html §5）。入口: 検索欄の空の状態の先頭の行（`js/here-entry.js`）・ホーム画面のアイコンの長押し（manifest の `shortcuts` →
  `?here=1`）・Atlas `research.hereNow`（確認の列は `explicit`）。地図上の任意の地点は長押しメニュー「現地の情報 ▸ 地点について」で同じカード。
- **共有で開く**（`js/share-inbox.js`）——インストールした IntMap は共有シートの宛先になる（manifest の `share_target`。POST・multipart）。静的ホストは POST を受けられないので
  `sw.js` が受けて中身を `intmap-page-share-inbox` に置き `?share=<id>` へ 303 で送る。ページは 1 度だけ読み、1 時間より古い項目を捨てる。写真は 1 枚・40 MB まで、文は 4,000 字まで。
  - **写真**: EXIF の位置と撮影時刻（`js/photo-geo-exif.js` が JPEG と HEIC/AVIF・WebP の中の同じ塊を読む）→ ピン・その地点の地点カード（起点 `shared`）・「撮影日の地図にする」
    （オフセットが無ければその日の正午 UTC）。カードは「カメラの記録」と名乗る。位置の無い写真は推測せず稜線照合（`js/photo-geo.js`）に渡し推定と言う。
  - **地図のリンク**: Google（`!3d…!4d…` を `@` より先に）・Apple（`ll`）・OSM（`mlat/mlon` を表示範囲より先に）・`geo:`・座標 → その地点。名前しか持たないリンクと文は検索欄へ。
    短縮リンクは行き先を読めないとそう言い、題で検索する。IntMap のリンクはそれ自身として開く。
  - iOS は共有の宛先になれないので、検索欄の「写真の場所」からも開ける（ファイル選択は押した瞬間に開く）。Atlas `view.openShared` が同じ関数で開く。
- **親指の時計**（`js/time-thumb.js`）——シートの頭の時計（`#m-clock`）は地図が現在以外にあるあいだその年を表示する（`js/mobile-ui.js` が `IntMapTime.on` で書く）。横に `START_PX`
  （8 px）以上、縦より大きく動かすとそれ自体がレールになる（位置→年→時計は `js/chronos.js` `writeRailPos`——`writeYearAtPos` もこれを呼ぶ。レール全体は画面幅の `RAIL_SCREENS`
  ＝3 倍。1 フレーム 1 回）。シートの上に吹き出し（時刻・「地図の中心」・中心の点を描く政体と第 1 級区分）と中心の輪。中身は `js/place-history.js` `placeHistory`（中心ごとに
  1 回読む）で、`changesOf` が中心で地図が述べることが変わる時点を並べ、`nowAt` がその時刻の言葉、`changeText` が変化の行を返す。親指はその時点で止まる（1 年が 1 px 以上の
  幅ならその年の中だけ、細いところでは `SNAP_PX`＝12 px 以内）。止まった瞬間に `navigator.vibrate`（ある端末だけ）。離すと吹き出しは 1.6 秒残り、`role=status` が 1 回読み上げる。
  離したあとの click は飲み込み、動かさないタップは Chronos を開く。矢印キーは前後の変化へ（`step`）。モジュールは最初のタッチで取りに行く。`#m-clock` は `data-time-intent` を
  宣言する。Atlas `time.stepHere`（地点・`here`・`center`・`from`・`dir`）が同じ `changesOf`/`stepFrom` で動かす。
- 遅延モジュールが `IM_HOST` を受け取る戸口は `js/host-door.js`（葉。`app-body.js` が作った瞬間に入れる）。
- 門: `tests/mobile-next-checks.test.mjs` と `tests/mobile-next.spec.js`（375×812・本物の指）。親指の時計は `tests/mobile-product-checks.test.mjs`（京都の変化の時点・1864〜1890 年・
  Atlas `time.stepHere`）。本物の指での親指の時計の検査（CDP）はまだ木に入っていない（開発記録 2026-10-08-mobile-product）。

**ヘッドレスプレビューは `document.hidden`** なので WebGL の `load` が発火せず `requestAnimationFrame` も止まる。地図描画は DOM／状態／console で検証し、UI のフェードインには
`setTimeout` のフォールバックを持たせる（`?rafshim=1` で rAF を回す開発専用シム）。
