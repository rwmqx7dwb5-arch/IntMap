---
title: 生成物・台帳・件数の衝突を git の merge driver に解かせる——perf-baseline・global-surface・durations・能力の生成行・cassette・TOTAL_BUDGET_S・plan(N)・文書の件数。宣言は .gitattributes の 1 か所で、自分を生成物・台帳と名乗るファイルは発見して漏れを落とす。生成器は merge の後に --finish が走らせる（driver の実行中、作業ツリーは merge 後の木ではないため）
date: 2026-10-02
---

〈依頼〉利用者は全面委任（「構造改革とイノベーション。保守ではなく改革」）。2026-10-01 に 15 本の PR を並行で
着地させたとき、1 本 merge されるたびに残りが DIRTY になり、衝突のほぼ全部が**生成物・台帳・件数**だった
（`tests/perf-baseline.json` は毎回・`tests/global-surface-baseline.json`・`js/atlas-capabilities.js` の生成部分・
`scripts/atlas-eval/cassettes/*.json`・`tests/durations.json` と `TOTAL_BUDGET_S`・文書の件数・`plan(N)` と表の一覧）。
解き方は毎回同じ機械的手順で、人が 30 回以上手で繰り返した。

## 0. 測った——git が driver をどう呼ぶか（git 2.54.0.windows.1・一時リポジトリ）

- **driver が走る間、作業ツリーは merge 後の木ではない。** main だけが変えた `other.txt` を driver の中から
  読むと、branch 側の中身だった（merge-ort はメモリ上で合わせ、最後に木を書く）。⇒ **driver の中で生成器を
  走らせると、入力を取り違える。** 生成器は記録して、merge の後に `--finish` が走らせる設計にした。
- **どちらが main か**: `git merge main` では %A＝branch・%B＝main。`git rebase main` では %A＝main・%B＝branch。
  rebase の最中は `rev-parse --git-path rebase-merge` が在る。
- **driver の cwd は worktree の最上位**、`%P` はリポジトリ相対のパス。
- **config は clone の全 worktree が共有する**（`git worktree add` した側で `config --get` が同じ値を返す）。
  ⇒ 1 回の登録がこのマシンの全セッションに効く。
- **driver が起動できないと、git はファイルを片側のまま・マーカー無しで残す**（merge なら branch 側、rebase なら
  main 側）。⇒ 登録するコマンド自身を `test -f scripts/merge-driver.mjs && exec node … || exec git merge-file …`
  にした。script の無い checkout でも普通の衝突マーカーが残る。
- **属性はチェックアウト中の `.gitattributes` から読まれる。** 宣言を持たない古い branch に `git merge main`
  すると driver は呼ばれず、`git rebase main` なら main 側の宣言が効く。
- 追跡された台帳 13 本は全部、`JSON.stringify(値, null, ファイル自身の字下げ) + '\n'` と 1 バイトも違わない
  （blob で測定。このマシンの作業ツリーは autocrlf で CRLF）。⇒ driver が書いた台帳は書き手が書くものと同じ形。

## 1. 作ったもの

- **`scripts/merge-driver.mjs`** — 3 種類:
  - `json`（台帳）: キーと要素で 3-way。両側が動かした数は `intmap-clash` で決める——`sum`＝両方の移動を足す
    （ratchet の件数）、`upstream`＝main の値（測定値: durations・起動サイズ）。名前の配列は集合として合わせ、並びを保つ。
    ⚠ **台帳は再生成しない。** `--update` は木が持つものを何でも受け入れる——それは ratchet が問うている当のこと。
  - `regen`（入力の関数）: `GENERATED … BEGIN/END` の中の衝突は main 側を取り、`intmap-regen` を保留に記録。
    領域の外の衝突は人が書いたコードなので、マーカーのまま返す。領域の無いファイルは main の版を丸ごと取る。
  - `tokens`（件数を述べる手書きの文）: 衝突した塊をトークン単位で 3-way し直す。両側が動かした整数は
    base＋両方の移動（件数に読めるときだけ——日付・版・`#PR`・百分率・時刻・先頭ゼロ・負の結果は拒む）、
    同じ場所への挿入は両方（main を先に、同じ行は 1 回）。JS は `node --check` が通らなければ解いたことにしない。
  - 解けないものは**常に**普通の衝突マーカーと非ゼロ終了。推測で埋めない。
