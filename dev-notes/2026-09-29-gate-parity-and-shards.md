---
title: npm test が CI と同じ門を走らせるようにした——母集合は 1 か所で発見、node 回帰の shard は実測秒で詰め、行数天井の検出は綴りでなく事実で訊く
date: 2026-09-29
---

〈依頼〉監査で見つかった構造欠陥 3 件。① `npm test` の checks 半分がゲートを手書きの一覧で持ち、CI が
走らせるゲートの一部を走らせない ② CI の node 回帰 shard がファイル数で割られていて所要が偏る
③ #R795 の「行数天井は撤去」を守る検査が `<` の形しか探しておらず、天井が残っている。

## 0. 測った

- `package.json` の `check:*` は 31 個。`scripts/test-parallel.mjs` の手書き一覧に入っていたのは 23 個で、
  **histeras・histnames・histfill・bordercoast・perf・assets・surface・types の 8 個**は `npm test` では
  一度も走らなかった。CI（`scripts/ci-gates.mjs`）は `package.json` から発見して 31 個全部を走らせる。
  ⇒ AGENTS.md §4「push 前に CI と同じ門をローカルで通す」は、この道具では満たせなかった。
- CI run 36513330956（main 43c1a6a8）の `Regression i/3`: **11m16s / 8m32s / 4m52s**。node の
  `--test-shard` は「k 番目のファイルを k mod n へ」の件数割りで、r403（499 s）・r500（393 s）・
  r623（371 s）・r399（128 s）が全部 shard 1 に載っていた。
- `tests/r795` の「行数天井は戻らない」は `assert.ok(<名前> < N,` の正規表現で、名前は
  lines|shell|atlas|… の短い一覧。**残っていた天井は 3 本ではなく 5 本**:
  r291 ⑳（`<= 4400`）・r199 ⑤（`body < 5_200`）・r200 ⑤（`body < 4_400`）・
  r278 ⑦ と r350 ⑨e（`n < 5300`、`n` は `/\r?\n/` で割った行数）。どれも綴りの理由だけで漏れていた。

## 1. 直した

- **`scripts/gate-universe.mjs`（新規）**: 母集合（`check:*`）・build を読むかの発見・ゲートの実行
  コマンド・LPT 詰め・中央値。`ci-gates.mjs` はここから import するだけになり（計画は変更前と 1 字違わず同じ
  ことを確認）、`test-parallel.mjs` も同じ関数を使う。
- **`scripts/test-parallel.mjs`**: checks 半分＝`data-assets verify` → `package.json` の宣言順の全ゲート →
  `test:checks`。build を読むゲート（発見の結果 `check:perf`・`check:assets`）は browser 半分の最後に
  `npm run build` の後で走る——checks 半分に置くと、browser 半分のサーバが同時に `dist/` を build していて
  競合する。走らせないゲートは `CI_ONLY` に**理由の文つきで**しか置けず（今は空）、毎回
  「CI でだけ走るゲート: …」を最初と最後に印字する。理由の無い行・存在しないゲートの行は実行を止める。
  `--planned` が計画を JSON で出す。各ゲートに付いていた経緯のコメントは消さず、末尾に原文のまま移した。
- **「npm test が X を走らせるか」を綴りで訊いていた読み手 9 か所**を、評価した計画に訊く形へ:
  `tests/helpers/ci-reach.mjs` に `npmTestRuns` / `npmTestRunsScript` / `localPlan` を足し、
  r205・r239・r274・r397・r588・r730・data-governance の各検査と、`scripts/doc-facts.mjs` の
  規則 28（`ci-gates`）・33（`gate-callers`）がそれを使う。⚠ r730 と data-governance は、手書きの一覧が
  消えたあとも**移したコメントの綴りで緑になるところだった**——読む検査は理由を問わず緑になる。
