---
title: 永続ジョブを Atlas から頼めるようにした——能力 jobs.*・サーバ側の能力 twin・途中成果が逐次出る進捗カード（ターンの上限は上げず、仕事を別の単位にした）
date: 2026-11-20
newsen: Atlas can now start a long job that keeps running after you close the tab, show each finished piece as it arrives, and let you stop it or change its instructions while it runs.
newsjp: Atlasが、タブを閉じても続く長い仕事を始められるようになりました。終わった部分から順に表示され、実行中でも止めたり指示を変えたりできます。
---

〈依頼〉 外部監査（2026-11-20）3.2/3.3: 永続ジョブ基盤（`atlas-durable-jobs`）を Atlas に接続する。①開始・監視・取消・指示追加の能力と最小の画面 ②サーバが一般の能力を走らせる経路 ③会話ターンの上限と「大きな仕事」を分ける ④完了した部分から逐次表示。

## 0. 決めたこと

- **上限は上げず、単位を分けた**。ターン（8 ステップ／32 呼び出し／600 秒）は人が待つ単位なので触っていない。`jobs.start` は 1 リクエストで返り、ターンはそこで終わる。仕事は自分の柵（1 件 $1・同時 2 件・全体 20 件・停止スイッチ）を持ち、あとで `jobs.status` で読む。Atlas への指示文（doc）に「待たない・ポーリングしない・ターンを閉じる」を書いた。
- **能力 4 本**（`js/atlas-cap-jobs.js`）: `jobs.start`（risk external・confirm explicit・delegates）／`jobs.status`（read・ingests external）／`jobs.cancel`／`jobs.amend`（session・confirm none）。冪等キーは「ターンの鍵＋計画の digest」——同じターンの同じ依頼は 1 件、後のターンは別件、`fresh:true` で強制。
- **サーバの能力 twin**（`supabase/functions/_shared/atlas-server-caps.js`）: ページの能力はページ（DOM・地図・同梱データ）が要るので、サーバが走らせるのは**twin を持つ能力だけ**。twin は read-only の行にしか作れず、テストが registry の facets で固定する。twin の無い能力は計画の段で `capability_unsupported_on_server` と名指しで断る（走らせて失敗させない）。最初の twin は `sim.spaceWeather` の `part:"kp"` のみ（上流が素の JSON で、ページと同じ行抽出）。**他の part は黙って小さい答えにせず `part_unsupported_on_server`。**
- **runner**: `capability` 型のタスクを 1 回だけ・費用 0 で走らせ、`text` と `data` を依存先の worker に渡す。チェックポイントは worker と同じ（取消・停止スイッチの後は走らない）。失敗は観測されたコードのまま 1 度だけ報告し、再試行しない。
- **画面**: 結果カード（`js/atlas-jobs-client.js`）が 5 秒ごとに自分の行を読み、**終わった piece から順に**要約・不明点・出典を出す。Stop と指示欄は実行中だけ。入力中の文字は再描画で消さない。出典 URL は `IntMapSafe.url` を通す。戻ってきたとき（タブを閉じたあと）は `jobs.status` が自分の最近のジョブ一覧と、途中成果つきの個別カードを返す。
- **migration の時刻**: #1294 の `20261120090000` は main の最新（`20261120100000`）より前で migration-order 検査に落ちるため `20261120110000` へ改名した（本 PR が #1294 の内容を取り込んでいる）。

## 1. 残したもの

- **Python（`compute.run`）のサーバ実行は未実装**。Pyodide はページの Worker で動くもので、Edge の時間・メモリ・隔離の枠で成立するかは測っていない。成立しないものを twin と書かない。
- twin は 1 つ。`data.weather` は地図に出す能力で read ではない（showsUI）、同梱データを読む能力（`data.value` 等）は同梱データをサーバが持たない。**twin の追加は 1 能力 1 関数＋テスト**（registry の facets が門）。
- worker に `tools`（子が能力を自分で呼ぶ）を持たせるサーバ実行。
- 本番での実測（ジョブを実際に開始してタブを閉じる）は deploy 後。サーバ側は `atlas-jobs` の再 deploy が要る（CI が行う）。

## 2. 検証

`tests/atlas-jobs-atlas-checks.test.mjs`（11 件）: 能力の facets／twin が read の行だけであること／twin の成功・未対応 part・上流失敗／計画での拒否／runner が 1 回・費用 0・data を渡す／twin 無しは走らせず refused／カードの表示と escape／クライアントの冪等キーと RPC。`atlas-durable-jobs-checks` 15 件は無変更で緑。
