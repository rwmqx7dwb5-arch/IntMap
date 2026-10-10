# IntMap — 現状仕様書 §7 地図・レイヤー・Globe・ウィジェットの構造

> **現状仕様書の §7。** 案内図は [`Architecture.md`](../../Architecture.md)（§ → ファイルの表）。**節番号は案内図と共有している**
> ——他の文書・コード・テストが書く「`Architecture.md` §7.x」は、このファイル（と案内図の表が同じ行に挙げる文書）の見出しを指す。
> 今どうなっているかだけを書く。変更履歴・ラウンド番号・PR 番号は書かない（`npm run check:docs` の `arch-rounds` がこのファイルも読む）。

## 7. 地図・レイヤー・Globe・ウィジェットの構造

**レイヤーの実装詳細は [`docs/MAP-LAYERS.md`](../MAP-LAYERS.md) が正本**——§7.1 気象・災害警報、
§7.6 ラベル、§7.7 レイヤー個別の注意、§7.8 地形と水、§7.9 物理シミュレーションの不変条件、
§7.10 気象モデル（ECMWF IFS）・風・レーダー、§7.14 波（海況）。節番号は向こうでも同じ。
ここに残すのは**契約**——「レイヤーを1本足すときに必ず読むもの」だけ。**レイヤーを 1 本足す手順は「宣言を 1 本書く」**（§7.3）。

**火山は主題ごとの正本を別に持つ**——同梱カタログの構成（GVP 完新世の全件＋観測機関が現在レベルを公表している座）と
GVP 番号による結合、USGS 自身の番号との突き合わせ、現在の警戒レベルの4段（USGS／気象庁／週間報告／沈黙）、火山灰 SIGMET、
公表されたハザード域だけを描く規則、SO₂、周辺人口・空港・地震、カードの分類語を9言語で言う規則と散文を訳さない理由、
カタログを問いに絞る4つの条件とマスタークロックに載せた噴火記録は [`docs/VOLCANO-INTELLIGENCE.md`](../VOLCANO-INTELLIGENCE.md)。
**放射性物質の拡散も同じ形**——ツールとしての不変条件は §7.9（あちら）、モジュールの分担と `run()` の公開契約は §2.5、
モデルの数の出所は [`docs/RADIATION-MODEL.md`](../RADIATION-MODEL.md)。

### 7.2 レイヤー欄の分類・7.5 地図の初期化

**どちらも [`docs/MAP-LAYERS.md`](../MAP-LAYERS.md) にある**（節番号は同じ）。§7.2 は 18 の棚と「新しいレイヤーはどの棚に入るか」、
§7.5 は基図・投影・初期カメラの組み立て。`§7.1`〜`§7.10` のうち **§7.3 と §7.4 以外はすべてあのファイル**にある。

### 7.3 レイヤーの宣言（`js/layers/<id>.js`）とレイヤー・データ契約 `window.IntMapLayers`

**レイヤーとは 1 つの宣言である。** 1 レイヤー＝1 ファイル `js/layers/<id>.js`（`export default { … }`）。書けること・検査・導出の
正本は `scripts/lib/layer-descriptor.mjs`、欄の一覧と各欄を読む者は [`docs/MAP-LAYERS.md`](../MAP-LAYERS.md) §7.2。宣言が述べること:

- **何であるか**——`kind`。`'display'` は**基本表示**の項目でレイヤーではない（数えず・`l=` で運ばず・Atlas の「全レイヤー」に入れない）。
  無ければレイヤー。読み手は `js/layer-manifest.js` の `isDisplay` / `dataLayers` / `displayItems` に訊く。
- **どこに立つか**——`id`・`shelf`・`order`（棚の並びは `js/layers/_shelves.js`）。
- **行の事実**——`key`・`label`・`rest`・`on`（既定で点くレイヤーは無い）・`share`・`html`・`names`（地図に名前を書く行）・`lazy`。
  レイヤー欄の一覧はここから導出され（`deriveShelves`）、`js/layer-manifest.js` が読み手に渡す（手で持つ一覧は無い）。
- **他の登録簿の中の同じレイヤー**——`registry`（`IntMapLayers`）・`state`（共有リンクの状態）・`commands`（`IntMapOS`）・
  `atlas`（能力の項目）・`sources`（出典の行）・`time`（Chronos の契約）。
- **実装のモジュール**——`pkg`（`js/layer-pkg-<pkg>.js`）。`js/data-layers.js` はその行に分岐を持たず 1 本の経路で委ね、
  初めて切り替えたときにモジュールを取る（MAP-LAYERS §7.2「レイヤー・パッケージ」）。

**レイヤーを 1 本足す:** ① `js/layers/<id>.js` を書く。② 行を作るモジュールを書く（行のハンドラ・凡例・名前の組み立ては行の持ち主に
残る）。`IntMapLayers` に登録したらその id を宣言の `registry` に書く——描かれているものを Atlas が読めるかはこれで決まる。
`js/data-layers.js` が行を作る棚なら、切替と不透明度は `js/layer-pkg-<pkg>.js` に書いて `pkg` で名指す（分岐の追加・行数の増加は
`check:static` が拒む）。③ それだけ。`js/layer-manifest.js` の生成領域は `npm run build` が書き直し（`node scripts/layer-descriptors.mjs --write`）、
門（`tests/layer-descriptor-checks.test.mjs`）が宣言の形・棚・位置の重なり・索引の鮮度・各欄の結び目を登録簿と照らす。
照らせない主張（実行時に組み立てる登録）は書かない。`label` の無い行の名前は行を作るモジュールの `L.arr(LA(…))` が持つ
（翻訳の門はその呼び出しで翻訳を見つける）。

**以下は、宣言の `registry` が指す実行時の契約** `window.IntMapLayers`:

- API ＝ `register` / `state` / **`sampleAt(lng,lat)`** / `featuresIn(bounds)` / **`featuresInSource(srcId, bounds)`** /
  **`loaderOf(id)`** / **`narrow(features, bounds)`** / **`declaration(id)`** / `legend` / `time` / `source`。
- **登録は「読者に見せる文」と「その文を作った数量」の両方を渡す。** 数値の場から答える行は **`measure(lng,lat)`** を実装し、
  `{value, unit}`（数量）または `{code, label}`（分類）を返す。`sampleAt()` はそこから文を作り、行に `number` / `unit` / `code` を
  添える（`js/gis-datasets.js` の `asNumber` はセル全体が数でなければ数と認めないので、`「12.3°C」` は格子にならない）。
  数量は上流が公表した単位で持ち、変換は表示だけが行う。文しか作れない行（火災画素数・コロプレスの複数値）は `measure` を
  持たない。どの行が数量を述べるかは登録が決め、一覧は無い。
- **`load()` を述べた行は、描かれていなくても読める。** `featuresIn` はレンダラが保持しているものを返すので、`load` は同梱文書を
  描かずに渡す扉で、`loaderOf` がそれを `js/gis-layers.js` に渡して非同期の供給元を組み立てる。範囲の判定は `narrow` 1 つ。
  箱の中の地物を拾う判定は幾何の種類に依らない。`featuresInSource` はレイヤー行を持たないレンダラの source にも同じ窓を開ける。
- **新しいレイヤーを足したら、同じ変更の中でここへ登録し、その id を宣言の `registry` に書くこと**（Atlas から使えるかを決める）。
  `declaration(id)` は宣言を返す（チェックボックスの id でも登録した id でも同じ）。`declarationOf(id)`（供給元が何を持つか）とは別の問い。
- 消費側は Atlas の `stateContext` に入る実データ行・`layerData` アクション・`analyze` の証拠集め。
- **凡例の名前は「表」で渡す。** `window._registerLayerOpacity(id, names, …)` の `names` は言語ごとの配列（文字列を渡すと
  `names[1]` が 2 文字目になる）。受け側でも正規化する。
- **凡例の積み直しは「頼む」もので、行うのは 1 フレームに 1 回。** `tileLegends()`（`window._tileLegends`）は頼むだけで、
  `js/runtime.js` の `frame`（鍵 `legends.layout`）に次のフレームの `placeLegends()` を 1 回予約する（隠れたタブでは見えるように
  なったときに置く。依頼の途中の依頼は次のフレームへ）。同期で位置を要る呼び出し元は無い。母集合が要るなら
  `discoverLegends()` に訊く（`_minimizeOpenLegends()` がそうする）。実測: 配置は 20 秒に 910 回 → 73 回。
- **凡例は容器の中にしか置かれない。** `placeLegends()` は開いている凡例を下から積み、次の 1 枚が容器の上端に届くなら列を右へ
  折り返す（その列の実測幅の最大＋12px）。容器より高い凡例は `max-height`＋内部スクロール（題と閉じるボタンが画面内に残る）。
  高さも幅も位置を 1 つも書く前に全部読む。読者が動かした凡例（`data-dragged`）は対象にしない。容器の右端で止めた列の凡例は
  `right` で留める（`left` で留めると幅 `auto` の凡例が配置のたびに太って這う）。1 枚が入りきらないほど太いときは `left`＝起点。
- **凡例とは何かは `discoverLegends()` の 1 か所。** 名前で持つ凡例＋生きた集合（`getElementsByClassName`）の `.data-legend` のうち
  id が `data-legend-ec-` で始まる ECMWF の箱＋`.data-legend.generic-legend`。
- **凡例の大きさが変わったら積み直す。** 見つかった凡例は全部 1 つの `ResizeObserver`（`watchLegendSize`）に登録され、変化は
  `tileLegends()` の依頼になる（開閉・遅れて届いた中身・行数の変化のどれでも）。観測コールバックの中で積み直さない。
  `placeLegends()` は値の変わらない書き込みをしないので収束する。配置が読んだ大きさは `watchLegendSize` に渡され、報告がそれと
  半 px 以内なら何も頼まない（比べられない報告は変化として扱う）。携帯でもデスクトップでも同じで、デスクトップは下端基準で積む
  （開いた 1 枚がその上を押し上げる）。読者が自分のボタンで開いた凡例は畳み返さない（`legPinOpen`。自分で閉じれば外れる）。
- **携帯（≤768 px）の凡例の置き場は、地図の上に浮いている部品が残した場所。** 起点と右端は `css/intmap.css` の
  `--m-legend-top` / `--m-legend-right` で、左の列（地名検索の丸と `.bm-square`）の下端と右の丸ボタン列（`.m-fab-stack`）の幅から
  導出される（§9.2）。2 つは `@property` で長さとして登録してあるので、`placeLegends()` は解決済みの px を 1 回で読む
  （CSS の無い偽 DOM では 64 px）。凡例の `top`/`left` に `!important` を付けない。ケッペンの凡例も携帯では同じ置き場の一員。
- **「画面に出ている凡例」はページに訊く。** 判定は `legendShown()` の 1 か所で、`placeLegends()` と携帯のタップ時の
  `_minimizeOpenLegends()` が読む。母集合は持ち主が隠しておらず（インラインが `none` でない・`hidden` でない）、計算済みの
  `display` が `none` でない凡例（`flex` も数える。偽 DOM ではインラインの宣言だけ）。「閉じた」（`legSeen`/`legPinOpen` を忘れる）は
  持ち主が隠したときだけで、スタイルシートが全凡例を消しても忘れない。
- **自分の置き場を持つ凡例（`data-own-place`）は動かさず、ほかをその外に積む。** 携帯以外で、そう宣言した凡例（今はケッペン：
  上端基準・全高・縦のリサイズつまみ）は積み直さず、実測の箱を障害物として読む。積み上げの 1 枠が障害物にかかれば列はその高さで
  終わり、次の列は障害物の右端の先から始まる。携帯では宣言を読まない。
- **段彩の凡例は連続、分類の凡例は帯。** 世界銀行系の塗り分けはグラデーション帯で、停止は値の位置に置く。タイルのサムネイルも
  同じランプを層から読む（`IntMapWB.rampOf`）。
- **1分類＝1色。** `js/layer-packs.js` の `paletteOf(n)` は手で選んだ30色を使い切ったあと **黄金角 137.508°** で色相を進め、明度・彩度を
  3 通り循環させ、既出の色なら明度をずらして必ず一意にする。言語レイヤーは **360 言語（Glottocode）**を持ち、どこかの国で最多
  話者である **69 言語**が凡例の行と色を持つ（＋「割合の公表なし」の1行）。`IntMapCulture.palette(n)` / `.colourOf(k,cat)` が公開する。
  **同じ語族は同じ色相**（`FAM_COL`）。セルビア・クロアチア・ボスニア語などの 5 標準は同一色相の明度差で並び、その色は生成
  パレットから予約する。見本が区別できない鍵は鍵ではない。
- **言語レイヤーの分類は Glottocode であって ISO 639-1 タグではない。** `data/language.json` が国ごとの記録（`top`／`pct`／`shareType`／
  `mix`／`listed`／`roles`／`unnamed`／`y`／`src`）と言語の名前を、`data/language-tree.json` が Glottolog の分類全体（族・言語・国が指す標準、
  親・ISO 639-3・カテゴリ・存続状態つき）を持つ。地図と系統樹は 1 つのモデルの 2 つの表示で、問い合わせは
  `IntMapCulture.langName / isoOf / tree / lineage / noShare`。`top` は「最大の実測シェア」で、出典が割合を公表していない国
  （204 か国中 107 か国）は `top:null`＝専用の色（`NO_SHARE`）で、凡例とポップアップがそう言う。系統樹（726 kB）はレイヤーを入れた
  ときにだけ取る。名前の解決は `scripts/lib/glottolog.mjs` の明示された規則（主名・別名・国・最小共通祖先・ISO 639-3 マクロ言語・
  語順・バントゥ語類接頭辞・綴りの類似）か、`data/language-aliases.json` に理由を書いた判断だけで、どちらでもない名前はビルドを
  落とす（`npm run check:languages`）。
- **全面を覆うデータ画像は「ラベルの直下」に載せ、その位置を訊く先は 1 つ——`window.IntMapBelowLabels()`（`js/data-layers.js`）。**
  気象のアンカー `E.before()` はデータ帯の底なので、そこに置いた全面画像は後から点いた全面ラスタに塗り潰される
  （`js/label-occlusion.js` がラスタをラベル直下まで沈めるため）。`styledata` でスタイル自身のレイヤー順の署名が変わったときだけ
  位置を取り直す（custom layer は `getStyle()` に載らないので帰還ループにならない）。詳細は [`docs/MAP-LAYERS.md`](../MAP-LAYERS.md) §7.14。
- **長い凡例は `.im-more`（`<details>`）で畳む**（`css/intmap.css`）。
- **レイヤーを切り替えてもカメラは動かない。例外は `js/layer-home.js` の表だけ。** `window.IntMapLayerHome.arrive(<checkbox id>)` が、
  データが 1 つの地域にしか無いレイヤー（EU members / NATO members / U.S. presidential elections / National elections / Ukraine frontline）を
  **セッション中1回だけ**枠に収める。`goTo()` は読者がレイヤーの中で場所を選んだとき（国政選挙の国セレクタ）で毎回動く。どちらも
  表のチェックボックスにしか効かない。各レイヤーのファイルに `fitBounds` を書かない。セッション復元は `js/session-tabs.js` が
  `__imRestored` を付け、`arrive` はそれを使い切って飛ばない。枠は測る——EU は `window.IntMapEuFC()`、NATO は
  `window.IntMapNatoFC()`、ウクライナは `window.IntMapUkrFrontFC()`。EU と NATO は各加盟国の最大の陸塊だけを国コードごとに囲む
  （域外領土やアリューシャン列島で枠が海へ伸びない）。NATO の枠は条約適用地域——`buildNatoFC()` は北回帰線より南の多角形を
  落としてから塗る（Article 6）——で、Chronos の加盟年にも従う。

### 7.3a 世界遺産 (World Heritage) — `js/beta-overlays.js`

- 同梱 `data/whc-sites.json`（`scripts/build-whs.mjs` がユネスコ世界遺産センターの XML から生成）。上流は Cloudflare のボット検査の
  内側で CORS ヘッダも無くブラウザからは読めないので同梱し、生成器は `curl` を呼ぶ（Node の `fetch` は TLS の指紋で 403）。
- **「物件」と「点」を分けて持つ。** `sites` が 1 物件 1 行（全言語の名称・区分・登録年・登録基準・国・危機遺産の年）、`points` が
  `[物件index, lng, lat, 国index]` の平坦配列。FeatureCollection は読者の言語で実行時に組む（言語を変えても再取得しない）。
- 解説文は `data/whc-detail.<locale>.json.gz` に言語ごとに分かれ、最初にカードを開いたときだけ 1 本取得する
  （`DecompressionStream('gzip')`）。訳の無い物件はその言語のファイルにも英文が入っている。
- **`whs-src` へ書くのは 1 か所だけ**（`whsPush()`）。取得直後・基図切替の自己修復・言語変更の 3 つは全員 `whsPush()` に頼み、
  そこが 1 tick 分を 1 回にまとめ、直前と同じ collection なら書かない。`addSource` は書いた記憶を捨てる。
- 面は `window.__imWhsLayer`。カーネルコマンドは `heritage.open` / `heritage.filter` で、凡例のボタンと Atlas が同じものを押す。
- 出典は 2 つ——一覧はユネスコ、いま危機遺産かどうかは Wikidata（`docs/MAP-LAYERS.md` §7.7）。

### 7.3b 予報モデル（複数）

- **どのモデルが存在するかの正本は [`js/wx-models.js`](../../js/wx-models.js)（`window.IntMapWxModels`）1本。** 宣言するのは
  **提供の可否・表示名・公称解像度・出典機関・ライセンス・役割**だけ。格子・カバー範囲・変数・気圧面・予報期間・有効時刻は
  書き写さず、SDK の domain 表と各モデル自身の `latest.json` から**導出する**（手書きの変数表は黙って間違う）。
- **`.om` のパス規則はモデル非依存**（`<host>/<id>/<ref>/<valid>.om`）。ホストの綴りは `js/wx-models.js` にしかない。ホストは
  Open-Meteo が AWS Open Data で公開する S3 バケット（`openmeteo.s3.amazonaws.com/data_spatial`——公開・CORS `*`・Range 可・
  CC-BY-4.0・保持 7 日）で、ブラウザが直接 Range 読みする。Open-Meteo 自身の CDN（`data-spatial.open-meteo.com`）は Referer が
  `*.open-meteo.com` か localhost のときしか答えない。上流のホストが消えると計器は「no metadata」「field did not load」としか
  言えないので、`tests/prod-smoke.spec.js` は 5 本の気象試験の前に配信元の名前解決・CORS・Range 応答を単独で訊く。
- **「このモデルでこれを見せてよいか」は共通部分**——`availability()` が「提供の可否 × ライブ metadata × カバー範囲 × 変数 × 時刻」を
  突き合わせ、**理由コードを返す**（ECMWF IFS HRES に気圧面は0面、GFS 0.13° に `pressure_msl` / `cape` / `dew_point_2m` は無い）。
- **エンジンはモデルごとのインスタンス**（`js/wx-ecmwf.js` の `createModel(cfg)`・`window.IntMapWxEngine.model(id)`）。
  `window.IntMapECMWF` は既定モデルのインスタンスそのもの。ページに 1 つしか無いもの——SDK・`om://` の登録・開いたファイルの
  プール（`READER_MAX` はページ全体の予算）・32 MB のブロックキャッシュ・色の ramp・スタイルレイヤーの索引——は factory の外。
- **モデルの選択はレイヤーごと**（`js/weather.js` の `state[id].model`）。
- **同じ読みへの 2 回目の要求は合流し、打ち切らない。** `load()` の整理券は read に付き（合流する側は合流先の券を更新する）、
  打ち切るのは別のファイル・時刻・帯への読みだけ（[`docs/MAP-LAYERS.md`](../MAP-LAYERS.md) §7.14）。
