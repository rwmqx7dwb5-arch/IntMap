---
title: Cesium の globe ドラッグを MapLibre 6.4 のバーソル回転に移した——同じ経路で掴んだ地点の滑りが Cesium 3.02° / MapLibre 0.26°（z4・pitch 40）だったのが 0.2536° / 0.2573° に、縁を越えるドラッグ後の中心の差 5.9° が 0.09° に。MapLibre 自身の滑りは 0 ではなく、それを再現する
date: 2026-09-28
---

〈依頼〉MapLibre 6.4 で globe のドラッグが「掴んだ地点を指に付けたまま回す」方式になった
（`dev-notes/2026-09-27-maplibre-6-migration.md` §7 の未了）。第 2 エンジンの `js/cesium-input.js` は 5.24 の
方式のままで、同じ操作で感触がずれる。MapLibre 側を基準に、縁を越えるときの扱いも含めて揃える。慣性とも整合させる。

## 0. MapLibre 6 の方式（`node_modules/maplibre-gl/src/geo/projection/globe_utils.ts`）

`VerticalPerspectiveCameraHelper.handleMapControlsPan` → `versorSetLocationAtPoint(tr, _, anchor, panDelta)`。
移動 1 回ごとに、**動く前のカメラ**で:

- 支点 `anchor` = 指が球に当たっていれば指、外れていれば中心の画素（`tr.centerPoint`）。
- `to = panSurfaceLocation(anchor)`、`from = panSurfaceLocation(anchor − panDelta)`。
  `panSurfaceLocation` は視線と「カメラ→球心」の角 `angle = atan2(s, c)` が縁の角 `asin(1/D)` の 90%
  （`PAN_FALLOFF_BAND = 0.1`）未満なら正確な当たり。それを越えると正確な曲線 `asin(D sin a) − a` を
  値と傾きの一致する双曲線で継ぎ、`PAN_MAX_ANGLE = 0.98π` で飽和させる——縁の外の指もどこかを指す。
- 向きの四元数 `q = fromEuler(−lng, −lat, bearing)`（gl-matrix、zyx）に、`from` を `to` へ運ぶ回転
  `δ = (w_y s, −w_x s, w_z s, cos t)`（`w = from × to` の単位ベクトル、`t = acos(from·to)/2`）を右から掛け、
  中心を読み戻す。**方位は保つ**（`fixedBearing`）——ねじれを捨てるので、掴んだ地点は
  「中心からの距離 × ねじれ」だけ滑る。
- 中心の緯度が `MAX_VALID_LATITUDE` の 12° 以内では、経度を smoothstep で極のまわりのダイヤル
  （`dθ = (r × Δ) / max(|r|², 20²)`、`r` は指 − 極の画素）へ移す。
- ズームは `getZoomAdjustment(旧緯度, 新緯度)` を足して球の見かけの大きさを保つ。
- **離した後の慣性**は変わらず `handlePanInertia` → `computeGlobePanCenter`。

⚠ **MapLibre 自身の滑りは 0 ではない**（node で MapLibre の `GlobeTransform` を直接動かして実測）: 800×600・
z2.5・中心から外れた斜めのドラッグで 8 歩後 0.27°、z1.7 で縁へ向かうと 7.4°、z6 で 0.015°。1 歩の滑りは
`fixedBearing:false` にすると 0 になる——滑りの正体は方位を保つことそのもの。だから目標は「Cesium で滑りを 0 に
する」ではなく「MapLibre と同じだけ滑る」。

## 1. 直す前（赤）

`tests/cesium-globe-drag-cesium.spec.js` を直す前の build に当てた（同じページ・同じ 1280×720・同じ経路、
各エンジン自身の面で掴んだ地点と指の下の地点の角距離）。各列の最大:

| 経路 | 滑り MapLibre | 滑り Cesium | 中心の差 |
|---|---|---|---|
| z2.5 斜め・中心外 | 0.61° | 0.92° | 0.77° |
| z3 極の近く（ダイヤル） | 0.25° | 0.96° | 0.91° |
| z4 pitch 40 | 0.26° | **3.02°** | 3.18° |
| z1.7 縁を越える | 4.35° | 6.22° | **5.95°** |

（縁の経路はこのとき 180 px から 30 px 刻みで、1 歩目で縁の外に出た。直した後は縁の手前を細かく測るため
150 px から 15 px 刻み・10 歩に変えている。）

## 2. 直したもの（`js/cesium-input.js`）

1. `globeDrag(cam, x, y, dx, dy, geo)` — 上の式の写し（`raySphere`・`panSurface`・`orientation`・
   `fromOrientation`・`versorCentre`・`fixedBearingLng`）。描画器を知らず、`geo`（画素を通る光線を単位球の
   空間で・単位球上の点から lng/lat へ・投影・中心の画素）だけを読む。定数 `PAN_FALLOFF_BAND`・
   `DIAL_MIN_RADIUS_PX`・`PAN_MAX_ANGLE` を足した。
2. Cesium 側の `geo`: 楕円体の各軸を半径で割ると単位球になり、直線は直線に写る。その空間で式をそのまま
   走らせ、戻すときに軸を掛け直して測地緯度にする——正確な当たりは `pickEllipsoid` と一致し、縁の減速は
   そこに連続で継がる。**メッシュ（`_pickLngLat`）は読まない**（低ズームで弦が曲面の内側へたわむ。MapLibre の
   ドラッグも地形を読まない）。極の投影は `SceneTransforms` ではなく行列で直接行う（MapLibre の
   `locationToScreenPoint` はカメラの後ろの点も投影し、ダイヤルは地平線の向こうの極にも要る）。
