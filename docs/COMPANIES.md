# IntMap — 企業アトラス (Company atlas)

> **この文書が正本**: 企業プロフィールと世界の拠点（facility）の**データモデル・出典規約・
> 生成パイプライン・カバレッジ判定**。UI の置き場所は `Architecture.md` §8、ファイル台帳は
> [`FILES.md`](FILES.md)、レイヤーの描画は [`MAP-LAYERS.md`](MAP-LAYERS.md)。
>
> ⚠ **ライブ時価総額（Yahoo）と curated な 190 行の表は `js/companies.js` が正本**であって、
> ここではない。この文書が足すのは**その上に載る恒久的なプロフィールと拠点**。

---

## 1. 何のためにあるか

企業をクリックしたら、**その企業そのもの**と、**世界のどこで実際に活動しているか**が
1 枚で分かること。推測でそれらしい数値を埋めることではない。

したがって全体を貫く規則は 1 つ:

> **公表されていない事実は、欠損として扱う。埋めない。**

架空の工場・推測の CEO・出所不明の座標・年度を書かない財務値は、**この文書の違反**であり
`npm run check:companies` が落とす（§7）。

---

## 2. 母集合 — どの企業を載せるか

`data/companies/manifest.json`（`scripts/companies/discover.mjs` が生成）が**識別子の一覧**。
事実は 1 つも入っていない——「この行はWikidata のこの項目のことだ」しか書かない。

2 つの母集団を混ぜずに持つ:

| 出自 | 何か | 何件 |
|---|---|---|
| `curated` | **`js/companies.js` の `RAW` 表を parse したもの**（写しではない） | 190 |
| `discovered` | Wikidata が「大きい」と報告する企業を、**地域と業種の割当**で選んだもの | 350 |

⚠ **`curated` を写経しない。** `scripts/companies/manifest.mjs` の `curatedRows()` が
`js/companies.js` を実際に読む。2 つの表が食い違いようがないのはそのため
（食い違いは `npm run check:companies` の ① が落とす）。

**割当 (quota)** は `discover.mjs` の `REGION` / `REGION_QUOTA` / `PER_SECTOR_IN_REGION`。
指示書 §8 が挙げる地域と業種を跨がせるために存在する——無いと母集合は米国のテック企業になる。

⚠ **順位付けは `(国 × 報告通貨)` の中でだけ行う。** 為替レートを持ち込んで 2 社を比べない
（為替を使えば、出典に無い数字が選抜の根拠になる）。1 つの世界共通の売上下限は
**豊かな国のフィルタ**なので、割当に届かない地域には**国ごとの低い下限で 2 回目**を回す
（`poolForCountries`）。⚠ 40 か国を 1 つの `VALUES` に入れると WDQS は毎回 502 を返す——**1 国 1 クエリ**。

---

## 3. データの置き場所

| ファイル | 何 | いつ読むか |
|---|---|---|
| `data/companies/manifest.json` | 識別子の一覧（**ビルド時だけ**） | 実行時には読まない |
| `data/companies/index.json` | **軽い索引** — 1社1行、一覧・検索・地図の HQ 点に必要な最小限 | Companies を初めて開いたとき **1 回**（遅延） |
| `data/companies/profiles/<id>.json` | **1社ぶんの全プロフィール＋全拠点** | **その企業を選んだときだけ**（遅延・メモリキャッシュ） |

⚠ **起動時に読むものは 1 つも無い。** `js/company-data.js` は `js/lazy-modules.js` 経由の遅延
モジュールで、`src/main.js` は import しない（`Architecture.md` §3 の遅延の 4 つの門）。
索引 1 枚とプロフィール 1 枚しか要らないので、**500 社ぶんの拠点をブラウザへ配ることは無い。**

`data/companies/profiles/` は `scripts/asset-report.mjs` の **prefix** 分類に載る
（`js/company-data.js` が `'data/companies/profiles/' + id + '.json'` と綴る）。

---

## 4. スキーマ

### 4.1 索引 `data/companies/index.json`

```jsonc
{
  "schema": 1,
  "generatedAt": "2026-08-23",
  "companies": [
    {
      "id":  "apple",            // 安定 slug。プロフィールの URL であり、保存されたビューが指す名前
      "n":   "Apple",            // 一般的な企業名（英）
      "ln":  "Apple Inc.",       // 正式名（あれば）
      "loc": { "ja": "アップル", "zh-hant": "蘋果公司" },   // 現地語名（あるものだけ）
      "cc":  "USA",              // ISO-3166-1 alpha-3
      "sec": "tech",             // js/tables.js の CO_SECTORS のキー
      "tk":  "AAPL",             // curated 由来のみ。無ければ ""
      "dom": "apple.com",
      "hq":  [-122.009, 37.3348],// 本社 [lon, lat]。無ければ null
      "hqc": "Cupertino",        // 本社の都市名（英）
      "fac": 42,                 // この企業のプロフィールが持つ拠点の数
      "ctry": 17,                // 拠点が存在する国の数
      "cov": "full",             // §6 のカバレッジ段位
      "wd":  "Q312"
    }
  ]
}
```

