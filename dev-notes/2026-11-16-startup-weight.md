---
title: 起動時のコードと Atlas カーネルを軽くする——能力の実行コードを別チャンクに、ドローン計画とシミュレータ 4 種を遅延へ
date: 2026-11-16
pr: 1152
internal: 読者に見える機能・文言は変わらない。変わるのは初回に落ちてくるコードの量で、この端末では起動時間の差を分散の外で測れなかった（§3）ので、速くなったとは告知しない
---

〈依頼〉起動時に読むコード（`tests/perf-baseline.json` の eager）と、1 塊の `atlas-console` チャンクを、機能と到達経路を 1 つも落とさずに小さくする。

## 0. 測った（vite build・`.perf/build-report.json`・前は origin/main 3ac7ed32、後はこの branch）

| | 前 | 後 |
|---|---|---|
| 起動時（eager）raw | 4,883,639 B | 4,724,799 B（−158,840） |
| 　gzip / brotli | 1,607,965 / 1,215,801 B | 1,547,734 / 1,173,449 B |
| 　モジュール / リクエスト | 896 / 9 | 890 / 9 |
| Atlas を最初に開くときに落ちてくる量（`atlas-console` とその静的依存チャンク） | 1,883,473 B（gzip 697,957） | 1,388,252 B（gzip 516,334）−26 % |
| 　うち `atlas-console` チャンク単体 | 1,558,937 B | 約 0.97 MB |
| 能力の実行コード `atlas-cap-runs`（初めて能力が実行されるときに届く） | — | 約 0.55 MB |

`atlas-console` 単体の数字は分割の効果を大きく見せる——共有モジュールが別チャンク（`atlas-deadlines` など）へ移るだけでも縮むので、
効果は「カーネルが静的に読むチャンク全体」で測った（下の 2 で、この物差しが 12 % を 26 % に直す欠陥を見つけた）。

## 1. 何をしたか

- **Atlas: カーネルは能力の「データ」、実行は後から。** 最初の質問に要るのは各能力の行・schema・カタログ文・phrases・方針・チップで、
  `run` はモデルが呼んだときだけ。`scripts/atlas-caps-split.mjs`（`vite.config.js`、build と dev）が、カーネルの読む
  `js/atlas-caps-modules.js` の各能力ファイルを `?atlas-cap-meta` の写し（`run` を `js/atlas-caps.js` の `makeCapRunDoor` 経由の
  呼び出しに置き換えたもの）に差し替え、本物は 1 本の `import()` の先のチャンク `atlas-cap-runs` に置く。ソースは分けない。
  写しと本体は同じファイルの 2 インスタンスなので、最上位に状態（`let`／`var`／実行文）を持つ能力ファイルは build が拒む。
- **起動側:** ドローン計画（`drone`＋`droneOps`）と `js/sims.js` の 4 つ（`radiation`／`popArea`／`sun`／`transitReach`）を
  `LAZY_REGISTRY` へ。入口（Tools の行・右クリック・描画ツール・Atlas の能力・共有リンクの状態）は先に `IntMapLazy.need` を呼ぶ。
  共有リンクのキー（`drone`／`radiation`／`sun`）は遅延名と同じなので、`IntMapShareState.apply` がそのまま取りに行く
  （そのためにドローンの factory を `droneNav` → `drone` に改名）。Atlas の能力は行の第 10 列で宣言し executor が実行前に取る。
- 法務文の遅延化は main（#1105 の `legalText`）が先に入れていたので、こちらの実装は捨てて main のものを採った。

## 2. 否定された／直した見立て

- **能力ファイルごとに 25 チャンク**にした初版は、`atlas-cap-time` と地図文書のチャンクが本体抜きで `js/chronos.js`・`js/map-state.js`
  を読むため束ね器がこの 2 つを起動チャンクへ畳まなくなり、**起動のリクエストが 9 → 11** に増えた → 1 チャンクに。
- 仮想モジュールの id を `\0` で始めたら、`vite.config.js` の `maplibre-gl` group が「束ね器の補助」として依存ごと起動チャンクへ
  取り込み **eager raw 4.71 → 5.73 MB** → 普通の名前に。
- 能力ファイル同士の import（`droneRun`・`queryEngine` など）が写しからも本物を指していて、data・sim・routing・places の本体
  （約 296 kB）がカーネルの静的依存チャンクに乗っていた（効果が −12 % にとどまった原因）→ 写しの中の能力ファイルへの import は写しを指す。
  検査 ⑤ はカーネルの静的依存チャンク全体に本物が無いことを測る。

## 3. 起動時間

`node scripts/frame-profile.mjs --boot --mobile --reps 6`（CPU ÷4・HTTP キャッシュ無効）を同じサーバの配信元を入れ替えて交互に測ったが、
**同じ build の 2 回の計測で初回描画の中央値が 3.0 s と 6.0 s に割れた**（並行セッションの負荷）。main は 4.5 s と 4.9 s。
差は分散の内側で、速くなったとは言えない。言えるのは計器が数えた起動時の JS 転送量 **2,036 kB → 1,977 kB** だけ。

## 4. 基準を上げたもの（`check:perf --update`）と、共有窓口

- `async.raw`／`async.gzip`・`dist.assets` が増えた——async 合計は main 13,343,523 → 13,826,290 B（+482,767・gzip +183,524）。
  内訳は起動から外した約 160 kB と、能力のデータ部分が写しと本体の両方に配られる分（約 320 kB）。読者が実際に落とす量は
  起動時で −159 kB、Atlas を開くときで −495 kB、能力を初めて実行したときに初めて残りが届く。`atlas-notebook` チャンクは、カーネルと実行コードの両方が読むようになって独立チャンク（0.3 → 22.3 kB）になった
  （以前はカーネルの中にあった同じコード）。
- `check:surface`: `window.IntMapLazy` の読みが 7、`window.IntMapDroneOps` が 1 増えた（入口ごとに「先に取る」呼び出しが足されたため・
  `IntMapLazy` は app-body が組み立てる窓口で import できる所有者が無い）。

## 5. 検査

`tests/startup-weight-checks.test.mjs`（写しは `run` 以外が本物と同じ・状態を持つ能力ファイルを拒む・扉の振る舞い・起動グラフから外れたことと
入口が先に取ること・build の報告が同じことを言う）。旧配線を固定していた検査（`geo-drone-planner`・`layer-aircraft`・`layer-boot-graph`・
`sim-tools-wiring`・`shell-layer-panel`・`tests/r209.spec.js` の MEMBER）を新しい事実へ。ブラウザで `IntMapOS.execute('view.projection')` を
実行し、`atlas-cap-runs` がその時に初めて届き実行が `completed` になること、`sim.sunPosition`／`routing.drone` がパネルを開くことを確かめた
（main でも同じ 2 つは `failed` を返す——観測器の判定で、この変更とは別）。
