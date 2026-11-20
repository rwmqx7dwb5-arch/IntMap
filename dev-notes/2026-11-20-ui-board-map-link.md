---
title: 回答内の UI と分析ボードを同じ宣言にし、IntMap 本体の地図・Chronos と双方向に連動させる
date: 2026-11-20
newsen: Answer cards and analysis boards are now one thing - a shape clicked on the real map selects its table row, a chart mark lights up on the map, and a time slider moves the main clock.
newsjp: 回答の中の小さな画面と分析ボードが同じ仕組みになりました。本体の地図で図形をクリックすると表の行が選ばれ、グラフの選択は地図に強調表示され、時間スライダーはメインの時計も動かします。
---

〈依頼〉#1301（`ui.compose`・回答内の宣言的ビュー）と #1293（操作できるボード）は近い機能が別々に育っていた。
回答内の小さな UI から分析ボードまでを共通の仕組みにし、地図・グラフ・表・根拠・時間を IntMap 本体の地図と
Chronos に実際に繋ぐ。**この作業は両 PR（open）の上に積んだ**（2 本は互いに衝突せず merge できることを確認した）。

## 0. 何を作ったか

- **共通の宣言**: `ui.compose` に `board` ブロックを足した。中身は `board.compose` と**同じ宣言**で、`js/board-spec.js` の
  `normalise` という**同じ門**が検査する（ビューが、ボードが拒む宣言を運べない）。回答の中には開くカードだけを描き、仕様は
  `IntMapBoard.stage` に預けてマークアップには鍵だけを置く（仕様をマークアップから読み戻さない）。小さいビューと本格的な
  ボードは同じものの 2 つの大きさ。
- **本体の地図との双方向連動**（`js/board-link.js`・新規）: 地図 widget の「メインの地図と連動」（または宣言の `link:true`）で、
  行を IntMap の地図に `bd-<id>` の源として描き、選択を強調し、地図上の図形クリックを選択に戻す。連動は**ストアの購読者**で、
  widget は地図が付いているかを知らない。表・グラフ・簡易地図のどれで選んでも本体の地図が追従し（カメラも選択へ寄る。ただし
  地図上のクリックではカメラを動かさない）、フィルタで隠れた行は本体の地図からも消える。detach は自分が足した id だけを消す。
- **Chronos との連動**: `time` widget（宣言の `data.timeField` が年・ISO 日付の列）。時計が動けばストアの時間窓が追従し、widget を
  動かせば `IntMapTime.setYear` で時計が動く。書き込みに `source:'link'` を付けて往復の反響を止める。**年を読めない行は時間窓の外に
  数える**（unknown は inside ではない — `passes()` と同じ規則）。
- **根拠**: `evidence` widget が、選択された行（表・グラフ・地図のどこで選んでも）の欄を出す。
- **条件の変更は必要な分析だけ**: `param` は従来どおり `IntMapGisProject.setParams` に渡し、依存先だけの再計算は gis-project の仕事のまま。
- **窓**: デスクトップは複数のボードを同時に開け（位置をずらし、タイトルでドラッグ、押すと前面）、640px 以下は 1 枚のシートで、
  節を畳み最初の節（データ）だけ開く（会話を主役に、結果を段階的に開く）。以前の単一の `cur` は「いちばん前の板」として残る。

## 1. 保存

`timeField`・`time` の `mode`・map の `link` は spec に入り、時間窓はストアの snapshot に入る。カメラと時計は従来どおり保存しない
（session-tabs の仕事）。

## 2. 今回やらなかったこと

- グラフはまだ自前 SVG（atlas-chart に点の識別子を持たせる作業が先）。**世界オブジェクト**（`atlas-world-objects`）への選択の登録は
  していない（選択した行をオブジェクトとして名指す経路の設計が要る）。見つけた事実として残す。
- 時間窓は年単位（`IntMapTime.year()`）。日・時刻単位の窓は無い。

## 3. 検査

`tests/board-map-link-checks.test.mjs`（エンジンと時計は偽物。配線を測る）: `yearOf`・時間窓（unknown を外す・upto/at・snapshot 往復）・
time widget の宣言の拒否・地図の双方向（クリック→選択→強調、別要素での選択→強調とカメラ、フィルタで隠れた行は強調しない、detach で
源・層・ハンドラが残らない）・時計の双方向と反響なし・`board` ブロックの検査。`tests/declarative-workspace-checks.test.mjs` の
フィクスチャに `board` ブロックを足し、カードが鍵だけを持つことを確かめる。
