---
title: レイヤーの実装を「宣言が名指すモジュール」（レイヤー・パッケージ）に置き、js/data-layers.js は 1 本の経路で委ねる——海底ケーブル・RainViewer レーダー・火災・NATO／EU／国防費の 6 行を移し、data-layers.js は 6,108 → 5,246 行・window への代入 119 → 114・名前で切り替える行 29 → 23。移す前の木で撮ったブラウザの評価と同じ評価で、描くものが変わっていないことを示す。data-layers.js は小さくなるだけ（check:static）。あわせて NATO の凡例の加盟国数を描いている加盟国から書き（1985 年に「32」と述べていた）、プレート境界ほかの凡例の題の言語の取り違えを直す
date: 2026-10-02
newsen: The NATO legend now counts the members drawn for the date shown (it said 32 for 1985), and several legend titles show in the right language.
newsjp: NATO の凡例が、表示中の日付に描いている加盟国から数を書くようになりました（1985 年に「32」と出ていた誤り）。凡例の題の言語の取り違えも直しました。
---

〈依頼〉 利用者（2026-10-02）:「構造改革とイノベーション。保守ではなく改革。景観放置ではなく再開発。全権を委任する。
基幹や根幹もいじってよい。引き算ではなく足し算。固執ではなく保全」——既存機能は削らない。主題: レイヤーを「宣言」
（`js/layers/<id>.js`）と「実装」（`js/data-layers.js` ほか）に二分している構造を、1 レイヤー（または同じ実装を共有する
1 族）が 1 つのモジュールで宣言＋実装を持つ形にし、`js/data-layers.js` の中央の分岐を「パッケージに委ねる」1 経路にする。
移した族は挙動が同じであることを移行前後の同じ評価で示し、`js/data-layers.js` の行数と window 代入数は下がるだけにする。

## 0. 測った（a925952e）

- `js/data-layers.js` **6,108 行**。`window.*` への代入は**構文木で数えて 119**（監査の「334」は `window.` を含む行の数で、
  代入ではない）。toggleLayer と setLayerOpacity が `id==='<名前>'` で切り替える行は **29**。
- ⚠ **依頼の前提の 1 つは実測と違った**: 「World Bank 系のコロプレス（同じ setup を共有する数十層）」は
  `js/data-layers.js` に無い——61 行の世界銀行の行は既に `js/wb-layers.js`（500 行）にあり、`bx-wb*` の宣言から
  そこへ届く。`js/data-layers.js` に残る族で最も大きいのは、航空機・船・衛星（約 840 行）、ケッペン（約 730 行）、
  NATO／EU／国防費（約 365 行）、海底ケーブル（約 290 行）、RainViewer（約 145 行）、火災（約 60 行）。
- 宣言 `js/layers/<id>.js` は**純データ**で、Node の検査と生成器がそのまま import する（ブラウザは import しない——
  値は `js/layer-manifest.js` の生成領域に写される）。⇒ 実装を宣言ファイルに同居させると、全検査が DOM と描画を
  評価することになる。実装は宣言が**名指す**別モジュールにした（依頼の「または実装モジュールを宣言から import で結ぶ」）。
- `js/` の直下しか見ない門が 6 つある（engine・surface・archfiles・reachability・export-readers・typecheck）。⇒ パッケージは
  `js/layers/` のようなサブディレクトリではなく `js/layer-pkg-<pkg>.js`（門から逃げない）。
- 起動経路のモジュール数は `check:perf` が幅 0 で見ている。⇒ 静的 import は 1 本も足せない。パッケージは動的 import。

## 1. 造形

- **宣言の `pkg`**（`scripts/lib/layer-descriptor.mjs` の結び目の欄）が実装のモジュール `js/layer-pkg-<pkg>.js` を名指す。
  工場関数 `<camel(pkg)>Package(kit)` が、その名を持つ**全行**について `{ rows: { '<id>': { on, off, opacity } } }` を返す
  （`on` は行の要求＝`layerInflight` が見る promise）。名前の導き方（`packageFile` / `packageExport`）は kit に 1 回だけ。
- **ディレクトリが一覧**のまま: `scripts/layer-descriptors.mjs --write` が manifest の生成領域にパッケージごとの
  **literal な動的 import**（`PACKAGES`）を書き、`--check` がモジュールの存在と工場関数の export を照らす。
  manifest は `packageOf(id)` と `loadPackage(name)` を足しただけ（呼ばれるまで何も取らない）。
