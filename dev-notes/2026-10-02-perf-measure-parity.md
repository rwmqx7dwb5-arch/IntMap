---
title: check:perf が手元で緑・CI で赤になっていた原因を測り分けた——eager の差は改行ではなく「CI は main と merge した木を測る」だった。手元の計測が CI と違う木なら言い、--update は書かない。改行は dist/ の写しに効いていたので checkout を常に LF に。台帳の数の行は合算で merge し、merge driver はどの経路でも登録されたことを読み返す
date: 2026-10-02
---

〈依頼〉2026-10-01〜02 の 5 本の PR で、`check:perf` の eager.brotli（ときに gzip・async）がこの Windows
マシン（`core.autocrlf=true`）では天井の内側なのに CI では帯を超えて赤になり、PR ごとに CI の値で天井を
手で上げ直した（例: 手元 1135.3 vs CI 1147.3 kB）。逆向き（手元のほうが大きい）も別の行で起きた。
原因を実測で確定し、手元の計測が CI と同じバイトを測るようにする。途中で追加: ① #886 と #887 が
それぞれ eager.modules を 299→300 に上げ、両方着地して main が 301 > 300 で赤 ② `git stash` は全
worktree で共有される ③ #884 の merge driver が clone の config に登録されていなかった。

## 0. 測った——改行は eager/async の原因ではない

同じ commit（`9e0662a9`）を 3 通りに build して `perf-budget.mjs --report` を比べた。

| 比べたもの | eager raw / gzip / brotli | async | dist.total | dist.data |
|---|---|---|---|---|
| CRLF の worktree − LF（`git -c core.autocrlf=false archive`） | 0 / 0 / 0 | 0 | **+121,742 B** | **+85,104 B** |
| CRLF の worktree − CI（main の run `36954330795` の `perf-measured`） | 0 / 0 / 0 | 0 | +121,736 B | +85,104 B |

- **bundler の出力（eager・async）はどちらの checkout からでも 1 バイトも違わない**。`dist/assets/*.js`
  に復帰文字は 0 個（rolldown が落とす）。圧縮器（node 24.18・zlib 1.3.1・brotli 1.2.0）の差でもない
  ——手元の数が CI の数に一致した。
- **改行が効いていたのは `dist/` の写し**だった。`copyStatic` と `data/` は checkout のバイトをそのまま
  `dist/` に置くので、CRLF の checkout は配信されない 121,742 バイトを数えていた（93 ファイル）。
- ⚠ 依頼の見立て（「CRLF の作業ツリーから build した資産に CR が入る」）は **eager/async については否定**、
  dist の行については肯定。

## 1. 測った——eager の差は「どの木を build したか」

CI のログの `HEAD is now at` は毎回 `Merge <head> into <main のその時点>` ＝ `refs/pull/N/merge` を
build している。手元は branch を build する。#872（installable-app）の run `36894886708` で再現した:

| build した木 | raw | gzip | brotli |
|---|---|---|---|
| branch の head `22df7e01`（手元が測るもの） | 4576.1 kB | 1503.6 kB | 1134.3 kB |
| `git merge-tree 22df7e01 2bacd112`（CI が測ったもの・main が 1 commit 先） | **4580.1 kB** | **1505.1 kB** | **1135.5 kB** |
| CI のログ | 4580.1 kB | 1505.1 kB | 1135.5 kB |

**CI の数に 3 行とも一致**。`--update` は手元の実測で超えた行しか上げないので、branch の増分だけを
受け入れ、merge で増えた分（main に先に着地した並行 PR の分）は CI で初めて出る。逆向きは main が
減らした行（`locale-on-demand` で locale が起動から外れた等）。

## 2. 直した——手元の計測が「CI と違う木」なら言い、--update は書かない（`scripts/perf-budget.mjs`）

- `builtFrom(dist)` が `dist/index.html` の build stamp（`scripts/build-stamp.mjs` の `STAMP_RE`）から
  build した commit を読み、`treeState()` が git に `HEAD` と `origin/main` を訊く。
  `parityProblems()` は ⑴ stamp が無い ⑵ build 後に HEAD が動いた（rebase 後の再 build 忘れ）
  ⑶ origin/main に branch が持たない commit がある ⑷ origin/main が無い、を述べる。CI では空（CI が基準）。
- `check:perf` は判定の下に `⚠ not the tree CI measures: …` を出す（判定は変えない——main が動いたのは
  この PR の退行ではない）。**`--update` は `git fetch origin main` してから、ずれがあれば書かずに exit 1**。
  ⚠ 限界: fetch の時点まで。CI が走る前に main が動けば同じことが起きる（必須チェックは strict ではない）。

## 3. 直した——checkout は常にリポジトリのバイト（`.gitattributes` の `* text=auto eol=lf`）

選んだ理由と測った副作用:
- `text=auto` は `core.autocrlf=true` が今使っている判定と同じ（NUL・孤立 CR は binary・CRLF で commit
  されたファイルはそのまま）。違うのは checkout の改行だけ（CRLF→LF）。属性は `core.autocrlf` より強いので
  **マシンごとの設定が要らない**（`worktree.mjs` で `core.autocrlf=false` を配る案は、config が clone 共有で
  原本にも効き、新しい worktree にしか効かないので採らなかった）。
