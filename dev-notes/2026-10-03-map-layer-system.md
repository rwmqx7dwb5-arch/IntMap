---
title: 国別指標（国の統計を 1 つのレイヤーで）と年鑑（その年の世界）——同じ系列を塗る行を宣言から発見し、時間の扱いを 1 つに
date: 2026-10-03
---

〈依頼〉「修正・穴埋めではなく構造改革とイノベーション。整形ではなく造形。足し算。全権を委任する」の地図・レイヤー分野。
途中で調整役から 3 点が加わった——⑴ 世界銀行の指標と国別統計を 1 つの「国別指標」セレクタに ⑵ 同じ指標を引く重複
レイヤーを保全したまま 1 つの指標として扱い、時間の扱いを年を動かせる側に揃え、Atlas の別名を両方の ID に届かせる
⑶ 同じ指標を持つレイヤーの組を manifest から発見して報告する門。作った商品は 2 つ: **国別指標**と**年鑑**。

## 0. 測った（着手前）

| 何 | 着手前 | 意味 |
|---|---|---|
| 国の統計の行 | 世界銀行の行 61（`js/wb-layers.js`）＋5（`js/layer-packs.js`）＋国の表 6（`js/data-layers.js`・`js/layer-pkg-alliances.js`）が 11 の棚に散らばる | 何を見たいかより先に、どの棚に置かれたかを知っていなければ探せない |
| 同じ系列を塗る行 | 平均寿命 SP.DYN.LE00.IN（`beta-dl-lifeexp`／`bx-wblife`）・失業率 SL.UEM.TOTL.ZS（`beta-dl-unemp`／`bx-wbunemp`）・インターネット IT.NET.USER.ZS（`beta-dl-internet`／`bx-wbnet`）の 3 組。疑われた年降水量／農地率は AG.LND.PRCP.MM と AG.LND.AGRI.ZS で別の系列 | 木の中のどこも「組である」と述べていなかった |
| 組の時間 | `bx-*` は時計の年を塗る（world-at-time）。`beta-dl-*` は自分の年（`wbYr`）で、時計が 1995 年でも系列の既定年を塗った。`js/layer-time-decl.js` は `beta-dl-lifeexp` を「2022 年のスナップショット」、残りを「国ごとの最新値」と宣言（実装は #R266 から系列全体を読み、選んだ年を塗っていた） | 同じ数を述べる 2 行が、時間について違うことを述べていた。宣言は実装と食い違っていた |
| Atlas の語 | 'life expectancy' → `beta-dl-lifeexp` だけ。`bx-wblife` が点いていると「消して」は片方を残して成功と報告する | 語が名指すのは行ではなく指標 |
| 年の中の変化 | Chronos は日単位の国境を描くが、「1920 年に何が変わったか」は国境ステッパーで 1 日ずつ歩かないと分からない。記録自身は 1920 年に 14 の変化日を持つ | 事実は全部束の中にあり、読めなかった |

## 1. 何を作ったか

**宣言の `measures`（`scripts/lib/layer-descriptor.mjs`）と、その主張を拒める読み手（`scripts/lib/indicator-series.mjs`）。**
行がどの上流の系列を塗るかを `<publisher>:<series>` で述べる（70 行）。読み手はコードから**実際に塗る系列**を発見する
（世界銀行の API ホストを含むファイルの行表と、国の表の `applyChoro`）。`scripts/layer-descriptors.mjs --check` が両方向を
見る——コードが塗らない主張と、**コードが塗るのに述べていない系列**。後者が「新しい重複は名乗らずには入れない」。
`--report` が組を印字する。⚠ 行の特定は綴りでは決めない: 最初の版はキー `precip` で `dl-precip`（IMERG）に世界銀行の
系列を付けてしまった。同じファイルが組み立てる id（`'beta-dl-'+key`）とリテラルの id の中で 1 つに決まるときだけにした。
⚠ 最初の版はキーの無い 3 行（`beta-dl-unemp` など）を黙って飛ばしていた——逆向きの検査がそれを 3 件の赤で示した。

**時間の統一。** `js/layer-packs.js` の世界銀行の行は `wbClockYear` で時計の年を塗り（`js/wb-layers.js` の `clockYear` と
同じ規則）、読んだ年を時間カーネルへ報告し、時計の変化で塗り直し、凡例の年の選択は時計を動かす。宣言は `WBP`
（`WB` と同じ `series`、追従と報告の場所だけが違う）。注記の「2022」を消した（凡例が塗っている年を述べる）。汚職指標
（source 3）は系列の読み手が答えないので従来どおり 2023 年の 1 回読み・宣言も `asOf(2023)` のまま。

**国別指標 `bx-wbind`（`js/indicator-browser.js`）。** 人口の棚の先頭。凡例の中で検索（英語・日本語・系列コード）と分野
（指標の行が立つ棚）で選ぶ。世界銀行の系列は `choroOn` を `wbind` の源へ向けて塗る＝指標の行と同じ年・色・凡例・年の
選択・hover・地点の値。国の表の統計は専用の行を点けて委ね、そう述べる。一覧は写さない（行表・`measures`・棚・行のラベル）。
共有リンク `wbind`、端末に記憶、Atlas `layers.indicator`（地図に載った年・報告国数・上位と下位を系列から返す）。
`(L.base||L.id)==='wbdebt'` で IMF の穴埋めが行 id ではなく系列に付く。

