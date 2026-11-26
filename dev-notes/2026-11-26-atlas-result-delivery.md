---
title: Atlas の結果の持ち帰りと「済んでいる」判定を事実に合わせた（往復操作・長いカード・出典 URL・構造化結果）
date: 2026-11-26
internal: 利用者に見える画面は変わらず、Atlas がモデルへ渡す結果と重複判定の内部の修正
---

〈依頼〉 調査役の所見 8 件を再現し、直す。**8 件すべて旧コードで再現した**（`tests/atlas-result-delivery-checks.test.mjs` を修正前の `js/` に当てると 9 件が落ちる）。

| # | 欠陥 | 直し方 |
|---|---|---|
| 1 | `doneCalls` が書き込みで無効化されない（A→B→A の 3 回目が虚偽の注記つきで前回結果を返す） | ターン内の書き込み記録 `writeLog` を持ち、保存時点より後に、その呼び出しの `reads`（未宣言＝アプリ全体）か `writes` と重なる書き込みがあれば再実行。登録は能力行の footprint（既存）から導く |
| 2 | 結果テキストを 2000 字で切り、`read_result` も切った後を読む | `mechanical` で切らない。切るのは composer（`INPUT_BUDGET.item`）だけで、そこから `read_result` が原本へ続く |
| 3 | `textOf` が `textContent` だけ（href・alt・title・value・data-* が落ちる） | 1 つのトークナイザで、内容を運ぶ属性を `[href: …]` の形で添える（JSON の data-*、script/style、`javascript:` は除く） |
| 4 | `meta` の許可名簿が狭い | 名簿を足さず、`meta` のうち JSON にできるデータで他の欄が既に運んでいないものを `details` として全部運ぶ（`META_CARRIED` は「既に別の欄で言っている／ページの帳簿」の側の一覧） |
| 5 | `objectIds`・`unresolved` が届かない | `toLegacy` が `unresolved` を運び、`mechanical` が両方を欄にする |
| 6 | partial の地図が `ok:false` のせいで `map_not_drawn` | `producedBy` は partial の `producedModes` を数える。旧 fixture は `ok:true` で実際の形と違った |
| 7 | `callKey` が tool 名と綴りで決まる | `identityOf`（`capOf` で解決した能力 ID＋引数）から key を作る。`compose_map` と `run_capability{map.compose}`、別名と正規 ID は同じ呼び出し |
| 8 | `unobserved` を「二度と観測できない」と凍結 | 注記を「前面に戻れば観測できる・書き込みが無ければ記録から答える」に。`unobservedModes`（登録の `produces`）で出力ゲートは「呼んだ」ことを認め、再描画へ差し戻さない（出来たとは数えない） |

## 否定した見立て・注意
- `RESULT_TEXT_MAX` は 2000→40000（`forReader` が「モデルが全文を見たか」を測る基準。`INPUT_BUDGET.item` の 48000 から記録の他欄を引いた値）。
- 読み取りだけの呼び出し（`writes` が空）は他の読み取りでは無効化されない。`reads` 未宣言の呼び出しは、間に書き込みがあれば再実行される（保守側）。
- 実測（本番）は PR のあとに追記する。
