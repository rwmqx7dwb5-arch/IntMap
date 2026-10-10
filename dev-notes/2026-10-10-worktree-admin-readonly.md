---
title: 消しかけの worktree 管理ディレクトリ 244 件が積もり、prune が毎回失敗していた
date: 2026-10-10
internal: 開発用の片付けスクリプトの修正で、利用者に見える挙動は変わらない
---

原本の `.git/worktrees/` に 318 個のディレクトリがあり、うち 244 個は `gitdir` も `HEAD` も無い消しかけ
（中身は読み取り専用の `logs/`・`refs/`・`ORIG_HEAD` だけ）だった。`git worktree prune` は全部に
「Permission denied」を出し、`worktree.mjs done` のコメントは「prune が回収する」と述べていたが回収していなかった。
原因は開いたハンドルではなく読み取り専用属性で、PowerShell の `Remove-Item -Force` で全部消えた（その場で掃除済み）。

`done` に `sweepAdminRemnants()` を足した: `gitdir` と `HEAD` を両方失ったものだけを、属性を外して消す。
どちらかが残るものは git が知っている worktree なので触らない。回帰 `tests/worktree-admin-readonly-checks.test.mjs`
は実際に読み取り専用の木を作って確かめる。
