---
title: ai-proxy を仕事ごとのモジュールに分けた——index.ts は経路の表だけ、タスクは 1 ファイル＋登録 1 行。分割前の 67 要求の写真と 1 バイト違わない
date: 2026-10-03
---

〈依頼〉基幹の構造改革（「基幹や根幹もいじってよい」）。`supabase/functions/ai-proxy/index.ts`（2,327 行・1 ファイル）を
仕事ごとのモジュールに分け、index.ts はルーティングだけにする。新しいタスクを 1 つ足すのが「ファイル 1 本＋登録 1 行」で
済む骨格に。**挙動は 1 バイトも変えない純粋な移動**（応答・ヘッダ・エラー文言・上限を維持）。
`js/atlas-console.js` の分割は別作業が触るので対象外。

## 0. 測った（着手前）

| 何 | 着手前 | 意味 |
|---|---|---|
| index.ts | 2,327 行。`Deno.serve` の本体が 600 行で、残りは定数・型・提供元 3 社の呼び出し・モデル一覧・再受信 | 「経路」は OPTIONS と POST の 2 本しか無く、あとは全部 1 本の要求の手順 |
| タスクの定義 | `TASKS`・`TASK_MAX_OUTPUT`・`TASK_REASONING`・`JSON_TASKS` の 4 表＋本体の `task === "…"` が 9 か所（開発者の指定の無視・レーン・プロトコル 2・採点者・JSON・schema・推論の上げ・答えの検査・件数で伸びる上限） | タスクを 1 つ足すと 5 か所以上を直す。表の 1 つにだけ足すと、誰も選んでいない既定値で走る |
| index.ts を読む検査 | 28 本（`tests/` で `ai-proxy/index` を grep）。うち 2 本は**評価**（node が index.ts を import して `Deno.serve` を捕まえる）、2 本は**目印の間を切り取って** esbuild で型を剥がして実行、残りは綴りの照合 | 分けた瞬間に「その文字列は index.ts に無い」で赤くなる——関数の事実は変わっていないのに |
| index.ts だけを読む読み手（テスト以外） | `scripts/doc-facts.mjs` §27（relay-guard を共有する関数の数）・`tests/helpers/fn-cors.js`（各関数の CORS 契約。prod-smoke と r333 が使う） | 分けると「ai-proxy は relay-guard を使わない」「CORS 契約が読めない」と述べる。**関数の中身ではなく入口のファイルを読んでいた** |
| node は .ts を import できるか | Node 24.18 は型を剥がして実行する（既存の評価検査がそれで動いている）。`.ts` を名指す import も通る | 分けたモジュールは**切り取らずに import して実行できる** |

## 1. 何をしたか

**新しい構成（`supabase/functions/ai-proxy/`、`_shared/` には何も足していない——使うのは ai-proxy だけなので、配備は ai-proxy 1 本で済む）:**

| ファイル | 行 | 中身 |
|---|---|---|
| `index.ts` | 126 | 冒頭の説明（そのまま）＋ `ROUTES`（preflight / ask）＋ 最後の砦の catch。**追記するのは 1 項目**、各 `match` は互いに排他なので順序が何も決めない |
| `ask.ts` | 637 | 旧 `Deno.serve` の本体をそのまま。タスクで違うところは `spec`（そのタスクの記録）を読む |
| `tasks/<task>.ts` ×14 | 8〜116 | そのタスクの出力上限・推論・JSON・サーバ所有の schema・答えの検査・レーン・プロトコル 2・採点者。注記も表から各ファイルへ移した |
| `tasks/all.ts` | 16 | **登録簿。1 タスク 1 行**（`export { default as x } from "./x.ts"`） |
| `tasks/spec.ts` / `tasks/index.ts` | 76 / 9 | `TaskSpec`・`defineTask`（既定値）・`maxOutputFor`、`TASKS`（`Map`。all.ts から導く。手で並べない） |
| `config.ts` | 269 | 上限・天井・`cors`/`json`・`SPEND`（index.ts が再 export） |
| `turn.ts` / `schema.ts` / `media.ts` | 187 / 117 / 58 | プロトコル 2、呼び出し側 schema の上限と OpenAI 方言、添付 |
| `provider-call.ts` | 135 | 唯一の扉 `providerCall`・`ProviderError`・`classifyGemini`・`streamedBody`・`Meter` |
| `providers/{openai,anthropic,gemini}.ts` | 261 / 161 / 186 | 提供元ごとの形。`summaryRefused` は OpenAI の中だけで読み書きされるので openai.ts へ |
| `models.ts` / `replay.ts` | 66 / 64 | 開発者のモデル一覧、再受信の 4 つの扉 |

