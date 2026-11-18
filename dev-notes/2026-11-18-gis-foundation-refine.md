---
title: GIS 基盤を実行して測り直す——極を含むバッファ・境界上の点・日付変更線の格子の欠陥を根本で直し、重心・内点・凸包・簡略化・等面積格子・分布の統計・KML/GPX 書き出しを足す
date: 2026-11-18
pr: 1183
newsen: Analysis gained centroids, convex hulls, simplification, equal-area square and hexagon grids for hexbin maps, and zone medians, percentiles and modes. Results export to KML and GPX, also via Atlas. Buffers near the poles are now correct.
newsjp: 分析に、重心・凸包・簡略化・面積の等しい正方形と六角形の格子（六角形の集計地図）・区域ごとの中央値・分位・最頻値が加わりました。結果は KML・GPX でも保存でき、Atlas にも頼めます。極の近くのバッファも正しくなりました。
---

〈依頼〉「IntMap の GIS 基盤を refine、整理、増強して。」

## 0. 測った（読まずに実行した）

カーネル（`js/gis-geometry.js`・`js/geodesy.js`・`js/gis-crs.js`・`js/gis-raster.js`・`js/gis-units.js`）を
Node で読み込み、答えの分かっている入力を与えた（解析解・独立に書いた Vincenty・球冠の公式）。

| 入力 | 期待 | 実際（修正前） |
|---|---|---|
| 北緯 89.9° の点の 50 km バッファ | 球冠 7,853.9 km²・中心と極が内側 | **5,529 km²・中心も極も外** |
| 線 [[0,89],[180,89]] の 20 km バッファ | 10,152 km² | **2,497 km²** |
| box(0,0,10,10) の東辺・北辺の上の点 | 西辺・南辺と同じ答え | 西・南は内、**東・北は外**（穴は逆向き） |
| 辺だけ共有する 2 つの箱 | 交わる | **disjoint** |
| 全球 1° 格子で経度 180・南緯 90 を標本 | 値 | **outside**（−180・北緯 90 は値） |
| 0 °C → °F | 32 | **31.999999999999986** |

球面・楕円体の面積、UTM と 3857 の往復、測地距離、日付変更線をまたぐ交差・差・合併、穴・島、区域内集計は通った。

あわせて能力の欠けを数えた。op は 33 個で、パネルも Atlas も `ops()` から作るので入口の無い op は無かった。
欠けていたのは算法そのもの（重心・内点・凸包・簡略化・格子生成・分布の統計）と、書き出しの形式（読む 7 種に対して
書く 4 種）と、Atlas からの書き出しの扉。`docs/GIS-CORE.md` §2.1 の op 表は 33 個中 18 個しか載せていなかった。

## 1. 直したもの

- **極を含む円盤（`js/geodesy.js` `_diskRing`・`js/gis-geometry.js` `bufferKmR`）。** 円盤の輪郭を経度で並べた
  環が 350° の閉じ辺を持ち、`unwrapRing` がそれを短い向きに畳んでいた。輪郭をベクトルで作り、極を含む円盤は
  極で閉じる球冠として書く。両極を含む円盤は「世界 − 対蹠の円盤」。カーネルの答えから ±89.9999° の丸めを外した。
  実測: 89.9° / 89.99° / 90° / −89.9° のどれも 7,853.9〜7,854.6 km²（厳密 7,853.9）、中心と極は内側。
- **長い辺のバッファ。** 辺の両端を始点の方位でずらしていたので、方位が辺の途中で変わる高緯度の長い辺で
  帯が細った。線の辺は大円（`lengthKm` が測るのと同じ曲線）、面の環の辺は経緯度の直線（ブール演算と述語が
  読む辺）と**述べ**、各点をその点の法線でずらし、弦の誤差が r·(1−cos(π/steps)) に収まるまで辺を刻む。
  対蹠点を結ぶ辺は大円が 1 本に決まらないので `edge-antipodal` で断る。実測 10,154 km²（厳密 10,152）。
  合併を 16 片ずつの木にして、2,000 頂点の環の 5 km バッファは 13.5 秒 → 2.1 秒。
- **境界の上（§2.5.5・`geom-4`）。** 述語は OGC（DE-9IM）の閉集合で答える: `intersects` は接するだけでも真、
  `contains` / `within` は内部を 1 点は共有することを要する（境界の上の点は within ではない）。境界は
  `locate` が明示的に判定し、平面の都合でできた辺（帯の子午線・±180 の継ぎ目・極に沿う辺）は境界として扱わない。
  ⚠ **`pointInGeometry` は半開のまま**（境界の点は東隣——東が水平な辺なら北隣——の区域に属する）。
  `zonal` の `center`・`rasterize`・`voronoi`・点や線の `clip` が「1 点は 1 区域」に頼っているので、閉集合に
  すれば境界上の画素を二重に数える。実測: 2×2 の区分の線上・穴の縁・±180・36 扇の極、どれも 1 区域にだけ入る。
