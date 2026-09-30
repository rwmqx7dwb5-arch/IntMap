---
title: 変異検査が作業ツリーを書き換えていたのが全件実行の不安定の根本だった——検査は私有の写しを壊し、ゲートはその写しから走らせる。check:static の tree-writer 規則が、検査からチェックアウトへの書き込みを構文木で拒む
date: 2026-09-30
---

〈依頼〉 「検査が作業ツリー（js/・docs/・Architecture.md 等）を書き換えて戻す『変異検査』が、全件実行の不安定の根本」。作業ツリーを書き換えない形へ移し、要らなくなった tree lock を外し、同じ形が戻らない門を足す。

## 0. 測った

同日の `npm test`（別 branch）で 10 件が赤。どれも製品の欠陥ではない:

- 6 件は tree lock（`tests/helpers/gate-lock.mjs`）の 600／900 秒待ちの切れ。
- 1 件は R623 ① の排他違反（#R623 が測った持ち替え 2.7% の破れ）。
- 3 件は `tests/chronos-claims-checks.test.mjs` が gate 1 回の間だけ `js/` に置く probe 2 本を、錠を取らない読み手が踏んだもの——hazard-other-build-and-gate R236（`js/` を数えて 331）・hazard-other-i18n-shape-audit R241 ①・hazard-radiation-layer #R585 ④（ENOENT）。

**全数発見**（`scripts/tree-writers.mjs` を変更前の HEAD の `tests/` 全体に当てた結果）: チェックアウトへ書く検査は **13 ファイル・59 呼び出し**で、他はゼロ。`withTreeLock` の利用者は 17 ファイル（うち 4 つは書かず、錠を取って**読む**だけ——書き手がいたから読み手も錠が要った）。

## 1. 原因

錠は**書き手どうし**を直列にするだけで、錠を取らない読み手からは変異が見える。読み手全員に錠を取らせれば全件が 1 本の行列になり（6 件の待ち切れがそれ）、錠そのものも負荷下で破れる。欠陥は錠ではなく、**書く検査と読む検査が 1 つの木を共有していること**だった。

## 2. 直した

- **`tests/helpers/scratch-tree.mjs`**: チェックアウトの私有の写し。作業ツリーのファイル（`ls-files --cached --others --exclude-standard`）をハードリンクで並べ（ここで 1〜6 秒・コピーだと 389 MB で約 8 秒）、自前の `.git` の index はこのチェックアウトの index、objects は `alternates` で読むだけ、HEAD／origin/main は同じ commit。`node_modules` と `data-assets.json` の外部データはリンク。gitignored なもの（dist/・.perf/）は入らない。
- **root の注入口は要らなかった。** `scripts/` のゲートはどれも ROOT を自分の位置（`import.meta.url`）から導くので、`node <写し>/scripts/x.mjs` は写しを上から下まで読む。ゲートは 1 本も変えていない。
- ⚠ **ハードリンクは in-place の書き込みで実物を書く。** 写しの変更は `write/remove/rename/mutate` だけが行い、どれも名前を先に unlink する。`mutate()` はバイト・不在・作ったディレクトリまで戻す（throw でも async でも）。
- ⚠ **片付けはリンクを辿らない。** リンクは作る前に `.git/scratch-links` に書き、消すときは先にリンクだけ外す（[[intmap-cleanup-through-junctions]]）。持ち主の pid が死んだ写しは次の構築が掃く。
- 13 ファイルを写しへ移した: chronos-claims・doc-facts-legal-pages・hazard-volcano-doc-facts・history-fidelity・process-doc-facts-{claims,deep-tier-when,edge-counts,histb-count,instruction-docs,sweep}・process-round-naming・process-standing-rules・process-test-tiers-and-shards。前提（ゲートが緑）も同じ写しで訊く。`tests/helpers/gate-precondition.mjs` は `runGate(gate, { tree })` で「私有の写し＝錠なしで判定できる」と述べる。
- 読むだけで錠を取っていた 3 ファイル（process-agent-context・layer-test-gates-and-docs、未使用 import の process-worktree-status）から錠を外した。
- ⚠ 否定した見立て: 最初は写しを `T` と名づけ、deep-tier-when の中の `const T = 'docs/TESTING.md'` に隠されて `T.path is not a function`。全ファイル `SCRATCH` にした。
- ⚠ history-fidelity ④ は**錠すら取らずに** `data/hist-admin3.js` を書いていた（変更前の走査で初めて見えた）。写しでは前提（ゲートが緑）も足した——写しが何かを欠いていて赤、を変異の赤と取り違えないため。

