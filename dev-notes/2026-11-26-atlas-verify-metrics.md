---
title: Atlas の検証のうちプログラムで決められるものを先に決め、主張を ID で管理し、回答ごとの時間・費用・繰り返しを数だけで自動記録する
date: 2026-11-26
internal: 子 AI による検証の呼び出しを減らす内部の変更と、管理者向けの計測の追加。読者の画面の機能は変えていない（検証の注記の文言が「プログラム検査による反証」を数えるようになった）
---

〈依頼〉外部の「Atlas オーケストレーション技術監査」（2026-11-26・commit c4a2ba34）の ⑩検証工程の最適化 と §6 性能評価の自動収集。品質の判断は人が行う（本番自動評価は凍結）まま、客観的に測れるものだけを自動で集め、他の改善（文脈軽量化・委譲の非同期化・Web 検索の証拠ストア・サーバ実行）の幅を比べられるようにする。

## 0. 現行 main で再確認した（主張は古くなかったもの・既にあったもの）

- **子 AI の検証は全部モデルだった**。`verifyContract` は「各主張を支持/不支持/反証で答えよ」と頼むだけ。座標が緯度 123 でも、リングが閉じていなくても、モデルに訊いていた。
- **主張は文字列一致で照合されていた**。`verifyOutcome` は `fold(claim)`（小文字化・記号除去）が完全一致したものだけを検証済みとした。検証者が言い回しを変えると、本物の検証が「未検証」に落ちた。
- 既にあったもの（作り直していない）: 地図描画の成否は描画器に訊く決定論的観測（`check:atlasrepeat`・#R736）、回答文中の算術は `js/atlas-verify.js`、ポリゴンの妥当性は `js/gis-geometry.js` の `validate`、単位は `js/gis-units.js`。**新しく足したのは、これらを子 AI の検証の入口に繋ぐこと**。
- 計測の素材は既にあった: `ai_delegation_journal`（1 呼び出し 1 行・キャッシュ読み取り列つき・30 日）、`delegation_overview`、`runTurn` の `run`（`makeRunLedger`）と `trace`。**無かったのは「回答 1 件」の行**（最初の有用な結果までの時間・達成・繰り返し・根拠付き主張・プログラムで決めた検査）。

## 1. 検証の振り分け（`js/atlas-claim-check.js`、新規）

- 純関数。種類の一覧は持たない（「幾何の主張はプログラム、解釈の主張はモデル」という固定分類を作っていない）。**振り分けは検査が何を見つけたかで決まる**:
  - 検査が欠陥を見つけた → その主張を `contradicted`（根拠 `program`）。子 AI には訊かない。
  - 検査が何も見つけない → 「値が整っている」と注記するだけ。**`supported` はプログラムからは出ない**（整ったポリゴンが正しいポリゴンとは限らない）。子 AI には訊く。
  - 検査が読めない値 → 何も言わない。子 AI に訊く。
- 検査: 緯度経度の範囲と数値性、GeoJSON 幾何（`geometry.validate`）、事実（`facts`）の単位が表に無い（軟らかい指摘で反証にはしない）・同じ量が次元の違う単位で述べられている。カーネルは注入（`window.IntMapGisGeometry` / `IntMapGisUnits`）。無ければ検査は何も言わない。
- 全主張がプログラムで決まった課題には**検証者を起動しない**（子 AI 1 件分の費用と時間が丸ごと無くなる）。残りの主張だけを検証者に渡す。検証者への依頼はプログラムが見られない所に絞った（出典が本当にそう述べているか・因果・資料の信頼性・複数段の論理）。

## 2. 主張の一意な ID（`verifyContract` / `verifyOutcome`）

