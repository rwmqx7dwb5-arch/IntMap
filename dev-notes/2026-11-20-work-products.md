---
title: Atlas の成果物をデータセットだけでなく表・コード・画像・文書・チャート・分析にも広げ、一つの仕事に関連づけて保存・再利用できるようにした（work.job）
date: 2026-11-20
newsen: Atlas can now keep everything a job leaves — tables, code and its results, charts, images, documents, datasets and saved analyses — together under one job, pick the job up again later, compare two versions of a result and hand it over as a file.
newsjp: Atlas が、ひとつの仕事で作ったもの（表・コードと結果・グラフ・画像・文書・データセット・分析）をまとめて保存し、後日続きから再開したり、版どうしを比べたり、ファイルとして渡せるようになりました。
---

〈依頼（総合技術監査 5.14 / 3.5 / 8.1）〉 成果物がデータセットだけだったのを広げ、1 つの仕事に結びつけて保存・再利用できる
統一的な仕組みを作る。既存のエクスポート・保存・Python 出力・Notebook の技術は**再利用**し、二重実装しない。
Notebook の公開可否（`NOTEBOOK_SHOWN=false`）は変えない。

## 1. 何が無かったか（調査）

| 既にあった | 終点 |
|---|---|
| `data.gisExport`（`js/gis-export.js`） | データセット 1 つをファイルにするだけ。仕事との結びつき無し |
| `data.gisProject`（`js/gis-project.js`） | GIS の連鎖の recipe 保存。表・文書・チャートは入らない |
| `chart.compose` | 返信に描いて終わり。タブと共に消える |
| `compute.run` | コードと結果はデータセットとして残るが、コード自体と「何の仕事の一部か」は残らない |
| 添付（`ATTACH_LOG`） | 会話に属する。仕事の入力としての出所は残らない |
| 調査ノート（`js/atlas-notebook-store.js`） | 1 ターン＝1 記録。**非公開**。永続化・検索・版管理の技術は完成している |

## 2. 作ったもの

- **`js/atlas-work-store.js`**（DOM なし）— 成果物の種類 `PRODUCT_KINDS`（dataset / table / code / image / document / chart / analysis / answer）、
  仕事 `work`（目的・成果物・作業場・元になったターン）、版（同じ name+kind を保存すると次の版。前の版は残る）、
  版どうしの比較 `compareProducts`、作業場の選択 `chooseWorkspace`、Markdown／JSON 書き出し・取り込み。
- **`js/atlas-cap-work.js`** — 能力 `work.job`（綴り `work`）1 行。action: start / add / list / open / get / restore / compare / export / workspace / finish / remove。
- 永続化は**調査ノートの store 技法そのもの**: `makeNotebookStore(backend, norm)` に第 2 引数（正規化関数）を足し、work の正規化を渡した。
  キャッシュ・変更通知・IndexedDB/メモリのバックエンドは共有。DB 名だけ別（`intmap-atlas-work`）なので、ノートの一覧と混ざらず、
  ノートを再び公開しても work は現れない。既定の挙動（引数無し）は不変。

### 再利用した既存部品（二重実装しないことを検査で固定）

| 要る動作 | 呼ぶ先 |
|---|---|
| データセットの書き出し・ダウンロード | `gis-export.js` の `write()` / `save()`（任意のファイルのダウンロードにも `save()` を使う。独自の Blob 処理は書かない） |
| データセットの snapshot・復元 | GIS レジストリ（`window.IntMapData` の `get` / `add`） |
| チャート | `IntMapAtlasChart.render`（spec も保存するので再描画できる。`source` 無しは描画側が拒否し、拒否理由が返る） |
| 添付 | `ATTACH_LOG.find`（画像・テキスト）。PDF は添付のままモデルが読み、できた表を table として保存する |
| Python | `compute.run`。コードと結果（datasets / values）を `code` 成果物に保存（実行はしない） |
| 版比較（表） | ノートの `diffResults`（行は先頭列のキーで突き合わせ。並べ替えは変更とみなさない） |

## 3. 作業場の選択

`workspace` に仕事の**宣言された要件**（language / binaryFiles / network / geometry / persistFiles / packages）を渡すと、
要件を満たす作業場のうち最も軽いものを返し、満たさないものにはその理由を名前で返す。語句の一覧では判断しない。

| 作業場 | 状態 | できること |
|---|---|---|
| `reading` | ある | モデルが添付（PDF・画像・テキスト）を読んで表・文書を作る。コード無し。複数 PDF の比較表 |
| `gis` | ある | `gis` 能力の演算 |
| `pyodide` | ある | `compute.run`（ネットワーク無し・ページ無し・保存無し） |
| `server-files` | **このビルドには無い** | PDF/Excel をバイトで読むコード、タブを越えて残るファイル。サーバに利用者のコードを走らせる関数が無い（`supabase/functions`） |

