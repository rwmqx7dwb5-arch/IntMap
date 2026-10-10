---
title: 恒久指示を約 190 KB から約 139 KB へ——事実と規則は 1 つも消さず、物語・二重の写し・⚠ の多重だけを消した
date: 2026-10-10
internal: エージェントが毎セッション読む指示文書の形式上の削除で、利用者に見える挙動は変わらない
---

〈依頼〉 恒久方針（`.agents/rules/substance-over-form.md`）に従い、毎セッション読まれる恒久指示を事実と規則を失わずに短くする。

## 0. 測った（バイト・LF）

| 文書 | 前 | 後 | 目安 |
|---|---|---|---|
| `AGENTS.md` | 30,564 | 21,818 | 20 KB |
| `.agents/skills/intmap-round/SKILL.md` | 27,725 | 17,432 | 14 KB |
| `docs/AGENT-SETUP.md` | 48,581 | 33,495 | 30 KB |
| `CONSTITUTION.md` | 24,148 | 22,046 | 18 KB |
| `.agents/roles/intmap-verifier.md` | 17,922 | 5,895 | 6 KB |
| 他の 4 役（scout / i18n / implementer / prod-verifier） | 16,327 | 14,553 | 各 3 KB 程度 |
| `.agents/rules/*.md`（5 本） | 24,868 | 23,889 | 各 6,144 B の内側 |
| 合計 | 190,135 | 約 139,100 | |

目安に届かなかった 4 本は、残りがコマンド・名簿・数値・規則そのもので、さらに削ると事実が減る
（`AGENTS.md` は needle と終了報告の定型・名簿の行き先、SKILL は手順のコマンド列と記録の書式、
`AGENT-SETUP.md` は Edge Function 21 本と `_shared/` 28 本の名簿・§10 の不変条件・Codex の手作業表、
`CONSTITUTION.md` は日英併記の不文律と §7 の言語方針の正本）。

## 1. 消した種類

- **事例の物語**: `#R<N>` で何が起きたかの長い経緯（`#R413` の打ち切り件数、`#R707` の位置引数、`#R704` の
  hook 未 trust の調査経過、`#R282` の同期量、`#R588` の言語別名、i18n・scout・prod-verifier の事例番号など）。
  事例はどれも `dev-notes/`（`R384.md`・`R707.md`・`legacy-index.md` ほか）に既にあり、規則と、規則の根拠になる
  数値（P571 の日付・36,095 バイトの実測・5.1.26100.9168 など）は残した。
- **同じ事実の 2 つ目の写し**:
  - ゲートの一覧——`intmap-verifier.md` が `execution-strategy.md` §4 の表と同じ 36 個を手で持っていた。役は表と
    `docs/TESTING.md`（各ゲートの主張の正本）を指し、失敗を読むのに要る性質（build が要る・再生成しない・オフラインで
    再導出する・資産が git の外）だけを残した。
  - 番号を名前にしない理由——SKILL §4 と `AGENT-SETUP.md` §11 の両方に物語があった。規約の正本 SKILL §4 に要約を残し、
    §11 はそこを指す。
  - SKILL §5・§7・§8 にあった `AGENTS.md` §5.1・§11.2・§10 の写し（merge 後の CI を待たない・承認不要・`pwsh` ではない・
    `RESULT` 行の読み方・最終報告の項目と末尾 3 行）は `AGENTS.md` を指す 1 行に。
  - `AGENTS.md` §3 の 9〜11 と §5.0 の本文は、それぞれの規則ファイル（Claude Code は import、Codex は §1 で開く）の写し
    だったので 1〜3 行の要約と正本名に。
  - `CONSTITUTION.md` §6 の `AGENTS.md` 行にあった `#R257`・`#R260`・`#R503` の経緯。
- **⚠ の多重**（⚠⚠⚠・⚠⚠）と、同じ注意の言い換え。

## 2. ついでに正したずれ（事実の側）

- SKILL §6 は Edge Function の名簿の正本を `AGENTS.md` §5.1 と書いていたが、名簿は `docs/AGENT-SETUP.md` §9 にある。
- `AGENTS.md` §5.1 は手での deploy だけを書いていた（`AGENT-SETUP.md` §9 が「天井のため別のラウンドで直す」と注記していた）。
  通常は CI が出し、手での deploy は緊急時の手段、と両方で同じことを言うようにした。
- `AGENT-SETUP.md` §7 は「`AGENTS.md` §3.5 が 9 言語すべてへの反映を要求する」と書いていた（2026-09-11 の改正前の文）。
- `CONSTITUTION.md` の「違反したら」は「削るなら確認を取ってから」のままで §0 の 3（2026-10-10）と食い違っていた。§0 の 3 の物差しを指す。
- `AGENTS.md` §3 の箇条書きが 1..8, 10, 9, 11 の順だった。Markdown は表示上の位置で番号を振り直すので、「§3 の 9」
  （場当たりの禁止）が表示では歴史地図を指していた。9, 10 の順に直した（`section-refs` は 443 件全部解決）。

## 3. 更新した検査（綴りの固定 → 事実の固定）

- `tests/process-agent-context-checks.test.mjs` #R503 ①「stub でない」: 床 12,000 字は当時のファイルの大きさから取った
  数で、スタブが何かから導いていなかった。全規則を残した 11,750 字の版がこれを割った。床を「`CLAUDE.md`（製品固有の
  半分）に許された上限 `PROVIDER_HALF_MAX` = 6,000 字より大きいこと」にし、同じ定数を ② の天井と共有した。規則の存在は
  今までどおり needle（同 ①・`process-standing-rules` ②③）が見る。
- `scripts/doc-facts.mjs` の `gate-lists`: 2 文書で同じ 36 個を手で持つ規則そのものが二重の正本だったので、
  `execution-strategy.md` の表だけを `package.json` と照合する。事実（全ゲートが一覧にある）は 1 か所に残る。
- `tests/process-doc-facts-instruction-docs-checks.test.mjs` R403 ⑥: `gate-lists` の変異の錨を
  `intmap-verifier.md` の行から `execution-strategy.md` の `| 紛争データ | \`npm run check:wars\` |` 行へ移した
  （壊せば赤くなることは同じ）。

## 4. 検査

`npm run check:agents`・`npm run check:docs`・`npm run check:static` 緑。`node --test` で doc-pins の 14 本と
`tests/process-*-checks.test.mjs` 全部・文書を読む関連テスト（計 129 本）を走らせ緑。`node scripts/dev-notes.mjs --check` 緑。
