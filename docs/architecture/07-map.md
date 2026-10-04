# IntMap — 現状仕様書 §7 地図・レイヤー・Globe・ウィジェットの構造

> **現状仕様書の §7。** 案内図は [`Architecture.md`](../../Architecture.md)（§ → ファイルの表）。**節番号は案内図と共有している**
> ——他の文書・コード・テストが書く「`Architecture.md` §7.x」は、このファイル（と案内図の表が同じ行に挙げる文書）の見出しを指す。
> 今どうなっているかだけを書く。変更履歴・ラウンド番号・PR 番号は書かない（`npm run check:docs` の `arch-rounds` がこのファイルも読む）。

## 7. 地図・レイヤー・Globe・ウィジェットの構造

**レイヤーの実装詳細は [`docs/MAP-LAYERS.md`](../MAP-LAYERS.md) が正本**——§7.1 気象・災害警報、
§7.6 ラベル、§7.7 レイヤー個別の注意、§7.8 地形と水、§7.9 物理シミュレーションの不変条件、
§7.10 気象モデル（ECMWF IFS）・風・レーダー、§7.14 波（海況）。**節番号は向こうでも同じ**なので、他の文書からの
`§7.x` 参照はそのまま通る。

ここに残すのは**契約**——「レイヤーを1本足すときに必ず読むもの」だけである。
**レイヤーを 1 本足す手順は「宣言を 1 本書く」**（下の §7.3）。

⚠ **火山は主題ごとの正本を別に持つ**——同梱カタログの構成（GVP 完新世の全件＋観測機関が現在レベルを公表している座）と GVP 番号による結合、USGS 自身の番号との突き合わせ、現在の警戒レベルの4段
（USGS／気象庁／週間報告／沈黙）、火山灰 SIGMET、公表されたハザード域だけを描く規則、SO₂、
周辺人口・空港・地震、**カードの分類語を9言語で言う規則と散文を訳さない理由**、
**カタログを問いに絞る4つの条件とマスタークロックに載せた噴火記録**は
[`docs/VOLCANO-INTELLIGENCE.md`](../VOLCANO-INTELLIGENCE.md) が正本。

⚠ **放射性物質の拡散も同じ形**——ツールとしての不変条件は §7.9（あちら）、**モジュールの分担と
`run()` の公開契約は §2.5**、**モデルの数の出所は [`docs/RADIATION-MODEL.md`](../RADIATION-MODEL.md)**。
### 7.2 レイヤー欄の分類・7.5 地図の初期化

**どちらも [`docs/MAP-LAYERS.md`](../MAP-LAYERS.md) へ移した**（節番号は同じ）。§7.2 は 18 の棚と
「新しいレイヤーはどの棚に入るか」、§7.5 は基図・投影・初期カメラの組み立て。レイヤーを1本足すときは
あちらを開くほうが早い——`§7.1`〜`§7.10` のうち **§7.3 と §7.4 以外はすべてあのファイル**にある。

### 7.3 レイヤーの宣言（`js/layers/<id>.js`）とレイヤー・データ契約 `window.IntMapLayers`

**レイヤーとは 1 つの宣言である。** 1 レイヤー＝1 ファイル `js/layers/<id>.js`（`export default { … }`）。
書けること・検査・導出の正本は `scripts/lib/layer-descriptor.mjs`、欄の一覧と各欄を読む者は
[`docs/MAP-LAYERS.md`](../MAP-LAYERS.md) §7.2。宣言は 3 つのことを 1 か所で述べる:

- **何であるか**——`kind`。`'display'` は**基本表示**の項目でレイヤーではない（数えず・`l=` で運ばず・Atlas の「全レイヤー」に入れない）。
  無ければレイヤー。読み手は `js/layer-manifest.js` の `isDisplay` / `dataLayers` / `displayItems` に訊く（MAP-LAYERS §7.2）
- **どこに立つか**——`id`・`shelf`・`order`（棚そのものの並びは `js/layers/_shelves.js`）
- **行の事実**——`key`・`label`・`rest`・`on`（既定で点くレイヤーは無い）・`share`・`html`・`names`（地図に名前を書く行）・`lazy`。レイヤー欄の一覧はここから**導出**され
  （索引を書くときに `deriveShelves`）、`js/layer-manifest.js` がそれを読み手に渡す（手で持つ一覧は無い）
- **他の登録簿の中の同じレイヤー**——`registry`（`IntMapLayers`）・`state`（共有リンクの状態）・`commands`（`IntMapOS`）・
  `atlas`（能力の項目）・`sources`（出典の行）・`time`（Chronos の契約）。それぞれの登録簿が別の綴りで持っていた
  同じレイヤーを、宣言が 1 つに結ぶ
- **実装のモジュール**——`pkg`（レイヤー・パッケージ `js/layer-pkg-<pkg>.js`）。`js/data-layers.js` はその行に分岐を持たず、
  1 本の経路で委ね、初めて切り替えたときにモジュールを取る（MAP-LAYERS §7.2「レイヤー・パッケージ」）

**レイヤーを 1 本足す:**

1. `js/layers/<id>.js` を書く（`id`・`shelf`・`order` と、上の欄のうちそのレイヤーに当てはまるもの）
2. 行を作るモジュールを書く（行のハンドラ・凡例・名前の組み立ては行の持ち主に残る）。`IntMapLayers` に
   登録したら、その id を宣言の `registry` に書く——描かれているものを Atlas が読めるかはこれで決まる。
   `js/data-layers.js` が行を作る棚なら、切替と不透明度は `js/data-layers.js` に分岐を足さず、レイヤー・パッケージ
   `js/layer-pkg-<pkg>.js` に書いて宣言の `pkg` で名指す（分岐の追加・行数の増加は `check:static` が拒む）
3. それだけ。`js/layer-manifest.js` の生成領域（宣言から導いた一覧と宣言の値の写し）は `npm run build` が書き直し（`node scripts/layer-descriptors.mjs --write`）、
   門（`tests/layer-descriptor-checks.test.mjs`）が、宣言の形・棚・位置の重なり・索引の鮮度・各欄の結び目を
   それを持つ登録簿と照らす。結び目の欄は主張で、照らせない主張（実行時に組み立てる登録）は書かない

⚠ `label` の無い行の**名前**は、今も行を作るモジュールの `L.arr(LA(…))` が持つ——翻訳の門はその呼び出しで
翻訳を見つけるので、名前をデータへ移すと門の母集合から外れる（MAP-LAYERS §7.2）。

**以下は、宣言の `registry` が指す実行時の契約** `window.IntMapLayers`:


- API ＝ `register` / `state` / **`sampleAt(lng,lat)`** / `featuresIn(bounds)` /
  **`featuresInSource(srcId, bounds)`** / **`loaderOf(id)`** / **`narrow(features, bounds)`** /
  **`declaration(id)`** / `legend` / `time` / `source`。
- ⚠⚠⚠ **登録は「読者に見せる文」と「その文を作った数量」の両方を渡す。** 数値の場から答える行は
  `sampleAt` ではなく **`measure(lng,lat)`** を実装し、`{value, unit}`（数量）または
  `{code, label}`（分類）を返す。`sampleAt()` はそこから表示用の文を作り、行に `number` / `unit` /
  `code` を添える。**単位を文字列へ畳んだ値は解析の入口を通れない**——`js/gis-datasets.js` の
  `asNumber` はセル全体が数でなければ数と認めないので、`「12.3°C」` は格子にならない。
  ⚠ **数量は上流が公表した単位で持つ。** 読者が選んだ表示単位（°F・km/h）で持つと、同じ風について
  同じ問いが違う答えを返す。変換は表示だけが行う。
  ⚠ **文しか作れない行は `measure` を持たない**（火災画素数・コロプレスの複数値）。どの行が数量を
  述べるかは登録が決めるのであって、一覧はどこにも無い。
- ⚠⚠ **`load()` を述べた行は、描かれていなくても読める。** `featuresIn` はレンダラが保持している
  ものを返すので、**一度も点けていない行は何も渡せなかった**——それが「画面に依存しない取得」に
  残っていた最後の依存だった。`load` は同梱文書を**描かずに**渡す扉で、`loaderOf` がそれを
  `js/gis-layers.js` に渡し、そこが**非同期の供給元**を組み立てる。
  ⚠ **範囲の判定は `narrow` 1 つ。** loader 経路が自前の判定を持つと、同じ依頼が「いま画面に出て
  いるかどうか」で違う行を返す。
  ⚠ **箱の中の地物を拾う判定は幾何の種類に依らない。** 以前は `geometry.type==='Point'` で絞って
  いたので、**線と面は必ず 0 件**だった。`featuresInSource` はレイヤー行を持たないレンダラの source
  にも同じ窓を開ける（`js/gis-layers.js` が地図のレイヤーをデータセットにするときに使う）。
- **新しいレイヤーを足したら、同じ変更の中でここへ登録し、その id を宣言の `registry` に書くこと**（これが Atlas から
  使えるかどうかを決める）。`declaration(id)` は宣言を返す——チェックボックスの id でも登録した id でも同じもの。
  `declarationOf(id)`（供給元が何を持つか）とは別の問い。
- 消費側は Atlas の `stateContext` に入る実データ行・`layerData` アクション・`analyze` の証拠集め。
- **凡例の名前は「表」で渡す。** `window._registerLayerOpacity(id, names, …)` の `names` は
  **言語ごとの配列**であって解決済み文字列ではない（文字列を渡すと `names[1]` が2文字目になる）。
  受け側でも文字列を正規化する。
- **凡例の積み直しは「頼む」もので、行うのは 1 フレームに 1 回。** `tileLegends()`（`window._tileLegends`）は
  積み直しを**頼むだけ**で、その場では何も測らず何も書かない——`js/runtime.js` の `frame`（鍵 `legends.layout`）に
  次のフレームの `placeLegends()` を 1 回だけ予約する。同じフレームの中の何十回の依頼も 1 回の配置になり、
  配置はそのフレームの描画の前に走るので、読者が見る積み上げはどれも依頼を反映している（隠れたタブでは
  フレームが来ないので、見えるようになったときに置く）。依頼の途中で出た依頼は次のフレームへ回る。
  ⚠ **同期で位置を要る呼び出し元は無い**（全呼び出し元と、凡例の箱を読む全 spec を確かめた）。凡例の
  **母集合**が要るなら `discoverLegends()` に訊く（`_minimizeOpenLegends()` がそうしている）——依頼は何も返さない。
  実測（全レイヤーを持つ共有リンク・1280×720・headless）: 配置は 20 秒に 910 回 → 73 回、配置の中の時間は
  2.95 秒 → 0.25 秒（CPU 2 倍減速で 6.3 秒 → 0.46 秒）。
- **凡例は容器の中にしか置かれない。** `placeLegends()` は開いている凡例を下から積み、**次の1枚が容器の
  上端に届くなら列を折り返す**（右へ、その列の**実測**幅の最大＋12px）。1枚で容器より高い凡例は
  `max-height`＋内部スクロールにして、題と閉じるボタンが必ず画面内に残るようにする。
  ⚠ 高さも幅も**位置を1つも書く前に全部読む**（1枚ごとに測る形へ戻さない——実測で、指の1回のパンで
  起きた `getBoundingClientRect` 5,852 回のうち 5,724 回がこの関数から出ていた）。
  ⚠ 読者が動かした凡例（`data-dragged`）は積み直しの対象にしない。
  ⚠ **容器の右端で止めた列の凡例は、右端（`right`）で留める。** 自分の幅から出した `left` で留めると、
  幅が `auto` の凡例（畳まれたカード）は `left` を 8px 左へ動かすたびに 8px 太り、大きさの監視が
  次の配置を頼み、フレームごとに地図の幅まで這っていく（実測でウェブカメラの凡例）。置く場所は同じで、
  幅が位置に依らなくなるだけ。1 枚が入りきらないほど太いときは従来どおり `left`＝起点。
- **凡例とは何かは `discoverLegends()` の 1 か所。** 名前で持つ凡例＋ページの**生きた集合**
  （`getElementsByClassName`）の `.data-legend` のうち id が `data-legend-ec-` で始まる ECMWF の箱＋
  `.data-legend.generic-legend`。生きた集合は文書自身が要素の出入りで更新するので、後から足された箱も
  拾い、変わっていない文書を配置のたびに歩き直さない（以前は毎回 `querySelectorAll` 2 回）。
- **凡例の大きさが変わったら積み直す——誰が変えたかを問わず、置き場も問わない。** 見つかった凡例は全部
  1 つの `ResizeObserver`（`watchLegendSize`）に登録され、大きさの変化は他と同じ `tileLegends()` の
  依頼＝**次のフレームに 1 回**の積み直しになる。–／▢ で開閉した・中身が遅れて
  届いた・選挙の年で行数が変わった、のどれでも同じ規則で直る。⚠ 積み直しを観測コールバックの中で
  しない（同じ深さの兄弟の大きさを変えると ResizeObserver のループ誤りになる）。⚠ 収束する——
  `placeLegends()` は値の変わらない書き込みをしないので、2 回目の配置は何も変えない。
  ⚠ **配置が読んだ大きさは変化ではない。** 配置は読んだ枠の大きさを `watchLegendSize` に渡し、監視の報告が
  それと半 px 以内で一致すれば何も頼まない（`observe()` のたびに来る最初の報告がこれ）。比べられない報告
  （測っていない凡例・`borderBoxSize` の無いエンジン）は変化として扱う。
  ⚠ **携帯でもデスクトップでも同じ。** デスクトップの凡例は下端基準で積まれるので、1 枚を開くと
  その上の凡例が**押し上げられる**（以前は開いたカードが上のカードに重なっていた）。積み方の算術
  （起点・間隔・折り返し・`data-grow-down` の記憶した top）は変わらない。
  ⚠ **読者が自分のボタンで開いた凡例は畳み返さない**（`legPinOpen`。畳まれた凡例を開き直したときと
  同じ印）。自分で閉じれば印は外れる。
- **携帯（≤768 px）の凡例の置き場は、地図の上に浮いている部品が残した場所である。** 起点（上端）と
  右端は `css/intmap.css` の `--m-legend-top` / `--m-legend-right` で、これは左の列（地名検索の丸と
  地図切替 `.bm-square`）の下端と右の丸ボタン列（`.m-fab-stack`）の幅から**導出**される（§9.2）。
  2つは `@property` で長さとして登録してあるので、`placeLegends()` は解決済みの px を1回のスタイル
  読み出しで得て、そこから積む（CSS の無い偽 DOM では旧来の 64 px）。凡例の `top`/`left` に
  `!important` を付けない——付けると積み上げが書いた位置が全部上書きされ、複数の凡例が同じ場所に
  重なる。⚠ ケッペンの凡例は携帯では**他と同じ置き場の一員**として積む。
- **「画面に出ている凡例」は `display` の綴りではなくページに訊く。** 判定は `legendShown()` の 1 か所で、
  `placeLegends()` と携帯で地図をタップしたときの `_minimizeOpenLegends()` の両方がそれを読む（配置 1 回につき 1 枚 1 回）。`placeLegends()` の母集合は、持ち主が
  隠しておらず（インラインが `none` でない・`hidden` でない）、計算済みの `display` が `none` でない凡例
  （偽 DOM ではインラインの宣言だけで答える）。`block` だけを数えていた頃は `flex` で出るケッペンの凡例が
  デスクトップで数えられず、当時の初めての読者の既定（ケッペン＋海底ケーブル）で 2 枚が重なっていた。
  「閉じた」（開閉の記憶 `legSeen`/`legPinOpen` を忘れる）は**持ち主が隠したとき**だけで、飛行中や経路パネルの
  あいだスタイルシートが全凡例を消しても忘れない。
- **自分の置き場を持つ凡例（`data-own-place`）は動かさず、ほかをその外に積む。** 携帯以外の置き場では、
  そう宣言した凡例（今はケッペン：上端基準・全高・縦のリサイズつまみ。つまみが下へ伸びるのは上端が
  固定されているから）は積み直しの対象にせず、その実測の箱を障害物として読む。積み上げの 1 枠が障害物に
  かかれば、その列はその高さで終わり、次の列は**障害物の右端の先**から始まる（折り返しと同じ実測の歩幅）。
  だから障害物の下に収まる凡例は同じ列に残り、読者がつまみで伸ばせば次のフレームの積み直しで押し出される。
  携帯のスタイルシートはこの凡例も他と同じく並べるので、携帯では宣言を読まない。
- **段彩の凡例は連続、分類の凡例は帯。** 世界銀行系の塗り分けはグラデーション帯で、停止は**値の位置**に
  置く（`interpolate` は値について線形）。タイルのサムネイルも同じランプを層から読む（`IntMapWB.rampOf`）。
- **1分類＝1色。** `js/layer-packs.js` の `paletteOf(n)` は手で選んだ30色を使い切ったあと
  **黄金角 137.508°** で色相を進め、明度・彩度を3通り循環させ、既出の色なら明度をずらして必ず一意にする。
  実測: 言語レイヤーは **360 言語（Glottocode）**を持ち、そのうち**どこかの国で最多話者である 69 言語**が
  凡例の行と色を持つ（＋「割合の公表なし」の1行。実測で重複0）。
  `IntMapCulture.palette(n)` / `.colourOf(k,cat)` が公開する。
  ⚠ **同じ語族は同じ色相**（`js/layer-packs.js` の `FAM_COL`）。セルビア・クロアチア・ボスニア語などの
  5標準は同一色相の明度差で並び、その色は生成パレットから**予約**して他言語に渡らないようにする
  ——一意なだけでは足りない。**無関係な色は「無関係だ」と主張してしまう。**
  ⚠ **見本が区別できない鍵は鍵ではない**（同じ見本が3行に付くと、その色に付く名前は最初の行のものになる）。
- **言語レイヤーの分類は Glottocode であって ISO 639-1 タグではない。**
  `data/language.json` が国ごとの記録（`top`／`pct`／`shareType`／`mix`／`listed`／`roles`／`unnamed`／`y`／`src`）と
  使っている言語の名前を持ち、`data/language-tree.json` が Glottolog の分類全体（族・言語・国が指す標準、
  親・ISO 639-3・カテゴリ・存続状態つき）を持つ。**地図と系統樹は 1 つのモデルの 2 つの表示**であり、
  モデル自身への問い合わせは `IntMapCulture.langName / isoOf / tree / lineage / noShare`。
  ⚠ **`top` は「最大の実測シェア」であって「最初に列挙された言語」ではない。** 出典が割合を公表していない
  国（実測 204 か国中 107 か国）は `top:null` で、地図では専用の色（`NO_SHARE`）に塗り、凡例と
  ポップアップがそう言う。⚠ **系統樹は 726 kB あるので、レイヤーを入れたときにだけ取りに行く。**
  ⚠ 名前の解決は `scripts/lib/glottolog.mjs` の**明示された規則**（主名・別名・国・最小共通祖先・
  ISO 639-3 マクロ言語・語順・バントゥ語類接頭辞・綴りの類似）か、`data/language-aliases.json` に
  **理由を書いた判断**のどちらかでしか行わない。どちらでもない名前は**ビルドを落とす**
  （ゲート＝`npm run check:languages`）。
- ⚠⚠ **全面を覆うデータ画像は「ラベルの直下」に載せ、その位置を訊く先は 1 つ——
  `window.IntMapBelowLabels()`（`js/data-layers.js`）。** 気象のアンカー `E.before()` は
  **データ帯の底**（基図の参照レイヤーの下に敷く陰影のための位置）なので、そこに置いた全面画像は
  あとから点いた別の全面ラスタに上から塗り潰される——`js/label-occlusion.js` がラスタを
  ラベル直下まで沈めるからで、レイヤー 1 本に固有の話ではない。
  ⚠ **置いて終わりではない**——`styledata` で**スタイル自身のレイヤー順の署名が変わったときだけ**
  位置を取り直す（custom layer は `getStyle()` に載らないので自分の移動は署名を動かさず、
  帰還ループにならない）。実測と、波（海況）がこれで画面から消えていた経緯は
  [`docs/MAP-LAYERS.md`](../MAP-LAYERS.md) §7.14。
- **長い凡例は `.im-more`（`<details>`）で畳む**（`css/intmap.css`）。
- **レイヤーを切り替えてもカメラは動かない。例外は `js/layer-home.js` の表だけ**。
  `window.IntMapLayerHome.arrive(<checkbox id>)` が、**データが1つの地域にしか存在しないレイヤー**
  （EU members / NATO members / U.S. presidential elections / National elections / Ukraine frontline）を
  **セッション中1回だけ**果に収める。
  ☠ **扉は2つある。** `arrive()` は「レイヤーが ON になった」で、セッション1回。`goTo()` は
  **「読者がレイヤーの中で場所そのものを選んだ」**——国政選挙レイヤーの国セレクタだけが使う入口で、
  毎回動く（選択を変えたのに地図が前の国のままでは、セレクタが嘘になる）。**どちらも同じ表の
  チェックボックスにしか効かず、表に無いレイヤーからは到達できない。**
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

### 7.3a 世界遺産 (World Heritage) — `js/beta-overlays.js`

- 同梱 `data/whc-sites.json`（`scripts/build-whs.mjs` がユネスコ世界遺産センターの XML から生成）。
  上流は Cloudflare のボット検査の内側にあり CORS ヘッダも無いので、**ブラウザからは読めない**
  ——だから同梱で、生成器は `curl` を呼ぶ（Node の `fetch` は TLS の指紋で 403 になる）。
- **ファイルは「物件」と「点」を分けて持つ。** `sites` が 1 物件 1 行（全言語の名称・区分・登録年・
  登録基準・国・危機遺産の年）、`points` が `[物件index, lng, lat, 国index]` の平坦配列。
  地図に渡す FeatureCollection は**読者の言語で実行時に組む**ので、言語を変えても再取得は無い。
- 解説文は `data/whc-detail.<locale>.json.gz` に言語ごとに分かれ、**最初にカードを開いたときだけ**
  1 本取得する（`DecompressionStream('gzip')`）。訳の無い物件にはその言語のファイルにも英文が入って
  いるので、フォールバックのための 2 本目は要らない。
- ⚠ **`whs-src` へ書くのは 1 か所だけ**（`whsPush()`）。取得直後・基図切替の自己修復・言語変更の
  3 つはどれも「source を更新したい」と言う資格があるが、**同じ tick に別の誰かが言うかどうかは
  どれも知らない**。全員が `whsPush()` に頼み、そこが 1 tick 分を 1 回にまとめ、直前に書いたのと
  同じ collection なら書かない（`whsBuild()` は毎回新しい object を作るので、本物の作り直しは
  取り違えられない）。⚠ `addSource` は書いた記憶を捨てる——新しい source は何も持っていない。
- レイヤーが公表している面は `window.__imWhsLayer`（`IntMap*` にしない理由は §同項の火山と同じ）。
  カーネルコマンドは `heritage.open` / `heritage.filter` で、凡例のボタンと Atlas が**同じものを押す**。
- 出典は 2 つ——一覧そのものはユネスコ、**いま危機遺産かどうかは Wikidata**（ユネスコ側の該当列が
  2014 年以降更新されていない実測は `docs/MAP-LAYERS.md` §7.7）。

### 7.3b 予報モデル（複数）

- **どのモデルが存在するかの正本は [`js/wx-models.js`](../../js/wx-models.js)（`window.IntMapWxModels`）1本。**
  ここが宣言するのは**提供の可否・表示名・公称解像度・出典機関・ライセンス・役割**だけである。
  ☠ **格子・カバー範囲・変数・気圧面・予報期間・有効時刻を書き写さない**——SDK の domain 表と各モデル
  自身の `latest.json` から**導出する**。手書きの変数表は上流が1つ足した日から間違いになり、しかも
  **黙って**間違う（レイヤーは何も描かず、凡例は変数名を表示し続ける）。
- **`.om` のパス規則はモデル非依存**（`<host>/<id>/<ref>/<valid>.om`）。ホストの綴りは
  `js/wx-models.js` にしかない。**ホストは Open-Meteo が AWS Open Data で公開している S3 バケット**
  （`openmeteo.s3.amazonaws.com/data_spatial`——公開・CORS `*`・Range 可・CC-BY-4.0・保持 7 日）で、
  ブラウザが直接 Range 読みする。☠ **Open-Meteo 自身の CDN（`data-spatial.open-meteo.com`）は
  Referer が `*.open-meteo.com` か localhost のときしか答えない**（第三者サイトからは 403）。
  以前の Bunny CDN ホストは上流が廃止し、DNS 名そのものが無い。上流のホストが消えると、こちらの計器は
  「no metadata」「field did not load」としか言えないので、`tests/prod-smoke.spec.js` は 5 本の
  気象試験の前に**配信元の名前解決・CORS・Range 応答を単独で**訊く。
- **「このモデルでこれを見せてよいか」は共通部分であって宣言ではない**——`availability()` が
  「提供の可否 × ライブ metadata × カバー範囲 × 変数 × 時刻」を突き合わせ、**理由コードを返す**。
  ☠ 実測: ECMWF IFS HRES に気圧面は**0面**、GFS 0.13° に `pressure_msl` / `cape` / `dew_point_2m` は
  **無い**。無条件の差し替えは 9 レイヤーのうち 4 つを黙って空にする。
- **エンジンはモデルごとのインスタンス**（`js/wx-ecmwf.js` の `createModel(cfg)`・
  `window.IntMapWxEngine.model(id)`）。`window.IntMapECMWF` は**既定モデルのインスタンスそのもの**で
  あって写しではない。⚠ **ページに 1 つしか無いもの**は factory の外にある——SDK・`om://` の登録・
  開いたファイルのプール（`READER_MAX` はページ全体の予算）・32 MB のブロックキャッシュ・
  色の ramp・スタイルレイヤーの索引。
- **モデルの選択はレイヤーごと**（`js/weather.js` の `state[id].model`）。
- **同じ読みへの 2 回目の要求は、その読みに合流するのであって打ち切らない。** `load()` の整理券は
  **呼び出しではなく read** に付いていて（合流する側は自分の券を取らず、合流先の券を更新する）、
  打ち切るのは**別のファイル・時刻・帯への読み**だけである。経緯と実測は
  [`docs/MAP-LAYERS.md`](../MAP-LAYERS.md) §7.14。
- ☠ **利用者に見せる文言は `displayed` からしか作らない。** 各気象レイヤーは
  `requested / loading / displayed` の3状態を持ち、**`displayed` への代入は `commit()` の1か所だけ**、
  呼ばれるのは**新スロットを現し旧スロットを落とすのと同じターン**である。要求から作った凡例は、
  読み込みの数秒間ずっと「画面に無いもの」を説明する。
- **モデルを変えても瞬間を保つ**（index ではなく最も近い有効時刻へ）。軸の長さも刻みもモデルごとに
  違うので、同じ index は同じ時刻ではない。
