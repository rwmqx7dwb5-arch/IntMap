# IntMap — この数字はどこから来たか (Data governance)

> **この文書が正本なもの**: 出自・権利・鮮度・完全性・優先度・重複の**語彙**／governance の記録が
> **どこに住むか**（束自身・builder・レイヤー登録の 3 か所と、その理由）／`npm run check:datagov` が
> **何を拒み、何を拒まないか**／台帳 `data/governance-ledger.json` が**何であって何でないか**／
> 「読者がどこで辿れるか」と「Atlas が何を答えられるか」。
>
> 機械の正本は [`../js/data-governance.js`](../js/data-governance.js)（語彙）と
> `scripts/data-governance.mjs`（門）。**この文書に値を書き写さない**——ライセンスの表も、束の一覧も、
> 閾値も、ここには無い。主題別の正本（選挙・企業・航空・ニュース・火山）は
> [`README.md`](README.md) の表が引く。

---

## 0. なぜこの文書があるのか — 一般規則が註としてしか存在しなかった

`scripts/build-cshapes.mjs:372` は、#R717 以来こう述べていた:

> The general rule — every shipped data bundle's `src` names its licence — is
> `scripts/doc-facts.mjs`'s `bundle-licence`, whose universe is discovered from data/.

⚠⚠⚠ **その規則は存在しなかった。** 実測（#729 着手時）: `bundle-licen` という綴りは**この文 1 か所にしか無く**、
`doc-facts.mjs` の 48 個の rule id にも無かった。一般規則の唯一の記述が、**書かれなかった実装への指差し**だった。

その結果として測れたもの（門が自分で数え上げた母集合。`node scripts/data-governance.mjs --check` が
毎回この行を印字する）:

| 測ったもの | 実測 |
|---|---|
| `data/` の論理データセット | **72**（ファイル 66 ＋ シャードのディレクトリ 6。後者は 7,529 ファイルを持つ） |
| `data/` へ書き込む script | **43**（追跡された `.mjs` 226 本のうち） |
| 読者向けの出典行 `DATA_SOURCES` | **175** |
| 出自を 1 欄も述べていない主題 | **130**（欄の数では 1,876） |

⚠ ライセンスを名乗らない側に **9.31 MB の `ecoregions_2017`** と **2.09 MB の `subcables`** が居た。
`npm test` は全部緑で、`check:docs` も緑だった——**測っているものの中にそれが無かった**
（memory `intmap-licence-must-be-a-value`。同じ形で **CC BY 3.0 の Pleiades 由来の行が
帰属表示ゼロで出荷された**ことが既に 1 度ある）。

---

## 1. 欠陥の形 — 3 つの世界が一度も突き合わされていなかった

| 世界 | 実装 | ライセンスは | 覆う範囲 |
|---|---|---|---|
| ① セッション内の provenance | `js/gis-datasets.js` ＋ `js/gis-export.js` ＋ `js/gis-project.js` | **値**（唯一） | **読者が地図に落としたデータだけ**。IntMap が出荷するデータを 1 束も覆わない |
| ② 読者向けの出典 | `js/reference-data.js:158` `DATA_SOURCES` | **散文**（`n` という**名前の中**） | 読者が見るもの全部 |
| ③ 束自身の申告 | 各束の `src` 文字列 | 散文（`/CC0/.test(d.src)` で検査） | 束ごとに独立 |

⚠ **①の語彙は 1 ファイルの closure の中に閉じていた**（`js/gis-export.js` の `INTEROP`）。
正しく、完全で、**他のどこからも届かなかった**。だから `data/` へ書く 43 本の builder は自分の綴り
（`src`・`generated`・`lic`）を使い、②は 3 つ目の綴りを使った。

⚠ **②の結合鍵は人間可読な名前である。** `js/reference-data.js:568` の `useText` が
`DATA_SOURCES.find(s => s.n === name)` で引く。ライセンス条件はその `n` の**文の中**にあった:

```
{n:"Country facts — mledoze/countries (…; ODbL 1.0, build time only)", u:'…'}
```

ODbL 1.0 は帰属表示が**再配布の条件**である。それが名前という散文の中にあった。
**次にこの文を読むのはプログラムではない。**

⚠ **③を突き合わせる機構は 2 本だけあり、どちらも自分のことしか訊かなかった。**
`build-cshapes.mjs:480` と `build-hist-cities.mjs:200` が、`const DATA_SOURCES=\[[\s\S]*?\n  \];` を
**それぞれ自分で正規表現で切り出して**「自分の publisher 名の行があるか」を判定していた。
残り 67 束は `DATA_SOURCES` と無関係だった。⚠ **規則が関数に付いていて、事実に付いていなかった**
（`.agents/rules/no-ad-hoc-hardcoding.md` §3 の 2 問目——「次に同じ経路を通る新しいコードにも効くか」）。

---

## 2. 語彙 — `js/data-governance.js`

⚠ **このファイルは値を 1 つも持たない。** 出典の表も、ライセンスの一覧も、束の名前も無い。
述べるのは**述べる者**であって、ここはその述べ方を 1 つに決めるだけ
（`.agents/rules/no-ad-hoc-hardcoding.md` §2-4。手で並べた一覧は次に足されたものを黙って落とす）。