- **宣言は `.gitattributes` の 1 か所。** git がパスの一覧をそこに要求するので、種類と再生成コマンドも同じ行に置いた
  （2 つ目の一覧を作らない）。⚠ **漏れは発見で落とす**: 自分を生成物・台帳と名乗るファイル（`GENERATED`／`生成物`
  の見出しが script を名指す・`GENERATED … BEGIN` の領域・`"//"`／`"_"` が書き手を名指す JSON）を検査が探し、
  宣言が無い・別の script を名指していれば赤。測定の台帳（perf・durations）・cassette・件数の文書のように
  自分で名乗らないものは、2026-10-01 の実測で衝突したものとして明示した。
- **登録**: `worktree.mjs status`（両製品の SessionStart hook）・`worktree.mjs new`・`master-sync.mjs --sync` が
  `install()` を冪等に呼ぶ。`status` は保留中の再生成も言う。CI は merge をしないので登録は要らない。
- **手順**: `.agents/skills/intmap-round/` §5 を「DIRTY なら `git rebase origin/main` → `--finish` → commit →
  `push --force-with-lease`。残った衝突は本物」に置き換えた。仕組みは `docs/AGENT-SETUP.md` §12。

## 2. 「衝突しない形」に作り替えなかったもの（と理由）

- **`tests/durations.json` を並べ替えて先頭追記をやめる** — 依頼の例だったが、この作業の触ってよい範囲の外で、
  かつ driver が順序に依らず解く（両側の先頭追記は ② で解ける）。並べ替えは書き手（`shard-plan.mjs`）の側で
  やらないと次の追記で戻る。
- **文書の件数を 1 か所の生成物の参照にする** — `doc-facts.mjs` は「文書が数を述べ、それを実体と照合する」設計で、
  参照に置き換えると読者が開いた文書に数が無くなる。件数は `tokens` が足し合わせ、`check:docs` が実数で照合する。
- **`TOTAL_BUDGET_S` を合算可能な形にする** — 天井は意図的に 1 つの数（下向きの ratchet）。`tokens` が両方の移動を
  足し、註も両方残す。
- **他の生成物の宣言を生成器自身に持たせる**（`atlas-caps.mjs` の `GENERATED_FILES` のように）— 理想はそれだが、
  生成器はこの作業の範囲外で、並行セッション（atlas-capability-single-source・layer-packages）が触っている。

## 3. 検査

`tests/generated-file-merge-driver-checks.test.mjs`（9 本）。一時リポジトリで実際に 2 本の branch を merge／rebase
して確かめる。④ は**本物の** `scripts/atlas-caps.mjs` を、2 本が能力を 1 つずつ足した後の merge 後の入力で走らせ、
`--check` が一致を認めるところまで。このリポジトリの config には一度も触れない（検査の前後で `merge.intmap-generated`
は未登録のまま、と確認した）。

## 4. 残り

- **GitHub 側の merge（DIRTY 判定・Update branch ボタン）は driver を使わない。** 解くのは手元の rebase。DIRTY に
  なった PR を自動で rebase する bot は、`GITHUB_TOKEN` の push が CI を起こさない（`perf-ceiling.yml` の註）ので、
  別の資格情報が要る——作らなかった。
- 自分で名乗らない生成物（`js/locales/ui.zh-hans.js` など、見出しに script を名指さないもの）は発見に掛からない。
  名乗らせるのが筋で、それは各生成器の側の変更。