- **`js/data-layers.js` の 1 本の経路**: toggleLayer の on・off と setLayerOpacity の**先頭**が
  `if(packageOf('dl-'+id))` で、`_pkgSwitch` / `_pkgOpacity` に委ねる。パッケージは**初めて切り替えたとき**に取り、工場関数は
  1 回。届く前の切替は順に再生（on・off・on は on・off・on）、求められていないパッケージへの off は何も取らない、
  取得の失敗は行の観測された失敗（`layerState.report`）で覚えない。言語の切替のような「ファイル全体の瞬間」は
  `_pkgEach(hook)` が届いているパッケージにだけ配る（国防費の凡例の切替ボタンの再挿入）。
- **kit**（`packageKit()`）は閉包で共有していた**同じ物**を渡す（`opacities` は 1 つ）。言語の切替で作り直される凡例は
  値ではなく束縛なので `live` の getter（`live.lgdRadar` …）。パッケージ側は kit の名前を分割代入で受けるだけ。
- Layers 欄のサムネイルが読む `layerReads.subcables` / `.radarIndex` は、`js/data-layers.js` がパッケージを取りに行く
  転送を置き、パッケージが届けば今までどおり自分の関数を代入して置き換わる。

## 2. 移したもの（移動は機械的に・行はそのままのバイト）

| パッケージ | 行 | 移した塊 |
|---|---|---|
| `subcables` | dl-subcables | 取得の梯子・描画の梯子・クリック情報の動的 import・切替・不透明度 |
| `radar` | dl-radar | フレーム索引の読み・フレーム・再生（`window._rvPlayer`）・4 分ごとの更新 |
| `thermal` | dl-thermal | GIBS の日ごとの探査・24/48/72 h の重ね・`window._refreshThermal` / `_setThermalOpacity` |
| `alliances` | dl-nato・dl-eu・dl-milSpend | 加盟年の色と凡例・Article 6 の切り取り・hover・国防費の 2 つの表し方・時計への追従 |

移動は使い捨ての道具で行った（acorn で塊の自由変数を数え、`js/data-layers.js` の宣言なら kit から、import なら同じ import を
パッケージに書く）。**動かした行は 1 バイトも変えていない**——インデントも `js/data-layers.js` の工場関数の中に立っていたまま
（だから本体は関数が要るより 1 段深い）。変えたのは: 閉包の名前が kit から来ること、作り直される凡例を `live.` で読むこと、
行の切替（toggleLayer / setLayerOpacity の分岐の文をそのまま `on` / `off` / `opacity` に）、NATO と EU の hover の 2 つの掛け金を
読み手の居るパッケージで宣言すること、時計の handler に名前を付けて**届いたときに 1 回、時計の今の状態で走らせる**こと。
最後の 1 つは足し算で、理由は: その行は起動時から時計に追従していたが、パッケージは初めて点けたときに届く——
その前に時計が動いていれば年がずれる。時計の今の状態を 1 回通すと、購読が起動時から居た場合と同じ年になる
（`IntMapTime.on` は登録時に発火しない。発火するのは `set` のときだけで、そのたびの状態は `state()` と同じ）。
`window._thermalWindow`（読者の設定）は `js/data-layers.js` に残した——凡例と `js/map-ui.js` が行を点ける前から読む。

`js/data-layers.js`: **6,108 → 5,246 行**、`window.*` への代入 **119 → 114**、名前で切り替える行 **29 → 23**。

## 3. 描くものが同じである証拠——移す前の木で撮った評価と、同じ評価

`tests/layer-manifest.spec.js` ⑥（既存 spec への追記）: 新しい context で、各行を**点ける → 不透明度を 0.5 にする → 消す**、
各段で「その行が地図に足した style 層と source の全部（paint・layout・filter・tiles・ズーム範囲・スタックの中の位置）と
その行の凡例」を読む。上流は spec が答える（RainViewer の索引 2 フレーム・GIBS の 4×4 探査）。日付と凡例の中の数字は
伏せる（走った日と時間帯であって描画ではない）。atlas-controls が後から書く `aria-label` / `data-imname` も伏せる
（別の持ち主が自分の時刻に書く——最初の撮影で 2 回の結果が食い違い、原因がこれだった）。
**撮影は移す前の木で行い、2 回撮ってバイト一致を確かめてから写真にした**（`tests/fixtures/layer-packages-before.json`）。
移した後の木で同じ評価が写真と一致する。

## 4. 門——data-layers.js は小さくなるだけ

