---
title: subagent の既定を sonnet にしても 92% が Opus で走っていた——昇格を 2 問目に付け、implementer も既定を下げ、実際のモデルを数える計器を足す
date: 2026-10-03
---

〈依頼〉「background tasks の subagent がほぼ全部 opus。限られたサブスクの枠で IntMap を作っている。
基本は Sonnet、難しいものだけ Opus にすべきでは？」——implementer も含めて変更することで合意。

## 0. 測った

`~/.claude/projects/<key>/<session>/subagents/*.jsonl` の最初の assistant 記録の `message.model`
（**答えたモデル**）と `*.meta.json` の `agentType` を数えた。既定を下げた 2026-09-25 以降の 316 起動:

| 役 | 起動 | sonnet | opus |
|---|---|---|---|
| implementer | 190 | 0 | 190（当時は継承＝設計どおり） |
| scout | 52 | 25 | 27 |
| prod-verifier | 39 | 0 | 39（設計どおり） |
| verifier | 33 | 1 | 32 |

**全体の 92% が Opus。** 宣言（`model: sonnet`）は効いており、上書きされなかった分だけが sonnet で
走っていた。親 transcript の Agent 呼び出しには `"subagent_type":"intmap-verifier","model":"opus"` が
44 回、scout にも 40 回あった。

## 1. なぜ例外が既定になったか

verifier の昇格条件は「環境要因か本物の退行かを**判定させるときは**上げる」「**迷ったら上げる**」だった。
検証の依頼はほぼ必ず判定を含むので、**最初の依頼の時点で毎回条件が満たされた**。scout には昇格条件が
そもそも無いのに半数が上げられていた（呼び手の習慣）。さらに最大の消費者 implementer（60%）は
継承固定で、ここを動かさない限り節約は小さかった。

## 2. 直したもの

- **verifier**: 最初の依頼（走らせる・失敗を挙げる）は上書きしない。返ってきた赤について判定を訊く
  **2 問目だけ** `model: "opus"`。「迷ったら上げる」は撤回し、代わりに「既定の verifier 自身が判定
  できないと返したら上げる」。
- **implementer**: 既定を `sonnet` に。設計が決まっていない仕事を渡すとき、または既定で書いた差分が
  差し戻されたあとの再依頼だけ上げる。**既定で書かせた差分はメインが必ず読んでから統合する**——
  `AGENTS.md` §3-3 のハリボテを拒むのはこの読みとゲートであって、モデル名ではない。
- **scout / i18n**: 上書きしない（判断が要るならメインの仕事）。
- **prod-verifier**: 継承のまま（観測器の嘘の実測 #R736 / #R742 / #R768）。
- 呼び手に届く 2 か所（role の `description` と `.agents/skills/intmap-round/` §2）を同時に直した。

## 3. 計器

`node scripts/agent-models.mjs [--days N] [--json]`。宣言は `check:agents` が見ていたが、**呼び手が
何をしたかを見る読み手が無かった**（one-pass-or-a-reason.md §6「測れない方針は守られない」）。
原本の project key と `wt-<slug>` の worktree の key だけを数える。Codex は対象外（モデルはアカウントが
決める・`docs/AGENT-SETUP.md` §6）。この回の直前（直近 9 日）の値は 390 起動・高いモデル 93%。

## 4. 否定された見立て

最初の回答で「すでに半分以上の役は Sonnet」と述べたのは**設定ファイルを読んだだけ**で、実行を
見ていなかった。利用者が background tasks の一覧で先に気づいた。宣言と実際は別に測る。

## 5. 検査

`tests/subagent-model-tiers-checks.test.mjs` — 4 役が sonnet・prod-verifier が継承、description が
「最初は上げない／2 問目だけ」「読んでから統合」を述べる、手順書が「迷ったら上げる。」を指示として
持たない、計器が答えたモデルと自分の project key だけを数える。