| 輸出 | 何であるか |
|---|---|
| `SPELLINGS` | 1 つの事実の**綴りの群**。⚠ **`licence` と `license` が 1 つの事実であると述べる、リポジトリで唯一の場所**。`js/gis-export.js` の `INTEROP` がここへ昇った |
| `statedValue(obj, group)` | その群のうち obj が**実際に持っている**最初の値、または `null`。⚠ **空文字と空配列は主張ではない**——誰かが空にした licence 欄が licence の主張になってはならない |
| `FACETS` / `SUBJECTS` | governance の**宣言された欄**（19 個・5 主題）。`SUBJECTS` は `FACETS` の接頭辞から**導出**する（書き写した一覧は、欄が増えたときに主題を落とす） |
| `REASONS` | **なぜその欄が沈黙しているか**の語彙。⚠ 全部が**観測**であって既定値ではない——理由の無い欄は「述べられた」欄である |
| `FRESHNESS` | `fresh` / `aging` / `stale` / `unknown` |
| `read(x)` | 束のバイト・builder の定数・レイヤー登録・GIS 記録の `provenance` の**どれから来ても 1 つの読み方**。⚠ `raw` で全体を verbatim に運ぶ（欄の写しにしない） |
| `freshness(x, now)` | 鮮度の判定と**その理由** |
| `attribution(x)` | **表示文を値から導出する**。逆はしない |
| `account(x, opts)` | 各欄を `stated` / `undeclared(why)` / `notApplicable(why)` の**どれか 1 つ**に入れる |
| `measureQuality(rows, opts)` | 欠損・範囲外・重複・**数でない値**の件数 |

### 2.1 ⚠⚠⚠ 3 つの「いつ」は 3 つの別の事実である

| 欄 | 何を述べるか |
|---|---|
| `retrievedAt` | **この写しが**上流から取られた時刻 |
| `generatedAt` | **この写しが** builder によって書かれた時刻 |
| `asOf` | **データが何について**のものか |

2017 年の上流から今日リビルドした束は、**古い世界についての新しいファイル**である。
3 つを 1 つに畳むと、この文が言えなくなる。

### 2.2 ⚠⚠⚠ `unknown` は弱い `stale` ではない

- `stale` ＝ **宣言された周期より古い**。観測である。
- `unknown` ＝ **測る物差しが無い**。周期を誰も述べていない。

読者が要るものが別である——`stale` は取り直せば直り、`unknown` は**誰かが周期を述べる**まで直らない。
⚠ この 2 つに同じ答えを返す機構を作ってはならない（`.agents/rules/one-pass-or-a-reason.md` §5——
「確認できなかった」は失敗ではない。memory `intmap-atlas-failed-because-intmap-said-so`）。

⚠ `static`（固定された入力から導出され、次の更新が存在しない）は **`fresh` であって
`unknown` ではない**。「更新されない」は鮮度についての答えであって、答えの不在ではない。

### 2.3 ⚠ 多上流の束は、最も厳しい義務を残す

`data/hist-cities.json` は 3 つの上流（OHM・Pleiades・Wikidata）を 1 束に持ち、739 行が一方から
2,245 行が他方から来ている。**ファイル 1 つに 1 つのライセンス**は、どの上流も述べていない主張である。
⇒ `read()` は `upstreams[]` を返し、束の欄は**全行に成り立つもの**だけを名乗る。
⚠ **1 つでも帰属表示を要求すれば束は要求する。1 つでも沈黙していれば答えは `null` で、`false` ではない**
（沈黙は「不要」ではない——`js/gis-sources.js` §3.1 が coverage について述べている同じ規則）。

---

## 3. 記録はどこに住むか — 3 か所と、それぞれの理由

| どこ | 何を述べる | なぜそこか |
|---|---|---|
| **束自身のバイト**（`gov` / `rights`） | 出荷物の出自と条件 | **リポジトリを持たない読者にも届く唯一の場所。** 束だけ持っている人が「誰の仕事が入っているか」を読める |
| **builder の `export const GOVERNANCE`** | その builder が出す束の出自 | 束の正本。⚠ **既にある `LICENCE` 定数を写さず参照する**——同じ文字列を 2 か所に持たせた瞬間に離れる |
| **レイヤー登録の `rights`**（`js/map-ui.js`） | **実行時に上流へ行く**レイヤーの出自 | 同梱されていないので束が無い。`source()` の散文はここから**導出**される |

⚠ **束への書き込みは次のリビルドが運ぶ。** #729 は宣言を builder 側に置いた——165 MB を
再取得せずに正本を作るため。⇒ **束のバイトと builder の宣言が食い違いうる期間がある**ので、
門はその 2 つを突き合わせる（§4）。

---

## 4. 門 — `npm run check:datagov`

⚠⚠⚠ **母集合は発見する。手で並べない。**

