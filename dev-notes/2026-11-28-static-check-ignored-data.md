---
title: check:static が gitignore 済みのデータ（data/border-detail/ 773 MB）を 3 回ずつ読んで終わらなかった——母集合を git が commit するものに
date: 2026-11-28
internal: 開発用の検査の速度だけで、利用者に見える変化は無い
---

〈依頼〉`npm run check:static` が 15 分たっても終わらない原因を直す。

## 測った

`scripts/static-checks.mjs` はディレクトリを歩いて全ファイルを集めていたので、gitignore 済みの
`data/border-detail/`（9,143 ファイル・773 MB。worktree では `%LOCALAPPDATA%\intmap-data` へのリンク）も母集合に入り、
merge-marker・秘密・JSON 妥当性の 3 検査が 1 ファイル 1 回ずつ（計約 3.4 万回）読んでいた。CI にはこのデータが無いので緑のまま。

## 直した

- 母集合を `git ls-files --cached --others --exclude-standard`（`secret-scan.mjs` が既に「git が commit するもの」と
  呼んでいた集合）に（`scripts/check-universe.mjs`）。git 管理外（展開した archive）では従来どおり歩く。除外名の一覧は足していない。
- `read()` を 1 ファイル 1 回に（キャッシュ）。
- `node --check` の合格をファイルの中身の sha1 と node の版で `.cache/` に残し、変わらないファイルは再起動しない
  （合格だけ記録・失敗は毎回再検査・CI は冷えた状態で全件検査＝網は同じ）。

実測（このマシン・負荷あり）: 15 分超 → 約 90〜110 秒。残りは複数の門が同じソースを各自 acorn で解析している分
（site-url・output-taint・runtime-scripts ほか。次の作業の候補）。

## 検査

`tests/static-check-ignored-data-checks.test.mjs`: 一時の git checkout に ignored と committable を置き、前者を読まず後者は読むことを確かめる。