- **利用者に見せる文言は `displayed` からしか作らない。** 各気象レイヤーは `requested / loading / displayed` の3状態を持ち、
  `displayed` への代入は `commit()` の1か所だけ、新スロットを現し旧スロットを落とすのと同じターンで呼ばれる。
- **モデルを変えても瞬間を保つ**（index ではなく最も近い有効時刻へ）。
- **レンダラ SDK の `getColorScale()` は知らない変数に気温のスケールを返す**（`?? temperature`。live 変数 857 のうち 212 がそこに落ち、
  52 は気温ではない）。出荷するレイヤーは `kind:'temp'` のときだけこの分岐に落ちてよい（`tests/weather-models-checks.test.mjs ⑧` が
  バージョン固定の実測 fixture と突き合わせる）。
- **`.om` の単位と配色表の単位は同じとは限らない。** `pressure_msl` は **Pa** で届き、SDK の `pressure` 配色表は **hPa**（出荷 8 変数で
  食い違うのはこれ 1 つ）。食い違いは `js/wx-ecmwf.js` の **`FIELD_UNITS` ただ 1 か所**で宣言し、他はそこから導く。

  | 何を | どの単位で | どこから |
  |---|---|---|
  | レンダラへ渡す配色表（`omSettings().colorScales`） | **場の単位** | 読み手の表を `inFieldUnits` で `× per` |
  | `scale()` / `legend()`（凡例の帯・目盛・単位） | **読み手の単位** | `displayScales`（SDK の表そのまま） |
  | `sampler()` ＝ `valueNow` / `valueAt`（地点値） | **読み手の単位** | 場の値を `÷ per` |
  | 等圧線のラベル（`text-field`） | **読み手の単位** | SDK が書いた等値線の値を `÷ per` |

  配色表を場の単位で渡すことが色ラスタと等値線の高度の両方を正す。エントリを増やすのは実際に食い違うときだけ
  （空でないエントリは正しい場を 100 倍する）。
- **ベクタのタイルは「何を描くか」を URL で言う。** `arrows=true` なら風の矢羽根、`contours=true` なら等値線で、どちらも書かない URL の
  MVT には `contours` レイヤーが存在しない。等値線のラベルは `symbol-placement:'point'`（`'line'` / `'line-center'` はこの等値線の
  短い区間に 1 枚も配置できない）。フォントは `Noto Sans Regular` を明示する（このスタイルの glyph 配信元の書体）。

### 7.3c 世界の鉄道 (World railways) — `js/railways.js`

レイヤー行 `beta-dl-rail`、レイヤー id `rail-ln` / `rail-det-ln` / `rail-cons-ln` / `rail-st` / `rail-st-lbl`、不透明度キー `rail2`。
**モジュールは遅延**（`IntMapLazy.need('railways')`）で、行・Compare・`styledata` 自己修復・メモリ圧のすべてがこの口を通る。

**値はすべて、その線路そのものに付いた OpenStreetMap のタグである**（国から推定する項目は無い）: 軌間 / 電化方式・電圧・周波数 /
最高速度 / 線路数 / 旅客・貨物 / 幹線・支線・専用線・観光 / 高速鉄道 / 運行状態（運行中・建設中）/ 路線名・路線番号 / 運行会社 /
開業年 / OSM way id。

| 配信物 | 中身 | いつ |
|---|---|---|
| `data/railways/world.json.gz` | 幹線・支線を一般化した全世界。文字列は持たない（**111,660本・0.89 MB gz**） | z < 6.5 |
| `data/railways/c/<lat>_<lon>.json.gz` | 5°セル。全属性・路線名・事業者・OSM way id（**579本・計 10.5 MB gz**・最大 586 kB・中央値 4 kB） | z ≥ 6.5・表示範囲ぶんだけ |
| `data/railways/st/<lat>_<lon>.json.gz` | 駅・停留所（`railway=station`/`halt`）。事業者・網・UIC・発着種別（**135,238件・541セル・計 4.0 MB gz**・最大 174 kB） | z ≥ 8・表示範囲ぶんだけ |
| `data/railways/index.json` ／ `st-index.json` | 存在するセルの一覧と gz バイト数（線／駅） | 常時（404 を撃たないため） |

- **塗り分けの軸は6つ＋線種**（軌間／電化方式／最高速度／複線・単線／旅客・貨物／運行状態／線種）。バケットと色と配信の符号器は
  **`js/rail-schema.js` 1本**で、ビルド（`scripts/rail/build.mjs`）とブラウザが同じファイルを import する。export は名前空間 1 本
  （`RailSchema`。`tests/layer-boot-graph-checks.test.mjs ③` は js/ の export が js/ から名前で import されることを要求する）。
- **どの軸にも「OSM に記載なし」のバケットがあり、その灰色はどの回答の色とも一致しない**（タグの付与率は地域差が大きい。灰色は
  既定値でも主流値でもない）。
- **軸の切り替えは `setPaintProperty` だけ**（バケットは読み込み時に全軸ぶん feature に刻む）。
- **世界図を消すのは詳細セルが描ける状態になってから。** 詳細の線を先に出し、世界図は `rail-det-src` の `sourcedata` が
  「読み込み済み」をタイル着地（`e.tile`）とともに述べたとき、タイルを持たないエンジンが読み込み済みを述べたとき、地図が `idle` に
  なったときの最初の1つで下ろす（`revealDetail`）。`sourceDataType` 付きの告知は描画の証拠にしない。時限は置かない。より新しい表示・
  閾値未満への縮小・OFF・`drop()` は待っている引き渡しを取り消す。
- **`toggle(true)` は冪等である。** モジュールはソースがいま持っているもの（`rail-src` の世界図と、`rail-det-src` の表示中または
  引き渡し中のセルの組）を覚え、同じものは再送しない。記録を消すのは詳細が地図から下りたとき（閾値未満・セル過多・OFF・`drop()`）と、
  `ensure()` がソースを作り直したとき（`detailCovers` も戻す）だけ。
- 基図差し替えの自己修復は、この行のレイヤー（`ROW_LAYERS.rail`）がスタイルから消えたときだけ `toggle(true)` を呼ぶ（§12
  「`styledata` の自己ループ」）。不透明度の登録も同じ一覧を読む。
- 出典は **OpenStreetMap contributors (ODbL 1.0)**——帰属の義務がある（`js/reference-data.js`）。

規模: OSM の `railway=rail` は世界で **2,816,264 way**。側線・入換線を除いた掃引は **1,645,547 way**、連結・間引きののち
**総路線長 1,608,045 km**。

**データの作り方**（`npm run build:rail`・オフライン。実行時はネットワークに触らない）: `scripts/rail/fetch.mjs`（Overpass を10°セルで
掃引・大きすぎるセルは4分割・セル単位でキャッシュ＝再開可）→ `scripts/rail/build.mjs`（OSM way id で重複排除 → 属性が同一で
端点が繋がる way を1本に連結 → 段ごとに間引き → 5°セルへ切り出し）→ `scripts/rail/stations.mjs`。
掃引の前に**被覆の関門**（既知の答えがある箱＝ルール地方の `railway=rail` 5,650本を各インスタンスに訊き、空を返した地域限定
インスタンスを落とす）。拒否されたセルはキューに戻す（冷却＋再選出、試行回数で数える）。構文エラーは `bad-query` として即座に投げる。

### 7.3d 利用者が持ち込むファイル (User data import) — `js/geo-import.js`

地図にファイルを落とすか「地図データを読み込む」（`#btn-upload-geojson`）を押すと、`js/map-ui.js` の `geojsonUpload` が
`js/geo-import.js` をその場で `import()` し、FeatureCollection を `ugj-<n>` という source と `-fill` / `-line` / `-pt` の 3 レイヤーにする。
取り込んだレイヤーは**セッション限り**。

**読める形式** — GeoJSON（FeatureCollection / Feature / 裸の geometry / `features` だけを持つ物）、KML、KMZ、GPX、CSV・TSV その他の
区切り文字つきテキスト、セルに入った WKT と GeoJSON geometry、**Shapefile**（zip の中の `.shp`＋`.dbf`＋`.prj`＋`.cpg` を組で。
`js/gis-shapefile.js`）、**GeoPackage**（`js/gis-geopackage.js`。拡張子ではなく先頭 16 バイトで見分け、容器の判定の後・文法の decoder
より前に訊く）、**Excel（`.xlsx`）**（下）。zip と gzip は開いて中身を見る。

**形式は 2 つの別々の問いで、別々のものに訊く。**

| 問い | 訊く相手 | 答え |
|---|---|---|
| これは何の**容器**か | **バイト列** — `js/atlas-attach.js` の `ATL_FILE`（§2.2b） | zip / gzip / pdf / ole と、どの文字コードとして復号できるか |
| これは何の**文法**か | **中身** — `js/geo-import.js` の decoder レジストリ | JSON として解けるか・XML の根要素は `kml` か `gpx` か・表として読めるか |

**拡張子の一覧は存在しない**（ファイル名はレイヤーのラベルにだけ使い、`<input type="file">` に `accept` も無い）。`ATL_FILE` は共有で
（`sniff` / `decodeText` / `zipOpen` / `gunzip` を import）、読み込み量の天井（`readBytes`）も `ATL_FILE.LIMITS` をそのまま使う。

**CSV の緯度経度列の決め方**——拒否と選択は別の機構:

- **拒否（veto）は値の性質**——ほぼ全行が座標として読める・緯度なら `[-90,90]`・経度なら `[-180,180]`・定数列でない・半球記号が
  別の軸を名乗っていない。列名は veto を解除できない。
- **選択（score）は根拠の重み**——9 言語の列名（`latitude` / `緯度` / `Breite` / `широта` …）、値の中の半球記号、「緯度になり得ない値」。
  隣接は同点のときだけ効く。veto を通っただけでは根拠ではなく、**列名・半球記号・±90 を超える値のいずれか 1 つ**が座標だと
  言わない限り `coordinates-not-identifiable` で断る（数量と価格の列も ±90 に収まる）。
- 区切り文字は `,` タブ `;` `|` のうち最も表らしく割れるもの。`;` を選んだときだけ `,` は小数点。見出し行の有無は 1 行目と本文の
  数値の出方を比べて決める。

**拒否はコードで返る**（`{ok:false, why:'shapefile'}`）。9 言語の文面は `js/map-ui.js` の `reasonText()` が持ち、
`tests/file-import-checks.test.mjs` ⑩ が両方を構文解析して「返しうるコード」と「文を持つコード」の集合の一致を測る。
**PMTiles はまだ読めない**——何のファイルであるかを名指して断る。

**座標が見つからないことは「読めない」ではない。** 見出しを持つ区切りテキストで座標列を特定できなかったものは `format:'table'`——
**`geometry:null` の行**として返り、考慮した列と断った理由は `stats` に載る（地域コードで境界に `join` する右側の表）。見出しの無い
ファイルにこの道は無い。

**Excel（`.xlsx`）も表として読む**——zip の中身が `xl/workbook.xml` を持つとき、`ATL_FILE.sheetTables` がセルのまま返した最初の読める
sheet を表の decoder（`decodeRows`）が読む。座標の無い表を場所に結ぶ段はデータスタジオ（§7.3h）にあり、そのような表を落とすと
スタジオが開く。

**取り込んだ結果は必ず `window.IntMapGeodesy.sanitizeFeatures` を通る**（`js/geodesy.js`）。そこが `MultiPoint` と
`GeometryCollection` を落とすので、decoder 側で単一 geometry に展開してから渡す。

### 7.3e データセットと処理の基盤 (The GIS core) — `js/gis-*.js`

**取り込んだデータ・内蔵データ・分析結果を同じ 1 つの形で持ち、処理の出力が次の処理の入力になる層。** 正本は
[`docs/GIS-CORE.md`](../GIS-CORE.md)（各カーネルの契約・拒否コード・不変条件の詳細）で、ここには**構造の骨格だけ**を書く。

| ファイル | 公開名 | 何の正本か |
|---|---|---|
| `js/gis-datasets.js` | `window.IntMapData` | データセットの形（`id`・`kind`・`geometryType`・`crs`／`sourceCrs`・`fields[]`・`count`・`time`・`features()`／`read()`・`provenance`・`stale`）、列の型づけ、時刻の宣言の検証、列の量の宣言（`declareField(id,name,{quantity})`→ `quantity`・`quantityStated`・`quantityRefused`。格子のバンドの宣言は `fields[]` にも載る）。「この文字列は数か」は 1 つの factory（`numberRuleFactory()`）で、別スレッドへは factory を渡す。正規化は冪等 |
| `js/gis-geometry.js` | `window.IntMapGisGeometry` | **幾何カーネル**——`union` / `intersection` / `difference` / `dissolve`・`bufferKm`・述語（`intersects` / `contains` / `within` / `disjoint`）・形からの最短測地距離 `distanceKm`・`pointInGeometry`・`validate` / `repair`・位相 `coverage`（条件は呼び出し元が `forbid` / `report` / `allow` で述べる。修復は提供しない）。算術は自己完結した factory（`geomKernel(deps, call)`）で同じバイトが別スレッドでも答え、運べない演算は `clipper-unavailable` / `geodesy-unavailable` と答える |
| `js/gis-crs.js` | `window.IntMapGisCrs` | **座標変換と解析用の平面**——`define` / `known` / `resolve` / `transformGeometry` / `transformFeatures` / `why` / `looksProjected`、`projections` / `projection` / `distortionAt` / `assess` / `suggest` / `areaOn` / `lengthOn` / `planeSpellings`。面の名指し方は `PLANES` から導出（`kind:v1,v2` の一般文法）。面は呼び出し元が選び、測った値は単位と歪みを伴う |
| `js/gis-raster.js` | `window.IntMapGisRaster` | **数値ラスターのカーネル**——`sample`（6 方式: nearest / bilinear / cubic と average / sum / mode）・`zonal`・`mask`・`diff`・`combine`・`merge`・`polygonize`・`build`・`pixelAreaKm2`・`describeBands`・`fromSampler`。footprint は `box` と `ring` の 2 形（`sampleCellForms()`）で、集約の規則は 1 本 |
| `js/gis-geotiff.js` | `window.IntMapGisGeotiff` | **GeoTIFF / COG の読み手**（依存なしで TIFF 6.0）——`sniff` / `read` / `readUrl` / `refusals`。バイトの供給元は `{size, read(offset,length)}` の 1 契約で、窓を覆う tile／strip だけを読み、`levels` / `levelAt` / `levelFor` が overviews から要求を満たす最も粗い段を選ぶ。BigTIFF・PlanarConfiguration 2・predictor 3 も読み、扱えないもの（JPEG-in-TIFF など）は名前を付けて断る。欠損は NaN |
| `js/gis-warp.js` | `window.IntMapGisWarp` | **格子の再投影と再標本化**——`to4326` / `resample` / `align` / `methods` / `affineOf` / `footprintModes`。`method` に既定は無い。`opts.sink`（`begin` / `write` / `end`）へ窓ごとに書き出せ、予算は `opts.budgetBytes` か扉の `budgetBytes()` に訊く（無ければ受け皿を渡したときだけ `warp-budget-not-stated`）。超過は拒まず `report.memory.overBudget`・`report.footprint.boxExcess` として述べる。`footprint:'exact'` と `areaTolerance` |
| `js/gis-sources.js` | `window.IntMapGisSources` | **供給元**——`list` / `features` / `region` / `acquire` / `declare` / `supply` / `supplierOf` / `plan` / `acquirePlanned` / `capabilitiesOf` / `measureCapabilities` / `auditCapabilities`。取得は必ず `coverage`（`all` / `partial` / `sample` と理由・範囲・時点・解像度）を伴い、`all` は供給元の宣言からしか届かない。`plan()` が上流で効く条件と後段に回る条件を述べ、`acquirePlanned()` が窓を取り切る（できなければ `plan-unsatisfiable`。後段は `kind:'staged'`）。答えた道は `coverage.answeredBy`。`analysis:true` はカメラ依存の答えを `renderer-view-dependent` で断る。能力は申告（導出）と実測（呼び手と同じ扉）の両方で、3 値のまま |
| `js/gis-index.js` | `window.IntMapGisIndex` | **空間索引**——`build` / `query` / `queryEach` / `stats` / `resetMetrics`。偽陰性を出さない。種別は `grid`（既定）と `tiered`、`kind:'auto'` は数えて選ぶ。`stats()` が仕事そのもの（`buildMs` / `queries` / `queryMs` / `candidates` / `delivered` / `scanned` / `candidateRatio` / `scans` / `stopped` / `oversizeRatio` / `retained`）を述べる。厳密な判定は `queryEach(…,{test})` として渡される |
| `js/gis-expr.js` | `window.IntMapGisExpr` | **式の解釈器**——`parse` / `evaluate` / `compile` / `functions` / `refusals` / `portable` / `nodeKinds`。自己完結した factory（`exprKernel()`）で、数値規則は `numberRuleFactory()` を渡す（無ければ `expr-no-number-rule`）。運べるかは queue の前に `portable(ast)` で訊く |
| `js/gis-units.js` | `window.IntMapGisUnits` | **量の単位**——`parse` / `compare` / `convert` / `unitOfExpr`。`rasterDiff` / `mosaic` / `compute` / `rasterCalc` が同じ 1 か所に訊く。表は SI の定義値の原子だけで合成単位は解析する。沈黙は不一致ではないが、読めない綴りどうしは `unit-mismatch`。°C・°F は読みの換算と差の換算が別 |
| `js/data-governance.js` | `window.IntMapDataGovernance` | **出自・権利・鮮度・測定の語彙**——`SPELLINGS`（`licence` と `license` が 1 つの事実だと述べる唯一の場所） / `FACETS`・`SUBJECTS` / `REASONS` / `FRESHNESS` / `read` / `freshness` / `attribution` / `account` / `measureQuality`。値を 1 つも持たない。表示文は値から導出する。`unknown` は弱い `stale` ではない。多上流の束は最も厳しい義務を残し、1 つでも沈黙していれば `null`。`scripts/data-governance.mjs` が Node でそのまま読む。正本は [`docs/DATA-GOVERNANCE.md`](../DATA-GOVERNANCE.md) |
| `js/gis-layers.js` | `window.IntMapGisLayers` | **地図のレイヤーをデータセットにする橋**——`sources()` / `read()` / `toDataset()`（同期） / `acquireDataset()`（非同期） / `toRaster()` / `supplierFor()`。`load()` を述べた行には非同期の供給元が組み立てられる。供給元になれるかは行自身の宣言が決める。取得条件の語彙 `acquireFields()` の正本（ラスタは `bounds` / `width` / `height` / `where` / `unit` / `time` / `band`） |
| `js/gis-ops.js` | `window.IntMapGisOps` | 処理（`filter` / `buffer` / `clip` / `intersect` / `difference` / `union` / `dissolve` / `relate` / `sample` / `zonal` / `rasterMask` / `rasterDiff` / `resample` / `rasterCalc` / `mosaic` / `rasterize` / `polygonize` / `measure` / `validate` / `repair` / `timeWindow` / `join` / `compute` / `aggregate` / `spatialJoin` / `nearestJoin` / `timeJoin` / `convert` / `coverage` / `profile` / `compareZones` / `reach`）の宣言と実行。結合は `cardinality` 必須、最近傍は索引の巡回順で答えない、時点の結合は半開区間、換算は単位カーネルに訊き `resolved` に残す、集計は量の意味に照らして判定を記録、量の著者は `quantityStatedBy`（`caller` / `column` / `band`）、`aggregate` の `weightBy`（`memberArea` 既定／`intersectionArea`）。`profile` / `compareZones` / `reach` は比べられる形にするだけ（`asOf` は比較されるだけで書き込まれない。分割・併合の判定は返さない）。引数の語彙は所有するカーネルに訊く（`valuesOf`）。計算した面を `surface`（`sphere` / `degree-plane` / `degree-grid` / `stated-plane`、`surfaces()`）で述べる。中止は `ctx` で下のカーネルまで渡す。出力は入力の意味（最も弱い `coverage`・時点・単位）を引き継ぐ |
| `js/gis-atlas.js` | `window.IntMapGis.atlas` | **Atlas がこの層に処理を依頼する扉**。目録は `ops()` そのもの。入力は登録済み id・題名・`layer:<id>`、出力は次の処理の入力になる id。能力は `data.gis`（計算）と `map.drawDataset`（描画）の 2 つ。取得条件（`acquire`）の語彙は `acquireFields()` に訊き、`op` の無い依頼は取得だけ（行・`coverage`・`next`）。`describe()` の `query.capabilities` が導いた申告を運び、実測は `capabilities(ref, opts)` ＝ `auditCapabilities` |
| `js/gis-project.js` | `window.IntMapGisProject` | IndexedDB への保存・復元・引数を変えた再計算。ディスクに書くのはレシピだけ。タブの記憶に 1 回の実行の記憶（`cache`）を置き、鍵は条件 5 軸（入力のバイト・`describe()`＋読者の宣言・op でない祖先の出自・パラメーター・カーネルの版）の sha256（時刻は入らない。版を述べない部分があれば鍵を作らない）。引いた記録は突き合わせ、予算はバイトで LRU、使い回した段は `reused` |
| `js/gis-worker.js` | `window.IntMapGisWorker` | **Worker の束ね役**（応答性の yield の隣の並列性）。`rasterDiff` の画素ループがここで走る（使えなければ主スレッドで完走し理由を書く）。中止は `terminate()` まで届き、`available()` と `probe()` は別の問い。幾何の運び口（`geometry.op` / `provideGeometry` / `geometryOps` / `geometryReady`）。`status().stopReachesRunningWork`、`runBlocks` の `partial` |
| `js/gis-panel.js` | `window.IntMapGisPanel` | 操作卓（一覧・属性表・由来の連鎖・実行・保存） |
| `js/gis-runtime.js` | `makeGisRuntime` | **組み立て**——ブラウザ入口と同じ `mount()` で 15 のカーネルを載せる。借り物は `EXTERNALS` が全一覧（各項に読み手の file:line）。`externals` を渡せば閉じた集合（`scope-carries-uninjected`）、渡さなければ生きた scope。plan → 検査 → install → mount で失敗したら巻き戻し、mount 後に 15 の global の同一性を照合（`kernel-not-reachable`）、二度目は同じ組。名前を持った実行コンテキストの表（`mount(scope, HOST, CONTEXT)`・`API.context`・`IntMapGisContext`・`contexts()`・`release(ctx)`＝自分が置いたものだけ外す、`keptForeign`、`context-id-taken`）。1 realm に 2 組は `scope-conflict`。2 つ目の realm は `workerSource({coreUrl})` / `serve(port)` / `attach(port)`、渡れない結果は `result-not-transferable`（どの message にも返事がちょうど 1 つ） |
| `js/gis-core.js` | `window.IntMapGis` | 上を起動する 1 つの扉と `draw()`——地物は `window.GeoJSONUpload` の 3 レイヤーへ、格子はエンジンの動的画像へ。「描けた」は描画器が報告した事実 |
| `js/gis-shapefile.js` | `window.IntMapGisShapefile` | **Shapefile の読み手**（`.shp` / `.dbf` / `.prj` / `.cpg`）——`read` / `group` / `refusals` |
| `js/gis-geopackage.js` | `window.IntMapGisGeopackage` | **GeoPackage の読み手**（依存なしで SQLite を読み取り専用で）——`sniff` / `tables` / `read` / `refusals` |
| `js/gis-export.js` | `window.IntMapGisExport` | **出口**——`formats(kind)` / `write(ds, format)` / `refusals`。ベクタは GeoJSON（属性・時刻の宣言・出典を値として運ぶ）と CSV（点は `longitude`/`latitude`、面と線は `geometry_wkt`）、ラスタは GeoTIFF（無圧縮・ジオ参照を必ず書く・ASCII フィールドは UTF-8）。3 形式とも `js/geo-import.js` と `js/gis-geotiff.js` が読み返し、許容幅 0 で一致を測る。持っていない出典を主張しない。CSV は出典を運べないことを画面が述べる |

