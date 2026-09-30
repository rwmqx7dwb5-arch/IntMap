---
title: Atlas のターン機構——「観測できなかった」を一級の status に、1 手の呼び出しを衝突しない組は同時に、find_capability が見つけた能力を次の手から道具に、ページの値を道具の宣言から入力へ
date: 2026-09-30
---

〈依頼〉 Atlas のターン機構の構造改革（監査の実測 4 点）。上限は 1 つも下げていない・能力は 1 本も削っていない・
find_capability / run_capability は残した。

## 0. 監査の実測（着手時）

- 146 能力のうち型付きの道具は 13 本（`js/atlas-toolsurface.js` の CORE 11 ＋ find / run）。残り 133 は
  `find_capability` → `run_capability` の 2 段で、`scripts/atlas-eval/questions.json` の rail-tokyo-osaka は
  **find_capability 8 回・操作 0・`step_budget`**。
- 1 手の呼び出しは 1 本ずつ直列（`js/atlas-agent.js` の `await runTool(call)`）。6 操作のターン 57.2 秒のうち
  操作は 13.6 秒。実行器には `conflictKeys` による直列化の下地があった（`js/atlas-executor.js` の `acquire`）。
- 「観測できなかった」は status ではなく `partial` ＋ code `not_rendering`。`partial` は `doneCalls` に入らない
  ので、**観測できなかっただけの成功が再実行されうる**（one-pass §4 の 3 問目に違反）。
- 道具一覧は「layer enum is live app state」として毎ターン作り直され、`prompt_cache_key`＝sha256(system＋tools)
  が状態変化のたびに変わっていた。
- `js/atlas-agent.js` の予算の説明は「TURN_MAX_CALLS = 6」と書いていたが、ai-proxy は 12。

## 1. `unobserved`（`js/atlas-results.js`・`js/atlas-capabilities.js`・`js/atlas-agent.js`）

status を 8 つにした（`completed / running / needs_input / partial / unobserved / failed / cancelled / superseded`）。
`ok` は今までどおり `completed` の導出なので、`unobserved` の `ok` は false——**誰も見ていない効果は主張しない**。
観測器の「確認できなかった」経路を移した: 全能力に効く `unobservedOr`（レンダラが `observable:false`）、カメラの
`_camDrew === false`、pandemic 観測器の「描画面が読めない」（この行は「unobserved として報告する」と註に書きながら
`completed` を返していた——言う手段が無かった）。

ループは `unobserved` を `doneCalls` に**済んだもの**として入れ、同じ `callKey` の 2 回目は実行せず、
「このターンで既に実行した・効果は観測できなかった・同じ呼びでは観測は良くならない」と述べて最初の結果を返す。
最初の結果にも同じ事実を注記する。`failedCalls` / `permanentFails` には入れない（失敗ではない）。
`partial` は今までどおり再実行できる（借りが残っている）。実行器のライフサイクル・進行表示（`warn`）・
`map.undo` の「触れなかった効果」の数え上げ（`unobserved` も実行はしている）に同じ語を足した。

## 2. 1 手の呼び出しを、衝突しない組は同時に（`js/atlas-agent.js`・`js/atlas-toolsurface.js`・`js/atlas-console.js`）

各呼び出しは、同じ返信の**より前の**呼び出しのうち衝突するものだけを待つ。衝突は道具の面の `footprintOf` が
能力表の競合キー（実行器のロックと同じ値）から述べる:

| 足跡 | 何か | 何を待つ |
|---|---|---|
| `pure` | アプリに触れない（`find_capability`・知らない id の run・`read_result`） | 何も |
| `barrier` | 1 段のキー（`camera`・`time`・`navigation`）、`*.all` / `*.any`、ターンを終える能力、置けない呼び | 前後の全部 |
| 読む（書き込み無し） | 読む範囲は未申告＝アプリ全体 | 前の書き込み |
| 書く | 競合キー | キーが段単位で重なるもの |

実レジストリ 146 件の内訳（実測）: barrier 21・書く 105・読む 20。同一呼びの 2 回目は 1 回目を待ってその答えを返す。
予算は走らせる前に呼んだ順で割り当て、`turn_ended` / 時間切れは今までどおり予算を返す。**モデルが読む順と
`results` の順は呼んだ順のまま**。`footprint` を渡さない呼び出し元は全部 barrier＝従来の直列。

⚠ **競合キーだけでは足りなかった。** キーは「何を書くか」しか言わないので、`set_time(1914)` と
`highlight(Serbia)` は重ならない——が、ハイライトはその瞬間の国境で読まれる。1 段のキー（節全体）を barrier に
したのはそのため。読む側（`look_at_map` など）も読む範囲を申告していないので、前の書き込みを待たせた。
能力表が `effects.reads` を申告すればそれで狭まる（今日申告している行は 0）。

⚠ **コンソール側の取り違え。** `_runOne` は自分の結果を `ai.__atlResults` の**最後の要素**として読んでいた——
同時に 1 本しか走らない間だけ正しい。行動オブジェクトの同一性で探すようにした。

