---
title: 能力 1 つ＝宣言 1 つ——カタログの本文・planner の方針・カメラの事後条件・地図チップ・回答の族・監査の台帳を項目へ移し、カタログのブロックは項目の断片から組み立てる（モデルに渡るテキストはバイト同値）。カセットは順位だけを録る
date: 2026-10-02
---

〈依頼〉構造改革（「保守ではなく改革。基幹や根幹もいじってよい。全権を委任する。引き算ではなく足し算。固執ではなく
保全」）。監査が測った負債: 能力 153 件の記述が `js/atlas-cap-*.js`・`js/atlas-capabilities.js`（生成部分と手書き部分）・
`js/atlas-catalog-text.js`（ids と本文が**同じ行**のカタログ）・観測器・監査の名簿に分散し、1 つ足すのに 5〜7 か所。
同じ日の 6 本の PR がこれらで毎回衝突し、カタログの 1 行を 2 本が同時に書き換えて手で 3-way merge した。台本カセットは
カタログ文を逐語で持つので毎回作り直しが要った。

## 0. 測った（移行前）

能力 1 つが書かれていた場所（`HEAD` の実体から数えた）:

| 場所 | 何 | 件数 |
|---|---|---|
| `js/atlas-cap-<ns>.js` の項目 | 行・schema・run | 153 |
| `js/atlas-catalog-text.js` | 60 ブロック、各 1 行に `ids` と本文（141,013 バイトのファイル・本文 117,565 字） | 151 能力 |
| `js/atlas-capabilities.js` 手書き部分 | `WITHDRAWN`・`RULE_DOCUMENTED`・`FALLBACKS`・`FORBIDDEN_SUBSTITUTES`・`EQUIVALENTS`・`CAMERA_GOAL` | 1+1+5+7+3+4 |
| `js/atlas-console.js` | 地図チップ `OVL_OF` | 27 |
| `js/atlas-turn-results.js` | 回答の族 `ANSWER_CAPS` | 5 |
| `scripts/atlas-catalog.mjs` | 撤去の例外 `WITHDRAWN`（`monitor`、登録表と**別の鍵で 2 度目**） | 1 |
| `scripts/atlas-capability-audit.mjs` | ㉓ の台帳 `CATALOGUE_SILENT` | 61 |

カセット: `rail-request-reached-nothing.json` 206,923 バイト、`promoted-tool-runs-the-capability.json` 54,956、
`tokaido-route-answered.json` 33,367——中身の大半は find_capability の答えに入った**カタログ本文・要約・schema**。
どれも外から来たものではなく、再生する側が宣言から作れるもの。

## 1. 設計

- **項目が持つ欄**（`js/atlas-caps.js` `ENTRY_KEYS`。綴り違いの欄は読み込み時に名指しで拒む）:
  `row`・**`doc`**（`[{ in: <チャンク>, at: <位置>, text }]`。`text` は文字列か実行時の値を読む `(c) => …`）・
  **`phrases`**（`view.locate` の「現在地」表）・**`policy`**（`withdrawn`・`ruleDocumented`・`fallback`・`forbidden`・
  `equivalents`・`answer`）・**`goal`**（カメラの事後条件）・**`chips`**（地図チップ）・**`catalogueSilent`**（㉓ の台帳、
  値は測った日）・`schema`・`run`。
- **カタログ**: `js/atlas-catalog-text.js` は `CATALOGUE_CHUNKS`（チャンクの順・名前・見出し・各ブロックの経緯の
  コメント）だけを持つ（141,013 → 16,785 バイト）。ブロック＝見出し＋そのチャンクを名指す断片を `at` 順
  （`catalogueBlocks()`）。ブロックの `ids` も断片から決まる。⇒ **共有ブロックへ能力を足しても触るのは自分の項目だけ**。
  未宣言のチャンク・同じ `at`・誰も説明しないチャンクは組み立て時に名指しで拒む（黙って違うカタログを作らない）。
