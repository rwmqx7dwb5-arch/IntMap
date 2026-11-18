---
title: 地名ラベルのクリックを Google Earth 型に（ピン・右に寄る情報）・都市ラベルの数とサイズ・座標欄を権利表示の行へ・Atlas の回答表示の整理ほか
date: 2026-11-18
newsen: Clicking a place name now stands a pin on it and opens the card beside it; city labels thin out at continent zoom, grow as you zoom in and come with a position dot; the coordinate strip moved next to the credits; Atlas answers are tidier.
newsjp: 地名をクリックするとピンが立ち、情報がその横に出ます。都市ラベルは大陸ズームで控えめになり、拡大するほど大きくなって位置の丸が付きます。座標欄は権利表示の行へ移り、Atlas の回答表示も整理されました。
---

〈依頼〉利用者の UI 指摘の一括対応（国ラベルのハイライトのずれ、Atlas 回答表示、極付近の大気、座標欄、News の粒度、選択の丸、検索バーの高さ、Tools の入れ子、都市ラベル、ポップアップ位置、Draw の遅れ、Objects の編集、IntMap の文字）。

## 0. 測った

- Google Earth（2026-11-18 実測）。カメラ 3,500 km で都市は小さな白い点の右に小さな文字・数は 15 前後。1,450 km で中位の都市が 11〜12px、454 km で大都市 16px・小さな町 9〜10px。クリックするとラベルと点が消えて赤いピンが立ち、地名はピンの上、情報カードは画面右。
- OpenFreeMap の place タイル（build 20261115）の rank は 1〜14 で安定。z3 の 1 タイルに city/town が 147〜294。

## 1. 直したもの

- **地名クリック**: ピン（`.plc-pin`）＋地名＋右へ寄るカード。位置は `js/popup-placement.js` が 4 方向（右・左・上・下）から、画面端・他のポップアップ・ボタンとの重なりが最小の側を選ぶ（障害物は DOM から発見し名簿を持たない）。クリックした都市のラベルと点は、その名前を除外するフィルタで閉じるまで隠す（城市レイヤーのみ。`ofm-admin1` は time-admin1.js が書くので触らない）。Cesium の overlay も `anchor` と `[x,y]` offset を受ける。
- **都市ラベル**: z3〜6 だけ rank で絞り（z7 以上は絞らない）・サイズは z17 まで伸ばす・Google Earth 型の点（首都と rank ≤ 2 は二重丸）を `ofm-city-dot` として足した。
- **国ラベルのハイライト**: 輪郭線を地図と同じ `ofm` の `boundary` から引く（z5 以上。それより遠い所は従来のポリゴンの縁）。
- **座標欄**: 権利表示の行の右端へ。左から レイヤー値・視点高度・標高/水深・座標。標高・高度・座標は幅を確保して揺れない。
- **極付近の大気**: 強さをズームでなく赤道換算のズーム（`z + log2(1/cos φ)`）で引く。
- **Atlas**: 「地図を見ました」の表示とスクリーンショットを回答から外す（モデルが受け取る画像は残す）／回答と結果は 1 行の操作行にまとめる／出典は `<details>` の 1 行／オーバーレイ表示は文字の周りだけすりガラス／本文 15px。
- **News**: 出来事が取れないとき記事の一覧へ落とさない（空と再試行）。
- **そのほか**: Countries・Companies の選択の丸を削除・検索バーの高さを固定・Tools の「Measure & draw」の入れ子を平らに・Draw の描画を 1 フレーム 1 回に・Objects で線幅と不透明度を編集・×と Clear all の間隔・IntMap の文字を元に戻した（画像 `brand/intmap-wordmark.png` は削除）。

## 2. 消したもの・引き継いだもの

- `.atl-viewframe*` と、その拡大処理、4 言語の「Atlas looked at the map」行（死んだ文字列）。表示は消え、モデルへ渡す画像は `frames` が引き続き運ぶ。
- `brand/intmap-wordmark.png` は他に参照が無い。
- `window.countryGeo` の読み取りが 1 件増えた（`ofmLineCodes` の補助）。`map-ui.js` が `iso3` を渡す経路が主で、渡さない呼び出し元のための補助として残す。global-surface の基準を更新した。

## 3. 確かめていないこと

- Cesium の都市の点とラベルの間隔、携帯でのポップアップの向き。
- 国境ハイライトの z5 未満（地図の `boundary` タイルに国コードが無い）は従来のポリゴンのまま。
- 多言語ニュースは英語の出来事しか無いので記事経路のまま（製品判断）。
