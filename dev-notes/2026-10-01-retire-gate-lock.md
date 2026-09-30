---
title: tree lock（tests/helpers/gate-lock.mjs）を撤去した——変異検査が私有の写しへ移って利用者は錠自身の検査 1 本だけになり、その検査は並行負荷の下で約 2.7% 揺れていた。前提の判定は「錠が破れていないか」から「ゲートの走行中に木が変わったか」へ移し、同時実行の安全は tree-writer 規則が守る
date: 2026-10-01
---

〈依頼〉 変異検査を作業ツリーの外へ移した回（`dev-notes/2026-09-30-mutation-tests-off-tree.md`）で要らなくなった tree lock を撤去する。**利用者承認済み（2026-10-01）**——前回は「削除は依頼の外」として残していた（同記録 §4）。

## 0. 測った（撤去の前）

- **全数調査**（`withTreeLock` / `lockIntact` / `gate-lock` を `tests/` `scripts/` `docs/` `.agents/` `.github/` から）: 錠を**取る**ファイルは `tests/gate-lock-checks.test.mjs` の 1 本だけ。`lockIntact()` を**読む**のは `tests/helpers/gate-precondition.mjs` の `runGate` だけで、それも `{ tree }`（私有の写し）を渡されない呼び出しに限られ、実在の呼び出し 4 本（doc-facts-legal-pages・process-doc-facts-edge-counts・process-doc-facts-instruction-docs・process-round-naming）は全部写しを渡していた。残りは経緯を述べるコメントと文書だけ。
- `tests/gate-lock-checks.test.mjs` R623 ① は、錠を奪い合わせる圧力試験で、並行負荷の下で約 2.7% の持ち替えで破れる既知の揺らぎ（#R623）。守る相手（木へ書く検査）はもう居ない。
- `.github/checks-cost.json` の同ファイルは **370.8 秒**（2026-09-29 の台帳・錠の待ち込み）。#834 後の最初の main の CI（run 36701163712, 78982c26）では **12.7 秒**だった。

## 1. 撤去したもの

- `tests/helpers/gate-lock.mjs`（`withTreeLock` / `lockIntact` / `lockPaths`）
- `tests/gate-lock-checks.test.mjs`（R623 ①〜④ は錠そのものの検査で、錠と一緒に意味を失う）
- `tests/mutation-tests-off-tree-checks.test.mjs` ⑥ の後半（「錠を取るのは錠を主題にするファイルだけ」の発見）——錠が無いので空の主張になる。前半（`check:static` が木へ書く検査で赤くなる）はそのまま。

## 2. 置き換えたもの——前提の判定を弱くしない

`lockIntact()` が `runGate` の中で証言していたのは「ゲートが読んでいた間、他の誰も木を書いていない」。その問いへの答えを、錠なしで**より正確に**言える形へ移した（`tests/helpers/gate-precondition.mjs`）:

- **私有の写し**（`runGate(gate, { tree })`）: 従来どおり。誰も書けないので、綺麗なら「ゲート自身の問題」、汚れていれば「未コミットの変更を読んでいる」。
- **共有の木**（`runGate(gate)`）: 証人は git だけになる。git に**答えられる問い**を訊く——ゲートの前と後の `git status --porcelain` が**違えば**、走行中に誰かが書いた＝**ゲートのせいとは決して言わない**（新しい分岐）。同じなら、それを証明とは呼ばず、「中で書いて戻す書き手は 2 回の標本からは見えない」と**見えない場合を名指し**、写しで訊くよう述べる（従来の「錠の外」分岐の意味を保つ）。
- 標本は `runGate` の中で採り、`explain()` は採ったものを描くだけ（#R623 ⑥ の契約を保つ）。

新しい検査 `tests/gate-precondition-checks.test.mjs`（旧 R623 ⑤⑥ の判定側を移したもの）:

- ① 判定は保証できない木についてゲートを責めず、見えない場合を名指す
- ② 走行中に変わった共有の木は「書き手」と報告され、ゲートのせいにならない
- ③ 標本は印字時でなく走行中に採られる——**評価で**: 現物の helper を temp の git リポジトリへ写し（ROOT は自身の位置から導かれる）、ゲートの中でファイルを書き、判定を読む前に消す。判定は「変わった」と言い、2 回目の `explain()` も同じ文を返す。

## 3. 錠が無くても同時実行が安全であることの実測

「作業ツリーに書かない」は #834 の `tree-writer` 規則（`check:static`）が守る。撤去後、この worktree で **2 組の `node --test` を同時に起動**した（2026-10-01、このマシン）:

- A: mutation-tests-off-tree・doc-facts-legal-pages・process-doc-facts-instruction-docs・gate-precondition（28 件）
- B: process-doc-facts-edge-counts・process-round-naming・chronos-claims・process-doc-facts-histb-count（36 件）

結果: **A 28/28・B 36/36 緑**（A 364 秒・B 166 秒、全区間で重なって走った）。前後で `git status --porcelain` は同一、変更・未追跡ファイルの sha1 も同一。

⚠ 否定した 1 回目: 同じ組み合わせが A 7 件・B 2 件赤。原因は並行性ではなく 2 つ——⑴ `docs/TESTING.md` に書いた `tests/helpers/gate-lock.mjs` の行が `named-path` 規則に「無いファイルを名指している」と取られ、`check:docs` が木の上で赤（変異検査の前提がそれを正しく報告した）。同じ行に「now removed」を足して解消（規則は行の中の「消えた」語を見る）。⑵ 削除を index に載せていなかったので、`git ls-files` がチェックアウトでは消したファイルを数え、写しは数えなかった（mutation-tests-off-tree ①）。削除を index に載せて解消——commit 後の木には起きない。

## 4. 文書と台帳

- `docs/TESTING.md`: 錠の節を「撤去した事実・何が代わりに守るか・錠が残した教訓（node_modules の junction 共有・読めない stamp は死ではない・生存は pid・Windows の EPERM・診断の標本の時刻）」へ書き直した。
- `.github/checks-cost.json`: run 36701163712 の `checks-timings-1..3` を `node scripts/checks-shards.mjs --update` で取り込み（錠の待ちを含まない最初の実測）、`tests/gate-lock-checks.test.mjs` の行を消した。新しい `tests/gate-precondition-checks.test.mjs` は次の CI の計測まで中央値で見積もられる。
- `.agents/skills/intmap-round/SKILL.md`: 環境要因の例から「tree lock の枠切れ」を外した（`node scripts/agent-sync.mjs --write` で写しも）。
- コメントの参照（ci.yml・checks-shards・doc-facts・tree-writers・scratch-tree・4 本の検査）は、錠が撤去されたことを述べる形へ。`Architecture.md`・`AGENTS.md` に言及は無かった。
