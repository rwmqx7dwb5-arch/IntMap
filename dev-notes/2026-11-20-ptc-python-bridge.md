---
title: Python が能力を自分で呼ぶ — cap-bridge と compute.run の接続 (Programmatic Tool Calling)
date: 2026-11-20
---

〈依頼〉 総合技術監査 3.1。#1276 の `js/cap-bridge.js`（契約）と #1272 の `compute.run`（Pyodide の隔離実行）は別々に在り、
接続されていなかった。「世界 500 都市それぞれの最寄り港までの距離を取って順位づけ、地図に出す」を、少数のモデル判断
（何を計算するか・どう描くか）と大量のプログラム実行（500 回の呼び出し）に分けられるようにする。

## 1. 何を足したか
- **ポートの受け渡し**: `compute.run` に `grants`（`read` / `state`）を足した。指定があれば `K.programBridge` →
  `makeAtlasToolSurface.openProgramBridge`（モデルの `run_capability` と**同じ `makeExecute`**）でブリッジを開き、
  `port` を job と一緒に Worker へ **transfer**。クライアント本文（`clientSource()`）は Worker の**ソースに埋め込む**
  （Worker では `eval` / `Function` を閉じるので、文字列で渡して評価することはできない）。`grants` を渡さない実行は
  ポートを持たず、Python の `cap_call` は「ブリッジが無い」と言う。
- **Python から呼ぶ道**: 実行の名前空間に `cap_call` / `cap_call_many(calls, concurrency=4)` / `cap_list` / `cap_describe` /
  `cap_dataset` / `cap_rows`（top-level `await`）。拒否は例外でなく**答え**（`r["ok"]`, `r["refused"]`）。同じ呼びの二度目は
  再実行せず `alreadyDone`。`concurrency` は呼び先（地名検索など）の上限を食わないための既定 4。
- **データを読む道（プロトコルに kind `dataset` を 1 つ追加）**: ブリッジの `call` の答えは「利用者が見るカードの文章」で、
  行そのものではない。直前の呼びが作ったデータセットを読めないと反復仕事が成立しないので、`read` 許可の読み取り専用の
  `dataset` を足した（`deps.readDataset`。stale は読まない）。`unknown-dataset` を拒否の語彙に足し、読み取り器が投げたら
  `observed:false`。
- **実行履歴**: ブリッジが呼び 1 件ずつ（拒否・重複を含む）`{seq, capability, ok, observed, refused?, alreadyDone?, ms, args(160字)}` を記録
  （`calls()`、上限 `logMax` 20000 を超えたら**数えて**`logOmitted` に出す＝完全だと偽らない）。結果に `bridge: {grants, summary,
  calls, logOmitted, logSha256}` を載せ、カードに 1 行（許可・実行数・重複・拒否・能力別の数）、各出力の `provenance.bridge`
  に要約とログのハッシュを残す（ログ本体はレコードに入れない）。**失敗した実行にも**それまでの呼びの履歴が付く。
- **自己再帰の禁止**: `deps.forbid(cap)` を足し、`compute.run` からの `compute.run` は `not-granted`（インタプリタは 1 実行に 1 つ）。
- **使用例/実行契約**: `compute.run` のカタログ文に、ループの形・`cap_describe` で先にスキーマを見ること・拒否の種類・
  alreadyDone・外部文章の汚染（`needs_confirm` は結果として返す）・読み取りの道を書いた。

## 2. 判断
- `persist` / `external` はこの入口から許可しない（スキーマの enum が `read` / `state` のみ）。確認の要る能力を、読み手の
  いない環境から呼べる道を、最初の接続で開けない。必要なら別途、利用者の明示を要する形で足す。
- `state` を許した実行は `map.*` などで地図を動かせる。行の `risk 'session'`・`confirm 'none'` は不変（取り消せる範囲）。
- 再実行（`rerun`、入力の再計算）: レシピのコードが `cap_call` を使っていて ブリッジが開かれていなければ、Python が
  「ブリッジが無い」と明示して `python-exception` になる。黙って別の結果を作らない。再実行時にブリッジを開く経路は未実装。
- 「500 都市」の実測は未了: `maxCalls 5000` は #1276 の注記どおり**測っていない数**のまま。この接続で測れるようになったので、
  実測したら #1276 の失効条件に従って更新する。

## 3. 検査
`tests/ptc-python-bridge-checks.test.mjs`（Node: プロトコル・履歴・Worker への port と client の受け渡し・失敗した実行の履歴・
`compute.run` の grants の扱い・文面と配線）、`tests/ptc-python-bridge.spec.js`（実 Pyodide: ループ・拒否・重複・読み取り・履歴・
grants 無しの実行。CDN に届かない走者では理由つきで skip）。
