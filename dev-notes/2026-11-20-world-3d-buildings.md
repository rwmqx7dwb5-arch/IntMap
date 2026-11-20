---
title: 日本の外の 3D 建物 — 3D BAG（オランダ）と Re:Earth Buildings（世界）を、世界のジオイド格子で地面に合わせて開く
date: 2026-11-20
newsen: The 3D city models layer now also draws building models for the Netherlands (3D BAG, LoD2.2) and for cities worldwide (Re:Earth Buildings, from Overture and OpenStreetMap), set on the ground with the local geoid height.
newsjp: 3D都市モデルのレイヤーが、オランダ（3D BAG・LoD2.2）と世界の都市（Overture と OpenStreetMap 由来の Re:Earth Buildings）の建物も描くようになりました。その土地のジオイド高で地面に合わせます。
---

〈依頼〉 世界の 3D データを調べ、ライセンスを確かめ、実データで被覆を拡大。端末別の LOD・メモリ、地形との位置合わせ、建物属性。自前エンジンは作らず Cesium 基盤を使う。出典表記も更新。

## 1. 調べたもの（2026-11-20・商用可でキー不要のものだけ採る）
| 候補 | 結論 |
|---|---|
| **Re:Earth Buildings** `buildings.reearth.land/tileset.json` | **採用**。世界・3D Tiles 1.1・CORS `*`・ODbL 1.0（OSM + Overture。クレジットは tileset の `asset.copyright`）。運営 Eukarya が「ベストエフォート・稼働保証なし・本番では自前ミラーを」と明記 |
| **3D BAG** `data.3dbag.nl/v20250903/cesium3dtiles/lod22/tileset.json` | **採用**。オランダ全土 LoD2.2・CC BY 4.0・「利用量の上限なし（将来変わりうる）・著作権表示必須」。EPSG:4978（楕円体高） |
| Cesium ion の OSM Buildings / World Terrain | 不採用: ion トークンが要る（このエンジンは `Ion.defaultAccessToken` を持たない設計） |
| Google Photorealistic 3D Tiles | 不採用: API キーと課金が要る |
| swissBUILDINGS3D（`3d.geo.admin.ch/.../v1`） | 取得はできたが旧版（v1・ion 由来の extras）。ライセンス・版の確認が済んでいないので見送り（未了として記録） |
| ヘルシンキ（kartta.hel.fi） | この環境から接続できず未確認 |

⚠ Re:Earth の「稼働保証なし」への備え: 読めなければ既存の足跡押し出し「3D建物（都市）」が残る。開くのは zoom 12 以上の 1 本だけ、メモリは端末別の共有予算（`js/tileset-budget.js`）の中。**自前ミラーは未着手**（運営の推奨）。

## 2. 高さの基準を、タイルの中身で確かめた（ブラウザの計器より先に）
Re:Earth の glb は node の matrix の原点が**楕円体高 0 m**で、局所 Y が上。POSITION accessor の `min[1]` が最も低い建物の底の楕円体高になる。5 大陸の都市で z14 タイルの最低点を読むと、**既知の海抜の地面 + EGM2008 の N** に一致した:
Paris 71.5 m = セーヌ河床 ≈27 + N 44.7 ／ Denver 1568 m = 南プラット川 ≈1585 + N −17.2 ／ Mumbai −67.9 m = 海面 + N −68.5 ／ Sydney 23.4 m = 海面付近 + N 22 ／ New York −33.9 m = 海面 + N −33。
⇒ 補正は `heightOffset = −N`（カメラ位置）で正しい。属性として glb は `height`・`min_height`・`ground_elev`・`height_method`・`name`・`class`・`gers_id` を持つ（EXT_structural_metadata）が、**属性の表示 UI は今回入れていない**（未了）。
3D BAG は tileset が EPSG:4978 の ECEF なので楕円体高。同じ −N を当てる（オランダ全域で N は 42〜47 m。カメラ位置で付け直すので誤差は数十 km で 1 m 未満）。
`tests/world-3d-buildings-profile.spec.js`（SwiftShader＝CPU 描画の実測）: 開いたタイルセット・初回内容までの時間（11.7〜16.5 s・網待ち）・タイルメモリ（7〜31 MB）は取れた。**DEM 側の地面は頭なし描画では 12 秒後も粗い（0 のまま）ことが多く、都市別の「地面との差」は Amsterdam で 1〜3 m に収まった一方、Denver・Sydney では意味のない値になった**。この差は計器の限界で、基準の根拠は上の glb の読みである。実 GPU・実機は未計測。

