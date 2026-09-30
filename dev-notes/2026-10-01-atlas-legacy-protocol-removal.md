---
title: Atlas の旧プロトコル（1 本の文字列＋JSON の中の tool_calls）を撤去する——本番で入りえたのは parse できない 200 応答だけで、それを「古いサーバ」と読み違えてセッションごと切り替えていた。伝送を関数呼び出しの 1 本にし、protocol 2 の無い応答は不正な応答として述べ、JSON に書かれた呼び出しは実行せず名前つきで Atlas に返す。provider に送る system は前後で同一のバイト
date: 2026-10-01
---

〈依頼（利用者承認済みの撤去）〉Atlas の旧プロトコル——モデルが JSON の中に `tool_calls` を書く形——を撤去する。
まず本番でどちらが使われているかと、旧経路に入る条件を全数で確定し、ネイティブ経路の退避先として機能して
いて撤去で到達可能な能力が落ちるなら撤去しない（`CONSTITUTION.md` §5）。

## 0. 測った（着手時）

- **旧経路に入る場所は 1 か所だけ**: `js/atlas-console.js` の `_model`。protocol 2 の呼び出しが
  ⑴ code `empty` で投げた、または ⑵ `meta.protocol` 2 の無い応答を返した、のどちらかを**観測したとき**に
  `_aiProto='legacy'` を立て、そのセッションの残りを `legacyPrompt`（item を 1 本に畳んだ文字列）＋
  `SYS()` の legacy 形（道具を JSON で全部書き出した system）＋`TURN_SCHEMA`（`tool_calls[].arguments_json`）で話す。
  provider・モデル・設定・開発者のモデル選択は条件に**入っていない**。`empty` 以外の失敗は全部そのまま投げて
  いたので、**失敗時の退避先でもない**。
- **本番の ai-proxy はどちらも起こさない。** protocol 2 の 1 手には成功時に必ず `meta.protocol: 2` を付ける。
  空の 1 手は `empty_turn`（`empty` ではないと註にある）。OpenAI（Responses の function_call）・Gemini
  （`callGeminiTurn`: functionCall / functionResponse）・Anthropic（`callAnthropicTurn`: tool_use / tool_result）の
  **3 経路すべてがネイティブの関数呼び出しに変換している**——休眠中の claude-haiku に切り替えても protocol 2 で
  動く。`node scripts/release-state.mjs --edge`: **21 本中 21 本が本番と一致**（配備されているのはこのソース）。
- **実際に旧経路へ入りえたのは 1 つだけ**: `js/ai-core.js` `aiCallServerFull` は、本文が JSON として parse
  できない 200 に `meta: null` を返す。`_model` はそれを「protocol 2 を話さない古い proxy」と読み、セッションを
  旧伝送へ切り替えていた——**不正な応答を別の事実（サーバが古い）として報告する観測器**だった。
- system の大きさ（本物のレジストリ・基本の道具で `SYS()` を評価）: ネイティブ **14,181 字**、旧形 **25,262 字**。

⇒ **撤去してよい。** 旧経路は退避先として機能しておらず、届かせていた能力（基本の道具 ＋ 索引経由の全能力）は
ネイティブ経路が同じ道具の面で届かせている（§2 ① で全数評価）。

## 1. 撤去したもの

- `js/atlas-agent.js`: `legacyPrompt`（item を 1 本に畳む射影）と `TURN_SCHEMA`（`tool_calls` を持つ封筒）。
  `FINAL_SCHEMA` を派生ではなく唯一の schema として直に定義した（鍵の並び `turn`→`answer_mode`→`final_text` は同じ）。
  `readReply` は `data.tool_calls` を呼び出しとして読まない——呼び出しは provider の `function_call` item だけ。
- `js/atlas-console.js`: `_aiProto`、`SYS()` の legacy 分岐と `say()` の置換、`_toolBlock`、`_model` の
  2 本目の呼び出し（`AGENT.legacyPrompt(built)` ＋ `TURN_SCHEMA`）と `empty` を拾う catch、`TURN_SCHEMA` の取り出し。
  `_sys` は 1 ターンに 1 回組んで以後動かないので `const` にした。
