---
title: レイヤーを「1 レイヤー＝1 つの宣言」に作り直す——174 本の js/layers/<id>.js から一覧を導き、移行前と 1 バイト一致で示す。他の登録簿での綴り（IntMapLayers・共有状態・カーネル命令・Atlas 能力・出典）と Chronos の契約も宣言が述べ、門がそれぞれの登録簿と照らす
date: 2026-10-01
---

〈依頼〉 レイヤーを「1 レイヤー＝1 つの宣言（descriptor）」として作り直す。宣言が id・棚・行の文言・凡例・出典・時間の
有効範囲・共有リンクの状態・Atlas の能力・遅延読み込みの本体・失敗の報告を 1 か所で述べ、manifest・パネル・共有状態・
能力表・出典ページ・i18n の検査はそこから導く。既存のレイヤーは機械的・全数で移し、挙動を 1 バイトも変えないことを
移行前後の導出物のバイト一致で示す。新しいレイヤーを足す手順が「宣言ファイル 1 つ」になることを一時コピー上で示す。
利用者承認:「全部任せる。求めるのは修正ではなく革命・改革。整形ではなく造形」（削除・縮小は含まない）。

## 0. 測った（281e584c）

- `js/layer-manifest.js`: 174 行・21 棚（base・18 の lyrGrp*・lyrGrpOthersReal・lyrGrpOthers・hidden）。
  欄の出現: key 154・label 38・rest 94・on 9・share 87・html 10・lazy 22。
- `window.IntMapLayers` の登録: リテラル 25 件（js/map-ui.js 23・js/outbreaks.js・js/precip-annual.js）＋実行時に
  組み立てる 7 件（`'gx-'+L.id` の 5・`R.register(idOf(key))` の 2）。**manifest の id と綴りで結べるのは 9 件だけ**で、
  対応表はどこにも無かった（`js/map-ui.js` の `isOn(id)` が `'dl-'+id` を試すだけ）。
- 監査の前提のうち 2 つは実測と違った: 「IntMapLayers は 27 件」→ 30 件（＋実行時 2）。「Atlas の `map.<id>` が
  レイヤーごと」→ 違う。能力はレイヤーごとではなく、レイヤー専用の能力は `layers.satellites`・`map.outbreaks` など
  11 件。「出典の id」→ 出典の行は `n`（名前の文字列）が唯一の鍵。
- `catalog()`（manifest の Atlas 用の入口）を呼ぶコードは 0 件。Atlas の `layerCatalog()` は今も DOM を歩く。

## 1. 造形

**1 レイヤー＝1 ファイル `js/layers/<id>.js`。** 何を書けるか・検査・導出は `scripts/lib/layer-descriptor.mjs`。
棚の一覧と並びは 1 つのレイヤーが述べられない事実なので `js/layers/_shelves.js`。`order` は棚の中の位置（10 刻み）。

- **行の欄**（id・key・label・rest・on・share・html・lazy）から `js/layer-manifest.js` が SHELVES を導出する。
  manifest の公開形（SHELVES・LAYERS・18 の関数）は 1 つも変えず、読み手は 1 本も書き換えていない。
- **結び目の欄**——`registry`（IntMapLayers）20 本・`state`（ShareState）1・`commands`（IntMapOS）5・
  `atlas`（能力の項目）11・`sources`（DATA_SOURCES の `n`）6。
- **時間の契約** `time`——衛星の「軌道要素の有効期間」（#852）の帯の表を宣言へ移し、`js/satellites-live.js` は
  `SATS_LAYER.time.bands` を読む（写しは 1 つ）。測定と推定部分と失効条件の註も表と一緒に宣言へ移した。
- **WHO 感染症レイヤー**は、行の id・IntMapLayers の id・共有状態の鍵を宣言から読む（`IntMapLayers.declaration`）。
  ⚠ import ではなく登録簿に訊く: `js/outbreaks.js` は `scripts/build-who-don.mjs` が `vm` でスクリプトとして評価する
  （病名の規則が最上位にある）ので、import 文が書けない。
