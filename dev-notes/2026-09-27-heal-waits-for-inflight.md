---
title: 取得中の箱を自己修復が揺すっていた——雨雲レーダーが索引を待つあいだに 2.8 秒後の点検が「描けなかった」と判定し、タイル 34 枚を中断させていた
date: 2026-09-27
---

〈依頼〉本番検証（2026-09-27）で観測した 1 件。通常起動で雨雲レーダーにチェックを入れると、RainViewer の
索引を待っているあいだに #R109 の post-toggle heal（ON にした 2.8 秒後の点検）が箱を OFF→420ms→ON と揺すり、
最初の要求が始めた radar のタイル 34 枚が ERR_ABORTED になった。監査記録に `toggle-heal` 1 件。
最終的にはチェックが入ったまま描かれる——揺すりは、すでに向かっている同じ要求（`rvFetch` は取得中の
Promise を返す）をもう一度頼んだだけだった。

## 0. 原因

直前の回が足した `observable(cb)=_canDraw()&&!heldNow(cb)` は、`change` が**行に届く前**（預かり中）を
判定しないようにした。届いた**後**、行が始めた要求がまだ終わっていない時間は、どこも知らなかった。
「描かれていない」は「まだ届いていない」と「描けなかった」の両方を指していて、観測器は前者を後者と
報告していた（`.agents/rules/one-pass-or-a-reason.md` §2 ①）。

⚠ 揺すりが二度目の `addRainViewer()` を呼ぶと、それは既存の source を消して作り直す——中断されたのは
最初の要求が始めたタイル。

## 1. 直したこと（構造で）

- **行自身が「まだ終わっていない」を述べる。** `toggleLayer(id,on)` は各枝の最後の非同期の鎖を Promise で
  返す。共通の後段（汎用凡例・#R30 の孤児ガード）を飛ばさないよう、`return` ではなく `req` への代入で持つ。
  すぐ描く枝（風・昼夜・航空／船舶）は何も返さない。
  - `withCountries(cb)` は callback の後（callback が返す Promise も待つ）か、40 秒の待ちを諦めたときに settle。
  - `addKoppen()` と `addSubcables()` は、構築の梯子の終わり（描けた・地平線で諦めた・箱が外された）で
    settle。終わりはどれも 1 か所（`_koppenStop` / `_subcSettle`）を通る。ケーブルは取得の後退（#R188）を
    またいで 1 本の要求。
  - `addFirmsThermal()` は各日の層の `Promise.all`、`applyMilMode()`・`startSats()` は中の鎖を返す。
- **登録は `js/layer-rows.js` の `inFlight()`／`layerInflight`**（預かり ③ の反対側なので同じファイルの ④）。
  行の `change` ハンドラが `layerInflight.track(箱, 要求)` を呼び、要求が**成功でも失敗でも** settle したら外れる。
  新しい `change` が古い要求を置き換える（遅れて終わった古い要求が新しいものを外さない）。
  window の大域名は増やしていない（`check:surface`）——module の束縛で渡す。
- **判定する側**（`js/data-layers.js` の整合器）: ON にした 2.8 秒後の点検（`toggleLook` に名前を付けた）は、
  取得中なら `idle(箱)` を待って **settle 後に 1 回だけ**見る。定期の点検は取得中の箱を数えない
  （2 回連続の判定はそこから数え直す）。レイヤー名の一覧は無い。

⚠ **登録を時計で終わらせていない。** 要求は各自の終わりを持つ：描画の待ち（`whenCanDraw`）は描けるときにだけ
解け、描けないあいだはどの判定も元々しない（`_canDraw()`）。取得はネットワークで終わる。梯子は自分の地平線
（ケッペン・ケーブルとも 90 秒）と後退（5+15+45 秒）を持つ。終わらない取得は揺すっても直らない。

## 2. 検査

- `tests/heal-waits-for-inflight-checks.test.mjs`（8 件）— 出荷する関数を実際に走らせる: ① 登録（成功・失敗で
  外れる／置き換え／`idle`）② `toggleLook` を持ち上げて本物の登録と偽の地図で（取得中は揺すらない・settle 後に
  未描画なら 1 回だけ・reject でも同じ）③ `audit`（取得中は数えない・settle 後は従来どおり 2 回で）④ `toggleLayer`
  の**全枝**を関数の中から見つけて走らせ、非同期の仕事を始めた枝は仕事が終わるまで pending の Promise を返し、
  共通の後段（3200 ms の孤児ガード）も走ること ⑤ `withCountries`。
  変異で確かめた: ② の待ちを消す→② 2 件赤、③ の除外を消す→③ 赤、radar 枝の代入を消す→④ 赤、
  修正前の `js/data-layers.js`→全体が赤。
- `tests/heal-waits-for-inflight.spec.js` — 通常起動で、RainViewer の索引だけを 4.5 秒遅らせる（点検より後）。
  修正前: dl-radar の `toggle-heal` 1 件で赤（本番と同じ）。修正後: 描かれ、揺すり 0 件、中断タイル 0 枚。
  1 回の起動・実測 8.0 / 8.1 秒（`tests/durations.json`・`TOTAL_BUDGET_S` に 8 足した）。

## 3. 気づいたが直していないもの

- `scripts/global-surface.mjs` の `codeOnly` は正規表現リテラルを知らない。`js/data-layers.js` の途中で
  文字列の状態がずれており、新しいコメントに `'` を 1 つ足しただけで既存の `window._refreshThermal` /
  `window._setThermalOpacity` が「新しい大域名」として現れた（実測）。基準線はその 2 つを見落としている。
  今回はコメントの語を変えて基準線どおりに保った——計器の直しは別の回。
- `rvFetch()` の取得には期限が無い。止まった取得は登録を外さない（揺すっても同じ要求に繋がるので失うものは
  無いが、止まったことを利用者に述べる経路も無い）。
