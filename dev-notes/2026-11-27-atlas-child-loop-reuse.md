---
title: Atlas の子 AI と親ループ — 前回の拒否の再利用・資料の再読・作業単位の状態・退避後の数値・入力の項目数・後着の検証費用・計測点・能力検索の展開
date: 2026-11-27
newsen: Atlas finishes multi-step work more reliably: a helper that finds a data source uses it on the next try, plan steps report exactly which items are still missing, and very long turns are no longer rejected for size.
newsjp: Atlas の多段の作業がより確実になりました。補助の AI が見つけたデータ源を次の手で使えるようになり、計画の手順はまだ取れていない項目を名指しし、長い手が大きさで拒まれなくなりました。
---

〈依頼〉 外部監査（2026-11-27・main@638897c）が再現した子 AI・親ループの欠陥 8 件を 1 本で直す。優先度は ①ある処理で得たデータを次の処理が使えること ②条件が変われば正しく再試行できること ③求めた結果を実物で判定できること。各項目の合格条件は `tests/atlas-child-loop-reuse-checks.test.mjs` に実装を直接呼んで置いた（モデル応答と外部データは固定）。特定の質問文・能力名の分岐は足していない。上限は 1 つも下げていない。

## 1. 子 AI

- **前回の拒否の再利用**（`js/atlas-delegate.js`・`supabase/functions/_shared/atlas-job-runner.js`）。同じ呼び出しの 2 回目を最初の答えで返す仕組みが、**拒否も**答えとして覚えていた。同じ依頼で「検索」と「それで読む」を出すと後者は許可前で断られ、次の依頼で同じ引数を送っても同じ拒否が返り、実データ取得 0 回。⇒ 答えに理由（`why`: 成功／`grant`／`transient`／能力自身の答え）を持たせ、再利用は理由が成り立つ間だけ（`js/atlas-job-core.js` の `priorStands`。ページとサーバで同じ規則、写しは `sync-atlas-job-core.mjs`）。その場限りの失敗は能力自身が `category:'transient'`（または `retryable:true` で `input` 以外）と言ったものと例外。同じ失敗の繰り返しは前進と数えない。
- **長い資料の末尾**。全文を `full` に持ちながらプロンプトは「残りは渡されていない」と言い、`read_step` は能力の許可が 1 つも無いと呼び出しとして読まれなかった。⇒ 子が丸ごと持つものがあれば参照 ID と読み方を述べ、返答を呼び出しとして読む（能力の無い子は `read_step` だけ）。サーバの子は全文を持たないので、渡した範囲（0〜N 字）を述べる従来の文のまま。
- **5 か国中 1 か国で completed**（`js/atlas-plan.js`）。手順の状態を「能力ごとの最後の試み」で決めていた。⇒ 作業の身元＝呼び出しの身元（能力と引数。ループの `callKey` を `key` として渡す）ごとに最後の試み。完了と失敗が混ざれば「一部のみ」。モデルへは「data.value: 1 of 5 completed; not completed: {…} failed」。**言い換えた再試行（Korea → South Korea）は別の作業**として残る——引数から意味は読まない（読めば場当たりになる）。既存の検査 `atlas-plan-on-map ②` はこの言い換えを「再試行」として扱っていたので、同じ引数の再試行に改めた。
- **退避後の数値**（`js/atlas-working-memory.js`）。本文が無くても、索引に**完全一致**するパス（`a.b[3]` と `a.b.3` は同じ番地）は値を返す。

## 2. 親ループ

- **入力の大きさ**。数の正本を `supabase/functions/_shared/atlas-input-limits.js` に移し、ページ（`INPUT_BUDGET`）と ai-proxy（`MAX_INPUT_*`）が同じ物を読む。ページは**文字と item の両方**を守る: ④ それでも超えたら最新の手の結果も大きい順に短くする（`read_result` で続きが読める旨を書く）、⑤ item 数（300）を超えたらこのターンの古い手を 1 つの文字の item に畳む（呼び出しの隣にその答え）。実測（テスト）: 45,000 字×12 件は以前 540,700 字で `too_large`、今は予算内でサーバが受理。4 呼び出し×75 手（604 item）は 300 以下で末尾が残る。サーバも item 超過時に**末尾ではなく古い会話**から落とすようにした（`slice(0, 600)` は最新を捨てていた）。
- **後着の検証費用**（`js/atlas-cap-research.js`・`js/atlas-delegate.js`）。先着で返したとき、走っていた子だけを `lateCostSink` に渡し、検証役（`verify:true`）を渡していなかった。⇒ `begin()` が検証役の promise（`followed`）も返し、早く返した回答はそれも同じターンへ。二重計上は `reported` で防ぐ（検証役は `check:<i>`）。0.25×3 が 0.50 → 0.75。
- **待ち方の根拠となる計測**（`js/atlas-run-ledger.js`）。`run.marks` に `firstUsefulData`・`parentReceived`・`nextAnalysisStart` を ms で残す（全体完了は `wallMs`、総費用は `costUsd`）。**待ち方そのものはまだ変えていない**: 同じ問題で比べる数がこれで初めて取れるので、速くなる秒数の主張はしない。なお既に決まっている後続の演算は、委譲の `inputs`（`@task:data.path`）で入力が揃った時点に始まる仕組みが既にある。
- **能力検索が見つかりすぎる**（`js/atlas-toolsurface.js`）。strong が 0 件のとき全候補を詳細展開していた（「稜線の両側の植生を比較」で 58 件・125,868 字）。⇒ 全候補を id・呼び名・1 行で残し、`want`／`have` を渡されたらレジストリの宣言（produces・target）に合うものを schema 付きで返す（説明文は strong のものだけ）。語彙はレジストリから導く。実測（語彙検索・この登録簿）: 125,868 → 12,217 字（`want` 付きで 21,877 字）、GDP の検索（strong 2 件）は 13,750 字で不変。成功指標は候補数ではなく、往復数・再検索・送信文字数・成果物の正しさで比べる。

## 3. 検査

- `tests/atlas-child-loop-reuse-checks.test.mjs`（18 件、監査の合格条件そのもの）。
- 既存: `atlas-plan-on-map ②` を同じ引数の再試行に改めた（上記）。`CORE_TOOL_BLOCK_MAX` 15,000 → 16,000（実測 15,265。`want`/`have` の宣言の分。カタログが戻ってきたかの番人であって方針ではない）。`atlas-agent-loop-checks` の data: URL で読む旧版に新しい import の解決を 1 行。
- `check:perf`: `async.gzip` の天井 5,323.1 → 5,350.1 kB（手元の build で +26.9 kB）。この PR が足したのは子のループ・入力の組み立て・計画・検索の数百行で、うち多くは理由を書いた注釈。ただし同じ build で CSS を触っていないのに `cssGzip` も +1.4 kB 出ており、手元の build と天井を記録した build の差が混ざっている——上げたのは超えた 1 行だけで、下げるのは bot。
- 本番: 複数国比較など多段の質問を投げて確かめる（PR の後）。
