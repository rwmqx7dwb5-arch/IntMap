---
title: 範囲人口が WorldPop の旧 API 廃止で全滅していたのを v3 へ・背面の Atlas が「描画できなかった」を失敗と報告していた・押した線の強調・波の粒子を地図に貼る・面を塗るレイヤーの間は大気なし・日付変更線の暗い筋・海流名一覧の折り畳み
date: 2026-11-18
pr: 1210
newsen: Population in this area works again; clicked borders and cables light up; wave particles stay pinned to the map while you move it; the atmosphere turns off under full-surface weather layers and Night Lights; the dark line at the date line is gone; the current list folds.
newsjp: 「この範囲の人口」が再び使えるように。押した国境線と海底ケーブルが光るように。波の粒子が地図に貼り付いて動くように。面を塗る気象レイヤーと夜間光の間は大気をオフに。日付変更線の暗い筋を解消。海流名一覧は折り畳み式に。
---

〈依頼〉 7 件の表示・操作の修正と、Atlas が「IntMap が背面にあり描画できなかった」で 10 分かけて航路を描かなかった件の原因。

## 0. 測った

- **範囲人口**: `GET api.worldpop.org/v1/services/stats` は 302 → `/services/stats` → **404**（2026-11-18 curl）。
  WorldPop は v1 を廃止していて、全リクエストが `popFail` に潰れていた。v3 `POST /v3/population` は同期応答・CORS `*`・
  匿名で 1 ポリゴン 100,000 km²・同時 3・毎分 60・日 1,000（`/v3/health`）。413 の拒否は `{error, message}`。
  死活監視の probe は `/v1/services` で、これは `/v3/` の HTML へ転送されて 200 になるので**監視は緑のまま**だった。
- **日付変更線の暗い筋**: 衛星＋地球儀 z2.6・180°/20°N で 180° の直西 2 device px が輝度 27（両側 ~37）。夜側の画像を
  消すと消え、不透明度 1 でも残る（重ね描きではない）。GIBS Black Marble z3 の最東タイルの x=255 と最西タイルの x=0 が
  RGB 和 9（1 つ内側は 24）——**上流のタイル自身の端列**だった。
- **Atlas の背面**: `view.inspect` は `render.onNextFrame(1200)` で次の描画を待つ。背面のタブは rAF が止まるので必ず時間切れ、
  それを `R(false)`＝`failed` で返していた（カメラは #R768 で `unobserved` にしてあったが inspect は漏れていた）。
  compose の失敗理由は本番の実行記録を見ていないので**未確定**（データの setData は rAF に依存しない）。

## 1. 直した

- `js/sims.js` — v3 へ。年は時計の年を 2015〜2030 に収めたもの、出典行と年は応答の `data_source` / `data_year`。
  4xx（408/429 以外）は再試行しても同じなので fatal、429 は `Retry-After` だけ待つ。probe は `/v3/health`。
- `js/geo-engine.js` `onNextFrame` — 背面なら同期で 1 フレーム描く（maplibre `redraw()`、Cesium は新設の `redraw()` が
  `scene.render()`）。'render' がその中で発火するので読むのは本物のバッファ。それでも撮れなければ
  `meta.code:'not_rendering'` を付け、`none` 観測器が `unobserved` にする（読み取り全般に効く・失敗とは言わない）。
- `js/feature-highlight.js`（新設）— 押した線を専用ソースで光らせる 1 部品。歴史国境のカードと海底ケーブルの
  ポップアップが使い、閉じれば消え、次を押せば移る。
- `js/waves-gl.js` — 視点が変わったフレームだけ、粒子の状態と軌跡バッファを旧画面 → 経緯度 → 新画面で写し直す
  （`VIEW_MAP_GLSL` 1 か所。平面・地球儀・その切り替え）。
- レイヤー宣言に `noAir` を新設し、夜間光・風・気温・降水（予報）・海面気圧・突風の 6 本に付けた。`js/theme-sky.js`
  `_airOn` が宣言を読み、Cesium も `atmosphere-blend: 0` で空と地表の大気を消す。⚠ その結果 Cesium の標準マップも大気なしに
  なる（MapLibre では既に利用者の決定で 0）。
- `js/night-side.js` `seamCols` — 端列を内側と比べ、0.6 倍未満の暗さなら 1 つ内側を使う。上流が直れば外れる。
- `js/ocean-currents.js` — 海流名一覧を閉じた `<details>` に。再描画をまたいで開閉を保つ。

## 2. 起動費用

遅延チャンク `waves` が 33.6 → 37.8 kB（+4.2 kB）。粒子と軌跡を視点間で写す 2 本のシェーダ（`VIEW_MAP_GLSL` と 2 つのパス）の分で、
「粒子が地図に貼り付く」の実体そのもの。波レイヤーを開いたときだけ読まれ、起動時の費用は変わらない。天井を上げた。

## 3. 検査

`tests/layer-click-polish-checks.test.mjs`（強調部品を偽エンジンで評価・`noAir` を宣言と照合）。範囲人口は
プレビューで実 API に対し 2 範囲（東京 9,677,344 人・6 タイル 1.9 秒、本州中部 6°×5° 67,279,791 人）。

実画面（ヘッドレス Chromium）: 経度 180° の暗い列は 27→消失（37〜42 で連続）。`dl-ec-temp`／`dl-nightsat` をオンにすると `atmosphere-blend` が 0、オフで元の傾斜。
波は平面で 27° のパンに対し粒子の地上での移動が中央値 0.05°、地球儀で 18° に対し 0.06°（流れそのものの移動だけ）。海底ケーブル Havfrue/AEC-2 を押すと 7 区間全部が光り、閉じれば 0。
歴史国境（1900 年）のカードを開くと押した線が光る（画素の色で確認）。海流名一覧は閉じた状態で 108 件。背面（rAF 停止）でも `render.ticking` が true を返す。