骨格の不変条件（各項の詳細・拒否コード・根拠は `docs/GIS-CORE.md`。ここは名前だけ）:

- **起動と遅延**: Shapefile・GeoPackage の読み手は `js/gis-core.js` が起動せず、ファイルが落とされたときだけ `js/geo-import.js` が動的 import する（復号器であって登録も再投影もしない）。
  `polygon-clipping`（Martinez–Rueda。`js/world-packs.js` と `js/cesium-vector-tiles.js` も読む）と `proj4` は最初に要求されたときに取るが、`polygon-clipping` は `@turf/union` の依存として `geo`
  group に取り込まれ `geo-<hash>.js`（51,164 B）で起動時に届いている（チャンクを変える人は測り直す）。取れなければ `geometry-unavailable` / `crs-unknown`。
- **幾何**: buffer は Minkowski 和（`IntMapGeodesy.diskFillPolys`＋辺ごとの測地四辺形、誤差は `_bufferSteps`、負の半径は面だけ——`inward-buffer-needs-area`）。clip の窓は凸でなくてよい。経度の
  継ぎ目はほどいて揃えて戻す（`IntMapGeodesy._splitPolyToWindows`。拒むのは世界を巻く環だけ）。`relate` は `intersects` / `within` / `contains` / `disjoint` / `nearer-than`（`maxKm`。距離は
  `_distanceKm`）。
- **処理の表**: 一覧は `DECL` 1 つ（表示順は `Object.keys(DECL)`、走らせ手が無ければ `op-not-wired`）。入力の中身は `kinds`（既定 `vector`、格子は `input-kind`）。重い処理は
  `run(step, {signal, onProgress})` で中止でき、刻みは経過時間。`join` は識別子で照合し件数と実例を返す（`join-column-collision`・右側が一意でなければ既定 `refuse`）。`compute` は
  `js/gis-expr.js`（`eval` も `new Function` も無い。関数の一覧は `FUNCS` 1 つ。空欄は伝播し、0 にしたければ `coalesce`、`+` は数だけで繋ぐなら `concat`）。
- **レシピと payload**: 出力の `provenance` は `{kind:'op', op, inputs, params}`＝再実行できるレシピで、`IntMapGisProject.setParams(id, {radiusKm:10})` が下流まで走らせ直す（結果の features は
  保存しない）。payload は `kind:'vector'` の `features()` と `kind:'raster'` の `read(bandIndex)`（`grid:{west,north,pixelLng,pixelLat}`・北から南・`NaN` は欠損。格子違いは `grid-mismatch`）。
- **時刻と列**: `time` は `null`／`instant`／`interval`／`track`／`constant` で実データに対して検証する（成り立たなければ `timeRefused`。裸の年はその年 1 年）。列の型は値で決め、先頭ゼロのセルは
  符号（`fields[].padded`）、日付は年から始まる ISO-8601 系だけ。幾何を持たない行は `geometry:null` で、`withGeometry` を `count` の隣で測る。
- **編集**: `editValues` / `addField` / `removeField` / `renameField` / `undo` / `redo` / `history`（履歴は差分、`history().bytes`）。処理の出力・格子・`stale` な記録は編集できない。
- **着色**: `window.GeoJSONUpload` の `style(ref, spec)` / `styleOf` / `classify` / `find` / `link`。`classify` は純粋（`categorical` は多い順、`graduated` は分位か等間隔、単一色相の梯子）。凡例と
  塗りは同じ `legend` から作り、潰れた区分（`collapsed`）と「その他」を出し、レンダラが受け取らなければ元へ戻す。レイヤーとデータセットは識別子で結ぶ（`datasetId`）。
- **座標系**: `crs` は常に `EPSG:4326`、`sourceCrs` はファイルが名乗ったもの（区切りテキストは `null`。パネルは 3 状態）。4326 でない座標は本当に変換し（`OGC:1.3:CRS84` は 4326。できなければ
  `crs-unsupported`、名乗らず度でなければ `crs-not-stated-and-not-degrees`）、決着は `sanitizeFeatures` の前。EPSG の一覧は持たない（`proj4.defs(code)`・UTM の算術 326NN／327NN・`define()`——
  Shapefile の `.prj` は常に渡し、AUTHORITY の無い `.prj` は `PRJ:<base>`）。|lat| > 90 は `crs-axis-suspect`。
- **中止・失敗・入口**: `setParams(id, params, opts)` と `load(id, opts)` は `{signal, onProgress}` を `IntMapGisOps.run()` へ渡す（中止は取り消しではなく、残りは `stale`）。失敗した段は
  commit-or-restore で `stale` になり下流へ伝播する（`IntMapData.invalidate(id, why)`、`input-stale`）。自動採番 `ds-N` は共有する名前空間を見る。地図に出ているものはデータセットの入口
  （`sources()` は数え上げる・`provenance` は `{kind:'layer', layer, bounds, at, statedTime}`・入口は `js/gis-panel.js` の「地図から取り込む」節）。横断クエリはこの層を問い合わせの瞬間に読む
  （`js/atlas-query.js` の `syncUserTables()`。行は元の geometry を参照で持つ）。

### 7.3f 地点カード (Place card — 地点プロファイル／いま、ここ) — `js/place-dossier.js`

**1 地点について、地図が既に持っているものと、いまそこで起きていることを 1 つの記録にまとめ、1 枚のカードに出す。**
地点プロファイルと「いま、ここ」は同じカード・同じ記録で、違うのは**起点**と**節の順**だけ。

| 入口 | 起点（`at.from`） | 節の順 |
|---|---|---|
| コンテキストメニュー（右クリック・長押し）「現地の情報 ▸ 地点について」・検索結果カードの「地点プロファイル」（`openPlaceDossier`） | `point`（地図で選んだ地点） | この地点 → 時刻と太陽 → いま → かつての名前 → レイヤー |
| 検索欄の空の状態「いま、ここ」（`js/here-entry.js`）・ホーム画面アイコンの長押し `?here=1`（`bootFromUrl`）（`openHereNow`） | `device`（端末の現在地） | **いま** → この地点 → 時刻と太陽 → かつての名前 → レイヤー |
| 共有シート・写真の場所（`js/share-inbox.js` → `openHereNow({point})`） | `shared`（共有された地点） | 同上 |
| Atlas `research.placeProfile` / `research.hereNow` | 地点が渡されれば `point`、`hereNow` に地点が無ければ `device` | 同上（`hereNow` は「いま」が先頭） |

**起点が「何が端末から出るか」を決める。** `point` は選ばれたとおりに送る（地名の Nominatim は zoom 14、天気、表示中レイヤーのタイル）。
`device` と `shared` は正確な位置を出さない——送るのは `PRIVACY_GRID_DEG`（0.1°・約 11 km）に丸めた地点だけで、送り先は地名
（zoom 10）と天気の 2 つ。標高とレイヤーの値はその起点では読まず、節は理由 `position-kept-on-device` を述べる。地震と出来事は
どの起点でも位置を付けずに読んで端末で絞る。privacy.html / `js/legal-text.js` の第 2 項と同じ事実。
モジュールはそのクリックで取りに行き、地図のクリックの所有権には触れない。

| 項目 | どこから | 欠けたとき |
|---|---|---|
| 座標 | `HOST.fmtLL` | — |
| 名前と行政区分の連なり | Nominatim reverse（zoom 14）。`address` を上流の並び順のまま連ねる。ISO 3166-2・国コードは識別子として欄に置く。`licence` は上流の文をそのまま運ぶ。共通の Nominatim の列（`js/nominatim-gate.js`）とホストの期限（`clockFor`）を通る | 区域が無い＝`none`／届かない＝`unavailable` |
| 国 | Natural Earth の国境（`HOST.countryGeo`）を点内判定 `window._imPipGeo`（穴を含む）で引く | 公海・帰属未定＝`none` |
| 標高・水深 | `IntMapLayers` の `elevation` 登録（terrarium DEM）。同じズームのタイルを先に待つ | 理由つきの行 |
| 表示中レイヤーの値 | `IntMapLayers.sampleAt`（`data.layerValues` と GIS カーネルと同じ窓口）。数（`value`/`unit`）・分類（`code`）・表示文（`text`） | 下の 4 種の理由 |
| 現地時刻 | 天気の取得元が述べるタイムゾーン（`IntMapWx.point`、`timezone=auto`）——天気と同じ 1 回の応答から | 上流がゾーンを述べない（MET Norway）ときはその名を挙げる |
| 日の出・日の入り・昼の長さ | `IntMapWx.sunTimes`（白夜・極夜を含む。端末内で計算） | — |
| いまの天気と今日 | `IntMapWx.point`（Open-Meteo、代替は MET Norway） | `unavailable` |
| 周辺の地震 | `js/events-near.js` `readQuakes`——USGS の M2.5 以上・7 日のフィードを丸ごと 1 回読み、`RELATED_DEFAULTS`（300 km）で端末が絞る | 該当なし＝`none`／応答しない＝`unavailable` |
| 近くの出来事 | `js/events-near.js` `readNewsEvents`——`news_events` の 72 時間を位置なしでページ送りで読み端末が絞る。柵（`NEWS_PAGES`）で切れたら `truncated` | 同上 |
| かつての名前 | `IntMapHistCities.near`（改名都市の記録）。押すとその年の地図 | `none` |
| この場所の歴史 | `js/place-history.js`（下）。押すとその時代の地図 | 記録の名前と理由／空白の行。起点 `device`・`shared` では押されたら読む（`ask`） |
| 国の統計 | 呼び手が渡す指標の集合と書式（Atlas は `js/atlas-metrics.js` の集合と `fmtVal`）。カードは国カードを開くボタンを置く | 行が無い |

**読めないレイヤーは理由を持った行になる。** 4 種: `no-value-here`・`sampler-failed`・`features-not-a-value`・
`no-point-reader-declared`（宣言が `IntMapLayers` の読み手を名指していない。`dataLayers()` の各行を宣言の `registry`、無ければ
`js/map-ui.js` の `isOn(id)` のチェックボックス `dl-`+id / id で結んで発見する。国別の塗り分け `bx-*` もここに並ぶ）。

**カードと Atlas は同じ記録を読む。** `placeProfile()` が 1 つの記録を作り、`profileHtml()` がカードと Atlas の吹き出し（`inert`）を描き、
`profileSpeech()` が読み上げる（`js/map-reader.js`）。`research.placeProfile` は `exec.placeProfile`、`research.hereNow` は `exec.hereNow`
（`hereNow()` は「いま」を先頭にする指示を足しただけ）で、`hereNow` だけが端末の位置を読む扉を持つ（確認の列 `explicit`）。カードは
`.country-popup` で、開くと `MAP_ANSWER_EVENT`（`card`）を出す。地震と出来事はカードが開いている間地図に点で描く。

**この場所の歴史（`js/place-history.js`）——その地点をどの政体がいつからいつまで治めていたか。** 時代の層が描く記録（CShapes 2.0・
OpenHistoricalMap・OHM の 1886 年以降の植民地の土地・Cliopatria・historical-basemaps の時代の 1 枚）を古い順の縦の年表にし、その下に
第 1 層の地方区分（`data/hist-admin1.js` と `HIST_ADMIN_GAPS`）を並べる。各行は名前（その時代に地図が書く名前を読者の言語で）・期間・
記録と記録 ID（gwcode・Wikidata・Cliopatria の記事・OHM のリレーション・IntMap 復元の行）で、押すと Chronos をその行の最初の日へ動かす。
**何も新しく決めない**: 含む行は扉の `contains`（§7.4）、描く記録と名前は `js/time-borders.js` の `placeRecords`（`collectionAt`・
`_csName`・`_clProps`・`_sheetFC`＋`_eraShow`・`tagSame`）、地方区分は `js/time-admin1.js` の `placeRecords`（`nameOf` と出典日付）。
記録どうしは互いを差し引いて作られている（`scripts/build-hist-clio.mjs`）ので、全記録の行の並びが地図の描くものと一致する。
**端は種類つきで述べる**: `stated`・`reach`（記録の範囲の端——CShapes の 2019-12-31、OHM 帯の 1689-01-01）・`handover`（より精密な記録が
その日に引き継ぐ）・`rename`・`sheet`・`review`・`snap`（`data/hist-coast-snap.js` の陸が決め直される日。註が「記録の海岸を本物の海岸線に
合わせた」と述べる）。地方区分は `stated`・`derived`・`unstated`・`undocumented`・`open`。どの記録も描かない期間は空白の行（最後の行の後も
今日まで）。記録が自分の終わりまでその点を描くなら、翌日から今日までを「この期間を述べる歴史の記録はない（記録はここまで）」の行に
する（Atlas には `afterTheRecords`）。起点 `device`・`shared` では自動で読まない（どの `Range` を読むかが地点で決まる）。
Atlas は `time.placeHistory`（`year` を渡すとその年に有効な行も）で受け取る。年表を出す道具は
`node scripts/place-history.mjs --at <lng>,<lat>`（`--sites` は史実と突き合わせた 7 地点）。

**範囲 × 期間の地震・出来事の読み手は 1 つ（`js/events-near.js`）。** カード・見守る場所（`js/place-watch.js`）・Atlas の
`research.related` / `research.impact` / 実世界オブジェクトの解決が通る。USGS のフィードはセッション内で 1 回の取得を共有し、USGS が述べる
更新間隔（1 分）より古くなったら読み直す。フィードが持たない窓（7 日超・M2.5 未満）は `unavailable('window-beyond-feed')`。状態の語彙は
`STATE`（`ok` / `none` / `unavailable`＋理由）の 1 か所。距離は `supabase/functions/_shared/great-circle.js` の `haversineKm`（地球半径
6,371 km）で、ページと Edge Function が同じものを import する。

### 7.3g マイマップ (My map) — `js/my-map.js` / `js/my-map-doc.js`

**読者が自分で描くピン・線・範囲と、その名前・メモ・色。保存し、共有リンクで運び、測り、分析し、書き出す。** ログインしていれば
「アカウントに保存」で地図ドキュメント（`js/map-doc.js` `fromMyMap`——フラグメントの `mm=` が図形を運ぶ）にしてライブラリ（§8.1.2）の
`save_view` に渡す（ブラウザの一覧は残る）。入口: **Tools ▾ ▸ マイマップ**（`tool.myMap`）・Atlas `map.myMap`（`{"type":"myMap","action":…}`）・
オブジェクト一覧（種類 `mymap`）・`mm=` を持つ共有リンク。モジュールは遅延（`IntMapLazy` の `myMap`、公開名 `window.IntMapMyMap`）。

