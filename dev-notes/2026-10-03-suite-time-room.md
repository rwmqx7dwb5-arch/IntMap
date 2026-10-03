---
title: suite の直列時間を 538 s（87.5 → 78.5 分）削った——主張は 1 つも消さず、12 本の deep spec を「1 テスト 1 起動」から worker の共有ページへ。共有ページに 3 つの worker option（appUrl / appEngine / appView）を足し、reset が「この page の起動時の見え方」へ戻せるようにした
date: 2026-10-03
---

〈依頼〉`check:testbudget` の全体天井 87.5 分（5,249 s）に対して suite が天井ちょうど。並行して商品機能の spec が 5〜6 本（計 約 5 分）入ってくる。ゲートの言う通り「天井を上げず時間を削れ（#R197 が手本）」——**検査の網羅（何を主張しているか）は 1 つも失わず**に、直列時間を少なくとも 8 分削る。移す前後で各 test の主張を対応表にして残し、移した spec は実際に走らせて緑を確かめ、`tests/durations.json` を実測で更新する。天井は下げてよいが上げない。

## 0. 測った

- **どこに時間があるか。** `node scripts/test-budget.mjs --report` の上位は r182-cesium 639・r171 330・r174 330・r179 292・r184-cesium-fs 234。前夜（2026-10-02）の deep tier の junit（`baseline-deep-*` artifact、テスト単位）で同じファイルを開くと、**r171 の 14 テストはどれも 20〜25 s**（`Atlas can drive both new switches` は本体 0.4 s のテストで 21.7 s）——時間の大半は **テストごとの起動**だった。
- **起動の値段。** 同じ spec を同じ機械で前後に走らせ、共有ページへ移したテストのうち本体が 2 s 未満になったものの差の中央値: **MapLibre 10.8 s（8 件）・Cesium 12.5 s**。#R186 が CI で測った 9.2 s と同じ桁。
- ⚠ **この機械は 15 体以上の作業と同居していて重い。** 同じテストが走るたびに ±50〜100 % 動いた（r174「zooming in still moves the viewpoint」は 70.8 s → 149.4 s、変更なしで）。だから**ファイル全体の比ではなく、移したテストだけの差**を足し、変えていないテストの揺れを数に入れない（§2）。

## 1. 何をしたか

1. **12 本の spec を `tests/helpers/app.js` の worker 共有ページへ。** r171・r175・r176・r177・r178・r179・r184-satellites・r186（MapLibre）、r180-cesium・r181-cesium・r182-cesium・r184-cesium-fs（Cesium）。テストの中身（操作と `expect`）は変えず、`await boot(page)` を `const page = app.page` にしただけ。
2. **共有ページに worker option を 3 つ**（`tests/helpers/app.js`）。worker 単位の option なので Playwright は値ごとに worker を分け、ページは本当にその値で起動する（ヘッダが警告している per-test の context option とは別物）:
   - `appUrl` — 起動 URL（r184-satellites の `/?rafshim=1`）。
   - `appEngine` — `'cesium'` で第 2 レンダラを 1 回の load で起動（`tests/helpers/engine.js`、`id()` が cesium になるまで待つ）。
   - `appView` — reset が戻す先。`'named'`（既存 68 本が前提にしている平面・東京 z5）か `'boot'`（**この page の起動直後**の投影とカメラ。最初の reset で記録する）。
3. **`'boot'` が要った理由——実測。** 名前付きの view は平面だが、アプリは地球儀で起動し、Cesium では `view.proj.flat` が Columbus view への **morph** になる。最初は named のまま移して、**新しい起動を前提に書かれた主張が view だけのせいで赤くなった**: 空の投影誤差 2,849 px（r186）、ズームの床 1.2（起動では 0、r178）、Cesium の bearing 往復 176° のずれ・fitBounds が 9.5 % はみ出す・パン 0.88°（r180/r181/r182）。`'boot'` で各テストは書かれた時と同じ見え方から始まる。起動カメラは時計で動く（r180 ③）ので**書き込まず記録する**。
4. **共有ページを変えるテストは、読み取りの後に元へ戻す**（読み取りは不変）: r180 ⑥ は付けた terrain を外す（付けたままだと同じページの r181 ② の pitch が 0.028° 動いて 0.01° の境界を割った）、r184-cesium-fs ① は止めた全ジェスチャと上げた tilt 天井を戻し、作った 2 つ目の viewer を destroy する。
5. **残したもの（自分のページで起動し続ける）。** 主題が起動そのもの（launch screen・起動カメラ・既定レイヤー・起動中のエラー）、新しいプロファイル（r171 の 3 本は `app.freshPage()`）、reload、per-test の context option（dsf・viewport・colorScheme・storageState）、次のテストに状態を残すもの（衛星 basemap・カタログ group）。
6. **移して赤くなったので戻したもの**（原因は切り分けていない。主張は確かに成り立つ場所に置く）: r180 ⑤（共有ページで 0 entities）、r182 ⑤（全ジェスチャ停止中のドラッグで中心が 3.75° 動いた）・⑥（二本指で −0.0004 ズーム）、r184-satellites ⑦（Atlas が「点ける」層が既に点いている）・②（`geo` に切り替えたカタログが後続に残る）、**r174 は全部**（共有ページで Playwright が「Cannot create a string longer than 0x1fffffe8 characters」で落ちた。原因未特定）。

