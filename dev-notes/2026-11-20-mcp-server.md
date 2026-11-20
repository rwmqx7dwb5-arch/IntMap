---
title: IntMap 自身を MCP サーバとして外部 AI に公開した（第 1 スライス）——世界オブジェクト検索・空間演算・時点指定・来歴つき成果物
date: 2026-11-20
newsen: Outside AI tools such as Claude Code can now call IntMap's world-object search and spatial operations over MCP with a personal key.
newsjp: Claude Code などの外部AIが、IntMapの世界オブジェクト検索と空間演算を、個人用キーでMCP経由で呼べるようになりました。
---

〈依頼〉 外部監査（2026-11-20）: IntMap を外から使える形にする。画面なしで動く `makeGisRuntime` と世界オブジェクトの永続グラフが土台。

## 決めたこと（利用者に確認済み）
- 認証は IntMap 発行の API キー。公開は 世界オブジェクト＋空間演算＋時間操作＋成果物取得の 4 点セット（すべて読み取り）。MCP Apps は対象外。

## 作ったもの
- `supabase/functions/mcp-server/`（Edge Function #23）。`handler.js` に全判断（依存注入・node で評価できる）、`index.ts` は配線、`gis-loader.js` が `js/gis-core.js` を画面なしで組み立てる（`window` を素のオブジェクトにして scope に渡す）。
- migration `20261120100000_mcp_server_keys.sql`: `mcp_api_keys`（sha256 のみ保存）・`mcp_server_state`（停止スイッチ）・`mcp_issue_key` / `mcp_revoke_key` / `mcp_list_keys`（本人）・`mcp_authorize`（service_role）。
- 上限はキーごと・全体とも既存の `relay_take`（失敗時は拒否）。呼び出しは実行の前に支払う。
- 境界: 結果は `untrusted_data` で包み、文字列を切り、何も実行・取得しない。

## 判断
- 演算の一覧は書かず、GIS の宣言（`flow.find().ops`）から発見する。ラスタ出力・`degree-grid` のみの面の演算は、インライン GeoJSON では動かないので除く。
- 「成果物取得」は、サーバ側の保存場所が無いので「結果 GeoJSON＋来歴 manifest を返す」とした。保存・再取得は次の課題。
- 世界グラフは DB の行をそのまま返す（出典・期間を持っているので、ページ用の世界オブジェクトへ組み替えない）。

## 検査
`tests/mcp-server-checks.test.mjs` が `index.ts` 自体を評価し（Deno と fetch を差し替え）、実際の GIS で buffer・measure・intersect を走らせる（10 km の buffer ≈ 314 km²、1°×1° ≈ 12,364 km²）。

## 未測定・次
- 1 呼び出しの CPU 時間と cold start（`js/` 配下 17 モジュールを Edge に束ねた費用）は本番で未測定。
- `--use-api` の束ねが `../../../js/` を辿れるかは配備で確かめる。
- 発行の画面（利用者がキーを作る UI）は未実装。いまは `mcp_issue_key` の RPC を直接呼ぶ。