| 何 | どこで・どう |
|---|---|
| 文書の形 | `{v:1, id, title, updated, features:[{id, kind:'pin'|'line'|'area', name, note, color, coords}]}`。`coords` は [lng, lat]・経度 [-180, 180]。名前とメモは共有リンクと同じ規則（`MapState.captionText`・`TITLE_MAX` / `NOTE_MAX`）。色は 6 色の表の 1 つ |
| 精度 | 頂点は文書に入るときに 1e-6° へ丸める（`COORD_SCALE`）。保存とリンクが同じ値 |
| 辺 | 2 頂点を結ぶ**大円**。描く形・データセット・書き出しは同じ 1 つの形——0.1° 以下の断片（`DENSIFY_DEG`）、日付変更線で切る（`_splitLineToWindows` / `_splitPolyToWindows`）。極を囲む範囲は描かず（`polar`）、パネルとファイル（`geometry:null`・`polar:true`）がそう述べる |
| 計測 | 計測ツールの関数（`HOST.ringArea`・turf の大円距離）、表示は読者の単位（`HOST.distTXT` / `areaTXT`＝`distHTML` / `areaHTML` の文字版） |
| 保存 | `localStorage` `intmap_mymaps`（`{v:1, current, maps:[…]}`）。読み込むときに全地物を今の規則で読み直し、読めない地物は数える。保存を拒まれたらリンクか書き出しを勧める |
| 地図の状態 | `js/map-state.js` の `mymap` 欄（`&mm=`。後ろに来るのは `ds` だけ）。値は `toLinkValue`（Encoded Polyline、1e-6°）を base64url の JSON に包んだもの。`apply` は信用しない——`fromLinkValue` が同じ規則で読み直す。同じ id の地図が手元にあれば手元の写しを出す。他人の地図は読み取り専用で、「自分の地図として保存」で新しい id の写し。行の `lazy: 'myMap'`（値を持つ復元だけが取りに行く）、`restore:'full'`。ハッシュの無い起動では取りに行かない |
| 共有 | 共有リンク・埋め込み・絵葉書・授業ツアーの段（`MapState.hash()`）が図形を運ぶ。「リンクをコピー」はリンクとその長さ |
| 分析 | 「分析に使う」は `IntMapData.add` でデータセットにする（`provenance: {kind:'sketch', author:'reader'|'shared-link', map, title, at, edges}`）。その時点の写しで、属性は編集でき、プロジェクト保存は本体ごと（`docs/GIS-CORE.md` §4） |
| 書き出し | GeoJSON / GeoPackage を `js/gis-export.js` の `write` で。ライセンスは書かない |
| 取り込み | 「この地図へ移す」はピン（`HOST.userPins`）・計測と描画の図形（`IntMapAnnotations`）・半径円を地物にして元を消す。半径円は 64 角形（名前がそう述べる。面積は円より 0.16 % 小さい） |
| 描く | クリックで頂点。ピンは 1 回、線はダブルクリック・Enter・最後の点・「完了」、範囲は最初の点・ダブルクリック・Enter・「完了」で確定。Backspace で 1 点戻し、Esc でやめる。地球の外を押しても頂点にしない（`coords.onSurface` に訊き、パネルが述べる。§1.2）。描く間はダブルクリックのズームを止め、`claimClick` でクリックを取る。計測ツールや自由描画が始まれば退く。近さは `SNAP_PX` |
| 地図の層 | `mymap-src`・`mymap-lbl-src`・`mymap-draft-src`。前の 2 つは `render.claim(…, 'map.myMap', {clear})` で、地図の消去は隠す |
| Atlas | `map.myMap`（open / add / edit / remove / title / show / hide / list / link / export / analyze / new / collect / keep / draw）。観測器 `myMap` は呼んだ後に module の状態と描かれた地物数を読み、`want` と一致したときだけ完了。状態の `myMap` 節に一覧 |

### 7.3h データスタジオ (Data studio) — `js/data-studio.js` / `js/table-bind.js`

**読者の表を、地図・分析・公開まで 1 枚のパネルで。** 取り込み（§7.3d）・データセットと処理（§7.3e）・着色・書き出し・絵葉書を 1 つの
流れにまとめ、①座標の無い表を場所に結ぶ ②Excel を地図に出す ③取り込んだ表を公開する、を足した面。入口: **Tools ▾ ▸ データスタジオ**
（`tool.dataStudio`。行が描画中かどうかも示す）・座標の無い表を落としたとき（`js/map-ui.js` の `handleFiles` が `format:'table'` を受けたら
スタジオにその表を渡す）・Atlas `data.studio`・`ds=` を持つ共有リンク。どの入口も同じ字句の `import('./data-studio.js')` で読み
（`js/lazy-modules.js` に登録せず window に何も公開しない。`studio(HOST)` が 1 つの制御器を返す）、`ds` の復元は `js/map-ui.js` の viewHash が
`MapState.onRestore` で聞いて import する（`js/table-bind.js` も起動の静的 import 木に入らないことを `tests/data-studio-checks.test.mjs` が測る）。

| 段 | 何を・どの部品で |
|---|---|
| データ | ドロップ・ファイル選択・貼り付け・Atlas の添付。新しい読み手は無く、どれも File にして `GeoJSONUpload.handle(files, {quiet})`（＝`handleFiles`）を通す。扉は 1 ファイルごとの結果（`format`・`stats`・`fc`・データセット id）を返す |
| Excel | `ATL_FILE.sheetTables(zip)`——添付と同じ走査（`sheetWalk`）からセルのまま表を返し、`js/geo-import.js` が CSV と同じ表の decoder（`decodeRows`）へ渡す。どの sheet が答えたかは `stats.sheet` / `stats.sheets` |
| 場所に結ぶ | `js/table-bind.js`（純関数）。各列を値で判定: ISO 3166-1 の 2 文字・3 文字・数字コード（Natural Earth の `ISO_A2_EH` / `ISO_A3_EH` / `ISO_N3_EH`）、国名（`Intl.DisplayNames` が地域名を持つ全ロケールを `supportedLocalesOf` で発見＋Natural Earth の `NAME*` 列）、都市名（`data/gazetteer-phone.json.gz` の `en` / `ja` / `disp` / `alt`）。正規化は大小・アクセント（U+0300–036F だけ）・句読点と括弧。自動の鍵は一致率 `DETECT_MIN` 以上の列で、同率ならコード → 国名 → 都市名。読者が選び直せる |
| 曖昧と未解決 | 同名は推測しない（`ambiguous`、候補つき）。同じ行の国の列で絞る。数量の列を鍵にしない——数字コードの列は先頭ゼロを保った 3 桁のセルが 1 つ以上あるときだけ候補（無ければ `numeric-not-evidenced`）。未解決の行は理由つきで並ぶ |
| 結合 | 国: Natural Earth 1:50m（`data/ne-countries/`、242 件）を一度だけデータセットに登録（列は `place_key`・`NAME`・`NAME_JA`・`ISO_*_EH`、`place_key` は ISO alpha-3、無ければ `ADM0_A3`）し、`js/gis-ops.js` の `join`（`duplicates:'refuse'`・`unmatched:'keep'`）。列名が重なれば結合前に `table_` を前置。同じ国を指す行が複数なら `join-right-not-unique`。都市: GeoNames の点のデータセット。provenance `{kind:'bind', file, keyColumn, keyKind, resolved, rows, unresolved, places}`、描画は `IntMapGis.draw()` |
| 塗り分け | `GeoJSONUpload.style(datasetId, spec)`（階級数の上限は `maxClasses`）。結んだ直後は全値が数の最初の列を分位で塗る |
| 分析 | 「データと分析」は `IntMapGis.open()`、「Atlas に聞く」は `IntMapAtlas.call('open')`（Atlas は `data.studio` の `status` と各結果の `dataStudio` で id を読む） |
| 公開 | 地図の状態の **`ds`** 欄（`&ds=`、`mm` の後ろに追加——それより前のリンクはバイト単位で同じ）。値は `{v:1, t, k, c:[鍵の列, 塗った列, 国の列], r:[[鍵のセル, 場所の鍵, 値, 国のセル]…], s}` を `js/link-codec.js`（授業ツアーの `t` と同じ符号化）で包む。fragment はサーバへ送られない（RFC 3986 §3.5）ので、長さは `LINK_LIMIT_MEASURED`（Chromium、2,097,152 文字）と比べ、超えたら書き出しへ案内する。書き出しは `formats('vector')` の全形式、絵葉書は `js/map-recorder.js` の `postcard()` |
| 受け手 | 信用せず読む（`readStudio`: 版・種類・鍵の綴り・塗る列。読めない行は数える）。場所はリンクが述べた鍵で引き直す（ICU が違っても同じ国）。同じ結合・塗り分けで描き、凡例に「データ: 元のファイル名 — リンクを送った人が共有」と出典を出す |
| Atlas | `data.studio`（open / bind / style / link / status / clear、open は `attachment` で添付を読む）。観測器 `dataStudio` は `studioState()` の後にスタジオの状態と、描いたデータセットが取り込み一覧に在るか（`GeoJSONUpload.find`）を読み、`want` と一致したときだけ完了。同じ列で結び直すのは `already_there`。結果は読者の表を運ぶので列 11 は `external` |

**プライバシー**: 公開リンクは表の中身をリンクそのものに入れる（サーバに保存しない代わりに、渡した相手には中身が見える）。
`js/legal-text.js` のプライバシーポリシー §1 が en / jp でそう述べる。

### 7.3i この場所の地震の記録 (Earthquake record of a place) — `js/quake-history.js` / `js/quake-history-core.js`

1 地点のまわりで USGS ANSS ComCat が持つ全地震を、記録の始まりから今日までカードと地図で読む。正本の説明（出典・送るもの・下限の規則）は
[`docs/MAP-LAYERS.md`](../MAP-LAYERS.md) の「この場所の地震の記録」。

| 部品 | 中身 |
|---|---|
| 事実 | `js/quake-history-core.js`（純粋）——FDSN の要求（`queryUrl`。地点は `roundedCentre` で整数度、半径は `SLACK_KM` だけ広げる）・件数から下限を決める `floorFor`（`QH.CAP`＝3,000）・端末での正確な円 `within`・`buildRecord`（最大・年代と各年代の最小規模・`rankOf`）・時刻 T までの `at`・色の帯 `AGE_BANDS`・`?qh=` の `encodeLink` / `decodeLink`・Atlas に渡す `forAtlas` |
| カードと地図 | `js/quake-history.js`（IntMapLazy の `quakeHistory`）。ソース `qh-src`（`attribution` に ComCat と ISC-GEM）と層 `qh-ring` / `qh-pt` / `qh-sel`。`IntMapTime.on` で 1 フレーム 1 回描き直す。「この瞬間の地図にする」は `IntMapTime.set(地震の瞬間)` |
| 扉 | `js/wb-layers.js`（起動時）——地震ポップアップのボタン・命令 `quakehistory.open`・`?qh=` の検出。`js/place-dossier.js` の「周辺の地震」の行は遅延の扉を直に開く |
| Atlas | `time.quakeHistory`（`js/atlas-cap-time.js`。observer `panel`、要約は `forAtlas`） |

読めなかったとき（時間切れ・拒否・到達不能）は理由を言い、「地震が無かった」とは言わない。0 件は「カタログの答え」と言う。

### 7.4 Chronos（統一時間）と「年」

#### 歴史の束の読み込み

- **歴史データは起動時に読まない。読むのは「過去へ行こうとしている」ときだけ。** 国境の束（`data/cshapes.js`・印 `data/border-coast.js`・
  名前 `data/histnames.json`。失敗時は `data/hist-eras.js`）と第 1 層の歴史的行政区分（`data/hist-admin1.js` と `js/border-coast.js` の
  `HIST_ADMIN_GAPS` が列挙する継ぎ足しの記録）の**先読み**は、`window.IntMapTime.onIntent(fn)`（`js/chronos.js`）が呼ばれてから始まる。
  意図は 1 回だけ立ち、あとから購読した者には即座に届く。立てるのは ⑴ **時計**——`set` が今年より前の年を受けたとき（Atlas・共有リンク・
  セッション復元・パネルのどれもここを通る。未来と今年の中は数えない）と、⑵ **時代 UI**——`data-time-intent` を宣言した要素
  （Chronos ボタン `#ntl-toggle`、凡例の年の行 `.dl-clockrow`）の中での最初の `pointerdown`／`focusin`（文書に 1 本の capture リスナ）。
  `IntMapTime.intended()` が誰がいつ立てたかを返す。先読みで取るのは各記録の**索引**（数 kB〜150 kB）で、行と環は年を変えたときに
  その瞬間の分だけを取る。
- **先読みしてよいかは `window.IntMapMemBudget.maySpeculate(旧テスト)`（`js/mem-budget.js`）が答える。** Data Saver・2G（`slow-2g` を含む）・
  携帯（`deviceIsPhone`）では意図のあとでも先読みせず、先読みも `requestIdleCallback`（上限つき）で空きを待つ。実際に年を変えたときの
  読み込み（`IntMapTime.on` の購読者）は全端末で走る。第 2 層以下（`data/hist-admin2.js` ほか）は先読みしない。
- **歴史の束はメインスレッドで評価しない。** リングプールした記録（`data/cshapes.js`・`data/hist-borders.js`・`data/hist-eras.js`・
  `data/hist-admin1.js`〜`hist-admin3.js`・`HIST_ADMIN_GAPS` の記録）を読むのは **`js/hist-bundles.js`（`window.IntMapHistBundles`）だけ**で、
  束は Blob Worker が取得・`JSON.parse`（ファイルは `window.__X=` ＋厳密な JSON）・保持する。問いは向こうで答える——`at(t, end)`
  （その日に有効な行。`end` は CShapes が `inclusive`、OHM 系が `exclusive`）・`during(t0, t1)`（戦争の層）・`snap(y)`（時代の 1 枚）・
  `edges(end, lo, hi)`（エポックの境目）。ページが受け取るのはその瞬間に描く行と環だけで、束と同じ形の**疎な写し**（`h.data`：`rings`・
  `feats`・`dates`・`snaps` と束の上位の値）に入るので、`js/time-borders.js`・`js/time-admin1.js`・`js/war-layer.js`・`js/border-coast.js`・
  クリック・ラベル・Atlas の `currentFC()` は同じ行と環を同じ索引で読む。写しは疎なのでページ側で全行を歩かない。環は 1 回だけ送り、
  受け取った配列は差し替えない（幾何のメモと線の記録が配列の同一性に付く）。最初の旅行の環は `SLICE_POINTS` 座標ずつ別のメッセージで
  届く。穴埋め記録の継ぎ足し（列 11＝自分のファイルでの行番号、列 12＝何番目の穴埋め記録か）も Worker が行い、
  `h.data.gapPools[gi].view` がその記録自身の索引で見た写し。`IntMapHistBundles.ringOrigin(ring)` が「どの束の何番目か」、`globalOf(写し)`
  が束の名前を答える。Worker が作れない・死んだときは同じ関数（`histJob`）をページで走らせ、束が `window` にあればそれを使う。
  回帰は `tests/hist-bundles-off-main-checks.test.mjs`。
- **歴史の束は年で切ったタイルから、その瞬間に要る分だけを取る。** ビルドが各記録を `data/hvt/<名>.idx.json`（索引）と
  `data/hvt/<名>.jsonl.gz`（独立した gzip メンバーの連結。1 メンバー＝JSON 1 行のチャンク）に切る（`scripts/build-hist-tiles.mjs`、
  `vite.config.js` の `histTiles()`）。索引は head・全行の `[開始, 終了]`（YYYYMMDD の整数）・各行と環のチャンク・時代の 1 枚のチャンク・
  バイト範囲を持つ。扉は Worker の `histJob` に問いが読むチャンクを訊き（`need`）、それだけを `readWithin`（同じ時計）と `Range` で読み、
  バイトのまま渡して（`feed`）から問いを訊く——読み手が受け取る値と索引は丸ごと読んだときと同じ。範囲は表示範囲ではなく全世界
  （名前検索・`geomForCode`・`coverage()`・クリック救済・ナレーター・`edges` が同期で全世界を読むので、切るのは年だけ）。ズームの門は
  第 2 層が z6・第 3 層が z8。アーカイブは `.gz`（`application/gzip`）で配る（GitHub Pages は `application/javascript` と
  `application/octet-stream` を gzip で送り `Range` に圧縮後のバイト範囲を返す。`scripts/serve.mjs` も同じ振る舞い）。環は整数差分で持ち、
  値は元の倍精度と一致する（一致しない環は書かれたまま）。ビルドは毎回切ったものを読み戻して全行・全環・全日付・全シートを照合する。
  記録（`data/*.js`）は源で配信もされ、タイルの無いサーバ（`npm run dev`）・別の記録の索引・チャンクでないバイトでは丸ごと読む側へ戻る。
  継ぎ足しはタイルでも Worker が行う（`openTiled` が `splice` と同じ規則）。Service Worker は `data/` を扱わない。回帰は
  `tests/hist-vector-tiles-checks.test.mjs`。取得を外から観測するとき、DevTools プロトコルの完了（Playwright の `requestfinished` /
  `requestfailed`）を読まない（読み切っても `net::ERR_ABORTED` と報告しうる）——ページの Resource Timing と
  `IntMapHistBundles.requested(global)`／`loaded(global)` で見る（`tests/history-prefetch-on-demand.spec.js`）。
- **1 地点を全時代について訊く問いは `contains(lng, lat)` で、Worker が答える。** 答えは行が述べること（名前・期間・身元・出典日付）と
  時代の 1 枚の多角形の名前だけ。判定は**箱**で候補を絞り、候補を**環の偶奇判定**で決める（標本点は使わない）。タイルで読む記録は
  ビルドが書く箱ファイル `data/hvt/<名>.box.json`（扉の `boxesOf`、0.01° の整数で外側へ丸めさらに 1 単位広げる）を初回だけ読み、候補の
  チャンクだけを `Range` で取る。箱は行より小さくならない（ビルドの `verifyBoxes`）。旅行は箱ファイルを読まない。回帰は
  `tests/place-through-time-checks.test.mjs`。

#### クリックと根拠

- 地名クリックの優先順位はエンジンの登録情報で判定する。`events.onLayer` の第4引数 `{ownership:'fallback'}` は他の地物や地名に譲る領域
  説明用で、`clickLayers()` は全登録、`clickLayers({ownersOnly:true})` は優先権を持つ登録を返す。無名歴史領域の説明は fallback。同一レイヤー
  の別ハンドラの優先権は維持する。登録台帳はレンダラに依存しない `js/click-ownership.js` が持ち、adapter と callback を弱参照する。
- **境界線を押すと「この線の根拠」が開く**（`js/border-provenance.js`・`js/border-provenance-card.js`）。線を描く記録は自分を読み手として
  登録する（`registerReader`）——国境は `js/time-borders.js` の `era-borders`（`imtb-line`）と `today-borders`（`borders-only-line`）、地方区分は
  `js/time-admin1.js` の `era-subdivisions`（ベクタタイル・束・継ぎ足しの 3 本）。1 本のリスナが押した点と周囲 8 点を覆う形を両側の記録として
  集める。線はタップの最後の持ち主（独占の持ち主には譲り、地図全体の持ち主は 1 マイクロタスク後に `clickClaimed` で聞く。測定などの道具・
  描画・比較の国選び・孤立表示の最中は開かない。`imtb-fill` の説明は線に譲る）。カードは形ごとに記録・行・識別子（gwcode、OHM のリレーション、
  Wikidata、Seshat ID）・各日付を誰が述べたか・頂点の桁数と簡略化の許容誤差・拡大時の輪郭・査読済みの経路・上流の言葉（`typeNote`／
  `blankNote`）・ライセンスを述べ、IntMap の復元なら調書（`dossiers/` の `units` 形式と変更一覧の形式）を読み、最後に「地図の誤り報告」を
  記録の識別子を下書きして開く。束が持たない事実（OHM のリレーション id とタグ原文、Cliopatria の上流行の年と Seshat ID、継ぎ足しの記録の
  列 10〜12）は `scripts/build-border-provenance.mjs` が `data/border-provenance-{ohm,clio,gaps}.json` に書き、各行に束の行の指紋（`rowKey`）を
  持たせる（一致しない行は「索引はこの行を記述していない」。`--check` が出荷中の束との一致を測る）。索引は押したときに読む。Atlas からは
  `time.borderSource`。同じ答えは `IntMapTimeBorders.provenanceOf(f)`（`_provSide`）と `drawnAt()` を共有パネルの引用タブが読み、描いている瞬間の
  国境を GeoJSON にする（`docs/architecture/08-ui.md`）。各行は自分のファイル（`file`、CShapes と年代図は `bundle`）を持つ。