実測（台本のモデル・各操作 100 ms の偽 dispatch）: `highlight, drawLine, research, find_capability, set_time,
highlight` の 1 手で直列合計 565 ms → 待った時間 446 ms・最大同時 3。読むだけの呼びどうし（find × n・research × n）は
全部同時。各手の `trace.stepTiming` に `serialMs` / `wallMs` / `concurrent` を残す（本番の効果はここで読める）。

## 3. 昇格（`js/atlas-toolsurface.js` の `promotionsOf`・`js/atlas-agent.js` の `promoted`）

`find_capability` の結果に載った能力（CORE に既にあるものを除く）を、次の手から型付きの道具として宣言する。
道具名は id の `.` を `_` に（`routing.route` → `routing_route`）。実行は定義の `route` で **`run_capability` に
変換**する——同じ 2 度目の schema 検査・同じ dispatch・同じ `callKey`（昇格名と run_capability の同じ呼びは
1 つの呼び出し）。見つけた結果には `promotedTools` と `promotionNote` を載せる。find / run は残した。

実測: 「東京から大阪までの鉄道経路」は字句検索で 10 件（全部昇格・宣言 5,207 字）、「rail route from Tokyo to
Osaka」は 2 件（1,325 字）。固定の 13 本は 11,326 字。1 回の宣言は ai-proxy の `MAX_FN_TOOLS`（64）まで
（`maxOfferedTools`。検査が照合）で、超える分は昇格せず結果が「`run_capability` で届く」と名指す。

### キャッシュを壊さない配置（選んだ設計と理由）

- **固定の接頭部＋追記**: 固定の道具は毎ターン同じ並び・同じバイト。昇格はその**後ろに、昇格した順に追記**し、
  ターン中は外さない・並べ替えない。provider は宣言を先頭から比べてキャッシュするので、追記の前は同じ。
- **鍵は固定の部分から**: 昇格した定義は `promoted:true` を持ち、ai-proxy の `cacheBasis` はそれを除いた
  system＋道具をハッシュする（昇格が無ければ以前とバイト一致の文字列）。鍵（キャッシュの経路づけ）が昇格の
  たびに変わると、先頭が同じでも別の経路へ送られる。
- **Anthropic**: 昇格があるとき、固定の道具の末尾にも `cache_control` を付ける（`withPromptCache` が付ける
  最後の道具・system と合わせて 3 個。上限 4）。昇格が最後の道具の印を動かしても固定の先頭は命中する。
- **ページの値は入力へ**: `set_layer` の `name.enum`（実在するレイヤー名）を宣言から外した。`liveEnum` が値を
  道具の `check`（`reject` が検証に使う・送らない）に置き、同じ値を依頼 item に `[LIVE VALUES]` として載せる。
  間違った名前は今までどおり型付きで、有効な名前を並べて返る。
- 退けた案: 146 本を常に全部宣言する（宣言が約 3 倍になり、`MAX_FN_TOOLS` 64 を超える）／OpenAI の
  `allowed_tools` で全宣言を固定して絞る（同じく全宣言が前提で、Anthropic・Gemini に同等が無い）。

⚠ **推測で言っていないこと**: provider が関数宣言を instructions の前後どちらに置くかは測っていない。
追記の設計はどちらでも「追記の前は同じ」を保つ。命中率そのものは台帳の `cached_read_tokens` で本番で読む。

## 4. 予算の説明（`js/atlas-agent.js`）

「= 6」を消し、正本（ai-proxy の `TURN_MAX_CALLS`）を指す文にした。値は変えていない（`maxSteps` 8）。
検査が proxy の数を読み、`maxSteps + 1`（強制の回答）がその下に余白を残すことを確かめる。

## 5. 検査

`tests/atlas-turn-engine-checks.test.mjs`（25 本）。**HEAD のコードに対して走らせると 12 本が赤**（④⑤は
`cacheBasis` が無いのでモジュール読み込みで落ちる）、残り 7 本は変わってはならない挙動（`partial` の再実行・
重なるキーの直列・質問でターンが終わる・足跡無しの直列など）。既存の 2 本（`atlas-pandemic-checks` R754 ⑦、
`atlas-observer-undo-checks` ⑤）は旧い綴り（`partial` / `completed`）を固定していたので新しい status に直し、
後者には「`not_rendering` を言うなら status は `unobserved`」を足した。

## 6. 残り

- `check:capabilities` の nine-languages が、新しい文 `atlas.result.unobserved`（en＋jp のみ）の inline 訳を
  ui.zh / ui.zh-hans / ui.fr / ui.ko に要求して赤い。
- 同時に走った呼びの**カード**は、返信の中で完了順に並ぶ（`_atlCompose` が `ai.__atlResults` の順に描く）。
  モデルが読む順・`results` の順は呼んだ順。
- ai-proxy を変えたので配備が要る（`cacheBasis`・Anthropic の印・`promoted` の受け取り）。旧い proxy でも
  動く（`promoted` は無視され、鍵が昇格のたびに変わるだけ）。