- **node 回帰の shard**: `scripts/checks-shards.mjs`（新規）が `test-checks.mjs` の GLOB と同じ集合を
  `.github/checks-cost.json`（新規・ファイルごとの秒）で LPT に詰める。`test-checks.mjs` が
  `--test-shard=i/n` を自分で受けて束のファイルを node に渡すので、`ci.yml` の step は形を変えずに
  `--timings checks-timings.json` を足しただけ。各 shard は計った秒を `checks-timings-<i>` として
  upload し、`--update` で台帳に畳む（gate-cost.json と同じ手順・台帳が決めるのは均衡だけ）。
  `scripts/checks-timing-reporter.mjs`（新規）はファイルごとに nesting 0 のテストの所要を足す reporter。
- **台帳の初期値**: 上の run の 3 shard のログから、トップレベルのテスト 5,570 件の所要を**題名で**
  ファイルへ帰属させた（一意に帰属 5,337 件・複数ファイルに同じ題名 4 件・テンプレート文字列の題名で
  逐語一致しない 229 件は除外）。577 ファイル中 575 に値、2 件は中央値。予測は 3 台とも 1,204 s
  （直列の和）。⚠ ロックを待つ変異テストは待ち時間ぶん重く計られる——離す方向の誤差なので害は無い。
- **行数天井**: `tests/helpers/line-ceilings.mjs`（新規）が acorn で「ファイルから読んだ文字列の行数を
  数値と上限として比べる式」を探す。`<`・`<=`・`>`・`>=` のどの向きも、変数・局所関数・import した
  読み込み関数（r291 の `read` は `scripts/eol.mjs` の `readLF`）・`.filter()` 越しの行数も追う。
  #R795 以前の版の 21 ファイルに当てて、#R795 が撤去した全箇所（r292 の `.filter().length` と
  r479 の `SHELL.map(read)` を含む）を見つけることを確かめた。r795 の検査はこれを呼ぶ形にした。
  残っていた 5 本は #R795 と同じ扱いで撤去した（r199・r200 は `> 0` を残す）。**r278 ⑦ と r350 ⑨e は
  天井そのものしか持たないテストだったので、テストごと撤去して理由のコメントを置いた。**

## 2. 選ばなかったもの

- **build を読むゲートを CI 専用にする**: 理由を書けば許される形にはしたが、ローカルでも
  browser 半分の後なら競合なく走らせられるので、除外しなかった。
- **台帳を CI が自動で commit する**: main は PR 必須で bot の push を受けない（#R202 の実測）。
  gate-cost.json と同じく手で `--update` する。
- **node の `--test-shard` をそのまま使い、ファイル名で重いものを散らす**: 手書きの一覧になる。

## 3. 検査

`tests/gate-parity-and-shards-checks.test.mjs`（16 本）:
① 宣言済みの全 `check:*` が npm test の計画か `CI_ONLY` のどちらかに入る（評価した `--planned` と
`ci-gates --planned` の両方に訊く）／明日足したゲートが自動で入る／理由の無い除外・存在しない除外は
止まる／build を読むゲートは build の後／checks 半分の順序。
② shard は 1〜7 台のどれでも glob の分割／入力の順序によらず決定的／未計測は中央値で 1 回だけ／
最長の束が LPT の保証（下界の 4/3）以内／`--test-shard` と `--timings` を実際に走らせて確かめる／
台帳の畳み込みと `--check`／ci.yml が timings を upload する。
③ 16 形の天井を捕まえ、下限・文字数・子プロセスの出力は捕まえない／撤去した 5 本を各ファイルへ
戻すと 1 本ずつ見つかる／リポジトリには 0 本。

## 4. ローカルの `npm test` が延びる分（`.github/gate-cost.json` の CI 実測から）

- checks 半分 **+約 260 s**（histfill 176・bordercoast 79・histnames 2・histeras 1・surface と types は
  台帳に無く中央値 1 s ずつ——types は tsc なので実際にはこれより長い見込み）。
- browser 半分 **+約 158 s**（build 42・assets 115・perf 1）。
- 2 つの半分は並行なので、壁時計の増分は長いほうの半分に載った分だけ。