## 3. 門

`npm run check:static` の **`tree-writer`** 規則（`scripts/tree-writers.mjs`・新しい `check:*` は作っていない）。`tests/` の fs 書き込み呼び出しの書き先を、変数はスコープで、局所ヘルパは返り値と「引数を書くか」で追い、`import.meta`・`__dirname`・`process.cwd()`・相対リテラル由来（チェックアウト）と `scratchTree()` 由来（ハードリンク）を拒み、`tmpdir()`・`mkdtemp`・`$TMPDIR` 由来は通す。台帳は置いていない——今日ゼロなので、例外を持たない規則にした。

## 4. 残したもの・外さなかったもの

- `tests/helpers/gate-lock.mjs` と `tests/gate-lock-checks.test.mjs` は残した（削除は依頼の外）。錠を取るのは錠そのものを主題にするファイルだけで、`tests/mutation-tests-off-tree-checks.test.mjs` ⑥ が取り手を発見して、それ以外を拒む。
- `.github/checks-cost.json`（node 検査の shard 台帳）にある変異検査の時間は錠の待ちを含んだままで、ledger を取り直すまで過大。

## 5. 検査

- `tests/mutation-tests-off-tree-checks.test.mjs` ①〜⑥: 写しが作業ツリー・index・HEAD と一致し ignored を持たない／写しの変更が実物に届かず mutate が戻す／**2 プロセスが同時に同じパスを壊しても互いに見えない**／片付けがリンクを辿らず孤児を掃く／規則が 13 ファイルの形を全部拒み temp への書き込みを通す／写しの中の `check:static` が植えた書き手で赤くなる。
- 並行の実測: 変異検査を含む 2 組（A: chronos-claims・doc-facts-claims・round-naming と、probe を踏んでいた読み手 hazard-other-build-and-gate・hazard-radiation-layer／B: legal-pages・edge-counts・sweep・volcano と、privacy.html を読む layer-test-gates-and-docs・hazard-other-i18n-shape-audit）を同時に `node --test` で走らせ、**135 件全部緑・153 秒・作業ツリーの状態は前後で不変・写しの残骸 0**。

## 統合時に直したこと — main が check:static で赤になっていた

output-taint の台帳（#827）と world-packs の分割（#833）がそれぞれ単独では緑で、両方が入った main で `check:static` が赤になった（`js/world-packs-rows.js` 5 件・`js/world-packs.js` 11 件 > 台帳 0 / 10）。
- 本体は `esc` を道具箱 `K` から分割代入で受け取るようになり、判定器はその名前を「js/ 全体で `esc` と名づいた定義がすべて安全か」で判定する——`js/companies-ui.js` の CSV 用の `esc` があるので未判定になった。本体でも `IntMapSafe.html` を直に束縛する（同じ関数）。11 → 6。
- 行ファイルの 5 件は `makePanel(id, title, bodyHTML)` などの引数。分割前は呼び出し元が同じファイルにあって全部見えたが、`K` 越しの呼び出しは見えない。中身は同じ値なので台帳を実測に合わせた（world-packs 10 → 6、world-packs-rows 0 → 5）。
- 形の教訓: **ファイルごとの台帳を持つ門と、ファイルを分割する変更が並行すると、両方緑のまま main が赤になる。** 必須チェックが strict でない以上、main の CI だけがそれを見る。
