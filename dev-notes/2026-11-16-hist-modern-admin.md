---
title: 過去の日付でも国境と区分が今と同じ所は今と同じ線と名前で描く・年を変えたときのカードを撤去
date: 2026-11-16
newsen: When you travel back in time, national borders, provinces and prefectures that have not changed since are now drawn with exactly the same lines and names as today, and moving the clock no longer opens a notice card.
newsjp: 過去の年に移動しても、その後変わっていない国境・都道府県・州は今と同じ線と名前で描くようにしました。年を変えたときに出ていた注意カードも出なくなりました。
---

〈依頼〉「1950年みたいな、今と同じにもかかわらず都道府県境界がオリジナルのものかつ変な感じになってる」「絶対ほかの国もこうなってる」
「年代変えたときに出てくる border disclaimer うざい。いらない」（全年・全世界が対象）。

## 0. 測った

1950-06-15・関西（z7.5）で地図が描いていた府県境は 2 本だった。

- OpenHistoricalMap のタイル線（`imta-vt-line`）——開始 1872/1881 年・**終了日なし**（今も同じ境界という記録）
- `data/hist-admin-fill.js`（Natural Earth 10m の現代府県を 0.01° で単純化した写し・`imta-gap-line`）

どちらも現在表示の線（OpenFreeMap `boundary` ＝ OSM）ではない。現在の線の頂点 1,301 個と写しの輪郭の距離は
中央値 1.08 km・p90 2.81 km・p99 4.29 km・最大 6.53 km。同じ単位・同じ境界なのに、時計を動かしただけで粗い線が
2 本重なっていた。原因は日本固有ではなく、「その日付の単位が今も続いているか」を描画が一切見ていなかったこと。

## 1. 直したこと

- `js/admin-present.js`（新規・純関数）: その日付に在る単位のうち記録が今も続くもの（行の終了年 9999）が覆う土地を
  「今と同じ土地」とし、その後に変わった単位から `PRESENT_EPS_KM`（7 km＝上の最大値）以内を除く。
- `js/time-admin1.js`: 第1級・第2級で、今と同じ土地は現在と同じ OpenFreeMap の線（タイルから読み戻し、タイルごとの重複は
  最も深いタイル 1 枚だけが持つ）を `imta-now-line` / `imta2-now-line` に描き、記録の線（タイルの終了日なしの線・束の線・
  穴埋め記録の線）は同じ判定の裏で切る。タイルの終了日なしの線は `imta-vto-line` に移し、`imta-vt-line` は終了日のある線だけ。
  名前は `ofm-admin1` をその土地の名前 id に絞って出す（クリックも現在と同じ経路）。現在の線のタイルが無いときは何も
  差し替えない。第3級は現在に対応物が無いので対象外。
- `js/layer-time-kernel.js`: 時計を動かすたびに出ていた「The map at <日付> — Not drawn …」カードを撤去。同じ文は各層の行に
  残り（`mark`）、`coverage()` / `verdict()` も Atlas に答える。層を描かない挙動そのものは変えていない。
  `scripts/showcase-capture.mjs` のカードを畳む手順と、`tests/learn-quests-checks.test.mjs` のカードの属性の検査を外した。

- 国境（利用者の確認済み）: 1950 年のピレネー（1868 年から不変）でも記録の線は現在の線から中央値 0.56 km・p90 1.79 km・最大 8.25 km。
  `js/time-borders.js` で CShapes の行が記録の最終日（2019-12-31）まで続く政体を「今と同じ」とし（翌日からこのファイル自身が現在の
  国境へ引き継ぐ）、同じ判定で `imtb-now-line` / `imtb-now-casing`（`borders-only-line` と同じ線）と `imtb-line` を切り分ける。
- 現代区分の写し（`data/hist-admin-fill.js`）は、別の記録が始まる所で行の期間が切れる（岡山県は 1966-11-01）が、どの行も今も在る
  区分の今日の輪郭だと記録自身が述べる。行の終了年だけで判定すると岡山が「変わった区分」扱いになったので、`HIST_ADMIN_GAPS` の
  その記録に `todayOutline` を持たせ、`rowIsToday` が読む。
- 同じ確認で見つけた別の欠陥: 共有リンク（`tt=1950-06-15`）で過去の日付のまま開くと、OpenHistoricalMap のタイル線が
  **1900-07-01 の絞り込みのまま**描かれていた。スタイルの読み込み中に `vtAim` が層を作れず日付を捨て、あとで `apply()` が
  層を `ensure()` の既定値（1900 年）で作り、時計を動かすまで誰も狙い直さなかった。日付の絞り込みを層より先に保持し、
  層を作るときにそれを使い、作れなかったときはスタイルが描けるようになった時点で 1 回だけ狙い直す。

## 2. 検査

`tests/hist-modern-admin-checks.test.mjs`——判定を評価して、変わっていない土地では現在の線、変わった単位の継ぎ目と記録の無い
海では記録の線になること、両者が全線分を重複も欠落もなく分けること、タイルの重複が 1 本になること、カードが作られないこと。
