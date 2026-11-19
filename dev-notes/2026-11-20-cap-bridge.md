---
title: 能力ブリッジ — AI が書いたプログラムから能力表を直接、何百回でも呼ぶ (Programmatic Tool Calling)
date: 2026-11-20
---

〈依頼〉 外部監査の指摘。Atlas は 1 手ごとにモデルへ往復する。「500 都市それぞれの最寄り港湾距離」は 500 往復で、
途中の結果が全部モデルの文脈を通る。プログラムが能力を自分で呼び、途中の結果は実行環境の中に置き、最後の値だけを返す。

## 1. 作ったもの
`js/cap-bridge.js`（言語に依らない契約。DOM にも Python にも依らない）。
- **ワイヤ**: JSON over 1 本の MessagePort。`{v:1, seq, kind:'list'|'describe'|'call', capability, args}` と、同じ `seq` の応答。
  拒否も応答の 1 種で例外にしない（`{ok:false, refused:<理由>}`）。
- **ホスト側**: `makeCapabilityBridge(deps)`（方針）+ `attachBridge(port, bridge)`（ポート）。
  `deps.execute` は `js/atlas-toolsurface.js` の `makeExecute` — モデルの `run_capability` と**同じ関数**。スキーマ確認・
  外部文章の後の利用者確認（列 8 `explicit`）・`always` 行・競合キーの直列化は、プログラムにもそのまま効く。
- **クライアント側**: `makeBridgeClient(port)`。自己完結で、`clientSource()` がその本文を Worker へ渡す。

## 2. 3 つの判断
1. **許可は能力の性質で**: `effectClass(cap)` 1 関数が `read / state / persist / external` を出す。既定の許可は `['read']`。
   書き換える走者は `grants` を広げ、`persist` / `external` は名指しが要る。
2. **最後の柵であって、再実行も黙殺もしない**（`one-pass-or-a-reason.md`）: 呼び数・期限・`cancel()` を超えた呼びは理由つきで拒否。
   **同じ呼びの二度目**（同じ能力・同じ引数、キーの順は無関係）は再実行も黙殺もせず、記録した答えを `alreadyDone` / `ofSeq` つきで返す
   （モデル側 `doneCalls` と同じ形）。実行器が投げた・取消で途中になった呼びは `observed:false`（観測できなかった）で、能力の失敗とは言わない。
3. **外部文章の汚染**: `ingests:'external'` の能力の後は `turn.externalContentSeen` が真になり、実行器の確認規則が後続の呼びに効く。
   プログラムには利用者がいないので `needs_confirm` が返る。ブリッジは `confirmed` を立てない。

## 3. 接続点（他セッションとの関係）
- **cap-effects（属性分解・進行中）**: 追従点は `effectClass` 1 関数か `deps.effectsOf(cap) -> {class}` の注入。ワイヤは列番号を運ばない。
- **#1272（compute.run、Pyodide）**: 未マージの間は触らない。接続は #1272 側で次の 3 点: ① `compute-sandbox.js` が走らせるごとに
  `MessageChannel` を作り `port2` を Worker へ transfer、`attachBridge(port1, makeCapabilityBridge({registry, execute: makeExecute(...), turn, grants}))`、
  ② ⚠ Worker の SCRUB（グローバルの扉を塞ぐ処理）の**前**に `clientSource()` で client を作り、Python へは
  `bridge` として渡す（`await bridge.call("data.gis", {...})`。Pyodide は Promise を top-level await できる）。ポートは塞ぐ対象ではなく
  このラン専用の 1 本、③ ラン終了で `bridge.summary()` を出自 (`kind:compute`) に足す。#1272 は `js/` の単独ファイルとしか接していない。
- ⚠ 未測定: 実行器 1 呼びあたりの費用。`maxCalls 5000` は 500 の 10 倍という置き方で、測定値ではない（`LIMITS` の注に失効条件を書いた）。

## 4. 検査
`tests/cap-bridge-checks.test.mjs`（12 件）。MessageChannel の実通信に加え、`clientSource()` の本文だけを渡した worker_threads の
Worker が 500 呼びを回し、返るのは最終値だけであることを確かめる。