- **束**: `git ls-files data` から。⚠ `border-detail/`・`railways/`・`companies/`・`elections/` などの
  シャード群は**論理的に 1 データセット**なので、その索引 1 件として数える（実測 6 ディレクトリが
  7,529 ファイルを持つ）。**索引を持たないシャード群はそれ自体が欠陥**——実測で 1 件
  （`data/planets/` の 9 枚）。⚠ 束ごとに `rights` を数千回写させるのは、この回が消している重複そのもの。
- **builder**: `scripts/**/*.mjs` のうち **`data/` へ書き込むもの**。⚠ **名前（`build-` で始まる）で
  数えない**——事実（`data/` へ書くか）で数える。

### 4.1 拒むもの／拒まないもの

⚠⚠⚠ **門が拒むのは沈黙であって、古さではない。**

| 状態 | 門の答え |
|---|---|
| 周期を述べていない | **落第** |
| 述べた周期より古い | **note**（exit 0 を妨げない） |
| 異常値・重複が在る | **落第にしない**（§5） |
| 測っていない | **落第**（`not-measured` は述べるべき事実） |

理由: 閾値に著者が無い判定でデータを拒むと、**誤検出が正しいデータを消す**。閾値には
①観測 ②失効条件 ③正本 が要る（`.agents/rules/no-ad-hoc-hardcoding.md` §4）。
IntMap は 69 束ぶんの「この欄の正常範囲」を持っていないので、**持っていないことを述べる**。

### 4.2 台帳 `data/governance-ledger.json`

⚠ **`counts` は下向きにしか動かない床である。**
- 台帳に無い新しい違反 → 落第
- 実測より台帳が**大きい**（＝直したのに縮めていない） → 落第
- 実測より台帳が**小さい**（＝新しい違反） → 落第

⚠⚠⚠ **台帳は「やらなかったこと」の記録であって、免責ではない。**
載っている 1 行は「この束の出自を誰も述べていない」という、読者に対する未払いである。

---

## 5. 欠損・異常値・重複 — 測るが、拒まない

`measureQuality(rows, {fields, key})` が返すのは**件数**であって判定ではない。

- **範囲は宣言者のもの**。`fields` は `{name:{min,max}}` で、**builder が上流の文書から**書く。
  範囲を述べていない列は「在るか無いか」だけ数え、**範囲外とは決して数えない**
  ——「範囲を述べていない」は「0〜1」ではない。
- ⚠ **「数でない値」は「範囲外」ではない。** 型の問題であって、範囲の問題ではない。
  別の名前（`notNumeric`）で数える——違う欠陥を同じ数に混ぜると、直し方を間違える。
- **重複の同一性は宣言する。** `key` が無い束は `duplicates` を**測っていない**と述べる。
  ⚠ 幾何が同じことは同じ場所であることではない（`js/world-packs.js` の `dedupeSameShape` は
  **形**についての機構である）。自分で同一性を発明する重複検出は、
  「東京都」と「東京市」のどちらかを消す。

---

## 6. 読者と Atlas — 「この数字はどこから来た？」の 2 つの読み手

⚠ **読み手は 1 人ではない**（memory `intmap-fixing-the-bundle-did-not-fix-the-map`）。

| 読み手 | 経路 | 何が出るか |
|---|---|---|
| **読者** | すでに開ける出典の一覧と、すでに出ている `source()` の副文 | 宣言があるときだけ、静かに 1 行。⚠ **新しいボタン・パネル・バッジを作らない**（利用者の指示）。宣言が無ければ**何も変わらない**——「不明」と書かない |
| **Atlas** | `js/gis-atlas.js` の `PREFETCH_SLOTS` ＋ `prefetch()` | `FACETS` から**導出**した欄。⚠ **欄を手で写さない**（`datasetRow()` の `fields`／`coverage` と同じ projection。写した一覧は、片方しか知らない欄を蒸発させる——memory `intmap-two-readers-one-field-list`） |

⚠ `freshness.verdict` は**カーネル自身の測定**であって供給者の沈黙ではないので、
`unknown` でも `stated` に入り `derived:true` を持つ（#R759 が導出 coverage に与えた形）。

---

## 7. まだ届いていないもの（正直に）

- **束のバイトへの `gov` 書き込みは次のリビルドが運ぶ。** #729 は builder 側に宣言を置いた。
- **台帳に載っている束の出自は、まだ誰も述べていない。** ⚠ **推測で埋めてはならない**
  （memory `intmap-data-must-not-claim-an-author-it-lacks`——9 言語の欄を英語綴りの写しで埋めて
  67,622 行が偽の著者を名乗った実例がある）。埋めるのは**上流に訊いてから**。
- **上流の変化を見るのは 1 本だけ**（`build-hist-eras.mjs --check-upstream`）。残りの builder の
  上流が黙って変わっても誰も気づかない（memory `intmap-discovered-list-is-a-photograph` と同じ形）。
- **`source priority` は値になっていない。** 同じ事実の複数上流は主題ごとの散文 ladder として
  `js/world-packs.js`・`js/time-borders.js`・`js/reference-data.js` に埋まっている。`FACETS` に
  `precedence.*` の欄はあるが、**述べている実装はまだ無い**。