3. ⚠ **MapLibre の 1 歩の回転は単精度**だった: `quat.fromValues` は gl-matrix 既定の `Float32Array` を作る。
   これを写さないと 1 歩あたり中心が 6e-7° ずれ、下の ② が捕まえた。`Math.fround` で同じ丸めにした。
4. マウスの pan（`onMove`）とタッチの pan（`touchMove`。支点は指の平均＝ピンチの中点、移動量は指数で割った
   平均——`TouchPanHandler` と同じ）が `globeDrag` を呼ぶ。**慣性は `panCentre`（`computeGlobePanCenter`）の
   まま**で、記録するのは同じ画素の移動量——6 系の `handlePanInertia` と同じ継ぎ方。

## 3. 検査

- `tests/cesium-globe-drag-checks.test.mjs`（node）: 同梱の `maplibre-gl/src` を esbuild でその場で束ね、
  **MapLibre 自身の `GlobeTransform` と `handleMapControlsPan`** と、同じ状態の変換から作った `geo` で動かす
  `globeDrag` を 9 経路（縁越え・縁の外だけ・日付変更線・北極／南極＋方位 30°・pitch 40 を含む）の全歩で
  比べる。最悪の差 2.27e-13。定数 4 つは MapLibre の宣言から読む。滑りの表（MapLibre / globeDrag / 旧法則）:
  z4 pitch 40 で 0.2720° / 0.2720° / 3.1989°、極の近く 0.2533° / 0.2533° / 0.9787°。呼び出し元（ドラッグ 2 か所は
  `globeDrag`、慣性だけが `panCentre`）を AST で確かめる。直す前は `globeDrag` が無く ②③④ が赤。
- `tests/cesium-globe-drag-cesium.spec.js`（実描画・両エンジン）: 最初は 6 経路で書き、直した後の最悪の歩で
  |Δ滑り| 0.026°（z1.7 縁の手前、両者とも 9.9° 滑る所）、中心の差 0.089°（z1.7、縁の外まで 10 歩）を測った。
  1 歩ごとに中心の差が約 0.01° ずつ積もる（z2.5）のは球と楕円体の違いで、z2.5 の 1 画素（約 0.14°）より小さい。
  ⚠ **その形は 1 回 174 秒で、試験全体の予算（#R203 の 2 つの天井の和 5,250 秒・下がる方向にだけ動く）を
  5,254 秒にして CI の r204〜r206 を赤にした。** 式の全経路の一致は node の ② が MapLibre 本物に対して 9 経路・全歩で
  持っているので、spec は実描画でしか言えないことだけにした: 1 ページで各エンジン 1 回ずつ、pitch 40 の 4 歩
  （掴んだ地点と指の距離を**画素でも**測り、Cesium は絶対値でも 3 px 未満）と、縁の内から外への 5 歩（縁の外の
  2 歩は中心の差だけ）。1 歩の待ちは「カメラが変わった」だけにした——移動 1 回はどちらのエンジンでも書き込み 1 回で
  （Cesium は pointermove の中、MapLibre は次の描画フレームで丸ごと）、以前の静止待ちは Cesium で 1 歩 1.3〜2.2 秒
  （主スレッドがタイマーを 1 フレームずつ抱える）だった。起動後の `idle` 待ちは Cesium で 8 秒間一度も来なかったので
  上限を 3 秒に。直した後: pitch 40 の 4 歩目で ML 1.38 px / 0.0631° 対 CS 1.38 px / 0.0631°、縁越えの最後で中心の差
  0.083°。**同じ spec を直す前の build に当てると赤**: 1 歩目で滑りの差 0.111°（許容 0.022°）、4 歩目で Cesium
  17.44 px、縁越えの中心の差 12.81°。実測 48.6 / 48.1 / 46.1 秒（1 worker、3 回）、`tests/durations.json` は 49、
  `TOTAL_BUDGET_S` は 5,129。許容は「滑りの差 < 0.02° + MapLibre の滑りの 10%」「画素の差 < 1 px + 10%」
  「中心の差 < 0.02° + ドラッグ全体の弧の 3%」「方位 < 0.5°」で、緩めていない（画素の 2 つは足した）。
- `tests/r182-checks`・既存の `-cesium` spec・`check:static`・`check:engine`・`check:types`。

## 4. 残したこと

- `tests/r182-checks.test.mjs` ② の註（「js/cesium-input.js still drags by this law」）と、
  `tests/r182-cesium.spec.js` ①a の註（「MapLibre's globe pan and not "the grabbed point follows the cursor"」）は
  5.24 の記述のまま。どちらも数値の主張は `computeGlobePanCenter`（慣性）について正しいので緑。
- MapLibre は中心の緯度に応じてズームの下限を `minZoom + getZoomAdjustment(0, lat)` に上げる
  （`defaultConstrain`）。Cesium の `normalise` は `minZoom` だけで締める。今回の主題の外で、触っていない。

## 起動費用と試験予算（統合時）

- 遅延チャンク `cesium-input` の天井を 14,568 → 18,222 B に上げた（`tests/perf-baseline.json` の 1 行だけ）。
  増分 3,654 B はこの回の `globeDrag`（MapLibre 6.4 の versor の写し・縁の減速・極のダイヤル）そのもので、
  既定のセッションは Cesium を読まないので起動費用には入らない。
- `tests/cesium-globe-drag-cesium.spec.js` を最初 174 s で登録して `TOTAL_BUDGET_S` を 5,254 にしたら、#R203 の
  恒久の上限 5,250 を越えて CI の r204〜r206 が赤になった。上限は上げず、spec を軽くした（§3）: 実測 48.6 / 48.1 /
  46.1 秒を `tests/durations.json` に 49 s で登録し、`TOTAL_BUDGET_S` は 5,080 + 49 = 5,129。deep 121 本・計測 127 本、
  全体 85.5 分（`docs/TESTING.md` も同じ）。