- 都市ポップアップの見出しは `IntMapHistCities.forFeature` で実地物の座標と名称を照合し、地図の年代・表示言語と同じ歴史名を併記する。現代名での
  境界照会とは分離し、位置を持たない地物や非有限座標をクリック位置で代用しない。歴史都市名の取得失敗は固定せず（次の時計更新か明示取得で再試行・
  取得中は同じ Promise を共有）、成功したデータは保持する。
- 歴史表示の地図背景は `js/historical-basemap.js` が OpenFreeMap の自然地理から描く（CARTO のラベルなし画像は現代の行政境界を含むので使わない）。
  現在の海岸・水域・地表を参照する背景で、過去の海岸線や植生は復元しない。衛星画像は従来どおり。
- 年別境界の `BORDERPRECISION` は名前のない形状も含めて保持し、出典の分類（概略・中程度・国際法に基づく）を破線・長破線・実線と説明へ伝える。
  分類がない形状の精度は推定しない。
- 地方区分の有効期間は OHM の終了日を含まない。年月精度の端は期間境界へ正規化し、原表記と精度を `dates` に保持して補足に出す（`docs/MAP-LAYERS.md` §7.7）。

#### 区分の日付と、地図が描けている量

- **上流が開始日を述べていない区分を、時計の床から描かない。** `scripts/histadmin/class-dates.mjs` が、その単位自身の Wikidata クラス（P31）×
  上流が述べる終了日を 1 つの「制度」として発見し、制度の中で述べられた最も早い開始日だけを下限に採る（制度の一覧は書かない）。導出した
  終了日を受け取れるのは両端とも述べていない単位だけで、2 件以上かつ述べられた終了日の 3 分の 2 以上が一致し、結果が区間になることを要求する。
  令制国と五畿七道の道は 0701-01-01 – 1871-08-29、どの制度にも属せない行（`wikidata` タグが無い）は出荷しない。`data/hist-kuni.js` の令制国
  16 国も同じ span を読む。日付だけの再実行は `node scripts/build-hist-admin1.mjs --dates` と `node scripts/build-hist-kuni.mjs --dates`。
- **導出したことは読者にも述べる**（`js/map-ui.js` の `_eraSourceDates()`）。「出典の日付」が `?` の端が導出されていたとき、ポップアップは
  「上流は日付を述べていない。同じ制度の他の単位が述べる 0701 から描いている」と続ける。
- **地図が「どれだけ」描けているかは観測され、後退すると門が落ちる**（`npm run check:histfidelity` ＝ `scripts/hist-fidelity.mjs`・オフライン）。
  ⑴ 上流が述べていない開始日から描かれている行（0 でなければ落第）、⑵ 同じ admin_level の単位が同じ土地を同じ瞬間に主張する組（内点の 25% 以上が
  他方の中）を `js/hist-scale.js` の `claimKind` で**継ぎ目**・**重複**・**係争**に分けて数える（増えたら落第）、⑶ その年に政体の中に置かれた陸地の
  うち第1級の区分が描かれている割合（0.25° の陸地格子。母集合は `data/cshapes.js` / `data/hist-borders.js` / `data/hist-eras.js` から）。観測の正本は
  `data/hist-fidelity.json`（紀元前 500 年から 2019 年まで 18 年ぶん・セル数と cos(緯度) 重みの面積）で、1000 年 1.1%・1500 年 4.9%・1800 年 25.4%・
  1900 年 47.5%（面積 43.8%）・2000 年 62.3%・2019 年 66.9%。1900 年に第1級の区分が 1% 未満の政体は 82、一部だけが 29、丸ごとが 39。測り方は
  `js/hist-knowledge.js` が持ち、地図の斜線と同じ関数。被覆だけを見て上げない（最も安い上げ方が ⑴ そのもの）。規則の正本は
  `.agents/rules/historical-verification.md`、門が測れないものは `docs/TESTING.md`。⑶b 穴は理由ごと記録される——丸ごと描かれていない政体ごとに
  記録の無い土地の下の現代の国と理由を `data/hist-coverage-holes.json` が持ち、出荷済みの束と一致しなければ落とす。理由は `data/hist-admin-fill.js`
  の `refused`。⑷ 時代の枚の名前が政体の存在しない年に描かれていないか——ページ自身の `nearest()` を評価し、存続期間のある所見
  （`scripts/histeras/match.mjs` の QID、または審査済みの行）を発見して `data/hist-era-spans.json` に判定（行＝名前を外す／`refuted`）が無ければ落第。
  行は Wikidata の P571 / P576 が述べ史実と一致するときだけ書き、`eraShown` で外れるかまで確かめる。成立側の行は `hs`（`history` の文が置く最も早い
  年）を持ち、`sBy: "history"` の行は Wikidata のどの成立年より早いときだけ認める（エラムの紀元前 3200 年頃）。⑸ 宗主国の括弧は CShapes の記録が
  変わる日に外れる（`_CS_ERA` の年 Y は「その gwcode の記録が Y に変わる日」。門は境界の前日と当日に `_csName` を評価する）。⑸b 国家の名前は
  国家より前に書かない（260・265・731・732 は 1949-09-21・1949-10-05・1948-09-09・1948-08-15 から西ドイツ・東ドイツ・北朝鮮・韓国、それより前は
  「Germany (Western Allies)」「Germany (USSR)」「Korea (USSR)」「Korea (USA)」）。⑸c 場所の名前は場所の名前として訳す——日付の無い記録（シート・
  OpenHistoricalMap）の輪郭と「土地 (保有者)」の土地は、CLDR の英語の地域名がその名前そのものであるときだけ CLDR の地域名（`Intl.DisplayNames`
  short）で訳し（`_placeLoc`。`NAME_JA` は国家の正式名を持つ行がある）、日付のある記録（`_gw`）は今の国名のまま。旧国家の名前は期間外では自分の
  名前を訳すときにしか使わず、保有者を輪郭自身の政体と読まない（`_heldLand`）。⑹ 遡らせた区分はその国の単位が述べる最も遅い発足より前に描かない
  （束の `inception` 欄から再導出）。⑺ 上流が 1 つの引き継ぎを 2 つの年で書いた所見（同じ `…:event`）は `data/hist-admin-edges.json` に判定
  （Wikidata が述べる日）が無ければ落第。⑻ 改暦より前の日・月を述べる上流の日付（日本は 1873-01-01 より前＝天保暦）は同じ台帳の `calendar` 節に
  判定が無ければ落第し、旧暦の月日を新暦として書いたもの（滋賀県 1872-09-28 → 明治5年9月28日＝1872-10-30 など）は版を名指す出典の換算日で束の行と
  タイルの線（`lines` → `ohmFilter` / `inForce`）の両方に当たっていなければ落第（`scripts/histadmin/calendar.mjs`）。正本は `docs/MAP-LAYERS.md`。
- **その時刻の地方区分は、国境が地図に渡ったあとで組み立てる**（`js/time-borders.js` の `settled()`。国境が描かれた・同じだった・現代年だった・
  答えが来なかった・`clear()` のどれでも閉じる）。`js/time-admin1.js` は OHM タイル線の絞り込みを先に合わせ、束の読み込みの前にその番を待つ
  （地方区分の束を worker へ渡す処理が国境と取り合うため）。
- **記録が黙っている土地は斜線になる**（`js/time-admin1.js` の `_know`・`imta-know-fill` / `imta-know-lbl`）。第1級区分の記録が 1% 未満の政体は
  その輪郭に、一部だけの政体は記録の無い土地（0.1° の矩形）に斜線を引き、「この年代の地方区分の記録なし」「地方区分の記録はこの土地の N% だけ」と
  書く。旅行時に `js/hist-knowledge.js` を動的 import し、区分と国境の後に計算する（古い日付の結果は捨てる）。レイヤー行の注記と
  `coverage().known` はその日付の割合と、`data/hist-claims.json` の二重主張を種類別に述べ、Atlas の `time.coverage` が読む。
- Cesium は透明な全球画像を最下層に持ち（部分範囲の極域画像が全体へ伸びない）、背景色は最前面の可視 background から更新する。Cesium へ渡す
  ベクタタイルの面は Mercator 座標でタイル範囲に切り、低ズームでは半球未満に分け、穴を保持し辺を補間する。輪郭線は元の辺を個別にタイル範囲へ
  切る（面の切断の閉じ辺や描画 buffer を海岸線として描かない）。同一 ID 地物の更新は削除通知と追加通知を分ける（通知停止区間で両方行うと SDK が
  相殺し、過去への切替後も現在の形状が残る）。
- 携帯の Chronos は出典表示の実際の矩形から下端と高さを決め、シート移動・リサイズに追従し、足りなければ操作部の内部をスクロールする。

#### 時計と、出典ごとの範囲

- **時刻はマスタークロック `window.IntMapTime` 1本**（2つ目の時計を作らない）。「その時計の瞬間（ライブなら今）」は `when()`（Date）・
  `nowMs()`（ミリ秒）・`iso()`（日付）に訊き、`isLive ? Date.now() : when` を組み立てない（`tests/one-geocode-one-clock-checks.test.mjs`）。
- **下限は `IntMapHistScale.FLOOR` が決める**（`IntMapTime.min`）。スライダーの `min`・入力のガード・目盛りは実行時に読む（`js/news-timeline.js`）。
  範囲に何があるかは各出典が決める:
  - **地方区分は下限まで届く**——OpenHistoricalMap のベクタタイルを日付で絞って描く。上流が単位を持たない範囲は、IntMap が CC0 の出典から導いた
    区分（`data/hist-kuni.js`＝令制国 16 国、`data/hist-admin-fill.js`＝今日の第1級区分を上流が述べる発足日まで遡らせたもの）が `imta-gap-line` で
    埋める（塗りは同一）。出版元が測って日付を述べた範囲は出版元の記録（`data/hist-admin-surveys.js`、CC BY-NC-SA の分の `data/hist-admin-surveys-nc.js`。
    `docs/MAP-LAYERS.md` §7.7）。上流も出版元も持たず遡らせられない範囲は IntMap が史実から復元した区分（`data/hist-admin-recon.js`。正本
    `docs/HIST-RECONSTRUCTION.md`、門 `npm run check:histrecon`）。譲り順は上流 → 出版元 → 復元 → 遡らせた区分。継ぎ足す記録の一覧は
    **`js/border-coast.js` の `HIST_ADMIN_GAPS` ただ 1 か所**で、各記録の `derived` が導出か出版元の記録かを述べる。遡らせる区間の規則の正本は
    `docs/MAP-LAYERS.md` §7.7（門 `npm run check:histfill`）。読み違えやすい 3 点: ⑴ 完全性は穴埋めの区間と上流（`data/hist-admin{1,2,3}.js`）の**和**で
    国ごとに測り、上流に委ねた単位は束の `deferred` 欄が申告し幾何で検証される。⑵ 国の床は現在の国家の成立日ではなく、その国の単位が述べる最も遅い
    発足日。⑶ 識別子は ISO 3166-2 とは限らない（Natural Earth の代替コード `~` 付き。Wikidata との結合は厳密な ISO 形だけ）。
  - 区分をクリックしたときの輪郭は上流の原寸（束の行の relation id で 1 件だけ取り直し、届いたら同じ source を差し替える）。relation → 多角形の規則は
    `js/ohm-rings.js` 1 本でブラウザとビルドが共有する。
  - 区分の名前は ① OHM の `name:<言語>` ② 同じ relation の `wikidata` 項目のラベル（空いている欄だけ） ③ 上流の `name`。1 つの項目を違う名前の
    複数の単位が名乗るならその項目は誰の名前にもならない。`name:zh` は繁体・簡体を判定してからしまう。言語 → 欄の対応は `IntMapLang.htmlTag`。
    名前を足す言語は英語と日本語だけ（`scripts/histnames/langs.mjs`。上流が書いた他言語は落とさない）。
  - **歴史国境は 1689 年まで日単位**——CShapes 2.0 が 1886-01-01 から 2019 年、OpenHistoricalMap（`data/hist-borders.js`）が 1689–1885。それより前は
    historical-basemaps の年別スナップショット（**紀元前 123000 年から西暦 2010 年までの 54 枚**・同梱 `data/hist-eras.js`）だけが答える。
  - GDP・人口はマディソン・プロジェクトで 1850 年から。ケッペン気候区は最古のラスタが 1901-1930 なので、それより前はその期間を出し凡例が期間名を出す。
- **年スライダーは「年」ではなく「位置」を持つ**（`js/hist-scale.js` の `IntMapHistScale.rail`）。0〜1000 の位置を運び、年は位置の区分線形関数
  （折れ点は西暦 1 年で 10%・1500 で 32.5%・1850 で 55%＝記録の密度が変わる場所。測定と失効条件は `js/hist-scale.js`）。
- **`new Date(Date.UTC(y,…))` は y < 100 のとき y+1900 になる**ので、瞬間の生成は `setUTCFullYear` を通す（`js/chronos.js` の `atUTC`）。

#### 国境（1689 年以降は日単位）

- **1886–2019 の国境は「日」で引く**（`js/time-borders.js` の `csFC`）。年月日はローカルの getter（`getFullYear` / `getMonth` / `getDate`）で取る
  （`iso` は UTC なので東半球では前日になる）。年だけを渡す経路（`IntMapTime.setYear()`）は6月15日を置く。束は 710 レコード・**369 の変化日**。
- **キャッシュの鍵は「エポック」**——その日以前で最も新しい変化日（`csEpoch`）。もう 1 つの軸は名前の表の年（`_csNameKey`。`_CS_ERA` の年単位の
  規則が切り替わりうる各年の 1 月 1 日を表から導く）。`[y,m,d]` の規則は記録の境に縛られているので軸は要らない。
- **変化日の索引は多角形と同じレコードから導出する**（`csBounds`：開始日と終了日の翌日）。`IntMapTimeBorders` が `changeAfter` / `changeBefore` /
  `changeAt` / `changeDates` で公開し、Chronos の**国境ステッパー**（`#ntl-bstep`・`js/news-timeline.js`）はそれだけを尋ね、マスタークロックに書く。
- **1689–1885 は `data/hist-borders.js`（OpenHistoricalMap・CC0 1.0）で、同じ日単位の機構で引く**（`hbFC` / `hbBounds` / `hbEpoch`）。OHM の
  `admin_level=2` 境界関係を `scripts/build-hist-borders.mjs` がリングプール形式へ落とした——**記録 1411 件**、窓の中の**変化日 881 件**、
  各年6月15日に生きている政体は 164〜216。境界の幾何だけを更新する生成経路は名称・有効期間・識別子を保持し、補正済みの形状を上流で上書きしない。
  間引き許容幅は生成データが保持し、海岸線との判別データも再生成する（`docs/MAP-LAYERS.md` の境界精度の節）。
  - **1885 と 1886 の間で政体の数はおよそ 3 割落ちる——主語の交代である**（1885 年は OHM が **184**、1886 年は CShapes が **128**（OHM なら同じ日に 183））。CShapes 2.0 は国際
    システムの主権国家の記録で、植民地・保護領・非主権の政体を収録しない。
  - **1886〜1923 年は CShapes が述べない土地にだけ OHM を描く**（`data/hist-borders-late.js`。`scripts/build-hist-clio.mjs --ohm-late` が CShapes の
    土地を引いた残り）。止める年 1923 は実測（1925 年から OHM が南極の領有主張を、1953 年から領海を政体として描く。ビルダーの `LATE_TOP`）。
  - **どの記録も描かない、記録の海岸と本物の海岸線のあいだの陸**は、海に接し 1 つの政体の行だけに接しその帯の内にある片を、その行として
    `data/hist-coast-snap.js` が持つ（`scripts/histclio/coast-snap.mjs`。海岸は OpenStreetMap の陸地ポリゴン〈ODbL 1.0〉、継承条項のある記録
    〈CShapes・historical-basemaps〉の行は Natural Earth 1:10m admin-0）。ページは親が描かれる瞬間だけ親の性質で描き（`_snapsFor`）、線は引かない。
  - 1,411 件のうち **114 件は 1689–1885 のどの 6 月 15 日にも在force にならない**（全件が窓より前に終わる）。
  - **窓の下限 1689 は導出された年**——ビルドが隣の記録 `data/cshapes.js` に「世界とはどれだけの陸地か」を訊き（12,895〜14,660 deg²）、その最小から
    CShapes 自身のばらつき 1 つ分を引いた値を記録が覆う年だけを残す。値は束の `window[0]` に書かれ、`js/time-borders.js` の `HB_MIN` はその写し
    （`tests/history-era-borders-checks.test.mjs`）。政体名は OHM の `name:xx` から 9言語ぶん運ばれ（`_i18n`）、`tagSame` が `_eraLocName` より先に読む。
- **クリックの答えは押した政体のもの**（`resolveHist`）。統計の出どころ（`code`）は現代の国のまま、名前と記事は記録自身のものに戻し、英語名が現代の
  国と違うときは現代の国旗も落とす。
- **OHM の `end_date` は排他で、CShapes の終了日は包含**（`hbFC` は `開始 ≤ その日 < 終了`、`csFC` は `開始 ≤ その日 ≤ 終了`。`hbBounds` は終了日
  そのもの、`csBounds` は翌日を境界に取る）。
- **描かれる線は多角形の輪郭ではない**（`data/border-coast.js`・`scripts/build-border-coast.mjs`）。同梱の海岸線（`data/coastline.json.gz`＝Natural Earth
  1:10m・2 km 許容）に対して、辺のどこか1点でも `INLAND_KM` より内陸なら境界、そうでなければ海岸線の写しと判定し、15の束（`cshapes` /
  `hist-borders` / `hist-borders-late` / `hist-clio` / `hist-coast-snap` / `hist-eras-rest` / `hist-admin1` / `hist-admin2` / `hist-admin3` / `hist-eras` /
  `hist-kuni` / `hist-admin-fill` / `hist-admin-surveys` / `hist-admin-surveys-nc` / `hist-admin-recon`）の全リング **136,414 本**について「描く run」を
  印す。束は `data/` を走査して発見し（`discoverBundles()`）、`--check` は印された束の集合が `data/` の束の集合と厳密に一致することを要求する。各
  エントリは自分のグローバル名（`global`）を持つ。面積 0 のリングは描かない（束からは削らない）。印の**読み手は `js/border-coast.js`** ただ1つで、
  `js/time-borders.js` と `js/time-admin1.js` が呼び、run だけをつないだ MultiLineString を線用の source（`imtb-ln-src` / `imta-ln-src` /
  `imta2-ln-src`）へ流す。多角形は `imtb-fill` / `imta-src` / `imta2-src` に残る。規則は地方区分にも同じ定数で効き、帯は記録ごと
  （`RECORD_INLAND_KM`。手描きの Cliopatria は 10 km。[`docs/MAP-LAYERS.md`](../MAP-LAYERS.md) §7.13）。
