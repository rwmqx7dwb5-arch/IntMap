---
title: セッションが PR を作って auto-merge を付けただけで去り、CI 赤・conflict のまま放置されていた——作業の終わりを「PR が MERGED」と定め、background の待ちで最後まで通す
date: 2026-11-19
---

〈依頼〉 merge されないまま、作業が終わった時点で放棄されるセッションが多い。最後まで完走させる。

## 0. 測った・確かめた
- open PR 14 本のうち 12 本が auto-merge 設定済みで `BLOCKED`（赤い Regression / Static checks など）または `DIRTY`（conflict）のまま止まっていた。
- 原因は仕組みではなく指示の側: `AGENTS.md` §5.1 は「CI を座って見ない。赤いときだけ戻る」、`intmap-round` §5 は「`gh pr checks --watch` で見張らない」と書いていた。セッションは PR を作った時点で終了するので、「赤いとき戻る」主体がいなかった。

## 1. 直した
- 作業の終わりを「PR が `MERGED` になった時点」と定義した（`AGENTS.md` §5.1、`intmap-round` §5・§7）。
- 待ちは禁止しない。`gh pr checks <番号> --watch` を background 実行して終了通知を待つ（ポーリングではなく 1 本の待ち）。赤は落ちた門だけ直す、DIRTY は rebase、`MERGED` を確認するまで「完了」と書かない。
- `.claude/skills/` は `agent-sync --write` で再生成した。
