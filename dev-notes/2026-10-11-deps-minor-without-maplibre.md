---
title: 依存の minor/patch 7 件を取り込む（maplibre-gl は分けた）——写真は supabase-js の版を写さない
date: 2026-10-11
internal: 依存の版と、テストの記録の仕方と、天井 2 行だけの変更
---

〈きっかけ〉Dependabot #1073（npm の minor/patch 8 件）が Static・Gates 2/3・Regression 1/3・2/3 で赤のまま止まっていた。
CI のログを読んで原因を依存ごとに分けた。

| 失敗 | 原因の依存 | 扱い |
|---|---|---|
| `check:perf`（eager +466 kB ほか） | eager は maplibre-gl 6.13、`cesium` チャンクと `dist.assets` は cesium 1.146 | maplibre は分離。cesium の 2 行は上げる（下） |
| `command-census` R322 ① の stub | maplibre-gl 6.13（`setData` が `_workerUpdates.replace/flush` に） | 分離（製品の `setData` の重複排除をどうするか決める仕事） |
| `maplibre-6-migration` ③ | maplibre-gl 6.13（worker が自己完結に） | 分離 |
| `atlas-core-split` ① | supabase-js 2.117.3 | 直した（下） |

## 1. ここで取り込んだもの

supabase-js 2.117.3・cesium 1.146.0・katex 0.19.0・acorn 8.19.0・js-yaml 5.4.3・pdfjs-dist 6.4.299・vite 8.3.3。
**maplibre-gl は 6.11.2 のまま**（挙動の変わる 2 点と eager の増加を、別の作業で読んでから入れる）。
固定の版（`5.4.2` 形）は固定のまま、範囲（`^`）は範囲のまま書いた。

## 2. 写真は依存の版を写さない

`tests/fixtures/atlas-core-split-before.json` は ai-proxy が外へ出した要求を全部写した写真で、supabase-js が
自分の版を名乗るヘッダー `x-client-info: supabase-js/2.117.2; runtime=deno` を 278 か所に持っていた。版は
**依存についての事実**で、関数が何をしたかではない——patch の bump だけで、ai-proxy に何の変更も無いまま赤になった。
記録の仕方を直した: `tests/helpers/ai-proxy-contract-run.mjs` は時計由来の値を `unclock` で消しているのと同じ場所で、
`x-client-info` の版だけを `supabase-js/<version>` にする（他の部分は残す）。写真の 278 か所も同じ形にした。

## 3. 上げた天井（理由）

`node scripts/perf-budget.mjs --update` が超えた 2 行だけを上げた。
- async chunk `cesium`: 4,792.7 → 4,830.5 kB（+0.8%）——cesium 1.146 そのもの。Cesium は設定で選んだときだけ読まれる第 2 エンジン。
- `dist.assets`: 19,824.3 → 19,941.8 kB——同じく cesium の配布物。
eager（起動時に読まれるもの）は maplibre を除くと天井の内側で、上げていない。

## 4. 確かめた

この作業場は自前の `node_modules`（原本への junction を外してから `npm ci`）。check:static・types・engine・assets・perf と
atlas-core-split が緑。全件は PR の CI。
