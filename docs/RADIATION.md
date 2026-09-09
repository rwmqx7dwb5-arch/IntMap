# IntMap — 実測放射線 (Measured radiation)

> **この文書が正本なのは**「どの観測網の値を、どのライセンスで、どの単位で、どこまで遡って
> 出しているか」と、**なぜ EURDEP を使っていないか**。
> レイヤーの実装は [`FILES.md`](FILES.md) の `radiation-layer.js`、上流ごとの取得と正規化は
> `supabase/functions/_shared/radiation-sources.js`（**機械が持っている正本**）。
> ⚠ 拡散シミュレーション（`js/sims.js` の `IntMapRadiation`）は**別物**。§1 を読むこと。

---

## 1. 「実測」と「シミュレーション」は別のレイヤーである

IntMap には放射線に関するものが 2 つあり、混ぜてはならない。

| | 実測放射線（本文書） | 放射性プルーム simulation |
|---|---|---|
| 何か | 地面に置かれた測定器が**実際に読んでいる値** | 風の場の上で**material がどこへ行くかの模型** |
| どこ | `js/radiation-layer.js` / `window.IntMapRadiationObs` | `js/sims.js` / `window.IntMapRadiation` |
| Atlas | `map.radiation` / `data.radiationNear` | `sim.radiation` |
| 量 | 周辺線量当量率 H\*(10) ほか（§3） | Cs-137 等の地表沈着と、そこから換算した µSv/h |
| 色 | §4 の 1 本の尺度 | `js/sims.js` の `ZONES`（Chernobyl の 40/15/5/1 Ci/km²） |

⚠ **配色を共有してはならない。** 一方は観測、他方は仮説であり、同じ色で描けば読者は
区別できない。⚠ **Atlas は実測の問いに模型で答えてはならない**（`js/atlas-catalog-text.js`
の該当ブロックが planner にそう書いてある）。

**両者は連結している**——`IntMapRadiationObs.near(lat,lon,km)` と Atlas の `data.radiationNear`
が「その地点の周りで実際に何が読まれているか」を返すので、
**原発 → 実測線量 → 風 → 拡散** が 1 本の鎖になる。

---

## 2. なぜ EURDEP を使っていないか

欧州の当然の出典は JRC の **EURDEP**（約 5,500 局・毎時・最大 35 日）。**使っていない。**
理由は 2 つあり、どちらも意見ではなく実測である（2026-09-09）。

### 2.1 技術的に取れない

- 値を返す唯一の公開経路は `redata.jrc.ec.europa.eu/gis/` の **OGC WPS**
  （`PointGDRv4` / `HexBinGDRv4`、GeoJSON 出力）。**全変種が 503**。
  同ホストの `/oss/` `/chart/` は 200 なので、**WPS だけが落ちている。**
- 生きているのは ①観測局レジストリ（Atom・**6,259 局**・**値は 1 つも無い**）
  ②`/api/dates`（時刻だけ）③局別の**チャート PNG**（＝画素）。
  `?format=json` を付けても同じ PNG が返る。
- その PNG の中身も**2024 年 5 月で止まっている**（Atom の `updated` も全局 2024-05-06）。
- **35 日遡れる Advanced 側は CAPTCHA の内側。** `eurdep.jrc.ec.europa.eu` は EU Login 必須。

### 2.2 ライセンス上も出せない

同意画面（`remap.jrc.ec.europa.eu/Consent/Simple.aspx`）の原文:

> All data that is exchanged via EURDEP are subject to copyright of the original data provider
> and cannot be used for other purposes, including scientific research, without their prior
> written agreement.

第三者サイトでの表示について**許可とも禁止とも書いていない**（"other purposes" が定義されて
いない）。**オープンデータではないことだけは明確**なので、書面同意なしには踏めない。

### 2.3 ⚠ 取れてしまう迂回路があり、それも使っていない

ドイツ BfS のオープンデータ WFS には **`opendata:eurdep_latestValue`**（**3,633 局・44 か国**・
µSv/h・座標つき・**CORS `*`**）が実在し、**叩けば 200 で返る。**

**使わない。** BfS 自身の利用条件が理由を書いている——

> Daten von Drittanbietern stehen unter der jeweiligen Lizenz des Datenanbieters.
> （第三者提供のデータは、当該提供者のライセンスに従う。）

つまり BfS の DL-DE/BY-2.0 は**この層には及ばない**。元の各国提供者の著作権は鏡を通っても
生き残る。**取得できることは、表示してよいことではない。**

---

## 3. 使っている観測網

**一覧の正本は `supabase/functions/_shared/radiation-sources.js`**（各 provider が id・出典表記・
ライセンス・上流の単位・量・遡行日数・CORS の要否を自分で宣言する）。
ここに数を書き写さない——`npm run check:docs` が実体と照合する。

各 provider が満たすこと:

