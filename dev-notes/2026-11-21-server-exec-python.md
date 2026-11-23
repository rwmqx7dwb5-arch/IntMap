---
title: サーバ側で任意の Python を走らせる場所の実測——Supabase Edge 上の Pyodide は不成立・Cloudflare Python Workers は動く
date: 2026-11-21
---

〈依頼〉Atlas が、ブラウザを閉じても調査・計算・成果物作成を完遂するための基盤。本記録は
「サーバで任意の Python を走らせる場所」の実測だけを残す（実装はこの記録の次。PR #1359 の永続ジョブ・#1337 の web.session とは別の作業）。

## 1. 何が既にあって何が無かったか（2026-11-21 の全数調査）

- 永続ジョブ・cron・作業記憶・成果物の保存は、すべて PR #1359 の中（main には無い）。
- #1359 が merge されてもサーバで動く能力は 3 種だけ（`sim.spaceWeather`・`research.object`・`research.related`）。計算（Python）と成果物の保存は、ページを開いた端末が実行する。
- サーバでの任意の Python・SQL・ファイル処理は存在しない。GIS は MCP から 1 operation ずつ（入出力 2000 feature・20 秒まで・保存しない）。

## 2. Supabase Edge 上の Pyodide（不成立）

本番の仮の関数（検査後に削除済み・404 を確認）で測った。

| 段 | 結果 |
|---|---|
| wasm（10.1 MB）の取得・コンパイル・pyodide.mjs の import | 通る（取得約 120 ms・コンパイル約 100 ms） |
| `npm:pyodide` での読み込み | 分離環境ごと落ちる（503・本文なし） |
| 同梱ファイル（static_files）での配備 | 13 MB で `413 request entity too large`（CLI の API 配備） |
| ローダーの環境検出 | Deno 互換の `process` を node と誤認し、`file:///https:/…` と壊れたパスを読む |
| 共有メモリ | `Creating a shared memory is not supported`（Supabase の runtime が `WebAssembly.Memory({shared:true})` を禁じる。同期スリープ用なので差し替えれば越えられる） |
| 差し替えのあと | `WORKER_RESOURCE_LIMIT`（HTTP 546・約 2.8 秒）。メモリか CPU 時間かはログが無く判別していない |

結論: 環境検出の回避・共有メモリの差し替えまで入れても資源上限で止まる。この実行場所は採らない。

## 3. Cloudflare Python Workers（動く）

2026-11-23、Workers 有料プラン（$5/月）に契約したアカウントへ、REST API で配備して測った。

- Python 3.14.2（Pyodide）が Worker として起動し、`sum(i*i for i in range(10**6))` を返した。初回の往復 1.15 秒。
- 配備の落とし穴（API で上げるとき）: `compatibility_flags` に `python_workers` と `disable_python_external_sdk` が要る。後者が無いと `workers` の import が `workers-py >= 1.9 を使え` で落ちる。ハンドラは `class Default(WorkerEntrypoint)` の `fetch`。`on_fetch` 形式は「ハンドラが登録されていない」と拒まれる。
- `numpy` は `ModuleNotFoundError`。標準ライブラリだけが入っていて、パッケージは配備時に同梱する必要がある（未測定）。
- workers.dev のサブドメインは `intmap-exec`。証明書が出るまで数十秒かかる。

## 4. まだ測っていないもの（次）

- numpy など GIS 用パッケージを同梱できるサイズか（Worker の大きさ上限）。
- CPU 時間の実効上限（有料プランの既定は 30 秒・最大 5 分と文書にある。実測はしていない）。
- 認証（今の試験用 Worker は公開で、足し算しか返さない）と、Supabase のジョブからの呼び出し。
- #1337 の web.session が本番の Browser Run で動くか（秘密 `CF_BROWSER_ACCOUNT_ID`・`CF_BROWSER_API_TOKEN` は 2026-11-23 に登録済み）。

## 5. 費用

公開料金からの試算で、Workers 有料の $5/月に、含み分（リクエスト 1000 万・CPU 3000 万ミリ秒・Browser Run 10 時間・Containers の一定量）の範囲なら追加は無い。実測した費用ではない。