- ⚠ **レンダラ SDK の `getColorScale()` は知らない変数に<b>気温のスケールを返す</b>**（`?? temperature`）。
  実測: live 変数 857 のうち 212 がその分岐に落ち、うち **52 は気温ではない**（大気質全種・海流・
  海面高度・降雪・天気コード）。**出荷するレイヤーは `kind:'temp'` のときだけこの分岐に落ちてよい**
  ——`tests/weather-models-checks.test.mjs ⑧` がバージョン固定の実測 fixture と突き合わせている。
- ⚠⚠⚠ **`.om` が入れている単位と、その変数の配色表の単位は、同じとは限らない。**
  `pressure_msl` は **Pa** で届き、SDK の `pressure` 配色表は **hPa** で書かれている（出荷 8 変数で
  食い違うのはこれ 1 つ。気温 °C・露点 °C・風 m/s・雲量 %・降水 mm・CAPE J/kg は一致する）。
  食い違いは `js/wx-ecmwf.js` の **`FIELD_UNITS` ただ 1 か所**で宣言し、他はすべてそこから導く。

  | 何を | どの単位で | どこから |
  |---|---|---|
  | レンダラへ渡す配色表（`omSettings().colorScales`） | **場の単位** | 読み手の表を `inFieldUnits` で `× per` |
  | `scale()` / `legend()`（凡例の帯・目盛・単位） | **読み手の単位** | `displayScales`（SDK の表そのまま） |
  | `sampler()` ＝ `valueNow` / `valueAt`（地点値） | **読み手の単位** | 場の値を `÷ per` |
  | 等圧線のラベル（`text-field`） | **読み手の単位** | SDK が書いた等値線の値を `÷ per` |

  **配色表を場の単位で渡すことが、色ラスタと等値線の高度の両方を同時に正す**——SDK は画素の値を
  この表に直接引き当て、等値線の高度にもこの表の breakpoints を使うから。
  ⚠ **エントリを増やすのは、その変数のファイルと配色表が実際に食い違うときだけ。**
  空でないエントリは、既に正しい場を黙って 100 倍することを意味する。
- ⚠⚠ **ベクタのタイルは「何を描くか」を URL で言う。** `arrows=true` なら風の矢羽根、
  `contours=true` なら等値線で、**どちらも書かない URL の MVT には `contours` レイヤーが存在しない**
  （実測・同一ファイル同一視野: 素の URL **0 地物** / `&contours=true` **900 地物**）。
  ⚠ **等値線のラベルは `symbol-placement:'point'`。** `'line'` / `'line-center'` はこの等値線の
  形状に**1 枚も配置できない**（実測: line 0・line-center 0・`text-allow-overlap` を足しても 0・
  point 25。`tile_size` 512 / 1024 / 2048 のいずれでも同じなので MVT の extent の問題ではない）。
  SDK は 1 本の等値線を短い区間の集まりとして出すので（z3.4 で画面上の中央値 16 px）、
  文字を沿わせられる長さが無い。**フォントも明示する**（`Noto Sans Regular`——このスタイルの
  glyph 配信元が持つ書体で、他のシンボルレイヤーは全部これを名指している）。

### 7.3c 世界の鉄道 (World railways) — `js/railways.js`

レイヤー行 `beta-dl-rail`、レイヤー id `rail-ln` / `rail-det-ln` / `rail-cons-ln` / `rail-st` / `rail-st-lbl`、
不透明度キー `rail2`。**モジュールは遅延**（`IntMapLazy.need('railways')`）で、行・Compare・
`styledata` 自己修復・メモリ圧のすべてがこの1つの口を通る。

**値はすべて、その線路そのものに付いた OpenStreetMap のタグである。**
国から推定する項目は1つも無い。持っている項目は
軌間 / 電化方式・電圧・周波数 / 最高速度 / 線路数 / 旅客・貨物 / 幹線・支線・専用線・観光 /
高速鉄道 / 運行状態（運行中・建設中）/ 路線名・路線番号 / 運行会社 / 開業年 / OSM way id。

| 配信物 | 中身 | いつ |
|---|---|---|
| `data/railways/world.json.gz` | 幹線・支線を一般化した全世界。文字列は持たない（**111,660本・0.89 MB gz**） | z < 6.5 |
| `data/railways/c/<lat>_<lon>.json.gz` | 5°セル。全属性・路線名・事業者・OSM way id（**579本・計 10.5 MB gz**・最大 586 kB・中央値 4 kB） | z ≥ 6.5・表示範囲ぶんだけ |
| `data/railways/st/<lat>_<lon>.json.gz` | 駅・停留所（`railway=station`/`halt`）。事業者・網・UIC・発着種別（**135,238件・541セル・計 4.0 MB gz**・最大 174 kB） | z ≥ 8・表示範囲ぶんだけ |
| `data/railways/index.json` ／ `st-index.json` | 存在するセルの一覧と gz バイト数（線／駅） | 常時（404 を撃たないため） |

- **塗り分けの軸は6つ＋線種**（軌間／電化方式／最高速度／複線・単線／旅客・貨物／運行状態／線種）。
  バケットと色、そして配信の符号器は **`js/rail-schema.js` 1本**にあり、**ビルド
  (`scripts/rail/build.mjs`) とブラウザの両方が同じファイルを import する**——凡例と地図で色が
  食い違う余地を作らない。⚠ **export は名前空間 1 本**（`RailSchema`）。`tests/layer-boot-graph-checks.test.mjs ③` は js/ の
  export が js/ から名前で import されることを要求するので、個別 export はブラウザが使わないぶんが
  「死んだコード」になる（`js/war-geom.js` と同じ形）。
- ⚠ **どの軸にも「OSM に記載なし」のバケットがあり、その灰色はどの回答の色とも一致しない。**
  タグの付与率は地域差が大きい（実測: `maxspeed` はイベリア 60% / インド 6%、`tracks` は 51% / 0%）。
  **灰色は「記載がない」以外の意味を持たない**——既定値でも、その国の主流値でもない。
- **軸の切り替えは `setPaintProperty` だけ**で済む。バケットは読み込み時に全軸ぶん feature に
  刻んであるので、軸を変えてもソースを作り直さない。
- **世界図を消すのは詳細セルが描ける状態になってから**。ズーム閾値だけで消すと、取得中は地図が空になる。
  ⚠ 「届いた」（`setSourceData` を呼んだ）でもまだ早い——GeoJSON はワーカーで解析されてから
  タイルに切られるので、その間は線が1本も無い。詳細の線を先に出し、世界図は
  **`rail-det-src` の `sourcedata` が「読み込み済み」をタイル着地（`e.tile`）とともに述べたとき、
  またはタイルを持たないエンジンが読み込み済みを述べたとき、または地図が `idle` になったとき**の
  最初の1つで下ろす（`revealDetail`）。`sourceDataType` 付きの告知（metadata / content / idle）は
  描画の証拠にしない——まだタイルを1枚も頼まれていないソースは即座に「読み込み済み」と言う。
  時限は置かない（待つ間は同じ線路が2本重なるだけで、空白は生じない）。より新しい表示・閾値未満への
  縮小・レイヤーの OFF・`drop()` は待っている引き渡しを取り消す。
- ⚠ **`toggle(true)` は冪等である**——既にオンのレイヤーに同じ呼び出しが来ても、何も送り直さない。
  モジュールは**ソースがいま持っているもの**を覚える（`rail-src` に渡した世界図の FeatureCollection と、
  `rail-det-src` に渡して表示中または引き渡し中のセルの組）。同じ世界図は再送せず、同じセルの組は
  再送しないので**待っている引き渡しを取り消さない**。記録を消すのは「詳細が地図から下りた」とき
  （閾値未満・セル過多・OFF・`drop()`）と、`ensure()` がソースを新しく作ったとき（基図の差し替えで
  スタイルごと消えた）だけで、後者は `detailCovers` も戻す——新しい空の詳細ソースの上で世界図を
  下ろしたままにしない。
- ⚠ **基図差し替えの自己修復は、この行のレイヤー（`ROW_LAYERS.rail`）がスタイルから消えたときだけ
  `toggle(true)` を呼ぶ**（規則は §12「`styledata` の自己ループ」）。不透明度の登録も同じ一覧を読む。
- 出典は **OpenStreetMap contributors (ODbL 1.0)**。⚠ 置き換え前は Natural Earth（パブリック
  ドメイン・帰属不要）だったので、**帰属の義務がこの層で新しく発生している**（`js/reference-data.js`）。

規模: OSM の `railway=rail` は世界で **2,816,264 way**。側線・入換線を除いて掃引した実測は
**1,645,547 way**、連結・間引きののち **総路線長 1,608,045 km**。

**データの作り方**（`npm run build:rail`・オフライン。実行時はネットワークに触らない）:
`scripts/rail/fetch.mjs`（Overpass を10°セルで掃引・大きすぎるセルは4分割・セル単位でキャッシュ＝再開可）
→ `scripts/rail/build.mjs`（OSM way id で重複排除 → 属性が同一で端点が繋がる way を1本に連結 →
段ごとに間引き → 5°セルへ切り出し）→ `scripts/rail/stations.mjs`。

- ⚠ **掃引の前に「被覆の関門」が走る**。既知の答えがある箱（ルール地方・`railway=rail` が 5,650本）を
  各インスタンスに訊き、**空を返したインスタンスは planet インスタンスではないので落とす**。
  地域限定インスタンスは 200 と `{"elements":[]}` を返すので、エラーとしては一生検出できない。
- ⚠ **拒否されたセルはキューに戻す**（冷却＋再選出、**試行回数**で数える）。捨てると、
  どのエラーも報告しないまま惑星に穴が空く。
- ⚠ **構文エラーは `bad-query` として即座に投げる**。「一時的」を既定にした分類器は、
  プログラミングの誤りを無限リトライに変える。

### 7.3d 利用者が持ち込むファイル (User data import) — `js/geo-import.js`

地図にファイルを落とすか、レイヤー ▾ の「地図データを読み込む」（`#btn-upload-geojson`）を押すと、
`js/map-ui.js` の `geojsonUpload` が `js/geo-import.js` を**その場で `import()` し**（起動時のバンドルには
入らない）、返ってきた FeatureCollection を `ugj-<n>` という source と `-fill` / `-line` / `-pt` の 3 レイヤー
にする。取り込んだレイヤーは**セッション限り**で、永続化しない。

**読める形式** — GeoJSON（FeatureCollection / Feature / 裸の geometry / `features` だけを持つ物）、
KML、KMZ、GPX、CSV・TSV その他の区切り文字つきテキスト、セルに入った WKT と GeoJSON geometry、
**Shapefile**（zip の中の `.shp`＋`.dbf`＋`.prj`＋`.cpg` を組で。`js/gis-shapefile.js`）、
**GeoPackage**（`js/gis-geopackage.js`）。zip と gzip は開いて中身を見る。
⚠ **GeoPackage は拡張子ではなく先頭 16 バイトで見分ける**——容器でも文字でもないので、
容器の判定の後・文法の decoder より前に訊く。

⚠ **形式は 2 つの別々の問いで、別々のものに訊く。**

| 問い | 訊く相手 | 答え |
|---|---|---|
| これは何の**容器**か | **バイト列** — `js/atlas-attach.js` の `ATL_FILE`（§2.2b） | zip / gzip / pdf / ole と、どの文字コードとして復号できるか |
| これは何の**文法**か | **中身** — `js/geo-import.js` の decoder レジストリ | JSON として解けるか・XML の根要素は `kml` か `gpx` か・表として読めるか |

⚠ **拡張子の一覧は存在しない。** ファイル名が使われるのは**レイヤーのラベル**だけで、判定には
一切使わない（`<input type="file">` に `accept` も付いていない）。
⚠ **`ATL_FILE` は写しではなく共有である。** `sniff` / `decodeText` / `zipOpen` / `gunzip` を import して
いるので、レガシー文字コードの判定が直れば添付と取り込みの両方が同時に直る。読み込み量の天井
（`readBytes`）も `ATL_FILE.LIMITS` を**そのまま**使う——同じ数の 2 つ目の写しを作らない。

**CSV の緯度経度列の決め方。** 拒否と選択は別の機構である。

- **拒否（veto）は値の性質**——ほぼ全行が座標として読めること、緯度なら `[-90,90]`・経度なら
  `[-180,180]` に収まること、定数列でないこと、半球記号が別の軸を名乗っていないこと。
  **列名は veto を解除できない**ので、見出しが逆さまに付いた表でも正しい場所に落ちる。
- **選択（score）は根拠の重み**——9 言語の列名（`latitude` / `緯度` / `Breite` / `широта` …）、値の中の
  半球記号、「緯度になり得ない値」。隣接は同点のときだけ効く。
- ⚠ **veto を通っただけでは根拠ではない。** 数量と価格の列はどちらも ±90 に収まるので、
  「何も否定しなかった」で採用すると売上表が Guinea 湾に並ぶ。**列名・半球記号・±90 を超える値の
  いずれか 1 つ**が積極的に「座標である」と言わない限り、`coordinates-not-identifiable` で断る。
- 区切り文字は `,` タブ `;` `|` のうち**最も表らしく割れるもの**を選ぶ。`;` を選んだときだけ `,` は
  小数点として読む（ヨーロッパ式）。見出し行の有無も、1 行目と本文の数値の出方を比べて決める。

**拒否は文でなくコードで返る。** `js/geo-import.js` は `{ok:false, why:'shapefile'}` のように答え、
9 言語の文面は `js/map-ui.js` の `reasonText()` が持つ。⚠ `tests/file-import-checks.test.mjs` ⑩ が両方を
**構文解析して**「返しうるコード」と「文を持つコード」の集合が一致することを測るので、コードだけ
足して文を書き忘れると赤くなる。⚠ **PMTiles はまだ読めない**——「有効な GeoJSON ではありません」
とは言わず、何のファイルであるかを**名指して**断る。

⚠ **座標が見つからないことは「読めない」ではない。** 見出しを持つ区切りテキストで座標列を
特定できなかったものは、拒否ではなく `format:'table'`——**`geometry:null` の行**として返り、
考慮した列と断った理由は `stats` に載る。**地域コードで境界に `join` する右側の表**がこれである。
見出しの無いファイルにこの道は無い（列に名前が無ければ `join` も `compute` も書けないし、
それが表である証拠も残らない）。

**取り込んだ結果は必ず `window.IntMapGeodesy.sanitizeFeatures` を通る**（`js/geodesy.js`）。そこが
`MultiPoint` と `GeometryCollection` を落とすので、decoder 側で**単一 geometry に展開してから**渡す。

### 7.3e データセットと処理の基盤 (The GIS core) — `js/gis-*.js`

**取り込んだデータ・内蔵データ・分析結果を、同じ 1 つの形で持ち、処理の出力が次の処理の入力になる層。**
正本は [`docs/GIS-CORE.md`](../GIS-CORE.md)——ここには**構造の骨格だけ**を書く。

| ファイル | 公開名 | 何の正本か |
|---|---|---|
| `js/gis-datasets.js` | `window.IntMapData` | データセットの形（`id`・`kind`・`geometryType`・`crs`／`sourceCrs`・`fields[]`・`count`・`time`・`features()`／`read()`・`provenance`・`stale`）と**列の型づけ**・**時刻の宣言の検証**・**その列が何の量かの宣言**（`declareField(id,name,{quantity})`。列に `quantity` と著者 `quantityStated` が載り、単位カーネルが読めない宣言は入口で拒まず `quantityRefused` として列に付く。⚠ **格子の列はそのバンド**なので、バンドの宣言は `fields[]` にも同じ値・同じ著者で載る）。⚠ **「この文字列は数か」は 1 つの factory**（`numberRuleFactory()`）で、別スレッドへは**組み上がった object ではなく factory を**渡す（自由名を呼び出しフレームに残さないため）。⚠ **正規化は冪等**——自分が作ったミリ秒の時点を年として読み直そうとして拒む形は、時点を述べた格子を処理するたびに時点を消していた |
| `js/gis-geometry.js` | `window.IntMapGisGeometry` | **幾何カーネル**——boolean 演算（`union` / `intersection` / `difference` / `dissolve`）・任意形状の `bufferKm`・述語（`intersects` / `contains` / `within` / `disjoint`）・**形そのものからの最短測地距離** `distanceKm`・`pointInGeometry`・`validate` / `repair`・**データセット全体の位相** `coverage`。⚠ **算術は 1 つの自己完結した factory**（`geomKernel(deps, call)`）で、借りているもの（sweep line・測地）は外に残して引数で入る——**同じバイトが別スレッドでも答える**。⚠ **運べない演算はそう答える**（`polygon-clipping` と `js/geodesy.js` が自由名を閉じ込めているので、向こうでは `clipper-unavailable` / `geodesy-unavailable`）。運べる一覧は**deps 無しで建てたカーネル自身**に訊く（手で並べない）。⚠ **`coverage` は条件を呼び出し元が述べる**（`forbid` / `report` / `allow`）——重なりは自動的に誤りではない（係争・重複・継ぎ目を機械は分けられない）。⚠ **修復は提供しない**（どの直し方もデータについての主張で、`repair` は頂点を動かさないことだけを許されている） |
| `js/gis-crs.js` | `window.IntMapGisCrs` | **座標変換と解析用の平面**——`define` / `known` / `resolve` / `transformGeometry` / `transformFeatures` / `why` / `looksProjected`、および `projections` / `projection` / `distortionAt` / `assess` / `suggest` / `areaOn` / `lengthOn` / `planeSpellings`。⚠ **面の名指し方は `PLANES` から導出する**——コードを持たない面（正距方位は中心が引数）のために `kind:v1,v2` の一般文法があり、別名表は無い。⚠ **面は呼び出し元が選ぶ**（`suggest()` は並べるだけで選ばない）。測った値は必ず**単位と歪み**を伴う |
| `js/gis-raster.js` | `window.IntMapGisRaster` | **数値ラスターのカーネル**——`sample`（**6 方式**。点を訊く nearest / bilinear / cubic と、覆う範囲を集約する average / sum / mode を `kind` で宣言し分ける）・`zonal`（面積重み付き・値ごとの面積）・`mask`・`diff`・`combine`・`merge`・`polygonize`・`build`・`pixelAreaKm2`・`describeBands`・`fromSampler`。⚠ **footprint には 2 つの形がある**（`sampleCellForms()`。`box` は矩形で、その上の変換がアフィンのときだけ厳密。`ring` は footprint そのもので、入力画素 1 枚ずつに切る）——集約・void の規則・地面の重み・`sum` の按分は**どちらも同じ 1 本** |
| `js/gis-geotiff.js` | `window.IntMapGisGeotiff` | **GeoTIFF / COG の読み手**——依存を足さずに TIFF 6.0 を読む。`sniff` / `read` / `readUrl` / `refusals`。⚠ **バイトの供給元は `{size, read(offset,length)}` の 1 契約**で、全バイトでも HTTP Range でも同じ画素を返す。窓を覆う tile／strip だけを読み、`levels` / `levelAt` / `levelFor` が overviews から**要求を満たす最も粗い段**を選ぶ（選んだ段を黙って「フル解像度」と述べない）。**BigTIFF**（magic 43。offset 幅・IFD の項目数・項目長を読み取り器の引数にしてあり、classic と同じ 1 本の walk が両方を読む）・**PlanarConfiguration 2**（バンド別格納。1 バンドを読むのに全平面を読まない）・**predictor 3**（浮動小数点の水平差分。バイト平面を分けてから差分を取る、整数の predictor 2 とは別の算法）も読む。扱えないものは**名前を付けて断る**（JPEG-in-TIFF・8 バイト以外の offset 幅を述べる BigTIFF・登録名つきの圧縮・地理参照の無い TIFF・Range 非対応のサーバ）。欠損は **NaN** |
| `js/gis-warp.js` | `window.IntMapGisWarp` | **格子の再投影と再標本化**——`to4326` / `resample` / `align` / `methods` / `affineOf` / `footprintModes`。⚠ **`method` に既定は無い**。欠損の規則は `IntMapGisRaster.sample` に訊き、写しを持たない。⚠ **出力を丸ごと抱えない道が在る**——`opts.sink`（`begin` / `write` / `end`）へ**窓ごとに**書き出し、窓と幾何ブロックは同じ行数で予算を分け合う。予算の数はここに書かず `opts.budgetBytes` か渡された扉の `budgetBytes()` に訊き、どちらも無ければ**予算は無い**（受け皿を渡したときだけ `warp-budget-not-stated` で断る）。⚠ **予算は作業の上限ではない**——収まらない出力は拒まず、`report.memory.overBudget` として**述べる**。⚠ **外へ誤る箱はふるいであって面積ではない**ので `box` の超過を測って報告し（`report.footprint.boxExcess`）、`footprint:'exact'` は**述べられた許容幅**つきの決定として輪郭を環で組む（辺は両隣で共有＝footprint が敷き詰まる）。行の緯度も近似なので重みの相対誤差の上界を報告し、`areaTolerance` を述べればそれが約束になる |
| `js/gis-sources.js` | `window.IntMapGisSources` | **供給元**——`list` / `features` / `region` / `acquire` / `declare` / `supply` / `supplierOf` / **`plan` / `acquirePlanned`** / **`capabilitiesOf` / `measureCapabilities` / `auditCapabilities`**。取得はすべて `coverage`（`all` / `partial` / `sample` と理由・求めた範囲・答えた範囲・時点・解像度）を伴い、**`all` は供給元の宣言からしか届かない**。⚠ **供給元は自分で答えられる**（`supply(id,{fetch,region,…})` が範囲・時刻・属性条件・列・ページ送りを直接受ける）。実装が無ければ従来どおりレンダラへ委譲。⚠ **申告は無検証で信じない**——述べた件数・範囲を実際に返したものと突き合わせる。⚠ **「引数が在る」と「その条件で取れる」は別の主張**なので、`plan()` が**どの条件が上流で効き、どれが後段に回るか**を何も取らずに述べ、`acquirePlanned()` がそれを実行する——後段が在るなら前段は**窓を取り切る**（供給元の cursor で送り、上限に cursor が無ければ窓を四分木で割り、端に届かなければ `plan-unsatisfiable` で断る。**上限で切れた頁を濾したものは答えではない**）。後段のフィルタは**走らせない**（比較の正本は `js/gis-ops.js`）ので `kind:'staged'` で返る。⚠ **どちらの道が答えたかを必ず述べる**（`coverage.answeredBy`）。⚠ `analysis:true` は「この取得は測定である」という呼び手の陳述で、母集団がカメラで決まる答えを `renderer-view-dependent` で断る（委譲の道そのものは消していない）。⚠ **能力は申告と実測の両方**——申告は登録と宣言から**導き**（一覧を持たない）、実測は**呼び手と同じ扉**を通し、食い違いを名指す。3 値のままで `null` を `false` に畳まない |
| `js/gis-index.js` | `window.IntMapGisIndex` | **空間索引**——`build` / `query` / `queryEach` / `stats` / `resetMetrics`。セルの大きさをデータから導き、**偽陰性を出さない**（種別ごとに、索引を外した同じ走査に対して）。⚠ **種別は 2 つ**（`grid` ＝一様格子・`tiered` ＝セルを倍々にした階層）で、**既定は今も `grid`**——候補の集合も順序も動いていない。`kind:'auto'` は建てる前に「一様格子なら `always` に入る割合」を数えて選ぶ（手で「大きい図形が多い」と書かない）。⚠ **「索引が在る」は「どの計算を省けたか」ではない**ので `stats()` が仕事そのものを述べる（`buildMs` / `queries` / `queryMs` / `candidates` / `delivered` / `scanned` / `candidateRatio` / `scans` / `stopped` / `oversizeRatio` / `retained`）。⚠ **数える場所は 1 つ**——呼び出し元の厳密な判定は `queryEach(…,{test})` として**渡され**、索引の中に写されない |
| `js/gis-expr.js` | `window.IntMapGisExpr` | **式の解釈器**（計算列の言語）——`parse` / `evaluate` / `compile` / `functions` / `refusals` / `portable` / `nodeKinds`。⚠ **評価器は自己完結した factory**（`exprKernel()`）で、`window` も module scope も掴まない——**同じバイトが別スレッドでも答える**。⚠ **数値規則は写さずに渡す**（`js/gis-datasets.js` の `numberRuleFactory()`。規則の無い扉はジョブが作られる前に `expr-no-number-rule`）。⚠ **運べるかは木を queue する前に訊く**（`portable(ast)`。未知の関数・引数の数・余分な欄は、40,000 行目ではなくここで断る） |
| `js/gis-units.js` | `window.IntMapGisUnits` | **量の単位**——`parse` / `compare` / `convert` / `unitOfExpr`。「この 2 つは足し引きできるか・換算は何か」1 問だけに答え、`rasterDiff` / `mosaic` / `compute` / `rasterCalc` が**同じ 1 か所**に訊く。表は **SI の定義値の原子**だけで合成単位は解析する（`mm/h`・`kg/m^2`・`m2`＝`m²`）。⚠ **沈黙は不一致ではない**（単位を述べていない格子は今までどおり通る）が、**読めない綴りどうしは「同じ」ではない**ので拒む（`unit-mismatch`）。°C・°F はオフセットを持つので**読みの換算と差の換算が別** |
| `js/data-governance.js` | `window.IntMapDataGovernance` | **出自・権利・鮮度・測定の語彙**——`SPELLINGS`（`licence` と `license` が 1 つの事実であると述べる、リポジトリで唯一の場所。`js/gis-export.js` の私有表がここへ昇った） / `FACETS`・`SUBJECTS` / `REASONS` / `FRESHNESS` / `read` / `freshness` / `attribution` / `account` / `measureQuality`。⚠ **値を 1 つも持たない**——出典の表もライセンスの一覧もここには無く、述べるのは述べる者（束自身のバイト・builder の `GOVERNANCE`・レイヤー登録の `rights`）。⚠ **表示文は値から導出する。逆はしない**（§7.3 の `measure`→`sampleAt` と同じ向き）。⚠ **`unknown` は弱い `stale` ではない**——「宣言された周期より古い」と「測る物差しが無い」は別の答えで、直し方も別。⚠ **多上流の束は最も厳しい義務を残し、1 つでも沈黙していれば `null`（`false` ではない）。** DOM も fetch も要さないので `scripts/data-governance.mjs` が Node でそのまま読む。⚠ この層は GIS だけのものではない（読者向けの出典・同梱束の門も同じ語彙を読む）。正本は [`docs/DATA-GOVERNANCE.md`](../DATA-GOVERNANCE.md) |
| `js/gis-layers.js` | `window.IntMapGisLayers` | **地図のレイヤーをデータセットにする橋**——`sources()` / `read()` / `toDataset()`（同期） / **`acquireDataset()`（非同期）** / `toRaster()`（数値レイヤーを格子に焼く） / `supplierFor()`。⚠ **待つほうの扉が要るのは、描かれていないレイヤーが取得を伴うから**——`toDataset()` は同期の契約のまま（パネルがクリックハンドラから await 無しで呼ぶ）で、planner は `acquireDataset()` を使う。⚠ **`load()` を述べた行には非同期の供給元が組み立てられる**（表示していなくても読める）。⚠ **供給元になれるかはその行自身の宣言が決める**——全件を持ち視野に縛られないと述べた行だけが `where` と `cursor` を答えられる。一覧はどこにも無い。⚠ **取得条件の語彙 `acquireFields()` の正本もここ**（パネルと Atlas が同じ 1 か所に訊く）。ラスタの語彙は `bounds` / `width` / `height` / `where` / `unit` / **`time`** / **`band`** |
| `js/gis-ops.js` | `window.IntMapGisOps` | 処理（`filter` / `buffer` / `clip` / `intersect` / `difference` / `union` / `dissolve` / `relate` / `sample` / `zonal` / `rasterMask` / `rasterDiff` / `resample` / `rasterCalc` / `mosaic` / `rasterize` / `polygonize` / `measure` / `validate` / `repair` / `timeWindow` / `join` / `compute` / `aggregate` / **`spatialJoin`** / **`nearestJoin`** / **`timeJoin`** / **`convert`** / **`coverage`** / **`profile`** / **`compareZones`** / **`reach`**）の宣言と実行。⚠ **結合は 1 対多を既定で決めない**（`cardinality` は必須——「区域 1 つに施設 40」は例外ではなく普通の場合なので、黙って先頭を採らず、黙って行数も増やさない）。⚠ **最近傍は索引の巡回順で答えない**（`first` は入力 1 の行順）。⚠ **時点の結合は半開区間**で、裸の年はその年 1 年。⚠ **単位換算は倍率を書かず単位カーネルに訊き**、換算前後の単位と使った変換をレシピの `resolved` に残す（`params` とは別——`params` は再生の入力なので、解決値を混ぜると次回が列に訊かなくなる）。⚠ **集計は量の意味に照らして検査される**（密度の単純平均は重みを要求し、区分の合計は拒む。**未申告は許可ではない**ので実行は変えずに判定を記録する）。⚠ **量は列も述べる**——呼び手が述べればそちらが勝ち、**誰が述べたか**が `quantityStatedBy`（`caller` / `column` / `band`）に残る。⚠ **集合についての問いも op で訊ける**（`coverage`——所見は行 1 本で返り、その幾何は次の op にそのまま渡せる。元の地物は**添字ではなく身元**で名指す。訊かなかった条件も `resolved` に残る——「何を訊いたか」の無い 0 件は読めない）。⚠ **「面積で重み付ける」には面積が 2 つある**ので `aggregate` の `weightBy` で選ぶ（`memberArea` ＝既定・地物自身の地面／`intersectionArea` ＝区域との交差の地面）。既定は動かさず、重みを持たない stat に付ければ**無視せず拒む**。「重なるか」と「どれだけ寄与するか」は別々に訊く（線も点も member で重みは 0、辺だけを共有する隣は member ではない）。⚠ **比べられる形にするだけの op が 3 本ある**（`profile` / `compareZones` / `reach`）——新しい幾何も新しい算術も持たず、走るのは `zonal` / `aggregate` / 交差そのもの。足しているのは⑴算術を**量から選ぶ**こと（`reading` は知りたいことであって計算方法ではない）⑵**条件を値の隣の列に置く**こと（出典・算術・対象時点・量の著者）⑶答えられない出典に**空欄ではなく理由**を書くこと。`asOf` は上流が述べた時点と**比較されるだけで書き込まれない**。`compareZones` は交差ごとに両方の身元と割合、按分の仮定、**比べられない部分**を返すが、**「分割」「併合」「同一」の判定は返さない**（閾値は読者の主張）。`reach` は到達圏どうしが**共有している地面**を測り、足し上げが二重計上であることを表自身が述べる。⚠ ⚠ **引数の語彙は、それを所有するカーネルに訊く**（`valuesOf`）——再標本化の方式・重なりの規則・格子合わせの規則・**面の名指し方**をここに写さない。⚠ **どの op も、自分が計算した面を `surface` で述べる**（`sphere` / `degree-plane` / `degree-grid` / `stated-plane` の閉じた語彙。`surfaces()` が渡す）——球面の面積と展開した度平面の面積は別の数で、宣言が無ければ読み手はその食い違いを見られない。⚠ **長い画素ループの中止は `ctx` で下のカーネルまで渡す**（渡さなければ `js/gis-warp.js` と `js/gis-raster.js` の刻みは到達しないコードになる）。⚠ **出力は入力の意味を引き継ぐ**——`coverage` は述べた入力のうち最も弱いものが残り（沈黙は `all` ではないので、述べていない入力があれば完全性を書かない）、格子の時点は**標本が出力に入った入力**が全部投票し、名前の残った列の単位は著者ごと運ばれる |
| `js/gis-atlas.js` | `window.IntMapGis.atlas` | **Atlas がこの層に処理を依頼する扉**。目録は `ops()` そのもの（写しを持たない）。入力は登録済み id・題名・`layer:<id>`、出力は**次の処理の入力になる id**。能力は `data.gis`（計算）と `map.drawDataset`（描画）の 2 つで、op ごとには 1 つも無い。⚠ **取得条件（`acquire`）が要求そのもので、カメラではない**——語彙は `js/gis-layers.js` の `acquireFields()` に訊き、知らない欄は名前を挙げて断る。`op` を述べない依頼は**取得だけ**で、答えは取れたものの行・`coverage`・続きの `next`。⚠ **供給元の能力は取得する前に分かる**——`describe()` の `query.capabilities` が `js/gis-sources.js` の**導いた申告**を丸ごと運び（この扉は能力の表を持たない）、**実測**は取得を伴うので別の扉にしてある（`capabilities(ref, opts)` ＝ `auditCapabilities`） |
| `js/gis-project.js` | `window.IntMapGisProject` | IndexedDB への保存・復元・**引数を変えた再計算**。⚠ **ディスクに書かれるのは今もレシピだけ**で、足したのは**このタブの記憶の中に置く、1 回の実行の記憶**（`cache`）——鍵は**それを生んだ条件 5 軸**（入力の中身のバイト・`describe()` 丸ごと＋読者の宣言・op でない祖先の出自・パラメーター・カーネルの版）の sha256 で、**時刻は入らない**。版を述べない部分があれば**鍵を作らない**（「測れなかった」を「同じ」にしない）。⚠ **引いた記録は信じずに突き合わせる**——記述が 1 つでも違えば捨てて op を走らせる。予算は件数ではなくバイトで、溢れは LRU。使い回した段は `reused` として名指す |
| `js/gis-worker.js` | `window.IntMapGisWorker` | **Worker の束ね役**——純粋な算術をメインスレッドの外へ。⚠ `js/gis-ops.js` の yield の**代わりではなく隣**（あちらは応答性、これは並列性）。⚠ **口を渡す呼び出し元が要る**（長く 1 つも無かった）——いま `rasterDiff` の画素ループがここで走る（算術の実装は 1 本で、主スレッドの腕も同じジョブ関数を呼ぶ）。使えなかったときは主スレッドで完走し、**理由を結果に書く**。中止は `terminate()` まで届き、`available()`（能力）と `probe()`（実測）は別の問い。⚠ **幾何の運び口を持つ**（`geometry.op` / `provideGeometry` / `geometryOps` / `geometryReady`）——この file は幾何を 1 つも持たず、演算は置かれたものを名前で引き、**語彙は登録そのもの**。⚠ **単一の巨大な図形の中止は `terminate`**（分割できない 1 回の呼びの中に、中断してよい点は無い）で、それが届くかは `status().stopReachesRunningWork` が述べる。⚠ **途中まで書いた消費者はそう述べる**（`runBlocks` の `partial` は「使ってよい半分」ではなく、捨てるか作り直す量の測定） |
| `js/gis-panel.js` | `window.IntMapGisPanel` | 操作卓（一覧・属性表・由来の連鎖・実行・保存） |
| `js/gis-runtime.js` | `makeGisRuntime` | **組み立て**——ブラウザ入口と同じ `mount()` で 15 のカーネルを載せる。⚠ **借り物は `EXTERNALS` が全一覧**で、各項に**読み手の file:line** を書く（誰も読まない依存名は書けない）。⚠ `externals` を渡せば**閉じた集合**（渡していないものは scope に偶然在っても使わない＝`scope-carries-uninjected`）、渡さなければ生きた scope＝**ブラウザ経路は不変**。⚠ 拒否は scope を置き去りにしない（plan → 検査 → install → mount で、失敗したら巻き戻す）。⚠ mount のあと 15 の global が**同一オブジェクトとして見えるか照合**する（`kernel-not-reachable`）。⚠ 二度目の呼びは**同じ組**を返す。⚠ **1 枠ではなく、名前を持った実行コンテキストの表**——`mount(scope, HOST, CONTEXT)` が組に居場所を持たせ（`API.context` と scope の `IntMapGisContext`）、`contexts()` が各組の `ambient` を**測って**答え、`release(ctx)` が**この組が置いたものだけ**を同一性で確かめて外す（他人のものになった名前は `keptForeign`。外す一覧は `mount()` が照合した一覧そのもので、写さない）。名前の衝突は**何も書く前に** `context-id-taken`。⚠ **`scope-conflict` は緩めていない**——カーネルが裸の global で互いを解決する以上、1 realm に 2 組は今も拒む。変わったのは**拒否が終身でなくなった**ことと、**誰が持っているか**を言うこと。⚠ **2 つ目は 2 つ目の realm に住む**: `workerSource({coreUrl})` が何も無い realm で走る module の本文を作り（供給元のファイル名は `EXTERNALS` から導く）、`serve(port)` が向こうで組み立てて**経路で呼びを受け**、`attach(port)` がこちら側の取っ手。渡れないものは `result-not-transferable` として**「呼びは実行された」と一緒に**断り、**どの message にも返事がちょうど 1 つ**ある |
| `js/gis-core.js` | `window.IntMapGis` | 上を起動する 1 つの扉と、`draw()`——地物は `window.GeoJSONUpload` の 3 レイヤーへ、**格子はエンジンの動的画像へ**。どちらも「描けた」は描画器が報告した事実 |
| `js/gis-shapefile.js` | `window.IntMapGisShapefile` | **Shapefile の読み手**（`.shp` / `.dbf` / `.prj` / `.cpg`）——`read` / `group` / `refusals` |
| `js/gis-geopackage.js` | `window.IntMapGisGeopackage` | **GeoPackage の読み手**（依存を足さずに SQLite を読み取り専用で読む）——`sniff` / `tables` / `read` / `refusals` |
| `js/gis-export.js` | `window.IntMapGisExport` | **出口**——`formats(kind)` / `write(ds, format)` / `refusals`。ベクタは **GeoJSON**（属性・時刻の宣言・出典を値として運ぶ）と **CSV**（点は `longitude`/`latitude`、面と線は `geometry_wkt`）、ラスタは **GeoTIFF**（無圧縮・ジオ参照を必ず書く・ASCII フィールドは UTF-8）。⚠ **「書き出せた」は「読み直せた」ではない**——3 形式とも `js/geo-import.js` と `js/gis-geotiff.js` が読み返し、一致は許容幅 0 で測る。⚠ **持っていない出典を主張しない**（述べていないデータセットには欄を作らない）。CSV は形式に欄が無いので出典を運ばず、**運べなかったことを画面が述べる** |

