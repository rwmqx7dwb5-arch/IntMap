---
title: ボード(board.compose)と宣言ビュー(ui.compose)を 1 つの画面構成の仕組みに統合し、本物の地図と時計につなぐ
date: 2026-11-20
newsen: Atlas workspaces now move the real map when you pick a row, follow the Chronos clock, and can list the real-world objects found in your session.
newsjp: Atlas の操作画面が、行を選ぶと本物の地図が動き、Chronos の時計に追従し、セッションで見つけた実世界のオブジェクトも一覧できるようになりました。
---

〈依頼〉外部監査(2026-11-20)の指摘「Board(#1293)と `ui.compose`(#1301)が別々の画面構成方式を持つ」。共有データ・選択状態・時間状態・地図表示を共通の仕組みに寄せ、Board の簡易 SVG 地図を本物の地図と連動させ、時間軸と世界オブジェクトの Widget を足し、長いジョブの途中成果を受ける口を作る。

## 0. 前提(PR の状態)

#1293・#1301 とも作業開始時点で open・`BLOCKED`(CI 未完)。両 branch の先頭を、この作業の branch に**そのまま取り込んだ**(衝突なし)。この PR は 2 本の変更を含む——どちらかが先に merge されても差分は自然に縮む。

## 1. 統合のしかた(二重実装を作らない)

- **画面を組む仕組みは 1 つ、入口が 2 つ。** `ui.compose` に `board` ブロックを足した。中身は `board.compose` の引数そのままで、`chart` ブロックが `chart.compose` を、`controls` が `ui.inlineControls` の描画器を呼ぶのと同じ形(`BLOCKS.board.via = 'board'` → 同じ dispatch)。返答の中に静的な図表を並べつつ、操作して連動させたい部分だけをライブな作業台として隣に開ける。
- **文字列の拒否規則は 1 か所。** URL とタグの 2 つの拒否(`URL_RE`/`TAG_RE`)を `js/ui-text-rules.js` へ移し、`atlas-ui-spec.js`(ビュー)と `board-spec.js`(ボード)が同じ関数 `textProblems` を呼ぶ。ボードはこれまで Atlas が書いた題・出典・見出しに対するこの拒否を持っていなかった。データの値(行のセル)は対象にしない——ボードは `textContent` でしか描かず、データは Atlas が書いたものではないため。
- **共有状態に時間を足した。** `board-state.js` に `time`(エポック ms)と `setTime`/`getTime`、`visible(rows, timeOf)` の「その時点で存在する行」絞り込みを追加。時間はマスタークロック(`globalThis.IntMapTime`)の**写し**で、保存しない(時計はセッションのもの)。`time` ウィジェットは時計を動かし(`setYear`/`setNow`)、時計の broadcast が `IntMapTime.on` 経由でストアに戻る。ウィジェットがストアの時間を直接書くことはない——時間は 1 つで、地図や他のレイヤーと食い違えない。行の時刻の読みは `IntMapData.momentOf`(年は年・日付はその日)を先に使い、無ければ `Date.parse`。時刻を読めない行は他のフィルタと同じく「通過しない」。

## 2. 本物の地図との連動

- 場所を持つ行・点・オブジェクトを選ぶと、`IntMapGeoEngine.camera` で本物の地図が動く(1 件は `flyTo`、複数は `fitBounds`)。120 ms のデバウンス。レンダラが無ければ何もしない(ボードは動き続ける)。
- 地図またはオブジェクトのウィジェットを持つボードは、開くときにデータセットを本物の地図へ 1 回描く(`IntMapGis.draw`)。「行を地図に表示」ボタンは同じ関数で描き直す。
- ボード内の SVG は**位置の目安**に位置づけを変えた(文言も「簡易表示…」から「位置の目安。選ぶと本物の地図が動きます」へ)。
- **やっていない**: 本物の地図上の点をクリックして選択に戻す向き。Chronos の描画やレイヤーのクリック処理(`app-body.js`)に触れる範囲で、別の作業にした。

## 3. 新しいウィジェット

- `metrics`(Analysis)— `{label, agg: count|sum|mean|min|max, field?, unit?}` を、**表示中の行**(選択があれば選択した行)から計算。フィルタ・選択・時計のどれが動いても更新される。
- `time`(Time)— 年のスライダーと「現在に戻す」。`data.timeField` が無いと拒否(何も変えないスライダーを作らない)。
- `objects`(Objects)— 型ごとにまとめたチップ。押すと選択=地図が動く。
- `Time`/`Objects` は前回「名指しだけで widget が無い」と記録した節。実体ができたので `SECTION_OF` に載せた。
- **世界オブジェクトの渡し方**: `data.worldObjects: true | {types}` を `atlas-cap-board.js` がセッションの索引(`atlas-world-objects.js` の `worldObjects`)から**行に変換**して `board.open` に渡す(列: ref・type・name・country・at・lng・lat・related・source。`related` はその索引自身の `related()` が数えた他オブジェクトの数)。board.js/board-spec.js はこの索引を import しない——遅延チャンクが Atlas 側の部品を引き込んで起動時のチャンク分割が変わるのを避けるため(memory `intmap-lazy-import-splits-main`)。行に変換するので、保存と復元は通常の inline rows と同じ。
- `board.compose` の能力記述(en+jp)・schema を更新。能力の行は増やしていない(`board.compose`/`board.restore`/`ui.compose` の 3 行のまま)ので、能力表・能力数に変更なし。

## 4. 長時間ジョブの途中成果の受け口

`IntMapBoard.feed({rows, done?, progress?, replace?})`。開いている inline ボードへ行を追加し、`done` が来るまでフッターに「途中経過 NN%」を出す。`MAX_ROWS` を超えた分は保持せず、フッターが「打ち切り」と言う(黙って落とさない)。データセット版のボードは `IntMapData` の変更を既に購読しているので `feed` は拒否する(`dataset-board-updates-through-IntMapData`)。保存時は**その時点で持っている行**を保存する。#1294(長時間ジョブ)側が結果を持ち帰ったら、この関数を呼べば画面に出る。**呼び出し側の配線は #1294 が merge された後の仕事で、ここでは入れていない**(存在しない呼び出し元に配線を書かない)。

## 5. 検査

- `tests/board-compose-checks.test.mjs`(6 件・モジュールを評価): 新ウィジェットの節への対応、拒否が名前つきで出る(未知の列・未知の集計・時間列の無い time)、ボードとビューが同じ拒否関数を使う、`board` ブロックが表・schema・検査にある、時計が行を絞る(時刻を読めない行は除外・同じ時刻は通知しない・保存しない)、世界オブジェクトが行になる。
- `tests/declarative-workspace-checks.test.mjs`: 全種類を覆う fixture に `board` ブロックを足し、run が dispatch を通ることを確認(ブロック番号が 1 つずれる)。
- `tests/board-compose.spec.js`(build した app・Chromium): 行を押すと本物のカメラが呼ばれ(スパイ)、時計を 2000 年にすると指標・表が 1 行になり現在に戻すと 3 行、`feed` で行が増えて「途中経過」が出て `done` で消える、`ui.compose` の `board` ブロックでパネルが開く。

## 6. 今回やらなかったこと

- 本物の地図からの選択(上記)。
- `atlas-chart` への点の識別子の追加(前回の記録のまま。ボードのグラフは自前の SVG)。
- #1294 の側から `feed` を呼ぶ配線。
