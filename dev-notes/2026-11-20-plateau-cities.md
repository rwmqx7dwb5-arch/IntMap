---
title: PLATEAU の 3D 建物を東京23区だけでなく日本の約450市区へ。都市別ジオイド補正と近傍だけの読み込み
date: 2026-11-20
newsen: The 3D PLATEAU building models now cover about 450 Japanese cities and wards instead of Tokyo only, each set on the ground with its own local geoid correction.
newsjp: PLATEAU の3D建物モデルが東京23区だけでなく日本の約450市区に広がりました。各都市の地面の高さに合わせて表示します。
---

〈依頼〉 Google Earth 級の 3D 都市に向け、PLATEAU 実建物モデルを東京以外へ広げる（手書き列挙を増やさない・都市別ジオイド・メモリ配分）。

## 1. 登録は導出する
`scripts/build-plateau-cities.mjs` → `data/plateau-cities.json`。カタログ `latest_datasets` の建物 3D Tiles（448 市区）から、市区ごとに LOD2 テクスチャ付き > LOD2 > LOD1 の順で内容のある 1 件を選び、tileset の root region から範囲、国土地理院ジオイド計算（JGEOID2011）から都市別ジオイド高（28.1〜43.7 m。千代田 36.84 m は 2026-11-19 の描画実測 36.7 m と一致）を持たせる。
⚠ 実測で見つけた上流の穴: 浜松市 7 区の LOD2 `-latest` は**中身の無い空の tileset**（root に content も children も無く、範囲が日本全体）。範囲を信じると浜松が全国を覆うので、中身のある次点の variant を採る（無ければ落として報告）。
⚠ GSI の計算窓口は 1〜2 秒より速く叩くと HTTP 200 のまま「混み合っている」を返す。1 件ずつ・間隔つき・再試行（再開用キャッシュ `PLATEAU_GEOID_CACHE`）。

## 2. 実行時
`js/plateau-cities.js` は手書き一覧と単一定数 `PLATEAU_HEIGHT_OFFSET_M` を廃止。`plateauUnitsNear`: zoom 9 以上でカメラ近傍（12〜60 km）の市区だけを近い順に最大 32 件開く。各 tileset に `heightOffset = -geoid`。`beta-overlays.js` は moveend で同期。

## 3. メモリ配分
`_governTilesets`: 合計予算をカメラへの近さで配分（近いほど多く）、超過時は遠い側ほど速く screenSpaceError を上げる。

## 4. 実描画の実測（2026-11-20・`tests/plateau-cities-profile.spec.js`・SwiftShader＝CPU 描画、実 GPU・実機は無し）
建物タイルの最下点（海面基準の地面からの高さ）: 東京 1.1 m・大阪 −1.3 m・名古屋 −1.2 m・那覇 0.7 m・札幌 8.9 m（札幌の地盤は海抜十数 m）。補正が無ければ各都市で 28〜44 m 浮く。開いた tileset は近傍のみ（東京 24・大阪 32・札幌 10・名古屋 19・那覇 1）。タイルメモリ 26〜286 MB（PC 予算 384 MB 内）。初回内容まで 東京 14.9 s・大阪 6.8 s・札幌 10.0 s・名古屋 8.9 s・那覇 8.4 s（網待ち）。
否定された見立て: 「近い 4 件を先に開き残りを 2.5 秒後に」は初回表示を速くしなかった（東京 17.9 s・大阪 12.2 s と同等か悪化）ので入れていない。東京の初回 16 s→14.9 s は計測のゆらぎの範囲で、改善とは主張しない。携帯相当は再計測していない。
