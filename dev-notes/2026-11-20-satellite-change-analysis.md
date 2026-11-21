---
title: 衛星画像を背景から観測データへ——2 時点の変化を同じ格子で測る統一経路（光学・SAR・土地被覆・AlphaEarth 埋め込み）と、埋め込みによる geo.similar
date: 2026-11-20
newsen: Atlas can now measure what changed at a place between two times from real satellite data (optical, radar, land cover, and Google's AlphaEarth embeddings), say which images it used, and find similar regions by satellite signature.
newsjp: Atlas が、2 つの時期の実際の衛星データ（光学・レーダー・土地被覆・Google AlphaEarth の埋め込み）から場所の変化を測り、使った画像を示せるようになりました。衛星から見た特徴で似た地域も探せます。
---

〈依頼〉外部監査（2026-11-20）の P2: 衛星画像を背景から分析可能な観測データへ。(1) 異なる撮影日の画像取得・雲除去・解像度/位置合わせを伴う変化検出の統一経路と根拠管理、(2) `geo.similar` を OSM 特徴から衛星埋め込みへ拡張。
土台は #1297（供給元の台帳）と #1298（geo.similar 第 1 スライス）。この PR は両者の枝を取り込んだ上に載っている（両者が先に merge されると差分は本 PR の分だけになる）。

## 1. 実測した取得経路（2026-11-20、実際の URL に対して。ブラウザからの読み出し＝ CORS・範囲読みを含む）

| 観測 | 経路 | 実測 | 利用条件（一次情報） | 採否 |
|---|---|---|---|---|
| 光学 | Earth Search `sentinel-2-l2a`（STAC）＋ `sentinel-cogs` の COG | STAC 200・COG は `access-control-allow-origin: *`・Range 可。東京 3.6 km 窓 ×（SCL ＋ 2 帯域）× 2 時点で約 14 s | Copernicus Sentinel データ（無償・全面公開）。帰属は ESA WorldCover のページが「Contains modified Copernicus Sentinel data」と述べる形。⚠ Sentinel Data Legal Notice の PDF は取得ツールで本文を読めず、文言は再確認していない | 採用 |
| SAR | Planetary Computer `sentinel-1-rtc`（γ0・地形補正済み）。匿名 SAS トークン（`/api/sas/v1/token/<collection>`）で読む | トークン API は CORS `*`・Blob は SAS 付きで CORS `*`・Range 可。東京 3.6 km 窓 × 2 パスで約 18 s | コレクション JSON が CC-BY-4.0・加工は Catalyst。⚠ Planetary Computer 自体の利用規約のページは取得ツールが題名しか返さず読めていない | 採用（規約の再確認は残り） |
| 土地被覆 | Planetary Computer `io-lulc-annual-v02`（Impact Observatory・10 m・2017–2023・年ごとに同じ手法） | 東京 3.6 km 窓 × 2 年で約 20 s。クラス表はコレクションの `file:values` から読む（コードに写さない） | CC-BY-4.0（コレクション JSON） | 採用 |
| 埋め込み | Source Cooperative `tge-labs/aef`（Google AlphaEarth Foundations Satellite Embedding V1 annual・2017–2025） | `data.source.coop` は CORS `*`・Range 可。COG は **zstd・下端原点（y 解像度が正）・1 面 1 帯域（64 面）・符号つき 8 ビット（nodata −128）・タイル 1024²** | **CC BY 4.0**（Google の Earth Engine 文書・Source Cooperative・AWS レジストリの 3 つが一致）。帰属文: 「The AlphaEarth Foundations Satellite Embedding dataset is produced by Google and Google DeepMind.」。商用の制限の記述は 3 ページとも無い | 採用 |
| 土地被覆（単年） | ESA WorldCover（AWS `esa-worldcover`） | HEAD は 200 だが **CORS ヘッダが無い**（ブラウザから読めない） | CC BY 4.0 | **載せない**（年次比較は上の IO LULC。WorldCover の 2020 と 2021 は版が違う） |
| 標高 | Copernicus DEM（AWS `copernicus-dem-30m`） | 同じく CORS ヘッダ無し | — | 載せない（SAR の RTC が内部で地形補正に使う） |
| 夜間光 | VIIRS DNB 年次合成（EOG）／NASA Black Marble | EOG の利用条件は「多くは CC BY 4.0」とあるだけで、ライセンス PDF は本文を読めず、匿名で CORS つきの数値の配信元を確認できなかった。GIBS は地図タイルの画像で数値ではない | 不明 | **含めない**（確認できない供給元を描かない。次の機会に EOG の配布形態を確認する） |

## 2. 構造

- `js/gis-geotiff.js`（読み出しの欠け 3 つを埋めた）: ① **zstd**（`fzstd` 0.1.1・MIT。要るファイルだけ動的 import）② **下端原点**（`ModelTransformation` の y が正のとき `flipY`。`y0` は高さが分かった時点で北端に直し、`readRegion`/`read` は常に北が上の行で返す）③ **多帯域**（`readRegion({bands:[…]})` は 1 回で複数帯域。面が別々のファイルは全帯域のチャンクを 1 回の sweep に載せる）。
  あわせて、チャンクの取得を最大 8 並列にし（64 面の窓は 130 回の範囲読みで、直列は 73 s → 並列 22 s）、同じブロックを 2 回取らないよう取得中のブロックを待つ（`tests/cog-url-connect-checks` の ① ⑤ が実際に落ちて見つけた）。
- `js/gis-cog.js`: `readWindow(url, {bands:[…]})` が同じ格子の `rasters` を返す。
- `js/imagery-change.js`（純粋）: 指数・差・閾値・遷移表・埋め込みの復元と距離・根拠 `evidenceOf`。
- `js/imagery-change-io.js`: 探索と読み出し。光学は STAC を雲量の昇順で引き、**SCL で窓の使える画素の割合を測り**、基準未満の候補は次へ（同じ MGRS 格子を優先: 再標本化なしで重なる）。SAR は前の画像の**軌道方向・相対軌道**と同じ後の画像だけを探す。埋め込みの索引は下記。
- `js/imagery-change-atlas.js` ＋ `js/atlas-cap-geo.js`: 能力 **`geo.imageChange`**（kind = optical / sar / landcover / embedding）と、`geo.similar` の `signal:'embedding'`。結果のラスタはデータセットに登録され（`gis.dataset`）、`provenance.evidence` に根拠が残る。

### 根拠管理（画像由来の推定）
どの回答・データセットにも同じ形の `evidence` が付く: `basis:'image-derived'`・画像（id・撮影日・雲量・MGRS 格子／軌道・STAC の URL・出典・**利用条件と帰属**）・手順・閾値（k）・格子（範囲・画素数・画素の大きさ・再標本化）・品質（使えた画素の割合・同じ格子か・試した候補と理由）・**制約 3 文**（画像からの推定であって地上の観測でない／変化は原因でない／閾値は分布から決めたもので較正した水準でない）と、種類ごとの註。

### 閾値の決め方
定数を置かない。差の中央値と MAD から中央値 ± k·σ（σ = 1.4826·MAD、k = 3 は頑健な z 値の慣用で上書き可）。全面のずれ（季節・太陽高度）は中央値に吸収され、局所の変化だけが印になる（`tests/imagery-change-checks` ①）。変化が過半を占めると中央値が動くので、回答が「40% 超は撮影条件の違いか全面変化で、区別できない」と述べる。
埋め込みの距離（1 − cos）は右に強く歪むので、閾値は**角度** θ = √(2(1 − cos)) の分布で決め、距離に戻して報告する。距離のまま当てると合成データで 40 画素の変化に 98 画素が印になった（θ では 40 画素を全部捉え、偽陽性は 3% 未満）。

### AlphaEarth の索引を読む方法
索引（`aef_index.csv` 798 MB・parquet 78 MB）は丸ごと読めない。観測（先頭・10%・25%・50%・75%・90%・99% の各位置）で**北半球 1N…60N → 南半球 1S…60S、帯の中で年の昇順**に並んでいると分かったので、**バイト範囲の二分探索**（16 KB の探りを約 30 回）で (UTM 帯, 年) の塊（約 1 MB）だけを読み、区画の外形で絞る。読んだ行が欲しい (帯, 年) でなければ `index-order-unexpected` と名指しして止まる（黙って別の年の画像を返さない）。公開配布先の接続が途中で切れる実例（undici "terminated"）があったので、範囲取得は 1 回だけ取り直す。
`geo.similar` の埋め込み版は、区画が 1 つの広い窓に収まるなら**窓を 1 回だけ読んで局所で区画に切り分け**（東京近傍で 14 区画 33 s）、離れた候補は区画ごとに読む。

## 3. 実データでの測定

- 東京（139.74–139.78E, 35.66–35.70N）・40 m 画素・2019 と 2025 の NDVI: 光学 2 時点とも MGRS 54SUE で同じ格子。使える画素 96%、変化 12.8%。
- 同じ窓の SAR（2024-06-17 と 2025-06-24 の同一軌道）: dB の差の中央値 −1.16、変化 2.2%。
- 同じ窓の土地被覆 2018→2023: 変化 1.7%（Built area → Water 86 画素など。⚠ 港湾域で、分類器の誤差を含みうる）。
- 同じ窓の埋め込み 2019→2024: 変化 7.6%（距離の中央値 0.0375・閾値 0.112）。
- geo.similar（埋め込み・2024）: 深圳・南山（22.54N 113.95E）の 2 km 区画に対し周囲 14 区画。上位は隣接区画（0.990・0.983 …）、候補全体の中央値 0.968・最小 0.362。都市域では中央値が高いので、回答は**この広がりに照らして読め**と述べる。

## 4. 保証していないこと・残り

- **夜間光は含めていない**（§1）。標高は変化の観測としては扱わない。
- Esri など背景の撮影日・供給元は #1297。この PR は背景の置き換えではなく、分析用の読み出し。
- Planetary Computer の利用規約と Sentinel Data Legal Notice の PDF は本文を読めていない。IntMap 自体のライセンスは「個人・研究用」（`LICENSE`）で、商用の可否が要る場面は未確認のまま。
- 光学の位置合わせは、同じ MGRS 格子ならそのまま、違えば nearest で 1 画素までのずれがありうる（根拠の註に出る）。サブピクセルの共登録はしていない。
- 光学・SAR は 10〜30 s、埋め込みは索引の探りを含めて最大約 90 s（東京で 81 s を測った）。進捗の表示は無い。
- 結果は 1 窓（既定 3 km・最大 26 万画素、埋め込みは 4 万画素）。大きい範囲は画素が粗くなり、回答がそれを述べる。

## 5. 消したもの・引き継いだもの

何も消していない。`tests/geo-gis-geotiff-checks.test.mjs` の ⑭ は「zstd は未対応」を例に使っていたので、まだ未対応の webp（50001）へ替えた（zstd は読めるようになった。肯定側の検査は `tests/imagery-change-checks.test.mjs` ③）。

## 6. 門の動かし方（理由つき）

- `tests/global-surface-baseline.json`（`--update`）: 本 PR の `js/imagery-change-atlas.js` が `window.IntMapData`・`IntMapGisCrs`・`IntMapGisWarp`・`IntMapLazy` を 1 回ずつ読む（Atlas の遅延 chunk が GIS 核の部品を受け取る既存の形。gis-atlas.js が核から受け取るのと同じ部品で、第 2 の写しではない）。同じ更新に #1297 側の `IntMapSafe`・`IntMapTime`・`__sat` の読みも入った（#1297 のコードで、本 PR のものではない）。
- `tests/i18n-coverage-floor.json`（`--update-floor`）: 能力の説明文と回答の文が足した L(en, jp) の行ぶん、各言語のインライン表の行数が 1 増えた（en+jp の方針で、他言語の翻訳は足していない）。
- `docs` の能力数は 252 → 254（到達可能 249 → 251）。検査が実体と照合する。
- 隣接した対の表（`[英, 日]`）は `js/imagery-change-atlas.js` で作らず L() の呼び出しにした（i18n の計器の視野の外の穴を増やさないため）。

## perf の天井を上げた理由（2026-11-21）

`async.raw`・`async.gzip`・`atlas-cap-runs`・`atlas-console`・`gis-geotiff`（COG の zstd・下から読む・複数バンド）・`legal-text`（Source Cooperative と AWS Open Data の通信先の開示）・`dist.assets` を実測へ。増分は 2 時点変化検出の経路（`imagery-change*.js`）と、COG 読みの拡張、能力 1 つ分の文書による。いずれも遅延チャンクで、起動時の転送は増えていない。あわせて、どこからも名指しで使われない export（`planCells`・`SCL`・`robustStats`・`robustThresholds`）を内部に戻した。

## perf の天井: atlas-orchestrate

main に取り込んだ #1280（統合知識層）が atlas-orchestrate チャンクを 82.4 kB から 89.4 kB に押し上げた（CI の check:perf が測定。この PR の差分は orchestrate に触れない）。#1280 の基準は atlas-console だけを上げていたので、天井を測定値 89.4 kB（91600 バイト、帯 2.0 kB の内）へ上げた。失効条件: main 側で orchestrate の天井が上がったら取り込んで重複を消す。

追記(2026-11-22): main の #1293(画面ボード)を取り込んだ後の測定で async.raw が 14461.8 kB、atlas-cap-runs が 926.1 kB になり、ceiling(14376.3 / 918.5 kB)を超えた。増分は main 側の能力追加(ボード)と本 PR の能力説明の合計で、どちらも帯の内。天井を測定値(14809000 / 948400 バイト)へ上げた。
