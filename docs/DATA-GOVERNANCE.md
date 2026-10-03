# IntMap — この数字はどこから来たか (Data governance)

> **この文書が正本なもの**: 出自・権利・鮮度・完全性・優先度・重複の**語彙**／governance の記録が
> **どこに住むか**（束自身・builder・レイヤー登録の 3 か所と、その理由）／`npm run check:datagov` が
> **何を拒み、何を拒まないか**／台帳 `data/governance-ledger.json` が**何であって何でないか**／
> 「読者がどこで辿れるか」と「Atlas が何を答えられるか」／**読者のブラウザが通信するホストと、
> それをプライバシー §4 が述べているかの照合**（§4.3。台帳 `scripts/outbound-hosts.json`）。
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
- **builder**: `scripts/**/*.mjs` のうち **`data/` へ書き込むもの、または `export const GOVERNANCE`
  で `data/…` を名指すもの**。⚠ **名前（`build-` で始まる）で数えない**——事実で数える。
  ⚠ 後者は 2026-09-30 に足した。書き込み先を `path.join(OUT_DIR, 'x')` で組み立てる builder は
  書き込みの検出から漏れ、**宣言ごと読まれていなかった**（`build-star-catalogue`・`build-tle-snapshot`・
  `build-who-don`・`build-world-basemap` の 4 本が宣言を持ったまま主題でなかった）。`data/…` を鍵に持つ
  宣言は、どの束のものかを書き込み呼び出しより正確に述べている。

### 4.1 拒むもの／拒まないもの

⚠⚠⚠ **門が拒むのは沈黙であって、古さではない。**

| 状態 | 門の答え |
|---|---|
| 周期を述べていない | **落第**（台帳での免除は無い。§4.4） |
| 周期に根拠（`cadenceBasis` の observed / expires / canon）が無い | **落第** |
| 語彙が解釈できない周期（`P1W` など） | **落第**（「周期を述べていない」とは別の名前で） |
| 1 つの束を 2 つの script が宣言している | **落第** |
| 日付が測れない（shallow clone など） | **note**（`unknown`。「新しい」とも「古い」とも言わない） |
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

### 4.3 通信先 — 読者のブラウザは誰と話すか（規則 `outbound-disclosed`）

出自のもう半分。**同梱した束ではなく、実行時にブラウザが要求するホスト**について、
プライバシーポリシーの §4（`js/legal-text.js`、en と jp）がそれを述べているかを測る。
⚠ それまで §4 は**コードと一度も照合されていなかった**（実測は開発記録
`dev-notes/2026-09-29-outbound-hosts-disclosed.md`）。

| 部品 | 何をするか |
|---|---|
| `scripts/outbound-hosts.mjs` | **母集合を発見する**——`git ls-files` の `js/`・`src/`・配信する `*.html`・`sw.js`・`css/` を acorn で読み、**文字列とテンプレートのリテラルに現れる** `https?://` のホストを集める（コメントは要求ではない）。`+` で組み立てた URL も 1 本の文として読む |
| 同上 | **リンクを文脈で決める**——`<a href>`（連結で組み立てたものも）・XML 名前空間・`window.open` / `location` への代入・DATA_SOURCES の `u`・`SPELLINGS.licenceUrl` の値・**licence／attribution を述べる記録の `url`**・`<meta>`・要求しない `<link rel>`。ホストではなく**出現**を分類する（同じホストがリンクでも要求でもありうる） |
| `scripts/outbound-hosts.json` | **判断の置き場**。ホストごとに `what`・`sends`（符号: `nothing` / `coordinates` / `area` / `query-text` / `url` / `identifier` / `credential-prefix` / `content` / `page-visit` ＋補足）と、次の **1 つ**: `disclosure`（§4 の **en と jp の両方に実在する**語句）／`link`（要求しない理由）／`dormant`（`index.html` の `window.<SWITCH>=false` の後ろにある）／`removedBy`（撤去中・着地で消す） |

門が拒むもの:
1. **要求しうるのに台帳に無いホスト**
2. **§4 に無い開示の語句**（片方の言語だけでも）。§4 は `js/legal-text.js` を**評価して**、
   読者に出る文から読む（`${LEGAL_DATE}` の補間も含めて、grep ではない）
3. **コードがもう要求しないのに台帳に残る行**（台帳が古びない）
4. `dormant` の**スイッチが `true` になった**行（その日から §4 が名指さなければならない）