⚠ **最後の 2 本は `js/gis-core.js` が起動しない。** ファイルの読み手なので、**そのファイルが実際に
落とされたときだけ** `js/geo-import.js` が動的 import する（起動時のバンドルにも、パネルを開いた
だけの読者にも来ない）。どちらも**復号器であって、データセットを登録もしなければ再投影もしない**
——拒否は文ではなくコードで返り（文面は `js/map-ui.js` の `reasonText()`）、座標系は
「ファイルが名乗ったもの」を返すだけで、変換は下の 1 つの規則が行う。

**⚠ 重い部品は動的 import で遅れて来る。** 幾何カーネルは `polygon-clipping`（Martinez–Rueda の
sweep-line。**既存の依存**で `js/world-packs.js` と `js/cesium-vector-tiles.js` も同じように読む）、
座標変換は `proj4` を、**どちらも最初に要求されたときに**取りに行く。
⚠ **ただし「動的 import」は、いつバイトが届くかを決めない。** 本番と `dist/` の両方で実測:
`polygon-clipping` は `geo-<hash>.js`（Rolldown の build で 51,164 B）に入り、そのチャンクは
`main-<hash>.js` が**静的に** import したうえ `index.html` に `modulepreload` まで置かれる
——**重ね合わせを一度も走らせない読者にも起動時に届いている**。`vite.config.js` の `geo` group は
`polygon-clipping` を `test` から外しているが、`@turf/union` の依存として group が再帰的に取り込む。
注記は逆の意図を述べているが、それを測るものは無い。チャンクの分け方を変える人は、この段落を信じずに
測り直すこと。取りに行けなかったときは `geometry-unavailable` / `crs-unknown` で
**名指して断る**——近似で代わりを描かない。

**⚠ buffer は Minkowski 和であって offset curve ではない。** 半径 r の buffer は「その形から r 以内に
ある点の集合」なので、**頂点ごとに測地円盤**（`IntMapGeodesy.diskFillPolys`——点の buffer が前から
使っているのと同じもの）・**辺ごとに測地の四辺形**を置き、全部を union する。union が自己交差を
落とし、円盤が継ぎ目を丸くする。`steps` 枚の弦で内接するので境界は真の buffer の内側に最悪
r·(1−cos(π/steps))（既定 64 なら 5 km に対して約 3 m）——この数は丸めずに `_bufferSteps` に出る。
**負の半径は内向き**で、内側を持つのは面だけなので点と線は `inward-buffer-needs-area` で断る。

**⚠ clip の窓は凸である必要が無い。** 穴のある区・凹んだ県・真の答えが離れた複数片になる窓は、
どれも普通に通る（離れた結果は離れたまま返り、窓に沿った幅ゼロの連結線はもう作らない）。線の
切り抜きは交点で切って中点で内外を判定する。

**⚠ 経度の継ぎ目は「ほどいて揃えて戻す」。** 演算の前に環をほどいて同じ 360° 窓へ持ち込み、
結果は `IntMapGeodesy._splitPolyToWindows` で [-180,180] に戻す。いま拒むのは**世界を巻く環だけ**
（極冠・全球環）——どちら側を意味したのか決められる情報が無いものだけが残った拒否である。

**⚠ `relate` は空間述語で絞る処理。** `intersects` / `within` / `contains` / `disjoint` /
`nearer-than`（`maxKm` が要る）。距離は**形そのもの**から測り、測った値は結果の `_distanceKm` に
書く。`aggregate` の 2 つ目の入力も点に限らない——「面に含まれる点」ではなく「その面に重なるもの」
を数える・合計する。

**⚠ 処理の一覧は 2 つ目を持たない。** 表示順は `DECL` の鍵の順序そのもの（`Object.keys(DECL)`）で、
`run()` の振り分けも if の連鎖ではなく表。宣言にあって走らせ手が無い処理は `op-not-wired` になる。
**対の数え上げは `js/gis-index.js` に任せる**——一様格子で、セルの大きさをデータから導き、
子午線をまたぐ箱・世界を覆う箱・箱を持たないものは全問い合わせの候補に入れる（その件数は
`stats().oversize` で外から見える）。索引が無くても答えは同じで、遅いだけ。
**入力ごとの中身は `kinds` が宣言し、既定は `vector`**＝ラスターより前に書かれた処理は格子を
`input-kind` で名前を付けて拒む。**重い処理は `run(step, {signal, onProgress})` で中止でき**、
刻みの単位は件数ではなく**経過時間**（1 フレーム）である。Worker は無い——足りていないのは
並列性であって応答性ではない。

**⚠ `join` の照合は識別子であって算術ではない。** 地域コードで 2 つのデータセットを結ぶとき、
鍵はセルの文字（前後の空白を落としたもの）で比べる——`asNumber` を通すと `"01100"` と `"1100"` が
同じ市町村になり、**誤りがどこにも出ないまま埋まった表**ができる。⚠ **一致しなかったことは
結果である**——照合できた件数・できなかった件数・鍵を持たない行の数と、両側の鍵の実例を返す
（「空欄の列」で気づかせない）。列名の衝突は解決せず `join-column-collision` で拒み、読者が
`prefix` で答える。**右側が鍵について一意でない**ときの既定は `refuse`——先頭を採るのも行を
増やすのも実在する答えだが、黙って選ぶと**行数が読者の見ていないデータで決まる**。
幾何を持たない表は左右どちらにも置ける（出力は入力 0 の幾何をそのまま持つ）。

**⚠ `compute` は式で列を作るが、読者が打った文字列はコードにならない。** 解釈は
`js/gis-expr.js`——手書きのトークナイザと再帰下降パーサだけで、`eval` も `new Function` も無い
（CSP 以前に、**打った文字列がこのページで走る道**を持たないための構造）。式が名指す列は
`filter` の条件と同じように実在が確かめられ、無ければ `null` の列を返さずに拒む。
意味の規則は 4 つ——**空欄は 0 ではなく伝播する**（0 として数えたい読者は `coalesce` と書き、
その主張はレシピに残る）／**先頭ゼロのセルは数にならない**（判定は持たず `IntMapData.asNumber` に
訊く）／**ゼロ除算と非有限は `null`**（`Infinity` の入った列は以後の平均も最小最大も使えない）／
**`+` は数を足すだけ**で文字列を黙って繋がない（繋ぎたい読者は `concat`）。関数の一覧は
`FUNCS` 1 つで、`functions()` はその写しではなく同じ表を返す。

**⚠ 処理の出力は、取り込みと同じ経路で登録される。** `provenance` が `{kind:'op', op, inputs, params}`
＝**再実行できるレシピ**なので、`IntMapGisProject.setParams(id, {radiusKm:10})` は対象の段と**その下流**を
トポロジ順に走らせ直す。結果の features は保存しない——レシピがあるなら再生できるし、保存すると入力を
変えたときに結果だけが古いまま残る。

**⚠ データセットの payload は 2 種類ある。** `kind:'vector'` は `features()`、`kind:'raster'` は
`read(bandIndex)`（`grid:{west,north,pixelLng,pixelLat}`・行は北から南・`NaN` は欠損・バンドが
`fields[]` に並ぶ＝「どの列で」がそのまま「どのバンドで」になる）。それ以外の機械——id の採番・
provenance のレシピ・lineage・`stale`——は全部同じなので、**格子は処理の入力にも出力にもなる**。
格子の算術は `js/gis-raster.js` だけが持つ（平均は**面積重み付き**・`areaKm2` と `valueAreaKm2` の差が
答えの被覆・欠損を bilinear で混ぜない・格子が違う 2 枚の差分は `grid-mismatch` で拒み**黙って
再標本化しない**）。

**⚠ 時刻は契約の一部で、宣言は検証される。** `time` は `null`／`instant`／`interval`／`track`
（位置 1 つごとに 1 時刻）／`constant` のいずれかで、**実データに対して確かめてから**持つ。
成り立たなければ `timeRefused` に理由が入る——欄が埋まっていることと誰かが述べたことは別である。
`track` の並行配列は**長さが位置の数と等しいことを地物ごとに測る**（`sanitizeFeatures` は位置を落とし、
第 3 座標成分を畳む。だから標高は座標の中ではなく隣に運ぶ）。裸の年は**その年 1 年**で、
`Date.UTC` は使わない（100 未満の年が 1900+y になる）。`timeWindow` は列名ではなく**この宣言**を読み、
軌跡に対しては選ぶのではなく**切る**（並行配列も一緒に切る）。

**⚠ 列の型は列名ではなく値で決める。** ある列は、空でない値が**全部**数値として解けるときだけ `number`。
空セルの数は判定の隣に持つ。⚠ **先頭ゼロのセルは符号であって数ではない**——十進の記法に無意味な
先頭ゼロは無いので `"01100"` は識別子であり、数として扱うと比較が `asNumber` を通って
**`"01100" == "1100"` が真**になる（統計が隣の自治体に付く）。規則は**記法**であって列名の一覧ではなく、
`0`・`0.5`・`0e3` は数のまま。外した件数は `fields[].padded` に載る。
日付は**年から始まる ISO-8601 系だけ**受ける（`03/04/2020` は読む人によって
違う日になる）。同じ判定を `js/gis-ops.js` も使う——2 つ持つと、パネルでは比較できて問い合わせでは
できない列が生まれる。

**⚠ 幾何を持たない行は、3 つ目の payload ではない。** 統計表は `kind:'vector'` の記録で、
その地物が `geometry:null` を持つだけ——だから `filter`・`timeWindow`・横断クエリ・保存・
provenance・lineage・`stale` が**1 行も足さずに**効く。`geometryType` は「0 件」と「4 万行あるが
どれも幾何を持たない」に同じ `null` を返すので、**`withGeometry` を `count` の隣で測る**
（宣言ではなく測定）。`count - withGeometry` が描くもののない行の数で、両方が 0 でない記録は
どちらかに寄せずに**混在をそのまま述べる**（座標セルが空の CSV は実際にそれである）。
格子では `0` ではなく `null`。

**⚠ 値は読者が直せる。取り消しは差分であって snapshot ではない。**
`editValues` / `addField` / `removeField` / `renameField` / `undo` / `redo` / `history`。
履歴が持つのは `{index, field, 元の値}`（列なら実際に在ったセルの疎な一覧）で、編集ごとに
4 万地物を写さない——`history().bytes` が**実際に持っている量**を述べるので、この主張は
確かめられる。⚠ **編集できないものが、この層の要点である**——**処理の出力**は provenance が
レシピで `setParams` が走り直すので編集が黙って消える、**格子**は画素であって属性ではない、
**`stale` な記録**は編集すると古さが見えなくなる。取り消しは**セッション限り**（保存は
取り込みを本体ごと書くので編集済みの値は既に保存に入っており、取り消し履歴まで保存すると
新しい写しを落とした瞬間に**地物と一致しない履歴**を IndexedDB が持つことになる）。
⚠ **読者は列の型と単位を `declareField` で宣言できるが、型は実データで検証する**——
成り立たない宣言は受け取らない（単位は誰も検証できないので、宣言であることが分かる形で運ぶ）。

**⚠ 取り込んだレイヤーは属性で塗れる**（`js/map-ui.js` の `window.GeoJSONUpload`）。
`style(ref, spec)` / `styleOf` / `classify` / `find` / `link`。**分類器 `classify` は純粋**で、
DOM もレンダラも言語も読まず、「これは空か・これは数か・この列は数値か」の 3 つを
`IntMapData` から**渡してもらう**——ここで 2 つ目の「これは数か」を書くと、パネルでは比較できて
地図では塗れない列が生まれる。`categorical` は多い順、`graduated` は分位または等間隔で、
色は**レイヤー自身の色を白へ寄せた単一色相の梯子**。⚠ **凡例と地図の塗りは同じ 1 つの
`legend` から作る**（別々に計算すると必ず離れる）。欠損は専用の色で、**潰れた区分の数**
（`collapsed`）と**畳んだ「その他」**は黙らずに凡例へ出る。レンダラが塗りを受け取らなければ
`style()` は**元へ戻す**——受け取られなかった着色を凡例が主張しない。
⚠ **描かれたレイヤーとデータセットは識別子で結ぶ**（`link`／`draw()` の `datasetId`）。
題名で突き合わせると、同名の 2 ファイルの片方に誤って塗る。
⚠ **登録に失敗したことは読者に言う**——モジュールが来なかった・レジストリが受け取らなかったの
2 つを名指して述べる（レイヤーは失わない。以前はどちらも無言で、「地図には出たのに分析に
使えない」が外から分からなかった）。

**⚠ `crs` は常に `EPSG:4326`、`sourceCrs` は「ファイルが名乗ったもの」。** GeoJSON（RFC 7946 §4）・KML・
GPX は仕様が WGS 84 を固定しているので `EPSG:4326`、区切りテキストは **`null`＝「名乗っていない」**。
既定値を入れて「4326 だった」と主張しない。パネルは `sourceCrs` を**「述べていない」「そのまま」
「変換した」の 3 状態**として出す。

**⚠ 4326 でない座標は、推測せず本当に変換する。** `js/geo-import.js` は GeoJSON の `crs` メンバ
（`urn:ogc:def:crs:EPSG::NNNN` / `EPSG:NNNN` / 旧 `{"type":"EPSG",…}`。`OGC:1.3:CRS84` は 4326 扱い）を
読み、4326 でなければ `IntMapGisCrs` に**実際に変換させる**。変換できなければ `crs-unsupported` で
**取り込みごと断る**。CSV や WKT 列のように誰も名乗っていないものは `looksProjected()` が
「度ではありえない座標か」を**測り**、度でなければ `crs-not-stated-and-not-degrees` で断る。
⚠ **この決着は `sanitizeFeatures` の前**——緯度を ±89.9999 にクランプする関数に投影座標を渡すと、
100 万メートルが 89.9999 度になって「読めた」ように見える。

**⚠ EPSG の一覧は持たない。** 定義の出どころは 3 つの規則だけ——① `proj4` 自身が知っているもの
（`proj4.defs(code)` に訊く）／② UTM の**算術**（EPSG は 326NN を WGS 84 / UTM zone NN 北、327NN を
同 南に割り当てる。これは EPSG が公表している式であって一覧ではない）／③ 読者が `define(code, text)`
で渡した WKT・proj 文字列（`.prj` ファイルが自分について述べた文）。それ以外は `crs-unknown` で拒む。
⚠ **規則 ③ の呼び出し元は Shapefile である**——`js/geo-import.js` は `.prj` の本文を、変換の前に、
`proj4` が知っている番号かどうかに関わらず `define()` へ渡す。内蔵の表が断る国家座標系も、
**ファイル自身が自分について述べた定義**から正しく読める（GeoJSON の `crs` メンバに与えている
のと同じ扱い）。AUTHORITY を持たない `.prj` に EPSG 番号は発明せず、`PRJ:<base>` と名乗る。
出力は常に `[lng, lat]` で、変換後に |lat| > 90 になったら `crs-axis-suspect` で拒む。

**⚠ 中止と進捗は、保存と再計算にも通っている。** `IntMapGisProject.setParams(id, params, opts)` と
`load(id, opts)` が `{signal, onProgress}` を取り、`IntMapGisOps.run()` へ渡す——中断できる
走者を持っているだけでは足りず、**渡す呼び出し元が要る**（渡されなければ、引数を変えた読者の
画面は止まったままで、パネルが描く中止ボタンは効かない）。進捗は「何段目か」と「その段のどこか」の 2 つで、後者は数え直さず
`js/gis-ops.js` の報告をそのまま通す。⚠ **中止は取り消しではない**——既に終わった段はその
まま残り（その features は新しい引数に対する答えである）、止まるのは残りで、残りは失敗と
同じように `stale` になる。⚠ 保存の読み込みを中止したときも、**残りの段は 1 つずつ名指して**
返す（「中止しました」だけでは、どのレイヤーが無いのか読者に言えない）。

