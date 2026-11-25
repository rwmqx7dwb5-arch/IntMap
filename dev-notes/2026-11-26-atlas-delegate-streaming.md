---
title: 遅い子 1 体が親を止めない（wait:"any"）・子が切られた結果を読み直せる（read_step）・子ごとの推論強度・並列数がプロバイダに追従する
date: 2026-11-26
newsen: Atlas can now start working with the first worker's findings while slower ones finish, workers can re-read answers that were cut, each worker can be told how hard to think, and the number of workers in flight follows what the provider answers.
newsjp: Atlas は最初に返った子の結果を使い始められ（残りは裏で継続）、子は切られた結果を読み直せ、子ごとに推論強度を指定でき、同時に動かす子の数はプロバイダの応答に追従するようになりました。
---

〈依頼〉外部の「Atlas オーケストレーション技術監査」（2026-11-26・commit c4a2ba34 時点）の ③親子 AI 間の同期ボトルネック・⑥子への情報伝達の欠落・
⑧推論強度とモデル選択・⑨並列数と費用の動的制御・§4 DAG 実行のターン全体への拡張を、現行 main で再確認して直す。

## 0. 各主張を現行 main で測った結果

| 主張 | 現行 main | 扱い |
|---|---|---|
| ③ 子の結果を `Promise.all()` で一括して返す | **事実**。`research.delegate` は全子が終わるまで 1 回のツール呼び出しとして戻らず、遅い 1 体が全体を止めていた（`run()` も `Promise.all`）。子の内部でも 1 リクエスト内の能力呼び出しは `Promise.all` | 直した（§1） |
| ⑥ 子向けの結果が `s(text,3000)`・`s(JSON(meta),1500)` で切られ、再読手段が無い | **事実**。親には `read_result` があるが子には無かった | 直した（§2） |
| ⑧ 子ごとの推論強度 | **無かった**。子ごとの `model` はあったが `effort` は契約に無く、親だけが `next_effort` を持っていた | 直した（§3）。モデル選択は既存（`model`＋ policy.models に価格つき）で足りるので触らない |
| ⑨ 並列数が固定上限 | 部分的に事実。`maxConcurrent` はサーバが述べた固定数か null（無制限）で、プロバイダが絞ってきても動かなかった | 直した（§4）。**残高・費用に連動する幅は未実装**（§6） |
| §4 DAG をターン全体へ | **既に在った**。1 返信内の呼び出しは衝突する相手だけを待って並列に走り（#R723・`atlas-agent.js` の `deps`/`conflicts`）、`research.delegate` の中は依存・前方参照・循環検出つき DAG（`cycleMembers`）。依存のある手は前提が揃った時点で始まる | **古い主張。直さず記録**。足りなかったのは「ツール呼び出しが全子を待つ」ことだけで、それが §1 |
| 3 か国の独立調査で親が自分で順に検索 | 親のモデルの挙動で、構造の欠陥ではない（`research.delegate` の説明は並列化を勧めている）。場当たりの誘導は足さない | 触らない |

## 1. 遅い 1 体が全体を止めない

- `makeDelegation().begin(contracts, opts)` を足した（`run()` は `begin().all`＝従来どおり）。`settled()`（その時点までに終わった結果・未了は null）・
  `firstUsable`（done/partial が 1 つ出た、または全部が終わった）・`all`。
- `research.delegate` に `wait: "any" | "all"`（既定 all＝従来）。`any` なら最初の所見が出た時点で戻り、未了は `running` として名指しし
  `meta.pending` に ID を載せる。**何を待つかはモデルの選択**で、コードは決めない。
- 続きは「同じ仕事の一覧をもう一度呼ぶ」だけ。実行中の一覧は `liveRuns`（`delegationKey` 単位）に残り、同じターンの再呼び出しは**新しく始めず
  そこへ繋がる**（二重実行・二重課金なし）。各子の費用は 2 回の応答のどちらか一方でだけ `delegatedCostUsd` に入る（台帳の二重計上を避ける）。
  別のターンが委譲を始めたとき、前のターンの残りは取り消す（待つ者がいない）。
- 検証つき（`verify:true`）の検査役は全部が終わった呼び出しで結果に載る（`any` の早期返却では載せない）。

プロバイダの非同期ツール呼び出し（OpenAI の `async: true` 相当）は**公式仕様をまだ確かめていない**——今回は実装せず、未了。

## 2. 子が切られた結果を読み直せる

子の能力呼び出し結果は、本文 3000＋データ 1500 の合計 4500 字までを見せ（`SHOW_CHARS`）、**全文を参照 ID（ステップ番号）で保持**。切れたときは
「characters 0-4500 of N … `{"capability":"read_step","args":{"ref":"…","offset":4500}}`」と読み方を述べる。`read_step` は参照・offset・length（1 回 12000 字まで・
`READ_CHARS`）で全文を返し、続きがあればその呼び方も付ける。許可（grant）の外でも使え、何も消さず、同じ呼び出しの再実行は既存の
`answered` で「もう済んでいる」と返る。

## 3. 子ごとの推論強度

契約に `effort`（low/medium/high/xhigh。それ以外の語は「指定なし」）。ワーカーの要求に `effortHint` として載り（`ai-proxy` の `atlas_delegate` は
元から `effortHint: true`）、`contractKey` と `requestKey` に含まれるので、強度の違う同じ goal は別の仕事として扱われる。`atlas-job-core.js` を変えたので
`supabase/functions/_shared/` の写しを同期した。何が低くてよく何が高く要るかは Atlas が決める（固定の分類経路は作っていない）。

## 4. 並列数はプロバイダに追従する

`ceiling` は初期値＝サーバが述べた `maxConcurrent`（null＝無制限）。**観測された**失敗（`provider_unavailable`・`rate_limited`・`timeout`・HTTP 429/5xx）で半分に
（下限 1）、所見が返るたびに 1 つ戻す（サーバが述べた値まで。述べていなければ全タスクを覆うまで）。総数は縛らず、遅れて走るだけ。幅の変化は
`delegation.width` イベントとしてログに残る。新しい定数は「半分」「1 つ戻す」の AIMD の標準形のみで、観測・失効条件はコードのコメントに書いた。

## 5. 検査

`tests/atlas-delegate-streaming-checks.test.mjs`（7 件）: begin の早期読取・run の互換・幅の縮小と回復と上限・effort の伝達と別要求化・
read_step で切れた末尾に届く・`wait:"any"` と再呼び出しで一度だけ払う。既存の委譲系 95 件も緑。

## 6. 未了（隠さず記録）

- 費用・残高に連動する幅（`TURN_COST_CAP_USD` はサーバの柵で、ページに残額が来ていない。ページへ残額を渡す経路が先に要る）。
- プロバイダの非同期ツール呼び出しの公式仕様の確認。
- 3 か国の独立調査の前後の所要時間・費用の本番実測（デプロイ後に実施し、この記録に追記する）。
