---
title: Atlas の実行から固定回数・時計を外し、進展と費用で止める／止まったターンに回答を無理に書かせない／途中の文を残す
date: 2026-11-24
pr: 1390
newsen: Atlas no longer stops after a fixed number of steps: it keeps working while it makes progress, keeps the sentences it wrote along the way, and when it does stop says why in one line with a Continue button.
newsjp: Atlas は決まった手数で打ち切られなくなりました。進んでいる間は作業を続け、途中で書いた文は残り、止まったときは理由を 1 行で述べて「続ける」で再開できます。
---

〈依頼〉外部の監査 2 本（実行制限の監査・Atlas の実行環境の評価）を、開発者アカウントの件を除いて全部。利用者の決定（質問機能で確認・2026-11-24）:
固定回数は全利用者について撤廃／1 人 1 日の支出をドルで上限／600 秒の時計はおまかせ（「途中の回答が終了時に消える」「無理と分かっている回答を無理に書かせるのは無駄」「本文以外の注意書きが多い」）／夜間評価は凍結のまま。

## 0. 測った（全数調査）

実行の天井は 3 層にあった。ブラウザのループ（`maxSteps` 8・`maxToolCalls` 32・`maxPerStep` 8・`maxOutputGate` 2・`turnBudgetMs` 600 s）、
サーバの許可（`TURN_MAX_CALLS` 12・子 2 体×各 8 回・鍵の寿命 900 s を**開始から**数える・出力 2,600〜5,000 トークン固定）、
委譲（`TOOLS_MAX` 12 で 13 個目以降の許可能力を黙って捨てる・`JOB_MAX_TASKS` 8・子は全部同時に起動）。テストは `maxSteps === 8` のように**数そのもの**を固定していた。
費用の柵は既にあった（1 依頼の家族 $3）。ターンから永続ジョブへの引き渡しは無い（ブラウザに `atlas-jobs` を呼ぶコードは 0 件）。

## 1. 止め方を事実に置き換えた（`js/atlas-agent.js`）

- 既定の `maxSteps`・`maxToolCalls`・`maxPerStep`・`maxOutputGate` は `Infinity`、`turnBudgetMs` は 0。呼び出し元が `opts.limits` で渡したときだけ効く（node の検査と子のループが使う）。
- 止まるのは: 答えた・訊いた・停止／**進展なし**（答え済みの同じ呼び出しが続く `repeated_calls`・却下だけの手 `malformed_limit`・同じ返答が同じ矛盾で戻る差し戻し＝`lastBounce`）／
  **費用**（サーバが `turn_cost`・`day_cost`・`provider_quota` で断る → `stopped:'budget'`、新しく `CUT_STOPS` に入れた）。
- 時計を外せた理由: 1 手は自分で有界（道具は `toolTimeoutMs`、モデル呼び出しはサーバの provider budget）なので、ターンは掛かり続けられない。
- **止まったターンに回答を書かせない。** #R802 の「打ち切ったら最後に 1 回回答を書かせる」呼び出しを外した。止まる理由が「進展なし」か「費用」になった以上、もう 1 回の呼び出しで前の手ができなかったことはできない（利用者の指摘どおりの無駄）。答え終えたのに文が空だったときの 1 回（#R742）は残す。
- 途中の文（呼び出しを伴った手・`continuing` の手の文）を `interim` として順に返す。止まったターンでは途中の文を答えの位置へ繰り上げない。
- Atlas が次の返答に要るものを申告できる: `next_effort`（low〜xhigh）と `next_output_tokens`。どちらも任意。返答スキーマの並びは「何であるか → 何をするか → 次に要るもの → 文」。

## 2. サーバ（`supabase/functions/ai-proxy`・`_shared`・migration `20261127120000_atlas_unbounded_turns.sql`）

- `TURN_MAX_CALLS` を削除（`openTurn` に `maxCalls: null`）。子の数・回数の既定も `null`（運用者が環境変数で数を入れたときだけ縛る）。`ATLAS_DELEGATION_CONCURRENCY` で同時実行数だけを別に決められる。
- 鍵の寿命を**無操作の時間**にした（`ai_turns.active_at`・`ai_turn_spend.active_at`。子の呼び出しは親も生かす）。働き続けるターンが 900 秒で切れて二重課金されることが無くなった。
- **1 アカウント 1 日のドル上限**を新設: `plans.js` の `aiUsdPerDay`（1 日の質問数 × $1。free $10 は記録上最も高かったターン $0.61 の 16 倍）、`AI_DAY_USD_SCALE` で倍率を変える、表 `ai_spend_day`、409 `day_cost`。開発者は従来どおり台帳の対象外。
  回数を外すと 1 人の長い依頼が全体の 1 日量を他人の分まで使えるようになる——それを数でなくお金で塞ぐのが目的。
- 出力量: `atlas_turn`・`atlas_delegate` は `outputHint`。モデルの公表上限（`MODEL_MAX_OUTPUT_TOKENS`、各社の公式ページを 2026-11-24 に確認）まで上げる。
  申告が大きすぎて予約（出力の 2 倍で見積もる）が柵を超えるときは、柵の残りに収まる量で 1 回だけ取り直す（`meta.maxOutputFitted`）。
