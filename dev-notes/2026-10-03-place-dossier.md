---
title: 地点プロファイル——1 地点について地図が知っていることを 1 枚に。名前と行政区分・国・標高・表示中レイヤーの値・現地時刻と日の出入りを 1 つの記録にし、カードと Atlas（research.placeProfile）が同じものを読む。読めない項目は行が消えず理由を述べる
date: 2026-10-03
newsen: Place profile: everything the map knows about one point on one card — name, area, elevation, layer values, local time, sunrise and sunset.
newsjp: 地点プロファイル：1 地点について地図が知っていること（名前・行政区分・標高・表示中レイヤーの値・現地時刻・日の出入り）を 1 枚にしました。
---

〈依頼〉新しい商品機能「地点プロファイル（Place dossier）」。地図上の任意地点（クリック/長押し、または検索で選んだ場所カード）から、その場所について地図が知っていることを全部 1 枚で返す口を作る。母集合はハードコードの一覧ではなく宣言/登録から発見し、値を取れない層は理由を出す。Atlas から到達でき、構造化した値（数値・単位・出典）を返す。

## 0. 測った（前）

- 「この地点について」を答える口は 2 つしか無かった: 国名のポップアップ（国カード）と `research.askHere`（地点を Atlas に渡して作文させる）。**表示中のレイヤーの値は、カーソルを当てて 1 つずつ読むしかなかった**（`js/map-readout.js` の読み出し）。
- 材料は全部すでにあった——`IntMapLayers.sampleAt`（`measure` が数と単位、`sampleAt` が文を返す登録の窓口）・`elevation` 登録（terrarium DEM）・`HOST.countryGeo`＋`window._imPipGeo`・`IntMapWx.point`（Open-Meteo の `timezone=auto`）・`IntMapWx.sunTimes`・Nominatim の共通の列（`js/nominatim-gate.js`）。**欠けていたのは、それを 1 地点について束ねる者**だった。

## 1. 作ったもの

- **`js/place-dossier.js`**: `placeProfile(pt, HOST, opts)` が JSON にできる 1 つの記録を作り、`profileHtml()` がそれを描く。`openPlaceDossier()` が `.country-popup` のカード（ドラッグ・携帯のシート・`MAP_ANSWER_EVENT` の `card`）を開き、節が届くたびに描き直す。
- **入口 3 つ**: コンテキストメニュー（右クリック・長押し）の「現地の情報 ▸ 地点プロファイル」（`js/tool-panel.js`）、検索の結果カードの「地点プロファイル」（`js/search-geocode.js`）、Atlas `research.placeProfile`（`js/atlas-cap-research.js`）。どれも**そのクリックで動的 import**——起動経路に載らない。地図のクリック読み手は 1 つも増やしていない（[[intmap-click-listeners-are-not-owners]]）。
- **Atlas には記録そのものが `exec.placeProfile` で届く**（`js/atlas-toolsurface.js` が `observed` に運ぶ）。国の統計は Atlas が持つ指標の集合（`K.METRICS`＋`K.XMET`）と書式（`K.fmtVal`）で読む——ここに単位を書き写していない。
- 各節は `ok`／`none`（訊いたが無い——公海に国は無い）／`unavailable`（訊けなかった・届かなかった、理由つき）。表示中レイヤーの行は 4 種の理由を持つ: `no-value-here`・`sampler-failed`・`features-not-a-value`・`no-point-reader-declared`。最後の 1 つは `js/layer-manifest.js` `dataLayers()` の宣言から**発見する**（宣言の `registry`、無ければ登録簿自身の `dl-`+id 規約）。

## 2. 否定した・残したもの