### 4.2 プロフィール `data/companies/profiles/<id>.json`

```jsonc
{
  "schema": 1,
  "id": "apple",
  "generatedAt": "2026-08-23",

  "identity": {
    "name": "Apple", "legalName": "Apple Inc.",
    "local": { "ja": "アップル", … },
    "country": "USA", "sector": "tech",
    "industry": ["consumer electronics", "software"],   // Wikidata P452 のラベル（分類はしない）
    "founded": "1976-04-01",        // 精度どおり。"1976" / "1976-04" もある
    "website": "https://www.apple.com/",
    "logo": "https://commons.wikimedia.org/…",           // P154。無ければ省略
    "legalForm": "corporation",
    "listed": true,
    "exchanges": [ { "name": "Nasdaq", "ticker": "AAPL" } ],
    "isin": "US0378331005", "lei": "HWUPKR0MPOU8FGXBT394",
    "wikidata": "Q312"
  },

  "leadership": [ { "role": "CEO", "name": "Tim Cook", "since": "2011-08-24" } ],

  // ⚠ 数値は必ず「値・通貨・年度／基準日・出典」の 4 点セット。どれか 1 つでも
  //    欠けたら、その項目ごと出さない（§7 の検査 ⑨⑩）。
  "scale": {
    "employees":       { "value": 164000, "asOf": "2024", "src": 0 },
    "revenue":         { "value": 391035000000, "currency": "USD", "fiscalYear": "FY2024", "src": 1 },
    "operatingIncome": { "value": 123216000000, "currency": "USD", "fiscalYear": "FY2024", "src": 1 },
    "netIncome":       { "value":  93736000000, "currency": "USD", "fiscalYear": "FY2024", "src": 1 },
    "totalAssets":     { "value": 364980000000, "currency": "USD", "fiscalYear": "FY2024", "src": 1 },
    "marketCap":       { "value": 3400000000000, "currency": "USD", "asOf": "2026-07-20", "src": 2 }
  },

  "business": {
    "products": ["iPhone", "Mac"], "services": ["iCloud"], "brands": ["Beats"],
    "segments": []
  },

  "org": {
    "parent":      { "name": "…", "id": "…", "wikidata": "Q…" },   // 無ければ null
    "subsidiaries":[ { "name": "Beats Electronics", "country": "USA", "id": null, "wikidata": "Q…" } ],
    "affiliates":  []
  },

  // 「販売されている」ではなく「法人・拠点が実在する」国だけ。
  "presence": [ { "cc": "JPN", "facilities": 3, "kinds": ["office", "rnd"] } ],

  "facilities": [
    {
      "id": "apple-park",
      "name": "Apple Park",
      "type": "headquarters",           // §5 の語彙
      "group": "hq",                    // 地図の色分け 6 種
      "cc": "USA", "region": "California", "city": "Cupertino",
      "address": "One Apple Park Way",  // 公表されているときだけ
      "lon": -122.009, "lat": 37.3348,
      "precision": "exact",             // exact | city | region  ⚠ §5.2
      "opened": "2017", "closed": null,
      "status": "operating",            // operating | closed | announced | under_construction
      "role": "corporate headquarters",
      "products": [], "research": [],
      "employees": null,
      "src": 0
    }
  ],

  "sources": [
    { "name": "Wikidata", "url": "https://www.wikidata.org/wiki/Q312", "retrievedAt": "2026-08-23" },
    { "name": "SEC EDGAR company facts", "url": "https://data.sec.gov/…", "retrievedAt": "2026-08-23" }
  ]
}
```

⚠ `src` は `sources[]` の**添字**。文字列 URL を各項目に書き写さない
（500 社ぶん重複すると索引より大きくなり、片方だけ古くなる）。

---

## 5. 拠点 (facility)

### 5.1 種別の語彙

`type` は**後から足せる**。地図の色は `group` の 6 種だけを見るので、種別を増やしても
凡例は増えない（指示書 §6「色・アイコンを増やしすぎない」）。

