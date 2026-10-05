---
title: 土地被覆も、凡例で選んだ分類だけを強調できるように——MapLibre に raster-color が無いのでタイルが届いた所で塗り替え、減光の規則はケッペンと 1 つに
date: 2026-10-05
newsen: In the Land cover legend you can now click classes to show only them on the map, as with Köppen climates — the rest turns faint grey.
newsjp: 土地被覆の凡例で分類を押すと、ケッペンの気候区分と同じように、その分類だけが地図に強調表示されるようになりました（他は薄い灰色）。
---

〈依頼〉「land coverレイヤーも、ケッペンの気候区分レイヤーと同じように、選択したものだけハイライト表示されるようにして。できるなら、でいい。」

## 0. 測った・読んだ
- ケッペンの強調は同梱の PNG を canvas で読み、選ばれなかった画素を「灰（平均×0.6）・不透明度×0.28」に塗り直して画像ソースを差し替える（`js/data-layers.js` `buildKoppenHighlightURL`）。同じ file に GPU 版（`raster-color`）があるが呼び出し元は 0 件。
- **MapLibre 6.11.2 のスタイル仕様に `raster-color` は無い**（`maplibre-gl-shared.mjs` の raster-* は opacity / hue-rotate / brightness / saturation / contrast / resampling / fade だけ）——GPU 版は走りようがなかった。
- 土地被覆は Terrascope の WMTS（外部タイル）。**実タイル 9 枚（z2–z14・2021 年版）を復号し、画素の 100 % が凡例の 11 色か透明**だった（パレットではなく RGBA）。⇒ 色の完全一致で分類を引ける。
- Terrascope は本番の origin に CORS を返す（`Access-Control-Allow-Origin`）ので、タイルを canvas で読み戻せる。

## 1. 直したもの
- `js/class-highlight.js`（新）: 減光の規則を 1 か所に（`dimPixel`・`keepClasses`）。ケッペンの塗り直しも同じ `dimPixel` を読むようにした（`data-layers.js` は行数を増やさず置き換え）。
- `js/layer-packs.js` `landCover`: 凡例の分類行をボタンに（選択中は枠、他は半透明、「選択解除」）。選択がある間だけソースのタイルを `imwc://年/選択/{z}/{x}/{y}` にし、プロトコルが同じ Terrascope のタイルを取って `keepClasses` で塗り替えて返す（`js/sat-proto.js` と同じ addProtocol の型）。選択が無ければ素の URL に戻る。年の切り替えは選択を保つ。読み戻せないタイルは捨てずにそのまま出す。
- Atlas: `map.landCover`（`js/atlas-cap-map.js`）——分類の名前（どの言語でも）か番号で選択・追加・解除・年。API は既存の `window.IntMapEco` に `landCover` を足した（`check:surface` の基準に、能力ファイルからの `window.IntMapEco` の読み 2 件が新しい辺として載る）。

## 1b. 払ったもの
- **起動時のモジュールが 1 つ増えた（eager.modules 313 → 314、`node scripts/perf-budget.mjs --update`）。** `js/class-highlight.js` はケッペン（`data-layers.js`・起動時に読まれる）と土地被覆の両方が import するので、起動のグラフに入る。中身は 40 行の純関数で、減光の規則を 2 か所に写さないための 1 ファイル。
- `check:surface` の基準: 能力ファイル（`js/atlas-cap-map.js`）から `window.IntMapEco` を読む 2 か所が新しい辺。土地被覆の内部へ届く既存の窓口（`IntMapEco.toggle`）に `landCover` を足しただけで、新しい global は無い。
- Atlas の新しい文言は en+jp だけ（憲法 §7）。

## 2. 検査・未了
- `check:catalog`・`check:capabilities`・`check:atlasrepeat`・`check:surface`・`check:static` は緑。
- 地図の実描画（選択した分類だけが残る）はビルドしたプレビューで確かめた。
- 地図の上をクリックして分類を選ぶ経路（ケッペンにはある）は、外部タイルの画素を読む必要があるので今回は入れていない。
