---
title: Atlas の統合知識層（長期記憶の 3 層目）の第 1 スライス
date: 2026-11-20
internal: 既定オフで利用者には見えない（Atlas が使う能力。利用者がオンにするまで何も保存・読み出ししない）
---

〈依頼〉 調査ノートは記録・文字列検索・比較しかなく、複数の調査から知識を抽出して後の仕事に使う仕組みが無かった。

- 追加: `js/atlas-knowledge-store.js`（規則）・`js/atlas-knowledge.js`（既定オフのスイッチと端末ストア）・`js/atlas-cap-knowledge.js`（`knowledge.remember/recall/forget/setting`）。仕様は `docs/architecture/05-ai.md` の「長期記憶は 3 層」。
- 判断（利用者に確認済み）: 既定オフ・設定で有効化／Atlas が明示的に呼ぶ（自動抽出しない）／端末のみ（アカウント同期は次）。
- 証拠 ID は呼び出し単位で、後のセッションでは意味が無い。そのため `verified` は URL かデータセット名で再確認できるときだけ受け付け、ID は追跡用に残す。
- 否定した見立て: ターンごとの自動抽出（誤保存が過去の回答を事実にする）。モデルによる矛盾・古さの判定をコードに持たせること（Atlas が supersedes / contradicts で述べる）。
- 検査: `tests/knowledge-layer-checks.test.mjs`。未了: アカウント同期（第 2 スイッチ付き）、世界グラフへの ref の実在照合、設定画面のスイッチ。
