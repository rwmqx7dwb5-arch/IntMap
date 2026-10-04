---
title: 比較ウィンドウの大きさを変えられなかった——辺は掴めず、角は目印の無い 18 px の四角 4 つだけ。アプリに 1 つの辺リサイズへ
date: 2026-10-04
newsen: The compare window can now be resized from any edge or corner, with the resize cursor showing where you can grab it.
newsjp: 比較ウィンドウの大きさを、辺と角のどこからでも変えられるようになりました。掴める場所ではカーソルが変わります。
---

〈依頼〉「compare viewのウィンドウ、サイズ変更ができない。」——確認の回答「PC で辺や角をドラッグ」。

## 0. 測った（本番・PC・2026-10-04）

- 角の 4 つ（`.cmp-rz`、18×18 px）は `elementFromPoint` で最前面にあり、左上の角を外へ引くと幅 441 → 609 px に**変わった**。
- 辺には何も無い。角の目印は #R47 で隠されていた（`opacity:0`）。⇒ 利用者が掴む場所（辺・見えない角の外）では何も起きない。

## 1. なぜ

比較ウィンドウだけが**自分の**リサイズ（#R20 の四隅の四角）を持ち、アプリに 1 つある `addEdgeResize`（`js/window-manager.js`。辺と角の 9 px・
カーソル・最小寸法）を呼んでいなかった。その関数の註は「Compare window keep edge-resize」と、比較ウィンドウを使い手として数えていた——
**宣言はあったが、呼び手が無かった**。

## 2. 直したこと

- `js/compare.js`: 四隅の四角（CSS・markup・pointer の処理）を外し、`HOST.addEdgeResize(win,{ min:[260,200], skip })`。
  失うものは無い（角も 9 px の帯で掴める。四角は辺の機構の部分集合だった）。
- `js/window-manager.js`: `addEdgeResize` が呼び手の `opts.skip()` を訊く——携帯では比較ウィンドウの幅が COMPACT の規則で固定され、
  高さは下端のつまみ（#R16）で変えるので、辺の帯は退く。
- 最小化（`.cmp-min`）と戻すときの高さは、以前の `prevH` の処理のまま動く（実測: 411 → 42 → 411）。

## 3. 確かめた（ローカルのビルド・1280×720）

左の辺を外へ 150 px: 幅 441 → 596。上の辺を上へ 100 px: 高さ 343 → 447。右下の角を内へ: 597×447 → 541×411。左の辺に乗るとカーソル `ew-resize`。

## 4. 検査

`tests/compare-window-resize-checks.test.mjs`: 比較ウィンドウが `addEdgeResize` を呼ぶ（最小寸法と skip つき）・自前の四隅の機構が無い・
`addEdgeResize` が `opts.skip` を訊く・skip が真のとき入口（hover と押下）が退く。実際の引き伸ばしはローカルのビルドで実測した（§3）。

## 5. 共有窓口（`check:surface`）

CI の 1 回目で `window.IntMapDevice` の読みが 1 つ増えた（87 → 88）と落ちた（skip が COMPACT を読んだ）。比較ウィンドウは同じ「携帯の配置か」を
`window.IntMapDevice.compact()` で 3 か所読んでいたので、ファイルの中の 1 つの `_compact()` にまとめ、skip もそれを使う。読みは 87 → 85
（`node scripts/global-surface.mjs --update` で基準を小さいほうへ）。
