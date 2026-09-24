---
title: Atlas の 1 手は末尾から黙って切られていた——入力を item の列に、道具を provider 標準の関数にした
date: 2026-09-25
---

〈#R802 の本番評価の続き。46 問のうち 23 ターンが作業の上限に達していた原因を、判断ではなく**伝送**から読んだ〉

### 0. 実測

| 何 | 実測 |
|---|---|
| 1 手の入力 | `js/atlas-console.js` `_agentPrompt` が **1 本の文字列**に積む: 地図状態 → 固定地点 → 文脈 → 地名台帳 → 直近 48 行の会話 → `[REQUEST]` → `[THIS TURN SO FAR]`（このターンの呼び出しと結果の JSON 全文） |
| ai-proxy | `String(payload.prompt).slice(0, MAX_PROMPT)`＝**先頭 24,000 文字**。切ったことは誰にも返さない |
| `find_capability` 1 回の結果 | 本物のレジストリ＋本物の説明文で 20 問: **中央値 10,441・最大 39,235 文字**（2026-09-25） |
| ⇒ 切られるもの | **末尾**＝このターンの道具の結果。会話が長ければ `[REQUEST]` そのもの |
| 呼び出しの運び方 | JSON 封筒 `{turn, tool_calls[{name, arguments_json}], answer_mode, final_text}` を強制。1 手＝全文 1 メッセージの往復（`store:false`） |
| #R723 | 57 秒のターンのうち 43 秒がモデルの往復、道具の実行は 13.6 秒 |

one-pass 規則 §2 の原因 ②「結果が次の手を決めるモデルに届いていない」を、**伝送が**作っていた。
Atlas は結果を見ずに次の手を選んでいたので、同じ呼び出しを繰り返すのは判断の誤りではなく、見えていなかったから。

### 1. 直したもの

- **入力は item の列**（`js/atlas-agent.js` `composeInput`）: 会話履歴（発話と答えを別 item）→ 添付の置き場 →
  依頼（依頼が届いた時点の状態・文脈＋`[REQUEST]`。**ターン中は不変**）→ このターンの `function_call` /
  `function_call_output`（provider の暗号化 reasoning も再送）→ 末尾に手ごとに変わるもの。
  system・道具の一覧・依頼がターン中 1 バイトも変わらないので、**各手は前の手に足すだけ**になり prompt cache が効く
  （`prompt_cache_key` は system＋道具のハッシュ。読者を名指さない）。`store:false` は維持。
- **予算は item 単位**（`INPUT_BUDGET` 240,000／1 item 48,000）。古い会話から丸ごと落とし、1 つの item が
  そう述べる。まだ超えたらこのターンの**古い**結果だけ短くする。**依頼と最新の手の結果は落とさない**。
  1 件が大きすぎれば item の中で切り、大きさと `read_result`（ループが持つ道具。切った手にだけ提示）を柵の外に書く。
- **道具は provider の関数**。ai-proxy に protocol 2（`input` / `tools` / `toolChoice`）を足し、OpenAI は
  Responses の function tools、Anthropic は `tool_use`/`tool_result`、Gemini は `functionCall`/`functionResponse`
  （`thoughtSignature` を item で持ち回る）へ変換する。書く文は `FINAL_SCHEMA`（`TURN_SCHEMA` から導出）で、
  `turn` / `answer_mode` の宣言と門はそのまま。
- **サーバの柵**（`MAX_INPUT_CHARS` 480,000・`MAX_ITEM_CHARS` 96,000＝クライアントの 2 倍）は最後の線で、
  切ったら item の中と `meta.inputTrimmed` で述べる。1 本の文字列の要求の prompt / system の切り詰めも同じ欄で返す。
  ループは `trace.inputTrims` に記録し、`IntMapAtlasDebug.lastPlan().inputTrims` で見える。
- **1 手の呼び出しには全部に結果を返す**。`maxPerStep` を超えた分は `.slice` で黙って消えていた——関数呼び出しに
  出力が無いと provider が拒むので、`step_call_limit` として返す。
- **1 手の中の呼び出しは順に実行したまま**（並列化しない）。地図の状態を変える道具どうしは順序が意味を持ち、
  `_runOne` は 1 本の返信へ結果を積んで末尾を読む。待ちの大半はモデルの往復で、それは上の 2 つで減らす。
- **互換**: ai-proxy は 1 本の文字列の要求も受ける（古いページのキャッシュ）。ページは protocol 2 を話さない proxy を
  **応答で**見分け（`meta.protocol` が無い／`empty` で拒まれた）、そのセッションは同じ item を `legacyPrompt` で
  畳んだ文字列と envelope で話す。消せる条件は DECISIONS.md に書いた。
- ヘッダの `AI_MODEL=gpt-5.6-sol` を実体（`OPENAI_DEFAULT_MODEL` = terra、secret が定数に勝つ）に合わせ、
  呼び出し箇所の古い註（「Sol が既定・Terra がフォールバック」）も書き直した。

### 2. 書き換えた既存の検査（守っていた欠陥はそのまま守る）

- `tests/r801` B①〜④: `_agentPrompt` を持ち上げて評価していた → `_agentCtx`/`_agentInput` を持ち上げ、**item と
  畳んだ文字列の両方**で「結果は依頼の後・柵の中」「柵は中から閉じられない」を測る。
- `tests/r413` ⑨: 「記録は切られずに届く」を 1 行の綴りで見ていた → `composeInput` を**走らせて**、2 万字の結果が
  丸ごと届き、予算を超える結果は `read_result` を名指して切られることを測る。
- `tests/r285` (8): SYS の大きさを 1 形で測っていた → 関数形と envelope 形の**大きい方**で測る。
- `tests/r493` ②e・`tests/r722` ④: 呼び出しの綴りの追従（性質は同じ）。
- `tests/r783-attach-recall.spec.js`: ai-proxy の役を protocol 2 で答えさせ、本文を item からも読む。

### 3. 検査

`tests/atlas-native-tools-checks.test.mjs`（10 件）——①巨大な履歴と 39k の探索 6 回でも、このターンの結果は
入力から落ちない（同じ内容を 24,000 で切ると落ちることも同じ fixture で再現）②前置きのバイト列がステップ間で同一
③切ったら必ず述べ、`read_result` で全文に戻る／古い会話は古い順に落ち 1 item がそう言う／古い結果だけが縮む
④全呼び出しに出力 ⑤サーバの柵は予算の 2 倍で、依頼と呼び出しを守り、切ったら返す（`normalizeTurn` を esbuild で
剥がして**評価**）⑥provider の item から読む ⑦ヘッダのモデル名＝定数。

### 4. 残したもの

- `js/ai-core.js` の 3 か所（`aiCallServerFull` が `protocol`/`input`/`tools`/`toolChoice` を転送する（`opts.protocol===2` のときだけ）・
  応答の `output` を返す・エラーに `code` を載せる）も同じ回で入れた——**入らなければページは protocol 2 を送れない**。
- `find_capability` は語彙と意味を融合した検索（`CAPS.searchFused`・意味検索の回で入った）を使う。意味検索を引けなかったときの 0 件は
  「語彙だけで探して無かった」とモデルに述べ、「言い換えても見つからない」とは言わない（`js/atlas-toolsurface.js` `find()`）。
- 本番での実測（キャッシュ命中率・1 手の所要時間・関数呼び出しの 400 の有無）は deploy 後。
- Gemini / Anthropic の変換は API の文書から書いた。この回はどちらも休眠中で、本物の往復は取っていない。