`scripts/layer-packages.mjs`（`check:static` の `layer-packages` 規則。`check:*` を足す余白が execution-strategy.md に無い）:
`tests/data-layers-baseline.json` と両方向で照らす——名前で切り替える行が台帳に無ければ赤（新しい行はパッケージ）、
`pkg` を持つ行が名前で切り替えられていれば赤（1 行に実装が 2 つ）、行数・`window.*` への代入数が台帳より多ければ赤、
少なくて台帳を下げていなければ赤（#R194）。`--update` は下げるだけで、上げることを拒む。

## 4b. 同じ作業に含めた 2 件（別作業 hist-fidelity-sweep が見つけ、`js/data-layers.js`・`js/layer-packs.js` を持つこの作業へ）

- **NATO の凡例が、時刻に関係なく今日の「32 members」を述べていた**（1985 年の地図は 16 か国を塗る）。
  凡例の中の数は隣の絵についての主張なので、**絵から読む**: パッケージの `natoCountHint()` が `buildNatoFC()`
  （`window.IntMapNatoFC` と同じ関数）の features の数から書き、`natoLegend()` が塗るたびに `.dl-hint` を書き直す。
  `js/data-layers.js` の凡例は空の hint の枠だけを持つ（不透明度の行がその枠の前に入る——枠ごと消すと凡例の並びが
  変わることを §3 の評価が捕まえた）。言語の切替で凡例が作り直されたら、行が点いていれば同じ関数でもう一度書く。
  語は `IntMapLang.t(…, ' members', 'か国', …)` の著者の組で、数は描いたもの——fr・ko・zh・zh-hans の inline 表に
  `" members"` の訳を、既存の `"32 members"` の訳から足した（行は 1 つも消していない。`check:i18n` の床がこれを測る）。
  件数を書く他の凡例は既にデータから数えていた（`js/layer-packs.js` の国数・`js/world-packs.js`）。
  回帰検査 ⑦: 時計を 1985 年にしてから**パッケージを読む**（行は遅延なので、届いたときの時計の再生も一緒に測る）
  →「16 members」、時計を今に戻す →「32 members」。再生の 1 行を消すと「32」が返って赤くなることを確かめた。
- **プレート境界・土地被覆・生態地域の凡例の題が英語画面で日本語**: `js/layer-packs.js` が LA の組（en, jp, de, ru, es）を
  手で `[jp, en, de, ru]` に並べ替えて渡していた（es は末尾から落ちていた）。組をそのまま渡す。全数: `_registerLayerOpacity`
  の呼び出し 40 余りのうち、組を添字で並べ直していたのはこの 1 か所（`[W.nm[0],W.nm[1]]` のような先頭だけの切り出しは
  順序を変えないので該当しない）。回帰検査 ⑧ は js/ の全呼び出しを構文木で読み、1 つの組の添字の列が 0 から順でない
  名前の引数を拒む。

## 4c. 起動費用と、門の台帳に書いた 3 つの決定

- **`check:perf`**: 同じ機械で移す前の木と比べて、起動経路は raw −28.5 kB・gzip −7.7 kB・モジュール数 299 のまま。
  遅延側は 4 つの新しい chunk の分だけ増えた（raw +32.1 kB・gzip +12.4 kB——移した実装そのもの）。台帳の
  `async.gzip` は移す前の木でも既に幅 18.6 kB のうち 15.5 kB を使っていたので、この増分で幅を超えた。
  **`async.gzip` の天井を 3,725.8 → 3,753.0 kB に上げた**: 起動から外したコードが行を点けたときに読まれる側へ移っただけで、
  1 バイトも足していない。
- **`check:surface`**: `window.IntMapSafe` の読みが 1 つ増えた（119 → 120）。`js/layer-pkg-alliances.js` が markup の
  タグを自分で束縛する（`const html=window.IntMapSafe.markup`——`js/stats-compare.js` と同じ形）。kit で渡すと
  `scripts/output-taint.mjs` がタグを見分けられず、テンプレート 7 つが「未判定」になった（判定はタグの束縛で行う）。
  `js/safe-html.js` は何も export しないので import の辺にはできない。同じ理由で `LA` も各パッケージで
  `IntMapLang.pickArgs()` から束縛する（`scripts/i18n-audit.mjs` は LA(…) の行を束縛の名前で数える——kit で渡したら
  2 行が「数えられない隣接データ」になり、fr/ko/zh の床を割った）。
