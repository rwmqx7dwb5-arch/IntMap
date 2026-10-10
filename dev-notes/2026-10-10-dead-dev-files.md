---
title: どこからも呼ばれない開発用ファイルを消す
date: 2026-10-10
internal: 開発用スクリプトと検証出力の整理で、利用者に見える挙動は何も変わらない
---

# どこからも呼ばれない開発用ファイルを消す

scripts/ の全数調査（追跡 636 本）で、コード・workflow・package.json のどこからも参照されないものを消した。
再確認は scripts/ tests/ js/ src/ .github/ package.json .gitattributes vite.config.js の grep（basename と拡張子なし）。

## 消したもの

- `scripts/histrecon/kyudaka-meiji-pilot.mjs`、`kyudaka-meiji-LI00001164.json`（10426 行）
  - 旧高旧領取調帳の転写 pilot。JSON を読むのはこの pilot だけだった。何も描かず、束も書かない。
  - 引き継ぎ: 明治の復元は `build-meiji-v2.mjs` と `assembled/meiji.mjs` が働いている。pilot の結論（一致率）は
    `kyudaka-meiji-pilot.json` と docs/HIST-RECONSTRUCTION.md に残してあるので、数字の出典は失われない。
- `scripts/histrecon/pilot-results/` の `res-A1..E.json`（7 本）と PNG 8 枚
  - build-meiji-v2.mjs が書き出す過去の出力。どのコードも読まない。再実行すれば再生成できる。
  - `meiji-report-v2.json` は `assembled/meiji.mjs` が読むので残した。
- `scripts/i18n-pages-apply.mjs`
  - 新言語を pages.en.js から種付けする一度きりの道具（R548）。9 言語は凍結で、既存 locale は出来上がっている。
    監査は `i18n-pages-audit.mjs` と `check:i18n` が引き続き行う。
- `scripts/perf-compare.mjs`
  - 2 条件の交互計測。起動費の門は `check:perf`／`scripts/perf-*` の計器が守っており、これは手動の比較器だった。

## 消さなかったもの

- `scripts/build-*.mjs` ほかデータ再生成ツール: governance-ledger が「data を書く生成器」として記録しており、データを作り直す能力そのもの。
- `kyudaka-meiji-pilot.json`: docs/HIST-RECONSTRUCTION.md が数字の出典として名指す。
- `js/article-reader.js`: ヘッダは「入口が無い」と述べるが、実際に死んでいるのは `openArticleInSidebar` の鎖だけで、
  `enterReaderPane()` / `readerBar()` はイベント詳細（news-events.js）と news-ui.js が使う生きた読み手。
  ファイル単位では消せない。死んだ鎖（`openArticleInSidebar`・`fetchReadable`・`renderReader`）の切り出しは
  proxy-fetch-relay・news-reader 系の検査を組み替える別作業。