| `group` | `type` |
|---|---|
| `hq` | `headquarters` `secondary_headquarters` `regional_headquarters` |
| `office` | `office` `branch` `subsidiary_office` `sales_office` |
| `factory` | `factory` `assembly_plant` `refinery` `smelter` `shipyard` `brewery` `mine` `power_plant` |
| `rnd` | `research` `rnd_center` `tech_center` `laboratory` `test_facility` `design_center` |
| `logistics` | `logistics` `distribution_center` `warehouse` `data_center` `port_terminal` |
| `other` | `store` `museum` `training_center` `other` |

⚠ **`store` は `other`。** 店舗網は §8 の別経路で、拠点と同じ扱いにしない。

### 5.2 位置の精度は必ず言う

`precision` は 3 値:

- `exact` — その施設そのものの座標が出典にある
- `city` — 出典は市までしか言っていない。**座標は市の代表点**
- `region` — 州・県までしか分からない

⚠ **`city` / `region` を `exact` として出さない。** 「工場」と称して適当な座標を置くことは
指示書 §4 が名指しで禁じている。UI は `exact` 以外に**必ず注記を出す**
（`js/company-panel.js` の `precisionNote`）。

### 5.3 どこから来るか

Wikidata の**一段の**所有・運用関係（`P127` 所有者 / `P137` 運用者 / `P749` 親組織 /
`P1830` 所有物）と、**直下の子会社 1 段**だけ。

⚠ **推移閉包 (`P749*`) を使ってはならない。** Toyota で実測: `?mid (wdt:P749|wdt:P127)* ?root`
は JR 東海に到達し、**東海道本線の駅が全部** Toyota の「拠点」になった（300 行の上限まで駅）。
一段＋型ゲートなら 22 件で、うち実際の拠点は 6 件。

**型ゲート**は `scripts/companies/facility-types.mjs` の許可リスト（`P279*` の閉包を
ビルド時に 1 回展開してキャッシュ）。許可されない `P31` の項目は拠点として採らない——
これが博物館・鉄道駅・都市そのものを弾く。

---

## 6. カバレッジ段位 (`cov`)

指示書 §9 の「full coverage」を機械的に判定する。`scripts/companies-audit.mjs` が数える。

| 段位 | 条件 |
|---|---|
| `full` | 下の 8 つが**すべて**ある: 基本プロフィール / 本社 / 公式サイト / 業種 / 設立 / 代表者 / 従業員 / 主要財務（売上または純利益）/ **かつ** `facilities` に `hq` 以外の group が 2 種以上 |
| `core` | 基本プロフィール・本社・公式サイト・業種があり、拠点が本社を含めて 2 件以上 |
| `basic` | 基本プロフィールと本社がある |
| `stub` | それ未満（索引には出るがプロフィールは薄い） |

⚠ **段位は「埋まっている率」ではなく「何が公表されているか」の観測結果。**
非上場企業が財務を公表しないのは欠損であって不備ではない——だから `cov` を上げるために
値を作ってはならない。

---

## 7. 検査 — `npm run check:companies`

`scripts/companies-audit.mjs`。`npm test` に内包。落とす条件:

| # | 検査 |
|---|---|
| ① | `js/companies.js` の `RAW` の ticker が**全部**索引にある（curated を落としていない） |
| ② | company id の重複 |
| ③ | facility id の重複（企業内） |
| ④ | ticker の重複 |
| ⑤ | ISO-3 が実在しない国コード |
| ⑥ | 緯度が [-90, 90] の外／経度が [-180, 180] の外 |
| ⑦ | 座標が `0,0`（「値が無い」を「大西洋のギニア湾」と書いたもの） |
| ⑧ | 企業名・施設名が空 |
| ⑨ | 不正な URL（`website` / `sources[].url`） |
| ⑩ | 出典を持たない施設 |
| ⑪ | 通貨を持たない財務値 |
| ⑫ | 年度／基準日を持たない財務値 |
| ⑬ | 本社が無い企業（`cov` が `stub` より上なのに `hq` group の施設が 0） |
| ⑭ | プロフィールに属さない施設（orphan） |
| ⑮ | 同一企業内で座標が完全一致する別施設（重複投入） |
| ⑯ | `closed` があるのに `status` が `operating` |
| ⑰ | 索引の `fac` / `ctry` / `cov` がプロフィールの実体と一致するか |
| ⑱ | `precision` が語彙の 3 値のいずれか |
| ⑲ | 索引に載っているのにプロフィールのファイルが無い（およびその逆） |
| ⑳ | 主要企業（§9 の代表 19 社）の coverage 不足 |

`--report` で企業ごとの coverage 表（指示書 §14 の形）を出す。

---

## 8. 大量店舗を持つ企業

Walmart / McDonald's / Starbucks 等の**全店舗網は、拠点と同じ経路で配らない**。
プロフィールが持つのは本社・地域本社・工場・研究所・物流施設。

