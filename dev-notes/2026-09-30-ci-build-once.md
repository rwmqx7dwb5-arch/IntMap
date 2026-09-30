---
title: CI はサイトを 1 run に 1 回だけビルドし、main の run が緑になってからその同じ dist/ を本番へ出す——以前は 1 run で最大 4 回ビルドし、deploy.yml が main の CI と並行に 5 回目をビルドして、main が赤でも公開していた
date: 2026-09-30
---

〈依頼（CI の構造）〉利用者承認の方針 3 点: ① main への push 後の CI は残す（ruleset の必須チェックは
strict ではないので、並行 PR を合わせた木を検査するのは main の run だけ）② ビルドは CI の 1 run につき 1 回
③ 本番公開は main の CI が緑になった後に、その CI がビルドした成果物をそのまま配る（公開は約 10 分遅れる・
main が赤なら公開しない——承認済み）。

## 0. 測った（2026-09-30・このマシン・この木）

- **ビルドの回数（前）。** PR の run: Gates の build タスク（`scripts/ci-gates.mjs` の `npm run build`）1 回＋
  ブラウザ core の 3 機（`playwright.config.js` の webServer が `npm run build && …`。cesium 機は計画が空なら
  走らない）＝**最大 4 回**。main の push: 同じく最大 4 回＋`deploy.yml` の 1 回＝**最大 5 回**。nightly: Gates 1 回＋
  deep の 8 機＋core の 3 機＝**最大 12 回**。
- **ビルドの回数（後）。** どの run も `build` ジョブの **1 回**。`deploy.yml` は push で走らない。
- **成果物の大きさ。** `npm run build`（壁時計 74 s）の `dist/` は **772,924,597 バイト・8,321 ファイル**、
  うち `dist/data` が 715,641,847（7,606 ファイル）、`dist/data/border-detail` だけで 415,019,194。
  `dist/assets` 18,961,081・`dist/cesium` 7,101,061・`.perf/build-report.json` 256,086。
- ⚠ **「中身の大半は既に圧縮済み」は誤りだった。** `border-detail` 直下の 5,621 ファイルは全部 JSON 文
  （`file` の判定）。`tar -cf - dist | gzip -1` は **281,652,977 バイト（36 %）** を 13.7 s で、`gzip -6` は
  246,423,628 を 27.7 s で出した（素の `tar | wc -c` は 9.1 s・779,376,640）。⇒ artifact は
  **`compression-level: 1`**（0 だと上り 1 回と下り — build を読む gate shard 1 機＋ブラウザ各機 — のたびに
  約 490 MB 多く運ぶ。1 の追加費用は CPU 約 5 s を 1 回）。
- **ブラウザ機は data-assets を使っていなかった。** spec が `data/` を直接読むのは
  `tests/hist-city-label-epoch.spec.js` の `data/hist-cities.json`（追跡対象）だけ。data-assets.json の 2 集合
  （`border-detail`・`hist-eras`）を読む spec は無い。data-assets がブラウザ機にあったのは、そこでビルドして
  いたから——ビルドしなくなったので外した（1 機あたり約 700 MB のキャッシュ復元が消える）。
- ⚠ **CI 上の転送時間はまだ測っていない**（この変更の最初の run で測る。`build` ジョブの upload と、
  gate shard・ブラウザ機の download の所要時間）。

## 1. 直した

- `ci.yml` に `build` ジョブ（checkout → npm ci → data-assets → `npm run build` → `dist/` と
  `.perf/build-report.json` を 1 つの artifact に。`include-hidden-files: true`——`.perf/` はドット始まりで、
  既定では黙って落ちる）。名前は run の attempt を含み、job の output で渡す（失敗ジョブの再実行が同じ
  成果物を使う）。main への push では同じ `dist/` から `_site` を組み（`deploy.yml` と同じ手順・
  `build-info.json` の `runId` は CI の run）、Pages の artifact を上げる。
- Gates: `needs: build`・`if: !cancelled()`（build が赤でも他のゲートは全部報告する——3 機に分けた理由を
  壊さない）。`node scripts/ci-gates.mjs --needs-build i/n` が「この shard は build を読むか」を
  `--shard` と**同じ計画**から答え、true の shard だけがダウンロードする。`IM_PREBUILT_DIST=1` のとき
  build タスクは `npm run build` を走らせず、成果物が**無ければ赤**（黙って作り直さない）。未設定なら従来どおり
  （ローカル・`npm test`・使い捨ての木）。「Static checks」は build の結果も読む。
