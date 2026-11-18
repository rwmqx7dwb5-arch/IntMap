---
title: Atlas の委譲を、1 つの能力から「複数の AI を動かす基盤」へ——能力の仕事・独立検証・再試行・再開・運用の記録・評価の比較器
date: 2026-11-19
newsen: Atlas can now run exact map-analysis steps in parallel and chain them, have a second worker check what its research workers found, retry a worker that failed for a transient reason, and its delegation is measured and logged for operators.
newsjp: Atlas が、地図の分析の手順を並行して実行して連鎖させたり、調べた結果を別の子に検証させたり、一時的な理由で失敗した子をやり直したりできるようになりました。委譲の実行は運営側で測定・記録されます。
---

〈依頼〉 Atlas のマルチエージェント化（`research.delegate`）に残っている実装を全部進め、さらに AI オーケストレーションの基盤を整える。順序は任せる。

## 0. 測った（着手前の事実）

- 委譲は **子がモデルと Web 検索しか使えず**、IntMap 自身の能力を 1 つも実行できなかった。
- `data.gis` は能力表で `read`・書き込みなし。つまり「読み取り専用の能力を直接走らせる経路」さえあれば、子の側から GIS を連鎖できる。足りないのは経路だった。
- 評価（`scripts/atlas-eval/`）に委譲の語は 0 件。管理画面にも委譲の費用・遅延の表示は 0 件。
- 台帳 `ai_turns` は約 1 日で消え、失敗した子の行は払い戻しで消える。**失敗の記録はどこにも残らなかった。**
- 本番（2026-11-19）: 3 体の子のうち 1 体が成功、2 体が上限で拒否、1 体が 503。

## 1. 作ったもの

**基盤（`js/atlas-delegate.js`）**
- 契約に `kind`（`worker`／`capability`）。能力の仕事は `{capability, args}` を持ち、同一性判定（`contractKey`）にも含む（キー順に依らない `stable`）。
- 事象記録の購読（`subscribe`）・仕事 1 つの取消（`cancel`）・`snapshot()` と `makeDelegation({resume})`（`done`／`partial` の仕事は再実行も再課金もしない）。
- **一覧を丸ごと読んでから始める。** 名指す先が後ろにあってもよい。入力が自分に戻る輪は `input_cycle` で即座に終える（Tarjan の強連結成分）。
- 能力の仕事の引数 `@<id>:<経路>`（`resolveArgs`）。辿れなければ走らせずに `input_ref_unresolved`。
- worker: サーバの `childMaxCalls` を渡されたとき、**観測された一過性の失敗**のあとに前と違う要求を送る（時間切れなら Web なしで・`partial`/`degraded`）。要求ごとに、中身から作った鍵（`requestKey`）を `x-intmap-replay` で運ぶ。
- 所見に `verdict`（検証者が付ける 3 語のみ）。

**部品（`js/atlas-orchestrate.js`・新設）**: `integrate`・`fanOut`・`verifyContract`・`verifyOutcome`・読み取り専用の能力を走らせる実行役・種別ルータ。

**能力 `research.delegate`**: ルータ・`verify:true`・ターン中止での全取消・仕事ごとの進捗（実行器の `progress` を能力まで通し、作業の痕跡に出す）・結果の `integrated`（重複・食い違いの旗・戻らなかった子の状態・出典・検証）。ホスト側に `runReadCapability`／`classifyCapability`（能力表の risk・writes・confirmation から導く。id の一覧は書かない）。

**サーバ**
- `ai_delegation_journal`（30 日）と `log_ai_delegation`・`purge_ai_delegation_journal`・管理用 `delegation_overview`。子と親のターンの成否・コード・モデル・遅延・トークン・費用。
- 子の要求を `ai_turn_answers` に載せる（`replayKeyFor`）。同じ要求の 2 度目は払い戻しなしで先の答えを返す。
- `ATLAS_DELEGATION_MODEL`（価格の分かるモデルだけ）で子の層を親と分けられる。

**管理画面**: Delegation タブ（`js/admin-delegation.js`）・`docs/MONITORING.md` §2b3。

**評価**: 判定器が委譲の子を読む（件数・状態・費用・最も遅い子）。委譲を要する問い 3 本と、委譲あり・なしの対の cassette 6 本。`scripts/atlas-delegation-bench.mjs`（A/B 比較器。オフライン再生と本番の両対応）。

## 2. 否定した見立て・判断

- 「再試行は既定で入れる」→ 既存の検査（⑭）が、上限を渡さない呼び出しの従来動作を守っていた。**上限を渡したときだけ**再試行する（上限を知らずに再試行すれば、サーバの `turn_calls` で拒否されるだけ）。
- 「`ATLAS_DELEGATION_MODEL` で撤回済みの id も拒む」→ `WITHDRAWN_MODELS` は選択肢の表示にだけ効く規則（拒否にすると能力の境界になる・憲法 §0.3）。**価格が分かること**だけを条件にした。
- 「ワーカーの鍵は試行番号」→ 同じ id（`task1`）を使う別の `research.delegate` 呼び出しに先の答えを返してしまう。**要求の中身のハッシュ**にした（検査 ㉒）。
- 「結果の意味での統合」は作っていない。`integrate` は文字列の正規化で重複を除き、同じ地点の数値の違いを**旗**にするだけ。意味の同一判定は Atlas に任せる。

## 3. 容量の上限を上げた理由（check:perf）

増えたのは **async のみ**（起動時に読む分は不変）。`atlas-cap-runs` と `atlas-console` は、`research.delegate` の実行部分・ホスト側の経路・オーケストレーション部品が載った分で、この変更が買ったものそのもの。`async.gzip` も同じ分。

## 4. 検査

- 新設: `tests/atlas-orchestration-checks.test.mjs`（30）・`atlas-delegation-wiring-checks`（14）・`delegation-journal-checks`・`admin-delegation-checks`・`atlas-delegation-eval-checks`。既存の `atlas-delegation-checks`・`atlas-ai-proxy-models-checks`（子の層の分だけ文面を更新）は緑。
- ゲート: static・engine・types・i18n・docs・agents・archfiles・catalog・capabilities・atlasrepeat・surface・testbudget。
- **走らせられなかったもの**: pgTAP（`50_delegation_journal_test.sql`・Docker が無い）／本番での A/B 実測（トークンが無い）／`delegation_overview` の実行（RPC は migration が本番に入るまで無い）。

## 5. 次の人のための事実（まだ無いもの）

- サーバ側の実行者と記録の永続化（再開の土台は入ったが、保存して別の実行者へ渡す経路が無い）。
- **モデルの子が道具を使う**こと。能力の仕事は読み取り専用の能力（`data.gis` を含む）を直接走らせるが、子のモデルが自分で道具を選んで連鎖する経路は無い。
- 親の 1 ターンの手数（12 回）。委譲あり・なしの実測のあとに直す。
- `@ref` の経路で GIS を連鎖できることは**評価の問いではまだ測っていない**（検査はスタブの能力で通している）。