`server-files` は実装していない（実装すれば利用者のコードをサーバで走らせる新しい攻撃面になり、費用・隔離・上限の設計が別途要る）。
代わりに**宣言として置き**、必要とする仕事には `not-in-this-build` を返して「できない」と言わせる。
架空の作業場を提示して失敗させるより、できないことを最初に述べるほうが正確。将来足すときは 1 行足し、`present:true` にするだけ。

## 4. 3 つの代表的な仕事がどう走るか

1. **複数 PDF から比較表** — `start`（needs 無し→reading）→ モデルが添付 PDF を読む → `add kind:table from.attachment:…`（出所を残す）→ 追加の PDF で同名の表をもう一度 `add` → 版 2 → `compare`（追加・削除・変更の行）。
2. **公開データからグラフ付き資料** — `gis`/`gisRemote` でデータ取得 → `add kind:dataset from.dataset` → `add kind:chart spec`（描画して保存）→ `add kind:document` → `export as:md`。
3. **コードを書いて計算し説明** — `workspace needs:{language:python}` → `compute.run` → `add kind:code`（コード＋結果）→ `add kind:answer`。後日 `start id` で続きから、`restore` でデータセットをセッションに戻す。

## 5. 限界（実測した範囲／していない範囲）

- 検証は Node（stand-in の頁）で、ストア規則・能力の全 action・永続化（別 store 越しの再読込）・ダウンロードの呼び出し・refusal の名前まで。
  実ブラウザでの IndexedDB 書き込みと実ファイルのダウンロードは、ノートの `idbBackend` と `gis-export.save` が既に使っている経路で、本作業では**実ブラウザでは未実測**。
- 1 成果物の上限（表 4 MiB・コード 1 MiB…）は IndexedDB の割当を 1 件で食い潰さないための値で、実測した割当ではない。超えたら `too-large` で拒否し、ファイル書き出しへ誘導する（切り詰めない）。
- アカウント同期はしない（端末内のみ）。ノートと同じ同期は、ノートを公開する判断と一緒に検討する話で、ここでは触っていない。
- 能力は 251→252。ノートの 3 能力は撤去済みのまま。

## 6. テスト

`tests/work-products-checks.test.mjs`（10 本）: 種類ごとの保存と名前付き拒否 / 版と比較（並べ替え不変・キー重複の明示）/ テキスト比較 /
作業場の選択（要件・不在の理由・未ロード）/ 永続化の再利用（別 store で再読込）/ ファイル往復 / CSV の RFC 4180 /
能力の全 action（「翌日」を模した再開を含む）/ 拒否の名前 / ノートが非公開のまま・独自のダウンロード処理を持たないこと。

## main 取り込み後の perf 天井(2026-11-21)

`work.job`(js/atlas-cap-work.js・js/atlas-work-store.js)は能力モジュールで、`atlas-cap-runs` の async chunk に入る(main の天井 909.0 に対し 928.4 kB。work.job 分)。
起動(eager)には入らず、作業を開いたときだけ読まれる。`async.gzip`・`dist.total`・`dist.assets` の天井も同じ `--update` で上げた(main 側の増加分を含む)。
能力は 255 になり、能力数を述べる文書(DECISIONS・PRODUCT・docs/FILES・docs/architecture/02-features)を実測に合わせた。
`js/atlas-capabilities.js` の行は `node scripts/atlas-caps.mjs --write` が各能力ファイルから導出する(取り込みの merge driver が再生成するため、手で足した行は残らない)。

`atlas-console` の async chunk も上がった(1105.8 → 1113.7 kB)。`work.job` の案内文(`js/atlas-catalog-text.js` が能力の語から導く)が Atlas の本体側に入るため。
`atlas-cap-runs` は 944.2 kB。どちらも起動(eager)には入らない。main の最新を取り込むたびに天井は main の実測へ動くので、この値は取り込み時点のもの。

main 取り込み後の CI 実測で `async.raw`・`async.gzip`・`atlas-cap-runs`(970.8 kB)・`atlas-console`(1145.6 kB)・`gis-core`(701.2 kB) の天井を実測へ上げた。
増えた分は `work.job` と、main 側で同時に入った能力・GIS の async chunk で、起動(eager)には入らない。

main の再取り込み(2026-11-24)後の実測で `atlas-cap-runs` は 1006.4 kB、`atlas-console` は 1159.8 kB、`async.raw`・`async.gzip`・`dist.assets` も上げた。増分は `work.job` と main 側の能力で、どちらも起動(eager)には入らない。

2026-11-24 の再取り込み後の実測で `atlas-cap-runs` を 1014.4 kB へ上げた(`work.job` と main 側の能力の合計。起動には入らない)。

2026-11-24 の再々取り込み後の実測で `atlas-cap-runs` を 1020.3 kB、`atlas-console` を 1166.8 kB へ上げた(`work.job` と main 側の能力。起動には入らない)。能力は 273。
