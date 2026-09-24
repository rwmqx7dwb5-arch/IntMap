---
title: ラウンド番号を名前から外した——識別子は slug と PR 番号、記録は 1 エントリ 1 ファイル、段は差分で選び、ビルド印はビルドが書く
date: 2026-09-25
---

〈利用者承認済み「ラウンド番号を名前として使うのをやめる」「DEV-NOTES の 1 本ファイルをやめる」
「テストの段を触った範囲で選ぶ」——既存の記録は 1 行も失わないこと〉

この回自身が新しい規約の最初の記録である（`dev-notes/<日付>-<slug>.md`・番号なし）。

## 0. 測った

番号は 7 つの仕組みの「鍵」になっていて、どれも同じ形で壊れていた——**番号は走査で配られ、走査した
全員が同じ答えを得る**。

| 何が番号を鍵にしていたか | 実測 |
|---|---|
| `worktree.mjs new` の「空きラウンド番号」 | 最大＋1。push 前に誰かが同じ番号を取るので改番が定常（#R671 は 7 回、同時期の別セッション 4 回） |
| 検査ファイル名 `tests/r<N>-…` | #R674 の「番号＋主題」でも番号は動き、push 直前の取り直しが毎回要った |
| プレビューのポート | `4000 + N`——同じ番号の 2 セッションは同じポート |
| core tier の「その回の spec」 | `currentRoundSpec()` は `/^r(\d+)$/`。**#R674 以降の主題つき spec に 1 度も一致せず、r668 を答え続けた**——673 以降のどの回の spec も PR の前で走っていない |
| ビルド印 `INTMAP_BUILD` / `__imBuild` | 手で上げる。上げ忘れ: R171（#R172・#R173）・R205（R206 の配備）・R755（R756 の配備、見つけたのは本番検証）。印を「最新の `## R<N>`」に縛る検査が **24 本**あり、毎回どれかを編集していた |
| DEV-NOTES.md 先頭への挿入 | 並行する全員が同じ 1 行目に書くので必ず衝突 |
| `verified` の受領証・`status` の未了一覧 | 件名の `R(\d{2,4})` を読んでいた（人が打った番号） |

⚠⚠ **DEV-NOTES.md そのものが壊れていた。** 51,048 行・11.3 MB（CRLF の作業木）。本文 341 回分の間に、
**前書きと索引が 9 回積まれていた**——索引行 1,868 本のうち重複を除くと 381 本、約 5.9 MB が繰り返し。
先頭挿入の手順が題 `# IntMap — Developer / Context Notes` を目印にしており、**R494 の本文がその題を
引用していた**ので、そこに前書きと索引がまるごと差し込まれ、**R494 の本文は「…退避されていて
（#R156/#R463）、`」で切れて 2,086 行後に「 や `#` が markdown として…」で再開していた**。
題そのものも `#` を失っていた（` IntMap — Developer / Context Notes`）。発生元は R494 の commit 275c95e8。

⚠ **記憶の索引も黙って切れていた。** MEMORY.md は 203 行・約 21,400 文字で、ホストは
「203 lines (limit: 200) … 3 of 203 lines were cut off」と告げていた。`agent-memory --check` は
文字数（24.4KB）だけを測っていたので「天井の下」と答えていた。

## 1. 識別子は slug、PR を作ったら PR 番号

- `worktree.mjs new <slug>`: branch `feat/<slug>`・worktree `wt-<slug>`・プレビュー `intmap-preview-<slug>`。
  **取得は `git worktree add -b` そのもの**——同じマシンの worktree は ref の名前空間を共有するので、
  同じ slug の 2 つ目は git が拒む。そのうえで、branch（リモート含む）・worktree・
  `tests/<slug>-checks.test.mjs`・`tests/<slug>.spec.js`・`dev-notes/*-<slug>.md` が持っている slug と、
  **番号で始まる slug** を拒む（`scripts/round-names.mjs` の `slugProblem`。門と同じ定義）。
- ポートは 4400〜4999 のうち、原本と全 worktree の `launch.json` が名指しておらず、いま listen も
  されていない最小の番号（`PREVIEW_PORTS`）。テスト用サーバの 4174〜4373 とは重ならない（`check:docs`
  の `preview-port` がそれも測る）。
- `status` から「空きラウンド番号」を消した。`--brief` は `このセッション <slug>`。未了（本番未到達・
  本番検証）は件名の `(#N)` で述べ、無ければ短い sha。`verified` は `{sha, at, pr}` を記録し、
  残っていた `--round` は**拒む**（黙って別のものを記録しない）。「最新の記録」は下の `latestEntry()`。
