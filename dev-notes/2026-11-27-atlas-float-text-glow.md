---
title: 浮遊 Atlas: 全ての文字にグロー・矩形の板を全廃・自分の吹き出しを元どおりに戻す
date: 2026-11-27
newsen: In the floating Atlas, every piece of text now glows along its letters with no rectangular plate behind anything, and your own message is back to its original bubble.
newsjp: 浮遊 Atlas の文字すべてに、文字の形に沿ったグローを付けました。四角い板は一切無く、自分のメッセージの吹き出しも元の見た目に戻しました。
---

〈依頼〉 浮遊 Atlas の文字全部にグロー（四角い背景で代用しない）／自分の吹き出しが消えている。

- 吹き出しの経緯: #1477 が「矩形のグローを退ける」ために吹き出しごと外し、#1483 で薄い白の吹き出し（白 14%）を足したが、明るい地図では地図に溶けて「消えている」まま。元（青紫のグラデーションのガラス・縁・角丸）に戻した——浮遊側の上書きを消し、パネル本来の `.atl-b.u` がそのまま効く。吹き出しは地図ではなく面の上にあるので、文字はテーマの墨色で、グローは面の色。
- グロー: 部品を列挙せず、根（`#atlas-float:not(.bg)`）に 1 規則。`#atlas-panel *` と bar の全子孫に `text-shadow:var(--atl-glow)`、入力の placeholder も。SVG の記号（＋・マイク・矢印・bar）は `drop-shadow` で輪郭に沿う。
- 板の全廃: bar のガラス丸薬、入力行の塗り・box-shadow・backdrop blur、送信ボタンの白丸、チップの塗りを、`:not(:empty)` を持つ全要素の `background`/`box-shadow`/`backdrop-filter` リセット 1 規則に統合。空の要素（色見本・棒の塗り）と進捗バーは意味を持つ色なので除外。`.bg`（枠付き背景スイッチ）は利用者が選ぶ別機能なのでそのまま。
- 検査: `tests/atlas-float-text-glow.spec.js` が実ページで全要素の計算済みスタイルを測る（文字にグロー・塗り/影/blur 無し・自分の吹き出しに塗りと縁・規則に名指されていない新要素もグロー）を明暗両テーマで。綴りを固定していた 4 本の検査（typography・answer-panel・glass-look・map-ui-fixes）は新しい構造に合わせた。
