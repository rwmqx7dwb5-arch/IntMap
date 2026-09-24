<!-- dev-notes:pointer — 固定の案内。記録を足してもこのファイルは変わらない（`node scripts/dev-notes.mjs --check` が照合する） -->
# IntMap — 開発記録

> **いつ・なぜ・どう直したか**の記録。**1 エントリ＝1 ファイル**で [`dev-notes/`](dev-notes/) にある。
> **今どうなっているか**は `Architecture.md`、製品の不文律は `CONSTITUTION.md`。

- **新しい順の一覧**: `node scripts/dev-notes.mjs --list`（その場で生成する。このファイルには書かない——
  書くと、並行する PR が全部このファイルで衝突する）
- **最新の 1 件**: `node scripts/dev-notes.mjs --latest`
- **新しい記録**: `dev-notes/<YYYY-MM-DD>-<slug>.md`（front matter に `title` と `date`、分かれば `pr`）。手順は `.agents/skills/intmap-round/` §3
- `dev-notes/R<N>.md` は番号で呼んでいた頃の記録（名前は当時のまま）。旧索引の各行（回ごとの長い要約）は
  [`dev-notes/legacy-index.md`](dev-notes/legacy-index.md)、それより前（Round 1 〜 #R259）は `DEV-NOTES-ARCHIVE.md`（古い順・読むだけ）