**⚠ 失敗した段は、消えるのではなく `stale` になる。** `IntMapGisProject.setParams` は
commit-or-restore——失敗したら元のレコードを戻したうえで `stale` を立て、**下流にも伝播**する
（`IntMapData.invalidate(id, why)`）。パネルはバッジで出し、`IntMapGisOps.run()` は `stale` な入力を
`input-stale` で拒む。以前は失敗すると編集中のデータセットが**消え**、下流は古いまま何も言わずに
残っていた。自動採番 `ds-N` は**自分が共有している名前空間を見る**ので、保存から `ds-1` を復元しても
次の取り込みと衝突しない。

**⚠ 地図に出ているものは、それ自体がデータセットの入口である**（`js/gis-layers.js`）。`sources()` は
一覧を持たず**数え上げる**——`IntMapLayers` の行のうち `state()` が答え `featuresIn()` が配列を返す
もの、およびレンダラの style から読んだ geojson source（どのレイヤー行も代弁しない、上げただけの
ファイルも届く）。`read()` は**形状も属性も落とさない**。`toDataset()` の `provenance` は
`{kind:'layer', layer, bounds, at, statedTime}`。**入口は `js/gis-panel.js` の「地図から取り込む」節**
——`sources()` を並べ、`toDataset()`（地物）と `toRaster()`（数値レイヤーを格子に焼く。1 画素 1 await
なので中止でき進捗を述べる）を呼ぶ。⚠ レイヤーが述べる時刻は**読者向けの文**なので、文は
`provenance.statedTime` にそのまま運び、`time` の宣言は**時刻として読めるときだけ**行う。

**⚠ 横断クエリは、この層を「問い合わせの瞬間に」読む**（`js/atlas-query.js` の `syncUserTables()`）。
`data.query` の `from` に**データセットの id をそのまま書ける**。列は `js/gis-datasets.js` が測った
`fields[]` そのもので、cost 0・origin `raw`。⚠ 押し込み（登録）ではなく**引き**なのは、クエリ engine が
遅延読み込みだから——先に登録しに行く経路は「まだ存在しないモジュールへの登録」と「その再生」という
2 つ目の正本を作る。⚠ **行は元の geometry を参照で持つ**——線や面は外接矩形の中心 1 点には潰れない。
表に出る 1 つの座標は外接矩形の中心だが、**空間判定はすべて形そのものの上で測る**（結果の注記が
そう述べる）。

### 7.3f 地点カード (Place card — 地点プロファイル／いま、ここ) — `js/place-dossier.js`

**1 地点について、地図が既に持っているものと、いまそこで起きていることを 1 つの記録にまとめ、1 枚のカードに出す。**
地点プロファイルと「いま、ここ」は**同じカード・同じ記録**で、違うのは**起点**（どこから来た地点か）と**節の順**だけ。

| 入口 | 起点（`at.from`） | 節の順 |
|---|---|---|
| コンテキストメニュー（右クリック・長押し）「現地の情報 ▸ 地点について」・検索結果カードの「地点プロファイル」（`openPlaceDossier`） | `point`（地図で選んだ地点） | この地点 → 時刻と太陽 → いま → かつての名前 → レイヤー |
| 検索欄の空の状態「いま、ここ」（`js/here-entry.js`）・ホーム画面アイコンの長押し `?here=1`（`bootFromUrl`）（`openHereNow`） | `device`（端末の現在地） | **いま** → この地点 → 時刻と太陽 → かつての名前 → レイヤー |
| 共有シート・写真の場所（`js/share-inbox.js` → `openHereNow({point})`） | `shared`（共有された地点） | 同上 |
| Atlas `research.placeProfile` / `research.hereNow` | 地点が渡されれば `point`、`hereNow` に地点が無ければ `device` | 同上（`hereNow` は「いま」が先頭） |

**⚠ 起点が「何が端末から出るか」を決める。** `point` は選ばれたとおりに送る（地名の Nominatim は zoom 14、天気、
表示中レイヤーのタイル）。`device` と `shared` は**正確な位置を端末から出さない**——送るのは `PRIVACY_GRID_DEG`
（0.1°・約 11 km）に丸めた地点だけで、送り先はそれが無いと答えられない 2 つ（地名は zoom 10、天気）。標高と
レイヤーの値は**その起点では読まない**（タイルの要求が位置を述べるため）——節は消えず理由
`position-kept-on-device` を述べる。地震と出来事はどの起点でも**位置を付けずに読んで端末で絞る**（下の「いま」）。
privacy.html / `js/legal-text.js` の第 2 項と同じ事実。

モジュールは**そのクリックで取りに行く**（起動経路に載らない）。地図のクリックの所有権には触れない。

| 項目 | どこから | 欠けたとき |
|---|---|---|
| 座標 | `HOST.fmtLL`（読み出しと同じ書式） | — |
| 名前と行政区分の連なり | Nominatim reverse（zoom 14）。`address` を**上流の並び順のまま**連ねる（どの欄がどの階層かの表は持たない）。ISO 3166-2・国コードは識別子として欄に置き、連なりには入れない。`licence` は上流の文をそのまま運ぶ。アプリ共通の Nominatim の列（`js/nominatim-gate.js`）とホストの期限（`clockFor`）を通る | 区域が無い＝`none`／届かない＝`unavailable`（期限層の理由） |
| 国 | Natural Earth の国境（`HOST.countryGeo`）をアプリ共通の点内判定 `window._imPipGeo`（穴を含む）で引く | 公海・帰属未定＝`none` |
| 標高・水深 | `IntMapLayers` の `elevation` 登録（terrarium DEM）。その登録と**同じズーム**のタイルを先に待つ | 値が無い／タイル未着＝理由つきの行 |
| 表示中レイヤーの値 | `IntMapLayers.sampleAt`——`data.layerValues` と GIS カーネルが読むのと同じ窓口。数（`value`/`unit`）・分類（`code`）・表示文（`text`）を分けて持つ | 下の 4 種の理由 |
| 現地時刻 | 天気の取得元が地点について述べるタイムゾーン（`IntMapWx.point`、`timezone=auto`）——**天気と同じ 1 回の応答**から読む | 応答した上流がゾーンを述べない（MET Norway）ときは**その名を挙げて**述べる |
| 日の出・日の入り・昼の長さ | IntMap 自身の計算（`IntMapWx.sunTimes`。白夜・極夜を含む。端末内で計算し何も送らない） | — |
| いまの天気と今日 | `IntMapWx.point`（天気パネルと同じ呼び出し。Open-Meteo、代替は MET Norway） | どちらも応答しない＝`unavailable` |
| 周辺の地震 | `js/events-near.js` `readQuakes`——USGS の M2.5 以上・7 日のフィードを**丸ごと 1 回**読み、`RELATED_DEFAULTS`（300 km）で端末が絞る | 該当なし＝`none`（答え）／フィードが応答しない＝`unavailable`（理由） |
| 近くの出来事 | `js/events-near.js` `readNewsEvents`——`news_events` の 72 時間を位置を付けずにページ送りで読み、端末が絞る。柵（`NEWS_PAGES`）で切れたら `truncated` とカードが述べる | 同上 |
| かつての名前 | `IntMapHistCities.near`（改名都市の記録。その記録自身の判定半径）。押すとその年の地図 | 記録に無い＝`none` |
| 国の統計 | **呼び手が渡す指標の集合と書式**（Atlas は `js/atlas-metrics.js` の集合と `fmtVal`）。カードは統計を書き写さず、既存の国カードを開くボタンを置く | 国に無い指標は 0 ではなく**行が無い** |

**⚠ 読めないレイヤーは行が消えず、理由を持った行になる。** 4 種: `no-value-here`（訊いたが値が無い）・
`sampler-failed`（読み手が投げた）・`features-not-a-value`（点いているが地物の集合で、地点の値ではない）・
`no-point-reader-declared`（パネルで点いているが、宣言が `IntMapLayers` の読み手を名指していない）。
最後の 1 つは**宣言から発見する**——`dataLayers()` の各行について、宣言の `registry`、無ければ登録簿自身の規約
（`js/map-ui.js` の `isOn(id)` が読むチェックボックス `dl-`+id / id）で結ぶ。手で持つレイヤーの一覧は無い。
⚠ この行が述べるのは「宣言が読み手を名指していない」ことだけである。国別の塗り分け（`bx-*`）は国別コロプレスの
行が合算して読むが、宣言がそれを述べていないので、この行に並ぶ。

**⚠ カードと Atlas は同じ記録を読む。** `placeProfile()` が JSON にできる 1 つの記録を作り、`profileHtml()` が
カードの本文と Atlas の吹き出し（`inert`——押しても何も起きない操作は描かない）の両方を描き、`profileSpeech()` が
読み上げる（`js/map-reader.js`）。Atlas にはその記録がそのまま届く——`research.placeProfile` は `exec.placeProfile`、
`research.hereNow` は `exec.hereNow` として（`hereNow()` は `placeProfile()` に「いま」を先頭にする指示を足しただけで、
集める関数も記録の形も 1 つ）。2 つの能力は両方残り、`hereNow` だけが端末の位置を読む扉を持つ（確認の列 `explicit`）。
カードは `.country-popup`（ドラッグ・携帯のシート）で、開くと `MAP_ANSWER_EVENT`（`card`）を出す。地震と出来事は
カードが開いている間、地図に点で描く。

**範囲 × 期間の地震・出来事の読み手は 1 つ（`js/events-near.js`）。** カード・見守る場所（`js/place-watch.js`）・
Atlas の `research.related` / `research.impact` / 実世界オブジェクトの解決が同じ読み手を通る。USGS のフィードは
セッション内で**1 回の取得を共有**し（同時に来た呼び手は同じ要求を待つ）、USGS が述べる更新間隔（1 分）より古くなったら
読み直す。フィードが持たない窓（7 日超・M2.5 未満）は黙って切らず `unavailable('window-beyond-feed')` と述べる。
状態の語彙は `STATE`（`ok` / `none` / `unavailable`＋理由）の 1 か所で、「該当なし」と「取得できなかった」は同じ語にしない。
距離は `supabase/functions/_shared/great-circle.js` の `haversineKm`（地球半径 6,371 km）1 つで、ページと Edge Function が
同じものを import する。

### 7.3g マイマップ (My map) — `js/my-map.js` / `js/my-map-doc.js`

**読者が自分で描くピン・線・範囲と、その名前・メモ・色。保存し、共有リンクで運び、測り、分析し、書き出す。**
入口: **Layers ▸ Tools ▸ マイマップ**（`tool.myMap`）・Atlas `map.myMap`（`{"type":"myMap","action":…}`）・
オブジェクト一覧（種類 `mymap`）・`mm=` を持つ共有リンク。モジュールは遅延（`IntMapLazy` の `myMap`、公開名
`window.IntMapMyMap`）で、起動経路に載らない。

| 何 | どこで・どう |
|---|---|
| 文書の形 | `{v:1, id, title, updated, features:[{id, kind:'pin'|'line'|'area', name, note, color, coords}]}`。`coords` は読者の頂点（[lng, lat]・経度は [-180, 180]）。名前とメモは共有リンクの題と一言と**同じ規則**（`MapState.captionText`・`TITLE_MAX` / `NOTE_MAX`）。色は 6 色の表の 1 つ |
| 精度 | 頂点は**文書に入るときに** 1e-6° へ丸める（`COORD_SCALE`。由来は定数の隣）。保存とリンクが同じ値なので、作者と受け手は同じ地図を見る |
| 辺 | 2 頂点を結ぶ**大円**（計測ツールと同じ「地球上の直線」）。描く形・分析するデータセット・書き出すファイルは**同じ 1 つの形**——大円を 0.1° 以下の断片にし（`DENSIFY_DEG`）、日付変更線で切る（`js/geodesy.js` の `_splitLineToWindows` / `_splitPolyToWindows`）。⚠ 極を囲む範囲は描かず（`polar`）、パネルとファイル（`geometry:null`・`polar:true`）がそう述べる |
| 計測 | 線の長さ・範囲の面積と周囲は**計測ツールの関数**（`HOST.ringArea`・turf の大円距離）で、表示は読者の単位設定（`HOST.distTXT` / `areaTXT`——計測パネルの `distHTML` / `areaHTML` と同じ数と単位の文字版） |
| 保存 | このブラウザの `localStorage` `intmap_mymaps`（`{v:1, current, maps:[…]}`。地図はいくつでも）。読み込むときに全地物を今の規則で読み直し、読めない地物は数えてパネルが述べる。保存を拒まれたら（容量・プライベート）パネルがそう述べ、リンクか書き出しを勧める |
| 地図の状態 | `js/map-state.js` の `mymap` 欄（`&mm=`・アドレスバーの最後）。値は `toLinkValue`（頂点は Encoded Polyline、1e-6°）を `s=` と同じく base64url の JSON に包んだもの。`read` は表示中の地図（空なら無し）。**`apply` は信用しない**——`fromLinkValue` が全欄を手で描いた頂点と同じ規則で読み直し、読めない地物は数える。**同じ id の地図がこのブラウザにあれば手元の写しを出す**（リンクより新しい）。他人の地図は読み取り専用で出し、「自分の地図として保存」で**新しい id の写し**を作る。行の `lazy: 'myMap'` は、値を持つ復元だけがこの module を取りに行くことを述べる（値の無い復元では取りに行かない）。`restore:'full'`——落ちた再読み込みは図形なしで開く。⚠ 地図の状態を持たない起動（ハッシュの無い URL）では module を取りに行かず、何も描かない——パネルを開くと現在の地図が出る（「最初の 1 枚」は地図が全面） |
| 共有 | 共有リンク・埋め込み・絵葉書・授業ツアーの段（`MapState.hash()`）は図形を運ぶ。パネルの「リンクをコピー」は今の地図（場所・レイヤー・日付）にこの図形を載せたリンクと、その長さ |
| 分析 | 「分析に使う」は表示中の地図を `IntMapData.add` で**データセット**にする（`provenance: {kind:'sketch', author:'reader'|'shared-link', map, title, at, edges}`）。**その時点の写し**であって、地図を描き足しても変わらない（由来が時刻と地図の id を述べる）。`kind` が `op` でないので属性は編集でき、プロジェクト保存は本体ごと保存する（`docs/GIS-CORE.md` §4） |
| 書き出し | GeoJSON / GeoPackage を `js/gis-export.js` の `write`（データセットと同じ記録の形）で。ライセンスは誰も述べていないので書かない |
| 取り込み | 「この地図へ移す」はセッションだけの物——ピン（`HOST.userPins`）・計測と描画で残した図形（`IntMapAnnotations`）・半径円——を地物にして**元を消す**（移動）。半径円は 64 角形になり、名前が「64 角形」と述べる（面積は円より 0.16 % 小さい） |
| 描く | 地図のクリックで頂点を置く。ピンは 1 回、線はダブルクリック・Enter・最後の点・「完了」、範囲は最初の点・ダブルクリック・Enter・「完了」で確定。Backspace で 1 点戻し、Esc でやめる。⚠ **地球の外を押しても頂点にしない**——球の脇の黒い空間や空を押すと `unproject` は奥の縁や地平線の点を返す（実測: 球の 10 px 左で 10.42°N 70.63°W＝球の裏側）。レンダラの `coords.onSurface` に訊き、外ならパネルがそう述べる（§7 の 01 章）。描いている間はダブルクリックのズームを止め、クリックは `claimClick` で自分のものにする（地名ラベルが開かない）。計測ツールや自由描画が始まれば退く。近さの判定は計測ツールの `SNAP_PX` |
| 地図の層 | `mymap-src`（形）・`mymap-lbl-src`（名前のある地物の名前）・`mymap-draft-src`（描きかけ）。前の 2 つは `render.claim(…, 'map.myMap', {clear})` で、地図の消去は**隠す**（削除しない） |
| Atlas | `map.myMap`（open / add / edit / remove / title / show / hide / list / link / export / analyze / new / collect / keep / draw）。観測器 `myMap` は module 自身の状態（表示・地図 id・地物 id と名前・メモ・色）と描かれた地物数を**呼んだ後に**読み、結果の `want` と一致したときだけ完了とする。状態の `myMap` 節に一覧が載る |

### 7.4 Chronos（統一時間）と「年」

- **歴史データは起動時に読まない。読むのは「過去へ行こうとしている」ときだけ。** 国境の束
  （`data/cshapes.js`・印 `data/border-coast.js`・名前 `data/histnames.json`。失敗時は `data/hist-eras.js`）と
  第 1 層の歴史的行政区分（`data/hist-admin1.js` と穴埋め `data/hist-kuni.js`・`data/hist-admin-fill.js`）の
  **先読み**は、`window.IntMapTime.onIntent(fn)`（`js/chronos.js`）が呼ばれてから始まる。
  意図は 1 回だけ立ち、あとから購読した者には即座に届く（読み込み順で先読みの有無が決まらないため）。
  立てるのは ⑴ **時計そのもの**——`set` が**今年より前の年**を受けたとき（Atlas・共有リンク・セッション
  復元・パネルのどの操作もここを通る。未来〔予報・潮汐〕と今年の中は数えない）と、⑵ **時代 UI**——
  `data-time-intent` を宣言した要素（Chronos ボタン `#ntl-toggle`、凡例の年の行 `.dl-clockrow`）の中での
  最初の `pointerdown`／`focusin`（カーネルは文書に 1 本の capture リスナを置くだけで、コントロールを名指さない）。
  `IntMapTime.intended()` が誰がいつ立てたかを返す。
  先読みで取るのは各記録の**索引**（数 kB〜150 kB）で、行と環は年を変えたときにその瞬間の分だけを取る
  （下の「年で切ったタイル」）。
- **先読みしてよいかは 1 か所が答える**：`window.IntMapMemBudget.maySpeculate(旧テスト)`
  （`js/mem-budget.js`）。Data Saver・2G（`slow-2g` を含む）・**携帯（端末で訊く `deviceIsPhone`）**では
  意図のあとでも先読みしない。意図のあとの先読みも `requestIdleCallback`（上限つき）で main thread の空きを待つ。
  ⚠ これは**先読み**の規則であって、実際に年を変えたときの読み込み（`IntMapTime.on` の購読者）は
  全端末で従来どおり走る——先読みを控えて失うのは初回の待ちだけで、描画は失わない。
  ⚠ 第 2 層以下（`data/hist-admin2.js` ほか）は先読みしない（描かれるのはそのズームに達してから）。
- **歴史の束はメインスレッドで評価しない。** リングプールした記録（`data/cshapes.js`・
  `data/hist-borders.js`・`data/hist-eras.js`・`data/hist-admin1.js`〜`hist-admin3.js` と、第 1 層へ継ぎ足す
  `data/hist-kuni.js`・`data/hist-admin-fill.js`）を読むのは **`js/hist-bundles.js`（`window.IntMapHistBundles`）
  だけ**で、束は Blob Worker が取得・`JSON.parse`（ファイルは `window.__X=` ＋厳密な JSON で、形式も
  ビルダーも変えていない）・保持する。問いは向こうで答える——`at(t, end)`（その日に有効な行。
  `end` は CShapes が `inclusive`、OHM 系が `exclusive`）・`during(t0, t1)`（戦争の層）・`snap(y)`（時代の
  1 枚）・`edges(end, lo, hi)`（エポックの境目）。ページが受け取るのは**その瞬間に描く行と環だけ**で、
  束と同じ形の**疎な写し**（`h.data`：`rings`・`feats`・`dates`・`snaps` と束の上位の値）に入る。
  だから `js/time-borders.js`・`js/time-admin1.js`・`js/war-layer.js`・`js/border-coast.js`・クリック・
  ラベル・Atlas の `currentFC()` は、前と同じ行と同じ環の配列を同じ索引で読む。
  ⚠ **写しは疎なので、ページ側で全行を歩いてはならない**（歩く問いは上の 4 つとして Worker に訊く）。
  ⚠ **環は 1 回だけ送り、受け取った配列は差し替えない**（幾何のメモと線の記録が配列の同一性に付くため）。
  最初の旅行の環は `SLICE_POINTS` 座標ずつ別のメッセージで届く（1 通の構造化複製が 1 本の長いタスクに
  ならないように。数と由来はファイル冒頭）。穴埋め記録の継ぎ足し（列 11＝自分のファイルでの行番号、
  列 12＝何番目の穴埋め記録か）も Worker 側で行い、`h.data.gapPools[gi].view` がその記録自身の索引で
  見た写しになる（`js/border-coast.js` の印はその索引で引く）。ページに届いた環は
  `IntMapHistBundles.ringOrigin(ring)` が「どの束の何番目か」を答え、`globalOf(写し)` が束の名前を答える
  ——束はもう `window` に載らないので、印と詳細境界はこれで束を知る。
  Worker が作れない・死んだときは**同じ関数**（`histJob`。Worker はその関数自身のソースから組み立てる）を
  ページで走らせ、束が `window` に既に載っているとき（node の足場）はそれをそのまま使う。
  前後の実測と、描かれる集合が年と場所ごとに同一であることの確認は開発記録
  `dev-notes/2026-09-30-hist-bundles-off-main.md`、回帰は `tests/hist-bundles-off-main-checks.test.mjs`。
- **歴史の束は丸ごと取得しない——年で切ったタイルから、その瞬間に要る分だけを取る。** ビルドが各記録を
  `data/hvt/<名>.idx.json`（索引）と `data/hvt/<名>.jsonl.gz`（独立した gzip メンバーの連結。1 メンバー
  ＝JSON 1 行のチャンク）に切る（`scripts/build-hist-tiles.mjs`、`vite.config.js` の `histTiles()`）。
  索引は扉が `open` で答えていた head・全行の `[開始, 終了]`（YYYYMMDD の整数）・各行のチャンクと
  その環のチャンク・時代の各 1 枚のチャンク・各チャンクのバイト範囲を持つ。扉は索引を読み、Worker の
  同じ `histJob` に「その問いが読むチャンク」を訊き（`need`）、それだけを `readWithin`（同じ時計）と
  `Range` 要求で読み、バイトのまま Worker へ渡して（`feed`）から問いを訊く。だから読み手が受け取る行と環は
  **ファイルを丸ごと読んだときと同じ値・同じ索引**で、写しの規則（疎・1 回だけ・差し替えない）も同じ。
  ⚠ **範囲は表示範囲ではなく全世界**——Atlas の名前検索・比較ウィンドウの `geomForCode`・`coverage()`・
  クリック救済・ナレーター・`edges` は「その瞬間の全世界」を同期で読むので、切るのは**年**だけ。
  ズームの門は従来どおり（第 2 層は z6・第 3 層は z8 になってから開く）。
  ⚠ **アーカイブは `.gz`（`application/gzip`）で配る。** GitHub Pages は `application/javascript` と
  `application/octet-stream` を gzip で送り、`Range` には**圧縮後のバイト列の範囲**を返す（実測。
  `scripts/serve.mjs` も同じ振る舞いを再現する）ので、その型ではオフセットが使えない。
  ⚠ **環は整数差分で持つが、値は元の倍精度と一致する**（記録の小数桁数の 10 の冪で割る。一致しない環は
  書かれたまま持つ）。ビルドは毎回、切ったものを扉の job で読み戻して全行・全環・全日付・全シートを
  記録と照合し、違えば失敗する。⚠ 記録（`data/*.js`）は源で、門はそれを測り、**配信もされる**——タイルの
  無いサーバ（`npm run dev`）・別の記録の索引・チャンクでないバイトでは扉が丸ごと読む側へ戻る
  （同じ答えになる）。⚠ **穴埋め記録の継ぎ足しはタイルでも Worker が行う**（各記録は自分の索引と
  アーカイブを持ち、継ぎ足しは `openTiled` が `splice` と同じ規則で行う）。
  ⚠ **Service Worker は `data/` を扱わない**（タイルのホストだけを持つ）ので、`Range` はそのままネットワークへ行く。
  実測（転送量・待ち・メモリの前後、年と場所ごとのバイト一致）は `dev-notes/2026-10-01-hist-vector-tiles.md`、
  回帰は `tests/hist-vector-tiles-checks.test.mjs`。
  ⚠ **取得を外から観測するとき、DevTools プロトコルの「完了」を完了と読まない。** 本文を `getReader()` で
  最後まで読む fetch は、読み切ってページが全バイトを受け取ったあとでも、プロトコル（Playwright の
  `requestfinished` / `requestfailed`）が `net::ERR_ABORTED` と報告することがある（実測は開発記録
  `dev-notes/2026-10-01-deep-tier-after-restructure.md`）。届いたかは**ページ自身の Resource Timing**
  （状態 200・本文の大きさ）と、扉の `IntMapHistBundles.requested(global)`／`loaded(global)` で見る
  （`tests/history-prefetch-on-demand.spec.js`）。
- 地名クリックの優先順位はエンジンの登録情報で判定する。`events.onLayer` の第4引数
  `{ownership:'fallback'}` は、他の地物や地名に譲る領域説明用。`clickLayers()` は全登録、
  `clickLayers({ownersOnly:true})` は優先権を持つ登録を返す。無名歴史領域の説明はfallbackで、
  都市・地方区分・地理名のクリックを遮らない。同一レイヤーの別ハンドラの優先権は維持する。
  登録台帳はレンダラに依存しない `js/click-ownership.js` が持ち、adapterとcallbackを弱参照する。
- 都市ポップアップの見出しは `IntMapHistCities.forFeature` で実地物の座標と名称を照合し、
  地図の年代・表示言語と同じ歴史名を併記する。現代名での境界照会とは分離し、
  位置を持たない地物や非有限座標をクリック位置で代用して歴史都市へ結び付けない。
  歴史都市名の取得失敗は固定しない。次の時計更新または明示取得で再試行でき、取得中は
  同じPromiseを共有する。成功したデータは保持し、再描画からの再入でも追加取得しない。

