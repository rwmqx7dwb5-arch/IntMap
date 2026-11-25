---
title: 遅延チャンク全体の gzip 上限を実測に合わせる（main の perf-budget が #1432 以降赤く、ページ公開が止まっていた）
date: 2026-11-26
newsen: Internal budget update; no change for readers.
newsjp: 内部の予算の更新で、利用者に見える変更はありません。
---

main の CI が `perf-budget` で赤い: 遅延チャンク全体の gzip が 5319.9 kB で、上限 5290.5 kB を +29.4 kB 超えた。赤は #1432（同梱データ 15 表の宣言）の main 実行から始まり、#1433（Web 証拠ストアと `web.search`/`web.evidence`・`atlas-console` 単独で +19.5 kB 生）が重なって続いた。各 PR の CI は合流前の木で測るので、個別には緑のまま合流後に赤くなった。赤の間は Pages の公開が走らない（`Deploy to Pages` が skipped）ので、本番のページ側が止まる。

**正味の増加で、チャンクの割れではない**: 増えたのは遅延チャンクの中身（宣言された表のデータ・能力の実装と説明文）で、起動時に読む主チャンクと要求数は変わらない（`check:perf` の起動予算の行は緑）。⇒ 上限を `node scripts/perf-budget.mjs --update` で実測（5319.9 kB）に合わせた。上がる行だけを上げ、他は動かしていない。

減らす見込み: 能力説明文（`doc`）は `find_capability` で引かれたときだけ使うので別チャンクに分けられる。