- **分割の位置**: 各能力の `{"type":"<綴り>"`（`|` で並んだ綴りも）が最初に現れる位置。検索の `docBlocks()` が
  証拠を能力へ帰属させる継ぎ目と同じなので、本文の持ち主と検索の帰属が一致する。最初の開始より前は見出し（全員に
  ついての文）。開始を持たないブロック（指標キーの 37 番）は見出しだけで、7 能力は `{ in: 'metric-keys' }` で名乗る。
  単一能力のブロックは丸ごとその能力の断片。リテラルは**生のソースのまま**切った（`⚠` などのエスケープを保つ）。
- **方針と事後条件**: 行と同じく起動時に要るので、`node scripts/atlas-caps.mjs --write` が登録表の
  `GENERATED POLICY`・`GENERATED CAMERA GOALS` へ写し、`check:capabilities` が照合する。`goal` は**ソースのまま**写す
  ので、自分の引数 `(a, raw, h)` 以外の名前を読むものは生成器が拒む（`freeNames`。`boxOf` は `h.boxOf` で渡す）。
- **チップと回答の族**: コンソールは `OVL_OF` を `chips` から、`js/atlas-turn-results.js` は回答の族を登録表の
  `isAnswer`（`policy.answer`）から導く。
- **監査**: ㉓ の台帳は項目の `catalogueSilent` から読む。⚠ 台帳は「減るだけ」だった——一覧が監査の中にあった間は
  そこへ足すのが見える差分だったが、項目の欄にすると新しい能力が黙って台帳に入れる。値を**測った日**にし、
  `LEDGER_CLOSED`（2026-09-18）より後の日付は名指しで拒む。撤去の例外は登録表（`policy.withdrawn`）から読む。
- **find_capability** を `find`（順位）と `describe`（順位を今の宣言で説明する）に分けた。

## 2. 移行と同値性の証拠

移行は機械で行った（チャンクの抽出と断片の書き込みはスクリプト、手で言い換えた断片は 0）。移行の前後で、node で
計算できるモデルに渡るものを全部取り出して比べた:

| 比べたもの | 結果 |
|---|---|
| `text(null)`（既定の文脈・番兵の文脈 {返答言語・モジュール一覧・指標キー}） | バイト同値（117,565 字） |
| 各ブロックの `ids`（集合）と長さ、`count`、`idsCovered` | 同値 |
| 153 能力それぞれの `text([id])`・`summaryFor`・`phrases` | 同値 |
| 登録表 `toJSON()`・`classify()`・`index([])`・`withdrawn()`・`ruleDocumented()` | 同値 |
| schema の表、`baseTools()`（モデルに渡す道具の定義） | 同値 |
| 121 の問い（問題集 2 本の全文・カセットの検索語・22 の代表語）の `search` 順位と `find_capability` の答え全体 | 同値（意味検索の所要時間 `semantic.ms` だけが時計の読み） |
| 地図チップ表 | 27 件同値 |

`SYS()` は上の索引・道具・カタログから組まれ、`js/atlas-console.js` 側の組み立ては変えていないので、system prompt も同値。

## 3. カセット

- 録るのは find_capability の答えの**順位**（`compactFind`: id・呼び名・確認・basis・意味検索の状態）。字句の答えは
  今までどおり再計算して順位を比べる。**意味検索の答え**（ネットワーク越しで再計算できない）は、録った順位を**今の
  宣言で説明し直して**ループへ返す（`surface.describe`）——「その時世界が返した答え」の再生の意味は保ち、モデルが今日
  見せられる説明を渡す。各一致は宣言の版 `v`（その能力について find_capability が述べることのハッシュ）を持ち、変わって
  いれば `notes` に `declaration_changed` として述べる（乖離ではない: ターンがしたことは同じで、渡される説明が新しい）。
- 12 本を再録: 206,923 → 9,163、54,956 → 3,426、33,367 → 3,530 バイト（他の 9 本は find を含まず不変）。
- 検査 ⑥: **全能力の説明文を書き換えた**製品で台本カセットを作り直しても、追跡しているカセットとバイト同値。
  意味検索の答えを持つカセットは、説明文が変わると乖離 0・`notes` あり、説明は書き換え後の本文。
- ⚠ 本番の録画（`scripts/atlas-eval.mjs` `cassetteOf`）はまだ答えを丸ごと録る。再生はどちらの形でも読める
  （余分な本文は使わない）が、録画時に `compactFind` を通せば版 `v` も残る——この回の範囲外で、残り。