- 歴史表示の地図背景は `js/historical-basemap.js` が既存 OpenFreeMap の自然地理から描く。CARTO のラベルなし画像にも現代の行政境界が含まれるため、旅行中の地図背景には使用しない。現在の海岸・水域・地表を参照する背景であり、過去の海岸線や植生を復元するものではない。衛星画像は従来どおり。
- 年別境界の `BORDERPRECISION` は名前のない形状も含めて保持し、概略・中程度・国際法に基づくという**出典の分類**を破線・長破線・実線と名前付き地物の説明へ伝える。分類がない形状の精度は推定しない。
- 地方区分の有効期間は OHM の終了日を含まない。年月精度の端は期間境界へ正規化し、原表記と精度を `dates` に別途保持し、選択時の補足に出典の原表記を表示する。詳しくは `docs/MAP-LAYERS.md` §7.7。
- ⚠⚠⚠ **上流が開始日を述べていない区分を、時計の床から描かない。** 日付を持たない行に前回のビルドの
  表示下限を引き継ぐと、その数は誰の主張でもないまま線になる。実測: 令制国 48 国と五畿七道の道、
  上海の共同租界（1863）とフランス租界（1849）を含む **68 行**が紀元前 200 年から描かれ、壱岐国・
  安房国・東海道・山陰道・西海道は終了日も無いので **1900 年にも今日も**地図に出ていた（廃藩置県は
  1871-08-29）。span としては整っているので、形を測る門はその全部の上で緑だった。
  いまは `scripts/histadmin/class-dates.mjs` が、**その単位自身の Wikidata クラス（P31）×
  上流が述べる終了日**を 1 つの「制度」として発見し、その制度の中で述べられている最も早い開始日だけを
  下限に採る。⚠ **制度の一覧は書かない**——両方の上流が既に公開している 2 つの値から導くので、
  上流が合意をやめた日にその制度は日付を与えなくなる。⚠ 導出した終了日を受け取れるのは**両端とも
  述べていない単位だけ**（OSM/OHM で終了日が無いのは「いまも在force」という主張である）／
  **2 件以上かつ、述べられた終了日の 3 分の 2 以上**が一致していること／結果が区間にならなければ拒む。
  実測: **49 行**が制度から日付を得（令制国と五畿七道の道は 0701-01-01 – 1871-08-29）、どの制度にも
  属せない **19 行**（`wikidata` タグが無い）は**出荷から外れた**——作った日付で描くより、描かない
  ほうが正直である。`data/hist-kuni.js` の令制国 16 国も同じ制度の span を読む。日付だけの再実行は
  `node scripts/build-hist-admin1.mjs --dates` と `node scripts/build-hist-kuni.mjs --dates`
  （ジオメトリには触らない）。
- **導出したことは読者にも述べる**（`js/map-ui.js` の `_eraSourceDates()`）。出典の日付が `?` の端が
  導出されていたとき、区分のポップアップは「出典の日付」の行に続けて「上流は日付を述べていない。
  同じ制度の他の単位が述べる 0701 から描いている」と述べる。⚠ **描かれている線の下に裸の `?` を
  残さない**——`?` は出典についての正直さであって、その行が**どの瞬間から描かれているか**については
  何も言っていなかった。
- **地図が「どれだけ」描けているかは観測されていて、後退すると門が落ちる**
  （`npm run check:histfidelity` ＝ `scripts/hist-fidelity.mjs`・オフライン）。測るのは 3 つで、
  3 つを同時に読む: ⑴ 上流が述べていない開始日から描かれている行（**0 でなければ落第**）、
  ⑵ 同じ admin_level の単位が**同じ土地を**同じ瞬間に主張する組（地面で測る——内点の 25% 以上が他方の
  中にある組だけ）を、`js/hist-scale.js` の `claimKind` で**継ぎ目**（年精度の引き継ぎで 1 年以内の重なり）・
  **重複**（同じ名前の単位を上流が 2 度持つ）・**係争**（別の単位が同じ土地を主張する。係争・管轄の重なり・
  終わりが記録されていない変更のどれかで、機械は判定しない）に分けて数える（どれも増えたら落第）、
  ⑶ **その年に地図が政体の中に置いている陸地のうち、第1級の区分が描かれている割合**——0.25° の
  陸地格子で測り、政体の母集合は `data/cshapes.js` / `data/hist-borders.js` / `data/hist-eras.js`
  から、どの記録がどの帯を答えるかは各記録自身から導く。観測の正本は `data/hist-fidelity.json`
  （紀元前 500 年から 2019 年まで 18 年ぶん・セル数と cos(緯度) 重みの面積の両方）で、実測は 1000 年 1.1%・
  1500 年 4.9%・1800 年 25.4%・1900 年 47.5%（面積 43.8%）・2000 年 62.3%・2019 年 66.9%。1900 年に
  第1級の区分が 1% 未満の政体は 82、**一部だけ**が 29、丸ごとが 39。測り方そのものは `js/hist-knowledge.js`
  が持ち、**地図の斜線（下）と同じ関数**である。⚠ **被覆だけを見て上げてはならない**——最も安い上げ方が「誰も置いていない年に単位を
  描く」ことで、それが ⑴ そのものである。歴史地図を機械的検証だけで済ませない規則の正本は
  `.agents/rules/historical-verification.md`、門が測れないもの（史実の正しさ・継ぎ目と本物の係争の
  区別・薄い年の分母）は `docs/TESTING.md`。
  ⑶b **穴は理由ごと記録される。** 測った各年の、丸ごと描かれていない政体ごとに、記録の無い土地の下にある
  現代の国と、そこが空いている理由（Wikidata が発足日を述べる単位が半分未満・識別子が無い・最後の発足より
  前・どの日付でも国を丸ごと描けない…）を `data/hist-coverage-holes.json` が持ち、門は出荷済みの束と
  一致しなければ落とす（写真を撮り直させる）。理由は `data/hist-admin-fill.js` の `refused` が持つ。
- **記録が黙っている土地は、地図の上で斜線になる**（`js/time-admin1.js` の `_know`・`imta-know-fill` /
  `imta-know-lbl`）。その日付に第1級区分の記録が 1% 未満の政体は**その政体自身の輪郭**に、一部だけの政体は
  **記録の無い土地**（0.1° の矩形）に斜線を引き、「この年代の地方区分の記録なし」「地方区分の記録はこの土地の
  N% だけ」と書く。区分線が無いことを「区分が無かった」と読ませないため。旅行したときに
  `js/hist-knowledge.js` を動的 import し、区分と国境が描かれた後に計算する（古い日付の結果は捨てる）。
  レイヤー行の注記と `coverage().known` はその日付の割合と、`data/hist-claims.json` のうち両方が描かれている
  二重主張を種類別に述べ、Atlas の `time.coverage` が時計の瞬間についてそれを読む。
  ⑷ **時代の枚の名前が、その政体の存在しない年に描かれていないか**も同じ門が測る。どの年にどの枚が
  描かれるかはページ自身の `nearest()` を評価して求め（写さない）、名前に存続期間がある所見
  （`scripts/histeras/match.mjs` の照合器が結んだ QID、または審査済みの行）を**実体から発見**し、
  `data/hist-era-spans.json` に**判定（行＝名前を外す／`refuted`＝理由つきで外さない）が無い所見が
  1 件でもあれば落第**する。行は Wikidata の P571 / P576 が述べ、**かつ史実がその日付と一致する**
  ときだけ書き、ページ自身の `eraShown` に渡して名前が本当に外れるかまで確かめる。
  成立側の行は **`hs`（その行の `history` の文が単位の存在を置く最も早い年）を値として持ち**、文がその年を
  述べていなければ落第、地図が `hs` 以降のどこかの年で名前を外していても落第する（Wikidata が史実より
  遅い成立年を述べる場合はその年を使わない。史実の年を境界にするなら `sBy: "history"` の行にし、
  それは Wikidata が述べるどの成立年よりも早いときだけ認められ、カードは「史実はこの政体の成立を …頃に
  置く。Wikidata はそれより後の … を述べるが用いていない」と述べる——エラムの紀元前 3200 年頃）。
  ⑸ **国名の宗主国の括弧は CShapes の記録が変わる日に外れる**——名前の表（`_CS_ERA`）の年 Y は
  「その gwcode の記録が Y に変わる日」と読み、門は全規則について境界の前日と当日にページの `_csName`
  を評価する。⑸b **国家の名前は国家より前に書かない**——同じ表は 260・265・731・732 を記録が国家の行を
  始める日（1949-09-21・1949-10-05・1948-09-09・1948-08-15）から西ドイツ・東ドイツ・北朝鮮・韓国と呼び、
  それより前は占領地（「Germany (Western Allies)」「Germany (USSR)」「Korea (USSR)」「Korea (USA)」）と呼ぶ。
  ⑸c **場所の名前は場所の名前として訳す**——ラベルの段（`tagSame`・`_eraLocName`）が現在の国の表
  （Natural Earth の `NAME_JA`）を訳語に使うと、`NAME_JA` が国家の正式名である行（台湾→中華民国、
  韓国→大韓民国、マリ→マリ共和国など 245 行中 34 行が CLDR の地域名と違う）で、成立前の島や他国の領土に国家の
  名前を書いていた。日付の無い記録（シート・OpenHistoricalMap）の輪郭と「土地 (保有者)」の土地の半分は、
  **CLDR の英語の地域名がその名前そのものであるときだけ** CLDR の地域名（`Intl.DisplayNames` short）で訳し
  （`_placeLoc`）、日付のある記録（CShapes の `_gw`）の輪郭は今の国名のまま。旧国家の名前は**その国家の期間の外では、
  自分の名前そのものを訳すときにしか使わない**（期間外の別名への一致——1913 年の「Korea (Japan)」が李氏朝鮮に
  なる——をしない）。「土地 (保有者)」の保有者を、その輪郭自身の政体と読まない（`_heldLand`。ソ連占領地区が
  「ソビエト連邦」になっていた）。⑹ **遡らせた区分は、その国の単位が述べる最も遅い発足より前に描かない**——束の
  `inception` 欄から行ごとに再導出する。⑺ **上流が 1 つの引き継ぎを 2 つの年で書いた所見**
  （同じ `…:event` を名乗る前後の単位）は `data/hist-admin-edges.json` に判定が無ければ落第し、
  判定は Wikidata が述べる日で、束の行に当たっていなければ落第する。正本は `docs/MAP-LAYERS.md`。
- Cesium は透明な全球画像を最下層に持ち、部分範囲の極域画像が地球全体へ引き伸ばされることを防ぐ。背景色は最前面の可視backgroundから更新する。
- Cesiumへ渡すベクタタイルの面はMercator座標でタイル範囲に切り、低ズームでは半球未満の部分へ分ける。穴を保持し、辺を補間して球面上の水域が陸地を覆うことを防ぐ。 輪郭線は元の辺を個別にタイル範囲へ切り、面の切断でできる閉じ辺やタイル外の描画bufferを海岸線として描かない。
- Cesiumの同一ID地物を更新するときは削除通知と追加通知を分ける。通知を停止した区間内で両方を行うとSDKが相殺し、過去への切替後も現在の形状が残るため。
- 携帯のChronosは出典表示の実際の矩形から下端と利用可能な高さを決め、シート移動・リサイズに追従する。高さが足りない場合は操作部の内部をスクロールできる。

- **時刻はマスタークロック `window.IntMapTime` 1本**。⚠ **2つ目の時計を作らない。**
- **下限は `IntMapHistScale.FLOOR` が決める**（`IntMapTime.min`）。⚠ **この数を書き写さない**——スライダーの `min`・入力の
  ガード・目盛りは全部 `IntMapTime.min` を実行時に読む（`js/news-timeline.js`）。
  その範囲に何があるかは**各出典が決める**のであって、時計は最短のものに揃えない:
  **地方区分は下限まで届く**——OpenHistoricalMap のベクタタイルを日付で絞って描くので、
  上流が記録を持つどの世紀にも線が出る（7.5）。上流が単位そのものを持たない範囲は、
  IntMap が CC0 の出典から自分で導いた区分（`data/hist-kuni.js`＝日本の令制国 16 国、および
  `data/hist-admin-fill.js`＝今日も立っている第1級区分を上流が述べる発足日まで遡らせたもの）が
  `imta-gap-line` で埋め、塗りは上流由来の線と同一である——どの供給が答えたかは読者に見えない。
  ⚠ **遡らせる区間の規則は `docs/MAP-LAYERS.md` §7.7 が正本**（門は `npm run check:histfill`）。
  ここに書き写さないが、読み違えやすい 3 点だけ述べる: ⑴ **完全性は「この束が描くか」ではなく
  「読者が見るか」で測る**——穴埋めの区間と上流（`data/hist-admin{1,2,3}.js`）が答える区間の**和**で
  国ごとに交差を取り、出す行は穴埋めの分だけで、上流に委ねた単位は束の `deferred` 欄が申告する
  （申告は列挙ではなく**幾何**で検証される）。これが無いと、上流が 1 単位だけ持っている国は
  交差が空になって**丸ごと落ちる**。⑵ **国の床は現在の国家の成立日ではない**——それは 20 世紀の
  日付なので、19 世紀を埋めるための記録が 19 世紀を全部禁じてしまう。床は**その国の単位が述べる
  最も遅い発足日**（＝その集合が揃った日）で、早すぎる外れ値は最大値になれないので交差が自分で
  弾く。⑶ **識別子は ISO 3166-2 とは限らない**——ISO を持たない単位は同梱の Natural Earth 自身の
  代替コード（末尾 `~`）で数え、Wikidata との結合は**厳密な ISO 形だけ**で行う（`~` 付きは誰も
  日付けていない）。識別子を 1 つも持たない単位を含む国は、完全性を再導出できないので入らない。
  ⚠ **区分をクリックしたときの輪郭は、束の簡略形ではなく上流の原寸**（束の行が持つ
  OpenHistoricalMap の relation id で 1 件だけ取り直す。粗い形を先に出し、届いたら同じ source を
  差し替える）。relation → 多角形の規則は `js/ohm-rings.js` ただ 1 本で、ブラウザとビルドが
  同じ実装を使う（docs/MAP-LAYERS.md §7.7）／
  ⚠ **区分の名前は 3 つの供給を順に見る**——① OpenHistoricalMap の `name:<言語>`、② 同じ relation の
  `wikidata` タグが指す項目のラベル、③ 上流の現地名 `name`。**②が埋めるのは空いている欄だけ**で、
  上流が書いた名前を上書きしない。⚠ **1 つの項目を複数の単位が名乗っているとき、その単位どうしが
  違う名前を述べているなら、その項目は誰の名前にもならない**（同じ単位が時代ごとに分かれている
  だけなら名乗ってよい）。⚠ 上流の `name:zh` は**繁体・簡体のどちらかを変換で判定してから**しまう
  （どちらでも同じ綴りなら両方の欄に入る）。読者の言語 → 欄の対応は `IntMapLang.htmlTag` ただ 1 本で、
  ビルドも同じ登録簿を評価する。⚠ **いま名前を足す言語は英語と日本語だけ**
  （`scripts/histnames/langs.mjs`。9 言語に戻すのはその 1 行で、上流が既に書いた他言語の名前は
  1 つも落とさない）／
  **歴史国境は 1689 年まで日単位**——CShapes 2.0 が 1886-01-01 から 2019 年まで、
  OpenHistoricalMap（`data/hist-borders.js`）が 1689–1885（下の項）。それより前は
  historical-basemaps の年別スナップショット（**紀元前 123000 年から西暦 2010 年までの 54 枚**・
  同梱 `data/hist-eras.js`）だけが答える／
  GDP・人口はマディソン・プロジェクトで 1850 年から／
  ケッペン気候区は最古のラスタが 1901-1930 なので、それより前はその期間を出し、凡例が期間名を出す。
- ⚠⚠⚠ **年スライダーは「年」ではなく「位置」を持つ**（`js/hist-scale.js` の `IntMapHistScale.rail`）。
  下限が 1 になった時点で、1年=1目盛りのレールは全長の 91% を 1850 年より前に使い、
  1850–現在を末尾 8.7% に押し込む（実測 340 px の軌道で 176 年が 30 px＝1px あたり6年）。
  **到達範囲を伸ばすことで、すでにあった精度を奪ってはならない**ので、レールは 0〜1000 の位置を運び、
  年は位置の**区分線形関数**になっている。折れ点（西暦 1 年で 10%・1500 で 32.5%・1850 で 55%）は好みではなく、
  **記録の密度が変わる場所**を実測して置いたもの（`js/hist-scale.js` に測定と失効条件）。
- ⚠⚠⚠ **`new Date(Date.UTC(y,…))` は y < 100 のとき y+1900 になる**（ECMA-262 の2桁年規則）。
  下限が 100 を切った以上、瞬間の生成は全部 `setUTCFullYear` を通す（`js/chronos.js` の `atUTC`）。
  これを踏むと `YMIN=1` と書いてあるのに地図は 1901 年へ行き、**ラベルだけが「1年」と言う**。
- ⚠ **1886–2019 の国境は「年」ではなく「日」で引く**（`js/time-borders.js` の `csFC`）。CShapes の
  各レコードは `開始年月日 → 終了年月日` を持っており、選択はクロックが指す**その日**で行う。
  時計の瞬時から年月日を取り出すのは**ローカルの getter**（`getFullYear` / `getMonth` / `getDate`）で
  あって `iso` ではない——`IntMapTime` の `iso` は `toISOString()`＝UTC なので、`#ntl-date` が書く
  ローカル午前0時をそれで読み直すと、**東半球では利用者が選んだ日の前日**が描かれる。
  ⚠ **年だけを渡す経路は「その年の7月1日」のまま**（`IntMapTime.setYear()` は6月15日を置くので、
  年スライダーは6月中旬の世界を出す）。実測: 出荷している束は 710 レコード・**369 の変化日**を持ち、
  暦年は 134 しかない。到達できる世界は **68 → 132** に増えた。
- **キャッシュの鍵は日付ではなく「エポック」**——その日以前で最も新しい変化日（`csEpoch`）。
  同じエポックに入る2つの日は同じ鍵になるので、**変化の無い年代をスクラブしても再描画は起きない**。
  ⚠ 鍵はもう 1 つの軸——**名前の表の年**（`_csNameKey`。`_CS_ERA` の年単位の規則が切り替わりうる各年の 1 月 1 日、
  表から導く）——も持つ。集合は作られた日の名前で書かれるので、年単位の改名がエポックの途中に落ちると、名前が
  「そのエポックで最初に訊かれた日」に従っていた（1970 年の日を先に見ると 1971 年の 490 が「Zaire」でなく
  「Democratic Republic of the Congo」）。`[y,m,d]` の規則は記録の境に縛られているので軸は要らない。
- **変化日の索引は多角形と同じレコードから導出する**（`csBounds`：各レコードの開始日と、終了日の翌日）。
  ⚠ **日付の一覧を別に持たない**——持てば多角形と食い違う。`IntMapTimeBorders` が
  `changeAfter` / `changeBefore` / `changeAt` / `changeDates` で公開し、Chronos の
  **国境ステッパー**（`#ntl-bstep`・`js/news-timeline.js`）がそれだけを尋ねる。
  ステッパーは**マスタークロックに書く**のであって、国境レンダラを直接動かさない
  （直接動かせばニュース・統計・気候区と国境がずれる）。
- **1689–1885 は `data/hist-borders.js`（OpenHistoricalMap・CC0 1.0）で、同じ日単位の機構で引く**
  境界の幾何だけを更新する生成経路は、既存の名称・有効期間・識別子を保持する。
  元資料を旧生成条件で再現した形状との一致を確認し、補正済みの形状を上流で上書きしない。
  国境と行政区分の同梱形状の間引き許容幅は生成データが保持し、行政区分の通常の境界表示は
  引き続き縮尺別のOpenHistoricalMapタイルを優先する。海岸線との判別データも更新した形状から再生成する。
  描画時の再簡略化も生成時の精度とは別に検証する（詳細は `docs/MAP-LAYERS.md` の境界精度の節）。
  （`js/time-borders.js` の `hbFC` / `hbBounds` / `hbEpoch`）。OHM の `admin_level=2` 境界関係を
  `scripts/build-hist-borders.mjs` が CShapes と同じリングプール形式へ落としたもの——**記録 1411 件**、窓の中の**変化日 881 件**。
  各年6月15日に生きている政体は 164〜216。
  ⚠⚠⚠ **1885 と 1886 の間で、地図が描く政体の数はおよそ 3 割落ちる。これは欠陥ではなく主語の交代である。**
  実測（各年 6 月 15 日）: 1885 年は OHM が **184**、1886 年は CShapes が **128**（OHM なら同じ日に 183）。
  CShapes 2.0 は **国際システムの主権国家**の記録（Gleditsch–Ward 系）で、**植民地・保護領・非主権の政体を
  収録しない**。OHM は描く。だから継ぎ目で消えるのは「記録が薄くなった」ものではなく、**もともと別のものを
  数えていた 2 つの記録の差**である。⚠ 1886 年以降も OHM 側の記録は生きている（1900 年で 102・1914 年で 64）が、
  **2 つを同じ日に重ねて描く経路は無い**——同じ土地を 2 通りの主語で塗ることになるため。
  ⚠ **窓の外の記録も出荷している**: 1,411 件のうち **114 件は 1689–1885 のどの 6 月 15 日にも在force にならない**
  （全件が窓より前に終わる。窓より後に始まるものは 0 件）。
  ⚠ **窓の下限 1689 は選んだ年ではなく導出された年である。** 上流の深い側は薄い（西暦 100 年で
  全陸地の 6%・13 政体）ので、ビルドは「世界とはどれだけの陸地か」を**隣の記録 `data/cshapes.js` に訊く**
  ——実測 12,895〜14,660 deg²——その最小からCShapes 自身のばらつき 1 つ分を引いた値を下限とし、
  記録がそれを覆う年だけを残す（1688 年は 9,371 deg²、1689 年は 11,314 deg²）。導出した値は束の
  `window[0]` に書かれ、`js/time-borders.js` の `HB_MIN` はその**写し**にすぎない（門は
  `tests/history-era-borders-checks.test.mjs`）。政体名は OHM の `name:xx` から
  **9言語**ぶんポリゴンに載って運ばれ（`_i18n`）、`tagSame` が `_eraLocName` より先にそれを読む——
  英語名を照合して訳す仕組みは Kurhessen も Rupert's Land も訳せないから。
- ⚠ **クリックの答えは、押した政体のもの**（`resolveHist`）。この関数は統計の出どころを得るために
  必ず**現代の国**へ解決し、そのあと名前と Wikipedia をその国のもので**上書き**する。1886–2019 では
  たいてい正しい（多角形は本当に「ドイツ」）が、この窓では逆になる——実測: 1860 年の両シチリア王国を
  押すと「イタリア／サルデーニャ王国の記事」が返っていた。数字の出どころ（`code`）はそのままに、
  **名前と記事だけ記録自身のものへ戻す**。⚠ 記録の英語名が現代の国と**同じ**なら現代側の訳語を使い、
  **違うときは現代の国旗も落とす**（両シチリア王国はイタリア国旗を掲げていない）。
- ⚠ **OHM の `end_date` は排他で、CShapes の終了日は包含**（`hbFC` は `開始 ≤ その日 < 終了`、
  `csFC` は `開始 ≤ その日 ≤ 終了`）。実測: 窓の中で同一 `wikidata` の連続する 180 組のうち **151 組**が
  「終了日 ＝ 後継の開始日」なので、CShapes の読み方をすると**切替日に両方が描かれる**。
  `hbBounds` は終了日**そのもの**を境界に取り、`csBounds` は終了日の**翌日**を取る。この2つを揃えない。
- ⚠ **描かれる線は多角形の輪郭ではない**（`data/border-coast.js`・`scripts/build-border-coast.mjs`）。
  政治的記録の環は2種類の辺が1つの輪になったもので、「国どうしの境界」はその記録しか知らないが、
  「その政体が持つ海岸線の写し」は基図のほうが正確に知っている。同梱の海岸線
  （`data/coastline.json.gz`＝Natural Earth 1:10m・2 km 許容）に対して、**ある辺のどこか1点でも
  `INLAND_KM` より内陸なら境界、そうでなければ海岸線の写し**と判定し、
  8つの束（`cshapes` / `hist-borders` / `hist-admin1` / `hist-admin2` / `hist-admin3` /
  `hist-eras` / `hist-kuni` / `hist-admin-fill`）の
  全リング **56,194 本**に
  ついて「描く run」を印す。⚠ **どの束を印すかは書き並べていない**——`data/` を走査し、
  「1つのグローバルに `rings`（[経度,緯度] の配列の配列）を持つ束」であるものを**発見する**
  （`discoverBundles()`）。手で並べた一覧は短くなっても誰も気づかないので、
  `--check` は「印された束の集合が `data/` の束の集合と厳密に一致すること」を落第条件にする。
  各エントリは自分が印す**グローバル名**（`global`）も持つ。
  ⚠ **面積 0 のリングは描かない。** 記録が持つ精度で符号付き面積がちょうど 0 になる環は内部を
  持たないので、その辺は何の境界でもない（実測: `hist-eras` の 8,826 本中 904 本がこれで、
  891 本は同じ頂点を2度通って戻る折り返し。他の束は 0 本）。塗りは元から何も描かず、線だけが
  「領域のない境界」を描いていた。⚠ **束からは1本も削っていない**——削ると `blank` レーンの
  1,007 個と名前つき 12 件（うち 2 件はその年から名前ごと消える）が失われる。
  印の**読み手は `js/border-coast.js`** ただ1つで、`js/time-borders.js` と
  `js/time-admin1.js` の両方がそれを呼ぶ——同じ読み方を2か所に持たせないため。各モジュールはその
  run だけをつないだ MultiLineString を線用の source（`imtb-ln-src` / `imta-ln-src` / `imta2-ln-src`）
  へ流し、線の層はそれを描く。多角形は `imtb-fill` / `imta-src` / `imta2-src` に残る——クリック対象と
  ラベルのアンカーは領域についての話で、そこは変わっていない。
  ⚠ **規則は地方区分にも同じ定数で効く。** 区分の束を 2.5〜14 km で掃いても描かれる長さは 1 km
  あたり 0.2% しか動かず、区分独自の肘は無い（区分の輪郭はほとんどが内陸なので、海岸線の写しは
  小さい割合である）。1つの規則・1つの権威・1つの定数。
  ⚠ **印は任意**: 読めなかったときと、**実行時に GitHub から取りに行く** historical-basemaps の
  スナップショット（束が答えない年だけ通る経路）には印が無く、そこは環を丸ごと描く。
  ⚠ **同梱の historical-basemaps（`data/hist-eras.js`）には印がある。** ただしその層は環の索引では
  なく **FeatureCollection を丸ごと**渡してくるので、`js/border-coast.js` は**環そのものの同一性**で
  印を引く——束が溜めた配列と同じオブジェクトが collection に入っているため。どのグローバルが
  どの束かは印のファイル自身（`global`）が言うので、読み手には束の名前が1つも書かれていない。
  束は Worker が持ち、ページには疎な写しが届く（§7.4）ので、ページの環は `js/hist-bundles.js` の
  `ringOrigin` が「どの束の何番目か」を答え、印はその番号で引く（同じ長さの検査つき）。`window` に
  束が丸ごと載っている場合（node の足場）は従来どおり同一性の索引で引く。