- **`aggregate` の member は「地面を共有するもの」（§2.10）。** 上の変更で、辺だけを共有する隣の区画が
  `intersects` で真になり、区域の件数に入るようになった（`tests/gis-aggregation-checks.test.mjs` R819 ④ が捕まえた）。
  述語を戻すのではなく、`aggregate` が面どうしのときだけ交差の中身を訊く（`geom-3` までの member の規則）。
  `relate` と `spatialJoin` の `intersects` は読者が選ぶ述語なので OGC のまま。
- **ラスターの端（`raster-5`）。** 問い合わせの経度を格子自身の経度の枠へ整数周で移す（`lngInFrame`。`zonal` の
  `columnRanges` が既に使っている規則で、2 本目は作っていない）。範囲の外周の東・南の辺は端の画素に閉じる。
- **単位（`units-3`）。** °C・°F・K を有理数の係数と切片で持ち、整数で計算して最後に 1 回割る。0 °C は 32 °F。
  丸めの規則は新しく作っていない。米測量フィート・坪・mmHg・inHg を定義を引いて足した（ノットは既にあった）。

## 2. 足したもの

- **カーネルのプリミティブ（§2.5.6）**: `bbox`（180° をまたげば w > e。RFC 7946 §5.2）・`centroid`（球面。
  面は面積、線は長さで重み、穴は差し引く）・`pointOnSurface`（返す前に `pointInGeometry` で確かめる）・
  `convexHull`（球面。開いた半球に収まらなければ `hull-not-in-hemisphere`）・`simplify`（km の許容差の
  Douglas–Peucker。出力は必ず `validate` を通り、通らない環は許容差を半分にして戻す。行どうしの共有辺は
  そろえないと答えが述べる）。
- **op**: `centroid`・`pointOnSurface`・`convexHull`・`simplify`・`grid`（§2.10）。`grid` のセルは地面の上で同じ面積
  （0° と 60°N で `cellKm²` との差 1e-9 未満）。`grid` → `aggregate(count)` が六角形の集計で、専用の op は作らない。
- **`aggregate` の統計**: `median`・`percentile`（`p`。Hyndman & Fan 第 7 法）・`stdev`（標本・n−1）・`majority`
  （`js/gis-units.js` が拒否の remedy に既に使っている語に合わせた）。使ってよいかは単位の核が自分の語で決める。
- **書き出し**: KML 2.2 と GPX 1.1（`js/gis-export.js` の `FORMATS` に登録し、パネルはそこから一覧を作る）。
  GPX は面を表せないので、書く前に型ごとの件数を挙げて `export-geometry-not-representable` で断る。
  時刻はデータセットが時間軸を宣言したときだけ `<time>` にする（`time` という名前の列からは推測しない）。
  出典・ライセンスの註は GeoPackage と同じ関数（`provenanceNotes()`）から書く。
- **Atlas の `data.gisExport`**（`js/gis-atlas.js` `exportDataset`）。読者の端末にファイルが残るので risk `persist`・
  confirm `explicit`。形式の一覧は手引きに書き写さず、書き出し側の拒否が全形式を返す。

## 3. 整理（形式上の削除と、何が引き継いだか）

- `js/gis-crs.js` の公開 `WGS84`、`js/gis-project.js` の `dbName` / `storeName`、`js/gis-datasets.js` の公開
  `describeFields` を外した——`js/`・`tests/`・`scripts/`・HTML・文書のどこにも読み手が無い。内部の使用は残る。
- `js/gis-export.js` の XML の書き手 2 本を 1 本に（GDAL のメタデータも `xe()` を通る。XML 1.0 が運べない文字を
  落とすので、読めないファイルを書かなくなった）。
- `aggregate` に一時置いた「`percentile` / `stdev` は `median` の規則で判定する」写像を消した。単位の核が
  2 つの語を自分の語彙に持ったので、判定はその名で行われる（同じ判定が 1 か所）。
- 誰も出さなくなった拒否コード 3 つ（`clip-window-not-convex` など）についての古い註、`js/gis-ops.js` 冒頭の
  「Nine ops」を現状の文に直した。