**年鑑（`js/year-book.js`）。** Chronos パネル「この年を読む」と Atlas `time.yearbook`。`js/time-borders.js` の
`collectionAt`（地図が描くのと同じ呼び出し）から政体と球面上の面積、記録の `src`（新設の `recordOf(tier)`）、
`changeDates` から年の中の変化日と各日の出入り・国境の変化、`data/wars.json`、Maddison、時間カーネルの `coverage`。

## 2. 歴史考証（`.agents/rules/historical-verification.md`）

年鑑は新しい主張を作らず、地図の記録が述べていることを読ませる。それでも年と場所を名指して読んだ:
**1920 年**（CShapes を csFC と同じ規則で読む・`tests/map-layer-system-checks.test.mjs` ⑥）は 14 日——
2 月 2 日 ヒヴァが消える（ヒヴァ・ハン国の廃止、ホラズム人民ソビエト共和国の成立 1920-02）、4 月 26 日 イラク・シリア・
レバノン・ヨルダン・パレスチナが現れる（サンレモ会議 1920-04-19〜26 の委任統治の決定）、9 月 2 日 ブハラが消える
（ブハラ・アミール国の打倒 1920-09）。制度の成立・廃止と食い違うものは見つからなかった。
⚠ 6 月 28 日の Rwanda-Urundi は記録の日付として出している（国際連盟の委任統治の承認は 1922 年）。CShapes が何を
根拠にこの日を置いたかは今回確かめていない——年鑑は「記録の状態が前日と異なる日」とだけ述べ、出典を添える。
**1914 年**は第一次世界大戦（data/wars.json）の 1914 年の出来事（6 月 28 日サラエヴォ事件から）だけを出す。
上流が述べない日付は代入していない: 1689 年より前の時期ごとの 1 枚には変化の日を示さず、そう書く。Maddison は
国コード別で政体別ではないと書き、合計は「述べられた国の和」と書く。データは 1 行も変えていないので
`check:histfidelity` の 3 指標は動かない。

## 3. 確かめたこと

- `node --test tests/map-layer-system-checks.test.mjs`（14 件）——主張の両方向・組の発見と時間の宣言・変異（未宣言の
  2 行目は赤）・検索（英日・コード）・選択の排他と委任の解除・系列からの事実・年鑑の面積／1920／1914／記録の外
- `node scripts/layer-descriptors.mjs --check`・`node scripts/world-at-time.mjs --check`・`node scripts/atlas-caps.mjs --write`

## 3b. 費用（`check:perf`）と、測って見つけたこと

- **起動経路が +21.4 kB raw / +7.9 kB gzip**（帯 7.6 kB をわずかに超える）。内訳（esbuild で HEAD と比べた最小化後）:
  `js/layer-manifest.js` +2.9 kB（70 行の `measures`——読み手は遅延だが宣言は丸ごと写す規則）、`js/wb-layers.js` +2.7 kB
  （国別指標の行・塗り手・共有リンクの登録——共有リンクで開く行は起動時に在る必要がある）、`js/layer-packs.js` +0.6 kB、
  `js/news-timeline.js` +0.5 kB、`js/time-borders.js` +0.2 kB。**CSS は起動経路から外した**（年鑑と国別指標の stylesheet は
  各モジュールが最初に描くときに注入。`.ntl-yb` の 1 行だけが css/intmap.css）。Atlas の答えを組む文は `js/year-book.js` /
  `js/indicator-browser.js` に移し、`atlas-console` チャンクの超過（+8.8 kB）を解消した。
  天井は統合時に origin/main を取り込んだ木で `node scripts/perf-budget.mjs --update` により超えた 4 行だけ上げた（理由はこの節）:
  eager raw 4628.5→4651.7 kB・gzip 1523.9→1532.4 kB・brotli 1149.9→1155.9 kB、async gzip 3774.0→3799.4 kB
  （新しい遅延チャンク `year-book` 19.1 kB・`indicator-browser` 10.6 kB——どちらも最初に開いたときだけ読まれる）。
- **新しい spec は未測定のあいだ core に入り p75（41 s）で課金される**（`check:testbudget` が core 0.7 min 超過）。
  `tests/map-layer-system.spec.js` の本体の実測は 2 テストで 12〜13 s（JSON reporter・温まったサーバ・1 worker・
  11 回）。統合時に 13 s として `tests/durations.json` に記入した（統合時の再測定は 2 テストの本体 10.9 s）。core は天井内に戻るが、
  全体（87.7 min）が天井 87.5 min を 0.2 min 超える——このラウンドの spec 1 本ぶんで、余地は別の PR が作る。