- 推論の強さは元から呼び出しごとに読まれていた（`ask.ts`）。ページ側で「自動」のときだけ Atlas の申告を使う（利用者が手動で選んだ強さは上書きしない）。

## 3. 委譲（`js/atlas-delegate.js`・`js/atlas-cap-research.js`・`js/atlas-job-core.js`）

- 子の数・子 1 体の回数に既定の数は無い。子は成果物を返すまで働き、止まるのは: 同じ不正な出力が 2 回続く／一過性の失敗のあとの別の頼み方（Web なし・短く）を使い切る／答え済みの同じ能力呼び出しが 2 手続く／費用の柵。
- 待ち行列: `maxConcurrent` が数のときはその数ずつ（入力待ちの仕事は枠を取らない・停止で待機中も取り消す）。`null` は従来どおり全部同時。
- 形式上の削除: `TOOLS_MAX`（13 個目以降を黙って捨てていた）と `JOB_MAX_TASKS`（ジョブは自分の $1 の柵で止まる）。
  #1359（実行基盤の統合）が同じ箇所に capability タスクの説明を足したので、その説明は残し `JOB_MAX_TASKS` だけ外した。#1359 の migration 2 本（`atlas_job_tasks`・`atlas_job_resume`）とこの回の migration は同じ関数を定義しない。

## 4. 吹き出し（`js/atlas-console.js`・`js/atlas-live.js`・`js/atlas-policy.js`）

- 途中の文は終了時に消さず、答えの上に控えめな文字で残す（同じ文・答えと同じ文は繰り返さない）。
- 打ち切りの注記は原因別の 1 行（費用の上限／先へ進めなくなった／作業の上限）＋「続ける」ボタン。手書きの `__atlCut` は `AGENT.CUT_STOPS` を読むようにした（二重の正本の解消）。
- 注意書きを減らした: 「道具は動いたが回答を書けなかった」の長文を 1 句に（止まったターンでは出さない）、未達の目標が「地図」と誤表示されていたのを目標の中身で出すよう修正。
  モデルへの方針（`atlas-policy.js`）は「まず答える。限界は信頼できる範囲を変えるときだけ 1 句。断り書き・道具の経緯の説明・不要な申し出をしない」（人格 `atlas-persona.js` は触っていない）。
- 翻訳の帳簿: 言い換えた旧文言 2 つの訳（fr・ko・zh・zh-hans の 6 行）は表示される文が無くなったので消し、床を合わせた（形式上の削除。新しい文は en+jp）。

## 5. 評価系

- 評価の実行器の待ち時間は製品の時計に依存していた（`turnBudgetMs + 2×toolTimeoutMs`）。時計が無くなったので実行器自身の待ち時間 `HARNESS_PATIENCE_MIN`（60 分・測った最長ターン 634 s の約 5.7 倍）を持たせた。夜間評価は凍結のまま（利用者の判断）。
- 録画（カセット）4 本は旧来の「8 手で打ち切って回答を書かせる」挙動の記録だったので、新しい挙動で録り直した（期待される判定は同じ）。

## 6. やらなかったこと（理由）

- 開発者アカウントの件（利用者の指示で除外）。夜間評価の復旧（凍結のまま）。
- ジョブの同時実行の「拒否 → 待ち行列」（利用者 2・全体 20 は `atlas_job_create` が拒否で数える）: 作業中は開いていた PR #1359・#1328・#1317 が同じファイル（`atlas-jobs`・runner・`atlas-jobs-client`）を書き換えていたので触らなかった。その後 #1359 が Atlas からジョブを始める能力（`js/atlas-cap-jobs.js`）を main に入れたので、ターンから永続ジョブへ渡す経路は Atlas の判断で使える。この回の「止まったら続きから」は「続ける」ボタンと次のターンの履歴（未達の記録）。
- 入力の予算（24 万字）: 既に古い結果の圧縮と `read_result` での読み直しがあり、捨てずに言う設計なのでそのまま。

## 7. 検査

`tests/atlas-unbounded-execution-checks.test.mjs`（性質だけを測る: 20 手の作業が切られない・1 返信の全呼び出しが走る・時計が何時間でも終わる・進展なしで止まる・止まったターンに回答を書かせない・費用の拒否で `budget`・差し戻しは返答が動く間だけ・申告が次の呼び出しに届く・呼び出し元の上限は効く・既定は何も縛らない）、
`tests/delegate-unbounded-checks.test.mjs`、pgTAP `supabase/tests/54_atlas_unbounded_turns_test.sql`。数を固定していた既存の検査は性質の検査に書き換えた。


## 8. 起動費用（`check:perf`）

天井は変えていない。作業中、main 自体が起動時 gzip・`atlas-console`・非同期合計で天井を超えていた（`origin/main` を別の作業場でビルドして実測）が、その後 main 側で天井が上がり（#1359 で `atlas-console` は 1384 kB）、この PR を載せた木でも天井の内に収まる。
この PR 自身の増分は起動時 raw +0.7 kB・`atlas-console` +3.3 kB・非同期合計 +3.4 kB（打ち切りの注記と「続ける」ボタン、途中の文の表示、子の待ち行列、出力量の申告）。