**全店舗データは、正確なものが公表されている場合にだけ**、別ファイル
`data/companies/stores/<id>.json` として持ち、**利用者が「全店舗を表示」を押したときだけ**
読み、クラスタリングして描く。

⚠ **架空の店舗位置を生成しない。** 出典が無い企業には、そのボタンを出さない。

---

## 9. 実データで確かめる代表企業

指示書 §21 の一覧。`scripts/companies-audit.mjs` の検査 ⑳ がこの 19 社を名指しで見る。

Apple / Microsoft / Amazon / Toyota / Volkswagen / Tesla / TSMC / Samsung Electronics /
ASML / Siemens / Shell / Saudi Aramco / Nestlé / Novo Nordisk / Pfizer / JPMorgan Chase /
Walmart / Airbus / Boeing

「Apple では動くが製造業では役に立たない」を防ぐための一覧なので、**Toyota・Samsung・
TSMC・Siemens で工場と R&D が実際に出ることを見る。**

---

## 10. 出典の優先順位

1. 企業公式サイト
2. Annual Report / 10-K / 20-F / 有価証券報告書
3. 政府・証券規制当局・企業登記（**SEC EDGAR company facts** を実装済み）
4. **GLEIF**（LEI と法的所在地）
5. **Wikidata**（識別子・本社・業種・子会社・拠点の初期取得）
6. その他の信頼できる二次情報

⚠ **Wikipedia 本文の大量スクレイピングはしない。Google Maps 等の規約に反する取得もしない。**
現在の実装が実際に叩くのは **WDQS・wbgetentities・data.sec.gov・api.gleif.org の 4 つだけ**。

⚠ **ブラウザは 1 つも叩かない。** 上流は全部ビルド時。実行時に企業クリックで外部 API を
呼ぶのは、既存の Yahoo 価格取得（`js/companies.js`）だけで、これは今回変えていない。

---

## 11. パイプライン

```bash
node scripts/companies/discover.mjs --target 540   # 母集合を決める → manifest.json
node scripts/companies/build.mjs                   # 事実を取る    → index.json + profiles/
node scripts/companies-audit.mjs --report          # 検査とカバレッジ表
```

`build.mjs` は `.cache/companies/`（追跡対象外）に上流の応答を貯めるので、
2 回目以降はネットワーク無しで走る。

### 11.1 OpenStreetMap が落ちているとき

⚠ **「OSM に拠点が無い」と「OSM に訊けていない」は別の主張で、片方だけがこちらのもの。**

Overpass の公開インスタンスは落ちる（実測: このラウンドの最中に `/api/status` すら
接続を拒否するようになった）。そのとき `build.mjs` は:

1. **12 回連続で失敗したら、その run では以降の問い合わせをやめる**（`BREAK_AFTER`）。
   落ちた上流に 533 回×リトライ梯子で当たり続けるビルドは終わらず、**終わらないビルドは
   「取れなかった」と言うビルドより悪い**——誰も出荷できないから。
2. 取れなかった企業のプロフィールに **`osmPending: true`** を立てる。
3. 監査が件数を報告する。

**再実行すれば埋まる。** キャッシュ済みの企業は数秒で素通りし、`osmPending` の企業だけが
問い合わせに行く。**コードの変更は要らない。**

⚠ **キャッシュの鍵は「訊いた質問」だが、データの鍵は「企業」である。** 問い合わせの形を
（8社まとめた正規表現 → 1社ずつの完全一致に）変えた瞬間、**保存済みの応答はどれも鍵が一致
しなくなり**、300社ぶんの取得済み施設が上流の停止中にディスクの上で眠っていた。だから
`osmFacilities()` は**何かを訊く前に、これまでに保存した応答を全部読んで QID で索引し直す**。
地物は自分がどの企業のものかを持っている——**どの質問がそれを返したかは、その事実の一部ではない。**
⚠ ただしこれは `osmPending` を消さない。古いバッチに地物が無かった企業は、
「訊かれて空だった」のか「訊かれていない」のかを区別できないため。**その企業自身の完全一致
クエリが走ったときだけ** pending が外れる。

⚠ OSM の transport は **curl**（`fetch` はフォールバック）。実測: Node の `fetch` が
`overpass-api.de` に 11 秒で connect timeout する一方、**同じ URL に同じ瞬間 curl は 2.1 秒で 200**
を返した。⚠ 問い合わせは **1 社 1 クエリ・完全一致**（`="Q95"`）。正規表現（`~"^(Q1|Q2|…)$"`）は
タグ値の索引を使えず、**1 クエリ約 2 分**かかる（完全一致は 2.1 秒。実測）。