- **ディレクトリが一覧。** `js/` では `import.meta.glob` を書けない（静的検査が js/ をスクリプトとして解析する）ので、
  `scripts/layer-descriptors.mjs --write` が、宣言から導いた一覧と各宣言の値を `js/layer-manifest.js` の
  GENERATED LAYERS の印のあいだに書き、`npm run build` の prebuild が最初に書き直す。領域が古ければ門が落ちる。

### 移行（機械的・全数）

`scripts/layer-descriptor-migrate.mjs --rev 281e584c` が manifest の SHELVES ブロックを git から読み、
1 行＝1 宣言に分けた。注記は「直後のものに属する」（棚の中なら次の行、棚の外なら次の棚、棚の末尾・棚の行頭は棚）で
**1 語も書き換えずに**運んだ。結び目は登録するコードを読んで確かめたものだけ（根拠は移行ツールの表の各行の註）、
`sources` は各登録自身の `source:()=>'…'` を ` / ` で割り、DATA_SOURCES の名前と完全一致した部分だけ。

## 2. 1 バイトも変えていない証拠

`scripts/lib/layer-derived.mjs` が「manifest が読み手に渡す全部」（SHELVES・LAYERS・BETA/BASE/HIDDEN・
layerGroups・betaKeys・basicRows・basicLayers・hiddenRows・defaultLayers・defaultOn・sharedIds・htmlRows・生成行の
markup・catalog・全 id と全短名の layerFor・isLayer）を 1 つの値にする。移行前の手書き manifest から撮った写真
`tests/fixtures/layer-descriptor-before.json`（92,468 バイト）と、導出後の値を**文字列として**比べて一致。

## 3. 「宣言ファイル 1 つ」の証拠

`tests/layer-descriptor-checks.test.mjs` ③: 一時コピー（tests/helpers/scratch-tree.mjs）に `js/layers/zz-probe-layer.js`
を 1 本足し、機械の 1 手（`--write`＝build の prebuild）だけで、棚・位置（order 15 → 10 と 20 の間）・共有・生成行の
markup・catalog・reorganizeLayerPanel の短名・`layerDeclaration` の全部に届き、門が通る。
④: 存在しない棚・存在しない能力・登録の無い registry・存在しない出典・位置の重なり・索引の更新忘れ・未知の欄・
「宣言から読む登録」をリテラルに戻したこと——の 8 通りで門が落ち、それぞれを名指す。

## 4. 実測で踏んだこと

- **一時コピーのファイルはハードリンクで、生成器の `writeFileSync` は本物の木に書き込んだ。** ③ の初回で
  探査用のレイヤーが本物の索引（当時は `js/layers/_index.js`）に入った（`node --test` が ERR_MODULE_NOT_FOUND で気づいた）。
  ⇒ 生成器は書く前に unlink する。検査は索引を `mutate()` の戻す対象に入れる。docs/TESTING.md に書いた。