- 主張の ID は `<課題>#<n>`（その課題の所見の位置）。検証者への依頼に ID つきで列挙し、検証者は `id` を付けて返す。照合は **ID の完全一致**。言い回しが違っても検証済みと認識される。
- 3 語（supported / unsupported / contradicted）以外の判定は「未検証」。以前は未知の語で `counts[verdict]` が NaN になり得た。
- 結果には `basis`（`program` / `model`）の内訳が付く。回答の注記は「プログラム検査による反証 n 件、モデルには尋ねていません」を述べる。
- 変更の範囲: `js/atlas-orchestrate.js`（`verifyContract` / `verifyOutcome`）、`js/atlas-cap-research.js`（`after` で振り分け）。**`atlas-delegate.js` は触っていない**（所見は元々生のまま運ばれ、`id` が残る）。

## 3. 回答ごとの計測（`js/atlas-turn-metrics.js`・migration `20261130100000_atlas_turn_metrics.sql`）

- **1 回答 1 行**: 回答完了までの時間、最初の有用な結果までの時間（plan 以外の操作を頼んだ手の次の手が始まった時点。plan だけの手は数えない）、モデル待ち/操作の内訳、費用（全呼び出しが費用を報告したか込み）、達成（ターン自身の宣言 complete/partial/none）、操作数（頼んだ・実行・**同じ呼び出しの再利用**・拒否・存在しない道具）、返された所見と出典つきの数、プログラム/モデル/未決の検査数、最も時間を食った道具。**質問・回答・場所・URL は載せない**（数とミリ秒だけ）。
- 書き手は `log_atlas_turn_metrics`（SECURITY DEFINER・呼び出し元自身の口座・全値クランプ・同じ turn_key は 1 回だけ）。保持 90 日（比較に 1 か月以上の窓が要るため。ジャーナルの 30 日では足りない）。`account_data_catalog` に文を足した。
- 読み手は管理者専用の `atlas_metrics_overview(p_from, p_to)`。回答単位の指標に加え、ジャーナルから キャッシュ率・各子モデルの寄与（呼び出し数・成功・費用と待ち時間の割合）・委譲した回の臨界経路（最も遅い子が親の待ちに占める割合）を 1 回で返す。分母 0 の比は null（0 にしない）。
- **同じ操作の重複率は `check:atlasrepeat` と同じ事実**（`trace.reused`）を数えるだけ。手数の上限にも門にもしない（one-pass-or-a-reason §3）。`trace.unknownTool` を `js/atlas-agent.js` に 1 行足した（存在しない道具を頼んだ数。composeInput には触れていない）。
- 比較の出し方は `docs/MONITORING.md` §2b4 と `scripts/atlas-metrics-report.mjs`（前後 2 窓の RPC 結果を並べ、各指標が良い方向に動いたかを出す。**回答が良くなったかは言わず、非ゼロ終了もしない**）。

## 4. 検証

- `tests/atlas-verify-metrics-checks.test.mjs`（新規 11 件。実際の幾何カーネルと単位カーネルを評価する）、`tests/atlas-orchestration-checks.test.mjs` ㉙ を ID 照合へ更新（言い換えられた主張が検証済みになる・未知の語は未検証）。`supabase/tests/55_atlas_turn_metrics_test.sql` と `00_structure_test.sql`（+2）。

## 5. 他セッションとの境界と、次に比べるとき

- 触った他セッションの領域: `atlas-agent.js` に 1 行（`trace.unknownTool`）、`atlas-console.js` に記録の呼び出し数行。`composeInput()`・`atlas-delegate.js`・Web 検索経路・`SERVER_CAPS` は触っていない。
- 他セッションの変更の幅は、その変更が本番に出た時刻の前後の同じ長さの窓で `atlas_metrics_overview` を取り `atlas-metrics-report.mjs` で並べる（手順は MONITORING §2b4）。文脈軽量化は `calls.cache_rate`・`turns.total_ms_*`・費用、委譲の非同期化は `turns.first_useful_ms_*`・`families.*`、Web 検索の証拠ストアは `turns.grounded_claim_rate`・`duplicate_op_rate`、サーバ実行は `turns.model_calls_per_turn`・`model_wait_share`・`first_useful`。
- 未実装として残したもの: 管理コンソールに画面は足していない（RPC を直接呼ぶ）。「最初の有用な結果」は 1 手の粒度。ベースライン（変更前の窓）は、この migration が本番に入った後にしか溜まらない——**この変更が出る前の期間は回答単位では比べられず**、呼び出し単位（キャッシュ率・待ち）だけがジャーナルの 30 日分で比べられる。

