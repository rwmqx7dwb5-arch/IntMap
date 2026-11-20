---
title: Atlas に Skills（仕事の進め方の資料）を入れた——能力とは別に、必要なときだけ 1 節ずつ読む
date: 2026-11-20
internal: Skills are read by Atlas through find_capability; no reader-facing control or text changes
---

依頼: 外部監査(2026-11-20)の指摘。能力検索(`find_capability`)は「何ができるか」しか言えず、複数の能力を組み合わせる仕事のやり方・各結果の言える範囲・答えの止めどころを持たない。

- 新規 `js/atlas-skills.js`（発見・1 節読み・門）と `js/atlas-skills-data.js`（宣言。en+jp の散文）。`js/atlas-toolsurface.js` は import 1 行・`find` の入口・`find_capability` の説明と `section`/`language` 引数だけ。
- 発見は `find_capability` の答えの `skills`（名前と 1 行）。読むのは `query:"skill:<id>"`（1 節・残りの節の題と文字数・本文が使う能力）。`read_result` と同じく必要な部分だけを context へ。能力の答えは変えない。
- 使う能力は本文の `id{args}` から導出し、門 `skills-consistent`（`check:capabilities` の ⑤b）が実在・撤回・引数・en/jp 一致・節の長さを測る。
- 初期 4 本: 歴史的国境の比較／衛星画像の変化検出／産業立地の一次分析／港湾・物流リスクの比較。実在する能力とデータだけで書き、無いもの（地価・運賃等）は限界の節で名指す。
- 数: 1 節 1,600 字上限は書き手のための天井（観測: 初期 4 本は最大でも約 1,300 字）。検索の閾値 `MIN_SCORE`=3 は「語が語彙として 1 つ重なる」だけでは当てないための値。Skill が数十本に増えて稀な語の重なりが区別できなくなったら、閾値でなく語の稀少度で順位づける。
- 否定した案: Skill を Capability として登録する（能力表・schema・実行器・`atlas-discoverable` の全部に偽の実装を要求する）／検索結果へ本文を載せる（1 万字の問題を再生産する）／固定手順として強制する（`CONSTITUTION.md` §5）。

検査: `tests/atlas-skills-checks.test.mjs`、`npm run check:capabilities`。

perf 予算: `atlas-console`（遅延 chunk）が約 26 kB 増えた（Skill の en+jp 散文 4 本。起動時の読み込みには入らない）。`async.gzip`・`atlas-console`・`dist.assets` の天井をその分だけ引き上げた（`perf-budget.mjs --update`）。二言語の文言は他と同じ `[en, jp]` の組で持つ（`check:i18n` の言語キー付きオブジェクト禁止に従う）。
