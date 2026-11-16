---
title: 速度の根本改善——星空を GPU で 1 回に描く・標高タイルの復号をワーカーへ・読み戻す canvas を CPU 側に・起動後に回せる読み込みは PC でも起動後に・Atlas の 1 手ごとの待ちを短く
date: 2026-11-17
newsen: The map moves more smoothly on the globe (the star sky is drawn by the GPU in one call, elevation tiles decode off the main thread), the desktop start-up no longer reads the star catalogue and country tables before the map is usable, and each Atlas step waits less on the server.
newsjp: 地球儀表示で地図の動きが滑らかに（背景の星空を GPU で一度に描き、標高タイルの復号を別スレッドへ）。PC の起動時に星表と国の表を地図が使えるようになってから読むように。Atlas の 1 手ごとのサーバ側の待ちを短縮しました。
---

〈依頼〉「速度を早くして。根本的に劇的に。」——対象は起動・初回表示／地図操作の滑らかさ／Atlas の応答（利用者の選択）。
Atlas の思考量（推論の強さ）は**変えない**（利用者の選択「品質を保つ範囲だけ」）。

## 0. 測った（推測ではなく実測から始めた）

- **本番**（キャッシュ無しの初回訪問 2 回・1280×800・Playwright）: 地図の最初の idle 2.1〜2.9 s。2 回目の計測で、
  起動後に読まれる国の 10 m 輪郭（2.88 MB）が操作中に重なり 1,167 ms の停止・東京ズームで 50 ms 超が 19 フレーム。
- **手元**（unminified build・CDP サンプラ・8.4 s の easeTo/panBy）: 主スレッドの稼働 **3,287 ms**。
  その最大は `js/space-sky.js` の `draw()` **914 ms**——描画エンジン本体より多い。カメラが 1 フレーム動くたびに
  約 99,000 個の星へ `fillStyle` の変更と `fillRect` を出していた（天球に固定された星なのに）。
- 起動中に `ensureLabelPill`（ニュース帯の 80×60 の小画像）が 109 ms。最初の GPU 2D canvas の初期化と
  `getImageData` の読み戻しの待ち（素の Chromium で 131 ms／`willReadFrequently` なら 1 ms）。
- 移動の後ろで `js/map-readout.js` の標高タイル復号（drawImage→getImageData→ループ）が約 100 ms。
  PC は止まるたびに画面の 49 点ぶんの DEM を先読みしており、続けて動かすとその復号が指の下に来る。
- 携帯（390×844・CPU ×4）では、ズームインで始まる 10 m 輪郭の格上げの 2 本目のループ（約 250 か国の範囲計算）が
  一度も譲らず **約 600 ms の 1 タスク**。
- Atlas（調査）: ストリーミングと道具の並列実行は既にある。1 手ごとにサーバが Auth → profiles → 台帳を直列に待ち、
  CORS の `Access-Control-Max-Age` が無いので 5 s を超える手（ほぼ全部）で毎回 OPTIONS が 1 往復増えていた。

## 1. 直したこと（構造で）

1. **星空**（`js/space-sky.js`）: 暗い星（四角の点）は WebGL の `drawArrays(POINTS)` 1 回。投影は #R187 の行列を uniform に、
   各点のアンチエイリアスは「正方形と画素の箱の重なり」をそのまま計算（加速された 2D canvas の `fillRect` と同じ面積）。
   バッファは歳差の更新時（地図時間で 1 日に 1 回）だけ。結果は `#space-canvas` に `drawImage` 1 回で載せ、暈・円盤・月・太陽は
   従来どおり canvas。WebGL が無い・失われたときは従来のループ（同じ絵・従来の費用）。`state().last.stars` は尋ねられたときに数える。
   **検証**: 表示を撮って比較（読み戻しで canvas を CPU 化させないため screenshot）——GPU と従来の差は最大 37／255・3,107 画素・明るさ比 0.9968。
   GPU 同士を 0.6 s 空けて撮った差（ノイズの床）が 1,879 画素・最大 37 で、同じ水準。1 フレームの描画 3.1 ms → 0.3 ms。
   ⚠ 否定された見立て: 最初は `getImageData` で比べて明るさ 23% 差に見えた。読み戻しを繰り返すと Chromium は canvas を
   ソフトウェアに切り替え、ソフトウェアの Skia は小さい矩形を面積より太く塗る（実測）。利用者が見る加速 canvas は面積どおり。