- ⚠ **スナップショットへの丸め（`nearest`）は、1689 年以上では代替でしかない**（`js/time-borders.js`）。
  1689–1885 は `data/hist-borders.js`、1886–2019 は `data/cshapes.js` が日単位で答え、
  historical-basemaps はそれらが読めなかったときだけ出る。MAXGAP を 1886 年より下で適用しないのは、
  その退化状態で 1875 年にウィーン会議の地図（60年古い）を出さないため。
  ⚠⚠⚠ **1689 年より下では、スナップショットが代替ではなく唯一の答えである。** 時計の下限が
  西暦 1 年に降りた以上（7.4）、この系列が薄ければ地図は嘘をつく——実際、`YEARS` が 1815 で
  始まっていた間、1500 年を指すと**ウィーン会議の地図が 1500 年として描かれていた**（実測）。
  上流（aourednik/historical-basemaps）が公開しているのは **54 枚**で、**うち 17 枚は紀元前**
  （`world_bc1` から `world_bc123000` まで）。⚠ **一覧は手で書かず、上流のディレクトリを読んで
  得る**（2026-09-10 実測。増えたときも同じ読み方で取り直す）。
  ⚠ **紀元前の 17 枚は、時計の下限が西暦 1 年だった間、原理的に到達できなかった。**
  下限は `js/hist-scale.js` の `FLOOR`（天文年 −122999 ＝ 紀元前 123000 年）で、
  `npm run check:histeras` が同梱の束の最古と照合する。
  ⚠ **54 枚は同梱する**（`data/hist-eras.js`・10.6 MB・`scripts/build-hist-eras.mjs`）。
  1689 年以降は自前の束なのに、**他に答えの無い深い過去だけが**
  `raw.githubusercontent` と第三者の CORS プロキシ 2 本に依存していた。遠隔取得の経路は
  **代替として残してある**（束が読めなかったときだけ動く）。
  ⚠ **ライセンスは GPL-3.0**（上流の LICENSE 全文・GitHub の判定とも。README にライセンス表記は
  無い）。取得するだけだった間と違い、同梱は再配布なので、出典と地図の帰属表示がそれを述べる。
  ⚠ 誤差は**その系列自身の粒度**: 1000 年より前は 100 年刻み、以降は上流が
  1279/1492/1530/1715/1783 のように細かく持つ年もあり、最大でおよそ 50 年。紀元前はさらに粗く、
  紀元前 10000 年と紀元前 123000 年の間には**何も無い**。
  ⚠⚠⚠ **1 枚は存続期間ではない。名前は読者の年で問う**（`js/hist-scale.js` の `eraSpanOut`）。
  上流は政体が終わった後の枚にもその名前を持ち越し（`world_1600` は 1591 年に滅んだ «Songhai» と
  1554 年に終わった «Watassid Morocco» を自分の年として描き、`world_1700` もまだ «Songhai» を持つ）、
  しかも `nearest()` は 1 枚にその前後の年も答えさせる（`world_1600` は 1566〜1625 年に描かれ、
  1581 年成立の «Dutch Republic» が 1570 年に載っていた）。どちらも地図の上では「この年に、この
  政体」という同じ主張になるので、規則は枚の年ではなく**読者の年**に訊く。
  審査済みの存続期間は `data/hist-era-spans.json`（`scripts/histeras/spans.mjs`）：名前・その名前が
  指す単位だと確かめた QID・**Wikidata が述べ、かつ史実が一致する**境界（`s` / `e`、天文年、
  境界の年そのものは期間の内）。成立側の行は史実が置く最も早い年 `hs` も持ち、名前を外す年がそれより
  前に収まることを門が確かめる（Wikidata の成立年が史実より遅いもの——エラムの紀元前 2700 年は古エラム期の
  始まりで、原エラム期は紀元前 3200 年頃から——はその年では外さず、史実の年を境界にした行
  `sBy: "history"` で紀元前 3200 年頃より前だけを外す）。期間の外では**名前だけを外し、形は残す**（上流が描いた土地は
  記録にある）。外した形のカードは「上流はこの形を «X» と呼ぶが、その政体はこの年には存在しない」と
  述べ、どの QID の何年に基づくかを示す（`blankNote`）。代わりの名前は IntMap からは付けない。
  ⚠ **読み手は 1 人ではない**：`currentFC`（Atlas・比較・語り手）・`featureAt`・`geomFor`・
  `geomForCode` は描いている当の collection（`_drawnFC`）を読み、キャッシュの生の枚は読まない。
  `coverage()` は外した名前を「上流が名前を与えていない形」と別に数え、レイヤー行の注記がそれを
  列挙する。OpenHistoricalMap のベクタタイル（`ohmFilter`）は第1級以下の区分（admin_level 3〜7）
  だけを描き、政体の名前はこの束からしか出ない。
  ⚠ **深い枚が描いているのは政体ではない。** `world_bc123000` は Homo heidelbergensis と
  Neanderthal、`world_bc10000` は縄文・コイサン——上流自身の分類（自由記述の `TYPE`、実測 141 件・
  紀元前 700〜10000 年の 9 枚だけ）が言う範囲でそれを運び、言っていないものには何も足さない。
  ⚠⚠⚠ **そしてそれを地図の上で述べる**（`js/time-borders.js` の `coverage()` / `note()` / `typeNote()`）。
  この束が答えているあいだ、レイヤー行「国境」の注記が 9 言語で「いま載っている枚の年」「上流が
  隣に持っている枚」「その枚の形の件数」「上流が名前を与えていない件数」「上流自身の言葉での分類と
  その件数」を述べ、クリックのポップアップは上流が `TYPE` を言っている形についてだけその語を
  そのまま出す（`showPopup` の `opts.sub`）。⚠ **数は `shownFC` から数え上げる**ので文と線は
  食い違えず、枚どうしの空白も記録の隣の年から導く（詳細は `docs/MAP-LAYERS.md`）。
  ⚠ **名前の無い上流ポリゴンは描くがラベルを出さない**（6,955 件）。深い枚ではそれが named より
  面積が大きく（bc123000 で 18,345 deg² 対 3,210）、捨てれば地図の大半が消え、名前を付ければ捏造。
  ⚠⚠⚠ **しかし、クリックには答える**（`imtb-fill` の handler と `blankNote()`）。ラベルが無い形は
  シンボルを持たないのでクリックの対象が無く、レイヤー行の注記は `title` 属性＝指では届かないため、
  **深い枚では画面の大半について読者が見ているものを述べるものが 1 つも無かった**。カードは
  「上流はこの形に名前を与えていない」という**不在そのもの**を述べ、中身は上流自身が言っていること
  （`TYPE`・`BORDERPRECISION`・`SUBJECTO`・`PARTOF`）だけで、名前は作らない。名前のある形の挙動は
  変わらず、他の層がそのタップの持ち主なら譲る（詳細は `docs/MAP-LAYERS.md`）。
  ⚠ **昔の国名ラベルは「1 政体 1 点」ではない。** 唯一の候補が衝突に負けた名前は移動せず消えるので、
  離れた大きな領土（アラスカ、グリーンランド、フランス領アルジェリア…）を持つ政体では、そちらに
  何も乗らないことがあった。球面上の面積が下限以上で、かつ既に名前を持つ部分から**両者の等面積円の
  半径の和**より遠い部分には、点を追加する（実測 1800 年: 163 名に対して点 170・2 点以上は 6 政体）。
- **歴史的な政体名は、記録をまたいで 1 つの表 `data/histnames.json` が答える。**
  ⚠ **かつては、読者の言語で名前が届くかどうかを「その年をどの記録が答えたか」が決めていた。**
  描かれる feature 比の実測（2026-09-11・改訂前）:
  `data/cshapes.js`（1886–2019）de 32.0% / fr 18.6% / jp 38.0%、
  `data/hist-borders.js`（1689–1885）de 57.5% / fr 71.0% / jp 65.7%、
  `data/hist-eras.js`（〜1688）de 20.5% / fr 18.2% / jp 31.4%。
  真ん中が高いのは OpenHistoricalMap が `name:xx` を自分で書くからで、**一番低いのは読者が最も訪れる帯**
  だった——1950 年に立った読者は国名の 8 割を英語で読んでいた。**規則は記録ではなく名前に付く。**
  表は 3 つの**別種の根拠**を持つ:
  - **識別子** — `data/hist-borders.js` は政体の Wikidata QID を 1,411 feature 中 1,305 件で述べている。
    識別子は綴りではないので照合するものが無い。**上流が書いた名前は決して上書きせず**、空いた言語だけ埋める。
  - **尺度** — 識別子を持たない cshapes と era snapshot には、綴りに一致する Wikidata 項目を**全部**取り、
    **座標を述べているならそれが地図の描く形の中にあり**、**存続期間を述べているならその名前の出る枚に届く**
    ことを要求する（`scripts/histeras/match.mjs`。期間の許容幅は**その辺りの記録の分解能**から導く）。
    決め手が無ければ**採らない**。⚠ 「地図が描く種類のものか」は**座標を持つか**では訊かない——
    深い枚の主題は**民族**で、Wikidata は民族に座標を述べない。根を名指し、その下に何があるかは
    `wdt:P279*` に訊く（`ACCEPT_ROOTS`）。
  - **上流の説明文** — era の製図者は、名指す政体が無いところに英語の**文**を書く
    （`Savanna hunter-gatherers`・`Plain bison hunters`）。それは名前ではないので出典を要求せず、
    **説明として訳す**。⚠ **どれが説明文かは尺度で決める**——Wikidata がその綴りの項目を 1 つも持たず、
    かつ**その綴りの中に、この記録自身が 2 つ以上の名前で小文字で使っている語**があること
    （`scripts/histnames/prose.mjs`）。訳語は `d` の印を持つ。
  ⚠ **英語は常に上流のもの**（Wikidata の英語ラベルで地図を改名しない）。
  ⚠ **手書きの表（`_ERA_LOC` ほか）が答える名前とは重ならない**——重なれば同じ判断が 2 か所になり、
  `tagSame` が `_i18n` を先に読むぶん手書きのほうが到達不能になる。
  ⚠ **出荷する言語は 1 か所の方針**（`scripts/histnames/langs.mjs`）。問い合わせとキャッシュは
  9 言語ぶん取り、**絞るのは出荷だけ**。現在は **en / jp**。
  - **第 2 の典拠ストア** — 上の尺度は「Wikidata がその英語綴りの項目を持っているか」から始まるので、
    **持っていない綴りには量るものが無い**。era の綴りは 3,029 種類あり、そのうち **1,208 件**がそれで、拒否は
    `string-only`（＝根拠が弱い）と記録されていたが、実際には**候補が 1 件も無い**状態だった。
    ⇒ **英語版 Wikipedia のリダイレクト**に訊く（`scripts/histeras/harvest.mjs` `articlesFor`）。
    リダイレクトは編集者が書いた**別名**で、`skos:altLabel` と同じ種類の主張が別のストアにあるだけ。
    ⚠ **綴りの一致を緩めてはいない**——`redirects=1` は 1 つの記事にしか解決せず、記事の Wikidata 項目は
    1 つなので、**順位づけられた候補列そのものが存在しない**——綴りだけで 1 件を選ぶ経路が無い。
    見つかった項目は上の尺度をそのまま通る。⚠ **曖昧さ回避ページは記事ではない**ので落とす。
  実測 2026-09-14: 地図が名前を引く 2 記録で **958 名前**を尺度で決め（era 773・cshapes 185）、
  識別子で 283 QID、**101 の説明文**、合わせて 6,459 の訳語。
  ⚠ **`lanes` はこれより広い母集合を数える**——era・cshapes に加えて base lane の 32 行も含む
  表全体で、label/alias が 812・en.wikipedia のリダイレクトが 178・識別子が 283、訳語 6,611 件。
  2 つの数は別の母集合についてのもので、どちらも文書とゲートが同じ定義で照合している。
  どのストアが答えたかは文書自身の `lanes` が持つ。
  era の名前は 520 → 684 行になり、**描かれるラベルに占める割合は 22.5% → 26.3%**
  （de 12.0→14.3 / es 13.1→15.2 / fr 14.1→16.9 / jp 20.3→23.5 / ko 18.4→20.7 /
  ru 20.3→23.3 / zh 21.1→24.2%）。
  ⚠ **綴りと地理の両方が一致していても、種類が違えば採らない**——川は政体ではない。根は
  `watercourse` であって `landform` ではない（後者は島嶼国家を含み、実測で 53 行＝イギリス・
  アイルランド・ニュージーランド等を消す）。正本は `scripts/histeras/harvest.mjs` の `REJECT_ROOTS`。残りは上流の製図者だけが書いた綴りで、訳す出典がまだ無い。
  描かれる feature 比の被覆（名前表を導入した改訂の前 → 後。**この表はその改訂の記録であって、
  今日の到達率ではない** —— 今日の値は下の段を見ること）:

  | 言語 | CShapes 1886–2019 | hist-borders 1689–1885 | era ≤1688 |
  |---|---|---|---|
  | de | 32.0% → **61.1%** | 57.5% → **77.1%** | 20.5% → **21.7%** |
  | es | 31.8% → **63.0%** | 68.3% → **88.4%** | 21.6% → **22.9%** |
  | fr | 18.6% → **52.0%** | 71.0% → **88.2%** | 18.2% → **19.2%** |
  | jp | 38.0% → **88.3%** | 65.7% → **89.9%** | 31.4% → **40.9%** |
  | ko | 18.6% → **68.9%** | 87.1% → **92.1%** | 22.8% → **23.8%** |
  | ru | 38.0% → **88.3%** | 65.3% → **86.7%** | 31.4% → **33.0%** |
  | zh / zh-hans | 18.6% → **68.9%** | 64.4% → **89.0%** | 24.8% → **26.6%** |
  ⚠ **残りが英語なのは埋め忘れではない**——上流がその綴りで何も名指していない。

- **手書きの名前表と `data/histnames.json` は、名前ごとではなく「名前×言語」で合流する。**
  `js/time-borders.js` の解決順は `_i18n[lg] || _eraLocName(nm)` で**言語ごとに退く**ので、
  手書き表が答える言語では手書き表が勝ち、**手書き表が黙っている言語だけ**を名前表が埋める。
  ⚠ 以前は手書き表が**どれか 1 言語でも**答える名前を名前表から丸ごと除外しており、
  `Japan`・`China`・`France`・`Mexico`・`Egypt` など**読者が最も出会う綴り**が、日本語読者には
  届きフランス語・韓国語・中国語読者には英語のまま出ていた。
  ⚠ **到達率の数をここに書き写さない。** 正本は `tests/history-cshapes-gate-checks.test.mjs` の `FLOOR`——
  **出荷している解決器そのものを評価して**言語ごとに数え、下向きには動かない。
  散文が写した数は必ず実体から離れるので、測る場所と述べる場所を 1 つにしてある。

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
  詳細と実測値は [`docs/MAP-LAYERS.md`](../MAP-LAYERS.md) §7.10。
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
- **windy.com の配色に合わせてある家族は 5 つ**——風（`wind`・27 点 m/s）・気温（`temperature`・
  23 点 °C）・**気圧（`pressure`・16 点 hPa）・降水量（`precipitation`・17 点 mm）・
  露点（`dew_point`・24 点 °C）**。どれも**宣言表ではなく塗る関数 `RGBA(v)` を標本化して当てはめた**
  もので、最大チャネル誤差は 3/255 未満。⚠ **登録キーは SDK の別名解決 `mQ` が実際に引く名前**
  （`pressure_msl`→`pressure`、`dew_point_2m`→`dew_point`）。`dew_point` は SDK が持たない家族なので、
  これを足すまで**露点レイヤーは気温の配色表で塗られていた**。
  ⚠ 後の 3 つは**初回使用時に組む**（`windyRamp(family)`）——起動時には 1 段も要らない。
  詳細と実測値は [`docs/MAP-LAYERS.md`](../MAP-LAYERS.md) §7.10。
- **等圧線は海面気圧レイヤーの<b>スイッチ</b>である**（独立したレイヤー行ではない）。
  実装は `LAYERS` の行の `sub:'ec-slp'` で、地図側の機構（2スロット交代・`applyTime`・`commit`・
  共有フック）はこの行を今までどおり見る。取り上げるのは**レイヤー欄の行と凡例の箱**だけで、
  それを分けるのが `legendLayers()`。親がオフなら等圧線もオフ、親のモデルを必ず読む（`syncSubs()`）。
  ⚠ **等値線の高度は `&intervals=` で明示する**——SDK は既定で「渡した配色表の breakpoints」を
  高度に使うので、配色表を 1,801 段の勾配にした時点で明示しないと 1,801 本頼むことになる。
  刻みは `ISOBAR_STEP_HPA = 4`（地上天気図の慣習）で、タイルへは `FIELD_UNITS` を通して場の単位で渡す。
- **風の筋（パーティクル）は2つの独立した問いで、2つの独立した既定値を持つ。**
  ⑴ 風レイヤー自身の凡例の「パーティクル」＝**このレイヤーはアニメーションするか**（既定 ON）。
  ⑵ **気温・最大瞬間風速・海面気圧・降水量（予報）**の各凡例の「風のパーティクル」＝
  **その場の上に風を描くか**（**レイヤーごとに独立**・鍵は `intmap_wx_{temp,gust,slp,precip}_parts`）。
  **既定は場ごとに違う**——最大瞬間風速・海面気圧・降水量（予報）は**既定 ON**、気温だけ**既定 OFF**。
  読み手がその場を読む目的が「そこにある気象システム」であるとき（低気圧は渦、前線はシア）に
  筋がその形を読ませるからで、気温は「その地点の値」として読まれるので同じ理由が働かない。
  正本は `PARTS_KEYS`（どの層が訊けるか）と `PARTS_DEFAULT`（鍵が無いときどちらか）の 2 行。
  ☠ **保存された答えは既定より強い、両方向に。** 既定が決めるのは**鍵が無いとき**だけで、
  `'1'`＝オン・`'0'`＝オフ・無し＝既定。箱を**外した**読み手が次の起動で戻されることはない。
  ☠ **降水量（予報）に新しいデータ源は要らない。** 筋が読むのは常に**風の場**（`VAR`）で、
  下に敷かれているラスタが何であるかとは無関係——だから降水のようなスカラー場でも筋を持てる。
  ②は風レイヤーを点けずに筋だけを出すので、`window.Wind` の中では `live() = on || soloOn` が
  「場が要る」を、`streaksWanted()` が「筋を描く」を意味する。**地図の上の2つの色ラスタスロットは
  `on` のまま**——気温の上に風を頼んだ読み手は、風の色を上に乗せてくれとは頼んでいない。
  ☠ **気温だけ既定が OFF なのは、筋が u と v の2変数を読むから**。気温ラスタだけを出している
  読み手がこれまで一度も払っていない読み込みで、箱に触らない読み手にとっては何も変わらない。
  ☠ 2つのモジュールの間を渡るのは**実効値1つ**——`Wind` は筋を1組しか描かないので、
  渡すのは「**箱が入っていて、かつそのレイヤーが on** であるものが1つでもあるか」の OR である。
  押し出す場所は `syncLegend()`＝レイヤーの on/off が変わる経路がすべて通る 1 か所。
  扉は `window._imWxParts(layerId, v)` 1本（`window._imWxTempParts` は気温レイヤーの別名で、
  同じ状態）。凡例の箱・Atlas の
  `{"type":"windParticles","over":"temperature"|"gusts"|"pressure"|"precipitation"}`・返信のインライントグルが
  同じ関数を通る。⚠ **気温の鍵は改名しない**——変えると、これまで箱を入れていた読み手全員の
  設定が黙って消える。
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
- **「日時」の行はタブに属さない**（`#ntl-jump`・`<input type="datetime-local">`・`applyMode` の外）。
  Year / Date / Time の3タブは**それぞれ1つの粒度しか名乗れない**（年スライダー／`#ntl-date`／`#ntl-time`）
  ので、「1943年8月5日14時」はタブを2つまたぐ操作だった。この行は**どのタブでも見え、どのタブでも
  同じ瞬間を書く**——`refreshUI` の3分岐のどれでもなく、その**後**（`buildZones()` の隣）で書き戻す。
  ⚠ **独自のピッカーを作らない。** カレンダーもキーボード操作も日付の並び順もブラウザ自身のもので、
  こちらが足すのは**ネイティブの部品が知り得ない2つ**だけ:
  ⑴ **どのタイムゾーンの壁時計か**（`zFields`/`zInstant`——`datetime-local` の文字列にゾーンは無い。
  素の `new Date(value)` は「端末の 14:30」を意味してしまう）、
  ⑵ **カーネルが受け取る瞬間の範囲**（下限 `IntMapTime.min`／上限 `fcMaxMs()`＝モデルの最終有効時刻、
  無ければ現在。**日付ピッカーの上限も同じ関数から導く**ので、1つのパネルが2つの未来を名乗ることはない）。
  上限を越えて未来を指せるのは `allowFuture` を渡すからで、渡さなければカーネルは未来を LIVE に
  変換する——`max` が届くと言っている時刻に「現在」と答える控えめな嘘になる。
  ⚠ **書き込みは 320 ms のデバウンス。** ネイティブの日付入力はキー入力ごとに**完全な値**を出すので、
  `1990` は 0001 → 0019 → 0199 → 1990 の**4つの瞬間**として届く。加えて**下限より下の年は下限として
  読む**——`new Date(19,…)` は 19 年ではなく **1919 年**で、「実在するが誤った瞬間」になる。
  ⚠ **フォーカスがある間は値を書き戻さない**（キャレットの下で戻される入力は打てない）。`blur` で整合する。
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
  ⚠ **整形そのものは `js/hist-scale.js` の `dateText` が持つ**（年だけを書く `yearText` の隣）。
  `year:'numeric'` は**時代を黙って落とす**ので、紀元前の日付は西暦の同じ数字と**同じ文字列**に
  なる（`ja-JP` で紀元前3000年も西暦3000年も「3000年1月1日」）。⇒ **年が 1 未満のときだけ**
  時代を要求する——常に要求すると `西暦1990年10月2日` になり、読者が持っていなかった語が
  すべての日付に付く。語をどこに置くかは CLDR の答えであって、こちらの表ではない。
  ⚠ 持ち主に置いてあるのは、DOM の閉包の中の算術は**何も評価できない**から（同じ理由で
  `js/chronos.js` の `ymdISO` もここを読む）。
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
  **描くのは、各衛星の軌道要素がその瞬間について述べるときだけ**（`_elementSpan`：元期の前後に、平均運動の帯
  ——低軌道・中軌道/高楕円・静止——ごとの幅。幅は同梱カタログの履歴から SGP4 の誤差を実測して決めた値で、
  表・基準・失効条件は `js/satellites-live.js` の註が正本）。国際標識の打ち上げ年より前も描かない。範囲の外は
  計算もしない（2026 年の要素を 1914 年へ遡らせた位置はどの典拠も述べていない）。カタログ全部が範囲の外なら
  凡例が「この日時の軌道要素はありません（手元の要素が述べるのは 〜）」と述べ、行の状態は `nodata`
  （`js/layer-state.js`、Atlas は `layerStates` で読む）。次回通過の探索も要素の範囲で止まり、止まったことを述べる
  （`limited`）。
  **同じ瞬間の伝播は 1 回だけ**（`propagateAll` が最後の答えを「カタログ（`sats` の同一性）＋瞬間」と
  一緒に持ち、両方が同じなら返す）——時計が止まっている間、tick・`moveend`・時計の購読者は同じ瞬間を
  訊く。⚠ 伝播の費用は瞬間が要素の元期から遠いほど増える（satellite.js 7.1.0 は深宇宙の積分器の状態を
  呼び出し間で保たず、毎回元期から 720 分刻みで積み直す）。実測は
  `dev-notes/2026-10-01-restored-layers-under-load.md`。
- **年セレクタは層の上にもある**（`window._legendClockYear` — `js/data-layers.js`）。1人当たりGDP・
  人口密度・合計特殊出生率・国防費・国防費対GDP・HDI・貿易フロー・エネルギー構成・作物の凡例に年
  セレクタがあり、**`window.IntMapTime` を読んで書く**。行は自分の年を持たない。
  範囲は各出典自身のもの（Maddison 1850–／世界銀行 1960–／BACI 1995–2024／OWID は読み込んだ CSV から実測）。
- ⚠ **「最新値」で塗った塗り分けは比較になっていない**（各国の最新の非欠測年が違う）。全系列を取り、
  1年ずつ描く。既定は**被覆が最大の90%以上ある中で最も新しい年**で、凡例に年と報告国数を出す。
- **HDI は UNDP の年次系列**（`data/hdi-series.json`、`scripts/build-hdi.mjs`、193か国 × 1990–2022）。
  `js/time-countries.js` がマスタークロックに重ね、`window._imHdiYear` が**画面に出ている年**を持つ。
  1990 より前は `null`、最後の公表年より後はその列。凡例の年は**タイマーではなく `_imReapplyChoros`**
  （重ね合わせの後に走る再描画）から書き換わる。
- **国境・国家も時計に従う**（`js/time-borders.js` / `js/history.js`）。歴史 GDP・人口はマディソン・
  プロジェクト（`data/maddison.json`・**1850–2018**、`scripts/build-maddison.mjs`）。歴史的国家のクリックは
  **当時の名称・当時の記事**に解決する（現代のページへは決して飛ばさない）。
  翻訳表への登録とは独立に、出典の名称を歴史地物の身元として保持する。クリック地点から対応する
  現代国家を統計参照用に見つけても、その国家の名前・記事・旗で歴史地物を上書きしない。
  時代→記事の表は**各政体の実際の開始年**で始まる——「窓の下限」を開始年として書かない。⚠ この規則は表の**全行**に
  かかり、検査は表そのものを読む（名指しした一部の行だけを見ない）。1900 で始まってよいのは**その年が
  本当に開始年である行**だけで、その行は理由付きの許可リストに載る。
- ⚠ **地図の国名ラベルと Countries 一覧は、同じ「その年の身元」を出す。** 二つは別のリスナーが
  別の速さで作る（`js/time-borders.js` は時計の 45 ms 後、`js/time-countries.js` は 340 ms 後＋
  国別表・マディソン・HDI の await）ので、**ラベル側は `countryStats` の改名を読まない**——
  `IntMapHistId.at(code, year)` と `IntMapHistStates.activeAt(year)` という**年だけの関数**に訊く。
  改名が当たっている国の**現代名**は `IntMapHistId._applied()` から取る。適用する年の範囲は
  一覧側と同じ式（マディソンの下限）で、片方だけが改名する年を作らない。
  旧国家は `IntMapHistStates.hbRe(code)` でポリゴン名に結ぶ——クリック経路と**同じ対応表**なので、
  1916 年の «Russia» は地図でもクリックでも「ロシア帝国」になる。
  `countryStats` がまだ届いていない回のために、`js/time-countries.js` は身元が変わるたび
  **`intmap-hist-identity`** を投げ、ラベルは表示中のスナップショットを**貼り直す**（札が動いたときだけ）。