- **粗い記録の線は、史料が述べる区間だけ川・城壁の実形で引き直す**（`data/hist-courses.js`・`scripts/build-hist-courses.mjs`・事実は
  `scripts/histcourse/courses.json`）。読み手は `js/hist-courses.js`（Cliopatria の線を初めて描くとき `js/border-coast.js` が import）で、run の指定範囲を
  OSM の頂点で置き換える（`splice`）。線だけが変わる。正本は §7.13。印は任意（読めなかったときと、実行時に GitHub から取る historical-basemaps の
  スナップショットには印が無く環を丸ごと描く）。同梱の `data/hist-eras.js` は FeatureCollection を丸ごと渡すので、`js/border-coast.js` は環の同一性
  で印を引く。ページの環は `ringOrigin` が答える番号で引く（同じ長さの検査つき）。

#### 1689 年より前——時代の 1 枚

- **スナップショットへの丸め（`nearest`）は 1689 年以上では代替でしかない**（MAXGAP を 1886 年より下で適用しない）。**1689 年より下では唯一の答え**。
  上流（aourednik/historical-basemaps）が公開しているのは **54 枚**で、**うち 17 枚は紀元前**（`world_bc1` から `world_bc123000` まで）。一覧は上流の
  ディレクトリを読んで得る。下限は `js/hist-scale.js` の `FLOOR`（天文年 −122999 ＝ 紀元前 123000 年）で、`npm run check:histeras` が同梱の束の最古と
  照合する。54 枚は同梱する（`data/hist-eras.js`・10.6 MB・`scripts/build-hist-eras.mjs`）。遠隔取得（`raw.githubusercontent` と CORS プロキシ）は束が
  読めなかったときだけの代替。ライセンスは GPL-3.0 で、出典と帰属表示がそれを述べる。誤差はその系列の粒度（1000 年より前は 100 年刻み、最大で
  およそ 50 年。紀元前 10000 年と紀元前 123000 年の間には何も無い）。
- **1 枚は存続期間ではない。名前は読者の年で問う**（`js/hist-scale.js` の `eraSpanOut`）。審査済みの存続期間は `data/hist-era-spans.json`
  （`scripts/histeras/spans.mjs`）：名前・QID・Wikidata が述べ史実が一致する境界（`s` / `e`、天文年、境界の年は期間の内）、成立側は `hs`、史実の年を境界に
  する行は `sBy: "history"`。期間の外では名前だけを外し形は残し、カードは「上流はこの形を «X» と呼ぶが、その政体はこの年には存在しない」と根拠の
  QID と年を述べる（`blankNote`）。代わりの名前は付けない。読み手は 1 人ではない：`currentFC`（Atlas・比較・語り手）・`featureAt`・`geomFor`・
  `geomForCode` は描いている collection（`_drawnFC`）を読む。`coverage()` は外した名前を別に数える。OHM のベクタタイル（`ohmFilter`）は第1級以下の
  区分（admin_level 3〜7）だけを描き、政体の名前はこの束からしか出ない。
- **深い枚が描いているのは政体ではない**（`world_bc123000` は Homo heidelbergensis と Neanderthal、`world_bc10000` は縄文・コイサン）。上流自身の分類
  （自由記述の `TYPE`、141 件・紀元前 700〜10000 年の 9 枚）が言う範囲でそれを運び、地図の上で述べる（`js/time-borders.js` の `coverage()` / `note()` /
  `typeNote()`）——レイヤー行「国境」の注記が 9 言語で枚の年・隣の枚・形の件数・名前の無い件数・上流の分類を述べ、ポップアップは `TYPE` を
  そのまま出す（`showPopup` の `opts.sub`）。数は `shownFC` から数える。名前の無い上流ポリゴン（6,955 件）は描くがラベルを出さず、クリックには答える
  （`imtb-fill` の handler と `blankNote()`。中身は `TYPE`・`BORDERPRECISION`・`SUBJECTO`・`PARTOF` だけ）。
- **昔の国名ラベルは「1 政体 1 点」ではない。** 球面上の面積が下限以上で、既に名前を持つ部分から両者の等面積円の半径の和より遠い部分には点を
  追加する（1800 年: 163 名に対して点 170）。

#### 歴史的な政体名

- **歴史的な政体名は、記録をまたいで 1 つの表 `data/histnames.json` が答える**（規則は記録ではなく名前に付く）。根拠は 3 種:
  - **識別子** — `data/hist-borders.js` は QID を 1,411 feature 中 1,305 件で述べる。上流が書いた名前は上書きせず、空いた言語だけ埋める。
  - **尺度** — 識別子を持たない cshapes と era には、綴りに一致する Wikidata 項目を全部取り、座標を述べているなら描く形の中に、存続期間を述べて
    いるならその名前の出る枚に届くことを要求する（`scripts/histeras/match.mjs`。許容幅は記録の分解能から）。地図が描く種類かは根を名指して
    `wdt:P279*` に訊く（`ACCEPT_ROOTS`）。種類が違えば採らない（`REJECT_ROOTS`。根は `watercourse` であって `landform` ではない）。
  - **上流の説明文** — era の製図者が書いた英語の文（`Savanna hunter-gatherers`）は説明として訳す。どれが説明文かは尺度で決める
    （`scripts/histnames/prose.mjs`）。訳語は `d` の印を持つ。
  - **第 2 の典拠ストア** — Wikidata がその英語綴りの項目を持たない綴りは、英語版 Wikipedia のリダイレクトに訊く
    （`scripts/histeras/harvest.mjs` `articlesFor`。`redirects=1` は 1 記事に解決するので綴りの一致は緩めていない。曖昧さ回避ページは落とす）。
  英語は常に上流のもの。手書きの表（`_ERA_LOC` ほか）が答える名前とは重ならない。出荷する言語は `scripts/histnames/langs.mjs` の 1 か所（問い合わせと
  キャッシュは 9 言語、絞るのは出荷だけ。現在は **en / jp**）。識別子の欄は Cliopatria（`data/hist-clio.js`）の検証済み QID にも答える
  （`--identifiers`）。表の `lanes` がどのストアが答えたかを持つ（label/alias 812・en.wikipedia のリダイレクト 178・識別子 1,246、訳語 13,618 件）。
  残りが英語なのは上流がその綴りで何も名指していないから。
- **手書きの名前表と `data/histnames.json` は「名前×言語」で合流する**（`js/time-borders.js` の解決順は `_i18n[lg] || _eraLocName(nm)`）。到達率の
  数は書き写さない——正本は `tests/history-cshapes-gate-checks.test.mjs` の `FLOOR`（出荷している解決器を評価して言語ごとに数える）。

#### 気象モデルと時計（読み込みの規則・実測値の正本は [`docs/MAP-LAYERS.md`](../MAP-LAYERS.md) §7.10）

- **読み込み**（§7.10 の要約）: 風の場は「画面の緯度帯 → 全体」の2段（`bandNear` を先に、裏で視野全体の帯。`bandFor` は視野が緯度 120° を超えると `null`）。`.om` のリーダーはファイルごとに 1 つ
  （`readerFor` の LRU・`setToOmFile` は `pinReader` で冪等・開くのは `setIndex` の中。色タイルも `tileReader` で同じプール）。次の時刻のファイルは先に開く（`openAhead`）、バイトの先取りは
  フレームで（`readAhead`、2時刻先は `foregroundBusy` を見る）。色面のタイルは画面の範囲だけを読む（`applyTileBounds`。全球のときは `WORLD_RATIO` で箱を言わない）。読み込みの列はレーン
  2 本（`serial(fn, bg)`・`qHi` / `qLo`）、隣接ブロックは `coalesceBackend` が 1 本にまとめ `blockSize()` は大きくしない。点灯前の準備は `IntMapECMWF.warm()`。
- **ラスタの 1 タイルは 1024 px で、その数字は 1 つ**（`IntMapECMWF.TILE_PX`。URL の `tile_size` と MapLibre の `tileSize` は同じ値。ベクタのタイル——`omUrl`——には渡さない、`omRasterUrl` だけ）。
- **時刻を変えても地図は空にならない**——色面は2つのスロットを交互に使い、新しいスロットはタイルが1枚でも届いたとき（`e.tile && e.isSourceLoaded`）にだけ表に出す。
- **配色**: 風の凡例は 0–30 m/s まで（配色表は 104 m/s まで塗り、上端に `+`。`IntMapECMWF.legend().capped`）。windy.com に合わせた家族は風・気温・気圧・降水量・露点の 5 つ（`RGBA(v)` を標本化。
  登録キーは SDK の別名解決 `mQ` が引く名前、後の 3 つは `windyRamp(family)`）。等圧線は海面気圧レイヤーのスイッチ（`sub:'ec-slp'`・`legendLayers()`・`syncSubs()`・`&intervals=`・
  `ISOBAR_STEP_HPA = 4`）。
- **風の筋（パーティクル）は2つの独立した問い**——風レイヤー自身の「パーティクル」（既定 ON）と、気温・最大瞬間風速・海面気圧・降水量（予報）の各凡例の「風のパーティクル」（レイヤーごと・
  鍵は `intmap_wx_{temp,gust,slp,precip}_parts`、既定は気温だけ OFF。正本は `PARTS_KEYS` と `PARTS_DEFAULT`、扉は `window._imWxParts(layerId, v)`——`window._imWxTempParts` は別名——で、
  Atlas の `{"type":"windParticles","over":"temperature"|"gusts"|"pressure"|"precipitation"}` も通る）。`window.Wind` の中で `live() = on || soloOn` が「場が要る」、`streaksWanted()` が「筋を
  描く」で、色ラスタスロットは `on` のまま。解体は何も場を欲しがらなくなったときだけ（`_quiesce()`）。気温の鍵は改名しない。
- **気象系の時刻 UI はすべて離散**（ECMWF 系はモデルの index を `step=1`、潮汐は毎正時——`datetime-local step=3600`・`snapHour`・1/4周期ボタンは 6 時間）。
- **結線は片方向。** Chronos が動けば気象モデルの軸も動く（`IntMapECMWF.followClock`）。逆は結線しない（`_pushClock` は no-op）。選ばれた瞬間が予報窓の外なら軸は動かない（`covers()`）。各気象
  レイヤーは凡例に自分の時刻 UI を持つ。

#### Chronos パネル

- **時刻タブは1つ**。再生操作もスライダーも書くのはマスタークロックだけで、日付ピッカーの上限はモデルの最終有効時刻まで伸びる。
- **「日時」の行はタブに属さない**（`#ntl-jump`・`<input type="datetime-local">`・`applyMode` の外。`refreshUI` の後、`buildZones()` の隣で書き戻す）。
  独自のピッカーは作らず、足すのは ⑴ どのタイムゾーンの壁時計か（`zFields`/`zInstant`）と ⑵ カーネルが受け取る範囲（下限 `IntMapTime.min`／上限
  `fcMaxMs()`＝モデルの最終有効時刻、無ければ現在。日付ピッカーの上限も同じ関数）。上限を越えて未来を指せるのは `allowFuture` を渡すから。書き込みは
  320 ms のデバウンスで、下限より下の年は下限として読む。フォーカスがある間は値を書き戻さない（`blur` で整合）。
- **「過去／未来」を決める関数は1つ**（`sideWord`。パネル内のバッジと折り畳みボタンの副題が読む）。
- **読み手が見る名前は Chronos**。契約名 `window.IntMapTime` は変えない。カーネルは `js/chronos.js`（import 時に公開）、UI は `js/news-timeline.js`。
- **Time タブは時刻と日付を 2 行で出す**（`#ntl-bigval` は `HH:MM` だけ、日付は `#ntl-bigdate`。1 行にまとめると黙って切れる）。日付の書式は
  Date タブと同じ `_dateText()`。整形は `js/hist-scale.js` の `dateText`（`yearText` の隣）が持ち、年が 1 未満のときだけ時代を要求する
  （`js/chronos.js` の `ymdISO` もここを読む）。
- **Time タブのスライダーには目盛りがある**（`#ntl-ticks`・`buildTicks`。1 時間ごと、6 本ごとに `00:00 / 06:00 / 12:00 / 18:00 / 24:00`）。位置は
  `(v − min) / (max − min)` で値から計算し、軸の終わりは `_timeMaxMins()`。目盛りはスライダーの直下に置き（Time タブでは `.ntl-scale` を隠す）、
  レールは親指の半分ぶん内側（`--tk-half`）。
- **どの時計で読み書きするか**を Chronos のプルダウンが持つ（端末／UTC／地図中心の標準時／主要24タイムゾーン）。瞬間ではなく書き方を選ぶ（逆変換は
  その瞬間のオフセットで1回補正）。「地図中心」は `window.IntMapTimeZones` の Natural Earth のポリゴンの**標準時**（DST 規則は無いと選択肢が書く）。
  ポリゴンを取る `ensure()` は読み手が選んだときと保存済みの設定が復元されたときの 2 つの扉から呼び、カメラに追従する。`window.IntMapTimeZones` は
  1つのオブジェクトで、公開する側は `Object.assign` で足す（`ensure` / `ready` / `offsetAt`）。
- **折り畳みボタンの2行目は「いま何を見ているか」**——ライブなら操作の案内、そうでなければ `過去を表示中` / `未来を表示中`。「反映内容」の欄は
  無い（各レイヤーの凡例の仕事）。

#### 時計に従う層

- **ライブ衛星も時計に従う**（`js/satellites-live.js`：SGP4 に渡す瞬間が `IntMapTime.when()`、軌道要素の古さもその瞬間で測る）。描くのは各衛星の軌道要素
  がその瞬間について述べるときだけ（`_elementSpan`：元期の前後に平均運動の帯ごとの幅。表・基準・失効条件は `js/satellites-live.js` の註）。国際標識の
  打ち上げ年より前も描かない。全部範囲の外なら凡例が「この日時の軌道要素はありません（手元の要素が述べるのは 〜）」と述べ、行の状態は `nodata`
  （`js/layer-state.js`、Atlas は `layerStates`）。次回通過の探索も要素の範囲で止まる（`limited`）。同じ瞬間の伝播は 1 回だけ（`propagateAll` が
  「カタログ（`sats` の同一性）＋瞬間」を持つ）。伝播の費用は元期から遠いほど増える。
- **年セレクタは層の上にもある**（`window._legendClockYear` — `js/data-layers.js`）。1人当たりGDP・人口密度・合計特殊出生率・国防費・国防費対GDP・HDI・
  貿易フロー・エネルギー構成・作物の凡例が `window.IntMapTime` を読んで書く（行は自分の年を持たない）。範囲は各出典（Maddison 1850–／世界銀行 1960–／
  BACI 1995–2024／OWID は読み込んだ CSV から実測）。「最新値」で塗らず全系列を取って 1 年ずつ描く。既定は被覆が最大の90%以上ある中で最も新しい年で、
  凡例に年と報告国数を出す。
- **HDI は UNDP の年次系列**（`data/hdi-series.json`、`scripts/build-hdi.mjs`、193か国 × 1990–2022）。`js/time-countries.js` がマスタークロックに重ね、
  `window._imHdiYear` が画面に出ている年を持つ（1990 より前は `null`、最後の公表年より後はその列）。凡例の年は `_imReapplyChoros` から書き換わる。
- **国境・国家も時計に従う**（`js/time-borders.js` / `js/history.js`）。歴史 GDP・人口はマディソン・プロジェクト（`data/maddison.json`・**1850–2018**、
  `scripts/build-maddison.mjs`）。歴史的国家のクリックは当時の名称・当時の記事に解決し、出典の名称を歴史地物の身元として保持する（現代国家の名前・
  記事・旗で上書きしない）。時代→記事の表は各政体の実際の開始年で始まり（窓の下限を開始年として書かない）、検査は表の全行を読み、1900 で始まって
  よい行は理由付きの許可リストに載る。
- **地図の国名ラベルと Countries 一覧は、同じ「その年の身元」を出す。** ラベル側は `countryStats` の改名を読まず、年だけの関数
  `IntMapHistId.at(code, year)` と `IntMapHistStates.activeAt(year)` に訊く。改名が当たっている国の現代名は `IntMapHistId._applied()`。適用する年の範囲は
  一覧側と同じ式。旧国家は `IntMapHistStates.hbRe(code)` でポリゴン名に結ぶ（クリック経路と同じ対応表）。`js/time-countries.js` は身元が変わるたび
  **`intmap-hist-identity`** を投げ、ラベルは札が動いたときだけ貼り直す。
- **昔の国名ラベルは国境ポリゴンとは別の点ソース（`imtb-lbl-src`）から描く**（ポリゴンに `symbol-placement:'point'` を当てると外環ひとつにつき1個の
  候補になる）。`js/time-borders.js` の `_labelFC()` が境界を書くたびに `imtb-src` から 1 identity（`NAME`）＝1 Point を作り直し、アンカーは最大の
  部分の pole of inaccessibility（`WeakMap` で記憶）。点の properties は写し（共有すると `_sourceHolds` が書き込みを飛ばす）。2層は
  `text-variable-anchor` で置き場所を増やし、置く順は面積（点の `_sort`。区分名の `js/time-admin1.js` `sortKeyOf` と同じ鍵）。歴史の区分名
  （`imta-lbl` / `imta2-lbl` / `imta3-lbl`）も同じ関数（`labelFC(fc, keyOf, true)`）に訊く。詳細は [`docs/MAP-LAYERS.md`](../MAP-LAYERS.md)。
- **現代名の記載がない歴史地名も、出典自身の地点として描く**（`js/hist-places.js` の `window.IntMapHistPlaces`）。`scripts/histplaces/pleiades-record.json`
  の固定記録を `scripts/build-hist-places.mjs` が検査・変換し、`data/hist-places.json` に **6698地点・12646件の年代付き名称記録**を収録する（Pleiades が
  CC BY 3.0 を明示し、集落型・代表点・日付付き名称を持ち、取得年より前に終わる名称を含むレコード）。現代名の有無で除外せず、都市名変更に実収録
  された出典IDだけを重複除外する（同じ Pleiades ID は既存の都市名変更を優先）。**現代名の不記載は廃絶の証拠ではない。** 座標の近さや同名だけで
  別のレコードを消さない。名称の期間は出典の概略の時代区分で、負数の出典年は `IntMapHistScale.fromEra()` を通す。広い期間を Chronos の下限を
  広げる根拠にしない。座標は出典の代表点。原綴り・転写・言語コード・疑問符を保持し、カードに期間と位置の限界・Pleiades へのリンク・帰属を出す。
  Chronos が現在を離れたときに遅延取得し、表示は都市ラベルに従い、現在へ戻ると隠す。`state()` は取得状態・年・件数・表示状態・出典・注意だけを返す。
  解除時は取得中断・購読解除を行い遅着した応答を採用しない。
- **歴史上の都市人口は、出典が述べた数値だけを、述べた年とともに描く**（`dl-histurban`、規則 `js/hist-urban.js`、描画 `js/layer-pkg-histurban.js`）。
  出典は Reba・Reitsma・Seto（2016, Scientific Data 3:160034, CC BY 4.0）——Chandler（紀元前2250〜1975年）と Modelski（紀元前3700〜紀元1000年・2000年）。
  `scripts/build-hist-urban.mjs` が figshare の 3 CSV（md5・sha256 固定）を `scripts/histurban/reba-record.json` に縮約し `data/hist-urban.json` を決定的に
  導く（`check:histurban` がバイト単位で照合）。
  - **補間しない**: 年 T には T 以前で最も新しい記載年 y の数値を、y の窓の中でだけ（T < y + 窓[y]）示し、常に y を述べる。2 冊が同じ y を述べれば両方。
  - **窓は記録自身の刻みから導く**（2 段の中央値: ① y をまたいで追われている都市の記載間隔の中央値 S(y)、② [y − S(y), y] の全数値について同じ都市が
    次に記載されるまでの年数の中央値＝窓[y]。紀元1000年は 100 年、1500年は 47 年、1900年以降は 25 年）。
  - **年は天文年**（紀元前 n 年 ＝ 1 − n）。位置の確からしさ（1〜3）は出典の地理符号化の順位。
  - **同一性は座標＋名前**（表をまたぐ行は名前が一致し、粗い方の精度で座標が等しいときだけまとめる。同じ表の別行はまとめない。同じ座標の別名の都市は
    互いにそれを述べる）。Pleiades 地点・歴史都市名とは互いに最も近く共通の名前を持つときだけ結び、ラベルは数値だけにする。
  - **収録基準**: 一定規模以上の都市だけ。載っていないことは「記載が無い」——カードと Atlas がそう述べる。Atlas は `time.cityPopulation`。