## 4. 門

`tests/atlas-capability-single-source-checks.test.mjs` ⑤: 項目の外（`js/`・`src/`・`scripts/`、生成物の印の間を除く）に
**能力 ID をキーにした表**（2 件以上）か**能力 ID を並べた名前つきの一覧**（2 件以上・効果キーと同じ綴りは除く）が
あれば赤。別の宣言の欄が能力を名指すもの（レイヤーが自分に効く能力を挙げる）は相互参照なので数えない。
⚠ **門が見る欠陥を見せた**: 移行前の `HEAD` の 4 ファイルにかけると 7 表すべて（`FALLBACKS`・`FORBIDDEN_SUBSTITUTES`・
`EQUIVALENTS`・`CAMERA_GOAL`・`OVL_OF`・`ANSWER_CAPS`・`CATALOGUE_SILENT`）を名指す。新しい `check:*` は足していない。

## 5. 検査

- 新規 `tests/atlas-capability-single-source-checks.test.mjs`（7 本、それぞれ欠陥の fixture で赤くなるのを確かめる）。
- 既存の 22 件が赤くなった——全部が `js/atlas-catalog-text.js` を**ソースとして**読み、`ids: [...]` の行や本文を
  切り出す検査。組み立てたカタログ（`tests/helpers/atlas-kernel.mjs` の `catalogue()` / `catalogueText(ids)`）か
  項目のソースを読むように直した（主張は 1 つも弱めていない）。ほか `find`→`describe`、`OVL_OF` と回答の族の導出
  （チップの綴りを console の表から項目の `chips` へ読む先を移した 2 件を含む）、`js/atlas-catalog-text.js` が項目を
  import すること（それ自体はカーネルからしか読まれない）を反映。
- `check:catalog`・`check:capabilities`・`check:atlasrepeat`・`check:static`・`check:engine`・`check:types`・`check:i18n`・
  `check:surface`・`check:docs`・`check:archfiles`・`check:assets`・`check:testbudget` 緑。Atlas に触れる node 検査
  130 ファイル（2,403 件）緑。`node scripts/atlas-eval.mjs --replay` 12 本 緑。

## 5b. 起動費用（`check:perf` は赤——基準の引き上げが要る）

同じ機械で `HEAD` を別に build して比べた（`git archive` した木で）。差が出たのは **`atlas-console` チャンクだけ**で
**+11,151 バイト（raw、+1.0%）／ +7,005 バイト（gzip）**。中身は断片の包み（`{in:…,at:…,text:…}` が 241 個）、
チャンクの一覧、組み立て関数。起動経路（eager）は +181 バイト／gzip +21 バイト（登録表の生成部分）。
⚠ `async.gzip` の行は `HEAD` の時点ですでに基準より +15,471 バイト上にあり（幅 18.6 kB の内側）、この回の +7,015 で
幅を越えた。`tests/perf-baseline.json` の `atlas-console` と `async.gzip` を `node scripts/perf-budget.mjs --update` で
上げる必要がある（理由はこの節）。包みを詰めて隠すことはしなかった（読み手の欄名を失う割に数 kB）。

## 6. 残り

- 要約 `summaryFor` はブロックの最初の文のまま（`routing.route` の要約は「TOOLS/PANELS」）。断片を持った今、能力
  自身の断片から要約を作れるが、モデルに渡る文が変わるので同値性の外——別の回で、本番の評価と一緒に。
- `js/atlas-toolsurface.js` の `CORE`（常設の道具）と、コンソールの `effects: { 'system.control': … }` は能力ごとの
  記述として項目の外に残る（前者は道具の定義そのもの、後者はカーネルの関数を束ねる実行時の結合）。

## 起動費の天井（async）を上げた理由

増えたのは `atlas-console` チャンクだけ（+11,151 B・gzip +7,005 B）で、能力の断片を包むオブジェクト 241 個・チャンクの一覧・組み立て関数の分。起動経路は +181 B。`node scripts/perf-budget.mjs --update` で超えた行だけを上げた。