- ⚠ **昔の国名ラベルは、国境ポリゴンとは別の点ソース（`imtb-lbl-src`）から描く。** ポリゴンに
  `symbol-placement:'point'` を当てると、レンダラは**外環ひとつにつき1個**ラベル候補を作るので、
  ラベルの数が国の数ではなく**島の数**になる。`js/time-borders.js` の `_labelFC()` が、境界を書くたびに
  `imtb-src` から **1 identity（`NAME`）＝1 Point** を作り直す。点はその地物の properties をそのまま持ち、
  アンカーは**最大の部分**の pole of inaccessibility（geometry ごとに `WeakMap` で記憶）。
  点の properties は**写し**で、共有すると `_sourceHolds` が「変わっていない」と判定して書き込みが
  飛ぶ。候補が1つになったぶん、2層は `text-variable-anchor` で**写しを増やさずに置き場所を増やす**。
  **置く順は面積**（点の `_sort`＝その名前の最大の部分の面積の常用対数の符号反転。区分名の
  `js/time-admin1.js` `sortKeyOf` と同じ鍵）で、可変アンカーで逃げた小国の名前が大国の名前の場所を
  奪わない。**歴史の区分名（`imta-lbl` / `imta2-lbl` / `imta3-lbl`）も同じ関数に訊く**——`labelFC(fc, keyOf, true)`
  が単位（行）ごとに選んだ部分を多角形で返し、`imta-src` にはそれだけが載るので、レンダラの候補は
  島の数ではなく単位の数になる（pole の探索はレンダラの worker が行う）。
  レイヤーの見た目・クリック・パディング付きタップ・`applyLabelLang()` の塗り直しは変わらない。
  詳細と実測値は [`docs/MAP-LAYERS.md`](../MAP-LAYERS.md)。
- **現代名の記載がない歴史地名も、出典自身の地点として描く**（`js/hist-places.js` の
  `window.IntMapHistPlaces`）。`scripts/histplaces/pleiades-record.json` の固定した出典記録を
  `scripts/build-hist-places.mjs` が検査・変換し、`data/hist-places.json` に **6698地点・12646件の
  年代付き名称記録**を収録する。Pleiades が CC BY 3.0 を明示し、集落型・代表点・日付付き名称を
  持ち、出典を取得した年より前に終わる名称を含むレコードが対象。現代名の有無で除外せず、
  都市名変更に実収録された出典IDだけを重複除外する。**現代名の不記載は廃絶の証拠ではない。**
  既存の都市名変更データとは独立し、同じ Pleiades ID が既存の都市名変更に入っていればそちらを優先する。
  座標の近さや同名だけで別の出典レコードを消したり、現代都市の名前を変更したりしない。
  名称に付いた期間は**出典の概略の時代区分で、創建・廃絶の年代ではない**。負数の出典年は
  通常の紀元前年なので `IntMapHistScale.fromEra()` を通して時計の天文年と比較する。上流が
  Paleolithic などの広い期間を持つことは、Chronos の下限や国境スナップショットを広げる根拠にしない。
  座標は**出典の代表点**で、実際の遺跡位置から離れる場合がある。原綴り・転写・言語コード・
  出典の疑問符を保持し、カードに期間と位置の限界、当該 Pleiades 記録へのリンク、帰属とライセンスを出す。
  データは Chronos が現在を離れたときに遅延取得する。地名の表示切替・縮尺・配色は既存の都市ラベルに従い、
  現在へ戻ると隠す。`state()` は取得状態・年・対象件数・表示状態・出典・精度上の注意だけを返し、
  Atlas の時間領域へ地点データ全体を渡さない。解除時は取得中断・購読解除を行い、遅着した応答を採用しない。
- **地図の上のカード（`.plc-popup`）のボタンの色はカードが持つ**。`css/intmap.css` の
  `:where(.plc-popup .maplibregl-popup-content) button` が地（`--input-bg`）と字（`--text-main`）をカードの面から与え、
  特定度は素の `button` と同じなので、クラスやインラインで別を言うボタンはそちらが勝つ。カードを描くモジュールの
  stylesheet が後から（あるいは一度も）来なくても読める（マイマップの「編集」は、パネルを開く前にピンを押すと
  ダークテーマで白地に白字だった）。`tests/map-next.spec.js` が WCAG のコントラスト比で両テーマを測る。
- **出典別の地名カードも、クリック判定は共通の入口を使う**。`js/map-ui.js` の
  `IntMapPlaceReaders.register(layerId, {open, close})` が、直接クリック・パディング付きタップ・
  ホバー・クリックの優先関係・カードの終了を既存の地名と同じ経路へ登録し、解除関数を返す。
  `imhp-lbl` はここへ出典IDで読むカードを登録し、別のクリックハンドラや現代地名検索を持たない。
  面の説明など、他の対象に譲るハンドラは GeoEngine 登録時に `ownership:'fallback'` を宣言する。
  `clickLayers({ownersOnly:true})` が排他的な所有者を返すので、背景の説明用の面が地名を塞がない。
  同じ層に排他的なハンドラが併存する場合は、その所有権を保持する。
- **都市名ラベルも時計に従う**（`js/hist-cities.js` の `window.IntMapHistCities`・記録は
  `scripts/histcities/` → `data/hist-cities.json`・**6474都市／9246の歴史名**・125か国）。
  開始時期が出典にない歴史名には `[?]` を付け、Chronos に意味を表示する。日付を推定して埋めず、元の名称を記録に保持する。
  歴史名を現代ラベルへ対応付ける名前は、同じ地物について出典が述べる名前から導く。
  近隣のGeoNames地点を見つけたことだけでは、その地点の都市名を対応先へ追加しない。
  出典が複数の新旧名を同じ地物へ結び付ける場合は、その名前と位置から同一性グラフを作り、
  入力順に依存せず名称履歴を統合する。遠方の同名都市や、裏付けのない近隣都市名は統合しない。
  ⚠ **手書きの記録と、上流から導出した記録の和集合である。** 手書きの 611 行は 1 件も落とさない
（`--check` がそれを測る）——実測で、上流に同じ都市・同じ名前・同じ期間があるのは 4 割で、置き換え
れば 6 割が消える。導出は Wikidata（CC0・恒久 ID は QID・**日付精度を保持**）と Pleiades（CC BY 3.0・
古代）と OpenHistoricalMap（CC0・中世〜近世）から。⚠ **OHM の記録は「同じ座標に別ノードを積む」形なので、
同一性の規則が要る**——250 m 以内のノードは同じ場所として束ねる。
⚠ **OHM は集落を点でも輪郭でも描くので、掃引は両方を訊く**（`scripts/histcities/harvest.mjs` の
`OHM_PLACE_KINDS`）。点は 6 桁あって全球 1 問では応答しないので緯度経度のタイルに割るが、
`place=city|town|village|hamlet` の way / relation は全球で 1,489 件（うち名前と年代の両方を持つのが
1,425 件・2026-09-13 実測）なので 1 問で足りる。**受け側は最初から輪郭の重心 `center` を読んでいたのに、
訊いていたのは点だけだった**——その半分は一度も走っていなかった。
⚠ `place` の白名簿が 4 値なのも実測された拒否で、理由は生成器側に書いてある
（`suburb`・`neighbourhood`・`locality` ほかは名前と年代を持つものだけで 37,611 件あるが、
それらは**集落ではなく集落の中の区画**で、実測された誤りは「1850 年の鹿児島＝平之馬場町」）。この規則は使う前に OHM 自身の
`wikidata` タグで検証してある（2 件以上のタグ付きノードを持つ束の 91.1% が単一の主体、複数ノードを持つ
主体の 87.0% が 1 つの束に入り、束の 96.9% が重なりの無い年表）。除外は OHM 自身の申告に従う——
`*:confidence` / `*:source=arbitrary` / `*:fixme` / `*:edtf` と、CC0 以外の `license` タグ。
⚠ **9 言語完備を要求するのは手書きの行だけ**
普通で（導出 8,096 span のうち韓国語は 219 件、繁体字は 51 件）、無いものを英語で埋めれば捏造になる。
  ⚠ **ただし、同じ場所の 2 つの span が同じ名前を述べているなら、互いの言語欄を使ってよい**——
  綴りの一致は表ではなく尺度（`sameName`）で判定する。これは順序を 1 つも変えないので、日付の
  正しさを 1 件も失わずに「読めない名前」を実測 324,259 → 107,930 件に減らす。
  ⚠ **そして、中断なく続いた 1 つの名前は 1 つの span である**——OHM は改称ではなく**行政上の
  出来事ごとに**ノードを立てるので、Nálepkovo は「Merény 1450–1724・1725–1871・1872–1918」で
  届く。**間が空いていない**ものだけを畳む（225 span・都市 180 件）。読者に見えるものは変わらず、
  変わるのは「歴史名がいくつあるか」という、どの文書も引用している数のほうである。
行ごとの `a` がどの言語に実物があるかを持つ。
  ⚠⚠⚠ **そして、ビットが立っていない言語には欄そのものが無い。** 束は `a` が「誰も書いていない」と
  言っている隣で、**英語綴りの写しを 9 欄すべてに置いていた**——実測 83,214 欄のうち 75,936 欄
  （91.2%）がビットの立っていない欄で、そのうち **67,622 欄が英語欄とバイト同一**だった。
  `js/hist-cities.js` の解決は `n[lang] || n.en` なので、写しは元から `en` を答えており、
  **読者に見えるものは 1 文字も変わらない**（3.05 MB → 1.62 MB・gzip 681 → 414 kB）。
  ⚠ 落とすのは**写しだけ**——ビットの立っていない欄のうち英語欄と**違う綴り**を持つ 362 欄
  （同じ場所の別 span から共有された綴り）はそのまま残す。
  ⚠ **その `en` は「英語名」ではなく記録自身の綴りである。** **537 span はラテン文字ですらない**
  （1403–1913 年の北京は 順天府、1639–1910 年のウランバートルは Өргөө、1453–1923 年の
  イスタンブールは Цариград）。**代わりを選べるかは実測した**——この 537 のうち、同じ瞬間を覆い
  英語または日本語で実証されている span を持つのは **11 件だけ**で、**うち 9 件の相手は開始日を
  述べていない**。だから言語ごとに退かせると、日付の根拠が無い名前をその年へ戻すことになる
  （過去に二度、検討のうえ退けた道である）。⇒ **振る舞いではなく主張のほうを直し**、件数はファイル自身の
  `note` が述べ、`check:histcities` がラチェットで抑える。
  1942年のヴォルゴグラードは**スターリングラード**、1867年の東京は**江戸**、1960年のサンクトペテルブルクは
  **レニングラード**。⚠ **層を足していない**——`ofm-city` の `text-field` を `match` で包み、**既定は
  従来の言語式そのもの**なので、記録に無い地名は1バイトも変わらず、記録にある都市は**タイル自身が選んだ
  位置**にそのまま出る（衝突処理もズーム段も従来どおり）。
  ⚠ **判定はクロックであって国境層ではない**——`IntMapTimeBorders.active()` は CShapes が2019年で終わる
  ため2020年以降 false になり、2022年の改名（ヌルスルタン→アスタナ）が永久に出なくなる。
  ⚠ **適用先は `ofm-city`（`class in [city, town]`）だけ**。
- ⚠⚠ **式を作り直すのは、名前の期間の境目を跨いだときだけ**（エポック）。式は「その瞬間を含む span の
  集合」だけの関数で、各 span への問いは `d >= f` と `d <= t` の 2 つだけなので、答えが変わりうるのは
  `f` と `t + 1`（整数。暦日でなくてよい）に限られる。`js/hist-cities.js` はこの境目を
  `data/hist-cities.json` から導き（手で年を並べない）、キャッシュの鍵を「境目をいくつ越えたか」＋言語＋
  基底式にしている。同じエポックの中の移動では**同じ配列そのもの**が返り、`js/place-labels.js` は
  スタイル層ごとに最後に書いた配列を覚えていて、同じ配列なら `setLayoutProperty` を呼ばない
  （MapLibre は同値でも保持値を複製して深い比較をするので、大きな式では 1 回ごとに費用がかかる）。
  ⚠ **境目を跨いだ移動は 1 回の書き込みで、そのたびに MapLibre が式を解析する**——現在の年から過去へ
  出る最初の移動も必ず境目を跨ぐ。その解析を小さくしているのが次の 2 点：
  ① **候補群ごとの `case`（距離の判定）は 1 回だけ書く。** 同じ綴りの候補群を `let` の束縛にし、
  `name:en` の `match` と `name` の `match` はどちらも `['var', …]` でそれを指す（MapLibre の `var` は使われた
  場所で評価されるので、地物が訊くのは自分の綴りが選んだ群のガードだけ）。どちらの群にも当たらなければ
  `''` を返し、`name:en` の答え → `name` の答え → 通常のラベルの順に取る。1916-07-01 で
  1,207,908 → 874,655 バイト、`distance` 7,954 → 3,977 個。
  ② **この式に限って `{validate:false}` で書く。** MapLibre の API は検証の省略を「先に検証済みの値」に
  限っており、その検証は検査がする（下）。`js/hist-cities.js` の `built(expr)` が「自分が作った式か」を答え、
  `js/place-labels.js` はそれが真のときだけ第 4 引数を渡す（facade とアダプタは素通し。§1.2 の命令の集計の項）。
  同じページで 1 回の変更を測って（2026-09-26）、266–461 ms → 30–57 ms（CPU 4 倍絞りで 1.2–1.6 s → 0.15–0.23 s）。
  検査は `tests/hist-city-label-epoch-checks.test.mjs`（記録から選んだ境目の両側で、移動してきた
  モジュールの式が新規に作った式とバイト同一・同じエポックでは同一の配列・MapLibre の評価器で
  全都市が記録の規則どおり・MapLibre のスタイル検証器 `validateStyleMin` を通る・`built` はその式だけを指す）、
  `tests/history-cities-checks.test.mjs` ④（式の形: どの分岐も位置で問い、落ちる先は通常のラベル）と
  `tests/hist-city-label-epoch.spec.js`（実アプリで書き込み回数と `{validate:false}` を数える）。
- ⚠⚠⚠ **どの都市を改名するかは、綴りではなく綴り＋位置で決まる。**
  各行は**ガード半径**（`data/hist-cities.json` の `g`・メートル）を持ち、`match` の各分岐は
  **MapLibre の `distance` 式**で「この地物は行の座標から半径内か」を訊く `case` になっている。
  半径外なら era 名を取らず、元のラベルへ落ちる。⚠ **座標は位置決めには使わない**（ラベルは
  従来どおりタイル自身の位置）が、**どのラベルを対象にするかはこの座標が決める**ので、
  座標の誤りは「静かに出なくなる」形の欠陥になる。
  ⚠ `distance` はシンボルのレイアウト計算（worker）で評価され、geometry と canonical tile が
  揃っている。揃わない場合の戻り値は NaN なので、比較は false になり**元のラベル**へ落ちる
  ——壊れ方の向きが「別の都市の歴史を出す」ではなく「歴史名が出ない」側である。
- **ガード半径は書かずに導出する**。`scripts/build-hist-cities.mjs`（`npm run check:histcities`）が、
  **同じ綴りを自分の名前として持つ地球上で最も近い集落までの距離の半分**（上限 20 km・下限 6 km）を
  各行に与える。だから**自分の同名都市に届く半径を持てる行は存在しない**。実測では 611 行中 600 行が
  上限、5 行が同名の集落に合わせて狭まる（アルマヴィル 4.1 km・トルクメンバシ 6.7 km・イーニン 8.5 km・
  アボヴャン 12.8 km・ホルビウカ 14.6 km）。
- ⚠ **下限 6 km は「誰も実測していない行が受け取る既定値」であって、法ではない。**
  記録の座標とタイルが実際に描くノードの差はオフラインでは分からず、実測で最大 6.68 km（東京）
  だったので、この数字は**他の行の最悪値**から来ている。自分の差を実測した行は
  `{ measured: { km, on, why } }` を書いて下回れる（ビルドはガードが実測値の 3 倍以上あることを要求する）。
  ⚠ ただし **2 km の硬い下限**はどの実測でも越えられない——`ofm-city` の minzoom 3 では
  タイル自身の量子化が ±0.61 km あり、それ以下の半径は丸めが決めることになる。
  現在この宣言を持つのは**アルメニアのアルマヴィル 1 行**（8.2 km 南に同名の村がある。
  2026-09-07 実測でタイルのノードは記録座標から 0.09 km、村のノードは 7.97 km）。
- ⚠ **その証拠は `data/histcities-homonyms.json.gz`（`scripts/build-histcities-homonyms.mjs`）であって、
  `data/gazetteer-world.json.gz` ではない。** 後者はニュース地名解決のために **同名なら人口の多い方だけを
  残す**設計で、「他に同名の都市があるか」を訊く相手としては**答えを先に消してある**
  （カルーガ州の Kirov も ニュージャージー州の Linden もそれで欠けていた）。前者は GeoNames
  **cities500** を、記録が使う綴りに限って**重複排除も除外もせずに**保持する。
  さらに `check:histcities` は ① 座標が GeoNames の当該集落から 10 km 以内であること
  （4行の座標誤りがこれで見つかった）、② ガードの中に別の集落が入らないこと、
  ③ 入るのが双子都市（ヴァルガ／ヴァルカは 1.2 km）なら `{ key, place, cc, why }` の**waiver** が
  あり、かつ**その綴りが今も相手の別名欄にしか無いこと**——を要求する。
  waiver は恒久免除ではなく**毎回試される主張**で、GeoNames が相手の `name` に昇格させたら落ちる。
- ⚠ **旧国家の名前はタプルであり、読み手は `window.IntMapHistName(name, slot)` の1本だけ。**
  `IntMapHistStates.STATES` の `name` は `IntMapLang.pickArgs()` が返す**配列**なので、
  `name.en` / `name.jp` は常に `undefined` になる——`{nameEn, nameJp}` の記録を組む場所
  （`js/history.js` の `agg` と `apply`、`js/stats-compare.js` の `_histMini`）は全部この共有関数を
  通す。**タプル自身は `name` に載せたまま**運ぶので、言語ごとの解決は下流でも効く。
  `countryStats` がその旧国家を持っていない状態——**現在へ戻った直後**（`js/time-countries.js` の
  `restore()` が項目を消し、開いている比較パネルは 380 ms 後に描き直す）・**その国家が存在しない年**・
  **セッション復元**——でも、比較パネルはこの記録から名前と旗を出す。
- **消えた国は、現代の後継国に分解して並べない**（`js/history.js` の `IntMapHistStates`）。存続期間は
  本物なので、年が変われば行も変わる: オーストリア帝国（1804–1867）→ オーストリア＝ハンガリー
  （1867–1918）／朝鮮（–1897）→ 大韓帝国（1897–1910）→ 大日本帝国（1910–1945）／東インド会社（–1858）
  → イギリス領インド帝国。⚠ **改名だけでは足りない**——現代の後継が2つ以上ある国は、集約しないと
  「まだ存在しない国」が一覧に並ぶ。
  ⚠ **後継国を隠すのは、その国家が実際に保有していた期間だけ**。`succ` の各要素は `held` で
  自分の窓を持てる（既定は国家の存続期間そのもの）。ソ連の行は 1922 年に始まるが、ラトビア・
  エストニア・リトアニアは 1940-06-01 まで独立国だったので、それ以前の年は **3 行とも一覧に並ぶ**。
  窓の日付は `data/cshapes.js`（地図が描く国境の出典）から取る——**一覧と地図が別の日に切り替わらないため**。
  隠す集合・集計する集合・地図のラベルが使う被覆集合は、すべて
  **`IntMapHistStates.succAt(S, date)` という 1 つの式**から出る。
  ⚠ **窓を持たない後継国もある**——モルドバは 1940 年までルーマニア領であって独立国では無かったので、
  窓を与えれば存在しない国が一覧に出る。窓は「この後継国はそのとき**自分の国**だった」の意であって、
  「この国家がその土地を持っていなかった」の意ではない。
- ⚠ **国詳細カードの6欄は「取りに行く」ものではなく、同梱している**（`data/country-facts.json`）。
  首都・通貨・言語・**隣接（陸の国境）**・**時間帯**・**国連加盟**の6つは、以前は
  `enrichCountry()` が **restcountries.com** へ毎カード投げていた。その API は撤去されている——
  `/v3.1/alpha/<ISO3>` も `/v3.1/all` も `/v5/alpha/<ISO3>` も、261 バイトの廃止通知1枚へ 301 され、
  **その 301 に `Access-Control-Allow-Origin` が無い**（ブラウザは CORS として報告する）。v5 は
  アカウントと bearer key を要求するので、**URL を書き換える先も、中継する先も存在しない**。
  ⇒ 6欄は `scripts/build-country-facts.mjs` が**ビルド時に**作り、ブラウザは同一 origin の
  `data/country-facts.json` を**カードを開いたときに1度だけ**読む（起動費用は 0）。
  上流は **mledoze/countries（ODbL 1.0・restcountries 自身の上流）** と
  **IANA time-zone database（public domain）**、鍵は `js/countries-ui.js` 自身が導く
  `ISO_A3_EH || ISO_A3 || ADM0_A3`（ISO 3166-1 ではない——app が計算しない鍵は読めない鍵）。
  ⚠ **失われていたのは Neighbours と Timezones の2行では済まない。** 3欄は `js/tables.js` の
  手書き表の**穴埋め**で、ne_10m の 252 コードに対し **CAPITAL が 60・CURRENCY が 100・
  LANGS が 115** 欠けている。それらのカードは API が死んで以来ずっと「—」を出していた。
  ⚠ **「答えが無い」を「空の答え」と同じ値にしない。** `catch(e){}` が失敗を
  飲んでいたので、`sec()` が null の行を落としたカードは「隣国が無い国」と見分けがつかなかった。
  いまは `window.IntMapCountryFacts.state`（`idle` / `loading` / `ready` / `failed`）と
  `.error` が値として残り、**失敗は「試した」として記録されない**ので次のカードで retry する。
  ファイル自身も `withoutTimezone` で「行は在るが tz が無いコード」を名指す（IANA が区域を
  割り当てていないコソボと、無人の Heard & McDonald の2件）。
  ⚠ **上流の誤りは訂正としてデータに書く**（`data/subcable-overrides.json` と同じ規則）。
  バチカンは常任オブザーバーであって国連加盟国ではない（加盟国は 193）。スリランカとインドの
  間にあるのはポーク海峡であって陸の国境ではない——生成器の対称性検査が見つけた唯一の非対称。
  ⚠ **生成器は、2つのコード体系が食い違い始めたら止まる。** Natural Earth の 252 と mledoze の
  250 の差（NE 側 13・ISO 側 11・コソボは別名で解決）は**宣言**されていて、実測と一致しなければ
  ビルドが失敗する——黙って何か国か足りないファイルを書くのが、このラウンドが消した欠陥の形。
  検査は `tests/shell-data-layers-checks.test.mjs`（出荷される module を Node で実行してカードの HTML を読む）と
  `tests/r424.spec.js` の末尾（ブラウザで同じ3行）。
- ⚠ **国名の下のサブ行（`.stat-sub` ＝ `region / capital`）の region は、産地が2つある。**
  一覧の行と、行をダブルクリックして開く国詳細カードの Region 行は、どちらも
  `js/countries-ui.js` の `_regionName()`（`pickArgs()` の5引数＋4言語の inline 表）を通る。
  表の鍵は**2つの語彙の和集合**で、片方だけでは足りない:
    · **Natural Earth の CONTINENT ＝ 8種**。7大陸に加えて `Seven seas (open ocean)` があり、
      これは既定の起動が読む `ne_110m` で **ATF（フランス領南方・南極地域）**が持つ実在の行の値。
      `ne_50m` / `ne_10m` ではモルディブ・モーリシャス・セーシェル・セントヘレナ・BIOT・
      南ジョージア・ハード島・クリッパートンも同じ値を持つ。
    · **`js/history.js` の `STATES` が持つ準大陸の語彙** ＝ `Eurasia` / `Middle East` /
      `South Asia` / `Southeast Asia` / `East Asia`。大陸は1つも含まない。
  ⚠ **表に無い値は生の英語のまま9言語で出る**（`_regionName()` は引数をそのまま返す）ので、
  `tests/news-countries-checks.test.mjs` ①② が「`js/history.js` が宣言する `region:` の literal 全部」と
  「Natural Earth の8種」の両方が鍵になっていることを検査し、④ が `js/lang-registry.js` と
  4本の inline 表を**実行して** 9言語ぶんの解決結果を確かめる。
  ⚠ **首都は地名なので訳さない**——現代の行は `CAPITAL[code]`（«Washington, D.C.»）、歴史の行は
  `_STINFO`（«Tokyo»）で、どちらも英語のまま出る。一覧のサブ行で訳されるのは region だけ。
- ⚠ **国詳細カードの Region 行は `region / subregion` の2欄で、subregion にも表がある。**
  `js/countries-ui.js` の top-level が公開する **`window._imSubregionName(sub, lang)`**（`pickArgs()` の
  5引数＋4言語の inline 表・`IntMapLang.t(lang, …)` で解決）が、**Natural Earth の SUBREGION ＝
  24種**を持つ。`ne_110m` は22種、`ne_50m` / `ne_10m` が `Micronesia` と `Polynesia` を足す。
  どの縮尺にも**空の SUBREGION は1件も無い**ので、`enrichCountry()` のこの欄のフォールバックは
  実際には通らない（CONTINENT と同じ）。**その測定に従って、`region` / `subregion` の
  フォールバック行そのものが消えている**——上の同梱データの項を見ること。
  ⚠ **表は1本で、読み手が2つある。** `js/atlas-examples.js` の starter chip の `{sub}` は
  `window._imSubregionName(…)` で**同じ表**を読む。同じ語彙の写しを面ごとに持つと、直るのは
  片方だけになる。`tests/news-countries-checks.test.mjs` ⑩ が `js/*.js` を数えて、この24語を宣言する
  ファイルが**ちょうど1本**であることを検査する。
  ⚠ **`export` ではなく `window` で渡す。** `js/countries-ui.js` は複数の検査ハーネスが
  `new Function(src)` で**素のスクリプトとして実行**して、本物の `_mkStat` と 10 m 昇格パスを
  合成 feature に対して走らせる（`tests/news-countries-checks.test.mjs` の該当する検査など）。`export` を1語
  足すとそれらが全部 SyntaxError になる。同じファイルの `window._imCldrRegion` が同じ理由で
  window に載っている。⑩ がこの性質（script として parse できること）を直接検査する。
  ⚠ **2欄が同じ語になったら1つに畳む**。`North America`/`Northern America`・`South America`/
  `South America`・`Antarctica`・`Seven seas (open ocean)` の4組は同じ場所を指し、英語以外の
  8言語では訳が**完全に一致する**（英語だけ `North America` と `Northern America` が別語）。
  比べるのは**解決後の文字列**で、英語の鍵ではない。