- **`check:static` の `layer-packages`**: 台帳を 5,246 行・114・23 に下げた。

## 5. 実測で踏んだこと

- **撮影の書き込みを `tree-writers` 規則が拒んだ**（テストがチェックアウトを書く）。⇒ 撮影は環境変数で渡したファイルへ書き、
  写真へは手で写した。
- **移した先で 1 段インデントを浅くしたら、既存の検査の正規表現が落ちた**（`function addSubcables\(\)\{[\s\S]*?\n    \}`
  ——閉じ括弧の前の 4 つの空白）。⇒ インデントを変えずに移した。行がそのままのバイトであることが、そのまま証拠にもなる。
- **共有の brace matcher（`tests/helpers/lift-function.mjs`）が火災の探査の `/named '([^']+)'/` で釣り合わなかった**
  （`check:surface` の計器が以前に踏んだ、正規表現リテラルの中の引用符と同じ形）。⇒ パッケージの工場関数は構文木で取り出した。
- **台帳の `--update` は一時コピーでは本物を書く**（ハードリンク）。⇒ 書く前に unlink（descriptor の索引と同じ規則）。
- 既存の検査 14 本が `js/data-layers.js` の文字列や関数を持ち上げて評価していた（fetch-deadline-layer・hazard-other-session-defaults・
  heal-waits-for-inflight・layer-radar・layer-subcables・subcables-route・unobserved-is-not-refused・weather-ecmwf-reads・
  stalled-fetch-and-surface-gauge・layer-failure-state・atlas-console-replies・news-country-layers・shell-data-layers・
  safe-dom-template）。
  動いたコードは移った先から読み（多くは「data-layers.js ＋ そのパッケージ」を 1 つの読み物として）、
  toggleLayer を評価する 3 本（`stalled-fetch-and-surface-gauge` ①④・`layer-failure-state` ⑨・`unobserved-is-not-refused` ④）は
  パッケージの工場関数を同じ rig の中へ持ち上げ、toggleLayer の 1 本の経路（`packageOf` は manifest・`loadPackage` は持ち上げた
  工場関数）を通して走らせる。主張は 1 つも弱めていない。
- 時間の宣言 `js/layer-time-decl.js` の `follows` が NATO・EU の加盟表を `js/data-layers.js NATO_JOIN` と綴りで指していた
  （`scripts/world-at-time.mjs` がその綴りの在処を確かめる）。表が移ったので `js/layer-pkg-alliances.js` を指すようにした。

## 6. 移していない族（理由）

起動時に他のモジュールが読む公開面を持つ族は、**パッケージが届く前に何を答えるか**を先に決めなければ移せない
（届く前の答えが変われば挙動が変わる）:
- **航空機・船・衛星**（約 840 行）: `window.IntMapPlanes3D` を Atlas の 2 能力が同期的に読む（`isOn` は localStorage の設定、
  `select` は選択状態を書く）。AIS キーの設定欄は起動時に配線される。
- **ケッペン**（約 730 行）: 既定 ON で、`sampleKoppenAt`・`KCOL`・`KCOORDS`・`KOPPEN_PERIODS` を map-readout・map-ui・
  compare・precip-annual・label-occlusion が起動時から読む。
- **国の塗り**（人口・HDI・民主主義・GDP・出生率）: `window.choroValueAt` と `_imReapplyChoros` を hover と時計が読み、
  凡例は起動時に作られる。
- **GIBS の日付つきラスター**（降水・海面水温・積雪・エアロゾル）: 日付の機構（`DATED_SPEC`）を行の構築と凡例が起動時に使う。
次の回は、これらの公開面を「届く前の答え」を持つ薄い宣言にしてからパッケージへ移すのがよい。

## 7. 検査

- `tests/layer-packages-checks.test.mjs`（新規 ①〜⑧。⑦⑧は §4b）: 宣言が名指す全パッケージが自分の行だけに答え、kit に無い名前を
  求めない（kit は `packageKit()` の名前以外を拒む Proxy）／描く前の off と不透明度は何も描かない／toggleLayer と
  setLayerOpacity の 1 本の経路と、パッケージ行の分岐が無いこと／門が一時コピーで分岐・行・代入・下げ忘れを拒み、
  `--update` が上げない／写真の行はパッケージ行／各パッケージの `on` が要求を返し、描けるまで pending。
- `tests/layer-manifest.spec.js` ⑥（追記）: §3。
- 既存の検査は移った先を読むよう直した（§5）。