- **地図の上のカード（`.plc-popup`）のボタンの色はカードが持つ**（`css/intmap.css` の `:where(.plc-popup .maplibregl-popup-content) button` が
  `--input-bg` と `--text-main`。特定度は素の `button` と同じ）。`tests/map-next.spec.js` が WCAG のコントラスト比で両テーマを測る。
- **出典別の地名カードも、クリック判定は共通の入口を使う**（`js/map-ui.js` の `IntMapPlaceReaders.register(layerId, {open, close})` が直接クリック・
  パディング付きタップ・ホバー・優先関係・カードの終了を既存の地名と同じ経路へ登録し、解除関数を返す）。`imhp-lbl` はここへ出典IDで読むカードを登録する。
  譲るハンドラは `ownership:'fallback'` を宣言する。

#### 都市名ラベル

- **都市名ラベルも時計に従う**（`js/hist-cities.js` の `window.IntMapHistCities`・記録は `scripts/histcities/` → `data/hist-cities.json`・
  **6474都市／9241の歴史名**・125か国）。開始時期が出典に無い歴史名には `[?]` を付け、日付を推定しない。対応付ける名前は同じ地物について出典が述べる
  名前から導き、近隣の GeoNames 地点を見つけただけでは名前を足さない。複数の新旧名を結ぶ出典からは同一性グラフを作り、入力順に依存せず統合する。
  - **手書きの記録（611 行・1 件も落とさない。`--check`）と、上流から導出した記録の和集合**。導出は Wikidata（CC0・QID・日付精度を保持）・Pleiades
    （CC BY 3.0・古代）・OpenHistoricalMap（CC0・中世〜近世。250 m 以内のノードは同じ場所として束ねる。点と輪郭の両方を訊く——
    `scripts/histcities/harvest.mjs` の `OHM_PLACE_KINDS`。`place` の白名簿は `city|town|village|hamlet` の 4 値で、`suburb` などの区画は採らない。除外は
    OHM 自身の申告——`*:confidence` / `*:source=arbitrary` / `*:fixme` / `*:edtf` と CC0 以外の `license`）。
  - 9 言語完備を要求するのは手書きの行だけ。同じ場所の 2 つの span が同じ名前を述べるなら互いの言語欄を使ってよく（`sameName`）、中断なく続いた
    1 つの名前は 1 つの span に畳む。行ごとの `a` がどの言語に実物があるかを持ち、ビットが立っていない言語には欄そのものが無い（解決は
    `n[lang] || n.en`。英語欄と違う綴りの欄は残す）。その `en` は記録自身の綴り（537 span はラテン文字でない）で、件数はファイル自身の `note` が述べ
    `check:histcities` がラチェットで抑える。
  - 1942年のヴォルゴグラードは**スターリングラード**、1867年の東京は**江戸**、1960年のサンクトペテルブルクは**レニングラード**。層は足さず、`ofm-city`
    （`class in [city, town]`）の `text-field` を `match` で包み、既定は従来の言語式そのもの（ラベルはタイル自身の位置）。判定はクロック
    （`IntMapTimeBorders.active()` ではない）。
- **式を作り直すのは、名前の期間の境目を跨いだときだけ**（エポック。境目は `f` と `t + 1` で、`data/hist-cities.json` から導き、鍵は「境目をいくつ
  越えたか」＋言語＋基底式）。同じエポックでは同じ配列が返り、`js/place-labels.js` は同じ配列なら `setLayoutProperty` を呼ばない。境目を跨ぐ書き込みの
  解析を小さくする 2 点: ① 候補群ごとの `case` は 1 回だけ書き、`let` の束縛を `name:en` と `name` の `match` が `['var', …]` で指す（当たらなければ `''`
  を返し、`name:en` → `name` → 通常のラベルの順）。② この式に限って `{validate:false}` で書く（検証は検査がする。`js/hist-cities.js` の `built(expr)` が
  真のときだけ `js/place-labels.js` が第 4 引数を渡す）。検査は `tests/hist-city-label-epoch-checks.test.mjs`（境目の両側でバイト同一・同じエポックで同一の
  配列・MapLibre の評価器・`validateStyleMin`・`built`）、`tests/history-cities-checks.test.mjs` ④、`tests/hist-city-label-epoch.spec.js`。
- **どの都市を改名するかは綴り＋位置で決まる。** 各行はガード半径（`data/hist-cities.json` の `g`・メートル）を持ち、`match` の各分岐は MapLibre の
  `distance` 式で半径内かを訊く `case`。半径外・評価できない（NaN）ときは元のラベルへ落ちる（壊れる向きは「歴史名が出ない」側）。
- **ガード半径は導出する**（`scripts/build-hist-cities.mjs`、`npm run check:histcities`）——同じ綴りを持つ最も近い集落までの距離の半分（上限 20 km・
  下限 6 km）。下限 6 km は実測が無い行の既定値（記録座標とタイルのノードの差の最悪値 6.68 km から）で、自分の差を実測した行は
  `{ measured: { km, on, why } }` で下回れる（ガードが実測値の 3 倍以上。2 km の硬い下限はタイルの量子化 ±0.61 km から）。現在の宣言はアルメニアの
  アルマヴィル 1 行。
- **その証拠は `data/histcities-homonyms.json.gz`（`scripts/build-histcities-homonyms.mjs`。GeoNames cities500 を記録の綴りに限って重複排除せず保持）で
  あって `data/gazetteer-world.json.gz`（同名なら人口の多い方だけ）ではない。** `check:histcities` は ① 座標が GeoNames の当該集落から 10 km 以内、
  ② ガードの中に別の集落が入らない、③ 入るのが双子都市なら `{ key, place, cc, why }` の waiver があり、その綴りが今も相手の別名欄にしか無いこと
  （毎回試される主張）を要求する。

#### 旧国家と国の事実

- **旧国家の名前はタプルであり、読み手は `window.IntMapHistName(name, slot)` の1本だけ**（`IntMapHistStates.STATES` の `name` は `IntMapLang.pickArgs()` の
  配列）。`{nameEn, nameJp}` を組む場所（`js/history.js` の `agg` と `apply`、`js/stats-compare.js` の `_histMini`）は全部これを通し、タプルは `name` に
  載せたまま運ぶ。`countryStats` がその旧国家を持たない状態（現在へ戻った直後・存在しない年・セッション復元）でも比較パネルはこの記録から名前と旗を出す。
- **消えた国は現代の後継国に分解して並べない**（`js/history.js` の `IntMapHistStates`。オーストリア帝国 → オーストリア＝ハンガリー／朝鮮 → 大韓帝国 →
  大日本帝国／東インド会社 → イギリス領インド帝国）。後継国を隠すのはその国家が実際に保有していた期間だけ（`succ` の `held`。窓の日付は
  `data/cshapes.js` から）。隠す集合・集計する集合・ラベルの被覆集合はすべて **`IntMapHistStates.succAt(S, date)`** から出る。窓を持たない後継国もある
  （モルドバ）。
- **国詳細カードの6欄（首都・通貨・言語・隣接・時間帯・国連加盟）は同梱している**（`data/country-facts.json`。restcountries.com は撤去され、301 に
  CORS ヘッダが無い）。`scripts/build-country-facts.mjs` がビルド時に作り、カードを開いたときに1度だけ読む。上流は mledoze/countries（ODbL 1.0）と
  IANA time-zone database（public domain）、鍵は `ISO_A3_EH || ISO_A3 || ADM0_A3`。3欄は `js/tables.js` の手書き表の穴埋め。状態は
  `window.IntMapCountryFacts.state`（`idle` / `loading` / `ready` / `failed`）と `.error`（失敗は次のカードで retry）。`withoutTimezone` は tz の無いコード
  （コソボ、Heard & McDonald）を名指す。上流の誤りは訂正としてデータに書く（バチカンは国連加盟国ではない＝加盟国は 193、スリランカとインドの間に陸の
  国境は無い）。2つのコード体系の差（NE 252 と mledoze 250）は宣言され、実測と一致しなければビルドが失敗する。検査は
  `tests/shell-data-layers-checks.test.mjs` と `tests/r424.spec.js` の末尾。
- **国名の下のサブ行（`.stat-sub` ＝ `region / capital`）の region は**、一覧の行と国詳細カードの Region 行がどちらも `js/countries-ui.js` の
  `_regionName()`（`pickArgs()` の5引数＋4言語の inline 表）を通る。表の鍵は Natural Earth の CONTINENT 8種（`Seven seas (open ocean)` を含む）と
  `js/history.js` の `STATES` の準大陸の語彙（`Eurasia` / `Middle East` / `South Asia` / `Southeast Asia` / `East Asia`）の和集合。表に無い値は生の英語で
  出るので `tests/news-countries-checks.test.mjs` ①② が両方が鍵であることを、④ が `js/lang-registry.js` と inline 表を実行して 9言語の解決を確かめる。
  首都は地名なので訳さない（`CAPITAL[code]`、歴史の行は `_STINFO`）。
- **Region 行の subregion** は `js/countries-ui.js` の **`window._imSubregionName(sub, lang)`**（Natural Earth の SUBREGION 24種。`ne_110m` は22種）。
  空の SUBREGION は無いので `region` / `subregion` のフォールバック行は無い。表は1本で、`js/atlas-examples.js` の starter chip の `{sub}` も同じ表を読む
  （`tests/news-countries-checks.test.mjs` ⑩ が24語を宣言するファイルがちょうど1本であることと、script として parse できることを検査する）。`export`
  ではなく `window` で渡すのは、検査ハーネスが `new Function(src)` で素のスクリプトとして実行するため（`window._imCldrRegion` も同じ）。2欄が解決後に
  同じ語になったら1つに畳む。

#### 時計に従う主題レイヤー

- **インターネットの健康状態**（`js/net-health.js`・レイヤー行は **2本**・既定 OFF）。`dl-nethlth`（国／地方を回線自身の直近の通常水準からの低下率で塗る）・
  `dl-netreach`（切断を報告している測定プローブを点で置く）。行の順序・id・色見本・名前・IntMapOS のラベルは `ROWS` ただ1つで、`js/net-health-live.js`
  は凡例の見出しをそこから読む。観測網の正本は `PROVIDERS` 表で、計器名は上流の応答の `datasource` から発見する（`tests/layer-net-health-checks.test.mjs`
  ⑦）。中継は無い（3つの観測網を読者のブラウザが直接読む。RIPE の規約が再配布を禁じる）。上流は打ち間違いと障害ゼロに同じ応答を返すので、範囲は
  `/entities/query` が実体を返したときだけ使い、返さなければ `unsupported_scope`。範囲→地物は国が Natural Earth（`ISO_A2_EH`→`ISO_A2`）、地方が
  `js/atlas-admin1.js` の `resolveMany()`（結合できないものは拒んで数える）。詳細は [`docs/INTERNET-HEALTH.md`](../INTERNET-HEALTH.md)。
- **戦争の日ごとの勢力**（`js/war-fronts.js`・レイヤー行は **6本**・既定 OFF）。`dl-ww1`・`dl-ww2`・`dl-korea`・`dl-vietnam`・`dl-mideast`
  （1948/56/67/73）・`dl-yugoslavia`。その日の支配（面）・戦線（線）・進行中の作戦（点と名前）を描き、行の定義は `ROWS` ただ1つ。面は保存せず戦線の
  線で国の輪郭を切って導く（`js/war-geom.js`）。記録は `scripts/wars/`、ビルドは `scripts/build-wars.mjs` → `data/wars.json`。**正本は
  [`docs/MAP-LAYERS.md`](../MAP-LAYERS.md) §7.12。** 位置の記録がある日付にだけ線を引き次の日付まで保持する（補間しない）。
  - **時計は2つ、繋がりは片方向**: 凡例の日スライダーと再生は Chronos を読むだけ。Chronos を動かせば層は追従し再生は止まる。層を読者が点けたときだけ、
    時計が期間外なら開戦日へ1回動かす（共有リンク／セッションの復元と自己修復の `change` は動かさない。`docs/architecture/08-ui.md`）。
  - 層が描く窓は `span`（ビルドが導出。戦闘の外へは最大 120 日）。作戦の種別は9種（`battle` / `naval` / `air` / `siege` / `landing` / `political` /
    `conference` / `atrocity` / `uprising`）で、色と9言語名の正本は `scripts/wars/lang.mjs` の `KINDS`。作戦は `str` と `cas`（整数か `[低, 高]`、両軍
    合計）を持てる（円の半径は `cas`、数値の無い作戦は基準の大きさ）。
  - **収録範囲**（戦線 / 日付入りの線 / 作戦 / 領域）: 第一次大戦 **9 / 85 / 195 / 124**、第二次大戦 **12 / 109 / 313 / 156**、朝鮮戦争 **1 / 19 / 40 / 20**、
    ベトナム戦争 **3 / 11 / 44 / 10**、中東戦争 **7 / 22 / 33 / 11**、ユーゴスラビア紛争 **5 / 8 / 30 / 4**。地名辞書は **865 件**。作戦は合計 **655 件**で、
    死傷・捕虜の数値を持つのが 330 件・投入兵力が 206 件。中東戦争は数値を持たない（公表値が当事国間で桁が割れる）。戦線は西部・東部・イタリア・マケドニア・
    シナイ＝パレスチナ・セルビア（1914）・コーカサス・メソポタミア・ルーマニア（WW1）、ポーランド・フランス・東部・フィンランド・北アフリカ・イタリア・
    西部（1944）・中国・ノルウェー・ギリシャ＝イタリア・バルカン（1941）・ビルマ（WW2）。
  - 太平洋には戦線を引かない（記録は作戦の集合。東経100度以東・南緯12度〜北緯45度の箱に入るものが 71 件で 1939–45 の各年に分布）。戦役が終わった戦線は
    `until` で切る。`scripts/wars/places.mjs`（戦域ごとの `places-<戦争>.mjs` を束ねる）の地名はどこかから必ず引かれる。輪郭が「その日の姿」でない戦争は
    戦線を明示する（CShapes の朝鮮半島の形は 1953 年の休戦線なので、開戦日の 38 度線を戦線として引き両方の朝鮮を切る）。
- **年次系列を持たない指標に、誤った年を付さない**（公開系列が無いものは版を明示するだけ）。
- **衛星の夜間光（`dl-nightsat`）と地球の夜側は、同じ 1 つの epoch を Chronos から引く**（`js/night-lights.js` ＝ `window.IntMapNightLights`）。層に自分の
  年は無く、凡例の年の行は `legendClockYear` で Chronos に書く。LIVE なら最新の epoch、`ERA_FROM`（＝ 2012）より前は epoch なし（何も描かず凡例が理由を
  言う）、それ以外は `|年 − epoch の年|` が最小の epoch（中間の 2014 は新しいほう）。購読者に届くのは epoch の変化だけ。年次の系列は存在しない（GIBS の
  `VIIRS_Black_Marble` と `VIIRS_Night_Lights` は 2012-01-01 と 2016-01-01 の 2 値だけ。日次の
  `VIIRS_SNPP_GapFilled_BRDF_Corrected_DayNightBand_Radiance` は品質で採らない。理由は `DECISIONS.md`）。凡例は 3 つの状態——絵があるとき（product・
  センサー・出典・ネイティブ分解能・データ年、時計の年と違えば「Chronos: 2020 → 最も近い記録: 2016」）／記録が無いとき（`No data` と理由）／取得に
  失敗したとき（レンダラの `error` が `src-nightsat` について言ったときだけ）——を別の事実として言う。

### 7.4a 時刻 T の地図——レイヤーは典拠が述べる範囲でだけ描く

- **1 つの機構**: `js/layer-time.js`（規則・純粋）／`js/layer-time-decl.js`（175 行＝レイヤー 164 ＋基本表示 11 の宣言・純データ）／
  `js/layer-time-kernel.js`（`window.IntMapLayerTime`）。時計の上に乗る。**時計は地図ごとに 1 つ**（`js/chronos.js` の `makeClock()`）で、
  メイン地図の時計が `IntMapTime`、比較ウィンドウはもう 1 つを持つ（7.4b）。
- **宣言は 1 層 1 つ**、`TIME[id]`（`js/layer-manifest.js` の id）。DOM も `window` も参照しない閉じた語彙——`kind`（instant / convention / enduring /
  record / series / snapshot / live / forecast）、時計の当て方（`follows`＝範囲の中で時計の瞬間を描く・`self`＝範囲の外も自分で述べる・`entry`＝読者の
  クリックで時計を自分の記録へ動かす・`ownDate`＝自前の日付を持つ）、範囲（`from` / `to` / `asOf` / `period` / `carry`）、`says`（何が範囲を述べるか、
  en+jp）。**日付の値には必ず `by`（その値を述べるファイルか上流のページ）が付く**。小さなファイルなら値そのものを指し（`data/gibs-range.json#layers.gxndvi.from`）、
  大きなファイル（`data/wars.json` 954 kB など）は値を書いて `cite` で位置を示し（`wars[id=ww1].span.0`・`elections.$min(date)`）、門が一致を確かめる。
  実行時に読む範囲は `runtime` で、読んだモジュールが `IntMapLayerTime.range(id, …)` で報告する（ECMWF は `@ecmwf-ifs` の 1 回で 10 行ぶん）。範囲を
  誰も述べていない行は `rangeUnstated`（未決。計器が穴として数える）。
- **判定は `verdict` 1 つ**: stated（典拠が T を述べる→描く）／carried（別の時点を述べ、それと言って描く）／unstated（描かない）。スナップショットの
  1 版は上流の周期 `period` を述べる（OpenStreetMap は 1 日。`scripts/lib/upstream-cadence.mjs` の `OPENSTREETMAP`）。ライブは現在だけ。
- **描かないとは**: 箱の `change` を預かり（`js/layer-rows.js` の `holdUntilDrawable` と同じ形）、描いていた箱にはモジュール自身の「オフ」を地図自身の変更
  として送り（`__syn`）、箱はイベント無しでチェックに戻す。読者の選択・共有リンク・セッションはそのまま。述べる時刻に戻れば 1 回の「オン」で配る。
  `self` の層は預からず行に印だけを出す。自己修復（`IntMapLayerAudit`）は預かっている箱を空と数えない（`timeHeld`）。
- **現在の時計で止まってよいのは `entry` の層だけ**（門が検査する）。
- **読み手は 3 つ**: 行（`js/layer-state.js` の `nodata`）／凡例 `#data-legend-worldtime`（「描いていません」と「別の時点の記録を表示」）／Atlas
  （`layerStates`・`time` 節の `layers`・能力 `time.coverage`。`time.travel` の結果にも描けなくなった層を添える）。