- ⚠ **冷えた起動の spec で 8 回中 1〜2 回、国別指標の選択が消えた。** 記録を取って特定した: 行を点けた 2.8 s 後の
  層の状態監査（`js/data-layers.js` の post-toggle look）が、まだ塗り終えていない行を「チェックされているのに空」と読み、
  off→on で「直し」、その off が選択を消していた（`bx-wbind false` の呼び出し元が監査の `toggle-heal`）。
  監査は「行が返した要求が飛んでいる間は判定しない」（`layerInflight`）規則を既に持っていて、**`js/wb-layers.js` の行は
  一度もその要求を渡していなかった**。⇒ `choroOn` が「塗り終えた（または諦めた）」で settle する promise を返し、
  国別指標の行はそれを `layerInflight.track` に渡す。もう 1 つ: 国の表の統計を専用の行へ委ねている間は、この行の描画は
  委ね先のレイヤーであると監査が最初に読む表（`_imAuditReg`）へ述べる（`IntMapLayerAudit.owned(委ね先)`）。
  ⚠ 世界銀行の他の 61 行も同じく要求を渡していなかった（系列が届く前の 2.8 s の look で脈打ちうる）。⇒ 1 行ずつではなく、
  この module の行を配線する唯一の場所（`buildRows` の change）で `on` の返り値を `layerInflight.track` に渡す——
  `js/data-layers.js` が自分の行にしているのと同じ形。国の形の読み込みが失敗しても `choroOn` は settle する
  （`ensureGeo` が拒否で `cb(null)`。settle しない要求は行を永久に「飛行中」にして監査から外す）。
- **共有窓口（`check:surface`）に増えた辺**: `window.IntMapIndicators`（国別指標の扉——Atlas の能力と spec が読む）、
  `IntMapLayerAudit` / `_imAuditReg`（上の委任の主張）、`_registerLayerOpacity` / `_hideGenericLegend` / `_tileLegends`
  （凡例は `js/data-layers.js` の持ち物で、他の行と同じ入口から使う）、`IntMapShareState`（共有リンク）、`IntMapTimeBorders` /
  `IntMapMaddison` / `IntMapLayerTime`（年鑑が読む 3 つの記録——地図が描くのと同じ読み手であることが要点）、`IntMapWB`、
  `IntMapSafe`、`IntMapDevice`。どれも既存の持ち主の既存の入口で、新しい持ち主は作っていない。

## 4. 残したもの

- 汚職指標を系列として読む（`source=3` を系列の読み手に渡す）と、組の規則に揃えられる
- 国の表の合計特殊出生率（時計を動かすと SP.DYN.TFRT.IN）と `bx-wbfert` は同じ系列だが、国の表の現在値の出典が
  コードから辿れないので `countrystats:tfr` のままにした（主張を拒める読み手が無い主張は書かない）

## PR の CI で落ちたもの（統合前）

- **死んだ export 4 件（`js/year-book.js`）**: `openYearBook`・`closeYearBook` はファイルの中でしか呼ばれないので export を外し、
  どこからも呼ばれない `yearBookOpen` を消した。`areaKm2` は `tests/map-layer-system-checks.test.mjs` が
  `const { areaKm2 } = await import(…)` で読んでいたのに、`scripts/export-readers.mjs` の分割代入の正規表現 `\{([^}]*)\}` が
  test 本体の `{` から始まって「const { areaKm2」を名前として拾っていた。`{` を含まない形にし、回帰を置いた。
- **`globalThis.IntMapSafe` を import せずに読む 2 ファイル**（`js/indicator-browser.js`・`js/year-book.js`）に `import './safe-html.js'`。
- **台本カセット `rail-request-reached-nothing`**: `find_capability «所要時間 距離»` の答えに新しい `time.yearbook` が 8 件目として
  入る。`scripted-cassettes.mjs --write` で記録し直した（⚠ main の #909 も能力を 1 つ足すので、rebase 後にもう一度確かめる）。
- **`about.html`・`ja/about.html`**: レイヤー数 163 → 164 を `scripts/landing.mjs --write` で再生成。
- **`tests/shell-data-layers-checks.test.mjs` R289 ④**: `codeOf` が `||wbById[id]`（指標ブラウザが塗る系列）も引くようになった形を受ける。
- **`tests/layer-manifest-checks.test.mjs` ①**: 「`share` は置き換えた旧 selector と同じ」を、置き換えた日の行
  （`tests/fixtures/layer-descriptor-before.json`）に限った。`bx-wbind` は意図して共有リンクに載る新しい行で、旧 selector は何も述べない。
- **CodeQL js/incomplete-url-substring-sanitization**（`scripts/lib/indicator-series.mjs`）: 「World Bank から取得するファイルか」を
  ホスト名の部分文字列ではなく `https://api.worldbank.org/` の URL として訊く。発見される系列は同じ（`layer-descriptors --check` 164 層）。

## 統合時の性能予算（重ね直した後の build）

超えた行だけ `--update`:
- async.raw: 11518.0 kB → 11591.2 kB
- async chunk "atlas-console": 1144.2 kB → 1155.2 kB
