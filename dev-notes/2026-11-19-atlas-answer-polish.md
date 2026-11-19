---
title: Atlas 回答の読みやすさを仕上げる——出典カード・グラフ・表・注釈のキーボード・コピーの正直さ
date: 2026-11-19
newsen: Atlas answers are easier to read: larger source cards with two-line titles that open and close, readable chart labels, one table style, keyboard access to notes and place names, and a copy button that only says Copied when it worked.
newsjp: Atlas の回答を読みやすくしました。出典カードは大きく 2 行のタイトルで開閉でき、グラフの文字は読みやすく、表の見た目は統一、注釈と地名はキーボードで操作でき、コピーは成功したときだけ「コピー済み」と表示します。
---

〈依頼〉 Atlas 回答 UI の総点検（外部の調査メモ）にある改善点を、できるだけ全部。

## 直したもの
- 出典カード: タイトル 12.5px・2 行、ドメイン 11px。「+N」は開閉の両方向（`aria-expanded`）。
- 引用チップ: 約 10px → 約 11.7px、高さを増やした。
- グラフ・年表: 軸 10px・イベント名 10.5px・凡例 12px。年表のラベルは上下 2 段のうち重ならない側へ置き、どちらにも入らないものは点だけ残し（`tabindex`・`<title>`）、キャプションに件数を述べる（黙って落とさない）。端のラベルは `anchor` で内側へ。
- 表: GIS 結果の表も Markdown 表と同じ `.atl-md-table`。列・行の出典は `title` でなく注釈カード（タップ・ホバー・フォーカス）。横スクロールの保証（`width:auto;min-width:100%`）は据え置き。
- 注釈（`.atl-an`）と地名リンク（`.atl-geo-ref`）: `tabindex=0`・フォーカスで開く・Enter/Space で地図へ。注釈カードは `role=tooltip`、`aria-hidden` をやめた。
- 未完了: 「一部未完了」ラベル付きの `role=status`（琥珀の左線）。回答の描画例外は短い文＋折りたたみの詳細。
- コピー: クリップボードが受け取ってから「コピー済み」。拒否・失敗は「コピーできません」（コードブロックと返信ツールの両方）。Copy / Wrap ボタンは 28px 以上。
- 構造化回答の `bullet_list`: 入れ子のインデントと継続行を保つ。
- 地図上のフローティング回答: 待機時の不透明度 .58 → .86。

## 直していないもの（理由）
- Markdown 表の「横にスクロールできる」手がかり、ストリーミング中のスクロール安定性、再描画で `details` の開閉を保つこと、実画面の全幅・ダーク検証: 実環境で測っていない。
- 検査 `tests/atlas-answer-polish-checks.test.mjs`。`atlas-annotate-checks` と `query-engine-checks` は綴りを固定していたので、新しい属性に合わせた。