- **残した重複**（理由つき）: `gis-crs`・`gis-raster`・`gis-index`・`gis-warp`・`gis-units` は互いに `window` 越し
  にしか触れず、ラスターと warp のカーネルは `fn.toString()` で Worker へ運ばれるので自己完結でなければならない。
  `gis-ops` の `lengthKm` の haversine は `IntMapGeodesy._distKm` より短い辺で精密（10⁶ 本で最大 8.2e-6 の相対差）。
  `bboxOf` は呼び手が素の min/max で比べるので、180° をまたぐ `bbox` には差し替えない。

## 4. 文書

`docs/GIS-CORE.md` §2.1 の op 表を 38 op 全部に（`ops()` と突き合わせる検査を足した——手書きの表は #R783 と
今回の 2 回とも新しい op を載せ損ねた）、§2.5.5・§2.5.6・§2.10 を新設。`PRODUCT.md` の「14 の処理」を、数を
書かずに正本へリンクする形に。`docs/architecture/02-features.md` の能力数を 241 / 238 に。

`tests/global-surface-baseline.json`: `window.IntMapGis`（12 → 13）と `window.IntMapLazy`（176 → 177）。
`data.gisExport` の能力行が遅延チャンクを開く形で、`data.gis` / `data.gisProject` の行と同じ理由
（import にすると GIS の核が起動経路に載る）で global を読む。

## 5. 検査

新規 4 本: `tests/gis-foundation-refine-{geometry,ops,export,raster}-checks.test.mjs`（期待値はどれも出典を註に書いた）。
版: `geom-4`・`ops-11`・`raster-5`・`units-3`（`scripts/gis-kernel-versions.mjs` にハッシュ）。

## 6. 未解決

- **URL から COG を読む入口が無い。** `js/gis-geotiff.js` の `readUrl` / `httpSource`（HTTP Range で窓だけ読む）は
  実装されているが、呼び手が 0。`js/geo-import.js` はバイト列しか受けず、`js/population-grid.js` は全体を落とす。
- 日付変更線で別の部分に割れた MultiPolygon の内向きバッファは、継ぎ目に沿って細い帯を削る（以前から）。
- GIS 基盤の外に、同じ計算（点の内外・距離・bbox・重心・簡略化）の別実装が約 40 ファイルある。今回はその
  受け皿（`bbox`・`centroid`・`simplify`）を核に置いたところまで。半径の定数が違うもの（`js/year-book.js` の
  6378137）は面積が約 0.1% ずれる。

## 7. 起動費用（`check:perf` の天井を上げた理由）

CI の実測で 3 行が天井を超えた。どれもこの変更が足した能力を運ぶバイトで、`node scripts/perf-budget.mjs --update`
（超えた行だけを上げる）で記録した。

- **遅延チャンク `gis-core` 537.6 → 572.4 kB。** 幾何カーネル（極を含む円盤・辺ごとの帯・新しい 5 プリミティブ、
  gzip で +19 kB）と op（5 op・格子・統計、+11.7 kB）。分析を開いたときだけ読まれる。
- **遅延チャンク `gis-export` 19.2 → 29.5 kB。** KML・GPX の書き手（+6.3 kB）。書き出したときだけ読まれる。
- **起動時 `eager.gzip` 1506.0 → 1513.7 kB（帯 7.5 kB を 0.2 kB 超過）。** Atlas が新しい op と書き出しを知るための
  手引きと能力行（`js/atlas-cap-data.js` +1.6 kB）、地図の円も使う極で正しい円盤の作り方（`js/geodesy.js` +1.2 kB）、
  パネルの拒否文と単位（`js/gis-panel.js`・`js/gis-units.js`）。Atlas の手引きは起動時に要る（そこに無い能力は呼ばれない）。

測り方: `--update` は「CI が測る木（HEAD を origin/main に merge したもの）」以外での書き込みを拒む。手元の build
（約 25 分）の間に main が 2 回進んだので、同じ拒否を繰り返さず、branch を main に載せた木の手元の実測
（CI の実測 1513.7 / 572.4 / 29.5 kB と一致）をその 3 行にだけ書いた。その後に main へ入った 2 本（#1172・#1180）が
変えた出荷コードは約 70 行で、帯（7.5 kB）の内側。

追記: 次の CI（main に 10 本ほど載った木）で `eager.brotli` が 1151.2 kB と帯（5.7 kB）を 0.7 kB 超えた
（天井 1144.8 kB。gzip と同じ理由のバイトに、その間に main へ入った分が重なった）。CI が表示する 0.1 kB の
上端（1151.25 kB＝1,178,880 B）を書いた。表示の丸めぶん（最大 51 B）の余りは、merge 後に main の
`perf-ceiling.yml` が実測へ締め直す。
