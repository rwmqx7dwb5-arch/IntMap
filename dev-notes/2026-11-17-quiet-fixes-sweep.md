---
title: 並行作業と重ならない約 600 ファイルを洗い、遅い応答の上書き・失敗のキャッシュ・漏れる listener・取り込みの読み違いなど 21 件を直す
date: 2026-11-17
newsen: Fixes for stale or stuck results in ShakeMap, volcano panels, place search, aircraft photos, simulated navigation, drone routes, elevation profiles, and semicolon-separated CSV imports.
newsjp: ShakeMap・火山パネル・場所検索・機体写真・ナビのシミュレーション・ドローン経路・標高断面・セミコロン区切り CSV の取り込みで、古い結果や止まったままの表示が残る問題を直しました。
---

〈依頼〉 進行中の作業に干渉しない範囲で、目立たないが重要な修正・性能改善を、IntMap 全体を洗い出したうえで行う。

## 0. 範囲の決め方

並行セッションの全 worktree（未コミット分を含む・8 週間動いていない 1 本は除外）と開いている PR
（#1168〜#1173・#1140）の差分を合わせると 599 ファイル。これと重ならない `js/`・`src/`・HTML・CSS の
約 600 ファイルを、災害・気象と宇宙と Cesium・GIS・経路とネットワーク・ウィジェットとページの 5 分野に分けて
読み取り専用で調べ、コードと呼び出し元を読んで確かめられたものだけを直した。

## 1. 直したもの

**遅い応答が新しい状態を上書きする**
- `js/shakemap.js` `open()`: 4 回の await をまたいで世代を見ていなかった。地震 A→B と続けて開く、または読み込み中に閉じると、A の遅い応答が地図を描き直していた。open/close ごとに番号を進め、追い越された open は何も描かずに作りかけの blob URL を返却する。
- `js/drone-nav.js` `compute()`: DEM の温めを待つ間にウェイポイントを消すと `wp[i]` が undefined になり TypeError、`busy` が立ったままだった。ウェイポイントは写しを読み、追い越された計算は新しい計算の答えを返す。温めの失敗は欠けたタイル（`demMissing`）として数える。
- `js/elevation-profile.js`: 同じパネルを使い回すのに世代の照合が無く、失敗すると「取得中…」のまま残っていた。
- `js/search-geocode.js`: 打鍵ごとに Nominatim の枠を 1 つずつ予約していたので、10 文字を速く打つと最後の問い合わせは約 9 秒後になり、自分の 5 秒の期限を過ぎて送られなかった。枠を待つのは同時に 1 つだけにし、来たときは最新の検索だけが使う。追い越された検索の要求は中断する。

**失敗をキャッシュして、再読み込みまで直らない**
- `js/volcano-intel.js` の周辺地震・周辺空港、`js/seismic-events.js` の破壊域ポリゴン、`js/aircraft-detail.js` の機体写真。どれも 1 回の時間切れや 5xx を「無い」として覚えていた。上流が「無い」と答えたときだけ覚え、失敗は覚えない。写真は 20 秒ごとの再描画で繰り返し問い合わせないよう 60 秒だけ控え、8 秒の期限を付けた。

**止まる・漏れる**
- `src/aviation-worker.js`: `fetch` に期限が無く、応答しない接続が 1 本あるとそのチャネルが `inflight` に残り続け、以降の更新がすべて「スキップ」になっていた。30 秒の期限（最も長い 20 秒周期より長い）を本文の読み込みまで掛けた。
- `js/navigation-sim.js`: 到着した fix の中でシミュレータが止められると、直後に `run.tickMs` を読んで TypeError（client-error-report の枠を消費していた）。
- `js/navigation.js`: シミュレーションを一時停止→再開すると、経路の先頭・1 倍速からやり直していた。位置・倍速・時刻を保存して続きから再開する。
- `js/pandemic-atlas.js`: 描画ごとに `styledata` の listener が 1 つずつ増えていた。
- `js/cesium-engine.js`: 最後の軌道を外しても `preRender` の listener が残っていた。
- `js/precip-annual.js`: 年の読み込み中にレイヤーを切ると、スイッチが切れたまま画像が出ていた。

**性能**
- `js/precip-annual.js` `yearCanvas`: 2048² 画素ごとに `exp`/`log1p` と階級探索をしていた。元のセルは 8 bit なので 256 通りの色表を 1 回だけ作り、列の対応も 1 回にし、最後の 1 枚を覚える。出力の画素は変わらない。

**読み違い**
- `js/geo-import.js`: 区切りが `;` の CSV では、すべての点を桁区切りとして消していたので、`52.37;5.2` の 5.2 が 52 になっていた（緯度として正しい範囲なので、どの範囲検査にも掛からない）。点を桁区切りとみなすのは、小数点のカンマがあるときか、点が 2 つ以上あるときだけにした。`-0°30'` が正になっていたのは、`Number('-0') < 0` が偽だったため。
- `js/viewshed.js`: 電波の到達範囲で「最も良い答え」を符号値の大小で選んでいたので、隣の光線のフレネル／回折が見通しを上書きし、見通せる面積を小さく報告していた。補間した DEM の穴が判定に入っていたので、コメントのとおり除外した。
- `js/land-mask.js`: NaN の緯度を赤道として答えていた。今は null を返す。
- `js/widget-layout.js`: 編集中にカード内の「削除」で Enter を押すと、カードを持ち上げて削除が効かなかった。

## 2. 見送ったもの（判断が要る・または影響が小さい）

GeoTIFF の float32 nodata 比較、高緯度での可視範囲の東西の幅、GeoTIFF の無制限確保・GeoPackage の WKB の再帰の深さ、
`offline-maps.js` の abort listener の蓄積。これらは報告を受け、コードの記述までは確かめた。ただし実在するファイルでの影響を測っておらず、今回は直していない。

## 3. 起動予算の天井を上げた理由

PR の CI で `check:perf` が赤になった。`eager.gzip` が 1513.6 kB で、天井 1506.0 kB に幅 7.5 kB を足した線を 0.1 kB 超えていた。
同じ木で、この branch の `js/`・`src/` だけを main の版に戻して build すると、門は通った。つまり main は線のすぐ下にあり、
この branch が起動時の束に足した分は数百バイトのコードだけである。触ったファイルのうち eager に入るのは `widget-layout`・
`land-mask`・`elevation-profile`・`precip-annual`・`search-geocode` の 5 本で、足したコメントは束に残らない
（`dist/` を照合して確かめた）。足したのは欠陥の修正（世代の照合・枠の共有・色表）で、これを外せば欠陥が戻る。
そこで、最新の main に rebase した木で `perf-budget --update` を走らせた。越えた行だけが上がり、その木で越えていたのは
`eager.brotli` だけだった（1144.8 → 1151.0 kB）。この差のほとんどは、すでに main に入っていた増加である。

## 4. 検査

`tests/quiet-fixes-sweep-checks.test.mjs`（`;` 区切り CSV の 2 形・`-0°` の符号・破壊域の失敗をキャッシュしないこと。
いずれも関数を実際に評価する）。既存の `tests/file-import-checks.test.mjs` 11 件も緑。