1. **再配布が明示的に許されているライセンスである**こと。「たぶん大丈夫」は採らない。
2. **出典表記が義務なら、それを機械可読に持っている**こと（凡例が実際に印字する）。
3. **上流が名乗った量をそのまま持つ**こと。H\*(10) と「ambient gamma」と air kerma を
   同じものとして扱わない。
4. **遡行できる深さを自分で申告する**こと（§5）。

⚠ **オランダ RIVM の集合は 2011 年の年平均**であって現在値ではない（RIVM 自身が
「実測値表示は工事中、最新は EURDEP を見よ」と告知している）。**現在値の集合に混ぜない。**

### 3.1 単位と量の正規化

上流は µSv/h・nSv/h・µGy/h をばらばらに使う。**サーバー側で nSv/h に 1 回だけ正規化する**
（`toNanoSvH()`）。クライアントに出典ごとの分岐を持ち込まないため。
⚠ **知らない単位は例外にする。** 黙って 0 にしない。

各レコードは**上流が名乗った量**を保持し、ポップアップがそれを印字する。
「単位を揃えた」は「同じものを測っている」ではない。

---

## 4. 色の尺度（1 本だけ）

**nSv/h の絶対値**で、固定。取得した集合の分布から作らない——それだと 1 時間ごとに世界の色が
変わり、2 枚のスクリーンショットが比較できなくなる。

| 段 | 由来 |
|---|---|
| 50 / 100 nSv/h | 自然の地殻放射線の帯。**実測（2026-09-09）**: CC0 の RIVM 151 局の年平均は **56.0–116.0 nSv/h**、RIVM 自身が国内の範囲を 55–100 nSv/h と記述。BfS の稼働 1,582 局は **0.047–0.226 µSv/h** |
| 200 nSv/h | **RIVM が公表している「RIVM へ自動警報」の閾値** |
| 1,000 nSv/h | **スイス NADAM が自網のプローブについて公表している警報閾値**（⚠ NADAM の**データ**は使っていない——オープンライセンスが無い。ここでは公表された事実として引用しているだけ） |
| 2,000 nSv/h | **RIVM が公表している「安全地域へも通報」の閾値** |

**失効条件**: いずれかの provider が別の行動閾値を公表したら、この段はその時点で誤りになる。
**正本**: この表と `js/radiation-layer.js` の `RAMP`。`tests/r574-checks.test.mjs` が両者の一致を測る。

⚠ **50–200 nSv/h は警告ではない。** 地球上のほぼ全ての健全な観測局がこの帯に入る。

---

## 5. 時間軸（Chronos）

⚠ **遡行の深さは provider のものであって、IntMap が決めた数ではない。**
各 provider が `historyDays` を申告し、`radiation-feed?mode=day&iso=` はその日に届く provider
だけで答え、**届かなかった provider を `sources[]` で名指しする。**

だから過去へ行ってもレイヤーは白紙にならない——**その年まで遡れる観測網だけが出て、
他は「そこまで遡れない」と凡例に出る。**

⚠ **校正の変更をまたぐ比較はできない。** BfS は 2025-07-01 に全網を再計算しており、
**放射線が変わっていないのに値が 14–25% 上がっている。** その日をまたぐドイツの系列には
人工的な段差がある。

---

## 6. ⚠ 値を読むときの注意（凡例と Atlas が読者に必ず伝えること）

1. **大半は未検証データとして公開されている。**
2. **降雨だけで最大 3 倍まで上がる**——ラドン子孫核種が雨で洗い落とされて地表に沈着するため
   （BfS の記述）。数時間で戻る。
3. したがって **1 局が高いこと、近くの複数局が同時に高いことは、放出の証拠にならない**
   （近い局は同じ天気を共有している）。
4. **点が無い国は「オープンライセンスの被覆が無い国」**であって、放射線が無い国でも
   監視が無い国でもない。⚠ 欧州はここが薄い（§2 の理由）。
5. `data.radiationNear` の「N km 以内に局が無い」は**観測網の空白についての事実**であって、
   **そこの安全についての言明ではない。**

⚠ **これらは体裁ではない。** BfS は利用条件の中で、提供データを公表する際は
「事実に即した形で提示する」よう明文で求めている（"Wir bitten darum, die bereitgestellten
Daten bei einer möglichen Veröffentlichung in sachlicher Art und Weise darzustellen."）。

---

## 7. 原発の台帳

鎖の第 1 段。**手で並べた一覧を持たない**——`data/npp.json` を
`scripts/build-npp-registry.mjs` が出典から生成する（出典とライセンスはそのファイルが持つ）。

⚠ **以前は `js/sims.js` に正規表現 12 件が埋め込まれていた**（Fukushima Daiichi ほか）。
`.agents/rules/no-ad-hoc-hardcoding.md` §1 が禁じる「名前の埋め込み一覧」そのもので、
13 件目を尋ねられた瞬間に黙って外れた。
