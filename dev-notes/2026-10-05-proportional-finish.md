---
title: 実装後の完了工程を変更の大きさに比例させた——全件テストは PR の CI だけ、帳簿のずれは npm run regen、赤い auto-merge 待ちは status が名指す
date: 2026-10-05
internal: 開発の手順と道具の変更で、サイトを使う人に見える挙動は変わらない
---

〈依頼〉「実装が終わってから全部完了するまでの流れが厳しすぎて時間がかかりすぎていないか」への
回答として挙げた 3 点（ローカル全件・小さな変更の文書負担・帳簿で落ちる門）を直す。

## 0. 測った

- ローカルの `npm test` は約 10 分。CI は同じ 34 門（`ci-gates.mjs --planned` と `test-parallel.mjs
  --planned` が一致・`CI_ONLY` は空）を 3 台で走らせ、auto-merge は緑でしか merge しない。
  ⇒ push 前のローカル全件は、CI がやることの複製だった。さらにこのマシンでは負荷で退行でない赤が
  出る（memory: gate-lock の待ち行列）。
- 帳簿のずれで落ちる門の全数調査: 生成物 8 本の生成器と、締め付け（ratchet）台帳 11 本。
  再生成の入口は門ごとに別々で、全部を 1 回で走らせる入口は無かった。
- 生成器と台帳 writer を直列に走らせると 2 分 13 秒（うち `global-surface.mjs --update` が 53 秒）。
  並列で 25 秒。
- `dev-notes.mjs --check` は本文の長さも節も要求していない。重さは手順書の「既存と同じ詳しさで」
  と「実装を変えたら仕様章」という書き方から来ていた。

## 1. 全件テストは PR の CI だけ（AGENTS.md §4・execution-strategy.md §4 の段 3）

ローカルでは段 0〜2（触った検査・主題の門・該当 spec）まで。CI が赤なら落ちた門だけを単独で再現する。
⚠ 先送りには読み手が要る: 会話が終われば、auto-merge 待ちのまま赤い PR は誰にも気づかれない。
`worktree.mjs status` が `gh pr list` から **auto-merge が付いて CI が赤い PR** を PR 番号と落ちた
check の名前で述べ、`--brief`（起動時の hook）にも未了として 1 項目出す。auto-merge の無い PR
（bot の更新・意図的な保留）は名指さない。初回の実行で別セッションの #1010 が引っかかった。

## 2. `npm run regen`（scripts/regen.mjs）

宣言は `.gitattributes` の 1 か所（merge driver と共有。一覧をコードに持たない）:
- `intmap-regen` の生成器を全部走らせる（`!` は build・ブラウザ・ネットワークが要るので印字だけ）。
- 新しい属性 `intmap-tighten=<writer>` を持つ台帳は writer を走らせ、**全部の動きが締める方向**
  （数が減る・配列の要素が順序を保って消える・キーが消える）のときだけ残す。それ以外は元のバイトに
  戻して名指す。merge driver が台帳を作り直さない理由（`--update` は木にあるものを何でも受け入れる）
  と同じ問いなので、緩む方向は人の判断に残した。
- **否定された見立て:** 最初は台帳の全欄を「下がるだけ」で測った。clean な main で
  `output-taint` の `sinks` 680→714、`data-effects` の `reaching` 39→75 が「緩む」と判定されたが、
  どちらも門が読まない参考値で、両方の門は緑だった。⇒ `intmap-tighten-info=<key>` で書き手が
  参考値の欄を宣言し、その欄はどちらへ動いてもよいことにした。i18n の被覆の床（安全な方向が上）と
  実測値（durations・perf）は宣言せず、触らない。
- `worktree.mjs` は import しただけで status を印字していたので、入口をコマンド起動のときだけに包んだ。

## 3. 文書は変更の大きさに比例（AGENTS.md §9・intmap-round §3）

- 仕様章を直すのは**現状仕様（挙動・構成・データ）が変わったとき**。仕様どおりに戻すだけの修正・
  内部の整理・テストの追加では触らない。
- dev-notes は小さな変更なら front matter と本文 3〜5 行（何が起きていた／何を直した／どう確かめた）。
  節は調べたことがあるときだけ立てる。

## 4. 検査

`tests/proportional-finish-checks.test.mjs`: ① 締める方向だけが通る（数・配列・キー・文・型・並び替え・
参考値の欄） ② 一時ディレクトリで下げる writer は残り、上げる writer はバイト単位で戻る・`!` は走らない
③ `intmap-tighten` の writer が実在し json 台帳に付き、`intmap-tighten-info` の欄が台帳に在る
④ 赤い auto-merge 待ちだけが名指される。
