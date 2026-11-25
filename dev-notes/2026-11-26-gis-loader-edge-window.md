---
title: 画面なし GIS が本番の Edge で scope-conflict になる欠陥を直す（PR #1431 の本番検証で発見）
date: 2026-11-26
---

〈発見〉#1431（data.gis の server twin）の本番検証で、永続ジョブ 2 本（7 タスク）が全部 `gis_unavailable:scope-conflict` で失敗した（describe も通らない）。
Node の検査は `window` の無い素の realm で `loadGis` を呼ぶため緑だった（検査が本番の realm を再現していなかった）。

〈原因（推定・本番ログは未読）〉Supabase Edge の runtime は `window` を自前で持ち、代入できない。`gis-loader.js` は自分の object を `globalThis.window = scope` と代入していたが
効かず、GIS runtime が「渡された scope ではない window」を見つけて `scope-conflict` を返した。Node で「代入できない window」を再現する検査
（`tests/gis-loader-edge-window.test.mjs`）が同じ形で落ちる（再現）。MCP の `intmap_gis_run` も同じ loader を使っていたので、同じ欠陥の可能性がある（本番で通した記録は無かった）。

〈直し〉`loadGis` は既にある window を採用する（無いときだけ自分で作る）。採用したときは runtime の open モード（その window が supplier）、自分で作ったときは従来どおり closed（geodesy だけを渡す）。
isolate ごとに 1 回だけ組み立てて共有する（kernels は 1 インスタンス）。失敗した読み込みは記憶しない。失敗文に runtime の detail を載せ、次に本番で落ちたとき原因が読めるようにした。

## 続き（#1435 配備後の本番再実測）
scope-conflict は解消し、`describe`（演算 31 件）と https 入力の `filter` は本番で通った。残ったのは幾何カーネルを使う演算（buffer・centroid・nearestJoin 等、inline 2 点でも）が全件
`op_refused / geometry-unavailable` になること。`js/gis-geometry.js` の `ready()` は裸の指定子 `polygon-clipping` を動的 import するが、`atlas-jobs/deno.json` の import map には
supabase-js しか無く、`mcp-server` には deno.json が無かった。両方へ `polygon-clipping`（package.json と同じ 0.15.7 を `npm:` で固定。`tests/security-logic` が逸脱を検出する）を足す。
Node の検査はこの欠陥を再現できない（node_modules から解決される）。本番で `nearestJoin` が通るまで直ったとは言わない。