⚠ **台帳は免責ではない。** `disclosure` は「§4 のこの語句がこれを述べている」という主張で、
門がその語句の実在を両言語で確かめる。

### 4.4 鮮度 — 「最後に書かれた日 × 宣言された周期」（規則 `freshness-stated`）

⚠ **実測（2026-09-30、この節の前）: fresh 1 / aging 0 / stale 0 / unknown 129。** 語彙の
`freshness()` は最初から判定できたが、**1 つの記録に日付と周期の両方を訊く**。このリポジトリでは
2 つは別の場所に住む——**周期は上流についての事実**なので builder の宣言に、**日付はバイトに
ついての事実**なので束の側に。builder のソースは自分が最後にいつ走ったかを知らない。
片方だけに訊けば毎回 `unknown` になる。⇒ 門は 2 つを、それぞれ分かる場所から取って結ぶ:

| 半分 | どこから | 注意 |
|---|---|---|
| 周期 | 束のパスを鍵にした宣言（builder の `GOVERNANCE`、builder が居ない束は `scripts/data-unbuilt.mjs`）、または束自身の in-band 記録 | 1 束に 2 つの周期／2 つの宣言者は落第 |
| 日付 | ① 束自身の in-band `generatedAt` / `retrievedAt` ② 無ければ**そのバイトを最後に変えたコミット** ③ git の外の集合は、その sha256 を `data-assets.json` に記録したコミット | ⚠ コミット日は「最後に**変わった**日」。同じバイトを再現したリビルドはコミットを残さない（実際より古く読める）。どの行も日付の出所を述べる |

⚠ **shallow clone は日付を持たない。** CI は 1 コミットだけを取り出すので、そこで訊けば全部が
「今日書かれた」＝新しいことになる。そのときは日付を**測れなかった**と述べ（`no-date`、note）、
新しいとも古いとも言わない。

**周期とは何か**（正本 `scripts/lib/upstream-cadence.mjs` の冒頭）: 「その上流が、**この束が運ぶ
種類の**新しいものを出すまでの期間」。地名辞典なら日々の dump、気候値なら新しい 1 年分、選挙結果
なら次の選挙。⚠ **このリポジトリが取り直す頻度ではない**（それは供給者の周期ではない）。
複数の上流を読む束は、運ぶものを出す上流のうち**最も短い**周期を取る。**上流ごとの周期は
`scripts/lib/upstream-cadence.mjs` に 1 回だけ**書かれ、builder はそれを展開する（Natural Earth を
読む builder は 4 本あり、周期を 4 回書かない）。1 本しか読まない上流の周期と `static`（版が閉じている
上流）は、その builder の記録に直接書く。

⚠ **どの周期にも根拠が要る**（`cadenceBasis`: `observed`＝何をいつ測った・読んだか、測っていなければ
「estimate」と書く ／ `expires`＝何が変われば誤りになるか ／ `canon`＝どこが正本か）。`static` も例外ではない
——「更新されない」には理由が要る。宣言の数と今日の集計は `node scripts/data-governance.mjs --report`
が毎回印字する（数をここに書き写さない）。

### 4.5 上流の死活 — 読者のブラウザが話すホストは、まだ答えるか（規則 `probe-declared`）

`scripts/outbound-hosts.json` の**ブラウザが実際に要求する行**（`disclosure` / `removedBy`）は、
代表の要求を 1 つ持つ: `probe: { url, expect?, why? }`。

- `url` は**その行のホスト**に向かう（ワイルドカードの行は、それが名指すホストの 1 つ）。別のホストを
  訊く probe は別の事実を測る——門が落とす。
- `expect` の既定は 2xx。⚠ **2xx 以外を期待するなら `why` が要る**（例: 自前の gateway は anon key 無しに
  401 を返す——それが「生きている」答え）。理由を要求しないと、失敗し始めた probe を「その失敗が
  期待値」と書き換えて緑にできてしまう。
- 要求しない行（`link` / `dormant`）は probe を持たない——IntMap のデータ経路ではない。
- 持たせられない行は `probe: { none: "<理由>" }`。

`check:datagov` は宣言だけを（ネットワーク無しで）確かめる。**訊くのは毎晩の
`.github/workflows/upstream-liveness.yml`** で、`scripts/upstream-liveness.mjs` が全部を並列に 1 回ずつ
訊き、`scripts/lib/upstream.mjs` の `classify()`——builder が使うのと**同じ判定**——で分類する:

