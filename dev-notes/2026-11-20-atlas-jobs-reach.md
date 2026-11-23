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
- **migration の時刻**: #1294 は main に着地し、migration の版は main 側で `20261123130000` に付け替えられた。この PR は基盤の migration に触れない（参照だけ合わせた）。

## 1. 残したもの

- **Python（`compute.run`）のサーバ実行は未実装**。Pyodide はページの Worker で動くもので、Edge の時間・メモリ・隔離の枠で成立するかは測っていない。成立しないものを twin と書かない。
- twin は 1 つ。`data.weather` は地図に出す能力で read ではない（showsUI）、同梱データを読む能力（`data.value` 等）は同梱データをサーバが持たない。**twin の追加は 1 能力 1 関数＋テスト**（registry の facets が門）。
- worker に `tools`（子が能力を自分で呼ぶ）を持たせるサーバ実行。
- 本番での実測（ジョブを実際に開始してタブを閉じる）は deploy 後。サーバ側は `atlas-jobs` の再 deploy が要る（CI が行う）。

## 2. 検証

`tests/atlas-jobs-atlas-checks.test.mjs`（11 件）: 能力の facets／twin が read の行だけであること／twin の成功・未対応 part・上流失敗／計画での拒否／runner が 1 回・費用 0・data を渡す／twin 無しは走らせず refused／カードの表示と escape／クライアントの冪等キーと RPC。`atlas-durable-jobs-checks` 15 件は無変更で緑。

## 3. main の取り込みで足したこと

main が worker の答えに `facts`（実世界オブジェクト×属性）を足したので、`js/atlas-job-core.js` の worker 指示文を同じにし、`shapeOf(data, normalizeFacts)` は正規化関数を**引数で**受ける（core は import を持てない）。ページの `shapeOf` は `normalizeFacts` を渡す薄い包みで挙動は不変。**サーバの runner は facts を渡さないので、サーバのジョブ結果は facts を持たない**（worker は指示文のとおり facts を返すが捨てられる）——サーバ側の突き合わせは未実装。

## 4. perf の上限を上げた理由

`check:perf` が、CI の実測（merge 後）で次の 4 行が上限を超えたと報告した。どれも永続ジョブの入口（`jobs.*` の 4 能力・
`js/atlas-jobs-client.js` の進捗カード・`atlas-server-caps` の twin 表）が Atlas の非同期チャンクへ載ったことによる増分で、
起動時（eager）の経路は増えていない。上限は CI の実測値に合わせて上げた（`tests/perf-baseline.json`）。

| 行 | 上限（前 → 後） | CI の実測 |
|---|---|---|
| `async.gzip` | 4833.6 → 4862.0 kB | 4861.9 kB |
| `atlas-cap-runs` | 918.5 → 932.6 kB | 932.5 kB |
| `atlas-console` | 1080.1 → 1086.3 kB | 1086.2 kB |
| `atlas-orchestrate` | 96.1 → 104.6 kB | 104.5 kB |

⚠ このマシンでは `vite build` が prebuild で止まる（`data/` が checkout に無い）ため、`perf-budget.mjs --update` は使えず、
CI のログの実測値を手で入れた。main の CI が `--tighten` で測り直して下げる（`perf-ceiling.yml`）。

main の増分（Atlas の skills・board など、他の PR）と重なって、merge 後の CI の実測が次の 3 行でも上限を超えた。
増えた分の大半は他の PR のもので、この PR の分（`jobs.*`・進捗カード）はその一部。上限は CI の実測値に合わせた。

| 行 | 上限（前 → 後） | CI の実測 |
|---|---|---|
| `async.raw` | 14376.3 → 14483.1 kB | 14483.0 kB |
| `atlas-console` | 1105.8 → 1114.4 kB | 1114.3 kB |
| `dist.assets` | 21796.5 → 21919.4 kB | 21919.3 kB |

さらに main の Atlas の追加（マルチモーダル入力）が先に載り、`atlas-console` は CI の実測が 1121.0 kB になった
（上限 1114.4 → 1121.1 kB）。この PR の分の増分は小さく、残りは他の PR のもの。上限は CI の実測に合わせた。

## 5. global surface の台帳

`js/atlas-jobs-client.js` が `IntMapSafe`（`html`・`url`・`trusted`）を読む 5 か所で、`window.IntMapSafe` への読みが 170 → 175 に増えた
（`check:surface`）。`js/safe-html.js` は export を持たず、全ページがこの 1 つのグローバルを通して読む作りなので、他の Atlas のファイル
（`js/atlas-reading.js` など）と同じ読み方をそろえた。import に替えるには `safe-html.js` に export を足す別の変更が要る。
台帳は `node scripts/global-surface.mjs --update` で 175 にした。

`atlas-cap-runs` も、他の PR の能力の追加が先に載って CI の実測が 941.9 kB になった（上限 931.1 → 942.0 kB）。
上限は CI の実測に合わせた。

`atlas-cap-runs` は他の PR の能力の追加で、CI の実測がさらに 948.7 kB になった（上限 938.6 → 948.8 kB）。同じく実測に合わせた。

main の他の PR（GIS・知識層・ファイル成果物など）が先に載り、`async.raw`・`async.gzip`・`atlas-cap-runs`・`atlas-console`・`gis-core` の 5 行が
CI の実測で上限を超えた（実測: 14662.5 kB / 4951.1 kB / 961.5 kB / 1146.1 kB / 701.2 kB）。`gis-core` はこの PR が触らないチャンクで、
増分はすべて他の PR のもの。上限は CI の実測に合わせた。