- **宣言は時計が現在を離れたときに読む**（`import()`）。
- **世界銀行の指標は目録 1 つ・取得 1 本**: 系列コード（合算・廃止系列の後継）・名前・単位・国テーブルの欄は `js/wb-indicators.js` の `WB_INDICATORS` だけが
  持ち、取得は同じファイルの `readWorldBank`（応答中の共有・同時 6 本・`ok`／`none` は保持し `unavailable` は保持しない・時間切れは `late`）。系列コードと
  API の住所が他の js/ に現れると `tests/country-analysis-unify-checks.test.mjs` が落ちる。
- **自前の時計を持っていた行は時計に従う**: 世界銀行の 61 行（`js/wb-layers.js` `yearFor`。「最新（国ごと）」は現在に戻す）、NASA GIBS の 4 行
  （`js/layer-packs.js` `gxAt`）。自前の日付を残す行（年降水量・人口グリッド・WorldCover・海流・選挙）は `ownDate` で宣言し、範囲の中では carried と述べる。
- 計器は `node scripts/world-at-time.mjs --year <年|now>`（全層の判定と理由）・`--years`（主要年）・`--check`（門）。

### 7.4b 二時点比較とタイムラプス

- **比較ウィンドウは自分の時計を持つ地図**（`js/compare.js`、`makeClock('compare')`）。既定は「メイン地図の時刻に従う」。「独自の時刻」・年の入力・「現在」で
  ウィンドウだけがその瞬間になる。地図上の札がウィンドウの瞬間（太字）とメイン地図の瞬間を並べる（同じなら 1 つ）。
- **大きさは辺と角のどこからでも変えられる**——`addEdgeResize`（`js/window-manager.js`。Atlas のウィンドウ・経路カードと同じ）で辺と角の 9 px、最小は 260×200。
  携帯（`IntMapDevice.COMPACT`）では幅が画面いっぱいで、高さは下端のつまみ（`.cmp-resize`）、辺の帯は退く（`skip`）。地図の再計算は ResizeObserver。
- **ウィンドウは四辺とも画面の中に留まる**（ヘッダでの移動・ブラウザ幅の変更 `_cmpReclamp`・辺のリサイズ `bounds` が同じ規則。左端はサイドバーの右）。
  辺の帯が掴んだ押下ではヘッダの移動は始まらない。掴む間は `box-sizing:border-box`。
- **ウィンドウの層も 7.4a と同じ規則で判定する**。各層は同じ典拠のメイン地図の層の宣言（`lid`）と、瞬間を当てる者（`drawnBy`）を持ち、`follows` / `self` /
  `ownDate` だけを差し替える（`js/layer-time.js` の `onMap`、`verdict(id, clock, drawnBy)`）。メイン地図に無い典拠（MERRA-2 の月平均気温）は自分の宣言を持ち
  `judge(decl, clock)` が同じ `validate` を通す。述べない瞬間には描かずピッカーの下に理由を出す。
- **ウィンドウの歴史国境はその瞬間の記録**（`js/time-borders.js` の `collectionAt(when)`）。現在の基図が答える瞬間はそう述べ、era の記録が答える瞬間には
  「地図」基図もメイン地図と同じ規則で物理地理に替わる（`js/historical-basemap.js` の層定義をウィンドウの OpenFreeMap ソースで描く）。
- **共有リンク**は `cmp=` の隣に `ct=`（年・ISO 日・`now`。従っている間は書かない）。
- **あの頃といま（スワイプ）**——4 つ目の見せ方（`js/compare.js` の `thenNow` / `setMode('swipe')`）。ウィンドウの地図をメインのカメラに画素で合わせたまま
  地図領域いっぱいに広げ、縦の分割線で切る（`clip-path`。左があの頃、右がいま）。描画系は増やさず、ウィンドウ自身の地図を `#map` の隣へ移し、終えると戻す。
  分割線は `touch-action:none` の取っ手とキーボードのスライダー（矢印・Page・Home/End）で、両側に札が乗る。位置は `cmp=s`／`cmp=s<0–100>`。
  `thenNow({ then, now })` は過去の瞬間が無ければ年の入力を待ち、`then` 無しでメイン地図が過去なら、その瞬間をあの頃にしてメイン地図を現在へ戻す。層が
  選ばれずあの頃が era の瞬間ならその国境（`histb`）を描く。入口は Chronos パネルの「あの頃といま」（`js/news-timeline.js`）・共有パネルの画像タブ・
  Atlas `time.thenNow`。
- **タイムラプス**（`js/time-lapse.js`、`#ntl-lapse`）はメイン地図の時計を年／日／時の刻みで進める。予報の再生もこの再生器（`js/wx-ecmwf.js` の `play` と
  `js/news-timeline.js` の `fcPlay` はどちらも `startLapse({ instants, owner })` で、モデルの有効時刻の列を `allowFuture` で置く）。`owner`
  （`forecast:<モデル>`）が誰の再生かを述べ、別の再生を始めると前は終わる。**1 コマは描画が追いついてから**——時間カーネルの判定（`lastSettled`）・全タイル
  （`IntMapGeoEngine.ready()`）・その瞬間の国境（`collectionAt` と `current()`）の後に速度ぶん留まる。訊ける相手がいない条件はコマを止めない。読者や Atlas が
  時計を動かすと止まる。`prefers-reduced-motion` では最も遅い速度に固定しそう述べる。各コマで層の描き始め／描かれなくなったを記録する。
- **書き出し**（`js/map-recorder.js`、`#ntl-rec`。遅延チャンク）。タイムラプスを動画に、比較ウィンドウとメイン地図を 1 枚の PNG にする。枠は 1080×1080・
  1920×1080・1080×1920 で、中央で切り抜き、各面の左上にその瞬間、下の帯に語標・リンク（ビルドが `site-origin.js` から書く og:url）と出典。出典は描いている
  層のソースの帰属表示と `#map-credit`（`scene.getStyle()` の可視・ズーム範囲内の層。空の GeoJSON は数えない）で、4 行を超えると 20 px まで縮め、それでも
  入らなければ帯を高くする。**動画のコマはタイムラプスのコマ**: 再生器は描き終えたコマを `sink.frame` に渡し、録画器はレンダリングの tick の中で地図を読み
  （`atlas-view-capture.js` の `captureCanvas`）、合成し、**WebCodecs の `VideoEncoder` に k 番目のコマを時刻 k/fps・長さ 1/fps で渡す**（待ち時間はファイルに
  入らない）。最後に同じ絵をもう 1 コマ書き（`encoded` = `frames` + 1）、`flush` で全コマが返るのを待ち、数が違えば失敗として述べる。容器は自前
  （`js/video-mux.js`。WebM は Matroska、MP4 は ISO の box で索引を先頭に）。形式は書ける最初のもの（MP4 の H.264 レベル 4.0 → WebM の VP9 → VP8）。
  MediaRecorder は `VideoEncoder` の無いブラウザのためだけに残り（状態の `via`）、地図を待つ間は一時停止し 1/fps だけ再開する（`requestFrame` の後の描画で
  コマを取る。負荷が高いとコマを落としうる——`js/video-mux.js` の冒頭）。終点より前に止まった録画は何も残さない。終わったら保存リンクと共有シート。
- **年鑑（その年の世界）**（`js/year-book.js`、「この年を読む」）。時計の瞬間を地図と同じ記録から読む 1 枚のページ: 政体の数と描かれた形の球面上の面積の順、
  答えている記録とその `src`（合成した答えは `record` に順に。無ければ `js/time-borders.js` の `recordOf(tier)`）、その年の中で国境の記録が変わる日と現れる・
  消える・国境が変わる政体（**日付つき出来事の索引** `js/time-index.js` の年の切り口。§8.6.3。OpenHistoricalMap は前日と当日を比べ「年として読んで」と添え、
  `changePrecision()` が `year` の変化は年として書く）、戦争の記録（期間は `js/layer-time-decl.js` の戦争の行から）のその年の作戦（`warRecords`）、索引が運ぶ
  Wikidata の日付つき出来事（精度と何の日かを添える）、Maddison の人口と 1 人当たり GDP（国コード別と述べる）、その瞬間を述べる典拠を持つレイヤーの数。
  押すとその範囲・日付・場所へ。開いている間は時計に追従する。Atlas は `time.yearbook`（`show:true` で開く）。
- **Atlas**: `time.compare` と `time.lapse`（再生・停止・`record:true` で録画）。観測器 `timeView` が実行後にウィンドウと再生器に状態を訊き、一致したときだけ
  完了（既にそうなら `already_there`）。`time` 節にウィンドウの瞬間と再生の様子が載る。

### 7.4c 政体の盛衰——1 つの政体を全時代にわたって読む

- **何を見せるか**（`js/polity-arc.js`）: 地図がその名前で描き始めた年・描き終えた年、描かれた形の面積の推移（球面上。年鑑と同じ `areaKm2`）、最大の描画面積の
  年とそれを描いた記録、記録上の別の名前（同じ Wikidata 項目に結ばれた名前／日本語の画面で地図が同じ名前で書く名前。理由を添える）。何も選ばないときは
  年代のある記録（Cliopatria・OpenHistoricalMap・CShapes）が描く名前を最大の面積の順に並べ、検索は地図が書く名前（英語・日本語）と Wikidata 項目で引く
  （完全一致 → 前方一致 → 部分一致、同順位は面積順）。historical-basemaps の枚だけが描く名前は検索には出るが順位には入らない。
- **グラフ**: 横軸は描き始めから描き終えまで、縦軸は描画面積の段。区間の色はその区間を描いた最も精度の高い記録。記録が始まる年（1689・1886）は破線で、
  その段差は記録の違いだとページが述べる。枚だけが述べる面積は白抜きの点。時計の位置を縦線で示し、置くとその年を読み、押すと時計がその年の 7 月 1 日へ動く。
- **端の種類**: 記録の始まり／引き継ぎの年に当たる端は記録の切り替わり（`reach`）、最後の点が描かれたままなら「記録が届く最後の年（2019 年）にも描かれている」
  （`today`）。
- **操作**: 「最大の年へ」「最初の年」「最後の年」は時計と地図の枠を動かす。「一生を再生」は `startLapse({ instants, owner: 'polity-arc:<名前>' })` で描画が変わる
  年だけを再生する。
- **入口**: Chronos パネルの「政体の盛衰」、地点カードの「この場所の歴史」の各行の「〜の盛衰」（行の Wikidata 項目、無ければ記録の名前）、Atlas `time.polityArc`
  （`name`・`qid`・`year`・`pick`、`go: peak|first|last`・`play`・`show`）。
- **索引**: `data/polity-arcs.json`（`scripts/build-polity-arcs.mjs`）。地図のコード（`history-pages.mjs` の `mapReader`）に、Cliopatria の行が始まる・終わる全ての年
  （1689 年より前）・1689〜2019 年の毎年 7 月 1 日・枚の年を訊き、英語の名前ごとに面積（km² の整数）と記録のビットを持つ。面積も記録も変わらない瞬間は 1 点に
  まとめる（唯一の圧縮）。枚が年を述べない断片・説明の名前（`_desc`）・名前の無い形は数えない（`skipped`）。各政体は最大の年・面積・記録・枠（日付変更線を
  またぐ政体は狭い側）と全体の枠を持つ。`--check` が束から作り直して照合する（`tests/hist-product-checks.test.mjs`）。

### 7.5 ウィジェット基盤

**板そのものの不変条件**

- **サイドバーに出ているとき、板はそのサイドバーのスクロール領域**（`.sidebar > .wgt-board` が `flex:1 1 auto; min-height:0; overflow-y:auto`）。Workspace
  ペインと携帯シートでは板は二重にスクロールしない。
- **カードは DOM の順序どおりに敷き詰まる**（`packOrder(items, cols)` が dense 配置を DOM の並びで計算。`grid-auto-flow:dense` は使わない——見た目と読み上げの
  順序が食い違う）。カードは前にしか動かない。
- **アカウント同期は板をモジュールから読む**（`IntMapWidgets2._active()` と `._payload()`。空の板 `[]` も往復する）。

板は**定義を1つのレジストリから供給する基盤**で、責務ごとのモジュールに分かれ、`js/widgets.js` は HOST との接続だけを持つ（一覧は [`docs/FILES.md`](../FILES.md) §3）。

- **レジストリ `window.IntMapWidgetCore`** — 定義（`id` は `family.variant`）・カテゴリ（9つ）・対応サイズ・設定スキーマ・更新方針・ローダ・サイズ別レンダラ・
  操作・旧IDの別名。既定の設定値は関数（`defaultConfig(context)`）。
- **WidgetContext** — レンダラが知ってよいことの全部（言語・テーマ・単位・位置情報の許可状態・地図の中心と範囲・選択中の国／地点・有効レイヤー・Chronos・経路・
  見守る場所の直近の確認結果・保存地点・オンライン状態）。レンダラはグローバルを直接読まない（純関数として検査できる）。
- **状態モデル**は12状態（`idle` / `loading` / `ready` / `refreshing` / `stale` / `offline` / `permission-required` / `permission-denied` / `empty` /
  `rate-limited` / `temporary-error` / `permanent-error`）で、それぞれ理由を文で述べる。失敗しても前回の値は消さない（`WC.keepsValue()` 1か所）。
- **サイズ S / M / L は論理サイズ**（S=1×1・M=2×1・L=2×2）で別々のレンダラを持つ。列数は盤面の実測幅から（`ResizeObserver`）。
- **保存は `intmap_widgets4`**（`{v:4, items:[…]}`）。`intmap_widgets3` は読むだけで消さない（世代バックアップ）。移行は冪等（インスタンス ID を旧 `u` から、
  `createdAt` を位置から導く）。`window.IntMapWidgets2._active()` / `._setActive()` は旧来の `[{u,t,cfg}]` のままで、サイズとスタックは `widgets4` 側が運ぶ。
- **更新は `window.IntMapWidgetScheduler`** が `requestKey` 単位で行う（同じ鍵は1要求・TTL・stale-while-revalidate・`AbortController`・タイムアウト・ジッタ付きの
  指数バックオフ・同時実行数の上限。可視性は `IntersectionObserver`）。再描画は要求を出さず、言語変更は再構成、テーマ変更は CSS。
  **フォールバックが成功しても、主系統のレート制限は呼び出し元へ届く**: `firstOf()`（`js/widget-defs-data.js`）は 429 を返した URL を `retryAfterMs` の間飛ばし、
  全候補が窓の中なら `rateLimited` で reject する。為替は `open.er-api.com` が主系統、`api.fxratesapi.com`（鍵なしで 61 回/時）が2番手。カードの出典行は
  `firstOf()` が返す成功した URL の hostname を名乗る。
- **局所計算のカードは盤面で1本だけのティッカー**に購読する（`WC.tick('second'|'minute')`。購読が0になると止まる）。定義の中で `setInterval` を開かない。
- **スタック**は手動と Smart の2つ。Smart は `window.IntMapWidgetSmart` が文脈から決定論的に順位を付け（固定 → 重大警報 → 実行中の経路／見守る場所の新着 →
  選択中の国 → 現在地 → 地図の範囲 → Chronos → 時間帯 → 直近使用 → 通常）、「なぜ表示されたか」を同じ計算から答える。差が小さいときは動かさず
  （`MARGIN` / `SETTLE`）、重大警報は即座に前へ（`URGENT`）。
- **追加は `window.IntMapWidgetGallery`**（モバイルはボトムシート／デスクトップはモーダル）。検索・カテゴリ・実レンダラによるプレビュー・サイズ切替・追加前設定。
  プレビューは通信せず位置情報の許可も要求しない（位置状態を `prompt` に固定。実データはキャッシュにあるときだけ、無ければ見本と明示して描く）。
- **DOM は `WC.el()` だけが作る**（`innerHTML` へ至る経路が無い）。URL はスキームの許可制（http / https のみ）。
- **IntMap 固有のカードは既存の subsystem を読む**——警報は `IntMapWorld.alertsQuery()`（地図と同じ正規化済みの `feats`）、経路は `IntMapRouting.summary()`、
  レイヤーは `window.IntMapDefaultLayers` とアプリのチェックボックス、ニュースは `HOST.newsFeatures`。場所と国の判定も持ち主に訊く:
  - 「見守る場所」のカード（`intmap.watched-places`。旧 `intmap.monitors` は別名）は `js/place-watch.js` の直近の確認（`lastRun()` → `digestData()`、Atlas の
    `places.watchDigest` と同じ）を出し、ボタンは `openWatchDigest` を開く。モジュールはログインしている読み手にだけ必要になったとき読む（`WC.watchModule()`）。§18.1。
  - 「保存地点の警報」は見守る場所の警報の読み手（`makeReaders().warning().near()`——区域がその地点を含む記録）を使う。
  - 「国のウォッチ」の見出しはピンの地点（`__oc`）が国の輪郭の中にあるもの（`js/news-intel-core.js` `makeCountryIndex`、Natural Earth 10 m）。`mapped:'none'` は
    数えない。警報はその国の alpha-3 の記録。
  - `country` 型の設定は ISO alpha-2（`countryOptions()`）、国の行は `countryRow()` が alpha-2 からも引く。
  - 読み込みが要る答えはギャラリーのプレビュー（`preview: true`）では始めない。
- **Atlas ブリーフィングのカードは AI を呼ばない**（更新方針は `manual`、ローダ無し。`window.IntMapWidgetBriefStore.remember()` が渡すだけ）。
- **スタイルは `css/intmap.css` の1節**（`--widget-*` トークン。JS は `<style>` を作らない）。ライト／ダーク・透明サイドバー・`prefers-reduced-motion`・
  `prefers-reduced-transparency`・`forced-colors` に答え、通常状態のカードに外側の影は付けない（内側のガラス縁だけ）。

#### 7.5.1 ネイティブ（WidgetKit）との境界

**これは Web ページの中のカードであって、iOS のホーム画面／ロック画面／StandBy のウィジェットではない**（ネイティブアプリは無い）。将来 WidgetKit の Extension を
作るときに何が共有でき何が再実装になるかを、ここに1か所だけ書く。

| 事項 | Web 側から共有できるもの | ネイティブ側で必要になるもの |
|---|---|---|
| **定義** | `id` / `family` / `variant` / `category` / `supportedSizes` / `defaultSize` / 設定スキーマ / 更新方針 — **JSON にできる部分**。`IntMapWidgetCore.all()` から書き出せる | 同じ id 体系を持つ Swift 側の `IntentConfiguration`。**レンダラは共有できない**（DOM を返す関数） |
| **表示** | 何を出すかの決定（S/M/L でどの情報を出すか） | **SwiftUI で全面的に再実装**。`systemSmall` / `systemMedium` / `systemLarge` は S/M/L と1対1 |
| **認証** | 無し。Web はブラウザのセッションを使う | App Group ＋ Keychain 共有。**Extension は独自にトークンを持つ**必要がある |
| **位置情報** | 無し | Extension 自身の `NSLocationWhenInUseUsageDescription`。**Web の許可状態は引き継げない** |
| **キャッシュ** | `intmap_widget_cache1` の**形**（requestKey → {at, ttl, data}） | App Group の共有コンテナに同じ形で置き、**本体アプリが書き、ウィジェットは読むだけ** |
| **更新** | `refreshPolicy`（`minIntervalMs` / `staleAfterMs` / `cacheTtlMs`） | **WidgetKit の timeline に翻訳する**。OS が更新回数を決めるので `interval` は希望であり、`stale` の表示が重要になる |
| **操作** | `actions` の一覧と、それぞれが何をするか | **ディープリンク**（`intmap://widget/<action>?…`）。カード内で完結する操作は本体アプリを開く形になる |
| **プライバシー** | 出典・取得先・保存先は `js/legal-text.js` が正本 | **App Store のプライバシー表示は Extension のネットワーク利用も含む。** データの流れを変えたら法務文面も同じ変更で直す（`CONSTITUTION.md` §6） |