## 2. 数え方（`tests/durations.json` の 12 行）

各ファイルについて: **移したテストだけ**の（前 − 後）の和 − その実行で共有ページを最初に起動した worker 1 つにつき起動 1 回（上の 10.8 / 12.5 s）。これを表の秒に直す係数は **min(表の値 / 手元の前の合計, 前夜 CI の合計 / 手元の前の合計)**——表が実測より高いファイル（r175: 表 159・CI 92・手元 50.6）で節約を膨らませないため。前: `r171` は単独 2 workers、残りは 2 workers のまとめ実行（Cesium の r180/r181 は CI と同じ 1 worker）。後: 最終コードでの 3 回の実行（MapLibre 9 本を 2 workers・r180/r181 を 1 worker・r182/fs を 2 workers）。

| spec | 表（前） | 手元の前 | 前夜 CI | 移したテストの差 | 起動の戻し | 係数 | 節約 | 表（後） |
|---|---|---|---|---|---|---|---|---|
| r171 | 330 | 269.4 | 448 | 138.1 | 21.6 | 1.225 | 143 | 187 |
| r175 | 159 | 50.6 | 92 | 27.1 | 0 | 1.815 | 49 | 110 |
| r176 | 53 | 130.7 | 126 | 53.4 | 10.8 | 0.405 | 17 | 36 |
| r177 | 39 | 81.8 | 178 | 52.4 | 0 | 0.477 | 25 | 14 |
| r178 | 33 | 44.5 | 127 | 13.2 | 0 | 0.741 | 10 | 23 |
| r179 | 292 | 350.4 | 317 | 34.9 | 0 | 0.833 | 29 | 263 |
| r184-satellites | 166 | 178.9 | 166 | 74.9 | 32.4 | 0.927 | 39 | 127 |
| r186 | 150 | 142.3 | 332 | 54.9 | 0 | 1.054 | 58 | 92 |
| r180-cesium | 171 | 196.3 | 187 | 60.3 | 12.5 | 0.871 | 42 | 129 |
| r181-cesium | 143 | 227.5 | 158 | 81.2 | 0 | 0.629 | 51 | 92 |
| r182-cesium | 639 | 528.6 | 688 | 47.4 | 24.9 | 1.209 | 27 | 612 |
| r184-cesium-fs | 234 | 157.8 | 303 | 32.1 | 0 | 1.483 | 48 | 186 |
| **計** | | | | | | | **538** | |

「起動の戻し」が 0 の行は、その worker の共有ページを同じ variant の別ファイルが先に起動していた（CI でも worker の page は同じ variant のファイル間で使い回される）。⚠ Playwright の junit は worker fixture の起動をテスト時間に入れない——**既存の 68 本と同じ定義**で、`shard-plan --update` が将来この表を上書きしても起動は数えられない。ここでは上のとおり手で戻して数えた。

天井 `TOTAL_BUDGET_S` は **5,249 のまま**（suite 4,711 s、余白 538 s = 9.0 分）。並行して入る spec（約 5 分）の分の余白で、ゲートの「天井が床から 12 % 離れたら古い」規則の内側。

## 3. 主張の対応表（移したテスト 63 本）

**どのテストも `expect` の数と中身は同じ**（ファイルごとに `expect(` を数えて前後一致。r171 だけ 76 → 78）。例外は 1 つ: r171「the tilt limit lifts…」の最初の読み取り **「新しいプロファイルでは天井 78・unlimited false」** は、共有ページでは「新しいプロファイル」と言えないので、**同じ 2 つの `expect` を `app.freshPage()` を使う reload テストの冒頭へ移した**（何も設定する前に読む）。元の位置にも同じ値の読み取りは残し、メッセージを「設定が off なら標準の天井」に直した。