| 判定 | 意味 |
|---|---|
| `alive` | 宣言した状態で答えた |
| `refused` | 答えて、断った（4xx・429・宣言外の状態） |
| `dead` | 答えなかった（時間切れ・接続拒否・DNS）か 5xx |
| `unobserved` | **この runner がどこにも届かなかった**——上流ではなく runner の網が落ちている |

⚠ **「確認できなかった」は「死んでいる」ではない。** 読み方・赤くなる条件は
[`MONITORING.md`](MONITORING.md) §1e。

### 4.6 自動更新 — どの束を、いつ、無人で取り直すか（規則 `refresh-safe`）

⚠ **実測（2026-09-30、この節の前）: `data/` へ書く script のうち定期実行されていたのは
`build-tle-snapshot.mjs` だけ**（`.github/workflows/tle-refresh.yml`、1 日 2 回）。他は、人がたまたま
builder を走らせた日のまま（spacecraft・small-bodies 08-10、osm-diplo 08-19、subcables 08-23、npp 09-09）。

`tle-refresh.yml` は既に、無人更新の難しい部分——ruleset で守られた `main` への bot PR・自分が起こした
検査の承認・merge・deploy の起動——を解いている。⇒ **2 本目の workflow を作らず、その job の
1 段として** `scripts/data-refresh.mjs` が期限の来た束を取り直し、同じ PR に載せる。

- **名簿は宣言から発見する。** builder の記録が `autoRefresh: '<無人で走らせてよい理由>'` を述べていれば
  名簿に載る。⚠ 門（`refresh-safe`）は、規則 `update-failure` に確実でも疑いでも名指される builder と、
  周期が `static` / 無しの束からのその宣言を拒む。
- **期限は束自身の宣言された周期**（§4.4 と同じ `freshness()`・同じ `AGING_AT`）。`aging` か `stale` なら
  走る。job は 1 日 2 回訊くだけで、月 1 の上流は月 1 回しか訊かれない。shallow clone では日付を
  GitHub の履歴（`main` でそのパスを最後に変えたコミット）に訊く。**どちらでも日付が読めなければ
  走らせる**——「新しいか分からない」は「新しい」ではなく、名簿の builder は確かめられないものを書かない。
- **失敗した builder は束をそのままにする**（書かずに非 0 で終わる）。`::warning::` を出して次へ進む。
  再試行はしない——12 時間後の次の定期実行が、別の試みである。

| 載せたもの（2026-09-30） | 理由 |
|---|---|
| `build-spacecraft.mjs`（Horizons） | 20 件前後の要求・鍵なし。全応答を確かめ、FLEET の全機が返ったときだけ書く |
| `build-smallbodies.mjs`（SBDB） | 90 件前後の間隔を空けた要求・鍵なし。行の無い一括検索を拒み、床（100 天体）を書く前に訊く |
| `build-deepsky.mjs`（SIMBAD） | TAP 4 本・鍵なし。状態・JSON・`data` 配列を確かめ、床（80 天体）を書く前に訊く |
| `probe-gibs-range.mjs`（GIBS） | タイル要求のみ・鍵なし。200 と 404 だけが答えで、それ以外は書く前に止まる |
| `build-who-don.mjs`（WHO） | 公開 API へのページ要求 36 件前後・鍵なし。全ページの状態を確かめる |

| 載せなかったもの | 理由 |
|---|---|
| `build-osm-sparse.mjs`・`rail/*` | 公開 Overpass への世界規模の重い問い合わせ。フォールバックの mirror 2 本は実測で無応答（§4.5） |
| `build-hist-*`・`build-border-detail.mjs`・`build-histnames.mjs` | 数十 MB 〜 数百 MB・実行に長時間。歴史地図は機械的検証だけで出荷しない（`.agents/rules/historical-verification.md`） |
| `build-gazetteer*.mjs`・`build-histcities-homonyms.mjs` | GeoNames の dump は数百 MB |
| `build-subcables.mjs` | 海底の経路探索を含む重いパイプライン |
| `build-airports`・`build-mobility`・`build-health`・`build-country-facts` | パンデミック・国カードの入力。値が変わるとシミュレーションの結果が変わるので、人が差分を読む |
| `build-npp-registry.mjs`・`companies/*`・`build-elections.mjs`・`build-whs.mjs` | Wikidata / 各国の出典から選択・結合規則で組み立てる。差分に判断が要る |
| `build-volcanoes.mjs`・`build-culture.mjs`・`build-language.mjs`・`build-planet-data.mjs`・`build-moons.mjs` | この回は応答の検証（状態・床・スキーマ）を読み通していない——読んで確かめるまで載せない。周期も 1 か月以上で、無人化の利益が小さい |
| 周期が `static` の束 | 期限が来ない |