**移動は機械で行った**（元のファイルを行範囲で切り出し、上位の宣言に `export` を付け、import を足すだけ）。
手で書き換えたのは ask.ts の 12 か所——`task === "…"` と 4 表の参照を `spec.*` に替えたところ——と、
古くなった注記 2 か所（「TASKS below」→ tasks/atlas_plan.ts、TASKS の段落の「この集合は 10 個」）。

**関数を読む読み手を、入口ではなく関数に向けた:** `scripts/lib/function-graph.mjs` が入口から相対 import を辿って
**その関数自身のモジュール**を発見する（一覧を書かない。辿れないファイルは配備されないので読まない——fn-cors の
「幽霊を読まない」規則はそのまま）。`doc-facts` §27・`tests/helpers/fn-cors.js`・新しい `tests/helpers/ai-proxy-source.mjs`
がこれを使う。ai-proxy の源を読む 22 本の検査は 1 行ずつ `aiProxySource()` に替え、**目印の間を切り取っていた
2 本は `turn.ts` を import して実行する形にした**。タスクの綴りを照合していた 8 本の主張は、登録簿を**評価して**
同じ事実を確かめる形にした（例: JSON のタスクの集合・effortHint を受けるタスク・レーンを持つのは gloss だけ・
採点者は atlas_grade だけ）。

## 2. 同等性をどう示したか

`tests/atlas-core-split-checks.test.mjs` ①。`tests/helpers/ai-proxy-contract-run.mjs` が関数を子プロセスで実行し
（`Deno.serve` を捕まえ fetch を差し替える。関数の中身は何も差し替えない）、**9 群 67 要求**について
状態・**全応答ヘッダ**・本文・**関数が出した全要求**（認証・DB の RPC・提供元。URL・メソッド・ヘッダ・本文を順に）を記録する。
`tests/fixtures/atlas-core-split-before.json` は **b7978872（分割前の最後の commit）の index.ts** を一時ディレクトリから
同じ要求で走らせた写真で、分割後はこれと完全一致する。

- 群: 提供元の前の拒否（405/401/400 bad_task・`__proto__`・bad_lane 両方向・empty・empty_turn・413・429 limit/turn_calls/gloss_limit・500・404・503 採点者なし）、OpenAI の答え（web・schema・件数で伸びる上限・構造化の失敗・添付・プロトコル 2）、失敗と梯子（429 の分速と残高切れ・5xx・モデルの後退・400 の梯子・空の再試行・拒否・プロジェクトと新規アカウントの天井）、ストリームと再受信、開発者（モデル一覧・指定の 403・提供元の切替・採点者）、Anthropic、Gemini（MALFORMED の再試行・schema の 400・503 の再試行・日次枠・SAFETY・プロトコル 2）、鍵なし、Supabase URL なし（最後の砦）。
- 写真が空でないこと（200/400/401/405/413/429/500/502/503・ストリーム・3 社への要求がそれぞれ在る）を同じ検査が確かめる。
- **比較が変化を見ること**: `tasks/gloss.ts` の `maxOutput` を 700→701 にすると ① が「answers (openai) #9 answers differently」で赤（確認後に戻した）。
- 時計に依存する値は 2 つだけで、どちらも写真に入れない: Gemini の call_id（`g<時刻>_i` を正規化）と新規アカウントの判定（年齢から `created_at` を作る）。

②〜④: index.ts のコードに task・payload・provider・台帳・`Deno.env` が現れない／ai-proxy/ の全コードファイルが入口から辿れる／
tasks/ のファイルと all.ts の行と各ファイルの `name` が 1 対 1／05-ai.md が並べるタスク名が登録簿と一致。

## 3. 否定された見立て・残したもの

- 「分けたモジュールは `_shared/ai-tasks/*.js` に」という案は採らなかった。`_shared/` を変えると**全関数が再配備の対象**になり
  （`scripts/supabase-deploy.mjs`）、しかも `scripts/shared-roster.mjs` の目録に載る共有部品になる。使うのは ai-proxy だけ。
- 写真は**契約の写真**として残る。今後 ai-proxy の答えを**意図して**変える変更は、その変更を含む ref で撮り直す
  （`node scripts/ai-proxy-photograph.mjs <ref>`。要求の一覧は `tests/helpers/ai-proxy-contract-cases.mjs`）——fixture の差分がその変更の述べる中身になる。
- `js/ai-core.js`・`js/app-body.js`・`js/atlas-answer-contract.js` の注記が今も `ai-proxy/index.ts` の `GLOSS_PLAN_LIMITS` /
  `MAP_REPORT_SCHEMA` を名指す（今は `config.ts` / `tasks/map_report.ts`）。js/ は今回の範囲外なので直していない。

## 4. 配備

**`ai-proxy` の再配備が要る**（`supabase functions deploy ai-proxy --project-ref vpekfwdpurzejrrmacac --use-api`）。
`_shared/` は変えていないので他の関数は要らない。配備後は `scripts/release-state.mjs` で ai-proxy の版が上がったことを見る。