- Browser / Deep: `needs: build`。browser-tier は計画が空でなければ成果物を落とし、`IM_PREBUILT_DIST=1` で
  走る。`playwright.config.js` の webServer はそのとき serve だけ（`dist/index.html` が無ければ設定の読み込みで
  拒否）。
- 公開: `ci.yml` の `pages`（deploy-pages）と `post-smoke`。条件は push・`refs/heads/main`・
  `ENABLE_PAGES_DEPLOY`・`!cancelled()`、そして `build`・`static`・`checks-gate`・`browser-gate` の結果を
  **名前で** success と読む（browser-deep は push で必ず skipped で、既定の success() は上流の skipped で
  公開まで skip してしまう）。権限は `pages` ジョブだけに `pages: write`・`id-token: write`、job の
  concurrency `pages-production`（`deploy.yml`・`rollback.yml` と共有）。
- `deploy.yml` は `workflow_dispatch` だけ（手動の再公開・自前でビルド）。`tle-refresh.yml` の bot merge 後の
  起動は GITHUB_TOKEN の push が workflow を起こさないためで、これまでどおりこのボタンを押す。
- nightly の deep-alarm: deep tier が build に依存したので、nightly の build が赤だと deep は **skipped** になる。
  以前は各機が自前でビルドして赤になり警報が鳴った。`needs.build.result` も読み、build の失敗を deep の結果として
  渡す（黙らせない）。
- `doc-facts` の「何が配信されるか」「公開は有効か」は `deploy.yml` を名指していた。**push で公開する
  workflow を発見する**（deploy-pages を使い、`on:` に `push:` がある）ように直し、ちょうど 1 本であること・
  `docs/RELEASE.md` がその名前を述べることを足した。

## 2. 決めたこと・決めなかったこと

- **Migrations（`db.yml`）は待たない。** 別 workflow は `needs:` に書けない。PR で必須なので、migration は
  そこで判定される。以前の `deploy.yml` も待っていなかった。
- **main への新しい push は古い run を公開ごと取り消す**（workflow の concurrency は push では ref ごとに
  cancel-in-progress）。遅れて終わった古い commit が新しいものを上書きしないための性質なので変えていない。
  連続 merge の途中の commit は個別には公開されず、最新の run がまとめて出す。
- **compression-level を指示の 0 ではなく 1 にした**（§0 の実測。前提が崩れたため）。
- 検査の網は 1 本も減っていない: 宣言された全ゲートは今も 3 機にちょうど 1 回ずつ（`--check`）、ブラウザ機は
  同じ spec を同じ計画で走らせる。変わったのは「誰がビルドするか」だけ。

## 3. 守る検査

`tests/ci-build-once-checks.test.mjs`: ① ci.yml（ローカルの composite action と npm script を展開）で
ビルドしうる step が `build` ジョブの 1 つだけ（`playwright test` と `ci-gates.mjs --shard` は
`IM_PREBUILT_DIST=1` が無ければビルドとして数える）② 成果物を読むジョブは全部 `needs: build`・artifact に
`.perf/` が入る ③ `ci-gates.mjs` の 3 状態を使い捨ての木で評価 ④ `--needs-build` と `--plan` の一致
⑤ `playwright.config.js` を両設定で import ⑥ `pages` の needs・if・権限・concurrency・artifact
⑦ `deploy.yml` に push が無い。変異 7 件（env の綴り・push の復活・needs の脱落・`include-hidden-files`・
`npm run serve` の混入・ci-gates の分岐）はすべて赤になった。

## 統合時の追記 — 本番到達の読み手

`scripts/worktree.mjs` の `deployState()` は deploy.yml の run だけを見て「本番に届いているか」を述べていた。公開が ci.yml へ移ると、このままでは**毎回「本番に届いていない」と嘘をつく**（読み手が 1 人しかいなかった——`intmap-fixing-the-bundle-did-not-fix-the-map` と同じ形）。deploy.yml と ci.yml（push・main）の両方の run を新しい順に並べ、各 run は**その workflow の中で actions/deploy-pages を使うジョブ**（名前でなくファイルから発見）が success のときだけ「公開した」と数える。CI の run は全体の色で判定しない——nightly やゲートの赤は「公開しなかった」であって「本番が壊れた」ではない。`tle-refresh.yml` のコメントも現状へ（bot のマージは GITHUB_TOKEN なので ci.yml の push も起きず、deploy.yml の手動起動が今も正しい）。