- 命名の門（`check:static` の `round-name`）: **新しい `r<N>…` は主題つきでも拒む**。既存の 631 本は
  数と最大番号（808）の 2 つで下向きにだけ動く。⚠ **この回より前に開いた branch が `r809-…` を足すと、
  rebase 後にここで赤くなる**——直し方は slug に名前を変えることで、数を上げることではない。

## 2. 段は差分で選ぶ

`scripts/tiers.mjs` の `changedSpecs()`: **その変更が足した・変えた spec**（削除は除く）を、固定の core
（常時の 4 本＋価格 1 秒以下）に**足す**。出所は `IM_CHANGED_SPECS`（明示）→ `IM_DIFF_BASE`（diff の
基点。**計算できなければ throw**——「計算できなかった」を「変更なし」と答えない）→ ローカルでは
`origin/main...HEAD` ＋未コミット・未追跡。CI の core job は `IM_DIFF_BASE: HEAD^1`・`fetch-depth: 2`
（PR の checkout は merge commit で、第 1 親が base。main では 1 squash＝1 commit）。
⚠ **deep は縮まない**——deep は固定 core の補集合のままなので、触った spec は PR の前と今夜の両方で走る。
`-cesium` の spec を触った PR のために、core に cesium プールの 1 台を足した（`allow-empty`: 触って
いなければ planner は空を返し、action は playwright を呼ばずに飛ばす——引数なしの playwright は
全件を走らせるので、空のまま呼ばないことが要点）。

`test-budget.mjs` の core 天井は**固定部分**の予算になった（38 → 26 秒、r668 が抜けた分だけ床に
追従）。**差分部分には天井を持たせない**——PR が自分の spec を何本走らせてよいかの上限は、正しい
仕事を先に殺す（`.agents/rules/one-pass-or-a-reason.md` §3）。代わりに全 spec は TOTAL の天井に
計上され、高い spec は PR の前で 1 回走ったあと自然に nightly へ戻る。

tier の大きさを述べる文書（`docs/FILES.md`・`docs/TESTING.md`・`package.json`・`worktree.mjs`）と
`deep-alarm`・`r699` は `tierSpecs('core', { fixed: true })` を読む——枝ごとに変わる数を文書に書かない。

## 3. 記録は 1 エントリ 1 ファイル、DEV-NOTES.md は生成索引

`scripts/dev-notes.mjs`:
- `--split`（**再実行できる**）: 旧 1 本ファイルを `## R<N>` ごとに `dev-notes/R<N>.md` へ。
  **領域**（題の行から、次の `## R<N>` の前にある最後の索引行まで）を本文から切り出し、題が文の
  末尾に引用されている場合（R494）はその行を本文に残す。**書く前に、切った断片を順に連結すると
  入力に一致することを確かめ、一致しなければ何も書かない。** 領域の非空行は重複を畳んで
  `dev-notes/legacy-index.md` に 1 回ずつ（最初の出現順・段落の空行は保つ）。
  既存のファイル名は保つので、再実行は同じファイルを同じ中身で上書きするだけ。
  入力の sha256 と **git の blob id** を `legacy-manifest.json` に残す。
- `--write` / `--check`（`check:docs` の `dev-notes` 規則）: 新しい順の索引を生成し、食い違い・
  旧形式の `## R<N>` の混入・名前や front matter の誤りを落とす。PR 番号は、旧エントリは squash 件名
  から（`legacy-prs.json`）、新エントリは front matter の `pr`（分かれば）。
- `latestEntry()` / `entries()` / `entryText()` / `allNotesText()`: 「最新の記録」を訊いていた
  5 つの読み手（r175・r207・r219・r264・r301。綴りが全部違った——#R756 は `### R756` と書いて全員から
  見えなかった）と `worktree.mjs status` は、ビルド印の検査に置き換わったものを除き、ここから取る。

実測（分割）: 341 エントリ・書き込み 341・不変 0／領域行 2,613／索引行 1,868 → 重複除去 381／
`legacy-index.md` の非空行 466。blob `76cca617…`（= `git rev-parse HEAD:DEV-NOTES.md`）から再分割すると
341 ファイルが**バイト単位で一致**（`tests/process-without-round-numbers-checks.test.mjs` ③c）。
`DEV-NOTES.md` は 11.3 MB → 約 77 KB。`DEV-NOTES-ARCHIVE.md` は 1 バイトも触っていない。

⚠ 本文を切り分けたことで、`DEV-NOTES.md` を名指しで除外していた掃引（`check:docs` の母集合・
`tests/r274`・`tests/r762` の許可リスト）が `dev-notes/` を読み始めないよう、同じ理由で除外に足した。

## 4. ビルド印はビルドが書く