- 実測: `git -c core.autocrlf=true archive --worktree-attributes HEAD` が blob と **全ファイルで一致**
  （変更前は 1,495 ファイルが違った）。index に CRLF で入っている 10 ファイル（`js/community.js`・
  `js/news-feed.js`・`js/locales/pages.*.js`）は text=auto の規則どおりそのまま——CI も同じバイト。
- 既存の CRLF の作業ツリー: 属性を変えても `git status` は clean（touch しても同じ・実測）。git が書き直すまで CRLF。
- `scripts/backup-usb.ps1` は LF になる。PowerShell 5.1 の `Parser.ParseFile` でエラー 0（実測）。
- `check:agents` の `doc-size` は最悪値（`crlfBytes`）のままでよい——古い checkout は CRLF を持ち続ける。

## 4. 直した——台帳の数の行は合算で merge する（#886 + #887）

`tests/perf-baseline.json` は `intmap-clash=upstream`（量）で、`requests`/`modules` も main の値を取っていた。
しかも両側が同じ 300 に動かすと driver は「一致」として 300 を返した。
- `.gitattributes` に `intmap-clash-by=scripts/perf-budget.mjs`。driver はその書き手の `mergeClash(keys)` に
  行ごとに訊く（数の一覧を driver に写さない——`COUNTS` が唯一の正本）。
- `sum` の数は **base から両側が動いたら、同じ値でも 2 つの移動として足す**（299→300 ＋ 299→300 ＝ 301）。
  ⚠ これは `intmap-clash=sum` の他の台帳（ratchet ledgers）にも効く挙動の変更。同じ違反を 2 本の PR が
  両方とも直した場合は過小になり得る（その場合は門が赤くなって人に回る）。
- ⚠ **GitHub の squash は driver を使わない**。同じ `299 → 300` の 2 本は GitHub 上では 1 つの変更として
  merge され 300 になる。合算されるのは手元で `git rebase origin/main` した branch だけ。#886/#887 の形を
  完全に防ぐには、後から着地する PR が rebase されてから CI を通る必要がある（strict な必須チェック）——
  これは設定の判断なので今回はしていない。

## 5. 直した——merge driver はどの経路でも登録され、読み返せなければ赤

`master-sync.mjs --sync` は fast-forward が**成功した最後の行**でしか登録していなかった（branch 違い・
ff 拒否・`--check` では登録しない）。一時 clone で「既に最新の `--sync`」を走らせると登録されたので、
利用者の環境で登録されなかった経路は特定できていない（候補: 原本が #884 より前だった間に走った
`--sync` は**同期前の古いスクリプト**で動く——`master-sync-follow-through` と同じ形）。直したこと:
- `master-sync.mjs` は**どのモードでも、終了し得るどの行より前に**登録し、`--sync` の後は原本自身の
  新しい `merge-driver.mjs --install` でもう一度登録する（deps-fresh と同じ follow-through）。
- `install()` は書いた後に `git config --get` で**読み返す**。より強い scope（`extensions.worktreeConfig` が
  このマシンでは `true`）が別の値を持てば `ok:false`。`blocking()` に入るので `--check` と `--sync` が赤。

## 6. 記録——`git stash` は全 worktree で共有

`refs/stash` は clone に 1 本。clean な木で stash→pop すると別セッションの stash を pop する（2026-10-02
実測・中身は失われなかった）。`docs/AGENT-SETUP.md` §11 に足した。skill に stash の手順は無かった。

## 7. 検査

`tests/perf-measure-parity-checks.test.mjs`:
① `core.autocrlf=true` の clone が出荷する全種類のテキストで blob と同じバイト（宣言を抜くと CR が入る）
② 同じ commit を CRLF 設定と LF の clone から**実際に vite build**し、実物の build-report plugin と
`measureFrom()` の数・`dist/` の全バイトが一致（宣言を抜くと dist.total・dist.data・eager.raw が増える）
③ `parityProblems` の各ずれと、一時リポジトリでの `treeState`（main が 1 commit 先→ rebase → 古い stamp → 再 build で空）
④ `mergeJson` と**実際の `git rebase`** で、数の行は +1 ＋ +1 ＝ +2、gzip は main の値。
`tests/generated-file-merge-driver-checks.test.mjs` ⑨: 一時 clone で `--sync`（何もしない）・`--check`・
拒否された `--sync`・`status --brief` の全経路で登録され、強い scope が別の値なら `install()` と `--check`
が赤。変異: `master-sync.mjs` を HEAD の版に戻すと ⑨ が赤（`--check registers it`）。

## 残っていること

- コードのコメントで「`*.md` は `core.autocrlf` 任せ」と述べている箇所（`scripts/agent-sync.mjs`・
  `scripts/eol.mjs`・tests のいくつか）は今回の触ってよい範囲の外で、直していない。古い checkout については
  今も正しいが、現在形としては古い。
- 利用者の環境で driver が未登録になった経路そのものは再現できていない（§5）。
