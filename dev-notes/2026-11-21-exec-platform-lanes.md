---
title: 永続ジョブがサーバで動かせない能力を保存してページが適用する・失敗分だけ再開・終わった仕事と Python の実行を成果物へ
date: 2026-11-21
newsen: Background jobs can now include map changes, which are applied when you next open IntMap, and a stopped or partly failed job can be resumed so that only the unfinished pieces run again.
newsjp: バックグラウンドの仕事に地図の変更を含められ、次に IntMap を開いたときに適用されます。止めた仕事や一部失敗した仕事は、終わっていない分だけ再実行できます。
---

〈依頼〉 総合技術監査 §9.1。`SERVER_CAPS` が 3 種しかなく、他は `capability_unsupported_on_server` で拒否されていた。
長い分析がページの寿命に依存せず完了し、プログラムから能力を大量に呼べるようにする。

## 1. 区分は能力表から導く（手で並べない）
`js/atlas-server-class.js` が能力の記録 1 件から 3 つの区分を返す。土台は `js/cap-bridge.js` の `effectClass`（プログラムが何を呼べるかを
決める関数と同じもの）で、ジョブとプログラムとターンが「その能力は何をするか」で同じ答えを持つ。
- `read`（51 件前後）— 何も変えず、尋ねず、他のモデルを動かさない。サーバの twin を**持てる**。持っていれば動かし、無ければ名指しで拒否。
- `parkable`（約 168 件）— 地図やセッション（レイヤー・カメラ・パネル・時計）を変える・戻せる・確認不要・尋ねず・ファイルを作らない。
  サーバには地図が無く、**サーバ上で動かす twin は原理的に作れない**。ジョブが**操作を保存**（タスクは `done`／`parked`、`result.parked`）し、
  ページが戻ったとき `applyParked` が**ターンと同じ実行経路**（`K.programBridge`、grants は `state` だけ）で 1 回ずつ適用する。
- `page-only` — 確認が要る書き込み・ファイル・読者への質問・別モデルの仕事・`jobs.*` 自身。計画の時点で名指しで拒否。
Edge Function 側の写し `_shared/atlas-cap-classes.js` は `scripts/sync-atlas-cap-classes.mjs` が生成し、
`tests/exec-platform-checks.test.mjs` が「レジストリの導出と 1 バイトも違わない」ことを測る。

## 2. 適用の「1 回」
適用済みの印は端末の localStorage（`intmap.atlas.jobs.applied`）。適用する前に印を付けるので、途中で投げた操作が次の poll で
もう一度走ることはない。拒否された操作は拒否として記録し、再試行しない（one-pass-or-a-reason §5）。別の端末では別に適用される
（地図状態は端末ごとのもの）。⚠ 適用の契機は `jobs.status`・`jobs.start`・`jobs.resume` が置くカード（5 秒 poll）で、
**カードも status も開かれない起動直後には適用されない**。起動時に未適用の保存操作を探す経路は未実装。

## 3. 失敗した分だけ再開
migration `20261127110000_atlas_job_resume.sql` の `atlas_job_resume(p_job, p_only)`。失敗・拒否・取消の分担だけを `queued` に戻し、
`done`／`partial` はそのまま（二度実行・二度課金されない）。使った費用は上限に数え続ける（再開は新しい予算ではない）。
`paused` という状態は足さない（止める＝`atlas_job_cancel`、続ける＝これ）。能力 `jobs.resume`（`jobs.start` と同じく外部・要確認）とカードの
「終わっていない分だけもう一度実行」ボタン。途中の指示変更は既存の `jobs.amend`。

## 4. 作業記憶と作業成果物
- `js/atlas-job-products.js`: 終わったジョブ 1 件＝作業 1 件（`wk-job-<uuid>`）。分担ごとに `answer`、統合結果を `document`。内容が同じなら足さず、
  変われば次の版（再開で埋まった分担は新しい版になり、前の版と比べられる）。
- 作業記憶には kind `job` の「未了」を足す（`recordTurn` が自動で解決する対象から外した）。ジョブが終わって読まれたときに解決する。
- Python の実行: 開いている作業があるとき、プログラムを `code`、能力呼び出しの履歴（許可・件数・1 件ずつの結果・記録されなかった件数・ログの sha256）を
  `document` として同じ作業へ保存する。開いている作業が無ければ何も作らない。

## 5. 何が引き継ぐか／できていないこと
- 文字列キーの衝突 3 件（`added`・`run`・`Workspace`）は #1314・#1307 が持ち込んだもので、英語キーを分け `Workspace` の日本語は既存の「ワークスペース」に揃えた。
- Python の実行そのものはブラウザの Pyodide。サーバのジョブは `compute.run` を**保存**してページに実行させる（サーバで Python は走らない）。
- `read` 区分に twin を足したのは今回は 0 件（`SERVER_CAPS` は 3 のまま）。twin が要るのは対象が上流の公開 API を直接読める能力だけで、
  区分が導くのは「持てるか」まで。残りは能力ごとの実装で、手で並べずに足せる土台はできた。

## 6. 実ブラウザで Python ブリッジを動かして見つかった 3 つの欠陥（#1307 の spec はネットワーク無しで skip されていて、一度も走っていなかった）
1. **Atlas の問いが開いていないと、プログラムは能力を 1 つも呼べなかった**。`makeAtlasToolSurface` の `runAction` は走っている問いの実行器
   （`_turnRunAction`）だけを見て、無ければ `no_turn` を返していた。`compute.run` を Atlas の外から実行した場合、そして**ジョブが保存した操作を
   ページが戻って適用する場合**がどちらもこれに当たる。問いが無いときはカーネル（`IntMapOS.execute`＝解決・検証・実行・観測・undo の同じ戸口）で
   実行する `_kernelRun` を足した。実測: Python から `data.value`（日本の人口）と、`state` を許可した `view.flyTo`（地図がロッテルダムへ動く）が通る。
2. **許可なしの実行の `cap_call` は「ブリッジが無い」と言わず `'JsNull' object is not callable` で死んでいた**。JS の null は Pyodide で `None` ではなく
   `JsNull` になる。判定を「呼べるポートがあるか」へ。
3. 仕様の側: カーネルの dispatch は Atlas コンソール（遅延 chunk）が入れるので、読み込み前の呼び出しは `unavailable` になる（spec が競合していた）。
   spec は `atlasConsole` を待つようにし、失敗の本文は traceback の末尾で読むようにした。
`IM_PREBUILT_DIST=1 npx playwright test tests/ptc-python-bridge.spec.js` が緑（11 秒）。