`scripts/build-stamp.mjs`（vite プラグイン、`vite build` と `vite` の両方）: ソースの
`__INTMAP_BUILD_STAMP__` を `<ビルドした commit の committer 時刻 UTC>Z-<短い sha>` に置き換える。
**ビルド機の時計ではない**——古い commit を建て直すと古いコードが最新を名乗るから。git が無ければ
`…Z-nogit` と言う。トークンが無い `index.html` はビルドを止める。

`index.html` の比較は印の**時刻**で行う（#R208 が文字列比較の誤りを示し、代わりに比べていた手打ちの
番号は、誰かが打ち続けている間だけ増えた）。旧形式の保存値 `YYYY-MM-DD-R<n>` は**どの生成印より古い**
（形式は一度だけ前へ変わった）。置換されていない頁は何も捨てない。

印を「最新の回」に縛っていた 24 本（r169・r175・r176・r196・r199〜r204・r207・r219・r231・r239〜r241・
r261・r262・r264・r275・r301・r175.spec・prod-smoke は据え置き）は、**守っていた欠陥**——「動かない印が
古いキャッシュを現行に見せる」「2 つの印が食い違う」——を、それが今も起こりうる 3 つの形で測る
`tests/helpers/build-stamp.mjs` を呼ぶ形に書き直した: ①印がソースに打たれ直す ②2 つの大域に違う値が
入る ③ビルドが埋めなくなる（プラグインが vite の設定に居ない・この checkout の印でない・時刻が読めない）。
**値の綴りを固定する検査は 1 本も足していない。**

## 5. 記憶の索引の行数

`scripts/agent-memory.mjs` に `INDEX_CEILING_LINES = 200`（ホスト自身の警告が述べる数。観測・失効条件・
正本をその場に書いた）。`--check` は文字数と行数を両方述べ、どちらかを超えたら ⚠。実測の索引は
**203 / 200 行で「3 行の超過」**と出る（索引そのものはリポジトリの外なのでこの回では詰めていない）。

## 6. 指示文書

`AGENTS.md` は 32,513 → 30,247 バイト（CRLF 最悪値。天井 32,768 まで余白 2,521）。規則は 1 つも
消していない——実測と経緯だけを正本へ移した:
§1 memory 命名の実例 → `.agents/skills/intmap-round/` §4／§5.1 待ちの実測 → 同 §5／
§6 「なぜ原本を作業場にしないか」「15 コミット遅れ」「汚れの扱いの経緯」「テスト用サーバの共有の実測」
→ `docs/AGENT-SETUP.md` §11（新設）／§11.2 `pwsh` の実測 → `docs/AGENT-SETUP.md` §10。
`CLAUDE.md`・`SKILL.md`（§0・§1・§3 記録の書き方・§4 名前の規約・§5）・`execution-strategy.md`
（6,138 → 5,997 バイト）・rules 3 本・`docs/README.md`・`docs/TESTING.md`・`docs/FILES.md`・
`Architecture.md` を新しい設計に合わせた。

## 7. 検査

`tests/process-without-round-numbers-checks.test.mjs`（9 本、どれも元の欠陥で書いた）:
①同じ slug を 2 セッションが得られない・別 slug は別ポート ②触った高い spec が tiers・planner・
playwright.config・ci.yml の全部を通って core に入る ②b 計算できない diff は throw／履歴があれば実際の
diff で見える ③分割がバイト単位で本文を保ち索引行を 1 回ずつ残す ③b 索引が生成物と一致し各エントリを
1 回だけ載せる ③c 元の blob があれば全 341 本をバイト比較 ④203 行の索引は超過 ⑤ index.html の
比較器を vm で走らせる（古い写し→再読み込み・旧形式→置換・未置換→何もしない・ES5 と `stampTime` が一致）
⑤b 印はビルドが書く。
書き直した既存の検査: r203・r204・r205（段）、r195 ⑦（計画の分割は差分なしで測る）、r674（命名）、
r295 ⑦（識別子）、r338 ③、r403（preview-port の変異）、r703（⑦⑧を追加）、r217・r219・r280・r301・
r376・r390・r505（記録の読み方）、r274・r762（除外）、r699（固定 core）、stamp の 21 本と r175.spec。

## 8. 残したもの

- `CONSTITUTION.md` §6（159〜162 行）がまだ「`DEV-NOTES.md` … 直近ラウンドだけ・新しい順」と述べている。
  この回の触ってよい範囲の外なので書き換えていない（提案）。
- ルートの `_resolve.mjs` は R564 の使い捨ての残骸（撤去を提案。消していない）。
- MEMORY.md の 3 行超過はリポジトリの外。索引を 200 行以内に詰めるのは別の作業。
