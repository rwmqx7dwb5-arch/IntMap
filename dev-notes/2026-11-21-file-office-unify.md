---
title: Excel の書き手と ZIP を 1 本にした——文書の表も、データセットの書き出しも同じ office-writer.js を通る
date: 2026-11-21
---

〈依頼〉監査で「file.create の Excel(#1357)とデータセットの Excel 書き出し(#1330)が別々に .xlsx を書いている」と指摘された。
#1330 は先に main へ入ったので、main の `js/office-writer.js`(gis-export の xlsx・work.job の書き出しが呼ぶ)を正本に残し、
その上に文書側の機能を足して、文書側の二つ目の書き手を消す。#1357 は merge されずに閉じた(file.create の本体は #1358 に含まれる)。

## main の #1330 を取り込んだ後の差分
`writeXlsx(sheets)` の既存の呼び出し(gis-export・work.job)は無変更で動く。足したのは任意の `{ when, core }`、シートの `numericText`、
列幅、ヘッダーの塗りと固定、ZIP の `zip-store.js` への置き換え。`tests/work-files-checks.test.mjs` は無変更。

## perf 天井を上げた理由
`async.raw`・`async.gzip`・`atlas-cap-runs`・`atlas-console`・`dist.*` の天井を `perf-budget.mjs --update` で上げた。増えた主因は `file.create` 能力
(文書の書き出し 9 形式の書き手と、能力表・スキーマの行)が `atlas-cap-runs` / `atlas-console` に入ったこと。起動(eager)には入らない。
取り込んだ origin/main 側の増加分もこの更新に含まれる(main の CI が次の push で締め直す)。同時に、名前で読まれない `atlasFile` の export を外した
(`layer-boot-graph-checks` の R175 ③)。

## CodeQL
- `WIDE`(全角幅の正規表現)が CJK 互換漢字のリテラルで書かれ、U+F900 が正規化で U+8C48 に化けて範囲が重なっていた(js/overly-large-range ×2)。`\u` エスケープに直した。
- `js/file-text.js` の `mdCell` は `|` を逃がすが、バックスラッシュを逃がしていなかった(js/incomplete-sanitization)。先に `\` を逃がす。

## 何を消し、何が引き継いだか
| 消したもの | 引き継いだもの |
|---|---|
| `js/file-office.js` の xlsx 書き手(シート XML・styles・workbook・rels を自前で組む約 50 行)と `sheetName` の二つ目の実装 | `js/office-writer.js` の `writeXlsx(sheets, { when, core })`。文書の表は「列と行の配列」に直して渡すだけ |
| `js/office-writer.js` 内の ZIP と CRC-32 表(`zipStore`) | `js/zip-store.js`(`zip` / `readZip` / `crc32`)。docx・pptx・検証と同じ 1 本。`file-office.js` は互換のため再エクスポート |
| 書き手ごとに違った見た目(片方は列幅・ヘッダー塗りあり、片方は無し) | 両方の長所: 列幅は最も広いセルに合わせる(全角は 2 倍)、ヘッダーは太字+薄い塗り+固定、数は数・`"01100"` は文字 |

## 正本を office-writer にした理由
データセット側は限界を「名前で拒む」(`xlsx-too-large`)・切った件数を返す・NaN を空にして数える、までを持っていた。文書側にはそれが無く、
Excel の上限(行 1,048,576・セル 32,767 文字)を超える入力を黙って壊しうる。拒否と計数を持つ側を正本にし、文書側が使う側に回した。
文書の表は文字列で数が届く(Markdown)ので、シート単位の `numericText` で「先頭ゼロの無い 10 進数だけ数にする」を足した。
データセットは文字列を数に推測しない(従来どおり)。

## 検査
`tests/file-office-unify-checks.test.mjs`: ZIP の実装が 1 つ・文書とデータセットで styles/workbook 部品が同一・`007` は文字で `125` は数・
core.xml が文書側にだけ付く・上限は名前で拒む・全角幅。既存の `file-deliverables-checks` と `work-files-checks` は無変更で通る。