## 6. 子 AI が呼んだ読み取り能力のモデル呼び出しを、子のキーで記録する（追加依頼）

- 以前: `research.brief` / `research.analyze` が内部で呼ぶモデルは、子が呼んでも親ターンのキー（`K._curTurnKey`）で記録され、子の費用と待ちが親に混ざった（`2026-11-25-worker-reach` の「残したこと」）。
- 今: 子の能力呼び出し（`atlas-delegate.js` の `cap.run`）が自分の子キー（`<親>~<課題>`）を `turnKey` として渡す → `runReadCapability` → 実行核（`atlas-executor.js` の実行文脈 `turnKey`）→ 能力が `dctx.turnKey` を読む。モデルを呼ぶ 2 つの能力は 1 つの規則 `callKey(dctx,K)` で `turnId=子キー・parentTurnId=親ターン` を付ける（`atlas-answer-pipeline.js` は `parentTurnId` を通すだけ）。Atlas 自身の呼び出しは従来どおり親のキー。
- ai-proxy は `x-intmap-parent-turn` つきを子の呼び出しとして扱うので、ジャーナルの `child_key` が子になり、`atlas_metrics_overview.children` の寄与と費用が親と分かれる。**副作用**: その呼び出しは子の呼び出し数の上限・委譲方針（`ATLAS_DELEGATION_CHILD_CALLS` 等）の対象になる（子が行ったことなので筋は通るが、本番で `delegation_*` の拒否コードが増えたら、この変更が原因か見ること）。`atlas-delegate.js` に 1 語（`turnKey: childKey`）だけ足した。
- 付随: 子の所見の整形（`atlas-job-core.js` `shapeOf`。サーバ側の写し `supabase/functions/_shared/atlas-job-core.js` も同期）が決まった欄しか通さず、検証者の返す `id` が落ちていた。`id` を通す（本番では ai-proxy と atlas-jobs の再配備が要る。CI の配備が行う）。所見に空の `lat`/`lon` 欄があるだけでは「位置を述べた」とは扱わない（自分の欄で値があるときだけ）。
- 窓口の台帳（`tests/global-surface-baseline.json`）を更新した: `window.IntMapGisGeometry` / `window.IntMapGisUnits` の読みが各 1 増（`atlas-cap-research.js` が検証の検査器を呼び出し時に取る。所有者を import すると第 2 の幾何カーネルを遅延チャンクへ同梱することになるため、既存の読み手 `atlas-query.js` と同じく実行時に 1 つの本物を読む）、`window.sb` が 2 増（`atlas-console.js` の記録呼び出しと `atlas-turn-metrics.js` の書き手。ログイン済みクライアントの唯一の入口が `window.sb` のため）。

## 7. 性能の天井を上げた理由（`tests/perf-baseline.json`）

- `atlas-console` の遅延チャンク 1437.6 → 1445.3 kB（+7.7 kB）、非同期 gzip 合計 5290.5 → 5323.1 kB。増えたのは、このラウンドが足したもの: 検証の検査器（`atlas-claim-check.js`）、回答ごとの計測（`atlas-turn-metrics.js`）、ID 照合と検証の振り分け（`atlas-orchestrate.js`・`atlas-cap-research.js`）。
- 買ったもの: 子 AI の検証を座標・形・単位で先にプログラムが決めること（モデル呼び出しと待ちの削減）、言い換えに強い ID 照合、回答単位の計測。幾何・単位カーネルは import せず実行時に既存のものを読むので、第 2 の幾何カーネルは同梱していない。取り戻せるか: 検査器を `atlas-cap-research` の外へ出す余地はあるが、遅延チャンクの置き場を変えるだけで総量は変わらない。
