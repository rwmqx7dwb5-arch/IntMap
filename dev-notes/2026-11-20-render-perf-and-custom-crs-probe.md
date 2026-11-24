---
title: 表示性能の再計測と MapLibre のカスタム CRS の判断——大きな地物集合は詰まらない・カスタム CRS は今は入れない
date: 2026-11-20
newsen: No user-visible change. We re-measured map drawing on a real GPU and checked whether MapLibre's experimental custom coordinate systems would help polar or regional maps; they would not yet.
newsjp: 利用者に見える変更はありません。実 GPU で地図の描画を測り直し、MapLibre の実験的なカスタム座標系が極域図・地域別の地図に役立つかを確かめました。今は入れません。
---

〈依頼〉最も効く表示性能のボトルネックを実測で特定して構造で直す。MapLibre 6.15 のカスタム CRS が役立つか実測で判断する。

## 0. 前提の訂正

依頼文は「6.15」だが、リポジトリは既に **maplibre-gl 6.18.0**（#1202）。更新は要らない。`addProjection` / `removeProjection` は
6.18 の型定義に実在する（`node_modules/maplibre-gl/dist/maplibre-gl.d.ts`）。

## 1. 測った（Windows・Intel Arc 実 GPU・ANGLE D3D11・1280×800・同じ build を同じ分に）

SwiftShader（GPU 無し）では 1 点でも 20 万点でも 1 フレーム約 240 ms で、差が測れない（描画が全部ソフトウェア）。
実 GPU で測ること。

| 状況 | フレーム p50 / p95 | 読み込み増分 |
|---|---|---|
| 地物 1 個（基準） | 16.7 / 48.9 ms | 2.6 s |
| 点 20 万（円） | 16.7 / 42.6 ms | 8.2 s |
| 小さな多角形 5 万（塗り） | 16.8 / 51〜90 ms（試行で幅あり） | 6.0 s |

- 大きな地物集合は**描画ではなく読み込み（worker の分割）**に時間を使い、ズーム中のフレームは基準と同等。
  主スレッドの自己時間の上位は画像デコード・`measureText`・シェーダ初期化で、地物の数に比例するものは無かった。
- `scripts/map-motion.mjs`（wheel / drag / dblclick / wheelOut / longDrag / globeWheel）では p95 が 16.8〜33 ms、
  ハング（長フレーム）は 1〜4 回。長フレームの上位 script は `js/glyph-store.js:70`（IDB の読み戻しの後続の連鎖・321 ms と
  54 ms の 2 回）と `src/sat-worker-client.js:30`（107.8 ms）。ただし CPU プロファイルで 2 回目の訪問を測り直すと、
  glyph-store の関数は自己時間の上位に出ず（上位は `decode`・`measureText`・GC）、1 回の観測で原因と決められなかった。

## 2. 判断

- **単独で構造を直すに足るボトルネックは今回の計測では特定できなかった。** 推測で分岐や上限を足すことは
  `.agents/rules/no-ad-hoc-hardcoding.md` が禁じるので、コードは変えていない。
- 次に測る候補（観測済みだが原因未確定）: ① 回し直し時の `measureText`（visit 2 で 108 ms）が地名グリフ保存の効果と
  整合するか ② 衛星タイルの `decode` 156〜167 ms を worker 側で済ませられるか（`sat-worker-client.js` の経路）。
  どちらも実 GPU の実機で複数回測ってから。

## 3. カスタム CRS（`addProjection`）は今は入れない

6.18 の仕様（型定義の注記）から、IntMap の描画能力に対して役立たない理由:

1. **タイルは再投影されない。** 登録した CRS では「すべてのタイル源はそのタイルマトリクスで切られている」と仮定し、中身は
   そのまま使われる。IntMap の既定の基図・OHM・衛星・各ベクタータイルはすべて Web Mercator で切られており、極域の
   座標系では描けない。使うには極域用に事前投影されたタイル（例: NASA GIBS の EPSG:3031 / 3413）が要る。
2. GeoJSON 源は worker で変換されるため `definition`（PROJ/WKT）と worker 側の proj4 の設定が要る。
3. 登録した CRS の地図は世界のコピーも日付変更線の折り返しも持たない（全球の連続した地図でなくなる）。
4. 極域の見え方は、既存の `globe` / `vertical-perspective` 投影と 3D エンジン（Cesium）が既に答えている。
   極域の解析用の面は `js/gis-crs.js` が持ち、座標変換と歪みの測定は別経路で足りている。

⇒ 入れても、極域のタイルを別途手に入れて新しい表示モードを作ることになり、既存の能力は増えない。
**再検討の条件**: 極域用に事前投影された商用で使えるタイルの典拠を IntMap が採用したとき。

## 4. 触ったもの

この記録のみ。能力・仕様・データソースの変更は無い。
