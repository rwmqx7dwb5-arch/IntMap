---
title: 地図の表示と操作 8 項目（線幅・国名の消え方・ラベルのクリック・AI brief 撤去・ズーム起点・Exit 位置・Isolate の輪郭・下部バー）
date: 2026-11-26
newsen: Thinner road and rail lines, country names fade once you zoom inside the country, clicked country names hide under the pin, scroll-zoom follows the cursor, Isolate matches the border, frosted bottom bar. AI brief button removed.
newsjp: 道路と鉄道の線を細く、国名は国の内側へズームすると消え、クリックした国名もピンの下で隠れます。スクロールズームはカーソルに追従し、Isolate は国境に合い、下部バーはフロストグラスに。AI brief ボタンは廃止しました。
---

〈依頼〉 発注書のうち地図の表示と操作の 8 項目。個別事例ではなく、同種の別の国・別の縮尺で効く構造で直す。

## 1. 線幅
重ね描きの道路 `ref-roads`、鉄道 `ref-rail`／`ref-rail-dash`（`js/app-body.js`）と鉄道レイヤー `widthExpr`（`js/railways.js`）を約 30% 細くした。基図の CARTO ラスタ自体の線はコードから変えられない。

## 2. 国名は「領域の大きさ ÷ 表示範囲」で消える
`IntMapCountryExtent.viewShare`（`js/country-extent.js`）が、国の home extent の画面上の大きさをビューポートの大きさで割る。長辺が 2 倍（`NAME_GONE_SHARE`）を超えたら、その国名をレイヤーの filter から外す（`js/place-labels.js` `fitCountryNames`、moveend と idle）。国の一覧は持たない。ラベル点が入る最小の extent を持つ国に突き合わせる（飛び地が親に勝つ）。`querySourceFeatures` を読むのは、filter で外した名前が描画されず、ズームアウトで戻れなくなるのを避けるため。2 は観測値ではなく設計値で、本番で調整する。
admin1 はもともと rank の階段と maxzoom 9 で消える。時代別の国名（imtb）は対象外。

## 3. クリックで国名・行政区分名も隠れる
旧実装は都市レイヤーの filter を書き換えていた。ofm-admin1 の filter は time-admin1 が、ofm-country は place-labels が持つので、都市にしか使えなかった。`text-opacity`（どの label レイヤーでも他が書かない）に変え、`PLACE_LBL`（クリックを配線するのと同じ一覧）の全層で、クリック点の名前を 0 にする。

## 4. AI brief の撤去
呼び出し元は 3 か所: 地名ポップアップの `.plc-ai`（`js/map-ui.js`）、国カードの `data-cpact="brief"`（`js/countries-ui.js`）、Atlas の入口 `briefEntry`／`IntMapOS.brief`／`IntMapAtlas.brief`（`js/atlas-console.js`）。3 つとも消した。引き継ぐもの: Atlas の能力 `research.brief`（`js/atlas-cap-research.js`、`ai-proxy/tasks/brief.ts`）は残り、チャットで「◯◯について調べて」と訊けば同じ調査が走る。locale の "AI brief" 行は他で使われうるので触っていない。

## 5. スクロールズームの起点
MapLibre 6.19 の `ScrollZoomHandler` はカーソルを `_start` で 1 度だけ読む。stock では約 200 ms の窓だが、`js/geo-engine.js` のばね（`_smoothWheel`）がズームの到着までジェスチャを開いたままにするので、起点が固定される時間が伸びていた。canvas 上のカーソル位置を追い、ジェスチャ中は毎フレーム `_aroundPoint` に渡す。Cesium は `cesium-input.js` が元から追従する。

## 6. Exit country view
`bottom:64px` → `44px`（`js/map-tools.js`）。

## 7. Isolate の輪郭と国境線のずれ
穴は `countryGeo` から抜く。`countryGeo` は起動直後は 110m の代用品で、10m は idle／スマホではズーム 4 以降に取りに行く。画面の国境線は OFM の細かい線。Isolate が粗い 110m で穴を開けるのが「別の簡略化度」の正体だった。`window._imRequireFineCountryGeo`（`js/countries-ui.js`）で細かい版を今すぐ取りに行き、Isolate は到着を待ってから穴を作る。
残る差: OFM（OSM）と Natural Earth は別の測量なので、10m でもサブキロメートルの差はある。OFM の線を閉じた環にして穴にする案は、z4 以下に線が無く、塗りに使えないので採らなかった。

## 8. 下部バー
`.map-credit` を共通のガラス材（`--glass-fill`／`--glass-blur`／`--glass-sat`）の一覧に加え、デスクトップでは `#map` をバーの高さだけコンテナの下に延ばして背後に地図を置いた（コンテナの寸法が変わらないので上の部品は動かない）。座標・標高欄はバーの中にあり透明なので同じガラスの上に載る。

## 検査
`tests/map-display-fixes-checks.test.mjs`。