## 3. 世界のジオイド格子
`scripts/build-geoid-grid.mjs` → `data/geoid-egm2008.bin.gz`（EGM2008 5′ を 6 つ置きの 0.5° 格子・Int16 cm・459 KB）。5′ の真値に対し 60,000 点で平均 0.10 m・最大 3.87 m・99.4% が 1 m 以内（1° なら平均 0.25 m・最大 7.8 m、15′ なら最大 1.3 m だが 2 MB）。読むのは世界のタイルセットが開くときだけ。**格子が読めなければ開かない**（誤った補正は最大 約100 m 浮き沈みする）。日本は PLATEAU の都市別 GSI の値のまま（こちらのほうが細かい）。

## 4. 実行時
`js/world-3d-sources.js` に 2 行（id・URL・範囲・minZoom・quality・ライセンス・クレジット）。優先は PLATEAU(3) > 3D BAG(2) > Re:Earth(1)。**良い方が開いている範囲は下位から抜く**（エンジンの新メンバー `placeTileset` の `excludeBoxes` ＝ Cesium ClippingPolygon）。限界: 抜くのは PLATEAU 市区・3D BAG の**外接矩形**なので、矩形の中で PLATEAU が建物を持たない部分（浜松の山間など）は Re:Earth も描かない。実描画で重なりの有無は見ていない（Tokyo で両方が開くことだけ確認）。カメラが動いてジオイド高が 0.25 m 以上変わったら `placeTileset` で付け直す。
否定された見立て: Re:Earth のタイルの bounding region（0〜1000 m）の最低高から地面との差を測る — region は建物の底を言わない上、tileset を動かすと Cesium が region を箱に作り替えるので、測っていたのは補正量そのものだった。

## 5. 出典
`js/reference-data.js`（クレジット 2 行）・`js/locales/pages.{en,ja}.js`（レイヤー説明）・Privacy §4（en/jp）・`scripts/outbound-hosts.json` と接続台帳・`security.html`/`readiness.html` とその日本語版（`org-pages --write`）。レイヤーの表示名は「東京の 3D 都市モデル」から「3D都市モデル（日本・オランダ・世界）」へ。

## 6. 出自の台帳
`scripts/build-geoid-grid.mjs` の `GOVERNANCE` に出自・ライセンス（パブリックドメイン）・周期 `static`（EGM2008 は 2008 年に完成したモデル。後継 EGM2020 は未公開）を値で宣言した。`integrity.*`（欠損・範囲外・重複）は、全球を覆う固定寸法の Int16 格子（720×361）には「行」も「欠損」も無く、`mountGeoid` が寸法の不一致を読み込み時に拒む（tests/world-3d-sources-checks.test.mjs）ので、別途の計測を足さず台帳（`data/governance-ledger.json`）に 2 件足した。取得は `res.ok` を確かめてから書く。

## 7. 予算の天井を上げた理由（`tests/perf-baseline.json`）
`async chunk "cesium-engine"` 71.3→74.1 kB は新メンバー `placeTileset`（高さ補正の付け直しと ClippingPolygon による切り抜き）の分。`async.raw` 14136.4→14212.6 kB（+76 kB）は、PR の rebase 前後の両方で同じだけ増えていた（rebase が足したのは他 PR の 2 本）が、**増分の内訳は chunk ごとに特定していない**——新しい 2 モジュール（world-3d-sources 1.1 kB・geoid）は遅延 chunk にして起動の eager 側には入れていない（eager.modules は元の 913 のまま）。ジオイド格子（459 kB gz）は起動グラフに入らず、世界のタイルセットが開くときだけ読む（`js/boot-stage.js` に行を足した）。
