---
title: DEV-NOTES.md を固定の案内にした後も、指示書が「生成索引」と言い続けていた——文書の言い回しも同じ検査で測る
date: 2026-09-26
---

`DEV-NOTES.md` を一覧を持たない固定の案内にした（`dev-notes/2026-09-25-dev-notes-index-untracked.md`）あとも、
`AGENTS.md`（3 か所）・`CONSTITUTION.md` §6・`.agents/skills/intmap-round/` §3 は「`dev-notes/` の生成索引で、先頭が最新」と
述べ続けていた——**コードが離れた構造を散文が持ち続けた**。毎セッション読まれる指示書なので、読んだエージェントは
存在しない一覧を探す。

- 5 か所を「固定の案内・一覧は `node scripts/dev-notes.mjs --list`・最新は `--latest`」に直した。
- `tests/process-without-round-numbers-checks.test.mjs` ③b が、追跡された全 `*.md`（`dev-notes/` と ARCHIVE を除く）を掃いて、
  `DEV-NOTES.md` を「生成（される）索引 / generated index」と呼ぶ文を落とす。一覧の手書きではなく `git ls-files` で発見する。
  古い言い回しに戻すと赤くなることを確かめた。