| spec | テスト | 前 s | 後 s | 後の結果 |
|---|---|---|---|---|
| r171 | Atlas can draw a circular 3-D volume in a colour | 12.6 | 1.8 | green |
| r171 | Atlas can drive both new switches | 8.7 | 0.7 | green |
| r171 | MapLibre's plain globe really does go flat at flight-sim zoom (the reason #R170 did not fi | 10.8 | 3.2 | green |
| r171 | Measure ▸ 3-D volume: a whole number can actually be typed, and it reaches the renderer | 22.9 | 10.0 | green |
| r171 | Measure ▸ 3-D volume: colour and opacity reach the renderer | 21.8 | 6.8 | green |
| r171 | Measure ▸ 3-D volume: freehand, circle and rectangle footprints | 43.8 | 23.8 | green |
| r171 | Measure ▸ 3-D volume: the altitude fields fit inside the panel | 9.6 | 2.4 | green |
| r171 | the elevation profile still puts its cursor on the map through the engine | 21.9 | 5.3 | green |
| r171 | the flight simulator flies the app Globe, and gives the view back on exit | 24.2 | 12.6 | green |
| r171 | the migrated modules still drive the map through the engine | 16.1 | 3.9 | green |
| r171 | the tilt limit lifts to the renderer's full range and comes back down | 24.3 | 8.0 | green |
| r175 | a tall hover tooltip stays inside the map wherever the pointer is | 7.8 | 0.7 | green |
| r175 | with unlimited tilt at 110°, zooming in descends like an untilted map | 15.9 | 6.3 | green |
| r175 | with unlimited tilt at 85°, zooming in descends like an untilted map | 17.0 | 6.4 | green |
| r176 | a dug basin holds exactly what it can, and spills exactly the rest | 26.8 | 15.1 | green |
| r176 | P and S arrivals reproduce the 2011 Tohoku record and published IASP91 times | 13.7 | 2.8 | green |
| r176 | terrain shade follows the sun, and a valley’s year is read off its own horizon | 22.5 | 20.3 | green |
| r176 | the viewshed resolves per raster cell, and re-runs at the same site | 31.2 | 13.6 | green |
| r176 | there is no drone button anywhere, and the planner still opens | 11.6 | 0.6 | green |
| r177 | a journey still lands where it was sent (#R173) | 11.5 | 3.5 | green |
| r177 | a zoom is still a dolly at every tilt (#R175) | 24.1 | 12.6 | green |
| r177 | camera.eye() agrees with the matrix the renderer draws with | 24.3 | 8.3 | green |
| r177 | standard tilt does not go through any of this | 7.3 | 1.6 | green |
| r177 | the anchor never emits a camera outside the renderer's range | 14.7 | 3.5 | green |
| r178 | the renderer can still be asked whether it would move a camera (#R178) | 7.8 | 2.3 | green |
| r178 | unlimited tilt owns the zoom floor and gives it back (#R178) | 12.9 | 5.2 | green |
| r179 | going somewhere after a look-up lands where the zoom says — flyTo a TILTED destination (#R | 8.9 | 4.7 | green |
| r179 | going somewhere after a look-up lands where the zoom says — flyTo elsewhere, same zoom (#R | 8.9 | 5.4 | green |
| r179 | going somewhere after a look-up lands where the zoom says — flyTo elsewhere, zooming out ( | 9.4 | 5.2 | green |
| r179 | going somewhere after a look-up lands where the zoom says — globe, flyTo elsewhere (#R179) | 8.5 | 4.8 | green |
| r179 | the adapter records what the caller declared, and clears it (#R179) | 9.7 | 6.6 | green |
| r179 | the eye pivot installs both halves and restores the renderer afterwards (#R179) | 4.9 | 1.7 | green |
| r179 | the underground check is repaired, not suppressed (#R179) | 6.3 | 2.0 | green |
| r179 | unlimited tilt still lets you zoom and pan (#R175 regression guard) (#R179) | 34.4 | 37.2 | green |
| r179 | zooming while looking up keeps the eye above the surface — globe z11, tilt 180° (#R179) | 13.4 | 8.6 | green |
| r179 | zooming while looking up keeps the eye above the surface — globe z4, tilt 180° (#R179) | 12.7 | 9.1 | green |
| r179 | zooming while looking up keeps the eye above the surface — globe z6, tilt 120° (the report | 12.1 | 9.0 | green |
| r180-cesium | R180 ④: a layer added through the contract draws, with its expressions evaluated | 21.2 | 7.5 | green |
| r180-cesium | R180 ⑥: terrain comes from the app's own terrarium DEM and reads true heights | 53.9 | 27.1 | green |
| r180-cesium | R180 ⑥b: tile protocols survive being registered before the view exists | 15.0 | 2.5 | green |
| r180-cesium | R180 ⑦: a sub-view is a full contract that answers about ITSELF | 12.0 | 4.7 | green |
| r181-cesium | R181 ②: at pitch 0 the map really turns — the heading is not silently dropped | 14.4 | 8.1 | green |
| r181-cesium | R181 ②: bearing round-trips at every zoom and pitch, including straight down | 50.2 | 31.4 | green |
| r181-cesium | R181 ③b: sourcedata says WHEN a source finished, not only that it changed | 25.4 | 9.2 | green |
| r181-cesium | R181 ④: fitBounds actually shows the box it was given | 28.0 | 11.5 | green |
| r181-cesium | R181 ⑥: vector-tile layers come back after a round trip through a deep zoom | 31.6 | 16.4 | green |
| r181-cesium | R181 ⑦: the sky spec survives a round trip, so a flight can put it back | 12.0 | 3.7 | green |
| r182-cesium | R182 ②: a drag is one movestart…moveend, and the fling glides after release | 29.5 | 16.5 | green |
| r182-cesium | R182 ③: easeTo lands on the camera it was asked for, at every pitch | 55.7 | 43.7 | green |
| r182-cesium | R182 ④: easeTo({around}) holds the anchor under its own pixel | 43.5 | 28.5 | green |
| r182-cesium | R182 ⑤b: a right-drag rotate opens no menu, a plain right-click still does | 35.0 | 27.7 | green |
| r184-cesium-fs | R184 Cesium FS ①: every camera capability the simulator drives is implemented, not stubbed | 14.5 | 4.9 | green |
| r184-cesium-fs | R184 Cesium FS ②: the aircraft flies and the camera is at the aircraft | 105.5 | 83.0 | green |
| r184-satellites | R184 ①: SGP4 reproduces the real ISS orbit, and the Sun/shadow pair actually answers | 22.7 | 18.4 | green |
| r184-satellites | R184 ③: the footprint is acos(Re/(Re+h)) and the ground track is one orbit | 25.1 | 0.6 | red* |
| r184-satellites | R184 ④: the checkbox draws the layer, fills the legend and cleans up again | 29.5 | 19.1 | green |
| r184-satellites | R184 ⑤: selecting an object draws its track + footprint and opens a card of real numbers | 25.6 | 16.2 | green |
| r184-satellites | R266 ⑥: everything propagated is drawn, and the look-angle geometry survives | 27.1 | 0.7 | green |
| r186 | R186 POI: shop and facility names are their own layer and their own toggle | 12.0 | 2.9 | green |
| r186 | R186 sea level: the number applies as it is typed, and 100 % is opaque | 12.4 | 3.7 | green |
| r186 | R186 sky: the star field is projected with the renderer's own camera | 12.8 | 4.6 | green |
| r186 | R186 water: a source outside the working rectangle is not silently dropped | 19.0 | 5.3 | green |
| r186 | R186 water: the trace tells the sea from a closed basin below sea level | 20.3 | 5.0 | green |

\* r184-satellites ③ は最終実行で赤、直後の単独実行（同じコード）で 7/7 緑。§4。

## 4. 見つけたが直していないもの（主張に手を入れないため）

- **r184-satellites ③「the footprint ring must close」は ISS の位置で赤くなる。** `footprintRing` は方位 0 と 2π の端点を `((lo*R2D+540)%360)-180` で正規化してから **`===` で比べている**ので、浮動小数の丸めで端点がずれる位置がある。純粋関数で、ページの状態とは無関係（最終実行で赤、10 分後の再実行で緑）。
- **r184-satellites ⑤「range < 13,000 km」も ISS の位置で赤くなる。** 地表の観測者から ISS までの最大距離は約 6,371 + 6,791 ≈ 13,162 km。実測で 13,025 km（共有ページ）と **13,140 km（新しいページ）**——新しいページでも出る、既存の時間依存。
- どちらも「境界の書き方」の問題で、直すと主張が変わるので今回は触っていない。

## 5. 検査

- 移した 12 本: 最終コードで実行して緑（r184-satellites は上の ③ を除き最終実行で緑、再実行で 7/7 緑）。r180/r181/r182/r184-cesium-fs は Cesium で 1 worker / 2 workers とも緑。
- `npm run check:testbudget`: 緑（78.5 / 87.5 分）。`npm run check:static`: 緑。`npm run check:docs`: 緑。
- 予算を読む node 検査（`generated-file-merge-driver`・`layer-test-gates-and-docs`・`process-test-tiers-and-shards`・`shell-test-infra`・`backend-serve-and-build`）: 65/65 緑。