- **クリックを奪う入口は作らなかった。** 地図のクリックは地名ポップアップ・歴史面・気候の読み出しが分け合っていて、相互譲渡で無反応になった前例がある。既存のメニューとカードに行動を足す形にした。
- **カードには国の統計の行を書かなかった。** 統計の単位を述べているのは `js/atlas-console.js` の `fmtVal` と `js/countries-ui.js` の国カードの 2 か所で、指標の集合（`js/atlas-metrics.js`）は単位を持っていない。カードで行を作ると 3 つ目の正本になるので、既存の国カードを開くボタンにした。Atlas の経路は `fmtVal` を通すので単位つきの文を返す（`value` は素の数、単位は `text` の中）。**直すなら指標の集合が `unit` を宣言すること**（今回の範囲外）。
- **`bx-*`（国別の塗り分け）は `no-point-reader-declared` に並ぶ。** その値は `choropleth` 登録が合算して読むが、宣言が `registry` でそれを述べていない。行は「宣言が読み手を名指していない」とだけ述べる（「値が無い」とは言わない）。宣言に `registry: ["choropleth"]` を書けば消える。
- 境界の窓口: `window.IntMapAtlas`・`IntMapLayers`・`IntMapSafe`・`IntMapWx`・`_imPipGeo` の読みが増えた（`tests/global-surface-baseline.json` を `--update`）。どれも持ち主（`js/atlas-loader.js`・`js/map-ui.js`・`js/safe-html.js`・`js/wx-source.js`）がまだ export していない。

## 3. 検査

- `tests/place-dossier-checks.test.mjs`（新規・node）: 収集器を**評価する**——偽の HOST・偽の登録簿・偽の網で。登録簿の行が数と単位を表示文と分けて持つ／標高は先頭へ／4 種の穴が理由つきの行になる／宣言から発見した読み手の無い行と `dl-` で結ばれる行／公海・届かない・述べられないゾーンが 3 つの別の答え／統計は呼び手の集合と書式から（国に無い指標は 0 にしない）／記録が JSON で往復する／描いた行の数がレイヤー行の数と等しい／入口 3 つ。
- 段 1: `check:static`・`check:capabilities`（23 項目）・`check:catalog`・`check:i18n`・`check:archfiles`・`check:surface`・`check:docs`（`DECISIONS.md` の能力数 8 か所を除く）。
- `tests/place-dossier.spec.js`（新規・ブラウザ）: 右クリック →「地点プロファイル」でカードが開き、全節が値か理由に落ち着き、空の行が無く、× で閉じる。1 ページ 1 起動。**実測 12.8 / 8.4 s（ローカル・1 worker）、上限側の 13 を `tests/durations.json` に入れた**——`CORE_MAX_S` を超えるので deep 側に並ぶ（core は 6 本のまま、deep は 128 本）。
- 段 1（統合後）: 上の各門に加え `check:datagov`・`check:perf`（下の追記）・`check:testbudget`。`DECISIONS.md` の能力数（155／到達 154／`find_capability` の先だけ 139）と、tier の本数（`docs/FILES.md`・`docs/TESTING.md`・`package.json`・`scripts/worktree.mjs`）を実数へ。⚠ **`check:testbudget` は全体が天井 87.5 分を 0.2 分超える（87.7 分）**——この spec の 13 s を払う余地は PR #911（直列 9.0 分の削減）が作る。天井は上げていない。
- **起動費用（CI 実測で訂正）。** 統合前に書いた「天井内・`--update` 不要」は誤りだった——PR の CI が `eager.cssRaw` 367.8 kB（天井 365.8 kB・幅 2.0 kB）と `async.gzip` 3796.2 kB（天井 3774.0 kB・幅 18.9 kB）で落ちた（ローカルの build も同じバイト数）。`eager.cssRaw` は**このカードの CSS 11 行**（`.pd-*`。`css/intmap.css` は main の 3 commit が触っていないので合流後も同じ数）で、天井を実測の 376,601 B に上げた。`async.gzip` は新しい chunk `place-dossier`（15.3 kB）と、それを呼ぶ側の増分で、天井は**上げていない**——main が同じ行を #909 で 3,886,293 B に上げており、合流後の木の数はこの branch では測れない（`--update` は「CI が測る木ではない」と拒む）。rebase 後に build して `--update` が要るかを測る。

## 統合時の性能予算（重ね直した後の build）

超えた行だけ `--update`:
- eager.requests: 9 → 10
- async chunk "atlas-console": 1144.2 kB → 1152.2 kB