- **インターネットの健康状態**（`js/net-health.js`・レイヤー行は **2本**・どちらも既定 OFF）。
  `dl-nethlth`（インターネット障害＝国／地方を「その回線自身の直近の通常水準からの低下率」で塗る）・
  `dl-netreach`（ネットワーク到達性＝切断を報告している測定プローブを点で置く）。
  **行の順序・id・色見本・名前・IntMapOS のラベルを書く場所は `ROWS` ただ1つ**で、測定側
  `js/net-health-live.js` は凡例の見出しをそこから読む。⚠ **観測網の正本はその `PROVIDERS` 表**
  ——どの計器が存在するかは**上流の応答の `datasource` から発見**するので、このアプリは計器名を
  1つも書いていない（`tests/layer-net-health-checks.test.mjs` ⑦ がそれを測る）。⚠ **中継を1本も足していない**
  ——3つの観測網はすべて読者のブラウザが直接読み、当方は保存も再配布もしない（RIPE の規約が
  再配布を禁じているので、これは性能ではなく条件の話）。⚠ **上流は打ち間違いと「障害ゼロ」に
  同じ応答（200／`data:[]`）を返す**ので、範囲は `/entities/query` が実体を返したときにだけ使い、
  返さなければ `unsupported_scope` と言う。範囲→地物は国が Natural Earth（`ISO_A2_EH`→`ISO_A2`）、
  地方が `js/atlas-admin1.js` の `resolveMany()`（実測 97.9% 結合・残りは第一次行政区画ではない
  ものなので**拒んで数える**）。詳細と、採用しなかった候補の実測は
  [`docs/INTERNET-HEALTH.md`](../INTERNET-HEALTH.md)。
- **戦争の日ごとの勢力**（`js/war-fronts.js`・レイヤー行は **6本**・すべて既定 OFF）。
  `dl-ww1`（第一次世界大戦）・`dl-ww2`（第二次世界大戦）・`dl-korea`（朝鮮戦争）・
  `dl-vietnam`（ベトナム戦争）・`dl-mideast`（中東戦争 1948/56/67/73）・
  `dl-yugoslavia`（ユーゴスラビア紛争）。その日の**支配（面）・戦線（線）・進行中の作戦（点と名前）**
  を描く。**行の順序・id・色見本・名前・IntMapOS のラベルを書く場所は `ROWS` ただ1つ。**
  面は保存していない——**戦線の線で国の輪郭を切って導く**（`js/war-geom.js`）ので、線と面が
  食い違いようがない。記録は `scripts/wars/`、ビルドと検証は `scripts/build-wars.mjs` →
  `data/wars.json`。**実装の詳細は [`docs/MAP-LAYERS.md`](../MAP-LAYERS.md) §7.12 が正本。**
  ⚠ **位置の記録がある日付にだけ線を引き、次の日付まで保持する**（凡例がその線の日付を出す）。
  滑らかに見せるための補間はしない。
  - ⚠ **時計は2つあり、繋がりは片方向。** 凡例が**その層自身の日スライダーと再生**を持ち、それらは
    Chronos を**読むだけ**で書かない（再生が主時計を進めると、100 ミリ秒ごとにニュース・国境・
    昼夜境界・全統計が動く）。逆に **Chronos を動かせば層は追従し、再生中なら再生は止まる**。
    層を ON にした瞬間だけは、**時計が期間外なら開戦日へ1回動かす**——**読者が点けたときだけ**。
    共有リンク／セッションの復元が点けた行と、地図自身が送り直した `change`（自己修復の off→on など）は時計を動かさない
    （時刻は復元が述べる。`docs/architecture/08-ui.md`）。
  - **層が描く窓は `span`**（ビルドが `from`/`to` と記録の両端から導出する）。戦闘の外へは最大
    120 日まで許し、それより外は拒否する。⚠ **出荷されているのに一生画面に出ない行を作らせない**
    ための規則である。
  - **作戦の種別は9種**（`battle` / `naval` / `air` / `siege` / `landing` / `political` /
    `conference` / `atrocity` / `uprising`）。**色と9言語名の正本は `scripts/wars/lang.mjs` の
    `KINDS` 1か所**で、そのまま `data/wars.json` に載り、層は**出荷された表から**円の色と凡例を
    作る。語彙に無い綴りはビルドが拒否する。
  - **作戦は投入兵力 `str` と死傷・捕虜 `cas` を持てる**（整数、または出典が割れているときは
    `[低, 高]`）。**いずれも「一般に引用される両軍合計」**であり、表示側がそう明記する。
    円の半径は `cas` から決まり、**数値の無い作戦は基準の大きさで描いて隠さない**。
  - **収録範囲**（戦線 / 日付入りの線 / 作戦 / 領域）: 第一次大戦 **9 / 85 / 195 / 124**、
    第二次大戦 **12 / 109 / 313 / 156**、朝鮮戦争 **1 / 19 / 40 / 20**、
    ベトナム戦争 **3 / 11 / 44 / 10**、中東戦争 **7 / 22 / 33 / 11**、
    ユーゴスラビア紛争 **5 / 8 / 30 / 4**。地名辞書は **865 件**。
    作戦は合計 **655 件**で、うち **死傷・捕虜の数値を持つのが 330 件・投入兵力が 206 件**。
    ⚠ **中東戦争は数値を1件も持たない**——この4戦争の公表値は当事国間で桁が割れており、他の戦争と
    同じ体裁で並べれば同じ確からしさを装うことになるから。**数値が無いことは、記録がそう言っている
    ということである。**
    戦線は西部・東部・イタリア・マケドニア・シナイ＝パレスチナ・
    **セルビア（1914）・コーカサス・メソポタミア・ルーマニア**（WW1）、ポーランド・フランス・東部・
    フィンランド・北アフリカ・イタリア・西部（1944）・中国・**ノルウェー・ギリシャ＝イタリア・
    バルカン（1941）・ビルマ**（WW2）。
  - ⚠ **太平洋には戦線を引かない**——線が存在しなかったから。島嶼戦は「どの場所がいつ手を変えたか」
    であり、それは `control` と `events` が持つ形そのものである。したがって**太平洋の記録は作戦の
    集合そのもの**で、第二次大戦の作戦のうち**東経100度以東・南緯12度〜北緯45度の箱に入るものが
    71 件**あり、1939–45 の各年に分布する（この箱は検査が測っている範囲そのもの）。
  - **戦役が終わった戦線は `until` で切る**（その日から国は control が示す一色に戻る）。
  - ⚠ **`scripts/wars/places.mjs` の地名は、線・作戦・照合のいずれかから必ず引かれている。**
    どこからも引かれない地名は「書かれなかった戦役」の印なので、ビルドが拒否する。
    戦域ごとの地名表は `places-<戦争>.mjs` に分かれ、`places.mjs` がそれらを1つの表に束ねる。
  - ⚠ **輪郭が「その日の姿」でない戦争がある。** 面は保存せず CShapes の国輪郭を切って導くので、
    輪郭が古い／新しいままの日は、戦線を書かなければ**輪郭そのものが主張になる**。朝鮮半島が
    その実例で、CShapes は南北朝鮮に 1945 年から 2019 年まで同一の輪郭しか持たず、その形は
    **1953 年の休戦線**である。**開戦日の 38 度線は戦線として明示的に引き、両方の朝鮮を切る。**
    詳細と検査は [`docs/MAP-LAYERS.md`](../MAP-LAYERS.md) §7.12。
- **年次系列を持たない指標に、誤った年を付さない。** 公開系列が無いものは版を明示するだけにする。


- **衛星の夜間光（`dl-nightsat`）と地球の夜側は、同じ 1 つの epoch を Chronos から引く**
  （`js/night-lights.js` ＝ `window.IntMapNightLights`）。⚠ **この層に自分の年は無い。**
  epoch は時計の**関数**であって変数ではなく、凡例の年の行は他の6つの階級区分と同じ
  `legendClockYear`で、**Chronos に書く**。以前ここにあった `window._nightsatEpoch` と
  2択の `<select>` は、この層だけの 2 つ目の時計で、実際にその欠陥を起こしていた——
  層を 2012 にしても `js/night-side.js` は 2016 の同じ製品を地球に合成し続けていた。
- **選び方**: 時計が LIVE なら最新の epoch。`ERA_FROM`（＝ 2012）より前の年は **epoch なし**——
  Suomi NPP は 2011-10-28 打ち上げで、1900 年に「最も近い夜間光」は存在しないから、層は
  **何も描かず**凡例が理由を言う。それ以外は `|年 − epoch の年|` が最小の epoch で、ちょうど中間
  （2014）は**新しいほう**へ倒す（スクラブが 1 回・1 か所でだけ絵を変えるため）。
- ⚠ **購読者に届くのは epoch の変化だけで、年の変化ではない。** 2017→2018→2019 は同じ epoch に
  解決するので通知そのものが起きず、source は貼り替わらず、タイルは 1 枚も取り直されない。
- ⚠ **年次の系列は存在しない**（2026-09-08 実測）。GIBS の `VIIRS_Black_Marble` と
  `VIIRS_Night_Lights` は best / std / nrt のどの入口でも **2012-01-01 と 2016-01-01 の 2 値だけ**を
  宣言し、他の年は 404 を返す（無言の代替はしない）。日次の
  `VIIRS_SNPP_GapFilled_BRDF_Corrected_DayNightBand_Radiance` は 2012→現在を z8 まで持つが、
  取得して復号した実測でラプラシアン・エネルギーが Black Marble の **2.4〜3.7 倍**（44〜68 対 18.3）・
  タイルの 99 % が点灯閾値より上＝**灰色の粒**であって合成ではない。**採らない理由は品質**である。
  なぜ他の候補も採らなかったかは `DECISIONS.md`。
- **凡例が言うのは 3 つの状態で、3 つは別の事実である**: 絵があるとき（product・センサー・出典・
  ネイティブ分解能・**データ年**、時計の年と違えば「Chronos: 2020 → 最も近い記録: 2016」）／
  記録が無いとき（`No data` と、なぜ無いか）／**取得に失敗したとき**（レンダラの `error` イベントが
  `src-nightsat` について言ったときだけ）。⚠ **失敗と未提供を同じ絵にしない。**

### 7.4a 時刻 T の地図——レイヤーは典拠が述べる範囲でだけ描く

- **1 つの機構**: `js/layer-time.js`（規則・純粋）／`js/layer-time-decl.js`（175 行＝レイヤー 164 ＋基本表示 11 の宣言・純データ）／
  `js/layer-time-kernel.js`（`window.IntMapLayerTime`）。時計の上に乗る。**時計は地図ごとに 1 つ**
  （`js/chronos.js` の `makeClock()`）で、メイン地図の時計が `IntMapTime`、比較ウィンドウはもう 1 つを持つ（7.4b）。
  1 つの地図の中で 2 つ目の時計は作らない。
- **宣言は 1 層 1 つ**、`TIME[id]`（`js/layer-manifest.js` の id）。1 層の記述の `time` 欄としてそのまま入る形で、
  DOM も `window` も参照しない。語彙は閉じている——`kind`（instant / convention / enduring / record / series /
  snapshot / live / forecast）、時計の当て方（`follows`＝範囲の中で時計の瞬間を描く・`self`＝範囲の外も自分で
  述べる・`entry`＝読者のクリックで時計を自分の記録へ動かす・`ownDate`＝自前の日付を持つ）、範囲（`from` /
  `to` / `asOf` / `period` / `carry`）、`says`（何が範囲を述べるか、en+jp）。**日付の値には必ず `by`（その値を
  述べているファイルか上流のページ）が付く**。小さなファイルなら値そのものを指せる（`data/gibs-range.json#layers.gxndvi.from`。
  機構が実行時に読む）。大きなファイル（`data/wars.json` 954 kB など）は値を書いて `cite` で出典の位置を示し
  （`wars[id=ww1].span.0`・`elections.$min(date)`）、**門がファイルを読んで一致を確かめる**。実行時に読む範囲は `runtime` で、
  読んだモジュールが `IntMapLayerTime.range(id, …)` で報告する（世界銀行は系列の年、ECMWF は予報ランの有効時刻を
  `@ecmwf-ifs` の 1 回で 10 行ぶん）。範囲を誰も述べていない行は `rangeUnstated` で「未決」と書き、描くとも
  止めるとも決めない（計器が穴として数える）。
- **判定は `verdict` 1 つ**: stated（典拠が T を述べる→描く）／carried（別の時点を述べ、それと言って描く——系列の
  最終年より後・日付つきスナップショットの後・自前の日付を持つ行）／unstated（どの典拠も述べない→描かない）。
  スナップショットの 1 版は直前の版からの期間（上流の周期 `period`）を述べる——OpenStreetMap は 1 日
  （`scripts/lib/upstream-cadence.mjs` の `OPENSTREETMAP`）。ライブは現在だけ。
- **描かないとは**: 箱の `change` を預かり（`js/layer-rows.js` の `holdUntilDrawable` と同じ形）、既に描いて
  いた箱にはモジュール自身の「オフ」を地図自身の変更として送り（`__syn`）、箱はイベント無しでチェックに戻す。
  読者の選択・共有リンク・セッションはそのまま。述べる時刻に戻れば 1 回の「オン」で配る。`self` の層は預からず、
  何も無い時刻には行に印だけを出す（モジュール自身の文があればそちらを優先）。自己修復（`IntMapLayerAudit`）は
  預かっている箱を「チェックされているのに空」と数えない（`timeHeld`）。
- **現在の時計で止まってよいのは `entry` の層だけ**（戦争の行は記録が終わっている）——門が検査する。
- **読み手は 3 つ**: 行（`js/layer-state.js` の `nodata`。en+jp の文）／凡例 `#data-legend-worldtime`（「描いて
  いません」と「別の時点の記録を表示」。現在の時計では前者だけ）／Atlas（`layerStates`・`time` 節の `layers`・
  能力 `time.coverage`。`time.travel` の結果にも、描けなくなったチェック済みの層を添える）。
- **宣言は時計が現在を離れたときに読む**（`import()`）。現在の時計で預かる層は、時計が一度でも過去へ行った後の
  戦争の行だけなので、起動経路に載せない。
- **自前の時計を持っていた行は時計に従う**: 世界銀行の 61 行（`js/wb-layers.js` `yearFor`。凡例の年は時計を
  動かし、「最新（国ごと）」は現在に戻す）、NASA GIBS の 4 行（`js/layer-packs.js` `gxAt`。日付欄と ‹ › は時計を
  動かす）。自前の日付を残している行（年降水量・人口グリッド・WorldCover・海流・選挙）は `ownDate` で宣言し、
  範囲の中では carried と述べる。
- 計器は `node scripts/world-at-time.mjs --year <年|now>`（全層の判定と理由）・`--years`（主要年）・`--check`（門）。
  実測と主要年の史実照合は `dev-notes/2026-10-01-world-at-time.md`。

### 7.4b 二時点比較とタイムラプス

- **比較ウィンドウは自分の時計を持つ地図**（`js/compare.js`、`makeClock('compare')`）。既定は「メイン地図の
  時刻に従う」で、そのときは 2 つの時計が等しい。「独自の時刻」を選ぶ・年を入れる・「現在」を押すと、
  メイン地図の時計を動かさずにウィンドウだけがその瞬間になる（「1914 年 | 今日」）。地図上の札が
  ウィンドウの瞬間（太字）とメイン地図の瞬間を並べて示す。
- **ウィンドウの層も 7.4a と同じ規則で判定する**。各層は、同じ典拠を描くメイン地図の層の宣言（`lid`）と、
  このウィンドウで瞬間を当てる者（`drawnBy`）を持つ。典拠が述べることは地図が変わっても同じなので宣言は
  そのまま使い、`follows` / `self` / `ownDate` だけを差し替える（`js/layer-time.js` の `onMap`、
  カーネルの `verdict(id, clock, drawnBy)`）。メイン地図の層に無い典拠（MERRA-2 の月平均気温）は同じ語彙で
  自分の宣言を持ち、`judge(decl, clock)` が同じ `validate` を通して判定する。述べない瞬間には描かず、ピッカーの
  下に理由を出す。時計に従う層（NASA GIBS の日付つき 4 層と MERRA-2・ケッペンの 30 年期間）はその瞬間を取りに行く。
- **ウィンドウの歴史国境はその瞬間の記録**——メイン地図と同じ連鎖（CShapes 2.0 の日単位 → OpenHistoricalMap
  → historical-basemaps の枚）を `js/time-borders.js` の `collectionAt(when)` に訊く。現在の基図が答える瞬間
  （現在・今年・CShapes の最終年より後）はそう述べ、era の線は描かない。era の記録が答える瞬間には、ウィンドウの
  「地図」基図も**メイン地図と同じ規則で物理地理**に替わる（`js/historical-basemap.js` の層定義をウィンドウ自身の
  OpenFreeMap ソースで描き、今日の政治境界と国名を持つ CARTO ラスタは隠す）。
- **共有リンク**は `cmp=` の隣に `ct=`（年・ISO 日・`now`。従っている間は書かない）を運ぶ。
- **タイムラプス**（`js/time-lapse.js`、Chronos パネルの `#ntl-lapse`）はメイン地図の時計を開始〜終了まで
  年／日／時の刻みで進める。予報の再生器（モデルの有効時刻を進める）とは別物。**1 コマは描画が追いついてから**
  ——時間カーネルがその瞬間を判定し（`lastSettled`）、全タイルが届き（`IntMapGeoEngine.ready()`）、その瞬間の
  国境が画面にある（`collectionAt` と `current()`）——その後に速度ぶん留まって次へ進む。訊ける相手がいない
  条件はコマを止めない（「観測できない」は「描けていない」ではない）。だから遅いタイルはラプスを遅くするだけで、
  瞬間を飛ばしも溜めもしない。読者や Atlas が時計を動かすと止まる。`prefers-reduced-motion` では最も遅い速度に
  固定し、そう述べる。各コマでチェック済みの層の「描き始め／描かれなくなった」を時間カーネルの答えから記録する。
- **書き出し**（`js/map-recorder.js`、Chronos パネルの `#ntl-rec`。開いたときに読む遅延チャンク）。タイムラプスを
  動画に、比較ウィンドウとメイン地図を 1 枚の PNG にする。どちらも同じ合成器で、枠は 1080×1080・1920×1080・
  1080×1920。地図は枠いっぱいに中央で切り抜き（プレビューがその切り抜きを示す）、各面の左上にその瞬間、下の帯に
  語標・リンク（ビルドが `site-origin.js` から書き込む og:url）と出典。**出典は描いている層が読むソースの帰属表示と `#map-credit`**
  （`scene.getStyle()` の可視・ズーム範囲内の層。両エンジンが答える。その瞬間に空の GeoJSON は何も描いていないので
  数えない）で、4 行を超えると 20 px まで縮め、それでも
  入らなければ帯を高くする——切らない。
  **動画のコマはタイムラプスのコマ**: 再生器は録画のとき、描き終えたコマ（上の 3 条件）を受け手（`sink.frame`）に
  渡し、画面の留まりの代わりにそれを待つ。録画器はレンダリングの tick の中で地図を読み（`atlas-view-capture.js` の
  `captureCanvas`。`preserveDrawingBuffer` は切ったまま）、合成し、MediaRecorder を再開して 1 コマ要求し、1/fps
  だけ録って一時停止する。地図を待つ時間はファイルに入らない（Chromium 実測: 200〜800 ms の待ちを挟んだ 7 コマが
  0・250・501・785・1014・1268・1519 ms）。録画はコマの時刻で終わるので、最後の瞬間に表示時間を与えるために同じ絵を
  もう 1 コマ書く（`encoded` = `frames` + 1）。**コマの数が要求の仕方で変わる**（Chromium 実測）: キャンバスの
  トラックは `requestFrame` の後の**描画**でコマを取り（描いていないキャンバスへの要求はコマにならない）、
  `start()` は描かれたキャンバスの絵を**自分で 1 コマ取る**（`start()`＋要求で 5 コマのはずが 6）、`resume()` は
  取らない。だから 1 コマ目は `start()` が取る絵（同じタスクで合成する）、2 コマ目以降は `resume()`・同じ絵を自分の
  上に描き直す・要求、を 1 タスクで行う（MP4／WebM、負荷あり・なしの 8 回すべてで 5 コマ中 5）。
  ⚠ 1 コマの長さは録画器が動いている**実時間**で、1 コマ目は録画器の起動のぶん長い（0.25 s のところ 0.28〜0.62 s）。
  計算機が重いと 2 コマ目以降も伸びる。コマが落ちる・重なることはない。終点より前に止まった録画（中止・時計が動かされた・別の再生）は
  何も残さない。形式は録画できる最初のもの（MP4 の H.264 レベル 4.0 → WebM）。終わったら保存リンクと、端末が
  ファイルを渡せるなら共有シート。
- **年鑑（その年の世界）**（`js/year-book.js`、Chronos パネルのタイムラプスの上の「この年を読む」）。時計の瞬間を、
  地図が描くのと同じ記録から読んだ 1 枚のページにする: 国境の記録が描く政体の数と、**描かれた形の球面上の面積**で大きい順
  （1 つの政体が複数の地物なら和）、その瞬間に答えている記録とその記録自身の `src`（`js/time-borders.js` の `recordOf(tier)`）、
  **その年の中で国境の記録が変わる日**と各日に現れる・消える・国境が変わる政体（前日の状態と比べる。1689 年より前の
  時期ごとの 1 枚は変化の日を述べないので、日を示さずそう述べる）、戦争の記録（`data/wars.json`。その記録の期間に入る年だけ
  読む——期間は `js/layer-time-decl.js` の戦争の行から）とその年の日付つきの出来事、Maddison Project の人口と 1 人当たり
  GDP（国コード別であって政体別ではない、と述べる。合計は述べられた国の和）、その瞬間を述べる典拠を持つレイヤーの数。
  政体を押すとその範囲へ、日付を押すと時計がその日へ、出来事を押すとその場所へ。開いている間は時計に追従する。
  Atlas は `time.yearbook`（読むだけ。`show:true` で時計を動かしてページを開く）。
- **Atlas**: `time.compare`（ウィンドウを開いてその時計を設定）と `time.lapse`（再生・停止・`record:true` で録画）。どちらも観測器
  `timeView` が実行後にウィンドウと再生器そのものに状態を訊き、狙った状態と一致したときだけ完了とする
  （既にそうなら `already_there`）。状態（`time` 節）にウィンドウの瞬間と再生の様子が載る。

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
[`docs/FILES.md`](../FILES.md) §3）。

- **レジストリ `window.IntMapWidgetCore`** — 定義（`id` は `family.variant`）・カテゴリ（9つ）・
  対応サイズ・設定スキーマ・更新方針・ローダ・**サイズ別レンダラ**・操作・旧IDの別名を1つの形で持つ。
  ⚠ **既定の設定値は関数**（`defaultConfig(context)`）。カードが作られる瞬間に評価されるので、
  ファイル内のどこに書いたかに依存しない。
- **WidgetContext** — レンダラが知ってよいことの全部（言語・テーマ・単位・位置情報の許可状態・
  地図の中心と範囲・選択中の国／地点・有効レイヤー・Chronos・経路・見守る場所の直近の確認結果・保存地点・オンライン状態）。
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
  ⚠⚠ **フォールバックが成功しても、主系統がレート制限されたことは呼び出し元へ届かなければならない。**
  複数の候補 URL を順に試す `firstOf()`（`js/widget-defs-data.js`）は、`getJSON()` が 429 を
  `rateLimited` として投げるのに**種別を見ずに次の URL へ落として**いた。次が 200 を返すので loader は
  成功で解決し、`rate-limited` 状態と `nextRetryAt` に**構造的に到達しない**＝ `minIntervalMs` のまま
  永久に叩き続ける。実測: 為替の主系統 `api.fxratesapi.com` は鍵なしで **61 回/時**の枠しか無く、
  アプリが自分でそれを使い切って 429 を受け続け、フォールバックが答えるので**誰も気づかなかった**。
  ⇒ `firstOf()` は 429 を返した URL を `retryAfterMs` の間**訊かずに飛ばし**、全候補が窓の中なら
  `rateLimited` で reject する。為替は `open.er-api.com` を主系統、fxratesapi を2番手にした。
- ⚠ **カードの出典行は、実際に答えた provider を名乗る。** 固定リテラル（`'fxratesapi / er-api'`）は、
  フォールバックが答えた回でも 1 番目の名前を出していた。`firstOf()` が成功した URL を
  返し、そこから hostname を出す。
- **局所計算のカードは盤面で1本だけのティッカー**に購読する（`WC.tick('second'|'minute')`）。
  購読が0になるとタイマー自体が止まる。⚠ **定義の中で `setInterval` を開かない。**
- **スタック**は手動と Smart の2つ。Smart は `window.IntMapWidgetSmart` が文脈から**決定論的に**
  順位を付け（固定 → 重大警報 → 実行中の経路／見守る場所の新着 → 選択中の国 → 現在地 → 地図の範囲 → Chronos →
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
- **場所と国の判定も、持ち主に訊く。**
  - 「見守る場所」のカード（`intmap.watched-places`。旧 `intmap.monitors` は別名として同じカードへ解決する）は
    `js/place-watch.js` の直近の確認（`lastRun()` → `digestData()`、Atlas の `places.watchDigest` と同じもの）を出し、
    ボタンはアカウントの「見守る場所」（`openWatchDigest`）を開く。モジュールは**ログインしている読み手にだけ**、
    必要になったときに読み込む（`WC.watchModule()`）。カードは自分で判定しない（§18.1）。
  - 「保存地点の警報」は、見守る場所の警報の読み手（`makeReaders().warning().near()` ——警報レイヤー自身の
    点判定で、区域がその地点を**含む**記録）を使う。周辺の矩形（半径の設定）は持たない。
  - 「国のウォッチ」の見出しは、ピンの地点（散らす前の `__oc`）が国の輪郭の中にあるもの
    （`js/news-intel-core.js` `makeCountryIndex`、Natural Earth 10 m。国日報とストーリーと同じ判定）。
    場所不明の擬似座標（`mapped:'none'`）は数えない。警報はその国の alpha-3 で発表された記録。
  - `country` 型の設定は ISO alpha-2 で、国の選択肢（`countryOptions()`）も alpha-2 を出す。
    国の行（alpha-3 が鍵）は `countryRow()` が alpha-2 からも引く。
  - 読み込みが要る答え（見守りの確認・輪郭・モジュール）は、ギャラリーのプレビュー（文脈の `preview: true`）では始めない。
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