- 検査: 旧経路を測っていた箇所（`r285` の 2 形の大きさ・`atlas-one-declaration` ⑤ の 2 形・`atlas-view` の 2 本目の
  呼び出し・`atlas-console-boundary` の文字列射影・`atlas-native-tools` ⑥ の封筒の読み取り・
  `atlas-agent-loop` ⑬ の `tool_calls` 解析）を、ネイティブの形を測る検査に置き換えた。
  `tests/r783-attach-recall.spec.js` の偽の上流から protocol 1 の枝を外した。

## 2. 足したもの（撤去で読者と Atlas から何も消えないように）

- **protocol 2 を求めて protocol 2 の無い応答が来たら、不正な応答と述べる**（`js/ai-core.js`）。
  `provider_malformed`（既存の文言「AIの応答が不正な形式でした」）として投げ、利用数は行から読み直す。
  最初の手なら読者にエラーが出て質問は入力欄に残り（#R775 の既存の扱い）、途中の手なら `transport` で止まる。
  ⚠ 何も足さずに撤去すると、この応答は「空の返答」としてループに入り、`no_answer_written` の門が
  「何も書かなかった」とモデルに返す——**伝送の失敗をモデルの失敗として報告する**ことになっていた。
- **モデルがそれでも呼び出しを JSON に書いたら**: `readReply` が `callsInText`（名前）として報告し、実行しない
  （provider の id が無いので、出力を返せば provider が知らない呼び出しへの応答になる）。関数の呼び出しが無い
  返答は、**既存の出力の門**が `calls_in_text` として名前つきで Atlas に返す（予算も注記の形も同じ門。
  新しい上限は無い）。関数の呼び出しと並んでいたら関数のほうだけが走り、書かれたほうの注記が結果の横に載る。
  どちらも `trace.callsInText` に残る。
- 付随して、モデルに見えていた旧伝送の語を直した: `FINAL_SCHEMA.turn` の description（「the work continues in
  tool_calls」→「in function calls」——`SYS()` は既に `say()` でそう言い換えていたが、schema は言い換えていなかった）と、
  門の注記 2 つ（`no_answer_written`・`no_calls_issued` の「tool_calls is empty / was empty」）。
- `scripts/atlas-catalog.mjs` の「道具の面が system に載っている」印を `_toolBlock(` から `_capIndex(` に移した
  （`_toolBlock` が消えると、この門は道具の面とカタログ本文を母集合から落とす。印だけを外して測ると 146 行中 144 能力を
  「説明されていない」と数えた）。
- ai-proxy は**註だけ**を直した（`_aiProto` を指していた 3 か所）。1 本の文字列の要求は他のタスクの形として受け続ける。

## 3. 縮んだ量

- provider に送る system（ネイティブ）: **14,181 字 → 14,181 字、バイト単位で同一**（`cmp` で確認）。
  ai-proxy のプロンプトキャッシュの鍵（system＋固定の道具のハッシュ）も動かない。
  撤去した旧形の system は 25,262 字（差 11,081 字の大半は JSON で書き出した道具）——本番では送られていなかった。
- コード（`scripts/code-only.mjs` で註を除き空白を畳んだ字数）: `js/atlas-console.js` −1,116・`js/atlas-agent.js`
  −715・`js/ai-core.js` +221（protocol 2 の検査）。ファイルの字数では console −1,478、agent +788（註と門の注記）。

## 4. 回帰

`tests/atlas-legacy-protocol-removal-checks.test.mjs`（6 本）。①生きている全能力が関数の呼び出しだけで届く
（本物のレジストリ・道具の面・ループ・protocol 2 でしか答えない偽のモデル。`unknown_*` は 0 件）②〜④ JSON に
書かれた呼び出しの扱い ⑤ protocol 2 の無い応答 ⑥ `SYS()` が 1 形で、`_aiProto` を環境に置いても同じバイト。

## 5. 触っていないもの・残り

- ai-proxy は註だけの変更だが、`release-state` はバイトで比べるので、配備するまで ai-proxy が「ソースと違う」と出る。
- `tests/shell-css-surface-checks.test.mjs` #R508 ② がこの worktree で赤い（`js/ui-stack.js` の `act()` の形。この作業は
  触っていない）。