2. **読み戻す canvas は CPU 側に**: `getImageData` で読む 2D canvas 12 か所に `willReadFrequently:true`
   （`app-body`・`icons`・`map-extras`・`ocean-currents`・`satellites-live`・`time-admin1`・`data-layers`×3・`world-packs`×3）。
   規則は関数ではなく事実に付けた——`tests/speed-overhaul-checks.test.mjs` ① が js/ 全体で「その場で作った canvas を読み戻すなら指定がある」を測る。
3. **標高タイルの復号をワーカーへ**: `src/dem-worker.js`（fetch→createImageBitmap→OffscreenCanvas→メートル）と
   `src/dem-worker-client.js`（`window.IntMapDemWorker`）。変換は新しい `js/dem-decode.js` 1 本で、ページ側の従来経路（worker が無いとき）と
   worker が同じ関数を実行する。`js/map-readout.js` はもう自分の変換を持たない。期限は store の `DEM_REQUEST_TIMEOUT_MS` を worker に渡す（写さない）。
   新しい window の結び目 `IntMapDemWorker` は他の worker client と同じ形（`check:surface` の基準を更新）。
4. **10 m 輪郭の格上げを時間で刻む**（`js/countries-ui.js`）: 「16 件ごと」ではなく 8 ms ごとに譲る。2 本のループの両方。順序・計算・結果は同じ。
5. **PC でも `settled` の行は `settled`**（`js/boot-stage.js` `stageFor`）: 星表（791 kB＋98,887 行の導出）・ガゼッティア・国の表・世界銀行の最新値は、
   PC でも起動画面が上がってからの idle に読む。`need` の行は従来どおり。規則は 1 か所で、`scripts/frame-profile.mjs` も同じ関数を読む。
6. **Atlas の 1 手ごとの待ち**（`supabase/functions/ai-proxy/`）: プランの読み（profiles）をトークン検証（getUser）と**並行**に開始し、
   検証済みの利用者がトークンの主張する主体と一致するときだけその結果を使う（偽のトークンは従来どおり 401・推測読みは捨てる）。
   CORS に `Access-Control-Max-Age: 86400`（他の関数と同じ値）——1 手ごとのプリフライトの往復が消える。台帳の不変条件（精算は `done` より前）は触っていない。

## 2. 効果（同じ機械で前後を交互に）

- 携帯（390×844・CPU ×4・暗いテーマの地球儀・8.4 s の移動）× 3 回ずつ: 描けたフレーム **平均 196 → 252（+29%）**、平均フレーム時間
  **46.2 → 37.1 ms（−20%）**。
- PC（unminified）: 移動中の主スレッド稼働 **3,287 → 2,098 ms（−36%）**、移動中の long task 1 件（151 ms）→ 0 件。
  ⚠ minified の PC の A/B は並行負荷で回ごとに 2 倍近く振れ、有意差を主張できない。
- 起動: PC で 791 kB の星表と導出が起動画面の外へ。ニュース帯の画像の 109 ms が消える。

## 3. やらなかったこと・残り

- Atlas の推論量を手ごとに下げる案は品質との交換なので行わない（利用者の選択）。
- 起動の最大の塊は eager な 897 モジュールの一括評価（gzip 1.6 MB）。歴史地図・データレイヤー・天気・ウィジェットを
  「行だけ eager・本体は遅延」にする分割は、別セッションの #1152（Atlas カーネルと能力の分割）と同じ面を触るので、それの着地後に行う。
- MapLibre 内部（ラスタタイルの createImageBitmap・グリフの measureText）が残りの主な稼働。