- 移行ツールの初版は、`register('temp'` の区間を正規表現で切り損ねて隣の登録の出典を拾った（`dl-ec-temp` に
  sst の出典）。区間を「その register( から次の register( まで」に直してから書き出した。
- `dl-milSpend` は大文字を含む——宣言ファイル名の判定を綴りの正規表現にしていたら 173 本しか数えなかった。
  発見は「`_` で始まらない `*.js`」。
- 登録の id の発見で `'gx-'+L.id` の `'gx-'` をリテラルと誤読した——`'…'` の直後が `,` か `)` のときだけリテラル。
- **翻訳の計器 2 つが「js/ にどのファイルがあるか」で食い違っていた。** `scripts/i18n-pair-audit.mjs` は js/ を
  再帰的に歩き（locales/ だけ除く）、共有の構文解析 `scripts/i18n-helpers.mjs` の `parseAll()` は js/*.js しか読まない。
  js/ にコードのディレクトリが無かったあいだは同じ答えで、js/layers/ が来た瞬間に `context('layers/<id>.js')` が
  null を返して `check:docs` の i18n-open-gap が「読めない」で落ちた。⇒ `parseAll()` を同じ母集合（再帰・locales/ 除く）に。
- **死んだ export の計器（`scripts/export-readers.mjs`）が spread の読みを数えていなかった。** `out.push(...kit.x(…))` の
  3 つの点を「別のオブジェクトのプロパティ」と見なし、`descriptorProblems`・`setProblems` を死んだと報告した。
  ⇒ 直前が「`.` 1 つ」のときだけ拒む（`...` は読み）。検査 ⑥。外から読まれていない 6 つ（欄の表・`rowOf`・
  `DECLARATIONS`）は export を外した——読み手の無い公開名は作らない。
  ⚠ この計器は今も js/ の**直下**しか母集合にしない（js/layers/ の宣言は `default` だけを持ち、生成器と `js/satellites-live.js` が読む）。

- **索引を 174 本の `import` にしたら `check:perf` の `eager.modules` が 291 → 468（+177＝宣言 176＋kit）。** 起動の
  バイトは減っていた（raw −10.3 kB・gzip −4.1 kB・要求数 9 のまま）。天井を上げず、索引を「宣言の値の写し」1 モジュールに
  した——`scripts/atlas-caps.mjs` が能力の行を registry に写すのと同じ理由。値を書く場所は宣言のファイルだけで、
  写しが違えば門が落ちる（索引の鮮度の検査がそのまま「写しの一致」になる）。
  ⚠ **それでも 1 つ増えた**（292 > 291——索引モジュールそのもの）。天井を上げず、`js/atlas-capabilities.js` の
  GENERATED ROWS と同じく **manifest の中の生成領域**に写した。起動経路のモジュール数は移行前と同じ（291）。

- 導出を生成時に移すと、宣言の欄・検査・`deriveShelves` を持つ kit はブラウザの誰からも読まれなくなり、
  「js/ の全モジュールはどこかから読まれる」（tests/layer-boot-graph-checks R175 ③）が落ちた。kit は生成器と門だけの
  ものなので `scripts/lib/layer-descriptor.mjs` へ移した——js/ には配るものだけを置く。

## 5. 主張されない登録（--report・要求しない）

`choropleth`（系統全体の代弁）・`co`・`no2`（行が無く `isOn` が常に偽）・`elevation`（常時 ON）・`news`（ニュース欄の点）。
行ではないものに主張を要求すれば、作り話の主張が返ってくる。

## 6. 今回やらなかったこと（理由つき）

- **行の名前（`label` の無い 136 行）を宣言へ移していない。** 名前は行を作るモジュールの `L.arr(LA(…))` が持ち、
  翻訳の門（scripts/i18n-audit.mjs）はその**呼び出し**で翻訳を見つける。データへ移すと「訳されない」ではなく
  「数えられない」になる（#R548 の形）。先に門へ宣言を読む面を足し、それから名前を移す——別の 1 本。
- **凡例・失敗の報告**は宣言に欄を作っていない。凡例は `_registerLayerOpacity(id, names, …)` の呼び出しで行の持ち主が
  組み立て（59 か所・18 ファイル）、失敗の報告は `layerState.report(<checkbox id>, …)` がすでに宣言と同じ id を鍵にする。
  読み手の無い欄は作らない（AGENTS.md §3-3）。
- **出典ページ・Atlas の能力表・Atlas の `layerCatalog()` の見た目は変えていない**——「挙動を 1 バイトも変えない」が
  条件で、宣言から新しく導ける表示（出典ごとの使用レイヤー、DOM を歩かない Atlas の目録）は利用者に見える変更になる。
- 実行時に組み立てる登録（net-health・war-fronts の `R.id + '.toggle'`、volcano のループ、gx-*）は照らせないので主張しない。

## 7. 検査

`tests/layer-descriptor-checks.test.mjs`（①〜⑤）。`tests/restored-layers-under-load-checks.test.mjs` は持ち上げた関数に
宣言を渡す形へ（帯の表が宣言へ移ったため）。
