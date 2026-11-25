---
title: 永続ジョブが GIS の空間演算をサーバで直接走らせる（data.gis の server twin）— 監査④⑦への実装
date: 2026-11-26
---

〈依頼〉外部監査「Atlas オーケストレーション技術監査」④（AI が判断しなくてよい作業に AI を使いすぎる）と⑦（バックグラウンド実行環境が限定的）。
現行 main で再確認してから直す。

## 1. 再確認（2026-11-26・main 80bb33c4a）
- 永続ジョブの子 AI／capability タスクが直接使えるサーバ側能力は `sim.spaceWeather`・`research.object`・`research.related` の **3 件だけ**（監査どおり。古くない）。
  原因は監査の言うとおり機能不足ではなく、twin を持てる `read` 区分（約 51 件）の実装がブラウザ側 `js/` に集中していたこと。
- 画面なしで動く GIS は既にあった: MCP サーバの `intmap_gis_run` が `js/gis-core.js` を `loadGis()` で画面なしに組み立てて走らせていた。
  ただしその実行器が `mcp-server/handler.js` の中に在ったので、ジョブからは使えなかった。
- サーバで Python を走らせる場所は未導入（2026-11-21 の実測どおり、Supabase Edge 上の Pyodide は不成立・Cloudflare Python Workers は動く）。この回では導入していない（§5）。

## 2. 何を共有部品にしたか（写していない）
- `_shared/gis-headless.js` — 画面なしの空間演算の実行器（演算一覧の発見・入力の登録・実行・来歴 manifest の読み出し）。MCP サーバの `intmap_gis_run` から
  取り出したもので、MCP は今これを使う（挙動・検査は不変）。
- `_shared/gis-loader.js` — `mcp-server/` から `_shared/` へ移動（1 本のまま）。
- `_shared/gis-input-fetch.js` — https の GeoJSON ファイルを gis-fetch と**同じ原則**（公開アドレスのみ・各リダイレクトを再検査・バイト上限・HTML 拒否）で読む。
- `SERVER_CAPS` に **`data.gis`** を追加（ページの同名能力と同じ id・同じ引数形 `{op, inputs, params}`）。入力は GeoJSON そのもの、または https の GeoJSON ファイル。
  演算一覧は GIS 自身が宣言したものを発見する（ここに名前を書かない）。`{"describe":true}` で一覧が返る。
  ページの dataset/layer の参照（`layer:`・`ogc:`・`stac:`）・`acquire`・ラスタ出力・`semantics` はサーバに無いので `part_unsupported_on_server` で名指し拒否（小さい答えを返さない）。
- 保存する答えは、行そのものを `data.result` に（バイト上限 150 万字超は切って `truncated:true` と件数を述べる）、`text` は要約。
- `atlas-jobs` は `makeServerCaps({db, gis, fetchGeoJson})` に配線。計画時の `has()`／`catalogue()` は GIS を読まずに答える。

## 3. 発見（item 4）
`catalogue()` は `SERVER_CAPS` から導かれるので、`data.gis` は計画の拒否文・worker の道具一覧にそのまま載る。能力の説明（`jobStart` の doc）に
「capability タスクは表全体を 1 回で処理する。行ごとの判断は要らない」を一般形で足した（特定の質問への誘導ではない）。

## 4. 実測
- Node（本物の `js/gis-core.js`）: 演算一覧 31 件を発見・738 ms で起動。`nearestJoin` で 500 点 × 40 点を 1 呼び出し（84 ms）で処理し、全 500 行に距離列が付く。
  同名の列があると `join-column-collision` で拒否される（GIS 自身の規則）。
- 本番規模の実測（世界 500 都市→最寄り港）は §6 に追記する。

## 4b. 永続ジョブの子 AI の maxOutput と images（2026-11-25 worker-reach の「残したこと」）
- **maxOutput は運べるようにした**。runner は契約の `maxOutput` を予約の見積もり（`money.estimate`）とモデル要求の両方へ渡し、`atlas-jobs` は
  ページの子と同じ規則（下限 3000・モデルの文書化された出力上限まで・上限が引けないモデルは上げない・推論ぶんに同量を残す）で `max_output_tokens` を決める。
  `planJob` は `maxOutput:true` を名乗る runner（atlas-jobs）では断らない（名乗らない runner は従来どおり名前つきで断る）。
- **images は運ばない（理由が実在する）**。契約の `images` は端末の添付台帳の名前か `@view`（そのターンの地図フレーム）で、実体は**ページが持つ端末内のバイト列**。
  ジョブ作成時に画像のバイトを job 行へ埋めれば運べるが、それは利用者の添付・地図の画像を DB へ保管する新しいデータ経路（プライバシー・保管・サイズの決定）で、
  暗黙に足してよいものではない。決めるまでは `images_unsupported_on_server` で名指し拒否のまま（小さい答えを返さない）。

## 5. この回で入れなかったもの（別の仕事）
- サーバでの任意の Python／SQL 実行。Cloudflare Python Workers の本番導入（認証・パッケージ同梱・CPU 上限の実測・ジョブからの呼び出し）が要る。
- `web.fetchFile`・衛星画像・ラスタ解析の twin（`read` 区分ではなく、COG の範囲読みは gis-fetch の道が別に要る）。
- 成果物生成（ファイルを作る能力は `savesFile` で page-only のまま）。

## 6. 本番実測
2026-11-26、本番（ログイン済みセッション・永続ジョブ・https 入力）。道のり: #1431 配備後は全タスクが （#1435 で直す）→ 幾何演算が （#1437 で直す）。
Node の検査は、本番 Edge の realm（代入できない window・import map）を再現しておらず両方を通していた。本番で測って初めて見つかった。

| 測定 | 結果 |
|---|---|
|  | 演算 31 件 |
| inline 2×2 nearestJoin / buffer / centroid | 全部 done（69 / 160 / 124 ms） |
| https: NE 50m 都市 1,251 × NE 10m 港 1,081 の nearestJoin | done・count 1,251・truncated=false・未一致 0・保存 909,641 B（上限 1,500,000）・2,945 ms（大半は https 取得） |
| 同 都市 243（110m）× 港 1,081 | done・869 ms |
| 同名列 name が衝突する入力 | 拒否 （GIS の規則どおり・prefix で避ける） |
| ブラウザ Python（compute.run）で同じ全表 1 回 | 372 ms（Pyodide 起動 1.8〜2.8 秒は別） |
| ブラウザ Python: cap_call_many（並列 4）で 500 点データセット 500 回 | 全部 ok・0.65 秒・拒否 0（#1431 前の測定） |

- 「約 500 都市」の公開 GeoJSON は見つからず、1,251 件と 243 件で測った。作成から終了まで 5.26 秒（6 タスク）。1 件ずつ AI が判断する形との差は、モデル呼び出しが 0 回であること。
- 気づき: 拒否の詳細（どの列が衝突したか）が task 行に残らず  だけ。次の改善候補。
- 未測定: （MCP キー発行が承認事項）、行ごとに 500 回呼ぶ Python の同条件比較。