---

### 4.7 保存 — 「回線なしで使えるよう端末に写してよいか」（規則 `offline-declared`）

持ち歩ける地図（`js/offline-maps.js`）は地域のファイルを読者の端末に**先に**保存する。供給元の規約がそれを許すかは**規約の事実**で、
1 つのホストに 1 行あるこの台帳（`scripts/outbound-hosts.json`）に**述べる**:

```json
"offline": { "allowed": true, "kind": "terrain-dem", "pathPrefix": "/terrarium/",
             "basis": "https://registry.opendata.aws/terrain-tiles/", "why": "…", "whyJp": "…" }
```

- ⚠ **述べていないホストは保存しない。沈黙は許可ではない。** ページは `data/offline-sources.json`（行から**導出**。
  `scripts/offline-sources.mjs --write`）だけを読み、手書きの許可一覧を持たない。
- ⚠ **許可はホスト全体ではなく、その行が名指す path 接頭辞に対してだけ。** path 形式の S3 の窓口は世界中のバケットを配る。
- **「いいえ」も述べる**（`allowed:false`・規約の URL と理由）。読者は「保存しないもの」を**その理由つきで**ダイアログで読む。
  実測（作業時）: OpenFreeMap の利用規約 User Conduct は「許可なく自動的な方法でサービスからデータを収集しようとしない」ことを求める
  ＝地域の事前保存は自動収集なので `allowed:false`。AWS Terrain Tiles は AWS Open Data の公開バケットで、登録ページが一括取得の道具を挙げ、
  ライセンス（tilezen/joerd attribution.md）は帰属表示を求めるのみ ＝ `allowed:true`。Esri・CARTO などは**誰も書いていない**ので保存しない。
- IntMap 自身が配るファイル（`data/`・`assets/`）は行を要らない——サイトの持ち物で、配った相手本人が持つだけで何も広げない。
- 門: `outbound-hosts.mjs` の `check`（④）が、basis（https の規約 URL）・理由（en と jp）・kind が無い／許可に pathPrefix が無い／
  リクエストされないホストに書いてある、を拒み、`checkRepository` が `data/offline-sources.json` が台帳の導出と一致することを測る。
  ⚠ 規約は変わる——`basis` を開き直した日が分かるよう、変えるときは開発記録に日付を残す。

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
- **上流の中身の変化を見るのは 1 本だけ**（`build-hist-eras.mjs --check-upstream`）。残りの builder の
  上流が黙って変わっても誰も気づかない（memory `intmap-discovered-list-is-a-photograph` と同じ形）。
  §4.5 の死活は**ブラウザが話すホスト**だけを訊き、**builder の上流**（SIMBAD・SBDB・Horizons など）の
  死活は、名簿に載った builder が走るときに builder 自身が確かめるだけである。
- **周期の多くは推定である。** `scripts/lib/upstream-cadence.mjs` の `observed` が「estimate」と
  述べている値は、測れば置き換える。
- **`source priority` は値になっていない。** 同じ事実の複数上流は主題ごとの散文 ladder として
  `js/world-packs.js`・`js/time-borders.js`・`js/reference-data.js` に埋まっている。`FACETS` に
  `precedence.*` の欄はあるが、**述べている実装はまだ無い**。
- **ホスト全体が実行時の式で組み立てられる URL は、通信先の規則から見えない**
  （`'https://' + prof[0] + '/route/…'` の OSRM、511 各州のカメラ網など）。門は件数と場所を
  note として毎回印字し、推測で埋めない。そのホストが `https://` の無い裸の文字列として
  書かれている限り、発見の段は拾えない。
- **通信先の規則は「要求しうる」を測り、「到達しうる」は測らない。** 到達できないコードの中の
  ホストも台帳に載る（実測で r.jina.ai を呼ぶ記事リーダーは入口が無い——`js/article-reader.js`
  の冒頭）。§4 はそれを述べ、到達するかどうかは述べない。
