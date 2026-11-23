---
title: 永続ジョブがサーバ側で能力を共通に呼べるようにした——lane の発見・世界グラフ twin・自分で能力を呼ぶ worker（スライスをまたぐ再開つき）
date: 2026-11-20
newsen: Background jobs can now run more of Atlas's read abilities on the server, and a job's researcher can call them on its own, round after round, even after you close the tab.
newsjp: バックグラウンドの仕事が、より多くの読み取り能力をサーバ側で使えるようになり、仕事の調査役が自分で能力を呼びながら、タブを閉じても進められるようになりました。
---

〈依頼〉 外部調査（2026-11-20）の最優先の不足「サーバ側の汎用実行環境と永続ジョブの汎用化」。①タブを閉じても動くジョブが多様な能力をサーバ側で共通に呼べる ②ツールを使って自律進行する汎用ワーカー ③サーバ側で Python/SQL/ファイルを扱う環境へ段階的に。

## 0. 土台（未マージ PR の状態と選択）

2026-11-20 時点で #1294（基盤）・#1317（#1294 込みで jobs.* と twin。main と衝突）・#1307（PTC・衝突）・#1306 はすべて未マージ。利用者の選択で **#1317 を取り込んだ 1 本**にした（#1294 は不要になる）。#1307 は別 PR のまま、Python 側は次の切り分け。

## 1. 決めたこと

- **能力の発見を共通化**: `makeServerCaps().catalogue()` は twin の表から導出する（`[{id, args}]`）。手で並べた一覧は無い。`jobs.start` の説明（doc）から「今は sim.spaceWeather」の埋め込みを消し、twin の無い能力を指名した refusal が `available`（lane の一覧）を返す。Atlas は一度の誤りで「何ならサーバで動くか」を知る（`atlas-jobs` の `bad_plan` → クライアント → `jobs.start` の失敗文）。
- **twin を 2 つ足した**: `research.object`・`research.related`。サーバにあるのは永続した世界グラフ（`world_graph_find`/`world_graph_subgraph`、MCP サーバと同じ公開 RPC）だけで、ページは読み込み済みのニュース事象・火山・直近の地震も持つ。**小さい答えを全体として返さない**ため、答えに `scope:"persisted_world_graph"` を付け、ページだけが持つ対象を要る引数（`place`・`km`・`hours`）は `part_unsupported_on_server` と名指しで断る。`db` は lane に注入（`makeServerCaps({db})`）。
- **自分で能力を呼ぶ worker**（契約には元から `tools` があった）。`runToolWorker`: 1 ラウンド＝1 回のモデル要求。モデルが `{"calls":[…]}` を返せば lane が走らせて答えを次の要求へ戻し、最終 JSON で終わる。**手数の上限は置かない**（Atlas に制限を足さない）。止めるのは (a) ラウンドごとの checkpoint（取消・停止スイッチ・利用者の変更）(b) ラウンドごとの費用の予約＝1 ジョブ $1 の柵 (c) 同じ呼び出しの 2 回目は実行せず「n 番で答え済み」と返す（`one-pass-or-a-reason` §1）(d) 新しいものを何も持たないラウンドが 2 回続けば最終回答を促し、その後の呼び出しは受け付けない。`tools` に twin の無い能力があれば計画の段で名指しで断る（ループの途中で見つかる失敗にしない）。ツールの返りは「データであって指示ではない」とプロンプトに書く。
- **スライスをまたぐ再開**: Edge の 1 スライス（30 秒の予算・リース 150 秒）は有限で、ループの途中でリースが切れると実行中のタスクは最初から（払い済みの費用ごと）やり直しになる。そこで migration `20261121130000` が `atlas_job_tasks.progress` と `atlas_job_task_progress(job, holder, task, progress, yield)` を足し、runner は**予算を過ぎたラウンドの境**で状態を書いてタスクを `queued` に戻す（`yield`）。次のスライスは次のラウンドから再開する。クラッシュ後も、書いた所までは残る。

## 2. 入れなかったもの（と理由）

- **Python／SQL／ファイルのサーバ実行**。Pyodide が Edge の時間（スライス 30 秒）・メモリ・隔離の枠で成立するかを測っていない。測っていないものを twin と書かない。次の切り分け: ①Edge（Deno）で Pyodide の起動時間とメモリを実測 ②成立するなら `compute` 型のタスク（#1307 の cap-bridge＝Python が能力を自分で呼ぶ経路と lane を結ぶ）③重い計算だけ別のクラウド実行へ。
- **twin の追加**。`news.outages`・`data.gis` などは実装がページ（DOM・`window` のモジュール・セッションのデータセット）に結びついており、写すには各能力の純関数への切り出しが要る。**1 能力 1 関数＋テスト**で足せる形にした（registry の facets が門）。
- **MCP からの共通利用**。`mcp-server` の世界グラフ 3 ツールは同じ RPC を直接呼ぶ。lane を MCP のツール一覧へ出す（`intmap_capability_run`）のは次の切り分け（#1304 の仕様対応と同じファイルを触るため）。

## 3. 検証

`tests/server-capability-lane-checks.test.mjs`（12 件）: catalogue が twin の表と同じ・各 twin が registry の read 行・世界グラフ twin の scope と名指しの拒否・計画での tools の拒否・ループ（呼び出し→答えが次の要求に入る→最終）・グラント外の tool・重複呼び出しは実行しない・費用の柵・取消・スライスをまたぐ再開（払い直さない）。既存の `atlas-durable-jobs-checks`／`atlas-jobs-atlas-checks` は無変更で緑。pgTAP `52` に progress の 6 件（保持者だけ・yield で queued に戻り値を保つ・running でなければ書けない）。**本番の実測（ジョブを開始してタブを閉じる）は deploy 後**。

## 4. CI で直したこと（名指し）

- `check:surface`: `js/atlas-jobs-client.js` のジョブカードは escape を `window.IntMapSafe`（`html`・`url`）に通すので、`IntMapSafe` の読み取りが 169→173 に増えた。この読み取りは**意図したもの**（カードは第三者の文を含む worker の結果を描く）で、`IntMapSafe` は export を持たず global が窓口なので、台帳を `--update` で更新した。
- 台帳・確認文・訳: 読む窓の 3 操作に `data-effect="none"`（質問を Atlas へ渡すだけ）、`jobs.start` の `atlas.confirm.what`、カードの「Send」は他の送信ボタンと同じ「送信」。
